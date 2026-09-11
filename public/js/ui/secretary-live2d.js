/* 秘书舰分层立绘（近似 Live2D）
 *
 * 素材来自 See-through 的 23 层语义分层，数据在 js/data/live2d.js。
 * 动作：
 *   - 呼吸：身体组以「脚底」为支点整体纵向微缩放
 *   - 摇摆 + 视线跟随：鼠标位置驱动头部旋转/平移
 *   - 眨眼：眼球形状的肤色贴片（eyelid.png）从眼睛上缘往下盖（效果很好，素材够大）
 *   - 口型：说话（点击秘书舰）时嘴部层纵向拉伸
 *           ⚠️ 素材限制：See-through 输出的 mouth 层只有 22×6 px / 19 个不透明像素，
 *           放大后实际显示约 10×3 px，所以口型**只能看出微弱动静**。
 *           要做真正的口型，需要另做「张嘴」差分图替换 mouth.png。
 *
 * 三条硬约束（踩过坑，别改）：
 *   1) **脖子必须 100% 跟随头部**。刚性变换下让脖子少转，下巴和脖子会脱节裂开。
 *   2) **各层的 transform-origin 必须换算到自身坐标系**（容器坐标 - 层的 left/top）。
 *      用百分比不行——各层尺寸不同。
 *   3) **层序里 neck 必须在 topwear 之后**，否则脖子被衣领盖住（见 install_live2d.py）。
 *
 * 需要「跟随头部 + 自己的额外缩放」的层（眼睑、嘴）用一层 div 包一层 img：
 * 外层负责 --ht 跟随，内层负责 scaleY。一个元素只有一个 transform-origin，不能混。
 */
