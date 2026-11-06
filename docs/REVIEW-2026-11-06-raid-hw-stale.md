# 魔王戰「疑似帶入上一次魔王戰的紀錄」調查與修正（2026-11-06）

## 症狀
806 班打八年級 2-3 魔王戰（g8-2-3c）時，學生反映看到「疑似是上一次魔王戰的紀錄」。

## 結論
**確認是 bug，已修。** 魔王戰的「個人最佳」記在班級上、不分課（`StoredClass.raidBest`：座號 → 題數）。
g8-2-3c 開戰時把 g8-2-2d（上一隻魔王）的個人最佳當成這一場的比較基準，學生會在兩個地方看到：

- 選完英雄後的目標頁：「你的個人最佳是一場答對 **N** 題」，目標選項（追平、+2、+4）也照這個 N 算。
- 結算卡：「個人最佳 N 題（這場 M 題）」或「🏆 突破個人紀錄！N → M 題」，徽章「突破個人紀錄」。

N 是 2-2 魔王戰的題數，題庫、難度都不同，學生自然覺得「這是上一次魔王戰的紀錄」。
g8-2-3c 的魔王戰題庫昨天（`f2470c1`）才加入，今天是八年級班第一次打到第二隻魔王，所以今天才浮現
（九年級 g9-2-1c 同理，下一次九年級打 2-1 魔王戰會遇到）。

## 修正（worker/app.ts）
- 新欄位 `raidBestBy`：課程 ID → 座號 → 一場最多答對幾題。`recordRaidBest`、`raid-start` 都改用 `lessonRaidBest(state, classId, lessonId)`。
  與冒險地圖 `raidWins`（本來就依課程 ID）一致。
- 第一次用到某一課時，從**已載入**的同班同課課堂裡**已結束**的場次補算（例如 806 之前打過的 2-2 個人最佳不會不見）。
- 舊 `raidBest` 分不出是哪一課：保留不刪、不再讀寫。
- 順手修（Codex 審核找到、修前就有）：開全班測驗、開 PK 配對直接收起魔王戰時沒記個人最佳 → 改成 `closeRaid(s, state)`。
- 限制：封存而未載入的舊課堂補不到（只影響更新後第一場的「個人最佳」顯示，之後照常累積）。
- 前端、型別、備份格式都不用改（備份本來就不含 `raidBest`／`raidWins`）。

## 其他假設逐一驗證

| # | 假設 | 結果 | 依據 |
|---|---|---|---|
| 1 | 派作業跨場彙整讓人覺得是「上一場」 | **不是 bug（設計如此）**，但不會混到別課 | 見下方「派作業」 |
| 2 | 開新場 UI／狀態未清 | 不是 | 新場 `actions: []`、`stats {}`、戰況 log、目標、題目都從零；只沿用同一堂上一場的英雄（設計）。前端 `raidLocal.flash` 換場清空、`noGoal` 依 run.id、作答選取依題目 id |
| 3 | lessonId 用錯（連到 g8-2-2d） | 不是 | 魔王戰題目都從 g8-2-3c 題庫抽（測試逐題核對）；派作業 `hwScope` 用按鈕上的課程 ID |
| 4 | 魔王題 id／topic 對錯題位、跨節 | 不是 | 256 題中 232 題對到題型，**全部**落在 g8-2-3a/b/c；課本題 ID（`g8-2-3x-qN-n`）的題型名稱和作業題庫完全一致 |
| 5 | 派作業視窗沿用舊 plan | 不是 | `openPlan` 每次重抓 `/api/homework/plan`，換 `planToken`（`34e8ad1` 已處理重疊派發） |

### 派作業（設計，非 bug）
- `classRecords` 彙整**這個班**所有課堂（含封存）＋批改完的作業；`homeworkPlan` 只算範圍內的題位
  （單課：g8-2-3c；整節：g8-2-3a、b、c）。2-2 魔王戰的紀錄題位是 g8-2-2*，**不會**算進 2-3 的作業。
- 同一課**多場魔王戰**、**多堂課**的作答都會算進答對率與「最需要練習」——刻意的（累積越多越準）。
  例：今天第一場答錯、第二場答對 → 這一題型 1/2＝50%。
- 老師可能誤解的點（**未改，等老師決定**）：
  1. 派發表格的「答對率／作答數」沒標來源（哪幾場魔王戰、哪幾堂課），看不出含今天第一場或上次同課的紀錄。
  2. 同一題型重打很多次時，早期答錯仍會把它排在「最需要練習」。
- 可行改法（擇一或併用）：
  - A. 派發視窗加「只算本堂課」切換（從課堂畫面開時預設本堂 session；從紀錄列表開時維持全部）。
  - B. 表格加一欄來源摘要（例：「IRS 12・魔王戰 2 場 30・PK 8」），滑過顯示日期。
  - C. 題型答對率改成「最近 N 次」或近期加權。

## 測試（tests/backend.test.mjs）
- `raid personal best stays with its own boss…`：2-2 打一場答對 1 題 → 另一堂 2-3 開戰，個人最佳不得是 1；
  同堂再開一場：英雄留著，stats／log／目標／題目清空，個人最佳是 2-3 上一場的 0；結算出現「突破個人紀錄」；回到 2-2 仍和 2-2 的 1 比。
