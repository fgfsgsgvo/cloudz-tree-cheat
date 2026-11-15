#!/usr/bin/env node
/**
 * cdp_debug.mjs — 诊断为什么 UI 自动爬树没跑起来（A 阶段）
 * 每 2s 打一次快照：页面阶段、关键节点、面板日志、控制台报错。
 *
 * 用法: node tools/cdp_debug.mjs --url "https://cloudz.fun/tree/cn/visit?id=<id>"
 */
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, c, i, arr) => {
  if (c.startsWith('--')) a.push([c.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return a;
}, []));
const URLT = args.url, SCRIPT = args.script || 'userscript/cloudz-tree-cheat.user.js';
const PORT = 9334, SECS = Number(args.secs || 40);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function pick() {
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) {
    try { await access(c); return c; } catch {}
  }
  throw new Error('no chrome');
}

const exe = await pick();
const profile = await mkdtemp(path.join(tmpdir(), 'cz-dbg-'));
const src = await readFile(SCRIPT, 'utf8');
const chrome = spawn(exe, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--disable-gpu', '--mute-audio', '--window-size=430,932', 'about:blank'], { stdio: 'ignore' });

let version;
for (let i = 0; i < 60; i++) { try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); } }
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });

let id = 0; const pending = new Map(); const consoleMsgs = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.j(new Error(JSON.stringify(m.error))) : p.r(m.result); }
  else if (m.method === 'Runtime.consoleAPICalled') consoleMsgs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  else if (m.method === 'Runtime.exceptionThrown') consoleMsgs.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
});
const send = (method, params = {}, sessionId) => {
  const mid = ++id; const p = { id: mid, method, params }; if (sessionId) p.sessionId = sessionId;
  ws.send(JSON.stringify(p));
  return new Promise((r, j) => { pending.set(mid, { r, j }); setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); j(new Error('timeout ' + method)); } }, 20000); });
};

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Page.addScriptToEvaluateOnNewDocument', { source: src }, sessionId);

const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) return { __err: r.exceptionDetails.text };
  return r.result?.value;
};

await send('Page.navigate', { url: URLT }, sessionId);
await sleep(2500);

const SNAP = `(()=>{
  const q=s=>document.querySelectorAll(s).length;
  const st=window.__CZ_CHEAT_STATE__||null;
  return {
    t:Math.round(performance.now()/1000),
    scene:[...document.querySelectorAll('.xm-scene')].map(e=>e.className).join('|'),
    bodyCls:document.body.className,
    input:q('.xm-input'), gold:q('.xm-btn.is-gold'), btn:q('.xm-btn'),
    opts:q('.xm-opts'), optBtns:q('.xm-opt'), right:q('.xm-opt.is-right'),
    badge:q('.cz-badge'), qbox:(document.querySelector('.xm-qbox')||{}).innerText?.slice(0,60)||'',
    panelLog:(document.querySelector('#cz-panel .cz-log')||{}).textContent||'',
    st: st?{quiz:st.quizId,ans:st.answers,optCount:st.optCount,started:st.started,set:st.set}:null,
    played:(()=>{try{return JSON.parse(localStorage.getItem('XM_tree_played_'+(window.XM_CONFIG?.quiz?.id||''))||'null')}catch(e){return 'err'}})()
  };
})()`;

for (let i = 0; i < SECS / 2; i++) {
  const s = await ev(SNAP);
  console.log(JSON.stringify(s));
  await sleep(2000);
}
console.log('CONSOLE:', JSON.stringify(consoleMsgs.slice(-25), null, 1));
try { ws.close(); } catch {}
try { chrome.kill(); } catch {}
await sleep(300);
try { await rm(profile, { recursive: true, force: true }); } catch {}
process.exit(0);

