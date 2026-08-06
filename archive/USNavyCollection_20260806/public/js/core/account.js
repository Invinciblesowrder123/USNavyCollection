'use strict';
/* ============================================================
 * 账号会话管理（浏览器端）
 * 必须登录后才能进入游戏。
 * 会话机制：
 *   登录/注册后服务器下发 HttpOnly Cookie（usnc_session），
 *   同源 fetch 自动携带，关闭浏览器后 7 天内免登录直接进游戏；
 *   同时保留 localStorage token 作为兼容备份。
 * ============================================================ */

const Account = (() => {
  const TOKEN_KEY = 'usnc_token_v1';
  let session = { mode: 'guest', username: '', role: '', token: '' };
  const listeners = [];

  function api(method, url, body) {
    const opts = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    if (session.token) opts.headers['Authorization'] = 'Bearer ' + session.token;
    return fetch(url, opts).then(async r => {
      let data = null;
      try { data = await r.json(); } catch (e) { /* 非 JSON 响应 */ }
      if (!r.ok) throw new Error((data && data.error) || ('请求失败 (HTTP ' + r.status + ')'));
      return data;
    });
  }

  function setSession(mode, username, role, token) {
    session = { mode, username: username || '', role: role || '', token: token || '' };
    try {
      if (session.mode === 'account' && session.token) localStorage.setItem(TOKEN_KEY, session.token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* ignore */ }
  }

  function notify() { listeners.forEach(fn => { try { fn(); } catch (e) { /* ignore */ } }); }

  /* 启动恢复，按优先级：
   *   1. localStorage token（Authorization 校验）
   *   2. HttpOnly Cookie（免登录直进）
   * resolve: { ok:true, save } | { ok:false, reason:'notoken'|'expired' } */
  function restore() {
    let token = '';
    try { token = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { /* ignore */ }
    const probe = (t) => {
      session.mode = 'account';
      session.token = t;
      session.username = '';
      return api('GET', '/api/save').then(d => {
        session.username = d.username || '';
        session.role = d.role || '';
        notify();
        return { ok: true, save: d.save || null };
      }).catch(() => ({ ok: false, reason: 'expired' }));
    };
    if (token) {
      return probe(token).then(r => {
        if (r.ok) return r;
        /* localStorage token 失效：回退尝试 Cookie */
        return probe('');
      });
    }
    return probe('');   // 无 localStorage token → 尝试 Cookie
  }

  function register(username, password) {
    return api('POST', '/api/auth/register', { username, password }).then(d => {
      setSession('account', d.username, d.role, d.token);
      notify();
      return { ok: true, save: d.save || null };
    });
  }

  function login(username, password) {
    return api('POST', '/api/auth/login', { username, password }).then(d => {
      setSession('account', d.username, d.role, d.token);
      notify();
      return { ok: true, save: d.save || null };
    });
  }

  function logout() {
    const token = session.token;
    setSession('guest', '', '', '');
    notify();
    /* 无论是否有 localStorage token 都通知服务器（cookie 亦作废） */
    api('POST', '/api/auth/logout').catch(() => { /* ignore */ });
  }

  function isAccount() { return session.mode === 'account'; }
  function isAdmin() { return session.role === 'admin'; }
  function username() { return session.username; }
  function role() { return session.role; }
  function token() { return session.token; }

  /* 上传存档（账号模式；服务器不可达时静默失败，本地缓存兜底） */
  function saveGame(saveData) {
    if (!isAccount()) return Promise.resolve(false);
    return api('PUT', '/api/save', { save: saveData }).then(d => d.ok).catch(() => false);
  }

  function onChange(fn) { listeners.push(fn); }

  return { restore, register, login, logout, saveGame, isAccount, isAdmin, username, role, token, onChange };
})();

if (typeof window !== 'undefined') window.Account = Account;
if (typeof module !== 'undefined' && module.exports) module.exports = { Account };
