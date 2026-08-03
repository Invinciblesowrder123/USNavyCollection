'use strict';
/* ============================================================
 * 母港 / 编成 / 舰娘详情（装备/改造/近代化/解体）
 * ============================================================ */

const Homeport = (() => {

  /* ============ 舰娘详情模态 ============ */
  function openShipDetail(uid, back = () => {}) {
    const st = Game.state;
    const s = st.ships[uid];
    if (!s) return;
    const def = Game.shipDef(s);
    const stats = Game.shipStats(uid);
    const stNames = [['hp', '耐久'], ['fp', '火力'], ['tp', '雷装'], ['aa', '对空'], ['arm', '装甲'], ['evd', '回避'], ['asw', '对潜'], ['los', '索敌'], ['lck', '幸运']];
    const rmInfo = Progression.remodelInfo(uid);
    const modInfo = Progression.modernizeInfo(uid);
    const supply = Math.round(s.supply.fuel * 100);

    const statHtml = stNames.map(([k, zh]) => {
      const base = def.stats[stNames.findIndex(x => x[0] === k)];
      const mod = s.modern[k] || 0;
      return `<div class="stat-item"><div class="label">${zh}</div><div class="value num">${stats[k]}${mod ? ` <span style="color:#7fe07f">(+${mod})</span>` : ''}</div></div>`;
    }).join('');

    const eqHtml = def.slots.map((sl, i) => {
      const euid = s.equipped[i];
      const eq = euid ? st.equipment[euid] : null;
      const ed = eq ? EquipmentData[eq.id] : null;
      const types = sl.types.map(t => ['小主炮', '中主炮', '大主炮', '副炮', '鱼雷', '舰战', '舰攻', '舰爆', '水侦/水爆', '电探', '高角炮', '机枪', '声呐/爆雷', '设备'][t - 1]).join('/');
      const size = def.sizes ? def.sizes[i] : 24;
      return `<div class="eq-slot" data-slot="${i}">
        ${ed ? `<b>${Util.esc(ed.zh)}</b>` : `<span class="dim">空槽</span>`}
        <span class="dim">[${types}${def.sizes ? ` · ${size}机` : ''}]</span>
      </div>`;
    }).join('');

    const m = UI.modal(`
      <span class="modal-close" data-close>×</span>
      <h3>${UI.esc(def.zh)} <span class="dim">${UI.esc(def.en)}</span> <span class="dim">${SHIP_TYPE_ZH[def.type]}</span></h3>
      <div class="flex">
        <div style="width:170px">${UI.portraitImg(s.id, 'portrait')}
          <div class="text-center dim">Lv.${s.lv} ${s.kai === 1 ? '改' : s.kai >= 2 ? '改二' : ''} · 补给${supply}%</div>
        </div>
        <div class="grow">
          <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">${statHtml}</div>
          <div class="section-title">装备</div>
          <div>${eqHtml}</div>
          <div class="section-title">操作</div>
          <div class="btn-row">
            <button class="btn btn-green btn-sm" data-act="supply">补给</button>
            <button class="btn btn-sm" data-act="lock">${s.locked ? '解锁' : '锁定'}</button>
            ${(st.fleet[1].includes(uid) || st.fleet[2].includes(uid)) ? `<button class="btn btn-sm" data-act="remove">移出舰队</button>` : ''}
            ${rmInfo ? `<button class="btn btn-gold btn-sm" data-act="remodel">改造(Lv.${rmInfo.lvNeed}，${rmInfo.cost.fuel}油/${rmInfo.cost.ammo}弹/${rmInfo.cost.steel}钢)</button>` : ''}
            ${modInfo && Object.keys(modInfo.gains).length ? `<button class="btn btn-sm" data-act="modernize">近代化改修</button>` : ''}
            <button class="btn btn-red btn-sm" data-act="scrap">解体</button>
          </div>
          <div class="hint">${Util.esc(def.line || '')}</div>
        </div>
      </div>
    `, () => back());

    m.root.querySelector('[data-act="supply"]').addEventListener('click', () => {
      s.supply = { fuel: 1, ammo: 1 };
      UI.toast(`${def.zh} 补给完毕`);
      m.close(); back();
    });
    m.root.querySelector('[data-act="lock"]').addEventListener('click', () => {
      s.locked = !s.locked;
      m.close(); back();
    });
    const removeBtn = m.root.querySelector('[data-act="remove"]');
    if (removeBtn) removeBtn.addEventListener('click', () => {
      for (const f in st.fleet) st.fleet[f] = st.fleet[f].filter(x => x !== uid);
      Game.save();
      UI.toast(`${def.zh} 已移出舰队`);
      m.close(); back();
    });
    if (rmInfo) m.root.querySelector('[data-act="remodel"]').addEventListener('click', () => {
      const r = Progression.remodel(uid);
      if (!r.ok) { UI.toast(r.msg); return; }
      UI.toast(`${def.zh} 改造完成！`);
      Game.save();
      m.close(); back();
    });
    if (modInfo && Object.keys(modInfo.gains).length) {
      m.root.querySelector('[data-act="modernize"]').addEventListener('click', () => openModernize(uid, () => { m.close(); back(); }));
    }
    m.root.querySelector('[data-act="scrap"]').addEventListener('click', () => {
      if (!confirm(`确定解体 ${def.zh}？\n（解体后其装备一并销毁）`)) return;
      Game.destroyShip(uid);
      Game.save();
      UI.toast(`${def.zh} 已解体`);
      m.close(); back();
    });

    /* 装备槽点击 → 装备选择 */
    m.root.querySelectorAll('.eq-slot').forEach(el => {
      el.addEventListener('click', () => openEquipPicker(uid, parseInt(el.dataset.slot, 10), () => m.close() || back()));
    });
  }

  /* 装备选择器 */
  function openEquipPicker(uid, slotIdx, onDone) {
    const st = Game.state;
    const s = st.ships[uid];
    const def = Game.shipDef(s);
    const slot = def.slots[slotIdx];
    const inv = Object.values(st.equipment).filter(eq => {
      const ed = EquipmentData[eq.id];
      if (!ed) return false;
      const used = Object.values(st.ships).some(x => x.equipped.includes(eq.uid));
      return !used && slot.types.includes(ed.slot);
    });
    const html = `
      <span class="modal-close" data-close>×</span>
      <h3>选择装备（槽位 ${slotIdx + 1}）</h3>
      <div class="flex">
        ${inv.length ? inv.map(eq => {
          const ed = EquipmentData[eq.id];
          const stx = Object.entries(ed.stat).map(([k, v]) => `${k}:${v}`).join(' ');
          return `<div class="eq-slot" data-eq="${eq.uid}"><b>${Util.esc(ed.zh)}</b> <span class="dim">(${EQUIP_CAT_ZH[ed.cat] || ed.cat}) ${stx}</span></div>`;
        }).join('') : '<span class="dim">没有可用装备。去工厂开发吧！</span>'}
      </div>
      <div class="btn-row"><button class="btn btn-red btn-sm" data-clear>卸下当前装备</button></div>`;
    const m = UI.modal(html, onDone);
    m.root.querySelectorAll('[data-eq]').forEach(el => {
      el.addEventListener('click', () => {
        const euid = el.dataset.eq;
        const old = s.equipped[slotIdx];
        if (old) { st.equipment[old]._free = true; }
        s.equipped[slotIdx] = euid;
        delete st.equipment[euid]._free;
        Game.save();
        UI.toast('装备更换完成');
        m.close(); onDone();
      });
    });
    const clearBtn = m.root.querySelector('[data-clear]');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      const old = s.equipped[slotIdx];
      if (old) delete s.equipped[slotIdx];
      Game.save();
      m.close(); onDone();
    });
  }

  /* 近代化改修（选材料舰） */
  function openModernize(targetUid, onDone) {
    const st = Game.state;
    const mats = Object.values(st.ships).filter(x => x.uid !== targetUid && !st.fleet[1].includes(x.uid) === false || true)
      .filter(x => !x.locked && !st.repairs.some(r => r && r.ship === x.uid));
    const html = `
      <span class="modal-close" data-close>×</span>
      <h3>近代化改修 —— 选择材料舰（消耗 油30/弹30）</h3>
      <div class="flex">
        ${mats.map(x => {
          const d = Game.shipDef(x);
          return `<div class="eq-slot" data-mat="${x.uid}"><b>${UI.esc(d.zh)}</b> <span class="dim">Lv.${x.lv}</span></div>`;
        }).join('') || '<span class="dim">没有可用的材料舰</span>'}
      </div>
      <div class="hint">材料舰将解体，其属性按比例转入目标舰。</div>`;
    const m = UI.modal(html, onDone);
    m.root.querySelectorAll('[data-mat]').forEach(el => {
      el.addEventListener('click', () => {
        const r = Progression.modernize(el.dataset.mat, targetUid);
        if (!r.ok) { UI.toast(r.msg); return; }
        UI.toast('近代化改修完成！');
        Game.save();
        m.close(); onDone();
      });
    });
  }

  /* ============ 母港 ============ */
  function home(root) {
    const st = Game.state;
    const fleet = st.fleet[1];
    const claimable = QUESTS.filter(q => Progression.canClaim(q.id)).length;
    const exInfo = st.expeditions[2];
    const repairInfo = st.repairs.map((r, i) => r ? `船坞${i + 1}:${Game.shipDef(st.ships[r.ship]).zh}` : `船坞${i + 1}:空`).join(' · ');

    root.innerHTML = `
      <div class="flex">
        <div class="grow">
          <div class="panel">
            <h3>第一舰队 <span class="dim">(点击舰娘查看详情)</span></h3>
            <div class="flex" style="gap:8px">
              ${fleet.map(uid => `<div style="width:15%">${UI.shipCard(uid, { fleetIdx: 1 })}</div>`).join('') ||
              '<div class="hint">舰队为空，先去 编成 界面编入舰娘吧！</div>'}
            </div>
            <div class="btn-row">
              <button class="btn btn-gold" data-go="sortie">出击</button>
              <button class="btn" data-go="formation">编成</button>
              <button class="btn" data-go="logistics" data-tab="supply">补给</button>
              <button class="btn" data-go="logistics" data-tab="dock">入渠</button>
              <button class="btn" data-go="logistics" data-tab="expedition">远征</button>
              <button class="btn" data-go="factory">建造/开发</button>
            </div>
          </div>
          <div class="panel">
            <h3>提督信息</h3>
            <div class="stat-grid">
              <div class="stat-item"><div class="label">提督等级</div><div class="value num">Lv.${st.admiral.level}</div></div>
              <div class="stat-item"><div class="label">总出击</div><div class="value num">${st.stats.sortie}</div></div>
              <div class="stat-item"><div class="label">总胜利</div><div class="value num">${st.stats.win}</div></div>
              <div class="stat-item"><div class="label">击沉敌舰</div><div class="value num">${st.stats.sink}</div></div>
              <div class="stat-item"><div class="label">远征完成</div><div class="value num">${st.stats.expedition}</div></div>
              <div class="stat-item"><div class="label">演习次数</div><div class="value num">${st.stats.practice}</div></div>
              <div class="stat-item"><div class="label">可领取任务</div><div class="value num" style="color:${claimable ? 'var(--gold)' : ''}">${claimable}</div></div>
              <div class="stat-item"><div class="label">舰队索敌</div><div class="value num">${Game.fleetLos(1)}</div></div>
            </div>
            <div class="hint">远征：${exInfo ? UI.countdown(exInfo.end - Date.now()) + ' 进行中' : '空闲'} ｜ 入渠：${repairInfo}</div>
            <div class="hint">资源每30秒自然恢复（油弹钢+2 铝+1），远征与任务是主要收入来源。</div>
          </div>
        </div>
      </div>`;

    root.querySelectorAll('.ship-card').forEach(c => {
      c.addEventListener('click', () => openShipDetail(c.dataset.uid, () => home(root)));
    });
    root.querySelectorAll('[data-go]').forEach(b => {
      b.addEventListener('click', () => {
        const tab = b.dataset.tab;
        if (tab) { UI.go(b.dataset.go, tab); } else UI.go(b.dataset.go);
      });
    });
  }

  /* ============ 编成 ============ */
  function formation(root, arg) {
    const st = Game.state;
    let fleetIdx = arg === 2 ? 2 : 1;
    const MAX = 6;

    function render() {
      const fleet = st.fleet[fleetIdx];
      const inOther = st.fleet[fleetIdx === 1 ? 2 : 1];
      const allShips = Object.values(st.ships).filter(s => !inOther.includes(s.uid));
      const los = Game.fleetLos(fleetIdx);
      const types = fleet.map(uid => SHIP_TYPE_ZH[Game.shipDef(st.ships[uid]).type]).join('、') || '无';

      root.innerHTML = `
        <div class="tabs">
          <button class="${fleetIdx === 1 ? 'active' : ''}" data-f="1">第一舰队（出击）</button>
          <button class="${fleetIdx === 2 ? 'active' : ''}" data-f="2">第二舰队（远征）</button>
        </div>
        <div class="panel">
          <h3>编成 第${fleetIdx}舰队 <span class="dim">索敌 ${los} ｜ 舰种：${UI.esc(types)}</span></h3>
          <div class="flex" style="gap:8px">
            ${Array.from({ length: MAX }, (_, i) => {
              const uid = fleet[i];
              if (!uid) return `<div class="fleet-slot" style="width:15%" data-empty="${i}">空位 ${i + 1}</div>`;
              return `<div style="width:15%">${UI.shipCard(uid, { fleetIdx })}</div>`;
            }).join('')}
          </div>
          <div class="section-title">母港舰娘（点击编入；点击舰队内舰娘查看详情/移出）</div>
          <div class="flex" style="gap:8px">
            ${allShips.map(s => `<div style="width:10%">${UI.shipCard(s.uid)}</div>`).join('') ||
            '<div class="hint">没有其他舰娘，去工厂建造吧！</div>'}
          </div>
        </div>`;

      root.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => formation(root, parseInt(b.dataset.f, 10))));
      root.querySelectorAll('.fleet-slot[data-empty]').forEach(el => {
        el.addEventListener('click', () => {
          const idx = parseInt(el.dataset.empty, 10);
          pickShipFor(fleetIdx, idx, render);
        });
      });
      root.querySelectorAll('.ship-card').forEach(c => {
        const uid = c.dataset.uid;
        c.addEventListener('click', () => {
          if (st.fleet[fleetIdx].includes(uid)) {
            openShipDetail(uid, render);
          } else {
            if (st.fleet[fleetIdx].length >= MAX) { UI.toast('舰队已满！'); return; }
            if (st.repairs.some(r => r && r.ship === uid)) { UI.toast('入渠中的舰娘无法编入'); return; }
            if (st.expeditions[fleetIdx]) { UI.toast('远征中的舰队不能变更编成！'); return; }
            st.fleet[fleetIdx].push(uid);
            Game.save();
            render();
          }
        });
      });
    }
    render();
  }

  function pickShipFor(fleetIdx, slotIdx, onDone) {
    const st = Game.state;
    const others = Object.values(st.ships).filter(s => !st.fleet[fleetIdx].includes(s.uid));
    const html = `
      <span class="modal-close" data-close>×</span>
      <h3>选择舰娘编入第${fleetIdx}舰队</h3>
      <div class="flex" style="gap:8px">
        ${others.map(s => `<div style="width:12%">${UI.shipCard(s.uid)}</div>`).join('') || '<span class="dim">没有可用舰娘</span>'}
      </div>`;
    const m = UI.modal(html, onDone);
    m.root.querySelectorAll('.ship-card').forEach(c => {
      c.addEventListener('click', () => {
        const uid = c.dataset.uid;
        if (st.repairs.some(r => r && r.ship === uid)) { UI.toast('入渠中的舰娘无法编入'); return; }
        st.fleet[fleetIdx][slotIdx] = uid;
        Game.save();
        m.close(); onDone();
      });
    });
  }

  return { home, formation, openShipDetail };
})();

UI.Screens.home = Homeport.home;
UI.Screens.formation = Homeport.formation;
