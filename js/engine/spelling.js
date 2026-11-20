// spelling.js: finds the vocabulary words closest to an unfinished word.
//
// "cofee" → coffee (one letter off), "kofi" → coffee (sounds the same),
// "cof" → coffee (start of the word). Instant, no AI.
//
// Each vocabulary word gets the smallest of three scores (lower is closer):
//   1. edit distance between the two words
//   2. edit distance to the start of the vocabulary word, + 0.5
//   3. edit distance between their sound keys, + 0.25
// plus a small penalty when the first letters differ. Words scoring within
// about half the typed length are kept, best first.

const PREFIX_COST = 0.5;
const SOUND_COST = 0.25;
const FIRST_LETTER_PENALTY = 0.3;

/**
 * Build a matcher for a word list. Sound keys are worked out once here.
 * @param {string[]} words
 * @returns {(typed: string, limit?: number) => string[]}
 */
export function createSpellingMatcher(words) {
  const entries = [...new Set(words.map((w) => w.toLowerCase()))].map((word, order) => ({
    word,
    key: soundKey(word),
    order,                       // earlier in vocab.json wins ties
  }));

  return function match(typed, limit = 4) {
    const t = typed.toLowerCase().replace(/[^a-z']/g, "");
    if (!t) return [];
    const tKey = soundKey(t);
    const threshold = Math.max(0.5, t.length / 2);

    const scored = [];
    for (const { word, key, order } of entries) {
      let score = Math.min(
        editDistance(t, word),
        editDistance(t, word.slice(0, t.length)) + PREFIX_COST,
        editDistance(tKey, key) + SOUND_COST,
      );
      if (t[0] !== word[0]) score += FIRST_LETTER_PENALTY;
      if (score <= threshold) scored.push({ word, score, order });
    }

    scored.sort((a, b) => a.score - b.score || a.order - b.order);
    return scored.slice(0, limit).map((s) => s.word);
  };
}

/**
 * A rough "how it sounds" key, so spellings that sound alike match.
 * lowercase, ph→f, ck→k, c/q→k, collapse doubled letters, strip trailing
 * vowels. "kofi" and "coffee" both become "kof".
 */
export function soundKey(word) {
  const key = word
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/[cq]/g, "k")
    .replace(/(.)\1+/g, "$1")
    .replace(/[aeiou]+$/, "");
  return key || word.toLowerCase();   // all-vowel words ("i") keep themselves
}

/**
 * Edit distance: how many single-letter changes (insert, delete, replace,
 * or swap two neighbors) turn a into b. Swaps count as one, since swapped
 * letters are a common typo.
 */
export function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  // d[i][j] = distance between the first i letters of a and first j of b
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,          // delete
        d[i][j - 1] + 1,          // insert
        d[i - 1][j - 1] + cost,   // replace
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);  // swap
      }
    }
  }
  return d[a.length][b.length];
}
