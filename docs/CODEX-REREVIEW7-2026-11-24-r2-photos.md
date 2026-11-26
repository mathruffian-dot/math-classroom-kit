# Codex 再審：照片改存 R2（第 8 輪，2026-11-24）

模型 gpt-6.2-astra，reasoning high，唯讀。原文如下。

**需修正後再審。** 第 8 輪重現兩個合併前必修問題：老師重新批改後，舊分頁仍能把照片加進新訂正卷；舊分頁的「送出批改」也能把只傳了第一頁的新訂正卷送去評分。

## 上一輪項目逐項

| 項目 | 是否修好 | 證據 |
|---|---|---|
| 主檔仍在、作業內容讀不到時，整份照片保留 | 已修好 | `usedH` 同時用於 `pc:` 待辦與 R2 掃描。實測移除作業內容，將照片與待辦設為兩小時前，清理後模擬 R2 物件仍在；放回內容，學生讀圖回 `200`。[清理判斷](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3391>) |
| `Vault.list`、舊 `hwphoto:` 分批刪除、`hw-trash` 結案 | 功能已修好，大照片批次另列應修 | 正式 DO 介面有呼叫 `storage.list({ prefix, limit })`。以 501 個同作業前綴的舊 key 驗證，首次刪除後剩 1 個且保留 `hw-trash`，下次清理才清空並結案。[DO 實作](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:338>)、[結案條件](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3433>) |
| 每張照片獨立 `pc:`、`notePhotos` 更新時間、`settlePhotos` 移除 | 新格式已修好；舊物件搬移仍有缺口 | 新格式每次寫圖前更新時間，確認成功後移除。透過 `ClassroomDurableObject.fetch` 同時送兩筆上傳與一次清理，三者皆回 `200`，兩張照片與作業清單吻合，待辦歸零。舊物件搬移及批次進度見下方應修。[登記與移除](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:67>)、[請求序列化](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:83>) |
| `uploads` 記「ID｜雜湊」、內容去重也記請求 ID、合理重傳 | 已修好 | 新 ID 傳相同照片會留下收據且維持一張；已記錄的新格式 ID 換內容回 `409`。第六張重送、收據淘汰但照片 ID 仍在、同內容補回缺圖、有效訂正重傳同圖的路徑均保留。[上傳判斷](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3753>)、[固定測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3302>) |
| `sheet.version` 與 `round` 防止舊操作改動新作業 | **版本已修好；輪次部分修好** | 批改寫回、教師改判、訂正清掉成績都會遞增 `version`，舊 `restartOf` 會回 `409`。一般加圖只核對學生送出次數，兩份不同訂正卷可以有相同 `round`。見阻擋 1。[作業卷欄位](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/homework.ts:333>)、[版本檢查](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3761>) |
| 前端上傳失敗後重讀作業卷 | 部分修好 | 失敗後確實發 GET。若伺服器已開始訂正，畫面會採用新卷；若教師剛改判、GET 回來仍是 `graded`，前端會連新版成績一起略過。見下方應修。[前端錯誤處理](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:620>) |
| 還原 `marks`、`imageLost` 二次還原 | 已修好；僅有 `finals` 的舊備份維持另案 | 本輪以真正的 `numeric + photoWork` 題連續還原兩次。有效行號及引文、逐題對錯、`imageLost` 均保留，越界批註被捨棄，舊 `imageId` 未帶回。缺少 `itemsCorrect`、只剩 `finals` 的歷史備份仍未回推。[批註還原](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3055>)、[缺圖還原](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/validation.ts:715>) |
| 文字批改依據與教師畫面 | 上輪主要問題已修好 | 示範與正式批改在只有辨識稿時都記 `basis: 'text'`。教師畫面顯示「依辨識稿給分」，看圖提示以作答是否仍有 `imageId` 判斷。[批改結果](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3239>)、[教師畫面](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:2532>) |
| `r2Prefix`、讀寫回退、`decodedBytes`、`photoHash`、`vaultPhotos` | 已確認，未見退步 | 站名經 `encodeURIComponent` 隔離。新圖優先寫 R2，R2 查無物件才回讀舊 DO；刪除涵蓋兩邊。位元組計算扣除 base64 補位，雜湊取完整 data URL 的 SHA-256 前 12 bytes，DO 寫入前也驗證格式及可解碼性。[照片儲存](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:39>)、[大小與雜湊](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:212>) |
| 各刪除點、`maybeSweep`、`canonical`、`GET /api/homework`、`drainHomework` | 已確認，未見退步 | 刪單張、訂正換圖、刪作業、刪課堂、刪班級、清舊照均可追到先登記待辦的路徑。自動清理先記嘗試時間，失敗仍節流。實測摘要只換欄位順序時寫主檔 **0 次**，改錯張數時修復 **1 次**；兩張作業缺一張時進入 `error`，未產生成績。[清理節流](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3455>)、[摘要修復](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3935>)、[逐張讀圖](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3635>) |
| `account_id`、部署文件、`R2 round 2` | 帳號與測試已確認；文件有小處待同步 | `account_id` 與共用教學目錄一致，本機及 production 都綁 `PHOTOS → math-classroom-photos`。部署指南的 `auth activate teaching-cloud .` 符合本機 Wrangler 的參數。指定的 `R2 round 2` 已重跑通過，涵蓋跨站隔離、新待辦寬限、舊 DO 殘圖及同圖重傳。[部署設定](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/wrangler.jsonc:5>)、[部署指南](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/DEPLOYMENT.md:90>)、[round 2 測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:2853>) |

## 新發現

### 阻擋（合併前必修）

