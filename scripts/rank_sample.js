'use strict';
/* ============================================================
 * 全图 S 率抽样（V0.307 批次 5 · 任务 5.1 诊断工具）
 *
 * 用途：诊断「5-2 苏里高海峡 BOSS 通过率 100% / S 率 0%」的根因，
 *      并回答「是 5-2 独有，还是所有 mode:'night' 节点共有」。
 *
 * 【方法论 · 与项目红线对齐】
 *   ① 走真实入口：抽样经 Sortie.start → Sortie.prepareBattle → Sortie.continueNight，
 *      与 UI 出击流程（ui/sortie.js doBattle + autoNight）同源。
 *      严禁"直接调 settle/rank 函数 + 手喂参数"——那是自证式测法。
 *      ⚠️ nightOnly 是两步式：Battle.battle({nightOnly:true}) 只返回空壳，
 *         必须再走 Sortie.continueNight → Battle.battleNight 才有真实夜战结算。
 *         漏第二步 ⇒ 测到的是零攻击空壳（S 率恒 0，V0.303 §4 记录的 P1 陷阱）。
 *   ② 测量工具效度自证：先用已知正常图 3-4（普通昼战 BOSS）验证脚本能测出非 0 的 S，
 *      确认工具没坏，才允许拿它去看 5-2。若 3-4 也测出 0 ⇒ 工具坏了，先修工具。
 *   ③ 固定种子：用项目现有 LCG 口径（scripts/drift_check.js 的 1103515245+12345，
 *      与 scripts/sim_support.js 的 1664525+1013904223 同为项目在用口径），
 *      每格独立播种 ⇒ 逐格可复现，且与格子顺序无关。
 *   ④ 每个读数都是**某次抽样**：输出必须标注 N 与种子，不得写成定值。
 *
 * 【口径声明 · 必读】
 *   - 本工具测的是「固定基准编成在固定等级下的评级分布」，是**相对读数**，
 *     不等于"玩家实际会拿到什么评级"。编成一变，测的就不是图而是编成。
 *   - 基准编成取自 scripts/map_difficulty.js 的进度化舰池编成（同源），
 *     保证与 V0.306 海域难度评估的编成口径一致，便于对照。
 *
 * 用法：
 *   node scripts/rank_sample.js                # 默认 N=200/格，Lv90，全 25 图
 *   node scripts/rank_sample.js 400            # 自定义每格场次
 *   node scripts/rank_sample.js 200 60         # 自定义等级
 *   node scripts/rank_sample.js 200 90 verify  # 只跑效度自证（3-4 + 5-2）
 *   node scripts/rank_sample.js 200 90 table   # 只跑逐图×逐节点类型对照表
 * ============================================================ */

/* ---------- 固定种子 LCG（口径同 scripts/drift_check.js:39-42） ---------- */
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; };
}
/* 每格独立播种：格 id 混入种子 ⇒ 逐格可复现，且与遍历顺序无关 */
const BASE_SEED = 20260911;
function seedFor(key) {
  let h = 2166136261;
  for (const ch of String(key)) { h ^= ch.charCodeAt(0); h = (h * 16777619) >>> 0; }
  return (BASE_SEED ^ h) >>> 0;
}

/* ---------- 模块装配（与 scripts/map_difficulty.js 同源） ---------- */
process.env.AUTH_DATA_DIR = require('path').join(require('os').tmpdir(), 'usnc_rs_' + Date.now());
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
global.localStorage = {
  _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; }
};

/* ---------- 基准编成（口径同 scripts/map_difficulty.js 测量 A） ---------- */
const ROLE_SEQ = [['CV', 2], ['CVL', 2], ['BB', 2], ['CA', 2], ['CL', 2], ['DD', 2]];
/* 开放全图进度（EO/BOSS 海域门禁：1-5/2-5/3-5/4-5/5-5 需先击破前图）。
 * 门禁是**进度状态**而非战斗规则，抽样要测的是"评级口径"不是"能不能出门"，
 * 故把前置图标记为已击破 —— 否则这 5 张图整表读数为空（实测 skipped=200）。
 * ⚠️ 口径披露：这样做**不影响任何战斗内的判定**（battle.js 不读 mapProgress）。 */
