'use strict';
/* ============================================================
 * 工厂：舰娘建造 / 装备开发 / 改修工厂 / 近代化改修 / 装备仓库
 * 开发参照 kcwiki「开发」：秘书舰系×最高资源池，即时结算，预览开发池
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
  /* 开发预设（参照 kcwiki 常用公式，燃料/弹药/钢材/铝） */
  const DEV_PRESETS = [
    { name: '舰载机通用', v: [20, 60, 10, 110], hint: '空母系：流星改·烈风级·紫电等各类飞机' },
    { name: '舰载机狙击', v: [20, 30, 10, 40], hint: '空母系：规避稀有舰攻，狙击彗星一二型甲' },
    { name: '主炮通用', v: [10, 251, 250, 10], hint: '炮战系：狙击 16inch Mk7' },
    { name: '彻甲弹', v: [10, 90, 90, 30], hint: '炮战系：狙击 Mk8穿甲弹' },
    { name: '电探通用', v: [10, 10, 250, 250], hint: '炮战/空母系：开发全部电探' },
    { name: '反潜通用', v: [10, 30, 10, 31], hint: '水雷系：声呐/爆雷' },
    { name: '对空通用', v: [20, 20, 10, 20], hint: '空母系：机枪/高角炮' },
    { name: '省资材日常', v: [10, 10, 10, 11], hint: '高失败率配方，只做日常任务用' }
  ];

  /* 近代化改修列表：舰种筛选与排序（会话内保留，切换标签不重置） */
  let modType = 'ALL';
  let modSort = { key: 'lv', dir: -1 };
  function cmpModShip(a, b) {
    let r;
    if (modSort.key === 'time') {
      const ta = a.obtainedAt || parseInt(a.uid.slice(1), 10);
      const tb = b.obtainedAt || parseInt(b.uid.slice(1), 10);
      r = ta - tb;
    } else {
      r = a.lv - b.lv;
    }
    if (r === 0) r = parseInt(a.uid.slice(1), 10) - parseInt(b.uid.slice(1), 10);
    return r * modSort.dir;
  }

  function factory(root, arg) {
    let tab = arg === 'dev' ? 'dev' : arg === 'improve' ? 'improve' : arg === 'modernize' ? 'modernize' : arg === 'equip' ? 'equip' : 'build';
    /* 当前配方（输入框值，默认舰载机通用公式） */
    let lastDevRecipe = null;
    function currentDevRecipe() {
      const vals = [0, 1, 2, 3].map(i => {
        const el = document.getElementById('df' + i);
        return el ? Math.max(0, parseInt(el.value, 10) || 0) : (lastDevRecipe ? [lastDevRecipe.fuel, lastDevRecipe.ammo, lastDevRecipe.steel, lastDevRecipe.baux][i] : [20, 60, 10, 110][i]);
      });
      const r = { fuel: vals[0], ammo: vals[1], steel: vals[2], baux: vals[3] };
      lastDevRecipe = r;
      return r;
    }
    render();

    function render() {
      root.innerHTML = `
        <div class="tabs">
          <button class="${tab === 'build' ? 'active' : ''}" data-t="build">舰娘建造</button>
          <button class="${tab === 'dev' ? 'active' : ''}" data-t="dev">装备开发</button>
          <button class="${tab === 'improve' ? 'active' : ''}" data-t="improve">改修工厂</button>
          <button class="${tab === 'modernize' ? 'active' : ''}" data-t="modernize">近代化改修</button>
          <button class="${tab === 'equip' ? 'active' : ''}" data-t="equip">装备仓库</button>
        </div>
        ${tab === 'build' ? buildPanel() : tab === 'dev' ? devPanel() : tab === 'improve' ? improvePanel() : tab === 'modernize' ? modernizePanel() : equipPanel()}`;
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
                <div><b>${UI.shipNameHtml(def)}</b> <span class="dim">${UI.esc(def.en)}</span> ${UI.portraitImg(c.shipId, '', 'style="width:48px;height:64px;object-fit:cover"')}</div>
                <div><span class="countdown" data-until="${c.end}">${left > 0 ? Util.fmtTime(left) : '完成！'}</span></div>
                <button class="btn btn-gold btn-sm" data-claim="${i}" ${left > 0 ? 'disabled' : ''}>领取</button>
              </div></div>`;
          }).join('') || '<span class="dim">队列为空</span>'}
        </div>
        <div class="hint">配方决定可建造的舰种与稀有度。空母/战列舰需要更高资源投入。时间按现实时间比例压缩。</div>
      </div>`;
    }

    /* ============ 装备开发（参照 kcwiki「开发」：即时结算 + 开发池预览） ============ */
    function devPanel() {
      const st = Game.state;
      const sec = st.ships[st.fleet[1][0]];
      const secKey = secretaryKey(sec ? Game.shipDef(sec) : null);
      const devMats = st.resources.devMats || 0;
      const recipe = currentDevRecipe();
      const pv = Factory.developPreview(recipe, sec ? sec.uid : null);
      return `<div class="panel">
        <h3>装备开发 <span class="dim">开发资材：<span class="devmat">◎ ${devMats}/3000</span></span></h3>
        <div class="hint">秘书舰：${sec ? `${UI.esc(Game.shipDef(sec).zh)}（${DEV_SEC_ZH[secKey] || '无对应开发系'}）` : '无（需设置第一舰队旗舰）'}
          ｜ 说明：${DEV_SEC_DESC[secKey] || ''}</div>
        <div class="resource-formula">
          ${['燃料', '弹药', '钢材', '铝土'].map((n, i) => {
            const v = recipe ? [recipe.fuel, recipe.ammo, recipe.steel, recipe.baux] : [20, 60, 10, 110];
            return `<div><label>${n}</label><input type="number" min="0" max="9999" id="df${i}" value="${v[i]}" data-dinput="${i}"></div>`;
          }).join('')}
        </div>
        <div class="btn-row">
          ${DEV_PRESETS.map(p => `<span class="preset-recipe" data-p="${p.v.join(',')}" title="${p.hint}">${p.name}</span>`).join('')}
        </div>
        <div class="btn-row">
          <button class="btn btn-gold" data-act="dev" ${devMats < 1 || !sec ? 'disabled' : ''}>开发（消耗1开发资材，${sec ? '' : '需秘书舰'}）</button>
          <button class="btn btn-gold" data-act="dev10" ${devMats < 1 || !sec ? 'disabled' : ''}>10连开发 ×10</button>
        </div>
        <div id="devPoolPreview">${devPoolHtml()}</div>
        <div class="hint">规则：投入四项资源（必消耗）+ 1开发资材（成功才消耗）。最高资源决定开发池（油/钢 &gt; 弹药 &gt; 铝）；提督等级≥装备稀有度×3 且 四项资源≥最低资源要求才会成功。开发不论成败均计入每日任务。10连开发按份数整批校验资源，开发资材按成功数逐个消耗、不足时提前停止。</div>
      </div>`;
    }

    /* 开发池预览（独立渲染，供配方输入时局部刷新） */
    function devPoolHtml() {
      const st = Game.state;
      const sec = st.ships[st.fleet[1][0]];
      const pv = Factory.developPreview(currentDevRecipe(), sec ? sec.uid : null);
      return `<div class="section-title">当前开发池：${UI.esc(pv.secZh)} · ${UI.esc(pv.poolZh)} <span class="dim">（出货率=份额×2%，每池50等份）</span></div>
        ${pv.entries.length ? `<table class="dev-pool-table">
          <tr><th>可出装备</th><th>类别</th><th>出货率</th><th>最低资源要求(油/弹/钢/铝)</th></tr>
          ${pv.entries.map(e => {
            const ed = EquipmentData[e.id];
            const req = devMinReq(ed);
            const needLv = (ed.r || 1) * 3;
            return `<tr>
              <td><b>${UI.esc(ed.zh)}</b> <span class="dim">${UI.esc(ed.en)}</span></td>
              <td class="dim">${EQUIP_CAT_ZH[ed.cat] || ed.cat}</td>
              <td class="num">${e.pct}%</td>
              <td class="dim">${req.fuel}/${req.ammo}/${req.steel}/${req.baux}${st.admiral.level < needLv ? `（需Lv.${needLv}）` : ''}</td>
            </tr>`;
          }).join('')}
          <tr class="dev-fail"><td colspan="4"><b>开发失败</b> <span class="dim">（失败时资源被消耗，但开发资材不消耗）</span></td><td class="num">${pv.failPct}%</td></tr>
        </table>` : `<div class="hint">该秘书舰系在此资源比例下没有可开发的装备，请更换秘书舰或资源配方。</div>`}`;
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
      const allShips = Object.values(st.ships);
      const ships = allShips
        .filter(s => modType === 'ALL' || Game.shipDef(s).type === modType)
        .sort(cmpModShip);
      const typeNames = Object.keys(SHIP_TYPE_ZH).filter(t => allShips.some(s => Game.shipDef(s).type === t));
      const sortOpts = [
        ['lv:-1', '等级 高→低'], ['lv:1', '等级 低→高'],
        ['time:-1', '入手 新→旧'], ['time:1', '入手 旧→新']
      ];
      return `<div class="panel">
        <h3>近代化改修 <span class="dim">（利用多余的舰娘强化目标舰属性，最多选5艘素材）</span></h3>
        ${ships.length ? `<div class="roster-tools">
          <span class="dim">舰种</span>
          ${['ALL', ...typeNames].map(t =>
            `<span class="preset-recipe ${modType === t ? 'active' : ''}" data-mtype="${t}">${t === 'ALL' ? '全部' : SHIP_TYPE_ZH[t]}</span>`
          ).join('')}
          <span class="dim" style="margin-left:14px">排序</span>
          ${sortOpts.map(([key, label]) =>
            `<span class="preset-recipe ${modSort.key + ':' + modSort.dir === key ? 'active' : ''}" data-msort="${key}">${label}</span>`
          ).join('')}
          <span class="dim">共 ${ships.length} 艘</span>
        </div>
        <div class="mod-ship-list">
          ${ships.map(s => {
            const def = Game.shipDef(s);
            const modInfo = Progression.modernizeInfo(s.uid);
            const caps = modInfo ? modInfo.gains : {};
            const avail = Object.keys(caps).length > 0;
            const capTxt = Object.keys(caps).map(k => `${zh[k]}+${caps[k]}`).join(' ');
            return `<div class="improve-row ${avail ? '' : 'improve-locked'}">
              <div class="grow">
                <b>${UI.shipNameHtml(def)}</b> <span class="dim">Lv.${s.lv}${s.kai === 1 ? '改' : s.kai >= 2 ? '改二' : ''} · ${SHIP_TYPE_ZH[def.type]}</span>
                <div class="dim">剩余可改修：${capTxt || '改修MAX'}</div>
              </div>
              ${avail ? `<button class="btn btn-gold btn-sm" data-mod-target="${s.uid}">近代化改修</button>` : '<span class="dim">改修MAX</span>'}
            </div>`;
          }).join('')}
        </div>` : allShips.length ? '<span class="dim">没有符合条件的舰娘</span>' : '<span class="dim">还没有舰娘，先去建造吧！</span>'}
        <div class="hint">规则：消耗 油30/弹30，素材舰将被解体（装备一并销毁）。素材属性由舰种/改造形态决定（参照 wiki 素材列表）；奖励/偏斜各50%，素材合计 +4/+9/+14/+19/+24 额外奖励点。上限：火力/雷装/对空/装甲=基础×1.3；海防舰(DE)素材可喂 耐久+2/对潜+9/运+8（改造后继承）。改造会重置 火力/雷装/对空/装甲 的改修值。</div>
      </div>`;
    }

    /* ============ 装备仓库（一览 + 解体，参照 wiki「装备」与解体回收） ============ */
    function equipPanel() {
      const st = Game.state;
      const all = Object.values(st.equipment);
      const groups = {};
      for (const eq of all) {
        const ed = EquipmentData[eq.id];
        if (!ed) continue;
        (groups[ed.cat] = groups[ed.cat] || []).push(eq);
      }
      const catOrder = ['小主炮', '中主炮', '大主炮', '副炮', '鱼雷', '舰战', '舰攻', '舰爆', '水侦', '水爆', '对空电探', '对水电探', '高角炮', '机枪', '声呐', '爆雷', '穿甲弹', '设备'];
      const usedBy = {};
      for (const s of Object.values(st.ships)) for (const e of s.equipped || []) usedBy[e] = s.uid;
      const total = all.length;
      return `<div class="panel">
        <h3>装备仓库 <span class="dim">共 ${total} 件（点击「解体」回收资源；装备中的装备需先卸下）</span></h3>
        <div class="hint">装备可在「舰娘详情 → 点击装备槽」安装/卸下。多余装备建议解体换资源，或在「改修工厂」用作改修素材。</div>
        ${Object.keys(groups).sort((a, b) => catOrder.indexOf(a) - catOrder.indexOf(b)).map(cat => {
          const list = groups[cat];
          return `<div class="section-title">${EQUIP_CAT_ZH[cat] || cat}（${list.length}）</div>
            ${list.map(eq => {
              const ed = EquipmentData[eq.id];
              const stx = Object.entries(ed.stat).map(([k, v]) => `${EQUIP_STAT_ZH[k]}${v > 0 ? '+' : ''}${v}`).join(' ');
              const eqd = usedBy[eq.uid];
              const scrap = ed.scrap || {};
              return `<div class="equip-row">
                <div class="grow">
                  <b>${UI.esc(ed.zh)}</b> ${UI.starHtml(eq)}
                  ${eq.locked ? '<span class="state-badge morale">锁</span>' : ''}
                  <span class="dim">(${EQUIP_CAT_ZH[ed.cat] || ed.cat}) ${stx}</span>
                </div>
                <div class="dim">${eqd ? `装备中·${UI.esc(UI.shipTitle(st.ships[eqd]))}` : '库存'}
                  ｜ 解体：${Object.keys(scrap).map(k => `${EQUIP_STAT_ZH[k]}${scrap[k]}`).join(' ') || '无'}</div>
                <div class="btn-row" style="gap:4px">
                  ${eqd ? '' : `<button class="btn btn-sm" data-eq-lock="${eq.uid}">${eq.locked ? '解锁' : '上锁'}</button>
                    <button class="btn btn-sm btn-red" data-eq-scrap="${eq.uid}">解体</button>`}
                </div>
              </div>`;
            }).join('')}`;
        }).join('') || '<span class="dim">仓库为空，去「装备开发」制造装备吧！</span>'}
        <div class="hint">解体回收量：<b>燃料/弹药/钢材/铝土</b> 按装备种类返还（参照 wiki：装备解体获得钢材与铝土为主）。开发成功判定的「最低资源要求」= 解体回收值×10。</div>
      </div>`;
    }

    function wirePanel() {
      root.querySelectorAll('.preset-recipe[data-p]').forEach(el => {
        el.addEventListener('click', () => {
          const v = el.dataset.p.split(',').map(Number);
          const prefix = tab === 'build' ? 'bf' : 'df';
          v.forEach((x, i) => { const inp = document.getElementById(prefix + i); if (inp) inp.value = x; });
          if (prefix === 'df') render();
        });
      });
      /* 近代化改修列表：舰种筛选 / 排序 */
      root.querySelectorAll('[data-mtype]').forEach(el =>
        el.addEventListener('click', () => { modType = el.dataset.mtype; render(); }));
      root.querySelectorAll('[data-msort]').forEach(el =>
        el.addEventListener('click', () => {
          const [key, dir] = el.dataset.msort.split(':');
          modSort = { key, dir: parseInt(dir, 10) };
          render();
        }));
      /* 开发配方变化 → 局部刷新开发池预览（避免重渲染丢失输入焦点） */
      if (tab === 'dev') {
        root.querySelectorAll('[data-dinput]').forEach(inp => inp.addEventListener('input', () => {
          lastDevRecipe = null;
          const box = document.getElementById('devPoolPreview');
          if (box) box.innerHTML = devPoolHtml();
        }));
      }
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
        const r = Factory.develop(recipe, sec ? sec.uid : null);
        if (!r.ok) { UI.toast(r.msg); return; }
        Game.save();
        if (r.success) {
          const pv = r.pv;
          const statsTxt = Object.entries(r.eq && EquipmentData[r.eq.id].stat || {}).map(([k, v]) => `${EQUIP_STAT_ZH[k]}+${v}`).join(' ');
          const m = UI.modal(`
            <span class="modal-close" data-close>×</span>
            <h3>开发成功！</h3>
            <div class="text-center" style="padding:16px">
              <div style="font-size:20px">${UI.esc(EquipmentData[r.eq.id].zh)}</div>
              <div class="dim">${UI.esc(EquipmentData[r.eq.id].en)} · ${EQUIP_CAT_ZH[EquipmentData[r.eq.id].cat]} ${statsTxt}</div>
            </div>
            <div class="hint">消耗 1 开发资材（剩余 ${Game.state.resources.devMats || 0}）。${UI.esc(pv.secZh)}·${UI.esc(pv.poolZh)} 出货率 ${pv.entries.find(x => x.id === r.eq.id).pct}%。</div>
            <div class="btn-row"><button class="btn btn-gold" data-close>好</button></div>`);
          m.root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { m.close(); render(); }));
        } else {
          UI.toast(r.msg);
          render();
        }
      });
      const dev10Btn = root.querySelector('[data-act="dev10"]');
      if (dev10Btn) dev10Btn.addEventListener('click', () => {
        const rv = readRecipe('df');
        const recipe = { fuel: rv[0].v, ammo: rv[1].v, steel: rv[2].v, baux: rv[3].v };
        const sec = Game.state.ships[Game.state.fleet[1][0]];
        const r = Factory.developBatch(recipe, sec ? sec.uid : null, 10);
        if (!r.ok) { UI.toast(r.msg); return; }
        Game.save();
        const groups = {};
        for (const eq of r.eqs) groups[eq.id] = (groups[eq.id] || 0) + 1;
        const listHtml = Object.keys(groups).map(id => `${UI.esc(EquipmentData[id].zh)}×${groups[id]}`).join('、');
        const m = UI.modal(`
          <span class="modal-close" data-close>×</span>
          <h3>10连开发结果</h3>
          <div class="dev-batch-result">
            <div>成功 <b>${r.success}</b> 件 ｜ 失败 <b>${r.fail}</b> 件 ｜ 消耗开发资材 <b>${r.devMatsUsed}</b> 个</div>
            ${r.eqs.length ? `<div class="section-title">获得装备</div><div>${listHtml}</div>` : ''}
            ${r.stopped ? `<div class="hint" style="color:#ff9a9a">开发资材不足，本次共进行 ${r.attempts} 次后停止。</div>` : ''}
          </div>
          <div class="btn-row"><button class="btn btn-gold" data-close>好</button></div>`);
        m.root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { m.close(); render(); }));
      });
      root.querySelectorAll('[data-claim]').forEach(b => {
        b.addEventListener('click', () => {
          const r = Factory.claimBuild(parseInt(b.dataset.claim, 10));
          if (!r.ok) { UI.toast(r.msg); return; }
          UI.toast(`建造完成！获得 ${UI.esc(Game.shipDef(r.ship).zh)}！`);
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
      root.querySelectorAll('[data-eq-scrap]').forEach(b => {
        b.addEventListener('click', () => {
          const euid = b.dataset.eqScrap;
          const ed = Game.state.equipment[euid] && EquipmentData[Game.state.equipment[euid].id];
          if (!confirm(`确定解体 ${ed ? UI.esc(ed.zh) : ''}？将回收资源。`)) return;
          const r = Factory.scrapEquip(euid);
          if (!r.ok) { UI.toast(r.msg); return; }
          const g = Object.keys(r.gain).map(k => `${EQUIP_STAT_ZH[k]}+${r.gain[k]}`).join(' ');
          UI.toast(`已解体 ${UI.esc(r.name)}！获得 ${g}`);
          Game.save(); render();
        });
      });
      root.querySelectorAll('[data-eq-lock]').forEach(b => {
        b.addEventListener('click', () => {
          const r = Factory.toggleEquipLock(b.dataset.eqLock);
          if (!r.ok) { UI.toast(r.msg); return; }
          Game.save(); render();
        });
      });
    }
  }

  return { factory };
})();

UI.Screens.factory = FactoryUI.factory;
