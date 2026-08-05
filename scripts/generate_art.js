'use strict';
/* ============================================================
 * SVG 舰娘立绘程序化生成器
 * 为每艘舰生成 240x360 拟人化卡片（海军制服少女半身像 + 军舰侧影）
 * 用法: npm run art   （输出到 public/art/portraits/<id>.svg）
 * ============================================================ */

const fs = require('fs');
const path = require('path');
const { SHIPS, SHIP_TYPE_ZH } = require('../public/js/data/ships.js');

/* ---------- 配色 ---------- */
const TYPE_BG = {
  BB: ['#1c3a5e', '#0e1f33'], BBV: ['#1c3a5e', '#0e1f33'],
  CV: ['#1b5e8a', '#0c2d44'], CVB: ['#1b5e8a', '#0c2d44'], CVL: ['#2a7a9e', '#14485f'],
  CA: ['#264a6e', '#12283c'], CAV: ['#264a6e', '#12283c'],
  CL: ['#3b6ea5', '#1c3a5e'], CLT: ['#3b6ea5', '#1c3a5e'],
  DD: ['#2f6f4f', '#143725'], DE: ['#2f6f4f', '#143725'],
  SS: ['#22353f', '#0d161c'],
  AV: ['#5e3a6e', '#2c1a35'], AS: ['#7a5a2a', '#3d2c12']
};

const TYPE_COLLAR = {
  BB: '#e0c060', CV: '#e8f0ff', CVL: '#cfe8ff', CA: '#9fb8d8', CL: '#a8d8ff',
  DD: '#a0e0c0', DE: '#a0e0c0', SS: '#8fa8b8', AV: '#c8a8e0', AS: '#f0d8a0'
};

/* 发型模板（函数返回头发路径段） */
const HAIRSTYLES = ['long', 'twintail', 'short', 'bob', 'ponytail', 'wave'];
const HAIR_COLORS = ['#c9b28e', '#8fb6d4', '#d8c8e8', '#e8d8b0', '#98c8a8', '#d4a0a0', '#b8b8c8', '#c8b090'];

/* 指定舰船的发型覆盖（默认按 id 哈希分配；个别舰需要统一人物比例） */
const HAIR_OVERRIDE = { wasp: 'long' };

/* 军舰侧影（简单多边形，按舰级不同轮廓） */
const SILHOUETTES = {
  BB: 'M30,290 L40,268 L52,268 L56,258 L118,258 L126,268 L176,268 L186,258 L226,258 L230,280 L214,290 Z',
  CV: 'M34,292 L46,272 L120,272 L128,258 L200,258 L208,272 L226,272 L232,292 Z',
  CA: 'M44,292 L54,276 L126,276 L134,266 L184,266 L190,276 L216,276 L222,292 Z',
  CL: 'M56,292 L64,280 L132,280 L138,272 L178,272 L184,280 L204,280 L208,292 Z',
  DD: 'M64,292 L72,284 L128,284 L134,278 L166,278 L170,284 L194,284 L196,292 Z',
  SS: 'M36,292 L60,286 L120,286 L160,282 L206,284 L218,292 Z',
  CVL: 'M48,292 L60,276 L124,276 L132,266 L188,266 L196,276 L220,276 L226,292 Z',
  AV: 'M40,292 L52,278 L122,278 L130,270 L182,270 L190,278 L218,278 L224,292 Z',
  AS: 'M52,292 L62,280 L120,280 L126,274 L172,274 L178,280 L204,280 L208,292 Z'
};

/* ---------- 人物部件生成 ---------- */
function headParts(type) {
  const collar = TYPE_COLLAR[type] || '#cfe8ff';
  return `
  <!-- 头部 -->
  <ellipse cx="120" cy="118" rx="46" ry="52" fill="#f2d9b8"/>
  <!-- 耳朵 -->
  <ellipse cx="74" cy="122" rx="6" ry="11" fill="#ecc8a4"/>
  <ellipse cx="166" cy="122" rx="6" ry="11" fill="#ecc8a4"/>
  <!-- 颈 -->
  <path d="M106,168 Q120,176 134,168 L134,180 Q120,186 106,180 Z" fill="#f2d9b8"/>
  <!-- 制服领 -->
  <path d="M86,196 Q120,210 154,196 L150,232 Q120,246 90,232 Z" fill="#e8ecf2"/>
  <path d="M120,204 L120,238" stroke="${collar}" stroke-width="6"/>
  <path d="M92,196 L120,208 L148,196" stroke="#9aa8b8" stroke-width="3" fill="none"/>
  <!-- 军衔领章 -->
  <rect x="92" y="200" width="20" height="8" rx="2" fill="${collar}"/>
  <rect x="128" y="200" width="20" height="8" rx="2" fill="${collar}"/>
  <circle cx="102" cy="204" r="2.2" fill="#fff"/>
  <circle cx="138" cy="204" r="2.2" fill="#fff"/>`;
}

