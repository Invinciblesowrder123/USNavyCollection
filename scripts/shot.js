'use strict';
/* ============================================================
 * 浏览器实测截图工具（Gate 4）——复用系统 Edge/Chrome 的无头模式
 * 用法: node scripts/shot.js <页面路径> <输出png> [宽x高]
 *   例: node scripts/shot.js _shot_air.html?case=noCV ../backup/x/air_noCV.png 1440x1200
 * 会按需启动本地服务器（复用 e2e.js 的端口探测逻辑），截完自动关掉。
 * ============================================================ */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = Number(process.env.SHOT_PORT || 3011);
const HOST = '127.0.0.1';
const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];
const page = process.argv[2];
const out = path.resolve(process.argv[3] || 'shot.png');
const size = (process.argv[4] || '1440x1200').split('x');
if (!page || page.startsWith('-') || !process.argv[3]) {
  console.error('用法: node scripts/shot.js <页面路径> <输出png> [宽x高]');
  console.error('  例: node scripts/shot.js "_shot_air.html?case=noCV" "../backup/x/air.png" 1440x1200');
  process.exit(1);
}
const browser = BROWSERS.find(p => fs.existsSync(p));
if (!browser) { console.error('未找到 Edge/Chrome'); process.exit(1); }

function portOpen() {
  return new Promise(res => {
    const req = http.get({ host: HOST, port: PORT, path: '/', timeout: 800 }, r => { r.resume(); res(true); });
    req.on('error', () => res(false));
    req.on('timeout', () => { req.destroy(); res(false); });
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let server = null;
  if (!(await portOpen())) {
    server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore'
    });
    for (let i = 0; i < 25 && !(await portOpen()); i++) await sleep(300);
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const url = `http://${HOST}:${PORT}/${page}`;
  const args = ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--window-size=${size[0]},${size[1]}`, '--virtual-time-budget=8000',
    `--screenshot=${out}`, url];
  await new Promise((res, rej) => {
    const cp = spawn(browser, args, { stdio: 'ignore' });
    cp.on('exit', c => (c === 0 ? res() : rej(new Error('browser exit ' + c))));
  });
  if (server) server.kill();
  const ok = fs.existsSync(out);
  console.log((ok ? '✓ ' : '✗ ') + out + (ok ? ' (' + Math.round(fs.statSync(out).size / 1024) + ' KB)' : ' 未生成'));
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('截图失败: ' + e.message); process.exit(1); });
