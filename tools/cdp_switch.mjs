#!/usr/bin/env node
/**
 * cdp_switch.mjs — 「换一棵树就不行」的专用回归：同一个标签页里 A → B → 后退回 A
 *
 * 断言：
 *   1) 打开 A：面板里 10 行答案，题干是 A 的
 *   2) 直接跳 B：面板题干换成 B 的（不能残留 A 的题库）
 *   3) B 自动爬完 10/10
 *   4) history.back() 回 A：面板题干再次是 A 的，并且 A 也能自动爬完 10/10
 *
 * 用法: node tools/cdp_switch.mjs --a "https://cloudz.fun/tree/cn/visit?id=<id>" --b "https://c.cloudz.fun/tree/cn/visit?id=<id>"
 */
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, c, i, arr) => {
  if (c.startsWith('--')) a.push([c.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return a;
}, []));
const UA_ = args.a, UB = args.b;
const QA = (UA_ || '').match(/[?&]id=([A-Za-z0-9]+)/)?.[1];
const QB = (UB || '').match(/[?&]id=([A-Za-z0-9]+)/)?.[1];
const PORT = 9337, SCRIPT = args.script || 'userscript/cloudz-tree-cheat.user.js';
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (!UA_ || !UB || !QA || !QB) { console.error('需要 --a 和 --b（都带 id=）'); process.exit(2); }

async function pick() {
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome']) {
    try { await access(c); return c; } catch {}
  }
  throw new Error('no chrome');
}

const exe = await pick();
const profile = await mkdtemp(path.join(tmpdir(), 'cz-sw-'));
const src = await readFile(SCRIPT, 'utf8');
const chrome = spawn(exe, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--disable-gpu', '--mute-audio', '--window-size=430,932', 'about:blank'], { stdio: 'ignore' });

let version;
for (let i = 0; i < 60; i++) { try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); } }
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
let id = 0; const pending = new Map();
ws.addEventListener('message', ev => {
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

const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return r.result?.value;
};
const firstQ = () => ev(`(((window.__CZ_CHEAT_STATE__||{}).questions||[])[0]||{}).question||''`);
const clickStart = () => ev(`(()=>{const b=document.querySelector('#cz-panel [data-cz=\"start\"]');if(!b||b.disabled)return false;b.click();return true})()`);
const rows = () => ev(`(((window.__CZ_CHEAT_STATE__||{}).answers||[]).length)`);
const played = q => ev(`(()=>{try{return JSON.parse(localStorage.getItem('XM_tree_played_p'+'${q}')||'null')}catch(e){return null}})()`);
const playedOf = q => ev(`(()=>{try{return JSON.parse(localStorage.getItem('XM_tree_played_${q}')||'null')}catch(e){return null}})()`);
const waitPlayed = async (q, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const p = await playedOf(q); if (p && p.score != null) return p; await sleep(800); }
  return null;
};

const out = { A: QA, B: QB, stages: {} };
try {
  // 1) A
  await send('Page.navigate', { url: UA_ }, sessionId);
  for (let i = 0; i < 40; i++) { if (await rows() >= 10) break; await sleep(400); }
  out.stages.A_rows = await rows();
  out.stages.A_firstQ = await firstQ();

  // 2) 直接跳 B（同一标签页）
  await send('Page.navigate', { url: UB }, sessionId);
  await sleep(3500);
  for (let i = 0; i < 40; i++) { if (await rows() >= 10) break; await sleep(400); }
  out.stages.B_rows = await rows();
  out.stages.B_firstQ = await firstQ();
  out.stages.B_differs = out.stages.B_firstQ !== out.stages.A_firstQ;

  // 3) B：点面板「开始答题」（现在不再自动开局）
  out.stages.B_start = await clickStart();
  const pB = await waitPlayed(QB, 120000);
  out.stages.B_score = pB ? pB.score : null;

  // 4) 后退回 A
  await ev('history.back();1');
  await sleep(4000);
  for (let i = 0; i < 40; i++) { if (await rows() >= 10) break; await sleep(400); }
  out.stages.A2_rows = await rows();
  out.stages.A2_firstQ = await firstQ();
  out.stages.A_restored = out.stages.A2_firstQ === out.stages.A_firstQ && out.stages.A_firstQ !== '';
  out.stages.A_start = await clickStart();
  const pA = await waitPlayed(QA, 120000);
  out.stages.A_score = pA ? pA.score : null;

  out.pass = out.stages.A_rows === 10 && out.stages.B_rows === 10 && out.stages.B_differs
    && out.stages.B_start && out.stages.B_score === 10
    && out.stages.A_restored && out.stages.A_start && out.stages.A_score === 10;
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  console.error('[switch] FATAL', e.message);
  out.error = e.message;
  console.log(JSON.stringify(out, null, 2));
} finally {
  try { ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  await sleep(300);
  try { await rm(profile, { recursive: true, force: true }); } catch {}
}
process.exit(out.pass ? 0 : 1);


