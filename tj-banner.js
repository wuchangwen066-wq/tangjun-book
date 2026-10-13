/* ==================================================================
   棠郡 · 桌案横幅（正文层）
   ------------------------------------------------------------------
   作者 2026-10-04 定：正文里是一条窄横幅；点册子，**原来那套完整的棠郡·一册
   就从书里长出来**；再点收回。
   作者 2026-10-06（B 组）：hover 上浮/放大/发光全部撤除，点一下就开；
   点卷轴 → TJ_Map.open() 开「棠郡輿圖」。
   作者 2026-10-06（桌面展示重构）：撤掉「空桌＋书＋卷轴拼装」——
     · 盘面只用一张**成品参考图**（assets/桌案/position-ref.webp，2091×752），
       书与卷轴的像素已画在图里，前端不再叠任何抠图/影/光层；
     · 抠图只做两件事：①提取**轮廓 SVG path**（core/tj-desk-paths.js，
       生成器 tools/make_desk_paths.py，坐标=参考图像素）；②命中判定
       （命中 path 与轮廓同形，fill-rule:evenodd）；
     · 悬停/键盘聚焦 → 「勾边」描画动画：沿轮廓向外 1–2px 的细朱砂线
       ＋更细的泥金线（stroke-dasharray 描画 ≈0.5s，错位起步），
       物件本身不位移、不放大；移出淡出；
     · 层级：卷轴的勾边被**书体轮廓裁掉**（SVG <mask> 用 book.line 反填），
       书的勾边完整显示 —— 书压卷轴。
     · 触屏无悬停：点击直接开。

   本文件是一个**自包含模块**，正文里只需多一行 <script src="core/tj-banner.js">：
     ① 启动时把现有 .viewport（＝整套册子）收进 [data-tj-panel] 面板里，初始隐藏；
     ② 在它前面插入横幅（参考图 + 轮廓 SVG + 信息笺）；
     ③ 点书 → 浮窗以**书心**为 origin 展开（或回退原位展开）；
     ④ 时间与信息笺**读的是 TJState.getState() 那一份**，不另存；
     ⑤ 非最新楼层调 TJ_Banner.setStatic(true) → 停插值/停过渡，只留静态案面。

   素材：assets/桌案/position-ref.webp（作者「参考摆放位置图」，等比 2091/752）
   轮廓：core/tj-desk-paths.js → window.TJ_DESK_PATHS（勿手改，工具生成）
   光源：窗棂光带自左上铺向右下（已画进参考图，前端只保留时辰调色）。

   刻意不改册子本身的视觉（工程指令 §10），只加"开关入口 + 初始隐藏"。
   ================================================================== */
