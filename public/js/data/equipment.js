'use strict';
/* ============================================================
 * 装备数据（美国海军装备）
 * 字段: id, en, zh, cat, stat{fp,tp,aa,arm,asw,los,evd,bmb,avg},
 *       slot(可装备槽位类型), cost{...}(开发配方,参考), buildable(可否开发), kai(改修上限,>0 可改修)
 *       r(内部稀有度1~4 → 开发等级门槛=稀有度×3, wiki为×10按本作节奏缩放), scrap(解体回收资源 → 开发最低资源要求=×10),
 *       dev(开发条目: 秘书舰系 -> 开发池 -> 出货份额, 每池共50份, 出货率=份额×2%)
 * 秘书舰系（参照 kcwiki「开发」）：炮战系GUN(BB/CA) 水雷系MINE(DD/DE/CL/CLT) 空母系CV(CV/CVL/BBV/CAV/AV) 潜水系SUB(SS/AS)
 * 开发池（最高资源决定，优先级 燃料/钢材 > 弹药 > 铝）：油钢池OIL / 弹药池AMMO / 铝池BAUX
 * ============================================================ */

const SLOT = {
  SMALL_GUN: 1, MED_GUN: 2, BIG_GUN: 3, SECONDARY: 4, TORPEDO: 5,
  FIGHTER: 6, ATTACKER: 7, BOMBER: 8, SEAPLANE: 9, RADAR: 10,
  HAA: 11, MG: 12, SONAR_DC: 13, EQUIP: 14
};

/* 开发池/秘书舰系 常量（供 UI 与引擎使用） */
const DEV_SEC = { GUN: 'GUN', MINE: 'MINE', CV: 'CV', SUB: 'SUB' };
const DEV_POOL = { OIL: 'OIL', AMMO: 'AMMO', BAUX: 'BAUX' };
const DEV_SEC_ZH = { GUN: '炮战系', MINE: '水雷系', CV: '空母系', SUB: '潜水系' };
const DEV_POOL_ZH = { OIL: '油钢池', AMMO: '弹药池', BAUX: '铝池' };
const DEV_SEC_DESC = {
  GUN: '战列舰/重巡洋舰。适合开发大口径主炮、穿甲弹、电探。',
  MINE: '驱逐/海防/轻巡。适合开发鱼雷、声呐、爆雷、小口径主炮。',
  CV: '空母/轻空母/水母。适合开发舰载机、水上机、对空装备。',
  SUB: '潜水舰/工作舰。适合开发潜航鱼雷、声呐、探照灯。'
};

