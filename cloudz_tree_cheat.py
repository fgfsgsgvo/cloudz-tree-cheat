#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cloudz_tree_cheat.py — cloudz.fun「圣诞树」好友问答 · 答案透视 / 满分提交 / 自测闭环

原理（一句话）：朋友的答题页在开赛前 GET /tree/api/quizzes/<id>/round 拿题，
响应里每个选项自带 "correct": true/false —— 正确答案完全在客户端，
服务端只按你回报的 answers 数组重新算分。

子命令：
  key        打印这张树的满分答案表（只读，不改任何数据）
  sheet      导出 Markdown 答案表
  submit     用满分答案直接提交（默认不落数据，加 --yes 才真的 POST）
  board      看树上的成绩榜
  dump       把 round 原始 JSON 落盘

示例：
  python cloudz_tree_cheat.py --url <分享链接> key
  python cloudz_tree_cheat.py --url <分享链接> submit --name <名字> --yes
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import string
import sys
import time
from typing import Any, Dict, List, Optional

try:
    import requests
except ImportError:  # pragma: no cover
    sys.exit("需要 requests：pip install requests")

DEFAULT_HOST = "cloudz.fun"          # 主站
KNOWN_HOSTS = ("cloudz.fun", "c.cloudz.fun")   # 同一套代码的多域名部署：树不互通，id 只在自己那台存在
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
DEFAULT_QUIZ = None            # 不给默认树：必须 --url 或 --quiz 指定
DEFAULT_LOCALE = "cn"


def parse_link(link: str) -> tuple:
    """从任意形态的分享链接里抠出 (host, quiz_id)。

    支持：
      https://<host>/tree/f/<id>
      https://<host>/tree/<loc>/visit?id=<id>
      https://<host>/tree/<loc>/visit?id=<id>&x=1
    """
    if not link:
        return None, None
    m = re.match(r"^(?:https?://)?([^/]+)", link.strip())
    host = m.group(1).lower() if m else None
    q = re.search(r"[?&]id=([A-Za-z0-9]+)", link) or re.search(r"/tree/f/([A-Za-z0-9]+)", link)
    return host, (q.group(1) if q else None)


