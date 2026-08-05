'use strict';
/* ============================================================
 * 装备数据（美国海军装备）
 * 字段: id, en, zh, cat, stat{fp,tp,aa,arm,asw,los,evd,bmb,avg},
 *       slot(可装备槽位类型), cost{...}(开发配方), buildable(可否开发), kai(改修上限,预留)
 * ============================================================ */

const SLOT = {
  SMALL_GUN: 1, MED_GUN: 2, BIG_GUN: 3, SECONDARY: 4, TORPEDO: 5,
  FIGHTER: 6, ATTACKER: 7, BOMBER: 8, SEAPLANE: 9, RADAR: 10,
  HAA: 11, MG: 12, SONAR_DC: 13, EQUIP: 14
};

const EQ = [
  /* ---------- 主炮（小） ---------- */
  { id: 'gun5in_30',  en: '5in/38 Single Mount', zh: '5inch单装炮 Mk30', cat: '小主炮', slot: SLOT.SMALL_GUN, stat: { fp: 2, aa: 4, evd: 1 }, cost: [10, 60, 60, 10], buildable: true, kai: 10 },
  { id: 'gun5in_38',  en: '5in/38 Twin Mount', zh: '5inch连装两用炮 Mk38', cat: '小主炮', slot: SLOT.SMALL_GUN, stat: { fp: 3, aa: 8, evd: 1 }, cost: [10, 90, 90, 20], buildable: true, kai: 10, rare: true },
  { id: 'gun5in_54',  en: '5in/54 Mk42', zh: '5inch连装炮 Mk42', cat: '小主炮', slot: SLOT.SMALL_GUN, stat: { fp: 4, aa: 5 }, cost: [10, 110, 100, 20], buildable: true, kai: 10, rare: true },
  /* ---------- 主炮（中） ---------- */
  { id: 'gun6in_3',   en: '6in/47 Triple Mk16', zh: '6inch三连装炮 Mk16', cat: '中主炮', slot: SLOT.MED_GUN, stat: { fp: 7 }, cost: [10, 120, 110, 10], buildable: true, kai: 9 },
  { id: 'gun6in_3r',  en: '6in/47 Triple Mk16 Mod', zh: '6inch三连装炮 Mk16改', cat: '中主炮', slot: SLOT.MED_GUN, stat: { fp: 9, aa: 2 }, cost: [10, 160, 150, 20], buildable: true, kai: 9, rare: true },
  { id: 'gun8in_9',   en: '8in/55 Triple Mk9', zh: '8inch三连装炮 Mk9', cat: '中主炮', slot: SLOT.MED_GUN, stat: { fp: 8 }, cost: [10, 150, 140, 10], buildable: true, kai: 9 },
  { id: 'gun8in_15',  en: '8in/55 Triple Mk15', zh: '8inch三连装炮 Mk15', cat: '中主炮', slot: SLOT.MED_GUN, stat: { fp: 10, aa: 1 }, cost: [10, 190, 180, 20], buildable: true, kai: 9, rare: true },
  { id: 'gun8in_r',   en: '8in/55 Triple Mk16', zh: '8inch三连装炮 Mk16', cat: '中主炮', slot: SLOT.MED_GUN, stat: { fp: 11 }, cost: [10, 220, 200, 20], buildable: true, kai: 9, rare: true },
  /* ---------- 主炮（大） ---------- */
  { id: 'gun14in_3',  en: '14in/50 Triple', zh: '14inch三连装炮', cat: '大主炮', slot: SLOT.BIG_GUN, stat: { fp: 14, arm: 1 }, cost: [10, 180, 170, 10], buildable: true, kai: 7 },
  { id: 'gun16in_45', en: '16in/45 Triple Mk6', zh: '16inch三连装炮 Mk6', cat: '大主炮', slot: SLOT.BIG_GUN, stat: { fp: 16 }, cost: [10, 250, 250, 10], buildable: true, kai: 7 },
  { id: 'gun16in_45r',en: '16in/45 Triple Mk6 Mod', zh: '16inch三连装炮 Mk6改', cat: '大主炮', slot: SLOT.BIG_GUN, stat: { fp: 18, aa: 1 }, cost: [10, 280, 270, 20], buildable: true, kai: 7, rare: true },
  { id: 'gun16in_50', en: '16in/50 Triple Mk7', zh: '16inch三连装炮 Mk7', cat: '大主炮', slot: SLOT.BIG_GUN, stat: { fp: 21 }, cost: [10, 310, 300, 30], buildable: false, kai: 7, rare: true },
  { id: 'gun16in_50r',en: '16in/50 Triple Mk7 Mod', zh: '16inch三连装炮 Mk7改', cat: '大主炮', slot: SLOT.BIG_GUN, stat: { fp: 23, aa: 2 }, cost: [10, 330, 320, 30], buildable: false, kai: 7, rare: true },
  /* ---------- 副炮 ---------- */
  { id: 'sec5in_1',   en: '5in/38 Dual Purpose', zh: '5inch单装两用炮', cat: '副炮', slot: SLOT.SECONDARY, stat: { fp: 1, aa: 3, evd: 1 }, cost: [10, 40, 40, 10], buildable: true, kai: 10 },
  { id: 'sec5in_2',   en: '5in/38 Twin DP Mk38', zh: '5inch连装两用炮 Mk38', cat: '副炮', slot: SLOT.SECONDARY, stat: { fp: 2, aa: 6, evd: 1 }, cost: [10, 70, 70, 20], buildable: true, kai: 10 },
  { id: 'sec6in_1',   en: '6in/47 Single', zh: '6inch单装炮', cat: '副炮', slot: SLOT.SECONDARY, stat: { fp: 2, aa: 1 }, cost: [10, 50, 40, 10], buildable: true, kai: 10 },
  /* ---------- 鱼雷 ---------- */
  { id: 'torp_mk15',  en: 'Mk15 Torpedo', zh: 'Mk15舰载鱼雷', cat: '鱼雷', slot: SLOT.TORPEDO, stat: { tp: 7 }, cost: [20, 60, 50, 20], buildable: true, kai: 12 },
  { id: 'torp_mk15r', en: 'Mk15 Mod Torpedo', zh: 'Mk15改舰载鱼雷', cat: '鱼雷', slot: SLOT.TORPEDO, stat: { tp: 10 }, cost: [30, 70, 50, 30], buildable: true, kai: 12, rare: true },
  { id: 'torp_mk14',  en: 'Mk14 Torpedo', zh: 'Mk14潜航鱼雷', cat: '鱼雷', slot: SLOT.TORPEDO, stat: { tp: 6 }, cost: [20, 60, 50, 20], buildable: true, kai: 12 },
  { id: 'torp_mk16',  en: 'Mk16 Torpedo', zh: 'Mk16新型鱼雷', cat: '鱼雷', slot: SLOT.TORPEDO, stat: { tp: 12 }, cost: [30, 80, 60, 40], buildable: false, kai: 12, rare: true },
  /* ---------- 舰战 ---------- */
  { id: 'f2a',        en: 'F2A Buffalo', zh: 'F2A水牛战斗机', cat: '舰战', slot: SLOT.FIGHTER, stat: { aa: 3 }, cost: [10, 10, 10, 30], buildable: true, kai: 7 },
  { id: 'f4f',        en: 'F4F Wildcat', zh: 'F4F野猫战斗机', cat: '舰战', slot: SLOT.FIGHTER, stat: { aa: 5 }, cost: [10, 20, 10, 40], buildable: true, kai: 7 },
  { id: 'f4f_r',      en: 'F4F Wildcat Mod', zh: 'F4F野猫改', cat: '舰战', slot: SLOT.FIGHTER, stat: { aa: 7 }, cost: [10, 20, 10, 50], buildable: true, kai: 7, rare: true },
  { id: 'f6f',        en: 'F6F Hellcat', zh: 'F6F地狱猫战斗机', cat: '舰战', slot: SLOT.FIGHTER, stat: { aa: 9 }, cost: [10, 20, 10, 60], buildable: true, kai: 7, rare: true },
  { id: 'f4u',        en: 'F4U Corsair', zh: 'F4U海盗战斗机', cat: '舰战', slot: SLOT.FIGHTER, stat: { aa: 11 }, cost: [10, 20, 10, 70], buildable: false, kai: 7, rare: true },
  /* ---------- 舰攻 ---------- */
  { id: 'tbd',        en: 'TBD Devastator', zh: 'TBD蹂躏者舰攻', cat: '舰攻', slot: SLOT.ATTACKER, stat: { tp: 5, bmb: 3, avg: 4 }, cost: [10, 20, 10, 40], buildable: true, kai: 7 },
  { id: 'tbf',        en: 'TBF Avenger', zh: 'TBF复仇者舰攻', cat: '舰攻', slot: SLOT.ATTACKER, stat: { tp: 8, bmb: 5, avg: 6 }, cost: [10, 20, 10, 50], buildable: true, kai: 7, rare: true },
  { id: 'tbm',        en: 'TBM Avenger Mod', zh: 'TBM复仇者改舰攻', cat: '舰攻', slot: SLOT.ATTACKER, stat: { tp: 10, bmb: 6, avg: 7 }, cost: [10, 20, 10, 60], buildable: false, kai: 7, rare: true },
  /* ---------- 舰爆 ---------- */
  { id: 'sbd',        en: 'SBD Dauntless', zh: 'SBD无畏舰爆', cat: '舰爆', slot: SLOT.BOMBER, stat: { bmb: 7, avg: 3 }, cost: [10, 20, 10, 40], buildable: true, kai: 7 },
  { id: 'sbd5',       en: 'SBD-5 Dauntless', zh: 'SBD-5无畏舰爆', cat: '舰爆', slot: SLOT.BOMBER, stat: { bmb: 9, avg: 4 }, cost: [10, 20, 10, 50], buildable: true, kai: 7, rare: true },
  { id: 'sb2c',       en: 'SB2C Helldiver', zh: 'SB2C地狱俯冲者舰爆', cat: '舰爆', slot: SLOT.BOMBER, stat: { bmb: 12, avg: 5 }, cost: [10, 20, 10, 60], buildable: false, kai: 7, rare: true },
  /* ---------- 水侦/水爆 ---------- */
  { id: 'soc',        en: 'SOC Seagull', zh: 'SOC海鸥水侦', cat: '水侦', slot: SLOT.SEAPLANE, stat: { asw: 2, los: 5 }, cost: [10, 10, 10, 20], buildable: true, kai: 7 },
  { id: 'os2u',       en: 'OS2U Kingfisher', zh: 'OS2U翠鸟水侦', cat: '水侦', slot: SLOT.SEAPLANE, stat: { asw: 3, los: 7 }, cost: [10, 10, 10, 30], buildable: true, kai: 7, rare: true },
  { id: 'pby',        en: 'PBY Catalina', zh: 'PBY卡特琳娜水侦', cat: '水侦', slot: SLOT.SEAPLANE, stat: { asw: 6, los: 8 }, cost: [10, 10, 10, 40], buildable: false, kai: 7, rare: true },
  /* ---------- 电探 ---------- */
  { id: 'radar_mk22', en: 'Mk22 FC Radar', zh: 'Mk22火控雷达', cat: '对空电探', slot: SLOT.RADAR, stat: { aa: 8, evd: 2, los: 2 }, cost: [10, 10, 10, 30], buildable: true, kai: 5, rare: true },
  { id: 'radar_mk37', en: 'Mk37 FC Radar', zh: 'Mk37火控雷达改', cat: '对空电探', slot: SLOT.RADAR, stat: { aa: 10, evd: 2, los: 3 }, cost: [10, 10, 10, 40], buildable: false, kai: 5, rare: true },
  { id: 'radar_sg',   en: 'SG Surface Radar', zh: 'SG水面搜索雷达', cat: '对水电探', slot: SLOT.RADAR, stat: { los: 8, evd: 1 }, cost: [10, 10, 10, 30], buildable: true, kai: 5, rare: true },
  { id: 'radar_sk',   en: 'SK Air Search Radar', zh: 'SK远程对空雷达', cat: '对空电探', slot: SLOT.RADAR, stat: { aa: 7, los: 6, evd: 1 }, cost: [10, 10, 10, 40], buildable: false, kai: 5, rare: true },
  /* ---------- 高角炮/机枪 ---------- */
  { id: 'aa_5in',     en: '5in/38 HAA', zh: '5inch单装高角炮', cat: '高角炮', slot: SLOT.HAA, stat: { fp: 1, aa: 7 }, cost: [10, 30, 30, 10], buildable: true, kai: 10 },
  { id: 'aa_5in_t',   en: '5in/38 Twin HAA', zh: '5inch连装高角炮 Mk33', cat: '高角炮', slot: SLOT.HAA, stat: { fp: 2, aa: 10 }, cost: [10, 60, 60, 20], buildable: true, kai: 10, rare: true },
  { id: 'aa_40mm',    en: '40mm Bofors Quad', zh: '40mm四连装博福斯', cat: '机枪', slot: SLOT.MG, stat: { aa: 9, evd: 1 }, cost: [10, 30, 30, 20], buildable: true, kai: 10, rare: true },
  { id: 'aa_20mm',    en: '20mm Oerlikon', zh: '20mm厄利孔机枪', cat: '机枪', slot: SLOT.MG, stat: { aa: 4 }, cost: [10, 20, 20, 10], buildable: true, kai: 10 },
  { id: 'aa_40mm_r',  en: '40mm Bofors Mod', zh: '40mm连装博福斯改', cat: '机枪', slot: SLOT.MG, stat: { aa: 11, evd: 1 }, cost: [10, 40, 40, 20], buildable: false, kai: 10, rare: true },
  /* ---------- 声呐/爆雷 ---------- */
  { id: 'sonar_qc',   en: 'QC Sonar', zh: 'QC声呐', cat: '声呐', slot: SLOT.SONAR_DC, stat: { asw: 8 }, cost: [30, 20, 30, 20], buildable: true, kai: 10 },
  { id: 'sonar_qcr',  en: 'QC Sonar Mod', zh: 'QC声呐改', cat: '声呐', slot: SLOT.SONAR_DC, stat: { asw: 11, los: 1 }, cost: [40, 20, 40, 20], buildable: true, kai: 10, rare: true },
  { id: 'dc_mk6',     en: 'Mk6 Depth Charge', zh: 'Mk6深水炸弹', cat: '爆雷', slot: SLOT.SONAR_DC, stat: { asw: 7 }, cost: [30, 30, 30, 10], buildable: true, kai: 10 },
  { id: 'dc_mk9',     en: 'Mk9 Depth Charge', zh: 'Mk9深水炸弹', cat: '爆雷', slot: SLOT.SONAR_DC, stat: { asw: 9 }, cost: [40, 30, 40, 10], buildable: false, kai: 10, rare: true },
  /* ---------- 炮弹/设备 ---------- */
  { id: 'ap_mk8',     en: 'Mk8 APC Shell', zh: 'Mk8穿甲弹', cat: '穿甲弹', slot: SLOT.EQUIP, stat: { fp: 4 }, cost: [10, 90, 90, 30], buildable: true, kai: 8, rare: true },
  { id: 'searchlight',en: 'Searchlight', zh: '探照灯', cat: '设备', slot: SLOT.EQUIP, stat: { evd: -1, los: 1 }, cost: [10, 10, 10, 10], buildable: true, kai: 0 },
  { id: 'souju',      en: 'Gun Director', zh: '火控指挥仪', cat: '设备', slot: SLOT.EQUIP, stat: { fp: 2, aa: 3 }, cost: [10, 20, 20, 20], buildable: true, kai: 0 },
];

