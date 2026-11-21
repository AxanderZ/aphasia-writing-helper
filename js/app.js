// app.js: startup. Loads the data files and the person's profile, draws
// the inputs and wires everything to state.js. Every text change goes to
// the predictor, which fills the suggestion row, using the LLM worker
// once it's ready.

import * as state from "./state.js";
import { initTypeBox } from "./ui/typeBox.js";
import { renderStarters } from "./ui/starters.js";
import { renderCoreWords } from "./ui/coreWords.js";
import { renderPhrases, initPhraseSave, initAphasiaCard } from "./ui/phrases.js";
import { renderImageHelper } from "./ui/imageHelper.js";
import { createSuggestions } from "./ui/suggestions.js";
import { createPredictor } from "./engine/predictor.js";
import { createLLMClient } from "./llm/llmClient.js";
import { loadProfile, saveProfile } from "./profile.js";

const $ = (id) => document.getElementById(id);
const textarea = $("message");
const DRAFT_KEY = "writing-helper-draft";

// ---------- short spoken updates for screen readers ----------
function announce(message) {
  const announcer = $("announcer");
  announcer.textContent = "";
  // Emptying first, then filling a moment later, makes screen readers
  // announce a repeat ("Copied" twice in a row).
  setTimeout(() => { announcer.textContent = message; }, 100);
}

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

// ---------- the person's profile (names, photos, phrases) ----------
const profile = loadProfile();
document.documentElement.dataset.side = profile.side;

// The type box works straight away, before any data arrives.
initTypeBox({
  textarea,
  readAloud: $("read-aloud"),
  send: $("send"),
  undo: $("undo"),
  clear: $("clear"),
  copy: $("copy"),
  announce,
  sendDialog: {
    dialog: $("send-dialog"),
    sms: $("send-sms"),
    email: $("send-email"),
    copy: $("send-copy"),
    close: $("send-close"),
  },
});

// A message survives a reload or a trip to Setup, for this tab only
// (sessionStorage is cleared when the tab closes).
try {
  state.restore(sessionStorage.getItem(DRAFT_KEY) ?? "");
  state.subscribe((text) => sessionStorage.setItem(DRAFT_KEY, text));
} catch {
  // Storage blocked: the message just isn't kept across reloads.
}

initAphasiaCard({
  open: $("open-card"),
  dialog: $("card-dialog"),
  text: $("card-text"),
  speak: $("card-speak"),
  close: $("card-close"),
  getText: () => profile.card,
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
  const optional = (path, fallback) => loadJSON(path).catch(() => fallback);
  const [starters, categories, vocab, common, core, defaultPhrases] = await Promise.all([
    loadJSON("data/starters.json"),
    loadJSON("data/categories.json"),
    loadJSON("data/vocab.json"),
    // Optional: without these the app still works.
    optional("data/words.json", { words: [] }),     // extra spelling words
    optional("data/core.json", []),
    optional("data/phrases.json", []),
  ]);

  // Personal people come first in People, with their photos.
  const names = profile.people.map((p) => p.name);
  categories.People = [
    ...profile.people.map((p) => ({ word: p.name, image: p.photo })),
    ...(categories.People ?? []),
  ];
  // "Call" and "See" offer their names first.
  if (names.length) {
    vocab.next.call = [...names, ...(vocab.next.call ?? [])];
    vocab.next.see = ["you", ...names, ...(vocab.next.see ?? [])];
  }

  renderStarters($("starter-list"), starters);
  renderCoreWords($("core-list"), core);
  renderImageHelper($("categories"), $("pictures"), categories);

  // Phrases: the saved list, or the starting set until one is saved.
  let phrases = profile.phrases ?? defaultPhrases;
  renderPhrases($("phrase-list"), phrases);
  initPhraseSave($("save-phrase"), {
    announce,
    onSave(text) {
      if (!phrases.includes(text)) phrases = [text, ...phrases];
      const ok = saveProfile({ ...profile, phrases });
      if (ok) renderPhrases($("phrase-list"), phrases);
      return ok;
    },
  });

  // Names are spelled like vocabulary words ("sar" → Sarah).
  predictor = createPredictor(vocab, (result) => suggestions.render(result), llm, [...names, ...common.words]);
  state.subscribe((text) => predictor.update(text));
  predictor.update(state.getText());
} catch (error) {
  // Usually means the page was opened as a file instead of through a server.
  console.error("Couldn't load data files", error);
  $("load-error").hidden = false;
}
