// forum/scripts/build-index.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const THREADS_DIR = path.join(ROOT, 'content', 'threads');
const OUT_THREADS = path.join(ROOT, 'content', 'threads-index.json');
const OUT_AUTHORS = path.join(ROOT, 'content', 'authors-index.json');

function slugify(s){
  return String(s||'anon').trim().toLowerCase()
    .replace(/\s+/g,'-')
    .replace(/[^a-z0-9-_.]+/g,'')
    .slice(0,64);
}

async function main(){
  await fs.mkdir(THREADS_DIR, { recursive: true });

  const files = (await fs.readdir(THREADS_DIR)).filter(f=>f.endsWith('.json'));
  const items = [];

  for(const f of files){
    const full = path.join(THREADS_DIR, f);
    let obj;
    try{
      obj = JSON.parse(await fs.readFile(full, 'utf8'));
    }catch(e){
      console.error('Bad JSON:', f, e.message);
      continue;
    }
    // Нормализация
    obj.id = obj.id || path.basename(f, '.json');
    obj.title = obj.title || 'Без названия';
    obj.author = obj.author || 'anon';
    obj.author_id = obj.author_id || slugify(obj.author);
    if(!obj.created) {
      // если забыли дату, ставим «сейчас», чтобы не падало
      obj.created = new Date().toISOString();
    }
    // Для индекса держим только то, что нужно для карточки и поиска.
    items.push({
      id: obj.id,
      title: obj.title,
      author: obj.author,
      author_id: obj.author_id,
      sector: obj.sector || '',
      board: obj.board || '',
      tags: Array.isArray(obj.tags)?obj.tags:[],
      created: obj.created,
      parentId: obj.parentId || '',
      body: (obj.body || '')
    });
  }

  // Сортировка: новые сверху
  items.sort((a,b)=> (new Date(b.created)) - (new Date(a.created)));

  await fs.writeFile(OUT_THREADS, JSON.stringify(items, null, 2), 'utf8');

  // Каталог авторов
  const map = new Map();
  for(const it of items){
    const key = it.author_id;
    const cur = map.get(key) || { author_id: key, author: it.author, count: 0 };
    cur.count += 1;
    // держим «нормальное» имя автора (последняя версия)
    cur.author = it.author;
    map.set(key, cur);
  }
  const authors = Array.from(map.values()).sort((a,b)=> b.count - a.count || a.author.localeCompare(b.author));
  await fs.writeFile(OUT_AUTHORS, JSON.stringify(authors, null, 2), 'utf8');

  console.log(`Built ${items.length} threads, ${authors.length} authors.`);
}

main().catch(err=>{ console.error(err); process.exit(1) });
