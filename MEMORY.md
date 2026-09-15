# MEMORY — 项目记忆文件

> 本文件是项目的"大脑"，记录关键决策、架构约定与当前状态。
> 任何会话开始时必须先读此文件。每次大改动后必须更新。

## 项目是什么

**《美舰收藏（US Navy Collection）》** —— 基于《舰队收藏》核心机制与玩法分析报告的仿品网页游戏。
题材：美国海军军舰拟人化（舰娘），主题为美军舰船（BB/CV/CA/CL/DD/SS/AV 等）。

- 依据：`../舰队收藏网页游戏核心机制与玩法设计分析报告.md`（战斗/养成/资源/远征/任务/活动六大系统）+ kcwiki 舰娘百科
- 技术栈：**Node.js (Express) 静态服务器 + 纯前端 JS 单页应用 + localStorage 存档**
- 分支策略：`main`（稳定版，首次提交后创建）+ `develop`（开发分支，日常在 develop 上工作）
- 位置：`D:\AI\WG\USNavyCollection`（2026-09 换机迁移后路径；旧机为 `C:\Users\johnz\Desktop\WG\USNavyCollection`）

## 关键决策记录（ADR）

| 日期 | 决策 |
|---|---|
| 2026-08-03 | 技术方案：Node.js 本地服务器（用户选择），前端无框架 vanilla JS |
| 2026-08-03 | 美术风格：舰娘拟人卡片风，SVG 程序化生成占位立绘（用户选择，无 AI 生图工具） |
| 2026-08-03 | 功能范围：完整核心循环（母港/编成/建造/开发/远征/入渠/补给/任务/改造/近代化/演习 + 昼夜战斗 + 海域） |
| 2026-08-03 | 存档：localStorage 单档位（键 `usnc_save`），服务器不存玩家数据 |
| 2026-08-03 | 战斗引擎：纯前端 JS，参考报告第1-2章公式（简化但保真） |
| 2026-08-06 | 战斗分段流程：昼战 →「追击选择」（夜战突入/战斗结束）→ 夜战，玩家自主决定是否夜战（参照 wiki 战斗流程第13~14步）；演习由玩家自选阵型、敌方固定单纵阵 |
| 2026-08-07 | 舰艇 55→104 艘（纯数据），名单经用户评审；稀有度差异化参照舰C wiki：舰名按稀有度配色（银白/绿/蓝/紫/金）+ 立绘金★星标与彩色边框（`.rn-1~5`/`.portrait-r2~5`） |
| 2026-08-10 | 索敌判定（wiki 2-5(33)式简化）：索敌值=Σ[装备系数×装备索敌值]+Σ√(素索敌)-⌈HQ×0.4⌉+2×(6-N)；带水侦/舰载机必定触发、按敌我比值判成败，深海不会失败；成功→「命中・回避力UP」+3%，失败→「対空・回避力DOWN」-5%且无法参加航空战；索敌机未归还仅在失败时出现（35%，减少水侦搭载，全损则昼战特殊攻击失效）——wiki 字面存在「成功（未归还）」组合但产品上成功视为索敌机安全返回 |
| 2026-08-10 | 开幕空袭动画三步走：①双方机群起飞并悬停于舰队上空 ②双方防空炮火按实际击落比例演示坠机（保留至少1架）③机群自高空纯俯冲轰炸（无重复起飞）；昼战空母航空攻击（无前置起飞）回退航母起飞；空袭汇总字符串改在轰炸事件后 push，防空结束立即轰炸无滞空 |
| 2026-08-11 | 装备体系 v2（参照 kcwiki「装备列表」）：55→115 件 + 16 新类别（舰侦/夜间舰战/夜间舰攻/喷式舰战/对潜哨戒机/大型飞行艇/两用电探/高射装置/对空弹/照明弹/增设装甲/机关部强化/爆雷投射机/航空要员/上陆用舟艇/消耗品）；装备仓库上限 500 格且**仅统计闲置装备**（`equipIdleCount`，装备在舰艇上的不占容量，建造/舰娘奖励/掉落不受满仓限制）；装备稀有度白/绿/蓝/紫/金（`eq-r1~5` + 标签）；获取自动上锁（首个舰艇 `firstShipLocked` + 稀有舰艇稀有度≥4 + 稀有装备≥4 + 消耗品一律）；消耗性物资（应急修理要员/战斗粮食/洋上补给）出击消耗；舰艇解体强制检查 locked（修复漏洞） |
| 2026-08-03 | 命名：舰船用英文舰名+中文译名双名制（如 Enterprise 企业） |

## 架构

```
USNavyCollection/
├── server.js              # Express 静态服务器（唯一后端职责）
├── package.json
├── scripts/
│   ├── generate_art.js    # 程序化生成 SVG 舰娘立绘 -> public/art/portraits/
│   └── simulate.js        # headless 战斗/循环模拟测试
├── public/
│   ├── index.html
│   ├── css/style.css
│   ├── art/portraits/     # 生成的立绘（git 跟踪，因为本地无法再生成时保证可用）
│   └── js/
│       ├── main.js        # 启动引导 + 屏幕路由
│       ├── core/utils.js  # RNG/格式化/常量
│       ├── core/state.js  # 存档结构/资源/时间/保存载入
│       ├── data/*.js      # ships/equipment/maps/expeditions/quests（纯数据，全局常量）
│       ├── game/battle.js # 战斗引擎（昼/夜/制空/特殊攻击）
│       ├── game/factory.js# 建造/开发
│       ├── game/logistics.js # 远征/补给/入渠/疲劳
│       ├── game/progression.js # 等级/改造/近代化/任务追踪
│       └── ui/*.js        # 各屏幕渲染器
```

### 数据规范速查（写代码前必读）

