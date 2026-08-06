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
  /* ---------- 主炮（中） ---------- */
  { id: 'gun6in_3',   en: '6in/47 Triple Mk16', zh: '6inch三连装炮 Mk16', cat: '中主炮', slot: SLOT.MED_GUN, stat: { fp: 7 }, cost: [10, 120, 110, 10], buildable: true, kai: 9, r: 2, scrap: { steel: 15, ammo: 15 }, dev: { GUN: { AMMO: 2 }, MINE: { AMMO: 2 } } },
  { id: 'gun6in_3r',  en: '6in/47 Triple Mk16 Mod', zh: '6inch三连装炮 Mk16改', cat: '中主炮', slot: SLOT.MED_GUN, stat: { fp: 9, aa: 2 }, cost: [10, 160, 150, 20], buildable: true, kai: 9, rare: true, r: 3, scrap: { steel: 18, ammo: 18 }, dev: { GUN: { AMMO: 2 } } },
  { id: 'gun8in_9',   en: '8in/55 Triple Mk9', zh: '8inch三连装炮 Mk9', cat: '中主炮', slot: SLOT.MED_GUN, stat: { fp: 8 }, cost: [10, 150, 140, 10], buildable: true, kai: 9, r: 3, scrap: { steel: 18, ammo: 16 }, dev: { GUN: { AMMO: 4 } } },
  { id: 'gun8in_15',  en: '8in/55 Triple Mk15', zh: '8inch三连装炮 Mk15', cat: '中主炮', slot: SLOT.MED_GUN, stat: { fp: 10, aa: 1 }, cost: [10, 190, 180, 20], buildable: true, kai: 9, rare: true, r: 4, scrap: { steel: 20, ammo: 18 }, dev: { GUN: { AMMO: 2 } } },
  { id: 'gun8in_r',   en: '8in/55 Triple Mk16', zh: '8inch三连装炮 Mk16', cat: '中主炮', slot: SLOT.MED_GUN, stat: { fp: 11 }, cost: [10, 220, 200, 20], buildable: true, kai: 9, rare: true, r: 4, scrap: { steel: 22, ammo: 20 }, dev: { GUN: { AMMO: 2 } } },
  /* ---------- 主炮（大） ---------- */
  { id: 'gun14in_3',  en: '14in/50 Triple', zh: '14inch三连装炮', cat: '大主炮', slot: SLOT.BIG_GUN, stat: { fp: 14, arm: 1 }, cost: [10, 180, 170, 10], buildable: true, kai: 7, r: 2, scrap: { steel: 17, ammo: 18 }, dev: { GUN: { AMMO: 4 } } },
  { id: 'gun16in_45', en: '16in/45 Triple Mk6', zh: '16inch三连装炮 Mk6', cat: '大主炮', slot: SLOT.BIG_GUN, stat: { fp: 16 }, cost: [10, 250, 250, 10], buildable: true, kai: 7, r: 3, scrap: { steel: 25, ammo: 25 }, dev: { GUN: { AMMO: 8, BAUX: 2 } } },
  { id: 'gun16in_45r',en: '16in/45 Triple Mk6 Mod', zh: '16inch三连装炮 Mk6改', cat: '大主炮', slot: SLOT.BIG_GUN, stat: { fp: 18, aa: 1 }, cost: [10, 280, 270, 20], buildable: true, kai: 7, rare: true, r: 4, scrap: { steel: 27, ammo: 27 }, dev: { GUN: { AMMO: 4 } } },
  { id: 'gun16in_50', en: '16in/50 Triple Mk7', zh: '16inch三连装炮 Mk7', cat: '大主炮', slot: SLOT.BIG_GUN, stat: { fp: 21 }, cost: [10, 310, 300, 30], buildable: false, kai: 7, rare: true, r: 4, scrap: { steel: 28, ammo: 31 }, dev: { GUN: { AMMO: 2, BAUX: 2 } } },
  { id: 'gun16in_50r',en: '16in/50 Triple Mk7 Mod', zh: '16inch三连装炮 Mk7改', cat: '大主炮', slot: SLOT.BIG_GUN, stat: { fp: 23, aa: 2 }, cost: [10, 330, 320, 30], buildable: false, kai: 7, rare: true, r: 4, scrap: { steel: 31, ammo: 33 }, dev: { GUN: { AMMO: 2 } } },
  /* ---------- 副炮 ---------- */
  { id: 'sec5in_1',   en: '5in/38 Dual Purpose', zh: '5inch单装两用炮', cat: '副炮', slot: SLOT.SECONDARY, stat: { fp: 1, aa: 3, evd: 1 }, cost: [10, 40, 40, 10], buildable: true, kai: 10, r: 1, scrap: { steel: 4, ammo: 3 }, dev: { GUN: { AMMO: 4 }, MINE: { AMMO: 4 }, CV: { OIL: 4 } } },
  { id: 'sec5in_2',   en: '5in/38 Twin DP Mk38', zh: '5inch连装两用炮 Mk38', cat: '副炮', slot: SLOT.SECONDARY, stat: { fp: 2, aa: 6, evd: 1 }, cost: [10, 70, 70, 20], buildable: true, kai: 10, r: 2, scrap: { steel: 5, ammo: 4 }, dev: { GUN: { AMMO: 2, BAUX: 2 }, CV: { AMMO: 2 } } },
  { id: 'sec6in_1',   en: '6in/47 Single', zh: '6inch单装炮', cat: '副炮', slot: SLOT.SECONDARY, stat: { fp: 2, aa: 1 }, cost: [10, 50, 40, 10], buildable: true, kai: 10, r: 1, scrap: { steel: 4, ammo: 3 }, dev: { GUN: { AMMO: 2 } } },
  /* ---------- 鱼雷 ---------- */
  { id: 'torp_mk15',  en: 'Mk15 Torpedo', zh: 'Mk15舰载鱼雷', cat: '鱼雷', slot: SLOT.TORPEDO, stat: { tp: 7 }, cost: [20, 60, 50, 20], buildable: true, kai: 12, r: 1, scrap: { steel: 5, ammo: 6 }, dev: { MINE: { OIL: 8, AMMO: 4 } } },
  { id: 'torp_mk15r', en: 'Mk15 Mod Torpedo', zh: 'Mk15改舰载鱼雷', cat: '鱼雷', slot: SLOT.TORPEDO, stat: { tp: 10 }, cost: [30, 70, 50, 30], buildable: true, kai: 12, rare: true, r: 2, scrap: { steel: 6, ammo: 8 }, dev: { MINE: { OIL: 4 } } },
  { id: 'torp_mk14',  en: 'Mk14 Torpedo', zh: 'Mk14潜航鱼雷', cat: '鱼雷', slot: SLOT.TORPEDO, stat: { tp: 6 }, cost: [20, 60, 50, 20], buildable: true, kai: 12, r: 2, scrap: { steel: 5, ammo: 6 }, dev: { MINE: { OIL: 4 }, SUB: { OIL: 8, AMMO: 4, BAUX: 2 } } },
  { id: 'torp_mk16',  en: 'Mk16 Torpedo', zh: 'Mk16新型鱼雷', cat: '鱼雷', slot: SLOT.TORPEDO, stat: { tp: 12 }, cost: [30, 80, 60, 40], buildable: false, kai: 12, rare: true, r: 4, scrap: { steel: 8, ammo: 10 }, dev: { MINE: { OIL: 2 }, SUB: { OIL: 2, AMMO: 2 } } },
  /* ---------- 舰战 ---------- */
  { id: 'f2a',        en: 'F2A Buffalo', zh: 'F2A水牛战斗机', cat: '舰战', slot: SLOT.FIGHTER, stat: { aa: 3 }, cost: [10, 10, 10, 30], buildable: true, kai: 7, r: 1, scrap: { baux: 3 }, dev: { CV: { BAUX: 4 } } },
  { id: 'f4f',        en: 'F4F Wildcat', zh: 'F4F野猫战斗机', cat: '舰战', slot: SLOT.FIGHTER, stat: { aa: 5 }, cost: [10, 20, 10, 40], buildable: true, kai: 7, r: 1, scrap: { baux: 4 }, dev: { CV: { BAUX: 6 } } },
  { id: 'f4f_r',      en: 'F4F Wildcat Mod', zh: 'F4F野猫改', cat: '舰战', slot: SLOT.FIGHTER, stat: { aa: 7 }, cost: [10, 20, 10, 50], buildable: true, kai: 7, rare: true, r: 2, scrap: { baux: 5 }, dev: { CV: { BAUX: 2 } } },
  { id: 'fm2',        en: 'FM-2 Wildcat', zh: 'FM-2野猫改', cat: '舰战', slot: SLOT.FIGHTER, stat: { aa: 8 }, cost: [10, 20, 10, 55], buildable: true, kai: 7, rare: true, r: 3, scrap: { baux: 5 }, dev: { CV: { BAUX: 2 } } },
  { id: 'f6f',        en: 'F6F Hellcat', zh: 'F6F地狱猫战斗机', cat: '舰战', slot: SLOT.FIGHTER, stat: { aa: 9 }, cost: [10, 20, 10, 60], buildable: true, kai: 7, rare: true, r: 3, scrap: { baux: 6 }, dev: { CV: { BAUX: 2 } } },
  { id: 'f6f5',       en: 'F6F-5 Hellcat', zh: 'F6F-5地狱猫改', cat: '舰战', slot: SLOT.FIGHTER, stat: { aa: 12 }, cost: [10, 20, 10, 70], buildable: false, kai: 7, rare: true, r: 4, scrap: { baux: 7 }, dev: { CV: { BAUX: 2 } } },
  { id: 'f4u',        en: 'F4U Corsair', zh: 'F4U海盗战斗机', cat: '舰战', slot: SLOT.FIGHTER, stat: { aa: 11 }, cost: [10, 20, 10, 70], buildable: false, kai: 7, rare: true, r: 4, scrap: { baux: 7 }, dev: { CV: { BAUX: 2 } } },
  /* ---------- 舰攻 ---------- */
  { id: 'tbd',        en: 'TBD Devastator', zh: 'TBD蹂躏者舰攻', cat: '舰攻', slot: SLOT.ATTACKER, stat: { tp: 5, bmb: 3, avg: 4 }, cost: [10, 20, 10, 40], buildable: true, kai: 7, r: 1, scrap: { baux: 4 }, dev: { CV: { BAUX: 4 } } },
  { id: 'tbf',        en: 'TBF Avenger', zh: 'TBF复仇者舰攻', cat: '舰攻', slot: SLOT.ATTACKER, stat: { tp: 8, bmb: 5, avg: 6 }, cost: [10, 20, 10, 50], buildable: true, kai: 7, rare: true, r: 2, scrap: { baux: 5 }, dev: { CV: { BAUX: 2 } } },
  { id: 'tbm',        en: 'TBM Avenger Mod', zh: 'TBM复仇者改舰攻', cat: '舰攻', slot: SLOT.ATTACKER, stat: { tp: 10, bmb: 6, avg: 7 }, cost: [10, 20, 10, 60], buildable: false, kai: 7, rare: true, r: 3, scrap: { baux: 6 }, dev: { CV: { BAUX: 2 } } },
  /* ---------- 舰爆 ---------- */
  { id: 'sbd',        en: 'SBD Dauntless', zh: 'SBD无畏舰爆', cat: '舰爆', slot: SLOT.BOMBER, stat: { bmb: 7, avg: 3 }, cost: [10, 20, 10, 40], buildable: true, kai: 7, r: 1, scrap: { baux: 4 }, dev: { CV: { BAUX: 4 } } },
  { id: 'sbd5',       en: 'SBD-5 Dauntless', zh: 'SBD-5无畏舰爆', cat: '舰爆', slot: SLOT.BOMBER, stat: { bmb: 9, avg: 4 }, cost: [10, 20, 10, 50], buildable: true, kai: 7, rare: true, r: 2, scrap: { baux: 5 }, dev: { CV: { BAUX: 2 } } },
  { id: 'sb2c',       en: 'SB2C Helldiver', zh: 'SB2C地狱俯冲者舰爆', cat: '舰爆', slot: SLOT.BOMBER, stat: { bmb: 12, avg: 5 }, cost: [10, 20, 10, 60], buildable: false, kai: 7, rare: true, r: 3, scrap: { baux: 6 }, dev: { CV: { BAUX: 2 } } },
  /* ---------- 水侦/水爆 ---------- */
  { id: 'soc',        en: 'SOC Seagull', zh: 'SOC海鸥水侦', cat: '水侦', slot: SLOT.SEAPLANE, stat: { asw: 2, los: 5 }, cost: [10, 10, 10, 20], buildable: true, kai: 7, r: 1, scrap: { baux: 2 }, dev: { CV: { BAUX: 4, OIL: 2 } } },
  { id: 'os2u',       en: 'OS2U Kingfisher', zh: 'OS2U翠鸟水侦', cat: '水侦', slot: SLOT.SEAPLANE, stat: { asw: 3, los: 7 }, cost: [10, 10, 10, 30], buildable: true, kai: 7, rare: true, r: 2, scrap: { baux: 3 }, dev: { CV: { BAUX: 2 } } },
  { id: 'pby',        en: 'PBY Catalina', zh: 'PBY卡特琳娜水侦', cat: '水侦', slot: SLOT.SEAPLANE, stat: { asw: 6, los: 8 }, cost: [10, 10, 10, 40], buildable: false, kai: 7, rare: true, r: 3, scrap: { baux: 4 }, dev: { CV: { BAUX: 2 } } },
  /* ---------- 电探 ---------- */
  { id: 'radar_mk22', en: 'Mk22 FC Radar', zh: 'Mk22火控雷达', cat: '对空电探', slot: SLOT.RADAR, stat: { aa: 8, evd: 2, los: 2 }, cost: [10, 10, 10, 30], buildable: true, kai: 5, rare: true, r: 2, scrap: { steel: 10, baux: 10 }, dev: { GUN: { OIL: 2 }, CV: { OIL: 2 } } },
  { id: 'radar_mk37', en: 'Mk37 FC Radar', zh: 'Mk37火控雷达改', cat: '对空电探', slot: SLOT.RADAR, stat: { aa: 10, evd: 2, los: 3 }, cost: [10, 10, 10, 40], buildable: false, kai: 5, rare: true, r: 4, scrap: { steel: 12, baux: 12 }, dev: { GUN: { OIL: 2 }, CV: { OIL: 2 } } },
  { id: 'radar_sg',   en: 'SG Surface Radar', zh: 'SG水面搜索雷达', cat: '对水电探', slot: SLOT.RADAR, stat: { los: 8, evd: 1 }, cost: [10, 10, 10, 30], buildable: true, kai: 5, rare: true, r: 3, scrap: { steel: 12, baux: 10 }, dev: { GUN: { OIL: 4 }, CV: { OIL: 2 }, MINE: { OIL: 2 }, SUB: { BAUX: 2 } } },
  { id: 'radar_sk',   en: 'SK Air Search Radar', zh: 'SK远程对空雷达', cat: '对空电探', slot: SLOT.RADAR, stat: { aa: 7, los: 6, evd: 1 }, cost: [10, 10, 10, 40], buildable: false, kai: 5, rare: true, r: 4, scrap: { steel: 15, baux: 15 }, dev: { GUN: { OIL: 2 }, CV: { OIL: 2 } } },
  { id: 'radar_fc37', en: 'GFCS Mk.37', zh: 'GFCS Mk.37火控系统', cat: '设备', slot: SLOT.EQUIP, stat: { fp: 3, aa: 7, los: 2 }, cost: [10, 90, 90, 30], buildable: true, kai: 5, rare: true, r: 4, scrap: { steel: 15, baux: 12 }, dev: { GUN: { OIL: 2 } } },
  { id: 'radar_sg_i', en: 'SG Radar (Initial)', zh: 'SG雷达(初期型)', cat: '对水电探', slot: SLOT.RADAR, stat: { los: 7, evd: 1 }, cost: [10, 10, 10, 30], buildable: true, kai: 5, rare: true, r: 2, scrap: { steel: 10, baux: 8 }, dev: { GUN: { OIL: 2 }, CV: { OIL: 2 } } },
  /* ---------- 高角炮/机枪 ---------- */
  { id: 'aa_5in',     en: '5in/38 HAA', zh: '5inch单装高角炮', cat: '高角炮', slot: SLOT.HAA, stat: { fp: 1, aa: 7 }, cost: [10, 30, 30, 10], buildable: true, kai: 10, r: 2, scrap: { steel: 5 }, dev: { GUN: { OIL: 4 }, CV: { OIL: 4 } } },
  { id: 'aa_5in_t',   en: '5in/38 Twin HAA', zh: '5inch连装高角炮 Mk33', cat: '高角炮', slot: SLOT.HAA, stat: { fp: 2, aa: 10 }, cost: [10, 60, 60, 20], buildable: true, kai: 10, rare: true, r: 3, scrap: { steel: 8 }, dev: { GUN: { OIL: 2 }, CV: { OIL: 2 } } },
  { id: 'aa_40mm',    en: '40mm Bofors Quad', zh: '40mm四连装博福斯', cat: '机枪', slot: SLOT.MG, stat: { aa: 9, evd: 1 }, cost: [10, 30, 30, 20], buildable: true, kai: 10, rare: true, r: 2, scrap: { steel: 5 }, dev: { GUN: { OIL: 2 }, CV: { OIL: 2 } } },
  { id: 'aa_20mm',    en: '20mm Oerlikon', zh: '20mm厄利孔机枪', cat: '机枪', slot: SLOT.MG, stat: { aa: 4 }, cost: [10, 20, 20, 10], buildable: true, kai: 10, r: 1, scrap: { steel: 3 }, dev: { GUN: { OIL: 4 }, CV: { OIL: 4 }, MINE: { BAUX: 4, OIL: 4 } } },
  { id: 'aa_40mm_r',  en: '40mm Bofors Mod', zh: '40mm连装博福斯改', cat: '机枪', slot: SLOT.MG, stat: { aa: 11, evd: 1 }, cost: [10, 40, 40, 20], buildable: false, kai: 10, rare: true, r: 3, scrap: { steel: 6 }, dev: { CV: { OIL: 2 } } },
  /* ---------- 声呐/爆雷 ---------- */
  { id: 'sonar_qc',   en: 'QC Sonar', zh: 'QC声呐', cat: '声呐', slot: SLOT.SONAR_DC, stat: { asw: 8 }, cost: [30, 20, 30, 20], buildable: true, kai: 10, r: 1, scrap: { steel: 5, ammo: 3 }, dev: { MINE: { BAUX: 8, OIL: 4, AMMO: 2 }, SUB: { OIL: 4, BAUX: 4 } } },
  { id: 'sonar_qcr',  en: 'QC Sonar Mod', zh: 'QC声呐改', cat: '声呐', slot: SLOT.SONAR_DC, stat: { asw: 11, los: 1 }, cost: [40, 20, 40, 20], buildable: true, kai: 10, rare: true, r: 2, scrap: { steel: 7, ammo: 4 }, dev: { MINE: { BAUX: 4 }, SUB: { BAUX: 4 } } },
  { id: 'dc_mk6',     en: 'Mk6 Depth Charge', zh: 'Mk6深水炸弹', cat: '爆雷', slot: SLOT.SONAR_DC, stat: { asw: 7 }, cost: [30, 30, 30, 10], buildable: true, kai: 10, r: 1, scrap: { steel: 4, ammo: 3 }, dev: { MINE: { BAUX: 6, OIL: 4 } } },
  { id: 'dc_mk9',     en: 'Mk9 Depth Charge', zh: 'Mk9深水炸弹', cat: '爆雷', slot: SLOT.SONAR_DC, stat: { asw: 9 }, cost: [40, 30, 40, 10], buildable: false, kai: 10, rare: true, r: 2, scrap: { steel: 5, ammo: 4 }, dev: { MINE: { BAUX: 2 } } },
  /* ---------- 炮弹/设备 ---------- */
  { id: 'ap_mk8',     en: 'Mk8 APC Shell', zh: 'Mk8穿甲弹', cat: '穿甲弹', slot: SLOT.EQUIP, stat: { fp: 4 }, cost: [10, 90, 90, 30], buildable: true, kai: 8, rare: true, r: 3, scrap: { steel: 10, ammo: 10 }, dev: { GUN: { AMMO: 4, BAUX: 2 } } },
  { id: 'searchlight',en: 'Searchlight', zh: '探照灯', cat: '设备', slot: SLOT.EQUIP, stat: { evd: -1, los: 1 }, cost: [10, 10, 10, 10], buildable: true, kai: 0, r: 1, scrap: { steel: 2 }, dev: { GUN: { OIL: 2 }, CV: { AMMO: 2 }, MINE: { BAUX: 2 }, SUB: { OIL: 4 } } },
  { id: 'souju',      en: 'Gun Director', zh: '火控指挥仪', cat: '设备', slot: SLOT.EQUIP, stat: { fp: 2, aa: 3 }, cost: [10, 20, 20, 20], buildable: true, kai: 0, r: 2, scrap: { steel: 4, ammo: 3 }, dev: { GUN: { AMMO: 4, OIL: 4 } } },
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
  '水侦': '水上侦察机', '水爆': '水上爆击机', '对空电探': '对空电探', '对水电探': '对水电探',
  '高角炮': '高角炮', '机枪': '对空机枪', '声呐': '声呐', '爆雷': '爆雷', '穿甲弹': '穿甲弹', '设备': '设备'
};

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
  /* 中主炮 */
  gun6in_3:   { need: 'cl', screws: 1, res: [10, 60, 60, 0], matFrom: 6, update: { to: 'gun6in_3r', mats: ['gun6in_3', 'gun6in_3'] } },
  gun6in_3r:  { need: 'cl', screws: 1, res: [10, 60, 60, 0], matFrom: 6 },
  gun8in_9:   { need: 'cl', screws: 1, res: [10, 60, 60, 0], matFrom: 6, update: { to: 'gun8in_15', mats: ['gun8in_9', 'gun8in_9'] } },
  gun8in_15:  { need: 'cl', screws: 1, res: [10, 60, 60, 0], matFrom: 6, update: { to: 'gun8in_r', mats: ['gun8in_15', 'gun8in_15'] } },
  gun8in_r:   { need: 'cl', screws: 1, res: [10, 60, 60, 0], matFrom: 6 },
  /* 大主炮 */
  gun14in_3:  { need: 'bb', screws: 2, res: [10, 120, 120, 0], matFrom: 6, update: { to: 'gun16in_45', mats: ['gun14in_3', 'gun14in_3'] } },
  gun16in_45: { need: 'bb', screws: 2, res: [10, 120, 120, 0], matFrom: 6, update: { to: 'gun16in_45r', mats: ['gun14in_3', 'gun14in_3'] } },
  gun16in_45r:{ need: 'bb', screws: 2, res: [10, 120, 120, 0], matFrom: 6 },
  gun16in_50: { need: 'bb', screws: 2, res: [10, 120, 120, 0], matFrom: 1, update: { to: 'gun16in_50r', mats: ['gun16in_45', 'gun16in_45'] } },
  gun16in_50r:{ need: 'bb', screws: 2, res: [10, 120, 120, 0], matFrom: 6 },
  /* 副炮 */
  sec5in_1:   { need: 'basic', screws: 1, res: [10, 20, 20, 0], matFrom: 6, update: { to: 'sec5in_2', mats: ['sec5in_1', 'sec5in_1'] } },
  sec5in_2:   { need: 'basic', screws: 1, res: [10, 20, 20, 0], matFrom: 6 },
  sec6in_1:   { need: 'basic', screws: 1, res: [10, 20, 20, 0], matFrom: 6 },
  /* 鱼雷 */
  torp_mk15:  { need: 'basic', screws: 1, res: [20, 40, 30, 0], matFrom: 6, update: { to: 'torp_mk15r', mats: ['torp_mk15', 'torp_mk15'] } },
  torp_mk15r: { need: 'basic', screws: 1, res: [20, 40, 30, 0], matFrom: 6 },
  torp_mk14:  { need: 'basic', screws: 1, res: [20, 40, 30, 0], matFrom: 6 },
  torp_mk16:  { need: 'basic', screws: 1, res: [20, 40, 30, 0], matFrom: 1 },
  /* 舰战 */
  f2a:        { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'f4f', mats: ['f2a', 'f2a'] } },
  f4f:        { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'f4f_r', mats: ['f4f', 'f4f'] } },
  f4f_r:      { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'f6f', mats: ['f4f', 'f4f'] } },
  fm2:        { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'f6f5', mats: ['fm2', 'fm2'] } },
  f6f:        { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6 },
  f6f5:       { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6 },
  f4u:        { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6 },
  /* 舰攻 */
  tbd:        { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'tbf', mats: ['tbd', 'tbd'] } },
  tbf:        { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'tbm', mats: ['tbd', 'tbd'] } },
  tbm:        { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6 },
  /* 舰爆 */
  sbd:        { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'sbd5', mats: ['sbd', 'sbd'] } },
  sbd5:       { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6, update: { to: 'sb2c', mats: ['sbd', 'sbd'] } },
  sb2c:       { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6 },
  /* 水侦 */
  soc:        { need: 'cv', screws: 1, res: [10, 10, 10, 20], matFrom: 6, update: { to: 'os2u', mats: ['soc', 'soc'] } },
  os2u:       { need: 'cv', screws: 1, res: [10, 10, 10, 20], matFrom: 6, update: { to: 'pby', mats: ['soc', 'soc'] } },
  pby:        { need: 'cv', screws: 1, res: [10, 10, 10, 20], matFrom: 6 },
  /* 电探 */
  radar_mk22: { need: 'as', screws: 2, res: [10, 10, 10, 30], matFrom: 6, update: { to: 'radar_mk37', mats: ['radar_mk22', 'radar_mk22'] } },
  radar_mk37: { need: 'as', screws: 2, res: [10, 10, 10, 30], matFrom: 1 },
  radar_sg:   { need: 'as', screws: 2, res: [10, 10, 10, 30], matFrom: 6, update: { to: 'radar_sk', mats: ['radar_sg', 'radar_sg'] } },
  radar_sk:   { need: 'as', screws: 2, res: [10, 10, 10, 30], matFrom: 6 },
  radar_sg_i: { need: 'as', screws: 2, res: [10, 10, 10, 30], matFrom: 6, update: { to: 'radar_sg', mats: ['radar_sg_i', 'radar_sg_i'] } },
  radar_fc37: { need: 'as', screws: 2, res: [10, 10, 10, 30], matFrom: 6 },
  /* 高角炮/机枪 */
  aa_5in:     { need: 'dd', screws: 1, res: [10, 30, 30, 0], matFrom: 6, update: { to: 'aa_5in_t', mats: ['aa_5in', 'aa_5in'] } },
  aa_5in_t:   { need: 'dd', screws: 1, res: [10, 30, 30, 0], matFrom: 6 },
  aa_40mm:    { need: 'basic', screws: 1, res: [10, 20, 20, 0], matFrom: 6, update: { to: 'aa_40mm_r', mats: ['aa_40mm', 'aa_40mm'] } },
  aa_20mm:    { need: 'basic', screws: 1, res: [10, 20, 20, 0], matFrom: 6 },
  aa_40mm_r:  { need: 'basic', screws: 1, res: [10, 20, 20, 0], matFrom: 6 },
  /* 声呐/爆雷 */
  sonar_qc:   { need: 'dd', screws: 1, res: [20, 20, 20, 0], matFrom: 6, update: { to: 'sonar_qcr', mats: ['sonar_qc', 'sonar_qc'] } },
  sonar_qcr:  { need: 'dd', screws: 1, res: [20, 20, 20, 0], matFrom: 6 },
  dc_mk6:     { need: 'dd', screws: 1, res: [20, 20, 20, 0], matFrom: 6, update: { to: 'dc_mk9', mats: ['dc_mk6', 'dc_mk6'] } },
  dc_mk9:     { need: 'dd', screws: 1, res: [20, 20, 20, 0], matFrom: 6 },
  /* 穿甲弹 */
  ap_mk8:     { need: 'bb', screws: 2, res: [10, 90, 90, 0], matFrom: 6 }
};

/* 解锁类别中文名（UI 用） */
const IMPROVE_NEED_ZH = {
  basic: '基础装备', dd: '驱逐/海防舰二号舰', cl: '巡洋舰二号舰',
  bb: '战列舰二号舰', cv: '空母二号舰', as: '工作舰/水母二号舰'
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EQ, EquipmentData, SECRETARY_POOL: {}, secretaryKey, devPoolKey, devEntries, devFailShare, devMinReq,
    EQUIP_CAT_ZH, EQUIP_STAT_ZH, SLOT, DEEP_EQUIP, IMPROVE, IMPROVE_NEED_ZH, DEV_SEC, DEV_POOL, DEV_SEC_ZH, DEV_POOL_ZH, DEV_SEC_DESC };
}
