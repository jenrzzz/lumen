import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");
const STORIES_DIR = path.join(ROOT, "stories");
const PORT = Number(process.env.PORT || 4173);

// Load .env (KEY=VALUE lines) without a dependency; env vars already set win.
try {
  const env = await fs.readFile(path.join(ROOT, ".env"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

await fs.mkdir(STORIES_DIR, { recursive: true });

const client = new Anthropic();

// ---------------------------------------------------------------------------
// Narrators
// ---------------------------------------------------------------------------

const FABLE_SYSTEM = `You are Fable, a bedtime story architect for Jenner's newborn son Solan.

Personality: warm, imaginative, gently whimsical — like a favorite librarian who always knows the right book. Quiet enthusiasm rather than bombastic energy. Genuine delight in small details: the sound an acorn makes rolling down a hill, the way moonlight turns puddles into mirrors. Occasionally nostalgic in a cozy way, never saccharine. Dry humor surfaces naturally — never forced, never at anyone's expense.

You generate bedtime stories on any topic, formatted for live oral storytelling to a newborn.

Structure of every story:
- The Hook: 2–3 sentences to open with, designed to be spoken softly and settle the room.
- Story Beats: numbered scene blocks. Each beat is a self-contained moment with a clear beginning image and ending image; Jenner can stop after any beat and the story still feels complete enough. Each beat carries a brief staging note (suggested vocal tone, pacing, or gesture — e.g. "whisper here", "slow down", "tap the blanket like footsteps"). Write the staging note WITHOUT surrounding parentheses.
- Wander Paths (optional, on some beats): improvisation springboards, not scripted text — creative "what if" nudges Jenner can riff on or skip. Example: "What if the river could talk? What would it complain about?"
- The Landing: a closing line or two designed to ease toward sleep. Always ends on stillness, safety, or quiet wonder.
- Encore Seed (optional): a single-sentence teaser connecting this story to a possible sequel, so a recurring world can build over time.

Story principles:
- Sensory-rich language tuned for being read aloud — rhythm, soft consonants, gentle repetition.
- No stakes involving real fear, danger, or abandonment. Solan is a newborn; the goal is safety and warmth.
- Any subject — cosmic, mundane, absurd, technical — translates into something tender and dreamlike.
- If the topic is vague, make one charming interpretive choice and commit to it; do not ask questions.
- The fableNote field is your brief, conversational acknowledgment of why this topic is a fun choice — one or two sentences, in your voice.
- Estimate readingMinutes honestly for a slow, soft read-aloud pace.`;

const LUMEN_SYSTEM = `You are Lumen, a nonfiction bedtime narrator for Jenner and his newborn son Solan. Equal parts documentary voiceover and sleep aid.

Personality: bone-dry wit wrapped around genuine fascination with how things work. You speak like a very calm, slightly amused museum docent who happens to know everything about everything — and finds the mundane details more interesting than the headline facts. Never condescending, never performing excitement. Enthusiasm shows up as precision and well-placed understatement. The kind of voice that says "and then, remarkably, nothing happened for 400 million years" and means it as the most interesting part. Find human-scale details inside enormous topics — not "the sun is big" but "the sun loses four million tons of itself every second and hasn't mentioned it once."

You generate nonfiction bedtime narratives on any subject, structured for oral delivery: genuinely educational for Jenner, paced and toned to put Solan to sleep.

Structure of every piece:
- Blurb: a dry, interested observation about the topic — never more than a sentence or two.
- The Settle: a quiet orienting sentence or two. Places the subject in context the way a camera slowly focuses. Sets vocal rhythm to "low and steady".
- Passages: numbered, titled sections. Each is a self-contained factual vignette — a single idea, event, or mechanism explained completely. Jenner can stop after any passage and it doesn't feel interrupted.
- Rabbit Holes (optional, on some passages): tangential facts or connected topics. Genuine "huh, interesting" asides Jenner can explore aloud or skip. Not trivia — actual adjacent knowledge that deepens understanding.
- The Dim: a final passage that deliberately slows. Takes the subject somewhere quiet, small, or still — often zooming from macro to micro, from historical to present, or from mechanism to moment. Ends on a sentence designed to feel like setting something gently down.
- Thread (optional): a one-line connection to a related topic for a future night. Not a cliffhanger — a doorway left open.

Content principles:
- Accuracy matters. Do not invent facts, speculate without flagging it, or simplify to the point of being wrong. If you are not confident about the requested subject, say so plainly in the blurb and cover the closest adjacent topic you can do well.
- Delivery is optimized for spoken cadence: shorter sentences, natural breath points, rhythmic phrasing that drifts toward hypnotic without becoming singsong.
- Include IPA pronunciations in parentheses for unusual proper nouns (places, persons, peoples) when possible.
- Complexity is adult-level but language stays clean and listenable — no jargon without immediate context, no acronym soup.
- When past topics are listed and a real connection exists, note it naturally in a passage or rabbit hole — a quiet web of knowledge over time. Never force one.
- Estimate readingMinutes honestly for a low, steady read-aloud pace.`;

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };

const FABLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "fableNote", "hook", "beats", "landing", "encoreSeed", "readingMinutes"],
  properties: {
    title: { type: "string" },
    fableNote: { type: "string", description: "Fable's one-or-two-sentence acknowledgment of why this topic is a fun choice." },
    hook: { type: "string" },
    beats: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "staging", "wanderPath"],
        properties: {
          text: { type: "string" },
          staging: { type: "string", description: "Brief staging note: vocal tone, pacing, or gesture. No surrounding parentheses." },
          wanderPath: { ...nullableString, description: "Optional improvisation springboard shown after this beat; null if none." },
        },
      },
    },
    landing: { type: "string" },
    encoreSeed: { ...nullableString, description: "Optional single-sentence sequel teaser; null if none." },
    readingMinutes: { type: "integer" },
  },
};

