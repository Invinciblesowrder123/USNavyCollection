# 版本历史

本仓库按「新 → 旧」顺序存放游戏版本：**当前版本位于仓库根目录**，历史备份存放于 `archive/` 子目录。

| 版本 | 位置 | 快照日期 | 对应 Git 提交 |
|---|---|---|---|
| **当前版** | 仓库根目录 | — | `89a9c15`（在 `f4bd3d3` 基础上新增账号系统等） |
| **旧版 v0.1** | `archive/USNavyCollection_20260804/` | 2026-08-04 | `f4bd3d3` |

> 归档目录保留了版本当时的完整工作树（已排除 `.git` 与 `node_modules/`，可 `npm install` 后直接运行），与 Git 历史共同构成双重备份。

---

## 当前版（根目录）

在旧版 v0.1 之上新增/改进的内容（相对 `f4bd3d3` 的差异：30 个文件，+2581/−410 行）：

### 新增功能

- **账号系统**：注册/登录/登出 + 云存档
  - `auth.js` — Express 侧认证 API（`/api/auth/register|login|logout`、`/api/save` GET/PUT）
  - `public/js/core/account.js` — 前端账号会话管理（Bearer token，7 天）
  - `public/js/ui/login.js` — 登录/注册界面（支持游客模式切换）
  - 密码 scrypt 加盐哈希，存档存 `data/saves/`（不入库）
  - 登录后自动接管当前游客存档作为初始档

### 功能增强

- **装备改修工厂**（`public/js/game/improve.js`）：改修资材消耗、★进度、成功率与确定化逻辑细化，与 UI 打通
- **UI 全面优化**（+131 ~ +354 行/屏）：母港、工厂、后勤等界面交互完善
- **SVG 立绘更新**：全部 55+2 张立绘重绘细节
- **引擎测试扩充**：`scripts/simulate.js` 新增账号系统与改修测试（328 项断言）
- **E2E 测试**：`test_flow.html` 覆盖登录流程

### 变更文件清单

```
新增：auth.js、public/js/core/account.js、public/js/game/improve.js、public/js/ui/login.js
修改：server.js、.gitignore、README.md、MEMORY.md、HEARTBEAT.md、
      public/index.html、public/css/style.css、public/js/{main.js, core/state.js,
      data/{equipment,maps,quests}.js, game/{battle,factory,logistics,progression,sortie}.js,
      ui/{common,factory,homeport,logistics,sortie}.js}、
      public/art/portraits/*.svg（全部）、scripts/{generate_art,simulate}.js、public/test_flow.html
```

---

## 旧版 v0.1（`archive/USNavyCollection_20260804/`）

2026-08-04 上线前快照，对应 Git 提交 `f4bd3d3`。包含：

- 核心引擎：战斗/建造/开发/远征/养成/任务/出击（headless 测试 328 项）
- UI 全套 + 战斗演出 + SVG 立绘 + E2E 测试（`test_flow.html`，45 项断言）
- 数据层：55 艘美舰 / 44 件装备 / 3 海域 / 8 远征 / 19 任务
- 无账号系统：仅游客模式（localStorage 本地存档）

### 旧版恢复方式

```bash
cd archive/USNavyCollection_20260804
npm install
npm start        # → http://localhost:3000
```

---

## 版本对照

| 维度 | 旧版 v0.1 | 当前版 |
|---|---|---|
| 存档方式 | 游客模式（localStorage） | 游客 + 账号云存档 |
| 账号 API | 无 | 注册/登录/云存档（scrypt 哈希） |
| 装备改修工厂 | 基础 | 完善（螺丝消耗/确定化） |
| UI 覆盖 | 基础可用 | 全面细化 |
| 立绘 | 基础版 | 重绘版 |
| 引擎测试 | 328 项 | 328 项 + 账号/改修 |
