// O2LogApp.js — автономный виджет сектора D-7.
// Без ES-модулей, без сторонних плагинов. Экспортирует window.O2LogApp.

(function(){
  class O2LogApp {
    constructor(opts){
      // UI
      this.canvas = opts.canvas;
      this.ctx = this.canvas.getContext('2d');
      this.tooltip = opts.tooltip;
      this.kpis = opts.kpis;
      this.chartNode = opts.charts.main;
      this.chartTitleNode = opts.charts.titleNode;
      this.logsTbody = opts.logsTbody;
      this.explainNode = opts.explainNode;

      // Параметры
      this.thresholds = opts.thresholds ?? { critical: 17.0, warning: 18.5, upper: 20.3 };
      this.range = opts.range ?? '24h';
      this.mode  = opts.mode  ?? 'o2';
      this.filter= opts.filter ?? 'all';
      this.logScope = opts.logScope ?? 'selected';
      this.layers = opts.layers ?? { pipes:true, park:true };
      this.live = true;

      // Сетка мира
      this.gridW = 180; this.gridH = 110;
      this.padding = 6;

      // Видовая трансформация
      this.zoom = 1; this.panX = 0; this.panY = 0;

      // DPR-нормализация
      this.resizeCanvas();

      // Геометрия сектора
      this.core = { x: Math.floor(this.gridW*0.5), y: Math.floor(this.gridH*0.52), r: 10 };
      this.parkPoly = [ [10,78],[44,60],[60,70],[63,96],[28,100],[12,92] ]; // чёрный парк
      this.zeta9 = { x: this.gridW-38, y: 8, w: 32, h: 22 };               // Дзета-9

      // Домохозяйства
      this.houses = this.createHouses();

      // Трубная сеть
      this.network = this.createNetwork();

      // Выбранный
      this.selectedHouse = this.houses.find(h=>h.key==='freydi_block') || this.houses[0];
      this.selectedPipe = null;

      // RNG
      this.seed = 9001;

      // График
      this.chart = this.buildChart();

      // Ввод
      this.bindPointer();

      // Логи
      this.initLogs();

      // Данные
      this.rebuildSeries(); // в т.ч. генерит полную историю
    }

    /* ====================== РАЗМЕТКА / DPR ======================= */
    resizeCanvas(){
      const dpr = Math.max(window.devicePixelRatio||1,1);
      const rect = this.canvas.getBoundingClientRect();
      const cssW = rect.width || 960;
      const cssH = rect.height || Math.round(cssW*0.625);

      this.canvas.width  = Math.floor(cssW * dpr);
      this.canvas.height = Math.floor(cssH * dpr);
      this.ctx.setTransform(dpr,0,0,dpr,0,0);

      this.baseScaleX = (cssW - this.padding*2) / this.gridW;
      this.baseScaleY = (cssH - this.padding*2) / this.gridH;
      this.updateScale();
    }
    updateScale(){ this.scaleX = this.baseScaleX * this.zoom; this.scaleY = this.baseScaleY * this.zoom; }
    px(x){ return this.padding + this.panX + x*this.scaleX; }
    py(y){ return this.padding + this.panY + y*this.scaleY; }
    screenToGrid(cx,cy){
      const gx = (cx - this.padding - this.panX) / this.scaleX;
      const gy = (cy - this.padding - this.panY) / this.scaleY;
      return [gx, gy];
    }

    /* ====================== RNG / FIELD ========================== */
    rng(i){ let t=(i+this.seed)>>>0; t+=0x6D2B79F5; t=Math.imul(t^(t>>>15), t|1); t^=t+Math.imul(t^(t>>>7), t|61); return ((t^(t>>>14))>>>0)/4294967296; }
    valueNoise(x,y){
      const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi;
      const idx=(X,Y)=>this.rng((X*73856093)^(Y*19349663)),
            lerp=(a,b,t)=>a+(b-a)*t, fade=t=>t*t*(3-2*t);
      const v00=idx(xi,yi), v10=idx(xi+1,yi), v01=idx(xi,yi+1), v11=idx(xi+1,yi+1);
      const u=fade(xf), v=fade(yf); return lerp(lerp(v00,v10,u), lerp(v01,v11,u), v);
    }
    flowField(x,y){ return 0.6*this.valueNoise(x*0.08,y*0.08)+0.3*this.valueNoise(x*0.02+10,y*0.02-7)+0.1*this.valueNoise(x*0.16-3,y*0.16+5); }

    /* ====================== ГЕОМЕТРИЯ / ДОМА ===================== */
    createHouses(){
      const ringR=30, ring2=48;
      const blocks = [
        { key:'freydi_block', label:'Блок F-ка (семья)', occ:[{name:'Фрейди',a:true,dbl:true},{name:'molot-trainee'},{name:'мама Фрейди'}], cannula:false },
        { key:'father_of_twins_b7', label:'Отец Близнецов', occ:[{name:'father_of_twins_b7',dbl:true}], cannula:false },
        { key:'mother_kai_a_ped', label:'Мать Кай (A)', occ:[{name:'mother_kai_a_ped',a:true}], cannula:true },
        { key:'resp_ina', label:'resp_therapist_ina', occ:[{name:'resp_therapist_ina'}], cannula:true },
        { key:'stat_tom', label:'stat-modeler_tom', occ:[{name:'stat_modeler_tom'}], cannula:true },
        { key:'runner', label:'assi-the-runner_99', occ:[{name:'assi_the_runner_99'}], cannula:true },
        { key:'linus', label:'techie-linus', occ:[{name:'techie_linus'}], cannula:true },
        { key:'marta', label:'Марта · night-owl', occ:[{name:'night_owl_shift'}], cannula:true },
        { key:'deicide', label:'deicide-mentor', occ:[{name:'deicide_mentor'}], cannula:true },
        { key:'med7', label:'med-unit-7', occ:[{name:'med_unit_7'}], cannula:true },
        { key:'numer_1', label:'Нумер I-17', occ:[{name:'numer_i17'}], cannula:false },
        { key:'numer_2', label:'Нумер XII-44', occ:[{name:'numer_xii44',dbl:true}], cannula:false },
        { key:'random_b7', label:'Жилой B-7', occ:[{name:'b7_resident'}], cannula:false },
        { key:'craft_guild', label:'Сборщики клапанов', occ:[{name:'valve_guild'}], cannula:true },
        { key:'old_welder', label:'Старый сварщик', occ:[{name:'old_welder'}], cannula:false },
        { key:'quiet_block', label:'Тихий блок', occ:[{name:'quiet_blockers'}], cannula:true },
      ];
      const hs=[];
      for(let i=0;i<8;i++){
        const t=blocks[i], ang=(Math.PI*2)*(i/8)-Math.PI/2;
        const cx=this.core.x+Math.cos(ang)*ringR, cy=this.core.y+Math.sin(ang)*ringR;
        const w=10,h=8, poly=[[cx-w/2,cy-h/2],[cx+w/2,cy-h/2],[cx+w/2,cy+h/2],[cx-w/2,cy+h/2]];
        const base=(t.occ.some(o=>o.a)?20.0:18.6)+(this.rng(i)*0.12-0.06);
        hs.push({id:`H-${101+i}`,key:t.key,name:t.label,poly,base,aClass:t.occ.some(o=>o.a),doubleBreath:!!t.occ.some(o=>o.dbl),cannulaUpdated:!!t.cannula,occupants:t.occ});
      }
      for(let j=0;j<8;j++){
        const t=blocks[8+j], ang=(Math.PI*2)*(j/8)-Math.PI/2+Math.PI/8;
        const cx=this.core.x+Math.cos(ang)*ring2, cy=this.core.y+Math.sin(ang)*ring2;
        const w=10,h=8, poly=[[cx-w/2,cy-h/2],[cx+w/2,cy-h/2],[cx+w/2,cy+h/2],[cx-w/2,cy+h/2]];
        const base=(t.occ.some(o=>o.a)?20.0:18.4)+(this.rng(j+99)*0.12-0.06);
        hs.push({id:`H-${201+j}`,key:t.key,name:t.label,poly,base,aClass:t.occ.some(o=>o.a),doubleBreath:!!t.occ.some(o=>o.dbl),cannulaUpdated:!!t.cannula,occupants:t.occ});
      }
      return hs;
    }

    createNetwork(){
      const nodes=[], nId=(name,x,y)=>{const n={id:name,x,y};nodes.push(n);return n;};
      const core=nId('CORE',this.core.x,this.core.y),
            N=nId('J-N',this.core.x,this.core.y-16),
            S=nId('J-S',this.core.x,this.core.y+16),
            W=nId('J-W',this.core.x-16,this.core.y),
            E=nId('J-E',this.core.x+16,this.core.y);
      const edges=[], add=(from,to,cap,path)=>edges.push({from,to,cap,flow:0,path:path||[[from.x,from.y],[to.x,to.y]]});
      add(core,N,160); add(core,S,160); add(core,W,160); add(core,E,160);
      const juncs=[N,E,S,W,N,E,S,W, N,E,S,W,N,E,S,W];
      this.houses.forEach((h,i)=>{const j=juncs[i]; const cx=(h.poly[0][0]+h.poly[2][0])/2, cy=(h.poly[0][1]+h.poly[2][1])/2;
        const bend=[(j.x+cx)/2+(i%2?6:-6),(j.y+cy)/2+(i%3?-4:4)]; add(j,{x:cx,y:cy},60,[[j.x,j.y],bend,[cx,cy]]);});
      return {nodes,edges};
    }

    /* ====================== ВРЕМЯ ================================ */
    rangeToMs(r){ const H=3600e3, D=24*H; return r==='1h'?H: r==='7d'?7*D: D; }
    stepForRange(r){ return r==='1h'?10e3: r==='7d'?5*60e3: 60e3; }

    /* ====================== МОДЕЛЬ =============================== */
    demandLpm(t,house){
      let base=house.aClass?1.0:0.40; // A-кат ↑
      const hour=new Date(t).getHours(), night=(hour>=0&&hour<6)?0.22:0.04;
      const f1=1/30, f2=1/45, phi=(t/60000);
      let wave=0.16*Math.sin(2*Math.PI*f1*phi); if(house.doubleBreath) wave+=0.15*Math.sin(2*Math.PI*f2*phi+1.2);
      const leak=house.cannulaUpdated?0:0.08; const jitter=(this.rng(Math.floor(t/15000)^house.id.length)*0.08)-0.04;
      return Math.max(0, base+night+wave+leak+jitter);
    }
    o2Percent(t,gx,gy,base=18.6,house){
      const phase=Math.sin((t%(24*3600e3))/(24*3600e3)*Math.PI*2)*0.05;
      const flow=this.flowField(gx,gy)-0.5;
      const demand=house?this.demandLpm(t,house):0.4;
      const dip=-0.10*Math.tanh(demand/1.1);
      let env=base; if(!house){ env=18.1+flow*0.12+(this.rng(gx*777^gy*313)*0.14-0.07); if(gx>this.zeta9.x && gy<this.zeta9.y+this.zeta9.h) env-=0.4; }
      const jitter=(this.rng(Math.floor(t/60000)^(gx*131+gy*911))*0.05)-0.025;
      return env+phase+dip+jitter;
    }
    seriesForHouse(h,start,end,step){
      const pts=[], [x0,y0]=h.poly[0],[x2,y2]=h.poly[2]; const sx=Math.max(1,Math.floor((x2-x0)/8)), sy=Math.max(1,Math.floor((y2-y0)/8));
      for(let t=start;t<=end;t+=step){ let sum=0,n=0; for(let gx=x0;gx<=x2;gx+=sx){ for(let gy=y0;gy<=y2;gy+=sy){ sum+=this.o2Percent(t,gx,gy,h.base,h); n++; } }
        const o2=n?sum/n:h.base, flow=this.demandLpm(t,h); pts.push({t,o2:+o2.toFixed(3),flow:+flow.toFixed(3)}); }
      return pts;
    }
    ema(arr,a=0.15){ const out=[]; let s=arr[0]??0; for(let i=0;i<arr.length;i++){ s=a*arr[i]+(1-a)*s; out.push(s);} return out; }
    spectrumY(xs){ const N=xs.length, mean=xs.reduce((a,b)=>a+b,0)/N, x=xs.map(v=>v-mean), mags=[]; for(let k=1;k<=Math.floor(N/2);k++){let re=0,im=0;for(let n=0;n<N;n++){const ang=-2*Math.PI*k*n/N;re+=x[n]*Math.cos(ang);im+=x[n]*Math.sin(ang);}mags.push(Math.sqrt(re*re+im*im)/N);} return mags; }

    /* ====================== ЧАРТ ================================ */
    buildChart(){
      return new Chart(this.chartNode.getContext('2d'),{
        type:'line', data:{labels:[],datasets:[]},
        options:{
          responsive:true, maintainAspectRatio:false,
          scales:{ y:{grid:{color:'#182233'},ticks:{color:'#9fb3d8'}}, x:{grid:{color:'#182233'},ticks:{color:'#9fb3d8',maxRotation:0,autoSkip:true}} },
          plugins:{ legend:{labels:{color:'#cbd5e1'}}, tooltip:{callbacks:{label:(c)=>`${c.dataset.label}: ${c.formattedValue} ${c.dataset._unit||''}`}} }
        }
      });
    }
    updateCharts(){
      const s=this.series||[], fmt=ts=>new Date(ts).toLocaleString([], {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
      this.chart.data.labels=s.map(p=>fmt(p.t));
      const o2=s.map(p=>p.o2), flow=s.map(p=>p.flow), ema=this.ema(flow,0.15);

      const thresh=(lab,y,col,dash)=>({label:lab,data:this.chart.data.labels.map(()=>y),borderColor:col,borderDash:dash||[4,4],pointRadius:0,fill:false,tension:0});

      if(this.mode==='o2'){
        this.chartTitleNode.textContent=`${this.selectedHouse.name}: O₂%`;
        this.chart.options.scales.y.min=16; this.chart.options.scales.y.max=21.5;
        this.chart.data.datasets=[
          {label:'O₂',data:o2,borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,.25)',fill:true,pointRadius:0,tension:.25,_unit:'%'},
          thresh('предупр.',this.thresholds.warning,'#f59e0b'),
          thresh('крит.',this.thresholds.critical,'#ef4444'),
          thresh('верхн.',this.thresholds.upper,'#94a3b8',[2,4]),
        ];
      } else if(this.mode==='rawema'){
        this.chartTitleNode.textContent=`${this.selectedHouse.name}: RAW+EMA (л/мин)`;
        this.chart.options.scales.y.min=0; this.chart.options.scales.y.max=2.4;
        this.chart.data.datasets=[
          {label:'RAW',data:flow,borderColor:'#f97316',backgroundColor:'rgba(249,115,22,.15)',fill:true,pointRadius:0,tension:.15,_unit:'л/мин'},
          {label:'EMA(0.15)',data:ema,borderColor:'#10b981',pointRadius:0,tension:.2,_unit:'л/мин'},
        ];
      } else if(this.mode==='supply'){
        this.chartTitleNode.textContent=`${this.selectedHouse.name}: Подача (л/мин)`;
        this.chart.options.scales.y.min=0; this.chart.options.scales.y.max=2.4;
        this.chart.data.datasets=[{label:'Подача',data:flow,borderColor:'#a78bfa',backgroundColor:'rgba(167,139,250,.18)',fill:true,pointRadius:0,tension:.25,_unit:'л/мин'}];
      } else if(this.mode==='ideal'){
        this.chartTitleNode.textContent=`${this.selectedHouse.name}: «идеальный» график`;
        this.chart.options.scales.y.min=0; this.chart.options.scales.y.max=2.4;
        const ideal=this.chart.data.labels.map(()=>0.5);
        this.chart.data.datasets=[{label:'идеальный 0.5 л/мин',data:ideal,borderColor:'#9ca3af',pointRadius:0,tension:0,_unit:'л/мин'}];
      } else if(this.mode==='spectrum'){
        this.chartTitleNode.textContent=`${this.selectedHouse.name}: спектр`;
        const stepMin=Math.max(1,this.stepForRange(this.range)/60000);
        const mags=this.spectrumY(flow);
        const labels=mags.map((_,k)=>(((k+1)/(stepMin*(mags.length*2)))*60).toFixed(2));
        const prev=this.chart.config.type; this.chart.config.type='bar';
        this.chart.data.labels=labels; this.chart.data.datasets=[{label:'амплитуда',data:mags,backgroundColor:'#38bdf8'}];
        this.chart.update('none'); this.chart.config.type=prev; return;
      }
      this.chart.update('none');

      // KPI
      const min=o2.length?Math.min(...o2):NaN, max=o2.length?Math.max(...o2):NaN, last=o2.at(-1);
      const below=o2.filter(x=>x<18.5).length;
      if(this.kpis.house) this.kpis.house.textContent=this.selectedHouse.name||'—';
      this.kpis.last.textContent=isFinite(last)?last.toFixed(3):'—';
      this.kpis.min .textContent=isFinite(min)? min.toFixed(3):'—';
      this.kpis.max .textContent=isFinite(max)? max.toFixed(3):'—';
      this.kpis.brk .textContent=below;
      this.kpis.flow.textContent=(flow.at(-1)||0).toFixed(2);
    }

    setMode(m){ this.mode=m; this.updateCharts(); }
    setFilter(f){ this.filter=f; this.redraw(); }
    setLogScope(s){ this.logScope=s; this.renderLogs(); }
    setRange(r){ this.range=r; this.rebuildSeries(); }
    setLive(v){ this.live=v; }

    /* ====================== O2-LOG · ПОЛНЫЙ ====================== */
    initLogs(){
      this.houseLogs   = new Map();   // Map<house.id, Array<LogEntry>>
      this.lastSev     = new Map();   // Map<house.id, 'critical'|'warning'|null>
      this.lastInfoTs  = new Map();   // Map<house.id, number>
      this.dblLastTs   = new Map();   // Map<house.id, number>
      this.dblCooldown = 6*60*60*1000; // 6 часов тишины
    }
    rebuildGlobalLogs(){
      const now  = Date.now();
      const span = this.rangeToMs(this.range);
      const step = this.stepForRange(this.range);

      this.houseLogs.clear(); this.lastSev.clear(); this.lastInfoTs.clear();

      this.houses.forEach(h=>{
        const s = this.seriesForHouse(h, now - span, now, step);
        const arr = [];

        arr.push({ ts: now, house:h, who:this.who(h), severity: h.cannulaUpdated?'info':'warning',
                   message: h.cannulaUpdated?'Канюли обновлены':'Канюли НЕ обновлены' });
        if(h.aClass){
          arr.push({ ts: now, house:h, who:this.who(h), severity:'info',
                     message:'Пункт обмена: «идеальная кривая 0.5 л/мин подтверждена»' });
        }

        let lastSev = null, lastInfo = 0;
        for(const p of s){
          const sev = (p.o2 < this.thresholds.critical) ? 'critical'
                    : (p.o2 < this.thresholds.warning)  ? 'warning' : null;
          if(sev && sev !== lastSev){
            arr.push({ ts:p.t, house:h, who:this.who(h), severity:sev,
                       message: sev==='critical' ? 'Падение O₂ ниже критического'
                                                 : 'Снижение O₂ ниже нормы' });
          }
          lastSev = sev;

          if(p.t - lastInfo >= 5*60*1000){
            arr.push({ ts:p.t, house:h, who:this.who(h), severity:'info',
                       message:`O₂ ${p.o2.toFixed(2)}% · ${p.flow.toFixed(2)} л/мин` });
            lastInfo = p.t;
          }
        }

        if(this.detectDoubleBreathBySeries(s, step)){
          arr.push({ ts: now, house:h, who:this.who(h), severity:'info',
                     message:'Спектр: подтверждены два независимых ритма потребления («двойной вдох»)' });
          this.dblLastTs.set(h.id, now);
        }

        this.houseLogs.set(h.id, arr);
        this.lastSev.set(h.id, lastSev);
        this.lastInfoTs.set(h.id, lastInfo || (s.at(-1)?.t ?? now));
      });

      this.renderLogs();
    }
    detectDoubleBreathBySeries(series, stepMs){
      if(!series || series.length < 32) return false;
      const flows = series.map(p=>p.flow);
      const mags  = this.spectrumY(flows);
      const stepMin = Math.max(1, stepMs/60000);
      const N = flows.length;
      const freqPerBin = 1/(stepMin*(N*2)); // циклы/мин на бин
      const toBin = fph => { const fpm=fph/60; const k=Math.max(0,Math.min(mags.length-1,Math.round(fpm/freqPerBin)-1)); return k; };
      const k1 = toBin(2.0), k2 = toBin(1.333), a1=mags[k1]||0, a2=mags[k2]||0;
      const strong = Math.max(a1,a2) > 0.12, similar = (a2/a1 > 0.85 && a1/a2 > 0.85);
      return strong && similar;
    }
    buildLocalLogs(){ const id=this.selectedHouse.id; this.localLogs=(this.houseLogs.get(id)||[]).slice(); }
    getRowsForView(){
      const now=Date.now(), span=this.rangeToMs(this.range);
      let rows=[];
      if(this.logScope==='all'){ for(const arr of this.houseLogs.values()) rows=rows.concat(arr); }
      else { this.buildLocalLogs(); rows=this.localLogs; }
      return rows.filter(l=>l.ts >= now - span).sort((a,b)=>b.ts-a.ts);
    }
    renderLogs(){
      const tbody=this.logsTbody; tbody.innerHTML='';
      const rows=this.getRowsForView();
      const fmt=ts=>new Date(ts).toLocaleString([], {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
      for(const l of rows){
        const badge=`<span class="badge ${l.severity==='critical'?'b-crit':l.severity==='warning'?'b-warn':'b-info'}">${l.severity}</span>`;
        const tr=document.createElement('tr'); tr.innerHTML=`<td>${fmt(l.ts)}</td><td>${l.house.name}</td><td>${l.who}</td><td>${badge}</td><td>${l.message}</td>`;
        tbody.appendChild(tr);
      }
    }
    exportLogsCsv(){
      const rows=this.getRowsForView();
      const csvRows=[['timestamp','house','subject','severity','message']]
        .concat(rows.map(l=>[new Date(l.ts).toISOString(), l.house.name, this.who(l.house), l.severity, l.message.replace(/"/g,'""')]));
      const csv=csvRows.map(r=>r.map(v=>/[,"]/.test(v)?`"${v}"`:v).join(',')).join('\n');
      const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const a=document.createElement('a');
      a.href=URL.createObjectURL(blob); a.download=`o2-logs-${this.logScope}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    }
    appendLiveLogs(nextT){
      const step=this.stepMs || this.stepForRange(this.range);
      const span=this.rangeToMs(this.range);
      this.houses.forEach(h=>{
        const pt=this.seriesForHouse(h,nextT,nextT,step)[0];
        const arr=this.houseLogs.get(h.id)||[];

        const sev=(pt.o2<this.thresholds.critical)?'critical':(pt.o2<this.thresholds.warning)?'warning':null;
        const prev=this.lastSev.get(h.id)||null;
        if(sev && sev!==prev){
          arr.push({ ts:pt.t, house:h, who:this.who(h), severity:sev, message: sev==='critical'?'Падение O₂ ниже критического':'Снижение O₂ ниже нормы' });
        }
        this.lastSev.set(h.id,sev);

        const lastInfo=this.lastInfoTs.get(h.id)||0;
        if(pt.t - lastInfo >= 5*60*1000){
          arr.push({ ts:pt.t, house:h, who:this.who(h), severity:'info', message:`O₂ ${pt.o2.toFixed(2)}% · ${pt.flow.toFixed(2)} л/мин` });
          this.lastInfoTs.set(h.id,pt.t);
        }

        const lastDbl=this.dblLastTs.get(h.id)||0;
        if(pt.t - lastDbl >= this.dblCooldown){
          const s2=this.seriesForHouse(h, nextT - 2*60*60*1000, nextT, step); // 2 часа
          if(this.detectDoubleBreathBySeries(s2, step)){
            arr.push({ ts:pt.t, house:h, who:this.who(h), severity:'info',
                       message:'Спектр: подтверждены два независимых ритма потребления («двойной вдох»)' });
            this.dblLastTs.set(h.id, pt.t);
          }
        }

        const cutoff=nextT - span;
        while(arr.length && arr[0].ts < cutoff) arr.shift();

        this.houseLogs.set(h.id,arr);
      });
    }

    /* ====================== СЕТЬ / СЕРИИ ======================== */
    rebuildSeries(){
      const now=Date.now(), span=this.rangeToMs(this.range), step=this.stepForRange(this.range);
      this.stepMs=step;
      this.series=this.seriesForHouse(this.selectedHouse,now-span,now,step);
      this.updateNetworkFlows(now);
      this.rebuildGlobalLogs(); // полная регенерация истории (зависит от интервала)
      this.updateCharts(); this.redraw();
    }
    updateNetworkFlows(t){
      const flows=new Map(); for(let i=0;i<this.network.edges.length;i++) flows.set(i,0);
      this.houses.forEach((h,idx)=>{ const q=this.demandLpm(t,h); flows.set(4+idx,q); });
      const sum={ 'J-N':0,'J-S':0,'J-W':0,'J-E':0 }, juncs=['J-N','J-E','J-S','J-W','J-N','J-E','J-S','J-W','J-N','J-E','J-S','J-W','J-N','J-E','J-S','J-W'];
      this.houses.forEach((_,i)=>{ sum[juncs[i]] += flows.get(4+i); });
      const map0={0:'J-N',1:'J-S',2:'J-W',3:'J-E'}; for(let e=0;e<4;e++) flows.set(e, sum[map0[e]]);
      this.network.edges.forEach((e,idx)=> e.flow=flows.get(idx)||0);
      this.totalSupply=[...flows.values()].reduce((a,b)=>a+b,0);
    }

    /* ====================== РИСОВАНИЕ =========================== */
    redraw(){
      const ctx=this.ctx; ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
      const now=Date.now();
      const visible=this.houses.filter(h=> this.filter==='all' || (this.filter==='aclass'?h.aClass:!h.aClass));

      // мозаика
      for(let gy=0; gy<this.gridH; gy++){
        for(let gx=0; gx<this.gridW; gx++){
          const house=visible.find(h=>this.pointInPoly(gx+0.5,gy+0.5,h.poly));
          const base=house?house.base:18.3;
          const v=this.o2Percent(now,gx,gy,base,house);
          ctx.fillStyle=this.valueToColor(v);
          ctx.fillRect(this.px(gx), this.py(gy), this.scaleX-0.6, this.scaleY-0.6);
        }
      }

      if(this.layers.park) this.drawParkBlack();
      this.drawZeta9();
      if(this.layers.pipes) this.drawPipes();
      this.drawCore();
      this.drawHouses(visible);
    }
    drawParkBlack(){
      const ctx=this.ctx, p=this.parkPoly;
      ctx.fillStyle='#000'; ctx.strokeStyle='#000'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(this.px(p[0][0]),this.py(p[0][1])); for(let i=1;i<p.length;i++) ctx.lineTo(this.px(p[i][0]),this.py(p[i][1])); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#9fb3d8'; ctx.font='12px system-ui'; ctx.fillText('Парковая зона (мёртвая по O₂)', this.px(p[0][0])+6, this.py(p[0][1])+14);
    }
    drawZeta9(){
      const {x,y,w,h}=this.zeta9, ctx=this.ctx;
      ctx.fillStyle='rgba(59,130,246,.10)'; ctx.strokeStyle='#3b82f6'; ctx.lineWidth=1.5;
      ctx.fillRect(this.px(x),this.py(y), w*this.scaleX, h*this.scaleY);
      ctx.strokeRect(this.px(x),this.py(y), w*this.scaleX, h*this.scaleY);
      ctx.fillStyle='#9fb3d8'; ctx.font='12px system-ui'; ctx.fillText('Дзета-9 · законсервированный пояс', this.px(x)+6, this.py(y)+14);
    }
    drawCore(){
      const ctx=this.ctx; ctx.beginPath(); ctx.arc(this.px(this.core.x),this.py(this.core.y),10,0,Math.PI*2);
      ctx.fillStyle='#0b1320'; ctx.fill(); ctx.strokeStyle='#7de0ff'; ctx.lineWidth=2; ctx.stroke();
      ctx.fillStyle='#a9b7d6'; ctx.font='12px system-ui'; ctx.fillText(`Ядро · Σ ${this.totalSupply?.toFixed(2)||'—'} л/мин`, this.px(this.core.x)+14, this.py(this.core.y)+4);
    }
    drawHouses(hs){
      const ctx=this.ctx;
      for(const h of hs){
        ctx.beginPath(); const [x0,y0]=h.poly[0]; ctx.moveTo(this.px(x0),this.py(y0));
        for(let i=1;i<h.poly.length;i++){ const [x,y]=h.poly[i]; ctx.lineTo(this.px(x),this.py(y)); } ctx.closePath();
        ctx.lineWidth=(h===this.selectedHouse)?3:1.5; ctx.strokeStyle=h.aClass?'#60a5fa':(h===this.selectedHouse?'#e5e7eb':'#6b7280'); ctx.stroke();
        ctx.fillStyle=h.cannulaUpdated?'#22c55e':'#f59e0b'; ctx.fillRect(this.px(h.poly[0][0])+2,this.py(h.poly[0][1])+2,6,6);
        ctx.fillStyle='#e5e7eb'; ctx.font='12px system-ui'; const cx=(h.poly[0][0]+h.poly[2][0])/2, cy=h.poly[0][1]-0.6; ctx.fillText(h.name, this.px(cx)-20, this.py(cy));
      }
    }
    drawPipes(){
      const ctx=this.ctx;
      for(const e of this.network.edges){
        const cap=e.cap, q=e.flow||0, ratio=Math.min(1,q/cap), w=(2+5*ratio), col=q>cap?'#ef4444':(ratio>0.7?'#7dd3fc':'#93c5fd');
        ctx.lineWidth=w; ctx.strokeStyle=col; ctx.beginPath();
        const pts=e.path; ctx.moveTo(this.px(pts[0][0]),this.py(pts[0][1])); for(let i=1;i<pts.length;i++) ctx.lineTo(this.px(pts[i][0]),this.py(pts[i][1])); ctx.stroke();
        const a=pts[0], b=pts[pts.length-1], dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy), ux=dx/L, uy=dy/L, mx=(a[0]+b[0])/2, my=(a[1]+b[1])/2;
        ctx.beginPath(); ctx.moveTo(this.px(mx),this.py(my)); ctx.lineTo(this.px(mx-ux*1.2-uy*0.6),this.py(my-uy*1.2+ux*0.6)); ctx.lineTo(this.px(mx-ux*1.2+uy*0.6),this.py(my-uy*1.2-ux*0.6)); ctx.closePath(); ctx.fillStyle=col; ctx.fill();
        if(q>0.02){ ctx.fillStyle='#9fb3d8'; ctx.font='11px system-ui'; ctx.fillText(`${q.toFixed(2)} / ${cap} л/мин`, this.px(mx)+4, this.py(my)+12); }
      }
    }
    pointInPoly(px,py,poly){ let inside=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1]; const inter=((yi>py)!==(yj>py)) && (px<(xj-xi)*(py-yi)/(yj-yi)+xi); if(inter) inside=!inside; } return inside; }
    distPointToSeg(px,py,ax,ay,bx,by){ const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy))); const cx=ax+t*dx,cy=ay+t*dy; return Math.hypot(px-cx,py-cy); }

    /* ====================== ВВОД ================================ */
    bindPointer(){
      this.canvas.addEventListener('wheel', e=>{
        e.preventDefault();
        const factor=e.deltaY<0?1.1:0.9, rect=this.canvas.getBoundingClientRect();
        const cx=e.clientX-rect.left, cy=e.clientY-rect.top, [wx,wy]=this.screenToGrid(cx,cy);
        this.zoom=Math.min(4,Math.max(0.6,this.zoom*factor)); this.updateScale();
        this.panX=cx - this.padding - wx*this.scaleX; this.panY=cy - this.padding - wy*this.scaleY;
        this.redraw();
      }, {passive:false});

      let drag=false,lx=0,ly=0;
      this.canvas.addEventListener('mousedown', e=>{drag=true; lx=e.clientX; ly=e.clientY; this.canvas.style.cursor='grabbing';});
      window.addEventListener('mouseup', ()=>{drag=false; this.canvas.style.cursor='grab';});
      window.addEventListener('mousemove', e=>{ if(!drag) return; const dx=e.clientX-lx, dy=e.clientY-ly; lx=e.clientX; ly=e.clientY; this.panX+=dx; this.panY+=dy; this.redraw(); });

      this.canvas.addEventListener('mousemove', e=>{
        const rect=this.canvas.getBoundingClientRect(), cx=e.clientX-rect.left, cy=e.clientY-rect.top;
        const [gx,gy]=this.screenToGrid(cx,cy);

        let nearest=null,best=1e9;
        if(this.layers.pipes){
          this.network.edges.forEach(edge=>{ for(let i=0;i<edge.path.length-1;i++){ const a=edge.path[i],b=edge.path[i+1],d=this.distPointToSeg(gx,gy,a[0],a[1],b[0],b[1]); if(d<best){best=d; nearest=edge;} }});
        }
        const house=this.houses.find(h=>this.pointInPoly(gx+0.5,gy+0.5,h.poly));
        const showPipe=this.layers.pipes && nearest && best<1.3;

        if(showPipe){
          this.selectedPipe=nearest;
          this.tooltip.style.display='block';
          this.tooltip.innerHTML=`<div><strong>Трубопровод</strong></div><div class="muted">cap ${nearest.cap} л/мин</div><div>Поток: <b>${(nearest.flow||0).toFixed(2)} л/мин</b></div>`;
          this.tooltip.style.left=(e.pageX+14)+'px'; this.tooltip.style.top=(e.pageY+14)+'px'; return;
        } else this.selectedPipe=null;

        const base=house?house.base:18.3, v=this.o2Percent(Date.now(),gx,gy,base,house);
        this.tooltip.style.display='block';
        this.tooltip.innerHTML=`
          <div><strong>${house?house.name:'Вне дома'}</strong></div>
          ${house? `<div style="color:#a9b7d6">${house.aClass?'A-категория · ':''}${house.cannulaUpdated?'канюли обновлены':'канюли НЕ обновлены'}</div>`:''}
          <div style="color:#a9b7d6">(${Math.floor(gx)}, ${Math.floor(gy)})</div>
          <div>O₂: <b>${v.toFixed(3)}%</b></div>
          ${house? `<div>Подача: <b>${this.demandLpm(Date.now(),house).toFixed(2)} л/мин</b>${house.doubleBreath?' · «двойной вдох»':''}</div>`:''}
        `;
        this.tooltip.style.left=(e.pageX+14)+'px'; this.tooltip.style.top=(e.pageY+14)+'px';
      });
      this.canvas.addEventListener('mouseleave', ()=>{ this.tooltip.style.display='none'; });
      this.canvas.addEventListener('click', e=>{
        if(this.selectedPipe) return;
        const rect=this.canvas.getBoundingClientRect(), [gx,gy]=this.screenToGrid(e.clientX-rect.left,e.clientY-rect.top);
        const house=this.houses.find(h=>this.pointInPoly(gx+0.5,gy+0.5,h.poly));
        if(house){ this.selectedHouse=house; this.rebuildSeries(); this.renderLogs(); }
      });

      window.addEventListener('resize', ()=>{ this.resizeCanvas(); this.redraw(); });
    }

    valueToColor(v){ if(v<this.thresholds.critical) return '#ef4444'; if(v<this.thresholds.warning) return '#f59e0b'; if(v<=this.thresholds.upper) return '#10b981'; return '#3b82f6'; }
    who(h){ return h?.occupants?.[0]?.name || 'житель'; }

    /* ====================== LIVE ЦИКЛ =========================== */
    start(){
      const tick=()=>{
        if(this.live){
          const lastT=this.series.at(-1)?.t ?? Date.now();
          const step=this.stepMs || this.stepForRange(this.range);
          const nextT=lastT+Math.max(step/6,5000);

          // серия выбранного дома
          const s2=this.series.slice();
          const ptSel=this.seriesForHouse(this.selectedHouse,nextT,nextT,step)[0];
          s2.push(ptSel);
          const maxLen=Math.ceil(this.rangeToMs(this.range)/step)+2;
          while(s2.length>maxLen) s2.shift();
          this.series=s2;

          // сеть/логи
          this.appendLiveLogs(nextT);
          this.updateNetworkFlows(nextT);
          this.updateCharts();
          this.renderLogs();
          this.redraw();
        }
        requestAnimationFrame(tick);
      };
      tick();
    }
  }

  window.O2LogApp = O2LogApp;
})();
