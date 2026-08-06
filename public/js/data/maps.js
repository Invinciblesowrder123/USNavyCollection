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
  eB8:  { name: '深海潜水栖姬', type: 'SS', stats: [70, 5, 60, 0, 8, 40, 0, 5, 20], boss: true }
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
  /* ---- 1-4 近海防卫线（wiki 1-4 南西群岛防卫线：驱逐栖姬 + 水雷战队） ---- */
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
  /* ---- 3-4 北方海域全域（wiki 3-4 北方海域全域：北方栖姬 BOSS） ---- */
  F44: { formation: '单纵阵', ships: ['eca2e', 'eca2e', 'ecl2', 'edd3', 'edd3', 'edd2'] },
  F45: { formation: '轮形阵', ships: ['ecvl1e', 'ebb2e', 'eca2e', 'edd3e', 'edd3e'] },
  F46: { formation: '轮形阵', ships: ['eB7', 'ebb2e', 'ebb2e', 'ecvl1e', 'edd3e', 'edd3e'] }
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
    drops: ['benson', 'mahan'],
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
    drops: ['neworleans', 'fletcher', 'kidd'],
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
    drops: ['brooklyn', 'benson', 'gato'],
    bossDrops: ['iowa', 'missouri', 'essex', 'baltimore']
  },
  {
    id: '1-4', name: '近海防卫线', desc: '深海军夜袭部队反扑近海！驱逐栖姬率领的水雷战队逼近母港！', stars: 6,
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
    drops: ['laffey', 'heermann', 'porter'],
    bossDrops: ['johnston', 'sanfrancisco', 'quincy']
  },
  /* ==================== 2.南西群岛海域（所罗门群岛） ==================== */
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
    drops: ['obannon', 'hoel'],
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
    drops: ['sumner', 'belleauwood'],
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
    drops: ['princeton', 'sbroberts'],
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
    drops: ['archerfish', 'tang'],
    bossDrops: ['northcarolina', 'washington', 'wasp']
  },
  /* ==================== 3.北方海域（阿留申群岛） ==================== */
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
    drops: ['tang', 'barb'],
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
    drops: ['kidd', 'gato'],
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
    drops: ['barb', 'archerfish'],
    bossDrops: ['essex', 'southdakota', 'massachusetts']
  },
  {
    id: '3-4', name: '北方海域全域', desc: '深海北方栖姬的决战海域！击破北方的钢铁要塞！', stars: 10,
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
    drops: ['indiana', 'westvirginia'],
    bossDrops: ['missouri', 'enterprise', 'essex', 'intrepid']
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
