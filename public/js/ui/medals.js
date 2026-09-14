'use strict';
/* ============================================================
 * 军需处（V0.305 · 消费端）
 * - 战功章：高难内容产出 → **只兑换消耗品与资材**（不卖舰娘、不卖大宗资源；规划方案 §4.2）
 * - 本屏只做渲染与交互；一切判定/记账/发放都在 Progression 里（禁止在 UI 另写一套）
 * - 兑换是不可逆的资产消耗 → 必须二次确认（规范 P0-4，坑 #38）
 * ============================================================ */

const Medals = (() => {
  /* 兑换二次确认：文案必须写明代价，且确认按钮与"取消"同屏可见 */
  function confirmBuy(item, onDone) {
    const html = `
      <span class="modal-close" data-close>×</span>
      <h3>兑换确认</h3>
      <div class="medal-confirm-box">
        <div class="medal-confirm-name">${UI.esc(item.name)}</div>
        <div>消耗 <b class="medal-cost">🎖 ${item.cost}</b> 枚战功章　
          <span class="dim">（当前持有 ${Progression.medalBalance()} 枚，兑换后剩余 ${Progression.medalBalance() - item.cost} 枚）</span></div>
        ${item.limit === 'weekly' ? '<div class="dim">本项为每周限购：兑换后本周内不可再次兑换。</div>' : ''}
        <div class="hint">战功章是不可逆的资产，兑换后不返还。</div>
      </div>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn btn-gold" data-medal-confirm>确认兑换</button>
        <button class="btn" data-close>取消</button>
      </div>`;
    const m = UI.modal(html, () => { });
    const ok = m.root.querySelector('[data-medal-confirm]');
    if (ok) ok.addEventListener('click', () => {
      const r = Progression.medalShopBuy(item.id);
      m.close();
      if (!r.ok) { UI.toast(r.msg); if (onDone) onDone(); return; }
      Game.save();
      UI.refreshTop();
      UI.toast(`兑换完成：${item.name}（-${r.cost} 枚战功章）`);
      if (onDone) onDone();
    });
  }

  function medals(root) {
    function render() {
      const bal = Progression.medalBalance();
      const shop = Progression.medalShopState();
      const srcs = Progression.medalSourceSummary();
      const lib = Game.libraryStats();
      /* 仓库满时消耗品入仓会被拦下 —— 提前把这个理由摆在明面上（而不是点了才报错） */
      const capFull = !Game.isTestMode() && Game.equipCapWouldExceed(1);

      const shopCard = it => {
        const eq = [].concat((it.reward && it.reward.item) || [], (it.reward && it.reward.equip) || []);
        const ed = eq.length ? EquipmentData[eq[0]] : null;
        const blocked = it.weeklyUsed || (eq.length > 0 && capFull);
        const reason = it.weeklyUsed ? '本周已兑换' : (eq.length > 0 && capFull ? '装备仓库已满' : '');
        return `<div class="medal-shop-item${blocked ? ' blocked' : ''}">
          <div class="msi-main">
            <span class="msi-name">${ed ? UI.eqNameHtml(ed) : UI.esc(it.name)}</span>
            <span class="msi-tag dim">${it.limit === 'weekly' ? '每周限购 1 次' : '不限购'}</span>
          </div>
          <div class="msi-side">
            <span class="msi-cost">🎖 ${it.cost}</span>
            <button class="btn btn-gold btn-sm" data-buy="${UI.esc(it.id)}"${(blocked || !it.affordable) ? ' disabled' : ''}>
              ${blocked ? reason : (it.affordable ? '兑换' : '章不足')}
            </button>
          </div>
        </div>`;
      };

      const srcRow = s => {
        const done = s.total > 0 && s.got >= s.total;
        const pctTxt = s.kind === 'weekly'
          ? `${s.got}/${s.total} 场（本周）`
          : `${s.got}/${s.total}`;
        const earnedTxt = s.potential != null ? `已得 ${s.earned}/${s.potential} 枚` : `已得 ${s.earned} 枚`;
        return `<div class="medal-src-row${done ? ' done' : ''}">
          <b>${done ? '★' : '☆'}</b>
          <span class="msr-name">${UI.esc(s.name)}</span>
          <span class="dim">${pctTxt}</span>
          <span class="msr-earn">${earnedTxt}</span>
        </div>`;
      };

      root.innerHTML = `
        <div class="panel">
          <h3>军需处 <span class="dim">（战功章：由高难内容产出，只兑换消耗品与资材）</span></h3>
          <div class="medal-head">
            <span class="medal-bal">🎖 <b>${bal}</b> <span class="dim">枚战功章</span></span>
            <span class="dim">图鉴收集率：舰船 ${lib.ships.owned}/${lib.ships.total} · 装备 ${lib.equips.owned}/${lib.equips.total}</span>
          </div>
          ${bal === 0 ? '<div class="hint">还没有战功章。海域首通 / 作战目标 / 战役 / 图鉴收集率里程碑都会产出战功章；每周首次「史实重演」S 胜另给 1 枚。详见下方产出记录。</div>' : ''}
          ${capFull ? '<div class="hint">装备仓库已满，消耗品无法入仓 —— 请先解体或用掉部分装备。</div>' : ''}
          <div class="section-title">兑换 <span class="dim">（不兑换舰娘与大宗资源）</span></div>
          <div class="medal-shop">${shop.map(shopCard).join('')}</div>
          <div class="section-title">产出记录 <span class="dim">（一次性产出每项只发一次；周项随周常重置）</span></div>
          <div class="medal-src">${srcs.map(srcRow).join('')}</div>
        </div>`;

      root.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => {
        const it = Progression.medalShopState().find(x => x.id === b.dataset.buy);
        if (!it) return;
        confirmBuy(it, render);
      }));
    }
    render();
  }

  return { medals, confirmBuy };
})();

UI.Screens.medals = Medals.medals;
