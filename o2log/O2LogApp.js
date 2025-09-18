// O2LogApp v2 — карта с зумом/паном, парк, трубы, дома с А-категорией,
// O₂ поле с парком/трубами/помещениями, графики: O₂ / RAW vs EMA / Спектр / «идеал»,
// логи по персонажам, статус канюль, подача л/мин.

export class O2LogApp {
  constructor(opts){
    this.canvas = opts.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.tooltip = opts.tooltip;
    this.kpis = opts.kpis;
    this.chartNodes = opts.charts;
    this.logsTbody = opts.logsTbody;

    this.thresholds = opts.thresholds ?? { critical: 18.8, warning: 19.2, upper: 21.4 };
    this.range = opts.range ?? '24h';
    this.graphMode = 'o2';
    this.live = true;
    this.overlays = opts.overlays ?? { pipes:true, park:true, trees:true, ac:true, cann:true };

    // сетка побольше
    this.gridW = 200;
    this.gridH = 140;
    this.padding = 6;

    // зум/пан
    this.scale = Math.max(window.devicePixelRatio||1, 1);
    this.zoom = 1;            // 1..6
    this.offsetX = 0;         // в пикселях канваса
    this.offsetY = 0;

    this.resizeCanvas();

    // геометрия сектора
    this.model = this.buildSectorModel();

    // выбранный дом
    this.selectedHouse = this.model.houses.find(h=>h.id==='H-201'); // Freydi
    this.seed = 7331;

    // графики
    this._charts = this.buildCharts();

    // серия и логи
    this.rebuildSeries();
    this.buildLogs();

    // интерактив
    this.bindPointer();
  }

  // ---------------------------- layout / retina ----------------------------
  resizeCanvas(){
    const ratio = Math.max(window.devicePixelRatio||1, 1);
    const cssW = Math.min(1100, this.canvas.clientWidth || 1100);
    const cssH = Math.round(cssW * 0.655); // аспект
    this.canvas.style.height = cssH + 'px';
    this.canvas.width  = cssW * ratio;
    this.canvas.height = cssH * ratio;

    this.baseScaleX = (this.canvas.width  - this.padding*2*ratio) / this.gridW;
    this.baseScaleY = (this.canvas.height - this.padding*2*ratio) / this.gridH;
    this.ratio = ratio;
  }

