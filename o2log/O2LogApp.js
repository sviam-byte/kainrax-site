// D-7 интерактив: канвас с зумом/панорамой, парк, шахты, магистрали, дома с персонажами,
// модель 18–19% для обычных, 20% для A-категории, "двойной вдох", RAW/EMA/Спектр,
// расход л/мин и суммарные литры, логи (персонажные + системные).

export class O2LogApp {
  constructor(opts){
    this.canvas = opts.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.tooltip = opts.tooltip;

    this.kpis = opts.kpis;
    this.chartNodes = opts.charts;
    this.logsTbody = opts.logsTbody;

    this.thresholds = opts.thresholds ?? { critical: 18.2, warning: 18.8, upper: 20.0 };
    this.range = opts.range ?? '24h';
    this.view  = opts.view  ?? 'o2';
    this.layers = opts.layers ?? { pipes:true, shafts:true, park:true, cannula:true };
    this.filter = opts.filter ?? 'all';

    // сетка мира (условные метры), рендер скейлится
    this.gridW = 180;
    this.gridH = 120;

    // начальные трансформации
    this.zoom = 1;
    this.offset = { x: 0, y: 0 };

    // домохозяйства и инфраструктура
    this.houses = this.generateHouses();
    this.actors = opts.actors || [];
    this.attachActors();

    // центральный узел и трубы
    this.exchangeCore = { x: this.gridW/2, y: this.gridH/2, r: 6 };
    this.pipes = this.buildPipes();

    // сервисные шахты и парк
    this.shafts = this.buildShafts();
    this.parkPoly = this.buildPark();

    // выбор
    this.selectedHouse = this.houses[0];

    // подготовка графиков
    this._charts = this.buildCharts();

    // размеры (ретина)
    this.resizeCanvas();

    // интерактив
    this.bindPointer();

    // стартовые ряды и логи
    this.rebuildSeries();
    this.buildLogs();
  }

  // ===== world <-> screen
  worldToScreen(x,y){
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const px = (x*this.scaleX*this.zoom + this.offset.x) + this.padding*ratio;
    const py = (y*this.scaleY*this.zoom + this.offset.y) + this.padding*ratio;
    return [px,py];
  }
  screenToWorld(px,py){
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const x = (px - this.padding*ratio - this.offset.x) / (this.scaleX*this.zoom);
    const y = (py - this.padding*ratio - this.offset.y) / (this.scaleY*this.zoom);
    return [x,y];
  }

  resizeCanvas(){
    this.padding = 6;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const cssW = Math.min(1100, this.canvas.clientWidth || 1100);
    const cssH = Math.round(cssW * 0.64);
    this.canvas.style.height = cssH + 'px';

    const w = cssW * ratio;
    const h = cssH * ratio;
    this.canvas.width = w;
    this.canvas.height = h;

    this.drawWidth = w - this.padding*2*ratio;
    this.drawHeight = h - this.padding*2*ratio;
    this.scaleX = this.drawWidth / this.gridW;
    this.scaleY = this.drawHeight / this.gridH;
  }

  resetView(){
    this.zoom = 1; this.offset = {x:0,y:0};
    this.redraw();
  }

  // ===== geometry
  generateHouses(){
    // радиальная компоновка вокруг ядра обмена
    const hs = [];
    const rings = [
      { r: 22, n: 4 },
      { r: 44, n: 4 },
      { r: 66, n: 4 }
    ];
    let id=101;
    for(const ring of rings){
      for(let k=0;k<ring.n;k++){
        const ang = (Math.PI*2/ring.n)*k + (ring.r===22?0:Math.PI/ring.n);
        const cx = this.gridW/2 + Math.cos(ang)*ring.r;
        const cy = this.gridH/2 + Math.sin(ang)*ring.r*0.78;
        const w=18, h=12;
        const poly = [
          [cx-w/2, cy-h/2],[cx+w/2, cy-h/2],
          [cx+w/2, cy+h/2],[cx-w/2, cy+h/2]
        ];
        // обычный фон 18.6%, A-квартиры потом переопределим
        const baseAmbient = 18.6 + (Math.random()*0.2-0.1);
        hs.push({ id:`H-${id}`, name:`Дом ${id}`, poly, baseAmbient, cannulaUpdated:true, aClass:false });
        id++;
      }
    }
    // пункт обмена (служебный) — дом H-110 оставляем как служебный
    return hs;
  }

