'use strict';
/* ============================================================
 * Headless 模拟测试：验证引擎无崩溃、数值合理
 * 用法: npm run sim
 * ============================================================ */

/* 账号系统测试用独立临时数据目录（须在 require auth.js 之前设置） */
process.env.AUTH_DATA_DIR = require('path').join(require('os').tmpdir(), 'usnc_auth_test_' + Date.now());
const authMod = require('../auth.js');

/* ---- 注入全局命名空间（模拟浏览器经典脚本环境） ---- */
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

section('弹药后勤（参照wiki：弹药补正/1-2资源点/消耗）');
/* 弹药补正公式：残弹率≥50%→1，<50%→残弹率/50（0%无法炮击） */
assert('弹药补正 残弹60%=1', Battle.ammoBonus({ ammo: 0.6 }) === 1);
assert('弹药补正 残弹50%=1', Battle.ammoBonus({ ammo: 0.5 }) === 1);
assert('弹药补正 残弹40%=0.8', Math.abs(Battle.ammoBonus({ ammo: 0.4 }) - 0.8) < 1e-9);
assert('弹药补正 残弹25%=0.5', Math.abs(Battle.ammoBonus({ ammo: 0.25 }) - 0.5) < 1e-9);
assert('弹药补正 残弹0%=0（无法炮击）', Battle.ammoBonus({ ammo: 0 }) === 0);
/* 1-2 地图按 wiki：C 点为弹药资源点（不消耗油弹/士气），BOSS 无重巡以上且≤5艘（驱逐/轻巡/雷巡） */
const map12 = MAPS.find(m => m.id === '1-2');
assert('1-2 C点为弹药资源点', map12.defs.C && map12.defs.C.type === 'resource' && map12.defs.C.reward[0] === 'ammo', JSON.stringify(map12.defs.C));
const f06 = ENEMY_FLEETS.F06.ships;
assert('1-2 BOSS舰队≤5艘', f06.length <= 5, 'n=' + f06.length);
assert('1-2 BOSS无重巡以上舰种', f06.every(k => ['DD', 'CL', 'CLT'].includes(DEEP_TEMPLATES[k].type)), f06.map(k => DEEP_TEMPLATES[k].type).join(','));
assert('1-2 BOSS旗舰为重雷装巡洋舰CHI级', DEEP_TEMPLATES[f06[0]].type === 'CLT' && DEEP_TEMPLATES[f06[0]].boss === true, JSON.stringify(DEEP_TEMPLATES[f06[0]]));

section('新海域数据校验（1-4 / 2-X / 3-X / 4-X / 5-X，参照wiki）');
assert('海域总数25（5大区域 × 5图，含BOSS海域）', MAPS.length === 25, 'n=' + MAPS.length);
/* 通用结构校验：节点可达、BOSS可达、掉落id存在、敌军key存在、分支目标为合法边 */
function reachable(map, from) {
  const seen = new Set([from]);
  const q = [from];
  while (q.length) {
    const n = q.shift();
    for (const [a, b] of map.edges) {
      if (a === n && !seen.has(b)) { seen.add(b); q.push(b); }
    }
  }
  return seen;
}
for (const m of MAPS) {
  const nodes = Object.keys(m.nodes);
  const reach = reachable(m, m.start);
  assert(`${m.id} 全部节点从出发点可达`, nodes.every(n => reach.has(n)), [...nodes].filter(n => !reach.has(n)).join(','));
  assert(`${m.id} BOSS可达`, reach.has(m.boss));
  assert(`${m.id} BOSS定义存在`, m.defs[m.boss] && m.defs[m.boss].type === 'boss', JSON.stringify(m.defs[m.boss]));
  for (const d of (m.drops || []).concat(m.bossDrops || [])) {
    assert(`${m.id} 掉落「${d}」存在于舰船数据`, !!ShipData[d], d);
  }
  for (const def of Object.values(m.defs)) {
    if (def.enemy) {
      assert(`${m.id} 敌军舰队「${def.enemy}」存在`, !!ENEMY_FLEETS[def.enemy], def.enemy);
      assert(`${m.id} 敌军模板全部存在`, ENEMY_FLEETS[def.enemy].ships.every(k => !!DEEP_TEMPLATES[k]), ENEMY_FLEETS[def.enemy].ships.join(','));
    }
    /* 节点消耗覆写（如 1-5 反潜点 油8%/弹0）：数值合法 */
    if (def.cost) assert(`${m.id} 节点cost合法`, def.cost.fuel >= 0 && def.cost.ammo >= 0 && (def.cost.fuel !== 0.2 || def.cost.ammo !== 0.2), JSON.stringify(def.cost));
  }
  const brs = Array.isArray(m.branch) ? m.branch : (m.branch ? [m.branch] : []);
  for (const b of brs) {
    const outEdges = m.edges.filter(e => e[0] === b.at).map(e => e[1]);
    assert(`${m.id} 分支点${b.at}目标为合法边`, (b.to || []).every(t => outEdges.includes(t)), JSON.stringify(b));
    assert(`${m.id} 分支点${b.at}有可用的兜底路线`, outEdges.some(t => !(b.to || []).includes(t)), JSON.stringify(b));
  }
  /* BOSS海域（EO）：必须带 need 解锁条件，且 need 为同区域4号图 */
  if (m.id.endsWith('-5')) {
    const area = m.id[0];
    assert(`${m.id} BOSS海域带解锁条件`, m.need === `${area}-4`, 'need=' + m.need);
  }
}
/* ============ P1批A：特殊节点（夜战/潜艇/漩涡）与速力机制 ============ */
section('速力字段完整性');
assert('shipSpeed 函数存在', typeof shipSpeed === 'function');
assert('104舰速力全部可解析', SHIPS.every(d => shipSpeed(d) === 'slow' || shipSpeed(d) === 'fast'));
const bigTypesArr = ['BB', 'CV', 'CVB', 'CVL', 'CVE'];
const slowBigs = SHIPS.filter(d => bigTypesArr.includes(d.type) && shipSpeed(d) === 'slow');
assert('低速主力舰=11艘（10低速BB + 兰利）', slowBigs.length === 11, slowBigs.map(d => d.id).join(','));
assert('新锐舰不被标低速', slowBigs.every(d => !['iowa','missouri','newjersey','wisconsin','northcarolina','washington','essex','enterprise','yorktown','hornet','lexington','saratoga','wasp','ranger'].includes(d.id)),
  slowBigs.filter(d => ['iowa','missouri','newjersey','wisconsin','northcarolina','washington','essex','enterprise'].includes(d.id)).map(d => d.id).join(','));
assert('纽约=低速', shipSpeed(ShipData['newyork']) === 'slow');
assert('科罗拉多级=低速', SHIPS.filter(d => d.cls === '科罗拉多级').every(d => shipSpeed(d) === 'slow'));
assert('爱荷华/企业=高速', shipSpeed(ShipData['iowa']) === 'fast' && shipSpeed(ShipData['enterprise']) === 'fast');
assert('兰利=低速', shipSpeed(ShipData['langley']) === 'slow');

section('特殊节点数据完整性');
let subNodeN = 0, nightNodeN = 0, whirlNodeN = 0;
for (const m of MAPS) for (const [nid, def] of Object.entries(m.defs)) {
  if (def.mode === 'sub') {
    subNodeN++;
    assert(`${m.id}-${nid} 潜艇点敌编成含潜水舰`, ENEMY_FLEETS[def.enemy].ships.some(k => DEEP_TEMPLATES[k].type === 'SS'), def.enemy);
  }
  if (def.mode === 'night') nightNodeN++;
  if (def.type === 'whirlpool') { whirlNodeN++; assert(`${m.id}-${nid} 漩涡lossBase>0`, (def.lossBase || 0) > 0); }
}
assert('夜战节点已落1-4 B点', MAPS.find(m => m.id === '1-4').defs.B.mode === 'night', 'n=' + nightNodeN);
assert('潜艇节点=2处且都在2-2', subNodeN === 2, 'n=' + subNodeN);
assert('漩涡节点=1处且在3-1 W', whirlNodeN === 1 && !!MAPS.find(m => m.id === '3-1').defs.W);
for (const bid of ['1-4', '2-2', '3-1']) {
  const mm = MAPS.find(x => x.id === bid);
  assert(`${bid} 作战简报已配置`, typeof mm.brief === 'string' && mm.brief.length > 20);
}

section('潜艇打击修正（低速BB队 vs DD队 ×120）');
/* 同经济强度两支舰队打 2-2 A点（F18：双潜艇+驱逐）：
 * 速力修正应使低速舰队承受的潜艇雷击总伤害显著高于驱逐舰队 */
const mkFleet = ids => ids.map(id => { const s = Game.createShip(id, 50); Game.equipDefaults(s.uid); s.hp = Game.shipStats(s.uid).hpMax; return s.uid; });
const slowIds = SHIPS.filter(d => d.type === 'BB' && shipSpeed(d) === 'slow').slice(0, 6).map(d => d.id);
const ddIds = SHIPS.filter(d => d.type === 'DD').slice(0, 6).map(d => d.id);
const slowFleetP1 = mkFleet(slowIds), ddFleetP1 = mkFleet(ddIds);
const F18SHIPS = ENEMY_FLEETS.F18.ships, F18FORM = ENEMY_FLEETS.F18.formation;
const fleetSubDmg = (fleet, n) => {
  let subOnly = 0, maxSingle = 0;
  for (let i = 0; i < n; i++) {
    const r = Battle.battle(fleet, F18SHIPS, '单纵阵', F18FORM, { allowNight: false, fleetIdx: 1, sub: true });
    for (const entry of r.log) {
      if (entry && entry.event && (entry.event.kind === 'open_torp' || entry.event.kind === 'torp') && entry.event.hit && entry.event.atkS === 'B') {
        const atker = r.enemySide[entry.event.atkI];
        if (atker && atker.type === 'SS') {
          subOnly += entry.event.dmg;
          const tgt = r.mySide[entry.event.tgtI];
          if (tgt) maxSingle = Math.max(maxSingle, entry.event.dmg / Math.max(1, tgt.stats.hpMax));
        }
      }
    }
  }
  return { subOnly, maxSingleRatio: maxSingle };
};
const slowStat = fleetSubDmg(slowFleetP1, 120);
const ddStat = fleetSubDmg(ddFleetP1, 120);
console.log(`  潜艇对低速BB队雷击伤害: ${Math.round(slowStat.subOnly)} | 对DD队: ${Math.round(ddStat.subOnly)}`);
assert('潜艇对低速舰队雷击伤害显著更高(>1.3×)', slowStat.subOnly > ddStat.subOnly * 1.3, `slow=${Math.round(slowStat.subOnly)} dd=${Math.round(ddStat.subOnly)}`);
assert('潜艇单次雷击伤害≤目标耐久60%', slowStat.maxSingleRatio <= 0.6 + 1e-9, `max=${slowStat.maxSingleRatio.toFixed(3)}`);

section('夜战节点（直接夜战）');
{
  const nightPrep = Battle.battle(ddFleetP1, ENEMY_FLEETS.F13.ships, '单纵阵', ENEMY_FLEETS.F13.formation, { allowNight: false, fleetIdx: 1, nightOnly: true });
  assert('夜战节点：跳过昼战（无炮击战日志）', !nightPrep.log.some(l => typeof l === 'string' && l.includes('炮击战')));
  assert('夜战节点：无航空战日志', !nightPrep.log.some(l => typeof l === 'string' && l.includes('航空战')));
  assert('夜战节点：标记 forceNight', nightPrep.forceNight === true);
  const nightFull = Battle.battleNight(nightPrep);
  assert('夜战节点：可正常追加夜战结算', typeof nightFull.rank === 'string' && nightFull.nightUsed === true, `rank=${nightFull.rank}`);
}

