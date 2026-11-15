#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_bookmarklet.py — 从 bookmarklet/*.min.js 生成两份成品：

  bookmarklet/bookmarklets.txt   两行 javascript: URL（可直接粘成书签）
  bookmarklet/install.html       拖拽安装页（拖链接到书签栏）

为什么要编码：`javascript:` URL 里 **换行会截断代码、`#` 会被当成 fragment、`%` 会被当成百分号转义**。
所以生成时把换行去掉、`%` → `%25`、`#` → `%23`；控制台里粘贴的仍是原始代码，不需要编码。
"""

import html
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
BM = ROOT / "bookmarklet"

ITEMS = [
    ("a_look.min.js", "① 透视 + 自动点选",
     "在控制台打印一次答案，然后自动点对 10 题；<b>你自己点页面上的「开始爬」</b>才开局，名字自己填。"),
    ("b_instant.min.js", "② 秒过 10/10",
     "弹框问名字 → 直接提交满分答卷 → 自动刷新到结果页（跳过所有动画）。"),
]


def encode_bookmarklet(code: str) -> str:
    """把一段 JS 变成安全的 javascript: URL。"""
    one_line = " ".join(part.strip() for part in code.replace("\r", "").split("\n") if part.strip())
    one_line = one_line.replace("%", "%25").replace("#", "%23")
    return "javascript:" + one_line


def main() -> None:
    codes = {name: (BM / name).read_text(encoding="utf-8").strip() for name, _, _ in ITEMS}

    # ① bookmarklets.txt
    lines = [
        "# cloudz 圣诞树 · 书签（javascript: URL）",
        "# 用法：书签管理器 → 新建书签 → URL 整行粘贴（先打开答题页，再点书签）",
        "# 域名不用改：脚本读页面自己的 XM_CONFIG.api，cloudz.fun / c.cloudz.fun 都吃。",
        "",
    ]
    for i, (name, title, _) in enumerate(ITEMS, 1):
        lines += [f"## {title}", encode_bookmarklet(codes[name]), ""]
    (BM / "bookmarklets.txt").write_text("\n".join(lines), encoding="utf-8")

    # ② install.html
    cards = []
    for i, (name, title, desc) in enumerate(ITEMS, 1):
        href = html.escape(encode_bookmarklet(codes[name]), quote=True)
        raw = html.escape(codes[name], quote=False)
        cards.append(f"""
    <section class="card">
      <h2>{title}</h2>
      <p class="desc">{desc}</p>
      <div class="row">
        <a class="drag" href="{href}" title="拖到书签栏">拖我到书签栏 ⤴</a>
        <button class="copy" data-copy="c{i}">复制代码</button>
        <span class="len">{len(encode_bookmarklet(codes[name]))} 字符</span>
      </div>
      <details><summary>展开代码（控制台粘贴用，未编码）</summary>
        <textarea id="c{i}" readonly spellcheck="false">{raw}</textarea>
      </details>
    </section>""")

    page = f"""<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>cloudz 圣诞树 · 书签安装</title>
<style>
:root{{color-scheme:dark}}
*{{box-sizing:border-box}}
body{{margin:0;padding:32px 18px 64px;background:#0c1220;color:#e5eefc;
  font:15px/1.65 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}}
.wrap{{max-width:760px;margin:0 auto}}
h1{{font-size:22px;margin:0 0 6px}}
.sub{{color:#8aa4c8;font-size:13px;margin:0 0 26px}}
.card{{background:#111b2e;border:1px solid rgba(120,180,255,.16);border-radius:14px;padding:18px 20px;margin:0 0 16px}}
.card h2{{font-size:16px;margin:0 0 4px}}
.desc{{margin:0 0 14px;color:#b9cbe6;font-size:13.5px}}
.row{{display:flex;gap:10px;flex-wrap:wrap;align-items:center}}
.drag{{display:inline-block;padding:9px 16px;border-radius:10px;font-weight:800;color:#04211a;
  background:linear-gradient(180deg,#34d399,#10b981);text-decoration:none;cursor:grab}}
.copy{{padding:9px 14px;border-radius:10px;border:1px solid rgba(120,180,255,.3);background:transparent;
  color:#9fb6d6;font-size:13px;cursor:pointer}}
.copy:active{{transform:translateY(1px)}}
.len{{color:#6b81a3;font-size:12px}}
details{{margin-top:12px}}
summary{{cursor:pointer;color:#8aa4c8;font-size:12.5px}}
textarea{{width:100%;height:120px;margin-top:8px;background:#0b1424;color:#6ee7b7;border:1px solid rgba(120,180,255,.2);
  border-radius:8px;padding:8px;font:11.5px/1.5 ui-monospace,Consolas,monospace;resize:vertical}}
.tips{{margin-top:22px;padding:16px 18px;border-radius:12px;background:#0f1a2b;border:1px dashed rgba(120,180,255,.22);
  font-size:13px;color:#b9cbe6}}
.tips b{{color:#e5eefc}}
.tips ol{{margin:8px 0 0;padding-left:20px}}
kbd{{background:#1b2942;border:1px solid rgba(120,180,255,.25);border-radius:5px;padding:1px 6px;font-size:12px}}
</style>
</head>
<body>
<div class="wrap">
  <h1>cloudz 圣诞树 · 书签安装</h1>
  <p class="sub">先按 <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> 显示书签栏，再把下面绿色按钮拖到书签栏上。</p>
  {''.join(cards)}
  <div class="tips">
    <b>用之前先看三条</b>
    <ol>
      <li>先打开答题页（<code>/tree/f/&lt;id&gt;</code> 或 <code>/tree/&lt;loc&gt;/visit?id=&lt;id&gt;</code>），<b>再点书签</b> —— 书签只在当前页面里执行。</li>
      <li>拖不动就点「复制代码」→ 书签管理器新建书签 → 名称随意 → URL 粘贴整行（必须以 <code>javascript:</code> 开头）。</li>
      <li>别把代码粘进地址栏：浏览器会吃掉 <code>javascript:</code> 前缀。要临时试一次就用 <kbd>F12</kbd> → Console 粘贴。</li>
    </ol>
  </div>
</div>
<script>
document.querySelectorAll('.copy').forEach(function (b) {{
  b.addEventListener('click', function () {{
    var ta = document.getElementById(b.dataset.copy);
    ta.select();
    var ok = false;
    try {{ ok = document.execCommand('copy'); }} catch (e) {{}}
    if (!ok && navigator.clipboard) {{ navigator.clipboard.writeText(ta.value); ok = true; }}
    b.textContent = ok ? '已复制' : '手动 Ctrl+C';
    setTimeout(function () {{ b.textContent = '复制代码'; }}, 1500);
  }});
}});
</script>
</body>
</html>
"""
    (BM / "install.html").write_text(page, encoding="utf-8")

    print(json.dumps({
        "bookmarklets.txt": (BM / "bookmarklets.txt").stat().st_size,
        "install.html": (BM / "install.html").stat().st_size,
        "href_len": {name: len(encode_bookmarklet(code)) for name, code in codes.items()},
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
