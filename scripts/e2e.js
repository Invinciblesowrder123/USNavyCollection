'use strict';
/* ============================================================
 * 浏览器端 E2E 自动化：启动服务器（若未运行）→ 无头浏览器跑
 * public/test_flow.html → 解析 #result 中的 JSON → 输出统计
 *
 * 用法: npm run test:e2e
 * 说明: 复用系统已安装的 Edge / Chrome，无需额外下载浏览器。
 * ============================================================ */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = Number(process.env.E2E_PORT || 3000);
const HOST = '127.0.0.1';
const BASE = `http://${HOST}:${PORT}`;
const OUT = path.join(__dirname, '..', '.e2e-dump.html');

const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];

function findBrowser() {
  return BROWSER_CANDIDATES.find(p => fs.existsSync(p)) || null;
}

function portOpen() {
  return new Promise(resolve => {
    const req = http.get({ host: HOST, port: PORT, path: '/', timeout: 1000 }, res => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function waitReady(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portOpen()) return true;
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

function runBrowser(browser, url) {
  return new Promise((resolve, reject) => {
    const args = [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--virtual-time-budget=20000', '--dump-dom', url
    ];
    const child = spawn(browser, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let buf = '';
    let settled = false;
    child.stdout.on('data', d => { buf += d; });
    child.on('error', err => { if (!settled) { settled = true; reject(err); } });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      try { fs.writeFileSync(OUT, buf); } catch (e) { /* 忽略写入失败 */ }
      resolve({ code, html: buf });
    });
  });
}

function extractResult(html) {
  const m = html.match(/id="result">([\s\S]*?)<\/div>/);
  if (!m) return null;
  const raw = m[1]
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").trim();
  if (!raw || raw === 'RUNNING') return { pending: true, raw };
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { parseError: e.message, raw: raw.slice(0, 300) };
  }
}

function stop(child) {
  if (!child || child.killed) return;
  try { child.kill(); } catch (e) { /* 忽略 */ }
}

(async () => {
  const browser = findBrowser();
  if (!browser) {
    console.error('未找到 Edge 或 Chrome，无法运行 E2E');
    process.exit(1);
  }

  let server = null;
  const alreadyRunning = await portOpen();
  if (!alreadyRunning) {
    server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      stdio: 'ignore', detached: false
    });
    if (!(await waitReady(20000))) {
      console.error('服务器启动超时');
      stop(server);
      process.exit(1);
    }
  }

  let result;
  try {
    const { html } = await runBrowser(browser, `${BASE}/test_flow.html`);
    result = extractResult(html);
  } catch (e) {
    console.error('浏览器执行失败:', e.message);
    stop(server);
    process.exit(1);
  } finally {
    if (!alreadyRunning) stop(server);
  }

  console.log(`\n== 浏览器端 E2E（${path.basename(browser)}）==`);

  if (!result) {
    console.error('  未能读取 #result');
    process.exit(1);
  }
  if (result.pending) {
    console.error('  页面测试未跑完（#result 仍为 RUNNING）');
    process.exit(1);
  }
  if (result.parseError) {
    console.error('  结果解析失败:', result.parseError);
    console.error('  原始内容:', result.raw);
    process.exit(1);
  }

  const results = result.results || [];
  const errors = result.errors || [];
  const failed = results.filter(r => r.startsWith('FAIL'));

  for (const r of failed) console.error('  ✗ ' + r);
  for (const e of errors) console.error('  ! JS错误: ' + e);

  console.log(`\n通过 ${results.length - failed.length} 项，失败 ${failed.length} 项，JS错误 ${errors.length} 项`);

  if (failed.length || errors.length) process.exit(1);
  process.exit(0);
})();
