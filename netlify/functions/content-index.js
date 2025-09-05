// netlify/functions/content-index.js
const fs = require("fs/promises");
const path = require("path");
const matter = require("gray-matter");

// ── где лежит контент внутри лямбды (esbuild + included_files) ────────────────
const ROOT = path.resolve(process.env.LAMBDA_TASK_ROOT || process.cwd());
const DIR_CONTENT = path.join(ROOT, "content");
const DIR_STORIES = path.join(DIR_CONTENT, "stories");
const DIR_NOTES   = path.join(DIR_CONTENT, "notes");

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
function toMinutes(text) {
  const len = (text || "").length;
  return Math.max(5, Math.round(len / 1100));
}
function pickWorldYear(data) {
  let w = data.worldYear ?? data.world_year ?? data.year ?? data.y ?? data.wy ?? null;
  if (typeof w === "string") {
    const m = w.match(/-?\d+/);
    w = m ? Number(m[0]) : NaN;
  }
  return Number.isFinite(w) ? Math.trunc(w) : null;
}
function mdToItem(kind, file, parsed) {
  const base = file.replace(/\.md$/i, "");
  const text = parsed.content || "";
  const worldYear = pickWorldYear(parsed.data);
  return {
    id: base,
    slug: parsed.data.slug || base,
    title: (parsed.data.title || base).toString().trim(),
    date: String(parsed.data.date || ""),
    minutes: parsed.data.minutes || toMinutes(text),
    arc: parsed.data.arc || "kainrax",
    tags: parsed.data.tags || [],
    annotation: parsed.data.annotation || parsed.data.anno || "",
    worldYear,
    text,
    file: `content/${kind}/${file}`
  };
}

// ── функция ───────────────────────────────────────────────────────────────────
exports.handler = async () => {
  try {
    const [storyFiles, noteFiles] = await Promise.all([
      listMd(DIR_STORIES),
      listMd(DIR_NOTES),
    ]);

    const stories = (
      await Promise.all(
        storyFiles.map(async f => {
          try {
            const raw = await fs.readFile(path.join(DIR_STORIES, f), "utf8");
            const parsed = matter(raw);
            return mdToItem("stories", f, parsed);
          } catch { return null; }
        })
      )
    ).filter(Boolean);

    const notes = (
      await Promise.all(
        noteFiles.map(async f => {
          try {
            const raw = await fs.readFile(path.join(DIR_NOTES, f), "utf8");
            const parsed = matter(raw);
            const base = f.replace(/\.md$/i, "");
            return {
              id: base,
              slug: parsed.data.slug || base,
              title: (parsed.data.title || base).toString().trim(),
              date: String(parsed.data.date || ""),
              tags: parsed.data.tags || [],
              annotation: parsed.data.annotation || parsed.data.anno || "",
              text: parsed.content || "",
              file: `content/notes/${f}`,
            };
          } catch { return null; }
        })
      )
    ).filter(Boolean);

    // сортировка: 1) год мира ↓ 2) дата публикации ↓ 3) slug ↑
    stories.sort((a, b) => {
      const ay = a.worldYear ?? -Infinity;
      const by = b.worldYear ?? -Infinity;
      if (by !== ay) return by - ay;
      const ad = new Date(a.date || 0).getTime();
      const bd = new Date(b.date || 0).getTime();
      if (bd !== ad) return bd - ad;
      return String(a.slug || a.id).localeCompare(String(b.slug || b.id), "ru");
    });

    notes.sort((a, b) => {
      const ad = new Date(a.date || 0).getTime();
      const bd = new Date(b.date || 0).getTime();
      if (bd !== ad) return bd - ad;
      return String(a.slug || a.id).localeCompare(String(b.slug || b.id), "ru");
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({ stories, notes }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "internal", reason: String(e && e.message || e) }),
    };
  }
};
