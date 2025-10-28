
// /models/identity.js
export function evaluate(params,{context}){
  return {derived: {...params}, warnings:[], flags:'valid'};
}
