import { readdir, readFile, writeFile, stat, mkdir } from "node:fs/promises";
import path from "node:path";

let matter;
try {
  ({ default: matter } = await import("gray-matter"));
} catch (e) {
  console.error("❌ gray-matter не установлен. Убедись, что Netlify запускает `npm ci`.");
  process.exit(2);
}

const ROOT = process.cwd();
const STORIES_DIR = path.join(ROOT, "content", "stories");
const NOTES_DIR   = path.join(ROOT, "content", "notes");
const OUT_FILE    = path.join(ROOT, "content", "index.json");

async function ensureDir(dir) {
  try { await mkdir(dir, { recursive: true }); } catch {}
}

async function listMd(dir){
  try {
    const items = await readdir(dir);
    const out = [];
    for (const f of items) {
      if (!f.endsWith(".md")) continue;
      const p = path.join(dir, f);
      let st;
      try { st = await stat(p); } catch { continue; }
      if (!st.isFile()) continue;
      const slug = f.replace(/\.md$/, "");
      const raw = await readFile(p, "utf8");
      const fm = matter(raw);
      out.push({ slug, ...fm.data, text: (fm.content || "").trim() });
    }
    return out;
  } catch (e) {
    // Папка может быть пуста/не существовать — не падаем.
    return [];
  }
}

function toDate(d){
  try{ return new Date(d).getTime() || 0; }catch{ return 0; }
}

await ensureDir(path.join(ROOT, "content"));
await ensureDir(STORIES_DIR);
await ensureDir(NOTES_DIR);

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

// Если вообще пусто — всё равно пишем валидный JSON, чтобы сайт не умер.
const payload = { stories, notes };
await writeFile(OUT_FILE, JSON.stringify(payload, null, 2), "utf8");
console.log(`✅ Wrote ${OUT_FILE}: ${stories.length} stories, ${notes.length} notes`);
