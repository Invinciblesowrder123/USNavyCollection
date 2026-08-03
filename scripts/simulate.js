'use strict';
/* ============================================================
 * Headless 模拟测试：验证引擎无崩溃、数值合理
 * 用法: npm run sim
 * ============================================================ */

/* ---- 注入全局命名空间（模拟浏览器经典脚本环境） ---- */
const equipMod = require('../public/js/data/equipment.js');
Object.assign(global, {
  SLOT: equipMod.SLOT, EquipmentData: equipMod.EquipmentData,
  SECRETARY_POOL: equipMod.SECRETARY_POOL, secretaryKey: equipMod.secretaryKey,
  EQUIP_CAT_ZH: equipMod.EQUIP_CAT_ZH
});
const shipsMod = require('../public/js/data/ships.js');
Object.assign(global, {
  SHIP_TYPE_ZH: shipsMod.SHIP_TYPE_ZH, SHIPS: shipsMod.SHIPS, ShipData: shipsMod.ShipData,
  remodelChain: shipsMod.remodelChain, buildPool: shipsMod.buildPool,
  RARITY_W: shipsMod.RARITY_W, STARTER_IDS: shipsMod.STARTER_IDS
});
const mapsMod = require('../public/js/data/maps.js');
Object.assign(global, {
  DEEP_TEMPLATES: mapsMod.DEEP_TEMPLATES, ENEMY_FLEETS: mapsMod.ENEMY_FLEETS,
  MAPS: mapsMod.MAPS, EXPEDITIONS: mapsMod.EXPEDITIONS
});
const questsMod = require('../public/js/data/quests.js');
Object.assign(global, { QUESTS: questsMod.QUESTS, addQuestReward: questsMod.addQuestReward });
Object.assign(global, require('../public/js/core/utils.js'));
Object.assign(global, require('../public/js/core/state.js'));
Object.assign(global, require('../public/js/game/battle.js'));
Object.assign(global, require('../public/js/game/factory.js'));
Object.assign(global, require('../public/js/game/logistics.js'));
Object.assign(global, require('../public/js/game/progression.js'));
Object.assign(global, require('../public/js/game/sortie.js'));

/* localStorage 桩 */
global.localStorage = {
  _d: {}, getItem(k) { return this._d[k] || null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; }
};

let passed = 0, failed = 0;
function assert(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${extra ? ' :: ' + extra : ''}`); }
}
function section(t) { console.log(`\n== ${t} ==`); }

/* ============ 测试 ============ */
section('存档初始化');
Game.newGame();
assert('初始双驱逐', Object.keys(Game.state.ships).length === 2, JSON.stringify(Object.keys(Game.state.ships)));
assert('资源初始', Game.state.resources.fuel === 1000 && Game.state.resources.baux === 500);
assert('舰队1有2舰', Game.state.fleet[1].length === 2);

section('战斗引擎（1-1 A点 ×200）');
let wins = 0, sRanks = 0;
for (let i = 0; i < 200; i++) {
  const r = Battle.battle(Game.state.fleet[1], ENEMY_FLEETS.F01.ships, '单纵阵', ENEMY_FLEETS.F01.formation, { allowNight: true, fleetIdx: 1 });
  if (r.rank === 'S' || r.rank === 'A' || r.rank === 'B') wins++;
  if (r.rank === 'S') sRanks++;
  assert(`战斗#${i} 无异常`, typeof r.rank === 'string' && Array.isArray(r.log) && r.log.length > 0);
}
assert('低难度胜率合理(>40%)', wins / 200 > 0.4, `wins=${wins}`);
assert('S胜存在', sRanks > 0, `sRanks=${sRanks}`);

section('战斗引擎（1-3 BOSS ×50，满编强舰队）');
/* 构建满级强舰队 */
const strongFleet = [];
const strongIds = ['enterprise', 'iowa', 'essex', 'fletcher', 'atlanta', 'saratoga'];
for (const id of strongIds) {
  const s = Game.createShip(id, 99);
  s.kai = 2;
  s.hp = Game.shipStats(s.uid).hpMax;
  Game.equipDefaults(s.uid);
  strongFleet.push(s.uid);
}
let bossWins = 0, bossS = 0;
for (let i = 0; i < 50; i++) {
  const r = Battle.battle(strongFleet, ENEMY_FLEETS.F09.ships, '单纵阵', ENEMY_FLEETS.F09.formation, { allowNight: true, fleetIdx: 1 });
  bossWins += (r.rank === 'S' || r.rank === 'A') ? 1 : 0;
  bossS += (r.rank === 'S') ? 1 : 0;
  if (i === 0 && !(r.rank === 'S' || r.rank === 'A')) console.log('  首战未胜示例:' + r.log.slice(0, 8).join(' | '));
}
console.log(`  BOSS 胜率: ${bossWins}/50 (S胜 ${bossS})`);
assert('强舰队BOSS胜率>50%', bossWins / 50 > 0.5, `bossWins=${bossWins}`);

