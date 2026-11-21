// setup.js: the Setup page, for a speech therapist or family member.
//
// Edits the profile in js/profile.js: people (name + photo), phrases,
// the "About my aphasia" card and the layout side. Every change is saved
// on this device straight away. Photos are shrunk to a small JPEG first,
// so a few dozen fit in the browser's storage.

import { loadProfile, saveProfile, exportProfile, parseBackup, DEFAULT_CARD } from "./profile.js";

const $ = (id) => document.getElementById(id);
const PHOTO_SIZE = 320;          // longest side, in pixels

let profile = loadProfile();
let defaultPhrases = [];
try {
  defaultPhrases = await (await fetch("data/phrases.json")).json();
} catch {
  // Without the starting set, the phrase list simply starts empty.
}

function status(message) {
  $("status").textContent = "";
  setTimeout(() => { $("status").textContent = message; }, 50);
}

/** Save and say so. Returns false if the browser refused. */
function commit(next, message) {
  if (!saveProfile(next)) {
    status("Not saved: this device's storage is full or blocked. Try fewer or smaller photos.");
    return false;
  }
  profile = loadProfile();
  render();
  if (message) status(message);
  return true;
}

const phrases = () => profile.phrases ?? defaultPhrases;

// ---------- drawing ----------

function render() {
  $("people-list").replaceChildren(
    ...profile.people.map((person, i) =>
      item(person.name, person.photo, `Remove ${person.name}`, () => {
        if (!confirm(`Remove ${person.name}?`)) return;
        commit({ ...profile, people: profile.people.filter((_, j) => j !== i) }, `Removed ${person.name}`);
      }),
    ),
  );
  if (!profile.people.length) $("people-list").replaceChildren(empty("No people yet."));

  $("phrases-list").replaceChildren(
    ...phrases().map((phrase, i) =>
      item(phrase, null, `Remove “${phrase}”`, () => {
        commit({ ...profile, phrases: phrases().filter((_, j) => j !== i) }, "Phrase removed");
      }),
    ),
  );
  if (!phrases().length) $("phrases-list").replaceChildren(empty("No phrases yet."));

  if (document.activeElement !== $("card-input")) $("card-input").value = profile.card;
  document.querySelector(`input[name="side"][value="${profile.side}"]`).checked = true;
}

function item(text, photo, removeLabel, onRemove) {
  const li = document.createElement("li");
  li.className = "setup-item";
  if (photo !== null) {
    const thumb = document.createElement("span");
    thumb.className = "setup-thumb";
    thumb.setAttribute("aria-hidden", "true");
    if (photo) {
      const img = new Image();
      img.src = photo;
      img.alt = "";
      thumb.append(img);
    } else {
      thumb.textContent = text.charAt(0).toUpperCase();
    }
    li.append(thumb);
  }
  const label = document.createElement("span");
  label.className = "setup-item-text";
  label.textContent = text;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "tool";
  remove.textContent = "Remove";
  remove.setAttribute("aria-label", removeLabel);
  remove.addEventListener("click", onRemove);
  li.append(label, remove);
  return li;
}

function empty(text) {
  const li = document.createElement("li");
  li.className = "setup-empty";
  li.textContent = text;
  return li;
}

// ---------- people ----------

$("person-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("person-name").value.trim();
  if (!name) return;
  let photo = "";
  const file = $("person-photo").files[0];
  if (file) {
    try {
      photo = await shrinkPhoto(file);
    } catch {
      status("That photo couldn't be used. Try a JPEG or PNG.");
      return;
    }
  }
  if (commit({ ...profile, people: [...profile.people, { name, photo }] }, `Added ${name}`)) {
    event.target.reset();
    $("person-name").focus();
  }
});

/** A small JPEG data URL of the photo, longest side PHOTO_SIZE. */
async function shrinkPhoto(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.82);
}

// ---------- phrases ----------

$("phrase-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("phrase-text").value.trim();
  if (!text) return;
  const list = phrases().includes(text) ? phrases() : [...phrases(), text];
  if (commit({ ...profile, phrases: list }, "Phrase added")) {
    event.target.reset();
    $("phrase-text").focus();
  }
});

// ---------- card ----------

let cardTimer = 0;
$("card-input").addEventListener("input", () => {
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => commit({ ...profile, card: $("card-input").value }, "Card saved"), 400);
});
$("card-reset").addEventListener("click", () => {
  $("card-input").value = DEFAULT_CARD;
  commit({ ...profile, card: DEFAULT_CARD }, "Card set to the standard text");
});

// ---------- layout ----------

document.querySelectorAll('input[name="side"]').forEach((radio) =>
  radio.addEventListener("change", () => {
    commit({ ...profile, side: radio.value }, `Starters and phrases will be on the ${radio.value}`);
  }),
);

// ---------- backup ----------

$("export").addEventListener("click", () => {
  exportProfile(profile);
  status("Backup file saved to your downloads");
});
$("import").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", async () => {
  const file = $("import-file").files[0];
  $("import-file").value = "";
  if (!file) return;
  try {
    const next = parseBackup(await file.text());
    if (!confirm("Replace the names, photos and phrases on this device with the backup?")) return;
    commit(next, "Backup loaded");
  } catch {
    status("That file isn't a Writing Helper backup.");
  }
});

render();
