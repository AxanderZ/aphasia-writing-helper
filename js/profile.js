// profile.js: the person's own words, kept on this device.
//
// Set up by a speech therapist or family member on setup.html, and
// added to from the app ("Save this message"). Stored in the browser's
// localStorage, never sent anywhere. Export makes a backup file that can
// be loaded on another device or after clearing the browser.
//
// Shape (version 1):
//   people:  [{ name: "Sarah", photo: "data:image/jpeg;…" or "" }]
//   phrases: ["See you soon.", …], or null to use data/phrases.json
//   card:    the "About my aphasia" text
//   side:    "left" or "right", where the starters rail goes on wide screens

const KEY = "writing-helper-profile";

export const DEFAULT_CARD =
  "I have aphasia.\nI understand more than I can say.\nPlease give me time.";

/** The saved profile, or an empty one. Never throws. */
export function loadProfile() {
  try {
    return normalize(JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch {
    return normalize({});
  }
}

/** Save the profile. Returns false if the browser refused (storage full or blocked). */
export function saveProfile(profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalize(profile)));
    return true;
  } catch {
    return false;
  }
}

/** Download the profile as a backup file. */
export function exportProfile(profile) {
  const blob = new Blob([JSON.stringify({ app: "writing-helper", ...normalize(profile) }, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "writing-helper-backup.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** Read a backup file's text. Throws if it isn't a Writing Helper backup. */
export function parseBackup(text) {
  const data = JSON.parse(text);
  if (data?.app !== "writing-helper") throw new Error("Not a Writing Helper backup file");
  return normalize(data);
}

/** Keep only known fields with the right types, so a bad file can't break the app. */
function normalize(data) {
  const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const people = Array.isArray(data.people) ? data.people : [];
  const phrases = Array.isArray(data.phrases) ? data.phrases : null;
  return {
    version: 1,
    people: people
      .map((p) => ({
        name: text(p?.name, 40),
        photo: typeof p?.photo === "string" && p.photo.startsWith("data:image/") ? p.photo : "",
      }))
      .filter((p) => p.name),
    phrases: phrases && phrases.map((p) => text(p, 200)).filter(Boolean),
    card: text(data.card, 400) || DEFAULT_CARD,
    side: data.side === "right" ? "right" : "left",
  };
}
