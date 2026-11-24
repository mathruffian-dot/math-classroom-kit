# Codex 再審：照片改存 R2（第 10 輪，2026-11-24）

模型 gpt-6.2-astra，reasoning high，唯讀。原文如下。

**需修正後再審。** 第 10 輪重現三個會影響學生作業的阻擋：已批改過的舊卷仍可能被當成初始卷、上一版送出請求仍可能重複扣次，以及同一分頁連續選檔時仍可能漏頁送批。

## 上一輪項目逐項

| 項目 | 是否修好 | 證據 |
|---|---|---|
| `sheetVersionOk` 只讓初始卷省略版本 | 部分修好 | 升級前由**學生送出過**的訂正卷，無版本加圖與送出都回 `409`，重新讀卷後可繼續。升級前由**老師先批改**的訂正卷仍會放行，見阻擋 1。[版本判斷](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3387>) |
| 送出帶 `round`，失敗重送不再扣次 | 部分修好 | 現版前端送出 `{version, round}`。固定測試確認，批改失敗後重送原請求回 `409`，重新讀卷後可主動重試。上一版只帶 `{version}` 的請求仍會重複扣次，見阻擋 2。[前端送出](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:883>)、[固定測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3416>) |
| 從選檔到上傳完成停用送出，動作入口再檢查 | 部分修好 | 單次選檔在壓縮前就設 `uploading`，送出按鈕與動作入口都有檢查。兩次選檔重疊時，先完成的一批會提早解除兩處保護，見阻擋 3。[選檔處理](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:605>)、[送出入口](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:875>) |
| 上傳失敗後重讀，依版本決定是否保留訂正畫面 | 單批流程已修好 | 失敗後重新 `GET`。只有伺服器仍回傳當初按訂正時的同一份成績，才保留訂正畫面。重疊選檔的實測中，較晚的上傳收到 `409` 後也確實重讀了作業。[錯誤處理](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:627>) |
| `r2Prefix`、`decodedBytes`、`photoHash`、`vaultPhotos` 驗證 | 未見退步 | 前綴以 `encodeURIComponent(APP_INSTANCE)` 隔離。R2 查無物件才回讀舊 DO。DO 寫入前也驗證 data URL 與 base64 可解碼性。位元組數扣除補位，雜湊取完整 data URL 的 SHA-256 前 12 bytes。站名隔離、壞資料拒收與舊照讀刪測試通過。[儲存與驗證](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:39>)、[大小與雜湊](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:212>) |
| `requestId`、內容去重與合理重傳 | 已修好；舊無雜湊照片維持既有限制 | 固定測試確認，同 ID 換內容回 `409`，新 ID 傳同圖只留一張，第六張重送可通過，有雜湊的缺圖可補回，有效訂正也可再傳同圖。[上傳去重](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3773>) |
| `notePhotos`、各刪除點、並行上傳與一小時寬限 | 正常路徑已修好 | 課堂、班級、作業、單張、訂正換圖與舊照清除都有先登記的路徑。每張用獨立 `pc:`，成功後移除；同一 DO 的上傳與清理請求依序執行。另實測兩張尚無作業參照的新 R2 圖，一張有較新的 `pc:` 加上兩小時前的舊登記，另一張完全沒有待辦，清理後兩張都保留。[登記與結清](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:68>)、[DO 請求佇列](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:83>)、[清理與舊登記搬移](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3401>) |
| `sweepPhotos`、`maybeSweep`、`hw-trash` | 已修好；大量待辦續掃另案 | 作業摘要仍在、明細遺失時保留整份作業的照片。自動清理先記嘗試時間，失敗也會節流。另放入 51 張舊 DO 照片，刪作業後剩 1 張且 `hw-trash` 仍在，下次清理才歸零並結案。[自動清理](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3470>)、[作業刪除](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3509>) |
| `canonical`、`GET /api/homework`、`drainHomework` 缺圖 | 已修好 | 實測只更動摘要欄位順序，主檔寫入 **0 次**；把兩張誤記成 88 張，GET 修回兩張，寫入 **1 次**。刪掉兩張中的一個 R2 物件後送批，作業進入 `error`，沒有產生成績。[摘要修復](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3959>)、[逐張讀圖](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3651>) |
| 還原、`imageLost` 二次還原、既有成績 | 未見退步 | 本輪重跑照片作答還原、再匯出、再還原，以及保留已發回判定、逐題對錯、覆核旗標與辨識稿批改的固定測試，均通過。[還原驗證](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/validation.ts:715>)、[二次還原測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3001>) |
| `account_id`、兩份文件、指定的 `R2 round 2` | 設定與測試通過；作業文件有落差 | `account_id` 與共用 `teaching-cloud` 目錄一致，預設環境與 production 都將 `PHOTOS` 綁到 `math-classroom-photos`。兩份文件對 R2、舊 DO 與清理時機一致。`R2 round 2` 已重跑通過，目前檔末另有 round 9。`HOMEWORK.md` 對舊請求與上傳中停用送出的描述，仍受下列三項影響。[Wrangler 設定](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/wrangler.jsonc:5>)、[部署指南](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/DEPLOYMENT.md:100>)、[作業指南](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/HOMEWORK.md:158>)、[round 2 測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:2853>) |

