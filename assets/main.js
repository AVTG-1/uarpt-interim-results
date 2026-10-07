/* UARPT interim results — page behaviour shared by both pages.
   Classic script (no modules) so the pages work from file://. No dependencies. */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  /* ---------- Appendix: contents dropdown (< 900px) and current-section highlight ---------- */
  function initToc() {
    var side = document.querySelector('.toc-side');
    var main = document.querySelector('.doc-main');
    if (!side || !main) return;

    var list = side.querySelector('ol');
    if (!list) return;

    // Dropdown twin of the sidebar, used under 900px (CSS decides which one shows).
    var drop = document.createElement('details');
    drop.className = 'toc-drop';
    var sum = document.createElement('summary');
    var cur = document.createElement('span');
    cur.className = 'toc-current';
    cur.textContent = 'Appendix contents';
    sum.appendChild(cur);
    drop.appendChild(sum);
    var wrap = document.createElement('div');
    wrap.className = 'toc-list';
    wrap.appendChild(list.cloneNode(true));
    drop.appendChild(wrap);
    main.insertBefore(drop, main.firstChild);
    drop.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) drop.removeAttribute('open');
    });

    var links = Array.prototype.slice.call(document.querySelectorAll('.toc-side a[href^="#"], .toc-drop a[href^="#"]'));
    var targets = [];
    var seen = {};
    links.forEach(function (a) {
      var id = a.getAttribute('href').slice(1);
      if (seen[id]) return;
      seen[id] = true;
      var el = document.getElementById(id);
      if (el) targets.push({ id: id, el: el, label: a.textContent.replace(/^([\d.]+)/, '$1 ') });
    });

    var ticking = false;
    var lastId = null;
    function update() {
      ticking = false;
      var y = 110; // below the sticky bars
      var active = null;
      for (var i = 0; i < targets.length; i++) {
        if (targets[i].el.getBoundingClientRect().top <= y) active = targets[i];
        else break;
      }
      var id = active ? active.id : null;
      if (id === lastId) return;
      lastId = id;
      links.forEach(function (a) {
        var on = id && a.getAttribute('href') === '#' + id;
        a.classList.toggle('cur', !!on);
        if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
      });
      cur.textContent = active ? active.label : 'Appendix contents';
      var onSide = side.querySelector('a.cur');
      if (onSide && side.scrollHeight > side.clientHeight) {
        var top = onSide.offsetTop;
        if (top < side.scrollTop + 40 || top > side.scrollTop + side.clientHeight - 60) {
          side.scrollTop = Math.max(0, top - side.clientHeight / 3);
        }
      }
    }
    function onScroll() {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  ready(initToc);
})();
