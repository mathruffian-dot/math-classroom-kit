# Codex 複審：遊戲區（2026-11-24，第 3 輪）

審核者：Codex CLI（gpt-6.2-astra，model_reasoning_effort=high，read-only）。任務：`docs/codex-rereview2-games-area-task.txt`。

**需修正後再審。** 第 2 輪的魔王戰結課結算已修好，三個結課入口都通過記憶體實測；仍有一個阻擋：前端收到 409 後，可能自動重送開戰請求，提前結束老師未確認的新課堂測驗。

## 上一輪項目逐項

| 項目 | 是否修好 | 證據 |
|---|---|---|
| 第 2 輪阻擋：魔王戰進行中結課漏記場次與個人最佳 | **是** | 分別實測手動結課、一般 `POST /api/sessions` 換課、遊戲區換課。三條路徑都把相同的 `endedAt` 寫入目前及歷史場次，保留 2 號答對 1 題的個人最佳；同一課下次開戰也都讀到 `prevBest['2'] === 1`。[結課順序](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:445>) |
| 第 2 輪應修 1：輪詢學生在換課時漏算 | **是** | 讓三名學生只靠輪詢登記在線，再從遊戲區換課，新場次的 `config.players` 實測正好是 3。舊課的 `seen` 在開戰前帶入，新場次仍依在線時窗與斷線紀錄判定。[換課](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1618>)、[在線判定](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1105>) |
| 第 2 輪應修 2：409 未顯示最新課堂 | **部分** | `ApiError` 已保留 `current`。最新課堂是另一份教材時，確認框會顯示課名，並保留原選的班級、難度與時間。最新課堂與目標教材相同時，前端跳過確認直接重送，實測會中斷該堂測驗，詳見下方阻擋。[錯誤回應](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/api.ts:43>)、[409 分支](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3803>) |
| 第 2 輪應修 3：晚到的遊戲清單覆蓋其他頁面 | **是** | 讓 `/games` 的 GET 延遲至切換路由後才完成，實際 `renderGames()` 沒有呼叫 `shell()`。開戰 POST 的晚到回應仍有另一個問題，列於下方。[清單版本檢查](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:252>) |
| 第 2 輪建議：十字交乘 alarm 比對時點 | **是** | 三個結課入口各測「尚未到期」與「剛過期」，六例都更新歷史場次，並對舊課呼叫一次 `scheduleCross(id, null)`。這確認的是 Worker 回呼；實際 Durable Object 仍沿用既有 alarm 清理機制。[換課時序](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:465>)、[手動結課時序](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1669>) |
| 第 1 輪阻擋 1：確認 A 堂卻結束 B 堂 | **後端已修** | 實測「預期無課但已有 B」、「預期 A 但已換成 B」、「預期有課但已結課」，都回 409 及正確的 `current`。衝突請求保留 B 的 revision，另一班也持續上課。前端收到 409 後的第二次請求須另行處理。[比對與回應](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1607>) |
| 第 1 輪阻擋 2：遊戲卡只翻頁、沒有開戰 | **是** | 同一請求會建立場次並定位魔王戰頁；再次進入仍取得同一 `raidId`。E2E 原始碼另有獨立學生 context 的戰鬥卡斷言。[開戰入口](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1620>)、[學生端斷言](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:106>) |
| 第 1 輪應修 1：換課跳過結算；課堂內開戰抽出後的相容性 | **是** | 三種結課方式都實測寫入測驗結束時間、班級成績歷史與錯題統計。相較 `d60e98c`，一般開新課現在也會完整結算舊課，符合這次需求。另從課堂內連開兩場，已驗證人數、難度、秒數、上一場結束時間、角色沿用及困難護盾設定。[測驗結算](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:299>)、[共用開戰邏輯](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:497>) |
| 第 1 輪應修 2：沿用同堂時無條件翻頁 | **是** | 已在魔王戰頁時再進入，實測保留原場次與開啟中的搶答。現行教材有魔王戰頁、舊課快照卻缺頁時，回 409 且 revision 不變。[快照與頁碼檢查](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1620>) |
| 第 1 輪應修 3：遊戲卡可能指向無題庫教材 | **是** | `GET /api/games` 實測未登入回 401、學生回 403、其他擁有者的教材不列出。教師每張卡只收到 `lessonId`、`lessonTitle`、`title`、`section`。GET 要求同時有題庫與頁面，POST 在換課前重新驗證。[遊戲清單與開戰檢查](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1587>) |
| 第 1 輪應修 4、5：手選重點被重畫覆蓋、非法 `focus` 被接受 | **是** | `crossPageFocus` 依課堂 ID 與投影片 ID 保存、讀回選擇；E2E 有「`gcf` 改 `a1` → 搶答重畫 → 學生拿到 level 1」斷言。Worker 實測接受四個合法字串，陣列、`null`、未知字串及缺值均回 400。[重點讀取](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:1628>)、[重點寫入](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:4096>)、[學生端斷言](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:142>) |
| 第 1 輪建議：等待畫面、窄版與鍵盤、文件及測試隔離 | **前三項已補；隔離仍部分** | E2E 已加入學生等待文字、教師端 820px 寬度、控制項高度至少 44px、Esc 後原課仍進行等斷言。作者指南已補 `crossPage`。測試會還原 `requireCode`，但仍在共用 `DEMO801` 開課，可能結束測試前原有的課堂。[版面與 Esc 斷言](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:57>)、[清理範圍](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:13>)、[作者指南](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/AUTHORING.md:324>) |

