'use strict';
/* ============================================================
 * 支援舰队 · 定价测量工具（V0.306 批次2 任务 2.1 —— **先做、做完交表**）
 *
 * 目的：给「支援炮击」定出三个 PLACEHOLDER（附录 C P-1/P-2）：
 *   ① 支援炮击火力系数 coef   默认候选 0.5
 *   ② 随机参与艘数 [min,max]  默认候选 2~3
 *   ③ 该机制是否**值得派**（净收益符号）→ 决定消耗与互斥口径是否要加重
 *
 * 口径（必须与任务书一致，不得自行放宽）：
 *   · 主队 = 全项目最强 2BB+2CV+2DD（"常规最优编成"，与 map_difficulty.js 测量 B 同源）
 *   · 取 5 张代表图：1-3 / 2-4 / 3-5 / 4-4 / 5-5（覆盖早/中/高难三档）
 *   · 每图每臂 N=400；通过 = S/A/B（引擎定义 battle.js::settle victory）
 *   · 支援队从**后备舰队**（state.fleet[2]）取，随机 2~3 艘各打一轮自由炮击
 *
 * 【效度检查·必做】`opts.support` 为假值时，两臂必须**逐位同分布**（不是"看起来差不多"）。
 *   实现：固定种子 LCG 覆写 Math.random，两臂各跑一遍比对摘要串。
 *   —— 若这条不成立，说明关掉支援后仍有随机数被消费，那 `drift` 基线将失去意义（坑 #40）。
 *
 * 【读数声明】正式表的读数是**某次抽样**（真实随机、未固定种子），引用时必须标注口径，
 *   不得写成定值（项目惯例，V0.303/V0.305 都踩过）。
 *
 * 用法：node scripts/sim_support.js [每图臂场次，默认 400]
 * ============================================================ */
process.env.AUTH_DATA_DIR = require('path').join(require('os').tmpdir(), 'usnc_sup_' + Date.now());
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

/* ---------- 编成 ---------- */
/* 主队：全项目最强 2BB+2CV+2DD（与 map_difficulty.js 测量 B 完全同源，读数才可比） */
const FLEET_TOP = ['iowa', 'southdakota', 'enterprise', 'essex', 'fletcher', 'baltimore'];
/* 后备舰队（支援队）两种典型形态 —— 用来回答"后备舰队该放什么" */
const SUP_GUN = ['washington', 'indiana', 'baltimore', 'sanfrancisco', 'atlanta', 'kidd'];   // 炮击型
const SUP_CV = ['saratoga', 'cabot', 'langley', 'independence', 'fletcher', 'baltimore'];    // 航母型
const N = parseInt(process.argv[2], 10) || 400;
const LEVELS = [15, 30, 45, 60, 75, 90];
const MAP_IDS = ['1-3', '2-4', '3-5', '4-4', '5-5'];

/* 配装：只给航母装舰载机（前 2 槽舰战保制空，其余舰爆输出）—— 与 map_difficulty.js::equipAir 同源。
 * ⚠️ 只装舰战会让 CV 对水面输出≈0，是已知的测量偏差（hist_balance 勘误）。 */
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
function buildFleet(spec, lv, fidx) {
  /* 主队先建：重置 ships 容器（与 map_difficulty.js 同做法）—— 否则每格累积 6 艘旧实例 + 其装备，
   * 千场量级后 state.ships / state.equipment 无界增长，读数会被仓库与内存压力污染（测量工具自身缺陷）。 */
  if (fidx === 1) { Game.state.ships = {}; Game.state.equipment = {}; Game.state.fleet[1] = []; Game.state.fleet[2] = []; }
  Game.state.fleet[fidx] = [];
  const uids = spec.map(id => {
    const s = Game.createShip(id, lv);
    equipAir(s.uid);
    s.hp = Game.shipStats(s.uid).hpMax;
    s.supply = { fuel: 1, ammo: 1 };
    s.morale = 60;                       // 正常士气（非闪、非红脸）
    return s.uid;
  });
  Game.state.fleet[fidx] = uids;
  return uids.slice();
}
function healFleet(fidx) {
  for (const uid of Game.state.fleet[fidx]) {
    const s = Game.state.ships[uid];
    if (!s) continue;
    s.hp = Game.shipStats(uid).hpMax;
    s.supply = { fuel: 1, ammo: 1 };
    s.morale = 60;
  }
}

