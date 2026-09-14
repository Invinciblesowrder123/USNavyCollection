'use strict';
/* ============================================================
 * 账号可用性冒烟：证明"某个账号真能进游戏"，而不只是"能换到 token"
 *
 * 走的是产品自己的路径，不是造一个假页面：
 *   run1  /_smoke_login.html?u=..&p=..  ← 真前端同源 fetch 登录，浏览器自己收下 HttpOnly Cookie
 *   run2  /index.html                   ← 同一 --user-data-dir → main.js::Account.restore()
 *                                          命中 Cookie → enterGame → 渲染母港
 * 负向对照（独立 profile）：错密码 → 必须停在登录页（body.unauth、无母港、顶栏无账号）
 *
 * 用法:
 *   npm run smoke:account                          # 默认 test001 / test001
 *   npm run smoke:account -- --user=foo --pass=bar
 *   node scripts/smoke_account.js --keep           # 保留 DOM 转储以便人工核对
 *
 * ⚠️ 临时登录页 public/_smoke_login.html 由本脚本运行时生成、结束时删除 ——
 *    带默认凭据的登录代理页不能常驻在会被静态托管的目录里。
 * ============================================================ */

const { spawn, spawnSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const HARNESS = path.join(PUB, '_smoke_login.html');
const OUTDIR = path.join(ROOT, '..', '_smoke_out');

function arg(name, def) {
  const hit = process.argv.slice(2).find(a => a.startsWith('--' + name + '='));
  return hit ? hit.split('=').slice(1).join('=') : def;
}
const USER = arg('user', 'test001');
const PASS = arg('pass', 'test001');
const PORT = Number(arg('port', process.env.SMOKE_PORT || 3023));
const KEEP = process.argv.includes('--keep');
const HOST = '127.0.0.1';
const BASE = `http://${HOST}:${PORT}`;

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];

