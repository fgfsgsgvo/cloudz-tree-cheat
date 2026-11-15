// ==UserScript==
// @name         Cloudz 圣诞树 · 答案透视 / 自动爬树 / 秒过 10-10
// @namespace    dsh.local.cloudz
// @version      1.3.0
// @description  读取 /round 接口里的 correct 标记自动点对；先填名字再点「开始答题」（不抢跑）、强制低动效加速、可跳过动画直接提交满分；面板不显示答案表
// @match        https://cloudz.fun/tree/*
// @match        https://c.cloudz.fun/tree/*
// @match        https://*.cloudz.fun/tree/*
// @match        https://cloudz.fun/tree/cn/*
// @match        https://cloudz.fun/tree/*/visit*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/*
 * 工作原理
 * ---------
 * 1) 朋友的答题页在开赛前 GET /tree/api/quizzes/<id>/round?locale=<页面语言>，
 *    响应里每个选项就带 "correct": true/false —— 答案在客户端，不需要猜。
 * 2) 本脚本在 document-start 就把 window.fetch 包一层，把那份 round 响应抄下来，
 *    于是 10 题的正确答案在题目出现在屏幕上之前就已经在手里。
 * 3) 出题时（页面往 .xm-qbox 里塞 .xm-opts），第 k 个 .xm-opts 对应第 k 题，
 *    脚本给正确那张卡打上「✔ 正确」并高亮；自动模式下替你点掉。
 * 4) 「秒过」不走动画：直接 POST /quizzes/<id>/players {playerName, answers, submissionId}，
 *    再按 core.js 的格式写好 localStorage 的 XM_tree_played_<id>，刷新即见 10/10 结果页。
 */

