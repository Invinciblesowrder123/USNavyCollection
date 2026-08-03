# HEARTBEAT — 项目心跳记录

> 按时间顺序记录工作流水：完成了什么、当前卡在哪、下一步做什么。
> 规则：每次 commit 前必须追加一条记录；阻塞时写 BLOCKED。

---

## 2026-08-03 09:20 — 项目启动

**完成：**
- 创建项目骨架目录、git 仓库（develop 分支，main 待首次提交后建立）
- 编写 MEMORY.md（架构决策 + 数据规范速查）

**下一步：**
- [ ] 服务器脚手架：package.json、server.js、index.html、style.css
- [ ] 数据层三件套：equipment.js → ships.js → maps/expeditions/quests
- [ ] state.js 存档系统
- [ ] battle.js 战斗引擎
- [ ] generate_art.js SVG 立绘生成
- [ ] UI 各屏幕
- [ ] simulate.js headless 验证
