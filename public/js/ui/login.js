'use strict';
/* ============================================================
 * 登录 / 注册 / 游客模式界面
 * 未登录时作为启动屏；顶栏「登录账号」按钮亦可进入
 * ============================================================ */

const LoginUI = (() => {
  let mode = 'login';
  const $ = s => document.querySelector(s);

  function screen(root) {
    root.innerHTML = `
      <div class="login-wrap">
        <div class="login-box panel">
          <h2>★ 美舰收藏</h2>
          <p class="dim">登录账号启用云存档（数据存服务器）<br>游客模式数据仅保存在本机浏览器</p>
          <div class="login-tabs">
            <button data-mode="login" class="active">登 录</button>
            <button data-mode="register">注 册</button>
          </div>
          <input id="lgName" placeholder="用户名（2~20位：中英文/数字/_/-）" maxlength="20" autocomplete="username">
          <input id="lgPw" type="password" placeholder="密码（6~64位）" maxlength="64" autocomplete="current-password">
          <div id="lgErr" class="login-err"></div>
          <div class="btn-row">
            <button id="lgSubmit" class="btn btn-gold">登 录</button>
            <button id="lgGuest" class="btn">游客模式</button>
          </div>
        </div>
      </div>`;

    root.querySelectorAll('.login-tabs button').forEach(b =>
      b.addEventListener('click', () => setMode(b.dataset.mode)));
    const doSubmit = e => { e.preventDefault(); submit(); };
    $('#lgSubmit').addEventListener('click', doSubmit);
    $('#lgGuest').addEventListener('click', guest);
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
    if (!name || !pw) { showErr('请输入用户名和密码'); return; }
    const btn = $('#lgSubmit');
    btn.disabled = true;
    const p = mode === 'register' ? Account.register(name, pw) : Account.login(name, pw);
    p.then(r => {
      if (r.ok) { window.__onAccountEnter && window.__onAccountEnter(r.save); }
      else showErr();
    }).catch(err => showErr(err.message))
      .finally(() => { btn.disabled = false; });
  }

  function guest() {
    Account.logout();
    window.__onGuestEnter && window.__onGuestEnter();
  }

  return { screen };
})();

window.LoginUI = LoginUI;
if (typeof module !== 'undefined' && module.exports) module.exports = { LoginUI };
UI.Screens.login = LoginUI.screen;
