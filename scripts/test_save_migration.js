'use strict';

const assert = require('assert');
const equipMod = require('../public/js/data/equipment.js');
const shipsMod = require('../public/js/data/ships.js');
const mapsMod = require('../public/js/data/maps.js');
Object.assign(global, {
  EquipmentData: equipMod.EquipmentData,
  ShipData: shipsMod.ShipData,
  SHIPS: shipsMod.SHIPS,
  STARTER_IDS: shipsMod.STARTER_IDS,
  MAPS: mapsMod.MAPS,
  ...require('../public/js/core/utils.js')
});
const { Game } = require('../public/js/core/state.js');

const CUR = Game.CURRENT_SAVE_VERSION;

let TOTAL_CHECKS = 0;
function check(name, condition) {
  assert.ok(condition, name);
  TOTAL_CHECKS++;
  console.log('  ✓ ' + name);
}

function v1Save() {
  return {
    version: 1,
    admiral: { name: '旧提督', level: 40, exp: 0 },
    resources: { fuel: 100, ammo: 200, steel: 300, baux: 400 },
    ships: { s40: { uid: 's40', id: 'mahan', equipped: [] } },
    equipment: { e41: { uid: 'e41', id: 'gun5in_30' } },
    fleet: { 1: ['s40'], 2: [] },
    mapProgress: {}
  };
}

function v2Save() {
  return {
    saveVersion: 2, version: 2,
    admiral: { name: '提督', level: 5, exp: 0 },
    resources: { fuel: 500, ammo: 500, steel: 500, baux: 500, screws: 0, devMats: 10 },
    ships: { s1: { uid: 's1', id: 'mahan' }, s2: { uid: 's2', id: 'benson' } },
    equipment: { e1: { uid: 'e1', id: 'gun5in_30' } },
    fleet: { 1: ['s1'], 2: [], 3: [], 4: [] },
    mapProgress: {}
  };
}

function v3Save() {
  return {
    saveVersion: 3, version: 3,
    admiral: { name: '提督', level: 12, exp: 0 },
    resources: { fuel: 700, ammo: 700, steel: 700, baux: 700, screws: 3, devMats: 12 },
    ships: {
      s1: { uid: 's1', id: 'mahan', kai: 1, lv: 30, hp: 20, morale: 40, equipped: [], modern: {}, supply: { fuel: 1, ammo: 1 } },
      s2: { uid: 's2', id: 'fletcher', kai: 0, lv: 12, hp: 18, morale: 55, equipped: [], modern: {}, supply: { fuel: 0.5, ammo: 0.5 } }
    },
    equipment: { e1: { uid: 'e1', id: 'gun5in_30', star: 2 } },
    fleet: { 1: ['s1', 's2'], 2: [], 3: [], 4: [] },
    fleetUnlock: { 3: true, 4: false },
    library: { ships: { mahan: true, fletcher: true }, equips: { gun5in_30: true } },
    mapProgress: {}
  };
}

/* v4 → v5：舰历新增作战目标达成记录（方向四） */
function v4Save() {
  return {
    saveVersion: 4, version: 4,
    admiral: { name: '提督', level: 20, exp: 0 },
    resources: { fuel: 800, ammo: 800, steel: 800, baux: 800, screws: 5, devMats: 12 },
    ships: {
      s1: {
        uid: 's1', id: 'fletcher', kai: 1, lv: 55, hp: 30, morale: 49, equipped: [], modern: {}, supply: { fuel: 1, ammo: 1 },
        record: {
          sorties: 9, expeditions: 2, sWin: 5, taiha: 1, failures: 2, perfect: 3, bossKills: 4, lastBoss: '深海驱逐栖姬',
          firstClear: { '1-1': 1700000000000 }, honors: [{ id: 'first_sortie', at: 1700000000001 }], remodelAt: [1700000000002]
        }
      }
    },
    equipment: {}, fleet: { 1: ['s1'], 2: [], 3: [], 4: [] },
    library: { ships: { fletcher: true }, equips: {} },
    mapProgress: {}
  };
}