- 舰船字段：`id, en, zh, cls(舰级), type(BB/CV/...), rarity(1-5), stats{hp,fp,tp,aa,arm,evd,asw,los,lck}, slots[{types,size}], equip[装备id], consumption{fuel,ammo}, build{fuel,ammo,steel,baux,time,hours}, kai:{lv,needs,stats...} | null`
- 类型代码：`BB BBV CV CVL CA CAV CL CLT DD SS AV AS AR DE`
- 装备字段：`id, en, zh, cat(主炮小/中/大/副炮/鱼雷/舰战/舰攻/舰爆/水侦/水爆/电探/高角炮/机枪/声呐/爆雷/穿甲弹/设备 + 16新类别：舰侦/夜间舰战/夜间舰攻/喷式舰战/对潜哨戒机/大型飞行艇/两用电探/高射装置/对空弹/照明弹/增设装甲/机关部强化/爆雷投射机/航空要员/上陆用舟艇/消耗品), stat{fp,tp,aa,arm,asw,los,evd,bmb,avg,radius,speed}, slotType, cost, buildable, kai(改修上限,>0 可改修), r(稀有度1~4→开发等级门槛=稀有度×3), scrap(解体回收→开发最低资源要求=×10), dev(开发条目: 秘书舰系→池→份额, 出货率=份额×2%)`
- 开发系统：秘书舰系 炮战GUN(BB/CA)/水雷MINE(DD/DE/CL/CLT)/空母CV(CV/CVL/BBV/CAV/AV)/潜水SUB(SS/SSV/AS) × 最高资源池 油钢OIL/弹药AMMO/铝BAUX（优先顺序 燃料钢材>弹药>铝，平局归前者）；每池50等份，失败份额=50-Σ；roll后判定 提督等级≥r×3 且 资源≥scrap×10；成功消耗1开发资材，失败返还；即时结算
- 开发资材(devMats)：上限3000；初始10；日常d6「装备开发3次」+1、周常w5+3、月常m1+5/m2+8、一次性o16「狙击开发」+5、远征ex7+1/ex8+2
- 装备实例：`{uid, id, star(0~10, ★MAX=10), locked}`；改修效果=类别系数×√★（大主炮1.5/鱼雷1.2/其余1.0，舰战/舰攻★×0.2，电探·水侦→索敌，声呐·爆雷→对潜）
- 装备仓库：上限500格（`state.equipCap`，任务 o35/o36/o40 可扩充）；**存储计数只统计闲置装备**（`equipIdleCount()`，装备在舰艇上的不占容量）；满仓拦截开发/任务装备奖励（建造/舰娘奖励/掉落不受限）；测试模式豁免全部限制
- 获取自动上锁：`createShip` 首个舰艇（`state.firstShipLocked` 标记）与稀有舰艇（rarity≥4）自动 locked；`createEquip` 稀有装备（r≥4）与消耗品（cat=消耗品）自动 locked；上锁舰艇不可解体/不可作素材，上锁装备不可解体/不可作改修素材
- 消耗性物资：应急修理要员（沉没前回满耐久，结算消耗）/ 战斗粮食（夜战攻击+10%，进夜战消耗1个）/ 洋上补给（油弹不满进战斗自动回满并消耗）——均在 `sortie.js settleBattle/prepareBattle` 中消费
- 改修配置（equipment.js `IMPROVE`）：`{need(basic/dd/cl/bb/cv/as 二号舰解锁), screws, res[4], matFrom(默认6), update{to,mats[2]}}`
- 近代化素材值（progression.js `MOD_VALUE`/`MOD_KAI_BONUS`）：舰种决定素材属性值（参照 wiki 素材列表）；奖励值=(n+1)÷5+n，偏斜=((n+2)÷5+n)÷2；上限 火力/雷装/对空/装甲=基础×1.3，耐久+2/对潜+9/运+8（仅DE素材）；改造重置 fp/tp/aa/arm
- 改修工厂：维斯塔尔(AS)为第一舰队旗舰解锁；每日次数=1+二号舰(AS/AV)+1+维斯塔尔改+1(≤3)；成功率表 improve.js `SUCCESS_RATE`；确定化=2倍螺丝必成功；★MAX 更新后新装备★5
- 制空值 = 对空值 × √搭载数（截尾取整）
- 昼战特殊攻击：需制空优势+且带水侦/水爆；主主+穿甲弹=1.5x主炮CI / 主副+穿甲弹=1.3x / 主副+电探=1.2x / 主副=1.1x / 双主=1.2x×2连击
- 夜战攻击力 = 火力+雷装+5（上限300），鱼雷CI=1.5x×2 / 主鱼CI=1.3x×2 / 双主连击=1.2x×2
- 白天攻击力 = (火力+5) 上限180（阈值后开方）；伤害 = 攻击力×阵型×航向×特殊 - 装甲×0.7，浮动0.7~1.3，暴击1.5x
- 弹药补正（wiki）：残弹率≥50%→1，<50%→残弹率/50，0%无法炮击；为**阈值后补正**作用于最终伤害，按战斗开始时残弹计算；每战斗点耗油弹各20%（夜战弹药30%），资源点/补给点不消耗
- 1-2 海域（wiki）：C 为弹药资源点（不耗油弹/士气）；索敌≥20 走 C→D 短路线，否则 A→B→D；BOSS=重雷装巡洋舰CHI级(CLT)旗舰+驱逐/轻巡，无重巡以上、≤5艘
- 资源：油/弹/钢每3分钟+3，铝每3分钟+1；上限随提督等级；改修资材(螺丝)上限3000，不自然恢复（任务获得）
- 士气（**2026-09-11 依代码修正，旧记录"出击-30/回港+15/命中回避±10~20%"是错的**）：
  - 增减：出击结算 `-15`（`sortie.js:241`）；远征 `+30`（`logistics.js`）；**演习不改士气**（`progression.js::applyBattleResult` 无 morale 写入）；
    回港静置每 tick `+3` 至 49，**49~52 直接跳到 53**（`state.js:156-157`）——即"歇一会儿就自动闪"。新舰初始 49。
  - 战斗修正（`battle.js:222-233`）：闪（≥50）命中 `×1.2`、回避 `×1.8`；红脸（<30）命中 `×0.5`（**红脸无回避惩罚**）
  - 注意：32 项以上会在 UI 上"看不见"（只有闪徽记，无红脸提示），是已知的表现缺口
- 奖励/经验：S/A/B/C/D/E 胜；旗舰1.5x，MVP 2x
- 重置节奏：每日05:00（日常/入渠/演习/远征任务），每周一05:00（周常），每月1日05:00（月常）
- 海域威胁维度（`maps[].threat`，可选）：取值 `air|los|asw|night|radar`，**必须能由该图节点推导**——
  `asw⟺有 mode:'sub' 节点`、`night⟺有 mode:'night'`、`radar⟺有 type:'whirlpool'`、`los⟺branch.if.los 存在`、`air⟺某 battle/boss 节点敌军模板含舰载机`。
  配套 `maps[].threatNote`（军事简报体威胁说明，措辞必须与 threat 维度一致）。`simulate.js`「海域威胁维度声明」段做双向校验，禁漂移。**当前声明 5 图：1-2 / 1-4 / 2-2 / 2-3 / 3-1**。
- 特殊节点（`maps[].defs[x].mode`，V0.302）：`'sub'` 潜艇点 / `'night'` 夜战点 / `'air'` 航空战点。
  - `mode:'air'`（批次1）：舰队**无航空战力**时进入「被动防空」——敌机直接轰炸、我方仅对空炮火还击。
    判据 **`Battle.hasAirWing(side)`**（存活的 CV/CVL/CVB 且有 `slots[].size>0 && plane`），**与引擎 `markLaunch` 同源**；
    `Battle.PASSIVE_AA_CAP === 0.6` 是单次轰炸伤害封顶（与潜艇点同口径，不做硬死档）。
    三种边界必须区分（坑 #12）：①无航母 ②有航母未搭载舰载机 ③有航母只带舰攻（制空 0）——③仍走正常航空战。
    结算结果上挂 `r.airWing / r.airPassive`；`fleetStats()` 也带 `airWing / carriers / carrierNames`。
  - 节点进入横幅文案统一在 `Sortie.NODE_BANNER` + `Sortie.nodeBanner(def, {airWing, hasCarrier})`（**不逐图硬编码**）；
    `Sortie.usedNodeModes()` 供「文案表覆盖全部 mode」断言使用。UI 渲染在 `ui/sortie.js::sortieActive` 的 `.map-banner`。
- **航空触接（批次2，数值用户已确认）**：昼战航空战结束后、炮击战开始前判定。
  参与方＝搭载**舰攻 / 水侦（水爆同槽）/ 舰侦**的舰（**舰战、舰爆不参与**）。
  成功率 `min(85%, Σ√(机载值)×5% + 制空加成)`；加成 确保 +20% / 优势 +10% / 均势·劣势 +0 / **丧失不可触接（null）**；
  **一架触接机都没有 → 0**。本作舰攻无索敌面板 → 机载值取 `stat.los || stat.avg`。
  成功 → 命中 ×1.15，走**独立字段 `_touchHit`**；**绝不覆盖索敌的 `_reconHit`（坑 #10）**，两者相乘 = **1.03×1.15 = 1.1845**。
  命中乘区单点定义在 `Battle.hitMods(atk)`（`hitChance` 只读它）。敌方对称：固定 20%，敌命中 ×1.10。
  触接**只作用于昼战**：`_touchHit` 在 `nightPhase` 开头清除。事件 `kind:'touch'`（复用既有事件系统）。
  接口：`Battle.touchRate(side, airKey)` / `touchReport(fleetIdx)` / `isTouchPlane` / `TOUCH_*`；情报室 `Sortie.intel().touch`。
  `opts.touch === false` 时整个阶段跳过且**不消耗随机数**——`npm run drift:archive` 靠它证明「除触接外一位未动」。
- 舰队级能力接口（**唯一来源，UI 禁止另写一套**）：`Battle.fleetStats(fleetIdx)` / `enemyAirPower(key)` / `hasAirSuperiority(my,en)` / `specialAttackReport(fleetIdx,{airSup})`；
  `Game.fleetAir/fleetAsw/fleetNight/fleetSpeed/battleFleetStats` 是薄包装。「存档实例→战斗对象→聚合」链路只在 `battle.js` 内实现一次。
- 特殊攻击判定表：`battle.js` 的 `DAY_SPECIALS`（5 项）/ `NIGHT_SPECIALS`（3 项）+ `attackProfile()`；`resolveDayAttack`/`resolveNightAttack` 与出击前清单**共用同一张表**，改倍率只改一处。
- 士气档位（**唯一来源 `battle.js` 的 `MORALE_TIERS`**）：闪 ≥50（命中×1.2 / 回避×1.8）/ 正常 40–49 / 偏低 30–39（无惩罚，预警档）/ 红脸 <30（命中×0.5，无回避惩罚）。
  `hitChance` 直接读该表；UI 用 `Game.moraleTier/moraleMods/moraleBadge`（徽记文字必须带修正数值，不靠颜色）。
  舰队摘要 `Sortie.fleetMorale(idx)`、轮换提醒 `Sortie.moraleAdvice(idx)`（提醒必须写明「回港静置每 30 秒 +3，到 53 即为闪」这条真实退路）。
  `Sortie.start()` 返回 `{ok, warn, advice}`——**advice 只提示不拦截**。
