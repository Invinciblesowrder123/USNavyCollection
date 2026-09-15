'use strict';
/* ============================================================
 * 海域难度测量工具（V0.306 立项评估建立）
 *
 * 用途：给 25 张海域一个**可复现的难度读数**，供游戏内"推荐等级/难度提示"文案使用。
 *
 * 方法论（与项目"先证明测量工具没坏，再信平衡结论"的纪律一致）：
 *   ① 静态特征：从 maps.js 提取客观量（BOSS 编成强度、节点损耗、特殊节点要求、
 *      索敌/编成门槛、血条、前置链深度）—— 可逐条对代码核对，不含主观判断。
 *   ② 动态实测：**固定一套基准编成**，扫描舰娘等级，对每张图的 BOSS 实打 N 场，
 *      统计 S/A/B（胜利档）占比 → 反推「推荐等级」。
 *      固定编成是关键：编成一变，测的就不是"图有多难"而是"我编得对不对"。
 *
 * 【口径声明·必读】
 *   - 本工具测的是「基准编成要多少级才打得过」，是**相对难度指数**，
 *     不等于"玩家实际会在多少级来打这张图"。
 *   - 基准编成是 2BB+2CV+2DD 的均衡型：**对潜图（2-2/1-5/4-5 等）会系统性吃亏**
 *     —— 这是"这张图要求专门编成"的正确反映，报告里作为独立观察项列出，不当难度偏差。
 *   - 战斗掷骰走 Math.random()，本工具不做种子固定 → 读数是**某次抽样**，
 *     引用时必须标注抽样口径，不得写成定值（坑：报告引用会波动的读数）。
 *
 * 用法：
 *   node scripts/map_difficulty.js                # 默认 N=200，等级档 15~90
 *   node scripts/map_difficulty.js 400            # 自定义每格场次
 *   node scripts/map_difficulty.js 200 static     # 只跑静态特征（秒出）
 * ============================================================ */
process.env.AUTH_DATA_DIR = require('path').join(require('os').tmpdir(), 'usnc_md_' + Date.now());
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

/* ---------- 基准编成 ---------- */
/* 测量 A（主口径）：进度化舰池编成 —— 用"到达这张图之前玩家理论上能获得的舰"组队。
 *   这是唯一能让「等级」成为有效变量的口径：固定强编成会把"MVP 是 Iowa 还是 Fletcher"
 *   混进读数里（首测实测：顶配编成下 20/25 张图 Lv15 就能过 —— 测的是船不是图）。 */
const ROLE_SEQ = [['CV', 2], ['CVL', 2], ['BB', 2], ['CA', 2], ['CL', 2], ['DD', 2]];
function poolFor(map) {
  const idx = MAPS.findIndex(m => m.id === map.id);
  const ids = new Set(STARTER_IDS);
  for (let i = 0; i < idx; i++) {
    const m = MAPS[i];
    for (const id of (m.drops || [])) if (ShipData[id]) ids.add(id);
    for (const id of (m.bossDrops || [])) if (ShipData[id]) ids.add(id);
  }
  return [...ids].filter(id => ShipData[id] && ShipData[id].type);
}
function shipScore(id) {
  const d = ShipData[id];
  const s = d.kai2 ? d.kai2.stats : (d.kai ? d.kai.stats : d.stats);
  return (s[0] * 1.0) + (s[1] * 1.2) + (s[2] * 1.0) + (s[3] * 0.8) + (s[6] * 0.6) + (s[4] * 0.5);
}
function fleetFor(map) {
  const pool = poolFor(map);
  const byType = {};
  for (const id of pool) { const t = ShipData[id].type; (byType[t] = byType[t] || []).push(id); }
  for (const t in byType) byType[t].sort((a, b) => shipScore(b) - shipScore(a));
  /* 按角色配额取舰；缺员时用剩余舰池里最强的补 —— 早期图没有航母，就退化成正编 */
  const picked = [], used = new Set();
  for (const [type, n] of ROLE_SEQ) {
    const arr = byType[type] || [];
    for (let i = 0; i < n && arr[i]; i++) {
      if (picked.length >= 6) break;
      picked.push(arr[i]); used.add(arr[i]);
    }
    if (picked.length >= 6) break;
  }
  const rest = pool.filter(id => !used.has(id)).sort((a, b) => shipScore(b) - shipScore(a));
  while (picked.length < 6 && rest.length) picked.push(rest.shift());
  /* 排序：耐久高的当旗舰（玩家常识：旗舰沉了整场白打） */
  return picked.sort((a, b) => ShipData[b].stats[0] - ShipData[a].stats[0]);
}
/* 测量 B（交叉验证）：顶配基准编成 —— 2BB+2CV+2DD 用全项目最强舰。
 *   用途不是评难度，是回答"编成正确时这张图是否可通"，以及暴露"制空轴"的权重。 */