/* v5 → v6：舰历新增历史战役标记 record.historic + 全局账本 stats.historic（V0.303） */
function v5Save() {
  return {
    saveVersion: 5, version: 5,
    admiral: { name: '提督', level: 42, exp: 0 },
    resources: { fuel: 900, ammo: 900, steel: 900, baux: 900, screws: 12, devMats: 20 },
    ships: {
      s1: {
        uid: 's1', id: 'enterprise', kai: 1, lv: 80, hp: 60, morale: 49, equipped: [], modern: {}, supply: { fuel: 1, ammo: 1 },
        record: {
          sorties: 31, expeditions: 5, sWin: 20, taiha: 2, failures: 3, perfect: 9, bossKills: 12, lastBoss: '深海战列栖姬',
          firstClear: { '1-1': 1700000000000, '1-2': 1700000000001 },
          objectives: { '1-2-s': 1700000000002 },
          honors: [{ id: 'first_sortie', at: 1700000000003 }], remodelAt: [1700000000004]
        }
      },
      s2: { uid: 's2', id: 'fletcher', kai: 0, lv: 30, hp: 20, morale: 50, equipped: [], modern: {}, supply: { fuel: 1, ammo: 1 } }
    },
    equipment: { e1: { uid: 'e1', id: 'gun5in_30', star: 1 } },
    fleet: { 1: ['s1', 's2'], 2: [], 3: [], 4: [] },
    library: { ships: { enterprise: true, fletcher: true }, equips: { gun5in_30: true } },
    stats: { sink: 12, sortie: 40, win: 33, sWin: 20, bossSWin: { '1-1': 3 }, objectives: { '1-2-s': 1700000000002 } },
    mapProgress: {}
  };
}

console.log('\n== 存档迁移专项测试 ==');

/* v1 旧档 → 当前版本 */
const fromV1 = Game.migrateSave(v1Save());
check('v1 旧档升级到当前版本', fromV1.saveVersion === CUR && fromV1.version === CUR);
check('v1 旧经验曲线只迁移一次', fromV1.admiral.level === 97 && fromV1.admiral.exp === 18500 && fromV1.expMigrated === true);
check('v1 旧装备补齐改修星级', fromV1.equipment.e41.star === 0);
check('v1 旧资源补齐新字段', fromV1.resources.screws === 0 && fromV1.resources.devMats === 10);
check('v1 废弃开发队列清空', Array.isArray(fromV1.development) && fromV1.development.length === 0);
check('v1 舰队与地图结构规范化', [1, 2, 3, 4].every(i => Array.isArray(fromV1.fleet[i])) && Object.keys(fromV1.mapProgress).length === MAPS.length);

/* v2 → v3：图鉴登录表 */
const fromV2 = Game.migrateSave(v2Save());
check('v2 档升级到含图鉴的版本', fromV2.saveVersion === CUR && fromV2.version === CUR);
check('v2 图鉴按持有补登舰船', fromV2.library.ships.mahan === true && fromV2.library.ships.benson === true);
check('v2 图鉴按持有补登装备', fromV2.library.equips.gun5in_30 === true);
check('v2 图鉴不误登未持有项', !fromV2.library.ships.iowa);

/* v3 → v4：每舰补舰历 record（方向二） */
const fromV3 = Game.migrateSave(v3Save());
check('v3 档升级到含舰历的版本', fromV3.saveVersion === CUR && fromV3.version === CUR);
check('v3 档每舰补齐 record 且为默认空结构',
  fromV3.ships.s1.record && fromV3.ships.s2.record &&
  fromV3.ships.s1.record.sorties === 0 && fromV3.ships.s1.record.sWin === 0 &&
  fromV3.ships.s1.record.taiha === 0 && fromV3.ships.s1.record.failures === 0 &&
  fromV3.ships.s1.record.bossKills === 0 && fromV3.ships.s1.record.lastBoss === '',
  JSON.stringify(fromV3.ships.s1.record));
check('v3 档 record 的容器字段齐全',
  Array.isArray(fromV3.ships.s1.record.honors) && fromV3.ships.s1.record.honors.length === 0 &&
  Array.isArray(fromV3.ships.s1.record.remodelAt) &&
  fromV3.ships.s1.record.firstClear && typeof fromV3.ships.s1.record.firstClear === 'object');
check('v3 档迁移不影响资源与舰队',
  fromV3.resources.fuel === 700 && fromV3.resources.devMats === 12 &&
  JSON.stringify(fromV3.fleet[1]) === JSON.stringify(['s1', 's2']) &&
  fromV3.ships.s1.lv === 30 && fromV3.ships.s1.kai === 1 && fromV3.ships.s2.morale === 55);