function unlockAllMaps() {
  for (const m of MAPS) {
    const e = Game.mapProgressEntry(m);
    e.cleared = true;
    Game.state.mapProgress[m.id] = e;
  }
}
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
  return picked.sort((a, b) => ShipData[b].stats[0] - ShipData[a].stats[0]);
}
/* 编成臂：诊断用。
 *  A「进度化基准」= map_difficulty 测量A同源（2CV+2CVL+2BB…）——含航母
 *  N「夜战型」    = 无航母的纯夜战编成（BB/CL/CLT/DD），用于隔离
 *                   「夜战中航母被硬锁定」这一变量对 S 率的影响
 *  T「顶配昼战」  = 全项目最强（2BB+2CV+2DD），作为高能力对照
 * ⚠️ 编成一变，测的就不是"图多难"而是"编得对不对"——每臂读数只在同臂内可比。 */
const FLEET_ARMS = {
  A: null,   // null = 用 fleetFor(map) 进度化编成
  N: ['iowa', 'northcarolina', 'washington', 'atlanta', 'fletcher', 'sumner'],
  T: ['iowa', 'southdakota', 'enterprise', 'essex', 'fletcher', 'baltimore']
};
let ARM = 'A';
function fleetSpecFor(map) {
  if (ARM !== 'A' && FLEET_ARMS[ARM]) return FLEET_ARMS[ARM].slice();
  return fleetFor(map);
}
/* 配装：与 map_difficulty.js equipAir 同源（CV 装舰战+舰爆，其余默认） */
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
    s.morale = 60;
    return s.uid;
  });
  return Game.state.fleet[1].slice();
}
function healFleet(fleet) {
  for (const uid of fleet) {
    const s = Game.state.ships[uid];
    if (!s) continue;
    s.hp = Game.shipStats(uid).hpMax;
    s.supply = { fuel: 1, ammo: 1 };
    s.morale = 60;
  }
}

/* ---------- 单格抽样：走真实入口 ---------- */
/* 开一局新出击并推进到目标 node（真实路径），逐点跳过非战斗节点。
 * ⚠️ 每场抽样都必须从干净状态出发：Sortie.start 在"舰队正在出击中"时会拒绝，
 *    所以进入前先复位 sortie（等同玩家点「返回母港」）。
 * ⚠️ 途经的战斗节点也必须走两步式（夜战点漏 continueNight 会留下未结算的空壳，
 *    但更关键的是它会消耗油弹/士气 —— 不复位则后续样本输入不一致，违反变量隔离）。 */
function advanceToNode(map, nodeId) {
  Game.state.sortie = null;                 // 复位出击状态，保证 start 可重复调用
  const started = Sortie.start(map.id, 1);
  if (!started.ok) return { ok: false, msg: 'start 失败：' + started.msg };
  let guard = 0;
  while (Game.state.sortie.node !== nodeId && guard++ < 20) {
    const cur = Sortie.nodeDef(map, Game.state.sortie.node);
    if (cur.type === 'battle' || cur.type === 'boss') {
      /* 每场战斗前都复位舰况：prepareBattle 拒绝"有舰娘无法战斗/旗舰大破"，
       * 若不复活，途经战斗沉掉的舰会让后续所有样本连锁失败（skip 雪崩），
       * 且样本输入随路径长度漂移 ⇒ 违反变量隔离。 */
      healFleet(Game.state.fleet[1]);
      const p = Sortie.prepareBattle('单纵阵');
      if (!p.ok) return { ok: false, msg: 'prepareBattle 失败：' + p.msg };
      if (p.result.forceNight) Sortie.continueNight(p);   // 途经夜战点同样走完整两步式
      Sortie.settleBattle(p);
    }
    if (!Sortie.moveToNext()) break;
  }
  if (Game.state.sortie.node !== nodeId) return { ok: false, msg: '到不了节点 ' + nodeId };
  return { ok: true };
}

