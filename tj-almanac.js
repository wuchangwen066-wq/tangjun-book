/* ==================================================================
   棠郡状态栏 · 黄历（宜忌）—— core/tj-almanac.js
   ------------------------------------------------------------------
   2026-10-17 v2 重写（任务书：优化「棠郡_黄历」条目）：
   · 结构三槽位：【等第】+【宜忌】+【市井】，宜忌与市井各自成池、按等第分组，
     每等第 6–8 套宜忌、8–10 个市井意象；市井意象按春夏秋冬换皮
   · 等第权重（任务书定）：大吉 6%｜小吉 24%｜平 46%｜小凶 21%｜大凶 3%
   · 大凶约束：新册前十日不出现；两次大凶至少间隔 15 日；不连续；
     不落在节日前一日或节日当日
   · 去重约束：近 7 日内不复用同一条目，也不复用同一市井意象；
     同等第不连续超过两日（平除外）；相邻两日不雷同
   · 新册首日（丁未年十月二日，InitVar 锚定）恒为大吉
   · 稀有异日：朔（初一）/ 望（十五）/ 月底（三十），低概率，撞节日写节日
   · 保留：hash 确定性派生（今天←昨天的「明天」，滚动不改口）；
     节日优先；UI 今/明/后三行
   注意：条目池与世界书 uid197（规则）/ uid198（池子）同源——改任一侧必须同步。
   ================================================================== */
