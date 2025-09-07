// netlify/functions/content-index.js
const fs = require("fs/promises");
const path = require("path");
const matter = require("gray-matter");

// ── где лежит контент внутри лямбды (esbuild + included_files) ────────────────
const ROOT = path.resolve(process.env.LAMBDA_TASK_ROOT || process.cwd());
const DIR_CONTENT  = path.join(ROOT, "content");
const DIR_STORIES  = path.join(DIR_CONTENT, "stories");
const DIR_NOTES    = path.join(DIR_CONTENT, "notes");
const DIR_ARTICLES = path.join(DIR_CONTENT, "articles");

// ── утилиты ───────────────────────────────────────────────────────────────────
async function safeStat(p) {
  try { return await fs.stat(p); } catch { return null; }
}
async function listMd(dir) {
  try {
    const s = await safeStat(dir);
    if (!s || !s.isDirectory()) return [];
    const files = await fs.readdir(dir, { withFileTypes: true });
    return files.filter(f => f.isFile() && /\.md$/i.test(f.name)).map(f => f.name);
  } catch { return []; }
}
function toMinutesStory(text) {
  const len = (text || "").length;
  return Math.max(5, Math.round(len / 1100));
}
function toMinutesArticle(text) {
  const len = (text || "").length;
  return Math.max(6, Math.round(len / 1000));
}
function pickWorldYear(data) {
  let w = data.worldYear ?? data.world_year ?? data.year ?? data.y ?? data.wy ?? null;
  if (typeof w === "string") {
    const m = w.match(/-?\d+/);
    w = m ? Number(m[0]) : NaN;
  }
  return Number.isFinite(w) ? Math.trunc(w) : null;
}
function mdToStory(file, parsed) {
  const base = file.replace(/\.md$/i, "");
  const text = parsed.content || "";
  const worldYear = pickWorldYear(parsed.data);
  return {
    id: base,
    slug: parsed.data.slug || base,
    title: (parsed.data.title || base).toString().trim(),
    date: String(parsed.data.date || ""),
    minutes: parsed.data.minutes || toMinutesStory(text),
    arc: parsed.data.arc || "kainrax",
    tags: parsed.data.tags || [],
    annotation: parsed.data.annotation || parsed.data.anno || "",
    worldYear,
    year: worldYear, // совместимость с фронтом
    text,
    file: `content/stories/${file}`
  };
}
function mdToNote(file, parsed) {
  const base = file.replace(/\.md$/i, "");
  return {
    id: base,
    slug: parsed.data.slug || base,
    title: (parsed.data.title || base).toString().trim(),
    date: String(parsed.data.date || ""),
    tags: parsed.data.tags || [],
    annotation: parsed.data.annotation || parsed.data.anno || "",
    text: parsed.content || "",
    file: `content/notes/${file}`,
  };
}
function mdToArticle(file, parsed) {
  const base = file.replace(/\.md$/i, "");
  const text = parsed.content || "";
  const worldYear = pickWorldYear(parsed.data);
  return {
    id: base,
    slug: parsed.data.slug || base,
    title: (parsed.data.title || base).toString().trim(),
    date: String(parsed.data.date || ""),
    author: parsed.data.author || "",
    outlet: parsed.data.outlet || parsed.data.journal || "",
    cover: parsed.data.cover || "",
    tags: parsed.data.tags || [],
    annotation: parsed.data.annotation || parsed.data.anno || "",
    minutes: parsed.data.minutes || toMinutesArticle(text),
    worldYear,
    year: worldYear, // совместимость с фронтом и фильтром по годам
    text,
    file: `content/articles/${file}`,
  };
}
function sortByYearDateSlug(a, b) {
  const ay = a.worldYear ?? -Infinity;
  const by = b.worldYear ?? -Infinity;
  if (by !== ay) return by - ay;
  const ad = new Date(a.date || 0).getTime();
  const bd = new Date(b.date || 0).getTime();
  if (bd !== ad) return bd - ad;
  return String(a.slug || a.id).localeCompare(String(b.slug || b.id), "ru");
}

// ── функция ───────────────────────────────────────────────────────────────────
exports.handler = async () => {
  try {
    const [storyFiles, noteFiles, articleFiles] = await Promise.all([
      listMd(DIR_STORIES),
      listMd(DIR_NOTES),
      listMd(DIR_ARTICLES),
    ]);

    const stories = (await Promise.all(storyFiles.map(async f => {
      try { return mdToStory(f, matter(await fs.readFile(path.join(DIR_STORIES, f), "utf8"))); }
      catch { return null; }
    }))).filter(Boolean);

    const notes = (await Promise.all(noteFiles.map(async f => {
      try { return mdToNote(f, matter(await fs.readFile(path.join(DIR_NOTES, f), "utf8"))); }
      catch { return null; }
    }))).filter(Boolean);

    const articles = (await Promise.all(articleFiles.map(async f => {
      try { return mdToArticle(f, matter(await fs.readFile(path.join(DIR_ARTICLES, f), "utf8"))); }
      catch { return null; }
    }))).filter(Boolean);

    stories.sort(sortByYearDateSlug);
    notes.sort((a,b)=> {
      const ad = new Date(a.date || 0).getTime();
      const bd = new Date(b.date || 0).getTime();
      if (bd !== ad) return bd - ad;
      return String(a.slug || a.id).localeCompare(String(b.slug || b.id), "ru");
    });
    articles.sort(sortByYearDateSlug);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store" // хочешь — поменяй на s-maxage
      },
      body: JSON.stringify({ stories, notes, articles }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "internal", reason: String((e && e.message) || e) }),
    };
  }
};
