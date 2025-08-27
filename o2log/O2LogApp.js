/* O2LogApp.js — интерактивная витрина логов O2
   — Зум выделением (ReferenceArea), колесиком
   — Панорамирование кнопками
   — Единицы: L/min ↔ mL/min; время: Clock ↔ Elapsed
   — Шкалы: фиксированные и авто по окну
*/
export default function O2LogApp({ React, Recharts }) {
  const { useMemo, useState, useRef } = React;
  const {
    LineChart, Line, XAxis, YAxis, Tooltip, Legend,
    ResponsiveContainer, CartesianGrid, ReferenceArea, Brush
  } = Recharts;

  /* ---------- демо-лог и парсинг ---------- */
  function makeDemo() {
    const out = [];
    const start = Date.now() - 60*60*1000; // час назад
    for (let i=0;i<3600;i++){
      const t = start + i*1000;
      let flow = 0.5 + (Math.random()-0.5)*0.02;
      // «ночной» всплеск с 02:10 до 02:20 — 10 мин с пиками
      if (i>1300 && i<1900) flow += 0.35 + Math.sin(i/12)/50;
      // чуть-чуть «дыхательной» пилы
      flow += Math.sin(i/5)/200;
      const spo2 = 94 + (flow>0.7 ? -4.2 : 0) + (Math.random()-0.5)*0.5;
      out.push({ ts:t, flow:+flow.toFixed(3), spo2:+spo2.toFixed(1) });
    }
    return out;
  }

  const [raw, setRaw] = useState(makeDemo());
  const [mode, setMode] = useState('ma');        // сглаживание: 'ma' | 'ema' | 'step'
  const [win, setWin] = useState(15);            // окно для MA/step (сек)
  const [alpha, setAlpha] = useState(0.2);       // EMA

  // единицы
  const [flowUnit, setFlowUnit] = useState('LPM');     // 'LPM' | 'MLPM'
  const [timeUnit, setTimeUnit] = useState('CLOCK');   // 'CLOCK' | 'ELAPSED'

  // шкалы
  const [flowScale, setFlowScale] = useState('FIXED'); // 'FIXED' | 'AUTO'
  const [spoScale, setSpoScale]   = useState('FIXED'); // 'FIXED' | 'AUTO'

  // управление окном просмотра по X (ts, ms)
  const xMinAll = raw.length ? raw[0].ts : 0;
  const xMaxAll = raw.length ? raw[raw.length-1].ts : 1;
  const [xDom, setXDom] = useState([xMinAll, xMaxAll]);   // домен X
  React.useEffect(()=>{ if(raw.length) setXDom([raw[0].ts, raw[raw.length-1].ts]); }, [raw.length]);

  // прямоугольник выделения для zoom
  const selRef = useRef({ left: null, right: null, active: false });
  const [selState, setSelState] = useState({ left:null, right:null });

  /* ---------- парсинг входного файла ---------- */
  function parseFileText(txt){
    try{
      const j = JSON.parse(txt);
      const arr = Array.isArray(j) ? j : (Array.isArray(j.data)?j.data:[]);
      const norm = arr.map((r, i)=>({
        ts: r.ts ? new Date(r.ts).getTime() : (Date.now()+i*1000),
        flow: Number(r.flow ?? r.FLOW ?? r.q ?? 0),
        spo2: (r.spo2 ?? r.SpO2 ?? r.sat)
              ? Number(r.spo2 ?? r.SpO2 ?? r.sat) : NaN,
      })).filter(x=>Number.isFinite(x.flow));
      return norm.length ? norm : null;
    }catch(e){ return null; }
  }
  async function onFile(e){
    const f=e.target.files?.[0]; if(!f) return;
    const txt = await f.text();
    const arr = parseFileText(txt);
    if(arr){ setRaw(arr); } else { alert('Нужен JSON: [{ ts, flow[, spo2] }]'); }
  }

  /* ---------- сглаживание ---------- */
  function movingAvg(data, n){
    const out=[], q=[]; n=Math.max(1,Math.round(n));
    for(const d of data){
      q.push(d.flow); if(q.length>n) q.shift();
      const m = q.reduce((a,b)=>a+b,0)/q.length;
      out.push({...d, flow_s:m});
    }
    return out;
  }
  function ema(data, a){
    let m = data[0]?.flow ?? 0.5; const out=[];
    for(const d of data){ m = a*d.flow + (1-a)*m; out.push({...d, flow_s:m}); }
    return out;
  }
  function stepHold(data, bin){
    const out=[]; let acc=0,c=0,hold=data[0]?.flow ?? 0.5; bin=Math.max(1,Math.round(bin));
    for(const d of data){ acc+=d.flow; c++; if(c>=bin){ hold=acc/c; acc=0; c=0; } out.push({...d, flow_s:hold}); }
    return out;
  }

  const processed = useMemo(()=>{
    if(!raw.length) return [];
    if(mode==='ema')  return ema(raw, alpha);
    if(mode==='step') return stepHold(raw, win);
    return movingAvg(raw, win);
  }, [raw, mode, win, alpha]);

  /* ---------- единицы/форматирование ---------- */
  const kFlow = flowUnit==='MLPM' ? 1000 : 1;               // L→mL
  function fmtFlow(x){ return (x*kFlow).toFixed( flowUnit==='MLPM' ? 0 : 3 ); }
  function fmtFlowUnit(){ return flowUnit==='MLPM' ? 'мЛ/мин' : 'Л/мин'; }
  function fmtSpo(x){ return Number.isFinite(x) ? x.toFixed(1) : ''; }

  function fmtClock(ts){
    const d=new Date(ts);
    return d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }
  function fmtElapsed(ts0, ts){
    const s = Math.max(0, Math.round((ts - ts0)/1000));
    const hh = Math.floor(s/3600);
    const mm = Math.floor((s%3600)/60);
    const ss = s%60;
    return (hh?String(hh).padStart(2,'0')+':':'')+String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0');
  }

  // Представление для чарта
  const data = useMemo(()=>{
    if(!processed.length) return [];
    const t0 = processed[0].ts;
    return processed.map(d=>({
      ts: d.ts,
      flow_raw: d.flow * kFlow,
      flow_s:   d.flow_s * kFlow,
      spo2:     d.spo2,
      label: timeUnit==='CLOCK' ? fmtClock(d.ts) : fmtElapsed(t0, d.ts)
    }));
  }, [processed, kFlow, timeUnit]);

  /* ---------- домены осей (авто по окну) ---------- */
  function sliceByX(domain){
    const [a,b] = domain || xDom;
    const lo = Math.min(a,b), hi = Math.max(a,b);
    return data.filter(d => d.ts>=lo && d.ts<=hi);
  }
  function padded([lo, hi], pad=0.1){
    const size = hi-lo || 1;
    return [lo - size*pad, hi + size*pad];
  }

  const yFlowDomain = useMemo(()=>{
    if(!data.length) return [0, 1];
    if(flowScale==='FIXED'){
      const top = flowUnit==='MLPM' ? 1200 : 1.2;
      return [0, top];
    }
    const sl = sliceByX(xDom);
    let mn=Infinity, mx=-Infinity;
    for(const d of sl){ if(Number.isFinite(d.flow_raw)){ mn=Math.min(mn, d.flow_raw); mx=Math.max(mx, d.flow_raw); }
                        if(Number.isFinite(d.flow_s)){   mn=Math.min(mn, d.flow_s);   mx=Math.max(mx, d.flow_s); } }
    if(!isFinite(mn)||!isFinite(mx)) return [0,1];
    if(mn===mx){ mx=mn+1; }  // чтобы не схлопнулось
    return padded([Math.max(0,mn), mx], 0.15);
  }, [data, xDom, flowScale, flowUnit]);

  const ySpoDomain = useMemo(()=>{
    if(spoScale==='FIXED') return [85,100];
    const sl = sliceByX(xDom);
    let mn=Infinity, mx=-Infinity;
    for(const d of sl){ if(Number.isFinite(d.spo2)){ mn=Math.min(mn,d.spo2); mx=Math.max(mx,d.spo2); } }
    if(!isFinite(mn)||!isFinite(mx)) return [85,100];
    if(mn===mx){ mx=mn+0.5; }
    const dom = padded([mn, mx], 0.1);
    return [Math.max(80, Math.floor(dom[0])), Math.min(100, Math.ceil(dom[1]))];
  }, [data, xDom, spoScale]);

  /* ---------- zoom/pan управление ---------- */
  function clampDom([a,b]){
    const lo = Math.max(xMinAll, Math.min(a,b));
    const hi = Math.min(xMaxAll, Math.max(a,b));
    const minSpan = 5000; // минимум 5 секунд
    return (hi-lo < minSpan) ? [lo, lo+minSpan] : [lo, hi];
  }

  function onMouseDown(e){
    if(!e || e.activeLabel==null) return;
    selRef.current = { left: e.activeLabel, right: null, active:true };
    setSelState({ left:e.activeLabel, right:null });
  }
  function onMouseMove(e){
    if(!selRef.current.active || !e || e.activeLabel==null) return;
    selRef.current.right = e.activeLabel;
    setSelState({ left: selRef.current.left, right: selRef.current.right });
  }
  function onMouseUp(){
    const { left, right, active } = selRef.current;
    if(!active || right==null || left==null) { selRef.current={left:null,right:null,active:false}; setSelState({left:null,right:null}); return; }
    const next = clampDom([left, right]);
    setXDom(next);
    selRef.current={left:null,right:null,active:false};
    setSelState({left:null,right:null});
  }

  // колесико: zoom в точке курсора
  function onWheel(e){
    if(!data.length) return;
    e.preventDefault();
    const [a,b] = xDom;
    const center = a + (b-a) * 0.5;
    const factor = (e.deltaY>0) ? 1.15 : 0.85; // больше → масштабируем окно
    const newSpan = Math.max(2000, (b-a)*factor);
    const nx0 = Math.max(xMinAll, center - newSpan/2);
    const nx1 = Math.min(xMaxAll, center + newSpan/2);
    setXDom(clampDom([nx0,nx1]));
  }

  function resetZoom(){ setXDom([xMinAll, xMaxAll]); }
  function pan(dir){ // dir=-1 влево, +1 вправо
    const [a,b] = xDom; const span=b-a; const shift= span*0.2*dir;
    setXDom(clampDom([a+shift, b+shift]));
  }
  function zoomStep(f){ // f<1 — приблизить, >1 — отдалить
    const [a,b] = xDom; const c=a+(b-a)/2; const ns=(b-a)*f;
    setXDom(clampDom([c-ns/2, c+ns/2]));
  }

  /* ---------- экспорт ---------- */
  function exportCSV(){
    const rows = ['ts,time,flow_raw('+fmtFlowUnit()+'),flow_s('+fmtFlowUnit()+'),spo2(%)'].concat(
      data.map(d=>[
        d.ts,
        (timeUnit==='CLOCK'?fmtClock(d.ts):d.label),
        d.flow_raw?.toFixed(flowUnit==='MLPM'?0:3),
        d.flow_s?.toFixed(flowUnit==='MLPM'?0:3),
        Number.isFinite(d.spo2)?d.spo2.toFixed(1):''
      ].join(','))
    ).join('\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([rows],{type:'text/csv'}));
    a.download='o2log.csv'; a.click();
  }

  /* ---------- кастомный тултип ---------- */
  function TT({ active, payload, label }){
    if(!active || !payload?.length) return null;
    const p = Object.fromEntries(payload.map(x=>[x.dataKey, x.value]));
    return React.createElement('div', {className:'rounded bg-slate-900/90 border border-slate-700 px-3 py-2 text-xs'},
      React.createElement('div', {className:'mb-1 text-slate-300'},
        timeUnit==='CLOCK' ? label : (data.find(d=>d.ts===payload[0].payload.ts)?.label||'')),
      React.createElement('div', null, `Поток raw: ${fmtFlow(p.flow_raw)} ${fmtFlowUnit()}`),
      React.createElement('div', null, `Поток сгл.: ${fmtFlow(p.flow_s)} ${fmtFlowUnit()}`),
      Number.isFinite(p.spo2) ? React.createElement('div', null, `SpO₂: ${fmtSpo(p.spo2)} %`) : null
    );
  }

  /* ---------- UI ---------- */
  const Controls =
    React.createElement('div',{className:'card p-4 flex flex-col gap-3'},
      React.createElement('h2',{className:'text-lg font-bold'},'Логи O₂'),
      React.createElement('div',{className:'text-sm text-gray-300'},
        'Загрузи JSON (ts, flow[, spo2]) или используй демо. Выделение мышью — zoom, колесико — масштаб, кнопки — панорамирование.'),
      React.createElement('input',{type:'file',accept:'.json',onChange:onFile}),

      // единицы
      React.createElement('div', {className:'grid grid-cols-2 gap-2'},
        React.createElement('div', null,
          React.createElement('div', {className:'font-semibold mb-1'}, 'Поток'),
          React.createElement('select',{className:'bg-slate-800 border border-slate-600 rounded px-2 py-1',
              value:flowUnit, onChange:e=>setFlowUnit(e.target.value)},
            React.createElement('option',{value:'LPM'}, 'Л/мин'),
            React.createElement('option',{value:'MLPM'}, 'мЛ/мин')
          )
        ),
        React.createElement('div', null,
          React.createElement('div', {className:'font-semibold mb-1'}, 'Время'),
          React.createElement('select',{className:'bg-slate-800 border border-slate-600 rounded px-2 py-1',
              value:timeUnit, onChange:e=>setTimeUnit(e.target.value)},
            React.createElement('option',{value:'CLOCK'}, 'Часы:Мин:Сек'),
            React.createElement('option',{value:'ELAPSED'}, 'Прошло времени')
          )
        )
      ),

      // шкалы
      React.createElement('div', {className:'grid grid-cols-2 gap-2'},
        React.createElement('div', null,
          React.createElement('div',{className:'font-semibold mb-1'},'Шкала потока'),
          React.createElement('select',{className:'bg-slate-800 border border-slate-600 rounded px-2 py-1',
              value:flowScale,onChange:e=>setFlowScale(e.target.value)},
            React.createElement('option',{value:'FIXED'}, 'Фиксированная'),
            React.createElement('option',{value:'AUTO'},  'Авто по окну')
          )
        ),
        React.createElement('div', null,
          React.createElement('div',{className:'font-semibold mb-1'},'Шкала SpO₂'),
          React.createElement('select',{className:'bg-slate-800 border border-slate-600 rounded px-2 py-1',
              value:spoScale,onChange:e=>setSpoScale(e.target.value)},
            React.createElement('option',{value:'FIXED'}, '85–100 %'),
            React.createElement('option',{value:'AUTO'},  'Авто по окну')
          )
        ),
      ),

      // сглаживание
      React.createElement('div', null,
        React.createElement('div',{className:'font-semibold mb-1'},'Сглаживание'),
        React.createElement('div',{className:'flex gap-3 flex-wrap items-center'},
          React.createElement('label',{className:'flex items-center gap-2'},
            React.createElement('input',{type:'radio',name:'m',checked:mode==='ma',onChange:()=>setMode('ma')}),'скользящее'),
          React.createElement('label',{className:'flex items-center gap-2'},
            React.createElement('input',{type:'radio',name:'m',checked:mode==='ema',onChange:()=>setMode('ema')}),'EMA'),
          React.createElement('label',{className:'flex items-center gap-2'},
            React.createElement('input',{type:'radio',name:'m',checked:mode==='step',onChange:()=>setMode('step')}),'ступени')
        ),
        (mode==='ema'
          ? React.createElement('div',{className:'mt-1 text-sm'},`alpha: ${alpha.toFixed(2)}`,
              React.createElement('input',{type:'range',min:0.05,max:0.6,step:0.01,
                value:alpha,onChange:e=>setAlpha(+e.target.value),className:'w-full'}))
          : React.createElement('div',{className:'mt-1 text-sm'},`окно: ${win}s`,
              React.createElement('input',{type:'range',min:3,max:60,step:1,
                value:win,onChange:e=>setWin(+e.target.value),className:'w-full'}))
        )
      ),

      // навигация
      React.createElement('div',{className:'mt-1 flex gap-2 flex-wrap'},
        React.createElement('button',{className:'px-3 py-2 rounded bg-slate-700',onClick:()=>pan(-1)},'← пан'),
        React.createElement('button',{className:'px-3 py-2 rounded bg-slate-700',onClick:()=>pan(1)},'пан →'),
        React.createElement('button',{className:'px-3 py-2 rounded bg-slate-700',onClick:()=>zoomStep(0.8)},'приблизить'),
        React.createElement('button',{className:'px-3 py-2 rounded bg-slate-700',onClick:()=>zoomStep(1.25)},'отдалить'),
        React.createElement('button',{className:'px-3 py-2 rounded bg-sky-600',onClick:resetZoom},'reset'),
        React.createElement('button',{className:'px-3 py-2 rounded bg-emerald-700',onClick:exportCSV},'экспорт CSV')
      )
    );

  const Chart =
    React.createElement('div',{className:'card p-3', onWheel:onWheel},
      React.createElement('h3',{className:'font-semibold mb-2'},'Поток и SpO₂'),
      React.createElement('div',{className:'w-full h-[460px]'},
        React.createElement(ResponsiveContainer,{width:'100%',height:'100%'},
          React.createElement(LineChart,{
              data, margin:{top:10,right:18,left:4,bottom:8},
              onMouseDown, onMouseMove, onMouseUp
            },
            React.createElement(CartesianGrid,{strokeDasharray:'3 3',stroke:'#223042'}),
            React.createElement(XAxis,{
              type:'number', dataKey:'ts', domain:xDom, tickCount:8,
              tickFormatter:(v)=> timeUnit==='CLOCK'? fmtClock(v) : fmtElapsed(data[0]?.ts||xMinAll, v)
            }),
            React.createElement(YAxis,{ yAxisId:'left',  domain:yFlowDomain, width:50,
              tickFormatter:(v)=> v.toFixed(flowUnit==='MLPM'?0:2) }),
            React.createElement(YAxis,{ yAxisId:'right', domain:ySpoDomain,  orientation:'right', width:46 }),
            React.createElement(Tooltip,{ content:TT }),
            React.createElement(Legend,null),

            React.createElement(Line,{ yAxisId:'left',  type:'monotone', dataKey:'flow_raw', stroke:'#60a5fa', dot:false, name:`поток raw (${fmtFlowUnit()})` }),
            React.createElement(Line,{ yAxisId:'left',  type:'monotone', dataKey:'flow_s',   stroke:'#a78bfa', dot:false, name:`поток сгл. (${fmtFlowUnit()})` }),
            React.createElement(Line,{ yAxisId:'right', type:'monotone', dataKey:'spo2',     stroke:'#10b981', dot:false, name:'SpO₂ (%)' }),

            (selState.left!=null && selState.right!=null)
              ? React.createElement(ReferenceArea,{
                  x1:Math.min(selState.left, selState.right),
                  x2:Math.max(selState.left, selState.right),
                  y1:'auto', y2:'auto', strokeOpacity:0.15, fill:'#7dd3fc', fillOpacity:0.15
                })
              : null,

            // мини-Brush под осью (быстрый выбор окна)
            React.createElement(Brush,{
              dataKey:'label', height:24, travellerWidth:8,
              startIndex: 0, endIndex: data.length-1,
              onChange:(range)=>{
                if(!range) return;
                const { startIndex, endIndex } = range;
                const a = data[Math.max(0, startIndex|0)]?.ts ?? xMinAll;
                const b = data[Math.min(data.length-1, endIndex|0)]?.ts ?? xMaxAll;
                setXDom(clampDom([a,b]));
              }
            })
          )
        )
      )
    );

  return React.createElement('div', {className:'w-full grid gap-4 md:grid-cols-3'},
    Controls,
    React.createElement('div',{className:'md:col-span-2'}, Chart)
  );
}