const EQ = [
  /* ---------- 主炮（小） ---------- */
  { id: 'gun5in_30',  en: '5in/38 Single Mount', zh: '5inch单装炮 Mk30', cat: '小主炮', slot: SLOT.SMALL_GUN, stat: { fp: 2, aa: 4, evd: 1 }, cost: [10, 60, 60, 10], buildable: true, kai: 10, r: 2, scrap: { steel: 5, ammo: 3 }, dev: { MINE: { BAUX: 4 }, CV: { AMMO: 2 } } },
  { id: 'gun5in_38',  en: '5in/38 Twin Mount', zh: '5inch连装两用炮 Mk38', cat: '小主炮', slot: SLOT.SMALL_GUN, stat: { fp: 3, aa: 8, evd: 1 }, cost: [10, 90, 90, 20], buildable: true, kai: 10, rare: true, r: 3, scrap: { steel: 6, ammo: 4 }, dev: { MINE: { BAUX: 2 }, CV: { AMMO: 2 } } },
  { id: 'gun5in_54',  en: '5in/54 Mk42', zh: '5inch连装炮 Mk42', cat: '小主炮', slot: SLOT.SMALL_GUN, stat: { fp: 4, aa: 5 }, cost: [10, 110, 100, 20], buildable: true, kai: 10, rare: true, r: 3, scrap: { steel: 8, ammo: 5 } },
  { id: 'gun5in_28',  en: '5in/38 Twin Mk.28 mod.2', zh: '5inch连装炮 Mk.28 mod.2', cat: '小主炮', slot: SLOT.SMALL_GUN, stat: { fp: 3, aa: 6, evd: 1 }, cost: [10, 100, 90, 20], buildable: true, kai: 10, rare: true, r: 3, scrap: { steel: 7, ammo: 4 }, dev: { MINE: { AMMO: 2 }, CV: { AMMO: 2 } } },
  { id: '5in_mk30',   en: '5in/38 Single Mk.30', zh: '5inch单装炮 Mk.30', cat: '小主炮', slot: SLOT.SMALL_GUN, stat: { fp: 2, aa: 3, evd: 1 }, cost: [10, 60, 50, 10], buildable: true, kai: 10, r: 2, scrap: { steel: 4, ammo: 3 }, dev: { MINE: { BAUX: 4, AMMO: 2 }, CV: { AMMO: 2 } } },
  { id: 'gun5in_30r', en: '5in/38 Single Mk.30 Mod', zh: '5inch单装炮 Mk.30改', cat: '小主炮', slot: SLOT.SMALL_GUN, stat: { fp: 3, aa: 5, evd: 1 }, cost: [10, 70, 70, 10], buildable: true, kai: 10, rare: true, r: 2, scrap: { steel: 6, ammo: 3 }, dev: { MINE: { BAUX: 1 }, CV: { AMMO: 2 } } },
  { id: 'gun5in_30r_gfcs', en: '5in/38 Single Mk.30 Mod +GFCS', zh: '5inch单装炮 Mk.30改+GFCS Mk.37', cat: '小主炮', slot: SLOT.SMALL_GUN, stat: { fp: 4, aa: 7, evd: 1, los: 2 }, cost: [10, 90, 90, 30], buildable: false, kai: 10, rare: true, r: 4, scrap: { steel: 8, ammo: 4 }, dev: { MINE: { BAUX: 1 }, CV: { AMMO: 1 } } },
  /* ---------- 主炮（中） ---------- */
  { id: 'gun6in_3',   en: '6in/47 Triple Mk16', zh: '6inch三连装炮 Mk16', cat: '中主炮', slot: SLOT.MED_GUN, stat: { fp: 7 }, cost: [10, 120, 110, 10], buildable: true, kai: 9, r: 2, scrap: { steel: 15, ammo: 15 }, dev: { GUN: { AMMO: 1 }, MINE: { AMMO: 2 } } },
  { id: 'gun6in_3r',  en: '6in/47 Triple Mk16 Mod', zh: '6inch三连装炮 Mk16改', cat: '中主炮', slot: SLOT.MED_GUN, stat: { fp: 9, aa: 2 }, cost: [10, 160, 150, 20], buildable: true, kai: 9, rare: true, r: 3, scrap: { steel: 18, ammo: 18 }, dev: { GUN: { AMMO: 1 } } },
  { id: 'gun6in_3r2', en: '6in/47 Triple Mk16 mod.2', zh: '6inch三连装速射炮 Mk16 mod.2', cat: '中主炮', slot: SLOT.MED_GUN, stat: { fp: 10, aa: 2 }, cost: [10, 180, 170, 20], buildable: false, kai: 9, rare: true, r: 4, scrap: { steel: 20, ammo: 20 }, dev: {} },
  { id: 'gun8in_9',   en: '8in/55 Triple Mk9', zh: '8inch三连装炮 Mk9', cat: '中主炮', slot: SLOT.MED_GUN, stat: { fp: 8 }, cost: [10, 150, 140, 10], buildable: true, kai: 9, r: 3, scrap: { steel: 18, ammo: 16 }, dev: { GUN: { AMMO: 2 } } },
  { id: 'gun8in_9r2', en: '8in/55 Triple Mk9 mod.2', zh: '8inch三连装炮 Mk9 mod.2', cat: '中主炮', slot: SLOT.MED_GUN, stat: { fp: 9 }, cost: [10, 170, 160, 10], buildable: true, kai: 9, rare: true, r: 3, scrap: { steel: 19, ammo: 17 }, dev: { GUN: { AMMO: 2 } } },
  { id: 'gun8in_15',  en: '8in/55 Triple Mk15', zh: '8inch三连装炮 Mk15', cat: '中主炮', slot: SLOT.MED_GUN, stat: { fp: 10, aa: 1 }, cost: [10, 190, 180, 20], buildable: true, kai: 9, rare: true, r: 4, scrap: { steel: 20, ammo: 18 }, dev: { GUN: { AMMO: 1 } } },
  { id: 'gun8in_r',   en: '8in/55 Triple Mk16', zh: '8inch三连装炮 Mk16', cat: '中主炮', slot: SLOT.MED_GUN, stat: { fp: 11 }, cost: [10, 220, 200, 20], buildable: true, kai: 9, rare: true, r: 4, scrap: { steel: 22, ammo: 20 }, dev: { GUN: { AMMO: 1 } } },
  { id: 'gun5in_dp_con', en: '5in/38 Twin DP Concentrated', zh: '5inch连装两用炮(集中配备)', cat: '中主炮', slot: SLOT.MED_GUN, stat: { fp: 3, aa: 7, evd: 1 }, cost: [10, 100, 90, 20], buildable: true, kai: 9, rare: true, r: 3, scrap: { steel: 7, ammo: 4 }, dev: { GUN: { AMMO: 2 }, MINE: { AMMO: 1 } } },
  { id: 'gun5in_dp_gfcs', en: '5in/38 Twin DP +GFCS', zh: '5inch连装两用炮(集中配备)+GFCS Mk.37', cat: '中主炮', slot: SLOT.MED_GUN, stat: { fp: 3, aa: 9, evd: 1, los: 2 }, cost: [10, 120, 100, 30], buildable: false, kai: 9, rare: true, r: 4, scrap: { steel: 9, ammo: 5 }, dev: {} },
  /* ---------- 主炮（大） ---------- */
  { id: 'gun14in_45d', en: '14in/45 Twin', zh: '14inch/45连装炮', cat: '大主炮', slot: SLOT.BIG_GUN, stat: { fp: 12, arm: 1 }, cost: [10, 150, 140, 10], buildable: true, kai: 7, r: 1, scrap: { steel: 14, ammo: 14 }, dev: { GUN: { AMMO: 1 } } },
  { id: 'gun14in_3',  en: '14in/50 Triple', zh: '14inch三连装炮', cat: '大主炮', slot: SLOT.BIG_GUN, stat: { fp: 14, arm: 1 }, cost: [10, 180, 170, 10], buildable: true, kai: 7, r: 2, scrap: { steel: 17, ammo: 18 }, dev: { GUN: { AMMO: 2 } } },
  { id: 'gun16in_45', en: '16in/45 Triple Mk6', zh: '16inch三连装炮 Mk6', cat: '大主炮', slot: SLOT.BIG_GUN, stat: { fp: 16 }, cost: [10, 250, 250, 10], buildable: true, kai: 7, r: 3, scrap: { steel: 25, ammo: 25 }, dev: { GUN: { AMMO: 6, BAUX: 1 } } },
  { id: 'gun16in_45r',en: '16in/45 Triple Mk6 Mod', zh: '16inch三连装炮 Mk6改', cat: '大主炮', slot: SLOT.BIG_GUN, stat: { fp: 18, aa: 1 }, cost: [10, 280, 270, 20], buildable: true, kai: 7, rare: true, r: 4, scrap: { steel: 27, ammo: 27 }, dev: { GUN: { AMMO: 2 } } },
  { id: 'gun16in_mk5', en: '16in/45 Mk.V Twin', zh: '16inch Mk.V连装炮', cat: '大主炮', slot: SLOT.BIG_GUN, stat: { fp: 17, arm: 1 }, cost: [10, 240, 240, 10], buildable: true, kai: 7, rare: true, r: 3, scrap: { steel: 24, ammo: 24 }, dev: { GUN: { AMMO: 2 } } },
  { id: 'gun16in_50', en: '16in/50 Triple Mk7', zh: '16inch三连装炮 Mk7', cat: '大主炮', slot: SLOT.BIG_GUN, stat: { fp: 21 }, cost: [10, 310, 300, 30], buildable: false, kai: 7, rare: true, r: 4, scrap: { steel: 28, ammo: 31 }, dev: { GUN: { AMMO: 2, BAUX: 1 } } },
  { id: 'gun16in_50r',en: '16in/50 Triple Mk7 Mod', zh: '16inch三连装炮 Mk7改', cat: '大主炮', slot: SLOT.BIG_GUN, stat: { fp: 23, aa: 2 }, cost: [10, 330, 320, 30], buildable: false, kai: 7, rare: true, r: 4, scrap: { steel: 31, ammo: 33 }, dev: { GUN: { AMMO: 1 } } },
  { id: 'gun16in_6mod2', en: '16in/45 Triple Mk6 mod.2', zh: '16inch三连装炮 Mk6 mod.2', cat: '大主炮', slot: SLOT.BIG_GUN, stat: { fp: 19, aa: 1 }, cost: [10, 290, 280, 20], buildable: false, kai: 7, rare: true, r: 4, scrap: { steel: 28, ammo: 28 }, dev: {} },
  { id: 'gun16in_7gfcs', en: '16in/50 Triple Mk7 +GFCS', zh: '16inch三连装炮 Mk7+GFCS', cat: '大主炮', slot: SLOT.BIG_GUN, stat: { fp: 24, aa: 2, los: 2 }, cost: [10, 350, 340, 30], buildable: false, kai: 7, rare: true, r: 4, scrap: { steel: 32, ammo: 34 }, dev: {} },
  /* ---------- 副炮 ---------- */
  { id: 'sec5in_1',   en: '5in/38 Dual Purpose', zh: '5inch单装两用炮', cat: '副炮', slot: SLOT.SECONDARY, stat: { fp: 1, aa: 3, evd: 1 }, cost: [10, 40, 40, 10], buildable: true, kai: 10, r: 1, scrap: { steel: 4, ammo: 3 }, dev: { GUN: { AMMO: 2 }, MINE: { AMMO: 4 }, CV: { OIL: 4 } } },
  { id: 'sec5in_group', en: '5in/38 HAA Group', zh: '5inch单装高角炮群', cat: '副炮', slot: SLOT.SECONDARY, stat: { fp: 1, aa: 5, evd: 1 }, cost: [10, 45, 45, 10], buildable: true, kai: 10, r: 1, scrap: { steel: 4, ammo: 3 }, dev: { GUN: { AMMO: 1 }, MINE: { AMMO: 1 } } },
  { id: 'sec5in_2',   en: '5in/38 Twin DP Mk38', zh: '5inch连装两用炮 Mk38', cat: '副炮', slot: SLOT.SECONDARY, stat: { fp: 2, aa: 6, evd: 1 }, cost: [10, 70, 70, 20], buildable: true, kai: 10, r: 2, scrap: { steel: 5, ammo: 4 }, dev: { GUN: { AMMO: 1, BAUX: 1 }, CV: { AMMO: 2 } } },
  { id: 'sec5in_sub', en: '5in/38 Twin Sub Config', zh: '5inch连装炮(副炮配置)集中配备', cat: '副炮', slot: SLOT.SECONDARY, stat: { fp: 2, aa: 4, evd: 2 }, cost: [10, 60, 60, 10], buildable: true, kai: 10, rare: true, r: 2, scrap: { steel: 5, ammo: 4 }, dev: { GUN: { AMMO: 1 }, MINE: { AMMO: 1 } } },
  { id: 'sec6in_1',   en: '6in/47 Single', zh: '6inch单装炮', cat: '副炮', slot: SLOT.SECONDARY, stat: { fp: 2, aa: 1 }, cost: [10, 50, 40, 10], buildable: true, kai: 10, r: 1, scrap: { steel: 4, ammo: 3 }, dev: { GUN: { AMMO: 1 } } },
  /* ---------- 鱼雷 ---------- */
  { id: 'torp_mk15',  en: 'Mk15 Torpedo', zh: 'Mk15舰载鱼雷', cat: '鱼雷', slot: SLOT.TORPEDO, stat: { tp: 7 }, cost: [20, 60, 50, 20], buildable: true, kai: 12, r: 1, scrap: { steel: 5, ammo: 6 }, dev: { MINE: { OIL: 8, AMMO: 4 } } },
  { id: 'torp_mk18',  en: 'Mk18 Electric Torpedo', zh: 'Mk18电动鱼雷', cat: '鱼雷', slot: SLOT.TORPEDO, stat: { tp: 8 }, cost: [20, 60, 50, 30], buildable: true, kai: 12, r: 2, scrap: { steel: 5, ammo: 7 }, dev: { MINE: { OIL: 2 }, SUB: { OIL: 2 } } },
  { id: 'torp_mk15r', en: 'Mk15 Mod Torpedo', zh: 'Mk15改舰载鱼雷', cat: '鱼雷', slot: SLOT.TORPEDO, stat: { tp: 10 }, cost: [30, 70, 50, 30], buildable: true, kai: 12, rare: true, r: 2, scrap: { steel: 6, ammo: 8 }, dev: { MINE: { OIL: 4 } } },
  { id: 'torp_mk14',  en: 'Mk14 Torpedo', zh: 'Mk14潜航鱼雷', cat: '鱼雷', slot: SLOT.TORPEDO, stat: { tp: 6 }, cost: [20, 60, 50, 20], buildable: true, kai: 12, r: 2, scrap: { steel: 5, ammo: 6 }, dev: { MINE: { OIL: 4 }, SUB: { OIL: 8, AMMO: 4, BAUX: 2 } } },
  { id: 'torp_21in_4i', en: '21in Bow Tubes x4 (Initial)', zh: '21inch舰首鱼雷发射管4门(初期型)', cat: '鱼雷', slot: SLOT.TORPEDO, stat: { tp: 8 }, cost: [20, 70, 60, 30], buildable: true, kai: 12, r: 2, scrap: { steel: 6, ammo: 8 }, dev: { SUB: { OIL: 2 } } },
  { id: 'torp_21in_4l', en: '21in Bow Tubes x4 (Late)', zh: '21inch舰首鱼雷发射管4门(后期型)', cat: '鱼雷', slot: SLOT.TORPEDO, stat: { tp: 10 }, cost: [30, 80, 60, 40], buildable: false, kai: 12, rare: true, r: 3, scrap: { steel: 8, ammo: 10 }, dev: { SUB: { OIL: 1 } } },
  { id: 'torp_533_5i', en: '533mm Quint Tubes (Initial)', zh: '533mm五连装鱼雷(初期型)', cat: '鱼雷', slot: SLOT.TORPEDO, stat: { tp: 10 }, cost: [20, 70, 60, 30], buildable: true, kai: 12, rare: true, r: 3, scrap: { steel: 7, ammo: 9 }, dev: { MINE: { OIL: 2 } } },
  { id: 'torp_21in_6i', en: '21in Bow Tubes x6 (Initial)', zh: '21inch舰首鱼雷发射管6门(初期型)', cat: '鱼雷', slot: SLOT.TORPEDO, stat: { tp: 10 }, cost: [20, 80, 60, 40], buildable: false, kai: 12, rare: true, r: 3, scrap: { steel: 8, ammo: 10 }, dev: { SUB: { OIL: 1 } } },
  { id: 'torp_533_5l', en: '533mm Quint Tubes (Late)', zh: '533mm五连装鱼雷(后期型)', cat: '鱼雷', slot: SLOT.TORPEDO, stat: { tp: 13 }, cost: [30, 80, 60, 40], buildable: false, kai: 12, rare: true, r: 4, scrap: { steel: 9, ammo: 11 }, dev: { MINE: { OIL: 1 } } },
  { id: 'torp_21in_6l', en: '21in Bow Tubes x6 (Late)', zh: '21inch舰首鱼雷发射管6门(后期型)', cat: '鱼雷', slot: SLOT.TORPEDO, stat: { tp: 12 }, cost: [30, 90, 70, 40], buildable: false, kai: 12, rare: true, r: 4, scrap: { steel: 9, ammo: 12 }, dev: { SUB: { OIL: 1 } } },
  { id: 'torp_mk16',  en: 'Mk16 Torpedo', zh: 'Mk16新型鱼雷', cat: '鱼雷', slot: SLOT.TORPEDO, stat: { tp: 12 }, cost: [30, 80, 60, 40], buildable: false, kai: 12, rare: true, r: 4, scrap: { steel: 8, ammo: 10 }, dev: { MINE: { OIL: 2 }, SUB: { OIL: 2, AMMO: 2 } } },
  /* ---------- 舰战 ---------- */
  { id: 'f2a',        en: 'F2A Buffalo', zh: 'F2A水牛战斗机', cat: '舰战', slot: SLOT.FIGHTER, stat: { aa: 3 }, cost: [10, 10, 10, 30], buildable: true, kai: 7, r: 1, scrap: { baux: 3 }, dev: { CV: { BAUX: 2 } } },
  { id: 'f4f3',       en: 'F4F-3 Wildcat', zh: 'F4F-3野猫战斗机', cat: '舰战', slot: SLOT.FIGHTER, stat: { aa: 4 }, cost: [10, 20, 10, 35], buildable: true, kai: 7, r: 1, scrap: { baux: 3 }, dev: { CV: { BAUX: 2 } } },
  { id: 'f4f',        en: 'F4F Wildcat', zh: 'F4F野猫战斗机', cat: '舰战', slot: SLOT.FIGHTER, stat: { aa: 5 }, cost: [10, 20, 10, 40], buildable: true, kai: 7, r: 1, scrap: { baux: 4 }, dev: { CV: { BAUX: 4 } } },
  { id: 'f4f_r',      en: 'F4F Wildcat Mod', zh: 'F4F野猫改', cat: '舰战', slot: SLOT.FIGHTER, stat: { aa: 7 }, cost: [10, 20, 10, 50], buildable: true, kai: 7, rare: true, r: 2, scrap: { baux: 5 }, dev: { CV: { BAUX: 1 } } },
  { id: 'fm2',        en: 'FM-2 Wildcat', zh: 'FM-2野猫改', cat: '舰战', slot: SLOT.FIGHTER, stat: { aa: 8 }, cost: [10, 20, 10, 55], buildable: true, kai: 7, rare: true, r: 3, scrap: { baux: 5 }, dev: { CV: { BAUX: 1 } } },
  { id: 'f6f3',       en: 'F6F-3 Hellcat', zh: 'F6F-3地狱猫战斗机', cat: '舰战', slot: SLOT.FIGHTER, stat: { aa: 8 }, cost: [10, 20, 10, 55], buildable: true, kai: 7, rare: true, r: 2, scrap: { baux: 5 }, dev: { CV: { BAUX: 2 } } },
  { id: 'f6f',        en: 'F6F Hellcat', zh: 'F6F地狱猫战斗机', cat: '舰战', slot: SLOT.FIGHTER, stat: { aa: 9 }, cost: [10, 20, 10, 60], buildable: true, kai: 7, rare: true, r: 3, scrap: { baux: 6 }, dev: { CV: { BAUX: 1 } } },
  { id: 'f6f5',       en: 'F6F-5 Hellcat', zh: 'F6F-5地狱猫改', cat: '舰战', slot: SLOT.FIGHTER, stat: { aa: 12 }, cost: [10, 20, 10, 70], buildable: false, kai: 7, rare: true, r: 4, scrap: { baux: 7 }, dev: { CV: { BAUX: 1 } } },
  { id: 'f4u',        en: 'F4U Corsair', zh: 'F4U海盗战斗机', cat: '舰战', slot: SLOT.FIGHTER, stat: { aa: 11 }, cost: [10, 20, 10, 70], buildable: false, kai: 7, rare: true, r: 4, scrap: { baux: 7 }, dev: { CV: { BAUX: 1 } } },
  { id: 'xf5u',       en: 'XF5U', zh: 'XF5U试验战斗机', cat: '舰战', slot: SLOT.FIGHTER, stat: { aa: 10, evd: 1 }, cost: [10, 20, 10, 70], buildable: false, kai: 7, rare: true, r: 4, scrap: { baux: 7 }, dev: {} },
  /* ---------- 夜间舰战 ---------- */
  { id: 'f4u2n',      en: 'F4U-2 Night Corsair', zh: 'F4U-2夜间海盗战斗机', cat: '夜间舰战', slot: SLOT.FIGHTER, stat: { aa: 9, los: 2 }, cost: [10, 20, 10, 65], buildable: false, kai: 7, rare: true, r: 3, scrap: { baux: 6 }, dev: { CV: { BAUX: 1 } } },
  { id: 'f6f3n',      en: 'F6F-3N Night Hellcat', zh: 'F6F-3N夜间地狱猫', cat: '夜间舰战', slot: SLOT.FIGHTER, stat: { aa: 8, los: 2 }, cost: [10, 20, 10, 65], buildable: false, kai: 7, rare: true, r: 3, scrap: { baux: 6 }, dev: { CV: { BAUX: 1 } } },
  { id: 'f6f5n',      en: 'F6F-5N Night Hellcat', zh: 'F6F-5N夜间地狱猫改', cat: '夜间舰战', slot: SLOT.FIGHTER, stat: { aa: 11, los: 3 }, cost: [10, 20, 10, 75], buildable: false, kai: 7, rare: true, r: 4, scrap: { baux: 7 }, dev: {} },
  /* ---------- 喷式舰战 ---------- */
  { id: 'fr1',        en: 'FR-1 Fireball', zh: 'FR-1火球喷式舰战', cat: '喷式舰战', slot: SLOT.FIGHTER, stat: { aa: 10, bmb: 2 }, cost: [10, 20, 10, 75], buildable: false, kai: 7, rare: true, r: 4, scrap: { baux: 7 }, dev: {} },
  /* ---------- 舰攻 ---------- */
  { id: 'tbd',        en: 'TBD Devastator', zh: 'TBD蹂躏者舰攻', cat: '舰攻', slot: SLOT.ATTACKER, stat: { tp: 5, bmb: 3, avg: 4 }, cost: [10, 20, 10, 40], buildable: true, kai: 7, r: 1, scrap: { baux: 4 }, dev: { CV: { BAUX: 2 } } },
  { id: 'tbf',        en: 'TBF Avenger', zh: 'TBF复仇者舰攻', cat: '舰攻', slot: SLOT.ATTACKER, stat: { tp: 8, bmb: 5, avg: 6 }, cost: [10, 20, 10, 50], buildable: true, kai: 7, rare: true, r: 2, scrap: { baux: 5 }, dev: { CV: { BAUX: 1 } } },
  { id: 'tbm',        en: 'TBM Avenger Mod', zh: 'TBM复仇者改舰攻', cat: '舰攻', slot: SLOT.ATTACKER, stat: { tp: 10, bmb: 6, avg: 7 }, cost: [10, 20, 10, 60], buildable: false, kai: 7, rare: true, r: 3, scrap: { baux: 6 }, dev: { CV: { BAUX: 1 } } },
  { id: 'tbm3d',      en: 'TBM-3D Night Avenger', zh: 'TBM-3D夜间复仇者舰攻', cat: '夜间舰攻', slot: SLOT.ATTACKER, stat: { tp: 11, bmb: 6, avg: 6 }, cost: [10, 20, 10, 65], buildable: false, kai: 7, rare: true, r: 4, scrap: { baux: 6 }, dev: { CV: { BAUX: 1 } } },
  /* ---------- 对潜哨戒机 ---------- */
  { id: 'tbm3w',      en: 'TBM-3W+3S ASW Avenger', zh: 'TBM-3W+3S对潜哨戒机', cat: '对潜哨戒机', slot: SLOT.ATTACKER, stat: { asw: 7, los: 5, bmb: 3 }, cost: [10, 20, 10, 60], buildable: false, kai: 7, rare: true, r: 3, scrap: { baux: 6 }, dev: { CV: { BAUX: 1 } } },
  /* ---------- 舰爆 ---------- */
  { id: 'sb2u2',      en: 'SB2U-2 Vindicator', zh: 'SB2U-2复仇者舰爆', cat: '舰爆', slot: SLOT.BOMBER, stat: { bmb: 6, avg: 3 }, cost: [10, 20, 10, 35], buildable: true, kai: 7, r: 1, scrap: { baux: 3 }, dev: { CV: { BAUX: 2 } } },
  { id: 'sbd',        en: 'SBD Dauntless', zh: 'SBD无畏舰爆', cat: '舰爆', slot: SLOT.BOMBER, stat: { bmb: 7, avg: 3 }, cost: [10, 20, 10, 40], buildable: true, kai: 7, r: 1, scrap: { baux: 4 }, dev: { CV: { BAUX: 2 } } },
  { id: 'sbd5',       en: 'SBD-5 Dauntless', zh: 'SBD-5无畏舰爆', cat: '舰爆', slot: SLOT.BOMBER, stat: { bmb: 9, avg: 4 }, cost: [10, 20, 10, 50], buildable: true, kai: 7, rare: true, r: 2, scrap: { baux: 5 }, dev: { CV: { BAUX: 1 } } },
  { id: 'f4u1d',      en: 'F4U-1D Corsair', zh: 'F4U-1D海盗舰爆', cat: '舰爆', slot: SLOT.BOMBER, stat: { bmb: 9, avg: 3 }, cost: [10, 20, 10, 60], buildable: false, kai: 7, rare: true, r: 3, scrap: { baux: 5 }, dev: { CV: { BAUX: 1 } } },
  { id: 'sb2c3',      en: 'SB2C-3 Helldiver', zh: 'SB2C-3地狱俯冲者舰爆', cat: '舰爆', slot: SLOT.BOMBER, stat: { bmb: 11, avg: 4 }, cost: [10, 20, 10, 55], buildable: true, kai: 7, rare: true, r: 2, scrap: { baux: 5 }, dev: { CV: { BAUX: 2 } } },
  { id: 'sb2c',       en: 'SB2C Helldiver', zh: 'SB2C地狱俯冲者舰爆', cat: '舰爆', slot: SLOT.BOMBER, stat: { bmb: 12, avg: 5 }, cost: [10, 20, 10, 60], buildable: false, kai: 7, rare: true, r: 3, scrap: { baux: 6 }, dev: { CV: { BAUX: 1 } } },
  { id: 'f4u4',       en: 'F4U-4 Corsair', zh: 'F4U-4海盗舰爆', cat: '舰爆', slot: SLOT.BOMBER, stat: { bmb: 11, avg: 4 }, cost: [10, 20, 10, 70], buildable: false, kai: 7, rare: true, r: 4, scrap: { baux: 6 }, dev: {} },
  { id: 'sb2c5',      en: 'SB2C-5 Helldiver', zh: 'SB2C-5地狱俯冲者舰爆改', cat: '舰爆', slot: SLOT.BOMBER, stat: { bmb: 13, avg: 5 }, cost: [10, 20, 10, 60], buildable: false, kai: 7, rare: true, r: 3, scrap: { baux: 6 }, dev: { CV: { BAUX: 1 } } },
  /* ---------- 舰侦 ---------- */
  { id: 'sbdvs2',     en: 'SBD VS-2 Recon', zh: 'SBD VS-2舰侦(侦察飞行队)', cat: '舰侦', slot: SLOT.FIGHTER, stat: { los: 8, aa: 2 }, cost: [10, 20, 10, 60], buildable: false, kai: 7, rare: true, r: 3, scrap: { baux: 5 }, dev: { CV: { BAUX: 1 } } },
  /* ---------- 水侦/水爆/大型飞行艇 ---------- */
  { id: 'soc',        en: 'SOC Seagull', zh: 'SOC海鸥水侦', cat: '水侦', slot: SLOT.SEAPLANE, stat: { asw: 2, los: 5 }, cost: [10, 10, 10, 20], buildable: true, kai: 7, r: 1, scrap: { baux: 2 }, dev: { CV: { BAUX: 2, OIL: 2 } } },
  { id: 'soc_r',      en: 'SOC Seagull Late', zh: 'SOC海鸥水侦(后期型)', cat: '水侦', slot: SLOT.SEAPLANE, stat: { asw: 3, los: 6 }, cost: [10, 10, 10, 25], buildable: true, kai: 7, rare: true, r: 2, scrap: { baux: 3 }, dev: { CV: { BAUX: 2 } } },
  { id: 'os2u',       en: 'OS2U Kingfisher', zh: 'OS2U翠鸟水侦', cat: '水侦', slot: SLOT.SEAPLANE, stat: { asw: 3, los: 7 }, cost: [10, 10, 10, 30], buildable: true, kai: 7, rare: true, r: 2, scrap: { baux: 3 }, dev: { CV: { BAUX: 1 } } },
  { id: 'so3c',       en: 'SO3C Seamew', zh: 'SO3C海鸥水侦改', cat: '水侦', slot: SLOT.SEAPLANE, stat: { asw: 4, los: 7 }, cost: [10, 10, 10, 35], buildable: false, kai: 7, rare: true, r: 3, scrap: { baux: 4 }, dev: { CV: { BAUX: 1 } } },
  { id: 'pby',        en: 'PBY Catalina', zh: 'PBY卡特琳娜水侦', cat: '水侦', slot: SLOT.SEAPLANE, stat: { asw: 6, los: 8 }, cost: [10, 10, 10, 40], buildable: false, kai: 7, rare: true, r: 3, scrap: { baux: 4 }, dev: { CV: { BAUX: 1 } } },
  { id: 'pby5a',      en: 'PBY-5A Catalina', zh: 'PBY-5A卡特琳娜飞行艇', cat: '大型飞行艇', slot: SLOT.SEAPLANE, stat: { asw: 5, los: 9 }, cost: [10, 10, 10, 50], buildable: false, kai: 7, rare: true, r: 4, scrap: { baux: 5 }, dev: { CV: { BAUX: 1 } } },
  /* ---------- 电探 ---------- */
  { id: 'radar_mk22', en: 'Mk22 FC Radar', zh: 'Mk22火控雷达', cat: '对空电探', slot: SLOT.RADAR, stat: { aa: 8, evd: 2, los: 2 }, cost: [10, 10, 10, 30], buildable: true, kai: 5, rare: true, r: 2, scrap: { steel: 10, baux: 10 }, dev: { GUN: { OIL: 2 }, CV: { OIL: 2 } } },
  { id: 'radar_mk37', en: 'Mk37 FC Radar', zh: 'Mk37火控雷达改', cat: '对空电探', slot: SLOT.RADAR, stat: { aa: 10, evd: 2, los: 3 }, cost: [10, 10, 10, 40], buildable: false, kai: 5, rare: true, r: 4, scrap: { steel: 12, baux: 12 }, dev: { GUN: { OIL: 2 }, CV: { OIL: 2 } } },
  { id: 'radar_sg',   en: 'SG Surface Radar', zh: 'SG水面搜索雷达', cat: '对水电探', slot: SLOT.RADAR, stat: { los: 8, evd: 1 }, cost: [10, 10, 10, 30], buildable: true, kai: 5, rare: true, r: 3, scrap: { steel: 12, baux: 10 }, dev: { GUN: { OIL: 4 }, CV: { OIL: 2 }, MINE: { OIL: 2 }, SUB: { BAUX: 2 } } },
  { id: 'radar_sg_r', en: 'SG Radar Late', zh: 'SG雷达(后期型)', cat: '对水电探', slot: SLOT.RADAR, stat: { los: 9, evd: 1 }, cost: [10, 10, 10, 35], buildable: false, kai: 5, rare: true, r: 3, scrap: { steel: 13, baux: 11 }, dev: { GUN: { OIL: 1 }, CV: { OIL: 1 } } },
  { id: 'radar_sk',   en: 'SK Air Search Radar', zh: 'SK远程对空雷达', cat: '对空电探', slot: SLOT.RADAR, stat: { aa: 7, los: 6, evd: 1 }, cost: [10, 10, 10, 40], buildable: false, kai: 5, rare: true, r: 4, scrap: { steel: 15, baux: 15 }, dev: { GUN: { OIL: 2 }, CV: { OIL: 2 } } },
  { id: 'radar_sc',   en: 'SC Radar Late', zh: 'SC雷达改(后期调整型)', cat: '对空电探', slot: SLOT.RADAR, stat: { aa: 8, los: 7 }, cost: [10, 10, 10, 40], buildable: false, kai: 5, rare: true, r: 3, scrap: { steel: 14, baux: 12 }, dev: { GUN: { OIL: 1 }, CV: { OIL: 1 } } },
  { id: 'radar_fc37', en: 'GFCS Mk.37', zh: 'GFCS Mk.37火控系统', cat: '设备', slot: SLOT.EQUIP, stat: { fp: 3, aa: 7, los: 2 }, cost: [10, 90, 90, 30], buildable: true, kai: 5, rare: true, r: 4, scrap: { steel: 15, baux: 12 }, dev: { GUN: { OIL: 2 } } },
  { id: 'radar_sg_i', en: 'SG Radar (Initial)', zh: 'SG雷达(初期型)', cat: '对水电探', slot: SLOT.RADAR, stat: { los: 7, evd: 1 }, cost: [10, 10, 10, 30], buildable: true, kai: 5, rare: true, r: 2, scrap: { steel: 10, baux: 8 }, dev: { GUN: { OIL: 2 }, CV: { OIL: 2 } } },
  { id: 'radar_sk_sg', en: 'SK+SG Radar', zh: 'SK+SG两用雷达', cat: '两用电探', slot: SLOT.RADAR, stat: { aa: 7, los: 9, evd: 1 }, cost: [10, 10, 10, 45], buildable: false, kai: 5, rare: true, r: 4, scrap: { steel: 16, baux: 16 }, dev: {} },
  /* ---------- 高角炮/机枪/高射装置 ---------- */
  { id: 'aa_5in',     en: '5in/38 HAA', zh: '5inch单装高角炮', cat: '高角炮', slot: SLOT.HAA, stat: { fp: 1, aa: 7 }, cost: [10, 30, 30, 10], buildable: true, kai: 10, r: 2, scrap: { steel: 5 }, dev: { GUN: { OIL: 4 }, CV: { OIL: 4 } } },
  { id: 'aa_5in_t',   en: '5in/38 Twin HAA', zh: '5inch连装高角炮 Mk33', cat: '高角炮', slot: SLOT.HAA, stat: { fp: 2, aa: 10 }, cost: [10, 60, 60, 20], buildable: true, kai: 10, rare: true, r: 3, scrap: { steel: 8 }, dev: { GUN: { OIL: 2 }, CV: { OIL: 2 } } },
  { id: 'aa_40mm',    en: '40mm Bofors Quad', zh: '40mm四连装博福斯', cat: '机枪', slot: SLOT.MG, stat: { aa: 9, evd: 1 }, cost: [10, 30, 30, 20], buildable: true, kai: 10, rare: true, r: 2, scrap: { steel: 5 }, dev: { GUN: { OIL: 2 }, CV: { OIL: 2 } } },
  { id: 'aa_20mm',    en: '20mm Oerlikon', zh: '20mm厄利孔机枪', cat: '机枪', slot: SLOT.MG, stat: { aa: 4 }, cost: [10, 20, 20, 10], buildable: true, kai: 10, r: 1, scrap: { steel: 3 }, dev: { GUN: { OIL: 4 }, CV: { OIL: 4 }, MINE: { BAUX: 4, OIL: 4 } } },
  { id: 'aa_40mm_r',  en: '40mm Bofors Mod', zh: '40mm连装博福斯改', cat: '机枪', slot: SLOT.MG, stat: { aa: 11, evd: 1 }, cost: [10, 40, 40, 20], buildable: false, kai: 10, rare: true, r: 3, scrap: { steel: 6 }, dev: { CV: { OIL: 2 } } },
  { id: 'aa_mk51',    en: 'Mk.51 Director', zh: 'Mk.51高射指挥仪', cat: '高射装置', slot: SLOT.EQUIP, stat: { aa: 5, evd: 1 }, cost: [10, 30, 30, 20], buildable: true, kai: 10, r: 2, scrap: { steel: 6, baux: 2 }, dev: { GUN: { OIL: 2 }, CV: { OIL: 2 } } },
  /* ---------- 声呐/爆雷/投射机 ---------- */
  { id: 'sonar_qc',   en: 'QC Sonar', zh: 'QC声呐', cat: '声呐', slot: SLOT.SONAR_DC, stat: { asw: 8 }, cost: [30, 20, 30, 20], buildable: true, kai: 10, r: 1, scrap: { steel: 5, ammo: 3 }, dev: { MINE: { BAUX: 8, OIL: 4, AMMO: 2 }, SUB: { OIL: 4, BAUX: 4 } } },
  { id: 'sonar_qcr',  en: 'QC Sonar Mod', zh: 'QC声呐改', cat: '声呐', slot: SLOT.SONAR_DC, stat: { asw: 11, los: 1 }, cost: [40, 20, 40, 20], buildable: true, kai: 10, rare: true, r: 2, scrap: { steel: 7, ammo: 4 }, dev: { MINE: { BAUX: 4 }, SUB: { BAUX: 4 } } },
  { id: 'dc_mk6',     en: 'Mk6 Depth Charge', zh: 'Mk6深水炸弹', cat: '爆雷', slot: SLOT.SONAR_DC, stat: { asw: 7 }, cost: [30, 30, 30, 10], buildable: true, kai: 10, r: 1, scrap: { steel: 4, ammo: 3 }, dev: { MINE: { BAUX: 6, OIL: 4 } } },
  { id: 'dc_mk9',     en: 'Mk9 Depth Charge', zh: 'Mk9深水炸弹', cat: '爆雷', slot: SLOT.SONAR_DC, stat: { asw: 9 }, cost: [40, 30, 40, 10], buildable: false, kai: 10, rare: true, r: 2, scrap: { steel: 5, ammo: 4 }, dev: { MINE: { BAUX: 2 } } },
  { id: 'hedgehog',   en: 'Hedgehog', zh: 'Hedgehog刺猬弹(初期型)', cat: '爆雷', slot: SLOT.SONAR_DC, stat: { asw: 10 }, cost: [30, 30, 30, 20], buildable: false, kai: 10, rare: true, r: 3, scrap: { steel: 6, ammo: 4 }, dev: { MINE: { BAUX: 2 } } },
  { id: 'mk32',       en: 'Mk.32 ASW Mortar', zh: 'Mk.32对潜鱼雷(Mk.2落射机)', cat: '爆雷投射机', slot: SLOT.SONAR_DC, stat: { asw: 11 }, cost: [40, 30, 40, 20], buildable: false, kai: 10, rare: true, r: 4, scrap: { steel: 7, ammo: 5 }, dev: { MINE: { BAUX: 1 } } },
  { id: 'alpha',      en: 'RUR-4A Weapon Alpha', zh: 'RUR-4A Alpha改投射机', cat: '爆雷投射机', slot: SLOT.SONAR_DC, stat: { asw: 13 }, cost: [40, 40, 40, 20], buildable: false, kai: 10, rare: true, r: 4, scrap: { steel: 8, ammo: 5 }, dev: {} },
  /* ---------- 炮弹/设备/消耗品 ---------- */
  { id: 'ap_mk8',     en: 'Mk8 APC Shell', zh: 'Mk8穿甲弹', cat: '穿甲弹', slot: SLOT.EQUIP, stat: { fp: 4 }, cost: [10, 90, 90, 30], buildable: true, kai: 8, rare: true, r: 3, scrap: { steel: 10, ammo: 10 }, dev: { GUN: { AMMO: 2, BAUX: 2 } } },
  { id: 'aa_mk53',    en: 'Mk53 VT Fuze Shell', zh: 'Mk53 VT引信对空弹', cat: '对空弹', slot: SLOT.EQUIP, stat: { aa: 8 }, cost: [10, 90, 80, 20], buildable: true, kai: 8, rare: true, r: 3, scrap: { steel: 10, ammo: 8 }, dev: { GUN: { AMMO: 2 } } },
  { id: 'searchlight',en: 'Searchlight', zh: '探照灯', cat: '设备', slot: SLOT.EQUIP, stat: { evd: -1, los: 1 }, cost: [10, 10, 10, 10], buildable: true, kai: 0, r: 1, scrap: { steel: 2 }, dev: { GUN: { OIL: 2 }, CV: { AMMO: 2 }, MINE: { BAUX: 2 }, SUB: { OIL: 4 } } },
  { id: 'star_mk9',   en: 'Mk.9 Star Shell', zh: 'Mk.9照明弹', cat: '照明弹', slot: SLOT.EQUIP, stat: { evd: 2, los: 1 }, cost: [10, 10, 10, 20], buildable: true, kai: 10, r: 2, scrap: { steel: 3 }, dev: { GUN: { OIL: 1 }, MINE: { BAUX: 1 } } },
  { id: 'souju',      en: 'Gun Director', zh: '火控指挥仪', cat: '设备', slot: SLOT.EQUIP, stat: { fp: 2, aa: 3 }, cost: [10, 20, 20, 20], buildable: true, kai: 0, r: 2, scrap: { steel: 4, ammo: 3 }, dev: { GUN: { AMMO: 2, OIL: 2 } } },
  { id: 'lookout',    en: 'Veteran Lookout', zh: '熟练见张员', cat: '设备', slot: SLOT.EQUIP, stat: { lck: 3 }, cost: [10, 30, 30, 20], buildable: true, kai: 10, rare: true, r: 3, scrap: { steel: 4 }, dev: { MINE: { BAUX: 1 } } },
  { id: 'smoke_gen',  en: 'Smoke Generator', zh: '发烟装置', cat: '设备', slot: SLOT.EQUIP, stat: { evd: 2 }, cost: [10, 10, 20, 10], buildable: true, kai: 10, r: 2, scrap: { steel: 4 }, dev: { GUN: { OIL: 1 }, MINE: { OIL: 1 } } },
  { id: 'balloon',    en: 'Barrage Balloon', zh: '阻塞气球', cat: '设备', slot: SLOT.EQUIP, stat: { aa: 3 }, cost: [10, 10, 30, 10], buildable: true, kai: 10, r: 2, scrap: { steel: 5 }, dev: { GUN: { OIL: 1 }, CV: { OIL: 1 } } },
  { id: 'boiler_h',   en: 'High-speed Boiler', zh: '强化锅炉(高速)', cat: '机关部强化', slot: SLOT.EQUIP, stat: { evd: 4 }, cost: [10, 10, 80, 10], buildable: true, kai: 10, rare: true, r: 3, scrap: { steel: 8 }, dev: { GUN: { OIL: 2 } } },
  { id: 'bulge_m',    en: 'Torpedo Bulge (Medium)', zh: '增设防雷鼓包(中型舰)', cat: '增设装甲', slot: SLOT.EQUIP, stat: { arm: 3 }, cost: [10, 10, 200, 10], buildable: true, kai: 10, rare: true, r: 3, scrap: { steel: 15 }, dev: { GUN: { OIL: 1 } } },
  { id: 'bulge_l',    en: 'Torpedo Bulge (Large)', zh: '增设防雷鼓包(大型舰)', cat: '增设装甲', slot: SLOT.EQUIP, stat: { arm: 5 }, cost: [10, 10, 300, 10], buildable: false, kai: 10, rare: true, r: 4, scrap: { steel: 20 }, dev: {} },
  { id: 'fleetcom',   en: 'Fleet Command Facility', zh: '舰队司令部设施', cat: '设备', slot: SLOT.EQUIP, stat: { los: 2 }, cost: [10, 10, 10, 30], buildable: false, kai: 0, rare: true, r: 4, scrap: { steel: 12, baux: 10 }, dev: {} },
  { id: 'repair_facility', en: 'Repair Facility', zh: '舰艇修理设施', cat: '设备', slot: SLOT.EQUIP, stat: {}, cost: [10, 10, 10, 30], buildable: false, kai: 0, rare: true, r: 4, scrap: { steel: 15 }, dev: {} },
  { id: 'crew_vet',   en: 'Carrier Crew Veteran', zh: '熟练舰载机整备员', cat: '航空要员', slot: SLOT.EQUIP, stat: { aa: 2, bmb: 2 }, cost: [10, 20, 10, 50], buildable: false, kai: 10, rare: true, r: 3, scrap: { baux: 3 }, dev: {} },
  { id: 'm4a1',       en: 'M4A1 DD Tank', zh: 'M4A1 DD水陆两用车', cat: '上陆用舟艇', slot: SLOT.EQUIP, stat: { fp: 2, asw: 3 }, cost: [30, 30, 100, 10], buildable: false, kai: 10, rare: true, r: 3, scrap: { steel: 8, ammo: 5 }, dev: {} },
  /* ---------- 消耗性物资（出击时消耗，不可开发/改修） ---------- */
  { id: 'dc_team',    en: 'Damage Control Team', zh: '应急修理要员', cat: '消耗品', slot: SLOT.EQUIP, stat: {}, cost: [10, 10, 10, 10], buildable: false, kai: 0, rare: true, r: 4, scrap: { steel: 2 }, dev: {} },
  { id: 'rations',    en: 'Combat Rations', zh: '战斗粮食', cat: '消耗品', slot: SLOT.EQUIP, stat: {}, cost: [10, 10, 10, 10], buildable: false, kai: 0, r: 2, scrap: { steel: 1 }, dev: {} },
  { id: 'supply_oiler', en: 'Underway Replenishment', zh: '洋上补给', cat: '消耗品', slot: SLOT.EQUIP, stat: {}, cost: [10, 10, 10, 10], buildable: false, kai: 0, rare: true, r: 3, scrap: { steel: 3 }, dev: {} },
];

