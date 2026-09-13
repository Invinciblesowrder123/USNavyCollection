'use strict';
/* ============================================================
 * 战役平衡测量工具（评估时建立，V0.303 起可用）
 *
 * 用途：量化「史实编成规则」是否有约束力 —— 即玩家违反规则要付出什么代价。
 *   对每场战役 × 每档编成 × 加成开/关，统计 rank 分布（S/A/B/C/D/E）。
 *   S 档是奖励档（「史实重演」要求 S 胜），所以看 S 率比看胜率更能反映规则效力。
 *
 * 【重要·踩坑记录】night 节点的战斗必须走两步：
 *   1) Battle.battle(..., { nightOnly: true })  ← 只返回**空壳**（forceNight 标记，零攻击）
 *   2) Battle.battleNight(r0)                    ← 这才是真正的夜战
 *   sortie.js 的 UI 路径（advance / doNight）已正确串起这两步；本脚本照做。
 *   只调第 1 步会得到「B 胜、0/5 击沉」的假结果 —— 早期版本的 simulate.js::toBoss
 *   就是这样，导致 H2 夜战在 sim 里从未真正发生（断言照样全绿）。
 *
 * 用法：node scripts/hist_balance.js
 * ============================================================ */
process.env.AUTH_DATA_DIR = require('path').join(require('os').tmpdir(), 'usnc_hb_' + Date.now());
require('../auth.js');
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
  RARITY_W: shipsMod.RARITY_W, STARTER_IDS: shipsMod.STARTER_IDS,
  SLOW_CLASSES: shipsMod.SLOW_CLASSES, shipSpeed: shipsMod.shipSpeed
});
const mapsMod = require('../public/js/data/maps.js');
Object.assign(global, {
  DEEP_TEMPLATES: mapsMod.DEEP_TEMPLATES, ENEMY_FLEETS: mapsMod.ENEMY_FLEETS,
  MAPS: mapsMod.MAPS, EXPEDITIONS: mapsMod.EXPEDITIONS
});
const histMod = require('../public/js/data/history.js');
Object.assign(global, { HISTORY_BATTLES: histMod.HISTORY_BATTLES, History: histMod.History });
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
global.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
Game.newGame();
Game.state.admiral.level = 90;

const CVF = ['f6f5', 'f6f5', 'f6f5', 'f6f5'];
const DD_TORP = 'torp_533_5l';
/* 夜战配装：轻舰满鱼雷（末槽照明弹）；其余默认 */
function equipNight(uid) {
  const s = Game.state.ships[uid], def = ShipData[s.id];
  if (def.type !== 'DD' && def.type !== 'CL') { Game.equipDefaults(uid); return; }
  for (const e of s.equipped.slice()) Game.destroyEquip(e);
  s.equipped = [];
  for (let i = 0; i < def.slots.length; i++) {
    const eid = (i === def.slots.length - 1 && def.slots.length >= 4) ? 'star_mk9' : DD_TORP;
    const ne = Game.createEquip(eid); ne.locked = false; s.equipped.push(ne.uid);
  }
}
/* 航空配装：**只给航母**装舰战，其余保持默认（否则 BB/DD 的炮被舰战挤掉，战力暴跌） */
function equipAir(uid) {
  const s = Game.state.ships[uid], def = ShipData[s.id];
  if (def.type !== 'CV' && def.type !== 'CVL') { Game.equipDefaults(uid); return; }
  for (const e of s.equipped.slice()) Game.destroyEquip(e);
  s.equipped = [];
  for (const eid of CVF) { if (s.equipped.length >= def.slots.length) break; const ne = Game.createEquip(eid); ne.locked = false; s.equipped.push(ne.uid); }
}
function buildFleet(spec, lv, mode) {
  Game.state.ships = {}; Game.state.fleet[1] = [];
  Game.state.fleet[1] = spec.map(id => {
    const s = Game.createShip(id, lv);
    if (mode === 'air') equipAir(s.uid); else equipNight(s.uid);
    s.hp = Game.shipStats(s.uid).hpMax; s.supply = { fuel: 1, ammo: 1 }; s.morale = 60;
    return s.uid;
  });
  return Game.state.fleet[1].slice();
}
function run(spec, lv, mode, enemyKey, bonus, N) {
  const en = History.enemy(enemyKey);
  const R = { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0 };
  for (let i = 0; i < N; i++) {
    const fleet = buildFleet(spec, lv, mode);
    const opts = { allowNight: false, fleetIdx: 1, airMode: mode === 'air', nightOnly: mode === 'night' };
    if (bonus) { opts.historic = true; opts.histHit = 1.05; opts.histEvd = 1.05; }
    let r = Battle.battle(fleet, en.ships, '单纵阵', en.formation, opts);
    if (r.forceNight) r = Battle.battleNight(r);   // ← 缺这行 = 空壳
    R[r.rank] = (R[r.rank] || 0) + 1;
  }
  const pct = v => (v / N * 100).toFixed(1) + '%';
  return `S${pct(R.S)} A${pct(R.A)} B${pct(R.B)} C${pct(R.C)} D${pct(R.D)}`;
}

const H1 = History.byId('H1'), H2 = History.byId('H2');
const H1_CV2 = ['enterprise', 'essex', 'saratoga', 'iowa', 'fletcher', 'baltimore'];
const H1_CV0 = ['iowa', 'southdakota', 'fletcher', 'baltimore', 'atlanta', 'sanfrancisco'];
const H2_DD = ['fletcher', 'fletcher', 'fletcher', 'fletcher', 'sanfrancisco', 'baltimore'];
const H2_META = ['iowa', 'enterprise', 'fletcher', 'baltimore', 'atlanta', 'saratoga'];
const N = parseInt(process.argv[2], 10) || 400;

console.log(`战役平衡测量 · N=${N} · 规则文本：`);
console.log('  H1:', History.ruleText(H1.histRule));
console.log('  H2:', History.ruleText(H2.histRule));
console.log('\n（S 档 = 奖励档；「史实重演」要求 S 胜）');
for (const lv of [30, 60, 90]) {
  console.log(`\n===== 舰娘等级 ${lv} =====`);
  console.log(`H1 BOSS  合规 2CV   加成关: ${run(H1_CV2, lv, 'air', 'H1X', false, N)}   开: ${run(H1_CV2, lv, 'air', 'H1X', true, N)}`);
  console.log(`H1 BOSS  违规 0CV   加成关: ${run(H1_CV0, lv, 'air', 'H1X', false, N)}   开: ${run(H1_CV0, lv, 'air', 'H1X', true, N)}`);
  console.log(`H2 BOSS  合规 4DD+  加成关: ${run(H2_DD, lv, 'night', 'H2X', false, N)}   开: ${run(H2_DD, lv, 'night', 'H2X', true, N)}`);
  console.log(`H2 BOSS  违规 BB+CV 加成关: ${run(H2_META, lv, 'night', 'H2X', false, N)}   开: ${run(H2_META, lv, 'night', 'H2X', true, N)}`);
}
