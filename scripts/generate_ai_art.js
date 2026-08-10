'use strict';
/* ============================================================
 * 智谱 CogView AI 舰娘立绘批量生成器
 * 调用智谱图像生成 API（cogview-4 / cogview-3-flash），输出到
 * public/art/ai/<id>.png，并写入 public/art/ai/index.json 清单。
 *
 * 用法:
 *   node scripts/generate_ai_art.js                # 生成全部（含改/改二差分）
 *   node scripts/generate_ai_art.js mahan fletcher # 只生成指定舰
 *   node scripts/generate_ai_art.js --type=BB      # 按舰种筛选
 *   node scripts/generate_ai_art.js --rarity=5     # 按稀有度筛选（1~5）
 *   node scripts/generate_ai_art.js --no-kai       # 跳过改造差分立绘
 *   node scripts/generate_ai_art.js --force        # 覆盖已存在的
 *   node scripts/generate_ai_art.js --limit=5      # 最多生成 N 张
 *   node scripts/generate_ai_art.js --model=cogview-3-flash  # 免费模型
 *   node scripts/generate_ai_art.js --size=768x1344
 *   node scripts/generate_ai_art.js --deep         # 深海栖舰 2 张
 *   node scripts/generate_ai_art.js --dry-run      # 只打印提示词与费用预估
 *
 * 文件命名: <id>.jpg（基础）、<id>_kai.jpg（改）、<id>_kai2.jpg（改二）
 *
 * API Key: 优先读环境变量 ZHIPU_API_KEY，否则读 data/zhipu_api_key.txt
 * ============================================================ */

const fs = require('fs');
const path = require('path');
const https = require('https');

const { SHIPS, SHIP_TYPE_ZH } = require('../public/js/data/ships.js');

const API_URL = 'https://open.bigmodel.cn/api/paas/v4/images/generations';
const PRICE = { 'cogview-4': 0.06, 'cogview-3-flash': 0 }; // 元/次
const OUT_DIR = path.join(__dirname, '..', 'public', 'art', 'ai');
const KEY_FILE = path.join(__dirname, '..', 'data', 'zhipu_api_key.txt');

/* 已有产物清单（用于跳过/清单重建） */
const MANIFEST = {};
(function scanExisting() {
  if (!fs.existsSync(OUT_DIR)) return;
  for (const f of fs.readdirSync(OUT_DIR)) {
    const m = f.match(/^(.+)\.(png|jpg|jpeg|webp)$/i);
    if (m) MANIFEST[m[1]] = f;
  }
})();

/* ---------- 参数解析 ---------- */
const args = process.argv.slice(2);
const get = (name, def) => {
  const a = args.find(x => x.startsWith('--' + name + '='));
  return a ? a.split('=')[1] : def;
};
const has = name => args.includes('--' + name);
const ids = args.filter(x => !x.startsWith('--'));
const MODEL = get('model', 'cogview-4');
const SIZE = get('size', '864x1152');
const CONC = Math.max(1, Math.min(5, parseInt(get('conc', '3'), 10)));

/* ---------- 提示词模板 ---------- */
const TYPE_DESC = {
  BB: '庄重威严的战列舰娘，优雅沉稳的大姐姐气质，白色海军大礼服与深蓝长裙，身后悬浮大型双联主炮台与舰桥舰装',
  BBV: '航空战列舰娘，庄重中带航空兵气息，白色海军礼服，背后展开起飞甲板与主炮台舰装',
  CV: '正规航母娘，沉稳可靠的姐姐气质，白色军服与短裙，头饰为飞行甲板造型，身边环绕舰载机与甲板舰装',
  CVB: '装甲航母娘，沉稳英气，深蓝白色军服，装甲甲板造型肩甲与舰载机舰装',
  CVL: '轻航母娘，活泼轻快，白色水手服与短裙，发饰为小型飞行甲板，舰载机与弹射器舰装',
  CA: '干练果敢的重巡洋舰娘，深蓝海军制服与短裙，身侧悬挂三联主炮塔舰装',
  CAV: '航空重巡洋舰娘，干练中带航空元素，蓝白制服，舰载水上机与主炮塔舰装',
  CL: '明朗亲切的轻巡洋舰娘，蓝白水手服与短裙，小巧主炮与鱼雷发射管舰装',
  CLT: '潇洒锐利的雷装巡洋舰娘，深蓝制服，大型鱼雷发射管与主炮舰装',
  DD: '活泼可爱的驱逐舰娘，元气满满，蓝白水手服与短裙，两侧装有鱼雷发射管和小口径主炮舰装',
  DE: '年幼可爱的海防舰娘，娇小玲珑，略显宽大的水手服，小口径炮与深水炸弹舰装',
  SS: '神秘俏皮的潜水艇娘，深蓝连体潜水服，头顶潜望镜发饰，身侧浮出潜艇艇身舰装',
  AV: '温柔知性的水上机母舰娘，白色蓝紫色制服与长裙，身后水面停泊水上机母舰舰装',
  AS: '温婉可靠的工作舰娘，蓝白工作服与长裙，身后大型工作舰起重臂舰装'
};