# ────────────────────────────────────────────── 基础客户端 ──────────────────────────────────────────────
class Cloudz:
    def __init__(self, quiz: str = DEFAULT_QUIZ, locale: str = DEFAULT_LOCALE,
                 host: str = DEFAULT_HOST, api: Optional[str] = None,
                 timeout: int = 30, verbose: bool = False):
        self.quiz = quiz
        self.locale = locale
        self.s = requests.Session()
        self.timeout = timeout
        self.verbose = verbose
        self._token: Optional[str] = None
        self._primed = False
        self._api_override = api
        self.host = ""
        self.site = ""
        self.api = ""
        self.use_host(host or DEFAULT_HOST)

    # —— 域名（多部署：cloudz.fun 与 c.cloudz.fun 是两套数据）——
    def use_host(self, host: str):
        host = re.sub(r"^https?://", "", (host or DEFAULT_HOST).strip().rstrip("/"))
        if host == self.host:
            return
        self.host = host
        self.site = f"https://{host}"
        self.api = (self._api_override or f"{self.site}/tree/api").rstrip("/")
        self.s.cookies.clear()
        self.s.headers.update({"Origin": self.site, "Referer": self.visit_url()})
        self._token = None
        self._primed = False
        self.log("host →", self.host, "api →", self.api)

    def visit_url(self) -> str:
        return f"{self.site}/tree/{self.locale}/visit?id={self.quiz}"

    # —— 内部 ——
    def log(self, *a):
        if self.verbose:
            print("[*]", *a, file=sys.stderr)

    def prime(self):
        """先把游客 cookie 拿到手（CSRF token 是绑 session 的，没 cookie 会 419）。"""
        if self._primed:
            return
        url = self.visit_url()
        r = self.s.get(url, timeout=self.timeout)
        self.log("prime", url, r.status_code, dict(self.s.cookies))
        self._primed = True

    def token(self, force: bool = False) -> str:
        if self._token and not force:
            return self._token
        self.prime()
        r = self.s.get(f"{self.api}/token", headers={"Accept": "application/json",
                                                     "Cache-Control": "no-store"},
                       timeout=self.timeout)
        r.raise_for_status()
        self._token = r.json().get("token") or ""
        self.log("token", self._token)
        return self._token

    def _get(self, path: str, params: Optional[dict] = None) -> dict:
        self.prime()
        r = self.s.get(self.api + path, params=params, headers={
            "Accept": "application/json", "X-Requested-With": "XMLHttpRequest",
            "Referer": self.visit_url(),
        }, timeout=self.timeout)
        return self._json(r)

    def _post(self, path: str, body: dict, user_key: Optional[str] = None, retried: bool = False) -> dict:
        self.prime()
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRF-TOKEN": self.token(),
            "Referer": self.visit_url(),
        }
        if user_key:
            headers["User-Key"] = user_key
        r = self.s.post(self.api + path, data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
                        headers=headers, timeout=self.timeout)
        if r.status_code == 419 and not retried:
            self.log("419 → 换 token 重试")
            self.token(force=True)
            return self._post(path, body, user_key, retried=True)
        return self._json(r)

    def _delete(self, path: str, user_key: str) -> dict:
        self.prime()
        headers = {"Accept": "application/json", "X-Requested-With": "XMLHttpRequest",
                   "X-CSRF-TOKEN": self.token(), "User-Key": user_key}
        r = self.s.delete(self.api + path, headers=headers, timeout=self.timeout)
        return self._json(r)

    @staticmethod
    def _json(r) -> dict:
        try:
            j = r.json()
        except ValueError:
            j = {"success": False, "message": f"非 JSON 响应 HTTP {r.status_code}", "raw": r.text[:400]}
        if r.status_code == 429:
            j.setdefault("message", "限流 429，等 Retry-After 再来")
        if r.status_code >= 400:
            j.setdefault("_status", r.status_code)
        return j

    # —— 业务 ——
    def resolve_quiz(self, quiz: Optional[str] = None) -> dict:
        """把 quiz id 定位到它真正所在那台域名（cloudz.fun 与 c.cloudz.fun 是两套数据）。"""
        q = quiz or self.quiz
        if not q:
            raise RuntimeError("没有树 id：用 --url <分享链接> 或 --quiz <树ID> 指定")
        self.quiz = q
        order = [self.host] + [h for h in KNOWN_HOSTS if h != self.host]
        last = None
        for h in order:
            if h != self.host:
                self.use_host(h)
            else:
                self.prime()
            j = self._get(f"/quizzes/{q}/round", {"locale": self.locale})
            if j.get("success"):
                if order.index(h) > 0:
                    print(f"[host] {q} 不在 {order[0]}，实际在 {h} —— 已自动切过去", file=sys.stderr)
                return j
            last = j
            self.log("host miss", h, j.get("message"))
        raise RuntimeError(f"取题失败：{(last or {}).get('message') or '这张树在已知域名上都找不到'}")

    def round(self, quiz: Optional[str] = None) -> dict:
        """GET /quizzes/<id>/round —— 题目 + 每个选项的 correct 标记（答案就在这里）。"""
        return self.resolve_quiz(quiz)

    def solved(self, quiz: Optional[str] = None) -> Dict[str, Any]:
        """从 round 里算出满分答卷。"""
        data = self.round(quiz)
        questions = data["questions"]
        answers: List[int] = []
        sheet: List[dict] = []
        for i, q in enumerate(questions, 1):
            opts = q["options"]
            right = [o for o in opts if o.get("correct")]
            if not right:
                raise RuntimeError(f"第 {i} 题没有 correct 标记，题目结构变了：{q}")
            ans = int(right[0]["index"])
            answers.append(ans)
            sheet.append({
                "n": i,
                "qid": q.get("id"),
                "question": q.get("question", ""),
                "options": [(int(o["index"]), o.get("text", ""), bool(o.get("correct"))) for o in opts],
                "answer": ans,
                "answerText": right[0].get("text", ""),
            })
        return {
            "quiz": data.get("quiz", {}),
            "sheet": sheet,
            "answers": answers,
            "tree": data.get("tree", {}),
            "csrf": data.get("csrf"),
        }

    def submit(self, name: str, answers: List[int], quiz: Optional[str] = None,
               submission_id: Optional[str] = None) -> dict:
        """POST /quizzes/<id>/players —— 服务端按 answers 重新算分。"""
        q = quiz or self.quiz
        body = {"playerName": name, "answers": answers,
                "submissionId": submission_id or rand_id(24)}
        return self._post(f"/quizzes/{q}/players", body)

    def board(self, quiz: Optional[str] = None, page: int = 1) -> dict:
        if quiz and quiz != self.quiz:
            self.resolve_quiz(quiz)          # 换树先定位域名（cloudz.fun / c.cloudz.fun）
        q = quiz or self.quiz
        params = {"page": page} if page > 1 else None
        return self._get(f"/quizzes/{q}/players", params)

    def delete_quiz(self, quiz: str, user_key: str) -> dict:
        if quiz and quiz != self.quiz:
            self.resolve_quiz(quiz)
        return self._delete(f"/quizzes/{quiz}", user_key)


