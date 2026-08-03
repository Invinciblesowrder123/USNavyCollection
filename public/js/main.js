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

  /* ---- 首次渲染 ---- */
  UI.refreshTop();
  UI.go('home');
})();
