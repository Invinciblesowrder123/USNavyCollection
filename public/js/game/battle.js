'use strict';
/* ============================================================
 * 战斗引擎 v4 — 还原《舰队收藏》机制（参照舰娘百科 zh.kcwiki.cn「战斗」「航空战」「伤害计算」）
 * 流程: 阵型选择 → 索敌判定(33式索敌值/索敌机未归还/命中回避UP·DOWN) → 航空战(制空权/S1空战击坠/S2对空炮火/开幕空袭)
 *       → 先制对潜 → 开幕雷击 → 交战形态 → 第一轮炮击战(射程制·敌我交替·我方先手)
 *       → 第二轮炮击战(位置制) → 雷击战(双方·中破罚站) → 夜战(单轮·大破罚站)
 * 数值（wiki）: 阈值 昼战炮击220 / 昼战雷击180 / 夜战360 / 航空·对潜170
 *               S1 空战击坠按制空状态随机比例（双方）
 *               S2 对空炮火：每格攻击机由一名舰娘迎击（比例击坠+固定击坠，各50%），
 *                  我方+1保底，对空CI追加固定击坠；轮型阵对空补正1.6
 *               航空攻击：舰攻机种倍率随机0.8/1.5，舰爆1.0，命中70~80%不受疲劳阵型影响
 *               损伤状态补正：中破 炮击/夜战/对潜0.7、雷击0.8；大破 炮击/对潜0.4、雷击0
 *               弹药补正（阈值后，wiki）：残弹≥50%为1，<50% 为残弹率/50；残弹0%无法炮击
 * 损伤状态: 小破≤75% / 中破≤50% / 大破≤25%（参照wiki）
 * 防沉保护: 伤害≥当前HP → 扣当前HP的50%~80%（红脸僚舰扣至1）
 * 旗舰援护: 未满小破的僚舰可随机掩护旗舰（轮型最高）
 * ============================================================ */