const FLEET_TOP = ['iowa', 'southdakota', 'enterprise', 'essex', 'fletcher', 'baltimore'];
/* 测量 C：对潜型（4DD/CL + 重巡 + 单航母）—— 检验"没有双航母会怎样" */
const FLEET_ASW = ['fletcher', 'fletcher', 'fletcher', 'atlanta', 'baltimore', 'enterprise'];

/* 配装：只给航母装舰载机（前2槽舰战保制空，其余舰爆输出），其余走默认。
 * 与 hist_balance.js 的 equipAir 同源 —— 只装舰战会让 CV 对水面输出≈0，是已知的测量偏差。 */
function equipAir(uid) {
  const s = Game.state.ships[uid], def = ShipData[s.id];
  if (def.type !== 'CV' && def.type !== 'CVL') { Game.equipDefaults(uid); return; }
  for (const e of s.equipped.slice()) Game.destroyEquip(e);
  s.equipped = [];
  const n = def.slots.length;
  for (let i = 0; i < n; i++) {
    const ne = Game.createEquip(i < 2 ? 'f6f5' : 'sb2c3');
    ne.locked = false; s.equipped.push(ne.uid);
  }
}
function buildFleet(spec, lv) {
  Game.state.ships = {}; Game.state.fleet[1] = [];
  Game.state.fleet[1] = spec.map(id => {
    const s = Game.createShip(id, lv);
    equipAir(s.uid);
    s.hp = Game.shipStats(s.uid).hpMax;
    s.supply = { fuel: 1, ammo: 1 };
    s.morale = 60;                       // 正常士气（非闪、非红脸）
    return s.uid;
  });
  return Game.state.fleet[1].slice();
}
function healFleet(fleet) {
  for (const uid of fleet) {
    const s = Game.state.ships[uid];
    s.hp = Game.shipStats(uid).hpMax;
    s.supply = { fuel: 1, ammo: 1 };
    s.morale = 60;
  }
}

/* ---------- 静态特征 ---------- */
function bossNodeOf(map) { return map.defs[map.boss] || null; }
function nodeModeOf(map) {
  const d = bossNodeOf(map);
  return (d && d.mode) || 'normal';
}
function enemyAgg(enemyKey) {
  const ef = ENEMY_FLEETS[enemyKey];
  if (!ef) return null;
  let hp = 0, fp = 0, tp = 0, aa = 0, arm = 0, planes = 0, bossCnt = 0;
  for (const k of ef.ships) {
    const t = DEEP_TEMPLATES[k];
    if (!t) continue;
    hp += t.stats[0]; fp += t.stats[1]; tp += t.stats[2]; aa += t.stats[3]; arm += t.stats[4];
    if (t.slots) for (const sl of t.slots) planes += sl.planes;
    if (t.boss) bossCnt++;
  }
  return { n: ef.ships.length, hp, fp, tp, aa, arm, planes, bossCnt, formation: ef.formation, key: enemyKey };
}
function staticFeatures(map) {
  const defs = map.defs || {};
  const kinds = {};
  let battles = 0;
  for (const id in defs) {
    const t = defs[id].type;
    kinds[t] = (kinds[t] || 0) + 1;
    if (t === 'battle' || t === 'boss') battles++;
  }
  const modes = {};
  for (const id in defs) {
    const m = defs[id].mode;
    if (m) modes[m] = (modes[m] || 0) + 1;
  }
  /* 分支门槛：索敌阈值 / 编成要求 —— 门槛越高说明"不达标就要多打一场/绕路" */
  const brs = Array.isArray(map.branch) ? map.branch : (map.branch ? [map.branch] : []);
  const gates = brs.map(b => {
    const c = b.if || {};
    return c.los != null ? `索敌≥${c.los}` : (c.dd != null ? `驱逐≥${c.dd}` : JSON.stringify(c));
  });
  const dep = [];
  let cur = map.need, guard = 0;
  while (cur && guard++ < 10) { dep.push(cur); const p = MAPS.find(m => m.id === cur); cur = p && p.need; }
  const bossEnemy = (bossNodeOf(map) || {}).enemy || null;
  return {
    id: map.id, name: map.name, stars: map.stars, gauge: map.gauge || 1,
    need: map.need || '', depth: dep.length,
    battles, kinds: kinds, modes,
    gates: gates, objectives: (map.objectives || []).length,
    bossEnemy, bossMode: nodeModeOf(map),
    agg: bossEnemy ? enemyAgg(bossEnemy) : null,
    admExp: map.admExp ? map.admExp.boss : 0,
    hasThreat: !!map.threatNote,
  };
}