const RARITY_DESC = {
  1: '简朴的海军水手服装束',
  2: '整洁的海军军官制服装束',
  3: '精致的海军军官礼服装束',
  4: '华美的海军仪仗礼服装束',
  5: '华丽的金饰海军大礼服，气场全开'
};

/* 风格锁：所有提示词共用的画风描述（仿舰C厌战号立绘，保持全局风格统一） */
const STYLE_LOCK = '仿《舰队收藏》(KanColle)官方舰娘立绘画风，参考英国战列舰「厌战号」(Warspite)官方全身立绘：日系动画赛璐璐上色，干净细描线，平涂阴影，色彩明快柔和；纯白背景，全身立绘居中站立、双脚完整着地、头顶留白约15%；日系游戏角色立绘质感，无多余背景元素';

/* 发色/瞳色：按舰 id 哈希分配，增加辨识度（配色取自舰C官方常用色系） */
const HAIR_COLORS = ['银白色长直发', '亚麻金色长发', '深褐色短发', '黑色长卷发', '深蓝色短发', '樱粉色双马尾', '草绿色中长发', '紫罗兰色长发'];
const EYE_COLORS = ['蓝色眼眸', '金色眼眸', '翠绿色眼眸', '红棕色眼眸', '紫色眼眸', '琥珀色眼眸'];

/* 改造差分：同角色不同阶段（纯文生图无法保证脸部一致，仅换装升级） */
const KAI_DESC = {
  1: '改造后的形态：制服升级为海军尉官礼服，佩戴绶带，姿态干练自信，气质更成熟',
  2: '改二后的最终形态：华丽的指挥官大礼服，勋章绶带与军帽，神情凛然，气场全开'
};

function buildPrompt(ship, kai) {
  const typeName = SHIP_TYPE_ZH[ship.type] || ship.type;
  const cls = ship.cls || '';
  const desc = TYPE_DESC[ship.type] || '海军舰娘';
  const rarity = RARITY_DESC[ship.rarity] || RARITY_DESC[1];
  const line = ship.line ? `，人物性格：${ship.line.replace(/[。.]+$/, '')}` : '';
  const kaiTxt = kai ? KAI_DESC[kai] + '。' : '';
  const seed = (ship.id.length * 7 + ship.rarity * 13) % HAIR_COLORS.length;
  const hair = HAIR_COLORS[seed];
  const eyes = EYE_COLORS[(seed * 3 + 2) % EYE_COLORS.length];
  return `${STYLE_LOCK}。角色：美国海军${typeName}「${ship.en}」${cls}${line}。${desc}。${kaiTxt}${rarity}。${hair}，${eyes}。`;
}

const DEEP_PROMPTS = {
  deep: `日系动画赛璐璐上色，干净细描线，深海栖舰少女，惨白肤色，黑色残破军服与披风，暗红色发光双眼，冷漠神情，周身环绕暗色舰装与黑色浪花，纯白背景，全身立绘居中站立，危险诡异氛围。`,
  deep_boss: `日系动画赛璐璐上色，干净细描线，深海栖舰首领，妖艳威严，惨白肤色，黑金色残破大礼服与王冠，血红色发光双眼，居高临下的神情，周身环绕巨大黑色舰装与血色浪花，纯白背景，全身立绘居中站立，压迫感十足。`
};

/* ---------- API 调用 ---------- */
function postImage(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: MODEL, prompt, size: SIZE });
    const req = https.request(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + API_KEY
      },
      timeout: 90000
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
        }
        let j;
        try { j = JSON.parse(data); } catch (e) { return reject(new Error('响应解析失败: ' + data.slice(0, 300))); }
        const url = j && j.data && j.data[0] && j.data[0].url;
        if (!url) return reject(new Error('响应无图片 URL: ' + data.slice(0, 300)));
        resolve(url);
      });
    });
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function download(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 120000 }, res => {
      if (res.statusCode >= 400) {
        res.resume();
        return reject(new Error('下载失败 HTTP ' + res.statusCode));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('timeout', () => req.destroy(new Error('下载超时')));
    req.on('error', reject);
  });
}

