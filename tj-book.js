/* ==================================================================
   棠郡 · 一册（阶段一外壳运行时）
   ------------------------------------------------------------------
   阶段一只做三件事：翻页、页签、时辰档氛围。不接变量（阶段二起）。

   纪律：
     · 普通 script，非 ES module（酒馆 srcdoc iframe / file:// 下 module 会挂）
     · 不直接摸变量树 —— 数据一律走 core/tj-state.js 的 getState()
     · 动效只用 transform / opacity，时长取指令 §3.6 的定值
================================================================== */
(function () {
  'use strict';

  var book = document.getElementById('book');
  var root = document.documentElement;
  var tabs = [].slice.call(document.querySelectorAll('.tab'));
  var pages = [].slice.call(document.querySelectorAll('.page'));
  var leaf = document.getElementById('leaf');
  var TURN = 700;                            /* 翻页 700ms（指令 §3.6） */
  /* 2026-10-10 加「谱」（年谱页，WP7.5）：进 ORDER 与 SPREADS，翻页动画才生效 */
  var ORDER = ['时', '人', '令', '痕', '业', '谱'];   /* 页签顺序（键盘用） */
  /* 书页的真实先后（含「人·传」这张不进页签栏的页）：
     决定翻页的方向 —— 往后翻叶子向左倒，往前翻叶子从左边立起 */
  var SPREADS = ['时', '人', '人·传', '令', '痕', '业', '谱'];

  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function narrow() {
    return window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
  }

  /* 各页的渲染器由对应阶段的脚本注册（TJRender['时'] = fn(state)） */
  var RENDER = (window.TJRender = window.TJRender || {});
  function cur() { return book.getAttribute('data-current') || '时'; }
  /* 取数是异步的（MVU / postMessage / mock），切页是同步的 ——
     数据还没到时切页会拿 undefined 去渲染，页面就空着（快速点页签必现）。
     所以状态未就绪时挂到 TJ_READY 上，等到了再渲染这一页。 */
  function renderCurrent() {
    var fn = RENDER[cur()];
    if (!fn) return;
    if (window.TJ_STATE === undefined && window.TJ_READY) {
      window.TJ_READY.then(function () { paint(fn); }, function () { paint(fn); });
      return;
    }
    /* 2026-10-10 作者：业页信息锁定位置不许乱动 ——
       ① 状态快照没变就跳过重渲染（不再整页重建、滚动归顶）；
       ② 确要重画，先把当前页各 .body 的滚动位置取回来。 */
    var h = hashState();
    if (lastPaint.key === cur() && lastPaint.hash === h) return;
    var saved = [].slice.call(document.querySelectorAll('.page.is-active .body'))
      .map(function (b) { return b.scrollTop; });
    paint(fn);
    [].slice.call(document.querySelectorAll('.page.is-active .body')).forEach(function (b, i) {
      if (saved[i]) b.scrollTop = saved[i];
    });
    lastPaint.key = cur(); lastPaint.hash = h;
  }
  function hashState() {
    try { return JSON.stringify(window.TJ_STATE); }
    catch (e) { return String(Math.random()); }
  }
  var lastPaint = { key: null, hash: '' };
  function paint(fn) {
    try { fn(window.TJ_STATE); } catch (e) { console.warn('[棠郡] 渲染失败：', e); }
  }
  function sectionAt(key, side) {
    return document.querySelector('.page-' + side + '[data-tab="' + key + '"]');
  }

  /* 2026-10-10 作者：业页信息锁定位置不许乱动。
     关键：摘 is-active（页面被隐藏）那一刻浏览器就会把 scrollTop 清零，
     所以必须在 toggle 之前把滚动存进持久表，落定后还给目标页。 */
  var pageTops = {};
  function swapTo(key) {
    pages.forEach(function (p) {
      if (!p.classList.contains('is-active')) return;
      var b = p.querySelector('.body');
      if (b) pageTops[p.getAttribute('data-tab')] = b.scrollTop;
    });
    pages.forEach(function (p) {
      p.classList.toggle('is-active', p.getAttribute('data-tab') === key);
    });
    tabs.forEach(function (t) {
      /* 「人·传」属于「人」：页签高亮跟过去 */
      var on = t.getAttribute('data-tab') === key ||
               (key === '人·传' && t.getAttribute('data-tab') === '人');
      t.setAttribute('aria-selected', String(on));
    });
    book.setAttribute('data-current', key);
    renderCurrent();
    var top = pageTops[key];
    if (top) {
      var bp = sectionAt(key, 'left'), bq = sectionAt(key, 'right');
      [bp, bq].forEach(function (sec) {
        if (!sec) return;
        var b = sec.querySelector('.body');
        if (b && b.scrollHeight > b.clientHeight) b.scrollTop = top;
      });
    }
  }

  /* ---------- 翻页：真书页 ----------
     一张叶子带正反两面：正面 = 当前右页，背面 = 下一张左页。
     往后翻：叶子从右倒向左，落定后背面盖在左页上，右页露出下一张。
     往前翻：叶子从左立起转向右，落定时正面（上一张右页）盖回右边。
     叶面克隆自真实页节点（剥掉 id，避免重名），只在 700ms 翻动期间存在。 */
  var turning = false;
  function showPage(key, animate) {
    if (turning || key === cur()) return;
    /* 2026-10-10 作者：点开谱页要直接落在当前时间段的总结上，不必一叶叶翻 */
    if (key === '谱') window.TJNianpuJumpLatest = true;
    var curKey = cur();
    var doAnim = animate && !reduced() && !narrow() && !!leaf;
    var from = SPREADS.indexOf(curKey), to = SPREADS.indexOf(key);
    if (!doAnim || from < 0 || to < 0 || from === to) { swapTo(key); return; }

    var curL = sectionAt(curKey, 'left'), curR = sectionAt(curKey, 'right');
    var nextL = sectionAt(key, 'left'), nextR = sectionAt(key, 'right');
    if (!curL || !curR || !nextL || !nextR) { swapTo(key); return; }

    turning = true;
    var forward = to > from;
    var front = leaf.querySelector('.leaf-front');
    var back = leaf.querySelector('.leaf-back');

    /* 先渲染目标页：否则翻开的那一瞬间露出来的是空纸 */
    var rf = RENDER[key];
    if (rf) { try { rf(window.TJ_STATE); } catch (err) { console.warn('[棠郡] 预渲染失败：', err); } }

    if (forward) {
      nextR.classList.add('is-active');    /* 右槽先换上下一张（起初被叶子盖住） */
      curR.classList.remove('is-active');
      fillFace(front, curR);
      fillFace(back, nextL);
    } else {
      /* 左槽先换上上一张（起初被立在左边的叶子盖住），旧左页必须同时撤下 ——
         否则三张激活页挤进 flex 两槽，往回翻整个版面错乱（已踩过的坑）
         2026-10-10 二修（作者）：叶面正面载**新右页**的字——真书回翻时，
         翻过去的叶子另一面本来就是新的一页，字随叶从书脊扫过来落定；
         落定时右槽在叶下换真身、掀叶零突变。上一版载旧右页克隆，
         掀叶瞬间右槽弹页（作者报的"先 A 字后弹 B 字"），废。 */
      nextL.classList.add('is-active');
      curL.classList.remove('is-active');
      fillFace(front, nextR);
      fillFace(back, curL);
    }

    leaf.classList.add('is-on');
    leaf.style.transition = 'none';
    leaf.style.transform = forward ? 'rotateY(0deg)' : 'rotateY(-180deg)';
    void leaf.offsetWidth;                 /* 强制回流，让起始角先生效 */
    leaf.style.transition = '';
    leaf.style.transform = forward ? 'rotateY(-180deg)' : 'rotateY(0deg)';

    setTimeout(function () {
      swapTo(key);
      leaf.classList.remove('is-on');
      leaf.style.transition = 'none';
      leaf.style.transform = 'rotateY(0deg)';
      void leaf.offsetWidth;
      leaf.style.transition = '';
      front.innerHTML = '';
      back.innerHTML = '';
      turning = false;
    }, TURN + 40);
  }

  function fillFace(face, section) {
    face.innerHTML = '';
    var c = section.cloneNode(true);
    /* 2026-10-10 三修（作者报"翻页时排版从不对齐切到对齐"）：
       旧版把克隆里的 HTML id 全剥掉 —— 但版式层有 #id 选择器
       （#yeSlots .k 的 4.5em 对齐柱、#daylogYe 等），id 一剥样式就失配，
       叶面排版整体变位，落定换真页再"跳回"对齐。
       现在**保留 HTML id**：leaf 在 DOM 里排在 spread 之后（index.html 541 行），
       getElementById 仍先命中真身，不会串渲染；CSS id 选择器则两份都命中，
       叶面与真页逐像素同构。SVG 内部 id 照旧加后缀防 url(#…) 撞车。 */
    var svgIds = [].slice.call(c.querySelectorAll('[id]')).filter(function (n) {
      return n.namespaceURI === 'http://www.w3.org/2000/svg';
    });
    var map = {};
    svgIds.forEach(function (n) {
      var old = n.getAttribute('id');
      map[old] = old + '__leaf';
      n.setAttribute('id', map[old]);
    });
    if (svgIds.length) {
      [].slice.call(c.querySelectorAll('*')).forEach(function (n) {
        ['fill', 'stroke', 'filter', 'clip-path', 'mask', 'href'].forEach(function (attr) {
          var v = n.getAttribute && n.getAttribute(attr);
          if (v && v.indexOf('#') >= 0) {
            n.setAttribute(attr, v.replace(/#([\w-]+)/g, function (m, id) {
              return map[id] ? '#' + map[id] : m;
            }));
          }
        });
      });
    }
    c.classList.add('is-active');
    face.appendChild(c);
  }

  tabs.forEach(function (t) {
    t.addEventListener('click', function () { showPage(t.getAttribute('data-tab'), true); });
  });

  /* 键盘：左右方向键换页（不进「人·传」），1–4 直达 */
  document.addEventListener('keydown', function (e) {
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    /* 「人·传」是夹在书里的页：往左先回群像，往右才出到「令」 */
    if (cur() === '人·传' && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) {
      showPage('人', true); e.preventDefault(); return;
    }
    var i = ORDER.indexOf(cur() === '人·传' ? '人' : cur());
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      showPage(ORDER[(i + 1) % ORDER.length], true); e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      showPage(ORDER[(i + ORDER.length - 1) % ORDER.length], true); e.preventDefault();
    } else if (/^[1-6]$/.test(e.key)) {   /* 1–6 直达（加「谱」后由 1–4 放宽） */
      showPage(ORDER[Number(e.key) - 1], true); e.preventDefault();
    } else if (e.key === 'Escape' && cur() === '人·传') {
      showPage('人', true); e.preventDefault();
    }
  });

  /* ---------- 时辰档：只改氛围变量，不动版式 ----------
     默认由「时辰」变量驱动；一旦手动点过调试按钮，就以手动为准
     （免得数据刷新把用户的观察档位顶掉）。 */
  var hourBtns = [].slice.call(document.querySelectorAll('.toolbar [data-hour]'));
  var manualHour = false;
  function setHour(h) {
    root.setAttribute('data-hour', h);
    hourBtns.forEach(function (x) { x.classList.toggle('is-on', x.getAttribute('data-hour') === h); });
  }
  hourBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      manualHour = true;
      setHour(b.getAttribute('data-hour'));
    });
  });

  /* ---------- 时辰环：十二刻 + 当前段朱描 + 一点灯火 ---------- */
  var SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  function polar(cx, cy, r, deg) {
    var a = (deg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  function drawHourRing(now) {
    var g = document.getElementById('hourTicks');
    if (!g) return;
    var NS = 'http://www.w3.org/2000/svg';
    g.innerHTML = '';
    SHICHEN.forEach(function (zi, i) {
      var deg = i * 30;
      var p1 = polar(120, 120, 78, deg), p2 = polar(120, 120, 92, deg);
      var ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', p1[0]); ln.setAttribute('y1', p1[1]);
      ln.setAttribute('x2', p2[0]); ln.setAttribute('y2', p2[1]);
      ln.setAttribute('class', 'tick' + (i === now ? ' is-now' : ''));
      g.appendChild(ln);

      var tp = polar(120, 120, 62, deg);
      var tx = document.createElementNS(NS, 'text');
      tx.setAttribute('x', tp[0]); tx.setAttribute('y', tp[1] + 4);
      tx.setAttribute('text-anchor', 'middle');
      tx.setAttribute('font-size', '14');
      tx.setAttribute('font-family', 'Noto Serif SC, serif');
      /* 地支字义是"读"的，不是装饰 —— 灰墨太淡（.55）在纸上只有 3:1，提到 .72 */
      tx.setAttribute('fill', i === now ? '#8f2a23' : 'rgba(31,27,22,.72)');
      tx.textContent = zi;
      g.appendChild(tx);
    });

    /* 当前段（2026-10-06 作者裁定）：朱弧与金点整体撤下 —— 当前时辰由
       红刻度 + 红地支字 表达，环面回到纯净；解析不出时辰同样留白（指令 §四）。 */
    var arc = document.getElementById('hourArc');
    var dot = document.querySelector('.hour-ring .lamp-dot');
    if (arc) arc.style.display = 'none';
    if (dot) dot.style.display = 'none';
  }

  /* ---------- 地脚朱印：**收纳进书**（作者 2026-10-04 定） ----------
     原先点朱印是「合册」（折成桌角一本小册）——**该功能已整体移除**
     （折起的 CSS 段、封面 DOM 一并删掉，不留死代码）。
     现在朱印做「收纳」：把摊开的册子收回去 = **关闭浮窗**
     （浮窗就是这本册子摊开的样子，"收纳"即把它收回书里）。 */
  function tuckIn() {
    /* 浮窗态：通知父页（酒馆页）关掉浮窗 —— 同源，直接调开启方挂在父窗口上的回调。
       （不用 postMessage：那个目标是父页，正文侧监听在自己 window 上，收不到。） */
    try {
      var pw = window.parent || window;
      if (typeof pw.__TJ_OVERLAY_CLOSE === 'function') { pw.__TJ_OVERLAY_CLOSE(); return; }
    } catch (e) {}
    /* 回退：不在浮窗里（原位展开那条路）时交给横幅模块收起 */
    if (window.TJ_Banner && typeof window.TJ_Banner.close === 'function') window.TJ_Banner.close();
  }

  function bindSeal() {
    [].slice.call(document.querySelectorAll('.colophon-seal')).forEach(function (s) {
      s.setAttribute('role', 'button');
      s.setAttribute('tabindex', '0');
      s.setAttribute('aria-label', '收纳：把册子收回去');
      s.title = '收纳';
      s.addEventListener('click', function () { tuckIn(); });
      s.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault(); tuckIn();
        }
      });
    });
  }

  /* ---------- 对外接口（供各页渲染脚本调用） ---------- */
  window.TJBook = {
    showPage: showPage,
    setHour: function (h) { if (manualHour) return false; setHour(h); return true; },
    isManualHour: function () { return manualHour; },
    drawHourRing: drawHourRing,
    SHICHEN: SHICHEN,
    current: cur,
    renderCurrent: renderCurrent,
    person: null,        /* 当前展开人物页的人名（tj-ren.js 写） */
  };

  /* 调试条默认收起（阶段 8 清理）：地址带 ?debug=1 才显示。
     可与 ?scenario= 并用，如 ?scenario=night&debug=1 */
  if (/[?&]debug=1(&|$)/.test(window.location.search)) {
    document.documentElement.setAttribute('data-debug', '1');
  }

  drawHourRing(SHICHEN.indexOf('酉'));
  showPage('时', false);
  bindSeal();

})();
