const app = document.getElementById("app");

let stories = [];
let wakeLock = null;

const NUMBER_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

const DREAM_LINES = {
  fable: [
    "Fable is listening to the dark…",
    "finding the soft consonants…",
    "teaching the moon its lines…",
    "tucking in the edges of the story…",
    "asking the river how it feels about this…",
  ],
  lumen: [
    "Lumen is consulting the archive…",
    "verifying the boring parts. They are the best parts…",
    "adjusting the projector…",
    "double-checking a date from 1887…",
    "finding the small thing inside the enormous thing…",
  ],
};

// ------------------------------------------------------------------ helpers

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

async function loadStories() {
  stories = await api("/api/stories");
}

// ---------------------------------------------------------------- home view

function renderHome() {
  releaseWakeLock();
  document.title = "Lumen — bedtime stories for Solan";
  const cards = stories
    .map((s) => {
      const isFable = s.narrator === "fable";
      const seed = isFable ? s.encoreSeed : s.thread;
      const continues = s.continueFrom && stories.find((p) => p.id === s.continueFrom);
      return `
        <a class="card card-${s.narrator}" href="#/story/${s.id}">
          <span class="card-eyebrow">${isFable ? "Fable" : "Lumen"} · ~${s.readingMinutes} min · ${fmtDate(s.createdAt)}</span>
          <h3>${esc(s.title)}</h3>
          <p class="card-topic">${continues ? `continues “${esc(continues.title)}” · ` : ""}about ${esc(s.topic)}</p>
          ${seed ? `<span class="card-seed">${isFable ? "✦ an encore is waiting" : "◇ a thread is left open"}</span>` : ""}
        </a>`;
    })
    .join("");

  app.innerHTML = `
    <header class="masthead">
      <div class="masthead-moon" aria-hidden="true"></div>
      <h1>Lumen</h1>
      <p class="tagline">bedtime stories for Solan</p>
    </header>
    <form class="tell-form" id="tellForm">
      <div class="narrator-toggle" role="radiogroup" aria-label="Narrator">
        <label class="narr narr-fable">
          <input type="radio" name="narrator" value="fable" checked />
          <span><strong>Fable</strong><small>a story</small></span>
        </label>
        <label class="narr narr-lumen">
          <input type="radio" name="narrator" value="lumen" />
          <span><strong>Lumen</strong><small>the true kind</small></span>
        </label>
      </div>
      <input class="topic-input" name="topic" autocomplete="off" placeholder="Tonight is about…" aria-label="Topic" />
      <div class="form-row">
        <select class="length-select" name="length" aria-label="Length">
          <option value="short">short</option>
          <option value="standard" selected>standard</option>
          <option value="long">long</option>
        </select>
        <input class="notes-input" name="notes" autocomplete="off" placeholder="anything else? softer, sillier, deeper…" aria-label="Notes" />
        <button class="tell-btn" type="submit">Tell it</button>
      </div>
      <p class="form-error" id="formError" hidden></p>
    </form>
    <section class="library">
      <h2 class="library-label">The shelf</h2>
      <div class="shelf">
        ${cards || `<p class="shelf-empty">Nothing on the shelf yet. Ask for the first one.</p>`}
      </div>
    </section>`;

  document.getElementById("tellForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    await tellStory({
      narrator: f.get("narrator"),
      topic: f.get("topic").trim(),
      length: f.get("length"),
      notes: f.get("notes").trim(),
    });
  });
}

// -------------------------------------------------------------- generation

