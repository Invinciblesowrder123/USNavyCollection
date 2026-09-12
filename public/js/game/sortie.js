'use strict';
/* ============================================================
 * 出击流程：海域导航/战斗/掉落/资源点/补给点/血条
 * ============================================================ */

const Sortie = (() => {
  const GameRef = () => (typeof window !== 'undefined') ? window.Game : require('../core/state.js').Game;
  /* battle.js 参照（浏览器为全局经典脚本；Node 下由测试注入 global） */
  const BattleRef = () => {
    if (typeof Battle !== 'undefined' && Battle) return Battle;
    if (typeof window !== 'undefined' && window.Battle) return window.Battle;
    if (typeof require === 'function') { try { return require('./battle.js').Battle; } catch (e) { /* ignore */ } }
    return null;
  };

  /* 消耗指定id的装备（舰上装备中，取出并销毁） */
  function consumeEquip(st, uid, eqId) {
    const s = st.ships[uid];
    if (!s || !Array.isArray(s.equipped)) return false;
    const idx = s.equipped.findIndex(eu => st.equipment[eu] && st.equipment[eu].id === eqId);
    if (idx < 0) return false;
    const euid = s.equipped.splice(idx, 1)[0];
    if (st.equipment[euid]) delete st.equipment[euid];
    return true;
  }

  function currentMap() {
    const st = GameRef().state;
    if (!st.sortie) return null;
    return MAPS.find(m => m.id === st.sortie.mapId);
  }

  function start(mapId, fleetIdx) {
    const G = GameRef();
    const st = G.state;
    const map = MAPS.find(m => m.id === mapId);
    if (!map) return { ok: false, msg: '海域不存在' };
    /* BOSS海域（EO）：需先击破同区域4号图（wiki：1-5 等需击破前图开放） */
    if (map.need) {
      const needMp = st.mapProgress[map.need];
      if (!needMp || !needMp.cleared) {
        return { ok: false, msg: `「${map.id}」为 BOSS 海域！需先击破 ${map.need} 才能出击！` };
      }
    }
    if (st.sortie) return { ok: false, msg: '舰队正在出击中！' };
    if (!G.isFleetUnlocked(fleetIdx)) return { ok: false, msg: '该舰队尚未解锁！' };
    const fleet = st.fleet[fleetIdx];
    if (!fleet || !fleet.length) return { ok: false, msg: '舰队为空！' };
    for (const uid of fleet) {
      const s = st.ships[uid];
      if (!s) return { ok: false, msg: '舰队中有舰娘不存在' };
      if (st.repairs.some(r => r && r.ship === uid)) return { ok: false, msg: '舰队中有舰娘正在入渠！' };
      if (st.expeditions[fleetIdx]) return { ok: false, msg: '该舰队正在远征！' };
      if (s.hp <= 0) return { ok: false, msg: '舰队中有舰娘无法战斗，请先入渠修理！' };
      if (s.supply.fuel <= 0 && s.supply.ammo <= 0) return { ok: false, msg: '舰队中有舰娘补给为零，无法出击！' };
    }
    /* 旗舰大破无法出击（僚舰大破可出击，但进击有轰沉风险） */
    const flag = st.ships[fleet[0]];
    if (flag && flag.hp > 0 && flag.hp <= Math.floor(G.shipDef(flag).stats[0] * 0.25)) {
      return { ok: false, msg: '旗舰大破！无法出击！' };
    }
    /* 油弹状态提示（wiki：弹药<50%伤害减半、0%无法炮击；每战斗点耗油弹各20%） */
    let minFuel = 1, minAmmo = 1;
    for (const uid of fleet) {
      const s = st.ships[uid];
      if (!s) continue;
      minFuel = Math.min(minFuel, s.supply.fuel);
      minAmmo = Math.min(minAmmo, s.supply.ammo);
    }
    const warn = (minFuel < 0.5 || minAmmo < 0.5)
      ? `舰队油弹不足（油${Math.round(minFuel * 100)}% 弹${Math.round(minAmmo * 100)}%）！弹药<50%伤害减半，0%无法炮击，建议先在后勤补给！`
      : null;
    /* 士气轮换提醒（方向三）：只提示不拦截（P0-2），随出击结果一并返回给 UI */
    const advice = moraleAdvice(fleetIdx);
    st.sortie = { mapId, fleetIdx, node: map.start, path: [map.start], finished: false, nightDisabled: false, daPoSeen: false };
    return { ok: true, warn, advice };
  }

  /* 当前舰队中处于大破状态的僚舰（非旗舰） */
  function daPoShips() {
    const st = GameRef().state;
    const fleet = st.sortie ? st.fleet[st.sortie.fleetIdx] : st.fleet[1];
    return (fleet || []).slice(1).filter(u => {
      const s = st.ships[u];
      return s && s.hp > 0 && s.hp <= Math.floor(GameRef().shipDef(s).stats[0] * 0.25);
    });
  }

  /* 旗舰是否大破 */
  function flagshipDaPo() {
    const st = GameRef().state;
    const fleet = st.sortie ? st.fleet[st.sortie.fleetIdx] : st.fleet[1];
    if (!fleet || !fleet.length) return false;
    const s = st.ships[fleet[0]];
    return !!(s && s.hp > 0 && s.hp <= Math.floor(GameRef().shipDef(s).stats[0] * 0.25));
  }

  function nodeDef(map, nodeId) { return map.defs[nodeId] || { type: 'empty' }; }

  /* 路线分歧：满足分支条件走分支路线，否则走其余可选节点；无分支走默认边
   * branch 支持单对象 {at, if, to} 或数组 [{at, if, to}, ...]（每个分歧点一条） */
  function nextNodes(map, fromNode) {
    const def = nodeDef(map, fromNode);
    const fromEdges = map.edges.filter(e => e[0] === fromNode).map(e => e[1]);
    const branches = map.branch ? (Array.isArray(map.branch) ? map.branch : [map.branch]) : [];
    const br = branches.find(b => b.at === fromNode);
    if (br) {
      const st = GameRef().state;
      if (!st.sortie) return fromEdges;
      const c = br.if || {};
      let ok = true;
      if (c.los !== undefined && GameRef().fleetLos(st.sortie.fleetIdx) < c.los) ok = false;
      if (c.dd !== undefined) {
        const dds = st.fleet[st.sortie.fleetIdx].filter(u => st.ships[u] && st.ships[u].id && ShipData[st.ships[u].id].type === 'DD').length;
        if (dds < c.dd) ok = false;
      }
      if (ok) return br.to;
      /* 条件不满足：走非分支的其余路线（如 1-3 索敌不足绕 E 补给点） */
      const alt = fromEdges.filter(n => !(br.to || []).includes(n));
      return alt.length ? alt : fromEdges;
    }
    return fromEdges;
  }

  function advance(formation, allowNight) {
    const G = GameRef();
    const st = G.state;
    const map = currentMap();
    if (!map) return { ok: false, msg: '未在出击中' };
    const so = st.sortie;
    const def = nodeDef(map, so.node);
    const fleet = st.fleet[so.fleetIdx];

    /* ---- 出发点/空节点：不战斗，直接前进 ---- */
    if (def.type === 'start' || def.type === 'empty') {
      return { ok: true, type: 'move', advance: true };
    }

    /* ---- 资源点 ---- */
    if (def.type === 'resource') {
      const res = Util.pick(def.reward);
      const amounts = { fuel: 60, ammo: 60, steel: 60, baux: 30 };
      G.gain({ [res]: amounts[res] });
      return { ok: true, type: 'resource', res, amount: amounts[res], advance: true };
    }
    /* ---- 补给点 ---- */
    if (def.type === 'supply') {
      for (const uid of fleet) {
        const s = st.ships[uid];
        if (s) { s.supply.fuel = Math.min(1, s.supply.fuel + 0.5); s.supply.ammo = Math.min(1, s.supply.ammo + 0.5); }
      }
      return { ok: true, type: 'supply', advance: true };
    }

    /* ---- 漩涡（穿越风暴/洋流区域，油耗增加）：只扣燃料，双封顶，电探减半 ---- */
    if (def.type === 'whirlpool') {
      const lossBase = def.lossBase || 200;
      const hasRadar = fleet.some(uid => {
        const s = st.ships[uid];
        return s && (s.equipped || []).some(eu => {
          const inst = st.equipment[eu];
          const ed = inst && EquipmentData[inst.id];
          return ed && ed.slot === SLOT.RADAR;
        });
      });
      let loss = Math.min(lossBase, Math.floor(st.resources.fuel * 0.1));
      if (hasRadar) loss = Math.floor(loss / 2);
      if (loss > 0) G.gain({ fuel: -loss });
      return { ok: true, type: 'whirlpool', res: 'fuel', amount: loss, radar: hasRadar, advance: true };
    }

    /* ---- 战斗（分两段流程：昼战 → 追击选择 → 夜战；UI 可走 prepareBattle→continueNight→settleBattle） ---- */
    const prep = prepareBattle(formation);
    if (!prep.ok) return prep;
    if (allowNight !== false) continueNight(prep);
    return settleBattle(prep);
  }

  /* 昼战阶段（不结算）：执行进击检查并只进行昼战，返回 { ok, type, result, isBoss, doomed }，
   * 由 UI 在「追击选择」（wiki 战斗流程：战斗结束/夜战突入）后调用 settleBattle 统一结算 */
  function prepareBattle(formation) {
    const G = GameRef();
    const st = G.state;
    const map = currentMap();
    if (!map) return { ok: false, msg: '未在出击中' };
    const so = st.sortie;
    const def = nodeDef(map, so.node);
    const fleet = st.fleet[so.fleetIdx];

    /* 进击检查：旗舰大破禁进击；阵亡舰不能出战 */
    const flag = st.ships[fleet[0]];
    if (flag && flag.hp > 0 && flag.hp <= Math.floor(G.shipDef(flag).stats[0] * 0.25)) {
      return { ok: false, msg: '旗舰大破！无法进击！' };
    }
    if (fleet.some(u => st.ships[u] && st.ships[u].hp <= 0)) {
      return { ok: false, msg: '舰队中有舰娘无法战斗，请先入渠修理！' };
    }
    /* 大破进击的僚舰将在本次战斗结束后轰沉（开战前快照） */
    const doomed = daPoShips();
    /* 洋上补给（消耗品）：舰队油弹未满时自动发动，油弹恢复到100%并消耗1个 */
    let oilerUsed = false;
    for (const uid of fleet) {
      const s = st.ships[uid];
      if (!s || (s.supply.fuel >= 1 && s.supply.ammo >= 1)) continue;
      if (consumeEquip(st, uid, 'supply_oiler')) {
        s.supply.fuel = 1;
        s.supply.ammo = 1;
        oilerUsed = true;
        break;
      }
    }
    const enemyKey = def.enemy || 'F01';
    const enemyFleet = ENEMY_FLEETS[enemyKey];
    const isBoss = def.type === 'boss';
    const result = Battle.battle(fleet, enemyFleet.ships, formation, enemyFleet.formation, {
      allowNight: false, fleetIdx: so.fleetIdx,
      sub: def.mode === 'sub',            // 潜艇点：敌潜艇速力打击修正 + 60% 耐久封顶
      nightOnly: def.mode === 'night',    // 夜战点：跳过昼战直接夜战
      airMode: def.mode === 'air'         // 航空战点：无航空战力时进入被动防空分支（单次轰炸伤害封顶 60%）
    });
    if (oilerUsed) result.log.unshift('「洋上补给」发动！舰队油弹恢复到100%。');
    return { ok: true, type: isBoss ? 'boss' : 'battle', result, isBoss, doomed };
  }

  /* 夜战突入：在昼战结果上追加夜战并重新结算（消耗弹药30%，参照wiki） */
  function continueNight(prep) {
    prep.result = Battle.battleNight(prep.result);
    return prep;
  }

  /* 舰队士气摘要（编成 / 出击 / 母港共用同一份统计，避免三处各写一套） */
  function fleetMorale(fleetIdx) {
    const st = GameRef().state;
    const B = BattleRef();
    const uids = st.fleet[fleetIdx] || [];
    const counts = { flash: 0, normal: 0, low: 0, red: 0 };
    const byTier = { flash: [], normal: [], low: [], red: [] };
    let sum = 0, n = 0;
    for (const uid of uids) {
      const s = st.ships[uid];
      if (!s) continue;
      const t = B ? B.moraleTier(s.morale) : { key: 'normal', name: '正常' };
      counts[t.key] = (counts[t.key] || 0) + 1;
      (byTier[t.key] = byTier[t.key] || []).push(s);
      sum += s.morale || 0;
      n++;
    }
    const fmt = list => list.map(s => (ShipData[s.id] && ShipData[s.id].zh) || s.id);
    return {
      count: n,
      avg: n ? Math.round(sum / n) : 0,
      counts,
      tiers: B ? B.MORALE_TIERS : [],
      flashNames: fmt(byTier.flash || []),
      lowNames: fmt(byTier.low || []),
      redNames: fmt(byTier.red || []),
      hasRed: (counts.red || 0) > 0,
      hasLow: (counts.low || 0) > 0
    };
  }

  /* 出击前轮换提醒（P0-2：必须把真实出路写清楚 —— 母港静置士气每 tick +3，到 53 即为「闪」）
   * 触发条件：任一舰红脸（<30，命中 −50%）或平均士气 <40（偏低区间，再打一场即跌入红脸） */
  function moraleAdvice(fleetIdx) {
    const m = fleetMorale(fleetIdx);
    if (!m.count) return null;
    if (!m.hasRed && m.avg >= 40) return null;
    const cause = m.hasRed
      ? `当前编队 ${m.counts.red} 艘处于红脸（${m.redNames.join('、')}），命中 −50%`
      : `舰队平均士气 ${m.avg} 已进入偏低区间，再出击一场将跌入红脸`;
    return {
      level: m.hasRed ? 'red' : 'low',
      text: `${cause}。建议轮换另一支舰队，或回港休整片刻——母港静置时士气每 30 秒 +3，恢复到 53 即为「闪」（命中 ×1.2 / 回避 ×1.8）。`
    };
  }

  /* ============ 失败归因（P0-5：结算要说清主要失败来源 + 一个可执行改进方向） ============
   * 纯函数：输入 结算结果 / 节点定义 / 参战舰队 / 存档，输出归因行数组；不接触 DOM，便于自动化断言。
   * 只在败局时输出；每条归因必须对应真实发生过的失败原因（防误报）。 */
  function attributionLines(ctx) {
    const { result, nodeDef, fleet, st } = ctx;
    const out = [];
    if (!result || (result.victory && result.rank !== 'D')) return out;
    const def = nodeDef || {};
    const ships = fleet || [];
    /* 1) 特殊节点（既有） */
    if (def.mode === 'sub') {
      const noAsw = !ships.some(uid => {
        const s = st.ships[uid];
        if (!s) return false;
        const ty = ShipData[s.id] && ShipData[s.id].type;
        return ty === 'DD' || ty === 'CL' || ty === 'DE';
      });
      out.push(noAsw
        ? '舰队缺乏对潜攻击手段，无法打击深海潜艇。（驱逐舰与轻巡洋舰具备对潜能力）'
        : '反潜战斗失利。深水炸弹与对潜声呐可强化驱逐舰的反潜输出。');
    } else if (def.mode === 'night') {
      out.push('夜战不利。驱逐舰与轻巡洋舰的鱼雷与夜战装备是夜战的王牌。');
    } else if (def.mode === 'air') {
      /* 航空战点（批次1）：先区分「根本没展开航空战」与「展开了但制空不足」——防误报（坑 #12）
       * 归因文案按「是否编入航母」再分两种，与节点横幅文案表同源 */
      const hasCV = ships.some(uid => {
        const s = st.ships[uid];
        if (!s) return false;
        const ty = ShipData[s.id] && ShipData[s.id].type;
        return ty === 'CV' || ty === 'CVL' || ty === 'CVB';
      });
      if (result.airWing === false) {
        out.push(hasCV
          ? '航空母舰未搭载舰载机，无法展开航空战。敌机轰击毫无遮蔽的舰队。（为航母搭载舰战或舰攻即可展开航空战）'
          : '失去制空权。敌机轰击毫无遮蔽的舰队。（编入航空母舰并搭载舰战可夺取制空）');
      }
    }
    /* 2) 制空不足/丧失（我方确实展开了航空战但未取得优势）
     *    被动防空（airWing=false）已在上面单独归因，此处不再重复（防重复归因） */
    if (result.airWing !== false && result.enAir > 0 && result.airSup === false && (result.myAir > 0 || result.airKey === 'LOST')) {
      out.push(`制空不足：我军制空 ${result.myAir} 对敌 ${result.enAir}，未能取得航空优势，昼战特殊攻击全部无法发动。`
        + '改进方向：编入更多舰战，或提高舰载机搭载。');
    }
    /* 3) 索敌失败（无法参加航空战、命中与回避下降）；夜战节点无索敌阶段，recon 为 null 不触发 */
    if (result.recon === false) {
      out.push('索敌失败：舰队无法参加航空战，命中与回避下降。'
        + '改进方向：提高舰队索敌值（水侦、电探、舰载机均可提升索敌）。');
    }
    /* 4) 士气：参战舰中有红脸（命中减半）——只在真的有红脸舰时输出（防误报） */
    {
      const B = BattleRef();
      const red = ships
        .map(uid => st.ships[uid])
        .filter(s => s && B && B.moraleTier(s.morale).key === 'red');
      if (red.length) {
        const names = red.map(s => (ShipData[s.id] && ShipData[s.id].zh) || s.id).join('、');
        out.push(`本场 ${red.length} 艘处于红脸（${names}），命中减半是失败原因之一。`
          + '改进方向：轮换另一支舰队，或回母港休整（静置时士气每 30 秒 +3）到「闪」后再战。');
      }
    }
    return out;
  }

  /* ============ 海域作战目标（方向四）============
   * checkObjectives 是**纯函数**：只读入参、只返回判定结果，不写任何状态、不改战斗逻辑。
   * 判定只在 BOSS 节点进行（道中评价/大破经由 sortie.daPoSeen 汇总，口径是"整次出击"）。
   * 设计红线：每个目标都必须**迫使玩家改变编成**；不做"不进入夜战"这类纯操作型目标；
   * 全项目目标数 ≤15，且不做全清奖励（防清单化）。 */
  function objectiveMet(o, ctx) {
    const def = ctx.nodeDef || {};
    if (def.type !== 'boss') return false;          // 只在 BOSS 判定
    if (o.type === 'sRank') return ctx.result.rank === 'S';
    if (o.type === 'noHeavy') return !ctx.daPoSeen;
    if (o.type === 'typeLimit') {
      const have = (ctx.fleetTypes || []).filter(t => (o.types || []).includes(t)).length;
      return have >= (o.min || 1);
    }
    return false;
  }
  /* 条件文本：必须是玩家能**自己核对**的条件（4.3） */
  function objectiveCondText(o) {
    if (o.type === 'sRank') return '以 S 胜击破本图 BOSS';
    if (o.type === 'noHeavy') return '整次出击中不出现大破（含道中）';
    if (o.type === 'typeLimit') return `编成含 ≥${o.min || 1} 艘${(o.types || []).map(t => SHIP_TYPE_ZH[t] || t).join('/')}`;
    return o.desc || '';
  }
  /* 纯函数判定：返回本场（BOSS 战）各目标的达成情况 */
  function checkObjectives(map, ctx) {
    const list = (map && Array.isArray(map.objectives)) ? map.objectives : [];
    if (!list.length) return [];
    return list.map(o => ({
      id: o.id, type: o.type,
      desc: o.desc || objectiveCondText(o),
      cond: objectiveCondText(o),
      reward: o.reward || null,
      ok: objectiveMet(o, ctx),
      preCheckable: o.type === 'typeLimit'
    }));
  }
  /* 出击前预览：能算的算出来（限定舰种），算不出的标注"战斗中达成" —— 不替玩家做决定 */
  function objectivePreview(map, fleetIdx) {
    const st = GameRef().state;
    const list = (map && Array.isArray(map.objectives)) ? map.objectives : [];
    if (!list.length) return [];
    const types = (st.fleet[fleetIdx] || [])
      .map(u => st.ships[u] && ShipData[st.ships[u].id] && ShipData[st.ships[u].id].type).filter(Boolean);
    return list.map(o => {
      const row = {
        id: o.id, type: o.type, cond: objectiveCondText(o), desc: o.desc || '',
        reward: o.reward || null,
        done: !!(st.stats.objectives && st.stats.objectives[o.id]),
        pre: null
      };
      if (o.type === 'typeLimit') {
        const have = types.filter(t => (o.types || []).includes(t)).length;
        row.pre = { ok: have >= (o.min || 1), now: `当前 ${have} 艘` };
      }
      return row;
    });
  }
  const OBJ_RES_ZH = { fuel: '燃料', ammo: '弹药', steel: '钢材', baux: '铝土', screws: '改修资材', devMats: '开发资材' };
  function rewardText(r) {
    if (!r) return '';
    return Object.keys(r).filter(k => OBJ_RES_ZH[k]).map(k => `${OBJ_RES_ZH[k]}+${r[k]}`).join(' ');
  }

  /* 战斗结算：油弹/疲劳消耗、hp写回、大破进击轰沉、提督经验、掉落、血条、统计 */
  function settleBattle(prep) {
    const G = GameRef();
    const st = G.state;
    const map = currentMap();
    if (!map) return { ok: false, msg: '未在出击中' };
    const so = st.sortie;
    const def = nodeDef(map, so.node);
    const fleet = st.fleet[so.fleetIdx];
    const result = prep.result;
    const isBoss = prep.isBoss;

    /* 消耗：油弹（wiki：普通战斗点 油20%/弹20%，进入夜战 弹30%；节点可覆写 cost，如 1-5 反潜点 油8%/弹0），疲劳-15 */
    let ammoZero = false;
    const cost = def.cost || null;
    for (const uid of fleet) {
      const s = st.ships[uid];
      if (!s) continue;
      s.supply.fuel = Math.max(0, s.supply.fuel - (cost ? cost.fuel : 0.2));
      s.supply.ammo = Math.max(0, s.supply.ammo - (cost ? cost.ammo : (result.nightUsed ? 0.3 : 0.2)));
      s.morale = Math.max(0, s.morale - 15);
      if (s.supply.ammo <= 0) ammoZero = true;
    }
    if (ammoZero) {
      result.log.push('舰队弹药已耗尽！返回母港后请及时补给，否则舰娘将无法炮击。');
    }

    /* 命中同步：战斗对象的hp写回存档 */
    for (const sideShip of result.mySide) {
      const s = st.ships[sideShip.uid];
      if (s) s.hp = Math.max(0, sideShip.hp);
    }

    /* 消耗品结算（wiki：应急修理要员在发动后消耗；战斗粮食在进入夜战时消耗） */
    for (const sideShip of result.mySide) {
      if (!sideShip.isPlayer || !sideShip.uid || !sideShip.dcUsed) continue;
      if (consumeEquip(st, sideShip.uid, 'dc_team')) {
        result.log.push(`「${sideShip.name}」的应急修理要员已消耗。`);
      }
    }
    if (result.nightUsed) {
      for (const uid of fleet) {
        if (consumeEquip(st, uid, 'rations')) {
          result.log.push('舰队消耗了战斗粮食。');
          break;
        }
      }
    }

    /* 大破进击的僚舰轰沉 */
    for (const uid of prep.doomed) {
      const s = st.ships[uid];
      if (!s) continue;
      result.log.push(`「${s.id}」大破进击，在战斗后轰沉了……`);
      G.destroyShip(uid);
    }

    /* 提督经验（参照wiki「提督经验值·出击」：海域S值×评价补正）
     * 道中：S x1.0 / A x0.8 / B x0.5 / C·D·E x0
     * BOSS：S = BOSS_S；A = BOSS_S - 道中S x0.5；B = BOSS_S - 道中S x0.8；C = 道中S；D·E x0 */
    const admExp = map.admExp || { node: 10, boss: 20 };
    const nodeS = admExp.node, bossS = admExp.boss;
    let admGain = 0;
    if (isBoss) {
      if (result.rank === 'S') admGain = bossS;
      else if (result.rank === 'A') admGain = bossS - nodeS * 0.5;
      else if (result.rank === 'B') admGain = bossS - nodeS * 0.8;
      else if (result.rank === 'C') admGain = nodeS;
    } else {
      admGain = { S: 1.0, A: 0.8, B: 0.5 }[result.rank] * nodeS || 0;
    }
    admGain = Math.round(admGain);
    if (admGain > 0) G.addAdmiralExp(admGain);

    /* 掉落（掉落舰自带默认装备直接装备在舰上，不占仓库闲置容量） */
    let drop = null;
    const dropTable = isBoss ? map.bossDrops : map.drops;
    if (dropTable && dropTable.length && Util.chance(isBoss ? 0.65 : 0.35)) {
      const weights = {};
      dropTable.forEach(id => weights[id] = RARITY_W[ShipData[id].rarity] || 10);
      const id = Util.weighted(weights);
      drop = G.createShip(id, 1);
      G.equipDefaults(drop.uid);   // 掉落舰船自带默认装备
    }

    /* 血条与进度 */
    let cleared = false;
    if (isBoss && result.victory && result.rank !== 'D') {
      const mp = st.mapProgress[map.id];
      if (mp) {
        mp.gauge -= 1;
        mp.kills++;
        if (result.rank === 'S') {
          st.stats.bossSWin[map.id] = (st.stats.bossSWin[map.id] || 0) + 1;
          Progression.notify('boss_s_win', 1, map.id);
        }
        if (mp.gauge <= 0 && !mp.cleared) {
          mp.cleared = true;
          cleared = true;
          G.addAdmiralExp(100);
          Progression.notify('clear_map', 1, map.id);
        }
      }
    }
    /* 战斗进度统计（任务进度由 Progression.applyBattleResult 统一通知，避免双计） */
    st.stats.sortie++;
    if (result.victory) st.stats.win++;
    if (result.rank === 'S') st.stats.sWin++;
    st.stats.sink += result.enemyKilled;

    /* 失败归因（P0-5：失败结算要说清原因并指出改进路径；纯函数便于断言） */
    for (const line of attributionLines({ result, nodeDef: def, fleet, st })) result.log.push(line);

    /* 作战目标（方向四）：只做判定 + 一次性奖励 + 战报说明，**不改动上面任何结算数值** */
    const daPoNow = !!so.daPoSeen || (result.myDaPo || 0) > 0;
    const objResults = checkObjectives(map, {
      nodeDef: def, result, daPoSeen: daPoNow,
      fleetTypes: fleet.map(u => st.ships[u] && ShipData[st.ships[u].id] && ShipData[st.ships[u].id].type).filter(Boolean)
    });
    if (daPoNow) so.daPoSeen = true;
    const objRewards = objResults.length ? Progression.grantObjectiveRewards(objResults) : [];
    for (const o of objResults) {
      const got = o.ok && objRewards.includes(o.id);
      result.log.push(`作战目标「${o.cond}」：${o.ok ? '达成' : '未达成'}${got ? `（一次性奖励 ${rewardText(o.reward)}）` : (o.ok ? '（奖励此前已发放）' : '')}`);
    }

    /* 舰历与荣誉（方向二）：出击路径的唯一写入点（含夜战追加后的二次结算，仍只写一次） */
    const enFlag = result.enemySide && result.enemySide[0];
    const flagSunk = !!(enFlag && !enFlag.alive);
    const honorOut = Progression.recordBattleResult({
      uids: fleet.slice(),
      kind: 'sortie',
      rank: result.rank,
      perfect: !!result.perfect,
      taiha: (result.myDaPo || 0) > 0,
      failed: !result.victory,
      mvpUid: result.mvpUid || null,
      mapId: map.id,
      firstClear: !!cleared,          // 首次通关只写一次（recordBattleResult 内部再判一次）
      nodeMode: def.mode || null,
      airKey: result.airKey || null,
      /* 「斩首」只认 BOSS 节点或 5 舰以上的敌方编成，避免"打沉一艘驱逐就叫斩首" */
      bossSunk: flagSunk && (isBoss || (result.enemyTotal || 0) >= 5),
      bossName: flagSunk ? (enFlag.zh || enFlag.name || '') : '',
      objectives: objResults.filter(o => o.ok).map(o => o.id)
    });
    /* 战报自动追加：本场 MVP / 斩杀者 / 新获得荣誉（方向二 3.4） */
    if (result.mvpUid && st.ships[result.mvpUid]) {
      const mv = st.ships[result.mvpUid];
      result.log.push(`本场 MVP：${(ShipData[mv.id] && ShipData[mv.id].zh) || mv.id}（获得经验 ×2）`);
    }
    if (flagSunk && enFlag) {
      result.log.push(`斩杀：击沉敌方旗舰「${enFlag.zh || enFlag.name}」。`);
    }
    if (honorOut && honorOut.granted.length) {
      const seen = new Set();
      const parts = [];
      for (const g of honorOut.granted) {
        if (seen.has(g.id)) continue;
        seen.add(g.id);
        const h = Progression.HONOR_BY_ID[g.id];
        if (h) parts.push(h.name);
      }
      const names = [...new Set(honorOut.granted.map(g => {
        const s = st.ships[g.uid];
        return (s && ShipData[s.id] && ShipData[s.id].zh) || g.uid;
      }))];
      if (parts.length) result.log.push(`新获得荣誉：${parts.join('、')}（${names.join('、')}）`);
    }

    return { ok: true, type: isBoss ? 'boss' : 'battle', result, isBoss, drop, cleared, advance: true, admExp: admGain, honors: honorOut };
  }

  /* ============ 出击前情报室（方向一） ============
   * 把「编成能力 / 海域威胁维度 / 特殊攻击可发动清单」集中在这里算，UI 只负责渲染（规范 P2-2）。
   * 所有能力值一律来自 Battle.fleetStats 与 Battle.specialAttackReport —— 与战斗实际判定同源，
   * UI 里不得再写第二套算法（禁止事项 6）。 */
  const THREAT_INFO = {
    air: { name: '制空' },
    los: { name: '索敌' },
    asw: { name: '对潜' },
    night: { name: '夜战火力' },
    radar: { name: '电探·燃料' }
  };
  const THREAT_KEYS = Object.keys(THREAT_INFO);

  /* ============ 节点进入横幅文案（设计稿 §5.2；统一文案表，不逐海域硬编码）============
   * 航空战点分三种：有航空战力（航母对决）/ 无航母 / 有航母但未搭载舰载机——
   * 三者文案必须可区分（坑 #12：归因误报是本项目最易出的一类 bug）。
   * 覆盖度断言见 scripts/simulate.js（全部已使用的 mode 值都必须有非空文案）。 */
  const NODE_BANNER = {
    night: '日落。照明弹升起，敌水雷战队在黑暗中逼近。',
    sub: '声呐捕捉到水下异响——深海潜艇，伏击阵位。',
    air: '桅顶瞭望：机群临空。这是航母之间的战斗。',
    airNoWing: '舰队没有航空母舰。全舰队，对空战斗配置——',
    airNoPlanes: '航空母舰未搭载舰载机。全舰队，对空战斗配置——',
    whirlpool: '罗盘开始打转。洋流正在拖拽舰队。'
  };
  /* 取本节点进入横幅；ctx.airWing / ctx.hasCarrier 一律来自 Battle.fleetStats（UI 不得另算） */
  function nodeBanner(def, ctx = {}) {
    if (!def) return '';
    if (def.mode === 'night') return NODE_BANNER.night;
    if (def.mode === 'sub') return NODE_BANNER.sub;
    if (def.mode === 'air') {
      if (ctx.airWing) return NODE_BANNER.air;
      return ctx.hasCarrier ? NODE_BANNER.airNoPlanes : NODE_BANNER.airNoWing;
    }
    if (def.type === 'whirlpool') return NODE_BANNER.whirlpool;
    return '';
  }
  /* 全海域实际用到的节点 mode（含 type:'whirlpool'）—— 供文案覆盖度断言使用 */
  function usedNodeModes() {
    const s = new Set();
    for (const m of MAPS) for (const d of Object.values(m.defs || {})) {
      if (d.mode) s.add(d.mode);
      if (d.type === 'whirlpool') s.add('whirlpool');
    }
    return [...s];
  }

  /* 海域分支索敌需求（无索敌分支返回 0） */
  function requiredLos(map) {
    const brs = map.branch ? (Array.isArray(map.branch) ? map.branch : [map.branch]) : [];
    return brs.reduce((mx, b) => Math.max(mx, ((b && b.if) || {}).los || 0), 0);
  }
  /* 舰队是否装备电探（SLOT.RADAR） */
  function fleetHasRadar(fleetIdx) {
    const st = GameRef().state;
    return (st.fleet[fleetIdx] || []).some(uid => {
      const s = st.ships[uid];
      if (!s) return false;
      return (s.equipped || []).some(eu => {
        const inst = st.equipment[eu];
        const ed = inst && EquipmentData[inst.id];
        return ed && ed.slot === SLOT.RADAR;
      });
    });
  }
  /* 舰队是否含对潜舰种（驱逐/轻巡/海防/潜艇母舰） */
  function fleetHasAswShip(fleetIdx) {
    const st = GameRef().state;
    return (st.fleet[fleetIdx] || []).some(uid => {
      const s = st.ships[uid];
      if (!s) return false;
      const ty = ShipData[s.id] && ShipData[s.id].type;
      return ty === 'DD' || ty === 'CL' || ty === 'DE' || ty === 'AS';
    });
  }
  /* 该图是否含航空战点（mode:'air'） */
  function mapHasAirNode(map) {
    return Object.values((map && map.defs) || {}).some(d => d.mode === 'air');
  }

  /* 海域威胁维度对位判定：只对该图声明的维度返回结果（未声明维度的海域返回空数组，UI 不显示该区块） */
  function threatCheck(fleetIdx, map, stats) {
    const dims = (Array.isArray(map.threat) ? map.threat : []).filter(k => THREAT_INFO[k]);
    if (!dims.length) return [];
    const G = GameRef();
    const s = stats || BattleRef().fleetStats(fleetIdx);
    const los = G.fleetLos(fleetIdx);
    const losNeed = requiredLos(map);
    const hasRadar = fleetHasRadar(fleetIdx);
    const out = [];
    for (const k of dims) {
      if (k === 'air') {
        /* 航空战点（mode:'air'）：判据用「是否有航空战力」（空母系 + 舰载机），
         * 而非单纯的制空值——有航母但没带舰战的情况制空为 0，却仍能展开航空战（坑 #12 情形③） */
        const airNode = mapHasAirNode(map);
        const ok = airNode ? !!s.airWing : s.air > 0;
        const detail = ok
          ? (s.air > 0 ? `制空 ${s.air}（可争夺制空权）` : '有航母但未搭载舰战：制空 0，可展开航空战但无法争夺制空权')
          : '制空 0：舰队没有航空母舰或未搭载舰载机，该图含航空战点，将只能以对空炮火被动迎击敌机轰炸（建议编入航母并搭载舰战）';
        out.push({ key: k, name: THREAT_INFO[k].name, ok, detail });
      } else if (k === 'los') {
        out.push({ key: k, name: THREAT_INFO[k].name, ok: losNeed === 0 || los >= losNeed,
          detail: losNeed ? `需求 ≥${losNeed}（当前 ${los}）` : `当前 ${los}` });
      } else if (k === 'asw') {
        out.push({ key: k, name: THREAT_INFO[k].name, ok: fleetHasAswShip(fleetIdx),
          detail: `对潜 ${s.asw}：该图有潜艇伏击点，建议编入驱逐舰或轻巡洋舰` });
      } else if (k === 'night') {
        out.push({ key: k, name: THREAT_INFO[k].name, ok: s.night > 0,
          detail: `夜战火力 ${s.night}：该图有夜战节点，需要火力+雷装的舰艇` });
      } else if (k === 'radar') {
        out.push({ key: k, name: THREAT_INFO[k].name, ok: hasRadar,
          detail: hasRadar ? '已装备电探：异常洋流燃料损失减半' : '未装备电探：该图有异常洋流，燃料损失不会减半（建议编入电探）' });
      }
    }
    return out;
  }

  /* 出击前情报汇总：舰队能力 + 威胁对位 + 特殊攻击清单 */
  function intel(fleetIdx, mapId) {
    const G = GameRef();
    const B = BattleRef();
    const map = MAPS.find(m => m.id === mapId);
    if (!map || !B) return null;
    const stats = B.fleetStats(fleetIdx);
    const speed = G.fleetSpeed(fleetIdx);
    /* 对手制空：取该图所有战斗/BOSS节点中最高的敌制空（保守估计，用于判断能否取得航空优势） */
    let enemyAir = 0;
    for (const d of Object.values(map.defs || {})) {
      if ((d.type === 'battle' || d.type === 'boss') && d.enemy) {
        enemyAir = Math.max(enemyAir, B.enemyAirPower(d.enemy));
      }
    }
    const airSup = B.hasAirSuperiority(stats.air, enemyAir);
    const morale = fleetMorale(fleetIdx);
    /* 航向侦察（方向五）：只说明玩家可见的两个条件，不承诺结果 */
    const reconGuide = {
      carried: !!stats.reconPlane,
      detail: stats.reconPlane
        ? '已携带舰侦：索敌成功时「T字不利」概率由 10% 降至 5%'
        : '未携带舰侦：「T字不利」概率 10%。舰侦（SBD VS-2，开发·空母系）在索敌成功时可把它降到 5%（占用舰战槽）'
    };
    return {
      mapId: map.id,
      stats: {
        air: stats.air, los: G.fleetLos(fleetIdx), asw: stats.asw, aswCapable: stats.aswCapable,
        night: stats.night, speed
      },
      /* 航空线（批次1）：航空战力状态 —— 一律来自 Battle.fleetStats（同源，UI 不得另算） */
      air: {
        node: mapHasAirNode(map),
        airWing: !!stats.airWing,
        carriers: stats.carriers || 0,
        carrierNames: stats.carrierNames || [],
        banner: nodeBanner(Sortie_nodeDefOf(map), { airWing: stats.airWing, hasCarrier: (stats.carriers || 0) > 0 })
      },
      enemyAir, airSup,
      morale,
      moraleAdvice: moraleAdvice(fleetIdx),
      reconGuide,
      threats: threatCheck(fleetIdx, map, stats),
      specials: B.specialAttackReport(fleetIdx, { airSup, myAir: stats.air, enAir: enemyAir })
    };
  }
  /* 该图「含航空战节点」时的节点定义（供情报室取横幅文案；无则返回空对象） */
  function Sortie_nodeDefOf(map) {
    for (const [nid, d] of Object.entries((map && map.defs) || {})) {
      if (d.mode === 'air') return Object.assign({ _node: nid }, d);
    }
    return {};
  }

  /* 战斗结束后移动到下一节点 */
  function moveToNext() {
    const st = GameRef().state;
    const map = currentMap();
    if (!map) return null;
    const next = nextNodes(map, st.sortie.node);
    if (next && next.length) {
      st.sortie.node = next[0];
      st.sortie.path.push(next[0]);
      return next[0];
    }
    return null;
  }

  function atBoss() {
    const map = currentMap();
    return map && map.boss === GameRef().state.sortie.node;
  }

  function retreat() {
    const st = GameRef().state;
    if (!st.sortie) return;
    st.sortie.finished = true;
    st.sortie.retreated = true;
    returnHome();
  }

  function returnHome() {
    const st = GameRef().state;
    if (!st.sortie) return;
    st.sortie = null;
  }

  /* 补给消耗速查（用于UI显示）：按节点 cost 计算（默认战斗点 油20%/弹20%，1-5 反潜点 油8%/弹0） */
  function sortieConsumption(mapId, fleetIdx) {
    const G = GameRef();
    const st = G.state;
    const map = MAPS.find(m => m.id === mapId);
    if (!map) return { fuel: 0, ammo: 0 };
    let fuel = 0, ammo = 0;
    for (const uid of st.fleet[fleetIdx] || []) {
      const s = st.ships[uid];
      if (!s) continue;
      const d = G.shipDef(s);
      /* wiki：每个战斗点 油20%/弹20%（满补给=消耗值×4）；节点 cost 可覆写 */
      let f = 0, a = 0;
      for (const def of Object.values(map.defs)) {
        if (def.type === 'battle' || def.type === 'boss') {
          const c = def.cost || null;
          f += d.consum.fuel * (c ? c.fuel : 0.2) * 4;
          a += d.consum.ammo * (c ? c.ammo : 0.2) * 4;
        }
      }
      fuel += f; ammo += a;
    }
    return { fuel: Math.ceil(fuel), ammo: Math.ceil(ammo) };
  }

  return {
    start, advance, prepareBattle, continueNight, settleBattle, moveToNext, currentMap, nextNodes,
    atBoss, retreat, returnHome, nodeDef, sortieConsumption, daPoShips, flagshipDaPo,
    /* 出击前情报室（方向一）+ 失败归因 */
    intel, threatCheck, requiredLos, fleetHasRadar, fleetHasAswShip, attributionLines,
    THREAT_INFO, THREAT_KEYS,
    /* 节点进入横幅文案表（批次1：航空战点三种边界的文案必须可区分） */
    NODE_BANNER, nodeBanner, usedNodeModes, mapHasAirNode,
    /* 海域作战目标（方向四） */
    checkObjectives, objectiveCondText, objectivePreview, objectiveMet, rewardText,
    /* 士气（方向三） */
    fleetMorale, moraleAdvice
  };
})();

if (typeof window !== 'undefined') window.Sortie = Sortie;
if (typeof module !== 'undefined' && module.exports) module.exports = { Sortie };
