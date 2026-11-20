// predictor.js: decides what the four suggestion buttons say.
//
// After every change to the text it picks a mode:
//   empty box, or a finished sentence → QUICK: Hello, Yes, No, Thank you
//   last word unfinished              → SPELLING: closest vocabulary words
//   last word finished                → NEXT: likely next words
//
// NEXT mode fills the row so that a word never changes once it's shown:
// someone reading slowly must not reach for "please" and tap "beans".
//   - Fixed words appear at once: the top two hand-picked words from
//     vocab.json ("want" → coffee, water) in the first two buttons, or,
//     when there is no hand-picked list, a polite word ("please",
//     "thank you") in the last button.
//   - The other buttons wait, empty, for the AI (300 ms pause + about
//     0.1–0.3 s), then fill in. Anything the AI can't fill comes from the
//     backup list.
//   - Without the AI (off, loading or failed), the backup list fills the
//     whole row straight away, as before.
//
// Results go out through onUpdate({ mode, words, source }). Empty slots
// are null. source is "backup", "waiting" or "ai" in NEXT mode.

import { createSpellingMatcher } from "./spelling.js";

const QUICK_WORDS = ["Hello", "Yes", "No", "Thank you"];
const LIMIT = 4;
const LLM_PAUSE_MS = 300;
// Hand-picked words shown first when there is a list. People chose them
// for that exact spot, so they get most of the row; the AI fills the rest.
const KEEP_CURATED = 3;
const POLITE = ["please", "thank you"];

// The model ranks small grammar words highest ("a", "at", "the", "in"),
// but people with Broca's aphasia mostly need help with content words.
// So at most MAX_SMALL small words keep their place among the AI's
// words, with one article at most; the rest move behind content words.
// Joining words ("and", "of") always move back. Nothing is dropped, so
// "a cup" can still offer "of" when nothing better comes up.
const MAX_SMALL = 2;
const JOINING = new Set("and or but because of as than then if which whom whose while also".split(" "));
const ARTICLES = new Set(["a", "an", "the"]);
// Words that come before a noun ("my", "the"). One never follows another:
// "Call my" shouldn't offer "a".
const DETERMINERS = new Set([...ARTICLES, ..."this that these those some any my your his her our their".split(" ")]);
const SMALL = new Set([
  ...DETERMINERS,
  ..."to at in on with for from by into out up about over".split(" "),
  // Not "you" and "me": "I love you", "See you", "Call me" need them.
  ..."it all".split(" "),
  ..."is are am was be do does did have has can will would should could not".split(" "),
]);

/**
 * @param {{ words: string[], next: Record<string, string[]> }} vocab  data/vocab.json
 * @param {(result: { mode: string, words: string[], source?: string }) => void} onUpdate
 * @param {{ status: string, predict: (text: string) => Promise<string | null> } | null} [llm]  llmClient, optional
 * @param {string[]} [commonWords]  data/words.json: more words for spelling help
 */
export function createPredictor(vocab, onUpdate, llm = null, commonWords = []) {
  // vocab.json words come first, so they win ties ("pl" → please).
  const matchSpelling = createSpellingMatcher([...vocab.words, ...commonWords]);
  let current = "";              // the text the latest update was for
  let timer = 0;

  return {
    /** Work out suggestions for the current text. */
    update(text) {
      current = text;
      clearTimeout(timer);

      if (text.trim() === "" || /[.!?]\s*$/.test(text)) {
        onUpdate({ mode: "quick", words: QUICK_WORDS });
        return;
      }

      const unfinished = unfinishedWord(text);
      if (unfinished) {
        onUpdate({ mode: "spelling", words: matchSpelling(unfinished, LIMIT).map(display) });
        return;
      }

      // NEXT-WORD mode
      const show = (words, source) => onUpdate({ mode: "next", words: words.map((w) => w && display(w)), source });

      if (llm?.status !== "ready") {
        show(backupNextWords(vocab, text), "backup");
        return;
      }

      show(nextRow(vocab, text, null), "waiting");      // fixed words now, the rest empty
      timer = setTimeout(async () => {
        const raw = await llm.predict(text);
        if (text !== current) return;                     // outdated: a newer update owns the row
        const aiWords = raw == null ? [] : cleanModelWords(raw, text);
        show(nextRow(vocab, text, aiWords), "ai");        // no AI words → backup fills in
      }, LLM_PAUSE_MS);
    },
  };
}