/* ---------- 战斗模组 ---------- */
function bossOf(map) { return map.defs[map.boss] || null; }
/* 打一场 BOSS：返回 { rank, win, s, taiha } */
function runOnce(map, mainFleet, supFleet, lv, useSupport, supCfg) {
  const def = bossOf(map);
  const ef = ENEMY_FLEETS[def.enemy];
  if (!ef) return null;
  const opts = {
    allowNight: false, fleetIdx: 1,
    sub: def.mode === 'sub', nightOnly: def.mode === 'night', airMode: def.mode === 'air'
  };
  if (useSupport) { opts.support = supCfg || true; opts.supportFleet = supFleet; }
  let r = Battle.battle(mainFleet, ef.ships, '单纵阵', ef.formation, opts);
  if (r.forceNight) r = Battle.battleNight(r);
  const taiha = r.mySide.some(s => s.alive && s.hp <= s.stats.hpMax * 0.25);
  return {
    rank: r.rank, win: r.victory, s: r.rank === 'S', taiha,
    killed: r.enemyKilled, total: r.enemyTotal, support: r.support
  };
}
function measure(map, mainSpec, supSpec, lv, useSupport, supCfg, n) {
  buildFleet(mainSpec, lv, 1);
  if (supSpec) buildFleet(supSpec, lv, 2); else Game.state.fleet[2] = Game.state.fleet[2] || [];
  const main = Game.state.fleet[1].slice(), sup = Game.state.fleet[2].slice();
  const R = { win: 0, s: 0, taiha: 0, fired: 0, killed: 0, ranks: { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0 } };
  for (let i = 0; i < n; i++) {
    healFleet(1); if (supSpec) healFleet(2);
    const r = runOnce(map, main, sup, lv, useSupport, supCfg);
    if (!r) return null;
    if (r.win) R.win++;
    if (r.s) R.s++;
    if (r.taiha) R.taiha++;
    if (r.support && r.support.fired) R.fired++;
    R.killed += r.killed;                 // 击沉敌舰数（机制直查：支援**必须**让它变多）
    R.ranks[r.rank]++;
  }
  return {
    winPct: R.win / n * 100, sPct: R.s / n * 100, taihaPct: R.taiha / n * 100,
    firePct: R.fired / n * 100, killed: R.killed / n, ranks: R.ranks
  };
}
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
const sd = (a, b) => { const d = a - b; return (d >= 0 ? '+' : '') + f1(d); };

/* ============================================================
 * ① 效度检查：固定种子下，support=false 两臂必须逐位同分布
 * ============================================================ */
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function seededRun(map, mainSpec, supSpec, lv, n, withSupportOpts) {
  const saved = Math.random;
  Math.random = lcg(0x9E3779B9);
  buildFleet(mainSpec, lv, 1);
  if (supSpec) buildFleet(supSpec, lv, 2);
  const main = Game.state.fleet[1].slice(), sup = Game.state.fleet[2].slice();
  let hash = 2166136261;
  const mix = x => { hash ^= x; hash = (hash * 16777619) >>> 0; };
  for (let i = 0; i < n; i++) {
    healFleet(1); if (supSpec) healFleet(2);
    const def = bossOf(map);
    const ef = ENEMY_FLEETS[def.enemy];
    const opts = { allowNight: false, fleetIdx: 1, sub: def.mode === 'sub', nightOnly: def.mode === 'night', airMode: def.mode === 'air', support: withSupportOpts, supportFleet: sup };
    let r = Battle.battle(main, ef.ships, '单纵阵', ef.formation, opts);
    if (r.forceNight) r = Battle.battleNight(r);
    mix(r.rank.charCodeAt(0));
    mix(r.mySide.reduce((s, x) => s + Math.max(0, Math.round(x.hp)), 0));
    mix(r.enemySide.reduce((s, x) => s + Math.max(0, Math.round(x.hp)), 0));
    mix(r.log.length);
  }
  Math.random = saved;
  return hash.toString(16);
}

console.log('=========== ① 效度检查：关闭支援后必须逐位同分布（坑 #40 的前提）===========');
console.log('（固定种子 LCG 覆写 Math.random，比对摘要串；两臂都用 support=false，一臂显式给 false、一臂不给该项）');
{
  let ok = true;
  for (const id of MAP_IDS) {
    const map = MAPS.find(m => m.id === id);
    const a = seededRun(map, FLEET_TOP, SUP_GUN, 60, 120, undefined);
    const b = seededRun(map, FLEET_TOP, SUP_GUN, 60, 120, false);
    const same = a === b;
    if (!same) ok = false;
    console.log(`  ${same ? '✓' : '✗'} ${id.padEnd(5)} 不给该项 ${a}   显式 false ${b}`);
  }
  console.log(ok
    ? '  ⇒ 通过：支援阶段在关闭时**零随机数消费**、零行为改变。\n'
    : '  ⇒ 失败：关闭支援后仍有差异 —— 禁止继续，先修开关（坑 #40）。\n');
  if (!ok) process.exit(1);
}

