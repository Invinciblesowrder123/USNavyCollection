'use strict';
/* ============================================================
 * 海域地图 + 深海敌军数据
 * 敌军槽位 slots: [{planes, aa}] 用于计算制空值（aa = 舰载机对空值）
 * ============================================================ */

/* ---------- 深海敌军模板 ---------- */
/* 参照wiki还原：驱逐I级(20/6/15/6/5/15/10/5/5)、驱逐II级(24/12/20/8/7/20/14/6/6)
 * 注：对空值(aa)已按本作数值体系调校（对空炮火S2击坠 普通节点每槽期望约3~6架、BOSS约8~10架），
 *     S2机制/公式仍与wiki一致（固定击坠+比例击坠+舰队防空补正），此处仅调整基础数值
 * 二期追加（wiki「二期」海域配置）：驱逐III级(ハ后期)、轻巡To级(ト)、重巡Ne级(ネ)、
 *     战列舰Ru级(ル)、轻空母Nu级(ヌ)、潜水Ka级(カ)、输送舰Wa级(ワ)，以及各栖姬 */
const DEEP_TEMPLATES = {
  edd1: { name: '深海军驱逐舰I级', type: 'DD', stats: [20, 6, 15, 4, 5, 15, 10, 5, 5] },
  edd2: { name: '深海军驱逐舰II级', type: 'DD', stats: [24, 12, 20, 5, 7, 20, 14, 6, 6] },
  edd2e:{ name: '深海军驱逐舰II级(精锐)', type: 'DD', stats: [30, 22, 26, 8, 10, 30, 28, 6, 8] },
  edd3: { name: '深海军驱逐舰III级', type: 'DD', stats: [30, 18, 24, 8, 10, 28, 30, 6, 8] },
  edd3e:{ name: '深海军驱逐舰III级(精锐)', type: 'DD', stats: [36, 26, 30, 10, 12, 34, 34, 6, 10] },
  ecl1: { name: '深海军轻巡洋舰He级', type: 'CL', stats: [30, 20, 12, 8, 10, 20, 22, 6, 6] },
  ecl1e:{ name: '深海军轻巡洋舰He级(精锐)', type: 'CL', stats: [38, 28, 16, 10, 14, 24, 26, 6, 8] },
  ecl2: { name: '深海军轻巡洋舰To级', type: 'CL', stats: [36, 26, 16, 10, 12, 24, 26, 6, 8] },
  ecl2e:{ name: '深海军轻巡洋舰To级(精锐)', type: 'CL', stats: [44, 34, 20, 12, 16, 28, 30, 6, 10] },
  eca1: { name: '深海军重巡洋舰Ru级', type: 'CA', stats: [45, 32, 10, 9, 22, 15, 15, 8, 8] },
  eca1e:{ name: '深海军重巡洋舰Ru级(精锐)', type: 'CA', stats: [55, 42, 12, 11, 28, 18, 18, 8, 10] },
  eca2: { name: '深海军重巡洋舰Ne级', type: 'CA', stats: [55, 40, 12, 11, 28, 16, 16, 8, 10] },
  eca2e:{ name: '深海军重巡洋舰Ne级(精锐)', type: 'CA', stats: [66, 52, 14, 13, 34, 19, 19, 8, 12] },
  ebb1: { name: '深海军战列舰Ta级', type: 'BB', stats: [60, 42, 0, 8, 32, 12, 10, 6, 6] },
  ebb1e:{ name: '深海军战列舰Ta级(精锐)', type: 'BB', stats: [72, 56, 0, 11, 40, 14, 12, 6, 8] },
  ebb2: { name: '深海军战列舰Ru级', type: 'BB', stats: [72, 54, 0, 10, 38, 13, 11, 6, 8] },
  ebb2e:{ name: '深海军战列舰Ru级(精锐)', type: 'BB', stats: [86, 68, 0, 12, 46, 15, 13, 6, 10] },
  ecv1: { name: '深海军空母Wo级', type: 'CV', stats: [45, 0, 0, 8, 20, 18, 0, 20, 8],
          slots: [{ planes: 24, aa: 4 }, { planes: 24, aa: 4 }, { planes: 18, aa: 5 }] },
  ecv1e:{ name: '深海军空母Wo级(精锐)', type: 'CV', stats: [55, 0, 0, 11, 26, 20, 0, 22, 10],
          slots: [{ planes: 30, aa: 5 }, { planes: 28, aa: 5 }, { planes: 22, aa: 5 }] },
  ecvl1:{ name: '深海军轻空母Nu级', type: 'CVL', stats: [40, 0, 0, 8, 18, 18, 0, 18, 8],
          slots: [{ planes: 22, aa: 4 }, { planes: 20, aa: 4 }, { planes: 16, aa: 4 }] },
  ecvl1e:{ name: '深海军轻空母Nu级(精锐)', type: 'CVL', stats: [50, 0, 0, 11, 24, 20, 0, 20, 10],
          slots: [{ planes: 26, aa: 5 }, { planes: 24, aa: 5 }, { planes: 20, aa: 5 }] },
  ess1: { name: '深海军潜水舰So级', type: 'SS', stats: [14, 5, 26, 0, 5, 25, 12, 5, 5] },
  ess1e:{ name: '深海军潜水舰So级(精锐)', type: 'SS', stats: [18, 7, 34, 0, 7, 30, 15, 5, 6] },
  ess2: { name: '深海军潜水舰Ka级', type: 'SS', stats: [18, 7, 30, 0, 6, 28, 14, 5, 6] },
  ess2e:{ name: '深海军潜水舰Ka级(精锐)', type: 'SS', stats: [22, 9, 38, 0, 8, 33, 17, 5, 8] },
  /* 重雷装巡洋舰CHI级（wiki 1-2 BOSS：驱逐/轻巡/雷巡，无重巡以上） */
  eclt1:{ name: '深海重雷装巡洋舰CHI级', type: 'CLT', stats: [33, 20, 46, 8, 12, 18, 18, 6, 6], boss: true },
  eclt1e:{ name: '深海重雷装巡洋舰CHI级(精锐)', type: 'CLT', stats: [42, 26, 58, 10, 16, 22, 22, 6, 8] },
  /* 输送舰Wa级（wiki：运输船无武装，作为练度/击破目标） */
  eap1: { name: '深海军输送舰Wa级', type: 'AP', stats: [28, 0, 0, 5, 6, 10, 0, 5, 5] },
  eap1e:{ name: '深海军输送舰Wa级(精锐)', type: 'AP', stats: [34, 0, 0, 6, 8, 12, 0, 5, 6] },
  eB1:  { name: '深海驱逐栖姬', type: 'DD', stats: [60, 40, 50, 11, 16, 42, 30, 10, 20], boss: true },
  eB2:  { name: '深海重巡栖姬', type: 'CA', stats: [85, 62, 20, 14, 45, 20, 16, 10, 15], boss: true },
  eB3:  { name: '深海空母栖姬', type: 'CV', stats: [95, 8, 0, 16, 50, 24, 0, 26, 18], boss: true,
          slots: [{ planes: 36, aa: 5 }, { planes: 36, aa: 5 }, { planes: 28, aa: 6 }, { planes: 24, aa: 6 }] },
  /* 二期栖姬：飞行场栖姬（wiki 2-4 冲之岛海域 BOSS）、北方栖姬（wiki 3-4 北方海域全域 BOSS）、潜水栖姬（wiki 2-2 巴士岛近海 BOSS） */
  eB6:  { name: '深海飞行场栖姬', type: 'CV', stats: [120, 0, 0, 14, 55, 5, 0, 20, 5], boss: true,
          slots: [{ planes: 36, aa: 6 }, { planes: 32, aa: 6 }, { planes: 26, aa: 7 }, { planes: 20, aa: 7 }] },
  eB7:  { name: '深海北方栖姬', type: 'BB', stats: [170, 84, 0, 16, 78, 22, 0, 16, 25], boss: true },
  eB8:  { name: '深海潜水栖姬', type: 'SS', stats: [70, 5, 60, 0, 8, 40, 0, 5, 20], boss: true },
  /* 三期高阶模板（wiki 二期/三期：潜水ヨ級、軽巡ツ級、戦艦レ級、空母ヲ級flagship、軽母ヌ級flagship、駆逐ニ級後期型、輸送ワ級flagship） */
  ess3: { name: '深海军潜水舰Yo级', type: 'SS', stats: [20, 8, 34, 0, 7, 30, 16, 5, 6] },
  ess3e:{ name: '深海军潜水舰Yo级(精锐)', type: 'SS', stats: [26, 10, 44, 0, 9, 36, 19, 5, 8] },
  ess3f:{ name: '深海军潜水舰Yo级(旗舰)', type: 'SS', stats: [34, 12, 56, 0, 11, 42, 22, 5, 10] },
  ecl3: { name: '深海军轻巡洋舰Tsu级', type: 'CL', stats: [48, 38, 22, 16, 18, 30, 32, 8, 10] },
  ebb3: { name: '深海军战列舰Re级', type: 'BB', stats: [95, 76, 0, 13, 52, 16, 14, 6, 10] },
  ebb3e:{ name: '深海军战列舰Re级(精锐)', type: 'BB', stats: [110, 92, 0, 15, 62, 18, 16, 6, 12] },
  edd4: { name: '深海军驱逐舰IV级', type: 'DD', stats: [36, 24, 34, 10, 13, 36, 36, 6, 10] },
  edd4e:{ name: '深海军驱逐舰IV级(精锐)', type: 'DD', stats: [42, 32, 40, 12, 16, 42, 42, 6, 12] },
  ecv1f:{ name: '深海军空母Wo级(旗舰)', type: 'CV', stats: [65, 0, 0, 13, 30, 22, 0, 24, 12],
          slots: [{ planes: 36, aa: 5 }, { planes: 34, aa: 5 }, { planes: 28, aa: 6 }] },
  ecvl1f:{ name: '深海军轻空母Nu级(旗舰)', type: 'CVL', stats: [60, 0, 0, 13, 28, 22, 0, 22, 12],
          slots: [{ planes: 30, aa: 5 }, { planes: 28, aa: 5 }, { planes: 24, aa: 6 }] },
  eap1f:{ name: '深海军输送舰Wa级(旗舰)', type: 'AP', stats: [40, 0, 0, 7, 10, 14, 0, 5, 7] },
  /* 三期栖姬：折钵山栖姬（硫磺岛，中部海域BOSS海域）、大和栖姬（莱特湾决战，南方海域BOSS海域） */
  eB9:  { name: '深海折钵山栖姬', type: 'BB', stats: [230, 88, 0, 18, 84, 10, 0, 18, 10], boss: true },
  eB10: { name: '深海大和栖姬', type: 'BB', stats: [280, 96, 0, 18, 92, 14, 0, 18, 20], boss: true }
};

