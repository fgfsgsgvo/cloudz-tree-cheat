#!/usr/bin/env node
/**
 * cdp_locale_check.mjs — 验证「多语言页面不再标错答案」：不开到底、不提交
 *
 * 做法：注入用户脚本 → 等 round 就绪 → 点「开始答题」→ 只看前几题的
 *      ①「点第 N 张（按文字）」②徽章落在哪张卡上 → 然后刷新中止（不产生成绩）。
 *
 * 用法: node tools/cdp_locale_check.mjs --url "https://cloudz.fun/tree/en/visit?id=XXXX" [--stop 4]
 */
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, c, i, arr) => {
  if (c.startsWith('--')) a.push([c.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return a;
}, []));
const URLT = args.url;
const STOP = Number(args.stop || 4);
const SCRIPT = args.script || 'userscript/cloudz-tree-cheat.user.js';
const PORT = 9338;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!URLT) { console.error('需要 --url'); process.exit(2); }

async function pick() {
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome']) {
    try { await access(c); return c; } catch {}
  }
  throw new Error('no chrome');
}

const exe = await pick();
const profile = await mkdtemp(path.join(tmpdir(), 'cz-loc-'));
const src = await readFile(SCRIPT, 'utf8');
const chrome = spawn(exe, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--disable-gpu', '--mute-audio', '--window-size=430,932', 'about:blank'], { stdio: 'ignore' });

let version;
for (let i = 0; i < 60; i++) { try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); } }
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
let id = 0; const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.j(new Error(JSON.stringify(m.error))) : p.r(m.result); }
});
const send = (method, params = {}, sessionId) => {
  const mid = ++id, p = { id: mid, method, params }; if (sessionId) p.sessionId = sessionId;
  ws.send(JSON.stringify(p));
  return new Promise((r, j) => { pending.set(mid, { r, j }); setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); j(new Error('timeout ' + method)); } }, 25000); });
};

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Page.addScriptToEvaluateOnNewDocument', { source: src }, sessionId);

const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return r.result?.value;
};

const out = { url: URLT, stages: {} };
try {
  await send('Page.navigate', { url: URLT }, sessionId);
  await sleep(3500);

  for (let i = 0; i < 40; i++) {
    if ((await ev(`(((window.__CZ_CHEAT_STATE__||{}).answers||[]).length)`)) >= 10) break;
    await sleep(400);
  }
  out.stages.localeSeen = await ev(`(((window.XM_CONFIG||{}).locale)||'?')`);
  out.stages.stateLocaleUsed = await ev(`(window.__CZ_CHEAT_STATE__ ? (document.querySelector('#cz-panel [data-cz="tip"]')||{}).textContent : null)`);
  // round 里的第 7 题选项文本（用来确认是不是页面语言）
  out.stages.q7Options = await ev(`(()=>{const q=((window.__CZ_CHEAT_STATE__||{}).questions||[])[6];return q?q.options.map(o=>o.text):null})()`);
  out.stages.answers = await ev(`(((window.__CZ_CHEAT_STATE__||{}).answers)||null)`);

  // 改名字 → 开始
  await ev(`(()=>{const i=document.querySelector('#cz-panel [data-cz="name"]');if(!i)return false;i.value='locale-check';i.dispatchEvent(new Event('input',{bubbles:true}));const b=document.querySelector('#cz-panel [data-cz="start"]');if(b&&!b.disabled)b.click();return true})()`);

  // 观察前 STOP 题
  const seen = [];
  for (let t = 0; t < 120 && seen.length < STOP; t++) {
    const snap = await ev(`(()=>{
      const log=(document.querySelector('#cz-panel .cz-log')||{}).textContent||'';
      const lines=log.split('\\n').filter(l=>/点第|按文字|兜底/.test(l));
      const badged=[...document.querySelectorAll('.xm-opt')].filter(b=>b.querySelector('.cz-badge'));
      const picked=[...document.querySelectorAll('.xm-opt.is-right, .xm-opt.is-picked')];
      const cardText=(document.querySelector('.xm-qbox .xm-q')||{}).textContent||'';
      return {lines, badge:[badged[0]?{t:(badged[0].textContent||'').replace(/✔\\s*正确/,'').trim(), hit:badged[0].classList.contains('cz-hit')}:null],
              picked:picked.map(p=>(p.textContent||'').replace(/✔\\s*正确/,'').trim()), cardText};
    })()`);
    for (const l of (snap.lines || [])) {
      const m = l.match(/Q(\d+) → 点第 (\d+) 张(（[^）]*）)?/);
      if (m && !seen.find((s) => s.q === Number(m[1]))) {
        seen.push({ q: Number(m[1]), pos: Number(m[2]), how: (m[3] || '').replace(/[（）]/g, ''), cardText: snap.cardText, badge: snap.badge && snap.badge[0] ? snap.badge[0].t : null, picked: snap.picked });
      }
    }
    if (seen.length >= STOP) break;
    await sleep(700);
  }
  out.stages.answered = seen.sort((a, b) => a.q - b.q);
  out.stages.allByText = out.stages.answered.length >= Math.min(STOP, 4) && out.stages.answered.every((s) => s.how === '按文字');
  out.stages.badgeOnPicked = out.stages.answered.every((s) => !s.badge || (s.picked || []).some((p) => p.indexOf(s.badge) !== -1));
  out.stages.note = '结束后会刷新中止，不产生成绩';

  // 中止：不要跑到 end 避免提交
  await send('Page.reload', {}, sessionId);
  await sleep(800);
  out.pass = !!(out.stages.allByText && out.stages.badgeOnPicked);
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  console.error('[locale] FATAL', e.message);
  out.error = e.message;
  console.log(JSON.stringify(out, null, 2));
} finally {
  try { ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  await sleep(300);
  try { await rm(profile, { recursive: true, force: true }); } catch {}
}
process.exit(out.pass ? 0 : 1);
