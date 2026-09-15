'use strict';
/* ============================================================
 * 获取途径（V0.305 · 图鉴深化）
 *
 * 从**既有数据**派生「这件舰船/装备去哪拿」——零新增数据（规划方案 §3.2(1)）：
 *   舰船：MAPS[].drops / MAPS[].bossDrops / HISTORY_BATTLES[].bossDrops / def.build /
 *         QUESTS[].reward.ship / STARTER_IDS
 *   装备：ed.dev（开发池）/ IMPROVE[].update.to（改修更新）/ SHIPS[].equip（随舰自带）/
 *         QUESTS[].reward.equip|item / HISTORY_BATTLES[].rewards.*.equip|item /
 *         Progression.MEDAL_SHOP（军需处兑换，V0.305 补：本版两个新特性必须互相认识）
 *
 * 为什么单独成文件：图鉴 UI 与 simulate.js 必须用**同一套判定**（禁止在 UI 另写一套，
 * 规范 P2-2 / 禁止事项 6），而 UI 文件（public/js/ui/*）不参与 headless 测试。
 *
 * 纯函数、无副作用：只读全局数据，不碰 state。
 * ============================================================ */

const Acquisition = (() => {
  const maps = () => (typeof MAPS !== 'undefined' && MAPS) || [];
  const battles = () => (typeof HISTORY_BATTLES !== 'undefined' && HISTORY_BATTLES) || [];
  const quests = () => (typeof QUESTS !== 'undefined' && QUESTS) || [];
  const ships = () => (typeof ShipData !== 'undefined' && ShipData) || {};
  const equips = () => (typeof EquipmentData !== 'undefined' && EquipmentData) || {};
  const improve = () => (typeof IMPROVE !== 'undefined' && IMPROVE) || {};
  const secZh = () => (typeof DEV_SEC_ZH !== 'undefined' && DEV_SEC_ZH) || {};
  const poolZh = () => (typeof DEV_POOL_ZH !== 'undefined' && DEV_POOL_ZH) || {};
  const uniq = a => [...new Set(a)];
  const LIMIT = 4;   // 单一途径最多并列几个来源（UI 可读性；多余用「等」）

  /* 「未实装」标记：数据表里存在、但没有任何产出渠道的条目。
   * 本函数不掩盖这种缺口，而是显式标记出来（图鉴因此成为**内容缺口的探测器**）。
   * 当前实测 6 件（全部是 V0.302~V0.304 遗留，本版范围冻结、不做补渠道改动）：
   *   xf5u / fr1 / fleetcom / repair_facility / crew_vet / m4a1
   * —— 也就是说「装备收集率 100%」在现有数据下**不可达**，这正好印证了
   *    里程碑 100% 档只给纪念性荣誉、不给数值奖励的决定（规划方案 §3.2(3)）。 */
  function markUnimplemented(out) {
    if (!out.length) {
      out.push({ key: 'none', text: '暂无获取途径（数值已实装，但尚未接入任何产出渠道）' });
    }
    return out;
  }

  /* ============ 舰船 ============ */
  function shipRoutes(id) {
    const out = [];
    const def = ships()[id];
    if (!def) return out;

    const mid = [], bid = [], hid = [];
    for (const m of maps()) {
      if ((m.drops || []).includes(id)) mid.push(m.id);
      if ((m.bossDrops || []).includes(id)) bid.push(m.id);
    }
    for (const b of battles()) if ((b.bossDrops || []).includes(id)) hid.push(`${b.id} ${b.name}`);
    if (mid.length) out.push({ key: 'drop', text: `道中掉落：${mid.join('、')}` });
    if (bid.length) out.push({ key: 'bossDrop', text: `BOSS 掉落：${bid.join('、')}` });
    if (hid.length) out.push({ key: 'histDrop', text: `战役 BOSS 掉落：${hid.join('、')}` });

    if (def.buildable !== false && def.build) {
      const b = def.build;
      out.push({ key: 'build', text: `可建造（工厂 · 最低配方 油${b.fuel}/弹${b.ammo}/钢${b.steel}/铝${b.baux}）` });
    }
    const qn = uniq(quests()
      .filter(q => q.reward && [].concat(q.reward.ship || []).includes(id))
      .map(q => q.name));
    if (qn.length) out.push({ key: 'quest', text: `任务奖励：${qn.slice(0, LIMIT).join('、')}${qn.length > LIMIT ? ' 等' : ''}` });

    if (typeof STARTER_IDS !== 'undefined' && STARTER_IDS.includes(id)) out.push({ key: 'starter', text: '初始赠送' });

    /* 注：本作的「改造」是同一 ship id 换形态（`inst.kai` 0/1/2，`shipDef` 合并 def.kai），
     * 不产生新的图鉴条目 —— 所以不存在「改造获得」这条途径（规划方案里的该项在本作不适用）。 */
    return markUnimplemented(out);
  }

  /* ============ 装备 ============ */
  function equipRoutes(id) {
    const out = [];
    const ed = equips()[id];
    if (!ed) return out;

    const devs = [];
    for (const sec in (ed.dev || {})) {
      for (const pool in (ed.dev[sec] || {})) {
        if (ed.dev[sec][pool] > 0) devs.push(`${secZh()[sec] || sec} × ${poolZh()[pool] || pool}`);
      }
    }
    if (devs.length) out.push({ key: 'dev', text: `可开发（${uniq(devs).join(' / ')}）` });

    const from = [];
    for (const k in improve()) {
      const up = improve()[k] && improve()[k].update;
      if (up && up.to === id) from.push(equips()[k] ? equips()[k].zh : k);
    }
    if (from.length) out.push({ key: 'kaiUpdate', text: `改修更新获得（★MAX 进化）：由 ${from.slice(0, LIMIT).join('、')} 进化` });

    const byShip = [];
    for (const sid in ships()) {
      const d = ships()[sid];
      const list = [].concat(d.equip || [], (d.kai && d.kai.equip) || [], (d.kai2 && d.kai2.equip) || []);
      if (list.includes(id)) byShip.push(d.zh || sid);
    }
    if (byShip.length) {
      const u = uniq(byShip);
      out.push({ key: 'shipEquip', text: `随舰自带：${u.slice(0, LIMIT).join('、')}${u.length > LIMIT ? ' 等' : ''}` });
    }

    const qn = uniq(quests()
      .filter(q => q.reward && [].concat(q.reward.equip || [], q.reward.item || []).includes(id))
      .map(q => q.name));
    if (qn.length) out.push({ key: 'quest', text: `任务奖励：${qn.slice(0, LIMIT).join('、')}${qn.length > LIMIT ? ' 等' : ''}` });

    const LAYER_ZH = { firstClear: '常规阶首通', histForm: '史实重演', repeat: '重复通关' };
    const hn = [];
    for (const b of battles()) {
      const rw = b.rewards || {};
      for (const layer in LAYER_ZH) {
        const r = rw[layer];
        if (r && [].concat(r.equip || [], r.item || []).includes(id)) hn.push(`${b.id}·${LAYER_ZH[layer]}`);
      }
      const hr = rw.hard && rw.hard.firstClear;
      if (hr && [].concat(hr.equip || [], hr.item || []).includes(id)) hn.push(`${b.id}·强敌阶首通`);
    }
    if (hn.length) out.push({ key: 'hist', text: `战役奖励：${uniq(hn).join('、')}` });

    /* 军需处兑换（V0.305 军需处）：章 → 消耗品。
     * 必须收录 —— 否则本版两个新特性互不相认（交付评审 G-2）：图鉴的功能定位是"知道去哪拿"，
     * 而本版给消耗品补的**最可靠出口**（可重复、不受掉落概率影响）恰恰不在里面。
     * 数据源是 Progression.MEDAL_SHOP（运行时常量）；拿不到就跳过，保持模块对数据表缺失的容错。 */
    const shop = (typeof Progression !== 'undefined' && Progression.MEDAL_SHOP) || [];
    const shopHit = shop.filter(it => {
      const rw = it.reward || {};
      return [].concat(rw.item || [], rw.equip || []).includes(id);
    });
    if (shopHit.length) out.push({ key: 'medalShop', text: `军需处兑换（战功章 ×${shopHit[0].cost}）` });

    return markUnimplemented(out);
  }

  /* 统一入口：kind 省略时按数据表自动判定（舰船优先） */
  function routes(id, kind) {
    const k = kind || (ships()[id] ? 'ship' : equips()[id] ? 'equip' : null);
    if (k === 'ship') return shipRoutes(id);
    if (k === 'equip') return equipRoutes(id);
    return [];
  }
  function routeTexts(id, kind) { return routes(id, kind).map(r => r.text); }

  /* 「未实装」清单（无任何产出渠道的条目）—— 供断言锁定数量与交付报告披露 */
  function unimplemented(kind) {
    const src = kind === 'ship' ? ships() : equips();
    return Object.keys(src).filter(id => routes(id, kind).some(r => r.key === 'none'));
  }

  return { shipRoutes, equipRoutes, routes, routeTexts, unimplemented };
})();

if (typeof window !== 'undefined') window.Acquisition = Acquisition;
if (typeof module !== 'undefined' && module.exports) module.exports = { Acquisition };
