
export const qs = (sel, el=document)=>el.querySelector(sel);
export const qsa = (sel, el=document)=>Array.from(el.querySelectorAll(sel));
export const fmt = (n, digits=2)=>Number.isFinite(n)?Number(n).toFixed(digits):'—';
export const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
export const emit=(el,type,detail={})=>el.dispatchEvent(new CustomEvent(type,{detail}));
