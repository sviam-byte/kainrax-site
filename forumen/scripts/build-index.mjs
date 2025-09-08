// forumen/scripts/build-index.mjs
// Build threads index + copy per-thread JSON + build authors index + comments index
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const IN_DIR  = path.resolve(ROOT, "threads");
const OUT_DIR = path.resolve(ROOT, "content");
const OUT_THREADS_DIR = path.resolve(OUT_DIR, "threads");
const STORIES_DIR = path.resolve(OUT_DIR, "stories"); // опционально

function slugify(s){
  return String(s || "anon").trim().toLowerCase()
    .replace(/\s+/g, "-").replace(/[^a-z0-9-_.]+/g, "").slice(0, 64);
}

async function safeReaddir(dir){
  try { return await fs.readdir(dir); } catch { return []; }
}
async function safeRead(file, enc="utf8"){
  try { return await fs.readFile(file, enc); } catch { return null; }
}

async function readThreads(){
  const files = await safeReaddir(IN_DIR);
  const out = [];
  for (const f of files){
    if (!f.endsWith(".json")) continue;
    const p = path.join(IN_DIR, f);
    try{
      const raw = await fs.readFile(p, "utf8");
      const t = JSON.parse(raw);
      if (!t.id) t.id = f.replace(/\.json$/,"");
      // quick derived fields
      let commentCount = 0;
      (function walk(list){
        if (!Array.isArray(list)) return;
        for (const c of list){ commentCount++; if (Array.isArray(c.replies)) walk(c.replies); }
      })(t.comments);
      t.commentCount = commentCount;
      out.push(t);
    }catch(e){
      console.error("Bad JSON:", f, e.message);
    }
  }
  return out;
}

function flattenComments(thread){
  const out = [];
  (function walk(list){
    if (!Array.isArray(list)) return;
    for (const c of list){
      out.push({
        thread_id: thread.id,
        thread_title: thread.title,
        comment_id: c.id,
        author: c.author,
        author_id: c.author_id || slugify(c.author),
        sector: c.sector,
        created: c.created,
        body: c.body
      });
      if (Array.isArray(c.replies)) walk(c.replies);
    }
  })(thread.comments);
  return out;
}

// сканируем /content/stories/*.html и вытаскиваем people -> [{title,url}]
async function scanStories(){
  const files = await safeReaddir(STORIES_DIR);
  const map = new Map(); // author_id -> [{title,url}]
  for (const f of files){
    if (!f.toLowerCase().endsWith(".html")) continue;
    const full = path.join(STORIES_DIR, f);
    const html = await safeRead(full);
    if (!html) continue;
    const m = html.match(/<script[^>]*id=["']kx-story["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!m) continue;
    let meta;
    try { meta = JSON.parse(m[1]); } catch { continue; }
    const title = (meta && meta.title) || f.replace(/\.html$/i,"");
    const url = `/content/stories/${f}`;
    const people = Array.isArray(meta?.people) ? meta.people
                  : typeof meta?.people === "string" ? [meta.people] : [];
    for (const pid of people){
      if (!pid) continue;
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid).push({ title, url });
    }
  }
  return map;
}

function buildAuthorsIndex(threads, comments, storiesMap){
  const map = new Map();
  function bump(name, id, kind){
    const key = id || slugify(name);
    const cur = map.get(key) || { author: name || "anon", author_id: key, posts:0, comments:0, stories:[] };
    if (kind === "post") cur.posts++;
    else if (kind === "comment") cur.comments++;
    map.set(key, cur);
  }
  for (const t of threads) bump(t.author, t.author_id, "post");
  for (const c of comments) bump(c.author, c.author_id, "comment");

  // приклеим истории
  for (const [aid, list] of (storiesMap || new Map()).entries()){
    if (!map.has(aid)) map.set(aid, { author: aid, author_id: aid, posts:0, comments:0, stories:[] });
    map.get(aid).stories.push(...list);
  }

  return Array.from(map.values())
    .sort((a,b)=> (b.posts+b.comments) - (a.posts+a.comments) || a.author.localeCompare(b.author));
}

async function main(){
  await fs.mkdir(OUT_THREADS_DIR, { recursive: true });

  const threads = await readThreads();

  // index для главной
  const indexMinimal = threads.map(t => ({
    id: t.id,
    title: t.title || "Untitled",
    author: t.author || "anon",
    author_id: t.author_id || slugify(t.author),
    sector: t.sector || "",
    board:  t.board  || "",
    tags:   Array.isArray(t.tags) ? t.tags : [],
    created: t.created || "",
    body:   t.body || "",
    commentCount: t.commentCount || 0
  })).sort((a,b)=> new Date(b.created || 0) - new Date(a.created || 0));

  await fs.writeFile(path.join(OUT_DIR, "threads-index.json"),
    JSON.stringify(indexMinimal, null, 2), "utf8");

  // по-тредовые JSON
  for (const t of threads){
    const dst = path.join(OUT_THREADS_DIR, `${t.id}.json`);
    await fs.writeFile(dst, JSON.stringify(t, null, 2), "utf8");
  }

  // comments-index.json для author.html
  const flatComments = threads.flatMap(flattenComments)
    .sort((a,b)=> new Date(b.created || 0) - new Date(a.created || 0));
  await fs.writeFile(path.join(OUT_DIR, "comments-index.json"),
    JSON.stringify(flatComments, null, 2), "utf8");

  // authors-index.json (+stories)
  const storiesMap = await scanStories(); // безопасно: если папки нет — пусто
  const authors = buildAuthorsIndex(indexMinimal, flatComments, storiesMap);
  await fs.writeFile(path.join(OUT_DIR, "authors-index.json"),
    JSON.stringify(authors, null, 2), "utf8");

  console.log(`Built: ${indexMinimal.length} threads, ${flatComments.length} comments, ${authors.length} authors.`);
}

main().catch(err => {
  console.error(err);
  process.exit(2);
});
