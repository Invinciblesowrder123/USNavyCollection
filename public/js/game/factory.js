'use strict';
/* ============================================================
 * 工厂：建造 + 开发 + 装备解体
 * 开发（参照 kcwiki「开发」）：秘书舰系 × 最高资源池 → 即时结算
 *   - 投入燃料/弹药/钢材/铝（必消耗）+ 开发资材（成功才消耗）
 *   - 每池 50 等份，出货率=份额×2%；失败份额=50-Σ份额
 *   - roll 出装备后判定：提督等级≥稀有度×10 且 资源≥解体值×10 才成功
 * ============================================================ */

const Factory = (() => {
  const GameRef = () => (typeof window !== 'undefined') ? window.Game : require('../core/state.js').Game;

  const DEV_MATS_CAP = 3000;

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
    /* 测试模式：瞬间建造完成（end=现在，可立即领取） */
    const end = G.isTestMode() ? Date.now() : Date.now() + buildTimeMinutes(shipDef.build.hours) * 1000;
    const job = {
      start: Date.now(),
      end,
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
    G.equipDefaults(ship.uid);   // 新船自带默认装备（参照wiki：入手舰船自带初始搭载）
    st.stats.build++;
    Progression.notify('build', 1);
    return { ok: true, ship };
  }

  /* ---- 开发（参照 kcwiki「开发」） ---- */

  /* 开发预览：给定配方与秘书舰，返回所在开发池、池内装备与出货率、失败率 */
  function developPreview(recipe, secretaryUid) {
    const G = GameRef();
    const st = G.state;
    const secInst = secretaryUid ? st.ships[secretaryUid] : null;
    const sec = secInst ? G.shipDef(secInst) : null;
    const secKey = secretaryKey(sec);
    const pool = devPoolKey(recipe);
    const entries = devEntries(secKey, pool);
    return {
      secKey, secZh: DEV_SEC_ZH[secKey] || '（无秘书舰）', secDesc: DEV_SEC_DESC[secKey] || '',
      pool, poolZh: DEV_POOL_ZH[pool],
      entries: entries.map(e => ({ id: e.id, rate: e.rate, pct: e.rate * 2 })),
      failShare: devFailShare(secKey, pool), failPct: devFailShare(secKey, pool) * 2
    };
  }

  /* 开发：即时结算（参照 wiki：开发瞬间完成；失败资源被消耗但开发资材不消耗）
   * 步骤：选池 → 从池中 roll 装备 → 判定成功/失败 */
  function develop(recipe, secretaryUid) {
    const G = GameRef();
    const st = G.state;
    const devMats = st.resources.devMats || 0;
    if (devMats < 1) return { ok: false, msg: '开发资材不足！请先完成任务或远征获取开发资材。' };
    if (!G.canAfford(recipe)) return { ok: false, msg: '资源不足！' };
    const pv = developPreview(recipe, secretaryUid);
    const secInst = secretaryUid ? st.ships[secretaryUid] : null;
    const sec = secInst ? G.shipDef(secInst) : null;
    if (!sec) return { ok: false, msg: '需要设置秘书舰（第一舰队旗舰）才能开发。' };

    /* 1. roll：先判定失败份额，否则按份额加权选出装备 */
    const roll = Util.ri(1, 50);
    if (roll <= pv.failShare) {
      G.spend(recipe);
      st.stats.develop++;
      Progression.notify('develop', 1);
      return { ok: true, success: false, msg: '开发失败……（什么也没得到）', pv };
    }
    const weights = {};
    pv.entries.forEach(e => weights[e.id] = e.rate);
    const eqId = Util.weighted(weights);
    const ed = EquipmentData[eqId];

    /* 2. 判定成功/失败（wiki：等级≥稀有度×10 且 4项资源≥最低资源要求；
     * 本作提督经验曲线较缓，等级门槛按 稀有度×3 缩放） */
    const needLv = (ed.r || 1) * 3;
    const req = devMinReq(ed);
    const resOk = (recipe.fuel || 0) >= req.fuel && (recipe.ammo || 0) >= req.ammo &&
      (recipe.steel || 0) >= req.steel && (recipe.baux || 0) >= req.baux;
    if (st.admiral.level < needLv || !resOk) {
      G.spend(recipe);
      st.stats.develop++;
      Progression.notify('develop', 1);
      return { ok: true, success: false, msg: `开发失败……（${ed.zh}需要提督Lv.${needLv}且资源满足${req.fuel}/${req.ammo}/${req.steel}/${req.baux}）`, pv };
    }

    /* 3. 成功：消耗资源 + 1 开发资材，获得装备 */
    G.spend(recipe);
    st.resources.devMats = Math.max(0, devMats - 1);
    const eq = G.createEquip(eqId);
    st.stats.develop++;
    Progression.notify('develop', 1);
    Progression.notify('develop_success', 1);
    return { ok: true, success: true, eq, pv };
  }

  /* ---- 装备解体（参照 wiki：解体装备回收资源；装备中的装备需先卸下） ---- */
  function scrapEquip(euid) {
    const G = GameRef();
    const st = G.state;
    const eq = st.equipment[euid];
    if (!eq) return { ok: false, msg: '装备不存在' };
    if (eq.locked) return { ok: false, msg: '装备已上锁，请先解锁' };
    const used = Object.values(st.ships).some(s => (s.equipped || []).includes(euid));
    if (used) return { ok: false, msg: '装备中的装备需先卸下' };
    const ed = EquipmentData[eq.id];
    if (!ed) return { ok: false, msg: '装备数据缺失' };
    const gain = { ...(ed.scrap || {}) };
    G.destroyEquip(euid);
    G.gain(gain);
    return { ok: true, gain, name: ed.zh };
  }

  function toggleEquipLock(euid) {
    const G = GameRef();
    const eq = G.state.equipment[euid];
    if (!eq) return { ok: false, msg: '装备不存在' };
    eq.locked = !eq.locked;
    return { ok: true, locked: eq.locked };
  }

  return { startBuild, claimBuild, develop, developPreview, scrapEquip, toggleEquipLock, DEV_MATS_CAP };
})();

if (typeof window !== 'undefined') window.Factory = Factory;
if (typeof module !== 'undefined' && module.exports) module.exports = { Factory };
