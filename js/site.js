/* Figures and small interactive demos. Vanilla JS, no external requests.
   Animation respects prefers-reduced-motion; every demo is usable without it. */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $all = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------- 1. figures: stagger index, reveal on scroll, click to enlarge ---------- */
  $all("svg.fig [data-i]").forEach(function (el) { el.style.setProperty("--i", el.getAttribute("data-i")); });
  var reveal = $all(".figure, .kpis, .demo");
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.15 });
    reveal.forEach(function (el) { io.observe(el); });
  } else {
    reveal.forEach(function (el) { el.classList.add("in"); });
  }
  var zoomed = null;
  function unzoom() { if (zoomed) { zoomed.classList.remove("zoomed"); document.body.classList.remove("has-zoom"); zoomed = null; } }
  $all(".figure .fig-scroll").forEach(function (box) {
    box.setAttribute("tabindex", "0");
    box.setAttribute("role", "button");
    function toggle() {
      var fig = box.parentNode;
      if (zoomed === fig) { unzoom(); return; }
      unzoom(); fig.classList.add("zoomed"); document.body.classList.add("has-zoom"); zoomed = fig;
    }
    box.addEventListener("click", toggle);
    box.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") unzoom(); });

  /* ---------- 2. parity chain: inject a mismatch, find the first divergence ---------- */
  $all(".parity-demo").forEach(function (demo) {
    var fig = document.querySelector('.figure[data-fig="parity-chain"] svg');
    if (!fig) return;
    var hops = $all(".hop", fig), stages = $all(".pstage", fig);
    var out = demo.querySelector(".demo-status");
    var names = stages.map(function (g) { var t = g.querySelector("text"); return t ? t.textContent : ""; });
    function clear() {
      hops.forEach(function (h) { h.classList.remove("fail", "blocked"); });
      stages.forEach(function (s) { s.classList.remove("suspect"); });
      out.textContent = demo.getAttribute("data-idle");
    }
    function inject(k) {
      clear();
      hops.forEach(function (h, i) { if (i === k) h.classList.add("fail"); else if (i > k) h.classList.add("blocked"); });
      if (stages[k + 1]) stages[k + 1].classList.add("suspect");
      out.textContent = demo.getAttribute("data-found").replace("{a}", names[k]).replace("{b}", names[k + 1]);
    }
    var last = -1;
    demo.querySelector(".btn-inject").addEventListener("click", function () {
      var k; do { k = Math.floor(Math.random() * hops.length); } while (k === last && hops.length > 1);
      last = k; inject(k);
    });
    demo.querySelector(".btn-reset").addEventListener("click", clear);
    clear();
  });

  /* ---------- 3. adaptive LUT: a simplified fixed-point simulation ---------- */
  $all(".lut-demo").forEach(function (root) {
    var L = JSON.parse(root.getAttribute("data-i18n"));
    var cv = root.querySelector("canvas"), ctx = cv.getContext("2d");
    var NIN = 1024, X0 = 0.05, X1 = 1.0, QMAX = 2047, TARGET = 2, BUDGET = 64;
    var f = function (x) { return 1 / Math.sqrt(x); };
    var xOf = function (c) { return X0 + (X1 - X0) * c / (NIN - 1); };
    var scale = f(X0) / QMAX;
    var ref = new Int32Array(NIN);
    for (var i = 0; i < NIN; i++) ref[i] = Math.round(f(xOf(i)) / scale);
    var div = [], err = new Float32Array(NIN), stats = {}, timer = null, hover = -1, worst = -1;

    function uniform(n) { var d = []; for (var k = 0; k <= n; k++) d.push(Math.round((NIN - 1) * k / n)); return d; }
    function evaluate() {
      var max = 0, sum = 0, segMax = [], w = -1, wv = -1;
      for (var s = 0; s < div.length - 1; s++) {
        var a = div[s], b = div[s + 1], ya = ref[a], yb = ref[b], m = 0;
        for (var c = a; c <= b; c++) {
          var q = b === a ? ya : Math.round(ya + (yb - ya) * (c - a) / (b - a));
          var e = Math.abs(q - ref[c]); err[c] = e; if (e > m) m = e;
        }
        segMax.push(m); if (m > wv && b - a >= 2) { wv = m; w = s; }
        if (m > max) max = m;
      }
      for (var j = 0; j < NIN; j++) sum += err[j];
      stats = { tables: div.length - 1, max: max, mean: sum / NIN }; worst = w; return segMax;
    }
    function step() {
      evaluate();
      if (stats.max <= TARGET || stats.tables >= BUDGET || worst < 0) return false;
      var a = div[worst], b = div[worst + 1];
      div.splice(worst + 1, 0, Math.round((a + b) / 2));
      evaluate(); return true;
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function size() {
      var dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = 380;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { w: w, h: h };
    }
    function draw() {
      var s = size(), W = s.w, padL = 46, padR = 14, pw = W - padL - padR;
      var top = 16, ph = 170, e0 = 232, eh = 108;
      var X = function (c) { return padL + pw * c / (NIN - 1); };
      ctx.clearRect(0, 0, W, s.h);
      ctx.font = "12px system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
      // worst segment highlight
      if (worst >= 0 && stats.max > TARGET) {
        ctx.fillStyle = "rgba(208,59,59,0.10)";
        ctx.fillRect(X(div[worst]), top, X(div[worst + 1]) - X(div[worst]), ph + (e0 - top - ph) + eh);
      }
      // axes
      ctx.strokeStyle = "#c9d0d9"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, top); ctx.lineTo(padL, top + ph); ctx.lineTo(padL + pw, top + ph); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(padL, e0); ctx.lineTo(padL, e0 + eh); ctx.lineTo(padL + pw, e0 + eh); ctx.stroke();
      // curve
      ctx.strokeStyle = "#2a78d6"; ctx.lineWidth = 2; ctx.beginPath();
      for (var c = 0; c < NIN; c++) { var y = top + ph * (1 - ref[c] / QMAX) ; if (c) ctx.lineTo(X(c), y); else ctx.moveTo(X(c), y); }
      ctx.stroke();
      // dividing points
      ctx.strokeStyle = "#eb6834"; ctx.lineWidth = div.length > 80 ? 0.6 : 1.4;
      div.forEach(function (d) { ctx.beginPath(); ctx.moveTo(X(d), top + ph - 12); ctx.lineTo(X(d), top + ph + 6); ctx.stroke(); });
      // error bars
      var emax = Math.max(6, Math.min(40, stats.max));
      var EY = function (v) { return e0 + eh * (1 - Math.min(v, emax) / emax); };
      ctx.fillStyle = "#eb6834";
      for (var k = 0; k < NIN; k++) { if (err[k] > 0) { var yy = EY(err[k]); ctx.fillRect(X(k) - 0.5, yy, Math.max(1, pw / NIN), e0 + eh - yy); } }
      ctx.strokeStyle = "#141c27"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, EY(TARGET)); ctx.lineTo(padL + pw, EY(TARGET)); ctx.stroke();
      ctx.fillStyle = "#5e6a79";
      ctx.fillText(L.curve, padL + 8, top + 12);
      ctx.fillText(L.err, padL + 8, e0 - 8);
      ctx.fillText(TARGET + " LSB", padL + pw - 40, EY(TARGET) - 4);
      ctx.fillText(L.code, padL + pw - ctx.measureText(L.code).width, e0 + eh + 16);
      ctx.textAlign = "right"; ctx.fillText(String(Math.round(emax)), padL - 6, e0 + 10); ctx.fillText("0", padL - 6, e0 + eh); ctx.textAlign = "left";
      // hover crosshair + tooltip
      if (hover >= 0) {
        ctx.strokeStyle = "#8a94a3"; ctx.beginPath(); ctx.moveTo(X(hover), top); ctx.lineTo(X(hover), e0 + eh); ctx.stroke();
        var tip = L.tip.replace("{c}", hover).replace("{e}", err[hover].toFixed(0));
        var tw = ctx.measureText(tip).width + 14, tx = Math.min(Math.max(X(hover) + 8, padL), padL + pw - tw);
        ctx.fillStyle = "#141c27"; ctx.fillRect(tx, top + ph + 18, tw, 22);
        ctx.fillStyle = "#fff"; ctx.fillText(tip, tx + 7, top + ph + 33);
      }
      root.querySelector(".lut-tables").textContent = stats.tables;
      root.querySelector(".lut-max").textContent = stats.max.toFixed(0) + " LSB";
      root.querySelector(".lut-mean").textContent = stats.mean.toFixed(2) + " LSB";
      root.querySelector(".lut-verdict").textContent = stats.max <= TARGET ? L.pass : (stats.tables >= BUDGET ? L.fail : L.over);
      root.querySelector(".lut-verdict").className = "lut-verdict " + (stats.max <= TARGET ? "ok" : "bad");
    }
    function set(d) { stop(); div = d; evaluate(); draw(); }
    root.querySelector(".btn-u6").addEventListener("click", function () { set(uniform(6)); });
    root.querySelector(".btn-u126").addEventListener("click", function () { set(uniform(126)); });
    root.querySelector(".btn-step").addEventListener("click", function () { stop(); if (div.length > 60) div = uniform(6); step(); draw(); });
    root.querySelector(".btn-play").addEventListener("click", function () {
      stop(); div = uniform(6); evaluate(); draw();
      if (reduce) { while (step()) { /* run to completion */ } draw(); return; }
      timer = setInterval(function () { if (!step()) stop(); draw(); }, 260);
    });
    cv.addEventListener("mousemove", function (e) {
      var r = cv.getBoundingClientRect(), pw = r.width - 60, c = Math.round((e.clientX - r.left - 46) / pw * (NIN - 1));
      hover = c >= 0 && c < NIN ? c : -1; draw();
    });
    cv.addEventListener("mouseleave", function () { hover = -1; draw(); });
    window.addEventListener("resize", draw);
    set(uniform(6));
  });

  /* ---------- 4. home: bit-width playground ---------- */
  $all(".quant-demo").forEach(function (root) {
    var cv = root.querySelector("canvas"), ctx = cv.getContext("2d"), range = root.querySelector("input[type=range]");
    var out = root.querySelector(".quant-readout"), tpl = root.getAttribute("data-readout");
    var curve = function (t) { return 0.5 + 0.36 * Math.sin(2.2 * Math.PI * t - 0.9) * (0.55 + 0.45 * t) + 0.08 * Math.sin(7 * Math.PI * t); };
    function draw() {
      var bits = parseInt(range.value, 10), levels = Math.pow(2, bits) - 1;
      var dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = 210;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + "px"; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      var pad = 10, pw = w - pad * 2, ph = h - pad * 2;
      var Y = function (v) { return pad + ph * (1 - v); };
      if (levels <= 31) { ctx.strokeStyle = "#e3e6ea"; ctx.lineWidth = 1; for (var l = 0; l <= levels; l++) { ctx.beginPath(); ctx.moveTo(pad, Y(l / levels)); ctx.lineTo(pad + pw, Y(l / levels)); ctx.stroke(); } }
      var n = 240, maxe = 0;
      ctx.strokeStyle = "#eb6834"; ctx.lineWidth = 2; ctx.beginPath();
      for (var i = 0; i <= n; i++) { var v = curve(i / n), q = Math.round(v * levels) / levels; maxe = Math.max(maxe, Math.abs(q - v));
        var x = pad + pw * i / n; if (i) { ctx.lineTo(x, Y(q)); } else ctx.moveTo(x, Y(q)); }
      ctx.stroke();
      ctx.strokeStyle = "#2a78d6"; ctx.lineWidth = 2; ctx.beginPath();
      for (var j = 0; j <= n; j++) { var xx = pad + pw * j / n, yy = Y(curve(j / n)); if (j) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
      ctx.stroke();
      out.textContent = tpl.replace("{b}", bits).replace("{n}", levels + 1).replace("{e}", (maxe * 100).toFixed(2));
    }
    range.addEventListener("input", draw); window.addEventListener("resize", draw); draw();
  });
})();
