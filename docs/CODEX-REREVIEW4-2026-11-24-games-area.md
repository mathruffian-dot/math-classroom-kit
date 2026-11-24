# Codex 複審：遊戲區（2026-11-24，第 5 輪）

審核者：Codex CLI（gpt-6.2-astra，model_reasoning_effort=high，read-only）。任務：`docs/codex-rereview4-games-area-task.txt`。

**需修正後再審。**

## 上一輪項目逐項

| 項目 | 是否修好 | 證據 |
|---|---|---|
| 第 4 輪阻擋 1：409 後自動收掉 PK 配對或補救練習 | **是** | 兩種情境都已用記憶體 Worker 實測。讀取空閒計畫後，在同一堂課開啟配對或補救練習，舊 token 均收到 409，原活動仍在。前端收到新計畫後，只有 `enter` 直接導頁，其餘模式都再問一次。[活動指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:447>)、[前端 409 分支](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3828>) |
| 第 4 輪阻擋 2：同一堂課內換活動，舊確認仍能開戰 | **部分修好，仍阻擋** | 固定課堂 ID，另一分頁開啟全班測驗，舊 token 確實收到 409。但另一分頁若重新開放同一題作答、派發拍照題或公布結果，舊 token 仍收到 **200**。現有 E2E 的測驗案例同時把 A 堂換成 B 堂，單靠該案例無法驗證同堂指紋。[指紋欄位](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:456>)、[E2E 情境](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:129>) |
| 第 4 輪應修 1：自然結束的魔王戰被當成仍在進行 | **是** | 實測讓場次自然超時並保留空的 `endedAt`，Worker 回 `start`，執行後建立新場次。仍在打的場次則回 `enter` 並沿用原 `raidId`。[計畫判定](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:454>)、[勝負與超時判定](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/raid.ts:49>) |
| 第 4 輪應修 2：離開遊戲區後，舊確認框仍可送出 | **是** | 換路由時會關閉遊戲確認框；對實際前端函式傳入舊 `routeVersion`，只發生關框，API 呼叫數為零。E2E 也有離頁後原課仍進行的斷言。[路由清理](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:2855>)、[送出前檢查](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3820>)、[E2E](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:89>) |
| 前輪：結束課堂、一般開新課、遊戲區換課的結算 | **是，與基準有預期差異** | 三個入口分別實測均寫入目前及歷史魔王場次的 `endedAt`、個人最佳、班級測驗歷史及錯題統計；到期的十字交乘也完成結算並呼叫 `scheduleCross(id, null)`。相較 `d60e98c`，手動結課補齊進行中魔王戰的結算，一般 `POST /api/sessions` 則從只標記舊課結束改為完整結算。正式 DO 對 `null` 保留既有 alarm，到期再清索引。[共用結算](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:485>)、[一般換課](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1621>)、[alarm 實作](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:194>) |
| 前輪：課堂內「開戰」、沿用場次、換課人數 | **是** | `raid-start` 保留原本的參數驗證與開戰順序。記憶體回歸通過開戰、角色沿用與個人最佳案例；遊戲區換課也通過三名輪詢學生計入新場次人數的斷言。[共用開戰](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:537>)、[課堂入口](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1783>) |
| 前輪：`GET /api/games` 權限與資料 | **是** | 實測未登入 401、學生 403、教師 200。改屬其他擁有者的教材不再列出；清單同時要求有題庫及魔王戰頁，每筆只回 `lessonId`、`lessonTitle`、`title`、`section`。[遊戲清單](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1627>) |
| 前輪：409 顯示新計畫、舊卡片失效後重載 | **409 重新確認已修；舊卡片重載退回** | 執行階段遇到衝突會顯示新計畫。這輪新增的第一步 `dryRun` 若直接收到 404 或無計畫的 409，只顯示錯誤，舊卡片仍可繼續點。[首次請求](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3109>)、[執行階段錯誤處理](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3835>) |
| 前輪：`crossPageFocus`、驗證與師生畫面 | **是** | 實測同頁由 `gcf` 改選 `a1`，重畫及切頁再回來都保留 `a1`；同頁換另一堂課則回到 `gcf`。Worker 接受四個合法值，拒絕陣列、`null` 與未知字串。E2E 原始碼有獨立學生 context，檢查等待畫面與開戰後取得 level 1 題目。[重點讀回](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:1624>)、[Worker 驗證](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/validation.ts:468>)、[師生斷言](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:169>) |

