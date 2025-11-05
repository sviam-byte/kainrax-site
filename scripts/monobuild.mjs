// scripts/monobuild.mjs
import {exec as _exec} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir, rm, cp, stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
const exec = promisify(_exec);
const ROOT = process.cwd();
const BUILD = path.join(ROOT, 'build');

// что кладём в корень билда как есть
const STATIC_COPY = ['assets','images','content','o2log','forum','forumen','admin',
                     'home.html','index.html','kids.html'];

async function safeCopy(rel){
  const src = path.join(ROOT, rel);
  if (!existsSync(src)) return;
  const dest = path.join(BUILD, rel);
  await mkdir(path.dirname(dest), {recursive:true});
  const s = await stat(src);
  await cp(src, dest, {recursive: s.isDirectory(), force:true});
}

async function buildCanonar(){
  const cwd = path.join(ROOT, 'canonar');
  if (!existsSync(cwd)) return;
  await exec('npm ci', {cwd});
  await exec('npm run build', {cwd});
  await mkdir(path.join(BUILD, 'canonar'), {recursive:true});
  await cp(path.join(cwd,'dist'), path.join(BUILD,'canonar'), {recursive:true, force:true});
}

async function main(){
  await rm(BUILD, {recursive:true, force:true});
  await mkdir(BUILD, {recursive:true});
  for (const item of STATIC_COPY) await safeCopy(item);
  await buildCanonar();
  console.log('Build ready at /build');
}
main().catch(e=>{ console.error(e); process.exit(1); });
