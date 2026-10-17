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
      { id: 'ss8', t: '说书人改了新词，茶楼坐得满。', s: ['冬', '春'] },
      { id: 'ss9', t: '庙里只给签，不看宜忌；要挑日子还得回坊市买历。', s: ['春', '夏', '秋', '冬'] }
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
      { id: 'ps10', t: '酒肆拼桌的各吃各，粗陶碗摞成塔。', s: ['春', '夏', '秋', '冬'] },
      { id: 'ps11', t: '行首把话压下来，一行人照旧出工。', s: ['春', '夏', '秋', '冬'] }
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
      { id: 'gs8', t: '商队困在驿亭，马槽里草料省着吃。', s: ['春', '夏', '秋', '冬'] },
      { id: 'gs9', t: '渡口木桩上又多一枚没取的铜钱。', s: ['春', '夏', '秋', '冬'] }
    ]
  };

  /* ---------- 空月市井（六月、十月专用）----------
     本郡六月与十月无节：没节就没由头，没由头就不好开口，也不好送礼——
     要办的事要么赶在五月前，要么拖到冬至（见「规则·节令如何起事」空月条）。
     这两个月的市井一律带一层「话搁着、事推到冬至前」的意思，别的照常抽。 */
  var KONG_MONTHS = [6, 10];
  var SHIJING_KONG = {
    '大吉': [
      { id: 'kg_dj1', t: '办成的喜事也压着不声张，贺仪先记在柜上，等冬至再提。' },
      { id: 'kg_dj2', t: '好日子也不敢张扬——没节，请不动人；席摆了，话留到冬至。' },
      { id: 'kg_dj3', t: '嫁娶的鼓吹比往日轻，喜钱先压在柜里，等冬至再补一声。' }
    ],
    '小吉': [
      { id: 'kg_xj1', t: '话说一半就搁住了——没节，谁也不好先开口；事都推到冬至前。' },
      { id: 'kg_xj2', t: '想提的那句还是没出口；街上照旧热闹，就是没人起话头。' },
      { id: 'kg_xj3', t: '铺子照开、货照发，唯独「改日」两个字没人敢先说。' }
    ],
    '平': [
      { id: 'kg_p1', t: '街上照旧，只是没人起话头；要办的事都堆着，等冬至。' },
      { id: 'kg_p2', t: '没节的月份，走动少了；门开着，人坐着，话都留着。' },
      { id: 'kg_p3', t: '摆渡的照旧来回，木桩上那排钱没人动；这个月谁也不催谁。' },
      { id: 'kg_p4', t: '柜上没甚动静，账记着不结——等冬至那几天一块儿清。' }
    ],
    '小凶': [
      { id: 'kg_xx1', t: '没由头，话更难开口；欠着的那句还搁着，催也不好催。' },
      { id: 'kg_xx2', t: '要催的话咽回去三回；这个月没节，上门就是失礼。' },
      { id: 'kg_xx3', t: '对单子的手都慢些——急着催的，反倒显得没规矩。' }
    ],
    '大凶': [
      { id: 'kg_dx1', t: '连个由头都没有，事就这么悬着；渡口那枚钱还挂着，没人来取。' },
      { id: 'kg_dx2', t: '没节，连避讳都没个名目；街面冷，人却不敢早关门。' },
      { id: 'kg_dx3', t: '该办的事全压下了，谁也不说「等冬至」——说了就是要办的意思。' }
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

  /* 市井意象：六月/十月（无节空月）优先取空月专用池，其余按当季过滤 */
  function pickImg(tier, m, key, avoid) {
    if (KONG_MONTHS.indexOf(m) >= 0 && SHIJING_KONG[tier] && SHIJING_KONG[tier].length) {
      return pickOne(key * 11 + 41, SHIJING_KONG[tier], avoid);
    }
    var pool = [];
    for (var q = 0; q < SHIJING[tier].length; q++) {
      if (SHIJING[tier][q].s.indexOf(seasonOf(m)) >= 0) pool.push(SHIJING[tier][q]);
    }
    if (!pool.length) pool = SHIJING[tier];
    return pickOne(key * 7 + 5, pool, avoid);
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

  /* 「丁未年 · 十月初二」→ {m,d,abs}。
     2026-10-18 修（真机 bug）：状态栏的年月日**常常不带年号**（真机实测
     TJ_STATE.棠郡.时地.年月日 = "十月二日"，见 InitVar/起手条目 uid83/87）。
     旧写法「无年号即第 0 年」会算出 abs=272 < 元年起点，抽取返回空 → 黄历整块消失。
     册中元年为丁未（开局锚定丁未年十月二日），故**只有显式出现别的年号才按他年计**，
     无年号一律按丁未年 —— 与开局设定、与「首日大吉」铁律都对得上。 */
  function parseNianYueRi(str) {
    var md = window.SuilunCal && window.SuilunCal.parseYueRi ? window.SuilunCal.parseYueRi(str) : null;
    if (!md) return null;
    var s = String(str || '');
    var y = /戊申年|己酉年|庚戌年/.test(s) ? 0 : 1;   /* 无年号＝丁未年 */
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
    var im = pickImg(tier, m, absDay, avoidS);

    dayCache[absDay] = { tier: tier, yj: yj, im: im };
    return dayCache[absDay];
  }
  /* 首日锁大吉：照常在两条大吉里选（宜忌/市井同走近 7 日去重，首日无前日可避） */
  function lockTier(tier, m, d) {
    var yj = pickOne(OPEN_ABS * 5 + 3, YIJI[tier], []);
    var im = pickImg(tier, m, OPEN_ABS, []);
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
    /* 2026-10-18 兜底：抽签万一取不到（abs 落在册外、池子缺项等），
       退回直接抽一套宜忌+市井，绝不返回半成品让调用方崩掉 —— 黄历宁可朴素，不可消失。 */
    if (!e || !e.yj || !e.im) {
      var fbTier = (e && e.tier) || pickTier(absDay * 3 + 1, []);
      var fbY = pickOne(absDay * 5 + 3, YIJI[fbTier], []);
      var fbPool = [];
      for (var q = 0; q < SHIJING[fbTier].length; q++) {
        if (SHIJING[fbTier][q].s.indexOf(seasonOf(m)) >= 0) fbPool.push(SHIJING[fbTier][q]);
      }
      var fbS = pickOne(absDay * 7 + 5, fbPool.length ? fbPool : SHIJING[fbTier], []);
      return { 级: fbTier, 宜: fbY.宜, 忌: fbY.忌, 市: fbS.t, 钩: '无' };
    }
    return { 级: e.tier, 宜: e.yj.宜, 忌: e.yj.忌, 市: e.im.t, 钩: '无' };
  }

  /* 一天一行 */
  /* ---------- 版式（2026-10-18 v3）：朱线挂三块木牌 ----------
     只改展示层：等第/宜忌/节俗文案原样呈现；数据读取与抽签逻辑未动。
     竖排 row-reverse：日名 → 等第 → 宜 → 忌（自右向左读）。
     牌面画在 ::before 上，孔/线/字层 position 非 static 以盖在牌面之上。 */

  /* 事项拆分：'立约·交易' → ['立约','交易']；超过 max 项以 … 收尾（全文在 data-tip） */
  function splitItems(s) {
    return String(s || '').split('·').map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function itemsHtml(arr, max) {
    var shown = arr.slice(0, max).map(function (x) { return '<span class="it">' + esc(x) + '</span>'; }).join('');
    return arr.length > max ? shown + '<span class="it al-more">…</span>' : shown;
  }

  /* 一日一牌。today=true 为今日牌（大，带宜忌栏） */
  function paiHtml(tag, m, d, absDay, today) {
    var e = entryOfDay(m, d, absDay);
    var grade;
    var cls = today ? 'tj-pai--today' : 'tj-pai--mini';

    if (e.级 === '节') {
      /* 节日：朱漆牌，只刻日名 + 节名（无宜忌） */
      return '<article class="tj-pai ' + cls + '" data-grade="节" tabindex="0"' +
        ' data-tip="' + esc(e.名 + '：' + String(e.文 || '')) + '">' +
        '<i class="tj-pai__hole"></i><i class="tj-pai__cord"></i>' +
        '<div class="tj-pai__cols">' +
        '<span class="tj-pai__day">' + tag + '</span>' +
        '<span class="tj-pai__grade">' + esc(e.名) + '</span>' +
        '</div></article>';
    }

    var yiArr = splitItems(e.宜);
    var jiArr = (e.忌 && e.忌 !== '无') ? splitItems(e.忌) : [];
    var tip = e.级 + '　宜 ' + yiArr.join('·') + (jiArr.length ? '　忌 ' + jiArr.join('·') : '');

    if (e.级 === '异') {
      grade = '异';
      var colsY = '<span class="tj-pai__day">' + tag + '</span>' +
        '<span class="tj-pai__grade">' + esc(e.名) + '</span>';
      if (today) {
        colsY += '<span class="tj-pai__yi"><b>宜</b>' + itemsHtml(yiArr, 2) + '</span>';
        if (jiArr.length) colsY += '<span class="tj-pai__ji"><b>忌</b>' + itemsHtml(jiArr, 2) + '</span>';
      }
      return '<article class="tj-pai ' + cls + '" data-grade="' + grade + '" tabindex="0"' +
        ' data-tip="' + esc(tip) + '">' +
        '<i class="tj-pai__hole"></i><i class="tj-pai__cord"></i>' +
        '<div class="tj-pai__cols">' + colsY + '</div></article>';
    }

    grade = e.级;
    var cols = '<span class="tj-pai__day">' + tag + '</span>' +
      '<span class="tj-pai__grade">' + esc(e.级) + '</span>';
    if (today) {
      cols += '<span class="tj-pai__yi"><b>宜</b>' + itemsHtml(yiArr, 2) + '</span>';
      if (jiArr.length) cols += '<span class="tj-pai__ji"><b>忌</b>' + itemsHtml(jiArr, 2) + '</span>';
    }
    return '<article class="tj-pai ' + cls + '" data-grade="' + grade + '" tabindex="0"' +
      ' data-tip="' + esc(tip) + '">' +
      '<i class="tj-pai__hole"></i><i class="tj-pai__cord"></i>' +
      '<div class="tj-pai__cols">' + cols + '</div></article>';
  }

  /* ---------- 悬停/点按提示（明/后日刻字少，宜忌靠它） ---------- */
  var tipEl = null;
  function ensureTip(box) {
    if (tipEl && tipEl.parentNode) return tipEl;
    tipEl = document.createElement('div');
    tipEl.className = 'tj-tip';
    tipEl.hidden = true;
    (document.body || box).appendChild(tipEl);   /* 挂到 body：不被书页 overflow 裁切 */
    return tipEl;
  }
  function bindTips(box) {
    if (!box) return;
    var tip = ensureTip(box);
    function show(el) {
      var t = el.getAttribute('data-tip');
      if (!t) return;
      tip.textContent = t;
      tip.hidden = false;
      var r = el.getBoundingClientRect();
      var pr = box.getBoundingClientRect();
      var vw = window.innerWidth || 400, vh = window.innerHeight || 800;
      /* 先量提示自身宽度，再钳进视口（第三牌贴右缘时不溢出） */
      tip.style.maxWidth = Math.max(80, Math.min(pr.width - 10, vw - 16)) + 'px';
      var tw = tip.offsetWidth || 100;
      var cx = r.left + r.width / 2 - tw / 2;
      cx = Math.max(8, Math.min(cx, vw - tw - 8));
      tip.style.left = cx + 'px';
      /* 垂直：优先牌下方；视口底放不下就翻到牌上方 */
      var th = tip.offsetHeight || 24;
      var ty = r.bottom + 6;
      if (ty + th > vh - 8) ty = Math.max(8, r.top - th - 6);
      tip.style.top = ty + 'px';
    }
    function hide() { tip.hidden = true; }
    Array.prototype.forEach.call(box.querySelectorAll('.tj-pai'), function (el) {
      el.addEventListener('mouseenter', function () { show(el); });
      el.addEventListener('mouseleave', hide);
      el.addEventListener('focus', function () { show(el); });
      el.addEventListener('blur', hide);
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (tip.hidden) show(el); else hide();
      });
    });
    box.addEventListener('click', hide);
  }

  /* ---------- 副行：tj-ling 会往 #lingHuangliNote 写整串（「朱针指当下：X · Y」），
     这里把它按「 · 」拆成段，段间才允许折行；含「无节」的段上朱色。
     纯展示处理，不改任何读取逻辑。 ---------- */
  var noteObs = null;
  function splitNote(note) {
    if (!note) return;
    var raw = note.textContent || '';
    if (!raw || note.getAttribute('data-split') === raw) return;
    var parts = raw.split(/\s*·\s*/).filter(function (x) { return x.trim(); });
    if (parts.length < 2) return;
    note.innerHTML = parts.map(function (s) {
      var cls = /无节/.test(s) ? ' class="al-kong"' : '';
      return '<span' + cls + '>' + esc(s) + '</span>';
    }).join('<i class="al-sep"></i>');
    note.setAttribute('data-split', raw);
  }
  function watchNote(box) {
    var note = document.getElementById('lingHuangliNote');
    if (!note || noteObs) return;
    noteObs = new MutationObserver(function () { splitNote(note); });
    noteObs.observe(note, { childList: true, characterData: true, subtree: true });
  }

  /* 摆动：六段阻尼衰减，越摆越小；transform-origin 在悬绳上（CSS 已设） */
  function swingPai(box) {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    Array.prototype.forEach.call(box.querySelectorAll('.tj-pai'), function (el, i) {
      if (!el.animate) return;
      try {
        el.animate([
          { transform: 'rotate(0deg)' },
          { transform: 'rotate(2.6deg)', offset: 0.16 },
          { transform: 'rotate(-1.9deg)', offset: 0.38 },
          { transform: 'rotate(1.15deg)', offset: 0.58 },
          { transform: 'rotate(-0.62deg)', offset: 0.74 },
          { transform: 'rotate(0.28deg)', offset: 0.87 },
          { transform: 'rotate(-0.1deg)', offset: 0.94 },
          { transform: 'rotate(0deg)' }
        ], {
          duration: 1150,
          delay: i * 70,
          easing: 'cubic-bezier(.26,.62,.28,1)',
          fill: 'both'
        });
      } catch (e) {}
    });
  }

  /* ---------- 渲染：令·左页 #lingHuangli ---------- */
  function render(state) {
    var box = document.getElementById('lingHuangli');
    if (!box) return;
    var r = (state && (state['棠郡'] || state)) || {};
    var ymd = (r.时地 && r.时地['年月日']) || '';
    var p = parseNianYueRi(ymd);
    if (!p) { box.innerHTML = ''; box.hidden = true; return; }
    var t1 = addDays(p.m, p.d, 1);
    var t2 = addDays(p.m, p.d, 2);

    var html = '';
    html += '<section class="tj-hl" aria-label="黄历">';
    html += '<header class="tj-hl__head">' +
      '<h3 class="tj-hl__title block-head">黄历</h3>' +
      '<p class="tj-hl__sub"><span class="al-when" id="lingHuangliNote"></span></p>' +
      '</header>';
    html += '<div class="tj-hl__board">' +
      '<i class="tj-hl__rope"></i>' +
      '<i class="tj-hl__peg tj-hl__peg--l"></i>' +
      '<i class="tj-hl__peg tj-hl__peg--r"></i>' +
      paiHtml('今日', p.m, p.d, p.abs, true) +
      paiHtml('明日', t1.m, t1.d, p.abs + 1, false) +
      paiHtml('后日', t2.m, t2.d, p.abs + 2, false) +
      '</div></section>';

    box.hidden = false;
    box.innerHTML = html;

    /* 轻摆一次（换日/进页）：WAAPI 阻尼振荡，错落 70ms，不触发重排 */
    swingPai(box);
    bindTips(box);
    watchNote(box);
    splitNote(document.getElementById('lingHuangliNote'));
  }

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