/* ============================================================
 * ② 主表：无支援 / 有支援 两条对照（P-1 默认候选 coef 0.5、2~3 艘）
 * ============================================================ */
const DEFAULT_CFG = { coef: Battle.SUPPORT_COEF, min: Battle.SUPPORT_MIN_SHIPS, max: Battle.SUPPORT_MAX_SHIPS };
console.log(`=========== ② 噪声底：无支援 arm 跑两遍（同 N），量出"纯读数波动"的量级 ===========`);
console.log('（**必做**：没有这条基准，「Δ通过率」的正负号就无法解读 —— 测什么都要先证明量具没坏）');
console.log('  图     Lv15 A/B(A/A)      |Δ|     Lv60 A/B(A/A)      |Δ|');
for (const id of MAP_IDS) {
  const map = MAPS.find(m => m.id === id);
  const a15 = measure(map, FLEET_TOP, SUP_GUN, 15, false, null, N);
  const b15 = measure(map, FLEET_TOP, SUP_GUN, 15, false, null, N);
  const a60 = measure(map, FLEET_TOP, SUP_GUN, 60, false, null, N);
  const b60 = measure(map, FLEET_TOP, SUP_GUN, 60, false, null, N);
  console.log(`  ${id.padEnd(6)} ${f1(a15.winPct)}/${f1(b15.winPct)}`.padEnd(30)
    + ` ${f1(Math.abs(b15.winPct - a15.winPct)).padStart(5)}`
    + `   ${f1(a60.winPct)}/${f1(b60.winPct)}`.padEnd(22)
    + ` ${f1(Math.abs(b60.winPct - a60.winPct)).padStart(5)}`);
}
console.log('  （同一张图、同一编成、同一等级，两次独立抽样之间的差 = 真实随机波动；Δ 优于该量级才有意义）\n');

console.log(`=========== ③ 主表：5 图 × ${LEVELS.length} 等级 × 2 臂（N=${N}/格，读数=某次抽样）===========`);
console.log(`主队 = 2BB+2CV+2DD 顶配 ｜ 支援队 = 炮击型后备（washington/indiana/baltimore/sanfrancisco/atlanta/kidd）`);
console.log(`支援参数（[PLACEHOLDER] 默认候选）：coef=${DEFAULT_CFG.coef} 参与 ${DEFAULT_CFG.min}~${DEFAULT_CFG.max} 艘`);
console.log('「Δ击沉」是**机制直查**：支援只应让击沉数变多。若它变多了而通过率反而降，就是评分口径的问题，不是支援的问题。\n');
const MAIN = {};
for (const id of MAP_IDS) {
  const map = MAPS.find(m => m.id === id);
  MAIN[id] = {};
  console.log(`--- ${id} ${map.name}（档位 T${map.diff}） ---`);
  console.log('  等级   通过率 无 → 有     Δ通过   S率 无 → 有      ΔS     大破率 无 → 有     Δ大破  击沉 无 → 有      Δ击沉  发动率');
  for (const lv of LEVELS) {
    const no = measure(map, FLEET_TOP, SUP_GUN, lv, false, null, N);
    const ys = measure(map, FLEET_TOP, SUP_GUN, lv, true, DEFAULT_CFG, N);
    MAIN[id][lv] = { no, ys };
    console.log(`  Lv${String(lv).padStart(3)}   ${f1(no.winPct).padStart(5)}% → ${f1(ys.winPct).padStart(5)}%   ${sd(ys.winPct, no.winPct).padStart(6)}`
      + `   ${f1(no.sPct).padStart(5)}% → ${f1(ys.sPct).padStart(5)}%   ${sd(ys.sPct, no.sPct).padStart(6)}`
      + `   ${f1(no.taihaPct).padStart(5)}% → ${f1(ys.taihaPct).padStart(5)}%   ${sd(ys.taihaPct, no.taihaPct).padStart(6)}`
      + `   ${f1(no.killed).padStart(3)} → ${f1(ys.killed).padStart(3)}    ${sd(ys.killed, no.killed).padStart(5)}`
      + `   ${f1(ys.firePct).padStart(5)}%`);
  }
  /* 排名分布（看清到底是哪一档在翻） */
  for (const lv of [15, 60]) {
    const { no, ys } = MAIN[id][lv];
    const mk = R => ['S', 'A', 'B', 'C', 'D', 'E'].map(k => `${k}${f1(R.ranks[k] / N * 100)}%`).join(' ');
    console.log(`         Lv${lv} 排名分布  无支援：${mk(no)}`);
    console.log(`                      有支援：${mk(ys)}`);
  }
  console.log('');
}

