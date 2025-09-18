import { O2LogApp } from './O2LogApp.js';

const $ = sel => document.querySelector(sel);
const els = {
  canvas:   $('#map'),
  tooltip:  $('#tooltip'),
  rangeSel: $('#rangeSel'),
  viewSel:  $('#viewSel'),
  filterSel:$('#filterSel'),
  liveChk:  $('#liveChk'),
  pipes:    $('#pipesChk'),
  shafts:   $('#shaftsChk'),
  park:     $('#parkChk'),
  cannula:  $('#cannulaChk'),
  reset:    $('#resetView'),

  crit:     $('#critSlider'),
  warn:     $('#warnSlider'),
  top:      $('#topSlider'),
  thVals:   $('#thVals'),

  kLast: $('#k-last'), kMin: $('#k-min'), kMax: $('#k-max'),
  kFlow: $('#k-flow'), kLiters: $('#k-liters'),
  chartMain: $('#chartMain'), chartAux: $('#chartAux'),
  chartTitle: $('#chartTitle'),

  logTable: $('#logTable tbody'),
  btnExport: $('#btnExport'),
  showAllLogs: $('#showAllLogs'),
};

// только два «населённых» дома: Фрейди (с отцом) и отец близнецов
const ACTORS = [
  { id:'freydi_a_pediatric_a_class', name:'Фрейди', house:'H-101', aClass:true, baseFlow:0.6, doubleBreath:false, cannulaUpdated:false },
  { id:'molot_trainee', name:'molot-trainee (отец Фрейди)', house:'H-101', aClass:true, baseFlow:0.0, doubleBreath:false, cannulaUpdated:false },
  { id:'father_of_twins_b7', name:'Отец Близнецов (B-7)', house:'H-103', aClass:false, baseFlow:0.4, doubleBreath:true, cannulaUpdated:true },
];

const app = new O2LogApp({
  canvas: els.canvas,
  tooltip: els.tooltip,
  kpis: { last: els.kLast, min: els.kMin, max: els.kMax, flow: els.kFlow, liters: els.kLiters },
  charts: { main: els.chartMain, aux: els.chartAux, titleNode: els.chartTitle },
  logsTbody: els.logTable,
  thresholds: { critical: Number(els.crit.value), warning: Number(els.warn.value), upper: Number(els.top.value) },
  range: els.rangeSel.value,
  view: els.viewSel.value,
  layers: { pipes:true, shafts:true, park:true, cannula:true },
  filter: 'all',
  actors: ACTORS
});

// controls
function renderThVals() {
  els.thVals.textContent =
    `(${app.thresholds.critical.toFixed(2)} / ${app.thresholds.warning.toFixed(2)} / ${app.thresholds.upper.toFixed(2)} %)`;
}
renderThVals();

els.rangeSel.addEventListener('change', e => app.setRange(e.target.value));
els.viewSel .addEventListener('change', e => app.setView(e.target.value));
els.filterSel.addEventListener('change', e => app.setFilter(e.target.value));
els.liveChk .addEventListener('change', e => app.setLive(e.target.checked));

els.pipes.addEventListener('change', ()=>{ app.layers.pipes = els.pipes.checked; app.redraw(); });
els.shafts.addEventListener('change', ()=>{ app.layers.shafts = els.shafts.checked; app.redraw(); });
els.park .addEventListener('change', ()=>{ app.layers.park = els.park.checked; app.redraw(); });
els.cannula.addEventListener('change', ()=>{ app.layers.cannula = els.cannula.checked; app.redraw(); });
els.reset.addEventListener('click', ()=>app.resetView());

els.crit.addEventListener('input', () => { app.thresholds.critical = Math.min(Number(els.crit.value), app.thresholds.warning - 0.05); renderThVals(); app.redraw(); app.updateCharts(); });
els.warn.addEventListener('input', () => { app.thresholds.warning = Math.max(Number(els.warn.value), app.thresholds.critical + 0.05); renderThVals(); app.redraw(); app.updateCharts(); });
els.top .addEventListener('input', () => { app.thresholds.upper    = Number(els.top.value); renderThVals(); app.redraw(); app.updateCharts(); });

els.btnExport.addEventListener('click', () => app.exportLogsCsv());
els.showAllLogs.addEventListener('change', () => app.renderLogs(els.showAllLogs.checked));

app.start();
