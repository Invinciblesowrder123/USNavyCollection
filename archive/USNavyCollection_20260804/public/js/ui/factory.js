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
    let tab = arg === 'dev' ? 'dev' : arg === 'improve' ? 'improve' : arg === 'modernize' ? 'modernize' : 'build';
    render();

    function render() {
      root.innerHTML = `
        <div class="tabs">
          <button class="${tab === 'build' ? 'active' : ''}" data-t="build">舰娘建造</button>
          <button class="${tab === 'dev' ? 'active' : ''}" data-t="dev">装备开发</button>
          <button class="${tab === 'improve' ? 'active' : ''}" data-t="improve">改修工厂</button>
          <button class="${tab === 'modernize' ? 'active' : ''}" data-t="modernize">近代化改修</button>
        </div>
        ${tab === 'build' ? buildPanel() : tab === 'dev' ? devPanel() : tab === 'improve' ? improvePanel() : modernizePanel()}`;
      root.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { tab = b.dataset.t; render(); }));
      wirePanel();
      UI.setTick(tick);
    }

    /* 每秒刷新倒计时与领取按钮状态 */
    function tick() {
      const now = Date.now();
      root.querySelectorAll('[data-until]').forEach(el => {
        const end = parseInt(el.dataset.until, 10) || 0;
        el.textContent = end - now > 0 ? Util.fmtTime(end - now) : '完成！';
      });
      root.querySelectorAll('[data-claim]').forEach(b => {
        const job = Game.state.construction[parseInt(b.dataset.claim, 10)];
        b.disabled = !(job && now >= job.end);
      });
      root.querySelectorAll('[data-dclaim]').forEach(b => {
        const job = Game.state.development[parseInt(b.dataset.dclaim, 10)];
        b.disabled = !(job && now >= job.end);
      });
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
                <div><span class="countdown" data-until="${c.end}">${left > 0 ? Util.fmtTime(left) : '完成！'}</span></div>
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
                <div><span class="countdown" data-until="${c.end}">${left > 0 ? Util.fmtTime(left) : '完成！'}</span></div>
                <button class="btn btn-gold btn-sm" data-dclaim="${i}" ${left > 0 ? 'disabled' : ''}>领取</button>
              </div></div>`;
          }).join('') || '<span class="dim">队列为空</span>'}
        </div>
        <div class="hint">秘书舰类型决定开发池：空母→舰载机、战列舰→主炮、驱逐→鱼雷/反潜、亚特兰大级→对空。</div>
      </div>`;
    }

    /* ============ 改修工厂（参照 wiki「明石的改修工厂」） ============ */
    function improvePanel() {
      const st = Game.state;
      if (!Improve.secretaryIsVestal()) {
        return `<div class="panel">
          <h3>改修工厂 <span class="dim">未开启</span></h3>
          <div class="hint">需要工作舰「维斯塔尔」担任秘书舰（第一舰队旗舰）才能使用改修工厂。</div>
          <div class="hint">维斯塔尔在一次性任务「舰队之母」（累计修理5艘舰娘）中可获得。将她的改修装备养成并编入第一舰队旗舰，即可解锁本系统。</div>
        </div>`;
      }
      const unlocks = Improve.unlockedNeeds();
      const list = Improve.list().filter(e => e.cfg.need === 'basic' || unlocks.includes(e.cfg.need));
      return `<div class="panel">
        <h3>改修工厂 <span class="dim">秘书舰：维斯塔尔${Improve.flagshipKai() ? '改' : ''}</span></h3>
        <div class="hint">改修资材：<span class="screw">🔩 ${st.resources.screws || 0}/3000</span> ｜ 今日改修：<b>${Improve.dailyUsed()}/${Improve.dailyLimit()}</b> 次
          ｜ 二号舰解锁：${unlocks.map(n => UI.esc(IMPROVE_NEED_ZH[n])).join('、')}</div>
        <div class="section-title">可改修装备（装备中的装备需先卸下）</div>
        ${list.length ? list.map(e => {
          const ed = EquipmentData[e.id];
          const info = Improve.improveInfo(e.euid);
          const needLock = !info.unlocked;
          return `<div class="improve-row ${needLock ? 'improve-locked' : ''}">
            <div class="grow">
              <b>${UI.esc(ed.zh)}</b> ${UI.starHtml({ star: e.star })}
              <span class="dim">(${EQUIP_CAT_ZH[ed.cat] || ed.cat})</span>
            </div>
            <div class="dim">${info.available ? `资材×${info.cost.screws} 成功率${info.rate}%` : UI.esc(info.reason)}</div>
            <div class="btn-row" style="gap:4px">
              ${info.available ? `<button class="btn btn-sm" data-improve="${e.euid}">改修</button>
                <button class="btn btn-sm btn-gold" data-improve-g="${e.euid}">确定化(×2资材)</button>` : ''}
              ${info.update && info.updateOk ? `<button class="btn btn-sm btn-gold" data-update="${e.euid}">更新→${UI.esc(EquipmentData[info.update.to].zh)}</button>
                <button class="btn btn-sm" data-update-g="${e.euid}">确定更新(×2资材)</button>` : ''}
            </div>
          </div>`;
        }).join('') : '<span class="dim">没有可改修的装备，先去开发/打捞一些吧。</span>'}
        <div class="hint">改修规则：★+4前必定成功，之后星级越高越容易失败；★+6起需要消耗同名装备（★0）作为素材；★MAX后可通过「更新」进化为更强装备（新装备★+5起步）。确定化消耗双倍资材、必定成功。改修资材主要来自日常任务「装备的改修强化」。</div>
      </div>`;
    }

    /* ============ 近代化改修（舰艇强化，参照 wiki「近代化改修」） ============ */
    function modernizePanel() {
      const st = Game.state;
      const zh = { fp: '火力', tp: '雷装', aa: '对空', arm: '装甲', hp: '耐久', asw: '对潜', lck: '运' };
      const ships = Object.values(st.ships);
      return `<div class="panel">
        <h3>近代化改修 <span class="dim">（利用多余的舰娘强化目标舰属性，最多选5艘素材）</span></h3>
        ${ships.length ? `<div class="mod-ship-list">
          ${ships.map(s => {
            const def = Game.shipDef(s);
            const modInfo = Progression.modernizeInfo(s.uid);
            const caps = modInfo ? modInfo.gains : {};
            const avail = Object.keys(caps).length > 0;
            const capTxt = Object.keys(caps).map(k => `${zh[k]}+${caps[k]}`).join(' ');
            return `<div class="improve-row ${avail ? '' : 'improve-locked'}">
              <div class="grow">
                <b>${UI.esc(def.zh)}</b> <span class="dim">Lv.${s.lv}${s.kai === 1 ? '改' : s.kai >= 2 ? '改二' : ''} · ${SHIP_TYPE_ZH[def.type]}</span>
                <div class="dim">剩余可改修：${capTxt || '改修MAX'}</div>
              </div>
              ${avail ? `<button class="btn btn-gold btn-sm" data-mod-target="${s.uid}">近代化改修</button>` : '<span class="dim">改修MAX</span>'}
            </div>`;
          }).join('')}
        </div>` : '<span class="dim">还没有舰娘，先去建造吧！</span>'}
        <div class="hint">规则：消耗 油30/弹30，素材舰将被解体（装备一并销毁）。素材属性由舰种/改造形态决定（参照 wiki 素材列表）；奖励/偏斜各50%，素材合计 +4/+9/+14/+19/+24 额外奖励点。上限：火力/雷装/对空/装甲=基础×1.3；海防舰(DE)素材可喂 耐久+2/对潜+9/运+8（改造后继承）。改造会重置 火力/雷装/对空/装甲 的改修值。</div>
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
      root.querySelectorAll('[data-improve]').forEach(b => {
        b.addEventListener('click', () => {
          const r = Improve.improve(b.dataset.improve, false);
          if (!r.ok) { UI.toast(r.msg); return; }
          UI.toast(r.success ? `改修成功！★+${r.star}` : `改修失败……（★${r.star}）`);
          Game.save(); render();
        });
      });
      root.querySelectorAll('[data-improve-g]').forEach(b => {
        b.addEventListener('click', () => {
          const r = Improve.improve(b.dataset.improveG, true);
          if (!r.ok) { UI.toast(r.msg); return; }
          UI.toast(`确定化改修成功！★+${r.star}`);
          Game.save(); render();
        });
      });
      root.querySelectorAll('[data-update]').forEach(b => {
        b.addEventListener('click', () => {
          const r = Improve.updateEquip(b.dataset.update, false);
          if (!r.ok) { UI.toast(r.msg); return; }
          UI.toast(r.success ? `更新成功！获得 ${UI.esc(EquipmentData[r.to].zh)}★5！` : '更新失败……（素材已消耗）');
          Game.save(); render();
        });
      });
      root.querySelectorAll('[data-update-g]').forEach(b => {
        b.addEventListener('click', () => {
          const r = Improve.updateEquip(b.dataset.updateG, true);
          if (!r.ok) { UI.toast(r.msg); return; }
          UI.toast(`确定化更新成功！获得 ${UI.esc(EquipmentData[r.to].zh)}★5！`);
          Game.save(); render();
        });
      });
      root.querySelectorAll('[data-mod-target]').forEach(b => {
        b.addEventListener('click', () => {
          Homeport.openModernize(b.dataset.modTarget, render);
        });
      });
    }
  }

  return { factory };
})();

UI.Screens.factory = FactoryUI.factory;
