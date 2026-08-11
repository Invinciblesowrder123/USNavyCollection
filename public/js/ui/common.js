'use strict';
/* ============================================================
 * UI 公共：屏幕路由/顶栏/模态/舰船卡片/提示
 * ============================================================ */

const UI = (() => {
  const $ = sel => document.querySelector(sel);
  const screenRoot = () => $('#screen');
  const Screens = {};
  let current = null;      // { name, arg }
  let currentTick = null;  // 每秒刷新回调

  function go(name, arg) {
    if (!Screens[name]) { console.error('unknown screen', name); return; }
    current = { name, arg };
    currentTick = null;
    const root = screenRoot();
    root.innerHTML = '';
    root.className = '';
    Screens[name](root, arg);
    refreshNav();
  }

  function refreshNav() {
    const nav = $('#navbar');
    /* 顶部一级菜单（图标+文字置顶UI） */
    const defs = [
      ['home', '🏠 母港', ''],
      ['sortie', '⚔️ 出击', ''],
      ['formation', '👥 编成', ''],
      ['factory', '🛠 工厂', ''],
      ['logistics', '🔧 入渠', 'dock'],
      ['logistics', '⛽ 补给', 'supply'],
      ['logistics', '🚢 远征', 'expedition'],
      ['logistics', '🏆 演习', 'practice'],
      ['quests', '📋 任务', '']
    ];
    nav.innerHTML = defs.map(([k, label, tab]) =>
      `<button data-s="${k}" data-tab="${tab}" class="${current && current.name === k && (!tab || current.arg === tab) ? 'active' : ''}">${label}</button>`).join('');
    nav.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        if (b.classList.contains('active')) return;
        go(b.dataset.s, b.dataset.tab || undefined);
      });
    });
    /* 出击中禁止切换（强制返回出击界面） */
    if (Game.state.sortie && current && current.name !== 'sortie') {
      go('sortie');
    }
  }

  function toast(msg, ms = 2600) {
    let t = $('#toast');
    t.innerHTML = `<div class="toast">${Util.esc(msg)}</div>`;
    clearTimeout(t._h);
    t._h = setTimeout(() => { t.innerHTML = ''; }, ms);
  }

  function modal(html, onClose) {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-mask"><div class="modal">${html}</div></div>`;
    const mask = root.querySelector('.modal-mask');
    mask.addEventListener('click', e => {
      if (e.target === mask) close();
    });
    root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    function close() {
      root.innerHTML = '';
      if (onClose) onClose();
    }
    return { root: root.querySelector('.modal'), close };
  }

  /* 次级浮窗（叠在主弹窗之上）：关闭只影响本浮窗，不影响下层弹窗（如 装备选择器/舰艇详情） */
  function subModal(html) {
    const root = $('#sub-modal-root');
    root.innerHTML = `<div class="sub-modal-mask"><div class="modal">${html}</div></div>`;
    const mask = root.querySelector('.sub-modal-mask');
    mask.addEventListener('click', e => {
      if (e.target === mask) close();
    });
    root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    function close() {
      root.innerHTML = '';
    }
    return { root: root.querySelector('.modal'), close };
  }

  function esc(s) { return Util.esc(s); }

  /* ---------- 立绘资源：AI 图(art/ai) → SVG(art/portraits) → 舰种占位符 ---------- */
  const ArtManifest = { loaded: false, map: {} };
  fetch('art/ai/index.json').then(r => r.ok ? r.json() : null).then(m => {
    if (m) { ArtManifest.map = m; ArtManifest.loaded = true; }
  }).catch(() => {});

  window.USNC = window.USNC || {};
  USNC.portraitFallback = function (img) {
    img.onerror = null;
    if (img.dataset.svg) {
      img.dataset.svg = '';
      img.src = img.dataset.svgPath;
      return;
    }
    const d = document.createElement('div');
    d.className = img.className + ' portrait-ph';
    d.innerHTML = img.dataset.ph || '';
    img.replaceWith(d);
  };

  /* 立绘：优先 AI 立绘（含改/改二差分），无则 SVG，再回退舰种占位符 */
  function portraitImg(shipId, cls = 'portrait', extra = '', kai = 0) {
    const def = ShipData[shipId];
    if (!def) return `<div class="portrait-ph ${cls}" ${extra}>${Util.esc(shipId)}</div>`;
    const typeName = SHIP_TYPE_ZH[def.type] || def.type;
    const r = Util.clamp(def.rarity || 1, 1, 5);
    const phHtml = `<span class="rarity-stars">${'★'.repeat(r)}</span>
      <span class="type-mark">${Util.esc(typeName)}</span><span class="type-sub">${Util.esc(def.en)}</span>`;
    const svgPath = `art/portraits/${shipId}.svg`;
    const key = shipId + (kai === 1 ? '_kai' : kai >= 2 ? '_kai2' : '');
    const aiFile = ArtManifest.map[key];
    const src = ArtManifest.loaded && aiFile ? `art/ai/${aiFile}` : svgPath;
    const svgAttr = src === svgPath ? '' : ` data-svg="1" data-svg-path="${svgPath}"`;
    const q = JSON.stringify(phHtml).replace(/"/g, '&quot;');
    return `<img class="portrait ${cls} portrait-r${r}" ${extra} loading="lazy" alt="${Util.esc(def.en)}"
      src="${src}" data-ph="${q}"${svgAttr} onerror="USNC.portraitFallback(this)">`;
  }

  /* 舰名（含改造后缀） */
  function shipTitle(inst) {
    const def = Game.shipDef(inst);
    return def.zh + (inst.kai === 1 ? '改' : inst.kai >= 2 ? '改二' : '');
  }

  /* 稀有度配色（参照舰C wiki：1普通→5最稀有） */
  const RARITY_COLOR = { 1: '#cfd6e6', 2: '#8ee08e', 3: '#6db3ff', 4: '#c77dff', 5: '#ffd700' };
  function rarityCls(r) { return 'rn-' + Util.clamp(r || 1, 1, 5); }
  /* 舰名（按稀有度着色，用于卡片/列表/详情标题） */
  function shipNameHtml(def) {
    return `<span class="${rarityCls(def.rarity)}">${Util.esc(def.zh || '')}</span>`;
  }
  /* 稀有度星标（舰C卡片惯例：金色★） */
  function rarityStars(r) {
    r = Util.clamp(r || 1, 1, 5);
    return `<span class="rarity-stars r${r}">${'★'.repeat(r)}</span>`;
  }

  /* 装备改修星级显示（★1~★9 / ★MAX） */
  function starHtml(eq) {
    if (!eq || !eq.star) return '';
    const n = Math.min(10, eq.star || 0);
    return n >= 10 ? '<span class="star-line">★MAX</span>' : `<span class="star-line">★${n}</span>`;
  }

  /* 装备稀有度配色（与舰船稀有度同色系：1白 2绿 3蓝 4紫 5金，参照舰C wiki） */
  function eqRarityCls(r) { return 'eq-r' + Util.clamp(r || 1, 1, 5); }
  /* 装备名（按稀有度着色 + 稀有度标记） */
  function eqNameHtml(ed) {
    if (!ed) return '';
    const r = Util.clamp(ed.r || 1, 1, 5);
    const tag = EQUIP_RARITY_ZH[r] || '';
    return `<span class="eq-r${r}">${Util.esc(ed.zh || '')}</span><span class="eq-rarity-tag eq-r${r}">${tag}</span>`;
  }
  /* 装备稀有度标记（仅标签，用于表格等紧凑场景） */
  function eqRarityTag(r) {
    r = Util.clamp(r || 1, 1, 5);
    return `<span class="eq-rarity-tag eq-r${r}">${EQUIP_RARITY_ZH[r]}</span>`;
  }

  function hpRatio(uid) {
    const s = Game.state.ships[uid];
    if (!s) return 0;
    return Util.clamp(s.hp / Game.shipStats(uid).hpMax, 0, 1);
  }

  /* 舰船状态徽章 */
  function stateBadges(uid) {
    const st = Game.state;
    const s = st.ships[uid];
    if (!s) return '';
    const out = [];
    const inRepair = st.repairs.some(r => r && r.ship === uid);
    const inEx = Object.values(st.expeditions).some(e => e);
    const exFleet = Object.entries(st.expeditions).find(([f, e]) => e && st.fleet[f].includes(uid));
    if (inRepair) out.push('<span class="state-badge repair">入渠</span>');
    if (exFleet) out.push('<span class="state-badge expedition">远征</span>');
    if (s.hp > 0 && hpRatio(uid) <= 0.25) out.push('<span class="state-badge broken">大破</span>');
    if (s.morale >= 50) out.push('<span class="state-badge morale">闪</span>');
    return out.join('');
  }

  /* 舰船卡片（用于编成/一览） */
  function shipCard(uid, opts = {}) {
    const st = Game.state;
    const s = st.ships[uid];
    if (!s) return '';
    const def = Game.shipDef(s);
    const ratio = hpRatio(uid);
    const cls = ratio <= 0.25 ? 'danger' : '';
    const flag = opts.fleetIdx && st.fleet[opts.fleetIdx][0] === uid
      ? '<span class="flag-badge">旗</span>' : '';
    return `<div class="ship-card" data-uid="${uid}">
      ${flag}
      ${stateBadges(uid)}
      ${portraitImg(s.id, 'portrait', '', s.kai)}
      <div class="hpbar"><div class="${cls}" style="width:${Math.round(ratio * 100)}%"></div></div>
      <div class="card-info">
        <span>${shipNameHtml(def)}${s.kai === 1 ? '改' : s.kai >= 2 ? '改二' : ''} <span class="dim">${def.en}</span></span>
        <span class="lv">Lv.${s.lv}</span>
      </div>
    </div>`;
  }

  function resHtml() {
    const r = Game.state.resources;
    const cap = Game.resourceCap();
    return `<span class="res"><span class="ico ico-fuel"></span><b>${r.fuel}</b><span class="dim">/${cap}</span></span>
      <span class="res"><span class="ico ico-ammo"></span><b>${r.ammo}</b><span class="dim">/${cap}</span></span>
      <span class="res"><span class="ico ico-steel"></span><b>${r.steel}</b><span class="dim">/${cap}</span></span>
      <span class="res"><span class="ico ico-baux"></span><b>${r.baux}</b><span class="dim">/${cap}</span></span>
      <span class="res"><span class="ico ico-screw"></span><b>${r.screws || 0}</b></span>
      <span class="res"><span class="ico ico-devmat"></span><b>${r.devMats || 0}</b></span>`;
  }

  function refreshTop() {
    $('#admiralInfo').textContent =
      `${Game.state.admiral.name} · ${Game.admiralTitle(Game.state.admiral.level)} · Lv.${Game.state.admiral.level} · EXP ${Game.state.admiral.exp}/${Game.expForLevel(Game.state.admiral.level)}`;
    $('#resBar').innerHTML = resHtml();
  }

  function setTick(fn) { currentTick = fn; }

  function tick() {
    refreshTop();
    if (currentTick) {
      try { currentTick(); } catch (e) { /* 单帧错误忽略 */ }
    }
  }

  /* 时间剩余显示 */
  function countdown(ms) {
    return `<span class="countdown">${Util.fmtTime(ms)}</span>`;
  }

  return { go, Screens, toast, modal, subModal, esc, portraitImg, shipCard, shipTitle, shipNameHtml, rarityStars, stateBadges, resHtml, refreshTop, setTick, tick, countdown, hpRatio, $, screenRoot, current, starHtml, eqNameHtml, eqRarityTag, eqRarityCls };
})();

window.UI = UI;
