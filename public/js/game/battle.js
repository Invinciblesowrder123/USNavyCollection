'use strict';
/* ============================================================
 * 战斗引擎 v2
 * 流程: 索敌→航空战(制空/S1/S2/空袭)→先制对潜→开幕雷击(SS)
 *       →交战形态→昼战炮击(射程序,双方有BB二轮)→昼战雷击→夜战
 * 特殊攻击: 昼战观测射击(需制空优势+/水侦)、夜战CI/连击、对空CI
 * ============================================================ */

const Battle = (() => {
  const Util = (typeof window !== 'undefined') ? window.Util : require('../core/utils.js').Util;
  const GameRef = () => (typeof window !== 'undefined') ? window.Game : require('../core/state.js').Game;

  const ENGAGEMENT = { PARALLEL: '同航战', REVERSE: '反航战', T_ADV: 'T字有利', T_DIS: 'T字不利' };
  const ENG_MOD = { PARALLEL: 1.0, REVERSE: 0.9, T_ADV: 1.1, T_DIS: 0.85 };

  const FORMATIONS = {
    '单纵阵': { fp: 1.0, acc: 0, eva: -5, name: '单纵阵' },
    '复纵阵': { fp: 0.8, acc: 8, eva: 0, name: '复纵阵' },
    '轮形阵': { fp: 0.7, acc: 10, eva: 12, name: '轮形阵' },
    '梯形阵': { fp: 0.75, acc: 2, eva: 8, name: '梯形阵' },
    '单横阵': { fp: 0.6, acc: 4, eva: 10, asw: 20, name: '单横阵' }
  };

  const S1_LOSS = { LOST: 0.40, INF: 0.30, PAR: 0.20, SUP: 0.12, SURE: 0.04 };

  /* ============ 战斗对象 ============ */
  const STAT_NAMES = ['hp', 'fp', 'tp', 'aa', 'arm', 'evd', 'asw', 'los', 'lck'];

  function levelBonusVal(base, statName, lv) {
    if (statName === 'hp') return Math.floor(base * 0.15 * (lv - 1) / 98);
    return Math.floor(base * 0.55 * (lv - 1) / 98);
  }

  function buildCombatShip(cfg) {
    const { def, lv, kai, equipIds, supply, morale, isPlayer, uid } = cfg;
    const eqObjs = (equipIds || []).map(id => EquipmentData[id]).filter(Boolean);
    const slots = def.slots.map((s, i) => {
      const eq = eqObjs[i] || null;
      const planeLike = eq && (eq.slot === SLOT.FIGHTER || eq.slot === SLOT.ATTACKER || eq.slot === SLOT.BOMBER || eq.slot === SLOT.SEAPLANE);
      return { size: (def.sizes ? def.sizes[i] : 24), eq, planeAA: planeLike ? (eq.stat.aa || 0) : 0 };
    });
    const countType = t => eqObjs.filter(e => e && e.slot === t).length;
    const hasType = t => countType(t) > 0;
    const eqStat = n => eqObjs.reduce((s, e) => s + (e.stat[n] || 0), 0);
    const stats = {};
    STAT_NAMES.forEach((n, i) => {
      stats[n] = def.stats[i] + levelBonusVal(def.stats[i], n, lv) + eqStat(n);
    });
    stats.hpMax = stats.hp;
    stats.hp = Math.min(stats.hpMax, stats.hpMax);
    return {
      uid: uid || '', isPlayer, name: def.en, zh: def.zh, type: def.type, boss: !!cfg.boss,
      stats, lv, morale, ammo: supply === undefined ? 1 : supply,
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
    const ship = buildCombatShip({
      def, lv: inst.lv, kai: inst.kai,
      equipIds: inst.equipped.map(euid => st.equipment[euid] ? st.equipment[euid].id : null).filter(Boolean),
      supply: inst.supply.ammo, morale: inst.morale, isPlayer: true, uid
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
      equipIds: d.equip || [], supply: 1, morale: 50,
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
      lv: 1, morale: 50, ammo: 1, equipped: [], slots,
      range: (tpl.type === 'BB' || tpl.type === 'CV') ? 2 : (tpl.type === 'CA' ? 2 : 1),
      mainGuns: tpl.type === 'BB' || tpl.type === 'CA' ? 2 : 0,
      secondaries: 0, apShell: false, radar: false,
      hasSeaplane: false, hasTorpedo: tpl.type === 'DD' || tpl.type === 'CL' || tpl.type === 'SS',
      hasASW: false, aaCI: false, searchlight: false,
      alive: st[0] > 0, hp: st[0], dealt: 0
    };
  }

  const isSub = s => s.type === 'SS' || s.type === 'SSV';
  const isDaPo = s => s.hp > 0 && s.hp <= Math.floor(s.stats.hpMax * 0.25);

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
  function critChance(s) { return 0.12 + (s.stats.lck || 0) / 200; }

  function calcDamage(ap, arm, crit) {
    let dmg = ap - arm * 0.7;
    if (dmg <= 0) return 0;
    if (Math.random() < crit) dmg *= 1.5;
    dmg *= Util.rf(0.7, 1.3);
    return Math.max(1, Math.floor(dmg));
  }

  function hitCheck(atk, def, accExtra) {
    const defEva = def.stats.evd;
    let ch = 0.88 + (atk.lv - def.lv) * 0.004
      + (atk.morale >= 50 ? 0.10 : (atk.morale <= 30 ? -0.20 : 0))
      + accExtra / 100 - defEva * 0.0016;
    return Math.random() < Util.clamp(ch, 0.12, 0.97);
  }

  function pickTarget(enemies, atk) {
    const alive = enemies.filter(t => t.alive);
    if (!alive.length) return null;
    const nonSub = alive.filter(t => !isSub(t));
    if (nonSub.length) return Util.pick(nonSub);
    return Util.pick(alive);
  }

  function dealDamage(log, atk, def, dmg, prefix, extra) {
    if (dmg <= 0) { log.push(`${prefix}${atk.name}${extra || ''}攻击 ${def.name}，被装甲完全弹开！`); return; }
    atk.dealt += dmg;
    def.hp -= dmg;
    log.push(`${prefix}${atk.name}${extra || ''}攻击 ${def.name}，命中！造成 ${dmg} 伤害。`);
    if (def.hp <= 0 && def.alive) { def.alive = false; log.push(`${def.name} 被击沉了！`); }
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

  /* ============ 夜战特殊攻击判定 ============ */
  function resolveNightAttack(s) {
    if (!s.alive || isDaPo(s)) return null;
    if (s.stats.fp + s.stats.tp <= 0) return null;
    const eq = s.equipped.map(e => e && EquipmentData[e.id]).filter(Boolean);
    const torps = eq.filter(e => e.slot === SLOT.TORPEDO).length;
    const guns = eq.filter(e => e.slot === SLOT.SMALL_GUN || e.slot === SLOT.MED_GUN || e.slot === SLOT.BIG_GUN).length;
    if (torps >= 2) return { mult: 1.5, n: 2, name: '鱼雷Cut-in' };
    if (guns >= 1 && torps >= 1) return { mult: 1.3, n: 2, name: '主鱼Cut-in' };
    if (guns >= 2) return { mult: 1.2, n: 2, name: '夜战连击' };
    return { mult: 1.0, n: 1, name: null };
  }

  /* ============ 空袭 ============ */
  function airStrike(log, attackers, defenders, sideLabel) {
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
        t.hp -= dmg;
        if (t.hp <= 0 && t.alive) { t.alive = false; log.push(`${t.name} 被击沉了！`); }
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
    const losOk = (opts.losReq == null) || (G.fleetLos(opts.fleetIdx) >= opts.losReq);

    L(`敌军阵型：${formationB}。我军选择：${formationA}。`);
    let airSup = false;

    /* ---- 航空战 ---- */
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
        airStrike(log, sideA, sideB, '我军');
        airStrike(log, sideB, sideA, '敌军');
      } else {
        L('索敌失败！无法展开航空战。');
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
        dealDamage(log, s, t, dmg, '先制对潜！');
      } else L(`先制对潜！${s.name} 攻击 ${t.name}，未命中。`);
    }

    /* ---- 开幕雷击（SS） ---- */
    for (const s of sideA) {
      if (!s.alive || s.type !== 'SS') continue;
      const t = pickTarget(sideB, s);
      if (!t) break;
      if (Util.chance(0.7)) {
        const ap = threshold(s.stats.tp + 5, 150);
        const dmg = calcDamage(ap, t.stats.arm, critChance(s));
        dealDamage(log, s, t, dmg, '开幕雷击！');
      } else L(`开幕雷击！${s.name} 的鱼雷未命中。`);
    }

    /* ---- 交战形态 ---- */
    const eng = Util.weighted({ PARALLEL: 45, REVERSE: 25, T_ADV: 15, T_DIS: 15 });
    const engMod = ENG_MOD[eng];
    L(`交战形态：${ENGAGEMENT[eng]}！`);

    /* ---- 昼战炮击 ---- */
    const shellingTargets = s => (s.isPlayer ? sideB : sideA).filter(t => t.alive);
    const doAttack = (label, s, t, atk, accExtra, ammoMult) => {
      if (isSub(t) && !s.hasASW) { L(`${label}${s.name} 的攻击对潜水中的 ${t.name} 无效。`); return; }
      if (!hitCheck(s, t, accExtra)) { L(`${label}${s.name} 攻击 ${t.name}，未命中。`); return; }
      let ap = (s.stats.fp + 5) * fA.fp * engMod * atk.mult;
      if (ammoMult < 1) ap *= ammoMult;
      ap = threshold(ap, 180);
      const dmg = calcDamage(ap, t.stats.arm, critChance(s));
      dealDamage(log, s, t, dmg, `${label}`, atk.name ? `发动${atk.name}！` : '');
    };

    const round = (label) => {
      const pool = [...sideA.filter(s => s.alive && s.stats.fp > 0), ...sideB.filter(s => s.alive && s.stats.fp > 0)]
        .sort((a, b) => (b.range - a.range) || (a.isPlayer ? -1 : 1));
      for (const s of pool) {
        if (!s.alive) continue;
        const enemies = shellingTargets(s);
        if (!enemies.length) break;
        const atk = resolveDayAttack(s, airSup);
        if (!atk) continue;
        const ammoMult = s.ammo < 0.25 ? 0 : (s.ammo < 0.5 ? 0.5 : 1);
        if (ammoMult === 0) { L(`${label}${s.name} 弹药耗尽，无法炮击。`); continue; }
        for (let k = 0; k < atk.n; k++) {
          if (!enemies.some(t => t.alive)) break;
          const t = pickTarget(enemies, s);
          if (!t) break;
          doAttack(label, s, t, atk, s.isPlayer ? fA.acc : fB.acc, ammoMult);
        }
      }
    };

    round('');
    const hasBB = side => side.some(s => s.alive && (s.type === 'BB' || s.type === 'BBV'));
    if (hasBB(sideA) && hasBB(sideB)) {
      L('双方均保有战列舰，进入第二轮炮击战！');
      round('第二轮：');
    }

    /* ---- 昼战雷击（仅我方非SS） ---- */
    for (const s of sideA) {
      if (!s.alive || s.type === 'SS' || !s.hasTorpedo || s.stats.tp <= 0) continue;
      const t = pickTarget(sideB, s);
      if (!t) break;
      if (Util.chance(0.7)) {
        const ap = threshold(s.stats.tp + 5, 150);
        const dmg = calcDamage(ap, t.stats.arm, critChance(s));
        dealDamage(log, s, t, dmg, '雷击战！');
      } else L(`雷击战！${s.name} 的鱼雷未命中。`);
    }

    /* ---- 夜战 ---- */
    if (opts.allowNight && sideB.some(t => t.alive) && sideA.some(s => s.alive)) {
      L('—— 进入夜战！——');
      let guard = 0;
      while (sideB.some(t => t.alive) && sideA.some(s => s.alive) && guard++ < 30) {
        const order = [...sideA.filter(s => s.alive), ...sideB.filter(t => t.alive)];
        for (const s of order) {
          if (!s.alive || isDaPo(s)) continue;
          const enemies = shellingTargets(s);
          if (!enemies.length) break;
          const atk = resolveNightAttack(s);
          if (!atk) continue;
          for (let k = 0; k < atk.n; k++) {
            if (!enemies.some(t => t.alive)) break;
            const t = pickTarget(enemies, s);
            if (!t) break;
            if (isSub(t) && !s.hasASW) { L(`夜战：${s.name} 的攻击对潜水中的 ${t.name} 无效。`); continue; }
            if (Util.chance(0.72)) {
              const ap = threshold((s.stats.fp + s.stats.tp + 5) * atk.mult, 300);
              const dmg = calcDamage(ap, t.stats.arm, critChance(s) + 0.05);
              dealDamage(log, s, t, dmg, '夜战：', atk.name ? `发动${atk.name}！` : '');
            } else L(`夜战：${s.name} 攻击 ${t.name}，未命中。`);
          }
        }
      }
    } else if (opts.allowNight && sideB.some(t => t.alive)) {
      L('我军已无力再战，夜战中止。');
    }

    /* ---- 结算 ---- */
    const enAlive = sideB.filter(t => t.alive).length;
    const myLost = sideA.filter(s => !s.alive).length;
    const myDaPo = sideA.filter(s => isDaPo(s)).length;
    let rank = 'D';
    if (enAlive === 0) rank = (myLost === 0 && myDaPo === 0) ? 'S' : 'A';
    else if (enAlive <= Math.ceil(sideB.length / 2)) rank = 'B';
    else if (enAlive <= Math.ceil(sideB.length * 0.75)) rank = 'C';
    const rankLabel = { S: '完全胜利 S', A: '胜利 A', B: '战术胜利 B', C: '战术败北 C', D: '败北 D' }[rank];
    L(`战斗结束：${rankLabel}！（击沉敌舰 ${sideB.length - enAlive}/${sideB.length}）`);

    return {
      rank, log, mySide: sideA, enemySide: sideB,
      enemyKilled: sideB.length - enAlive, enemyTotal: sideB.length,
      myLost, myDaPo, victory: rank === 'S' || rank === 'A' || rank === 'B',
      mvpUid: sideA.reduce((best, s) => (s.dealt > (best.dealt || 0) ? s : best), sideA[0])
    };
  }

  return { battle, FORMATIONS, ENGAGEMENT, airState, makeEnemyShip, isDaPo };
})();

if (typeof window !== 'undefined') window.Battle = Battle;
if (typeof module !== 'undefined' && module.exports) module.exports = { Battle };
