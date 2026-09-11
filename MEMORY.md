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
  配套 `maps[].threatNote`（军事简报体威胁说明，措辞必须与 threat 维度一致）。`simulate.js`「海域威胁维度声明」段做双向校验，禁漂移。**首版只声明 1-2/1-4/2-2/3-1 四图**。
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
- 战绩/战力核对工具：`scripts/drift_check.js`（固定种子 LCG → 9 组战斗场景 → 评价串/伤害/日志指纹）+ 基线 `scripts/battle_digest.baseline.txt`；
  `scripts/recon_eng_paper.js`（方向五纸面验证复跑）。**改战斗代码前后必须跑 drift_check**。
- 失败归因：`game/sortie.js::attributionLines()` 是**纯函数**（输入 result/nodeDef/fleet/state → 输出归因行）；覆盖 sub / night / 制空不足 / 索敌失败 / 红脸。
  只在败局输出。结算结果里 `recon`/`myAir`/`enAir`/`airSup`/`airKey` 由 `battle.js` 挂载（夜战节点 `recon=null`，不得误判为索敌失败）。结算结果里 `recon`/`myAir`/`enAir`/`airSup` 由 `battle.js` 挂载（夜战节点 `recon=null`，不得误判为索敌失败）。

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
一次性奖励 + 防刷；海图详情与图鉴「战功」展示。sim 1466 / 迁移 32 / E2E 145 全过，0 JS 错误；对拍零漂移。
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

## 反遗忘检查清单

- [ ] 新开会话 → 先读 MEMORY.md + HEARTBEAT.md 最新条目
- [ ] 每次完成任务 → 更新 HEARTBEAT.md 并 commit
- [ ] 修改战斗公式 → 同时改 README 或代码注释中对应说明
- [ ] 新增数据 → 遵循上面"数据规范速查"，勿另起炉灶
