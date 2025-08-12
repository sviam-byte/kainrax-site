// /assets/metrika.js
;(function () {
  const ID = 103716449;

  // прод-домены; допускаем любые *.netlify.app (на случай алиаса/превью)
  const HOST_OK =
    ['kainrax.site', 'kainrax.netlify.app'].includes(location.hostname) ||
    /\.netlify\.app$/i.test(location.hostname);

  // всегда создаём stub, чтобы typeof ym === 'function' даже в dev
  if (!window.ym) {
    window.ym = function () { (ym.a = ym.a || []).push(arguments); };
    ym.l = +new Date();
  }

  // флажок для быстрой проверки в консоли
  window.__ymStatus = HOST_OK ? 'prod-wait' : 'dev-stub';

  if (!HOST_OK) {
    console.debug('[metrika] dev stub only on', location.hostname);
    return; // не грузим счётчик на неподходящих доменах
  }

  // защита от двойной вставки
  if (![...document.scripts].some(s => s.src.includes('mc.yandex.ru/metrika/tag.js'))) {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://mc.yandex.ru/metrika/tag.js';
    s.onload = boot;
    s.onerror = () => { console.warn('[metrika] tag.js blocked/failed'); };
    document.head.appendChild(s);
  } else {
    boot();
  }

  function boot () {
    if (window.__ymBooted) return;
    window.__ymBooted = true;

    const opts = {
      ssr: true, webvisor: true, clickmap: true, trackLinks: true,
      accurateTrackBounce: true, ecommerce: 'dataLayer'
    };

    try {
      ym(ID, 'init', opts);
      window.__ymStatus = 'prod-inited';
      console.debug('[metrika] inited on', location.hostname);
    } catch (e) {
      console.warn('[metrika] init error', e);
      return;
    }

    // первый хит + SPA-хиты по hashchange
    let last = document.referrer || location.href;
    function hit () {
      const href = location.href;
      try { ym(ID, 'hit', href, { referer: last, title: document.title }); }
      catch (_) {}
      last = href;
    }
    hit();
    addEventListener('hashchange', hit);

    // ручной тест: window.ymHit()
    window.ymHit = () => ym(ID, 'hit', location.href + '?manual=' + Date.now());
  }
})();
