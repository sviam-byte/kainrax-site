// forum/scripts/build-index.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const THREADS_DIR = path.join(ROOT, 'content', 'threads');

const OUT_THREADS   = path.join(ROOT, 'content', 'threads-index.json');
const OUT_COMMENTS  = path.join(ROOT, 'content', 'comments-index.json');
const OUT_AUTHORS   = path.join(ROOT, 'content', 'authors-index.json');

function slugify(s){
  return String(s||'anon').trim().toLowerCase()
    .replace(/\s+/g,'-')
    .replace(/[^a-z0-9-_.]+/g,'')
    .slice(0,64);
}

function normalizeThread(obj, fileName){
  const id         = obj.id || path.basename(fileName, '.json');
  const title      = obj.title || 'Без названия';
  const author     = obj.author || 'anon';
  const author_id  = obj.author_id || slugify(author);
  const created    = obj.created || new Date().toISOString();
  return {
    id, title, author, author_id,
    sector: obj.sector || '',
    board: obj.board || '',
    tags: Array.isArray(obj.tags) ? obj.tags : [],
    created,
    parentId: obj.parentId || '',
    body: String(obj.body || '')
  };
}

const items    = [];           // все узлы (темы и, при желании, файлы-комменты)
const rawById  = new Map();    // id -> {norm, _raw}
const comments = [];           // плоский индекс комментариев
const errors   = [];

// Рекурсивно выпрямляем вложенные комментарии из поля "comments" в теме
function pushEmbeddedComments(arr, thread){
  if (!Array.isArray(arr)) return;
  for (const c of arr){
    const cid = c.id || Math.random().toString(36).slice(2,8);
    comments.push({
      id: `${thread.id}#${cid}`,
      comment_id: cid,
      author: c.author || 'anon',
      author_id: c.author_id || slugify(c.author || 'anon'),
      sector: c.sector || thread.sector || '',
      created: c.created || thread.created,
      body: String(c.body || ''),
      thread_id: thread.id,
      thread_title: thread.title || thread.id
    });
    if (Array.isArray(c.replies) && c.replies.length){
      // для реплаев тоже гарантируем id
      for (const r of c.replies){
        const rid = r.id || Math.random().toString(36).slice(2,8);
        comments.push({
          id: `${thread.id}#${rid}`,
          comment_id: rid,
          author: r.author || 'anon',
          author_id: r.author_id || slugify(r.author || 'anon'),
          sector: r.sector || c.sector || thread.sector || '',
          created: r.created || c.created || thread.created,
          body: String(r.body || ''),
          thread_id: thread.id,
          thread_title: thread.title || thread.id
        });
        // если вдруг у реплая есть replies — пройдёмся ещё раз
        if (Array.isArray(r.replies) && r.replies.length){
          pushEmbeddedComments(r.replies.map(x=>({ ...x, id: x.id || Math.random().toString(36).slice(2,8) })), thread);
        }
      }
    }
  }
}

async function main(){
  await fs.mkdir(THREADS_DIR, { recursive: true });

  const files = (await fs.readdir(THREADS_DIR))
    .filter(f => f.endsWith('.json'))
    .sort();

  for (const f of files){
    const full = path.join(THREADS_DIR, f);
    try{
      const text = (await fs.readFile(full, 'utf8')).replace(/^\uFEFF/, '');
      const obj  = JSON.parse(text);
      const norm = normalizeThread(obj, f);

      items.push(norm);
      rawById.set(norm.id, { norm, _raw: obj });

      // Вложенные комменты внутри темы
      if (Array.isArray(obj.comments) && obj.comments.length){
        pushEmbeddedComments(obj.comments, norm);
      }
    }catch(e){
      errors.push(`Bad JSON in ${f}: ${e.message}`);
    }
  }

  // Комментарии, записанные отдельными файлами: board:"комментарии", parentId обязателен
  for (const it of items){
    if ((it.board || '') === 'комментарии' && it.parentId){
      const parent = rawById.get(it.parentId)?.norm;
      const thread_title = parent?.title || it.parentId;
      const sector = it.sector || parent?.sector || '';
      const cid = it.id; // используем id файла как идентификатор коммента

      comments.push({
        id: `${it.parentId}#${cid}`,
        comment_id: cid,
        author: it.author || 'anon',
        author_id: it.author_id || slugify(it.author || 'anon'),
        sector,
        created: it.created,
        body: String(it.body || ''),
        thread_id: it.parentId,
        thread_title
      });
    }
  }

  // Подсчёт комментариев на каждую тему (вложенные + файловые)
  const countMap = new Map();
  for (const c of comments){
    countMap.set(c.thread_id, (countMap.get(c.thread_id) || 0) + 1);
  }

  for (const it of items){
    if ((it.board || '') !== 'комментарии'){
      it.commentCount = countMap.get(it.id) || 0;
    } else {
      it.commentCount = 0; // для самих файлов-комментов
    }
  }

  // Сохраняем индексы (без сортировки по дате: клиент сам сортирует как надо)
  await fs.writeFile(OUT_THREADS, JSON.stringify(items, null, 2), 'utf8');

  // Комменты выведем по дате убыв, где возможно; непарсимые даты просто останутся внизу
  comments.sort((a,b)=>{
    const da = new Date(a.created).getTime();
    const db = new Date(b.created).getTime();
    if (isNaN(db) && isNaN(da)) return 0;
    if (isNaN(db)) return -1;
    if (isNaN(da)) return 1;
    return db - da;
  });
  await fs.writeFile(OUT_COMMENTS, JSON.stringify(comments, null, 2), 'utf8');

  // Индекс авторов
  const am = new Map();
  for (const it of items){
    if ((it.board || '') === 'комментарии') continue; // посты считаем только по темам
    const k = it.author_id;
    const rec = am.get(k) || { author_id: k, author: it.author, posts: 0, comments: 0 };
    rec.author = it.author; // актуализируем имя
    rec.posts += 1;
    am.set(k, rec);
  }
  for (const c of comments){
    const k = c.author_id;
    const rec = am.get(k) || { author_id: k, author: c.author, posts: 0, comments: 0 };
    rec.author = c.author;
    rec.comments += 1;
    am.set(k, rec);
  }
  const authors = Array.from(am.values())
    .sort((a,b)=> b.posts - a.posts || b.comments - a.comments || a.author.localeCompare(b.author,'ru'));

  await fs.writeFile(OUT_AUTHORS, JSON.stringify(authors, null, 2), 'utf8');

  if (errors.length){
    console.error('\n--- Build errors ---');
    for (const msg of errors) console.error(msg);
    process.exit(1);
  }
  console.log(`Built ${items.length} items, ${comments.length} comments, ${authors.length} authors.`);
}

main().catch(err=>{ console.error(err); process.exit(1); });
