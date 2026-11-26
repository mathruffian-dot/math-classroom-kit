# Codex 複審：遊戲區（2026-11-24，第 6 輪）

審核者：Codex CLI（gpt-6.2-astra，model_reasoning_effort=high，read-only）。任務：`docs/codex-rereview5-games-area-task.txt`。

**需修正後再審。** 同一堂課取消後重開搶答或 PK 配對，上一輪的確認 token 仍能取得 200，並收掉老師尚未確認的新一輪活動。

## 上一輪項目逐項

| 項目 | 是否修好 | 證據 |
|---|---|---|
| 第 5 輪阻擋 1．依結課、換頁、開戰列出中斷狀態，並辨識活動輪次 | **部分修好，仍阻擋** | 記憶體 Worker 實測，換頁前新公布結果、派發拍照、學生搶到答題權、重新限時開放同一題，以及換課前開啟彈幕，舊 token 均回 409。已在魔王戰頁時，`busy` 不列搶答，開戰後也確實保留搶答。但取消後重開搶答或空的 PK 配對，兩輪 token 完全相同。[中斷清單與指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:450>) |
| 第 5 輪阻擋 2．測驗截止後 2.5 秒寬限 | **已修好** | 固定時鐘實測，截止前 1 ms、截止後 500 ms、2,499 ms 都列出測驗，到 2,500 ms 才移除。計畫與學生送卷入口共用 `quizLocked`。這解決了提早中斷收件的問題。[計畫判斷](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:453>)、[交卷入口](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2395>) |
| 第 5 輪應修 1．token 綁定目標 | **已修好** | token 包含班級、目標教材、模式、進行中的課堂 ID 與活動指紋。拿 `g8-2-2d` 的 token 改開 `g9-1-4c`，實測回 409，原課仍在。DO 將請求排入同一佇列，Worker 先重算比對，再改動課堂。剩下的競態來自兩輪活動產生相同指紋。[token 建立](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:482>)、[執行前比對](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1670>)、[DO 佇列](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:98>) |
| 第 5 輪應修 2．第一步 dryRun 的 404／409 與路由檢查 | **已修好** | dryRun 與執行階段共用 `raidGameError`。核對前端函式，404 與無 `plan` 的 409 都會提示、重讀班級與卡片；有新 `plan` 的 409，只有 `enter` 直接導頁，其餘重新確認。送出及更新畫面前都有路由版本檢查。[dryRun 錯誤入口](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3113>)、[409 與重載處理](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3826>) |
| 第 5 輪應修 3．作者文件仍教人傳 `expectSessionId` | **已修好** | 作者指南已寫成 `dryRun → plan → token`，列出四種模式，並區分帶新計畫的衝突與無計畫的錯誤。[作者指南](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/AUTHORING.md:337>) |
| 前輪回歸．手動結課、一般開新課及遊戲區換課 | **結算通過，與基準有預期差異** | 三個入口分別實測，均寫入魔王戰目前與歷史場次的 `endedAt`、保留個人最佳、寫入班級測驗歷史與錯題統計。十字交乘在期限前及剛過期結課，均結算場次並呼叫 `scheduleCross(id, null)`。實際 DO 保留已排定的 alarm，醒來後清除索引。相較 `d60e98c`，手動結課補上魔王戰結算，一般 `POST /api/sessions` 也從單純標記舊課結束改成完整結算。[共用結課](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:506>)、[一般換課](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1644>)、[alarm 實作](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:194>) |
| 前輪回歸．課堂內「開戰」與 `GET /api/games` | **已確認** | 對照基準，課堂內開戰保留難度與時間驗證、在線人數、舊活動結算、個人最佳快照及角色沿用的順序。遊戲清單實測未登入 401、學生 403、教師 200；查詢限定教師自己的教材，同時要求題庫及魔王戰頁，只回 `lessonId`、`lessonTitle`、`title`、`section`。[共用開戰](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:558>)、[遊戲清單](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1651>) |
| 前輪回歸．`crossPageFocus` | **已確認** | 前端函式實測，頁面預設 `gcf`，同課同頁改選後讀回 `a1`，另一堂課的同名頁仍讀回 `gcf`。現有 E2E 另以獨立學生 context 斷言等待畫面與開戰後的 level 1 題目。[面板取值](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:1626>)、[師生 E2E](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:175>) |

