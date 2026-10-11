/* ==================================================================
   棠郡 · 页「人」渲染器（阶段三：折扇画廊 + 人物志）
   ------------------------------------------------------------------
   取值一律走 TJState.getState() 的结果，词条（档位名/立绘/人物志）
   一律走 TJLex。**不发明变量、不改键名。**

   折扇几何（指令 §四「页人」+ §6.3）：
     轴在下向上展开 · 五席 · 半开总角 100°（每面 20°）
     扇面楔形以「path + pattern 填充」绘制（clipPath 在注入场景下不可靠）
     立绘入绢：纸纹 multiply 叠加 + 降饱和微暖 + 外缘墨晕淡出
    未识：空白绢面 + 淡水渍 + 朱色小印
    状态：半开为常态，悬停时该面微抬、邻面让位；点扇面 = 翻到「人·传」整页

   席位规则（作者 2026-10-04 定）：扇上只有 TJLex.ROSTER 里的两位（姜、栾），
   其他人一律不上扇、不再自动补足；**这两位常驻画廊**——不看这一局有没有她们的数据，
   没数据时传页走占位；居中对称落座，空席留空白绢面（未识）。
================================================================== */
(function () {
  'use strict';
  /* 2026-10-11：srcdoc 里 <base> 不生效、构建期只改静态标签。
     JS 里拼的相对路径请求发不出去 → SVG 贴图整片丢。
     按本脚本自身 URL 推导站点根，换 Host 不用改代码。 */
  var _rbase = (document.currentScript && document.currentScript.src || '').replace(/[^/]*$/, '');


  var L = window.TJLex;
  var NS = 'http://www.w3.org/2000/svg';

  /* ================= 折扇：参数化几何（2026-10-05 重做） =================
     依据《折扇UI升级工程指令.md》§3：真折扇的纸只糊在**环形扇面**上
     （纸内缘以下是一截裸露的扇骨），两侧大骨更粗更长，根部一枚铆钉。
     —— "披萨片"的根因是几何，不是贴图。 */
  var FAN = {
    panels: 9,          /* 扇页总数（奇数、中轴对称；角色自中间向两侧占位） */
    spread: 120,        /* 展开角（度）：大都会三件实物反推 114°–124°，取中 */
    rOut: 300,          /* 骨长（user unit） */
    paperIn: 0.42,      /* 纸面内缘 = 骨长 × 此值；以下全是裸骨 */
    paperOut: 0.97,     /* 纸面外缘 */
    rPin: 13,           /* 铆钉半径 */
    ribBase: 20         /* 骨尾起画半径 */
  };
  var VW = 560, VH = 400;                       /* viewBox */
  var PX = VW / 2, PY = 372;                    /* 轴心＝铆钉 */
  var R_OUT = FAN.rOut;
  var RP_IN = R_OUT * FAN.paperIn;              /* 纸内缘 126 */
  var RP_OUT = R_OUT * FAN.paperOut;            /* 纸外缘 291 */
  var SEATS = FAN.panels;                       /* 实际页数由 setPanels() 定 */
  var BLADE_DEG = FAN.spread / SEATS;
  var HALF = BLADE_DEG / 2;
  var ANG0 = -FAN.spread / 2;
  var RIB_ANGLES = [];                          /* SEATS+1 根骨的角度 */
  var BLADE_ANGLES = [];                        /* 每页中心角 */

  /* 页数：作者 2026-10-08 定——**任何宽度都是九页**（撤 2026-10-05 的窄屏降 5 页：
     预览面板/酒馆窄列 ≤640px 时会触发旧降级，作者看到五页要求保持九页规格）。
     setPanels 的重算机制保留，仅断点取消。 */
  function panelCountFor() {
    return 9;
  }
  function setPanels(n) {
    if (n === SEATS && RIB_ANGLES.length) return false;   /* 没变，不重算 */
    SEATS = n;
    BLADE_DEG = FAN.spread / n;
    HALF = BLADE_DEG / 2;
    RIB_ANGLES = [];
    BLADE_ANGLES = [];
    for (var k = 0; k <= n; k++) RIB_ANGLES.push(ANG0 + k * BLADE_DEG);
    for (var i = 0; i < n; i++) BLADE_ANGLES.push(ANG0 + (i + 0.5) * BLADE_DEG);
    return true;
  }
  setPanels(panelCountFor());

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function mo(w) {
    return '<span class="mo-man"' + (w ? ' style="min-width:' + w + 'em"' : '') + '>&nbsp;</span>';
  }
  function cut(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; }
  function entriesOf(rec) {
    if (!rec) return [];
    return Object.keys(rec).map(function (k) { return { name: k, val: rec[k] || {} }; });
  }

  /* 极坐标：φ 以「正上方」为 0，顺时针为正 */
  function pt(r, deg) {
    var a = deg * Math.PI / 180;
    return [PX + r * Math.sin(a), PY - r * Math.cos(a)];
  }
  function f(n) { return Math.round(n * 100) / 100; }

  /* 每页一个确定性抖动：只用来做"边缘磨损"（不破旧，只是不像纯矢量图，指令 §15-三） */
  function jit(i, salt) {
    var x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }
  /* 纸面：环形扇面（以 0° 为中心画好，再由 CSS 旋到该页角度）。
     外缘用二次曲线**中段外鼓** —— 真扇展开后纸面不是纯平面（指令 §15-二）。 */
  function panelPath(i) {
    var ro = RP_OUT + (jit(i, 2) - 0.5) * 2.4;        /* 外半径 ±1.2 磨损 */
    var bulge = 1.4 + jit(i, 1) * 1.8;
    var p0i = pt(RP_IN, -HALF), p0o = pt(ro, -HALF);
    var p1o = pt(ro, HALF), p1i = pt(RP_IN, HALF);
    var M = pt(ro + bulge, 0);
    return 'M' + f(p0i[0]) + ' ' + f(p0i[1]) +
      ' L' + f(p0o[0]) + ' ' + f(p0o[1]) +
      ' Q' + f(M[0]) + ' ' + f(M[1]) + ' ' + f(p1o[0]) + ' ' + f(p1o[1]) +
      ' L' + f(p1i[0]) + ' ' + f(p1i[1]) +
      ' A' + f(RP_IN) + ' ' + f(RP_IN) + ' 0 0 0 ' + f(p0i[0]) + ' ' + f(p0i[1]) + ' Z';
  }
  /* 沿口裱边：外缘一条窄带（跟着纸面一起微鼓） */
  function rimPath(i) {
    var ro = RP_OUT + (jit(i, 2) - 0.5) * 2.4, ri = ro - 9;
    var a0 = pt(ri, -HALF), a1 = pt(ro, -HALF), b0 = pt(ro, HALF), b1 = pt(ri, HALF);
    var M = pt(ro + 1.4, 0);
    return 'M' + f(a0[0]) + ' ' + f(a0[1]) + ' L' + f(a1[0]) + ' ' + f(a1[1]) +
      ' Q' + f(M[0]) + ' ' + f(M[1]) + ' ' + f(b0[0]) + ' ' + f(b0[1]) +
      ' L' + f(b1[0]) + ' ' + f(b1[1]) +
      ' A' + f(ri) + ' ' + f(ri) + ' 0 0 0 ' + f(a0[0]) + ' ' + f(a0[1]) + ' Z';
  }
  /* 一段圆弧（扇肩线用） */
  function arcAt(r, a0, a1) {
    var p1 = pt(r, a0), p2 = pt(r, a1);
    var sweep = a1 > a0 ? 1 : 0;
    return 'M' + f(p1[0]) + ' ' + f(p1[1]) +
      ' A' + f(r) + ' ' + f(r) + ' 0 0 ' + sweep + ' ' + f(p2[0]) + ' ' + f(p2[1]);
  }
  /* 一根骨：上宽下窄的收分条（真扇骨形制） */
  function ribPath(deg, base, tip, rTip, rBase) {
    var a = deg * Math.PI / 180, nx = Math.cos(a), ny = Math.sin(a);
    var A = pt(rTip, deg), B = pt(rBase, deg);
    return 'M' + f(A[0] + nx * tip) + ' ' + f(A[1] + ny * tip) +
      ' L' + f(A[0] - nx * tip) + ' ' + f(A[1] - ny * tip) +
      ' L' + f(B[0] - nx * base) + ' ' + f(B[1] - ny * base) +
      ' L' + f(B[0] + nx * base) + ' ' + f(B[1] + ny * base) + ' Z';
  }

  /* ---- 席位 ----
     作者 2026-10-04 定：**扇上只留姜、栾两位**（TJLex.ROSTER），
     其他人一律不上扇，也不再按四轴加权自动补足。
     入册者居中对称落座（两位时坐二、四席），空席 = 「未识」空白绢面。 */
  /* 占位顺序：正中 → 左右交替向外（奇数页时正中最先；两位时坐在正中两侧）。
     页数改 5/9/11 都不用动这里 —— 这就是 setPanels() 之外唯一的"自动重排"。 */
  function seatOrder(n) {
    var out = [], mid = (n - 1) / 2;
    if (n % 2) out.push(Math.round(mid));            /* 奇数页：正中先占 */
    for (var d = 1; d <= n; d++) {                   /* 然后左右成对向外 ---- 偶数位时两人夹着中轴 */
      if (mid - d >= 0) out.push(Math.round(mid - d));
      if (mid + d <= n - 1) out.push(Math.round(mid + d));
    }
    return out;
  }
  function seatsOf(r) {
    /* 画廊常驻：作者 2026-10-04 定 —— 她们**始终在画廊里**，不是剧情里出现过才上扇。
       所以席位只认 ROSTER，不看这一局有没有她们的数据；没数据时传页走占位。 */
    var known = L.ROSTER.slice(0, SEATS);
    var seats = [];
    for (var i = 0; i < SEATS; i++) seats.push(null);
    var order = seatOrder(SEATS);
    known.forEach(function (name, i) { if (order[i] != null) seats[order[i]] = name; });
    return seats;
  }

  /* ---- 姓氏：印章引的就是它 ----
     优先从身份里取「X氏」；没有就从名字首字取（"老周/小乙"这类前缀要去掉）。 */
  var SURNAME_PREFIX = /^[老小阿]\s*/;
  function surnameOf(name, identity) {
    var m = /^\s*([\u4e00-\u9fa5])\s*氏/.exec(String(identity || ''));
    if (m) return m[1];
    var n = String(name || '').trim();
    if (/^老./.test(n)) n = n.slice(1);              /* 老周 → 周 */
    n = n.replace(SURNAME_PREFIX, '');
    return n ? n.charAt(0) : '';
  }

  /* ---- 生成整把扇 ---- */
  function fanMarkup(seats, zaiChang) {
    var zc = zaiChang || {};
    var defs = '';
    var blades = '';

    /* 纸面贴图：真绢织纹（工具生成）＋宣纸纤维（CC0，指令 §4.1-2） */
    defs += '<pattern id="tjSilkTex" patternUnits="userSpaceOnUse" width="251" height="251">' +
      '<image href="' + _rbase + 'fan-silk.webp" x="0" y="0" width="251" height="251" preserveAspectRatio="none"/></pattern>';
    defs += '<pattern id="tjPaperFiber" patternUnits="userSpaceOnUse" width="150" height="150">' +
      '<image href="' + _rbase + 'paper-fiber.webp" x="0" y="0" width="150" height="150" preserveAspectRatio="none"/></pattern>';
    /* 折痕明暗：沿纸面横向、相邻扇页方向相反（指令 §4.1-3），幅度克制 */
    var RM = (RP_IN + RP_OUT) / 2;
    var gA = pt(RM, -HALF), gB = pt(RM, HALF);
    /* 2026-10-05 折痕加深一档：小尺寸（手机/酒馆缩放）下也要读得出"折" */
    var pleatStops = '<stop offset="0" stop-color="rgba(56,42,26,.19)"/>' +
      '<stop offset=".5" stop-color="rgba(56,42,26,.04)"/>' +
      '<stop offset="1" stop-color="rgba(255,248,230,.12)"/>';
    defs += '<linearGradient id="tjPleatA" gradientUnits="userSpaceOnUse" x1="' + f(gA[0]) +
      '" y1="' + f(gA[1]) + '" x2="' + f(gB[0]) + '" y2="' + f(gB[1]) + '">' + pleatStops + '</linearGradient>';
    defs += '<linearGradient id="tjPleatB" gradientUnits="userSpaceOnUse" x1="' + f(gB[0]) +
      '" y1="' + f(gB[1]) + '" x2="' + f(gA[0]) + '" y2="' + f(gA[1]) + '">' + pleatStops + '</linearGradient>';
    /* 上缘暗角：纸边微翘，受光与纸心不同（指令 §4.1-5） */
    defs += '<radialGradient id="tjLeafEdge" cx="50%" cy="14%" r="88%">' +
      '<stop offset="0" stop-color="rgba(54,42,28,.05)"/>' +
      '<stop offset=".6" stop-color="rgba(54,42,28,.018)"/>' +
      '<stop offset="1" stop-color="rgba(54,42,28,.15)"/></radialGradient>';
    /* 内缘柔影：靠轴心一侧略沉，纸才有"一层"的厚度 */
    defs += '<radialGradient id="tjFanShade" cx="50%" cy="100%" r="88%">' +
      '<stop offset="0%" stop-color="rgba(54,42,28,.12)"/>' +
      '<stop offset="45%" stop-color="rgba(54,42,28,.028)"/>' +
      '<stop offset="100%" stop-color="rgba(54,42,28,0)"/></radialGradient>';
    /* 名下的淡墨晕染（指令 §13）：极淡，只为托住题字，绝不压过人名 */
    defs += '<radialGradient id="tjNameWash" cx="50%" cy="50%" r="50%">' +
      '<stop offset="0" stop-color="rgba(60,46,30,.07)"/>' +
      '<stop offset="62%" stop-color="rgba(60,46,30,.028)"/>' +
      '<stop offset="100%" stop-color="rgba(60,46,30,0)"/></radialGradient>';
    /* 扇骨木纹：**每根骨一个 pattern，纹理顺着骨的方向**（指令 §4.2／验收第 3 条） */
    RIB_ANGLES.forEach(function (deg, k) {
      defs += '<pattern id="tjRib' + k + '" patternUnits="userSpaceOnUse" width="44" height="160"' +
        ' patternTransform="rotate(' + f(deg) + ')">' +
        '<image href="' + _rbase + 'wood-rib-dark.jpg" x="0" y="0" width="44" height="160" preserveAspectRatio="none"/>' +
        '</pattern>';
    });
    /* 铆钉与投影（一次静态烘焙，不做动画滤镜） */
    defs += '<radialGradient id="tjPinFace" cx="34%" cy="30%" r="78%">' +
      '<stop offset="0" stop-color="#5c4b39"/><stop offset="55%" stop-color="#2e251c"/>' +
      '<stop offset="100%" stop-color="#171310"/></radialGradient>';
    defs += '<radialGradient id="tjFanShadow" cx="50%" cy="50%" r="50%">' +
      '<stop offset="0" stop-color="rgba(20,14,8,.30)"/><stop offset="100%" stop-color="rgba(20,14,8,0)"/></radialGradient>';

    /* ---- 扇骨：角度固定，一次画好（大骨更粗更长，小骨收在纸下） ---- */
    var ribs = '';
    RIB_ANGLES.forEach(function (deg, k) {
      var outer = (k === 0 || k === RIB_ANGLES.length - 1);
      var base = outer ? 2.2 : 1.0, tip = outer ? 3.3 : 2.5;
      var rTip = outer ? R_OUT + 2 : RP_OUT - 4;
      ribs += '<path class="fan-rib' + (outer ? ' fan-rib-outer' : '') +
        '" fill="url(#tjRib' + k + ')" d="' + ribPath(deg, base, tip, rTip, FAN.ribBase) + '"/>';
      if (outer) {
        /* 大骨髹漆：沿骨长一条窄高光（光源在左上，全扇一致） */
        ribs += '<path class="fan-rib-sheen" d="' +
          ribPath(deg - (deg < 0 ? -1.1 : 0), base * 0.34, tip * 0.30, rTip - 8, FAN.ribBase + 12) + '"/>';
      }
    });

    /* ---- 扇页 ---- */
    seats.forEach(function (seat, i) {
      var has = !!seat;                 /* seats 直接是名字（null＝空席） */
      var d = panelPath(i);
      var inner = '';
      /* 1 纸底 → 2 真绢织纹 → 3 宣纸纤维 → 4 折痕明暗 → 5 上缘暗角 → 6 内缘柔影 → 7 沿口裱边 */
      inner += '<path class="fan-face-silk" d="' + d + '"/>';
      inner += '<path class="fan-face-tex" d="' + d + '" fill="url(#tjSilkTex)"/>';
      inner += '<path class="fan-face-fiber" d="' + d + '" fill="url(#tjPaperFiber)"/>';
      inner += '<path class="fan-face-pleat" d="' + d + '" fill="url(#' + (i % 2 ? 'tjPleatB' : 'tjPleatA') + ')"/>';
      inner += '<path class="fan-face-edge" d="' + d + '" fill="url(#tjLeafEdge)"/>';
      inner += '<path class="fan-face-shade" d="' + d + '" fill="url(#tjFanShade)"/>';
      inner += '<path class="fan-face-rim" d="' + rimPath(i) + '"/>';
      /* 沿口内侧一线受光：纸边卷起时接到的那一点亮（光源左上，全扇一致） */
      inner += '<path class="fan-rim-light" d="' + arcAt(RP_OUT - 10.5, -HALF, HALF) + '"/>';
      /* 骨线折痕：每根骨位置一条深线（相邻页各画一半，合起来是一根骨的折） */
      inner += '<path class="fan-crease" d="' + arcAt(RP_IN, -HALF, HALF) + '"/>';
      /* 扇肩：纸内缘与骨相接的细线 */
      inner += '<path class="fan-shoulder" d="' + arcAt(RP_IN, -HALF, HALF) + '"/>';
      /* 点按的墨色反馈层（指令 §16：短暂墨色，不改点击逻辑） */
      inner += '<path class="fan-ink" d="' + d + '"/>';

      if (has) {
        /* 人名：**格式照旧**（毛笔体、一字一行竖排、姓氏朱印），只挪容器位置（指令 §1／§13） */
        var nm = String(seat);
        var sn = surnameOf(nm, zc[nm] && zc[nm].身份);
        /* 名字整列的排法（作者 2026-10-06 定）：
           三字名与四字名（薇薇迁喜）同扇时，若按"首字基线"排，四字名的姓氏朱印与
           朱点会被整列推下去，一直顶到扇骨根部（纸内缘 y≈246），看着像掉出纸面。
           改为**按末字基线 NAME_BOTTOM 对齐**：朱印与朱点三人同一高度，名字整列
           随字数自行往上长。同时整列较原四字位置微微上提，三字名（姜、栾）的首字
           因此比原先低一些——作者要的就是这个：短名字往下坐，长名字往上长。
           2026-10-06 三调：四字名**整列下挪**。字距不能收——.fan-name 字号 21px，
           行距收到 20 会叠字（曾有人这么改过，已回退）。所以保持 23，改为整列下移 13：
           四字首字 107 → 120，末字 189，朱印在 202，中间仍留 13px，压不到印。 */
        var NAME_BOTTOM = PY - (RP_IN + 0.80 * (RP_OUT - RP_IN)) + 2 * 23 + 16;  /* = 176 */
        var n = nm.length;
        var GAP = 23;                                                            /* 三字（也是基准）字距 */
        var y0;
        if (n >= 4) {
          /* 四字（薇薇迁喜）：整列下挪 13 —— 首字 120、末字 189，离朱印 13px */
          y0 = NAME_BOTTOM - (n - 1) * GAP + 13;
        } else if (n <= 2) {
          /* 二字（苏芄）：作者 2026-10-07 定——**两字之间要留空行**，
             整列上端在"栾"（130）下一点点、下端在"采"（176）上一点点。
             故字距放大到 26（比三字的 23 松一档），末字收在 166：
             首字 140 / 末字 166。 */
          GAP = 26;
          y0 = NAME_BOTTOM - 10 - (n - 1) * GAP;
        } else {
          /* 三字（姜俞姒、栾令采）：130 / 153 / 176 */
          y0 = NAME_BOTTOM - (n - 1) * GAP;
        }
        /* 名下淡墨：竖长一团，托住题字 */
        inner += '<ellipse class="fan-name-wash" cx="' + PX + '" cy="' + f(y0 + (nm.length * GAP + 20) / 2 - 8) +
          '" rx="30" ry="' + f(nm.length * GAP / 2 + 26) + '" fill="url(#tjNameWash)"/>';
        for (var ci = 0; ci < nm.length; ci++) {
          inner += '<text class="fan-name" x="' + PX + '" y="' + f(y0 + ci * GAP) + '">' +
            esc(nm.charAt(ci)) + '</text>';
        }
        var st = NAME_BOTTOM + 26;                                               /* 朱印：统一高度 */
        if (sn) {
          inner += '<g class="fan-seal">' +
            '<rect x="' + f(PX - 10) + '" y="' + f(st) + '" width="20" height="20" rx="2"/>' +
            '<text x="' + PX + '" y="' + f(st + 15) + '">' + esc(sn) + '</text></g>';
        }
        /* 在场：实心朱点；已录入但此刻不在场：一枚空心细圈（2026-10-05 加，
           免得"没点"看着像漏画了 —— 语义仍是「在场」，只是把缺席也写出来） */
        /* 朱点：入册即点（作者 2026-10-05：不要空心圈）。缺席态的空心圈已删。 */
        var dy = st + 32;                                                        /* 朱点：统一高度 */
        inner += '<circle class="fan-dot" cx="' + PX + '" cy="' + f(dy) + '" r="3.4"/>';
      }
      /* 空席：干净的空白纸面（指令 §12：像等待书写的宣纸，不做成禁用按钮） */

      blades += '<g class="fan-blade' + (has ? ' is-filled' : ' is-blank') + '" data-seat="' + i + '"' +
        ' style="--open-delay:' + (i * 45) + 'ms"' +
        (has ? ' data-person="' + esc(seat) + '"' : '') + '>' + inner + '</g>';
    });

    var svg =
      '<svg class="fan is-opening" viewBox="0 0 ' + VW + ' ' + VH + '" role="img" aria-label="折扇画廊">' +
        '<defs>' + defs + '</defs>' +
        /* 整扇在桌面上的投影：让它"浮"起来（静态烘焙） */
        '<ellipse class="fan-shadow" cx="' + f(PX) + '" cy="' + f(PY + 10) + '" rx="' + f(R_OUT * 0.82) +
          '" ry="24" fill="url(#tjFanShadow)"/>' +
        '<g class="fan-sway">' +
          '<g class="fan-ribs">' + ribs + '</g>' +
          blades +
          /* 铆钉：乌木钉 + 泥金箍 + 一点高光（识别折扇的关键，指令 §15-四） */
          '<g class="fan-pin-group">' +
            '<circle class="fan-pin" cx="' + f(PX) + '" cy="' + f(PY) + '" r="' + FAN.rPin +
              '" fill="url(#tjPinFace)"/>' +
            '<circle class="fan-pin-ring" cx="' + f(PX) + '" cy="' + f(PY) + '" r="' + (FAN.rPin - 1.4) + '"/>' +
            '<circle class="fan-pin-cap" cx="' + f(PX - 2.6) + '" cy="' + f(PY - 2.6) + '" r="3.1"/>' +
          '</g>' +
        '</g>' +
      '</svg>';
    return svg;
  }

  /* ---- 状态：半开为常态，悬停时该面微抬、邻面让位 ----
     （「选中」不再是扇面上的状态 —— 选中即翻页到她的整页，见 openPerson） */
  var hovered = -1;

  /* 入场：每页绕铆钉从中轴展开，依次延迟 45ms（指令 §6）。靠 CSS 动画做，
     只动 transform —— 动画的 from 是 0°，to 取元素当前（inline）的 rotate。 */
  function playOpen() {
    var host = document.getElementById('fanStage');
    if (!host) return;
    var svg = host.querySelector('.fan');
    if (!svg) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { svg.classList.remove('is-opening'); return; }
    svg.classList.add('is-opening');
    setTimeout(function () { svg.classList.remove('is-opening'); }, 900 + SEATS * 45 + 60);
  }

  function applyLayout() {
    var host = document.getElementById('fanStage');
    if (!host) return;
    host.querySelectorAll('.fan-blade').forEach(function (g, i) {
      var deg = BLADE_ANGLES[i] || 0;
      var ty = 0;
      if (i === hovered) {
        ty = -7; deg += 1.2;                        /* 悬停微抬（指令 §6） */
      } else if (hovered >= 0 && Math.abs(i - hovered) === 1) {
        ty = 2.4; deg += (i < hovered ? -1.4 : 1.4);/* 邻页微微让开 */
      }
      g.style.transform = 'rotate(' + deg + 'deg) translate(0,' + ty + 'px)';
    });
  }

  /* ---------------- 立绘三视图：点图换下一张（2026-10-04 作者要求） ----------------
     换法：把新图作为一层 <img class="cz-art-fade"> 盖在原图上淡入，淡完再换掉原图的
     src、撤掉那层 —— 全程没有空白帧，版心高度也不变（两张图同尺寸同裁切）。 */
  var faceIdx = {};                       /* 每个人记住自己看到第几张 */

  function setFaceDots(name, i, n) {
    var art = document.getElementById('czArt');
    if (!art) return;
    var host = art.parentElement;
    if (!host) return;
    var box = host.querySelector('.cz-faces');
    if (n < 2) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.className = 'cz-faces';
      box.setAttribute('aria-hidden', 'true');
      host.appendChild(box);
    }
    var html = '';
    for (var k = 0; k < n; k++) html += '<i' + (k === i ? ' class="is-on"' : '') + '></i>';
    box.innerHTML = html;
  }

  /* 把立绘淡入换成 src（换图与换人共用）：层先载图，载到才淡入，
     淡完再把底图换成新图、撤层 —— 全程不会露出一帧旧图 */
  function crossfadeArt(src) {
    var art = document.getElementById('czArt');
    if (!art || art.getAttribute('src') === src) return;
    var host = art.parentElement;
    if (!host) { art.setAttribute('src', src); return; }
    var layer = document.createElement('img');
    layer.className = 'cz-art-fade';
    layer.alt = '';
    layer.draggable = false;
    layer.src = src;
    host.appendChild(layer);
    var done = false;
    var settle = function () {
      if (done) return;
      done = true;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { layer.classList.add('is-in'); });
      });
      /* 360 > 320ms 的淡入时长：等淡入真正走完再撤层，
         否则最后一帧会"跳"一下（2026-10-07 修） */
      setTimeout(function () {
        art.setAttribute('src', src);
        if (layer.parentElement) layer.parentElement.removeChild(layer);
      }, 360);
    };
    layer.onload = settle;
    layer.onerror = settle;
    if (layer.complete) settle();
    setTimeout(settle, 2500);
  }

  function swapFace() {
    var art = document.getElementById('czArt');
    if (!art) return;
    var list = (art.dataset.faces || '').split('|').filter(Boolean);
    if (list.length < 2) return;
    var name = art.dataset.who || '';
    var i = faceIdx[name] || 0;
    var next = (i + 1) % list.length;
    var host = art.parentElement;
    var layer = document.createElement('img');
    layer.className = 'cz-art-fade';
    layer.alt = '';
    layer.draggable = false;
    layer.src = list[next];
    host.appendChild(layer);

    /* 收尾只走一次：先让浏览器认下这一帧，再加 is-in 触发过渡。
       不用 img.decode() —— 实测线上它的 promise 不落（叠层建了却收不了尾，图也不换）；
       改用 onload / onerror + 兜底计时器，三条路都会走到 settle。 */
    var done = false;
    var settle = function () {
      if (done) return;
      done = true;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { layer.classList.add('is-in'); });
      });
      setTimeout(function () {
        art.setAttribute('src', list[next]);
        faceIdx[name] = next;
        setFaceDots(name, next, list.length);
        if (layer.parentElement) layer.parentElement.removeChild(layer);
      }, 340);
    };
    layer.onload = settle;
    layer.onerror = settle;
    if (layer.complete) settle();
    setTimeout(settle, 2500);          /* 兜底：图片再慢也不会留下一层残影 */
  }

  /* 2026-10-04 修：**不要用 DOM 属性做"绑过没有"的标记**。
     浮窗是"文档快照"（srcdoc + 重跑脚本）——快照里带着 data-facebound="1"，
     新文档里的脚本一看到就跳过绑定，于是浮窗里点立绘没反应。改用本模块的闭包变量。 */
  var faceBound = false;
  function bindFaceSwap() {
    var art = document.getElementById('czArt');
    if (!art || faceBound) return;
    faceBound = true;
    var click = function (e) { e.preventDefault(); swapFace(); };
    art.addEventListener('click', click);
    art.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); swapFace(); }
    });
  }

  /* ---------------- 人物页（人·传）：一个人占一整页 ----------------
     不再用浮层窗口 —— 选中扇面 = 翻到她的那一页（左：传；右：立绘+变量）。
     人名存在 TJBook.person，翻页落定时由本文件渲染这一页。 */
  function personPage(name, r) {
    var ren = (r.人情 || {})[name] || {};
    var zc = (r.在场 || {})[name];
    var lc = (r.离场 || {})[name];
    var set = function (id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; };

    /* 天头眉批跟着人走（原来写死在 HTML 里，是姜那一句，换到栾的传页上就错位了） */
    var mp = document.querySelector('.page[data-tab="人·传"] .meipi');
    if (mp) {
      if (!mp.dataset.meipiDefault) mp.dataset.meipiDefault = mp.textContent;
      mp.textContent = (L.MEIPI && L.MEIPI[name]) || mp.dataset.meipiDefault;
    }

    set('czName', esc(name));
    set('czId', ren.身份 ? esc(ren.身份) : mo(6));
    set('czRemark', esc(L.REMARK[name] || ((L.BIOGRAPHY[name] || [])[0] || '').split('。')[0] + '。'));
    set('czFootName', esc(name));
    set('czNow', '此刻：' + (zc ? esc(zc.此刻 || '') :
      (lc ? '不在场 · ' + esc(lc.去向 || '') : mo(10))));

    set('czAxes', L.PERSON_AXES.map(function (a) {
      var t = L.tierOf(a.key, ren[a.key]);
      return '<div class="cz-axis"><span class="k">' + a.key + '</span>' +
        '<span class="v">' + esc(t.name) + '</span>' +
        '<span class="num">' + t.value + '</span></div>';
    }).join(''));

    var owe = String(ren.欠 || '');
    set('czOwe', (!owe || owe === '无') ? '' :
      '欠：' + esc(owe) + (ren.搁置 ? '　·　' + esc(ren.搁置) : ''));

    /* 传：一段一段的手抄体（文本在词条层，阶段 7 只改那儿） */
    var paras = L.BIOGRAPHY[name] || [];
    set('czBio', paras.length
      ? paras.map(function (p) { return '<p class="cz-bio-p">' + esc(p) + '</p>'; }).join('')
      : '<p class="cz-bio-p">' + mo(14) + '</p>');

    var art = document.getElementById('czArt');
    if (art) {
      /* 立绘三视图（作者 2026-10-04）：点立绘换下一张，循环。
         换图用"叠一层 → 淡入 → 撤层"的交叉淡化，不闪白也不改版心高度。 */
      var list = (L.PORTRAITS && L.PORTRAITS[name]) || [];
      if (!list.length) {
        var one = L.DOSSIER_PORTRAIT[name] || L.PORTRAIT[name];
        if (one) list = [one];
      }
      if (list.length) {
        art.style.display = '';
        art.dataset.who = name;
        art.dataset.faces = list.join('|');
        if (list.length > 1) {
          /* 可点、可 Tab 到、可回车 —— 与全册其它可点元素同一套可达性 */
          art.setAttribute('tabindex', '0');
          art.setAttribute('role', 'button');
          art.setAttribute('aria-label', name + '的立绘：点一下换下一张（共 ' + list.length + ' 张）');
        } else {
          art.removeAttribute('tabindex');
          art.removeAttribute('role');
          art.removeAttribute('aria-label');
        }
        var hold = faceIdx[name] || 0;
        if (hold >= list.length) hold = 0;
        /* 只在换人时重设 src；同一个人翻页回来保持上次那一张。
           2026-10-05：换人**不再直接改 src** —— 直接改会让旧图残着一帧
           （作者看到的"有一帧是上一个角色"）。改走同一套叠层淡入。 */
        if (art.dataset.who !== name) {
          crossfadeArt(list[hold]);
        } else if (art.getAttribute('src') !== list[hold]) {
          crossfadeArt(list[hold]);
        }
        setFaceDots(name, hold, list.length);
        /* 预载另外几张：线上单张要 0.6–1.6s，先垫进缓存，点的时候才是"立刻换" */
        if (list.length > 1) {
          list.forEach(function (s) { if (s !== list[hold]) { var im = new Image(); im.src = s; } });
        }
      } else {
        art.style.display = 'none';
        setFaceDots(name, 0, 0);
      }
    }
  }

  function bindPersonPage() {
    var back = document.getElementById('czBack');
    if (back) {
      back.addEventListener('click', function () { window.TJBook.showPage('人', true); });
    }
    var vb = document.getElementById('czVerbose');
    if (vb) {
      vb.addEventListener('click', function () {
        var p = document.getElementById('czPage');
        if (!p) return;
        p.classList.toggle('is-verbose');
        vb.classList.toggle('is-on', p.classList.contains('is-verbose'));
      });
    }
  }

  /* ---- 势力 / 人情（批注体，溢出折叠为夹页） ---- */
  var PREVIEW = 3;
  function rowHTML(k, v, tag) {
    return '<div class="row"><span class="k">' + esc(k) + '</span>' +
      '<span class="v' + (tag ? ' is-tag' : '') + '">' + v + '</span></div>';
  }
  function renderGroup(el, moreEl, rows, empty) {
    if (!el) return;
    el.innerHTML = rows.length
      ? rows.slice(0, PREVIEW).join('')
      : '<div class="row"><span class="v">' + esc(empty) + '</span></div>';
    if (!moreEl) return;
    var n = rows.length - PREVIEW;
    if (n > 0) {
      moreEl.hidden = false;
      moreEl.textContent = '另 ' + n + ' 条';
      moreEl.onclick = function () {
        var open = el.dataset.open === '1';
        el.dataset.open = open ? '0' : '1';
        el.innerHTML = open
          ? rows.slice(0, PREVIEW).join('')
          : rows.join('');
        moreEl.textContent = open ? '另 ' + n + ' 条' : '收起';
      };
    } else {
      moreEl.hidden = true;
      moreEl.onclick = null;
    }
  }

  /* ---- 主渲染 ---- */
  var lastState = null;
  var fanSig = '';                 /* 扇面内容的签名：变了才重建 SVG（见下） */
  function render(state) {
    if (!state) return;
    lastState = state;
    if (setPanels(panelCountFor())) fanSig = '';   /* 屏宽跨过断点 → 页数变 → 强制重建 */
    var r = state.棠郡 || {};

    /* 势力 */
    renderGroup(
      document.getElementById('renShili'),
      document.getElementById('renShiliMore'),
      entriesOf(r.势力).map(function (e) {
        return rowHTML(e.name, esc(L.tierOf('态度', e.val.态度).name), true);
      }),
      '未与哪一门打过交道'
    );

    /* 人情 */
    renderGroup(
      document.getElementById('renRenqing'),
      document.getElementById('renRenqingMore'),
      entriesOf(r.人情).map(function (e) {
        var q = L.tierOf('情分', e.val.情分).name;
        var m = L.tierOf('颜面', e.val.颜面).name;
        return rowHTML(e.name, esc(q + ' / ' + m), true);
      }),
      '还没有挂在心上的人'
    );

    /* 折扇 */
    var host = document.getElementById('fanStage');
    var seats = seatsOf(r);
    var hasArt = seats.filter(function (s) { return !!s; }).length;
    var note = document.getElementById('fanNote');
    if (note) {
      note.textContent = SEATS + ' 页，入册者' + hasArt +
        (hasArt ? '。点扇页，翻到她的那一页。' : '。空页留白，等人入册。');
    }
    if (!host) return;

    /* SVG 不每回重建（重建会让 pattern 里的立绘重新解码、闪一下），
       但席位或在场变了必须重建 —— 否则新立绘不上扇、朱点不更新。
       签名 = 席位名单 + 在场名单。 */
    var sig = SEATS + ':' + seats.map(function (s) { return s || ''; }).join('|') +
      '#' + Object.keys(r.在场 || {}).join(',');
    if (!host.querySelector('.fan') || sig !== fanSig) {
      fanSig = sig;
      hovered = -1;
      var old = host.querySelector('.fan');
      if (old) old.remove();
      host.insertAdjacentHTML('afterbegin', fanMarkup(seats, r.在场 || {}));
      bindFan();
      applyLayout();
      playOpen();
    } else {
      applyLayout();
    }
  }

  function bindFan() {
    var host = document.getElementById('fanStage');
    host.querySelectorAll('.fan-blade').forEach(function (g, i) {
      var person = g.getAttribute('data-person');
      g.addEventListener('mouseenter', function () { hovered = i; applyLayout(); });
      g.addEventListener('mouseleave', function () { hovered = -1; applyLayout(); });
      g.addEventListener('click', function () {
        /* 指令 §16：先给一下墨色反馈，再进详情；事件不吞、不延迟其它交互 */
        if (person) {
          g.classList.add('is-inking');
          setTimeout(function () { g.classList.remove('is-inking'); }, 320);
          setTimeout(function () { openPerson(person); }, 110);
        }
      });
      g.setAttribute('tabindex', '0');
      g.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        openPerson(person);
      });
    });
  }

  /* 选中扇面 = 翻到她的整页（人·传）。没有立绘的空席不响应。 */
  function openPerson(name) {
    if (!name) return;
    window.TJBook.person = name;
    window.TJBook.showPage('人·传', true);
  }

  /* ---- 注册：人页（群像）与人·传（一个人一整页） ---- */
  window.TJRender = window.TJRender || {};
  window.TJRender['人'] = render;
  window.TJRender['人·传'] = function (state) {
    if (!state) return;
    lastState = state;
    var name = (window.TJBook && window.TJBook.person) || '';
    if (!name) { window.TJBook.showPage('人', false); return; }
    personPage(name, state.棠郡 || {});
  };

  bindPersonPage();
  bindFaceSwap();

  /* 窗口尺寸变了（桌面↔手机、酒馆里改面板宽）：页数跨断点时重画扇子 */
  var rzTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(function () {
      if (setPanels(panelCountFor())) fanSig = '';
      if (window.TJBook && window.TJBook.renderCurrent) window.TJBook.renderCurrent();
    }, 220);
  });
})();
