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
  ess4: { name: '深海军潜水舰Le级', type: 'SS', stats: [30, 4, 68, 0, 16, 38, 0, 12, 8] },
  ess4f: { name: '深海军潜水棲姬随舰', type: 'SS', stats: [42, 6, 88, 0, 20, 42, 0, 14, 10] },
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
  F18: { formation: '梯形阵', ships: ['ess4f', 'ess4', 'edd2e'] },
  F19: { formation: '单纵阵', ships: ['eclt1e', 'edd2e', 'edd2e', 'ecl1e'] },
  F20: { formation: '单纵阵', ships: ['eca1e', 'edd3', 'edd2', 'ecl1e'] },
  F20b: { formation: '梯形阵', ships: ['ess4', 'ess3', 'eca1e', 'edd2e'] },   // 2-2 C点：精锐潜艇+重巡混合伏击
  F21: { formation: '梯形阵', ships: ['eB8', 'ess1', 'ess1', 'edd2e'] },
  /* ---- 2-3 圣克鲁斯海域（wiki 2-3 东部奥廖尔海：长航路哨戒，战列舰Ru级flagship BOSS）
   * F22 改造为「圣克鲁斯机动部队」——本图 A 点航空战点（mode:'air'）的敌军：
   * 圣克鲁斯海战=史上航母对决，双空母（Wo级 + Nu级精锐）制空 130（单航母满载舰战 ≈289 → 可夺优势，双航母确保） */
  F22: { formation: '轮形阵', ships: ['ecv1', 'ecvl1e', 'eca1e', 'edd2e', 'edd2e'] },
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
  /* 1-5 A 点夜战点敌军：夜间逼近的水雷战队（水面舰 —— 对潜警戒部队要先过夜战这一关） */
  F92: { formation: '单纵阵', ships: ['ecl1e', 'edd3e', 'edd3e', 'edd2e'] },
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
  F91: { formation: '轮形阵', ships: ['eB10', 'ebb3e', 'ebb3e', 'ecv1f', 'eca2e', 'edd3e'] },
  /* ---- V0.302 批次3.2：新增特殊节点（sub/air/night）使用的敌军编成 ---- */
  /* 2-4 C 点潜艇伏击：哨戒线下的潜水部队 + 重巡护卫 */
  F93: { formation: '梯形阵', ships: ['ess4', 'ess3e', 'eca2e', 'edd3e'] },
  /* 2-5 A 点潜艇伏击：萨沃岛近海的潜水警戒线 */
  F94: { formation: '梯形阵', ships: ['ess4', 'ess3e', 'eca1e', 'edd3e'] },
  /* 3-2 A 点潜艇伏击：阿留申的潜艇战（基斯卡近海） */
  F95: { formation: '梯形阵', ships: ['ess4', 'ess3e', 'eca2e', 'edd3e'] },
  /* 3-5 G 点潜艇伏击：北方海域的混合防线 */
  F96: { formation: '梯形阵', ships: ['ess4', 'ess3e', 'eca2e', 'edd3e'] },
  /* ---- V0.304 批次1（子批 3c）：4-x/5-x 特殊节点铺开使用的新编成（全部复用既有深海模板，不新增数值单位） ---- */
  /* 4-1 C 点航空战：环礁上空的舰载机警戒队（制空 83，与 BOSS F63 同档） */
  F97: { formation: '轮形阵', ships: ['ecvl1f', 'eca2e', 'edd3e', 'edd3e'] },
  /* 5-1 A 点潜艇伏击：巴拉望方向先期破交的潜水战队（重巡护卫） */
  F98: { formation: '梯形阵', ships: ['ess4', 'ess3e', 'ess3e', 'eca2e', 'edd3e'] },
  /* 5-1 B 点航空战：前哨上空的空袭队（制空 ~150） */
  F99: { formation: '轮形阵', ships: ['ecv1e', 'ecvl1e', 'edd3e', 'edd3e'] },
  /* 5-3 A 点航空战：萨马岛清晨来袭的舰载机群（制空 ~156） */
  F100: { formation: '轮形阵', ships: ['ecvl1f', 'ecvl1e', 'ecl2e', 'edd3e'] },
  /* 5-5 G 点潜艇伏击：终章航线上的潜水警戒线 */
  F101: { formation: '梯形阵', ships: ['ess4', 'ess4', 'ess3e', 'eca2e', 'edd3e'] },
};

/* ---------- 海域定义 ----------
 * node: { type: 'battle'|'boss'|'resource'|'supply'|'whirlpool'|'empty', enemy, reward, mode?, cost? }
 *   mode（特殊节点，P1 批A/批B）：'sub' 潜艇点 / 'night' 夜战点 / 'air' 航空战点
 *     - 'sub'  ：敌方潜艇雷击按速力修正 + 单次 60% 耐久封顶
 *     - 'night'：跳过昼战索敌/航空阶段，直接夜战（结算 recon=null，不误判为索敌失败）
 *     - 'air'  ：舰队无航空战力（无航母或航母未搭载舰载机）时进入「被动防空」分支——
 *                敌机直接轰炸、我方仅对空炮火还击，单次轰炸伤害封顶 60% 耐久（不做硬死档）
 *   cost：覆写本节点油弹消耗（默认战斗点 油20%/弹20%，如 1-5 反潜点 油8%/弹0）
 *   whirlpool：{ lossBase } 只扣燃料，双封顶（min(lossBase, 持有量×10%)），编入电探减半
 * branch: 单对象 {at, if: {los?, dd?}, to: [...]} 或数组 [{at,...},...]（每个分歧点一条，按序判定）
 *         命中走 to 分支，否则走其余边（兜底路线）
 * objectives（可选，方向四·海域作战目标）：
 *   [{ id, type:'sRank'|'noHeavy'|'typeLimit', types[], min, desc, reward }]
 *   判定只在 BOSS 节点进行（checkObjectives）；**只做判定与一次性奖励，绝不改战斗逻辑**。
 *   type 的取舍原则：必须**迫使玩家改变编成**，不做"多点一下按钮"型目标（如"不进入夜战"）。
 *   全项目目标数 ≤15，且**不做全清奖励**（防清单化）。
 */
