// /assets/hide-head.js
(function(){
  const head = document.querySelector('.kx-head');
  if(!head) return;

  const root = document.documentElement;
  const body = document.body;

  // measure header height -> CSS var
  function measure(){
    const h = Math.ceil(head.getBoundingClientRect().height);
    root.style.setProperty('--head-h', h + 'px');
  }
  const rafMeasure = ()=> requestAnimationFrame(measure);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', rafMeasure, { once:true });
  } else {
    rafMeasure();
  }
  window.addEventListener('resize', rafMeasure, { passive:true });
  window.visualViewport && window.visualViewport.addEventListener('resize', rafMeasure, { passive:true });

  let lastY = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
  let ticking = false;

  const THRESH_DOWN = 12;
  const THRESH_UP   = 8;
  const MIN_Y       = 48;

  function onScroll(){
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(()=>{
      const curY = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
      const dy = curY - lastY;
      const nearTop = curY < MIN_Y;

      if (dy > THRESH_DOWN && !nearTop) {
        if (!head.classList.contains('is-hidden')) {
          head.classList.add('is-hidden');
          body.classList.add('head-hidden');
        }
      }
      if (dy < -THRESH_UP || nearTop) {
        if (head.classList.contains('is-hidden')) {
          head.classList.remove('is-hidden');
          body.classList.remove('head-hidden');
        }
      }

      lastY = curY;
      ticking = false;
    });
  }

  function onFocusIn(){
    if (head.classList.contains('is-hidden')) {
      head.classList.remove('is-hidden');
      body.classList.remove('head-hidden');
    }
  }

  window.addEventListener('scroll', onScroll, { passive:true });
  window.addEventListener('orientationchange', rafMeasure);
  document.addEventListener('focusin', onFocusIn);
  window.addEventListener('popstate', onFocusIn);
  window.addEventListener('hashchange', onFocusIn);
})();
