import assert from "assert";

// Pv: ΔLL + κ·ΔlogdetF
const Pv = (dLL, k, dlogdet) => dLL + k*dlogdet;
// Vσ: λ·(exergy + cvar + infra + causal) (cvar упакован как value)
const Vt = (V, L) => L.ex*V.exergy + L.cv*V.cvar.value + L.in*V.infra_entropy + L.ca*V.causal_penalty;
// ΔlogdetF = log(1 + ||f||^2)
const dlogdet = v => Math.log(1 + v.reduce((s,x)=>s+x*x,0));

// базовые
assert(Math.abs(Pv(0.72, 0.4, 1.08) - 1.152) < 1e-9);
assert(Math.abs(Vt({exergy:2.1,cvar:{value:0.3},infra_entropy:0.2,causal_penalty:0}, {ex:1,cv:1,in:1,ca:1}) - 2.6) < 1e-9);
assert(Math.abs(dlogdet([1,2,2]) - Math.log(1+9)) < 1e-9);

// риск пересушки/распада
const riskDry = (E,A,λ=8e-4)=> Math.max(0,E-A)**2*λ;
const riskDecay = (E,A,λ=2e-3)=> Math.max(0,A-E)*λ;
assert(riskDry(300,240)>0 && riskDry(200,240)===0);
assert(riskDecay(200,240)>0 && riskDecay(260,240)===0);

// softmax селекция (нормируется) — smoke
const softmax = xs => { const m = Math.max(...xs); const es = xs.map(x=>Math.exp(x-m)); const s = es.reduce((a,b)=>a+b,0); return es.map(x=>x/s); };
const pr = softmax([0,1,2]); assert(pr.every(p=>p>0)&&Math.abs(pr.reduce((s,p)=>s+p,0)-1)<1e-9);

console.log("✔ model tests OK");
