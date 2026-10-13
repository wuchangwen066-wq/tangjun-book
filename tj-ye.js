/* ==================================================================
   棠郡 · 「业」页 v2（第 5 页，2026-10-05）
   ------------------------------------------------------------------
   依据：E:/浏览器下载/AC  mod/ye_page_v2_spec.md ＋ v2.1 补丁。
   状态机（由变量决定，UI 只读）：
     S0 未定   主无身份           左=择业页            右=空册页
     S1 闲身   主.身份=闲身       左=择业页(闲身墨黑+取消) 右=闲身简册
     S2 仅主业 主已定副空         左=任务区+行迹+书签   右=主业完整栏
     S3 主+副  两槽皆有           左同 S2              右=主栏+副精简栏
     S4 主缺   解绑清理后（引擎通知）左=择业页+提示      右=仅剩副业(如有)
   纪律（v2.1）：
     · 主业副业都**没有 UI 放弃入口**——退出只有 景况=已终 自动解绑，
       或用户自行改变量 / OOC 提示词（后门，不进 UI）。
     · UI 只读变量；落笔经桥写 身份/子型/名号/景况（白名单内），
       任务与节律由桥内引擎维护，UI 不写不算。
     · 绑定防重一律用模块闭包变量——浮窗是文档快照，
       data-* 防重会被快照带过来导致酒馆里点不动（实测踩过两次）。
================================================================== */
(function () {
  'use strict';

  var L = window.TJLex;
  var W = L.YE.word, LN = L.YE.line;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function mo(w) {
    return '<span class="mo-man"' + (w ? ' style="min-width:' + w + 'em"' : '') + '>&nbsp;</span>';
  }
  /* 契约：槽值超 12 字 UI 侧截断，hover 看全文（title） */
  function clipCell(raw, n) {
    var v = String(raw || '').trim();
    if (!v) return mo(n === 12 ? 4 : 3);
    var over = v.length > n;
    return '<span class="v-text"' + (over ? ' title="' + esc(v) + '"' : '') + '>' +
      esc(over ? v.slice(0, n) + '…' : v) + '</span>';
  }
  function num2cn(n) {
    n = Math.max(0, Math.min(99, n | 0));
    var D = '零一二三四五六七八九';
    if (n < 10) return D[n];
    var t = Math.floor(n / 10), u = n % 10;
    return (t > 1 ? D[t] : '') + '十' + (u ? D[u] : '');
  }
  function el(id) { return document.getElementById(id); }

  /* ============ 模块状态（全部闭包，防快照带属性） ============ */
  var lastState = null;        /* 最近一次渲染的状态树 */
  var view = 'auto';           /* 'auto' | 'choose'（书签切换，仅 S2/S3 有意义） */
  var draftS1 = false;         /* 闲身草稿：本地解锁，落笔才真写 */
  var s4Hint = false;          /* S4 提示（引擎解绑通知触发，落笔后清除） */
  var formMode = '主';          /* 落笔目标槽 */
  var formPath = '';           /* 当前选的路（商/仕/...） */
  var formOpt = '';            /* 二级已选（业态/所依/阵营） */
  /* v2.2（2026-10-12）：删「旧例/白纸」初始化二选——择业只定所向，槽位框架空着显「未记」 */
  var subOpen = true;          /* v2.2：右页副业默认展开（折叠态曾被用户当成『副业被吞』） */
  var devActive = false, devState = null, devOpen = false;
  var devDay = 3, devJing = '平稳', devMainId = '商', devSubId = '仕';
  var cur = null;              /* {S, D} 渲染缓存，点击处理器用 */
  var mainDraft = false;        /* 主业「取消→重择」态（2026-10-13 作者定稿，仿闲身草稿制） */
  var actSeq = 0;              /* 全局点击序号：桥响应迟到时以序号判断是否过期（防迟到 preview 覆盖 dev 态） */

  /* ---- v2.2：主业「志向未落」判定 ----
     名号/根基/在办/人手/声望/进项/出项/牵累 八槽全空（子型=择业二级、
     景况=落笔默认，都不算剧情写入）→ 可回择业页自由更换；
     任一非空 = 玩家已写入信息 → 锁定主业，只能另择副业。 */
  function mainEmpty(主) {
    if (!主 || 主.身份 === '未定' || 主.身份 === '闲身') return false;
    return ['名号', '根基', '在办', '人手', '声望', '进项', '出项', '牵累']
      .every(function (k) { return !String(主[k] == null ? '' : 主[k]).trim(); });
  }

  /* ---- v2.1 修五：前置署名 ----
     名字不进变量树（不新增键），存 sessionStorage（同源楼层共享，会话内有效），
     随择业消息落正文——「全册共用」由聊天上下文承载。「暂不署名」不卡死。 */
  var playerName = '';
  var signSkipped = false;     /* 本次会话内点过「暂不署名」就不再叨扰 */
  try { playerName = sessionStorage.getItem('tj_player_name') || ''; } catch (e) {}
  function saveName(n) {
    playerName = n;
    try { if (n) sessionStorage.setItem('tj_player_name', n); else sessionStorage.removeItem('tj_player_name'); } catch (e) {}
  }

  function devMode() {
    try {
      if (/[?&]dev=1/.test(location.search)) return true;
      if (window.localStorage && window.localStorage.getItem('tj-dev') === '1') return true;
    } catch (e) {}
    return false;
  }

  /* ============ 读数（旧档兼容：flat 业.{身份..} 视为主槽） ============ */
  function readYe(state) {
    var dev = devActive && devState;
    var src = dev ? devState : state;
    var tj = (src && src.棠郡) || {};
    var ye = tj.业 || {};
    var 主 = (ye.主 && typeof ye.主 === 'object') ? ye.主 : null;
    if (主 && (!主.身份 || 主.身份 === '未定')) 主 = null;
    if (!主 && ye.身份 && ye.身份 !== '未定') {
      /* 旧档：flat 结构提升为主槽（只读兼容；引擎会自行迁移） */
      主 = { 身份: ye.身份, 子型: ye.子型 || '', 名号: ye.名号 || '', 根基: ye.根基 || '',
             在办: ye.在办 || '', 人手: ye.人手 || '', 声望: ye.声望 || '', 进项: ye.进项 || '',
             出项: ye.出项 || '', 牵累: ye.牵累 || '', 景况: ye.景况 || '' };
    }
    var 副 = (ye.副 && ye.副.身份 && ye.副.身份 !== '未定') ? ye.副 : null;
    /* 花讯：正典挂在 棠郡.花讯（uid86 规则与 uid87 InitVar 同款，与业平级）；
       兼容 业.花讯（第四轮施工指令的写法）——两处都认，正典优先。 */
    var hua = (tj.花讯 && typeof tj.花讯 === 'object') ? tj.花讯
            : (ye.花讯 && typeof ye.花讯 === 'object') ? ye.花讯 : null;
    return {
      主: 主, 副: 副,
      任务: ye.任务 || null,
      节律: ye.节律 || null,
      花讯: hua,
      兼理: ye.兼理 === '是',
      钱: tj.钱 || null,
      real: !dev,
    };
  }

  function noticeCheck() {
    var n = window.TJ_NOTICE;
    if (!n) return;
    window.TJ_NOTICE = null;
    if (n.indexOf && n.indexOf('unbind:主') >= 0) { s4Hint = true; view = 'auto'; }
  }

  /* ============ 渲染 ============ */
  function renderYe(state) {
    noticeCheck();
    lastState = state;
    var D = readYe(state);
    var 主 = D.主, 身份 = 主 ? 主.身份 : '未定';
    var S;
    if (!主) S = (s4Hint || D.副) ? 'S4' : 'S0';   /* 主空副在 = S4（v2.1：已终解绑或用户清空主槽），非引擎通知也能进 */
    else if (身份 === '闲身') S = 'S1';
    else S = D.副 ? 'S3' : 'S2';
    if (S === 'S0' || S === 'S1' || S === 'S2' || S === 'S3') s4Hint = false;
    cur = { S: S, D: D };

    var choose = el('yeChoose'), set = el('yeSet');
    if (!choose || !set) return;
    var effView = (S === 'S0' || S === 'S4' || S === 'S1' || view === 'choose') ? 'choose' : 'main';
    choose.hidden = effView !== 'choose';
    set.hidden = effView !== 'main';

    var mp = document.querySelector('.page[data-tab="业"] .meipi');
    if (mp) mp.textContent = LN.眉批[S === 'S2' || S === 'S3' ? 'S23' : S];

    if (effView === 'choose') renderChoose(D, S);
    else { renderTask(D); renderHua(D); }

    renderRight(D, S);
    renderDev();
  }

  /* ---- 左页：择业页 ---- */
  function renderChoose(D, S) {
    var 主 = D.主, 副 = D.副;
    var 主id = 主 ? 主.身份 : '', 副id = 副 ? 副.身份 : '';
    var 主id真 = 主id;   /* 不被重择态清空的真身：取消 chip 靠它定位 */
    /* 作者 2026-10-13 定稿（全面替换「未落初态」旧机制，仿闲身取消制）：
       主业条目带「取消」chip——点它进重择态：全页无已选标记（颜色回归原版），
       点任何路=落笔新主业；不点取消 → 点其他路=选副业。重择中点原路=复归。 */
    var 重择 = mainDraft && (S === 'S2' || S === 'S3');
    if (重择) { 主id = ''; 副id = ''; }
    var lead = el('yeLead');
    if (S === 'S0') lead.textContent = LN.S0左;
    else if (S === 'S4') lead.textContent = LN.S4;
    else if (S === 'S1') lead.textContent = draftS1 ? W.草稿 : '闲身已在。要换路，先解。';
    else if (S === 'S2' || S === 'S3') lead.textContent = 重择 ? W.重择
      : (S === 'S2' ? '主业已立。可再择一路为副业。' : '一主一副，两槽皆满。');

    /* v2.1 修五：署名条——只 S0 未署名时摊开；已记/暂不/非S0 收起 */
    var sign = el('yeSign');
    if (sign) {
      var input = el('yeSignName'), okBtn = el('yeSignOk'), skipBtn = el('yeSignSkip'),
          done = el('yeSignDone'), label = el('yeSignLabel');
      if (S !== 'S0') {
        sign.hidden = true;
      } else if (playerName) {
        sign.hidden = false;
        input.hidden = true; okBtn.hidden = true; skipBtn.hidden = true; label.hidden = true;
        done.hidden = false;
        done.innerHTML = esc(L.YE.sign.已记(playerName)) + ' <button type="button" class="ye-linkbtn" id="yeSignEdit">' + L.YE.sign.改 + '</button>';
        var edit = el('yeSignEdit');
        if (edit) edit.addEventListener('click', function () { saveName(''); renderYe(lastState); });
      } else if (signSkipped) {
        sign.hidden = false;
        input.hidden = true; okBtn.hidden = true; skipBtn.hidden = true; label.hidden = true;
        done.hidden = false;
        done.textContent = L.YE.sign.未署;
      } else {
        sign.hidden = false;
        input.hidden = false; okBtn.hidden = false; skipBtn.hidden = false; label.hidden = false;
        done.hidden = true; done.textContent = '';
      }
    }

    [].forEach.call(document.querySelectorAll('#yeEntries .ye-entry'), function (b) {
      var p = b.dataset.ye;
      var chosen = (S !== 'S0' && p === 主id) || (副id && p === 副id && S !== 'S0');
      var locked;
      /* 2026-10-13 定稿（仿闲身）：
         · 重择态（点了主业取消）→ 六路皆可点，点的就是新主业
         · 常态：S2 已选路锁、未选路=副业；S3 主副已选、余路锁 */
      if (S === 'S1') locked = draftS1 ? false : (p !== '闲身');
      else if (重择) locked = false;
      else if (S === 'S3') locked = !chosen;
      else locked = chosen;
      b.classList.toggle('is-chosen', chosen && !(S === 'S1' && draftS1));
      b.classList.toggle('is-locked', locked);
      b.setAttribute('aria-disabled', locked && !chosen ? 'true' : 'false');
      /* 「重择」角标已废（2026-10-13 交互重定）——仅清理可能残留的 DOM */
      var chip2 = b.querySelector('.ye-entry-reselect');
      if (chip2) chip2.parentNode.removeChild(chip2);
      /* 主业上的「取消」（S2/S3 常态；2026-10-13 定稿，仿闲身） */
      var chipM = b.querySelector('.ye-entry-cancel-main');
      if ((S === 'S2' || S === 'S3') && !重择 && p === 主id真 && !chipM) {
        chipM = document.createElement('span');
        chipM.className = 'ye-entry-cancel-main';
        chipM.textContent = W.取消;
        b.appendChild(chipM);
      } else if (chipM && !((S === 'S2' || S === 'S3') && !重择 && p === 主id真)) {
        chipM.parentNode.removeChild(chipM);
      }
      /* 闲身上的「取消」（S1 且非草稿） */
      var chip = b.querySelector('.ye-entry-cancel');
      if (S === 'S1' && !draftS1 && p === '闲身' && !chip) {
        chip = document.createElement('span');
        chip.className = 'ye-entry-cancel';
        chip.textContent = W.取消;
        b.appendChild(chip);
      } else if (chip && !(S === 'S1' && !draftS1 && p === '闲身')) {
        chip.parentNode.removeChild(chip);
      }
    });

    /* 兼理开关（作者 2026-10-07 加）：择业页常驻，探花郎之下、回行迹之上。
       不是第七路，是精力声明——开时副业照常打理（变量更新+剧情业自然发生）。 */
    var jl = el('yeJianli');
    if (jl) {
      var jlOn = !!D.兼理;
      jl.hidden = false;
      jl.classList.toggle('is-on', jlOn);
      jl.innerHTML = '<span class="yj-mark">' + (jlOn ? L.YE.兼理.开 : L.YE.兼理.停) + '</span>' +
        '<span class="yj-copy">' + L.YE.兼理.句 + '</span>';
      jl.title = L.YE.兼理.注;
    }

    el('yeS1Bar').hidden = !(S === 'S1' && draftS1);
    el('yePromo').hidden = !(S === 'S4' && D.副);

    var hold = el('yeHold');
    hold.hidden = (S === 'S1' && !draftS1);
    hold.textContent = (S === 'S1' && draftS1) ? W.复归
      : (S === 'S2' || S === 'S3') ? W.回行迹 : W.先不动;
  }

  /* ---- 左页：任务区（S2/S3 主视图） ---- */
  function renderTask(D) {
    var box = el('yeTask');
    var 主 = D.主, t = D.任务, j = D.节律 || {};
    /* B7（2026-10-12）：兼理角标——开关在择业页，S2/S3 主视图原先看不见状态。
       兼理=是 且 副业在业 → 任务区顶常驻「兼理中 · 副X」（词取 lexicon 现成）。 */
    var jl = (D.兼理 && D.副 && D.副.身份 && D.副.身份 !== '未定')
      ? '<div class="ye-jl-badge" title="' + esc(L.YE.兼理.句) + '">' +
        L.YE.兼理.开 + ' · 副' + esc(D.副.身份) + '</div>' : '';
    var 主ok = 主 && 主.身份 && 主.身份 !== '未定' && 主.身份 !== '闲身';
    if (!主ok || !t || !t.状态 || t.状态 === '无') {
      box.innerHTML = jl + '<div class="ye-idle">近日无事。平安喜乐。</div>';
      return;
    }
    var 事由 = String(t.事由 || '—'), 类型 = t.类型 === '急' ? '急' : '常';
    if (t.状态 === '待办') {
      var rem = (j.剩余日 != null) ? j.剩余日 : ((t.止日序 | 0) - (j.日序 | 0));
      var remTxt = rem <= 0 ? '今日止' : '余' + num2cn(rem) + '日';
      box.innerHTML = jl +
        '<div class="ye-taskcard' + (类型 === '急' ? ' is-urgent' : '') + '" title="' +
        esc(事由 + '｜' + remTxt + '｜' + (t.来由 || '') + '｜' + (t.后果 || '')) + '">' +
        '<div class="tc-top"><span class="tc-type">' + 类型 + '</span>' +
        '<span class="tc-title">' + esc(事由) + '</span>' +
        '<span class="tc-rem">' + remTxt + '</span></div>' +
        '<div class="tc-line">' + esc(t.来由 || '') + '</div>' +
        '<div class="tc-line tc-cons">误了：' + esc(t.后果 || '—') + '</div></div>';
    } else {
      box.innerHTML = jl +
        '<div class="ye-taskcard is-faded"><div class="tc-top"><span class="tc-type">' +
        esc(t.状态) + '</span><span class="tc-title">' + esc(事由) + '</span></div>' +
        '<div class="tc-line">' + (t.状态 === '已逝' ? '误了。后果已落。' : '办成了。') + '</div></div>';
    }
  }

  /* ---- 花笺（探花郎 · 花讯；2026-10-07 第四轮）----
     主业或副业为探花郎时，主视图（#yeSet）里加一块花笺：折花（次数）/ 风流 / 名声
     三行，花榜文体、雅词俗用（词在 L.YE.花讯）；倾心达上限者标「看惯了」。
     副业为探花郎时不另设任务区（uid173 对副业不加载，任务区永远是主业的），
     花笺是探花郎侧唯一的块。
     数据缺失（无 业.花讯）→ 花笺不显，不报错（诚实缺省，同墨漫纪律）。 */
  function renderHua(D) {
    var box = el('yeHua');
    if (!box) return;
    var 主 = D.主, 副 = D.副;
    var 在业 = (主 && 主.身份 === '探花郎') || (副 && 副.身份 === '探花郎');
    var hx = D.花讯;
    if (!在业 || !hx) { box.hidden = true; box.innerHTML = ''; return; }
    var H = L.YE.花讯;
    function n(v, lo, hi) {
      v = Number(v);
      if (isNaN(v)) v = 0;
      return Math.max(lo, Math.min(hi, v));
    }
    /* 风流上限一百（uid171），num2cn 只到 99 → 满值单独出「一百」；
       异常溢出退阿拉伯数字，不谎报。 */
    function cnNum(x) {
      x = Math.round(x);
      if (x > 100) return String(x);
      if (x === 100) return '一百';
      return num2cn(x);
    }
    /* 三行：折花（次数）／风流／名声。次数零 →「未折」。 */
    var rows = H.行.map(function (r) {
      var raw = hx[r.key];
      var v, txt;
      if (r.key === '次数') {
        v = n(raw, 0, 999);
        txt = v > 0 ? cnNum(v) + '度' : '未折';
      } else {
        v = n(raw, 0, 100);
        txt = cnNum(v);
      }
      return '<div class="hua-row" title="' + esc(r.注) + '"><span class="hua-k">' +
        esc(r.标) + '</span><span class="hua-v">' + esc(txt) + '</span></div>';
    }).join('');
    /* 倾心：{姓名: 累计}；姜俞姒不记（uid171），遇她跳过；
       达上限（L.YE.花讯.上限）→ 名后标「看惯了」小朱记。 */
    var qx = (hx.倾心 && typeof hx.倾心 === 'object') ? hx.倾心 : null;
    var items = [];
    if (qx) {
      Object.keys(qx).forEach(function (name) {
        if (name === '姜俞姒') return;   /* 她只认「回来」，不认「来过」 */
        var v = n(qx[name], 0, 999);
        var cap = H.上限[name];
        var mark = (cap != null && v >= cap)
          ? '（<span class="hua-seen">' + esc(H.看惯了) + '</span>）'
          : '（' + cnNum(v) + '）';
        items.push(esc(name) + mark);
      });
    }
    if (items.length) {
      rows += '<div class="hua-row hua-qx" title="' + esc(H.倾心注) + '"><span class="hua-k">' +
        esc(H.倾心标) + '</span><span class="hua-v">' + items.join(' · ') + '</span></div>';
    }
    /* 摘樱：[姓名…]（作者 2026-10-07 加的补则，uid171）。一人只记一回，记过不重记；
       空/缺/非数组 → 整行不显（诚实缺省，同倾心纪律）；整行朱字（.hua-sakura）。 */
    var sak = Array.isArray(hx.摘樱)
      ? hx.摘樱.filter(function (s) { return typeof s === 'string' && s; })
      : [];
    if (sak.length) {
      rows += '<div class="hua-row hua-sakura" title="' + esc(H.摘樱注) + '"><span class="hua-k">' +
        esc(H.摘樱标) + '</span><span class="hua-v">' + sak.map(esc).join('、') + '</span></div>';
    }
    /* 名声走低提示（指令「可选」项，做了轻量版）：探花郎在业 + 主业是仕/商
       + 名声 < 40 时，花笺脚注一句（文案近 uid171 原句）。 */
    if (主 && (主.身份 === '仕' || 主.身份 === '商') && n(hx.名声, 0, 100) < 40) {
      rows += '<div class="hua-note">' + esc(H.名声低注) + '</div>';
    }
    box.innerHTML = '<div class="hua-head"><span class="hua-title">花笺</span></div>' + rows;
    box.hidden = false;
  }

  /* ---- 右页：空册 / 立身栏 ---- */
  function renderRight(D, S) {
    var blank = el('yeBlank'), panel = el('yePanel');
    var 主 = D.主, 副 = D.副;
    if (S === 'S0') {
      blank.hidden = false; panel.hidden = true;
      return;
    }
    blank.hidden = true; panel.hidden = false;

    var 身份 = 主 ? 主.身份 : '';
    var head = el('yePanelHead');
    head.childNodes[0].nodeValue = 主 ? ('立身 · ' + 身份) : (副 ? '副业 · ' + 副.身份 : '立身');

    /* 景况皮（闲身无景况） */
    var jing = el('yeJing');
    var 档 = 主 && 主.景况 && 主.身份 !== '闲身' ? 主.景况 : '';
    var 皮 = 档 && L.YE.jing[身份] ? (L.YE.jing[身份][档] || 档) : '';
    jing.hidden = !皮;
    jing.textContent = 皮 || '';
    jing.className = 'ye-jing' + (档 === '平稳' ? ' is-平' : 档 === '濒危' ? ' is-危' : 档 === '已终' ? ' is-终' : '');

    var seal = el('yeChosenSeal');
    seal.hidden = !(D.real && 主);

    /* 主业完整栏（子型/名号/根基/在办/人手/声望/进项/出项/牵累）
       v2.1 修三：闲身不拟定任何身份/职位/收入——九槽不渲染，右页只余标题与钱。
       v2.1 修五 5.3：志向制——空槽不渲染（具体信息剧情节点后才写），不拿空行凑数。 */
    var rows = '';
    if (主 && 主.身份 !== '闲身') {
      var titles = L.YE.titles[身份] || {};
      /* v2.2：九槽全画行——空槽显「未记」（框架在，值玩家自己玩出来）。
         修「单职业不显示字段」：旧版空槽不画行，选一个职业右页只剩标题。 */
      ['子型', '名号', '根基', '在办', '人手', '声望', '进项', '出项', '牵累'].forEach(function (slot) {
        var val = String(主[slot] == null ? '' : 主[slot]).trim();
        /* v2.2：真实身份未写入（mainEmpty）时，所依（子型）也只显「未记」——
           择业选的只是方向，不是既成事实 */
        if (slot === '子型' && mainEmpty(主)) val = '';
        rows += '<div class="row' + (val ? '' : ' is-empty') + '"><span class="k">' + esc(titles[slot] || slot) +
          '</span><span class="v">' + (val ? clipCell(主[slot], 12) : '<span class="v-empty">' + L.YE.未记 + '</span>') + '</span></div>';
      });
    }
    el('yeSlots').innerHTML = rows;
    el('yeSlots').hidden = !主;

    /* 副业精简栏（名号/根基/在办；景况进栏头） */
    var subBox = el('yeSub');
    if (副) {
      subBox.hidden = false;
      var j皮 = 副.景况 && L.YE.jing[副.身份] ? (L.YE.jing[副.身份][副.景况] || 副.景况) : '';
      el('yeSubHead').textContent = '副 · ' + 副.身份 + (j皮 ? ' ｜ ' + j皮 : '') + (subOpen ? ' ▴' : ' ▾');
      el('yeSubHead').setAttribute('aria-expanded', subOpen ? 'true' : 'false');
      el('yeSubRows').hidden = !subOpen;
      if (subOpen) {
        var sr = '';
        [['名号', '名号'], ['根基', '根基'], ['在办', '在办']].forEach(function (pair) {
          sr += '<div class="row"><span class="k">' + pair[0] +
            '</span><span class="v">' + clipCell(副[pair[1]], 12) + '</span></div>';
        });
        el('yeSubRows').innerHTML = sr;
      }
    } else subBox.hidden = true;

    /* 钱（独立支，任何态都在） */
    var money = D.钱 || L.YE.money[身份 || '未定'] || L.YE.money['未定'] || {};
    var mrows = '';
    [['现银', '现银'], ['欠', '欠'], ['存', '存']].forEach(function (pair) {
      mrows += '<div class="row"><span class="k">' + pair[1] +
        '</span><span class="v">' + clipCell(money[pair[0]], 12) + '</span></div>';
    });
    el('yeMoney').innerHTML = mrows;
  }

  /* ============ 落笔表单 ============ */
  function openForm(mode, path) {
    formMode = mode; formPath = path; formOpt = '';
    el('yeFormTitle').textContent = '落笔 · ' + path;
    var modeEl = el('yeFormMode');
    modeEl.hidden = mode !== '副';
    modeEl.textContent = '（副业）';
    var sub = L.YE.sub[path];
    var subEl = el('yeFormSub'), optsEl = el('yeFormOpts');
    if (sub && sub.fixed) {
      subEl.hidden = false; subEl.textContent = sub.标 + '：' + sub.fixed;
      optsEl.hidden = true; optsEl.innerHTML = '';
    } else if (sub && (sub.opts || path === '商')) {
      var opts = path === '商' ? L.YE.forms : sub.opts;
      subEl.hidden = false; subEl.textContent = sub.标;
      optsEl.hidden = false;
      optsEl.innerHTML = opts.map(function (o) {
        return '<button type="button" class="ye-opt" data-opt="' + esc(o) + '">' + esc(o) + '</button>';
      }).join('');
    } else {
      subEl.hidden = true; optsEl.hidden = true; optsEl.innerHTML = '';
    }
    /* v2.2：初始化二选已删（壳内 #yeFormInit 一并下线）——常驻隐藏兜底 */
    var initRow = el('yeFormInit');
    if (initRow) initRow.hidden = true;
    /* v2.1 修五：名号字段——只江湖（名号）/修（道号）保留并带旁注；商/仕/闲身不设 */
    var nameRow = el('yeFormNameRow'), nameLabel = el('yeFormNameLabel'), nameHint = el('yeFormNameHint');
    var 注 = L.YE.名号注[path];
    if (nameRow) {
      nameRow.hidden = !注;
      if (注) {
        nameLabel.textContent = 注.label;
        nameHint.textContent = 注.label + '≤八字 · ' + 注.注;
        nameHint.title = 注.注;
      }
    }
    el('yeFormName').value = '';
    el('yeFormNote').textContent = '';
    el('yeForm').hidden = false;
    renderYe(lastState);
  }
  function closeForm() {
    el('yeForm').hidden = true;
    formPath = '';
    renderYe(lastState);
  }
  function formNote(t) { el('yeFormNote').textContent = t || ''; }

  function commit() {
    var path = formPath;
    if (!path) return;
    var 子型 = '';
    /* 需要二级选择的路径：表单真给出选项的（商=业态，仕=所依，江湖=阵营）。
       探花郎 sub=null（外号由坊间在正文里起，uid171）——与闲身同，落笔不需要二级；
       第四轮前此处对所有非修/闲身路径一律索要 formOpt，探花郎会被「先择…再落笔」卡死。 */
    var subDef = L.YE.sub[path];
    var needsOpt = !!subDef && (subDef.opts || path === '商');
    if (path === '修') 子型 = '崧岳皋观';
    else if (needsOpt) {
      子型 = formOpt;
      if (!子型) { formNote('先择' + (subDef ? subDef.标.replace(/（.*/, '') : '一项') + '，再落笔。'); return; }
    }
    /* v2.1 修五 5.1/5.2：名号只江湖/修收集（商仕闲身无此字段）；5.3 志向制——只记身份/子型/名号/景况，官职俸禄根基等一概不预填 */
    var 注 = L.YE.名号注[path];
    var 名号 = 注 ? (el('yeFormName').value || '').trim().slice(0, 8) : '';
    var base = formMode === '副' ? '棠郡.业.副' : '棠郡.业.主';
    var muts = [{ path: base + '.身份', value: path }];
    if (子型) muts.push({ path: base + '.子型', value: 子型 });
    if (名号) muts.push({ path: base + '.名号', value: 名号 });
    muts.push({ path: base + '.景况', value: '平稳' });
    var mySeq = actSeq;        /* 本次落笔的会话号：期间用户再点任何处 → 作废 */

    var done = function (ok, payload) {
      if (actSeq !== mySeq) return;   /* 迟到响应：用户已接管（工房/书签/其他落笔），丢弃 */
      if (payload) window.TJ_STATE = payload;
      draftS1 = false; mainDraft = false; view = 'auto'; s4Hint = false;
      closeForm();
      renderYe(window.TJ_STATE);
      var mp = document.querySelector('.page[data-tab="业"] .meipi');
      if (mp) mp.textContent = ok ? LN.记下 : (LN.预览 + '路怎么走，看你。');
      /* 2026-10-13 作者改：主业落笔成功 → 择业消息只置入酒馆输入框，
         不自动发送、不触发生成——由主人审阅后自行发出（触发生成贵，且原文该留改口）。
         置入失败（无输入框/独立预览）→ 眉批兜底展示原文。 */
      if (ok && formMode === '主') {
        var text = buildYeMsg(path, 子型, 名号);
        var filled = fillYeMsg(text);
        if (mp) mp.textContent = filled
          ? '志向已记下。话已置入输入框——审阅后发出，方算落定。'
          : '志向已记下。请向人间言明此志：' + text;
      }
    };
    if (window.TJState && window.TJState.writeBridge) {
      window.TJState.writeBridge(muts, null, 1500)
        .then(function (r) {
          if (r && r.notice) window.TJ_NOTICE = r.notice;
          done(true, r && r.payload);
        })
        .catch(function () { if (actSeq === mySeq) { previewCommit(); done(false); } });
    } else { previewCommit(); done(false); }
  }

  /* ---- v2.1 修五：择业消息文案（古风短句；名字随消息落正文=全册共用） ---- */
  function buildYeMsg(path, 子型, 名号) {
    var M = L.YE.msg;
    var parts = [];
    if (playerName) parts.push('我名【' + playerName + '】');
    var road = M.路[path] || ('志在' + path);
    var seg = road;
    if (子型 && M.子型[path]) seg += M.子型[path](子型);
    if (名号) seg += (path === '修' ? '，道号「' : '，自号「') + 名号 + '」';
    parts.push(seg);
    return parts.join('；').replace('；', '，') + '。';
  }
  /* ---- 2026-10-13 作者改：择业消息置入酒馆输入框（不发送）----
     HUD 在消息的 srcdoc iframe 里，与父页同源 → 可写 #send_textarea。
     追加写入（不动用户已打的内容）+ 触发 input 事件让 ST 记账，光标落末。 */
  function fillYeMsg(text) {
    try {
      var p = window.parent;
      if (!p || p === window) return false;               /* 独立预览：无输入框可填 */
      var doc = p.document;
      if (!doc) return false;
      var ta = doc.getElementById('send_textarea');
      if (!ta && doc.querySelector) {
        ta = doc.querySelector('#send_form textarea, textarea#send_textarea, #send_textarea');
      }
      if (!ta || typeof ta.value !== 'string') return false;
      var cur = String(ta.value || '').replace(/\s+$/, '');
      ta.value = cur ? cur + ' ' + text : text;
      var EK = p.Event || window.Event;
      try { ta.dispatchEvent(new EK('input', { bubbles: true })); } catch (e) {}
      try { ta.dispatchEvent(new EK('change', { bubbles: true })); } catch (e) {}
      try { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {}
      return true;
    } catch (e) { return false; }
  }
  /* 预览（无桥）：落进工房 mock，状态机照走
     v2.1 修五 5.3：志向制——回退预览只落 身份/子型/名号/景况（不拿词库九槽
     冒充已拟定）；词库完整槽留给工房试看（mkMock full）。 */
  function previewCommit() {
    var path = formPath;
    devActive = true;
    var 子型 = '';
    if (path === '修') 子型 = '崧岳皋观';
    else if (path !== '闲身') {
      var subDef = L.YE.sub[path];
      if (subDef && (subDef.opts || path === '商')) 子型 = formOpt;
    }
    var 注 = L.YE.名号注[path];
    var 名号 = 注 ? (el('yeFormName').value || '').trim().slice(0, 8) : '';
    if (formMode === '副') {
      devSubId = path; devMainId = (cur && cur.D && cur.D.主) ? cur.D.主.身份 : '商';
      devState = devTree('S3');
    } else {
      devMainId = path; devSubId = '';
      devState = devTree(path === '闲身' ? 'S1' : 'S2');
    }
    /* 志向保真：槽全清再回填表单真实所择（词库默认一概不留，不剧透） */
    var m = devState && devState.棠郡 && devState.棠郡.业 && devState.棠郡.业[formMode === '副' ? '副' : '主'];
    if (m) {
      ['子型', '名号', '根基', '在办', '人手', '声望', '进项', '出项', '牵累'].forEach(function (k) { delete m[k]; });
      if (子型) m.子型 = 子型;
      if (名号) m.名号 = 名号;
    }
  }

  /* ============ S1 闲身草稿 ============ */
  function startDraft() { draftS1 = true; renderYe(lastState); }
  function endDraft() { draftS1 = false; renderYe(lastState); }

  /* ============ 副业升主（拍板默认：可） ============ */
  function promote() {
    var mySeq = actSeq;
    var apply = function (r) {
      if (actSeq !== mySeq) return;   /* 迟到响应：用户已接管，丢弃 */
      if (r && r.payload) window.TJ_STATE = r.payload;
      if (r && r.notice) window.TJ_NOTICE = r.notice;
      s4Hint = false; view = 'auto';
      renderYe(window.TJ_STATE);
    };
    if (window.TJState && window.TJState.writeBridge) {
      window.TJState.writeBridge({ op: 'promote' }, null, 1500)
        .then(apply)
        .catch(function () { if (actSeq === mySeq) previewPromote(); });
    } else previewPromote();
  }
  function previewPromote() {
    var D = cur ? cur.D : null;
    if (!D || !D.副) return;
    devActive = true; devMainId = D.副.身份; devSubId = '';
    devState = devTree('S2');
    renderYe(window.TJ_STATE);
  }

  /* ============ 工房（dev） ============ */
  function mkMock(id, jing) {
    var m = { 身份: id, 景况: jing || '平稳' };
    var e = L.YE.entries[id] || {};
    Object.keys(e).forEach(function (k) { if (!m[k] || k !== '身份') m[k] = e[k]; });
    return m;
  }
  function devTree(S) {
    var 业 = {
      主: { 身份: '未定' },
      任务: { 状态: '无', 类型: '常', 事由: '—', 来由: '—', 后果: '—', 起日序: 0, 止日序: 0 },
      节律: { 日序: devDay, 下次可派发日序: 0, 预定期限: 0, 派发许可: '否', 待落后果: '否', 上次结果: '—', 急任务已发: '否', 剩余日: 0 },
    };
    if (S === 'S1') 业.主 = mkMock('闲身', devJing);
    if (S === 'S2' || S === 'S3') 业.主 = mkMock(devMainId === '闲身' ? '商' : devMainId, devJing);
    if (S === 'S3') 业.副 = mkMock(devSubId || '仕', '平稳');
    if (S === 'S4') { 业.主 = { 身份: '未定' }; 业.副 = mkMock(devSubId || '仕', '平稳'); }
    return { 棠郡: { 业: 业, 钱: L.YE.money[业.主.身份 === '未定' ? '未定' : 业.主.身份] || L.YE.money['未定'] } };
  }
  function devSet(S) {
    devActive = true;
    devState = devTree(S);
    renderYe(window.TJ_STATE);
  }
  function devJingSet(j) {
    devJing = j;
    if (devState && devState.棠郡 && devState.棠郡.业.主 && devState.棠郡.业.主.身份 &&
        devState.棠郡.业.主.身份 !== '未定') {
      devState.棠郡.业.主.景况 = j;
    }
    renderYe(window.TJ_STATE);
  }
  function devTask(kind) {
    if (!devState) devSet('S2');
    var 业 = devState.棠郡.业;
    var t = 业.任务, j = 业.节律;
    var seed = L.YE.taskSeeds[devDay % L.YE.taskSeeds.length];
    if (kind === 'ok') { t.状态 = '已了'; }
    else if (kind === 'exp') { t.状态 = '已逝'; j.待落后果 = '是'; }
    else {
      t.状态 = '待办'; t.类型 = kind === 'urgent' ? '急' : '常';
      t.事由 = seed.事由; t.来由 = seed.来由; t.后果 = seed.后果;
      t.起日序 = devDay; t.止日序 = devDay + 3 + (devDay % 5);
      j.剩余日 = t.止日序 - devDay; j.派发许可 = '否';
    }
    renderYe(window.TJ_STATE);
  }
  function renderDev() {
    var tab = el('yeDevTab'), box = el('yeDev');
    if (!tab) return;
    tab.hidden = !devMode();
    box.hidden = !devOpen;
    var dayEl = el('yeDevDay');
    if (dayEl) dayEl.textContent = String(devDay);
  }

  /* ============ 绑定（闭包防重） ============ */
  var bound = false;
  function bindAll() {
    if (bound) return;
    bound = true;

    /* 全文档点击计数（capture，一处兜住工房/书签/表单/翻页所有用户接管点）：
       桥响应回调对照发起时的序号，序号变了 = 用户中途已操作，迟到响应作废。 */
    document.addEventListener('click', function () { actSeq++; }, true);

    el('yeEntries').addEventListener('click', function (e) {
      var b = e.target.closest('.ye-entry');
      if (!b || !cur) return;
      var path = b.dataset.ye;
      var S = cur.S;
      if (S === 'S1') {
        if (!draftS1) {
          if (path === '闲身' && e.target.closest('.ye-entry-cancel')) startDraft();
          return;
        }
        if (path === '闲身') { endDraft(); return; }
        openForm('主', path);
        return;
      }
      /* 主业「取消」chip → 进重择态（仿闲身 startDraft） */
      if ((S === 'S2' || S === 'S3') && e.target.closest('.ye-entry-cancel-main')) {
        mainDraft = true;
        renderYe(lastState);
        return;
      }
      if (b.classList.contains('is-chosen') || b.classList.contains('is-locked')) return;
      if (mainDraft && (S === 'S2' || S === 'S3')) {
        /* 重择态：点原路=复归；点其他路=落笔新主业 */
        var 主id真2 = (cur.D && cur.D.主) ? cur.D.主.身份 : '';
        if (path === 主id真2) { mainDraft = false; renderYe(lastState); return; }
        openForm('主', path);
        return;
      }
      /* 常态：S2 点未选路 = 副业；S0 点任何路 = 首择主业 */
      openForm(S === 'S2' ? '副' : '主', path);
    });

    /* 兼理开关：实况走数据桥（同落笔惯例）；dev 态改 devState；无桥环境改本地态。 */
    el('yeJianli').addEventListener('click', function () {
      if (!cur) return;
      var v = (cur.D && cur.D.兼理) ? '否' : '是';
      var mySeq = actSeq;
      var done = function (ok, payload) {
        if (actSeq !== mySeq) return;   /* 迟到响应：用户已接管，丢弃 */
        if (payload) window.TJ_STATE = payload;
        if (devActive && devState) {
          devState.棠郡.业 = devState.棠郡.业 || {};
          devState.棠郡.业.兼理 = v;
          renderYe(devState);
          return;
        }
        if (window.TJ_STATE && window.TJ_STATE.棠郡) {
          window.TJ_STATE.棠郡.业 = window.TJ_STATE.棠郡.业 || {};
          window.TJ_STATE.棠郡.业.兼理 = v;
        }
        renderYe(window.TJ_STATE);
        var mp = document.querySelector('.page[data-tab="业"] .meipi');
        if (mp) mp.textContent = ok ? (v === '是' ? L.YE.兼理.记下 : L.YE.兼理.收) : L.YE.兼理.未落;
      };
      if (devActive && devState) { done(true, null); return; }
      if (window.TJState && window.TJState.writeBridge) {
        window.TJState.writeBridge([{ path: '棠郡.业.兼理', value: v }], null, 1500)
          .then(function (r) {
            if (r && r.notice) window.TJ_NOTICE = r.notice;
            done(true, r && r.payload);
          })
          .catch(function () { done(false, null); });
      } else {
        done(true, null);
      }
    });

    el('yeFormOpts').addEventListener('click', function (e) {
      var b = e.target.closest('.ye-opt');
      if (!b) return;
      formOpt = b.dataset.opt;
      [].forEach.call(el('yeFormOpts').querySelectorAll('.ye-opt'), function (x) {
        x.classList.toggle('is-on', x === b);
      });
    });
    /* v2.2：初始化二选已删（壳内 #yeFormInit 一并下线） */
    /* v2.1 修五：前置署名（记下 / 暂不署名；不卡死） */
    el('yeSignOk').addEventListener('click', function () {
      var n = (el('yeSignName').value || '').trim().slice(0, 8);
      saveName(n);            /* 空名视为不署，不叨扰 */
      renderYe(lastState);
    });
    el('yeSignName').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); el('yeSignOk').click(); }
    });
    el('yeSignSkip').addEventListener('click', function () {
      signSkipped = true;
      renderYe(lastState);
    });
    el('yeFormOk').addEventListener('click', commit);
    el('yeFormNo').addEventListener('click', closeForm);

    el('yeHold').addEventListener('click', function () {
      if (!cur) return;
      if (cur.S === 'S1' && draftS1) { endDraft(); return; }
      if (cur.S === 'S2' || cur.S === 'S3') {
        if (view === 'choose') view = 'auto';
        renderYe(lastState);
        return;
      }
      closeForm();
    });
    el('yeBookmark').addEventListener('click', function () { view = 'choose'; renderYe(lastState); });
    el('yeS1Back').addEventListener('click', endDraft);
    el('yePromote').addEventListener('click', promote);
    el('yeSubHead').addEventListener('click', function () { subOpen = !subOpen; renderYe(lastState); });

    /* 工房 */
    el('yeDevTab').addEventListener('click', function () { devOpen = true; renderDev(); });
    el('yeDevOff').addEventListener('click', function () { devOpen = false; renderDev(); });
    el('yeDevReal').addEventListener('click', function () { devActive = false; devState = null; renderYe(lastState); });
    el('yeDevDayUp').addEventListener('click', function () {
      devDay += 1;
      if (devState) {
        var t = devState.棠郡.业.任务, j = devState.棠郡.业.节律;
        j.日序 = devDay;
        if (t.状态 === '待办') j.剩余日 = t.止日序 - devDay;
      }
      renderDev(); renderYe(lastState);
    });
    document.querySelector('.ye-dev-row[data-dev-j], #yeDev').addEventListener('click', function (e) {
      var j = e.target.closest('[data-dev-j]');
      if (j) devJingSet(j.dataset.devJ);
      var s = e.target.closest('[data-dev]');
      if (s) devSet(s.dataset.dev);
    });
    el('yeDevTask').addEventListener('click', function () { devTask('normal'); });
    el('yeDevTaskU').addEventListener('click', function () { devTask('urgent'); });
    el('yeDevTaskOk').addEventListener('click', function () { devTask('ok'); });
    el('yeDevTaskExp').addEventListener('click', function () { devTask('exp'); });
    el('yeDev').addEventListener('click', function (e) {
      var pip = e.target.closest('.ye-pip');
      if (!pip) return;
      var p = pip.dataset.ye;
      devActive = true;
      if (p === '未定') { devMainId = ''; devState = devTree('S0'); }
      else if (p === '闲身') { devMainId = '闲身'; devState = devTree('S1'); }
      else { devMainId = p; devSubId = ''; devState = devTree('S2'); }
      renderYe(window.TJ_STATE);
    });
  }

  /* ============ 注册 ============ */
  window.TJRender = window.TJRender || {};
  window.TJRender['业'] = renderYe;

  function tryMount() {
    var bk = document.getElementById('book');
    if (bk && (bk.getAttribute('data-current') || '时') === '业') {
      renderYe(window.TJ_STATE);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { bindAll(); tryMount(); });
  } else {
    bindAll(); tryMount();
  }
})();
