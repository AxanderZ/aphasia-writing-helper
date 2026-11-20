// llm.worker.js: loads a small language model once and returns
// next-word guesses. Runs in a Web Worker so the page never freezes.
//
// How it guesses: instead of asking the model to write a list (the
// few-shot prompt in the architecture), it runs the message through the
// model once and reads the model's next-token probabilities directly.
// This is the "later upgrade" from ARCHITECTURE.md section 6. With a
// 0.5B model the list prompt mostly copied its examples or repeated the
// message; the probabilities give sensible words in a single fast pass.
//
// A second, much smaller pass checks that each guess is a whole word:
// " don" becomes "don't", and pieces like " expl" are dropped.
//
// Messages in:   { type: "load" }
//                { type: "predict", id, text }
// Messages out:  { type: "status", status: "loading", progress }   (0–100)
//                { type: "status", status: "ready", device }
//                { type: "status", status: "unavailable", reason }
//                { type: "result", id, raw }   (candidate words, one per line, best first)
//
// Everything runs in the browser. The library and model files are
// downloaded once (then cached by the browser); the message never leaves.

import {
  AutoTokenizer,
  AutoModelForCausalLM,
  Tensor,
  env,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";

const MODEL = "onnx-community/Qwen2.5-0.5B-Instruct";
const CANDIDATES = 16;           // words sent back; predictor.js filters and picks the final 4
const SCAN = 300;                // most likely tokens to look through

// Framing: the message is written as the *user's* turn in a chat, after a
// short scene-setting system line. Without its own system line, Qwen adds
// "You are a helpful assistant", and the message was read as an AI's
// reply: "Can you answer", "Where is my help", "I am sorry".
// Words in the system line leak into the guesses a little, so it only
// uses words that are fine to suggest (tested: "carers" leaked "car",
// "texting" leaked "text"). Tested against 34 everyday sentence openings.
// The tags are Qwen2.5's chat format; change them if the model changes.
const SYSTEM = "You are at home with your family.";
const FRAME = `<|im_start|>system\n${SYSTEM}<|im_end|>\n<|im_start|>user\n`;

// The only ending that turns a word piece into a whole word: " don" + "'t".
// Other endings ("'s", "'re", "'ll") follow a word that is already whole,
// so "phone" stays "phone" rather than becoming "phone's".
const NOT_ENDING = "'t";

env.allowLocalModels = false;    // models come from the Hugging Face hub
env.useBrowserCache = true;      // keep them after the first visit

let tokenizer = null;
let model = null;
let busy = false;
let queued = null;               // only the newest waiting request matters

self.addEventListener("message", ({ data }) => {
  if (data.type === "load") load();
  if (data.type === "predict") {
    queued = data;               // replaces any older request still waiting
    runQueue();
  }
});

async function load() {
  if (model) return;
  try {
    const { device, dtype } = await pickBackend();
    const progress_callback = (info) => {
      if (info.status === "progress_total") {
        post({ type: "status", status: "loading", progress: Math.round(info.progress) });
      }
    };
    tokenizer = await AutoTokenizer.from_pretrained(MODEL);
    model = await AutoModelForCausalLM.from_pretrained(MODEL, { device, dtype, progress_callback });
    await nextWords("Hi");       // warm-up, so the first real request is quick
    post({ type: "status", status: "ready", device });
    runQueue();
  } catch (error) {
    model = null;
    post({ type: "status", status: "unavailable", reason: String(error?.message ?? error) });
  }
}

/**
 * WebGPU with 16-bit float support gets the 4-bit/fp16 build (483 MB).
 * Everything else uses the CPU (WASM) with the 8-bit build (512 MB).
 */
async function pickBackend() {
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    if (adapter?.features.has("shader-f16")) return { device: "webgpu", dtype: "q4f16" };
  } catch {
    // No WebGPU: fall through to the CPU.
  }
  return { device: "wasm", dtype: "q8" };
}

/**
 * The most likely next whole words after the text, best first.
 * Qwen's tokens for a new word start with a space (" coffee"), so only
 * those are kept; punctuation and word endings are skipped.
 */