function hairPart(style, color) {
  switch (style) {
    case 'long':
      return `<path d="M74,80 Q60,120 58,186 Q56,200 72,196 Q86,140 90,112 Q88,76 96,62 Q120,44 144,62 Q152,76 150,112 Q154,140 168,196 Q184,200 182,186 Q180,120 166,80 Q162,58 120,48 Q78,58 74,80 Z" fill="${color}"/>
        <path d="M74,84 Q62,120 60,184 Q60,196 74,192 Q84,140 88,116 Q86,78 96,64 Q120,48 144,64 Q154,78 152,116 Q156,140 166,192 Q180,196 180,184 Q178,120 166,84 Q158,56 120,48 Q82,56 74,84 Z" fill="${color}"/>`;
    case 'twintail':
      return `<path d="M74,80 Q64,96 60,128 Q58,150 48,166 Q42,176 52,180 Q64,170 70,142 Q76,108 84,86 Q80,64 96,58 Q120,44 144,58 Q160,64 156,86 Q164,108 170,142 Q176,170 188,180 Q198,176 192,166 Q182,150 180,128 Q176,96 166,80 Q158,54 120,46 Q82,54 74,80 Z" fill="${color}"/>
        <ellipse cx="54" cy="132" rx="14" ry="22" fill="${color}"/>
        <ellipse cx="186" cy="132" rx="14" ry="22" fill="${color}"/>
        <path d="M52,116 Q40,130 42,150 Q44,164 56,158 Q60,142 58,122 Z" fill="${color}"/>
        <path d="M188,116 Q200,130 198,150 Q196,164 184,158 Q180,142 182,122 Z" fill="${color}"/>`;
    case 'short':
      return `<path d="M74,88 Q68,110 72,128 Q74,140 88,136 Q90,110 100,96 Q102,64 120,52 Q150,52 152,96 Q158,116 164,132 Q174,134 172,122 Q170,96 166,88 Q158,56 120,46 Q82,56 74,88 Z" fill="${color}"/>
        <path d="M70,92 Q64,112 66,126 Q68,136 80,132 Q82,112 92,98 Q94,68 120,54 Q146,68 148,98 Q158,112 160,132 Q172,136 174,126 Q176,112 170,92 Q160,58 120,46 Q80,58 70,92 Z" fill="${color}"/>`;
    case 'bob':
      return `<path d="M74,84 Q62,110 64,140 Q66,164 78,168 Q84,140 92,118 Q96,92 110,78 Q130,66 150,80 Q162,96 162,124 Q166,148 172,162 Q184,156 182,136 Q178,100 166,82 Q152,52 120,44 Q88,52 74,84 Z" fill="${color}"/>
        <path d="M62,138 Q58,160 68,170 Q78,164 82,142 Q84,122 92,104 Q92,86 104,76 Q120,66 138,78 Q148,88 152,108 Q156,132 160,148 Q172,160 178,148 Q174,116 166,96 Q154,62 120,54 Q86,62 62,138 Z" fill="${color}"/>`;
    case 'ponytail':
      return `<path d="M74,80 Q66,104 68,132 Q70,148 84,146 Q90,116 98,96 Q100,64 120,52 Q148,58 154,88 Q156,108 162,130 Q168,146 178,140 Q174,118 170,100 Q166,60 120,44 Q82,56 74,80 Z" fill="${color}"/>
        <path d="M160,92 Q176,120 178,158 Q178,188 166,210 Q158,222 152,210 Q162,182 160,150 Q158,118 150,96 Z" fill="${color}"/>`;
    case 'wave':
      return `<path d="M74,82 Q62,104 64,132 Q66,154 80,160 Q84,136 92,116 Q96,88 108,74 Q128,58 150,74 Q162,90 160,118 Q158,140 168,158 Q180,154 178,136 Q174,100 162,82 Q148,50 120,44 Q88,52 74,82 Z" fill="${color}"/>
        <path d="M66,128 Q58,146 62,164 Q66,176 78,170 Q80,152 82,140 Z" fill="${color}"/>
        <path d="M174,132 Q184,150 180,166 Q176,178 164,172 Q160,152 160,140 Z" fill="${color}"/>`;
  }
  return '';
}

