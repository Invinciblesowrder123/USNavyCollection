'use strict';
/* ============================================================
 * 账号系统：注册 / 登录 / 会话 / 存档 API
 * 存储：data/users.json（账号元数据，含 role）+ data/saves/<username>.json（存档）
 * 密码：crypto.scrypt 加盐哈希（Node 内置，零新依赖）
 * 会话：内存 token（Bearer / HttpOnly Cookie），7 天有效期
 * 角色：admin（系统保留，无限资源等权限）/ user（普通注册）
 * ============================================================ */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');

const DATA_DIR = process.env.AUTH_DATA_DIR || path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SAVES_DIR = path.join(DATA_DIR, 'saves');
const SESSION_TTL = 1000 * 60 * 60 * 24 * 7;
const COOKIE_NAME = 'usnc_session';
const RESERVED_NAMES = ['admin'];

/* ---- 存储 ---- */
function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(SAVES_DIR, { recursive: true });
}
function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch (e) { return {}; }
}
function writeUsers(users) {
  ensureDirs();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}
function saveFile(username) { return path.join(SAVES_DIR, encodeURIComponent(username) + '.json'); }
function loadSave(username) {
  try { return JSON.parse(fs.readFileSync(saveFile(username), 'utf8')); }
  catch (e) { return null; }
}
function putSave(username, data) {
  ensureDirs();
  fs.writeFileSync(saveFile(username), JSON.stringify(data));
}

/* ---- 密码 ---- */
function hashPassword(pw, salt) {
  return crypto.scryptSync(String(pw), salt, 64).toString('hex');
}
function verifyPassword(pw, salt, hash) {
  const h = Buffer.from(hash, 'hex');
  const g = Buffer.from(hashPassword(pw, salt), 'hex');
  return h.length === g.length && crypto.timingSafeEqual(h, g);
}

/* ---- 会话（内存） ---- */
const sessions = new Map();
function issueToken(username) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { username, exp: Date.now() + SESSION_TTL });
  return token;
}
function authenticate(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s || s.exp < Date.now()) {
    if (s) sessions.delete(token);
    return null;
  }
  return s.username;
}
function revoke(token) {
  sessions.delete(token);
}
function clearSessions() { sessions.clear(); }

/* ---- Cookie 解析 / 写入 ---- */
function cookieToken(cookieHeader) {
  if (!cookieHeader) return '';
  const m = String(cookieHeader).match(new RegExp('(?:^|;\\s*)' + COOKIE_NAME + '=([^;]+)'));
  if (!m) return '';
  try { return decodeURIComponent(m[1]); } catch (e) { return ''; }
}
/* 从请求中提取 token：Authorization: Bearer 优先，其次 HttpOnly Cookie */
function tokenFromReq(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return cookieToken(req.headers.cookie);
}
function setCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.floor(SESSION_TTL / 1000)}; HttpOnly; SameSite=Lax`);
}
function clearCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

/* ---- 校验 ---- */
const NAME_RE = /^[A-Za-z0-9_\u4e00-\u9fa5-]{2,20}$/;
function validName(n) { return typeof n === 'string' && NAME_RE.test(n); }
function validPw(p) { return typeof p === 'string' && p.length >= 6 && p.length <= 64; }

/* ---- 业务逻辑（供路由与测试复用） ---- */
function roleOf(username) {
  const u = readUsers()[username];
  return (u && u.role) || 'user';
}

function createUser(username, password, role) {
  username = String(username || '').trim();
  if (!validName(username)) return { ok: false, error: '用户名需 2~20 位，仅限中英文、数字、下划线或连字符' };
  /* 管理员由后台脚本创建，不套用普通用户密码下限 */
  if (role !== 'admin' && !validPw(password)) return { ok: false, error: '密码需 6~64 位' };
  if (!password) return { ok: false, error: '密码不能为空' };
  const users = readUsers();
  if (users[username]) return { ok: false, error: '用户名已被注册' };
  const salt = crypto.randomBytes(16).toString('hex');
  users[username] = {
    salt,
    hash: hashPassword(password, salt),
    role: role || 'user',
    createdAt: Date.now()
  };
  writeUsers(users);
  return { ok: true, username };
}

function registerUser(username, password) {
  if (RESERVED_NAMES.includes(String(username || '').trim().toLowerCase())) {
    return { ok: false, error: '该用户名已保留，请更换' };
  }
  const r = createUser(username, password, 'user');
  if (!r.ok) return r;
  const token = issueToken(r.username);
  return { ok: true, token, username: r.username, role: 'user', save: loadSave(r.username) };
}

function loginUser(username, password) {
  username = String(username || '').trim();
  if (!validName(username)) return { ok: false, error: '用户名或密码不正确' };
  const users = readUsers();
  const u = users[username];
  if (!u || !verifyPassword(password, u.salt, u.hash)) return { ok: false, error: '用户名或密码不正确' };
  const token = issueToken(username);
  return { ok: true, token, username, role: u.role || 'user', save: loadSave(username) };
}

/* 管理员账号（幂等）：默认 admin/admin，仅供后台脚本调用 */
function ensureAdmin(username = 'admin', password = 'admin') {
  const users = readUsers();
  if (users[username]) {
    users[username].role = 'admin';
    writeUsers(users);
    return { ok: true, username, existed: true };
  }
  const r = createUser(username, password, 'admin');
  return r.ok ? { ok: true, username, existed: false } : r;
}

/* 会话信息（cookie 免登录校验用）：{ username, role } 或 null */
function sessionInfo(token) {
  const username = authenticate(token);
  if (!username) return null;
  return { username, role: roleOf(username) };
}

/* ---- 路由 ---- */
const router = express.Router();

router.post('/auth/register', (req, res) => {
  const r = registerUser(req.body && req.body.username, req.body && req.body.password);
  if (!r.ok) return res.status(400).json(r);
  setCookie(res, r.token);
  res.json(r);
});

router.post('/auth/login', (req, res) => {
  const r = loginUser(req.body && req.body.username, req.body && req.body.password);
  if (!r.ok) return res.status(401).json(r);
  setCookie(res, r.token);
  res.json(r);
});

router.post('/auth/logout', (req, res) => {
  revoke(tokenFromReq(req));
  clearCookie(res);
  res.json({ ok: true });
});

/* 取档（登录后）：{ username, role, save }；也用于 cookie 免登录恢复 */
router.get('/save', (req, res) => {
  const info = sessionInfo(tokenFromReq(req));
  if (!info) return res.status(401).json({ ok: false, error: '会话已过期，请重新登录' });
  res.json({ ok: true, username: info.username, role: info.role, save: loadSave(info.username) });
});

/* 存档：body = { save } */
router.put('/save', (req, res) => {
  const info = sessionInfo(tokenFromReq(req));
  if (!info) return res.status(401).json({ ok: false, error: '会话已过期，请重新登录' });
  const save = req.body && req.body.save;
  if (!save || typeof save !== 'object') return res.status(400).json({ ok: false, error: '存档数据无效' });
  putSave(info.username, save);
  res.json({ ok: true, time: Date.now() });
});

module.exports = {
  router, registerUser, loginUser, createUser, ensureAdmin,
  loadSave, putSave, authenticate, sessionInfo, revoke, clearSessions,
  tokenFromReq, cookieToken, DATA_DIR, COOKIE_NAME
};
