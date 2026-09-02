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

function check(name, condition) {
  assert.ok(condition, name);
  console.log('  ✓ ' + name);
}
function oldSave() {
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

console.log('\n== 存档迁移专项测试 ==');
const migrated = Game.migrateSave(oldSave());
check('旧档升级到当前版本', migrated.saveVersion === Game.CURRENT_SAVE_VERSION && migrated.version === 2);
check('旧版经验曲线只迁移一次', migrated.admiral.level === 97 && migrated.admiral.exp === 18500 && migrated.expMigrated === true);
check('旧装备补齐改修星级', migrated.equipment.e41.star === 0);
check('旧资源补齐新字段', migrated.resources.screws === 0 && migrated.resources.devMats === 10);
check('废弃开发队列为空', Array.isArray(migrated.development) && migrated.development.length === 0);
check('舰队与地图结构规范化', [1, 2, 3, 4].every(i => Array.isArray(migrated.fleet[i])) && Object.keys(migrated.mapProgress).length === MAPS.length);

const onceMore = Game.migrateSave(migrated);
check('重复迁移结果稳定', JSON.stringify(onceMore) === JSON.stringify(migrated));

const damaged = Game.migrateSave({ saveVersion: 2, resources: null, fleet: null, ships: null, equipment: null });
check('损坏存档资源可恢复', damaged.resources.fuel === 1000 && damaged.resources.devMats === 10);
check('损坏存档容器可恢复', damaged.ships && damaged.equipment && damaged.fleet[1] && damaged.repairs);

const current = Game.migrateSave({ saveVersion: 2, version: 2, resources: { fuel: 9, ammo: 8, steel: 7, baux: 6, screws: 5, devMats: 4 }, ships: {}, equipment: {} });
check('当前档不改变资源', current.resources.fuel === 9 && current.resources.screws === 5 && current.resources.devMats === 4);
check('当前档版本保持不变', current.saveVersion === 2 && current.version === 2);

console.log('\n通过 11 项，失败 0 项');