function facePart(seeded) {
  const eyeX = seeded % 2 ? 102 : 100;
  const smile = seeded % 3 === 0;
  return `
  <!-- 眼睛 -->
  <ellipse cx="${eyeX}" cy="118" rx="7.5" ry="8.5" fill="#fff"/>
  <ellipse cx="${200 - eyeX}" cy="118" rx="7.5" ry="8.5" fill="#fff"/>
  <circle cx="${eyeX}" cy="119" r="4.6" fill="#27425e"/>
  <circle cx="${200 - eyeX}" cy="119" r="4.6" fill="#27425e"/>
  <circle cx="${eyeX + 1.8}" cy="116.6" r="1.4" fill="#fff"/>
  <circle cx="${200 - eyeX + 1.8}" cy="116.6" r="1.4" fill="#fff"/>
  <!-- 眉 -->
  <path d="M${eyeX - 8},105 Q${eyeX},100 ${eyeX + 8},105" stroke="#5a4030" stroke-width="2" fill="none"/>
  <path d="M${200 - eyeX - 8},105 Q${200 - eyeX},100 ${200 - eyeX + 8},105" stroke="#5a4030" stroke-width="2" fill="none"/>
  <!-- 嘴 -->
  ${smile
    ? `<path d="M110,140 Q120,146 130,140" stroke="#b06060" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
    : `<path d="M114,141 Q120,144 126,141" stroke="#b06060" stroke-width="2.2" fill="none" stroke-linecap="round"/>`}
  <!-- 腮红 -->
  <ellipse cx="${eyeX - 14}" cy="132" rx="6" ry="3.5" fill="#f0a8a8" opacity="0.5"/>
  <ellipse cx="${200 - eyeX + 14}" cy="132" rx="6" ry="3.5" fill="#f0a8a8" opacity="0.5"/>`;
}

/* ---------- 生成一张立绘 ---------- */
function portrait(ship) {
  const bg = TYPE_BG[ship.type] || TYPE_BG.DD;
  const collar = TYPE_COLLAR[ship.type] || '#cfe8ff';
  const hairColor = HAIR_COLORS[(ship.id.length + ship.rarity) % HAIR_COLORS.length];
  const style = HAIR_OVERRIDE[ship.id] || HAIRSTYLES[(ship.id.length + ship.stats[8]) % HAIRSTYLES.length];
  const sil = SILHOUETTES[ship.type] || SILHOUETTES.DD;
  const seed = (ship.id.length * 7 + ship.rarity * 13) % 13;
  const stars = '★'.repeat(ship.rarity) + '☆'.repeat(5 - ship.rarity);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360" viewBox="0 0 240 360">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${bg[0]}"/>
      <stop offset="1" stop-color="${bg[1]}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.35" r="0.7">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="240" height="360" fill="url(#bg)"/>
  <rect width="240" height="360" fill="url(#glow)"/>
  <!-- 装饰线 -->
  <rect x="0" y="0" width="240" height="6" fill="#ffd700"/>
  <path d="M0,40 Q240,28 240,40 L240,0 L0,0 Z" fill="#0a1420" opacity="0.35"/>
  <!-- 舰级徽章 -->
  <g transform="translate(16,14)">
    <rect width="42" height="20" rx="3" fill="#0a1420" opacity="0.75" stroke="#ffd700" stroke-width="1"/>
    <text x="21" y="15" font-size="11" font-weight="bold" text-anchor="middle" fill="#ffd700" font-family="Arial">${ship.type}</text>
  </g>
  <!-- 稀有度 -->
  <text x="228" y="26" font-size="12" text-anchor="end" fill="#ffd700" font-family="Arial">${stars}</text>
  <!-- 人物 -->
  ${hairPart(style, hairColor)}
  ${headParts(ship.type)}
  ${facePart(seed)}
  <!-- 舰船侧影水印 -->
  <g transform="translate(0,0)" fill="#000" opacity="0.45">
    <path d="${sil}"/>
  </g>
  <!-- 底部信息条 -->
  <rect x="0" y="324" width="240" height="36" fill="#0a1420" opacity="0.85"/>
  <rect x="0" y="324" width="240" height="2.5" fill="#ffd700"/>
  <text x="120" y="342" font-size="13" font-weight="bold" text-anchor="middle" fill="#ffffff" font-family="Arial">${ship.en}</text>
  <text x="120" y="356" font-size="10" text-anchor="middle" fill="${collar}" font-family="'Microsoft YaHei', sans-serif">${ship.zh} · ${SHIP_TYPE_ZH[ship.type]}${ship.cls ? ' · ' + ship.cls : ''}</text>
</svg>`;
}