- 交战形态权重（**方向五**）：`battle.js` 的 `ENG_WEIGHTS = { base:45/30/15/10, recon:45/30/20/5 }`，由 `engagementWeights(reconOk, hasReconPlane)` 选择。
  **只有「索敌成功 且 舰队携带舰侦（`cat==='舰侦'`）」才用 recon 表**；不消灭 T 不利（仍 5%）。未携带舰侦时行为与改动前逐位一致。
  纸面验证见 `../design/方向五_纸面验证结论.md`、脚本 `scripts/recon_eng_paper.js`：带舰侦**不是无脑更强**（1-3 +11.25pp、3-1 −5.85pp）。
- 舰历与荣誉（方向二）：`state.ships[uid].record`（`Game.defaultRecord()` 单点定义：`sorties/expeditions/sWin/taiha/failures/perfect/bossKills/lastBoss/firstClear/honors/remodelAt`），
  存档 v3→v4 有迁移器；**唯一写入入口 `Progression.recordBattleResult(ctx)`**（出击 settleBattle / 演习 applyBattleResult 仅 isPractice / 远征 claimExpedition）。
  `sorties` = 每次战斗结算 +1（与提督「总出击」同口径）。荣誉 8 个（`Progression.HONORS`），**只展示不加成**、幂等；舰史在 `ships[].bio`（42 艘，覆盖 1-x~3-x BOSS 掉落）。
  详情弹窗「舰历」页签在 `ui/homeport.js::recordPane`。**注意：`normalizeSave` 故意不补 record**（补了就绕过迁移器，迁移测试失效）。
- 海域作战目标（方向四）：`maps[].objectives = [{id,type,min,types,desc,reward}]`，类型只用 `sRank/noHeavy/typeLimit`——
  **每个目标必须迫使玩家改变编成**，不做纯操作型（如"不进入夜战"）、不做全清奖励、全项目 ≤15 个（现 12 个/6 图）。
  `Sortie.checkObjectives(map,ctx)` 是**纯函数**，只在 BOSS 节点判定；`noHeavy` 的"全程"由 `sortie.daPoSeen` 汇总。
  奖励一次性：`Progression.grantObjectiveRewards`（全局账本 `st.stats.objectives`），达成记录写进 `record.objectives`。
  **目标绝不影响主结算** —— 固定种子逐项对拍断言守着。
- 战绩/战力核对工具：`scripts/drift_check.js`（固定种子 LCG → 9 组战斗场景 → 评价串/伤害/日志指纹）+
  **两份基线**：`scripts/battle_digest.baseline.txt`（当前版本）与 `scripts/battle_digest.baseline_v0301.txt`（V0.301 存档）。
  `npm run drift` / `npm run drift:archive`（`--no-touch`，关掉触接后**必须逐位回到 V0.301** —— 这是「除新增机制外一位未动」的硬证明）。
  **改战斗代码前后必须跑**。另有 `scripts/recon_eng_paper.js`（方向五复跑）、`scripts/shot.js`（无头浏览器截图，Gate 4）。
- 失败归因：`game/sortie.js::attributionLines()` 是**纯函数**（输入 result/nodeDef/fleet/state → 输出归因行）；覆盖 sub / night / 制空不足 / 索敌失败 / 红脸。
  只在败局输出。结算结果里 `recon`/`myAir`/`enAir`/`airSup`/`airKey` 由 `battle.js` 挂载（夜战节点 `recon=null`，不得误判为索敌失败）。结算结果里 `recon`/`myAir`/`enAir`/`airSup` 由 `battle.js` 挂载（夜战节点 `recon=null`，不得误判为索敌失败）。

## 账号系统速查（2026-09-14 核对，别再把路径写错）

- 后端 `auth.js` + `server.js`：**路由挂在 `/api` 下**（`app.use('/api', auth.router)`）——
  登录是 **`POST /api/auth/login`**，不是 `/auth/login`（写错会拿到 express 的 404 HTML，容易被误判成"账号没建好"）。
- 存储：`data/users.json`（`{ salt, hash, role, createdAt }`，`hash = scryptSync(pw, salt, 64).toString('hex')`）
  + `data/saves/<username>.json`（云存档）；`data/` 不入库（含 users.json 与 API key）。
- 规则：用户名 2~20 位（中英文/数字/`_`/`-`；`admin` 为保留名）；**普通用户密码 6~64 位**；
  `admin` 走 `npm run admin`（`ensureAdmin`），**不套用密码下限**（默认 admin/admin，幂等）。
- ⚠️ **登录路径没有密码长度校验**（后端登录只比对散列；前端 `#lgPw` 只有 `maxlength=64`、无 `minlength`）——
  所以"短密码能登进去"是正常的；被拒的只有**注册/创建**那一步。
- 需要 4 位以内密码的测试账号：**不要改 `validPw`**（那是产品规则），用一次性脚本按同样算法直接写 `users.json`
  （2026-09-14 建 `test`/`test`、role=user 即此法），并做端到端验证：起临时端口 →
  `POST /api/auth/login` 正例（200 + `Set-Cookie`）与两条负例（错密码 / 不存在用户 → 401）。
- **≥6 位就老老实实走正常注册接口**：`test001`/`test001`（名 6 位 + 密码 8 位，给另一个 agent 游玩用）
  2026-09-14 经 `POST /api/auth/register` 建成，role=user，**未碰数据层、未改产品代码**。
- **role=user 就开不了测试模式**：`main.js` 有 `Account.isAdmin()` 闸门，`state.js::isTestMode()` 同样要求 admin。
  需要无限资源/秒建时把 `users.json` 的 role 改成 `admin`（一行），别去绕前端闸门。
- 现有账号（5）：`admin`[admin] · `cdptest50271` · `cdptest1863` · `test`[user·4位密码·数据层建] · `test001`[user·注册路径建]。
- 可复用脚本（工作区根）：`_lsusers.js` 列账号 · `_register_test001.js` 注册+端到端验证 · `_verify_test_login.js` 登录验证。
- **账号可用性冒烟（仓库内，已固化）**：`npm run smoke:account [-- --user=X --pass=Y]`
  （`scripts/smoke_account.js`）= 真服务器 + 真 HttpOnly Cookie + 真 `index.html` 引导路径，
  断言"脱离登录页 / 顶栏显示账号 / 母港已渲染"，并带**错密码负向对照**（独立 profile 必须停在登录页）。
  同源临时登录页运行时生成、结束时删除，**不常驻 `public/`**。
- 判定"进没进游戏"的可靠 DOM 标记：`<main id="screen" class="home-screen">`（进）vs `body.unauth`（没进）。
  别拿屏幕内文案当标记（"母港舰娘"那句在**编成**页，不在母港 —— 曾因此假失败一次）。

## 当前进度状态

**v0.2 完成（2026-08-04）**：强化与改修工厂（参照 kcwiki 近代化改修 + 明石的改修工厂）。
- 近代化改修（wiki标准）：素材属性值表 / 多素材合成(≤5) / 奖励偏斜公式 / 上限规则 / 海防舰(DE)喂耐久·对潜·运 / 改造重置规则
- 装备改修工厂：维斯塔尔(AS)秘书舰解锁 / 二号舰解锁类别 / 每日次数1~3 / ★0~MAX(10) / wiki成功率表 / 确定化 / ★6+素材 / ★MAX更新进化(23条路线) / 螺丝经济(上限3000)
- 引擎测试：328 项全过（`npm run sim`）；浏览器 E2E 45 项全过（`test_flow.html`）
- 分支：`main`（v0.1）+ `develop`（开发中）

**v0.3 完成（2026-08-05）**：装备系统 v2（参照 kcwiki「开发」「开发资材」「装备」）。
- 开发资材（新资源，上限3000）：成功消耗/失败返还；日常/周常/月常/远征/一次性任务多渠道获取
- 开发系统按 wiki 重做：秘书舰系(炮战/水雷/空母/潜水)×最高资源池(油钢/弹药/铝)=开发池、50等份出货率、roll后等级+资源双判定、即时结算、UI 实时开发池预览+8个常用配方
- 装备解体 + 装备仓库页签（分类一览/★/锁定/装备中状态）
- 装备数据 44→50 件（新增 Mk28/Mk30/FM-2/F6F-5/GFCS/初期SG），全部带稀有度/解体回收/开发条目
- 引擎测试 389 项全过；E2E 48 项全过
- 存档迁移：devMats 默认10；废弃旧开发队列

