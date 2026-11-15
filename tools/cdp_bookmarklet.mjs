#!/usr/bin/env node
/**
 * cdp_bookmarklet.mjs — 在真页面里验证 bookmarklet/a_look.js 与 b_instant.js
 *
 * A: 注入 a_look.js（等于把书签粘进控制台）→ 点「开始爬」→ 等 10/10
 * B: 清痕迹刷新 → 注入 b_instant.js（headless 下 prompt 返回 null，自动用默认名）→ 等 10/10
 *
 * 用法: node tools/cdp_bookmarklet.mjs --url "https://cloudz.fun/tree/cn/visit?id=<id>"
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
const QA = args.quiz || (URLT || '').match(/[?&]id=([A-Za-z0-9]+)/)?.[1];
const PORT = 9336, TIMEOUT = Number(args.timeout || 120) * 1000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!URLT || !QA) { console.error('需要 --url（带 id=）'); process.exit(2); }

async function pick() {
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome']) {
    try { await access(c); return c; } catch {}
  }
  throw new Error('no chrome');
}

const exe = await pick();
const profile = await mkdtemp(path.join(tmpdir(), 'cz-bm-'));
const look = await readFile(args.look || 'bookmarklet/a_look.js', 'utf8');
const instant = await readFile(args.instant || 'bookmarklet/b_instant.js', 'utf8');

const chrome = spawn(exe, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--disable-gpu', '--mute-audio', '--window-size=430,932', 'about:blank'], { stdio: 'ignore' });

let version;
for (let i = 0; i < 60; i++) { try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); } }
if (!version) { try { chrome.kill(); } catch {} process.exit(2); }

const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
let id = 0; const pending = new Map(); const errs = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.j(new Error(JSON.stringify(m.error))) : p.r(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  else if (m.method === 'Log.entryAdded') errs.push('[log] ' + m.params.entry.level + ': ' + m.params.entry.text);
});
const send = (method, params = {}, sessionId) => {
  const mid = ++id, p = { id: mid, method, params }; if (sessionId) p.sessionId = sessionId;
  ws.send(JSON.stringify(p));
  return new Promise((r, j) => { pending.set(mid, { r, j }); setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); j(new Error('timeout ' + method)); } }, 20000); });
};

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Log.enable', {}, sessionId);
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return r.result?.value;
};
const readPlayed = () => ev(`(()=>{try{return JSON.parse(localStorage.getItem('XM_tree_played_${QA}')||'null')}catch(e){return null}})()`);
const waitPlayed = async (ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const p = await readPlayed(); if (p && p.score != null) return p; await sleep(800); }
  return null;
};

const out = { quiz: QA, stages: {} };
try {
  await send('Page.navigate', { url: URLT }, sessionId);
  await sleep(3500);

  // ── A: a_look.js ──────────────────────────────────────────────
  // --mode click：注入 <a href="javascript:…"> 再 .click()，等价于真点书签（受页面 CSP 约束）
  // 注意 javascript: URL 必须把换行压平、% → %25、# → %23，否则代码会被截断/改写
  const toHref = (code) => 'javascript:' + String(code)
    .replace(/\r/g, '').split('\n').map((s) => s.trim()).filter(Boolean).join(' ')
    .replace(/%/g, '%25').replace(/#/g, '%23');
  const runAs = async (code) => {
    if (String(args.mode || 'eval') === 'click') {
      const expr = '(()=>{const a=document.createElement("a");a.href=' + JSON.stringify(toHref(code)) +
        ';document.body.appendChild(a);a.click();a.remove();return true})()';
      return ev(expr);
    }
    return ev(code);
  };
  out.stages.lookEval = await runAs(look);
  out.stages.hasState = await ev(`!!window.__CZ__`);
  out.stages.consoleAnswers = await ev(`JSON.stringify((window.__CZ__||{}).ans||null)`);
  out.stages.inviteInput = await ev(`!!document.querySelector('.xm-input')`);
  const started = await ev(`(()=>{const i=document.querySelector('.xm-input');const b=document.querySelector('.xm-btn.is-gold');
    if(!i||!b)return false;i.value='书签选手';i.dispatchEvent(new Event('input',{bubbles:true}));b.click();return true})()`);
  out.stages.ctaClicked = !!started;
  const pA = await waitPlayed(TIMEOUT);
  out.stages.look = pA ? { score: pA.score, ending: pA.ending, perfect: pA.perfect, top: pA.top } : null;
  out.stages.badgesMax = await ev(`document.querySelectorAll('.xm-opt').length`);

  // ── B: b_instant.js ───────────────────────────────────────────
  await ev(`localStorage.removeItem('XM_tree_played_${QA}');localStorage.removeItem('XM_tree_pending');location.reload();1`);
  await sleep(3500);
  // headless 里 prompt() 会把页面挂住 —— 先替成常量（真人点书签会正常弹框）
  await ev(`window.prompt = () => '书签秒过';1`);
  out.stages.instantEval = await ev('1');
  await runAs(instant);
  const pB = await waitPlayed(60000);
  out.stages.instant = pB ? { score: pB.score, ending: pB.ending, perfect: pB.perfect, top: pB.top } : null;

  out.passA = !!(out.stages.look && out.stages.look.score === 10);
  out.passB = !!(out.stages.instant && out.stages.instant.score === 10);
  out.pass = out.passA && out.passB;
  if (errs.length) out.errors = errs.slice(-5);
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  console.error('[bm] FATAL', e.message);
  out.error = e.message;
  console.log(JSON.stringify(out, null, 2));
} finally {
  try { ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  await sleep(300);
  try { await rm(profile, { recursive: true, force: true }); } catch {}
}
process.exit(out.pass ? 0 : 1);



