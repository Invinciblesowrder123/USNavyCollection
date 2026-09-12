'use strict';
/* ============================================================
 * 战斗引擎「逐位对拍」工具
 *
 * 用途：证明一次重构/改动没有让战斗数值发生漂移。
 *   Math.random 被替换成固定种子的 LCG，因此同一份引擎必然产出同一份摘要；
 *   摘要含每次战斗的评价串、击沉数、伤害合计、日志长度与日志内容指纹。
 *   任意一位不同 = 引擎行为变了。
 *
 * 用法：
 *   node scripts/drift_check.js                          # 打印当前引擎摘要
 *   node scripts/drift_check.js > scripts/battle_digest.baseline.txt   # 存基线
 *   node scripts/drift_check.js --against scripts/battle_digest.baseline.txt   # 与基线对拍
 *   node scripts/drift_check.js --against <另一个 public/js 目录>              # 与另一份代码对拍
 *   USNC_NO_TOUCH=1 node scripts/drift_check.js --against scripts/battle_digest.baseline_v0301.txt
 *       —— 关闭航空触接阶段（opts.touch=false，不消耗随机数）后与 V0.301 基线对拍。
 *          这是「V0.302 除了新增触接判定之外，一位都没动」的证明手段：
 *          触接是唯一新增的随机数消费者，把它关掉必须逐位回到 V0.301。
 *
 * 退出码：0 = 一致（或已打印摘要），1 = 存在差异 / 出错。
 * 注意：这是验证脚本，不是单元断言，不接入 `npm run sim`（跑统计才出结论的检查不塞进常规套件）。
 * ============================================================ */
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const againstIdx = args.indexOf('--against');
const against = againstIdx >= 0 ? args[againstIdx + 1] : null;
const jsIdx = args.indexOf('--js');
const jsRoot = jsIdx >= 0 ? path.resolve(args[jsIdx + 1]) : path.resolve(__dirname, '..', 'public', 'js');

/* ---- 固定种子随机数（覆盖 Math.random，必须在加载引擎前完成） ---- */
let seed = 20260911;
Math.random = function () {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

function loadEngineAt(root) {
  /* 每个 js 根目录用独立的 require 缓存命名空间，避免两份代码互相污染 */
  const P = (...p) => path.join(root, ...p);
  const equipMod = require(P('data', 'equipment.js'));
  const shipsMod = require(P('data', 'ships.js'));
  const mapsMod = require(P('data', 'maps.js'));
  const questsMod = require(P('data', 'quests.js'));
  Object.assign(global, equipMod, shipsMod, mapsMod, questsMod);
  Object.assign(global, require(P('core', 'utils.js')));
  Object.assign(global, require(P('core', 'state.js')));
  Object.assign(global, require(P('game', 'battle.js')));
  Object.assign(global, require(P('game', 'progression.js')));
  Object.assign(global, require(P('game', 'logistics.js')));
  Object.assign(global, require(P('game', 'improve.js')));
  Object.assign(global, require(P('game', 'factory.js')));
  Object.assign(global, require(P('game', 'sortie.js')));
}

process.env.AUTH_DATA_DIR = path.join(require('os').tmpdir(), 'usnc_drift_' + Date.now());
loadEngineAt(jsRoot);
global.localStorage = {
  _d: {}, getItem(k) { return this._d[k] || null; },
  setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; }
};
if (!global.window) { /* 经典脚本全局：Game/Battle/Util 等已由上面注入 */ }
Game.newGame();
Game.gain({ fuel: 999999, ammo: 999999, steel: 999999, baux: 999999 });

function mkFleet(ids, lv, kai) {
  const out = [];
  for (const id of ids) {
    const s = Game.createShip(id, lv);
    s.kai = kai;
    s.hp = Game.shipStats(s.uid).hpMax;
    Game.equipDefaults(s.uid);
    out.push(s.uid);
  }
  return out;
}
const starter = Game.state.fleet[1].slice();
const strong = mkFleet(['enterprise', 'iowa', 'essex', 'fletcher', 'atlanta', 'saratoga'], 99, 1);
const slowBB = mkFleet(['newyork', 'colorado', 'iowa', 'fletcher', 'benson', 'mahan'], 60, 0);
const ddOnly = mkFleet(['fletcher', 'benson', 'mahan', 'kidd', 'sims', 'bagley'], 70, 1);