  // ---------------------------- sector model -------------------------------
  buildSectorModel(){
    // Центральный «Пункт обмена D-7»
    const hub = { x: 100, y: 70, r: 6 };

    // Парк — чёрный прямоугольник + деревья внутри
    const park = { poly: [[22,20],[62,20],[62,58],[22,58]], label:'Парк D-7' };

    // Дома. Только два «заселённых» явно (по требованию), остальные — «Дом №...».
    const houses = [];
    // Удобная утилита
    const rect = (x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
    let id = 190;
    // сетка блоков
    const blocks = [
      {x:78,y:30,w:28,h:20},{x:118,y:30,w:28,h:20},
      {x:78,y:58,w:28,h:22},{x:118,y:58,w:28,h:22},
      {x:78,y:84,w:28,h:22},{x:118,y:84,w:28,h:22},
    ];
    for(const b of blocks){
      const name = `Дом №${++id}`;
      houses.push({ id:`H-${id}`, name, poly: rect(b.x,b.y,b.w,b.h), base:19.0, aCat:false, cannula:true, double:false });
    }

    // Freydi + родители (А-категория) — H-201 (заменим первый блок)
    houses[0] = {
      id:'H-201',
      name:'Дом №201 · freydi_a_pediatric_a_class',
      poly: rect(78,30,28,20),
      base: 20.6, aCat:true, cannula:false, double:false,
      roster: [
        { key:'freydi', label:'Freydi (A-ped)', cannula:false },
        { key:'molot', label:'molot-trainee', cannula:false },
        { key:'mother_psych', label:'mother_psychologist', cannula:false },
      ]
    };

    // Father of twins (двойной вдох у детей) — H-207
    houses[3] = {
      id:'H-207',
      name:'Дом №207 · father_of_twins_b7',
      poly: rect(118,58,28,22),
      base: 19.0, aCat:false, cannula:true, double:true,
      roster: [
        { key:'father_twins', label:'father_of_twins_b7', cannula:true }
      ]
    };

    // Медблок и прочие сервисные точки — не «расселены» в жильё
    const medUnit = { id:'MED-7', x: 100, y: 40, r: 4, label:'med-unit-7' };
    const respTher = { id:'RESP-INA', x: 104, y: 38, r:3, label:'resp_therapist_ina' };

    // Радиальные трубы от хаба + магистраль к Дзета-9
    const pipes = [
      // к домам
      { path:[[100,70],[92,50],[92,40]], label:'к 201' },
      { path:[[100,70],[108,55],[132,55],[132,58]], label:'к 207' },
      { path:[[100,70],[100,90],[92,96]], label:'южная ветка' },
      { path:[[100,70],[120,80]], label:'юго-восточная' },
      // транзит к Дзета-9 (левый нижний край)
      { path:[[100,70],[80,80],[60,100],[30,120],[5,135]], label:'транзит в Дзета-9' },
    ];

    // Сервисные шахты (вертикали)
    const risers = [
      { x: 90, y1: 28, y2: 110 },
      { x: 110, y1: 28, y2: 110 },
      { x: 130, y1: 28, y2: 110 },
    ];

    // Деревья в парке
    const trees = [];
    for(let i=0;i<48;i++){
      trees.push({
        x: 22 + 5 + Math.random()*(62-22-10),
        y: 20 + 5 + Math.random()*(58-20-10),
        r: 0.9 + Math.random()*1.5
      });
    }

    return { hub, park, houses, pipes, risers, trees, medUnit, respTher };
  }

  // ---------------------------- RNG/Noise ----------------------------------
  rng(i){
    let t = (i + this.seed) >>> 0;
    t += 0x6D2B79F5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  valueNoise(x,y){
    const xi=Math.floor(x), yi=Math.floor(y);
    const xf=x-xi, yf=y-yi;
    const lerp=(a,b,t)=>a+(b-a)*t, fade=t=>t*t*(3-2*t);
    const idx=(X,Y)=>this.rng((X*73856093) ^ (Y*19349663));
    const v00=idx(xi,yi), v10=idx(xi+1,yi), v01=idx(xi,yi+1), v11=idx(xi+1,yi+1);
    const u=fade(xf), v=fade(yf);
    return lerp(lerp(v00,v10,u), lerp(v01,v11,u), v);
  }

  // ---------------------------- geometry utils -----------------------------
  pointInPoly(px,py, poly){
    let inside = false;
    for(let i=0, j=poly.length-1; i<poly.length; j=i++){
      const [xi,yi]=poly[i], [xj,yj]=poly[j];
      const inter = ((yi>py)!==(yj>py)) && (px < (xj-xi)*(py-yi)/(yj-yi)+xi);
      if(inter) inside = !inside;
    }
    return inside;
  }
  distToSegment(px,py, [ax,ay], [bx,by]){
    const vx=bx-ax, vy=by-ay;
    const wx=px-ax, wy=py-ay;
    const c1 = vx*wx + vy*wy;
    if (c1<=0) return Math.hypot(px-ax,py-ay);
    const c2 = vx*vx + vy*vy;
    if (c2<=c1) return Math.hypot(px-bx,py-by);
    const t = c1/c2;
    const projx = ax + t*vx, projy = ay + t*vy;
    return Math.hypot(px-projx, py-projy);
  }

  // ---------------------------- time helpers -------------------------------
  rangeToMs(r){ const H=3600e3, D=24*H; return r==='1h'?H : r==='7d'?7*D : D; }
  stepForRange(r){ const MIN=60e3; return r==='1h'?30*1000 : r==='7d'?30*MIN : 5*MIN; }

  // ---------------------------- O₂ model -----------------------------------
  // Базовые уровни: снаружи 18–19, в типовом жилье ~19, в А-категории 20–21.
  // Допэффекты: парк (+0.4 в парке, затухание вокруг), трубы (+0.25 вдоль),
  // дневная волна и шум. Внутри дома значение стремится к базовому target.
  ambientBase(t){ // внешняя среда
    const day = 24*3600e3;
    const phase = Math.sin((t % day)/day * Math.PI*2);
    return 18.6 + phase*0.08; // 18.52..18.68
  }
  tileFieldBumpFromPark(gx,gy){
    const p = this.model.park.poly;
    // центр парка
    const cx = (p[0][0]+p[1][0])/2, cy=(p[0][1]+p[2][1])/2;
    const d = Math.hypot(gx-cx, gy-cy);
    const inside = this.pointInPoly(gx,gy,p);
    // в парке +0.4, вокруг эксп. спад
    return (inside?0.42:0) + 0.5*Math.exp(-Math.max(d-16,0)/18);
  }
  tileFieldBumpFromPipes(gx,gy){
    let best = 1e9;
    for(const p of this.model.pipes){
      for(let i=1;i<p.path.length;i++){
        const d = this.distToSegment(gx,gy, p.path[i-1], p.path[i]);
        if(d<best) best = d;
      }
    }
    // вдоль магистрали +0.25 у трубы, спад до 0 на расстоянии ~10
    return Math.max(0, 0.25*(1 - best/10));
  }
  inHouse(gx,gy){ return this.model.houses.find(h=>this.pointInPoly(gx+0.5,gy+0.5,h.poly)); }

  o2AtTile(tMillis, gx, gy){
    const ambient = this.ambientBase(tMillis);
    const parkBump = this.tileFieldBumpFromPark(gx,gy);
    const pipeBump = this.tileFieldBumpFromPipes(gx,gy);
    const noise = (this.valueNoise(gx*0.12, gy*0.12)-0.5)*0.08;

    const h = this.inHouse(gx,gy);
    if(h){
      const target = h.aCat ? 20.6 : 19.0;
      // смешиваем внешний фон с целевым, чтобы внутри было ближе к target
      const mix = 0.75*target + 0.25*(ambient + parkBump + pipeBump);
      return mix + noise;
    }
    return ambient + parkBump + pipeBump + noise;
  }

  // ---------------------------- flow model (л/мин) -------------------------
  // Базовый расход 0.5 л/мин для A-категории, иногда пики; «двойной вдох»
  // реализован как сумма двух синусоид близких частот (f1,f2) + пилообразный клапан.
  flowSeriesForHouse(house, start, end, step){
    const arr=[];
    const f1 = 0.20/60; // 0.2 Гц ~ 12 в мин
    const f2 = house.double ? 0.28/60 : 0.20/60; // двойной вдох => второй пик
    for(let t=start; t<=end; t+=step){
      const tt = (t/1000);
      const base = house.aCat ? 0.5 : 0.2; // типовые дома меньше/реже берут из сети
      const sin1 = 0.25 * Math.max(0, Math.sin(2*Math.PI*f1*tt));
      const sin2 = 0.18 * Math.max(0, Math.sin(2*Math.PI*f2*tt + 0.7));
      const saw  = 0.05 * ((tt % 5)/5); // лёгкая «пила»
      const jitter = (this.rng(Math.floor(tt) ^ house.id.length)*0.02 - 0.01);
      arr.push({ t, value: Math.max(0, base + sin1 + sin2 + saw + jitter) });
    }
    return arr;
  }
  // EMA для ликбеза
  ema(series, alpha=0.15){
    const out=[];
    let prev = series[0]?.value ?? 0;
    for(const p of series){
      const v = alpha*p.value + (1-alpha)*prev;
      out.push({ t:p.t, value:v }); prev = v;
    }
    return out;
  }
  // ДФТ (достаточно для 1024–2048 точек)
  dft(series){
    const N = series.length;
    const out = [];
    // уберём тренд
    const mean = series.reduce((s,p)=>s+p.value,0)/N;
    const data = series.map(p=>p.value-mean);
    for(let k=0;k<N/2;k++){
      let re=0, im=0;
      const w = -2*Math.PI*k/N;
      for(let n=0;n<N;n++){ const ang=w*n; re+=data[n]*Math.cos(ang); im+=data[n]*Math.sin(ang); }
      const mag = Math.hypot(re,im);
      out.push({ k, mag });
    }
    return out;
  }

  // ---------------------------- series build -------------------------------
  seriesForHouseO2(house, start, end, step){
    const pts=[];
    // усредним по сетке внутри дома
    const [x0,y0]=house.poly[0], [x1,y1]=house.poly[2];
    const sx = Math.max(1, Math.floor((x1-x0)/8));
    const sy = Math.max(1, Math.floor((y1-y0)/8));
    for(let t=start; t<=end; t+=step){
      let sum=0, n=0;
      for(let gx=x0; gx<=x1; gx+=sx){
        for(let gy=y0; gy<=y1; gy+=sy){
          if(this.pointInPoly(gx+0.5,gy+0.5,house.poly)){
            sum += this.o2AtTile(t,gx,gy);
            n++;
          }
        }
      }
      const v = n? (sum/n) : (house.aCat?20.6:19.0);
      pts.push({ t, value: Number(v.toFixed(3)) });
    }
    return pts;
  }

  rebuildSeries(){
    const now = Date.now();
    const span = this.rangeToMs(this.range);
    const step = this.stepForRange(this.range);

    this.seriesO2   = this.seriesForHouseO2(this.selectedHouse, now-span, now, step);
    this.seriesFlow = this.flowSeriesForHouse(this.selectedHouse, now-span, now, step);
    this.seriesEma  = this.ema(this.seriesFlow, 0.15);
    // спектр на усечении до степени двойки
    const N = 1024;
    const cut = this.seriesFlow.slice(-N);
    this.spectrum = this.dft(cut);

    this.updateCharts();
    this.redraw();
  }

  // ---------------------------- charts -------------------------------------
  buildCharts(){
    const ChartAnnotation = window['chartjs-plugin-annotation'];
    Chart.register(ChartAnnotation);

    const main = new Chart(this.chartNodes.main.getContext('2d'), {
      type:'line',
      data:{ labels:[], datasets:[] },
      options:{
        responsive:true, maintainAspectRatio:false,
        interaction:{ mode:'index', intersect:false },
        scales:{
          y:{ grid:{color:'#182233'}, ticks:{color:'#9fb3d8'} },
          x:{ grid:{color:'#182233'}, ticks:{color:'#9fb3d8', autoSkip:true, maxRotation:0} }
        },
        plugins:{
          legend:{labels:{color:'#cbd5e1'}},
          tooltip:{callbacks:{label:(ctx)=> `${ctx.dataset.label}: ${ctx.raw.y !== undefined ? ctx.raw.y.toFixed?.(3) ?? ctx.raw.y : ctx.formattedValue}`}},
          annotation:{ annotations:{} }
        }
      }
    });

    const pie = new Chart(this.chartNodes.pie.getContext('2d'), {
      type:'doughnut',
      data:{ labels:['O₂','Дефицит/избыток'], datasets:[{ data:[50,50], backgroundColor:['#10b981','#223047'], borderWidth:0 }]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} } }
    });

    return { main, pie };
  }