  attachActors(){
    // подпишем дома понятными метками (персонажи)
    for(const a of this.actors){
      const h = this.houses.find(x=>x.id===a.house);
      if(!h) continue;
      h.occupants = h.occupants || [];
      h.occupants.push(a);
      if(a.aClass) h.aClass = true;
      if(a.cannulaUpdated===false) h.cannulaUpdated = false;
      // A-категория поднятая подача ~20%
      if(h.aClass) h.baseAmbient = 20.0;
    }
    // читаемые подписи
    for(const h of this.houses){
      if(h.occupants?.length){
        const labels = h.occupants.map(o=>o.name).slice(0,2).join(', ');
        h.name = labels.length>0 ? labels : h.name;
      }
    }
  }

  buildPipes(){
    // магистрали от ядра обмена к центрам домов
    const segs = [];
    for(const h of this.houses){
      const c = this.houseCenter(h);
      segs.push({ from:{x:this.exchangeCore.x,y:this.exchangeCore.y}, to:c, houseId:h.id });
    }
    return segs;
  }
  buildShafts(){
    // несколько вертикальных рисеров в старом фонде
    const xs = [ this.gridW*0.25, this.gridW*0.5, this.gridW*0.75 ];
    return xs.map(x=>({ x, y0: this.gridH*0.1, y1:this.gridH*0.9 }));
  }
  buildPark(){
    // парк — цельный чёрный квартал
    const left = this.gridW*0.07, top = this.gridH*0.62, w=this.gridW*0.24, h=this.gridH*0.28;
    return [ [left,top],[left+w,top],[left+w,top+h],[left,top+h] ];
  }
  houseCenter(h){
    const [x0,y0]=h.poly[0], [x2,y2]=h.poly[2];
    return { x:(x0+x2)/2, y:(y0+y2)/2 };
  }
  pointInPoly(px,py, poly){
    let inside = false;
    for(let i=0, j=poly.length-1; i<poly.length; j=i++){
      const xi=poly[i][0], yi=poly[i][1], xj=poly[j][0], yj=poly[j][1];
      const intersect = ((yi>py)!==(yj>py)) && (px < (xj-xi)*(py-yi)/(yj-yi)+xi);
      if(intersect) inside = !inside;
    }
    return inside;
  }

  // ===== time helpers
  rangeToMs(r){
    const H=3600e3, D=24*H;
    if(r==='1h') return H;
    if(r==='7d') return 7*D;
    return D;
  }
  stepForRange(r){
    const MIN=60e3;
    if(r==='1h') return 30*1000;
    if(r==='7d') return 30*MIN;
    return 5*MIN;
  }

  // ===== O₂ field + demand model
  o2AmbientAt(tMillis, x,y, baseAmbient){
    // базовый 18–19% (или 20% в A-категории), легкая синусоидальная суточная волна
    const day=24*3600e3;
    const phase = Math.sin((tMillis%day)/day*Math.PI*2)*0.05;
    // слегка рандомный дрейф по месту
    const drift = (this.hash(x*131+y*977)*0.08 - 0.04);
    return baseAmbient + phase + drift;
  }
  // расход через линию (л/мин), с «дыханием»
  flowLpmAt(tMillis, house){
    const occ = (house.occupants||[]);
    const base = occ.reduce((s,o)=> s + (o.baseFlow||0), 0);
    if(base<=0) return 0;

    // дыхательные ритмы; «двойной вдох» = две частоты
    const t = tMillis/1000;
    const adult = 0.28 + (this.hash(house.id.length*71)*0.04);  // Гц
    const child = 0.42 + (this.hash(house.id.length*131)*0.05); // Гц
    const hasDouble = occ.some(o=>o.doubleBreath);

    const pulse = (f)=>{ // прямоугольно-экспоненциальные «вдохи»
      const phase = (t*f)%1;
      const sharp = phase<0.12 ? Math.exp(-phase*16): 0;
      return sharp;
    };

    let mod = pulse(adult);
    if(hasDouble) mod += pulse(child); // два потребителя

    // EMA идеализатора (та самая «ложь системы»)
    // считаем в графиках, тут только «истина»
    const noise = (this.hash(Math.floor(t*5)+house.id.length)*0.06 - 0.03);

    return Math.max(0, base*(1+0.8*mod) + noise);
  }

