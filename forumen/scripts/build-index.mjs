// forum/scripts/build-index.mjs
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Пути
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.join(__dirname, '..');             // forum/
const CONTENT    = path.join(ROOT, 'content');             // forum/content
const THREADS    = path.join(CONTENT, 'threads');
const STORIESDIR = path.join(CONTENT, 'stories');

async function readJsonSafe(file, fallback = null) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function loadThreadsIndex() {
  // если у тебя уже есть генерация threads-index.json — оставь как есть
  const idx = await readJsonSafe(path.join(CONTENT, 'threads-index.json'), []);
  return Array.isArray(idx) ? idx : [];
}

async function loadCommentsIndex() {
  const idx = await readJsonSafe(path.join(CONTENT, 'comments-index.json'), []);
  return Array.isArray(idx) ? idx : [];
}

async function loadStories() {
  const list = [];

  // 1) stories-index.json (если есть)
  const ix = await readJsonSafe(path.join(CONTENT, 'stories-index.json'), []);
  if (Array.isArray(ix)) {
    for (const s of ix) {
      if (!s || !s.id) continue;
      list.push({
        id: String(s.id),
        title: String(s.title || s.id),
        url: String(s.url || ''),
        authors: Array.isArray(s.authors) ? s.authors.map(String) : []
      });
    }
  }

  // 2) stories/*.json (если папка есть)
  try {
    const names = await fs.readdir(STORIESDIR);
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const s = await readJsonSafe(path.join(STORIESDIR, name), null);
      if (!s || !s.id) continue;
      list.push({
        id: String(s.id),
        title: String(s.title || s.id),
        url: String(s.url || ''),
        authors: Array.isArray(s.authors) ? s.authors.map(String) : []
      });
    }
  } catch {}

  // дедупликация по id
  const seen = new Set();
  const uniq = [];
  for (const s of list) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    uniq.push(s);
  }
  return uniq;
}

function slugify(s) {
  return String(s || 'anon')
    .trim().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_.]+/g, '')
    .slice(0, 64);
}

async function buildAuthorsIndex({ threads, comments, stories }) {
  // Счётчики по авторам из тредов/комментов
  const map = new Map(); // author_id -> { author_id, author, posts, comments, stories: [] }

  for (const t of threads) {
    const id = String(t.author_id || slugify(t.author || 'anon'));
    const name = String(t.author || id);
    const rec = map.get(id) || { author_id: id, author: name, posts: 0, comments: 0, stories: [] };
    rec.author = name;  // освежим имя
    rec.posts = (rec.posts || 0) + 1;
    map.set(id, rec);
  }

  for (const c of comments) {
    const id = String(c.author_id || slugify(c.author || 'anon'));
    const name = String(c.author || id);
    const rec = map.get(id) || { author_id: id, author: name, posts: 0, comments: 0, stories: [] };
    rec.author = name;
    rec.comments = (rec.comments || 0) + 1;
    map.set(id, rec);
  }

  // Привяжем истории к авторам
  for (const s of stories) {
    const authors = Array.isArray(s.authors) && s.authors.length ? s.authors : [];
    for (const aid of authors) {
      const id = String(aid);
      const rec = map.get(id) || { author_id: id, author: id, posts: 0, comments: 0, stories: [] };
      rec.stories = rec.stories || [];
      rec.stories.push({ id: s.id, title: s.title, url: s.url });
      map.set(id, rec);
    }
  }

  // Плоский массив
  const out = Array.from(map.values()).sort((a, b) => a.author.localeCompare(b.author, 'ru'));

  // Для обратной совместимости добавим story_url (первую историю)
  for (const a of out) {
    if (Array.isArray(a.stories) && a.stories.length) {
      a.story_url = a.stories[0].url || '';
      a.story_title = a.stories[0].title || '';
    }
  }

  await fs.writeFile(path.join(CONTENT, 'authors-index.json'), JSON.stringify(out, null, 2), 'utf8');
  console.log(`[build] authors-index.json → ${out.length} авторов`);
}

async function main() {
  const [threads, comments, stories] = await Promise.all([
    loadThreadsIndex(),
    loadCommentsIndex(),
    loadStories()
  ]);

  await buildAuthorsIndex({ threads, comments, stories });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
