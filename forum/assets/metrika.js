// forum/assets/metrika.js
(function (w, d) {
  if (w.ym) return; // не грузим дважды
  // Заглушка ym до загрузки tag.js
  w.ym = function () { (w.ym.a = w.ym.a || []).push(arguments); };
  w.ym.l = Date.now();

  // Грузим официальный tag.js
  var s = d.createElement('script');
  s.async = 1;
  s.src = 'https://mc.yandex.ru/metrika/tag.js';
  (d.head || d.documentElement).appendChild(s);

  // Инициализация счётчика
  w.ym(103711087, 'init', {
    webvisor: true,
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true
  });
})(window, document);
