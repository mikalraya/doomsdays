/* DOOMSDAY Photobooth — modul kamera (getUserMedia) */
(function () {
  'use strict';
  var DD = (window.DD = window.DD || {});

  var stream = null, videoEl = null, token = 0;
  var devices = [], currentDeviceId = '', mode = 'facing', facing = 'user', lastOpts = null;
  var onEnded = null;

  function mk(code, msg) { var e = new Error(msg || code); e.code = code; return e; }

  function classify(err) {
    var n = (err && err.name) || '';
    if (err && err.code && typeof err.code === 'string') return err;
    if (n === 'NotAllowedError' || n === 'PermissionDeniedError' || n === 'SecurityError') return mk('denied', n);
    if (n === 'NotFoundError' || n === 'DevicesNotFoundError') return mk('notfound', n);
    if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError') return mk('inuse', n);
    return mk('unknown', n || 'unknown');
  }

  function stopTracks() {
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
    if (videoEl) {
      try { videoEl.pause(); } catch (e) { /* abaikan */ }
      videoEl.srcObject = null;
    }
  }

  function gum(c) { return navigator.mediaDevices.getUserMedia(c); }

  function waitMeta(v) {
    return new Promise(function (resolve) {
      if (v.readyState >= 1 && v.videoWidth) return resolve();
      var done = false;
      function fin() { if (!done) { done = true; resolve(); } }
      v.addEventListener('loadedmetadata', fin, { once: true });
      setTimeout(fin, 8000);
    });
  }

  async function start(opts) {
    opts = opts || {};
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw mk('insecure');
    }
    var my = ++token;
    stopTracks();
    videoEl = opts.video || videoEl;
    var want = opts.facing || 'user';
    lastOpts = { video: videoEl, facing: want, deviceId: opts.deviceId || '' };

    var base = { width: { ideal: 1920 }, height: { ideal: 1080 } };
    var vc = opts.deviceId
      ? Object.assign({}, base, { deviceId: { exact: opts.deviceId } })
      : Object.assign({}, base, { facingMode: { ideal: want } });
    var s;
    try {
      s = await gum({ video: vc, audio: false });
    } catch (e) {
      var n = e && e.name;
      if (n === 'OverconstrainedError' || n === 'ConstraintNotSatisfiedError' || n === 'TypeError') {
        try { s = await gum({ video: true, audio: false }); } catch (e2) { throw classify(e2); }
      } else {
        throw classify(e);
      }
    }
    if (my !== token) { s.getTracks().forEach(function (t) { t.stop(); }); throw mk('aborted'); }

    stream = s;
    videoEl.muted = true;
    videoEl.setAttribute('playsinline', '');
    videoEl.srcObject = s;
    try { await videoEl.play(); } catch (e) { /* iOS kadang menolak sesaat; stream tetap berjalan */ }
    await waitMeta(videoEl);
    if (my !== token) { stopTracks(); throw mk('aborted'); }

    var track = s.getVideoTracks()[0];
    var st = (track && track.getSettings) ? track.getSettings() : {};
    facing = st.facingMode || 'unknown';
    mode = st.facingMode ? 'facing' : 'device';
    currentDeviceId = st.deviceId || '';
    try {
      var all = await navigator.mediaDevices.enumerateDevices();
      devices = all.filter(function (d) { return d.kind === 'videoinput'; });
    } catch (e) { devices = []; }
    if (track) {
      track.addEventListener('ended', function () {
        if (my === token && stream) { stopTracks(); if (onEnded) onEnded(); }
      });
    }
    return { facing: facing, canFlip: devices.length > 1 };
  }

  function stop() { token++; stopTracks(); }

  async function restart() {
    if (!lastOpts) throw mk('unknown');
    return start(lastOpts);
  }

  async function flip() {
    var prev = lastOpts;
    try {
      if (mode === 'facing') {
        return await start({ video: videoEl, facing: facing === 'user' ? 'environment' : 'user' });
      }
      if (devices.length < 2) throw mk('unknown');
      var idx = devices.findIndex(function (d) { return d.deviceId === currentDeviceId; });
      var next = devices[(idx + 1) % devices.length];
      return await start({ video: videoEl, deviceId: next.deviceId });
    } catch (e) {
      if (e.code !== 'aborted' && prev) { try { await start(prev); } catch (e2) { /* abaikan */ } }
      throw e;
    }
  }

  /* Ambil satu frame (sudah di-crop ke rasio & opsional dicerminkan) */
  function grab(aspect, mirror, maxSide) {
    var v = videoEl;
    if (!v || !v.videoWidth) return null;
    var r = DD.util.coverRect(v.videoWidth, v.videoHeight, aspect);
    var k = Math.min(1, (maxSide || 1600) / Math.max(r.sw, r.sh));
    var w = Math.round(r.sw * k), h = Math.round(r.sh * k);
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var x = c.getContext('2d');
    if (mirror) { x.translate(w, 0); x.scale(-1, 1); }
    x.drawImage(v, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
    return c;
  }

  DD.camera = {
    start: start, stop: stop, restart: restart, flip: flip, grab: grab,
    get active() { return !!stream; },
    get facing() { return facing; },
    get canFlip() { return devices.length > 1; },
    get video() { return videoEl; },
    set onEnded(fn) { onEnded = fn; }
  };
})();