## 新發現

### 阻擋

1. **舊確認可以結束新一輪搶答或 PK 配對。** 固定班級、課堂、教材與頁碼，在需要翻頁時開搶答、取得計畫，再取消並重開搶答。兩次 token 相同，送第一枚回 200，`buzzOpen` 變成 `false`。把流程換成「開 PK 配對 → 取消 → 重開空配對」，同樣回 200，新 `pkLobby` 被清空。搶答指紋只有開關與得主，配對也只有名單、等待者與設定；兩次新開可以得到相同內容。請在每次開放時產生輪次 ID 或遞增版本，只在該操作會中斷它時納入 token。回歸測試應斷言舊 token 回 409，且第二輪仍可使用。[指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:468>)、[建立配對](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1980>)、[開放與重設搶答](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2067>)

### 應修

1. **結束舊課後，PK 配對仍可收件。** 從遊戲區取代已開放「搶答上場」的課，實測舊課同時保有 `ended === true` 與 `pkLobby.buzz === true`。學生 PK 搶答入口只檢查配對是否開放，沒有檢查課堂是否結束，晚到的操作仍可能改寫舊課名單。這是原本結課路徑已有的缺口，新換課入口也會遇到。請在結課時關閉配對收件，並讓學生入口對已結束課堂回 409；可以保留原配對名單供教師查閱。[結課狀態](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:506>)、[PK 搶答入口](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2590>)

2. **已結束但仍在檢討的測驗會被直接收起。** 實測老師按「結束測驗」後，`session.quiz` 仍在，師生可看成績與解析；此時 dryRun 回 `start`、`busy: []`，送出後回 200，`session.quiz` 變成 `null`。前端確實只對空清單直接開戰，但這份清單漏了仍在展示的測驗結果。請保留 `quizLocked` 作為收件判斷，另將尚未按「關閉」的結算畫面列為「測驗結果／檢討」，讓老師確認後才收起。[計畫判斷](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:453>)、[結束與關閉測驗](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1965>)、[前端直接執行條件](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3814>)

3. **同頁開戰會因保留的活動而誤報 409。** 已在魔王戰頁取得空清單後，另一分頁開啟搶答。實測新舊計畫的 `busy` 都是 `[]`，舊 token 卻回 409；用新 token 開戰後，搶答仍開放。原因是 `names` 依結課、換頁、開戰選欄位，`print` 卻一律包含搶答、拍照、結果顯示與彈幕。老師因此被要求重新確認一個效果完全相同的計畫。請讓清單與指紋使用同一組「本次將受影響的欄位」，並保留這個反向測試。[清單與指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:462>)、[實際換頁條件](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1683>)

### 建議

- **在 dryRun 就檢查沿用課堂的教材快照。** 以「現在的教材有魔王戰頁、開課時的快照沒有」實測，第一步回可執行的 `start`，第二步才回無 `plan` 的 409。原課安全保留，但重載卡片也無法改變同一堂課的快照。建議在產生 `start` 計畫前就提示需要重新開課，可省下無效確認。[計畫產生](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:488>)、[執行時快照檢查](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1683>)
- **補齊 iPad 護盾回歸結果。** 交接檔仍記載一次「破盾 2/3 → 破防」失敗，以及一次測試服務中斷。建議在隔離的測試服務重跑該案例，留下通過結果或確切失敗斷言。[交接紀錄](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/REVIEW-2026-11-24-games-area.md:80>)

本輪全程唯讀，未改檔，八上 3-2 教材未納入審查。實際通過 TypeScript 無輸出檢查、指定追蹤檔的 `git diff --check`、兩個既有 games 後端案例，以及上述記憶體 Worker 與前端函式檢查。瀏覽器 E2E 本輪核對了原始碼；`games.spec` 的 2/2 是作者交接紀錄。