async function nextWords(text) {
  // FRAME already contains its special tokens.
  const inputs = tokenizer(FRAME + text.trim(), { add_special_tokens: false });
  const output = await model(inputs);
  const [, length, vocabSize] = output.logits.dims;
  const scores = asFloat32(output.logits).data.subarray((length - 1) * vocabSize, length * vocabSize);

  const ids = [];
  const seen = new Set();
  for (const id of topIndices(scores, SCAN)) {
    const piece = tokenizer.decode([id]);
    if (!/^ [A-Za-z']+$/.test(piece)) continue;            // must start a new word
    const word = piece.trim().toLowerCase();
    if (word.length === 1 && word !== "a" && word !== "i") continue;
    if (seen.has(word)) continue;                          // " Coffee" and " coffee"
    seen.add(word);
    ids.push(id);
    if (ids.length === CANDIDATES) break;
  }

  try {
    return await wholeWords(ids, output, inputs.attention_mask.dims[1]);
  } catch (error) {
    // If the check fails on some device, single tokens are still useful.
    console.warn("Word check skipped:", error);
    return ids.map((id) => tokenizer.decode([id]).trim().toLowerCase());
  } finally {
    release(output);
  }
}

/**
 * Some tokens are only the start of a word (" don", " expl"). For each
 * candidate, look at the model's best guess for the token after it: if
 * that starts a new word, is punctuation or an ending like "'s", the
 * candidate is whole. If it is "'t", the two join ("don't", "can't").
 * If it continues the word with letters, the candidate is dropped.
 *
 * This reuses the model's memory of the message (its key/value cache)
 * and adds one token per candidate, all in one batch, so it costs about
 * as much as a few words of text rather than re-reading the message.
 */
async function wholeWords(ids, output, length) {
  if (!ids.length) return [];
  const batch = ids.length;

  // Copy the cache once per candidate: present.N.* → past_key_values.N.*
  const past = {};
  for (const [name, tensor] of Object.entries(output)) {
    if (!name.startsWith("present.")) continue;
    const data = await download(tensor);
    const tiled = new data.constructor(data.length * batch);
    for (let b = 0; b < batch; b++) tiled.set(data, b * data.length);
    const [, ...rest] = tensor.dims;
    past[name.replace("present.", "past_key_values.")] = new Tensor(tensor.type, tiled, [batch, ...rest]);
  }

  const step = await model({
    input_ids: new Tensor("int64", BigInt64Array.from(ids, BigInt), [batch, 1]),
    attention_mask: new Tensor("int64", new BigInt64Array(batch * (length + 1)).fill(1n), [batch, length + 1]),
    past_key_values: past,
  });

  try {
    const vocabSize = step.logits.dims[2];
    const logits = asFloat32(step.logits).data;
    const words = [];
    ids.forEach((id, b) => {
      const row = logits.subarray(b * vocabSize, (b + 1) * vocabSize);
      const next = tokenizer.decode([argmax(row)]);
      let word = tokenizer.decode([id]).trim().toLowerCase();
      if (/^[A-Za-z]+$/.test(next)) return;                // the word goes on: a piece, drop it
      if (next.toLowerCase() === NOT_ENDING) word += NOT_ENDING;   // "don" → "don't"
      if (!words.includes(word)) words.push(word);
    });
    return words;
  } finally {
    release(step);
  }
}

/** Read a tensor's values, whether they sit on the CPU or the GPU. */
async function download(tensor) {
  const inner = tensor.ort_tensor;
  return inner?.location && inner.location !== "cpu" ? inner.getData() : tensor.data;
}

/** Free the cache tensors a model call returns (on WebGPU they hold GPU memory). */
function release(output) {
  for (const [name, tensor] of Object.entries(output)) {
    if (name.startsWith("present.")) tensor.ort_tensor?.dispose?.();
  }
}

/** Scores as 32-bit floats (some model builds return 16-bit ones). */
function asFloat32(tensor) {
  return tensor.type === "float32" ? tensor : tensor.to("float32");
}

function argmax(values) {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  return best;
}

/** Indices of the k largest values, largest first. */
function topIndices(values, k) {
  const top = [];                                          // sorted, largest first
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (top.length === k && v <= values[top[k - 1]]) continue;
    let at = top.length;
    while (at > 0 && values[top[at - 1]] < v) at--;
    top.splice(at, 0, i);
    if (top.length > k) top.pop();
  }
  return top;
}

async function runQueue() {
  if (!model || busy || !queued) return;
  const { id, text } = queued;
  queued = null;
  busy = true;
  try {
    const words = await nextWords(text);
    post({ type: "result", id, raw: words.join("\n") });
  } catch (error) {
    post({ type: "result", id, raw: "", error: String(error?.message ?? error) });
  } finally {
    busy = false;
    runQueue();                  // a newer request may have arrived meanwhile
  }
}

function post(message) {
  self.postMessage(message);
}
