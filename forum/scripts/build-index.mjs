import { promises as fs } from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd(), 'forum');             // базовый путь сайта форума
const SRC = path.join(ROOT, 'content', 'threads');
const OUT = path.join(ROOT, 'content', 'threads-index.json');

function parseCreated(v){
  if(!v) return 0;
  // ISO -> ms
  if(/^\d{4}-\d{2}-\d{2}/.test(v)) return +new Date(v);
  // "YYYY DOY [HH:MM]" или "YYYY-DOY"
  const m = String(v).trim().match(/^(\d{4})[\s\-_:.\/]+(\d{1,3})(?:.*?(\d{1,2}):(\d{2}))?$/);
  if(m){
    const year = +m[1], doy = +m[2];
    const hh = +(m[3] ?? 0), mm = +(m[4] ?? 0);
    const d = new Date(Date.UTC(year, 0, 1, hh, mm));
    d.setUTCDate(d.getUTCDate() + (doy - 1));
    return +d;
  }
  return +new Date(v);
}

function pickPreview(body='', n=260){
  const s = body.replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

async function main(){
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  const files = (await fs.readdir(SRC)).filter(f => f.endsWith('.json')).sort();

  const items = [];
  for(const f of files){
    const id = f.replace(/\.json$/,'');
    const raw = await fs.readFile(path.join(SRC, f), 'utf8');
    let j;
    try{ j = JSON.parse(raw); }
    catch(e){ console.error('JSON error in', f); continue; }

    const createdMs = parseCreated(j.created);
    items.push({
      id,
      title: j.title || id,
      author: j.author || 'anon',
      sector: j.sector || '—',
      tags: Array.isArray(j.tags) ? j.tags : [],
      board: j.board || null,
      parentId: j.parentId || null,
      rootId: j.rootId || (j.parentId ? j.parentId : id),
      created: j.created || new Date(createdMs).toISOString(),
      createdMs,
      body: pickPreview(j.body || '')
    });
  }

  // сортировка: новые сверху
  items.sort((a,b)=> b.createdMs - a.createdMs);

  // пишем индекс (без служебных полей)
  const slim = items.map(({createdMs, ...rest}) => rest);
  await fs.writeFile(OUT, JSON.stringify(slim, null, 2), 'utf8');
  console.log(`threads-index.json: ${slim.length} items`);
}

main().catch(err=>{ console.error(err); process.exit(1); });
