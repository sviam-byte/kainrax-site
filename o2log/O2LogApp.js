// Сектор D-7: чёрный парк, радиальные трубы, А-категория, «двойной вдох», канюли, спектр.
// Пиксельная теплокарта (пан/зум), сеть труб с потоками, общий/локальный журналы.

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

    this.thresholds = opts.thresholds ?? { critical: 17.0, warning: 18.5, upper: 20.3 };
    this.range = opts.range ?? '24h';
    this.mode  = opts.mode  ?? 'o2';
    this.filter= opts.filter ?? 'all';
    this.logScope = opts.logScope ?? 'selected';
    this.live = true;

    // сетка мира
    this.gridW = 180; this.gridH = 110;
    this.padding = 6;

    // видовая трансформация
    this.zoom = 1;
    this.panX = 0; // в device px
    this.panY = 0;

    // ретина
    this.resizeCanvas();

    // ядро
    this.core = { x: Math.floor(this.gridW*0.5), y: Math.floor(this.gridH*0.52), r: 10 };

    // парк (чёрный)
    this.parkPoly = [ [10,78],[44,60],[60,70],[63,96],[28,100],[12,92] ];

    // Дзета-9
    this.zeta9 = { x: this.gridW-38, y: 8, w: 32, h: 22 };

    // дома: 16 блоков, Фрейди-молот-мама вместе
    this.houses = this.createHouses();

    // трубная сеть
    this.network = this.createNetwork();

    // выбранный
    this.selectedHouse = this.houses.find(h=>h.key==='freydi_block');
    this.selectedPipe = null;

    // rng
    this.seed = 9001;

    // график
    this.chart = this.buildChart();

    // ввод
    this.bindPointer();

    // данные
    this.rebuildSeries();
    this.rebuildGlobalLogs();
  }

  // ====== layout/retina ======
  resizeCanvas(){
    const ratio = Math.max(window.devicePixelRatio||1, 1);
    const cssW = Math.min(960, this.canvas.clientWidth || 960);
    const cssH = Math.round(cssW * 0.625);
    this.canvas.style.height = cssH + 'px';
    this.canvas.width = cssW * ratio;
    this.canvas.height = cssH * ratio;

    this.baseScaleX = (this.canvas.width - this.padding*2*ratio) / this.gridW;
    this.baseScaleY = (this.canvas.height - this.padding*2*ratio) / this.gridH;
    this.scaleX = this.baseScaleX * this.zoom;
    this.scaleY = this.baseScaleY * this.zoom;
    this.dpr = ratio;
  }
  updateScale(){ this.scaleX = this.baseScaleX * this.zoom; this.scaleY = this.baseScaleY * this.zoom; }
  px(x){ return this.padding*this.dpr + this.panX + x*this.scaleX; }
  py(y){ return this.padding*this.dpr + this.panY + y*this.scaleY; }
  screenToGrid(cx,cy){
    const gx = (cx*this.dpr - this.padding*this.dpr - this.panX) / this.scaleX;
    const gy = (cy*this.dpr - this.padding*this.dpr - this.panY) / this.scaleY;
    return [gx, gy];
  }

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
    const ringR = 30;
    const ring2 = 48;
    // список жителей (больше персонажей, в т.ч. нумеров)
    const blocks = [
      { key:'freydi_block', label:'Блок F-ка (семья)', occupants:[
        {name:'Фрейди', handle:'freydi_a_pediatric_a_class', a:true, dbl:true},
        {name:'molot-trainee', handle:'molot_trainee_father', a:false},
        {name:'мама Фрейди', handle:'freydi_mother', a:false},
      ], cannula:false },
      { key:'father_of_twins_b7', label:'Отец Близнецов', occupants:[{name:'father_of_twins_b7'}], cannula:false, dbl:true },
      { key:'mother_kai_a_ped', label:'Мать Кай (A)', occupants:[{name:'mother_kai_a_ped', a:true}], cannula:true },
      { key:'resp_ina', label:'resp_therapist_ina', occupants:[{name:'resp_therapist_ina'}], cannula:true },
      { key:'stat_tom', label:'stat-modeler_tom', occupants:[{name:'stat_modeler_tom'}], cannula:true },
      { key:'runner', label:'assi-the-runner_99', occupants:[{name:'assi_the_runner_99'}], cannula:true },
      { key:'linus', label:'techie-linus', occupants:[{name:'techie_linus'}], cannula:true },
      { key:'marta', label:'Марта · night-owl', occupants:[{name:'night_owl_shift'}], cannula:true },
      { key:'deicide', label:'deicide-mentor', occupants:[{name:'deicide_mentor'}], cannula:true },
      { key:'med7', label:'med-unit-7', occupants:[{name:'med_unit_7'}], cannula:true },
      { key:'numer_1', label:'Нумер I-17', occupants:[{name:'numer_i17'}], cannula:false },
      { key:'numer_2', label:'Нумер XII-44', occupants:[{name:'numer_xii44'}], cannula:false, dbl:true },
      { key:'random_b7', label:'Жилой B-7', occupants:[{name:'b7_resident'}], cannula:false },
      { key:'craft_guild', label:'Сборщики клапанов', occupants:[{name:'valve_guild'}], cannula:true },
      { key:'old_welder', label:'Старый сварщик', occupants:[{name:'old_welder'}], cannula:false },
      { key:'quiet_block', label:'Тихий блок', occupants:[{name:'quiet_blockers'}], cannula:true },
    ];

    const hs=[];
    // первый пояс 8 домов
    for(let i=0;i<8;i++){
      const t = blocks[i];
      const ang = (Math.PI*2)*(i/8) - Math.PI/2;
      const cx = this.core.x + Math.cos(ang)*ringR;
      const cy = this.core.y + Math.sin(ang)*ringR;
      const w=10, h=8;
      const poly = [[cx-w/2,cy-h/2],[cx+w/2,cy-h/2],[cx+w/2,cy+h/2],[cx-w/2,cy+h/2]];
      const base = (t.occupants.some(o=>o.a)? 20.0 : 18.6) + (this.rng(i)*0.12-0.06);
      hs.push({ id:`H-${101+i}`, key:t.key, name:t.label, poly, base,
                aClass: t.occupants.some(o=>o.a), doubleBreath: !!t.dbl,
                cannulaUpdated: !!t.cannula, occupants:t.occupants });
    }
    // второй пояс ещё 8
    for(let j=0;j<8;j++){
      const t = blocks[8+j];
      const ang = (Math.PI*2)*(j/8) - Math.PI/2 + Math.PI/8;
      const cx = this.core.x + Math.cos(ang)*ring2;
      const cy = this.core.y + Math.sin(ang)*ring2;
      const w=10, h=8;
      const poly = [[cx-w/2,cy-h/2],[cx+w/2,cy-h/2],[cx+w/2,cy+h/2],[cx-w/2,cy+h/2]];
      const base = (t.occupants.some(o=>o.a)? 20.0 : 18.4) + (this.rng(j+99)*0.12-0.06);
      hs.push({ id:`H-${201+j}`, key:t.key, name:t.label, poly, base,
                aClass: t.occupants.some(o=>o.a), doubleBreath: !!t.dbl,
                cannulaUpdated: !!t.cannula, occupants:t.occupants });
    }
    return hs;
  }

  createNetwork(){
    const nodes = [];
    const nId = (name,x,y)=>{ const n={id:name,x,y}; nodes.push(n); return n; };

    const core = nId('CORE', this.core.x, this.core.y);
    const N = nId('J-N', this.core.x, this.core.y-16);
    const S = nId('J-S', this.core.x, this.core.y+16);
    const W = nId('J-W', this.core.x-16, this.core.y);
    const E = nId('J-E', this.core.x+16, this.core.y);

    const edges = [];
    const addEdge = (from,to,cap,path=null)=>edges.push({from,to,cap,flow:0,path:path||[[from.x,from.y],[to.x,to.y]]});

    // магистрали
    addEdge(core,N, 160);
    addEdge(core,S, 160);
    addEdge(core,W, 160);
    addEdge(core,E, 160);

    // ветви: каждому дому от ближайшего узла, с красивыми изломами
    const juncs = [N,E,S,W,N,E,S,W,  N,E,S,W,N,E,S,W];
    this.houses.forEach((h, i)=>{
      const j = juncs[i];
      const [cx,cy] = [ (h.poly[0][0]+h.poly[2][0])/2, (h.poly[0][1]+h.poly[2][1])/2 ];
      const bend = [ (j.x+cx)/2 + (i%2? 6:-6), (j.y+cy)/2 + (i%3? -4:4) ];
      addEdge(j, {x:cx,y:cy}, 60, [[j.x,j.y], bend, [cx,cy]]);
    });

    return { nodes, edges };
  }

  // ====== time scale ======
  rangeToMs(r){ const H=3600e3, D=24*H; if(r==='1h')return H; if(r==='7d')return 7*D; return D; }
  stepForRange(r){ if(r==='1h') return 10*1000; if(r==='7d') return 5*60*1000; return 60*1000; }

  // ====== model ======
  demandLpm(tMillis, house){
    let base = house.aClass ? 1.0 : 0.40; // A-кат ↑
    const hour = new Date(tMillis).getHours();
    const nightBoost = (hour>=0 && hour<6) ? 0.22 : 0.04;

    const f1 = 1/30, f2 = 1/45;
    const phi = (tMillis/60000);
    let wave = 0.16*Math.sin(2*Math.PI*f1*phi);
    if(house.doubleBreath) wave += 0.15*Math.sin(2*Math.PI*f2*phi + 1.2);

    const leak = house.cannulaUpdated ? 0.0 : 0.08;
    const jitter = (this.rng(Math.floor(tMillis/15000) ^ house.id.length) * 0.08) - 0.04;

    return Math.max(0, base + nightBoost + wave + leak + jitter);
  }

  o2Percent(tMillis, gx, gy, houseBase=18.6, house){
    const day = 24*3600e3;
    const phase = Math.sin((tMillis % day)/day * Math.PI*2) * 0.05;
    const flow = this.flowField(gx,gy) - 0.5;

    const demand = house ? this.demandLpm(tMillis, house) : 0.4;
    const demandDip = -0.10 * Math.tanh(demand/1.1);

    // фон вне домов: около 18.3, в Дзета-9 ещё ниже
    let env = houseBase;
    if(!house){
      env = 18.1 + (flow)*0.12 + (this.rng(gx*777 ^ gy*313)*0.14-0.07);
      if(gx>this.zeta9.x && gy<this.zeta9.y+this.zeta9.h) env -= 0.4; // в Дзете хуже
    }

    const jitter = (this.rng(Math.floor(tMillis/60000) ^ (gx*131 + gy*911)) * 0.05) - 0.025;
    return env + phase + demandDip + jitter;
  }

  seriesForHouse(house, start, end, step){
    const pts = [];
    const [x0,y0]=house.poly[0], [x2,y2]=house.poly[2];
    const sx = Math.max(1, Math.floor((x2-x0)/8));
    const sy = Math.max(1, Math.floor((y2-y0)/8));
    for(let t=start; t<=end; t+=step){
      let sum=0, n=0;
      for(let gx=x0; gx<=x2; gx+=sx){
        for(let gy=y0; gy<=y2; gy+=sy){
          sum += this.o2Percent(t, gx, gy, house.base, house); n++;
        }
      }
      const o2 = n? (sum/n):house.base;
      const flow = this.demandLpm(t, house);
      pts.push({ t, o2:Number(o2.toFixed(3)), flow:Number(flow.toFixed(3)) });
    }
    return pts;
  }

  ema(arr, alpha=0.2){ const out=[]; let s=arr[0] ?? 0; for(let i=0;i<arr.length;i++){ s = alpha*arr[i] + (1-alpha)*s; out.push(s);} return out; }
  spectrumY(xs){
    const N = xs.length; const mean = xs.reduce((a,b)=>a+b,0)/N; const x = xs.map(v=>v-mean); const mags=[];
    for(let k=1;k<=Math.floor(N/2);k++){ let re=0,im=0; for(let n=0;n<N;n++){ const ang=-2*Math.PI*k*n/N; re+=x[n]*Math.cos(ang); im+=x[n]*Math.sin(ang);} mags.push(Math.sqrt(re*re+im*im)/N); }
    return mags;
  }

  // ====== charts ======
  buildChart(){
    Chart.register(window['chartjs-plugin-annotation']);
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
      this.chart.options.scales.y.min = 16; this.chart.options.scales.y.max = 21.5;
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
      const stepMin = Math.max(1, this.stepForRange(this.range)/60000);
      const mags = this.spectrumY(valsFlow);
      const freqsPerMin = mags.map((_,k)=> (k+1)/(stepMin*(mags.length*2)));
      const labels = freqsPerMin.map(f=> (f*60).toFixed(2)); // циклы/час

      this.chart.data.labels = labels;
      this.chart.options.scales.y.min = 0; this.chart.options.scales.y.max = undefined;
      this.chart.options.plugins.annotation.annotations.warn.display = false;
      this.chart.options.plugins.annotation.annotations.crit.display = false;
      this.chart.options.plugins.annotation.annotations.top.display = false;

      this.chart.config.type = 'bar';
      this.chart.data.datasets = [{ label:'Амплитуда', data:mags, backgroundColor:'#38bdf8', _unit:'' }];
      this.chart.update('none');
      this.chart.config.type = 'line';
      return;
    }

    this.chart.update('none');

    // KPI
    const min = Math.min(...valsO2), max = Math.max(...valsO2), last = valsO2.at(-1);
    const below = valsO2.filter(x=>x<18.5).length;
    this.kpis.last.textContent = last?.toFixed(3) ?? '—';
    this.kpis.min .textContent = isFinite(min)? min.toFixed(3):'—';
    this.kpis.max .textContent = isFinite(max)? max.toFixed(3):'—';
    this.kpis.brk .textContent = below;
    this.kpis.flow.textContent = (valsFlow.at(-1)||0).toFixed(2);
  }

  setMode(m){ this.mode=m; this.updateCharts(); }
  setFilter(f){ this.filter=f; this.redraw(); }
  setLogScope(s){ this.logScope=s; this.renderLogs(); }

  // ====== logs ======
  rebuildGlobalLogs(){
    // собрать «полноценные» журналы по всем домам за текущий диапазон (с разрежением)
    const now = Date.now();
    const span = this.rangeToMs(this.range);
    const step = this.stepForRange(this.range);
    const takeEvery = Math.max(1, Math.floor(60*1000/step)); // примерно раз в минуту

    this.globalLogs = [];
    this.houses.forEach(h=>{
      const series = this.seriesForHouse(h, now-span, now, step);
      series.forEach((p,i)=>{
        if(p.o2 < this.thresholds.critical) this.globalLogs.push({ ts:p.t, house:h, who:this.pickSubject(h), severity:'critical', message:'Падение O₂ ниже критического порога' });
        else if(p.o2 < this.thresholds.warning) this.globalLogs.push({ ts:p.t, house:h, who:this.pickSubject(h), severity:'warning', message:'Снижение O₂ ниже нормы' });
        if(i%takeEvery===0) this.globalLogs.push({ ts:p.t, house:h, who:this.pickSubject(h), severity:'info', message:`Датчик O₂: ${p.o2.toFixed(2)}% · Подача ${p.flow.toFixed(2)} л/мин` });
      });
      if(!h.cannulaUpdated) this.globalLogs.push({ ts: now, house:h, who:this.pickSubject(h), severity:'warning', message:'Канюли НЕ обновлены' });
      if(h.aClass) this.globalLogs.push({ ts: now, house:h, who:this.pickSubject(h), severity:'info', message:'Пункт обмена: «идеальная кривая 0.5 л/мин подтверждена»' });
    });

    this.globalLogs.sort((a,b)=>b.ts-a.ts);
    this.renderLogs();
  }

  pickSubject(h){
    // просто берём первого из occupants для подписи
    const o = h.occupants?.[0];
    return o?.name || 'житель';
  }

  buildLocalLogs(){
    const s = this.series;
    const h = this.selectedHouse;
    const inc=[];
    for(const p of s){
      if(p.o2 < this.thresholds.critical) inc.push({ ts:p.t, house:h, who:this.pickSubject(h), severity:'critical', message:'Падение O₂ ниже критического порога' });
      else if(p.o2 < this.thresholds.warning) inc.push({ ts:p.t, house:h, who:this.pickSubject(h), severity:'warning', message:'Снижение O₂ ниже нормы' });
    }
    if(!h.cannulaUpdated) inc.unshift({ ts: Date.now(), house:h, who:this.pickSubject(h), severity:'warning', message:'Канюли НЕ обновлены' });
    else inc.unshift({ ts: Date.now(), house:h, who:this.pickSubject(h), severity:'info', message:'Канюли обновлены' });
    if(h.aClass) inc.unshift({ ts: Date.now(), house:h, who:this.pickSubject(h), severity:'info', message:'Пункт обмена: «идеальная кривая 0.5 л/мин подтверждена»' });

    const info = this.series.filter((_,i)=>i%40===0).map(p=>({ ts:p.t, house:h, who:this.pickSubject(h), severity:'info', message:`Датчик O₂: ${p.o2.toFixed(2)}% · Подача ${p.flow.toFixed(2)} л/мин` }));
    this.localLogs = inc.concat(info).sort((a,b)=>b.ts-a.ts);
  }

  renderLogs(){
    const tbody = this.logsTbody;
    tbody.innerHTML = '';
    const rows = (this.logScope==='all') ? this.globalLogs : (this.buildLocalLogs(), this.localLogs);
    const fmt = ts => new Date(ts).toLocaleString([], { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    for(const l of rows){
      const badge = `<span class="badge ${l.severity==='critical'?'b-crit':l.severity==='warning'?'b-warn':'b-info'}">${l.severity}</span>`;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${fmt(l.ts)}</td><td>${l.house.name}</td><td>${l.who}</td><td>${badge}</td><td>${l.message}</td>`;
      tbody.appendChild(tr);
    }
  }

  exportLogsCsv(){
    const rows = [['timestamp','house','subject','severity','message']].concat(
      (this.logScope==='all'?this.globalLogs:this.localLogs).map(l=>[
        new Date(l.ts).toISOString(), l.house.name, l.who, l.severity, l.message.replace(/"/g,'""')
      ])
    );
    const csv = rows.map(r=>r.map(v=>/[,"]/.test(v)?`"${v}"`:v).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `o2-logs-${this.logScope}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
  }

  // ====== series & network ======
  setRange(r){ this.range=r; this.rebuildSeries(); this.rebuildGlobalLogs(); this.updateCharts(); }
  setLive(v){ this.live=v; }
  rebuildSeries(){
    const now = Date.now();
    const span = this.rangeToMs(this.range);
    const step = this.stepForRange(this.range);
    this.series = this.seriesForHouse(this.selectedHouse, now - span, now, step);
    this.updateNetworkFlows(now);
    this.updateCharts();
    this.redraw();
  }

  updateNetworkFlows(t){
    const flowsPerEdge = new Map();
    for(let i=0;i<this.network.edges.length;i++) flowsPerEdge.set(i,0);

    this.houses.forEach((h, idx)=>{
      const q = this.demandLpm(t, h);
      const edgeIndex = 4 + idx;
      flowsPerEdge.set(edgeIndex, q);
    });

    const sumDir = { 'J-N':0, 'J-S':0, 'J-W':0, 'J-E':0 };
    const juncs = ['J-N','J-E','J-S','J-W','J-N','J-E','J-S','J-W','J-N','J-E','J-S','J-W','J-N','J-E','J-S','J-W'];
    this.houses.forEach((_,i)=>{ sumDir[juncs[i]] += flowsPerEdge.get(4+i); });

    const mapEdge0 = {0:'J-N',1:'J-S',2:'J-W',3:'J-E'};
    for(let e=0;e<4;e++){ const label = mapEdge0[e]; flowsPerEdge.set(e, sumDir[label]); }

    this.network.edges.forEach((e, idx)=> e.flow = flowsPerEdge.get(idx) || 0);
    this.totalSupply = [...flowsPerEdge.values()].reduce((a,b)=>a+b,0);
  }

  // ====== drawing ======
  redraw(){
    const ctx=this.ctx;
    ctx.clearRect(0,0,this.canvas.width,this.canvas.height);

    const now = Date.now();
    const visibleHouses = this.houses.filter(h=> this.filter==='all' || (this.filter==='aclass'? h.aClass : !h.aClass));

    // фон-мозаика
    for(let gy=0; gy<this.gridH; gy++){
      for(let gx=0; gx<this.gridW; gx++){
        const house = visibleHouses.find(h => this.pointInPoly(gx+0.5, gy+0.5, h.poly));
        const base = house? h.base : 18.3;
        const v = this.o2Percent(now, gx, gy, base, house);
        ctx.fillStyle = this.valueToColor(v);
        ctx.fillRect(this.px(gx), this.py(gy), this.scaleX-0.6, this.scaleY-0.6);
      }
    }

    // парк — полноценно ЧЁРНЫЙ
    this.drawParkBlack();

    // Дзета-9
    this.drawZeta9();

    // трубы
    this.drawPipes();

    // ядро
    this.drawCore();

    // дома/подписи
    this.drawHouses(visibleHouses);
  }

  drawParkBlack(){
    const ctx=this.ctx, poly=this.parkPoly;
    ctx.fillStyle='#000000';
    ctx.strokeStyle='#000000';
    ctx.lineWidth=2*this.dpr;
    ctx.beginPath(); ctx.moveTo(this.px(poly[0][0]),this.py(poly[0][1]));
    for(let i=1;i<poly.length;i++) ctx.lineTo(this.px(poly[i][0]),this.py(poly[i][1]));
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#9fb3d8'; ctx.font='12px system-ui';
    ctx.fillText('Парковая зона (мёртвая по O₂)', this.px(poly[0][0])+6, this.py(poly[0][1])+14);
  }

  drawZeta9(){
    const {x,y,w,h}=this.zeta9; const ctx=this.ctx;
    ctx.fillStyle='rgba(59,130,246,.10)';
    ctx.strokeStyle='#3b82f6'; ctx.lineWidth=1.5*this.dpr;
    ctx.fillRect(this.px(x),this.py(y), w*this.scaleX, h*this.scaleY);
    ctx.strokeRect(this.px(x),this.py(y), w*this.scaleX, h*this.scaleY);
    ctx.fillStyle='#9fb3d8'; ctx.font='12px system-ui';
    ctx.fillText('Дзета-9 · законсервированный пояс', this.px(x)+6, this.py(y)+14);
  }

  drawCore(){
    const ctx=this.ctx;
    ctx.beginPath(); ctx.arc(this.px(this.core.x), this.py(this.core.y), 10*this.dpr, 0, Math.PI*2);
    ctx.fillStyle='#0b1320'; ctx.fill();
    ctx.strokeStyle='#7de0ff'; ctx.lineWidth=2*this.dpr; ctx.stroke();
    ctx.fillStyle='#a9b7d6'; ctx.font='12px system-ui';
    ctx.fillText(`Ядро обмена · Σподача: ${this.totalSupply?.toFixed(2)||'—'} л/мин`, this.px(this.core.x)+14, this.py(this.core.y)+4);
  }

  drawHouses(hs){
    const ctx=this.ctx;
    for(const h of hs){
      ctx.beginPath();
      const [x0,y0]=h.poly[0]; ctx.moveTo(this.px(x0),this.py(y0));
      for(let i=1;i<h.poly.length;i++){ const [x,y]=h.poly[i]; ctx.lineTo(this.px(x),this.py(y)); }
      ctx.closePath();
      ctx.lineWidth = (h===this.selectedHouse)? 3*this.dpr: 1.5*this.dpr;
      ctx.strokeStyle = (h.aClass? '#60a5fa' : (h===this.selectedHouse? '#e5e7eb':'#6b7280'));
      ctx.stroke();

      // канюли
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
    for(const e of this.network.edges){
      const cap = e.cap, q = e.flow||0;
      const ratio = Math.min(1, q / cap);
      const w = (2 + 5*ratio)*this.dpr;
      const col = q>cap? '#ef4444' : (ratio>0.7? '#7dd3fc' : '#93c5fd');

      ctx.lineWidth = w;
      ctx.strokeStyle = col;
      ctx.beginPath();
      const pts = e.path;
      ctx.moveTo(this.px(pts[0][0]),this.py(pts[0][1]));
      for(let i=1;i<pts.length;i++) ctx.lineTo(this.px(pts[i][0]),this.py(pts[i][1]));
      ctx.stroke();

      // стрелки
      const a = pts[0], b = pts[pts.length-1];
      const dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy), ux=dx/L, uy=dy/L;
      const mx=(a[0]+b[0])/2, my=(a[1]+b[1])/2;
      ctx.beginPath();
      ctx.moveTo(this.px(mx), this.py(my));
      ctx.lineTo(this.px(mx-ux*1.2 - uy*0.6), this.py(my-uy*1.2 + ux*0.6));
      ctx.lineTo(this.px(mx-ux*1.2 + uy*0.6), this.py(my-uy*1.2 - ux*0.6));
      ctx.closePath();
      ctx.fillStyle=col; ctx.fill();

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

  // ====== pointer / zoom-pan ======
  bindPointer(){
    // wheel zoom
    this.canvas.addEventListener('wheel', e=>{
      e.preventDefault();
      const oldZoom = this.zoom;
      const factor = e.deltaY<0 ? 1.1 : 0.9;
      const cx = e.clientX - this.canvas.getBoundingClientRect().left;
      const cy = e.clientY - this.canvas.getBoundingClientRect().top;
      const [wx,wy] = this.screenToGrid(cx,cy); // мировые координаты до изменения

      this.zoom = Math.min(4, Math.max(0.6, this.zoom*factor));
      this.updateScale();

      // фиксируем мировую точку под курсором
      this.panX = cx*this.dpr - this.padding*this.dpr - wx*this.scaleX;
      this.panY = cy*this.dpr - this.padding*this.dpr - wy*this.scaleY;

      this.redraw();
    }, {passive:false});

    // pan drag
    let dragging=false, lastX=0, lastY=0;
    this.canvas.addEventListener('mousedown', e=>{ dragging=true; lastX=e.clientX; lastY=e.clientY; this.canvas.style.cursor='grabbing'; });
    window.addEventListener('mouseup', ()=>{ dragging=false; this.canvas.style.cursor='grab'; });
    window.addEventListener('mousemove', e=>{
      if(!dragging) return;
      const dx=(e.clientX-lastX)*this.dpr, dy=(e.clientY-lastY)*this.dpr;
      lastX=e.clientX; lastY=e.clientY;
      this.panX += dx; this.panY += dy; this.redraw();
    });

    // hover + select
    this.canvas.addEventListener('mousemove', e=>{
      const rect = this.canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const [gx,gy] = this.screenToGrid(cx,cy);

      // ближайшая труба?
      let nearest=null, best=1e9;
      this.network.edges.forEach((edge)=>{
        for(let i=0;i<edge.path.length-1;i++){
          const a=edge.path[i], b=edge.path[i+1];
          const d=this.distPointToSeg(gx,gy,a[0],a[1],b[0],b[1]);
          if(d<best){ best=d; nearest=edge; }
        }
      });

      const house = this.houses.find(h => this.pointInPoly(gx+0.5, gy+0.5, h.poly));
      const showPipe = nearest && best < 1.3;

      if(showPipe){
        this.selectedPipe = nearest;
        this.tooltip.style.display='block';
        this.tooltip.innerHTML = `
          <div><strong>Трубопровод</strong></div>
          <div class="muted">cap ${nearest.cap} л/мин</div>
          <div>Поток: <b>${(nearest.flow||0).toFixed(2)} л/мин</b></div>
        `;
        this.tooltip.style.left = (e.pageX + 14) + 'px';
        this.tooltip.style.top  = (e.pageY + 14) + 'px';
        return;
      } else this.selectedPipe = null;

      const base = house? house.base : 18.3;
      const v = this.o2Percent(Date.now(), gx, gy, base, house);
      this.tooltip.style.display='block';
      this.tooltip.innerHTML = `
        <div><strong>${house?house.name:'Вне дома'}</strong></div>
        ${house? `<div class="muted">${house.aClass?'A-категория · ':''}${house.cannulaUpdated?'канюли обновлены':'канюли НЕ обновлены'}</div>`:''}
        <div class="muted">(${Math.floor(gx)}, ${Math.floor(gy)})</div>
        <div>O₂: <b>${v.toFixed(3)}%</b></div>
        ${house? `<div>Подача: <b>${this.demandLpm(Date.now(),house).toFixed(2)} л/мин</b>${house.doubleBreath?' · «двойной вдох»':''}</div>`:''}
      `;
      this.tooltip.style.left = (e.pageX + 14) + 'px';
      this.tooltip.style.top  = (e.pageY + 14) + 'px';
    });

    this.canvas.addEventListener('mouseleave', ()=>{ this.tooltip.style.display='none'; });

    this.canvas.addEventListener('click', e=>{
      if(this.selectedPipe) return;
      const rect = this.canvas.getBoundingClientRect();
      const [gx,gy] = this.screenToGrid(e.clientX-rect.left, e.clientY-rect.top);
      const house = this.houses.find(h => this.pointInPoly(gx+0.5, gy+0.5, h.poly));
      if(house){ this.selectedHouse = house; this.rebuildSeries(); this.renderLogs(); }
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