def rand_id(n: int = 24) -> str:
    a = string.ascii_letters + string.digits
    return "".join(random.choice(a) for _ in range(n))


# ────────────────────────────────────────────── 输出 ──────────────────────────────────────────────
def render_sheet(solved: Dict[str, Any], quiz: str, ascii_only: bool = False) -> str:
    ok = "✔" if not ascii_only else "OK"
    no = "·" if ascii_only else "✗"
    name = solved["quiz"].get("name", quiz)
    lines = [f"# {name} 的圣诞树 · 满分答案表（{quiz}）", "",
             "> 选项顺序每次请求都会重新洗牌（给哪两张、谁在前都变），手动点请按文字找；",
             "> 自动提交只用下面那份 answers 数组（题库 index，题目顺序稳定）。", ""]
    for it in solved["sheet"]:
        q = it["question"].replace("userName", name)
        lines.append(f"**Q{it['n']}. {q}**")
        for idx, text, correct in sorted(it["options"], key=lambda o: o[0]):
            mark = ok if correct else no
            lines.append(f"- {mark} [{idx}] {text}")
        lines.append("")
    top = solved["tree"].get("top")
    if top:
        lines.append(f"> 当前树顶：{top}")
    return "\n".join(lines)


def print_sheet(solved: Dict[str, Any], quiz: str):
    name = solved["quiz"].get("name", quiz)
    tree = solved["tree"]
    print(f"树：{name}（{quiz}）｜语言 {solved['quiz'].get('language')}｜已有 {tree.get('count', 0)} 人爬过"
          + (f"｜树顶 {tree.get('top')}" if tree.get("top") else ""))
    print("选项顺序每次请求都会重洗 —— 手动点按文字找；提交只用最后那份 answers 数组")
    print("─" * 62)
    for it in solved["sheet"]:
        q = it["question"].replace("userName", name)
        print(f"Q{it['n']:>2}. {q}")
        for idx, text, correct in sorted(it["options"], key=lambda o: o[0]):
            print(f"      {'✔ 答案' if correct else '      '}  [{idx}] {text}")
        print(f"      → 点这张卡：{it['answerText']}   （题库 index={it['answer']}，提交用）")
        print()
    print("─" * 62)
    print("满分 answers 数组：" + json.dumps(solved["answers"], ensure_ascii=False))


# ────────────────────────────────────────────── 子命令 ──────────────────────────────────────────────
def cmd_key(c: Cloudz, a) -> int:
    s = c.solved()
    if a.json:
        print(json.dumps({"quiz": c.quiz, "answers": s["answers"],
                          "sheet": s["sheet"], "tree": s["tree"]}, ensure_ascii=False, indent=2))
    else:
        print_sheet(s, c.quiz)
    return 0


def cmd_sheet(c: Cloudz, a) -> int:
    s = c.solved()
    text = render_sheet(s, c.quiz, ascii_only=a.ascii)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"已写入 {os.path.abspath(a.out)}")
    else:
        print(text)
    return 0


def cmd_submit(c: Cloudz, a) -> int:
    s = c.solved()
    name = (a.name or "").strip() or "匿名选手"
    body = {"playerName": name, "answers": s["answers"], "submissionId": a.submission_id or rand_id(24)}
    print(f"目标：{c.quiz}｜名字：{name}｜answers={s['answers']}")
    if not a.yes:
        print("预演（没提交）。真提交加 --yes：")
        print(json.dumps(body, ensure_ascii=False))
        return 0
    r = c.submit(name, s["answers"], None, body["submissionId"])
    if not r.get("success"):
        print(f"失败：{r.get('message')} (HTTP {r.get('_status')})", file=sys.stderr)
        return 2
    p = r.get("player", {})
    print(f"✔ 已上榜：{p.get('score')}/10｜ending={p.get('ending')}｜perfect={p.get('perfect')}"
          f"｜top={p.get('top')}｜playerId={p.get('id')}")
    if r.get("playerKey"):
        print(f"  playerKey={r['playerKey']}（自己的回访钥匙，想再来一次可留着）")
    return 0


