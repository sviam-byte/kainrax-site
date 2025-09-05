// netlify/functions/content-index.js
const fs = require("fs/promises");
const path = require("path");
const matter = require("gray-matter");

// безопасный листинг .md
async function listMd(dir) {
  try {
    const files = await fs.readdir(dir, { withFileTypes: true });
    return files
      .filter(f => f.isFile() && f.name.toLowerCase().endsWith(".md"))
      .map(f => f.name);
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
  return Number.isFinite(w) ? Number(w) : null;
}

function mdToItem(kind, file, parsed) {
  const base = file.replace(/\.md$/i, "");
  const text = parsed.content || "";
  const worldYear = pickWorldYear(parsed.data);

  return {
    id: base,                                     // стабильный id = имя файла
    slug: parsed.data.slug || base,               // человекочитаемый slug (если задан)
    title: (parsed.data.title || base).toString().trim(),
    date: String(parsed.data.date || ""),         // дата публикации (оставляем на месте — вдруг нужна)
    minutes: parsed.data.minutes || toMinutes(text),
    arc: parsed.data.arc || "kainrax",
    tags: parsed.data.tags || [],
    annotation: parsed.data.annotation || parsed.data.anno || "",
    worldYear,                                    // ← НОВОЕ: год события
    text,                                         // отдаём тело сразу
    file: `content/${kind}/${file}`               // прямой путь для подстраховки
  };
}

exports.handler = async () => {
  try {
    const root = path.join(process.cwd(), "content");
    const storiesDir = path.join(root, "stories");
    const notesDir   = path.join(root, "notes");

    const storyFiles = await listMd(storiesDir);
    const noteFiles  = await listMd(notesDir);

    const stories = [];
    for (const f of storyFiles) {
      const raw = await fs.readFile(path.join(storiesDir, f), "utf8");
      const parsed = matter(raw);
      stories.push(mdToItem("stories", f, parsed));
    }

    const notes = [];
    for (const f of noteFiles) {
      const raw = await fs.readFile(path.join(notesDir, f), "utf8");
      const parsed = matter(raw);
      const base = f.replace(/\.md$/i, "");
      notes.push({
        id: base,
        slug: parsed.data.slug || base,
        title: (parsed.data.title || base).toString().trim(),
        date: String(parsed.data.date || ""),
        tags: parsed.data.tags || [],
        annotation: parsed.data.annotation || parsed.data.anno || "",
        text: parsed.content || "",
        file: `content/notes/${f}`
      });
    }

    // новые сверху по ВНУТРИМИРОВОЙ хронологии (приоритет гг. мира)
    stories.sort((a, b) => {
      const ay = a.worldYear ?? -Infinity;
      const by = b.worldYear ?? -Infinity;
      if (by !== ay) return by - ay; // свежие годы мира сверху
      return new Date(b.date || 0) - new Date(a.date || 0); // запасной ключ — дата публикации
    });

    notes.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ stories, notes })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "internal", reason: String((e && e.message) || e) })
    };
  }
};