| 項目與位置 | 證據與影響 | 修正方向 |
|---|---|---|
| **1. 教師重新批改後，前一份訂正卷的照片能混進下一份。** [作業卷輪次](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/homework.ts:334>)、[一般加圖](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3763>)、[教師重新批改](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:4005>) | 學生開始訂正時，`version/round` 為 `2/1`。老師在學生再次送出前按「重新批改」，變為 `3/1`；學生再開一份訂正卷，變為 `4/1`。此時前一份訂正卷的加圖請求帶著正確產生的 `round: 1`，實測仍回 `200`，新卷實際含有新、舊兩張。舊版分頁省略 `round` 也可寫入。下一次批改會讀到舊答案。 | 一般加圖應攜帶學生所見的作業卷版本，例如沿用 `sheet.version`。凡是會新增照片的請求，版本過期就回 `409`；缺版本的舊客戶端只在能確定仍是初始卷時允許寫入。已完成請求仍可安全回傳現況。 |
| **2. 舊分頁的「送出批改」能送出未完成的新訂正卷。** [前端送出](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:871>)、[後端送出](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3847>) | 學生第一次送出並取得成績，開始訂正、剛傳完第一頁。這時從仍開著的舊分頁送出原來的 `/submit`，實測回 `200`，新卷以一張照片得到成績，送出次數由 1 變 2；學生接著傳第二頁回 `409`。此路徑沿用既有的空請求 `{}`，本輪加上的上傳保護沒有涵蓋實際送去評分的動作。 | 送出時帶上畫面所見的作業卷版本及送出輪次，後端在增加 `submissions`、排入批改前核對。以前一輪重送的請求驗收，應維持新卷可編輯、送出次數不變、第二頁仍可上傳。 |

### 已知限制／另案處理

#### 應修

| 項目與位置 | 證據與影響 | 修正方向 |
|---|---|---|
| **舊 `photo-check` 搬移會縮短新照片的一小時寬限。** [舊物件搬移](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3403>) | 舊物件與新 `pc:` 有同名項目時，搬移無條件寫入舊時間。故障注入中，新圖已寫 R2，作業內容寫入與回滾刪圖先後失敗；下一次清理把剛更新的 `pc:` 蓋回兩小時前，刪掉了僅 **13 毫秒**的照片。此例上傳已回 `503`，沒有已成功提交的作業指向它，因此列為應修。 | 搬移取新舊時間較晚者，重跑搬移也要保留較新的時間。固定測試應使用「新物件尚未寫入作業清單」的情境。 |
| **`pc:` 已拆小，但前 1,000 筆可長期擋住後面的待辦。** [批次列舉](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3409>) | 清理每次都從前綴開頭讀取。實測前 1,000 筆持續刪除失敗，連跑兩次清理，第 1,001 筆可刪的舊 DO 照片仍在。單筆大小問題已解決；持續故障時，待辦總數與舊 DO 殘圖仍可增加。 | 保存本批最後檢查的 key，以 `startAfter` 續掃，到尾端再繞回。舊 `photo-check` 的搬移也應分批保存進度。 |
| **舊 DO 照片每批 500 筆會連照片內容一起載入。** [DO 的 `list` 包裝](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:345>) | `storage.list()` 先回傳含值的 `Map`，才由程式取 `.keys()`。501 個小值的測試證明結案順序正確，大量實際照片仍可能讓清理超過記憶體，反覆停在同一批。此風險未在正式站量測。[Cloudflare 非同步 `list` 規格](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#list-1) | `hwphoto:` 採用能容納最大照片的小批次，持續保存進度；`pc:` 的值只有時間戳，可維持較大批次。 |
| **教師改判後，學生重選照片仍沿用失效版本。** [上傳失敗後重讀](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:623>) | 學生以版本 1 開始訂正，教師改判至版本 2。後端正確拒絕舊版本；前端 GET 已取得版本 2，卻因 `graded && p.restart` 略過更新，重選仍送版本 1。後端實測連續兩次 `409`。學生重新整理頁面可以恢復，原成績有保留。 | 只在 `fresh.version === p.restartOf` 時保留訂正畫面；版本已變就顯示最新成績，讓學生看過改判結果後再次決定是否訂正。 |

#### 建議

| 位置 | 證據與影響 | 修正方向 |
|---|---|---|
| [後端 round 7 測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3278>)、[前端 C-16](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/homework.spec.ts:252>) | 第一個固定案例接上 R2 前已把照片存入 DO；重寫寬限案例的照片仍有作業引用。C-16 則在請求抵達伺服器前中斷。這些測試都能通過，仍覆蓋不到本輪重現的交界。 | 固定加入兩個阻擋案例、搬移遇同名新待辦，以及「已存好但回應遺失」的學生端案例。 |
| [作業指南](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/HOMEWORK.md:157>) | 第 157 行仍將現行待辦寫成 `photo-check`，第 160 行才正確寫 `pc:`。第 158 行概稱舊輪次回 `409`，實際上已辨識且內容相同的重送可以回 `200`。這會影響故障排查。 | 統一新舊 key 名稱，並分別寫明「已處理的重送」與「會改動新卷的過期請求」兩種結果。 |

本輪全程唯讀，以記憶體建置執行 **16 個既有後端案例，全部通過**，另做 **9 個針對性驗證**。使用模擬 R2 與儲存層，包含經實際 DO 請求處理程式的並行測試。完整 `npm run check`、瀏覽器 E2E 與正式 Cloudflare R2 未於本輪重跑。依老師的停止條件，**只有上列兩個會改錯作業或成績的問題阻止合併**。