/* ---------- 索引 ---------- */
const EquipmentData = {};
EQ.forEach(e => EquipmentData[e.id] = e);

/* ============================================================
 * 开发系统（参照 kcwiki「开发」）：
 * 秘书舰系 × 最高资源池 = 开发池；每池 50 等份，出货率=份额×2%
 * ============================================================ */

/* 秘书舰类型 → 秘书舰系 */
function secretaryKey(secretaryShip) {
  if (!secretaryShip) return 'ALL';
  const t = secretaryShip.type;
  if (t === 'BB' || t === 'CA' || t === 'FBB') return DEV_SEC.GUN;
  if (t === 'DD' || t === 'DE' || t === 'CL' || t === 'CLT' || t === 'CT') return DEV_SEC.MINE;
  if (t === 'CV' || t === 'CVL' || t === 'CVB' || t === 'BBV' || t === 'CAV' || t === 'AV') return DEV_SEC.CV;
  if (t === 'SS' || t === 'SSV' || t === 'AS') return DEV_SEC.SUB;
  return 'ALL';
}

/* 配方 → 开发池（最高资源决定，优先级 燃料/钢材 > 弹药 > 铝，平局归前者） */
function devPoolKey(recipe) {
  const f = recipe.fuel || 0, a = recipe.ammo || 0, s = recipe.steel || 0, b = recipe.baux || 0;
  const max = Math.max(f, a, s, b);
  if (max <= 0) return DEV_POOL.OIL;
  if ((f === max || s === max) && (a < max || b < max)) return DEV_POOL.OIL;
  if (a === max) return DEV_POOL.AMMO;
  return DEV_POOL.BAUX;
}