(function () {
  'use strict';

  /* ---------- 等第权重（任务书定，百分比） ----------
     注：大凶受「间隔15日/不连续/避开节日」等约束，实测出现率低于名义 3%，
     差额按权重比流向其余等第；故「平」名义取 44（实测≈46）、小凶取 22（实测≈21），
     使五等第实测比例贴合任务书的约 6/24/46/21/3。 */
  var TIERS = ['大吉', '小吉', '平', '小凶', '大凶'];
  var TIER_W = { '大吉': 7, '小吉': 24, '平': 43, '小凶': 22, '大凶': 3 };

  /* ---------- 新册锚点：丁未年十月二日（InitVar canonical，m10d2） ----------
     abs = 年偏移360 + (月-1)*30 + 日；丁未年十月二日 = 360 + 270 + 2 = 632。
     剧情上这是「新册首日」（玩家开册第一日）；册中日序一为正月初一，
     黄历铁律以新册首日为锚（2026-10-17 修：旧版锚在日序一，十月开局吃不到保护，
     故开局日曾抽出「平」、第三日抽出「大凶」）。 */
  var OPEN_ABS = 632;
  function openRelOf(absDay) { return absDay - OPEN_ABS + 1; }   /* 新册第几日 */

  /* ---------- 宜忌池（每等第 6–8 套；id 用于近 7 日去重） ---------- */
  var YIJI = {
    '大吉': [
      { id: 'dj1', 宜: '嫁娶·开张·立券', 忌: '词讼' },
      { id: 'dj2', 宜: '祈福·会亲', 忌: '动土' },
      { id: 'dj3', 宜: '纳彩·迎亲', 忌: '口舌' },
      { id: 'dj4', 宜: '立约·交易', 忌: '借贷' },
      { id: 'dj5', 宜: '出行·远发', 忌: '夜路' },
      { id: 'dj6', 宜: '上梁·迁居', 忌: '向西' }
    ],
    '小吉': [
      { id: 'xj1', 宜: '访友·纳采', 忌: '远行' },
      { id: 'xj2', 宜: '酿酒·开窖', 忌: '晒谷' },
      { id: 'xj3', 宜: '交易·对账', 忌: '借贷' },
      { id: 'xj4', 宜: '修船·理网', 忌: '下水' },
      { id: 'xj5', 宜: '学艺·抄书', 忌: '宴饮' },
      { id: 'xj6', 宜: '会亲·小宴', 忌: '争胜' },
      { id: 'xj7', 宜: '采买·补器', 忌: '赊欠' },
      { id: 'xj8', 宜: '进山·采药', 忌: '独行深谷' }
    ],
    '平': [
      { id: 'p1', 宜: '寻常事务', 忌: '无' },
      { id: 'p2', 宜: '洒扫·晾晒', 忌: '夜行' },
      { id: 'p3', 宜: '会账·写书', 忌: '保荐' },
      { id: 'p4', 宜: '串门·传话', 忌: '立约' },
      { id: 'p5', 宜: '修补·杂务', 忌: '迁居' },
      { id: 'p6', 宜: '吃茶·闲坐', 忌: '无' },
      { id: 'p7', 宜: '教习·诵读', 忌: '中辍' },
      { id: 'p8', 宜: '浣洗·赶集', 忌: '争执' }
    ],
    '小凶': [
      { id: 'xx1', 宜: '守业', 忌: '开市·远行' },
      { id: 'xx2', 宜: '小酌', 忌: '酗酒·动怒' },
      { id: 'xx3', 宜: '理账', 忌: '进货' },
      { id: 'xx4', 宜: '缝补·浆洗', 忌: '裁新' },
      { id: 'xx5', 宜: '谢客', 忌: '问病' },
      { id: 'xx6', 宜: '藏器', 忌: '示人' },
      { id: 'xx7', 宜: '葺屋', 忌: '大兴' }
    ],
    '大凶': [
      { id: 'dx1', 宜: '诸事不宜', 忌: '远行·开仓·动土' },
      { id: 'dx2', 宜: '安坐', 忌: '争执·签约' },
      { id: 'dx3', 宜: '守静', 忌: '赴约·远行' },
      { id: 'dx4', 宜: '闭门', 忌: '兴讼·出师' },
      { id: 'dx5', 宜: '理旧', 忌: '新谋·签约' },
      { id: 'dx6', 宜: '退订', 忌: '轻诺' }
    ]
  };

  /* ---------- 市井意象池（每等第 8–10 个；s=适用季节，可多季） ----------
     素材取自世界书既有设定：地名（棠邑/薇津/甫县/驷亭/黍墟/溱水）、行当
     （脚夫行/船帮/戏班/药铺/说书人/行首/酒肆）、物产（黍醴/岳芽/甘棠酥/
     崧术/黄纸朱砂/驷亭马）、节令（回程钱/竞渡/放灯/送盒/叩阶/送灶/添线/
     拜年/祓禊/培土/登高）。不新造设定。 */
  var SHIJING = {
    '大吉': [
      { id: 'ds1', t: '街面上喜轿过了两拨，爆竹皮扫不完。', s: ['春', '秋'] },
      { id: 'ds2', t: '庙里香火旺，素面摊子排到街口。', s: ['春', '冬'] },
      { id: 'ds3', t: '戏园唱堂会，门前车马排成行。', s: ['秋', '冬'] },
      { id: 'ds4', t: '夜市通宵，炸油味混着灯烟。', s: ['夏', '秋'] },
      { id: 'ds5', t: '柜上收礼，盒子堆成垛。', s: ['秋', '冬'] },
      { id: 'ds6', t: '牙人递帖递得脚不点地。', s: ['春', '夏'] },
      { id: 'ds7', t: '渡口加船，脚夫行工钱翻倍。', s: ['春', '夏'] },
      { id: 'ds8', t: '书院前有人递荐书，砚台摆了一排。', s: ['春', '秋'] }
    ],
    '小吉': [
      { id: 'ss1', t: '走亲的礼担多，渡口比平日热闹。', s: ['春', '秋'] },
      { id: 'ss2', t: '酒肆蒸汽不歇，巷口都是曲香。', s: ['冬', '春'] },
      { id: 'ss3', t: '柜上算盘响得密，对单的进出不断。', s: ['秋', '冬'] },
      { id: 'ss4', t: '滩头敲打声不断，桐油味飘半条河。', s: ['春', '夏'] },
      { id: 'ss5', t: '书坊里人多嘴静，纸墨卖得快。', s: ['春', '秋'] },
      { id: 'ss6', t: '药铺收药材，伙计蹲在门槛上分拣。', s: ['春', '秋'] },
      { id: 'ss7', t: '驿路车马多，亭柱边新刻了两个名。', s: ['夏', '秋'] },
      { id: 'ss8', t: '说书人改了新词，茶楼坐得满。', s: ['冬', '春'] }
    ],
    '平': [
      { id: 'ps1', t: '照常开市，人流如旧。', s: ['春', '夏', '秋', '冬'] },
      { id: 'ps2', t: '家家晒褥，街绳上搭成一片。', s: ['春', '夏', '秋'] },
      { id: 'ps3', t: '柜上无甚波折，一日无事。', s: ['春', '夏', '秋', '冬'] },
      { id: 'ps4', t: '捎信的脚夫来得勤。', s: ['春', '夏', '秋', '冬'] },
      { id: 'ps5', t: '巷里斧凿声零零碎碎。', s: ['春', '夏', '秋', '冬'] },
      { id: 'ps6', t: '茶棚里坐满了闲人，讲什么都有。', s: ['春', '夏', '秋', '冬'] },
      { id: 'ps7', t: '摆渡人来往如常，木桩上又挂一枚新钱。', s: ['春', '夏', '秋', '冬'] },
      { id: 'ps8', t: '菜市挑担的与主妇相争，只差一文。', s: ['春', '夏', '秋', '冬'] },
      { id: 'ps9', t: '衙门照常视事，署前石阶被磨得发亮。', s: ['春', '夏', '秋', '冬'] },
      { id: 'ps10', t: '酒肆拼桌的各吃各，粗陶碗摞成塔。', s: ['春', '夏', '秋', '冬'] }
    ],
    '小凶': [
      { id: 'xs1', t: '铺子半数下了门板，街面冷清。', s: ['冬', '春'] },
      { id: 'xs2', t: '酒肆后堂吵了两场，都是老客。', s: ['冬', '秋'] },
      { id: 'xs3', t: '货栈里对单子的多，起货的少。', s: ['秋', '冬'] },
      { id: 'xs4', t: '浆洗房水汽重，裁缝铺倒闲着。', s: ['春', '冬'] },
      { id: 'xs5', t: '药铺帘子低垂，进出的人都敛声。', s: ['春', '秋'] },
      { id: 'xs6', t: '牙行早闭，问价的人吃了闭门羹。', s: ['冬', '夏'] },
      { id: 'xs7', t: '船帮改了航线，码头上闲着的脚夫多。', s: ['夏', '秋'] },
      { id: 'xs8', t: '符摊前问卜的不少，买符的少。', s: ['春', '秋'] },
      { id: 'xs9', t: '戏园后排空着，班主脸上不好看。', s: ['秋', '冬'] }
    ],
    '大凶': [
      { id: 'gs1', t: '河上没几条船，行人都贴着檐下走。', s: ['春', '夏', '秋', '冬'] },
      { id: 'gs2', t: '牙行早早闭了门，市声比平日短半截。', s: ['春', '夏', '秋', '冬'] },
      { id: 'gs3', t: '客栈里挤满了走不出去的人。', s: ['春', '夏', '秋', '冬'] },
      { id: 'gs4', t: '工地歇了，匠人蹲在料堆旁不语。', s: ['春', '夏', '秋', '冬'] },
      { id: 'gs5', t: '货栈封了仓，栈桥上只过风。', s: ['春', '夏', '秋', '冬'] },
      { id: 'gs6', t: '渡钱贵了，摆渡人话也短。', s: ['春', '夏', '秋', '冬'] },
      { id: 'gs7', t: '更夫敲得比平日密，没人敢应。', s: ['春', '夏', '秋', '冬'] },
      { id: 'gs8', t: '商队困在驿亭，马槽里草料省着吃。', s: ['春', '夏', '秋', '冬'] }
    ]
  };

  /* ---------- 稀有异日（每月朔/望/月底；撞节日写节日，故不冲突） ---------- */
  var YIRI = [
    { id: 'yr_s', dAt: 1, 名: '朔日', 宜: '焚香·谒庙', 忌: '动土', 市井: '初一庙前香灰积成小堆，签筒摇得脆。' },
    { id: 'yr_w', dAt: 15, 名: '望日', 宜: '会账·了结', 忌: '借贷', 市井: '十五柜上结半月的数，算盘声比往日齐。' },
    { id: 'yr_m', dAt: 30, 名: '月底', 宜: '清账·清偿', 忌: '新债', 市井: '三十各铺盘一月进出，还不上的躲着走。' }
  ];
  var YIRI_P = 0.25;   /* 朔/望/月底才可能转异日，概率低 */

  function seasonOf(m) { return m <= 3 ? '春' : m <= 6 ? '夏' : m <= 9 ? '秋' : '冬'; }

  /* ---------- 确定性散列（日序 → [0,1)） ---------- */
  function hash(n) {
    var x = (n | 0) + 0x6D2B79F5;
    x = Math.imul(x ^ (x >>> 15), 1 | x);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }

  /* 抽级：权重按 TIER_W；banned 里的级跳过；八盐全撞则按序取第一个非禁级 */
  function pickTier(key, banned) {
    var cand = [];
    for (var i = 0; i < TIERS.length; i++) if (banned.indexOf(TIERS[i]) < 0) cand.push(TIERS[i]);
    if (!cand.length) cand = TIERS.slice();
    var total = 0;
    for (var j = 0; j < cand.length; j++) total += TIER_W[cand[j]];
    for (var salt = 0; salt < 8; salt++) {
      var r = hash(key * 31 + salt * 7 + 13);
      var acc = r * total;
      for (var k = 0; k < cand.length; k++) {
        acc -= TIER_W[cand[k]];
        if (acc < 0) return cand[k];
      }
    }
    return cand[cand.length - 1];
  }

  /* 池内抽一条：avoid 跳过；八盐全撞取候选里第一个未避的 */
  function pickOne(key, arr, avoid) {
    avoid = avoid || [];
    for (var salt = 0; salt < 8; salt++) {
      var r = hash(key * 31 + salt * 7 + 29);
      var i = Math.floor(r * arr.length);
      if (i >= arr.length) i = arr.length - 1;
      if (avoid.indexOf(arr[i].id) < 0) return arr[i];
    }
    for (var j = 0; j < arr.length; j++) if (avoid.indexOf(arr[j].id) < 0) return arr[j];
    return arr[arr.length - 1];
  }

  /* ---------- 节日 ---------- */
  function festivalAt(m, d) {
    var list = (window.SuilunCal && window.SuilunCal.data && window.SuilunCal.data.festivals) || [];
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (f.month === m && f.day === d) return f;
    }
    return null;
  }

  /* 「丁未年 · 十月初二」→ {m,d,abs} */
  function parseNianYueRi(str) {
    var md = window.SuilunCal && window.SuilunCal.parseYueRi ? window.SuilunCal.parseYueRi(str) : null;
    if (!md) return null;
    var y = /丁未年/.test(String(str || '')) ? 1 : 0;
    return { m: md.month, d: md.day, abs: y * 360 + (md.month - 1) * 30 + md.day };
  }

  /* m,d 往后推 n 日（月按 30 日，跨月跨年自然回卷；负数归一防 0/负月日） */
  function addDays(m, d, n) {
    var abs = ((((m - 1) * 30 + (d - 1) + n) % 360) + 360) % 360;
    return { m: Math.floor(abs / 30) + 1, d: abs % 30 + 1 };
  }

  var CN = { 1: '初一', 2: '初二', 3: '初三', 4: '初四', 5: '初五', 6: '初六', 7: '初七', 8: '初八', 9: '初九', 10: '初十', 11: '十一', 12: '十二', 13: '十三', 14: '十四', 15: '十五', 16: '十六', 17: '十七', 18: '十八', 19: '十九', 20: '二十', 21: '廿一', 22: '廿二', 23: '廿三', 24: '廿四', 25: '廿五', 26: '廿六', 27: '廿七', 28: '廿八', 29: '廿九', 30: '三十' };
  var MCN = { 1: '正月', 2: '二月', 3: '三月', 4: '四月', 5: '五月', 6: '六月', 7: '七月', 8: '八月', 9: '九月', 10: '十月', 11: '十一月', 12: '十二月' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------- 日签缓存 + 约束 ----------
     递归取前日签，天然满足「今天的明日＝昨天的后日」（滚动不改口）。 */
  var dayCache = {};
  var YEAR_START = 361;   /* 丁未年正月初一的 abs（360+0+1），之前的册日不存在 */
  function dayEntryOf(absDay, m, d) {
    if (absDay < YEAR_START) return { tier: null, yj: null, im: null };
    if (dayCache[absDay]) return dayCache[absDay];
    var rel = openRelOf(absDay);

    /* 约束一：新册首日恒大吉；前十日禁大凶 */
    var banned = [];
    if (rel === 1) { dayCache[absDay] = lockTier('大吉', m, d); return dayCache[absDay]; }
    if (rel >= 2 && rel <= 10) banned.push('大凶');

    /* 约束二：两次大凶至少间隔 15 日（往前看 14 日；前十日已禁大凶，无需查） */
    if (rel > 10) {
      for (var i = 1; i <= 14; i++) {
        var pa = absDay - i;
        if (pa < YEAR_START) break;
        var pmd = addDays(m, d, -i);
        if (dayEntryOf(pa, pmd.m, pmd.d).tier === '大凶') { banned.push('大凶'); break; }
      }
    }
    /* 约束三：不连续（前一日是大凶则今日禁） */
    var y = dayEntryOf(absDay - 1, addDays(m, d, -1).m, addDays(m, d, -1).d);
    if (y.tier === '大凶') banned.push('大凶');
    /* 约束四：大凶不落在节日前一日或节日当日 */
    var t1 = addDays(m, d, 1);
    if (festivalAt(m, d) || festivalAt(t1.m, t1.d)) banned.push('大凶');
    /* 约束五：同等第不连续超过两日（平除外） */
    if (y.tier && y.tier !== '平') {
      var y2 = dayEntryOf(absDay - 2, addDays(m, d, -2).m, addDays(m, d, -2).d);
      if (y2.tier === y.tier && banned.indexOf(y.tier) < 0) banned.push(y.tier);
    }

    /* 抽级 */
    var tier = pickTier(absDay * 3 + 1, banned);

    /* 近 7 日去重：不复用同一条目，也不复用同一市井意象 */
    var avoidY = [], avoidS = [];
    for (var k = 1; k <= 7; k++) {
      var pk = dayEntryOf(absDay - k, addDays(m, d, -k).m, addDays(m, d, -k).d);
      if (pk.yj) avoidY.push(pk.yj.id);
      if (pk.im) avoidS.push(pk.im.id);
    }
    var yj = pickOne(absDay * 5 + 3, YIJI[tier], avoidY);
    var pool = [];
    for (var q = 0; q < SHIJING[tier].length; q++) {
      if (SHIJING[tier][q].s.indexOf(seasonOf(m)) >= 0) pool.push(SHIJING[tier][q]);
    }
    if (!pool.length) pool = SHIJING[tier];
    var im = pickOne(absDay * 7 + 5, pool, avoidS);

    dayCache[absDay] = { tier: tier, yj: yj, im: im };
    return dayCache[absDay];
  }
  /* 首日锁大吉：照常在两条大吉里选（宜忌/市井同走近 7 日去重，首日无前日可避） */
  function lockTier(tier, m, d) {
    var yj = pickOne(OPEN_ABS * 5 + 3, YIJI[tier], []);
    var pool = [];
    for (var q = 0; q < SHIJING[tier].length; q++) {
      if (SHIJING[tier][q].s.indexOf(seasonOf(m)) >= 0) pool.push(SHIJING[tier][q]);
    }
    if (!pool.length) pool = SHIJING[tier];
    var im = pickOne(OPEN_ABS * 7 + 5, pool, []);
    return { tier: tier, yj: yj, im: im };
  }

  /* 某日宜忌：节日 > 异日 > 抽签 */
  function entryOfDay(m, d, absDay) {
    var f = festivalAt(m, d);
    if (f) return { 级: '节', 名: f.name, 文: f.text, 宜: '', 忌: '' };
    /* 异日：每月朔（初一）/ 望（十五）/ 月底（三十），低概率 */
    for (var i = 0; i < YIRI.length; i++) {
      if (YIRI[i].dAt === d && hash(absDay * 3 + 99) < YIRI_P) {
        var yr = YIRI[i];
        return { 级: '异', 名: yr.名, 宜: yr.宜, 忌: yr.忌, 市: yr.市井, 钩: '无' };
      }
    }
    var e = dayEntryOf(absDay, m, d);
    return { 级: e.tier, 宜: e.yj.宜, 忌: e.yj.忌, 市: e.im.t, 钩: '无' };
  }

  /* 一天一行 */
  function lineHtml(tag, m, d, absDay) {
    var e = entryOfDay(m, d, absDay);
    var day = MCN[m] + CN[d];
    if (e.级 === '节') {
      return '<div class="row almanac-row is-festival" title="' + esc(e.文) + '">' +
        '<span class="k">' + tag + '</span>' +
        '<span class="v"><b class="almanac-fest">' + esc(e.名) + '</b> · ' + esc(String(e.文 || '').slice(0, 16)) + '…</span></div>';
    }
    if (e.级 === '异') {
      return '<div class="row almanac-row is-yiri" title="' + esc(e.市) + '">' +
        '<span class="k">' + tag + '</span>' +
        '<span class="v"><b class="almanac-fest">' + esc(e.名) + '</b>｜宜 ' + e.宜 + (e.忌 && e.忌 !== '无' ? '｜忌 ' + e.忌 : '') + '</span></div>';
    }
    /* 明日过节 → 今日 title 带一笔筹备（等第照抽） */
    var t1 = addDays(m, d, 1);
    var eve = festivalAt(t1.m, t1.d);
    var t = e.级 + '｜宜 ' + e.宜 + (e.忌 && e.忌 !== '无' ? '｜忌 ' + e.忌 : '');
    var tip = e.市 + (eve ? '（明日' + eve.name + '，市井已有筹备）' : '');
    return '<div class="row almanac-row is-' + e.级 + '" title="' + esc(tip) + '">' +
      '<span class="k">' + tag + '</span>' +
      '<span class="v">' + esc(t) + '</span></div>';
  }

  /* ---------- 渲染：令·左页 #lingHuangli，今/明/后 三行 ---------- */
  function render(state) {
    var box = document.getElementById('lingHuangli');
    if (!box) return;
    var r = (state && (state['棠郡'] || state)) || {};
    var ymd = (r.时地 && r.时地['年月日']) || '';
    var p = parseNianYueRi(ymd);
    if (!p) { box.innerHTML = ''; box.hidden = true; return; }
    var rows = '';
    rows += lineHtml('今日', p.m, p.d, p.abs);
    var t1 = addDays(p.m, p.d, 1);
    rows += lineHtml('明日', t1.m, t1.d, p.abs + 1);
    var t2 = addDays(p.m, p.d, 2);
    rows += lineHtml('后日', t2.m, t2.d, p.abs + 2);
    box.hidden = false;
    box.innerHTML = '<div class="block-head">黄历<span class="nianpu-count" id="lingHuangliNote">今明后三日 · 全城通行</span></div>' + rows;
  }

  /* 暴露：tj-ling.js 渲染「令」页时调 TJAlmanac.render(state)；
     世界书侧同源条目 uid197（规则）/ uid198（池子）——改两处同步 */
  window.TJAlmanac = {
    render: render,
    entryOfDay: entryOfDay,
    YIJI: YIJI,
    SHIJING: SHIJING,
    TIER_W: TIER_W,
    OPEN_ABS: OPEN_ABS,
    _parse: parseNianYueRi
  };
})();
