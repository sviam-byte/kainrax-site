// D-7: дома строго «дом №…», парк подписан, труборouting с анимацией,
// модель O₂: снаружи 18–19, внутри ~19, A-категория 20–21.
// Режимы графиков устойчивые (пересоздание main при смене типа).

export class O2LogApp {
  constructor(opts){
    this.canvas = opts.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.tooltip = opts.tooltip;

    this.kpis = opts.kpis;
    this.chartNodes = opts.charts;
    this.logsTbody = opts.logsTbody;

    this.thresholds = opts.thresholds ?? { critical: 18.2, warning: 18.8, upper: 20.6 };
    this.range = opts.range ?? '24h';
    this.view  = opts.view  ?? 'o2';
    this.layers = opts.layers ?? { pipes:true, shafts:true, park:true, cannula:true };
    this.filter = opts.filter ?? 'all';

    // мир
    this.gridW = 180; this.gridH = 120;
    this.zoom = 1; this.offset = { x:0, y:0 };

    // генерация
    this.houses = this.generateHouses();
    this.actors = opts.actors || [];
    this.attachActors();

    // инфраструктура
    this.exchangeCore = { x: this.gridW/2, y: this.gridH/2, r: 7 };
    this.pipes = this.buildPipes();
    this.shafts = this.buildShafts();
    this.parkPoly = this.buildPark();

    // выбор
    this.selectedHouse = this.houses[0];

    // графики
    this._charts = this.initCharts();

    // размеры
    this.resizeCanvas();

    // интерактив
    this.bindPointer();

    // первые ряды/логи
    this.rebuildSeries();
    this.buildLogs();
  }

  // ---------- world/screen ----------
  worldToScreen(x,y){
    const r = Math.max(window.devicePixelRatio||1,1);
    return [
      (x*this.scaleX*this.zoom + this.offset.x) + this.padding*r,
      (y*this.scaleY*this.zoom + this.offset.y) + this.padding*r
    ];
  }
  screenToWorld(px,py){
    const r = Math.max(window.devicePixelRatio||1,1);
    return [
      (px - this.padding*r - this.offset.x) / (this.scaleX*this.zoom),
      (py - this.padding*r - this.offset.y) / (this.scaleY*this.zoom),
    ];
  }
  resizeCanvas(){
    this.padding = 6;
    const r = Math.max(window.devicePixelRatio||1,1);
    const cssW = Math.min(1100, this.canvas.clientWidth || 1100);
    const cssH = Math.round(cssW*0.64);
    this.canvas.style.height = cssH+'px';
    this.canvas.width = cssW*r; this.canvas.height = cssH*r;
    this.drawWidth = this.canvas.width - this.padding*2*r;
    this.drawHeight= this.canvas.height- this.padding*2*r;
    this.scaleX = this.drawWidth/this.gridW; this.scaleY = this.drawHeight/this.gridH;
  }
  resetView(){ this.zoom=1; this.offset={x:0,y:0}; this.redraw(); }

