'use strict';
/* ============================================================
 * 方向五「侦察引导航向」—— Gate 1 纸面验证（任务 2.4）
 *
 * 目的：在实现之前量化「索敌成功 + 携带舰侦 → 交战形态权重向有利偏移」到底能改变多少。
 *       决策规则（任务书）：对 S 胜率的影响 < 1 个百分点 → 终止本方向。
 *
 * 三段：
 *   1) 抽取段：交战形态抽取 2000 次 ×2 组（现状权重 vs 候选偏移权重）→ T 不利频率差。
 *   2) 估计段：S 胜率影响用**重要性再加权**估计（不动生产代码）：
 *        跑 N 场真实战斗 → 记录 (交战形态, 评价) →
 *        S_base  = 实际 S 率（抽取本身服从现状权重）
 *        S_shift = Σ_e (w'_e / w_e) · (#S_e / N)
 *      得到「同一批战斗，只把航向抽取换一套权重」的期望 S 率。
 *   3) 实测段（实现后复跑）：同编队带 / 不带舰侦直接对照，给出落地后的 S 率与 T 不利频率。
 *
 * 结论写入 `../design/方向五_纸面验证结论.md`。本文件是验证脚本，不接入 `npm run sim`
 * （跑统计才出结论的检查不当单元断言）。
 *
 * 用法: node scripts/recon_eng_paper.js
 * ============================================================ */
process.env.AUTH_DATA_DIR = require('path').join(require('os').tmpdir(), 'usnc_paper_' + Date.now());
const equipMod = require('../public/js/data/equipment.js');
const shipsMod = require('../public/js/data/ships.js');
const mapsMod = require('../public/js/data/maps.js');
const questsMod = require('../public/js/data/quests.js');
Object.assign(global, equipMod, shipsMod, mapsMod, questsMod);
Object.assign(global, require('../public/js/core/utils.js'));
Object.assign(global, require('../public/js/core/state.js'));
Object.assign(global, require('../public/js/game/battle.js'));
Object.assign(global, require('../public/js/game/progression.js'));
Object.assign(global, require('../public/js/game/logistics.js'));
Object.assign(global, require('../public/js/game/improve.js'));
Object.assign(global, require('../public/js/game/factory.js'));
Object.assign(global, require('../public/js/game/sortie.js'));
global.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };

/* 现状权重（wiki 45/30/15/10）与候选偏移权重（单向、单级、不消灭 T 不利） */
const W_BASE = Battle.ENG_WEIGHTS.base;
const W_SHIFT = Battle.ENG_WEIGHTS.recon;
const p = w => { const t = Object.values(w).reduce((a, b) => a + b, 0); const o = {}; for (const k in w) o[k] = w[k] / t; return o; };
const PB = p(W_BASE), PS = p(W_SHIFT);

console.log('=== 1. 交战形态抽取：T 不利频率（各 2000 次独立抽取） ===');
const N_DRAW = 2000;
const drawFreq = w => { const c = { PARALLEL: 0, REVERSE: 0, T_ADV: 0, T_DIS: 0 }; for (let i = 0; i < N_DRAW; i++) c[Util.weighted(w)]++; return c; };
const dBase = drawFreq(W_BASE), dShift = drawFreq(W_SHIFT);
const pct = n => (n / N_DRAW * 100).toFixed(2) + '%';
console.log(`  现状 ${JSON.stringify(W_BASE)} → T不利 ${pct(dBase.T_DIS)}  T有利 ${pct(dBase.T_ADV)}`);
console.log(`  候选 ${JSON.stringify(W_SHIFT)} → T不利 ${pct(dShift.T_DIS)}  T有利 ${pct(dShift.T_ADV)}`);
console.log(`  T 不利频率差（理论值）= ${((PB.T_DIS - PS.T_DIS) * 100).toFixed(2)} 个百分点`);

/* ---- 战斗级影响 ---- */
Game.newGame();
Game.gain({ fuel: 999999, ammo: 999999, steel: 999999, baux: 999999 });
function mkFleet(ids, lv, kai, equipOverride) {
  const out = [];
  for (const id of ids) {
    const s = Game.createShip(id, lv);
    s.kai = kai;
    s.hp = Game.shipStats(s.uid).hpMax;
    Game.equipDefaults(s.uid);
    if (equipOverride && equipOverride[id]) s.equipped = equipOverride[id].map(e => Game.createEquip(e).uid);
    out.push(s.uid);
  }
  return out;
}
const STRONG = mkFleet(['enterprise', 'iowa', 'essex', 'fletcher', 'atlanta', 'saratoga'], 99, 1);
const MID = mkFleet(['enterprise', 'iowa', 'essex', 'fletcher', 'atlanta', 'saratoga'], 40, 0);
const LOW = Game.state.fleet[1].slice();
/* 带舰侦对照：同编队，仅把一艘空母的第 4 格舰战换成舰侦（占用舰战槽，制空略降） */
const MID_RECON = mkFleet(['enterprise', 'iowa', 'essex', 'fletcher', 'atlanta', 'saratoga'], 40, 0,
  { enterprise: ['f6f5', 'f6f5', 'f6f5', 'sbdvs2'] });