def cmd_board(c: Cloudz, a) -> int:
    r = c.board(None, a.page)
    if not r.get("success"):
        print(f"失败：{r.get('message')}", file=sys.stderr)
        return 2
    print(f"共 {r.get('total')} 人｜第 {r.get('page')}/{max(1, -(-int(r.get('total', 0)) // int(r.get('perPage', 50) or 50)))} 页"
          + (f"｜树顶 {r['holder']}" if r.get("holder") else ""))
    for p in r.get("players", []):
        print(f"  {p.get('score')}/10  {p.get('name')}  [{p.get('ending')}]")
    if r.get("you"):
        print("  你：", r["you"])
    return 0


def cmd_dump(c: Cloudz, a) -> int:
    data = c.round()
    out = a.out or f"round_{(c.quiz)}.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"已写入 {os.path.abspath(out)}（{len(data.get('questions', []))} 题）")
    return 0


def cmd_rmquiz(c: Cloudz, a) -> int:
    r = c.delete_quiz(c.quiz, a.user_key)
    print("已删除" if r.get("success") else f"删除失败 {r.get('message')}")
    return 0 if r.get("success") else 2


# ────────────────────────────────────────────── main ──────────────────────────────────────────────
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="cloudz_tree_cheat.py",
        description="cloudz.fun 圣诞树问答 · 答案透视 / 满分提交",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="只读看一眼：  python cloudz_tree_cheat.py --url <分享链接> key\n"
               "真提交一次：  python cloudz_tree_cheat.py --url <分享链接> submit --name <名字> --yes")
    p.add_argument("--url", help="直接给分享链接（自动解析域名 + id）：https://<host>/tree/f/<id>")
    p.add_argument("--host", default=DEFAULT_HOST, help=f"站点域名（默认 {DEFAULT_HOST}；c.cloudz.fun 是另一套数据）")
    p.add_argument("--quiz", default=DEFAULT_QUIZ, help="树 id（不写就用 --url；两个都不给会报错）")
    p.add_argument("--locale", default=DEFAULT_LOCALE, help="语言段（cn/ch/en…，默认 cn）")
    p.add_argument("--api", default=None, help="手写 API 根（默认按 --host 推）")
    p.add_argument("--timeout", type=int, default=30)
    p.add_argument("-v", "--verbose", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)

    k = sub.add_parser("key", help="打印满分答案表")
    k.add_argument("--json", action="store_true", help="输出 JSON")
    k.set_defaults(func=cmd_key)

    sh = sub.add_parser("sheet", help="导出 Markdown 答案表")
    sh.add_argument("--out", help="写文件")
    sh.add_argument("--ascii", action="store_true", help="用 OK/x 代替 ✔/✗")
    sh.set_defaults(func=cmd_sheet)

    su = sub.add_parser("submit", help="用满分答案提交（默认只预演）")
    su.add_argument("--name", help="榜上显示的名字（必填才会真提交）")
    su.add_argument("--yes", action="store_true", help="真的 POST")
    su.add_argument("--submission-id", help="自定义 submissionId（幂等用）")
    su.set_defaults(func=cmd_submit)

    b = sub.add_parser("board", help="看成绩榜")
    b.add_argument("--page", type=int, default=1)
    b.set_defaults(func=cmd_board)

    d = sub.add_parser("dump", help="落盘 round 原始 JSON")
    d.add_argument("--out")
    d.set_defaults(func=cmd_dump)



    rm = sub.add_parser("rmquiz", help="删树（要 userKey）")
    rm.add_argument("--user-key", required=True)
    rm.set_defaults(func=cmd_rmquiz)
    return p


def main(argv: Optional[List[str]] = None) -> int:
    a = build_parser().parse_args(argv)
    host, quiz, locale = a.host, a.quiz, a.locale
    if a.url:
        h2, q2 = parse_link(a.url)
        if h2:
            host = h2
        if q2:
            quiz = q2
        m = re.search(r"/tree/([a-z]{2,3})/(?:visit|f)/", a.url)
        if m and m.group(1) not in ("api",):
            locale = m.group(1)
    # 不内置任何人的树：必须显式给 --url 或 --quiz
    if not quiz:
        print("需要指定树：--url <分享链接>  或  --quiz <树ID>（本工具不内置任何人的树）", file=sys.stderr)
        return 2
    c = Cloudz(quiz=quiz, locale=locale, host=host, api=a.api,
               timeout=a.timeout, verbose=a.verbose)
    try:
        return a.func(c, a)
    except requests.RequestException as e:
        print(f"网络错误：{e}", file=sys.stderr)
        return 4
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 5


if __name__ == "__main__":
    raise SystemExit(main())




