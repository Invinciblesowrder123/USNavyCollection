'use strict';
/* ============================================================
 * 账号系统：注册 / 登录 / 会话 / 存档 API
 * 存储：data/users.json（账号元数据）+ data/saves/<username>.json（存档）
 * 密码：crypto.scrypt 加盐哈希（Node 内置，零新依赖）
 * 会话：内存 token（Bearer），7 天有效期
 * ============================================================ */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');

const DATA_DIR = process.env.AUTH_DATA_DIR || path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SAVES_DIR = path.join(DATA_DIR, 'saves');
const SESSION_TTL = 1000 * 60 * 60 * 24 * 7;

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

/* ---- 校验 ---- */
const NAME_RE = /^[A-Za-z0-9_\u4e00-\u9fa5-]{2,20}$/;
function validName(n) { return typeof n === 'string' && NAME_RE.test(n); }
function validPw(p) { return typeof p === 'string' && p.length >= 6 && p.length <= 64; }

/* ---- 业务逻辑（供路由与测试复用） ---- */
function registerUser(username, password) {
  username = String(username || '').trim();
  if (!validName(username)) return { ok: false, error: '用户名需 2~20 位，仅限中英文、数字、下划线或连字符' };
  if (!validPw(password)) return { ok: false, error: '密码需 6~64 位' };
  const users = readUsers();
  if (users[username]) return { ok: false, error: '用户名已被注册' };
  const salt = crypto.randomBytes(16).toString('hex');
  users[username] = {
    salt,
    hash: hashPassword(password, salt),
    createdAt: Date.now()
  };
  writeUsers(users);
  const token = issueToken(username);
  return { ok: true, token, username, save: loadSave(username) };
}

function loginUser(username, password) {
  username = String(username || '').trim();
  if (!validName(username)) return { ok: false, error: '用户名或密码不正确' };
  const users = readUsers();
  const u = users[username];
  if (!u || !verifyPassword(password, u.salt, u.hash)) return { ok: false, error: '用户名或密码不正确' };
  const token = issueToken(username);
  return { ok: true, token, username, save: loadSave(username) };
}

/* ---- 路由 ---- */
const router = express.Router();

router.post('/auth/register', (req, res) => {
  const r = registerUser(req.body && req.body.username, req.body && req.body.password);
  if (!r.ok) return res.status(400).json(r);
  res.json(r);
});

router.post('/auth/login', (req, res) => {
  const r = loginUser(req.body && req.body.username, req.body && req.body.password);
  if (!r.ok) return res.status(401).json(r);
  res.json(r);
});

router.post('/auth/logout', (req, res) => {
  const h = req.headers.authorization || '';
  revoke(h.startsWith('Bearer ') ? h.slice(7) : '');
  res.json({ ok: true });
});

/* 取档（登录后）：{ username, save } */
router.get('/save', (req, res) => {
  const h = req.headers.authorization || '';
  const username = authenticate(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!username) return res.status(401).json({ ok: false, error: '会话已过期，请重新登录' });
  res.json({ ok: true, username, save: loadSave(username) });
});

/* 存档：body = { save } */
router.put('/save', (req, res) => {
  const h = req.headers.authorization || '';
  const username = authenticate(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!username) return res.status(401).json({ ok: false, error: '会话已过期，请重新登录' });
  const save = req.body && req.body.save;
  if (!save || typeof save !== 'object') return res.status(400).json({ ok: false, error: '存档数据无效' });
  putSave(username, save);
  res.json({ ok: true, time: Date.now() });
});

module.exports = { router, registerUser, loginUser, loadSave, putSave, authenticate, revoke, clearSessions, DATA_DIR };
