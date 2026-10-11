/* ==================================================================
   棠郡 · 郡舆图（B2 全量交互版 ＋ B4 显示层重构）
   ------------------------------------------------------------------
   作者 2026-10-06 定：
   【B2】拖动 / 缩放（滚轮光标锚、双指 pinch、右下＋−⌂）、z∈[1,5] 拖不出去、
     印章朱红底白字（红圈虚化淡一档+待考）、纸条详情卡读世界书原句、
     量距、我在哪、昼夜自动+手动、驿路里数可开关；只做浏览，不写变量。
   【B4 显示层重构（修模糊/闪烁/三字溢出）】
     · 底图独占缩放容器 .tj-map-world（transform 缩放平移）；
       **印章/里数签/驿路线全部放在缩放容器之外**，每帧按
       「地图坐标×缩放＋平移」取整算屏幕坐标（translate3d），字号恒为真实像素，
       不再被 transform 放大栅格化 —— 放大不模糊。
     · 命中与视觉分离：印章外层是固定尺寸的透明命中框（不 transform、不变尺寸），
       悬停样式只作用于内层，且只做颜色/描边变化（无 transform/size/位移、
       无影响命中区的 transition）—— 反复移入移出不闪烁。
     · 驿路线画在 viewport 层 SVG（像素坐标），线宽与虚线节距恒定。
     · 印章版式按字数自适应（data-len 2/3/4 档：宽度、字号、字距随之变，
       高度与视觉重量一致）——「东出郡」三字不再溢出，无单地名特例。
   【C 组 2026-10-06 玩家版】详情卡分段版式（定位/须知/路感，加高可滚）、
     脚注改「郡中传闻 · 旅人须知」（不再标 uid）、溱水水线点击热区
     （D.waters，透明 stroke 命中＋悬停晕光；驿路开关只藏驿路，不藏水线）、
     我在哪兼容水系地名（只报纸签，不聚焦）。
   数据：core/tj-map-data.js（v2 起文案为作者玩家版，见数据文件头注）。
   【D 组 2026-10-06 地图大修】印章改竖排牌签＋层级（major/town/minor/danger/hidden）；
     道路 21 条全带 path 写意曲线＋六类样式（official/trade/mountain/water/danger/secret），
     点路线出道笺（起讫/类型/里数/沿途）；图层钮 道路/水路/隐迹；区域晕光（险/泽/隐）；
     详情卡小节签「玩家须知」→「风物」。
   底图地址：读 index.html 静态引用 #tj-map-src-day/night（壳构建时按 <base>
   解析为线上绝对 URL —— 酒馆 srcdoc 里 JS 动态相对 src 不会解析，见 index.html 注）。
   ================================================================== */