const MAPS = [
  {
    id: '1-1', name: '母港近海', desc: '珍珠港外海，驱逐舰的初阵。', stars: 3,
    diff: 1,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: '教学海域。2 艘初始舰即可开打，允许试错。',
    brief: '初阵。珍珠港外海，第一支护卫舰队在此成军。\n此处敌编成只有驱逐舰小队，火力与装甲都不高。带上驱逐舰，熟悉炮击与雷击的节奏——这是允许犯错的海域。',
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
    diff: 1,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: '索敌≥20 可切入补给线少打一场。B 点有敌空母，但不带舰战也过得去。',
    brief: '所罗门哨戒线。铁底湾的暗流下面，藏着一条弹药补给航线。\n索敌≥20 可切入补给线直取 BOSS；B 点敌编成含空母，未携带舰战将丧失制空，昼战特殊攻击全部无法发动。',
    /* threat 维度必须由本图实际节点推导（双向校验见 scripts/simulate.js「海域威胁维度」段）：
     * los ← branch.if.los；air ← B 点敌军 F05 含空母 Wo 级 */
    threat: ['los', 'air'],
    threatNote: '本海域考验索敌与制空。索敌≥20 可在 C 点发现弹药补给航线，直取 BOSS；索敌不足则绕行 A→B 长路线，多打一场。B 点敌编成含空母 Wo 级：未携带舰战将丧失制空，昼战特殊攻击全部无法发动。',
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
    /* 作战目标（方向四）：迫使改编成 —— 带航母争制空 vs 6 舰满编输出 */
    objectives: [
      { id: '1-2-cv', type: 'typeLimit', types: ['CV', 'CVB'], min: 1, desc: '编成含 ≥1 艘正规空母（B 点敌编成含空母，需争夺制空）', reward: { fuel: 300, steel: 300 } },
      { id: '1-2-s', type: 'sRank', desc: '以 S 胜击破 BOSS', reward: { ammo: 300, baux: 100 } }
    ],
    drops: ['neworleans', 'fletcher', 'kidd', 'sims', 'bagley', 'langley'],
    bossDrops: ['fletcher', 'atlanta', 'independence']
  },
  {
    id: '1-3', name: '珍珠港近海', desc: '深海空母栖姬的机动部队迫近！这是舰队的决战！', stars: 5,
    diff: 2,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: '第一道进度墙。BOSS 编成带 204 架舰载机，而本图之前只捞得到轻空母——**没有正规航母就会撞墙**（单航母编成通过率 28%，双航母 99%）。通关后掉落爱荷华级。',
    brief: '珍珠港近海。深海空母栖姬的机动部队已经压到警戒线内侧。\n制空、对潜、索敌三项同时吃紧：舰战不足会丢掉昼战特殊攻击，BOSS 编成含潜水舰，没有对潜舰艇就只能单方面挨雷击。',
    /* threat：air ← B 点敌军 F07 含空母；asw ← BOSS F09 编成含潜水舰；los ← branch.if.los */
    threat: ['air', 'asw', 'los'],
    threatNote: '本海域考验制空、对潜与索敌。索敌≥40 可直取 B 点空母部队；否则绕经 E 补给点调整状态。BOSS 编成含深海空母栖姬与潜水舰：未携带舰战将丧失制空，未编入对潜舰艇则会被潜艇单方面雷击。',
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
    diff: 1,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: '首个夜战点。夜战无航空阶段，航母在这条线上打不出伤害——让驱逐舰和轻巡顶上。索敌≥30。',
    brief: '昼间防空战报：敌夜袭部队预计 2200 时抵近欧胡岛外海。\n本海域设夜战节点。舰队将失去航空掩护，夜战火力（驱逐舰、轻巡洋舰）将决定胜负。',
    /* threat：los ← branch.if.los；night ← B 点 mode:'night' */
    threat: ['los', 'night'],
    threatNote: '本海域考验索敌与夜战火力。索敌≥30 可靠近 A 点钢材补给，否则正面迎击 B 点夜战。夜战点无昼战阶段：空母无法攻击，火力与雷装兼备的驱逐舰、轻巡洋舰是唯一输出。',
    start: 'S', boss: 'D', gauge: 5,
    admExp: { node: 50, boss: 500 },     // 提督经验（wiki 1-4: 道中+50 / BOSS+500）
    nodes: {
      S: { x: 0, y: 200 }, A: { x: 240, y: 60 }, B: { x: 240, y: 340 }, C: { x: 520, y: 200 }, D: { x: 760, y: 200 }
    },
    edges: [['S', 'A'], ['S', 'B'], ['A', 'C'], ['B', 'C'], ['C', 'D']],
    defs: {
      S: { type: 'start' },
      A: { type: 'resource', reward: ['steel'] },
      B: { type: 'battle', enemy: 'F13', mode: 'night' },   // 夜战点：跳过昼战直接夜战
      C: { type: 'battle', enemy: 'F14' },
      D: { type: 'boss', enemy: 'F15' }
    },
    branch: { at: 'S', if: { los: 30 }, to: ['A'] },   // 索敌≥30 走钢材资源点；否则直接迎击B
    /* 作战目标（方向四）：两个目标方向相反 —— 轻快夜战编成 vs 全程不掉血，迫使取舍 */
    objectives: [
      { id: '1-4-ddcl', type: 'typeLimit', types: ['DD', 'CL'], min: 3, desc: '编成含 ≥3 艘驱逐舰或轻巡洋舰（夜战节点无昼战阶段）', reward: { fuel: 400, ammo: 300 } },
      { id: '1-4-noheavy', type: 'noHeavy', desc: '全程无舰大破（整次出击中不出现大破）', reward: { steel: 500, baux: 200 } }
    ],
    drops: ['laffey', 'heermann', 'porter', 'pensacola', 'gudgeon'],
    bossDrops: ['johnston', 'sanfrancisco', 'quincy']
  },
  /* ==================== 2.所罗门群岛海域 ==================== */
  {
    id: '2-1', name: '图拉吉急袭', desc: '所罗门群岛的桥头堡！重巡旗舰镇守的登陆海域。', stars: 6,
    diff: 1,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: '纯水面图，无特殊节点。血条 4 格——把它当状态检查点，下一张图不会再这么客气。',
    brief: '图拉吉。登陆前的这一段航路难得安静。\n敌编成为轻巡与驱逐舰混成，没有航空战力。B 点有一座燃料补给点——把它当成检查舰队状态的机会，下一张图不会这么客气。',
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
    diff: 1,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: '潜艇伏击图。驱逐≥3 走水雷线（2 战到 BOSS），否则绕反潜点（3 战）。低速战列舰是潜艇最理想的靶子。',
    brief: '铁底湾。沉船和火炮构成了它的另一个名字——"铁底"。\n声呐监听确认：深海潜艇部队在此活动——本海域设潜艇伏击点（A、C 线）。舰队须编入反潜舰艇（驱逐舰、轻巡洋舰天生具备对潜能力，深水炸弹可强化输出）。\n注意：低速舰艇（21 节标准战列等）是潜艇最理想的猎物，高速新锐舰更易规避雷击。',
    /* threat：asw ← A/C 点 mode:'sub' */
    threat: ['asw'],
    threatNote: '本海域考验对潜。A 点与 C 点均为潜艇伏击点，未编入对潜舰艇的舰队将被单方面雷击。驱逐舰≥3 可走 B 点水雷线（2 战到 BOSS），否则绕行反潜点（3 战）。',
    start: 'S', boss: 'D', gauge: 5,
    admExp: { node: 70, boss: 820 },     // 提督经验（wiki 2-2: 道中+70 / BOSS+820）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 280, y: 80 }, B: { x: 280, y: 440 }, C: { x: 560, y: 440 }, D: { x: 800, y: 260 }
    },
    edges: [['S', 'A'], ['S', 'B'], ['A', 'C'], ['C', 'D'], ['B', 'D']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F18', mode: 'sub' },   // 潜艇点：潜水舰队伏击（梯形阵）
      B: { type: 'battle', enemy: 'F19' },
      C: { type: 'battle', enemy: 'F20b', mode: 'sub' },  // 潜艇点：潜艇+重巡混合伏击
      D: { type: 'boss', enemy: 'F21' }
    },
    branch: { at: 'S', if: { dd: 3 }, to: ['B'] },   // 驱逐舰≥3 直取水雷线（2战到BOSS）；否则绕反潜点（3战）
    /* 作战目标（方向四）：驱逐 ≥3 与「该图分支条件」同源 —— 想走 B 点水雷线本来就要 3 驱逐 */
    objectives: [
      { id: '2-2-dd3', type: 'typeLimit', types: ['DD'], min: 3, desc: '编成含 ≥3 艘驱逐舰（对潜能力 + 走 B 点水雷线）', reward: { fuel: 500, ammo: 500 } },
      { id: '2-2-s', type: 'sRank', desc: '以 S 胜击破 BOSS', reward: { steel: 400, devMats: 1 } }
    ],
    drops: ['sumner', 'belleauwood', 'cushing', 'sullivan'],
    bossDrops: ['sbroberts', 'reno', 'indianapolis']
  },
  {
    id: '2-3', name: '圣克鲁斯海域', desc: '1942 年，双方的航母在这片海域互相寻找了三天。敌机动部队与战列舰精锐同时迫近！', stars: 8,
    diff: 2,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: '航空战点 + 双空母 BOSS（制空 130）。不带航母会被动挨炸：单航母 45%，双航母 96%。索敌≥45 走燃料补给线。',
    brief: '圣克鲁斯。1942 年，双方的航母在这里互相寻找了三天。\n本海域含航空战节点。没有航空母舰的舰队将暴露在敌机轰炸之下。建议编入航母并搭载舰战。',
    /* threat：los ← C 点 branch.if.los；air ← A 点 mode:'air'（敌军 F22 含空母 Wo/Nu 级） */
    threat: ['los', 'air'],
    threatNote: '本海域考验索敌与制空。A 点即为航空战点：未编入航母的舰队无法展开航空战，只能以对空炮火被动迎击敌机轰炸。索敌≥45 可直取燃料补给线（B/D 资源点 → BOSS），否则沟入输送舰队多打一场。',
    start: 'S', boss: 'H', gauge: 5,
    admExp: { node: 80, boss: 1100 },    // 提督经验（wiki 2-3: 道中+80 / BOSS+1100）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 230, y: 80 }, B: { x: 230, y: 440 }, C: { x: 500, y: 260 },
      D: { x: 740, y: 80 }, G: { x: 740, y: 340 }, H: { x: 920, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['B', 'C'], ['C', 'D'], ['C', 'G'], ['D', 'H'], ['G', 'H']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F22', mode: 'air' },   // 航空战点：航母对决（无航母 → 被动防空，仅对空炮火还击）
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
    diff: 2,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: '四线同考：夜战 + 潜艇 + 航空 + 索敌≥60。制空要求高（单航母 37%，双航母 95%）。',
    brief: '瓜达尔卡纳尔。机场在敌人手里，舰队的每一寸制空都要自己抢回来。\nA 点与 BOSS 编成均带舰载机，未携带舰战将丧失制空，昼战特殊攻击全部无法发动。同时设夜战节点与潜艇伏击点——\n编成要同时照顾制空、夜战火力与对潜（驱逐舰、轻巡洋舰天生具备对潜能力）。',
    /* threat：asw ← C 点 mode:'sub'；night ← B 点 mode:'night'；los ← A 点 branch.if.los；air ← A/BOSS 敌军含舰载机 */
    threat: ['air', 'asw', 'los', 'night'],
    threatNote: '本海域四线并考。索敌≥60 走 B 点夜战线，否则迎击 C 点潜艇伏击。A 点含航空战力敌编成，未携带舰战将丧失制空；夜战点与潜艇点分别要求夜战火力与对潜手段。',
    start: 'S', boss: 'D', gauge: 5,
    admExp: { node: 90, boss: 1380 },    // 提督经验（wiki 2-4: 道中+90 / BOSS+1380）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 280, y: 260 }, B: { x: 560, y: 120 }, C: { x: 560, y: 400 }, D: { x: 820, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F27' },   // 制空决战（轮形阵空母机动部队）
      B: { type: 'battle', enemy: 'F28', mode: 'night' },   // 夜战点：夜战水雷线
      C: { type: 'battle', enemy: 'F93', mode: 'sub' },     // 潜艇点：哨戒线下的潜水伏击
      D: { type: 'boss', enemy: 'F29' }
    },
    branch: { at: 'A', if: { los: 60 }, to: ['B'] },   // 索敌≥60 走夜战水雷线；否则走哨戒线
    /* 作战目标（方向四）：双空母编成要求 —— 该图是制空决战，但要牺牲两个水面输出位 */
    objectives: [
      { id: '2-4-cv2', type: 'typeLimit', types: ['CV', 'CVB', 'CVL'], min: 2, desc: '编成含 ≥2 艘空母（该图是制空决战）', reward: { baux: 500, fuel: 300 } },
      { id: '2-4-s', type: 'sRank', desc: '以 S 胜击破 BOSS', reward: { steel: 500, devMats: 1 } }
    ],
    drops: ['archerfish', 'tang', 'honolulu', 'stlouis', 'chicago'],
    bossDrops: ['northcarolina', 'washington', 'wasp']
  },
  /* ==================== 3.阿留申群岛海域 ==================== */
  {
    id: '3-1', name: '北大平洋哨戒', desc: '舰队挺进北大平洋！深海战列舰精锐组成的侵攻舰队逼近！', stars: 9,
    diff: 1,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: '异常洋流扣燃料，编入电探损失减半。索敌≥55 走通商破坏线。',
    brief: '阿留申。雾是这里唯一的常驻居民。\n海图标注了异常洋流（漩涡）：舰队可能损失部分燃料——电探（雷达）可降低导航误差，损失减半。',
    /* threat：los ← branch.if.los；radar ← W 点 whirlpool；air ← D 点敌军 F33 含轻空母 Nu 级 */
    threat: ['los', 'air', 'radar'],
    threatNote: '本海域考验索敌、制空与电探。索敌≥55 可切上 C 点通商破坏线；D 点驻有敌空母机动支援部队，需舰战争夺制空权。B→W 段的异常洋流按持有燃料扣损，编入电探可使损失减半。',
    start: 'S', boss: 'G', gauge: 5,
    admExp: { node: 90, boss: 1450 },    // 提督经验（wiki 3-1: 道中+90 / BOSS+1450）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 240, y: 260 }, B: { x: 480, y: 120 }, C: { x: 480, y: 400 },
      D: { x: 720, y: 120 }, F: { x: 720, y: 400 }, G: { x: 940, y: 260 },
      W: { x: 600, y: 210 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['A', 'C'], ['B', 'W'], ['W', 'D'], ['C', 'D'], ['C', 'F'], ['D', 'F'], ['F', 'G']],
    defs: {
      S: { type: 'start' },
      A: { type: 'resource', reward: ['ammo'] },
      B: { type: 'battle', enemy: 'F31' },
      C: { type: 'battle', enemy: 'F32' },
      D: { type: 'battle', enemy: 'F33' },   // 空母机动支援部队
      F: { type: 'battle', enemy: 'F34' },
      G: { type: 'boss', enemy: 'F35' },
      W: { type: 'whirlpool', lossBase: 200 }   // 漩涡：阿留申异常洋流，只扣燃料，电探减半
    },
    branch: [
      { at: 'A', if: { los: 55 }, to: ['C'] },   // 索敌≥55 走通商破坏水雷线；否则走哨戒舰队线
      { at: 'C', if: { dd: 2 }, to: ['F'] }      // 驱逐舰≥2 走重巡任务部队线；否则绕空母支援部队
    ],
    /* 作战目标（方向四）：≥2 战列舰 —— 与「该图需要制空」直接冲突（战列舰挤掉空母位） */
    objectives: [
      { id: '3-1-bb2', type: 'typeLimit', types: ['BB', 'BBV'], min: 2, desc: '编成含 ≥2 艘战列舰（正面强攻，代价是制空位被挤占）', reward: { fuel: 600, steel: 600 } },
      { id: '3-1-noheavy', type: 'noHeavy', desc: '全程无舰大破', reward: { ammo: 600, baux: 300 } }
    ],
    drops: ['tang', 'barb', 'balao', 'bowfin'],
    bossDrops: ['saratoga', 'enterprise', 'colorado']
  },
  {
    id: '3-2', name: '基斯卡岛近海', desc: '以驱逐舰为主力的高速舰队突入基斯卡岛！收容守备队！', stars: 9,
    diff: 1,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: '潜艇伏击 + 驱逐≥5 走短路。BOSS 编成是 3-x 里最软的一张。',
    brief: '基斯卡近海。雾散不开，罗盘也读不准，水下的回响比海面的炮声更早报到。\n本海域设潜艇伏击点（A 点）与异常洋流（W 点）：编入驱逐舰、轻巡洋舰应对潜艇；\n电探（雷达）可把洋流造成的燃料损失减半——阿留申的浓雾不看你的航速，只看你的仪表。',
    /* threat：asw ← A 点 mode:'sub'；radar ← W 点 type:'whirlpool'（本图分支条件是驱逐数，无索敌维） */
    threat: ['asw', 'radar'],
    threatNote: '本海域考验对潜与电探。驱逐舰≥5 可走 B 点弹药补给捷径。A 点为潜艇伏击：低速大目标（21 节标准战列等）是潜艇最理想的猎物；W 点异常洋流按持有燃料扣损，编入电探可使损失减半。',
    start: 'S', boss: 'L', gauge: 5,
    admExp: { node: 100, boss: 1600 },   // 提督经验（wiki 3-2: 道中+100 / BOSS+1600）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 280, y: 80 }, B: { x: 280, y: 440 }, C: { x: 560, y: 260 },
      H: { x: 760, y: 440 }, L: { x: 820, y: 160 }, W: { x: 420, y: 170 }
    },
    edges: [['S', 'A'], ['S', 'B'], ['A', 'W'], ['W', 'C'], ['B', 'C'], ['C', 'H'], ['C', 'L'], ['H', 'L']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F95', mode: 'sub' },   // 潜艇点：阿留申潜艇战
      W: { type: 'whirlpool', lossBase: 220 },            // 漩涡：基斯卡近海浓雾洋流，只扣燃料，电探减半
      B: { type: 'resource', reward: ['ammo'] },   // 著名弹药补给点
      C: { type: 'battle', enemy: 'F37' },   // 敌北方水雷战队
      H: { type: 'battle', enemy: 'F38' },   // 敌北方水上打击舰队（战列舰）
      L: { type: 'boss', enemy: 'F39' }      // 敌基斯卡包围舰队（输送船团）
    },
    branch: [
      { at: 'S', if: { dd: 5 }, to: ['B'] },   // 驱逐舰≥5 走弹药补给捷径；否则绕游击部队（wiki：驱逐主力带路）
      { at: 'C', if: { dd: 4 }, to: ['L'] }    // 驱逐舰≥4 直取BOSS；否则迎击战列舰打击舰队
    ],
    /* 作战目标（方向四）：驱逐主力编成 —— 与该图「驱逐带路」的分支条件同源，但 4 驱逐意味着放弃重火力 */
    objectives: [
      { id: '3-2-dd4', type: 'typeLimit', types: ['DD'], min: 4, desc: '编成含 ≥4 艘驱逐舰（驱逐带路）', reward: { fuel: 600, ammo: 600 } },
      { id: '3-2-noheavy', type: 'noHeavy', desc: '全程无舰大破', reward: { steel: 600, screws: 3 } }
    ],
    drops: ['kidd', 'gato', 'pampanito', 'wahoo'],
    bossDrops: ['yorktown', 'intrepid', 'alabama']
  },
  {
    id: '3-3', name: '阿图岛方向', desc: '逼近阿图岛！深海战列舰精锐筑成的北方防卫线！', stars: 9,
    diff: 1,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: '夜战点 + 高耐久 BOSS（耐 308 / 火 228）。索敌≥70。',
    brief: '阿图岛方向。北方的夜很长，长到足够一场夜战打完还剩一半黑暗。\n本海域设夜战节点（D 点）与异常洋流（W 点）：夜战点没有昼战阶段，空母无法攻击，\n火力与雷装兼备的驱逐舰、轻巡洋舰是唯一输出；C 点驻有敌空母机动部队，需舰战争夺制空。',
    /* threat：air ← C 点含轻空母 Nu 级；los ← A 点 branch.if.los；night ← D 点 mode:'night'；radar ← W 点 whirlpool */
    threat: ['air', 'los', 'night', 'radar'],
    threatNote: '本海域四线并考。索敌≥70 走 B 点铝土补给线；C 点敌编成含空母，未携带舰战将丧失制空。D 点为夜战点：需要夜战火力支撑；W 点异常洋流按持有燃料扣损，电探可使损失减半。',
    start: 'S', boss: 'E', gauge: 6,
    admExp: { node: 110, boss: 1800 },   // 提督经验（wiki 3-3: 道中+110 / BOSS+1800）
    nodes: {
      S: { x: 0, y: 280 }, A: { x: 260, y: 280 }, B: { x: 520, y: 120 }, C: { x: 520, y: 440 },
      D: { x: 780, y: 280 }, E: { x: 980, y: 280 }, W: { x: 390, y: 360 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['A', 'W'], ['W', 'C'], ['B', 'D'], ['C', 'D'], ['D', 'E']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F40' },
      W: { type: 'whirlpool', lossBase: 220 },            // 漩涡：北方海域的异常洋流
      B: { type: 'resource', reward: ['baux'] },
      C: { type: 'battle', enemy: 'F41' },   // 空母机动部队
      D: { type: 'battle', enemy: 'F42', mode: 'night' },   // 夜战点：敌夜战舰队
      E: { type: 'boss', enemy: 'F43' }
    },
    branch: { at: 'A', if: { los: 70 }, to: ['B'] },   // 索敌≥70 走铝土补给线；否则迎击空母机动部队
    drops: ['barb', 'archerfish', 'silversides', 'cabot'],
    bossDrops: ['essex', 'southdakota', 'massachusetts']
  },
  {
    id: '3-4', name: '基斯卡攻略战', desc: '深海北方栖姬的决战海域！夺回基斯卡岛，击破北方的钢铁要塞！', stars: 10,
    diff: 4,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: '北方栖姬（耐 464 / 甲 218）。**这是第一张"没有双航母就过不去"的图**：单航母 10%，双航母 92%。索敌≥80（全项目最高）。',
    brief: '基斯卡攻略战。要塞在自己家门口，舰队却在别人的浓雾里航行。\n本海域含航空战节点（C 点）：没有航空母舰的舰队将暴露在敌机轰炸之下，建议编入航母并搭载舰战；\nB 线途经异常洋流（W 点），电探可使燃料损失减半。',
    /* threat：air ← C 点 mode:'air'（敌军 F45 含轻空母 Nu 级）；los ← S 点 branch.if.los；radar ← W 点 whirlpool */
    threat: ['air', 'los', 'radar'],
    threatNote: '本海域考验制空、索敌与电探。索敌≥80 走 A 点燃料补给线；C 点为航空战点：未编入航母的舰队只能以对空炮火被动迎击敌机轰炸。B 线途经异常洋流，编入电探可使燃料损失减半。',
    start: 'S', boss: 'D', gauge: 6,
    admExp: { node: 120, boss: 1990 },   // 提督经验（wiki 3-4: 道中+120 / BOSS+1990）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 280, y: 260 }, B: { x: 560, y: 120 }, C: { x: 560, y: 400 },
      D: { x: 820, y: 260 }, W: { x: 560, y: 260 }
    },
    edges: [['S', 'A'], ['S', 'B'], ['A', 'C'], ['B', 'W'], ['W', 'C'], ['C', 'D']],
    defs: {
      S: { type: 'start' },
      A: { type: 'resource', reward: ['fuel'] },
      B: { type: 'battle', enemy: 'F44' },
      W: { type: 'whirlpool', lossBase: 240 },            // 漩涡：北方海域的浓雾洋流
      C: { type: 'battle', enemy: 'F45', mode: 'air' },   // 航空战点：敌空袭机动部队（制空要求高）
      D: { type: 'boss', enemy: 'F46' }
    },
    branch: { at: 'S', if: { los: 80 }, to: ['A'] },   // 索敌≥80 走燃料补给线；否则直接迎击
    /* 作战目标（方向四 / 批次4.3）：≥2 空母 —— 与「走 B 线还能带够火力」直接冲突（空母挤掉水面输出位） */
    objectives: [
      { id: '3-4-cv2', type: 'typeLimit', types: ['CV', 'CVB', 'CVL'], min: 2, desc: '编成含 ≥2 艘空母（C 点航空战点需夺制空）', reward: { baux: 600, fuel: 400 } }
    ],
    drops: ['indiana', 'westvirginia', 'tennessee', 'newmexico'],
    bossDrops: ['missouri', 'enterprise', 'essex', 'intrepid']
  },
  /* ==================== BOSS海域（EO，need 同区域4号图） ==================== */
  {
    id: '1-5', name: '夏威夷近海哨戒', desc: '深海潜水舰队潜伏夏威夷近海！编成对潜警戒部队，扫荡航线上的潜水威胁！', stars: 7,
    diff: 1,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: 'EO 反潜哨戒。BOSS 是潜水栖姬（雷装 162）。注意 A 点是**水面夜战**——先过夜战，再进反潜。',
    brief: '夏威夷近海。夜间巡逻的水雷战队先一步咬住了舰队，天亮后才是潜艇的猎场。\n本海域设夜战节点：首战没有航空掩护也没有昼战炮击战，火力与雷装兼备的驱逐舰、轻巡洋舰是唯一输出。\n后续 D/E 点为反潜点（不消耗弹药），对潜舰艇（驱逐舰、轻巡洋舰）与深水炸弹是主力。',
    /* threat：asw ← D/E 点 mode:'sub'；night ← A 点 mode:'night' */
    threat: ['asw', 'night'],
    threatNote: '本海域是 EO 对潜哨戒。首点 A 为夜战点：夜战火力（驱逐舰、轻巡洋舰）决定能否站住脚；随后 D/E 为反潜点，未编入对潜舰艇的舰队将被单方面雷击。',
    start: 'S', boss: 'J', gauge: 6, need: '1-4',
    admExp: { node: 130, boss: 2200 },   // 提督经验（wiki 1-5: 道中+130 / BOSS+2200）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 260, y: 260 }, D: { x: 520, y: 140 }, E: { x: 520, y: 380 }, J: { x: 800, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'D'], ['D', 'E'], ['E', 'J']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F92', mode: 'night', cost: { fuel: 0.08, ammo: 0.08 } },   // 夜战点：水面接敌（夜战按夜战消耗弹药）
      D: { type: 'battle', enemy: 'F48', cost: { fuel: 0.08, ammo: 0 } },   // 反潜点不耗弹药（wiki 1-5）
      E: { type: 'battle', enemy: 'F49', cost: { fuel: 0.08, ammo: 0 } },
      J: { type: 'boss', enemy: 'F50' }
    },
    drops: ['sumner', 'sbroberts'],
    bossDrops: ['atlanta', 'juneau', 'wichita', 'nevada', 'texas', 'vestal']
  },
  {
    id: '2-5', name: '萨沃岛近海', desc: '深海机动部队的制空决战！萨沃岛近海的天空由舰队掌控！', stars: 9,
    diff: 3,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: 'EO 制空决战。BOSS 双空母 Wo 级旗舰 + 196 架舰载机，单航母 28% / 双航母 100%。',
    brief: '萨沃岛。夜战成名的海域，如今深海的机动部队把甲板推到了这里。\n本海域既设潜艇伏击点（A 点），也含航空战节点（C 点）：对潜舰艇与舰战缺一不可，\n没有航空母舰的舰队在 C 点将暴露在敌机轰炸之下。',
    /* threat：asw ← A 点 mode:'sub'；air ← C 点 mode:'air'（敌军 F52 含空母 Wo 级）；los ← A 点 branch.if.los */
    threat: ['air', 'asw', 'los'],
    threatNote: '本海域考验对潜、制空与索敌。索敌≥40 走 B 点弹药补给线（2 战到 BOSS），否则连战空袭部队。A 点为潜艇伏击：未编入驱逐舰、轻巡洋舰将被单方面雷击；C 点为航空战点，需要舰战争夺制空。',
    start: 'S', boss: 'D', gauge: 6, need: '2-4',
    admExp: { node: 140, boss: 2400 },   // 提督经验（wiki 2-5: 道中+140 / BOSS+2400）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 280, y: 260 }, B: { x: 560, y: 120 }, C: { x: 560, y: 400 }, D: { x: 820, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F94', mode: 'sub' },   // 潜艇点：萨沃岛近海的潜水警戒线
      B: { type: 'resource', reward: ['ammo'] },
      C: { type: 'battle', enemy: 'F52', mode: 'air' },   // 航空战点：双空母 Wo 级制空决战
      D: { type: 'boss', enemy: 'F53' }
    },
    branch: { at: 'A', if: { los: 40 }, to: ['B'] },   // 索敌≥40 走弹药补给线；否则连战空袭部队
    drops: ['obannon', 'kidd'],
    bossDrops: ['lexington', 'ranger', 'washington', 'arizona', 'pennsylvania']
  },
  {
    id: '3-5', name: '阿留申海域决战', desc: '北方栖姬坐镇的阿留申泊地挡在前方！突入阿留申，击破敌增援主力！', stars: 11,
    diff: 1,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: '三种特殊节点齐备（夜战 + 航空 + 潜艇），但 BOSS 编成偏软（耐 286，无栖姬）。驱逐≥5。',
    brief: '阿留申决战。区域 3 的毕业考：一夜的水雷战、一片洋流、一条潜水警戒线，最后是一支航母掩护的增援主力。\n本海域混合全部特殊节点 —— 夜战点（B）、航空战点（D）、潜艇伏击点（G）与异常洋流（W）。\n出击前请把编成想清楚：夜战火力、舰战、对潜舰艇与电探，缺哪一样都会在某一环被打断。',
    /* threat：asw ← G 点 mode:'sub'；night ← B 点 mode:'night'；air ← D 点 mode:'air'；radar ← W 点 whirlpool
     *（本图分支条件为驱逐数，无索敌维） */
    threat: ['air', 'asw', 'night', 'radar'],
    threatNote: '本海域是区域 3 的毕业考，四类特殊节点同时出现。驱逐舰≥5 走下路（W-F-G-K），否则走上路（B-D-H 会遭遇北方栖姬）。B 点为夜战点：需要夜战火力；D 点为航空战点：需要舰战争夺制空；G 点为潜艇伏击：需要对潜能力（驱逐舰、轻巡洋舰天生具备）；W 点异常洋流按持有燃料扣损，电探可使损失减半。',
    start: 'S', boss: 'K', gauge: 7, need: '3-4',
    admExp: { node: 150, boss: 2600 },   // 提督经验（wiki 3-5: 道中+150 / BOSS+2600）
    nodes: {
      S: { x: 0, y: 260 }, B: { x: 250, y: 90 }, D: { x: 500, y: 90 }, H: { x: 750, y: 90 },
      J: { x: 750, y: 330 }, K: { x: 980, y: 210 }, F: { x: 250, y: 430 }, G: { x: 500, y: 430 },
      W: { x: 125, y: 345 }
    },
    edges: [['S', 'B'], ['S', 'W'], ['W', 'F'], ['B', 'D'], ['D', 'H'], ['H', 'J'], ['J', 'K'], ['F', 'G'], ['G', 'K']],
    defs: {
      S: { type: 'start' },
      B: { type: 'battle', enemy: 'F54', mode: 'night' },   // 夜战点：北方水雷战队夜袭
      W: { type: 'whirlpool', lossBase: 240 },              // 漩涡：下路途经的异常洋流
      D: { type: 'battle', enemy: 'F55', mode: 'air' },     // 航空战点：空母机动部队（制空高）
      H: { type: 'battle', enemy: 'F56' },   // 北方AL泊地：北方栖姬道中（wiki 3-5 劝退点）
      J: { type: 'resource', reward: ['ammo'] },
      F: { type: 'battle', enemy: 'F57' },
      G: { type: 'battle', enemy: 'F96', mode: 'sub' },     // 潜艇点：混编防线的潜水警戒
      K: { type: 'boss', enemy: 'F59' }      // 敌增援主力：轻巡Tsu级+输送舰队
    },
    branch: { at: 'S', if: { dd: 5 }, to: ['W'] },   // 驱逐舰≥5 走下路（W 洋流 → F → G → K）；否则走上路（B-D-H 遇北方栖姬）
    /* 作战目标（方向四 / 批次4.3）：≥4 驱逐舰 —— 与「D 点航空战要舰战、B 点夜战要火力」三方争 6 个位置 */
    objectives: [
      { id: '3-5-dd4', type: 'typeLimit', types: ['DD'], min: 4, desc: '编成含 ≥4 艘驱逐舰（G 点潜艇伏击；代价是制空与夜战输出位被压缩）', reward: { fuel: 700, ammo: 700 } }
    ],
    drops: ['tang', 'barb'],
    bossDrops: ['saratoga', 'intrepid', 'westvirginia', 'harder', 'albacore', 'cleveland']
  },
  /* ==================== 4.中太平洋海域（马绍尔/马里亚纳，wiki 6-X） ==================== */
  {
    id: '4-1', name: '马绍尔群岛近海', desc: '挺进中太平洋！深海在环礁之间布下了哨戒线。', stars: 11,
    diff: 1,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: '航空战点 + 反潜点。BOSS 较弱（耐 264），制空有需求但不大。索敌≥35。',
    brief: '挺进中太平洋。马绍尔群岛的环礁之间，深海布下了第一道哨戒线。\nA 点敌军编成含潜水舰，C 点为航空战节点，BOSS 带轻空母；索敌≥35 可抢先进逼。对潜舰艇（驱逐舰、轻巡洋舰）与舰战都要带上。',
    /* threat：asw ← A 点敌军 F60 含潜水舰；air ← C 点 mode:'air' 与 BOSS F63 含轻空母 Nu 级；los ← branch.if.los */
    threat: ['air', 'asw', 'los'],
    threatNote: '本海域考验对潜、索敌与制空。A 点为对潜警戒线（敌军含潜水舰），索敌≥35 可直接切入该线；C 点为航空战点：未编入航母的舰队只能以对空炮火被动迎击；BOSS 为轻空母旗舰部队。',
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
      C: { type: 'battle', enemy: 'F97', mode: 'air' },   // 航空战点：环礁上空的舰载机警戒队
      D: { type: 'boss', enemy: 'F63' }
    },
    branch: { at: 'S', if: { los: 35 }, to: ['A'] },   // 索敌≥35 走反潜线；否则走哨戒线
    drops: ['sumner', 'sbroberts', 'cavalla', 'sealion'],
    bossDrops: ['lexington', 'northcarolina', 'hornet']
  },
  {
    id: '4-2', name: '夸贾林环礁海域', desc: '世界最大环礁的要塞！夺取铝土补给线并击破守军。', stars: 11,
    diff: 1,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: '航空战点。索敌≥45。耐 284。',
    brief: '夸贾林。世界最大的环礁，铝土补给线正从它的泻湖里过。\nA 点为航空战节点：敌军以轻空母为核心，制空是这场仗的先手；索敌≥45 可绕开外围哨戒直取 BOSS。',
    /* threat：air ← A 点 mode:'air' 与 BOSS 敌军含轻空母 Nu 级；los ← branch.if.los */
    threat: ['air', 'los'],
    threatNote: '本海域考验制空与索敌。索敌≥45 可切入 B 点铝土补给线；A 点为航空战点：未编入航母的舰队只能以对空炮火被动迎击；BOSS 编成含敌空母，未搭载舰战将丧失制空权。',
    start: 'S', boss: 'D', gauge: 5,
    admExp: { node: 140, boss: 2100 },   // 提督经验（wiki 6-3: 道中+140 / BOSS+2100）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 280, y: 260 }, B: { x: 560, y: 120 }, C: { x: 560, y: 400 }, D: { x: 820, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F64', mode: 'air' },   // 航空战点：环礁上空的空袭
      B: { type: 'resource', reward: ['baux'] },
      C: { type: 'battle', enemy: 'F65' },
      D: { type: 'boss', enemy: 'F66' }
    },
    branch: { at: 'A', if: { los: 45 }, to: ['B'] },   // 索敌≥45 走铝土补给线；否则走警戒线
    drops: ['archerfish', 'gato', 'dace', 'darter'],
    bossDrops: ['yorktown', 'alabama', 'washington']
  },
  {
    id: '4-3', name: '塞班岛攻略', desc: '登陆塞班岛！突破深海航空部队的拦截。', stars: 12,
    diff: 1,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: '航空战点 + 索敌≥55。耐 289。',
    brief: '塞班岛。登陆部队在海上等着，舰队得先解决头顶上的东西。\nA 点为航空战节点，敌军以正规空母为核心；索敌≥55 可直插纵深。制空不足会让整场炮战变成单方面挨打。',
    /* threat：air ← A 点 mode:'air'（敌军 F67 含空母）；los ← branch.if.los */
    threat: ['air', 'los'],
    threatNote: '本海域是空袭与夜袭的复合线。索敌≥55 可切入 B 点夜袭线；A 点为航空战点：未编入航母的舰队只能以对空炮火被动迎击；BOSS 编成含敌空母，需要舰战争夺制空。',
    start: 'S', boss: 'D', gauge: 5,
    admExp: { node: 150, boss: 2400 },   // 提督经验（wiki 6-4: 道中+150 / BOSS+2400）
    nodes: {
      S: { x: 0, y: 280 }, A: { x: 280, y: 280 }, B: { x: 560, y: 120 }, C: { x: 560, y: 440 }, D: { x: 820, y: 280 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F67', mode: 'air' },   // 航空战点：正规空母的拦截线
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
    diff: 3,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: '马里亚纳式全空袭图（3 个航空战点）。制空是唯一门槛：单航母 21%，双航母 99%。',
    brief: '马里亚纳。深海机动部队倾巢而出，这是开战以来最大的一次机群集结——三个节点全部是航空战节点，大机群遮天蔽日。\n本海域没有分支，全图都是正面的制空决战。未携带舰战将丧失制空：敌机空袭无从拦截，昼战特殊攻击全部无法发动；没有航空母舰的舰队将在每个节点陷入被动防空。',
    /* threat：air ← A/B/BOSS 三个节点均为 mode:'air' 且敌军全部以空母为核心（无分支、无潜艇） */
    threat: ['air'],
    threatNote: '马里亚纳火鸡射击 —— 全空袭决战。本图 A、B 与 BOSS 三个节点均为航空战点且敌军全部以空母为核心，制空压力为全部常规海域最高档：没有航空母舰的舰队将连续暴露在敌机轰炸之下，请编入航母并搭载舰战夺取制空。',
    start: 'S', boss: 'C', gauge: 5,
    admExp: { node: 170, boss: 2700 },   // 提督经验（wiki 6-5 前置：道中+170 / BOSS+2700）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 300, y: 260 }, B: { x: 600, y: 260 }, C: { x: 880, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['B', 'C']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F71', mode: 'air' },   // 航空战点：空袭前哨
      B: { type: 'battle', enemy: 'F72', mode: 'air' },   // 航空战点：空袭主力（大机群）
      C: { type: 'boss', enemy: 'F73', mode: 'air' }      // BOSS 航空战：机动部队本队（大机群）
    },
    drops: ['heermann', 'laffey', 'nicholas', 'charlesausburne', 'gearing'],
    bossDrops: ['essex', 'southdakota', 'saratoga']
  },
  {
    id: '4-5', name: '硫磺岛近海', desc: 'BOSS海域！折钵山栖姬镇守的硫磺岛，寸土必争的恶战！', stars: 13,
    diff: 4,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: 'EO 硫磺岛。折钵山栖姬（耐 538 / 甲 232，全项目第二硬）+ 夜战点。单航母 12% / 双航母 81%。推荐全队 Lv30 以上。索敌≥60。',
    brief: '硫磺岛。折钵山栖姬把这里变成了中太平洋最难啃的一块骨头。\n本海域设航空战节点（B 点）与夜战节点（C 点）：B 点机群密集，C 点没有昼战——夜战火力与舰战缺一不可。A 点敌军编成含潜水舰；索敌≥60 可抢在敌机出动前完成展开。',
    /* threat：asw ← A 点敌军 F74 含潜水舰；air ← B 点 mode:'air'；night ← C 点 mode:'night'；los ← branch.if.los */
    threat: ['air', 'asw', 'los', 'night'],
    threatNote: '本海域考验对潜、制空、夜战与索敌。索敌≥60 可切入 B 点空袭线；A 点为对潜警戒（敌军含潜水舰）；B 点为航空战点：未编入航母的舰队只能以对空炮火被动迎击；C 点为夜战点：需要夜战火力支撑。',
    start: 'S', boss: 'D', gauge: 7, need: '4-4',
    admExp: { node: 180, boss: 3300 },   // 提督经验（wiki 6-5: 道中+180 / BOSS+3300）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 280, y: 260 }, B: { x: 560, y: 120 }, C: { x: 560, y: 400 }, D: { x: 820, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F74' },   // 对潜警戒
      B: { type: 'battle', enemy: 'F75', mode: 'air' },    // 航空战点：空袭
      C: { type: 'battle', enemy: 'F76', mode: 'night' },  // 夜战点：夜战线
      D: { type: 'boss', enemy: 'F77' }
    },
    branch: { at: 'A', if: { los: 60 }, to: ['B'] },   // 索敌≥60 走空袭线；否则走夜战线
    drops: ['indiana', 'westvirginia'],
    bossDrops: ['enterprise', 'iowa', 'essex', 'maryland', 'ticonderoga', 'england']
  },
  /* ==================== 5.菲律宾海域（莱特湾，wiki 5-X） ==================== */
  {
    id: '5-1', name: '莱特湾前哨', desc: '菲律宾的大门已经敞开！扫清莱特湾的前哨防线。', stars: 13,
    diff: 2,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: '潜艇伏击 + 航空战点。制空要求中等：单航母 40%，双航母 99%。',
    brief: '莱特湾前哨。菲律宾的大门已经敞开，深海把机动部队的残部留在了门口。\n航路单一但步步惊心：A 点为潜艇伏击点（先期破交的潜水战队），B 点为航空战节点。对潜舰艇与舰战都要带上——两关都过了，才轮到空母旗舰坐镇的 BOSS。',
    /* threat：asw ← A 点 mode:'sub'；air ← B 点 mode:'air' 与 BOSS F79 含空母 Wo 级（本图无分支） */
    threat: ['air', 'asw'],
    threatNote: '本海域考验对潜与制空。A 点为潜艇伏击：未编入驱逐舰、轻巡洋舰将被单方面雷击；B 点为航空战点：需要舰战争夺制空；BOSS 编成以空母 Wo 级为核心。',
    start: 'S', boss: 'D', gauge: 5,
    admExp: { node: 120, boss: 1800 },   // 提督经验（wiki 5-1: 道中+120 / BOSS+1800）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 260, y: 120 }, B: { x: 520, y: 260 }, C: { x: 760, y: 120 }, D: { x: 980, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['B', 'C'], ['C', 'D']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F98', mode: 'sub' },   // 潜艇点：先期破交的潜水战队
      B: { type: 'battle', enemy: 'F99', mode: 'air' },   // 航空战点：前哨上空的空袭队
      C: { type: 'resource', reward: ['fuel'] },
      D: { type: 'boss', enemy: 'F79' }
    },
    drops: ['kidd', 'sumner'],
    bossDrops: ['intrepid', 'northcarolina', 'colorado']
  },
  {
    id: '5-2', name: '苏里高海峡', desc: '夜战的海峡！老战列舰组成的夜战阵线迎击深海舰队！', stars: 13,
    diff: 3,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: '全夜战图（3 个夜战点）。**本图不需要航母**——航空阶段被完全跳过，这是全项目唯一如此的海域。带满鱼雷的驱逐舰和轻巡是主力（BOSS 耐 300 / 雷 176）。',
    brief: '苏里高海峡。1944 年 10 月 25 日凌晨，老战列舰们在黑暗中排成一字横队——海峡很窄，双方都没有回避的余地。\n本海域全线都是夜战节点：A、B 与 BOSS 三战皆在夜间进行，没有昼战，空母没有用武之地。夜战火力、鱼雷 Cut-in 与照明弹配装是唯一答案；装甲不足的舰队会被逐舰拆解。',
    /* threat：night ← A/B/BOSS 全线 mode:'night'（史上最后一场战列舰夜战：全线夜战） */
    threat: ['night'],
    threatNote: '本海域是史上最后一场战列舰夜战的舞台：全线夜战节点，没有昼战阶段。夜战火力（火力与雷装）决定一切，请把编成位让给驱逐舰、轻巡洋舰与老战列舰——航空母舰在这里无法参战。',
    start: 'S', boss: 'C', gauge: 5,
    admExp: { node: 130, boss: 1900 },   // 提督经验（wiki 5-2: 道中+130 / BOSS+1900）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 300, y: 260 }, B: { x: 600, y: 260 }, C: { x: 880, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['B', 'C']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F80', mode: 'night' },   // 夜战点：水雷前卫
      B: { type: 'battle', enemy: 'F81', mode: 'night' },   // 夜战点：战列夜战线
      C: { type: 'boss', enemy: 'F82', mode: 'night' }      // BOSS 夜战：夜战总旗舰
    },
    drops: ['tang', 'archerfish', 'franklin'],
    bossDrops: ['wasp', 'washington', 'hornet']
  },
  {
    id: '5-3', name: '萨马岛近海', desc: '深海中央舰队突破而来！护航舰队全体迎战！', stars: 14,
    diff: 4,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: '萨马岛。战列舰 Re 级旗舰（耐 400 / 火 316），航空 + 夜战并存。单航母 21% / 双航母 91%。',
    brief: '萨马岛。深海的中央舰队从圣贝纳迪诺方向压了过来，护航舰队全体迎战。\n本海域设航空战节点（A 点）与夜战节点（B 点）：清晨的敌机群由舰战应付，入夜后的重打击部队由夜战火力应付。BOSS 是清一色的重型水面舰——速力与阵型的选择比数量更重要。',
    /* threat：air ← A 点 mode:'air'；night ← B 点 mode:'night' */
    threat: ['air', 'night'],
    threatNote: '本海域考验制空与夜战。A 点为航空战点：没有航空母舰的舰队将暴露在敌机轰炸之下；B 点为夜战点：需要夜战火力支撑。BOSS 编成无航空战力，是纯粹的炮战消耗——速力与阵型的选择比数量更重要。',
    start: 'S', boss: 'C', gauge: 6,
    admExp: { node: 140, boss: 2200 },   // 提督经验（wiki 5-3: 道中+140 / BOSS+2200）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 300, y: 260 }, B: { x: 600, y: 260 }, C: { x: 880, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['B', 'C']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F100', mode: 'air' },   // 航空战点：清晨来袭的舰载机群
      B: { type: 'battle', enemy: 'F84', mode: 'night' },  // 夜战点：重打击部队
      C: { type: 'boss', enemy: 'F85' }      // 中央舰队（战列舰Re级flagship）
    },
    drops: ['barb', 'gato', 'bunkerhill'],
    bossDrops: ['essex', 'saratoga', 'southdakota']
  },
  {
    id: '5-4', name: '恩加尼奥角', desc: '深海机动部队的诱饵舰队！全歼恩加尼奥角的空母群！', stars: 14,
    diff: 3,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: '小泽机动部队，全空袭。制空依赖全项目最高之一：单航母 19%，双航母 98%。索敌≥65。',
    brief: '恩加尼奥角。深海的诱饵舰队把最后一批空母推到了这里。\nA、B 两点均为航空战节点，敌军机群密度为本作空前，舰战不足者会在第一轮空袭中失去战斗力；索敌≥65 可识破诱饵，避开外围直取 BOSS。',
    /* threat：air ← A/B 点 mode:'air'（A/B/BOSS 敌军全部以空母为核心）；los ← branch.if.los */
    threat: ['air', 'los'],
    threatNote: '恩加尼奥角 —— 敌机动部队的诱饵舰队。索敌≥65 可直取空袭主力；A、B 两点为航空战点：没有航空母舰的舰队将连续暴露在敌机轰炸之下，需要舰战争夺制空；A、B 与 BOSS 三处敌军全部以空母为核心。',
    start: 'S', boss: 'C', gauge: 6,
    admExp: { node: 150, boss: 2400 },   // 提督经验（wiki 5-4: 道中+150 / BOSS+2400）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 300, y: 260 }, D: { x: 600, y: 90 }, B: { x: 600, y: 430 }, C: { x: 880, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'B'], ['A', 'D'], ['D', 'B'], ['B', 'C']],
    defs: {
      S: { type: 'start' },
      A: { type: 'battle', enemy: 'F86', mode: 'air' },   // 航空战点：空袭前哨
      D: { type: 'resource', reward: ['fuel'] },
      B: { type: 'battle', enemy: 'F87', mode: 'air' },   // 航空战点：空袭主力（诱饵舰队本队）
      C: { type: 'boss', enemy: 'F88' }      // 机动部队本队
    },
    branch: { at: 'A', if: { los: 65 }, to: ['B'] },   // 索敌≥65 直取空袭主力；否则绕燃料补给线
    drops: ['obannon', 'porter', 'alaska'],
    bossDrops: ['missouri', 'yorktown', 'alabama']
  },
  {
    id: '5-5', name: '莱特湾决战', desc: 'BOSS海域！深海大和栖姬亲率的联合舰队，最后的决战！', stars: 15,
    diff: 5,          // 难度档 1~5（T1 基础 / T2 常规 / T3 考验 / T4 高难 / T5 决战）
    diffNote: '**决战海域**。大和栖姬（耐 667 / 火 358 / 甲 292）+ 8 格血条，航空 / 潜艇 / 夜战三特殊节点齐备。**这是全项目唯一真正吃练度的图**：顶配编成 Lv15 只有 27%，Lv60 53%，Lv90 72%。请带满级主力并备足洋上补给。索敌≥70。',
    brief: '莱特湾。深海大和栖姬亲率的联合舰队终于现身，这是终章。\n本海域混合全部特殊节点：异常洋流（W）、航空战节点（B）、夜战节点（C）与潜艇伏击点（G）。索敌≥70 走 B 点空袭线，否则走 G 点潜艇警戒线——制空、夜战火力、对潜与电探，缺哪一样都会在某一环被打断。带上你最完整的一支舰队。',
    /* threat：air ← B 点 mode:'air'；night ← C 点 mode:'night'；asw ← G 点 mode:'sub'；radar ← W 点 whirlpool；los ← branch.if.los */
    threat: ['air', 'asw', 'night', 'radar', 'los'],
    threatNote: '终章决战，五项考验并存。索敌≥70 可切入 B 点空袭线；B 点为航空战点：需要舰战争夺制空；C 点为夜战点：需要夜战火力；G 点为潜艇伏击：需要对潜能力；W 点异常洋流按持有燃料扣损，电探可使损失减半——而对手是深海大和栖姬亲率的联合舰队。',
    start: 'S', boss: 'D', gauge: 8, need: '5-4',
    admExp: { node: 160, boss: 2600 },   // 提督经验（wiki 5-5: 道中+160 / BOSS+2600）
    nodes: {
      S: { x: 0, y: 260 }, A: { x: 280, y: 260 }, W: { x: 420, y: 190 }, G: { x: 420, y: 330 },
      B: { x: 560, y: 120 }, C: { x: 560, y: 400 }, D: { x: 820, y: 260 }
    },
    edges: [['S', 'A'], ['A', 'W'], ['W', 'B'], ['A', 'G'], ['G', 'C'], ['B', 'D'], ['C', 'D']],
    defs: {
      S: { type: 'start' },
      A: { type: 'resource', reward: ['fuel'] },
      W: { type: 'whirlpool', lossBase: 260 },              // 漩涡：终章航线的异常洋流
      B: { type: 'battle', enemy: 'F89', mode: 'air' },     // 航空战点：空袭线
      G: { type: 'battle', enemy: 'F101', mode: 'sub' },    // 潜艇点：潜水警戒线
      C: { type: 'battle', enemy: 'F90', mode: 'night' },   // 夜战点：夜战前卫
      D: { type: 'boss', enemy: 'F91' }                     // 联合舰队本队
    },
    branch: { at: 'A', if: { los: 70 }, to: ['W'] },   // 索敌≥70 走空袭线（经 W 洋流）；否则走潜艇警戒线
    drops: ['indiana', 'westvirginia'],
    bossDrops: ['iowa', 'missouri', 'enterprise', 'saratoga', 'newjersey', 'wisconsin', 'midway']
  }
];

