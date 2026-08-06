'use strict';
/* ============================================================
 * 海域地图 + 深海敌军数据
 * 敌军槽位 slots: [{planes, aa}] 用于计算制空值（aa = 舰载机对空值）
 * ============================================================ */

/* ---------- 深海敌军模板 ---------- */
/* 参照wiki还原：驱逐I级(20/6/15/6/5/15/10/5/5)、驱逐II级(24/12/20/8/7/20/14/6/6)
 * 注：对空值(aa)已按本作数值体系调校（对空炮火S2击坠 普通节点每槽期望约3~6架、BOSS约8~10架），
 *     S2机制/公式仍与wiki一致（固定击坠+比例击坠+舰队防空补正），此处仅调整基础数值 */
const DEEP_TEMPLATES = {
  edd1: { name: '深海军驱逐舰I级', type: 'DD', stats: [20, 6, 15, 4, 5, 15, 10, 5, 5] },
  edd2: { name: '深海军驱逐舰II级', type: 'DD', stats: [24, 12, 20, 5, 7, 20, 14, 6, 6] },
  edd2e:{ name: '深海军驱逐舰II级(精锐)', type: 'DD', stats: [30, 22, 26, 8, 10, 30, 28, 6, 8] },
  ecl1: { name: '深海军轻巡洋舰He级', type: 'CL', stats: [30, 20, 12, 8, 10, 20, 22, 6, 6] },
  ecl1e:{ name: '深海军轻巡洋舰He级(精锐)', type: 'CL', stats: [38, 28, 16, 10, 14, 24, 26, 6, 8] },
  eca1: { name: '深海军重巡洋舰Ru级', type: 'CA', stats: [45, 32, 10, 9, 22, 15, 15, 8, 8] },
  eca1e:{ name: '深海军重巡洋舰Ru级(精锐)', type: 'CA', stats: [55, 42, 12, 11, 28, 18, 18, 8, 10] },
  ebb1: { name: '深海军战列舰Ta级', type: 'BB', stats: [60, 42, 0, 8, 32, 12, 10, 6, 6] },
  ebb1e:{ name: '深海军战列舰Ta级(精锐)', type: 'BB', stats: [72, 56, 0, 11, 40, 14, 12, 6, 8] },
  ecv1: { name: '深海军空母Wo级', type: 'CV', stats: [45, 0, 0, 8, 20, 18, 0, 20, 8],
          slots: [{ planes: 24, aa: 4 }, { planes: 24, aa: 4 }, { planes: 18, aa: 5 }] },
  ecv1e:{ name: '深海军空母Wo级(精锐)', type: 'CV', stats: [55, 0, 0, 11, 26, 20, 0, 22, 10],
          slots: [{ planes: 30, aa: 5 }, { planes: 28, aa: 5 }, { planes: 22, aa: 5 }] },
  ess1: { name: '深海军潜水舰So级', type: 'SS', stats: [14, 5, 26, 0, 5, 25, 12, 5, 5] },
  ess1e:{ name: '深海军潜水舰So级(精锐)', type: 'SS', stats: [18, 7, 34, 0, 7, 30, 15, 5, 6] },
  eB1:  { name: '深海驱逐栖姬', type: 'DD', stats: [60, 40, 50, 11, 16, 42, 30, 10, 20], boss: true },
  eB2:  { name: '深海重巡栖姬', type: 'CA', stats: [85, 62, 20, 14, 45, 20, 16, 10, 15], boss: true },
  eB3:  { name: '深海空母栖姬', type: 'CV', stats: [95, 8, 0, 16, 50, 24, 0, 26, 18], boss: true,
          slots: [{ planes: 36, aa: 5 }, { planes: 36, aa: 5 }, { planes: 28, aa: 6 }, { planes: 24, aa: 6 }] }
};

/* ---------- 敌方舰队集合（按节点引用） ---------- */
const ENEMY_FLEETS = {
  F01: { formation: '单纵阵', ships: ['edd1', 'edd1', 'edd1'] },
  F02: { formation: '单纵阵', ships: ['edd2', 'edd2', 'ecl1'] },
  F03: { formation: '单纵阵', ships: ['edd2', 'edd2', 'ecl1'] },
  F04: { formation: '单纵阵', ships: ['edd2', 'edd2', 'ecl1', 'ecl1'] },
  F05: { formation: '轮形阵', ships: ['ecv1', 'edd2', 'edd2', 'ecl1', 'eca1'] },
  F06: { formation: '单纵阵', ships: ['eB2', 'edd2e', 'eca1', 'ecl1e', 'edd2e'] },
  F07: { formation: '轮形阵', ships: ['ecv1e', 'ecv1', 'edd2e', 'eca1', 'ecl1e'] },
  F08: { formation: '单纵阵', ships: ['ebb1', 'ebb1', 'eca1', 'ecl1', 'edd2', 'edd2'] },
  F09: { formation: '轮形阵', ships: ['eB3', 'ecv1e', 'eca1e', 'edd2e', 'ecl1e', 'ess1'] },
  F10: { formation: '轮形阵', ships: ['ecv1e', 'ebb1e', 'edd2e', 'ecl1e'] },
  F11: { formation: '梯形阵', ships: ['ess1', 'ess1e', 'edd2'] },
  F12: { formation: '单纵阵', ships: ['edd2e', 'edd2e', 'eca1e', 'ecl1e'] }
};

/* ---------- 海域定义 ----------
 * node: { type: 'battle'|'boss'|'resource'|'supply'|'empty', enemy, reward }
 * branch: { if: {los?, dd?}, to: [...] } 按序判定，命中即走该分支
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
    id: '1-2', name: '所罗门哨戒', desc: '铁底湾的暗流与交锋，考验舰队的索敌与对空。', stars: 4,
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
      C: { type: 'battle', enemy: 'F04' },
      D: { type: 'boss', enemy: 'F06' }
    },
    branch: { at: 'S', if: { los: 20 }, to: ['A'] },   // 索敌≥20走A（短路线），否则走C
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
