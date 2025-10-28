(async function(){
  // --- state
  const $ = sel => document.querySelector(sel);
  const m = await fetch("/content/manifest.json").then(r=>r.json());
  const objects = m.objects.map(hydrate);
  const user = { beta: 3, mu:1.0, nu:0.7, gamma:0.4, C:4, vSigmaUser:0 };
  const params = { kappa: 0.4, lambdas:{ ex:1, cv:1, in:1, ca:1 } };

  // bind controls
  $("#kappa").oninput = e=>{ params.kappa = +e.target.value; render(); };
  $("#lex").oninput = e=>{ params.lambdas.ex = +e.target.value; render(); };
  $("#lcv").oninput = e=>{ params.lambdas.cv = +e.target.value; render(); };
  $("#lin").oninput = e=>{ params.lambdas.in = +e.target.value; render(); };
  $("#lca").oninput = e=>{ params.lambdas.ca = +e.target.value; render(); };
  $("#beta").oninput = e=>{ user.beta = +e.target.value; render(); };
  $("#cap").oninput = e=>{ user.C = +e.target.value; render(); };

  function hydrate(o){
    const A = o.attention?.A_star ?? 120;
    const E = o.attention?.E ?? 0;
    const obj = {
      id:o.id, title:o.title, kind:o.kind, authors:o.authors||[],
      media:o.media||[], paths:o.paths, features:o.features||{},
      Pv: { delta_LL: o.model.Pv.delta_LL, delta_logdetF: o.model.Pv.delta_logdetF },
      bandit: { alpha: o.model.bandit.alpha, beta: o.model.bandit.beta },
      Vσ: { exergy:o.model.Vσ.exergy, cvar:o.model.Vσ.cvar, infra_entropy:o.model.Vσ.infra_entropy, causal_penalty:o.model.Vσ.causal_penalty },
      attention: { A_star:A, E, dose:E/A },
      sector: { L_star: o.sector?.L_star ?? 200 },
      drift: 0
    };
    obj.Vσ.total = Vt(obj.Vσ, params.lambdas);
    obj.Pv.score = Pv(obj.Pv.delta_LL, params.kappa, obj.Pv.delta_logdetF);
    return obj;
  }

  // --- models
  function Pv(dLL, k, dlogdet){ return dLL + k*dlogdet; }
  function Vt(V, L){ return L.ex*V.exergy + L.cv*V.cvar.value + L.in*V.infra_entropy + L.ca*V.causal_penalty; }
  function dose(E,A){ return A>0 ? E/A : 0; }
  function riskDry(E,A,λ=8e-4){ return Math.max(0,E-A)**2*λ; }
  function riskDecay(E,A,λ=2e-3){ return Math.max(0,A-E)*λ; }
  function softmaxUs(user,obj){
    const r = riskDry(obj.attention.E,obj.attention.A_star) + 0.5*riskDecay(obj.attention.E,obj.attention.A_star);
    const pv = Pv(obj.Pv.delta_LL, params.kappa, obj.Pv.delta_logdetF);
    const vt = Vt(obj.Vσ, params.lambdas);
    return user.mu*pv - user.nu*vt - user.gamma*r;
  }
  function selectK(k){
    const β = Math.max(0.1, user.beta);
    const scored = objects.map(o=>({o,u:softmaxUs(user,o)}));
    const maxu = Math.max(...scored.map(s=>s.u));
    const Z = scored.reduce((s,x)=> s+Math.exp(β*(x.u-maxu)), 0) || 1;
    const probs = scored.map(x=>({o:x.o,p:Math.exp(β*(x.u-maxu))/Z})).sort((a,b)=>b.p-a.p);
    const res = [];
    let used = objects.reduce((s,o)=> s+o.Vσ.total, 0);
    const Ls = Math.max(...objects.map(o=>o.sector.L_star));
    for (const cand of probs){
      const expAdd = Math.max(0, cand.o.attention.E+1 - cand.o.attention.A_star) * 8e-4;
      if (used + expAdd <= Ls){ res.push(cand.o); used += expAdd; }
      if (res.length>=k) break;
    }
    return res;
  }

  function onView(o){
    // капля внимания
    o.attention.E = Math.round(o.attention.E*0.98 + 1);
    o.attention.dose = dose(o.attention.E, o.attention.A_star);
    // бандит Томпсона (суррогат «успеха просмотра»)
    const prior = (o.bandit.alpha)/(o.bandit.alpha+o.bandit.beta);
    const y = 1; // факт просмотра
    o.bandit.alpha += y; // успех
    const post = (o.bandit.alpha)/(o.bandit.alpha+o.bandit.beta);
    const p0 = 0.5; // базовая вероятность успеха (до объекта)
    const eps = 1e-9;
    o.Pv.delta_LL += y*Math.log((post+eps)/(p0+eps)) + (1-y)*Math.log((1-post+eps)/(1-p0+eps));
    o.Pv.score = Pv(o.Pv.delta_LL, params.kappa, o.Pv.delta_logdetF);
    o.Vσ.total = Vt(o.Vσ, params.lambdas);
    o.drift = Math.min(1, (o.drift || 0) + Math.abs(o.attention.dose-1)*0.01);
  }

  // --- render
  function spark(el, arr, color="#00bfa5"){
    const w=260,h=72, pad=8;
    const c = document.createElement("canvas");
    c.width = w; c.height = h; c.className="spark";
    const ctx = c.getContext("2d");
    const xs = arr.map((_,i)=>i), ys = arr;
    const xmin=0,xmax=xs.length-1, ymin=Math.min(...ys), ymax=Math.max(...ys);
    const sx = t=> pad + (w-2*pad) * (t-xmin)/(xmax-xmin||1);
    const sy = y=> h-pad - (h-2*pad) * (y-ymin)/(ymax-ymin||1);
    ctx.strokeStyle = color; ctx.lineWidth=1.6; ctx.beginPath();
    ctx.moveTo(sx(0), sy(ys[0]));
    for (let i=1;i<ys.length;i++) ctx.lineTo(sx(i), sy(ys[i]));
    ctx.stroke();
    el.appendChild(c);
  }

  function card(o){
    const pv = Pv(o.Pv.delta_LL, params.kappa, o.Pv.delta_logdetF).toFixed(3);
    const vt = Vt(o.Vσ, params.lambdas).toFixed(3);
    const div = document.createElement("section");
    div.className = "card";
    div.innerHTML = `
      <div><span class="small">${o.id}</span><h3>${o.title}<span class="pill">${o.kind}</span></h3>
      <div class="small">authors: ${o.authors.join(", ")||"—"}</div></div>
      <div class="kv"><span>ΔLL</span><b>${o.Pv.delta_LL.toFixed(3)}</b></div>
      <div class="kv"><span>Δlogdet(F)</span><b>${o.Pv.delta_logdetF.toFixed(3)}</b></div>
      <div class="kv"><span>Pv.score</span><b class="${pv>=0?'good':'bad'}">${pv}</b></div>
      <div class="kv"><span>Vσ.total</span><b class="${vt<=2?'good':'bad'}">${vt}</b></div>
      <div class="kv"><span>A*/E</span><b>${o.attention.A_star}/${o.attention.E} (dose ${(o.attention.dose||0).toFixed(2)})</b></div>
      <div class="small">media: ${o.media.map(m=>m.type).join(", ")||"—"}</div>
    `;
    div.onmouseenter = ()=>{ onView(o); render(false); };
    // мини-спектр/гистограмма/текст
    const cont = document.createElement("div"); cont.style.display="grid"; cont.style.gridTemplateColumns="repeat(3,1fr)"; cont.style.gap="6px"; cont.style.marginTop="6px";
    if (o.features?.image?.imgEntropy){
      const arr = (o.features.image.hist||[]).slice(0,128).map(x=>Math.log(1+x));
      spark(cont, arr, "#6fb3ff");
    }
    if (o.features?.audio?.flatness){
      const arr = (o.features.audio.spectrum||[]).slice(0,128);
      spark(cont, arr, "#ffa500");
    }
    if (o.features?.text?.charEntropy){
      const H = o.features.text.charEntropy;
      const ttr = o.features.text.ttr||0;
      spark(cont, [ttr, H/8, Math.min(1, (ttr+H/8)/2)], "#00bfa5");
    }
    div.appendChild(cont);
    return div;
  }

  function render(reset=true){
    // пересчёт Pv/Vσ под текущими λ/κ
    for (const o of objects){
      o.Pv.score = Pv(o.Pv.delta_LL, params.kappa, o.Pv.delta_logdetF);
      o.Vσ.total = Vt(o.Vσ, params.lambdas);
    }
    const pick = selectK(Math.min(user.C, 8));
    $("#app").innerHTML = "";
    const grid = document.createElement("div"); grid.className="grid";
    for (const o of pick) grid.appendChild(card(o));
    $("#app").appendChild(grid);
    const Ls = Math.max(...objects.map(o=>o.sector.L_star));
    const used = objects.reduce((s,o)=>s+o.Vσ.total,0).toFixed(3);
    $("#sector").textContent = `Ликвидность сектора: ${used} / ${Ls}`;
    $("#userVs").textContent = `Личный Vσ: ${user.vSigmaUser.toFixed(3)}`;
  }

  render();
})();
