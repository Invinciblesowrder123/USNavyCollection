'use strict';
/* ============================================================
 * 舰艇宿舍：全舰总览 + 舰种/稀有度/舰队筛选 + 排序 + 点击查看详情
 * 排序/筛选在会话内保留（切换页面不重置）
 * ============================================================ */

const Dormitory = (() => {
  const st = () => Game.state;
  const TYPE_ORDER = ['BB', 'BBV', 'CV', 'CVB', 'CVL', 'CA', 'CAV', 'CL', 'CLT', 'DD', 'DE', 'SS', 'AV', 'AS', 'AP'];

  /* 筛选条件（会话内保留） */
  let dorType = 'ALL';   // 舰种：ALL 或 type 键
  let dorRarity = 0;     // 稀有度：0=全部，1~5
  let dorFleet = 0;      // 舰队归属：0=全部，-1=未编队，1~4=对应舰队
  let dorSort = { key: 'lv', dir: -1 };   // key: lv | rarity | type | time

  const SORT_OPTS = [
    ['lv:-1', '等级 高→低'], ['lv:1', '等级 低→高'],
    ['rarity:-1', '稀有度 高→低'], ['rarity:1', '稀有度 低→高'],
    ['type:1', '舰种 分组'],
    ['time:-1', '入手 新→旧'], ['time:1', '入手 旧→新']
  ];

  function fleetOf(uid) {
    for (const f of [1, 2, 3, 4]) if ((st().fleet[f] || []).includes(uid)) return f;
    return 0;
  }

  function cmp(a, b) {
    const defA = Game.shipDef(a), defB = Game.shipDef(b);
    const uidA = parseInt(a.uid.slice(1), 10) || 0;
    const uidB = parseInt(b.uid.slice(1), 10) || 0;
    let r = 0;
    if (dorSort.key === 'lv') {
      r = a.lv - b.lv;
    } else if (dorSort.key === 'rarity') {
      r = (defA.rarity || 1) - (defB.rarity || 1);
      if (r === 0) r = a.lv - b.lv;
    } else if (dorSort.key === 'type') {
      r = TYPE_ORDER.indexOf(defA.type) - TYPE_ORDER.indexOf(defB.type);
      if (r === 0) r = (defA.rarity || 1) - (defB.rarity || 1);
    } else {
      const ta = a.obtainedAt || uidA, tb = b.obtainedAt || uidB;
      r = ta - tb;
    }
    if (r === 0) r = uidA - uidB;
    return r * dorSort.dir;
  }

  function filtered() {
    return Object.values(st().ships).filter(s => {
      const d = Game.shipDef(s);
      if (dorType !== 'ALL' && d.type !== dorType) return false;
      if (dorRarity && (d.rarity || 1) !== dorRarity) return false;
      if (dorFleet === -1 && fleetOf(s.uid)) return false;
      if (dorFleet > 0 && fleetOf(s.uid) !== dorFleet) return false;
      return true;
    }).sort(cmp);
  }

  /* 宿舍卡片：舰队归属角标 + 通用舰船卡片 */
  function dormCard(uid) {
    const f = fleetOf(uid);
    return `<div class="dorm-cell">
      ${f ? `<span class="dorm-fleet-badge">第${f}队</span>` : ''}
      ${UI.shipCard(uid)}
    </div>`;
  }

  function dormitory(root) {
    const ships = Object.values(st().ships);
    const typeNames = Object.keys(SHIP_TYPE_ZH)
      .filter(t => ships.some(s => Game.shipDef(s).type === t))
      .sort((a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b));
    const rarities = [1, 2, 3, 4, 5].filter(r => ships.some(s => (Game.shipDef(s).rarity || 1) === r));
    const fleetNums = Game.unlockedFleets();

    function render() {
      const list = filtered();
      const stats = {
        total: ships.length,
        inFleet: ships.filter(s => fleetOf(s.uid)).length,
        idle: ships.filter(s => !fleetOf(s.uid)).length,
        repair: st().repairs.filter(r => r && st().ships[r.ship]).length,
        broken: ships.filter(s => s.hp > 0 && s.hp / Game.shipStats(s.uid).hpMax <= 0.25).length,
        /* 士气档位（方向三）：档位判定走 Game.moraleTier（与 battle.js 同源），不在此硬编码阈值 */
        sparkle: ships.filter(s => Game.moraleTier(s.morale).key === 'flash').length,
        low: ships.filter(s => Game.moraleTier(s.morale).key === 'low').length,
        red: ships.filter(s => Game.moraleTier(s.morale).key === 'red').length
      };

      root.className = '';
      root.innerHTML = `
        <div class="panel panel-deco">
          <h3 class="panel-title"><span class="title-ico">🛏</span>舰艇宿舍<span class="title-sub">（点击舰娘图标查看详情）</span><span class="title-line"></span></h3>
          <div class="dorm-summary">
            <span class="dorm-chip">🚢 全部 <b>${stats.total}</b></span>
            <span class="dorm-chip">⚓ 舰队中 <b>${stats.inFleet}</b></span>
            <span class="dorm-chip">◌ 未编队 <b>${stats.idle}</b></span>
            <span class="dorm-chip">🔧 入渠 <b>${stats.repair}</b></span>
            <span class="dorm-chip danger">💥 大破 <b>${stats.broken}</b></span>
            <span class="dorm-chip">✨ 闪 <b>${stats.sparkle}</b></span>
            <span class="dorm-chip">🟠 士气偏低 <b>${stats.low}</b></span>
            <span class="dorm-chip danger">😵 红脸 <b>${stats.red}</b></span>
          </div>
        </div>
        <div class="panel">
          <div class="roster-tools">
            <span class="dim">舰种</span>
            ${['ALL', ...typeNames].map(t =>
              `<span class="preset-recipe ${dorType === t ? 'active' : ''}" data-dtype="${t}">${t === 'ALL' ? '全部' : SHIP_TYPE_ZH[t]}</span>`
            ).join('')}
            <span class="dim" style="margin-left:14px">稀有度</span>
            <span class="preset-recipe ${dorRarity === 0 ? 'active' : ''}" data-drarity="0">全部</span>
            ${rarities.map(r => `<span class="preset-recipe ${dorRarity === r ? 'active' : ''}" data-drarity="${r}">${'★'.repeat(r)}</span>`).join('')}
            <span class="dim" style="margin-left:14px">舰队</span>
            <span class="preset-recipe ${dorFleet === 0 ? 'active' : ''}" data-dfleet="0">全部</span>
            <span class="preset-recipe ${dorFleet === -1 ? 'active' : ''}" data-dfleet="-1">未编队</span>
            ${fleetNums.map(f => `<span class="preset-recipe ${dorFleet === f ? 'active' : ''}" data-dfleet="${f}">第${f}队</span>`).join('')}
            <span class="dim" style="margin-left:14px">排序</span>
            ${SORT_OPTS.map(([key, label]) =>
              `<span class="preset-recipe ${dorSort.key + ':' + dorSort.dir === key ? 'active' : ''}" data-dsort="${key}">${label}</span>`
            ).join('')}
            <span class="dim">共 ${list.length} 艘</span>
          </div>
          <div class="dorm-grid">
            ${list.map(s => dormCard(s.uid)).join('') ||
            `<div class="hint">${ships.length ? '没有符合筛选条件的舰娘' : '没有舰艇，去工厂建造吧！'}</div>`}
          </div>
        </div>`;

      root.querySelectorAll('[data-dtype]').forEach(el =>
        el.addEventListener('click', () => { dorType = el.dataset.dtype; render(); }));
      root.querySelectorAll('[data-drarity]').forEach(el =>
        el.addEventListener('click', () => { dorRarity = parseInt(el.dataset.drarity, 10); render(); }));
      root.querySelectorAll('[data-dfleet]').forEach(el =>
        el.addEventListener('click', () => { dorFleet = parseInt(el.dataset.dfleet, 10); render(); }));
      root.querySelectorAll('[data-dsort]').forEach(el =>
        el.addEventListener('click', () => {
          const [key, dir] = el.dataset.dsort.split(':');
          dorSort = { key, dir: parseInt(dir, 10) };
          render();
        }));
      root.querySelectorAll('.ship-card').forEach(c =>
        c.addEventListener('click', () => Homeport.openShipDetail(c.dataset.uid, render)));
    }
    render();
  }

  return { dormitory };
})();

UI.Screens.dormitory = Dormitory.dormitory;