  // хеш-рандом без состояния
  hash(n){
    let t = n|0; t+=0x6D2B79F5; t = Math.imul(t ^ (t>>>15), t|1); t ^= t + Math.imul(t ^ (t>>>7), t|61);
    return ((t ^ (t>>>14))>>>0)/4294967296;
  }

  // ряды по дому
  seriesForHouse(house, start, end, step){
    const pts = [];
    const flows = [];
    let sumLiters = 0;
    for(let t=start; t<=end; t+=step){
      // усредним O₂ по площади дома
      const [x0,y0]=house.poly[0], [x2,y2]=house.poly[2];
      const sx = Math.max(1, Math.floor((x2-x0)/8));
      const sy = Math.max(1, Math.floor((y2-y0)/8));
      let sum=0, n=0;
      for(let gx=x0; gx<=x2; gx+=sx){
        for(let gy=y0; gy<=y2; gy+=sy){
          if(this.pointInPoly(gx+0.5,gy+0.5, house.poly)){
            sum += this.o2AmbientAt(t, gx, gy, house.baseAmbient);
            n++;
          }
        }
      }
      const v = n? (sum/n) : house.baseAmbient;
      pts.push({ t, value: Number(v.toFixed(3)) });

      // поток
      const lpm = this.flowLpmAt(t, house);
      flows.push({ t, lpm });
      sumLiters += lpm * (step/60000); // л/мин * минуты
    }
    return { o2: pts, flow: flows, liters: sumLiters };
  }

  detectIncidents(series){
    const inc=[];
    for(const p of series){
      if(p.value < this.thresholds.critical){
        inc.push({ts:p.t, severity:'critical', message:'Падение O₂ ниже критического порога'});
      } else if(p.value < this.thresholds.warning){
        inc.push({ts:p.t, severity:'warning', message:'Снижение O₂ ниже нормы'});
      }
    }
    return inc;
  }