const Battle = (() => {
  const Util = (typeof window !== 'undefined') ? window.Util : require('../core/utils.js').Util;
  const GameRef = () => (typeof window !== 'undefined') ? window.Game : require('../core/state.js').Game;

  const ENGAGEMENT = { PARALLEL: '同航战', REVERSE: '反航战', T_ADV: 'T字有利', T_DIS: 'T字不利' };
  const ENG_MOD = { PARALLEL: 1.0, REVERSE: 0.8, T_ADV: 1.2, T_DIS: 0.6 };
  /* ============ 交战形态权重表（方向五：侦察引导航向） ============
   * base  = wiki 原值 45/30/15/10（**改这里等于改全局手感**，非必要不动）
   * recon = 索敌成功且舰队携带舰侦时使用的偏移权重：
   *         单级效果、只把 5 个百分点从「T字不利」挪到「T字有利」、
   *         **不消灭 T 不利**（仍有 5%）、不引入失败惩罚。
   * 依据：纸面验证（`../design/方向五_纸面验证结论.md`）——对中等强度编队 S 胜率影响 +1.9~+2.8 个百分点。 */
  const ENG_WEIGHTS = {
    base: { PARALLEL: 45, REVERSE: 30, T_ADV: 15, T_DIS: 10 },
    recon: { PARALLEL: 45, REVERSE: 30, T_ADV: 20, T_DIS: 5 }
  };
  /* 交战形态权重选择：只依赖「索敌成功」与「舰队携带舰侦」两个玩家可见条件 */
  function engagementWeights(reconOk, hasReconPlane) {
    return (reconOk && hasReconPlane) ? ENG_WEIGHTS.recon : ENG_WEIGHTS.base;
  }

  /* 阵型补正（wiki：炮击/雷击/对潜/夜战/对空（舰队防空值）） */
  const FORMATIONS = {
    '单纵阵': { fp: 1.0, tp: 1.0, asw: 0.6, night: 1.0, aa: 1.0, name: '单纵阵' },
    '复纵阵': { fp: 0.8, tp: 0.8, asw: 0.8, night: 1.0, aa: 1.2, name: '复纵阵' },
    '轮形阵': { fp: 0.7, tp: 0.7, asw: 1.2, night: 1.0, aa: 1.6, name: '轮形阵' },
    '梯形阵': { fp: 0.75, tp: 0.6, asw: 1.1, night: 1.0, aa: 1.0, name: '梯形阵' },
    '单横阵': { fp: 0.6, tp: 0.6, asw: 1.3, night: 1.0, aa: 1.0, name: '单横阵' }
  };
  /* 旗舰援护率（wiki：轮型最高 > 复纵/梯形/单横 > 单纵最低） */
  const PROTECT_RATE = { '单纵阵': 0.05, '复纵阵': 0.12, '轮形阵': 0.25, '梯形阵': 0.15, '单横阵': 0.15 };
  /* 攻击力阈值（wiki现版本：昼战炮击220 / 昼战雷击180 / 夜战360 / 航空·对潜·支援170） */
  const THRESHOLD = { SHELL: 220, TORP: 180, NIGHT: 360, AIR: 170, ASW: 170 };
  /* S1 空战击坠比例（wiki：我方按制空状态，敌方 0%~上限） */
  const S1_MY = { LOST: [0.25, 0.5833], INF: [0.175, 0.4083], PAR: [0.125, 0.2917], SUP: [0.075, 0.175], SURE: [0.025, 0.0583] };
  const S1_EN = { LOST: [0, 0.10], INF: [0, 0.40], PAR: [0, 0.60], SUP: [0, 0.80], SURE: [0, 1.00] };

  /* A胜利击沉数要求（敌舰队规模 -> 击沉数），单舰无A */
  const A_SINKS = { 2: 1, 3: 2, 4: 2, 5: 3, 6: 4 };

  /* ============ 战斗对象 ============ */
  const STAT_NAMES = ['hp', 'fp', 'tp', 'aa', 'arm', 'evd', 'asw', 'los', 'lck'];

  function levelBonusVal(base, statName, lv) {
    if (statName === 'hp') return Math.floor(base * 0.15 * (lv - 1) / 98);
    return Math.floor(base * 0.55 * (lv - 1) / 98);
  }

  function buildCombatShip(cfg) {
    const { def, lv, equipIds, supply, fuel, morale, isPlayer, uid } = cfg;
    const eqObjs = (equipIds || []).map(id => (id == null ? null : EquipmentData[id]));
    const slots = def.slots.map((s, i) => {
      const eq = eqObjs[i] || null;
      const planeLike = eq && (eq.slot === SLOT.FIGHTER || eq.slot === SLOT.ATTACKER || eq.slot === SLOT.BOMBER || eq.slot === SLOT.SEAPLANE);
      /* plane=是否搭载舰载机（含舰战/舰攻/舰爆/水侦）；planeAA=参与制空的机种（对空值>0） */
      return { size: (def.sizes ? def.sizes[i] : 24), eq, plane: planeLike, planeAA: planeLike ? (eq.stat.aa || 0) : 0 };
    });
    const countType = t => eqObjs.filter(e => e && e.slot === t).length;
    const hasType = t => countType(t) > 0;
    const eqStat = n => eqObjs.reduce((s, e) => s + ((e && e.stat && e.stat[n]) || 0), 0);
    const stats = {};
    STAT_NAMES.forEach((n, i) => {
      stats[n] = def.stats[i] + levelBonusVal(def.stats[i], n, lv) + eqStat(n);
    });
    stats.hpMax = stats.hp;
    stats.hp = stats.hpMax;
    return {
      uid: uid || '', isPlayer, name: def.en, zh: def.zh, type: def.type, boss: !!cfg.boss,
      stats, lv, morale, ammo: supply === undefined ? 1 : supply,
      fuel: fuel === undefined ? 1 : fuel,
      equipped: eqObjs, slots,
      range: hasType(SLOT.BIG_GUN) ? 3 : (hasType(SLOT.MED_GUN) ? 2 : 1),
      mainGuns: countType(SLOT.SMALL_GUN) + countType(SLOT.MED_GUN) + countType(SLOT.BIG_GUN),
      secondaries: countType(SLOT.SECONDARY),
      apShell: eqObjs.some(e => e && e.id === 'ap_mk8'),
      radar: hasType(SLOT.RADAR),
      hasSeaplane: hasType(SLOT.SEAPLANE) && slots.some(s => s.eq && s.eq.slot === SLOT.SEAPLANE && s.size > 0),
      hasTorpedo: hasType(SLOT.TORPEDO),
      hasASW: stats.asw > 20 || hasType(SLOT.SONAR_DC),
      sonar: eqObjs.some(e => e && e.cat === '声呐'),
      dc: eqObjs.some(e => e && e.cat === '爆雷'),
      aaCI: (countType(SLOT.HAA) >= 2) || (countType(SLOT.HAA) >= 1 && countType(SLOT.RADAR) >= 1) || (countType(SLOT.HAA) >= 1 && countType(SLOT.MG) >= 1),
      searchlight: eqObjs.some(e => e && e.id === 'searchlight'),
      /* 消耗性物资/夜战装备/防雷鼓包（出击时消耗或提供被动效果） */
      dcTeam: eqObjs.some(e => e && e.id === 'dc_team'),
      rations: eqObjs.some(e => e && e.id === 'rations'),
      lookout: eqObjs.some(e => e && e.id === 'lookout'),
      illuminator: eqObjs.some(e => e && e.id === 'star_mk9'),
      torpBelt: eqObjs.some(e => e && (e.id === 'bulge_m' || e.id === 'bulge_l')),
      reconPlane: eqObjs.some(e => e && e.cat === '舰侦'),   // 舰侦（侦察飞行队）：索敌成功后引导航向
      speed: shipSpeed(def),
      alive: stats.hp > 0, hp: stats.hp, dealt: 0
    };
  }

  function makePlayerShip(uid) {
    const G = GameRef();
    const st = G.state;
    const inst = st.ships[uid];
    const def = G.shipDef(inst);
    const stats = G.shipStats(uid);
    /* 装备按槽位对齐（空槽保留 null，避免位移错位） */
    const equipIds = [];
    for (let i = 0; i < def.slots.length; i++) {
      const euid = inst.equipped[i];
      equipIds.push(euid && st.equipment[euid] ? st.equipment[euid].id : null);
    }
    const ship = buildCombatShip({
      def, lv: inst.lv,
      equipIds,
      supply: inst.supply.ammo, fuel: inst.supply.fuel, morale: inst.morale, isPlayer: true, uid
    });
    ship.stats = { hp: stats.hp, hpMax: stats.hpMax, fp: stats.fp, tp: stats.tp, aa: stats.aa, arm: stats.arm, evd: stats.evd, asw: stats.asw, los: stats.los, lck: stats.lck };
    ship.hp = stats.hp;
    ship.alive = stats.hp > 0;
    return ship;
  }

  /* 演习对手（真实舰船数据） */
  function makeRosterShip(roster, idx) {
    const def = roster.id === 'boss' ? ShipData[Object.keys(ShipData)[0]] : ShipData[roster.id];
    if (!def) return null;
    const kai = roster.kai || 0;
    let d = def;
    if (kai >= 1 && d.kai) d = { ...d, ...d.kai };
    if (kai >= 2 && d.kai2) d = { ...d, ...d.kai2 };
    const ship = buildCombatShip({
      def: d, lv: roster.lv || 1, kai,
      equipIds: d.equip || [], supply: 1, fuel: 1, morale: 50,
      isPlayer: false, uid: 'p' + idx
    });
    ship.key = roster.id;
    return ship;
  }

  function makeEnemyShip(key, idx) {
    const tpl = DEEP_TEMPLATES[key];
    const st = tpl.stats.slice();
    const slots = (tpl.slots || []).map(s => ({ size: s.planes, plane: s.planes > 0, planeAA: s.aa, eq: null }));
    return {
      uid: 'e' + idx, key, isPlayer: false, name: tpl.name, zh: tpl.name, type: tpl.type, boss: !!tpl.boss,
      stats: { hp: st[0], hpMax: st[0], fp: st[1], tp: st[2], aa: st[3], arm: st[4], evd: st[5], asw: st[6], los: st[7], lck: st[8] },
      lv: 1, morale: 40, ammo: 1, fuel: 1, equipped: [], slots,
      /* 射程（wiki）：深海BB长、CA中、DD/CL短、深海空母超短（第一轮最后行动） */
      range: tpl.type === 'BB' ? 3 : (tpl.type === 'CA' ? 2 : (tpl.type === 'CV' || tpl.type === 'CVL' ? 0 : 1)),
      mainGuns: tpl.type === 'BB' || tpl.type === 'CA' ? 2 : 0,
      secondaries: 0, apShell: false, radar: false,
      hasSeaplane: false, hasTorpedo: tpl.type === 'DD' || tpl.type === 'CL' || tpl.type === 'SS',
      hasASW: false, sonar: false, dc: false, aaCI: false, searchlight: false,
      dcTeam: false, rations: false, lookout: false, illuminator: false, torpBelt: false,
      speed: 'fast',
      alive: st[0] > 0, hp: st[0], dealt: 0
    };
  }

  const isSub = s => s.type === 'SS' || s.type === 'SSV';
  const isCV = s => s.type === 'CV' || s.type === 'CVL' || s.type === 'CVB';
  const isTorpType = s => ['DD', 'CL', 'CLT', 'CA', 'CAV', 'SS'].includes(s.type);

  /* ============ 航空战力判定（航空战点 mode:'air' 的唯一判据） ============
   * 「有航空战力」= 存在存活的空母系（CV/CVL/CVB）且至少一个搭载格有实际舰载机（size>0 且 plane）。
   * 与引擎内的 markLaunch（放飞机）判据同源，因此三种「无航母」边界被自然区分（坑 #12）：
   *   ① 完全没有航母            → 无航空战力 → 被动防空
   *   ② 有航母但未搭载舰载机（空槽）→ 无航空战力 → 被动防空（但归因文案与 ① 不同）
   *   ③ 有航母但没带舰战（只带舰攻）→ 有航空战力 → 走正常航空战，只是打不赢（不进被动防空） */
  const hasCarrier = s => s.alive && (s.type === 'CV' || s.type === 'CVL' || s.type === 'CVB');
  function hasAirWing(side) {
    return side.some(s => hasCarrier(s) && s.slots.some(sl => sl.size > 0 && sl.plane));
  }
  /* 被动防空：敌机轰炸的伤害封顶比例（单次不超过目标耐久上限的 60%，与潜艇点一致 —— P0-2 不做硬死档） */
  const PASSIVE_AA_CAP = 0.6;

  /* ============ 损伤状态（wiki: 小破75% / 中破50% / 大破25%） ============ */
  const dmgState = s => {
    const r = s.hp / s.stats.hpMax;
    return r <= 0.25 ? 'da' : r <= 0.5 ? 'mid' : 'ok';
  };
  const isDaPo = s => s.hp > 0 && dmgState(s) === 'da';
  /* 损伤状态补正（wiki：中破 炮击/夜战/对潜0.7、雷击0.8；大破 炮击/对潜0.4、雷击0） */
  const dmgMult = (s, type) => {
    const st = dmgState(s);
    if (st === 'da') return type === 'torp' ? 0 : 0.4;
    if (st === 'mid') return type === 'torp' ? 0.8 : 0.7;
    return 1;
  };
  /* 弹药补正（wiki：残弹率≥50%→1，<50%→残弹率/50；弹药补正为阈值后补正，作用于最终伤害）
   * 残弹=0 时炮击战无法攻击（弹药耗尽）；夜战弹药按战斗开始时残弹计算 */
  const ammoBonus = s => s.ammo >= 0.5 ? 1 : Math.max(0, s.ammo * 2);

  /* ============ 制空值与制空状态 ============ */
  function airPower(side) {
    let sum = 0;
    for (const s of side) {
      if (!s.alive) continue;
      for (const sl of s.slots) {
        if (sl.planeAA > 0 && sl.size > 0) sum += Math.floor(sl.planeAA * Math.sqrt(sl.size));
      }
    }
    return sum;
  }

  function airState(my, en) {
    if (my === 0 && en === 0) return { key: 'PAR', label: '航空均势（无航空战）', air: false };
    if (en === 0 && my > 0) return { key: 'SURE', label: '制空权确保', air: true };
    const r = my / en;
    if (r < 1 / 3) return { key: 'LOST', label: '制空权丧失', air: true };
    if (r < 2 / 3) return { key: 'INF', label: '航空劣势', air: true };
    if (r < 3 / 2) return { key: 'PAR', label: '航空均势', air: true };
    if (r < 3) return { key: 'SUP', label: '航空优势', air: true };
    return { key: 'SURE', label: '制空权确保', air: true };
  }

  /* ============ 航空触接（设计稿 §4，数值已由用户确认） ============
   * 时机：昼战航空战阶段结束后、炮击战开始前。
   * 参与方：我方搭载**舰攻 / 水侦（含水爆）/ 舰侦**的舰（航母为主，水上侦相机可）。
   *   注：本作舰攻没有索敌面板（stat.los 为空），按设计稿「舰攻/侦察机索敌值」的语义取
   *   `stat.los || stat.avg`（缺省用攻击力代理）——数值量级与舰侦/水侦的索敌值同档（4~9），不会失衡。
   * 成功率 = min(85%, Σ√(机载值) × 5% + 制空加成)；制空确保 +20% / 优势 +10% / 均势·劣势 +0 / **丧失不可触接**。
   * 效果：我方炮击/雷击命中 ×1.15（不分级）。
   * 敌方：对称机制，成功率固定 20%（我方制空丧失时亦无法阻止），敌命中 ×1.10。
   * 消耗：无（克制版，不扣搭载数）。不做：触接等级分档 / 机种细分 / 失败惩罚。
   *
   * **坑 #10（本项目最容易悄悄改坏难度的地方）**：触接命中加成走**独立字段 `_touchHit`**，
   * 在 `hitChance()` 内与索敌加成的 `_reconHit` **相乘**，绝不覆盖——否则会隐性削弱索敌机制。
   * 实际倍率：触接成功且索敌成功 = 1.03 × 1.15 = **1.1845（+18.45%）**。 */
  const TOUCH_MAX = 0.85;                                  // 成功率上限
  const TOUCH_AIR_BONUS = { SURE: 0.20, SUP: 0.10, PAR: 0, INF: 0, LOST: null };  // null = 不可触接
  const TOUCH_MY_HIT = 1.15;                               // 我方触接命中倍率（+15%）
  const TOUCH_EN_RATE = 0.20;                              // 敌方触接固定成功率
  const TOUCH_EN_HIT = 1.10;                               // 敌方触接命中倍率（+10%）
  /* 参与触接的机种：舰攻 / 水侦（水爆同槽）/ 舰侦。舰爆、舰战不参与（与设计稿一致） */
  const isTouchPlane = e => !!e && (e.slot === SLOT.ATTACKER || e.slot === SLOT.SEAPLANE || e.cat === '舰侦');
  const touchPlaneValue = e => {
    if (!e || !e.stat) return 0;
    const v = e.stat.los || e.stat.avg || 0;
    return v > 0 ? Math.sqrt(v) : 0;
  };
  /* 触接成功率：airKey 为制空状态（SURE/SUP/PAR/INF/LOST）；LOST 或未发生航空战（null）→ 0 */
  function touchRate(side, airKey) {
    if (!airKey) return 0;
    const bonus = TOUCH_AIR_BONUS[airKey];
    if (bonus == null) return 0;
    let sum = 0;
    for (const s of side) {
      if (!s.alive || !s.slots) continue;
      for (const sl of s.slots) {
        if (sl.size <= 0 || !isTouchPlane(sl.eq)) continue;
        sum += touchPlaneValue(sl.eq);
      }
    }
    /* 一架触接机都没有 → 成功率 0（制空加成不是「无飞机也能触接」的许可，只影响有飞机时的概率） */
    if (sum <= 0) return 0;
    return Util.clamp(Math.min(TOUCH_MAX, sum * 0.05 + bonus), 0, TOUCH_MAX);
  }
  /* 触接可发动性报告（出击前情报室用；与战斗内判定同源，UI 不得另算） */
  function touchReport(fleetIdx) {
    const ships = playerShipsOf(fleetIdx);
    let sum = 0;
    const names = [];
    for (const s of ships) {
      if (!s.alive || !s.slots) continue;
      for (const sl of s.slots) {
        if (sl.size <= 0 || !isTouchPlane(sl.eq)) continue;
        sum += touchPlaneValue(sl.eq);
        names.push(sl.eq.zh || sl.eq.id);
      }
    }
    return {
      planes: names.length,
      planeNames: [...new Set(names)],
      base: Math.round(sum * 0.05 * 1000) / 1000,
      rateSure: touchRate(ships, 'SURE'),
      rateSup: touchRate(ships, 'SUP'),
      ratePar: touchRate(ships, 'PAR'),
      rateLost: touchRate(ships, 'LOST'),
      hitBonus: TOUCH_MY_HIT,
      enRate: TOUCH_EN_RATE,
      enHitBonus: TOUCH_EN_HIT,
      cap: TOUCH_MAX
    };
  }

  function threshold(ap, cap) { return ap > cap ? cap + Math.sqrt(ap - cap) : ap; }

  /* 装甲随机浮动（0.7 ~ 4/3 倍） */
  const armorRoll = arm => arm * Util.rf(0.7, 4 / 3);

  function calcDamage(ap, arm, crit) {
    let dmg = ap - armorRoll(arm);
    if (dmg <= 0) return 0;
    if (Math.random() < crit) dmg *= 1.5;
    dmg *= Util.rf(0.7, 1.3);
    return Math.max(1, Math.floor(dmg));
  }

  /* ============ 士气档位与战斗修正（唯一来源，UI 不得硬编码系数） ============
   * 4 档：闪 ≥50 / 正常 40–49 / 偏低 30–39 / 红脸 <30
   *   闪   ：命中 ×1.2、回避 ×1.8（wiki）
   *   红脸 ：命中 ×0.5（无回避惩罚，wiki）
   *   偏低 ：**没有战斗惩罚**，是预警档——出击结算 −15，30–39 的舰再打一场就会掉进红脸。
   * 母港静置恢复：每 tick +3 至 49；49~52 直接跳到 53（即「歇一会儿就自动到闪」，state.js regen）。 */
  const MORALE_TIERS = [
    { key: 'flash', name: '闪', min: 50, hit: 1.2, evd: 1.8, desc: '命中 ×1.2 / 回避 ×1.8' },
    { key: 'normal', name: '正常', min: 40, hit: 1.0, evd: 1.0, desc: '无修正' },
    { key: 'low', name: '偏低', min: 30, hit: 1.0, evd: 1.0, desc: '无修正（再出击一场将跌入红脸）' },
    { key: 'red', name: '红脸', min: 0, hit: 0.5, evd: 1.0, desc: '命中 ×0.5' }
  ];
  function moraleTier(morale) {
    const m = Number(morale);
    if (!isFinite(m)) return MORALE_TIERS[1];          // 未定义士气按「正常」显示（不施加修正）
    for (const t of MORALE_TIERS) if (m >= t.min) return t;
    return MORALE_TIERS[MORALE_TIERS.length - 1];
  }
  /* 战斗修正系数（hitChance 读这张表；改档位只改这里） */
  function moraleMods(morale) {
    const m = Number(morale);
    if (!isFinite(m)) return { hit: 1, evd: 1 };
    const t = moraleTier(m);
    return { hit: t.hit, evd: t.evd };
  }
  /* 徽记文案：必须带具体修正数值（规范 Gate 3：重要状态不能只依赖颜色）；「正常」档不显示 */
  function moraleBadge(morale) {
    const t = moraleTier(morale);
    if (t.key === 'normal') return '';
    const parts = [];
    if (t.hit !== 1) parts.push('命中×' + t.hit);
    if (t.evd !== 1) parts.push('回避×' + t.evd);
    return parts.length ? `${t.name}·${parts.join('/')}` : t.name;
  }

  /* ============ 命中推定（wiki推定式） ============ */
  /* 命中乘区（索敌 × 航空触接）——单独抽成纯函数，便于断言「触接没有覆盖索敌」（坑 #10）。
   * 两个字段都缺省取 1：`x * 1` 在 IEEE754 下精确，因此未启用这两项时逐位不变。 */
  function hitMods(atk) {
    const recon = (atk && atk._reconHit) || 1;
    const touch = (atk && atk._touchHit) || 1;
    return { recon, touch, total: recon * touch };
  }
  function hitChance(atk, def, formAName, formBName, engMult, isTorpedo) {
    const lvT = Math.sqrt(Math.max(0, atk.lv - 1)) / 50;
    const luckT = 0.15 * (atk.stats.lck || 0) / 100;
    const eqHit = (atk.equipped || []).reduce((s, e) => s + (e && e.stat && e.stat.hit ? e.stat.hit : 0), 0) / 100;
    const moraleA = moraleMods(atk.morale).hit;   // 闪 ×1.2 / 红脸 ×0.5（同源自 MORALE_TIERS）
    /* 阵型命中补正：复纵/单横/梯形攻击方×1.2（复纵vs单横、梯形vs单纵除外） */
    let formAcc = 1;
    if ((formAName === '复纵阵' || formAName === '单横阵' || formAName === '梯形阵') &&
      !(formAName === '复纵阵' && formBName === '单横阵') &&
      !(formAName === '梯形阵' && formBName === '单纵阵')) formAcc = 1.2;
    /* 命中乘区 = 索敌加成（×1.03） × 航空触接加成（×1.15）——独立字段相乘，绝不互相覆盖（坑 #10） */
    const acc = 0.07 + (0.93 + lvT + luckT + eqHit) * formAcc * moraleA * hitMods(atk).total;
    /* 回避项 */
    let evd = def.stats.evd;
    if (formBName === '单横阵' || formBName === '梯形阵' || formBName === '轮形阵') evd *= 1.2;
    const defMorale = moraleMods(def.morale).evd;  // 闪 回避×1.8（红脸无回避惩罚）
    if (defMorale !== 1) evd *= defMorale;
    evd *= (def._reconEvd || 1);                 // 索敌成功回避UP / 失败回避DOWN（wiki：效果甚微）
    let eva = 0.03 + (evd <= 40 ? evd / 80 : evd / (evd + 40));
    /* 残余燃料<80% 被弹率上升 */
    if (def.fuel !== undefined) {
      if (def.fuel < 0.2) eva *= 0.40;
      else if (def.fuel < 0.4) eva *= 0.52;
      else if (def.fuel < 0.6) eva *= 0.68;
      else if (def.fuel < 0.8) eva *= 0.84;
    }
    let ch = acc - eva;
    if (isTorpedo) ch *= (engMult || 1);         // 交战形态影响雷击命中
    return Util.clamp(ch, 0.03, 0.97);
  }
  const critChance = hit => 0.25 * hit / (hit + 1) + 0.0125;

  function pickTarget(enemies, atk) {
    const alive = enemies.filter(t => t.alive);
    if (!alive.length) return null;
    const nonSub = alive.filter(t => !isSub(t));
    if (nonSub.length) return Util.pick(nonSub);
    return Util.pick(alive);
  }

  /* ============ 潜艇点（mode:'sub'）：潜艇雷击的速力打击修正 ============
   * 潜艇优先猎杀低速大目标；驱逐/轻巡灵活机动且反潜威胁大，难以被命中。
   * 修正只作用于敌方潜艇的雷击（开幕雷击 + 雷击战），不影响水面舰炮战。 */
  const SUB_SLOW_HIT = 1.2, SUB_SLOW_DMG = 1.3;    // 低速 BB/CV·CVE：大而慢，理想靶子
  const SUB_ESCORT_HIT = 0.7, SUB_ESCORT_DMG = 0.6; // DD/CL/DE：灵活+反潜压制
  const SUB_MID_HIT = 0.9, SUB_MID_DMG = 0.9;       // CA 等中间地带
  function subAttackMod(t) {
    const ty = t.type;
    if (ty === 'DD' || ty === 'CL' || ty === 'DE') return { hit: SUB_ESCORT_HIT, dmg: SUB_ESCORT_DMG };
    if (ty === 'BB' || ty === 'CV' || ty === 'CVB' || ty === 'CVL' || ty === 'CVE' || ty === 'AV')
      return t.speed === 'slow' ? { hit: SUB_SLOW_HIT, dmg: SUB_SLOW_DMG } : { hit: 1, dmg: 1 };
    return { hit: SUB_MID_HIT, dmg: SUB_MID_DMG };
  }
  /* 潜艇目标选择：低速舰权重 ×2（主动寻找大慢靶）；优先水面舰 */
  function pickSubTarget(side) {
    const alive = side.filter(t => t.alive && !isSub(t));
    if (!alive.length) return pickTarget(side, null);
    const w = {};
    alive.forEach((t, i) => { w[i] = (t.speed === 'slow' && (t.type === 'BB' || t.type === 'CV' || t.type === 'CVB' || t.type === 'CVL' || t.type === 'CVE')) ? 2 : 1; });
    return alive[+Util.weighted(w)];
  }
  /* 潜艇雷击伤害封顶：单次不超过目标耐久上限 60%（进点即大破的保底） */
  const SUB_DMG_CAP = 0.6;
  const capSubDmg = (dmg, t) => Math.min(dmg, Math.floor(t.stats.hpMax * SUB_DMG_CAP));

  /* ============ 对潜 / 空母系攻击力（wiki公式） ============ */
  const eqAsw = s => (s.equipped || []).reduce((sum, e) => sum + (e && e.stat && e.stat.asw ? e.stat.asw : 0), 0);
  /* 对潜攻击力 = √(素对潜)×2 + 装备对潜×1.5 + 攻击类型补正（爆雷13/航空机8），声呐+爆雷套装×1.15 */
  const aswPower = s => {
    const base = Math.max(0, s.stats.asw - eqAsw(s));
    let p = Math.sqrt(base) * 2 + eqAsw(s) * 1.5 + (s.dc ? 13 : 8);
    if (s.sonar && s.dc) p *= 1.15;
    return p;
  };
  /* 空母系昼战航空攻击：{(火力+雷装+【爆装×1.3】)×1.5}+55（wiki；搭载0也计入面板总和） */
  const cvAirPower = s => {
    let bmbSum = 0;
    for (const eq of s.equipped) {
      if (!eq) continue;
      if (eq.slot === SLOT.BOMBER) bmbSum += eq.stat.bmb || 0;
    }
    return ((s.stats.fp + s.stats.tp + Math.floor(bmbSum * 1.3)) * 1.5) + 55;
  };
  const enCVAirPower = s => 20 + s.slots.reduce((sum, sl) => sum + (sl.size > 0 ? sl.planeAA * 3 : 0), 0);
  /* 空母能否在炮击战攻击：存在搭载>0的攻击机（舰攻/舰爆） */
  const canAirAttack = s => s.slots.some(sl => sl.size > 0 && sl.plane &&
    (s.isPlayer ? (sl.eq && (sl.eq.slot === SLOT.ATTACKER || sl.eq.slot === SLOT.BOMBER)) : true));
  /* 先制对潜条件（wiki：DD/CL/雷巡/补给 对潜100+声呐；海防 60+声呐 或 75+装备对潜4；轻母 50+声呐+对潜7以上攻击机）
   * 注：本作面板对潜约为舰C的6成（满级对潜≈50~60），阈值按0.6缩放以保持机制可用 */
  const canOpeningASW = s => {
    if (!s.alive) return false;
    const asw = s.stats.asw;
    if (s.type === 'DD' || s.type === 'CL' || s.type === 'CLT' || s.type === 'AS') return asw >= 60 && s.sonar;
    if (s.type === 'DE') return (asw >= 40 && s.sonar) || (asw >= 50 && eqAsw(s) >= 2);
    if (s.type === 'CVL') return asw >= 30 && s.sonar && s.slots.some(sl => sl.size > 0 && sl.eq && (sl.eq.stat.asw || 0) >= 4 &&
      (sl.eq.slot === SLOT.ATTACKER || sl.eq.slot === SLOT.SEAPLANE));
    return false;
  };

  /* ============ 防沉保护与旗舰援护 ============ */
  /* 防沉保护：伤害≥当前HP时，只扣取整[当前HP×0.5 + rand(0~当前HP-1)×0.3]（红脸僚舰扣至1） */
  function protectedDamage(hp) {
    return Math.max(1, Math.floor(hp * 0.5 + Util.ri(0, Math.max(0, hp - 1)) * 0.3));
  }

  function dealDamage(log, atk, def, dmg, prefix, extra, quiet, isTorpedo) {
    if (dmg <= 0) { if (!quiet) log.push(`${prefix}${atk.name}${extra || ''}攻击 ${def.name}，被装甲完全弹开！`); return; }
    /* 增设防雷鼓包：受到雷击伤害 -20%（wiki：防雷鼓包防鱼雷） */
    if (isTorpedo && def.torpBelt) dmg = Math.max(1, Math.floor(dmg * 0.8));
    atk.dealt += dmg;
    if (def.isPlayer && dmg >= def.hp) {
      if (def.dcTeam && !def.dcUsed) {
        /* 应急修理要员：沉没前一瞬发动，耐久完全恢复（出击后消耗） */
        def.dcUsed = true;
        def.hp = def.stats.hpMax;
        log.push(`${prefix}${atk.name}${extra || ''}攻击 ${def.name}，命中！「${def.name}」发动应急修理要员，耐久完全恢复！`);
        return;
      }
      /* 我方舰娘防沉保护（旗舰/非红脸僚舰扣50%~80%；红脸僚舰扣至1） */
      const newHp = (!def.isFlag && (def.morale || 0) < 20) ? 1 : protectedDamage(def.hp);
      def.hp = Math.max(1, newHp);
      log.push(`${prefix}${atk.name}${extra || ''}攻击 ${def.name}，命中！造成巨大伤害！「${def.name}」大破！（防沉保护）`);
    } else {
      def.hp -= dmg;
      if (!quiet) log.push(`${prefix}${atk.name}${extra || ''}攻击 ${def.name}，命中！造成 ${dmg} 伤害。`);
      if (def.hp <= 0 && def.alive) { def.alive = false; log.push(`${def.name} 被击沉了！`); }
    }
  }

  /* 旗舰援护（wiki：未满小破的僚舰可掩护旗舰，轮型阵概率最高） */
  function findProtector(side, formName) {
    if (!side || !side.length) return null;
    if (!Util.chance(PROTECT_RATE[formName] || 0)) return null;
    const escorts = side.filter((x, i) => i > 0 && x.alive && x.hp / x.stats.hpMax > 0.75);
    if (!escorts.length) return null;
    return Util.pick(escorts);
  }

  /* 统一的伤害入口：先判定旗舰援护，再结算；quiet=仅静默常规命中行（批量空袭用） */
  function applyDamage(log, atk, def, dmg, prefix, extra, defSide, defForm, quiet, isTorpedo) {
    if (dmg > 0 && defSide && defSide.length && def === defSide[0]) {
      const prot = findProtector(defSide, defForm);
      if (prot) {
        log.push(`${prefix}${atk.name}${extra || ''}攻击旗舰 ${def.name}，僚舰「${prot.name}」挺身掩护！（旗舰援护）`);
        dealDamage(log, atk, prot, dmg, prefix, extra, quiet, isTorpedo);
        return;
      }
    }
    dealDamage(log, atk, def, dmg, prefix, extra, quiet, isTorpedo);
  }

  /* HP 快照（供 UI 演出） */
  function snapshot(sideA, sideB) {
    const mk = s => ({ n: s.name, hp: Math.max(0, s.hp), max: s.stats.hpMax, alive: s.alive });
    return { snap: { A: sideA.map(mk), B: sideB.map(mk) } };
  }

  /* 演出事件记录器（随日志顺序插入 {event} 对象，供 UI 播放动画；不影响字符串日志兼容）
   * 昼战与夜战（battleNight）共用同一套日志/事件，保证分段播放时索引连续 */
  function makeEventHelpers(log, sideA, sideB) {
    const sideOf = (arr, x) => (x == null ? null : arr.indexOf(x));
    const ev = (kind, atk, tgt, hit, dmg, special, sink) => {
      log.push({ event: {
        kind, hit: !!hit, dmg: dmg || 0, special: special || null, sink: !!sink,
        atkS: atk ? (sideOf(sideA, atk) >= 0 ? 'A' : 'B') : null,
        atkI: atk ? Math.max(sideOf(sideA, atk), sideOf(sideB, atk)) : -1,
        tgtS: tgt ? (sideOf(sideA, tgt) >= 0 ? 'A' : 'B') : null,
        tgtI: tgt ? Math.max(sideOf(sideA, tgt), sideOf(sideB, tgt)) : -1
      } });
    };
    /* 空袭批量演出事件：一次事件携带全部打击结果，UI 一次性演出 */
    const evAir = list => {
      if (!list.length) return;
      const map = x => ({
        hit: x.hit, dmg: x.dmg, sink: x.sink,
        atkS: x.s ? (sideOf(sideA, x.s) >= 0 ? 'A' : 'B') : null,
        atkI: x.s ? Math.max(sideOf(sideA, x.s), sideOf(sideB, x.s)) : -1,
        tgtS: x.t ? (sideOf(sideA, x.t) >= 0 ? 'A' : 'B') : null,
        tgtI: x.t ? Math.max(sideOf(sideA, x.t), sideOf(sideB, x.t)) : -1
      });
      const mapped = list.map(map);
      const first = mapped[0];
      log.push({ event: {
        kind: 'air', hit: list.some(x => x.hit),
        dmg: list.reduce((s, x) => s + x.dmg, 0),
        sink: list.some(x => x.sink), special: null,
        atkS: first.atkS, atkI: first.atkI, tgtS: null, tgtI: -1,
        strikes: mapped
      } });
    };
    /* 对空炮火批量演出事件：一次事件携带全部迎击弹幕，UI 并行演出 */
    const evFlak = (shots, totalPlanes) => {
      if (!shots.length) return;
      const map = x => ({
        dmg: x.down,
        atkS: sideOf(sideA, x.interceptor) >= 0 ? 'A' : 'B',
        atkI: Math.max(sideOf(sideA, x.interceptor), sideOf(sideB, x.interceptor)),
        tgtS: sideOf(sideA, x.a) >= 0 ? 'A' : 'B',
        tgtI: Math.max(sideOf(sideA, x.a), sideOf(sideB, x.a))
      });
      const mapped = shots.map(map);
      const first = mapped[0];
      log.push({ event: {
        kind: 'flak', hit: true, dmg: shots.reduce((s, x) => s + x.down, 0),
        special: null, sink: false, totalPlanes: totalPlanes || 0,
        atkS: first.atkS, atkI: first.atkI, tgtS: null, tgtI: -1,
        shots: mapped
      } });
    };
    const pushSnap = () => log.push(snapshot(sideA, sideB));
    return { ev, evAir, evFlak, pushSnap };
  }

  /* ============ 特殊攻击表（战斗判定与「出击前情报室」清单共用同一张表） ============
   * 规则不写死在 UI（规范 P2-2）：编成自检清单直接读本表，保证「可发动/为什么不能发动」
   * 与战斗中实际判定完全同源（禁止事项 6：UI 与机制不同步）。
   * 顺序即优先级；ok 为可发动条件，miss 给出未发动原因。 */
  function attackProfile(s) {
    const eq = (s.equipped || []).map(e => e && EquipmentData[e.id]).filter(Boolean);
    const count = t => eq.filter(e => e && e.slot === t).length;
    return {
      mg: s.mainGuns || 0,                    // 昼战：主炮数（buildCombatShip 结果）
      sec: s.secondaries || 0,                // 昼战：副炮数
      ap: !!s.apShell,
      radar: !!s.radar,
      seaplane: !!s.hasSeaplane,
      guns: count(SLOT.SMALL_GUN) + count(SLOT.MED_GUN) + count(SLOT.BIG_GUN),  // 夜战：主炮数（按装备实计）
      torps: count(SLOT.TORPEDO)
    };
  }
  /* 昼战特殊攻击（wiki：制空优势/确保 + 水侦；主主1.5、主弹1.3、主电1.2、主副1.1、连击1.2×2） */
  const DAY_SPECIALS = [
    { id: 'day_ci_main', name: '主炮Cut-in', mult: 1.5, n: 1, req: '主炮×2 + 穿甲弹',
      ok: c => c.mg >= 2 && c.ap,
      miss: c => (c.mg < 2 ? `主炮不足 2 门（当前 ${c.mg}）` : '缺穿甲弹') },
    { id: 'day_double', name: '昼战连击', mult: 1.2, n: 2, req: '主炮×2',
      ok: c => c.mg >= 2,
      miss: c => `主炮不足 2 门（当前 ${c.mg}）` },
    { id: 'day_ci_main_ap', name: '主弹Cut-in', mult: 1.3, n: 1, req: '主炮 + 副炮 + 穿甲弹',
      ok: c => c.mg >= 1 && c.sec >= 1 && c.ap,
      miss: c => (c.mg < 1 ? '无主炮' : c.sec < 1 ? '无副炮' : '缺穿甲弹') },
    { id: 'day_ci_main_radar', name: '主电Cut-in', mult: 1.2, n: 1, req: '主炮 + 副炮 + 电探',
      ok: c => c.mg >= 1 && c.sec >= 1 && c.radar,
      miss: c => (c.mg < 1 ? '无主炮' : c.sec < 1 ? '无副炮' : '缺电探') },
    { id: 'day_ci_main_sec', name: '主副Cut-in', mult: 1.1, n: 1, req: '主炮 + 副炮',
      ok: c => c.mg >= 1 && c.sec >= 1,
      miss: c => (c.mg < 1 ? '无主炮' : '无副炮') }
  ];
  /* 夜战特殊攻击（wiki：鱼雷CI 1.5×2 / 主鱼1.3×2 / 连击1.2×2） */
  const NIGHT_SPECIALS = [
    { id: 'night_torp_ci', name: '鱼雷Cut-in', mult: 1.5, n: 2, req: '鱼雷×2',
      ok: c => c.torps >= 2,
      miss: c => `鱼雷不足 2 具（当前 ${c.torps}）` },
    { id: 'night_gun_torp_ci', name: '主鱼Cut-in', mult: 1.3, n: 2, req: '主炮×1 + 鱼雷×1',
      ok: c => c.guns >= 1 && c.torps >= 1,
      miss: c => (c.guns < 1 ? '无主炮' : `鱼雷不足（当前 ${c.torps}）`) },
    { id: 'night_double', name: '夜战连击', mult: 1.2, n: 2, req: '主炮×2',
      ok: c => c.guns >= 2,
      miss: c => `主炮不足 2 门（当前 ${c.guns}）` }
  ];
  /* 昼战特殊攻击的公共前置：制空优势以上 + 携带水侦/水爆 + 未大破（wiki） */
  function dayAttackGate(s, airSup) {
    if (!airSup) return '制空不足（需航空优势及以上）';
    if (!s.hasSeaplane) return '未携带水侦/水爆';
    if (isDaPo(s)) return '大破无法发动';
    return null;
  }

  /* ============ 昼战特殊攻击判定（wiki：制空优势/确保+水侦；主主1.5、主弹1.3、主电1.2、主副1.1、连击1.2×2） ============ */
  function resolveDayAttack(s, airSup) {
    if (s.stats.fp <= 0 || !s.alive) return null;
    if (airSup && s.hasSeaplane && !isDaPo(s)) {
      const c = attackProfile(s);
      for (const a of DAY_SPECIALS) if (a.ok(c)) return { mult: a.mult, n: a.n, name: a.name };
    }
    return { mult: 1.0, n: 1, name: null };
  }

  /* ============ 夜战特殊攻击判定（wiki：鱼雷CI 1.5×2/主鱼1.3×2/连击1.2×2；中破CI率+15%；探照灯+10%） ============ */
  function resolveNightAttack(s) {
    if (!s.alive || isDaPo(s)) return null;
    if (s.stats.fp + s.stats.tp <= 0) return null;
    const c = attackProfile(s);
    let spec = null;
    for (const a of NIGHT_SPECIALS) if (a.ok(c)) { spec = { mult: a.mult, n: a.n, name: a.name }; break; }
    if (!spec) return { mult: 1.0, n: 1, name: null };
    let rate = 0.5 + (s.stats.lck || 0) * 0.005;
    if (s.searchlight) rate += 0.1;               // 探照灯提高夜战CI率
    if (s.lookout) rate += 0.05;                  // 熟练见张员：夜战CI率+5%
    if (s.illuminator) rate += 0.05;              // 照明弹：夜战CI率+5%
    if (dmgState(s) === 'mid') rate += 0.15;      // 中破CI率+15%
    return Util.chance(Math.min(rate, 0.95)) ? spec : { mult: 1.0, n: 1, name: null };
  }

  /* ============ S1 空战击坠（wiki：舰战/舰攻/舰爆/水爆参与，水侦不参与） ============ */
  function s1Shootdown(side, rate) {
    let total = 0;
    for (const s of side) {
      for (const sl of s.slots) {
        if (sl.size <= 0 || !sl.plane) continue;
        if (sl.eq && sl.eq.slot === SLOT.SEAPLANE) continue;
        const lost = Math.floor(sl.size * Util.rf(rate[0], rate[1]));
        sl.size = Math.max(0, sl.size - lost);
        total += lost;
      }
    }
    return total;
  }

  /* ============ S2 对空炮火迎击（wiki：每格攻击机由一名舰娘迎击；比例+固定击坠各50%；我方+1保底；对空CI追加固定击坠）
   * 击坠数不超过该格现有搭载；固定击坠倍率 0.15（低于原 0.25），使空袭机群在 S1/S2 后仍有存活；
   * 返回 { total, shots }，shots 供 UI 一次性批量演出防空弹幕 */
  function aaShootdown(attackers, defenders, isMySide, aaBonus, log) {
    let total = 0;
    let totalPlanes = 0;   // 被射击侧参与S2的攻击机总架数（供UI按比例演示坠机）
    const shots = [];
    for (const a of attackers) {
      if (!a.alive) continue;
      for (const sl of a.slots) {
        if (sl.size <= 0 || !sl.plane) continue;
        if (sl.eq && sl.eq.slot === SLOT.FIGHTER) continue;   // 舰战不参与S2
        totalPlanes += sl.size;
        const defs = defenders.filter(x => x.alive);
        if (!defs.length) return { total, shots, totalPlanes };
        const interceptor = Util.pick(defs);
        const wAA = interceptor.stats.aa * (interceptor._reconAA || 1);
        const fleetAA = defs.reduce((s, x) => s + x.stats.aa * (x._reconAA || 1), 0) * aaBonus;
        let down = 0;
        /* 比例击坠与固定击坠判定互相独立，成功率均约50% */
        if (Util.chance(0.5)) down += Math.floor(wAA * sl.size * 0.02 * 0.25);
        if (Util.chance(0.5)) down += Math.floor((wAA + fleetAA) * 0.15 * (isMySide ? 0.8 : 0.75));
        let ci = 0;
        if (isMySide && interceptor.aaCI && Util.chance(0.5)) {
          ci = Util.ri(4, 7);
          log.push(`「${interceptor.name}」发动对空Cut-in，追加击落 ${ci} 架敌机！`);
        }
        down += (isMySide ? 1 : 0) + ci;   // 我方对空迎击+1保底，敌方无保底
        down = Math.min(down, sl.size);    // 击坠不超过现有搭载
        sl.size -= down;
        if (down > 0) shots.push({ interceptor, a, down });
        total += down;
      }
    }
    return { total, shots, totalPlanes };
  }

  /* ============ 索敌判定（wiki「索敌」：2-5(33)式简化）
   * 索敌值 = 分歧点系数(1) × Σ[装备系数 × 装备索敌值] + Σ√(素索敌) - ⌈司令部等级×0.4⌉ + 2×(6-出击舰娘数)
   * 装备系数（wiki）：舰战/舰爆/电探/探照灯 0.6，舰攻 0.8，舰侦 1.0，水爆 1.1，水侦 1.2
   * 本作无舰侦/水爆机种，舰侦类并入水侦处理；装备索敌值取装备面板 los 值
   * 索敌结果（wiki 四种）：成功/失败 × (索敌机未归还/正常归还)；成功→「命中・回避力UP」，
   * 失败→「対空・回避力DOWN」（实际数值修正取很小，符合wiki「实际验证中并没有太大区别」）
   * 触发条件：带水侦/水爆或空母带舰载机→必定触发索敌；不带舰载机但索敌值够高（电探/练度）→低概率成功
   * 索敌失败 → 无法参加航空战（制空权自动丧失）；深海不会索敌失败 ============ */
  const RECON_COEF = {
    [SLOT.FIGHTER]: 0.6, [SLOT.ATTACKER]: 0.8, [SLOT.BOMBER]: 0.6,
    [SLOT.SEAPLANE]: 1.2, [SLOT.RADAR]: 0.6, [SLOT.EQUIP]: 0.6,
    [SLOT.TORPEDO]: 0.6, [SLOT.SONAR_DC]: 0.6
  };
  /* 素索敌 = 舰船总索敌 - 装备索敌之和（wiki：√作用于不考虑装备的索敌面板数值之和） */
  function baseLosOf(s) {
    const eqLos = (s.equipped || []).reduce((sum, e) => sum + (e && e.stat && e.stat.los ? e.stat.los : 0), 0);
    return Math.max(0, s.stats.los - eqLos);
  }
  /* 2-5(33)式索敌值（分歧点系数=1）；isPlayer 才扣司令部等级、加舰娘数补正 */
  function reconValue(side, isPlayer, hqLevel) {
    let eq = 0, baseSum = 0;
    for (const s of side) {
      if (!s.alive) continue;
      for (const e of (s.equipped || [])) {
        if (!e || !e.stat || !e.stat.los) continue;
        eq += e.stat.los * (RECON_COEF[e.slot] || 0.6);
      }
      baseSum += Math.sqrt(baseLosOf(s));
    }
    let v = eq + baseSum;
    if (isPlayer) v = v - Math.ceil((hqLevel || 1) * 0.4) + 2 * (6 - side.length);
    return Math.max(0, v);
  }
  /* 索敌判定：我方索敌值 vs 敌方索敌值 → 成功概率
   * 带航空战力（水侦/舰载机）必定触发索敌阶段；无航空战力则按索敌值给低概率成功（wiki） */
  function resolveRecon(sideA, sideB, hqLevel) {
    const myLos = reconValue(sideA, true, hqLevel);
    const enLos = reconValue(sideB, false, 1);
    const myAirRecon = sideA.some(s => s.alive && s.slots.some(sl => sl.size > 0 && sl.plane));
    let p;
    if (myAirRecon) {
      /* 有航空兵力：以索敌比值判定（占优则大概率成功） */
      p = Util.clamp(0.35 + (myLos - enLos) / Math.max(6, enLos) * 0.55, 0.15, 0.95);
    } else {
      /* 无航空兵力：索敌值够高（电探/练度）也有较低概率成功 */
      p = Util.clamp(myLos / 80 * 0.35, 0.05, 0.4);
    }
    return { ok: Math.random() < p, myLos, enLos };
  }
  /* 索敌机未归还（wiki：「部分索敌机未归还」减少任意格子内的索敌机，多为只用水侦/水爆索敌的情况）
   * 若某舰水侦/水爆全部损耗（搭载量为零），则无法发动昼战特殊攻击（弹着观测射击） */
  function reconPlaneLost(side) {
    const candidates = [];
    for (const s of side) {
      if (!s.alive) continue;
      for (let i = 0; i < s.slots.length; i++) {
        const sl = s.slots[i];
        if (sl.size > 0 && sl.plane && sl.eq && sl.eq.slot === SLOT.SEAPLANE) candidates.push({ s, sl });
      }
    }
    if (!candidates.length) return 0;
    const pick = Util.pick(candidates);
    const lost = Math.max(1, Math.floor(pick.sl.size * Util.rf(0.2, 0.5)));
    pick.sl.size = Math.max(0, pick.sl.size - lost);
    /* 水侦/水爆全损 → 昼战特殊攻击失效（弹着观测射击需水侦且搭载>0） */
    if (pick.s.hasSeaplane && !pick.s.slots.some(x => x.size > 0 && x.eq && x.eq.slot === SLOT.SEAPLANE)) {
      pick.s.hasSeaplane = false;
    }
    return lost;
  }

  /* ============ 开幕空袭（批量结算）：双方防空(S2)结算完毕后，一次性结算全部空袭伤害，
   * 命中行静默并汇总为一行，返回打击列表供 UI 一次性演出
   * capRatio（可选）：被轰炸方为玩家时，单次伤害不超过其耐久上限的该比例
   *                   —— 仅「航空战点·被动防空」分支传入（P0-2：不做硬死档） */
  function airStrike(log, attackers, defenders, sideLabel, defSide, defForm, capRatio) {
    const strikes = [];
    let hitN = 0, missN = 0, totalDmg = 0;
    for (const s of attackers) {
      if (!s.alive) continue;
      for (const sl of s.slots) {
        if (sl.size <= 0) continue;
        const isStriker = s.isPlayer
          ? (sl.eq && (sl.eq.slot === SLOT.ATTACKER || sl.eq.slot === SLOT.BOMBER))
          : sl.plane;
        if (!isStriker) continue;
        /* 空袭只能攻击水面舰（对潜需装备反潜机，本作暂无对应机种） */
        const targets = defenders.filter(t => t.alive && !isSub(t));
        if (!targets.length) continue;
        const t = Util.pick(targets);
        const r = { s, t, hit: false, dmg: 0, sink: false };
        if (Util.chance(0.75)) {
          let ap;
          if (s.isPlayer) {
            const isTorp = sl.eq.slot === SLOT.ATTACKER;
            const planeMult = isTorp ? (Util.chance(0.5) ? 1.5 : 0.8) : 1.0;
            const power = sl.eq.stat.bmb || sl.eq.stat.tp || 0;
            ap = planeMult * (power * Math.sqrt(sl.size) + 25);
          } else {
            ap = 20 + sl.planeAA * 3;
          }
          ap = threshold(ap, THRESHOLD.AIR);
          let dmg = calcDamage(ap, t.stats.arm, 0.1);
          if (capRatio && t.isPlayer) dmg = Math.min(dmg, Math.floor(t.stats.hpMax * capRatio));
          /* 空袭同样触发旗舰援护与防沉保护（wiki）；常规命中行静默，汇总输出 */
          const wasAlive = t.alive;
          applyDamage(log, s, t, dmg, `${sideLabel}空袭！`, ' 的机队轰炸', defSide, defForm, true);
          r.hit = true; r.dmg = dmg; r.sink = wasAlive && !t.alive;
          hitN++; totalDmg += dmg;
        } else {
          missN++;
        }
        strikes.push(r);
      }
    }
    if (strikes.length) {
      const line = hitN > 0
        ? `${sideLabel}空袭：${hitN} 次命中，共造成 ${totalDmg} 伤害。${missN ? `（${missN} 次未命中）` : ''}`
        : `${sideLabel}空袭：机群全部投弹未命中。`;
      /* 汇总行在事件之后由调用处 push（避免轰炸动画前的字符串等待造成滞空） */
      return { strikes, line };
    }
    return { strikes: [], line: null };
  }

  /* ============ 夜战（wiki：昼战结束后由玩家选择「夜战突入」或「战斗结束」；
   * 夜战单轮·位置交替·我方先手·大破罚站·空母无法夜战；不受交战形态影响） ============ */
  function nightPhase(log, sideA, sideB, formAName, formBName, ev, pushSnap) {
    /* 航空触接只作用于昼战：进入夜战前清除（夜间观测不适用）。
     * 放在 nightPhase 开头而非 battle() 结尾，是为了让「只打昼战」的结果（allowNight:false）
     * 仍能保留 _reconHit/_touchHit 供断言检查（battle/battleNight 两个入口都经过这里）。 */
    for (const s of sideA) s._touchHit = 1;
    for (const s of sideB) s._touchHit = 1;
    const fA = FORMATIONS[formAName], fB = FORMATIONS[formBName];
    const myAlive = sideA.filter(x => x.alive);
    const enAlive = sideB.filter(x => x.alive);
    if (!(myAlive.length && enAlive.length)) {
      if (enAlive.length) log.push('我军已无力再战，夜战中止。');
      return false;
    }
    log.push('—— 进入夜战！——');
    const nightAct = (s, defSide, defForm) => {
      if (!s.alive || isDaPo(s)) return;              // 大破不能夜战
      if (isCV(s)) { log.push(`夜战：${s.name}（空母）未装备夜间航空兵装，无法攻击。`); return; }
      const t = pickTarget(defSide, s);
      if (!t) return;
      if (isSub(t) && !s.hasASW) { log.push(`夜战：${s.name} 的攻击对潜水中的 ${t.name} 无效。`); return; }
      const ch = hitChance(s, t, formAName, formBName, 1, false);
      if (Math.random() > ch) { log.push(`夜战：${s.name} 攻击 ${t.name}，未命中。`); ev('night', s, t, false, 0, null, false); return; }
      const atk = resolveNightAttack(s);
      if (!atk) return;
      /* 战斗粮食：夜战中消耗一次，舰队夜战攻击力+10%（wiki：夜战开始时自动使用） */
      let rationsBonus = 1;
      if (s.rations && !s.rationsUsed) {
        s.rationsUsed = true;
        rationsBonus = 1.1;
        log.push(`夜战：${s.name} 使用了战斗粮食，攻击力上升！`);
      }
      for (let k = 0; k < atk.n; k++) {
        if (!defSide.some(x => x.alive)) break;
        const tt = pickTarget(defSide, s);
        if (!tt) break;
        const ap = threshold((s.stats.fp + s.stats.tp) * (s.isPlayer ? fA.night : fB.night) * atk.mult * dmgMult(s, 'shell') * rationsBonus, THRESHOLD.NIGHT);
        const dmg = Math.max(0, Math.round(calcDamage(ap, tt.stats.arm, critChance(ch) + 0.05) * ammoBonus(s)));
        const wasAlive = tt.alive;
        applyDamage(log, s, tt, dmg, '夜战：', atk.name ? `发动${atk.name}！` : '', defSide, defForm);
        ev('night', s, tt, true, dmg, atk.name || null, wasAlive && !tt.alive);
        pushSnap();
      }
    };
    let i = 0, j = 0;
    while (i < myAlive.length || j < enAlive.length) {
      if (i < myAlive.length) nightAct(myAlive[i++], sideB, formBName);
      if (j < enAlive.length) nightAct(enAlive[j++], sideA, formAName);
    }
    return true;
  }

  /* ============ 结算（胜利判定/MVP/战果统计；夜战追加后由 battleNight 重新结算） ============ */
  function settle(log, sideA, sideB, nightUsed, formAName, formBName) {
    const enemyTotal = sideB.length;
    const enemyKilled = sideB.filter(s => !s.alive).length;
    const myLost = sideA.filter(s => !s.alive).length;
    const myDaPo = sideA.filter(isDaPo).length;
    const enemyHpTotal = sideB.reduce((s, x) => s + x.stats.hpMax, 0);
    const myHpTotal = sideA.reduce((s, x) => s + x.stats.hpMax, 0);
    const myDamage = sideA.reduce((s, x) => s + x.dealt, 0);
    const enDamage = sideB.reduce((s, x) => s + x.dealt, 0);
    const gaugeA = myHpTotal ? Util.clamp(myDamage / enemyHpTotal, 0, 1) : 0;
    const gaugeB = enemyHpTotal ? Util.clamp(enDamage / myHpTotal, 0, 1) : 0;

    /* 胜利判定（wiki：无己方被击沉为前提；S含被击沉→B；A=击沉多数；B=击沉旗舰/战果2.5倍等） */
    const enFlagKilled = sideB[0] && !sideB[0].alive;
    let rank = 'D';
    let perfect = false;
    if (enemyKilled === enemyTotal) {
      if (myLost > 0) rank = 'B';
      else { rank = 'S'; perfect = myHpTotal > 0 && enDamage === 0; }
    } else if (enemyTotal >= 2 && enemyKilled >= (A_SINKS[enemyTotal] || 2)) {
      rank = 'A';
    } else if (!myLost && enFlagKilled) {
      rank = 'B';
    } else if (!myLost && gaugeA >= gaugeB * 2.5) {
      rank = 'B';
    } else if (myLost > 0 && enFlagKilled && myLost < enemyKilled) {
      rank = 'B';
    } else if (!myLost && gaugeA >= gaugeB) {
      rank = 'C';
    } else if (gaugeA === 0 && gaugeB >= 0.75) {
      rank = 'E';
    } else {
      rank = 'D';
    }

    /* MVP（wiki：最高总伤害；平手随机但旗舰强制；全员0伤害强制旗舰；E评价无MVP） */
    let mvpUid = null;
    if (rank !== 'E') {
      const deal = sideA.filter(s => s.dealt > 0);
      if (!deal.length) mvpUid = sideA[0] ? sideA[0].uid : null;
      else {
        const max = Math.max(...deal.map(s => s.dealt));
        const tops = deal.filter(s => s.dealt === max);
        mvpUid = (sideA[0] && tops.some(s => s.uid === sideA[0].uid)) ? sideA[0].uid : Util.pick(tops).uid;
      }
    }

    const rankLabel = { S: perfect ? '完全胜利 S' : '胜利 S', A: '胜利 A', B: '战术胜利 B', C: '战术败北 C', D: '败北 D', E: '败北 E' }[rank];
    log.push(`战斗结束：${rankLabel}！（击沉敌舰 ${enemyKilled}/${enemyTotal}）`);

    return {
      rank, perfect, log, mySide: sideA, enemySide: sideB,
      enemyKilled, enemyTotal, myLost, myDaPo, nightUsed,
      victory: rank === 'S' || rank === 'A' || rank === 'B',
      mvpUid, enemyHpTotal, myHpTotal, gaugeA, gaugeB,
      formAName, formBName
    };
  }

  /* ============ 舰队级能力聚合（出击前情报室与战斗引擎共用，禁止在 UI 另写一套） ============
   * 编成界面只有存档实例，战斗只接受 buildCombatShip 产物；此处把
   * 「存档实例 → 战斗对象 → 舰队聚合」抽成公共链路，保证 UI 展示的数值与战斗实际使用的数值同源
   * （规范 P2-2 规则与表现分离 / 禁止事项 6 UI 与机制不同步）。 */
  function playerShipsOf(fleetIdx) {
    const G = GameRef();
    const st = G.state;
    const out = [];
    for (const uid of (st.fleet[fleetIdx] || [])) if (st.ships[uid]) out.push(makePlayerShip(uid));
    return out;
  }
  /* 舰队夜战火力：可参加夜战（存活、非大破、非空母）舰艇的 火力+雷装 之和 */
  function fleetNightPower(ships) {
    let sum = 0;
    for (const s of ships) {
      if (!s.alive || isDaPo(s) || isCV(s)) continue;
      sum += (s.stats.fp || 0) + (s.stats.tp || 0);
    }
    return sum;
  }
  function fleetStats(fleetIdx) {
    const ships = playerShipsOf(fleetIdx);
    const slowNames = ships.filter(s => s.speed === 'slow').map(s => s.zh || s.name || s.uid);
    const carriers = ships.filter(hasCarrier);
    return {
      ships,
      count: ships.length,
      air: airPower(ships),
      carriers: carriers.length,
      carrierNames: carriers.map(s => s.zh || s.name || s.uid),
      /* 是否具备航空战力（空母系 + 舰载机）—— 航空战点是否走「被动防空」的唯一判据，UI 同源读取 */
      airWing: hasAirWing(ships),
      los: ships.reduce((a, s) => a + (s.stats.los || 0), 0),
      asw: ships.reduce((a, s) => a + (s.stats.asw || 0), 0),
      aswCapable: ships.filter(canOpeningASW).length,
      night: fleetNightPower(ships),
      reconPlane: ships.some(s => s.alive && s.reconPlane),   // 舰队是否携带舰侦（方向五）
      allFast: ships.length > 0 && slowNames.length === 0,
      hasSlow: slowNames.length > 0,
      slowCount: slowNames.length,
      slowNames
    };
  }
  /* 敌军编成制空值（用于出击前情报室估算对手制空；与实际战斗 airPower 同源） */
  function enemyAirPower(enemyKey) {
    const fleet = (typeof ENEMY_FLEETS !== 'undefined' && ENEMY_FLEETS[enemyKey]) ? ENEMY_FLEETS[enemyKey].ships : null;
    if (!fleet) return 0;
    return airPower(fleet.map((k, i) => makeEnemyShip(k, i)).filter(Boolean));
  }
  /* 制空状态判定（airState 的对外包装：给定我方/敌方制空值，返回是否取得制空优势以上） */
  function hasAirSuperiority(myAir, enAir) {
    const st = airState(myAir, enAir);
    return st.key === 'SUP' || st.key === 'SURE';
  }
  /* 出击前情报：特殊攻击可发动清单（与战斗判定同源；airSup 由调用方按目标海域敌制空给出）
   * 返回 { day: [...], night: [...] }，每项 { id, name, mult, n, req, ok, reason, ships[] } */
  function specialAttackReport(fleetIdx, opts = {}) {
    const ships = playerShipsOf(fleetIdx);
    const airSup = !!opts.airSup;
    const hasPlane = ships.some(s => s.alive && s.hasSeaplane);
    const gate = !airSup ? '制空不足（需航空优势及以上）'
      : !hasPlane ? '未携带水侦/水爆' : null;
    const day = DAY_SPECIALS.map(a => {
      const able = ships.filter(s => s.alive && s.stats.fp > 0 && !dayAttackGate(s, airSup) && a.ok(attackProfile(s)));
      let reason = null;
      if (!able.length) {
        if (gate) reason = gate;
        else {
          const c = ships.filter(s => s.alive && s.stats.fp > 0);
          reason = c.length ? a.miss(attackProfile(c[0])) : '舰队无炮击能力';
        }
      }
      return { id: a.id, name: a.name, mult: a.mult, n: a.n, req: a.req, ok: able.length > 0, reason, ships: able.map(s => s.zh || s.name) };
    });
    const night = NIGHT_SPECIALS.map(a => {
      const able = ships.filter(s => s.alive && !isDaPo(s) && (s.stats.fp + s.stats.tp > 0) && a.ok(attackProfile(s)));
      let reason = null;
      if (!able.length) {
        const c = ships.filter(s => s.alive && !isDaPo(s) && (s.stats.fp + s.stats.tp > 0));
        reason = c.length ? a.miss(attackProfile(c[0])) : '舰队无夜战攻击能力';
      }
      return { id: a.id, name: a.name, mult: a.mult, n: a.n, req: a.req, ok: able.length > 0, reason, ships: able.map(s => s.zh || s.name) };
    });
    return { day, night };
  }

  /* ============ 主战斗入口 ============ */
  /* fleetA: 玩家舰队uid数组, fleetB: 敌舰模板key数组 */
  function battle(fleetA, fleetB, formationA, formationB, opts = {}) {
    const log = [];
    const L = txt => log.push(txt);
    const G = GameRef();

    const sideA = fleetA.map(u => makePlayerShip(u)).filter(Boolean);
    const sideB = fleetB.map((k, idx) => (typeof k === 'string') ? makeEnemyShip(k, idx) : makeRosterShip(k, idx)).filter(Boolean);
    const fA = FORMATIONS[formationA] || FORMATIONS['单纵阵'];
    const fB = FORMATIONS[formationB] || FORMATIONS['单纵阵'];
    const formAName = fA.name, formBName = fB.name;
    const hqLevel = G.state.admiral ? G.state.admiral.level : 1;
    if (sideA.length) sideA[0].isFlag = true;
    if (sideB.length) sideB[0].isFlag = true;

    /* 演出事件记录器（随日志顺序插入 {event} 对象，供 UI 播放动画；不影响字符串日志兼容） */
    const { ev, evAir, evFlak, pushSnap } = makeEventHelpers(log, sideA, sideB);

    L(`敌军阵型：${formationB}。我军选择：${formationA}。`);

    /* ---- 夜战节点（opts.nightOnly）：跳过昼战全阶段，直接夜战 ----
     * 返回带 forceNight 标记的结果：game 层 advance 自动追加 battleNight，
     * UI 层追击选择自动夜战突入（不再询问）。 */
    if (opts.nightOnly) {
      L('—— 夜战节点！能见度极低，舰队在黑暗中接敌 ——');
      const r0 = settle(log, sideA, sideB, false, formAName, formBName);
      r0.forceNight = true;
      /* 夜战节点无索敌/航空阶段：显式标记 recon=null，避免归因误判为「索敌失败」 */
      attachBattleContext(r0, { reconOk: null, myAir: 0, enAir: 0, airSup: false, eng: null, airKey: null, airWing: hasAirWing(sideA), airPassive: false });
      return r0;
    }

    /* ---- 索敌判定（wiki：阵型选择后首先进行索敌；索敌失败则无法参加航空战） ----
     * 四结果：成功/失败 × (索敌机未归还/正常归还)；深海不会索敌失败
     * 索敌成功 → 「命中・回避力UP」；失败 → 「対空・回避力DOWN」（效果微弱，wiki：实际验证区别不大）
     * 注：wiki 字面存在「成功（未归还）」组合，但产品上索敌成功视为索敌机安全返回，
     * 未归还仅在索敌失败时出现（减少水侦搭载；水侦全损无法发动昼战特殊攻击） */
    const recon = resolveRecon(sideA, sideB, hqLevel);
    const reconOk = recon.ok;
    /* 索敌机未归还：仅在索敌失败时，携带水侦/舰载机索敌约有 35% 概率部分索敌机未归还（减少水侦格子搭载） */
    const hasReconAir = sideA.some(s => s.alive && s.slots.some(sl => sl.size > 0 && sl.plane));
    const planeLost = (!reconOk && hasReconAir && Util.chance(0.35)) ? reconPlaneLost(sideA) : 0;
    const reconMod = reconOk ? { hit: 1.03, evd: 1.03, aa: 1 } : { hit: 1, evd: 0.95, aa: 0.95 };
    /* 索敌补正挂到我方舰船（敌方/深海不受影响；夜战同样继承本次判定） */
    for (const s of sideA) { s._reconHit = reconMod.hit; s._reconEvd = reconMod.evd; s._reconAA = reconMod.aa; }
    L(`索敌：${reconOk ? '成功' : '失败'}！${reconOk ? '命中・回避力UP！' : '対空・回避力DOWN！'}${planeLost > 0 ? '（索敌机未归还）' : ''}`);
    /* 索敌演出事件：UI 展示雷达扫描 + 提示横幅 */
    log.push({ event: { kind: 'recon', ok: reconOk, lost: planeLost > 0, myLos: Math.round(recon.myLos), enLos: Math.round(recon.enLos) } });
    let airSup = false;
    let airKey = null;
    let touchSide = null;      // 航空触接结果：'A' 我方触接成功 / 'B' 敌方触接成功 / null 未触接（批次2）

    /* ---- 交战形态（wiki 45/30/15/10；索敌成功且携带舰侦 → 权重向有利方向偏移一档，见 ENG_WEIGHTS） ---- */
    const hasReconPlane = sideA.some(s => s.alive && s.reconPlane);
    const reconGuide = reconOk && hasReconPlane;
    const eng = Util.weighted(engagementWeights(reconOk, hasReconPlane));
    const engMod = ENG_MOD[eng];

    /* ---- 航空战（索敌失败则无法参加航空战） ----
     * 航空战点（opts.airMode）且我方无航空战力时，转入「被动防空」分支（设计稿 §2.2 air）：
     * 敌方舰攻/舰爆直接轰炸，我方仅对空炮火还击，战斗继续但劣化。 */
    const myAir = airPower(sideA), enAir = airPower(sideB);
    const airWing = hasAirWing(sideA);
    const passiveAA = !!opts.airMode && !airWing;
    let airPhaseRan = false;
    /* 放飞机：拥有搭载飞机的舰艇起飞舰载机（合并为一次事件，双方同时起飞） */
    const launch = { A: [], B: [] };
    const markLaunch = (side, letter) => {
      for (const s of side) {
        if (s.alive && s.slots.some(sl => sl.size > 0 && sl.plane)) launch[letter].push(side.indexOf(s));
      }
    };
    const pushLaunch = () => {
      if (launch.A.length || launch.B.length) log.push({ event: { kind: 'launch', ships: launch } });
    };
    if ((myAir > 0 || enAir > 0)) {
      airPhaseRan = true;
      if (passiveAA) {
        /* ---- 被动防空（航空战点 · 我方无航空战力） ---- */
        airKey = 'LOST';
        L(reconOk
          ? `航空战：我军制空 0，敌军制空 ${enAir} —— 舰队没有可投入航空战的舰载机，制空权自动丧失！`
          : '索敌失败！无法参加航空战，制空权自动丧失！');
        L('转入被动防空：敌机群直扑舰队，全舰队对空战斗配置 —— 我方仅有对空炮火还击，无法以舰载机反击。');
        /* 我方舰载机不离舰；敌方机群照常起飞并遭我方对空炮火迎击 */
        markLaunch(sideB, 'B');
        pushLaunch();
        const s2a = aaShootdown(sideB, sideA, true, fA.aa, log);
        evFlak(s2a.shots, s2a.totalPlanes);
        const airEn = airStrike(log, sideB, sideA, '敌军', sideA, formAName, PASSIVE_AA_CAP);
        evAir(airEn.strikes);
        if (airEn.line) L(airEn.line);
        pushSnap();
      } else if (reconOk) {
        const air = airState(myAir, enAir);
        airKey = air.key;
        L(`航空战！我军制空 ${myAir}，敌军制空 ${enAir}，${air.label}！`);
        airSup = air.key === 'SUP' || air.key === 'SURE';
        /* 环节一·放飞机：双方机群同时起飞 */
        markLaunch(sideA, 'A');
        markLaunch(sideB, 'B');
        pushLaunch();
        /* 环节二·空战 S1（wiki：仅当双方均有航空战力时发生空战，否则直接跳过） */
        let s1a = 0, s1b = 0;
        if (myAir > 0 && enAir > 0) {
          s1a = s1Shootdown(sideA, S1_MY[air.key]);
          s1b = s1Shootdown(sideB, S1_EN[air.key]);
        }
        if (s1a + s1b > 0) L(`空战击坠：我军损失 ${s1a} 架，击坠敌机 ${s1b} 架。`);
        if (s1a > 0) ev('airfight', sideA[0] || null, null, true, s1a, null, false);
        if (s1b > 0) ev('airfight', sideB[0] || null, null, true, s1b, null, false);
        /* 对空炮火 S2（防空炮迎击对方攻击机；轮型对空补正1.6/复纵1.2） */
        const s2a = aaShootdown(sideB, sideA, true, fA.aa, log);
        const s2b = aaShootdown(sideA, sideB, false, fB.aa, log);
        if (s2a.total + s2b.total > 0) L(`对空炮火：击落敌机 ${s2a.total} 架，被击落 ${s2b.total} 架。`);
        /* 对空炮火弹幕：一次性批量演出 */
        evFlak(s2a.shots, s2a.totalPlanes);
        evFlak(s2b.shots, s2b.totalPlanes);
        /* 环节三·大规模空袭：先放轰炸事件（防空结束立即进入轰炸，无滞空），汇总行随后 push */
        const airMy = airStrike(log, sideA, sideB, '我军', sideB, formBName);
        const airEn = airStrike(log, sideB, sideA, '敌军', sideA, formAName);
        evAir(airMy.strikes);
        if (airMy.line) L(airMy.line);
        evAir(airEn.strikes);
        if (airEn.line) L(airEn.line);
        pushSnap();
      } else {
        L('索敌失败！无法参加航空战，制空权自动丧失！');
        /* 我方舰载机不离舰不参与航空战；敌方机群照常起飞并遭我方对空炮火迎击 */
        markLaunch(sideB, 'B');
        pushLaunch();
        const s2a = aaShootdown(sideB, sideA, true, fA.aa, log);
        evFlak(s2a.shots, s2a.totalPlanes);
        const airEn = airStrike(log, sideB, sideA, '敌军', sideA, formAName);
        evAir(airEn.strikes);
        if (airEn.line) L(airEn.line);
        pushSnap();
      }
    } else {
      L('双方均无航空战力，不发生航空战。');
    }

    /* ---- 航空触接（设计稿 §4，批次2）----
     * 时机：航空战阶段结束后、炮击战开始前。无航空战阶段（nightOnly / 双方均无航空战力）时不触发。
     * opts.touch === false 时整个阶段跳过且不消耗随机数（drift_check 用它证明「除了触接，什么都没动」）。 */
    if (airPhaseRan && opts.touch !== false) {
      const myRate = touchRate(sideA, airKey);
      if (myRate <= 0) {
        const hasTouchPlane = sideA.some(s => s.alive && s.slots && s.slots.some(sl => sl.size > 0 && isTouchPlane(sl.eq)));
        L(hasTouchPlane ? '未掌握制空权，航空触接不可行。' : '未搭载舰攻或侦察机，无法进行航空触接。');
      } else if (Math.random() < myRate) {
        for (const s of sideA) s._touchHit = TOUCH_MY_HIT;
        touchSide = 'A';
        L(`触接成功：后续攻击命中率提升（触接率 ${Math.round(myRate * 100)}%，我方炮击/雷击命中 ×${TOUCH_MY_HIT}）。`);
        log.push({ event: { kind: 'touch', side: 'A', ok: true, rate: Math.round(myRate * 100), hit: TOUCH_MY_HIT } });
      }
      /* 敌方触接：对称机制，成功率固定 20%（我方制空权丧失时亦无法阻止）；敌方须有可出动的舰载机 */
      const enCanTouch = sideB.some(s => s.alive && s.slots && s.slots.some(sl => sl.size > 0 && sl.plane));
      if (enCanTouch && Math.random() < TOUCH_EN_RATE) {
        for (const s of sideB) s._touchHit = TOUCH_EN_HIT;
        if (!touchSide) touchSide = 'B';
        L(`敌方触接成功！敌军炮击与雷击命中率提升（×${TOUCH_EN_HIT}）。`);
        log.push({ event: { kind: 'touch', side: 'B', ok: true, rate: Math.round(TOUCH_EN_RATE * 100), hit: TOUCH_EN_HIT } });
      }
    }

    /* ---- 先制对潜（wiki：对潜100+声呐等门槛；深海不发动；按射程顺序） ---- */
    const aswList = sideA.filter(canOpeningASW).sort((a, b) => b.range - a.range);
    for (const s of aswList) {
      const subs = sideB.filter(t => t.alive && isSub(t));
      if (!subs.length) break;
      const t = Util.pick(subs);
      if (Util.chance(0.9)) {
        const ap = threshold(aswPower(s) * (fA.asw || 1), THRESHOLD.ASW);
        const dmg = Math.max(0, Math.round(calcDamage(ap, t.stats.arm, 0.1) * ammoBonus(s)));
        const wasAlive = t.alive;
        applyDamage(log, s, t, dmg, '先制对潜！', '', sideB, formBName);
        ev('asw', s, t, true, dmg, null, wasAlive && !t.alive);
        pushSnap();
      } else {
        L(`先制对潜！${s.name} 攻击 ${t.name}，未命中。`);
        ev('asw', s, t, false, 0, null, false);
      }
    }

    /* ---- 开幕雷击（wiki：Lv10以上潜水舰；深海精锐潜水舰；中破/大破不影响发动但伤害受损伤补正）
     * 潜艇点（opts.sub）：敌方全部潜水舰发动开幕雷击，命中/伤害按速力修正并施加 60% 耐久封顶 ---- */
    const openTorp = (s, targetSide, defForm) => {
      const subAmbush = opts.sub && !s.isPlayer;
      const t = subAmbush ? pickSubTarget(targetSide) : pickTarget(targetSide, s);
      if (!t) return;
      let ch = hitChance(s, t, formAName, formBName, 1, true);
      let subMod = null;
      if (subAmbush) { subMod = subAttackMod(t); ch = Math.min(0.95, ch * subMod.hit); }
      if (Math.random() > ch) { L(`开幕雷击！${s.name} 的鱼雷未命中。`); ev('open_torp', s, t, false, 0, null, false); return; }
      const ap = threshold((s.stats.tp + 5) * dmgMult(s, 'torp'), THRESHOLD.TORP);
      let dmg = Math.max(0, Math.round(calcDamage(ap, t.stats.arm, critChance(ch)) * ammoBonus(s)));
      if (subAmbush) dmg = capSubDmg(dmg, t);
      const wasAlive = t.alive;
        applyDamage(log, s, t, dmg, '开幕雷击！', '', targetSide, defForm, false, true);
      ev('open_torp', s, t, true, dmg, null, wasAlive && !t.alive);
      pushSnap();
    };
    for (const s of sideA) if (s.alive && s.type === 'SS' && s.lv >= 10) openTorp(s, sideB, formBName);
    for (const s of sideB) if (s.alive && s.type === 'SS' && (opts.sub || s.name.includes('精锐') || s.boss)) openTorp(s, sideA, formAName);

    L(`交战形态：${ENGAGEMENT[eng]}！`);
    /* 战报显式说明：携带舰侦且索敌成功时，追加一句原因（玩家要能归因到自己的准备） */
    if (reconGuide) {
      L('（舰侦侦察引导：已提前确认敌舰队航向，T字不利概率由 10% 降至 5%）');
    }

    /* ---- 炮击战 ---- */
    const shellingTargets = s => (s.isPlayer ? sideB : sideA).filter(t => t.alive);

    const doShell = (label, s, t, atk, ammoMult) => {
      if (isSub(t) && !s.hasASW) {
        L(`${label}${s.name} 对潜水中的 ${t.name} 攻击无效。`);
        return;
      }
      const isCVShip = isCV(s);
      let ch, ap;
      if (isSub(t)) {
        /* 对潜炮击（wiki：√(素对潜)×2 + 装备对潜×1.5 + 类型补正） */
        ch = 0.9;
        ap = threshold(aswPower(s) * (s.isPlayer ? (fA.asw || 1) : (fB.asw || 1)) * engMod, THRESHOLD.ASW);
      } else if (isCVShip) {
        /* 空母系昼战航空攻击（wiki：空母无主炮，炮击战以舰载机实施航空攻击），命中70~80%不受疲劳/阵型影响 */
        ch = 0.75;
        ap = (s.isPlayer ? cvAirPower(s) : enCVAirPower(s)) * (s.isPlayer ? fA.fp : fB.fp) * engMod * dmgMult(s, 'shell');
        ap = threshold(ap, THRESHOLD.SHELL);
      } else {
        ch = hitChance(s, t, formAName, formBName, engMod, false);
        ap = (s.stats.fp + 5) * (s.isPlayer ? fA.fp : fB.fp) * engMod * atk.mult * dmgMult(s, 'shell');
        ap = threshold(ap, THRESHOLD.SHELL);
      }
      if (Math.random() > ch) {
        L(`${label}${s.name} 攻击 ${t.name}，未命中。`);
        if (isCVShip) evAir([{ s, t, hit: false, dmg: 0, sink: false }]);
        else ev('shell', s, t, false, 0, atk.name || null, false);
        return;
      }
      /* 弹药补正（wiki：阈值后补正，作用于最终伤害） */
      const dmg = Math.max(0, Math.round(calcDamage(ap, t.stats.arm, critChance(ch)) * ammoMult));
      const wasAlive = t.alive;
      applyDamage(log, s, t, dmg, `${label}`, atk.name ? `发动${atk.name}！` : '', s.isPlayer ? sideB : sideA, s.isPlayer ? formBName : formAName);
      if (isCVShip) evAir([{ s, t, hit: true, dmg, sink: wasAlive && !t.alive }]);
      else ev('shell', s, t, true, dmg, atk.name || null, wasAlive && !t.alive);
      pushSnap();
    };

    /* 单舰炮击行动；返回 'ended' 表示对方已无目标，终止本轮 */
    const tryShell = (label, s) => {
      if (!s.alive) return false;                        // 击沉→轮空
      if (isCV(s) && dmgState(s) !== 'ok') return false;  // 空母中破/大破罚站
      if (!isCV(s) && s.stats.fp <= 0) return false;
      const enemies = shellingTargets(s);
      if (!enemies.length) return 'ended';
      const atk = isCV(s) ? { mult: 1, n: 1, name: null, cv: true } : resolveDayAttack(s, airSup);
      if (!atk) return false;
      const ammoMult = ammoBonus(s);
      if (ammoMult === 0) { L(`${label}${s.name} 弹药耗尽，无法攻击。`); return false; }
      for (let k = 0; k < atk.n; k++) {
        if (!enemies.some(t => t.alive)) break;
        const t = pickTarget(enemies, s);
        if (!t) break;
        doShell(label, s, t, atk, ammoMult);
      }
      return true;
    };

    /* 敌我交替回合制（我方先手，击沉/罚站轮空可导致连动） */
    const shellingRound = (label, mode) => {
      const able = s => s.alive && !isSub(s) &&
        (isCV(s) ? (dmgState(s) === 'ok' && canAirAttack(s)) : s.stats.fp > 0);
      let myQ = sideA.filter(able), enQ = sideB.filter(able);
      if (!myQ.length && !enQ.length) { L(`${label}双方均无法进行炮击。`); return; }
      if (mode === 'range') {
        /* 第一轮按射程：超长→长→中→短，同射程随机（wiki） */
        const rangeSort = arr => {
          const groups = {};
          for (const x of arr) (groups[x.range] = groups[x.range] || []).push(x);
          const keys = Object.keys(groups).map(Number).sort((a, b) => b - a);
          const out = [];
          for (const k of keys) {
            const g = groups[k];
            for (let i = g.length - 1; i > 0; i--) {
              const j = Util.ri(0, i);
              [g[i], g[j]] = [g[j], g[i]];
            }
            out.push(...g);
          }
          return out;
        };
        myQ = rangeSort(myQ);
        enQ = rangeSort(enQ);
      }
      let i = 0, j = 0, any = false;
      while (i < myQ.length || j < enQ.length) {
        if (i < myQ.length) {
          const r = tryShell(label, myQ[i++]);
          if (r === 'ended') return any;
          if (r) any = true;
        }
        if (j < enQ.length) {
          const r = tryShell(label, enQ[j++]);
          if (r === 'ended') return any;
          if (r) any = true;
        }
      }
      return any;
    };

    L('—— 第一轮炮击战 ——');
    shellingRound('', 'range');
    L('—— 第二轮炮击战 ——');
    shellingRound('第二轮：', 'position');

    /* ---- 雷击战（wiki：中破/大破罚站；本体雷装>0且舰种符合即可） ---- */
    const canTorp = s => s.alive && dmgState(s) === 'ok' && s.stats.tp > 0 && isTorpType(s);
    (() => {
      const myAlive = sideA.filter(x => x.alive);
      const enAlive = sideB.filter(x => x.alive);
      if (!myAlive.length || !enAlive.length) return;
      const myOnlySub = myAlive.every(isSub);
      const enOnlySub = enAlive.every(isSub);
      if (myOnlySub && enOnlySub) { L('双方均只剩潜水舰，不发生雷击战。'); return; }
      let myT, enT;
      if (enOnlySub && !myOnlySub) { myT = []; enT = enAlive.filter(canTorp); }
      else if (myOnlySub && !enOnlySub) { myT = myAlive.filter(canTorp); enT = []; }
      else { myT = myAlive.filter(canTorp); enT = enAlive.filter(canTorp); }
      if (!myT.length && !enT.length) return;
      L('—— 雷击战 ——');
      const doTorp = (s, defSide, defForm, isMy) => {
        const subAmbush = opts.sub && !s.isPlayer;
        const t = subAmbush ? pickSubTarget(defSide) : pickTarget(defSide, s);
        if (!t) return;
        let ch = hitChance(s, t, formAName, formBName, engMod, true);
        let subMod = null;
        if (subAmbush) { subMod = subAttackMod(t); ch = Math.min(0.95, ch * subMod.hit); }
        if (Math.random() > ch) { L(`雷击战！${s.name} 的鱼雷未命中。`); ev('torp', s, t, false, 0, null, false); return; }
        const ap = threshold((s.stats.tp + 5) * (isMy ? fA.tp : fB.tp) * engMod * dmgMult(s, 'torp'), THRESHOLD.TORP);
        let dmg = Math.max(0, Math.round(calcDamage(ap, t.stats.arm, critChance(ch)) * ammoBonus(s)));
        if (subAmbush) dmg = capSubDmg(dmg, t);
        const wasAlive = t.alive;
        applyDamage(log, s, t, dmg, '雷击战！', '', defSide, defForm, false, true);
        ev('torp', s, t, true, dmg, null, wasAlive && !t.alive);
        pushSnap();
      };
      let i = 0, j = 0;
      while (i < myT.length || j < enT.length) {
        if (i < myT.length) { const s = myT[i++]; if (s.alive) doTorp(s, sideB, formBName, true); }
        if (j < enT.length) { const s = enT[j++]; if (s.alive) doTorp(s, sideA, formAName, false); }
      }
    })();

    /* ---- 夜战（wiki：昼战结束后由玩家选择「夜战突入」或「战斗结束」；UI 分两段流程） ---- */
    let nightUsed = false;
    if (opts.allowNight !== false) {
      nightUsed = nightPhase(log, sideA, sideB, formAName, formBName, ev, pushSnap);
    }

    /* ---- 结算 ---- */
    const r = settle(log, sideA, sideB, nightUsed, formAName, formBName);
    attachBattleContext(r, { reconOk, myAir, enAir, airSup, eng, airKey, airWing, airPassive: passiveAA, touch: touchSide });
    return r;
  }

  /* 把索敌/制空/交战形态结果挂到结算结果上（供 game 层失败归因使用；夜战追加后需重新挂载）
   * airWing   ：我方是否具备航空战力（空母系 + 舰载机）——航空战点归因要区分「无航母」与「制空不足」
   * airPassive：本场是否走了「被动防空」分支（航空战点 + 无航空战力）
   * touch     ：航空触接是否成功（'A' 我方 / 'B' 敌方 / null 未触接） */
  function attachBattleContext(r, ctx) {
    r.recon = ctx.reconOk === undefined ? null : ctx.reconOk;
    r.myAir = ctx.myAir || 0;
    r.enAir = ctx.enAir || 0;
    r.airSup = !!ctx.airSup;
    r.airKey = ctx.airKey || null;          // 制空状态 key（SURE/SUP/PAR/INF/LOST），供荣誉判定
    r.airWing = !!ctx.airWing;
    r.airPassive = !!ctx.airPassive;
    r.touch = ctx.touch || null;
    r.engagement = ctx.eng || null;
    return r;
  }

  /* ============ 夜战突入（追击选择）：在昼战结果基础上追加夜战并重新结算
   * 昼战结果（allowNight:false）持有存活的战斗对象与共享日志，追加后返回新的结算结果；
   * 日志数组为同一引用，UI 可从昼战播放位置继续播放夜战段 ============ */
  function battleNight(dayResult) {
    const log = dayResult.log;
    const sideA = dayResult.mySide, sideB = dayResult.enemySide;
    const formAName = dayResult.formAName, formBName = dayResult.formBName;
    const { ev, pushSnap } = makeEventHelpers(log, sideA, sideB);
    const nightUsed = nightPhase(log, sideA, sideB, formAName, formBName, ev, pushSnap);
    const r = settle(log, sideA, sideB, nightUsed, formAName, formBName);
    return attachBattleContext(r, {
      reconOk: dayResult.recon, myAir: dayResult.myAir, enAir: dayResult.enAir,
      airSup: dayResult.airSup, eng: dayResult.engagement, airKey: dayResult.airKey,
      airWing: dayResult.airWing, airPassive: dayResult.airPassive, touch: dayResult.touch
    });
  }

  return {
    battle, battleNight, FORMATIONS, ENGAGEMENT, airState, makeEnemyShip, isDaPo, ammoBonus,
    /* 出击前情报室共用接口（禁止在 UI 另写一套算法） */
    buildCombatShip, airPower, fleetStats, enemyAirPower, hasAirSuperiority, specialAttackReport,
    DAY_SPECIALS, NIGHT_SPECIALS,
    /* 航空线（批次1/2）：航空战力判定 + 被动防空封顶比例 + 航空触接 —— UI 与归因禁止另写一套 */
    hasAirWing, isCarrierType: hasCarrier, PASSIVE_AA_CAP,
    touchRate, touchReport, isTouchPlane, touchPlaneValue, hitMods,
    TOUCH_MAX, TOUCH_AIR_BONUS, TOUCH_MY_HIT, TOUCH_EN_RATE, TOUCH_EN_HIT,
    /* 士气档位（UI 徽记与文案读同一张表） */
    MORALE_TIERS, moraleTier, moraleMods, moraleBadge,
    /* 交战形态权重（方向五：侦察引导航向） */
    ENG_WEIGHTS, engagementWeights
  };
})();

if (typeof window !== 'undefined') window.Battle = Battle;
if (typeof module !== 'undefined' && module.exports) module.exports = { Battle };
