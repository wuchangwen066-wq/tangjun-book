/* ==================================================================
   棠郡 · 岁轮历法（纯函数，无 DOM）
   ------------------------------------------------------------------
   依据《岁轮文案与数据方案 v3》第二节。所有位置（朱针、节气扇、节令刻点）
   都由同一套 locate/angleOf 算出，保证三者永远对得上。

   依赖：window.SUILUN_DATA（suilun-data.json 的编译产物）
   对外：window.SuilunCal.{ locate, angleOf, monthCn, dayCn, hanNum,
                            festivalsInTerm, nextFestival,
                            termState, thirdLine, centerLines, quietOf }

   历法假设（方案 §2.1，【待确认】）：每月 30 日；初一至十四为"节"段，
   十五日起为"中"段。若世界书历法另有规定，只改本文件的 locate 即可。
================================================================== */
(function () {
  'use strict';

  var DATA = window.SUILUN_DATA || { terms: [], festivals: [], quietMonths: [], monthNames: [] };

  var DAY_CN = ['', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九',
    '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];

  var NUM_CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
    '十一', '十二', '十三', '十四', '十五'];

  function dayCn(d) { return DAY_CN[d] || String(d); }
  function hanNum(n) { return NUM_CN[n] || String(n); }

  /* ---- 农历数字（初一 / 廿三 / 十一 / 三十 / 阿拉伯数字都认） ---- */
  var CN_DIGIT = { '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  function cnNum(t) {
    t = String(t == null ? '' : t).trim();
    if (!t) return null;
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    var m;
    if ((m = /^初([一二三四五六七八九十])$/.exec(t))) return CN_DIGIT[m[1]];
    if ((m = /^廿([一二三四五六七八九])?$/.exec(t))) return 20 + (m[1] ? CN_DIGIT[m[1]] : 0);
    if (t === '三十') return 30;
    if (t === '十') return 10;
    if ((m = /^十([一二三四五六七八九])$/.exec(t))) return 10 + CN_DIGIT[m[1]];
    if ((m = /^([一二三四五六七八九])十([一二三四五六七八九])?$/.exec(t))) return CN_DIGIT[m[1]] * 10 + (m[2] ? CN_DIGIT[m[2]] : 0);
    return CN_DIGIT[t] || null;
  }

  /* 「还有九日」那种写法：1..99 的汉字数（天数用） */
  var NUM_ARR = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  function numCn(n) {
    n = Number(n);
    if (!isFinite(n) || n <= 0) return String(n || 0);
    if (n < 10) return NUM_ARR[n];
    if (n === 10) return '十';
    if (n < 20) return '十' + NUM_ARR[n - 10];
    if (n < 100) {
      var t = Math.floor(n / 10), o = n % 10;
      return NUM_ARR[t] + '十' + (o ? NUM_ARR[o] : '');
    }
    return String(n);
  }

  function festivalNamed(n) {
    n = String(n || '').trim();
    if (!n) return null;
    var fs = DATA.festivals || [];
    for (var i = 0; i < fs.length; i++) if (fs[i].name === n) return fs[i];
    for (var j = 0; j < fs.length; j++) if (n.indexOf(fs[j].name) >= 0) return fs[j];
    return null;
  }
  /* 节气：SillyTavern 侧只给了 24 个名字（无月日），按序号均分 360° 折成月日 */
  function termNamed(n) {
    n = String(n || '').trim();
    if (!n) return null;
    var ts = DATA.terms || [];
    for (var i = 0; i < ts.length; i++) if (ts[i].name === n) return i;
    for (var j = 0; j < ts.length; j++) {
      if (n.indexOf(ts[j].name) >= 0 || ts[j].name.indexOf(n) >= 0) return j;
    }
    return null;
  }
  function termToMD(idx) {
    var t = (idx * 15) % 360;
    return { month: Math.floor(t / 30) + 1, day: (t % 30) + 1 };
  }

  function wrapMD(m, d) {
    var t = ((m - 1) * 30 + (d - 1)) % 360;
    t = (t + 360) % 360;
    return { month: Math.floor(t / 30) + 1, day: (t % 30) + 1 };
  }

  /**
   * 年月日串 → {month, day}。三种写法都认：
   *   「丁未年·十月初二」「十月十二」（月日式）
   *   「听棠前十日」「清明后三日」（节令相对式）
   * 推不出返回 null（调用方据此留白，不猜）。
   */
  function parseYueRi(str) {
    var s = String(str || '');
    if (!s) return null;
    var m;
    /* 节令相对式之一：「某节令当日」 */
    if ((m = /([\u4e00-\u9fa5]{2,4})当日/.exec(s))) {
      var f0 = festivalNamed(m[1]);
      if (f0 && f0.month != null) return { month: f0.month, day: f0.day };
      var t0 = termNamed(m[1]);
      if (t0 != null) return termToMD(t0);
    }
    /* 节令相对式之二：「某节令 + 前/后 + N 日」 */
    if ((m = /([\u4e00-\u9fa5]{2,4})([前后])(\d{1,2}|[一二三四五六七八九十]{1,3})日/.exec(s))) {
      var f = festivalNamed(m[1]);
      var base = (f && f.month != null) ? { month: f.month, day: f.day } : null;
      if (!base) {                                  /* 「清明后三日」这类：清明是节气 */
        var ti = termNamed(m[1]);
        if (ti != null) base = termToMD(ti);
      }
      var n = cnNum(m[3]);
      if (base && n != null) {
        return wrapMD(base.month, base.day + (m[2] === '前' ? -n : n));
      }
    }
    /* 月日式（含 正月/冬月/腊月 三种老叫法） */
    if ((m = /闰?([一二三四五六七八九十正冬腊]{1,3}|\d{1,2})月(初[一二三四五六七八九十]|廿[一二三四五六七八九]?|三十|[一二三四五六七八九十]{1,3}|\d{1,2})/.exec(s))) {
      var monthWord = m[1];
      var mm = cnNum(monthWord);
      if (mm == null) mm = ({ '正': 1, '冬': 11, '腊': 12 })[monthWord] || null;
      var dd = cnNum(m[2]);
      if (mm != null && dd != null && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 30) {
        return { month: mm, day: dd };
      }
    }
    return null;
  }

  /**
   * 定位：月日 → 节气序号 + 段内进度
   * @param {number} m 1..12  @param {number} d 1..30
   * @returns {{idx:number, after:number, progress:number, half:number}}
   */
  function locate(m, d) {
    var half = d >= 15 ? 1 : 0;              /* 0=节段 1=中段 */
    var idx = 2 * (m - 1) + half;            /* 节气序号 0..23 */
    var after = half ? d - 15 : d - 1;       /* 距本段起点的天数 */
    var span = half ? 15 : 14;
    var progress = Math.min(1, after / span);
    return { idx: idx, after: after, progress: progress, half: half };
  }

  /** 角度（度，SVG 坐标 0°指右、顺时针为正；沿用 v2 §A.2） */
  function angleOf(m, d) {
    var r = locate(m, d);
    return -90 + (r.idx - 9) * 15 - 7.5 + r.progress * 15;
  }

  /** 月日汉字：十月初二 / 十月初八 */
  function monthCn(m, d, leap) {
    var mn = DATA.monthNames[m - 1] || (m + '月');
    return (leap ? '闰' : '') + mn + dayCn(d);
  }

  /** 无节月配置 */
  function quietOf(m) {
    for (var i = 0; i < DATA.quietMonths.length; i++) {
      if (DATA.quietMonths[i].month === m) return DATA.quietMonths[i];
    }
    return null;
  }

  /** 落在某节气段内的节令（用于节气笺底部那行朱色小字） */
  function festivalsInTerm(idx) {
    var out = [];
    DATA.festivals.forEach(function (f) {
      if (!f.every || f.month == null || f.day == null) return;
      if (locate(f.month, f.day).idx === idx) out.push(f);
    });
    return out;
  }

  /** 两日期相距天数（按月 30 日计，可跨年） */
  function daysBetween(m1, d1, m2, d2) {
    var a = (m1 - 1) * 30 + (d1 - 1);
    var b = (m2 - 1) * 30 + (d2 - 1);
    if (b < a) b += 360;                     /* 跨年：次年 */
    return b - a;
  }

  /**
   * 下一个（含当日）节令
   * @returns {{f:object, gap:number}} gap=0 表示当日
   */
  function nextFestival(m, d) {
    var best = null;
    DATA.festivals.forEach(function (f) {
      if (!f.every || f.month == null || f.day == null) return;
      var gap = daysBetween(m, d, f.month, f.day);
      if (!best || gap < best.gap) best = { f: f, gap: gap };
    });
    return best;
  }

  /** 节气状态：已过 / 当下 / 将至 */
  function termState(idx, curIdx) {
    if (idx < curIdx) return '已过';
    if (idx === curIdx) return '当下';
    return '将至';
  }

  /**
   * 中央第三行（方案 §3.7 + §2.3）
   * 形如「清明后七日 · 上巳将至」；当日有节令时只写「今日 X」。
   */
  function thirdLine(m, d, leap, nf, termName, after) {
    if (leap) return '闰月无节';
    if (quietOf(m)) return '本月无节';
    if (nf && nf.gap === 0) return '今日 ' + nf.f.name;
    var head = termName + (after === 0 ? '当日' : '后' + hanNum(after) + '日');
    if (!nf) return head;
    if (nf.gap <= 10) return head + ' · ' + nf.f.name + '将至';
    return head + ' · 下一节 ' + nf.f.name + ' · ' + hanNum(nf.gap) + '日后';
  }

  /** 中央三行（方案 §3.7） */
  function centerLines(yearGanzhi, m, d, leap) {
    var loc = locate(m, d);
    var term = DATA.terms[loc.idx] || { name: '' };
    var nf = nextFestival(m, d);
    return [
      yearGanzhi || '',
      monthCn(m, d, leap),
      thirdLine(m, d, leap, nf, term.name, loc.after),
    ];
  }

  window.SuilunCal = {
    locate: locate,
    angleOf: angleOf,
    monthCn: monthCn,
    dayCn: dayCn,
    hanNum: hanNum,
    quietOf: quietOf,
    festivalsInTerm: festivalsInTerm,
    daysBetween: daysBetween,
    nextFestival: nextFestival,
    termState: termState,
    thirdLine: thirdLine,
    centerLines: centerLines,
    parseYueRi: parseYueRi,
    festivalNamed: festivalNamed,
    cnNum: cnNum,
    numCn: numCn,
    termNamed: termNamed,
    termToMD: termToMD,
    data: DATA,
  };
})();