/* ---------- 远征 ---------- */
/* V0.304 批次3：远征编成条件（cond）—— 满足 → 领取时资源 ×1.5（确定性判定，不新增随机数消费者）。
 * cond schema（与 req 风格对齐）：{ flagship: 舰种 } / { types: [舰种...], min: n } / { equip: [装备类别...], min: n }。
 * 对价 = 把优质舰（高练度 CL / 空母 / 带电探舰）从出击舰队挪去远征队——机会成本真实存在。
 * ×1.5 与各 cond 松紧均为 [PLACEHOLDER]（假设：8 小时远征收益上浮应显著低于重打一次 3-5 的期望收益）。
 * 覆盖率 7/8（ex6 为无条件喘息档）。 */
const EXPEDITIONS = [
  { id: 'ex1', name: '近海哨戒', time: 15, exp: 30, req: { ships: 2 }, cond: { flagship: 'DD' }, condText: '驱逐舰旗舰', reward: { fuel: 60, ammo: 60 }, desc: '在母港近海巡逻警戒。' },
  { id: 'ex2', name: '补给线巡逻', time: 30, exp: 60, req: { ships: 4, dd: 2 }, cond: { types: ['DD'], min: 3 }, condText: '编成含 ≥3 艘驱逐舰', reward: { fuel: 120, ammo: 100, steel: 30 }, desc: '护送燃料船队通过补给线。' },
  { id: 'ex3', name: '护航任务', time: 45, exp: 90, req: { ships: 4, cl_or_dd_flagship: 1 }, cond: { flagship: 'CL' }, condText: '轻巡洋舰旗舰', reward: { steel: 180, baux: 30 }, desc: '为运输船队提供护航。' },
  { id: 'ex4', name: '空中侦察', time: 90, exp: 180, req: { ships: 4, cv_or_cvl: 1 }, cond: { types: ['CV', 'CVL'], min: 2 }, condText: '编成含 ≥2 艘空母', reward: { baux: 200, fuel: 50 }, desc: '派出舰载机进行远距离航空侦察。' },
  { id: 'ex5', name: '对潜警戒', time: 120, exp: 240, req: { ships: 4, asw: 2 }, cond: { flagship: 'AS' }, condText: '修理舰旗舰', reward: { ammo: 240, steel: 160 }, desc: '扫荡航线上的深海军潜艇。' },
  { id: 'ex6', name: '海上护卫', time: 180, exp: 360, req: { ships: 5 }, reward: { fuel: 320, steel: 240 }, desc: '护卫大型运输船队横渡太平洋（无大成功条件）。' },
  { id: 'ex7', name: '航母特混支援', time: 360, exp: 500, req: { ships: 4, cv_or_cvl: 2 }, cond: { equip: ['对空电探', '对水电探', '两用电探'], min: 2 }, condText: '舰队装备 ≥2 件电探', reward: { baux: 450, fuel: 200, ammo: 200, devMats: 1 }, desc: '机动部队出击，支援前方战线。' },
  { id: 'ex8', name: '长距离远征', time: 720, exp: 500, req: { ships: 6 }, cond: { types: ['DD'], min: 3 }, condText: '编成含 ≥3 艘驱逐舰', reward: { fuel: 800, ammo: 800, steel: 600, baux: 200, devMats: 2 }, desc: '长途奔袭，展示海权的力量！' }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DEEP_TEMPLATES, ENEMY_FLEETS, MAPS, EXPEDITIONS };
}
