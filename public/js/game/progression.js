'use strict';
/* ============================================================
 * 养成与任务：等级/改造/近代化改修/任务追踪
 * ============================================================ */

const Progression = (() => {
  const GameRef = () => (typeof window !== 'undefined') ? window.Game : require('../core/state.js').Game;

  /* 等级上限188（参照舰娘百科经验表：2026/05/29更新后 185→188） */
  const MAX_LV = 188;
  const KAI_COST = { fuel: 200, ammo: 100, steel: 300, baux: 50 };

  /* ============ 经验（参照舰娘百科「舰娘升级所需经验值」Lv1~188 完整表） ============
   * EXP_NEED[lv] = 升到 lv 级所需经验（lv-1 → lv），Lv1=0
   * 本作无结婚系统：99→100 作为普通升级（14.85万），此后沿用 wiki 婚后表数值
   * （wiki 婚后表累计从 Lv100 重新计 0，此处顺延不归零，曲线斜率与 wiki 一致） */
  const EXP_NEED = (() => {
    const a = new Array(190).fill(0);
    for (let lv = 2; lv <= 51; lv++) a[lv] = 100 * (lv - 1);
    for (let lv = 52; lv <= 60; lv++) a[lv] = 100 * (2 * lv - 52);     /* 52:5200 … 60:6800 */
    for (let lv = 61; lv <= 70; lv++) a[lv] = 300 * lv - 11300;          /* 61:7000 … 70:9700 */
    for (let lv = 71; lv <= 80; lv++) a[lv] = 400 * lv - 18400;          /* 71:10000 … 80:13600 */
    for (let lv = 81; lv <= 90; lv++) a[lv] = 500 * lv - 26500;          /* 81:14000 … 90:18500 */
    a[91] = 19000; a[92] = 20000; a[93] = 22000; a[94] = 25000; a[95] = 30000;
    a[96] = 40000; a[97] = 60000; a[98] = 90000; a[99] = 148500;
    a[100] = 148500; a[101] = 10000; a[102] = 1000; a[103] = 2000; a[104] = 3000; a[105] = 4000;
    a[106] = 5000; a[107] = 6000; a[108] = 7000; a[109] = 8000; a[110] = 9000; a[111] = 10000;
    a[112] = 12000; a[113] = 14000; a[114] = 16000; a[115] = 18000; a[116] = 20000; a[117] = 23000;
    a[118] = 26000; a[119] = 29000; a[120] = 32000; a[121] = 35000; a[122] = 39000; a[123] = 43000;
    a[124] = 47000; a[125] = 51000; a[126] = 55000; a[127] = 59000; a[128] = 63000; a[129] = 67000;
    a[130] = 71000; a[131] = 75000; a[132] = 80000; a[133] = 85000; a[134] = 90000; a[135] = 95000;
    a[136] = 100000; a[137] = 105000; a[138] = 110000; a[139] = 115000; a[140] = 120000;
    a[141] = 127000; a[142] = 134000; a[143] = 141000; a[144] = 148000; a[145] = 155000;
    a[146] = 163000; a[147] = 171000; a[148] = 179000; a[149] = 187000; a[150] = 195000;
    a[151] = 204000; a[152] = 213000; a[153] = 222000; a[154] = 231000; a[155] = 240000; a[156] = 250000;
    a[157] = 60000; a[158] = 80000; a[159] = 110000; a[160] = 150000; a[161] = 200000; a[162] = 260000;
    a[163] = 330000; a[164] = 410000; a[165] = 500000;
    a[166] = 100000; a[167] = 113000; a[168] = 139000; a[169] = 178000; a[170] = 230000;
    a[171] = 295000; a[172] = 373000; a[173] = 457000; a[174] = 561000; a[175] = 684000;
    a[176] = 150000; a[177] = 200000; a[178] = 300000; a[179] = 500000; a[180] = 900000;
    a[181] = 200000; a[182] = 400000; a[183] = 600000; a[184] = 800000; a[185] = 1000000;
    a[186] = 1200000; a[187] = 1400000; a[188] = 1600000;
    return a;
  })();

  /* 从 lv 级升到 lv+1 所需经验（lv = 1..187）；上限等级返回 0 */
  function shipExpToLevel(lv) {
    if (lv < 1 || lv >= MAX_LV) return 0;
    return EXP_NEED[lv + 1];
  }
  /* 累计经验值（1级起，演习公式引用：wiki 演习经验=(旗舰累计/100+第二舰累计/300)） */
  function shipCumExp(lv) {
    if (lv <= 1) return 0;
    if (lv > MAX_LV) lv = MAX_LV;
    let sum = 0;
    for (let i = 2; i <= lv; i++) sum += EXP_NEED[i];
    return sum;
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
    /* 装备仓库上限检查（wiki：闲置装备数满时无法领取含装备奖励的任务；舰娘奖励自带装备直接装备在舰上不占仓库容量；测试模式豁免） */
    const needEq = (q.reward.equip ? q.reward.equip.length : 0);
    if (!G.isTestMode() && needEq > 0 && G.equipCapWouldExceed(needEq)) {
      return { ok: false, msg: `装备仓库已满（${G.equipIdleCount()}/${G.equipCap()}）！请先解体或用掉部分装备后再领取奖励。` };
    }
    st.quests[qid].claimed = true;
    const r = addQuestReward(st, q);
    /* 舰队解锁奖励（第三/第四舰队） */
    if (q.reward.unlockFleet) G.unlockFleet(q.reward.unlockFleet);
    /* 装备仓库扩充奖励 */
    if (q.reward.equipCap) G.expandEquipCap(q.reward.equipCap);
    const ships = r.ship ? r.ship.map(id => { const s = G.createShip(id, 1); G.equipDefaults(s.uid); return s; }) : [];
    const eqs = r.equip ? r.equip.map(id => G.createEquip(id)) : [];
    return { ok: true, q, ships, eqs };
  }

  /* ============ 出击结果经验结算 ============
   * 舰娘经验（参照wiki「舰娘经验值获得」）：
   *   基本经验 = 敌舰队总HP/2 × 评价倍率 × 旗舰1.5 × MVP2.0（E评价旗舰加成无效）
   *   评价倍率：完全胜利S x1.2 / 胜利S x1.0 / 胜利A x1.0 / 战术胜利B·败北C x0.8 / 败北D x0.7 / 败北E x0.5
   * 被击沉（HP=0）的舰娘不获得经验值
   */
  const RANK_EXP = { S: 1.0, A: 1.0, B: 0.8, C: 0.8, D: 0.7, E: 0.5 };
  /* 演习评价倍率（wiki「演习·评价补正表」）：演习败北倍率比出击更低 */
  const PRACTICE_RANK_EXP = { S: 1.2, A: 1.0, B: 1.0, C: 0.64, D: 0.56, E: 0.4 };

  function applyBattleResult(fleetIdx, result, isPractice) {
    const G = GameRef();
    const st = G.state;
    const fleet = st.fleet[fleetIdx];
    const rank = result.rank || 'D';
    const admOut = { exp: 0, up: false };
    let base;
    if (isPractice) {
      /* 演习（参照wiki「演习」）：
       * 补正前经验 = 敌方旗舰累计经验/100 + 敌方第二舰累计经验/300（+0~3随机）
       * 基本经验 = 补正前≤500 直接取；>500 则 500+√(补正前-500)
       * 提督经验 = 评价加成(20/0/0) + 等级差×20 + 40，取20的倍数，限 [20,160] */
      const en = result.enemySide || [];
      const lv1 = en[0] ? en[0].lv : 1, lv2 = en[1] ? en[1].lv : 1;
      let pre = shipCumExp(lv1) / 100 + shipCumExp(lv2) / 300;
      pre = Math.floor(pre) + Util.ri(0, 3);
      base = pre <= 500 ? pre : Math.floor(500 + Math.sqrt(pre - 500));
      const oppLv = en.reduce((m, s) => Math.max(m, s.lv || 0), 1);
      const lvDiff = oppLv - st.admiral.level;
      const bonus = rank === 'S' ? 20 : 0;
      let adm = bonus + 20 * lvDiff + 40;
      adm = Util.clamp(Math.round(adm / 20) * 20, 20, 160);
      G.addAdmiralExp(adm);
      admOut.exp = adm;
    } else {
      base = Math.floor((result.enemyHpTotal || 0) / 2);
    }
    const rankMult = isPractice
      ? (PRACTICE_RANK_EXP[rank] || 0.4)
      : (rank === 'S' ? (result.perfect ? 1.2 : 1.0) : (RANK_EXP[rank] || 0.5));
    const mySide = result.mySide;
    const gains = [];
    for (const f of fleet) {
      const s = st.ships[f];
      if (!s) continue;
      const side = mySide && mySide.find(x => x.uid === f);
      if (!side) continue;
      if (side.hp <= 0) continue;                 /* 被击沉的舰娘无法获得经验值 */
      let exp = base;
      if (result.mvpUid && result.mvpUid === f) exp *= 2;
      if (rank !== 'E' && st.fleet[fleetIdx][0] === f) exp *= 1.5;  /* E评价旗舰加成无效 */
      exp = Math.floor(exp * rankMult);
      const ups = addShipExp(f, exp);
      if (ups) admOut.up = true;
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
    return { gains, adm: admOut };
  }

  /* 动态条件检查（编成规模/搭载飞机数），由主循环每秒调用 */
  function checkDynamic() {
    const G = GameRef();
    const st = G.state;
    const fleetCount = [1, 2, 3, 4].reduce((n, f) => n + (st.fleet[f] || []).length, 0);
    notify('fleet_size', fleetCount >= 4 ? 1 : 0, 4);
    let planes = 0;
    for (const f of [1, 2, 3, 4]) {
      for (const uid of st.fleet[f] || []) {
        const s = st.ships[uid];
        if (!s) continue;
        for (const euid of s.equipped) {
          const e = st.equipment[euid];
          if (e && EquipmentData[e.id] && [SLOT.FIGHTER, SLOT.ATTACKER, SLOT.BOMBER].includes(EquipmentData[e.id].slot)) planes++;
        }
      }
    }
    notify('plane_count', planes >= 8 ? 1 : 0, 8);
  }

  return {
    MAX_LV, shipExpToLevel, shipCumExp, addShipExp, remodelInfo, remodel,
    modernizeInfo, modernize, modernizePreview, materialValue, modernCap,
    gainReward, gainDeviation, bonusLevel,
    resetDue, resetQuests, initQuests, notify, canClaim, claimQuest,
    applyBattleResult, checkDynamic
  };
})();

if (typeof window !== 'undefined') window.Progression = Progression;
if (typeof module !== 'undefined' && module.exports) module.exports = { Progression };