  // ---------- geometry ----------
  generateHouses(){
    const hs=[]; let id=101;
    const rings=[ {r:22,n:4}, {r:44,n:4}, {r:66,n:4} ];
    for(const ring of rings){
      for(let k=0;k<ring.n;k++){
        const ang = (Math.PI*2/ring.n)*k + (ring.r===22?0:Math.PI/ring.n);
        const cx = this.gridW/2 + Math.cos(ang)*ring.r;
        const cy = this.gridH/2 + Math.sin(ang)*ring.r*0.78;
        const w=18, h=12;
        const poly=[[cx-w/2,cy-h/2],[cx+w/2,cy-h/2],[cx+w/2,cy+h/2],[cx-w/2,cy+h/2]];
        hs.push({ id:`H-${id}`, name:`дом №${id}`, poly, baseAmbient:19.0, cannulaUpdated:true, aClass:false });
        id++;
      }
    }
    return hs;
  }
  attachActors(){
    // только две квартиры заселены персонажами
    for(const a of this.actors){
      const h=this.houses.find(x=>x.id===a.house);
      if(!h) continue;
      h.occupants = h.occupants||[];
      h.occupants.push(a);
      if(a.aClass) h.aClass=true;
      if(a.cannulaUpdated===false) h.cannulaUpdated=false;
    }
    // A-кат — поднять базу до 20.6, позволить колебаться до 21
    for(const h of this.houses){ if(h.aClass){ h.baseAmbient=20.6; } }
  }
  buildPipes(){
    // главная кольцевая + радиальные ветви от ядра
    const segs=[];
    for(const h of this.houses){
      const c=this.houseCenter(h);
      segs.push({ kind:'radial', from:{x:this.exchangeCore.x,y:this.exchangeCore.y}, to:c, houseId:h.id });
    }
    // кольцо вокруг ядра
    const ringR=18;
    const pts=[];
    for(let i=0;i<16;i++){
      const ang=i*Math.PI*2/16;
      pts.push({x:this.exchangeCore.x+Math.cos(ang)*ringR, y:this.exchangeCore.y+Math.sin(ang)*ringR});
    }
    for(let i=0;i<pts.length;i++){
      segs.push({ kind:'ring', from:pts[i], to:pts[(i+1)%pts.length], houseId:null });
    }
    return segs;
  }
  buildShafts(){
    const xs=[ this.gridW*0.25, this.gridW*0.5, this.gridW*0.75 ];
    return xs.map(x=>({ x, y0:this.gridH*0.1, y1:this.gridH*0.9 }));
  }
  buildPark(){
    const left=this.gridW*0.07, top=this.gridH*0.62, w=this.gridW*0.24, h=this.gridH*0.28;
    return [[left,top],[left+w,top],[left+w,top+h],[left,top+h]];
    // подпись парка нарисую при рендере
  }
  houseCenter(h){ const [x0,y0]=h.poly[0], [x2,y2]=h.poly[2]; return {x:(x0+x2)/2,y:(y0+y2)/2}; }
  pointInPoly(px,py,poly){ let inside=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const [xi,yi]=poly[i],[xj,yj]=poly[j]; const inter=((yi>py)!==(yj>py)) && (px < (xj-xi)*(py-yi)/(yj-yi)+xi); if(inter) inside=!inside; } return inside; }

  // ---------- time ----------
  rangeToMs(r){ const H=3600e3, D=24*H; if(r==='1h')return H; if(r==='7d')return 7*D; return D; }
  stepForRange(r){ const MIN=60e3; if(r==='1h')return 30e3; if(r==='7d')return 30*MIN; return 5*MIN; }
  seriesStep(){ return this.stepForRange(this.range); }

  // ---------- model ----------
  hash(n){ let t=n|0; t+=0x6D2B79F5; t=Math.imul(t^(t>>>15), t|1); t^=t+Math.imul(t^(t>>>7), t|61); return ((t^(t>>>14))>>>0)/4294967296; }
  o2AmbientAt(tMillis,x,y,base){
    // суточная волна и локальный дрейф
    const day=86400e3;
    const phase = Math.sin((tMillis%day)/day*Math.PI*2)*0.06;
    const drift = (this.hash(x*131+y*977)*0.08 - 0.04);
    // базовый уровень уже учитывает «внутри/А-кат»
    let v = base + phase + drift;
    // клауза «А-категория держится выше 20, до 21»
    if(base>=20.5) v = Math.min(21.0, Math.max(20.0, v + (this.hash(x*17+y*29)-0.5)*0.2));
    return v;
  }
  flowLpmAt(tMillis, house){
    const occ=(house.occupants||[]);
    const base=occ.reduce((s,o)=>s+(o.baseFlow||0),0);
    if(base<=0) return 0;
    const t=tMillis/1000;
    const adult=0.28 + (this.hash(house.id.length*71)*0.04);
    const child=0.42 + (this.hash(house.id.length*131)*0.05);
    const pulse=(f)=>{ const ph=(t*f)%1; return ph<0.12 ? Math.exp(-ph*16):0; };
    let mod=pulse(adult);
    if(occ.some(o=>o.doubleBreath)) mod+=pulse(child);
    const noise=(this.hash(Math.floor(t*5)+house.id.length)*0.06 - 0.03);
    return Math.max(0, base*(1+0.8*mod)+noise);
  }
  seriesForHouse(house, start, end, step){
    const o2=[], flow=[]; let liters=0;
    for(let t=start;t<=end;t+=step){
      // усредняем по площади
      const [x0,y0]=house.poly[0],[x2,y2]=house.poly[2];
      const sx=Math.max(1,Math.floor((x2-x0)/8)), sy=Math.max(1,Math.floor((y2-y0)/8));
      let sum=0, n=0;
      for(let gx=x0;gx<=x2;gx+=sx){ for(let gy=y0;gy<=y2;gy+=sy){
        if(this.pointInPoly(gx+0.5,gy+0.5,house.poly)){ sum+=this.o2AmbientAt(t,gx,gy,house.baseAmbient); n++; }
      } }
      const v=n?sum/n:house.baseAmbient;
      o2.push({t, value:Number(v.toFixed(3))});
      const lpm=this.flowLpmAt(t,house);
      flow.push({t, lpm});
      liters += lpm*(step/60000);
    }
    return { o2, flow, liters };
  }
  detectIncidents(series){
    const inc=[];
    for(const p of series){
      if(p.value < this.thresholds.critical) inc.push({ts:p.t, severity:'critical', message:'Падение O₂ ниже критического порога'});
      else if(p.value < this.thresholds.warning) inc.push({ts:p.t, severity:'warning', message:'Снижение O₂ ниже нормы'});
    }
    return inc;
  }

  // ---------- charts ----------
  initCharts(){
    Chart.register(window['chartjs-plugin-annotation']);
    const aux = new Chart(this.chartNodes.aux.getContext('2d'), {
      type:'line',
      data:{ labels:[], datasets:[] },
      options:{ responsive:true, maintainAspectRatio:false,
        scales:{ y:{ticks:{color:'#9fb3d8'}, grid:{color:'#182233'}}, x:{ticks:{color:'#9fb3d8',maxRotation:0}, grid:{color:'#182233'}}},
        plugins:{ legend:{labels:{color:'#cfe3ff'}} }
      }
    });
    // main создаётся динамически по типу
    const makeMain = (type='line')=>{
      const c = new Chart(this.chartNodes.main.getContext('2d'), {
        type,
        data:{ labels:[], datasets:[] },
        options:{ responsive:true, maintainAspectRatio:false,
          scales:{ y:{ticks:{color:'#9fb3d8'}, grid:{color:'#182233'}}, x:{ticks:{color:'#9fb3d8',maxRotation:0}, grid:{color:'#182233'}}},
          plugins:{ legend:{display:false},
            annotation:{ annotations:{
              warn:{type:'line',yMin:this.thresholds.warning,yMax:this.thresholds.warning,borderColor:'#f59e0b',borderDash:[4,4]},
              crit:{type:'line',yMin:this.thresholds.critical,yMax:this.thresholds.critical,borderColor:'#ef4444',borderDash:[4,4]},
              top :{type:'line',yMin:this.thresholds.upper,yMax:this.thresholds.upper,borderColor:'#94a3b8',borderDash:[2,4]},
            } }
          }
        }
      });
      return c;
    };
    return { main: makeMain('line'), aux, setTitle:(t)=>{ this.chartNodes.titleNode.textContent=t; }, makeMain };
  }
  destroyMain(){ if(this._charts.main){ this._charts.main.destroy(); } }
  setView(v){ this.view=v; // перестраиваем main при бар-режиме
    if(v==='spectrum'){ this.destroyMain(); this._charts.main = this._charts.makeMain('bar'); }
    else { this.destroyMain(); this._charts.main = this._charts.makeMain('line'); }
    this.updateCharts();
  }

  updateCharts(){
    const fmt = ts => new Date(ts).toLocaleString([], { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    const { main, aux, setTitle } = this._charts;

    if(this.view==='o2'){
      setTitle('Динамика O₂');
      main.options.scales.y.min=17; main.options.scales.y.max=21.2;
      main.data.labels=this.series.o2.map(p=>fmt(p.t));
      main.data.datasets=[{
        label:'O₂, %',
        data:this.series.o2.map(p=>p.value),
        borderColor:'#3b82f6', borderWidth:2, pointRadius:0, tension:.25,
        fill:true, backgroundColor:(ctx)=>{ const g=ctx.chart.ctx.createLinearGradient(0,0,0,ctx.chart.height); g.addColorStop(0,'rgba(59,130,246,.35)'); g.addColorStop(1,'rgba(59,130,246,0)'); return g; }
      }];
      // aux — расход RAW vs EMA
      const raw=this.series.flow.map(p=>p.lpm); const ema=this.ema(raw,0.2);
      aux.data.labels=this.series.flow.map(p=>fmt(p.t));
      aux.data.datasets=[
        { label:'расход RAW (л/мин)', data:raw, borderColor:'#f59e0b', pointRadius:0 },
        { label:'EMA(0.2)', data:ema, borderColor:'#10b981', pointRadius:0 },
      ];
      aux.update('none');
    }

    if(this.view==='rawema'){
      setTitle('RAW + EMA (расход, л/мин)');
      const raw=this.series.flow.map(p=>p.lpm); const ema=this.ema(raw,0.2);
      main.options.scales.y.min=0; main.options.scales.y.max=Math.max(1.5, Math.ceil(Math.max(...raw,...ema)));
      main.data.labels=this.series.flow.map(p=>fmt(p.t));
      main.data.datasets=[
        { label:'RAW', data:raw, borderColor:'#f59e0b', pointRadius:0 },
        { label:'EMA(0.2)', data:ema, borderColor:'#10b981', pointRadius:0 },
      ];
      // aux — «идеальный» 0.5
      aux.data.labels=this.series.flow.map(p=>fmt(p.t));
      aux.data.datasets=[ { label:'официальный «идеал»: 0.5 л/мин', data:raw.map(()=>0.5), borderColor:'#94a3b8', pointRadius:0 } ];
      aux.update('none');
    }

    if(this.view==='spectrum'){
      setTitle('Спектр расхода (двойной вдох)');
      const raw=this.series.flow.map(p=>p.lpm); const dt=this.seriesStep()/1000;
      const spec=this.dft(raw.slice(-512), dt);
      main.options.scales.y.min=0; main.options.scales.y.max=undefined;
      main.data.labels=spec.freq.map(f=>f.toFixed(2)+' Гц');
      main.data.datasets=[{ label:'амплитуда', data:spec.amp, backgroundColor:'#7de0ff' }];
      // aux пустой
      aux.data.labels=[]; aux.data.datasets=[]; aux.update('none');
    }

    // KPI
    const v = this.series.o2.map(p=>p.value);
    const min=Math.min(...v), max=Math.max(...v), last=v.at(-1);
    this.kpis.last.textContent=last?.toFixed(3)??'—';
    this.kpis.min.textContent=isFinite(min)?min.toFixed(3):'—';
    this.kpis.max.textContent=isFinite(max)?max.toFixed(3):'—';
    const flowNow=this.series.flow.at(-1)?.lpm??0;
    this.kpis.flow.textContent=flowNow.toFixed(2);
    this.kpis.liters.textContent=this.series.liters.toFixed(1);

    // пороги
    main.options.plugins.annotation.annotations.warn.yMin =
    main.options.plugins.annotation.annotations.warn.yMax = this.thresholds.warning;
    main.options.plugins.annotation.annotations.crit.yMin =
    main.options.plugins.annotation.annotations.crit.yMax = this.thresholds.critical;
    main.options.plugins.annotation.annotations.top.yMin  =
    main.options.plugins.annotation.annotations.top.yMax  = this.thresholds.upper;

    main.update('none');
  }
  ema(arr,a=0.2){ const out=[]; let prev=arr[0]??0; for(let i=0;i<arr.length;i++){ const v=a*arr[i]+(1-a)*prev; out.push(v); prev=v; } return out; }
  dft(samples,dt){ const N=samples.length,freq=[],amp=[],tw=2*Math.PI; for(let k=1;k<=Math.floor(N/2);k++){ let re=0,im=0; for(let n=0;n<N;n++){ const ang=tw*k*n/N; re+=samples[n]*Math.cos(ang); im-=samples[n]*Math.sin(ang);} re/=N; im/=N; freq.push(k/(N*dt)); amp.push(Math.hypot(re,im)); } return {freq,amp}; }

  // ---------- logs ----------
  buildLogs(){
    const perHouse=(h)=>{
      const inc=this.detectIncidents(this.seriesMap[h.id].o2);
      const L=[];
      if(h.occupants?.length){
        for(const o of h.occupants){
          if(o.id==='freydi_a_pediatric_a_class') L.push({ ts:Date.now()-20*3600e3, severity:'info', who:'Фрейди', house:h.name, message:'Пост: сатурация падает, расход вырос. Запуск арки.'});
          if(o.id==='molot_trainee') L.push({ ts:Date.now()-18*3600e3, severity:'info', who:'molot-trainee', house:h.name, message:'Провёл физический замер расхода. Ночные пики подтверждены.'});
          if(o.id==='father_of_twins_b7') L.push({ ts:Date.now()-16*3600e3, severity:'info', who:'Отец Близнецов', house:h.name, message:'Сообщил о «двойном вдохе» в D-7. Случай — системный.'});
          if(o.cannulaUpdated===false) L.push({ ts:Date.now()-6*3600e3,  severity:'warning', who:o.name, house:h.name, message:'Канюли просрочены, требуется замена'});
          else                         L.push({ ts:Date.now()-24*3600e3, severity:'info',    who:o.name, house:h.name, message:'Канюли обновлены'});
        }
      }
      return L.concat(inc.map(x=>({ ts:x.ts, severity:x.severity, who:(h.occupants?.[0]?.name)||h.name, house:h.name, message:x.message })));
    };
    let all=[]; for(const h of this.houses){ all=all.concat(perHouse(h)); }
    this.logs=all.sort((a,b)=>b.ts-a.ts);
    this.renderLogs(false);
  }
  renderLogs(showAll){
    const scope = showAll? this.logs : this.logs.filter(l=>this.selectedHouse.name===l.house);
    const tbody=this.logsTbody; tbody.innerHTML='';
    const fmt=ts=>new Date(ts).toLocaleString([], {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    for(const l of scope){
      const tr=document.createElement('tr');
      const badge=`<span class="badge ${l.severity==='critical'?'b-crit':l.severity==='warning'?'b-warn':'b-info'}">${l.severity}</span>`;
      tr.innerHTML=`<td>${fmt(l.ts)}</td><td>${l.house} — ${l.who||''}</td><td>${badge}</td><td>${l.message}</td>`;
      tbody.appendChild(tr);
    }
  }
  exportLogsCsv(){
    const rows=[['timestamp','house','who','severity','message']]
      .concat(this.logs.map(l=>[new Date(l.ts).toISOString(), l.house, l.who||'', l.severity, l.message.replace(/"/g,'""')]));
    const csv=rows.map(r=>r.map(v=>/[,"]/.test(v)?`"${v}"`:v).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='o2-logs-D7.csv';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  }

  // ---------- rebuild/update ----------
  setRange(r){ this.range=r; this.rebuildSeries(); this.buildLogs(); this.updateCharts(); }
  setFilter(f){ this.filter=f; this.redraw(); }
  setLive(v){ this.live=v; }

  rebuildSeries(){
    const now=Date.now(), span=this.rangeToMs(this.range), step=this.stepForRange(this.range);
    this.seriesMap={};
    for(const h of this.houses){ this.seriesMap[h.id]=this.seriesForHouse(h, now-span, now, step); }
    this.series={...this.seriesMap[this.selectedHouse.id]}; // копия выбранного
    this.updateCharts(); this.redraw();
  }

  // ---------- draw ----------
  polyPath(poly){ const ctx=this.ctx; const [sx0,sy0]=this.worldToScreen(poly[0][0],poly[0][1]); ctx.moveTo(sx0,sy0); for(let i=1;i<poly.length;i++){ const [sx,sy]=this.worldToScreen(poly[i][0],poly[i][1]); ctx.lineTo(sx,sy); } ctx.closePath(); }
  clear(){ this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height); }
  valueToColor(v){ if(v<this.thresholds.critical) return '#ef4444'; if(v<this.thresholds.warning) return '#f59e0b'; if(v<=this.thresholds.upper) return '#10b981'; return '#3b82f6'; }

  redraw(){
    const ctx=this.ctx; this.clear();
    const r = Math.max(window.devicePixelRatio||1,1);

    // плиточная заливка: вне домов 18–19, внутри обычных ~19, у А-кат — 20–21
    const now=Date.now();
    const tile=4;
    for(let gy=0;gy<=this.gridH;gy+=tile){
      for(let gx=0;gx<=this.gridW;gx+=tile){
        const inPark=this.pointInPoly(gx+tile/2,gy+tile/2,this.parkPoly);
        let color='#000';
        if(!inPark){
          const h=this.houses.find(hh=>this.pointInPoly(gx+1,gy+1,hh.poly));
          let base=18.6 + (this.hash(gx*311+gy*911)*0.3 - 0.15); // улица: 18–19
          if(h){ base = h.aClass? 20.6 : 19.0; }
          const v=this.o2AmbientAt(now,gx,gy,base);
          color=this.valueToColor(v);
        }
        const [sx,sy]=this.worldToScreen(gx,gy);
        const [sx2,sy2]=this.worldToScreen(gx+tile,gy+tile);
        ctx.fillStyle=color; ctx.fillRect(sx,sy,sx2-sx-0.6*r,sy2-sy-0.6*r);
      }
    }

    // парк — чёрный и с подписью
    if(this.layers.park){
      ctx.save();
      ctx.fillStyle='#000'; ctx.globalAlpha=0.96; ctx.beginPath(); this.polyPath(this.parkPoly); ctx.fill();
      ctx.globalAlpha=1; ctx.fillStyle='#a9b7d6'; ctx.font=`${14*r}px system-ui`;
      const [lx,ly]=this.worldToScreen(this.parkPoly[0][0]+4, this.parkPoly[0][1]+10);
      ctx.fillText('ПАРК D-7', lx, ly);
      ctx.restore();
    }

    // шахты
    if(this.layers.shafts){
      ctx.save(); ctx.fillStyle='#7f5af0'; ctx.globalAlpha=0.15;
      for(const s of this.shafts){ const [x0,y0]=this.worldToScreen(s.x, s.y0); const [x1,y1]=this.worldToScreen(s.x+3, s.y1); ctx.fillRect(x0,y0,x1-x0,y1-y0); }
      ctx.restore();
    }

    // трубы с анимацией штриха и стрелками
    if(this.layers.pipes){
      const t = (Date.now()/400)%20;
      ctx.save(); ctx.strokeStyle='#7de0ff'; ctx.lineCap='round';
      for(const seg of this.pipes){
        const flow = seg.houseId ? (this.seriesMap[seg.houseId]?.flow.at(-1)?.lpm ?? 0) : 0.7;
        ctx.lineWidth = Math.max(1, 1 + flow*1.2)*r;
        ctx.setLineDash([10*r,6*r]);
        ctx.lineDashOffset = -t*6*r; // движение
        const [x0,y0]=this.worldToScreen(seg.from.x,seg.from.y);
        const [x1,y1]=this.worldToScreen(seg.to.x,seg.to.y);
        ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();

        // стрелка у дома
        if(seg.houseId){
          const ang=Math.atan2(y1-y0,x1-x0);
          const size=6*r;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x1 - size*Math.cos(ang-Math.PI/6), y1 - size*Math.sin(ang-MATH_PI/6));
          ctx.lineTo(x1 - size*Math.cos(ang+Math.PI/6), y1 - size*Math.sin(ang+Math.PI/6));
          ctx.closePath();
          ctx.fillStyle='#7de0ff'; ctx.fill();

          // подпись потока около дома
          ctx.fillStyle='#8ecaff'; ctx.font=`${12*r}px system-ui`;
          ctx.fillText(`${flow.toFixed(2)} л/мин`, x1+6*r, y1-4*r);
        }
      }
      // ядро обмена
      const [cx,cy]=this.worldToScreen(this.exchangeCore.x,this.exchangeCore.y);
      ctx.setLineDash([]); ctx.fillStyle='#ffd86b'; ctx.beginPath(); ctx.arc(cx,cy, 7*r, 0, Math.PI*2); ctx.fill();
      ctx.font=`${12*r}px system-ui`; ctx.fillStyle='#2b2b12'; ctx.fillText('Ядро обмена D-7', cx+10*r, cy-10*r);
      ctx.restore();
    }

    // дома
    for(const h of this.houses){
      if(this.filter==='aclass' && !h.aClass) continue;
      if(this.filter==='nonaclass' && h.aClass) continue;

      ctx.beginPath(); this.polyPath(h.poly);
      ctx.lineWidth=(h===this.selectedHouse?3:1.5)*r;
      ctx.strokeStyle=(h===this.selectedHouse)?'#e5e7eb':'#6b7280'; ctx.stroke();

      // подпись строго «дом №…»
      ctx.fillStyle='#e5e7eb'; ctx.font=`${12*r}px system-ui`;
      const [ax,ay]=this.worldToScreen(h.poly[0][0], h.poly[0][1]); ctx.fillText(h.name, ax+6, ay+14);

      // маркеры A-кат и канюль
      if(this.layers.cannula){
        const c=this.houseCenter(h); const [sx,sy]=this.worldToScreen(c.x,c.y);
        if(h.aClass){ // «ЗДЕСЬ А-КАТЕГОРИЯ»
          ctx.fillStyle='#ffd86b'; ctx.font=`${12*r}px system-ui`; ctx.fillText('ЗДЕСЬ A-КАТЕГОРИЯ', sx-36*r, sy-12*r);
        }
        ctx.beginPath(); ctx.lineWidth=3*r; ctx.strokeStyle = h.cannulaUpdated? '#10b981': '#ef4444';
        ctx.arc(sx,sy,10*r,0,Math.PI*2); ctx.stroke();
      }
    }
  }

  // ---------- pointer/zoom ----------
  bindPointer(){
    const r=Math.max(window.devicePixelRatio||1,1);
    this.canvas.addEventListener('mousemove', e=>{
      const rect=this.canvas.getBoundingClientRect();
      const cx=(e.clientX-rect.left)*r, cy=(e.clientY-rect.top)*r;
      const [wx,wy]=this.screenToWorld(cx,cy);
      const h=this.houses.find(hh=>this.pointInPoly(wx,wy,hh.poly));
      const base = h? (h.aClass?20.6:19.0) : 18.7;
      const o2 = this.o2AmbientAt(Date.now(), wx, wy, base);

      let t=`<div><strong>${h?h.name:'вне дома'}</strong></div>`;
      t+=`<div class="muted">(${wx.toFixed(1)}, ${wy.toFixed(1)})</div>`;
      t+=`<div>O₂: <b>${o2.toFixed(3)}%</b></div>`;
      if(h){
        const flow=this.seriesMap[h.id]?.flow.at(-1)?.lpm ?? 0;
        t+=`<div>Подача: <b>${flow.toFixed(2)} л/мин</b>${h.aClass?' · A-кат.':''}</div>`;
        t+=`<div>Канюли: <b>${h.cannulaUpdated?'обновлены':'не обновлены'}</b></div>`;
      }
      this.tooltip.style.display='block'; this.tooltip.innerHTML=t;
      this.tooltip.style.left=(e.pageX+14)+'px'; this.tooltip.style.top=(e.pageY+14)+'px';
    });
    this.canvas.addEventListener('mouseleave', ()=>{ this.tooltip.style.display='none'; });

    this.canvas.addEventListener('click', e=>{
      const rect=this.canvas.getBoundingClientRect(); const cx=(e.clientX-rect.left)*r, cy=(e.clientY-rect.top)*r;
      const [wx,wy]=this.screenToWorld(cx,cy);
      const h=this.houses.find(hh=>this.pointInPoly(wx,wy,hh.poly));
      if(h){ this.selectedHouse=h; this.series={...this.seriesMap[h.id]}; this.updateCharts(); this.renderLogs(false); this.redraw(); }
    });

    // zoom
    this.canvas.addEventListener('wheel', e=>{
      e.preventDefault();
      const rect=this.canvas.getBoundingClientRect();
      const cx=(e.clientX-rect.left)*r, cy=(e.clientY-rect.top)*r;
      const [wx,wy]=this.screenToWorld(cx,cy);
      const scale=Math.exp(-e.deltaY*0.001);
      const newZoom=Math.max(0.6, Math.min(3.0, this.zoom*scale));
      const [sx,sy]=this.worldToScreen(wx,wy);
      this.zoom=newZoom;
      const [sx2,sy2]=this.worldToScreen(wx,wy);
      this.offset.x += (sx - sx2); this.offset.y += (sy - sy2);
      this.redraw();
    }, {passive:false});

    // pan
    let drag=false,last={x:0,y:0};
    this.canvas.addEventListener('mousedown', e=>{ drag=true; last={x:e.clientX,y:e.clientY}; });
    window.addEventListener('mouseup', ()=>drag=false);
    window.addEventListener('mousemove', e=>{
      if(!drag) return;
      this.offset.x += (e.clientX-last.x)*r; this.offset.y += (e.clientY-last.y)*r; last={x:e.clientX,y:e.clientY}; this.redraw();
    });

    window.addEventListener('resize', ()=>{ this.resizeCanvas(); this.redraw(); });
  }

  // ---------- live ----------
  setLive(v){ this.live=v; }
  start(){
    const tick=()=>{
      if(this.live){
        const step=this.stepForRange(this.range), adv=Math.max(step/6,5000);
        for(const h of this.houses){
          const s=this.seriesMap[h.id];
          const nextT=s.o2.at(-1).t+adv;
          const add=this.seriesForHouse(h,nextT,nextT,step);
          s.o2.push(add.o2[0]); s.o2.shift();
          s.flow.push(add.flow[0]); s.flow.shift();
          s.liters += add.liters;
        }
        const ss=this.seriesMap[this.selectedHouse.id];
        this.series={ o2:[...ss.o2], flow:[...ss.flow], liters:ss.liters };
        this.updateCharts(); this.redraw();
      }
      this._raf=requestAnimationFrame(tick);
    };
    tick();
  }
}
