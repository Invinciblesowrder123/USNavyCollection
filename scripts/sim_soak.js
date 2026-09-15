'use strict';
/* ============================================================
 * sim soak：把 `npm run sim` 连跑 N 轮，逐轮落盘，失败即报出 ✗ 行与上下文
 *
 * 用法:
 *   npm run sim:soak            # 默认 40 轮
 *   npm run sim:soak -- 60      # 指定轮数
 *   node scripts/sim_soak.js 100
 *
 * 为什么需要它（V0.305 的教训）：
 *   「12 连跑全绿」**不能**支撑"无 flaky"的结论 —— p=5% 的假失败率下，
 *   12 连全绿的概率仍有 54%。本脚本每轮保存完整输出，所以复现到的失败可以
 *   直接定位到断言名与上下文，而不必回头重跑。
 *
 * ⚠️ 它仍然只能**排除** p ≥ 1 − 0.05^(1/N)（N 轮、95% 置信）：
 *   N=40 → 排除 p ≥ 7.2%；N=60 → 排除 p ≥ 4.9%。p=1% 的残留照样有 ~55% 概率全绿。
 *   所以 soak 全绿只是"没发现"，不是"不存在"。修 flaky 要用**效度工具**
 *   （如 `npm run probe:recon`），不是刷连跑次数。
 * ============================================================ */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const ROUNDS = Math.max(1, parseInt(process.argv[2] || '40', 10) || 40);
const OUTDIR = path.join(ROOT, '..', '_soak');

function excludedP(n) { return 1 - Math.pow(0.05, 1 / n); }

fs.rmSync(OUTDIR, { recursive: true, force: true });
fs.mkdirSync(OUTDIR, { recursive: true });

console.log(`sim soak：${ROUNDS} 轮（逐轮落盘 → ${path.relative(ROOT, OUTDIR)}/）`);
console.log(`结束后若全绿，只能排除 p ≥ ${(excludedP(ROUNDS) * 100).toFixed(1)}%（95% 置信）—— 这不是"无 flaky"的证明。\n`);

const failures = [];
let lastSummary = '';

for (let i = 1; i <= ROUNDS; i++) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'simulate.js')], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const summary = (out.match(/通过 \d+ 项，失败 \d+ 项/) || ['(无汇总行)']).pop();
  lastSummary = summary;
  const bad = out.split('\n').filter(l => l.indexOf('✗') >= 0).map(l => l.trim());
  const ok = r.status === 0 && bad.length === 0;
  fs.writeFileSync(path.join(OUTDIR, `run_${String(i).padStart(3, '0')}${ok ? '' : '_FAIL'}.log`), out, 'utf8');
  if (ok) {
    process.stdout.write(`  ${i}/${ROUNDS} ok  ${summary}\n`);
  } else {
    failures.push(i);
    console.log(`  ${i}/${ROUNDS} ✗ exit=${r.status} ${summary}`);
    if (bad.length) for (const l of bad) console.log('      ' + l);
    const tail = out.trim().split('\n').slice(-20);
    console.log('      --- 末 20 行 ---');
    for (const l of tail) console.log('      ' + l);
    console.log(`      （完整输出：${path.relative(ROOT, path.join(OUTDIR, `run_${String(i).padStart(3, '0')}_FAIL.log`))}）`);
  }
}

console.log(`\n结果：${ROUNDS - failures.length}/${ROUNDS} 全绿${failures.length ? '，失败轮次 ' + failures.join(',') : ''}`);
console.log(`最后一轮汇总：${lastSummary}`);
if (!failures.length) {
  console.log(`可排除的假失败率下界：p ≥ ${(excludedP(ROUNDS) * 100).toFixed(1)}%（N=${ROUNDS}, 95% 置信）`);
} else {
  console.log('失败轮的完整输出已落盘 → 先按断言行逐条归因，**不要**直接调阈值让它变绿。');
}
process.exit(failures.length ? 1 : 0);
