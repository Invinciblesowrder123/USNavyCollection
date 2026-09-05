'use strict';
/* ============================================================
 * 启动引导：会话恢复 → 登录校验 → 读档 → 时钟/存档 → 路由
 * 必须登录后才能进入游戏（Cookie 免登录直进）。
 * 测试模式（无限资源/瞬间建造/瞬间入渠）为管理员独有功能。
 * ============================================================ */

(function () {
  const $ = s => document.querySelector(s);
  let booted = false;

  /* ---- 测试模式开关（仅管理员可见可用）：无限资源/瞬间建造/瞬间入渠 ---- */
  const dbgBtn = $('#debugToggle');
  function syncDebugBtn() {
    const isAdm = Account.isAdmin();
    dbgBtn.style.display = isAdm ? '' : 'none';
    if (!isAdm && Game.isTestMode()) Game.setTestMode(false);
    const on = Game.isTestMode() && isAdm;
    dbgBtn.textContent = on ? '测试模式 ON' : '测试模式 OFF';
    dbgBtn.classList.toggle('on', on);
  }
  dbgBtn.addEventListener('click', () => {
    if (!Account.isAdmin()) { UI.toast('测试模式为管理员专属功能'); return; }
    Game.setTestMode(!Game.isTestMode());
    syncDebugBtn();
    UI.refreshTop();
    UI.toast(Game.isTestMode() ? '调试：测试模式已开启（无限资源 / 瞬间建造 / 瞬间入渠）' : '调试：测试模式已关闭');
  });
  syncDebugBtn();

  /* ---- 音效开关与首次解锁 ---- */
  const sndBtn = $('#soundToggle');
  function syncSoundBtn() {
    const muted = Sound.isMuted();
    sndBtn.textContent = muted ? '🔇 静音' : '🔊 音效';
    sndBtn.classList.toggle('on', !muted);
  }
  sndBtn.addEventListener('click', () => {
    Sound.setMuted(!Sound.isMuted());
    syncSoundBtn();
    UI.toast(Sound.isMuted() ? '音效已关闭' : '音效已开启');
  });
  /* 浏览器自动播放策略要求先有用户手势，首次交互时解锁并起播 BGM */
  const unlockAudio = () => {
    Sound.unlock();
    const cur = UI.current && UI.current.name;
    Sound.playBgm(cur === 'sortie' ? 'battle' : 'port');
    document.removeEventListener('pointerdown', unlockAudio);
    document.removeEventListener('keydown', unlockAudio);
  };
  document.addEventListener('pointerdown', unlockAudio);
  document.addEventListener('keydown', unlockAudio);
  syncSoundBtn();

  /* ---- 账号栏（顶栏） ---- */
  const accBtn = $('#accountBtn');
  const accInfo = $('#accountInfo');
  function syncAccount() {
    if (Account.isAccount()) {
      accInfo.textContent = (Account.isAdmin() ? '👑 ' : '') + '@' + Account.username();
      accBtn.textContent = '退出登录';
    } else {
      accInfo.textContent = '';
      accBtn.textContent = '';
      accBtn.style.display = 'none';
      return;
    }
    accBtn.style.display = '';
  }
  accBtn.addEventListener('click', () => {
    if (!Account.isAccount()) return;
    /* 退出：先上传当前档，再回登录页 */
    Account.saveGame(Game.serialize()).finally(() => {
      Account.logout();
      if (Game.isTestMode()) Game.setTestMode(false);
      document.body.classList.add('unauth');
      UI.go('login');
      syncAccount();
    });
  });
  Account.onChange(() => { syncAccount(); syncDebugBtn(); });
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
    const hasShips = !!(saveData && saveData.ships && Object.keys(saveData.ships).length > 0);
    if (hasShips) {
      Game.loadData(saveData);                    // 账号：服务器存档（正常）
    } else {
      /* 无存档或服务器存档破损（无舰船）：
       * 优先迁移本地游客旧档（若有），否则加载/重建存档（applySave 会补发初始舰队） */
      let migrated = false;
      try {
        const raw = localStorage.getItem('usnc_save_v1');
        if (raw) {
          const guest = JSON.parse(raw);
          if (guest && guest.ships && Object.keys(guest.ships).length > 0) {
            Game.loadData(guest);
            migrated = true;
          }
        }
      } catch (e) { /* ignore */ }
      if (migrated) {
        /* 游客旧档已接管；破损的服务器存档内容被丢弃 */
      } else if (saveData) {
        Game.loadData(saveData);                    // 破损存档 → applySave 自动修复
      } else {
        Game.newGame();
      }
      Game.save();
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
    syncDebugBtn();
  }

  function showLogin() {
    document.body.classList.add('unauth');
    UI.go('login');
    syncAccount();
    syncDebugBtn();
  }

  /* 登录/注册成功回调（由 login.js 触发） */
  window.__onAccountEnter = save => enterGame(save);

  /* ---- 启动：恢复会话（Cookie 免登录直进）→ 决定入口 ---- */
  Account.restore().then(r => {
    if (r.ok) enterGame(r.save);
    else showLogin();                     // 未登录/会话过期 → 登录页
  });
})();
