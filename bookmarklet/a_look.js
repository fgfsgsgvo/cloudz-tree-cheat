/* 透视 + 自动点选（控制台 / 书签：先粘贴，再点「开始爬」）
 *
 * 两个坑（实测踩过，写在这里免得你也踩）：
 *  1) round 里选项的 index 是「题库序号」（0..3 不连续），不是卡片位置。
 *  2) 每次请求 round，options 只给 2 张卡，而且「给哪两张、谁在前」都会重新洗牌 ——
 *     所以不能按序号点，必须按「正确选项的文本」在当前卡片里找。
 *     （题目顺序本身是稳定的，提交用的 answers=题库 index 也稳定，所以直接 POST 不会错。）
 */
(async () => {
  // 域名不写死：cloudz.fun 与 c.cloudz.fun 是两套数据，按页面自己的 XM_CONFIG.api 走
  const A = ((window.XM_CONFIG && window.XM_CONFIG.api) || (location.origin + '/tree/api')).replace(/\/+$/, '');
  const cfg = window.XM_CONFIG || {};
  const id = (cfg.quiz && cfg.quiz.id) || (location.search.match(/[?&]id=([A-Za-z0-9]+)/) || [])[1];
  const nm = (cfg.quiz && cfg.quiz.name) || '';
  // 页面语言：/tree/en 必须用 locale=en 取 round，否则拿回来是中文文本，匹配必错
  const LOC = (window.XM_CONFIG && window.XM_CONFIG.locale) || (location.pathname.match(/\/tree\/([a-z]{2,3})\//) || [])[1] || 'cn';

  const norm = s => String(s || '').replace(/\s+/g, '');
  const filled = s => String(s || '').replace(/userName/g, nm);

  const r = await (await fetch(`${A}/quizzes/${id}/round?locale=${encodeURIComponent(LOC)}`, {
    headers: { Accept: 'application/json' }, credentials: 'same-origin'
  })).json();
  const qs = r.questions || [];
  const ans = qs.map(q => { const o = q.options.find(x => x.correct); return o ? o.index : -1; }); // 题库 index（提交用）
  const keys = qs.map(q => { const o = q.options.find(x => x.correct); return norm(filled(o ? o.text : '')); }); // 答案文本（点卡用）

  console.table(qs.map((q, i) => ({
    题: filled(q.question),
    答案: q.options.find(o => o.correct)?.text || '(缺)',
    题库index: ans[i]
  })));
  console.log('满分 answers =', JSON.stringify(ans));
  console.log('提示：选项每次刷新都会重新洗牌，脚本按文字对准，不依赖序号。');

  let k = 0;
  const done = new WeakSet();
  const tick = () => {
    document.querySelectorAll('.xm-opts').forEach(o => {
      if (done.has(o)) return;
      done.add(o);
      const want = keys[k++];
      if (!want) return;
      let hit = null;
      Array.prototype.forEach.call(o.children, b => {
        if (hit) return;
        if (norm(b.textContent).indexOf(want) !== -1) hit = b;
      });
      if (!hit) { console.warn('第 ' + k + ' 题没匹配到答案卡：', want); return; }
      hit.style.outline = '3px solid #34d399';
      hit.style.outlineOffset = '2px';
      setTimeout(() => hit.click(), 160);
    });
  };
  new MutationObserver(tick).observe(document.body, { childList: true, subtree: true });
  tick();
  setInterval(tick, 400);   // 兜底轮询：出题瞬间偶尔早于观察器就绪，靠它补上
  window.__CZ__ = { id, qs, ans, keys };
  console.log('已挂上自动点选：现在点「开始爬」就是 10/10');
})();




