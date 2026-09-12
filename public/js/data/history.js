'use strict';
/* ============================================================
 * 历史战役模式（V0.303）—— 独立于 25 张常规海域的常驻关卡
 *
 * 【隔离原则（任务书坑 #16）】
 *   本文件**不进 MAPS 数组**。simulate.js 里 25 图的简报覆盖 / 威胁维度推导 /
 *   BOSS 可达 / 作战目标上限等断言全部按 MAPS 遍历；战役数据混进去，要么把这些断言
 *   全改范围，要么被当成普通图校验出假红。隔离的代价只有一处引擎改动：
 *   sortie.js::resolveMap（MAPS → HISTORY_BATTLES）——**唯一的接入点**。
 *
 * 【史实规则（P0-3 安全侧）】
 *   histRule 只决定**加成**，不决定通关：匹配 → 战役内命中/回避 ×1.05（独立乘区 _histHit，
 *   与索敌/触接相乘）；不匹配 → 照常作战，结算只陈述「编成与史实不符」。
 *   禁入舰种在场 → 加成为 0，且**出击前**面板就已红字提示（Gate 3：操作前知道自己在选什么）。
 *
 * 【数值与结构依据】design/设计卡_历史战役模式.md（用户两轮迭代定稿）
 * ============================================================ */

/* 敌编成模板与 ENEMY_FLEETS 同 schema：{ formation, ships: [DEEP_TEMPLATES key] }
 * 全部复用既有深海模板，不新增数值单位（避免数值通胀）。 */
