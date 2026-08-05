'use strict';
/* ============================================================
 * 任务界面
 * ============================================================ */

const QuestsUI = (() => {

  function quests(root) {
    const st = Game.state;
    const groups = [
      ['once', '一次性任务'],
      ['daily', '日常任务（每日05:00重置）'],
      ['weekly', '周常任务（每周一05:00重置）'],
      ['monthly', '月常任务（每月1日05:00重置）']
    ];

    root.innerHTML = groups.map(([type, label]) => {
      const list = QUESTS.filter(q => q.type === type);
      return `<div class="panel">
        <h3>${label}</h3>
        ${list.map(q => {
          const qq = st.quests[q.id] || { progress: 0, claimed: false };
          const rw = [];
          const r = q.reward || {};
          if (r.fuel) rw.push(`油+${r.fuel}`);
          if (r.ammo) rw.push(`弹+${r.ammo}`);
          if (r.steel) rw.push(`钢+${r.steel}`);
          if (r.baux) rw.push(`铝+${r.baux}`);
          if (r.equip) rw.push(r.equip.map(id => EquipmentData[id].zh).join('、'));
          if (r.ship) rw.push(r.ship.map(id => ShipData[id].zh).join('、'));
          const done = qq.progress >= q.cond.count;
          return `<div class="quest-card ${qq.claimed ? 'claimed' : ''}">
            <div class="grow">
              <div class="qname">${UI.esc(q.name)}</div>
              <div class="qdesc">${UI.esc(q.desc)}</div>
              <div class="qrewards">奖励：${rw.join('、') || '无'}</div>
            </div>
            <div class="qprog num">${qq.claimed ? '已领取' : `${qq.progress}/${q.cond.count}`}</div>
            <button class="btn ${done ? 'btn-gold' : 'btn-sm'}" data-claim="${q.id}" ${qq.claimed || !done ? 'disabled' : ''}>${qq.claimed ? '已完成' : '领取'}</button>
          </div>`;
        }).join('')}
      </div>`;
    }).join('');

    root.querySelectorAll('[data-claim]').forEach(b => {
      b.addEventListener('click', () => {
        const r = Progression.claimQuest(b.dataset.claim);
        if (!r.ok) { UI.toast(r.msg); return; }
        const parts = [];
        if (r.ships.length) parts.push(`舰娘：${r.ships.map(s => UI.esc(Game.shipDef(s).zh)).join('、')}`);
        if (r.eqs.length) parts.push(`装备：${r.eqs.map(e => UI.esc(EquipmentData[e.id].zh)).join('、')}`);
        UI.toast(`任务完成！${parts.join(' ')}`);
        Game.save();
        quests(root);
      });
    });
  }

  return { quests };
})();

UI.Screens.quests = QuestsUI.quests;