/* ============================================================
 * ③ 扫参：系数 × 艘数（Lv15 = 绝对难度档口径 / Lv60 = 常规练度口径）
 * ============================================================ */
console.log('=========== ③ 扫参：系数 × 参与艘数（判「Δ通过率是否落在 3~8pp」）===========');
const SWEEP = [
  { label: 'P-1 候选  0.5x / 2~3 艘', cfg: { coef: 0.5, min: 2, max: 3 } },
  { label: '降价       0.3x / 2~3 艘', cfg: { coef: 0.3, min: 2, max: 3 } },
  { label: '降艘数     0.5x / 1~2 艘', cfg: { coef: 0.5, min: 1, max: 2 } },
  { label: '强         0.75x / 3~4 艘', cfg: { coef: 0.75, min: 3, max: 4 } }
];
console.log('  组别                     ' + MAP_IDS.map(id => id.padStart(8)).join('') + '   （Δ通过率 pp，Lv15 / Lv60）');
for (const s of SWEEP) {
  const cells = MAP_IDS.map(id => {
    const map = MAPS.find(m => m.id === id);
    const a15 = measure(map, FLEET_TOP, SUP_GUN, 15, false, null, N);
    const b15 = measure(map, FLEET_TOP, SUP_GUN, 15, true, s.cfg, N);
    const a60 = measure(map, FLEET_TOP, SUP_GUN, 60, false, null, N);
    const b60 = measure(map, FLEET_TOP, SUP_GUN, 60, true, s.cfg, N);
    return `${sd(b15.winPct, a15.winPct)}/${sd(b60.winPct, a60.winPct)}`.padStart(8);
  });
  console.log('  ' + s.label.padEnd(24) + cells.join(''));
}
console.log('');

/* ============================================================
 * ④ 后备舰队该放什么：炮击型 vs 航母型（Lv60）
 *   —— 支援火力取 (火力+5)×coef，航母面板火力极低 → 预计航母型几乎无贡献。
 *      这一条是**设计面发现**，不是 bug；但要写进结论让玩家少走弯路。
 * ============================================================ */
console.log('=========== ④ 后备舰队形态：炮击型 vs 航母型（Lv60，Δ通过率 pp）===========');
console.log('  图     炮击型   航母型    说明');
for (const id of MAP_IDS) {
  const map = MAPS.find(m => m.id === id);
  const base = measure(map, FLEET_TOP, SUP_GUN, 60, false, null, N);
  const g = measure(map, FLEET_TOP, SUP_GUN, 60, true, DEFAULT_CFG, N);
  const c = measure(map, FLEET_TOP, SUP_CV, 60, true, DEFAULT_CFG, N);
  console.log(`  ${id.padEnd(6)} ${sd(g.winPct, base.winPct).padStart(6)}  ${sd(c.winPct, base.winPct).padStart(6)}`);
}
console.log('');

/* ============================================================
 * ⑥ 高 N 复核（**决定性表格**）
 *   N=400 时通过率差的噪声底达 ±3~6pp（见 ②），与 P-1「3~8pp 才算合理」的目标同量级 →
 *   在 N=400 上读 Δ通过率等于读噪声。**要判定系数是否合适，必须提高检验力。**
 *   做法：只测「通过率处于中段、支援才可能有空间」的格子（5-5 / 4-4 / 2-4 的低等级），
 *   N 提到 3000，并且只对比 P-1 候选与"强一档"两组。
 * ============================================================ */
