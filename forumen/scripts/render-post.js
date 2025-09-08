// forum/scripts/render-post.js
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.join(__dirname, '..');

function esc(s='') {
  return String(s).replace(/[&<>\"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}
function paragraphs(text=''){
  const safe = String(text).replace(/&/g,"&amp;").replace(/</g,"&lt;");
  return safe.split(/\n{2,}/).map(p=>`<p>${p.replace(/\n/g,"<br>")}</p>`).join("");
}
function fmtDayYear(s){
  if(!s) return '';
  const m=String(s).trim().match(/^(\d{3,4})[\s\-_:.\/]+(\d{1,3})(?:.*?(\d{1,2}):(\d{2}))?$/);
  if(m){const yy=+m[1],doy=+m[2];const hh=m[3]?m[3].padStart(2,'0'):'00',mm=m[4]?m[4]:'00';return `${doy}-й день ${yy}-го года, ${hh}:${mm}`}
  const d=new Date(s); if(!isNaN(d)){const ry=d.getUTCFullYear(); const wy=ry===2024?429:ry===2025?430:(ry-1595);
    const start=new Date(Date.UTC(ry,0,1)); const doy=Math.floor((d-start)/86400000)+1;
    const hh=String(d.getHours()).padStart(2,'0'),mm=String(d.getMinutes()).padStart(2,'0');
    return `${doy}-й день ${wy}-го года, ${hh}:${mm}` }
  return s;
}

function renderComment(c, depth=0){
  const pad = Math.min(depth*14, 56);
  const name = c.author || 'anon';
  const when = fmtDayYear(c.created);
  const body = esc(c.body||'');
  const replies = Array.isArray(c.replies) ? c.replies.map(x=>renderComment(x, depth+1)).join('') : '';
  return `
    <div class="comment" style="margin-left:${pad}px">
      <div class="kx-muted" style="font-size:12px">${when} · ${esc(name)}${c.sector?` · сектор: ${esc(c.sector)}`:''}</div>
      <div style="margin-top:6px;white-space:pre-wrap">${body}</div>
      ${replies}
    </div>`;
}

function pageTemplate({title, meta, body, tagsHtml, commentsHtml}){
  return `<!doctype html>
<html lang="ru" data-theme="subsurface">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${esc(title)} — Доска сектора</title>
  <meta name="theme-color" content="#0b0f14"/>
  <link rel="icon" type="image/png" sizes="64x64" href="/assets/icon-64.png" />
  <style>
    :root{--bg:#0b0f14;--panel:#0e141d;--card:#0e141d;--text:#e6edf5;--muted:#9fb0c7;--tag:#112131;--tag-on:#183140;--link:#bfe9ff;--ring:#7dd3fc;--brand:#7dd3fc;--r:14px;--shadow:0 1px 0 rgba(255,255,255,.03) inset,0 8px 30px rgba(0,0,0,.35)}
    body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial}
    a{color:var(--link);text-decoration:none} a:hover{text-decoration:underline}
    .kx-shell{max-width:900px;margin:0 auto;padding:16px}
    .kx-panel{background:linear-gradient(180deg,rgba(255,255,255,.02),transparent),var(--panel);border:1px solid rgba(255,255,255,.06);border-radius:var(--r);box-shadow:var(--shadow);padding:18px}
    .kx-tag{display:inline-flex;align-items:center;padding:4px 8px;border-radius:10px;background:var(--tag);color:var(--muted);font-size:12px;border:1px solid rgba(255,255,255,.06)}
    .kx-muted{color:var(--muted);font-size:14px}
    .comment{border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px;background:var(--card);margin-top:10px}
  </style>
</head>
<body>
  <main class="kx-shell">
    <article class="kx-panel">
      <header class="post-head">
        <h1 style="margin:4px 0 8px 0;font-size:24px">${esc(title)}</h1>
        <div class="kx-muted">${meta}</div>
      </header>
      <div class="post-body" style="line-height:1.65">${body}</div>
      ${tagsHtml ? `<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">${tagsHtml}</div>`:''}
      ${commentsHtml ? `<hr style="border:0;height:1px;background:rgba(255,255,255,.08);margin:16px 0"><div>${commentsHtml}</div>`:''}
    </article>
  </main>
</body>
</html>`;
}

async function loadThreadById(id){
  const file = path.join(ROOT, 'content', 'threads', `${id}.json`);
  const raw  = await fs.readFile(file, 'utf8');
  return JSON.parse(raw);
}

async function main(){
  const args = Object.fromEntries(process.argv.slice(2).map(a=>{
    const m=a.match(/^--([^=]+)=(.*)$/); return m? [m[1],m[2]] : [a.replace(/^--/,''), true];
  }));
  let t;
  if (args.file) {
    t = JSON.parse(await fs.readFile(path.resolve(args.file), 'utf8'));
  } else if (args.id) {
    t = await loadThreadById(args.id);
  } else {
    console.error('Usage: node scripts/render-post.js --id <threadId> [--out file]  OR  --file path/to/thread.json');
    process.exit(2);
  }

  const title = t.title || '(без названия)';
  const when  = fmtDayYear(t.created);
  const author= t.author || 'anon';
  const meta  = `${when} · ${esc(author)}${t.sector?` · сектор: ${esc(t.sector)}`:''}${t.board?` · раздел: ${esc(t.board)}`:''}`;

  const bodyHtml = paragraphs(t.body||'');

  const tagsHtml = Array.isArray(t.tags) ? t.tags.map(x=>`<a class="kx-tag" href="/tags.html#/${encodeURIComponent(x)}">${esc(x)}</a>`).join(' ') : '';

  // Комменты (дерево)
  const commentsHtml = Array.isArray(t.comments) && t.comments.length
    ? `<div><strong>Комментарии:</strong></div>
       <div style="margin-top:8px;display:flex;flex-direction:column;gap:10px">
          ${t.comments.map(c=>renderComment(c,0)).join('')}
       </div>`
    : '';

  const html = pageTemplate({title, meta, body: bodyHtml, tagsHtml, commentsHtml});

  if (args.out && args.out !== true) {
    const outPath = path.resolve(args.out);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, html, 'utf8');
    console.log('Wrote', outPath);
  } else {
    process.stdout.write(html);
  }
}

main().catch(err=>{ console.error(err); process.exit(1); });
