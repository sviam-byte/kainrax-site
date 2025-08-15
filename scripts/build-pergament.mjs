import { readdir, readFile, writeFile, stat, access } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const ROOT = 'content/pergament';
const OUT  = path.join(ROOT, 'index.json');

const toPosix = p => p.split(path.sep).join('/');

function sha256Hex(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

async function isFile(p) {
  try { const st = await stat(p); return st.isFile(); } catch { return false; }
}

async function readJSON(p) {
  const raw = await readFile(p, 'utf8');
  try { return JSON.parse(raw); }
  catch (e) { throw new Error(`JSON parse error at ${p}: ${e.message}`); }
}

function normDate(s) {
  // ожидаем YYYY-DDD строго: 4 цифры, дефис, 3 цифры
  if (!/^\d{4}-\d{3}$/.test(String(s || ''))) {
    throw new Error(`Bad date format "${s}". Expected YYYY-DDD (e.g. 0430-349).`);
  }
  return s;
}

async function buildOneDoc(docDirName) {
  const docDir = path.join(ROOT, docDirName);
  const metaPath = path.join(docDir, 'meta.json');
  try { await access(metaPath); } catch { return null; }

  const meta = await readJSON(metaPath);
  const doc = {
    id: meta.id || docDirName,
    title: meta.title || meta.id || docDirName,
    annotation: meta.annotation || '',
    margin: Array.isArray(meta.margin) ? meta.margin : [],
    editions: []
  };

  const defaultCode = meta.defaultCode || process.env.PERG_DEFAULT_CODE || null;
  const defaultCodeHint = meta.defaultCodeHint || 'код доступа';

  // нормализуем редакции
  const eds = Array.isArray(meta.editions) ? meta.editions.slice() : [];
  // сортируем по дате (вверх)
  eds.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  // пометим последнюю
  const lastIdx = eds.length - 1;

  for (let i = 0; i < eds.length; i++) {
    const e = eds[i];
    if (!e || !e.id) throw new Error(`Edition without id in ${metaPath}`);
    const date = normDate(e.date);

    // file: относительный путь внутри папки документа или уже полный
    let fileRel = e.file || `${e.id}.txt`;
    if (!fileRel.startsWith('content/')) {
      fileRel = toPosix(path.join('content/pergament', docDirName, fileRel));
    }
    const fileAbs = path.resolve(fileRel);
    if (!(await isFile(fileAbs))) {
      throw new Error(`Edition file not found: ${fileRel}`);
    }

    // защита: по умолчанию все, кроме последней, защищены
    let protectedFlag = typeof e.protected === 'boolean' ? e.protected : (i !== lastIdx);

    // код/хеш: если защита включена — хешируем явный код редакции или дефолтный
    let codeHash = null;
    const rawCode = e.code || meta.defaultCode || defaultCode || null;
    if (protectedFlag) {
      if (e.codeHash) {
        codeHash = String(e.codeHash);
      } else if (rawCode) {
        codeHash = `sha256:${sha256Hex(rawCode)}`;
      } else {
        // защита просится, но кода нет — сделаем незащищенной, чтобы не ломать рендер
        protectedFlag = false;
      }
    }

    doc.editions.push({
      id: String(e.id),
      title: e.title || String(e.id),
      date,
      file: fileRel,
      ...(protectedFlag ? { protected: true } : {}),
      ...(codeHash ? { codeHash } : {}),
      ...(e.codeHint ? { codeHint: e.codeHint } : (protectedFlag ? { codeHint: defaultCodeHint } : {}))
    });
  }

  // страхуемся: если все оказались "protected", но ни одной codeHash — снимем защиту с последней
  if (doc.editions.length) {
    const anyHash = doc.editions.some(x => x.codeHash);
    if (!anyHash) {
      const last = doc.editions[doc.editions.length - 1];
      delete last.protected;
      delete last.codeHint;
    }
  }

  return doc;
}

async function main() {
  const entries = await readdir(ROOT, { withFileTypes: true });
  const docs = [];
  for (const d of entries) {
    if (!d.isDirectory()) continue;
    const one = await buildOneDoc(d.name).catch(err => {
      throw new Error(`Error in ${d.name}: ${err.message}`);
    });
    if (one) docs.push(one);
  }

  // сортировка документов по дате последней редакции (свежие выше)
  docs.sort((a, b) => {
    const ad = a.editions?.[a.editions.length - 1]?.date || '';
    const bd = b.editions?.[b.editions.length - 1]?.date || '';
    return String(bd).localeCompare(String(ad));
  });

  await writeFile(OUT, JSON.stringify(docs, null, 2) + '\n', 'utf8');
  console.log(`Built ${OUT}: ${docs.length} doc(s).`);
}

main().catch(e => { console.error(e.stack || e); process.exit(1); });