/* 难度梯度：区域内星级单调不减；BOSS海域（-5）星级与BOSS舰队规模高于区域内普通图；终局BOSS强度翻倍 */
const bossHp = m => ENEMY_FLEETS[m.defs[m.boss].enemy].ships.reduce((s, k) => s + DEEP_TEMPLATES[k].stats[0], 0);
const byArea = {};
for (const m of MAPS) {
  const no = m.id.split('-')[0];
  (byArea[no] = byArea[no] || []).push(m);
}
assert('共5个大区域', Object.keys(byArea).length === 5, Object.keys(byArea).sort().join(','));
for (const no of Object.keys(byArea).sort()) {
  const ms = byArea[no];
  let prevStars = 0;
  for (const m of ms) {
    assert(`难度梯度 ${m.id} 星级≥区域前图`, m.stars >= prevStars, `${prevStars}→${m.stars}`);
    prevStars = m.stars;
  }
  /* 每区域恰有5图（4普通 + 1 BOSS海域），BOSS海域星级严格更高 */
  assert(`区域${no} 共5图`, ms.length === 5, 'n=' + ms.length);
  const normal = ms.slice(0, -1), boss = ms[ms.length - 1];
  assert(`难度梯度 ${boss.id} BOSS海域星级>区域内普通图`, boss.stars > Math.max(...normal.map(m => m.stars)), `${Math.max(...normal.map(m => m.stars))}→${boss.stars}`);
}
for (const m of MAPS) {
  const bossFleet = ENEMY_FLEETS[m.defs[m.boss].enemy].ships;
  /* 教程图（星级<6）规模从简；正式图 BOSS 舰队≥4艘 */
  if (m.stars >= 6) assert(`难度梯度 ${m.id} BOSS舰队≥4艘`, bossFleet.length >= 4, 'n=' + bossFleet.length);
}
const hp14 = bossHp(MAPS.find(m => m.id === '1-4')), hp34 = bossHp(MAPS.find(m => m.id === '3-4')), hp55 = bossHp(MAPS.find(m => m.id === '5-5'));
assert('3-4 BOSS舰队总HP ≥ 1-4 ×1.5（后期图强度翻倍）', hp34 >= hp14 * 1.5, `${hp14}→${hp34}`);
assert('5-5 BOSS舰队总HP ≥ 3-4 ×1.4（终局决战）', hp55 >= hp34 * 1.4, `${hp34}→${hp55}`);
/* BOSS海域解锁逻辑：Sortie.start 拒绝未解锁图，解锁后可出击 */
const map15 = MAPS.find(m => m.id === '1-5');
Game.state.mapProgress['1-4'].cleared = false;
const lockRes = Sortie.start('1-5', 1);
assert('1-5 未解锁时拒绝出击', lockRes.ok === false && lockRes.msg.includes('BOSS 海域'), lockRes.msg);
Game.state.mapProgress['1-4'].cleared = true;
const unLockRes = Sortie.start('1-5', 1);
assert('1-5 击破1-4后解锁出击', unLockRes.ok === true, JSON.stringify(unLockRes).slice(0, 80));
if (unLockRes.ok) Sortie.returnHome();
/* 1-5 反潜点特殊消耗（wiki：A/D/E 不耗弹药，仅油8%） */
const c15 = MAPS.find(m => m.id === '1-5');
assert('1-5 A点为反潜节点且带 cost', c15.defs.A.type === 'battle' && c15.defs.A.cost && c15.defs.A.cost.ammo === 0 && c15.defs.A.cost.fuel === 0.08, JSON.stringify(c15.defs.A));
const costPrevFleet = Game.state.fleet[1].slice();
Game.state.fleet[1] = strongFleet;
const costStart = Sortie.start('1-5', 1);
assert('1-5 解锁后可出击（cost测试前置）', costStart.ok === true, JSON.stringify(costStart));
const costS = Sortie.advance('单纵阵', true);   // S 出发点：无消耗
Sortie.moveToNext();
const costA = Sortie.advance('单纵阵', true);   // A 反潜点：油8%/弹0
const ammoAfter = Math.min(...strongFleet.map(u => Game.state.ships[u].supply.ammo));
const fuelAfter = Math.min(...strongFleet.map(u => Game.state.ships[u].supply.fuel));
Sortie.returnHome();
Game.state.fleet[1] = costPrevFleet;
assert('1-5 反潜点战斗不耗弹药（弹仍为100%）', costS.ok && costA.ok && ammoAfter === 1, `ammo=${ammoAfter}`);
assert('1-5 反潜点战斗仅耗8%燃料', costS.ok && costA.ok && Math.abs(fuelAfter - 0.92) < 1e-9, `fuel=${fuelAfter}`);
/* 各栖姬 BOSS 类型正确 */
const m22 = MAPS.find(m => m.id === '2-2');
assert('2-2 BOSS为深海潜水栖姬（SS）', DEEP_TEMPLATES[ENEMY_FLEETS[m22.defs[m22.boss].enemy].ships[0]].type === 'SS' && DEEP_TEMPLATES[ENEMY_FLEETS[m22.defs[m22.boss].enemy].ships[0]].boss === true);
const m24 = MAPS.find(m => m.id === '2-4');
assert('2-4 BOSS为深海飞行场栖姬（CV）', DEEP_TEMPLATES[ENEMY_FLEETS[m24.defs[m24.boss].enemy].ships[0]].name === '深海飞行场栖姬');
const m34 = MAPS.find(m => m.id === '3-4');
assert('3-4 BOSS为深海北方栖姬（BB）', DEEP_TEMPLATES[ENEMY_FLEETS[m34.defs[m34.boss].enemy].ships[0]].name === '深海北方栖姬');
const m45 = MAPS.find(m => m.id === '4-5');
assert('4-5 BOSS为深海折钵山栖姬（BB）', DEEP_TEMPLATES[ENEMY_FLEETS[m45.defs[m45.boss].enemy].ships[0]].name === '深海折钵山栖姬');
const m55 = MAPS.find(m => m.id === '5-5');
assert('5-5 BOSS为深海大和栖姬（BB）', DEEP_TEMPLATES[ENEMY_FLEETS[m55.defs[m55.boss].enemy].ships[0]].name === '深海大和栖姬');
const m35 = MAPS.find(m => m.id === '3-5');
assert('3-5 道中存在北方栖姬（wiki 3-5 H点）', ENEMY_FLEETS[m35.defs.H.enemy].ships.includes('eB7'));
/* 新海域冒烟测试：满编强舰队对新旧BOSS，无崩溃且胜率合理 */
const smoke = [['2-3 BOSS F26', 'F26', 0.30], ['3-1 BOSS F35', 'F35', 0.30], ['3-4 BOSS F46', 'F46', 0.25], ['2-2 潜水栖姬 F21', 'F21', 0.20], ['2-3 输送舰队 F24', 'F24', 0.75], ['1-5 潜水旗舰 F50', 'F50', 0.50], ['2-5 空母旗舰 F53', 'F53', 0.50], ['3-5 轻巡Tsu F59', 'F59', 0.50], ['4-5 折钵山 F77', 'F77', 0.50], ['5-5 大和栖姬 F91', 'F91', 0.40]];
for (const [label, fk, thr] of smoke) {
  let w = 0, s = 0;
  for (let i = 0; i < 30; i++) {
    const r = Battle.battle(strongFleet, ENEMY_FLEETS[fk].ships, '单纵阵', ENEMY_FLEETS[fk].formation, { allowNight: true, fleetIdx: 1 });
    assert(`${label} 战斗#${i} 无异常`, typeof r.rank === 'string' && Array.isArray(r.log));
    if (r.rank === 'S' || r.rank === 'A' || r.rank === 'B') w++;
    if (r.rank === 'S') s++;
  }
  assert(`${label} 胜率≥${thr * 100}%`, w / 30 >= thr, `wins=${w}/30 (S${s})`);
  console.log(`  ${label} 胜率: ${w}/30 (S胜 ${s})`);
}
/* 满补给舰队走 C→D 路线（索敌≥20 发现弹药补给路线），BOSS战时弹药仍≥50% 可全力攻击 */
const logiPrevFleet = Game.state.fleet[1].slice();
const logiFleet = [];
for (const id of ['mahan', 'benson']) {
  const s = Game.createShip(id, 10);
  Game.equipDefaults(s.uid);
  s.supply = { fuel: 1, ammo: 1 };
  logiFleet.push(s.uid);
}
Game.state.fleet[1] = logiFleet;
assert('初始双驱逐索敌≥20（走C补给路线）', Game.fleetLos(1) >= 20, 'los=' + Game.fleetLos(1));
const lStart = Sortie.start('1-2', 1);
assert('1-2 出击启动', lStart.ok, JSON.stringify(lStart));
assert('满补给出击无低油弹警告', !lStart.warn, lStart.warn || '');
Sortie.advance('单纵阵', true); Sortie.moveToNext();                 // S → C（分支：索敌达标走C）
assert('1-2 索敌达标走C弹药资源点', Game.state.sortie.node === 'C', 'node=' + Game.state.sortie.node);
const lRes = Sortie.advance('单纵阵', true);
assert('C点收集弹药资源（不消耗油弹）', lRes.ok && lRes.type === 'resource' && lRes.res === 'ammo', JSON.stringify(lRes));
assert('C点后油弹未消耗', logiFleet.every(u => Game.state.ships[u].supply.ammo === 1 && Game.state.ships[u].supply.fuel === 1));
Sortie.moveToNext();                                                  // C → D（BOSS）
assert('C→D直达BOSS', Game.state.sortie.node === 'D', 'node=' + Game.state.sortie.node);
const lBoss = Sortie.advance('单纵阵', true);
assert('1-2 BOSS战正常', lBoss.ok && lBoss.type === 'boss', JSON.stringify(lBoss));
assert('BOSS战全程无「弹药耗尽」', !lBoss.result.log.some(l => typeof l === 'string' && l.includes('弹药耗尽')));
assert('一战到BOSS后弹药≥50%（满补给足够）', logiFleet.every(u => Game.state.ships[u].supply.ammo >= 0.5),
  logiFleet.map(u => Math.round(Game.state.ships[u].supply.ammo * 100) + '%').join(','));
Sortie.returnHome();
/* 低油弹出击警告 */
logiFleet.forEach(u => {
  const s = Game.state.ships[u];
  s.supply = { fuel: 1, ammo: 0.1 };
  s.hp = Game.shipStats(u).hpMax;
});
const lWarn = Sortie.start('1-2', 1);
assert('弹药不足出击返回警告', lWarn.ok && lWarn.warn && lWarn.warn.includes('弹10%'), JSON.stringify(lWarn));
Sortie.returnHome();
/* 弹药0%时炮击战无法攻击（wiki：残弹0无法炮击），战斗仍正常结算 */
logiFleet.forEach(u => { Game.state.ships[u].supply = { fuel: 1, ammo: 0 }; });
const lZero = Battle.battle(logiFleet, ENEMY_FLEETS.F06.ships, '单纵阵', '单纵阵', { allowNight: true, fleetIdx: 1 });
assert('弹药0%出现弹药耗尽提示', lZero.log.some(l => typeof l === 'string' && l.includes('弹药耗尽')), JSON.stringify(lZero.log.filter(l => typeof l === 'string' && l.includes('弹药耗尽'))));
assert('弹药0%战斗仍可结算', typeof lZero.rank === 'string' && lZero.rank.length === 1);
/* 恢复后续测试所需状态 */
Game.state.fleet[1] = logiPrevFleet;
for (const uid of logiFleet) Game.destroyShip(uid);

section('建造/开发（wiki：秘书舰系×资源池，即时结算，开发资材）');
Progression.initQuests();
Progression.resetDue();
const starterFleetBackup = Game.state.fleet[1].slice();
const b = Factory.startBuild({ fuel: 400, ammo: 400, steel: 500, baux: 500 });
assert('建造入队', b.ok && Game.state.construction.length === 1, JSON.stringify(b));
assert('资源扣除', Game.state.resources.fuel === 600);
Game.state.construction[0].end = Date.now() - 1;
const cb = Factory.claimBuild(0);
assert('建造完成出船', cb.ok && cb.ship && Game.state.ships[cb.ship.uid]);
Game.gain({ fuel: 500, ammo: 500, steel: 500, baux: 500 });

