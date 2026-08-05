'use strict';
/* ============================================================
 * 工厂：建造 + 开发
 * 时间按比例压缩（配置1小时=现实60秒），保证网页游戏节奏
 * ============================================================ */

const Factory = (() => {
  const GameRef = () => (typeof window !== 'undefined') ? window.Game : require('../core/state.js').Game;

  function buildTimeMinutes(hours) { return Math.max(1, Math.round(hours * 60)); }

  /* 建造：确定配方可出的舰池并抽签（稀有度加权） */
  function startBuild(recipe) {
    const G = GameRef();
    const st = G.state;
    if (!G.canAfford(recipe)) return { ok: false, msg: '资源不足！' };
    if (st.construction.length >= 2) return { ok: false, msg: '建造船坞已满！' };
    let pool = buildPool(recipe);
    if (!pool.length) pool = SHIPS.filter(s => s.type === 'DD' && s.buildable !== false);
    const weights = {};
    pool.forEach(s => weights[s.id] = RARITY_W[s.rarity] || 10);
    const shipId = Util.weighted(weights);
    const shipDef = ShipData[shipId];
    G.spend(recipe);
    const job = {
      start: Date.now(),
      end: Date.now() + buildTimeMinutes(shipDef.build.hours) * 1000,
      recipe: { ...recipe }, shipId
    };
    st.construction.push(job);
    return { ok: true, job };
  }

  function claimBuild(i) {
    const G = GameRef();
    const st = G.state;
    const job = st.construction[i];
    if (!job || Date.now() < job.end) return { ok: false, msg: '尚未建造完成！' };
    st.construction.splice(i, 1);
    const ship = G.createShip(job.shipId, 1);
    st.stats.build++;
    Progression.notify('build', 1);
    return { ok: true, ship };
  }

  /* 开发：秘书舰类型决定开发池 */
  function startDevelop(recipe, secretaryUid) {
    const G = GameRef();
    const st = G.state;
    if (!G.canAfford(recipe)) return { ok: false, msg: '资源不足！' };
    if (st.development.length >= 2) return { ok: false, msg: '开发位已满！' };
    const secInst = secretaryUid ? st.ships[secretaryUid] : null;
    const sec = secInst ? G.shipDef(secInst) : null;
    const key = secretaryKey(sec);
    let pool = (SECRETARY_POOL[key] || []).map(id => EquipmentData[id])
      .filter(e => e.buildable !== false && recipe.fuel >= e.cost[0] && recipe.ammo >= e.cost[1] &&
        recipe.steel >= e.cost[2] && recipe.baux >= e.cost[3]);
    let eqId = null;
    if (pool.length) {
      const weights = {};
      pool.forEach(e => weights[e.id] = e.rare ? 6 : 22);
      if (Util.chance(0.75)) eqId = Util.weighted(weights);
    }
    G.spend(recipe);
    const job = {
      start: Date.now(),
      end: Date.now() + 20000,
      recipe: { ...recipe }, eqId, poolKey: key
    };
    st.development.push(job);
    return { ok: true, job };
  }

  function claimDevelop(i) {
    const G = GameRef();
    const st = G.state;
    const job = st.development[i];
    if (!job || Date.now() < job.end) return { ok: false, msg: '尚未开发完成！' };
    st.development.splice(i, 1);
    st.stats.develop++;
    Progression.notify('develop', 1);
    if (!job.eqId) return { ok: true, eq: null };
    const eq = G.createEquip(job.eqId);
    return { ok: true, eq };
  }

  return { startBuild, claimBuild, startDevelop, claimDevelop };
})();

if (typeof window !== 'undefined') window.Factory = Factory;
if (typeof module !== 'undefined' && module.exports) module.exports = { Factory };