(function () {
  'use strict';

  var IMG = { day: 'assets/地图/map-day.webp', night: 'assets/地图/map-night.webp' };
  /* 底图真实地址：优先读 index.html 里的静态引用（#tj-map-src-day/night）——
     静态标签的 src 在壳构建时已被 <base> 解析为线上绝对 URL（酒馆 srcdoc 里
     JS 动态赋相对 src 不会解析，请求都发不出 —— 与「人」页立绘同一套模式）。 */
  function imgSrc(key, fallback) {
    var docs = [document];
    try { if (window.parent && window.parent.document) docs.push(window.parent.document); } catch (e) {}
    for (var i = 0; i < docs.length; i++) {
      try {
        var el = docs[i].getElementById('tj-map-src-' + key);
        if (el && el.getAttribute('src')) return el.src;
      } catch (e) {}
    }
    return fallback;
  }

  /* 原图 4096×1756 → 素材 2048×878，比例恒定 */
  var ASPECT = 2048 / 878;
  var Y_SCALE = 878 / 2048;   /* y 换算到宽向尺度的系数（归一化 y × 878/2048） */
  var Z_MIN = 1, Z_MAX = 5, Z_STEP = 1.35;

  var D = window.TJ_MAP_DATA || { markers: [], roads: [], waters: [], regions: [], rate: { liPerUnit: 419, dayLi: 70 } };
  var RATE = D.rate || {};
  var LI_PER_UNIT = RATE.liPerUnit || 419;
  var DAY_LI = RATE.dayLi || 70;
  var DANGEROUS_LI = 90; /* ≤90 里＝当日可至（官道常步一日七十里，九十里算赶得完） */

  var HOURS = '子丑寅卯辰巳午未申酉戌亥';

  var CSS = [
    '.tj-map-scrim{position:fixed;inset:0;z-index:2147482900;display:flex;align-items:center;justify-content:center;',
    'background:rgba(8,6,4,.58);opacity:0;pointer-events:none;transition:opacity 320ms cubic-bezier(.2,.8,.2,1)}',
    '.tj-map-scrim.is-open{opacity:1;pointer-events:auto}',
    '.tj-map-panel{position:relative;display:flex;flex-direction:column;border-radius:6px;overflow:hidden;',
    'background:#151009;box-shadow:0 18px 60px rgba(0,0,0,.55),0 0 0 1px rgba(197,168,102,.28);',
    'transform:scale(.94) translateY(8px);transition:transform 320ms cubic-bezier(.2,.8,.2,1)}',
    '.tj-map-scrim.is-open .tj-map-panel{transform:scale(1) translateY(0)}',
    '.tj-map-head{display:flex;align-items:center;gap:8px;padding:7px 12px;',
    'background:linear-gradient(180deg,#241a10,#1a130b);border-bottom:1px solid rgba(197,168,102,.25);',
    'color:#e8d9b8;font:15px/1 var(--font-kai,KaiTi,serif);letter-spacing:.24em}',
    '.tj-map-head .tj-seal{width:20px;height:20px;border-radius:3px;background:#9e2b25;color:#f6ead2;',
    'display:flex;align-items:center;justify-content:center;font-size:12px;letter-spacing:0;flex:none}',
    '.tj-map-head .tj-sub{font-size:11px;color:rgba(232,217,184,.55);letter-spacing:.12em;margin-left:2px}',
    '.tj-map-tools{margin-left:auto;display:flex;gap:6px;align-items:center}',
    '.tj-map-btn{min-width:26px;height:26px;padding:0 7px;border:1px solid rgba(197,168,102,.35);border-radius:4px;',
    'background:rgba(0,0,0,.25);color:#e8d9b8;font:13px/1 var(--font-kai,KaiTi,serif);cursor:pointer;letter-spacing:.08em}',
    '.tj-map-btn:hover{background:rgba(158,43,37,.45)}',
    '.tj-map-btn.is-on{background:rgba(158,43,37,.55);border-color:rgba(197,168,102,.55);color:#f6ead2}',
    '.tj-map-close{width:26px;height:26px;border:1px solid rgba(197,168,102,.35);border-radius:4px;',
    'background:rgba(0,0,0,.25);color:#e8d9b8;font:14px/1 var(--font-kai,KaiTi,serif);cursor:pointer;padding:0;flex:none}',
    '.tj-map-close:hover{background:rgba(158,43,37,.45)}',

    /* —— 视口（拖/缩的舞台）—— */
    '.tj-map-body{position:relative;flex:1;min-height:0;background:#0d0a06;overflow:hidden;touch-action:none;cursor:grab}',
    '.tj-map-body.is-panning{cursor:grabbing}',
    /* 缩放容器：只装两张底图。不加 will-change（避免整层位图化后文字跟随缩放） */
    '.tj-map-world{position:absolute;inset:0;transform-origin:0 0}',
    '.tj-map-world img{position:absolute;inset:0;width:100%;height:100%;display:block;',
    '-webkit-user-drag:none;user-select:none;transition:opacity 420ms ease}',

    /* —— 驿路线：viewport 层 SVG，像素坐标，线宽/虚线恒定不随缩放 —— */
    '.tj-map-roads{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}',
    '.tj-map-roads polyline{fill:none;stroke-linecap:round;stroke-linejoin:round;',
    'filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.7))}',
    /* 六类路：官道/商路/山道/水路/险径/隐径（低饱和古风色板） */
    '.tj-map-roads polyline.is-official{stroke:rgba(213,173,98,.82);stroke-width:2.3;stroke-dasharray:10 7}',
    '.tj-map-roads polyline.is-trade{stroke:rgba(168,132,74,.72);stroke-width:2;stroke-dasharray:5 8}',
    '.tj-map-roads polyline.is-mountain{stroke:rgba(172,171,153,.6);stroke-width:1.6;stroke-dasharray:2 7}',
    '.tj-map-roads polyline.is-water{stroke:rgba(112,157,171,.8);stroke-width:1.8;stroke-dasharray:12 5 2 5}',
    '.tj-map-roads polyline.is-danger{stroke:rgba(163,78,62,.8);stroke-width:1.9;stroke-dasharray:5 6}',
    '.tj-map-roads polyline.is-secret{stroke:rgba(123,93,143,.68);stroke-width:1.5;stroke-dasharray:2 6;opacity:.6}',
    /* 道路命中副线：12px 透明可点层 + 悬停增亮 */
    '.tj-map-roads polyline.is-hit{fill:none;stroke:rgba(0,0,0,0);stroke-width:12;pointer-events:stroke;cursor:pointer}',
    '.tj-map-roads polyline.is-hot{stroke-width:3.4;opacity:1}',
    /* 图层开关：hide-land / hide-water / hide-secret */
    '.tj-map-roads.hide-land .is-official,.tj-map-roads.hide-land .is-trade,',
    '.tj-map-roads.hide-land .is-mountain,.tj-map-roads.hide-land .is-danger{display:none}',
    '.tj-map-roads.hide-water .is-water{display:none}',
    '.tj-map-roads.hide-secret .is-secret{display:none}',
    '.tj-map-roadtags.hide-land .rt-land,.tj-map-roadtags.hide-water .rt-water,',
    '.tj-map-roadtags.hide-secret .rt-secret{display:none}',
    /* 区域晕光：险/泽/隐 */
    '.tj-map-roads ellipse.tj-region{pointer-events:none;stroke-width:1.2;stroke-dasharray:6 5;animation:tj-breathe 4.5s ease-in-out infinite}',
    '.tj-map-roads ellipse.tj-region-danger{fill:url(#tj-grad-danger);stroke:rgba(166,69,54,.55)}',
    '.tj-map-roads ellipse.tj-region-spirit{fill:url(#tj-grad-spirit);stroke:rgba(104,160,150,.42);stroke-dasharray:3 6;animation-duration:5.5s}',
    '.tj-map-roads ellipse.tj-region-hiddenmk{fill:url(#tj-grad-hiddenmk);stroke:rgba(142,166,170,.4);stroke-dasharray:2 7;opacity:.65;animation:none}',
    '@keyframes tj-breathe{0%,100%{opacity:.55}50%{opacity:.95}}',
    '@media (prefers-reduced-motion:reduce){.tj-map-roads ellipse.tj-region{animation-duration:1ms!important}}',
    /* 溱水水线：透明热区（stroke 命中，与绘色无关）+ 悬停晕光 */
    '.tj-map-roads polyline.is-whit{fill:none;stroke:rgba(0,0,0,0);stroke-width:16;',
    'pointer-events:stroke;cursor:pointer}',
    '.tj-map-roads polyline.is-whit-hl{fill:none;stroke:rgba(116,156,168,.55);stroke-width:3;',
    'stroke-linecap:round;stroke-linejoin:round;opacity:0;transition:opacity 200ms ease}',
    /* 路线笺（点路线弹出） */
    '.tj-route-chip{position:absolute;z-index:6;display:none;max-width:250px;padding:7px 10px;border-radius:4px;',
    'background:linear-gradient(175deg,#f4e9cf,#e9dabb);color:#33261a;border:1px solid rgba(90,60,30,.45);',
    'box-shadow:0 10px 26px rgba(0,0,0,.5);font:12px/1.7 var(--font-kai,KaiTi,serif)}',
    '.tj-route-chip.is-show{display:block}',
    '.tj-route-chip .tj-rc-name{display:block;font-size:13px;letter-spacing:.1em;margin-bottom:1px;color:#241a10}',
    '.tj-route-chip .tj-rc-note{display:block;color:rgba(90,58,32,.85);font-size:11px}',

    /* —— 印章：viewport 层。.tj-marker 是 0×0 定位点（JS 只动它的 translate3d）；
          .tj-mk-hit 是固定尺寸透明命中框（不 transform、不变尺寸，负责接鼠标）；
          .tj-mk-in 是视觉（hover 只做颜色/描边变化）。字号恒为真实像素。 —— */
    '.tj-marker{position:absolute;left:0;top:0;width:0;height:0;padding:0;border:0;background:none;cursor:pointer}',
    '.tj-marker:focus{outline:none}',
    '.tj-mk-hit{position:absolute;left:-30px;top:-16px;width:60px;height:32px;background:transparent;pointer-events:auto}',
    '.tj-mk-in{position:absolute;left:0;top:0;transform:translate(-50%,-50%);',
    'display:flex;align-items:center;justify-content:center;writing-mode:vertical-rl;text-orientation:upright;',
    'padding:7px 5px;border-radius:3px;',
    'background:linear-gradient(160deg,#a8342c,#8c2620);color:#f8ecd4;',
    'border:1px solid rgba(60,14,10,.75);box-shadow:0 2px 7px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,235,200,.22);',
    'font:13px/1 var(--font-kai,KaiTi,serif);letter-spacing:.14em;pointer-events:none;',
    'transition:background 160ms ease,border-color 160ms ease,box-shadow 160ms ease,opacity 160ms ease}',
    /* 字数版式：竖排以高定档（2/3/4 字） */
    '.tj-marker[data-len="2"] .tj-mk-in{min-height:54px;font-size:13px}',
    '.tj-marker[data-len="3"] .tj-mk-in{min-height:66px;font-size:11.5px;letter-spacing:.08em}',
    '.tj-marker[data-len="4"] .tj-mk-in{min-height:78px;font-size:11px;letter-spacing:.06em}',
    /* 层级：郡治 major / 常镇 town / 小地名 minor / 险地 danger / 隐地 hidden */
    '.tj-marker.is-major .tj-mk-in{font-size:14.5px;min-height:58px;box-shadow:0 3px 10px rgba(0,0,0,.6),inset 0 0 0 1.5px rgba(246,222,170,.5)}',
    '.tj-marker.is-minor .tj-mk-in{background:linear-gradient(160deg,rgba(66,45,28,.94),rgba(46,30,19,.94));',
    'border-color:rgba(205,168,110,.42);color:rgba(238,216,172,.92);font-size:11px;min-height:42px}',
    '.tj-marker.is-minor[data-len="3"] .tj-mk-in{min-height:52px}',
    '.tj-marker.is-danger .tj-mk-in{background:linear-gradient(160deg,rgba(98,36,30,.94),rgba(66,23,19,.94));',
    'border:1px dashed rgba(204,118,94,.62);color:#e9bca8;font-size:11.5px}',
    '.tj-marker.is-hiddenmk .tj-mk-in{background:linear-gradient(160deg,rgba(40,50,54,.92),rgba(27,35,39,.92));',
    'border:1px dashed rgba(142,166,170,.5);color:rgba(192,214,216,.8);opacity:.5;font-size:11.5px}',
    '.tj-marker.is-hiddenmk:hover .tj-mk-in,.tj-marker.is-hiddenmk:focus-visible .tj-mk-in{opacity:1}',
    /* hover：只变颜色/描边（不改 transform/尺寸/位移，不改命中区） */
    '.tj-marker:hover .tj-mk-in{background:linear-gradient(160deg,#b53c33,#972c25);border-color:rgba(246,234,210,.75);',
    'box-shadow:0 3px 10px rgba(0,0,0,.6),inset 0 0 0 1px rgba(255,235,200,.35)}',
    '.tj-marker:focus-visible .tj-mk-in{box-shadow:0 2px 7px rgba(0,0,0,.5),0 0 0 2px rgba(246,234,210,.6)}',
    '.tj-mk-pend{position:absolute;top:-10px;right:-8px;padding:1px 4px;border-radius:2px;background:rgba(20,12,8,.82);color:rgba(240,220,185,.9);',
    'border:1px dashed rgba(205,168,110,.55);font:10px/1.5 var(--font-kai,KaiTi,serif);letter-spacing:.1em;pointer-events:none}',
    /* 红圈（待考）：边线虚化、整体淡一档 */
    '.tj-marker.is-ext .tj-mk-in{background:linear-gradient(160deg,rgba(150,60,52,.62),rgba(112,42,36,.62));',
    'border-style:dashed;border-color:rgba(230,200,160,.4);color:rgba(250,238,216,.8);',
    'box-shadow:0 2px 6px rgba(0,0,0,.38),inset 0 0 0 1px rgba(255,235,200,.12)}',
    /* 「我在哪」命中：金描边（inset 描边不外扩，不改命中框） */
    '.tj-marker.is-me .tj-mk-in{box-shadow:0 2px 8px rgba(0,0,0,.55),inset 0 0 0 2px rgba(228,190,110,.9)}',
    '@keyframes tj-mk-pulse{0%{box-shadow:0 2px 8px rgba(0,0,0,.55),0 0 0 0 rgba(228,190,110,.85)}',
    '100%{box-shadow:0 2px 8px rgba(0,0,0,.55),0 0 0 14px rgba(228,190,110,0)}}',
    '.tj-marker.is-pulse .tj-mk-in{animation:tj-mk-pulse 900ms ease-out 2}',

    /* —— 里数小签：viewport 层，真实像素 —— */
    '.tj-roadtag{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none}',
    '.tj-roadtag span{position:absolute;left:0;top:0;transform:translate(-50%,-50%);',
    'padding:1px 5px;border-radius:2px;background:rgba(16,11,7,.72);color:rgba(236,214,170,.92);',
    'border:1px solid rgba(205,168,110,.38);font:11px/1.5 var(--font-kai,KaiTi,serif);letter-spacing:.06em;white-space:nowrap}',

    /* —— 我在哪纸签（viewport 层）—— */
    '.tj-map-chip{position:absolute;left:12px;top:10px;z-index:5;display:none;align-items:center;gap:6px;',
    'padding:5px 10px;border-radius:3px;background:rgba(24,17,11,.88);border:1px solid rgba(197,168,102,.4);',
    'color:#ecd6a8;font:13px/1 var(--font-kai,KaiTi,serif);letter-spacing:.1em;max-width:70%}',
    '.tj-map-chip.is-show{display:inline-flex}',
    '.tj-map-chip.is-link{cursor:pointer}',
    '.tj-map-chip.is-link:hover{background:rgba(60,26,18,.9)}',
    '.tj-map-chip .tj-chip-seal{flex:none;width:15px;height:15px;border-radius:2px;background:#9e2b25;color:#f6ead2;',
    'display:flex;align-items:center;justify-content:center;font-size:10px;letter-spacing:0}',
    '.tj-map-chip .tj-chip-x{margin-left:2px;color:rgba(232,217,184,.5);font-size:12px;cursor:pointer}',
    '.tj-map-chip .tj-chip-x:hover{color:#f6ead2}',

    /* —— 缩放钮（右下）—— */
    '.tj-map-zoom{position:absolute;right:12px;bottom:12px;z-index:5;display:flex;flex-direction:column;gap:6px}',
    '.tj-map-zb{width:30px;height:30px;border-radius:4px;border:1px solid rgba(197,168,102,.4);',
    'background:rgba(24,17,11,.85);color:#ecd6a8;font:16px/1 var(--font-kai,KaiTi,serif);cursor:pointer;padding:0}',
    '.tj-map-zb:hover{background:rgba(158,43,37,.5)}',

    /* —— 纸条详情卡（viewport 层，不随缩放）—— */
    '.tj-map-card{position:absolute;z-index:6;width:min(300px,72%);display:none;flex-direction:column;',
    'border-radius:4px;background:linear-gradient(175deg,#f4e9cf,#e9dabb);color:#33261a;',
    'border:1px solid rgba(90,60,30,.45);box-shadow:0 14px 34px rgba(0,0,0,.55);',
    'font:13px/1.75 var(--font-kai,KaiTi,serif)}',
    '.tj-map-card.is-show{display:flex}',
    '.tj-card-head{display:flex;align-items:center;gap:7px;padding:8px 10px 7px;',
    'border-bottom:1px dashed rgba(90,60,30,.4);font-size:15px;letter-spacing:.18em}',
    '.tj-card-head .tj-card-badge{font-size:10px;letter-spacing:.12em;padding:1px 5px;border-radius:2px;',
    'border:1px dashed rgba(140,50,40,.6);color:#8c3228;background:rgba(158,43,37,.08)}',
    '.tj-card-head .tj-card-x{margin-left:auto;width:20px;height:20px;border:0;border-radius:3px;cursor:pointer;',
    'background:none;color:rgba(90,60,30,.6);font:13px/1 var(--font-kai,KaiTi,serif);padding:0}',
    '.tj-card-head .tj-card-x:hover{color:#8c2620}',
    '.tj-card-body{padding:8px 11px 6px;max-height:38vh;overflow:auto}',
    '.tj-card-body p{margin:0 0 6px;text-align:justify}',
    '.tj-card-body p.tj-anchor{color:rgba(90,58,32,.8);font-size:12px}',
    /* 玩家版分段版式：定位（lede）/ 须知（label+item）/ 路感（road） */
    '.tj-card-body p.tj-lede{font-size:14px;color:#241a10;margin-bottom:4px}',
    '.tj-card-body p.tj-label{margin:7px 0 3px;font-size:11px;letter-spacing:.22em;color:#8c3228}',
    '.tj-card-body p.tj-item{padding-left:1.4em;text-indent:-1.4em;margin:0 0 4px}',
    '.tj-card-body p.tj-road{margin-top:7px;margin-bottom:2px;padding:5px 8px;',
    'background:rgba(140,50,40,.07);border-left:2px solid rgba(140,50,40,.4);',
    'color:rgba(90,58,32,.85);font-size:12px}',
    '.tj-card-dist{margin:2px 10px 6px;padding:5px 8px;border-radius:3px;background:rgba(158,43,37,.1);',
    'border:1px dashed rgba(140,50,40,.45);color:#7c2a20;font-size:12px;letter-spacing:.05em}',
    '.tj-card-foot{padding:0 11px 8px;font-size:10px;color:rgba(90,60,30,.55);letter-spacing:.08em}',
    '@media (prefers-reduced-motion:reduce){.tj-map-scrim,.tj-map-panel,.tj-map-world img{transition-duration:1ms!important}}',
  ].join('');

  var UI = null;

  function parentWin() { try { return window.parent || window; } catch (e) { return window; } }
  function parentDoc() { try { var w = parentWin(); return (w && w.document) || null; } catch (e) { return null; } }

  function scenarioFromUrl() {
    try { var m = /[?&]scenario=([^&]+)/.exec(window.location.search); return m ? m[1] : null; }
    catch (e) { return null; }
  }

  /* 面板尺寸：92% 视口内按地图比例等比装下 */
  function panelSize() {
    var w = parentWin();
    var aw = (w.innerWidth || 1280) * .92, ah = (w.innerHeight || 800) * .92;
    var pw = Math.min(aw, ah * ASPECT);
    return { w: Math.round(pw), h: Math.round(pw / ASPECT) };
  }

  /* ---- 数字 → 中文（里数用，与世界观文风一致） ---- */
  var CN_D = '零一二三四五六七八九';
  function cnNum(n) {
    n = Math.round(n);
    if (n < 10) return CN_D.charAt(n);
    if (n < 20) return '十' + (n % 10 ? CN_D.charAt(n % 10) : '');
    if (n < 100) return CN_D.charAt(Math.floor(n / 10)) + '十' + (n % 10 ? CN_D.charAt(n % 10) : '');
    if (n < 1000) return '一百' + (n % 100 ? (n % 100 < 10 ? '零' + cnNum(n % 100) : (n % 100 === 10 ? '一十' : cnNum(n % 100))) : '');
    return String(n);
  }

  /* ---- 里程：优先查已知驿路，否则按比例尺估算（十位取整） ---- */
  function roadBetween(a, b) {
    var rs = D.roads || [];
    for (var i = 0; i < rs.length; i++) {
      if ((rs[i].a === a && rs[i].b === b) || (rs[i].a === b && rs[i].b === a)) return rs[i];
    }
    return null;
  }
  function distInfo(ma, mb) {
    var r = roadBetween(ma.id, mb.id);
    if (r && r.li != null) return { li: r.li, est: !!r.est };
    /* 归一化坐标欧氏距离；y 按 878/2048 换算到宽向尺度，再乘标定比例尺 */
    var dx = ma.x - mb.x, dy = (ma.y - mb.y) * Y_SCALE;
    var li = Math.round(Math.sqrt(dx * dx + dy * dy) * LI_PER_UNIT / 10) * 10;
    if (li < 10) li = 10;
    return { li: li, est: true };
  }
  function distLine(ma, mb) {
    var d = distInfo(ma, mb);
    var li = '自' + ma.name + '至' + mb.name + ' · ' + (d.est ? '约' : '') + cnNum(d.li) + '里';
    li += ' · ' + (d.li <= DANGEROUS_LI ? '车马当日可至' : '车马约' + cnNum(Math.ceil(d.li / DAY_LI)) + '日');
    return li;
  }

  /* ---- 时辰 → 昼夜（idx*2+1 点，≥19 或 <5 为夜） ---- */
  function hourOf(str) {
    var s = String(str || '');
    for (var i = 0; i < HOURS.length; i++) if (s.indexOf(HOURS.charAt(i)) >= 0) return i * 2 + 1;
    return null;
  }

  /* ================= 构建 DOM ================= */
  function build() {
    if (UI) return UI;
    var pd = parentDoc() || document;
    var st = pd.createElement('style');
    st.id = 'tj-map-style'; st.textContent = CSS;
    (pd.head || pd.documentElement).appendChild(st);

    var scrim = pd.createElement('div');
    scrim.className = 'tj-map-scrim'; scrim.id = 'tj-map-scrim';
    scrim.innerHTML =
      '<div class="tj-map-panel" role="dialog" aria-label="棠郡舆图">' +
        '<div class="tj-map-head">' +
          '<span class="tj-seal">棠</span><span>棠郡輿圖</span>' +
          '<span class="tj-sub">览图 · 不涉行止</span>' +
          '<span class="tj-map-tools">' +
            '<button class="tj-map-btn" type="button" data-tools="day" title="昼图">日</button>' +
            '<button class="tj-map-btn" type="button" data-tools="night" title="夜图">夜</button>' +
            '<button class="tj-map-btn is-on" type="button" data-layer="land" title="官道·商路·山道·险径">道路</button>' +
            '<button class="tj-map-btn is-on" type="button" data-layer="water" title="水路渡口">水路</button>' +
            '<button class="tj-map-btn" type="button" data-layer="secret" title="隐秘路径">隐迹</button>' +
            '<button class="tj-map-btn" type="button" data-tools="me" title="读时地变量，标出此刻所在">我在哪</button>' +
          '</span>' +
          '<button class="tj-map-close" type="button" aria-label="收起舆图">✕</button>' +
        '</div>' +
        '<div class="tj-map-body">' +
          /* 缩放容器：只装底图 */
          '<div class="tj-map-world">' +
            '<img class="tj-map-img tj-img-day" src="' + imgSrc('day', IMG.day) + '" alt="棠郡舆图（昼）">' +
            '<img class="tj-map-img tj-img-night" src="' + imgSrc('night', IMG.night) + '" alt="棠郡舆图（夜）" style="opacity:0">' +
          '</div>' +
          /* 以下全部在缩放容器之外：每帧按屏幕坐标定位，真实像素 */
          '<svg class="tj-map-roads" aria-hidden="true"></svg>' +
          '<div class="tj-map-roadtags"></div>' +
          '<div class="tj-map-marks"></div>' +
          '<div class="tj-map-chip"><span class="tj-chip-seal">此</span><span class="tj-chip-txt"></span><span class="tj-chip-x">✕</span></div>' +
          '<div class="tj-map-zoom">' +
            '<button class="tj-map-zb" type="button" data-zoom="in" aria-label="放大">＋</button>' +
            '<button class="tj-map-zb" type="button" data-zoom="out" aria-label="缩小">−</button>' +
            '<button class="tj-map-zb" type="button" data-zoom="fit" aria-label="复位">⌂</button>' +
          '</div>' +
          '<div class="tj-map-card" role="dialog" aria-label="地名笺">' +
            '<div class="tj-card-head"><span class="tj-card-name"></span><span class="tj-card-badge" hidden>待考</span>' +
            '<button class="tj-card-x" type="button" aria-label="收起纸条">✕</button></div>' +
            '<div class="tj-card-body"></div><div class="tj-card-dist" hidden></div>' +
            '<div class="tj-card-foot"></div>' +
          '</div>' +
          '<div class="tj-route-chip" role="dialog" aria-label="道路笺"></div>' +
        '</div>' +
      '</div>';
    pd.body.appendChild(scrim);

    var panel = scrim.querySelector('.tj-map-panel');
    var body = scrim.querySelector('.tj-map-body');
    var world = scrim.querySelector('.tj-map-world');
    var card = scrim.querySelector('.tj-map-card');

    var ui = {
      scrim: scrim, panel: panel, body: body, world: world, card: card,
      routeChip: scrim.querySelector('.tj-route-chip'),
      marks: scrim.querySelector('.tj-map-marks'),
      roadsSvg: scrim.querySelector('.tj-map-roads'),
      roadtags: scrim.querySelector('.tj-map-roadtags'),
      chip: scrim.querySelector('.tj-map-chip'),
      shown: false, night: false, nightMode: 'auto',   /* auto | day | night（手动覆盖当次会话） */
      stateCache: null, meId: null, lastPin: null,
      z: 1, tx: 0, ty: 0, pd: pd,
    };
    UI = ui;

    /* ---- 印章（viewport 层：JS 定屏幕坐标，CSS 管版式） ---- */
    var mkIndex = {};
    (D.markers || []).forEach(function (m) {
      var b = pd.createElement('button');
      b.type = 'button';
      var kindCls = { major: ' is-major', town: '', minor: ' is-minor', danger: ' is-danger', hidden: ' is-hiddenmk' }[m.mk || 'town'] || '';
      b.className = 'tj-marker' + (m.ring === 'red' ? ' is-ext' : '') + kindCls;
      b.setAttribute('data-len', String(Math.min(4, Math.max(2, m.name.length))));
      b.setAttribute('aria-label', m.name + (m.ring === 'red' ? '（待考）' : ''));
      /* 命中框：.tj-mk-hit 固定尺寸透明框负责接鼠标（不 transform、不变尺寸）；
         .tj-mk-in 只是视觉，pointer-events:none。 */
      b.innerHTML =
        '<span class="tj-mk-hit" aria-hidden="true"></span>' +
        '<span class="tj-mk-in">' + m.name + (m.ring === 'red' ? '<span class="tj-mk-pend">待考</span>' : '') + '</span>';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        pin(m, b);
      });
      ui.marks.appendChild(b);
      mkIndex[m.id] = { d: m, el: b, sx: 0, sy: 0 };
    });
    ui.mkIndex = mkIndex;

    /* ---- 驿路：viewport 层 SVG（线）+ HTML（里数签），每帧重算屏幕坐标 ---- */
    var NS = 'http://www.w3.org/2000/svg';
    /* 区域晕光（险/泽/隐）：SVG 径向渐变 */
    var defs = pd.createElementNS(NS, 'defs');
    defs.innerHTML =
      '<radialGradient id="tj-grad-danger"><stop offset="0%" stop-color="rgba(113,31,28,.34)"/>' +
      '<stop offset="70%" stop-color="rgba(113,31,28,.1)"/><stop offset="100%" stop-color="rgba(113,31,28,0)"/></radialGradient>' +
      '<radialGradient id="tj-grad-spirit"><stop offset="0%" stop-color="rgba(80,140,130,.28)"/>' +
      '<stop offset="70%" stop-color="rgba(80,140,130,.08)"/><stop offset="100%" stop-color="rgba(80,140,130,0)"/></radialGradient>' +
      '<radialGradient id="tj-grad-hiddenmk"><stop offset="0%" stop-color="rgba(96,124,130,.22)"/>' +
      '<stop offset="100%" stop-color="rgba(96,124,130,0)"/></radialGradient>';
    ui.roadsSvg.appendChild(defs);
    var regionEls = [];
    (D.regions || []).forEach(function (g) {
      var el = pd.createElementNS(NS, 'ellipse');
      el.setAttribute('class', 'tj-region tj-region-' + g.kind);
      ui.roadsSvg.appendChild(el);
      regionEls.push({ g: g, el: el });
    });
    ui.regionEls = regionEls;

    var roadEls = [];
    (D.roads || []).forEach(function (r) {
      var ma = mkIndex[r.a] && mkIndex[r.a].d, mb = mkIndex[r.b] && mkIndex[r.b].d;
      if (!ma || !mb) return;
      var pts = (r.path && r.path.length >= 2) ? r.path : [[ma.x, ma.y], [mb.x, mb.y]];
      var ln = pd.createElementNS(NS, 'polyline');
      ln.setAttribute('class', 'is-road is-' + (r.type || 'official'));
      ui.roadsSvg.appendChild(ln);
      var hit = pd.createElementNS(NS, 'polyline');
      hit.setAttribute('class', 'is-hit');
      ui.roadsSvg.appendChild(hit);
      hit.addEventListener('click', function (e) {
        e.stopPropagation();
        if (ui._panMoved) return;   /* 拖动后的 click 不出笺 */
        var br = ui.body.getBoundingClientRect();
        showRouteChip(r, { sx: e.clientX - br.left, sy: e.clientY - br.top });
      });
      hit.addEventListener('mouseenter', function () { ln.classList.add('is-hot'); });
      hit.addEventListener('mouseleave', function () { ln.classList.remove('is-hot'); });
      var tag = pd.createElement('span');
      tag.className = 'tj-roadtag rt-' + ({ official: 'land', trade: 'land', mountain: 'land', danger: 'land', water: 'water', secret: 'secret' }[r.type] || 'land');
      var label = r.li == null ? '山径' : (r.est ? '约' : '') + cnNum(r.li) + '里';
      tag.innerHTML = '<span>' + label + '</span>';
      ui.roadtags.appendChild(tag);
      roadEls.push({ r: r, pts: pts, ln: ln, hit: hit, tag: tag });
    });
    ui.roadEls = roadEls;

    /* ---- 溱水等水线：透明热区（点击出卡，锚点=点击处）+ 悬停晕光；随帧重算 ---- */
    var waterEls = [];
    (D.waters || []).forEach(function (w) {
      var hl = pd.createElementNS(NS, 'polyline');
      hl.setAttribute('class', 'is-whit-hl');
      var hit = pd.createElementNS(NS, 'polyline');
      hit.setAttribute('class', 'is-whit');
      ui.roadsSvg.appendChild(hl);
      ui.roadsSvg.appendChild(hit);
      var item = { id: 'water:' + w.id, name: w.name, ring: w.ring || 'blue',
                   text: w.text || '', src: w.src || '', isWater: true };
      hit.addEventListener('click', function (e) {
        e.stopPropagation();
        if (ui._panMoved) return;
        var br = ui.body.getBoundingClientRect();
        showCard(item, null, { sx: e.clientX - br.left, sy: e.clientY - br.top });
      });
      hit.addEventListener('mouseenter', function () { hl.style.opacity = '1'; });
      hit.addEventListener('mouseleave', function () { hl.style.opacity = ''; });
      waterEls.push({ w: w, hit: hit, hl: hl });
    });
    ui.waterEls = waterEls;

    /* ---- 屏幕坐标重算：地图坐标×缩放＋平移（取整），只动 translate3d ---- */
    function updateMarks() {
      var W = ui.body.clientWidth, H = ui.body.clientHeight, z = ui.z, tx = ui.tx, ty = ui.ty;
      for (var id in mkIndex) {
        var ent = mkIndex[id];
        ent.sx = Math.round(ent.d.x * W * z + tx);
        ent.sy = Math.round(ent.d.y * H * z + ty);
        ent.el.style.transform = 'translate3d(' + ent.sx + 'px,' + ent.sy + 'px,0)';
      }
      for (var i = 0; i < roadEls.length; i++) {
        var ro = roadEls[i], ps = [];
        for (var p = 0; p < ro.pts.length; p++) {
          ps.push(Math.round(ro.pts[p][0] * W * z + tx) + ',' + Math.round(ro.pts[p][1] * H * z + ty));
        }
        ro.ln.setAttribute('points', ps.join(' '));
        ro.hit.setAttribute('points', ps.join(' '));
        var mid = ro.pts[Math.floor(ro.pts.length / 2)];
        ro.tag.style.transform = 'translate3d(' + Math.round(mid[0] * W * z + tx) + 'px,' + Math.round(mid[1] * H * z + ty) + 'px,0)';
      }
      for (var q = 0; q < regionEls.length; q++) {
        var rg = regionEls[q];
        rg.el.setAttribute('cx', Math.round(rg.g.x * W * z + tx));
        rg.el.setAttribute('cy', Math.round(rg.g.y * H * z + ty));
        rg.el.setAttribute('rx', Math.max(8, Math.round(rg.g.rx * W * z)));
        rg.el.setAttribute('ry', Math.max(8, Math.round(rg.g.ry * H * z)));
      }
      for (var k = 0; k < waterEls.length; k++) {
        var we = waterEls[k], wps = [];
        for (var j = 0; j < we.w.pts.length; j++) {
          wps.push(Math.round(we.w.pts[j][0] * W * z + tx) + ',' + Math.round(we.w.pts[j][1] * H * z + ty));
        }
        var s = wps.join(' ');
        we.hit.setAttribute('points', s);
        we.hl.setAttribute('points', s);
      }
    }
    ui.updateMarks = updateMarks;

    /* ---- 拖动 / 缩放 ---- */
    var ptrs = new Map();
    var panRef = null, pinchRef = null;

    function clampT() {
      var vw = ui.body.clientWidth, vh = ui.body.clientHeight;
      var minX = vw * (1 - ui.z), minY = vh * (1 - ui.z);
      ui.tx = Math.min(0, Math.max(minX, ui.tx));
      ui.ty = Math.min(0, Math.max(minY, ui.ty));
      if (ui.z <= 1.001) { ui.tx = 0; ui.ty = 0; }
    }
    function apply() {
      clampT();
      ui.world.style.transform = 'translate3d(' + ui.tx.toFixed(1) + 'px,' + ui.ty.toFixed(1) + 'px,0) scale(' + ui.z.toFixed(4) + ')';
      updateMarks();
    }
    function zoomAt(ax, ay, nz, byBtn) {
      nz = Math.min(Z_MAX, Math.max(Z_MIN, nz));
      if (nz === ui.z) return;
      if (byBtn) { ax = ui.body.clientWidth / 2; ay = ui.body.clientHeight / 2; }
      ui.tx = ax - (ax - ui.tx) * (nz / ui.z);
      ui.ty = ay - (ay - ui.ty) * (nz / ui.z);
      ui.z = nz;
      apply();
    }
    ui.zoomAt = zoomAt;

    body.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      /* 印章/纸签/缩放钮/详情卡是「点按」控件：不启动拖拽、不捕获指针，
         否则 setPointerCapture 会把后续 click 重定向到 body，按钮全哑。
         道路/水线命中线特殊：可点、也可拖——按下时不捕获指针（click 才能落在线上），
         真拖动用 _panMoved 抑制路线笺。 */
      if (e.target.closest && e.target.closest('.tj-marker,.tj-map-chip,.tj-map-zb,.tj-map-card')) return;
      closeCard(); closeRouteChip();
      var roadHit = !!(e.target.closest && e.target.closest('.tj-map-roads polyline.is-hit, .tj-map-roads polyline.is-whit'));
      ui._panMoved = false;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!roadHit) body.setPointerCapture(e.pointerId);
      if (ptrs.size === 1) {
        panRef = { x: e.clientX, y: e.clientY, tx: ui.tx, ty: ui.ty };
        body.classList.add('is-panning');
      } else if (ptrs.size === 2) {
        var ps = []; ptrs.forEach(function (v) { ps.push(v); });
        pinchRef = {
          d: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) || 1,
          z: ui.z, mx: (ps[0].x + ps[1].x) / 2, my: (ps[0].y + ps[1].y) / 2,
          tx: ui.tx, ty: ui.ty,
        };
        panRef = null;
      }
    });
    body.addEventListener('pointermove', function (e) {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (panRef && ptrs.size === 1) {
        if (Math.abs(e.clientX - panRef.x) + Math.abs(e.clientY - panRef.y) > 4) ui._panMoved = true;
        ui.tx = panRef.tx + (e.clientX - panRef.x);
        ui.ty = panRef.ty + (e.clientY - panRef.y);
        apply();
      } else if (pinchRef && ptrs.size === 2) {
        var ps = []; ptrs.forEach(function (v) { ps.push(v); });
        var d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) || 1;
        var nz = Math.min(Z_MAX, Math.max(Z_MIN, pinchRef.z * (d / pinchRef.d)));
        var mx = (ps[0].x + ps[1].x) / 2, my = (ps[0].y + ps[1].y) / 2;
        var br = ui.body.getBoundingClientRect();
        /* 绝对式：pinch 基准帧的锚点地图像素 w0 = (m0 - t0)/z0，要求它跟住新锚点 */
        var ax0 = pinchRef.mx - br.left, ay0 = pinchRef.my - br.top;
        var k = nz / pinchRef.z;
        ui.tx = (mx - br.left) - (ax0 - pinchRef.tx) * k;
        ui.ty = (my - br.top) - (ay0 - pinchRef.ty) * k;
        ui.z = nz;
        apply();
      }
    });
    function endPtr(e) {
      ptrs.delete(e.pointerId);
      if (ptrs.size === 0) { panRef = null; pinchRef = null; body.classList.remove('is-panning'); }
      else if (ptrs.size === 1) { pinchRef = null; var ps = []; ptrs.forEach(function (v) { ps.push(v); }); panRef = { x: ps[0].x, y: ps[0].y, tx: ui.tx, ty: ui.ty }; }
    }
    body.addEventListener('pointerup', endPtr);
    body.addEventListener('pointercancel', endPtr);
    body.addEventListener('wheel', function (e) {
      e.preventDefault();
      var br = ui.body.getBoundingClientRect();
      zoomAt(e.clientX - br.left, e.clientY - br.top, ui.z * (e.deltaY < 0 ? 1.18 : 1 / 1.18));
    }, { passive: false });

    /* ---- 右下钮 ---- */
    ui.scrim.querySelectorAll('.tj-map-zb').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var k = b.getAttribute('data-zoom');
        if (k === 'in') zoomAt(0, 0, ui.z * Z_STEP, true);
        else if (k === 'out') zoomAt(0, 0, ui.z / Z_STEP, true);
        else { ui.z = 1; ui.tx = 0; ui.ty = 0; apply(); }
      });
    });

    /* ---- 头部工具：日/夜/驿路/我在哪 ---- */
    ui.scrim.querySelectorAll('[data-tools]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var k = b.getAttribute('data-tools');
        if (k === 'day' || k === 'night') {
          var want = (k === 'night');
          if (ui.nightMode === (want ? 'night' : 'day')) { ui.nightMode = 'auto'; }   /* 再点同键＝回到随辰 */
          else ui.nightMode = want ? 'night' : 'day';
          applyNight();
        } else if (k === 'roads') {
          var on = !b.classList.contains('is-on');
          b.classList.toggle('is-on', on);
          ui.roadsSvg.classList.toggle('ghost', !on);   /* 只藏驿路线：水线热区常在 */
          ui.roadtags.style.display = on ? '' : 'none';
        } else if (k === 'me') {
          locateMe();
        }
      });
    });

    /* ---- 图层钮：道路 / 水路 / 隐迹 ---- */
    ui.scrim.querySelectorAll('[data-layer]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var on = !b.classList.contains('is-on');
        b.classList.toggle('is-on', on);
        var cls = { land: 'hide-land', water: 'hide-water', secret: 'hide-secret' }[b.getAttribute('data-layer')];
        ui.roadsSvg.classList.toggle(cls, !on);
        ui.roadtags.classList.toggle(cls, !on);
      });
    });

    /* ---- 详情卡 ---- */
    ui.card.querySelector('.tj-card-x').addEventListener('click', function (e) { e.stopPropagation(); closeCard(); });

    function pin(m, el) {
      var other = ui.lastPin && ui.lastPin.id !== m.id ? ui.lastPin : null;
      showCard(m, other ? distLine(other, m) : null);
      ui.lastPin = m;
      ui.pinnedEl = el || null;
    }
    ui.pin = pin;

    function showCard(m, distText, anchor) {
      var head = ui.card.querySelector('.tj-card-name');
      head.textContent = m.name;
      ui.card.querySelector('.tj-card-badge').hidden = m.ring !== 'red';
      var bd = ui.card.querySelector('.tj-card-body');
      bd.innerHTML = '';
      /* 玩家版分段：首行=定位；「玩家须知」=小节签；「N.」=条目；「路感」=路感块；
         「质感锚点」兼容旧数据。 */
      var first = true;
      String(m.text || '').split('\n').forEach(function (seg) {
        seg = seg.replace(/\s+$/, '');
        if (!seg) return;
        var p = pd.createElement('p');
        if (first) { p.className = 'tj-lede'; first = false; }
        else if (seg.indexOf('风物') === 0 || seg.indexOf('玩家须知') === 0) p.className = 'tj-label';
        else if (/^\d+[.、]/.test(seg)) p.className = 'tj-item';
        else if (seg.indexOf('路感') === 0) p.className = 'tj-road';
        else if (seg.indexOf('质感锚点') === 0) p.className = 'tj-anchor';
        p.textContent = seg;
        bd.appendChild(p);
      });
      var dist = ui.card.querySelector('.tj-card-dist');
      if (distText) { dist.textContent = distText; dist.hidden = false; } else dist.hidden = true;
      ui.card.querySelector('.tj-card-foot').textContent = '郡中风物 · 旅人见闻';
      ui.card.classList.add('is-show');
      placeCard(m, anchor);
    }
    var TYPE_CN = { official: '官道', trade: '商路', mountain: '山道', water: '水路', danger: '险径', secret: '隐径' };
    function showRouteChip(r, anchor) {
      var ma = mkIndex[r.a] && mkIndex[r.a].d, mb = mkIndex[r.b] && mkIndex[r.b].d;
      if (!ma || !mb) return;
      var el = ui.routeChip;
      var li = r.li == null ? '里数未记' :
        (r.est ? '约' : '') + cnNum(r.li) + '里 · ' + (r.li <= DANGEROUS_LI ? '车马当日可至' : '车马约' + cnNum(Math.ceil(r.li / DAY_LI)) + '日');
      el.innerHTML = '<span class="tj-rc-name">' + ma.name + '—' + mb.name + ' · ' + (TYPE_CN[r.type] || '道路') + '</span>' +
        '<span>' + li + '</span>' + (r.note ? '<span class="tj-rc-note">' + r.note + '</span>' : '');
      el.classList.add('is-show');
      var br = ui.body.getBoundingClientRect(), cr = el.getBoundingClientRect();
      var x = Math.min(br.width - cr.width - 10, Math.max(10, anchor.sx + 12));
      var y = Math.min(br.height - cr.height - 10, Math.max(10, anchor.sy - 10));
      el.style.left = Math.round(x) + 'px';
      el.style.top = Math.round(y) + 'px';
    }
    function closeRouteChip() { if (UI && UI.routeChip) UI.routeChip.classList.remove('is-show'); }
    ui.closeRouteChip = closeRouteChip;
    function placeCard(m, anchor) {
      var ent = anchor ? null : mkIndex[m.id];
      if (!anchor && !ent) return;
      var br = ui.body.getBoundingClientRect(), cr = ui.card.getBoundingClientRect();
      if (!cr.width) { ui.card.style.visibility = 'hidden'; ui.card.classList.add('is-show'); cr = ui.card.getBoundingClientRect(); ui.card.style.visibility = ''; }
      var ax = anchor ? anchor.sx : ent.sx, ay = anchor ? anchor.sy : ent.sy;   /* 印章/点击处锚点（viewport 坐标） */
      var x = ax + 18, y = ay - 14;
      x = Math.min(br.width - cr.width - 10, Math.max(10, x));
      y = Math.min(br.height - cr.height - 10, Math.max(10, y));
      ui.card.style.left = Math.round(x) + 'px';
      ui.card.style.top = Math.round(y) + 'px';
    }
    function closeCard() { if (UI && UI.card) UI.card.classList.remove('is-show'); }

    /* ---- 我在哪 ---- */
    var chipTxt = ui.chip.querySelector('.tj-chip-txt');
    var chipX = ui.chip.querySelector('.tj-chip-x');
    chipX.addEventListener('click', function (e) { e.stopPropagation(); ui.chip.classList.remove('is-show'); });

    function matchMarker(t) {
      var ms = D.markers || [];
      var i, m;
      var s = String(t || '').trim();
      if (!s) return null;
      for (i = 0; i < ms.length; i++) if (ms[i].name === s) return ms[i];
      for (i = 0; i < ms.length; i++) if ((ms[i].alias || []).indexOf(s) >= 0) return ms[i];
      for (i = 0; i < ms.length; i++) {
        m = ms[i];
        if ((m.alias || []).some(function (a) { return s.indexOf(a) >= 0; })) return m;
      }
      /* 水系地名（溱水）：只报位置，不聚焦（无印章可标） */
      var ws = D.waters || [];
      for (i = 0; i < ws.length; i++) {
        if (ws[i].name === s || s.indexOf(ws[i].name) >= 0 ||
            (ws[i].alias || []).indexOf(s) >= 0) return { isWater: true, name: ws[i].name };
      }
      return null;
    }
    function locateMe() {
      var done = function (state) {
        ui.stateCache = state;
        var td = (state && state.棠郡 && state.棠郡.时地) || {};
        var hit = matchMarker(td.地区) || matchMarker(td.地点);
        clearMe();
        if (hit && hit.isWater) {
          chipTxt.textContent = '此刻在 · ' + hit.name;
          ui.chip.classList.add('is-show');
          ui.chip.classList.remove('is-link');
          ui.chip._target = null;
        } else if (hit) {
          ui.meId = hit.id;
          var ent = mkIndex[hit.id];
          if (ent) ent.el.classList.add('is-me');
          var label = [td.地区, td.地点].filter(Boolean).join(' · ');
          chipTxt.textContent = '此刻在 · ' + (label || hit.name);
          ui.chip.classList.add('is-show', 'is-link');
          ui.chip._target = hit.id;
        } else {
          var raw = [td.地区, td.地点].filter(Boolean).join(' · ');
          chipTxt.textContent = raw ? '图上无此地名：' + raw : '（时地不明）';
          ui.chip.classList.add('is-show');
          ui.chip.classList.remove('is-link');
          ui.chip._target = null;
        }
      };
      if (ui.stateCache) { done(ui.stateCache); return; }
      if (!window.TJState) { chipTxt.textContent = '（读不到变量：状态模块未载）'; ui.chip.classList.add('is-show'); ui.chip.classList.remove('is-link'); return; }
      window.TJState.getState({ scenario: scenarioFromUrl() }).then(done, function () {
        chipTxt.textContent = '（读不到变量：时地未知）';
        ui.chip.classList.add('is-show'); ui.chip.classList.remove('is-link');
      });
    }
    function clearMe() {
      if (ui.meId && mkIndex[ui.meId]) mkIndex[ui.meId].el.classList.remove('is-me');
      ui.meId = null;
    }
    ui.chip.addEventListener('click', function (e) {
      if (e.target === chipX) return;
      if (!ui.chip._target) return;
      focusMarker(ui.chip._target);
    });
    function focusMarker(id) {
      var ent = mkIndex[id]; if (!ent) return;
      var vw = ui.body.clientWidth, vh = ui.body.clientHeight;
      if (ui.z < 2) zoomAt(0, 0, 2, true);
      var mx = ent.d.x * vw, my = ent.d.y * vh;
      ui.tx = vw / 2 - mx * ui.z;
      ui.ty = vh / 2 - my * ui.z;
      apply();
      ent.el.classList.remove('is-pulse');
      void ent.el.offsetWidth;   /* 重触发动画 */
      ent.el.classList.add('is-pulse');
    }
    ui.focusMarker = focusMarker;

    /* ---- 昼夜 ---- */
    function applyNight() {
      var wantNight;
      if (ui.nightMode === 'day') wantNight = false;
      else if (ui.nightMode === 'night') wantNight = true;
      else wantNight = !!ui.autoNight;
      ui.night = wantNight;
      ui.scrim.querySelector('.tj-img-day').style.opacity = wantNight ? '0' : '1';
      ui.scrim.querySelector('.tj-img-night').style.opacity = wantNight ? '1' : '0';
      var bd = ui.scrim.querySelector('[data-tools="day"]'), nt = ui.scrim.querySelector('[data-tools="night"]');
      bd.classList.toggle('is-on', ui.nightMode === 'day');
      nt.classList.toggle('is-on', ui.nightMode === 'night');
    }
    ui.applyNight = applyNight;

    /* ---- 关闭等 ---- */
    var onKey = function (e) {
      if (!UI || !UI.shown) return;
      if (e.key === 'Escape') {
        if (ui.routeChip.classList.contains('is-show')) closeRouteChip();
        else if (ui.card.classList.contains('is-show')) closeCard();
        else close();
      }
    };
    var onScrim = function (e) { if (UI && UI.shown && e.target === scrim) close(); };
    pd.addEventListener('keydown', onKey);
    scrim.addEventListener('mousedown', onScrim);
    scrim.querySelector('.tj-map-close').addEventListener('click', function () { close(); });

    var onRes = function () {
      if (!UI) return;
      var s2 = panelSize();
      panel.style.width = s2.w + 'px'; panel.style.height = s2.h + 'px';
      apply();
    };
    parentWin().addEventListener('resize', onRes);

    var sz = panelSize();
    panel.style.width = sz.w + 'px'; panel.style.height = sz.h + 'px';
    ui.autoNight = false;
    ui.roadsSvg.classList.add('hide-secret');   /* 隐径默认隐藏（图层钮可开） */
    ui.roadtags.classList.add('hide-secret');
    applyNight();
    apply();
    return ui;
  }

  /* ---- 时辰 → 自动昼夜（open 时读一次；手动键可覆盖当次会话） ---- */
  function autoNightFromState(state) {
    if (!UI || !state) return;
    UI.stateCache = state;
    var td = (state.棠郡 && state.棠郡.时地) || {};
    var h = hourOf(td.时辰);
    if (h == null) return;
    UI.autoNight = (h >= 21 || h < 5);   /* 2026-10-11：酉时(19) 起算夜太早，开场多是酉时→地图常黑。改戌时(21) 起。 */
    if (UI.nightMode === 'auto') UI.applyNight();
  }

  function open() {
    build();
    UI.shown = true;
    UI.scrim.classList.add('is-open');
    UI.applyNight();
    UI.updateMarks();
    /* 打开即读一次时地变量：自动判昼夜（随后手动键可覆盖） */
    if (window.TJState) {
      window.TJState.getState({ scenario: scenarioFromUrl() }).then(autoNightFromState, function () {});
    }
  }
  function close() { if (!UI || !UI.shown) return; UI.shown = false; UI.scrim.classList.remove('is-open'); }

  window.TJ_Map = {
    open: open,
    close: close,
    isOpen: function () { return !!(UI && UI.shown); },
    setNight: function (on) { if (!UI) build(); UI.nightMode = on ? 'night' : 'day'; UI.applyNight(); },
    zoom: function (nz) { if (!UI) build(); UI.zoomAt(0, 0, nz, true); },
    focusMarker: function (id) { if (!UI) build(); UI.focusMarker(id); },
    _ui: function () { return UI; },
  };
})();