## 新發現

### 阻擋

1. **活動指紋漏掉實際會被收起的狀態與作答輪次。** 在同堂、同頁先取得 `start` 計畫，再以另一分頁公布結果、派發拍照題，或開搶答並讓學生搶到，三種情境的 `busy` 都仍是空陣列，token 完全相同。舊 token 回 200，翻頁分別清掉 `resultsVisible`、`photoOpen`、`buzzWinner`。另一次先確認收起作答，另一分頁關閉再重新限時開放同一題，舊確認也能直接關掉**新一輪作答**。換課時新開的彈幕同樣漏比。建議依 `start` 是否換頁、`replace` 是否結課，從實際會清除的欄位產生 `busy` 與指紋，納入 `activityOpenedAt`、`activityDeadline` 等輪次資訊。反向也要驗證：已在魔王戰頁時，計畫說會收起搶答，實際開戰後 `buzzOpen` 仍為 `true`。前端的直接執行條件本身符合設計，錯在伺服器把有影響的計畫回成空清單。[指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:444>)、[換頁與結課清理](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:474>)、[重新開放作答](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1715>)、[前端直接執行條件](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3809>)

2. **測驗截止後仍可收答案的 2.5 秒，被判成可直接開戰。** 固定在截止後 500 毫秒實測，學生送第一題回 200；此時 `dryRun` 回 `start`、`busy: []`，開戰回 200；同一學生在相同時刻送第二題即回 409。`liveActivities` 用 `quizOver` 判定空閒，但學生交卷入口依 `quizLocked` 保留網路寬限。操作結果是老師未經確認，就能使原本仍可接受的答案失效。建議以 `quizLocked` 判斷是否還會中斷收件，並固定時鐘測試截止前、寬限內與寬限後三個邊界。[計畫判定](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:447>)、[寬限定義](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/shared/quiz.ts:14>)、[學生交卷入口](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2369>)

### 應修

1. **token 沒有綁定目標教材，同一枚可從「沿用」變成「結束舊課」。** 實測同班正在上 `g8-2-2d`，對這份教材取得 `start` token；以相同 token 改送 `g9-1-4c`，Worker 重算為 `replace`，仍回 200 並結束原課。現行前端會沿用原選項，但 API 比對無法保證執行的是老師看到的計畫。DO 已將請求序列化，缺口在 token 的內容。建議把 `classId`、目標 `lessonId`、`mode` 與活動指紋一起比對，並測試變更目標後回 409、原課仍在。[token 建立](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:459>)、[執行比對](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1648>)、[DO 序列化](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:83>)

2. **第一步 `dryRun` 的 404／409 跳過卡片重載與路由檢查。** 用實際前端函式分別注入兩種回應，首次請求都只走外層錯誤提示；同樣的 404 發生在執行階段才會重讀 dashboard 與卡片。老師在另一分頁刪除班級或移除魔王戰頁後，可以持續點同一張失效卡；延遲錯誤也可能在離頁後才出現。建議兩步共用錯誤處理，先核對路由，再依回應決定重載或重新確認。[首次請求](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3108>)、[既有重載分支](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3835>)、[外層錯誤提示](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3865>)

3. **作者文件仍教人傳 `expectSessionId`。** 依文件實作的呼叫端缺少 `token`，會持續收到 409。請將遊戲區段落改成實際的 `dryRun → plan → token` 流程，並區分帶新計畫的衝突與教材不可用的 409。[作者文件](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/AUTHORING.md:340>)

### 建議

- **補齊 `raid-ipad` 護盾案例的修正版結果。** 交接檔仍記載修正版一次在「破盾 2/3 → 破防」失敗、另一次伺服器中斷。建議用隔離的測試服務重跑該案例，留下最後通過結果或失敗斷言，才能判定學生端這段動畫與互動是否回歸。[交接紀錄](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/REVIEW-2026-11-24-games-area.md:80>)、[護盾案例](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/raid-ipad.spec.ts:518>)

本輪全程唯讀。已通過 TypeScript 無輸出檢查與指定追蹤檔的 `git diff --check`，並執行上述記憶體 Worker 與前端函式案例。瀏覽器 E2E 本輪只核對原始碼，`games.spec` 的 2/2 是作者交接紀錄；八上 3-2 教材未納入審查。