/* ---------- 敌方舰队集合（按节点引用） ---------- */
const ENEMY_FLEETS = {
  F01: { formation: '单纵阵', ships: ['edd1', 'edd1', 'edd1'] },
  F02: { formation: '单纵阵', ships: ['edd2', 'edd2', 'ecl1'] },
  F03: { formation: '单纵阵', ships: ['edd2', 'edd2', 'ecl1'] },
  F04: { formation: '单纵阵', ships: ['edd2', 'edd2', 'ecl1', 'ecl1'] },
  F05: { formation: '轮形阵', ships: ['ecv1', 'edd2', 'edd2', 'ecl1', 'eca1'] },
  F06: { formation: '单纵阵', ships: ['eclt1', 'edd2', 'edd2', 'ecl1'] },
  F07: { formation: '轮形阵', ships: ['ecv1e', 'ecv1', 'edd2e', 'eca1', 'ecl1e'] },
  F08: { formation: '单纵阵', ships: ['ebb1', 'ebb1', 'eca1', 'ecl1', 'edd2', 'edd2'] },
  F09: { formation: '轮形阵', ships: ['eB3', 'ecv1e', 'eca1e', 'edd2e', 'ecl1e', 'ess1'] },
  F10: { formation: '轮形阵', ships: ['ecv1e', 'ebb1e', 'edd2e', 'ecl1e'] },
  F11: { formation: '梯形阵', ships: ['ess1', 'ess1e', 'edd2'] },
  F12: { formation: '单纵阵', ships: ['edd2e', 'edd2e', 'eca1e', 'ecl1e'] },
  /* ---- 1-4 欧胡岛防卫线（wiki 1-4 南西群岛防卫线：驱逐栖姬 + 水雷战队） ---- */
  F13: { formation: '单纵阵', ships: ['ecl1e', 'edd2e', 'edd2e'] },
  F14: { formation: '单纵阵', ships: ['eclt1', 'edd2e', 'edd2e', 'ecl1e'] },
  F15: { formation: '单纵阵', ships: ['eB1', 'edd2e', 'edd2e', 'ecl1e', 'eca1'] },
  /* ---- 2-1 图拉吉急袭（wiki 2-1 金兰半岛：前卫警戒 + 重巡flagship） ---- */
  F16: { formation: '单纵阵', ships: ['ecl1e', 'edd2e', 'edd2e', 'edd2e'] },
  F17: { formation: '单纵阵', ships: ['eca1e', 'edd2e', 'edd2e', 'ecl1e'] },
  /* ---- 2-2 铁底湾海峡（wiki 2-2 巴士岛近海：潜水栖姬，反潜海域） ---- */
  F18: { formation: '梯形阵', ships: ['ess1e', 'ess1e', 'edd2e'] },
  F19: { formation: '单纵阵', ships: ['eclt1e', 'edd2e', 'edd2e', 'ecl1e'] },
  F20: { formation: '单纵阵', ships: ['eca1e', 'edd3', 'edd2', 'ecl1e'] },
  F21: { formation: '梯形阵', ships: ['eB8', 'ess1', 'ess1', 'edd2e'] },
  /* ---- 2-3 圣克鲁斯海域（wiki 2-3 东部奥廖尔海：长航路哨戒，战列舰Ru级flagship BOSS） ---- */
  F22: { formation: '单纵阵', ships: ['ecl1e', 'edd2', 'edd2', 'edd2'] },
  F23: { formation: '单纵阵', ships: ['ecl1e', 'eclt1e', 'eclt1e', 'edd2e', 'edd2', 'edd2'] },
  F24: { formation: '复纵阵', ships: ['ecl1e', 'eap1', 'eap1', 'eap1', 'edd2e', 'edd2e'] },
  F25: { formation: '单纵阵', ships: ['eclt1e', 'eca1e', 'eca1', 'ecl1', 'edd2', 'edd2'] },
  F26: { formation: '单纵阵', ships: ['ebb2e', 'ecv1e', 'ecvl1e', 'edd3', 'edd3', 'edd2'] },
  /* ---- 2-4 瓜达尔卡纳尔攻略（wiki 2-4 冲之岛海域：飞行场栖姬，制空决战） ---- */
  F27: { formation: '轮形阵', ships: ['ecv1e', 'ecvl1e', 'eca1e', 'edd3', 'edd3'] },
  F28: { formation: '单纵阵', ships: ['eclt1e', 'edd3e', 'edd3e', 'eca1e'] },
  F30: { formation: '单纵阵', ships: ['eca2e', 'edd3', 'edd3', 'ecl1e'] },
  F29: { formation: '轮形阵', ships: ['eB6', 'eca2e', 'eca2e', 'edd3', 'edd3'] },
  /* ---- 3-1 北大平洋哨戒（wiki 3-1 莫雷海：通商破坏 + 战列舰Ru级flagship×2 BOSS） ---- */
  F31: { formation: '单纵阵', ships: ['ecl2e', 'ecl1e', 'edd3', 'edd2', 'edd2'] },
  F32: { formation: '单纵阵', ships: ['eca1e', 'ecl1e', 'edd3', 'edd2', 'edd2', 'edd2'] },
  F33: { formation: '轮形阵', ships: ['ecvl1e', 'eca1e', 'ecl1e', 'edd3', 'edd3', 'edd2'] },
  F34: { formation: '单纵阵', ships: ['eca1e', 'eca1e', 'ecl2', 'edd3', 'edd2', 'edd2'] },
  F35: { formation: '单纵阵', ships: ['ebb2e', 'ebb2e', 'ecl1e', 'edd3', 'edd3', 'eap1'] },
  /* ---- 3-2 基斯卡岛近海（wiki 3-2 基斯岛近海：驱逐舰队突入，包围舰队 BOSS） ---- */
  F36: { formation: '单纵阵', ships: ['eca2e', 'eca2e', 'ecl1e', 'edd3', 'edd2', 'edd2'] },
  F37: { formation: '单纵阵', ships: ['ecl2e', 'eclt1e', 'eclt1e', 'edd3', 'edd2', 'edd2'] },
  F38: { formation: '单纵阵', ships: ['ebb2e', 'eca2e', 'ecl1e', 'edd3', 'edd2', 'edd2'] },
  F39: { formation: '单纵阵', ships: ['ecl2e', 'edd3', 'edd3', 'eap1', 'eap1'] },
  /* ---- 3-3 阿图岛方向（wiki 3-3 阿尔锋西诺方向：战列舰Ta级flagship×2 BOSS） ---- */
  F40: { formation: '单纵阵', ships: ['ecl1e', 'edd3', 'edd3', 'edd2'] },
  F41: { formation: '轮形阵', ships: ['ecvl1e', 'eca2e', 'ecl1e', 'edd3', 'edd3'] },
  F42: { formation: '单纵阵', ships: ['eclt1e', 'edd3e', 'edd3e', 'eca2e', 'ecl1e'] },
  F43: { formation: '单纵阵', ships: ['ebb1e', 'ebb1e', 'eca2e', 'ecl1e', 'edd3', 'edd3'] },
  /* ---- 3-4 基斯卡攻略战（wiki 3-4 北方海域全域：北方栖姬 BOSS） ---- */
  F44: { formation: '单纵阵', ships: ['eca2e', 'eca2e', 'ecl2', 'edd3', 'edd3', 'edd2'] },
  F45: { formation: '轮形阵', ships: ['ecvl1e', 'ebb2e', 'eca2e', 'edd3e', 'edd3e'] },
  F46: { formation: '轮形阵', ships: ['eB7', 'ebb2e', 'ebb2e', 'ecvl1e', 'edd3e', 'edd3e'] },
  /* ---- 1-5 夏威夷近海哨戒（wiki 1-5 镇守府近海：EO 对潜哨戒，BOSS=潜水Yo级flagship；反潜点不耗弹药） ---- */
  F47: { formation: '梯形阵', ships: ['ess3', 'ess3'] },
  F48: { formation: '梯形阵', ships: ['ess3e', 'ess2', 'ess2'] },
  F49: { formation: '梯形阵', ships: ['ess2e', 'ess2e', 'ess2'] },
  F50: { formation: '梯形阵', ships: ['ess3f', 'ess2e', 'ess2e', 'edd3e'] },
  /* ---- 2-5 萨沃岛近海（wiki 2-5：EO 制空决战，BOSS=空母Wo级flagship×2） ---- */
  F51: { formation: '轮形阵', ships: ['ecv1e', 'ecvl1e', 'edd3e', 'edd3e'] },
  F52: { formation: '轮形阵', ships: ['ecv1f', 'ecv1e', 'edd3e', 'edd3e'] },
  F53: { formation: '轮形阵', ships: ['ecv1f', 'ecv1f', 'ebb2e', 'ecl2e', 'edd3e', 'edd3e'] },
  /* ---- 3-5 阿留申海域决战（wiki 3-5：EO，北方栖姬为道中，BOSS=轻巡Tsu级+输送舰队） ---- */
  F54: { formation: '单纵阵', ships: ['ecl2e', 'eclt1e', 'edd3e', 'edd3e', 'ecl1e'] },
  F55: { formation: '轮形阵', ships: ['ecv1f', 'ecv1e', 'ebb1e', 'edd3e', 'edd3e'] },
  F56: { formation: '轮形阵', ships: ['eB7', 'eca2e', 'ecl2e', 'edd3e', 'edd3e'] },
  F57: { formation: '单纵阵', ships: ['ecl2e', 'eclt1e', 'eclt1e', 'edd3e', 'edd3e'] },
  F58: { formation: '复纵阵', ships: ['eca2e', 'eca1e', 'ecl2e', 'edd3e', 'edd3e'] },
  F59: { formation: '复纵阵', ships: ['ecl3', 'eap1f', 'eap1f', 'ebb2e', 'edd3e', 'edd3e'] },
  /* ---- 4-1 马绍尔群岛近海（wiki 6-2：BOSS=轻空母Nu级flagship） ---- */
  F60: { formation: '梯形阵', ships: ['ess2e', 'ess2', 'edd3e'] },
  F61: { formation: '单纵阵', ships: ['eca2e', 'ecl2e', 'edd3e', 'edd3e'] },
  F62: { formation: '单纵阵', ships: ['eclt1e', 'eclt1e', 'edd3e', 'edd3e'] },
  F63: { formation: '轮形阵', ships: ['ecvl1f', 'eca2e', 'eca2e', 'edd3e', 'edd3e'] },
  /* ---- 4-2 夸贾林环礁海域（wiki 6-3：空袭+警戒，BOSS=轻母Nu级flagship+战列舰Ru级flagship） ---- */
  F64: { formation: '轮形阵', ships: ['ecvl1e', 'eca2e', 'edd3e', 'edd3e'] },
  F65: { formation: '单纵阵', ships: ['eca2e', 'eca1e', 'eclt1e', 'edd3e', 'edd3e'] },
  F66: { formation: '轮形阵', ships: ['ecvl1f', 'ebb2e', 'eca2e', 'edd3e', 'edd3e'] },
  /* ---- 4-3 塞班岛攻略（wiki 6-4：空袭+夜战，BOSS=机动部队） ---- */
  F67: { formation: '轮形阵', ships: ['ecv1e', 'ecvl1e', 'edd3e', 'edd3e'] },
  F68: { formation: '单纵阵', ships: ['eclt1e', 'eclt1e', 'edd3e', 'edd3e', 'ecl2e'] },
  F69: { formation: '单纵阵', ships: ['eca2e', 'eca2e', 'edd3e', 'edd3e', 'ecl2e'] },
  F70: { formation: '轮形阵', ships: ['ecv1f', 'ebb2e', 'eca2e', 'edd3e', 'edd3e'] },
  /* ---- 4-4 菲律宾海决战（马里亚纳火鸡射击，全空袭决战） ---- */
  F71: { formation: '轮形阵', ships: ['ecv1e', 'ecvl1f', 'edd3e', 'edd3e'] },
  F72: { formation: '轮形阵', ships: ['ecv1f', 'ecv1e', 'ecvl1f', 'edd3e', 'edd3e'] },
  F73: { formation: '轮形阵', ships: ['ecv1f', 'ecv1e', 'ecvl1f', 'ebb2e', 'edd3e', 'edd3e'] },
  /* ---- 4-5 硫磺岛近海（BOSS海域，need 4-4：折钵山栖姬） ---- */
  F74: { formation: '梯形阵', ships: ['ess3', 'ess2e', 'ess2e', 'edd3e'] },
  F75: { formation: '轮形阵', ships: ['ecv1f', 'ecvl1f', 'eca2e', 'edd3e', 'edd3e'] },
  F76: { formation: '单纵阵', ships: ['eclt1e', 'eclt1e', 'edd3e', 'edd3e', 'eca2e'] },
  F77: { formation: '轮形阵', ships: ['eB9', 'ebb3e', 'ecvl1f', 'eca2e', 'edd3e', 'edd3e'] },
  /* ---- 5-1 莱特湾前哨（wiki 5-1：BOSS=空母Wo级flagship） ---- */
  F78: { formation: '单纵阵', ships: ['eca2e', 'ecl2e', 'edd3e', 'edd3e'] },
  F79: { formation: '单纵阵', ships: ['ecv1f', 'ebb2e', 'eca2e', 'edd3e', 'edd3e'] },
  /* ---- 5-2 苏里高海峡（夜战海峡，老战列舰夜战线） ---- */
  F80: { formation: '单纵阵', ships: ['eclt1e', 'eclt1e', 'edd3e', 'edd3e'] },
  F81: { formation: '单纵阵', ships: ['ebb1e', 'ebb1e', 'eclt1e', 'edd3e', 'edd3e'] },
  F82: { formation: '单纵阵', ships: ['ebb1e', 'ebb1e', 'eclt1e', 'eclt1e', 'edd3e', 'edd3e'] },
  /* ---- 5-3 萨马岛近海（Taffy 3 vs 中央舰队，BOSS=战列舰Re级flagship） ---- */
  F83: { formation: '单纵阵', ships: ['ebb2e', 'eca2e', 'ecl2e', 'edd3e', 'edd3e'] },
  F84: { formation: '单纵阵', ships: ['ebb3e', 'ebb2e', 'eca2e', 'edd3e', 'edd3e'] },
  F85: { formation: '单纵阵', ships: ['ebb3e', 'ebb2e', 'eca2e', 'eca2e', 'edd3e', 'edd3e'] },
  /* ---- 5-4 恩加尼奥角（小泽机动部队，全空袭） ---- */
  F86: { formation: '轮形阵', ships: ['ecv1f', 'ecv1e', 'edd3e', 'edd3e'] },
  F87: { formation: '轮形阵', ships: ['ecv1f', 'ecv1e', 'ecvl1f', 'edd3e', 'edd3e'] },
  F88: { formation: '轮形阵', ships: ['ecv1f', 'ecv1e', 'ecvl1f', 'ebb2e', 'edd3e', 'edd3e'] },
  /* ---- 5-5 莱特湾决战（BOSS海域，need 5-4：大和栖姬） ---- */
  F89: { formation: '轮形阵', ships: ['ecv1f', 'ecv1e', 'edd3e', 'edd3e'] },
  F90: { formation: '单纵阵', ships: ['eclt1e', 'eclt1e', 'edd3e', 'edd3e', 'ecl2e'] },
  F91: { formation: '轮形阵', ships: ['eB10', 'ebb3e', 'ebb3e', 'ecv1f', 'eca2e', 'edd3e'] }
};

