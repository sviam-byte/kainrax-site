// Автоскан контента → /content/manifest.json
// Поддержка: meta.json|yaml(front-matter), body.{md,html,txt}, media( jpg|jpeg|png|wav )
// Аналитика: текстовая энтропия/типо-токен; гистограмма/энтропия изображения; спектр/центроид аудио.

import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import * as wav from "wav-decoder";
import { fft, util as fftUtil } from "fft-js";

const root = process.cwd();
const CONTENT_DIR = path.join(root, "content");
const OUT = path.join(CONTENT_DIR, "manifest.json");

// --- утилиты
const exists = async p => !!(await fs.stat(p).catch(()=>false));
const walk = async dir => {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
};
const readText = p => fs.readFile(p, "utf8");
const readJSON = async p => JSON.parse(await fs.readFile(p, "utf8"));
const ext = p => path.extname(p).toLowerCase();
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

// --- TEXT ANALYSIS
function textFeatures(txt) {
  const clean = txt.replace(/\s+/g, " ").trim().toLowerCase();
  const words = clean.split(/[^\p{L}\p{N}_]+/u).filter(Boolean);
  const chars = [...clean];
  const T = Math.max(words.length, 1);
  const uniq = new Set(words).size;
  const ttr = uniq / T;
  // Шенноновская энтропия символов
  const freq = {};
  for (const c of chars) freq[c] = (freq[c]||0)+1;
  const N = chars.length || 1;
  let H = 0;
  for (const k in freq) { const p = freq[k]/N; H -= p * Math.log2(p); }
  return { words: T, uniqWords: uniq, ttr, charEntropy: H };
}

// --- IMAGE ANALYSIS
function grayscale(r,g,b){return Math.round(0.2126*r+0.7152*g+0.0722*b);}
function imageFeaturesFromRGBA(w,h,rgba){
  const bins = new Array(256).fill(0);
  let edges=0;
  for (let y=0;y<h;y++){
    for (let x=0;x<w;x++){
      const i = (y*w+x)*4;
      const g = grayscale(rgba[i],rgba[i+1],rgba[i+2]);
      bins[g]++; // hist
      // простейший «градиент»
      if (x+1<w) {
        const j = (y*w+x+1)*4;
        const g2 = grayscale(rgba[j],rgba[j+1],rgba[j+2]);
        if (Math.abs(g-g2)>24) edges++;
      }
    }
  }
  const total = w*h;
  // энтропия гистограммы
  let H=0;
  for (let i=0;i<256;i++){
    const p = bins[i]/total;
    if (p>0) H -= p*Math.log2(p);
  }
  const edgeDensity = edges/(w*h);
  return { imgEntropy: H, edgeDensity, hist: bins };
}
async function imageFeatures(file){
  const buf = await fs.readFile(file);
  const e = ext(file);
  if (e===".png"){
    const png = PNG.sync.read(buf);
    return imageFeaturesFromRGBA(png.width, png.height, png.data);
  }
  if (e===".jpg" || e===".jpeg"){
    const d = jpeg.decode(buf, { useTArray:true });
    return imageFeaturesFromRGBA(d.width, d.height, d.data);
  }
  return null;
}

// --- AUDIO ANALYSIS (WAV)
async function audioFeatures(file){
  const buf = await fs.readFile(file);
  const audio = await wav.decode(buf);
  const ch0 = audio.channelData[0];
  const N = Math.min(8192, ch0.length);
  const slice = ch0.slice(0, N);
  // окно Ханна
  for (let i=0;i<N;i++){ slice[i] *= 0.5*(1-Math.cos(2*Math.PI*i/(N-1))); }
  const phasors = fft(slice);
  const mags = fftUtil.fftMag(phasors).slice(0, N/2);
  const sum = mags.reduce((s,v)=>s+v,0) || 1;
  const norm = mags.map(x=>x/sum);
  // спектральный центроид и flatness
  let centroid=0, geo=0;
  for (let i=0;i<norm.length;i++){ centroid += i*norm[i]; }
  const eps=1e-12;
  const arith = norm.reduce((s,v)=>s+v,0)/norm.length;
  const logMean = Math.exp(norm.reduce((s,v)=>s+Math.log(v+eps),0)/norm.length);
  const flatness = clamp(logMean/arith, 0, 1);
  return { spectrum: Array.from(norm), centroid, flatness };
}

// --- упрощённые «ресурсные» оценки
function estimateExergy(bytes, kind){
  // базово: МБ «весят» эксергию; аудио чуть дороже, видео ещё дороже
  const mb = bytes/1_000_000;
  const k = kind==="audio"? 1.8 : kind==="image" ? 1.2 : kind==="text" ? 0.6 : 1.0;
  return +(mb*k).toFixed(3);
}
function estimateInfraEntropy(fileCount, uniqueKinds){
  // чем больше файлов и типы, тем больше «инфра-энтропия»
  return +(Math.log2(1+fileCount) * (1+0.2*uniqueKinds)).toFixed(3);
}

