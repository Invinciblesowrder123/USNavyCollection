'use strict';
/* ============================================================
 * 轻量 DOM 桩（仅测试用，零依赖）
 *
 * 目的：让 scripts/simulate.js 能在 Node 里加载**真实的** public/js/ui/*.js，
 *       并向**真实的绑定节点**派发**真实的**冒泡事件流 —— 从而对
 *       「事件监听绑定在长期存在的容器上、切页不解绑」这类**只在接线处出现**
 *       的缺陷给出行为级断言。
 *
 * 覆盖范围（刻意最小，只覆盖 public/js/ui 层断言所需的 API 子集）：
 *   - HTML 解析 → 真实节点树（标签/属性/自闭合/void 元素/文本节点）
 *   - innerHTML / textContent / className / dataset / value / checked
 *   - querySelector / querySelectorAll（支持 #id、.class、tag、后代组合子）
 *   - addEventListener / removeEventListener / dispatchEvent（**含冒泡**）
 *   - preventDefault → defaultPrevented
 *   - **浏览器默认动作建模**：keydown Enter/Space 落在 button / input[submit] / a[href]
 *     上时派发 click；Space 落在 checkbox/radio 上时切换 checked 并派发 change。
 *     —— 断言「非登录页按 Enter 不取消目标按钮的默认行为」正是靠这一层判定。
 *
 * 不模拟：布局、样式、焦点环、事件捕获阶段、被动监听、指针事件、requestAnimationFrame。
 * 凡依赖上述能力的断言都不该写在这里（会给出假绿）。
 * ============================================================ */

/* void 元素：没有结束标签，解析时不入栈 */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

/* ---------------- 事件 ---------------- */

/** 浏览器事件对象（只实现断言用得到的成员） */
class MiniEvent {
  constructor(type, init) {
    init = init || {};
    this.type = type;
    this.key = init.key;                                   // keydown 用
    this.target = null;                                    // 派发起点
    this.currentTarget = null;                             // 当前监听器所在节点
    this.defaultPrevented = false;                         // preventDefault 后的真实标记
    this.bubbles = init.bubbles !== false;                 // keydown/click 均为 true
    this._stopped = false;                                 // stopPropagation
    this._immediate = false;                               // stopImmediatePropagation
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this._stopped = true; }
  stopImmediatePropagation() { this._stopped = true; this._immediate = true; }
}

/* ---------------- 节点 ---------------- */

class MiniText {
  constructor(data) {
    this.nodeType = 3;
    this.data = data;
    this.parentNode = null;
  }
  get textContent() { return this.data; }
  get outerHTML() { return this.data.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
}

class MiniElement {
  constructor(tagName, ownerDocument) {
    this.nodeType = 1;
    this.localName = String(tagName).toLowerCase();
    this.tagName = this.localName.toUpperCase();
    this.attributes = Object.create(null);   // 原样小写属性名 → 值
    this.childNodes = [];
    this.parentNode = null;
    this.ownerDocument = ownerDocument || null;
    this._listeners = Object.create(null);
    this._value = undefined;                 // input.value 覆盖值
    this._checked = undefined;               // checkbox checked 覆盖值
    this.disabled = false;
  }