/* ---------- 深海敌军通用立绘 ---------- */
function deepPortrait(boss) {
  const bg = boss ? ['#4a1414', '#1c0606'] : ['#3a2434', '#140a12'];
  const collar = boss ? '#ff6060' : '#b06090';
  const stars = boss ? '★★★☆☆' : '★★☆☆☆';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360" viewBox="0 0 240 360">
  <defs>
    <linearGradient id="dbg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/>
    </linearGradient>
  </defs>
  <rect width="240" height="360" fill="url(#dbg)"/>
  <rect x="0" y="0" width="240" height="6" fill="#8a2020"/>
  <g transform="translate(16,14)">
    <rect width="42" height="20" rx="3" fill="#0a0a0a" opacity="0.75" stroke="#ff6060" stroke-width="1"/>
    <text x="21" y="15" font-size="11" font-weight="bold" text-anchor="middle" fill="#ff6060" font-family="Arial">${boss ? 'DEEP' : 'ABYSS'}</text>
  </g>
  <text x="228" y="26" font-size="12" text-anchor="end" fill="#ff6060" font-family="Arial">${stars}</text>
  <!-- 深海军少女 -->
  <path d="M74,84 Q60,110 62,140 Q64,166 78,170 Q84,142 92,120 Q96,94 110,80 Q130,68 150,82 Q162,98 162,126 Q166,150 172,164 Q184,158 182,138 Q178,102 166,84 Q152,54 120,46 Q88,54 74,84 Z" fill="#2a2a38"/>
  <ellipse cx="120" cy="118" rx="46" ry="52" fill="#d8b894"/>
  <path d="M62,138 Q58,160 68,170 Q78,164 82,142 Q84,122 92,104 Q92,86 104,76 Q120,66 138,78 Q148,88 152,108 Q156,132 160,148 Q172,160 178,148 Q174,116 166,96 Q154,62 120,54 Q86,62 62,138 Z" fill="#181828"/>
  <ellipse cx="102" cy="118" rx="7.5" ry="8.5" fill="#ff5050"/>
  <ellipse cx="98" cy="118" rx="7.5" ry="8.5" fill="#ff5050"/>
  <circle cx="102" cy="119" r="4" fill="#2a0505"/>
  <circle cx="98" cy="119" r="4" fill="#2a0505"/>
  <path d="M108,142 Q120,150 132,142" stroke="#701818" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M86,196 Q120,212 154,196 L150,234 Q120,248 90,234 Z" fill="#1a1a28"/>
  <path d="M120,204 L120,240" stroke="${collar}" stroke-width="6"/>
  <!-- 舰影 -->
  <path d="${SILHOUETTES[boss ? 'BB' : 'CA']}" fill="#000" opacity="0.5"/>
  <rect x="0" y="324" width="240" height="36" fill="#0a0505" opacity="0.9"/>
  <rect x="0" y="324" width="240" height="2.5" fill="#8a2020"/>
  <text x="120" y="344" font-size="13" font-weight="bold" text-anchor="middle" fill="#ff8080" font-family="Arial">${boss ? 'DEEP FLEET BOSS' : 'DEEP FLEET'}</text>
  <text x="120" y="357" font-size="10" text-anchor="middle" fill="#d8a0a0" font-family="'Microsoft YaHei', sans-serif">${boss ? '深海栖舰' : '深海军舰艇'}</text>
</svg>`;
}

/* ---------- 生成全部 ---------- */
const outDir = path.join(__dirname, '..', 'public', 'art', 'portraits');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

let count = 0;
for (const ship of SHIPS) {
  const file = path.join(outDir, ship.id + '.svg');
  fs.writeFileSync(file, portrait(ship), 'utf8');
  count++;
}
fs.writeFileSync(path.join(outDir, 'deep.svg'), deepPortrait(false), 'utf8');
fs.writeFileSync(path.join(outDir, 'deep_boss.svg'), deepPortrait(true), 'utf8');
console.log(`已生成 ${count + 2} 张立绘（含深海通用2张） -> public/art/portraits/`);
