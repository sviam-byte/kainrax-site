
import {qs,qsa} from './utils.js';

export async function initSearch(){
  const input = qs('input[type=search][data-role=search]');
  if(!input) return;
  const list = qs('[data-role=list]');
  const dataUrl = document.body.dataset.versionPath + '/data/registry.routes.json';
  const res = await fetch(dataUrl); if(!res.ok) return;
  const routes = await res.json();
  const entries = Object.entries(routes).map(([slug,info])=>({slug, title:info.title||slug, type:info.type, path:info.path, tags:info.tags||[]}));
  function render(items){
    list.innerHTML='';
    items.forEach(it=>{
      const a = document.createElement('a');
      a.href = it.path.startsWith('/')? it.path : ('./'+it.path);
      a.className='card';
      a.innerHTML = `<div class="hstack"><span class="badge">${it.type}</span>${it.tags.map(t=>`<span class="badge">${t}</span>`).join('')}</div>
                     <div><strong>${it.title}</strong></div>
                     <div class="meta">${it.slug}</div>`;
      list.appendChild(a);
    });
  }
  render(entries);
  input.addEventListener('input', ()=>{
    const q = input.value.toLowerCase().trim();
    const filtered = entries.filter(e=> e.title.toLowerCase().includes(q) || e.slug.includes(q) || e.tags.join(' ').includes(q));
    render(filtered);
  });
}