/* 对单个 (map, node) 抽样 N 场。nightFollow=true 时走完整两步式（prepare→continueNight）。 */
function sampleCell(map, nodeId, N, lv, opts = {}) {
  const nightFollow = opts.nightFollow !== false;
  const def = map.defs[nodeId] || {};
  const R = { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0 };
  let skipped = 0, forceNightSeen = 0, nightSettleSeen = 0, shells = 0;
  /* 判据可达性诊断计数（回答"S 的哪一条判据在夜战路径下无法成立"） */
  const diag = { allKilled: 0, noLoss: 0, both: 0, nightUsed: 0, killHist: {}, cvCount: 0, cvNightSilent: 0 };
  /* 编成构成：航母在夜战中被硬锁定（battle.js:946 isCV ⇒ 无法攻击），
   * 故记录"我方航母数 / 其中能参加夜战的数"——用于解释同一张图不同编成的 S 率差异。 */
  {
    const f = Game.state.fleet[1] || [];
    for (const uid of f) {
      const s = Game.state.ships[uid];
      const d = s && ShipData[s.id];
      if (!d) continue;
      if (d.type === 'CV' || d.type === 'CVL') { diag.cvCount++; if (!d.slots || !d.slots.length) diag.cvNightSilent++; }
    }
  }

  for (let i = 0; i < N; i++) {
    const adv = advanceToNode(map, nodeId);
    if (!adv.ok) { skipped++; continue; }
    const fleetUids = Game.state.fleet[1].slice();
    healFleet(fleetUids);
    const saved = Math.random;
    Math.random = lcg(seedFor(`${map.id}/${nodeId}/${i}`));
    try {
      const prep = Sortie.prepareBattle('单纵阵');
      if (!prep.ok) { skipped++; continue; }
      if (prep.result.forceNight) forceNightSeen++;
      let r = prep.result;
      /* ⚠️ 两步式：夜战节点必须补这一步，否则测到的是零攻击空壳 */
      if (nightFollow && r.forceNight) {
        Sortie.continueNight(prep);
        r = prep.result;
        nightSettleSeen++;
      }
      if (r.rank) R[r.rank] = (R[r.rank] || 0) + 1;
      shells += r.log.length;
      const ek = r.enemyKilled;
      diag.killHist[ek + '/' + r.enemyTotal] = (diag.killHist[ek + '/' + r.enemyTotal] || 0) + 1;
      if (r.enemyKilled === r.enemyTotal) diag.allKilled++;
      if (r.myLost === 0) diag.noLoss++;
      if (r.enemyKilled === r.enemyTotal && r.myLost === 0) diag.both++;
      if (r.nightUsed) diag.nightUsed++;
    } finally {
      Math.random = saved;
    }
  }
  const done = N - skipped;
  const win = R.S + R.A + R.B;
  return {
    mapId: map.id, mapName: map.name, nodeId, nodeType: def.type, mode: def.mode || 'normal',
    enemy: def.enemy || '-', N, done, skipped,
    R, sPct: done ? R.S / done * 100 : 0,
    winPct: done ? win / done * 100 : 0,
    aPct: done ? R.A / done * 100 : 0,
    bPct: done ? R.B / done * 100 : 0,
    cPct: done ? R.C / done * 100 : 0,
    dPct: done ? R.D / done * 100 : 0,
    ePct: done ? R.E / done * 100 : 0,
    forceNightSeen, nightSettleSeen, avgLogLen: done ? shells / done : 0,
    diag
  };
}

/* ---------- 节点枚举 ---------- */
function battleNodes(map) {
  return Object.keys(map.defs || {}).filter(id => {
    const t = map.defs[id].type;
    return t === 'battle' || t === 'boss';
  });
}

/* ---------- 主流程 ---------- */
const N = parseInt(process.argv[2], 10) || 200;
const LV = parseInt(process.argv[3], 10) || 90;
const MODE = process.argv[4] || 'all';
ARM = (process.argv[5] || 'A').toUpperCase();

Game.newGame();
Game.state.admiral.level = LV;
unlockAllMaps();
Game.gain({ fuel: 999999, ammo: 999999, steel: 999999, baux: 999999, screws: 300, devMats: 300 });

const pad = (s, n) => String(s).padEnd(n);
const pct = v => (Math.round(v * 10) / 10).toFixed(1).padStart(5);

