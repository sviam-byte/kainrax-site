import { O2LogApp } from './O2LogApp.js';
const $ = s => document.querySelector(s);

const els = {
  canvas: $('#map'), tooltip: $('#tooltip'),
  rangeSel: $('#rangeSel'), modeSel:  $('#modeSel'),
  houseFilter: $('#houseFilter'), logScope: $('#logScope'),
  liveChk:  $('#liveChk'), crit: $('#critSlider'), warn: $('#warnSlider'), top: $('#topSlider'), thVals: $('#thVals'),
  kLast: $('#k-last'), kMin: $('#k-min'), kMax: $('#k-max'), kBrk: $('#k-brk'), kFlow: $('#k-flow'),
  chartMain: $('#chartMain'), chartTitle: $('#chartTitle'),
  logTable: $('#logTable tbody'), btnExport: $('#btnExport'), explain: $('#explain'),
};

const app = new O2LogApp({
  canvas: els.canvas, tooltip: els.tooltip,
  kpis: { last: els.kLast, min: els.kMin, max: els.kMax, brk: els.kBrk, flow: els.kFlow },
  charts: { main: els.chartMain, titleNode: els.chartTitle },
  logsTbody: els.logTable, thresholds: { critical: +els.crit.value, warning: +els.warn.value, upper: +els.top.value },
  range: els.rangeSel.value, mode: els.modeSel.value, explainNode: els.explain,
  filters: { houses: 'all', logs: 'selected' }
});

function renderTh(){ els.thVals.textContent = `(${app.thresholds.critical.toFixed(2)} / ${app.thresholds.warning.toFixed(2)} / ${app.thresholds.upper.toFixed(2)} %)`; }
renderTh();

els.rangeSel.addEventListener('change', e => app.setRange(e.target.value));
els.modeSel .addEventListener('change', e => app.setMode(e.target.value));
els.houseFilter.addEventListener('change', e => app.setHouseFilter(e.target.value));
els.logScope.addEventListener('change', e => app.setLogScope(e.target.value));
els.liveChk.addEventListener('change', e => app.setLive(e.target.checked));

els.crit.addEventListener('input', ()=>{ app.thresholds.critical = Math.min(+els.crit.value, app.thresholds.warning-0.05); renderTh(); app.redraw(); app.updateCharts(); });
els.warn.addEventListener('input', ()=>{ app.thresholds.warning = Math.max(+els.warn.value, app.thresholds.critical+0.05); renderTh(); app.redraw(); app.updateCharts(); });
els.top .addEventListener('input', ()=>{ app.thresholds.upper    = +els.top.value; renderTh(); app.redraw(); app.updateCharts(); });

els.btnExport.addEventListener('click', () => app.exportLogsCsv());
app.start();