/* 某秘书舰系 × 开发池 的装备条目（[{id, rate}]，rate=份额，出货率=rate×2%） */
function devEntries(sec, pool) {
  const out = [];
  for (const ed of EQ) {
    const rate = ed.dev && ed.dev[sec] ? ed.dev[sec][pool] : 0;
    if (rate > 0) out.push({ id: ed.id, rate });
  }
  return out.sort((x, y) => y.rate - x.rate || EquipmentData[x.id].zh.localeCompare(EquipmentData[y.id].zh, 'zh'));
}

/* 失败份额（50 - 池内总份额） */
function devFailShare(sec, pool) {
  return 50 - devEntries(sec, pool).reduce((s, e) => s + e.rate, 0);
}

/* 装备最低资源要求（= 解体回收值 ×10，参照 wiki：资源低于要求则开发失败） */
function devMinReq(ed) {
  return { fuel: (ed.scrap.fuel || 0) * 10, ammo: (ed.scrap.ammo || 0) * 10, steel: (ed.scrap.steel || 0) * 10, baux: (ed.scrap.baux || 0) * 10 };
}

/* 装备类型名称（中文） */
const EQUIP_CAT_ZH = {
  '小主炮': '小口径主炮', '中主炮': '中口径主炮', '大主炮': '大口径主炮', '副炮': '副炮',
  '鱼雷': '鱼雷', '舰战': '舰上战斗机', '舰攻': '舰上攻击机', '舰爆': '舰上爆击机',
  '舰侦': '舰上侦察机', '夜间舰战': '夜间舰上战斗机', '夜间舰攻': '夜间舰上攻击机',
  '喷式舰战': '喷式舰上战斗机', '对潜哨戒机': '对潜哨戒机',
  '水侦': '水上侦察机', '水爆': '水上爆击机', '大型飞行艇': '大型飞行艇',
  '对空电探': '对空电探', '对水电探': '对水电探', '两用电探': '两用电探',
  '高角炮': '高角炮', '高射装置': '高射装置', '机枪': '对空机枪',
  '声呐': '声呐', '爆雷': '爆雷', '爆雷投射机': '爆雷投射机',
  '穿甲弹': '穿甲弹', '对空弹': '对空弹', '照明弹': '照明弹',
  '增设装甲': '增设装甲', '机关部强化': '机关部强化',
  '航空要员': '航空要员', '上陆用舟艇': '上陆用舟艇', '消耗品': '消耗性物资', '设备': '设备'
};

