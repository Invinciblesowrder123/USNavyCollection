'use strict';
/* ============================================================
 * 游戏存档状态管理
 * 资源自然恢复：每30秒 +2/+2/+2/+1（油弹钢/铝），离线补算
 * ============================================================ */

const Game = (() => {
  const SAVE_KEY = 'usnc_save_v1';
  const REGEN_MS = 30000;
  const REGEN = { fuel: 2, ammo: 2, steel: 2, baux: 1 };

  let uidSeq = 1;

  const state = {
    version: 1,
    admiral: { name: '提督', level: 1, exp: 0 },
    resources: { fuel: 1000, ammo: 1000, steel: 1000, baux: 500 },
    fleet: { 1: [], 2: [] },           // 舰队1=出击主力(6)，舰队2=远征用(6)
    ships: {},                          // uid -> shipInstance
    equipment: {},                      // uid -> equipInstance
    construction: [],                   // {start,end,recipe} 建造队列
    development: [],                    // {start,end,recipe} 开发队列
    repairs: [null, null],              // 入渠槽位 {ship,start,end}
    expeditions: { 1: null, 2: null },  // 舰队编号 -> {exId,start,end}
    quests: {},                         // qid -> {progress, claimed}
    mapProgress: {},                    // mapId -> {gauge, cleared, kills}
    sortie: null,                       // {mapId, fleetIdx, node, path[]}
    practice: { date: '', fleets: [] },
    stats: { sink: 0, sortie: 0, win: 0, sWin: 0, expedition: 0, build: 0, develop: 0, repair: 0, modernize: 0, remodel: 0, practice: 0, bossSWin: {} },
    lastSave: Date.now()
  };

  /* ============ 等级 ============ */
  const EXP_PER_LV = 1000;              // 每级所需经验 = EXP_PER_LV * level
  function expForLevel(level) { return EXP_PER_LV * level; }
  function addAdmiralExp(exp) {
    state.admiral.exp += exp;
    while (state.admiral.level < 120 && state.admiral.exp >= expForLevel(state.admiral.level)) {
      state.admiral.exp -= expForLevel(state.admiral.level);
      state.admiral.level++;
    }
  }
  function resourceCap() { return 2000 + 250 * (state.admiral.level - 1); }

  /* ============ 资源恢复 ============ */
  function regen(now) {
    const elapsed = Math.max(0, (now || Date.now()) - state.lastSave);
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
    return state.resources.fuel >= cost.fuel && state.resources.ammo >= cost.ammo &&
      state.resources.steel >= cost.steel && state.resources.baux >= cost.baux;
  }
  function spend(cost) {
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
    }
    return state.ships[uid];
  }

  function createEquip(equipId) {
    const uid = 'e' + nextUid();
    state.equipment[uid] = { uid, id: equipId };
    return state.equipment[uid];
  }

  function destroyShip(uid) {
    const s = state.ships[uid];
    if (!s) return;
    for (const e of s.equipped) if (state.equipment[e]) delete state.equipment[e];
    for (const f in state.fleet) state.fleet[f] = state.fleet[f].filter(x => x !== uid);
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

  /* 等级成长：lv99 时基础属性 +55%（hp +15%） */
  function levelBonus(def, stat, lv) {
    const base = def.stats[STAT_NAMES.indexOf(stat)];
    if (stat === 'hp') return Math.floor(base * 0.15 * (lv - 1) / 98);
    return Math.floor(base * 0.55 * (lv - 1) / 98);
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
    /* 装备加成 */
    for (const euid of inst.equipped) {
      const eq = state.equipment[euid];
      if (!eq) continue;
      const ed = EquipmentData[eq.id];
      if (!ed) continue;
      for (const k in ed.stat) out[k] = (out[k] || 0) + ed.stat[k];
    }
    out.hpMax = out.hp;
    out.hp = Math.min(out.hpMax, inst.hp);
    return out;
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
    state.resources = { fuel: 1000, ammo: 1000, steel: 1000, baux: 500 };
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
  function save() {
    state.lastSave = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (e) { console.warn('存档失败', e); }
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) { newGame(); return false; }
      const data = JSON.parse(raw);
      Object.assign(state, data);
      uidSeq = 1;
      for (const k in state.ships) {
        const n = parseInt(k.slice(1), 10);
        if (n >= uidSeq) uidSeq = n + 1;
      }
      for (const k in state.equipment) {
        const n = parseInt(k.slice(1), 10);
        if (n >= uidSeq) uidSeq = n + 1;
      }
      regen(Date.now());
      return true;
    } catch (e) {
      console.error('读档失败，重建存档', e);
      newGame();
      return false;
    }
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
    state, save, load, newGame, regen, canAfford, spend, gain,
    createShip, createEquip, destroyShip, destroyEquip, equipDefaults,
    shipDef, shipStats, fleetLos, addAdmiralExp, resourceCap,
    expForLevel, finishTimers, nextUid, STAT_NAMES
  };
})();

if (typeof window !== 'undefined') window.Game = Game;
if (typeof module !== 'undefined' && module.exports) module.exports = { Game };
