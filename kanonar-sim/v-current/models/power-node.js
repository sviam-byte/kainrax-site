
// /models/power-node.js
export function evaluate(params, {context}){
  const pIn = Number(params.power_in)||0;
  const eff = Number(params.efficiency)||0;
  const loss = Number(params.loss)||0;
  const cap = Number(params.capacity)||100;
  const power_out = pIn * eff * (1 - loss);
  const load_pct = (power_out / Math.max(1,cap)) * 100;
  const stability = Math.max(0, 100 - Math.abs(load_pct-60)*0.8); // peak around 60%
  const warnings = [];
  let flags='valid';
  if(eff<0.2 || eff>0.95) { warnings.push('efficiency-out-of-nominal'); flags='warning'; }
  if(loss>0.6) { warnings.push('excess-loss'); flags='warning'; }
  if(load_pct>120) { warnings.push('overload'); flags='monster'; }
  return {
    derived: { power_out, load_pct, stability },
    warnings, flags
  };
}