/* 装备稀有度（等级）名称（参照舰C wiki：稀有度 白→绿→蓝→紫→金；r 字段 1~4，预留 5 金） */
const EQUIP_RARITY_ZH = { 1: '白', 2: '绿', 3: '蓝', 4: '紫', 5: '金' };

/* 装备类别展示顺序（仓库/装备选择器共用，参照 wiki「装备列表」分类） */
const CAT_ORDER = ['小主炮', '中主炮', '大主炮', '副炮', '鱼雷', '舰战', '夜间舰战', '喷式舰战',
  '舰攻', '夜间舰攻', '舰爆', '舰侦', '对潜哨戒机', '水侦', '水爆', '大型飞行艇',
  '对空电探', '对水电探', '两用电探', '高角炮', '高射装置', '机枪', '声呐', '爆雷', '爆雷投射机',
  '穿甲弹', '对空弹', '照明弹', '增设装甲', '机关部强化', '航空要员', '上陆用舟艇', '消耗品', '设备'];

/* 属性中文名（UI 用） */
const EQUIP_STAT_ZH = {
  fuel: '燃料', ammo: '弹药', steel: '钢材', baux: '铝土',
  fp: '火力', tp: '雷装', aa: '对空', arm: '装甲', evd: '回避', asw: '对潜', los: '索敌', lck: '运',
  bmb: '爆装', avg: '对空', radius: '航程', speed: '航速'
};