**迭代候选（未做）**：活动海域(贴条/削甲/友军) / 图鉴 / 音效 / 更多海域。

**弹药后勤 v2（2026-08-06）**：弹药补正按 wiki 改为阈值后补正（残弹≥50%=1、<50%=残弹率/50、0%无法炮击）；1-2 按 wiki 重构（C=弹药资源点、索敌≥20 走 C→D 短路线、BOSS=CLT 雷巡旗舰无重巡以上）；出击页油弹%+一键补给+低油弹警告；`npm run sim` 443 项全过。

**战斗分段 v1（2026-08-06）**：夜战不再默认进行——出击昼战结束后弹「追击选择」（夜战突入/战斗结束，参照 wiki 战斗流程第13~14步），夜战突入追加消耗弹药10%（合计30%）；引擎拆分 `battle()`（昼战）+ `battleNight()`（追加夜战并重新结算），出击流程拆分 `prepareBattle`/`continueNight`/`settleBattle`；演习新增玩家阵型选择（敌方固定单纵阵）且同样支持夜战突入选择；`npm run sim` 831 项全过 + `scripts/test_night_split.js` 19 项全过。

**第三第四舰队 v1（2026-08-06）**：舰队扩展为 4 支（`state.fleet` 1~4 + `state.fleetUnlock{3,4}`，1/2 初始解锁）；解锁任务「第三舰队，拔锚！」（一次性 o26：完成1次远征）与「第四舰队，出航！」（一次性 o27：击破 2-1），奖励字段 `reward.unlockFleet` 由 `Progression.claimQuest` 调 `Game.unlockFleet()`；锁定舰队引擎侧拒绝远征/出击（`isFleetUnlocked` 守卫）；编成页 4 页签+锁定态、远征页舰队选择器（2/3/4）、出击页舰队选择器（1/2/3/4）、补给页按解锁舰队展示；`npm run sim` 852 项全过 + E2E 70 项全过。

**舰艇拓展 v1（2026-08-07）**：舰船数据 55 → 104 艘（+49，纯数据零引擎改动）：DD 23 / DE 2 / CL 10 / CA 13 / CVL 5 / CV 12 / CVB 1 / BB 20 / SS 16 / AV 1 / AS 1（名单经用户评审；新增 CVB 中途岛、AV 柯蒂斯 填补空缺；新增 `AV_SLOT=[[9,14],[9,14],[14]]`）；新舰全部用现有装备、数值不破上限、r5 带改二；**稀有度差异化（参照舰C wiki）**：舰名配色 `.rn-1~5`（银白/绿/蓝/紫/金）、立绘金★星标+彩色边框 `.portrait-r2~5`（common.js `shipNameHtml`/`rarityStars`，portraitImg 自动附加），覆盖卡片/详情/秘书舰/建造队列/素材列表/入渠/演习/掉落/任务奖励；`npm run art` 106 张立绘；`npm run sim` 1273 项全过。

**战斗迭代 v1（2026-08-10）**：①**索敌判定**（参照 kcwiki「索敌」）——33式索敌值（水侦1.2/舰攻0.8/舰战舰爆电探0.6 系数 + 素索敌开方求和，扣司令部等级、加舰娘数补正），带水侦/舰载机必定触发、按敌我索敌比值判成败，深海不会失败；成功→「命中・回避力UP」+3%，失败→「対空・回避力DOWN」-5% 且无法参加航空战；索敌机未归还（减少水侦搭载，全损则昼战特殊攻击失效）仅在失败时 35% 触发（产品取舍：wiki 字面含「成功+未归还」组合，成功视为安全返回）；UI 雷达扫描+横幅演出（`recon` 事件）。②**开幕空袭动画三步走**——起飞（机群悬停舰队上空）→ 防空炮火（按 `totalPlanes` 实际击落比例演示坠机、保留至少1架）→ 纯俯冲轰炸（无重复起飞；昼战空母航空攻击回退航母起飞）；空袭汇总字符串改到轰炸事件后 push（消除防空→轰炸间字符串等待滞空）；`npm run sim` 1273 项 + `test_night_split` 19 项 + E2E 70 项全过。

**装备体系 v2（2026-08-11）**：装备 55→115 件 + 16 新类别（参照 kcwiki「装备列表」，全接入开发池/改修工厂/★加成）；装备仓库上限 150→500 格且**仅统计闲置装备**（`equipIdleCount`，装备中不占容量；旧档迁移保留任务扩容）；装备稀有度白/绿/蓝/紫/金（`eq-r1~5`+标签，全展示面覆盖）；仓库批量移除（类别×稀有度条件筛选 + 一键移除 + 预览 + 高级二次确认 + 显示装备中开关）；消耗性物资（应急修理要员/战斗粮食/洋上补给）出击消耗；获取自动上锁（首个舰艇/稀有舰艇 r≥4/稀有装备 r≥4/消耗品，舰艇解体补 locked 校验）；测试模式豁免仓库上限与开发门槛；新任务 o35~o40/w12/w13/m7；`npm run sim` 1273 项 + 专项验证（31+16+17+21+8 项）全过；提交 `26efb32` 已推送。

**开发任务书 · 批次1（2026-09-11）**：方向一「出击前情报室」——`fleetAir/Asw/Night/Speed` 公共接口（与 battle.js 同源）+
4 张图威胁维度与威胁说明 + 出击前「编成自检」面板（舰队能力 / 威胁对位 / 特殊攻击清单 / 威胁评估，**不拦截出击**）+
失败归因扩展（制空不足 / 索敌失败，纯函数 `attributionLines`）。sim 1386 / 迁移 18 / E2E 106 全过，0 JS 错误。
顺手修复：① 2 项既有失败断言（弗莱彻改造经验不足）；② E2E 因 09-11 立绘改动缺 `<script>` 而整轮失败（`SecretaryL2D is not defined`）。
**新增工具 `scripts/drift_check.js`**（固定种子 LCG → 9 组战斗场景 → 评价串/伤害/日志指纹）：改 `battle.js` 前后用
`node scripts/drift_check.js --against scripts/battle_digest.baseline.txt` 证明零数值漂移（本次 780+ 场逐位一致）。**此后动战斗代码必跑**。

**开发任务书 · 批次2（2026-09-11）**：方向三「士气可见化」（4 档 + 修正数值同源 + 编成/出击/母港三处可见 + 出击前轮换提醒 + 红脸归因）
与方向五「侦察引导航向」（先纸面验证达标 → 索敌成功+携舰侦时交战形态权重 45/30/15/10 → 45/30/20/5，不消灭 T 不利；战报加引导说明；情报室加「航向侦察」行）。
sim 1413 / 迁移 18 / E2E 123 全过，0 JS 错误；引擎逐位对拍仍零漂移。顺手修复 `test_flow.html` 的 1-1 攻略循环偶发假失败（3 轮 → 最多 6 轮）。

**开发任务书 · 批次3（2026-09-11）**：方向二「舰历」——存档升到 **v4**（每舰新增 `record`，走 `SAVE_MIGRATIONS` 迁移）；
唯一写入入口 `Progression.recordBattleResult`（出击/演习/远征三路径覆盖）；荣誉 8 个（只展示不加成、幂等）；
详情弹窗新增「舰历」页签（履历/荣誉墙/舰史）；战报追加 MVP / 斩杀者 / 新荣誉；**42 艘舰史** `ships[].bio`（1-x~3-x 全部 BOSS 掉落）。
sim 1441 / 迁移 27 / E2E 133 全过，0 JS 错误；引擎逐位对拍仍零漂移。
顺手修复：① 批次1 的同源断言在索敌失败时会假失败（改为重试到索敌成功）；② `washington` 台词史实错误（"海军上将"级 → 北卡罗来纳级二号舰）；
③ E2E 不再为测弹窗而进母港（每次进母港会多起一套秘书舰 rAF 循环，拖垮 headless 虚拟时间预算）。

**开发任务书 · 批次4（2026-09-11）**：方向四「海域作战目标」——存档升到 **v5**（`record.objectives`，`normalizeRecord` 改为按规范键序重建）；
6 图 12 个目标（typeLimit 6 / sRank 3 / noHeavy 3），全部迫使改编成；纯函数 `checkObjectives` 只在 BOSS 判定；
一次性奖励 + 防刷；海图详情与图鉴「战功」展示。sim 1466 / 迁移 32 / E2E 153 全过，0 JS 错误；对拍零漂移。
（E2E 原记 145，2026-09-12 复核实测为 153 —— 布局修复 commit `b002b08` 之后新增了断言，数字已校准。）
**四个批次全部交付完毕**，汇总报告见 `../design/开发任务书_交付报告.md`；方向五验证结论 `../design/方向五_纸面验证结论.md`。

