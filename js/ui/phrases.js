// phrases.js: saved phrases and the "About my aphasia" card.
//
// Phrases are whole messages a person sends often ("Love you.
// Goodnight."). One tap adds the whole phrase, the way script training
// in aphasia therapy practices set messages. "Save this message" keeps
// the current message as a new phrase. Removing phrases is done on the
// Setup page, so nothing can be deleted here by accident.
//
// The card is a full-screen message to show someone face to face.

import * as state from "../state.js";

const FEEDBACK_MS = 2000;

/** @param {HTMLUListElement} list  @param {string[]} phrases */
export function renderPhrases(list, phrases) {
  list.replaceChildren(
    ...phrases.map((phrase) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "phrase";
      button.textContent = phrase;
      button.addEventListener("click", () => state.insert(phrase));
      li.append(button);
      return li;
    }),
  );
}

/**
 * The "Save this message" button.
 * @param {HTMLButtonElement} button
 * @param {{ onSave: (text: string) => boolean, announce: (message: string) => void }} options
 *   onSave stores the phrase and returns false if it couldn't be saved.
 */
export function initPhraseSave(button, { onSave, announce }) {
  const label = button.lastChild;               // the text node after the icon
  const sync = (text) => button.setAttribute("aria-disabled", String(text.trim() === ""));
  let timer = 0;

  button.addEventListener("click", () => {
    const text = state.getText().trim();
    if (!text) return;
    const ok = onSave(text);
    clearTimeout(timer);
    button.classList.toggle("is-done", ok);
    label.textContent = ok ? " Saved" : " Not saved";
    announce(ok ? "Saved to My phrases" : "Not saved. The device storage is full or blocked.");
    timer = setTimeout(() => {
      button.classList.remove("is-done");
      label.textContent = " Save this message";
    }, FEEDBACK_MS);
  });

  state.subscribe(sync);
  sync(state.getText());
}

/**
 * The "About my aphasia" card.
 * @param {{ open: HTMLButtonElement, dialog: HTMLDialogElement, text: HTMLElement,
 *   speak: HTMLButtonElement, close: HTMLButtonElement, getText: () => string }} parts
 */
export function initAphasiaCard({ open, dialog, text, speak, close, getText }) {
  open.addEventListener("click", () => {
    text.textContent = getText();
    dialog.showModal();
  });
  // Close goes back to the "About my aphasia" button. The close event
  // covers the Escape key too.
  const done = () => {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    open.focus();
  };
  close.addEventListener("click", () => { dialog.close(); done(); });
  dialog.addEventListener("close", done);

  if (!("speechSynthesis" in window)) {
    speak.hidden = true;
    return;
  }
  speak.addEventListener("click", () => {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(getText().replace(/\n/g, " "));
    utterance.lang = document.documentElement.lang || "en";
    utterance.rate = 0.9;
    speechSynthesis.speak(utterance);
  });
}