console.log('=========== 0. 工具与口径 ===========');
console.log(`编成口径= ${ARM === 'A' ? 'map_difficulty 测量A（进度化舰池）' : '臂 ' + ARM + ' ' + JSON.stringify(FLEET_ARMS[ARM])}  等级=Lv${LV}  N=${N}/格`);
console.log(`种子口径= drift_check LCG(1103515245+12345) 基准种子=${BASE_SEED}（每格按 map/node/序 派生，逐格可复现）`);
console.log('入口链  = Sortie.start → advanceToNode → Sortie.prepareBattle → Sortie.continueNight（与 UI 同源）');

/* ---------- 效度自证（红线：先证明测量工具没坏） ---------- */
if (MODE === 'all' || MODE === 'verify') {
  console.log('\n=========== 1. 测量工具效度自证（必须先过这一关）===========');
  console.log('对照图：3-4（普通昼战 BOSS，有航母硬门槛）—— S 率应为非 0 的合理区间');
  console.log('若 3-4 也测出 S=0 ⇒ 工具坏了，禁止继续看 5-2\n');

  const m34 = MAPS.find(m => m.id === '3-4');
  Game.newGame(); Game.state.admiral.level = LV; unlockAllMaps();
  Game.gain({ fuel: 999999, ammo: 999999, steel: 999999, baux: 999999, screws: 300, devMats: 300 });
  buildFleet(fleetSpecFor(m34), LV);
  const v34 = sampleCell(m34, m34.boss, N, LV);
  console.log(`[效度对照] 3-4 BOSS(node ${v34.nodeId}/${v34.mode}) N=${v34.done}  S=${pct(v34.sPct)}%  A=${pct(v34.aPct)}%  B=${pct(v34.bPct)}%  C=${pct(v34.cPct)}%  D=${pct(v34.dPct)}%  E=${pct(v34.ePct)}%  通过=${pct(v34.winPct)}%`);

  /* 反向对照：同一条链路故意漏掉 continueNight（模拟 V0.303 §4 的 P1 陷阱） */
  const v34b = sampleCell(m34, m34.boss, Math.min(N, 200), LV, { nightFollow: false });
  console.log(`[反向对照] 3-4 同链路但强制走完整结算（3-4 无夜战点，两臂应一致）  S=${pct(v34b.sPct)}%  通过=${pct(v34b.winPct)}%`);

  const toolOK = v34.sPct > 0;
  console.log(`\n[效度结论] 3-4 S 率 = ${pct(v34.sPct)}%  ⇒ ${toolOK ? '✅ 工具能测出非 0 的 S，允许继续诊断 5-2' : '❌ 工具测不出 S，工具本身有问题，禁止继续'}`);

  /* 5-2 读数（仅在工具通过后解读） */
  const m52 = MAPS.find(m => m.id === '5-2');
  Game.newGame(); Game.state.admiral.level = LV; unlockAllMaps();
  Game.gain({ fuel: 999999, ammo: 999999, steel: 999999, baux: 999999, screws: 300, devMats: 300 });
  buildFleet(fleetSpecFor(m52), LV);
  const v52 = sampleCell(m52, m52.boss, N, LV);
  console.log(`\n[目标读数] 5-2 BOSS(node ${v52.nodeId}/${v52.mode}) N=${v52.done}  S=${pct(v52.sPct)}%  A=${pct(v52.aPct)}%  B=${pct(v52.bPct)}%  C=${pct(v52.cPct)}%  D=${pct(v52.dPct)}%  E=${pct(v52.ePct)}%  通过=${pct(v52.winPct)}%`);
  console.log(`[判据可达性] 全歼(enemyKilled==enemyTotal)=${v52.diag.allKilled}/${v52.done}  无损失(myLost==0)=${v52.diag.noLoss}/${v52.done}  两者同时=${v52.diag.both}/${v52.done}  夜战已结算(nightUsed)=${v52.diag.nightUsed}/${v52.done}`);
  console.log(`[链路证据] forceNight 标记出现=${v52.forceNightSeen}/${v52.done}  continueNight 后重结算=${v52.nightSettleSeen}/${v52.done}  平均日志行=${v52.avgLogLen.toFixed(1)}`);
  console.log(`[击沉数分布] ${JSON.stringify(v52.diag.killHist)}`);
  console.log(`[我方航母] 共 ${v52.diag.cvCount} 艘（航母在夜战中无法攻击，见 battle.js:946 isCV 分支）`);

  /* 故意漏掉第二步的对照，证明"漏第二步"不是本次读数的成因 */
  const v52b = sampleCell(m52, m52.boss, Math.min(N, 200), LV, { nightFollow: false });
  console.log(`\n[空壳对照] 5-2 故意不调 continueNight（复现 V0.303 P1 陷阱）  S=${pct(v52b.sPct)}%  通过=${pct(v52b.winPct)}%  forceNight=${v52b.forceNightSeen}  平均日志行=${v52b.avgLogLen.toFixed(1)}`);
  console.log('  ⇒ 对比两臂可判定：本次读数是"真实夜战结算"还是"零攻击空壳"。');
}

