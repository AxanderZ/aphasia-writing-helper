// typeBox.js: the message box and its tools (Read aloud, Send, Undo,
// Clear, Copy).
//
// Typing goes to state.setText(); every state change is drawn back into
// the box. Read aloud uses the browser's speechSynthesis and Copy uses
// navigator.clipboard. Both stay in the browser. Send hands the message
// to the device's own share sheet (Messages, WhatsApp, Mail…) only when
// the person taps it; where there is no share sheet it offers a text
// message, an email or Copy.
//
// Tools with nothing to act on are marked aria-disabled rather than
// disabled, so a keyboard user who just pressed Clear keeps focus on it
// instead of being dropped back to the top of the page.

import * as state from "../state.js";

const FEEDBACK_MS = 2000;        // how long "Copied" stays on the button

/**
 * @param {{ textarea: HTMLTextAreaElement, readAloud: HTMLButtonElement,
 *   send: HTMLButtonElement, undo: HTMLButtonElement, clear: HTMLButtonElement,
 *   copy: HTMLButtonElement, announce: (message: string) => void,
 *   sendDialog: { dialog: HTMLDialogElement, sms: HTMLAnchorElement,
 *     email: HTMLAnchorElement, copy: HTMLButtonElement, close: HTMLButtonElement } }} parts
 *   announce speaks a short update through a hidden live region.
 */
export function initTypeBox({ textarea, readAloud, send, undo, clear, copy, announce, sendDialog }) {
  const label = (button) => button.querySelector(".tool-label");
  const isOff = (button) => button.getAttribute("aria-disabled") === "true";

  // ---------- typing ----------
  textarea.addEventListener("input", () => state.setText(textarea.value));

  // Cmd/Ctrl+Z in the box uses the app's undo (word by word), since the
  // browser's own undo doesn't know about taps.
  textarea.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
      event.preventDefault();
      state.undo();
    }
  });

  // ---------- Undo and Clear ----------
  undo.addEventListener("click", () => { if (!isOff(undo)) state.undo(); });
  clear.addEventListener("click", () => {
    if (isOff(clear)) return;
    state.clear();
    announce("Cleared. Undo brings it back.");
  });

  // ---------- Read aloud ----------
  // While speaking, the button becomes Stop.
  const canSpeak = "speechSynthesis" in window;
  if (!canSpeak) readAloud.hidden = true;
  let speaking = false;

  const setSpeaking = (on) => {
    speaking = on;
    readAloud.classList.toggle("is-active", on);
    label(readAloud).textContent = on ? "Stop" : "Read aloud";   // the name says what a tap does
    syncTools(state.getText());
  };

  readAloud.addEventListener("click", () => {
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const message = state.getText().trim();
    if (!message || isOff(readAloud)) return;
    speechSynthesis.cancel();                        // stop anything still queued
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = document.documentElement.lang || "en";
    utterance.rate = 0.9;                            // a little slower than default
    utterance.onend = utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    speechSynthesis.speak(utterance);
  });

  // ---------- Copy ----------
  let copyTimer = 0;
  copy.addEventListener("click", async () => {
    const message = state.getText().trim();
    if (!message || isOff(copy)) return;
    const ok = await copyText(message);
    if (!ok) {
      // Leave the text selected so the person can copy it by hand.
      textarea.focus();
      textarea.select();
    }
    clearTimeout(copyTimer);
    copy.classList.toggle("is-done", ok);
    label(copy).textContent = ok ? "Copied" : "Not copied";
    announce(ok ? "Copied" : "Not copied. The text is selected, so you can copy it yourself.");
    copyTimer = setTimeout(() => {
      copy.classList.remove("is-done");
      label(copy).textContent = "Copy";
    }, FEEDBACK_MS);
  });

  // ---------- Send ----------
  send.addEventListener("click", async () => {
    const message = state.getText().trim();
    if (!message || isOff(send)) return;
    if (navigator.share) {
      try {
        await navigator.share({ text: message });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;        // the person closed the share sheet
        // Otherwise fall back to the choices below.
      }
    }
    sendDialog.sms.href = `sms:?&body=${encodeURIComponent(message)}`;
    sendDialog.email.href = `mailto:?body=${encodeURIComponent(message)}`;
    sendDialog.dialog.showModal();
  });

  sendDialog.copy.addEventListener("click", async () => {
    const ok = await copyText(state.getText().trim());
    sendDialog.copy.lastChild.textContent = ok ? " Copied. Now paste it in your app." : " Not copied";
    announce(ok ? "Copied. Now paste it in your message app." : "Not copied");
  });
  // Close goes back to Send. The close event covers the Escape key too.
  const sendDone = () => {
    sendDialog.copy.lastChild.textContent = " Copy, then paste it";
    send.focus();
  };
  sendDialog.close.addEventListener("click", () => { sendDialog.dialog.close(); sendDone(); });
  sendDialog.dialog.addEventListener("close", sendDone);

  // ---------- redraw on every change ----------
  state.subscribe((text) => {
    if (textarea.value !== text) {
      textarea.value = text;
      // After a tap, put the caret at the end so typing continues there.
      // Don't focus the box: on tablets that would pop up the keyboard.
      textarea.setSelectionRange(text.length, text.length);
    }
    syncTools(text);
  });

  function syncTools(text) {
    const empty = text.trim() === "";
    setOff(undo, !state.canUndo());
    setOff(clear, text === "");
    setOff(readAloud, empty && !speaking);
    setOff(copy, empty);
    setOff(send, empty);
  }

  syncTools(state.getText());
}

function setOff(button, off) {
  button.setAttribute("aria-disabled", String(off));
}

/** Copy with the Clipboard API, falling back to the older copy command. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "");
    helper.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.append(helper);
    helper.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { /* not supported */ }
    helper.remove();
    return ok;
  }
}