  // ===== charts
  buildCharts(){
    Chart.register(window['chartjs-plugin-annotation']);
    const main = new Chart(this.chartNodes.main.getContext('2d'), {
      type:'line',
      data:{ labels:[], datasets:[{ label:'O₂, %', data:[], borderWidth:2, borderColor:'#3b82f6', pointRadius:0, tension:.25,
        fill:true, backgroundColor:(ctx)=>{ const g=ctx.chart.ctx.createLinearGradient(0,0,0,ctx.chart.height); g.addColorStop(0,'rgba(59,130,246,.35)'); g.addColorStop(1,'rgba(59,130,246,0)'); return g; } }]},
      options:{
        responsive:true, maintainAspectRatio:false,
        scales:{ y:{ min:17, max:21.2, ticks:{color:'#9fb3d8'}, grid:{color:'#182233'} }, x:{ ticks:{color:'#9fb3d8', maxRotation:0}, grid:{color:'#182233'}}},
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:(c)=>`${c.formattedValue} %`}},
          annotation:{ annotations:{ warn:{type:'line',yMin:this.thresholds.warning,yMax:this.thresholds.warning,borderColor:'#f59e0b',borderDash:[4,4]},
                                    crit:{type:'line',yMin:this.thresholds.critical,yMax:this.thresholds.critical,borderColor:'#ef4444',borderDash:[4,4]},
                                    top: {type:'line',yMin:this.thresholds.upper,   yMax:this.thresholds.upper,   borderColor:'#94a3b8',borderDash:[2,4]}, } }
        }
      }
    });

    const aux = new Chart(this.chartNodes.aux.getContext('2d'), {
      type:'line',
      data:{ labels:[], datasets:[] },
      options:{
        responsive:true, maintainAspectRatio:false,
        scales:{ y:{ ticks:{color:'#9fb3d8'}, grid:{color:'#182233'} }, x:{ ticks:{color:'#9fb3d8', maxRotation:0}, grid:{color:'#182233'}}},
        plugins:{ legend:{labels:{color:'#cfe3ff'}}, tooltip:{}, }
      }
    });

    return { main, aux, setTitle:(t)=>{ this.chartNodes.titleNode.textContent=t; } };
  }

  updateCharts(){
    const fmt = ts => new Date(ts).toLocaleString([], { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    const { main, aux, setTitle } = this._charts;

    if(this.view==='o2'){
      setTitle('Динамика O₂');
      main.config.type='line';
      main.data.labels = this.series.o2.map(p=>fmt(p.t));
      main.data.datasets = [{
        label:'O₂, %',
        data:this.series.o2.map(p=>p.value),
        borderColor:'#3b82f6', pointRadius:0, tension:.25, borderWidth:2,
        fill:true, backgroundColor:(ctx)=>{ const g=ctx.chart.ctx.createLinearGradient(0,0,0,ctx.chart.height); g.addColorStop(0,'rgba(59,130,246,.35)'); g.addColorStop(1,'rgba(59,130,246,0)'); return g; }
      }];
      main.options.scales.y.min = 17; main.options.scales.y.max = 21.2;

      // aux — пончики не нужны, показываем «идеальный» (EMA) vs реальный расход
      const raw = this.series.flow.map(p=>p.lpm);
      const ema = this.ema(raw, 0.2);
      aux.data.labels = this.series.flow.map(p=>fmt(p.t));
      aux.data.datasets = [
        { label:'расход RAW (л/мин)', data:raw, borderColor:'#f59e0b', pointRadius:0 },
        { label:'EMA(0.2) — «идеальный»', data:ema, borderColor:'#10b981', pointRadius:0 }
      ];
      aux.update('none');
    }

    if(this.view==='rawema'){
      setTitle('RAW + EMA (расход, л/мин)');
      const raw = this.series.flow.map(p=>p.lpm);
      const ema = this.ema(raw, 0.2);
      main.data.labels = this.series.flow.map(p=>fmt(p.t));
      main.data.datasets = [
        { label:'RAW', data:raw, borderColor:'#f59e0b', pointRadius:0 },
        { label:'EMA(0.2)', data:ema, borderColor:'#10b981', pointRadius:0 }
      ];
      main.options.scales.y.min = 0; main.options.scales.y.max = Math.max(1.5, Math.ceil(Math.max(...raw, ...ema)));
      // aux — «идеальный» от пункта обмена (гладкая 0.5) для контраста
      const ideal = raw.map(()=>0.5);
      aux.data.labels = this.series.flow.map(p=>fmt(p.t));
      aux.data.datasets = [{ label:'от пункта обмена: 0.5 л/мин', data:ideal, borderColor:'#94a3b8', pointRadius:0 }];
      aux.update('none');
    }

    if(this.view==='spectrum'){
      setTitle('Спектр расхода (двойной вдох)');
      const raw = this.series.flow.map(p=>p.lpm);
      const dt = this.seriesStep()/1000; // сек
      const spec = this.dft(raw.slice(-512), dt);
      main.config.type='bar';
      main.data.labels = spec.freq.map(f=>f.toFixed(2)+' Гц');
      main.data.datasets = [{ label:'амплитуда', data: spec.amp, backgroundColor:'#7de0ff' }];
      main.options.scales.y.min = 0; main.options.scales.y.max = undefined;
      // aux — подсветим ожидаемые частоты
      aux.data.labels = this.series.flow.map(p=>fmt(p.t));
      aux.data.datasets = [];
      aux.update('none');
    }

    // KPI
    const v = this.series.o2.map(p=>p.value);
    const min = Math.min(...v), max = Math.max(...v), last = v.at(-1);
    this.kpis.last.textContent = last?.toFixed(3) ?? '—';
    this.kpis.min .textContent = isFinite(min)? min.toFixed(3):'—';
    this.kpis.max .textContent = isFinite(max)? max.toFixed(3):'—';
    const flowNow = this.series.flow.at(-1)?.lpm ?? 0;
    this.kpis.flow.textContent = flowNow.toFixed(2);
    this.kpis.liters.textContent = this.series.liters.toFixed(1);

    // пороги на основном графике
    main.options.plugins.annotation.annotations.warn.yMin =
    main.options.plugins.annotation.annotations.warn.yMax = this.thresholds.warning;
    main.options.plugins.annotation.annotations.crit.yMin =
    main.options.plugins.annotation.annotations.crit.yMax = this.thresholds.critical;
    main.options.plugins.annotation.annotations.top.yMin  =
    main.options.plugins.annotation.annotations.top.yMax  = this.thresholds.upper;

    main.update('none');
  }

  ema(arr, alpha=0.2){
    const out=[]; let prev=arr[0]??0;
    for(let i=0;i<arr.length;i++){ const v = alpha*arr[i] + (1-alpha)*prev; out.push(v); prev=v; }
    return out;
  }
  dft(samples, dt){
    const N = samples.length;
    const freq=[], amp=[];
    const twoPi = 2*Math.PI;
    for(let k=1;k<=Math.floor(N/2);k++){
      let re=0, im=0;
      for(let n=0;n<N;n++){ const ang = twoPi*k*n/N; re += samples[n]*Math.cos(ang); im -= samples[n]*Math.sin(ang); }
      re/=N; im/=N;
      const a = Math.sqrt(re*re+im*im);
      freq.push(k/(N*dt)); amp.push(a);
    }
    return { freq, amp };
  }

  seriesStep(){ return this.stepForRange(this.range); }

  // ===== logs
  buildLogs(){
    // инциденты по выбранному + персонажные действия
    const perHouse = (h)=>{
      const inc = this.detectIncidents(this.seriesMap[h.id].o2);
      const actorLogs = (h.occupants||[]).flatMap(o=>{
        const L=[];
        // «канюли обновлены?»
        if(o.cannulaUpdated===false){
          L.push({ ts:Date.now()-3600e3*6, severity:'warning', who:o.name, house:h.name, message:'Канюли просрочены, требуется замена' });
        } else {
          L.push({ ts:Date.now()-3600e3*24, severity:'info', who:o.name, house:h.name, message:'Канюли обновлены' });
        }
        // сюжетные роли
        if(o.id==='freydi_a_pediatric_a_class'){
          L.push({ ts:Date.now()-3600e3*20, severity:'info', who:o.name, house:h.name, message:'Пост о падении сатурации и быстром расходе: старт расследования' });
        }
        if(o.id==='molot_trainee'){
          L.push({ ts:Date.now()-3600e3*18, severity:'info', who:o.name, house:h.name, message:'Проведён физический тест расхода. Подтверждён ночной пик' });
        }
        if(o.id==='father_of_twins_b7'){
          L.push({ ts:Date.now()-3600e3*16, severity:'info', who:o.name, house:h.name, message:'Сообщил о «двойном вдохе» в D-7. Проблема системная' });
        }
        if(o.id==='stat_modeler_tom'){
          L.push({ ts:Date.now()-3600e3*12, severity:'info', who:o.name, house:h.name, message:'Опубликован RAW vs EMA и спектр с двумя пиками' });
        }
        return L;
      });
      const incFmt = inc.map(x=>({ ts:x.ts, severity:x.severity, who:(h.occupants?.[0]?.name)||h.name, house:h.name, message:x.message }));
      return actorLogs.concat(incFmt);
    };

    let all=[];
    for(const h of this.houses){ all = all.concat(perHouse(h)); }
    this.logs = all.sort((a,b)=>b.ts-a.ts);
    this.renderLogs(false);
  }

  renderLogs(showAll){
    // фильтр: выбранный дом или все
    const scope = showAll ? this.logs
      : this.logs.filter(l => (this.selectedHouse.name===l.house));
    const tbody = this.logsTbody;
    tbody.innerHTML='';
    const fmt = ts => new Date(ts).toLocaleString([], { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    for(const l of scope){
      const tr = document.createElement('tr');
      const badge = `<span class="badge ${l.severity==='critical'?'b-crit':l.severity==='warning'?'b-warn':'b-info'}">${l.severity}</span>`;
      tr.innerHTML = `<td>${fmt(l.ts)}</td><td>${l.house} — ${l.who||''}</td><td>${badge}</td><td>${l.message}</td>`;
      tbody.appendChild(tr);
    }
  }
  exportLogsCsv(){
    const rows = [['timestamp','house','who','severity','message']].concat(
      this.logs.map(l=>[new Date(l.ts).toISOString(), l.house, l.who||'', l.severity, l.message.replace(/"/g,'""')])
    );
    const csv = rows.map(r=>r.map(v=>/[,"]/.test(v)?`"${v}"`:v).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `o2-logs-D7.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
  }

  // ===== rebuild/update
  setRange(r){ this.range = r; this.rebuildSeries(); this.buildLogs(); this.updateCharts(); }
  setView(v){ this.view = v; this.updateCharts(); }
  setFilter(f){ this.filter = f; this.redraw(); }
  setLive(v){ this.live = v; }

  rebuildSeries(){
    const now = Date.now(), span=this.rangeToMs(this.range), step=this.stepForRange(this.range);
    this.series = this.seriesForHouse(this.selectedHouse, now-span, now, step);
    this.seriesMap = {};
    for(const h of this.houses){
      this.seriesMap[h.id] = this.seriesForHouse(h, now-span, now, step);
    }
    this.updateCharts();
    this.redraw();
  }

  // ===== draw
  redraw(){
    const ctx = this.ctx; this.clear();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);

    // фон плитками по текущему моменту
    const now = Date.now();
    const tile = 4; // виртуальная гранулярность мира
    for(let gy=0; gy<=this.gridH; gy+=tile){
      for(let gx=0; gx<=this.gridW; gx+=tile){
        const isPark = this.pointInPoly(gx+tile/2, gy+tile/2, this.parkPoly);
        let v=0, color='#000';
        if(!isPark){
          // найдём дом (если внутри дома — A-категория даст 20%)
          const h = this.houses.find(hh => this.pointInPoly(gx+1, gy+1, hh.poly));
          const base = h ? h.baseAmbient : 18.4;
          v = this.o2AmbientAt(now, gx, gy, base);
          color = this.valueToColor(v);
        }
        const [sx,sy] = this.worldToScreen(gx,gy);
        const [sx2,sy2] = this.worldToScreen(gx+tile, gy+tile);
        ctx.fillStyle = color;
        ctx.fillRect(sx, sy, sx2-sx-0.6*ratio, sy2-sy-0.6*ratio);
      }
    }

    // парк (поверх — плотным чёрным)
    if(this.layers.park){
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      this.polyPath(this.parkPoly);
      ctx.fill();
      ctx.restore();
    }

    // шахты
    if(this.layers.shafts){
      ctx.save();
      ctx.fillStyle = '#7f5af0';
      ctx.globalAlpha = 0.15;
      for(const s of this.shafts){
        const [x0,y0] = this.worldToScreen(s.x, s.y0);
        const [x1,y1] = this.worldToScreen(s.x+3, s.y1);
        ctx.fillRect(x0,y0, x1-x0, y1-y0);
      }
      ctx.restore();
    }

    // трубы
    if(this.layers.pipes){
      ctx.save();
      ctx.strokeStyle = '#7de0ff';
      ctx.lineCap = 'round';
      for(const seg of this.pipes){
        const flow = this.seriesMap[seg.houseId]?.flow.at(-1)?.lpm ?? 0;
        ctx.lineWidth = Math.max(1, 1 + flow*1.2)* (window.devicePixelRatio||1);
        const [x0,y0]=this.worldToScreen(seg.from.x,seg.from.y);
        const [x1,y1]=this.worldToScreen(seg.to.x,seg.to.y);
        ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
      }
      // ядро
      const [cx,cy]=this.worldToScreen(this.exchangeCore.x,this.exchangeCore.y);
      ctx.fillStyle='#ffd86b'; ctx.beginPath(); ctx.arc(cx,cy, 6*(window.devicePixelRatio||1), 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    // дома
    for(const h of this.houses){
      if(this.filter==='aclass' && !h.aClass) continue;
      if(this.filter==='nonaclass' && h.aClass) continue;

      ctx.beginPath();
      this.polyPath(h.poly);
      ctx.lineWidth = (h===this.selectedHouse)? 3*(window.devicePixelRatio||1):1.5*(window.devicePixelRatio||1);
      ctx.strokeStyle = (h===this.selectedHouse)? '#e5e7eb' : '#6b7280';
      ctx.stroke();

      // заголовок
      ctx.fillStyle = '#e5e7eb';
      ctx.font = `${12*(window.devicePixelRatio||1)}px system-ui`;
      const [ax,ay]=this.worldToScreen(h.poly[0][0], h.poly[0][1]);
      ctx.fillText(h.name, ax+6, ay+14);

      // статусы: A-категория и канюли
      if(this.layers.cannula){
        const c = this.houseCenter(h);
        const [sx,sy]=this.worldToScreen(c.x, c.y);
        // A-категория — звёздочка
        if(h.aClass){
          ctx.fillStyle = '#ffd86b';
          ctx.beginPath(); for(let i=0;i<5;i++){ const ang = i*2*Math.PI/5 - Math.PI/2; const r=7*(window.devicePixelRatio||1); const x=sx+Math.cos(ang)*r, y=sy+Math.sin(ang)*r; i?ctx.lineTo(x,y):ctx.moveTo(x,y); }
          ctx.fill();
        }
        // канюли обновлены/нет — кольцо
        ctx.beginPath();
        ctx.lineWidth = 3*(window.devicePixelRatio||1);
        ctx.strokeStyle = h.cannulaUpdated? '#10b981' : '#ef4444';
        ctx.arc(sx, sy, 10*(window.devicePixelRatio||1), 0, Math.PI*2);
        ctx.stroke();
      }
    }
  }
  polyPath(poly){
    const ctx=this.ctx;
    const [sx0,sy0]=this.worldToScreen(poly[0][0],poly[0][1]);
    ctx.moveTo(sx0,sy0);
    for(let i=1;i<poly.length;i++){ const [sx,sy]=this.worldToScreen(poly[i][0],poly[i][1]); ctx.lineTo(sx,sy); }
    ctx.closePath();
  }
  clear(){ this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height); }

  valueToColor(v){
    if(v < this.thresholds.critical) return '#ef4444';
    if(v < this.thresholds.warning)  return '#f59e0b';
    if(v <= this.thresholds.upper)   return '#10b981';
    return '#3b82f6';
  }

  // ===== pointer / zoom / selection
  bindPointer(){
    const ratio = Math.max(window.devicePixelRatio || 1, 1);

    // hover tooltip
    this.canvas.addEventListener('mousemove', e=>{
      const rect = this.canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left) * ratio;
      const cy = (e.clientY - rect.top ) * ratio;
      const [wx,wy] = this.screenToWorld(cx,cy);

      const h = this.houses.find(hh => this.pointInPoly(wx,wy, hh.poly));
      const base = h ? h.baseAmbient : 18.4;
      const o2 = this.o2AmbientAt(Date.now(), wx, wy, base);

      let t = `<div><strong>${h?h.name:'Вне дома'}</strong></div>`;
      t += `<div class="muted">(${wx.toFixed(1)}, ${wy.toFixed(1)})</div>`;
      t += `<div>O₂: <b>${o2.toFixed(3)}%</b></div>`;
      if(h){
        const flow = this.seriesMap[h.id]?.flow.at(-1)?.lpm ?? 0;
        t += `<div>Подача: <b>${flow.toFixed(2)} л/мин</b>${h.aClass?' · A-кат.':''}</div>`;
        t += `<div>Канюли: <b>${h.cannulaUpdated?'обновлены':'не обновлены'}</b></div>`;
      }
      this.tooltip.style.display='block';
      this.tooltip.innerHTML = t;
      this.tooltip.style.left = (e.pageX + 14) + 'px';
      this.tooltip.style.top  = (e.pageY + 14) + 'px';
    });
    this.canvas.addEventListener('mouseleave', ()=>{ this.tooltip.style.display='none'; });

    // click select
    this.canvas.addEventListener('click', e=>{
      const rect = this.canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left) * ratio;
      const cy = (e.clientY - rect.top ) * ratio;
      const [wx,wy] = this.screenToWorld(cx,cy);
      const h = this.houses.find(hh => this.pointInPoly(wx,wy, hh.poly));
      if(h){
        this.selectedHouse = h;
        this.rebuildSeries();
        this.buildLogs();
      }
    });

    // zoom
    this.canvas.addEventListener('wheel', e=>{
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const cx = (e.clientX - rect.left)*ratio, cy=(e.clientY - rect.top)*ratio;
      const [wx,wy] = this.screenToWorld(cx,cy);
      const scale = Math.exp(-e.deltaY*0.001);
      const newZoom = Math.max(0.6, Math.min(3.0, this.zoom*scale));
      // держим под курсором
      const [sx,sy] = this.worldToScreen(wx,wy);
      this.zoom = newZoom;
      const [sx2,sy2] = this.worldToScreen(wx,wy);
      this.offset.x += (sx - sx2);
      this.offset.y += (sy - sy2);
      this.redraw();
    }, {passive:false});

    // pan
    let dragging=false, last={x:0,y:0};
    this.canvas.addEventListener('mousedown', e=>{ dragging=true; last={x:e.clientX,y:e.clientY}; });
    window.addEventListener('mouseup', ()=>dragging=false);
    window.addEventListener('mousemove', e=>{
      if(!dragging) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      this.offset.x += (e.clientX - last.x)*ratio;
      this.offset.y += (e.clientY - last.y)*ratio;
      last={x:e.clientX,y:e.clientY};
      this.redraw();
    });

    window.addEventListener('resize', ()=>{ this.resizeCanvas(); this.redraw(); });
  }

  // ===== live ticking
  start(){
    const tick = ()=>{
      if(this.live){
        // мягко прокручиваем все ряды домов
        const step = this.stepForRange(this.range);
        const advance = Math.max(step/6, 5000);
        for(const h of this.houses){
          const s = this.seriesMap[h.id];
          const nextT = s.o2.at(-1).t + advance;
          const add = this.seriesForHouse(h, nextT, nextT, step);
          // сдвиг влево, добавление справа
          s.o2.push(add.o2[0]); s.o2.shift();
          s.flow.push(add.flow[0]); s.flow.shift();
          s.liters += add.liters;
        }
        // для выбранного — тоже
        const ss = this.seriesMap[this.selectedHouse.id];
        this.series = { o2:[...ss.o2], flow:[...ss.flow], liters:ss.liters };
        this.updateCharts();
        this.redraw();
      }
      this._raf = requestAnimationFrame(tick);
    };
    tick();
  }
}