  /* ---- 树 ---- */
  appendChild(node) {
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  /** 是否挂在 documentElement 之下（真实 DOM 语义：脱离文档即 false） */
  get isConnected() {
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return n === (this.ownerDocument && this.ownerDocument.documentElement);
  }
  contains(other) {
    let n = other;
    while (n) { if (n === this) return true; n = n.parentNode; }
    return false;
  }

  /* ---- 属性 ---- */
  setAttribute(name, value) {
    this.attributes[String(name).toLowerCase()] = value === undefined ? '' : String(value);
  }
  getAttribute(name) {
    const v = this.attributes[String(name).toLowerCase()];
    return v === undefined ? null : v;
  }
  hasAttribute(name) { return this.attributes[String(name).toLowerCase()] !== undefined; }
  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', v); }
  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', v); }
  get classList() {
    const self = this;
    const list = self.className.split(/\s+/).filter(Boolean);
    list.contains = c => list.indexOf(c) >= 0;
    list.add = c => { if (!list.contains(c)) { list.push(c); self.className = list.join(' '); } };
    list.remove = c => { const i = list.indexOf(c); if (i >= 0) { list.splice(i, 1); self.className = list.join(' '); } };
    list.toggle = (c, on) => { (on === undefined ? !list.contains(c) : !!on) ? list.add(c) : list.remove(c); };
    return list;
  }
  /** data-* → dataset（每次按当前属性重建，避免解析顺序导致的过期） */
  get dataset() {
    const out = {};
    for (const k of Object.keys(this.attributes)) {
      if (k.startsWith('data-')) {
        out[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = this.attributes[k];
      }
    }
    return out;
  }

  /* ---- 表单值 ---- */
  get value() {
    if (this._value !== undefined) return this._value;
    return this.getAttribute('value') || '';
  }
  set value(v) { this._value = v === undefined || v === null ? '' : String(v); }
  get checked() {
    if (this._checked !== undefined) return this._checked;
    return this.hasAttribute('checked');
  }
  set checked(v) { this._checked = !!v; }
  get type() { return (this.getAttribute('type') || 'text').toLowerCase(); }
  get placeholder() { return this.getAttribute('placeholder') || ''; }

  /* ---- 文本 / HTML ---- */
  get textContent() {
    return this.childNodes.map(n => (n.nodeType === 3 ? n.data : n.textContent)).join('');
  }
  set textContent(v) {
    this.childNodes = [];
    if (v !== '' && v !== null && v !== undefined) this.appendChild(new MiniText(String(v)));
  }
  get innerHTML() { return this.childNodes.map(n => n.outerHTML).join(''); }
  set innerHTML(html) {
    this.childNodes = [];
    if (html) parseHTML(String(html), this.ownerDocument, this);
  }
  get outerHTML() {
    const attrs = Object.keys(this.attributes)
      .map(k => ` ${k}="${String(this.attributes[k]).replace(/"/g, '&quot;')}"`).join('');
    if (VOID.has(this.localName)) return `<${this.localName}${attrs}>`;
    return `<${this.localName}${attrs}>${this.innerHTML}</${this.localName}>`;
  }

  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument && this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null; }
  click() { this.dispatchEvent(new MiniEvent('click')); }

  /* ---- 选择器 ---- */
  querySelector(sel) { const r = this.querySelectorAll(sel); return r.length ? r[0] : null; }
  querySelectorAll(sel) {
    const groups = String(sel).split(',').map(s => s.trim()).filter(Boolean)
      .map(s => s.split(/\s+/).map(parseCompound));
    const out = [];
    for (const el of descendants(this)) {
      if (groups.some(g => matchParts(el, g, this))) out.push(el);
    }
    return out;
  }

  /* ---- 事件 ---- */
  addEventListener(type, fn) {
    (this._listeners[type] || (this._listeners[type] = [])).push(fn);
  }
  removeEventListener(type, fn) {
    const a = this._listeners[type];
    if (!a) return;
    const i = a.indexOf(fn);
    if (i >= 0) a.splice(i, 1);
  }
  listenerCount(type) { return (this._listeners[type] || []).length; }

  /**
   * 真实冒泡派发：target → 祖先链依次触发监听器，随后由**浏览器默认动作**接手。
   * 返回是否传播到了 root（含自身）。
   */
  dispatchEvent(evt) {
    evt.target = evt.target || this;
    // 从 target 向上收集路径（含 target 与 documentElement）
    const path = [];
    for (let n = this; n; n = n.parentNode) path.push(n);
    for (const node of path) {
      evt.currentTarget = node;
      const arr = node._listeners && node._listeners[evt.type];
      if (arr) for (const fn of arr.slice()) {
        fn.call(node, evt);
        if (evt._immediate) return !evt._stopped;
      }
      if (evt._stopped || !evt.bubbles) break;
    }
    evt.currentTarget = null;
    applyDefaultAction(evt);     // 默认动作在传播结束后才发生（这正是 preventDefault 的意义）
    return !evt._stopped;
  }
}

/* ---------------- 文档 ---------------- */

class MiniDocument {
  constructor() {
    this.documentElement = new MiniElement('html', this);
    this.body = new MiniElement('body', this);
    this.documentElement.appendChild(this.body);
    this.activeElement = null;
  }
  createElement(tag) { return new MiniElement(tag, this); }
  createTextNode(t) { return new MiniText(String(t)); }
  querySelector(sel) { return this.documentElement.querySelector(sel); }
  querySelectorAll(sel) { return this.documentElement.querySelectorAll(sel); }
  getElementById(id) { return this.querySelector('#' + id); }
}

/* ---------------- 浏览器默认动作建模 ---------------- */

/**
 * keydown / click 的 UA 默认行为。断言「Enter 不取消按钮默认 click 行为」判的就是这里。
 * 覆盖：button、input[submit|button|reset|image]、a[href]（Enter/Space → click）；
 *       input[checkbox|radio]（Space → 切换 checked + change）。
 */
function applyDefaultAction(evt) {
  if (evt.defaultPrevented) return;
  const t = evt.target;
  if (!t || t.nodeType !== 1) return;

  if (evt.type === 'keydown') {
    const isEnter = evt.key === 'Enter';
    const isSpace = evt.key === ' ' || evt.key === 'Spacebar';
    if (!isEnter && !isSpace) return;
    if (t.localName === 'button') { t.dispatchEvent(new MiniEvent('click')); return; }
    if (t.localName === 'a' && isEnter && t.hasAttribute('href')) { t.dispatchEvent(new MiniEvent('click')); return; }
    if (t.localName === 'input') {
      const ty = t.type;
      if (['submit', 'button', 'reset', 'image'].includes(ty)) { t.dispatchEvent(new MiniEvent('click')); return; }
      if (isSpace && ['checkbox', 'radio'].includes(ty)) {
        t.checked = !t.checked;
        t.dispatchEvent(new MiniEvent('change'));
      }
    }
    return;
  }

  if (evt.type === 'click') {
    // 链接导航：无 DOM 后果，仅保证「默认动作确实发生」这一事实可被观察
    if (t.localName === 'a' && t.hasAttribute('href')) t._lastNavHref = t.getAttribute('href');
  }
}

/* ---------------- HTML 解析 ---------------- */

function descendants(el) {
  const out = [];
  (function walk(n) {
    for (const c of n.childNodes) { if (c.nodeType === 1) { out.push(c); walk(c); } }
  })(el);
  return out;
}

/** 把 '.login-tabs button' 拆成 [{class:login-tabs}, {tag:button}] */
function parseCompound(s) {
  const c = { tag: null, id: null, classes: [], attrs: [] };
  /* 属性选择器 [data-fleet] / [data-x="1"] 先单独摘出来 ——
   * 本项目的 UI 事件接线几乎全靠 [data-*]（[data-supply] / [data-fleet] / [data-tab]…），
   * 不支持的话 mapList 渲染完会在 querySelector(...).addEventListener 处抛错，
   * 断言根本跑不到那儿 ⇒ 假绿。（V0.307 批次5 任务5.2 补） */
  let rest = String(s);
  const attrRe = /\[\s*([\w-]+)\s*(?:([~^$*|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]]*?)))?\s*\]/g;
  let am;
  while ((am = attrRe.exec(rest)) !== null) {
    const name = am[1];
    const op = am[2] || null;
    const val = am[3] !== undefined ? am[3] : (am[4] !== undefined ? am[4] : (am[5] !== undefined ? am[5].trim() : null));
    c.attrs.push({ name: String(name).toLowerCase(), op, val });
  }
  rest = rest.replace(attrRe, '');
  const re = /([#.]?)([\w-]+)/g;
  let m;
  while ((m = re.exec(rest))) {
    if (m[1] === '#') c.id = m[2];
    else if (m[1] === '.') c.classes.push(m[2]);
    else c.tag = m[2].toLowerCase();
  }
  return c;
}

function matchCompound(el, c) {
  if (c.tag && el.localName !== c.tag) return false;
  if (c.id !== null && el.id !== c.id) return false;
  for (const k of c.classes) if (el.classList.indexOf(k) < 0) return false;
  for (const a of (c.attrs || [])) {
    if (!el.hasAttribute(a.name)) return false;
    if (a.op === '=' && el.getAttribute(a.name) !== a.val) return false;
    /* ~= ^= $= *= 暂不支持：显式抛错而不是静默放行（静默放行就是假绿） */
    if (a.op && a.op !== '=') throw new Error('dom_stub: 属性选择器操作符 ' + a.op + ' 未实现（会造成假绿）');
  }
  return true;
}

/** 后代组合子：从右往左匹配，祖先只需按序出现，不要求相邻 */
function matchParts(el, parts, root) {
  if (!matchCompound(el, parts[parts.length - 1])) return false;
  let idx = parts.length - 2;
  for (let n = el.parentNode; n && idx >= 0; n = n.parentNode) {
    if (n.nodeType === 1 && n !== root && matchCompound(n, parts[idx])) idx--;
  }
  return idx < 0;
}

function parseAttrs(s, el) {
  const re = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(s))) {
    let v = '';
    if (m[2] !== undefined) v = m[2];
    else if (m[3] !== undefined) v = m[3];
    else if (m[4] !== undefined) v = m[4];
    el.setAttribute(m[1], v);
  }
}