/* 深海敌方装备（简化，仅用于 boss 判定特殊效果） */
const DEEP_EQUIP = {
  'deep_aa_ci': { en: 'Enemy AA Suite', zh: '敌方对空兵装', cat: '设备', slot: SLOT.EQUIP, stat: { aa: 0 } }
};

/* ============================================================
 * 装备改修配置（参照 wiki「明石的改修工厂」）
 * need  : 解锁类别（由二号舰决定）
 *         basic=无需二号舰 / dd=驱逐·海防 / cl=巡洋系 / bb=战列系 / cv=空母系 / as=工作舰·水母
 * screws: 每次改修的改修资材消耗（★+6 起再 +1）
 * res   : [燃料, 弹药, 钢材, 铝] 每次改修消耗
 * matFrom: 从★几起需要消耗同名装备作为素材（wiki：多数装备 ★+6 起）
 * update: 更新（进化）路线 { to: 目标装备id, mats: 消耗素材ids }（素材须 ★0 且未上锁）
 * 除 searchlight/souju（kai:0）外均可改修，★上限统一为 10（★MAX）
 * ============================================================ */
const IMPROVE = {
  /* 小主炮 */
  gun5in_30:  { need: 'basic', screws: 1, res: [10, 30, 30, 0], matFrom: 6, update: { to: 'gun5in_38', mats: ['gun5in_30', 'gun5in_30'] } },
  gun5in_38:  { need: 'basic', screws: 1, res: [10, 30, 30, 0], matFrom: 6, update: { to: 'gun5in_54', mats: ['gun5in_38', 'gun5in_38'] } },
  gun5in_54:  { need: 'basic', screws: 1, res: [10, 30, 30, 0], matFrom: 6 },
  gun5in_28:  { need: 'basic', screws: 1, res: [10, 30, 30, 0], matFrom: 6 },
  '5in_mk30':  { need: 'basic', screws: 1, res: [10, 30, 30, 0], matFrom: 6, update: { to: 'gun5in_28', mats: ['5in_mk30', '5in_mk30'] } },
  gun5in_30r: { need: 'basic', screws: 1, res: [10, 30, 30, 0], matFrom: 6, update: { to: 'gun5in_30r_gfcs', mats: ['gun5in_30r', 'gun5in_30r'] } },
  gun5in_30r_gfcs: { need: 'basic', screws: 1, res: [10, 30, 30, 0], matFrom: 1 },
  /* 中主炮 */
  gun6in_3:   { need: 'cl', screws: 1, res: [10, 60, 60, 0], matFrom: 6, update: { to: 'gun6in_3r', mats: ['gun6in_3', 'gun6in_3'] } },
  gun6in_3r:  { need: 'cl', screws: 1, res: [10, 60, 60, 0], matFrom: 6, update: { to: 'gun6in_3r2', mats: ['gun6in_3', 'gun6in_3'] } },
  gun6in_3r2: { need: 'cl', screws: 1, res: [10, 60, 60, 0], matFrom: 1 },
  gun8in_9:   { need: 'cl', screws: 1, res: [10, 60, 60, 0], matFrom: 6, update: { to: 'gun8in_15', mats: ['gun8in_9', 'gun8in_9'] } },
  gun8in_9r2: { need: 'cl', screws: 1, res: [10, 60, 60, 0], matFrom: 6, update: { to: 'gun8in_15', mats: ['gun8in_9r2', 'gun8in_9r2'] } },
  gun8in_15:  { need: 'cl', screws: 1, res: [10, 60, 60, 0], matFrom: 6, update: { to: 'gun8in_r', mats: ['gun8in_15', 'gun8in_15'] } },
  gun8in_r:   { need: 'cl', screws: 1, res: [10, 60, 60, 0], matFrom: 6 },
  gun5in_dp_con: { need: 'cl', screws: 1, res: [10, 60, 60, 0], matFrom: 6, update: { to: 'gun5in_dp_gfcs', mats: ['gun5in_dp_con', 'gun5in_dp_con'] } },
  gun5in_dp_gfcs: { need: 'cl', screws: 1, res: [10, 60, 60, 0], matFrom: 1 },
  /* 大主炮 */
  gun14in_45d:{ need: 'bb', screws: 2, res: [10, 120, 120, 0], matFrom: 6, update: { to: 'gun14in_3', mats: ['gun14in_45d', 'gun14in_45d'] } },
  gun14in_3:  { need: 'bb', screws: 2, res: [10, 120, 120, 0], matFrom: 6, update: { to: 'gun16in_45', mats: ['gun14in_3', 'gun14in_3'] } },
  gun16in_45: { need: 'bb', screws: 2, res: [10, 120, 120, 0], matFrom: 6, update: { to: 'gun16in_45r', mats: ['gun14in_3', 'gun14in_3'] } },
  gun16in_45r:{ need: 'bb', screws: 2, res: [10, 120, 120, 0], matFrom: 6, update: { to: 'gun16in_6mod2', mats: ['gun16in_45r', 'gun16in_45r'] } },
  gun16in_mk5:{ need: 'bb', screws: 2, res: [10, 120, 120, 0], matFrom: 6, update: { to: 'gun16in_6mod2', mats: ['gun16in_mk5', 'gun16in_mk5'] } },
  gun16in_6mod2:{ need: 'bb', screws: 2, res: [10, 120, 120, 0], matFrom: 1 },
  gun16in_50: { need: 'bb', screws: 2, res: [10, 120, 120, 0], matFrom: 1, update: { to: 'gun16in_50r', mats: ['gun16in_45', 'gun16in_45'] } },
  gun16in_50r:{ need: 'bb', screws: 2, res: [10, 120, 120, 0], matFrom: 6, update: { to: 'gun16in_7gfcs', mats: ['gun16in_50r', 'gun16in_50r'] } },
  gun16in_7gfcs:{ need: 'bb', screws: 2, res: [10, 120, 120, 0], matFrom: 1 },
  /* 副炮 */
  sec5in_1:   { need: 'basic', screws: 1, res: [10, 20, 20, 0], matFrom: 6, update: { to: 'sec5in_2', mats: ['sec5in_1', 'sec5in_1'] } },
  sec5in_2:   { need: 'basic', screws: 1, res: [10, 20, 20, 0], matFrom: 6 },
  sec5in_group:{ need: 'basic', screws: 1, res: [10, 20, 20, 0], matFrom: 6 },
  sec5in_sub: { need: 'basic', screws: 1, res: [10, 20, 20, 0], matFrom: 6 },
  sec6in_1:   { need: 'basic', screws: 1, res: [10, 20, 20, 0], matFrom: 6 },
  /* 鱼雷 */
  torp_mk15:  { need: 'basic', screws: 1, res: [20, 40, 30, 0], matFrom: 6, update: { to: 'torp_mk15r', mats: ['torp_mk15', 'torp_mk15'] } },
  torp_mk15r: { need: 'basic', screws: 1, res: [20, 40, 30, 0], matFrom: 6 },
  torp_mk18:  { need: 'basic', screws: 1, res: [20, 40, 30, 0], matFrom: 6 },
  torp_mk14:  { need: 'basic', screws: 1, res: [20, 40, 30, 0], matFrom: 6 },
  torp_21in_4i:{ need: 'basic', screws: 1, res: [20, 40, 30, 0], matFrom: 6, update: { to: 'torp_21in_4l', mats: ['torp_21in_4i', 'torp_21in_4i'] } },
  torp_21in_4l:{ need: 'basic', screws: 1, res: [20, 40, 30, 0], matFrom: 1 },
  torp_533_5i:{ need: 'basic', screws: 1, res: [20, 40, 30, 0], matFrom: 6, update: { to: 'torp_533_5l', mats: ['torp_533_5i', 'torp_533_5i'] } },
  torp_21in_6i:{ need: 'basic', screws: 1, res: [20, 40, 30, 0], matFrom: 6, update: { to: 'torp_21in_6l', mats: ['torp_21in_6i', 'torp_21in_6i'] } },
  torp_533_5l:{ need: 'basic', screws: 1, res: [20, 40, 30, 0], matFrom: 1 },
  torp_21in_6l:{ need: 'basic', screws: 1, res: [20, 40, 30, 0], matFrom: 1 },
  torp_mk16:  { need: 'basic', screws: 1, res: [20, 40, 30, 0], matFrom: 1 },
  /* 舰战 */
  f2a:        { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'f4f', mats: ['f2a', 'f2a'] } },
  f4f3:       { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'f4f', mats: ['f4f3', 'f4f3'] } },
  f4f:        { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'f4f_r', mats: ['f4f', 'f4f'] } },
  f4f_r:      { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'f6f', mats: ['f4f', 'f4f'] } },
  fm2:        { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'f6f5', mats: ['fm2', 'fm2'] } },
  f6f3:       { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'f6f', mats: ['f6f3', 'f6f3'] } },
  f6f:        { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6 },
  f6f5:       { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6 },
  f4u:        { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6 },
  xf5u:       { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 1 },
  /* 夜间舰战 */
  f4u2n:      { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6 },
  f6f3n:      { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'f6f5n', mats: ['f6f3n', 'f6f3n'] } },
  f6f5n:      { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 1 },
  /* 喷式舰战 */
  fr1:        { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 1 },
  /* 舰攻 */
  tbd:        { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'tbf', mats: ['tbd', 'tbd'] } },
  tbf:        { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'tbm', mats: ['tbd', 'tbd'] } },
  tbm:        { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'tbm3d', mats: ['tbm', 'tbm'] } },
  tbm3d:      { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 1 },
  /* 对潜哨戒机 */
  tbm3w:      { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6 },
  /* 舰爆 */
  sb2u2:      { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'sbd', mats: ['sb2u2', 'sb2u2'] } },
  sbd:        { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'sbd5', mats: ['sbd', 'sbd'] } },
  sbd5:       { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'sb2c', mats: ['sbd', 'sbd'] } },
  f4u1d:      { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'f4u4', mats: ['f4u1d', 'f4u1d'] } },
  sb2c3:      { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'sb2c5', mats: ['sb2c3', 'sb2c3'] } },
  sb2c:       { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6 },
  f4u4:       { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 1 },
  sb2c5:      { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 1 },
  /* 舰侦 */
  sbdvs2:     { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6 },
  /* 水侦 */
  soc:        { need: 'cv', screws: 1, res: [10, 10, 10, 20], matFrom: 6, update: { to: 'os2u', mats: ['soc', 'soc'] } },
  soc_r:      { need: 'cv', screws: 1, res: [10, 10, 10, 20], matFrom: 6, update: { to: 'os2u', mats: ['soc_r', 'soc_r'] } },
  os2u:       { need: 'cv', screws: 1, res: [10, 10, 10, 20], matFrom: 6, update: { to: 'pby', mats: ['soc', 'soc'] } },
  so3c:       { need: 'cv', screws: 1, res: [10, 10, 10, 20], matFrom: 6 },
  pby:        { need: 'cv', screws: 1, res: [10, 10, 10, 20], matFrom: 6, update: { to: 'pby5a', mats: ['pby', 'pby'] } },
  pby5a:      { need: 'cv', screws: 1, res: [10, 10, 10, 20], matFrom: 6 },
  /* 电探 */
  radar_mk22: { need: 'as', screws: 2, res: [10, 10, 10, 30], matFrom: 6, update: { to: 'radar_mk37', mats: ['radar_mk22', 'radar_mk22'] } },
  radar_mk37: { need: 'as', screws: 2, res: [10, 10, 10, 30], matFrom: 1 },
  radar_sg:   { need: 'as', screws: 2, res: [10, 10, 10, 30], matFrom: 6, update: { to: 'radar_sk', mats: ['radar_sg', 'radar_sg'] } },
  radar_sg_r: { need: 'as', screws: 2, res: [10, 10, 10, 30], matFrom: 6, update: { to: 'radar_sk_sg', mats: ['radar_sg_r', 'radar_sg_r'] } },
  radar_sk:   { need: 'as', screws: 2, res: [10, 10, 10, 30], matFrom: 6 },
  radar_sc:   { need: 'as', screws: 2, res: [10, 10, 10, 30], matFrom: 6 },
  radar_sg_i: { need: 'as', screws: 2, res: [10, 10, 10, 30], matFrom: 6, update: { to: 'radar_sg', mats: ['radar_sg_i', 'radar_sg_i'] } },
  radar_fc37: { need: 'as', screws: 2, res: [10, 10, 10, 30], matFrom: 6 },
  radar_sk_sg:{ need: 'as', screws: 2, res: [10, 10, 10, 30], matFrom: 1 },
  /* 高角炮/机枪/高射装置 */
  aa_5in:     { need: 'dd', screws: 1, res: [10, 30, 30, 0], matFrom: 6, update: { to: 'aa_5in_t', mats: ['aa_5in', 'aa_5in'] } },
  aa_5in_t:   { need: 'dd', screws: 1, res: [10, 30, 30, 0], matFrom: 6 },
  aa_mk51:    { need: 'dd', screws: 1, res: [10, 20, 20, 0], matFrom: 6 },
  aa_40mm:    { need: 'basic', screws: 1, res: [10, 20, 20, 0], matFrom: 6, update: { to: 'aa_40mm_r', mats: ['aa_40mm', 'aa_40mm'] } },
  aa_20mm:    { need: 'basic', screws: 1, res: [10, 20, 20, 0], matFrom: 6 },
  aa_40mm_r:  { need: 'basic', screws: 1, res: [10, 20, 20, 0], matFrom: 6 },
  /* 声呐/爆雷/投射机 */
  sonar_qc:   { need: 'dd', screws: 1, res: [20, 20, 20, 0], matFrom: 6, update: { to: 'sonar_qcr', mats: ['sonar_qc', 'sonar_qc'] } },
  sonar_qcr:  { need: 'dd', screws: 1, res: [20, 20, 20, 0], matFrom: 6 },
  dc_mk6:     { need: 'dd', screws: 1, res: [20, 20, 20, 0], matFrom: 6, update: { to: 'dc_mk9', mats: ['dc_mk6', 'dc_mk6'] } },
  dc_mk9:     { need: 'dd', screws: 1, res: [20, 20, 20, 0], matFrom: 6 },
  hedgehog:   { need: 'dd', screws: 1, res: [20, 20, 20, 0], matFrom: 6, update: { to: 'mk32', mats: ['hedgehog', 'hedgehog'] } },
  mk32:       { need: 'dd', screws: 1, res: [20, 20, 20, 0], matFrom: 6, update: { to: 'alpha', mats: ['mk32', 'mk32'] } },
  alpha:      { need: 'dd', screws: 1, res: [20, 20, 20, 0], matFrom: 1 },
  /* 穿甲弹/对空弹/照明弹 */
  ap_mk8:     { need: 'bb', screws: 2, res: [10, 90, 90, 0], matFrom: 6 },
  aa_mk53:    { need: 'bb', screws: 2, res: [10, 90, 90, 0], matFrom: 6 },
  star_mk9:   { need: 'basic', screws: 1, res: [10, 20, 20, 0], matFrom: 6 },
  /* 增设装甲 */
  bulge_m:    { need: 'bb', screws: 2, res: [10, 30, 120, 0], matFrom: 6, update: { to: 'bulge_l', mats: ['bulge_m', 'bulge_m'] } },
  bulge_l:    { need: 'bb', screws: 2, res: [10, 30, 150, 0], matFrom: 1 },
  /* 机关部强化 */
  boiler_h:   { need: 'cl', screws: 1, res: [10, 10, 60, 0], matFrom: 6 },
  /* 上陆用舟艇 */
  m4a1:       { need: 'dd', screws: 1, res: [20, 20, 40, 0], matFrom: 6 },
  /* 航空要员 */
  crew_vet:   { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6 },
  /* 设备 */
  lookout:    { need: 'dd', screws: 1, res: [10, 30, 30, 0], matFrom: 6 },
  smoke_gen:  { need: 'basic', screws: 1, res: [10, 10, 20, 0], matFrom: 6 },
  balloon:    { need: 'basic', screws: 1, res: [10, 10, 30, 0], matFrom: 6 }
};

/* 解锁类别中文名（UI 用） */
const IMPROVE_NEED_ZH = {
  basic: '基础装备', dd: '驱逐/海防舰二号舰', cl: '巡洋舰二号舰',
  bb: '战列舰二号舰', cv: '空母二号舰', as: '工作舰/水母二号舰'
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EQ, EquipmentData, SECRETARY_POOL: {}, secretaryKey, devPoolKey, devEntries, devFailShare, devMinReq,
    EQUIP_CAT_ZH, EQUIP_STAT_ZH, EQUIP_RARITY_ZH, SLOT, DEEP_EQUIP, IMPROVE, IMPROVE_NEED_ZH, DEV_SEC, DEV_POOL, DEV_SEC_ZH, DEV_POOL_ZH, DEV_SEC_DESC, CAT_ORDER };
}
