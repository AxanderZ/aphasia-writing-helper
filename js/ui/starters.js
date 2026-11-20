// starters.js: the sentence-starter buttons, drawn from data/starters.json.
// Tapping one adds its words to the message, e.g. insert("I want").

import * as state from "../state.js";

/** @param {HTMLUListElement} list  @param {{id:string,label:string,icon:string}[]} starters */
export function renderStarters(list, starters) {
  list.replaceChildren(
    ...starters.map(({ id, label, icon }) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "starter";
      button.dataset.id = id;

      const well = document.createElement("span");
      well.className = "starter-icon";
      const img = document.createElement("img");
      img.src = icon;
      img.alt = "";                     // the label says it all
      well.append(img);

      button.append(well, label);
      button.addEventListener("click", () => state.insert(label));
      li.append(button);
      return li;
    }),
  );
}
