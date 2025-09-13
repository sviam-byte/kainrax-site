// netlify/functions/pergament-index.js
const fs = require("fs/promises");
const path = require("path");

// где лежит контент в лямбде
const ROOT = path.resolve(process.env.LAMBDA_TASK_ROOT || process.cwd());
const DIR_PERG = path.join(ROOT, "content", "pergament");

// утилиты
async function safeStat(p){ try{ return await fs.stat(p); } catch{ return null; } }
async function listDirs(dir){
  try{
    const s = await safeStat(dir);
    if(!s || !s.isDirectory()) return [];
    const all = await fs.readdir(dir, { withFileTypes: true });
    return all.filter(e => e.isDirectory()).map(e => e.name);
  } catch { return []; }
}
async function listFiles(dir, re){
  try{
    const s = await safeStat(dir);
    if(!s || !s.isDirectory()) return [];
    const all = await fs.readdir(dir, { withFileTypes: true });
    return all.filter(e => e.isFile() && re.test(e.name)).map(e => e.name);
  } catch { return []; }
}

function pickDate(meta, fname){
  // поддерживаем несколько форматов в meta.json
  // 1) { editions: [{file,date,note}, ...] }
  // 2) { dates: { "e7.txt":"2025-03-01", ... }, notes: {...} }
  // 3) { files: { "e7.txt": {date:"...", note:"..."} } }
  if(!meta) return { date: "", note: "" };
  if (Array.isArray(meta.editions)) {
    const item = meta.editions.find(e => (e.file||"").trim() === fname.trim());
    if (item) return { date: String(item.date||""), note: String(item.note||"") };
  }
  if (meta.files && meta.files[fname]) {
    const it = meta.files[fname] || {};
    return { date: String(it.date||""), note: String(it.note||"") };
  }
  if (meta.dates && meta.dates[fname]) {
    const d = meta.dates[fname];
    const n = meta.notes ? meta.notes[fname] : "";
    return { date: String(d||""), note: String(n||"") };
  }
  return { date: "", note: "" };
}

function extractNum(fname){
  // e47.md -> 47, e7.txt -> 7, иначе Infinity чтобы улетало в конец
  const m = fname.match(/e(\d+)\.(?:md|txt)$/i);
  return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
}

exports.handler = async () => {
  try{
    const rootStat = await safeStat(DIR_PERG);
    if(!rootStat || !rootStat.isDirectory()){
      return { statusCode: 200, headers:{ "Content-Type":"application/json; charset=utf-8" }, body: "[]" };
    }

    const folders = await listDirs(DIR_PERG);

    const docs = await Promise.all(folders.map(async dirName => {
      const dirAbs = path.join(DIR_PERG, dirName);
      // meta.json не обязателен, но если есть — используем
      let meta = {};
      try{
        const raw = await fs.readFile(path.join(dirAbs,"meta.json"), "utf8");
        meta = JSON.parse(raw);
      }catch(_){}

      const files = await listFiles(dirAbs, /^e\d+\.(md|txt)$/i);
      files.sort((a,b)=> extractNum(a) - extractNum(b)); // от старых к новым

      const editions = files.map(fname => {
        const { date, note } = pickDate(meta, fname);
        return {
          file: `content/pergament/${dirName}/${fname}`,
          date: date || "",  // формат YYYY-MM-DD или "2025-123" — фронт сам красиво выведет
          note: note || ""
        };
      });

      const last = editions[editions.length - 1] || {};
      // заголовок/аннотация: из meta.json или из имени папки
      return {
        id: meta.id || dirName,
        title: meta.title || dirName,
        annotation: meta.annotation || meta.anno || "",
        source: meta.source || "",
        date: meta.date || last.date || "", // резервная «общая дата»
        editions
      };
    }));

    // сортируем по дате последней редакции или по номеру e*
    docs.sort((a,b)=>{
      const ad = (a.editions[a.editions.length-1]||{}).date || a.date || "";
      const bd = (b.editions[b.editions.length-1]||{}).date || b.date || "";
      const cmp = String(bd).localeCompare(String(ad));
      if (cmp) return cmp;
      // если дат нет — по «макс. номеру eN»
      const maxA = Math.max(...a.editions.map(e=>extractNum(path.basename(e.file))));
      const maxB = Math.max(...b.editions.map(e=>extractNum(path.basename(e.file))));
      return maxB - maxA;
    });

    return {
      statusCode: 200,
      headers: { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store" },
      body: JSON.stringify(docs)
    };
  }catch(e){
    return {
      statusCode: 500,
      headers: { "Content-Type":"application/json; charset=utf-8" },
      body: JSON.stringify({ error:"internal", reason:String(e && e.message || e) })
    };
  }
};
