# cloudz 圣诞树 · 作弊工具

目标：cloudz.fun 的「圣诞树」好友问答，**任意一棵树**都适用（链接形如 `/tree/f/<id>` 或 `/tree/<loc>/visit?id=<id>`）。
玩法是 10 题猜作者答案：每猜中一格，你的球就往上挪一格，爬到树顶。

---
## 一、怎么用

### A. 用户脚本（推荐）

1. 装 Tampermonkey → 新建脚本 → 粘贴 [`userscript/cloudz-tree-cheat.user.js`](userscript/cloudz-tree-cheat.user.js) → 保存。
2. 打开任意树（`/tree/f/<id>` 或 `/tree/cn/visit?id=<id>`，`c.cloudz.fun` 也行）。
3. 左下角面板：

   ```
   🌲 圣诞树作弊 · 名字（id）
   ☑ 标答案  ☑ 自动点选  ☑ 加速
   [ 先写名字（可改） ]  [ 开始答题 ]
   [ 秒过 10/10 ]        [ 清本地记录 ]
   ✔ 答案已就位（10 题）· 填好名字点「开始答题」
   ```

4. **先在输入框写/改名字**（它和页面自带输入框双向同步），再点 **「开始答题」**（或按 Enter）——
   脚本不会抢在你打字前开局。之后 10 题自动全对。

   其他按钮：**秒过 10/10** 跳过所有动画直接提交满分（同用这个名字）；**清本地记录** 清掉
   `localStorage['XM_tree_played_<id>']` 才能重玩同一棵树。

### B. 书签 / 控制台

[`bookmarklet/bookmarklets.txt`](bookmarklet/bookmarklets.txt) 里两行成品（`javascript:` 开头），整行做成书签，或直接粘进 F12 控制台：

- **透视 + 自动点选**：控制台打印一次答案，然后自动点对 10 题（自己点页面上的「开始爬」）。
- **秒过**：弹框问名字 → 直接提交 → 自动刷新到结果页。

可读版：[`a_look.js`](bookmarklet/a_look.js)、[`b_instant.js`](bookmarklet/b_instant.js)。

### C. 命令行

```powershell
cd cloudz-tree-cheat

# 看答案（只读，终端打印；不写任何文件）
python cloudz_tree_cheat.py --url "<分享链接>" key

# 满分上榜（先预演，加 --yes 才真发）
python cloudz_tree_cheat.py --url "<分享链接>" submit --name <你的名字>
python cloudz_tree_cheat.py --url "<分享链接>" submit --name <你的名字> --yes

# 其他
python cloudz_tree_cheat.py --url "<分享链接>" board          # 成绩榜
python cloudz_tree_cheat.py --url "<分享链接>" sheet --out 答案.md   # 现场导出（不要就删）
python cloudz_tree_cheat.py selftest                          # 零污染自测：自建树→满分→校验→删树
python cloudz_tree_cheat.py --host c.cloudz.fun --quiz <ID> rmquiz --user-key <KEY>   # 删自建树
```

`--url` 会自动解析域名和 id；只给 id 时用 `--host` 指定站点（`cloudz.fun` / `c.cloudz.fun`），
给错域名会自动重试并提示。**工具里不内置任何人的树**：不给 `--url` / `--quiz` 就会提示你补上。

---

## 二、原理

1. **答案在客户端**。答题页开赛前请求：

   ```
   GET /tree/api/quizzes/<id>/round?locale=cn
   {"questions":[{"id":"<题号>","question":"userName更喜欢…💬",
     "options":[{"index":1,"text":"选项 A","correct":true},
                {"index":0,"text":"选项 B","correct":false}]}, …]}
   ```

   每个选项自带 `correct`，10 题答案在题目出现前就已经在浏览器里。

2. **交卷只发序号**。页面结束后：

   ```
   POST /tree/api/quizzes/<id>/players
   {"playerName":"名字","answers":[1,1,0,2,0,2,1,0,1,3],"submissionId":"<24 位随机>"}
   ```

   服务端拿 `answers` 重算分 —— 直接发满分答卷就是 10/10，不必真的玩。
   POST 需要 `X-CSRF-TOKEN`（`GET /tree/api/token`），且 token 绑 session cookie。

3. **`index` 不是卡片位置**。round 里每题只渲染 2 张卡，`index` 是题库里的序号（通常 0..3，也可能更大、且不连续）；
   而且每次请求「给哪两张、谁在前」都会重洗。所以：**点卡片按文字匹配，提交按 `index`**。
   题目顺序与正确答案的 `index` 是稳定的。

4. **两个域名两套数据**。`cloudz.fun` 与 `c.cloudz.fun` 是同一份代码的独立部署，id 互不相通
   （拿主站 API 查 `c.` 的树 → `404 Quiz not found.`）。API 根一律读页面里的 `window.XM_CONFIG.api`。

5. **加速**。`core.js` 里 `reduceMotion` 决定所有 `pause(ms)` 是否被压到 ≤250ms：

   ```js
   var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   function pause(ms){ return new Promise(r => setTimeout(r, reduceMotion ? Math.min(ms,250) : ms)); }
   ```

   脚本在 `document-start` 改这一条查询即可整局提速 3~6 倍，且不动 `setTimeout` 本体（不影响 API 超时/重连）。

6. **树顶（`top`）先到先得**：第一个到 9+ 的人占住，同分第二人 `score=10, top=false`。

| 接口 | 作用 |
|---|---|
| `GET  /tree/api/quizzes/{id}/round?locale=cn` | 题目 + `correct` 标记（答案来源） |
| `POST /tree/api/quizzes/{id}/players` | 交卷 `{playerName, answers[], submissionId}` |
| `GET  /tree/api/token` | 发 CSRF token（需先访问页面拿 cookie） |
| `GET  /tree/api/quizzes/{id}/players` | 成绩榜 |
| `POST /tree/api/quizzes` · `DELETE /tree/api/quizzes/{id}` | 建树 / 删树（自测用，删树要创作者 `User-Key`） |

---

许可证：[CC BY 4.0](LICENSE)

