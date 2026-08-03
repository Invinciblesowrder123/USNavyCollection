'use strict';
/* ============================================================
 * 工厂：建造 / 装备开发
 * ============================================================ */

const FactoryUI = (() => {

  const BUILD_PRESETS = [
    { name: '驱逐舰', v: [30, 30, 30, 10] },
    { name: '轻巡洋舰', v: [250, 250, 250, 50] },
    { name: '重巡洋舰', v: [350, 350, 400, 50] },
    { name: '正规空母', v: [400, 400, 500, 500] },
    { name: '战列舰', v: [400, 400, 500, 100] },
    { name: '潜水舰', v: [50, 30, 50, 30] }
  ];
  const DEV_PRESETS = [
    { name: '战斗机', v: [10, 20, 10, 40] },
    { name: '攻击/爆击机', v: [10, 20, 10, 50] },
    { name: '水上机', v: [10, 10, 10, 30] },
    { name: '主炮', v: [10, 250, 250, 10] },
    { name: '鱼雷', v: [20, 60, 50, 20] },
    { name: '对空装备', v: [10, 60, 60, 30] },
    { name: '反潜装备', v: [30, 30, 30, 10] }
  ];

  function factory(root, arg) {
    let tab = arg === 'dev' ? 'dev' : 'build';
    render();

    function render() {
      root.innerHTML = `
        <div class="tabs">
          <button class="${tab === 'build' ? 'active' : ''}" data-t="build">舰娘建造</button>
          <button class="${tab === 'dev' ? 'active' : ''}" data-t="dev">装备开发</button>
        </div>
        ${tab === 'build' ? buildPanel() : devPanel()}`;
      root.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { tab = b.dataset.t; render(); }));
      wirePanel();
    }

    function buildPanel() {
      const st = Game.state;
      return `<div class="panel">
        <h3>舰娘建造 <span class="dim">（可同时进行2项，建造完成后点击领取）</span></h3>
        <div class="resource-formula">
          ${['燃料', '弹药', '钢材', '铝土'].map((n, i) => {
            const v = [30, 30, 30, 10];
            return `<div><label>${n}</label><input type="number" min="0" max="9999" id="bf${i}" value="${v[i]}"></div>`;
          }).join('')}
        </div>
        <div class="btn-row">
          ${BUILD_PRESETS.map(p => `<span class="preset-recipe" data-p="${p.v.join(',')}">${p.name}</span>`).join('')}
        </div>
        <div class="btn-row"><button class="btn btn-gold" data-act="build">开始建造</button></div>
        <div class="section-title">建造队列</div>
        <div id="buildQueue">
          ${st.construction.map((c, i) => {
            const def = ShipData[c.shipId];
            const left = c.end - Date.now();
            return `<div class="panel" style="margin:6px 0">
              <div class="flex" style="justify-content:space-between;align-items:center">
                <div><b>${UI.esc(def.zh)}</b> <span class="dim">${UI.esc(def.en)}</span> ${UI.portraitImg(c.shipId, '', 'style="width:48px;height:64px;object-fit:cover"')}</div>
                <div>${left > 0 ? UI.countdown(left) : '<span style="color:var(--gold)">完成！</span>'}</div>
                <button class="btn btn-gold btn-sm" data-claim="${i}" ${left > 0 ? 'disabled' : ''}>领取</button>
              </div></div>`;
          }).join('') || '<span class="dim">队列为空</span>'}
        </div>
        <div class="hint">配方决定可建造的舰种与稀有度。空母/战列舰需要更高资源投入。时间按现实时间比例压缩。</div>
      </div>`;
    }

    function devPanel() {
      const st = Game.state;
      const sec = st.ships[st.fleet[1][0]];
      return `<div class="panel">
        <h3>装备开发 <span class="dim">秘书舰：${sec ? UI.esc(Game.shipDef(sec).zh) : '无（开发池受限）'}</span></h3>
        <div class="resource-formula">
          ${['燃料', '弹药', '钢材', '铝土'].map((n, i) => {
            const v = [10, 20, 10, 40];
            return `<div><label>${n}</label><input type="number" min="0" max="9999" id="df${i}" value="${v[i]}"></div>`;
          }).join('')}
        </div>
        <div class="btn-row">
          ${DEV_PRESETS.map(p => `<span class="preset-recipe" data-p="${p.v.join(',')}">${p.name}</span>`).join('')}
        </div>
        <div class="btn-row"><button class="btn btn-gold" data-act="dev">开始开发</button></div>
        <div class="section-title">开发队列</div>
        <div id="devQueue">
          ${st.development.map((c, i) => {
            const left = c.end - Date.now();
            return `<div class="panel" style="margin:6px 0">
              <div class="flex" style="justify-content:space-between;align-items:center">
                <div><span class="dim">开发中…（${UI.esc(c.poolKey)}池）</span></div>
                <div>${left > 0 ? UI.countdown(left) : '<span style="color:var(--gold)">完成！</span>'}</div>
                <button class="btn btn-gold btn-sm" data-dclaim="${i}" ${left > 0 ? 'disabled' : ''}>领取</button>
              </div></div>`;
          }).join('') || '<span class="dim">队列为空</span>'}
        </div>
        <div class="hint">秘书舰类型决定开发池：空母→舰载机、战列舰→主炮、驱逐→鱼雷/反潜、亚特兰大级→对空。</div>
      </div>`;
    }

    function wirePanel() {
      root.querySelectorAll('.preset-recipe').forEach(el => {
        el.addEventListener('click', () => {
          const v = el.dataset.p.split(',').map(Number);
          const prefix = tab === 'build' ? 'bf' : 'df';
          v.forEach((x, i) => { const inp = document.getElementById(prefix + i); if (inp) inp.value = x; });
        });
      });
      const readRecipe = prefix => ['fuel', 'ammo', 'steel', 'baux'].map((k, i) => ({ k, v: Math.max(0, parseInt(document.getElementById(prefix + i).value, 10) || 0) }));

      const buildBtn = root.querySelector('[data-act="build"]');
      if (buildBtn) buildBtn.addEventListener('click', () => {
        const rv = readRecipe('bf');
        const recipe = { fuel: rv[0].v, ammo: rv[1].v, steel: rv[2].v, baux: rv[3].v };
        const r = Factory.startBuild(recipe);
        if (!r.ok) { UI.toast(r.msg); return; }
        UI.toast(`建造开始！预计 ${Util.fmtTime(r.job.end - Date.now())}`);
        Game.save(); render();
      });
      const devBtn = root.querySelector('[data-act="dev"]');
      if (devBtn) devBtn.addEventListener('click', () => {
        const rv = readRecipe('df');
        const recipe = { fuel: rv[0].v, ammo: rv[1].v, steel: rv[2].v, baux: rv[3].v };
        const sec = Game.state.ships[Game.state.fleet[1][0]];
        const r = Factory.startDevelop(recipe, sec ? sec.uid : null);
        if (!r.ok) { UI.toast(r.msg); return; }
        UI.toast('开发开始！');
        Game.save(); render();
      });
      root.querySelectorAll('[data-claim]').forEach(b => {
        b.addEventListener('click', () => {
          const r = Factory.claimBuild(parseInt(b.dataset.claim, 10));
          if (!r.ok) { UI.toast(r.msg); return; }
          UI.toast(`建造完成！获得 ${UI.esc(Game.shipDef(r.ship).zh)}！`);
          Game.save(); render();
        });
      });
      root.querySelectorAll('[data-dclaim]').forEach(b => {
        b.addEventListener('click', () => {
          const r = Factory.claimDevelop(parseInt(b.dataset.dclaim, 10));
          if (!r.ok) { UI.toast(r.msg); return; }
          UI.toast(r.eq ? `开发成功！获得 ${UI.esc(EquipmentData[r.eq.id].zh)}！` : '开发失败……（什么也没得到）');
          Game.save(); render();
        });
      });
    }
  }

  return { factory };
})();

UI.Screens.factory = FactoryUI.factory;
