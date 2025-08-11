import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import matter from 'gray-matter';

const ROOT = process.cwd();
const CONTENT = join(ROOT, 'content');
const STORIES = join(CONTENT, 'stories');
const PARCH = join(CONTENT, 'parchment');

function listMd(dir){
  const out=[];
  (function walk(d){
    for(const f of readdirSync(d)){
      const p=join(d,f);
      if(statSync(p).isDirectory()) walk(p);
      else if(f.endsWith('.md')) out.push(p);
    }
  })(dir);
  return out;
}

const stories = (statSync(STORIES,{throwIfNoEntry:false}) ? listMd(STORIES) : [])
  .map(p=>{
    const rel=relative(CONTENT,p).replace(/\\/g,'/');
    const { data } = matter(readFileSync(p,'utf8'));
    return {
      slug: rel.replace(/^stories\//,'').replace(/\.md$/,''),
      title: data.title || rel,
      arc: data.arc || 'Misc'
    };
  })
  .sort((a,b)=> a.arc.localeCompare(b.arc,'ru') || a.title.localeCompare(b.title,'ru'));

const parchments = (statSync(PARCH,{throwIfNoEntry:false}) ? readdirSync(PARCH) : [])
  .filter(f=>f.endsWith('.md'))
  .map(f=>{
    const { data } = matter(readFileSync(join(PARCH,f),'utf8'));
    return {
      id: data.id,
      title: data.title,
      arc: data.arc || '',
      place: data.place || '',
      lock_latest: !!data.lock_latest,
      revisions: (data.revisions||[]).map(r=>({
        edition:r.edition, title:r.title, date:r.date, file:r.file
      }))
    };
  })
  .sort((a,b)=> a.title.localeCompare(b.title,'ru'));

const manifest = { generatedAt:new Date().toISOString(), stories, parchments };
const outFile = join(ROOT,'public','content-index.json');
writeFileSync(outFile, JSON.stringify(manifest,null,2));
console.log('content-index.json updated ->', outFile);
