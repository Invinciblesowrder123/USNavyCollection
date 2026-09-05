'use strict';
/* ============================================================
 * 音频系统：音效与 BGM
 * - 音效/BGM 由 scripts/generate_audio.py 程序化生成，ffmpeg 压为 mp3
 * - 使用 Web Audio 解码缓存，支持多音效叠加播放
 * - 浏览器自动播放策略：首次用户手势后解锁 AudioContext
 * - 音量与静音设置独立存 localStorage，不写入游戏存档
 * ============================================================ */

const Sound = (() => {
  const SETTINGS_KEY = 'usnc_audio_v1';
  const SE_DIR = 'audio/se/';
  const BGM_DIR = 'audio/bgm/';
  const SE_NAMES = ['click', 'confirm', 'cancel', 'alarm', 'shell', 'torpedo',
    'explosion', 'plane', 'complete', 'levelup', 'get', 'drop'];
  const BGM_NAMES = ['port', 'battle', 'victory'];

  let ctx = null;
  let unlocked = false;
  const seCache = {};
  const bgmCache = {};
  let bgmSource = null;
  let bgmGain = null;
  let currentBgm = null;
  let pendingBgm = null;

  const settings = Object.assign(
    { seVolume: 0.6, bgmVolume: 0.35, muted: false },
    loadSettings()
  );

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* 忽略 */ }
  }

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  }

  /* 浏览器要求用户手势后才能播放，首次交互时调用 */
  function unlock() {
    const c = ensureCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    if (!unlocked) {
      unlocked = true;
      preload();
      if (pendingBgm) { const n = pendingBgm; pendingBgm = null; playBgm(n); }
    }
  }

  async function loadBuffer(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('audio load failed: ' + url);
    const arr = await res.arrayBuffer();
    return await ctx.decodeAudioData(arr);
  }

  async function preload() {
    const c = ensureCtx();
    if (!c) return;
    for (const n of SE_NAMES) {
      if (seCache[n]) continue;
      try { seCache[n] = await loadBuffer(SE_DIR + n + '.mp3'); } catch (e) { /* 缺文件则静默 */ }
    }
  }

  function play(name, volumeScale) {
    if (settings.muted) return;
    const c = ensureCtx();
    if (!c || c.state === 'suspended') return;
    let buf = seCache[name];
    if (!buf) return;   /* 未加载完成则跳过，不阻塞 */
    try {
      const src = c.createBufferSource();
      const gain = c.createGain();
      gain.gain.value = settings.seVolume * (volumeScale == null ? 1 : volumeScale);
      src.buffer = buf;
      src.connect(gain);
      gain.connect(c.destination);
      src.start();
    } catch (e) { /* 播放失败忽略 */ }
  }

  async function playBgm(name) {
    const c = ensureCtx();
    if (!c) return;
    if (!unlocked) { pendingBgm = name; return; }
    if (currentBgm === name && bgmSource) return;
    stopBgm();
    currentBgm = name;
    if (settings.muted) return;
    try {
      if (!bgmCache[name]) bgmCache[name] = await loadBuffer(BGM_DIR + name + '.mp3');
      bgmSource = c.createBufferSource();
      bgmGain = c.createGain();
      bgmGain.gain.value = settings.bgmVolume;
      bgmSource.buffer = bgmCache[name];
      bgmSource.loop = true;
      bgmSource.connect(bgmGain);
      bgmGain.connect(c.destination);
      bgmSource.start();
    } catch (e) { /* BGM 加载失败忽略 */ }
  }

  function stopBgm() {
    if (bgmSource) {
      try { bgmSource.stop(); } catch (e) { /* 忽略 */ }
      bgmSource = null;
      bgmGain = null;
    }
    currentBgm = null;
  }

  function setSeVolume(v) {
    settings.seVolume = Math.max(0, Math.min(1, v));
    saveSettings();
  }
  function setBgmVolume(v) {
    settings.bgmVolume = Math.max(0, Math.min(1, v));
    saveSettings();
    if (bgmGain) bgmGain.gain.value = settings.bgmVolume;
  }
  function setMuted(m) {
    settings.muted = !!m;
    saveSettings();
    if (settings.muted) stopBgm();
    else if (currentBgm) { const n = currentBgm; stopBgm(); playBgm(n); }
  }
  function isMuted() { return settings.muted; }
  function getSettings() { return Object.assign({}, settings); }
  function currentBgmName() { return currentBgm; }

  return {
    unlock, preload, play, playBgm, stopBgm,
    setSeVolume, setBgmVolume, setMuted, isMuted, getSettings, currentBgmName,
    SE_NAMES, BGM_NAMES
  };
})();

if (typeof window !== 'undefined') window.Sound = Sound;
if (typeof module !== 'undefined' && module.exports) module.exports = { Sound };
