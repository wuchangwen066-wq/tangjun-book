/* ==================================================================
   棠郡状态栏 · 黄历（宜忌）—— core/tj-almanac.js
   ------------------------------------------------------------------
   作者定案（2026-10-10）：
   · 黄历全知：满城人信，世界因人的信仰而动（第一层：影响人，不影响天）
   · 偶尔灵验只做概率倾斜（第二层：钩子写「倾向」不写「必然」）
   · 滚动：黄历按日序确定性派生 —— 今天 ← 昨天的「明天」，永不穿帮；
     只有「后日」是新抽的（同一函数天然满足，无需存档）
   · 节日优先：撞节日写节日，不抽宜忌
   · 条目池 20 条带权重：大吉/大凶少，平日居多，免得天天极端
   · 相邻两日不雷同（2026-10-16 实现：pick 带 avoid，换盐重抽）；
     开局铁律同 uid197（2026-10-13 作者补）：日序一恒大吉、前十日禁大凶
   · UI 只展示 今/明/后 三天
   注意：条目池与 uid197（世界书侧）同源同文——**改任一侧必须同步另一侧**。
   ================================================================== */
(function () {
  'use strict';

  /* ---------- 条目池（20 条，带权重）----------
     结构：级 + 宜 + 忌 + 市井（氛围句）+ 钩子（倾向，不写必然）
     权重：大吉×1 大凶×1 小吉×3 小凶×3 平×6 —— 抽签按权重累积 */
  var POOL = [
    /* 大吉 ×2（权重 1） */
    { 级: '大吉', 宜: '嫁娶·开张·立券', 忌: '词讼', 市井: '街面上喜轿过了两拨，爆竹皮扫不完。', 钩子: '喜庆谈成类事件顺利概率略升' },
    { 级: '大吉', 宜: '祈福·会亲', 忌: '动土', 市井: '庙里香火旺，素面摊子排到街口。', 钩子: '偶遇机缘类事件概率略升' },
    /* 大凶 ×2（权重 1） */
    { 级: '大凶', 宜: '诸事不宜', 忌: '远行·开仓·动土', 市井: '河上没几条船，行人都贴着檐下走。', 钩子: '出行意外类事件概率略升' },
    { 级: '大凶', 宜: '安坐', 忌: '争执·签约', 市井: '牙行早早闭了门，市声比平日短半截。', 钩子: '口角破财类事件概率略升' },
    /* 小吉 ×5（权重 3） */
    { 级: '小吉', 宜: '访友·纳采', 忌: '远行', 市井: '走亲的礼担多，渡口比平日热闹。', 钩子: '访友类事件顺利概率略升' },
    { 级: '小吉', 宜: '酿酒·开窖', 忌: '晒谷', 市井: '酒肆蒸汽不歇，巷子口都是曲香。', 钩子: '酿酒出货顺利概率略升' },
    { 级: '小吉', 宜: '交易·对账', 忌: '借贷', 市井: '柜上算盘响得密，牙人来回递帖。', 钩子: '买卖谈成概率略升' },
    { 级: '小吉', 宜: '修船·理网', 忌: '下水', 市井: '滩头敲打声不断，桐油味飘半条河。', 钩子: '整修类活计顺利概率略升' },
    { 级: '小吉', 宜: '学艺·抄书', 忌: '宴饮', 市井: '书坊里人多嘴静，纸墨卖得快。', 钩子: '研习类事件收益略升' },
    /* 小凶 ×5（权重 3） */
    { 级: '小凶', 宜: '守业', 忌: '开市·远行', 市井: '铺子半数下了门板，街面冷清。', 钩子: '开张类事件波折概率略升' },
    { 级: '小凶', 宜: '小酌', 忌: '酗酒·动怒', 市井: '酒肆后堂吵了两场，都是老客。', 钩子: '酒后口角概率略升' },
    { 级: '小凶', 宜: '理账', 忌: '进货', 市井: '货栈里对单子的多，起货的少。', 钩子: '货损错账概率略升' },
    { 级: '小凶', 宜: '缝补·浆洗', 忌: '裁新', 市井: '浆洗房水汽重，裁缝铺倒闲着。', 钩子: '新置物件出错概率略升' },
    { 级: '小凶', 宜: '谢客', 忌: '问病', 市井: '药铺帘子低垂，进出的人都敛声。', 钩子: '探病碰壁概率略升' },
    /* 平 ×6（权重 6） */
    { 级: '平', 宜: '寻常事务', 忌: '无', 市井: '照常开市，人流如旧。', 钩子: '无' },
    { 级: '平', 宜: '洒扫·晾晒', 忌: '夜行', 市井: '家家晒褥，街绳上搭成一片。', 钩子: '无' },
    { 级: '平', 宜: '会账·写书', 忌: '保荐', 市井: '柜上无甚波折，一日无事。', 钩子: '无' },
    { 级: '平', 宜: '串门·传话', 忌: '立约', 市井: '捎信的脚夫来得勤。', 钩子: '无' },
    { 级: '平', 宜: '修补·杂务', 忌: '迁居', 市井: '巷里斧凿声零零碎碎。', 钩子: '无' },
    { 级: '平', 宜: '吃茶·闲坐', 忌: '无', 市井: '茶棚里坐满了闲人，讲什么都有。', 钩子: '无' }
  ];
  var WEIGHTS = { '大吉': 1, '大凶': 1, '小吉': 3, '小凶': 3, '平': 6 };

  /* ---------- 确定性散列（日序 → [0,1)）---------- */
  function hash(n) {
    var x = (n | 0) + 0x6D2B79F5;
    x = Math.imul(x ^ (x >>> 15), 1 | x);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }

  /* 加权抽签（2026-10-16 重写）：
     dayKey = 日序*3 + 槽位；avoid 里的条目跳过——抽中了就换盐重抽（确定性）；
     tiers 限定档位（开局铁律用：首日只抽大吉、前十日禁大凶）。
     关键：无 tiers 时候选集就是全池、权重累积与旧版逐字节同序，
     故**没撞 avoid 的日子结果与旧版完全一致**（不无谓改口）；
     只有抽中 avoid 才换盐（仍在同一候选集上重抽）。 */
  function pick(dayKey, avoid, tiers) {
    avoid = avoid || [];
    var idxs = [];
    for (var i = 0; i < POOL.length; i++) {
      if (!tiers || tiers.indexOf(POOL[i].级) >= 0) idxs.push(i);
    }
    var total = 0, j;
    for (j = 0; j < idxs.length; j++) total += WEIGHTS[POOL[idxs[j]].级];
    for (var salt = 0; salt < 8; salt++) {
      var r = hash(dayKey * 31 + salt * 7 + 13);
      var acc = r * total;
      for (j = 0; j < idxs.length; j++) {
        acc -= WEIGHTS[POOL[idxs[j]].级];
        if (acc < 0) {
          if (avoid.indexOf(idxs[j]) < 0) return idxs[j];
          break;   /* 撞上 avoid：换盐重抽 */
        }
      }
    }
    /* 八盐全撞：候选集里按顺序找第一个不在 avoid 的（仍确定性） */
    for (j = 0; j < idxs.length; j++) if (avoid.indexOf(idxs[j]) < 0) return idxs[j];
    return idxs[idxs.length - 1];
  }

  /* 开局铁律（与世界书 uid197 同源，2026-10-13 作者补，2026-10-16 UI 侧实现）：
     日序一恒大吉（从两条大吉中择一）；日序一至十禁大凶。
     日序 = abs − 360：丁未为册中元年，开局锚定丁未年十月二日（InitVar canonical）。 */
  function storyDayOf(absDay) { return absDay - 360; }
  function tierRuleOf(absDay) {
    var sd = storyDayOf(absDay);
    if (sd === 1) return ['大吉'];
    if (sd >= 2 && sd <= 10) return ['大吉', '小吉', '小凶', '平'];
    return null;
  }

  /* 日签缓存 + 避昨日递归：absDay -> 池下标（-1 = 无昨日可避）。
     相邻两日不雷同靠「避开昨日那一支」实现；递归取昨日签，
     保证「昨天的明日」与「今天的今日」永远是同一支——滚动不改口。 */
  var dayIdxCache = {};
  function poolIdxOfDay(absDay) {
    if (absDay <= 0) return -1;
    if (dayIdxCache[absDay] !== undefined) return dayIdxCache[absDay];
    var avoid = [];
    var prev = poolIdxOfDay(absDay - 1);
    if (prev >= 0) avoid.push(prev);
    var idx = pick(absDay * 3 + 1, avoid, tierRuleOf(absDay));
    dayIdxCache[absDay] = idx;
    return idx;
  }

  /* 某日宜忌：先查节日，撞节日写节日不抽黄历 */
  function entryOfDay(m, d, absDay) {
    var f = festivalAt(m, d);
    if (f) {
      return { 级: '节', 名: f.name, 文: f.text, 宜: '', 忌: '' };
    }
    var idx = poolIdxOfDay(absDay);
    if (idx < 0) idx = pick(absDay * 3 + 1);   // absDay<=0 的防御分支
    var e = POOL[idx];
    return { 级: e.级, 宜: e.宜, 忌: e.忌, 市: e.市井, 钩: e.钩子 };
  }

  /* 节日查表（SuilunCal.data.festivals：月日全等） */
  function festivalAt(m, d) {
    var list = (window.SuilunCal && window.SuilunCal.data && window.SuilunCal.data.festivals) || [];
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (f.month === m && f.day === d) return f;
    }
    return null;
  }

  /* 「丁未年 · 十月初二」→ {m,d,abs}：解析复用岁轮 parseYueRi；
     abs = 全知日序（月按 30 日折算），丁未为册中元年 */
  function parseNianYueRi(str) {
    var md = window.SuilunCal && window.SuilunCal.parseYueRi ? window.SuilunCal.parseYueRi(str) : null;
    if (!md) return null;
    var y = /丁未年/.test(String(str || '')) ? 1 : 0;
    return { m: md.month, d: md.day, abs: y * 360 + (md.month - 1) * 30 + md.day };
  }

  /* m,d 往后推 n 日（月按 30 日，跨月跨年自然回卷） */
  function addDays(m, d, n) {
    var abs = (m - 1) * 30 + (d - 1) + n;
    var mm = Math.floor(abs / 30) % 12 + 1;
    var dd = abs % 30 + 1;
    return { m: mm, d: dd };
  }

  var CN = { 1: '初一', 2: '初二', 3: '初三', 4: '初四', 5: '初五', 6: '初六', 7: '初七', 8: '初八', 9: '初九', 10: '初十', 11: '十一', 12: '十二', 13: '十三', 14: '十四', 15: '十五', 16: '十六', 17: '十七', 18: '十八', 19: '十九', 20: '二十', 21: '廿一', 22: '廿二', 23: '廿三', 24: '廿四', 25: '廿五', 26: '廿六', 27: '廿七', 28: '廿八', 29: '廿九', 30: '三十' };
  var MCN = { 1: '正月', 2: '二月', 3: '三月', 4: '四月', 5: '五月', 6: '六月', 7: '七月', 8: '八月', 9: '九月', 10: '十月', 11: '十一月', 12: '十二月' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* 一天一行：今日 小吉｜宜 访友·纳采｜忌 远行 */
  function lineHtml(tag, m, d, absDay) {
    var e = entryOfDay(m, d, absDay);
    var day = MCN[m] + CN[d];
    if (e.级 === '节') {
      return '<div class="row almanac-row is-festival" title="' + esc(e.文) + '">' +
        '<span class="k">' + tag + '</span>' +
        '<span class="v"><b class="almanac-fest">' + esc(e.名) + '</b> · ' + esc(String(e.文 || '').slice(0, 16)) + '…</span></div>';
    }
    var t = e.级 + '｜宜 ' + e.宜 + (e.忌 && e.忌 !== '无' ? '｜忌 ' + e.忌 : '');
    var tip = e.市 + (e.钩 && e.钩 !== '无' ? '（' + e.钩 + '）' : '');
    return '<div class="row almanac-row is-' + e.级 + '" title="' + esc(tip) + '">' +
      '<span class="k">' + tag + '</span>' +
      '<span class="v">' + esc(t) + '</span></div>';
  }

  /* ---------- 渲染：令·左页 #lingHuangli（岁轮下），今/明/后 三行 ---------- */
  function render(state) {
    var box = document.getElementById('lingHuangli');
    if (!box) return;
    var r = (state && (state['棠郡'] || state)) || {};
    var ymd = (r.时地 && r.时地['年月日']) || '';
    var p = parseNianYueRi(ymd);
    if (!p) { box.innerHTML = ''; box.hidden = true; return; }
    var today = entryOfDay(p.m, p.d, p.abs);
    var rows = '';
    /* 今日 / 明日 / 后日：abs 递增即「滚动」——今天的明日就是昨天的后日之后
       那一天的同一支签，函数唯一，永不改口 */
    rows += lineHtml('今日', p.m, p.d, p.abs);
    var t1 = addDays(p.m, p.d, 1);
    rows += lineHtml('明日', t1.m, t1.d, p.abs + 1);
    var t2 = addDays(p.m, p.d, 2);
    rows += lineHtml('后日', t2.m, t2.d, p.abs + 2);
    box.hidden = false;
    box.innerHTML = '<div class="block-head">黄历<span class="nianpu-count" id="lingHuangliNote">今明后三日 · 全城通行</span></div>' + rows;
  }

  /* 暴露：tj-shi.js 渲染「时」页时调 TJAlmanac.render(state)；
     世界书/AI 侧同源条目 uid197 —— 改条目池两处同步 */
  window.TJAlmanac = {
    render: render,
    entryOfDay: entryOfDay,
    POOL: POOL,
    _parse: parseNianYueRi
  };
})();
