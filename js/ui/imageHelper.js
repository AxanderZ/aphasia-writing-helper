// imageHelper.js: picture words, drawn from data/categories.json.
//
// One tab per category (People, Food, ...) and a grid of pictures for the
// selected one. Tapping a picture adds its word, e.g. insert("coffee").
// Pictures whose image file doesn't exist yet keep a placeholder.

import * as state from "../state.js";

/**
 * @param {HTMLElement} tablist   the element with role="tablist"
 * @param {HTMLElement} pictures  where the tab panels go
 * @param {Record<string, {word:string,image:string}[]>} categories
 */
export function renderImageHelper(tablist, pictures, categories) {
  const names = Object.keys(categories);
  const tabs = [];
  const panels = [];

  names.forEach((name, i) => {
    const id = name.toLowerCase();
    const selected = i === 0;

    // Tab
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "category";
    tab.id = `tab-${id}`;
    tab.dataset.category = id;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `panel-${id}`);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    tab.append(picSlot(`images/tab-${id}.svg`, "pic pic--small"), name);
    tabs.push(tab);

    // Panel with its picture grid
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.id = `panel-${id}`;
    panel.dataset.category = id;
    panel.hidden = !selected;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);

    const grid = document.createElement("ul");
    grid.className = "picture-grid";
    grid.setAttribute("role", "list");
    for (const { word, image } of categories[name]) {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "picture";
      const label = document.createElement("span");
      label.className = "word";
      label.textContent = word;
      button.append(picSlot(image, "pic"), label);
      button.addEventListener("click", () => state.insert(word));
      li.append(button);
      grid.append(li);
    }
    panel.append(grid);
    panels.push(panel);
  });

  tablist.replaceChildren(...tabs);
  pictures.replaceChildren(...panels);

  // ----- tab behavior -----

  function select(tab, { focus = false } = {}) {
    tabs.forEach((t, i) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
    });
    if (focus) tab.focus();
  }

  tablist.addEventListener("click", (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab) select(tab);
  });

  // Arrow keys move between tabs in both directions, since the tabs are a
  // column on wide screens and a grid on narrow ones. Home/End jump to the ends.
  tablist.addEventListener("keydown", (event) => {
    const i = tabs.indexOf(document.activeElement);
    if (i === -1) return;
    const moves = {
      ArrowDown: i + 1, ArrowRight: i + 1,
      ArrowUp: i - 1, ArrowLeft: i - 1,
      Home: 0, End: tabs.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    select(tabs[(moves[event.key] + tabs.length) % tabs.length], { focus: true });
  });

  // Keep aria-orientation in step with the layout.
  const wide = window.matchMedia("(min-width: 70rem)");
  const syncOrientation = () =>
    tablist.setAttribute("aria-orientation", wide.matches ? "vertical" : "horizontal");
  wide.addEventListener("change", syncOrientation);
  syncOrientation();
}

/**
 * A picture slot. It shows the CSS placeholder until the image file
 * loads; if the file is missing, the placeholder simply stays.
 */
function picSlot(src, className) {
  const slot = document.createElement("span");
  slot.className = className;
  slot.dataset.src = src;
  slot.setAttribute("aria-hidden", "true");

  const img = new Image();
  img.alt = "";
  img.decoding = "async";
  img.addEventListener("load", () => slot.append(img), { once: true });
  img.src = src;
  return slot;
}
