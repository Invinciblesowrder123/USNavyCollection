'use strict';
/* ============================================================
 * 母港 / 编成 / 舰娘详情（装备/改造/近代化/解体）
 * ============================================================ */

const Homeport = (() => {

  /* 舰船列表排序（key: 'lv' | 'time'，dir: 1 升序 / -1 降序） */
  function shipCmp(key, dir) {
    return (a, b) => {
      let r;
      if (key === 'time') {
        const ta = a.obtainedAt || parseInt(a.uid.slice(1), 10);
        const tb = b.obtainedAt || parseInt(b.uid.slice(1), 10);
        r = ta - tb;
      } else {
        r = a.lv - b.lv;
      }
      if (r === 0) r = parseInt(a.uid.slice(1), 10) - parseInt(b.uid.slice(1), 10);
      return r * dir;
    };
  }

  /* 编成-母港列表：舰种筛选与排序（会话内保留，切换舰队/离开页面不重置） */
  let rosterType = 'ALL';
  let rosterSort = { key: 'lv', dir: -1 };
  /* 近代化改修-素材舰列表：舰种筛选与排序（会话内保留） */
  let matType = 'ALL';
  let matSort = { key: 'lv', dir: -1 };

  /* ============ 舰娘详情模态 ============ */
  function openShipDetail(uid, back = () => {}) {
    const st = Game.state;
    const s = st.ships[uid];
    if (!s) return;
    const stNames = [['hp', '耐久'], ['fp', '火力'], ['tp', '雷装'], ['aa', '对空'], ['arm', '装甲'], ['evd', '回避'], ['asw', '对潜'], ['los', '索敌'], ['lck', '幸运']];
    let m = null;

    function detailHtml() {
      const def = Game.shipDef(s);
      const stats = Game.shipStats(uid);
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
        const types = (sl.types || sl).map(t => ['小主炮', '中主炮', '大主炮', '副炮', '鱼雷', '舰战', '舰攻', '舰爆', '水侦/水爆', '电探', '高角炮', '机枪', '声呐/爆雷', '设备'][t - 1]).join('/');
        const size = def.sizes ? def.sizes[i] : 24;
        return `<div class="eq-slot" data-slot="${i}">
          ${ed ? `<b>${Util.esc(ed.zh)}</b> ${UI.starHtml(eq)}` : `<span class="dim">空槽</span>`}
          <span class="dim">[${types}${def.sizes ? ` · ${size}机` : ''}]</span>
        </div>`;
      }).join('');

      return `
        <span class="modal-close" data-close>×</span>
        <h3>${UI.shipNameHtml(def)} ${UI.rarityStars(def.rarity)} <span class="dim">${UI.esc(def.en)}</span> <span class="dim">${SHIP_TYPE_ZH[def.type]}</span></h3>
        <div class="flex">
          <div style="width:170px">${UI.portraitImg(s.id, 'portrait', '', s.kai)}
            <div class="text-center dim">Lv.${s.lv} ${s.kai === 1 ? '改' : s.kai >= 2 ? '改二' : ''} · 补给${supply}%</div>
          </div>
          <div class="grow">
            <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">${statHtml}</div>
            <div class="section-title">装备 <span class="dim">（点击装备槽更换/卸下）</span></div>
            <div>${eqHtml}</div>
            <div class="section-title">操作</div>
            <div class="btn-row">
              <button class="btn btn-green btn-sm" data-act="supply">补给</button>
              <button class="btn btn-sm" data-act="lock">${s.locked ? '解锁' : '锁定'}</button>
              ${([1, 2, 3, 4].some(f => (st.fleet[f] || []).includes(uid))) ? `<button class="btn btn-sm" data-act="remove">移出舰队</button>` : ''}
              ${rmInfo ? `<button class="btn btn-gold btn-sm" data-act="remodel">改造(Lv.${rmInfo.lvNeed}，${rmInfo.cost.fuel}油/${rmInfo.cost.ammo}弹/${rmInfo.cost.steel}钢)</button>` : ''}
              ${!modMax ? `<button class="btn btn-gold btn-sm" data-act="modernize">近代化改修</button>` : ''}
              ${modMax ? '<span class="dim">改修MAX</span>' : ''}
              <button class="btn btn-red btn-sm" data-act="scrap">解体</button>
            </div>
            <div class="hint">近代化改修：用多余的舰娘强化属性，消耗 油30/弹30，素材舰将被解体（详细规则见「工厂 → 近代化改修」）。</div>
            <div class="hint">${Util.esc(def.line || '')}</div>
          </div>
        </div>`;
    }

    function wire() {
      /* refresh() 重建 DOM 后需重新绑定关闭按钮（×），否则详情页无法关闭 */
      m.root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => m.close()));
      m.root.querySelector('[data-act="supply"]').addEventListener('click', () => {
        const r = Logistics.supplyShip(uid);
        if (!r.ok) { UI.toast(r.msg); return; }
        UI.toast(`${Game.shipDef(s).zh} 补给完毕`);
        Game.save(); refresh();
      });
      m.root.querySelector('[data-act="lock"]').addEventListener('click', () => {
        s.locked = !s.locked;
        Game.save(); refresh();
      });
      const removeBtn = m.root.querySelector('[data-act="remove"]');
      if (removeBtn) removeBtn.addEventListener('click', () => {
        for (const f in st.fleet) st.fleet[f] = st.fleet[f].filter(x => x !== uid);
        Game.save();
        UI.toast(`${Game.shipDef(s).zh} 已移出舰队`);
        m.close();
      });
      const rmBtn = m.root.querySelector('[data-act="remodel"]');
      if (rmBtn) rmBtn.addEventListener('click', () => {
        const hasMod = ['fp', 'tp', 'aa', 'arm'].some(k => (s.modern[k] || 0) > 0);
        if (hasMod && !confirm('改造后 火力/雷装/对空/装甲 的近代化改修值将不被继承（运/对潜/耐久可继承）。确定改造？')) return;
        const r = Progression.remodel(uid);
        if (!r.ok) { UI.toast(r.msg); return; }
        UI.toast(`${Game.shipDef(s).zh} 改造完成！`);
        Game.save(); refresh();
      });
      m.root.querySelector('[data-act="scrap"]').addEventListener('click', () => {
        if (!confirm(`确定解体 ${Game.shipDef(s).zh}？\n（解体后其装备一并销毁）`)) return;
        Game.destroyShip(uid);
        Game.save();
        UI.toast(`${Game.shipDef(s).zh} 已解体`);
        m.close();
      });
      const modBtn = m.root.querySelector('[data-act="modernize"]');
      if (modBtn) modBtn.addEventListener('click', () => openModernize(uid, refresh));
      /* 装备槽点击 → 装备选择（次级浮窗，关闭后仍停留在详情页） */
      m.root.querySelectorAll('.eq-slot').forEach(el => {
        el.addEventListener('click', () => openEquipPicker(uid, parseInt(el.dataset.slot, 10), refresh));
      });
    }

    function refresh() {
      m.root.innerHTML = detailHtml();
      wire();
    }

    m = UI.modal(detailHtml(), () => back());
    wire();
  }

  /* 装备选择器（次级浮窗：叠在舰艇详情之上，按装备种类分组单列；关闭不影响详情页） */
  function openEquipPicker(uid, slotIdx, onDone) {
    const st = Game.state;
    const s = st.ships[uid];
    const def = Game.shipDef(s);
    const slot = def.slots[slotIdx];
    const cur = s.equipped[slotIdx] ? st.equipment[s.equipped[slotIdx]] : null;
    const types = (slot.types || slot).map(t => ['小主炮', '中主炮', '大主炮', '副炮', '鱼雷', '舰战', '舰攻', '舰爆', '水侦/水爆', '电探', '高角炮', '机枪', '声呐/爆雷', '设备'][t - 1]).join('/');
    const inv = Object.values(st.equipment).filter(eq => {
      const ed = EquipmentData[eq.id];
      if (!ed) return false;
      const used = Object.values(st.ships).some(x => x.equipped.includes(eq.uid));
      return !used && (slot.types || slot).includes(ed.slot);
    });
    /* 按装备种类分组 */
    const groups = {};
    for (const eq of inv) {
      const cat = EquipmentData[eq.id].cat;
      (groups[cat] = groups[cat] || []).push(eq);
    }
    const catOrder = ['小主炮', '中主炮', '大主炮', '副炮', '鱼雷', '舰战', '舰攻', '舰爆', '水侦', '水爆', '对空电探', '对水电探', '高角炮', '机枪', '声呐', '爆雷', '穿甲弹', '设备'];
    const groupHtml = Object.keys(groups).sort((a, b) => catOrder.indexOf(a) - catOrder.indexOf(b)).map(cat => `
      <div class="eq-cat-title">${EQUIP_CAT_ZH[cat] || cat}（${groups[cat].length}）</div>
      ${groups[cat].map(eq => {
        const ed = EquipmentData[eq.id];
        const stx = Object.entries(ed.stat).map(([k, v]) => `${EQUIP_STAT_ZH[k]}${v > 0 ? '+' : ''}${v}`).join(' ');
        return `<div class="eq-pick-item" data-eq="${eq.uid}">
          <span><b>${UI.esc(ed.zh)}</b> ${UI.starHtml(eq)}</span>
          <span class="eq-stat">${stx}</span>
        </div>`;
      }).join('')}`).join('');

    const html = `
      <span class="modal-close" data-close>×</span>
      <h3>更换装备 <span class="dim">${UI.esc(UI.shipTitle(s))} · 槽位 ${slotIdx + 1} [${types}]</span></h3>
      <div class="hint">当前装备：${cur ? UI.esc(EquipmentData[cur.id].zh) : '<span class="dim">（空）</span>'} ｜ 点击下方装备替换；「卸下」将装备放回仓库。</div>
      <div class="eq-picker">${groupHtml || '<div class="hint">没有可用的同类装备。去工厂开发吧！</div>'}</div>
      <div class="btn-row"><button class="btn btn-red btn-sm" data-clear>卸下当前装备</button></div>`;

    const m = UI.subModal(html);
    m.root.querySelectorAll('[data-eq]').forEach(el => {
      el.addEventListener('click', () => {
        const euid = el.dataset.eq;
        s.equipped[slotIdx] = euid;
        Game.save();
        UI.toast('装备更换完成');
        m.close();
        if (onDone) onDone();
      });
    });
    const clearBtn = m.root.querySelector('[data-clear]');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      if (s.equipped[slotIdx]) delete s.equipped[slotIdx];
      Game.save();
      UI.toast('已卸下装备');
      m.close();
      if (onDone) onDone();
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
      const list = mats
        .filter(x => matType === 'ALL' || Game.shipDef(x).type === matType)
        .sort(shipCmp(matSort.key, matSort.dir));
      const typeNames = Object.keys(SHIP_TYPE_ZH).filter(t => mats.some(x => Game.shipDef(x).type === t));
      const sortOpts = [
        ['lv:-1', '等级 高→低'], ['lv:1', '等级 低→高'],
        ['time:-1', '入手 新→旧'], ['time:1', '入手 旧→新']
      ];
      const html = `
        <span class="modal-close" data-close>×</span>
        <h3>近代化改修 —— ${UI.esc(UI.shipTitle(st.ships[targetUid]))}</h3>
        <div class="hint">剩余可改修：${Object.keys(caps).map(k => `${zh[k]} ${caps[k]}`).join(' / ') || '无（改修MAX）'}</div>
        <div class="section-title">选择素材舰（最多5艘，消耗 油30/弹30）</div>
        <div class="roster-tools">
          <span class="dim">舰种</span>
          ${['ALL', ...typeNames].map(t =>
            `<span class="preset-recipe ${matType === t ? 'active' : ''}" data-mtype="${t}">${t === 'ALL' ? '全部' : SHIP_TYPE_ZH[t]}</span>`
          ).join('')}
          <span class="dim" style="margin-left:14px">排序</span>
          ${sortOpts.map(([key, label]) =>
            `<span class="preset-recipe ${matSort.key + ':' + matSort.dir === key ? 'active' : ''}" data-msort="${key}">${label}</span>`
          ).join('')}
          <span class="dim">共 ${list.length} 艘</span>
        </div>
        <div class="flex" style="gap:4px">
          ${list.map(x => {
            const d = Game.shipDef(x);
            const on = selected.includes(x.uid);
            return `<div class="mat-card ${on ? 'selected' : ''}" data-mat="${x.uid}">
              <div><b>${UI.shipNameHtml(d)}</b> ${x.kai === 1 ? '改' : x.kai >= 2 ? '改二' : ''} <span class="dim">Lv.${x.lv}</span></div>
              <div class="mat-val">${UI.esc(matValText(x.uid))}</div>
            </div>`;
          }).join('') || `<span class="dim">${matType !== 'ALL' ? '没有符合条件的素材舰' : '没有可用的素材舰'}</span>`}
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
      /* 素材舰筛选 / 排序 */
      m.root.querySelectorAll('[data-mtype]').forEach(el =>
        el.addEventListener('click', () => { matType = el.dataset.mtype; render(); }));
      m.root.querySelectorAll('[data-msort]').forEach(el =>
        el.addEventListener('click', () => {
          const [key, dir] = el.dataset.msort.split(':');
          matSort = { key, dir: parseInt(dir, 10) };
          render();
        }));
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
    const exActive = Game.unlockedFleets().map(f => st.expeditions[f]).filter(Boolean);
    const repCount = st.repairs.filter(r => r).length;
    const repairInfo = st.repairs.map((r, i) => r ? `船坞${i + 1}:${Game.shipDef(st.ships[r.ship]).zh}` : `船坞${i + 1}:空`).join(' · ');

    root.className = 'home-screen';
    root.innerHTML = `
      ${secDef ? `
      <div class="panel panel-deco secretary-panel">
        <div class="sec-frame">
          ${UI.portraitImg(sec.id, 'portrait', '', sec.kai)}
          <div class="sec-type-badge">${SHIP_TYPE_ZH[secDef.type]}</div>
        </div>
        <div class="secretary-info">
          <div class="sec-plaque">${UI.shipNameHtml(secDef)}<span>${UI.esc(secDef.en)}</span></div>
          <div class="sec-sub">秘书舰 · Lv.${sec.lv}${sec.kai === 1 ? '（改）' : sec.kai >= 2 ? '（改二）' : ''}<span class="sec-badges">${UI.stateBadges(secUid)}</span></div>
          <div class="secretary-line">“${Util.esc(secDef.line || '今天的海，也很平静呢。')}”</div>
          <div class="btn-row secretary-actions">
            <button class="btn btn-gold" data-go="sortie">⚔ 出击</button>
            <button class="btn" data-go="formation">⚓ 编成</button>
          </div>
        </div>
      </div>` : ''}

      <div class="panel panel-deco fleet-panel">
        <h3 class="panel-title"><span class="title-ico">⚓</span>第一舰队<span class="title-sub">（点击舰娘查看详情 · 可快速补给）</span><span class="title-line"></span></h3>
        <div class="fleet-grid">
          ${Array.from({ length: 6 }, (_, i) => {
            const uid = fleet[i];
            if (!uid) return `<div class="fleet-slot-sm"><span class="empty-ico">◌</span><span>空位 ${i + 1}</span></div>`;
            return `<div class="fleet-cell">
              <div class="fleet-pos">${i + 1}</div>
              ${UI.shipCard(uid, { fleetIdx: 1 })}
              <div class="card-actions">
                <button class="btn btn-sm btn-green" data-supply="${uid}">⛽ 补给</button>
              </div>
            </div>`;
          }).join('')}
        </div>
        <div class="hint">舰队不满6艘？去「编成」界面编入更多舰娘。舰娘强化（近代化改修）请前往「工厂 → 近代化改修」。</div>
      </div>

      <div class="panel panel-deco hq-panel">
        <h3 class="panel-title"><span class="title-ico">🏛</span>司令部状态<span class="title-line"></span></h3>
        <div class="stat-grid hq-stats">
          <div class="stat-item"><div class="label">👑 提督等级</div><div class="value num">Lv.${st.admiral.level}</div></div>
          <div class="stat-item"><div class="label">🎖 提督头衔</div><div class="value num" style="color:var(--gold)">${Game.admiralTitle(st.admiral.level)}</div></div>
          <div class="stat-item"><div class="label">🔭 舰队索敌</div><div class="value num">${Game.fleetLos(1)}</div></div>
          <div class="stat-item"><div class="label">⚔ 总出击</div><div class="value num">${st.stats.sortie}</div></div>
          <div class="stat-item"><div class="label">🏆 总胜利</div><div class="value num">${st.stats.win}</div></div>
          <div class="stat-item"><div class="label">💥 击沉敌舰</div><div class="value num">${st.stats.sink}</div></div>
          <div class="stat-item"><div class="label">🚢 远征完成</div><div class="value num">${st.stats.expedition}</div></div>
          <div class="stat-item"><div class="label">🥊 演习次数</div><div class="value num">${st.stats.practice}</div></div>
          <div class="stat-item"><div class="label">📋 可领取任务</div><div class="value num" style="color:${claimable ? 'var(--gold)' : ''}">${claimable}</div></div>
        </div>
        <div class="status-line">
          <span class="status-chip">🚢 远征：${exActive.length ? exActive.map(e => `<span class="countdown" data-until="${e.end}">${Util.fmtTime(e.end - Date.now())}</span>`).join(' / ') + ' 进行中' : '<span class="dim">空闲</span>'}</span>
          <span class="status-chip" title="${Util.esc(repairInfo)}">🔧 入渠：${repCount} 艘</span>
          <span class="status-chip">🔩 改修资材：<span class="screw">${st.resources.screws || 0}</span></span>
          <span class="status-chip">💡 开发资材：<span class="devmat">${st.resources.devMats || 0}</span></span>
          <span class="status-chip">⚓ 舰队：${[1, 2, 3, 4].map(f => `第${f}队${Game.isFleetUnlocked(f) ? '✓' : '🔒'}`).join(' ')}</span>
        </div>
        <div class="hint">资源每30秒自然恢复（油弹钢+3 铝+1，上限=(提督等级+3)×250，参照 kcwiki「资源」），远征与任务是主要收入来源。日常任务「装备开发3次」每天+1开发资材、日常任务「装备的改修强化」每天+1改修资材。管理员可在顶栏开启「测试模式」（无限资源/瞬间建造/瞬间入渠）。</div>
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
  /* 舰队解锁任务速查（用于锁定态提示） */
  const FLEET_TAB_ZH = { 1: '第一舰队（出击）', 2: '第二舰队（远征）', 3: '第三舰队（远征）', 4: '第四舰队（远征）' };
  function unlockQuestOf(fleetIdx) {
    return QUESTS.find(q => q.reward && q.reward.unlockFleet === fleetIdx);
  }
  function formation(root, arg) {
    const st = Game.state;
    let fleetIdx = [1, 2, 3, 4].includes(arg) ? arg : 1;
    const MAX = 6;

    function render() {
      const fleet = st.fleet[fleetIdx];
      const unlocked = Game.isFleetUnlocked(fleetIdx);

      if (!unlocked) {
        const uq = unlockQuestOf(fleetIdx);
        root.innerHTML = `
          <div class="tabs">
            ${[1, 2, 3, 4].map(f => `
              <button class="${fleetIdx === f ? 'active' : ''}" data-f="${f}">${FLEET_TAB_ZH[f]}${Game.isFleetUnlocked(f) ? '' : ' 🔒'}</button>
            `).join('')}
          </div>
          <div class="panel">
            <h3>编成 第${fleetIdx}舰队</h3>
            <div class="locked-fleet">
              <div class="lock-ico">🔒</div>
              <div class="hint" style="font-size:14px">第${fleetIdx}舰队尚未解锁！<br>完成任务「${UI.esc(uq ? uq.name : '')}」（${UI.esc(uq ? uq.desc : '')}）即可解锁。</div>
            </div>
          </div>`;
        root.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => formation(root, parseInt(b.dataset.f, 10))));
        return;
      }

      const inOther = [1, 2, 3, 4].filter(f => f !== fleetIdx).reduce((a, f) => a.concat(st.fleet[f] || []), []);
      const allShips = Object.values(st.ships).filter(s => !inOther.includes(s.uid));
      const list = allShips
        .filter(s => rosterType === 'ALL' || Game.shipDef(s).type === rosterType)
        .sort(shipCmp(rosterSort.key, rosterSort.dir));
      const typeNames = Object.keys(SHIP_TYPE_ZH)
        .filter(t => allShips.some(s => Game.shipDef(s).type === t));
      const los = Game.fleetLos(fleetIdx);
      const types = fleet.map(uid => SHIP_TYPE_ZH[Game.shipDef(st.ships[uid]).type]).join('、') || '无';
      const sortOpts = [
        ['lv:-1', '等级 高→低'], ['lv:1', '等级 低→高'],
        ['time:-1', '入手 新→旧'], ['time:1', '入手 旧→新']
      ];

      root.innerHTML = `
        <div class="tabs">
          ${[1, 2, 3, 4].map(f => `
            <button class="${fleetIdx === f ? 'active' : ''}" data-f="${f}">${FLEET_TAB_ZH[f]}${Game.isFleetUnlocked(f) ? '' : ' 🔒'}</button>
          `).join('')}
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
          <div class="roster-tools">
            <span class="dim">舰种</span>
            ${['ALL', ...typeNames].map(t =>
              `<span class="preset-recipe ${rosterType === t ? 'active' : ''}" data-type="${t}">${t === 'ALL' ? '全部' : SHIP_TYPE_ZH[t]}</span>`
            ).join('')}
            <span class="dim" style="margin-left:14px">排序</span>
            ${sortOpts.map(([key, label]) =>
              `<span class="preset-recipe ${rosterSort.key + ':' + rosterSort.dir === key ? 'active' : ''}" data-sort="${key}">${label}</span>`
            ).join('')}
            <span class="dim">共 ${list.length} 艘</span>
          </div>
          <div class="flex roster-area" data-drop="roster">
            ${list.map(s => `<div style="width:10%">${UI.shipCard(s.uid)}</div>`).join('') ||
            `<div class="hint">${rosterType !== 'ALL' ? '没有符合筛选条件的舰娘' : '没有其他舰娘，去工厂建造吧！'}</div>`}
          </div>
        </div>`;

      root.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => formation(root, parseInt(b.dataset.f, 10))));

      /* ---- 舰种筛选 / 排序 ---- */
      root.querySelectorAll('.roster-tools [data-type]').forEach(el =>
        el.addEventListener('click', () => { rosterType = el.dataset.type; render(); }));
      root.querySelectorAll('.roster-tools [data-sort]').forEach(el =>
        el.addEventListener('click', () => {
          const [key, dir] = el.dataset.sort.split(':');
          rosterSort = { key, dir: parseInt(dir, 10) };
          render();
        }));

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
    const inOther = [1, 2, 3, 4].filter(f => f !== fleetIdx).reduce((a, f) => a.concat(st.fleet[f] || []), []);
    const base = Object.values(st.ships).filter(s => !st.fleet[fleetIdx].includes(s.uid) &&
      !inOther.includes(s.uid) && !Game.fleetHasName(fleetIdx, s.id));
    let m = null;

    function render() {
      const list = base
        .filter(s => rosterType === 'ALL' || Game.shipDef(s).type === rosterType)
        .sort(shipCmp(rosterSort.key, rosterSort.dir));
      const typeNames = Object.keys(SHIP_TYPE_ZH).filter(t => base.some(s => Game.shipDef(s).type === t));
      const sortOpts = [
        ['lv:-1', '等级 高→低'], ['lv:1', '等级 低→高'],
        ['time:-1', '入手 新→旧'], ['time:1', '入手 旧→新']
      ];
      const html = `
        <span class="modal-close" data-close>×</span>
        <h3>选择舰娘编入第${fleetIdx}舰队</h3>
        <div class="roster-tools">
          <span class="dim">舰种</span>
          ${['ALL', ...typeNames].map(t =>
            `<span class="preset-recipe ${rosterType === t ? 'active' : ''}" data-picktype="${t}">${t === 'ALL' ? '全部' : SHIP_TYPE_ZH[t]}</span>`
          ).join('')}
          <span class="dim" style="margin-left:14px">排序</span>
          ${sortOpts.map(([key, label]) =>
            `<span class="preset-recipe ${rosterSort.key + ':' + rosterSort.dir === key ? 'active' : ''}" data-picksort="${key}">${label}</span>`
          ).join('')}
          <span class="dim">共 ${list.length} 艘</span>
        </div>
        <div class="flex" style="gap:8px">
          ${list.map(s => `<div style="width:12%">${UI.shipCard(s.uid)}</div>`).join('') ||
          `<span class="dim">${rosterType !== 'ALL' ? '没有符合条件的舰娘' : '没有可用舰娘'}</span>`}
        </div>
        <div class="hint">同名舰娘不可编入同一舰队。</div>`;
      if (!m) {
        m = UI.modal(html, onDone);
      } else {
        m.root.innerHTML = html;
      }
      wire();
    }

    function wire() {
      m.root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => m.close()));
      m.root.querySelectorAll('[data-picktype]').forEach(el =>
        el.addEventListener('click', () => { rosterType = el.dataset.picktype; render(); }));
      m.root.querySelectorAll('[data-picksort]').forEach(el =>
        el.addEventListener('click', () => {
          const [key, dir] = el.dataset.picksort.split(':');
          rosterSort = { key, dir: parseInt(dir, 10) };
          render();
        }));
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
  render();
}

  return { home, formation, openShipDetail, openModernize };
})();

UI.Screens.home = Homeport.home;
UI.Screens.formation = Homeport.formation;
