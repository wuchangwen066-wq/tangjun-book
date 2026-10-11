/* ==================================================================
   棠郡 · 年谱页渲染器（WP7.5 · 2026-10-10 大改，作者定版式）
   ------------------------------------------------------------------
   一册最后一页，分两栏：
     左页 行迹（小总结）= 棠郡.业.行迹 —— **一段只记一日**，一叶排三日至五日，
                          记满一叶再翻（AI 过夜时追加一段，id77 定规）
     右页 年谱（大总结）= 棠郡.年谱   —— **一叶只排一篇**，一篇是一次大总结
                          （约三十五楼一回，写法同「传」；一叶写不下 UI 自动分篇）

   兼容旧数据：
     行迹 认 [{date, entries:[{时辰,词}]}]（系统维护形态）与「【十月初十】…」串；
     年谱 认 [string]（每条即一篇）—— 若数组里全是短句（旧的一句一事格式），
     会自动并作一篇渲染，不会一句占一叶。

   纪律（沿用 tj-daylog.js）：
     · 普通 script，非 ES module（酒馆 srcdoc iframe / file:// 下 module 会挂）
     · 不产生数据，只**呈现**；空则显空态，**不造假数据**
     · 不直接摸变量树 —— 一律走 window.TJ_STATE
     · 禁裸 Math.random（本页无随机，仅确定性分页）
================================================================== */
(function () {
  'use strict';

  var DAYS_PER_LEAF = 6;              /* 行迹每叶排六日（2026-10-10 作者：要多写一天），排满即翻 */
  window.TJNianpuJumpLatest = true;   /* 首次渲染直接落最新 */
  var SHORT_LINE = 60;                /* 年谱条短于此且条数≥4 → 视为旧格式并作一篇 */
  var pos = { nianpu: 0, xingji: 0 };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* 一条 → { d:日期, t:正文 }。认「【十月初二】…」「[十月初二]…」「十月初二·…」；
     都没有就整条当正文，不硬拆。 */
  function splitOne(line) {
    var s = String(line == null ? '' : line).trim();
    if (!s) return null;
    var m = /^\s*[【\[]([^\]】]{1,14})[】\]]\s*([\s\S]*)$/.exec(s);
    if (m) return { d: m[1].trim(), t: m[2].trim() || m[1].trim() };
    m = /^\s*([^·｜|]{2,10}?)\s*[·｜|]\s*([\s\S]+)$/.exec(s);
    if (m && /[月日年]/.test(m[1])) return { d: m[1].trim(), t: m[2].trim() };
    return { d: '', t: s };
  }

  /* ---- 行迹 → 按日成段 [{d, t}] ---- */
  function toDays(raw) {
    var days = [];
    if (Array.isArray(raw)) {
      raw.forEach(function (d) {
        if (d == null) return;
        if (typeof d === 'string') { var m = splitOne(d); if (m) days.push(m); return; }
        if (typeof d !== 'object') return;
        var date = d.date || d['日'] || d['年月日'] || '';
        var list = d.entries || d['条'] || d['事'] || d['词'] || '';
        var text = '';
        if (typeof list === 'string') text = list;
        else if (Array.isArray(list)) {
          text = list.map(function (e) {
            if (e == null) return '';
            if (typeof e === 'string') return e;
            var w = e['词'] || e['事'] || e['记'] || '';
            var h = e['时辰'] || e['时'] || '';
            return w ? (h ? h + w : w) : '';
          }).filter(Boolean).join('，');
        }
        if (!text && !date) return;
        days.push({ d: date, t: text });
      });
    } else if (raw) {
      String(raw).split(/\n+/).forEach(function (s) { var m = splitOne(s); if (m) days.push(m); });
    }
    return days;
  }

  /* ---- 年谱 → 篇 [essayString] ---- */
  function toEssays(raw) {
    var out = [];
    if (Array.isArray(raw)) {
      raw.forEach(function (d) {
        if (d == null) return;
        if (typeof d === 'string') { if (d.trim()) out.push(d.trim()); return; }
        if (typeof d !== 'object') return;
        var t = d['文'] || d['text'] || d['词'] || d['事'] || '';
        if (t) out.push(String(t).trim());
      });
      /* 旧格式甄别：全是短句（一句一事）且条数≥4 → 并作一篇，免得一句占一叶 */
      if (out.length >= 4 && out.every(function (s) { return s.length < SHORT_LINE; })) {
        out = [out.join('\n')];
      }
    } else if (raw) {
      out = String(raw).split(/\n{2,}/).filter(function (s) { return s.trim(); });
    }
    return out;
  }

  function pick(state, which) {
    var s = state || window.TJ_STATE || null;
    if (!s) return [];
    var T = s['棠郡'] || s;
    var ye = T['业'] || {};
    if (which === 'xingji') return toDays(ye['行迹']);
    return toEssays(T['年谱']);
  }

  /* ---- 行迹：一日一段 ---- */
  function dayHtml(it) {
    return '<div class="nianpu-day">' +
      (it.d ? '<div class="nianpu-day-head">' + esc(it.d) + '</div>' : '') +
      '<div class="nianpu-day-text">' + esc(it.t) + '</div></div>';
  }

  /* ---- 年谱：一篇一篇（写法、字体、界行全部照「人·传」的 cz-bio-p，2026-10-10 作者定） ---- */
  function essayHtml(essay) {
    var ps = String(essay).split(/\n+/).map(function (p) { return p.trim(); }).filter(Boolean);
    return '<div class="nianpu-essay">' +
      ps.map(function (p) { return '<p class="cz-bio-p">' + esc(p) + '</p>'; }).join('') +
      '</div>';
  }

  function paint(key, items, emptyText, unit, itemHtml, perLeaf) {
    var box = document.getElementById(key + 'List');
    var sub = document.getElementById(key + 'Sub');
    var cnt = document.getElementById(key + 'FootCount');
    var pager = document.getElementById(key + 'Pager');
    var pg = document.getElementById(key + 'Page');
    var pv = document.getElementById(key + 'Prev');
    var nx = document.getElementById(key + 'Next');
    if (!box) return;

    if (!items.length) {
      box.innerHTML = '<div class="nianpu-empty">' + esc(emptyText) + '</div>';
      if (sub) sub.textContent = '尚无';
      if (cnt) cnt.textContent = '零';
      if (pager) pager.hidden = true;
      return;
    }

    /* 2026-10-10 作者：行迹要填满纸页，不许越写越少 ——
       叶数按上限算，但每叶均摊：10 日不再切 6+4（末叶半页空），
       改 5+5 两叶都满。年谱一叶一篇不受影响。 */
    var pages = Math.max(1, Math.ceil(items.length / perLeaf));
    var per = perLeaf <= 1 ? 1 : Math.ceil(items.length / pages);
    /* 2026-10-10 作者：点开谱页直接落在最新一叶/最新一篇（当前时间段总结）。
       标记由 tj-book.showPage('谱') 与首挂时置位，翻过页就清，不抢手动翻页。 */
    if (window.TJNianpuJumpLatest) pos[key] = pages - 1;
    if (pos[key] >= pages) pos[key] = pages - 1;
    if (pos[key] < 0) pos[key] = 0;
    var slice = items.slice(pos[key] * per, pos[key] * per + per);

    box.innerHTML = slice.map(itemHtml).join('');
    if (sub) sub.textContent = '共 ' + items.length + ' ' + unit;
    if (cnt) cnt.textContent = String(items.length);
    if (pager) {
      pager.hidden = pages <= 1;
      if (pg) pg.textContent = '第 ' + (pos[key] + 1) + ' / ' + pages + ' 叶';
      if (pv) pv.disabled = pos[key] <= 0;
      if (nx) nx.disabled = pos[key] >= pages - 1;
    }
  }

  function bind(key) {
    var pv = document.getElementById(key + 'Prev');
    var nx = document.getElementById(key + 'Next');
    if (pv) pv.addEventListener('click', function () { pos[key]--; render(window.TJ_STATE); });
    if (nx) nx.addEventListener('click', function () { pos[key]++; render(window.TJ_STATE); });
  }

  function render(state) {
    paint('xingji', pick(state, 'xingji'),
      '尚无行迹。过了夜，这里落一段；一段只记一日，写满一叶再翻。', '日',
      dayHtml, DAYS_PER_LEAF);
    paint('nianpu', pick(state, 'nianpu'),
      '尚无纪事。约三十五楼一回，这里落一篇大总结；一叶只排一篇。', '篇',
      essayHtml, 1);
    window.TJNianpuJumpLatest = false;   /* 两栏都落好位了，还给手动翻页 */
  }

  /* 注册给外壳（core/tj-book.js 的 RENDER 表） */
  window.TJRender = window.TJRender || {};
  window.TJRender['谱'] = render;
  bind('nianpu'); bind('xingji');

  if (window.TJ_STATE !== undefined) { render(window.TJ_STATE); }
  else if (window.TJ_READY) {
    window.TJ_READY.then(function () { render(window.TJ_STATE); },
                         function () { render(window.TJ_STATE); });
  }
})();
