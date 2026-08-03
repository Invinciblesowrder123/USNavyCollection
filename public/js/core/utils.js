'use strict';
/* ============================================================
 * 通用工具
 * ============================================================ */

const Util = {
  /* 整数随机 [min,max] */
  ri(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; },
  /* 浮点随机 [min,max) */
  rf(min, max) { return Math.random() * (max - min) + min; },
  clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  /* 加权随机：{item: weight} */
  weighted(table) {
    let total = 0;
    for (const k in table) total += table[k];
    let r = Math.random() * total;
    for (const k in table) { r -= table[k]; if (r <= 0) return k; }
    return Object.keys(table)[0];
  },
  chance(p) { return Math.random() < p; },
  /* 平方根取整（制空/发动率用） */
  sqrt(v) { return Math.floor(Math.sqrt(Math.max(0, v))); },
  /* 格式化时长 mm:ss 或 XhYm */
  fmtTime(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return `${h}小时${m}分`;
    if (m > 0) return `${m}分${sec}秒`;
    return `${sec}秒`;
  },
  fmtClock(ms) {
    const d = new Date(ms);
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  },
  esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
};

if (typeof window !== 'undefined') window.Util = Util;
if (typeof module !== 'undefined' && module.exports) module.exports = { Util };