// --- сборка одного объекта
async function buildObject(folder){
  const rel = path.relative(CONTENT_DIR, folder);
  const files = await fs.readdir(folder);
  // meta: meta.json или front-matter в body
  let meta = {};
  const metaPath = path.join(folder, "meta.json");
  if (await exists(metaPath)) meta = await readJSON(metaPath);
  let body = "";
  let bodyPath = null;
  for (const name of files){
    if (/^body\.(md|markdown|html|txt)$/i.test(name)) { bodyPath = path.join(folder, name); break; }
  }
  if (bodyPath){
    const raw = await readText(bodyPath);
    const fm = matter(raw);
    body = fm.content;
    meta = { ...fm.data, ...meta }; // front-matter дополняет
  }

  // медиа и признаки
  const media = [];
  let textFeat=null, imgFeat=null, audFeat=null;
  let bytes=0, uniqueKinds=0;
  const seenKind = new Set();

  for (const name of files){
    const p = path.join(folder, name);
    const st = await fs.stat(p);
    if (st.isDirectory()) continue;
    const e = ext(p);
    if (/\.md|\.markdown|\.html|\.txt$/i.test(e)) {
      if (!textFeat){
        const t = body || await readText(p);
        textFeat = textFeatures(t);
      }
      bytes += st.size; seenKind.add("text");
      media.push({ type:"text", path: path.posix.join("/", "content", rel, name) });
    } else if (e===".png"||e===".jpg"||e===".jpeg"){
      imgFeat = (await imageFeatures(p));
      bytes += st.size; seenKind.add("image");
      media.push({ type:"image", path: path.posix.join("/", "content", rel, name), analysis: imgFeat? { hist: imgFeat.hist } : null });
    } else if (e===".wav"){
      audFeat = (await audioFeatures(p));
      bytes += st.size; seenKind.add("audio");
      media.push({ type:"audio", path: path.posix.join("/", "content", rel, name), analysis: audFeat? { spectrum: audFeat.spectrum.slice(0,128) } : null });
    }
  }
  uniqueKinds = seenKind.size;

  // базовые модели/параметры
  const features = {
    text: textFeat,
    image: imgFeat && { imgEntropy: imgFeat.imgEntropy, edgeDensity: imgFeat.edgeDensity },
    audio: audFeat && { centroid: audFeat.centroid, flatness: audFeat.flatness }
  };
  const fvec = [
    textFeat?.charEntropy ?? 0,
    textFeat?.ttr ?? 0,
    imgFeat?.imgEntropy ?? 0,
    imgFeat?.edgeDensity ?? 0,
    audFeat?.flatness ?? 0,
    audFeat?.centroid ?? 0
  ];
  const f2 = fvec.reduce((s,v)=>s+v*v,0);
  const delta_logdetF = Math.log(1 + f2); // det(I + v v^T) = 1 + ||v||^2
  const exergy = estimateExergy(bytes, seenKind.has("audio") ? "audio" : seenKind.has("image") ? "image" : "text");
  const infra_entropy = estimateInfraEntropy(files.length, uniqueKinds);
  const cvar = +(0.1 + 0.3*(audFeat?.flatness ?? 0) + 0.2*(imgFeat?.edgeDensity ?? 0)).toFixed(3); // грубая прокси «хвостового риска»
  const causal_penalty = +(meta.causal_penalty ?? 0);

  // приоритеты внимания
  const A_star = meta.A_star ?? Math.round(120 + 60*(textFeat?.ttr ?? 0) + 40*(imgFeat?.imgEntropy ?? 0));

  return {
    id: meta.id || rel.replace(/[\\/]/g, ":"),
    title: meta.title || path.basename(folder),
    authors: meta.authors || [],
    kind: meta.kind || "artefact",
    tags: meta.tags || [],
    paths: { folder: path.posix.join("/", "content", rel), body: bodyPath ? path.posix.join("/", "content", rel, path.basename(bodyPath)) : null },
    media,
    features,
    model: {
      Pv: { delta_LL: +(meta.delta_LL ?? 0).toFixed(3), delta_logdetF },
      bandit: { alpha: meta.bandit?.alpha ?? 1, beta: meta.bandit?.beta ?? 1 },
      Vσ: { exergy, cvar: { alpha: 0.05, value: cvar }, infra_entropy, causal_penalty }
    },
    attention: { A_star, E: meta.E ?? 0 },
    sector: { L_star: meta.L_star ?? 200 },
    meta
  };
}

// --- точки входа: скан каталогов верхнего уровня
const TOPS = ["objects", "articles", "notes", "pergament", "stories"];

async function main(){
  const found = [];
  for (const top of TOPS){
    const dir = path.join(CONTENT_DIR, top);
    if (!await exists(dir)) continue;
    const all = await walk(dir);
    // «папка объекта» — та, где есть meta.json или body.*
    const folders = new Set();
    for (const p of all){
      if (/(^|\/)meta\.json$/.test(p) || /(^|\/)body\.(md|markdown|html|txt)$/i.test(p)){
        folders.add(path.dirname(p));
      }
    }
    for (const f of folders){
      const obj = await buildObject(f).catch(e=>{ console.error("ERR", f, e); return null; });
      if (obj) found.push(obj);
    }
  }
  // сортировку оставлю по заголовку
  found.sort((a,b)=>a.title.localeCompare(b.title, "ru"));
  await fs.writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), objects: found }, null, 2), "utf8");
  console.log(`✔ manifest written: ${path.relative(root, OUT)} (${found.length} objects)`);
}
main().catch(e=>{ console.error(e); process.exit(1); });