- `raid personal best: … backfilled …`：模擬更新前資料（只有舊 `raidBest={2:9}`、有一場已結束的 2-2 答對 2 題）→ 個人最佳是 2，不是 9；舊欄位不動。
- `homework after raids (real banks)…`：用真題庫，2-2 魔王戰答錯不算進 2-3 單課／整節作業；同堂兩場都算（n=2、50%）；
  `sectionHost('g8-2-3c')`＝a、b、c；逐題檢查 2-3 魔王題對到的題位都在 8-2-3。
- `raid personal best is recorded when the teacher goes straight to a quiz, PK or a new battle…`：沒按結束就開測驗、PK、新一場，個人最佳都要記到。
- 既有 raid flow 測試的 `raidBest['2']` 斷言改成 `raidBestBy['g8-2-2d']['2']`。

修前重現（修正 stash 掉跑新測試）：
```
✖ raid personal best stays with its own boss …
  AssertionError: no 2-2 personal best in the 2-3 raid
  1 !== undefined
✖ raid personal best: … backfilled …
  AssertionError: from the earlier 2-2 battle, not the old 9
  9 !== 2
```
修後：見「Codex 審核」最後一段（119 項 118 過，只剩既有的 C-3，HEAD 上就失敗）。

## 既有問題（非本修，未動）
`scripts/check-homework.mjs`（C-3 測試會跑）在 HEAD 就失敗：g8-2-3c、g9-2-1c 的作業題庫沒有 `links.raidTopics`／`links.raidSkip`。
執行期 `slotByTopic` 仍會用 topic 名稱對到同一節的題位，所以多數題目有對到；真正沒有題型的 g8-2-3c topic：
`找出正確算法：兩股求斜邊`(4)、`用距離公式求兩點距離（整數／根式）`(8)、四個分析題 topic（各 3）。這些只算總答對率、不影響「最需要練習」。
建議另開一次補 `links.raidTopics`（例：「整數／根式」→ g8-2-3c:q5 或 q6）與 `raidSkip`（分析題）。

## 不在本修範圍
- 未 deploy、未 push、未改 secrets、未碰通靈之戰、無學生姓名。
- 正式站 Durable Object 資料沒看：806 實際看到的 N 值無法核對，但程式路徑與重現測試已能完整解釋症狀。
- 工作目錄同時有別的 agent 在改 `shared/types.ts`、`worker/quiz.ts`（單元總測驗），未納入本 commit。

## Codex 審核
- 指定的 `-m gpt-5.1-codex`：ChatGPT 帳號不支援（400 model_not_found）；`--full-auto` 在 codex-cli 0.162.1 已移除。
- 改用預設模型（config：gpt-6.1-terra）＋ `-s read-only`、再試 `-s workspace-write`：Windows 沙箱起不來
  （`helper_unknown_error: setup refresh had errors`），讀不到檔，兩次都沒審成。
- 第三次把 diff 與相關原始碼段落從 stdin 餵進去做**靜態審查**（沒有跑命令或測試）。結論：根因與依課分開的修法成立。

| Codex 意見 | 處理 |
|---|---|
| MUST：更新前已開戰的場次 `run.prevBest` 是開戰當下的快照，仍是舊值 | 不改。快照屬於那一場；最長 10 分鐘，部署後新開的場次就對。**部署時不要正在打魔王戰**（或打完重開） |
| MUST：補算一次後就不再掃，沒走到 `recordRaidBest` 的場次會漏記 | **查到真的漏**：開全班測驗（`startQuiz`）、開 PK 配對（`pk-lobby`）收起魔王戰時呼叫 `closeRaid(s)` 沒帶 state，那一場的個人最佳不會記（修前就有，舊 raidBest 一樣漏）。**已修**：兩處改成 `closeRaid(s, state)`，新增測試 |
| SHOULD：封存課堂補不到 | 已寫在「修正」的限制；只影響更新後每課第一場的個人最佳 |
| SHOULD：補算時 `Date.now()` 只取一次 | 已改 |
| SHOULD：上一場沒按結束就直接開新場 | 新測試涵蓋（`raid-start` 會先 `closeRaid(s, state)` 記下，再取 prevBest） |
| SHOULD：plan 對有 slot 的紀錄不看 lessonId；兩班同座號 | 設計上同節跨課要算進整節作業，所以只看題位；跨節只會在題庫對照寫錯時發生，現有真題庫逐題檢查都在 8-2-3。班級隔離由 `classRecords` 依 classId 篩選（既有） |
| SHOULD：`sessionRecords` 也收進行中的場次 | 是，派作業時進行中那一場已答的題目也算（設計：作答就是紀錄） |
| NIT：`|| 0` → `?? 0` | 補算函式已改 |
| NIT：題庫測試只印對到比例 | 刻意：未對到的 topic 交給 check-homework（見「既有問題」）；本測試斷言的是「對到的都在本節」 |

修正後（在乾淨 worktree：HEAD＋本修，不含別的 agent 的改動）：`tsc --noEmit` 通過；`node --test tests/*.test.mjs` 119 項 118 過，只剩既有 C-3。
新增測試 `raid personal best is recorded when the teacher goes straight to a quiz, PK or a new battle…` 在拿掉 `closeRaid(s, state)` 時失敗、修後通過。

## 部署前提醒（未部署）
- 部署時避開正在進行的魔王戰。
- 學生端無需更新快取；舊 `raidBest` 欄位會留在資料裡（不讀），之後要清可另做。
