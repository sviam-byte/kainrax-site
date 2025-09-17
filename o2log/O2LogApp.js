// Сектор D-7: парк, ядро обмена, радиальные трубы, А-категория, «двойной вдох», канюли, спектр.
// Пиксельная теплокарта (канвас), сеть труб с потоками, чарт: O2/RAW vs EMA/подача/спектр.

export class O2LogApp {
  constructor(opts){
    this.canvas = opts.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.tooltip = opts.tooltip;
    this.kpis = opts.kpis;
    this.chartNode = opts.charts.main;
    this.chartTitleNode = opts.charts.titleNode;
    this.logsTbody = opts.logsTbody;
    this.explainNode = opts.explainNode;

    this.thresholds = opts.thresholds ?? { critical: 19.0, warning: 19.5, upper: 21.4 };
    this.range = opts.range ?? '24h';
    this.mode  = opts.mode  ?? 'o2';
    this.live = true;

    // сетка
    this.gridW = 160; this.gridH = 100;
    this.padding = 6;

    // ретина
    this.resizeCanvas();

    // ядро хаба
    this.core = { x: Math.floor(this.gridW*0.5), y: Math.floor(this.gridH*0.52), r: 10 };

    // парк (зеленая зона)
    this.parkPoly = [
      [12, 72], [40, 60], [52, 68], [58, 86], [30, 92], [16, 86]
    ];

    // Зета-9 (соседняя зона, декоративная подпись)
    this.zeta9 = { x: this.gridW-36, y: 10, w: 30, h: 20 };

    // дома
    this.houses = this.createHouses();

    // трубная сеть (узлы/ребра)
    this.network = this.createNetwork();

    // выбранный объект
    this.selectedHouse = this.houses[0];
    this.selectedPipe = null;

    // seed для шума
    this.seed = 7331;

    // график
    this.chart = this.buildChart();

    // события
    this.bindPointer();

    // начальные ряды
    this.rebuildSeries();
    this.buildLogs();
  }

  // ====== layout/retina ======
  resizeCanvas(){
    const ratio = Math.max(window.devicePixelRatio||1, 1);
    const cssW = Math.min(960, this.canvas.clientWidth || 960);
    const cssH = Math.round(cssW * 0.625);
    this.canvas.style.height = cssH + 'px';
    this.canvas.width = cssW * ratio;
    this.canvas.height = cssH * ratio;
    this.scaleX = (this.canvas.width - this.padding*2*ratio) / this.gridW;
    this.scaleY = (this.canvas.height - this.padding*2*ratio) / this.gridH;
  }
  px(x){ return this.padding*(window.devicePixelRatio||1) + x*this.scaleX; }
  py(y){ return this.padding*(window.devicePixelRatio||1) + y*this.scaleY; }

