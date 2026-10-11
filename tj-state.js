/* ==================================================================
   棠郡 · 数据适配层（工程指令 §0.2-2：表现层与数据层分离）
   ------------------------------------------------------------------
   UI 只准调 TJState.getState()，不许直接摸变量树。
   以后改变量读取方式（换 API、换挂载），只动这个文件。

   取数优先级（自上而下，谁通就用谁）：
     1. 主窗口 MVU：parent.Mvu.getMvuData({ message_id: mesid })
        —— 消息 iframe（srcdoc）与主窗口同源，MVU 挂在主窗口。
        只读楼层快照，永不读 'latest'（工程纪律）。
     2. postMessage 桥：发 {channel:'tangjun-hud', kind:'request', mesid}，
        等角色脚本 iframe 回 {kind:'snapshot', payload}。
     3. mock：window.TJ_MOCK_SCENARIOS[scenario]（core/tj-mock.js，
        由 mock-state.json 经 tools/build_mock.py 生成 —— file:// 下
        fetch JSON 会被 CORS 拦，所以落成 JS）。
        **只在显式给了 ?scenario= 时才走**（离线预览专用）。
        真实环境拿不到数据时返回空状态 + _error，宁可显示墨漫，
        也不拿 mock 冒充酒馆数据（验收指令 §十三）。

   规范化：不管哪路来的数据，都过 normalize() —— 缺字段不报错不锅，
   记进 state._missing，UI 据此渲染「墨漫」样式（工程指令 §3.7）。

   红线：本文件不增删改任何变量键名，只搬运。
================================================================== */
window.TJState = (function () {
  'use strict';

  var CHANNEL = 'tangjun-hud';

  /* ---- 楼层号 ----
     三条路，按可靠性排：
       1. ?mesid= 显式指定（离线调试用）
       2. 酒馆助手的 getCurrentMessageId() —— **只在本楼层消息 iframe 里可用**
          （正则以 ```html 代码块输出时，酒馆助手会把它渲染成 TH-message--<mesid>--* iframe；
          官方文档：非楼层消息 iframe 里调用会抛错，所以必须 try 包住）
       3. DOM 反查（.mes[mesid] / [data-mesid]）—— 内联进消息 DOM 时可用 */
  function detectMesid() {
    var q = /[?&]mesid=(\d+)/.exec(location.search);
    if (q) return q[1];
    try {
      if (typeof window.getCurrentMessageId === 'function') {
        var id = window.getCurrentMessageId();
        if (id != null && id !== '' && !isNaN(Number(id))) return String(id);
      }
    } catch (e) { /* 不在楼层消息 iframe 里 —— 正常，落到 DOM 反查 */ }
    try {
      var holder = document.querySelector('[data-mesid]');
      if (holder) return holder.getAttribute('data-mesid');
      var mes = document.closest ? closestMes(document.body) : null;
      return mes;
    } catch (e) { return null; }
  }
  function closestMes(node) {
    while (node && node !== document) {
      if (node.classList && node.classList.contains('mes')) {
        return node.getAttribute('mesid');
      }
      node = node.parentNode;
    }
    return null;
  }

  /* ---- 源 1：主窗口 MVU ---- */
  function fromMvu(mesid) {
    return new Promise(function (resolve, reject) {
      try {
        var mvu = window.parent && window.parent.Mvu;
        if (!mvu || typeof mvu.getMvuData !== 'function') { reject(new Error('no mvu')); return; }
        var data = mvu.getMvuData({ message_id: Number(mesid) });
        var stat = data && (data.stat_data || (data.data && data.data.stat_data));
        if (!stat) { reject(new Error('mvu empty')); return; }
        resolve({ payload: stat, source: 'mvu:message' });
      } catch (e) { reject(e); }
    });
  }

  /* ---- 源 2：postMessage 桥（角色脚本 iframe） ----
     契约（与 tavern/棠郡-数据桥.js 对齐）：
       成功 → {channel, kind:'snapshot', payload: <stat_data>}
       失败 → {channel, kind:'snapshot', error: 'no-mesid'|'read-failed'|'no-stat', mesid}
     失败帧也要认，否则要白等一个路由超时才知道拿不到。 */
  function fromBridge(mesid, timeoutMs) {
    return new Promise(function (resolve, reject) {
      /* 无对端快速失败：顶层文档没有桥监听（独立预览 file://），
         post 也是空等超时——直接 reject 让调用方走本地兜底。 */
      if (window.parent === window) { reject(new Error('bridge no-peer')); return; }
      var timer = setTimeout(function () {
        window.removeEventListener('message', onMsg);
        reject(new Error('bridge timeout'));
      }, timeoutMs || 600);
      function onMsg(e) {
        var d = e.data;
        if (!d || d.channel !== CHANNEL || d.kind !== 'snapshot') return;
        if (d.error) { cleanup(); reject(new Error('bridge:' + d.error)); return; }
        if (!d.payload) return;
        cleanup();
        resolve({ payload: d.payload, source: 'bridge', notice: d.notice || null });
      }
      function cleanup() {
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
      }
      window.addEventListener('message', onMsg);
      try {
        window.parent.postMessage({ channel: CHANNEL, kind: 'request', mesid: mesid }, '*');
      } catch (e) { cleanup(); reject(e); }
    });
  }

  /* ---- 写变量（v1.1 择业/改槽）：发 kind:'write'，桥白名单校验后写 stat_data，
     回同款 snapshot（= 新真值）。超时/失败 = 没有桥（独立预览），调用方用本地态兜底。 ---- */
  function writeBridge(mutate, mesid, timeoutMs) {
    return new Promise(function (resolve, reject) {
      /* 无对端快速失败（同 fromBridge）：独立预览下不等超时，立即走预览兜底。 */
      if (window.parent === window) { reject(new Error('bridge no-peer')); return; }
      var timer = setTimeout(function () {
        window.removeEventListener('message', onMsg);
        reject(new Error('bridge timeout'));
      }, timeoutMs || 700);
      function onMsg(e) {
        var d = e.data;
        if (!d || d.channel !== CHANNEL || d.kind !== 'snapshot') return;
        if (d.error) { cleanup(); reject(new Error('bridge:' + d.error)); return; }
        if (!d.payload) return;
        cleanup();
        resolve({ payload: d.payload, source: 'bridge', notice: d.notice || null });
      }
      function cleanup() { clearTimeout(timer); window.removeEventListener('message', onMsg); }
      window.addEventListener('message', onMsg);
      try {
        window.parent.postMessage({ channel: CHANNEL, kind: 'write', mutate: mutate, mesid: mesid }, '*');
      } catch (e) { cleanup(); reject(e); }
    });
  }

  /* ---- 发择业消息（v2.1 修五 5.3）：发 kind:'send'，桥用酒馆助手
     triggerSlash('/send … | /trigger') 落一条玩家消息并触发生成（正文=绑定）。
     回 {kind:'send-ack', ok, error?}。失败/超时 = 环境不支持，调用方提示玩家自行言明。 ---- */
  function sendBridge(text, mesid, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (window.parent === window) { reject(new Error('bridge no-peer')); return; }
      var timer = setTimeout(function () {
        window.removeEventListener('message', onMsg);
        reject(new Error('bridge timeout'));
      }, timeoutMs || 4000);
      function onMsg(e) {
        var d = e.data;
        if (!d || d.channel !== CHANNEL || d.kind !== 'send-ack') return;
        cleanup();
        if (d.ok) resolve({ ok: true });
        else reject(new Error('send:' + (d.error || 'failed')));
      }
      function cleanup() { clearTimeout(timer); window.removeEventListener('message', onMsg); }
      window.addEventListener('message', onMsg);
      try {
        window.parent.postMessage({ channel: CHANNEL, kind: 'send', text: String(text || '').slice(0, 120), mesid: mesid }, '*');
      } catch (e) { cleanup(); reject(e); }
    });
  }

  /* ---- 楼层变动通知：桥在「编辑 / 重说 / 删除楼层 / 换聊天」后会喊一声 poke，
     收到就重取本楼快照并重画（否则编辑完正文，册子还停在旧状态）。 ---- */
  function onPoke(cb) {
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (d && d.channel === CHANNEL && d.kind === 'poke') {
        try { cb(); } catch (err) { /* 回调里的错不该影响监听 */ }
      }
    }, false);
  }

  /* ---- 源 3：mock 场景 ---- */
  function fromMock(scenario) {
    var bank = (window.TJ_MOCK_SCENARIOS && window.TJ_MOCK_SCENARIOS.scenarios) || {};
    var pick = bank[scenario || 'default'] || bank['default'];
    if (!pick) { return Promise.reject(new Error('no mock')); }
    return Promise.resolve({ payload: pick, source: 'mock:' + (scenario || 'default') });
  }

  /* ---- 规范化：缺字段登记，不改键名 ---- */
  var REQUIRED = {
    时地: ['年月日', '时辰', '地区', '地点', '天气'],
    /* 节令签要它，缺了就墨漫（世界书 2026-10-03 已注入此组）。
       只查「名」：不在节令期内（名=节间）时「状态」本就为空，
       若一并登记，每轮都会刷一条无意义的告警。 */
    节令: ['名'],
  };
  var RECORDS = ['风云', '人情', '势力', '在场', '离场', '待续'];
  /* 可选组（**不登记 missing**）—— 随身 / 流言 / 痕迹
     这三组空着是常态（身上没带要紧东西、坊间没风声、没新留痕迹），
     若也登记进 _missing，控制台每轮都会刷无意义的告警。
     normalize 本就透传未知组，UI 直接读 r.随身 / r.流言 / r.痕迹 即可。 */

  function normalize(raw) {
    var root = (raw && raw.棠郡) || {};
    var missing = [];
    Object.keys(REQUIRED).forEach(function (grp) {
      var g = root[grp] || {};
      REQUIRED[grp].forEach(function (k) {
        if (g[k] == null || g[k] === '') missing.push(grp + '.' + k);
      });
    });
    RECORDS.forEach(function (k) {
      if (!root[k]) missing.push(k);
    });
    var state = { 棠郡: root, _missing: missing };
    return state;
  }

  /* ---- 主入口：UI 唯一允许调用的取数口 ----
     opts: { mesid, scenario }
     **scenario 只用于离线预览**（?scenario=xxx）。

     纪律：真实环境（没给 scenario）下，MVU 与桥都拿不到数据时，
     **绝不落回 mock** —— 那等于拿假数据冒充酒馆数据（工程验收指令 §十三明令禁止）。
     此时返回一个空的规范化状态：UI 照 §3.7 渲染墨漫，诚实表示「读不到变量」，
     并把原因写进 _error 供控制台与 .src 调试条显示。 */
  function getState(opts) {
    opts = opts || {};
    var mesid = opts.mesid != null ? opts.mesid : detectMesid();
    var preview = !!opts.scenario;

    /* ---- 源 0：**浮窗**用的父页面快照 ----
       浮窗是从正文 iframe 的文档快照起的、被追加到**酒馆页**上：它既不是楼层消息 iframe、
       也不在 .mes 里 → mesid 判不出，MVU 与桥都拿不到。故由开启方（正文那边）
       把当前 state 直接带过来，这里优先用它（`window.__TJ_BOOT`，见 core/tj-banner.js）。 */
    if (window.__TJ_BOOT && window.__TJ_BOOT.state) {
      var s0 = normalize(window.__TJ_BOOT.state);
      s0._source = 'parent-snapshot';
      s0._mesid = window.__TJ_BOOT.mesid != null ? window.__TJ_BOOT.mesid : null;
      s0._preview = false;
      return Promise.resolve(s0);
    }

    var chain = [];
    if (!preview) {
      chain.push(function () { return fromMvu(mesid); });
      chain.push(function () { return fromBridge(mesid); });
      chain.push(function () { return { payload: {}, source: 'none' }; });   /* 诚实兜底 */
    } else {
      chain.push(function () { return fromMock(opts.scenario); });
    }

    return chain.reduce(function (p, fn) {
      return p.catch(function () { return fn(); });
    }, Promise.reject()).then(function (hit) {
      var state = normalize(hit.payload);
      state._source = hit.source;
      state._mesid = mesid;
      state._preview = preview;
      if (hit.source === 'none') {
        state._error = '读不到变量：MVU 与 postMessage 桥都无响应（楼层 ' + mesid + '）';
      }
      if (state._missing.length && window.console) {
        console.warn('[棠郡] 变量缺失（渲染为墨漫）：', state._missing.join('、'));
      }
      if (state._error && window.console) {
        console.warn('[棠郡] ' + state._error);
      }
      return state;
    });
  }

  return {
    getState: getState,
    writeBridge: writeBridge,
    sendBridge: sendBridge,
    normalize: normalize,
    detectMesid: detectMesid,
    onPoke: onPoke,
    CHANNEL: CHANNEL,
  };
})();
