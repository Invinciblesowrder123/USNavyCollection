'use strict';
/* ============================================================
 * 出击：海域选择 / 地图行进 / 战斗演出
 * ============================================================ */

const SortieUI = (() => {
  const FORM_INFO = {
    '单纵阵': '火力100%，命中与回避一般。炮击战主力阵型。',
    '复纵阵': '火力80%，命中提高。适合对抗潜艇与触发特殊阵型战术。',
    '轮形阵': '火力70%，命中与回避大幅提高。防空与防御阵型。',
    '梯形阵': '火力75%，均衡阵型，对潜水舰有额外效果。',
    '单横阵': '火力60%，对潜火力+20。反潜作战专用。'
  };

  /* ---------- 海域地图（参考Kancolle海图UI） ---------- */
  const MAP_BOARD = { w: 760, h: 460 };
  const MAP_MINI = { w: 236, h: 168 };
  const NODE_TYPE_ZH = { start: '出击点', battle: '战斗点', boss: 'BOSS点', resource: '资源点', supply: '补给点', empty: '航路节点' };
  const RES_ICON = { fuel: ['油', 'res-fuel'], ammo: ['弹', 'res-ammo'], steel: ['钢', 'res-steel'], baux: ['铝', 'res-baux'] };
  const RES_NAME = { fuel: '燃料', ammo: '弹药', steel: '钢材', baux: '铝土' };
  let _boardUid = 0;

  /* 将地图坐标适配到画布：等比缩放+居中偏移 */
  function boardGeom(map, w, h, pad) {
    const xs = [], ys = [];
    Object.values(map.nodes).forEach(p => { xs.push(p.x); ys.push(p.y); });
    const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    const minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    const cw = Math.max(1, maxX - minX), ch = Math.max(1, maxY - minY);
    const s = Math.min((w - pad) / cw, (h - pad) / ch, 2.2);
    return { s, ox: (w - cw * s) / 2 - minX * s, oy: (h - ch * s) / 2 - minY * s };
  }

  function nodeMeta(def) {
    switch (def.type) {
      case 'start': return { cls: 'start', icon: '出撃' };
      case 'battle': return { cls: 'battle', icon: '⚔' };
      case 'boss': return { cls: 'boss', icon: '☠' };
      case 'resource': {
        const m = RES_ICON[def.reward && def.reward[0]] || RES_ICON.fuel;
        return { cls: 'resource ' + m[1], icon: m[0] };
      }
      case 'supply': return { cls: 'supply', icon: '⚓' };
      default: return { cls: 'empty', icon: '?' };
    }
  }

  /* 海图画布：网格海图背景 + 罗盘 + 箭头航路 + 类型节点 + 舰队位置标记 */
  function mapBoard(map, so, opts = {}) {
    const mini = !!opts.mini;
    const bw = mini ? MAP_MINI.w : MAP_BOARD.w;
    const bh = mini ? MAP_MINI.h : MAP_BOARD.h;
    const g = boardGeom(map, bw, bh, mini ? 70 : 120);
    const X = x => Math.round(g.ox + x * g.s);
    const Y = y => Math.round(g.oy + y * g.s);
    const uid = ++_boardUid;
    const path = so ? so.path : [];
    const traveled = new Set();
    for (let i = 0; i + 1 < path.length; i++) traveled.add(path[i] + '>' + path[i + 1]);

    const edges = map.edges.map(([a, b]) => {
      const na = map.nodes[a], nb = map.nodes[b];
      const isT = traveled.has(a + '>' + b) || traveled.has(b + '>' + a);
      const isNext = !!(so && so.node === a);
      const cls = 'map-edge' + (isT ? ' traveled' : '') + (isNext ? ' next' : '');
      return `<line class="${cls}" x1="${X(na.x)}" y1="${Y(na.y)}" x2="${X(nb.x)}" y2="${Y(nb.y)}" marker-end="url(#${isT ? 'arr-gold' : 'arr-gray'}-${uid})"/>`;
    }).join('');

    const nodes = Object.entries(map.nodes).map(([id, p]) => {
      const def = map.defs[id] || { type: 'empty' };
      const meta = nodeMeta(def);
      const cur = !!(so && so.node === id);
      const visited = !!(so && !cur && path.includes(id));
      return `<div class="map-node ${meta.cls}${cur ? ' current' : ''}${visited ? ' cleared' : ''}" style="left:${X(p.x)}px;top:${Y(p.y)}px">
        ${cur ? '<span class="fleet-mark">⛵</span>' : ''}
        <span class="node-icon">${meta.icon}</span>
        ${id === 'S' ? '' : `<span class="node-label">${id}</span>`}
      </div>`;
    }).join('');

    return `<div class="map-board${mini ? ' mini' : ''}">
      <svg class="map-routes" width="${bw}" height="${bh}" viewBox="0 0 ${bw} ${bh}">
        <defs>
          <marker id="arr-gray-${uid}" viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="rgba(96,130,180,.8)"/></marker>
          <marker id="arr-gold-${uid}" viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#ffd700"/></marker>
        </defs>
        ${edges}
      </svg>
      ${nodes}
      <div class="map-compass"></div>
      ${mini ? '' : `<div class="map-legend">
        <span><b style="color:#ffb0b0">⚔</b>战斗</span>
        <span><b style="color:#ff8585">☠</b>BOSS</span>
        <span><b style="color:#7fe07f">◆</b>资源</span>
        <span><b style="color:#8fd0ff">⚓</b>补给</span>
      </div>`}
    </div>`;
  }

  /* 出击中的海域信息条：血条 + 索敌 + 油弹 */
  function mapTopbar(map, so) {
    const mp = Game.state.mapProgress[map.id];
    const total = mp.gauge + mp.kills;
    const pct = mp.cleared ? 100 : Math.round(mp.gauge / total * 100);
    const fleet = Game.state.fleet[so.fleetIdx] || [];
    let minFuel = 1, minAmmo = 1;
    for (const uid of fleet) {
      const s = Game.state.ships[uid];
      if (!s) continue;
      minFuel = Math.min(minFuel, s.supply.fuel);
      minAmmo = Math.min(minAmmo, s.supply.ammo);
    }
    return `<div class="map-topbar">
      <div class="map-gauge">
        <div class="gauge-head"><span>海域血条</span><b>${mp.cleared ? '★ 已攻略' : `${mp.kills} / ${total} 次击破`}</b></div>
        <div class="gauge-bar"><div class="gauge-fill${mp.cleared ? ' full' : ''}" style="width:${pct}%"></div></div>
      </div>
      <div class="map-stat">索敌 <b>${Game.fleetLos(so.fleetIdx)}</b></div>
      <div class="map-stat">油 <b class="${minFuel < 0.5 ? 'red' : ''}">${Math.round(minFuel * 100)}%</b> ｜ 弹 <b class="${minAmmo < 0.5 ? 'red' : ''}">${Math.round(minAmmo * 100)}%</b></div>
    </div>`;
  }

  /* ============================================================
   * 海域选择（Kancolle世界地图风格：海域导航页签 + 海图位置标记 + 地图详情）
   * ============================================================ */
  const AREA_ZH = { '1': '夏威夷海域', '2': '所罗门群岛海域', '3': '阿留申群岛海域', '4': '中太平洋海域', '5': '菲律宾海域' };
  const AREA_DESC = {
    '1': '母港所在的太平洋防线，深海军前哨部队蠢蠢欲动。',
    '2': '所罗门群岛与铁底湾，反潜与夜战的高发海域。',
    '3': '阿留申群岛的北大平洋，深海北方舰队的据点。',
    '4': '马绍尔与马里亚纳群岛，中太平洋的航空决战海域。',
    '5': '菲律宾与莱特湾，联合舰队最后的决战之地。'
  };
  /* 各海域地图在海图上的位置（百分比坐标）；第5张为 BOSS 海域（EO） */
  const AREA_SPOTS = {
    '1': { '1-1': [10, 76], '1-2': [28, 52], '1-3': [46, 28], '1-4': [64, 48], '1-5': [74, 18] },
    '2': { '2-1': [12, 72], '2-2': [32, 48], '2-3': [48, 22], '2-4': [70, 62], '2-5': [36, 16] },
    '3': { '3-1': [14, 74], '3-2': [34, 48], '3-3': [24, 26], '3-4': [66, 30], '3-5': [52, 10] },
    '4': { '4-1': [12, 70], '4-2': [32, 44], '4-3': [48, 22], '4-4': [70, 52], '4-5': [58, 76] },
    '5': { '5-1': [14, 66], '5-2': [32, 44], '5-3': [48, 20], '5-4': [70, 40], '5-5': [56, 80] }
  };
  const areaOf = m => m.id.split('-')[0];
  const areaMaps = no => MAPS.filter(m => areaOf(m) === no);
  /* 地图「出现物品」（由节点类型推导：资源/补给点） */
  function mapItems(m) {
    const items = [];
    Object.values(m.defs).forEach(d => {
      if (d.type === 'resource') (d.reward || []).forEach(r => {
        const n = RES_NAME[r];
        if (n && !items.includes(n)) items.push(n);
      });
      if (d.type === 'supply' && !items.includes('补给点')) items.push('补给点');
    });
    return items;
  }

  /* 地图是否处于锁定状态（BOSS海域需先击破同区域4号图） */
  const mapLocked = m => !!m.need && !Game.state.mapProgress[m.need].cleared;

  /* 海图面板：海域名 + 地图位置标记（可点击选择）+ 虚线航路 */
  function areaMapPanel(areaNo, selId) {
    const st = Game.state;
    const ms = areaMaps(areaNo);
    const spots = AREA_SPOTS[areaNo] || {};
    const routes = ms.slice(0, -1).map((m, i) => {
      const a = spots[m.id], b = spots[ms[i + 1].id];
      if (!a || !b) return '';
      return `<line class="area-route" x1="${a[0]}%" y1="${a[1]}%" x2="${b[0]}%" y2="${b[1]}%"/>`;
    }).join('');
    const markers = ms.map(m => {
      const mp = st.mapProgress[m.id];
      const [x, y] = spots[m.id] || [50, 50];
      const locked = mapLocked(m);
      const no = m.id.split('-')[1];
      return `<button class="spot-btn${m.id === selId ? ' sel' : ''}${mp.cleared ? ' cleared' : ''}${locked ? ' locked' : ''}"
          data-map="${m.id}" title="${m.name}" style="left:${x}%;top:${y}%">
        <span class="spot-no">${locked ? '🔒' : (mp.cleared ? '✓' : no)}</span>
        <span class="spot-name">${m.name}</span>
        <span class="spot-prog">${locked ? '需击破 ' + m.need : (mp.cleared ? '已攻略' : `击破 ${mp.kills}/${mp.gauge + mp.kills}`)}</span>
      </button>`;
    }).join();
    return `<div class="area-map">
      <svg class="area-routes" viewBox="0 0 100 100" preserveAspectRatio="none">${routes}</svg>
      <div class="area-map-title">${AREA_ZH[areaNo]}<span class="dim">${AREA_DESC[areaNo]}</span></div>
      <div class="area-compass"></div>
      ${markers}
    </div>`;
  }

  /* 地图详情面板：迷你海图预览 + 血条 + 出击（BOSS海域锁定态提示）；fleetIdx 用于跟随所选舰队的索敌/出击判断 */
  function mapDetailPanel(m, fleetIdx) {
    const st = Game.state;
    const fidx = fleetIdx || 1;
    const mp = st.mapProgress[m.id];
    const total = mp.gauge + mp.kills;
    const pct = mp.cleared ? 100 : Math.round(mp.gauge / total * 100);
    const items = mapItems(m);
    const brs = Array.isArray(m.branch) ? m.branch : (m.branch ? [m.branch] : []);
    const losNeed = brs.reduce((mx, b) => Math.max(mx, b.if.los || 0), 0);
    const ddNeed = brs.reduce((mx, b) => Math.max(mx, b.if.dd || 0), 0);
    const los = Game.fleetLos(fidx);
    const locked = mapLocked(m);
    const canGo = !locked && !st.sortie && (st.fleet[fidx] || []).length > 0;
    return `<div class="map-detail${locked ? ' locked' : ''}">
      <div class="md-board">${mapBoard(m, null, { mini: true })}</div>
      <div class="md-title">${m.id} ${m.name} <span class="map-stars">${'★'.repeat(m.stars || 0)}</span>
        ${mp.cleared ? '<span class="map-clear-badge">★ 已攻略</span>' : ''}
        ${m.need ? '<span class="md-eo">BOSS海域</span>' : ''}</div>
      <div class="md-gauge">
        <div class="gauge-head"><span>海域血条</span><b>${mp.cleared ? '★ 已攻略' : `${mp.kills} / ${total} 次击破`}</b></div>
        <div class="gauge-bar"><div class="gauge-fill${mp.cleared ? ' full' : ''}" style="width:${pct}%"></div></div>
      </div>
      <div class="md-desc">${m.desc}</div>
      <div class="md-rows">
        ${items.length ? `<div><b>出现物品</b>：${items.join('、')}</div>` : ''}
        ${losNeed ? `<div><b>分支索敌</b>：≥${losNeed}<span class="${los >= losNeed ? '' : 'red'}">（当前 ${los}${los >= losNeed ? '，满足' : '，不足' }）</span></div>` : ''}
        ${ddNeed ? `<div><b>分支驱逐</b>：≥${ddNeed} 艘</div>` : ''}
        <div><b>道中掉落</b>：${m.drops.map(id => UI.shipNameHtml(ShipData[id])).join('、')}</div>
        <div><b>BOSS掉落</b>：${m.bossDrops.map(id => UI.shipNameHtml(ShipData[id])).join('、')}</div>
      </div>
      ${locked
        ? `<div class="md-lock">🔒 未解锁！先击破 <b>${m.need}</b> 后开放此 BOSS 海域。</div>`
        : `<button class="btn btn-gold md-btn" data-start ${canGo ? '' : 'disabled'}>出击</button>`}
    </div>`;
  }

  function mapList(root) {
    const st = Game.state;
    const fleets = Game.unlockedFleets();
    let selFleet = fleets.includes(1) ? 1 : (fleets[0] || 1);
    const fleet = st.fleet[selFleet];
    let minFuel = 1, minAmmo = 1;
    for (const uid of fleet) {
      const s = st.ships[uid];
      if (!s) continue;
      minFuel = Math.min(minFuel, s.supply.fuel);
      minAmmo = Math.min(minAmmo, s.supply.ammo);
    }
    const lowSupply = minFuel < 0.5 || minAmmo < 0.5;
    /* 默认选中：首个存在未解锁攻略海域的区域及其首张可攻略地图（跳过锁定的 BOSS 海域） */
    const nos = Object.keys(AREA_ZH);
    const pickMap = no => (areaMaps(no).find(m => !mapLocked(m) && !st.mapProgress[m.id].cleared) || areaMaps(no)[0]);
    let selArea = nos.find(no => areaMaps(no).some(m => !mapLocked(m) && !st.mapProgress[m.id].cleared)) || nos[0];
    let selMap = pickMap(selArea).id;

    function draw() {
      const sel = MAPS.find(m => m.id === selMap);
      root.innerHTML = `<div class="panel">
        <div class="flex" style="justify-content:space-between;align-items:center;margin-bottom:10px">
          <h3 style="margin:0;border:none;padding:0">出击 —— 选择海域</h3>
          <div class="flex" style="align-items:center;gap:10px">
            <div class="tabs">
              ${fleets.map(f => `<button class="${selFleet === f ? 'active' : ''}" data-fleet="${f}">第${['', '一', '二', '三', '四'][f]}舰队</button>`).join('')}
            </div>
            <span class="dim">第${['', '一', '二', '三', '四'][selFleet]}舰队油弹：油 <b style="color:${minFuel < 0.5 ? 'var(--red)' : 'inherit'}">${Math.round(minFuel * 100)}%</b> ｜ 弹 <b style="color:${minAmmo < 0.5 ? 'var(--red)' : 'inherit'}">${Math.round(minAmmo * 100)}%</b>
              ${lowSupply ? '<span style="color:var(--red)">（弹药<50%伤害减半！）</span>' : ''}</span>
            <button class="btn btn-green btn-sm" data-supply>一键补给（油${Logistics.supplyCost(selFleet).fuel} 弹${Logistics.supplyCost(selFleet).ammo}）</button>
          </div>
        </div>
        <div class="area-tabs">
          ${nos.map(no => `<button class="${no === selArea ? 'active' : ''}" data-area="${no}"><b>${no}</b> ${AREA_ZH[no]}</button>`).join('')}
        </div>
        <div class="sortie-mapview">
          ${areaMapPanel(selArea, sel.id)}
          ${mapDetailPanel(sel, selFleet)}
        </div>
        <div class="hint">消耗规则（wiki）：每个战斗点消耗燃料20%、弹药20%（进入夜战弹药改为30%）；资源点/补给点不消耗油弹。弹药&lt;50%时伤害按残弹率/50减半，0%时无法炮击。</div>
      </div>`;

      root.querySelectorAll('[data-fleet]').forEach(b => {
        b.addEventListener('click', () => {
          selFleet = parseInt(b.dataset.fleet, 10);
          Game.save();
          draw();
        });
      });
      root.querySelector('[data-supply]').addEventListener('click', () => {
        const r = Logistics.supplyFleet(selFleet);
        if (!r.ok) { UI.toast(r.msg); return; }
        UI.toast(`第${['', '一', '二', '三', '四'][selFleet]}舰队补给完毕！`);
        Game.save();
        draw();
      });
      root.querySelectorAll('[data-area]').forEach(b => {
        b.addEventListener('click', () => {
          selArea = b.dataset.area;
          selMap = pickMap(selArea).id;
          Game.save();
          draw();
        });
      });
      root.querySelectorAll('[data-map]').forEach(b => {
        b.addEventListener('click', () => {
          selMap = b.dataset.map;
          Game.save();
          draw();
        });
      });
      const startBtn = root.querySelector('[data-start]');
      if (startBtn) {
        startBtn.addEventListener('click', () => {
          if (lowSupply) {
            const ok = confirm(`第${['', '一', '二', '三', '四'][selFleet]}舰队油弹不足（油${Math.round(minFuel * 100)}% 弹${Math.round(minAmmo * 100)}%）！\n弹药<50%伤害减半，0%无法炮击。建议先补给再出击！\n\n仍然出击？`);
            if (!ok) return;
          }
          const r = Sortie.start(selMap, selFleet);
          if (!r.ok) { UI.toast(r.msg); return; }
          if (r.warn) UI.toast(r.warn);
          const daPo = Sortie.daPoShips();
          if (daPo.length) UI.toast(`警告：${daPo.map(u => UI.esc(Game.shipDef(Game.state.ships[u]).zh)).join('、')} 大破出击，进击有轰沉风险！`);
          Game.save();
          UI.go('sortie');
        });
      }
    }
    draw();
  }

  /* 出击中 */
  function sortieActive(root) {
    const st = Game.state;
    const map = Sortie.currentMap();
    if (!map || !st.sortie) { UI.go('sortie'); return; }
    const so = st.sortie;
    const def = Sortie.nodeDef(map, so.node);

    function renderNode() {
      root.innerHTML = `
        <div class="panel">
          <div class="map-head">
            <h3>${map.id} ${map.name} <span class="map-stars">${'★'.repeat(map.stars || 0)}</span></h3>
            <button class="btn btn-red btn-sm" data-act="retreat">撤退返回</button>
          </div>
          ${mapTopbar(map, so)}
          <div class="map-board-wrap">${mapBoard(map, so)}</div>
          <div class="map-nodeinfo">
            <b>当前节点 ${so.node}</b>：${NODE_TYPE_ZH[def.type] || def.type}
            ${def.type === 'battle' || def.type === 'boss'
              ? `<span class="dim">｜ 敌军：${(ENEMY_FLEETS[def.enemy] || { ships: [], formation: '未知' }).ships.length} 舰（${(ENEMY_FLEETS[def.enemy] || { formation: '未知' }).formation}）</span>`
              : def.type === 'resource'
                ? `<span class="dim">｜ 可获得：${(def.reward || []).map(r => RES_NAME[r] || r).join('、')}</span>`
                : def.type === 'supply' ? `<span class="dim">｜ 恢复一半油弹</span>` : ''}
          </div>
          ${nodeAction()}
        </div>`;
      root.querySelector('[data-act="retreat"]').addEventListener('click', () => {
        if (confirm('确定撤退返回母港？')) { Sortie.retreat(); Game.save(); UI.go('home'); }
      });
      const act = root.querySelector('[data-act="advance"]');
      if (act) {
        act.addEventListener('click', () => {
          if (def.type === 'battle' || def.type === 'boss') {
            if (Sortie.flagshipDaPo()) { UI.toast('旗舰大破！无法进击！请撤退！'); return; }
            const daPo = Sortie.daPoShips();
            if (daPo.length) {
              const names = daPo.map(u => UI.esc(Game.shipDef(Game.state.ships[u]).zh)).join('、');
              if (!confirm(`警告：${names} 处于大破状态！大破进击将可能导致轰沉！确定进击？`)) return;
            }
            openFormationSelect(formation => {
              const prep = Sortie.prepareBattle(formation);
              if (!prep.ok) { UI.toast(prep.msg); return; }
              doBattle(prep);
            });
          }
          else doAdvance();
        });
      }
    }

    function nodeAction() {
      if (def.type === 'start') {
        return `<div class="btn-row"><button class="btn btn-gold" data-act="advance">前往下一节点</button>
          <span class="hint" style="align-self:center">出击开始！索敌值 ${Game.fleetLos(so.fleetIdx)}</span></div>`;
      }
      if (def.type === 'resource') return `<div class="hint">资源点。点击前进收集资源。</div><div class="btn-row"><button class="btn btn-gold" data-act="advance">收集资源并前进</button></div>`;
      if (def.type === 'supply') return `<div class="hint">补给点。恢复一半油弹。</div><div class="btn-row"><button class="btn btn-gold" data-act="advance">补给并前进</button></div>`;
      if (def.type === 'battle') return `<div class="btn-row"><button class="btn btn-gold" data-act="advance">迎击敌军！（选择阵型）</button></div>`;
      if (def.type === 'boss') return `<div class="btn-row"><button class="btn btn-gold" data-act="advance">决战！BOSS！（选择阵型）</button></div>`;
      return `<div class="btn-row"><button class="btn btn-gold" data-act="advance">前进</button></div>`;
    }

    function doAdvance() {
      const r = Sortie.advance('单纵阵', true);
      if (!r.ok) { UI.toast(r.msg); return; }
      if (r.type === 'resource') {
        UI.toast(`获得资源：${r.res === 'fuel' ? '燃料' : r.res === 'ammo' ? '弹药' : r.res === 'steel' ? '钢材' : '铝土'} +${r.amount}`);
        Sortie.moveToNext();
      } else if (r.type === 'supply') {
        UI.toast('舰队获得补给！');
        Sortie.moveToNext();
      } else if (r.type === 'move') {
        Sortie.moveToNext();
      }
      Game.save();
      sortieActive(root);
    }

    /* 出击战斗：昼战演出 → 追击选择（夜战突入/战斗结束，wiki 战斗流程）→ 统一结算 */
    function doBattle(prep) {
      renderBattle(root, prep, () => {
        /* 战斗后 */
        if (prep.cleared) UI.toast('海域攻略完成！★');
        const atBossNode = Sortie.atBoss();
        const nxt = atBossNode ? null : Sortie.moveToNext();
        Game.save();
        sortieActive(root);
      }, {
        splitNight: true,
        nightAvailable: () => prep.result.mySide.some(s => s.alive) && prep.result.enemySide.some(s => s.alive),
        doNight: () => { Sortie.continueNight(prep); },
        finish: () => {
          const r = Sortie.settleBattle(prep);
          if (r.ok) { prep.drop = r.drop; prep.cleared = r.cleared; prep.admExp = r.admExp; }
          else UI.toast(r.msg);
        }
      });
    }

    renderNode();
  }

  /* 阵型选择 */
  function openFormationSelect(onPick) {
    const html = `
      <span class="modal-close" data-close>×</span>
      <h3>选择阵型</h3>
      <div class="flex">
        ${Object.keys(FORM_INFO).map(f => `
          <div class="eq-slot" style="padding:10px 14px" data-f="${f}">
            <b>${f}</b><br><span class="dim" style="font-size:11px">${FORM_INFO[f]}</span>
          </div>`).join('')}
      </div>`;
    const m = UI.modal(html);
    m.root.querySelectorAll('[data-f]').forEach(el => {
      el.addEventListener('click', () => { m.close(); onPick(el.dataset.f); });
    });
  }

  /* ============================================================
   * 战斗演出 — 结构化事件驱动动画
   * 事件类型: shell炮击 / torp·open_torp雷击 / air空袭 / asw对潜
   *          / night夜战 / airfight空战 / flak对空炮火
   * ============================================================ */
  function renderBattle(root, r, onDone, opts = {}) {
    const st = Game.state;
    const isPractice = !!opts.practice;
    const isSortie = !!Game.state.sortie;
    root.innerHTML = `
      <div class="panel">
        <h3>战斗 —— ${r.isBoss ? 'BOSS战' : '遭遇战'} <button class="btn btn-sm" id="fxSkip" style="float:right">跳过>></button></h3>
        <div class="battlefield" id="bf">
          <div class="battle-row" id="rowA">${r.result.mySide.map((s, i) => battleShipHtml(s, i)).join('')}</div>
          <div class="battle-mid"></div>
          <div class="battle-row enemy-row" id="rowB">${r.result.enemySide.map((s, i) => battleShipHtml(s, i)).join('')}</div>
          <div id="battleLog"></div>
        </div>
      </div>`;

    const bf = root.querySelector('#bf');
    const logEl = root.querySelector('#battleLog');
    const entries = r.result.log;
    const N = entries.length;
    /* 条目越多播放越快；动画时长随之缩放 */
    const pace = N > 150 ? 0.85 : N > 90 ? 1 : N > 50 ? 1.35 : 2;
    const delay = Math.round(220 * pace);
    const flight = Math.max(175, Math.round(delay * 0.58));
    const flightTorp = Math.round(flight * 1.3);
    /* 开幕空袭三步走整体演出（第一步起飞悬停 → 第二步防空炮火 → 第三步俯冲轰炸） */
    const flightAir = 460;
    /* 空中机群注册表：第一步起飞后机群悬停于两行之间；第二步防空炮火朝机群射击；
     * 第三步机群自空中俯冲轰炸。各侧机群元素 {el, x, y} 供后续步骤取用 */
    const airGroup = { A: [], B: [] };
    /* 该侧是否经历过第一步起飞（开幕空袭 → 第三步纯俯冲轰炸；否则为昼战空母航空攻击 → 航母起飞） */
    const launchPlayed = { A: false, B: false };
    const clearAirGroup = () => {
      for (const letter of ['A', 'B']) {
        while (airGroup[letter].length) airGroup[letter].pop().el.remove();
      }
    };

    const shipEl = (side, idx) => (side && idx >= 0)
      ? root.querySelector(`#${side === 'A' ? 'rowA' : 'rowB'} [data-ship="${idx}"]`) : null;
    const centerOf = el => {
      const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    };
    const bfBox = () => bf.getBoundingClientRect();
    /* 无目标时（空袭未命中）落在对方区域中央附近 */
    const fallbackPoint = atkEl => {
      const b = bfBox();
      const rowB = root.querySelector('#rowB').getBoundingClientRect();
      const baseY = atkEl && atkEl.closest('#rowB') ? b.top + b.height * 0.3 : rowB.top + rowB.height / 2;
      return { x: b.left + b.width * (0.3 + Math.random() * 0.4), y: baseY };
    };
    const mkEl = (cls, content) => {
      const d = document.createElement('div');
      d.className = cls;
      if (content != null) d.textContent = content;
      return d;
    };
    const put = (el, x, y) => { el.style.left = x + 'px'; el.style.top = y + 'px'; };
    const fly = (el, x, y, t, ease) => {
      el.style.transform = `translate(${x - parseFloat(el.style.left)}px, ${y - parseFloat(el.style.top)}px)`;
      el.style.transition = `transform ${t}ms ${ease || 'cubic-bezier(.3,.6,.4,1)'}`;
    };

    /* ---- 命中 / 未命中特效 ---- */
    function impact(tgtEl, kind, dmg, sink) {
      if (!tgtEl) return;
      tgtEl.classList.add('hit');
      setTimeout(() => tgtEl.classList.remove('hit'), 420);
      const c = centerOf(tgtEl);
      const cls = 'explosion'
        + ((kind === 'torp' || kind === 'open_torp') ? ' torp' : (kind === 'asw' ? ' asw' : ' air'))
        + (sink ? ' big' : '');
      const boom = mkEl(cls);
      put(boom, c.x, c.y);
      document.body.appendChild(boom);
      setTimeout(() => boom.remove(), 950);
      if (dmg > 0) {
        const num = mkEl('dmg-num' + (dmg >= 90 ? ' big' : ''), '-' + dmg);
        put(num, c.x - 12 + Math.random() * 12, c.y - 46);
        document.body.appendChild(num);
        setTimeout(() => num.remove(), 1050);
      }
    }

    function missFx(tgtEl, kind) {
      const at = tgtEl ? centerOf(tgtEl) : { x: bfBox().left + bfBox().width / 2, y: bfBox().top + bfBox().height * 0.5 };
      const p = { x: at.x + (Math.random() - 0.5) * 34, y: at.y + (Math.random() - 0.5) * 18 };
      const splash = () => {
        const s = mkEl('splash');
        put(s, p.x + (Math.random() - 0.5) * 14, p.y + (Math.random() - 0.5) * 8);
        document.body.appendChild(s);
        setTimeout(() => s.remove(), 700);
      };
      if (kind === 'air') { splash(); setTimeout(splash, 130); }
      else splash();
      const miss = mkEl('miss-txt', '未命中');
      put(miss, p.x, p.y - 34);
      document.body.appendChild(miss);
      setTimeout(() => miss.remove(), 1050);
    }

    /* ---- 炮击 / 夜战：炮口闪光 + 弹道 ---- */
    function gunAnim(ev, atkEl, tgtEl) {
      if (atkEl) {
        atkEl.classList.add('firing');
        setTimeout(() => atkEl.classList.remove('firing'), flight + 140);
      }
      const from = atkEl ? centerOf(atkEl) : fallbackPoint(null);
      const to = tgtEl ? centerOf(tgtEl) : fallbackPoint(atkEl);
      const p = mkEl('proj-shell' + (ev.kind === 'night' ? ' night' : ''));
      put(p, from.x, from.y);
      document.body.appendChild(p);
      requestAnimationFrame(() => fly(p, to.x, to.y, flight, 'cubic-bezier(.15,.55,.45,1)'));
      setTimeout(() => {
        p.remove();
        if (ev.hit) impact(tgtEl, 'shell', ev.dmg, ev.sink);
        else missFx(tgtEl, 'shell');
      }, flight);
    }

    /* ---- 雷击：鱼雷入水 + 航迹 ---- */
    function torpAnim(ev, atkEl, tgtEl) {
      if (atkEl) {
        atkEl.classList.add('firing');
        setTimeout(() => atkEl.classList.remove('firing'), flightTorp + 120);
      }
      const from = atkEl ? centerOf(atkEl) : fallbackPoint(null);
      const to = tgtEl ? centerOf(tgtEl) : fallbackPoint(atkEl);
      const ang = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
      const p = mkEl('proj-torp');
      put(p, from.x, from.y);
      p.style.transform = `rotate(${ang}deg)`;
      document.body.appendChild(p);
      requestAnimationFrame(() => {
        p.style.transform = `rotate(${ang}deg) translate(${Math.hypot(to.x - from.x, to.y - from.y)}px)`;
        p.style.transition = `transform ${flightTorp}ms cubic-bezier(.4,.15,.6,.9)`;
      });
      setTimeout(() => {
        p.remove();
        if (ev.hit) impact(tgtEl, 'torp', ev.dmg, ev.sink);
        else missFx(tgtEl, 'torp');
      }, flightTorp);
    }

    /* ---- 索敌演出：雷达扫描 + 结果横幅（成功/失败/索敌机未归还） ---- */
    function reconAnim(ev) {
      const b = bfBox();
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      const ring = mkEl('recon-ring');
      put(ring, cx, cy);
      document.body.appendChild(ring);
      setTimeout(() => ring.remove(), 950);
      const banner = mkEl('recon-banner ' + (ev.ok ? 'ok' : 'fail'));
      banner.textContent = ev.ok ? '索敌成功！命中・回避力UP！' : '索敌失败！対空・回避力DOWN！';
      if (ev.lost) banner.textContent += '（索敌机未归还）';
      put(banner, cx, cy - 34);
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 1150);
    }

    /* ---- 开幕空袭·第三步·轰炸（批量）：机群自高空俯冲轰炸舰队（纯俯冲，无起飞动作），
     * 命中/落水一次性结算。昼战空母航空攻击（未经历第一步起飞）时保留航母起飞爬升 ---- */
    function airStrikeBulkAnim(ev) {
      const list = ev.strikes || [];
      if (!list.length) return;
      const diveFromSky = !!launchPlayed[ev.atkS];   // 有第一步起飞 → 纯俯冲
      const d1 = Math.round(flightAir * (diveFromSky ? 0.32 : 0.45));  // 前段
      const d2 = Math.round(flightAir * (diveFromSky ? 0.68 : 0.55));  // 俯冲段
      const impactAt = d1 + d2 + 320;
      const b = bfBox();
      const rowA = root.querySelector('#rowA');
      const rowB = root.querySelector('#rowB');
      const midY = (rowA.getBoundingClientRect().bottom + rowB.getBoundingClientRect().top) / 2;
      /* 昼战空母航空攻击（无前置起飞）：航母起飞闪光 */
      if (!diveFromSky) {
        const launchers = {};
        for (const st of list) {
          const key = (st.atkS || '') + ':' + st.atkI;
          if (launchers[key]) continue;
          launchers[key] = 1;
          const atkEl = shipEl(st.atkS, st.atkI);
          if (atkEl) {
            atkEl.classList.add('firing');
            setTimeout(() => atkEl.classList.remove('firing'), impactAt + 150);
          }
        }
      }
      /* 全部打击并行：开幕空袭自空中机群俯冲轰炸；机群耗尽时从高空补位（不再从航母起飞） */
      for (const st of list) {
        const atkEl = shipEl(st.atkS, st.atkI);
        const tgtEl = shipEl(st.tgtS, st.tgtI);
        const to = tgtEl ? centerOf(tgtEl) : fallbackPoint(atkEl);
        const group = airGroup[st.atkS] || [];
        const fromHover = () => {
          const it = group.shift();
          if (it) {
            it.el.style.transition = 'none';
            it.el.style.transform = 'none';
            put(it.el, it.x, it.y);
            return { el: it.el, x: it.x, y: it.y };
          }
          return null;
        };
        const skyStart = () => {
          /* 高空补位：目标侧上方（从空中俯冲，而非航母） */
          const x = to.x + (Math.random() - 0.5) * b.width * 0.5;
          const y = midY - 60 - Math.random() * 70;
          const pl = mkEl('proj-plane', '✈');
          put(pl, x, y);
          return { el: pl, x, y };
        };
        for (let k = 0; k < 2; k++) {
          let from;
          if (diveFromSky) from = fromHover() || skyStart();
          else from = { el: null, x: atkEl ? centerOf(atkEl).x : to.x, y: atkEl ? centerOf(atkEl).y : to.y };
          const pl = from.el || mkEl('proj-plane', k === 0 ? '✈' : '⌃');
          if (!from.el) put(pl, from.x, from.y);
          document.body.appendChild(pl);
          const t0 = k * 130 + Math.random() * 80;
          if (diveFromSky) {
            /* 纯俯冲：从悬停点直落目标（无爬升段） */
            requestAnimationFrame(() => fly(pl, to.x, to.y, d1 + d2, 'cubic-bezier(.55,.05,.85,.5)'));
          } else {
            const mid = { x: (from.x + to.x) / 2 + (Math.random() - 0.5) * 60, y: from.y - 200 };
            setTimeout(() => fly(pl, mid.x, mid.y, d1, 'cubic-bezier(.3,.7,.5,1)'), t0);
            setTimeout(() => fly(pl, to.x, to.y, d2, 'cubic-bezier(.6,.05,.9,.55)'), t0 + d1);
          }
          const tEnd = t0 + d1 + d2 + 70;
          setTimeout(() => {
            for (let b = 0; b < 2; b++) {
              setTimeout(() => {
                const bomb = mkEl('bomb');
                put(bomb, to.x - 8 + b * 14 + (Math.random() - 0.5) * 8, to.y - 38);
                document.body.appendChild(bomb);
                requestAnimationFrame(() => {
                  bomb.style.transform = 'translateY(32px)';
                  bomb.style.transition = 'transform 210ms cubic-bezier(.7,0,1,1)';
                });
                setTimeout(() => bomb.remove(), 260);
              }, b * 130);
            }
            pl.remove();
          }, tEnd);
        }
      }
      /* 全部命中/未命中特效在投弹后统一触发 */
      for (const st of list) {
        const tgtEl = shipEl(st.tgtS, st.tgtI);
        setTimeout(() => {
          if (st.hit) impact(tgtEl, 'air', st.dmg, st.sink);
          else missFx(tgtEl, 'air');
        }, impactAt + Math.random() * 160);
      }
    }

    /* ---- 空袭（单次，旧格式回退） ---- */
    function airAnim(ev, atkEl, tgtEl) {
      if (atkEl) atkEl.classList.add('firing');
      const from = atkEl ? centerOf(atkEl) : fallbackPoint(null);
      const to = tgtEl ? centerOf(tgtEl) : fallbackPoint(atkEl);
      const mid = { x: (from.x + to.x) / 2 + (Math.random() - 0.5) * 50, y: from.y - 170 };
      const d1 = Math.round(flightAir * 0.42);
      const d2 = Math.round(flightAir * 0.58);
      for (let k = 0; k < 3; k++) {
        const pl = mkEl('proj-plane', k === 1 ? '✈' : '⌃');
        const bx = from.x - 20 + k * 16, by = from.y + 8 - k * 7;
        put(pl, bx, by);
        document.body.appendChild(pl);
        const t0 = 15 + k * 65;
        setTimeout(() => fly(pl, mid.x, mid.y, d1, 'cubic-bezier(.3,.7,.5,1)'), t0);
        setTimeout(() => fly(pl, to.x, to.y, d2, 'cubic-bezier(.6,.05,.9,.55)'), t0 + d1);
        setTimeout(() => {
          for (let b = 0; b < 2; b++) {
            setTimeout(() => {
              const bomb = mkEl('bomb');
              put(bomb, to.x - 9 + b * 13 + (Math.random() - 0.5) * 8, to.y - 36);
              document.body.appendChild(bomb);
              requestAnimationFrame(() => {
                bomb.style.transform = 'translateY(30px)';
                bomb.style.transition = 'transform 180ms cubic-bezier(.7,0,1,1)';
              });
              setTimeout(() => {
                bomb.remove();
                if (ev.hit) impact(tgtEl, 'air', ev.dmg, ev.sink);
                else missFx(tgtEl, 'air');
              }, 210);
            }, b * 120);
          }
          pl.remove();
        }, t0 + d1 + d2 + 40);
      }
      if (atkEl) setTimeout(() => atkEl.classList.remove('firing'), flightAir + 220);
    }

    /* ---- 先制对潜：深水炸弹抛投 ---- */
    function aswAnim(ev, atkEl, tgtEl) {
      if (atkEl) {
        atkEl.classList.add('firing');
        setTimeout(() => atkEl.classList.remove('firing'), 700);
      }
      const from = atkEl ? centerOf(atkEl) : fallbackPoint(null);
      const to = tgtEl ? centerOf(tgtEl) : fallbackPoint(atkEl);
      const apex = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 100 };
      for (let k = 0; k < 2; k++) {
        const dc = mkEl('dc');
        const bx = from.x, by = from.y - 8;
        put(dc, bx, by);
        document.body.appendChild(dc);
        setTimeout(() => {
          fly(dc, apex.x, apex.y, 230, 'cubic-bezier(.4,.2,.6,1)');
          setTimeout(() => {
            fly(dc, to.x, to.y, 250, 'cubic-bezier(.55,.1,.85,.6)');
            setTimeout(() => {
              dc.remove();
              if (k === 1) {
                if (ev.hit) impact(tgtEl, 'asw', ev.dmg, ev.sink);
                else missFx(tgtEl, 'asw');
              }
            }, 270);
          }, 250);
        }, 40 + k * 200);
      }
    }

    /* ---- 开幕空袭·第一步·起飞：双方舰载机/水上飞机从各自航母起飞，
     * 升空后悬停于舰队上空的机群集结区（写入 airGroup 供第二步防空/第三步轰炸取用） ---- */
    function launchAnim(ev) {
      const t = 300;
      const b = bfBox();
      const rowA = root.querySelector('#rowA');
      const rowB = root.querySelector('#rowB');
      const ra = rowA.getBoundingClientRect();
      const rb = rowB.getBoundingClientRect();
      const midY = (ra.bottom + rb.top) / 2;
      const spanX = b.width * 0.72;
      for (const letter of ['A', 'B']) {
        const idxs = (ev.ships && ev.ships[letter]) || [];
        if (!idxs.length) continue;
        launchPlayed[letter] = true;
        for (const idx of idxs) {
          const el = shipEl(letter, idx);
          if (!el) continue;
          el.classList.add('firing');
          setTimeout(() => el.classList.remove('firing'), t + 100);
          const from = centerOf(el);
          for (let k = 0; k < 3; k++) {
            const pl = mkEl('proj-plane', k === 1 ? '✈' : '⌃');
            const bx = from.x - 16 + k * 16, by = from.y + 6 - k * 5;
            put(pl, bx, by);
            document.body.appendChild(pl);
            /* 起飞至舰队上方的高空集结区（俯冲轰炸起点始终在目标之上） */
            const tx = b.left + b.width * 0.14 + Math.random() * spanX;
            const ty = midY - 60 - Math.random() * 70;
            requestAnimationFrame(() => fly(pl, tx, ty, t, 'cubic-bezier(.3,.6,.5,1)'));
            airGroup[letter].push({ el: pl, x: tx, y: ty });
          }
        }
      }
    }

    /* ---- S1 空战：敌我机群对冲，中空被击落（快速衔接：紧凑起止） ---- */
    function airFightAnim(ev) {
      const b = bfBox();
      const rowA = root.querySelector('#rowA');
      const rowB = root.querySelector('#rowB');
      if (!rowA || !rowB) return;
      const ra = rowA.getBoundingClientRect();
      const rb = rowB.getBoundingClientRect();
      const midY = (ra.bottom + rb.top) / 2;
      const spanX = b.width * 0.5;
      const loseSide = ev.atkS === 'B' ? 'B' : 'A';     // 损失较重的一侧派出更多机群
      const nA = loseSide === 'A' ? Math.min(1 + Math.floor((ev.dmg || 4) / 5), 3) : 1;
      const nB = loseSide === 'B' ? Math.min(1 + Math.floor((ev.dmg || 4) / 5), 3) : 1;
      const t = Math.max(110, Math.round(flight * 0.3));
      const puffAt = (x, y) => {
        const puff = mkEl('flak-puff');
        put(puff, x, y);
        document.body.appendChild(puff);
        setTimeout(() => puff.remove(), 550);
      };
      /* 我方机群向下迎击 */
      for (let k = 0; k < nA; k++) {
        setTimeout(() => {
          const pl = mkEl('proj-plane', '⌃');
          const bx = b.left + b.width * 0.2 + Math.random() * spanX, by = ra.top + ra.height * 0.4;
          put(pl, bx, by);
          document.body.appendChild(pl);
          const tx = b.left + b.width * 0.3 + Math.random() * spanX, ty = midY - 16 - Math.random() * 24;
          requestAnimationFrame(() => fly(pl, tx, ty, t, 'cubic-bezier(.5,.3,.6,1)'));
          setTimeout(() => { pl.remove(); puffAt(tx, ty); }, t);
        }, k * 22);
      }
      /* 敌方机群向上迎击 */
      for (let k = 0; k < nB; k++) {
        setTimeout(() => {
          const pl = mkEl('proj-plane', '⌃');
          const bx = b.left + b.width * 0.2 + Math.random() * spanX, by = rb.top + rb.height * 0.6;
          put(pl, bx, by);
          document.body.appendChild(pl);
          const tx = b.left + b.width * 0.3 + Math.random() * spanX, ty = midY + 16 + Math.random() * 24;
          requestAnimationFrame(() => fly(pl, tx, ty, t, 'cubic-bezier(.5,.3,.6,1)'));
          setTimeout(() => { pl.remove(); puffAt(tx, ty); }, t);
        }, k * 22);
      }
    }

    /* ---- 开幕空袭·第二步·防空炮火（批量）：多舰防空炮向第一步悬停的敌机机群仰射，
     * 命中目标附近的机群位置产生黑烟，被击落飞机按实际击落比例从机群中坠出 ---- */
    function flakBulkAnim(ev) {
      const list = ev.shots || [];
      if (!list.length) return;
      const t = Math.max(140, Math.round(flight * 0.28));        // 曳光飞行时长
      const tgtSide = (list[0] && list[0].tgtS) || 'B';          // 被射击机群所属侧
      const tgtGroup = airGroup[tgtSide] || [];
      const skyOf = () => {
        if (tgtGroup.length) {
          const it = tgtGroup[Math.floor(Math.random() * tgtGroup.length)];
          return { x: it.x + (Math.random() - 0.5) * 50, y: it.y + (Math.random() - 0.5) * 36 };
        }
        const tb = bfBox();
        const rb = root.querySelector('#rowB').getBoundingClientRect();
        const ra = root.querySelector('#rowA').getBoundingClientRect();
        const midY = (ra.bottom + rb.top) / 2;
        const sideDown = tgtSide === 'B' ? -1 : 1;
        return { x: tb.left + tb.width / 2 + (Math.random() - 0.5) * 70, y: midY + sideDown * (18 + Math.random() * 40) };
      };
      const n = Math.min(list.length, 5);
      for (let k = 0; k < n; k++) {
        const st = list[k];
        const fromEl = shipEl(st.atkS, st.atkI);
        const from = fromEl ? centerOf(fromEl) : fallbackPoint(null);
        const sky = skyOf();
        for (let m = 0; m < 2; m++) {
          setTimeout(() => {
            const f2 = { x: from.x + (Math.random() - 0.5) * 30, y: from.y + (Math.random() - 0.5) * 24 };
            const t2 = { x: sky.x + (Math.random() - 0.5) * 40, y: sky.y + (Math.random() - 0.5) * 30 };
            const ang = Math.atan2(t2.y - f2.y, t2.x - f2.x) * 180 / Math.PI;
            const len = Math.hypot(t2.x - f2.x, t2.y - f2.y);
            const tr = mkEl('tracer');
            put(tr, f2.x, f2.y);
            tr.style.transform = `rotate(${ang}deg)`;
            tr.style.width = '0px';
            document.body.appendChild(tr);
            requestAnimationFrame(() => {
              tr.style.width = len + 'px';
              tr.style.transition = `width ${t}ms linear`;
            });
            setTimeout(() => {
              tr.remove();
              const puff = mkEl('flak-puff');
              put(puff, t2.x, t2.y);
              document.body.appendChild(puff);
              setTimeout(() => puff.remove(), 300);
            }, t);
          }, k * 40 + m * 70);
        }
      }
      /* 被击落飞机：按实际击落比例从机群中取出并坠落（黑烟 + 下落），保留未被击落的机群；
       * 除非实际全灭，否则至少保留 1 架在空中（供第三步俯冲轰炸） */
      const down = list.reduce((s, x) => s + (x.dmg || 0), 0);
      const totalPlanes = ev.totalPlanes || down;
      const ratio = Math.min(1, down / Math.max(1, totalPlanes));
      let dropN = Math.round(tgtGroup.length * ratio);
      if (ratio < 1 && dropN >= tgtGroup.length) dropN = Math.max(0, tgtGroup.length - 1);
      dropN = Math.max(0, Math.min(tgtGroup.length, dropN));
      for (let k = 0; k < dropN; k++) {
        setTimeout(() => {
          const it = tgtGroup.shift();
          if (!it) return;
          const puff = mkEl('flak-puff');
          put(puff, it.x, it.y);
          document.body.appendChild(puff);
          setTimeout(() => puff.remove(), 300);
          /* 复位至悬停点再坠落（避免从起飞原点跳变） */
          it.el.style.transition = 'none';
          it.el.style.transform = 'none';
          put(it.el, it.x, it.y);
          requestAnimationFrame(() => {
            it.el.style.transition = `transform 150ms cubic-bezier(.6,.05,.9,.55)`;
            it.el.style.transform = `translate(${(Math.random() - 0.5) * 40}px, 70px) rotate(18deg)`;
          });
          setTimeout(() => it.el.remove(), 160);
        }, 100 + k * 40);
      }
    }

    /* ---- S2 对空炮火（单次，旧格式回退） ---- */
    function flakAnim(ev, atkEl, tgtEl) {
      const from = atkEl ? centerOf(atkEl) : fallbackPoint(null);
      /* 炮口指向空中的敌机机群（目标舰上空、两行之间），而非舰体本身 */
      const sky = tgtEl ? (() => {
        const tb = tgtEl.getBoundingClientRect();
        const rb = root.querySelector('#rowB').getBoundingClientRect();
        const ra = root.querySelector('#rowA').getBoundingClientRect();
        const midY = (ra.bottom + rb.top) / 2;
        const sideDown = tgtEl.closest('#rowB') ? -1 : 1;   // 敌机从中线附近俯冲而来
        return { x: tb.left + tb.width / 2 + (Math.random() - 0.5) * 70, y: midY + sideDown * (18 + Math.random() * 40) };
      })() : fallbackPoint(atkEl);
      const n = Math.min(Math.max(ev.dmg || 3, 3), 4);
      const t = Math.max(120, Math.round(flight * 0.35));
      for (let k = 0; k < n; k++) {
        setTimeout(() => {
          const f2 = { x: from.x + (Math.random() - 0.5) * 32, y: from.y + (Math.random() - 0.5) * 26 };
          const t2 = { x: sky.x + (Math.random() - 0.5) * 46, y: sky.y + (Math.random() - 0.5) * 34 };
          const ang = Math.atan2(t2.y - f2.y, t2.x - f2.x) * 180 / Math.PI;
          const len = Math.hypot(t2.x - f2.x, t2.y - f2.y);
          const tr = mkEl('tracer');
          put(tr, f2.x, f2.y);
          tr.style.transform = `rotate(${ang}deg)`;
          tr.style.width = '0px';
          document.body.appendChild(tr);
          requestAnimationFrame(() => {
            tr.style.width = len + 'px';
            tr.style.transition = `width ${t}ms linear`;
          });
            setTimeout(() => {
              tr.remove();
              const puff = mkEl('flak-puff');
              put(puff, t2.x, t2.y);
              document.body.appendChild(puff);
              setTimeout(() => puff.remove(), 550);
            }, t);
        }, k * 30);
      }
    }

    function playEvent(ev) {
      const atkEl = shipEl(ev.atkS, ev.atkI);
      const tgtEl = shipEl(ev.tgtS, ev.tgtI);
      /* 战斗音效 */
      if (typeof Sound !== 'undefined') {
        switch (ev.kind) {
          case 'shell': case 'night': Sound.play('shell', 0.5); break;
          case 'torp': case 'open_torp': Sound.play('torpedo', 0.55); break;
          case 'air': case 'launch': case 'airfight': Sound.play('plane', 0.4); break;
          case 'asw': Sound.play('explosion', 0.4); break;
          case 'flak': Sound.play('shell', 0.25); break;
          case 'recon': Sound.play('confirm', 0.3); break;
        }
        if ((ev.dmg || 0) >= 25) setTimeout(() => Sound.play('explosion', 0.5), 220);
      }
      switch (ev.kind) {
        case 'shell': case 'night': gunAnim(ev, atkEl, tgtEl); break;
        case 'torp': case 'open_torp': torpAnim(ev, atkEl, tgtEl); break;
        case 'air': (ev.strikes ? airStrikeBulkAnim(ev) : airAnim(ev, atkEl, tgtEl)); break;
        case 'asw': aswAnim(ev, atkEl, tgtEl); break;
        case 'airfight': airFightAnim(ev); break;
        case 'launch': launchAnim(ev); break;
        case 'recon': reconAnim(ev); break;
        case 'flak': (ev.shots ? flakBulkAnim(ev) : flakAnim(ev, atkEl, tgtEl)); break;
      }
    }
    const evDur = ev => {
      switch (ev.kind) {
        case 'torp': case 'open_torp': return flightTorp + 250;
        case 'air': return ev.strikes ? flightAir + 350 : flightAir + 260;
        case 'asw': return 540;
        case 'airfight': return Math.max(110, Math.round(flight * 0.3)) + 90 + Math.min(ev.dmg || 4, 10) * 18;
        case 'launch': return 340;
        case 'recon': return 1150;
        case 'flak': return ev.shots ? (Math.max(140, Math.round(flight * 0.28)) + 200) : (Math.max(110, Math.round(flight * 0.3)) + 120 + Math.min(Math.max(ev.dmg || 3, 3), 4) * 25);
        default: return flight + 230;
      }
    };

    /* ---- 跳过演出：清空计时器，瞬时播放剩余条目 ---- */
    let timerId = null;
    let skipped = false;
    const skipBtn = root.querySelector('#fxSkip');
    skipBtn.addEventListener('click', () => {
      if (skipped || pos >= entries.length) return;
      skipped = true;
      clearTimeout(timerId);
      clearAirGroup();
      root.querySelectorAll('.proj-shell,.proj-torp,.proj-plane,.bomb,.dc,.explosion,.dmg-num,.splash,.tracer,.flak-puff,.miss-txt,.recon-ring,.recon-banner')
        .forEach(el => el.remove());
      root.querySelectorAll('.battle-ship.firing,.battle-ship.hit').forEach(el => el.classList.remove('firing', 'hit'));
      while (pos < entries.length) {
        const e = entries[pos++];
        if (typeof e === 'string') {
          const line = document.createElement('div');
          line.className = 'line';
          line.textContent = e;
          logEl.appendChild(line);
        } else if (e.snap) updateBars(e.snap);
      }
      logEl.scrollTop = logEl.scrollHeight;
      finalize();
    });

    /* ---- 顺序播放器 ---- */
    let pos = 0;
    if (window.__battleFxDebug) { window.__pos = 0; window.__battleN = N; }
    const step = () => {
      if (window.__battleFxDebug) window.__pos = pos;
      if (pos >= entries.length) { finalize(); return; }
      const e = entries[pos++];
      let wait = delay;
      if (typeof e === 'string') {
        const isPhase = e.includes('——') || e.includes('进入夜战') || e.includes('航空战') || e.includes('交战形态') || e.includes('索敌');
        const isAir = e.includes('空袭') || e.includes('空战') || e.includes('对空');
        if (e.includes('进入夜战')) bf.classList.add('night');
        /* 离开航空战阶段（进入炮击战等）时回收残留机群 */
        if ((e.includes('炮击战') || e.includes('雷击战') || e.includes('先制对潜') || e.includes('夜战') || e.includes('战斗结束')) && !e.includes('航空')) clearAirGroup();
        const line = document.createElement('div');
        line.className = 'line' + (e.includes('击沉') ? ' sink'
          : (e.includes('发动') || e.includes('空袭') || e.includes('Cut-in')) ? ' ci'
          : isPhase ? ' phase' : '');
        line.textContent = e;
        logEl.appendChild(line);
        logEl.scrollTop = logEl.scrollHeight;
        wait = isPhase ? delay + 90 : isAir ? Math.round(delay * 0.8) : delay;
      } else if (e.snap) {
        updateBars(e.snap);
        wait = Math.round(delay * 0.45);
      } else if (e.event) {
        playEvent(e.event);
        wait = evDur(e.event);
      }
      timerId = setTimeout(step, wait);
    };

    function updateBars(snap) {
      [['rowA', snap.A], ['rowB', snap.B]].forEach(([rowId, arr]) => {
        arr.forEach((s, idx) => {
          const el = document.querySelector(`#${rowId} [data-ship="${idx}"]`);
          if (!el) return;
          const bar = el.querySelector('.bhp > div');
          bar.style.width = (s.hp / s.max * 100) + '%';
          bar.className = s.hp <= 0 ? '' : (s.hp / s.max <= 0.25 ? 'danger' : s.hp / s.max <= 0.5 ? 'mid' : 'ok');
          if (s.hp <= 0) el.classList.add('dead');
        });
      });
    }

    function showResult() {
      bf.classList.remove('night');
      const res = opts.gains ? { gains: opts.gains, adm: opts.adm } : Progression.applyBattleResult(1, r.result, isPractice);
      const gains = res.gains || [];
      const admExp = r.admExp || (res.adm ? res.adm.exp : 0);
      const rankLabel = r.result.perfect ? '完全胜利' : { S: '胜利', A: '胜利', B: '战术胜利', C: '战术败北', D: '败北', E: '败北E' }[r.result.rank] || '败北';
      root.querySelector('#battleLog').insertAdjacentHTML('beforeend',
        `<div class="line" style="margin-top:8px">
          <span class="big-rank">${r.result.rank} ${rankLabel}</span>
          ${r.drop ? `<span style="color:var(--gold)"> 掉落新舰娘：${UI.esc(Game.shipDef(r.drop).zh)}${r.drop.locked ? '（已自动上锁）' : ''}！</span>` : ''}
          <div class="hint">${gains.map(g => { const s = st.ships[g.uid]; return `${UI.esc(Game.shipDef(s).zh)} EXP+${g.exp}${g.ups ? ` 升级Lv.${s.lv}！` : ''}`; }).join(' ｜ ')}${admExp ? ` ｜ 提督EXP+${admExp}` : ''}</div>
        </div>`);
      /* 结算音效 */
      if (typeof Sound !== 'undefined') {
        const rank = r.result.rank;
        if (rank === 'S' || rank === 'A' || rank === 'B') Sound.play('complete', 0.55);
        else Sound.play('alarm', 0.5);
        if (r.drop) Sound.play('get', 0.6);
        if (gains.some(g => g.ups)) Sound.play('levelup', 0.5);
      }
      const nav = document.createElement('div');
      nav.className = 'btn-row';
      const nxt = isSortie && Sortie.currentMap() && !Sortie.atBoss() && !r.cleared;
      nav.innerHTML = nxt
        ? `<button class="btn btn-gold" data-next>继续前进</button><button class="btn" data-back>返回母港</button>`
        : `<button class="btn btn-gold" data-back>${r.cleared ? '凯旋！返回母港' : '返回母港'}</button>`;
      root.querySelector('#battleLog').appendChild(nav);
      const nextBtn = nav.querySelector('[data-next]');
      if (nextBtn) nextBtn.addEventListener('click', () => { onDone(); });
      nav.querySelector('[data-back]').addEventListener('click', () => {
        Sortie.returnHome();
        Game.save();
        if (opts.onBack) opts.onBack(); else UI.go('home');
      });
      Game.save();
    }

    /* ---- 追击选择（wiki 战斗流程：昼战结束 → 「战斗结束」或「夜战突入」→ 夜战） ----
     * splitNight 模式：昼战日志播放完毕后弹出选择；选择夜战后在共享日志上继续播放夜战段并重新结算 */
    let nightChosen = false;
    let decided = false;
    let finished = false;
    const finishBattle = () => {
      if (finished) return;
      finished = true;
      if (opts.finish) opts.finish();
      showResult();
    };
    const finalize = () => {
      if (opts.splitNight && !nightChosen && opts.nightAvailable && opts.nightAvailable()) {
        const html = `
          <span class="modal-close" data-close>×</span>
          <h3>追击选择</h3>
          <div class="hint" style="margin:6px 0">昼战结束。是否<b>夜战突入</b>？<br><span class="dim">夜战突入将追加消耗弹药10%（合计30%），且存在大破风险。</span></div>
          <div class="btn-row">
            <button class="btn btn-gold" data-night>夜战突入</button>
            <button class="btn" data-end>战斗结束</button>
          </div>`;
        const m = UI.modal(html, () => { if (!decided) finishBattle(); });
        m.root.querySelector('[data-night]').addEventListener('click', () => {
          decided = true;
          m.close();
          nightChosen = true;
          if (opts.doNight) opts.doNight();
          skipped = false;                       // 夜战段允许继续跳过演出
          step();
        });
        m.root.querySelector('[data-end]').addEventListener('click', () => {
          decided = true;
          m.close();
          finishBattle();
        });
      } else {
        finishBattle();
      }
    };

    step();
  }

  /* 战斗图标稀有度：玩家舰/演习对手取数据稀有度；深海敌舰按 栖姬=5星 / 精锐·旗舰=4星 / 普通=3星 */
  function battleRarity(s) {
    if (s.isPlayer && s.uid) {
      const inst = Game.state.ships[s.uid];
      if (inst) return Util.clamp(Game.shipDef(inst).rarity || 1, 1, 5);
    }
    if (s.key) {
      if (ShipData[s.key]) return Util.clamp(ShipData[s.key].rarity || 1, 1, 5);
      const d = DEEP_TEMPLATES[s.key];
      if (d) return d.boss ? 5 : (s.key.endsWith('e') || s.key.endsWith('f') ? 4 : 3);
    }
    return 3;
  }

  function battleShipHtml(s, idx) {
    const name = s.zh || s.name || '';
    const t = s.type || 'UN';
    const r = battleRarity(s);
    const stars = '★'.repeat(r) + '☆'.repeat(5 - r);
    return `<div class="battle-ship" data-ship="${idx}">
      <div class="ship-icon type-${Util.esc(t)}"><span class="type-code">${Util.esc(t)}</span><span class="type-stars">${stars}</span></div>
      <div class="bname">${Util.esc(name)}${s.boss ? ' ☠' : ''}</div>
      <div class="bhp"><div class="ok" style="width:100%"></div></div>
    </div>`;
  }

  return { mapList, sortieActive, renderBattle, openFormationSelect };
})();

UI.Screens.sortie = (root, arg) => {
  if (Game.state.sortie) SortieUI.sortieActive(root);
  else SortieUI.mapList(root);
};
