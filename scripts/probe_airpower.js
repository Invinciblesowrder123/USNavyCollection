'use strict';
/* V0.304 探针：实测各敌编成制空值（批次1 4-4 大机群 / 批次2 M1/M2 BOSS 定档用）
 * 用法：node scripts/probe_airpower.js [F22 F73 ...]（缺省 = 全部编成） */
const equipMod = require('../public/js/data/equipment.js');
Object.assign(global, { SLOT: equipMod.SLOT, EquipmentData: equipMod.EquipmentData, SECRETARY_POOL: equipMod.SECRETARY_POOL, secretaryKey: equipMod.secretaryKey, devPoolKey: equipMod.devPoolKey, devEntries: equipMod.devEntries, devFailShare: equipMod.devFailShare, devMinReq: equipMod.devMinReq, EQUIP_CAT_ZH: equipMod.EQUIP_CAT_ZH, EQUIP_STAT_ZH: equipMod.EQUIP_STAT_ZH, IMPROVE: equipMod.IMPROVE, DEV_SEC: equipMod.DEV_SEC, DEV_POOL: equipMod.DEV_POOL });
const shipsMod = require('../public/js/data/ships.js');
Object.assign(global, { SHIP_TYPE_ZH: shipsMod.SHIP_TYPE_ZH, SHIPS: shipsMod.SHIPS, ShipData: shipsMod.ShipData, remodelChain: shipsMod.remodelChain, buildPool: shipsMod.buildPool, RARITY_W: shipsMod.RARITY_W, STARTER_IDS: shipsMod.STARTER_IDS, SLOW_CLASSES: shipsMod.SLOW_CLASSES, shipSpeed: shipsMod.shipSpeed });
const mapsMod = require('../public/js/data/maps.js');
Object.assign(global, { DEEP_TEMPLATES: mapsMod.DEEP_TEMPLATES, ENEMY_FLEETS: mapsMod.ENEMY_FLEETS, MAPS: mapsMod.MAPS, EXPEDITIONS: mapsMod.EXPEDITIONS });
const histMod = require('../public/js/data/history.js');
Object.assign(global, { HISTORY_BATTLES: histMod.HISTORY_BATTLES, History: histMod.History });
Object.assign(global, require('../public/js/core/utils.js'));
Object.assign(global, require('../public/js/game/battle.js'));

const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ENEMY_FLEETS);
for (const k of keys) {
  const ef = ENEMY_FLEETS[k] || (History && History.ENEMY_BY_KEY && History.ENEMY_BY_KEY[k]);
  if (!ef) { console.log(`${k}\tMISSING`); continue; }
  const air = typeof Battle.enemyAirPower === 'function' ? Battle.enemyAirPower(k) : 'n/a';
  const hasSS = ef.ships.some(x => DEEP_TEMPLATES[x] && DEEP_TEMPLATES[x].type === 'SS');
  console.log(`${k}\tair=${air}\tSS=${hasSS ? 'Y' : 'N'}\t${ef.formation}\t${ef.ships.join(',')}`);
}