/* ---------- 索引 ---------- */
const EquipmentData = {};
EQ.forEach(e => EquipmentData[e.id] = e);

/* ---------- 开发池：秘书舰类型 -> 可出装备 ---------- */
const SECRETARY_POOL = {
  CV:   ['f2a', 'f4f', 'f4f_r', 'f6f', 'f4u', 'tbd', 'tbf', 'tbm', 'sbd', 'sbd5', 'sb2c', 'soc', 'os2u', 'pby'],
  BB:   ['gun14in_3', 'gun16in_45', 'gun16in_45r', 'gun16in_50', 'gun16in_50r', 'sec5in_1', 'sec5in_2', 'sec6in_1', 'ap_mk8', 'souju'],
  CA:   ['gun8in_9', 'gun8in_15', 'gun8in_r', 'sec5in_1', 'sec5in_2', 'radar_sg', 'radar_mk22', 'souju'],
  CL:   ['gun6in_3', 'gun6in_3r', 'gun8in_9', 'sec5in_1', 'sec5in_2', 'souju', 'sonar_qc'],
  DD:   ['gun5in_30', 'gun5in_38', 'gun5in_54', 'torp_mk15', 'torp_mk15r', 'sonar_qc', 'sonar_qcr', 'dc_mk6', 'dc_mk9', 'aa_5in', 'aa_5in_t'],
  SS:   ['torp_mk14', 'sonar_qc', 'radar_sg'],
  AA:   ['aa_5in', 'aa_5in_t', 'aa_40mm', 'aa_20mm', 'aa_40mm_r', 'radar_mk22', 'radar_mk37', 'radar_sk'],
  AS:   ['dc_mk6', 'dc_mk9', 'sonar_qc', 'sonar_qcr', 'searchlight'],
  ALL:  ['searchlight', 'souju']
};

