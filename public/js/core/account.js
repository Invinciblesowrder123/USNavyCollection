'use strict';
/* ============================================================
 * 账号会话管理（浏览器端）
 * 双模式：
 *   游客(guest)  -> 存档仅存 localStorage（原版行为）
 *   账号(account)-> 存档本地缓存 + 同步服务器（token 会话）
 * ============================================================ */

const Account = (() => {
  const TOKEN_KEY = 'usnc_token_v1';
  let session = { mode: 'guest', username: '', token: '' };
  const listeners = [];

  function api(method, url, body) {
    const opts = { method, headers: {} };
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

  function setSession(mode, username, token) {
    session = { mode, username: username || '', token: token || '' };
    try {
      if (session.mode === 'account' && session.token) localStorage.setItem(TOKEN_KEY, session.token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* ignore */ }
  }

  function notify() { listeners.forEach(fn => { try { fn(); } catch (e) { /* ignore */ } }); }

  /* 启动恢复：有本地 token 则验证会话并取档
   * resolve: { ok:true, save } | { ok:false, reason:'notoken'|'expired' } */
  function restore() {
    let token = '';
    try { token = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { /* ignore */ }
    if (!token) return Promise.resolve({ ok: false, reason: 'notoken' });
    session.mode = 'account';
    session.token = token;
    session.username = '';
    return api('GET', '/api/save').then(d => {
      session.username = d.username || '';
      notify();
      return { ok: true, save: d.save || null };
    }).catch(() => {
      setSession('guest', '', '');
      notify();
      return { ok: false, reason: 'expired' };
    });
  }

  function register(username, password) {
    return api('POST', '/api/auth/register', { username, password }).then(d => {
      setSession('account', d.username, d.token);
      notify();
      return { ok: true, save: d.save || null };
    });
  }

  function login(username, password) {
    return api('POST', '/api/auth/login', { username, password }).then(d => {
      setSession('account', d.username, d.token);
      notify();
      return { ok: true, save: d.save || null };
    });
  }

  function logout() {
    const token = session.token;
    setSession('guest', '', '');
    notify();
    if (token) api('POST', '/api/auth/logout').catch(() => { /* ignore */ });
  }

  function isAccount() { return session.mode === 'account'; }
  function username() { return session.username; }
  function token() { return session.token; }

  /* 上传存档（账号模式；服务器不可达时静默失败，本地缓存兜底） */
  function saveGame(saveData) {
    if (!isAccount()) return Promise.resolve(false);
    return api('PUT', '/api/save', { save: saveData }).then(d => d.ok).catch(() => false);
  }

  function onChange(fn) { listeners.push(fn); }

  return { restore, register, login, logout, saveGame, isAccount, username, token, onChange };
})();

if (typeof window !== 'undefined') window.Account = Account;
if (typeof module !== 'undefined' && module.exports) module.exports = { Account };