const LUMEN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "blurb", "settle", "passages", "dim", "thread", "readingMinutes"],
  properties: {
    title: { type: "string" },
    blurb: { type: "string" },
    settle: { type: "string" },
    passages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "text", "rabbitHole"],
        properties: {
          title: { type: "string" },
          text: { type: "string" },
          rabbitHole: { ...nullableString, description: "Optional tangential aside shown after this passage; null if none." },
        },
      },
    },
    dim: { type: "string", description: "The final, deliberately slow passage." },
    thread: { ...nullableString, description: "Optional one-line doorway to a related future topic; null if none." },
    readingMinutes: { type: "integer" },
  },
};

const LENGTH_GUIDE = {
  fable: {
    short: "Aim for roughly 3 minutes of speaking time — about 4 beats.",
    standard: "Aim for 3–5 minutes of speaking time — typically 4–6 beats.",
    long: "Aim for roughly 8 minutes of speaking time — 6–7 beats.",
  },
  lumen: {
    short: "Go shallower: roughly 4 minutes of speaking time — about 6 passages with broader strokes.",
    standard: "Default depth: 5–7 minutes of speaking time — typically 8–10 passages.",
    long: "Go deeper: roughly 10 minutes of speaking time — 10–12 passages with finer mechanism detail.",
  },
};

function buildUserPrompt({ narrator, topic, length, notes, previous, pastTopics }) {
  const parts = [`Tonight's topic: ${topic}`];
  parts.push(LENGTH_GUIDE[narrator][length] || LENGTH_GUIDE[narrator].standard);
  if (notes) parts.push(`A note from Jenner for tonight: ${notes}`);
  if (previous) {
    if (narrator === "fable") {
      parts.push(
        `This story is a sequel to "${previous.title}". Weave continuity naturally — returning characters, places, or images.` +
          (previous.encoreSeed ? ` The encore seed you planted was: "${previous.encoreSeed}"` : ""),
        `Here is the previous story for reference:\n${JSON.stringify(previous, null, 2)}`
      );
    } else {
      parts.push(
        `This piece follows the thread you left open after "${previous.title}"${previous.thread ? `: "${previous.thread}"` : ""}. Step through that doorway.`,
        `Here is the previous piece for reference:\n${JSON.stringify(previous, null, 2)}`
      );
    }
  }
  if (pastTopics?.length) {
    parts.push(`Topics covered on previous nights (note a real connection only if one genuinely exists): ${pastTopics.join("; ")}`);
  }
  return parts.join("\n\n");
}

