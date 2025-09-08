// Node 20+, ESM. Собираем индексы для форума.
// Генерим: /content/threads-index.json, /content/comments-index.json, /content/authors-index.json

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Корень контента относительно скрипта
const CONTENT_DIR = path.resolve(__dirname, "..", "content");

// Безопасный mkdir -r
async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

// Чтение всех JSON из директории, если её нет — пусто
async function readDirJSON(dir) {
  try {
    const names = await fs.readdir(dir);
    const jsons = names.filter(n => n.toLowerCase().endsWith(".json"));
    const out = [];
    for (const name of jsons) {
      const full = path.join(dir, name);
      try {
        const raw = await fs.readFile(full, "utf8");
        const obj = JSON.parse(raw);
        // Если в файле нет id, используем имя файла без .json
        if (obj && !obj.id) obj.id = name.replace(/\.json$/i, "");
        out.push(obj);
      } catch (e) {
        console.warn(`[WARN] Bad JSON: ${name} -> ${e.message}`);
      }
    }
    return out;
  } catch {
    return [];
  }
}

// Пишем красивый JSON
async function writeJSON(relPath, data) {
  const full = path.join(CONTENT_DIR, relPath);
  await ensureDir(path.dirname(full));
  const pretty = JSON.stringify(data, null, 2) + "\n";
  await fs.writeFile(full, pretty, "utf8");
  console.log(`[OK] wrote ${relPath} (${pretty.length.toLocaleString()} bytes)`);
}

function slugify(s) {
  return String(s || "anon")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_.]+/g, "")
    .slice(0, 64);
}

// Рекурсивно расплющиваем древо комментариев.
function flattenComments(thread) {
  const out = [];
  function walk(arr) {
    if (!Array.isArray(arr)) return;
    for (const c of arr) {
      if (!c) continue;
      out.push({
        comment_id: String(c.id ?? ""),
        thread_id: String(thread.id ?? ""),
        thread_title: String(thread.title ?? ""),
        created: c.created ?? thread.created ?? "",
        author: c.author ?? "anon",
        author_id: c.author_id ?? slugify(c.author ?? "anon"),
        body: String(c.body ?? ""),
        sector: c.sector ?? thread.sector ?? "",
      });
      if (Array.isArray(c.replies) && c.replies.length) {
        walk(c.replies);
      }
    }
  }
  walk(thread.comments);
  return out;
}

// Считаем количество потомков в comments (включая вложенные)
function countComments(thread) {
  let n = 0;
  (function walk(arr) {
    if (!Array.isArray(arr)) return;
    for (const c of arr) {
      n++;
      if (Array.isArray(c?.replies) && c.replies.length) walk(c.replies);
    }
  })(thread.comments);
  return n;
}

function normalizeThread(t) {
  const author = t.author ?? "anon";
  return {
    id: String(t.id ?? ""),
    title: String(t.title ?? "(untitled)"),
    author,
    author_id: t.author_id ?? slugify(author),
    sector: t.sector ?? "",
    board: t.board ?? "",
    created: t.created ?? "",
    tags: Array.isArray(t.tags) ? t.tags : [],
    // Индексу удобно иметь body для предпросмотра/поиска
    body: typeof t.body === "string" ? t.body : "",
    commentCount: Number.isFinite(t.commentCount)
      ? t.commentCount
      : countComments(t),
    parentId: t.parentId ?? "",
  };
}

// Привязываем сториз к авторам, если в контенте есть /stories
function authorsStories(stories) {
  // Допускаем разные формы: {people: [author_id]} или {author_id} или {authors:[{id}]}.
  const map = new Map(); // author_id -> [{id,title,url}]
  for (const s of stories) {
    const entry = {
      id: s.id ?? "",
      title: s.title ?? s.name ?? "(story)",
      url: s.url ?? s.href ?? (s.slug ? `/#/stories/${s.slug}` : ""),
    };
    const bucket = [];

    if (Array.isArray(s.people)) bucket.push(...s.people);
    if (Array.isArray(s.peopleIds)) bucket.push(...s.peopleIds);
    if (s.author_id) bucket.push(s.author_id);
    if (Array.isArray(s.authors)) {
      for (const a of s.authors) {
        if (a?.id) bucket.push(a.id);
        else if (a?.author_id) bucket.push(a.author_id);
      }
    }

    for (const raw of bucket) {
      const id = slugify(raw);
      if (!id) continue;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(entry);
    }
  }
  return map;
}

(async function main() {
  console.log(`[i] content dir = ${CONTENT_DIR}`);

  // Читаем все источники
  const threadsDir  = path.join(CONTENT_DIR, "threads");
  const storiesDir  = path.join(CONTENT_DIR, "stories");

  const threadsRaw  = await readDirJSON(threadsDir);
  const storiesRaw  = await readDirJSON(storiesDir); // опционально

  // Нормализуем треды
  let threads = threadsRaw.map(normalizeThread);
  // Отсортируем по дате убыв.
  threads.sort((a, b) => new Date(b.created) - new Date(a.created));

  // Плоские комментарии из всех тредов
  let comments = [];
  for (const tr of threadsRaw) {
    const flat = flattenComments(tr);
    if (flat.length) comments.push(...flat);
  }
  // Сорт комментариев по дате убыв.
  comments.sort((a, b) => new Date(b.created) - new Date(a.created));

  // Индекс авторов
  const storiesMap = authorsStories(storiesRaw);
  const authors = new Map(); // author_id -> {author, author_id, posts, comments, stories}

  // Посты
  for (const t of threads) {
    const id = t.author_id;
    if (!authors.has(id)) authors.set(id, { author: t.author, author_id: id, posts: 0, comments: 0, stories: [] });
    const a = authors.get(id);
    a.posts += 1;
  }
  // Комментарии
  for (const c of comments) {
    const id = c.author_id;
    if (!authors.has(id)) authors.set(id, { author: c.author, author_id: id, posts: 0, comments: 0, stories: [] });
    const a = authors.get(id);
    a.comments += 1;
  }
  // Сториз (если есть)
  for (const [aid, list] of storiesMap.entries()) {
    if (!authors.has(aid)) authors.set(aid, { author: aid, author_id: aid, posts: 0, comments: 0, stories: [] });
    const a = authors.get(aid);
    a.stories = list;
  }

  const authorsIndex = Array.from(authors.values())
    .sort((a, b) => (b.posts + b.comments) - (a.posts + a.comments) || a.author.localeCompare(b.author));

  // Запись индексов
  await writeJSON("threads-index.json", threads);
  await writeJSON("comments-index.json", comments);
  await writeJSON("authors-index.json", authorsIndex);

  console.log("[DONE] indices built.");
})().catch(err => {
  console.error("[FATAL] build-index failed:", err);
  process.exit(2);
});