function sniffExt(buf) {
  if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  if (buf.length > 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return 'png';
}

async function genOne(shipId, prompt, force) {
  if (!force && MANIFEST[shipId]) return 'skip';
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const url = await postImage(prompt);
      const buf = await download(url);
      if (!buf || buf.length < 1000) throw new Error('图片数据异常（可能被内容审核拦截）');
      const file = path.join(OUT_DIR, shipId + '.' + sniffExt(buf));
      fs.writeFileSync(file, buf);
      return 'ok:' + path.basename(file);
    } catch (e) {
      const is429 = e.message.includes('429');
      if (attempt >= 5) return 'fail:' + e.message.slice(0, 160);
      /* 限流指数退避 + 抖动，避免并发重试风暴；其余错误短退避 */
      const base = is429 ? 30000 : 5000;
      const wait = base * attempt + Math.floor(Math.random() * 10000);
      console.log(`  [${shipId}] 第${attempt}次失败(${e.message.slice(0, 100)})，${Math.round(wait / 1000)}s 后重试`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

/* ---------- 主流程 ---------- */
const API_KEY = process.env.ZHIPU_API_KEY || (fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE, 'utf8').trim() : '');
if (!API_KEY) {
  console.error('未找到 API Key：请设置环境变量 ZHIPU_API_KEY，或写入 data/zhipu_api_key.txt');
  process.exit(1);
}

let targets = [];
if (has('deep')) {
  targets = Object.keys(DEEP_PROMPTS).map(id => ({ id, prompt: DEEP_PROMPTS[id] }));
} else {
  let list = SHIPS;
  const type = get('type');
  const rarity = get('rarity');
  if (type) list = list.filter(s => s.type === type);
  if (rarity) list = list.filter(s => String(s.rarity) === rarity);
  if (ids.length) list = list.filter(s => ids.includes(s.id));
  targets = list.map(s => ({ id: s.id, prompt: buildPrompt(s) }));
  /* 改造差分立绘：<id>_kai（全部 104 艘有改）、<id>_kai2（12 艘有改二）；--no-kai 跳过 */
  if (!has('no-kai')) {
    list.forEach(s => {
      if (s.kai) targets.push({ id: s.id + '_kai', prompt: buildPrompt(s, 1) });
      if (s.kai2) targets.push({ id: s.id + '_kai2', prompt: buildPrompt(s, 2) });
    });
  }
}
const limit = parseInt(get('limit', '0'), 10) || targets.length;
targets = targets.slice(0, limit);

const price = PRICE[MODEL] !== undefined ? PRICE[MODEL] : 0.06;
const cost = (targets.length * price).toFixed(2);
console.log(`模型: ${MODEL}  尺寸: ${SIZE}  并发: ${CONC}  目标: ${targets.length} 张  预估费用: ￥${cost}`);

if (has('dry-run')) {
  targets.forEach((t, i) => console.log(`\n[${i + 1}] ${t.id}\n  ${t.prompt}`));
  console.log(`\n(dry-run 结束，未调用 API)`);
  process.exit(0);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
(async () => {
let done = 0, skip = 0, fail = 0, ok = 0;
const fails = [];
const queue = targets.slice();
const workers = Array.from({ length: CONC }, async () => {
  while (queue.length) {
    const t = queue.shift();
    if (!t) return;
    const r = await genOne(t.id, t.prompt, has('force'));
    if (r.startsWith('ok')) { ok++; console.log(`[${++done}/${targets.length}] ${t.id} ✓ ${r.slice(3)}`); }
    else if (r === 'skip') { skip++; console.log(`[${++done}/${targets.length}] ${t.id} 已存在，跳过`); }
    else { fail++; fails.push(t.id + ': ' + r); console.log(`[${++done}/${targets.length}] ${t.id} ✗ ${r}`); }
  }
});
await Promise.all(workers);

const MANIFEST2 = {};
for (const f of fs.readdirSync(OUT_DIR)) {
  const m = f.match(/^(.+)\.(png|jpg|jpeg|webp)$/i);
  if (m) MANIFEST2[m[1]] = f;
}
fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(MANIFEST2, null, 0));
console.log(`\n完成: 生成 ${ok} / 跳过 ${skip} / 失败 ${fail}，已更新 public/art/ai/index.json（${Object.keys(MANIFEST2).length} 张）`);
if (fails.length) {
  console.log('失败清单:');
  fails.forEach(f => console.log('  ' + f));
  console.log(`重跑命令可补全: node scripts/generate_ai_art.js ${fails.map(f => f.split(':')[0]).join(' ')}`);
}
})();
