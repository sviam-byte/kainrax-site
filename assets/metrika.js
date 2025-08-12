// assets/metrika.js — ES5-совместимая версия
;(function () {
  var ID = 103716449;

  // какие домены считаем «боевыми»
  var HOST_OK =
    location.hostname === 'kainrax.site' ||
    location.hostname === 'www.kainrax.site' ||
    location.hostname === 'kainrax.netlify.app' ||
    /\.netlify\.app$/i.test(location.hostname); // предпросмотры

  // всегда делаем stub, чтобы ym существовал даже если дальше выйдем
  if (!window.ym) {
    window.ym = function () { (ym.a = ym.a || []).push(arguments); };
    ym.l = +new Date();
  }

  // быстрый флаг для проверки в консоли
  window.__ymStatus = HOST_OK ? 'prod-wait' : 'dev-stub';

  // на небоевых доменах ничего не грузим
  if (!HOST_OK) {
    try { console.debug('[metrika] dev stub only on', location.hostname); } catch (e) {}
    return;
  }

  // загрузка тега (без spread/includes)
  var hasTag = false;
  var i, s;
  for (i = 0; i < document.scripts.length; i++) {
    s = document.scripts[i];
    if (s && s.src && s.src.indexOf('mc.yandex.ru/metrika/tag.js') > -1) { hasTag = true; break; }
  }

  function boot() {
    var opts = {
      ssr: true, webvisor: true, clickmap: true, trackLinks: true,
      accurateTrackBounce: true, ecommerce: 'dataLayer'
    };
    ym(ID, 'init', opts);

    var last = location.href;
    function hit() {
      var href = location.href;
      ym(ID, 'hit', href, { referer: last, title: document.title });
      last = href;
    }
    hit();
    window.addEventListener('hashchange', hit);
    window.ymHit = hit; // ручной форс-хит, удобно в консоли
    window.__ymStatus = 'prod-inited';
  }

  if (!hasTag) {
    var tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://mc.yandex.ru/metrika/tag.js';
    tag.onload = boot;
    tag.onerror = function () { try { console.warn('[metrika] tag.js blocked/failed'); } catch(e){} };
    document.head.appendChild(tag);
  } else {
    boot();
  }
})();
