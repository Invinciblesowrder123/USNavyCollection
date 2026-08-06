'use strict';
/* 分段战斗流程（昼战 → 追击选择 → 夜战）回归测试
 * 用法: node scripts/test_night_split.js
 * 验证：昼战结果不含夜战日志且 nightUsed=false；battleNight 追加夜战并重新结算；
 *       双方均已无战力时 battleNight 不崩、不追加夜战；演习分段流程经验结算正常 */

process.env.AUTH_DATA_DIR = require('path').join(require('os').tmpdir(), 'usnc_night_test_' + Date.now());

const equipMod = require('../public/js/data/equipment.js');
Object.assign(global, {
  SLOT: equipMod.SLOT, EquipmentData: equipMod.EquipmentData,
  SECRETARY_POOL: equipMod.SECRETARY_POOL, secretaryKey: equipMod.secretaryKey,
  devPoolKey: equipMod.devPoolKey, devEntries: equipMod.devEntries,
  devFailShare: equipMod.devFailShare, devMinReq: equipMod.devMinReq,
  EQUIP_CAT_ZH: equipMod.EQUIP_CAT_ZH, EQUIP_STAT_ZH: equipMod.EQUIP_STAT_ZH,
  IMPROVE: equipMod.IMPROVE, IMPROVE_NEED_ZH: equipMod.IMPROVE_NEED_ZH,
  DEV_SEC: equipMod.DEV_SEC, DEV_POOL: equipMod.DEV_POOL,
  DEV_SEC_ZH: equipMod.DEV_SEC_ZH, DEV_POOL_ZH: equipMod.DEV_POOL_ZH, DEV_SEC_DESC: equipMod.DEV_SEC_DESC
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
Object.assign(global, require('../public/js/game/improve.js'));
Object.assign(global, require('../public/js/game/logistics.js'));
Object.assign(global, require('../public/js/game/progression.js'));
Object.assign(global, require('../public/js/game/sortie.js'));

global.localStorage = {
  _d: {}, getItem(k) { return this._d[k] || null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; }
};

let passed = 0, failed = 0;
function assert(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}

const st = Game.state;
Game.newGame();
const fleet = st.fleet[1];

function hasNight(log) { return log.some(e => typeof e === 'string' && e.includes('进入夜战')); }

/* ---- 昼战分段：allowNight:false 不进入夜战 ---- */
const day = Battle.battle(fleet, ENEMY_FLEETS.F09.ships, '单纵阵', ENEMY_FLEETS.F09.formation, { allowNight: false, fleetIdx: 1 });
assert('昼战结果不含夜战日志', !hasNight(day.log));
assert('昼战 nightUsed=false', day.nightUsed === false);
assert('昼战结果持有阵型名（供夜战续接）', !!day.formAName && !!day.formBName);
const myAlive = day.mySide.some(s => s.alive);
const enAlive = day.enemySide.some(s => s.alive);
assert('昼战含战斗结束结算行', day.log.some(e => typeof e === 'string' && e.includes('战斗结束')));
const dayLogLen = day.log.length;

/* ---- 夜战续接：追加日志并重新结算 ---- */
if (myAlive && enAlive) {
  const night = Battle.battleNight(day);
  assert('夜战追加进入夜战日志', hasNight(night.log));
  assert('夜战日志追加在昼战日志之后', night.log.length > dayLogLen && night.log[dayLogLen] !== undefined);
  assert('夜战结果 nightUsed=true', night.nightUsed === true);
  assert('夜战共享同一日志数组引用', night.log === day.log);
  assert('夜战mySide沿用昼战对象', night.mySide === day.mySide && night.enemySide === day.enemySide);
  const dayRank = day.rank;
  assert('夜战后评价不劣于昼战（夜战只能加分）', 'SABC'.indexOf(night.rank) <= 'SABC'.indexOf(dayRank),
    `昼${dayRank} 夜${night.rank}`);
} else {
  const night = Battle.battleNight(day);
  assert('无战力时 battleNight 不崩且不进入夜战', night !== null && !hasNight(night.log) && night.nightUsed === false);
  console.log('  (本轮昼战即结束，跳过夜战续接断言)');
}

/* ---- 演习：分段流程 + 结算经验 ---- */
const pf = Logistics.practiceReady().fleets[0];
const pracDay = Battle.battle(fleet, pf.ships, '复纵阵', '单纵阵', { allowNight: false, fleetIdx: 1 });
assert('演习昼战敌方阵型为单纵阵', pracDay.formBName === '单纵阵');
assert('演习昼战我方阵型生效', pracDay.formAName === '复纵阵');
const pracNight = Battle.battleNight(pracDay);
const gains = Progression.applyBattleResult(1, pracNight, true);
assert('演习夜战后经验结算正常', Array.isArray(gains.gains));
assert('演习提督经验合理', gains.adm.exp >= 20 && gains.adm.exp <= 160);

/* ---- 出击 settleBattle 全流程（prep → night → settle） ---- */
Sortie.start('1-1', 1);
Sortie.moveToNext();                 // S -> A（战斗点）
const prep = Sortie.prepareBattle('单纵阵');
assert('prepareBattle 成功且不含夜战', prep.ok && !hasNight(prep.result.log));
const beforeAmmo = st.ships[fleet[0]].supply.ammo;
const settled = Sortie.settleBattle(prep);
assert('不夜战：弹药消耗20%', Math.abs(st.ships[fleet[0]].supply.ammo - (beforeAmmo - 0.2)) < 1e-9,
  `消耗${(beforeAmmo - st.ships[fleet[0]].supply.ammo).toFixed(2)}`);
assert('settleBattle 返回掉血条字段', settled.ok && ('drop' in settled) && ('cleared' in settled));
Sortie.returnHome();

/* ---- 夜战突入：弹药消耗30% ---- */
const strong = ['iowa', 'southdakota', 'enterprise', 'fletcher', 'kidd', 'helena']
  .map(id => Game.createShip(id, 50));
const strongFleet = strong.map(s => s.uid);
const prevFleet = st.fleet[1];
st.fleet[1] = strongFleet;
for (const u of strongFleet) { const s = st.ships[u]; s.supply.fuel = 1; s.supply.ammo = 1; }
let prep2 = null, nightAvail = false;
for (let attempt = 0; attempt < 5 && !nightAvail; attempt++) {
  Sortie.start('1-1', 1);
  Sortie.moveToNext();                 // S -> A（战斗点）
  Sortie.moveToNext();                 // A -> B（BOSS点）
  prep2 = Sortie.prepareBattle('单纵阵');
  nightAvail = prep2.ok && prep2.result.mySide.some(s => s.alive) && prep2.result.enemySide.some(s => s.alive);
}
assert('夜战路径 prepareBattle 成功', prep2 && prep2.ok);
if (nightAvail) {
  Sortie.continueNight(prep2);
  assert('夜战突入后 nightUsed=true', prep2.result.nightUsed === true);
} else {
  prep2.result.nightUsed = true;       // 昼战即全歼时，直接校验结算的30%弹药分支
}
const ammoBefore = st.ships[strongFleet[0]].supply.ammo;
Sortie.settleBattle(prep2);
assert('夜战突入：弹药消耗30%', Math.abs(st.ships[strongFleet[0]].supply.ammo - (ammoBefore - 0.3)) < 1e-9,
  `消耗${(ammoBefore - st.ships[strongFleet[0]].supply.ammo).toFixed(2)}`);
Sortie.returnHome();
st.fleet[1] = prevFleet;

console.log(`\n通过 ${passed} 项，失败 ${failed} 项`);
process.exit(failed ? 1 : 0);
