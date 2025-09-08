// forumen/scripts/build-index.mjs
// Собирает индексы из forumen/threads/*.json
// + безопасно подмешивает истории из forumen/content/stories/*.html (если есть)

import path from "node:path";
import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";

const ROOT = process.cwd();                 // Netlify base = forumen
const THREADS_DIR = path.join(ROOT, "threads");
const OUT_DIR     = path.join(ROOT, "content");
const STORIES_DIR = path.join(OUT_DIR, "stories");

const isJson = (f) => f.toLowerCase().endsWith(".json");

const slugify = (s) =>
  String(s || "anon").trim().toLowerCase()
    .replace(/\s+/g, "-").replace(/[^a-z0-9-_.]+/g, "").slice(0, 64);

async function readJsonSafe(file) {
  try {
    const txt = await readFile(file, "utf8");
    return JSON.parse(txt);
  } catch (e) {
    console.warn(`! skip broken JSON: ${file} — ${e.message}`);
    return null;
  }
}

async function listJsonFiles(dir) {
  try {
    const items = await readdir(dir);
    const files = [];
    for (const name of items) {
      const full = path.join(dir, name);
      const st = await stat(full);
      if (st.isFile() && isJson(name)) files.push(full);
    }
    return files;
  } catch (e) {
    if (e.code === "ENOENT") return []; // папки может не быть
    throw e;
  }
}

function countComments(list) {
  if (!Array.isArray(list)) return 0;
  let n = 0;
  for (const c of list) {
    n += 1;
    if (Array.isArray(c.replies)) n += countComments(c.replies);
  }
  return n;
}

function flattenComments(thread) {
  const out = [];
  (function walk(list) {
    if (!Array.isArray(list)) return;
    for (const c of list) {
      out.push({
        thread_id: thread.id,
        thread_title: thread.title,
        comment_id: c.id,
        author: c.author,
        author_id: c.author_id || slugify(c.author),
        sector: c.sector,
        created: c.created,
        body: c.body,
      });
      if (Array.isArray(c.replies)) walk(c.replies);
    }
  })(thread.comments);
  return out;
}

// --- истории из /content/stories/*.html (необязательно) ---
async function scanStories() {
  const map = new Map(); // author_id -> [{title,url}]
  let files = [];
  try {
    files = (await readdir(STORIES_DIR))
      .filter((f) => f.toLowerCase().endsWith(".html"));
  } catch (e) {
    if (e.code === "ENOENT") return map;
    throw e;
  }
  for (const name of files) {
    const full = path.join(STORIES_DIR, name);
    const html = await readFile(full, "utf8");
    const m = html.match(
      /<script[^>]*id=["']kx-story["'][^>]*>([\s\S]*?)<\/script>/i
    );
    if (!m) continue;
    let meta;
    try { meta = JSON.parse(m[1]); } catch { continue; }
    const title = (meta && meta.title) || name.replace(/\.html$/i, "");
    const url = `/content/stories/${name}`;
    const people = Array.isArray(meta?.people)
      ? meta.people
      : typeof meta?.people === "string" ? [meta.people] : [];
    for (const pid of people) {
      if (!pid) continue;
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid).push({ title, url });
    }
  }
  return map;
}

async function build() {
  await mkdir(OUT_DIR, { recursive: true });

  // 1) threads + comments
  const files = await listJsonFiles(THREADS_DIR);
  const threads = [];
  const comments = [];

  for (const f of files) {
    const t = await readJsonSafe(f);
    if (!t || !t.id) continue;

    const commentCount = countComments(t.comments);
    threads.push({
      id: t.id,
      title: t.title || "Untitled",
      author: t.author || "anon",
      author_id: t.author_id || slugify(t.author),
      sector: t.sector || "",
      board: t.board || "",
      tags: Array.isArray(t.tags) ? t.tags : [],
      created: t.created || "",
      body: t.body || "",
      commentCount,
    });

    comments.push(...flattenComments(t));
  }

  threads.sort((a, b) => new Date(b.created) - new Date(a.created));
  comments.sort((a, b) => new Date(b.created) - new Date(a.created));

  await writeFile(
    path.join(OUT_DIR, "threads-index.json"),
    JSON.stringify(threads, null, 2),
    "utf8"
  );
  await writeFile(
    path.join(OUT_DIR, "comments-index.json"),
    JSON.stringify(comments, null, 2),
    "utf8"
  );

  // 2) authors (+stories, если есть)
  const stories = await scanStories();
  const authors = new Map();

  const touch = (id, name) => {
    if (!authors.has(id)) {
      authors.set(id, { author_id: id, author: name || id, posts: 0, comments: 0, stories: [] });
    }
    const a = authors.get(id);
    if (name && (!a.author || a.author === id)) a.author = name;
    return a;
  };

  for (const t of threads) touch(t.author_id, t.author).posts++;
  for (const c of comments) touch(c.author_id, c.author).comments++;

  for (const [aid, list] of stories.entries()) {
    touch(aid, authors.get(aid)?.author).stories.push(...list);
  }

  const authorsArr = Array.from(authors.values())
    .sort((a, b) =>
      (b.posts + b.comments) - (a.posts + a.comments) ||
      a.author.localeCompare(b.author)
    );

  await writeFile(
    path.join(OUT_DIR, "authors-index.json"),
    JSON.stringify(authorsArr, null, 2),
    "utf8"
  );

  console.log(
    `Built OK: ${threads.length} threads, ${comments.length} comments, ${authorsArr.length} authors`
  );
}

build().catch((e) => {
  console.error("Build failed:", e);
  process.exit(2);
});