(function () {
  'use strict';

  if (window.__CZ_CHEAT__) return;
  window.__CZ_CHEAT__ = true;

  // 域名不写死：同一个游戏有 cloudz.fun / c.cloudz.fun 两套部署（数据不通），照 XM_CONFIG.api 走
  function apiBase() {
    const c = window.XM_CONFIG;
    if (c && c.api) return String(c.api).replace(/\/+$/, '');
    return location.origin + '/tree/api';
  }
  const LS_SET = 'CZ_CHEAT_SET';
  const LS_PREFIX = 'XM_tree_played_';   // core.js: KEY_PLAYED = 'XM_' + C.game + '_played_'

  const S = {
    quizId: null,
    questions: null,     // round.questions 原样
    answers: null,       // 每题正确选项的「题库 index」（提交用，可能是 0..3 不连续）
    positions: null,     // 每题正确选项在「本题选项数组」里的位置（点 DOM 用，0..n-1）
    optCount: 0,         // 已经出过的 .xm-opts 数量（= 当前第几题）
    seen: new WeakSet(), // 处理过的 .xm-opts
    started: false,
    log: [],
    set: Object.assign({
      mark: true,        // 标出正确答案（卡片上打勾）
      autoClick: true,   // 自动点正确选项
      fast: true,        // 强制 prefers-reduced-motion → 所有动画等待被压到 ≤250ms
      name: '',          // 榜上名字（面板里填，开局前可改）
      delay: 220          // 出题后多久点（毫秒）
    }, readSet())
  };

  window.__CZ_CHEAT_STATE__ = S;   // 调试口：console 里 __CZ_CHEAT_STATE__ 看答案/计数/日志

  // ───────────────────────────── 设置持久化 ─────────────────────────────
  function readSet() {
    try { return JSON.parse(localStorage.getItem(LS_SET) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveSet() {
    try { localStorage.setItem(LS_SET, JSON.stringify(S.set)); } catch (e) {}
  }

  // ───────────────────────────── 小工具 ─────────────────────────────
  function rid(n) {
    const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const b = new Uint8Array(n);
    (window.crypto || window.msCrypto).getRandomValues(b);
    let out = '';
    for (let i = 0; i < n; i++) out += a[b[i] % a.length];
    return out;
  }
  function pageId() {
    const q = window.XM_CONFIG && window.XM_CONFIG.quiz && window.XM_CONFIG.quiz.id;
    if (q) return q;
    const m = location.search.match(/[?&]id=([A-Za-z0-9]+)/);
    if (m) return m[1];
    const p = location.pathname.match(/\/tree\/f\/([A-Za-z0-9]+)/);
    return p ? p[1] : null;
  }
  // 页面自己用什么语言，round 就必须用什么语言去取：
  // /tree/en 的页面拿 ?locale=cn 回来是中文选项，文字匹配会全部落空（这就是"标错答案"的真因）
  function pageLocale() {
    const c = window.XM_CONFIG;
    if (c && c.locale) return String(c.locale);
    const m = location.pathname.match(/\/tree\/([a-z]{2,3})\//);
    return m ? m[1] : 'cn';
  }
  function log(msg) {
    S.log.unshift(new Date().toLocaleTimeString() + '  ' + msg);
    S.log.length = Math.min(S.log.length, 6);
    renderLog();
  }

  // ───────────────────────────── 1. 开跑前：改 matchMedia（加速） ─────────────────────────────
  // core.js 第 13 行：reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  // 而 pause(ms) 在 reduceMotion 下会被压成 min(ms, 250)。改这一处 = 整条动画链提速 3~6 倍，
  // 但 setTimeout 本身不动（API 超时、重连退避都不受影响）。
  const realMatchMedia = window.matchMedia ? window.matchMedia.bind(window) : null;
  if (realMatchMedia) {
    window.matchMedia = function (q) {
      const r = realMatchMedia(q);
      if (S.set.fast && typeof q === 'string' && q.indexOf('prefers-reduced-motion') !== -1) {
        try { Object.defineProperty(r, 'matches', { configurable: true, get: () => true }); } catch (e) {}
      }
      return r;
    };
  }

  // ───────────────────────────── 2. 开跑前：包 fetch，抄 round ─────────────────────────────
  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const p = realFetch(input, init);
    const m = url.match(/\/quizzes\/([A-Za-z0-9]+)\/round(\?|$)/);
    if (m) {
      p.then(function (res) {
        try { res.clone().json().then(j => { if (j && j.questions) ingest(m[1], j); }).catch(() => {}); } catch (e) {}
      }, () => {});
    }
    return p;
  };

  function ingest(quizId, data) {
    const qs = data.questions || [];
    // 注意：round 里每个选项的 index 是「题库里的序号」（0..3，可能不连续），
    // 而页面上只渲染 q.options 这个数组里的那两张卡，顺序 = 数组顺序。
    // 所以：提交用 o.index；点 DOM 用 findIndex(o=>o.correct)。
    const answers = [], positions = [];
    for (const q of qs) {
      const opts = q.options || [];
      const pos = opts.findIndex(o => o.correct);
      answers.push(pos >= 0 ? Number(opts[pos].index) : -1);
      positions.push(pos);
    }
    const sameQuiz = S.quizId === quizId;
    // 已开局就别再换题库：二次抓回来的 round 是**另一次洗牌**，卡片位置和页面上的对不上，
    // 只是把 S.positions 弄脏（这就是线上"标的那张不是答案"的根因之一）。答案文本不会变，够用。
    if (sameQuiz && S.optCount > 0) {
      log('已开局，忽略二次取到的 round（题库 index 未变）');
      return;
    }
    S.optCount = 0;
    S.seen = new WeakSet();
    S.quizId = quizId;
    S.questions = qs;
    S.answers = answers;
    S.positions = positions;
    log('拿到答案' + (sameQuiz ? '（刷新同一轮）' : '') + '：题库 index [' + answers.join(',') + '] / 卡片位置 [' + positions.join(',') + ']');
    renderPanel();
  }

  // ───────────────────────────── 3. 出题：标记 + 自动点 ─────────────────────────────
  const CSS = `
  .cz-hit{outline:3px solid #34d399!important;outline-offset:2px;box-shadow:0 0 0 2px #064e3b inset,0 0 18px rgba(52,211,153,.45)!important;position:relative}
  .cz-badge{position:absolute;top:-10px;right:-8px;z-index:9;background:#34d399;color:#04211a;font:800 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;padding:4px 7px;border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,.35);pointer-events:none;white-space:nowrap}
  #cz-panel{position:fixed;left:10px;bottom:10px;z-index:2147483000;width:min(360px,92vw);box-sizing:border-box;
    background:rgba(12,20,38,.94);color:#e5eefc;border:1px solid rgba(120,180,255,.28);border-radius:14px;
    font:13px/1.45 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.45);
    backdrop-filter:blur(8px);overflow:hidden}
  #cz-panel .cz-hd{display:flex;align-items:center;gap:8px;padding:9px 11px;cursor:pointer;background:linear-gradient(90deg,rgba(52,211,153,.16),transparent)}
  #cz-panel .cz-hd b{font-size:13px}
  #cz-panel .cz-hd .cz-sp{flex:1}
  #cz-panel .cz-hd .cz-min{opacity:.7;font-size:11px}
  #cz-panel .cz-bd{display:block;padding:4px 11px 11px}
  #cz-panel.is-min .cz-bd{display:none}
  #cz-panel .cz-row{display:flex;align-items:center;gap:8px;margin:7px 0;flex-wrap:wrap}
  #cz-panel .cz-row label{display:flex;align-items:center;gap:5px;cursor:pointer;user-select:none;font-size:12px;opacity:.95}
  #cz-panel input[type=text]{flex:1;min-width:96px;background:#0b1424;border:1px solid rgba(120,180,255,.3);color:#e5eefc;border-radius:8px;padding:5px 8px;font-size:12px}
  #cz-panel .cz-btn{background:linear-gradient(180deg,#34d399,#10b981);color:#04211a;border:0;border-radius:9px;padding:7px 10px;font-weight:800;font-size:12px;cursor:pointer}
  #cz-panel .cz-btn.alt{background:linear-gradient(180deg,#93c5fd,#60a5fa);color:#0b1424}
  #cz-panel .cz-btn.ghost{background:transparent;color:#9fb6d6;border:1px solid rgba(120,180,255,.3);font-weight:600}
  #cz-panel .cz-list{max-height:34vh;overflow:auto;border-top:1px solid rgba(120,180,255,.15);margin-top:6px;padding-top:6px}
  #cz-panel .cz-ok{font-size:12px;color:#6ee7b7;font-weight:700}
  #cz-panel .cz-q{font-size:11.5px;opacity:.75;margin-top:6px}
  #cz-panel .cz-a{font-size:12.5px;color:#6ee7b7;font-weight:700}
  #cz-panel .cz-log{font:11px/1.5 ui-monospace,Consolas,monospace;color:#8aa4c8;border-top:1px solid rgba(120,180,255,.15);margin-top:6px;padding-top:5px;white-space:pre-wrap;max-height:72px;overflow:auto}
  #cz-panel .cz-tip{font-size:11px;opacity:.6;margin-top:4px}
  `;

  function styleOnce() {
    if (document.getElementById('cz-style')) return;
    const st = document.createElement('style');
    st.id = 'cz-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  // 题干文本匹配：比「第几个 .xm-opts」更抗错位（页面重绘/二次抓 round 都不会串题）
  // 返回 0 = 这道题在手里的 round 里根本没有 → 说明换树了 / 缓存是别人的题库
  function normText(s) { return String(s || '').replace(/\s+/g, ''); }
  function questionIndexFromCard(opts, fallbackK) {
    if (!S.questions) return fallbackK;
    const box = opts.parentElement;
    const card = box && box.querySelector('.xm-q');
    if (!card) return fallbackK;
    const t = normText(card.textContent);
    if (!t) return fallbackK;
    const nm = (window.XM_CONFIG && window.XM_CONFIG.quiz && window.XM_CONFIG.quiz.name) || '';
    for (let i = 0; i < S.questions.length; i++) {
      const raw = normText(String(S.questions[i].question || '').replace(/userName/g, nm));
      if (raw && (t === raw || t.indexOf(raw) !== -1 || raw.indexOf(t) !== -1)) return i + 1;
    }
    return 0;
  }

  // 选项文本匹配：每次请求 round 时「给哪两张卡、谁在前」都会重洗，
  // 而且**必须用页面自己的语言**（/en 页面拿 cn 的 round 回来是中文，文本永远对不上）。
  function normT(s) { return String(s || '').replace(/\s+/g, ''); }
  function pickButton(opts, k) {
    const q = S.questions && S.questions[k - 1];
    if (!q) return null;
    const pos = S.positions ? S.positions[k - 1] : -1;
    const nmv = (window.XM_CONFIG && window.XM_CONFIG.quiz && window.XM_CONFIG.quiz.name) || '';
    const want = normT(pos >= 0 && q.options[pos] ? String(q.options[pos].text || '').replace(/userName/g, nmv) : '');
    // 先全量按文字找（位置只作兜底，绝不先信位置）
    if (want) {
      for (let i = 0; i < opts.children.length; i++) {
        if (normT(opts.children[i].textContent).indexOf(want) !== -1) {
          return { btn: opts.children[i], pos: i, byText: true };
        }
      }
    }
    const byPos = pos >= 0 ? opts.children[pos] : null;
    return byPos ? { btn: byPos, pos: pos, byText: false } : null;
  }

  function paint(opts, k) {
    const pick = pickButton(opts, k);
    if (!pick || !pick.btn) { log('第 ' + k + ' 题选项对不上（' + opts.children.length + ' 张）'); return; }
    const btn = pick.btn;
    if (!pick.byText) log('Q' + k + '：选项文字没对上，只能按位置点（可能不准）');
    // 只有文字确认过才打「✔ 正确」——不打没把握的标
    if (S.set.mark && pick.byText) {
      btn.classList.add('cz-hit');
      if (!btn.querySelector('.cz-badge')) {
        const b = document.createElement('span');
        b.className = 'cz-badge';
        b.textContent = '✔ 正确';
        btn.appendChild(b);
      }
    }
    if (S.set.autoClick) {
      setTimeout(function () {
        if (!btn.isConnected) return;
        btn.click();
        log('Q' + k + ' → 点第 ' + (pick.pos + 1) + ' 张' + (pick.byText ? '（按文字）' : '（位置兜底）')
          + ' · ' + String(btn.textContent || '').replace(/✔\s*正确/, '').trim().slice(0, 18));
      }, Math.max(0, S.set.delay | 0));
    } else {
      log('Q' + k + ' → 第 ' + (pick.pos + 1) + ' 张：' + String(btn.textContent || '').replace(/✔\s*正确/, '').trim().slice(0, 18));
    }
  }

  function processOpts(opts) {
    if (!opts) return;
    if (S.seen.has(opts)) return;
    S.seen.add(opts);
    S.optCount += 1;
    const k = questionIndexFromCard(opts, 0);
    if (k > 0) { paint(opts, k); return; }
    // 手里这份 round 对不上这道题 = 换了一棵树（或 bfcache 回来的旧状态）→ 重新取题再画
    const id = pageId();
    log('题干对不上手里的题库，重取 round：' + (id || '?'));
    (id ? fetchRound(id) : Promise.reject(new Error('no id')))
      .then(function () { paint(opts, questionIndexFromCard(opts, S.optCount) || S.optCount); })
      .catch(function (e) { log('重取失败：' + (e && e.message)); paint(opts, S.optCount); });
  }

  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.classList && root.classList.contains('xm-opts')) processOpts(root);
    const list = root.querySelectorAll ? root.querySelectorAll('.xm-opts') : [];
    for (let i = 0; i < list.length; i++) processOpts(list[i]);
  }

  // 名字输入框与页面自带的 .xm-input 双向同步；不自动点「开始爬」，把节奏交给你
  function nameOfPage() {
    const el = document.querySelector('.xm-input');
    return el ? String(el.value || '').trim() : '';
  }

  function syncNameToPage(value) {
    const el = document.querySelector('.xm-input');
    if (!el || el.value === value) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function prefillName() {
    const el = document.querySelector('.xm-input');
    if (!el || S.started) return;
    if (el.value) return;
    const want = (S.set.name || '').trim();
    if (!want) return;
    el.value = want;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    log('已把你保存的名字填进输入框：' + want + '（可以改，改完点「开始答题」）');
  }

  // 唯一入口：填好名字 → 点「开始答题」→ 页面才开始出第一题
  function startGame() {
    const cta = document.querySelector('.xm-btn.is-gold');
    if (!cta) { log('现在不在邀请页（已经在答题/看结果了）'); return; }
    if (S.started) { log('已经开始了'); return; }
    const nm = (nameOfPage() || (S.set.name || '').trim() || '满分选手').slice(0, 15);
    S.set.name = nm; saveSet();
    syncNameToPage(nm);
    const nmEl = panel && panel.querySelector('[data-cz="name"]');
    if (nmEl && nmEl.value !== nm) nmEl.value = nm;
    S.started = true;
    cta.click();
    log('开始答题：' + nm);
    setStartState();
  }

  function setStartState() {
    if (!panel) return;
    const b = panel.querySelector('[data-cz="start"]');
    if (!b) return;
    const inInvite = !!document.querySelector('.xm-btn.is-gold');
    const wantText = S.started ? '答题中…' : (inInvite ? '开始答题' : '等待邀请页');
    const wantDis = S.started || !inInvite;
    // 幂等写入：MutationObserver 会因为 textContent 变更再次触发，无限重入会把页面卡死
    if (b.textContent !== wantText) b.textContent = wantText;
    if (b.disabled !== wantDis) b.disabled = wantDis;
  }

  // ───────────────────────────── 4. 「秒过」：直接 POST 满分答卷 ─────────────────────────────
  async function fetchRound(quizId) {
    const r = await realFetch(apiBase() + '/quizzes/' + quizId + '/round?locale=' + encodeURIComponent(pageLocale()), {
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin'
    });
    const j = await r.json();
    if (!j || !j.questions) throw new Error('取题失败 ' + r.status);
    ingest(quizId, j);
    return S.answers;
  }

  async function instantSubmit() {
    const quizId = pageId();                     // 以当前页面为准，绝不用上一棵树缓存下来的 id
    if (!quizId) { log('拿不到树 id（URL 里没有 ?id= 且 XM_CONFIG 还没就绪）'); return; }
    setBusy(true);
    try {
      // 换树 / bfcache 回来时 S.answers 可能还是别人那棵树的 → 必须按 id 对齐后重取
      const answers = (S.quizId === quizId && S.answers && S.answers.length)
        ? S.answers
        : await fetchRound(quizId);
      const tok = await (await realFetch(apiBase() + '/token', {
        headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store'
      })).json();
      // 名字优先级：页面上已经打好的 > 面板里保存的 > 默认
      const nm = (nameOfPage() || (S.set.name || '').trim() || '满分选手').slice(0, 15);
      S.set.name = nm; saveSet();
      const body = { playerName: nm, answers: answers, submissionId: rid(24) };
      const res = await realFetch(apiBase() + '/quizzes/' + quizId + '/players', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRF-TOKEN': tok.token
        },
        body: JSON.stringify(body)
      });
      const j = await res.json();
      if (!j.success) { log('提交被拒：' + (j.message || res.status)); setBusy(false); return; }
      const p = j.player || {};
      // 按 core.js 的格式写"已玩过"，刷新后直接进结果页
      try {
        localStorage.setItem(LS_PREFIX + quizId, JSON.stringify({
          id: p.id, name: body.playerName, score: p.score, ending: p.ending,
          perfect: p.perfect, key: j.playerKey || null, top: !!p.top
        }));
        localStorage.removeItem('XM_tree_pending');
      } catch (e) {}
      log('已提交 ' + p.score + '/10 · ' + p.ending + (p.top ? ' · 顶枝' : '') + ' → 刷新');
      setTimeout(() => location.reload(), 500);
    } catch (e) {
      log('秒过失败：' + (e && e.message ? e.message : e));
      setBusy(false);
    }
  }

  function resetLocal() {
    const id = S.quizId || pageId();
    try {
      if (id) localStorage.removeItem(LS_PREFIX + id);
      localStorage.removeItem('XM_tree_pending');
    } catch (e) {}
    log('已清本地「已玩过」记录 → 刷新');
    setTimeout(() => location.reload(), 300);
  }

  // ───────────────────────────── 5. 面板 ─────────────────────────────
  let panel, bodyEl, listEl, logEl, busy = false;
  function setBusy(v) { busy = v; renderPanel(); }

  function renderLog() {
    if (logEl) logEl.textContent = S.log.join('\n');
  }

  function renderPanel() {
    if (!panel) return;
    const qs = S.questions || [];
    const nm = (window.XM_CONFIG && window.XM_CONFIG.quiz && window.XM_CONFIG.quiz.name) || 'SN';
    const id = pageId() || S.quizId || '?';
    const hd = panel.querySelector('[data-cz="hd"] b');
    if (hd) hd.textContent = '圣诞树作弊 · ' + nm + '（' + id + '）';
    const tip = panel.querySelector('[data-cz="tip"]');
    if (tip) tip.textContent = '站点 ' + location.host + ' · API ' + apiBase();
    // 只在状态行报「有没有答案」，不在界面上摊开答案表
    if (listEl) {
      listEl.innerHTML = qs.length
        ? '<div class="cz-ok">✔ 答案已就位（' + qs.length + ' 题）· 填好名字点「开始答题」</div>'
        : '<div class="cz-tip">正在读取题目…</div>';
    }
    const btn = panel.querySelector('[data-cz="instant"]');
    if (btn) { btn.disabled = busy; btn.textContent = busy ? '提交中…' : '秒过 10/10'; }
    setStartState();
  }

  function buildPanel() {
    styleOnce();
    panel = document.createElement('div');
    panel.id = 'cz-panel';
    panel.innerHTML =
      '<div class="cz-hd" data-cz="hd">🌲 <b>圣诞树作弊</b><span class="cz-sp"></span><span class="cz-min" data-cz="min">收起</span></div>' +
      '<div class="cz-bd">' +
        '<div class="cz-row">' +
          '<label><input type="checkbox" data-cz="mark">标答案</label>' +
          '<label><input type="checkbox" data-cz="autoClick">自动点选</label>' +
          '<label><input type="checkbox" data-cz="fast">加速</label>' +
        '</div>' +
        '<div class="cz-row"><input type="text" data-cz="name" maxlength="15" placeholder="先写名字（可改）"><button class="cz-btn" data-cz="start">开始答题</button></div>' +
        '<div class="cz-row"><button class="cz-btn alt" data-cz="instant">秒过 10/10</button><button class="cz-btn ghost" data-cz="reset">清本地记录</button></div>' +
        '<div class="cz-list" data-cz="list"></div>' +
        '<div class="cz-log" data-cz="log"></div>' +
        '<div class="cz-tip" data-cz="tip">答案来自 /round 接口的 correct 字段；「开始答题」= 用你写好的名字开局。</div>' +
      '</div>';
    bodyEl = panel.querySelector('.cz-bd');
    listEl = panel.querySelector('[data-cz="list"]');
    logEl = panel.querySelector('[data-cz="log"]');

    const cb = {
      mark: panel.querySelector('[data-cz="mark"]'),
      autoClick: panel.querySelector('[data-cz="autoClick"]'),
      fast: panel.querySelector('[data-cz="fast"]')
    };
    Object.keys(cb).forEach(k => {
      cb[k].checked = !!S.set[k];
      cb[k].addEventListener('change', function () {
        S.set[k] = cb[k].checked; saveSet(); log(k + ' = ' + cb[k].checked);
      });
    });

    // 面板名字 ↔ 页面输入框：两个方向都通，随你改哪个
    const nameIn = panel.querySelector('[data-cz="name"]');
    nameIn.value = S.set.name || '';
    const pushName = function () {
      S.set.name = String(nameIn.value || '').trim();
      saveSet();
      syncNameToPage(S.set.name);
      setStartState();
    };
    nameIn.addEventListener('input', pushName);
    nameIn.addEventListener('change', pushName);
    nameIn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); pushName(); startGame(); }
    });

    panel.querySelector('[data-cz="hd"]').addEventListener('click', function () {
      panel.classList.toggle('is-min');
      panel.querySelector('[data-cz="min"]').textContent = panel.classList.contains('is-min') ? '展开' : '收起';
    });
    panel.querySelector('[data-cz="start"]').addEventListener('click', startGame);
    panel.querySelector('[data-cz="instant"]').addEventListener('click', instantSubmit);
    panel.querySelector('[data-cz="reset"]').addEventListener('click', resetLocal);
    document.body.appendChild(panel);
    renderPanel();
    renderLog();
  }

  // ───────────────────────────── 6. 启动 ─────────────────────────────
  function resetForPage() {
    // 换树 / 从 bfcache 回来：把上一棵树的状态清干净，再按本页的 id 重取
    const id = pageId();
    if (id && id === S.quizId) return;
    S.questions = null; S.answers = null; S.positions = null;
    S.optCount = 0; S.seen = new WeakSet(); S.started = false;
    log('页面换树 → ' + (id || '?') + ' @ ' + location.host);
    renderPanel();
    if (id) fetchRound(id).catch(function (e) { log('重取失败：' + (e && e.message)); });
  }

  function boot() {
    buildPanel();
    // round 可能在面板建好之前就已经抓到了
    renderPanel();
    const mo = new MutationObserver(function (muts) {
      let touchPage = false;
      for (let i = 0; i < muts.length; i++) {
        const m = muts[i];
        if (m.type !== 'childList') continue;
        // 自己面板里的 DOM 变动直接忽略：否则 setStartState/renderPanel 的写入会反过来再触发本回调
        if (panel && m.target && panel.contains(m.target)) continue;
        touchPage = true;
        for (let j = 0; j < m.addedNodes.length; j++) scan(m.addedNodes[j]);
      }
      if (!touchPage) return;
      prefillName();      // 邀请页出现时，把你上次的名字填进去（可以改）
      setStartState();    // 「开始答题」按钮跟着邀请页的生死变灰/变亮
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    prefillName();
    setStartState();
    // 页面自己的输入框被改动时，反向同步到面板
    document.addEventListener('input', function (e) {
      const t = e.target;
      if (!t || !t.classList || !t.classList.contains('xm-input')) return;
      S.set.name = String(t.value || '').trim();
      saveSet();
      const nameIn = panel && panel.querySelector('[data-cz="name"]');
      if (nameIn && nameIn.value !== t.value) nameIn.value = t.value;
    }, true);
    // 兜底：2.5s 内还没抓到 round（钩子没命中 / 页面缓存）才自己拉一次，
    // 免得和页面自己的那次请求抢跑、二次 ingest。
    setTimeout(function () {
      if (S.quizId) return;
      const id = pageId();
      if (id) fetchRound(id).catch(function (e) { log('兜底取题失败：' + (e && e.message)); });
    }, 2500);
    // bfcache（浏览器前进/后退）不会重跑脚本，状态会停在上一棵树 → 这里兜住
    window.addEventListener('pageshow', function (e) { if (e.persisted) resetForPage(); });
    window.addEventListener('popstate', function () { setTimeout(resetForPage, 0); });
    log('已挂载 @ ' + location.host);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();






