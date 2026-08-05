'use strict';
/* ============================================================
 * 启动引导：会话恢复 → 读档 → 时钟/存档 → 路由
 * 双模式：账号（云存档）/ 游客（localStorage）
 * ============================================================ */

(function () {
  const $ = s => document.querySelector(s);
  let booted = false;

  /* ---- 调试模式：无限资源开关 ---- */
  const dbgBtn = $('#debugToggle');
  function syncDebugBtn() {
    const on = Game.isInfiniteRes();
    dbgBtn.textContent = on ? '无限资源 ON' : '无限资源 OFF';
    dbgBtn.classList.toggle('on', on);
  }
  dbgBtn.addEventListener('click', () => {
    Game.setInfiniteRes(!Game.isInfiniteRes());
    syncDebugBtn();
    UI.refreshTop();
    UI.toast(Game.isInfiniteRes() ? '调试：无限资源已开启（消耗免除，资源保持最大）' : '调试：无限资源已关闭');
  });
  syncDebugBtn();

  /* ---- 账号栏（顶栏） ---- */
  const accBtn = $('#accountBtn');
  const accInfo = $('#accountInfo');
  function syncAccount() {
    if (Account.isAccount()) {
      accInfo.textContent = '@' + Account.username();
      accBtn.textContent = '退出登录';
    } else {
      accInfo.textContent = '游客模式';
      accBtn.textContent = '登录账号';
    }
  }
  accBtn.addEventListener('click', () => {
    if (Account.isAccount()) {
      /* 退出：先上传当前档到服务器，再回游客档 */
      Account.saveGame(Game.serialize()).finally(() => {
        Account.logout();
        Game.load();
        UI.refreshTop();
        UI.go('home');
        syncAccount();
      });
    } else {
      document.body.classList.add('unauth');
      UI.go('login');
    }
  });
  Account.onChange(syncAccount);
  syncAccount();

  /* ---- 时钟（每秒）与自动存档 ---- */
  function startTimers() {
    if (booted) return;
    booted = true;
    setInterval(() => {
      const now = Date.now();
      Game.regen(now);
      Game.finishTimers(now);
      const ch = Progression.resetDue();
      if (ch.length) Progression.resetQuests(ch);
      Progression.checkDynamic();
      UI.tick();
    }, 1000);

    setInterval(() => Game.save(), 5000);
    window.addEventListener('beforeunload', () => Game.save());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') Game.save();
    });
  }

  /* ---- 进入游戏 ---- */
  function enterGame(saveData) {
    if (saveData) {
      Game.loadData(saveData);                    // 账号：服务器存档
    } else if (Account.isAccount()) {
      /* 新账号无档：带走本地游客档（若有），否则新档，并立即上传 */
      let migrated = false;
      try {
        const raw = localStorage.getItem('usnc_save_v1');
        if (raw) { Game.loadData(JSON.parse(raw)); migrated = true; }
      } catch (e) { /* ignore */ }
      if (!migrated) Game.newGame();
      Game.save();
    } else {
      Game.load();                                 // 游客：本地存档
    }

    Progression.initQuests();
    const changed = Progression.resetDue();
    if (changed.length) Progression.resetQuests(changed);

    Game.setSaveHook(() => { if (Account.isAccount()) Account.saveGame(Game.serialize()); });
    startTimers();

    document.body.classList.remove('unauth');
    UI.refreshTop();
    UI.go('home');
    syncAccount();
  }

  /* 登录/注册成功 / 游客模式 回调（由 login.js 触发） */
  window.__onAccountEnter = save => enterGame(save);
  window.__onGuestEnter = () => enterGame(null);

  /* ---- 启动：恢复会话 → 决定入口 ---- */
  Account.restore().then(r => {
    if (r.ok) enterGame(r.save);       // 会话有效（save 可能为 null）
    else enterGame(null);              // 无 token / 会话过期 → 游客模式
  });
})();
