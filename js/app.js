// app.js: startup. Loads the data files, draws the inputs and wires
// everything to state.js. Every text change goes to the predictor, which
// fills the suggestion row, using the LLM worker once it's ready.

import * as state from "./state.js";
import { initTypeBox } from "./ui/typeBox.js";
import { renderStarters } from "./ui/starters.js";
import { renderImageHelper } from "./ui/imageHelper.js";
import { createSuggestions } from "./ui/suggestions.js";
import { createPredictor } from "./engine/predictor.js";
import { createLLMClient } from "./llm/llmClient.js";

const $ = (id) => document.getElementById(id);
const textarea = $("message");

// ---------- AI status label ----------
const STATUS_LABELS = {
  off: "Basic suggestions",
  unavailable: "Basic suggestions",
  loading: "AI loading",
  ready: "AI ready",
};
let predictor = null;

// Start downloading the model in the background straight away.
const llm = createLLMClient({
  onStatus(status, detail) {
    $("ai-status").dataset.state = status;
    $("ai-label").textContent = STATUS_LABELS[status] ?? STATUS_LABELS.off;
    $("ai-progress").textContent =
      status === "loading" && detail.progress ? `${detail.progress}%` : "";
    // Once the model is ready, refresh the row so its words appear.
    if (status === "ready") predictor?.update(state.getText());
  },
});

// The type box works straight away, before any data arrives.
initTypeBox({
  textarea,
  readAloud: $("read-aloud"),
  undo: $("undo"),
  clear: $("clear"),
  copy: $("copy"),
  announcer: $("announcer"),
});

// After a spelling fix, put the caret back in the box so typing continues.
const suggestions = createSuggestions($("suggestions"), {
  onSpellingPick: () => textarea.focus(),
});

async function loadJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

try {
  const [starters, categories, vocab, common] = await Promise.all([
    loadJSON("data/starters.json"),
    loadJSON("data/categories.json"),
    loadJSON("data/vocab.json"),
    // Extra spelling words. Optional: without them spelling help uses vocab.json only.
    loadJSON("data/words.json").catch(() => ({ words: [] })),
  ]);
  renderStarters($("starter-list"), starters);
  renderImageHelper($("categories"), $("pictures"), categories);

  predictor = createPredictor(vocab, (result) => suggestions.render(result), llm, common.words);
  state.subscribe((text) => predictor.update(text));
  predictor.update(state.getText());
} catch (error) {
  // Usually means the page was opened as a file instead of through a server.
  console.error("Couldn't load data files", error);
  $("load-error").hidden = false;
}
