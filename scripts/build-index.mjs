import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

const ROOT = process.cwd();
const STORIES_DIR = path.join(ROOT, "content", "stories");
const NOTES_DIR   = path.join(ROOT, "content", "notes");
const OUT_FILE    = path.join(ROOT, "content", "index.json");

async function listMd(dir){
  const items = await readdir(dir);
  const out = [];
  for (const f of items) {
    if (!f.endsWith(".md")) continue;
    const p = path.join(dir, f);
    const st = await stat(p);
    if (!st.isFile()) continue;
    const slug = f.replace(/\.md$/, "");
    const raw = await readFile(p, "utf8");
    const fm = matter(raw);
    out.push({ slug, ...fm.data, text: (fm.content || "").trim() });
  }
  return out;
}

function toDate(d){
  try{ return new Date(d).getTime() || 0; }catch{ return 0; }
}

const stories = (await listMd(STORIES_DIR))
  .map(s => ({
    id: s.slug,
    slug: s.slug,
    title: s.title || s.slug,
    date: s.date || "",
    minutes: Number.isFinite(s.minutes) ? s.minutes : 8,
    tags: Array.isArray(s.tags) ? s.tags : [],
    arc: s.arc || "kainrax",
    text: s.text || ""
  }))
  .sort((a,b)=> toDate(b.date) - toDate(a.date));

const notes = (await listMd(NOTES_DIR))
  .map(n => ({
    id: n.slug,
    slug: n.slug,
    title: n.title || n.slug,
    date: n.date || "",
    text: n.text || ""
  }))
  .sort((a,b)=> toDate(b.date) - toDate(a.date));

await writeFile(OUT_FILE, JSON.stringify({stories, notes}, null, 2), "utf8");
console.log(`Wrote ${OUT_FILE}: ${stories.length} stories, ${notes.length} notes`);
