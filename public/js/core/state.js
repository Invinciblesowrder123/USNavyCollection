'use strict';
/* ============================================================
 * 游戏存档状态管理
 * 资源自然恢复（参照 kcwiki「资源」条目）：
 *   原版每3分钟 燃料/弹药/钢材+3、铝土+1，上限=(司令部等级+3)×250
 *   本作按 6 倍时间压缩：每30秒 +3/+3/+3/+1（油弹钢/铝），离线补算
 * 测试模式（管理员专属，顶栏按钮切换，独立于存档存储）：
 *   无限资源 / 瞬间建造完成 / 瞬间入渠完成
 * ============================================================ */

const Game = (() => {
  const SAVE_KEY = 'usnc_save_v1';
  const DEBUG_KEY = 'usnc_debug_v1';
  const REGEN_MS = 30000;
  const REGEN = { fuel: 3, ammo: 3, steel: 3, baux: 1 };
  const INFINITE_RES = 999999;   // 测试模式资源显示值
  const SCREW_CAP = 3000;

  /* ---- 测试模式（不写入游戏存档） ---- */
  let debug = { testMode: false };
  /* 测试模式为管理员（role=admin）专属功能 */
  function isAdminAccount() {
    try {
      return typeof Account !== 'undefined' && Account.isAdmin && Account.isAdmin();
    } catch (e) { return false; }
  }
  function loadDebug() {
    try {
      const raw = localStorage.getItem(DEBUG_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        /* 兼容旧键名 infiniteRes → testMode */
        debug.testMode = d.testMode === true || d.infiniteRes === true;
      }
    } catch (e) { debug.testMode = false; }
  }
  function saveDebug() {
    try { localStorage.setItem(DEBUG_KEY, JSON.stringify(debug)); } catch (e) { /* ignore */ }
  }
  function setTestMode(on) {
    if (on && !isAdminAccount()) { debug.testMode = false; return; }
    debug.testMode = !!on; saveDebug();
  }
  function isTestMode() { return debug.testMode && isAdminAccount(); }

  let uidSeq = 1;

  const state = {
    version: 1,
    admiral: { name: '提督', level: 1, exp: 0 },
    resources: { fuel: 1000, ammo: 1000, steel: 1000, baux: 500, screws: 0, devMats: 10 },  // screws=改修资材（上限3000）, devMats=开发资材（上限3000）
    fleet: { 1: [], 2: [] },           // 舰队1=出击主力(6)，舰队2=远征用(6)
    ships: {},                          // uid -> shipInstance
    equipment: {},                      // uid -> equipInstance {uid,id,star}
    construction: [],                   // {start,end,recipe} 建造队列
    development: [],                    // {start,end,recipe} 开发队列
    repairs: [null, null],              // 入渠槽位 {ship,start,end}
    expeditions: { 1: null, 2: null },  // 舰队编号 -> {exId,start,end}
    quests: {},                         // qid -> {progress, claimed}
    mapProgress: {},                    // mapId -> {gauge, cleared, kills}
    sortie: null,                       // {mapId, fleetIdx, node, path[]}
    practice: { date: '', fleets: [] },
    improve: { date: '', count: 0 },    // 改修工厂每日次数
    stats: { sink: 0, sortie: 0, win: 0, sWin: 0, expedition: 0, build: 0, develop: 0, repair: 0, modernize: 0, remodel: 0, practice: 0, bossSWin: {} },
    lastSave: Date.now()
  };

  /* ============ 等级 ============
   * 提督经验曲线（参照 kcwiki「司令部等级提升所需经验」）：
   *   Lv1~99 与舰娘经验表一致（Lv99 累计 100万）；之后 100~120 累计至 1500万
   *   100:+30万 101:+30万 102:+30万 103:+30万 104:+40万 105:+40万 106:+50万 107:+50万
   *   108:+60万 109:+60万 110:+70万 111:+70万 112:+80万 113:+80万 114:+90万 115:+90万
   *   116~120 各+100万（116:1100万 117:1200万 118:1300万 119:1400万 120:1500万） */
  const HQ_CUM = (() => {
    const c = new Array(121).fill(0);
    let sum = 0;
    for (let lv = 2; lv <= 99; lv++) {          /* 1~99 与舰娘经验表一致 */
      sum += lv <= 51 ? 100 * (lv - 1)
        : lv <= 60 ? 100 * (2 * lv - 52)
        : lv <= 70 ? 300 * lv - 11300
        : lv <= 80 ? 400 * lv - 18400
        : lv <= 90 ? 500 * lv - 26500
        : ({ 91: 19000, 92: 20000, 93: 22000, 94: 25000, 95: 30000, 96: 40000, 97: 60000, 98: 90000, 99: 148500 })[lv];
      c[lv] = sum;
    }
    const post = { 100: 1300000, 101: 1600000, 102: 1900000, 103: 2200000, 104: 2600000, 105: 3000000,
      106: 3500000, 107: 4000000, 108: 4600000, 109: 5200000, 110: 5900000, 111: 6600000, 112: 7400000,
      113: 8200000, 114: 9100000, 115: 10000000, 116: 11000000, 117: 12000000, 118: 13000000,
      119: 14000000, 120: 15000000 };
    for (const lv in post) c[lv] = post[lv];
    return c;
  })();
  const ADMIRAL_MAX_LV = 120;
  function expForLevel(level) {
    if (level < 1 || level >= ADMIRAL_MAX_LV) return 0;
    return HQ_CUM[level + 1] - HQ_CUM[level];
  }
  function addAdmiralExp(exp) {
    state.admiral.exp += exp;
    while (state.admiral.level < ADMIRAL_MAX_LV && state.admiral.exp >= expForLevel(state.admiral.level)) {
      state.admiral.exp -= expForLevel(state.admiral.level);
      state.admiral.level++;
    }
  }
  /* 提督头衔（参照 kcwiki「提督的头衔」，共十阶；本作按司令部等级划分）
   * 元帅 > 大将 > 中将 > 少将 > 大佐 > 中佐 > 新米中佐 > 少佐 > 中坚少佐 > 新米少佐 */
  function admiralTitle(level) {
    if (level >= 115) return '元帅';
    if (level >= 105) return '大将';
    if (level >= 95) return '中将';
    if (level >= 85) return '少将';
    if (level >= 75) return '大佐';
    if (level >= 65) return '中佐';
    if (level >= 55) return '新米中佐';
    if (level >= 45) return '少佐';
    if (level >= 35) return '中坚少佐';
    return '新米少佐';
  }
  function resourceCap() { return 250 * (state.admiral.level + 3); }  // wiki: (司令部等级+3)×250

  /* ============ 资源恢复 ============ */
  function regen(now) {
    now = now || Date.now();
    /* 测试模式：无限资源（每秒时钟兜底，修复所有直接改动的资源） */
    if (debug.testMode) {
      state.resources.fuel = state.resources.ammo = state.resources.steel = state.resources.baux = INFINITE_RES;
      state.resources.screws = SCREW_CAP;
      state.resources.devMats = 3000;
      state.lastSave = now;
      return;
    }
    const elapsed = Math.max(0, now - state.lastSave);
    const ticks = Math.floor(elapsed / REGEN_MS);
    if (ticks > 0) {
      const cap = resourceCap();
      state.resources.fuel = Math.min(cap, state.resources.fuel + REGEN.fuel * ticks);
      state.resources.ammo = Math.min(cap, state.resources.ammo + REGEN.ammo * ticks);
      state.resources.steel = Math.min(cap, state.resources.steel + REGEN.steel * ticks);
      state.resources.baux = Math.min(cap, state.resources.baux + REGEN.baux * ticks);
      state.lastSave = state.lastSave + ticks * REGEN_MS;
    }
    /* 母港中疲劳恢复 */
    if (!state.sortie) {
      for (const uid in state.ships) {
        const s = state.ships[uid];
        if (s.morale < 49) s.morale = Math.min(49, s.morale + ticks * 3);
        else if (s.morale < 53) s.morale = 53;
      }
    }
  }
  function canAfford(cost) {
    if (debug.testMode) return true;
    return state.resources.fuel >= (cost.fuel || 0) && state.resources.ammo >= (cost.ammo || 0) &&
      state.resources.steel >= (cost.steel || 0) && state.resources.baux >= (cost.baux || 0);
  }
  function spend(cost) {
    if (debug.testMode) return;  // 测试模式：不扣资源
    state.resources.fuel -= cost.fuel || 0;
    state.resources.ammo -= cost.ammo || 0;
    state.resources.steel -= cost.steel || 0;
    state.resources.baux -= cost.baux || 0;
  }
  function gain(res) {
    state.resources.fuel += res.fuel || 0;
    state.resources.ammo += res.ammo || 0;
    state.resources.steel += res.steel || 0;
    state.resources.baux += res.baux || 0;
    state.resources.screws = Math.min(SCREW_CAP, (state.resources.screws || 0) + (res.screws || 0));
    state.resources.devMats = Math.min(3000, (state.resources.devMats || 0) + (res.devMats || 0));
  }

  /* ============ 舰船实例 ============ */
  function nextUid() { return uidSeq++; }

  function createShip(shipId, lv = 1) {
    const uid = 's' + nextUid();
    const def = ShipData[shipId];
    const st = def.stats;
    state.ships[uid] = {
      uid, id: shipId, kai: 0, lv, exp: 0,
      hp: st[0], morale: 49,
      obtainedAt: Date.now(),        // 获取时间（用于编成列表排序；旧存档无此字段时回退 uid 序号）
      equipped: [],                  // 装备 uid 列表
      modern: { fp: 0, tp: 0, aa: 0, arm: 0, evd: 0, asw: 0, los: 0 },
      supply: { fuel: 1, ammo: 1 },  // 0~1 补给比例
      locked: false
    };
    if (typeof Progression !== 'undefined') {
      const t = def.type;
      if (t === 'DD' || t === 'DE') Progression.notify('get_type', 1, 'DD');
      else if (t === 'CL' || t === 'CA' || t === 'CLT' || t === 'CAV') Progression.notify('get_type', 1, 'CLCA');
      else if (t === 'CV' || t === 'CVL' || t === 'CVB') Progression.notify('get_type', 1, 'CV');
      else if (t === 'AS') Progression.notify('get_type', 1, 'AS');
    }
    return state.ships[uid];
  }

  function createEquip(equipId) {
    const uid = 'e' + nextUid();
    state.equipment[uid] = { uid, id: equipId, star: 0 };
    return state.equipment[uid];
  }

  function destroyShip(uid) {
    const s = state.ships[uid];
    if (!s) return;
    for (const e of s.equipped) if (state.equipment[e]) delete state.equipment[e];
    for (const f in state.fleet) state.fleet[f] = state.fleet[f].filter(x => x !== uid);
    for (let i = 0; i < state.repairs.length; i++) {
      if (state.repairs[i] && state.repairs[i].ship === uid) state.repairs[i] = null;
    }
    delete state.ships[uid];
  }

  function destroyEquip(uid) {
    delete state.equipment[uid];
  }

  /* 当前形态定义（含改造形态） */
  function shipDef(inst) {
    let d = ShipData[inst.id];
    if (inst.kai >= 1 && d.kai) d = { ...d, ...d.kai };
    if (inst.kai >= 2 && d.kai2) d = { ...d, ...d.kai2 };
    return d;
  }

  const STAT_NAMES = ['hp', 'fp', 'tp', 'aa', 'arm', 'evd', 'asw', 'los', 'lck'];

  /* 等级成长：lv99 时基础属性 +55%（hp +15%）；婚后等级（100+）面板成长极小，封顶于 Lv99 档 */
  function levelBonus(def, stat, lv) {
    const base = def.stats[STAT_NAMES.indexOf(stat)];
    const c = Math.min(lv, 99);
    if (stat === 'hp') return Math.floor(base * 0.15 * (c - 1) / 98);
    return Math.floor(base * 0.55 * (c - 1) / 98);
  }

  /* 改修效果：改修强化值 = 类别系数 × √★（参照 wiki「明石的改修工厂」，简化实现）
   * 大口径主炮昼战1.5 / 鱼雷1.2 / 其余1.0；舰战·舰攻按 ★×0.2 加算
   * 电探→索敌、水侦→索敌、声呐/爆雷→对潜 */
  function equipStarBonus(ed, star) {
    if (!star) return null;
    const s = Math.sqrt(star);
    const out = {};
    switch (ed.cat) {
      case '小主炮': case '中主炮': case '副炮': case '穿甲弹': case '设备':
        out.fp = s; break;
      case '大主炮': out.fp = 1.5 * s; break;
      case '鱼雷': out.tp = 1.2 * s; break;
      case '机枪': out.aa = 3 * s; out.tp = 1.2 * s; break;
      case '高角炮': out.aa = 2 * s; break;
      case '声呐': case '爆雷': out.asw = s; break;
      case '对空电探': case '对水电探': out.los = 1.25 * s; break;
      case '水侦': case '水爆': out.los = 1.2 * s; break;
      case '舰战': out.aa = 0.2 * star; break;
      case '舰攻': out.tp = 0.2 * star; out.bmb = 0.2 * star; break;
      default: return null;
    }
    return out;
  }

  /* 舰船最终面板属性 */
  function shipStats(uid) {
    const inst = state.ships[uid];
    const def = shipDef(inst);
    const out = {};
    for (let i = 0; i < STAT_NAMES.length; i++) {
      const name = STAT_NAMES[i];
      out[name] = def.stats[i] + levelBonus(def, name, inst.lv) + (inst.modern[name] || 0);
    }
    /* 装备加成（含改修★效果） */
    for (const euid of inst.equipped) {
      const eq = state.equipment[euid];
      if (!eq) continue;
      const ed = EquipmentData[eq.id];
      if (!ed) continue;
      for (const k in ed.stat) out[k] = (out[k] || 0) + ed.stat[k];
      const sb = equipStarBonus(ed, eq.star || 0);
      if (sb) for (const k in sb) out[k] = (out[k] || 0) + sb[k];
    }
    out.hpMax = out.hp;
    out.hp = Math.min(out.hpMax, inst.hp);
    return out;
  }

  /* 舰队中是否已有同名舰船（按原始舰种 id 判断，含改造前后） */
  function fleetHasName(fleetIdx, shipId) {
    return (state.fleet[fleetIdx] || []).some(uid => state.ships[uid] && state.ships[uid].id === shipId);
  }

  /* 舰船总索敌（素索敌+装备索敌） */
  function shipLos(uid) { return shipStats(uid).los; }
  function fleetLos(fleetIdx) {
    let sum = 0;
    for (const uid of state.fleet[fleetIdx] || []) if (state.ships[uid]) sum += shipLos(uid);
    return sum;
  }

  /* ============ 初始化 ============ */
  function newGame() {
    uidSeq = 1;
    state.admiral = { name: '提督', level: 1, exp: 0 };
    state.resources = { fuel: 1000, ammo: 1000, steel: 1000, baux: 500, screws: 0, devMats: 10 };
    state.fleet = { 1: [], 2: [] };
    state.ships = {};
    state.equipment = {};
    state.construction = [];
    state.development = [];
    state.repairs = [null, null];
    state.expeditions = { 1: null, 2: null };
    state.quests = {};
    state.mapProgress = {};
    state.sortie = null;
    state.practice = { date: '', fleets: [] };
    state.improve = { date: '', count: 0 };
    state.stats = { sink: 0, sortie: 0, win: 0, sWin: 0, expedition: 0, build: 0, develop: 0, repair: 0, modernize: 0, remodel: 0, practice: 0, bossSWin: {} };
    state.lastSave = Date.now();
    for (const sid of STARTER_IDS) {
      const s = createShip(sid, 10);
      state.fleet[1].push(s.uid);
      equipDefaults(s.uid);
    }
    /* 初始装备库存：若干基础装备 */
    const starterEq = ['gun5in_30', 'gun5in_30', 'sec5in_1', 'aa_20mm', 'aa_20mm', 'torp_mk15'];
    for (const id of starterEq) createEquip(id);
    for (const m of MAPS) {
      state.mapProgress[m.id] = { gauge: m.gauge, cleared: false, kills: 0 };
    }
    save();
  }

  /* 为舰船装备默认装备 */
  function equipDefaults(uid) {
    const inst = state.ships[uid];
    const def = shipDef(inst);
    const slots = def.slots;
    for (let i = 0; i < (def.equip || []).length && i < slots.length; i++) {
      const e = createEquip(def.equip[i]);
      inst.equipped.push(e.uid);
    }
  }

  /* ============ 存档 ============ */
  let saveHook = null;   // 账号模式：保存时同步服务器（由 main.js 注入）
  function setSaveHook(fn) { saveHook = fn; }

  function save() {
    state.lastSave = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (e) { console.warn('本地存档失败', e); }
    if (saveHook) {
      try { saveHook(state); } catch (e) { console.warn('服务器存档失败', e); }
    }
  }

  /* 将存档数据应用到当前状态（含旧档迁移与离线补算） */
  function applySave(data) {
    Object.assign(state, data);
    /* 旧存档迁移 */
    if (typeof state.resources.screws !== 'number') state.resources.screws = 0;
    if (typeof state.resources.devMats !== 'number') state.resources.devMats = 10;
    state.resources.devMats = Math.min(3000, Math.floor(state.resources.devMats));
    for (const k of ['fuel', 'ammo', 'steel', 'baux']) {
      state.resources[k] = Math.floor(state.resources[k]);
    }
    if (!state.improve) state.improve = { date: '', count: 0 };
    /* 旧版开发队列（20秒队列制）已废弃：开发改为即时结算（wiki） */
    if (Array.isArray(state.development) && state.development.length) state.development = [];
    for (const k in state.equipment) {
      if (typeof state.equipment[k].star !== 'number') state.equipment[k].star = 0;
    }
    if (!state.admiral) state.admiral = { name: '提督', level: 1, exp: 0 };
    /* 旧档迁移：提督经验曲线改为 wiki 曲线（旧曲线=每级1000×等级）
     * 旧累计 = 1000×(旧等级-1)×旧等级/2 + 当前经验，映射到新曲线 */
    if (!state.expMigrated && state.admiral && state.admiral.level > 1) {
      const oldLv = Math.min(state.admiral.level, ADMIRAL_MAX_LV);
      let total = 1000 * oldLv * (oldLv - 1) / 2 + (state.admiral.exp || 0);
      let nlv = 1;
      while (nlv < ADMIRAL_MAX_LV && total >= HQ_CUM[nlv + 1]) nlv++;
      state.admiral.level = nlv;
      state.admiral.exp = Math.max(0, total - HQ_CUM[nlv]);
      state.expMigrated = true;
    }
    if (!state.resources) state.resources = { fuel: 1000, ammo: 1000, steel: 1000, baux: 500, screws: 0, devMats: 10 };
    if (!state.fleet || typeof state.fleet !== 'object') state.fleet = { 1: [], 2: [] };
    if (!Array.isArray(state.fleet[1])) state.fleet[1] = [];
    if (!Array.isArray(state.fleet[2])) state.fleet[2] = [];
    /* 破损存档修复：补全所有海域进度（缺失 → 出击页无法渲染海域列表） */
    if (!state.mapProgress || typeof state.mapProgress !== 'object') state.mapProgress = {};
    for (const m of MAPS) {
      if (!state.mapProgress[m.id]) state.mapProgress[m.id] = { gauge: m.gauge, cleared: false, kills: 0 };
    }
    /* 破损存档修复：无任何舰船 → 补发初始舰队（马汉/本森）与初始装备 */
    if (Object.keys(state.ships || {}).length === 0) {
      const starterEq = ['gun5in_30', 'gun5in_30', 'sec5in_1', 'aa_20mm', 'aa_20mm', 'torp_mk15'];
      for (const id of starterEq) createEquip(id);
      for (const sid of STARTER_IDS) {
        const s = createShip(sid, 10);
        state.fleet[1].push(s.uid);
        equipDefaults(s.uid);
      }
    }
    uidSeq = 1;
    /* 破损存档修复：历史版本入手舰船未发放默认装备（空槽无搭载）→ 补发一次（迁移后不再重复） */
    if (state.migratedStock !== true) {
      for (const k in state.ships) {
        const s = state.ships[k];
        if (s && Array.isArray(s.equipped) && s.equipped.length === 0) equipDefaults(s.uid);
      }
      state.migratedStock = true;
    }
    for (const k in state.ships) {
      const n = parseInt(k.slice(1), 10);
      if (n >= uidSeq) uidSeq = n + 1;
    }
    for (const k in state.equipment) {
      const n = parseInt(k.slice(1), 10);
      if (n >= uidSeq) uidSeq = n + 1;
    }
    regen(Date.now());
  }

  function load() {
    loadDebug();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) { newGame(); return false; }
      applySave(JSON.parse(raw));
      return true;
    } catch (e) {
      console.error('读档失败，重建存档', e);
      newGame();
      return false;
    }
  }

  /* 载入服务器存档（账号模式） */
  function loadData(data) {
    if (!data) return false;
    try {
      applySave(JSON.parse(JSON.stringify(data)));
      return true;
    } catch (e) {
      console.error('服务器存档解析失败，重建存档', e);
      newGame();
      return false;
    }
  }

  /* 当前状态的深拷贝（用于上传服务器） */
  function serialize() {
    return JSON.parse(JSON.stringify(state));
  }

  /* ============ 通用检查/完成处理 ============ */
  function finishTimers(now) {
    /* 建造/开发：完成后保留在队列中，由玩家点击领取（Factory.claimBuild/claimDevelop） */
    /* 入渠完成：自动修复 */
    for (let i = 0; i < state.repairs.length; i++) {
      const r = state.repairs[i];
      if (r && now >= r.end) {
        const s = state.ships[r.ship];
        if (s) { s.hp = shipStats(s.uid).hpMax; state.stats.repair++; }
        state.repairs[i] = null;
      }
    }
  }

  return {
    state, save, load, loadData, serialize, setSaveHook, newGame, regen, canAfford, spend, gain,
    createShip, createEquip, destroyShip, destroyEquip, equipDefaults,
    shipDef, shipStats, fleetLos, fleetHasName, addAdmiralExp, resourceCap,
    expForLevel, admiralTitle, finishTimers, nextUid, STAT_NAMES,
    setTestMode, isTestMode
  };
})();

if (typeof window !== 'undefined') window.Game = Game;
if (typeof module !== 'undefined' && module.exports) module.exports = { Game };
