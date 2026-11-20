// suggestions.js: the row of four big suggestion buttons.
//
// Draws whatever the predictor sends. Tapping a word adds it with
// state.insert(); in spelling mode it replaces the unfinished word instead
// ("kofi" → "coffee "). The row always keeps four slots so it never
// changes height; unused slots are hidden.

import * as state from "../state.js";

const SLOTS = 4;

/**
 * @param {HTMLElement} row
 * @param {{ onSpellingPick?: () => void }} [options]
 *   onSpellingPick runs after a spelling fix, e.g. to put focus back in
 *   the type box so the person can keep typing.
 */
export function createSuggestions(row, { onSpellingPick } = {}) {
  let mode = "quick";

  const buttons = Array.from({ length: SLOTS }, () => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "suggestion";
    return b;
  });
  row.replaceChildren(...buttons);

  row.addEventListener("click", (event) => {
    const button = event.target.closest(".suggestion");
    if (!button || button.hidden) return;
    const word = button.dataset.word;
    if (mode === "spelling") {
      state.replaceLastWord(word);
      onSpellingPick?.();
    } else {
      state.insert(word);
    }
  });

  return {
    /** @param {{ mode: string, words: string[] }} result */
    render(result) {
      mode = result.mode;
      row.dataset.mode = mode;
      buttons.forEach((b, i) => {
        const word = result.words[i];
        b.hidden = !word;
        b.dataset.word = word ?? "";
        b.textContent = word ?? "";
        b.classList.toggle("suggestion--social", mode === "quick");
      });
    },
  };
}