/* ---------- 海域定义 ----------
 * node: { type: 'battle'|'boss'|'resource'|'supply'|'empty', enemy, reward }
 * branch: 单对象 {at, if: {los?, dd?}, to: [...]} 或数组 [{at,...},...]（每个分歧点一条，按序判定）
 *         命中走 to 分支，否则走其余边（兜底路线）
 */
const MAPS = [
  {
    id: '1-1', name: '母港近海', desc: '珍珠港外海，驱逐舰的初阵。', stars: 3,
    start: 'S', boss: 'B', gauge: 3,
    admExp: { node: 10, boss: 20 },      // 提督经验（wiki 1-1: 道中+10 / BOSS+20）
    nodes: {
      S: { x: 0, y: 150 }, A: { x: 300, y: 150 }, B: { x: 620, y: 150 }
    },
    edges: [['S', 'A'], ['A', 'B']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F01' },
      B: { type: 'boss', enemy: 'F03' }
    },
    drops: ['benson', 'mahan', 'ward', 'reubenjames'],
    bossDrops: ['helena', 'portland', 'sandiego']
  },
  {
    id: '1-2', name: '所罗门哨戒', desc: '铁底湾的暗流与交锋，第一个出现弹药资源点的海域。', stars: 4,
    start: 'S', boss: 'D', gauge: 4,
    admExp: { node: 20, boss: 140 },     // 提督经验（wiki 1-2: 道中+20 / BOSS+140）
    nodes: {
      S: { x: 0, y: 200 }, A: { x: 260, y: 80 }, B: { x: 520, y: 80 }, C: { x: 260, y: 320 }, D: { x: 620, y: 200 }
    },
    edges: [['S', 'A'], ['S', 'C'], ['A', 'B'], ['B', 'D'], ['C', 'D']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F02' },
      B: { type: 'battle', enemy: 'F05' },
      C: { type: 'resource', reward: ['ammo'] },   // 弹药资源点（wiki：通过不消耗油弹及士气，获得弹药）
      D: { type: 'boss', enemy: 'F06' }
    },
    branch: { at: 'S', if: { los: 20 }, to: ['C'] },   // 索敌≥20发现弹药补给路线（C→D 一战到BOSS）；否则走 A→B 长路线
    drops: ['neworleans', 'fletcher', 'kidd', 'sims', 'bagley', 'langley'],
    bossDrops: ['fletcher', 'atlanta', 'independence']
  },
  {
    id: '1-3', name: '珍珠港近海', desc: '深海空母栖姬的机动部队迫近！这是舰队的决战！', stars: 5,
    start: 'S', boss: 'D', gauge: 5,
    admExp: { node: 40, boss: 380 },     // 提督经验（wiki 1-3: 道中+40 / BOSS+380）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 200, y: 100 }, B: { x: 420, y: 40 }, C: { x: 420, y: 260 }, D: { x: 660, y: 260 }, E: { x: 220, y: 420 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['B', 'D'], ['A', 'E'], ['E', 'C'], ['C', 'D']],
    defs: {
      S: { type: 'start' },
      A: { type: 'resource', reward: ['fuel', 'ammo', 'steel', 'baux'] },
      B: { type: 'battle', enemy: 'F07' },
      C: { type: 'battle', enemy: 'F08' },
      E: { type: 'supply' },
      D: { type: 'boss', enemy: 'F09' }
    },
    branch: { at: 'A', if: { los: 40 }, to: ['B'] },   // 索敌≥40 直取B；否则绕E补给
    drops: ['brooklyn', 'benson', 'gato', 'blue', 'hammann', 'omaha'],
    bossDrops: ['iowa', 'missouri', 'essex', 'baltimore']
  },
  {
    id: '1-4', name: '欧胡岛防卫线', desc: '深海军夜袭部队反扑近海！驱逐栖姬率领的水雷战队逼近欧胡岛！', stars: 6,
    start: 'S', boss: 'D', gauge: 5,
    admExp: { node: 50, boss: 500 },     // 提督经验（wiki 1-4: 道中+50 / BOSS+500）
    nodes: {
      S: { x: 0, y: 200 }, A: { x: 240, y: 60 }, B: { x: 240, y: 340 }, C: { x: 520, y: 200 }, D: { x: 760, y: 200 }
    },
    edges: [['S', 'A'], ['S', 'B'], ['A', 'C'], ['B', 'C'], ['C', 'D']],
    defs: {
      S: { type: 'start' },
      A: { type: 'resource', reward: ['steel'] },
      B: { type: 'battle', enemy: 'F13' },
      C: { type: 'battle', enemy: 'F14' },
      D: { type: 'boss', enemy: 'F15' }
    },
    branch: { at: 'S', if: { los: 30 }, to: ['A'] },   // 索敌≥30 走钢材资源点；否则直接迎击B
    drops: ['laffey', 'heermann', 'porter', 'pensacola', 'gudgeon'],
    bossDrops: ['johnston', 'sanfrancisco', 'quincy']
  },
  /* ==================== 2.所罗门群岛海域 ==================== */
  {
    id: '2-1', name: '图拉吉急袭', desc: '所罗门群岛的桥头堡！重巡旗舰镇守的登陆海域。', stars: 6,
    start: 'S', boss: 'C', gauge: 4,
    admExp: { node: 60, boss: 650 },     // 提督经验（wiki 2-1: 道中+60 / BOSS+650）
    nodes: {
      S: { x: 0, y: 200 }, A: { x: 240, y: 80 }, B: { x: 240, y: 320 }, C: { x: 520, y: 200 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['B', 'C']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F16' },
      B: { type: 'resource', reward: ['fuel'] },
      C: { type: 'boss', enemy: 'F17' }
    },
    drops: ['obannon', 'hoel', 'newyork', 'curtiss'],
    bossDrops: ['wichita', 'indianapolis', 'laffey']
  },
  {
    id: '2-2', name: '铁底湾海峡', desc: '深海潜水栖姬潜伏的海峡！反潜装备与夜战火力缺一不可！', stars: 7,
    start: 'S', boss: 'D', gauge: 5,
    admExp: { node: 70, boss: 820 },     // 提督经验（wiki 2-2: 道中+70 / BOSS+820）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 280, y: 80 }, B: { x: 280, y: 440 }, C: { x: 560, y: 440 }, D: { x: 800, y: 260 }
    },
    edges: [['S', 'A'], ['S', 'B'], ['A', 'C'], ['C', 'D'], ['B', 'D']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F18' },   // 对潜警戒（梯形阵潜水舰队）
      B: { type: 'battle', enemy: 'F19' },
      C: { type: 'battle', enemy: 'F20' },
      D: { type: 'boss', enemy: 'F21' }
    },
    branch: { at: 'S', if: { dd: 3 }, to: ['B'] },   // 驱逐舰≥3 直取水雷线（2战到BOSS）；否则绕反潜点（3战）
    drops: ['sumner', 'belleauwood', 'cushing', 'sullivan'],
    bossDrops: ['sbroberts', 'reno', 'indianapolis']
  },
  {
    id: '2-3', name: '圣克鲁斯海域', desc: '漫长的哨戒航线，舰队的补给生命线。敌战列舰精锐主力迫近！', stars: 8,
    start: 'S', boss: 'H', gauge: 5,
    admExp: { node: 80, boss: 1100 },    // 提督经验（wiki 2-3: 道中+80 / BOSS+1100）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 230, y: 80 }, B: { x: 230, y: 440 }, C: { x: 500, y: 260 },
      D: { x: 740, y: 80 }, G: { x: 740, y: 340 }, H: { x: 920, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['B', 'C'], ['C', 'D'], ['C', 'G'], ['D', 'H'], ['G', 'H']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F22' },
      B: { type: 'resource', reward: ['ammo'] },
      C: { type: 'battle', enemy: 'F23' },
      D: { type: 'resource', reward: ['fuel'] },
      G: { type: 'battle', enemy: 'F24' },   // 沟点：敌输送舰队
      H: { type: 'boss', enemy: 'F26' }
    },
    branch: { at: 'C', if: { los: 45 }, to: ['D'] },   // 索敌≥45 走燃料补给线直达BOSS；否则沟入输送舰队
    drops: ['princeton', 'sbroberts', 'aaronward', 'saltlakecity'],
    bossDrops: ['yorktown', 'hornet', 'southdakota']
  },
  {
    id: '2-4', name: '瓜达尔卡纳尔攻略', desc: '深海飞行场栖姬固守的机场！舰队全力夺取制空权！', stars: 8,
    start: 'S', boss: 'D', gauge: 5,
    admExp: { node: 90, boss: 1380 },    // 提督经验（wiki 2-4: 道中+90 / BOSS+1380）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 280, y: 260 }, B: { x: 560, y: 120 }, C: { x: 560, y: 400 }, D: { x: 820, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F27' },   // 制空决战（轮形阵空母机动部队）
      B: { type: 'battle', enemy: 'F28' },
      C: { type: 'battle', enemy: 'F30' },
      D: { type: 'boss', enemy: 'F29' }
    },
    branch: { at: 'A', if: { los: 60 }, to: ['B'] },   // 索敌≥60 走夜战水雷线；否则走哨戒线
    drops: ['archerfish', 'tang', 'honolulu', 'stlouis', 'chicago'],
    bossDrops: ['northcarolina', 'washington', 'wasp']
  },
  /* ==================== 3.阿留申群岛海域 ==================== */
  {
    id: '3-1', name: '北大平洋哨戒', desc: '舰队挺进北大平洋！深海战列舰精锐组成的侵攻舰队逼近！', stars: 9,
    start: 'S', boss: 'G', gauge: 5,
    admExp: { node: 90, boss: 1450 },    // 提督经验（wiki 3-1: 道中+90 / BOSS+1450）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 240, y: 260 }, B: { x: 480, y: 120 }, C: { x: 480, y: 400 },
      D: { x: 720, y: 120 }, F: { x: 720, y: 400 }, G: { x: 940, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D'], ['C', 'F'], ['D', 'F'], ['F', 'G']],
    defs: {
      S: { type: 'start' },
      A: { type: 'resource', reward: ['ammo'] },
      B: { type: 'battle', enemy: 'F31' },
      C: { type: 'battle', enemy: 'F32' },
      D: { type: 'battle', enemy: 'F33' },   // 空母机动支援部队
      F: { type: 'battle', enemy: 'F34' },
      G: { type: 'boss', enemy: 'F35' }
    },
    branch: [
      { at: 'A', if: { los: 55 }, to: ['C'] },   // 索敌≥55 走通商破坏水雷线；否则走哨戒舰队线
      { at: 'C', if: { dd: 2 }, to: ['F'] }      // 驱逐舰≥2 走重巡任务部队线；否则绕空母支援部队
    ],
    drops: ['tang', 'barb', 'balao', 'bowfin'],
    bossDrops: ['saratoga', 'enterprise', 'colorado']
  },
  {
    id: '3-2', name: '基斯卡岛近海', desc: '以驱逐舰为主力的高速舰队突入基斯卡岛！收容守备队！', stars: 9,
    start: 'S', boss: 'L', gauge: 5,
    admExp: { node: 100, boss: 1600 },   // 提督经验（wiki 3-2: 道中+100 / BOSS+1600）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 280, y: 80 }, B: { x: 280, y: 440 }, C: { x: 560, y: 260 },
      H: { x: 760, y: 440 }, L: { x: 820, y: 160 }
    },
    edges: [['S', 'A'], ['S', 'B'], ['A', 'C'], ['B', 'C'], ['C', 'H'], ['C', 'L'], ['H', 'L']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F36' },   // 敌北方游击任务部队（重巡精锐）
      B: { type: 'resource', reward: ['ammo'] },   // 著名弹药补给点
      C: { type: 'battle', enemy: 'F37' },   // 敌北方水雷战队
      H: { type: 'battle', enemy: 'F38' },   // 敌北方水上打击舰队（战列舰）
      L: { type: 'boss', enemy: 'F39' }      // 敌基斯卡包围舰队（输送船团）
    },
    branch: [
      { at: 'S', if: { dd: 5 }, to: ['B'] },   // 驱逐舰≥5 走弹药补给捷径；否则绕游击部队（wiki：驱逐主力带路）
      { at: 'C', if: { dd: 4 }, to: ['L'] }    // 驱逐舰≥4 直取BOSS；否则迎击战列舰打击舰队
    ],
    drops: ['kidd', 'gato', 'pampanito', 'wahoo'],
    bossDrops: ['yorktown', 'intrepid', 'alabama']
  },
  {
    id: '3-3', name: '阿图岛方向', desc: '逼近阿图岛！深海战列舰精锐筑成的北方防卫线！', stars: 9,
    start: 'S', boss: 'E', gauge: 6,
    admExp: { node: 110, boss: 1800 },   // 提督经验（wiki 3-3: 道中+110 / BOSS+1800）
    nodes: {
      S: { x: 0, y: 280 }, A: { x: 260, y: 280 }, B: { x: 520, y: 120 }, C: { x: 520, y: 440 },
      D: { x: 780, y: 280 }, E: { x: 980, y: 280 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D'], ['D', 'E']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F40' },
      B: { type: 'resource', reward: ['baux'] },
      C: { type: 'battle', enemy: 'F41' },   // 空母机动部队
      D: { type: 'battle', enemy: 'F42' },   // 夜战舰队
      E: { type: 'boss', enemy: 'F43' }
    },
    branch: { at: 'A', if: { los: 70 }, to: ['B'] },   // 索敌≥70 走铝土补给线；否则迎击空母机动部队
    drops: ['barb', 'archerfish', 'silversides', 'cabot'],
    bossDrops: ['essex', 'southdakota', 'massachusetts']
  },
  {
    id: '3-4', name: '基斯卡攻略战', desc: '深海北方栖姬的决战海域！夺回基斯卡岛，击破北方的钢铁要塞！', stars: 10,
    start: 'S', boss: 'D', gauge: 6,
    admExp: { node: 120, boss: 1990 },   // 提督经验（wiki 3-4: 道中+120 / BOSS+1990）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 280, y: 260 }, B: { x: 560, y: 120 }, C: { x: 560, y: 400 }, D: { x: 820, y: 260 }
    },
    edges: [['S', 'A'], ['S', 'B'], ['A', 'C'], ['B', 'C'], ['C', 'D']],
    defs: {
      S: { type: 'start' },
      A: { type: 'resource', reward: ['fuel'] },
      B: { type: 'battle', enemy: 'F44' },
      C: { type: 'battle', enemy: 'F45' },   // 空袭机动部队（制空要求高）
      D: { type: 'boss', enemy: 'F46' }
    },
    branch: { at: 'S', if: { los: 80 }, to: ['A'] },   // 索敌≥80 走燃料补给线；否则直接迎击
    drops: ['indiana', 'westvirginia', 'tennessee', 'newmexico'],
    bossDrops: ['missouri', 'enterprise', 'essex', 'intrepid']
  },
  /* ==================== BOSS海域（EO，need 同区域4号图） ==================== */
  {
    id: '1-5', name: '夏威夷近海哨戒', desc: '深海潜水舰队潜伏夏威夷近海！编成对潜警戒部队，扫荡航线上的潜水威胁！', stars: 7,
    start: 'S', boss: 'J', gauge: 6, need: '1-4',
    admExp: { node: 130, boss: 2200 },   // 提督经验（wiki 1-5: 道中+130 / BOSS+2200）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 260, y: 260 }, D: { x: 520, y: 140 }, E: { x: 520, y: 380 }, J: { x: 800, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'D'], ['D', 'E'], ['E', 'J']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F47', cost: { fuel: 0.08, ammo: 0 } },   // 反潜点不耗弹药（wiki 1-5）
      D: { type: 'battle', enemy: 'F48', cost: { fuel: 0.08, ammo: 0 } },
      E: { type: 'battle', enemy: 'F49', cost: { fuel: 0.08, ammo: 0 } },
      J: { type: 'boss', enemy: 'F50' }
    },
    drops: ['sumner', 'sbroberts'],
    bossDrops: ['atlanta', 'juneau', 'wichita', 'nevada', 'texas', 'vestal']
  },
  {
    id: '2-5', name: '萨沃岛近海', desc: '深海机动部队的制空决战！萨沃岛近海的天空由舰队掌控！', stars: 9,
    start: 'S', boss: 'D', gauge: 6, need: '2-4',
    admExp: { node: 140, boss: 2400 },   // 提督经验（wiki 2-5: 道中+140 / BOSS+2400）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 280, y: 260 }, B: { x: 560, y: 120 }, C: { x: 560, y: 400 }, D: { x: 820, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F51' },
      B: { type: 'resource', reward: ['ammo'] },
      C: { type: 'battle', enemy: 'F52' },
      D: { type: 'boss', enemy: 'F53' }
    },
    branch: { at: 'A', if: { los: 40 }, to: ['B'] },   // 索敌≥40 走弹药补给线；否则连战空袭部队
    drops: ['obannon', 'kidd'],
    bossDrops: ['lexington', 'ranger', 'washington', 'arizona', 'pennsylvania']
  },
  {
    id: '3-5', name: '阿留申海域决战', desc: '北方栖姬坐镇的阿留申泊地挡在前方！突入阿留申，击破敌增援主力！', stars: 11,
    start: 'S', boss: 'K', gauge: 7, need: '3-4',
    admExp: { node: 150, boss: 2600 },   // 提督经验（wiki 3-5: 道中+150 / BOSS+2600）
    nodes: {
      S: { x: 0, y: 260 }, B: { x: 250, y: 90 }, D: { x: 500, y: 90 }, H: { x: 750, y: 90 },
      J: { x: 750, y: 330 }, K: { x: 980, y: 210 }, F: { x: 250, y: 430 }, G: { x: 500, y: 430 }
    },
    edges: [['S', 'B'], ['S', 'F'], ['B', 'D'], ['D', 'H'], ['H', 'J'], ['J', 'K'], ['F', 'G'], ['G', 'K']],
    defs: {
      S: { type: 'start' },
      B: { type: 'battle', enemy: 'F54' },
      D: { type: 'battle', enemy: 'F55' },   // 空母机动部队（制空高）
      H: { type: 'battle', enemy: 'F56' },   // 北方AL泊地：北方栖姬道中（wiki 3-5 劝退点）
      J: { type: 'resource', reward: ['ammo'] },
      F: { type: 'battle', enemy: 'F57' },
      G: { type: 'battle', enemy: 'F58' },
      K: { type: 'boss', enemy: 'F59' }      // 敌增援主力：轻巡Tsu级+输送舰队
    },
    branch: { at: 'S', if: { dd: 5 }, to: ['F'] },   // 驱逐舰≥5 走下路（F-G-K）；否则走上路（B-D-H 遇北方栖姬）
    drops: ['tang', 'barb'],
    bossDrops: ['saratoga', 'intrepid', 'westvirginia', 'harder', 'albacore', 'cleveland']
  },
  /* ==================== 4.中太平洋海域（马绍尔/马里亚纳，wiki 6-X） ==================== */
  {
    id: '4-1', name: '马绍尔群岛近海', desc: '挺进中太平洋！深海在环礁之间布下了哨戒线。', stars: 11,
    start: 'S', boss: 'D', gauge: 5,
    admExp: { node: 130, boss: 2000 },   // 提督经验（wiki 6-1: 道中+130 / BOSS+2000）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 280, y: 80 }, B: { x: 280, y: 440 }, C: { x: 560, y: 260 }, D: { x: 820, y: 260 }
    },
    edges: [['S', 'A'], ['S', 'B'], ['A', 'C'], ['B', 'C'], ['C', 'D']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F60' },   // 对潜警戒
      B: { type: 'battle', enemy: 'F61' },
      C: { type: 'battle', enemy: 'F62' },   // 水雷战队
      D: { type: 'boss', enemy: 'F63' }
    },
    branch: { at: 'S', if: { los: 35 }, to: ['A'] },   // 索敌≥35 走反潜线；否则走哨戒线
    drops: ['sumner', 'sbroberts', 'cavalla', 'sealion'],
    bossDrops: ['lexington', 'northcarolina', 'hornet']
  },
  {
    id: '4-2', name: '夸贾林环礁海域', desc: '世界最大环礁的要塞！夺取铝土补给线并击破守军。', stars: 11,
    start: 'S', boss: 'D', gauge: 5,
    admExp: { node: 140, boss: 2100 },   // 提督经验（wiki 6-3: 道中+140 / BOSS+2100）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 280, y: 260 }, B: { x: 560, y: 120 }, C: { x: 560, y: 400 }, D: { x: 820, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F64' },   // 空袭
      B: { type: 'resource', reward: ['baux'] },
      C: { type: 'battle', enemy: 'F65' },
      D: { type: 'boss', enemy: 'F66' }
    },
    branch: { at: 'A', if: { los: 45 }, to: ['B'] },   // 索敌≥45 走铝土补给线；否则走警戒线
    drops: ['archerfish', 'gato', 'dace', 'darter'],
    bossDrops: ['yorktown', 'alabama', 'washington']
  },
  {
    id: '4-3', name: '塞班岛攻略', desc: '登陆塞班岛！突破空袭与夜战的双重防线。', stars: 12,
    start: 'S', boss: 'D', gauge: 5,
    admExp: { node: 150, boss: 2400 },   // 提督经验（wiki 6-4: 道中+150 / BOSS+2400）
    nodes: {
      S: { x: 0, y: 280 }, A: { x: 280, y: 280 }, B: { x: 560, y: 120 }, C: { x: 560, y: 440 }, D: { x: 820, y: 280 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F67' },   // 空袭
      B: { type: 'battle', enemy: 'F68' },   // 夜战舰队
      C: { type: 'battle', enemy: 'F69' },   // 攻略部队
      D: { type: 'boss', enemy: 'F70' }
    },
    branch: { at: 'A', if: { los: 55 }, to: ['B'] },   // 索敌≥55 走夜战线；否则连战攻略部队
    drops: ['barb', 'tang', 'houston', 'minneapolis'],
    bossDrops: ['wasp', 'massachusetts', 'indiana']
  },
  {
    id: '4-4', name: '菲律宾海决战', desc: '马里亚纳火鸡射击！深海机动部队倾巢而出，制空权决战！', stars: 12,
    start: 'S', boss: 'C', gauge: 5,
    admExp: { node: 170, boss: 2700 },   // 提督经验（wiki 6-5 前置：道中+170 / BOSS+2700）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 300, y: 260 }, B: { x: 600, y: 260 }, C: { x: 880, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['B', 'C']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F71' },   // 空袭前哨
      B: { type: 'battle', enemy: 'F72' },   // 空袭主力
      C: { type: 'boss', enemy: 'F73' }      // 机动部队本队
    },
    drops: ['heermann', 'laffey', 'nicholas', 'charlesausburne', 'gearing'],
    bossDrops: ['essex', 'southdakota', 'saratoga']
  },
  {
    id: '4-5', name: '硫磺岛近海', desc: 'BOSS海域！折钵山栖姬镇守的硫磺岛，寸土必争的恶战！', stars: 13,
    start: 'S', boss: 'D', gauge: 7, need: '4-4',
    admExp: { node: 180, boss: 3300 },   // 提督经验（wiki 6-5: 道中+180 / BOSS+3300）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 280, y: 260 }, B: { x: 560, y: 120 }, C: { x: 560, y: 400 }, D: { x: 820, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F74' },   // 对潜警戒
      B: { type: 'battle', enemy: 'F75' },   // 空袭
      C: { type: 'battle', enemy: 'F76' },   // 夜战
      D: { type: 'boss', enemy: 'F77' }
    },
    branch: { at: 'A', if: { los: 60 }, to: ['B'] },   // 索敌≥60 走空袭线；否则走夜战线
    drops: ['indiana', 'westvirginia'],
    bossDrops: ['enterprise', 'iowa', 'essex', 'maryland', 'ticonderoga', 'england']
  },
  /* ==================== 5.菲律宾海域（莱特湾，wiki 5-X） ==================== */
  {
    id: '5-1', name: '莱特湾前哨', desc: '菲律宾的大门已经敞开！扫清莱特湾的前哨防线。', stars: 13,
    start: 'S', boss: 'C', gauge: 5,
    admExp: { node: 120, boss: 1800 },   // 提督经验（wiki 5-1: 道中+120 / BOSS+1800）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 280, y: 100 }, B: { x: 280, y: 420 }, C: { x: 560, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['B', 'C']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F78' },
      B: { type: 'resource', reward: ['fuel'] },
      C: { type: 'boss', enemy: 'F79' }
    },
    drops: ['kidd', 'sumner'],
    bossDrops: ['intrepid', 'northcarolina', 'colorado']
  },
  {
    id: '5-2', name: '苏里高海峡', desc: '夜战的海峡！老战列舰组成的夜战阵线迎击深海舰队！', stars: 13,
    start: 'S', boss: 'C', gauge: 5,
    admExp: { node: 130, boss: 1900 },   // 提督经验（wiki 5-2: 道中+130 / BOSS+1900）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 300, y: 260 }, B: { x: 600, y: 260 }, C: { x: 880, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['B', 'C']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F80' },   // 水雷前卫（夜战）
      B: { type: 'battle', enemy: 'F81' },   // 战列夜战线
      C: { type: 'boss', enemy: 'F82' }
    },
    drops: ['tang', 'archerfish', 'franklin'],
    bossDrops: ['wasp', 'washington', 'hornet']
  },
  {
    id: '5-3', name: '萨马岛近海', desc: '深海中央舰队突破而来！护航舰队全体迎战！', stars: 14,
    start: 'S', boss: 'C', gauge: 6,
    admExp: { node: 140, boss: 2200 },   // 提督经验（wiki 5-3: 道中+140 / BOSS+2200）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 300, y: 260 }, B: { x: 600, y: 260 }, C: { x: 880, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['B', 'C']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F83' },   // 前卫
      B: { type: 'battle', enemy: 'F84' },   // 重打击部队
      C: { type: 'boss', enemy: 'F85' }      // 中央舰队（战列舰Re级flagship）
    },
    drops: ['barb', 'gato', 'bunkerhill'],
    bossDrops: ['essex', 'saratoga', 'southdakota']
  },
  {
    id: '5-4', name: '恩加尼奥角', desc: '深海机动部队的诱饵舰队！全歼恩加尼奥角的空母群！', stars: 14,
    start: 'S', boss: 'C', gauge: 6,
    admExp: { node: 150, boss: 2400 },   // 提督经验（wiki 5-4: 道中+150 / BOSS+2400）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 300, y: 260 }, D: { x: 600, y: 90 }, B: { x: 600, y: 430 }, C: { x: 880, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['A', 'D'], ['D', 'B'], ['B', 'C']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F86' },   // 空袭前哨
      D: { type: 'resource', reward: ['fuel'] },
      B: { type: 'battle', enemy: 'F87' },   // 空袭主力
      C: { type: 'boss', enemy: 'F88' }      // 机动部队本队
    },
    branch: { at: 'A', if: { los: 65 }, to: ['B'] },   // 索敌≥65 直取空袭主力；否则绕燃料补给线
    drops: ['obannon', 'porter', 'alaska'],
    bossDrops: ['missouri', 'yorktown', 'alabama']
  },
  {
    id: '5-5', name: '莱特湾决战', desc: 'BOSS海域！深海大和栖姬亲率的联合舰队，最后的决战！', stars: 15,
    start: 'S', boss: 'D', gauge: 8, need: '5-4',
    admExp: { node: 160, boss: 2600 },   // 提督经验（wiki 5-5: 道中+160 / BOSS+2600）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 280, y: 260 }, B: { x: 560, y: 120 }, C: { x: 560, y: 400 }, D: { x: 820, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D']],
    defs: {
      S: { type: 'start' },
      A: { type: 'resource', reward: ['fuel'] },
      B: { type: 'battle', enemy: 'F89' },   // 空袭
      C: { type: 'battle', enemy: 'F90' },   // 夜战前卫
      D: { type: 'boss', enemy: 'F91' }      // 联合舰队本队
    },
    branch: { at: 'A', if: { los: 70 }, to: ['B'] },   // 索敌≥70 走空袭线；否则走夜战线
    drops: ['indiana', 'westvirginia'],
    bossDrops: ['iowa', 'missouri', 'enterprise', 'saratoga', 'newjersey', 'wisconsin', 'midway']
  }
];

