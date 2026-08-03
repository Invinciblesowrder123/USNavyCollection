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
    const types = fleet.map(u => GameRef().state.ships[u]);
    const count = t => types.filter(s => s && s.type === t).length;
    if (req.dd && count('DD') < req.dd) return false;
    if (req.cv_or_cvl && count('CV') + count('CVL') < req.cv_or_cvl) return false;
    if (req.cl_or_dd_flagship) {
      const flag = types[0];
      if (!flag || (flag.type !== 'CL' && flag.type !== 'DD')) return false;
    }
    if (req.asw) {
      const aswCount = types.filter(s => s && (s.type === 'DE' || s.type === 'AS')).length;
      if (aswCount < req.asw) return false;
    }
    return true;
  }

  function startExpedition(fleetIdx, exId) {
    const G = GameRef();
    const st = G.state;
    const ex = EXPEDITIONS.find(e => e.id === exId);
    if (!ex) return { ok: false, msg: '远征不存在' };
    if (st.expeditions[fleetIdx]) return { ok: false, msg: '该舰队已在远征中！' };
    const fleet = st.fleet[fleetIdx];
    if (!fleet.length) return { ok: false, msg: '舰队为空！' };
    if (!checkExReq(fleet, ex)) return { ok: false, msg: '不满足远征条件（舰船数量/舰种要求）！' };
    for (const uid of fleet) {
      const s = st.ships[uid];
      if (s && s.hp <= Math.floor(G.shipDef(s).stats[0] * 0.25)) return { ok: false, msg: '舰队中有大破舰娘，无法远征！' };
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
    G.gain(ex.reward);
    /* 远征归来的舰娘加疲劳 */
    for (const uid of st.fleet[fleetIdx]) {
      const s = st.ships[uid];
      if (s) s.morale = Math.min(100, s.morale + 30);
    }
    return { ok: true, ex, reward: ex.reward };
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
      baux += (def.sizes || []).length * 3 * Math.min(1, needA);
    }
    return { fuel, ammo, baux };
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
    st.repairs[dockIdx] = { ship: uid, start: Date.now(), end: Date.now() + c.minutes * TIME_SCALE * 1000 };
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

  /* 生成5个梯度演习对手（按提督等级） */
  function PracticeGen() {
    const G = GameRef();
    const st = G.state;
    const lv = st.admiral.level;
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
        roster.push({ id: Util.pick(pool), lv: Math.max(5, Math.floor(lv * Util.rf(0.6, 1.2))) });
      }
      fleets.push({ name: names[i % names.length], ships: roster });
    }
    return fleets;
  }

  return { startExpedition, claimExpedition, checkExReq, supplyCost, supplyFleet, repairCost, startRepair, cancelRepair, practiceReady, PracticeGen };
})();

if (typeof window !== 'undefined') window.Logistics = Logistics;
if (typeof module !== 'undefined' && module.exports) module.exports = { Logistics };
