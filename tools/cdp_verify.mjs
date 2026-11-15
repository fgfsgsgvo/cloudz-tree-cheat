#!/usr/bin/env node
/**
 * cdp_verify.mjs — 用本地 Chrome（headless + CDP）真机回归 cloudz 圣诞树作弊脚本
 *
 * 做两件事（都在「一次性测试树」上跑，跑完由调用方删树）：
 *   A. UI 路径：自动开局 → 10 题自动点对 → 页面自己 POST → localStorage 记到 10/10
 *   B. 秒过路径：清痕迹 → 点「秒过 10/10」→ 直接 POST 满分 → localStorage 记到 10/10
 *
 * 用法：
 *   node tools/cdp_verify.mjs --url "https://cloudz.fun/tree/cn/visit?id=<id>" \
 *        --script "userscript/cloudz-tree-cheat.user.js" [--port 9333] [--timeout 150]
 *
 * 退出码：0 = A 和 B 都通过；1 = 有阶段失败；2 = 起不来浏览器
 */

import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
    return acc;
  }, [])
);

const URL_TARGET = args.url;
const SCRIPT_PATH = args.script || 'userscript/cloudz-tree-cheat.user.js';
const PORT = Number(args.port || 9333);
const TIMEOUT = Number(args.timeout || 150) * 1000;
const QA = (args.quiz || (URL_TARGET || '').match(/[?&]id=([A-Za-z0-9]+)/)?.[1]) || '';

if (!URL_TARGET || !QA) {
  console.error('需要 --url 且 URL 里要有 id=');
  process.exit(2);
}

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.error('[cdp]', ...a);

async function pickChrome() {
  const { access } = await import('node:fs/promises');
  for (const c of CHROME_CANDIDATES) {
    try { await access(c); return c; } catch {}
  }
  throw new Error('找不到 Chrome/Edge，用 CHROME_PATH 指定');
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); }
      }, 30000);
    });
  }
}

async function connectWS(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('ws error')), { once: true });
  });
  return ws;
}

