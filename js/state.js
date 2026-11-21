// state.js: the one place the message text lives.
//
// Every input goes through here. Taps call insert(word) (or, for a
// spelling fix, replaceLastWord(word)); typing calls setText(value).
// Each saves an undo step and tells subscribers, so the
// type box (and later the predictor) re-render from the same text.
// Nothing else changes the text.

const MAX_HISTORY = 200;

let text = "";
const history = [];          // earlier versions of the text, newest last
const listeners = new Set();
let typingRun = false;       // true while consecutive keystrokes share one undo step

/** The current message. */
export function getText() {
  return text;
}

/** True when there is something to undo. */
export function canUndo() {
  return history.length > 0;
}

/**
 * Call fn(text, change) after every change. change.source is
 * "insert", "type", "undo" or "clear". Returns a function that unsubscribes.
 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Add a word or phrase to the end of the message, from a starter,
 * picture or suggestion. Adds a space before it when needed and one
 * after it, so the next tap or keystroke starts a new word.
 * The first word of each sentence gets a capital letter.
 */
export function insert(word) {
  const clean = word.trim();
  if (!clean) return;
  const needsSpace = text.length > 0 && !/\s$/.test(text);
  const piece = startsSentence(text) ? capitalize(clean) : clean;
  commit((text.trim() === "" ? "" : text + (needsSpace ? " " : "")) + piece + " ", "insert");
}

/**
 * Swap the unfinished last word for a suggestion, e.g. a spelling fix
 * ("I want kofi" → "I want coffee "), and add a space after it.
 * With no unfinished word this behaves like insert().
 */
export function replaceLastWord(word) {
  const clean = word.trim();
  if (!clean) return;
  const before = text.replace(/[A-Za-z']+$/, "");
  const piece = startsSentence(before) ? capitalize(clean) : clean;
  const base = before.trim() === "" ? "" : before;
  commit(base + (base && !/\s$/.test(base) ? " " : "") + piece + " ", "insert");
}

/**
 * Replace the whole message with what the person typed.
 * Keystrokes are grouped into one undo step per word, so Undo removes
 * a word at a time instead of a single letter.
 *
 * Two fixes for a character typed at the end:
 *   - punctuation joins the word before it: taps leave a space after
 *     each word, so "tired " + "." becomes "tired.", not "tired ."
 *   - the first letter of a sentence becomes a capital: ". c" → ". C"
 */
export function setText(value) {
  if (value === text) return;
  const added = value.length === text.length + 1 && value.startsWith(text) ? value.at(-1) : "";
  if (/[.,!?;:]/.test(added) && /\S $/.test(text)) {
    value = text.slice(0, -1) + added;
  } else if (/[a-z]/.test(added) && /[.!?]\s+$/.test(text)) {
    value = text + added.toUpperCase();
  }
  const startsNewStep = !typingRun || /\s$/.test(text);
  if (startsNewStep) pushHistory(text);
  text = value;
  typingRun = true;
  notify("type");
}

/** Put back a message kept from before a page reload. Not an undo step. */
export function restore(value) {
  if (typeof value !== "string" || value === text) return;
  text = value;
  notify("restore");
}

/** Go back one step. */
export function undo() {
  if (!history.length) return;
  text = history.pop();
  typingRun = false;
  notify("undo");
}

/** Empty the message. This can be undone too. */
export function clear() {
  if (text === "") return;
  commit("", "clear");
}

// ---------- internals ----------

function commit(next, source) {
  if (next === text) return;
  pushHistory(text);
  text = next;
  typingRun = false;
  notify(source);
}

function pushHistory(value) {
  history.push(value);
  if (history.length > MAX_HISTORY) history.shift();
}

function notify(source) {
  for (const fn of listeners) fn(text, { source });
}

/** True at the start of the message or right after ".", "!" or "?". */
function startsSentence(before) {
  return before.trim() === "" || /[.!?]\s*$/.test(before);
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