**UI 布局修复 · 海域选择页（2026-09-12）**：用户反馈「2-1 正常、2-2 地图被拉长」。根因是
`.sortie-mapview { align-items: stretch }` + `.area-map` 无固定高度 → **地图高度被右列内容高度决定**（节点按百分比定位，于是纵向拉伸）。
修法：行改 `align-items: flex-start`；左列抽出 `.sortie-mapside`（地图 + 简报框）；`.area-map` 改 `flex: 0 0 auto; width: 100%; aspect-ratio: 5/4; max-height: 640px`
——**地图高度只由自身宽度决定**。作战简报（`.sortie-brief`）从右列移到地图下方的独立框。
**E2E 环境变更（重要）**：`test_flow.html` 此前**根本没加载 `css/style.css`**，任何布局类断言都是空转；现已加载，
且 `scripts/e2e.js` 固定 `--window-size=1080,1400`（默认 800×600 会让宽高比断言退化到 `min-height` 分支）。
新增 8 条布局断言，并用**负向对照**（临时注入旧 CSS）确认它们真能抓住该 bug。
顺手修掉 E2E `sortie:1-1cleared` 的假失败：1-1 两个战斗点 = 每轮耗油弹各 40%，血条 3 格 → 第 4 轮必被「补给为零」拦下，
任何一轮打出 C/D 就失败；改为每轮出击前 `Logistics.supplyFleet(1)` + 补满耐久。sim 1466 / 迁移 32 / E2E 153 全过。

见 `HEARTBEAT.md` 最新条目（本文件只保留决策，心跳文件记录流水）。

**海域选择页布局（2026-09-12 定稿）**：
- 右列 `.map-detail`（固定 340px）：迷你海图 → 标题 → 海域血条 → 描述 → 出现物品/分支/道中掉落/BOSS掉落 → **作战简报 `.sortie-brief`** → **出击按钮**。
  简报放回右列是安全的——地图已改 `aspect-ratio: 5/4`（高度只由自身宽度决定），右列再长也不会拉伸地图（`layout:mapNotStretched` 断言守着）。
- 左列 `.sortie-mapside`：**海域地图（5:4 固定）+ 编成自检 `.sortie-intel`**（恰好 2 个子元素）。
  `intelBox(m, fidx)` 把 作战目标/舰队能力/士气/威胁对位/航向侦察/航空触接/特殊攻击/威胁评估 包成一个 box——
  **一律放左列，不得塞回右列**（右列太窄，那堆长行会被压成十几行）。`.md-intel-sep` 已废弃。
- E2E 有 7 条位置断言守着这两处（含负向对照验证：故意放错位置会变红）。

**V0.302 批次1 · 航空战点（2026-09-12）**：`mode:'air'` 落地 2-3 A 点（圣克鲁斯=航母对决，敌军 F22 制空 130）。
无航空战力 → 「被动防空」分支（敌机直接轰炸 + 仅对空炮火还击，单次伤害封顶 60%）。
新增 `Battle.hasAirWing/isCarrierType/PASSIVE_AA_CAP`、`fleetStats.airWing/carriers`、`r.airWing/airPassive`、
`Sortie.NODE_BANNER/nodeBanner/usedNodeModes/mapHasAirNode`；2-3 补 `brief/threat/threatNote`。
sim **1506** / 迁移 32 / E2E **165**（0 JS 错误）；**drift_check 9 组仍逐位一致**。
工具新增 `scripts/shot.js`（无头浏览器截图，Gate 4）+ `public/_shot_air.html`（人工核对页）。

