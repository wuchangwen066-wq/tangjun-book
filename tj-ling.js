/* ==================================================================
   棠郡 · 页「令」渲染器（岁轮 + 节令札）
   ------------------------------------------------------------------
   取值一律走 TJState.getState()；
   节令/节气**文案**一律走 SuilunCal + SUILUN_DATA（《岁轮文案与数据方案 v3》，
   只读常量，本文件不得内嵌文案）；
   节令札的「做/由/惹/牵」仍走 TJLex.FESTIVALS（世界书提炼）。

   岁轮几何按 v2 §A.3：viewBox 680×680，圆心 340,340，多层同心环；
   方位为古式——夏至正上、冬至正下、春分正左、秋分正右。
   **所有位置（朱针 / 节气扇 / 节令刻点）都调 SuilunCal.locate/angleOf**，
   保证三者永远对得上，不会出现「针在清明、刻点跑到邻段」。
================================================================== */
(function () {
  'use strict';

  var L = window.TJLex;
  var C = window.SuilunCal;

  /* ---- 几何（v2 §A.3，半径自外向内） ---- */
  var CX = 340, CY = 340;
  var R_FRAME_IN = 337.5;                 /* 版框细线，描 1px */
  var R_FRAME_OUT = 332;                  /* 版框粗线，描 3px */
  var R_LEAP = 325;                       /* 闰月弧，朱色，描 5px */
  var R_TICK0 = 306, R_TICK1 = 318;       /* 刻度带 */
  var R_TERM0 = 262, R_TERM1 = 302;       /* 节气环 */
  var R_TERM_TEXT = 282;                  /* 节气名 */
  var R_SEASON0 = 238, R_SEASON1 = 258;   /* 四季带 */
  var R_MONTH0 = 194, R_MONTH1 = 234;     /* 月环 */
  var R_MONTH_TEXT = 218;                 /* 月名 */
  var R_FEST_DOT = 201;                   /* 世界节令刻点 */
  var R_INNER = 186;                      /* 中央空地 */
  var TERM_GAP = 1.4;                     /* 扇间留缝（度） */
  var TERM_LIFT = 6;                      /* 悬停微抬：沿半径向外 6 单位（≈3px） */

  /* 环上色（v2 §A.4：比令牌深，确保 4.5:1） */
  var SEASON_COLOR = ['#3d6670', '#46664f', '#7d4f33', '#3b352c'];
  var SEASON_NAME = ['春', '夏', '秋', '冬'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function mo(w) {
    return '<span class="mo-man"' + (w ? ' style="min-width:' + w + 'em"' : '') + '>&nbsp;</span>';
  }
  function f(n) { return Math.round(n * 100) / 100; }

  /** 极坐标（deg 为标准数学角：0°指右、顺时针为正；-90° = 正上） */
  function polar(r, deg) {
    var a = deg * Math.PI / 180;
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  }
  function pt(p) { return f(p[0]) + ' ' + f(p[1]); }

  function arcPath(r, a0, a1) {
    var p0 = polar(r, a0), p1 = polar(r, a1);
    var large = (a1 - a0) > 180 ? 1 : 0;
    return 'M' + pt(p0) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + pt(p1);
  }
  /** 环扇（annulus sector） */
  function sector(r0, r1, a0, a1) {
    var p0 = polar(r1, a0), p1 = polar(r1, a1);
    var p2 = polar(r0, a1), p3 = polar(r0, a0);
    var large = (a1 - a0) > 180 ? 1 : 0;
    return 'M' + pt(p0) + ' A' + r1 + ' ' + r1 + ' 0 ' + large + ' 1 ' + pt(p1) +
      ' L' + pt(p2) + ' A' + r0 + ' ' + r0 + ' 0 ' + large + ' 0 ' + pt(p3) + ' Z';
  }

  /* v2 §A.2 的方位公式 */
  function centerOf(i) { return -90 + (i - 9) * 15; }        /* i=9 夏至 → -90 正上 */
  function monthStart(m) { return -232.5 + 30 * m; }          /* m 0-based：0=正月 */
  function seasonStart(s) { return -232.5 + 90 * s; }
  /** 文字角度：下半圆与上半圆取不同旋转，保证尽量正向可读 */
  function textAngle(deg) {
    var y = Math.sin(deg * Math.PI / 180);
    return y > 0.01 ? deg - 90 : deg + 90;
  }
  function textAt(str, r, deg, size, fill, family, weight) {
    var p = polar(r, deg);
    var ta = textAngle(deg);
    return '<text x="' + f(p[0]) + '" y="' + f(p[1]) + '" text-anchor="middle" ' +
      'dominant-baseline="central" transform="rotate(' + f(ta) + ' ' + f(p[0]) + ' ' + f(p[1]) + ')" ' +
      'font-size="' + size + '" font-family="' + (family || 'Ma Shan Zheng, KaiTi, serif') + '"' +
      (weight ? ' font-weight="' + weight + '"' : '') + ' fill="' + fill + '">' + esc(str) + '</text>';
  }

  /* ---- 农历月日解析（「丁未年·十月初二」→ {ganzhi, leap, month, day}） ---- */
  var CN_DIGIT = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  function cnMonth(s) {
    if (s === '冬') return 11;
    if (s === '腊') return 12;
    if (s === '正') return 1;
    if (s.length === 2 && s[0] === '十') return 10 + (CN_DIGIT[s[1]] || 0);
    return CN_DIGIT[s] || 0;
  }
  function cnDay(s) {
    if (!s) return 15;
    if (s[0] === '初') return CN_DIGIT[s[1]] || 1;
    if (s[0] === '廿') return 20 + (CN_DIGIT[s[1]] || 0);
    if (s[0] === '卅') return 30;
    if (s[0] === '十') return 10 + (CN_DIGIT[s[1]] || 0);
    return CN_DIGIT[s] || 15;
  }
  function parseDate(str) {
    var raw = String(str || '');
    var m = /(闰)?([正一二两三四五六七八九十冬腊]{1,2})月([初十廿卅一二两三四五六七八九]{0,2})/.exec(raw);
    if (!m) return null;
    var month = cnMonth(m[2]);
    if (!month) return null;
    var gz = /^([^\s·年]{0,4})年/.exec(raw);
    return { ganzhi: gz ? gz[1] : '', leap: !!m[1], month: month, day: cnDay(m[3]) };
  }

  /* ---- 年月日解析不出时的退路：用世界书的「节令」变量定位 ----
     真实环境里 时地.年月日 是**照抄场景锚点的自由短语**（世界书 #76/#87：
     「以每轮的场景锚点与记忆为准，本套变量照抄，不另立一套」，
     示例值就是「听棠前十日」）—— 里面没有「X月Y日」，parseDate 必然落空，
     岁轮就会整盘留白。而世界书 #86 的 节令 组恰好给了：
       名 / 状态（未至·正过·已过）/ 起 / 止 / 下一节 / 距下一节。
     于是：先用「下一节 − 距下一节」反推当下（最准），
     退一步用「名」对应的节令日期。历法与岁轮同一套 30 日/月模型。
     都推不出才留白 —— 不猜。 */
  var CN2 = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  /** 「三十四日」「5日」「五日」→ 34 / 5 / 5；取不到返回 null */
  function parseCount(s) {
    s = String(s || '');
    var d = /(\d+)/.exec(s);
    if (d) return parseInt(d[1], 10);
    var m = /([一二两三四五六七八九十]{1,3})/.exec(s);
    if (!m) return null;
    var t = m[1], n = 0;
    if (t[0] === '十') n = 10 + (CN2[t[1]] || 0);
    else if (t.length === 3 && t[1] === '十') n = (CN2[t[0]] || 0) * 10 + (CN2[t[2]] || 0);
    else if (t.length === 2 && t[1] === '十') n = (CN2[t[0]] || 0) * 10;
    else n = CN2[t[0]] || 0;
    return n || null;
  }
  function festivalByName(n) {
    n = String(n || '').trim();
    if (!n) return null;
    var fs = C.data.festivals || [];
    for (var i = 0; i < fs.length; i++) { if (fs[i].name === n) return fs[i]; }
    /* 世界书正名带前缀（岁首开印 / 上元灯河 / 清明培土…）→ 退为包含匹配 */
    for (var j = 0; j < fs.length; j++) { if (n.indexOf(fs[j].name) >= 0) return fs[j]; }
    return null;
  }
  function fromJieling(jl) {
    if (!jl) return null;
    var nx = festivalByName(jl.下一节), n = parseCount(jl.距下一节);
    if (nx && nx.month != null && n != null && n > 0 && n < 60) {
      var t = ((nx.month - 1) * 30 + (nx.day - 1) - n) % 360;
      t = (t + 360) % 360;
      return { ganzhi: '', leap: false, month: Math.floor(t / 30) + 1, day: (t % 30) + 1,
               derived: '节令·下一节倒推' };
    }
    var now = festivalByName(jl.名);
    if (now && now.month != null) {
      return { ganzhi: '', leap: false, month: now.month, day: now.day, derived: '节令·当值' };
    }
    return null;
  }

  /* ---- 岁轮 ---- */
  function drawWheel(d, loc) {
    var svg = document.querySelector('.year-wheel');
    if (!svg) return;
    var s = '';
    var curIdx = loc ? loc.idx : -1;

    /* 1. 版框：外粗内细双边 */
    s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + R_FRAME_OUT +
      '" fill="none" stroke="rgba(31,27,22,.58)" stroke-width="3"/>';
    s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + R_FRAME_IN +
      '" fill="none" stroke="rgba(31,27,22,.40)" stroke-width="1"/>';

    /* 2. 闰月弧：朱色，画在该月位置 */
    if (d && d.leap) {
      var a0 = monthStart(d.month - 1) + 1, a1 = monthStart(d.month - 1) + 29;
      s += '<path d="' + arcPath(R_LEAP, a0, a1) + '" fill="none" stroke="var(--zhu)" ' +
        'stroke-width="5" opacity=".8"/>';
      var lp = polar(R_LEAP, (a0 + a1) / 2);
      var lpa = textAngle((a0 + a1) / 2);
      s += '<text x="' + f(lp[0]) + '" y="' + f(lp[1]) + '" text-anchor="middle" ' +
        'dominant-baseline="central" transform="rotate(' + f(lpa) + ' ' + f(lp[0]) + ' ' + f(lp[1]) + ')" ' +
        'font-size="13" font-family="Noto Serif SC, serif" fill="var(--paper-hi)">闰</text>';
    }

    /* 3. 刻度：节气边界长刻，其间每 3° 短刻 —— 一刻三日 */
    for (var i = 0; i < 24; i++) {
      var a = centerOf(i) + 7.5;                    /* 边界 */
      var p0 = polar(R_TICK0, a), p1 = polar(R_TICK1, a);
      s += '<line x1="' + f(p0[0]) + '" y1="' + f(p0[1]) + '" x2="' + f(p1[0]) + '" y2="' + f(p1[1]) +
        '" stroke="rgba(31,27,22,.5)" stroke-width="1.4"/>';
      for (var k = 1; k < 5; k++) {
        var aa = centerOf(i) - 7.5 + k * 3;
        var q0 = polar(R_TICK0 + 4, aa), q1 = polar(R_TICK1, aa);
        s += '<line x1="' + f(q0[0]) + '" y1="' + f(q0[1]) + '" x2="' + f(q1[0]) + '" y2="' + f(q1[1]) +
          '" stroke="rgba(31,27,22,.22)" stroke-width="0.8"/>';
      }
    }

    /* 4. 节气环：24 扇，四季四色；已过淡墨、当下季色+朱描、将至季色实填 */
    for (var t = 0; t < 24; t++) {
      var season = Math.floor(t / 6);
      var st = C.termState(t, curIdx);
      var ca = centerOf(t);
      var a0t = ca - 7.5 + TERM_GAP / 2, a1t = ca + 7.5 - TERM_GAP / 2;
      var term = C.data.terms[t] || { name: '' };
      var fillCol, textCol = 'var(--paper-hi)', opa = 1;
      if (st === '已过') {
        fillCol = 'rgba(31,27,22,.16)'; textCol = 'rgba(31,27,22,.65)';
      } else {
        fillCol = SEASON_COLOR[season];
        textCol = '#f2ece0';                         /* 季色上用纸色保对比 */
      }
      /* 悬停"微抬"向量：沿半径向外，位移交给 --tx/--ty 由 CSS 吃。
         仿人页扇子的抬面，幅度取扇子的四成（扇 −8px / 此 ~3px）。 */
      var rm = (R_TERM0 + R_TERM1) / 2;
      var q0 = polar(rm, ca), q1 = polar(rm + TERM_LIFT, ca);
      var tx = +(q1[0] - q0[0]).toFixed(2), ty = +(q1[1] - q0[1]).toFixed(2);

      /* 扇面、朱描、节气名同组 —— 悬停时整体抬起，字不脱扇 */
      s += '<g class="term-slot" style="--tx:' + tx + 'px;--ty:' + ty + 'px">';
      s += '<path class="term-sector" data-term="' + t + '" tabindex="0" role="button" ' +
        'aria-label="' + esc(term.name + '，' + (term.yueling || '') + '，' + st) + '" ' +
        'd="' + sector(R_TERM0, R_TERM1, a0t, a1t) + '" fill="' + fillCol + '" opacity="' + opa + '"/>';
      if (st === '当下') {
        s += '<path class="term-ring" d="' + sector(R_TERM0, R_TERM1, a0t, a1t) + '" fill="none" ' +
          'stroke="var(--zhu)" stroke-width="2"/>';
      }
      s += textAt(term.name, R_TERM_TEXT, ca, 20, textCol);
      s += '</g>';
    }

    /* 5. 四季带：淡纸色底 + 季字 */
    for (var q = 0; q < 4; q++) {
      var sq0 = seasonStart(q), sq1 = sq0 + 90;
      s += '<path d="' + sector(R_SEASON0, R_SEASON1, sq0 + 0.5, sq1 - 0.5) + '" ' +
        'fill="rgba(217,207,184,.34)"/>';
      s += textAt(SEASON_NAME[q], (R_SEASON0 + R_SEASON1) / 2, sq0 + 45, 22,
        SEASON_COLOR[q], 'Ma Shan Zheng, KaiTi, serif');
    }

    /* 6. 月环：12 扇 + 月名 + 世界节令刻点；无节月写「无节」 */
    for (var mth = 0; mth < 12; mth++) {
      var ma0 = monthStart(mth), ma1 = ma0 + 30;
      var mName = (C.data.monthNames || [])[mth] || (mth + 1) + '月';
      var isCur = d && (d.month === mth + 1) && !d.leap;
      var quiet = C.quietOf(mth + 1);
      var mFill = isCur ? 'rgba(168,50,42,.10)' : 'rgba(0,0,0,0)';
      s += '<path class="month-sector" data-month="' + (mth + 1) + '" ' +
        'd="' + sector(R_MONTH0, R_MONTH1, ma0 + 0.4, ma1 - 0.4) + '" fill="' + mFill + '" ' +
        'stroke="rgba(31,27,22,.16)" stroke-width="1"/>';
      s += textAt(mName, R_MONTH_TEXT, ma0 + 15, 22,
        isCur ? 'var(--zhu-text)' : 'rgba(31,27,22,.72)');
      if (quiet) {
        /* 无节月：扇上小字「无节」 */
        s += textAt(quiet.label, R_MONTH_TEXT - 12, ma0 + 15, 13, 'rgba(31,27,22,.42)',
          'Noto Serif SC, serif');
      }
    }
    /* 节令刻点（年年者；闰月不重复放、无节月不放） */
    (C.data.festivals || []).forEach(function (fv) {
      if (!fv.every || fv.month == null) return;
      if (C.quietOf(fv.month)) return;
      if (d && d.leap) return;                      /* 闰月不重复放刻点 */
      var ang = C.angleOf(fv.month, fv.day);
      var p = polar(R_FEST_DOT, ang);
      var isNow = d && !d.leap && fv.month === d.month && fv.day === d.day;
      /* 悬停微抬向量（与节气扇同款） */
      var fs0 = polar(R_FEST_DOT, ang), fs1 = polar(R_FEST_DOT + TERM_LIFT * 0.7, ang);
      var fx = +(fs1[0] - fs0[0]).toFixed(2), fy = +(fs1[1] - fs0[1]).toFixed(2);
      /* 命中区（r=10，透明）与视觉圆分开 —— 刻点显示仅 ~2.4px，
         若直接拿它当命中区，鼠标几乎点不中（实测 hover 超时）。 */
      s += '<g class="fest-slot" style="--tx:' + fx + 'px;--ty:' + fy + 'px">' +
        '<circle class="fest-dot" data-fest="' + esc(fv.id) + '" tabindex="0" role="button" ' +
        'aria-label="' + esc(fv.name + '，' + (fv.at || '') + '，年年') + '" ' +
        'cx="' + f(p[0]) + '" cy="' + f(p[1]) + '" r="10" fill="transparent"/>' +
        '<circle class="fest-mark" cx="' + f(p[0]) + '" cy="' + f(p[1]) + '" ' +
        'r="' + (isNow ? 5 : 3.4) + '" fill="' + (isNow ? 'var(--zhu)' : 'rgba(31,27,22,.62)') + '"/>' +
        '</g>';
    });

    /* 7. 中央：内圈双线 + 三行（干支 / 月日 / 节气·节令） */
    s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + R_INNER +
      '" fill="none" stroke="rgba(31,27,22,.46)" stroke-width="3"/>';
    s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + (R_INNER - 5) +
      '" fill="none" stroke="rgba(31,27,22,.28)" stroke-width="1"/>';
    var lines = loc ? loc.center : null;
    if (lines) {
      s += '<text x="' + CX + '" y="' + (CY - 62) + '" text-anchor="middle" font-size="52" ' +
        'font-family="Ma Shan Zheng, KaiTi, serif" fill="var(--ink)">' + esc(lines[0]) + '</text>';
      s += '<text x="' + CX + '" y="' + (CY - 12) + '" text-anchor="middle" font-size="26" ' +
        'font-family="Ma Shan Zheng, KaiTi, serif" fill="var(--ink-2)">' + esc(lines[1]) + '</text>';
      s += '<text x="' + CX + '" y="' + (CY + 26) + '" text-anchor="middle" font-size="18" ' +
        'font-family="LXGW WenKai Screen, KaiTi, serif" fill="var(--zhu-text)">' +
        esc(lines[2]) + '</text>';
    } else {
      s += '<text x="' + CX + '" y="' + (CY - 10) + '" text-anchor="middle" font-size="20" ' +
        'font-family="LXGW WenKai Screen, KaiTi, serif" fill="var(--ink-3)">月日未记</text>';
    }

    /* 8. 朱针：r176 → r305，粗端 4 → 尖端 0.8，尖端一粒朱点，针根一枚铜钉。
       针身可点 = v2 §A.11 的「回到当下」。**但命中区必须避开交互半径**：
       节气扇在 262–302、节令刻点的命中圆在 191–211 —— 一条 26px 宽的通长命中线
       会横跨整条半径，把下面的扇与刻点全挡住（鼠标点不中，等于废掉它们）。
       所以只做两段：针根 176–189、月环外到季带 213–259；圆头会外溢 13px，故用平头。 */
    var HIT_SEGS = [[176, 189], [213, 259]];
    if (loc && loc.angle != null) {
      var na = loc.angle;
      var base = polar(176, na), tipP = polar(305, na);
      /* 锥身：沿径向两端，按法向各偏半个线宽 */
      var ux = (tipP[0] - base[0]), uy = (tipP[1] - base[1]);
      var ul = Math.sqrt(ux * ux + uy * uy) || 1;
      var nx = -uy / ul, ny = ux / ul;
      var wb = 2.0, wt = 0.4;                      /* 半宽：粗端 4px、尖端 0.8px */
      s += '<g class="needle-hit" tabindex="0" role="button" aria-label="回到当下：复位节令札">';
      HIT_SEGS.forEach(function (seg) {
        var h0 = polar(seg[0], na), h1 = polar(seg[1], na);
        s += '<line x1="' + f(h0[0]) + '" y1="' + f(h0[1]) + '" x2="' + f(h1[0]) +
          '" y2="' + f(h1[1]) + '" stroke="transparent" stroke-width="26" stroke-linecap="butt"/>';
      });
      s += '<path d="M' + f(base[0] + nx * wb) + ' ' + f(base[1] + ny * wb) +
        ' L' + f(tipP[0] + nx * wt) + ' ' + f(tipP[1] + ny * wt) +
        ' L' + f(tipP[0] - nx * wt) + ' ' + f(tipP[1] - ny * wt) +
        ' L' + f(base[0] - nx * wb) + ' ' + f(base[1] - ny * wb) + ' Z" ' +
        'fill="var(--zhu)" opacity=".92"/>';
      s += '<circle cx="' + f(tipP[0]) + '" cy="' + f(tipP[1]) + '" r="2.6" fill="var(--zhu)"/>';
      s += '<circle cx="' + f(base[0]) + '" cy="' + f(base[1]) + '" r="4.2" fill="var(--nijin)"/>';
      s += '</g>';
    }

    svg.innerHTML = s;
  }

  /* ==================================================================
     轮下竖排笺（v2 §A.7 / 作者 2026-10-04 改为点击 + 移到轮下）
     ------------------------------------------------------------------
     点节气扇或节令刻点：
       1) 从圆心到该扇内缘拉一条极细淡墨虚线（引线），末端一粒小朱点；
       2) 轮盘等比缩一档（.ling-body.has-slip），下方浮出竖排笺；
       3) 右页节令札切到该条（v2 §A.11）。
     再点同处 / Esc / 点朱针 / 点「回到当下」印 → 全部回正。
     引线**淡入淡出**，不瞬显瞬消（瞬消是"退出违和"的主因）。
     节奏令牌在 .ling-body（--dur-slip / --dur-fade），笺与轮盘共用。
  ================================================================== */
  var slipTimer = null;
  var leadNode = null;
  var leadTimer = null;
  var curIdxNow = -1;

  function els() {
    return {
      box: document.getElementById('suilunSlip'),
      name: document.getElementById('suilunSlipName'),
      sub: document.getElementById('suilunSlipSub'),
      text: document.getElementById('suilunSlipText'),
      state: document.getElementById('suilunSlipState'),
    };
  }

  /** 立即摘掉引线（重画 / 重建时用，不需要过渡） */
  function clearLead() {
    clearTimeout(leadTimer);
    if (leadNode && leadNode.parentNode) leadNode.parentNode.removeChild(leadNode);
    leadNode = null;
  }

  /** 引线淡出后再移除（收笺时用）。
      引线原本是瞬消的：笺还在慢慢淡出，线却啪一下没了 —— 最违和的一处。 */
  function fadeLead() {
    if (!leadNode) return;
    var n = leadNode;
    leadNode = null;                       /* 先摘引用，避免与后续 draw 打架 */
    clearTimeout(leadTimer);
    n.classList.remove('is-on');
    leadTimer = setTimeout(function () {
      if (n.parentNode) n.parentNode.removeChild(n);
    }, 580);
  }

  /** 引线：圆心 → 该扇内缘的极细淡墨虚线 + 末端小朱点 */
  function drawLead(deg, rEnd) {
    var svg = document.querySelector('.year-wheel');
    if (!svg) return;
    clearLead();
    var p0 = polar(30, deg), p1 = polar(rEnd, deg);
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'slip-lead');
    g.innerHTML =
      '<line x1="' + f(p0[0]) + '" y1="' + f(p0[1]) + '" x2="' + f(p1[0]) + '" y2="' + f(p1[1]) +
        '" stroke="rgba(31,27,22,.42)" stroke-width="0.9" stroke-dasharray="1.5 5"/>' +
      '<circle cx="' + f(p1[0]) + '" cy="' + f(p1[1]) + '" r="2.6" fill="var(--zhu)"/>';
    svg.appendChild(g);
    leadNode = g;
    /* 下一帧再挂 is-on —— 否则首帧的 opacity:0 还没生效就直接跳到 1，淡入会丢 */
    requestAnimationFrame(function () { g.classList.add('is-on'); });
  }

  /** 浮出笺：kind = 'term' | 'fest' */
  function showSlip(kind, key) {
    var e = els();
    if (!e.box) return;
    /* 必须取消 unpick() 排下的那次"收起" —— hideSlip 走 setTimeout 是异步的，
       否则它会在本帧末执行，把刚浮出来的笺立刻收掉（点击后什么都不显示）。 */
    clearTimeout(slipTimer);
    var name = '', sub = '', text = '', state = '', plain = false, leadDeg = null,
        leadR = R_MONTH1, extra = '';

    if (kind === 'term') {
      var t = (C.data.terms || [])[key];
      if (!t) return;
      name = t.name;
      sub = t.yueling || '';
      text = t.text || '';
      state = C.termState(key, curIdxNow);          /* 已过 / 当下 / 将至 */
      /* 同一节气段内若有节令 → 笺底**独立一列朱色小字**（v3 §四；派生，不写进数据） */
      var inTerm = C.festivalsInTerm(key);
      extra = inTerm.length ? ('棠郡 · ' + inTerm.map(function (x) { return x.name; }).join(' · ')) : '';
      leadDeg = centerOf(key);
      leadR = R_TERM0;
    } else {
      var fv = (C.data.festivals || []).filter(function (x) { return x.id === key; })[0];
      if (!fv) return;
      name = fv.name;
      sub = fv.at + ' · ' +
        (fv.month != null ? C.monthCn(fv.month, fv.day, false) : (fv.period || '')) +
        ' · ' + (fv.every ? '年年' : '非年年');
      text = fv.text || '';
      state = fv.every ? '年年' : '非年年';
      plain = !fv.every;
      leadDeg = C.angleOf(fv.month, fv.day);
      leadR = R_FEST_DOT;
    }

    e.name.textContent = name;
    e.sub.textContent = sub;
    e.text.textContent = text;
    var ex = document.getElementById('suilunSlipExtra');
    if (ex) {
      ex.textContent = extra;
      ex.style.display = extra ? '' : 'none';
    }
    e.state.textContent = state;
    /* 类名须与 index.html / tj-pages.css 一致（note-*）。曾残留改版前的
       slip-col／slip-state，导致状态印丢掉 .note-col 的列样式（不自成竖列）。 */
    e.state.className = 'note-col note-state' + (plain ? ' is-plain' : '');
    /* 2026-10-05 丝滑的关键：展开高度按**实际内容**量给。
       以前 CSS 写死 240px，内容只有 ~196px —— 前半段就展开完、后半段干等，
       轮盘却还在缩，看着就"断"。
       量法注意：**不能用 scrollHeight** —— 笺内是 vertical-rl，滚动溢出方向
       已经换轴，量出来只有十几像素（实测）。正确做法：临时放开 max-height，
       让它排一次版，量 getBoundingClientRect().height，再收回目标值。 */
    /* 目标高**不量，读设计值**：竖排笺的文字高度是"给多少占多少"（vertical-rl 的
       列长随容器变），量出来的永远是当时那个容器高（实测 147/196 不定）。
       真正的设计帽在 .note-body 的 max-height（196px，作者定的文字框），
       加上纸边出画与红绳 26px —— 展开到恰好这个数，几何与轮盘同拍走完。 */
    var nb = e.box.querySelector('.note-body');
    var cap = 196;
    if (nb) {
      var c = parseFloat(getComputedStyle(nb).maxHeight);
      if (isFinite(c) && c > 0) cap = c;
    }
    e.box.style.maxHeight = Math.ceil(cap + 26) + 'px';
    e.box.classList.add('is-on');
    e.box.setAttribute('aria-hidden', 'false');
    /* 轮盘让位：出笺时缩一档（等比）。收笺时由 hideSlip 撤掉，轮盘自动回正。 */
    var bd = e.box.closest('.ling-body');
    if (bd) bd.classList.add('has-slip');
    if (leadDeg != null) drawLead(leadDeg, leadR);
  }

  function hideSlip(delay) {
    var e = els();
    clearTimeout(slipTimer);
    slipTimer = setTimeout(function () {
      if (!e.box) return;
      /* 收起：先钉在当前真实高，再归零 —— 过渡从当前高起跳，不吃掉前半段 */
      e.box.style.maxHeight = Math.ceil(e.box.getBoundingClientRect().height) + 'px';
      void e.box.offsetHeight;
      e.box.classList.remove('is-on');
      e.box.style.maxHeight = '0px';
      e.box.setAttribute('aria-hidden', 'true');
      /* 与笺同时撤掉：轮盘长回常态尺寸（transition 让它顺过去） */
      var bd = e.box.closest('.ling-body');
      if (bd) bd.classList.remove('has-slip');
      fadeLead();                        /* 引线淡出，不瞬消（见 fadeLead 注释） */
    }, delay || 0);
  }

  /* ---- 选中（作者要求：**点击**出笺，不是悬停） ---- */
  var pickedKey = null, pickedEl = null;
  var lastD = null, lastLoc = null;      /* 供右页节令札复位（v2 §A.11） */

  function unpick() {
    if (pickedEl) pickedEl.classList.remove('is-picked');
    pickedKey = null;
    pickedEl = null;
    hideSlip(0);
    renderSlipDefault();                 /* 右页札随之复位 */
  }

  function pick(kind, key, el) {
    var id = kind + ':' + key;
    if (pickedKey === id) { unpick(); return; }   /* 再点一次 → 收起 */
    unpick();
    pickedKey = id;
    pickedEl = el || null;
    if (el) el.classList.add('is-picked');
    showSlip(kind, key);
    renderSlipLinked(kind, key);         /* v2 §A.11：右页切到该条 */
  }

  /** 绑定交互（作者定：**点击**出笺；悬停只做轻微反馈，见 CSS）
      键盘等价：Tab 聚焦后 Enter/Space 出笺，方向键在相邻节气间移动，Esc 收笺。 */
  function bindSlip() {
    var svg = document.querySelector('.year-wheel');
    if (!svg) return;

    [].forEach.call(svg.querySelectorAll('.term-sector'), function (el) {
      var i = +el.getAttribute('data-term');
      el.addEventListener('click', function () { pick('term', i, el); });
      el.addEventListener('keydown', function (ev) {
        var d = 0;
        if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') d = -1;
        else if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') d = 1;
        else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick('term', i, el); return; }
        else if (ev.key === 'Escape') { unpick(); return; }
        else return;
        ev.preventDefault();
        var nx = (i + d + 24) % 24;
        var t = svg.querySelector('.term-sector[data-term="' + nx + '"]');
        if (t) t.focus();
      });
    });

    [].forEach.call(svg.querySelectorAll('.fest-dot'), function (el) {
      var id = el.getAttribute('data-fest');
      el.addEventListener('click', function () { pick('fest', id, el); });
      el.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick('fest', id, el); }
        else if (ev.key === 'Escape') { unpick(); }
      });
    });

    /* 朱针 = 「回到当下」：复位右页节令札（v2 §A.11） */
    var nh = svg.querySelector('.needle-hit');
    if (nh) {
      nh.addEventListener('click', function () { unpick(); });
      nh.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); unpick(); }
        else if (ev.key === 'Escape') { unpick(); }
      });
    }
  }

  /* ---- 节令札（右页）：做 / 由 / 惹 / 牵 ----
     两路（v2 §A.11）：
       默认 —— 下一个节令的世界书条目（做/由/惹/牵在 TJLex.FESTIVALS 里）；
       联动 —— 点了某节气扇/节令刻点，这一札切到该条；
               点「回到当下」印或岁轮上的朱针即可复位。 */
  function slipRows(pairs) {
    return pairs.map(function (p) {
      return '<div class="row"><span class="k">' + esc(p[0]) + '</span><span class="v">' +
        esc(p[1]) + '</span></div>';
    }).join('');
  }

  function setSlipHead(title, back) {
    var t = document.getElementById('lingTitle');
    var b = document.getElementById('lingBack');
    if (t) t.textContent = title;
    if (b) {
      b.hidden = !back;
      /* 幂等赋值：render() 每轮都会走到这里，不必重复绑定 */
      b.onclick = function () { unpick(); };
    }
  }

  function renderSlipDefault() {
    var rows = document.getElementById('lingRows');
    if (!rows) return;
    var d = lastD, loc = lastLoc;
    if (!d || !loc || !loc.slip) {
      setSlipHead('', false);
      document.getElementById('lingTitle').innerHTML = mo(6);
      rows.innerHTML = '<div class="row"><span class="k">札</span><span class="v">' + mo(14) + '</span></div>';
      return;
    }
    var x = loc.slip;
    setSlipHead(x.name + ' · ' + (loc.isNow ? '正当令' : '将至'), false);
    rows.innerHTML = slipRows([['做', x.做], ['由', x.由], ['惹', x.惹], ['牵', x.牵]]);
  }

  function renderSlipLinked(kind, key) {
    var rows = document.getElementById('lingRows');
    if (!rows) return;
    if (kind === 'term') {
      var t = (C.data.terms || [])[key];
      if (!t) { renderSlipDefault(); return; }
      var inTerm = C.festivalsInTerm(key);
      setSlipHead(t.name + ' · ' + C.termState(key, curIdxNow), true);
      rows.innerHTML = slipRows([
        ['月令', t.yueling || '—'],
        ['文', t.text || '—'],
        ['节令', inTerm.length ? inTerm.map(function (x) { return x.name; }).join(' · ') : '本段无节'],
      ]);
      return;
    }
    var fv = (C.data.festivals || []).filter(function (x) { return x.id === key; })[0];
    if (!fv) { renderSlipDefault(); return; }
    var lex = (L.FESTIVALS || []).filter(function (y) { return y.name === fv.name; })[0];
    setSlipHead(fv.name + ' · ' + (fv.every ? '年年' : '非年年'), true);
    rows.innerHTML = lex
      ? slipRows([['做', lex.做], ['由', lex.由], ['惹', lex.惹], ['牵', lex.牵]])
      : slipRows([['时', fv.at || '—'], ['文', fv.text || '—']]);
  }

  /* 兼容旧调用名（render() 里调用） */
  function renderSlip(d, loc) {
    lastD = d || null;
    lastLoc = loc || null;
    renderSlipDefault();
  }

  /* ---- 今岁（右页）：已过 / 将至 / 非年年 / 空月 ---- */
  function renderYear(d, loc) {
    var el = document.getElementById('lingYear');
    if (!el) return;
    if (!d) { el.innerHTML = '<div class="row"><span class="v">' + mo(12) + '</span></div>'; return; }
    var kou = (C.data.festivals || []).filter(function (x) { return !x.every; })[0];
    var curKey = d.leap ? 999 : d.month * 100 + d.day;
    var passed = [], coming = [];
    (C.data.festivals || []).forEach(function (x) {
      if (!x.every || x.month == null) return;
      (x.month * 100 + x.day <= curKey ? passed : coming).push(x);
    });
    var passedStr = passed.length ? passed.map(function (x) { return x.name; }).join(' · ') : '（岁首方过）';
    var comingStr = coming.slice(0, 3).map(function (x) { return x.name; }).join(' · ') || '明岁开印';
    el.innerHTML =
      '<div class="row"><span class="k">已过</span><span class="v">' + esc(passedStr) + '</span></div>' +
      '<div class="row"><span class="k">将至</span><span class="v">' + esc(comingStr) + '</span></div>' +
      '<div class="row"><span class="k">非年年</span><span class="v">' +
        esc((kou ? kou.name + ' · ' + (kou.period || '另记') : '—')) + '</span></div>' +
      '<div class="row"><span class="k">空月</span><span class="v">' +
        esc((C.data.quietMonths || []).map(function (q) {
          return ((C.data.monthNames || [])[q.month - 1] || q.month + '月') + ' · ' + (q.sub || '');
        }).join(' · ')) + '</span></div>';
  }

  /* ---- 主渲染 ---- */
  function render(state) {
    if (!state) return;
    var td = (state.棠郡 && state.棠郡.时地) || {};
    var d = parseDate(td.年月日);
    if (!d) {
      /* 真实环境的常态：年月日是自由短语 → 改用「节令」变量定位 */
      d = fromJieling((state.棠郡 && state.棠郡.节令) || null);
      if (d && window.console) {
        console.info('[棠郡] 年月日「' + (td.年月日 || '') + '」不含月日，岁轮位置取自节令（' +
          d.derived + '）：' + d.month + '月' + d.day + '日');
      }
    }
    /* 2026-10-05：第三条路 —— 「听棠前十日」「清明后三日」这类**节令相对式**
       由 SuilunCal.parseYueRi 认（作者存档里正是这种写法，此前轮心一直"月日未记"） */
    if (!d && window.SuilunCal && window.SuilunCal.parseYueRi) {
      var p3 = window.SuilunCal.parseYueRi(td.年月日);
      if (p3) {
        d = { ganzhi: '', leap: false, month: p3.month, day: p3.day, derived: '年月日·节令相对式' };
        if (window.console) {
          console.info('[棠郡] 年月日「' + (td.年月日 || '') + '」按节令相对式定位：' +
            p3.month + '月' + p3.day + '日');
        }
      }
    }
    if (!d && window.console) {
      console.warn('[棠郡] 年月日解析不出、节令也推不出，岁轮留白：', td.年月日);
    }

    var loc = null;
    if (d) {
      var l = C.locate(d.month, d.day);
      var nf = C.nextFestival(d.month, d.day);
      loc = {
        idx: l.idx, after: l.after, progress: l.progress,
        angle: C.angleOf(d.month, d.day),
        center: C.centerLines(d.ganzhi, d.month, d.day, d.leap),
        next: nf, isNow: !!(nf && nf.gap === 0),
        slip: null,
      };
      /* 节令札取「下一个节令」的世界书条目（做/由/惹/牵在 TJLex 里） */
      if (nf) {
        loc.slip = L.FESTIVALS.filter(function (x) { return x.name === nf.f.name; })[0] || null;
      }
    }

    curIdxNow = loc ? loc.idx : -1;      /* 供竖条笺判「已过/当下/将至」 */
    pickedKey = null;                    /* 扇是重建的，旧引用必须作废 */
    pickedEl = null;
    drawWheel(d, loc);
    bindSlip();                          /* 扇/刻点是刚生成的，每次都重绑 */
    renderSlip(d, loc);
    renderYear(d, loc);

    /* 轮下小注（2026-10-10 挪：原「点一节，看它的笺」位让给黄历，
       朱针当下信息改写进黄历块头的副题） */
    var note = document.getElementById('lingHuangliNote');
    if (note && loc) {
      note.textContent = '朱针指当下：' + (loc.center[1] || '') + ' · ' + (loc.center[2] || '');
    }

    /* 黄历（今明后三日）——条目池与滚动在 core/tj-almanac.js（同源 uid197） */
    if (window.TJAlmanac) { try { window.TJAlmanac.render(state); } catch (e) { console.warn('[棠郡] 黄历渲染失败：', e); } }
    var fm = document.getElementById('lingFootMonth');
    if (fm) {
      fm.textContent = d ? (d.leap ? '闰' : '') +
        ((C.data.monthNames || [])[d.month - 1] || d.month + '月') : '—';
    }
  }

  window.TJRender = window.TJRender || {};
  window.TJRender['令'] = render;
})();
