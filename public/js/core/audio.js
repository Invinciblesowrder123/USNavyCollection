/**
 * audio.js — 音效与 BGM 播放系统
 * 素材来源（均 CC0）：
 *   BGM: OpenGameArt — "War Theme" / "Minimalistic Flute & Strings Tune" by Spring Spring
 *   SE:  Kenney — interface-sounds / impact-sounds / sci-fi-sounds
 */
(function () {
  'use strict';

  var ctx = null;           // AudioContext (SE)
  var seCache = {};          // name -> {buffer, url}  已解码的音效
  var bgmEl = null;         // HTMLAudioElement (BGM)
  var bgmQueue = null;      // 解锁前排队等待播放的 BGM 名
  var currentBgm = null;    // 当前播放的 BGM 名
  var muted = false;
  var seVol = 0.6;
  var bgmVol = 0.4;
  var unlocked = false;

  var SE_BASE = 'audio/se/';
  var BGM_BASE = 'audio/bgm/';

  /* ---- 初始化 ---- */
  function init() {
    try { muted = localStorage.getItem('audio_muted') === '1'; } catch (e) {}
    try { var v = parseFloat(localStorage.getItem('audio_se_vol')); if (v) seVol = v; } catch (e) {}
    try { var v = parseFloat(localStorage.getItem('audio_bgm_vol')); if (v) bgmVol = v; } catch (e) {}
    bgmEl = new Audio();
    bgmEl.loop = true;
    bgmEl.volume = muted ? 0 : bgmVol;
  }

  /* ---- AudioContext (SE 用) ---- */
  function ensureCtx() {
    if (ctx) return ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    } catch (e) {}
    return ctx;
  }

  /* ---- 解锁（首次用户手势时调用） ---- */
  function unlock() {
    if (unlocked) return;
    var c = ensureCtx();
    if (c && c.state === 'suspended') c.resume();
    unlocked = true;
    if (bgmQueue) { playBgm(bgmQueue); bgmQueue = null; }
  }

  /* ---- 播放音效 ---- */
  function play(name, vol) {
    if (muted) return;
    var c = ensureCtx();
    if (!c) return;
    if (!unlocked) { c.resume(); unlocked = true; }

    var entry = seCache[name];
    if (!entry) {
      entry = seCache[name] = { buffer: null, url: SE_BASE + name + '.mp3' };
      fetch(entry.url)
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (buf) { return c.decodeAudioData(buf); })
        .then(function (ab) { entry.buffer = ab; })
        .catch(function () {});
    }
    if (entry.buffer) {
      var src = c.createBufferSource();
      src.buffer = entry.buffer;
      var gain = c.createGain();
      gain.gain.value = (vol != null ? vol : 1) * seVol;
      src.connect(gain).connect(c.destination);
      src.start(0);
    } else {
      // 首次播放时 buffer 还没解码完，先 fetch 后立即播放
      fetch(entry.url)
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (buf) { return c.decodeAudioData(buf); })
        .then(function (ab) {
          entry.buffer = ab;
          if (muted) return;
          var s = c.createBufferSource();
          s.buffer = ab;
          var g = c.createGain();
          g.gain.value = (vol != null ? vol : 1) * seVol;
          s.connect(g).connect(c.destination);
          s.start(0);
        })
        .catch(function () {});
    }
  }

  /* ---- 播放 BGM ---- */
  function playBgm(name) {
    if (!name) { stopBgm(); return; }
    if (!unlocked) { bgmQueue = name; return; }
    if (currentBgm === name && !bgmEl.paused) return;
    currentBgm = name;
    bgmEl.src = BGM_BASE + name + '.mp3';
    bgmEl.volume = muted ? 0 : bgmVol;
    bgmEl.play().catch(function () {});
  }

  function stopBgm() {
    bgmEl.pause();
    bgmEl.currentTime = 0;
    currentBgm = null;
    bgmQueue = null;
  }

  /* ---- 静音 / 音量 ---- */
  function setMuted(m) {
    muted = !!m;
    bgmEl.volume = muted ? 0 : bgmVol;
    try { localStorage.setItem('audio_muted', muted ? '1' : '0'); } catch (e) {}
    if (muted) bgmEl.pause();
    else if (currentBgm) bgmEl.play().catch(function () {});
  }

  function isMuted() { return muted; }
  function setSeVol(v) { seVol = v; try { localStorage.setItem('audio_se_vol', String(v)); } catch (e) {} }
  function setBgmVol(v) { bgmVol = v; bgmEl.volume = muted ? 0 : bgmVol; try { localStorage.setItem('audio_bgm_vol', String(v)); } catch (e) {} }

  init();

  /* ---- 导出 ---- */
  window.Sound = {
    play: play,
    playBgm: playBgm,
    stopBgm: stopBgm,
    setMuted: setMuted,
    isMuted: isMuted,
    setSeVol: setSeVol,
    setBgmVol: setBgmVol,
    unlock: unlock
  };
})();