/* ---------- 动态实测 ---------- */
function runMap(map, fleet, N) {
  const def = bossNodeOf(map);
  const enemyKey = (def && def.enemy) || 'F01';
  const ef = ENEMY_FLEETS[enemyKey];
  if (!ef) return null;
  const R = { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0 };
  const opts = {
    allowNight: false, fleetIdx: 1,
    sub: def.mode === 'sub', nightOnly: def.mode === 'night', airMode: def.mode === 'air'
  };
  const fleetUids = Game.state.fleet[1];
  for (let i = 0; i < N; i++) {
    healFleet(fleetUids);
    let r = Battle.battle(fleetUids, ef.ships, '单纵阵', ef.formation, opts);
    if (r.forceNight) r = Battle.battleNight(r);   // ⚠️ nightOnly 是两步式，漏这行 = 空壳
    R[r.rank] = (R[r.rank] || 0) + 1;
  }
  const win = R.S + R.A + R.B;
  return { R, winPct: win / N * 100, sPct: R.S / N * 100 };
}

/* ---------- 主流程 ---------- */
const N = parseInt(process.argv[2], 10) || 200;
const STATIC_ONLY = process.argv[3] === 'static';
const LEVELS = [15, 30, 45, 60, 75, 90];
const WIN_TARGET = 80;   // 通过率达标线（%）

console.log('=========== 静态特征 ===========');
const feats = MAPS.map(staticFeatures);
for (const f of feats) {
  const a = f.agg;
  const mods = Object.keys(f.modes).map(k => `${k}×${f.modes[k]}`).join(',') || '无';
  console.log(
    `${f.id.padEnd(4)} ${f.name.padEnd(10)} 星${String(f.stars).padEnd(2)} 血条${f.gauge}`
    + ` 前置${(f.need || '—').padEnd(4)} 战${f.battles} 特殊[${mods}]`
    + ` 门[${f.gates.join(';') || '—'}]`
    + (a ? ` BOSS:${a.key}(${a.n}舰 耐${a.hp} 火${a.fp} 雷${a.tp} 甲${a.arm} 机${a.planes} 栖姬${a.bossCnt})` : '')
  );
}
if (STATIC_ONLY) process.exit(0);

console.log('\n=========== 测量 A · 进度化舰池编成（模拟正常推进的玩家）===========');
console.log(`N=${N}/格（读数=某次抽样，非定值）  ★=通过率≥${WIN_TARGET}%`);
console.log('图     池  选用编成'.padEnd(46) + LEVELS.map(l => `Lv${String(l).padStart(3)}`).join(' '));
const A = {};
for (const map of MAPS) {
  const spec = fleetFor(map);
  const pool = poolFor(map);
  const row = [];
  for (const lv of LEVELS) {
    buildFleet(spec, lv);
    const r = runMap(map, spec, N);
    row.push(r ? r.winPct : NaN);
  }
  let rec = null;
  for (let i = 0; i < LEVELS.length; i++) if (row[i] >= WIN_TARGET) { rec = LEVELS[i]; break; }
  A[map.id] = { row, rec, spec, poolN: pool.length };
  const comp = spec.map(id => ShipData[id].zh || id).join('/');
  console.log(map.id.padEnd(6) + String(pool.length).padStart(3) + '  ' + comp.padEnd(38)
    + row.map(v => (isNaN(v) ? '  — ' : (v.toFixed(0) + '%').padStart(5))).join(' '));
}

