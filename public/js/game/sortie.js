'use strict';
/* ============================================================
 * 出击流程：海域导航/战斗/掉落/资源点/补给点/血条
 * ============================================================ */

const Sortie = (() => {
  const GameRef = () => (typeof window !== 'undefined') ? window.Game : require('../core/state.js').Game;

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
    st.sortie = { mapId, fleetIdx, node: map.start, path: [map.start], finished: false, nightDisabled: false };
    return { ok: true, warn };
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
    const enemyKey = def.enemy || 'F01';
    const enemyFleet = ENEMY_FLEETS[enemyKey];
    const isBoss = def.type === 'boss';
    const result = Battle.battle(fleet, enemyFleet.ships, formation, enemyFleet.formation, {
      allowNight: false, losReq: 0, fleetIdx: so.fleetIdx
    });
    return { ok: true, type: isBoss ? 'boss' : 'battle', result, isBoss, doomed };
  }

  /* 夜战突入：在昼战结果上追加夜战并重新结算（消耗弹药30%，参照wiki） */
  function continueNight(prep) {
    prep.result = Battle.battleNight(prep.result);
    return prep;
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

    /* 掉落 */
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

    return { ok: true, type: isBoss ? 'boss' : 'battle', result, isBoss, drop, cleared, advance: true, admExp: admGain };
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

  return { start, advance, prepareBattle, continueNight, settleBattle, moveToNext, currentMap, nextNodes, atBoss, retreat, returnHome, nodeDef, sortieConsumption, daPoShips, flagshipDaPo };
})();

if (typeof window !== 'undefined') window.Sortie = Sortie;
if (typeof module !== 'undefined' && module.exports) module.exports = { Sortie };
