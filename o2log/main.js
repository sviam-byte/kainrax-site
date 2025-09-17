import { O2LogApp } from './O2LogApp.js';

const $ = sel => document.querySelector(sel);
const els = {
  canvas:   $('#map'),
  tooltip:  $('#tooltip'),

  rangeSel: $('#rangeSel'),
  liveChk:  $('#liveChk'),
  showPipes: $('#showPipes'),
  showPark: $('#showPark'),
  showRisers: $('#showRisers'),
  onlyCannula: $('#onlyCannula'),

  crit:     $('#critSlider'),
  warn:     $('#warnSlider'),
  top:      $('#topSlider'),
  thVals:   $('#thVals'),

  metricSeg: $('#metricSeg'),
  modeSeg:   $('#modeSeg'),

  kName: $('#k-name'),
  kLast: $('#k-last'),
  kFlow: $('#k-flow'),
  kBrk : $('#k-brk'),

  chartMain: $('#chartMain'),
  chartAux:  $('#chartAux'),
  logTable:  $('#logTable tbody'),
  btnExport: $('#btnExport'),
  chartTitle: $('#chartTitle'),
};

const app = new O2LogApp({
  canvas: els.canvas,
  tooltip: els.tooltip,
  kpis: { name: els.kName, last: els.kLast, flow: els.kFlow, brk: els.kBrk },
  charts: { main: els.chartMain, aux: els.chartAux, titleNode: els.chartTitle },
  logsTbody: els.logTable,
  thresholds: { critical: Number(els.crit.value), warning: Number(els.warn.value), upper: Number(els.top.value) },
  range: els.rangeSel.value,
  view: { pipes:true, park:true, risers:false, onlyCannula:false },
  graph: { metric:'o2', mode:'raw' }
});

// controls
function renderThVals(){
  els.thVals.textContent = `(${app.thresholds.critical.toFixed(2)} / ${app.thresholds.warning.toFixed(2)} / ${app.thresholds.upper.toFixed(2)} %)`;
}
renderThVals();

els.rangeSel.addEventListener('change', e => app.setRange(e.target.value));
els.liveChk.addEventListener('change', e => app.setLive(e.target.checked));
els.showPipes.addEventListener('change', e => { app.view.pipes = e.target.checked; app.redraw(); });
els.showPark.addEventListener('change', e => { app.view.park  = e.target.checked; app.redraw(); });
els.showRisers.addEventListener('change', e => { app.view.risers = e.target.checked; app.redraw(); });
els.onlyCannula.addEventListener('change', e => { app.view.onlyCannula = e.target.checked; app.filterHouses(); });

els.crit.addEventListener('input', () => { app.thresholds.critical = Math.min(Number(els.crit.value), app.thresholds.warning - 0.05); renderThVals(); app.redraw(); app.updateCharts(); });
els.warn.addEventListener('input', () => { app.thresholds.warning = Math.max(Number(els.warn.value), app.thresholds.critical + 0.05); renderThVals(); app.redraw(); app.updateCharts(); });
els.top .addEventListener('input', () => { app.thresholds.upper    = Number(els.top.value); renderThVals(); app.redraw(); app.updateCharts(); });

els.metricSeg.addEventListener('click', e=>{
  const btn = e.target.closest('button'); if(!btn) return;
  els.metricSeg.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  app.graph.metric = btn.dataset.metric; app.updateCharts(true);
});
els.modeSeg.addEventListener('click', e=>{
  const btn = e.target.closest('button'); if(!btn) return;
  els.modeSeg.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  app.graph.mode = btn.dataset.mode; app.updateCharts(true);
});

els.btnExport.addEventListener('click', () => app.exportLogsCsv());

// run
app.start();
