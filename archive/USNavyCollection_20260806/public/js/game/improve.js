'use strict';
/* ============================================================
 * 改修工厂（参照 wiki「明石的改修工厂」）
 * 需要工作舰「维斯塔尔」担任秘书舰（第一舰队旗舰）才可使用。
 * - 消耗改修资材(螺丝) + 资源强化装备 ★（0→10 MAX）
 * - 每日次数：基础1 + 二号舰为工作舰/水母 +1 + 旗舰维斯塔尔改 +1（上限3）
 * - 二号舰决定可改修的装备类别（简化 wiki 的星期×二号舰机制）
 * - ★+4 前不会失败，之后随星级失败率上升；明石改（维斯塔尔改）成功率更高
 * - 「确定化」消耗双倍资材、必定成功
 * - ★+6 起需要消耗同名装备作为素材（★0 且未上锁）
 * - ★MAX 后可通过「更新」进化为更强装备（★+5 起步）
 * ============================================================ */

const Improve = (() => {
  const GameRef = () => (typeof window !== 'undefined') ? window.Game : require('../core/state.js').Game;
  const SCREW_CAP = 3000;
  const MAX_STAR = 10;

  /* 成功率（%）：[当前★] = [维斯塔尔, 维斯塔尔改]（★MAX 一行为装备更新成功率）
   * 参照 wiki 改修成功率表 */
  const SUCCESS_RATE = [
    [100, 100], [100, 100], [100, 100], [100, 100],
    [95, 100], [90, 95], [80, 90], [77, 82], [72, 77], [60, 67]
  ];
  const UPDATE_RATE = [50, 62];

  /* 二号舰舰种 → 解锁类别 */
  const TYPE_NEED = {
    DD: 'dd', DE: 'dd', CL: 'cl', CLT: 'cl', CA: 'cl', CAV: 'cl',
    BB: 'bb', BBV: 'bb', CV: 'cv', CVL: 'cv', CVB: 'cv', AS: 'as', AV: 'as'
  };

  function addScrews(n) {
    const st = GameRef().state;
    st.resources.screws = Math.min(SCREW_CAP, (st.resources.screws || 0) + n);
  }

  /* 秘书舰是否为工作舰（维斯塔尔） */
  function secretaryIsVestal() {
    const st = GameRef().state;
    const flag = st.ships[st.fleet[1][0]];
    return !!(flag && flag.id === 'vestal');
  }
  function flagshipKai() {
    const st = GameRef().state;
    const flag = st.ships[st.fleet[1][0]];
    return !!(flag && flag.id === 'vestal' && flag.kai >= 1);
  }

  /* 二号舰解锁的装备类别（basic 始终可用） */
  function unlockedNeeds() {
    const st = GameRef().state;
    const f = st.fleet[1] || [];
    const out = ['basic'];
    if (f.length >= 2 && st.ships[f[1]]) {
      const t = GameRef().shipDef(st.ships[f[1]]).type;
      if (TYPE_NEED[t]) out.push(TYPE_NEED[t]);
    }
    return out;
  }

  /* 每日改修次数 */
  function dailyLimit() {
    const st = GameRef().state;
    const f = st.fleet[1] || [];
    let n = 1;
    if (f.length >= 2 && st.ships[f[1]]) {
      const t = GameRef().shipDef(st.ships[f[1]]).type;
      if (t === 'AS' || t === 'AV') n++;
    }
    if (flagshipKai()) n++;
    return Math.min(3, n);
  }
  function dailyUsed() {
    const st = GameRef().state;
    return st.improve ? st.improve.count : 0;
  }

  function cfgOf(id) { return IMPROVE[id] || null; }

  function costOf(euid, guaranteed) {
    const st = GameRef().state;
    const eq = st.equipment[euid];
    const cfg = cfgOf(eq.id);
    let screws = cfg.screws + (eq.star >= 6 ? 1 : 0);
    if (guaranteed) screws *= 2;
    return { screws, res: { fuel: cfg.res[0], ammo: cfg.res[1], steel: cfg.res[2], baux: cfg.res[3] } };
  }

  /* 改修成功率（当前★ → +1） */
  function successRate(star) {
    const kai = flagshipKai() ? 1 : 0;
    return star >= MAX_STAR ? UPDATE_RATE[kai] : SUCCESS_RATE[star][kai];
  }

  /* 找同名 ★0 未装备未上锁的素材装备 */
  function findMatEquip(id) {
    const st = GameRef().state;
    const used = new Set();
    for (const s of Object.values(st.ships)) for (const e of s.equipped) used.add(e);
    const cand = Object.values(st.equipment).find(e => e.id === id && !e.star && !e.locked && !used.has(e.uid));
    return cand || null;
  }

  function isEquipped(euid) {
    const st = GameRef().state;
    for (const s of Object.values(st.ships)) if (s.equipped.includes(euid)) return true;
    return false;
  }

  /* 改修信息（UI 展示与校验） */
  function improveInfo(euid) {
    const st = GameRef().state;
    const eq = st.equipment[euid];
    if (!eq) return null;
    const cfg = cfgOf(eq.id);
    const out = {
      available: false, reason: '', euid, id: eq.id, star: eq.star || 0,
      cfg, need: cfg ? cfg.need : null,
      unlocked: false, equipped: isEquipped(euid),
      daily: { used: dailyUsed(), max: dailyLimit() },
      cost: null, guaranteedCost: null, rate: 0,
      needsMat: false, matOk: true, update: null, updateOk: false
    };
    if (!cfg) { out.reason = '该装备无法改修'; return out; }
    if (!secretaryIsVestal()) { out.reason = '需要工作舰维斯塔尔作为秘书舰'; return out; }
    if (out.equipped) { out.reason = '装备中的装备需先卸下'; return out; }
    out.unlocked = cfg.need === 'basic' || unlockedNeeds().includes(cfg.need);
    if (!out.unlocked) { out.reason = '未解锁（需要对应二号舰）'; return out; }
    if (out.star >= MAX_STAR) {
      if (cfg.update) {
        out.update = { ...cfg.update };
        out.updateOk = cfg.update.mats.every(id => !!findMatEquip(id));
        out.reason = out.updateOk ? '可进行装备更新' : '缺少更新素材';
      } else out.reason = '已达★MAX';
      return out;
    }
    if (out.daily.used >= out.daily.max) { out.reason = '今日改修次数已用完'; return out; }
    out.needsMat = out.star >= (cfg.matFrom || 6);
    if (out.needsMat) {
      out.matOk = !!findMatEquip(eq.id);
      if (!out.matOk) { out.reason = '缺少同名素材装备（★0）'; return out; }
    }
    out.cost = costOf(euid, false);
    out.guaranteedCost = costOf(euid, true);
    out.rate = successRate(out.star);
    out.available = true;
    return out;
  }

  /* 改修一次（guaranteed=确定化，消耗双倍资材必定成功） */
  function improve(euid, guaranteed) {
    const G = GameRef();
    const st = G.state;
    const info = improveInfo(euid);
    if (!info || !info.available) return { ok: false, msg: (info && info.reason) || '无法改修' };
    const eq = st.equipment[euid];
    const cost = guaranteed ? info.guaranteedCost : info.cost;
    if (st.resources.screws < cost.screws) return { ok: false, msg: '改修资材不足！' };
    if (!G.canAfford(cost.res)) return { ok: false, msg: '资源不足！' };
    let mat = null;
    if (info.needsMat) {
      mat = findMatEquip(eq.id);
      if (!mat) return { ok: false, msg: '缺少同名素材装备' };
    }
    G.spend(cost.res);
    st.resources.screws -= cost.screws;
    if (mat) G.destroyEquip(mat.uid);
    if (!st.improve) st.improve = { date: '', count: 0 };
    st.improve.count++;
    const success = guaranteed || Util.chance(info.rate / 100);
    if (success) eq.star++;
    Progression.notify('improve', 1);
    return { ok: true, success, star: eq.star, rate: info.rate, guaranteed: !!guaranteed };
  }

  /* 装备更新（进化）：★MAX 后消耗指定素材进化为新装备（★+5 起步） */
  function updateEquip(euid, guaranteed) {
    const G = GameRef();
    const st = G.state;
    const info = improveInfo(euid);
    if (!info || info.star < MAX_STAR || !info.cfg || !info.cfg.update) return { ok: false, msg: '无法更新' };
    if (!info.updateOk) return { ok: false, msg: '缺少更新素材' };
    if (info.daily.used >= info.daily.max) return { ok: false, msg: '今日改修次数已用完' };
    let screws = info.cfg.screws + 1;
    if (guaranteed) screws *= 2;
    if (st.resources.screws < screws) return { ok: false, msg: '改修资材不足！' };
    const res = { fuel: info.cfg.res[0], ammo: info.cfg.res[1], steel: info.cfg.res[2], baux: info.cfg.res[3] };
    if (!G.canAfford(res)) return { ok: false, msg: '资源不足！' };
    G.spend(res);
    st.resources.screws -= screws;
    /* 逐个消耗更新素材（每个都须为独立的不同装备） */
    for (const id of info.cfg.update.mats) {
      const m = findMatEquip(id);
      if (!m) return { ok: false, msg: '缺少更新素材' };
      G.destroyEquip(m.uid);
    }
    if (!st.improve) st.improve = { date: '', count: 0 };
    st.improve.count++;
    const success = guaranteed || Util.chance(UPDATE_RATE[flagshipKai() ? 1 : 0] / 100);
    if (success) {
      const eq = st.equipment[euid];
      eq.id = info.cfg.update.to;
      eq.star = 5;
    }
    Progression.notify('improve', 1);
    return { ok: true, success, to: info.cfg.update.to };
  }

  /* 可改修装备列表（未装备且配置了改修） */
  function list() {
    const st = GameRef().state;
    return Object.values(st.equipment)
      .filter(e => cfgOf(e.id) && !isEquipped(e.uid))
      .map(e => ({ euid: e.uid, id: e.id, star: e.star || 0, cfg: cfgOf(e.id) }));
  }

  return {
    SCREW_CAP, MAX_STAR, addScrews, secretaryIsVestal, flagshipKai,
    unlockedNeeds, dailyLimit, dailyUsed, improveInfo, improve, updateEquip, list, findMatEquip, successRate
  };
})();

if (typeof window !== 'undefined') window.Improve = Improve;
if (typeof module !== 'undefined' && module.exports) module.exports = { Improve };
