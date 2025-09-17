<script>
(function(){
  const $ = sel => document.querySelector(sel);
  const els = {
    canvas:   $('#map'),
    tooltip:  $('#tooltip'),
    rangeSel: $('#rangeSel'),
    modeSel:  $('#modeSel'),
    filterSel:$('#filterSel'),
    logScopeSel:$('#logScopeSel'),
    liveChk:  $('#liveChk'),
    showPipes:$('#showPipes'),
    showPark: $('#showPark'),
    crit:     $('#critSlider'),
    warn:     $('#warnSlider'),
    top:      $('#topSlider'),
    thVals:   $('#thVals'),

    kHouse: $('#k-house'), kLast: $('#k-last'), kMin: $('#k-min'), kMax: $('#k-max'), kBrk: $('#k-brk'), kFlow: $('#k-flow'),
    chartMain: $('#chartMain'), chartTitle: $('#chartTitle'),
    logTable: $('#logTable tbody'),
    btnExport: $('#btnExport'),
    explain: $('#explain'),
  };

  const app = new window.O2LogApp({
    canvas: els.canvas,
    tooltip: els.tooltip,
    kpis: { house: els.kHouse, last: els.kLast, min: els.kMin, max: els.kMax, brk: els.kBrk, flow: els.kFlow },
    charts: { main: els.chartMain, titleNode: els.chartTitle },
    logsTbody: els.logTable,
    thresholds: { critical: Number(els.crit.value), warning: Number(els.warn.value), upper: Number(els.top.value) },
    range: els.rangeSel.value,
    mode:  els.modeSel.value,
    filter: els.filterSel.value,
    logScope: els.logScopeSel.value,
    explainNode: els.explain,
    layers: { pipes: els.showPipes.checked, park: els.showPark.checked }
  });

  function renderThVals() {
    els.thVals.textContent = `(${app.thresholds.critical.toFixed(2)} / ${app.thresholds.warning.toFixed(2)} / ${app.thresholds.upper.toFixed(2)} %)`;
  }
  renderThVals();

  els.rangeSel.addEventListener('change', e => app.setRange(e.target.value));
  els.modeSel .addEventListener('change', e => app.setMode(e.target.value));
  els.filterSel.addEventListener('change', e => app.setFilter(e.target.value));
  els.logScopeSel.addEventListener('change', e => app.setLogScope(e.target.value));
  els.liveChk.addEventListener('change', e => app.setLive(e.target.checked));
  els.showPipes.addEventListener('change', e => { app.layers.pipes=e.target.checked; app.redraw(); });
  els.showPark .addEventListener('change', e => { app.layers.park =e.target.checked; app.redraw(); });

  els.crit.addEventListener('input', () => { app.thresholds.critical = Math.min(Number(els.crit.value), app.thresholds.warning - 0.05); renderThVals(); app.redraw(); app.updateCharts(); });
  els.warn.addEventListener('input', () => { app.thresholds.warning = Math.max(Number(els.warn.value), app.thresholds.critical + 0.05); renderThVals(); app.redraw(); app.updateCharts(); });
  els.top .addEventListener('input', () => { app.thresholds.upper    = Number(els.top.value); renderThVals(); app.redraw(); app.updateCharts(); });

  els.btnExport.addEventListener('click', () => app.exportLogsCsv());

  // старт
  app.start();
})();
</script>
