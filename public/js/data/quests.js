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
  { id: 'd6', type: 'daily', name: '装备开发3次', desc: '进行3次装备开发（失败也计入）。',
    cond: { kind: 'develop', count: 3 }, reward: { devMats: 1 } },
  { id: 'd7', type: 'daily', name: '维修作业', desc: '在入渠中修理1艘舰娘。',
    cond: { kind: 'repair', count: 1 }, reward: { fuel: 60 } },
  { id: 'd8', type: 'daily', name: '击沉10艘', desc: '击沉10艘深海军舰艇。',
    cond: { kind: 'sink', count: 10 }, reward: { ammo: 150 } },
  { id: 'd9', type: 'daily', name: '装备的改修强化', desc: '在改修工厂进行1次装备改修。',
    cond: { kind: 'improve', count: 1 }, reward: { screws: 1, ammo: 50 } },

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
    cond: { kind: 'practice', count: 5 }, reward: { baux: 150, devMats: 3, equip: ['radar_sg'] } },
  { id: 'w6', type: 'weekly', name: '所罗门制海权', desc: '通关 1-2 所罗门哨戒。',
    cond: { kind: 'clear_map', param: '1-2', count: 1 }, reward: { fuel: 400, steel: 300, equip: ['aa_40mm'] } },
  { id: 'w7', type: 'weekly', name: '改修工厂作业', desc: '在改修工厂进行5次装备改修。',
    cond: { kind: 'improve', count: 5 }, reward: { screws: 3, steel: 200 } },
  { id: 'w8', type: 'weekly', name: '圣克鲁斯制海权', desc: '通关 2-3 圣克鲁斯海域。',
    cond: { kind: 'clear_map', param: '2-3', count: 1 }, reward: { fuel: 600, steel: 400, equip: ['radar_mk22'] } },
  { id: 'w9', type: 'weekly', name: '北方海域警戒', desc: '通关 3-2 基斯卡岛近海。',
    cond: { kind: 'clear_map', param: '3-2', count: 1 }, reward: { ammo: 500, baux: 300, screws: 3 } },
  { id: 'w10', type: 'weekly', name: '中太平洋哨戒', desc: '通关 4-1 马绍尔群岛近海。',
    cond: { kind: 'clear_map', param: '4-1', count: 1 }, reward: { fuel: 700, steel: 500, equip: ['radar_mk37'] } },
  { id: 'w11', type: 'weekly', name: '莱特湾警戒', desc: '通关 5-2 苏里高海峡。',
    cond: { kind: 'clear_map', param: '5-2', count: 1 }, reward: { ammo: 600, baux: 400, screws: 4 } },

  /* ---------------- 月常 ---------------- */
  { id: 'm1', type: 'monthly', name: '远征30次', desc: '完成30次远征任务。',
    cond: { kind: 'expedition', count: 30 }, reward: { baux: 500, fuel: 500, devMats: 5 } },
  { id: 'm2', type: 'monthly', name: '击沉100艘', desc: '击沉100艘深海军舰艇。',
    cond: { kind: 'sink', count: 100 }, reward: { ammo: 600, steel: 600, devMats: 8, equip: ['ap_mk8'] } },
  { id: 'm3', type: 'monthly', name: '月间改修任务', desc: '在改修工厂进行10次装备改修。',
    cond: { kind: 'improve', count: 10 }, reward: { screws: 5, baux: 200 } },
  { id: 'm4', type: 'monthly', name: '北方决战', desc: '通关 3-4 基斯卡攻略战。',
    cond: { kind: 'clear_map', param: '3-4', count: 1 }, reward: { devMats: 10, steel: 800, baux: 500, equip: ['torp_mk15r'] } },
  { id: 'm5', type: 'monthly', name: '中部海域制压', desc: '通关 4-5 硫磺岛近海。',
    cond: { kind: 'clear_map', param: '4-5', count: 1 }, reward: { devMats: 15, fuel: 1000, steel: 1000, screws: 8 } },
  { id: 'm6', type: 'monthly', name: '南方海域决战', desc: '通关 5-5 莱特湾决战。',
    cond: { kind: 'clear_map', param: '5-5', count: 1 }, reward: { devMats: 20, ammo: 1200, baux: 800, screws: 12 } },

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
    cond: { kind: 'boss_s_win', param: '1-3', count: 1 }, reward: { ship: ['missouri'] } },
  { id: 'o15', type: 'once', name: '改修工厂开启！', desc: '获得工作舰维斯塔尔（任务「舰队之母」奖励）。',
    cond: { kind: 'get_type', param: 'AS', count: 1 }, reward: { screws: 10, fuel: 300 } },
  { id: 'o16', type: 'once', name: '狙击开发', desc: '开发成功1次装备（高资源配方提高成功率）。',
    cond: { kind: 'develop_success', count: 1 }, reward: { devMats: 5, baux: 200 } },
  { id: 'o17', type: 'once', name: '防卫线突破', desc: '击破 1-4 欧胡岛防卫线的海域血条。',
    cond: { kind: 'clear_map', param: '1-4', count: 1 }, reward: { equip: ['radar_sg'], fuel: 400 } },
  { id: 'o18', type: 'once', name: '所罗门桥头堡', desc: '击破 2-1 图拉吉急袭的海域血条。',
    cond: { kind: 'clear_map', param: '2-1', count: 1 }, reward: { equip: ['searchlight'], ammo: 300 } },
  { id: 'o19', type: 'once', name: '潜水栖姬讨伐', desc: '在 2-2 取得对深海潜水栖姬的S胜利。',
    cond: { kind: 'boss_s_win', param: '2-2', count: 1 }, reward: { equip: ['sonar_qc'], steel: 300 } },
  { id: 'o20', type: 'once', name: '圣克鲁斯哨戒', desc: '击破 2-3 圣克鲁斯海域的海域血条。',
    cond: { kind: 'clear_map', param: '2-3', count: 1 }, reward: { ship: ['reno'], baux: 400 } },
  { id: 'o21', type: 'once', name: '飞行场栖姬讨伐', desc: '在 2-4 取得对深海飞行场栖姬的S胜利。',
    cond: { kind: 'boss_s_win', param: '2-4', count: 1 }, reward: { equip: ['f6f'], baux: 800 } },
  { id: 'o22', type: 'once', name: '北大平洋进击', desc: '击破 3-1 北大平洋哨戒的海域血条。',
    cond: { kind: 'clear_map', param: '3-1', count: 1 }, reward: { ship: ['westvirginia'], fuel: 600 } },
  { id: 'o23', type: 'once', name: '基斯卡收容作战', desc: '击破 3-2 基斯卡岛近海的海域血条。',
    cond: { kind: 'clear_map', param: '3-2', count: 1 }, reward: { screws: 15, ammo: 500 } },
  { id: 'o24', type: 'once', name: '阿图岛防卫线', desc: '击破 3-3 阿图岛方向的海域血条。',
    cond: { kind: 'clear_map', param: '3-3', count: 1 }, reward: { ship: ['northcarolina'], steel: 800 } },
  { id: 'o25', type: 'once', name: '北方栖姬讨伐', desc: '击破 3-4 基斯卡攻略战的海域血条。',
    cond: { kind: 'clear_map', param: '3-4', count: 1 }, reward: { ship: ['saratoga'], screws: 20 } },

  /* ---------------- 一次性（舰队解锁链） ---------------- */
  { id: 'o26', type: 'once', name: '第三舰队，拔锚！', desc: '完成1次远征任务，扩充舰队编制。',
    cond: { kind: 'expedition', count: 1 }, reward: { unlockFleet: 3, fuel: 300, ammo: 300 } },
  { id: 'o27', type: 'once', name: '第四舰队，出航！', desc: '击破 2-1 图拉吉急袭的海域血条，获得新编队的资格。',
    cond: { kind: 'clear_map', param: '2-1', count: 1 }, reward: { unlockFleet: 4, steel: 400, baux: 400 } },

  /* ---------------- 一次性（BOSS海域 / 后期主线链） ---------------- */
  { id: 'o28', type: 'once', name: '近海清剿', desc: '击破 1-5 夏威夷近海哨戒的海域血条。',
    cond: { kind: 'clear_map', param: '1-5', count: 1 }, reward: { screws: 20, baux: 500 } },
  { id: 'o29', type: 'once', name: '萨沃岛制空权', desc: '击破 2-5 萨沃岛近海的海域血条。',
    cond: { kind: 'clear_map', param: '2-5', count: 1 }, reward: { equip: ['f4u'], baux: 800 } },
  { id: 'o30', type: 'once', name: '阿留申肃清', desc: '击破 3-5 阿留申海域决战的海域血条。',
    cond: { kind: 'clear_map', param: '3-5', count: 1 }, reward: { ship: ['indiana'], screws: 25 } },
  { id: 'o31', type: 'once', name: '中太平洋出击', desc: '击破 4-1 马绍尔群岛近海的海域血条。',
    cond: { kind: 'clear_map', param: '4-1', count: 1 }, reward: { equip: ['radar_fc37'], fuel: 800 } },
  { id: 'o32', type: 'once', name: '折钵山栖姬讨伐', desc: '在 4-5 取得对深海折钵山栖姬的S胜利。',
    cond: { kind: 'boss_s_win', param: '4-5', count: 1 }, reward: { ship: ['washington'], screws: 30 } },
  { id: 'o33', type: 'once', name: '菲律宾前哨', desc: '击破 5-1 莱特湾前哨的海域血条。',
    cond: { kind: 'clear_map', param: '5-1', count: 1 }, reward: { equip: ['sb2c'], baux: 1000 } },
  { id: 'o34', type: 'once', name: '大和栖姬讨伐', desc: '击破 5-5 莱特湾决战的海域血条，终结深海的野心！',
    cond: { kind: 'clear_map', param: '5-5', count: 1 }, reward: { ship: ['iowa'], screws: 40, fuel: 2000 } }
];

/* 领取奖励时合并（资源部分） */
function addQuestReward(state, q) {
  const r = q.reward || {};
  if (r.fuel) state.resources.fuel += r.fuel;
  if (r.ammo) state.resources.ammo += r.ammo;
  if (r.steel) state.resources.steel += r.steel;
  if (r.baux) state.resources.baux += r.baux;
  if (r.screws) state.resources.screws = Math.min(3000, (state.resources.screws || 0) + r.screws);
  if (r.devMats) state.resources.devMats = Math.min(3000, (state.resources.devMats || 0) + r.devMats);
  return r;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { QUESTS, addQuestReward };
}