  setGraphMode(mode){
    this.graphMode = mode;
    this.updateCharts();
  }

  updateCharts(){
    const { main, pie } = this._charts;
    const fmt = ts => new Date(ts).toLocaleString([], { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });

    if(this.graphMode==='o2'){
      this.chartNodes.title.textContent = 'O₂ внутри помещения';
      main.data.labels = this.seriesO2.map(p=>fmt(p.t));
      main.options.scales.y.min = 17; main.options.scales.y.max = 22.2;
      main.data.datasets = [{
        label:'O₂, %',
        data: this.seriesO2.map(p=>({x:fmt(p.t), y:p.value})),
        borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,.25)', tension:.25, fill:true, pointRadius:0
      }];
      main.options.plugins.annotation.annotations = {
        warn:{ type:'line', yMin:this.thresholds.warning, yMax:this.thresholds.warning, borderColor:'#f59e0b', borderDash:[4,4] },
        crit:{ type:'line', yMin:this.thresholds.critical, yMax:this.thresholds.critical, borderColor:'#ef4444', borderDash:[4,4] },
        top: { type:'line', yMin:this.thresholds.upper,    yMax:this.thresholds.upper,    borderColor:'#94a3b8', borderDash:[2,4] },
      };
    } else if(this.graphMode==='flow'){
      this.chartNodes.title.textContent = 'Расход O₂: RAW vs EMA';
      main.data.labels = this.seriesFlow.map(p=>fmt(p.t));
      main.options.scales.y.min = 0; main.options.scales.y.max = 1.6;
      main.data.datasets = [
        { label:'RAW, л/мин', data:this.seriesFlow.map(p=>({x:fmt(p.t), y:p.value})), borderColor:'#f59e0b', tension:.2, pointRadius:0 },
        { label:'EMA(α=0.15)', data:this.seriesEma.map(p=>({x:fmt(p.t), y:p.value})), borderColor:'#10b981', tension:.2, pointRadius:0 }
      ];
      main.options.plugins.annotation.annotations = {};
    } else if(this.graphMode==='spectrum'){
      this.chartNodes.title.textContent = 'Спектр расхода (ДФТ)';
      const N = this.spectrum.length;
      // частота в Гц, шаг времени
      const step = this.stepForRange(this.range)/1000; // сек
      const fs = 1/step;
      const labels = this.spectrum.map((p,i)=> (i*fs/N).toFixed(3)+' Гц');
      main.data.labels = labels;
      main.options.scales.y.min = 0; main.options.scales.y.max = undefined;
      main.data.datasets = [
        { label:'Мощность', data:this.spectrum.map(p=>({x:labels[p.k], y:p.mag})), borderColor:'#7de0ff', tension:0, pointRadius:0 }
      ];
      main.options.plugins.annotation.annotations = {};
    } else {
      this.chartNodes.title.textContent = 'Официальный «идеал» vs реальность (расход)';
      const ideal = this.seriesFlow.map(p=>({ t:p.t, value: this.selectedHouse.aCat?0.5:0.2 }));
      main.data.labels = this.seriesFlow.map(p=>fmt(p.t));
      main.options.scales.y.min = 0; main.options.scales.y.max = 1.6;
      main.data.datasets = [
        { label:'Официальный идеал', data:ideal.map(p=>({x:fmt(p.t), y:p.value})), borderColor:'#94a3b8', borderDash:[6,6], tension:0, pointRadius:0 },
        { label:'Реальность (RAW)', data:this.seriesFlow.map(p=>({x:fmt(p.t), y:p.value})), borderColor:'#ef4444', tension:.2, pointRadius:0 }
      ];
      main.options.plugins.annotation.annotations = {};
    }
    main.update('none');

