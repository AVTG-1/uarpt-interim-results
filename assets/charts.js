/* UARPT interim results — the seven visualisations (V1–V7), D3 v7.
   Data comes from window.UARPT_DATA, which index.html inlines from content/06-figure-data.json.
   Nothing is fetched at runtime, so the page works from file://. Classic script, no modules.

   Conventions (DESIGN.md): vanilla / baseline = accent, failed = refuted, worked = proven,
   unreplicated = caution. Hairline horizontal gridlines only, 2px lines, markers >= 8px with a
   surface ring, transparent backgrounds, one-line caption under every chart, direct labels. */
(function () {
  'use strict';

  var D = window.UARPT_DATA;
  var d3 = window.d3;

  /* ---------------------------------------------------------------- helpers */

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  var C = {};
  function loadColours() {
    C.bg = css('--bg'); C.surface = css('--surface'); C.surface2 = css('--surface-2');
    C.border = css('--border'); C.text = css('--text'); C.dim = css('--text-dim'); C.faint = css('--text-faint');
    C.accent = css('--accent'); C.proven = css('--proven'); C.refuted = css('--refuted'); C.caution = css('--caution');
  }
  var MINUS = '−';

  // Display formatters. Values are shown at the precision the source reports them.
  function fx(v, d) { return Number(v).toFixed(d); }
  function lp(v) { return fx(v, 2); }
  function r2(v) { return v >= 0.999 ? fx(v, 4) : fx(v, 3); }
  function rank(v) { return v >= 100 ? String(Math.round(v)) : fx(v, 1); }
  function norm(v) { return fx(v, 1); }
  function signed(v, d) { return (v < 0 ? MINUS : '+') + fx(Math.abs(v), d); }
  function cnt(v) { return v === 0 ? '0' : fx(v, 1); }
  function pct(v) { return v === 0 ? '0%' : fx(v * 100, 1) + '%'; }
  function epoch(e) { return 'ep' + e; }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---------------------------------------------------------------- tooltip (one, shared) */

  var tipEl = null;
  function tip() {
    if (!tipEl) {
      tipEl = el('div', 'tip');
      tipEl.setAttribute('role', 'tooltip');
      tipEl.setAttribute('aria-hidden', 'true');
      document.body.appendChild(tipEl);
      document.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'touch' && !(e.target.closest && e.target.closest('[data-tip]'))) tipHide();
      });
    }
    return tipEl;
  }
  // spec: { title, rows: [{ key, dash, name, val }], lines: [], caveat }
  function tipShow(spec, clientX, clientY) {
    var t = tip();
    t.textContent = '';
    if (spec.title) t.appendChild(el('div', 'th', spec.title));
    (spec.rows || []).forEach(function (r) {
      var row = el('div', 'row');
      if (r.key) {
        var k = el('span', 'key');
        k.style.borderTopColor = r.key;
        if (r.dash) k.style.borderTopStyle = 'dashed';
        row.appendChild(k);
      }
      row.appendChild(el('span', 'val', r.val));
      if (r.name) row.appendChild(el('span', 'nm', r.name));
      t.appendChild(row);
    });
    (spec.lines || []).forEach(function (l) { t.appendChild(el('div', 'ln', l)); });
    if (spec.caveat) t.appendChild(el('div', 'cav', spec.caveat));
    t.classList.add('on');
    var w = t.offsetWidth, h = t.offsetHeight;
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var x = clientX + 14, y = clientY + 14;
    if (x + w > vw - 8) x = clientX - w - 14;
    if (x < 8) x = Math.max(8, vw - w - 8);
    if (y + h > vh - 8) y = clientY - h - 14;
    if (y < 8) y = 8;
    t.style.left = x + 'px';
    t.style.top = y + 'px';
  }
  function tipHide() { if (tipEl) tipEl.classList.remove('on'); }
  function tipAtNode(node, spec) {
    var r = node.getBoundingClientRect();
    tipShow(spec, r.left + r.width / 2, r.top + r.height / 2);
  }
  // Attach hover, focus and tap behaviour to any node. specFn is called lazily.
  function bindTip(node, specFn) {
    node.setAttribute('data-tip', '');
    node.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') tipShow(specFn(), e.clientX, e.clientY); });
    node.addEventListener('pointermove', function (e) { if (e.pointerType !== 'touch') tipShow(specFn(), e.clientX, e.clientY); });
    node.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') tipHide(); });
    node.addEventListener('pointerdown', function (e) { if (e.pointerType === 'touch') tipShow(specFn(), e.clientX, e.clientY); });
    node.addEventListener('focus', function () { tipAtNode(node, specFn()); });
    node.addEventListener('blur', tipHide);
  }

  /* ---------------------------------------------------------------- shared widgets */

  // Mount a chart into `host`, re-drawing when the available width changes.
  // Under `minW` the host scrolls horizontally instead of shrinking the text.
  function mount(host, minW, draw) {
    var last = -1, timer = null;
    function run(force) {
      var w = Math.max(host.clientWidth || 0, minW);
      if (!force && Math.abs(w - last) < 1) return;
      last = w;
      tipHide();
      host.textContent = '';
      draw(host, w);
    }
    run(true);
    if (window.ResizeObserver) {
      new ResizeObserver(function () { clearTimeout(timer); timer = setTimeout(function () { run(false); }, 120); }).observe(host);
    }
    return { redraw: function () { run(true); } };
  }

  function svgIn(host, w, h, label) {
    return d3.select(host).append('svg')
      .attr('width', w).attr('height', h).attr('viewBox', '0 0 ' + w + ' ' + h)
      .attr('role', 'group').attr('aria-label', label);
  }

  function yAxis(g, scale, plotW, ticks, fmt) {
    var ax = d3.axisLeft(scale).tickSize(-plotW).tickPadding(10);
    if (Array.isArray(ticks)) ax.tickValues(ticks); else ax.ticks(ticks);
    if (fmt) ax.tickFormat(fmt);
    var a = g.append('g').attr('class', 'axis grid').call(ax);
    a.select('.domain').remove();
    return a;
  }
  function xAxis(g, scale, plotH, values, fmt) {
    var ax = d3.axisBottom(scale).tickSize(4).tickPadding(8).tickValues(values);
    if (fmt) ax.tickFormat(fmt);
    var a = g.append('g').attr('class', 'axis').attr('transform', 'translate(0,' + plotH + ')').call(ax);
    return a;
  }
  function text(g, x, y, str, opts) {
    opts = opts || {};
    var t = g.append('text').attr('x', x).attr('y', y).text(str);
    if (opts.anchor) t.attr('text-anchor', opts.anchor);
    if (opts.cls) t.attr('class', opts.cls);
    if (opts.size) t.style('font-size', opts.size);
    return t;
  }

  function dataTable(figure, summary, headers, rows) {
    var det = el('details', 'datatable');
    det.appendChild(el('summary', null, summary));
    var wrap = el('div', 'tablewrap');
    var tbl = el('table', 'tbl');
    var thead = el('thead'), trh = el('tr');
    headers.forEach(function (h, i) { var th = el('th', i ? 'n' : '', h); th.scope = 'col'; trh.appendChild(th); });
    thead.appendChild(trh); tbl.appendChild(thead);
    var tb = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr');
      r.forEach(function (c, i) { tr.appendChild(el('td', i ? 'n' : '', c)); });
      tb.appendChild(tr);
    });
    tbl.appendChild(tb); wrap.appendChild(tbl); det.appendChild(wrap);
    figure.appendChild(det);
  }

  function segmented(host, label, options, initial, onChange) {
    var wrap = el('div', 'seg');
    wrap.setAttribute('role', 'radiogroup');
    wrap.setAttribute('aria-label', label);
    var btns = [];
    function select(id, focus) {
      btns.forEach(function (b) {
        var on = b.dataset.id === id;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
        if (on && focus) b.focus();
      });
      onChange(id);
    }
    options.forEach(function (o, i) {
      var b = el('button', null, o.label);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.id = o.id;
      b.addEventListener('click', function () { select(o.id, false); });
      b.addEventListener('keydown', function (e) {
        var d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!d) return;
        e.preventDefault();
        select(options[(i + d + options.length) % options.length].id, true);
      });
      btns.push(b);
      wrap.appendChild(b);
    });
    host.appendChild(wrap);
    select(initial, false);
    return { select: function (id) { select(id, false); } };
  }

  function dot(g, x, y, colour, r, opts) {
    opts = opts || {};
    var c = g.append('circle').attr('cx', x).attr('cy', y).attr('r', r || 4.5)
      .attr('class', 'surface-ring');
    if (opts.hollow) c.attr('fill', C.bg).style('stroke', colour).style('stroke-width', 2);
    else c.attr('fill', colour);
    return c;
  }

  // A pill drawn in SVG around text (used for the n = 1 label on V7).
  function chip(g, x, y, str, colour) {
    var grp = g.append('g').attr('transform', 'translate(' + x + ',' + y + ')');
    var t = grp.append('text').attr('x', 8).attr('y', 0).attr('class', 't-strong').style('fill', C.text).style('font-size', '12.5px').text(str);
    var bb = t.node().getBBox();
    grp.insert('rect', 'text').attr('x', 0).attr('y', bb.y - 4).attr('width', bb.width + 16).attr('height', bb.height + 8)
      .attr('rx', 6).attr('fill', C.bg).attr('stroke', colour).attr('stroke-width', 1.5);
    return { g: grp, w: bb.width + 16, h: bb.height + 8 };
  }

  function nearestIndex(xs, px) {
    var best = 0, bd = Infinity;
    xs.forEach(function (x, i) { var d = Math.abs(x - px); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  /* ---------------------------------------------------------------- V1 project arc */

  function v1() {
    var host = document.getElementById('v1-arc');
    if (!host) return;
    var steps = D.project_arc.steps;
    var ol = d3.select(host);
    ol.selectAll('li').data(steps).join('li')
      .attr('class', function (s) { return /n = 1/.test(s.sub) ? 'flag' : null; })
      .each(function (s) {
        var a = d3.select(this).append('a').attr('href', s.anchor);
        a.append('span').attr('class', 'lb').text(s.label);
        a.append('span').attr('class', 'sb').text(s.sub);
      });
  }

  /* ---------------------------------------------------------------- V2 experiment matrix */

  var STATUS_WORD = { valid: 'valid', invalid: 'invalid', unexplained: 'unexplained' };
  var CAVEAT = { rp: '+2.27 pp is 0.59σ, inside seed noise.' };

  function v2() {
    var host = document.getElementById('v2-matrix');
    if (!host) return;
    var M = D.experiment_matrix;
    var detail = document.getElementById('v2-detail');
    var cells = [];

    function lossStr(arm, ds) {
      var v = arm.loss[ds];
      return (arm.id === 'rppp' && ds === 'CIFAR-10') ? '~0.000' : fx(v, 3);
    }
    function spec(arm, ds) {
      var pk = arm.peak_lp[ds];
      var rows = [
        { val: lossStr(arm, ds), name: 'final JEPA training loss' },
        { val: pk == null ? 'not available' : lp(pk), name: pk == null ? 'linear probe: evaluation incomplete' : 'best measured linear probe, %' }
      ];
      return { title: arm.label + ' · ' + ds + ' · ' + STATUS_WORD[arm.status], rows: rows, lines: [arm.reason], caveat: CAVEAT[arm.id] };
    }
    function showDetail(arm, ds) {
      detail.textContent = '';
      var h = el('div', 'h');
      h.appendChild(el('code', null, arm.label));
      h.appendChild(document.createTextNode(' on ' + ds + ' — '));
      h.appendChild(el('span', 'chip ' + arm.status, STATUS_WORD[arm.status]));
      detail.appendChild(h);
      detail.appendChild(el('p', null, arm.reason));
      var pk = arm.peak_lp[ds];
      var m = el('p', 'dim');
      m.appendChild(document.createTextNode('Adds: ' + arm.adds + '. Final JEPA loss '));
      m.appendChild(el('span', 'm', lossStr(arm, ds)));
      m.appendChild(document.createTextNode(pk == null ? '. Linear probe: evaluation incomplete.' : '. Best measured linear probe '));
      if (pk != null) { m.appendChild(el('span', 'm', lp(pk) + '%')); m.appendChild(document.createTextNode('.')); }
      detail.appendChild(m);
      if (CAVEAT[arm.id]) detail.appendChild(el('p', 'dim', CAVEAT[arm.id]));
    }

    host.appendChild(el('div'));
    M.datasets.forEach(function (ds) { host.appendChild(el('div', 'mh', ds)); });
    M.arms.forEach(function (arm) {
      var a = el('div', 'arm');
      a.appendChild(el('code', null, arm.label));
      a.appendChild(el('span', 'ad', arm.adds));
      host.appendChild(a);
      M.datasets.forEach(function (ds) {
        var b = el('button', 'mcell ' + arm.status);
        b.type = 'button';
        b.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-label', arm.label + ', ' + ds + ', ' + STATUS_WORD[arm.status] + '. ' + arm.reason);
        b.appendChild(el('span', 'st', STATUS_WORD[arm.status]));
        var pk = arm.peak_lp[ds];
        var l = el('span', 'lp');
        if (pk == null) { l.appendChild(el('small', null, 'LP not available')); }
        else { l.appendChild(document.createTextNode(lp(pk))); l.appendChild(el('small', null, 'best LP')); }
        b.appendChild(l);
        bindTip(b, function () { return spec(arm, ds); });
        b.addEventListener('click', function () {
          cells.forEach(function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); });
          showDetail(arm, ds);
        });
        cells.push(b);
        host.appendChild(b);
      });
    });

    var fig = host.closest('figure');
    var rows = M.arms.map(function (a) {
      return [a.label, STATUS_WORD[a.status], lossStr(a, 'CIFAR-10'), lossStr(a, 'STL-10'),
        a.peak_lp['CIFAR-10'] == null ? '—' : lp(a.peak_lp['CIFAR-10']),
        a.peak_lp['STL-10'] == null ? '—' : lp(a.peak_lp['STL-10']), a.reason];
    });
    dataTable(fig, 'Show the matrix as a table',
      ['Arm', 'Status', 'Loss CIFAR-10', 'Loss STL-10', 'Best LP CIFAR-10', 'Best LP STL-10', 'Why'], rows);
  }

  /* ---------------------------------------------------------------- V3 healthy baseline signature */

  function v3() {
    var host = document.getElementById('v3-chart');
    if (!host) return;
    var S = D.baseline_signature;
    var CTL = 'random init';
    var cats = [CTL].concat(S.epochs.map(epoch));
    var data = S.epochs.map(function (e, i) {
      return { cat: epoch(e), r2: S.cifar.position_r2[i], rank: S.cifar.token_rank[i], norm: S.cifar.token_norm[i] };
    });
    var ctl = S.random_init_control;

    function draw(box, W) {
      var m = { t: 14, r: 24, b: 40, l: 64 }, ph = 176, gap = 62;
      var H = m.t + ph + gap + ph + m.b;
      var pw = W - m.l - m.r;
      var svg = svgIn(box, W, H, 'Two stacked panels for CIFAR-10 vanilla: position readout R squared falls and token effective rank rises across epoch 30, 66 and 400, with a random-initialisation control.');
      var x = d3.scalePoint().domain(cats).range([0, pw]).padding(0.5);
      var yR = d3.scaleLinear().domain([0.87, 1.03]).range([ph, 0]);
      var yK = d3.scaleLinear().domain([0, 420]).range([ph, 0]);

      var pa = svg.append('g').attr('transform', 'translate(' + m.l + ',' + m.t + ')');
      var pb = svg.append('g').attr('transform', 'translate(' + m.l + ',' + (m.t + ph + gap) + ')');

      yAxis(pa, yR, pw, [0.88, 0.92, 0.96, 1.0], function (v) { return fx(v, 2); });
      yAxis(pb, yK, pw, [0, 100, 200, 300, 400]);
      text(pa, 0, -2, 'Position readout R² — falls as content replaces position', { cls: 't-strong' });
      text(pb, 0, -2, 'Token effective rank (RankMe) of 384 — rises as more dimensions are used', { cls: 't-strong' });
      xAxis(pb, x, ph, cats);
      // the top panel shares the x axis: baseline only
      pa.append('line').attr('x1', 0).attr('x2', pw).attr('y1', ph).attr('y2', ph).style('stroke', C.border);

      // max rank reference
      pb.append('line').attr('class', 'ann-line').attr('x1', 0).attr('x2', pw).attr('y1', yK(S.max_rank)).attr('y2', yK(S.max_rank));
      text(pb, pw, yK(S.max_rank) - 6, S.max_rank + ' dimensions available', { anchor: 'end', cls: 'ann-text' }).style('fill', C.dim);

      // divider between the control and the trained checkpoints
      var xdiv = (x(CTL) + x(cats[1])) / 2;
      [pa, pb].forEach(function (p) {
        p.append('line').attr('x1', xdiv).attr('x2', xdiv).attr('y1', 0).attr('y2', ph).style('stroke', C.border).style('stroke-dasharray', '2 3');
      });

      // series
      var ln = function (acc, yy) { return d3.line().x(function (d) { return x(d.cat); }).y(function (d) { return yy(acc(d)); }); };
      pa.append('path').datum(data).attr('fill', 'none').attr('stroke', C.accent).attr('stroke-width', 2)
        .attr('stroke-linejoin', 'round').attr('d', ln(function (d) { return d.r2; }, yR));
      pb.append('path').datum(data).attr('fill', 'none').attr('stroke', C.accent).attr('stroke-width', 2)
        .attr('stroke-linejoin', 'round').attr('d', ln(function (d) { return d.rank; }, yK));
      data.forEach(function (d) {
        dot(pa, x(d.cat), yR(d.r2), C.accent, 5);
        dot(pb, x(d.cat), yK(d.rank), C.accent, 5);
        text(pa, x(d.cat), yR(d.r2) - 12, r2(d.r2), { anchor: 'middle', cls: 't-val t-mono' });
        text(pb, x(d.cat), yK(d.rank) + 22, rank(d.rank), { anchor: 'middle', cls: 't-val t-mono' });
      });

      // random-init control: annotated, not connected to the trained series
      var cx = x(CTL);
      dot(pa, cx, yR(ctl.position_r2), C.text, 6, { hollow: true });
      dot(pb, cx, yK(ctl.token_rank), C.text, 6, { hollow: true });
      text(pa, cx + 14, yR(ctl.position_r2) + 4, 'random-init control', { cls: 't-strong' }).style('font-size', '12.5px');
      text(pa, cx + 14, yR(ctl.position_r2) + 20, 'R² ' + fx(ctl.position_r2, 7), { cls: 't-val t-mono' });
      text(pb, cx + 14, yK(ctl.token_rank) - 8, 'rank ' + fx(ctl.token_rank, 1), { cls: 't-val t-mono' });

      // hit columns spanning both panels: one tooltip per checkpoint, with every metric
      cats.forEach(function (c, i) {
        var cxp = x(c);
        var colW = Math.min(110, pw / cats.length);
        var hit = svg.append('rect').attr('class', 'hit').attr('tabindex', 0)
          .attr('x', m.l + cxp - colW / 2).attr('y', m.t).attr('width', colW).attr('height', ph * 2 + gap);
        var spec;
        if (i === 0) {
          spec = { title: 'Random-init control (untrained ViT)', rows: [
            { val: fx(ctl.position_r2, 7), name: 'position readout R² (held-out)' },
            { val: fx(ctl.token_rank, 1), name: 'token effective rank' }],
            lines: ['Position is added at the input, so an untrained network already scores essentially perfectly.'] };
        } else {
          var d = data[i - 1];
          spec = { title: 'CIFAR-10 vanilla · ' + d.cat, rows: [
            { key: C.accent, val: r2(d.r2), name: 'position readout R²' },
            { key: C.accent, val: rank(d.rank), name: 'token effective rank' },
            { val: norm(d.norm), name: 'mean token norm' }] };
        }
        hit.attr('aria-label', spec.title + ': ' + spec.rows.map(function (r) { return r.name + ' ' + r.val; }).join(', '));
        bindTip(hit.node(), function () { return spec; });
      });
    }
    mount(host, 560, draw);

    var fig = host.closest('figure');
    var rows = [['random init', fx(ctl.position_r2, 7), fx(ctl.token_rank, 1), '—']].concat(data.map(function (d) {
      return [d.cat, r2(d.r2), rank(d.rank), norm(d.norm)];
    }));
    dataTable(fig, 'Show the plotted values as a table', ['CIFAR-10 vanilla', 'Position R²', 'Token rank', 'Token norm'], rows);
  }

  /* ---------------------------------------------------------------- V4 positional shortcut */

  function v4() {
    var host = document.getElementById('v4-chart');
    if (!host) return;
    var P = D.positional_shortcut;
    var state = { ds: 'cifar' };
    var fig = host.closest('figure');
    var sel;

    function draw(box, W) {
      var s = P[state.ds];
      var name = state.ds === 'cifar' ? 'CIFAR-10' : 'STL-10';
      var cats = s.epochs.map(epoch);
      var m = { t: 40, r: 84, b: 40, l: 64 }, H = 340;
      var pw = W - m.l - m.r, ph = H - m.t - m.b;
      var svg = svgIn(box, W, H, 'Grouped bars of token-level effective rank for vanilla and rppp at ' + cats.join(', ') + ' on ' + name + '. The two are identical before epoch 40 and far apart after it.');
      var g = svg.append('g').attr('transform', 'translate(' + m.l + ',' + m.t + ')');
      var x0 = d3.scaleBand().domain(cats).range([0, pw]).paddingInner(0.38).paddingOuter(0.3);
      var barW = Math.min(24, x0.bandwidth() / 2 - 2);
      var y = d3.scaleLinear().domain([0, 400]).range([ph, 0]);
      yAxis(g, y, pw, [0, 100, 200, 300, 400]);
      text(g, -m.l + 4, -22, 'Token effective rank (of 384)', { cls: 'axis-title' });
      xAxis(g, x0, ph, cats).select('.domain').style('stroke', C.border);

      var series = [
        { id: 'vanilla', label: 'vanilla', colour: C.accent, rank: s.vanilla_rank, r2: s.vanilla_r2, lp: s.vanilla_lp, norm: null, dx: -barW / 2 - 1 },
        { id: 'rppp', label: 'rppp', colour: C.refuted, rank: s.rppp_rank, r2: s.rppp_r2, lp: s.rppp_lp, norm: s.rppp_token_norm, dx: barW / 2 + 1 }
      ];
      series.forEach(function (se) {
        cats.forEach(function (c, i) {
          var v = se.rank[i];
          var bx = x0(c) + x0.bandwidth() / 2 + se.dx - barW / 2;
          var bh = Math.max(2, ph - y(v));
          // 4px rounded data end, square at the baseline
          var r = Math.min(4, bh, barW / 2);
          var d = 'M' + bx + ',' + ph + 'V' + (ph - bh + r) + 'Q' + bx + ',' + (ph - bh) + ' ' + (bx + r) + ',' + (ph - bh) +
            'H' + (bx + barW - r) + 'Q' + (bx + barW) + ',' + (ph - bh) + ' ' + (bx + barW) + ',' + (ph - bh + r) + 'V' + ph + 'Z';
          var bar = g.append('path').attr('d', d).attr('fill', se.colour);
          text(g, bx + barW / 2, ph - bh - 7, rank(v), { anchor: 'middle', cls: 't-val t-mono' });
          var hit = g.append('rect').attr('class', 'hit').attr('tabindex', 0)
            .attr('x', bx - 3).attr('y', 0).attr('width', barW + 6).attr('height', ph);
          var rows = [{ key: se.colour, val: rank(v), name: 'token effective rank' }, { val: r2(se.r2[i]), name: 'position readout R²' }];
          if (se.lp && se.lp[i] != null) rows.push({ val: lp(se.lp[i]), name: 'linear probe, %' });
          if (se.norm) rows.push({ val: norm(se.norm[i]), name: 'mean token norm' });
          var spec = { title: se.label + ' · ' + name + ' · ' + c, rows: rows };
          hit.attr('aria-label', spec.title + ': ' + rows.map(function (q) { return q.name + ' ' + q.val; }).join(', '));
          bindTip(hit.node(), function () { return spec; });
          hit.on('pointerenter.lift focus.lift', function () { bar.attr('opacity', 0.82); });
          hit.on('pointerleave.lift blur.lift', function () { bar.attr('opacity', 1); });
        });
        // direct label beside the last group
        var li = cats.length - 1;
        var lx = x0(cats[li]) + x0.bandwidth() + 8;
        var ly = y(se.rank[li]) + (se.id === 'vanilla' ? 4 : -6);
        text(g, Math.max(lx, pw + 6), ly, se.label, { cls: 't-strong' }).style('font-size', '12.5px');
        g.append('line').attr('x1', Math.max(lx, pw + 6) - 18).attr('x2', Math.max(lx, pw + 6) - 4).attr('y1', ly - 4).attr('y2', ly - 4)
          .attr('stroke', se.colour).attr('stroke-width', 2);
      });

      // epoch 40 marker between the first and second group
      var mx = (x0(cats[0]) + x0.bandwidth() + x0(cats[1])) / 2;
      g.append('line').attr('class', 'ann-line').attr('x1', mx).attr('x2', mx).attr('y1', -10).attr('y2', ph);
      text(g, mx + 8, -16, 'epoch ' + P.aux_activation_epoch + ' — auxiliary activates', { cls: 'ann-text t-strong' });
    }
    var mnt = mount(host, 560, draw);

    var ctl = fig.querySelector('.controls');
    sel = segmented(ctl, 'Dataset', [{ id: 'cifar', label: 'CIFAR-10' }, { id: 'stl', label: 'STL-10' }], 'cifar', function (id) {
      state.ds = id;
      mnt.redraw();
      var cap = fig.querySelector('[data-cap-ds]');
      if (cap) cap.textContent = id === 'cifar' ? 'CIFAR-10' : 'STL-10';
      var note = fig.querySelector('[data-cap-last]');
      if (note) note.textContent = id === 'cifar' ? 'ep300' : 'ep400';
    });

    var rows = [];
    ['cifar', 'stl'].forEach(function (k) {
      var s = P[k], n = k === 'cifar' ? 'CIFAR-10' : 'STL-10';
      s.epochs.forEach(function (e, i) {
        rows.push([n + ' ' + epoch(e), rank(s.vanilla_rank[i]), rank(s.rppp_rank[i]), r2(s.vanilla_r2[i]), r2(s.rppp_r2[i]),
          s.rppp_lp ? lp(s.rppp_lp[i]) : '—']);
      });
    });
    dataTable(fig, 'Show both datasets as a table', ['Dataset, epoch', 'Rank vanilla', 'Rank rppp', 'R² vanilla', 'R² rppp', 'LP rppp, %'], rows);
  }

  /* ---------------------------------------------------------------- V5 mask leak grid */

  // One illustrative draw on the 16x16 grid. Targets are the union of four rectangular blocks
  // (fixed across the three states, as the same image would be). Counts are the measured means
  // rounded to whole patches; positions are arbitrary, the proportions are the point.
  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rnd) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function buildGrid(N, side, states) {
    var rnd = mulberry(20260);
    // four target blocks [row, col, height, width]
    var blocks = [[1, 9, 7, 6], [5, 5, 6, 7], [9, 4, 6, 7], [9, 6, 7, 6]]; // union = 115 cells
    var tgt = {};
    blocks.forEach(function (b) {
      for (var r = b[0]; r < b[0] + b[2]; r++) for (var c = b[1]; c < b[1] + b[3]; c++) tgt[r * side + c] = true;
    });
    var tgtList = [], freeList = [];
    for (var i = 0; i < N; i++) (tgt[i] ? tgtList : freeList).push(i);
    return { tgt: tgt, tgtList: tgtList, freeList: freeList, rnd: rnd };
  }

  function v5() {
    var gridHost = document.querySelector('#v5 [data-grid]');
    var readout = document.querySelector('#v5 [data-readout]');
    var ctlHost = document.querySelector('#v5 .controls');
    if (!gridHost) return;
    var cfg = D.mask_leak.cifar;
    var side = cfg.grid[0], N = cfg.total_patches, CELL = 24, SIZE = side * CELL;
    var S = {};
    cfg.states.forEach(function (s) { S[s.id] = s; });

    var base = buildGrid(N, side);
    var nTgt = Math.round(S.vanilla.n_tgt);
    // the four blocks cover exactly the rounded measured mean of target patches
    var tgtSet = {}; var tl = base.tgtList;
    if (tl.length !== nTgt && window.console) console.warn('V5 target blocks cover ' + tl.length + ' cells, expected ' + nTgt);
    tl.forEach(function (i) { tgtSet[i] = true; });
    var free = [];
    for (var i = 0; i < N; i++) if (!tgtSet[i]) free.push(i);

    // vanilla context: a connected region grown over non-target cells
    function grow(count) {
      var start = free[Math.floor(base.rnd() * free.length)];
      var inCtx = {}, order = [start], queue = [start]; inCtx[start] = true;
      while (order.length < count && queue.length) {
        var cur = queue.splice(Math.floor(base.rnd() * Math.min(queue.length, 6)), 1)[0];
        var r = Math.floor(cur / side), c = cur % side;
        shuffle([[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]], base.rnd).forEach(function (p) {
          if (order.length >= count || p[0] < 0 || p[1] < 0 || p[0] >= side || p[1] >= side) return;
          var k = p[0] * side + p[1];
          if (tgtSet[k] || inCtx[k]) return;
          inCtx[k] = true; order.push(k); queue.push(k);
        });
      }
      return inCtx;
    }
    var vanillaCtx = grow(Math.round(S.vanilla.n_ctx));
    // curriculum contexts: uniform over all cells, nested (easy within hard), overlap fixed to the measured mean
    var tShuf = shuffle(tl, base.rnd), fShuf = shuffle(free, base.rnd);
    function curriculum(s) {
      var ctx = Math.round(s.n_ctx), ov = Math.round(s.n_overlap), set = {};
      tShuf.slice(0, ov).forEach(function (i) { set[i] = true; });
      fShuf.slice(0, ctx - ov).forEach(function (i) { set[i] = true; });
      return set;
    }
    var ctxSets = { vanilla: vanillaCtx, easy: curriculum(S.easy), hard: curriculum(S.hard) };

    function kind(id, i) {
      var c = !!ctxSets[id][i], t = !!tgtSet[i];
      return c && t ? 'ovl' : c ? 'ctx' : t ? 'tgt' : 'none';
    }
    var KIND_TEXT = { ovl: 'context and target — the leak', ctx: 'context only', tgt: 'target only', none: 'not used' };

    var svg = d3.select(gridHost).append('svg').attr('viewBox', '0 0 ' + SIZE + ' ' + SIZE)
      .attr('role', 'img').attr('aria-label', 'Patch grid');
    var defs = svg.append('defs');
    var pat = defs.append('pattern').attr('id', 'v5-hatch').attr('width', 6).attr('height', 6).attr('patternUnits', 'userSpaceOnUse')
      .attr('patternTransform', 'rotate(45)');
    pat.append('rect').attr('width', 6).attr('height', 6).attr('fill', C.surface2);
    pat.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 6).attr('stroke', C.dim).attr('stroke-width', 2.2);
    var fills = { ctx: C.accent, ovl: C.refuted, tgt: 'url(#v5-hatch)', none: C.surface2 };
    var cellData = d3.range(N);
    var cells = svg.selectAll('rect.cell').data(cellData).join('rect').attr('class', 'cell')
      .attr('x', function (i) { return (i % side) * CELL; }).attr('y', function (i) { return Math.floor(i / side) * CELL; })
      .attr('width', CELL).attr('height', CELL).attr('rx', 2);
    var current = 'vanilla';
    cells.each(function (i) {
      var node = this;
      node.setAttribute('data-tip', '');
      node.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') tipShow(cellSpec(i), e.clientX, e.clientY); });
      node.addEventListener('pointermove', function (e) { if (e.pointerType !== 'touch') tipShow(cellSpec(i), e.clientX, e.clientY); });
      node.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') tipHide(); });
      node.addEventListener('pointerdown', function (e) { if (e.pointerType === 'touch') tipShow(cellSpec(i), e.clientX, e.clientY); });
    });
    function cellSpec(i) {
      return { title: 'Row ' + (Math.floor(i / side) + 1) + ', column ' + ((i % side) + 1), rows: [{ val: KIND_TEXT[kind(current, i)] }],
        lines: ['One illustrative draw. ' + S[current].label + '.'] };
    }

    // readout
    var NOTES = {
      vanilla: 'Context and targets are disjoint. Overlap is exactly 0 across all 22,800 vanilla control samples.',
      easy: 'The curriculum re-drew the context mask after the non-overlap guarantee was set. The encoder also sees 33% more context than vanilla.',
      hard: 'The same override with a larger keep ratio. The encoder sees 99% more context than vanilla, on top of the leak.'
    };
    function swatch(colour, hatch) {
      var s = el('span', 'sw');
      s.style.background = hatch ? 'repeating-linear-gradient(45deg,' + C.surface2 + ' 0 3px,' + C.dim + ' 3px 5px)' : colour;
      return s;
    }
    function update(id) {
      current = id;
      var s = S[id];
      cells.attr('fill', function (i) { return fills[kind(id, i)]; });
      svg.attr('aria-label', 'Sixteen by sixteen patch grid, ' + s.label + ': context blue, targets hatched, overlap red.');
      readout.textContent = '';
      readout.appendChild(el('div', 'state-name', s.label));
      readout.appendChild(el('div', 'state-note', NOTES[id]));
      var dl = el('dl');
      function row(sw, label, val, sub) {
        var dt = el('dt'); dt.appendChild(sw); dt.appendChild(el('span', null, label));
        dl.appendChild(dt); dl.appendChild(el('dd', null, val)); dl.appendChild(el('dd', 'sub', sub || ''));
      }
      row(swatch(C.accent), 'Context patches', cnt(s.n_ctx), s.ctx_range ? 'range ' + s.ctx_range[0] + '–' + s.ctx_range[1] : 'mean per image');
      row(swatch(null, true), 'Target patches', cnt(s.n_tgt), 'mean per image');
      row(swatch(C.refuted), 'Overlap (leak)', cnt(s.n_overlap), 'mean per image');
      readout.appendChild(dl);
      var leak = el('div', 'leak');
      leak.appendChild(el('div', 'v', pct(s.frac_leaked)));
      leak.appendChild(el('div', 'l', 'of targets visible to the encoder'));
      var bar = el('div', 'leakbar'); var fill = el('i'); fill.style.width = (s.frac_leaked * 100) + '%'; bar.appendChild(fill);
      leak.appendChild(bar);
      readout.appendChild(leak);
      readout.setAttribute('aria-live', 'polite');
    }
    segmented(ctlHost, 'Mask state', cfg.states.map(function (s) { return { id: s.id, label: s.label }; }), 'vanilla', update);

    var fig = gridHost.closest('figure');
    var rows = [];
    [['cifar', 'CIFAR-10'], ['stl', 'STL-10']].forEach(function (k) {
      D.mask_leak[k[0]].states.forEach(function (s) {
        rows.push([k[1] + ' · ' + s.label, cnt(s.n_ctx), cnt(s.n_tgt), cnt(s.n_overlap), pct(s.frac_leaked)]);
      });
    });
    dataTable(fig, 'Show measured counts for both datasets as a table', ['Dataset, state', 'Context', 'Targets', 'Overlap', 'Targets leaked'], rows);
  }

  /* ---------------------------------------------------------------- V6 freeze test */

  function v6() {
    var host = document.getElementById('v6-chart');
    if (!host) return;
    var F = D.freeze_test;
    var cmap = { accent: C.accent, proven: C.proven };
    var series = F.series.map(function (s) {
      return { id: s.id, label: s.label, colour: cmap[s.colour], values: s.values, delta: s.delta, freeze: s.freeze_at, dashed: s.id === 'freeze150' };
    });
    var from = { vanilla: 'ep200', freeze200: 'ep200', freeze150: 'ep150' };

    function draw(box, W) {
      var m = { t: 40, r: 168, b: 44, l: 64 }, H = 380;
      var pw = W - m.l - m.r, ph = H - m.t - m.b;
      var svg = svgIn(box, W, H, 'Line chart of CIFAR-10 linear probe accuracy against epoch for vanilla, freeze at epoch 200 and freeze at epoch 150. Vanilla falls after epoch 200, the frozen runs stay flat.');
      var g = svg.append('g').attr('transform', 'translate(' + m.l + ',' + m.t + ')');
      var x = d3.scaleLinear().domain([20, 410]).range([0, pw]);
      var y = d3.scaleLinear().domain([48, 72]).range([ph, 0]);
      yAxis(g, y, pw, [50, 55, 60, 65, 70]);
      text(g, -m.l + 4, -22, 'Linear probe accuracy (%)', { cls: 'axis-title' });
      xAxis(g, x, ph, F.epochs);
      text(g, pw / 2, ph + 38, 'epoch', { anchor: 'middle', cls: 'axis-title' });

      // freeze markers
      series.filter(function (s) { return s.freeze; }).forEach(function (s) {
        var fx_ = x(s.freeze);
        g.append('line').attr('class', 'ann-line').attr('x1', fx_).attr('x2', fx_).attr('y1', -8).attr('y2', ph);
        var left = s.freeze === 150;
        text(g, fx_ + (left ? -6 : 6), -14, 'optimiser stopped at ep' + s.freeze, { anchor: left ? 'end' : 'start', cls: 'ann-text' });
      });

      var line = d3.line().x(function (d, i) { return x(F.epochs[i]); }).y(function (d) { return y(d); }).curve(d3.curveLinear);
      series.forEach(function (s) {
        g.append('path').datum(s.values).attr('fill', 'none').attr('stroke', s.colour).attr('stroke-width', 2)
          .attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round').attr('stroke-dasharray', s.dashed ? '6 4' : null).attr('d', line);
      });
      series.forEach(function (s) {
        s.values.forEach(function (v, i) { dot(g, x(F.epochs[i]), y(v), s.colour, 4); });
      });

      // direct labels at the line ends, with short leaders so the two close ends stay attached
      var last = F.epochs.length - 1;
      var nudges = { vanilla: 0, freeze200: -16, freeze150: 20 };
      series.forEach(function (s) {
        var ex = x(F.epochs[last]) + 6, ey = y(s.values[last]);
        var ty = ey + nudges[s.id];
        g.append('line').attr('x1', ex).attr('x2', ex + 14).attr('y1', ey).attr('y2', ty).attr('stroke', s.colour).attr('stroke-width', 1.5);
        var t = text(g, ex + 18, ty + 4, s.label, { cls: 't-strong' }).style('font-size', '12.5px');
        t.append('tspan').attr('x', ex + 18).attr('dy', 15).attr('class', 't-mono').style('font-size', '12px')
          .text(signed(s.delta, 2) + ' pp from ' + from[s.id]);
      });

      // crosshair + one tooltip for every series
      var cross = g.append('line').attr('class', 'hover-line').attr('y1', 0).attr('y2', ph).style('display', 'none');
      var xs = F.epochs.map(x);
      var idx = 0;
      function spec(i) {
        return { title: 'Epoch ' + F.epochs[i], rows: series.map(function (s) {
          return { key: s.colour, dash: s.dashed, val: lp(s.values[i]), name: s.label };
        }), lines: ['Linear probe accuracy, CIFAR-10.'] };
      }
      var hit = g.append('rect').attr('class', 'hit').attr('width', pw).attr('height', ph).attr('tabindex', 0)
        .attr('aria-label', 'Chart plot area. Use the left and right arrow keys to read each epoch.');
      function show(i, cx, cy) {
        idx = i; cross.style('display', null).attr('x1', xs[i]).attr('x2', xs[i]);
        if (cx == null) { var r = hit.node().getBoundingClientRect(); cx = r.left + xs[i]; cy = r.top + ph / 2; }
        tipShow(spec(i), cx, cy);
      }
      hit.on('pointermove pointerdown', function (e) {
        var p = d3.pointer(e, hit.node()); show(nearestIndex(xs, p[0]), e.clientX, e.clientY);
      });
      hit.on('pointerleave', function (e) { if (e.pointerType !== 'touch') { cross.style('display', 'none'); tipHide(); } });
      hit.on('focus', function () { show(idx); });
      hit.on('blur', function () { cross.style('display', 'none'); tipHide(); });
      hit.on('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return; e.preventDefault(); show(Math.max(0, Math.min(xs.length - 1, idx + d)));
      });
      hit.node().setAttribute('data-tip', '');
    }
    mount(host, 720, draw);

    var fig = host.closest('figure');
    var rows = F.epochs.map(function (e, i) { return [epoch(e)].concat(series.map(function (s) { return lp(s.values[i]); })); });
    rows.push(['Change from freeze point'].concat(series.map(function (s) { return signed(s.delta, 2) + ' pp'; })));
    dataTable(fig, 'Show the plotted values as a table', ['Epoch'].concat(series.map(function (s) { return s.label; })), rows);
  }

  /* ---------------------------------------------------------------- V7 seed variance and the survivor */

  function v7() {
    var host = document.getElementById('v7-chart');
    if (!host) return;
    var SV = D.seed_variance, EM = D.ema_survivor;
    var seeds = SV.seeds.filter(function (s) { return s.seed !== 0; }); // seed 0 is the vanilla curve itself

    function draw(box, W) {
      var m = { t: 28, r: 196, b: 44, l: 64 }, H = 420;
      var pw = W - m.l - m.r, ph = H - m.t - m.b;
      var svg = svgIn(box, W, H, 'Line chart of CIFAR-10 linear probe accuracy against epoch. A shaded band shows the spread of three baseline seeds at peak. The single EMA 0.999 run sits clearly above it. It is n = 1, unreplicated.');
      var g = svg.append('g').attr('transform', 'translate(' + m.l + ',' + m.t + ')');
      var x = d3.scaleLinear().domain([20, 410]).range([0, pw]);
      var y = d3.scaleLinear().domain([50, 82]).range([ph, 0]);
      yAxis(g, y, pw, [50, 55, 60, 65, 70, 75, 80]);
      text(g, -m.l + 4, -12, 'Linear probe accuracy (%)', { cls: 'axis-title' });
      xAxis(g, x, ph, EM.epochs);
      text(g, pw / 2, ph + 38, 'epoch', { anchor: 'middle', cls: 'axis-title' });

      // layer 1 — the seed band: three baseline seeds at peak, mean +/- std
      var top = y(SV.peak_mean + SV.peak_std), bot = y(SV.peak_mean - SV.peak_std);
      g.append('rect').attr('x', 0).attr('y', top).attr('width', pw).attr('height', bot - top).attr('fill', C.accent).attr('opacity', 0.14);
      g.append('line').attr('x1', 0).attr('x2', pw).attr('y1', y(SV.peak_mean)).attr('y2', y(SV.peak_mean)).attr('stroke', C.accent).attr('opacity', 0.5);
      text(g, x(392), top + 17, 'baseline, 3 seeds at peak: ' + fx(SV.peak_mean, 2) + ' ± ' + fx(SV.peak_std, 2), { anchor: 'end', cls: 't-strong' })
        .style('font-size', '12.5px');
      // ep400 mean +/- std bar, offset to the right of the last epoch
      var bx = x(400) + 18;
      g.append('line').attr('x1', bx).attr('x2', bx).attr('y1', y(SV.ep400_mean + SV.ep400_std)).attr('y2', y(SV.ep400_mean - SV.ep400_std))
        .attr('stroke', C.accent).attr('stroke-width', 2);
      [SV.ep400_mean + SV.ep400_std, SV.ep400_mean - SV.ep400_std].forEach(function (v) {
        g.append('line').attr('x1', bx - 4).attr('x2', bx + 4).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', C.accent).attr('stroke-width', 2);
      });
      dot(g, bx, y(SV.ep400_mean), C.accent, 4);
      var barHit = g.append('rect').attr('class', 'hit').attr('x', bx - 12).attr('y', y(SV.ep400_mean + SV.ep400_std) - 6).attr('width', 24)
        .attr('height', y(SV.ep400_mean - SV.ep400_std) - y(SV.ep400_mean + SV.ep400_std) + 12).attr('tabindex', 0)
        .attr('aria-label', 'Baseline at epoch 400, three seeds: mean ' + fx(SV.ep400_mean, 2) + ', standard deviation ' + fx(SV.ep400_std, 2));
      bindTip(barHit.node(), function () {
        return { title: 'Three baseline seeds, epoch 400', rows: [
          { val: fx(SV.ep400_mean, 2), name: 'mean' }, { val: '±' + fx(SV.ep400_std, 2), name: 'standard deviation' }] };
      });

      // layer 2 — baseline seed 0 curve (vanilla), measured points only
      var van = EM.epochs.map(function (e, i) { return { e: e, v: EM.vanilla[i] }; }).filter(function (d) { return d.v != null; });
      var ln = d3.line().x(function (d) { return x(d.e); }).y(function (d) { return y(d.v); });
      g.append('path').datum(van).attr('fill', 'none').attr('stroke', C.accent).attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('d', ln);
      van.forEach(function (d) { dot(g, x(d.e), y(d.v), C.accent, 4); });

      // other seeds: hollow rings at peak and at epoch 400
      seeds.forEach(function (s) {
        dot(g, x(s.peak_epoch), y(s.peak), C.accent, 5, { hollow: true });
        dot(g, x(400), y(s.ep400), C.accent, 5, { hollow: true });
        text(g, x(s.peak_epoch) + 9, y(s.peak) - 8, 'seed ' + s.seed, { cls: 't-mono' }).style('font-size', '12px');
      });

      // layer 3 — the survivor
      var em = EM.epochs.map(function (e, i) { return { e: e, v: EM.emaconst_high[i] }; });
      g.append('path').datum(em).attr('fill', 'none').attr('stroke', C.caution).attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('d', ln);
      em.forEach(function (d) { dot(g, x(d.e), y(d.v), C.caution, 4.5); });

      // direct labels
      var lastE = em[em.length - 1];
      text(g, x(400) + 40, y(lastE.v) + 4, 'EMA 0.999, constant', { cls: 't-strong' }).style('font-size', '12.5px');
      text(g, x(400) + 40, y(SV.ep400_mean) - 4, '3-seed mean ± std', { cls: 't-mono' }).style('font-size', '12px');
      text(g, x(400) + 40, y(SV.ep400_mean) + 10, 'at epoch 400', { cls: 't-mono' }).style('font-size', '12px');
      var lv = van[van.length - 1];
      text(g, x(400) + 40, y(lv.v) + 22, 'baseline, seed 0', { cls: 't-strong' }).style('font-size', '12.5px');

      // the caveat, on the chart itself
      // right-aligned to the peak so it stays inside a narrow, scrolled viewport
      var chipRef = chip(g, 0, y(EM.peak) - 20, 'peak ' + lp(EM.peak) + ' · ' + EM.replication_status, C.caution);
      chipRef.g.attr('transform', 'translate(' + Math.max(4, x(EM.peak_epoch) + 8 - chipRef.w) + ',' + (y(EM.peak) - 20) + ')');

      // crosshair + tooltip across all layers
      var cross = g.append('line').attr('class', 'hover-line').attr('y1', 0).attr('y2', ph).style('display', 'none');
      var xs = EM.epochs.map(x);
      var idx = 0;
      function spec(i) {
        var e = EM.epochs[i];
        var rows = [{ key: C.caution, val: lp(EM.emaconst_high[i]), name: 'EMA 0.999 constant (' + EM.replication_status + ')' }];
        if (EM.vanilla[i] != null) rows.push({ key: C.accent, val: lp(EM.vanilla[i]), name: 'baseline, seed 0' });
        seeds.forEach(function (s) {
          if (s.peak_epoch === e) rows.push({ val: lp(s.peak), name: 'baseline seed ' + s.seed + ', its peak' });
          if (e === 400) rows.push({ val: lp(s.ep400), name: 'baseline seed ' + s.seed + ', epoch 400' });
        });
        var lines = ['Shaded band: three baseline seeds at peak, ' + fx(SV.peak_mean, 2) + ' \u00b1 ' + fx(SV.peak_std, 2) + '.'];
        if (e === EM.peak_epoch) lines.push(fx(EM.sigma_at_peak, 1) + 'σ at peak against the three-seed baseline distribution.');
        if (e === 400) lines.push(fx(EM.sigma_at_ep400, 1) + 'σ at epoch 400 against the three-seed baseline distribution.');
        return { title: 'Epoch ' + e, rows: rows, lines: lines, caveat: 'EMA run: ' + EM.replication_status + '.' };
      }
      var hit = g.append('rect').attr('class', 'hit').attr('width', pw).attr('height', ph).attr('tabindex', 0)
        .attr('aria-label', 'Chart plot area. Use the left and right arrow keys to read each epoch.').style('pointer-events', 'all');
      barHit.raise(); // the small ep400 error-bar target stays above the plot-wide crosshair area
      function show(i, cx2, cy2) {
        idx = i; cross.style('display', null).attr('x1', xs[i]).attr('x2', xs[i]);
        if (cx2 == null) { var r = hit.node().getBoundingClientRect(); cx2 = r.left + xs[i]; cy2 = r.top + ph / 2; }
        tipShow(spec(i), cx2, cy2);
      }
      hit.on('pointermove pointerdown', function (e) {
        var p = d3.pointer(e, hit.node()); show(nearestIndex(xs, p[0]), e.clientX, e.clientY);
      });
      hit.on('pointerleave', function (e) { if (e.pointerType !== 'touch') { cross.style('display', 'none'); tipHide(); } });
      hit.on('focus', function () { show(idx); });
      hit.on('blur', function () { cross.style('display', 'none'); tipHide(); });
      hit.on('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return; e.preventDefault(); show(Math.max(0, Math.min(xs.length - 1, idx + d)));
      });
      hit.node().setAttribute('data-tip', '');
    }
    mount(host, 760, draw);

    var fig = host.closest('figure');
    var rows = EM.epochs.map(function (e, i) {
      return [epoch(e), lp(EM.emaconst_high[i]), EM.vanilla[i] == null ? '—' : lp(EM.vanilla[i])];
    });
    dataTable(fig, 'Show the plotted curves as a table', ['Epoch', 'EMA 0.999 constant (n = 1, unreplicated)', 'Baseline, seed 0'], rows);
    var srows = SV.seeds.map(function (s) { return ['seed ' + s.seed, lp(s.peak), String(s.peak_epoch), lp(s.ep400), signed(s.decline, 2)]; });
    srows.push(['mean ± std', fx(SV.peak_mean, 2) + ' ± ' + fx(SV.peak_std, 2), '', fx(SV.ep400_mean, 2) + ' ± ' + fx(SV.ep400_std, 2),
      signed(SV.decline_mean, 2) + ' ± ' + fx(SV.decline_std, 2)]);
    dataTable(fig, 'Show the three baseline seeds as a table', ['Baseline seed', 'Peak', 'Peak epoch', 'Epoch 400', 'Decline'], srows);
  }

  /* ---------------------------------------------------------------- boot */

  function boot() {
    if (!D || !d3) {
      Array.prototype.forEach.call(document.querySelectorAll('[data-chart-fallback]'), function (n) {
        n.hidden = false;
      });
      return;
    }
    loadColours();
    [v1, v2, v3, v4, v5, v6, v7].forEach(function (fn) {
      try { fn(); } catch (err) {
        var n = document.querySelector('[data-chart-fallback]');
        if (n) n.hidden = false;
        if (window.console) console.warn('chart ' + fn.name + ' failed: ' + err.message);
        window.__chartErrors = (window.__chartErrors || []).concat([fn.name + ': ' + err.message]);
      }
    });
    window.__chartsReady = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