/* 秘书舰类型判定（用于开发池选择） */
function secretaryKey(secretaryShip) {
  if (!secretaryShip) return 'ALL';
  const t = secretaryShip.type;
  if (t === 'CV' || t === 'CVL' || t === 'CVB') return 'CV';
  if (t === 'BB' || t === 'BBV') return 'BB';
  if (t === 'CA' || t === 'CAV') return 'CA';
  if (t === 'CL' || t === 'CLT') return 'CL';
  if (t === 'DD' || t === 'DE') return 'DD';
  if (t === 'SS' || t === 'SSV') return 'SS';
  if (t === 'AS' || t === 'AV') return 'AS';
  return 'ALL';
}

/* 装备类型名称（中文） */
const EQUIP_CAT_ZH = {
  '小主炮': '小口径主炮', '中主炮': '中口径主炮', '大主炮': '大口径主炮', '副炮': '副炮',
  '鱼雷': '鱼雷', '舰战': '舰上战斗机', '舰攻': '舰上攻击机', '舰爆': '舰上爆击机',
  '水侦': '水上侦察机', '水爆': '水上爆击机', '对空电探': '对空电探', '对水电探': '对水电探',
  '高角炮': '高角炮', '机枪': '对空机枪', '声呐': '声呐', '爆雷': '爆雷', '穿甲弹': '穿甲弹', '设备': '设备'
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
  f6f:        { need: 'cv', screws: 1, res: [10, 20, 10, 30], matFrom: 6 },
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
  module.exports = { EQ, EquipmentData, SECRETARY_POOL, secretaryKey, EQUIP_CAT_ZH, SLOT, DEEP_EQUIP, IMPROVE, IMPROVE_NEED_ZH };
}
