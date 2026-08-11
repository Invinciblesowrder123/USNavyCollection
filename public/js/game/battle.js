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
      alive: st[0] > 0, hp: st[0], dealt: 0
    };
  }

  const isSub = s => s.type === 'SS' || s.type === 'SSV';
  const isCV = s => s.type === 'CV' || s.type === 'CVL' || s.type === 'CVB';
  const isTorpType = s => ['DD', 'CL', 'CLT', 'CA', 'CAV', 'SS'].includes(s.type);

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

  /* ============ 命中推定（wiki推定式） ============ */
  function hitChance(atk, def, formAName, formBName, engMult, isTorpedo) {
    const lvT = Math.sqrt(Math.max(0, atk.lv - 1)) / 50;
    const luckT = 0.15 * (atk.stats.lck || 0) / 100;
    const eqHit = (atk.equipped || []).reduce((s, e) => s + (e && e.stat && e.stat.hit ? e.stat.hit : 0), 0) / 100;
    let moraleA = 1;
    if (atk.morale >= 50) moraleA = 1.2;         // 闪
    else if (atk.morale < 30) moraleA = 0.5;     // 红脸
    /* 阵型命中补正：复纵/单横/梯形攻击方×1.2（复纵vs单横、梯形vs单纵除外） */
    let formAcc = 1;
    if ((formAName === '复纵阵' || formAName === '单横阵' || formAName === '梯形阵') &&
      !(formAName === '复纵阵' && formBName === '单横阵') &&
      !(formAName === '梯形阵' && formBName === '单纵阵')) formAcc = 1.2;
    const acc = 0.07 + (0.93 + lvT + luckT + eqHit) * formAcc * moraleA * (atk._reconHit || 1);
    /* 回避项 */
    let evd = def.stats.evd;
    if (formBName === '单横阵' || formBName === '梯形阵' || formBName === '轮形阵') evd *= 1.2;
    if (def.morale >= 50) evd *= 1.8;            // 闪回避×1.8
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

  /* ============ 昼战特殊攻击判定（wiki：制空优势/确保+水侦；主主1.5、主弹1.3、主电1.2、主副1.1、连击1.2×2） ============ */
  function resolveDayAttack(s, airSup) {
    if (s.stats.fp <= 0 || !s.alive) return null;
    if (airSup && s.hasSeaplane && !isDaPo(s)) {
      const mg = s.mainGuns, sec = s.secondaries, ap = s.apShell, rd = s.radar;
      if (mg >= 2 && ap) return { mult: 1.5, n: 1, name: '主炮Cut-in' };
      if (mg >= 2) return { mult: 1.2, n: 2, name: '昼战连击' };
      if (mg >= 1 && sec >= 1 && ap) return { mult: 1.3, n: 1, name: '主弹Cut-in' };
      if (mg >= 1 && sec >= 1 && rd) return { mult: 1.2, n: 1, name: '主电Cut-in' };
      if (mg >= 1 && sec >= 1) return { mult: 1.1, n: 1, name: '主副Cut-in' };
    }
    return { mult: 1.0, n: 1, name: null };
  }

  /* ============ 夜战特殊攻击判定（wiki：鱼雷CI 1.5×2/主鱼1.3×2/连击1.2×2；中破CI率+15%；探照灯+10%） ============ */
  function resolveNightAttack(s) {
    if (!s.alive || isDaPo(s)) return null;
    if (s.stats.fp + s.stats.tp <= 0) return null;
    const eq = s.equipped.map(e => e && EquipmentData[e.id]).filter(Boolean);
    const torps = eq.filter(e => e.slot === SLOT.TORPEDO).length;
    const guns = eq.filter(e => e.slot === SLOT.SMALL_GUN || e.slot === SLOT.MED_GUN || e.slot === SLOT.BIG_GUN).length;
    let spec = null;
    if (torps >= 2) spec = { mult: 1.5, n: 2, name: '鱼雷Cut-in' };
    else if (guns >= 1 && torps >= 1) spec = { mult: 1.3, n: 2, name: '主鱼Cut-in' };
    else if (guns >= 2) spec = { mult: 1.2, n: 2, name: '夜战连击' };
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
   * 命中行静默并汇总为一行，返回打击列表供 UI 一次性演出 ============ */
  function airStrike(log, attackers, defenders, sideLabel, defSide, defForm) {
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
          const dmg = calcDamage(ap, t.stats.arm, 0.1);
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

    /* ---- 交战形态（45/30/15/10，wiki：彩云可100%回避T不利，未实装） ---- */
    const eng = Util.weighted({ PARALLEL: 45, REVERSE: 30, T_ADV: 15, T_DIS: 10 });
    const engMod = ENG_MOD[eng];

    /* ---- 航空战（索敌失败则无法参加航空战） ---- */
    const myAir = airPower(sideA), enAir = airPower(sideB);
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
      if (reconOk) {
        const air = airState(myAir, enAir);
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

    /* ---- 开幕雷击（wiki：Lv10以上潜水舰；深海精锐潜水舰；中破/大破不影响发动但伤害受损伤补正） ---- */
    const openTorp = (s, targetSide, defForm) => {
      const t = pickTarget(targetSide, s);
      if (!t) return;
      const ch = hitChance(s, t, formAName, formBName, 1, true);
      if (Math.random() > ch) { L(`开幕雷击！${s.name} 的鱼雷未命中。`); ev('open_torp', s, t, false, 0, null, false); return; }
      const ap = threshold((s.stats.tp + 5) * dmgMult(s, 'torp'), THRESHOLD.TORP);
      const dmg = Math.max(0, Math.round(calcDamage(ap, t.stats.arm, critChance(ch)) * ammoBonus(s)));
      const wasAlive = t.alive;
        applyDamage(log, s, t, dmg, '开幕雷击！', '', targetSide, defForm, false, true);
      ev('open_torp', s, t, true, dmg, null, wasAlive && !t.alive);
      pushSnap();
    };
    for (const s of sideA) if (s.alive && s.type === 'SS' && s.lv >= 10) openTorp(s, sideB, formBName);
    for (const s of sideB) if (s.alive && s.type === 'SS' && (s.name.includes('精锐') || s.boss)) openTorp(s, sideA, formAName);

    L(`交战形态：${ENGAGEMENT[eng]}！`);

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
        const t = pickTarget(defSide, s);
        if (!t) return;
        const ch = hitChance(s, t, formAName, formBName, engMod, true);
        if (Math.random() > ch) { L(`雷击战！${s.name} 的鱼雷未命中。`); ev('torp', s, t, false, 0, null, false); return; }
        const ap = threshold((s.stats.tp + 5) * (isMy ? fA.tp : fB.tp) * engMod * dmgMult(s, 'torp'), THRESHOLD.TORP);
        const dmg = Math.max(0, Math.round(calcDamage(ap, t.stats.arm, critChance(ch)) * ammoBonus(s)));
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
    return settle(log, sideA, sideB, nightUsed, formAName, formBName);
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
    return settle(log, sideA, sideB, nightUsed, formAName, formBName);
  }

  return { battle, battleNight, FORMATIONS, ENGAGEMENT, airState, makeEnemyShip, isDaPo, ammoBonus };
})();

if (typeof window !== 'undefined') window.Battle = Battle;
if (typeof module !== 'undefined' && module.exports) module.exports = { Battle };
