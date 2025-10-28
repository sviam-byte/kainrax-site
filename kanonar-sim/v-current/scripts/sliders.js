
import {qs,qsa,fmt,clamp,emit} from './utils.js';
import {evaluateModel} from './evaluate.js';

function attachRanges(ctx){
  const panel = qs('[data-panel=params]', ctx);
  if(!panel) return;
  const modelId = panel.dataset.modelId;
  const limits = {};
  const params = {};
  qsa('input[type=range][data-param]', panel).forEach(r=>{
    const name = r.dataset.param;
    limits[name] = {min: Number(r.min), max: Number(r.max), step: Number(r.step||1)};
    params[name] = Number(r.value);
    const out = panel.querySelector(`[data-out="${name}"]`);
    const upd = ()=>{ params[name]=Number(r.value); out.textContent = r.value; emit(panel,'params:change',{params}); refresh(); };
    r.addEventListener('input', upd);
    out.textContent = r.value;
  });

  async function refresh(){
    const res = await evaluateModel(modelId, params, {version: document.body.dataset.version});
    const box = qs('[data-panel=results]', ctx);
    if(!res || !box) return;
    // badges
    const flags = box.querySelector('[data-field=flags]');
    flags.innerHTML='';
    const mk=(txt,cls)=>{ const b=document.createElement('span'); b.className='badge '+cls; b.textContent=txt; flags.appendChild(b);};
    if(res.flags==='valid') mk('valid','ok');
    if(res.flags==='warning') mk('warning','warn');
    if(res.flags==='monster') mk('monster','err');
    // numbers
    qsa('[data-derived]', box).forEach(el=>{
      const key = el.dataset.derived;
      const v = res.derived?.[key];
      el.textContent = fmt(v);
    });
    // spark fake percentage
    qsa('.spark', box).forEach(s=>{
      const key = s.dataset.key;
      const v = res.derived?.[key] ?? 0;
      const pct = Math.max(0, Math.min(100, Number(v)));
      s.style.setProperty('--val', pct+'%');
    });
    // warnings
    const warn = qs('[data-field=warnings]', box);
    warn.innerHTML = '';
    (res.warnings||[]).forEach(w=>{
      const span = document.createElement('span');
      span.className = 'badge warn';
      span.textContent = w;
      warn.appendChild(span);
    });
  }
  refresh();
}

export function initSliders(){ qsa('[data-component=object]', document).forEach(attachRanges); }
