// forumen/scripts/build-index.mjs
// Собирает индексы из forumen/threads/*.json и подключает рассказы из forumen/content/stories/*.html

import path from "node:path";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";

const CWD = process.cwd();                 // Netlify base = forumen
const THREADS_DIR = path.join(CWD, "threads");
const OUT_DIR = path.join(CWD, "content");
const STORIES_DIR = path.join(OUT_DIR, "stories");

function slugify(s){
  return String(s||"anon").trim().toLowerCase()
    .replace(/\s+/g,"-").replace(/[^a-z0-9-_.]+/g,"").slice(0,64);
}

async function safeJSON(file){
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch { return null }
}

async function listJson(dir){
  let files = [];
  try {
    files = (await readdir(dir)).filter(f => f.toLowerCase().endsWith(".json"));
  } catch { /* dir may not exist */ }
  return files.map(f => path.join(dir, f));
}

function countComments(arr){
  if (!Array.isArray(arr)) return 0;
  let n = 0;
  for (const c of arr){
    n += 1;
    if (Array.isArray(c.replies)) n += countComments(c.replies);
  }
  return n;
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

// -------- истории (stories) --------
// В каждом HTML-рассказе ищем <script type="application/json" id="kx-story">{ people:[...], title:"..." }</script>
async function scanStories(){
  const map = new Map(); // author_id -> [{title,url}]
  let files = [];
  try {
    files = (await readdir(STORIES_DIR)).filter(f => f.toLowerCase().endsWith(".html"));
  } catch { return map } // папки может не быть — ок

  for (const f of files){
    const full = path.join(STORIES_DIR, f);
    const html = await readFile(full, "utf8");
    const m = html.match(/<script[^>]*id=["']kx-story["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!m) continue;

    let meta;
    try { meta = JSON.parse(m[1]); } catch { continue; }

    const title = (meta && meta.title) || f.replace(/\.html$/,"");
    const url = `/content/stories/${f}`;
    const people = Array.isArray(meta?.people)
      ? meta.people
      : typeof meta?.people === "string" ? [meta.people] : [];

    for (const pid of people){
      if (!pid) continue;
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid).push({ title, url });
    }
  }
  return map;
}

// -------- индексы --------
async function buildIndexes(){
  await mkdir(OUT_DIR, { recursive: true });

  // 1) Индекс тредов и комментариев
  const files = await listJson(THREADS_DIR);
  const threads = [];
  const commentsAll = [];

  for (const f of files){
    const t = await safeJSON(f);
    if (!t || !t.id) continue;

    const cc = countComments(t.comments);
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
      commentCount: cc
    });

    commentsAll.push(...flattenComments(t));
  }

  // сортировки по дате
  threads.sort((a,b)=> new Date(b.created) - new Date(a.created));
  commentsAll.sort((a,b)=> new Date(b.created) - new Date(a.created));

  await writeFile(path.join(OUT_DIR, "threads-index.json"), JSON.stringify(threads, null, 2), "utf8");
  await writeFile(path.join(OUT_DIR, "comments-index.json"), JSON.stringify(commentsAll, null, 2), "utf8");

  // 2) Индекс авторов + истории
  const storyMap = await scanStories();
  const authors = new Map(); // id -> record

  const touch = (id, name) => {
    if (!authors.has(id)) authors.set(id, { author_id:id, author:name||id, posts:0, comments:0, stories:[] });
    const a = authors.get(id);
    if (name && (!a.author || a.author === id)) a.author = name;
    return a;
  };

  for (const t of threads){
    touch(t.author_id, t.author).posts++;
  }
  for (const c of commentsAll){
    touch(c.author_id, c.author).comments++;
  }
  // истории
  for (const [aid, list] of storyMap.entries()){
    touch(aid, authors.get(aid)?.author).stories.push(...list);
  }

  const authorsArr = Array.from(authors.values())
    .sort((a,b)=> (b.posts+b.comments) - (a.posts+a.comments) || a.author.localeCompare(b.author));

  await writeFile(path.join(OUT_DIR, "authors-index.json"), JSON.stringify(authorsArr, null, 2), "utf8");

  console.log(`Built: ${threads.length} threads, ${commentsAll.length} comments, ${authorsArr.length} authors`);
}

buildIndexes().catch(err => {
  console.error(err);
  process.exit(2);
});
