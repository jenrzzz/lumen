# Lumen

A bedtime story library for Solan, with two narrators:

- **Fable** — fiction. Hook → Beats (with staging notes) → Wander Paths ✦ → The Landing → Encore Seed.
- **Lumen** — nonfiction. The Settle → Passages → Rabbit Holes ◇ → The Dim → Thread.

Stories are generated with Claude (claude-opus-5) and saved as JSON files in `stories/`,
so the library syncs wherever this folder does.

## Setup

```sh
npm install
cp .env.example .env   # then paste in your Anthropic API key
npm start              # → http://localhost:4173
```

## Notes for the reader (that's you)

- The reader keeps the screen awake and has an **Aa** button for bigger type in a dark room.
- The faint ✻ after each beat/passage marks a spot where the story can end early —
  tap it to jump straight to The Landing / The Dim.
- If a story ends with an Encore Seed or a Thread, a button in the footer continues it
  as a sequel with real continuity.
- Lumen is shown the shelf's past topics so it can quietly connect tonight's piece
  to earlier nights.
