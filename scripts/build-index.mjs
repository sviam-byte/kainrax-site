// scripts/build-index.mjs
import { promises as fs } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, 'content');
const OUT_INDEX   = path.join(CONTENT, 'index.json');
const OUT_STORIES = path.join(CONTENT, 'stories.json');
const OUT_NOTES   = path.join(CONTENT, 'notes.json');

async function readDirFiles(dir) {
  const ents = await fs.readdir(dir, { withFileTypes: true });
  return ents
    .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.md'))
    .map(e => path.join(dir, e.name));
}

function parseFrontMatter(md) {
  // --- YAML --- ... ---  затем тело
  const m = md.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  if (!m) return [{}, md.trim()];
  const yaml = m[1];
  const body = md.slice(m[0].length).trim();
  const meta = parseYAML(yaml);
  return [meta, body];
}

function parseYAML(yaml) {
  // Мини-парсер под формат: "key: value", списки:
  // key:\n  - a\n  - b
  const meta = {};
  const lines = yaml.replace(/\t/g, '  ').split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    let line = lines[i];
    if (!line.trim()) { i++; continue; }
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) { i++; continue; }
    const key = m[1]; let val = m[2];

    // список
    if (val === '' && lines[i + 1] && /^\s*-\s+/.test(lines[i + 1])) {
      const arr = [];
      i++;
      while (i < lines.length) {
        const lm = lines[i].match(/^\s*-\s+(.*)$/);
        if (!lm) break;
        arr.push(unquote(lm[1].trim()));
        i++;
      }
      meta[key] = arr;
      continue;
    }

    // многострочный блок '|'
    if (val === '|') {
      i++;
      const buf = [];
      while (i < lines.length && !/^[A-Za-z0-9_-]+:\s*/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      meta[key] = buf.join('\n').trim();
      continue;
    }

    meta[key] = unquote(val.trim());
    i++;
  }
  return meta;
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;       // дата ISO как строка
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);     // числа
  if (s === 'true') return true;
  if (s === 'false') return false;
  return s;
}

function normalizeItem(obj, extra = {}) {
  const o = { ...obj, ...extra };
  ['slug','title','date','arc','annotation'].forEach(k => {
    if (typeof o[k] === 'string') o[k] = o[k].trim();
  });
  if (!Array.isArray(o.tags)) {
    o.tags = (o.tags && typeof o.tags === 'string')
      ? o.tags.split(',').map(s => s.trim()).filter(Boolean)
      : (o.tags || []);
  }
  // минутки по длине текста, если не задано
  if (!o.minutes) {
    const len = (o.text || '').length;
    o.minutes = Math.max(5, Math.round(len / 1100));
  }
  // дефолтная ветка для рассказов
  if (!o.arc) o.arc = 'kainrax';
  return o;
}

async function loadCollection(subdir, isStory) {
  const dir = path.join(CONTENT, subdir);
  let files = [];
  try { files = await readDirFiles(dir); } catch {}
  const items = [];
  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8');
    const [meta, body] = parseFrontMatter(raw);
    const base = path.basename(file, '.md');

    // ВАЖНО: id берём ТОЛЬКО из имени файла, чтобы всегда был уникален.
    // slug можно переопределять во фронтматтере, но по умолчанию = base.
    const id   = base;
    const slug = meta.slug || base;

    const item = normalizeItem(meta, {
      id, slug,
      text: body,
      file: `content/${subdir}/${base}.md`,
    });

    items.push(item);
  }
  // сортировка по дате (новые сверху)
  items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return items;
}

async function main() {
  await fs.mkdir(CONTENT, { recursive: true });
  const stories = await loadCollection('stories', true);
  const notes   = await loadCollection('notes', false);

  const payload = { stories, notes };
  await fs.writeFile(OUT_INDEX,   JSON.stringify(payload, null, 2), 'utf8');
  await fs.writeFile(OUT_STORIES, JSON.stringify(stories, null, 2), 'utf8');
  await fs.writeFile(OUT_NOTES,   JSON.stringify(notes,   null, 2), 'utf8');

  console.log(`Built:
 - ${path.relative(ROOT, OUT_INDEX)}
 - ${path.relative(ROOT, OUT_STORIES)}
 - ${path.relative(ROOT, OUT_NOTES)}`);
}

main().catch(e => { console.error(e); process.exit(2); });