/* 开发池判定（参照 wiki：最高资源，优先级 燃料/钢材 > 弹药 > 铝） */
assert('10/251/250/10 → 弹药池', devPoolKey({ fuel: 10, ammo: 251, steel: 250, baux: 10 }) === DEV_POOL.AMMO, devPoolKey({ fuel: 10, ammo: 251, steel: 250, baux: 10 }));
assert('10/10/250/250 → 油钢池(钢=铝时钢优先)', devPoolKey({ fuel: 10, ammo: 10, steel: 250, baux: 250 }) === DEV_POOL.OIL);
assert('20/60/10/110 → 铝池', devPoolKey({ fuel: 20, ammo: 60, steel: 10, baux: 110 }) === DEV_POOL.BAUX);
assert('10/10/10/11 → 铝池', devPoolKey({ fuel: 10, ammo: 10, steel: 10, baux: 11 }) === DEV_POOL.BAUX);
assert('100/90/300/250 → 油钢池', devPoolKey({ fuel: 100, ammo: 90, steel: 300, baux: 250 }) === DEV_POOL.OIL);
assert('秘书舰系：DD=水雷系', secretaryKey(Game.shipDef(Game.state.ships[Game.state.fleet[1][0]])) === DEV_SEC.MINE);
assert('秘书舰系：空母=空母系', secretaryKey({ type: 'CV' }) === DEV_SEC.CV);
assert('秘书舰系：战列=炮战系', secretaryKey({ type: 'BB' }) === DEV_SEC.GUN);
assert('秘书舰系：潜艇=潜水系', secretaryKey({ type: 'SS' }) === DEV_SEC.SUB);
/* 开发池内容 */
const cvEntries = devEntries(DEV_SEC.CV, DEV_POOL.BAUX);
assert('空母系铝池含舰战', cvEntries.some(e => e.id === 'f4f'), cvEntries.map(e => e.id).join(','));
const cvSum = cvEntries.reduce((s, e) => s + e.rate, 0);
assert('空母系铝池总份额≤50', cvSum <= 50, 'sum=' + cvSum);
assert('出货率=份额×2%（F4F=4份额→8%）', cvEntries.find(e => e.id === 'f4f').rate * 2 === 8);
assert('失败份额=50-Σ', devFailShare(DEV_SEC.CV, DEV_POOL.BAUX) === 50 - cvSum);
/* 开发资材与失败返还 */
const devMats0 = Game.state.resources.devMats;
assert('初始开发资材=10', devMats0 === 10);
assert('开发资材为0时拒绝', (Game.state.resources.devMats = 0, !Factory.develop({ fuel: 10, ammo: 20, steel: 10, baux: 30 }, Game.state.fleet[1][0]).ok));
Game.state.resources.devMats = devMats0;
/* 确定性随机：roll=50（命中装备区），加权选份额最大者 */
const _ri = Util.ri, _w = Util.weighted;
Util.ri = (a, b) => b;
Util.weighted = t => { let best = null, bv = -1; for (const k in t) if (t[k] > bv) { bv = t[k]; best = k; } return best; };
const resBefore = { ...Game.state.resources };
/* 高失败配方 10/10/10/11（空母系·铝池）：roll 出 f4f 但铝<门槛 → 失败，资材不消耗 */
const cvSec = Game.createShip('enterprise', 1);
Game.state.fleet[1] = [cvSec.uid];
Game.state.admiral.level = 40;
const dFail = Factory.develop({ fuel: 10, ammo: 10, steel: 10, baux: 11 }, cvSec.uid);
assert('省资材配方开发失败(资源不足门槛)', dFail.ok && !dFail.success, JSON.stringify(dFail && dFail.msg));
assert('失败不消耗开发资材', Game.state.resources.devMats === devMats0, 'devMats=' + Game.state.resources.devMats);
assert('失败消耗资源', Game.state.resources.baux === resBefore.baux - 11, 'baux=' + Game.state.resources.baux);
/* 通用飞机配方 20/60/10/110（空母系·铝池）：成功获得 F4F（份额最大） */
const dOk = Factory.develop({ fuel: 20, ammo: 60, steel: 10, baux: 110 }, cvSec.uid);
assert('通用飞机配方开发成功得F4F', dOk.ok && dOk.success && dOk.eq.id === 'f4f', JSON.stringify(dOk && dOk.eq && dOk.eq.id));
assert('成功消耗1开发资材', Game.state.resources.devMats === devMats0 - 1, 'devMats=' + Game.state.resources.devMats);
/* 主炮狙击 10/251/250/10（炮战系·弹药池）：成功获得 16inch Mk6（份额最大） */
const bbSec = Game.createShip('iowa', 1);
Game.state.fleet[1] = [bbSec.uid];
const dBB = Factory.develop({ fuel: 10, ammo: 251, steel: 250, baux: 10 }, bbSec.uid);
assert('主炮狙击开发成功得16inch Mk6', dBB.ok && dBB.success && dBB.eq.id === 'gun16in_45', JSON.stringify(dBB && dBB.eq && dBB.eq.id));
/* 资源门槛：10/10/10/10（炮战系·油钢池）roll 出 radar_sg 但钢<120 → 失败 */
const dLow = Factory.develop({ fuel: 10, ammo: 10, steel: 10, baux: 10 }, bbSec.uid);
assert('低投入开发失败(不满足最低资源要求)', dLow.ok && !dLow.success, JSON.stringify(dLow && dLow.msg));
/* 等级门槛：提督等级<稀有度×10 → 失败 */
Game.state.admiral.level = 1;
const dLv = Factory.develop({ fuel: 20, ammo: 60, steel: 10, baux: 110 }, cvSec.uid);
assert('提督等级过低开发失败(需Lv.10)', dLv.ok && !dLv.success && dLv.msg.includes('Lv'), JSON.stringify(dLv && dLv.msg));
Game.state.admiral.level = 40;
/* 开发预览 */
const pv = Factory.developPreview({ fuel: 10, ammo: 251, steel: 250, baux: 10 }, bbSec.uid);
assert('预览：炮战系·弹药池', pv.secKey === DEV_SEC.GUN && pv.pool === DEV_POOL.AMMO, JSON.stringify({ s: pv.secKey, p: pv.pool }));
Util.ri = _ri; Util.weighted = _w;
/* 开发失败也计入每日任务 → 可领取日常（+1开发资材） */
const devCount = Game.state.stats.develop;
Factory.develop({ fuel: 10, ammo: 10, steel: 10, baux: 11 }, cvSec.uid);
Factory.develop({ fuel: 10, ammo: 10, steel: 10, baux: 11 }, cvSec.uid);
assert('开发失败计入次数', Game.state.stats.develop === devCount + 2, 'n=' + Game.state.stats.develop);
Progression.notify('develop', 1);
const cq6 = Progression.claimQuest('d6');
assert('日常开发任务可领取(+1开发资材)', cq6.ok && Game.state.resources.devMats === devMats0 - 2 + 1, 'devMats=' + Game.state.resources.devMats);

/* 批量开发（10连） */
section('批量开发（10连）');
Game.state.admiral.level = 40;
Game.state.resources.devMats = 50;
Game.gain({ fuel: 20000, ammo: 20000, steel: 20000, baux: 20000 });
const _bri = Util.ri, _bw = Util.weighted;
Util.ri = (a, b) => b;
Util.weighted = t => { let best = null, bv = -1; for (const k in t) if (t[k] > bv) { bv = t[k]; best = k; } return best; };
const bFuel = Game.state.resources.fuel;
const batch = Factory.developBatch({ fuel: 20, ammo: 60, steel: 10, baux: 110 }, cvSec.uid, 10);
assert('10连全部成功(确定性随机)', batch.ok && batch.success === 10 && batch.eqs.length === 10 && batch.fail === 0, JSON.stringify({ s: batch.success, f: batch.fail }));
assert('10连消耗10开发资材', Game.state.resources.devMats === 40, 'devMats=' + Game.state.resources.devMats);
assert('10连资源消耗×10', Game.state.resources.fuel === bFuel - 200, 'fuel=' + Game.state.resources.fuel);
assert('10连获得装备可入仓库', batch.eqs.every(eq => Game.state.equipment[eq.uid]), 'n=' + batch.eqs.length);
/* 开发资材不足时提前停止 */
Game.state.resources.devMats = 3;
const batch2 = Factory.developBatch({ fuel: 20, ammo: 60, steel: 10, baux: 110 }, cvSec.uid, 10);
assert('资材不足提前停止(仅3次)', batch2.ok && batch2.stopped && batch2.attempts === 3 && batch2.success === 3, JSON.stringify({ attempts: batch2.attempts, stopped: batch2.stopped }));
assert('提前停止后资材为0', Game.state.resources.devMats === 0);
/* 资源不足整批被拒 */
const batch3 = Factory.developBatch({ fuel: 99999, ammo: 60, steel: 10, baux: 110 }, cvSec.uid, 10);
assert('资源不足10连被拒', !batch3.ok && batch3.msg.includes('资源不足'), batch3.msg);
Util.ri = _bri; Util.weighted = _bw;