const HISTORY_BATTLES = [
  {
    id: 'H1', name: '圣克鲁斯海战', date: '1942-10-26', stars: 9,
    admReq: 10,
    /* 军事简报体两段：态势 / 威胁与编成建议（与 maps[].brief 同口径） */
    brief: '圣克鲁斯。1942 年 10 月 26 日，企业与大黄蜂在这片海域迎击翔鹤·瑞鹤机动部队。'
      + '这是航母之间的战斗，胜负只在毫厘。\n'
      + '本战役全程考验制空。A 点与 BOSS 均为航空战节点：没有航空母舰的舰队将暴露在敌机轰炸之下，'
      + '只能以对空炮火被动迎击（单次伤害封顶 60%）。建议编入航母并搭载舰战——史实编成要求 ≥2 艘航母。',
    histRule: {
      require: [{ types: ['CV', 'CVL'], min: 2 }],
      ban: [],
      tip: '1942 年 10 月 26 日，企业与大黄蜂迎击翔鹤·瑞鹤机动部队。'
    },
    /* 匹配时战役内生效（单级、封顶、不做分级）；命中与回避同值 */
    bonus: { hit: 1.05, evd: 1.05 },
    start: 'S', boss: 'X',
    nodes: { S: { x: 0, y: 240 }, A: { x: 320, y: 90 }, X: { x: 640, y: 240 } },
    edges: [['S', 'A'], ['A', 'X']],
    defs: {
      S: { type: 'start' },
      /* A 点：敌编成基准 = 常规 2-3 的 F22 同档（轮形阵，旗舰 ecv1，制空 130） */
      A: { type: 'battle', enemy: 'H1A', mode: 'air' },
      /* BOSS：加强一档（双空母精锐，制空 147） */
      X: { type: 'boss', enemy: 'H1X', mode: 'air' }
    },
    enemies: {
      H1A: { formation: '轮形阵', ships: ['ecv1', 'ecvl1e', 'eca1e', 'edd2e', 'edd2e'] },
      H1X: { formation: '轮形阵', ships: ['ecv1e', 'ecvl1e', 'eca2e', 'eca2e', 'edd3e', 'edd3e'] },
      /* 第二波：翔鹤·瑞鹤残存机动部队（常规 BOSS 同档） */
      H1X2: { formation: '轮形阵', ships: ['ecv1e', 'ecvl1e', 'eca2e', 'edd3e', 'edd3e'] }
    },
    bossDrops: ['southdakota', 'hornet'],
    rewards: {
      /* 层1 首通（一次性） */
      firstClear: { fuel: 800, ammo: 800, steel: 800, baux: 400, screws: 5 },
      /* 层2 史实重演：以史实编成取得 S 胜（一次性）+ 荣誉 */
      histForm: { screws: 3, item: ['dc_team'], honor: 'hist_h1_s' },
      /* 层3 强敌阶首通（一次性）+ 强敌阶荣誉 */
      hard: { firstClear: { screws: 5, devMats: 10 }, honor: 'hist_h1_hard' },
      /* 层5 重复通关：小额资源，随缘，不设周回刷取点（禁止事项 10） */
      repeat: { fuel: 150, ammo: 150, steel: 150, baux: 75 }
    },
    hard: {
      admReq: 15,
      unlock: 'firstClear',
      /* 二波制：key = BOSS 节点 id，value = [第一波敌编成, 第二波敌编成]；
       * [0] 必须与 defs[boss].enemy 一致（simulate.js 有交叉断言） */
      waves: { X: ['H1X', 'H1X2'] },
      waveBanner: '残存的机动部队——她们本该已经撤退。',
      brief: '情报更新：敌军拥有第二梯队。第一波击破后，受损撤离的翔鹤·瑞鹤残存机动部队可能再度压上'
        + '——她们本该已经撤退。\n'
        + '击破第一波后你将被询问「迎击 / 收兵」：迎击则第二波立即发起，'
        + '**残弹、耐久与士气全部继承，不做任何补给**；收兵则按第一波正常结算，零惩罚。'
    }
  },
  {
    id: 'H2', name: '铁底湾 · 第一次瓜达尔卡纳尔海战', date: '1942-11-13', stars: 9,
    admReq: 10,
    brief: '铁底湾。1942 年 11 月 13 日夜，卡拉汉少将的巡洋-驱逐部队在黑暗中撞上比叡的炮战队列'
      + '——一场没有战列舰、没有航空母舰的混战。\n'
      + '本战役全程考验夜战。A 点、W 点之后的 BOSS 均为夜战节点，编成纪律是第一位的：'
      + '史实编成要求 ≥4 艘驱逐舰，且战列舰与航空母舰**禁入**（加成为 0，但照常能打）。'
      + '夜战火力、鱼雷 Cut-in 配装与损伤管理是关键；W 点漩涡会轻扣燃料，编入电探可减半。',
    histRule: {
      require: [{ types: ['DD'], min: 4 }],
      /* 全游戏第一条「禁入型」史实规则：把「堆最强 6 艘」这条路直接封掉 */
      ban: ['BB', 'BBV', 'CV', 'CVL', 'CVB'],
      tip: '卡拉汉少将的巡洋-驱逐部队在夜色中撞上比叡的炮战队列——没有战列舰，没有航空母舰。'
    },
    bonus: { hit: 1.05, evd: 1.05 },
    start: 'S', boss: 'X',
    nodes: { S: { x: 0, y: 240 }, A: { x: 240, y: 90 }, W: { x: 460, y: 300 }, X: { x: 700, y: 150 } },
    edges: [['S', 'A'], ['A', 'W'], ['W', 'X']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'H2A', mode: 'night' },
      W: { type: 'whirlpool', lossBase: 150 },
      X: { type: 'boss', enemy: 'H2X', mode: 'night' }
    },
    enemies: {
      H2A: { formation: '单纵阵', ships: ['ecl1e', 'edd2e', 'edd2e', 'edd3e'] },
      /* BOSS：深海战列级旗舰（战列 + 巡洋 + 驱逐护卫） */
      H2X: { formation: '单纵阵', ships: ['ebb2e', 'eca2e', 'edd3e', 'edd3e', 'ecl2e'] },
      /* 第二波：雾岛炮击队（战列旗舰 + 驱逐护卫）——历史上 11/14 夜真实再临的部队 */
      H2X2: { formation: '单纵阵', ships: ['ebb2e', 'edd3e', 'edd3e', 'ecl2e'] }
    },
    bossDrops: ['sanfrancisco', 'helena'],
    rewards: {
      firstClear: { fuel: 800, ammo: 800, steel: 800, baux: 400, screws: 5 },
      histForm: { screws: 3, item: ['dc_team'], honor: 'hist_h2_iron' },
      hard: { firstClear: { screws: 5, devMats: 10 }, honor: 'hist_h2_hard' },
      repeat: { fuel: 150, ammo: 150, steel: 150, baux: 75 }
    },
    hard: {
      admReq: 15,
      unlock: 'firstClear',
      waves: { X: ['H2X', 'H2X2'] },
      waveBanner: '雾岛炮击队——当夜连续来袭。',
      brief: '情报更新：敌军拥有第二梯队。第一夜战胜利后，雾岛炮击队当夜连续压上'
        + '——历史上 11/14 夜这支部队真的再来过。\n'
        + '击破第一波后你将被询问「迎击 / 收兵」：迎击则第二波立即发起，'
        + '**残弹、耐久与士气全部继承，不做任何补给**；收兵则按第一波正常结算，零惩罚。'
    }
  }
];

