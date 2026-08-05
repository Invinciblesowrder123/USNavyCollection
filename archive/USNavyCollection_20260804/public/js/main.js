'use strict';
/* ============================================================
 * 启动引导：读档/初始化/时钟/路由
 * ============================================================ */

(function () {
  const $ = s => document.querySelector(s);

  /* ---- 读档 ---- */
  Game.load();
  Progression.initQuests();
  const changed = Progression.resetDue();
  if (changed.length) Progression.resetQuests(changed);

  /* ---- 时钟（每秒） ---- */
  setInterval(() => {
    const now = Date.now();
    Game.regen(now);
    Game.finishTimers(now);
    const ch = Progression.resetDue();
    if (ch.length) Progression.resetQuests(ch);
    Progression.checkDynamic();
    UI.tick();
  }, 1000);

  /* ---- 定时存档 ---- */
  setInterval(() => Game.save(), 5000);
  window.addEventListener('beforeunload', () => Game.save());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') Game.save();
  });

  /* ---- 调试模式：无限资源开关 ---- */
  const dbgBtn = document.getElementById('debugToggle');
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

  /* ---- 首次渲染 ---- */
  UI.refreshTop();
  UI.go('home');
})();
