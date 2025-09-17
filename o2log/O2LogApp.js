// D-7 хаб: канвас-карта с парком, трубами и стояками, RAW/EMA/«идеал», спектр, двойной вдох.
// Физмодель: поле O2 по тайлам + подача (л/мин) по домам, суммарные потоки по трубам.
// Зависимости: Chart.js + chartjs-plugin-annotation.

export class O2LogApp {
  constructor(opts){
    this.canvas = opts.canvas; this.ctx = this.canvas.getContext('2d');
    this.tooltip = opts.tooltip;
    this.kpis = opts.kpis; // name,last,flow,brk
    this.chartNodes = opts.charts; // main, aux, titleNode
    this.logsTbody = opts.logsTbody;

    this.thresholds = opts.thresholds ?? { critical:19.0, warning:19.5, upper:21.4 };
    this.range = opts.range ?? '24h';
    this.graph  = opts.graph ?? { metric:'o2', mode:'raw' };
    this.view   = opts.view  ?? { pipes:true, park:true, risers:false, onlyCannula:false };
    this.live = true;

    // сетка тайлов (попиксельно)
    this.gridW = 180;
    this.gridH = 120;
    this.padding = 6;

    this.resizeCanvas();

    // топология D-7
    this.nodes = this.buildNodes();
    this.edges = this.buildEdges();
    this.park  = this.buildPark();
    this.risers = this.buildRisers();
    this.zeta9 = this.buildZeta9();

    // дома (привязаны к ближайшим радиальным узлам)
    this.houses = this.buildHouses();

    // фильтрованный список для отрисовки
    this.filterHouses();

    // выбранный дом
    this.selectedHouse = this.houses[0];

    // шум/семя
    this.seed = 7331;

    // графики
    this._charts = this.buildCharts();

    // серии
    this.rebuildSeries();
    this.buildLogs();

    // инпуты
    this.bindPointer();
  }

  resizeCanvas(){
    const ratio = Math.max(window.devicePixelRatio||1,1);
    const cssW = Math.min(1080, this.canvas.clientWidth || 1080);
    const cssH = Math.round(cssW * 0.666); // 1080x720 базово
    this.canvas.style.height = cssH + 'px';
    this.canvas.width = cssW * ratio; this.canvas.height = cssH * ratio;
    this.drawWidth  = this.canvas.width  - this.padding*2*ratio;
    this.drawHeight = this.canvas.height - this.padding*2*ratio;
    this.scaleX = this.drawWidth / this.gridW;
    this.scaleY = this.drawHeight / this.gridH;
  }

