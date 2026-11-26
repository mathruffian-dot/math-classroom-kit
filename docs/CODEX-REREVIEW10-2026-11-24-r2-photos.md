# Codex 再審：照片改存 R2（第 11 輪，2026-11-24）：可以合併

模型 gpt-6.2-astra，reasoning high，唯讀。原文如下。

**可以合併。** 第 10 輪的三個阻擋均已修好，本輪未發現正常使用會使作業、成績、照片或課堂狀態出錯的新阻擋，符合老師的停止條件。

## 上一輪項目逐項

| 項目 | 是否修好 | 證據 |
|---|---|---|
| `freshSheet` 只放行從未進過批改流程的初始卷 | 已修好 | 除了 `assigned`、版本為零、未送出、沒有成績，現在也檢查 `jobAt` 與 `submittedAt`。重跑「老師先批改、學生送出零次、沒有版本」的舊訂正卷，無版本加圖與空請求送出均回 `409`。[初始卷判斷](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3387>)、[舊卷測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3432>) |
| 送出沒帶 `round`，批改失敗後重送重複扣次 | 已修好 | 初始卷第一次送 `{version: 0}` 可以受理。讓 R2 讀圖失敗後重送同一請求，回 `409`，`submissions` 維持 **1**。另一案例確認，學生重新讀卷、帶當前 `version` 與 `round` 主動重試，仍可完成批改。[送出檢查](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3870>)、[重試測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3418>) |
| 上傳中停用選檔、`change` 防重入、禁止提早送出 | 已修好 | 以實際事件處理函式搭配模擬 DOM，暫停第一批壓縮，再觸發第二次 `change` 及送出。選檔與送出均停用，第二批未開始壓縮，送出也未發出。放行後，卷上保留原圖與第一批新圖，共兩張，才恢復送出。[選檔入口](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:605>)、[送出入口](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:881>) |
| 上傳失敗後重讀作業卷 | 維持修正 | 錯誤處理會重新 GET。讀取成功後，只有伺服器仍回傳學生當初按「訂正」時的同版成績，才保留訂正畫面；卷已更新就採用伺服器回傳的狀態。[上傳錯誤處理](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:632>) |
| `r2Prefix`、`vaultPhotos`、`decodedBytes`、`photoHash` | 維持修正 | 站名前綴使用 `encodeURIComponent` 並以 `/` 分隔。R2 查無物件會回讀舊 Durable Object（DO），刪除涵蓋兩邊。DO 寫入前驗證 data URL 與 base64 可解碼性。位元組數扣除補位，指紋取完整 data URL 的 SHA-256 前 12 bytes。站名隔離、壞資料拒收及舊照讀刪測試通過。[照片儲存](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:39>)、[大小與指紋](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:212>) |
| `requestId` 去重與合理重傳 | 維持修正 | 同 ID 換內容回 `409`；同卷用新 ID 重傳同圖只留一張。已滿六張時仍可重送第六張，有雜湊的缺圖可補回，開始有效訂正也能再傳相同內容。升級前沒有雜湊的照片仍有既有限制。[上傳去重](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3777>)、[重傳測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:2971>) |
| `notePhotos`、各刪除點、並行上傳與一小時寬限 | 正常流程已修好 | 核對課堂、班級、整份作業、單張照片、訂正換圖及清除舊照，均有先登記待辦的路徑。每張照片獨立使用 `pc:` key，同一 DO 的上傳與清理請求依序執行。另測兩張尚無作業參照的新 R2 照片，一張完全沒有待辦，一張同時有舊登記與新 `pc:`，清理後**兩張都保留**；同站超過兩小時的孤兒照則被刪除。[照片登記](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:68>)、[請求序列化](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:83>)、[清理判斷](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3422>) |
| `sweepPhotos`、`maybeSweep`、`hw-trash` | 維持修正；大量待辦續掃另案 | 主檔仍有摘要但明細遺失時，清理保留整份作業的照片。`maybeSweep` 先記嘗試時間，R2 列表失敗後再開首頁也不會立即重掃。已刪作業的舊 DO 照片分批清除，滿一批便保留 `hw-trash` 供下次接續。[清理與節流](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3405>)、[刪除收尾](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3513>) |
| `canonical`、`GET /api/homework`、`drainHomework` 缺圖 | 維持修正 | 實測只更換摘要欄位順序，GET 寫主檔 **0 次**；把兩張誤記為 88 張，GET 修回兩張，寫主檔 **1 次**。再移除其中一個 R2 物件，送批後作業進入 `error`，沒有產生成績。[摘要修復](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3962>)、[批改前逐張讀圖](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3654>) |
| 還原、`imageLost` 二次還原與既有成績 | 維持修正 | 照片作答還原後，再匯出、再還原的測試通過。已發回判定、逐題對錯、覆核旗標與辨識稿批改的既有案例也通過。[還原驗證](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/validation.ts:715>)、[二次還原測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3003>) |
| `account_id`、兩份文件、指定的 `R2 round 2` | 已核對 | `account_id` 與共用 `teaching-cloud` 目錄一致，預設與 production 均將 `PHOTOS` 綁到 `math-classroom-photos`。兩份文件對新舊照片讀取及清理時機一致，作業文件也已補明缺版本、缺輪次及上傳中停用選檔的行為。指定的 `R2 round 2` 已重跑通過，目前檔末是新增的 round 10。[Wrangler 設定](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/wrangler.jsonc:5>)、[部署指南](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/DEPLOYMENT.md:100>)、[作業指南](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/HOMEWORK.md:158>)、[round 2 測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:2855>) |

## 新發現

### 阻擋（合併前必修）

無。

### 已知限制／另案處理

| 分級與位置 | 證據與影響 | 修正方向 |
|---|---|---|
| **應修｜大量 `pc:` 待辦缺少續掃位置**。[待辦掃描](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3428>) | 成功上傳會結清自己的待辦，正常使用不會每傳一張就永久增加一筆。持續故障時，待辦總數沒有硬上限；每次都從前 1,000 筆開始，若前段反覆刪除失敗，後段可長期延後。影響是孤兒照片與待辦占用空間。 | 保存最後掃過的 key，下次從該位置接續，到尾端再繞回。 |
| **建議｜將第二次 `change` 納入固定回歸測試**。[學生端 E2E](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/homework.spec.ts:297>) | 現有 E2E 會攔住上傳並確認兩個控制項停用，但沒有實際觸發第二次 `change`。本輪模擬已驗證入口保護有效；日後若只移除入口檢查，現有 E2E 仍可能通過。 | 在第一批暫停時觸發第二次選檔事件，斷言沒有第二個上傳請求，並核對最後照片 ID 與張數。 |

本輪全程唯讀。以記憶體建置執行 **16 個既有 R2／還原後端案例與 2 個補充案例，18 個全數通過**；另執行上述前端重入模擬。完整 `npm run check`、真實瀏覽器 E2E 與線上 Cloudflare R2 未在本輪重跑。