## 新發現

### 阻擋（合併前必修）

| 項目與位置 | 證據與影響 | 修正方向 |
|---|---|---|
| **1. 老師先批改的舊訂正卷仍被視為初始卷。** [初始卷判斷](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3387>)、[教師重新批改入口](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:664>) | 用 `HEAD` 舊後端走正常流程：學生傳一張、老師按「重新批改」、學生開始訂正。留下的卷有 **`jobAt`、零次學生送出、無 `version`、無當前 `result`**。交給新後端後，舊分頁無版本加圖回 `200`，空 `{}` 送出也回 `200`。最後兩張混在一起被批改，並扣一次送出。 | 將「沒有版本可接受」收窄到確定從未進入批改流程的 `assigned` 卷。除現有條件，也檢查 `jobAt`、`submittedAt` 等歷史欄位。保留重新讀卷後的合法續作，並用舊後端產生的教師先批改案例驗證。 |
| **2. 上一版只帶 `version` 的送出請求仍會重複扣次。** [送出檢查與扣次](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3866>)、[上一版請求格式紀錄](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/REVIEW-2026-11-24-r2-photos.md:168>) | 令 R2 暫時讀圖失敗，連續重送同一份 `{version:0}`。前三次都回 `200`，`submissions` 依序為 **1、2、3**；第四次回 `429`。批改失敗沒有推進 `version`，而 `round` 缺席會跳過比對。現版前端帶齊兩欄的請求已受保護，風險在舊分頁或延遲送達的上一版請求。 | 一旦卷有送出或批改歷史，缺少 `round` 就在扣次前回 `409`。若保留初始卷舊用戶端相容性，第一次接受後，相同缺欄請求也必須失效。重新讀卷取得當前輪次的學生仍可主動重試。 |
| **3. 同一分頁分兩次選照片，第一批完成會提前開放送出。** [選檔控制](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:569>)、[旗標設置與清除](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:611>) | 上傳期間「再拍一張」仍能操作，兩個 `change` 處理都共用一個布林值。用實際前端處理函式接測試後端：卷上已有第一張，接著分兩次選第二、三張。第二張傳完、第三張仍在壓縮時，送出已啟用；送出回 `200`，第三張上傳回 `409`。最終為 **已批改、兩張、已用一次**。 | 最小修正是整批處理期間一併停用選檔，並在 `change` 入口防止重入。若要允許繼續拍下一張，將新選的檔案依序排隊，所有已選照片處理完才開放送出。 |

### 已知限制／另案處理

| 分級與位置 | 證據與影響 | 修正方向 |
|---|---|---|
| **應修：大量 `pc:` 待辦沒有續掃位置。** [批次清理](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3424>) | 每次從前 1,000 筆開始。正常成功上傳會移除自己的待辦；若前段持續有未滿一小時或刪除失敗的項目，後段可能延後多輪，未結清總筆數也沒有硬上限。本輪未見這會刪掉已繳照片。 | 保存最後掃過的 key，下次用 `startAfter` 接續，到尾端再繞回。 |
| **建議：擴充第 9 輪固定測試的情境。** [後端測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3401>)、[學生端 E2E](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/homework.spec.ts:277>) | 現有案例分別涵蓋學生送出過的舊卷、帶完整輪次的重送、單次選檔中的第二張。這些案例可以全數通過，同時漏掉上述三種流程。 | 固定加入教師先批改的舊卷、缺 `round` 的上一版請求、同一分頁兩次選檔重疊。除了按鈕與 HTTP 狀態，也斷言最終照片 ID、張數、成績狀態及送出次數。 |

本輪全程唯讀，以記憶體建置重跑 **15 個既有 R2／還原後端案例，全部通過**，另以針對性案例確認上述三個阻擋。前端重疊選檔使用實際事件處理函式與模擬 DOM。本輪未重跑完整 `npm run check`、真實瀏覽器 E2E 或線上 Cloudflare R2。
