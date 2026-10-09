'use strict';
/* ============================================================
 * 浏览器端 E2E 自动化：启动服务器（若未运行）→ 无头浏览器跑
 * public/test_flow.html → 解析 #result 中的 JSON → 输出统计
 *
 * 用法: npm run test:e2e
 * 说明: 复用系统已安装的 Edge / Chrome，无需额外下载浏览器。
 *
 * ── 为什么用 CDP 而不是 --dump-dom ──────────────────────────
 * 2026-10-09 实测：本机 Edg/154.0.4258.62 上 `--dump-dom` 已完全失效——
 * 进程 exit code 0，但 stdout 恒为 0 字节，stderr 也空。对照实验：
 * 让它 dump http://127.0.0.1:3000/api/health（一个纯 JSON、必然有 body
 * 的极简页面）同样返回 0 字节 ⇒ 与本项目页面/服务器/代码无关，是浏览器
 * 侧的 dump-dom 通道失效。
 * 故改为 Chrome DevTools Protocol over WebSocket 直读 DOM：
 * 零npm 依赖（Node ≥ 22 自带 globalThis.WebSocket）。
 *
 * 改造带来的额外价值：能区分「页面根本没跑完」与「跑了但断言失败」——
 * 见 reportDiagnostics()。
 * ============================================================ */

const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = Number(process.env.E2E_PORT || 3000);
const HOST = '127.0.0.1';
const BASE = `http://${HOST}:${PORT}`;
const OUT = path.join(__dirname, '..', '.e2e-dump.html');

/* 页面跑完的等待上限。CDP 是真实时间轮询（不再是 --virtual-time-budget 的
 * 虚拟时间），历史全量约 330 条断言、含多轮全 25 张地图遍历，故给足余量。*/
