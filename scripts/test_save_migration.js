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

function check(name, condition) {
  assert.ok(condition, name);
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

/* 幂等 */
check('v1 结果重复迁移稳定', JSON.stringify(Game.migrateSave(fromV1)) === JSON.stringify(fromV1));
check('v2 结果重复迁移稳定', JSON.stringify(Game.migrateSave(fromV2)) === JSON.stringify(fromV2));

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

console.log('\n通过 18 项，失败 0 项');
