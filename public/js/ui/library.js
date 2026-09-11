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
      return `<div class="lib-card locked" title="未获得">
        <div class="lib-thumb lib-empty">?</div>
        <div class="lib-name dim">？？？</div>
        <div class="lib-sub dim">${UI.esc(d.type || '')} 未登录</div>
      </div>`;
    }
    const owned = Object.keys(st().ships).filter(u => st().ships[u].id === d.id).length;
    return `<div class="lib-card" data-ship="${UI.esc(d.id)}" title="${UI.esc(d.zh || d.id)}">
      <div class="lib-thumb">${UI.portraitImg(d.id, 'lib-portrait')}</div>
      <div class="lib-name">${UI.shipNameHtml(d.id)}</div>
      <div class="lib-sub">${UI.rarityStars(rar)}${owned > 1 ? ` ×${owned}` : ''}</div>
    </div>`;
  }

  function equipCard(d) {
    const got = !!ownedEquips()[d.id];
    if (!got) {
      return `<div class="lib-card locked" title="未获得">
        <div class="lib-thumb lib-empty">?</div>
        <div class="lib-name dim">？？？</div>
        <div class="lib-sub dim">${UI.esc(d.cat || '')} 未登录</div>
      </div>`;
    }
    return `<div class="lib-card" title="${UI.esc(d.zh || d.id)}">
      <div class="lib-thumb lib-eq">${UI.eqRarityTag ? UI.eqRarityTag(d.r || 1) : ''}</div>
      <div class="lib-name">${UI.eqNameHtml ? UI.eqNameHtml(d.id) : UI.esc(d.zh || d.id)}</div>
      <div class="lib-sub dim">${UI.esc(d.cat || '')}</div>
    </div>`;
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
    }
    render();
  }

  return { library };
})();

UI.Screens.library = Library.library;
