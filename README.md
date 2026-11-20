# Writing Helper

A web app that helps people with Broca's (non-fluent) aphasia write short messages: texts, emails, posts and searches.

**Live:** https://axanderz.github.io/aphasia-writing-helper/

- **Sentence starters**: "I want", "I need", "Can you", "Where is"…
- **Pictures** by category: people, food, places, feelings, actions.
- **Four big suggestion buttons** that offer the next word or fix a misspelling ("fone" → phone).
- **Read aloud, Undo, Clear and Copy**, then paste the message anywhere.

## Privacy

Everything runs in your browser. There is no server, no account and no analytics, and your text never leaves the device. Next-word suggestions come from a small AI model (Qwen2.5-0.5B-Instruct) that runs on your own device through [Transformers.js](https://huggingface.co/docs/transformers.js). It downloads once (about 500 MB) and the browser keeps it. Until it's ready, or if the device can't run it, the app uses its built-in word lists.

Add `?ai=off` to the address to skip the model.

## Run it locally

Plain HTML, CSS and JavaScript, with no build step:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how it fits together.
