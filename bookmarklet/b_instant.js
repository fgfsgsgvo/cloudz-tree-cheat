/* 秒过：不问不看动画，直接提交满分答卷 → 自动刷新见结果页
 * 用 prompt 问名字（留空 = 满分选手）
 */
(async () => {
  // 域名不写死：cloudz.fun 与 c.cloudz.fun 是两套数据，按页面自己的 XM_CONFIG.api 走
  const A = ((window.XM_CONFIG && window.XM_CONFIG.api) || (location.origin + '/tree/api')).replace(/\/+$/, '');
  const cfg = window.XM_CONFIG || {};
  const id = (cfg.quiz && cfg.quiz.id) || (location.search.match(/[?&]id=([A-Za-z0-9]+)/) || [])[1];
  const rid = n => [...crypto.getRandomValues(new Uint8Array(n))]
    .map(b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]).join('');

  const r = await (await fetch(`${A}/quizzes/${id}/round?locale=cn`, {
    headers: { Accept: 'application/json' }, credentials: 'same-origin'
  })).json();
  const answers = (r.questions || []).map(q => {
    const o = q.options.find(x => x.correct);
    return o ? o.index : 0;
  });
  const nm = (prompt('榜上显示的名字（≤15 字）', '满分选手') || '满分选手').trim().slice(0, 15) || '满分选手';
  const tok = await (await fetch(A + '/token', {
    headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store'
  })).json();

  const res = await fetch(`${A}/quizzes/${id}/players`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-TOKEN': tok.token
    },
    body: JSON.stringify({ playerName: nm, answers, submissionId: rid(24) })
  });
  const j = await res.json();
  console.log(j);
  if (!j.success) { alert('提交失败：' + (j.message || res.status)); return; }
  localStorage.setItem('XM_tree_played_' + id, JSON.stringify({
    id: j.player.id, name: nm, score: j.player.score, ending: j.player.ending,
    perfect: j.player.perfect, key: j.playerKey || null, top: !!j.player.top
  }));
  localStorage.removeItem('XM_tree_pending');
  console.log(`已提交 ${j.player.score}/10 · ${j.player.ending}` + (j.player.top ? ' · 顶枝' : ''));
  location.reload();
})();

