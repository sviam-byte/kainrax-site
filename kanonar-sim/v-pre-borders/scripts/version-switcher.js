
import {qs,qsa} from './utils.js';

async function loadRoutes(versionPath){
  const res = await fetch(versionPath + '/data/registry.routes.json');
  if(!res.ok) return {};
  return res.json();
}

export async function initVersionSwitcher(){
  const sel = qs('select[data-role=version-switch]');
  if(!sel) return;
  const currentVersion = document.body.dataset.version;
  const currentSlug = document.body.dataset.slug || null;
  const versions = Array.from(sel.options).map(o=>o.value);

  const routeMaps = {};
  await Promise.all(versions.map(async v=> routeMaps[v]=await loadRoutes('/'+v)));

  sel.addEventListener('change', e=>{
    const targetV = e.target.value;
    if(targetV===currentVersion) return;
    const map = routeMaps[targetV]||{};
    if(currentSlug && map[currentSlug]?.path){
      location.href = `/${targetV}/${map[currentSlug].path}`;
    }else{
      // fallback: go to version index
      location.href = `/${targetV}/index.html`;
    }
  });
}