function parseHTML(html, doc, parent) {
  const stack = [parent];
  const top = () => stack[stack.length - 1];
  let i = 0;
  const addText = (t, at) => {
    if (!t) return;
    if (!t.trim() && !t.includes(' ')) return;   // 丢纯排版空白（保留含实义空格的文本）
    top().appendChild(new MiniText(t));
  };
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { addText(html.slice(i), i); break; }
    if (lt > i) addText(html.slice(i, lt), i);

    if (html.startsWith('<!--', lt)) {
      const e = html.indexOf('-->', lt);
      i = e < 0 ? html.length : e + 3;
      continue;
    }
    if (html[lt + 1] === '/') {                       // 闭合标签
      const e = html.indexOf('>', lt);
      const name = html.slice(lt + 2, e < 0 ? html.length : e).trim().toLowerCase();
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].localName === name) { stack.length = k; break; }
      }
      i = (e < 0 ? html.length : e) + 1;
      continue;
    }
    /* 开标签：扫描到 '>'，跳过引号内的 '>' */
    let j = lt + 1, q = null;
    while (j < html.length) {
      const ch = html[j];
      if (q) { if (ch === q) q = null; }
      else if (ch === '"' || ch === "'") q = ch;
      else if (ch === '>') break;
      j++;
    }
    const inner = html.slice(lt + 1, j);
    const selfClose = inner.trimEnd().endsWith('/');
    const body = selfClose ? inner.trimEnd().slice(0, -1) : inner;
    const m = /^([A-Za-z][\w:-]*)/.exec(body);
    if (!m) { i = j + 1; continue; }
    const el = new MiniElement(m[1], doc || parent.ownerDocument);
    parseAttrs(body.slice(m[1].length), el);
    top().appendChild(el);
    if (!selfClose && !VOID.has(el.localName)) stack.push(el);
    i = j + 1;
  }
}

/* ---------------- 工厂 ---------------- */

/**
 * 建一套 window + document。
 * @returns {{window: object, document: MiniDocument, event: Function}}
 */
function createDom() {
  const document = new MiniDocument();
  const window = { document, activeElement: null };
  document.defaultView = window;
  return {
    window,
    document,
    /** 造一个事件（等价于 new KeyboardEvent / new Event） */
    event: (type, init) => new MiniEvent(type, init)
  };
}

module.exports = { createDom, MiniEvent, MiniElement, MiniDocument, parseHTML };
