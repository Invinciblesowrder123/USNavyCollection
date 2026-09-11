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

  /* 页面标题区元数据：标题 + 副标题（logistics 按 tab 区分） */
  const PAGE_HEADS = {
    home: ['母港', '司令部总览 · 舰队与待办'],
    dormitory: ['宿舍', '舰艇休整与管理'],
    sortie: ['出击', '海域出击与战斗指挥'],
    formation: ['编成', '舰队编组与替换'],
    factory: ['工厂', '建造 · 开发 · 解体'],
    logistics: {
      dock: ['入渠', '舰艇修理与恢复'],
      supply: ['补给', '舰队燃料与弹药'],
      expedition: ['远征', '舰队派遣与收益'],
      practice: ['演习', '定期实战演练'],
      _: ['后勤', '入渠 · 补给 · 远征 · 演习']
    },
    quests: ['任务', '目标与奖励总览'],
    library: ['图鉴', '舰船与装备收集记录']
  };

  function go(name, arg) {
    if (!Screens[name]) { console.error('unknown screen', name); return; }
    current = { name, arg };
    currentTick = null;
    const root = screenRoot();
    root.innerHTML = '';
    root.className = '';
    Screens[name](root, arg);
    const meta = PAGE_HEADS[name];
    if (meta && current.name === name) {
      const pair = Array.isArray(meta) ? meta : (meta[arg] || meta._);
      if (pair) {
        root.insertAdjacentHTML('afterbegin',
          `<div class="page-head"><span class="ph-title">${pair[0]}</span><span class="ph-sub">${pair[1]}</span></div>`);
      }
    }
    refreshNav();
  }

  function refreshNav() {
    const nav = $('#navbar');
    /* 顶部一级菜单：按 司令部 / 舰队行动 / 后勤与生产 三组组织（不改路由） */
    const groups = [
      ['司令部', [
        ['home', '🏠 母港', ''],
        ['quests', '📋 任务', ''],
        ['library', '📖 图鉴', '']
      ]],
      ['舰队行动', [
        ['sortie', '⚔️ 出击', ''],
        ['formation', '👥 编成', '']
      ]],
      ['后勤与生产', [
        ['dormitory', '🛏 宿舍', ''],
        ['factory', '🛠 工厂', ''],
        ['logistics', '🔧 入渠', 'dock'],
        ['logistics', '⛽ 补给', 'supply'],
        ['logistics', '🚢 远征', 'expedition'],
        ['logistics', '🏆 演习', 'practice']
      ]]
    ];
    nav.innerHTML = groups.map(([label, items]) =>
      `<span class="nav-group"><span class="nav-group-label">${label}</span>` +
      items.map(([k, text, tab]) =>
        `<button data-s="${k}" data-tab="${tab}" class="${current && current.name === k && (!tab || current.arg === tab) ? 'active' : ''}">${text}</button>`).join('') +
      `</span>`).join('');
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

  function toast(msg, ms = 2600, opts = {}) {
    let t = $('#toast');
    t.innerHTML = `<div class="toast">${opts.html ? msg : Util.esc(msg)}</div>`;
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
  fetch('art/ai/index.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(m => {
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

  /* AI 立绘（art/ai）是否可用；无则返回 null，由调用方决定回退方式 */
  function aiPortraitSrc(shipId, kai = 0) {
    if (!ArtManifest.loaded) return null;
    const key = shipId + (kai === 1 ? '_kai' : kai >= 2 ? '_kai2' : '');
    const f = ArtManifest.map[key];
    return f ? `art/ai/${f}` : null;
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
    /* 士气档位徽记（方向三）：文字带具体修正数值，不靠颜色表达；「正常」档不显示。
     * 档位与系数来自 Game.moraleTier/moraleBadge（与 battle.js 同源），UI 不硬编码。 */
    const tier = Game.moraleTier(s.morale);
    const text = Game.moraleBadge(s.morale);
    if (tier && text) {
      const m = Game.moraleMods(s.morale);
      out.push(`<span class="state-badge morale-${tier.key}" title="${Util.esc(tier.name)}：命中×${m.hit} 回避×${m.evd}">${Util.esc(text)}</span>`);
    }
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
      ${shipIcon(uid)}
      <div class="hpbar"><div class="${cls}" style="width:${Math.round(ratio * 100)}%"></div></div>
      <div class="card-info">
        <span>${shipNameHtml(def)}${s.kai === 1 ? '改' : s.kai >= 2 ? '改二' : ''} <span class="dim">${def.en}</span></span>
        <span class="lv">Lv.${s.lv}</span>
      </div>
    </div>`;
  }

  /* 舰艇图标（舰种徽章 + 稀有度星标，替代立绘头像的紧凑展示，用于列表/卡片/战斗） */
  function shipIcon(uid, extra = '') {
    const s = Game.state.ships[uid];
    if (!s) return '';
    return shipIconDef(Game.shipDef(s), extra);
  }

  /* 舰艇图标（按舰船定义渲染；建造队列等无 uid 场景；extra 附加样式类） */
  function shipIconDef(def, extra = '') {
    if (!def) return '';
    const t = def.type || 'UN';
    const r = Util.clamp(def.rarity || 1, 1, 5);
    return `<div class="sicon type-${Util.esc(t)} sicon-r${r}${extra ? ' ' + extra : ''}">
      <span class="type-code">${Util.esc(t)}</span>
      <span class="type-stars">${'★'.repeat(r)}</span>
    </div>`;
  }

  function resHtml() {
    const r = Game.state.resources;
    const cap = Game.resourceCap();
    const item = (ico, v, c) =>
      `<span class="res${c > 0 && v >= c ? ' full' : ''}"><span class="ico ${ico}"></span><b>${v}</b>${c ? `<span class="dim">/${c}</span>` : ''}</span>`;
    return item('ico-fuel', r.fuel, cap) + item('ico-ammo', r.ammo, cap) +
      item('ico-steel', r.steel, cap) + item('ico-baux', r.baux, cap) +
      item('ico-screw', r.screws || 0, 0) + item('ico-devmat', r.devMats || 0, 0);
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

  return { go, Screens, toast, modal, subModal, esc, portraitImg, aiPortraitSrc, shipCard, shipIcon, shipIconDef, shipTitle, shipNameHtml, rarityStars, stateBadges, resHtml, refreshTop, setTick, tick, countdown, hpRatio, $, screenRoot, current, starHtml, eqNameHtml, eqRarityTag, eqRarityCls };
})();

window.UI = UI;
