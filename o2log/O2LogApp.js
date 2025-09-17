// O2LogApp: канвас-карта «попиксельно», таймсерии (Chart.js), логи, CSV.
// Без внешних зависимостей, кроме Chart.js + plugin-annotation.

export class O2LogApp {
  constructor(opts){
    this.canvas = opts.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.tooltip = opts.tooltip;
    this.kpis = opts.kpis;
    this.chartNodes = opts.charts;
    this.logsTbody = opts.logsTbody;

    this.thresholds = opts.thresholds ?? { critical: 19.0, warning: 19.5, upper: 21.4 };
    this.range = opts.range ?? '24h';
    this.live = true;

    // секторная сетка (мелкая «плитка»)
    this.gridW = 160;      // количество ячеек по X
    this.gridH = 100;      // по Y
    this.tile = 6;         // размер ячейки в CSS-пикселях
    this.padding = 6;      // внешние поля канваса для рамки

    // физический размер для ретины
    this.resizeCanvas();

    // «дома» — прямоугольники/многоугольники в координатах сетки
    this.houses = this.generateHouses();

    // выбранный дом
    this.selectedHouse = this.houses[0];

    // seed для детерминированной «ветровой карты»
    this.seed = 1337;

    // подготовка графиков
    this._charts = this.buildCharts();

    // интерактив
    this.bindPointer();

    // стартовые данные и лог
    this.rebuildSeries(); // для выбранного дома
    this.buildLogs();
  }

