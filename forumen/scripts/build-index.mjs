// Build threads index + copy per-thread JSON + build authors index
// node scripts/build-index.mjs
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IN_DIR  = path.resolve(ROOT, "threads");
const OUT_DIR = path.resolve(ROOT, "content");
const OUT_THREADS_DIR = path.resolve(OUT_DIR, "threads");

function slugify(s){
  return String(s || "anon").trim().toLowerCase()
    .replace(/\s+/g, "-").replace(/[^a-z0-9-_.]+/g, "").slice(0, 64);
}

async function readThreads(){
  let files = [];
  try {
    files = await fs.readdir(IN_DIR);
  } catch {
    return [];
  }
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

function buildAuthorsIndex(threads){
  const map = new Map();
  function bump(name, id, kind){
    const key = id || slugify(name);
    const cur = map.get(key) || { author: name || "anon", author_id: key, posts:0, comments:0 };
    if (kind === "post") cur.posts++;
    else if (kind === "comment") cur.comments++;
    map.set(key, cur);
  }
  for (const t of threads){
    bump(t.author, t.author_id, "post");
    (function walk(list){
      if (!Array.isArray(list)) return;
      for (const c of list){
        bump(c.author, c.author_id, "comment");
        if (Array.isArray(c.replies)) walk(c.replies);
      }
    })(t.comments);
  }
  return Array.from(map.values())
    .sort((a,b)=> (b.posts+b.comments) - (a.posts+a.comments) || a.author.localeCompare(b.author));
}

async function main(){
  await fs.mkdir(OUT_THREADS_DIR, { recursive: true });

  const threads = await readThreads();

  // write threads index (compact set — то, что нужно главной странице)
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

  // copy per-thread JSON to /content/threads/<id>.json
  for (const t of threads){
    const dst = path.join(OUT_THREADS_DIR, `${t.id}.json`);
    await fs.writeFile(dst, JSON.stringify(t, null, 2), "utf8");
  }

  // authors index for /people.html
  const authors = buildAuthorsIndex(threads);
  await fs.writeFile(path.join(OUT_DIR, "authors-index.json"),
    JSON.stringify(authors, null, 2), "utf8");

  console.log(`Built: ${indexMinimal.length} threads, ${authors.length} authors.`);
}

main().catch(err => {
  console.error(err);
  process.exit(2);
});