/**
 * The NEXT-mode row. With a hand-picked list ("want" → coffee, water, to):
 *   [hand-picked ×(up to 3), AI…]
 * Without one:
 *   [AI, AI, AI, please]
 * aiWords null means the AI hasn't answered yet: those slots are null
 * (shown empty). Once it has answered, any slot it couldn't fill takes a
 * backup word.
 */
export function nextRow(vocab, text, aiWords) {
  const picked = handPicked(vocab, text).filter((w) => w !== lastWord(text));
  const listed = picked.length > 0;
  const backup = backupNextWords(vocab, text);
  const fixed = listed ? picked.slice(0, KEEP_CURATED) : politeWord(text);
  const open = LIMIT - fixed.length;
  const fill = aiWords == null
    ? Array(open).fill(null)
    : [...new Set([...aiWords, ...backup])].filter((w) => !fixed.includes(w)).slice(0, open);
  while (fill.length < open) fill.push(null);
  return listed ? [...fixed, ...fill] : [...fill, ...fixed];
}

/** "please", or "thank you" if please is already in the message. */
function politeWord(text) {
  const inMessage = new Set(text.toLowerCase().match(/[a-z']+/g) ?? []);
  const word = POLITE.find((p) => !p.split(" ").every((part) => inMessage.has(part)));
  return word ? [word] : [];
}

/**
 * The hand-picked list in vocab.next for the end of the text. A key can
 * be up to three words ("want", "can you", "where is my"); longer keys
 * win, so "Can you" offers help and call but "See you" offers soon.
 * Only words since the last . ! or ? count.
 */
function handPicked(vocab, text) {
  const sentence = text.toLowerCase().split(/[.!?]/).at(-1);
  const words = sentence.match(/[a-z']+/g) ?? [];
  for (let n = Math.min(3, words.length); n > 0; n--) {
    const list = vocab.next[words.slice(-n).join(" ")];
    if (list) return list;
  }
  return [];
}

/**
 * The hand-picked list ("want" → coffee, water, to, help). Text with no
 * list uses "_default". Short lists are topped up from "_default" so all
 * four buttons have a word.
 */
function backupNextWords(vocab, text) {
  const last = lastWord(text);
  const words = [...new Set([...handPicked(vocab, text), ...vocab.next._default])];
  return words.filter((w) => w !== last).slice(0, LIMIT);
}

/**
 * Turn the model's reply into usable words: one per line, best first,
 * single words or two-word phrases, lowercase, no duplicates, nothing
 * already in the message. The model's order is kept, except that these
 * move behind the content words: small words beyond MAX_SMALL, a second
 * article, joining words, and "a"/"my"-type words right after another
 * one. At most four.
 */
function cleanModelWords(raw, text) {
  const inMessage = new Set(text.toLowerCase().match(/[a-z']+/g) ?? []);
  const words = [];
  for (let line of raw.split("\n")) {
    line = line
      .toLowerCase()
      .replace(/[^a-z' ]/g, "")
      .trim()
      .replace(/\s+/g, " ");
    if (line === "thank") line = "thank you";          // the model guesses one word at a time
    if (!line || line.split(" ").length > 2) continue;
    if (line.split(" ").every((w) => inMessage.has(w))) continue;
    if (!words.includes(line)) words.push(line);
  }
  const front = [];
  const back = [];
  const afterDeterminer = DETERMINERS.has(lastWord(text));
  let small = 0;
  let article = false;
  for (const word of words) {
    let toBack = JOINING.has(word) || (afterDeterminer && DETERMINERS.has(word));
    if (!toBack && SMALL.has(word)) {
      toBack = small === MAX_SMALL || (ARTICLES.has(word) && article);
      if (!toBack) {
        small++;
        if (ARTICLES.has(word)) article = true;
      }
    }
    (toBack ? back : front).push(word);
  }
  return [...front, ...back].slice(0, LIMIT);
}

/**
 * The word being typed: letters at the very end of the text with no space
 * after them. Returns "" when the text ends in a space or punctuation.
 */
export function unfinishedWord(text) {
  const m = text.match(/[A-Za-z']+$/);
  return m ? m[0] : "";
}

/** The last whole word of the text, lowercased ("Where is " → "is"). */
export function lastWord(text) {
  const m = text.toLowerCase().match(/([a-z']+)[^a-z']*$/);
  return m ? m[1] : "";
}

/** How a word is shown: the pronoun "i" is always "I", also in "I'm" and "I'll". */
export function display(word) {
  return word.replace(/^i(?=$|')/, "I");
}
