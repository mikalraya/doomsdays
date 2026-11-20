/* DOOMSDAY Photobooth — partikel abu latar + audio sintetis (WebAudio, tanpa file) */
(function () {
  'use strict';
  var DD = (window.DD = window.DD || {});

  /* ---------------- Partikel abu ---------------- */
  DD.fx = (function () {
    var cv, ctx, w = 0, h = 0, parts = [], raf = 0, paused = false, last = 0, lastDraw = 0;
    var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

    function size() { w = cv.width = window.innerWidth; h = cv.height = window.innerHeight; }

    function seed() {
      var n = Math.round(Math.min(70, Math.max(24, w / 16)));
      parts = [];
      for (var i = 0; i < n; i++) {
        var k = Math.random();
        parts.push({
          x: Math.random() * w, y: Math.random() * h,
          r: 0.6 + Math.random() * 1.8,
          vy: 6 + Math.random() * 16, vx: 3 + Math.random() * 6,
          a: 0.12 + Math.random() * 0.38, t: Math.random() * 6.28,
          c: k < 0.1 ? '#3dff8b' : k < 0.18 ? '#e0b84a' : '#b8c0ba'
        });
      }
    }

    function draw(dt) {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.t += dt * 0.8;
        p.y += p.vy * dt;
        p.x += (p.vx + Math.sin(p.t) * 6) * dt;
        if (p.y > h + 4) { p.y = -4; p.x = Math.random() * w; }
        if (p.x > w + 4) p.x = -4;
        ctx.globalAlpha = p.a;
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function loop(ts) {
      raf = window.requestAnimationFrame(loop);
      if (ts - lastDraw < 33) return;
      var dt = Math.min(0.06, (ts - last) / 1000 || 0.03);
      last = ts; lastDraw = ts;
      draw(dt);
    }

    function run() {
      if (raf || paused || document.hidden || mq.matches) return;
      last = performance.now();
      raf = window.requestAnimationFrame(loop);
    }
    function halt() { if (raf) { window.cancelAnimationFrame(raf); raf = 0; } }

    function start(canvas) {
      cv = canvas; ctx = cv.getContext('2d');
      size(); seed(); draw(0);
      window.addEventListener('resize', function () { size(); seed(); draw(0); });
      document.addEventListener('visibilitychange', function () { if (document.hidden) halt(); else run(); });
      if (mq.addEventListener) mq.addEventListener('change', function () { if (mq.matches) { halt(); draw(0); } else run(); });
      run();
    }

    return {
      start: start,
      pause: function () { paused = true; halt(); },
      resume: function () { paused = false; run(); }
    };
  })();

  /* ---------------- Audio ---------------- */
  DD.audio = (function () {
    var ac = null, muted = false;

    function unlock() {
      try {
        if (!ac) {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (AC) ac = new AC();
        }
        if (ac && ac.state === 'suspended') ac.resume();
      } catch (e) { ac = null; }
    }

    function beep(freq, dur, vol) {
      if (muted || !ac) return;
      try {
        var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
        o.type = 'square'; o.frequency.value = freq || 660;
        g.gain.setValueAtTime(vol || 0.08, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.12));
        o.connect(g); g.connect(ac.destination);
        o.start(t); o.stop(t + (dur || 0.12) + 0.02);
      } catch (e) { /* abaikan */ }
    }

    function shutter() {
      if (muted || !ac) return;
      try {
        var t = ac.currentTime, len = Math.floor(ac.sampleRate * 0.16);
        var buf = ac.createBuffer(1, len, ac.sampleRate), data = buf.getChannelData(0);
        for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
        var src = ac.createBufferSource(); src.buffer = buf;
        var bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.7;
        var g = ac.createGain(); g.gain.value = 0.5;
        src.connect(bp); bp.connect(g); g.connect(ac.destination); src.start(t);
        beep(1900, 0.03, 0.07);
        setTimeout(function () { beep(1200, 0.05, 0.06); }, 70);
      } catch (e) { /* abaikan */ }
    }

    return {
      unlock: unlock, beep: beep, shutter: shutter,
      setMuted: function (m) { muted = !!m; },
      isMuted: function () { return muted; }
    };
  })();
})();