    // пончик: положение текущего значения между порогами
    const v = this.seriesO2.at(-1)?.value ?? 0;
    const norm = Math.max(0, Math.min(1, (v - this.thresholds.critical) / (this.thresholds.upper - this.thresholds.critical)));
    pie.data.datasets[0].data = [Math.round(norm*100), 100-Math.round(norm*100)];
    pie.update('none');

    // KPI
    const vals = this.seriesO2.map(p=>p.value);
    const min = Math.min(...vals), max = Math.max(...vals), last = vals.at(-1);
    const below = vals.filter(x=>x<19.0).length;
    const flowNow = this.seriesFlow.at(-1)?.value ?? 0;
    this.kpis.last.textContent = last?.toFixed(3) ?? '—';
    this.kpis.min .textContent = isFinite(min)? min.toFixed(3):'—';
    this.kpis.max .textContent = isFinite(max)? max.toFixed(3):'—';
    this.kpis.brk .textContent = below;
    if(this.kpis.flow) this.kpis.flow.textContent = flowNow.toFixed(2);
  }

  // ---------------------------- logs ---------------------------------------
  buildLogs(){
    const H = this.selectedHouse;
    const name = H.name;
    const events = [];

    // Инциденты по порогам из серии O₂
    for(const p of this.seriesO2){
      if(p.value < this.thresholds.critical){
        events.push({ ts:p.t, house:name, who:'sensor', severity:'critical', message:'Падение O₂ ниже критического порога' });
      } else if(p.value < this.thresholds.warning){
        events.push({ ts:p.t, house:name, who:'sensor', severity:'warning', message:'Снижение O₂ ниже нормы' });
      }
    }

    // Сюжетные: канюли, сервис, «двойной вдох»
    const t0 = this.seriesO2[0]?.t ?? Date.now();
    if(H.id==='H-201'){ // Freydi
      events.push({ ts:t0+3600e3, house:name, who:'molot-trainee', severity:'info', message:'Провёл ночной замер расхода: пилообразные пики подтверждены' });
      events.push({ ts:t0+4*3600e3, house:name, who:'med-unit-7', severity:'info', message:'Назначена проверка увлажнителя. Канюли: не обновлены' });
      if(!H.cannula) events.push({ ts:t0+6*3600e3, house:name, who:'resp_therapist_ina', severity:'warning', message:'Рекомендована замена канюль (A-категория)' });
    }
    if(H.id==='H-207'){ // отец близнецов
      events.push({ ts:t0+2*3600e3, house:name, who:'father_of_twins_b7', severity:'info', message:'Заявка: «двойной вдох» у детей, расход выше ночами' });
      events.push({ ts:t0+5*3600e3, house:name, who:'stat-modeler_tom', severity:'info', message:'Подтверждён двойной пик на спектре (пост №72)' });
    }

    // Пинги датчика раз в 40 точек
    this.logs = events.concat(
      this.seriesO2.filter((_,i)=>i%40===0).map(p=>({ ts:p.t, house:name, who:'sensor', severity:'info', message:`O₂: ${p.value.toFixed(2)}%` }))
    ).sort((a,b)=>b.ts-a.ts);

    this.renderLogs();
  }
  renderLogs(){
    const tbody = this.logsTbody; tbody.innerHTML='';
    const fmt = ts => new Date(ts).toLocaleString([], { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    for(const l of this.logs){
      const tr = document.createElement('tr');
      const badge = `<span class="badge ${l.severity==='critical'?'b-crit':l.severity==='warning'?'b-warn':'b-info'}">${l.severity}</span>`;
      tr.innerHTML = `<td>${fmt(l.ts)}</td><td>${l.house}</td><td>${l.who}</td><td>${badge}</td><td>${l.message}</td>`;
      tbody.appendChild(tr);
    }
  }
  exportLogsCsv(){
    const rows = [['timestamp','house','who','severity','message']].concat(
      this.logs.map(l=>[new Date(l.ts).toISOString(), l.house, l.who, l.severity, l.message.replace(/"/g,'""')])
    );
    const csv = rows.map(r=>r.map(v=>/[,"]/.test(v)?`"${v}"`:v).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `o2-logs-${this.selectedHouse.id}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  }

  // ---------------------------- selection/range ----------------------------
  setRange(r){ this.range=r; this.rebuildSeries(); this.buildLogs(); this.updateCharts(); }
  setLive(v){ this.live=v; }
  setGraphMode(m){ this.graphMode=m; this.updateCharts(); }

  // ---------------------------- drawing ------------------------------------
  px(x){ return (this.padding*this.ratio + (x*this.baseScaleX)*this.zoom + this.offsetX); }
  py(y){ return (this.padding*this.ratio + (y*this.baseScaleY)*this.zoom + this.offsetY); }
  invGrid(clientX,clientY){
    // обратное преобразование курсора в координаты сетки
    const x = (clientX - this.padding*this.ratio - this.offsetX) / (this.baseScaleX*this.zoom);
    const y = (clientY - this.padding*this.ratio - this.offsetY) / (this.baseScaleY*this.zoom);
    return [x,y];
  }

  redraw(){
    const ctx=this.ctx;
    ctx.clearRect(0,0,this.canvas.width,this.canvas.height);

    // теплокарта
    const now = Date.now();
    const stepX = Math.max(1, Math.floor(1/this.zoom)); // чем больше зум, тем мельче сэмпл
    const stepY = Math.max(1, Math.floor(1/this.zoom));
    for(let gy=0; gy<this.gridH; gy+=stepY){
      for(let gx=0; gx<this.gridW; gx+=stepX){
        const v = this.o2AtTile(now, gx, gy);
        ctx.fillStyle = this.valueToColor(v);
        ctx.fillRect(this.px(gx), this.py(gy), this.baseScaleX*this.zoom*stepX, this.baseScaleY*this.zoom*stepY);
      }
    }

    // Парк (чёрный блок + деревья)
    if(this.overlays.park){
      const p = this.model.park.poly;
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.moveTo(this.px(p[0][0]), this.py(p[0][1]));
      for(let i=1;i<p.length;i++) ctx.lineTo(this.px(p[i][0]), this.py(p[i][1]));
      ctx.closePath(); ctx.fill();
      if(this.overlays.trees){
        ctx.fillStyle = '#0f2a17';
        for(const tr of this.model.trees){
          ctx.beginPath(); ctx.arc(this.px(tr.x), this.py(tr.y), tr.r*this.baseScaleX*this.zoom, 0, Math.PI*2); ctx.fill();
        }
      }
      ctx.fillStyle='#e5e7eb'; ctx.font=`${12*this.zoom}px system-ui`;
      ctx.fillText('Парк', this.px(p[0][0])+8*this.zoom, this.py(p[0][1])+14*this.zoom);
    }

    // Трубы
    if(this.overlays.pipes){
      ctx.lineWidth = Math.max(2, 3*this.zoom);
      ctx.strokeStyle = '#6ab7ff';
      ctx.setLineDash([]);
      for(const pip of this.model.pipes){
        ctx.beginPath();
        ctx.moveTo(this.px(pip.path[0][0]), this.py(pip.path[0][1]));
        for(let i=1;i<pip.path.length;i++){
          ctx.lineTo(this.px(pip.path[i][0]), this.py(pip.path[i][1]));
        }
        ctx.stroke();
      }
      // сервисные шахты
      ctx.strokeStyle='#4b5563'; ctx.lineWidth=Math.max(1,2*this.zoom); ctx.setLineDash([6,4]);
      for(const r of this.model.risers){
        ctx.beginPath(); ctx.moveTo(this.px(r.x), this.py(r.y1)); ctx.lineTo(this.px(r.x), this.py(r.y2)); ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Хаб
    const hub=this.model.hub;
    ctx.fillStyle='#0b213a'; ctx.strokeStyle='#7de0ff'; ctx.lineWidth=2*this.zoom;
    ctx.beginPath(); ctx.arc(this.px(hub.x), this.py(hub.y), hub.r*this.baseScaleX*this.zoom, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#cbd5e1'; ctx.font=`${12*this.zoom}px system-ui`; ctx.fillText('Пункт обмена D-7', this.px(hub.x)+10*this.zoom, this.py(hub.y)-6*this.zoom);

    // Дома
    for(const h of this.model.houses){
      ctx.beginPath();
      const p=h.poly;
      ctx.moveTo(this.px(p[0][0]), this.py(p[0][1]));
      for(let i=1;i<p.length;i++) ctx.lineTo(this.px(p[i][0]), this.py(p[i][1]));
      ctx.closePath();
      ctx.lineWidth = (h===this.selectedHouse)? 3*this.zoom : 1.6*this.zoom;
      ctx.strokeStyle = (h===this.selectedHouse)? '#e5e7eb' : '#6b7280';
      ctx.stroke();

      // бейджи
      if(this.overlays.ac && h.aCat){
        ctx.fillStyle='#10b981'; ctx.fillRect(this.px(p[0][0]), this.py(p[0][1])-14*this.zoom, 40*this.zoom, 12*this.zoom);
        ctx.fillStyle='#062b1f'; ctx.font=`${10*this.zoom}px system-ui`; ctx.fillText('A-cat', this.px(p[0][0])+6*this.zoom, this.py(p[0][1])-4*this.zoom);
      }
      if(this.overlays.cann){
        const cann = h.cannula ? '#3b82f6' : '#ef4444';
        ctx.fillStyle=cann; ctx.beginPath(); ctx.arc(this.px(p[0][0])+48*this.zoom, this.py(p[0][1])-8*this.zoom, 5*this.zoom, 0, Math.PI*2); ctx.fill();
      }

      // подпись
      ctx.fillStyle='#e5e7eb'; ctx.font=`${12*this.zoom}px system-ui`;
      ctx.fillText(h.name, this.px(p[0][0])+6*this.zoom, this.py(p[0][1])+14*this.zoom);
    }
  }

  valueToColor(v){
    if(v < this.thresholds.critical) return '#ef4444';
    if(v < this.thresholds.warning)  return '#f59e0b';
    if(v <= this.thresholds.upper)   return '#10b981';
    return '#3b82f6';
  }

  // ---------------------------- pointer / zoom/pan -------------------------
  bindPointer(){
    let dragging=false, lastX=0, lastY=0;

    this.canvas.addEventListener('wheel', e=>{
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      const oldZoom = this.zoom;
      this.zoom = Math.min(6, Math.max(1, this.zoom * (delta>0?0.9:1.1)));
      // зум к курсору
      const rect = this.canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left) * this.ratio;
      const cy = (e.clientY - rect.top)  * this.ratio;
      this.offsetX = cx - (cx - this.offsetX) * (this.zoom/oldZoom);
      this.offsetY = cy - (cy - this.offsetY) * (this.zoom/oldZoom);
      this.redraw();
    }, { passive:false });

    this.canvas.addEventListener('mousedown', e=>{
      dragging=true; lastX=e.clientX; lastY=e.clientY;
    });
    window.addEventListener('mouseup', ()=> dragging=false);
    window.addEventListener('mousemove', e=>{
      if(dragging){
        this.offsetX += (e.clientX-lastX)*this.ratio;
        this.offsetY += (e.clientY-lastY)*this.ratio;
        lastX=e.clientX; lastY=e.clientY;
        this.redraw();
      }
    });

    // hover tooltip + select
    this.canvas.addEventListener('mousemove', e=>{
      const rect = this.canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left) * this.ratio;
      const cy = (e.clientY - rect.top)  * this.ratio;
      const [gx,gy] = this.invGrid(cx,cy);
      const house = this.model.houses.find(h=>this.pointInPoly(gx,gy,h.poly));
      const v = this.o2AtTile(Date.now(), Math.floor(gx), Math.floor(gy));
      this.tooltip.style.display = 'block';
      this.tooltip.innerHTML = `
        <div><strong>${house?house.name:'Вне дома'}</strong></div>
        <div class="muted">(${Math.floor(gx)}, ${Math.floor(gy)})</div>
        <div>O₂: <b>${v.toFixed(3)}%</b></div>
      `;
      this.tooltip.style.left = (e.pageX + 14) + 'px';
      this.tooltip.style.top  = (e.pageY + 14) + 'px';
    });
    this.canvas.addEventListener('mouseleave', ()=>{ this.tooltip.style.display='none'; });

    this.canvas.addEventListener('click', e=>{
      const rect = this.canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left) * this.ratio;
      const cy = (e.clientY - rect.top)  * this.ratio;
      const [gx,gy] = this.invGrid(cx,cy);
      const house = this.model.houses.find(h=>this.pointInPoly(gx,gy,h.poly));
      if(house){
        this.selectedHouse = house;
        this.rebuildSeries();
        this.buildLogs();
      }
    });

    window.addEventListener('resize', ()=>{ this.resizeCanvas(); this.redraw(); });
  }

  // ---------------------------- live ticking --------------------------------
  start(){
    const tick = ()=>{
      if(this.live){
        // сдвигаем ряды вперёд
        const step = this.stepForRange(this.range);
        const nextT = (this.seriesO2.at(-1)?.t ?? Date.now()) + Math.max(step/6, 5000);
        const h = this.selectedHouse;
        const nextO2   = this.seriesForHouseO2(h, nextT, nextT, step)[0];
        const nextFlow = this.flowSeriesForHouse(h, nextT, nextT, step)[0];
        this.seriesO2.push(nextO2);   this.seriesO2.shift();
        this.seriesFlow.push(nextFlow); this.seriesFlow.shift();
        this.seriesEma = this.ema(this.seriesFlow, 0.15);
        // спектр пересчитывать не на каждом тике (дорого) — раз в N кадров можно, но тут ок
        this.redraw(); this.updateCharts();
      }
      this._raf = requestAnimationFrame(tick);
    };
    tick();
  }
}
