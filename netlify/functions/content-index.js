// netlify/functions/content-index.js
const fs = require("fs/promises");
const path = require("path");
const matter = require("gray-matter");

async function listMd(dir) {
  try {
    const files = await fs.readdir(dir);
    return files.filter(f => f.toLowerCase().endsWith(".md"));
  } catch {
    return [];
  }
}

function mdToItem(kind, file, parsed) {
  const id = file.replace(/\.md$/i, "");
  const textLen = (parsed.content || "").length;
  return {
    id,
    slug: parsed.data.slug || id,
    title: parsed.data.title || id,
    date: String(parsed.data.date || ""),
    minutes: parsed.data.minutes || Math.max(5, Math.round(textLen / 1100)),
    arc: parsed.data.arc || "kainrax",
    tags: parsed.data.tags || [],
    annotation: parsed.data.annotation || parsed.data.anno || "",
    file: `content/${kind}/${file}`
  };
}

exports.handler = async () => {
  try {
    const root = path.join(process.cwd(), "content");
    const storiesDir = path.join(root, "stories");
    const notesDir = path.join(root, "notes");

    const storyFiles = await listMd(storiesDir);
    const noteFiles = await listMd(notesDir);

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
      // для заметок попроще
      notes.push({
        id: f.replace(/\.md$/i, ""),
        slug: parsed.data.slug || f.replace(/\.md$/i, ""),
        title: parsed.data.title || f,
        date: String(parsed.data.date || ""),
        tags: parsed.data.tags || [],
        annotation: parsed.data.annotation || parsed.data.anno || "",
        file: `content/notes/${f}`
      });
    }

    // Сортировки по дате
    stories.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
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
      body: JSON.stringify({ error: "internal", reason: String(e && e.message || e) })
    };
  }
};