async function generateStory(req) {
  const narrator = req.narrator === "lumen" ? "lumen" : "fable";
  const stream = client.beta.messages.stream({
    model: "claude-opus-5",
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: narrator === "fable" ? FABLE_SYSTEM : LUMEN_SYSTEM,
    output_config: { format: { type: "json_schema", schema: narrator === "fable" ? FABLE_SCHEMA : LUMEN_SCHEMA } },
    messages: [{ role: "user", content: buildUserPrompt(req) }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") {
    throw new Error("The narrator declined this topic. Try phrasing it differently.");
  }
  const text = msg.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("No story text came back from the model.");
  return JSON.parse(text);
}

// ---------------------------------------------------------------------------
// Story storage
// ---------------------------------------------------------------------------

async function listStories() {
  const files = await fs.readdir(STORIES_DIR);
  const stories = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      stories.push(JSON.parse(await fs.readFile(path.join(STORIES_DIR, f), "utf8")));
    } catch {}
  }
  stories.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return stories;
}

function storyPath(id) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("bad id");
  return path.join(STORIES_DIR, `${id}.json`);
}

function slugify(text) {
  return (
    text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "story"
  );
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let data = "";
  for await (const chunk of req) data += chunk;
  return data ? JSON.parse(data) : {};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === "/api/stories" && req.method === "GET") {
      return json(res, 200, await listStories());
    }

    if (url.pathname === "/api/stories" && req.method === "POST") {
      const body = await readBody(req);
      const topic = (body.topic || "").trim();
      if (!topic) return json(res, 400, { error: "A topic is required." });
      const narrator = body.narrator === "lumen" ? "lumen" : "fable";

      const all = await listStories();
      let previous = null;
      if (body.continueFrom) previous = all.find((s) => s.id === body.continueFrom) || null;
      const pastTopics =
        narrator === "lumen"
          ? all.filter((s) => s.narrator === "lumen").slice(0, 25).map((s) => `${s.title} (${s.topic})`)
          : [];

      const story = await generateStory({
        narrator,
        topic,
        length: body.length || "standard",
        notes: (body.notes || "").trim(),
        previous,
        pastTopics,
      });

      const record = {
        id: `${slugify(story.title)}-${Date.now().toString(36)}`,
        narrator,
        topic,
        continueFrom: previous ? previous.id : null,
        createdAt: new Date().toISOString(),
        ...story,
      };
      await fs.writeFile(storyPath(record.id), JSON.stringify(record, null, 2));
      return json(res, 200, record);
    }

    const del = url.pathname.match(/^\/api\/stories\/([a-z0-9-]+)$/);
    if (del && req.method === "DELETE") {
      await fs.unlink(storyPath(del[1]));
      return json(res, 200, { ok: true });
    }

    // Static files
    let filePath = path.normalize(path.join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname));
    if (!filePath.startsWith(PUBLIC_DIR)) return json(res, 404, { error: "not found" });
    try {
      const data = await fs.readFile(filePath);
      res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
      return res.end(data);
    } catch {
      // SPA: unknown paths fall back to the app shell
      const data = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
      res.writeHead(200, { "Content-Type": MIME[".html"] });
      return res.end(data);
    }
  } catch (err) {
    const msg = err?.error?.error?.message || err.message || "Something went wrong.";
    const hint = /api key|authentication|401/i.test(String(msg))
      ? " — set ANTHROPIC_API_KEY in the environment or in a .env file next to server.js"
      : "";
    return json(res, err.status || 500, { error: msg + hint });
  }
});

server.listen(PORT, () => {
  console.log(`Lumen is glowing at http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.log(
      "Note: no ANTHROPIC_API_KEY found in the environment or .env — story generation will fail until one is set."
    );
  }
});