  // ====== rng/noise ======
  rng(i){
    let t = (i + this.seed) >>> 0;
    t += 0x6D2B79F5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  valueNoise(x,y){
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi,       yf = y - yi;
    const idx = (X, Y) => this.rng((X*73856093) ^ (Y*19349663));
    const lerp = (a,b,t)=>a+(b-a)*t;
    const fade = t => t*t*(3-2*t);
    const v00 = idx(xi,yi), v10 = idx(xi+1,yi), v01 = idx(xi,yi+1), v11 = idx(xi+1,yi+1);
    const u = fade(xf), v = fade(yf);
    return lerp(lerp(v00,v10,u), lerp(v01,v11,u), v);
  }
  flowField(x,y){
    return 0.6*this.valueNoise(x*0.08,y*0.08) + 0.3*this.valueNoise(x*0.02+10,y*0.02-7) + 0.1*this.valueNoise(x*0.16-3,y*0.16+5);
  }

  // ====== sector geometry ======
  createHouses(){
    // радиальный венец из 12 домов вокруг ядра; несколько — А-категория; часть — «двойной вдох»; канюли обновлены/нет
    const ringR = 24;
    const names = [
      { key:'freydi_a_pediatric_a_class', label:'Фрейди (A)', a:true, dbl:true, cannula:false },
      { key:'molot_trainee_father', label:'molot-trainee', a:false, dbl:false, cannula:true },
      { key:'father_of_twins_b7', label:'Отец Близнецов', a:false, dbl:true, cannula:false },
      { key:'mother_kai_a_ped', label:'Мать Кай (A)', a:true, dbl:false, cannula:true },
      { key:'resp_therapist_ina', label:'resp_therapist_ina', a:false, dbl:false, cannula:true },
      { key:'stat_modeler_tom', label:'stat-modeler_tom', a:false, dbl:false, cannula:true },
      { key:'assi_runner_99', label:'assi-the-runner_99', a:false, dbl:false, cannula:true },
      { key:'techie_linus', label:'techie-linus', a:false, dbl:false, cannula:true },
      { key:'marta_night_owl', label:'Марта · night-owl', a:false, dbl:false, cannula:true },
      { key:'deicide_mentor', label:'deicide-mentor', a:false, dbl:false, cannula:true },
      { key:'med_unit_7', label:'med-unit-7', a:false, dbl:false, cannula:true },
      { key:'random_b7', label:'Жилой B-7', a:false, dbl:true, cannula:false },
    ];
    const hs=[];
    for(let i=0;i<12;i++){
      const ang = (Math.PI*2)*(i/12) - Math.PI/2;
      const cx = this.core.x + Math.cos(ang)*ringR;
      const cy = this.core.y + Math.sin(ang)*ringR;
      const w=10, h=8;
      const poly = [[cx-w/2,cy-h/2],[cx+w/2,cy-h/2],[cx+w/2,cy+h/2],[cx-w/2,cy+h/2]];
      const tag = names[i];
      const base = 20.7 + (tag.a? 0.35:0) + (this.rng(i)*0.08-0.04);
      const id = `H-${101+i}`;
      hs.push({
        id, name:`${tag.label}`, poly, base,
        aClass: !!tag.a, doubleBreath: !!tag.dbl, cannulaUpdated: !!tag.cannula
      });
    }
    return hs;
  }

  createNetwork(){
    // узлы: ядро + 4 узла-разводки + по узлу у дома
    const nodes = [];
    const nId = (name,x,y)=>{ const n={id:name,x,y}; nodes.push(n); return n; };

    const core = nId('CORE', this.core.x, this.core.y);
    const N = nId('J-N', this.core.x, this.core.y-14);
    const S = nId('J-S', this.core.x, this.core.y+14);
    const W = nId('J-W', this.core.x-14, this.core.y);
    const E = nId('J-E', this.core.x+14, this.core.y);

    const edges = [];
    const addEdge = (from,to,cap,path=null)=>edges.push({from,to,cap,flow:0,path:path||[[from.x,from.y],[to.x,to.y]]});

    // магистрали от ядра
    addEdge(core,N, 120);
    addEdge(core,S, 120);
    addEdge(core,W, 120);
    addEdge(core,E, 120);

    // ветки к домам
    const juncs = [N,N,E,E,S,S,W,W,N,E,S,W]; // по четвертям кольца
    this.houses.forEach((h, i)=>{
      const j = juncs[i];
      // трёхточечный излом к дому
      const [x0,y0]=[j.x,j.y];
      const [x2,y2]=[ (h.poly[0][0]+h.poly[2][0])/2, (h.poly[0][1]+h.poly[2][1])/2 ];
      const mid = [ (x0+x2)/2, (y0+y2)/2 + (i%2? 4: -4) ];
      addEdge(j, {x:x2,y:y2}, 40, [[x0,y0], mid, [x2,y2]]);
    });

    return { nodes, edges };
  }

  // ====== time scale ======
  rangeToMs(r){ const H=3600e3, D=24*H; if(r==='1h')return H; if(r==='7d')return 7*D; return D; }
  stepForRange(r){
    if(r==='1h') return 10*1000;     // 10s
    if(r==='7d') return 5*60*1000;   // 5m
    return 60*1000;                  // 1m
  }

  // ====== O2 model ======
  // потребление (л/мин) в доме i
  demandLpm(tMillis, house){
    // базовые уровни
    let base = house.aClass ? 1.0 : 0.45; // А-кат: повышенная подача
    // ночной пик
    const local = new Date(tMillis);
    const hour = local.getHours();
    const nightBoost = (hour>=0 && hour<6) ? 0.25 : 0.05;

    // один «дыхательный» компонент (медленный псевдо-паттерн)
    const f1 = 1/30; // цикл 30 мин
    const f2 = 1/45; // цикл 45 мин
    const phi = (tMillis/60000);
    let wave = 0.18*Math.sin(2*Math.PI*f1*phi);

    // «двойной вдох» = второй частотный компонент
    if(house.doubleBreath){
      wave += 0.16*Math.sin(2*Math.PI*f2*phi + 1.3);
    }

    // шум и канюли (старые → больше утечек)
    const leak = house.cannulaUpdated ? 0.0 : 0.08;
    const jitter = (this.rng(Math.floor(tMillis/15000) ^ house.id.length) * 0.08) - 0.04;

    return Math.max(0, base + nightBoost + wave + leak + jitter);
  }

  // O2% в помещении по «смешению»: базовый % − влияние потока/вентполя
  o2Percent(tMillis, gx, gy, houseBase=20.7, house){
    const day = 24*3600e3;
    const phase = Math.sin((tMillis % day)/day * Math.PI*2) * 0.06;
    const flow = this.flowField(gx,gy) - 0.5;
    const demand = house ? this.demandLpm(tMillis, house) : 0.5;
    const demandDip = -0.12 * Math.tanh(demand/1.2); // чем больше подача, тем сильнее локальная просадка
    const jitter = (this.rng(Math.floor(tMillis/60000) ^ (gx*131 + gy*911)) * 0.06) - 0.03;
    return houseBase + phase + flow*0.15 + demandDip + jitter;
  }

  // серия для дома
  seriesForHouse(house, start, end, step){
    const pts = [];
    const [x0,y0]=house.poly[0], [x2,y2]=house.poly[2];
    const sx = Math.max(1, Math.floor((x2-x0)/8));
    const sy = Math.max(1, Math.floor((y2-y0)/8));
    for(let t=start; t<=end; t+=step){
      // O2%
      let sum=0, n=0;
      for(let gx=x0; gx<=x2; gx+=sx){
        for(let gy=y0; gy<=y2; gy+=sy){
          const v = this.o2Percent(t, gx, gy, house.base, house);
          sum += v; n++;
        }
      }
      const o2 = n? (sum/n):house.base;
      // подача
      const flow = this.demandLpm(t, house);
      pts.push({ t, o2:Number(o2.toFixed(3)), flow:Number(flow.toFixed(3)) });
    }
    return pts;
  }

  ema(arr, alpha=0.2){
    const out=[]; let s=arr[0] ?? 0;
    for(let i=0;i<arr.length;i++){ s = alpha*arr[i] + (1-alpha)*s; out.push(s); }
    return out;
  }

  // очень простой DFT (хватает для наших размеров)
  spectrumY(xs){
    const N = xs.length;
    const mean = xs.reduce((a,b)=>a+b,0)/N;
    const x = xs.map(v=>v-mean);
    const mags = [];
    for(let k=1;k<=Math.floor(N/2);k++){
      let re=0, im=0;
      for(let n=0;n<N;n++){
        const ang = -2*Math.PI*k*n/N;
        re += x[n]*Math.cos(ang);
        im += x[n]*Math.sin(ang);
      }
      mags.push(Math.sqrt(re*re+im*im)/N);
    }
    return mags;
  }

  // ====== charts ======
  buildChart(){
    const c = new Chart(this.chartNode.getContext('2d'), {
      type:'line',
      data:{ labels:[], datasets:[] },
      options:{
        responsive:true, maintainAspectRatio:false,
        scales:{
          y: { grid:{color:'#182233'}, ticks:{color:'#9fb3d8'} },
          x: { grid:{color:'#182233'}, ticks:{color:'#9fb3d8', maxRotation:0, autoSkip:true} },
          y2:{ position:'right', display:false, grid:{drawOnChartArea:false}, ticks:{color:'#9fb3d8'} }
        },
        plugins:{
          legend:{labels:{color:'#cbd5e1'}},
          tooltip:{callbacks:{label:(ctx)=>`${ctx.dataset.label}: ${ctx.formattedValue} ${ctx.dataset._unit||''}`}},
          annotation:{
            annotations:{
              warn:{type:'line', yMin:this.thresholds.warning, yMax:this.thresholds.warning, borderColor:'#f59e0b', borderDash:[4,4]},
              crit:{type:'line', yMin:this.thresholds.critical, yMax:this.thresholds.critical, borderColor:'#ef4444', borderDash:[4,4]},
              top:{type:'line', yMin:this.thresholds.upper, yMax:this.thresholds.upper, borderColor:'#94a3b8', borderDash:[2,4]},
            }
          }
        }
      }
    });
    return c;
  }

  updateCharts(){
    const s = this.series;
    const fmt = ts => new Date(ts).toLocaleString([], { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    this.chart.data.labels = s.map(p=>fmt(p.t));

    const valsO2 = s.map(p=>p.o2);
    const valsFlow = s.map(p=>p.flow);
    const valsEma = this.ema(valsFlow, 0.15);

    if(this.mode==='o2'){
      this.chartTitleNode.textContent = `${this.selectedHouse.name}: O₂%`;
      this.chart.options.scales.y.min = 17; this.chart.options.scales.y.max = 23;
      this.chart.options.plugins.annotation.annotations.warn.display = true;
      this.chart.options.plugins.annotation.annotations.crit.display = true;
      this.chart.options.plugins.annotation.annotations.top.display = true;
      this.chart.options.scales.y2.display = false;

      this.chart.data.datasets = [{
        label:'O₂', data: valsO2, borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,.25)', fill:true, pointRadius:0, tension:.25, _unit:'%'
      }];
    } else if(this.mode==='rawema'){
      this.chartTitleNode.textContent = `${this.selectedHouse.name}: RAW vs EMA (л/мин)`;
      this.chart.options.plugins.annotation.annotations.warn.display = false;
      this.chart.options.plugins.annotation.annotations.crit.display = false;
      this.chart.options.plugins.annotation.annotations.top.display = false;
      this.chart.options.scales.y.min = 0; this.chart.options.scales.y.max = 2.4;
      this.chart.options.scales.y2.display = false;

      this.chart.data.datasets = [
        { label:'RAW подача', data: valsFlow, borderColor:'#f97316', backgroundColor:'rgba(249,115,22,.15)', fill:true, pointRadius:0, tension:.15, _unit:'л/мин' },
        { label:'EMA(α=0.15)', data: valsEma, borderColor:'#10b981', pointRadius:0, tension:.2, _unit:'л/мин' }
      ];
    } else if(this.mode==='supply'){
      this.chartTitleNode.textContent = `${this.selectedHouse.name}: Подача л/мин`;
      this.chart.options.plugins.annotation.annotations.warn.display = false;
      this.chart.options.plugins.annotation.annotations.crit.display = false;
      this.chart.options.plugins.annotation.annotations.top.display = false;
      this.chart.options.scales.y.min = 0; this.chart.options.scales.y.max = 2.4;
      this.chart.options.scales.y2.display = false;

      this.chart.data.datasets = [
        { label:'Подача', data: valsFlow, borderColor:'#a78bfa', backgroundColor:'rgba(167,139,250,.18)', fill:true, pointRadius:0, tension:.25, _unit:'л/мин' }
      ];
    } else if(this.mode==='spectrum'){
      this.chartTitleNode.textContent = `${this.selectedHouse.name}: Спектр подач`;
      // пересчитем простой DFT; подпишем частоты в «циклах/час»
      const stepMin = Math.max(1, this.stepForRange(this.range)/60000);
      const mags = this.spectrumY(valsFlow);
      const freqsPerMin = mags.map((_,k)=> (k+1)/(stepMin*(mags.length*2))); // циклы/мин
      const labels = freqsPerMin.map(f=> (f*60).toFixed(2)); // циклы/час

      this.chart.data.labels = labels;
      this.chart.options.scales.y.min = 0; this.chart.options.scales.y.max = undefined;
      this.chart.options.scales.y2.display = false;
      this.chart.options.plugins.annotation.annotations.warn.display = false;
      this.chart.options.plugins.annotation.annotations.crit.display = false;
      this.chart.options.plugins.annotation.annotations.top.display = false;

      this.chart.config.type = 'bar';
      this.chart.data.datasets = [{ label:'Амплитуда', data:mags, backgroundColor:'#38bdf8', _unit:'' }];
      this.chart.update('none');
      // вернуть тип назад для других режимов
      this.chart.config.type = 'line';
      return;
    }

    this.chart.update('none');

    // KPI
    const min = Math.min(...valsO2), max = Math.max(...valsO2), last = valsO2.at(-1);
    const below = valsO2.filter(x=>x<19.5).length;
    this.kpis.last.textContent = last?.toFixed(3) ?? '—';
    this.kpis.min .textContent = isFinite(min)? min.toFixed(3):'—';
    this.kpis.max .textContent = isFinite(max)? max.toFixed(3):'—';
    this.kpis.brk .textContent = below;
    this.kpis.flow.textContent = (valsFlow.at(-1)||0).toFixed(2);
  }

  setMode(m){ this.mode=m; this.updateCharts(); }

  // ====== logs ======
  buildLogs(){
    const s = this.series;
    const inc=[];
    for(const p of s){
      if(p.o2 < this.thresholds.critical) inc.push({ ts:p.t, severity:'critical', message:'Падение O₂ ниже критического порога' });
      else if(p.o2 < this.thresholds.warning) inc.push({ ts:p.t, severity:'warning', message:'Снижение O₂ ниже нормы' });
    }
    // статусы
    if(!this.selectedHouse.cannulaUpdated){
      inc.unshift({ ts: Date.now(), severity:'warning', message:'Канюли НЕ обновлены' });
    } else {
      inc.unshift({ ts: Date.now(), severity:'info', message:'Канюли обновлены' });
    }
    // «идеальный» график для А-категории: лог с сарказмом
    if(this.selectedHouse.aClass){
      inc.unshift({ ts: Date.now(), severity:'info', message:'Пункт обмена: «идеальная кривая 0.5 л/мин подтверждена»' });
    }

    this.logs = inc.concat(
      s.filter((_,i)=>i%40===0).map(p=>({ ts:p.t, severity:'info', message:`Датчик O₂: ${p.o2.toFixed(2)}% · Подача ${p.flow.toFixed(2)} л/мин` }))
    ).sort((a,b)=>b.ts-a.ts);
    this.renderLogs();
  }
  renderLogs(){
    const tbody = this.logsTbody;
    tbody.innerHTML = '';
    const fmt = ts => new Date(ts).toLocaleString([], { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    for(const l of this.logs){
      const tr = document.createElement('tr');
      const badge = `<span class="badge ${l.severity==='critical'?'b-crit':l.severity==='warning'?'b-warn':'b-info'}">${l.severity}</span>`;
      tr.innerHTML = `<td>${fmt(l.ts)}</td><td>${this.selectedHouse.name}</td><td>${badge}</td><td>${l.message}</td>`;
      tbody.appendChild(tr);
    }
  }
  exportLogsCsv(){
    const rows = [['timestamp','house','severity','message']].concat(
      this.logs.map(l=>[new Date(l.ts).toISOString(), this.selectedHouse.name, l.severity, l.message.replace(/"/g,'""')])
    );
    const csv = rows.map(r=>r.map(v=>/[,"]/.test(v)?`"${v}"`:v).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `o2-logs-${this.selectedHouse.id}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
  }

  // ====== series rebuild ======
  setRange(r){ this.range=r; this.rebuildSeries(); this.buildLogs(); this.updateCharts(); }
  setLive(v){ this.live=v; }

  rebuildSeries(){
    const now = Date.now();
    const span = this.rangeToMs(this.range);
    const step = this.stepForRange(this.range);
    this.series = this.seriesForHouse(this.selectedHouse, now - span, now, step);
    this.updateNetworkFlows(now); // рассчитать потоки по трубам
    this.updateCharts();
    this.redraw();
  }

  // ====== network flows ======
  updateNetworkFlows(t){
    // Поток по каждому дому прямо равен текущему demandLpm(t, house)
    const flowsPerEdge = new Map();
    for(let i=0;i<this.network.edges.length;i++) flowsPerEdge.set(i,0);

    // Каждая ветка — отдельное ребро от junc к дому, поэтому просто записываем.
    this.houses.forEach((h, idx)=>{
      const edgeIndex = 4 + idx; // первые 4 — магистрали CORE->J, далее — к домам
      const q = this.demandLpm(t, h);
      flowsPerEdge.set(edgeIndex, q);
    });

    // Суммируем по направлениям на магистралях
    const sumDir = { 'J-N':0, 'J-S':0, 'J-W':0, 'J-E':0 };
    const juncs = ['J-N','J-N','J-E','J-E','J-S','J-S','J-W','J-W','J-N','J-E','J-S','J-W'];
    this.houses.forEach((_,i)=>{ sumDir[juncs[i]] += flowsPerEdge.get(4+i); });

    // CORE -> J edges: 0..3
    const mapEdge0 = {0:'J-N',1:'J-S',2:'J-W',3:'J-E'};
    for(let e=0;e<4;e++){
      const label = mapEdge0[e];
      flowsPerEdge.set(e, sumDir[label]);
    }

    // записать в сеть
    this.network.edges.forEach((e, idx)=> e.flow = flowsPerEdge.get(idx) || 0);
    this.totalSupply = [...flowsPerEdge.values()].reduce((a,b)=>a+b,0);
  }

  // ====== drawing ======
  redraw(){
    const ctx = this.ctx;
    ctx.clearRect(0,0,this.canvas.width,this.canvas.height);

    const now = Date.now();

    // 1) фон-мозаика по текущему %O2
    for(let gy=0; gy<this.gridH; gy++){
      for(let gx=0; gx<this.gridW; gx++){
        // к какому дому относится?
        const house = this.houses.find(h => this.pointInPoly(gx+0.5, gy+0.5, h.poly));
        const base = house? house.base : 20.6 + (this.flowField(gx,gy)-0.5)*0.15;
        const v = this.o2Percent(now, gx, gy, base, house);
        this.ctx.fillStyle = this.valueToColor(v);
        this.ctx.fillRect(this.px(gx), this.py(gy), this.scaleX-0.6, this.scaleY-0.6);
      }
    }

    // 2) парк — мягкий зелёный градиент
    this.drawPark();

    // 3) Зета-9 рамка
    this.drawZeta9();

    // 4) трубы
    this.drawPipes();

    // 5) ядро
    this.drawCore();

    // 6) дома/подписи/значки
    this.drawHouses();
  }

  drawPark(){
    const ctx=this.ctx;
    const poly=this.parkPoly;
    const g=ctx.createLinearGradient(this.px(poly[0][0]),this.py(poly[0][1]),this.px(poly[3][0]),this.py(poly[3][1]));
    g.addColorStop(0,'rgba(16,185,129,.28)');
    g.addColorStop(1,'rgba(34,197,94,.12)');
    ctx.fillStyle=g; ctx.strokeStyle='rgba(16,185,129,.45)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(this.px(poly[0][0]),this.py(poly[0][1]));
    for(let i=1;i<poly.length;i++) ctx.lineTo(this.px(poly[i][0]),this.py(poly[i][1]));
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#9dd6b8'; ctx.font='12px system-ui';
    ctx.fillText('Парковая зона «Зелёный ковчег»', this.px(poly[0][0])+6, this.py(poly[0][1])+14);
  }

  drawZeta9(){
    const {x,y,w,h}=this.zeta9;
    const ctx=this.ctx;
    ctx.fillStyle='rgba(59,130,246,.10)';
    ctx.strokeStyle='#3b82f6'; ctx.lineWidth=1.5;
    ctx.fillRect(this.px(x),this.py(y), w*this.scaleX, h*this.scaleY);
    ctx.strokeRect(this.px(x),this.py(y), w*this.scaleX, h*this.scaleY);
    ctx.fillStyle='#9fb3d8'; ctx.font='12px system-ui';
    ctx.fillText('Дзета-9 · законсервированный пояс', this.px(x)+6, this.py(y)+14);
  }

  drawCore(){
    const ctx=this.ctx;
    ctx.beginPath(); ctx.arc(this.px(this.core.x), this.py(this.core.y), 10*(window.devicePixelRatio||1), 0, Math.PI*2);
    ctx.fillStyle='#0b1320'; ctx.fill();
    ctx.strokeStyle='#7de0ff'; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle='#a9b7d6'; ctx.font='12px system-ui';
    ctx.fillText(`Ядро обмена · Σподача: ${this.totalSupply?.toFixed(2)||'—'} л/мин`, this.px(this.core.x)+14, this.py(this.core.y)+4);
  }

  drawHouses(){
    const ctx=this.ctx;
    for(const h of this.houses){
      ctx.beginPath();
      const [x0,y0]=h.poly[0];
      ctx.moveTo(this.px(x0),this.py(y0));
      for(let i=1;i<h.poly.length;i++){
        const [x,y]=h.poly[i]; ctx.lineTo(this.px(x),this.py(y));
      }
      ctx.closePath();
      ctx.lineWidth = (h===this.selectedHouse)? 3: 1.5;
      ctx.strokeStyle = (h.aClass? '#60a5fa' : (h===this.selectedHouse? '#e5e7eb':'#6b7280'));
      ctx.stroke();

      // значок канюль
      ctx.fillStyle = h.cannulaUpdated? '#22c55e' : '#f59e0b';
      ctx.fillRect(this.px(h.poly[0][0])+2, this.py(h.poly[0][1])+2, 6,6);

      // подпись
      ctx.fillStyle = '#e5e7eb'; ctx.font='12px system-ui';
      const cx=(h.poly[0][0]+h.poly[2][0])/2, cy=h.poly[0][1]-0.6;
      ctx.fillText(h.name, this.px(cx)-20, this.py(cy));
    }
  }

  drawPipes(){
    const ctx=this.ctx;
    for(const [idx,e] of this.network.edges.entries()){
      const cap = e.cap, q = e.flow||0;
      const ratio = Math.min(1, q / cap);
      const w = 2 + 4*ratio;
      const col = q>cap? '#ef4444' : (ratio>0.7? '#7dd3fc' : '#93c5fd');
      ctx.lineWidth = w*(window.devicePixelRatio||1);
      ctx.strokeStyle = col;
      ctx.beginPath();
      const pts = e.path;
      ctx.moveTo(this.px(pts[0][0]),this.py(pts[0][1]));
      for(let i=1;i<pts.length;i++) ctx.lineTo(this.px(pts[i][0]),this.py(pts[i][1]));
      ctx.stroke();

      // маленькие стрелки-маркеры потока
      const a = pts[0], b = pts[pts.length-1];
      const dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy), ux=dx/L, uy=dy/L;
      const mx=(a[0]+b[0])/2, my=(a[1]+b[1])/2;
      ctx.beginPath();
      ctx.moveTo(this.px(mx), this.py(my));
      ctx.lineTo(this.px(mx-ux*1.2 - uy*0.6), this.py(my-uy*1.2 + ux*0.6));
      ctx.lineTo(this.px(mx-ux*1.2 + uy*0.6), this.py(my-uy*1.2 - ux*0.6));
      ctx.closePath();
      ctx.fillStyle=col; ctx.fill();

      // подпись расхода
      if(q>0.02){
        ctx.fillStyle='#9fb3d8'; ctx.font='11px system-ui';
        ctx.fillText(`${q.toFixed(2)} / ${cap} л/мин`, this.px(mx)+4, this.py(my)+12);
      }
    }
  }

  // ====== hit tests ======
  pointInPoly(px,py, poly){
    let inside=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const xi=poly[i][0], yi=poly[i][1], xj=poly[j][0], yj=poly[j][1];
      const intersect=((yi>py)!==(yj>py)) && (px < (xj-xi)*(py-yi)/(yj-yi)+xi);
      if(intersect) inside=!inside;
    }
    return inside;
  }
  distPointToSeg(px,py, ax,ay,bx,by){
    const dx=bx-ax, dy=by-ay;
    const t = Math.max(0, Math.min(1, ((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy)));
    const cx=ax+t*dx, cy=ay+t*dy;
    return Math.hypot(px-cx, py-cy);
  }

  // ====== pointer ======
  bindPointer(){
    this.canvas.addEventListener('mousemove', e=>{
      const r = this.canvas.getBoundingClientRect();
      const cx = (e.clientX - r.left) * (window.devicePixelRatio||1);
      const cy = (e.clientY - r.top)  * (window.devicePixelRatio||1);
      const gx = Math.max(0, Math.min(this.gridW-1, Math.floor((cx - this.padding*(window.devicePixelRatio||1)) / this.scaleX)));
      const gy = Math.max(0, Math.min(this.gridH-1, Math.floor((cy - this.padding*(window.devicePixelRatio||1)) / this.scaleY)));

      // nearest pipe?
      let nearest=null, best=1e9;
      this.network.edges.forEach((e, idx)=>{
        for(let i=0;i<e.path.length-1;i++){
          const a=e.path[i], b=e.path[i+1];
          const d=this.distPointToSeg(gx,gy,a[0],a[1],b[0],b[1]);
          if(d<best){ best=d; nearest={edge:e, index:idx}; }
        }
      });

      const house = this.houses.find(h => this.pointInPoly(gx+0.5, gy+0.5, h.poly));
      const showPipe = nearest && best < 1.2;

      if(showPipe){
        const e1 = nearest.edge;
        this.selectedPipe = e1; // для клика
        this.tooltip.style.display='block';
        this.tooltip.innerHTML = `
          <div><strong>Трубопровод</strong></div>
          <div class="muted">cap ${e1.cap} л/мин</div>
          <div>Поток: <b>${(e1.flow||0).toFixed(2)} л/мин</b></div>
        `;
        this.tooltip.style.left = (e.pageX + 14) + 'px';
        this.tooltip.style.top  = (e.pageY + 14) + 'px';
        return;
      } else {
        this.selectedPipe = null;
      }

      // tile tooltip
      const base = house? house.base : 20.6;
      const v = this.o2Percent(Date.now(), gx, gy, base, house);
      this.tooltip.style.display = 'block';
      this.tooltip.innerHTML = `
        <div><strong>${house?house.name:'Вне дома'}</strong></div>
        ${house? `<div class="muted">${house.aClass?'A-категория · ':''}${house.cannulaUpdated?'канюли обновлены':'канюли НЕ обновлены'}</div>`:''}
        <div class="muted">(${gx}, ${gy})</div>
        <div>O₂: <b>${v.toFixed(3)}%</b></div>
        ${house? `<div>Подача: <b>${this.demandLpm(Date.now(),house).toFixed(2)} л/мин</b>${house.doubleBreath?' · «двойной вдох»':''}</div>`:''}
      `;
      this.tooltip.style.left = (e.pageX + 14) + 'px';
      this.tooltip.style.top  = (e.pageY + 14) + 'px';
    });

    this.canvas.addEventListener('mouseleave', ()=>{ this.tooltip.style.display='none'; });

    this.canvas.addEventListener('click', e=>{
      if(this.selectedPipe){ return; } // клики по трубам пока не переключают
      const r = this.canvas.getBoundingClientRect();
      const cx = (e.clientX - r.left) * (window.devicePixelRatio||1);
      const cy = (e.clientY - r.top)  * (window.devicePixelRatio||1);
      const gx = Math.max(0, Math.min(this.gridW-1, Math.floor((cx - this.padding*(window.devicePixelRatio||1)) / this.scaleX)));
      const gy = Math.max(0, Math.min(this.gridH-1, Math.floor((cy - this.padding*(window.devicePixelRatio||1)) / this.scaleY)));

      const house = this.houses.find(h => this.pointInPoly(gx+0.5, gy+0.5, h.poly));
      if(house){
        this.selectedHouse = house;
        this.rebuildSeries();
        this.buildLogs();
      }
    });

    window.addEventListener('resize', ()=>{ this.resizeCanvas(); this.redraw(); });
  }

  valueToColor(v){
    if(v < this.thresholds.critical) return '#ef4444';
    if(v < this.thresholds.warning)  return '#f59e0b';
    if(v <= this.thresholds.upper)   return '#10b981';
    return '#3b82f6';
  }

  // ====== live tick ======
  start(){
    const tick = ()=>{
      if(this.live){
        const lastT = this.series.at(-1)?.t ?? Date.now();
        const step = this.stepForRange(this.range);
        const nextT = lastT + Math.max(step/6, 5000);
        const s2 = this.series.slice(1);
        const pt = this.seriesForHouse(this.selectedHouse, nextT, nextT, step)[0];
        s2.push(pt);
        this.series = s2;
        this.updateNetworkFlows(nextT);
        this.updateCharts();
        this.redraw();
      }
      this._raf = requestAnimationFrame(tick);
    };
    tick();
  }
}