  // ========= layout / retina =========
  resizeCanvas(){
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const cssW = Math.min(960, this.canvas.clientWidth || 960);
    const cssH = Math.round(cssW * 0.625); // 960x600 базово, но адаптивно
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

  // ========= seeded rng + noise =========
  rng(i){
    // Mulberry32
    let t = (i + this.seed) >>> 0;
    t += 0x6D2B79F5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  valueNoise(x,y){
    // простая сглаженная value noise
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
    // «потоки воздуха/вентиляции»: от 0..1
    const n = (
      0.6*this.valueNoise(x*0.08,y*0.08) +
      0.3*this.valueNoise(x*0.02+10,y*0.02-7) +
      0.1*this.valueNoise(x*0.16-3,y*0.16+5)
    );
    return n;
  }

  // ========= houses geometry =========
  generateHouses(){
    // 12 домов в три ряда (можно легко править)
    const hs = [];
    const cols = 4, rows = 3;
    const w = Math.floor(this.gridW / (cols + 1));   // немного воздуха
    const h = Math.floor(this.gridH / (rows + 1));
    let id = 101;
    for(let r=0; r<rows; r++){
      for(let c=0; c<cols; c++){
        const x = 6 + c*(w+4);
        const y = 6 + r*(h+3);
        const poly = [
          [x, y],
          [x+w, y],
          [x+w, y+h],
          [x, y+h]
        ];
        // базовый «offset» по дому для разнообразия
        const base = 20.6 + ((id%3)*0.12) + (this.rng(id)*0.08 - 0.04);
        hs.push({ id:`H-${id}`, name:`Дом ${id}`, poly, base });
        id++;
      }
    }
    return hs;
  }
  pointInPoly(px,py, poly){
    // классический ray-casting
    let inside = false;
    for(let i=0, j=poly.length-1; i<poly.length; j=i++){
      const xi=poly[i][0], yi=poly[i][1], xj=poly[j][0], yj=poly[j][1];
      const intersect = ((yi>py)!==(yj>py)) && (px < (xj-xi)*(py-yi)/(yj-yi)+xi);
      if(intersect) inside = !inside;
    }
    return inside;
  }

  // ========= time range helpers =========
  rangeToMs(r){
    const H=3600e3, D=24*H;
    if(r==='1h') return 1*H;
    if(r==='7d') return 7*D;
    return 1*D;
  }
  stepForRange(r){
    const MIN=60e3;
    if(r==='1h') return 30*1000;   // 30s
    if(r==='7d') return 30*MIN;    // 30m
    return 5*MIN;                  // 5m
  }

  // ========= O2 model =========
  o2AtTile(tMillis, gx, gy, houseBase=20.7){
    // дневная волна
    const day = 24*3600e3;
    const phase = Math.sin((tMillis % day)/day * Math.PI*2);
    // поле потоков
    const flow = this.flowField(gx,gy); // 0..1
    // локальный «дрейф»
    const drift = (flow-0.5)*0.25 + (this.rng(gx*9173 ^ gy*2273)*0.06 - 0.03);
    // время-зависимый шум
    const jitter = (this.rng(Math.floor(tMillis/60000) ^ (gx*131 + gy*911))) * 0.08 - 0.04;

    return houseBase + phase*0.06 + drift + jitter;
  }

  // собрать серию по дому (среднее по сэмплам внутри полигона)
  seriesForHouse(house, start, end, step){
    const pts = [];
    // берём сетку сэмплов 8x8 по дому
    const [x0,y0]=house.poly[0], [x1,y1]=house.poly[2];
    const sx = Math.max(1, Math.floor((x1-x0)/8));
    const sy = Math.max(1, Math.floor((y1-y0)/8));
    for(let t=start; t<=end; t+=step){
      let sum=0, n=0;
      for(let gx=x0; gx<=x1; gx+=sx){
        for(let gy=y0; gy<=y1; gy+=sy){
          if(this.pointInPoly(gx+0.5,gy+0.5, house.poly)){
            sum += this.o2AtTile(t, gx, gy, house.base);
            n++;
          }
        }
      }
      const v = n? (sum/n) : house.base;
      pts.push({ t, value: Number(v.toFixed(3)) });
    }
    return pts;
  }

  // добавить инциденты (дипы) как лог
  detectIncidents(series){
    const inc=[];
    for(let i=0;i<series.length;i++){
      const {t,value}=series[i];
      if(value < this.thresholds.critical){
        inc.push({ts:t, severity:'critical', message:'Падение O₂ ниже критического порога'});
      } else if(value < this.thresholds.warning){
        inc.push({ts:t, severity:'warning', message:'Снижение O₂ ниже нормы'});
      }
    }
    return inc;
  }

  // ========= charts =========
  buildCharts(){
    Chart.register(window['chartjs-plugin-annotation']);
    const fmtTime = ts => {
      const d=new Date(ts);
      return d.toLocaleString([], { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    };

    const line = new Chart(this.chartNodes.line.getContext('2d'), {
      type:'line',
      data:{ labels:[], datasets:[{
        label:'O₂, %',
        data:[],
        borderWidth:2,
        borderColor:'#3b82f6',
        pointRadius:0,
        tension:.25,
        fill:true,
        backgroundColor:(ctx)=>{
          const {chart} = ctx;
          const g = chart.ctx.createLinearGradient(0,0,0,chart.height);
          g.addColorStop(0,'rgba(59,130,246,.35)');
          g.addColorStop(1,'rgba(59,130,246,0)');
          return g;
        }
      }]},
      options:{
        responsive:true,
        maintainAspectRatio:false,
        scales:{
          y:{ min:17, max:23, grid:{color:'#182233'}, ticks:{color:'#9fb3d8'} },
          x:{ grid:{color:'#182233'}, ticks:{color:'#9fb3d8', maxRotation:0, autoSkip:true} }
        },
        plugins:{
          legend:{display:false},
          tooltip:{callbacks:{label:(ctx)=>`${ctx.formattedValue} %`}},
          annotation:{
            annotations:{
              warn:{ type:'line', yMin:this.thresholds.warning, yMax:this.thresholds.warning, borderColor:'#f59e0b', borderDash:[4,4] },
              crit:{ type:'line', yMin:this.thresholds.critical, yMax:this.thresholds.critical, borderColor:'#ef4444', borderDash:[4,4] },
              top: { type:'line', yMin:this.thresholds.upper,    yMax:this.thresholds.upper,    borderColor:'#94a3b8', borderDash:[2,4] },
            }
          }
        }
      }
    });

    const pie = new Chart(this.chartNodes.pie.getContext('2d'), {
      type:'doughnut',
      data:{ labels:['O₂','Дефицит/избыток'], datasets:[{ data:[50,50], backgroundColor:['#10b981','#223047'], borderWidth:0 }]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} } }
    });

    line._fmtTime = fmtTime;
    return { line, pie };
  }

  updateCharts(){
    const { line, pie } = this._charts;
    const s = this.series;

    line.data.labels = s.map(p => line._fmtTime(p.t));
    line.data.datasets[0].data = s.map(p => p.value);
    // обновить пороги
    line.options.plugins.annotation.annotations.warn.yMin =
    line.options.plugins.annotation.annotations.warn.yMax = this.thresholds.warning;
    line.options.plugins.annotation.annotations.crit.yMin =
    line.options.plugins.annotation.annotations.crit.yMax = this.thresholds.critical;
    line.options.plugins.annotation.annotations.top.yMin  =
    line.options.plugins.annotation.annotations.top.yMax  = this.thresholds.upper;
    line.update('none');

    // нормализация для пончика
    const v = s.length ? s[s.length-1].value : 0;
    const norm = Math.max(0, Math.min(1, (v - this.thresholds.critical) / (this.thresholds.upper - this.thresholds.critical)));
    pie.data.datasets[0].data = [Math.round(norm*100), 100-Math.round(norm*100)];
    pie.update('none');

    // KPI
    const vals = s.map(p=>p.value);
    const min = Math.min(...vals), max = Math.max(...vals), last = vals.at(-1);
    const below = vals.filter(x=>x<19.5).length;
    this.kpis.last.textContent = last?.toFixed(3) ?? '—';
    this.kpis.min .textContent = isFinite(min)? min.toFixed(3):'—';
    this.kpis.max .textContent = isFinite(max)? max.toFixed(3):'—';
    this.kpis.brk .textContent = below;
  }

  // ========= logs =========
  buildLogs(){
    this.logs = this.detectIncidents(this.series).concat(
      this.series.filter((_,i)=>i%40===0).map((p,i)=>({ ts:p.t, severity:'info', message:`Датчик O₂: ${p.value.toFixed(2)}%` }))
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

  // ========= series rebuild on selection/range =========
  setRange(r){
    this.range = r;
    this.rebuildSeries();
    this.buildLogs();
    this.updateCharts();
  }
  setLive(v){
    this.live = v;
  }
  rebuildSeries(){
    const now = Date.now();
    const span = this.rangeToMs(this.range);
    const step = this.stepForRange(this.range);
    this.series = this.seriesForHouse(this.selectedHouse, now - span, now, step);
    this.updateCharts();
    this.redraw();
  }

  // ========= map drawing =========
  redraw(){
    const ctx = this.ctx;
    this.clear();

    // фон сетки (тонкая)
    ctx.save();
    ctx.strokeStyle = '#122035';
    ctx.lineWidth = 1;
    const px = (x)=> this.padding + x*this.scaleX;
    const py = (y)=> this.padding + y*this.scaleY;

    // заливка «плитками» по текущему моменту
    const now = Date.now();
    for(let gy=0; gy<this.gridH; gy++){
      for(let gx=0; gx<this.gridW; gx++){
        // к какому дому принадлежит?
        const house = this.houses.find(h => this.pointInPoly(gx+0.5, gy+0.5, h.poly));
        const base = house? house.base : 20.7;
        const v = this.o2AtTile(now, gx, gy, base);
        ctx.fillStyle = this.valueToColor(v);
        const x = px(gx), y = py(gy);
        ctx.fillRect(x, y, this.scaleX-0.6, this.scaleY-0.6);
      }
    }

    // контуры домов
    for(const h of this.houses){
      ctx.beginPath();
      const [x0,y0]=h.poly[0];
      ctx.moveTo(px(x0),py(y0));
      for(let i=1;i<h.poly.length;i++){
        const [x,y]=h.poly[i];
        ctx.lineTo(px(x),py(y));
      }
      ctx.closePath();
      ctx.lineWidth = (h===this.selectedHouse)? 3: 1.5;
      ctx.strokeStyle = (h===this.selectedHouse)? '#e5e7eb' : '#6b7280';
      ctx.stroke();

      // подпись
      ctx.fillStyle = '#e5e7eb';
      ctx.font = '12px system-ui';
      const [ax,ay]=h.poly[0];
      ctx.fillText(h.name, px(ax)+6, py(ay)+14);
    }

    ctx.restore();
  }
  clear(){
    const ctx=this.ctx;
    ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
  }
  valueToColor(v){
    if(v < this.thresholds.critical) return '#ef4444';
    if(v < this.thresholds.warning)  return '#f59e0b';
    if(v <= this.thresholds.upper)   return '#10b981';
    return '#3b82f6';
  }

  // ========= pointer / tooltip / selection =========
  bindPointer(){
    const rect = ()=> this.canvas.getBoundingClientRect();
    const px = x => Math.floor((x - this.padding*(window.devicePixelRatio||1)) / this.scaleX);
    const py = y => Math.floor((y - this.padding*(window.devicePixelRatio||1)) / this.scaleY);

    this.canvas.addEventListener('mousemove', e=>{
      const r = rect();
      const cx = (e.clientX - r.left) * (window.devicePixelRatio||1);
      const cy = (e.clientY - r.top)  * (window.devicePixelRatio||1);
      const gx = Math.max(0, Math.min(this.gridW-1, px(cx)));
      const gy = Math.max(0, Math.min(this.gridH-1, py(cy)));

      const house = this.houses.find(h => this.pointInPoly(gx+0.5, gy+0.5, h.poly));
      const base = house? house.base : 20.7;
      const v = this.o2AtTile(Date.now(), gx, gy, base);

      this.tooltip.style.display = 'block';
      this.tooltip.innerHTML = `
        <div><strong>${house?house.name:'Вне дома'}</strong></div>
        <div class="muted">(${gx}, ${gy})</div>
        <div>O₂: <b>${v.toFixed(3)}%</b></div>
      `;
      this.tooltip.style.left = (e.pageX + 14) + 'px';
      this.tooltip.style.top  = (e.pageY + 14) + 'px';
    });
    this.canvas.addEventListener('mouseleave', ()=>{ this.tooltip.style.display='none'; });

    this.canvas.addEventListener('click', e=>{
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

    window.addEventListener('resize', ()=>{
      this.resizeCanvas();
      this.redraw();
    });
  }

  // ========= live ticking =========
  start(){
    const tick = ()=>{
      if(this.live){
        // прокрутка серии на 1 шаг времени для плавности
        const lastT = this.series.at(-1)?.t ?? Date.now();
        const step = this.stepForRange(this.range);
        const nextT = lastT + Math.max(step/6, 5000); // чуть чаще, чем шаг выборки
        const s2 = this.series.slice(1);
        const pt = this.seriesForHouse(this.selectedHouse, nextT, nextT, step)[0];
        s2.push(pt);
        this.series = s2;
        this.updateCharts();
        this.redraw();
      }
      this._raf = requestAnimationFrame(tick);
    };
    tick();
  }
}