/* 浏览器端临时登录页（同源，才能让浏览器把 HttpOnly Cookie 收进 profile） */
const HARNESS_HTML = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>smoke</title></head>
<body><div id="out">PENDING</div>
<script>
(async function () {
  var q = new URLSearchParams(location.search);
  var out = document.getElementById('out');
  try {
    var r = await fetch('/api/auth/login', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: q.get('u'), password: q.get('p') })
    });
    var d = null; try { d = await r.json(); } catch (e) {}
    var ok = r.ok && d && d.ok;
    document.title = ok ? 'LOGIN_OK' : 'LOGIN_FAIL';
    out.textContent = 'SMOKE ' + document.title + ' http=' + r.status +
      ' role=' + (d && d.role) + ' save=' + (d && d.save ? 'present' : 'null') +
      ' cookie=' + (document.cookie ? 'js-visible' : 'httponly-only');
  } catch (e) {
    document.title = 'LOGIN_ERR';
    out.textContent = 'SMOKE LOGIN_ERR ' + e.message;
  }
})();
</script></body></html>`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const bodyTag = html => (html.match(/<body[^>]*>/i) || [''])[0];
const isUnauth = html => /unauth/.test(bodyTag(html));
const hasHome = html => /home-screen/.test(html);

function waitReady(ms) {
  return (async () => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const ok = await new Promise(res => {
        const req = http.get({ host: HOST, port: PORT, path: '/api/health', timeout: 800 },
          r => { r.resume(); res(true); });
        req.on('error', () => res(false));
        req.on('timeout', () => { req.destroy(); res(false); });
      });
      if (ok) return true;
      await sleep(300);
    }
    return false;
  })();
}

function dumpDom(browser, url, profileDir) {
  const r = spawnSync(browser, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--no-first-run', '--no-default-browser-check',
    '--window-size=1080,1400',
    '--user-data-dir=' + profileDir,
    '--virtual-time-budget=25000', '--dump-dom', url
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
  return r.stdout || '';
}

(async () => {
  let srv = null;
  const R = [];
  let code = 1;
  const profs = [];
  try {
    const browser = BROWSERS.find(p => fs.existsSync(p));
    if (!browser) { console.log('RESULT=FAIL\n找不到可用的 Edge / Chrome'); process.exit(2); }

    fs.rmSync(OUTDIR, { recursive: true, force: true });
    fs.mkdirSync(OUTDIR, { recursive: true });
    const profOk = path.join(OUTDIR, 'profile_ok');
    const profBad = path.join(OUTDIR, 'profile_bad');
    profs.push(profOk, profBad);

    fs.writeFileSync(HARNESS, HARNESS_HTML, 'utf8');
    srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
      cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore'
    });
    const ready = await waitReady(20000);
    R.push(`server(${PORT}) ready = ${ready}`);

    /* ---------- 正例 ---------- */
    const a1 = dumpDom(browser, `${BASE}/_smoke_login.html?u=${encodeURIComponent(USER)}&p=${encodeURIComponent(PASS)}`, profOk);
    fs.writeFileSync(path.join(OUTDIR, 'a1_login.html'), a1, 'utf8');
    const a1ok = /SMOKE LOGIN_OK/.test(a1);
    R.push(`A1 登录          : ${(a1.match(/SMOKE [^<]*/) || ['(无标记)'])[0]}`);

    const a2 = dumpDom(browser, `${BASE}/index.html`, profOk);
    fs.writeFileSync(path.join(OUTDIR, 'a2_index.html'), a2, 'utf8');
    const a2NoUnauth = !isUnauth(a2);
    const a2Account = new RegExp(`@${USER}\\b`).test(a2);
    const a2Home = hasHome(a2);
    R.push(`A2 进游戏        : 脱离登录页=${a2NoUnauth} 顶栏@${USER}=${a2Account} 母港已渲染=${a2Home}`);

    /* ---------- 负向对照：错密码，独立 profile ---------- */
    const b1 = dumpDom(browser, `${BASE}/_smoke_login.html?u=${encodeURIComponent(USER)}&p=__WRONG__`, profBad);
    fs.writeFileSync(path.join(OUTDIR, 'b1_login.html'), b1, 'utf8');
    const b1ok = /SMOKE LOGIN_FAIL/.test(b1);
    R.push(`B1 错密码        : ${(b1.match(/SMOKE [^<]*/) || ['(无标记)'])[0]}`);

    const b2 = dumpDom(browser, `${BASE}/index.html`, profBad);
    fs.writeFileSync(path.join(OUTDIR, 'b2_index.html'), b2, 'utf8');
    const b2Unauth = isUnauth(b2);
    const b2NoHome = !hasHome(b2);
    const b2NoAccount = !new RegExp(`@${USER}\\b`).test(b2);
    R.push(`B2 负例未放行    : 停在登录页=${b2Unauth} 无母港=${b2NoHome} 顶栏无账号=${b2NoAccount}`);

    /* ---------- 软观测：云存档 ---------- */
    const saveFile = path.join(ROOT, 'data', 'saves', encodeURIComponent(USER) + '.json');
    let saveInfo = '未生成（浏览器退出太快，自动存档未及上传；不影响账号可用性）';
    if (fs.existsSync(saveFile)) {
      try {
        const s = JSON.parse(fs.readFileSync(saveFile, 'utf8'));
        const fleet = (s.fleet && s.fleet[1]) || [];
        saveInfo = `${fs.statSync(saveFile).size}B · 一号舰队 ${fleet.length} 艘 · version=${s.version}`;
      } catch (e) { saveInfo = '存在但解析失败: ' + e.message; }
    }
    R.push(`云存档 ${USER}${' '.repeat(Math.max(0, 8 - USER.length))}: ${saveInfo}`);

    const pass = ready && a1ok && a2NoUnauth && a2Account && a2Home && b1ok && b2Unauth && b2NoHome && b2NoAccount;
    R.push(pass ? 'RESULT=PASS' : 'RESULT=FAIL');
    if (!KEEP) R.push('（DOM 转储保留在 _smoke_out/，加 --keep 可保留 profile 目录）');
    code = pass ? 0 : 1;
  } catch (e) {
    R.push('EXCEPTION: ' + (e && e.stack || e));
  } finally {
    if (srv) srv.kill();
    try { fs.rmSync(HARNESS, { force: true }); } catch (e) { /* ignore */ }
    if (!KEEP) profs.forEach(d => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* ignore */ } });
    console.log(R.join('\n'));
  }
  process.exit(code);
})();
