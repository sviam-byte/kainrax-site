// --- добавь вверху рядом с импортами и путями ---
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.join(__dirname, '..');
const CONTENT    = path.join(ROOT, 'content');
const STORIESDIR = path.join(CONTENT, 'stories');

function slugify(s){ return String(s||'anon').trim().toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-_.]+/g,'').slice(0,64) }
async function readJsonSafe(file, fallback=null){ try{ return JSON.parse(await fs.readFile(file,'utf8')) }catch{ return fallback }}

// --- истории: из stories-index.json и из stories/*.json ---
async function loadStories(){
  const list = [];
  const ix = await readJsonSafe(path.join(CONTENT, 'stories-index.json'), []);
  if (Array.isArray(ix)) for (const s of ix){
    if (!s || !s.id) continue;
    list.push({
      id: String(s.id),
      title: String(s.title||s.id),
      url: String(s.url||''),
      people: Array.isArray(s.people) ? s.people.map(String) : Array.isArray(s.authors) ? s.authors.map(String) : []
    });
  }
  try{
    const names = await fs.readdir(STORIESDIR);
    for (const name of names){
      if (!name.endsWith('.json')) continue;
      const s = await readJsonSafe(path.join(STORIESDIR, name), null);
      if (!s || !s.id) continue;
      list.push({
        id: String(s.id),
        title: String(s.title||s.id),
        url: String(s.url||''),
        people: Array.isArray(s.people) ? s.people.map(String) : Array.isArray(s.authors) ? s.authors.map(String) : []
      });
    }
  }catch{}
  // дедуп по id
  const seen=new Set(), out=[];
  for (const s of list){ if(seen.has(s.id)) continue; seen.add(s.id); out.push(s) }
  return out;
}

// --- сборка authors-index.json: посты, комменты, истории ---
async function buildAuthorsIndex({ threads=[], comments=[], stories=[] }){
  const map = new Map(); // id -> {author_id, author, posts, comments, stories:[]}

  for (const t of threads){
    const id = String(t.author_id || slugify(t.author));
    const name = String(t.author || id);
    const rec = map.get(id) || { author_id:id, author:name, posts:0, comments:0, stories:[] };
    rec.author = name;
    rec.posts = (rec.posts||0)+1;
    map.set(id, rec);
  }
  for (const c of comments){
    const id = String(c.author_id || slugify(c.author));
    const name = String(c.author || id);
    const rec = map.get(id) || { author_id:id, author:name, posts:0, comments:0, stories:[] };
    rec.author = name;
    rec.comments = (rec.comments||0)+1;
    map.set(id, rec);
  }
  for (const s of stories){
    for (const aid of (s.people||[])){
      const id = String(aid);
      const rec = map.get(id) || { author_id:id, author:id, posts:0, comments:0, stories:[] };
      (rec.stories ||= []).push({ id:s.id, title:s.title, url:s.url });
      map.set(id, rec);
    }
  }

  const authors = Array.from(map.values()).sort((a,b)=> a.author.localeCompare(b.author,'ru'));
  for (const a of authors){
    if (a.stories?.length){ a.story_url = a.stories[0].url || ''; a.story_title = a.stories[0].title || '' }
  }
  await fs.writeFile(path.join(CONTENT,'authors-index.json'), JSON.stringify(authors,null,2), 'utf8');
  console.log(`[build] authors-index.json → ${authors.length} авторов`);
}

// --- где-то в main после сборки тредов/комментов ---
const stories = await loadStories();
await buildAuthorsIndex({ threads, comments, stories });
