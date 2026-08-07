'use strict';
/* ============================================================
 * 后勤：远征 / 入渠 / 补给 / 演习
 * ============================================================ */

const LogisticsUI = (() => {

  function logistics(root, arg) {
    let tab = arg || 'expedition';
    let exFleet = 2;   // 远征页当前选中的舰队（2/3/4，仅已解锁）
    render();

    function render() {
      root.innerHTML = `
        <div class="tabs">
          <button class="${tab === 'expedition' ? 'active' : ''}" data-t="expedition">远征</button>
          <button class="${tab === 'dock' ? 'active' : ''}" data-t="dock">入渠修理</button>
          <button class="${tab === 'supply' ? 'active' : ''}" data-t="supply">补给</button>
          <button class="${tab === 'practice' ? 'active' : ''}" data-t="practice">演习</button>
        </div>`;
      root.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { tab = b.dataset.t; render(); }));
      if (tab === 'expedition') expPanel();
      else if (tab === 'dock') dockPanel();
      else if (tab === 'supply') supplyPanel();
      else practicePanel();
      UI.setTick(tick);
    }

    /* 每秒刷新倒计时；远征/入渠完成后重渲染以显示领取/空位 */
    function tick() {
      const now = Date.now();
      root.querySelectorAll('[data-until]').forEach(el => {
        const end = parseInt(el.dataset.until, 10) || 0;
        el.textContent = end - now > 0 ? Util.fmtTime(end - now) : '完成！';
      });
      let needRerender = false;
      if (tab === 'expedition') {
        const ex = Game.state.expeditions[exFleet];
        if (ex && now >= ex.end && !root.querySelector('[data-claimex]')) needRerender = true;
      } else if (tab === 'dock') {
        const jobs = Game.state.repairs.filter(Boolean).map(r => r.end);
        const rendered = [...root.querySelectorAll('[data-until]')].map(el => parseInt(el.dataset.until, 10));
        if (jobs.length !== rendered.length || jobs.some((t, i) => t !== rendered[i])) needRerender = true;
      }
      if (needRerender) render();
    }

    /* ============ 远征 ============ */
    function expPanel() {
      const st = Game.state;
      const exFleets = Game.unlockedFleets().filter(f => f !== 1);
      if (!exFleets.includes(exFleet)) exFleet = exFleets[0] || 2;
      root.insertAdjacentHTML('beforeend', `<div class="panel">
        <h3>远征 <span class="dim">（派出舰队远征，出发后舰队锁定）</span></h3>
        <div class="tabs">
          ${exFleets.map(f => `<button class="${exFleet === f ? 'active' : ''}" data-exf="${f}">第${['', '一', '二', '三', '四'][f]}舰队</button>`).join('')}
        </div>
        <div class="section-title">第${['', '一', '二', '三', '四'][exFleet]}舰队状态</div>
        <div class="flex" style="gap:8px">
          ${(st.fleet[exFleet] || []).map(uid => `<div style="width:12%">${UI.shipCard(uid)}</div>`).join('') || `<span class="dim">第${['', '一', '二', '三', '四'][exFleet]}舰队为空，去编成界面配置吧</span>`}
        </div>
        <div class="section-title">远征任务</div>
        ${EXPEDITIONS.map(ex => {
          const active = st.expeditions[exFleet] && st.expeditions[exFleet].exId === ex.id;
          const left = st.expeditions[exFleet] ? st.expeditions[exFleet].end - Date.now() : 0;
          const rw = Object.entries(ex.reward).map(([k, v]) => `${({ fuel: '油', ammo: '弹', steel: '钢', baux: '铝', devMats: '开发资材' })[k]}+${v}`).join(' ');
          return `<div class="panel" style="margin:6px 0">
            <div class="flex" style="justify-content:space-between;align-items:center">
              <div>
                <b>${ex.name}</b> <span class="dim">${Util.fmtTime(ex.time * 1000)}</span>
                <div class="hint">${ex.desc} ｜ 条件：${ex.req.ships || 0}+舰 ｜ 奖励：${rw} ｜ 入手经验：${ex.exp}</div>
              </div>
              ${active
                ? (left > 0 ? `<span class="countdown" data-until="${st.expeditions[exFleet].end}">${Util.fmtTime(left)}</span>` : `<button class="btn btn-gold btn-sm" data-claimex>完成！领取</button>`)
                : `<button class="btn btn-sm" data-ex="${ex.id}">派遣</button>`}
            </div></div>`;
        }).join('')}
        <div class="hint">远征归来获得经验（旗舰1.5倍、可能随机2倍）；全员「闪」状态大幅提高大成功概率（大成功：资源与经验×2）。远征中的舰队不能变更编成。</div>
      </div>`);

      root.querySelectorAll('[data-exf]').forEach(b => {
        b.addEventListener('click', () => { exFleet = parseInt(b.dataset.exf, 10); render(); });
      });
      root.querySelectorAll('[data-ex]').forEach(b => {
        b.addEventListener('click', () => {
          const r = Logistics.startExpedition(exFleet, b.dataset.ex);
          if (!r.ok) { UI.toast(r.msg); return; }
          UI.toast(`远征「${r.ex.name}」出发！${Util.fmtTime(r.ex.time * 1000)}后完成`);
          Game.save(); render();
        });
      });
      const claimBtn = root.querySelector('[data-claimex]');
      if (claimBtn) claimBtn.addEventListener('click', () => {
        const r = Logistics.claimExpedition(exFleet);
        if (!r.ok) { UI.toast(r.msg); return; }
        const rw = Object.entries(r.reward).map(([k, v]) => `${({ fuel: '燃料', ammo: '弹药', steel: '钢材', baux: '铝土', devMats: '开发资材' })[k]}+${v}`).join(' ');
        UI.toast(`远征「${r.ex.name}」${r.great ? '大成功！' : '成功！'}获得 ${rw}`);
        Game.save(); render();
      });
    }

    /* ============ 入渠 ============ */
    function dockPanel() {
      const st = Game.state;
      const damaged = Object.values(st.ships).filter(s => s.hp < Game.shipStats(s.uid).hpMax)
        .filter(s => !st.repairs.some(r => r && r.ship === s.uid));
      root.insertAdjacentHTML('beforeend', `<div class="panel">
        <h3>入渠修理</h3>
        <div class="section-title">修理船坞（拖拽待修理舰娘送入；入渠后槽位固定，不可移动或取消）</div>
        <div class="flex" style="gap:8px">
          ${st.repairs.map((r, i) => {
            if (!r) return `<div class="fleet-slot" style="width:23%;min-height:120px" data-dock="${i}">船坞${i + 1}<br><span class="dim">空闲</span></div>`;
            const s = st.ships[r.ship];
            const def = Game.shipDef(s);
            const left = r.end - Date.now();
            return `<div class="ship-card dock-card" style="width:23%">${UI.portraitImg(s.id, 'portrait')}
              <div class="card-info"><span>${UI.esc(def.zh)}</span><span class="lv countdown" data-until="${r.end}">${Util.fmtTime(left)}</span></div>
            </div>`;
          }).join('')}
        </div>
        <div class="section-title">待修理舰娘（拖拽图标送入船坞）</div>
        <div class="flex roster-area">
          ${damaged.map(s => {
            const def = Game.shipDef(s);
            const c = Logistics.repairCost(s.uid);
            return `<div style="width:12%">${UI.shipCard(s.uid)}<button class="btn btn-sm" style="width:100%;border-radius:0" data-rep="${s.uid}" data-steel="${c.steel}">${c.steel}钢/${c.minutes}分</button></div>`;
          }).join('') || '<span class="dim">没有需要修理的舰娘</span>'}
        </div>
        <div class="hint">修理消耗钢材并占用时间。大破舰娘必须修理后才能再次出击。</div>
      </div>`);

      root.querySelectorAll('[data-rep]').forEach(b => {
        b.addEventListener('click', () => {
          const idx = Game.state.repairs.findIndex(x => !x);
          if (idx < 0) { UI.toast('船坞已满！'); return; }
          const r = Logistics.startRepair(idx, b.dataset.rep);
          if (!r.ok) { UI.toast(r.msg); return; }
          UI.toast(`修理开始：${Util.fmtTime(r.c.minutes * 1000)}后完成`);
          Game.save(); render();
        });
      });

      /* ---- 拖拽送入船坞（入渠中槽位固定，仅空船坞可接收） ---- */
      root.querySelectorAll('.ship-card:not(.dock-card)').forEach(card => {
        card.draggable = true;
        card.addEventListener('dragstart', e => {
          e.dataTransfer.setData('text/plain', card.dataset.uid);
          e.dataTransfer.effectAllowed = 'move';
          card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => {
          card.classList.remove('dragging');
          root.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over'));
        });
      });
      root.querySelectorAll('.fleet-slot[data-dock]').forEach(slot => {
        slot.addEventListener('dragover', e => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          slot.classList.add('drag-over');
        });
        slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
        slot.addEventListener('drop', e => {
          e.preventDefault();
          slot.classList.remove('drag-over');
          const uid = e.dataTransfer.getData('text/plain');
          if (!uid || !st.ships[uid]) return;
          if (st.repairs.some(r => r && r.ship === uid)) { UI.toast('该舰娘已在入渠中，不能移动'); return; }
          const r = Logistics.startRepair(parseInt(slot.dataset.dock, 10), uid);
          if (!r.ok) { UI.toast(r.msg); return; }
          UI.toast(`修理开始：${Util.fmtTime(r.c.minutes * 1000)}后完成`);
          Game.save(); render();
        });
      });
    }

    /* ============ 补给 ============ */
    function supplyPanel() {
      const st = Game.state;
      const fleets = Game.unlockedFleets();
      const costs = fleets.map(f => Logistics.supplyCost(f));
      root.insertAdjacentHTML('beforeend', `<div class="panel">
        <h3>补给</h3>
        <div class="stat-grid">
          ${fleets.map((f, i) => `<div class="stat-item"><div class="label">第${['', '一', '二', '三', '四'][f]}舰队补给</div><div class="value">油${costs[i].fuel} 弹${costs[i].ammo} 铝${costs[i].baux}</div></div>`).join('')}
        </div>
        <div class="btn-row">
          ${fleets.map(f => `<button class="btn btn-green" data-sup="${f}">补给第${['', '一', '二', '三', '四'][f]}舰队</button>`).join('')}
        </div>
        <div class="hint">油弹决定出击战斗能力（参照 wiki 弹药补正）：弹药≥50%伤害100%，<50%按残弹率/50减半，0%无法炮击。每个战斗点消耗燃料20%、弹药20%（进入夜战弹药30%），请于出击前补给。航母补给会消耗铝土补充机队。</div>
      </div>`);
      root.querySelectorAll('[data-sup]').forEach(b => {
        b.addEventListener('click', () => {
          const r = Logistics.supplyFleet(parseInt(b.dataset.sup, 10));
          if (!r.ok) { UI.toast(r.msg); return; }
          UI.toast('补给完毕！');
          Game.save(); render();
        });
      });
    }

    /* ============ 演习 ============ */
    function practicePanel() {
      const pr = Logistics.practiceReady();
      const st = Game.state;
      const used = pr.used || 0;
      root.insertAdjacentHTML('beforeend', `<div class="panel">
        <h3>演习 <span class="dim">（不消耗资源、不会真正受伤，今日已用 ${used}/5）</span></h3>
        <div class="hint">经验按敌方旗舰与第二舰等级计算（S胜×1.2），胜利获得提督经验；被击沉的舰娘无法获得经验。</div>
        ${pr.fleets.map((f, i) => {
          const done = i < used;
          const ships = f.ships.map(s => {
            const d = ShipData[s.id];
            return `${UI.esc(d.zh)}Lv${s.lv}`;
          }).join('、');
          return `<div class="panel" style="margin:8px 0">
            <div class="flex" style="justify-content:space-between;align-items:center">
              <div><b>${f.name}</b><div class="hint">${ships}</div></div>
              <button class="btn ${done ? 'btn-sm' : 'btn-gold'}" data-prac="${i}" ${done ? 'disabled' : ''}>${done ? '已演练' : '进行演习'}</button>
            </div></div>`;
        }).join('')}
      </div>`);

      root.querySelectorAll('[data-prac]').forEach(b => {
        b.addEventListener('click', () => {
          const idx = parseInt(b.dataset.prac, 10);
          if (idx < (pr.used || 0)) { UI.toast('今日演习次数用尽'); return; }
          const f = pr.fleets[idx];
          /* 演习：玩家自由选择阵型（wiki「演习」），敌方固定单纵阵；昼战结束后可选择是否夜战突入 */
          SortieUI.openFormationSelect(formation => {
            const result = Battle.battle(Game.state.fleet[1], f.ships, formation, '单纵阵', { allowNight: false, fleetIdx: 1 });
            pr.used = idx + 1;
            Game.save();
            const wrapped = { ok: true, result, isBoss: false, drop: null, cleared: false };
            const rbOpts = {
              practice: true,
              splitNight: true,
              nightAvailable: () => wrapped.result.mySide.some(s => s.alive) && wrapped.result.enemySide.some(s => s.alive),
              doNight: () => { wrapped.result = Battle.battleNight(wrapped.result); },
              finish: () => {
                const res = Progression.applyBattleResult(1, wrapped.result, true);
                Game.state.stats.practice++;
                Game.save();
                rbOpts.gains = res.gains;
                rbOpts.adm = res.adm;
              },
              onBack: () => render()
            };
            SortieUI.renderBattle(root, wrapped, () => render(), rbOpts);
          });
        });
      });
    }

    return render;
  }

  return { logistics };
})();

UI.Screens.logistics = (root, arg) => LogisticsUI.logistics(root, arg);
