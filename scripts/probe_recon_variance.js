'use strict';
/* ============================================================
 * 方向五「带舰侦编成的 T 不利频率」测量效度探针（V0.305）
 *
 * 为什么需要它：`simulate.js` 里那条统计断言的**复现量会随状态污染而漂**——一旦被测航母被前面的
 * section 打到大破/轰沉，`hasReconPlane` 判据失效，差值就从 ~5pp 掉到 2.4pp 附近并偶发假失败。
 * 本探针在**干净状态**下重复测量，给出差值的均值/标准差/极值，用来回答两个问题：
 *   ① 机制本身有没有变（均值应与基础表 10% → 引导表 5% 的 5pp 理论差一致）；
 *   ② 断言阈值还有多少余量（阈值 2.5pp 相对实测分布的标准差）。
 *
 * 用法: node scripts/probe_recon_variance.js [轮数] [每轮场次]     （默认 16 轮 × 4000 场）
 * 参考：2026-09-14 实测 差值 4.99±0.62pp，最小 3.60pp，最大 5.73pp → 阈值余量约 4σ。
 * ============================================================ */
const path = require('path');
process.env.AUTH_DATA_DIR = path.join(require('os').tmpdir(), 'usnc_recon_' + Date.now());
require('../auth.js');
const base = '../public/js/';
Object.assign(global, require(base + 'data/equipment.js'), require(base + 'data/ships.js'),
  require(base + 'data/maps.js'), require(base + 'data/history.js'), require(base + 'data/quests.js'));
Object.assign(global, require(base + 'core/utils.js'));
Object.assign(global, require(base + 'core/state.js'));
Object.assign(global, require(base + 'game/battle.js'));
Object.assign(global, require(base + 'game/factory.js'));
Object.assign(global, require(base + 'game/improve.js'));
Object.assign(global, require(base + 'game/logistics.js'));
Object.assign(global, require(base + 'game/progression.js'));
Object.assign(global, require(base + 'game/sortie.js'));
global.localStorage = {
  _d: {}, getItem(k) { return this._d[k] || null; },
  setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; }
};

const ROUNDS = parseInt(process.argv[2] || '16', 10);
const N = parseInt(process.argv[3] || '4000', 10);
const ENEMY = 'F02';

Game.newGame();
Game.gain({ fuel: 99999, ammo: 99999, steel: 99999, baux: 99999 });
function mk(shipId, lv, kai, eqIds) {
  const s = Game.createShip(shipId, lv);
  s.kai = kai || 0;
  s.equipped = eqIds.map(id => Game.createEquip(id).uid);
  s.hp = Game.shipStats(s.uid).hpMax;
  s.supply = { fuel: 1, ammo: 1 };
  return s.uid;
}
/* 与 simulate.js 完全同一构造：仅第 4 槽位 舰战 → 舰侦（sbdvs2, cat '舰侦'） */
const iowaUid = mk('iowa', 99, 1, ['gun16in_50', 'gun16in_50', 'ap_mk8', 'os2u']);
const cvUid = mk('enterprise', 99, 1, ['f6f5', 'f6f5', 'f6f5', 'f6f5']);
const ddUid2 = mk('fletcher', 80, 0, ['gun5in_38', 'torp_mk15', 'torp_mk15', 'torp_mk15']);
const cvReconUid = mk('enterprise', 99, 1, ['f6f5', 'f6f5', 'f6f5', 'sbdvs2']);
Game.state.fleet[1] = [iowaUid, cvUid, ddUid2];
const fleetNoRecon = [iowaUid, cvUid, ddUid2];
const fleetRecon = [iowaUid, cvReconUid, ddUid2];

function engStats(fleet, n) {
  const out = { tot: 0, reconOk: 0, dis: 0 };
  for (let i = 0; i < n; i++) {
    const r = Battle.battle(fleet, ENEMY_FLEETS[ENEMY].ships, '单纵阵', ENEMY_FLEETS[ENEMY].formation,
      { allowNight: false, fleetIdx: 1 });
    out.tot++;
    if (r.recon !== false) out.reconOk++;
    if ((r.engagement || 'PARALLEL') === 'T_DIS') out.dis++;
  }
  return out;
}

const gaps = [], nos = [], res = [];
for (let k = 0; k < ROUNDS; k++) {
  /* 每轮都补满耐久与补给：消除"战舰被打伤 → 判据失效"这条污染路径 */
  for (const u of [iowaUid, cvUid, ddUid2, cvReconUid]) {
    const s = Game.state.ships[u];
    if (s) { s.hp = Game.shipStats(u).hpMax; s.supply = { fuel: 1, ammo: 1 }; }
  }
  const a = engStats(fleetNoRecon, N);
  const b = engStats(fleetRecon, N);
  const rateNo = a.dis / Math.max(1, a.tot);
  const rateRe = b.dis / Math.max(1, b.tot);
  nos.push(rateNo); res.push(rateRe); gaps.push(rateNo - rateRe);
  console.log(`轮${k + 1}: 无舰侦=${(rateNo * 100).toFixed(2)}% 带舰侦=${(rateRe * 100).toFixed(2)}%`
    + ` 差值=${((rateNo - rateRe) * 100).toFixed(2)}pp`
    + ` 索敌成功 无=${(a.reconOk / N * 100).toFixed(1)}% 有=${(b.reconOk / N * 100).toFixed(1)}%`);
}
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
console.log(`\n差值：均值 ${(mean(gaps) * 100).toFixed(2)}pp 标准差 ${(sd(gaps) * 100).toFixed(2)}pp`
  + ` 最小 ${(Math.min(...gaps) * 100).toFixed(2)}pp 最大 ${(Math.max(...gaps) * 100).toFixed(2)}pp`);
console.log(`无舰侦：均值 ${(mean(nos) * 100).toFixed(2)}% 标准差 ${(sd(nos) * 100).toFixed(2)}pp`
  + ` ｜ 带舰侦：均值 ${(mean(res) * 100).toFixed(2)}% 标准差 ${(sd(res) * 100).toFixed(2)}pp`);
const margin = (mean(gaps) - 0.025) / Math.max(1e-9, sd(gaps));
console.log(`断言阈值 2.5pp 相对实测分布的余量：${margin.toFixed(1)}σ`
  + `${margin >= 3 ? '（足够）' : '（偏紧，先查状态污染再考虑调阈值）'}`);
