'use strict';
/* ============================================================
 * 浏览器实测截图工具（Gate 4）—— CDP over WebSocket
 * 用法: node scripts/shot.js <页面路径> <输出png> [宽x高]
 *   例: node scripts/shot.js _shot_air.html?case=noCV ../backup/x/air_noCV.png 1440x1200
 * 会按需启动本地服务器（复用 e2e.js 的端口探测逻辑），截完自动关掉。
 *
 * ── 为什么从 `--screenshot` 命令行通道迁到 CDP ──────────────
 * 2026-10-09 实测（Edg/154.0.4258.62）：`--screenshot=<out>` **并没有完全失效**，
 * 它仍能正确写出 PNG（data: URL 与真实页面均可）。真正的故障是**竞态**：
 * 浏览器主进程 exit(0) 发生在渲染进程把 PNG 落盘之**前**，实测差 ~0.3~0.5s。
 * 旧实现 `await` 到 exit 就立刻 `fs.existsSync(out)` 判定，于是稳定误报「未生成」。
 * （对照：`--dump-dom` 是真的彻底失效，stdout 恒 0 字节 —— 那是 e2e.js 的问题。）
 * 但命令行通道有两个**无法绕开**的硬伤：
 *   1. 视口只有 `--window-size`，无头下不可靠 —— 排版类证据（徽标并排、
 *      地图不拉伸）在错误的 viewport 下没有价值；
 *   2. 无法在截图前注入存档 / 执行脚本，无法等待异步渲染完成，
 *      也拿不到 readyState、异常等诊断信息。
 * CDP 三者都解决：`Emulation.setDeviceMetricsOverride` 精确控视口，
 * `Page.addScriptToEvaluateOnNewDocument` 预置 localStorage，
 * `Runtime.evaluate` 驱动界面，`Page.captureScreenshot` 出图。
 *
 * 零 npm 依赖：Node ≥ 22 自带 globalThis.WebSocket。
 * 连接/清理逻辑复用 scripts/e2e.js 的 CDP 段（同源实现）。
 * ============================================================ */
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = Number(process.env.SHOT_PORT || 3011);
const HOST = '127.0.0.1';
const CDP_READY_TIMEOUT_MS = 30000;
/* 视口生效后仍需等待的沉降时间：字体加载、flex/grid 布局、动画首帧。
 * 取 1200ms —— 界面渲染完成即可截图，再久只是浪费。 */
const SETTLE_MS = Number(process.env.SHOT_SETTLE_MS || 1200);
const PROFILE_RETRY = 10;

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

const WIDTH = Number(size[0]) || 1440;
const HEIGHT = Number(size[1]) || 1200;

/* 截图前注入 localStorage 的键值对（截图批次用它预置存档/令牌）。
 * 用法：SHOT_SEED='{"usnc_token_v1":"..."}' node scripts/shot.js ... */
let SEED = {};
if (process.env.SHOT_SEED) {
  try { SEED = JSON.parse(process.env.SHOT_SEED); }
  catch (e) { console.error('SHOT_SEED 不是合法 JSON: ' + e.message); process.exit(1); }
}
/* 截图前在页面里跑的脚本（用来把界面推到目标状态，如 UI.go('sortie')）。*/
const EVAL = process.env.SHOT_EVAL || '';

