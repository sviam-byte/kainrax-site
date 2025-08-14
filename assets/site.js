// Тема: dark → light → cringe (по кнопке и клавише "T")
(function () {
  var key = 'theme', root = document.documentElement;
  var saved = localStorage.getItem(key) || 'dark'; apply(saved);

  document.addEventListener('keyup', function (e) {
    var k = (e && e.key) ? String(e.key).toLowerCase() : '';
    if (k === 't') cycle();
  });

  var toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.addEventListener('click', cycle);

  function cycle() {
    var order = ['dark','light','cringe'];
    var cur = localStorage.getItem(key) || 'dark';
    var idx = order.indexOf(cur);
    var next = order[(idx === -1 ? 0 : (idx + 1) % order.length)];
    apply(next);
  }

  function apply(t) {
    root.classList.remove('theme-dark','theme-light','theme-cringe');
    root.classList.add('theme-' + t);
    // для совместимости с кодом, который смотрит на data-theme
    root.setAttribute('data-theme', t);
    localStorage.setItem(key, t);
  }
})();

// Plausible только на проде
(function () {
  var PROD = ['kainrax.netlify.app'];
  if (PROD.indexOf(location.hostname) !== -1) {
    var s = document.createElement('script');
    s.defer = true;
    s.setAttribute('data-domain','kainrax.netlify.app');
    s.src = 'https://plausible.io/js/script.js';
    document.head.appendChild(s);
  }
})();

// Хелпер лор-даты
window.formatLoreDate = function (s) {
  if (!s) return '';
  var parts = String(s).split('-');
  var Y = +parts[0] || 0;
  var M = +parts[1] || 0;
  var D = +parts[2] || 0;
  if (!Y) return s;
  if (!M) return (D ? (D + '-й день ' + Y + '-го года') : (Y + '-й год'));
  if (!D) return (M + '-й месяц ' + Y + '-го года');
  return (D + '-й день ' + M + '-го месяца ' + Y + '-го года');
};

// Счётчик просмотров (наш Netlify Function) — без ?. и ??
window.hit = function (slug, outEl) {
  if (typeof fetch !== 'function') {
    if (outEl) outEl.textContent = '—';
    return Promise.resolve();
  }
  return fetch('/.netlify/functions/hit', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ slug: slug })
  })
  .then(function (r) { return r.json(); })
  .then(function (j) {
    if (outEl) {
      outEl.textContent = (j && j.count != null) ? j.count : '—';
    }
  })
  .catch(function () {
    if (outEl) outEl.textContent = '—';
  });
};
