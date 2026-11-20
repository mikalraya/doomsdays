/* DOOMSDAY Photobooth — util + filter piksel (tanpa ctx.filter agar jalan di iOS Safari) */
(function () {
  'use strict';
  var DD = (window.DD = window.DD || {});

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* PRNG deterministik (mulberry32) */
  function rng(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Area crop "cover" untuk rasio tertentu */
  function coverRect(sw, sh, aspect) {
    var sa = sw / sh;
    if (sa > aspect) {
      var w = sh * aspect;
      return { sx: (sw - w) / 2, sy: 0, sw: w, sh: sh };
    }
    var h = sw / aspect;
    return { sx: 0, sy: (sh - h) / 2, sw: sw, sh: h };
  }

  DD.util = { clamp: clamp, rng: rng, coverRect: coverRect };

  /* ---------- LUT gradien untuk filter duotone ---------- */
  function buildLut(stops) {
    var lut = new Uint8ClampedArray(256 * 3);
    for (var i = 0; i < 256; i++) {
      var t = i / 255, a = stops[0], b = stops[stops.length - 1];
      for (var s = 0; s < stops.length - 1; s++) {
        if (t >= stops[s][0] && t <= stops[s + 1][0]) { a = stops[s]; b = stops[s + 1]; break; }
      }
      var span = (b[0] - a[0]) || 1;
      var k = clamp((t - a[0]) / span, 0, 1);
      for (var c = 0; c < 3; c++) lut[i * 3 + c] = a[1][c] + (b[1][c] - a[1][c]) * k;
    }
    return lut;
  }

  var LUT = {
    doom: buildLut([[0, [2, 8, 4]], [0.45, [10, 78, 38]], [0.8, [61, 255, 139]], [1, [205, 255, 224]]]),
    ash: buildLut([[0, [6, 6, 6]], [1, [236, 236, 230]]]),
    gold: buildLut([[0, [20, 11, 3]], [0.5, [150, 100, 28]], [0.85, [240, 190, 80]], [1, [255, 238, 176]]]),
    crimson: buildLut([[0, [10, 0, 2]], [0.5, [122, 10, 18]], [0.85, [235, 62, 50]], [1, [255, 212, 192]]])
  };

  function duotone(img, lut, contrast, bright, mix, grain, seed) {
    var d = img.data, n = d.length, s = (seed >>> 0) || 1;
    for (var i = 0; i < n; i += 4) {
      var r = d[i], g = d[i + 1], b = d[i + 2];
      var l = (r * 77 + g * 151 + b * 28) >> 8;
      l = (l - 128) * contrast + 128 + bright;
      if (grain) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        l += ((s >>> 24) / 255 - 0.5) * grain;
      }
      l = l < 0 ? 0 : l > 255 ? 255 : l | 0;
      var k = l * 3;
      if (mix > 0) {
        d[i] = lut[k] * (1 - mix) + r * mix;
        d[i + 1] = lut[k + 1] * (1 - mix) + g * mix;
        d[i + 2] = lut[k + 2] * (1 - mix) + b * mix;
      } else {
        d[i] = lut[k]; d[i + 1] = lut[k + 1]; d[i + 2] = lut[k + 2];
      }
    }
  }

  function glitch(img, w, h, seed) {
    var d = img.data;
    var src = new Uint8ClampedArray(d);
    var rnd = rng(seed);
    var shift = Math.max(2, Math.round(w * 0.012));
    var offs = new Int16Array(h);
    var n = 3 + ((rnd() * 5) | 0);
    for (var i = 0; i < n; i++) {
      var y0 = (rnd() * h) | 0;
      var sh = ((h * (0.015 + rnd() * 0.06)) | 0) + 1;
      var o = ((rnd() - 0.5) * w * 0.18) | 0;
      for (var y = y0; y < Math.min(h, y0 + sh); y++) offs[y] = o;
    }
    for (var yy = 0; yy < h; yy++) {
      var row = yy * w, off = offs[yy];
      var dim = (yy % 3 === 0) ? 0.86 : 1;
      for (var x = 0; x < w; x++) {
        var xr = clamp(x + off + shift, 0, w - 1);
        var xg = clamp(x + off, 0, w - 1);
        var xb = clamp(x + off - shift, 0, w - 1);
        var p = (row + x) * 4;
        var r = src[(row + xr) * 4], g = src[(row + xg) * 4 + 1], b = src[(row + xb) * 4 + 2];
        /* kontras ringan + tint dingin */
        r = (r - 128) * 1.12 + 122; g = (g - 128) * 1.12 + 130; b = (b - 128) * 1.12 + 136;
        d[p] = r * dim; d[p + 1] = g * dim; d[p + 2] = b * dim;
      }
    }
  }

  var LIST = [
    { id: 'normal', label: 'Normal' },
    { id: 'doom', label: 'Doom Green' },
    { id: 'ash', label: 'Ash Grayscale' },
    { id: 'gold', label: 'Golden Hour' },
    { id: 'glitch', label: 'Glitch' },
    { id: 'crimson', label: 'Retak Merah' }
  ];

  function apply(id, ctx, w, h, seed) {
    if (!id || id === 'normal') return;
    var img = ctx.getImageData(0, 0, w, h);
    seed = seed | 0;
    switch (id) {
      case 'doom': duotone(img, LUT.doom, 1.25, -6, 0.1, 0, 0); break;
      case 'ash': duotone(img, LUT.ash, 1.3, -8, 0, 22, seed + 17); break;
      case 'gold': duotone(img, LUT.gold, 1.1, 4, 0.2, 0, 0); break;
      case 'crimson': duotone(img, LUT.crimson, 1.25, -6, 0.08, 0, 0); break;
      case 'glitch': glitch(img, w, h, seed + 101); break;
      default: return;
    }
    ctx.putImageData(img, 0, 0);
  }

  DD.filters = { list: LIST, apply: apply };
})();
