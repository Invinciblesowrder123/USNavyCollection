'use strict';
/* ============================================================
 * 后勤：远征 / 补给 / 入渠 / 演习
 * ============================================================ */

const Logistics = (() => {
  const GameRef = () => (typeof window !== 'undefined') ? window.Game : require('../core/state.js').Game;

  const TIME_SCALE = 1; /* 配置分钟 -> 现实秒（1:1） */

  /* ============ 远征 ============ */
  function checkExReq(fleet, ex) {
    const req = ex.req || {};
    if (fleet.length < (req.ships || 0)) return false;
    const G = GameRef();
    const typeOf = u => {
      const s = G.state.ships[u];
      return s ? G.shipDef(s).type : null;
    };
    const types = fleet.map(typeOf);
    const count = t => types.filter(x => x === t).length;
    if (req.dd && count('DD') < req.dd) return false;
    if (req.cv_or_cvl && count('CV') + count('CVL') < req.cv_or_cvl) return false;
    if (req.cl_or_dd_flagship) {
      const flag = types[0];
      if (!flag || (flag !== 'CL' && flag !== 'DD')) return false;
    }
    if (req.asw) {
      const aswCount = types.filter(x => x === 'DE' || x === 'AS').length;
      if (aswCount < req.asw) return false;
    }
    return true;
  }

  function startExpedition(fleetIdx, exId) {
    const G = GameRef();
    const st = G.state;
    if (!G.isFleetUnlocked(fleetIdx)) return { ok: false, msg: '该舰队尚未解锁！' };
    const ex = EXPEDITIONS.find(e => e.id === exId);
    if (!ex) return { ok: false, msg: '远征不存在' };
    if (st.expeditions[fleetIdx]) return { ok: false, msg: '该舰队已在远征中！' };
    const fleet = st.fleet[fleetIdx];
    if (!fleet.length) return { ok: false, msg: '舰队为空！' };
    if (!checkExReq(fleet, ex)) return { ok: false, msg: '不满足远征条件（舰船数量/舰种要求）！' };
    for (const uid of fleet) {
      const s = st.ships[uid];
      if (!s) continue;
      if (st.repairs.some(r => r && r.ship === uid)) return { ok: false, msg: '舰队中有舰娘正在入渠，无法远征！' };
      if (s.hp <= Math.floor(G.shipDef(s).stats[0] * 0.25)) return { ok: false, msg: '舰队中有大破舰娘，无法远征！' };
    }
    st.expeditions[fleetIdx] = { exId, start: Date.now(), end: Date.now() + ex.time * TIME_SCALE * 1000 };
    return { ok: true, ex };
  }

  function claimExpedition(fleetIdx) {
    const G = GameRef();
    const st = G.state;
    const exInfo = st.expeditions[fleetIdx];
    if (!exInfo) return { ok: false, msg: '没有进行中的远征' };
    if (Date.now() < exInfo.end) return { ok: false, msg: '远征尚未完成！' };
    const ex = EXPEDITIONS.find(e => e.id === exInfo.exId);
    st.expeditions[fleetIdx] = null;
    st.stats.expedition++;
    Progression.notify('expedition', 1);
    /* 大成功判定（参照wiki：舰队全员闪可大幅提高大成功率；大成功资源/经验×2） */
    const fleetShips = st.fleet[fleetIdx].map(u => st.ships[u]).filter(Boolean);
    const sparkled = fleetShips.filter(s => s.morale >= 50).length;
    const great = fleetShips.length && sparkled === fleetShips.length
      ? Util.chance(0.95) : Util.chance(0.15);
    const rew = {};
    for (const k in ex.reward) rew[k] = (ex.reward[k] || 0) * (great ? 2 : 1);
    G.gain(rew);
    /* 提督经验（wiki：远征一览入手经验值即提督经验，大成功×2，失败×0.3） */
    const expBase = ex.exp || Math.min(500, Math.round(ex.time * 2));
    G.addAdmiralExp(Math.round(expBase * (great ? 2 : 1)));
    /* 舰娘经验（参照wiki：基础经验 ×(大成功2倍)×(随机2倍，可叠加)× 旗舰1.5），疲劳+30 */
    for (const uid of st.fleet[fleetIdx]) {
      const s = st.ships[uid];
      if (!s) continue;
      let exp = expBase * (great ? 2 : 1);
      if (Util.chance(0.5)) exp *= 2;                       /* 随机两倍化 */
      if (st.fleet[fleetIdx][0] === uid) exp *= 1.5;        /* 旗舰加成 */
      Progression.addShipExp(uid, Math.round(exp));
      s.morale = Math.min(100, s.morale + 30);
    }
    return { ok: true, ex, reward: rew, great };
  }

  /* ============ 补给 ============ */
  function supplyCost(fleetIdx) {
    const G = GameRef();
    const st = G.state;
    let fuel = 0, ammo = 0, baux = 0;
    for (const uid of st.fleet[fleetIdx]) {
      const s = st.ships[uid];
      if (!s) continue;
      const def = G.shipDef(s);
      const needF = 1 - s.supply.fuel, needA = 1 - s.supply.ammo;
      fuel += Math.ceil(def.consum.fuel * 4 * needF);
      ammo += Math.ceil(def.consum.ammo * 4 * needA);
      baux += Math.ceil((def.sizes || []).length * 3 * Math.min(1, needA));
    }
    return { fuel, ammo, baux, steel: 0 };
  }

  function supplyFleet(fleetIdx) {
    const G = GameRef();
    const st = G.state;
    const cost = supplyCost(fleetIdx);
    if (!G.canAfford(cost)) return { ok: false, msg: '资源不足，无法补给！' };
    G.spend(cost);
    for (const uid of st.fleet[fleetIdx]) {
      const s = st.ships[uid];
      if (s) { s.supply.fuel = 1; s.supply.ammo = 1; }
    }
    return { ok: true, cost };
  }

  /* 单舰补给（舰娘详情页使用，费用与舰队补给一致） */
  function supplyShipCost(uid) {
    const G = GameRef();
    const st = G.state;
    const s = st.ships[uid];
    if (!s) return { fuel: 0, ammo: 0, baux: 0 };
    const def = G.shipDef(s);
    const needF = 1 - s.supply.fuel, needA = 1 - s.supply.ammo;
    return {
      fuel: Math.ceil(def.consum.fuel * 4 * needF),
      ammo: Math.ceil(def.consum.ammo * 4 * needA),
      baux: Math.ceil((def.sizes || []).length * 3 * Math.min(1, needA)),
      steel: 0
    };
  }

  function supplyShip(uid) {
    const G = GameRef();
    const st = G.state;
    const cost = supplyShipCost(uid);
    if (!G.canAfford(cost)) return { ok: false, msg: '资源不足，无法补给！' };
    G.spend(cost);
    const s = st.ships[uid];
    if (s) { s.supply.fuel = 1; s.supply.ammo = 1; }
    return { ok: true, cost };
  }

  /* ============ 入渠（修理） ============ */
  function repairCost(uid) {
    const G = GameRef();
    const st = G.state;
    const s = st.ships[uid];
    if (!s) return { dmg: 0, steel: 0, minutes: 0 };
    const max = G.shipStats(uid).hpMax;
    const dmg = max - s.hp;
    if (dmg <= 0) return { dmg: 0, steel: 0, minutes: 0 };
    return { dmg, steel: Math.ceil(dmg * 0.9), minutes: Math.ceil(dmg * 0.5) };
  }

  function startRepair(dockIdx, uid) {
    const G = GameRef();
    const st = G.state;
    if (st.repairs[dockIdx]) return { ok: false, msg: '该入渠槽位正在使用中！' };
    const s = st.ships[uid];
    if (!s) return { ok: false, msg: '舰船不存在' };
    const c = repairCost(uid);
    if (c.dmg <= 0) return { ok: false, msg: '该舰娘不需要修理' };
    if (st.resources.steel < c.steel) return { ok: false, msg: `钢材不足！需要 ${c.steel}` };
    st.resources.steel -= c.steel;
    /* 测试模式：瞬间入渠完成（end=现在，下一个时钟tick自动修好） */
    const end = G.isTestMode() ? Date.now() : Date.now() + c.minutes * TIME_SCALE * 1000;
    st.repairs[dockIdx] = { ship: uid, start: Date.now(), end };
    Progression.notify('repair', 1);
    return { ok: true, c };
  }

  function cancelRepair(dockIdx) {
    const G = GameRef();
    const st = G.state;
    const r = st.repairs[dockIdx];
    if (!r) return;
    st.repairs[dockIdx] = null;
  }

  /* ============ 演习 ============ */
  function practiceReady() {
    const st = GameRef().state;
    const today = new Date().toDateString();
    if (st.practice.date !== today) {
      st.practice.date = today;
      st.practice.used = 0;
      st.practice.fleets = PracticeGen();
    }
    return st.practice;
  }

  /* 生成5个梯度演习对手（等级参照我方舰队最高舰娘等级；提督等级下限） */
  function PracticeGen() {
    const G = GameRef();
    const st = G.state;
    let topLv = st.admiral.level;
    for (const uid of st.fleet[1] || []) {
      const s = st.ships[uid];
      if (s && s.lv > topLv) topLv = s.lv;
    }
    const lv = Math.min(Progression.MAX_LV, Math.max(st.admiral.level, topLv));
    const names = ['列克星敦队的演练', '弗莱彻小队的合练', '大黄蜂的挑战', '密苏里的邀请', '深海舰队模拟战'];
    const fleets = [];
    const defs = ['mahan', 'benson', 'fletcher', 'atlanta', 'helena', 'brooklyn', 'baltimore', 'neworleans', 'iowa', 'northcarolina', 'essex', 'enterprise', 'saratoga', 'ranger', 'independence', 'johnston', 'gato', 'sbroberts'];
    for (let i = 0; i < 5; i++) {
      const count = Math.min(6, 2 + Math.floor((lv + i) / 8));
      const roster = [];
      const types = ['DD', 'DD', 'CL', 'CA', 'BB', 'CV', 'SS', 'CVL'];
      for (let k = 0; k < count; k++) {
        const t = types[Math.min(k, types.length - 1)];
        const pool = defs.filter(id => ShipData[id].type === t);
        roster.push({ id: Util.pick(pool), lv: Math.max(5, Math.min(Progression.MAX_LV, Math.round(lv * Util.rf(0.6, 1.2)))) });
      }
      fleets.push({ name: names[i % names.length], ships: roster });
    }
    return fleets;
  }

  return { startExpedition, claimExpedition, checkExReq, supplyCost, supplyFleet, supplyShipCost, supplyShip, repairCost, startRepair, cancelRepair, practiceReady, PracticeGen };
})();

if (typeof window !== 'undefined') window.Logistics = Logistics;
if (typeof module !== 'undefined' && module.exports) module.exports = { Logistics };
