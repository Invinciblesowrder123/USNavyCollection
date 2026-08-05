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
    if (st.sortie) return { ok: false, msg: '舰队正在出击中！' };
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
    st.sortie = { mapId, fleetIdx, node: map.start, path: [map.start], finished: false, nightDisabled: false };
    return { ok: true };
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

  /* 路线分歧：满足分支条件走分支路线，否则走其余可选节点；无分支走默认边 */
  function nextNodes(map, fromNode) {
    const def = nodeDef(map, fromNode);
    const fromEdges = map.edges.filter(e => e[0] === fromNode).map(e => e[1]);
    if (map.branch && map.branch.at === fromNode) {
      const st = GameRef().state;
      if (!st.sortie) return fromEdges;
      const c = map.branch.if || {};
      let ok = true;
      if (c.los !== undefined && GameRef().fleetLos(st.sortie.fleetIdx) < c.los) ok = false;
      if (c.dd !== undefined) {
        const dds = st.fleet[st.sortie.fleetIdx].filter(u => st.ships[u] && st.ships[u].id && ShipData[st.ships[u].id].type === 'DD').length;
        if (dds < c.dd) ok = false;
      }
      if (ok) return map.branch.to;
      /* 条件不满足：走非分支的其余路线（如 1-3 索敌不足绕 E 补给点） */
      const alt = fromEdges.filter(n => !(map.branch.to || []).includes(n));
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

    /* ---- 战斗 ---- */
    /* 进击检查：旗舰大破禁进击；阵亡舰不能出战 */
    const flag = st.ships[fleet[0]];
    if (flag && flag.hp > 0 && flag.hp <= Math.floor(G.shipDef(flag).stats[0] * 0.25)) {
      return { ok: false, msg: '旗舰大破！无法进击！' };
    }
    if (fleet.some(u => st.ships[u] && st.ships[u].hp <= 0)) {
      return { ok: false, msg: '舰队中有舰娘无法战斗，请先入渠修理！' };
    }
    /* 大破进击的僚舰将在本次战斗结束后轰沉 */
    const doomed = daPoShips();
    const enemyKey = def.enemy || 'F01';
    const enemyFleet = ENEMY_FLEETS[enemyKey];
    const isBoss = def.type === 'boss';
    const result = Battle.battle(fleet, enemyFleet.ships, formation, enemyFleet.formation, {
      allowNight: allowNight !== false,
      losReq: 0, fleetIdx: so.fleetIdx
    });

    /* 消耗：油弹（按消耗×节点系数），疲劳-15 */
    for (const uid of fleet) {
      const s = st.ships[uid];
      if (!s) continue;
      const defD = G.shipDef(s);
      const fuelCost = defD.consum.fuel * 0.35, ammoCost = defD.consum.ammo * 0.35;
      s.supply.fuel = Math.max(0, s.supply.fuel - fuelCost / (defD.consum.fuel * 4));
      s.supply.ammo = Math.max(0, s.supply.ammo - ammoCost / (defD.consum.ammo * 4));
      s.morale = Math.max(0, s.morale - 15);
    }

    /* 命中同步：战斗对象的hp写回存档 */
    for (const sideShip of result.mySide) {
      const s = st.ships[sideShip.uid];
      if (s) s.hp = Math.max(0, sideShip.hp);
    }

    /* 大破进击的僚舰轰沉 */
    for (const uid of doomed) {
      const s = st.ships[uid];
      if (!s) continue;
      result.log.push(`「${s.id}」大破进击，在战斗后轰沉了……`);
      G.destroyShip(uid);
    }

    /* 提督经验（参照wiki：道中/BOSS基础值×评价补正） */
    const admRankMult = { S: 1.0, A: 0.8, B: 0.5 }[result.rank] || 0;
    G.addAdmiralExp(Math.round((isBoss ? 20 : 10) * admRankMult));

    /* 掉落 */
    let drop = null;
    const dropTable = isBoss ? map.bossDrops : map.drops;
    if (dropTable && dropTable.length && Util.chance(isBoss ? 0.65 : 0.35)) {
      const weights = {};
      dropTable.forEach(id => weights[id] = RARITY_W[ShipData[id].rarity] || 10);
      const id = Util.weighted(weights);
      drop = G.createShip(id, 1);
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

    return { ok: true, type: isBoss ? 'boss' : 'battle', result, isBoss, drop, cleared, advance: true };
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

  /* 补给消耗速查（用于UI显示） */
  function sortieConsumption(mapId, fleetIdx) {
    const G = GameRef();
    const st = G.state;
    const map = MAPS.find(m => m.id === mapId);
    if (!map) return { fuel: 0, ammo: 0 };
    const battleNodes = Object.values(map.defs).filter(d => d.type === 'battle' || d.type === 'boss').length;
    let fuel = 0, ammo = 0;
    for (const uid of st.fleet[fleetIdx] || []) {
      const s = st.ships[uid];
      if (!s) continue;
      const d = G.shipDef(s);
      fuel += d.consum.fuel * 0.35 * battleNodes;
      ammo += d.consum.ammo * 0.35 * battleNodes;
    }
    return { fuel: Math.ceil(fuel), ammo: Math.ceil(ammo) };
  }

  return { start, advance, moveToNext, currentMap, nextNodes, atBoss, retreat, returnHome, nodeDef, sortieConsumption, daPoShips, flagshipDaPo };
})();

if (typeof window !== 'undefined') window.Sortie = Sortie;
if (typeof module !== 'undefined' && module.exports) module.exports = { Sortie };
