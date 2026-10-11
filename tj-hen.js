/* ==================================================================
   棠郡 · 页「痕」渲染器（阶段五：世界记住的事）
   ------------------------------------------------------------------
   取值一律走 TJState.getState()；静态痕迹走 TJLex.TRACES。

   三栏（指令 §四）与数据源：
     物 ← 棠郡.痕迹（这一轮新留下的：所在 · 留了什么 · 新旧）
          ＋ TJLex.TRACES（世界的静态锚点：驷亭刻名、货栈酒渍、黍墟的坟…）
     人 ← 棠郡.流言（风声 · 传自 · 是否证实）：墨点连线，
          线的粗细浓淡 = 走样几分（已证实线实 / 未证实线淡 / 已破线断）
          无流言数据时退回风云的「在传的事」，线尽头墨漫 —— 不编走样程度
     欠 ← 待续（事 · 悬在哪）+ 人情里的欠（人 · 欠 · 搁置），
          溢出折叠为夹页

   注：「痕迹」「流言」两组由世界书 2026-10-03 注入，本阶段接线；
       此前因 schema 无此字段，物栏只有静态锚点、人栏尽头是墨漫。
================================================================== */
(function () {
  'use strict';

  var L = window.TJLex;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function mo(w) {
    return '<span class="mo-man"' + (w ? ' style="min-width:' + w + 'em"' : '') + '>&nbsp;</span>';
  }
  function entriesOf(rec) {
    if (!rec) return [];
    return Object.keys(rec).map(function (k) { return { name: k, val: rec[k] || {} }; });
  }

  var PREVIEW = 4;
  var rumorNoted = false;

  /* ---- 物：这一轮新留下的痕迹 + 世界的静态锚点 ----
     动态 ← 棠郡.痕迹（所在 · 留了什么 · 新旧），动态的排前面（新留的更要紧）；
     静态 ← TJLex.TRACES（驷亭刻名、货栈酒渍…世界本来就在那儿的东西）。
     两者不冲突：世界书里也写明「一贯就在那儿的旧刻不进痕迹」。 */
  function renderTraces(r) {
    var el = document.getElementById('henTraces');
    if (!el) return;
    var dyn = entriesOf(r.痕迹).map(function (e) {
      var fresh = String(e.val.新旧 || '');
      return '<div class="trace-slip is-dyn' + (fresh === '新留' ? ' is-new' : '') + '">' +
        '<span class="w">' + esc(e.name) + '</span>' + esc(e.val.留了什么 || '') +
        (fresh ? '<span class="fresh">' + esc(fresh) + '</span>' : '') + '</div>';
    });
    var stat = L.TRACES.map(function (t) {
      return '<div class="trace-slip' + (t.kind === '刻' ? ' is-carved' : '') + '">' +
        '<span class="w">' + esc(t.where) + '</span>' + esc(t.what) + '</div>';
    });
    el.innerHTML = dyn.concat(stat).join('');
  }

  /* ---- 人：墨点连线（流言；线的粗细浓淡 = 走样几分） ----
     有流言变量时以它为主：谁传的（传自）+ 走样几分（是否证实 → 线的样式）。
       已证实 → 线实而浓；未证实 → 线细而淡；已破 → 线断成虚。
     没有流言数据时退回风云的「在传的事」，线尽头仍是墨漫 ——
     「传到第几层」没数据就不编（指令 §九）。 */
  function renderRumors(r) {
    var el = document.getElementById('henRumors');
    if (!el) return;

    var rumors = entriesOf(r.流言);
    if (rumors.length) {
      el.innerHTML = rumors.map(function (e) {
        var st = String(e.val.是否证实 || '未证实');
        var cls = st === '已证实' ? 'is-solid' : (st === '已破' ? 'is-broken' : 'is-faint');
        return '<div class="rumor ' + cls + '" title="流言 · ' + esc(st) + '">' +
          '<span class="rdot"></span>' +
          '<span class="rwhat">' + esc(e.name) + '</span>' +
          '<span class="rline"></span>' +
          '<span class="rend">' + esc(e.val.传自 || '') + '</span>' +
          '</div>';
      }).join('');
      return;
    }

    var fy = entriesOf(r.风云);
    if (!fy.length) {
      el.innerHTML = '<div class="row"><span class="v">坊间无风声</span></div>';
      return;
    }
    el.innerHTML = fy.map(function (e) {
      return '<div class="rumor">' +
        '<span class="rdot"></span>' +
        '<span class="rwhat">' + esc(e.name) + '</span>' +
        '<span class="rline"></span>' +
        '<span class="rend">' + mo(4) + '</span>' +
        '</div>';
    }).join('');
    if (!rumorNoted && window.console) {
      rumorNoted = true;
      console.warn('[棠郡] 本轮无「流言」数据，人栏退回风云的「在传的事」，连线尽头为墨漫。');
    }
  }

  /* ---- 欠：待续 + 人情欠；夹页折叠 ---- */
  function renderOwe(r) {
    var el = document.getElementById('henOwe');
    var moreEl = document.getElementById('henOweMore');
    if (!el) return;

    var rows = entriesOf(r.待续).map(function (e) {
      return '<div class="row"><span class="k">' + esc(e.name) + '</span>' +
        '<span class="v">' + esc(e.val.进展 || '悬着') + '</span></div>';
    });
    entriesOf(r.人情).forEach(function (e) {
      var owe = String(e.val.欠 || '');
      if (!owe || owe === '无') return;
      rows.push('<div class="row"><span class="k">' + esc(e.name) + '</span>' +
        '<span class="v">' + esc(owe + (e.val.搁置 ? '　·　' + e.val.搁置 : '')) + '</span></div>');
    });

    if (!rows.length) {
      el.innerHTML = '<div class="row"><span class="v">眼下无事悬着</span></div>';
      if (moreEl) moreEl.hidden = true;
      return;
    }
    el.innerHTML = rows.slice(0, PREVIEW).join('');
    if (!moreEl) return;
    var n = rows.length - PREVIEW;
    if (n > 0) {
      moreEl.hidden = false;
      moreEl.textContent = '另 ' + n + ' 条';
      moreEl.onclick = function () {
        var open = el.dataset.open === '1';
        el.dataset.open = open ? '0' : '1';
        el.innerHTML = open ? rows.slice(0, PREVIEW).join('') : rows.join('');
        moreEl.textContent = open ? '另 ' + n + ' 条' : '收起';
      };
    } else {
      moreEl.hidden = true;
      moreEl.onclick = null;
    }
  }

  function render(state) {
    if (!state) return;
    var r = state.棠郡 || {};
    renderTraces(r);
    renderRumors(r);
    renderOwe(r);
  }

  window.TJRender = window.TJRender || {};
  window.TJRender['痕'] = render;
})();