check('v3 档迁移保留旧字段（装备星级/图鉴/舰队解锁）',
  fromV3.equipment.e1.star === 2 && fromV3.library.ships.fletcher === true && fromV3.fleetUnlock[3] === true);
/* 形状一致性：迁移路径与新建路径必须产生同一形状 */
const freshShape = JSON.stringify(Game.defaultRecord());
check('迁移后的 record 结构与新建舰船的结构一致', JSON.stringify(fromV3.ships.s1.record) === freshShape,
  JSON.stringify(fromV3.ships.s1.record));
check('v1/v2 档迁移后同样带 record',
  !!fromV1.ships.s40.record && !!fromV2.ships.s1.record &&
  JSON.stringify(fromV1.ships.s40.record) === freshShape && JSON.stringify(fromV2.ships.s1.record) === freshShape);
/* 半残 record（形状不完整）补齐，不覆盖已有数值 */
const partial = Game.migrateSave({
  saveVersion: 3, version: 3,
  resources: { fuel: 1, ammo: 1, steel: 1, baux: 1, screws: 0, devMats: 10 },
  ships: { s9: { uid: 's9', id: 'mahan', record: { sorties: 7, honors: [{ id: 'first_sortie', at: 1 }] } } },
  equipment: {}, fleet: { 1: [], 2: [], 3: [], 4: [] }
});
check('残缺 record 补齐缺键且不覆盖已有数值',
  partial.ships.s9.record.sorties === 7 && partial.ships.s9.record.sWin === 0 &&
  partial.ships.s9.record.honors.length === 1 && partial.ships.s9.record.honors[0].id === 'first_sortie');

/* 幂等 */
check('v1 结果重复迁移稳定', JSON.stringify(Game.migrateSave(fromV1)) === JSON.stringify(fromV1));
check('v2 结果重复迁移稳定', JSON.stringify(Game.migrateSave(fromV2)) === JSON.stringify(fromV2));
check('v3 结果重复迁移稳定', JSON.stringify(Game.migrateSave(fromV3)) === JSON.stringify(fromV3));

/* v4 → v5：补 record.objectives（方向四），且不动既有履历数值 */
const fromV4 = Game.migrateSave(v4Save());
check('v4 档升级到当前版本', fromV4.saveVersion === CUR && fromV4.version === CUR);
check('v4 档补齐 record.objectives 为空对象',
  fromV4.ships.s1.record.objectives && typeof fromV4.ships.s1.record.objectives === 'object' &&
  Object.keys(fromV4.ships.s1.record.objectives).length === 0,
  JSON.stringify(fromV4.ships.s1.record.objectives));
check('v4 档迁移不覆盖既有履历数值',
  fromV4.ships.s1.record.sorties === 9 && fromV4.ships.s1.record.sWin === 5 &&
  fromV4.ships.s1.record.taiha === 1 && fromV4.ships.s1.record.failures === 2 &&
  fromV4.ships.s1.record.perfect === 3 && fromV4.ships.s1.record.bossKills === 4 &&
  fromV4.ships.s1.record.lastBoss === '深海驱逐栖姬' &&
  fromV4.ships.s1.record.firstClear['1-1'] === 1700000000000 &&
  fromV4.ships.s1.record.honors.length === 1 && fromV4.ships.s1.record.remodelAt.length === 1);
check('v4 迁移后的 record 结构与新建结构一致',
  JSON.stringify(fromV4.ships.s1.record) === JSON.stringify(Object.assign(Game.defaultRecord(), {
    sorties: 9, expeditions: 2, sWin: 5, taiha: 1, failures: 2, perfect: 3, bossKills: 4, lastBoss: '深海驱逐栖姬',
    firstClear: { '1-1': 1700000000000 }, honors: [{ id: 'first_sortie', at: 1700000000001 }], remodelAt: [1700000000002]
  })));
check('v4 结果重复迁移稳定', JSON.stringify(Game.migrateSave(fromV4)) === JSON.stringify(fromV4));

/* v5 → v6：补 record.historic（V0.303），且不动既有履历数值与账本 */
const fromV5 = Game.migrateSave(v5Save());
check('v5 档升级到当前版本（v6）', fromV5.saveVersion === 6 && fromV5.version === 6 && CUR === 6);
check('v5 档补齐 record.historic 为空对象',
  fromV5.ships.s1.record.historic && typeof fromV5.ships.s1.record.historic === 'object' &&
  Object.keys(fromV5.ships.s1.record.historic).length === 0,
  JSON.stringify(fromV5.ships.s1.record.historic));
