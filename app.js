(function () {
  'use strict';
  var WB = window.WB;
  var KEY = 'aa5wb.v1';
  var V7_FLAG = 'aa5wb.oilFromFull.v7'; /* left by the short-lived first v7 (oil as ± from full), live ~10 min on Oct 19 */
  var state = load();

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function load() {
    var s = { inputs: clone(WB.DEFAULTS.inputs), settings: clone(WB.DEFAULTS.settings) };
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved && saved.inputs) Object.keys(s.inputs).forEach(function (k) { if (k in saved.inputs) s.inputs[k] = saved.inputs[k]; });
      if (saved && saved.settings) Object.keys(s.settings).forEach(function (k) { if (k in saved.settings) s.settings[k] = saved.settings[k]; });
      /* Devices still holding an earlier default set exactly get the current one; anything typed by hand is kept. Load entries are never touched. */
      if (saved && saved.settings && WB.isOldDefault(saved.settings)) {
        s.settings = clone(WB.DEFAULTS.settings);
        try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e2) {}
      }
      /* Undo the short-lived first v7 (Oct 19, ~4:54-5:05 PM ET), which turned a saved 8 qt into 0 and defaulted oil to 0
         under a "± from full" meaning that was dropped. Only a device that ran that build carries its flag; there a 0
         goes back to 8 (0 qt on board is not a real entry now), any other value is kept, and the flag is removed so
         this never runs again. Oil is otherwise never changed automatically. */
      if (localStorage.getItem(V7_FLAG)) {
        if (saved && saved.inputs && ('oilQt' in saved.inputs) && String(saved.inputs.oilQt).trim() !== '' && WB.num(saved.inputs.oilQt) === 0) {
          s.inputs.oilQt = 8; localStorage.setItem(KEY, JSON.stringify(s));
        }
        localStorage.removeItem(V7_FLAG);
      }
      /* Saved fuel/oil past a limit (fuel 0-37, oil 0-8) is capped on load. */
      var fixed = false;
      Object.keys(WB.LIMITS).forEach(function (k) {
        var v = s.inputs[k];
        if (v === '' || v === null || v === undefined) return;
        if (WB.limitState(k, v)) { s.inputs[k] = WB.capped(k, v); fixed = true; }
      });
      if (fixed) localStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) { /* private mode or bad data: use defaults */ }
    return s;
  }
  function saveNow() { clearTimeout(saveTimer); saveTimer = null; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  /* Typing saves at most every 300 ms; leaving a box or the app saves at once. */
  var saveTimer = null;
  function save() { if (!saveTimer) saveTimer = setTimeout(saveNow, 300); }
  function flush() { if (saveTimer) saveNow(); }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });

  function fmt(n, d) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function $(id) { return document.getElementById(id); }
  function show(v) { return (v === '' || v === null || v === undefined) ? '' : String(v); }
  function setText(node, t) { if (node.textContent !== t) node.textContent = t; }

  var loadInputs = Array.prototype.slice.call(document.querySelectorAll('input[data-key]'));
  var setInputs = Array.prototype.slice.call(document.querySelectorAll('input[data-set]'));

  /* Never rewrite the box someone is typing in. */
  function put(el, v) { if (el !== document.activeElement && el.value !== v) el.value = v; }
  function fillInputs() {
    loadInputs.forEach(function (el) { put(el, show(state.inputs[el.dataset.key])); });
    setInputs.forEach(function (el) { put(el, show(state.settings[el.dataset.set])); });
  }

  /* One render per animation frame, however fast the typing. */
  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    raf(function () { pending = false; render(); });
  }

  /* No select() on focus: on iPhone/iPad it fights the keyboard and caret. */
  /* Fuel and oil limits: while typing, only a note under the box changes (the box itself is never rewritten);
     on leaving the box it snaps to the limit and saves. */
  function snap(el) {
    var k = el.dataset.key;
    if (!WB.LIMITS[k] || el.value.trim() === '' || !WB.limitState(k, el.value)) return;
    var v = String(WB.capped(k, el.value));
    el.value = v; state.inputs[k] = v; saveNow(); schedule();
  }
  /* Baggage and cargo area are one or the other, never both (Dan, Oct 26): typing a weight in one clears the other. */
  var EXCL = { baggage: 'cargo', cargo: 'baggage' };
  var exclTimer = null;
  function exclusive(k) {
    var other = EXCL[k];
    if (!other || WB.num(state.inputs[k]) === 0 || show(state.inputs[other]) === '') return;
    if (WB.num(state.inputs[other]) === 0 && String(state.inputs[other]).trim() === '') return;
    state.inputs[other] = '';
    var oel = $('in-' + other); put(oel, '');
    var note = $('x-' + other);
    if (note) {
      note.textContent = (other === 'cargo' ? 'Cargo area' : 'Baggage') + ' cleared: load goes in baggage or cargo area, not both.';
      note.hidden = false; clearTimeout(exclTimer);
      exclTimer = setTimeout(function () { note.hidden = true; }, 5000);
    }
  }
  loadInputs.forEach(function (el, i) {
    el.addEventListener('input', function () { state.inputs[el.dataset.key] = el.value; exclusive(el.dataset.key); save(); schedule(); });
    el.addEventListener('blur', function () { snap(el); flush(); });
    el.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      var next = loadInputs[i + 1];
      if (next) next.focus(); else el.blur();
    });
  });
  setInputs.forEach(function (el) {
    el.addEventListener('input', function () {
      var k = el.dataset.set;
      state.settings[k] = el.value;
      if (k === 'emptyWeight' || k === 'emptyArm') {
        var m = WB.num(state.settings.emptyWeight) * WB.num(state.settings.emptyArm) / 1000;
        state.settings.emptyMoment = String(Math.round(m * 10000) / 10000);
        put($('set-emptyMoment'), state.settings.emptyMoment);
      }
      save(); schedule();
    });
    el.addEventListener('blur', flush);
    el.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); el.blur(); } });
  });

  /* Tap anywhere outside a box to put the keyboard away (a drag/scroll does not). */
  var tapStart = null;
  function isControl(t) { return t && t.closest && t.closest('input, label, button, summary, a, select, textarea'); }
  document.addEventListener('pointerdown', function (ev) {
    tapStart = isControl(ev.target) ? null : { x: ev.clientX, y: ev.clientY, t: Date.now() };
  }, { passive: true });
  document.addEventListener('pointerup', function (ev) {
    var s = tapStart; tapStart = null;
    if (!s || Math.abs(ev.clientX - s.x) > 10 || Math.abs(ev.clientY - s.y) > 10 || Date.now() - s.t > 600) return;
    var a = document.activeElement;
    if (a && a.tagName === 'INPUT') a.blur();
  }, { passive: true });
  document.addEventListener('pointercancel', function () { tapStart = null; }, { passive: true });

  /* In-page "tap again" confirm. No native pop-ups: they can lock up home-screen apps on iOS. */
  function twoTap(btn, armedText, action) {
    var label = btn.textContent, timer = null;
    function disarm() { clearTimeout(timer); timer = null; btn.classList.remove('armed'); btn.textContent = label; }
    btn.addEventListener('click', function () {
      if (timer) { disarm(); action(); flash(btn); return; }
      btn.classList.add('armed'); btn.textContent = armedText;
      timer = setTimeout(disarm, 4000);
    });
  }
  function flash(btn) {
    var label = btn.textContent;
    btn.classList.add('done'); btn.textContent = 'Done ✓';
    setTimeout(function () { btn.classList.remove('done'); btn.textContent = label; }, 1200);
  }
  twoTap($('reset'), 'Tap again to reset', function () {
    state.inputs = WB.resetKeepOil(state.inputs); saveNow(); fillInputs(); render(); /* oil is never reset */
  });
  twoTap($('reset-settings'), 'Tap again to restore', function () {
    state.settings = clone(WB.DEFAULTS.settings); saveNow(); fillInputs(); render();
  });

  /* Loading table: rows built once, then only their numbers change. */
  var rowCells = null;
  function updateTable(r) {
    var tb = $('tbody');
    if (!rowCells) {
      rowCells = [];
      tb.innerHTML = '';
      r.rows.forEach(function () {
        var tr = document.createElement('tr'), cells = [];
        for (var i = 0; i < 4; i++) {
          var c = document.createElement(i === 0 ? 'th' : 'td'); if (i === 0) c.scope = 'row';
          tr.appendChild(c); cells.push(c);
        }
        tb.appendChild(tr); rowCells.push(cells);
      });
    }
    r.rows.forEach(function (row, n) {
      var label = row.label + (row.qty !== null && row.qty !== undefined ? ' (' + fmt(row.qty, row.qty % 1 ? 1 : 0) + ' ' + row.unit + ')' : '');
      [label, fmt(row.weight, 1), fmt(row.arm, 2), fmt(row.moment, 2)].forEach(function (v, i) { setText(rowCells[n][i], v); });
    });
  }

  function render() {
    var r = WB.compute(state.inputs, state.settings);
    var cls = r.ok ? 'ok' : 'bad';
    var st = $('status');
    if (st.className !== 'status ' + cls) st.className = 'status ' + cls;
    setText($('status-word'), r.ok ? 'WITHIN LIMITS' : 'OUT OF LIMITS');
    setText($('status-why'), r.ok ? 'Gross weight, CG envelope, baggage and cargo all OK' : r.problems.join(' · '));

    var mini = $('mini');
    if (mini.className !== 'mini ' + cls) mini.className = 'mini ' + cls;
    setText($('mini-word'), r.ok ? 'WITHIN LIMITS' : 'OUT OF LIMITS');
    setText($('mini-nums'), fmt(r.totalWeight, 1) + ' lb · CG ' + fmt(r.cg, 2));
    setText($('out-weight'), fmt(r.totalWeight, 1));
    setText($('out-cg'), fmt(r.cg, 2));
    setText($('out-moment'), fmt(r.totalMoment, 2));
    setText($('out-remaining'), fmt(r.remaining, 1));
    $('out-remaining').parentNode.className = r.remaining < 0 ? 'neg' : '';

    var e = r.envelope;
    setText($('out-cgrange'), (e.cgFwd !== null && e.cgAft !== null)
      ? 'CG limits at this weight: ' + fmt(e.cgFwd, 2) + ' to ' + fmt(e.cgAft, 2) + ' in'
      : 'This weight is outside the envelope chart');

    var byKey = {}; r.rows.forEach(function (row) { byKey[row.key] = row; });
    setText($('d-fuel'), fmt(byKey.fuel.weight, 1) + ' lb · moment ' + fmt(byKey.fuel.moment, 2));
    setText($('d-oil'), fmt(byKey.oil.weight, 2) + ' lb · moment ' + fmt(byKey.oil.moment, 2));
    ['front', 'rear', 'baggage', 'cargo'].forEach(function (k) { setText($('d-' + k), 'moment ' + fmt(byKey[k].moment, 2)); });
    Object.keys(WB.LIMITS).forEach(function (k) {
      var L = WB.LIMITS[k], ls = WB.limitState(k, state.inputs[k]);
      var note = $('lim-' + k);
      setText(note, ls === 'max' ? L.maxNote : ls === 'min' ? L.minNote : '');
      if (note.hidden !== !ls) note.hidden = !ls;
      $('in-' + k).classList.toggle('over', !!ls);
    });
    $('in-baggage').classList.toggle('over', !r.checks.baggage);
    $('in-cargo').classList.toggle('over', !r.checks.cargo);

    updateTable(r);
    setText($('t-weight'), fmt(r.totalWeight, 1));
    setText($('t-cg'), fmt(r.cg, 2));
    setText($('t-moment'), fmt(r.totalMoment, 2));

    updateChart(r);
  }

  /* Chart: the grid and envelope are drawn once; each update only moves the dot and its label. */
  var NS = 'http://www.w3.org/2000/svg';
  var W = 600, H = 420, L = 58, R = 16, T = 16, B = 46;
  var x0 = 90, x1 = 205, y0 = 1150, y1 = 2300;
  function X(m) { return L + (m - x0) / (x1 - x0) * (W - L - R); }
  function Y(w) { return T + (y1 - w) / (y1 - y0) * (H - T - B); }
  function el(name, attrs, text) {
    var n = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text !== undefined) n.textContent = text;
    return n;
  }
  var dot = null, dotLabel = null;
  function buildChart() {
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', preserveAspectRatio: 'xMidYMid meet' });
    var g = el('g', { 'class': 'grid' });
    for (var w = 1200; w <= 2300; w += 100) {
      g.appendChild(el('line', { x1: L, x2: W - R, y1: Y(w), y2: Y(w) }));
      g.appendChild(el('text', { x: L - 8, y: Y(w) + 5, 'text-anchor': 'end', 'class': 'tick' }, String(w)));
    }
    for (var m = 90; m <= 200; m += 10) {
      g.appendChild(el('line', { x1: X(m), x2: X(m), y1: T, y2: H - B }));
      g.appendChild(el('text', { x: X(m), y: H - B + 20, 'text-anchor': 'middle', 'class': 'tick' }, String(m)));
    }
    svg.appendChild(g);
    svg.appendChild(el('text', { x: (L + W - R) / 2, y: H - 6, 'text-anchor': 'middle', 'class': 'axis' }, 'Loaded moment / 1000 (lb-in)'));
    svg.appendChild(el('text', { x: 14, y: (T + H - B) / 2, 'text-anchor': 'middle', 'class': 'axis', transform: 'rotate(-90 14 ' + ((T + H - B) / 2) + ')' }, 'Weight (lb)'));
    var pts = [];
    for (var i = 0; i < WB.ENV_MOMENT.length; i++) pts.push(X(WB.ENV_MOMENT[i]) + ',' + Y(WB.ENV_UPPER[i]));
    for (var j = WB.ENV_MOMENT.length - 1; j >= 0; j--) pts.push(X(WB.ENV_MOMENT[j]) + ',' + Y(WB.ENV_LOWER[j]));
    svg.appendChild(el('polygon', { points: pts.join(' '), 'class': 'env' }));
    svg.appendChild(el('line', { x1: L, x2: W - R, y1: Y(2200), y2: Y(2200), 'class': 'gross' }));
    svg.appendChild(el('text', { x: L + 6, y: Y(2200) - 6, 'class': 'grosslbl' }, 'Max gross 2,200'));
    dot = el('circle', { cx: 0, cy: 0, r: 11, 'class': 'pt ok' });
    dotLabel = el('text', { x: 0, y: 0, 'class': 'ptlbl' }, '');
    svg.appendChild(dot); svg.appendChild(dotLabel);
    var box = $('chart'); box.innerHTML = ''; box.appendChild(svg);
  }
  function updateChart(r) {
    if (!dot) buildChart();
    var mx = Math.max(x0, Math.min(x1, isFinite(r.totalMoment) ? r.totalMoment : x0));
    var wy = Math.max(y0, Math.min(y1, isFinite(r.totalWeight) ? r.totalWeight : y0));
    var cx = X(mx), cy = Y(wy), right = cx > W - 170;
    dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
    dot.setAttribute('class', r.ok ? 'pt ok' : 'pt bad');
    dotLabel.setAttribute('x', right ? cx - 16 : cx + 16);
    dotLabel.setAttribute('y', cy + 6);
    dotLabel.setAttribute('text-anchor', right ? 'end' : 'start');
    setText(dotLabel, fmt(r.totalWeight, 0) + ' lb · ' + fmt(r.totalMoment, 1));
  }

  fillInputs();
  render();

  function offlineNote(t) { var n = $('offline-state'); if (n) n.textContent = t; }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(function () {
      return navigator.serviceWorker.ready;
    }).then(function () { offlineNote('Saved for offline use.'); }).catch(function () { offlineNote('Offline copy not available here.'); });
  }
})();
