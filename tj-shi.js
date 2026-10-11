/* ==================================================================
   棠郡 · 页「时」渲染器（阶段二）
   ------------------------------------------------------------------
   只做一件事：把适配层给的状态，按工程指令 §四 的版面画出来。
   取值一律走 TJState.getState() 的结果，**不直接摸变量树**。

   字段映射（schema 现有字段 → 版面）：
     时辰环   ← 时地.时辰
     纪年     ← 时地.年月日
     题签     ← 时地.地区 · 时地.地点
     天气     ← 时地.天气
     叙事小记 ← 风云 首条（事 · 一句势），次条以淡墨叠后表示"过去"
     眉批     ← 左页：待续 首条；右页：天气（≤12 字）
     在场     ← 在场（人名 · 身份 · 此刻，点名字跳「人」页）
     期间档   ← 由时辰推出，驱动灯与暗角

   阶段 8 接线前，「节令签」「身边之物」在 schema 里无对应字段，只能墨漫。
   现世界书已注入这两组，本文件改为：
     节令签   ← 棠郡.节令（名 / 状态 / 下一节 / 距下一节）
     身边之物 ← 棠郡.随身（物名 · 何处 · 来路）
   取不到仍渲染墨漫（指令 §3.7）—— 不报错、不留空、不发明变量。
================================================================== */
(function () {
  'use strict';

  var SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  /* 时辰今注（指南 7.3「名用古，注用今」）：小字淡色注明约合今时 */
  var HOUR_NOTE = {
    '子': '约二十三至一时',   '丑': '约一至三时',     '寅': '约三至五时',
    '卯': '约五至七时',       '辰': '约七至九时',     '巳': '约九至十一时',
    '午': '约十一至十三时',   '未': '约十三至十五时', '申': '约十五至十七时',
    '酉': '约十七至十九时',   '戌': '约十九至二十一时', '亥': '约二十一至二十三时'
  };
  /* 时辰 → 氛围档（DESIGN.md §2） */
  var HOUR_BAND = {
    卯: '晨', 辰: '晨',
    巳: '昼', 午: '昼', 未: '昼',
    申: '暮', 酉: '暮',
    戌: '夜', 亥: '夜', 子: '夜',
    丑: '深夜', 寅: '深夜',
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  /* 缺字段的样子：墨漫（指令 §3.7），不留空也不报错 */
  function mo(w) {
    return '<span class="mo-man"' + (w ? ' style="min-width:' + w + 'em"' : '') + '>&nbsp;</span>';
  }
  function cut(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n) + '…' : s;
  }
  /* 节令签兜底（2026-10-04）：变量里没有「节令」这一支时，由 时地.年月日 推。
     认得「丁未年·十月初二」「十月十二」「听棠前十日」三种写法（见 SuilunCal.parseYueRi）。 */
  function deriveJieLing(td) {
    var C = window.SuilunCal;
    if (!C || !C.parseYueRi) return '';
    var p = C.parseYueRi(td && td.年月日);
    if (!p) return '';
    var nf = C.nextFestival(p.month, p.day);
    if (!nf || !nf.f) return '';
    if (nf.gap === 0) return nf.f.name + ' · 正过';
    return nf.f.name + ' · 还有' + (C.numCn ? C.numCn(nf.gap) : nf.gap) + '日';
  }
  /* 2026-10-10 作者：竖排笺上的数字会横倒 —— 「还有33日」的阿拉伯数字
     一律过中文数字（借 SuilunCal.numCn，支持到 99），横排也顺带受益。 */
  function numToCn(s) {
    s = String(s == null ? '' : s);
    if (!/\d/.test(s)) return s;
    var C = window.SuilunCal;
    if (!C || !C.numCn) return s;
    return s.replace(/\d+/g, function (m) { return C.numCn(parseInt(m, 10)) || m; });
  }
  function pick(s, fallback) {
    s = String(s == null ? '' : s).trim();
    return s || fallback;
  }
  function firstOf(rec) {
    if (!rec) return null;
    var ks = Object.keys(rec);
    return ks.length ? { name: ks[0], val: rec[ks[0]] || {} } : null;
  }
  function entriesOf(rec) {
    if (!rec) return [];
    return Object.keys(rec).map(function (k) { return { name: k, val: rec[k] || {} }; });
  }

  function render(state) {
    if (!state) return;
    var r = state.棠郡 || {};
    var td = r.时地 || {};

    /* ---- 时辰环 ---- */
    var chenChar = String(td.时辰 || '').replace(/时$/, '').trim().slice(0, 1);
    var idx = SHICHEN.indexOf(chenChar);
    var zi = document.getElementById('shiChen');
    if (zi) zi.textContent = chenChar || '';
    /* 时辰今注：认得出才注，认不出留白（诚实缺省，同墨漫纪律） */
    var hn = document.getElementById('shiHourNote');
    if (hn) hn.textContent = idx >= 0 ? (chenChar + '时 · ' + HOUR_NOTE[chenChar]) : '';
    if (window.TJBook) window.TJBook.drawHourRing(idx < 0 ? -1 : idx);
    if (idx < 0 && chenChar && window.console) {
      console.warn('[棠郡] 时辰无法识别：', td.时辰);
    }

    /* ---- 氛围档（未手动锁定时才自动跟） ---- */
    if (window.TJBook && !window.TJBook.isManualHour() && HOUR_BAND[chenChar]) {
      window.TJBook.setHour(HOUR_BAND[chenChar]);
    }

    /* ---- 各页地脚的「酉时」：跟数据走，不写死 ---- */
    if (chenChar) {
      var feet = document.querySelectorAll('.js-foot-hour');
      for (var fi = 0; fi < feet.length; fi++) feet[fi].textContent = chenChar + '时';
    }

    /* ---- 纪年 / 题签 / 天气 ---- */
    var jinian = document.getElementById('shiJinian');
    if (jinian) jinian.innerHTML = td.年月日 ? esc(td.年月日) : mo(8);

    var place = document.getElementById('shiPlace');
    if (place) {
      var loc = [td.地区, td.地点].filter(Boolean).join(' · ');
      place.innerHTML = loc ? esc(loc) : mo(10);
    }
    var sky = document.getElementById('shiSky');
    if (sky) sky.innerHTML = td.天气 ? esc(td.天气) : mo(4);

    /* ---- 眉批：左页待续首条，右页天气 ---- */
    var mL = document.getElementById('shiMeipiL');
    if (mL) {
      var d1 = firstOf(r.待续);
      mL.innerHTML = d1
        ? esc(cut(d1.name + '：' + (d1.val.进展 || ''), 12))
        : mo(6);
    }
    var mR = document.getElementById('shiMeipiR');
    if (mR) mR.innerHTML = td.天气 ? esc(cut(td.天气, 12)) : mo(6);

    /* ---- 叙事小记：风云首条为主，次条淡墨叠后 ---- */
    var fy = entriesOf(r.风云);
    var p1 = document.getElementById('shiProse1');
    var p2 = document.getElementById('shiProse2');
    if (p1) {
      p1.innerHTML = fy[0]
        ? esc(cut(fy[0].name + ' · ' + (fy[0].val.进展 || ''), 60))
        : mo(18);
    }
    if (p2) {
      p2.innerHTML = fy[1]
        ? esc(cut(fy[1].name + ' · ' + (fy[1].val.进展 || ''), 60))
        : '';
      p2.style.display = fy[1] ? '' : 'none';
    }

    /* ---- 在场：一行一人，点名字跳「人」页（阶段三用它展开扇面） ----
       人数不设上限 —— 超 4 人折叠为夹页（阶段 7 延展性审计） */
    var zc = document.getElementById('shiZaiChang');
    if (zc) {
      var ZC_PREVIEW = 4;
      var zcMore = document.getElementById('shiZaiChangMore');
      var rows = entriesOf(r.在场).map(function (e) {
        var who = esc(e.name);
        return '<div class="row" data-person="' + who + '">' +
          '<span class="dot"></span><span class="k">' + who + '</span>' +
          '<span class="v">' + esc([e.val.身份, e.val.此刻].filter(Boolean).join(' · ')) + '</span></div>';
      });
      function paint(list) { zc.innerHTML = list.join(''); bindRows(); }
      function bindRows() {
        zc.querySelectorAll('[data-person]').forEach(function (row) {
          row.style.cursor = 'pointer';
          row.addEventListener('click', function () {
            var who = row.getAttribute('data-person');
            /* 有立绘的人有她的整页（人·传）；没有的，就回到群像 */
            if (window.TJLex && window.TJLex.PORTRAIT[who]) {
              window.TJBook.person = who;
              window.TJBook.showPage('人·传', true);
            } else {
              window.TJBook.showPage('人', true);
            }
          });
        });
      }
      if (!rows.length) {
        zc.innerHTML = '<div class="row"><span class="v">' + esc('四下无人') + '</span></div>';
        if (zcMore) zcMore.hidden = true;
      } else {
        paint(rows.slice(0, ZC_PREVIEW));
        if (zcMore) {
          var extra = rows.length - ZC_PREVIEW;
          if (extra > 0) {
            zcMore.hidden = false;
            zcMore.textContent = '另 ' + extra + ' 人';
            zcMore.onclick = function () {
              var open = zc.dataset.open === '1';
              zc.dataset.open = open ? '0' : '1';
              paint(open ? rows.slice(0, ZC_PREVIEW) : rows);
              zcMore.textContent = open ? '另 ' + extra + ' 人' : '收起';
            };
          } else {
            zcMore.hidden = true;
            zcMore.onclick = null;
          }
        }
      }
    }

    /* ---- 身边之物 ← 棠郡.随身（世界书 2026-10-03 已注入） ----
       格式：物名 · 收在哪 · 怎么到手的。空着是常态 → 回退墨漫，不告警。 */
    var sb = document.getElementById('shiShenBian');
    if (sb) {
      var carry = entriesOf(r.随身);
      if (carry.length) {
        sb.innerHTML = carry.map(function (e) {
          return '<div class="row"><span class="k">' + esc(e.name) + '</span>' +
            '<span class="v">' + esc([e.val.何处, e.val.来路].filter(Boolean).join(' · ')) + '</span></div>';
        }).join('');
      } else {
        sb.innerHTML = '<div class="row"><span class="k">身边</span><span class="v">' + mo(12) + '</span></div>';
      }
    }

    /* ---- 节令签 ← 棠郡.节令（世界书 2026-10-03 已注入） ----
       贴笺是竖排的，只放一行短句。不在节令期内（名=节间）就报下一个节令。
       「令」页的岁轮仍按阶段四从 时地.年月日 推导 —— 两条路各自独立，
       节令变量只管这张贴笺，不干扰岁轮。 */
    var jq = document.getElementById('shiJieqian');
    if (jq) {
      var jl = r.节令 || {};
      var jn = String(jl.名 || '').trim();
      if (jn && jn !== '节间') {
        jq.innerHTML = esc(jn) + ' · ' + esc(jl.状态 || '');
      } else if (jl.下一节) {
        jq.innerHTML = esc(jl.下一节) + ' · ' + esc(numToCn(jl.距下一节 || ''));
      } else {
        /* 2026-10-04 兜底：老存档的 stat_data 里**根本没有「节令」这一支**
           （新卡的 InitVar 才有；已开的会话不会自动补），此时由 时地.年月日 推
           —— 复用岁轮的日历模块，推得出就写「下一节 · 还有N日」，推不出才留白。 */
        var fb = deriveJieLing(r.时地 || {});
        jq.innerHTML = fb ? esc(fb) : mo(6);
      }
    }
  }

  /* ---- 注册到外壳：切到「时」页时由 tj-book 调用 ---- */
  window.TJRender = window.TJRender || {};
  window.TJRender['时'] = render;

  /* ---- 取数：场景可从 ?scenario= 指定（离线预览用） ---- */
  function scenarioFromUrl() {
    var m = /[?&]scenario=([^&]+)/.exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }
  var scenario = scenarioFromUrl();
  function load(why) {
    return window.TJState.getState({ scenario: scenario }).then(function (state) {
      window.TJ_STATE = state;
      var src = document.querySelector('.toolbar .src');
      if (src) src.textContent = '数据源：' + state._source + (state._preview ? '（预览）' : '');
      /* 翻页/换页期间重建过 DOM，所以每次拿到数据都重画当前页。
         「时」页不再由这里独占 —— 外壳 renderCurrent() 会派发给当前页。 */
      if (window.TJBook) window.TJBook.renderCurrent();
      return state;
    }).catch(function (e) {
      /* 不再吞掉：调过 TJ_STATE 后外壳已知"这一轮读完了（失败）"，
         但状态保持 undefined，页面走各自的"读不到"分支。 */
      console.warn('[棠郡] 取数失败（' + (why || '') + '）：', e);
    });
  }
  /* TJ_READY 供外壳（tj-book）在状态未就绪时挂队 —— 见 renderCurrent() */
  window.TJ_READY = load('首次');

  /* 桥喊 poke（编辑正文 / 重说 / 删楼层 / 换聊天）→ 重取本楼快照并重画。
     否则改完正文，册子还停在上一次读到的那份状态。 */
  if (window.TJState.onPoke) {
    window.TJState.onPoke(function () { load('楼层变动'); });
  }
})();
