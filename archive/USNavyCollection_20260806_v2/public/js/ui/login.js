'use strict';
/* ============================================================
 * 登录 / 注册界面（必须登录后才能进入游戏）
 * 会话由 HttpOnly Cookie 维持，免登录直进；
 * 「记住账号和密码」仅用于回填表单。
 * ============================================================ */

const LoginUI = (() => {
  const REMEMBER_KEY = 'usnc_remember_v1';
  let mode = 'login';
  const $ = s => document.querySelector(s);

  function rememberGet() {
    try { return JSON.parse(localStorage.getItem(REMEMBER_KEY)) || null; }
    catch (e) { return null; }
  }
  function rememberSet(v) {
    try {
      if (v) localStorage.setItem(REMEMBER_KEY, JSON.stringify(v));
      else localStorage.removeItem(REMEMBER_KEY);
    } catch (e) { /* ignore */ }
  }

  function screen(root) {
    const rmb = rememberGet();
    root.innerHTML = `
      <div class="login-wrap">
        <div class="login-box panel">
          <h2>★ 美舰收藏</h2>
          <p class="dim">登录后进入游戏（注册即创建新账号）<br>登录状态由浏览器 Cookie 维持，7 天内免登录直进</p>
          <div class="login-tabs">
            <button data-mode="login" class="active">登 录</button>
            <button data-mode="register">注 册</button>
          </div>
          <input id="lgName" placeholder="用户名（2~20位：中英文/数字/_/-）" maxlength="20" autocomplete="username" value="${Util.esc(rmb ? rmb.username : '')}">
          <input id="lgPw" type="password" placeholder="密码（6~64位）" maxlength="64" autocomplete="current-password" value="${Util.esc(rmb ? rmb.password : '')}">
          <label class="login-remember"><input type="checkbox" id="lgRemember" ${rmb ? 'checked' : ''}> 记住账号和密码</label>
          <div id="lgErr" class="login-err"></div>
          <div class="btn-row">
            <button id="lgSubmit" class="btn btn-gold">登 录</button>
          </div>
        </div>
      </div>`;

    root.querySelectorAll('.login-tabs button').forEach(b =>
      b.addEventListener('click', () => setMode(b.dataset.mode)));
    const doSubmit = e => { e.preventDefault(); submit(); };
    $('#lgSubmit').addEventListener('click', doSubmit);
    root.addEventListener('keydown', e => { if (e.key === 'Enter') doSubmit(e); });
    $('#lgName').focus();
  }

  function setMode(m) {
    mode = m;
    document.querySelectorAll('.login-tabs button').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === m));
    const sb = $('#lgSubmit');
    sb.textContent = m === 'register' ? '注 册' : '登 录';
    $('#lgErr').textContent = '';
  }

  function showErr(msg) {
    const el = $('#lgErr');
    if (el) el.textContent = msg || '操作失败';
  }

  function submit() {
    const name = $('#lgName').value.trim();
    const pw = $('#lgPw').value;
    const remember = $('#lgRemember').checked;
    if (!name || !pw) { showErr('请输入用户名和密码'); return; }
    const btn = $('#lgSubmit');
    btn.disabled = true;
    const p = mode === 'register' ? Account.register(name, pw) : Account.login(name, pw);
    p.then(r => {
      if (!r.ok) { showErr(); return; }
      rememberSet(remember ? { username: name, password: pw } : null);
      window.__onAccountEnter && window.__onAccountEnter(r.save);
    }).catch(err => showErr(err.message))
      .finally(() => { btn.disabled = false; });
  }

  return { screen };
})();

window.LoginUI = LoginUI;
if (typeof module !== 'undefined' && module.exports) module.exports = { LoginUI };
UI.Screens.login = LoginUI.screen;
