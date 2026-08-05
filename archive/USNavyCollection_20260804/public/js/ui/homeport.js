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
    const capOf = modInfo ? modInfo.gains : {};
    const modMax = !Object.keys(capOf).length;
    const supply = Math.round(s.supply.fuel * 100);

    const statHtml = stNames.map(([k, zh]) => {
      const base = def.stats[stNames.findIndex(x => x[0] === k)];
      const mod = s.modern[k] || 0;
      const capLeft = capOf[k];
      const modTxt = mod ? `<span style="color:#7fe07f">(+${mod})</span>` : '';
      const capTxt = capLeft ? `<span class="dim"> [可改修+${capLeft}]</span>` : '';
      return `<div class="stat-item"><div class="label">${zh}</div><div class="value num">${stats[k]} ${modTxt}${capTxt}</div></div>`;
    }).join('');

    const eqHtml = def.slots.map((sl, i) => {
      const euid = s.equipped[i];
      const eq = euid ? st.equipment[euid] : null;
      const ed = eq ? EquipmentData[eq.id] : null;
      const types = sl.types.map(t => ['小主炮', '中主炮', '大主炮', '副炮', '鱼雷', '舰战', '舰攻', '舰爆', '水侦/水爆', '电探', '高角炮', '机枪', '声呐/爆雷', '设备'][t - 1]).join('/');
      const size = def.sizes ? def.sizes[i] : 24;
      return `<div class="eq-slot" data-slot="${i}">
        ${ed ? `<b>${Util.esc(ed.zh)}</b> ${UI.starHtml(eq)}` : `<span class="dim">空槽</span>`}
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
            ${modMax ? '<span class="dim">改修MAX</span>' : ''}
            <button class="btn btn-red btn-sm" data-act="scrap">解体</button>
          </div>
          <div class="hint">近代化改修（用多余舰娘强化属性）请前往「工厂 → 近代化改修」。</div>
          <div class="hint">${Util.esc(def.line || '')}</div>
        </div>
      </div>
    `, () => back());

    m.root.querySelector('[data-act="supply"]').addEventListener('click', () => {
      const r = Logistics.supplyShip(uid);
      if (!r.ok) { UI.toast(r.msg); return; }
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
      const hasMod = ['fp', 'tp', 'aa', 'arm'].some(k => (s.modern[k] || 0) > 0);
      if (hasMod && !confirm('改造后 火力/雷装/对空/装甲 的近代化改修值将不被继承（运/对潜/耐久可继承）。确定改造？')) return;
      const r = Progression.remodel(uid);
      if (!r.ok) { UI.toast(r.msg); return; }
      UI.toast(`${def.zh} 改造完成！`);
      Game.save();
      m.close(); back();
    });
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
          return `<div class="eq-slot" data-eq="${eq.uid}"><b>${Util.esc(ed.zh)}</b> ${UI.starHtml(eq)} <span class="dim">(${EQUIP_CAT_ZH[ed.cat] || ed.cat}) ${stx}</span></div>`;
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

  /* 近代化改修（参照 wiki：多素材合成/奖励偏斜/素材属性表/上限） */
  function openModernize(targetUid, onDone) {
    const st = Game.state;
    const modInfo = Progression.modernizeInfo(targetUid);
    const caps = modInfo ? modInfo.gains : {};
    const zh = { fp: '火力', tp: '雷装', aa: '对空', arm: '装甲', hp: '耐久', asw: '对潜', lck: '运' };
    const selected = [];
    const mats = Object.values(st.ships)
      .filter(x => x.uid !== targetUid)
      .filter(x => !x.locked && !st.repairs.some(r => r && r.ship === x.uid));
    let m = null;

    /* 素材属性值文字（参照 wiki 素材列表） */
    function matValText(uid) {
      const v = Progression.materialValue(uid);
      const parts = Object.keys(v).map(k => `${zh[k]}+${v[k]}`);
      return parts.length ? parts.join(' ') : '无素材属性';
    }

    function previewHtml() {
      const pv = selected.length ? Progression.modernizePreview(targetUid, selected) : null;
      if (!pv) return '<div class="hint">选择素材舰后显示预计上升量。</div>';
      if (!pv.ok) return `<div class="hint" style="color:#ff9a9a">${UI.esc(pv.msg)}</div>`;
      return `<table class="preview-table">
        <tr><th>属性</th><th>素材合计</th><th>奖励点</th><th>显示上升</th><th>偏斜约</th><th>剩余上限</th></tr>
        ${Object.keys(pv.shown).map(k => `<tr>
          <td>${zh[k]}</td><td>${pv.sum[k]}</td><td class="up">+${pv.bonus[k]}</td>
          <td class="up">+${pv.shown[k]}</td><td>+${pv.dev[k]}</td><td>${caps[k]}</td>
        </tr>`).join('')}
      </table>
      <div class="hint">奖励/偏斜按属性独立判定（约各50%）：奖励=显示值，偏斜≈一半。素材合计达到 +4/+9/+14/+19/+24 时奖励点额外 +1/+2/+3/+4/+5。</div>`;
    }

    function render() {
      const pv = selected.length ? Progression.modernizePreview(targetUid, selected) : null;
      const canStart = !!(pv && pv.ok);
      const html = `
        <span class="modal-close" data-close>×</span>
        <h3>近代化改修 —— ${UI.esc(UI.shipTitle(st.ships[targetUid]))}</h3>
        <div class="hint">剩余可改修：${Object.keys(caps).map(k => `${zh[k]} ${caps[k]}`).join(' / ') || '无（改修MAX）'}</div>
        <div class="section-title">选择素材舰（最多5艘，消耗 油30/弹30）</div>
        <div class="flex" style="gap:4px">
          ${mats.map(x => {
            const d = Game.shipDef(x);
            const on = selected.includes(x.uid);
            return `<div class="mat-card ${on ? 'selected' : ''}" data-mat="${x.uid}">
              <div><b>${UI.esc(d.zh)}</b> ${x.kai === 1 ? '改' : x.kai >= 2 ? '改二' : ''} <span class="dim">Lv.${x.lv}</span></div>
              <div class="mat-val">${UI.esc(matValText(x.uid))}</div>
            </div>`;
          }).join('') || '<span class="dim">没有可用的素材舰</span>'}
        </div>
        <div class="section-title">预计上升量</div>
        ${previewHtml()}
        <div class="btn-row">
          <button class="btn btn-gold" data-do="${canStart ? '1' : ''}" ${canStart ? '' : 'disabled'}>合成开始</button>
        </div>
        <div class="hint">素材舰将被解体（其装备一并销毁）。普通素材仅提升火力/雷装/对空/装甲；海防舰(DE)素材可额外提升耐久/对潜/运。改造后火力/雷装/对空/装甲的改修值不会继承。</div>`;
      if (!m) {
        m = UI.modal(html, onDone);
      } else {
        m.root.innerHTML = html;
      }
      wire();
    }

    function wire() {
      m.root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => m.close()));
      m.root.querySelectorAll('.mat-card').forEach(el => {
        el.addEventListener('click', () => {
          const uid = el.dataset.mat;
          const i = selected.indexOf(uid);
          if (i >= 0) selected.splice(i, 1);
          else {
            if (selected.length >= 5) { UI.toast('最多选择5艘素材舰'); return; }
            selected.push(uid);
          }
          render();
        });
      });
      const doBtn = m.root.querySelector('[data-do]');
      if (doBtn) doBtn.addEventListener('click', () => {
        const r = Progression.modernize(targetUid, selected);
        if (!r.ok) { UI.toast(r.msg); return; }
        const desc = Object.keys(r.gains).map(k => `${zh[k]}+${r.gains[k]}`).join(' ');
        UI.toast(`近代化改修完成！${desc ? '上升：' + desc : '（偏斜）'}`);
        Game.save();
        m.close(); onDone();
      });
    }
    render();
  }

  /* ============ 母港（秘书舰 + 舰队 + 状态） ============ */
  function home(root) {
    const st = Game.state;
    const fleet = st.fleet[1];
    const secUid = fleet[0];
    const sec = secUid ? st.ships[secUid] : null;
    const secDef = sec ? Game.shipDef(sec) : null;
    const claimable = QUESTS.filter(q => Progression.canClaim(q.id)).length;
    const ex1Info = st.expeditions[1];
    const ex2Info = st.expeditions[2];
    const exActive = [ex1Info, ex2Info].filter(Boolean);
    const repCount = st.repairs.filter(r => r).length;
    const repairInfo = st.repairs.map((r, i) => r ? `船坞${i + 1}:${Game.shipDef(st.ships[r.ship]).zh}` : `船坞${i + 1}:空`).join(' · ');

    root.innerHTML = `
      ${secDef ? `
      <div class="panel secretary-panel">
        ${UI.portraitImg(sec.id, 'secretary-ph')}
        <div class="secretary-info">
          <h3>${UI.esc(secDef.zh)} <span class="dim">${UI.esc(secDef.en)}</span> <span class="dim">${SHIP_TYPE_ZH[secDef.type]}</span></h3>
          <div class="dim">秘书舰 · Lv.${sec.lv}${sec.kai === 1 ? '（改）' : sec.kai >= 2 ? '（改二）' : ''} ${UI.stateBadges(secUid)}</div>
          <div class="secretary-line">“${Util.esc(secDef.line || '今天的海，也很平静呢。')}”</div>
          <div class="btn-row">
            <button class="btn btn-gold" data-go="sortie">出击</button>
            <button class="btn" data-go="formation">编成</button>
          </div>
        </div>
      </div>` : ''}

      <div class="panel">
        <h3>第一舰队 <span class="dim">（点击舰娘查看详情；可快速补给）</span></h3>
        <div class="fleet-grid">
          ${Array.from({ length: 6 }, (_, i) => {
            const uid = fleet[i];
            if (!uid) return `<div class="fleet-slot-sm">空位 ${i + 1}</div>`;
            return `<div class="fleet-cell">
              ${UI.shipCard(uid, { fleetIdx: 1 })}
              <div class="card-actions">
                <button class="btn btn-sm btn-green" data-supply="${uid}">补给</button>
              </div>
            </div>`;
          }).join('')}
        </div>
        <div class="hint">舰队不满6艘？去「编成」界面编入更多舰娘。舰娘强化（近代化改修）请前往「工厂 → 近代化改修」。</div>
      </div>

      <div class="panel">
        <h3>司令部状态</h3>
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
        <div class="status-line">
          远征：${exActive.length ? exActive.map(e => `<span class="countdown" data-until="${e.end}">${Util.fmtTime(e.end - Date.now())}</span>`).join(' / ') + ' 进行中' : '空闲'}
          ｜ 入渠：${repCount} 艘（${repairInfo}）
          ｜ 改修资材：<span class="screw">${st.resources.screws || 0}</span>
        </div>
        <div class="hint">资源每30秒自然恢复（油弹钢+3 铝+1，上限=(提督等级+3)×250，参照 kcwiki「资源」），远征与任务是主要收入来源。日常任务「装备的改修强化」每天+1改修资材。调试模式可在顶栏开启「无限资源」。</div>
      </div>`;

    root.querySelectorAll('.ship-card').forEach(c => {
      c.addEventListener('click', () => openShipDetail(c.dataset.uid, () => home(root)));
    });
    root.querySelectorAll('[data-supply]').forEach(b => {
      b.addEventListener('click', () => {
        const r = Logistics.supplyShip(b.dataset.supply);
        if (!r.ok) { UI.toast(r.msg); return; }
        UI.toast(`补给完成（${Game.shipDef(st.ships[b.dataset.supply]).zh}）`);
        Game.save();
        home(root);
      });
    });
    root.querySelectorAll('[data-go]').forEach(b => {
      b.addEventListener('click', () => UI.go(b.dataset.go));
    });
    UI.setTick(() => {
      root.querySelectorAll('[data-until]').forEach(el => {
        const end = parseInt(el.dataset.until, 10) || 0;
        el.textContent = end - Date.now() > 0 ? Util.fmtTime(end - Date.now()) : '完成！';
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
              return `<div class="fleet-slot ${uid ? 'filled' : ''}" data-slot="${i}" data-fleet="${fleetIdx}">
                ${uid ? UI.shipCard(uid, { fleetIdx }) : `空位 ${i + 1}`}
              </div>`;
            }).join('')}
          </div>
          <div class="section-title">母港舰娘（拖拽图标编入舰队；舰队内拖拽可调整/换位；拖回母港区脱出舰队）</div>
          <div class="flex roster-area" data-drop="roster">
            ${allShips.map(s => `<div style="width:10%">${UI.shipCard(s.uid)}</div>`).join('') ||
            '<div class="hint">没有其他舰娘，去工厂建造吧！</div>'}
          </div>
        </div>`;

      root.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => formation(root, parseInt(b.dataset.f, 10))));

      /* ---- 点击：空位选舰 / 舰队内详情 / 母港快捷编入 ---- */
      root.querySelectorAll('.fleet-slot:not(.filled)').forEach(el => {
        el.addEventListener('click', () => pickShipFor(fleetIdx, parseInt(el.dataset.slot, 10), render));
      });
      root.querySelectorAll('.ship-card').forEach(c => {
        const uid = c.dataset.uid;
        c.addEventListener('click', () => {
          if (st.fleet[fleetIdx].includes(uid)) {
            openShipDetail(uid, render);
          } else if (tryAdd(uid, null)) {
            render();
          }
        });
      });

      /* ---- 拖拽 ---- */
      root.querySelectorAll('.ship-card').forEach(card => {
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
      root.querySelectorAll('.fleet-slot').forEach(slot => {
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
          if (uid && st.ships[uid]) dropOnSlot(uid, parseInt(slot.dataset.slot, 10));
        });
      });
      const roster = root.querySelector('[data-drop="roster"]');
      roster.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        roster.classList.add('drag-over');
      });
      roster.addEventListener('dragleave', () => roster.classList.remove('drag-over'));
      roster.addEventListener('drop', e => {
        e.preventDefault();
        roster.classList.remove('drag-over');
        const uid = e.dataTransfer.getData('text/plain');
        if (!uid || !st.fleet[fleetIdx].includes(uid)) return;
        if (st.expeditions[fleetIdx]) { UI.toast('远征中的舰队不能变更编成！'); return; }
        st.fleet[fleetIdx] = st.fleet[fleetIdx].filter(x => x !== uid);
        Game.save();
        UI.toast('已脱出舰队');
        render();
      });
    }

    /* 母港舰娘 → 编入（点击或拖入），通过则保存并返回 true */
    function tryAdd(uid, slotIdx) {
      if (st.repairs.some(r => r && r.ship === uid)) { UI.toast('入渠中的舰娘无法编入'); return false; }
      if (st.expeditions[fleetIdx]) { UI.toast('远征中的舰队不能变更编成！'); return false; }
      if (Game.fleetHasName(fleetIdx, st.ships[uid].id)) { UI.toast('舰队中已有同名舰娘，无法编入'); return false; }
      const fleet = st.fleet[fleetIdx];
      if (fleet.includes(uid)) return false;
      if (slotIdx != null && slotIdx < MAX && fleet.length > slotIdx) { UI.toast('该位置已有舰娘，可点击其他空位'); return false; }
      if (slotIdx != null && slotIdx < MAX) {
        fleet.splice(slotIdx, 0, uid);
      } else {
        if (fleet.length >= MAX) { UI.toast('舰队已满！'); return false; }
        fleet.push(uid);
      }
      Game.save();
      return true;
    }

    /* 拖放到舰队槽位：母港→槽位=编入；舰队内→槽位=移动/换位 */
    function dropOnSlot(uid, idx) {
      const fleet = st.fleet[fleetIdx];
      if (st.repairs.some(r => r && r.ship === uid)) { UI.toast('入渠中的舰娘无法编入'); return; }
      if (st.expeditions[fleetIdx]) { UI.toast('远征中的舰队不能变更编成！'); return; }
      if (fleet.includes(uid)) {
        const from = fleet.indexOf(uid);
        if (from === idx) return;
        if (fleet[idx] === undefined) {
          fleet.splice(from, 1);
          fleet.splice(from < idx ? idx - 1 : idx, 0, uid);
        } else {
          fleet[from] = fleet[idx];
          fleet[idx] = uid;
        }
      } else {
        if (Game.fleetHasName(fleetIdx, st.ships[uid].id)) { UI.toast('舰队中已有同名舰娘，无法编入'); return; }
        if (fleet[idx] === undefined) fleet.splice(idx, 0, uid);
        else fleet[idx] = uid;
      }
      Game.save();
      render();
    }

    render();
  }

  function pickShipFor(fleetIdx, slotIdx, onDone) {
    const st = Game.state;
    const inOther = st.fleet[fleetIdx === 1 ? 2 : 1];
    const others = Object.values(st.ships).filter(s => !st.fleet[fleetIdx].includes(s.uid) &&
      !inOther.includes(s.uid) && !Game.fleetHasName(fleetIdx, s.id));
    const html = `
      <span class="modal-close" data-close>×</span>
      <h3>选择舰娘编入第${fleetIdx}舰队</h3>
      <div class="flex" style="gap:8px">
        ${others.map(s => `<div style="width:12%">${UI.shipCard(s.uid)}</div>`).join('') || '<span class="dim">没有可用舰娘</span>'}
      </div>
      <div class="hint">同名舰娘不可编入同一舰队。</div>`;
    const m = UI.modal(html, onDone);
    m.root.querySelectorAll('.ship-card').forEach(c => {
      c.addEventListener('click', () => {
        const uid = c.dataset.uid;
        if (st.repairs.some(r => r && r.ship === uid)) { UI.toast('入渠中的舰娘无法编入'); return; }
        if (st.expeditions[fleetIdx]) { UI.toast('远征中的舰队不能变更编成！'); return; }
        if (Game.fleetHasName(fleetIdx, st.ships[uid].id)) { UI.toast('舰队中已有同名舰娘，无法编入'); return; }
        st.fleet[fleetIdx][slotIdx] = uid;
        Game.save();
        m.close(); onDone();
      });
    });
  }

  return { home, formation, openShipDetail, openModernize };
})();

UI.Screens.home = Homeport.home;
UI.Screens.formation = Homeport.formation;