const History = (() => {
  /* 敌编成键 → 编成（跨战役扁平索引；键名全局唯一，simulate.js 有唯一性断言） */
  const ENEMY_BY_KEY = (() => {
    const m = {};
    for (const b of HISTORY_BATTLES) for (const k in (b.enemies || {})) m[k] = b.enemies[k];
    return m;
  })();

  function list() { return HISTORY_BATTLES.slice(); }
  function byId(id) { return HISTORY_BATTLES.find(b => b.id === id) || null; }
  function isBattleId(id) { return !!byId(id); }
  /* 敌编成查找（与 ENEMY_FLEETS 同用途；battle.js::enemyAirPower 也走这条） */
  function enemy(key) { return ENEMY_BY_KEY[key] || null; }
  function enemyKeys() { return Object.keys(ENEMY_BY_KEY); }

  /* ============ 史实编成规则判定（**纯函数**，与 checkObjectives 同风格） ============
   * rule = { require: [{ types:[舰种...], min:n }, ...], ban: [舰种...], tip }
   *   - types 内部是「或」：舰种属于该组即计 1
   *   - require 各项之间是「与」：每一组都必须满足
   *   - ban 命中任意一艘 → 直接不匹配（禁入规则优先于一切）
   * 返回结构化结果，UI 直接渲染，不重写判定（禁止在 UI 另写一套算法）。 */
  function matchRule(rule, fleetTypes) {
    const types = (fleetTypes || []).filter(Boolean);
    const reqs = (rule && Array.isArray(rule.require)) ? rule.require : [];
    const bans = (rule && Array.isArray(rule.ban)) ? rule.ban : [];
    const hits = reqs.map(g => {
      const set = Array.isArray(g.types) ? g.types : [];
      const have = types.filter(t => set.includes(t)).length;
      const min = g.min || 1;
      return { types: set, min, have, ok: have >= min };
    });
    const banned = [...new Set(types.filter(t => bans.includes(t)))];
    const banHit = banned.length > 0;
    return {
      ok: !banHit && hits.every(h => h.ok && h.have >= h.min),
      hits,
      banned,
      banHit,
      have: types.length
    };
  }

  /* 规则文本（UI 显示用；舰种名走全局 SHIP_TYPE_ZH，不硬编码中文） */
  const typeZh = t => (typeof SHIP_TYPE_ZH !== 'undefined' && SHIP_TYPE_ZH[t]) || t;
  function ruleText(rule) {
    if (!rule) return '';
    const parts = [];
    for (const g of (rule.require || [])) {
      parts.push(`编成含 ≥${g.min || 1} 艘${(g.types || []).map(typeZh).join('/')}`);
    }
    if ((rule.ban || []).length) parts.push(`禁入：${rule.ban.map(typeZh).join('、')}`);
    return parts.join('；');
  }
  /* 单条规则的可核对提示（出击前自检，逐条列出 — 玩家自己能算） */
  function ruleCheck(rule, fleetTypes) {
    const m = matchRule(rule, fleetTypes);
    const rows = m.hits.map(h => ({
      text: `≥${h.min} 艘${h.types.map(typeZh).join('/')}`,
      now: `当前 ${h.have} 艘`,
      ok: h.ok
    }));
    if ((rule && rule.ban || []).length) {
      rows.push({
        text: `禁入 ${rule.ban.map(typeZh).join('、')}`,
        now: m.banHit ? `编成中有 ${m.banned.map(typeZh).join('、')}` : '未出现禁入舰种',
        ok: !m.banHit
      });
    }
    return { ok: m.ok, rows, banned: m.banned, banHit: m.banHit };
  }

  /* 强敌阶二波制：取 BOSS 节点第二波敌编成键（无则 null） */
  function wavesFor(battle, nodeId) {
    const w = battle && battle.hard && battle.hard.waves;
    const arr = w && w[nodeId];
    return Array.isArray(arr) && arr.length > 1 ? arr[1] : null;
  }
  /* 全部二波模板键（供数据完整性断言） */
  function waveEnemyKeys() {
    const out = [];
    for (const b of HISTORY_BATTLES) {
      const w = (b.hard && b.hard.waves) || {};
      for (const node in w) for (const k of w[node]) if (!out.includes(k)) out.push(k);
    }
    return out;
  }
  /* 战役实际用到的节点 mode（含 type:'whirlpool'）—— 供文案覆盖度断言使用 */
  function usedNodeModes() {
    const s = new Set();
    for (const b of HISTORY_BATTLES) for (const d of Object.values(b.defs || {})) {
      if (d.mode) s.add(d.mode);
      if (d.type === 'whirlpool') s.add('whirlpool');
    }
    return [...s];
  }

  return {
    list, byId, isBattleId, enemy, enemyKeys, ENEMY_BY_KEY,
    matchRule, ruleText, ruleCheck, wavesFor, waveEnemyKeys, usedNodeModes
  };
})();

if (typeof window !== 'undefined') window.History = History;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HISTORY_BATTLES, History };
}
