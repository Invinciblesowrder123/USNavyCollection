'use strict';
/* ============================================================
 * 任务数据
 * type: 每日 daily / 每周 weekly / 每月 monthly / 一次性 once
 * cond 字段: { kind, count, param } 由 game/progression.js 的 QuestTracker 统计
 * reward: { fuel?, ammo?, steel?, baux?, equip?[ids], ship?[ids] }
 * ============================================================ */

const QUESTS = [
  /* ---------------- 日常 ---------------- */
  { id: 'd1', type: 'daily', name: '出击3次！', desc: '出击并完成3次战斗。',
    cond: { kind: 'sortie', count: 3 }, reward: { fuel: 100, steel: 30 } },
  { id: 'd2', type: 'daily', name: '胜利的滋味', desc: '在出击战斗中取得1次胜利。',
    cond: { kind: 'win', count: 1 }, reward: { ammo: 100, baux: 20 } },
  { id: 'd3', type: 'daily', name: '远征2次', desc: '完成2次远征任务。',
    cond: { kind: 'expedition', count: 2 }, reward: { steel: 100 } },
  { id: 'd4', type: 'daily', name: '演习2次', desc: '进行2次演习。',
    cond: { kind: 'practice', count: 2 }, reward: { ammo: 50, baux: 50 } },
  { id: 'd5', type: 'daily', name: '工厂作业', desc: '进行1次舰娘建造。',
    cond: { kind: 'build', count: 1 }, reward: { steel: 80 } },
  { id: 'd6', type: 'daily', name: '装备开发3次', desc: '进行3次装备开发。',
    cond: { kind: 'develop', count: 3 }, reward: { baux: 50 } },
  { id: 'd7', type: 'daily', name: '维修作业', desc: '在入渠中修理1艘舰娘。',
    cond: { kind: 'repair', count: 1 }, reward: { fuel: 60 } },
  { id: 'd8', type: 'daily', name: '击沉10艘', desc: '击沉10艘深海军舰艇。',
    cond: { kind: 'sink', count: 10 }, reward: { ammo: 150 } },

  /* ---------------- 周常 ---------------- */
  { id: 'w1', type: 'weekly', name: '出击15次！', desc: '出击并完成15次战斗。',
    cond: { kind: 'sortie', count: 15 }, reward: { fuel: 300, ammo: 300 } },
  { id: 'w2', type: 'weekly', name: '连胜10场', desc: '在出击中取得10次胜利。',
    cond: { kind: 'win', count: 10 }, reward: { steel: 300 } },
  { id: 'w3', type: 'weekly', name: '远征10次', desc: '完成10次远征任务。',
    cond: { kind: 'expedition', count: 10 }, reward: { baux: 200 } },
  { id: 'w4', type: 'weekly', name: '击沉50艘', desc: '击沉50艘深海军舰艇。',
    cond: { kind: 'sink', count: 50 }, reward: { ammo: 400, steel: 200 } },
  { id: 'w5', type: 'weekly', name: '演习5次', desc: '进行5次演习。',
    cond: { kind: 'practice', count: 5 }, reward: { baux: 150, equip: ['radar_sg'] } },
  { id: 'w6', type: 'weekly', name: '所罗门制海权', desc: '通关 1-2 所罗门哨戒。',
    cond: { kind: 'clear_map', param: '1-2', count: 1 }, reward: { fuel: 400, steel: 300, equip: ['aa_40mm'] } },

  /* ---------------- 月常 ---------------- */
  { id: 'm1', type: 'monthly', name: '远征30次', desc: '完成30次远征任务。',
    cond: { kind: 'expedition', count: 30 }, reward: { baux: 500, fuel: 500 } },
  { id: 'm2', type: 'monthly', name: '击沉100艘', desc: '击沉100艘深海军舰艇。',
    cond: { kind: 'sink', count: 100 }, reward: { ammo: 600, steel: 600, equip: ['ap_mk8'] } },

  /* ---------------- 一次性（新手引导链） ---------------- */
  { id: 'o1', type: 'once', name: '驱逐队的组建', desc: '在编成界面编入1艘驱逐舰。',
    cond: { kind: 'get_type', param: 'DD', count: 1 }, reward: { fuel: 200, ammo: 200 } },
  { id: 'o2', type: 'once', name: '巡洋舰加入', desc: '获得1艘轻巡洋舰或重巡洋舰。',
    cond: { kind: 'get_type', param: 'CLCA', count: 1 }, reward: { steel: 200 } },
  { id: 'o3', type: 'once', name: '编成满编舰队', desc: '编入4艘以上舰娘。',
    cond: { kind: 'fleet_size', param: 4, count: 1 }, reward: { ship: ['sbroberts'] } },
  { id: 'o4', type: 'once', name: '航空战力获得', desc: '获得1艘正规空母或轻空母。',
    cond: { kind: 'get_type', param: 'CV', count: 1 }, reward: { equip: ['f6f'] } },
  { id: 'o5', type: 'once', name: '初战告捷', desc: '击破 1-1 母港近海的海域血条。',
    cond: { kind: 'clear_map', param: '1-1', count: 1 }, reward: { equip: ['dc_mk6'] } },
  { id: 'o6', type: 'once', name: '第一次改造', desc: '对任意舰娘进行改造。',
    cond: { kind: 'remodel', count: 1 }, reward: { equip: ['gun16in_45'] } },
  { id: 'o7', type: 'once', name: '近代化改修', desc: '进行1次近代化改修。',
    cond: { kind: 'modernize', count: 1 }, reward: { equip: ['aa_40mm'] } },
  { id: 'o8', type: 'once', name: '舰载机中队', desc: '为舰队装备总计8架舰载机。',
    cond: { kind: 'plane_count', param: 8, count: 1 }, reward: { equip: ['f4u'] } },
  { id: 'o9', type: 'once', name: '舰队之母', desc: '在入渠中累计修理5艘舰娘。',
    cond: { kind: 'repair', count: 5 }, reward: { ship: ['vestal'] } },
  { id: 'o10', type: 'once', name: '铁底湾的荣誉', desc: '击破 1-2 所罗门哨戒的海域血条。',
    cond: { kind: 'clear_map', param: '1-2', count: 1 }, reward: { equip: ['gun16in_45r'], fuel: 500 } },
  { id: 'o11', type: 'once', name: '战列舰的威光', desc: '将任意战列舰改造至改形态。',
    cond: { kind: 'remodel_bb', count: 1 }, reward: { equip: ['gun16in_50'] } },
  { id: 'o12', type: 'once', name: '决战！珍珠港近海', desc: '击破 1-3 珍珠港近海的海域血条。',
    cond: { kind: 'clear_map', param: '1-3', count: 1 }, reward: { ship: ['juneau'], baux: 600 } },
  { id: 'o13', type: 'once', name: '王牌飞行员', desc: '在一次出击中取得S胜利。',
    cond: { kind: 's_win', count: 1 }, reward: { equip: ['sb2c'] } },
  { id: 'o14', type: 'once', name: '深海空母栖姬讨伐', desc: '在 1-3 取得对深海空母栖姬的S胜利。',
    cond: { kind: 'boss_s_win', param: '1-3', count: 1 }, reward: { ship: ['missouri'] } }
];

/* 领取奖励时合并（资源部分） */
function addQuestReward(state, q) {
  const r = q.reward || {};
  if (r.fuel) state.resources.fuel += r.fuel;
  if (r.ammo) state.resources.ammo += r.ammo;
  if (r.steel) state.resources.steel += r.steel;
  if (r.baux) state.resources.baux += r.baux;
  return r;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { QUESTS, addQuestReward };
}