function portOpen() {
  return new Promise(res => {
    const req = http.get({ host: HOST, port: PORT, path: '/', timeout: 800 }, r => { r.resume(); res(true); });
    req.on('error', () => res(false));
    req.on('timeout', () => { req.destroy(); res(false); });
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function stop(child) {
  if (!child || child.killed) return;
  try { child.kill(); } catch (e) { /* 忽略 */ }
}

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
      }, 30000);
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

  /* 页面 JS 错误的两路合集：CDP 异常事件 / console.error */
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

/* 等文档就绪；返回主文档的 HTTP 状态（404/500 页面必须识别出来——
 * 否则会截到一张"看起来成功"的错误页，污染证据）。
 * 状态从 Network.responseReceived 事件里取（拿 response.url 对齐主文档 URL），
 * 比 getNavigationHistory 可靠：后者在导航切换瞬间可能返回上一条历史。*/
async function waitForLoad(cdp, url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let status = null;
  while (Date.now() < deadline) {
    if (status === null) {
      for (const e of cdp.events) {
        if (e.method === 'Network.responseReceived' && e.params && e.params.response
            && e.params.response.url === url) {
          status = e.params.response.status;
        }
      }
    }
    const rs = await cdp.eval('document.readyState');
    if (rs === 'complete' || rs === 'interactive') return { status };
    await sleep(200);
  }
  return { status };
}

/* ------------------------------------------------------------
 * 浏览器生命周期
 * ------------------------------------------------------------ */
function launchBrowser(browser, url, w, h) {
  return new Promise((resolve, reject) => {
    freePort().then(port => {
      if (!port) { reject(new Error('无法分配 CDP 调试端口')); return; }
      const profile = path.join(os.tmpdir(), 'usn-shot-' + process.pid + '-' + Date.now());
      /* --window-size 仍保留：它决定首屏布局的初值；最终视口由
       * Emulation.setDeviceMetricsOverride 强制覆盖（无头下前者不可靠）。*/
      const args = [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
        '--remote-debugging-port=' + port,
        '--user-data-dir=' + profile,
        '--window-size=' + w + ',' + h,
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

/* Windows 上 Edge 会派生子进程，父进程退出后 profile 目录仍被锁（EBUSY）。
 * 先走 CDP 的优雅关闭拿 browser 级 socket，拿不到再退回 taskkill /T，
 * 最后对删除动作本身重试。 */
async function cleanupProfile(dir, child) {
  for (let i = 0; i < PROFILE_RETRY; i++) {
    try { fs.rmSync(dir, { recursive: true, force: true }); return true; }
    catch (e) {
      if (i === PROFILE_RETRY - 1) break;
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

/* ------------------------------------------------------------
 * 失败诊断：把「没截到」的原因说清楚，而不是只丢一句「未生成」
 * ------------------------------------------------------------ */
async function reportDiagnostics(cdp, tag) {
  const q = expr => cdp.eval(expr);
  const href = await q('location.href');
  const title = await q('document.title');
  const ready = await q('document.readyState');
  const innerW = await q('window.innerWidth');
  const innerH = await q('window.innerHeight');
  const bodyLen = await q('document.body ? document.body.innerHTML.length : -1');
  const bodyText = await q("(document.body?(document.body.innerText||'').replace(/\\s+/g,' ').slice(0,200):'')");

  console.error(`\n---- 截图诊断 ----`);
  console.error('  失败原因        : ' + tag);
  console.error('  location.href   : ' + (href || '(取不到)'));
  console.error('  document.title  : ' + (title === undefined ? '(取不到)' : JSON.stringify(title)));
  console.error('  readyState      : ' + (ready || '(取不到)'));
  console.error('  实际视口        : ' + innerW + ' x ' + innerH + '（请求 ' + WIDTH + ' x ' + HEIGHT + '）');
  console.error('  body.innerHTML  : ' + bodyLen + ' 字节'
    + (typeof bodyLen === 'number' && bodyLen < 200 ? '  ← 页面几乎是空的，界面没渲染出来' : ''));

  if (typeof href === 'string' && href.indexOf('chrome-error://') === 0) {
    console.error('  ⚠ 判定：**页面从未加载成功**（浏览器错误页），不是渲染慢。');
  } else if (href === 'about:blank') {
    console.error('  ⚠ 判定：**页面还停在 about:blank**，浏览器未接受导航。');
  } else if (ready === 'loading') {
    console.error('  ⚠ 判定：文档仍在 loading，资源可能未加载完。');
  } else if (typeof bodyLen === 'number' && bodyLen < 200) {
    console.error('  ⚠ 判定：文档已就绪但正文几乎为空 —— 页面没渲染出界面'
      + '（常见原因：HTTP 错误页、脚本抛错导致 UI 未挂载）。');
  }

  const cdpErrs = cdp.jsErrors();
  console.error('  CDP 侧错误/异常 : ' + (cdpErrs.length
    ? '\n    ' + cdpErrs.slice(0, 10).join('\n    ')
    : '(无)'));
  console.error('  页面正文摘要    : ' + JSON.stringify(String(bodyText || '').slice(0, 200)));
  console.error('------------------');
}

/* ------------------------------------------------------------
 * 主流程
 * ------------------------------------------------------------ */
(async () => {
  let server = null;
  const alreadyRunning = await portOpen();
  if (!alreadyRunning) {
    server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore'
    });
    for (let i = 0; i < 25 && !(await portOpen()); i++) await sleep(300);
    if (!(await portOpen())) {
      console.error('服务器启动超时（端口 ' + PORT + '）');
      stop(server);
      process.exit(1);
    }
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const url = `http://${HOST}:${PORT}/${page}`;

  let launched = null;
  let cdp = null;
  let failureTag = null;
  let pageProblem = null;
  let shotB64 = null;
  const t0 = Date.now();

  try {
    launched = await launchBrowser(browser, 'about:blank', WIDTH, HEIGHT);
    const target = await waitForPageTarget(launched.port, CDP_READY_TIMEOUT_MS);
    if (!target) { failureTag = '浏览器未在超时内暴露可调试页面'; throw new Error(failureTag); }

    cdp = await Cdp.connect(target.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');

    /* 视口必须**真的**生效：--window-size 在无头下不可靠，
     * 而本项目的布局类断言（徽标并排、地图不被拉伸）依赖真实排版。
     * deviceScaleFactor=1 与 CSS 像素 1:1，截图尺寸即请求尺寸。*/
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false
    });

    /* 在页面任何脚本执行前预置 localStorage（存档注入走这条通道）*/
    if (SEED && Object.keys(SEED).length) {
      const seedJs = 'try{' + Object.keys(SEED).map(k =>
        'localStorage.setItem(' + JSON.stringify(k) + ',' + JSON.stringify(String(SEED[k])) + ');'
      ).join('') + '}catch(e){}';
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: seedJs });
    }

    await cdp.send('Page.navigate', { url });
    const nav = await waitForLoad(cdp, url, 20000);
    if (nav && nav.status && nav.status >= 400) {
      console.error(`  ⚠ HTTP ${nav.status} —— 服务器返回了错误页，截图内容不是目标页面。`);
      pageProblem = `HTTP ${nav.status}`;
    }

    /* 等文档就绪；再等一帧让首屏布局与字体落定*/
    const readyDeadline = Date.now() + 20000;
    while (Date.now() < readyDeadline) {
      const rs = await cdp.eval('document.readyState');
      if (rs === 'complete' || rs === 'interactive') break;
      await sleep(200);
    }

    if (EVAL) {
      const r = await cdp.eval(EVAL);
      if (r !== undefined) console.log('  [SHOT_EVAL] ' + JSON.stringify(r, null, 1));
    }

    await sleep(SETTLE_MS);

    /* 视口二次确认：视口没生效就不能算有效证据 */
    const [iw, ih] = [await cdp.eval('window.innerWidth'), await cdp.eval('window.innerHeight')];
    if (iw !== WIDTH || ih !== HEIGHT) {
      console.error(`  ⚠ 视口未按请求生效：实际 ${iw}x${ih} ≠ 请求 ${WIDTH}x${HEIGHT}`);
    }

    const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    if (!r.result || !r.result.data) { failureTag = 'Page.captureScreenshot 未返回图像数据'; throw new Error(failureTag); }
    shotB64 = r.result.data;
  } catch (e) {
    failureTag = failureTag || ('浏览器执行失败: ' + e.message);
  } finally {
    /* 页面本身是坏的（404/500/浏览器错误页）时，出图也没有证据价值 —— 记为失败，
     * 让调用方看到非 0 退出码，而不是拿到一张"看起来成功"的错误页截图。*/
    if (pageProblem && shotB64 && !failureTag) failureTag = pageProblem;
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

if (shotB64 && !failureTag) {
    fs.writeFileSync(out, Buffer.from(shotB64, 'base64'));
    const kb = Math.round(fs.statSync(out).size / 1024);
    const dims = (() => {
      /* PNG IHDR：宽高各 4 字节大端，偏移 16/20 —— 用来证明视口真的生效了 */
      try {
        const b = fs.readFileSync(out);
        return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20);
      } catch (e) { return '(读不出)'; }
    })();
    console.log(`✓ ${out} (${kb} KB, 实际 ${dims}, 视口 ${WIDTH}x${HEIGHT}, 耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    process.exit(0);
  }
if (shotB64) {
  /* 出图了但页面是坏的：删掉产物，避免被误当成有效证据引用 */
  try { fs.unlinkSync(out); } catch (e) { /* 忽略 */ }
  console.log(`✗ ${out} 未生成（页面返回错误：${failureTag}）`);
  process.exit(1);
}
console.log(`✗ ${out} 未生成`);
process.exit(1);
})().catch(e => {
  console.error('截图失败: ' + e.message);
  if (!/未找到|用法/.test(e.message)) {
    console.error('  提示：可用 SHOT_EVAL 在截图前驱动界面，SHOT_SEED 预置 localStorage。');
  }
  process.exit(1);
});