console.log('\n=========== 测量 B · 顶配基准编成（全项目最强 2BB+2CV+2DD）===========');
console.log('（用途：回答"编成正确时这张图是否可通" + 暴露制空轴的权重，不是评难度）');
const B = {};
for (const map of MAPS) {
  const row = [];
  for (const lv of LEVELS) {
    buildFleet(FLEET_TOP, lv);
    const r = runMap(map, FLEET_TOP, N);
    row.push(r ? r.winPct : NaN);
  }
  B[map.id] = row;
  console.log(map.id.padEnd(6) + row.map(v => (isNaN(v) ? '  — ' : (v.toFixed(0) + '%').padStart(5))).join(' '));
}

console.log('\n=========== 测量 C · 单航母对潜编成（Lv60）—— 检验制空轴 ===========');
const Crow = {};
for (const map of MAPS) {
  buildFleet(FLEET_ASW, 60);
  const r = runMap(map, FLEET_ASW, N);
  Crow[map.id] = { win: r ? r.winPct : NaN };
  const b60 = B[map.id][3];
  const drop = r && !isNaN(b60) ? (b60 - r.winPct) : NaN;
  const flag = drop >= 30 ? '  ← 制空敏感' : '';
  console.log(`${map.id.padEnd(6)} 单CV ${r.winPct.toFixed(0)}%  对顶配 ${b60.toFixed(0)}%  差 ${isNaN(drop) ? '—' : drop.toFixed(0) + 'pp'}${flag}`);
}

console.log('\n=========== 难度分档（规则写在代码里，可复算）===========');
/* 分档主判据 `hard` = 顶配编成在 Lv15 的失败率（绝对难度：编成对了，这张图本身有多硬）。
 * 副判据 airSens = 单航母对顶配的通过率差（制空依赖度）。
 * ⚠️ 两个读数需要标注（不得直接当作难度结论）：
 *   ① 进度编成在 1-1/1-2 只有 2~8 艘舰可挑（初始舰仅 2 艘）→ 显著低估：
 *      真实玩家在打 1-1 前会建造，不会只带 2 艘船。
 *   ② 进度编成的舰池**只含"前序图掉落"，不含建造/开发产出**。1-3 的池里有
 *      independence / langley 两艘**轻空母**，没有正规航母；而 1-3 BOSS（F09）带 204 架舰载机
 *      —— 所以 1-3 的 11% 读数不是纯 artifact：它真实反映了"1-3 之前掉落池给不出正规航母，
 *      玩家必须靠建造补上"这一进度墙。报告里按"真实现象 + 模型口径限制"双重标注。 */
/* 档位阈值 —— **V0.306 任务书 任务 1.1 指定，不得改动**：
 *   Lv15 失败率 <3% → T1 / 3~8% → T2 / 8~20% → T3 / 20~40% → T4 / ≥40% → T5。
 * 该阈值同时是 sim 断言「档位分布 T1=13 / T2=4 / T3=4 / T4=3 / T5=1」的看门狗依据；
 * 落地后的档位存在 maps[].diff（游戏内唯一数据源），本函数只用于复算与回归。
 * 改阈值 = 全图重测 + 改 maps[].diff + 改断言，三者必须同时动。 */
function tierOf(id) {
  const b15 = B[id][0], c60 = Crow[id].win, b60 = B[id][3];
  const hard = 100 - b15;
  const airSens = b60 - c60;
  let t, label;
  if (hard >= 40) { t = 5; label = '决战'; }
  else if (hard >= 20) { t = 4; label = '高难'; }
  else if (hard >= 8) { t = 3; label = '考验'; }
  else if (hard >= 3) { t = 2; label = '常规'; }
  else { t = 1; label = '基础'; }
  return { t, label, hard, airSens };
}
console.log('档  图     名称         绝对难度 Lv15失败率  制空敏感  进度编成读数  静态星  血条  栖姬');
for (const map of MAPS) {
  const { t, label, hard, airSens } = tierOf(map.id);
  const f = feats.find(x => x.id === map.id);
  console.log(
    `T${t}  ${map.id.padEnd(6)} ${map.name.padEnd(12)} ${label}   ${hard.toFixed(0).padStart(3)}%`
    + `      ${(airSens >= 30 ? '★' + airSens.toFixed(0) + 'pp' : '—').padStart(6)}`
    + `   ${(A[map.id].rec === null ? '>90' : 'Lv' + A[map.id].rec).padStart(4)}`
    + `      ${String(f.stars).padStart(3)}  ${String(f.gauge).padStart(3)}  ${f.agg ? f.agg.bossCnt : '—'}`
  );
}