section('建造/开发');
const b = Factory.startBuild({ fuel: 400, ammo: 400, steel: 500, baux: 500 });
assert('建造入队', b.ok && Game.state.construction.length === 1, JSON.stringify(b));
assert('资源扣除', Game.state.resources.fuel === 600);
Game.state.construction[0].end = Date.now() - 1;
const cb = Factory.claimBuild(0);
assert('建造完成出船', cb.ok && cb.ship && Game.state.ships[cb.ship.uid]);
Game.gain({ fuel: 500, ammo: 500, steel: 500, baux: 500 });
const d = Factory.startDevelop({ fuel: 10, ammo: 20, steel: 10, baux: 40 }, null);
assert('开发入队', d.ok, JSON.stringify(d));
Game.state.development[0].end = Date.now() - 1;
const cd = Factory.claimDevelop(0);
assert('开发完成', cd.ok);

section('远征');
const e1 = Logistics.startExpedition(1, 'ex1');
assert('远征1启动', e1.ok, JSON.stringify(e1));
const e2 = Logistics.startExpedition(1, 'ex1');
assert('重复远征被拒', !e2.ok);
const e3 = Logistics.claimExpedition(1);
assert('提前领取被拒', !e3.ok);
Game.state.expeditions[1].end = Date.now() - 1;
const e4 = Logistics.claimExpedition(1);
assert('远征完成领取', e4.ok && e4.reward.fuel > 0, JSON.stringify(e4));

section('养成');
const ddUid = Game.state.fleet[1][0];
const s0 = Game.state.ships[ddUid];
Progression.addShipExp(ddUid, 50000);
assert('升级成功', s0.lv > 1, `lv=${s0.lv}`);
assert('改造解锁', Progression.remodelInfo(ddUid) !== null);
const rm = Progression.remodel(ddUid);
assert('改造成功', rm.ok, JSON.stringify(rm));
assert('改造后kai=1', s0.kai === 1);
assert('hp回满', s0.hp === Game.shipStats(ddUid).hpMax);
const mi = Progression.modernizeInfo(ddUid);
assert('近代化可选', mi && Object.keys(mi.gains).length > 0, JSON.stringify(mi && mi.gains));
if (mi && Object.keys(mi.gains).length) {
  const m = Progression.modernize(Game.state.fleet[1][1], ddUid);
  assert('近代化成功', m.ok, JSON.stringify(m));
}

section('任务');
Progression.initQuests();
Progression.resetDue();
Progression.notify('sortie', 3);
assert('日常出击任务进度', Game.state.quests.d1.progress === 3);
Progression.notify('sink', 5);
assert('击沉任务', Game.state.quests.d8.progress === 5);
Progression.notify('sink', 5);
const cq = Progression.claimQuest('d1');
assert('领取日常奖励', cq.ok && Game.state.resources.fuel >= 100, JSON.stringify(cq && cq.q && cq.q.id));

section('出击流程（1-1 全流程，强舰队 ×5）');
/* 用强舰队替换舰队1 */
Game.state.fleet[1] = strongFleet;
for (const uid of strongFleet) {
  const s = Game.state.ships[uid];
  s.hp = Game.shipStats(uid).hpMax;
  s.supply = { fuel: 1, ammo: 1 };
}
let cleared = 0;
for (let i = 0; i < 5; i++) {
  for (const uid of strongFleet) {
    const s = Game.state.ships[uid];
    s.hp = Game.shipStats(uid).hpMax;
    s.supply = { fuel: 1, ammo: 1 };
  }
  const st = Sortie.start('1-1', 1);
  assert('出击启动', st.ok);
  let guard = 0;
  while (Game.state.sortie && guard++ < 10) {
    const r = Sortie.advance('单纵阵', true);
    assert(`节点处理 ${r.type}`, r.ok, JSON.stringify(r && r.msg));
    if (r.type === 'battle' || r.type === 'boss') {
      Progression.applyBattleResult(1, r.result, false);
    }
    if (r.type === 'boss' && r.cleared) cleared++;
    const nxt = Sortie.moveToNext();
    if (!nxt) break;
  }
  Sortie.returnHome();
  assert('回港', Game.state.sortie === null);
}
assert('血条推进', Game.state.mapProgress['1-1'].kills > 0);
assert('1-1通关', Game.state.mapProgress['1-1'].cleared, JSON.stringify(Game.state.mapProgress['1-1']));
console.log(`  1-1 击破次数: ${Game.state.mapProgress['1-1'].kills}`);

section('演习');
const pr = Logistics.practiceReady();
assert('演习对手5个', pr.fleets.length === 5);
const pf = pr.fleets[0];
const prRes = Battle.battle(strongFleet, pf.ships, '单纵阵', '单纵阵', { allowNight: true, fleetIdx: 1 });
assert('演习战斗正常', typeof prRes.rank === 'string' && prRes.rank.length === 1, JSON.stringify(prRes.rank));

section('持久化');
Game.save();
const loaded = Game.load();
assert('存档往返', loaded === true && Object.keys(Game.state.ships).length === Object.keys(require('../public/js/core/state.js').Game.state.ships).length);

section('总结');
console.log(`\n通过 ${passed} 项，失败 ${failed} 项`);
process.exit(failed ? 1 : 0);
