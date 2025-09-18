import { O2LogApp } from './O2LogApp.js';

const $ = sel => document.querySelector(sel);
const els = {
  canvas:   $('#map'),
  tooltip:  $('#tooltip'),
  rangeSel: $('#rangeSel'),
  liveChk:  $('#liveChk'),
  crit:     $('#critSlider'),
  warn:     $('#warnSlider'),
  top:      $('#topSlider'),
  thVals:   $('#thVals'),
  pipes:    $('#togglePipes'),
  park:     $('#togglePark'),
  trees:    $('#toggleTrees'),
  ac:       $('#toggleAC'),
  cann:     $('#toggleCann'),

  kLast: $('#k-last'), kMin: $('#k-min'), kMax: $('#k-max'), kBrk: $('#k-brk'), kFlow: $('#k-flow'),
  chartMain: $('#chartMain'), chartPie: $('#chartPie'),
  chartTitle: $('#chartTitle'),
  logTable: $('#logTable tbody'),
  btnExport: $('#btnExport'),
  graphSel: $('#graphSel'),
};

const app = new O2LogApp({
  canvas: els.canvas,
  tooltip: els.tooltip,
  kpis: { last: els.kLast, min: els.kMin, max: els.kMax, brk: els.kBrk, flow: els.kFlow },
  charts: { main: els.chartMain, pie: els.chartPie, title: els.chartTitle },
  logsTbody: els.logTable,
  thresholds: { critical: Number(els.crit.value), warning: Number(els.warn.value), upper: Number(els.top.value) },
  range: els.rangeSel.value,
  overlays: { pipes: true, park: true, trees: true, ac: true, cann: true }
});

// controls
function renderThVals() {
  els.thVals.textContent =
    `(${app.thresholds.critical.toFixed(2)} / ${app.thresholds.warning.toFixed(2)} / ${app.thresholds.upper.toFixed(2)} %)`;
}
renderThVals();

els.rangeSel.addEventListener('change', e => app.setRange(e.target.value));
els.liveChk.addEventListener('change', e => app.setLive(e.target.checked));
els.graphSel.addEventListener('change', e => app.setGraphMode(e.target.value));

['crit','warn','top'].forEach(key=>{
  els[key].addEventListener('input', ()=>{
    app.thresholds.critical = Math.min(Number(els.crit.value), app.thresholds.warning - 0.05);
    app.thresholds.warning  = Math.max(Number(els.warn.value), app.thresholds.critical + 0.05);
    app.thresholds.upper    = Number(els.top.value);
    renderThVals();
    app.redraw(); app.updateCharts();
  });
});

els.pipes.addEventListener('change', e => { app.overlays.pipes = e.target.checked; app.redraw(); });
els.park .addEventListener('change', e => { app.overlays.park  = e.target.checked; app.redraw(); });
els.trees.addEventListener('change', e => { app.overlays.trees = e.target.checked; app.redraw(); });
els.ac   .addEventListener('change', e => { app.overlays.ac    = e.target.checked; app.redraw(); });
els.cann .addEventListener('change', e => { app.overlays.cann  = e.target.checked; app.redraw(); });

els.btnExport.addEventListener('click', () => app.exportLogsCsv());

// kick off
app.start();
