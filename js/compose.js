/* DOOMSDAY Photobooth — komposisi: layout, bingkai, stiker, lembar cetak (semua digambar di canvas, aset orisinal) */
(function () {
  'use strict';
  var DD = (window.DD = window.DD || {});
  var U = DD.util;

  var FD = '"Impact","Haettenschweiler","Arial Narrow Bold","Franklin Gothic Medium","Arial Black",sans-serif';
  var FB = 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';

  var LAYOUTS = {
    single: { id: 'single', label: 'Single', cols: 1, rows: 1, count: 1, cw: 1200 },
    strip3: { id: 'strip3', label: 'Strip 3', cols: 1, rows: 3, count: 3, cw: 900 },
    strip4: { id: 'strip4', label: 'Strip 4', cols: 1, rows: 4, count: 4, cw: 800 },
    grid: { id: 'grid', label: 'Grid 2x2', cols: 2, rows: 2, count: 4, cw: 800 }
  };

  function aspectFor(id, portrait) {
    if (id === 'single') return portrait ? 3 / 4 : 4 / 3;
    if (id === 'grid') return 1;
    return 4 / 3;
  }

  function geometry(layoutId, aspect, s) {
    var L = LAYOUTS[layoutId] || LAYOUTS.single;
    var m = Math.round(64 * s), gap = Math.round(36 * s);
    var head = Math.round(150 * s), foot = Math.round(180 * s);
    var cw = Math.round(L.cw * s), ch = Math.round(cw / aspect);
    var W = m * 2 + L.cols * cw + (L.cols - 1) * gap;
    var H = m + head + L.rows * ch + (L.rows - 1) * gap + foot + m;
    var cells = [];
    for (var r = 0; r < L.rows; r++) {
      for (var c = 0; c < L.cols; c++) {
        cells.push({ x: m + c * (cw + gap), y: m + head + r * (ch + gap), w: cw, h: ch });
      }
    }
    return { W: W, H: H, s: s, m: m, gap: gap, head: head, foot: foot, cw: cw, ch: ch, cells: cells, L: L };
  }

  /* ---------- helper gambar ---------- */
  function spaced(ctx, text, cx, cy, spacing) {
    var chars = Array.from(text);
    var ws = chars.map(function (c) { return ctx.measureText(c).width; });
    var total = ws.reduce(function (a, b) { return a + b; }, 0) + spacing * (chars.length - 1);
    var x = cx - total / 2;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    chars.forEach(function (c, i) { ctx.fillText(c, x, cy); x += ws[i] + spacing; });
    return total;
  }

  function measureSpaced(ctx, text, spacing) {
    var t = 0, chars = Array.from(text);
    chars.forEach(function (c) { t += ctx.measureText(c).width; });
    return t + spacing * (chars.length - 1);
  }

  function crack(ctx, x, y, ang, len, w, color, rnd, depth) {
    var steps = Math.max(4, (len / 14) | 0), seg = len / steps, a = ang, cx = x, cy = y;
    var pts = [[x, y]];
    ctx.beginPath(); ctx.moveTo(x, y);
    for (var i = 0; i < steps; i++) {
      a += (rnd() - 0.5) * 0.9;
      cx += Math.cos(a) * seg; cy += Math.sin(a) * seg;
      ctx.lineTo(cx, cy); pts.push([cx, cy]);
    }
    ctx.lineWidth = w; ctx.strokeStyle = color; ctx.stroke();
    if (depth > 0) {
      for (var j = 2; j < pts.length - 1; j++) {
        if (rnd() < 0.35) {
          crack(ctx, pts[j][0], pts[j][1], a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.7),
            len * 0.15 + len * 0.4 * rnd(), w * 0.6, color, rnd, depth - 1);
        }
      }
    }
  }

  /* ---------- tema bingkai ---------- */
  var THEMES = {
    doom: {
      label: 'Doom Hijau', title: 'DOOMSDAY', sub: 'PHOTOBOOTH  //  JAM TERAKHIR',
      bg: [[0, '#050806'], [0.5, '#0b130d'], [1, '#050806']], glow: 'rgba(61,255,139,0.2)',
      pattern: 'hatch', patternColor: 'rgba(61,255,139,0.04)',
      border: 'tech', line: '#3dff8b', line2: 'rgba(61,255,139,0.35)',
      title1: '#9bffc2', title2: '#3dff8b', titleGlow: 'rgba(61,255,139,0.75)',
      accent: '#3dff8b', dim: 'rgba(190,230,205,0.7)', crack: null, cell: '#3dff8b'
    },
    gold: {
      label: 'Emas Retak', title: 'HARI TERAKHIR', sub: 'FINAL HOUR  //  PHOTOBOOTH',
      bg: [[0, '#070605'], [0.5, '#12100a'], [1, '#070605']], glow: 'rgba(224,184,74,0.16)',
      pattern: 'none', patternColor: '',
      border: 'gold', line: '#e0b84a', line2: 'rgba(246,224,143,0.4)',
      title1: '#fff0b0', title2: '#d4a437', titleGlow: 'rgba(224,184,74,0.6)',
      accent: '#e0b84a', dim: 'rgba(240,222,170,0.72)', crack: '#d3202a', cell: '#e0b84a'
    },
    crimson: {
      label: 'Reruntuhan', title: 'RERUNTUHAN', sub: 'ABU  //  API  //  SISA',
      bg: [[0, '#1b0508'], [0.55, '#0a0304'], [1, '#050102']], glow: 'rgba(255,74,79,0.18)',
      pattern: 'specks', patternColor: '',
      border: 'torn', line: '#ff4a4f', line2: 'rgba(255,74,79,0.4)',
      title1: '#ffb0a8', title2: '#ff3b3b', titleGlow: 'rgba(255,59,59,0.7)',
      accent: '#ff4a4f', dim: 'rgba(255,200,196,0.7)', crack: '#ff3b3b', cell: '#ff4a4f'
    },
    latveria: {
      label: 'Latveria', title: 'LATVERIA', sub: 'TAKHTA BESI  //  PENGUASA',
      bg: [[0, '#04120a'], [0.5, '#0a2a18'], [1, '#030c07']], glow: 'rgba(255,212,90,0.16)',
      pattern: 'none', patternColor: '', border: 'rivet', metal: ['#fff0b0', '#8a6a1c'],
      line: '#c9a43a', line2: 'rgba(255,212,90,0.4)',
      title1: '#fff0b0', title2: '#c9a43a', titleGlow: 'rgba(61,255,139,0.55)',
      accent: '#ffd45a', dim: 'rgba(190,235,205,0.75)', crack: null, cell: '#1fae5c'
    },
    steel: {
      label: 'Zirah Baja', title: 'ZIRAH BAJA', sub: 'MARK  //  DOOM',
      bg: [[0, '#1d2421'], [0.5, '#2c3531'], [1, '#141a18']], glow: 'rgba(61,255,139,0.12)',
      pattern: 'brushed', patternColor: '', border: 'rivet', metal: ['#eef3f0', '#6f7c76'],
      line: '#9db0a6', line2: 'rgba(61,255,139,0.35)',
      title1: '#eef6f0', title2: '#9db0a6', titleGlow: 'rgba(61,255,139,0.6)',
      accent: '#3dff8b', dim: 'rgba(220,235,226,0.75)', crack: null, cell: '#3dff8b'
    },
    multiverse: {
      label: 'Multiverse', title: 'MULTIVERSE', sub: 'TIGA SEMESTA  //  SATU ANCAMAN',
      bg: [[0, '#0b0620'], [0.5, '#130a33'], [1, '#050312']], glow: 'rgba(120,220,255,0.18)',
      pattern: 'rings', patternColor: 'rgba(140,200,255,0.08)', border: 'portal',
      line: '#6fe3ff', line2: 'rgba(180,120,255,0.45)',
      title1: '#d9f6ff', title2: '#8f7bff', titleGlow: 'rgba(120,200,255,0.7)',
      accent: '#7fe8ff', dim: 'rgba(200,215,255,0.75)', crack: '#c07bff', cell: '#7fe8ff'
    },
    pixel: {
      label: 'Pixel Konsol', title: 'DOOM BOOTH', sub: 'SESI SIAGA',
      bg: [[0, '#06150e'], [1, '#06150e']], glow: null,
      pattern: 'grid', patternColor: 'rgba(61,255,139,0.1)', border: 'pixel',
      line: '#2f8f5d', line2: '#000',
      title1: '#ffe58a', title2: '#ffd45a', titleGlow: null,
      accent: '#ffd45a', dim: '#92b9a2', crack: null, cell: '#6fe3a0'
    },
    plain: {
      label: 'Polos Arang', title: 'DOOMSDAY', sub: 'PHOTOBOOTH',
      bg: [[0, '#f3f1ea'], [1, '#f3f1ea']], glow: null,
      pattern: 'none', patternColor: '',
      border: 'thin', line: '#14201a', line2: 'rgba(20,32,26,0.4)',
      title1: '#14201a', title2: '#14201a', titleGlow: null,
      accent: '#14201a', dim: 'rgba(20,32,26,0.7)', crack: null, cell: '#14201a'
    }
  };
  var FRAME_LIST = Object.keys(THEMES).map(function (k) { return { id: k, label: THEMES[k].label }; });

  function drawBg(ctx, g, th, rnd) {
    var W = g.W, H = g.H, s = g.s, i;
    var gr = ctx.createLinearGradient(0, 0, 0, H);
    th.bg.forEach(function (st) { gr.addColorStop(st[0], st[1]); });
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    if (th.glow) {
      var rg = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, Math.max(W, H * 0.6));
      rg.addColorStop(0, th.glow); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    }
    if (th.pattern === 'hatch') {
      ctx.strokeStyle = th.patternColor; ctx.lineWidth = Math.max(1, s);
      for (var k = -H; k < W; k += 18 * s) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + H, H); ctx.stroke(); }
    } else if (th.pattern === 'specks') {
      var n = Math.round((W * H) / 5000);
      for (i = 0; i < n; i++) {
        ctx.fillStyle = 'rgba(255,200,190,' + (0.04 + rnd() * 0.12).toFixed(3) + ')';
        var sz = (1 + rnd() * 3) * s;
        ctx.fillRect(rnd() * W, rnd() * H, sz, sz);
      }
    }
    if (th.pattern === 'grid') {
      ctx.strokeStyle = th.patternColor; ctx.lineWidth = Math.max(1, 2 * s);
      for (var gx = 0; gx < W; gx += 48 * s) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
      for (var gy = 0; gy < H; gy += 48 * s) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
    } else if (th.pattern === 'rings') {
      ctx.strokeStyle = th.patternColor; ctx.lineWidth = Math.max(1, 2 * s);
      for (var rr = 120 * s; rr < Math.max(W, H); rr += 110 * s) { ctx.beginPath(); ctx.arc(W / 2, H * 0.45, rr, 0, 6.2832); ctx.stroke(); }
    } else if (th.pattern === 'brushed') {
      ctx.lineWidth = Math.max(1, s);
      for (var by = 0; by < H; by += 3 * s) {
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.02 + rnd() * 0.06).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(W, by); ctx.stroke();
      }
    }
    if (th.crack) {
      ctx.save();
      ctx.shadowColor = th.crack; ctx.shadowBlur = 14 * s; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      var corners = [[0, 0, Math.PI * 0.25], [W, 0, Math.PI * 0.75], [0, H, -Math.PI * 0.25], [W, H, -Math.PI * 0.75]];
      corners.forEach(function (c) {
        crack(ctx, c[0], c[1], c[2], Math.min(W, H) * 0.34, 5 * s, th.crack, rnd, 2);
      });
      ctx.restore();
    }
  }

  function drawBorder(ctx, g, th, rnd) {
    var W = g.W, H = g.H, s = g.s, i;
    ctx.save();
    if (th.border === 'tech') {
      ctx.shadowColor = th.line; ctx.shadowBlur = 12 * s;
      ctx.strokeStyle = th.line; ctx.lineWidth = 4 * s;
      var a = 20 * s, len = 90 * s;
      [[a, a, 1, 1], [W - a, a, -1, 1], [a, H - a, 1, -1], [W - a, H - a, -1, -1]].forEach(function (c) {
        ctx.beginPath(); ctx.moveTo(c[0], c[1] + c[3] * len); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0] + c[2] * len, c[1]); ctx.stroke();
      });
      ctx.shadowBlur = 0; ctx.strokeStyle = th.line2; ctx.lineWidth = 1.5 * s;
      ctx.strokeRect(36 * s, 36 * s, W - 72 * s, H - 72 * s);
      for (i = 1; i < 12; i++) {
        var x = (W / 12) * i;
        ctx.beginPath(); ctx.moveTo(x, 36 * s); ctx.lineTo(x, 44 * s); ctx.moveTo(x, H - 36 * s); ctx.lineTo(x, H - 44 * s); ctx.stroke();
      }
    } else if (th.border === 'gold') {
      var gg = ctx.createLinearGradient(0, 0, W, H);
      gg.addColorStop(0, '#fff0b0'); gg.addColorStop(0.3, '#d4a437'); gg.addColorStop(0.55, '#7a5a14');
      gg.addColorStop(0.8, '#e8c25a'); gg.addColorStop(1, '#8a6a1c');
      ctx.strokeStyle = gg; ctx.lineWidth = 22 * s; ctx.strokeRect(26 * s, 26 * s, W - 52 * s, H - 52 * s);
      ctx.strokeStyle = th.line2; ctx.lineWidth = 2 * s; ctx.strokeRect(46 * s, 46 * s, W - 92 * s, H - 92 * s);
      ctx.fillStyle = gg;
      [[26, 26], [W / s - 26, 26], [26, H / s - 26], [W / s - 26, H / s - 26]].forEach(function (c) {
        var x = c[0] * s, y = c[1] * s, r = 26 * s;
        ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill();
      });
    } else if (th.border === 'torn') {
      ctx.shadowColor = th.line; ctx.shadowBlur = 10 * s; ctx.lineJoin = 'miter';
      [[26, 5, 1], [42, 3, 0.45]].forEach(function (cfg) {
        var inset = cfg[0] * s, amp = 10 * s, step = 30 * s;
        ctx.strokeStyle = th.line; ctx.globalAlpha = cfg[2]; ctx.lineWidth = cfg[1] * s;
        ctx.beginPath();
        var x, y;
        for (x = inset; x <= W - inset; x += step) { y = inset + (rnd() - 0.5) * amp; x === inset ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        for (y = inset; y <= H - inset; y += step) { ctx.lineTo(W - inset + (rnd() - 0.5) * amp, y); }
        for (x = W - inset; x >= inset; x -= step) { ctx.lineTo(x, H - inset + (rnd() - 0.5) * amp); }
        for (y = H - inset; y >= inset; y -= step) { ctx.lineTo(inset + (rnd() - 0.5) * amp, y); }
        ctx.closePath(); ctx.stroke();
      });
    } else if (th.border === 'rivet') {
      var mg = ctx.createLinearGradient(0, 0, W, H);
      mg.addColorStop(0, th.metal[0]); mg.addColorStop(0.5, th.metal[1]); mg.addColorStop(1, th.metal[0]);
      ctx.strokeStyle = mg; ctx.lineWidth = 30 * s; ctx.strokeRect(30 * s, 30 * s, W - 60 * s, H - 60 * s);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2 * s;
      ctx.strokeRect(15 * s, 15 * s, W - 30 * s, H - 30 * s); ctx.strokeRect(45 * s, 45 * s, W - 90 * s, H - 90 * s);
      var sp = 80 * s, rv = function (x, y) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(x, y, 7 * s, 0, 6.2832); ctx.fill();
        ctx.fillStyle = th.metal[0]; ctx.beginPath(); ctx.arc(x - s, y - s, 4.5 * s, 0, 6.2832); ctx.fill();
      };
      for (var rx = 60 * s; rx < W - 40 * s; rx += sp) { rv(rx, 30 * s); rv(rx, H - 30 * s); }
      for (var ry = 60 * s; ry < H - 40 * s; ry += sp) { rv(30 * s, ry); rv(W - 30 * s, ry); }
    } else if (th.border === 'pixel') {
      var px = function (inset, lw, col) { ctx.lineWidth = lw * s; ctx.strokeStyle = col; ctx.strokeRect(inset * s, inset * s, W - inset * 2 * s, H - inset * 2 * s); };
      px(26, 20, '#000'); px(26, 12, th.line); px(31, 4, '#6fe3a0');
      ctx.fillStyle = th.bg[0][1];
      [[0, 0], [W - 20 * s, 0], [0, H - 20 * s], [W - 20 * s, H - 20 * s]].forEach(function (c) { ctx.fillRect(c[0], c[1], 20 * s, 20 * s); });
    } else if (th.border === 'portal') {
      ctx.strokeStyle = th.line2; ctx.lineWidth = 2 * s; ctx.strokeRect(34 * s, 34 * s, W - 68 * s, H - 68 * s);
      ctx.shadowColor = th.line; ctx.shadowBlur = 10 * s;
      var pc = [[34, 34, th.line], [W / s - 34, 34, '#c07bff'], [34, H / s - 34, '#ff5fa8'], [W / s - 34, H / s - 34, th.line]];
      pc.forEach(function (c) {
        ctx.strokeStyle = c[2]; ctx.lineWidth = 3 * s; ctx.setLineDash([10 * s, 8 * s]);
        ctx.beginPath(); ctx.arc(c[0] * s, c[1] * s, 44 * s, 0, 6.2832); ctx.stroke();
        ctx.beginPath(); ctx.arc(c[0] * s, c[1] * s, 26 * s, 0, 6.2832); ctx.stroke();
      });
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = th.line; ctx.lineWidth = 3 * s;
      ctx.strokeRect(26 * s, 26 * s, W - 52 * s, H - 52 * s);
      ctx.lineWidth = 1 * s; ctx.strokeStyle = th.line2;
      ctx.strokeRect(34 * s, 34 * s, W - 68 * s, H - 68 * s);
    }
    ctx.restore();
  }

  function drawCellLines(ctx, g, th) {
    ctx.save();
    ctx.strokeStyle = th.cell; ctx.lineWidth = Math.max(2, 4 * g.s);
    if (th.border !== 'plain' && th.glow) { ctx.shadowColor = th.cell; ctx.shadowBlur = 10 * g.s; }
    g.cells.forEach(function (c) { ctx.strokeRect(c.x, c.y, c.w, c.h); });
    ctx.restore();
  }

  function fmtDate(d) {
    var date = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
    var hh = ('0' + d.getHours()).slice(-2), mm = ('0' + d.getMinutes()).slice(-2);
    return date + '  •  ' + hh + ':' + mm;
  }

  function drawTexts(ctx, g, th, o) {
    var W = g.W, s = g.s, i;
    ctx.save();
    /* judul: ukuran menyesuaikan lebar */
    var size = g.head * 0.52, spacing;
    for (i = 0; i < 6; i++) {
      ctx.font = '900 ' + size + 'px ' + FD;
      spacing = size * 0.12;
      var tw = measureSpaced(ctx, th.title, spacing);
      if (tw <= W * 0.82) break;
      size *= (W * 0.82) / tw;
    }
    var ty = g.m + g.head * 0.4;
    var tg = ctx.createLinearGradient(0, ty - size / 2, 0, ty + size / 2);
    tg.addColorStop(0, th.title1); tg.addColorStop(1, th.title2);
    if (th.titleGlow) { ctx.shadowColor = th.titleGlow; ctx.shadowBlur = size * 0.35; }
    ctx.fillStyle = tg;
    spaced(ctx, th.title, W / 2, ty, spacing);
    ctx.shadowBlur = 0;

    var ss = Math.max(12 * s, Math.min(g.head * 0.15, W * 0.032));
    ctx.font = '700 ' + ss + 'px ' + FB;
    ctx.fillStyle = th.dim;
    spaced(ctx, th.sub, W / 2, g.m + g.head * 0.8, ss * 0.22);

    /* footer */
    var last = g.cells[g.cells.length - 1];
    var fTop = last.y + last.h;
    ctx.strokeStyle = th.line2; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.moveTo(W * 0.25, fTop + g.foot * 0.14); ctx.lineTo(W * 0.75, fTop + g.foot * 0.14); ctx.stroke();
    var fs1 = Math.max(12 * s, Math.min(g.foot * 0.19, W * 0.04));
    ctx.font = '800 ' + fs1 + 'px ' + FB; ctx.fillStyle = th.accent;
    spaced(ctx, fmtDate(o.date || new Date()), W / 2, fTop + g.foot * 0.38, fs1 * 0.12);
    var fs2 = fs1 * 0.68;
    ctx.font = '600 ' + fs2 + 'px ' + FB; ctx.fillStyle = th.dim;
    spaced(ctx, 'SESI ' + (o.code || '0000') + '  •  FOTO TIDAK DIUNGGAH', W / 2, fTop + g.foot * 0.62, fs2 * 0.14);
    ctx.restore();
  }

  /* ---------- stiker (orisinal) ---------- */
  function hexPath(ctx, r) {
    ctx.beginPath();
    for (var i = 0; i < 6; i++) {
      var a = Math.PI / 3 * i - Math.PI / 2, x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  var STK = {
    sigil: function (ctx, px) {
      hexPath(ctx, 0.95); ctx.fillStyle = 'rgba(5,12,8,0.88)'; ctx.fill();
      ctx.shadowColor = '#3dff8b'; ctx.shadowBlur = px * 0.25; ctx.lineWidth = 0.09; ctx.strokeStyle = '#3dff8b'; ctx.stroke();
      ctx.shadowBlur = 0; hexPath(ctx, 0.66); ctx.lineWidth = 0.05; ctx.strokeStyle = '#e0b84a'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -0.4); ctx.lineTo(0.35, 0.25); ctx.lineTo(-0.35, 0.25); ctx.closePath();
      ctx.fillStyle = '#e0b84a'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0.03, 0.09, 0, 6.2832); ctx.fillStyle = '#050c08'; ctx.fill();
    },
    bolt: function (ctx, px) {
      var p = [[0.22, -1], [-0.55, 0.15], [-0.08, 0.15], [-0.25, 1], [0.55, -0.22], [0.08, -0.22], [0.45, -1]];
      ctx.beginPath(); p.forEach(function (q, i) { if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath();
      var g = ctx.createLinearGradient(0, -1, 0, 1); g.addColorStop(0, '#fff0b0'); g.addColorStop(1, '#d4a437');
      ctx.shadowColor = '#e0b84a'; ctx.shadowBlur = px * 0.3; ctx.fillStyle = g; ctx.fill();
      ctx.shadowBlur = 0; ctx.lineWidth = 0.07; ctx.strokeStyle = '#1a1405'; ctx.stroke();
    },
    warn: function (ctx, px) {
      ctx.beginPath(); ctx.moveTo(0, -0.95); ctx.lineTo(0.92, 0.7); ctx.lineTo(-0.92, 0.7); ctx.closePath();
      ctx.shadowColor = '#ff3b3b'; ctx.shadowBlur = px * 0.25; ctx.fillStyle = '#c4161c'; ctx.fill();
      ctx.shadowBlur = 0; ctx.lineWidth = 0.1; ctx.strokeStyle = '#e0b84a'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillRect(-0.07, -0.4, 0.14, 0.62);
      ctx.beginPath(); ctx.arc(0, 0.45, 0.09, 0, 6.2832); ctx.fill();
    },
    crack: function (ctx, px) {
      var r = U.rng(7);
      ctx.shadowColor = '#ff3b3b'; ctx.shadowBlur = px * 0.25; ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 0.07;
      for (var i = 0; i < 8; i++) {
        var a = (Math.PI * 2 / 8) * i + r() * 0.3, x = 0, y = 0;
        ctx.beginPath(); ctx.moveTo(0, 0);
        for (var k = 0; k < 4; k++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 0.24; y += Math.sin(a) * 0.24; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(0, 0, 0.14, 0, 6.2832); ctx.fillStyle = '#050102'; ctx.fill();
      ctx.lineWidth = 0.04; ctx.strokeStyle = '#ffb0a8'; ctx.stroke();
    },
    eye: function (ctx, px) {
      ctx.beginPath(); ctx.moveTo(-0.95, 0); ctx.quadraticCurveTo(0, -0.9, 0.95, 0); ctx.quadraticCurveTo(0, 0.9, -0.95, 0); ctx.closePath();
      ctx.fillStyle = '#050c08'; ctx.fill();
      ctx.shadowColor = '#e0b84a'; ctx.shadowBlur = px * 0.2; ctx.lineWidth = 0.07; ctx.strokeStyle = '#e0b84a'; ctx.stroke();
      ctx.shadowBlur = 0;
      var g = ctx.createRadialGradient(0, 0, 0.05, 0, 0, 0.4); g.addColorStop(0, '#bfffd6'); g.addColorStop(1, '#1fae5c');
      ctx.beginPath(); ctx.arc(0, 0, 0.4, 0, 6.2832); ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 0, 0.08, 0.34, 0, 0, 6.2832); ctx.fillStyle = '#000'; ctx.fill();
    },
    planet: function (ctx, px) {
      var zig = [[0.05, -1], [-0.12, -0.5], [0.1, -0.1], [-0.1, 0.3], [0.08, 0.7], [0, 1]];
      function half(side, dx) {
        ctx.save(); ctx.beginPath(); ctx.moveTo(side * 2, -2);
        zig.forEach(function (p) { ctx.lineTo(p[0], p[1]); });
        ctx.lineTo(side * 2, 2); ctx.closePath(); ctx.clip();
        ctx.translate(dx, 0);
        var g = ctx.createRadialGradient(-0.3, -0.3, 0.1, 0, 0, 0.95); g.addColorStop(0, '#5f7366'); g.addColorStop(1, '#0e1411');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 0.8, 0, 6.2832); ctx.fill();
        ctx.restore();
      }
      half(-1, -0.07); half(1, 0.07);
      ctx.save(); ctx.shadowColor = '#ff3b3b'; ctx.shadowBlur = px * 0.25; ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 0.04;
      ctx.beginPath(); zig.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.stroke();
      ctx.restore();
    }
  };

  var MASK_ART = [
    '....oooooooo....', '..oohhhhhhhhoo..', '.ohhhhhhhhhhhho.', '.ohhhmmmmmmhhho.', 'ohhhmmmmmmmmhhho', 'ohhmmmmmmmmmmhho',
    'ohhmeemmmmeemhho', 'ohhmmemmmmemmhho', 'ohhmmmmssmmmmhho', 'ohhmmmmsskmmmhho', 'ohhhmmmmmmmmhhho', 'ohhhmskskskmhhho',
    'ohhhhmmmmmmhhhho', '.ohhhhhmmhhhhho.', '..ohhhhhhhhhho..', '...oooooooooo...'
  ];
  var MASK_COL = { o: '#000', h: '#14502f', m: '#b4beb8', s: '#6f7a74', e: '#3dff8b', k: '#0a0f0c' };

  STK.topeng = function (ctx) {
    var c = 1.9 / 16;
    for (var y = 0; y < 16; y++) {
      for (var x = 0; x < 16; x++) {
        var ch = MASK_ART[y].charAt(x);
        if (ch === '.') continue;
        ctx.fillStyle = MASK_COL[ch]; ctx.fillRect(-0.95 + x * c, -0.95 + y * c, c + 0.004, c + 0.004);
      }
    }
  };
  STK.portal = function (ctx, px) {
    var g = ctx.createRadialGradient(0, 0, 0.05, 0, 0, 0.9); g.addColorStop(0, '#fffbe0'); g.addColorStop(0.35, 'rgba(61,255,139,0.55)'); g.addColorStop(1, 'rgba(3,12,7,0.9)');
    ctx.beginPath(); ctx.arc(0, 0, 0.92, 0, 6.2832); ctx.fillStyle = g; ctx.fill();
    ctx.shadowColor = '#3dff8b'; ctx.shadowBlur = px * 0.25;
    [[0.9, '#3dff8b', [0.16, 0.09]], [0.66, '#e0b84a', [0.08, 0.08]], [0.42, '#fff', [0.04, 0.07]]].forEach(function (r) {
      ctx.setLineDash(r[2]); ctx.lineWidth = 0.07; ctx.strokeStyle = r[1]; ctx.beginPath(); ctx.arc(0, 0, r[0], 0, 6.2832); ctx.stroke();
    });
    ctx.setLineDash([]);
  };
  STK.cabang = function (ctx, px) {
    ctx.shadowColor = '#3dff8b'; ctx.shadowBlur = px * 0.2; ctx.lineWidth = 0.08; ctx.lineCap = 'round';
    function path(col, pts) { ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); ctx.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]); ctx.stroke(); }
    path('#3dff8b', [-0.9, 0.1, -0.3, 0.1, -0.1, 0.1, 0.1, 0.1]);
    path('#e0b84a', [0.1, 0.1, 0.35, -0.1, 0.4, -0.5, 0.85, -0.6]);
    path('#3dff8b', [0.1, 0.1, 0.4, 0.1, 0.55, 0.15, 0.85, 0.15]);
    path('#ff4a4f', [0.1, 0.1, 0.3, 0.4, 0.35, 0.6, 0.55, 0.85]);
    ctx.shadowBlur = 0; ctx.fillStyle = '#050c08'; ctx.lineWidth = 0.06;
    [[0.1, 0.1, '#fff'], [0.85, -0.6, '#e0b84a'], [0.85, 0.15, '#3dff8b']].forEach(function (n) { ctx.strokeStyle = n[2]; ctx.beginPath(); ctx.arc(n[0], n[1], 0.1, 0, 6.2832); ctx.fill(); ctx.stroke(); });
    ctx.strokeStyle = '#ff4a4f'; ctx.beginPath(); ctx.moveTo(0.47, 0.77); ctx.lineTo(0.63, 0.93); ctx.moveTo(0.63, 0.77); ctx.lineTo(0.47, 0.93); ctx.stroke();
  };
  STK.pecahan = function (ctx, px) {
    var shards = [[[-0.15, -0.95], [0.12, -0.15], [-0.28, -0.05]], [[0.45, -0.7], [0.8, 0.1], [0.3, 0.1]], [[-0.7, -0.2], [-0.35, 0.5], [-0.85, 0.55]], [[0.05, 0.1], [0.4, 0.95], [-0.25, 0.75]]];
    shards.forEach(function (sh) {
      ctx.beginPath(); sh.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath();
      var g = ctx.createLinearGradient(-1, -1, 1, 1); g.addColorStop(0, '#e3e8e5'); g.addColorStop(0.5, '#6f7a74'); g.addColorStop(1, '#1c2420');
      ctx.fillStyle = g; ctx.fill(); ctx.shadowColor = '#3dff8b'; ctx.shadowBlur = px * 0.18; ctx.lineWidth = 0.05; ctx.strokeStyle = '#3dff8b'; ctx.stroke();
    });
  };
  STK.api = function (ctx, px) {
    ctx.beginPath(); ctx.moveTo(0, 0.95); ctx.bezierCurveTo(-0.7, 0.8, -0.8, 0.1, -0.3, -0.3); ctx.bezierCurveTo(-0.35, -0.1, -0.1, -0.1, 0, -0.95);
    ctx.bezierCurveTo(0.2, -0.5, 0.8, -0.2, 0.65, 0.35); ctx.bezierCurveTo(0.6, 0.7, 0.3, 0.95, 0, 0.95); ctx.closePath();
    var g = ctx.createLinearGradient(0, -1, 0, 1); g.addColorStop(0, '#ffd45a'); g.addColorStop(0.5, '#ff7a2a'); g.addColorStop(1, '#c4161c');
    ctx.shadowColor = '#ff4a4f'; ctx.shadowBlur = px * 0.3; ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0; ctx.lineWidth = 0.05; ctx.strokeStyle = '#2a0a04'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0.8); ctx.bezierCurveTo(-0.3, 0.7, -0.35, 0.3, -0.1, 0.05); ctx.bezierCurveTo(0.1, 0.3, 0.35, 0.4, 0.2, 0.7); ctx.bezierCurveTo(0.15, 0.8, 0.05, 0.8, 0, 0.8); ctx.fillStyle = '#fff0b0'; ctx.fill();
  };
  STK.orb = function (ctx, px) {
    var g = ctx.createRadialGradient(-0.3, -0.3, 0.05, 0, 0, 0.8); g.addColorStop(0, '#e8fff0'); g.addColorStop(0.4, '#3dff8b'); g.addColorStop(1, '#0a3a20');
    ctx.shadowColor = '#3dff8b'; ctx.shadowBlur = px * 0.35; ctx.beginPath(); ctx.arc(0, 0, 0.62, 0, 6.2832); ctx.fillStyle = g; ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = 0.07; ctx.strokeStyle = '#e0b84a'; ctx.beginPath(); ctx.ellipse(0, 0, 0.92, 0.3, -0.5, 0, 6.2832); ctx.stroke();
  };
  STK.rune = function (ctx, px) {
    ctx.beginPath(); ctx.arc(0, 0, 0.92, 0, 6.2832); ctx.fillStyle = 'rgba(5,12,8,0.9)'; ctx.fill();
    ctx.shadowColor = '#e0b84a'; ctx.shadowBlur = px * 0.2; ctx.lineWidth = 0.07; ctx.strokeStyle = '#e0b84a'; ctx.stroke();
    ctx.lineWidth = 0.05; ctx.strokeStyle = '#3dff8b';
    ctx.beginPath(); ctx.moveTo(0, -0.62); ctx.lineTo(0.54, 0.31); ctx.lineTo(-0.54, 0.31); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0.62); ctx.lineTo(0.54, -0.31); ctx.lineTo(-0.54, -0.31); ctx.closePath(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(0, 0, 0.1, 0, 6.2832); ctx.fillStyle = '#fff0b0'; ctx.fill();
  };
  STK.bintang = function (ctx, px) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.4 : 0.95; if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); var g = ctx.createLinearGradient(0, -1, 0, 1); g.addColorStop(0, '#fff0b0'); g.addColorStop(1, '#d4a437');
    ctx.shadowColor = '#e0b84a'; ctx.shadowBlur = px * 0.3; ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0; ctx.lineWidth = 0.07; ctx.strokeStyle = '#1a1405'; ctx.stroke();
  };

  var STICKER_LIST = [
    { id: 'sigil', label: 'Segel Hex' }, { id: 'bolt', label: 'Petir' }, { id: 'warn', label: 'Awas' },
    { id: 'crack', label: 'Retak' }, { id: 'eye', label: 'Mata' }, { id: 'planet', label: 'Dunia Retak' },
    { id: 'topeng', label: 'Topeng Pixel' }, { id: 'portal', label: 'Portal' }, { id: 'cabang', label: 'Cabang Waktu' },
    { id: 'pecahan', label: 'Pecahan' }, { id: 'api', label: 'Api' }, { id: 'orb', label: 'Inti Energi' },
    { id: 'rune', label: 'Rune' }, { id: 'bintang', label: 'Bintang' }
  ];

  /* Stiker dibuat seperti stiker cetak asli: gambar datar + tepi putih die-cut + bayangan + kilap tipis */
  var spriteCache = {};
  function makeSprite(id, S) {
    var key = id + '|' + S;
    if (spriteCache[key]) return spriteCache[key];
    var fn = STK[id];
    var b = Math.max(2, S * 0.055);
    var N = Math.ceil(S + b * 4 + 4), c = N / 2;
    var art = document.createElement('canvas'); art.width = art.height = N;
    var a = art.getContext('2d');
    a.save(); a.translate(c, c); a.scale(S / 2 * 0.86, S / 2 * 0.86);
    a.lineJoin = 'round'; a.lineCap = 'round';
    fn(a, 0);
    a.restore();
    /* kilap: cahaya dari kiri atas, gelap tipis di bawah, hanya di area gambar */
    a.save(); a.globalCompositeOperation = 'source-atop';
    var gl = a.createLinearGradient(c - S * 0.45, c - S * 0.45, c + S * 0.45, c + S * 0.45);
    gl.addColorStop(0, 'rgba(255,255,255,0.28)'); gl.addColorStop(0.45, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(0,0,0,0.22)');
    a.fillStyle = gl; a.fillRect(0, 0, N, N);
    a.restore();
    /* siluet tepi putih */
    var sil = document.createElement('canvas'); sil.width = sil.height = N;
    var s = sil.getContext('2d');
    for (var i = 0; i < 24; i++) {
      var an = i / 24 * Math.PI * 2;
      s.drawImage(art, Math.cos(an) * b, Math.sin(an) * b);
    }
    s.globalCompositeOperation = 'source-in'; s.fillStyle = '#f6f2e4'; s.fillRect(0, 0, N, N);
    var out = document.createElement('canvas'); out.width = out.height = N;
    var o = out.getContext('2d');
    o.drawImage(sil, 0, 0);
    o.drawImage(art, 0, 0);
    return (spriteCache[key] = { cv: out, N: N, b: b });
  }

  function drawSticker(ctx, id, x, y, size, rot) {
    if (!STK[id]) return;
    var m = ctx.getTransform ? ctx.getTransform() : null;
    var k = m ? (Math.hypot(m.a, m.b) || 1) : 1;
    var S = Math.max(8, Math.round(size * k));
    var sp = makeSprite(id, S);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot || 0);
    ctx.shadowColor = 'rgba(0,0,0,0.38)'; ctx.shadowBlur = sp.b * 1.6; ctx.shadowOffsetX = sp.b * 0.4; ctx.shadowOffsetY = sp.b * 0.9;
    var w = sp.N / k;
    ctx.drawImage(sp.cv, -w / 2, -w / 2, w, w);
    ctx.restore();
  }

  var ANCHORS = [[0.08, 0.1], [0.92, 0.1], [0.08, 0.9], [0.92, 0.9], [0.5, 0.06], [0.5, 0.94]];

  function placeStickers(ctx, g, ids) {
    if (!ids || !ids.length) return;
    var size = Math.min(g.cw, g.ch) * 0.24;
    ids.forEach(function (id, k) {
      g.cells.forEach(function (c, ci) {
        if (g.cells.length > 1 && ((ci + k) % 2 !== 0)) return;
        var an = g.cells.length === 1 ? ANCHORS[k % ANCHORS.length] : ANCHORS[(k * 2 + ci) % 4];
        var r = U.rng(k * 131 + ci * 17 + 5);
        var jx = (r() - 0.5) * 0.06, jy = (r() - 0.5) * 0.06;
        drawSticker(ctx, id, c.x + c.w * (an[0] + jx), c.y + c.h * (an[1] + jy), size * (0.85 + r() * 0.3), (r() - 0.5) * 0.95);
      });
    });
  }

  /* ---------- render utama ---------- */
  var tmp = null, tctx = null;
  function getTmp(w, h) {
    if (!tmp) { tmp = document.createElement('canvas'); tctx = tmp.getContext('2d', { willReadFrequently: true }); }
    tmp.width = w; tmp.height = h;
    return tctx;
  }

  function vignette(ctx, w, h) {
    var rg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
  }

  /* o: {photos, layoutId, aspect, frameId, filterId, stickers, scale, seed, date, code}; target opsional */
  function render(o, target) {
    var s = o.scale || 1;
    var g = geometry(o.layoutId, o.aspect, s);
    var th = THEMES[o.frameId] || THEMES.doom;
    var cv = target || document.createElement('canvas');
    cv.width = g.W; cv.height = g.H;
    var ctx = cv.getContext('2d');
    var rnd = U.rng(((o.seed | 0) + 7) * 31);

    drawBg(ctx, g, th, rnd);

    var t = getTmp(g.cw, g.ch);
    g.cells.forEach(function (cell, i) {
      var p = o.photos && o.photos[i];
      if (!p) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
        return;
      }
      var r = U.coverRect(p.width, p.height, g.cw / g.ch);
      t.drawImage(p, r.sx, r.sy, r.sw, r.sh, 0, 0, g.cw, g.ch);
      DD.filters.apply(o.filterId, t, g.cw, g.ch, (o.seed | 0) + i * 977);
      if (o.frameId !== 'plain') vignette(t, g.cw, g.ch);
      ctx.drawImage(tmp, cell.x, cell.y);
    });

    drawBorder(ctx, g, th, rnd);
    drawCellLines(ctx, g, th);
    drawTexts(ctx, g, th, o);
    placeStickers(ctx, g, o.stickers);
    return cv;
  }

  /* Lembar cetak 4x6 inci @300dpi (strip → 2 salinan berdampingan) */
  function printSheet(src, layoutId) {
    var strip = layoutId === 'strip3' || layoutId === 'strip4';
    var SW, SH, copies;
    if (strip) { SW = 1800; SH = 1200; copies = 2; }
    else if (src.width / src.height > 1) { SW = 1800; SH = 1200; copies = 1; }
    else { SW = 1200; SH = 1800; copies = 1; }
    var cv = document.createElement('canvas'); cv.width = SW; cv.height = SH;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, SW, SH);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    var pad = 60, bw = copies === 2 ? (SW - pad * 3) / 2 : SW - pad * 2, bh = SH - pad * 2;
    var k = Math.min(bw / src.width, bh / src.height), dw = src.width * k, dh = src.height * k;
    for (var i = 0; i < copies; i++) {
      var bx = pad + i * (bw + pad);
      ctx.drawImage(src, bx + (bw - dw) / 2, pad + (bh - dh) / 2, dw, dh);
    }
    if (copies === 2) {
      ctx.save(); ctx.strokeStyle = '#b5b5b5'; ctx.lineWidth = 2; ctx.setLineDash([14, 12]);
      ctx.beginPath(); ctx.moveTo(SW / 2, 20); ctx.lineTo(SW / 2, SH - 20); ctx.stroke(); ctx.restore();
    }
    return cv;
  }

  function toBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      try { canvas.toBlob(function (b) { resolve(b); }, type, quality); } catch (e) { resolve(null); }
    });
  }

  DD.compose = {
    LAYOUTS: LAYOUTS, FRAMES: FRAME_LIST, STICKERS: STICKER_LIST,
    aspectFor: aspectFor, geometry: geometry, render: render,
    printSheet: printSheet, toBlob: toBlob, drawSticker: drawSticker
  };
})();