window.SecretaryL2D = (function () {
  const SETS = window.LIVE2D_SETS || {};

  /* 动作幅度。分层是「刚性变换」，幅度过大会在接缝处露馅。 */
  const CFG = {
    swayAmp: 0.42,      // 头部常驻摇摆（度）
    swaySpd: 0.75,
    swayAmp2: 0.12,     // 叠加的高频抖动，让摇摆不机械
    swaySpd2: 1.9,
    lookAmp: 1.15,      // 鼠标驱动的头部旋转（度）
    lookAmpY: 0.7,
    lookShift: 2.2,     // 鼠标驱动的头部平移（画布像素）
    lookShiftY: 1.4,
    breatheAmp: 0.0045, // 呼吸幅度（纵向缩放比例）
    breatheSpd: 1.15,
    follow: 0.08,       // 鼠标跟随平滑系数

    blinkDur: 170,      // 单次眨眼时长（毫秒）——太快会看漏
    blinkGapMin: 1600,  // 两次眨眼间隔
    blinkGapMax: 4600,
    mouthAmp: 2.2,      // 说话时嘴部额外拉伸幅度（嘴部素材只有 22×6 px，见下方说明）
    mouthSpd: 13,
    talkDur: 1600,      // 点击后「说话」持续时长
  };

  function setOf(id) { return SETS[id] || null; }
  function has(id) { return !!SETS[id]; }

  /* 生成 .sec-frame 内部的分层 DOM（不含右下角舰种徽章） */
  function html(id) {
    const s = setOf(id);
    if (!s) return null;
    const parts = s.layers.map(L => {
      const name = L[0];
      const pos = `left:${L[2]}px;top:${L[3]}px;width:${L[4]}px;height:${L[5]}px;`;
      const img = `<img src="${s.dir}${L[1]}" alt="" draggable="false">`;
      // 眼睑 / 嘴：外层跟随头部，内层自己做缩放
      if (name === s.eyelid) return `<div class="l2d-node hl hel" style="${pos}">${img}</div>`;
      if (name === s.mouth) return `<div class="l2d-node hl hm" style="${pos}">${img}</div>`;
      const cls = name === s.neck ? 'hn' : (s.head.indexOf(name) >= 0 ? 'hl' : 'hb');
      return `<img class="${cls}" src="${s.dir}${L[1]}" alt="" draggable="false" style="${pos}">`;
    });
    return `<div class="l2d-wrap"><div class="l2d-stage" style="width:${s.canvas}px;`
      + `height:${s.canvas}px;">${parts.join('')}</div></div>`;
  }

  function bind(frame, id) {
    const s = setOf(id);
    if (!frame || !s) return;
    const wrap = frame.querySelector('.l2d-wrap');
    const stage = frame.querySelector('.l2d-stage');
    if (!wrap || !stage) return;

    const heads = [...stage.querySelectorAll('.hl')];
    const necks = [...stage.querySelectorAll('.hn')];
    const bodies = [...stage.querySelectorAll('.hb')];
    const C = s.canvas, [OX, OY] = s.origin, [BL, BT, BW, BH] = s.bbox;

    /* 旋转支点：头部/脖子 = 脖子根部；身体 = 画布底边中心（呼吸时脚不动） */
    const originOf = (el, cx, cy) => {
      const l = parseFloat(el.style.left) || 0, t = parseFloat(el.style.top) || 0;
      el.style.transformOrigin = `${cx - l}px ${cy - t}px`;
    };
    [...heads, ...necks].forEach(el => originOf(el, OX, OY));
    bodies.forEach(el => originOf(el, C / 2, C));

    stage.style.setProperty('--lid', '0');     // 0 = 睁眼
    stage.style.setProperty('--mouth', '1');   // 1 = 原状

    /* 把角色包围盒适配进 .l2d-wrap（按高度适配、水平居中） */
    function fit() {
      if (!frame.isConnected) return;
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (!w || !h) return;
      const k = Math.min(w / BW, h / BH);
      const tx = (w - BW * k) / 2 - BL * k;
      const ty = (h - BH * k) / 2 - BT * k;
      stage.style.transform = `translate(${tx.toFixed(2)}px,${ty.toFixed(2)}px) scale(${k.toFixed(4)})`;
    }
    fit();
    window.addEventListener('resize', fit);

    /* 鼠标位置 → 归一化到 [-1,1] */
    let mx = 0, my = 0, cx = 0, cy = 0;
    frame.addEventListener('mousemove', ev => {
      const r = frame.getBoundingClientRect();
      if (!r.width || !r.height) return;
      mx = Math.max(-1, Math.min(1, ((ev.clientX - r.left) / r.width - 0.5) * 2));
      my = Math.max(-1, Math.min(1, ((ev.clientY - r.top) / r.height - 0.5) * 2));
    });
    frame.addEventListener('mouseleave', () => { mx = 0; my = 0; });

    /* 说一句话：点击秘书舰时嘴动一会儿 */
    let talkUntil = 0;
    frame.addEventListener('click', () => { talkUntil = performance.now() + CFG.talkDur; });

    let raf = null;
    let blinkSeq = 0, blinking = false, nextBlink = performance.now() + 900 + Math.random() * 2000;
    const t0 = performance.now();

    function loop(now) {
      if (!frame.isConnected) { raf = null; return; }   // 页面切走自动停
      const t = (now - t0) / 1000;
      cx += (mx - cx) * CFG.follow;
      cy += (my - cy) * CFG.follow;

      // 头部：常驻摇摆 + 视线跟随（脖子 100% 跟随，这是硬约束）
      const sway = Math.sin(t * CFG.swaySpd) * CFG.swayAmp + Math.sin(t * CFG.swaySpd2) * CFG.swayAmp2;
      const rx = cx * CFG.lookAmp + sway;
      const px = cx * CFG.lookShift, py = cy * CFG.lookShiftY;
      stage.style.setProperty('--ht',
        `rotate(${rx.toFixed(2)}deg) translate(${px.toFixed(2)}px,${py.toFixed(2)}px)`);

      // 身体：呼吸（以脚底为支点，不是整体位移）
      const br = 1 + Math.sin(t * CFG.breatheSpd) * CFG.breatheAmp;
      stage.style.setProperty('--bt', `scaleY(${br.toFixed(5)})`);

      // 眨眼：一次开合 145ms，sin 曲线让它快闭快开
      if (!blinking && now > nextBlink) { blinking = true; blinkSeq = now; }
      if (blinking) {
        const d = (now - blinkSeq) / CFG.blinkDur;
        if (d >= 1) {
          blinking = false;
          nextBlink = now + CFG.blinkGapMin + Math.random() * (CFG.blinkGapMax - CFG.blinkGapMin);
          stage.style.setProperty('--lid', '0');
        } else {
          stage.style.setProperty('--lid', Math.sin(d * Math.PI).toFixed(3));
        }
      }

      // 口型：说话时嘴部纵向拉伸
      if (now < talkUntil) {
        const v = 1 + Math.abs(Math.sin(t * CFG.mouthSpd)) * CFG.mouthAmp;
        stage.style.setProperty('--mouth', v.toFixed(2));
      } else if (stage.style.getPropertyValue('--mouth') !== '1') {
        stage.style.setProperty('--mouth', '1');
      }

      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
  }

  return { has, html, bind };
})();
