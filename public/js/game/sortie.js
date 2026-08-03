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
      if (s.hp <= 0) return { ok: false, msg: '舰队中有舰娘大破！' };
    }
    st.sortie = { mapId, fleetIdx, node: map.start, path: [map.start], finished: false, nightDisabled: false };
    return { ok: true };
  }

  function nodeDef(map, nodeId) { return map.defs[nodeId] || { type: 'empty' }; }

  /* 路线分歧：优先分支条件，否则默认下一节点 */
  function nextNodes(map, fromNode) {
    const def = nodeDef(map, fromNode);
    if (map.branch && map.branch.at === fromNode) {
      const st = GameRef().state;
      const c = map.branch.if || {};
      let ok = true;
      if (c.los !== undefined && GameRef().fleetLos(st.sortie.fleetIdx) < c.los) ok = false;
      if (c.dd !== undefined) {
        const dds = st.fleet[st.sortie.fleetIdx].filter(u => st.ships[u] && st.ships[u].id && ShipData[st.ships[u].id].type === 'DD').length;
        if (dds < c.dd) ok = false;
      }
      if (ok) return map.branch.to;
    }
    return map.edges.filter(e => e[0] === fromNode).map(e => e[1]);
  }

  function advance(formation, allowNight) {
    const G = GameRef();
    const st = G.state;
    const map = currentMap();
    if (!map) return { ok: false, msg: '未在出击中' };
    const so = st.sortie;
    const def = nodeDef(map, so.node);
    const fleet = st.fleet[so.fleetIdx];

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
          G.addAdmiralExp(800);
          Progression.notify('clear_map', 1, map.id);
        }
      }
    }
    Progression.notify('sortie', 1);
    if (result.victory) Progression.notify('win', 1);
    if (result.rank === 'S') Progression.notify('s_win', 1);
    Progression.notify('sink', result.enemyKilled);
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

  return { start, advance, moveToNext, currentMap, nextNodes, atBoss, retreat, returnHome, nodeDef, sortieConsumption };
})();

if (typeof window !== 'undefined') window.Sortie = Sortie;
if (typeof module !== 'undefined' && module.exports) module.exports = { Sortie };