async function main() {
  const exe = await pickChrome();
  const profile = await mkdtemp(path.join(tmpdir(), 'cz-cheat-'));
  const userScript = await readFile(SCRIPT_PATH, 'utf8');

  const chrome = spawn(exe, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--mute-audio',
    '--window-size=430,932',
    '--hide-scrollbars',
    'about:blank'
  ], { stdio: 'ignore' });

  const cleanup = async () => {
    try { chrome.kill(); } catch {}
    await sleep(400);
    try { await rm(profile, { recursive: true, force: true }); } catch {}
  };

  // 等调试端口
  let version = null;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      version = await r.json();
      break;
    } catch { await sleep(300); }
  }
  if (!version) { await cleanup(); throw new Error('调试端口没起来'); }

  const ws = await connectWS(version.webSocketDebuggerUrl);
  const cdp = new CDP(ws);

  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    // 关键：document-start 注入（在 tree.js/core.js 之前，才能包住 fetch / matchMedia）
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: userScript }, sessionId);

    const evaluate = async (expression) => {
      const r = await cdp.send('Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
      return r.result?.value;
    };

    const readPlayed = () => evaluate(`(()=>{try{return JSON.parse(localStorage.getItem('XM_tree_played_${QA}')||'null')}catch(e){return null}})()`);
    const waitPlayed = async (ms) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        const p = await readPlayed();
        if (p && p.score != null) return p;
        await sleep(900);
      }
      return null;
    };

    const out = { quiz: QA, stages: {} };

    // ── A：UI 自动爬树 ───────────────────────────────────────────────
    log('A: navigate', URL_TARGET);
    await cdp.send('Page.navigate', { url: URL_TARGET }, sessionId);
    await sleep(3500);
    out.stages.panelMounted = await evaluate(`!!document.getElementById('cz-panel')`);
    out.stages.configSeen = await evaluate(`(()=>{const c=window.XM_CONFIG;return c?{quiz:c.quiz&&c.quiz.id,api:c.api}:null})()`);

    // 答案是否就位（面板不再摊开答案表，只看状态里的 answers 长度）
    let answersSeen = 0;
    for (let i = 0; i < 40; i++) {
      answersSeen = await evaluate(`(((window.__CZ_CHEAT_STATE__||{}).answers||[]).length)`);
      if (answersSeen >= 10) break;
      await sleep(400);
    }
    out.stages.answerReady = answersSeen;

    // 「先改名字，再开始」：在面板里改名 → 页面输入框同步 → 点「开始答题」
    const CUSTOM = '改名测试';
    out.stages.nameSync = await evaluate(`(()=>{
      const inp=document.querySelector('#cz-panel [data-cz="name"]');
      const st=document.querySelector('#cz-panel [data-cz="start"]');
      if(!inp||!st) return null;
      inp.value=${JSON.stringify(CUSTOM)};
      inp.dispatchEvent(new Event('input',{bubbles:true}));
      return {pageName:((document.querySelector('.xm-input')||{}).value||null), startDisabled:!!st.disabled};
    })()`);
    out.stages.startClicked = await evaluate(`(()=>{const st=document.querySelector('#cz-panel [data-cz="start"]');if(!st||st.disabled)return false;st.click();return true})()`);

    const playedA = await (async () => {
      const t0 = Date.now();
      let maxBadge = 0, maxRight = 0, maxOpts = 0;
      while (Date.now() - t0 < TIMEOUT) {
        const snap = await evaluate(`(()=>{
          const p=(()=>{try{return JSON.parse(localStorage.getItem('XM_tree_played_${QA}')||'null')}catch(e){return null}})();
          return {p:p,
            b:document.querySelectorAll('.cz-badge').length,
            r:document.querySelectorAll('.xm-opt.is-right').length,
            o:document.querySelectorAll('.xm-opt').length,
            s:(window.__CZ_CHEAT_STATE__||{}).optCount||0};
        })()`);
        if (snap.b > maxBadge) maxBadge = snap.b;
        if (snap.r > maxRight) maxRight = snap.r;
        if (snap.o > maxOpts) maxOpts = snap.o;
        if (snap.p && snap.p.score != null) {
          out.stages.maxBadges = maxBadge;
          out.stages.maxRight = maxRight;
          out.stages.maxOptBtns = maxOpts;
          out.stages.optsSeen = snap.s;
          return snap.p;
        }
        await sleep(700);
      }
      out.stages.maxBadges = maxBadge;
      out.stages.maxRight = maxRight;
      out.stages.maxOptBtns = maxOpts;
      return null;
    })();
    out.stages.uiClimb = playedA
      ? { score: playedA.score, ending: playedA.ending, perfect: playedA.perfect, top: playedA.top, name: playedA.name }
      : null;
    out.stages.nameOnBoard = playedA ? playedA.name : null;
    out.stages.nameMatches = !!(playedA && playedA.name === CUSTOM);

    // ── B：秒过 ─────────────────────────────────────────────────────
    log('B: instant submit');
    await evaluate(`localStorage.removeItem('XM_tree_played_${QA}');localStorage.removeItem('XM_tree_pending');location.reload();1`);
    await sleep(4000);
    const clicked = await evaluate(`(()=>{const b=document.querySelector('#cz-panel [data-cz="instant"]');if(!b)return false;b.click();return true})()`);
    out.stages.instantClicked = !!clicked;
    const playedB = await waitPlayed(60000);
    out.stages.instant = playedB ? { score: playedB.score, ending: playedB.ending, perfect: playedB.perfect, top: playedB.top, name: playedB.name } : null;

    out.passA = !!(out.stages.uiClimb && out.stages.uiClimb.score === 10 && out.stages.answerReady === 10 && out.stages.nameMatches);
    out.passB = !!(out.stages.instant && out.stages.instant.score === 10);
    out.pass = out.passA && out.passB;
    console.log(JSON.stringify(out, null, 2));
    return out.pass ? 0 : 1;
  } finally {
    try { ws.close(); } catch {}
    await cleanup();
  }
}

main().then((code) => process.exit(code)).catch(async (e) => {
  console.error('[cdp] FATAL', e && e.message ? e.message : e);
  process.exit(2);
});