check('v5 档补齐全局战役账本 stats.historic 为空对象',
  fromV5.stats && fromV5.stats.historic && typeof fromV5.stats.historic === 'object' &&
  Object.keys(fromV5.stats.historic).length === 0,
  JSON.stringify(fromV5.stats && fromV5.stats.historic));
check('v5 档迁移不覆盖既有履历数值',
  fromV5.ships.s1.record.sorties === 31 && fromV5.ships.s1.record.sWin === 20 &&
  fromV5.ships.s1.record.objectives['1-2-s'] === 1700000000002 &&
  fromV5.ships.s1.record.firstClear['1-1'] === 1700000000000 &&
  fromV5.ships.s1.record.honors.length === 1);
check('v5 档迁移不覆盖既有全局统计与作战目标账本',
  fromV5.stats.sortie === 40 && fromV5.stats.objectives['1-2-s'] === 1700000000002);
check('v5 档资源与舰队无损',
  fromV5.resources.fuel === 900 && fromV5.resources.screws === 12 && fromV5.resources.devMats === 20 &&
  JSON.stringify(fromV5.fleet[1]) === JSON.stringify(['s1', 's2']) &&
  fromV5.ships.s1.lv === 80 && fromV5.ships.s1.kai === 1);
check('v5 迁移后的 record 结构与新建结构一致',
  JSON.stringify(fromV5.ships.s1.record) === JSON.stringify(Object.assign(Game.defaultRecord(), {
    sorties: 31, expeditions: 5, sWin: 20, taiha: 2, failures: 3, perfect: 9, bossKills: 12, lastBoss: '深海战列栖姬',
    firstClear: { '1-1': 1700000000000, '1-2': 1700000000001 },
    objectives: { '1-2-s': 1700000000002 },
    honors: [{ id: 'first_sortie', at: 1700000000003 }], remodelAt: [1700000000004]
  })));
check('v5 结果重复迁移稳定', JSON.stringify(Game.migrateSave(fromV5)) === JSON.stringify(fromV5));
/* 全链路：v1 旧档一路迁到 v6，也必须带齐 historic（链路无缺口） */
check('v1 旧档一路迁移到 v6 同样带齐 record.historic',
  fromV1.ships.s40.record.historic && Object.keys(fromV1.ships.s40.record.historic).length === 0 &&
  JSON.stringify(fromV1.ships.s40.record) === JSON.stringify(Game.defaultRecord()));
check('v6 档的战役账本已存在（新档同形状）',
  (() => {
    const s = Game.migrateSave({
      saveVersion: 6, version: 6,
      resources: { fuel: 1, ammo: 1, steel: 1, baux: 1, screws: 0, devMats: 10 },
      ships: { s1: { uid: 's1', id: 'mahan', record: Game.defaultRecord() } },
      equipment: {}, fleet: { 1: [], 2: [], 3: [], 4: [] },
      stats: { sortie: 1, historic: { 'H1:firstClear': 1700000000000 } }
    });
    return s.stats.historic['H1:firstClear'] === 1700000000000;
  })());

/* 损坏存档 */
const damaged = Game.migrateSave({ saveVersion: CUR, resources: null, fleet: null, ships: null, equipment: null, library: null });
check('损坏存档资源恢复默认', damaged.resources.fuel === 1000 && damaged.resources.devMats === 10);
check('损坏存档容器恢复', damaged.ships && damaged.equipment && damaged.fleet[1] && damaged.repairs);
check('损坏存档图鉴恢复', damaged.library && damaged.library.ships && damaged.library.equips);

/* 当前版本存档不被改写 */
const current = Game.migrateSave({
  saveVersion: CUR, version: CUR,
  resources: { fuel: 9, ammo: 8, steel: 7, baux: 6, screws: 5, devMats: 4 },
  ships: {}, equipment: {}, library: { ships: { mahan: true }, equips: {} }
});
check('当前档资源保持不变', current.resources.fuel === 9 && current.resources.screws === 5 && current.resources.devMats === 4);
check('当前档图鉴保持不变', current.library.ships.mahan === true);
check('当前档版本号不变', current.saveVersion === CUR && current.version === CUR);

console.log("\n通过 " + (TOTAL_CHECKS) + " 项，失败 0 项");
