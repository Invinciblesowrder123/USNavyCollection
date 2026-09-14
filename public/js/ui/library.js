'use strict';
/* ============================================================
 * 图鉴：舰船与装备的收集率总览
 * - 数据来源 Game.libraryStats()（state.library，记录曾经获得过的 id）
 * - 解体或消耗后图鉴仍保留登录
 * - 支持按舰种/类别、稀有度筛选，可只看已获得
 * ============================================================ */

const Library = (() => {
  const TYPE_ORDER = ['BB', 'BBV', 'CV', 'CVB', 'CVL', 'CA', 'CAV', 'CL', 'CLT', 'DD', 'DE', 'SS', 'AV', 'AS'];

  let tab = 'ships';        // ships | equips
  let filterType = 'ALL';   // 舰种或装备类别
  let filterRarity = 0;     // 0=全部
  let onlyOwned = false;

  const st = () => Game.state;

  function ownedShips() { return st().library.ships || {}; }
  function ownedEquips() { return st().library.equips || {}; }

  function shipList() {
    const own = ownedShips();
    return Object.keys(ShipData)
      .map(id => Object.assign({ id }, ShipData[id]))
      .filter(d => {
        if (filterType !== 'ALL' && d.type !== filterType) return false;
        if (filterRarity && (d.rarity || 1) !== filterRarity) return false;
        if (onlyOwned && !own[d.id]) return false;
        return true;
      })
      .sort((a, b) => {
        const ta = TYPE_ORDER.indexOf(a.type), tb = TYPE_ORDER.indexOf(b.type);
        if (ta !== tb) return (ta < 0 ? 99 : ta) - (tb < 0 ? 99 : tb);
        if ((b.rarity || 1) !== (a.rarity || 1)) return (b.rarity || 1) - (a.rarity || 1);
        return String(a.id).localeCompare(String(b.id));
      });
  }

  function equipList() {
    const own = ownedEquips();
    return Object.keys(EquipmentData)
      .map(id => Object.assign({ id }, EquipmentData[id]))
      .filter(d => {
        if (filterType !== 'ALL' && d.cat !== filterType) return false;
        if (filterRarity && (d.r || 1) !== filterRarity) return false;
        if (onlyOwned && !own[d.id]) return false;
        return true;
      })
      .sort((a, b) => {
        const ca = String(a.cat || ''), cb = String(b.cat || '');
        if (ca !== cb) return ca.localeCompare(cb);
        if ((b.r || 1) !== (a.r || 1)) return (b.r || 1) - (a.r || 1);
        return String(a.id).localeCompare(String(b.id));
      });
  }

  function shipCard(d) {
    const got = !!ownedShips()[d.id];
    const rar = d.rarity || 1;
    if (!got) {
      return `<div class="lib-card locked clickable" data-libship="${UI.esc(d.id)}" title="点击查看获取途径">
        <div class="lib-thumb lib-empty">?</div>
        <div class="lib-name dim">？？？</div>
        <div class="lib-sub dim">${UI.esc(d.type || '')} 未登录</div>
      </div>`;
    }
    const owned = Object.keys(st().ships).filter(u => st().ships[u].id === d.id).length;
    return `<div class="lib-card clickable" data-libship="${UI.esc(d.id)}" title="点击查看详情与获取途径">
      <div class="lib-thumb">${UI.portraitImg(d.id, 'lib-portrait')}</div>
      <div class="lib-name">${UI.shipNameHtml(d.id)}</div>
      <div class="lib-sub">${UI.rarityStars(rar)}${owned > 1 ? ` ×${owned}` : ''}</div>
    </div>`;
  }

  function equipCard(d) {
    const got = !!ownedEquips()[d.id];
    if (!got) {
      return `<div class="lib-card locked clickable" data-libequip="${UI.esc(d.id)}" title="点击查看获取途径">
        <div class="lib-thumb lib-empty">?</div>
        <div class="lib-name dim">？？？</div>
        <div class="lib-sub dim">${UI.esc(d.cat || '')} 未登录</div>
      </div>`;
    }
    return `<div class="lib-card clickable" data-libequip="${UI.esc(d.id)}" title="点击查看详情与获取途径">
      <div class="lib-thumb lib-eq">${UI.eqRarityTag ? UI.eqRarityTag(d.r || 1) : ''}</div>
      <div class="lib-name">${UI.eqNameHtml ? UI.eqNameHtml(d.id) : UI.esc(d.zh || d.id)}</div>
      <div class="lib-sub dim">${UI.esc(d.cat || '')}</div>
    </div>`;
  }

  /* ---------- 获取途径（V0.305）：数据全部来自 Acquisition（与 sim 同一套判定） ---------- */
  function routesHtml(id, kind) {
    const rs = Acquisition.routes(id, kind);
    return `<div class="section-title">获取途径</div>
      <ul class="lib-routes">${rs.map(r => `<li class="${r.key === 'none' ? 'none' : ''}">${UI.esc(r.text)}</li>`).join('')}</ul>`;
  }

  /* 未获得的条目：名字仍是「？？？」（收集的悬念不破），但把"去哪拿"讲清楚 ——
   * 这正是图鉴从"纪念册"变成"出击决策索引"的那一步（规划方案 §3.2(1)）。 */
  function openLocked(id, kind) {
    const d = kind === 'ship' ? ShipData[id] : EquipmentData[id];
    if (!d) return;
    const title = kind === 'ship' ? `？？？　${UI.esc(SHIP_TYPE_ZH[d.type] || d.type)}` : `？？？　${UI.esc(d.cat || '')}`;
    const rar = kind === 'ship' ? (d.rarity || 1) : (d.r || 1);
    const html = `
      <span class="modal-close" data-close>×</span>
      <h3>${title} ${UI.rarityStars(rar)} <span class="dim">未登录</span></h3>
      <div class="hint">获得后自动登录图鉴，届时可查看完整名称与资料。</div>
      ${routesHtml(id, kind)}`;
    UI.modal(html, () => { });
  }

  /* 已获得但**当前没有实例**（已解体 / 已作素材）：只读面板（坑 #35：数据源不同）。
   * 属性用 def.stats 基础值 —— 没有实例就没有等级加成与近代化改修，不许假装有。 */
  function openCodexOnly(id, kind) {
    const d = kind === 'ship' ? ShipData[id] : EquipmentData[id];
    if (!d) return;
    let body;
    if (kind === 'ship') {
      const names = ['耐久', '火力', '雷装', '对空', '装甲', '回避', '对潜', '索敌', '幸运'];
      const stats = (d.stats || []).map((v, i) => `<div class="stat-item"><div class="label">${names[i]}</div><div class="value num">${v}</div></div>`).join('');
      const slots = (d.slots || []).map((sl, i) => {
        const types = (sl.types || sl).map(t => ['小主炮', '中主炮', '大主炮', '副炮', '鱼雷', '舰战', '舰攻', '舰爆', '水侦/水爆', '电探', '高角炮', '机枪', '声呐/爆雷', '设备'][t - 1]).join('/');
        const size = sl.size || 24;
        return `<div class="eq-slot"><span class="dim">${types}${d.sizes ? ` · ${size}机` : ''}</span></div>`;
      }).join('');
      body = `
        <div class="section-title">基础属性 <span class="dim">（无实例，未含等级成长与改修）</span></div>
        <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">${stats}</div>
        <div class="section-title">装备槽</div>
        <div>${slots}</div>
        <div class="section-title">舰史</div>
        <div class="ship-bio">${UI.esc(d.bio || d.line || '暂无舰史资料。')}</div>`;
    } else {
      const stat = Object.entries(d.stat || {}).map(([k, v]) => `${(EQUIP_STAT_ZH || {})[k] || k}${v > 0 ? '+' : ''}${v}`).join(' ');
      body = `
        <div class="section-title">性能</div>
        <div>${UI.esc(stat || '—')}</div>
        <div class="section-title">类别</div>
        <div>${UI.eqRarityTag(d.r || 1)} ${UI.esc((EQUIP_CAT_ZH || {})[d.cat] || d.cat || '')}${d.kai ? ` <span class="dim">可改修至 ★${d.kai}</span>` : ''}</div>`;
    }
    const html = `
      <span class="modal-close" data-close>×</span>
      <h3>${UI.esc(d.zh || id)} ${UI.rarityStars(kind === 'ship' ? (d.rarity || 1) : (d.r || 1))} <span class="dim">已登录 · 当前无该${kind === 'ship' ? '舰' : '装备'}实例</span></h3>
      ${body}
      <div class="hint">图鉴登录记录"曾经获得过"，解体/消耗后不会取消登录；实例不存在时只展示资料与获取途径。</div>
      ${routesHtml(id, kind)}`;
    UI.modal(html, () => { });
  }

  /* 图鉴条目点击总入口 */
  function openEntry(id, kind) {
    const owned = kind === 'ship' ? !!ownedShips()[id] : !!ownedEquips()[id];
    if (!owned) return openLocked(id, kind);
    if (kind === 'ship') {
      const uid = Object.keys(st().ships).find(u => st().ships[u].id === id);
      if (uid) return Homeport.openShipDetail(uid);    // 复用现成组件（属性/装备/舰历三合一）
    }
    return openCodexOnly(id, kind);
  }

  /* ---------- 收集率里程碑（V0.305） ---------- */
  function milestoneHtml() {
    const link = Progression.LIB_MILESTONES;
    const per = Progression.LIB_MILESTONE_MEDALS;
    const led = Progression.medalLedger().once;
    const s = Game.libraryStats();
    const line = (key, label) => {
      const tot = s[key].total, own = s[key].owned;
      const pct = tot ? own / tot * 100 : 0;
      const rows = link.map(m => {
        const got = !!led[`lib:${key}:${m}`];
        const ok = pct + 1e-9 >= m;
        return `<span class="ms-chip ${got ? 'got' : ok ? 'ready' : ''}" title="${ok ? '已达成' : '未达成'}">
          ${UI.esc(label)} ${m}%　${got ? `✅ +${per} 枚` : ok ? '待发' : `当前 ${pct.toFixed(1)}%`}</span>`;
      }).join('');
      return `<div class="lib-ms-line"><b>${UI.esc(label)}</b> ${own}/${tot}（${pct.toFixed(1)}%）<div class="lib-ms-chips">${rows}</div></div>`;
    };
    return `<div class="section-title">收集率里程碑 <span class="dim">（一次性奖励战功章 ${per} 枚；100% 只给纪念荣誉）</span></div>
      <div class="lib-ms">
        ${line('ships', '舰船')}
        ${line('equips', '装备')}
      </div>
      <div class="hint">达到 25% / 50% / 75% 时自动发放战功章，可在「军需处」兑换消耗品与资材。100% 为纪念性荣誉（不提供数值奖励）。</div>`;
  }

  function progressBar(owned, total) {
    const pct = total ? Math.round(owned / total * 100) : 0;
    return `<div class="lib-bar"><div class="lib-bar-in" style="width:${pct}%"></div></div>
      <span class="lib-pct">${pct}%</span>`;
  }

  function library(root) {
    /* 海域作战目标的「战功」（方向四 4.3）：图鉴侧总览（逐图详情在出击页的海域详情里）
   * 与图鉴的收集率是两条独立线：图鉴=收集，战功=作战目标达成。 */
  function warRecordHtml() {
    const ledger = Progression.objectiveLedger();
    const all = [];
    for (const m of MAPS) for (const o of (m.objectives || [])) all.push({ map: m, o });
    if (!all.length) return '';
    const got = all.filter(x => ledger[x.o.id]);
    return `<div class="section-title">战功 <span class="dim">（海域作战目标达成记录，${got.length}/${all.length}）</span></div>
      ${got.length
        ? `<div class="obj-list">${got.map(x => `<div class="obj-row done"><b>★</b> <span class="dim">${UI.esc(x.map.id)}</span> ${UI.esc(Sortie.objectiveCondText(x.o))}</div>`).join('')}</div>`
        : '<div class="hint">尚未取得战功。出击页的海域详情里可以看到各图的可选作战目标与可核算条件。</div>'}`;
  }

  function render() {
      const s = Game.libraryStats();
      const isShip = tab === 'ships';
      const total = isShip ? s.ships.total : s.equips.total;
      const owned = isShip ? s.ships.owned : s.equips.owned;

      const typeSet = [];
      if (isShip) {
        Object.keys(ShipData).forEach(id => {
          const t = ShipData[id].type;
          if (t && !typeSet.includes(t)) typeSet.push(t);
        });
        typeSet.sort((a, b) => {
          const ia = TYPE_ORDER.indexOf(a), ib = TYPE_ORDER.indexOf(b);
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
      } else {
        Object.keys(EquipmentData).forEach(id => {
          const c = EquipmentData[id].cat;
          if (c && !typeSet.includes(c)) typeSet.push(c);
        });
        typeSet.sort();
      }

      const list = isShip ? shipList() : equipList();

      root.innerHTML = `
        <div class="panel">
          <h3>图鉴 <span class="dim">（记录曾经获得过的舰船与装备）</span></h3>
          <div class="btn-row">
            <button class="btn ${isShip ? 'btn-gold' : ''}" data-tab="ships">舰船 ${s.ships.owned}/${s.ships.total}</button>
            <button class="btn ${!isShip ? 'btn-gold' : ''}" data-tab="equips">装备 ${s.equips.owned}/${s.equips.total}</button>
          </div>
          <div class="lib-summary">
            已登录 <b>${owned}</b> / ${total}
            ${progressBar(owned, total)}
          </div>
          ${milestoneHtml()}
          <div class="btn-row lib-filters">
            <select data-ftype>
              <option value="ALL">${isShip ? '全部舰种' : '全部类别'}</option>
              ${typeSet.map(t => `<option value="${UI.esc(t)}" ${filterType === t ? 'selected' : ''}>${UI.esc(t)}</option>`).join('')}
            </select>
            <select data-frarity>
              <option value="0">全部稀有度</option>
              ${[1, 2, 3, 4, 5].map(r => `<option value="${r}" ${filterRarity === r ? 'selected' : ''}>${r} 星</option>`).join('')}
            </select>
            <label class="lib-check"><input type="checkbox" data-fowned ${onlyOwned ? 'checked' : ''}> 只看已获得</label>
          </div>
          <div class="lib-grid">
            ${list.map(d => isShip ? shipCard(d) : equipCard(d)).join('') ||
        '<div class="hint">没有符合条件的条目</div>'}
          </div>
          ${warRecordHtml()}
        </div>`;

      root.querySelectorAll('[data-tab]').forEach(el =>
        el.addEventListener('click', () => {
          tab = el.dataset.tab;
          filterType = 'ALL';
          render();
        }));
      const ft = root.querySelector('[data-ftype]');
      if (ft) ft.addEventListener('change', () => { filterType = ft.value; render(); });
      const fr = root.querySelector('[data-frarity]');
      if (fr) fr.addEventListener('change', () => { filterRarity = parseInt(fr.value, 10); render(); });
      const fo = root.querySelector('[data-fowned]');
      if (fo) fo.addEventListener('change', () => { onlyOwned = fo.checked; render(); });
      /* 条目点击：未获得 → 获取途径；已获得 → 详情（有实例则复用舰娘详情弹窗） */
      root.querySelectorAll('[data-libship]').forEach(el =>
        el.addEventListener('click', () => openEntry(el.dataset.libship, 'ship')));
      root.querySelectorAll('[data-libequip]').forEach(el =>
        el.addEventListener('click', () => openEntry(el.dataset.libequip, 'equip')));
    }
    render();
  }

  return { library, shipCard, equipCard, openEntry, openLocked, openCodexOnly, milestoneHtml };
})();

UI.Screens.library = Library.library;