## 新發現

### 阻擋

**409 後只比教材 ID 就自動重送，會提前交掉另一堂課的測驗。** 我用實際 `startRaidGame()` 搭配記憶體 Worker 驗證：老師原先確認 A 堂，另一分頁已開 B 堂；B 使用目標教材，正在做全班測驗。第一個 POST 正確回 409，B 的測驗仍在進行。前端隨即換成 B 的 ID 自動送出第二個 POST，得到 200；全程沒有確認框，B 的測驗被寫入 `endedAt`，學生轉入魔王戰。建議課堂 ID 改變時顯示最新班級與課名，讓老師重新確認。若要直接進入已在打的同一場，可導向既有課堂，省去會開戰、翻頁及結算其他活動的 POST。回歸測試應從前端確認框走完 A→B，並斷言教師重新確認前 B 的測驗仍可作答。[自動重送](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3805>)、[開戰時結束測驗](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:500>)

### 應修

1. **老師已離開遊戲區，晚到的開戰回應仍會把畫面帶回課堂。** 我延遲 POST 的成功回應，先將路由切到 `/records`，原本的 `startRaidGame()` 仍呼叫 `navigate('/session/…')`。409 分支也可能在新頁面彈出舊確認框。建議在點擊遊戲卡時記下 `routeVersion`，在前置查詢完成、顯示確認框、重送及導頁前核對。已送達伺服器的開戰可以完成，教師後來選擇的頁面也應保留。[前置查詢](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3103>)、[成功導頁與衝突處理](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3795>)
2. **教材或班級已刪除時，舊遊戲卡仍可反覆點擊。** 實測先載入清單、再刪除該教材，POST 回 404，原課安全保留。前端只在 409 分支重載卡片；404 走一般錯誤提示，畫面仍保留失效的操作。建議在遊戲區收到這個 404 時，一併重載班級與卡片，並提示老師重新選擇。[Worker 的 404](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1601>)、[前端分流](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3801>)

### 建議

- **用測試專屬班級跑 `games.spec.ts`。** 現在能還原識別碼設定，但 `POST /api/sessions` 已將共用班原有課堂結算，`afterEach` 刪除測試場次也無法恢復它。建立臨時班級，讓獨立學生 context 使用該班代碼，即可保留同樣的換課覆蓋。[示範班設定](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:31>)、[開課位置](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:69>)
- **補齊 `raid-ipad` 護盾失敗的追查結果。** 作者記錄回歸為 62/63，並註明「見下」，交接檔後續只有第 3 輪檔名。現有資料無法判定失敗原因。建議補上失敗斷言與相同條件的重跑結果，供合併時判斷。[交接紀錄](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/REVIEW-2026-11-24-games-area.md:70>)

本輪全程唯讀。已實跑 TypeScript 無輸出檢查、指定追蹤檔的 `git diff --check`、上述記憶體 Worker 案例，以及前端函式的延遲回應測試。瀏覽器 E2E 僅核對測試原始碼；`games.spec` 的 2/2 與回歸的 62/63 均為作者紀錄。八上 3-2 教材未納入本次複審。
