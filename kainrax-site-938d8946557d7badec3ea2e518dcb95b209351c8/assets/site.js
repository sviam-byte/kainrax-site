// Тема: dark → light → cringe (по кнопке и клавише "T")
(function(){
  const key='theme', root=document.documentElement;
  const saved=localStorage.getItem(key)||'dark'; apply(saved);
  document.addEventListener('keyup',e=>{ if((e.key||'').toLowerCase()==='t') cycle(); });
  document.getElementById('theme-toggle')?.addEventListener('click', cycle);

  function cycle(){
    const o=['dark','light','cringe'];
    const cur=localStorage.getItem(key)||'dark';
    const next=o[(o.indexOf(cur)+1)%o.length];
    apply(next);
  }
  function apply(t){
    root.classList.remove('theme-dark','theme-light','theme-cringe');
    root.classList.add('theme-'+t);
    // для совместимости с существующим кодом, который смотрит на data-theme
    root.setAttribute('data-theme', t);
    localStorage.setItem(key,t);
  }
})();

// Plausible только на проде
(function(){
  const PROD=['kainrax.netlify.app'];
  if (PROD.includes(location.hostname)) {
    const s=document.createElement('script');
    s.defer=true;
    s.setAttribute('data-domain','kainrax.netlify.app');
    s.src='https://plausible.io/js/script.js';
    document.head.appendChild(s);
  }
})();

// Хелпер лор-даты (если захочешь использовать)
window.formatLoreDate = function(s){
  if(!s) return '';
  const [Y,M,D]=(s+'').split('-').map(Number);
  if(!Y) return s;
  if(!M||M===0) return (D&&D!==0)?`${D}-й день ${Y}-го года`:`${Y}-й год`;
  if(!D||D===0) return `${M}-й месяц ${Y}-го года`;
  return `${D}-й день ${M}-го месяца ${Y}-го года`;
};

// Счётчик просмотров (наш Netlify Function)
window.hit = async function(slug,outEl){
  try{
    const r=await fetch('/.netlify/functions/hit',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({slug})
    });
    const j=await r.json();
    if(outEl) outEl.textContent=j?.count??'—';
  }catch(e){ if(outEl) outEl.textContent='—'; }
};
