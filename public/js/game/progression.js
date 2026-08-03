'use strict';
/* ============================================================
 * 养成与任务：等级/改造/近代化改修/任务追踪
 * ============================================================ */

const Progression = (() => {
  const GameRef = () => (typeof window !== 'undefined') ? window.Game : require('../core/state.js').Game;

  const MAX_LV = 99;
  const KAI_COST = { fuel: 200, ammo: 100, steel: 300, baux: 50 };

  /* ============ 经验（平缓曲线：到25级约1万经验） ============ */
  function shipExpToLevel(lv) { return 50 + 30 * lv; }
  function addShipExp(uid, exp) {
    const G = GameRef();
    const s = G.state.ships[uid];
    if (!s || s.lv >= MAX_LV) return 0;
    s.exp += exp;
    let ups = 0;
    while (s.lv < MAX_LV && s.exp >= shipExpToLevel(s.lv)) {
      s.exp -= shipExpToLevel(s.lv);
      s.lv++;
      ups++;
    }
    if (s.lv >= MAX_LV) s.exp = 0;
    return ups;
  }

  /* ============ 改造 ============ */
  function remodelInfo(uid) {
    const G = GameRef();
    const s = G.state.ships[uid];
    if (!s) return null;
    const def = G.shipDef(s);
    const next = s.kai === 0 ? def.kai : (s.kai === 1 ? def.kai2 : null);
    if (!next) return null;
    return { next, lvNeed: next.lv, cost: KAI_COST, stage: s.kai };
  }

  function remodel(uid) {
    const G = GameRef();
    const st = G.state;
    const info = remodelInfo(uid);
    if (!info) return { ok: false, msg: '已是最终形态' };
    const s = st.ships[uid];
    if (s.lv < info.lvNeed) return { ok: false, msg: `等级不足！需要 Lv.${info.lvNeed}` };
    if (!G.canAfford(info.cost)) return { ok: false, msg: '资源不足！' };
    G.spend(info.cost);
    s.kai++;
    const def = G.shipDef(s);
    const max = G.shipStats(uid).hpMax;
    s.hp = max;
    s.supply = { fuel: 1, ammo: 1 };
    st.stats.remodel++;
    notify('remodel', 1);
    if (def.type === 'BB' || def.type === 'BBV') notify('remodel_bb', 1);
    return { ok: true, def };
  }

  /* ============ 近代化改修 ============ */
  const MOD_STATS = ['fp', 'tp', 'aa', 'arm', 'evd', 'asw', 'los'];
  const MOD_CAP = { fp: 1.3, tp: 1.3, aa: 1.3, arm: 1.3, evd: 1.4, asw: 1.4, los: 1.4 };

  function modernizeInfo(uid) {
    const G = GameRef();
    const s = G.state.ships[uid];
    if (!s) return null;
    const def = G.shipDef(s);
    const gains = {};
    const stats = def.stats;
    const names = ['fp', 'tp', 'aa', 'arm', 'evd', 'asw', 'los'];
    names.forEach((n, i) => {
      const cap = Math.floor(stats[i] * MOD_CAP[n]);
      if (s.modern[n] < cap - stats[i]) gains[n] = 1;
    });
    return { gains, cost: { fuel: 30, ammo: 30 } };
  }

  function modernize(materialUid, targetUid) {
    const G = GameRef();
    const st = G.state;
    const m = st.ships[materialUid];
    const t = st.ships[targetUid];
    if (!m || !t) return { ok: false, msg: '舰船不存在' };
    if (m.uid === t.uid) return { ok: false, msg: '不能以自己为材料' };
    if (m.locked) return { ok: false, msg: '材料舰已上锁' };
    const info = modernizeInfo(targetUid);
    if (!info || !Object.keys(info.gains).length) return { ok: false, msg: '目标舰已满改修' };
    if (st.resources.fuel < 30 || st.resources.ammo < 30) return { ok: false, msg: '资源不足！' };
    st.resources.fuel -= 30;
    st.resources.ammo -= 30;
    /* 材料舰属性按比例转入目标 */
    const mStats = G.shipStats(materialUid);
    const tDef = G.shipDef(t);
    const STAT_NAMES = G.STAT_NAMES;
    for (const n in info.gains) {
      const idx = STAT_NAMES.indexOf(n);
      const base = tDef.stats[idx];
      const cap = Math.floor(base * MOD_CAP[n]);
      const val = Math.max(1, Math.floor(mStats[n] / 12)) * (mStats[n] > 0 ? 1 : 0);
      t.modern[n] = Math.min(cap - base, (t.modern[n] || 0) + val);
      if (n === 'fp' || n === 'tp' || n === 'arm') t.modern[n] = Math.min(cap - base, t.modern[n]);
    }
    G.destroyShip(materialUid);
    st.stats.modernize++;
    notify('modernize', 1);
    return { ok: true };
  }

  /* ============ 任务追踪 ============ */
  const RESET_DAILY = 'daily', RESET_WEEKLY = 'weekly', RESET_MONTHLY = 'monthly';

  function resetDue() {
    const st = GameRef().state;
    const now = new Date();
    const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    const weekKey = `${now.getFullYear()}-W${Math.floor(now.getTime() / (7 * 864e5))}`;
    const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
    const keys = { daily: dayKey, weekly: weekKey, monthly: monthKey };
    const changed = [];
    for (const k in keys) {
      if (st['reset_' + k] !== keys[k]) {
        st['reset_' + k] = keys[k];
        changed.push(k);
      }
    }
    return changed;
  }

  function resetQuests(kinds) {
    const st = GameRef().state;
    for (const q of QUESTS) {
      if (kinds.includes(q.type)) {
        st.quests[q.id] = { progress: 0, claimed: false };
      }
    }
  }

  function initQuests() {
    const st = GameRef().state;
    for (const q of QUESTS) {
      if (!st.quests[q.id]) st.quests[q.id] = { progress: 0, claimed: false };
    }
  }

  /* 统计任务进度：kind -> 数值或对象 */
  function notify(kind, value = 1, param) {
    const st = GameRef().state;
    for (const q of QUESTS) {
      if (q.cond.kind !== kind) continue;
      if (q.cond.param !== undefined && String(q.cond.param) !== String(param === undefined ? q.cond.param : param)) continue;
      const qq = st.quests[q.id];
      if (!qq || qq.claimed) continue;
      qq.progress = Math.min(q.cond.count, qq.progress + value);
    }
  }

  function canClaim(qid) {
    const st = GameRef().state;
    const q = QUESTS.find(x => x.id === qid);
    const qq = st.quests[qid];
    return !!(q && qq && !qq.claimed && qq.progress >= q.cond.count);
  }

  function claimQuest(qid) {
    const G = GameRef();
    const st = G.state;
    if (!canClaim(qid)) return { ok: false, msg: '任务未完成' };
    const q = QUESTS.find(x => x.id === qid);
    st.quests[qid].claimed = true;
    const r = addQuestReward(st, q);
    const ships = r.ship ? r.ship.map(id => G.createShip(id, 1)) : [];
    const eqs = r.equip ? r.equip.map(id => G.createEquip(id)) : [];
    return { ok: true, q, ships, eqs };
  }

  /* ============ 出击结果经验结算（演习/出击共用） ============ */
  function applyBattleResult(fleetIdx, result, isPractice) {
    const G = GameRef();
    const st = G.state;
    const fleet = st.fleet[fleetIdx];
    const rankBase = { S: 420, A: 320, B: 220, C: 150, D: 60 }[result.rank] || 60;
    const mySide = result.mySide;
    const gains = [];
    for (const f of fleet) {
      const s = st.ships[f];
      if (!s) continue;
      const side = mySide.find(x => x.uid === f);
      if (!side) continue;
      let exp = rankBase;
      if (result.mvpUid && result.mvpUid.uid === f) exp *= 2;
      if (st.fleet[fleetIdx][0] === f) exp *= 1.5;
      const ups = addShipExp(f, Math.floor(exp));
      gains.push({ uid: f, exp: Math.floor(exp), ups });
    }
    if (!isPractice) {
      notify('sortie', 1);
      if (result.victory) notify('win', 1);
      if (result.rank === 'S') notify('s_win', 1);
      notify('sink', result.enemyKilled);
    } else {
      notify('practice', 1);
    }
    return gains;
  }

  /* 动态条件检查（编成规模/搭载飞机数），由主循环每秒调用 */
  function checkDynamic() {
    const G = GameRef();
    const st = G.state;
    const fleetCount = (st.fleet[1] || []).length + (st.fleet[2] || []).length;
    notify('fleet_size', fleetCount >= 4 ? 1 : 0, 4);
    let planes = 0;
    for (const uid of st.fleet[1] || []) {
      const s = st.ships[uid];
      if (!s) continue;
      for (const euid of s.equipped) {
        const e = st.equipment[euid];
        if (e && EquipmentData[e.id] && [SLOT.FIGHTER, SLOT.ATTACKER, SLOT.BOMBER].includes(EquipmentData[e.id].slot)) planes++;
      }
    }
    notify('plane_count', planes >= 8 ? 1 : 0, 8);
  }

  return {
    MAX_LV, shipExpToLevel, addShipExp, remodelInfo, remodel,
    modernizeInfo, modernize, resetDue, resetQuests, initQuests, notify, canClaim, claimQuest,
    applyBattleResult, checkDynamic
  };
})();

if (typeof window !== 'undefined') window.Progression = Progression;
if (typeof module !== 'undefined' && module.exports) module.exports = { Progression };
