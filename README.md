# Writing Helper

A web app that helps people with Broca's (non-fluent) aphasia write short messages: texts, emails, posts and searches.

**Live:** https://axanderz.github.io/aphasia-writing-helper/

- **Sentence starters**: "I want", "I need", "Can you", "Where is"…
- **Core words** (I, you, want, go, not, more…) that never move, colored by the Fitzgerald Key, so they can be found by position.
- **Pictures** by category: people, food, places, feelings, actions.
- **Four big suggestion buttons** that offer the next word or fix a misspelling ("fone" → phone).
- **My phrases**: whole messages saved for one-tap reuse, and an **About my aphasia** card to show someone face to face.
- **Read aloud, Send, Undo, Clear and Copy.** Send opens the device's share sheet (Messages, WhatsApp, Mail…).
- **Setup** for a speech therapist or family member: names with photos, phrases, the card text and the layout side, with a backup file.
- Starters and phrases sit on the left on wide screens, since a left-side stroke often makes the right side of what someone sees hard to notice. Setup can move them right.

## Privacy

Everything runs in your browser. There is no server, no account and no analytics, and your text never leaves the device unless you tap Send. Names, photos and phrases from Setup are stored in this browser only. Next-word suggestions come from a small AI model (Qwen2.5-0.5B-Instruct) that runs on your own device through [Transformers.js](https://huggingface.co/docs/transformers.js). It downloads once (about 500 MB) and the browser keeps it. Until it's ready, or if the device can't run it, the app uses its built-in word lists.

Add `?ai=off` to the address to skip the model.

## Run it locally

Plain HTML, CSS and JavaScript, with no build step:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how it fits together.