function hashStr(h, s) { for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff; return h; }
/* USNC_NO_TOUCH=1 / --no-touch：关闭航空触接阶段（该阶段是 V0.302 唯一新增的随机数消费者）。
 * 关掉之后必须逐位回到 V0.301 基线 —— 这是「其余逻辑一位未动」的硬证明。 */
const NO_TOUCH = process.env.USNC_NO_TOUCH === '1' || args.includes('--no-touch');
function run(name, fleet, enemyKey, opts, n) {
  const en = ENEMY_FLEETS[enemyKey];
  const base = NO_TOUCH ? Object.assign({}, opts, { touch: false }) : opts;
  let ranks = '', h = 5381, killed = 0, myDmg = 0, logLen = 0;
  for (let i = 0; i < n; i++) {
    const r = Battle.battle(fleet, en.ships, '单纵阵', en.formation, Object.assign({ fleetIdx: 1 }, base));
    ranks += r.rank;
    killed += r.enemyKilled;
    myDmg += r.mySide.reduce((a, s) => a + s.dealt, 0);
    logLen += r.log.length;
    for (const e of r.log) h = hashStr(h, typeof e === 'string' ? e : JSON.stringify(e));
    if (opts.allowNight === false && i < 5) {
      const nr = Battle.battleNight(r);
      h = hashStr(h, 'N' + nr.rank + nr.log.length);
    }
  }
  return `${name}\tranks=${ranks}\tkilled=${killed}\tmyDmg=${myDmg}\tlogLen=${logLen}\thash=${h}`;
}
const lines = [
  run('starter-vs-F01', starter, 'F01', { allowNight: true }, 120),
  run('starter-vs-F02', starter, 'F02', { allowNight: true }, 120),
  run('strong-vs-F05', strong, 'F05', { allowNight: true }, 80),
  run('strong-vs-F09-day', strong, 'F09', { allowNight: false }, 80),
  run('strong-vs-F18-sub', strong, 'F18', { allowNight: true, sub: true }, 80),
  run('strong-vs-F13-night', strong, 'F13', { allowNight: true, nightOnly: true }, 60),
  run('strong-vs-F35', strong, 'F35', { allowNight: true }, 80),
  run('slowBB-vs-F18-sub', slowBB, 'F18', { allowNight: true, sub: true }, 80),
  run('dd-vs-F20b-sub', ddOnly, 'F20b', { allowNight: true, sub: true }, 80)
];
const out = lines.join('\n') + '\n';

if (!against) {
  process.stdout.write(out);
  process.exit(0);
}

/* ---- 对拍 ---- */
let ref = null;
const againstPath = path.resolve(against);
if (fs.existsSync(againstPath) && fs.statSync(againstPath).isFile()) {
  ref = fs.readFileSync(againstPath, 'utf8');
  console.log('对拍基线文件：' + againstPath);
} else if (fs.existsSync(againstPath)) {
  /* 与另一份代码对拍：起一个子进程跑同一脚本，避免 require 缓存互相污染 */
  console.log('对拍另一份引擎：' + againstPath);
  const cp = require('child_process');
  ref = cp.execFileSync(process.execPath, [__filename, '--js', againstPath], { encoding: 'utf8' });
} else {
  console.error('找不到对拍目标：' + againstPath);
  process.exit(1);
}

if (ref === out) {
  console.log('✓ 战斗数值零漂移：' + lines.length + ' 组场景摘要逐位一致');
  process.exit(0);
}
console.error('✗ 检测到战斗数值漂移：');
const a = ref.trim().split('\n'), b = out.trim().split('\n');
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] !== b[i]) {
    console.error('  - 基线: ' + (a[i] || '(缺失)'));
    console.error('  + 当前: ' + (b[i] || '(缺失)'));
  }
}
process.exit(1);
