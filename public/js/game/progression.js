'use strict';
/* ============================================================
 * 养成与任务：等级/改造/近代化改修/任务追踪
 * ============================================================ */

const Progression = (() => {
  const GameRef = () => (typeof window !== 'undefined') ? window.Game : require('../core/state.js').Game;

  const MAX_LV = 99;
  const KAI_COST = { fuel: 200, ammo: 100, steel: 300, baux: 50 };

  /* ============ 经验（参照舰娘百科经验表：Lv1~99 累计85.15万，Lv99→100再需14.85万） ============ */
  function shipExpToLevel(lv) {
    /* 从 lv 级升到 lv+1 所需经验（lv = 1..98） */
    if (lv < 1) return 0;
    if (lv <= 50) return 100 * lv;
    if (lv <= 60) return 100 * (2 * lv - 50);
    if (lv <= 70) return 100 * (3 * lv - 110);
    if (lv <= 80) return 100 * (4 * lv - 180);
    if (lv <= 90) return 100 * (5 * lv - 260);
    if (lv === 91) return 20000;
    if (lv === 92) return 22000;
    if (lv === 93) return 25000;
    if (lv === 94) return 30000;
    if (lv === 95) return 40000;
    if (lv === 96) return 60000;
    if (lv === 97) return 90000;
    if (lv === 98) return 148500;
    if (lv === 99) return 148500;   /* 99→100（结婚），演习经验公式亦引用 */
    return 0;
  }
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
    /* 改造不继承改修值（参照 wiki：火力/雷装/对空/装甲重置，运/对潜/耐久保留） */
    for (const k of ['fp', 'tp', 'aa', 'arm']) s.modern[k] = 0;
    const def = G.shipDef(s);
    const max = G.shipStats(uid).hpMax;
    s.hp = max;
    s.supply = { fuel: 1, ammo: 1 };
    st.stats.remodel++;
    notify('remodel', 1);
    if (def.type === 'BB' || def.type === 'BBV') notify('remodel_bb', 1);
    return { ok: true, def };
  }

  /* ============ 近代化改修（参照 wiki「近代化改修」，合成/多素材/奖励偏斜/上限/海防舰） ============ */
  /* 普通舰船素材可提升的属性：火力/雷装/对空/装甲（回避·命中无法改修）
   * 海防舰(DE)素材额外可提升：耐久/对潜/运（改造后继承） */
  const MOD_STATS = ['fp', 'tp', 'aa', 'arm'];
  const DE_STATS = ['hp', 'asw', 'lck'];
  const MOD_CAP = { fp: 1.3, tp: 1.3, aa: 1.3, arm: 1.3 };   /* 上限 = 基础值×1.3 */
  const DE_ASW_CAP = 9;                                       /* 对潜改修上限 +9 */
  const DE_HP_CAP = 2;                                        /* 耐久改修上限 +2 */
  const DE_LCK_CAP = 8;                                       /* 运改修上限 +8 */

  /* 素材属性值表（参照 wiki 近代化改修素材列表，舰种决定基础值，改造形态加成）
   * 例：驱逐=火力1雷装1 / 重巡=火力2装甲2 / 战列=火力3装甲3 / 空母=火力4对空3 */
  const MOD_VALUE = {
    BB: { fp: 3, arm: 3, aa: 1 }, BBV: { fp: 3, arm: 3, aa: 1 },
    CV: { fp: 4, aa: 3 }, CVL: { fp: 3, aa: 2 },
    CA: { fp: 2, arm: 2, tp: 1 }, CAV: { fp: 2, arm: 2, aa: 1, tp: 1 },
    CL: { fp: 1, tp: 1 }, CLT: { fp: 1, tp: 2 },
    DD: { fp: 1, tp: 1 }, SS: { tp: 2 },
    AV: { fp: 2, aa: 2 }, AS: { fp: 1, arm: 1, aa: 1 },
    DE: { asw: 1, hp: 1, lck: 1 }      /* 海防舰：耐久/对潜/运 */
  };
  const MOD_KAI_BONUS = {
    BB: { fp: 1, arm: 1, aa: 1 }, BBV: { fp: 1, arm: 1, aa: 1 },
    CV: { fp: 1, aa: 1 }, CVL: { aa: 1 },
    CA: { fp: 1, arm: 1 }, CAV: { fp: 1, aa: 1 },
    CL: { aa: 1 }, CLT: { tp: 1, aa: 1 },
    DD: { fp: 1 }, SS: { tp: 1 },
    AV: { fp: 1, aa: 1 }, AS: { fp: 1, aa: 1 },
    DE: { asw: 1, lck: 1 }             /* 改海防舰：对潜/运加成更好 */
  };

  /* 素材舰提供的属性值 */
  function materialValue(uid) {
    const G = GameRef();
    const inst = G.state.ships[uid];
    if (!inst) return {};
    const type = G.shipDef(inst).type;
    const out = { ...(MOD_VALUE[type] || {}) };
    if (inst.kai >= 1 || inst.kai >= 2) {
      const b = MOD_KAI_BONUS[type] || {};
      const times = inst.kai >= 2 ? 2 : 1;
      for (const k in b) out[k] = (out[k] || 0) + b[k] * times;
    }
    return out;
  }

  /* 属性改修上限（剩余容量） */
  function modernCap(uid, stat) {
    const G = GameRef();
    const inst = G.state.ships[uid];
    const def = G.shipDef(inst);
    const base = def.stats[G.STAT_NAMES.indexOf(stat)];
    const cap = (stat === 'fp' || stat === 'tp' || stat === 'aa' || stat === 'arm')
      ? Math.floor(base * MOD_CAP[stat]) - base
      : (stat === 'asw' ? DE_ASW_CAP : stat === 'hp' ? DE_HP_CAP : stat === 'lck' ? DE_LCK_CAP : 0);
    return Math.max(0, cap - (inst.modern[stat] || 0));
  }

  /* 合成素材值 n 的奖励值（参照 wiki：奖励值=(n+1)÷5+n，含 +4/+9/+14… 奖励点） */
  function gainReward(n) { return Math.floor((n + 1) / 5) + n; }
  /* 偏斜值（约一半）：((n+2)÷5+n)÷2 */
  function gainDeviation(n) { return Math.floor((Math.floor((n + 2) / 5) + n) / 2); }
  /* 奖励点（bonus）：素材合计每 +4/+9/+14/+19/+24 再 +1/+2/+3/+4/+5 */
  function bonusLevel(n) {
    if (n >= 24) return 5; if (n >= 19) return 4; if (n >= 14) return 3;
    if (n >= 9) return 2; if (n >= 4) return 1; return 0;
  }

  /* 可改修信息（目标舰剩余可改修属性） */
  function modernizeInfo(uid) {
    const G = GameRef();
    const s = G.state.ships[uid];
    if (!s) return null;
    const gains = {};
    for (const n of MOD_STATS.concat(DE_STATS)) {
      const cap = modernCap(uid, n);
      if (cap > 0) gains[n] = cap;
    }
    return { gains, cost: { fuel: 30, ammo: 30 } };
  }

  /* 合成预览：素材合计 → 各属性"显示的上升量"（奖励值）与偏斜值 */
  function modernizePreview(targetUid, matUids) {
    const G = GameRef();
    const st = G.state;
    const t = st.ships[targetUid];
    if (!t) return { ok: false, msg: '目标舰不存在' };
    const mats = (matUids || []).slice(0, 5);
    if (!mats.length) return { ok: false, msg: '未选择素材舰' };
    for (const muid of mats) {
      const m = st.ships[muid];
      if (!m) return { ok: false, msg: '素材舰不存在' };
      if (muid === targetUid) return { ok: false, msg: '不能以自己为素材' };
      if (m.locked) return { ok: false, msg: '素材舰已上锁' };
      if (st.repairs.some(r => r && r.ship === muid)) return { ok: false, msg: '入渠中的舰娘不能作为素材' };
    }
    if (st.resources.fuel < 30 || st.resources.ammo < 30) return { ok: false, msg: '资源不足！' };
    const sum = {};
    for (const muid of mats) {
      const vals = materialValue(muid);
      for (const k in vals) sum[k] = (sum[k] || 0) + vals[k];
    }
    const shown = {}, dev = {}, bonus = {};
    for (const k in sum) {
      const cap = modernCap(targetUid, k);
      if (cap <= 0) continue;              /* 已满的属性不显示（wiki：无提升属性时无法合成） */
      const n = sum[k];
      bonus[k] = bonusLevel(n);
      shown[k] = Math.min(cap, gainReward(n));
      dev[k] = Math.min(cap, gainDeviation(n));
    }
    if (!Object.keys(shown).length) return { ok: false, msg: '目标舰已满改修' };
    return { ok: true, mats, sum, shown, dev, bonus, cost: { fuel: 30, ammo: 30 } };
  }

  /* 近代化改修（合成）：消耗最多5艘素材舰；每属性独立判定奖励(50%)/偏斜(50%) */
  function modernize(targetUid, matUids) {
    const G = GameRef();
    const st = G.state;
    const pv = modernizePreview(targetUid, matUids);
    if (!pv.ok) return pv;
    st.resources.fuel -= pv.cost.fuel;
    st.resources.ammo -= pv.cost.ammo;
    const t = st.ships[targetUid];
    const gains = {};
    for (const k in pv.shown) {
      const cap = modernCap(targetUid, k);
      let g = Util.chance(0.5) ? pv.shown[k] : pv.dev[k];
      g = Math.min(cap, g);
      if (g > 0) {
        t.modern[k] = Math.min(cap, (t.modern[k] || 0) + g);
        gains[k] = g;
      }
    }
    for (const muid of pv.mats) G.destroyShip(muid);
    st.stats.modernize++;
    notify('modernize', 1);
    return { ok: true, gains, sum: pv.sum, shown: pv.shown, dev: pv.dev };
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
    if (changed.includes('daily')) {
      /* 每日重置改修工厂次数 */
      st.improve = { date: dayKey, count: 0 };
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

  /* ============ 出击结果经验结算（参照wiki：基础=敌HP总和/2 × 评价×旗舰×MVP） ============ */
  const RANK_EXP = { S: 1.0, A: 1.0, B: 0.9, C: 0.8, D: 0.7, E: 0.5 };

  function applyBattleResult(fleetIdx, result, isPractice) {
    const G = GameRef();
    const st = G.state;
    const fleet = st.fleet[fleetIdx];
    const rank = result.rank || 'D';
    const rankMult = rank === 'S' ? (result.perfect ? 1.2 : 1.0) : (RANK_EXP[rank] || 0.5);
    let base;
    if (isPractice) {
      /* 演习：补正前经验 = 旗舰必要exp/100 + 第2舰必要exp/300（+0~3随机） */
      const ships = fleet.map(u => st.ships[u]).filter(Boolean);
      const lv1 = ships[0], lv2 = ships[1];
      let pre = (lv1 ? shipExpToLevel(lv1.lv) : 0) / 100 + (lv2 ? shipExpToLevel(lv2.lv) : 0) / 300;
      pre = Math.floor(pre) + Util.ri(0, 3);
      base = pre <= 500 ? pre : Math.floor(500 + Math.sqrt(pre - 500));
    } else {
      base = Math.floor((result.enemyHpTotal || 0) / 2);
    }
    const mySide = result.mySide;
    const gains = [];
    for (const f of fleet) {
      const s = st.ships[f];
      if (!s) continue;
      const side = mySide && mySide.find(x => x.uid === f);
      if (!side) continue;
      let exp = base;
      if (result.mvpUid && result.mvpUid === f) exp *= 2;
      if (rank !== 'E' && st.fleet[fleetIdx][0] === f) exp *= 1.5;  /* E评价旗舰加成无效 */
      exp = Math.floor(exp * rankMult);
      const ups = addShipExp(f, exp);
      gains.push({ uid: f, exp, ups });
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
    modernizeInfo, modernize, modernizePreview, materialValue, modernCap,
    gainReward, gainDeviation, bonusLevel,
    resetDue, resetQuests, initQuests, notify, canClaim, claimQuest,
    applyBattleResult, checkDynamic
  };
})();

if (typeof window !== 'undefined') window.Progression = Progression;
if (typeof module !== 'undefined' && module.exports) module.exports = { Progression };