(function () {
  'use strict';

  /* 桌案图：酒馆把正则输出渲染成 srcdoc iframe，那里 <base> 不生效 →
     相对路径 'assets/桌案/position-ref.webp' 会解析不到 → 白桌案（2026-10-12 复现）。
     改为从**脚本自身 URL** 推导站点根；发布树是拍平的，图就在脚本旁边。
     本地预览服务同样按根路径提供该文件，一并兼容。 */
  var _bs = (document.currentScript && document.currentScript.src) || '';
  var _bd = _bs ? _bs.replace(/[^/]*$/, '') : '';
  var IMG = { desk: _bd + 'position-ref.webp' };
  var RATIO = 2.7806;                /* 2091/752；条带高度随宽度自然得出 */

  /* ---------- 光影关键帧：集中在此，方便手调 ---------- */
  var KEYS = [
    { h: 5.5, name: '清晨', bright: 1.04, sat: .94, hue: -6,
      grade: 'rgba(150,190,220,.30)', gradeOp: .55, gradeBlend: 'soft-light',
      lit: 'rgba(198,226,255,.40)', litOp: .34, litShift: -2.2, litTilt: -2,
      shadowOp: .46, shadowBlur: 9, shadowSpread: 1.15, ambOp: .30, bookBright: .99, bookTone: .26 },
    { h: 10, name: '日中', bright: 1.0, sat: 1.0, hue: 0,
      grade: 'rgba(255,236,200,.10)', gradeOp: .18, gradeBlend: 'soft-light',
      lit: 'rgba(255,240,214,.34)', litOp: .16, litShift: 0, litTilt: 0,
      shadowOp: .50, shadowBlur: 5, shadowSpread: .95, ambOp: .38, bookBright: 1, bookTone: .14 },
    { h: 15, name: '午后', bright: .99, sat: 1.02, hue: 2,
      grade: 'rgba(255,226,176,.16)', gradeOp: .30, gradeBlend: 'soft-light',
      lit: 'rgba(255,232,190,.36)', litOp: .26, litShift: 1.2, litTilt: 1,
      shadowOp: .48, shadowBlur: 7, shadowSpread: 1.1, ambOp: .36, bookBright: .99, bookTone: .18 },
    { h: 18.5, name: '傍晚', bright: .93, sat: 1.06, hue: 4,
      grade: 'rgba(255,150,70,.34)', gradeOp: .62, gradeBlend: 'soft-light',
      lit: 'rgba(255,148,70,.52)', litOp: .50, litShift: 2.4, litTilt: 2,
      shadowOp: .56, shadowBlur: 6, shadowSpread: 1.3, ambOp: .40, bookBright: .97, bookTone: .30 },
    { h: 21, name: '入夜', bright: .60, sat: .88, hue: -8,
      grade: 'rgba(90,120,190,.34)', gradeOp: .72, gradeBlend: 'multiply',
      lit: 'rgba(150,180,255,.26)', litOp: .12, litShift: 1.5, litTilt: 1,
      shadowOp: .34, shadowBlur: 12, shadowSpread: 1.2, ambOp: .26, bookBright: .96, bookTone: .34 },
    { h: 1, name: '深夜', bright: .52, sat: .82, hue: -10,
      grade: 'rgba(70,100,175,.40)', gradeOp: .8, gradeBlend: 'multiply',
      lit: 'rgba(140,175,255,.20)', litOp: .07, litShift: 1, litTilt: 0,
      shadowOp: .28, shadowBlur: 14, shadowSpread: 1.1, ambOp: .22, bookBright: .93, bookTone: .40 },
  ];

  var CSS = [
    /* ⓪ 页面本体：这套册子原本是"一屏装一册"的固定视口（html,body 都是 overflow:hidden）。
       横幅形态下必须能长高 —— 展开的册子在文档流里（原位展开），页高要跟着涨，
       否则在自带预览页 / 楼层 iframe 里都会被裁掉。 */
    'html,body{height:auto!important;min-height:0!important}',
    'body{overflow-y:auto!important;overflow-x:hidden!important}',
    /* 横幅：就是案面图本身，比例取原图，永不变形 */
    '.tj-banner{position:relative;display:flex;justify-content:center;margin:8px auto;max-width:100%}',
    /* 案面条带：宽度**与正文（册子）对齐** —— 用 JS 量 `.book` 的实际宽度写进
       `--tj-plate-w`（见 syncPlateWidth）。为什么不用 CSS 的 `--page-w`：
       它定义在 `.book` 上、**不继承到横幅**（横幅是册子的兄弟），
       于是 `calc(var(--page-w)*2)` 在自带预览页里整条失效（横幅会撑满屏）。
       高度仍由 2.775 画幅自然得出，**不设上限**（设了就会把桌面压扁 —— 踩过）。 */
    '.tj-plate{position:relative;width:min(100%,var(--tj-plate-w,100%));aspect-ratio:' + RATIO + ';',
    'overflow:hidden;border-radius:4px;isolation:isolate}',
    '.tj-banner.is-open .tj-plate{overflow:visible}',
    '.tj-scene{position:absolute;inset:0;transition:filter 1.5s var(--ease,cubic-bezier(.22,.8,.2,1));',
    'filter:brightness(var(--tj-bright)) saturate(var(--tj-sat)) hue-rotate(var(--tj-hue))}',
    '.tj-scene>img.tj-desk{position:absolute;inset:0;width:100%;height:100%;display:block}',
    /* 轮廓 SVG：viewBox=参考图像素坐标，随盘面等比缩放 → 抠图对齐永不漂移。
       preserveAspectRatio:none —— 盘面比例与 viewBox 严格相等（同源常量），
       SVG 与底图做**同一种**拉伸，任何尺寸/窗口下都逐像素对齐。 */
    '.tj-desk-svg{position:absolute;inset:0;width:100%;height:100%;display:block;overflow:visible}',
    /* 勾边：细朱砂＋更细泥金＋一圈低透明晕染；pathLength=1 归一化，
       vector-effect 让线宽是**屏幕像素**（细线不随盘面缩放变糊/变粗）。
       悬停/聚焦只改这组描边 —— 物件本体（图画）不位移、不放大、不上浮。 */
    '.tj-dstrokes path{fill:none;stroke-linecap:round;stroke-linejoin:round;',
    'stroke-dasharray:1;stroke-dashoffset:0;opacity:0;vector-effect:non-scaling-stroke;',
    'transition:opacity 240ms var(--ease,cubic-bezier(.22,.8,.2,1))}',
    '.tj-d-halo{stroke:rgba(143,42,35,.30);stroke-width:4.5px}',
    '.tj-d-zhu{stroke:#a8322a;stroke-width:1.8px}',
    '.tj-d-gold{stroke:#b8955a;stroke-width:1px}',
    /* 描画动画：从起点沿轮廓走一圈（dashoffset 1→0），朱砂先动、泥金错位跟进 */
    '.tj-dobj.is-lit .tj-d-halo,.tj-dobj:focus-within .tj-d-halo{animation:tj-draw 560ms var(--ease,cubic-bezier(.22,.8,.2,1)) forwards}',
    '.tj-dobj.is-lit .tj-d-zhu,.tj-dobj:focus-within .tj-d-zhu{animation:tj-draw 560ms var(--ease,cubic-bezier(.22,.8,.2,1)) 60ms forwards}',
    '.tj-dobj.is-lit .tj-d-gold,.tj-dobj:focus-within .tj-d-gold{animation:tj-draw 560ms var(--ease,cubic-bezier(.22,.8,.2,1)) 140ms forwards}',
    '@keyframes tj-draw{0%{stroke-dashoffset:1;opacity:1}100%{stroke-dashoffset:0;opacity:1}}',
    /* 命中 path：与抠图轮廓同形（evenodd 连洞），透明但吃指针；焦点环不画（作者定） */
    '.tj-d-hit{fill:#000;fill-opacity:0;stroke:none;pointer-events:all;cursor:pointer;',
    'outline:none;-webkit-tap-highlight-color:transparent}',
    '.tj-d-hit:focus,.tj-d-hit:focus-visible{outline:none}',
    /* 开册后书组退场（旧楼层的 .tj-book 按钮已由命中 path 承担） */
    /* 光层（都在图内） */
    '.tj-grade{position:absolute;inset:0;pointer-events:none;background:var(--tj-grade);',
    'opacity:var(--tj-grade-op);mix-blend-mode:var(--tj-grade-blend);',
    'transition:opacity 1.5s var(--ease),background-color 1.5s var(--ease)}',
    '.tj-lit{position:absolute;inset:-20% -10%;pointer-events:none;mix-blend-mode:screen;opacity:var(--tj-lit-op);',
    'background:linear-gradient(104deg,transparent 8%,var(--tj-lit) 26%,transparent 46%,var(--tj-lit) 62%,transparent 80%);',
    'transition:opacity 1.5s var(--ease),background 1.5s var(--ease),transform 1.5s var(--ease)}',
    /* 信息笺：写在图内 */
    '.tj-slip{position:absolute;left:2.4%;top:8%;display:flex;flex-direction:column;gap:2px;',
    'padding:6px 9px 7px;min-width:88px;border-radius:3px;color:#2a241c;cursor:default;',
    'background:linear-gradient(180deg,rgba(238,228,203,.93),rgba(220,208,182,.93));',
    'box-shadow:1px 2px 6px rgba(0,0,0,.38);font:12px/1.32 var(--font-kai,KaiTi);letter-spacing:.05em}',
    '.tj-slip .tj-t{font-size:14px;letter-spacing:.09em}',
    '.tj-slip .tj-row{display:flex;gap:5px;align-items:baseline}',
    '.tj-slip .tj-k{color:rgba(42,36,28,.55);font-size:10.5px}',
    '.tj-slip .tj-v{transition:opacity 300ms var(--ease)}',
    '.tj-slip .tj-v.is-swap{opacity:0}',
    /* 卷轴：2026-10-06（A3）换真图（作者分层素材），位置已画进图层，插槽作废 */
    /* 展开的册子：把 .viewport 收进来当面板 —— **原位展开**（横幅下方撑开）。
       作者 2026-10-04 反馈：fixed 浮层只能覆盖 iframe 自己的视口，而楼层 iframe 的高度
       只等于横幅那一条 → 册子被裁（「图里显示不可能显示全」）。
       指令 §6 的默认方案本就是原位展开，故改为文档流内的块：
       展开时文档随之变高 → 楼层 iframe 自适应 → 整册完整可见，不再受 iframe 视口大小限制。 */
    '[data-tj-panel]{position:relative!important;inset:auto!important;z-index:2;',
    'width:min(100%,calc(var(--page-w) * 2 + 48px))!important;height:auto!important;min-height:0!important;',
    'margin:6px auto 20px;background:transparent;box-shadow:none;padding:0;',
    'transform:scale(.15);transform-origin:50% 50%;opacity:0;pointer-events:none;',
    'max-height:0;overflow:hidden;',
    'transition:transform 520ms var(--ease),opacity 420ms var(--ease),max-height 560ms var(--ease)}',
    '[data-tj-panel].is-tj-open{transform:scale(1);opacity:1;pointer-events:auto;max-height:2600px;overflow:visible}',
    '.tj-banner.is-open .tj-dobj-book{opacity:0;pointer-events:none}',
    '.tj-banner.is-open .tj-scene{',
    'filter:brightness(calc(var(--tj-bright) * .75)) saturate(var(--tj-sat)) hue-rotate(var(--tj-hue)) blur(1.2px)}',
    '.tj-banner.is-open .tj-slip{opacity:0}',
    '[data-tj-panel] .desk,[data-tj-panel] .lamp,[data-tj-panel] .toolbar{display:none!important}',
    '[data-tj-panel] .book{--page-max:520px}',
    /* 调试条 */
    '.tj-dbg{position:fixed;left:12px;bottom:12px;z-index:2147482001;display:none;gap:8px;align-items:center;',
    'padding:7px 11px;border:1px solid rgba(197,168,102,.3);border-radius:6px;',
    'background:rgba(12,10,8,.86);color:#cbbb9c;font:12px/1 KaiTi,serif}',
    'html[data-tj-debugtime] .tj-dbg{display:flex}',
    '.tj-dbg input{width:190px}',
    '@media (prefers-reduced-motion:reduce){',
    '.tj-scene,.tj-dstrokes path,[data-tj-panel]{transition-duration:1ms!important;animation:none!important}',
    /* 降级：勾边不做描画动画，聚焦/悬停直接显形 */
    '.tj-dobj.is-lit .tj-d-zhu,.tj-dobj:focus-within .tj-d-zhu,',
    '.tj-dobj.is-lit .tj-d-gold,.tj-dobj:focus-within .tj-d-gold{opacity:1;stroke-dashoffset:0}',
    '[data-tj-panel]{transform:translate(-50%,-50%) scale(1)}}',
  ].join('');

  /* ---------- 工具 ---------- */
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mixColor(c1, c2, t) {
    function pick(s) { return s.match(/[\d.]+/g).map(Number); }
    var a = pick(c1), b = pick(c2);
    var o = [0,1,2,3].map(function (i) { return lerp(a[i] || 0, b[i] || 0, t); });
    return 'rgba(' + Math.round(o[0]) + ',' + Math.round(o[1]) + ',' + Math.round(o[2]) + ',' +
           (Math.round(o[3] * 100) / 100) + ')';
  }
  function sample(h) {
    var ks = KEYS.slice().sort(function (a, b) { return a.h - b.h; });
    var lo = ks[ks.length - 1], hi = ks[0], t = 0;
    for (var i = 0; i < ks.length; i++) {
      var a = ks[i], b = ks[(i + 1) % ks.length];
      var span = (b.h - a.h + 24) % 24 || 24;
      var d = (h - a.h + 24) % 24;
      if (d <= span) { lo = a; hi = b; t = d / span; break; }
    }
    var out = {};
    ['bright','sat','hue','gradeOp','litOp','litShift','litTilt']
      .forEach(function (k) { out[k] = lerp(lo[k], hi[k], t); });
    out.grade = mixColor(lo.grade, hi.grade, t);
    out.lit = mixColor(lo.lit, hi.lit, t);
    out.gradeBlend = t < .5 ? lo.gradeBlend : hi.gradeBlend;
    out.name = t < .5 ? lo.name : hi.name;
    return out;
  }
  /** 时辰 → 小时中点；读不到返回 null（**只认 TJState 那一份数据**） */
  function hourFromState(state) {
    var t = state && state.棠郡 && state.棠郡.时地;
    if (!t) return null;
    var idx = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥']
      .indexOf(String(t.时辰 || '').trim().charAt(0));
    return idx >= 0 ? (idx * 2 + 1) % 24 : null;
  }

  var Q = new URLSearchParams(location.search);
  var r = document.documentElement;
  var hour = new Date().getHours(), staticMode = false, timer = null, busy = false, want = false;
  var sampleMode = false;   /* ?sample=1（预览）时不要用真源覆盖样例数据 */

  /* ---------- 轮廓 SVG：卷轴组在前（被书裁），书组在后（完整显示） ---------- */
  function deskSVG() {
    var DP = window.TJ_DESK_PATHS;
    if (!DP || !DP.book || !DP.scroll) return '';
    var W = DP.W || 2091, H = DP.H || 752;
    function strokes(d, masked) {
      return '<g class="tj-dstrokes"' + (masked ? ' mask="url(#tj-dmask)"' : '') + '>' +
        '<path class="tj-d-halo" d="' + d + '" pathLength="1"/>' +
        '<path class="tj-d-zhu"  d="' + d + '" pathLength="1"/>' +
        '<path class="tj-d-gold" d="' + d + '" pathLength="1"/></g>';
    }
    /* 裁剪掩模：白底 + 书体轮廓（外扩线）涂黑 → 卷轴勾边在书下消失 */
    return '<svg class="tj-desk-svg" viewBox="0 0 ' + W + ' ' + H + '" ' +
      'preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
      '<defs><mask id="tj-dmask" maskUnits="userSpaceOnUse" x="0" y="0" width="' + W + '" height="' + H + '">' +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fff"/>' +
      '<path d="' + DP.book.line + '" fill="#000"/></mask></defs>' +
      '<g class="tj-dobj tj-dobj-scroll">' +
        strokes(DP.scroll.line, true) +
        /* 2026-10-10 修：卷轴的**命中区**也要套同一张书形掩模。
           卷轴 hit 横贯整张桌案（x 约 500→1630），与书（x 约 1045→1572）大面积重叠；
           此前只裁了勾边、没裁命中区 → 点在书上却开舆图。
           SVG 的 mask 同时作用于渲染与命中测试，套上即可让卷轴在书下不接指针。 */
        '<path class="tj-d-hit" d="' + DP.scroll.hit + '" fill-rule="evenodd" ' +
          'mask="url(#tj-dmask)" tabindex="0" ' +
          'role="button" aria-label="展开棠郡舆图"/>' +
      '</g>' +
      '<g class="tj-dobj tj-dobj-book">' +
        strokes(DP.book.line, false) +
        '<path class="tj-d-hit" d="' + DP.book.hit + '" fill-rule="evenodd" tabindex="0" ' +
          'role="button" aria-label="翻开棠郡一册" aria-expanded="false"/>' +
      '</g>' +
    '</svg>';
  }

  /* ---------- 组装 ---------- */
  function build() {
    var app = document.querySelector('.viewport');
    if (!app) return null;                       /* 不是册子页就不干活 */

    var st = document.createElement('style');
    st.id = 'tj-banner-style';
    st.textContent = CSS;
    document.head.appendChild(st);

    var wrap = document.createElement('div');
    wrap.className = 'tj-banner';
    wrap.id = 'tj-banner';
    wrap.innerHTML =
      '<div class="tj-plate">' +
        '<div class="tj-scene">' +
          '<img class="tj-desk" src="' + IMG.desk + '" alt="">' +
          deskSVG() +
        '</div>' +
        '<div class="tj-grade"></div><div class="tj-lit"></div>' +
        '<div class="tj-slip" id="tj-slip">' +
          '<span class="tj-t tj-v" data-k="time">—</span>' +
          '<span class="tj-row"><span class="tj-k">在</span><span class="tj-v" data-k="place">—</span></span>' +
          '<span class="tj-row"><span class="tj-k">天</span><span class="tj-v" data-k="sky">—</span></span>' +
          '<span class="tj-row"><span class="tj-k">钱</span><span class="tj-v" data-k="money">—</span></span>' +
        '</div>' +
      '</div>';
    app.parentNode.insertBefore(wrap, app);

    /* 把整套册子收进面板（只加属性，不改它的视觉） */
    app.setAttribute('data-tj-panel', '');

    var dbg = document.createElement('div');
    dbg.className = 'tj-dbg';
    dbg.innerHTML = '<span>时辰</span><input id="tj-h" type="range" min="0" max="23.99" step="0.25">' +
                    '<b id="tj-hl"></b>';
    document.body.appendChild(dbg);

    r.style.setProperty('--tj-ease', 'cubic-bezier(.2,.8,.2,1)');

    return { app: app, wrap: wrap,
             book: wrap.querySelector('.tj-dobj-book .tj-d-hit'),
             scroll: wrap.querySelector('.tj-dobj-scroll .tj-d-hit'),
             bookG: wrap.querySelector('.tj-dobj-book'),
             scrollG: wrap.querySelector('.tj-dobj-scroll'),
             plate: wrap.querySelector('.tj-plate'),
             lit: wrap.querySelector('.tj-lit'), dbg: dbg };
  }

  /* ---------- 光影 ---------- */
  function apply(h, instant) {
    var p = sample(h);
    if (instant) r.style.setProperty('--tj-no-transition', '1');
    r.style.setProperty('--tj-bright', p.bright.toFixed(3));
    r.style.setProperty('--tj-sat', p.sat.toFixed(3));
    r.style.setProperty('--tj-hue', p.hue.toFixed(1) + 'deg');
    r.style.setProperty('--tj-grade', p.grade);
    r.style.setProperty('--tj-grade-op', p.gradeOp.toFixed(3));
    r.style.setProperty('--tj-grade-blend', p.gradeBlend);
    r.style.setProperty('--tj-lit', p.lit);
    r.style.setProperty('--tj-lit-op', p.litOp.toFixed(3));
    if (UI && UI.lit) {
      UI.lit.style.transform = 'translateY(' + (p.litShift * 6).toFixed(1) + 'px) rotate(' +
        (p.litTilt * .25).toFixed(2) + 'deg)';
    }
    r.setAttribute('data-tj-hour', p.name);
  }

  /* ---------- 信息笺：与册子同一份 state ---------- */
  function setSlip(state) {
    var tj = state && state.棠郡;
    var t = tj && tj.时地;
    if (!t) return;
    /* 随身现银：变量里是「三两零二百文」式字符串，原样显示（不做换算） */
    var next = {
      time: [t.年月日, t.时辰].filter(Boolean).join(' · ') || '—',
      place: [t.地区, t.地点].filter(Boolean).join('·') || '—',
      sky: t.天气 || '—',
      money: (tj.钱 && tj.钱.现银) || '—',
    };    Object.keys(next).forEach(function (k) {
      var el = document.querySelector('.tj-slip .tj-v[data-k="' + k + '"]');
      if (!el || el.textContent === next[k]) return;
      el.classList.add('is-swap');
      setTimeout(function () { el.textContent = next[k]; el.classList.remove('is-swap'); }, 150);
    });
    var h = hourFromState(state);
    if (h != null && !staticMode) { hour = h; apply(h); }
    else if (h != null) { hour = h; apply(h); }
  }

  /* 与册子**同一份来源**取 state：信息笺与浮窗快照都用它（不另存一份） */
  function loadState() {
    if (sampleMode || !window.TJState) return;
    try {
      var p = window.TJState.getState({});
      if (p && p.then) p.then(function (s) {
        lastState = s; setSlip(s);
        if (OV && OV.shown) applyState(s);      /* 浮窗开着 → 同步刷新它的状态 */
      }, function () {});
    } catch (e) {}
  }

  /* ---------- 展开 / 收起 ---------- */
  function setOpen(on) {
    if (!UI) return;
    if (busy) { want = on; return; }
    if (on === UI.wrap.classList.contains('is-open')) return;
    busy = true; want = on;
    /* 开 → 走**浮窗**（父文档里那个居中窗口）；浮窗不可用才回退「原位展开」 */
    /* v2.2：预览（?scenario=）不走浮窗——浮窗是开册时的文档快照，
       预览注入的 mock 数据赶不上快照；原位展开，册子 DOM 即主文档。 */
    var ov = (on && !Q.has('scenario')) ? openOverlay() : false;
    /* 册首凡例（方案 A）：首次开册亮覆盖笺。
       本侧（横幅/原位展开）同窗直调；浮窗 iframe 自带 tj-fanli.js，
       它读到 data-tj-overlay 会在加载后自己亮笺，此处不用管。 */
    if (on && window.TJFanli) {
      try { window.TJFanli.onBookOpen(); } catch (e) {}
    }
    if (!on) closeOverlay();
    muteInline(!!ov);   /* 浮窗开着 → 正文侧那套册子摘出渲染树；关掉即恢复 */
    UI.wrap.classList.toggle('is-open', on);
    UI.wrap.classList.toggle('is-closing', !on);
    UI.app.classList.toggle('is-tj-open', on && !ov);  /* 只有回退路径才在文档流里撑开 */
    UI.book.setAttribute('aria-expanded', String(on));
    if (on && !ov) {
      setTimeout(function () {
        try { UI.wrap.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
      }, 60);
    }
    setTimeout(function () {
      busy = false;
      UI.wrap.classList.remove('is-closing');
      if (want !== on) setOpen(want);
    }, on ? 520 : 400);
  }

  /* ---------- 定时器：统一管理，降级/移除必须清掉 ---------- */
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function startTimer() {
    stopTimer();
    if (staticMode) return;
    timer = setInterval(function () { hour = (hour + 1 / 3600) % 24; apply(hour); }, 5000);
  }

  /* ---------- 定楼层：本楼 vs 最新楼（判「旧楼层降级」用）----------
     与 core/tj-state.js 的 detectMesid 同源，另加 getLastMessageId /
     getChatMessages / 父文档 .mes[mesid] 三条兜底。
     判不出就**维持动态** —— §9 只要求"旧楼层降级"，不要求误伤最新楼。
     （原实现只看 window.SillyTavern.chat，该全局在酒馆助手环境不存在，
      typeof 守卫会静默失败 → 降级永不触发。这里补全。） */
  function curMesid() {
    var q = /[?&]mesid=(\d+)/.exec(location.search);
    if (q) return Number(q[1]);
    try {
      if (typeof getCurrentMessageId === 'function') {
        var v = getCurrentMessageId();
        if (v != null && v !== '' && !isNaN(Number(v))) return Number(v);
      }
    } catch (e) { /* 不在楼层消息 iframe 里 —— 正常 */ }
    try {
      var el = document.querySelector('[data-mesid]');
      if (el) { var n = Number(el.getAttribute('data-mesid')); if (!isNaN(n)) return n; }
    } catch (e) {}
    /* 父文档里反查"哪个 iframe 是我" → 它所属的 .mes[mesid] */
    try {
      var doc = window.parent && window.parent.document;
      var ifr = doc && doc.querySelectorAll('iframe');
      for (var i = 0; ifr && i < ifr.length; i++) {
        var w = null; try { w = ifr[i].contentWindow; } catch (e2) { w = null; }
        if (w !== window) continue;
        var mes = ifr[i].closest ? ifr[i].closest('.mes') : null;
        if (mes && mes.getAttribute('mesid') != null) return Number(mes.getAttribute('mesid'));
        var m = /TH-message--(\d+)--/.exec(ifr[i].className || '');
        if (m) return Number(m[1]);
      }
    } catch (e) {}
    return null;
  }
  function lastMesid() {
    try {
      if (typeof getLastMessageId === 'function') {
        var v = getLastMessageId();
        if (v != null && v !== '' && !isNaN(Number(v))) return Number(v);
      }
    } catch (e) {}
    try {
      if (typeof getChatMessages === 'function') {
        var arr = getChatMessages();
        if (arr && arr.length) {
          var t = arr[arr.length - 1];
          var id = t && (t.message_id != null ? t.message_id : t.id);
          if (id != null && !isNaN(Number(id))) return Number(id);
        }
      }
    } catch (e) {}
    try {
      var doc = window.parent && window.parent.document;
      var mes = doc && doc.querySelectorAll('.mes[mesid]');
      if (mes && mes.length) {
        var max = -1;
        for (var i = 0; i < mes.length; i++) {
          var n = Number(mes[i].getAttribute('mesid'));
          if (!isNaN(n) && n > max) max = n;
        }
        if (max >= 0) return max;
      }
    } catch (e) {}
    return null;
  }

  /* ---------- 横幅宽度 = 册子宽度（作者：正好和正文对称） ----------
     量 `.book` 的 **offsetWidth**（不是 getBoundingClientRect：面板收起时带
     scale(.15)，rect 会被缩放，offsetWidth 才是布局宽）。窗口尺寸一变就重算。 */
  function syncPlateWidth() {
    var bk = document.querySelector('[data-tj-panel] .book') || document.querySelector('.book');
    if (!bk) return;
    var w = Math.round(bk.offsetWidth || 0);
    if (w > 0) r.style.setProperty('--tj-plate-w', w + 'px');
  }

  /* ================= 浮窗：点书 → 在**父文档**里开一个比正文更大的居中窗口 =================
     作者 2026-10-04 定：点开书不该留在正文里（`position:fixed` 只覆盖 **iframe 自己的视口**，
     而楼层 iframe 的宽高都跟着聊天列走 → 窗口永远大不过正文）。

     做法：把**当前文档的快照 + 当前 state** 装进一个 srcdoc iframe，追加到**父文档 body**
     （srcdoc 继承酒馆源 → 同源，`window.parent.document` 可写）。这样：
       · 我们**完全拥有**这个 iframe → 能真正 `position:fixed` 居中，尺寸可到 1920×1080；
       · 不与酒馆助手争楼层 iframe 的尺寸（它只管它那个 iframe）；
       · 不往酒馆文档注入任何册子样式（样式都在 iframe 自己的文档里）→ 不污染酒馆 UI。
     拿不到父文档（异常环境）就返回 false，回退到"原位展开"。

     设计基准 **1920×1080（1K）**：按实际窗口等比缩小，不放大超过 1 → 自然做了分辨率适配。 */
  var BOOT = window.__TJ_BOOT || null;
  var IS_OVERLAY = !!(BOOT && BOOT.mode === 'overlay');
  var BASE_W = 1920, BASE_H = 1080, OV_MARGIN = 48;
  var OV = null;              /* { host, fr, pd, w, onKey, onMsg, onRes } */
  var lastState = null;       /* 与册子同一份来源的状态（信息笺 + 浮窗快照都用它） */

  var OV_HOST_CSS = [
    '.tj-ov-host{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;',
    'justify-content:center;background:rgba(8,6,4,.5)}',
    '.tj-ov-frame{border:0;display:block;background:transparent}',
  ].join('');

  /* 浮窗**里面**的册子：不要横幅、不要收起，整册按舞台尺寸等比铺满 */
  var OV_BOOK_CSS = [
    'html[data-tj-overlay] .book{--page-w:520px!important}',
    'html[data-tj-overlay],html[data-tj-overlay] body{height:100%!important;overflow:hidden!important;',
    'background:transparent!important;margin:0!important;padding:0!important}',
    'html[data-tj-overlay] .desk,html[data-tj-overlay] .lamp,html[data-tj-overlay] .toolbar,',
    'html[data-tj-overlay] .tj-dbg{display:none!important}',
    'html[data-tj-overlay] [data-tj-panel]{position:absolute!important;inset:0!important;',
    'width:100%!important;height:100%!important;max-height:none!important;margin:0!important;',
    'overflow:visible!important;transform:none!important;opacity:1!important;pointer-events:auto!important;',
    'background:transparent!important;box-shadow:none!important;display:flex!important;',
    'align-items:center!important;justify-content:center!important}',
    /* 等比放大到舞台：**用 zoom，不用 transform:scale** ——
       transform 缩放只是把已栅格化的图层放大，合成层里的文字会发虚（作者：「字体变糊了」）；
       zoom 会重排、按最终尺寸重新栅格化，文字始终清晰（且 vw/vh 之外的行为与 scale 相近）。 */
    'html[data-tj-overlay] .book{zoom:var(--tj-ov-zoom,1)!important}',
  ].join('');

  function parentWin() { try { return window.parent || window; } catch (e) { return window; } }
  function parentDoc() { try { var w = parentWin(); return (w && w.document) || null; } catch (e) { return null; } }

  function stageSize() {
    var w = parentWin();
    var pw = w.innerWidth || 1280, ph = w.innerHeight || 800;
    var k = Math.min(1, (pw - OV_MARGIN) / BASE_W, (ph - OV_MARGIN) / BASE_H);
    return { w: Math.max(320, Math.round(BASE_W * k)), h: Math.max(240, Math.round(BASE_H * k)) };
  }

  function overlaySnapshot() {
    var boot = { mode: 'overlay', state: lastState, hour: hour,
                 mesid: (lastState && lastState._mesid) || null };
    var json = JSON.stringify(boot).replace(/<\//g, '<\\/');
    return '<!DOCTYPE html>' + document.documentElement.outerHTML.replace(
      /<head([^>]*)>/i, '<head$1><script>window.__TJ_BOOT=' + json + ';<\/script>');
  }

  /* 浮窗的一生：**建一次、反复用**（作者 2026-10-04：卡的不是浏览，是「点开那一下」——
     那一下要把 1.6MB 的壳序列化 + 重新解析 + 重跑脚本）。
     所以：启动后**空闲时先把浮窗建好（隐藏）**，点开只是"换状态 + 显示"，瞬时打开；
     关上只是隐藏，下次开同样瞬时。 */
  function makeOverlay() {
    if (OV) return OV;
    var pd = parentDoc();
    if (!pd || !pd.body) { try { window.TJ_Banner._ovError = 'no parent doc'; } catch (e) {} return null; }
    try {
      if (!pd.getElementById('tj-ov-style')) {
        var st = pd.createElement('style'); st.id = 'tj-ov-style'; st.textContent = OV_HOST_CSS;
        (pd.head || pd.documentElement).appendChild(st);
      }
      var sz = stageSize();
      var host = pd.createElement('div'); host.className = 'tj-ov-host'; host.id = 'tj-ov-host';
      host.style.display = 'none';                 /* 预热态：建好但不显示 */
      var fr = pd.createElement('iframe'); fr.className = 'tj-ov-frame'; fr.id = 'tj-ov-frame';
      fr.setAttribute('name', 'tj-overlay');      /* 便于探针/调试认出这个 frame */
      fr.setAttribute('scrolling', 'no'); fr.setAttribute('title', '棠郡·一册');
      fr.style.width = sz.w + 'px'; fr.style.height = sz.h + 'px';
      host.appendChild(fr);
      pd.body.appendChild(host);

      var onKey = function (e) { if (OV && OV.shown && e.key === 'Escape') closeOverlay(); };
      var onScrim = function (e) { if (OV && OV.shown && e.target === host) closeOverlay(); };
      var onMsg = function (e) {
        var d = e.data;
        if (d && d.__tj === 'overlay-close') closeOverlay();
      };
      var onRes = function () {
        var s2 = stageSize();
        fr.style.width = s2.w + 'px'; fr.style.height = s2.h + 'px';
      };
      pd.addEventListener('keydown', onKey, true);
      host.addEventListener('mousedown', onScrim);
      window.addEventListener('message', onMsg);
      parentWin().addEventListener('resize', onRes);
      /* ★ 浮窗内按 Esc：事件发生在**浮窗自己的文档**里，postMessage 的目标是父页
         （酒馆页），而正文侧监听在自己 window 上 —— 收不到（作者报的「Esc 不退出」就是这个）。
         同源，直接在父窗口上挂一个回调，浮窗直接调用，最可靠。 */
      try { parentWin().__TJ_OVERLAY_CLOSE = closeOverlay; } catch (e) {}
      OV = { host: host, fr: fr, pd: pd, onKey: onKey, onScrim: onScrim, onMsg: onMsg, onRes: onRes,
             shown: false, ready: false, pending: null };
      fr.addEventListener('load', function () {
        if (!OV) return;
        OV.ready = true;
        if (OV.pending) applyState(OV.pending);
      });
      fr.srcdoc = overlaySnapshot();               /* 预热：最贵的一步挪到空闲时做 */
      return OV;
    } catch (e) {
      try { window.TJ_Banner._ovError = String(e && (e.stack || e.message || e)); } catch (e2) {}
      return null;
    }
  }

  /* 把当前状态推进浮窗（浮窗的 TJState 优先读 window.__TJ_BOOT.state），并让当前页重画 */
  function applyState(s) {
    if (!OV || !OV.ready || !s) return;
    try {
      var w = OV.fr.contentWindow;
      w.__TJ_BOOT = w.__TJ_BOOT || {};
      w.__TJ_BOOT.state = s;
      w.__TJ_BOOT.mesid = s._mesid != null ? s._mesid : null;
      if (w.TJBook && typeof w.TJBook.renderCurrent === 'function') w.TJBook.renderCurrent();
    } catch (e) {}
  }

  /* 预热：空闲时先把浮窗建好（拿不到父文档就什么也不做，走原位展开那条回退路） */
  function warmOverlay() {
    if (IS_OVERLAY || OV) return;
    makeOverlay();
  }

  function openOverlay() {
    if (IS_OVERLAY) return false;
    if (!makeOverlay()) return false;
    OV.pending = lastState;
    if (OV.ready) applyState(lastState);
    var sz = stageSize();
    OV.fr.style.width = sz.w + 'px'; OV.fr.style.height = sz.h + 'px';
    OV.host.style.display = '';
    OV.shown = true;
    return true;
  }

  /* 关上＝**只是隐藏**（浮窗留着，下次开还是瞬时；页高/状态都不动） */
  function closeOverlay() {
    if (!OV || !OV.shown) return;
    OV.shown = false;
    try { OV.host.style.display = 'none'; } catch (e) {}
    if (UI && UI.wrap.classList.contains('is-open')) setOpen(false);
  }

  /* 真拆掉（页面要走时才做） */
  function destroyOverlay() {
    if (!OV) return;
    try {
      OV.pd.removeEventListener('keydown', OV.onKey, true);
      OV.host.removeEventListener('mousedown', OV.onScrim);
      window.removeEventListener('message', OV.onMsg);
      parentWin().removeEventListener('resize', OV.onRes);
      if (OV.host.parentNode) OV.host.parentNode.removeChild(OV.host);
      try { delete parentWin().__TJ_OVERLAY_CLOSE; } catch (e) {}
    } catch (e) {}
    OV = null;
  }

  /* 浮窗内的册子：等比铺满舞台（用 **zoom**；横向多留出右侧页签的探出量）。
     尺寸**按 CSS 变量算**（page-w × 2），不去量 offsetWidth ——
     那是 zoom 之后的值，会把缩放算成反馈回路。 */
  function fitOverlayBook() {
    var W = window.innerWidth, H = window.innerHeight;
    var cs = getComputedStyle(document.documentElement);
    var pw = parseFloat(cs.getPropertyValue('--page-w')) || 520;
    var pr = parseFloat(cs.getPropertyValue('--page-ratio')) || 1.4;
    var bw = pw * 2 + 48;          /* +48：右侧页签探出书体之外 */
    var bh = pw * pr + 12;
    var z = Math.min((W - 16) / bw, (H - 16) / bh);
    if (!isFinite(z) || z <= 0) z = 1;
    r.style.setProperty('--tj-ov-zoom', z.toFixed(4));
  }

  function bootOverlay() {
    r.setAttribute('data-tj-overlay', '1');
    if (BOOT && BOOT.hour != null) hour = +BOOT.hour;
    var st = document.createElement('style'); st.id = 'tj-ov-book-style';
    st.textContent = OV_BOOK_CSS; document.head.appendChild(st);
    var w = document.getElementById('tj-banner'); if (w) w.remove();
    var d = document.querySelector('.tj-dbg'); if (d) d.remove();
    var vp = document.querySelector('.viewport'); if (vp) vp.setAttribute('data-tj-panel', '');
    fitOverlayBook();
    window.addEventListener('resize', fitOverlayBook);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitOverlayBook);
    apply(hour, true);
    /* 册首凡例（方案 A）：浮窗模式整页即册子，boot 即视为开册。
       必须在这里直调 —— tj-fanli.js 解析时 data-tj-overlay 还没挂上，
       它自己的 attribute 判定必然落空（实测笺不亮的根因）。 */
    if (window.TJFanli) { try { window.TJFanli.onBookOpen(); } catch (e) {} }
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var pw = parentWin();
      try {
        if (typeof pw.__TJ_OVERLAY_CLOSE === 'function') { pw.__TJ_OVERLAY_CLOSE(); return; }
        pw.postMessage({ __tj: 'overlay-close' }, '*');
      } catch (err) {}
    });
  }

  /* 浮窗打开期间：把**正文侧那套册子**从渲染树里摘掉（display:none）。
     DOM 与状态都留着（关掉浮窗即恢复），但它的常驻动画会停、合成层会释放——
     否则"两份册子同时在跑动画 + 各自的纸纹/混合层"，在浮窗里（还放大到 1.48 倍）
     会明显更卡（作者实测）。注意用 inline !important：壳的覆盖层写了 `.viewport{display:flex!important}`。 */
  function muteInline(on) {
    if (!UI || !UI.app) return;
    try {
      if (on) UI.app.style.setProperty('display', 'none', 'important');
      else UI.app.style.removeProperty('display');
    } catch (e) {}
  }

  /* ---------- 「UI 只在最新楼层」 ----------
     作者 2026-10-04：**前文不许有 UI**（原来只把旧楼层降级成静态案面，还会占版面）。

     这不是一次性判断：**新消息 / 删楼 / 编辑 / 重说 / 换聊天**都会改变"谁是最新"，
     所以每次 poke（桥在这些事件后都会喊一声）都重判一次 ——
     这样「删掉一楼之后，新的最新楼照样出 UI」也一并成立。

     判不出楼层时**保守显示**：宁可多显示一条，也不能让最新楼空着。 */
  /* 预热调度：**空闲时**把浮窗建好（作者：卡的是"点开那一下"）。
     只在"自己是最新楼层"时预热 —— 前文本来就不给打开，预热是白做。 */
  var warmTimer = null;
  function scheduleWarm() {
    if (IS_OVERLAY || OV || warmTimer || sampleMode) return;
    var run = function () { warmTimer = null; try { warmOverlay(); } catch (e) {} };
    warmTimer = setTimeout(function () {
      if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 2500 });
      else run();
    }, 1200);
  }

  function syncLatest() {
    if (!UI) return;
    var me = curMesid(), last = lastMesid();
    var isLatest = (me == null || last == null) ? true : (me === last);
    UI.wrap.style.display = isLatest ? '' : 'none';
    UI.wrap.setAttribute('data-tj-latest', isLatest ? '1' : '0');
    if (isLatest) {
      staticMode = false;
      UI.wrap.classList.remove('is-static');
      startTimer();
      scheduleWarm();
    } else {
      TJ_Banner.setStatic(true);      /* 停插值 / 灯晕定时器，只留一张静止的案面（反正看不见） */
    }
  }

  var UI = null;
  /* ---- v2.2 提级：桌面交互（悬停描边 / 点击开册·开舆图）----
     boot 主路与 scenario 预览分支共用。 */
  function wireDesk(UI, setOpen) {
    function lit(g, on) {
      if (!g) return;
      if (on) {
        g.classList.remove('is-lit');
        void g.getBoundingClientRect();
        g.classList.add('is-lit');
      } else {
        g.classList.remove('is-lit');
      }
    }
    function wireObj(g, hit, open) {
      if (!g || !hit) return;
      hit.addEventListener('mouseenter', function () { lit(g, true); });
      hit.addEventListener('mouseleave', function () { lit(g, false); });
      hit.addEventListener('focus', function () { lit(g, true); });
      hit.addEventListener('blur', function () { lit(g, false); });
      hit.addEventListener('click', function (e) {
        open();
        if (e && e.detail) { try { hit.blur(); } catch (er) {} }
      });
      hit.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    }
    wireObj(UI.scrollG, UI.scroll, function () { if (window.TJ_Map) window.TJ_Map.open(); });
    wireObj(UI.bookG, UI.book, function () { setOpen(!UI.wrap.classList.contains('is-open')); });
  }

  function boot() {
    /* 浮窗里的那一份：不要横幅，直接把整册铺满舞台 */
    if (IS_OVERLAY) { bootOverlay(); return; }
    /* 带 ?scenario= 的是**离线预览**（各探针与单独看册子都走这条）——
       预览时不开册、不藏册子，保持直开形态；但**照样建横幅 + 信息笺**，
       让本地预览也能看到年月日/在/天/钱四行（2026-10-12 本地预览工作流）。 */
    if (Q.has('scenario')) {
      UI = build();
      if (UI) {
        apply(hour, true);
        wireDesk(UI, setOpen);   /* v2.2：预览也能点书面开册 / 点卷轴开舆图 */
        /* 预览也要让信息笺跑起来：显式把 scenario 传给 TJState（否则走
           MVU/桥真实链 → 全落空 → slip 全「—」） */
        try {
          window.TJState.getState({ scenario: Q.get('scenario') }).then(function (s) {
            lastState = s; setSlip(s);
          }, function () {});
        } catch (e) {}
      }
      return;
    }
    UI = build();
    if (!UI) return;
    syncPlateWidth();
    /* 布局/字体/窗口尺寸变化后重算（册子宽度受 vw/vh 与字体度量影响） */
    window.addEventListener('resize', syncPlateWidth);
    setTimeout(syncPlateWidth, 240);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { syncPlateWidth(); });
    apply(hour, true);

    /* 桌面交互（2026-10-06 重构）：命中 = 轮廓 path 本身（透明填充吃指针）。
       悬停/键盘聚焦 → 勾边描画（.is-lit；移出/失焦淡出）；点击 → 开册 / 开舆图。
       触屏无悬停：click 直接生效。书组画在卷轴组之上 → 重叠处指针先中书。 */
    /* 桌面交互：lit/wireObj 提为模块级 wireDesk（v2.2：scenario 预览分支复用） */
    wireDesk(UI, setOpen);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && UI.wrap.classList.contains('is-open')) setOpen(false);
    });
    document.addEventListener('mousedown', function (e) {
      if (!UI.wrap.classList.contains('is-open')) return;
      if (UI.wrap.contains(e.target) || UI.app.contains(e.target)) return;
      setOpen(false);
    });

    document.addEventListener('visibilitychange', function () {
      document.hidden ? stopTimer() : startTimer();
    });
    window.addEventListener('pagehide', function () { stopTimer(); destroyOverlay(); });
    if (document.hidden) staticMode = true;
    startTimer();

    /* 调试：?debugTime=1 或 ?tjdebug=1 出滑块 */
    if (Q.has('debugTime') || Q.has('tjdebug') || Q.has('debug')) {
      r.setAttribute('data-tj-debugtime', '1');
      var sl = document.getElementById('tj-h'), lab = document.getElementById('tj-hl');
      sl.value = hour; lab.textContent = (+hour).toFixed(1) + ' 时';
      sl.addEventListener('input', function () {
        hour = +sl.value; staticMode = true; stopTimer();
        lab.textContent = hour.toFixed(1) + ' 时';
        apply(hour);
      });
    }
    /* 样例（单开本页预览用；接入后由 setState 覆盖） */
    if (Q.has('sample')) {
      sampleMode = true;
      lastState = { 棠郡: { 时地: { 年月日: '听棠前十日', 时辰: '戌时',
        地区: '黍墟', 地点: '旧洞', 天气: '欲雨' } } };
      setSlip(lastState);
      if (Q.has('h')) { hour = parseFloat(Q.get('h')); apply(hour); }
    }
    /* 与册子同一份来源：先取一次，之后楼层变动（新增/编辑/重说/删除/换聊天）也重取，
       并**重判谁是"最新楼层"**（前文不许有 UI；删楼后新的最新楼要能出 UI）。 */
    if (!sampleMode) {
      loadState();
      if (window.TJState && window.TJState.onPoke) {
        window.TJState.onPoke(function () { loadState(); syncLatest(); });
      }
    }

    /* UI 只在最新楼层出现（作者 2026-10-04：前文不许有 UI）。
       判据与"降级"同一套；动作是**整条横幅隐藏**，而不是留一个静态案面。 */
    syncLatest();
  }

  /* ---------- 对外 ---------- */
  var TJ_Banner = window.TJ_Banner = {
    setState: setSlip,
    setHour: function (h) { hour = h; apply(h); },
    open: function () { setOpen(true); },
    close: function () { setOpen(false); },
    /** 旧楼层静止：停插值与过渡，只留静态案面 */
    setStatic: function (on) {
      staticMode = !!on;
      on ? stopTimer() : startTimer();
      if (UI) UI.wrap.classList.toggle('is-static', !!on);
      r.setAttribute('data-tj-static', on ? '1' : '0');
    },
    isStatic: function () { return staticMode; },
  };

  if (/complete|interactive/.test(document.readyState)) setTimeout(boot, 0);
  else document.addEventListener('DOMContentLoaded', boot);
})();
