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

  function mapList(root) {
    const st = Game.state;
    root.innerHTML = `<div class="panel">
      <h3>出击 —— 选择海域</h3>
      ${MAPS.map(m => {
        const mp = st.mapProgress[m.id];
        const cleared = mp.cleared;
        const losNeed = m.branch ? m.branch.if.los : 0;
        const myLos = Game.fleetLos(1);
        const canGo = !st.sortie && st.fleet[1].length > 0;
        return `<div class="panel" style="border-color:${cleared ? 'var(--green)' : 'var(--line)'}">
          <div class="flex" style="justify-content:space-between;align-items:center">
            <div>
              <b style="color:var(--gold)">${m.id} ${m.name}</b>
              <span class="dim"> ｜ ${m.desc}</span>
              <div class="hint">血条进度：${cleared ? '已通关 ★' : `${mp.kills}/${mp.gauge + mp.kills} 次击破`}${losNeed ? ` ｜ 分支索敌要求：${losNeed}（当前 ${myLos}）` : ''}</div>
              <div class="hint">掉落：${m.drops.map(id => ShipData[id].zh).join('、')} ｜ BOSS掉落：${m.bossDrops.map(id => ShipData[id].zh).join('、')}</div>
            </div>
            <button class="btn btn-gold" data-map="${m.id}" ${canGo ? '' : 'disabled'}>出击</button>
          </div>
        </div>`;
      }).join('')}
      <div class="hint">出击将消耗油弹（按战斗节点数）。舰队1出击。舰娘大破时请先入渠修理。</div>
    </div>`;

    root.querySelectorAll('[data-map]').forEach(b => {
      b.addEventListener('click', () => {
        const r = Sortie.start(b.dataset.map, 1);
        if (!r.ok) { UI.toast(r.msg); return; }
        Game.save();
        UI.go('sortie');
      });
    });
  }

  /* 地图渲染 */
  function renderMap(root, map, so) {
    const defs = map.defs;
    const edges = map.edges.map(([a, b]) => {
      const na = map.nodes[a], nb = map.nodes[b];
      const dx = nb.x - na.x, dy = nb.y - na.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ang = Math.atan2(dy, dx) * 180 / Math.PI;
      const cx = (na.x + nb.x) / 2, cy = (na.y + nb.y) / 2;
      return `<div class="map-edge" style="left:${cx}px;top:${cy}px;width:${len}px;transform:rotate(${ang}deg)"></div>`;
    }).join('');
    const nodeIcons = { battle: '⚔', boss: '☠', resource: '◆', supply: '⚓', start: '●', empty: '·' };
    const nodes = Object.entries(map.nodes).map(([id, p]) => {
      const def = defs[id] || { type: 'empty' };
      const cur = so && so.node === id ? ' current' : '';
      const visited = so && so.path.includes(id) && so.node !== id ? ' cleared' : '';
      return `<div class="map-node ${def.type}${cur}${visited}" style="left:${p.x}px;top:${p.y}px" data-node="${id}">
        ${nodeIcons[def.type] || nodeIcons.empty}
      </div>`;
    }).join('');
    return `<div class="map-wrap">${edges}${nodes}</div>`;
  }

  /* 出击中 */
  function sortieActive(root) {
    const st = Game.state;
    const map = Sortie.currentMap();
    if (!map || !st.sortie) { UI.go('sortie'); return; }
    const so = st.sortie;
    const def = Sortie.nodeDef(map, so.node);
    const mp = st.mapProgress[map.id];

    function renderNode() {
      const isBoss = def.type === 'boss';
      root.innerHTML = `
        <div class="panel">
          <h3>${map.id} ${map.name} <span class="dim">血条：${mp.cleared ? '★ 已攻略' : `${mp.kills}/${mp.gauge + mp.kills}`}</span>
            <button class="btn btn-red btn-sm" style="float:right" data-act="retreat">撤退返回</button>
          </h3>
          ${renderMap(root, map, so)}
          <div class="hint" style="margin-top:8px">路径：${so.path.join(' → ')}</div>
          ${nodeAction()}
        </div>`;
      root.querySelector('[data-act="retreat"]').addEventListener('click', () => {
        if (confirm('确定撤退返回母港？')) { Sortie.retreat(); Game.save(); UI.go('home'); }
      });
      const act = root.querySelector('[data-act]');
      if (act && act.dataset.act === 'advance') {
        act.addEventListener('click', () => {
          if (def.type === 'battle' || def.type === 'boss') openFormationSelect(formation => {
            doBattle(formation, true);
          });
          else doAdvance();
        });
      }
    }

    function nodeAction() {
      if (def.type === 'start') {
        return `<div class="btn-row"><button class="btn btn-gold" data-act="advance">前往下一节点</button>
          <span class="hint" style="align-self:center">出击开始！索敌值 ${Game.fleetLos(1)}</span></div>`;
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
      }
      Game.save();
      sortieActive(root);
    }

    function doBattle(formation, allowNight) {
      const r = Sortie.advance(formation, allowNight);
      if (!r.ok) { UI.toast(r.msg); return; }
      renderBattle(root, r, () => {
        /* 战斗后 */
        const st2 = Game.state;
        if (r.cleared) UI.toast('海域攻略完成！★');
        const atBossNode = Sortie.atBoss();
        const nxt = atBossNode ? null : Sortie.moveToNext();
        Game.save();
        sortieActive(root);
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

  /* 战斗演出 */
  function renderBattle(root, r, onDone, opts = {}) {
    const st = Game.state;
    const isPractice = !!opts.practice;
    const isSortie = !!Game.state.sortie;
    root.innerHTML = `
      <div class="panel">
        <h3>战斗 —— ${r.isBoss ? 'BOSS战' : '遭遇战'}</h3>
        <div class="battlefield">
          <div class="battle-row" id="rowA">${r.result.mySide.map((s, i) => battleShipHtml(s, i)).join('')}</div>
          <div class="battle-row enemy-row" id="rowB">${r.result.enemySide.map((s, i) => battleShipHtml(s, i)).join('')}</div>
          <div id="battleLog"></div>
        </div>
      </div>`;

    const logEl = root.querySelector('#battleLog');
    const entries = r.result.log;
    let i = 0;
    const speed = 300;
    const timer = setInterval(() => {
      if (i >= entries.length) {
        clearInterval(timer);
        showResult();
        return;
      }
      const e = entries[i++];
      if (typeof e === 'string') {
        const line = document.createElement('div');
        line.className = 'line' + (e.includes('击沉') ? ' sink' : e.includes('发动') ? ' ci' : '');
        line.textContent = e;
        logEl.appendChild(line);
        logEl.scrollTop = logEl.scrollHeight;
      } else if (e.snap) {
        updateBars(e.snap);
      }
    }, speed);

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
      const gains = opts.gains || Progression.applyBattleResult(1, r.result, isPractice);
      const rankLabel = { S: '完全胜利', A: '胜利', B: '战术胜利', C: '战术败北', D: '败北' }[r.result.rank];
      root.querySelector('#battleLog').insertAdjacentHTML('beforeend',
        `<div class="line" style="margin-top:8px">
          <span class="big-rank">${r.result.rank} ${rankLabel}</span>
          ${r.drop ? `<span style="color:var(--gold)"> 掉落新舰娘：${UI.esc(Game.shipDef(r.drop).zh)}！</span>` : ''}
          <div class="hint">${gains.map(g => { const s = st.ships[g.uid]; return `${UI.esc(Game.shipDef(s).zh)} EXP+${g.exp}${g.ups ? ` 升级Lv.${s.lv}！` : ''}`; }).join(' ｜ ')}</div>
        </div>`);
      const nav = document.createElement('div');
      nav.className = 'btn-row';
      const nxt = isSortie && Sortie.currentMap() && !Sortie.atBoss() && !r.cleared;
      nav.innerHTML = nxt
        ? `<button class="btn btn-gold" data-next>继续前进</button><button class="btn" data-back>返回母港</button>`
        : `<button class="btn btn-gold" data-back>${r.cleared ? '凯旋！返回母港' : '返回母港'}</button>`;
      root.querySelector('#battleLog').appendChild(nav);
      nav.querySelector('[data-next]').addEventListener('click', () => { onDone(); });
      nav.querySelector('[data-back]').addEventListener('click', () => {
        Sortie.returnHome();
        Game.save();
        if (opts.onBack) opts.onBack(); else UI.go('home');
      });
      Game.save();
    }
  }

  function battleShipHtml(s, idx) {
    const src = s.isPlayer
      ? `art/portraits/${Util.esc(Game.state.ships[s.uid].id)}.svg`
      : (s.boss ? 'art/portraits/deep_boss.svg' : 'art/portraits/deep.svg');
    return `<div class="battle-ship" data-ship="${idx}">
      <img src="${src}" alt="">
      <div class="bname">${Util.esc(s.zh || s.name)}${s.boss ? ' ☠' : ''}</div>
      <div class="bhp"><div class="ok" style="width:100%"></div></div>
    </div>`;
  }

  return { mapList, sortieActive, renderBattle };
})();

UI.Screens.sortie = (root, arg) => {
  if (Game.state.sortie) SortieUI.sortieActive(root);
  else SortieUI.mapList(root);
};