**V0.302 批次2 · 航空触接（2026-09-12）**：昼战航空战结束后、炮击战开始前判定；
成功率 `min(85%, Σ√(机载值)×5% + 制空加成)`（确保+20/优势+10/均势·劣势+0/**丧失不可触接**），无触接机 → 0；
成功命中 ×1.15 走**独立字段 `_touchHit`**（**不覆盖 `_reconHit`**，相乘 = **1.1845**，坑 #10）；敌方固定 20% / ×1.10。
事件 `kind:'touch'` + 演出 + 情报室「航空触接」行。**触接是唯一新增的随机数消费者**：
`npm run drift` 对当前基线逐位一致；`npm run drift:archive`（关掉触接）**逐位回到 V0.301**，证明其余逻辑未动。
sim **1538** / 迁移 32 / E2E **173**（0 JS 错误）。

**V0.302 批次3（2026-09-12）**：3.1 四条获取途径校验（air→CV/CVL·sub→对潜·whirlpool→loss 上限·boss 可达）写成纯函数 + 四次负向验证；
威胁维度推导 `mapHasSub` 扩展为「mode:'sub' **或** 敌军含 SS」（与 `mapHasAir` 同口径）。
3.2 子批 3a/3b 把节点铺满**区域 1–3 全部 15 图**：夜战 5 / 潜艇 6 / 航空战 4 / 漩涡 5，
新增敌军编成 F92~F96，3-2/3-3/3-4/3-5 各新增一个 W 漩涡节点（含边重连），
每图同步补 `brief` + `threat` + `threatNote`（ANNOTATED 12 图）。
sim **1571** / 迁移 32 / E2E **178**（0 JS 错误）；对拍零漂移。**子批 3c（4-x/5-x）留待下一批**。

**V0.302 批次4（2026-09-12）**：4.1 威胁维度**铺满**（ANNOTATED 12 → 21 图；新增「所有可推导维度的海域都已声明」「未声明海域推导为空」两条断言；
顺手修正 `threatCheck` 的 air 文案——不含航空战节点的图不再承诺「被动防空」）。
4.2 舰史 **42 → 49 艘**（补 4-x/5-x BOSS 掉落 7 艘：indiana/maryland/ticonderoga/england/newjersey/wisconsin/midway），
并修正两处 `line` 史实错误（印第安纳「三番舰」→「二号舰」、英格兰「六天六艘」→「十二天六艘」潜艇）。
4.3 作战目标 **12 → 14 个 / 6 → 8 图**（`3-4-cv2` ≥2 空母、`3-5-dd4` ≥4 驱逐舰，均为编成型；守 ≤15 上限）。
sim **1581** / 迁移 32 / E2E **178**（0 JS 错误）；对拍零漂移。

## V0.303 历史战役模式（2026-09-12）—— 新增的长期约定

- **数据隔离（坑 #16）**：战役数据在 `public/js/data/history.js`（`HISTORY_BATTLES`），**绝不进 `MAPS`**。
  引擎唯一接入点 `Sortie.resolveMap(id)`（MAPS → `History.byId`）。`simulate.js` 里所有按 `MAPS` 遍历的断言因此一条都不用改。
  sim 有「把战役塞进 MAPS → 隔离判据变红」的负向验证守着（不是恒真式）。
- **`History` API**：`list / byId / isBattleId / enemy / enemyKeys / ENEMY_BY_KEY / matchRule / ruleText / ruleCheck / wavesFor / waveEnemyKeys / usedNodeModes`。
  `matchRule(rule, fleetTypes)` 是**纯函数**：`require:[{types,min}]`（组内「或」、组间「与」）+ `ban:[舰种]`（禁入优先），
  返回 `{ok, hits, banned, banHit}`。规则**只决定加成、不决定通关**（P0-3 安全侧）。
- **史实加成乘区（坑 #17）**：`battle.js::HIST_HIT = 1.05`，走**独立字段** `_histHit` / `_histEvd`，
  在 `hitMods()` 内与 `_reconHit`、`_touchHit` **相乘**（1.03 × 1.15 × 1.05 = **1.243725，+24.37%**）。
  `opts.historic === false`（默认）时**不读不写任何字段**。
  接入方式：`prepareBattle` 用 `History.matchRule` 判定后，把结论经 `opts.historic/histHit/histEvd` 传给引擎（引擎与数据解耦）。
- **二波制（坑 #18）**：`sortie.startHardWave(prevPrep, opts)`。
  `hard.waves = { X: ['H1X','H1X2'] }` —— key = **BOSS 节点 id**，`[0]` 必须等于 `defs[boss].enemy`（sim 有交叉断言）。
  「迎击」= 先 `settleBattle(prep)` 且 `prep.histContinue = true`（只落消耗与履历、不发奖不打标记）→ 再 `startHardWave`；
  「收兵」= 直接 `settleBattle`（不写 hardWin、零惩罚）。
  **`opts.waves === false` 时整个分支跳过且不消耗随机数** —— 这是 drift 三基线能回到 V0.302 的前提。
- **二波制的一个刻意不对称（已公开披露，别当 bug "修"）**：迎击路径下参战舰 `record.sorties +2`
  （第一波 + 第二波各一次结算），提督经验按「道中档 + BOSS 档」两次结算；与常规图一次出击 +1 的口径不同。
- **奖励与荣誉（坑 #21）**：一次性奖励靠**全局账本** `st.stats.historic`（键 `H1:firstClear` / `H1:histForm` / `H1:hard`），
  发放前查账本、发放即记账。荣誉走 `Progression.HONORS`（+6 个 `hist_*`），
  栅栏是 `c.histFinal = BOSS 节点 且（非强敌阶 或 wave>=2）`。
  **规则：任何"按层发放"的奖励/荣誉，触发条件必须同时锚定「节点类型」与「阶段（第几波）」，只锚定其一必然提前发放**
  （本版就踩过两次：道中 S 胜发"史实重演"、第一波 S 胜授"强敌阶"荣誉）。
- **奖励词表新增 `item` 字段**：消耗品奖励（如 `dc_team` 应急修理要员）走 `createEquip`，自动上锁规则已覆盖。
  `Progression.grantRewardBundle(reward)` 是任务与战役**共用**的发放通道（资源 + equip + item），新奖励别另写一套。
- **存档 v6**：`ships[].record.historic[battleId] = { clearAt, histWin, hardWin }` + `st.stats.historic`。
  迁移器 `migrateV5ToV6` 是 historic 键的**唯一补写点**；`normalizeSave` 依然不补新键（坑 #3 / #19）。
- **统计隔离（坑 #20）**：战役不写 `mapProgress`、不计入 `state.stats.sortie/win/sWin/sink`、不推任务计数
  （UI 路径传 `applyBattleResult(..., { noQuest: true })`）；但参战舰 `record.sorties` **照记**。
  这个不对称由「双向断言 + 5 组负向验证」守着。
- **`History` 与浏览器内置 `History API` 同名**：`typeof History !== 'undefined'` 在浏览器**恒真**，
  所有读取点必须用**方法级守卫**（`typeof History.byId === 'function'`）。新增读取点时照做。
- **三基线怎么跑**：`battle_digest.baseline.txt`（当前，12 组）/ `..._v0302.txt`（9 组）/ `..._v0301.txt`（9 组）；
  `npm run drift` / `drift:v0302`（`--no-hist --no-waves`）/ `drift:archive`（再叠 `--no-touch`）。
  **以后每加一个"会消耗随机数"的机制**：给它 `opts.xxx === false` 开关，把新增场景用开关 gate 掉，
  并保证关掉后逐位回到上一版基线（本次 `--no-hist --no-waves` 已按此模式落地）。
- **UI 文案里的 `**强调**`**：简报统一走 `ui/sortie.js::briefHtml()`（转义 + 换行 + `**x**` → `<b>x</b>`）。
  新增简报别直接 `.replace(/\n/g,'<br>')`（会把 `**` 漏给玩家；E2E 有 `hist:noMarkdownLeak` 断言守着）。
- **截图页 `_shot_air.html` 需要 `#modal-root` / `#sub-modal-root`**：没有这两个容器时 `UI.modal` 静默失败，
  弹窗类用例会截出"什么都没发生"的空画面（本次踩过，已补上）。

## V0.304 特殊节点铺满 + 第二批战役 + 远征大成功（2026-09-13）—— 新增的长期约定

- **子批 3c（4-x/5-x 节点）**：节点总数护栏 **夜战 11 / 潜艇 8 / 航空战 16 / 漩涡 6**；
  5-2 全夜战（A/B/BOSS 三战皆夜战节点）、5-5 四类混合 + 边重连（branch 改指 W）、5-1 航线重构为
  潜艇点→航空战→资源→BOSS（boss 由 C 改 D）；ANNOTATED 21→23（5-2/5-3 退出无维度词白名单，剩 1-1/2-1）。
  新敌编成 F97~F101 全部复用既有深海模板；**全库零引用编成共 14 个**（F04/F10/F11/F12/F20/F25/F30/F36/F47/F51/F58 历史遗留 + F62/F78/F83 本批改配；审计工具 `scripts/audit_unused_fleets.py`，注意剔除键定义行与注释否则假阴性），不清防误删。
- **4-4 大机群定档披露**：任务书草案 "~180" 的前提（F22=130 全图最高）与实测不符——既有 F72/F73/F87/F88 实测 **248** 已是最高档。
  按不新增模板纪律沿用，实测 A=158 / B=248 / BOSS=248；sim 断言锁"全部常规海域最高档"。
- **第二批战役 M1/M2（history.js）**：四种规则形态齐备——H1 纯CV / H2 禁BB夜战 / M1 禁BB航空（中途岛，M1X=166）/ M2 强制混编（莱特湾，M2X=180，四节点=全游戏最长）。
  M2 简报必须点明资源压力（道中 3 战 + 夜战 30% → BOSS 残弹 <50%，弹药补正是设计意图）。
  战役荣誉 12 个；`settleBattle` ctx 新增 `cvlCount`（hist_m1_cvl 用，与 ddCount 同源 fleetTypes）。
  **硬编码战役断言已全部遍历化**（战役数/敌编成模板数/注入量/waveEnemyKeys/荣誉对齐/简报关键字），H1/H2 锚定保留——新增战役不再改断言。
- **hist_balance 测量效度（重大勘误，勿引用旧结论）**：旧版 equipAir 只装舰战 → CV 对舰输出≈0 →
  CV 队 S 率被系统性低估，**V0.303「H1 制空规则方向相反」的结论系测量偏差**。修正（舰战×2+舰爆混装）后：
  H1 合规 S 51-70% vs 0CV 11-39%（**有效**）；M1 合规 vs 0CV −26~33pp（有效），ban BB 残留 +7~12pp 软反向（披露）；
  M2 BB 轴有效（@90 级无BB −17pp），CV 轴反向 +6~17pp（引擎结构性：被动防空 60% 封顶下水面队仍优——观察项）。
  **教训：统计类"规则效力"结论必须先审查测量工具的配装/构造效度，再信数据。**
- **远征大成功（批次3）**：`EXPEDITIONS[].cond`（schema：`{flagship:舰种}` / `{types,min}` / `{equip:[类别],min}`）+
  `condText`（UI 单一展示源）；覆盖率 7/8。`Logistics.checkExCond` 纯函数；
  `claimExpedition` 资源倍率 = `(great?2:1)×(condOk?1.5:1)`——**确定性判定零 RNG 消费**（坑 #28 兑现）；
  返回值新增 `greatCond`；士气/经验收益不动。×1.5 与各 cond 松紧为 [PLACEHOLDER]。
- **sim 稳固化三件套（批次4）**：① 大破拦截重试模式（prepareBattle 失败 → 修满耐久重试一次，测试不关注损伤管理时用）；
  ② 构造"必败"场景要用**纯水面编队 + 残弹 0**——CV 舰爆不消耗弹药，含 CV 的残破队仍可能 B 胜；
  ③ 统计方向断言容差 ±12（≈2σ）。**12 连跑全绿**为当前基线（sim 1800）。
- **drift_check 行尾免疫**：core.autocrlf=true 时 git restore 会把基线文件 LF→CRLF，逐行比较行尾 \r 造成全文件误报漂移
  （2026-09-13 实测事故）；比较前已归一化。基线文件意外被改行尾时：恢复 LF 即可，摘要内容不变。
- test_night_split.js 已删除（断言并入 simulate.js「V0.304·批次4 分段战斗流程回归」段）；BOM 已清理（4 文件，独立 commit）。

- **文档规范（README 段序事故，2026-09-13）**：README / VERSION_HISTORY 的版本章节**新版在前**；
  新增章节时锚点必须选在**章节边界**（`---` 分隔线或下一个 `##` 之前），不要锚在章内某句——
  首次写入 V0.304 时锚在了 V0.303 段内的「存档版本 v6」句，结果旧版排在新版之前、且把 V0.303 的收尾段劈成孤儿段。
  插入后要**逐字节比对被插入章节是否仍与原样一致**（本次修正后 V0.303 段 1390/1390 字节一致）。

## V0.305 图鉴深化 + 军需处（2026-09-14）—— 新增的长期约定

- **本版第一次做"货币"（战功章）**。三条纪律（对应坑 #31/#32/#33），改任何与章相关的代码都不得绕过：
  ① 产出记账一律「**查账本 → 记账 → 加余额**」（`Progression.grantMedals`），不许用状态标记（会双发）；
  ② **周期产出与周常重置同源**：`Progression.periodKeys()` 是唯一周期键来源（`resetDue` 与每周章产出都读它）；
  ③ 消费只走 `Progression.medalShopBuy()` → `grantRewardBundle`（消耗品经 `createEquip`，自动上锁规则已覆盖）。
- **存档 v7**：`st.stats.medals`（余额）+ `st.stats.medalLedger{once,weekly}`（记账）+ `st.presets`（编成预设）。
  **唯一补写点是 `migrateV6ToV7`**；`normalizeSave` 不许补这三个键（坑 #30），迁移测试里有专门的**反向断言**。
  `presets`/`medalLedger` 是嵌套结构：`ledger.once[sourceId]=时间戳` / `ledger.weekly[bucket]=周期键`。
- **章产出源唯一调用点 = `sortie.js::settleBattle()`**（`Progression.grantMedalRewards`）：首通 / 作战目标 /
  战役三层 / 每周史实重演 一次算清，且**必须写进 `result.log`**（战报是玩家唯一能感知产出的地方）。
  产出源说明表 `Progression.MEDAL_SOURCES` 是 UI 与断言的**同一份表**（禁止在 UI 另写清单）。
- **兑换表 `Progression.MEDAL_SHOP` 是回调定价的唯一入口**（改价不动引擎）。硬约束：不卖舰娘、不卖大宗资源、
  不投放特供装备。兑换是不可逆资产消耗 → **必须二次确认**（P0-4），且按钮上直接写"拒绝理由"
  （余额不足 / 本周已兑换 / 装备仓库已满），不要等点了才报错。
- **图鉴三态的数据源不同（坑 #35）**：`recordPane` / `openShipDetail` 读的是 `state.ships[uid]` **实例**；
  图鉴看的是 `state.library` 里"**曾经获得过的 id**"（可能已解体）。直接复用会取到 undefined →
  必须有"无实例"降级分支（只读属性 + 舰史 + 途径）。**同一个 id 可能有多个实例**（初始赠送 + 后续建造），
  测试里要摘掉"某个实例"必须**摘掉该 id 的全部实例**才会进入降级分支。
- **获取途径统一走 `public/js/game/acquisition.js`（全局 `Acquisition`）**：纯函数、零新增数据、无副作用；
  舰船 = 道中/BOSS/战役掉落 + 可建造 + 任务奖励 + 初始赠送；装备 = 开发池 + 改修更新 + 随舰自带 + 任务/战役奖励。
  UI 与 `simulate.js` 共用它（UI 文件不参与 headless 测试，所以不能写在 UI 里）。
  **注意：新增这个模块必须在 `simulate.js` 的 `Object.assign(global, …)` 区注入**，否则 sim 里 `Acquisition is not defined`。
- **本作的「改造」不产生新图鉴条目**（同一 ship id 换形态，`shipDef` 合并 `def.kai`）——
  所以"改造获得"这条获取途径在数据上不存在。新增途径类型前先确认数据表里真的存在对应字段。
- **6 件装备没有任何产出渠道（既有缺口，已披露未修）**：`xf5u` / `fr1` / `fleetcom` / `repair_facility` /
  `crew_vet` / `m4a1`。`Acquisition.unimplemented('equip')` 返回它们，sim 里**锁死这 6 个 id**（数量一变即变红）。
  **推论**：装备图鉴 100% 收集率不可达 → 里程碑最高档只给纪念性荣誉（不加数值），这是刻意的。
- **收集率里程碑按百分比判定**（坑 #36）：`libraryStats().total` 是动态的（读 `ShipData`/`EquipmentData` 的键数），
  档位**绝不写死绝对数**。100% 荣誉（`codex_ships_full` / `codex_equips_full`）的 `check` 恒 false，
  **只由 `checkLibraryHonors()` 授予**（提督成就口径，授予第一舰队旗舰）——不是战斗荣誉，别在 `recordBattleResult` 里找它。
- **周常周期键的边界与文案不一致（既有实现，本版未动）**：键是 `年-W` + `floor(epoch/7天)`，不是字面"每周一 05:00"。
  本版沿用同口径以保证章与周常严格同步；要改必须两处一起改并补迁移 → 单独立项。
- **`newGame()` 现在会重置 `state.library`**（V0.305 修复：原先漏了，"开新档"语义不完整）。
  写测试时连续两次 `newGame()` 不再残留上一档的收集记录。
- **计数类断言要"按设计要求写"而不是"按当前实现写"（坑 #6 的又一次应用）**：本版新增了 2 个 codex 荣誉，
  既有 `nav:topmenu` / `record:honorCount` 两条写死数字的断言因此变红 —— 正确动作是改口径
  （`!/^hist_/ && !/^codex_/`、导航 11→12）并**顺手补更强的断言**（"所有导航目标都有对应屏幕"），不是放宽范围。

### V0.305 评审整改（2026-09-15，`67c3eb2`）—— 由一次 P0 换来的两条硬约定

- **P0 是什么**：「每周首次史实重演 S 胜 +1」这条**唯一的可重复章产出源**自第二周起永不发放。
  根因是 `sortie.js` 拿 `histReward.granted.includes('histForm')` 当「本场是否史实重演 S 胜」——
  那是 V0.303 的**一次性**账本标记，除首次恒 false；周项分支（`grantMedalWeekly`）本身没错，**错在没人调用它**。
  **1871 条断言 + 60 连跑全绿全部看不见它**，因为测试整体停在原语层而缺陷只住在集成层。
- **约定 ①（结构性）：同一个"本场结论"只能有一个定义点。**
  该缺陷的结构条件是"同一判据被写了三份（一次性奖励 ctx / 舰历荣誉 ctx / 章产出 ctx），只有一份写错"。
  现在 `sortie.js::settleBattle` 有唯一的 `histBossVictory / histFirstNow / histFormNow / histHardNow`，
  改战役判定**必须只改这里**。见到"同一表达式在多个 ctx 里各抄一遍"就照此收敛。
- **约定 ②（测试层级）：每个跨模块机制必须有 ≥1 条集成层断言，且禁止用"手工喂 flag"充当端到端证明。**
  - 反例（已改成明确标注 `（原语层）`）：`simulate.js` 里把 `histForm:true` 直接喂进 ctx 的断言，
    断言名却写作"全部算清" —— 它对"真实接线有没有把它设成 false"零分辨力。
  - 正例：sim §2.8 —— 真实走 `Sortie.start('H1') → 直达 BOSS → prepareBattle → settleBattle`，
    固定 LCG 种子保证可复现；跨周用"周账本置旧周期"模拟（这是移动时钟，不是喂答案）。
  - **写完新断言要做红绿验证**：把代码临时改回缺陷形态跑一次，确认它**恰好**变红（本次 3 条，
    且"首周 +1"那条仍绿），再恢复。**没有这一步就无法区分"断言有效"与"又一条同义反复"。**
  - 断言命名必须声明层级：`（原语层）` / `（集成层）`。
- **配套工具**：`npm run sim:soak [轮数]`（`scripts/sim_soak.js`，逐轮落盘 + 失败轮打印 ✗ 行 +
  结尾给出"本次能排除到多少 p"；**连跑全绿只等于"没发现"，不等于"不存在"**）。
- **表驱动配置要与发放逻辑对拍**：`MEDAL_SOURCES` 与 `MEDAL_SHOP` 这类"唯一来源表"，
  只防得住"UI 另写一份清单"，防不住**表与发放逻辑漂移** —— sim §2.9 现在会逐个产出源真实发放，
  用**表里的 n** 对**实发的 n**（改错任一列即变红）。
- **同类集成盲区自查法**：把新特性清单**两两配对**问"它们互相认识吗"（本次抓到：图鉴的获取途径
  不认识本版新增的军需处兑换），并顺着「产出方 → 接线方 → 消费方」三点连线各走一遍。
- **约定 ③（放行前小修，2026-09-15）：同名判据暂时必须写两处时，必须有"跨路径一致性断言"钉住等价。**
  「本场战役打成了什么」这个判据目前仍在两处：`sortie.js::settleBattle`（`histFormNow` 等，供**舰历荣誉 ctx**
  与**章产出 ctx**）与 `progression.js::grantHistoricRewards`（内部重推 firstClear/histForm/hard，供**一次性奖励层**）。
  两处语义当前等价，但**只改一处就会出现"奖励发了、章没发"** → sim §2.8 新增一条断言：用**同一场真实结算**
  的返回值对拍「奖励层报的层」与「章层发的层」必须一致；**正例要显式断言"两层都发"**，
  否则"两边都不发"会让等价关系假性成立。
  **红绿验证**：把 `progression.js::grantHistoricRewards` 的 `rank === 'S'` 临时改成 `'A'` → 该断言变红
  （诊断直接给出 `reward:["firstClear"]` vs `medal:[...,"hist:H1:histForm"]`），还原后 **1891/0**。
  **真正收敛成单一定义点**（让 `grantHistoricRewards` 也接收结论、不再自行重推）登记为 **V0.306 清理项** ——
  它有 11 处直接调用、承载 V0.303 的一次性奖励语义，且 drift 基线不覆盖奖励层，放行前不动它。
- **⚠️ sim §2.8 的种子有效性绑在「`battle.js` 未改动」上**：战斗掷骰走 `Math.random()`，该段靠 `seeded()`
  覆写它才控得住结果。**任何动 `battle.js` 的版本必做：重标种子**（跑 `_v305_probe_weekly.js` 重挑），
  否则该段会**静默失效**（表现为"没拿到 S 胜"这类间接报错，而不是写明原因的失败）。

## 反遗忘检查清单

- [ ] 新开会话 → 先读 MEMORY.md + HEARTBEAT.md 最新条目
- [ ] 每次完成任务 → 更新 HEARTBEAT.md 并 commit
- [ ] 修改战斗公式 → 同时改 README 或代码注释中对应说明
- [ ] 新增数据 → 遵循上面"数据规范速查"，勿另起炉灶

## 作战简报（`maps[].brief`）—— 覆盖范围与护栏（2026-09-12 用户反馈后确立）

- **`brief` 必须覆盖全部 25 张海域**，不是只有含特殊节点的图。依据：设计稿 §5「`maps.js` **每海域**新增
  `brief` 字段」+ 任务书 V0.302 任务 3.2「每张图的 `brief` 必须同步写（P0-6）」。
- **文案口径**：军事简报体，两段（`\n` 分隔）—— 第一段态势/氛围，第二段威胁与编成建议。
  无特殊节点、无威胁维度的图（1-1 / 2-1 / 5-2 / 5-3）写「常规炮战 + 状态检查」，
  **不得出现 制空/索敌/对潜/夜战/电探 这些维度词**，也不得声称任何节点类型。
- **节点措辞表（双向校验用）**：`night→夜战节点·夜战点`、`sub→潜艇伏击点·潜艇点`、
  `air→航空战节点·航空战点`、`whirl→异常洋流·漩涡`。
  **声称必须有对应节点；有节点也必须在 brief 里点明**（simulate.js 两条断言守着）。
  描述敌军编成（如「A 点敌军编成含潜水舰」）不等于声称节点，是允许的。
- **护栏位置**：`scripts/simulate.js`「特殊节点数据完整性」段 —— 4 条断言
  （25 图全覆盖 / 无 undefined / 不许编造节点 / 有节点须点明）。
  E2E 侧：`brief:1-1Rendered` / `brief:1-1NotEmpty` / `brief:2-1Rendered`（`public/test_flow.html`）。
- **教训（重要，与坑 #6 同源）**：覆盖类断言要按**设计要求的范围**写，不能按**当前已实现的范围**写。
  旧断言「所有含特殊节点的海域都写了作战简报」正是后者 —— 它把 bug 定义成了规格，所以永远是绿的。
- **已知恒真**：「文案提到的舰种/装备在到达该图前均可获得（P0-3）」当前不可证伪
  （建造/开发自始解锁 → 全 10 舰种与全部装备类别自始可获得）。代码内已加注释，勿误当有效守护。

## `npm run sim` 的稳定性约定（2026-09-12 修复 flaky 后确立，V0.305 扩充）

- **大破进击会轰沉并从 `Game.state.ships` 移除该舰**。而 `strongFleet` 被十几个 section 复用，
  一旦它缺了任何一艘，后续 `Game.state.ships[u]` 全部 undefined → 套件抛 TypeError 随机崩溃
  （实测改前约 8% 跑次）。
- **约定**：凡是让 `strongFleet` 参与战斗的段落，**进击前必须调用 `repairStrongFleet()`**
  （补满耐久 → 从根上不产生大破进击 → 不击沉）；故意轰沉的测试（`doomedShip`）之后**立即重建**。
- **不要靠重建来兜消耗类断言**：重建的舰 `supply` 是满值，会污染 `Math.min()` 取值，
  让「1-5 反潜点仅耗油 8%」这类断言失真。
- 改完必跑 **连跑 ≥10 次** 确认无随机崩溃，不只看单次结果。

### V0.305 的扩充：**「大破拦截」是第二大假失败来源，且 10 连跑查不出来**

- **凡"要发起一次出击 / 进击 / prepareBattle"的断言，先把舰队耐久补满再断言**。
  `Sortie.start()` 有「旗舰大破！无法出击！」守卫、`prepareBattle` 有「大破进击」拦截——
  被测舰队只要被**同一个 section 里前一场战斗**打到旗舰大破，断言就会以 `ok === false` 假失败
  （V0.305 **推测**：`startHardWave 发起第二波…` 与 `收兵后仍可再次发起强敌阶` 两条 ——
  口径是"40 轮 soak 中三种 flaky 各命中 1 次"，≈2.5%/跑次；**该发生率未独立复现**，
  别再以"实测"口吻引用，也别当成"每种各 1/40"）。
  补满耐久只消除噪声路径。**但别把论证写成"守卫之外的判据仍会变红"** —— 那两条断言各自只有
  `ok` 一个判据，"之外"并不存在（V0.305 报告原文如此，评审 §6 已纠正）。正确的论证是
  **拒绝理由可分辨**：状态机真没复位时 `start()` 的 msg 是 '舰队正在出击中！'，大破守卫的是 '旗舰大破！'。
- **统计类断言的"分母"必须选对**：`带舰侦编成的 T 不利频率` 原先用 `dis / reconOk`，
  而 `dis` 统计了全部场次（含索敌失败、仍走基础表的那些），分母却只算索敌成功 ——
  两个计数之比会随索敌成功率漂移。**改成 `dis / tot`** 才是被断言的那个量。
- **统计类断言的复现量会随"被测对象是否完好"而变**：被测航母被打伤/轰沉 →
  `hasReconPlane` 判据（`sideA.some(s => s.alive && s.reconPlane)`）失效 → 差值从 ~5pp 掉到 2.4pp。
  **跨 section 复用的被测舰队，测量前一律补满耐久**。
- **效度抽检工具**：`npm run probe:recon`（`scripts/probe_recon_variance.js`）——
  在干净状态下重复测量，给出差值均值/标准差与阈值余量。**统计断言变红时先跑它**：
  均值没变 = 状态污染/测量污染；均值变了 = 机制真的动了。
  参考基线：差值 **≈5pp**（阈值 2.5pp，余量 ≈4σ）。⚠️ 这是**会波动的抽样读数**，不是定值 ——
  三次独立复跑分别得到 `4.99±0.62pp`、`4.53±0.47pp`（余量 4.3σ）、`4.71±0.64pp`（余量 3.5σ）。
  三次结论一致（机制完好、余量充足）；引用时必须标注"某次抽样"（V0.305 报告曾写成定值，评审 R-4 指出）。
- **⚠️「12 连跑全绿」不能证明没有 flaky**：假失败率 p 下，12 连全绿的概率是 (1−p)¹² ——
  p=5% → **54%**；若要让 12 连全绿恰为 46%，需要 p ≈ **6.3%**（与 soak 实测 2/30 = 6.7% 相符）。
  （V0.305 交付报告原文写「约 5%/跑次 → 12 次里约 46%」，两个数字互不自洽，评审 R-4 已订正。）
  V0.304 的"12 连跑全绿"就是这么被蒙过去的（V0.305 用 30/40/60 轮 soak 才把它们揪出来）。
  **连跑本身只能排除 p ≥ 1−0.05^(1/N)**：N=60 只能排除 p ≥ 4.9%，残留的 p=1% 仍有约 55% 概率全绿。
  所以 **soak 全绿只等于"没发现"，不等于"不存在"**；修 flaky 要用效度工具，不是刷连跑次数。
- **soak 已固化**：`npm run sim:soak [轮数]`（默认 40，`scripts/sim_soak.js`）——
  逐轮落盘到 `../_soak/`，失败轮直接打出 ✗ 行与末 20 行，结尾还会说明"本次能排除到多少 p"。