const PAGE_TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS || 90000);
const CDP_READY_TIMEOUT_MS = 30000;
const PROFILE_RETRY = 10;

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

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 让系统分配一个空闲端口，避免固定端口撞车（撞车会让 CDP 连到别人的浏览器）*/
function freePort() {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.on('error', () => resolve(0));
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

function httpJson(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: HOST, port, path: urlPath, timeout: 1500 }, res => {
      let s = '';
      res.on('data', d => { s += d; });
      res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

/* ------------------------------------------------------------
 * 结果解析
 * ------------------------------------------------------------ */

/* parseResultText = 原 extractResult 的第 3~5 步，语义逐字保留：
 * 空/RUNNING → pending；JSON.parse 失败 → parseError + 300 字原文。
 * CDP 直读 textContent 时已拿到解码后的文本，无需再解HTML 实体。 */
function parseResultText(raw) {
  if (!raw || raw === 'RUNNING') return { pending: true, raw };
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { parseError: e.message, raw: raw.slice(0, 300) };
  }
}

/* 保留原 html 入口（从 DOM 文本反查 #result），供将来有 dump 需求时复用 */
function extractResult(html) {
  const m = html.match(/id="result">([\s\S]*?)<\/div>/);
  if (!m) return null;
  const raw = m[1]
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").trim();
  return parseResultText(raw);
}

function stop(child) {
  if (!child || child.killed) return;
  try { child.kill(); } catch (e) { /* 忽略 */ }
}

/* Windows 上 Edge 会派生子进程，父进程退出后 profile 目录仍被锁（EBUSY）。
 * 先走 CDP 的优雅关闭拿browser 级 socket，拿不到再退回 taskkill /T，
 * 最后对删除动作本身重试。 */
async function cleanupProfile(dir, child) {
  for (let i = 0; i < PROFILE_RETRY; i++) {
    try { fs.rmSync(dir, { recursive: true, force: true }); return true; }
    catch (e) {
      if (i === PROFILE_RETRY - 1) break;
      /* 前两轮若目录仍被占，尝试强杀整棵进程树 */
      if (i === 1 && child && child.pid && process.platform === 'win32') {
        await new Promise(res => {
          const k = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
          k.on('close', res);
          k.on('error', res);
          setTimeout(res, 5000);
        });
      }
      await sleep(900);
    }
  }
  return false;
}

/* 通过 browser 级 CDP 端点请求优雅关闭，让 Edge 自己收尾释放 profile */
async function gracefulBrowserClose(port) {
  try {
    const ver = await httpJson(port, '/json/version');
    if (!ver || !ver.webSocketDebuggerUrl) return false;
    const b = await Cdp.connect(ver.webSocketDebuggerUrl);
    try { await b.send('Browser.close'); } catch (e) { /* 关闭过程中连接断开属正常 */ }
    b.close();
    return true;
  } catch (e) {
    return false;
  }
}

/* ------------------------------------------------------------
 * CDP 客户端（零依赖：Node ≥ 22 的 globalThis.WebSocket）
 * ------------------------------------------------------------ */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.events = [];
    ws.onmessage = e => {
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.id != null && this.pending.has(m.id)) {
        this.pending.get(m.id)(m);
        this.pending.delete(m.id);
      } else if (m.method) {
        this.events.push(m);
      }
    };
  }

  static async connect(wsUrl) {
    if (typeof globalThis.WebSocket !== 'function') {
      throw new Error('本机 Node 不支持 globalThis.WebSocket（需 Node ≥ 22），无法使用 CDP');
    }
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error('CDP WebSocket 连接失败'));
    });
    return new Cdp(ws);
  }

  send(method, params) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP 调用超时: ${method}`));
      }, 20000);
      this.pending.set(id, m => { clearTimeout(timer); resolve(m); });
      try {
        this.ws.send(JSON.stringify({ id, method, params: params || {} }));
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      }
    });
  }

  /* 求值并取回原始值；异常/协议错误不抛出，返回 undefined 由调用方判空 */
  async eval(expression) {
    try {
      const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.result && r.result.result) {
        if (r.result.result.subtype === 'error') return undefined;
        return r.result.result.value;
      }
      return undefined;
    } catch (e) {
      return undefined;
    }
  }

  /* 页面 JS 错误的三路合集：window.onerror 收集的 / CDP 异常事件 / console.error */
  jsErrors() {
    const out = [];
    for (const e of this.events) {
      if (e.method === 'Runtime.exceptionThrown') {
        const d = e.params.exceptionDetails || {};
        out.push('EXCEPTION ' + (d.text || '') + ' @' + ((d.url || '') + ':' + (d.lineNumber != null ? d.lineNumber + 1 : '?')).slice(-60));
      } else if (e.method === 'Log.entryAdded') {
        const en = e.params.entry || {};
        if (en.level === 'error') out.push('CONSOLE ' + String(en.text || '').slice(0, 200));
      }
    }
    return out;
  }

  close() { try { this.ws.close(); } catch (e) { /* 忽略 */ } }
}

/* ------------------------------------------------------------
 * 浏览器生命周期
 * ------------------------------------------------------------ */

function launchBrowser(browser, url) {
  /* 固定视口宽度：布局类断言（如「地图不被右列拉伸」）依赖真实排版，默认 800x600 会退化。
   * 取 1080 是因为这正是用户报告该 bug 时的窗口宽度；同时它使地图高度落在
   * aspect-ratio 区间内（不会被 min/max-height 钳制）。改这里需同步复核 test_flow.html 的布局断言。
   *
   * 不用 --virtual-time-budget：它与 CDP 的真实时间轮询语义冲突（旧实现靠它
   * 冻结时钟等页面跑完）。改用 PAGE_TIMEOUT_MS 真实轮询 #result。 */
  return new Promise((resolve, reject) => {
    freePort().then(port => {
      if (!port) { reject(new Error('无法分配 CDP 调试端口')); return; }
      const profile = path.join(os.tmpdir(), 'usn-e2e-' + process.pid + '-' + Date.now());
      const args = [
        '--headless=new', '--disable-gpu', '--no-sandbox',
        '--remote-debugging-port=' + port,
        '--user-data-dir=' + profile,
        '--window-size=1080,1400',
        url
      ];
      let child;
      try {
        child = spawn(browser, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) { reject(e); return; }
      child.on('error', e => reject(e));
      let stderr = '';
      child.stderr.on('data', d => { if (stderr.length < 2000) stderr += d; });
      resolve({ child, port, profile, stderrRef: () => stderr });
    });
  });
}

async function waitForPageTarget(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const list = await httpJson(port, '/json/list');
      const t = list.find(x => x.type === 'page' && x.webSocketDebuggerUrl);
      if (t) return t;
    } catch (e) { /* 浏览器尚未就绪 */ }
    await sleep(300);
  }
  return null;
}

/* ------------------------------------------------------------
 * 失败诊断：区分「页面没跑完」 vs 「跑了但断言失败」
 * ------------------------------------------------------------ */
async function reportDiagnostics(cdp, tag) {
  const q = expr => cdp.eval(expr);
  const href = await q('location.href');
  const title = await q('document.title');
  const ready = await q('document.readyState');
  const resultText = await q("(document.getElementById('result')||{}).textContent || ''");
  const nDone = await q('(window.__results||[]).length');
  const pageErrs = await q('JSON.stringify(window.__errors||[])');
  const bodyText = await q("(document.body?(document.body.innerText||'').replace(/\\s+/g,' ').slice(0,200):'')");

  console.error(`\n---- ${tag} 诊断 ----`);
  console.error('  location.href   : ' + (href || '(取不到)'));
  console.error('  document.title  : ' + (title === undefined ? '(取不到)' : JSON.stringify(title)));
  console.error('  readyState      : ' + (ready || '(取不到)'));

  /* 情形A：导航都没成功（地址仍是 chrome-error:// / about:blank）—— 页面压根没跑 */
  if (typeof href === 'string' && href !== 'about:blank' && href.indexOf('chrome-error://') === 0) {
    console.error('  ⚠ 判定：**页面从未加载成功**（浏览器错误页），不是断言问题。');
  } else if (typeof href === 'string' && href === 'about:blank') {
    console.error('  ⚠ 判定：**页面还停在 about:blank**，浏览器可能未接受导航。');
  }

  /* 情形B：跑了但没写结果 —— 用已完成的断言条数定位卡在哪一段 */
  if (typeof nDone === 'number') console.error('  已完成断言条数  : ' + nDone + '（>0 说明页面在跑，是没跑完不是没跑）');

  console.error('  #result 前 300 字:');
  console.error('    ' + JSON.stringify(String(resultText || '').slice(0, 300)));

  let parsedPageErrs = null;
  try { parsedPageErrs = JSON.parse(pageErrs || 'null'); } catch (e) { /* 忽略 */ }
  console.error('  页面 JS 错误    : ' + (Array.isArray(parsedPageErrs) && parsedPageErrs.length
    ? '\n    ' + parsedPageErrs.slice(0, 10).join('\n    ')
    : '(页面未捕获到 window.onerror)'));

  const cdpErrs = cdp.jsErrors();
  console.error('  CDP 侧错误/异常 : ' + (cdpErrs.length
    ? '\n    ' + cdpErrs.slice(0, 10).join('\n    ')
    : '(无)'));

  console.error('  页面正文摘要    : ' + JSON.stringify(String(bodyText || '').slice(0, 200)));
  console.error('--------------------');
}

/* ------------------------------------------------------------
 * 主流程
 * ------------------------------------------------------------ */
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

  const pageUrl = `${BASE}/test_flow.html`;
  let launched = null;
  let cdp = null;
  let result = null;
  let failureTag = null;
  const t0 = Date.now();

  try {
    launched = await launchBrowser(browser, pageUrl);
    const { child, port, profile } = launched;

    const target = await waitForPageTarget(port, CDP_READY_TIMEOUT_MS);
    if (!target) {
      failureTag = '浏览器未在超时内暴露可调试页面';
      throw new Error(failureTag);
    }

    cdp = await Cdp.connect(target.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.enable');

    /* 目标页可能还停在 about:blank：显式导航一次，保证跑的是 test_flow.html。
     * 用 Page.navigate 而非依赖命令行 URL，是为了让「导航失败」能被 Network 事件捕捉。 */
    const cur = await cdp.eval('location.href');
    if (cur !== pageUrl) {
      await cdp.send('Page.navigate', { url: pageUrl });
    }

    /* 轮询 #result 直到页面写入结果。RUNNING 表示仍在跑（页面把中间态写成了 RUNNING）。*/
    const deadline = Date.now() + PAGE_TIMEOUT_MS;
    let lastText = '';
    while (Date.now() < deadline) {
      lastText = (await cdp.eval("(document.getElementById('result')||{}).textContent || ''")) || '';
      if (lastText && lastText !== 'RUNNING') break;
      await sleep(400);
    }
    result = parseResultText(lastText);
    if (result && result.pending) {
      failureTag = `页面在 ${PAGE_TIMEOUT_MS}ms 内未写完结果（#result 仍为 ${JSON.stringify(lastText)}）`;
    }

    /* 顺带把渲染后的 DOM 存盘（沿用旧版的 .e2e-dump.html 调试产物） */
    try {
      const dom = await cdp.eval('document.documentElement.outerHTML');
      if (typeof dom === 'string' && dom) fs.writeFileSync(OUT, dom);
    } catch (e) { /* 忽略写入失败 */ }
  } catch (e) {
    failureTag = failureTag || ('浏览器执行失败: ' + e.message);
  } finally {
    if (cdp) {
      if (failureTag) { try { await reportDiagnostics(cdp, failureTag); } catch (e) { /* 忽略 */ } }
      cdp.close();
    }
    if (launched) {
      await gracefulBrowserClose(launched.port);
      stop(launched.child);
      await sleep(600);
      const ok = await cleanupProfile(launched.profile, launched.child);
      if (!ok) console.error(`  (临时 profile 未能删除: ${launched.profile})`);
    }
    if (!alreadyRunning) stop(server);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n== 浏览器端 E2E（${path.basename(browser)}）==`);

  if (!result) {
    console.error('  未能读取 #result');
    if (!failureTag) console.error('  原因未知（浏览器未产出任何结果，且无诊断信息）');
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

  console.log(`\n通过 ${results.length - failed.length} 项，失败 ${failed.length} 项，JS错误 ${errors.length} 项（耗时 ${elapsed}s）`);

  if (failed.length || errors.length) process.exit(1);
  process.exit(0);
})();