section('装备解体（wiki：解体回收资源，装备中/上锁不可解体）');
const eqS = Game.createEquip('aa_20mm');
const rScrap = Factory.scrapEquip(eqS.uid);
assert('解体成功回收钢材', rScrap.ok && rScrap.gain.steel === 3, JSON.stringify(rScrap));
assert('解体后装备消失', !Game.state.equipment[eqS.uid]);
const eqU = Game.createEquip('gun5in_30');
Game.state.ships[Game.state.fleet[1][0]].equipped.push(eqU.uid);
assert('装备中的不能解体', !Factory.scrapEquip(eqU.uid).ok);
const eqL = Game.createEquip('torp_mk15');
Factory.toggleEquipLock(eqL.uid);
assert('上锁后不能解体', !Factory.scrapEquip(eqL.uid).ok);
Factory.toggleEquipLock(eqL.uid);
assert('解锁后可解体', Factory.scrapEquip(eqL.uid).ok);
/* 恢复初始舰队（后续远征/养成测试依赖） */
Game.state.fleet[1] = starterFleetBackup;
/* 远征奖励包含开发资材（ex8：+2） */
const ex8DevMats = Game.state.resources.devMats;
Game.state.fleet[1] = strongFleet.slice();
const ex8 = Logistics.startExpedition(1, 'ex8');
Game.state.expeditions[1].end = Date.now() - 1;
const ex8r = Logistics.claimExpedition(1);
Game.state.fleet[1] = starterFleetBackup;
assert('ex8远征奖励开发资材+2(大成功+4)', ex8.ok && ex8r.ok && (Game.state.resources.devMats === ex8DevMats + 2 || Game.state.resources.devMats === ex8DevMats + 4), 'devMats=' + Game.state.resources.devMats);

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
/* 弗莱彻改造需 Lv.40（累计经验 78,000）；此处给足 80,000，避免因经验表调整导致用例失效 */
Progression.addShipExp(ddUid, 80000);
assert('升级成功', s0.lv > 1, `lv=${s0.lv}`);
assert('改造解锁', Progression.remodelInfo(ddUid) !== null);
const rm = Progression.remodel(ddUid);
assert('改造成功', rm.ok, JSON.stringify(rm));
assert('改造后kai=1', s0.kai === 1);
assert('hp回满', s0.hp === Game.shipStats(ddUid).hpMax);
const mi = Progression.modernizeInfo(ddUid);
assert('近代化可选', mi && Object.keys(mi.gains).length > 0, JSON.stringify(mi && mi.gains));
if (mi && Object.keys(mi.gains).length) {
  const m = Progression.modernize(ddUid, [Game.state.fleet[1][1]]);
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

section('wiki还原机制（战斗/经验）');
/* 经验曲线（参照舰娘百科经验表：Lv1~99 累计100万） */
assert('升级曲线 Lv1→2=100', Progression.shipExpToLevel(1) === 100);
assert('升级曲线 Lv10→11=1000', Progression.shipExpToLevel(10) === 1000);
assert('升级曲线 Lv50→51=5000', Progression.shipExpToLevel(50) === 5000);
assert('升级曲线 Lv98→99=148500', Progression.shipExpToLevel(98) === 148500);
let cumExp = 0;
for (let lv = 1; lv <= 98; lv++) cumExp += Progression.shipExpToLevel(lv);
assert('Lv1→99 累计100万', cumExp === 1000000, 'cum=' + cumExp);
/* 等级上限与婚后曲线（参照wiki：100~175/176~180/181~185/186~188） */
assert('等级上限188', Progression.MAX_LV === 188);
assert('升级曲线 Lv99→100=148500', Progression.shipExpToLevel(99) === 148500);
assert('升级曲线 Lv100→101=10000', Progression.shipExpToLevel(100) === 10000);
assert('升级曲线 Lv150→151=204000', Progression.shipExpToLevel(150) === 204000);
assert('升级曲线 Lv165→166=100000', Progression.shipExpToLevel(165) === 100000);
assert('升级曲线 Lv174→175=684000', Progression.shipExpToLevel(174) === 684000);
assert('升级曲线 Lv175→176=150000', Progression.shipExpToLevel(175) === 150000);
assert('升级曲线 Lv184→185=1000000', Progression.shipExpToLevel(184) === 1000000);
assert('升级曲线 Lv187→188=1600000', Progression.shipExpToLevel(187) === 1600000);
assert('满级无需经验', Progression.shipExpToLevel(188) === 0);
assert('累计经验 Lv99=100万', Progression.shipCumExp(99) === 1000000);
assert('累计经验 Lv188=2034.85万(含99→100的14.85万)', Progression.shipCumExp(188) === 20348500, 'cum=' + Progression.shipCumExp(188));
/* 提督经验曲线（参照wiki：Lv99=100万、Lv120=1500万） */
assert('提督 Lv1→2=100', Game.expForLevel(1) === 100);
assert('提督 Lv99→100=30万', Game.expForLevel(99) === 300000, 'exp=' + Game.expForLevel(99));
assert('提督 Lv119→120=100万', Game.expForLevel(119) === 1000000, 'exp=' + Game.expForLevel(119));
assert('提督满级120', Game.expForLevel(120) === 0);
assert('头衔：Lv1=新米少佐', Game.admiralTitle(1) === '新米少佐');
assert('头衔：Lv40=中坚少佐', Game.admiralTitle(40) === '中坚少佐');
assert('头衔：Lv46=少佐', Game.admiralTitle(46) === '少佐');
assert('头衔：Lv60=新米中佐', Game.admiralTitle(60) === '新米中佐');
assert('头衔：Lv80=大佐', Game.admiralTitle(80) === '大佐');
assert('头衔：Lv120=元帅', Game.admiralTitle(120) === '元帅');
/* 升级变慢：5万经验只能升到~33级 */
const slowShip = Game.createShip('mahan', 1);
Progression.addShipExp(slowShip.uid, 50000);
assert('5万经验升到30级左右（旧版直升99）', slowShip.lv >= 10 && slowShip.lv <= 40, 'lv=' + slowShip.lv);
Game.destroyShip(slowShip.uid);
/* 防沉保护：我方舰船战斗中不会死亡 */
const protFleet = [Game.state.fleet[1][0], Game.state.fleet[1][1]];
const protRes = Battle.battle(protFleet, ENEMY_FLEETS.F09.ships, '单纵阵', '单纵阵', { allowNight: true, fleetIdx: 1 });
assert('防沉保护：我方全员存活', protRes.mySide.every(x => x.hp >= 1), 'hp=' + protRes.mySide.map(x => x.hp).join(','));
/* 完全胜利S与MVP */
let sawPerfect = false, sawMvp = false;
for (let i = 0; i < 20; i++) {
  const r = Battle.battle(strongFleet, ENEMY_FLEETS.F01.ships, '单纵阵', '单纵阵', { allowNight: true, fleetIdx: 1 });
  if (r.rank === 'S') {
    if (r.perfect) sawPerfect = true;
    if (r.mvpUid) sawMvp = true;
  }
}
assert('存在完全胜利S（无伤全歼）', sawPerfect);
assert('MVP正常产生', sawMvp);
/* 出击经验：基础=敌HP/2 ×评价×旗舰×MVP */
const expRes = Battle.battle(strongFleet, ENEMY_FLEETS.F01.ships, '单纵阵', '单纵阵', { allowNight: true, fleetIdx: 1 });
assert('F01敌总HP=60', expRes.enemyHpTotal === 60);
const expGains = Progression.applyBattleResult(1, expRes, false).gains;
const expBase = expRes.perfect ? Math.floor(30 * 1.2) : 30;
const plainGain = expGains.find(g => g.uid !== strongFleet[0] && g.uid !== expRes.mvpUid) || expGains[0];
assert('基础经验=敌HP总和/2' + (expRes.perfect ? '×1.2' : ''), plainGain.exp === expBase, 'exp=' + plainGain.exp);
const expMvp = expGains.find(g => g.uid === expRes.mvpUid);
const expFlag = expGains.find(g => g.uid === strongFleet[0]);
assert('MVP经验×2', !!expMvp && expMvp.exp === expBase * 2 * (expMvp === expFlag ? 1.5 : 1), 'exp=' + (expMvp && expMvp.exp));
assert('旗舰经验×1.5', !!expFlag && expFlag.exp === expBase * 1.5 * (expFlag === expMvp ? 2 : 1), 'exp=' + (expFlag && expFlag.exp));
/* 演习经验：敌方旗舰累计/100 + 第2舰累计/300（>500 时开根，S×1.2） */
const pracRes = Battle.battle(strongFleet, pr.fleets[0].ships, '单纵阵', '单纵阵', { allowNight: true, fleetIdx: 1 });
const pracGains = Progression.applyBattleResult(1, pracRes, true).gains;
assert('演习经验按wiki公式', pracGains.every(g => g.exp > 0 && g.exp < 5000), 'exp=' + pracGains.map(g => g.exp).join(','));
/* 演习提督经验：20~160 且为20的倍数 */
const pracAdm = Progression.applyBattleResult(1, pracRes, true).adm;
assert('演习提督经验∈[20,160]且为20倍数', pracAdm.exp >= 20 && pracAdm.exp <= 160 && pracAdm.exp % 20 === 0, 'adm=' + pracAdm.exp);
/* 远征经验：基础(30)×旗舰1.5×(随机2倍)×(大成功2倍) */
const exFleet = [];
for (const id of ['fletcher', 'kidd']) {
  /* 初始等级给到 3（升4级需300经验，远征最多180），避免升级扣减破坏 15 倍数断言 */
  const s = Game.createShip(id, 3);
  s.exp = 0;
  Game.equipDefaults(s.uid);
  exFleet.push(s.uid);
}
Game.state.fleet[2] = exFleet;
const exStart = Logistics.startExpedition(2, 'ex1');
Game.state.expeditions[2].end = Date.now() - 1;
Logistics.claimExpedition(2);
const exFlagExp = Game.state.ships[exFleet[0]].exp, exOtherExp = Game.state.ships[exFleet[1]].exp;
/* 随机2倍/大成功2倍按舰独立判定，僚舰可高于旗舰（旗舰60×1.5×1 vs 僚舰30×2），仅校验公式形状 */
assert('远征经验：基础30×(旗舰1.5×随机2倍×大成功2倍)', exFlagExp > 0 && exOtherExp > 0 && exFlagExp % 15 === 0 && exOtherExp % 15 === 0 && exFlagExp >= exOtherExp / 2,
  `flag=${exFlagExp} other=${exOtherExp}`);
/* 旗舰大破禁出击 */
Game.state.fleet[1] = strongFleet;
const fs = Game.state.ships[strongFleet[0]];
fs.hp = Math.floor(Game.shipStats(fs.uid).hpMax * 0.2);
const fsStart = Sortie.start('1-1', 1);
assert('旗舰大破无法出击', !fsStart.ok && fsStart.msg.includes('旗舰大破'), fsStart.msg);
fs.hp = Game.shipStats(fs.uid).hpMax;
/* 大破进击轰沉 */
const doomedShip = Game.state.ships[strongFleet[2]];
doomedShip.hp = Math.floor(Game.shipStats(doomedShip.uid).hpMax * 0.2);
const dsStart = Sortie.start('1-1', 1);
assert('僚舰大破可出击', dsStart.ok);
assert('daPoShips识别大破僚舰', Sortie.daPoShips().length === 1);
Sortie.advance('单纵阵', true);      // S → move
Sortie.moveToNext();                 // → A
const dsAdv = Sortie.advance('单纵阵', true);  // A 战斗 → 轰沉
assert('大破进击战斗正常', dsAdv.ok && dsAdv.type === 'battle');
assert('大破进击僚舰轰沉', !Game.state.ships[doomedShip.uid]);
assert('战斗日志包含轰沉提示', dsAdv.result.log.some(l => typeof l === 'string' && l.includes('轰沉')));
Sortie.returnHome();

section('近代化改修（wiki标准：素材值/奖励偏斜/上限/海防舰/改造重置）');
/* 素材属性值表 */
const fk = Game.createShip('fletcher', 1);
assert('素材值 DD=火力1雷装1', Progression.materialValue(fk.uid).fp === 1 && Progression.materialValue(fk.uid).tp === 1, JSON.stringify(Progression.materialValue(fk.uid)));
const fk2 = Game.createShip('fletcher', 40);
fk2.kai = 1;
assert('素材值 改DD=火力2', Progression.materialValue(fk2.uid).fp === 2, JSON.stringify(Progression.materialValue(fk2.uid)));
const iowaM = Game.createShip('iowa', 60);
iowaM.kai = 1;
iowaM.locked = false;   // 稀有舰艇自动上锁，素材测试需先解锁
const imv = Progression.materialValue(iowaM.uid);
assert('素材值 改BB=火力4装甲4对空2', imv.fp === 4 && imv.arm === 4 && imv.aa === 2, JSON.stringify(imv));
/* 奖励/偏斜公式（参照wiki上升量表） */
assert('奖励值 n=1→1', Progression.gainReward(1) === 1);
assert('奖励值 n=4→5(+1奖励)', Progression.gainReward(4) === 5);
assert('奖励值 n=9→11(+2奖励)', Progression.gainReward(9) === 11);
assert('奖励值 n=24→29(+5奖励)', Progression.gainReward(24) === 29);
assert('偏斜值 n=1→0', Progression.gainDeviation(1) === 0);
assert('偏斜值 n=3→2', Progression.gainDeviation(3) === 2);
assert('偏斜值 n=9→5', Progression.gainDeviation(9) === 5);
/* 多素材合成 */
Game.gain({ fuel: 500, ammo: 500 });
const t1 = Game.createShip('mahan', 1);
const m1 = Game.createShip('benson', 1);
const m2 = Game.createShip('benson', 1);
const pv1 = Progression.modernizePreview(t1.uid, [m1.uid, m2.uid]);
assert('双素材预览：火力+2（奖励）', pv1.ok && pv1.shown.fp === 2 && pv1.shown.tp === 2, JSON.stringify(pv1 && pv1.shown));
const ms1 = Progression.modernize(t1.uid, [m1.uid, m2.uid]);
assert('合成成功', ms1.ok, JSON.stringify(ms1));
assert('素材舰被消耗', !Game.state.ships[m1.uid] && !Game.state.ships[m2.uid]);
assert('目标属性增加（奖励2或偏斜1）', t1.modern.fp >= 1 && t1.modern.fp <= 2, JSON.stringify(t1.modern));
/* 奖励点与上限截断 */
const t2 = Game.createShip('mahan', 1);
const pv2 = Progression.modernizePreview(t2.uid, [iowaM.uid]);
assert('BB素材预览：火力上限截断为+3（奖励点1）', pv2.ok && pv2.shown.fp === 3 && pv2.bonus.fp === 1, JSON.stringify(pv2));
const ms2 = Progression.modernize(t2.uid, [iowaM.uid]);
assert('合成成功2', ms2.ok);
assert('火力改修值=上限(3)或偏斜(2)', t2.modern.fp === 3 || t2.modern.fp === 2, 'fp=' + t2.modern.fp);
/* 满改修后不可再改修 */
const t3 = Game.createShip('mahan', 1);
const caps3 = Progression.modernizeInfo(t3.uid).gains;
for (const k in caps3) t3.modern[k] = caps3[k];
assert('满改修后无可提升属性', Object.keys(Progression.modernizeInfo(t3.uid).gains).length === 0);
assert('满改修后合成被拒', !Progression.modernizePreview(t3.uid, [iowaM.uid]).ok);
/* 普通素材不能喂 运/对潜/耐久 */
const t4 = Game.createShip('mahan', 1);
Progression.modernize(t4.uid, [Game.createShip('fletcher', 1).uid]);
assert('普通素材不提供运/对潜/耐久', !t4.modern.lck && !t4.modern.asw && !t4.modern.hp, JSON.stringify(t4.modern));
/* 海防舰(DE)改修：耐久/对潜/运 */
const de = Game.createShip('sbroberts', 1);
de.locked = false;   // 稀有舰艇自动上锁，素材测试需先解锁
const dev1 = Progression.materialValue(de.uid);
assert('DE素材=耐久1对潜1运1', dev1.hp === 1 && dev1.asw === 1 && dev1.lck === 1, JSON.stringify(dev1));
const t5 = Game.createShip('mahan', 1);
const pv5 = Progression.modernizePreview(t5.uid, [de.uid]);
assert('DE预览提供耐久/对潜/运', pv5.ok && pv5.shown.hp === 1 && pv5.shown.asw === 1 && pv5.shown.lck === 1, JSON.stringify(pv5));
const de2 = Game.createShip('sbroberts', 1);
de2.locked = false;
Progression.modernize(t5.uid, [de.uid, de2.uid]);
assert('DE改修后三属性+1以上', t5.modern.hp >= 1 && t5.modern.asw >= 1 && t5.modern.lck >= 1, JSON.stringify(t5.modern));
assert('运改修上限+8', Progression.modernCap(t4.uid, 'lck') === 8, 'cap=' + Progression.modernCap(t4.uid, 'lck'));
assert('对潜改修上限+9', Progression.modernCap(t4.uid, 'asw') === 9);
/* 改造重置：火力/雷装/对空/装甲不继承，运/对潜/耐久继承 */
const t6 = Game.createShip('mahan', 30);
const fkM1 = Game.createShip('fletcher', 1); fkM1.locked = false;   // 稀有舰艇自动上锁，素材测试需先解锁
const fkM2 = Game.createShip('fletcher', 1); fkM2.locked = false;
Progression.modernize(t6.uid, [fkM1.uid, fkM2.uid]);
const de3 = Game.createShip('sbroberts', 1); de3.locked = false;
const de4 = Game.createShip('sbroberts', 1); de4.locked = false;
Progression.modernize(t6.uid, [de3.uid, de4.uid]);
assert('改造前有改修值', t6.modern.fp > 0 || t6.modern.tp > 0);
assert('改造前DE属性已改修', t6.modern.asw >= 1);
const rmt = Progression.remodel(t6.uid);
assert('改造成功', rmt.ok, JSON.stringify(rmt));
assert('改造后火力改修重置', t6.modern.fp === 0 && t6.modern.tp === 0, JSON.stringify(t6.modern));
assert('改造后运/对潜继承', t6.modern.asw >= 1);

section('改修工厂（明石=维斯塔尔）');
assert('未开启：无维斯塔尔秘书舰', !Improve.secretaryIsVestal());
const vestal = Game.createShip('vestal', 1);
const vestal2 = Game.createShip('vestal', 1);
Game.state.fleet[1] = [vestal.uid, vestal2.uid];
assert('维斯塔尔秘书舰开启改修工厂', Improve.secretaryIsVestal());
assert('每日上限=2（二号舰工作舰）', Improve.dailyLimit() === 2, 'limit=' + Improve.dailyLimit());
Game.state.resources.screws = 100;
Game.gain({ fuel: 500, ammo: 500, steel: 500, baux: 500 });
const eqI1 = Game.createEquip('gun5in_30');
assert('基础装备无需二号舰解锁', Improve.improveInfo(eqI1.uid).unlocked === true);
const eqBig = Game.createEquip('gun16in_45');
assert('大主炮未解锁（无战列舰二号舰）', Improve.improveInfo(eqBig.uid).unlocked === false);
const iowa2 = Game.createShip('iowa', 1);
Game.state.fleet[1] = [vestal.uid, iowa2.uid];
assert('战列舰二号舰解锁大主炮', Improve.improveInfo(eqBig.uid).unlocked === true);
Game.state.fleet[1] = [vestal.uid, vestal2.uid];
const rI1 = Improve.improve(eqI1.uid, false);
assert('改修成功★0→1', rI1.ok && rI1.success && eqI1.star === 1, JSON.stringify(rI1));
const scA = Game.state.resources.screws;
Improve.improve(eqI1.uid, true);
assert('确定化消耗2倍螺丝(1×2)', Game.state.resources.screws === scA - 2, 'screws=' + Game.state.resources.screws);
const usedA = Improve.dailyUsed();
const rI2 = Improve.improve(eqI1.uid, false);
assert('每日上限后拒绝', !rI2.ok && Improve.dailyUsed() === usedA, JSON.stringify(rI2));
/* 清空起始库存中未装备的 gun5in_30（起始库存有2件★0，避免干扰素材判定） */
{
  const used = new Set();
  for (const sh of Object.values(Game.state.ships)) for (const e of sh.equipped) used.add(e);
  for (const k in Game.state.equipment) {
    const e = Game.state.equipment[k];
    if (e.id === 'gun5in_30' && !used.has(k)) delete Game.state.equipment[k];
  }
}
/* ★+6 需要同名素材 */
Game.state.improve.count = 0;
const eqI2 = Game.createEquip('gun5in_30');
eqI2.star = 6;
const rI3 = Improve.improve(eqI2.uid, true);
assert('★6改修缺少素材被拒', !rI3.ok && rI3.msg.includes('素材'), rI3.msg);
const matE = Game.createEquip('gun5in_30');
Game.state.improve.count = 0;
const rI4 = Improve.improve(eqI2.uid, true);
assert('★6改修消耗素材且成功', rI4.ok && rI4.success && eqI2.star === 7 && !Game.state.equipment[matE.uid], JSON.stringify(rI4));
/* 高星失败与确定化 */
const eqI3 = Game.createEquip('gun5in_30');
eqI3.star = 9;
const matG = Game.createEquip('gun5in_30');
Game.state.improve.count = 0;
const scB = Game.state.resources.screws;
const rI5 = Improve.improve(eqI3.uid, true);
assert('确定化必定成功★9→MAX', rI5.ok && rI5.success && eqI3.star === 10 && !Game.state.equipment[matG.uid], JSON.stringify(rI5));
assert('确定化消耗2倍螺丝(★6+=2×2)', Game.state.resources.screws === scB - 4, 'screws=' + Game.state.resources.screws);
/* 成功率数据（wiki表） */
assert('成功率表 ★4→5=95%', Improve.successRate(4) === 95);
assert('成功率表 ★9→MAX=60%', Improve.successRate(9) === 60);
assert('更新成功率=50%', Improve.successRate(10) === 50);
/* 装备更新（进化） */
const eqI4 = Game.createEquip('gun5in_30');
eqI4.star = 10;
const matU1 = Game.createEquip('gun5in_30');
const matU2 = Game.createEquip('gun5in_30');
Game.state.improve.count = 0;
const rI6 = Improve.updateEquip(eqI4.uid, true);
assert('★MAX更新成功→5inch连装两用炮★5', rI6.ok && rI6.success && eqI4.id === 'gun5in_38' && eqI4.star === 5, JSON.stringify(rI6));
assert('更新消耗2素材', !Game.state.equipment[matU1.uid] && !Game.state.equipment[matU2.uid]);
/* 装备中的装备不可改修 */
const eqI5 = Game.createEquip('gun5in_30');
const ddShip = Game.createShip('mahan', 1);
ddShip.equipped = [eqI5.uid];
assert('装备中的装备无法改修', Improve.improveInfo(eqI5.uid).available === false);
/* 改修效果：改修强化值 = 系数×√★ */
const starShip = Game.createShip('mahan', 1);
const eqI6 = Game.createEquip('gun5in_30');
eqI6.star = 4;
starShip.equipped = [eqI6.uid];
const sts = Game.shipStats(starShip.uid);
assert('★4小主炮：火力+2 改修效果', Math.abs(sts.fp - 14) < 0.001, 'fp=' + sts.fp);
/* 改修相关任务 */
Game.state.quests = {};
Progression.initQuests();
Progression.resetDue();
const eqI7 = Game.createEquip('gun5in_30');
Game.state.improve.count = 0;
Improve.improve(eqI7.uid, true);
assert('改修日常任务进度', Game.state.quests.d9.progress === 1, 'p=' + Game.state.quests.d9.progress);
const cq9 = Progression.claimQuest('d9');
assert('领取改修日常（+1螺丝+50弹）', cq9.ok && Game.state.resources.screws >= 1 && Game.state.resources.ammo >= 50, JSON.stringify(cq9 && cq9.q && cq9.q.id));

section('账号系统（注册/登录/云存档/管理员）');
const A = authMod;
A.clearSessions();
const uName = 'test_' + Date.now() % 100000;
const rReg = A.registerUser(uName, 'secret123');
assert('注册成功', rReg.ok && rReg.username === uName, JSON.stringify(rReg));
assert('注册无存档(首次)', rReg.save === null);
assert('注册角色为 user', rReg.role === 'user');
assert('注册重复被拒', !A.registerUser(uName, 'secret123').ok);
assert('保留用户名 admin 不可注册', !A.registerUser('admin', 'whatever1').ok);
assert('非法用户名被拒', !A.registerUser('a', 'secret123').ok);
assert('非法用户名被拒2', !A.registerUser('bad name!', 'secret123').ok);
assert('短密码被拒', !A.registerUser('newuser01', '123').ok);
assert('错误密码登录被拒', !A.loginUser(uName, 'wrongpass').ok);
const rLog = A.loginUser(uName, 'secret123');
assert('正确密码登录成功', rLog.ok && rLog.token, JSON.stringify(rLog));
const token = rLog.token;
/* 存档往返 */
const fakeSave = { version: 1, admiral: { name: '提督', level: 5, exp: 0 }, ships: {}, foo: 'bar' };
A.putSave(uName, fakeSave);
const gs = A.loadSave(uName);
assert('云存档写入后读回一致', gs && gs.foo === 'bar' && gs.admiral.level === 5);
assert('token 鉴权有效', A.authenticate(token) === uName);
assert('伪造 token 无效', A.authenticate('deadbeef') === null);
/* 登录返回存档 */
const rLog2 = A.loginUser(uName, 'secret123');
assert('登录返回已有存档', rLog2.save && rLog2.save.foo === 'bar');
A.revoke(token);
assert('登出后 token 失效', A.authenticate(token) === null);
/* 管理员账号 */
const rAdm = A.ensureAdmin();
assert('ensureAdmin 创建成功', rAdm.ok && rAdm.username === 'admin');
assert('ensureAdmin 幂等', A.ensureAdmin().existed === true);
const rAdmL = A.loginUser('admin', 'admin');
assert('admin 登录成功且 role=admin', rAdmL.ok && rAdmL.role === 'admin', JSON.stringify(rAdmL));
const admToken = rAdmL.token;
assert('sessionInfo 返回角色', A.sessionInfo(admToken) && A.sessionInfo(admToken).role === 'admin');
/* 普通用户 sessionInfo */
const uTok = A.loginUser(uName, 'secret123').token;
assert('普通用户角色为 user', A.sessionInfo(uTok).role === 'user');
/* cookie 解析 */
assert('cookie 解析正常', A.cookieToken('foo=1; usnc_session=abc123; bar=2') === 'abc123');
assert('cookie 无会话返回空', A.cookieToken('foo=1') === '');
assert('cookie 空头返回空', A.cookieToken(null) === '');
/* 与游戏存档互操作：Game.serialize 可被 putSave 存下并被 loadData 恢复 */
const snap = Game.serialize();
A.putSave(uName, snap);
const gs2 = A.loadSave(uName);
assert('游戏存档可入云', gs2 && gs2.ships && Object.keys(gs2.ships).length > 0);
Game.newGame();
Game.loadData(gs2);
assert('云存档可恢复游戏状态', Object.keys(Game.state.ships).length === Object.keys(gs2.ships).length && Game.state.resources.fuel >= gs2.resources.fuel, 'fuel=' + Game.state.resources.fuel);
/* 游客旧档迁移逻辑（模拟登录无档账号时带走本地档） */
Game.newGame();
const localSave = Game.serialize();
global.localStorage.setItem('usnc_save_v1', JSON.stringify(localSave));
Game.newGame();
Game.loadData(JSON.parse(global.localStorage.getItem('usnc_save_v1')));
assert('游客档可被账号载入(迁移)', Object.keys(Game.state.ships).length === Object.keys(localSave.ships).length);
/* 破损存档修复：服务器坏档（无舰船/无海域进度）加载后自动补发初始舰队与海域进度 */
const brokenSave = { version: 1, admiral: { name: '迁移测试', level: 9, exp: 0 }, resources: { fuel: 999999, ammo: 999999, steel: 999999, baux: 999999, screws: 3000 }, fleet: { 1: [], 2: [] }, ships: {}, equipment: {}, mapProgress: {} };
Game.newGame();
Game.loadData(brokenSave);
assert('坏档修复：补发初始双舰', Object.keys(Game.state.ships).length === 2, JSON.stringify(Object.keys(Game.state.ships)));
assert('坏档修复：初始舰编入舰队1', Game.state.fleet[1].length === 2, 'fleet1=' + Game.state.fleet[1].length);
assert('坏档修复：海域进度补全', Object.keys(Game.state.mapProgress).length === MAPS.length && Game.state.mapProgress[MAPS[0].id].cleared === false, 'maps=' + Object.keys(Game.state.mapProgress).length);
assert('坏档迁移：开发资材默认10', Game.state.resources.devMats === 10, 'devMats=' + Game.state.resources.devMats);
/* 测试模式管理员校验：非 admin 环境下 isTestMode 恒为 false */
assert('非管理员无法开启测试模式', Game.setTestMode(true) === undefined && !Game.isTestMode());
Game.setTestMode(false);

section('第三第四舰队（解锁任务/远征/出击/旧档迁移）');
Game.newGame();
Progression.initQuests();
assert('初始4支舰队槽位', [1, 2, 3, 4].every(f => Array.isArray(Game.state.fleet[f])), JSON.stringify(Object.keys(Game.state.fleet)));
assert('舰队1/2初始解锁', Game.isFleetUnlocked(1) && Game.isFleetUnlocked(2));
assert('舰队3/4默认锁定', !Game.isFleetUnlocked(3) && !Game.isFleetUnlocked(4));
assert('unlockedFleets=[1,2]', JSON.stringify(Game.unlockedFleets()) === '[1,2]', JSON.stringify(Game.unlockedFleets()));
/* 锁定舰队：引擎侧拒绝远征/出击 */
assert('锁定舰队3不能远征', !Logistics.startExpedition(3, 'ex1').ok);
assert('锁定舰队4不能出击', !Sortie.start('1-1', 4).ok);
/* 第三舰队解锁任务：完成1次远征（不算难，用第二舰队完成即可） */
const uq3 = QUESTS.find(q => q.reward && q.reward.unlockFleet === 3);
assert('存在第三舰队解锁任务(远征1次)', !!uq3 && uq3.cond.kind === 'expedition' && uq3.cond.count === 1, JSON.stringify(uq3));
const exF2 = [];
for (const id of ['fletcher', 'kidd']) {
  const s = Game.createShip(id, 1);
  Game.equipDefaults(s.uid);
  exF2.push(s.uid);
}
Game.state.fleet[2] = exF2;
const ex2 = Logistics.startExpedition(2, 'ex1');
assert('第二舰队可派远征', ex2.ok, ex2.msg);
Game.state.expeditions[2].end = Date.now() - 1;
Logistics.claimExpedition(2);
assert('远征完成计入解锁任务进度', (Game.state.quests[uq3.id] || {}).progress >= 1, 'p=' + (Game.state.quests[uq3.id] && Game.state.quests[uq3.id].progress));
const cq3 = Progression.claimQuest(uq3.id);
assert('领取后第三舰队解锁', cq3.ok && Game.isFleetUnlocked(3), JSON.stringify(cq3));
assert('解锁任务资源奖励', Game.state.resources.fuel >= 300 && Game.state.resources.ammo >= 300);
/* 解锁后第三舰队可远征/出击 */
const f3 = exF2.slice();
Game.state.fleet[3] = f3;
const ex3 = Logistics.startExpedition(3, 'ex1');
assert('解锁后舰队3可远征', ex3.ok, ex3.msg);
Game.state.expeditions[3].end = Date.now() - 1;
const c3 = Logistics.claimExpedition(3);
assert('舰队3远征领取正常', c3.ok);
const r3s = Sortie.start('1-1', 3);
assert('解锁后舰队3可出击', r3s.ok, r3s.msg);
Sortie.returnHome();
/* 第四舰队解锁任务：击破 2-1 */
const uq4 = QUESTS.find(q => q.reward && q.reward.unlockFleet === 4);
assert('存在第四舰队解锁任务(击破2-1)', !!uq4 && uq4.cond.kind === 'clear_map' && uq4.cond.param === '2-1', JSON.stringify(uq4));
Game.state.mapProgress['2-1'].cleared = true;
Progression.notify('clear_map', 1, '2-1');
assert('2-1击破计入解锁任务进度', (Game.state.quests[uq4.id] || {}).progress >= 1, 'p=' + (Game.state.quests[uq4.id] && Game.state.quests[uq4.id].progress));
const cq4 = Progression.claimQuest(uq4.id);
assert('领取后第四舰队解锁', cq4.ok && Game.isFleetUnlocked(4), JSON.stringify(cq4));
assert('四舰队全部解锁', JSON.stringify(Game.unlockedFleets()) === '[1,2,3,4]');
/* 旧档迁移：无 fleetUnlock 字段的旧档 → 舰队3/4锁定但槽位存在 */
Game.newGame();
Game.state.fleet[2] = f3.slice();
delete Game.state.fleetUnlock;
delete Game.state.fleet[3];
delete Game.state.fleet[4];
Game.loadData(Game.serialize());
assert('旧档迁移：舰队3/4槽位补齐', Array.isArray(Game.state.fleet[3]) && Array.isArray(Game.state.fleet[4]));
assert('旧档迁移：舰队3/4默认锁定', !Game.isFleetUnlocked(3) && !Game.isFleetUnlocked(4));
Game.state.fleetUnlock[3] = true;
assert('解锁标记可手动置位', Game.isFleetUnlocked(3));

section('旧档迁移（提督经验曲线）');
/* 旧曲线=1000×lv；旧Lv40 累计78万 → 新wiki曲线 Lv97 */
Game.newGame();
Game.state.admiral = { name: '提督', level: 40, exp: 0 };
delete Game.state.expMigrated;
Game.loadData(Game.serialize());
assert('旧档迁移：旧Lv40映射到新曲线Lv97', Game.state.admiral.level === 97 && Game.state.admiral.exp === 18500, 'lv=' + Game.state.admiral.level + ' exp=' + Game.state.admiral.exp);
/* 旧档 Lv1 不迁移 */
Game.newGame();
Game.state.admiral = { name: '提督', level: 1, exp: 100 };
Game.loadData(Game.serialize());
assert('旧档 Lv1 不迁移', Game.state.admiral.level === 1, 'lv=' + Game.state.admiral.level);

/* ============================================================
 * 方向一：出击前情报室
 * 1.1 舰队能力公共接口（与 battle.js 同源）
 * 1.2 海域威胁维度声明（数据一致性双向校验）
 * 1.3 编成自检（不拦截出击 + 特殊攻击原因）
 * 1.4 失败归因扩展（制空/索敌 + 防误报）
 * 1.5 文案可得性（P0-3）
 * ============================================================ */
section('方向一·舰队能力接口与战斗同源（任务1.1）');
Game.newGame();
Game.gain({ fuel: 99999, ammo: 99999, steel: 99999, baux: 99999 });
/* 构造情报室测试舰队：战列(2主炮+穿甲弹+水侦) + 空母(舰战×4) + 驱逐 */
function intelEquipShip(shipId, lv, kai, eqIds) {
  const s = Game.createShip(shipId, lv);
  s.kai = kai || 0;
  s.equipped = eqIds.map(id => Game.createEquip(id).uid);
  s.hp = Game.shipStats(s.uid).hpMax;
  s.supply = { fuel: 1, ammo: 1 };
  return s.uid;
}
const iowaUid = intelEquipShip('iowa', 99, 1, ['gun16in_50', 'gun16in_50', 'ap_mk8', 'os2u']);
const cvUid = intelEquipShip('enterprise', 99, 1, ['f6f5', 'f6f5', 'f6f5', 'f6f5']);
const ddUid2 = intelEquipShip('fletcher', 80, 0, ['gun5in_38', 'torp_mk15', 'torp_mk15', 'torp_mk15']);
Game.state.fleet[1] = [iowaUid, cvUid, ddUid2];
const intelFs = Game.battleFleetStats(1);
assert('fleetStats 可用（公共接口已导出）', !!intelFs && Array.isArray(intelFs.ships) && intelFs.ships.length === 3);
const airBattle = Battle.battle(Game.state.fleet[1], ENEMY_FLEETS.F05.ships, '单纵阵', ENEMY_FLEETS.F05.formation, { allowNight: false, fleetIdx: 1 });
const airLine = airBattle.log.find(x => typeof x === 'string' && x.includes('我军制空'));
assert('fleetAir 与实战首回合「我军制空」一致（同源验证）',
  !!airLine && Number(airLine.match(/我军制空\s*(\d+)/)[1]) === Game.fleetAir(1),
  'fleetAir=' + Game.fleetAir(1) + ' log=' + airLine);
assert('fleetAir = airPower(战斗对象)（同一函数）', Game.fleetAir(1) === Battle.airPower(intelFs.ships), 'air=' + Game.fleetAir(1));
assert('fleetStats.los 与既有 fleetLos 一致', intelFs.los === Game.fleetLos(1), intelFs.los + ' vs ' + Game.fleetLos(1));
assert('fleetAsw = 舰队对潜合计且 >0', Game.fleetAsw(1) === intelFs.ships.reduce((a, s) => a + s.stats.asw, 0) && Game.fleetAsw(1) > 0, 'asw=' + Game.fleetAsw(1));
assert('fleetNight >0 且不含空母的火力', Game.fleetNight(1) > 0 && Game.fleetNight(1) === intelFs.night, 'night=' + Game.fleetNight(1));
assert('fleetSpeed 全队高速判定', Game.fleetSpeed(1).allFast === true && Game.fleetSpeed(1).hasSlow === false, JSON.stringify(Game.fleetSpeed(1)));
Game.state.fleet[2] = [intelEquipShip('newyork', 60, 0, ['gun14in_3', 'gun14in_3', 'sec5in_1'])];
assert('fleetSpeed 含低速舰判定（含舰名）',
  Game.fleetSpeed(2).hasSlow === true && Game.fleetSpeed(2).slowCount === 1 && Game.fleetSpeed(2).allFast === false,
  JSON.stringify(Game.fleetSpeed(2)));
assert('fleetSpeed 空舰队不误报全高速', Game.fleetSpeed(3).allFast === false && Game.fleetSpeed(3).slowCount === 0);
assert('能力接口在无 Battle 场景不抛异常（边界）', typeof Game.fleetAir(4) === 'number' && Game.fleetAir(4) === 0);

section('方向一·海域威胁维度声明（任务1.2，双向数据一致性）');
const mapHasSub = m => Object.values(m.defs).some(d => d.mode === 'sub');
const mapHasNight = m => Object.values(m.defs).some(d => d.mode === 'night');
const mapHasWhirl = m => Object.values(m.defs).some(d => d.type === 'whirlpool');
const mapHasLos = m => { const b = m.branch ? (Array.isArray(m.branch) ? m.branch : [m.branch]) : []; return b.some(x => x.if && x.if.los); };
const mapHasAir = m => Object.values(m.defs).some(d => (d.type === 'battle' || d.type === 'boss') && d.enemy && Battle.enemyAirPower(d.enemy) > 0);
const THREAT_RULES = [['asw', mapHasSub], ['night', mapHasNight], ['radar', mapHasWhirl], ['los', mapHasLos], ['air', mapHasAir]];
const ANNOTATED = ['1-2', '1-4', '2-2', '3-1'];
const vocabBad = [], exactBad = [], forwardBad = [];
let annotatedCount = 0;
for (const m of MAPS) {
  const dec = Array.isArray(m.threat) ? m.threat : [];
  if (dec.length) annotatedCount++;
  for (const k of dec) if (!THREAT_RULES.some(r => r[0] === k)) vocabBad.push(m.id + ':' + k);
  const derived = THREAT_RULES.filter(r => r[1](m)).map(r => r[0]);
  if (dec.length && !derived.every(k => dec.includes(k))) forwardBad.push(`${m.id} 缺少必需维度 ${derived.filter(k => !dec.includes(k)).join('/')}`);
  if (ANNOTATED.includes(m.id) && JSON.stringify(dec.slice().sort()) !== JSON.stringify(derived.slice().sort())) {
    exactBad.push(`${m.id} declared=${dec} derived=${derived}`);
  }
}
assert('威胁维度全部来自允许词表', vocabBad.length === 0, vocabBad.join('、'));
assert('已声明维度的海域：必需维度无遗漏（防剖面漂移）', forwardBad.length === 0, forwardBad.join('、'));
assert('4 张声明海域的维度与节点类型逐项一致（双向）', exactBad.length === 0, exactBad.join('、'));
assert('首版只声明 4 张图', annotatedCount === 4, 'n=' + annotatedCount);
assert('4 张图均有威胁说明文案', ANNOTATED.every(id => {
  const m = MAPS.find(x => x.id === id);
  return (m.threat || []).length > 0 && (m.threatNote || '').length > 20;
}));
assert('未声明维度的海域：对位结果为空且不报错',
  Sortie.threatCheck(1, MAPS.find(m => m.id === '1-3')).length === 0 &&
  Sortie.threatCheck(1, MAPS.find(m => m.id === '1-3')) instanceof Array);
assert('声明海域的对位维度键合法', Sortie.intel(1, '3-1').threats.every(t => Sortie.THREAT_KEYS.includes(t.key)));

section('方向一·编成自检与特殊攻击清单（任务1.3）');
/* 不满足对位（2-2 需要对潜，此处舰队无反潜舰）仍可出击（P0-2） */
Game.state.fleet[1] = [iowaUid, cvUid];
const threat22 = Sortie.intel(1, '2-2').threats;
assert('2-2 对位判定为不满足（无对潜舰）', threat22.length === 1 && threat22[0].key === 'asw' && threat22[0].ok === false, JSON.stringify(threat22));
assert('对位不满足仍可出击（不拦截）', Sortie.start('2-2', 1).ok === true);
Sortie.returnHome();
/* 缺穿甲弹 */
const noApUid = intelEquipShip('iowa', 99, 1, ['gun16in_50', 'gun16in_50', 'radar_sk', 'os2u']);
Game.state.fleet[1] = [noApUid, cvUid];
const repNoAp = Battle.specialAttackReport(1, { airSup: true });
assert('缺穿甲弹：主炮Cut-in 标注「缺穿甲弹」',
  repNoAp.day.find(d => d.id === 'day_ci_main').ok === false && repNoAp.day.find(d => d.id === 'day_ci_main').reason === '缺穿甲弹',
  JSON.stringify(repNoAp.day.find(d => d.id === 'day_ci_main')));
/* 制空不足 */
const repNoAir = Battle.specialAttackReport(1, { airSup: false });
assert('制空不足：昼战特殊攻击项标注「制空不足」',
  repNoAir.day.every(d => d.ok === false && d.reason.includes('制空不足')), JSON.stringify(repNoAir.day[0]));
/* 同源：清单「可发动」与实战实际发动一致（穿甲弹轴） */
function countSpec(fleetUids, enemyKey, needle) {
  let n = 0;
  for (let i = 0; i < 120; i++) {
    const r = Battle.battle(fleetUids, ENEMY_FLEETS[enemyKey].ships, '单纵阵', ENEMY_FLEETS[enemyKey].formation, { allowNight: false, fleetIdx: 1 });
    for (const e of r.log) if (typeof e === 'string' && e.includes(needle)) n++;
  }
  return n;
}
Game.state.fleet[1] = [iowaUid, cvUid];
const repAp = Battle.specialAttackReport(1, { airSup: true });
const apOk = repAp.day.find(d => d.id === 'day_ci_main').ok;
const apReal = countSpec(Game.state.fleet[1], 'F05', '主炮Cut-in');
Game.state.fleet[1] = [noApUid, cvUid];
const noApReal = countSpec(Game.state.fleet[1], 'F05', '主炮Cut-in');
assert('同源：清单报「可发动」的实战确实发动', apOk === true && apReal > 0, 'ok=' + apOk + ' real=' + apReal);
assert('同源：清单报「缺穿甲弹」的实战零发动', repNoAp.day.find(d => d.id === 'day_ci_main').ok === false && noApReal === 0, 'real=' + noApReal);
/* 夜战清单同源（2 鱼雷 → 鱼雷Cut-in） */
Game.state.fleet[1] = [iowaUid, cvUid, ddUid2];
const repNight = Battle.specialAttackReport(1, { airSup: true });
assert('夜战清单：2 鱼雷标注可发动鱼雷Cut-in',
  repNight.night.find(d => d.id === 'night_torp_ci').ok === true, JSON.stringify(repNight.night.find(d => d.id === 'night_torp_ci')));
let nightTorpCi = 0;
for (let i = 0; i < 120; i++) {
  /* 夜战节点的实战路径：battle(nightOnly) 跳过昼战 → battleNight 追加夜战（与 game 层 continueNight 一致） */
  const day0 = Battle.battle(Game.state.fleet[1], ENEMY_FLEETS.F05.ships, '单纵阵', ENEMY_FLEETS.F05.formation,
    { allowNight: false, nightOnly: true, fleetIdx: 1 });
  const nr = Battle.battleNight(day0);
  for (const e of nr.log) if (typeof e === 'string' && e.includes('鱼雷Cut-in')) nightTorpCi++;
}
assert('同源：夜战清单可发动 → 实战确实发动鱼雷Cut-in', nightTorpCi > 0, 'n=' + nightTorpCi);

section('方向一·失败归因扩展（任务1.4）');
const stRef = Game.state;
const attribFleet = [iowaUid, cvUid];
const attrBoth = Sortie.attributionLines({
  result: { victory: false, rank: 'D', myAir: 120, enAir: 300, airSup: false, recon: false },
  nodeDef: { type: 'battle' }, fleet: attribFleet, st: stRef
});
assert('制空丧失败局：归因含「制空」', attrBoth.some(l => l.includes('制空')), attrBoth.join(' | '));
assert('索敌失败败局：归因含「索敌」', attrBoth.some(l => l.includes('索敌')), attrBoth.join(' | '));
assert('归因每条都给出可执行改进方向', attrBoth.every(l => l.includes('改进方向')), attrBoth.join(' | '));
const attrClean = Sortie.attributionLines({
  result: { victory: false, rank: 'D', myAir: 300, enAir: 100, airSup: true, recon: true },
  nodeDef: { type: 'battle' }, fleet: attribFleet, st: stRef
});
assert('防误报：制空充足+索敌成功的败局不含这两条', !attrClean.some(l => l.includes('制空') || l.includes('索敌')), attrClean.join(' | '));
assert('胜局不产生任何归因', Sortie.attributionLines({
  result: { victory: true, rank: 'S', myAir: 0, enAir: 0, airSup: false, recon: false },
  nodeDef: {}, fleet: [], st: stRef
}).length === 0);
assert('回归：潜艇点归因仍生效', Sortie.attributionLines({
  result: { victory: false, rank: 'D', myAir: 0, enAir: 0, airSup: false, recon: true },
  nodeDef: { type: 'battle', mode: 'sub' }, fleet: attribFleet, st: stRef
}).some(l => l.includes('对潜')));
assert('回归：夜战点归因仍生效', Sortie.attributionLines({
  result: { victory: false, rank: 'D', myAir: 0, enAir: 0, airSup: false, recon: null },
  nodeDef: { type: 'battle', mode: 'night' }, fleet: attribFleet, st: stRef
}).some(l => l.includes('夜战')));
assert('夜战节点（无索敌阶段）不误报索敌', !Sortie.attributionLines({
  result: { victory: false, rank: 'D', myAir: 0, enAir: 0, airSup: false, recon: null },
  nodeDef: { type: 'battle', mode: 'night' }, fleet: attribFleet, st: stRef
}).some(l => l.includes('索敌')));
assert('实战结算结果携带 recon/airSup/myAir/enAir',
  typeof airBattle.recon === 'boolean' && typeof airBattle.airSup === 'boolean' && airBattle.myAir > 0 && airBattle.enAir > 0,
  `recon=${airBattle.recon} airSup=${airBattle.airSup} my=${airBattle.myAir} en=${airBattle.enAir}`);

section('方向一·文案可得性（任务1.5，P0-3 数据驱动）');
const TYPE_WORDS = { '驱逐舰': ['DD'], '轻巡洋舰': ['CL'], '重巡洋舰': ['CA'], '战列舰': ['BB', 'BBV'], '空母': ['CV', 'CVL', 'CVB'], '潜水舰': ['SS', 'SSV'], '潜艇': ['SS', 'SSV'], '海防舰': ['DE'] };
const CAT_WORDS = { '深水炸弹': ['爆雷', '爆雷投射机'], '爆雷': ['爆雷', '爆雷投射机'], '声呐': ['声呐'], '电探': ['对空电探', '对水电探', '两用电探'], '雷达': ['对空电探', '对水电探', '两用电探'], '舰战': ['舰战', '夜间舰战', '喷式舰战'], '穿甲弹': ['穿甲弹'], '水侦': ['水侦'], '鱼雷': ['鱼雷'] };
const DIM_WORDS = { air: '制空', los: '索敌', asw: '对潜', night: '夜战', radar: '电探' };
function typesBefore(idx) {
  const t = new Set();
  for (const id of STARTER_IDS) t.add(ShipData[id].type);
  for (const s of SHIPS) if (s.buildable !== false) t.add(s.type);      // 建造自始解锁
  for (let i = 0; i < idx; i++) for (const id of MAPS[i].drops.concat(MAPS[i].bossDrops)) if (ShipData[id]) t.add(ShipData[id].type);
  return t;
}
function catsBefore(idx) {
  const c = new Set();
  for (const e of Object.values(EquipmentData)) if (e.buildable) c.add(e.cat);   // 开发自始解锁
  for (let i = 0; i < idx; i++) for (const id of MAPS[i].drops.concat(MAPS[i].bossDrops)) {
    const d = ShipData[id]; if (!d) continue;
    for (const eid of (d.equip || [])) if (EquipmentData[eid]) c.add(EquipmentData[eid].cat);
  }
  return c;
}
const textFindings = [];
for (const id of ANNOTATED) {
  const m = MAPS.find(x => x.id === id);
  const idx = MAPS.findIndex(x => x.id === id);
  const text = [m.brief || '', m.threatNote || ''].join('\n');
  const ty = typesBefore(idx), ca = catsBefore(idx);
  for (const w in TYPE_WORDS) if (text.includes(w) && !TYPE_WORDS[w].some(x => ty.has(x))) textFindings.push(`${id}·舰种「${w}」`);
  for (const w in CAT_WORDS) if (text.includes(w) && !CAT_WORDS[w].some(x => ca.has(x))) textFindings.push(`${id}·装备「${w}」`);
}
assert('文案提到的舰种/装备在到达该图前均可获得（P0-3）', textFindings.length === 0, textFindings.join('、'));
assert('威胁说明逐项覆盖已声明维度（文案与机制同步）', ANNOTATED.every(id => {
  const m = MAPS.find(x => x.id === id);
  return (m.threat || []).every(k => (m.threatNote || '').includes(DIM_WORDS[k]));
}));
assert('威胁说明不含未声明维度的表述（防文案漂移）', ANNOTATED.every(id => {
  const m = MAPS.find(x => x.id === id);
  const note = m.threatNote || '';
  const declared = m.threat || [];
  return Object.keys(DIM_WORDS).every(k => declared.includes(k) || !note.includes(DIM_WORDS[k]));
}));

section('方向三·士气可见化（任务2.1–2.3）');
/* 档位映射：边界值 0 / 29 / 30 / 49 / 50 / 100 */
const tierOf = m => Battle.moraleTier(m).key;
assert('士气档位边界正确（0/29→红脸，30/39→偏低，40/49→正常，50/100→闪）',
  tierOf(0) === 'red' && tierOf(29) === 'red' && tierOf(30) === 'low' && tierOf(39) === 'low' &&
  tierOf(40) === 'normal' && tierOf(49) === 'normal' && tierOf(50) === 'flash' && tierOf(100) === 'flash',
  [0, 29, 30, 39, 40, 49, 50, 100].map(m => m + ':' + tierOf(m)).join(' '));
/* 修正系数与战斗实际使用同源：UI 读取的就是 MORALE_TIERS，battle.js 的 hitChance 也读它 */
assert('士气修正系数与档位表同源（闪 1.2/1.8，红脸 0.5/1.0）',
  Battle.moraleMods(60).hit === 1.2 && Battle.moraleMods(60).evd === 1.8 &&
  Battle.moraleMods(10).hit === 0.5 && Battle.moraleMods(10).evd === 1.0 &&
  Battle.moraleMods(45).hit === 1 && Battle.moraleMods(45).evd === 1,
  JSON.stringify([Battle.moraleMods(60), Battle.moraleMods(10), Battle.moraleMods(45)]));
assert('档位表即 battle.js 使用的表（Game.moraleTier 与 Battle.moraleTier 同一对象）',
  Game.moraleTier(60) === Battle.moraleTier(60) && Game.moraleMods(10).hit === Battle.moraleMods(10).hit);
/* 四种档位的文字标识必须可区分（重要状态不能只靠颜色） */
const badgeTexts = [60, 45, 35, 10].map(m => Game.moraleBadge(m));
assert('四档徽记文字可区分且带修正数值',
  badgeTexts[0].includes('闪') && badgeTexts[0].includes('1.2') && badgeTexts[0].includes('1.8') &&
  badgeTexts[1] === '' && badgeTexts[2] === '偏低' && badgeTexts[3].includes('红脸') && badgeTexts[3].includes('0.5'),
  JSON.stringify(badgeTexts));
assert('未定义士气按「正常」处理（不施加修正、不误标红脸）',
  tierOf(undefined) === 'normal' && Game.moraleMods(undefined).hit === 1, 'tier=' + tierOf(undefined));
/* 舰队士气摘要与出击前轮换提醒 */
Game.state.fleet[1] = [iowaUid, cvUid, ddUid2];
for (const uid of Game.state.fleet[1]) Game.state.ships[uid].morale = 55;
assert('舰队士气摘要：全闪编队不触发提醒',
  Sortie.fleetMorale(1).counts.flash === 3 && Sortie.moraleAdvice(1) === null, JSON.stringify(Sortie.fleetMorale(1).counts));
for (const uid of Game.state.fleet[1]) Game.state.ships[uid].morale = 20;
const adviceRed = Sortie.moraleAdvice(1);
assert('红脸编队：提醒含「轮换」或「休整」', !!adviceRed && /轮换|休整/.test(adviceRed.text), adviceRed && adviceRed.text);
assert('红脸编队：提醒写明真实出路（回港静置恢复）', !!adviceRed && adviceRed.text.includes('母港静置'), adviceRed && adviceRed.text);
const stRed = Sortie.start('2-2', 1);
assert('红脸编队仍可出击（不拦截，P0-2）', stRed.ok === true);
assert('出击入口回传士气提醒',
  stRed.ok === true && !!stRed.advice && /轮换|休整/.test(stRed.advice.text),
  JSON.stringify(stRed.advice && stRed.advice.text));
Sortie.returnHome();
/* 平均士气 <30 的编成（断言 4 的原始表述） */
for (const uid of Game.state.fleet[1]) Game.state.ships[uid].morale = 25;
const stLow = Sortie.start('2-2', 1);
assert('平均士气<30：出击前提示含关键字且 ok=true',
  stLow.ok === true && !!stLow.advice && /轮换|休整/.test(stLow.advice.text),
  JSON.stringify(stLow.advice && stLow.advice.text));
Sortie.returnHome();
/* 士气归因（任务 2.3）：红脸舰队败局必须有；非红脸不得有 */
const mkResult = () => ({ victory: false, rank: 'D', myAir: 0, enAir: 0, airSup: false, recon: true });
for (const uid of Game.state.fleet[1]) Game.state.ships[uid].morale = 20;
const attrMoraleRed = Sortie.attributionLines({ result: mkResult(), nodeDef: { type: 'battle' }, fleet: Game.state.fleet[1], st: Game.state });
assert('士气归因：红脸舰队败局含「红脸」归因行', attrMoraleRed.some(l => l.includes('红脸') && l.includes('命中减半')), attrMoraleRed.join(' | '));
for (const uid of Game.state.fleet[1]) Game.state.ships[uid].morale = 55;
const attrMoraleOk = Sortie.attributionLines({ result: mkResult(), nodeDef: { type: 'battle' }, fleet: Game.state.fleet[1], st: Game.state });
assert('士气归因：非红脸舰队败局不含该行（防误报）', !attrMoraleOk.some(l => l.includes('红脸')), attrMoraleOk.join(' | '));
assert('士气归因：胜局不产生归因', Sortie.attributionLines({ result: { victory: true, rank: 'S' }, nodeDef: { type: 'battle' }, fleet: Game.state.fleet[1], st: Game.state }).length === 0);
for (const uid of Game.state.fleet[1]) Game.state.ships[uid].morale = 49;

section('方向五·侦察引导航向（任务2.4 纸面验证 + 2.5 实现）');
const W = Battle.ENG_WEIGHTS;
assert('基础权重仍为 wiki 原值（45/30/15/10）',
  W.base.PARALLEL === 45 && W.base.REVERSE === 30 && W.base.T_ADV === 15 && W.base.T_DIS === 10, JSON.stringify(W.base));
assert('偏移权重只在 T_ADV/T_DIS 上移动（其余类别不变）',
  W.recon.PARALLEL === W.base.PARALLEL && W.recon.REVERSE === W.base.REVERSE &&
  W.recon.T_ADV > W.base.T_ADV && W.recon.T_DIS < W.base.T_DIS, JSON.stringify(W.recon));
assert('偏移不消灭 T 不利（概率仍 >0）', W.recon.T_DIS > 0, 'T_DIS=' + W.recon.T_DIS);
const wsum = o => Object.values(o).reduce((a, b) => a + b, 0);
assert('两组权重总和一致（不额外制造概率）', wsum(W.base) === wsum(W.recon), wsum(W.base) + ' vs ' + wsum(W.recon));
/* 触发条件只依赖两个玩家可见条件；向后兼容 */
assert('向后兼容：未携带舰侦 → 基础权重（行为与改动前一致）',
  JSON.stringify(Battle.engagementWeights(true, false)) === JSON.stringify(W.base));
assert('索敌失败 → 即使携带舰侦也用基础权重（不触发）',
  JSON.stringify(Battle.engagementWeights(false, true)) === JSON.stringify(W.base));
assert('索敌成功 + 携带舰侦 → 偏移权重',
  JSON.stringify(Battle.engagementWeights(true, true)) === JSON.stringify(W.recon));
/* 统计对照：同编队，仅第 4 槽位 舰战×4 → 舰战×3+舰侦（对无航空敌军，两者制空状态同为「确保」） */
const cvReconUid = intelEquipShip('enterprise', 99, 1, ['f6f5', 'f6f5', 'f6f5', 'sbdvs2']);
Game.state.fleet[1] = [iowaUid, cvUid, ddUid2];
const fleetNoRecon = [iowaUid, cvUid, ddUid2];
const fleetRecon = [iowaUid, cvReconUid, ddUid2];
function engStats(fleet, enemyKey, n) {
  const out = { tot: 0, reconOk: 0, dis: 0, guide: 0, dmg: {}, cnt: {} };
  for (let i = 0; i < n; i++) {
    const r = Battle.battle(fleet, ENEMY_FLEETS[enemyKey].ships, '单纵阵', ENEMY_FLEETS[enemyKey].formation, { allowNight: false, fleetIdx: 1 });
    const e = r.engagement || 'PARALLEL';
    out.tot++;
    if (r.recon !== false) out.reconOk++;
    if (e === 'T_DIS') out.dis++;
    if (r.log.some(l => typeof l === 'string' && l.includes('舰侦侦察引导'))) out.guide++;
    out.dmg[e] = (out.dmg[e] || 0) + r.mySide.reduce((a, s) => a + s.dealt, 0);
    out.cnt[e] = (out.cnt[e] || 0) + 1;
  }
  return out;
}
/* 样本量：T 不利的理论差为 5 个百分点；4000 场时该频率的标准误约 0.35 个百分点，
 * 断言阈值取 2.5 个百分点（约 7σ），既要求方向正确也要求差值显著，同时避免偶发噪声导致假失败。 */
const EN = 4000;
const sNo = engStats(fleetNoRecon, 'F02', EN);
const sRe = engStats(fleetRecon, 'F02', EN);
const rateNo = sNo.dis / Math.max(1, sNo.reconOk);
const rateRe = sRe.dis / Math.max(1, sRe.reconOk);
assert('带舰侦编成的 T 不利频率显著低于不带（方向正确 + 差值显著）',
  rateNo - rateRe >= 0.025, `无舰侦=${(rateNo * 100).toFixed(2)}% 带舰侦=${(rateRe * 100).toFixed(2)}%`);
assert('不带舰侦时 T 不利频率仍为基线 10% 左右', Math.abs(rateNo - 0.10) <= 0.025, `${(rateNo * 100).toFixed(2)}%`);
assert('带舰侦时 T 不利不被消灭（频率仍 ≥2%）', rateRe >= 0.02, `${(rateRe * 100).toFixed(2)}%`);
assert('战报说明：携带舰侦且索敌成功时追加「舰侦侦察引导」', sRe.guide === sRe.reconOk && sRe.guide > 0, `guide=${sRe.guide} reconOk=${sRe.reconOk}`);
assert('战报说明：未携带舰侦时绝不出现该行', sNo.guide === 0, 'guide=' + sNo.guide);
/* 只改航向：同一交战形态下的输出分布无系统性差异（带动随机未被触碰） */
let maxDelta = 0, worstEng = '';
for (const e of ['PARALLEL', 'REVERSE', 'T_ADV', 'T_DIS']) {
  if ((sNo.cnt[e] || 0) < 50 || (sRe.cnt[e] || 0) < 50) continue;
  const a = sNo.dmg[e] / sNo.cnt[e], b = sRe.dmg[e] / sRe.cnt[e];
  const d = Math.abs(a - b) / Math.max(1, a);
  if (d > maxDelta) { maxDelta = d; worstEng = e; }
}
assert('只改航向：同一交战形态下输出无系统性差异（命中/伤害/暴击随机未改动）',
  maxDelta < 0.15, `maxΔ=${(maxDelta * 100).toFixed(1)}% @${worstEng}`);
Game.state.fleet[1] = [iowaUid, cvUid, ddUid2];

section('总结');
console.log(`\n通过 ${passed} 项，失败 ${failed} 项`);
process.exit(failed ? 1 : 0);
