// llmClient.js: the page's side of the LLM worker.
//
// Starts the worker, reports its status ("off", "loading", "ready",
// "unavailable") and sends next-word requests. Every request gets an id;
// replies to anything but the newest request are dropped, so a slow
// answer can never overwrite newer suggestions.
//
// Turn the model off with ?ai=off in the address. The app then uses the
// backup word lists only. ?ai=debug logs the model's raw replies.

/**
 * @param {{ onStatus?: (status: string, detail?: object) => void }} [options]
 */
export function createLLMClient({ onStatus = () => {} } = {}) {
  let status = "off";
  let worker = null;
  let latestId = 0;
  const waiting = new Map();     // id → resolve

  const setStatus = (next, detail = {}) => {
    status = next;
    onStatus(next, detail);
  };

  const aiParam = new URLSearchParams(location.search).get("ai");
  const disabled = aiParam === "off";
  const debug = aiParam === "debug";       // ?ai=debug logs the model's raw replies
  if (disabled || typeof Worker === "undefined") {
    setStatus("off");
  } else {
    try {
      worker = new Worker(new URL("./llm.worker.js", import.meta.url), { type: "module" });
      worker.addEventListener("message", ({ data }) => {
        if (data.type === "status") {
          if (data.status === "unavailable") {
            console.warn("AI suggestions unavailable:", data.reason);
            settleAll();
          }
          setStatus(data.status, data);
        }
        if (data.type === "result") {
          if (data.error) console.warn("AI suggestion failed:", data.error);
          if (debug) console.log(`AI raw #${data.id}${data.id === latestId ? "" : " (outdated)"}:`, JSON.stringify(data.raw));
          waiting.get(data.id)?.(data.id === latestId ? data.raw : null);
          waiting.delete(data.id);
        }
      });
      // A worker that fails to start (e.g. the library can't download)
      worker.addEventListener("error", (event) => {
        console.warn("AI worker error:", event.message);
        settleAll();
        setStatus("unavailable");
      });
      setStatus("loading", { progress: 0 });
      worker.postMessage({ type: "load" });
    } catch (error) {
      console.warn("AI worker could not start:", error);
      setStatus("unavailable");
    }
  }

  /** Answer every open request with null (no AI words). */
  function settleAll() {
    for (const resolve of waiting.values()) resolve(null);
    waiting.clear();
  }

  return {
    get status() {
      return status;
    },

    /**
     * Ask for next-word guesses. Resolves with the model's raw text, or
     * null if the model isn't ready or a newer request replaced this one.
     */
    predict(text) {
      if (status !== "ready") return Promise.resolve(null);
      const id = ++latestId;
      // Older requests still waiting will never be used: settle them now.
      for (const [oldId, resolve] of waiting) {
        resolve(null);
        waiting.delete(oldId);
      }
      return new Promise((resolve) => {
        waiting.set(id, resolve);
        worker.postMessage({ type: "predict", id, text });
      });
    },
  };
}
