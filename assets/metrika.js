// assets/metrika.js
;(function () {
  const ID = 103716449;
  const PROD = ['kainrax.netlify.app', 'kainrax.site']; // свои домены сюда
  if (!PROD.includes(location.hostname)) return;        // не шумим на превью/локали

  // Лоадер + защита от двойной вставки
  if (!window.ym) {
    window.ym = function () { (ym.a = ym.a || []).push(arguments); };
    ym.l = +new Date();
  }
  if (![...document.scripts].some(s => s.src.includes('mc.yandex.ru/metrika/tag.js'))) {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://mc.yandex.ru/metrika/tag.js';
    document.head.appendChild(s);
  }

  const opts = {
    ssr: true, webvisor: true, clickmap: true, trackLinks: true,
    accurateTrackBounce: true, ecommerce: 'dataLayer'
  };

  let inited = false, last = location.href;
  function init() {
    if (inited) return; inited = true;
    ym(ID, 'init', opts);

    // первый хит и дальнейшие для SPA (hash-router)
    function hit() {
      const href = location.href;
      ym(ID, 'hit', href, { referer: last, title: document.title });
      last = href;
    }
    hit();
    addEventListener('hashchange', hit);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();