const N_HI = parseInt(process.argv[3], 10) || 3000;
/* 四组候选：**两个分叉** —— 系数作用在攻击力（ap）还是最终伤害（dmg） × 系数强弱 */
const VARIANTS = [
  { label: 'ap 0.5x /2~3', cfg: { coef: 0.5, min: 2, max: 3, mode: 'ap' } },
  { label: 'dmg 0.5x/2~3', cfg: { coef: 0.5, min: 2, max: 3, mode: 'dmg' } },
  { label: 'dmg 0.4x/2~3', cfg: { coef: 0.4, min: 2, max: 3, mode: 'dmg' } },
  { label: 'dmg 0.5x/3~4', cfg: { coef: 0.5, min: 3, max: 4, mode: 'dmg' } }
];
console.log(`=========== ⑥ 高 N 复核（N=${N_HI}/格 · Δ通过率的 SE 上限 ≈ ${f1(Math.sqrt(2 * 0.25 / N_HI) * 100)}pp）===========`);
console.log('  图     等级  基准      ' + VARIANTS.map(v => v.label.padStart(16)).join(''));
const HI = {};
for (const [id, lvs] of [['5-5', [15, 30, 45, 60]], ['4-4', [15, 30]], ['2-4', [15, 30]]]) {
  const map = MAPS.find(m => m.id === id);
  HI[id] = {};
  for (const lv of lvs) {
    const no = measure(map, FLEET_TOP, SUP_GUN, lv, false, null, N_HI);
    HI[id][lv] = { no, arms: {} };
    const cells = VARIANTS.map(v => {
      const r = measure(map, FLEET_TOP, SUP_GUN, lv, true, v.cfg, N_HI);
      HI[id][lv].arms[v.label] = r;
      return `${sd(r.winPct, no.winPct)}/${sd(r.sPct, no.sPct)}`.padStart(16);
    });
    console.log(`  ${id.padEnd(6)} Lv${String(lv).padStart(3)}  ${f1(no.winPct).padStart(5)}%` + cells.join(''));
  }
}
console.log('  （每格 = Δ通过率 pp / ΔS率 pp）');
console.log('');

/* ============================================================
 * ⑤ 定价表：把两种货币折算到同一单位
 *   收益侧 = ΔS率/Δ通过率 × 单场重打成本；成本侧 = 支援自身油弹 + 放弃的远征收益
 * ============================================================ */
console.log('=========== ⑤ 定价表（资源折算 · N-env 口径）===========');
/* 舰队油弹消耗（满编 6 舰一次战斗点的消耗） */
const fuelAmmoOf = spec => spec.reduce((a, id) => {
  const c = (ShipData[id] && ShipData[id].consum) || { fuel: 0, ammo: 0 };   // 字段名是 consum（不是 consumption）
  return a + (c.fuel || 0) + (c.ammo || 0);
}, 0);
const MAIN_COST = fuelAmmoOf(FLEET_TOP);            // 6 舰面板油弹合计（每战斗点各扣 20%）
const redoCost = Math.round(MAIN_COST * 0.20);      // 重打一次 BOSS 点的油弹
const supCost = Math.round(fuelAmmoOf(SUP_GUN) * 0.05);   // [PLACEHOLDER P-2] 支援每舰 油弹各 −5%
console.log(`  主队 6 舰面板油弹合计 ${MAIN_COST}  → 一次 BOSS 点消耗（各 20%）= ${redoCost}`);
console.log(`  支援队 6 舰面板油弹合计 ${fuelAmmoOf(SUP_GUN)} → 支援一次（每舰各 −5%）= ${supCost}`);
/* 远征机会成本：ex1~ex8 的资源合计 */
const exVals = EXPEDITIONS.map(e => {
  const r = e.reward || {};
  return { id: e.id, name: e.name, time: e.time, total: (r.fuel || 0) + (r.ammo || 0) + (r.steel || 0) + (r.baux || 0) };
});
const exAvg = Math.round(exVals.reduce((a, x) => a + x.total, 0) / exVals.length);
const exMax = exVals.slice().sort((a, b) => b.total - a.total)[0];
console.log(`  远征收益：ex1~ex8 平均 ${exAvg} 资源 / 次 ｜ 最高 ${exMax.id} ${exMax.name} ${exMax.total}（${exMax.time} 分钟）`);
console.log('');
console.log('  图      Δ通过率(Lv15)  ΔS率(Lv15)  少失败一次的期望挽回   支援成本      净收益');
for (const id of MAP_IDS) {
  const no = MAIN[id][15].no, ys = MAIN[id][15].ys;
  const dWin = ys.winPct - no.winPct;
  const dS = ys.sPct - no.sPct;
  const gain = dWin / 100 * redoCost;                       // 少失败一次 → 省下一次重打的油弹
  const net = gain - supCost;                                // 未计入远征机会成本（见下方结论）
  console.log(`  ${id.padEnd(6)} ${sd(dWin, 0).padStart(11)}pp ${sd(dS, 0).padStart(10)}pp  ${f1(gain).padStart(10)}`
    + `            ${String(supCost).padStart(6)}      ${f1(net).padStart(7)}`);
}
console.log('');
console.log('  【读法】净收益为正 = 支援的资源账划算；但**真正的机会成本是那支舰队当天放弃的远征**');
console.log(`  （平均 ${exAvg} / 最高 ${exMax.total}）—— 所以「值得在哪几张图开」看的是 Δ通过率是否显著。`);
console.log('  完整结论与建议参数见 design/海域难度评估 同目录的测量结论（交付报告附录 C 逐条回填）。');
