/* ==================================================================
   棠郡 · 册首凡例覆盖笺（方案 A）运行时
   ------------------------------------------------------------------
   「首次开册」的判定：
     · 浮窗模式（卡内）：整页即册子，加载后即视为开册，延时亮笺；
     · 横幅/原位展开：由 tj-banner.js 的 setOpen(true) 调 TJFanli.onBookOpen()。
   收起：点笺任意处 / Esc / Enter。本次页面会话内只亮一次（收起后不再复现）。
   纪律同全书：普通 script，不摸变量树，动效只走 opacity。
================================================================== */
(function () {
  'use strict';

  var slip = document.getElementById('fanliSlip');
  if (!slip) return;

  var shown = false;
  var dismissed = false;
  var HIDE_MS = 360;            /* 与 css 过渡 320ms 对齐，略留余量 */

  function show() {
    if (shown || dismissed) return;
    shown = true;
    slip.hidden = false;
    /* 双 raf：先落 hidden=false 的初始透明态，再挂 is-on，过渡才走得动 */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { slip.classList.add('is-on'); });
    });
  }

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    slip.classList.remove('is-on');
    setTimeout(function () { slip.hidden = true; }, HIDE_MS);
  }

  slip.addEventListener('click', dismiss);
  /* 捕获阶段：抢在 tj-book.js 的键盘翻页前把笺收掉，同一次按键不再翻页 */
  document.addEventListener('keydown', function (e) {
    if (dismissed || !shown) return;
    if (e.key === 'Escape' || e.key === 'Enter') { e.stopPropagation(); dismiss(); }
  }, true);

  window.TJFanli = { onBookOpen: show };

  /* 浮窗模式判定（双保险）：
     tj-banner.js 的 bootOverlay() 现在会直调 TJFanli.onBookOpen()（正路），
     这里保留 attribute 兜底 —— boot 时机晚于本脚本解析，所以在
     DOMContentLoaded 再查一次；查到即亮（show 幂等）。 */
  function armIfOverlay() {
    if (document.documentElement.getAttribute('data-tj-overlay') === '1') {
      setTimeout(show, 600);      /* 等书面落定，笺再覆上去 */
      return true;
    }
    /* 离线预览（?scenario=）：册子直开形态，也视为开册。
       生产环境（酒馆正文/横幅文档）不带这个参数，不受影响。 */
    if (/[?&]scenario=/.test(window.location.search)) {
      setTimeout(show, 600);
      return true;
    }
    return false;
  }
  if (!armIfOverlay()) {
    if (/complete|interactive/.test(document.readyState)) {
      /* 脚本跑在 body 尾，readyState 已 interactive 时 boot 可能还没执行完，稍候再查一次 */
      setTimeout(armIfOverlay, 300);
    } else {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(armIfOverlay, 300); });
    }
  }

  /* 点册子外 → 收起册子（作者 2026-10-10 要求）。
     **只在浮窗模式**生效：data-tj-overlay === '1' 时整页即册子，
     点册外桌案留白 → 通知父页关浮窗。
     横幅文档里绝不能挂这条 —— 否则开册那一下点击就会 postMessage
     overlay-close 打到自身，浮窗刚开就被关（实测踩过的坑）。 */
  document.addEventListener('mousedown', function (e) {
    if (document.documentElement.getAttribute('data-tj-overlay') !== '1') return;
    var b = document.getElementById('book');
    if (!b || b.contains(e.target)) return;
    try {
      var pw = window.parent || window;
      if (typeof pw.__TJ_OVERLAY_CLOSE === 'function') { pw.__TJ_OVERLAY_CLOSE(); return; }
      pw.postMessage({ __tj: 'overlay-close' }, '*');
    } catch (err) {}
  });
})();