  // --- helpers
  rng(i){ let t=(i+this.seed)>>>0; t+=0x6D2B79F5; t=Math.imul(t^(t>>>15), t|1); t^=t+Math.imul(t^(t>>>7), t|61); return ((t^(t>>>14))>>>0)/4294967296; }
  lerp(a,b,t){ return a+(b-a)*t; }
  fade(t){ return t*t*(3-2*t); }
  valueNoise(x,y){
    const xi=Math.floor(x), yi=Math.floor(y);
    const xf=x-xi, yf=y-yi;
    const idx=(X,Y)=>this.rng((X*73856093)^(Y*19349663));
    const v00=idx(xi,yi), v10=idx(xi+1,yi), v01=idx(xi,yi+1), v11=idx(xi+1,yi+1);
    return this.lerp(this.lerp(v00,v10,this.fade(xf)), this.lerp(v01,v11,this.fade(xf)), this.fade(yf));
  }
  flowField(x,y){
    return 0.6*this.valueNoise(x*0.08,y*0.08) + 0.3*this.valueNoise(x*0.02+10,y*0.02-7) + 0.1*this.valueNoise(x*0.16-3,y*0.16+5);
  }
  pointInPoly(px,py,poly){
    let inside=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const [xi,yi]=poly[i], [xj,yj]=poly[j];
      const inter=((yi>py)!==(yj>py)) && (px < (xj-xi)*(py-yi)/(yj-yi)+xi);
      if(inter) inside=!inside;
    }
    return inside;
  }

  // --- sector geometry (nodes/edges)
  buildNodes(){
    // центр — пункт обмена
    const center = { id:'hub', x:this.gridW/2, y:this.gridH/2, kind:'hub' };
    // радиальные узлы по окружности
    const r = Math.min(this.gridW, this.gridH)*0.32;
    const radials = [];
    const spokes = 8;
    for(let k=0;k<spokes;k++){
      const ang = (Math.PI*2*k)/spokes;
      radials.push({ id:`r${k}`, x:center.x + r*Math.cos(ang), y:center.y + r*Math.sin(ang), kind:'radial', ang });
    }
    return [center, ...radials];
  }
  buildEdges(){
    // радиальные трубы от центра к узлам + кольцевая
    const E=[];
    const center = this.nodes.find(n=>n.id==='hub');
    const rad = this.nodes.filter(n=>n.kind==='radial').sort((a,b)=>a.ang-b.ang);
    for(const n of rad){ E.push({ id:`e_h_${n.id}`, a:center.id, b:n.id, flow:0 }); }
    for(let i=0;i<rad.length;i++){
      const a=rad[i], b=rad[(i+1)%rad.length];
      E.push({ id:`e_c_${a.id}_${b.id}`, a:a.id, b:b.id, flow:0 });
    }
    return E;
  }
  buildPark(){
    // «парковая зона» — органичная кривая внизу слева
    const poly = [
      [8, this.gridH-8],
      [8, this.gridH-38],
      [28, this.gridH-46],
      [48, this.gridH-44],
      [62, this.gridH-30],
      [60, this.gridH-12],
      [32, this.gridH-8],
    ];
    return { id:'park', poly };
  }
  buildRisers(){
    // сервисные шахты (вертикальные штрихи)
    const rs=[];
    const xList=[ this.gridW/2 - 50, this.gridW/2 - 10, this.gridW/2 + 30 ];
    for(const x of xList){
      rs.push({ x, y0:16, y1:this.gridH-16 });
    }
    return rs;
  }
  buildZeta9(){
    // Граница с Дзета-9 (северо-восток)
    return { id:'zeta9', poly:[
      [this.gridW-42, 6], [this.gridW-6, 6], [this.gridW-6, 48], [this.gridW-58, 60], [this.gridW-58, 26]
    ]};
  }

  // --- houses with characters and flags
  buildHouses(){
    const rad = this.nodes.filter(n=>n.kind==='radial').sort((a,b)=>a.ang-b.ang);
    // позиции домов вдоль каждого радиуса
    const houses=[];
    const mkRect=(cx,cy,w,h)=>[[cx-w/2,cy-h/2],[cx+w/2,cy-h/2],[cx+w/2,cy+h/2],[cx-w/2,cy+h/2]];
    const attachTo = (x,y)=> {
      // найди ближайший радиальный узел
      let best=null, bestD=1e9;
      for(const n of rad){
        const dx=n.x-x, dy=n.y-y, d=dx*dx+dy*dy;
        if(d<bestD){ bestD=d; best=n; }
      }
      return best.id;
    };

    // A-категория и ключевые
    const chars = [
      { key:'freydi_a_pediatric_a_class', label:'Фрейди (А-кат.)', aCat:true, double:true, cannula:true, baseO2:+0.35, flow:0.65 },
      { key:'molot_trainee', label:'molot-trainee (отец Фрейди)', aCat:false, double:false, cannula:true, baseO2:+0.10, flow:0.35 },
      { key:'father_of_twins_b7', label:'Отец Близнецов (B-7)', aCat:false, double:true, cannula:false, baseO2:+0.00, flow:0.55 },
      { key:'mother_kai_a_ped', label:'Мать Кай (А-пед.)', aCat:true, double:false, cannula:false, baseO2:+0.30, flow:0.55 },
      // служебные рядом с центром
      { key:'med_unit_7', label:'Мед-юнит-7', aCat:true, double:false, cannula:true, baseO2:+0.25, flow:0.80 },
      { key:'resp_therapist_ina', label:'resp_therapist_ina', aCat:false, double:false, cannula:true, baseO2:+0.05, flow:0.25 },
    ];

    // разместим персонажей и добьём остальными ячейками
    const placements = [
      { x:this.nodes.find(n=>n.id==='r0').x + 22,  y:this.nodes.find(n=>n.id==='r0').y - 8,  who:chars[0] },
      { x:this.nodes.find(n=>n.id==='r1').x + 18,  y:this.nodes.find(n=>n.id==='r1').y + 10, who:chars[1] },
      { x:this.nodes.find(n=>n.id==='r2').x,       y:this.nodes.find(n=>n.id==='r2').y + 18, who:chars[2] },
      { x:this.nodes.find(n=>n.id==='r3').x - 18,  y:this.nodes.find(n=>n.id==='r3').y + 12, who:chars[3] },
      { x:this.nodes.find(n=>n.id==='hub').x - 10, y:this.nodes.find(n=>n.id==='hub').y - 18, who:chars[4] },
      { x:this.nodes.find(n=>n.id==='hub').x + 20, y:this.nodes.find(n=>n.id==='hub').y - 8,  who:chars[5] },
    ];

    for(const p of placements){
      const poly = mkRect(p.x,p.y, 16,12);
      houses.push({
        id: 'H-' + (100 + houses.length),
        name: p.who.label,
        poly, base: 20.6 + p.who.baseO2,
        flowBase: p.who.flow, // л/мин
        aCategory: !!p.who.aCat,
        doubleInhale: !!p.who.double,
        cannulaUpdated: !!p.who.cannula,
        pipeAttach: attachTo(p.x,p.y)
      });
    }

    // дополнительные обычные дома по окружности
    for(let k=0;k<10;k++){
      const n = rad[k%rad.length];
      const dist = 22 + (k%3)*14;
      const x = n.x + Math.cos(n.ang)*dist + (this.rng(900+k)-0.5)*6;
      const y = n.y + Math.sin(n.ang)*dist + (this.rng(1200+k)-0.5)*6;
      const poly = mkRect(x,y, 14,10);
      houses.push({
        id: 'H-' + (100 + houses.length),
        name: `Ячейка ${k+1}`,
        poly, base: 20.55 + (this.rng(k)*0.1 - 0.05),
        flowBase: 0.30 + this.rng(200+k)*0.35,
        aCategory: this.rng(300+k) < 0.18, // некоторые — А
        doubleInhale: this.rng(400+k) < 0.25, // у части — «двойной вдох»
        cannulaUpdated: this.rng(500+k) < 0.55,
        pipeAttach: attachTo(x,y)
      });
    }
    return houses;
  }

  filterHouses(){
    this.housesFiltered = this.view.onlyCannula ? this.houses.filter(h=>h.cannulaUpdated) : this.houses.slice();
    // если выбранный дом вылетел из фильтра — выберем ближайший
    if(!this.housesFiltered.includes(this.selectedHouse)){
      this.selectedHouse = this.housesFiltered[0] || this.houses[0];
      this.rebuildSeries();
      this.buildLogs();
      this.updateCharts(true);
    }
    this.redraw();
  }

  // --- time
  rangeToMs(r){ const H=3600e3, D=24*H; return r==='1h'?H: r==='7d'?7*D: D; }
  stepForRange(r){ const MIN=60e3; return r==='1h'? 30*1000: r==='7d'? 30*MIN: 5*MIN; }

  // --- models
  o2AtTile(tMillis,gx,gy,houseBase){
    const day=24*3600e3, phase=Math.sin((tMillis%day)/day*Math.PI*2);
    const flow=this.flowField(gx,gy);
    const drift=(flow-0.5)*0.25 + (this.rng(gx*9173^gy*2273)*0.06-0.03);
    const jitter=(this.rng(Math.floor(tMillis/60000)^(gx*131+gy*911)))*0.08 - 0.04;
    // A-категория получает небольшой бонус стабильности
    return houseBase + phase*0.06 + drift + jitter;
  }
  seriesO2ForHouse(house,start,end,step){
    const [x0,y0]=house.poly[0], [x1,y1]=house.poly[2];
    const sx=Math.max(1,Math.floor((x1-x0)/8)), sy=Math.max(1,Math.floor((y1-y0)/8));
    const pts=[];
    for(let t=start;t<=end;t+=step){
      let sum=0,n=0;
      for(let gx=x0; gx<=x1; gx+=sx){
        for(let gy=y0; gy<=y1; gy+=sy){
          if(this.pointInPoly(gx+0.5,gy+0.5,house.poly)){ sum+=this.o2AtTile(t,gx,gy,house.base); n++; }
        }
      }
      const v=n?(sum/n):house.base;
      // A-категория держит выше норму
      pts.push({t, value: Number((v + (house.aCategory? 0.12:0)).toFixed(3))});
    }
    return pts;
  }

  // поток (л/мин) — «истина» + «двойной вдох»
  flowSeriesForHouse(house,start,end,step){
    const pts=[];
    const base = house.flowBase; // средняя подача
    const nightBoost = (t)=>{ const h=new Date(t).getHours(); return (h>=0&&h<6)? 0.08: 0; };
    // двойной потребитель: две несинхронные пилы/синусы
    const f1 = 1/900;  // ~15 мин периодика
    const f2 = house.doubleInhale? 1/600 : 0; // второй потребитель быстрее
    for(let t=start;t<=end;t+=step){
      const x = (t/1000);
      const osc1 = 0.12*Math.sin(2*Math.PI*f1*x);
      const osc2 = house.doubleInhale? 0.10*Math.sin(2*Math.PI*f2*x + 1.2): 0;
      const spikes = (this.rng(Math.floor(t/step)^house.id.length) < 0.02)? 0.25: 0;
      const v = base + nightBoost(t) + osc1 + osc2 + spikes + (this.rng(Math.floor(t/10000)) - 0.5)*0.05;
      pts.push({t, value: Math.max(0, Number(v.toFixed(3)))});
    }
    return pts;
  }
  ema(arr, alpha=0.2){
    let out=[], s=arr[0]?.value ?? 0;
    for(let i=0;i<arr.length;i++){ s = alpha*arr[i].value + (1-alpha)*s; out.push({t:arr[i].t, value:s}); }
    return out;
  }
  idealSeries(arr, target=0.5){
    // «идеальный» график пункта обмена: гладкая линия нужного расхода
    return arr.map(p=>({t:p.t, value: target}));
    // можно заменить на паспортное значение из метаданных узла
  }
  spectrumDFT(arr, stepMs){
    // простая DFT, нам хватает 1h/24h дискретизации
    const N=arr.length; const re=new Array(N).fill(0), im=new Array(N).fill(0);
    for(let k=0;k<N;k++){
      for(let n=0;n<N;n++){
        const phi = -2*Math.PI*k*n/N;
        re[k]+=arr[n].value*Math.cos(phi);
        im[k]+=arr[n].value*Math.sin(phi);
      }
    }
    const mag = re.map((r,i)=>Math.sqrt(r*r + im[i]*im[i])/N);
    const dt = stepMs/1000; // сек
    const fs = 1/dt; // Гц
    const freqs = mag.map((_,k)=> k*fs/N);
    return { freqs, mag };
  }

  // --- charts
  buildCharts(){
    Chart.register(window['chartjs-plugin-annotation']);
    const mk = (node,label) => new Chart(node.getContext('2d'), {
      type:'line',
      data:{ labels:[], datasets:[
        { label, data:[], borderWidth:2, borderColor:'#3b82f6', pointRadius:0, tension:.25, fill:true,
          backgroundColor:(ctx)=>{ const {chart}=ctx; const g=chart.ctx.createLinearGradient(0,0,0,chart.height); g.addColorStop(0,'rgba(59,130,246,.35)'); g.addColorStop(1,'rgba(59,130,246,0)'); return g; }
        }
      ]},
      options:{
        responsive:true, maintainAspectRatio:false,
        scales:{ y:{ grid:{color:'#182233'}, ticks:{color:'#9fb3d8'} }, x:{ grid:{color:'#182233'}, ticks:{color:'#9fb3d8'} } },
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:(c)=>`${c.formattedValue} ${label.includes('%')?'%':'л/мин'}`}},
          annotation:{ annotations:{
            warn:{ type:'line', yMin:this.thresholds.warning, yMax:this.thresholds.warning, borderColor:'#f59e0b', borderDash:[4,4] },
            crit:{ type:'line', yMin:this.thresholds.critical, yMax:this.thresholds.critical, borderColor:'#ef4444', borderDash:[4,4] },
            top: { type:'line', yMin:this.thresholds.upper,    yMax:this.thresholds.upper,    borderColor:'#94a3b8', borderDash:[2,4] },
          }}
        }
      }
    });

    const main = mk(this.chartNodes.main, 'O₂, %');
    const aux  = mk(this.chartNodes.aux,  'Подача, л/мин');

    main._fmt = ts => new Date(ts).toLocaleString([], {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    aux._fmt  = main._fmt;
    return { main, aux };
  }

  updateCharts(forceTitle=false){
    const { main, aux } = this._charts;
    const metric = this.graph.metric;  // 'o2' | 'flow'
    const mode   = this.graph.mode;    // 'raw' | 'ema' | 'ideal' | 'spectrum'

    // подготовим серии
    const sO2   = this.series.o2;
    const sFlow = this.series.flow;
    const emaFlow = this.ema(sFlow, 0.25);
    const idealFlow = this.idealSeries(sFlow, 0.5);

    // главный график
    const labels = (metric==='o2'? sO2: sFlow).map(p=>main._fmt(p.t));
    main.data.labels = labels;
    main.data.datasets[0].borderColor = metric==='o2' ? '#3b82f6' : '#10b981';
    main.data.datasets[0].backgroundColor = (ctx)=>{ const {chart}=ctx; const g=chart.ctx.createLinearGradient(0,0,0,chart.height); g.addColorStop(0, metric==='o2'?'rgba(59,130,246,.35)':'rgba(16,185,129,.35)'); g.addColorStop(1,'rgba(0,0,0,0)'); return g; };
    main.options.scales.y.min = metric==='o2'? 17: 0;
    main.options.scales.y.max = metric==='o2'? 23: 1.6;

    if(metric==='o2'){
      main.data.datasets[0].data = sO2.map(p=>p.value);
    } else {
      if(mode==='ideal') main.data.datasets[0].data = idealFlow.map(p=>p.value);
      else if(mode==='ema') main.data.datasets[0].data = emaFlow.map(p=>p.value);
      else main.data.datasets[0].data = sFlow.map(p=>p.value); // raw
    }
    // пороги показываем только для O2
    main.options.plugins.annotation.annotations.warn.display = metric==='o2';
    main.options.plugins.annotation.annotations.crit.display = metric==='o2';
    main.options.plugins.annotation.annotations.top.display  = metric==='o2';
    main.update('none');

    // вспомогательный график: RAW vs EMA или Спектр
    if(mode==='spectrum'){
      const { freqs, mag } = this.spectrumDFT(sFlow, this.stepForRange(this.range));
      const upTo = Math.round(freqs.length/8); // низкие частоты
      aux.data.labels = freqs.slice(0,upTo).map(f=>f.toFixed(4));
      aux.data.datasets[0].data = mag.slice(0,upTo).map(v=>Number(v.toFixed(4)));
      aux.data.datasets[0].borderColor = '#f59e0b';
      aux.options.scales.y.min = 0; aux.options.scales.y.max = undefined;
    } else {
      aux.data.labels = labels;
      aux.data.datasets[0].data = [
        {name:'RAW',  data:sFlow},
        {name:'EMA',  data:emaFlow}
      ][0].data.map(p=>p.value);
      // отрисуем двумя слоями
      aux.data.datasets = [
        {label:'RAW', data:sFlow.map(p=>p.value), borderColor:'#64748b', pointRadius:0, tension:.15, fill:false},
        {label:'EMA', data:emaFlow.map(p=>p.value), borderColor:'#f59e0b', pointRadius:0, tension:.2, fill:false}
      ];
      aux.options.plugins.legend.display = true;
      aux.options.scales.y.min = 0; aux.options.scales.y.max = 1.6;
    }
    aux.update('none');

    // KPI
    const lastO2 = sO2.at(-1)?.value ?? 0;
    const lastFlow = sFlow.at(-1)?.value ?? 0;
    this.kpis.name.textContent = this.selectedHouse.name + (this.selectedHouse.aCategory ? ' · A-кат.' : '');
    this.kpis.last.textContent = lastO2.toFixed(3);
    this.kpis.flow.textContent = lastFlow.toFixed(3);
    this.kpis.brk.textContent  = sO2.filter(p=>p.value<19.5).length;

    if(forceTitle) this.chartNodes.titleNode.textContent =
      metric==='o2' ? 'График O₂' :
      mode==='ideal' ? 'Подача: «идеальный» график пункта обмена' :
      mode==='ema' ? 'Подача: RAW + EMA (сглаживание системы)' :
      mode==='spectrum' ? 'Подача: спектр (двойной потребитель = два пика)' :
      'Подача: RAW';
  }

  // --- logs
  buildLogs(){
    const s=this.series.o2, f=this.series.flow;
    const inc=[];
    for(const p of s){
      if(p.value < this.thresholds.critical) inc.push({ts:p.t, severity:'critical', message:'Падение O₂ ниже критического'});
      else if(p.value < this.thresholds.warning) inc.push({ts:p.t, severity:'warning', message:'Снижение O₂ ниже нормы'});
    }
    // инфо по подаче
    for(let i=0;i<f.length;i+=Math.max(1,Math.floor(f.length/24))){
      inc.push({ts:f[i].t, severity:'info', message:`Подача: ${f[i].value.toFixed(2)} л/мин`});
    }
    this.logs = inc.sort((a,b)=>b.ts-a.ts);
    this.renderLogs();
  }
  renderLogs(){
    const tbody=this.logsTbody; tbody.innerHTML='';
    const fmt=ts=>new Date(ts).toLocaleString([], {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    for(const l of this.logs){
      const tr=document.createElement('tr');
      const badge=`<span class="badge ${l.severity==='critical'?'b-crit':l.severity==='warning'?'b-warn':'b-info'}">${l.severity}</span>`;
      tr.innerHTML = `<td>${fmt(l.ts)}</td><td>${this.selectedHouse.name}</td><td>${badge}</td><td>${l.message}</td>`;
      tbody.appendChild(tr);
    }
  }
  exportLogsCsv(){
    const rows=[['timestamp','cell','severity','message']].concat(
      this.logs.map(l=>[new Date(l.ts).toISOString(), this.selectedHouse.name, l.severity, l.message.replace(/"/g,'""')])
    );
    const csv=rows.map(r=>r.map(v=>/[,"]/.test(v)?`"${v}"`:v).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const a=document.createElement('a');
    a.href=URL.createObjectURL(blob); a.download=`d7-logs-${this.selectedHouse.id}.csv`; document.body.appendChild(a); a.click(); a.remove();
  }

  // --- series for selected
  rebuildSeries(){
    const now=Date.now(), span=this.rangeToMs(this.range), step=this.stepForRange(this.range);
    this.series = {
      o2: this.seriesO2ForHouse(this.selectedHouse, now-span, now, step),
      flow: this.flowSeriesForHouse(this.selectedHouse, now-span, now, step)
    };
    this.updateCharts();
    this.redraw();
  }
  setRange(r){ this.range=r; this.rebuildSeries(); this.buildLogs(); }
  setLive(v){ this.live=v; }

  // --- drawing map
  redraw(){
    const ctx=this.ctx; this.clear();
    const px = x => this.padding*(window.devicePixelRatio||1) + x*this.scaleX;
    const py = y => this.padding*(window.devicePixelRatio||1) + y*this.scaleY;

    // подложка тайлов по текущему O2
    const now=Date.now();
    for(let gy=0;gy<this.gridH;gy++){
      for(let gx=0;gx<this.gridW;gx++){
        // какой дом покрывает этот тайл?
        let h=null;
        for(const hh of this.housesFiltered){ if(this.pointInPoly(gx+0.5,gy+0.5,hh.poly)){ h=hh; break; } }
        const base = h? h.base : 20.55;
        const v = this.o2AtTile(now, gx, gy, base + (h?.aCategory?0.12:0));
        ctx.fillStyle = this.valueToColor(v);
        ctx.fillRect(px(gx),py(gy), this.scaleX-0.6, this.scaleY-0.6);
      }
    }

    // парк
    if(this.view.park){
      ctx.save();
      ctx.beginPath();
      this.park.poly.forEach(([x,y],i)=> i? ctx.lineTo(px(x),py(y)) : ctx.moveTo(px(x),py(y)));
      ctx.closePath();
      ctx.fillStyle='rgba(34,197,94,.18)'; ctx.fill();
      ctx.strokeStyle='rgba(34,197,94,.5)'; ctx.lineWidth=2; ctx.stroke();
      ctx.restore();
    }

    // сервисные шахты
    if(this.view.risers){
      ctx.save();
      ctx.strokeStyle='rgba(99,102,241,.45)'; ctx.lineWidth=3; ctx.setLineDash([6,6]);
      for(const r of this.risers){ ctx.beginPath(); ctx.moveTo(px(r.x),py(r.y0)); ctx.lineTo(px(r.x),py(r.y1)); ctx.stroke(); }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // граница Дзета-9
    ctx.save();
    ctx.beginPath();
    this.zeta9.poly.forEach(([x,y],i)=> i? ctx.lineTo(px(x),py(y)) : ctx.moveTo(px(x),py(y)));
    ctx.closePath(); ctx.strokeStyle='rgba(148,163,184,.6)'; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle='rgba(148,163,184,.06)'; ctx.fill();
    ctx.font='12px system-ui'; ctx.fillStyle='#9fb3d8';
    ctx.fillText('Граница Дзета-9', px(this.gridW-56), py(12));
    ctx.restore();

    // трубы и потоки
    if(this.view.pipes){
      this.drawPipes(ctx, px, py);
    }

    // дома
    for(const h of this.housesFiltered){
      ctx.beginPath();
      h.poly.forEach(([x,y],i)=> i? ctx.lineTo(px(x),py(y)) : ctx.moveTo(px(x),py(y)));
      ctx.closePath();
      ctx.lineWidth = (h===this.selectedHouse)?3:1.6;
      ctx.strokeStyle = (h===this.selectedHouse)? '#e5e7eb' : '#6b7280';
      ctx.stroke();

      // шапка с именем
      const [ax,ay]=h.poly[0]; ctx.fillStyle='#e5e7eb'; ctx.font='12px system-ui';
      ctx.fillText(h.name, px(ax)+6, py(ay)+14);

      // A-категория/канюли
      if(h.aCategory){ ctx.fillStyle='#10b981'; ctx.fillRect(px(ax)+6, py(ay)+18, 14,8); ctx.fillStyle='#001b12'; ctx.font='10px system-ui'; ctx.fillText('A', px(ax)+9, py(ay)+25); }
      ctx.fillStyle = h.cannulaUpdated? '#7de0ff': '#64748b';
      ctx.fillRect(px(ax)+26, py(ay)+18, 8,8);
    }
  }
  drawPipes(ctx, px, py){
    // рассчитаем потребление текущих домов и протолкнём по графу
    const demand = new Map(); // per radial node
    for(const h of this.housesFiltered){
      const flow = this.series.flow.at(-1)?.value ?? h.flowBase;
      demand.set(h.pipeAttach, (demand.get(h.pipeAttach)||0) + flow);
    }
    const center = this.nodes.find(n=>n.id==='hub');
    const rad = this.nodes.filter(n=>n.kind==='radial');

    // обнулим
    for(const e of this.edges) e.flow=0;

    // каждый радиус: поток в «спице» до центра
    for(const n of rad){
      const e = this.edges.find(e=> (e.a==='hub'&&e.b===n.id)||(e.b==='hub'&&e.a===n.id));
      e.flow = demand.get(n.id)||0;
    }
    // кольцо: просто тонкая подача для перетоков (фиктивно)
    for(const e of this.edges.filter(e=>e.id.startsWith('e_c_'))){
      e.flow = 0.15 * ( (demand.get(e.a)||0) + (demand.get(e.b)||0) )/2;
    }

    // рисуем
    for(const e of this.edges){
      const A=this.nodes.find(n=>n.id===e.a), B=this.nodes.find(n=>n.id===e.b);
      const w = Math.min(12, 1 + e.flow*4); // толщина по потоку
      ctx.save();
      ctx.lineCap='round';
      ctx.strokeStyle='rgba(125,224,255,.85)'; ctx.lineWidth=w;
      ctx.beginPath(); ctx.moveTo(px(A.x),py(A.y)); ctx.lineTo(px(B.x),py(B.y)); ctx.stroke();
      ctx.restore();
    }

    // хаб
    ctx.save();
    ctx.fillStyle='#7de0ff'; ctx.beginPath(); ctx.arc(px(center.x),py(center.y),8,0,Math.PI*2); ctx.fill();
    ctx.font='12px system-ui'; ctx.fillStyle='#001b12'; ctx.fillText('Пункт обмена D-7', px(center.x)+10, py(center.y)+4);
    ctx.restore();
  }

  clear(){ this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height); }
  valueToColor(v){ if(v<this.thresholds.critical) return '#ef4444'; if(v<this.thresholds.warning) return '#f59e0b'; if(v<=this.thresholds.upper) return '#10b981'; return '#3b82f6'; }

  // --- pointer
  bindPointer(){
    const rect=()=>this.canvas.getBoundingClientRect();
    const gxFrom = cx => Math.max(0,Math.min(this.gridW-1, Math.floor((cx - this.padding*(window.devicePixelRatio||1))/this.scaleX)));
    const gyFrom = cy => Math.max(0,Math.min(this.gridH-1, Math.floor((cy - this.padding*(window.devicePixelRatio||1))/this.scaleY)));

    this.canvas.addEventListener('mousemove', e=>{
      const r=rect(); const cx=(e.clientX-r.left)*(window.devicePixelRatio||1); const cy=(e.clientY-r.top)*(window.devicePixelRatio||1);
      const gx=gxFrom(cx), gy=gyFrom(cy);
      // какой дом под курсором
      let house=null; for(const h of this.housesFiltered){ if(this.pointInPoly(gx+0.5,gy+0.5,h.poly)){ house=h; break; } }
      const base=house?house.base:20.55; const v=this.o2AtTile(Date.now(),gx,gy, base+(house?.aCategory?0.12:0));
      this.tooltip.style.display='block';
      this.tooltip.innerHTML = `
        <div><strong>${house?house.name:'Вне ячейки'}</strong></div>
        <div class="muted">(${gx}, ${gy})</div>
        <div>O₂: <b>${v.toFixed(3)}%</b>${house? (house.aCategory?' · A-кат.':'') : ''}</div>
        ${house? `<div>Канюли: <b>${house.cannulaUpdated?'обновлены':'нет'}</b></div>`:''}
      `;
      this.tooltip.style.left = (e.pageX+14)+'px'; this.tooltip.style.top=(e.pageY+14)+'px';
    });
    this.canvas.addEventListener('mouseleave', ()=>{ this.tooltip.style.display='none'; });
    this.canvas.addEventListener('click', e=>{
      const r=this.canvas.getBoundingClientRect(); const cx=(e.clientX-r.left)*(window.devicePixelRatio||1); const cy=(e.clientY-r.top)*(window.devicePixelRatio||1);
      const gx=gxFrom(cx), gy=gyFrom(cy);
      let house=null; for(const h of this.housesFiltered){ if(this.pointInPoly(gx+0.5,gy+0.5,h.poly)){ house=h; break; } }
      if(house){ this.selectedHouse=house; this.rebuildSeries(); this.buildLogs(); }
    });
    window.addEventListener('resize', ()=>{ this.resizeCanvas(); this.redraw(); });
  }

  // --- live tick
  start(){
    const tick=()=>{
      if(this.live){
        // подвинем серию
        const step=this.stepForRange(this.range);
        const nextT=(this.series.o2.at(-1)?.t ?? Date.now()) + Math.max(step/6,5000);
        const sO2=this.seriesO2ForHouse(this.selectedHouse,nextT,nextT,step);
        const sF =this.flowSeriesForHouse(this.selectedHouse,nextT,nextT,step);
        this.series.o2.push(sO2[0]); this.series.flow.push(sF[0]);
        this.series.o2.shift(); this.series.flow.shift();
        this.updateCharts();
        this.redraw();
      }
      this._raf=requestAnimationFrame(tick);
    };
    tick();
  }

  // external setters
  set view(v){ this._view=v; }
  get view(){ return this._view; }
}
