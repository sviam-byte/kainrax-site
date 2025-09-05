// netlify/functions/content-index.js
const fs = require("fs/promises");
const path = require("path");
const matter = require("gray-matter");

// ── утилиты ─────────────────────────────────────────────────────
async function listMd(dir) {
  try {
    const files = await fs.readdir(dir, { withFileTypes: true });
    return files
      .filter((f) => f.isFile() && f.name.toLowerCase().endsWith(".md"))
      .map((f) => f.name);
  } catch {
    return [];
  }
}

function toMinutes(text) {
  const len = (text || "").length;
  return Math.max(5, Math.round(len / 1100));
}

// аккуратно вытащим «внутримировой год» из фронтматтера
function pickWorldYear(data) {
  let w =
    data.worldYear ??
    data.world_year ??
    data.year ??
    data.y ??
    data.wy ??
    null;

  if (typeof w === "string") {
    // допускаем мусор вроде "362 ОВ" — вынем цифры/минус
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
    id: base,                                     // стабильный id = имя файла
    slug: parsed.data.slug || base,               // человекочитаемый slug (если задан)
    title: (parsed.data.title || base).toString().trim(),
    date: String(parsed.data.date || ""),         // дата публикации
    minutes: parsed.data.minutes || toMinutes(text),
    arc: parsed.data.arc || "kainrax",
    tags: parsed.data.tags || [],
    annotation: parsed.data.annotation || parsed.data.anno || "",
    worldYear,                                    // ← год события
    text,                                         // тело нужно для локального поиска
    file: `content/${kind}/${file}`               // прямой путь для подстраховки
  };
}

// ── основная функция ────────────────────────────────────────────
exports.handler = async () => {
  try {
    const root = path.join(process.cwd(), "content");
    const storiesDir = path.join(root, "stories");
    const notesDir   = path.join(root, "notes");

    const [storyFiles, noteFiles] = await Promise.all([
      listMd(storiesDir),
      listMd(notesDir)
    ]);

    // читаем параллельно; битые файлы тихо пропускаем
    const stories = (
      await Promise.all(
        storyFiles.map(async (f) => {
          try {
            const raw = await fs.readFile(path.join(storiesDir, f), "utf8");
            const parsed = matter(raw);
            return mdToItem("stories", f, parsed);
          } catch {
            return null;
          }
        })
      )
    ).filter(Boolean);

    const notes = (
      await Promise.all(
        noteFiles.map(async (f) => {
          try {
            const raw = await fs.readFile(path.join(notesDir, f), "utf8");
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
              file: `content/notes/${f}`
            };
          } catch {
            return null;
          }
        })
      )
    ).filter(Boolean);

    // стабильная сортировка:
    // 1) год мира (desc), 2) дата публикации (desc), 3) slug (asc)
    stories.sort((a, b) => {
      const ay = a.worldYear ?? -Infinity;
      const by = b.worldYear ?? -Infinity;
      if (by !== ay) return by - ay;

      const ad = new Date(a.date || 0).getTime();
      const bd = new Date(b.date || 0).getTime();
      if (bd !== ad) return bd - ad;

      const as = (a.slug || a.id || "").toString();
      const bs = (b.slug || b.id || "").toString();
      return as.localeCompare(bs, "ru");
    });

    notes.sort((a, b) => {
      const ad = new Date(a.date || 0).getTime();
      const bd = new Date(b.date || 0).getTime();
      if (bd !== ad) return bd - ad;
      return (a.slug || a.id || "").localeCompare(b.slug || b.id || "", "ru");
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // чтобы браузер и edge-функции не держали кэш после деплоя
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({ stories, notes })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        error: "internal",
        reason: String((e && e.message) || e)
      })
    };
  }
};
