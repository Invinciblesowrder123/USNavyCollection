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
          <input id="lgName" placeholder="用户名" title="2~20位，支持中文、英文、数字、下划线和连字符" aria-describedby="lgNameHint" maxlength="20" autocomplete="username" value="${Util.esc(rmb ? rmb.username : '')}">
          <div id="lgNameHint" class="login-field-hint">2~20位：中文、英文、数字、_、-</div>
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
    /* FIX-LOGIN-ENTER-01：Enter 提交**只**绑在登录页自己的容器 .login-wrap 上，
     * 绝不绑 #screen。#screen 是长期存在的根节点，UI.go 切页只做 root.innerHTML=''
     * （不重建节点、不解绑监听），所以绑在它身上的 keydown 会活过登录页：
     *   之后在**任意**页面按 Enter 都会进 doSubmit，而此时 #lgName 已被 innerHTML 清空
     *   ⇒ submit() 读 null.value 抛 TypeError；同时 preventDefault() 顺手取消了
     *   目标按钮的默认 click，纯键盘（focus + Enter/Space）路径失效。
     * 绑到 .login-wrap 则随登录页 DOM 一起被丢弃，天然不跨页泄漏（无需解绑、无累积）。
     * 登录页内的行为与原先完全一致：.login-wrap 是登录页 markup 的根，
     * 页内任意位置（含两个页签按钮、提交按钮、两个输入框）按 Enter 都冒泡到它。*/
    const wrap = root.querySelector('.login-wrap');
    if (wrap) wrap.addEventListener('keydown', e => { if (e.key === 'Enter') doSubmit(e); });
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