/* ---------- 远征 ---------- */
const EXPEDITIONS = [
  { id: 'ex1', name: '近海哨戒', time: 15, exp: 30, req: { ships: 2 }, reward: { fuel: 60, ammo: 60 }, desc: '在母港近海巡逻警戒。' },
  { id: 'ex2', name: '补给线巡逻', time: 30, exp: 60, req: { ships: 4, dd: 2 }, reward: { fuel: 120, ammo: 100, steel: 30 }, desc: '护送燃料船队通过补给线。' },
  { id: 'ex3', name: '护航任务', time: 45, exp: 90, req: { ships: 4, cl_or_dd_flagship: 1 }, reward: { steel: 180, baux: 30 }, desc: '为运输船队提供护航。' },
  { id: 'ex4', name: '空中侦察', time: 90, exp: 180, req: { ships: 4, cv_or_cvl: 1 }, reward: { baux: 200, fuel: 50 }, desc: '派出舰载机进行远距离航空侦察。' },
  { id: 'ex5', name: '对潜警戒', time: 120, exp: 240, req: { ships: 4, asw: 2 }, reward: { ammo: 240, steel: 160 }, desc: '扫荡航线上的深海军潜艇。' },
  { id: 'ex6', name: '海上护卫', time: 180, exp: 360, req: { ships: 5 }, reward: { fuel: 320, steel: 240 }, desc: '护卫大型运输船队横渡太平洋。' },
  { id: 'ex7', name: '航母特混支援', time: 360, exp: 500, req: { ships: 4, cv_or_cvl: 2 }, reward: { baux: 450, fuel: 200, ammo: 200, devMats: 1 }, desc: '机动部队出击，支援前方战线。' },
  { id: 'ex8', name: '长距离远征', time: 720, exp: 500, req: { ships: 6 }, reward: { fuel: 800, ammo: 800, steel: 600, baux: 200, devMats: 2 }, desc: '长途奔袭，展示海权的力量！' }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DEEP_TEMPLATES, ENEMY_FLEETS, MAPS, EXPEDITIONS };
}
