// coreWords.js: the fixed row of core words, drawn from data/core.json.
//
// Core words are the small, everyday words most sentences are built from
// (I, you, want, go, not, more). Unlike the suggestion row they never
// change or move, so with practice a person finds them by position
// rather than by reading, as on an AAC board. Keep the order in
// core.json stable for the same reason.

import * as state from "../state.js";

/** @param {HTMLUListElement} list  @param {{word:string,type:string}[]} words */
export function renderCoreWords(list, words) {
  list.replaceChildren(
    ...words.map(({ word, type }) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "core-word";
      button.dataset.type = type;           // Fitzgerald Key color
      button.textContent = word;
      button.addEventListener("click", () => state.insert(word));
      li.append(button);
      return li;
    }),
  );
}
