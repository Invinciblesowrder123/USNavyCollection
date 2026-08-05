'use strict';
/* ============================================================
 * 战斗引擎 v3 — 还原《舰队收藏》机制（参考舰娘百科 zh.kcwiki.cn）
 * 流程: 阵型选择 → 索敌 → 航空战(制空权/空袭) → 先制对潜 → 开幕雷击
 *       → 交战形态 → 第一轮炮击战(射程制·敌我交替·我方先手)
 *       → 第二轮炮击战(位置制) → 雷击战(双方·中破罚站) → 夜战(单轮·大破罚站)
 * 损伤状态: 小破≤75% / 中破≤50%(火力-20%·禁雷击·空母罚站) / 大破≤25%(火力-60%·禁夜战)
 * 防沉保护: 我方舰娘受到≥当前HP的伤害时，仅损失当前HP的50%~80%
 * 胜利判定/MVP/经验倍率 参照 wiki
 * ============================================================ */

const Battle = (() => {
  const Util = (typeof window !== 'undefined') ? window.Util : require('../core/utils.js').Util;
  const GameRef = () => (typeof window !== 'undefined') ? window.Game : require('../core/state.js').Game;

  const ENGAGEMENT = { PARALLEL: '同航战', REVERSE: '反航战', T_ADV: 'T字有利', T_DIS: 'T字不利' };
  const ENG_MOD = { PARALLEL: 1.0, REVERSE: 0.8, T_ADV: 1.2, T_DIS: 0.6 };

  const FORMATIONS = {
    '单纵阵': { fp: 1.0, tp: 1.0, asw: 0.6, night: 1.0, name: '单纵阵' },
    '复纵阵': { fp: 0.8, tp: 0.8, asw: 0.8, night: 0.8, name: '复纵阵' },
    '轮形阵': { fp: 0.7, tp: 0.7, asw: 1.2, night: 1.0, name: '轮形阵' },
    '梯形阵': { fp: 0.75, tp: 0.6, asw: 1.1, night: 1.0, name: '梯形阵' },
    '单横阵': { fp: 0.6, tp: 0.6, asw: 1.3, night: 1.0, name: '单横阵' }
  };

  const S1_LOSS = { LOST: 0.40, INF: 0.30, PAR: 0.20, SUP: 0.12, SURE: 0.04 };

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
      return { size: (def.sizes ? def.sizes[i] : 24), eq, planeAA: planeLike ? (eq.stat.aa || 0) : 0 };
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
      aaCI: (countType(SLOT.HAA) >= 2) || (countType(SLOT.HAA) >= 1 && countType(SLOT.RADAR) >= 1) || (countType(SLOT.HAA) >= 1 && countType(SLOT.MG) >= 1),
      searchlight: eqObjs.some(e => e && e.id === 'searchlight'),
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
    return buildCombatShip({
      def: d, lv: roster.lv || 1, kai,
      equipIds: d.equip || [], supply: 1, fuel: 1, morale: 50,
      isPlayer: false, uid: 'p' + idx
    });
  }

  function makeEnemyShip(key, idx) {
    const tpl = DEEP_TEMPLATES[key];
    const st = tpl.stats.slice();
    const slots = (tpl.slots || []).map(s => ({ size: s.planes, planeAA: s.aa, eq: null }));
    return {
      uid: 'e' + idx, isPlayer: false, name: tpl.name, zh: tpl.name, type: tpl.type, boss: !!tpl.boss,
      stats: { hp: st[0], hpMax: st[0], fp: st[1], tp: st[2], aa: st[3], arm: st[4], evd: st[5], asw: st[6], los: st[7], lck: st[8] },
      lv: 1, morale: 40, ammo: 1, fuel: 1, equipped: [], slots,
      /* 深海空母射程为超短（第一轮最后行动）；BB/CA 长 */
      range: tpl.type === 'BB' ? 2 : (tpl.type === 'CA' ? 2 : (tpl.type === 'CV' || tpl.type === 'CVL' ? 0 : 1)),
      mainGuns: tpl.type === 'BB' || tpl.type === 'CA' ? 2 : 0,
      secondaries: 0, apShell: false, radar: false,
      hasSeaplane: false, hasTorpedo: tpl.type === 'DD' || tpl.type === 'CL' || tpl.type === 'SS',
      hasASW: false, aaCI: false, searchlight: false,
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
  /* 中破火力-20%、大破-60% */
  const dmgMult = s => dmgState(s) === 'da' ? 0.4 : dmgState(s) === 'mid' ? 0.8 : 1;

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
    const acc = 0.07 + (0.93 + lvT + luckT + eqHit) * formAcc * moraleA;
    /* 回避项 */
    let evd = def.stats.evd;
    if (formBName === '单横阵' || formBName === '梯形阵' || formBName === '轮形阵') evd *= 1.2;
    if (def.morale >= 50) evd *= 1.8;            // 闪回避×1.8
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

  /* 防沉保护：伤害≥当前HP时，只扣取整[当前HP×0.5 + rand(0~当前HP-1)×0.3] */
  function protectedDamage(hp) {
    return Math.max(1, Math.floor(hp * 0.5 + Util.ri(0, Math.max(0, hp - 1)) * 0.3));
  }

  function dealDamage(log, atk, def, dmg, prefix, extra) {
    if (dmg <= 0) { log.push(`${prefix}${atk.name}${extra || ''}攻击 ${def.name}，被装甲完全弹开！`); return; }
    atk.dealt += dmg;
    if (def.isPlayer && dmg >= def.hp) {
      /* 我方舰娘防沉保护（不会在通常战斗中轰沉） */
      const newHp = protectedDamage(def.hp);
      def.hp = Math.max(1, newHp);
      log.push(`${prefix}${atk.name}${extra || ''}攻击 ${def.name}，命中！造成巨大伤害！「${def.name}」大破！（防沉保护）`);
    } else {
      def.hp -= dmg;
      log.push(`${prefix}${atk.name}${extra || ''}攻击 ${def.name}，命中！造成 ${dmg} 伤害。`);
      if (def.hp <= 0 && def.alive) { def.alive = false; log.push(`${def.name} 被击沉了！`); }
    }
  }

  /* HP 快照（供 UI 演出） */
  function snapshot(sideA, sideB) {
    const mk = s => ({ n: s.name, hp: Math.max(0, s.hp), max: s.stats.hpMax, alive: s.alive });
    return { snap: { A: sideA.map(mk), B: sideB.map(mk) } };
  }

  /* ============ 昼战特殊攻击判定 ============ */
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

  /* ============ 夜战特殊攻击判定（中破时发动率+15%） ============ */
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
    let rate = 0.5;
    if (dmgState(s) === 'mid') rate += 0.15;      // 中破CI率+15%
    return Util.chance(rate) ? spec : { mult: 1.0, n: 1, name: null };
  }

  /* ============ 空袭 ============ */
  function airStrike(log, attackers, defenders, sideLabel, snap) {
    for (const s of attackers) {
      if (!s.alive) continue;
      for (const sl of s.slots) {
        if (sl.size <= 0 || sl.planeAA <= 0) continue;
        const isFighter = sl.eq && sl.eq.slot === SLOT.FIGHTER;
        if (isFighter) continue;
        const targets = defenders.filter(t => t.alive);
        if (!targets.length) return;
        const t = Util.pick(targets);
        let dmg;
        if (s.isPlayer) {
          const power = sl.eq.stat.bmb || sl.eq.stat.tp || 0;
          dmg = calcDamage(threshold(sl.size * power * 0.75 + 5, 170), t.stats.arm, 0.1);
        } else {
          const power = 20 + sl.planeAA * 3;
          dmg = calcDamage(threshold(power, 160), t.stats.arm, 0.1);
        }
        log.push(`${sideLabel}空袭！${s.name} 的机队轰炸 ${t.name}，造成 ${dmg} 伤害。`);
        s.dealt += dmg;
        if (t.isPlayer && dmg >= t.hp) {
          const newHp = protectedDamage(t.hp);
          t.hp = Math.max(1, newHp);
          log.push(`「${t.name}」大破！（防沉保护）`);
        } else {
          t.hp -= dmg;
          if (t.hp <= 0 && t.alive) { t.alive = false; log.push(`${t.name} 被击沉了！`); }
        }
        if (snap) snap();
      }
    }
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
    const losOk = (opts.losReq == null) || (G.fleetLos(opts.fleetIdx) >= opts.losReq);
    const pushSnap = () => log.push(snapshot(sideA, sideB));
    const hit = (s, t, dmg, prefix, extra) => { dealDamage(log, s, t, dmg, prefix, extra); pushSnap(); };

    L(`敌军阵型：${formationB}。我军选择：${formationA}。`);
    let airSup = false;

    /* ---- 航空战（索敌失败则无法参加航空战） ---- */
    const myAir = airPower(sideA), enAir = airPower(sideB);
    if ((myAir > 0 || enAir > 0)) {
      if (losOk) {
        const air = airState(myAir, enAir);
        L(`航空战！我军制空 ${myAir}，敌军制空 ${enAir}，${air.label}！`);
        airSup = air.key === 'SUP' || air.key === 'SURE';
        const lossRate = S1_LOSS[air.key];
        /* S1 空战击坠（我方损失） */
        for (const s of sideA) {
          for (const sl of s.slots) {
            if (sl.planeAA > 0 && sl.size > 0) {
              sl.size = Math.max(0, sl.size - Math.floor(sl.size * Util.rf(lossRate - 0.05, lossRate + 0.05)));
            }
          }
        }
        /* S2 对空炮火（我方击落敌机） */
        for (const s of sideA) {
          if (!s.alive) continue;
          for (const sl of sideB) {
            for (const sl2 of sl.slots) {
              if (sl2.planeAA > 0 && sl2.size > 0) {
                sl2.size = Math.max(0, sl2.size - Math.floor(sl2.size * Util.rf(0.02, 0.10)));
              }
            }
          }
          if (s.aaCI) {
            let extra = Util.ri(1, 3);
            for (const sl of sideB) {
              for (const sl2 of sl.slots) {
                if (sl2.planeAA > 0 && sl2.size > 0 && extra > 0) { sl2.size = Math.max(0, sl2.size - extra); extra = 0; }
              }
            }
            L(`${s.name} 发动对空Cut-in，追加击落敌机！`);
          }
        }
        /* 双方空袭 */
        airStrike(log, sideA, sideB, '我军', pushSnap);
        airStrike(log, sideB, sideA, '敌军', pushSnap);
      } else {
        L('索敌失败！无法参加航空战，制空权自动丧失！');
        airStrike(log, sideB, sideA, '敌军', pushSnap);
      }
    } else {
      L('双方均无航空战力，不发生航空战。');
    }

    /* ---- 先制对潜 ---- */
    for (const s of sideA) {
      if (!s.alive || !s.hasASW) continue;
      const subs = sideB.filter(t => t.alive && isSub(t));
      if (!subs.length) continue;
      const t = Util.pick(subs);
      if (Util.chance(0.9)) {
        const ap = threshold(s.stats.asw + 20 + (fA.asw || 0), 150);
        const dmg = calcDamage(ap, t.stats.arm, 0.1);
        hit(s, t, dmg, '先制对潜！');
      } else L(`先制对潜！${s.name} 攻击 ${t.name}，未命中。`);
    }

    /* ---- 开幕雷击（Lv10以上潜水舰） ---- */
    for (const s of sideA) {
      if (!s.alive || s.type !== 'SS' || s.lv < 10) continue;
      const t = pickTarget(sideB, s);
      if (!t) break;
      if (Util.chance(0.7)) {
        const ap = threshold(s.stats.tp + 5, 150);
        const dmg = calcDamage(ap, t.stats.arm, critChance(hitChance(s, t, formAName, formBName, 1, true)));
        hit(s, t, dmg, '开幕雷击！');
      } else L(`开幕雷击！${s.name} 的鱼雷未命中。`);
    }

    /* ---- 交战形态（45/30/15/10） ---- */
    const eng = Util.weighted({ PARALLEL: 45, REVERSE: 30, T_ADV: 15, T_DIS: 10 });
    const engMod = ENG_MOD[eng];
    L(`交战形态：${ENGAGEMENT[eng]}！`);

    /* ---- 炮击战 ---- */
    const shellingTargets = s => (s.isPlayer ? sideB : sideA).filter(t => t.alive);

    const doShell = (label, s, t, atk, ammoMult) => {
      const ch = hitChance(s, t, formAName, formBName, engMod, false);
      if (Math.random() > ch) { L(`${label}${s.name} 攻击 ${t.name}，未命中。`); return; }
      const fm = s.isPlayer ? fA.fp : fB.fp;
      let ap = (s.stats.fp + 5) * fm * engMod * atk.mult * dmgMult(s);
      if (ammoMult < 1) ap *= ammoMult;
      ap = threshold(ap, 180);
      const dmg = calcDamage(ap, t.stats.arm, critChance(ch));
      dealDamage(log, s, t, dmg, `${label}`, atk.name ? `发动${atk.name}！` : '');
      pushSnap();
    };

    /* 单舰炮击行动；返回 'ended' 表示对方已无目标，终止本轮 */
    const tryShell = (label, s) => {
      if (!s.alive) return false;                        // 击沉→轮空
      if (isCV(s) && dmgState(s) !== 'ok') return false;  // 空母中破/大破罚站
      const enemies = shellingTargets(s);
      if (!enemies.length) return 'ended';
      const atk = resolveDayAttack(s, airSup);
      if (!atk) return false;
      const ammoMult = s.ammo < 0.25 ? 0 : (s.ammo < 0.5 ? 0.5 : 1);
      if (ammoMult === 0) { L(`${label}${s.name} 弹药耗尽，无法炮击。`); return false; }
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
      const able = s => s.alive && s.stats.fp > 0 && !isSub(s) &&
        !(isCV(s) && dmgState(s) !== 'ok');
      let myQ = sideA.filter(able), enQ = sideB.filter(able);
      if (!myQ.length && !enQ.length) { L(`${label}双方均无法进行炮击。`); return; }
      if (mode === 'range') {
        myQ.sort((a, b) => b.range - a.range);
        enQ.sort((a, b) => b.range - a.range);
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

    /* ---- 雷击战（双方均可，中破/大破罚站） ---- */
    const canTorp = s => s.alive && dmgState(s) === 'ok' && s.stats.tp > 0 && isTorpType(s);
    const doTorp = (s, defSide, isMy) => {
      const t = pickTarget(defSide, s);
      if (!t) return;
      const ch = hitChance(s, t, formAName, formBName, engMod, true);
      if (Math.random() > ch) { L(`雷击战！${s.name} 的鱼雷未命中。`); return; }
      const ap = threshold((s.stats.tp + 5) * (isMy ? fA.tp : fB.tp) * engMod * dmgMult(s), 150);
      const dmg = calcDamage(ap, t.stats.arm, critChance(ch));
      dealDamage(log, s, t, dmg, '雷击战！', '');
      pushSnap();
    };
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
      let i = 0, j = 0;
      while (i < myT.length || j < enT.length) {
        if (i < myT.length) { const s = myT[i++]; if (s.alive) doTorp(s, sideB, true); }
        if (j < enT.length) { const s = enT[j++]; if (s.alive) doTorp(s, sideA, false); }
      }
    })();

    /* ---- 夜战（单轮·位置交替·我方先手·大破罚站） ---- */
    if (opts.allowNight !== false) {
      const myAlive = sideA.filter(x => x.alive);
      const enAlive = sideB.filter(x => x.alive);
      if (myAlive.length && enAlive.length) {
        L('—— 进入夜战！——');
        const nightAct = (s, defSide) => {
          if (!s.alive || isDaPo(s)) return;              // 大破不能夜战
          const t = pickTarget(defSide, s);
          if (!t) return;
          if (isSub(t) && !s.hasASW) { L(`夜战：${s.name} 的攻击对潜水中的 ${t.name} 无效。`); return; }
          const ch = hitChance(s, t, formAName, formBName, 1, false);
          if (Math.random() > ch) { L(`夜战：${s.name} 攻击 ${t.name}，未命中。`); return; }
          const atk = resolveNightAttack(s);
          if (!atk) return;
          for (let k = 0; k < atk.n; k++) {
            if (!defSide.some(x => x.alive)) break;
            const tt = pickTarget(defSide, s);
            if (!tt) break;
            const ap = threshold((s.stats.fp + s.stats.tp + 5) * (s.isPlayer ? fA.night : fB.night) * atk.mult * dmgMult(s), 300);
            const dmg = calcDamage(ap, tt.stats.arm, critChance(ch) + 0.05);
            dealDamage(log, s, tt, dmg, '夜战：', atk.name ? `发动${atk.name}！` : '');
            pushSnap();
          }
        };
        let i = 0, j = 0;
        while (i < myAlive.length || j < enAlive.length) {
          if (i < myAlive.length) nightAct(myAlive[i++], sideB);
          if (j < enAlive.length) nightAct(enAlive[j++], sideA);
        }
      } else if (enAlive.length) {
        L('我军已无力再战，夜战中止。');
      }
    }

    /* ---- 结算 ---- */
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

    /* 胜利判定（参照wiki，无我方击沉为前提；防沉保护下我方通常不会被击沉） */
    const enFlagKilled = sideB[0] && !sideB[0].alive;
    let rank = 'D';
    let perfect = false;
    if (enemyKilled === enemyTotal) {
      rank = 'S';
      perfect = myHpTotal > 0 && enDamage === 0;
    } else if (enemyTotal >= 2 && enemyKilled >= (A_SINKS[enemyTotal] || 2)) {
      rank = 'A';
    } else if (!myLost && enFlagKilled) {
      rank = 'B';
    } else if (!myLost && gaugeA >= gaugeB * 2.5) {
      rank = 'B';
    } else if (!myLost && gaugeA >= gaugeB) {
      rank = 'C';
    } else if (gaugeA === 0 && gaugeB >= 0.75) {
      rank = 'E';
    } else {
      rank = 'D';
    }

    /* MVP：总伤害最高；平手时旗舰优先；全员0伤害强制旗舰；E评价无MVP */
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
    L(`战斗结束：${rankLabel}！（击沉敌舰 ${enemyKilled}/${enemyTotal}）`);

    return {
      rank, perfect, log, mySide: sideA, enemySide: sideB,
      enemyKilled, enemyTotal, myLost, myDaPo,
      victory: rank === 'S' || rank === 'A' || rank === 'B',
      mvpUid, enemyHpTotal, myHpTotal, gaugeA, gaugeB
    };
  }

  return { battle, FORMATIONS, ENGAGEMENT, airState, makeEnemyShip, isDaPo };
})();

if (typeof window !== 'undefined') window.Battle = Battle;
if (typeof module !== 'undefined' && module.exports) module.exports = { Battle };
