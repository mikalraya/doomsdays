/* DOOMSDAY Photobooth — alur aplikasi, UI, sesi foto, hasil & ekspor */
(function () {
  'use strict';
  var DD = window.DD;
  var U = DD.util, C = DD.compose;

  function $(id) { return document.getElementById(id); }
  var SCREENS = ['landing', 'setup', 'permission', 'booth', 'result'];
  var MAX_UPLOAD = 15 * 1024 * 1024;
  var MAX_PIXELS = 80e6;

  var state = {
    screen: 'landing',
    layoutId: 'strip3', aspect: 4 / 3, timer: 3, mirror: true,
    filterId: 'doom', frameId: 'doom', stickers: [],
    photos: [], version: 0, retakeIndex: -1, source: 'camera',
    pendingUpload: false, uploadTarget: -1,
    running: false, cancelled: false, wake: null,
    date: new Date(), code: '0000', seed: 1, camStopped: false
  };

  /* ---------------- util UI ---------------- */
  var toastTimer = 0;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3800);
  }
  function announce(msg) { $('live').textContent = msg; }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function restartAnim(node, cls) { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }
  function currentAspect() { return C.aspectFor(state.layoutId, window.innerHeight >= window.innerWidth); }
  function layout() { return C.LAYOUTS[state.layoutId]; }

  /* ---------------- grup radio (chip/segmen/kartu) ---------------- */
  var syncers = [];
  function syncAll() { syncers.forEach(function (f) { f(); }); }

  function radioGroup(container, items, getV, setV, renderItem, cls) {
    items.forEach(function (it) {
      var b = el('button', cls || 'chip');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.value = String(it.id);
      renderItem(b, it);
      container.appendChild(b);
    });
    function sync() {
      Array.prototype.forEach.call(container.children, function (b) {
        var on = b.dataset.value === String(getV());
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
        b.classList.toggle('is-on', on);
      });
    }
    container.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || !container.contains(b)) return;
      setV(b.dataset.value);
      syncAll();
    });
    container.addEventListener('keydown', function (e) {
      var k = e.key, d = 0;
      if (k === 'ArrowRight' || k === 'ArrowDown') d = 1;
      else if (k === 'ArrowLeft' || k === 'ArrowUp') d = -1;
      else return;
      e.preventDefault();
      var list = Array.prototype.slice.call(container.children);
      var i = list.indexOf(document.activeElement);
      var n = list[(i + d + list.length) % list.length];
      if (n) { n.focus(); n.click(); }
    });
    syncers.push(sync);
    sync();
  }

  function swatchItem(prefix) {
    return function (b, it) {
      b.appendChild(el('span', 'sw ' + prefix + it.id));
      b.appendChild(el('span', '', it.label));
    };
  }

  /* ---------------- navigasi layar ---------------- */
  var finalCache = null, prepTimer = 0;

  function show(name) {
    var prev = state.screen;
    if (prev === 'booth' && name !== 'booth') {
      cancelSession(); stopPreview(); DD.camera.stop(); setLoading(false);
    }
    if (prev === 'result' && name !== 'result') { finalCache = null; clearTimeout(prepTimer); }
    state.screen = name;
    document.body.dataset.screen = name;
    SCREENS.forEach(function (n) { $('screen-' + n).hidden = (n !== name); });
    if (name === 'booth') DD.fx.pause(); else DD.fx.resume();
    var h = $('screen-' + name).querySelector('[data-focus]');
    if (h) { try { h.focus({ preventScroll: true }); } catch (e) { /* abaikan */ } }
    window.scrollTo(0, 0);
  }

  /* ---------------- audio / suara ---------------- */
  function updateSoundUI() {
    var on = !DD.audio.isMuted();
    Array.prototype.forEach.call(document.querySelectorAll('[data-sound-toggle]'), function (b) {
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', 'Suara shutter: ' + (on ? 'aktif' : 'nonaktif'));
    });
  }

  /* ---------------- pesan error kamera ---------------- */
  var ERR = {
    insecure: ['Kamera butuh koneksi aman', 'Buka situs ini lewat HTTPS atau http://localhost. Di koneksi tidak aman, browser memblokir kamera. Kamu masih bisa memakai unggah dari galeri.'],
    denied: ['Izin kamera ditolak', 'Aktifkan kembali lewat ikon gembok di address bar (Chrome/Edge/Firefox), atau di iPhone: Pengaturan > Safari > Kamera > Izinkan. Lalu tekan Coba Lagi.'],
    notfound: ['Kamera tidak ditemukan', 'Perangkat ini tidak punya kamera yang aktif. Sambungkan webcam atau gunakan unggah dari galeri.'],
    inuse: ['Kamera sedang dipakai aplikasi lain', 'Tutup aplikasi atau tab yang memakai kamera (Zoom, Meet, aplikasi kamera), lalu tekan Coba Lagi.'],
    lost: ['Koneksi kamera terputus', 'Kamera berhenti secara tiba-tiba. Pastikan kamera tersambung dan tidak dipakai aplikasi lain, lalu coba lagi.'],
    unknown: ['Kamera tidak bisa dibuka', 'Terjadi kesalahan tak terduga. Muat ulang halaman, atau gunakan unggah dari galeri.']
  };

  function showPermError(code) {
    var m = ERR[code] || ERR.unknown;
    $('permErrTitle').textContent = m[0];
    $('permErrBody').textContent = m[1];
    $('permError').hidden = false;
    $('permIdle').hidden = true;
    $('allowLabel').textContent = 'Coba Lagi';
    setTimeout(function () { $('permErrTitle').focus(); }, 30);
  }
  function resetPermError() {
    $('permError').hidden = true; $('permIdle').hidden = false; $('allowLabel').textContent = 'Izinkan Kamera';
  }

  /* ---------------- booth: kamera & pratinjau ---------------- */
  var rafId = 0, lastDraw = 0;

  function setLoading(on, text) {
    $('stageLoading').hidden = !on;
    if (text) $('loadingText').textContent = text;
  }

  function applyStageAspect() { $('stage').style.setProperty('--ar', state.aspect.toFixed(4)); }

  function updateMirrorUI() { $('btnMirror').setAttribute('aria-pressed', state.mirror ? 'true' : 'false'); }

  function updateFlipUI() {
    var b = $('btnFlip'), can = DD.camera.canFlip;
    b.classList.toggle('is-gone', !can);
    b.tabIndex = can ? 0 : -1;
    b.setAttribute('aria-hidden', can ? 'false' : 'true');
  }

  function updateBoothTitle() {
    var t;
    if (state.running) return;
    if (state.retakeIndex >= 0) t = 'Ulangi foto ' + (state.retakeIndex + 1);
    else t = layout().count === 1 ? 'Siap — 1 foto' : 'Siap — ' + layout().count + ' foto';
    $('boothProgress').textContent = t;
    $('btnShutter').setAttribute('aria-label', layout().count === 1 || state.retakeIndex >= 0 ? 'Ambil foto' : 'Mulai sesi foto');
  }

  function renderBoothThumbs() {
    var box = $('boothThumbs');
    box.replaceChildren();
    var n = layout().count;
    for (var i = 0; i < n; i++) {
      var slot = el('div', 'slot');
      var p = state.photos[i];
      if (p) slot.appendChild(thumbCanvas(p, 80)); else slot.textContent = String(i + 1);
      box.appendChild(slot);
    }
  }

  function thumbCanvas(src, w) {
    var h = Math.max(1, Math.round(w * src.height / src.width));
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(src, 0, 0, w, h);
    return c;
  }

  function previewLoop(ts) {
    var v = DD.camera.video;
    if (state.screen !== 'booth' || !DD.camera.active) { rafId = 0; return; }
    rafId = requestAnimationFrame(previewLoop);
    if (ts - lastDraw < 33) return;
    lastDraw = ts;
    if (!v || v.readyState < 2 || !v.videoWidth) return;
    var cv = $('previewCanvas');
    var a = state.aspect, pw, ph;
    if (a >= 1) { pw = 720; ph = Math.round(720 / a); } else { ph = 720; pw = Math.round(720 * a); }
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    var r = U.coverRect(v.videoWidth, v.videoHeight, a);
    ctx.save();
    if (state.mirror) { ctx.translate(pw, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, r.sx, r.sy, r.sw, r.sh, 0, 0, pw, ph);
    ctx.restore();
    DD.filters.apply(state.filterId, ctx, pw, ph, Math.floor(ts / 110));
  }
  function startPreview() { if (!rafId) rafId = requestAnimationFrame(previewLoop); }
  function stopPreview() { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } }

  function afterCameraStart(resetMirror) {
    setLoading(false);
    if (resetMirror) { state.mirror = DD.camera.facing !== 'environment'; }
    updateMirrorUI(); updateFlipUI(); updateBoothTitle();
    startPreview();
  }

  async function enterBooth() {
    if (state.retakeIndex < 0) { state.aspect = currentAspect(); state.photos = []; state.version++; }
    state.source = 'camera';
    applyStageAspect(); renderBoothThumbs(); updateBoothTitle();
    $('screen-booth').classList.remove('is-running');
    show('booth');
    setLoading(true, 'Menyiapkan kamera…');
    try {
      await DD.camera.start({ video: $('cam'), facing: 'user' });
    } catch (err) {
      if (err.code === 'aborted') return;
      setLoading(false);
      show('permission'); showPermError(err.code);
      return;
    }
    if (state.screen !== 'booth') { DD.camera.stop(); return; }
    afterCameraStart(true);
  }

  async function resumeCamera() {
    if (state.screen !== 'booth') return;
    setLoading(true, 'Menyalakan kembali kamera…');
    try {
      await DD.camera.restart();
    } catch (err) {
      if (err.code === 'aborted') return;
      setLoading(false); show('permission'); showPermError(err.code); return;
    }
    if (state.screen !== 'booth') { DD.camera.stop(); return; }
    afterCameraStart(false);
  }

  /* ---------------- sesi foto otomatis ---------------- */
  function sleep(ms) {
    return new Promise(function (res) {
      var t = setTimeout(function () { state.wake = null; res(); }, ms);
      state.wake = function () { clearTimeout(t); state.wake = null; res(); };
    });
  }
  function cancelSession() {
    if (!state.running) return;
    state.cancelled = true;
    if (state.wake) state.wake();
  }

  function doFlash() {
    var f = $('flash');
    restartAnim(f, 'go');
    setTimeout(function () { f.classList.remove('go'); }, 480);
  }

  async function runSession() {
    if (state.running || !DD.camera.active) return;
    DD.audio.unlock();
    state.running = true; state.cancelled = false;
    var box = $('screen-booth');
    box.classList.add('is-running');
    $('btnShutter').setAttribute('aria-label', 'Batalkan sesi');

    var n = layout().count;
    var idx = [];
    if (state.retakeIndex >= 0) idx = [state.retakeIndex];
    else { for (var i = 0; i < n; i++) idx.push(i); state.photos = []; renderBoothThumbs(); }

    var cd = $('countdown');
    var ok = true;
    for (var q = 0; q < idx.length && ok; q++) {
      var k = idx[q];
      $('boothProgress').textContent = 'Foto ' + (q + 1) + ' / ' + idx.length;
      for (var t = state.timer; t >= 1; t--) {
        cd.textContent = String(t); restartAnim(cd, 'pop');
        announce(String(t));
        DD.audio.beep(t === 1 ? 880 : 620, 0.1, 0.08);
        await sleep(1000);
        if (state.cancelled) { ok = false; break; }
      }
      cd.textContent = ''; cd.classList.remove('pop');
      if (!ok) break;
      var frame = DD.camera.grab(state.aspect, state.mirror, 1600);
      if (!frame) { toast('Kamera belum siap, coba lagi.'); ok = false; break; }
      doFlash(); DD.audio.shutter();
      if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) { /* abaikan */ } }
      state.photos[k] = frame; state.version++;
      renderBoothThumbs();
      if (q < idx.length - 1) {
        $('boothProgress').textContent = 'Bagus! Bersiap…';
        await sleep(1100);
        if (state.cancelled) ok = false;
      }
    }
    cd.textContent = ''; cd.classList.remove('pop');
    state.running = false;
    box.classList.remove('is-running');
    var cancelled = state.cancelled; state.cancelled = false;
    updateBoothTitle();
    if (cancelled || !ok) { if (cancelled) toast('Sesi dibatalkan.'); return; }
    goResult();
  }

  /* ---------------- hasil ---------------- */
  var rafPending = false;

  function resultOpts(scale) {
    return {
      photos: state.photos, layoutId: state.layoutId, aspect: state.aspect,
      frameId: state.frameId, filterId: state.filterId, stickers: state.stickers,
      scale: scale, seed: state.seed, date: state.date, code: state.code
    };
  }
  function cacheKey() {
    return [state.layoutId, state.aspect.toFixed(3), state.frameId, state.filterId, state.stickers.join(','), state.version, state.code].join('|');
  }

  function scheduleRender() {
    finalCache = null;
    clearTimeout(prepTimer);
    prepTimer = setTimeout(prepareFinal, 800);
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () { rafPending = false; renderResult(); });
  }

  function renderResult() {
    if (state.screen !== 'result') return;
    var wrap = $('paperWrap');
    var g = C.geometry(state.layoutId, state.aspect, 1);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var k = Math.min((wrap.clientHeight * dpr) / g.H, (wrap.clientWidth * dpr) / g.W);
    k = U.clamp(k || 0.4, 0.25, 1);
    $('paper').style.setProperty('--ar', (g.W / g.H).toFixed(4));
    C.render(resultOpts(k), $('resultCanvas'));
  }

  function prepareFinal() {
    if (state.screen !== 'result') return;
    finalCache = { key: cacheKey(), canvas: C.render(resultOpts(1)) };
  }
  function getFinal() {
    var key = cacheKey();
    if (!finalCache || finalCache.key !== key) finalCache = { key: key, canvas: C.render(resultOpts(1)) };
    return finalCache.canvas;
  }

  function renderResultThumbs() {
    var box = $('resultThumbs');
    box.replaceChildren();
    state.photos.forEach(function (p, i) {
      var item = el('div', 'rthumb');
      item.appendChild(thumbCanvas(p, 96));
      var b = el('button', 'chip');
      b.type = 'button';
      b.setAttribute('aria-label', 'Ulangi foto ' + (i + 1));
      var ic = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      ic.setAttribute('class', 'ico'); ic.setAttribute('aria-hidden', 'true');
      var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#i-retake');
      ic.appendChild(use);
      b.appendChild(ic); b.appendChild(el('span', '', 'Foto ' + (i + 1)));
      b.addEventListener('click', function () { retakeOne(i); });
      item.appendChild(b);
      box.appendChild(item);
    });
  }

  function newCode() {
    var s = '', hex = '0123456789ABCDEF';
    var a = new Uint8Array(2);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a); else { a[0] = Math.random() * 255; a[1] = Math.random() * 255; }
    s = hex[a[0] >> 4] + hex[a[0] & 15] + hex[a[1] >> 4] + hex[a[1] & 15];
    return s;
  }

  function goResult(fresh) {
    if (fresh !== false) { state.date = new Date(); state.code = newCode(); state.seed = (Math.random() * 1e6) | 0; }
    state.retakeIndex = -1;
    finalCache = null;
    show('result');
    renderResultThumbs();
    syncAll();
    renderResult();
    clearTimeout(prepTimer);
    prepTimer = setTimeout(prepareFinal, 800);
    announce('Hasil foto siap.');
  }

  function retakeOne(i) {
    if (state.source === 'upload') { openPicker(i); return; }
    state.retakeIndex = i;
    enterBooth();
  }

  function retakeAll() {
    if (state.source === 'upload') { openPicker(-1); return; }
    state.retakeIndex = -1;
    enterBooth();
  }

  /* ---------------- unggah galeri ---------------- */
  function openPicker(target) {
    state.uploadTarget = target;
    var f = $('fileInput');
    f.multiple = target < 0 && layout().count > 1;
    f.value = '';
    f.click();
  }

  async function sniff(file) {
    var b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    function ascii(s, o) { for (var i = 0; i < s.length; i++) if (b[o + i] !== s.charCodeAt(i)) return false; return true; }
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpeg';
    if (b[0] === 0x89 && ascii('PNG', 1)) return 'png';
    if (ascii('RIFF', 0) && ascii('WEBP', 8)) return 'webp';
    if (ascii('ftyp', 4)) {
      var brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
      if (/^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(brand)) return 'heic';
    }
    return '';
  }

  async function validate(file) {
    if (!file || !file.size) return 'File kosong atau tidak bisa dibaca.';
    if (file.size > MAX_UPLOAD) return 'Ukuran file terlalu besar (maksimal 15 MB).';
    if (file.type && !/^image\//.test(file.type)) return 'Hanya file gambar yang didukung.';
    var kind = await sniff(file);
    if (!kind) return 'Format tidak didukung. Gunakan JPG, PNG, WebP, atau HEIC.';
    return '';
  }

  function decodeToCanvas(file, aspect) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h || w * h > MAX_PIXELS) throw new Error('size');
          var r = U.coverRect(w, h, aspect);
          var k = Math.min(1, 1600 / Math.max(r.sw, r.sh));
          var cw = Math.round(r.sw * k), ch = Math.round(r.sh * k);
          var c = document.createElement('canvas');
          c.width = cw; c.height = ch;
          c.getContext('2d').drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, cw, ch);
          resolve(c);
        } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  async function handleFiles(list) {
    var files = Array.prototype.slice.call(list || []);
    if (!files.length) return;
    var target = state.uploadTarget;
    var need = target >= 0 ? 1 : layout().count;
    files = files.slice(0, need);
    toast('Memproses foto…');
    try {
      for (var i = 0; i < files.length; i++) {
        var bad = await validate(files[i]);
        if (bad) { toast(bad); return; }
      }
      var aspect = target >= 0 ? state.aspect : currentAspect();
      var out = [];
      for (var j = 0; j < files.length; j++) out.push(await decodeToCanvas(files[j], aspect));
      if (target >= 0) {
        state.photos[target] = out[0];
        state.version++;
        state.source = 'upload';
        goResult(false);
      } else {
        var photos = [];
        for (var k = 0; k < need; k++) photos.push(out[k % out.length]);
        state.aspect = aspect; state.photos = photos; state.version++; state.source = 'upload';
        goResult(true);
        if (out.length < need) toast('Foto kurang dari ' + need + ', sebagian dipakai ulang.');
        else $('toast').classList.remove('show');
      }
    } catch (e) {
      toast('Gagal membaca gambar. Coba file lain.');
    }
  }

  /* ---------------- ekspor ---------------- */
  function stamp() {
    var d = new Date(), p = function (n) { return ('0' + n).slice(-2); };
    return 'doomsday-photobooth-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  var busy = false;
  async function exportImage(kind) {
    if (busy) return;
    busy = true; toast('Menyiapkan gambar…');
    try {
      var cv = getFinal(), temp = null;
      if (kind === 'print') { temp = C.printSheet(cv, state.layoutId); cv = temp; }
      var jpg = kind === 'jpg';
      var blob = await C.toBlob(cv, jpg ? 'image/jpeg' : 'image/png', 0.92);
      if (temp) { temp.width = temp.height = 0; }
      if (!blob) { toast('Gagal membuat gambar. Coba lagi.'); return; }
      saveBlob(blob, stamp() + (kind === 'print' ? '-cetak-4x6' : '') + (jpg ? '.jpg' : '.png'));
      toast('Gambar diunduh. Di iPhone, kalau tidak muncul, pakai Bagikan.');
    } catch (e) {
      toast('Gagal membuat gambar. Coba lagi.');
    } finally { busy = false; }
  }

  async function shareImage() {
    if (busy) return;
    busy = true;
    try {
      var blob = await C.toBlob(getFinal(), 'image/jpeg', 0.92);
      if (!blob) { toast('Gagal membuat gambar.'); return; }
      var file = new File([blob], stamp() + '.jpg', { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'DOOMSDAY Photobooth' });
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') return;
        }
      }
      saveBlob(blob, file.name);
      toast('Berbagi tidak didukung di perangkat ini, foto diunduh.');
    } catch (e) {
      toast('Gagal membagikan gambar.');
    } finally { busy = false; }
  }

  /* ---------------- pembangunan UI ---------------- */
  function buildUI() {
    var LD = {
      single: 'Satu foto besar', strip3: '3 foto vertikal', strip4: '4 foto vertikal', grid: '4 foto, 2 x 2'
    };
    radioGroup($('layoutGroup'),
      Object.keys(C.LAYOUTS).map(function (k) { return { id: k, label: C.LAYOUTS[k].label, desc: LD[k], n: C.LAYOUTS[k].count }; }),
      function () { return state.layoutId; },
      function (v) { state.layoutId = v; state.aspect = currentAspect(); },
      function (b, it) {
        var mini = el('span', 'mini mini-' + it.id);
        mini.setAttribute('aria-hidden', 'true');
        for (var i = 0; i < it.n; i++) mini.appendChild(document.createElement('i'));
        b.appendChild(mini);
        b.appendChild(el('span', 'name', it.label));
        b.appendChild(el('span', 'desc', it.desc));
      }, 'lcard');

    var timers = [{ id: 3, label: '3s' }, { id: 5, label: '5s' }, { id: 10, label: '10s' }];
    ['timerGroupSetup', 'timerGroupBooth'].forEach(function (id) {
      radioGroup($(id), timers, function () { return state.timer; }, function (v) { state.timer = Number(v); },
        function (b, it) { b.textContent = it.label; b.setAttribute('aria-label', 'Timer ' + it.id + ' detik'); });
    });

    ['filterGroupBooth', 'filterGroupResult'].forEach(function (id) {
      radioGroup($(id), DD.filters.list, function () { return state.filterId; },
        function (v) { state.filterId = v; if (state.screen === 'result') scheduleRender(); },
        swatchItem('sw-'));
    });

    radioGroup($('frameGroup'), C.FRAMES, function () { return state.frameId; },
      function (v) { state.frameId = v; scheduleRender(); }, swatchItem('sw-f-'));

    C.STICKERS.forEach(function (s) {
      var b = el('button', 'chip');
      b.type = 'button'; b.dataset.id = s.id; b.setAttribute('aria-pressed', 'false');
      var cv = document.createElement('canvas');
      cv.width = 40; cv.height = 40; cv.setAttribute('aria-hidden', 'true');
      cv.style.width = '24px'; cv.style.height = '24px';
      C.drawSticker(cv.getContext('2d'), s.id, 20, 19, 30, 0);
      b.appendChild(cv); b.appendChild(el('span', '', s.label));
      b.addEventListener('click', function () {
        var i = state.stickers.indexOf(s.id);
        if (i >= 0) state.stickers.splice(i, 1); else state.stickers.push(s.id);
        b.setAttribute('aria-pressed', i >= 0 ? 'false' : 'true');
        scheduleRender();
      });
      $('stickerGroup').appendChild(b);
    });
    $('btnClearStickers').addEventListener('click', function () {
      state.stickers = [];
      Array.prototype.forEach.call($('stickerGroup').children, function (b) { b.setAttribute('aria-pressed', 'false'); });
      scheduleRender();
    });

    /* tab */
    var tabs = [['tabFrame', 'panelFrame'], ['tabFilter', 'panelFilter'], ['tabSticker', 'panelSticker']];
    function selectTab(i, focus) {
      tabs.forEach(function (t, j) {
        var on = i === j, tb = $(t[0]);
        tb.setAttribute('aria-selected', on ? 'true' : 'false');
        tb.tabIndex = on ? 0 : -1;
        $(t[1]).hidden = !on;
        if (on && focus) tb.focus();
      });
    }
    tabs.forEach(function (t, i) {
      $(t[0]).addEventListener('click', function () { selectTab(i, false); });
      $(t[0]).addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); selectTab((i + 1) % 3, true); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); selectTab((i + 2) % 3, true); }
      });
    });
  }

  /* ---------------- event ---------------- */
  function bindEvents() {
    function startWith(muted) {
      DD.audio.unlock(); DD.audio.setMuted(muted); updateSoundUI();
      state.pendingUpload = false; $('setupNextLabel').textContent = 'Lanjut'; show('setup');
    }
    $('btnSoundOn').addEventListener('click', function () { startWith(false); });
    $('btnSoundOff').addEventListener('click', function () { startWith(true); });

    /* modal info */
    var modalOpener = null;
    function openModal(name) {
      var m = $('modal'), sec = m.querySelector('[data-modal="' + name + '"]');
      if (!sec) return;
      Array.prototype.forEach.call(m.querySelectorAll('[data-modal]'), function (x) { x.hidden = (x !== sec); });
      $('modalTitle').textContent = sec.dataset.title;
      modalOpener = document.activeElement;
      m.hidden = false;
      $('modalClose').focus();
    }
    function closeModal() {
      $('modal').hidden = true;
      if (modalOpener && modalOpener.focus) modalOpener.focus();
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-modal-open]'), function (b) {
      b.addEventListener('click', function () { openModal(b.dataset.modalOpen); });
    });
    $('modalClose').addEventListener('click', closeModal);
    $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) closeModal(); });
    $('btnLandingUpload').addEventListener('click', function () { DD.audio.unlock(); state.pendingUpload = true; $('setupNextLabel').textContent = 'Pilih foto'; show('setup'); });

    $('btnSetupBack').addEventListener('click', function () { show('landing'); });
    $('btnSetupNext').addEventListener('click', function () {
      state.aspect = currentAspect();
      if (state.pendingUpload) { openPicker(-1); return; }
      resetPermError(); show('permission');
    });

    $('btnPermBack').addEventListener('click', function () { show('setup'); });
    $('btnAllow').addEventListener('click', function () { DD.audio.unlock(); state.retakeIndex = -1; enterBooth(); });
    $('btnPermUpload').addEventListener('click', function () { openPicker(-1); });

    $('btnBoothBack').addEventListener('click', function () {
      if (state.retakeIndex >= 0) { goResult(false); } else { resetPermError(); show('setup'); }
    });
    $('btnShutter').addEventListener('click', function () { if (state.running) cancelSession(); else runSession(); });
    $('btnBoothUpload').addEventListener('click', function () {
      if (state.running) return;
      openPicker(state.retakeIndex >= 0 ? state.retakeIndex : -1);
    });
    $('btnMirror').addEventListener('click', function () { state.mirror = !state.mirror; updateMirrorUI(); });
    $('btnFlip').addEventListener('click', async function () {
      if (state.running) return;
      stopPreview(); setLoading(true, 'Mengganti kamera…');
      try {
        await DD.camera.flip();
        if (state.screen !== 'booth') { DD.camera.stop(); return; }
        afterCameraStart(true);
      } catch (e) {
        if (e.code === 'aborted') return;
        toast('Tidak bisa berganti kamera.');
        if (DD.camera.active) afterCameraStart(false); else { setLoading(false); show('permission'); showPermError(e.code); }
      }
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-sound-toggle]'), function (b) {
      b.addEventListener('click', function () { DD.audio.unlock(); DD.audio.setMuted(!DD.audio.isMuted()); updateSoundUI(); });
    });

    $('btnResultBack').addEventListener('click', function () { show('setup'); });
    $('btnRetakeAll').addEventListener('click', retakeAll);
    $('btnRestart').addEventListener('click', function () { state.photos = []; state.version++; state.retakeIndex = -1; state.pendingUpload = false; $('setupNextLabel').textContent = 'Lanjut'; show('setup'); });
    $('btnPng').addEventListener('click', function () { exportImage('png'); });
    $('btnJpg').addEventListener('click', function () { exportImage('jpg'); });
    $('btnPrint').addEventListener('click', function () { exportImage('print'); });
    $('btnShare').addEventListener('click', shareImage);

    $('fileInput').addEventListener('change', function (e) {
      var files = e.target.files;
      state.pendingUpload = false;
      handleFiles(files).then(function () { e.target.value = ''; });
    });

    /* keyboard: Spasi = ambil foto, Esc = batal */
    document.addEventListener('keydown', function (e) {
      if (!$('modal').hidden) {
        if (e.key === 'Escape') closeModal();
        else if (e.key === 'Tab') { e.preventDefault(); $('modalClose').focus(); }
        return;
      }
      if (state.screen !== 'booth') return;
      if (e.key === 'Escape' && state.running) { cancelSession(); return; }
      if ((e.code === 'Space' || e.key === ' ') && !e.repeat) {
        if (e.target.closest && e.target.closest('button, input, select, a, [role="radio"], [role="tab"]')) return;
        e.preventDefault();
        if (state.running) cancelSession(); else runSession();
      }
    });

    /* kamera mati saat tab disembunyikan / ditutup */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (state.screen === 'booth') {
          cancelSession(); stopPreview(); DD.camera.stop(); state.camStopped = true;
        }
      } else if (state.camStopped) {
        state.camStopped = false;
        if (state.screen === 'booth') resumeCamera();
      }
    });
    window.addEventListener('pagehide', function () { DD.camera.stop(); });

    DD.camera.onEnded = function () {
      if (document.hidden || state.screen !== 'booth') return;
      cancelSession(); stopPreview(); setLoading(false);
      show('permission'); showPermError('lost');
    };

    var rt = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        if (state.screen === 'result') scheduleRender();
        else if (state.screen === 'booth' && !state.running && state.retakeIndex < 0 && !state.photos.some(Boolean)) {
          state.aspect = currentAspect(); applyStageAspect();
        }
      }, 150);
    });
  }

  /* ---------------- init ---------------- */
  function init() {
    DD.fx.start($('fx'));
    buildUI();
    bindEvents();
    updateSoundUI();
    state.aspect = currentAspect();
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('insecureNote').hidden = false;
    }
    show('landing');
  }

  init();
})();