async function tellStory(req) {
  if (!req.topic) {
    const err = document.getElementById("formError");
    if (err) {
      err.textContent = "It needs a topic — anything at all.";
      err.hidden = false;
    }
    return;
  }
  showDreaming(req.narrator);
  try {
    const story = await api("/api/stories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    stories.unshift(story);
    location.hash = `#/story/${story.id}`;
  } catch (err) {
    hideDreaming();
    if (location.hash && location.hash !== "#/") route();
    const el = document.getElementById("formError");
    if (el) {
      el.textContent = err.message;
      el.hidden = false;
    } else {
      alert(err.message);
    }
  } finally {
    hideDreaming();
  }
}

let dreamTimer = null;

function showDreaming(narrator) {
  const lines = DREAM_LINES[narrator] || DREAM_LINES.fable;
  const el = document.createElement("div");
  el.className = `dreaming dreaming-${narrator}`;
  el.id = "dreaming";
  el.innerHTML = `
    <div class="dream-moon" aria-hidden="true"></div>
    <p class="dream-line">${esc(lines[0])}</p>
    <p class="dream-sub">this takes a minute or two — worth it</p>`;
  document.body.appendChild(el);
  let i = 1;
  dreamTimer = setInterval(() => {
    const line = el.querySelector(".dream-line");
    if (line) line.textContent = lines[i++ % lines.length];
  }, 5000);
}

function hideDreaming() {
  clearInterval(dreamTimer);
  document.getElementById("dreaming")?.remove();
}

// -------------------------------------------------------------- reader view

function landMark(endingLabel) {
  return `
    <button type="button" class="land-mark" data-land aria-label="A good place to land — skip to ${endingLabel}">
      ✻<span class="land-hint">a good place to land — tap for ${endingLabel}</span>
    </button>`;
}

function renderReader(id) {
  const s = stories.find((x) => x.id === id);
  if (!s) {
    location.hash = "#/";
    return;
  }
  document.title = `${s.title} — Lumen`;
  const isFable = s.narrator === "fable";
  const endingLabel = isFable ? "the landing" : "the dim";

  let body;
  if (isFable) {
    body = `
      <section class="passage">
        <h2 class="passage-label">The Hook</h2>
        <p class="staging">spoken softly, to settle the room</p>
        <p class="passage-text">${esc(s.hook)}</p>
      </section>
      ${landMark(endingLabel)}
      ${s.beats
        .map(
          (b, i) => `
        <section class="passage">
          <h2 class="passage-label">Beat ${NUMBER_WORDS[i] || i + 1}</h2>
          <p class="staging">${esc(b.staging)}</p>
          <p class="passage-text">${esc(b.text)}</p>
          ${b.wanderPath ? `<aside class="aside"><span class="aside-mark">✦</span>${esc(b.wanderPath)}</aside>` : ""}
        </section>
        ${landMark(endingLabel)}`
        )
        .join("")}
      <section class="passage ending" id="ending">
        <h2 class="passage-label">The Landing</h2>
        <p class="passage-text">${esc(s.landing)}</p>
      </section>`;
  } else {
    body = `
      <section class="passage">
        <h2 class="passage-label">The Settle</h2>
        <p class="staging">low and steady</p>
        <p class="passage-text">${esc(s.settle)}</p>
      </section>
      ${landMark(endingLabel)}
      ${s.passages
        .map(
          (p, i) => `
        <section class="passage">
          <h2 class="passage-label">Passage ${NUMBER_WORDS[i] || i + 1}</h2>
          <h3 class="passage-title">${esc(p.title)}</h3>
          <p class="passage-text">${esc(p.text)}</p>
          ${p.rabbitHole ? `<aside class="aside"><span class="aside-mark">◇</span>${esc(p.rabbitHole)}</aside>` : ""}
        </section>
        ${landMark(endingLabel)}`
        )
        .join("")}
      <section class="passage ending" id="ending">
        <h2 class="passage-label">The Dim</h2>
        <p class="passage-text">${esc(s.dim)}</p>
      </section>`;
  }

  const seed = isFable ? s.encoreSeed : s.thread;
  const foot = `
    <footer class="story-foot">
      ${seed ? `<p class="seed"><span class="aside-mark">${isFable ? "✦" : "◇"}</span>${esc(seed)}</p>` : ""}
      ${seed ? `<button type="button" class="continue-btn" id="continueBtn">${isFable ? "Tell the encore" : "Follow the thread"}</button>` : ""}
      <p class="made-on">told ${fmtDate(s.createdAt)} · about ${esc(s.topic)}</p>
    </footer>`;

  app.innerHTML = `
    <article class="reader reader-${s.narrator}">
      <nav class="reader-nav">
        <a class="back" href="#/">← the shelf</a>
        <div class="reader-tools">
          <button type="button" class="tool-btn" id="fontToggle" aria-label="Toggle larger text">Aa</button>
          <button type="button" class="tool-btn" id="deleteBtn">remove</button>
        </div>
      </nav>
      <header class="story-head">
        <p class="story-eyebrow">${isFable ? "A story from Fable" : "As told by Lumen"} · ~${s.readingMinutes} min</p>
        <h1 class="story-title">${esc(s.title)}</h1>
        <p class="narrator-note">${esc(isFable ? s.fableNote : s.blurb)}</p>
      </header>
      ${body}
      ${foot}
    </article>`;

  app.querySelectorAll("[data-land]").forEach((btn) =>
    btn.addEventListener("click", () => document.getElementById("ending").scrollIntoView({ behavior: "smooth", block: "start" }))
  );

  document.getElementById("fontToggle").addEventListener("click", () => {
    const bigger = document.documentElement.classList.toggle("bigger");
    localStorage.setItem("lumen-bigger", bigger ? "1" : "");
  });

  document.getElementById("deleteBtn").addEventListener("click", async () => {
    if (!confirm(`Remove “${s.title}” from the shelf?`)) return;
    await api(`/api/stories/${s.id}`, { method: "DELETE" });
    stories = stories.filter((x) => x.id !== s.id);
    location.hash = "#/";
  });

  document.getElementById("continueBtn")?.addEventListener("click", () =>
    tellStory({
      narrator: s.narrator,
      topic: isFable ? `a sequel to “${s.title}”` : `the thread left open after “${s.title}”`,
      length: "standard",
      notes: "",
      continueFrom: s.id,
    })
  );

  requestWakeLock();
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------- wake lock

async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request("screen");
  } catch {}
}

function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && location.hash.startsWith("#/story/")) requestWakeLock();
});

// ---------------------------------------------------------------- routing

function route() {
  const m = location.hash.match(/^#\/story\/([a-z0-9-]+)/);
  if (m) renderReader(m[1]);
  else renderHome();
}

window.addEventListener("hashchange", route);

if (localStorage.getItem("lumen-bigger")) document.documentElement.classList.add("bigger");

loadStories()
  .then(route)
  .catch((err) => {
    app.innerHTML = `<p class="shelf-empty">Couldn't reach the shelf: ${esc(err.message)}</p>`;
  });