/* ---------- 逐图 × 逐节点类型对照表 ---------- */
if (MODE === 'all' || MODE === 'table') {
  console.log('\n=========== 2. 逐图 × 逐节点类型 S 率对照表 ===========');
  console.log(`（某次抽样：N=${N}/格，Lv${LV}，进度化基准编成，种子基准=${BASE_SEED}；读数为抽样值，非定值）\n`);
  console.log('图      节点  类型   mode     敌编成   N    S%    A%    B%    C%    D%    E%   通过%  全歼  无损  同时  夜战已结算');
  const rows = [];
  for (const map of MAPS) {
    Game.newGame(); Game.state.admiral.level = LV; unlockAllMaps();
    Game.gain({ fuel: 999999, ammo: 999999, steel: 999999, baux: 999999, screws: 300, devMats: 300 });
    const spec = fleetFor(map);
    if (!spec.length) continue;
    buildFleet(spec, LV);
    for (const nodeId of battleNodes(map)) {
      const r = sampleCell(map, nodeId, N, LV);
      if (!r.done) { console.log(`${pad(map.id, 6)} ${pad(nodeId, 5)} ${pad(r.nodeType, 6)} ${pad(r.mode, 8)} ${pad(r.enemy, 7)}  skipped=${r.skipped}`); continue; }
      rows.push(r);
      console.log(
        `${pad(map.id, 6)} ${pad(nodeId, 5)} ${pad(r.nodeType, 6)} ${pad(r.mode, 8)} ${pad(r.enemy, 7)} ${pad(r.done, 4)}`
        + `${pct(r.sPct)} ${pct(r.aPct)} ${pct(r.bPct)} ${pct(r.cPct)} ${pct(r.dPct)} ${pct(r.ePct)} ${pct(r.winPct)}`
        + `  ${pad(r.diag.allKilled, 4)} ${pad(r.diag.noLoss, 4)} ${pad(r.diag.both, 4)} ${pad(r.diag.nightUsed, 5)}`
      );
    }
  }

  /* 按节点类型汇总：回答"是 5-2 独有还是所有 night 节点共有" */
  const byMode = {};
  for (const r of rows) {
    const k = r.mode;
    byMode[k] = byMode[k] || { cells: 0, s: 0, win: 0, done: 0, zeroS: 0, ids: [] };
    const b = byMode[k];
    b.cells++; b.done += r.done; b.s += r.R.S; b.win += r.R.S + r.R.A + r.R.B;
    if (r.sPct === 0) { b.zeroS++; b.ids.push(`${r.mapId}/${r.nodeId}`); }
  }
  console.log('\n=========== 3. 按节点类型汇总（某次抽样，N=' + N + '/格）===========');
  console.log('mode     格数  总场次   S次数   S率     通过率   S率=0的格');
  for (const k of Object.keys(byMode).sort()) {
    const b = byMode[k];
    console.log(`${pad(k, 8)} ${pad(b.cells, 4)} ${pad(b.done, 7)} ${pad(b.s, 7)} ${pct(b.done ? b.s / b.done * 100 : 0)}% ${pct(b.done ? b.win / b.done * 100 : 0)}%   ${b.zeroS}/${b.cells} ${b.zeroS ? '(' + b.ids.join(',') + ')' : ''}`);
  }
  console.log('\n结论提示：若 night 组的 S 率=0 的格覆盖了全部 mode:night 节点（而非只有 5-2），');
  console.log('          则这是"所有夜战节点共有"的性质，不是 5-2 的数据问题。');
}

console.log('\n（读完记得：以上每个读数都是**某次抽样**，引用时必须带 N 与等级。改动 battle.js 会使本表读数变化 —— 需重跑。）');