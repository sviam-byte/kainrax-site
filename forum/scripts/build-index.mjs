// forum/scripts/build-index.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const THREADS_DIR = path.join(ROOT, 'content', 'threads');
const OUT_THREADS = path.join(ROOT, 'content', 'threads-index.json');
const OUT_AUTHORS = path.join(ROOT, 'content', 'authors-index.json');
const OUT_COMMENTS = path.join(ROOT, 'content', 'comments-index.json');

function slugify(s){
  return String(s||'anon').trim().toLowerCase()
    .replace(/\s+/g,'-')
    .replace(/[^a-z0-9-_.]+/g,'')
    .slice(0,64);
}

const errors = [];
const items = [];
const comments = [];

function pushComment(c, thread){
  const author = c.author || 'anon';
  const author_id = c.author_id || slugify(author);
  comments.push({
    id: `${thread.id}#${c.id || Math.random().toString(36).slice(2,8)}`,
    comment_id: c.id || '',
    author,
    author_id,
    sector: c.sector || thread.sector || '',
    created: c.created || thread.created,
    body: String(c.body||''),
    thread_id: thread.id,
    thread_title: thread.title || thread.id
  });
  if (Array.isArray(c.replies)) {
    for (const r of c.replies) pushComment(r, thread);
  }
}

async function main(){
  await fs.mkdir(THREADS_DIR, { recursive: true });

  const files = (await fs.readdir(THREADS_DIR)).filter(f=>f.endsWith('.json'));

  for (const f of files){
    const full = path.join(THREADS_DIR, f);
    let raw = '';
    try{
      raw = (await fs.readFile(full, 'utf8')).replace(/^\uFEFF/, '');
      const obj = JSON.parse(raw);

      obj.id = obj.id || path.basename(f, '.json');
      obj.title = obj.title || 'Без названия';
      obj.author = obj.author || 'anon';
      obj.author_id = obj.author_id || slugify(obj.author);
      obj.created = obj.created || new Date().toISOString();

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
        body: String(obj.body || '')
      });

      if (Array.isArray(obj.comments)) {
        for (const c of obj.comments) pushComment(c, obj);
      }
    }catch(e){
      errors.push(`Bad JSON in ${f}: ${e.message}`);
    }
  }

  // новые сверху
  items.sort((a,b)=> (new Date(b.created)) - (new Date(a.created)));
  comments.sort((a,b)=> (new Date(b.created)) - (new Date(a.created)));

  await fs.writeFile(OUT_THREADS, JSON.stringify(items, null, 2), 'utf8');
  await fs.writeFile(OUT_COMMENTS, JSON.stringify(comments, null, 2), 'utf8');

  // каталог авторов: считаем и посты, и комментарии
  const map = new Map();
  for (const it of items){
    const key = it.author_id;
    const cur = map.get(key) || { author_id: key, author: it.author, posts: 0, comments: 0 };
    cur.posts += 1;
    cur.author = it.author;
    map.set(key, cur);
  }
  for (const c of comments){
    const key = c.author_id;
    const cur = map.get(key) || { author_id: key, author: c.author, posts: 0, comments: 0 };
    cur.comments += 1;
    cur.author = c.author;
    map.set(key, cur);
  }
  const authors = Array.from(map.values())
    .map(a => ({...a, count: a.posts})) // count — посты, чтобы не ломать people.html
    .sort((a,b)=> b.posts - a.posts || a.author.localeCompare(b.author));

  await fs.writeFile(OUT_AUTHORS, JSON.stringify(authors, null, 2), 'utf8');

  if (errors.length) {
    console.error('\n--- Build errors ---');
    for (const msg of errors) console.error(msg);
    process.exit(1);
  }
  console.log(`Built ${items.length} threads, ${comments.length} comments, ${authors.length} authors.`);
}

main().catch(err=>{ console.error(err); process.exit(1) });
