# MEMORY — 项目记忆文件

> 本文件是项目的"大脑"，记录关键决策、架构约定与当前状态。
> 任何会话开始时必须先读此文件。每次大改动后必须更新。

## 项目是什么

**《美舰收藏（US Navy Collection）》** —— 基于《舰队收藏》核心机制与玩法分析报告的仿品网页游戏。
题材：美国海军军舰拟人化（舰娘），主题为美军舰船（BB/CV/CA/CL/DD/SS/AV 等）。

- 依据：`../舰队收藏网页游戏核心机制与玩法设计分析报告.md`（战斗/养成/资源/远征/任务/活动六大系统）+ kcwiki 舰娘百科
- 技术栈：**Node.js (Express) 静态服务器 + 纯前端 JS 单页应用 + localStorage 存档**
- 分支策略：`main`（稳定版，首次提交后创建）+ `develop`（开发分支，日常在 develop 上工作）
- 位置：`C:\Users\johnz\Desktop\WG\USNavyCollection`

## 关键决策记录（ADR）

| 日期 | 决策 |
|---|---|
| 2026-08-03 | 技术方案：Node.js 本地服务器（用户选择），前端无框架 vanilla JS |
| 2026-08-03 | 美术风格：舰娘拟人卡片风，SVG 程序化生成占位立绘（用户选择，无 AI 生图工具） |
| 2026-08-03 | 功能范围：完整核心循环（母港/编成/建造/开发/远征/入渠/补给/任务/改造/近代化/演习 + 昼夜战斗 + 海域） |
| 2026-08-03 | 存档：localStorage 单档位（键 `usnc_save`），服务器不存玩家数据 |
| 2026-08-03 | 战斗引擎：纯前端 JS，参考报告第1-2章公式（简化但保真） |
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
- 装备字段：`id, en, zh, cat(主炮小/主炮中/主炮大/副炮/鱼雷/舰战/舰攻/舰爆/水侦/水爆/电探/高角炮/机枪/声呐/爆雷/穿甲弹/设备), stat{fp,tp,aa,arm,asw,los,evd,bmb,avg,radius,speed}, slotType, cost, buildable, kai(改修上限,>0 可改修)`
- 装备实例：`{uid, id, star(0~10, ★MAX=10)}`；改修效果=类别系数×√★（大主炮1.5/鱼雷1.2/其余1.0，舰战/舰攻★×0.2，电探·水侦→索敌，声呐·爆雷→对潜）
- 改修配置（equipment.js `IMPROVE`）：`{need(basic/dd/cl/bb/cv/as 二号舰解锁), screws, res[4], matFrom(默认6), update{to,mats[2]}}`
- 近代化素材值（progression.js `MOD_VALUE`/`MOD_KAI_BONUS`）：舰种决定素材属性值（参照 wiki 素材列表）；奖励值=(n+1)÷5+n，偏斜=((n+2)÷5+n)÷2；上限 火力/雷装/对空/装甲=基础×1.3，耐久+2/对潜+9/运+8（仅DE素材）；改造重置 fp/tp/aa/arm
- 改修工厂：维斯塔尔(AS)为第一舰队旗舰解锁；每日次数=1+二号舰(AS/AV)+1+维斯塔尔改+1(≤3)；成功率表 improve.js `SUCCESS_RATE`；确定化=2倍螺丝必成功；★MAX 更新后新装备★5
- 制空值 = 对空值 × √搭载数（截尾取整）
- 昼战特殊攻击：需制空优势+且带水侦/水爆；主主+穿甲弹=1.5x主炮CI / 主副+穿甲弹=1.3x / 主副+电探=1.2x / 主副=1.1x / 双主=1.2x×2连击
- 夜战攻击力 = 火力+雷装+5（上限300），鱼雷CI=1.5x×2 / 主鱼CI=1.3x×2 / 双主连击=1.2x×2
- 白天攻击力 = (火力+5) 上限180（阈值后开方）；伤害 = 攻击力×阵型×航向×特殊 - 装甲×0.7，浮动0.7~1.3，暴击1.5x
- 资源：油/弹/钢每3分钟+3，铝每3分钟+1；上限随提督等级；改修资材(螺丝)上限3000，不自然恢复（任务获得）
- 疲劳：出击 -30，回港 +15；士气≥50 闪（命中回避+10%），≤30 红脸（命中-20%）
- 奖励/经验：S/A/B/C/D/E 胜；旗舰1.5x，MVP 2x
- 重置节奏：每日05:00（日常/入渠/演习/远征任务），每周一05:00（周常），每月1日05:00（月常）

## 当前进度状态

**v0.2 完成（2026-08-04）**：强化与改修工厂（参照 kcwiki 近代化改修 + 明石的改修工厂）。
- 近代化改修（wiki标准）：素材属性值表 / 多素材合成(≤5) / 奖励偏斜公式 / 上限规则 / 海防舰(DE)喂耐久·对潜·运 / 改造重置规则
- 装备改修工厂：维斯塔尔(AS)秘书舰解锁 / 二号舰解锁类别 / 每日次数1~3 / ★0~MAX(10) / wiki成功率表 / 确定化 / ★6+素材 / ★MAX更新进化(23条路线) / 螺丝经济(上限3000)
- 引擎测试：328 项全过（`npm run sim`）；浏览器 E2E 45 项全过（`test_flow.html`）
- 分支：`main`（v0.1）+ `develop`（开发中）

**迭代候选（未做）**：活动海域(贴条/削甲/友军) / 图鉴 / 音效 / 更多海域。

见 `HEARTBEAT.md` 最新条目（本文件只保留决策，心跳文件记录流水）。

## 反遗忘检查清单

- [ ] 新开会话 → 先读 MEMORY.md + HEARTBEAT.md 最新条目
- [ ] 每次完成任务 → 更新 HEARTBEAT.md 并 commit
- [ ] 修改战斗公式 → 同时改 README 或代码注释中对应说明
- [ ] 新增数据 → 遵循上面"数据规范速查"，勿另起炉灶