const FLEETS = { '强编队 Lv99改': STRONG, '中编队 Lv40': MID, '低配 Lv10 双舰': LOW };
const SCEN = [['1-2 B点 F05', 'F05'], ['1-3 BOSS F09', 'F09'], ['3-1 BOSS F35', 'F35']];
const ENG = ['PARALLEL', 'REVERSE', 'T_ADV', 'T_DIS'];
const N_BATTLE = Number(process.argv[2]) || 4000;

console.log(`\n=== 2. S 胜率影响（估计段：每格 ${N_BATTLE} 场真实战斗 + 重要性再加权） ===`);
console.log('  ' + '舰队 / 海域'.padEnd(30) + 'S率(现状)  S率(候选)  差(pp)  T不利场S率 T有利场S率');
const rows = [];
for (const fname in FLEETS) {
  for (const [sname, key] of SCEN) {
    const en = ENEMY_FLEETS[key];
    const tot = {}, sCnt = {};
    for (const e of ENG) { tot[e] = 0; sCnt[e] = 0; }
    let sAll = 0;
    for (let i = 0; i < N_BATTLE; i++) {
      const r = Battle.battle(FLEETS[fname], en.ships, '单纵阵', en.formation, { allowNight: true, fleetIdx: 1 });
      const e = r.engagement || 'PARALLEL';
      tot[e]++; if (r.rank === 'S') { sCnt[e]++; sAll++; }
    }
    const sBase = sAll / N_BATTLE;
    let sShift = 0;
    for (const e of ENG) sShift += (PS[e] / PB[e]) * (sCnt[e] / N_BATTLE);
    const dPts = (sShift - sBase) * 100;
    const rOf = e => tot[e] ? (sCnt[e] / tot[e] * 100).toFixed(1) + '%' : 'n/a';
    console.log('  ' + (fname + ' / ' + sname).padEnd(28)
      + (sBase * 100).toFixed(2).padStart(8) + '%' + (sShift * 100).toFixed(2).padStart(9) + '%'
      + (dPts >= 0 ? '+' : '') + dPts.toFixed(2).padStart(7)
      + '  ' + rOf('T_DIS').padStart(9) + '  ' + rOf('T_ADV').padStart(9));
    rows.push({ fleet: fname, scen: sname, sBase, sShift, dPts });
  }
}
const maxAbs = Math.max(...rows.map(r => Math.abs(r.dPts)));
console.log(`\n  |ΔS| 最大 = ${maxAbs.toFixed(2)} 个百分点`);
console.log(`  决策规则：< 1.00 → 终止本方向；≥ 1.00 → 进入任务 2.5`);
console.log(`  结论：${maxAbs < 1 ? '★ 终止（改善上限不足以支撑玩家感知）' : '→ 进入 2.5 实现（已实现）'}`);

console.log(`\n=== 3. 实测段（实现后）：带 / 不带舰侦直接对照（每格 ${N_BATTLE} 场） ===`);
console.log('  ' + '舰队 / 海域'.padEnd(30) + 'S率(不带舰侦) S率(带舰侦)  Δ(pp)  T不利率(不带) T不利率(带)');
function measure(fleet, key, n) {
  const en = ENEMY_FLEETS[key];
  let s = 0, dis = 0, reconOk = 0, tot = 0;
  for (let i = 0; i < n; i++) {
    const r = Battle.battle(fleet, en.ships, '单纵阵', en.formation, { allowNight: true, fleetIdx: 1 });
    tot++;
    if (r.rank === 'S') s++;
    if (r.recon !== false) reconOk++;
    if (r.engagement === 'T_DIS') dis++;
  }
  return { sRate: s / tot, disRate: dis / Math.max(1, reconOk) };
}
for (const [sname, key] of SCEN) {
  const a = measure(MID, key, N_BATTLE);
  const b = measure(MID_RECON, key, N_BATTLE);
  console.log('  中编队 Lv40 / ' + sname.padEnd(18)
    + (a.sRate * 100).toFixed(2).padStart(12) + '%' + (b.sRate * 100).toFixed(2).padStart(11) + '%'
    + ((b.sRate - a.sRate) * 100 >= 0 ? '+' : '') + ((b.sRate - a.sRate) * 100).toFixed(2).padStart(7)
    + '  ' + (a.disRate * 100).toFixed(2).padStart(11) + '%' + (b.disRate * 100).toFixed(2).padStart(10) + '%');
}
console.log('\n  说明：带舰侦=S 率更高，代价是占用一个舰战槽（制空下降）。两者之差即玩家要权衡的取舍。');
