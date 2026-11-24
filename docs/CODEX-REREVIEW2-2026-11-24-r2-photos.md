# Codex 再審：照片改存 R2（第 3 輪，2026-11-24）

模型 gpt-6.2-astra，reasoning high，唯讀。原文如下。

**需修正後再審。** 本輪重現了三個阻擋問題：清理仍可能刪掉另一站正在使用的照片、訂正上傳回 `503` 時舊成績已被清除，以及還原後重新匯出的備份無法再次還原。

## 上一輪項目逐項

| 項目 | 是否修好 | 證據 |
|---|---|---|
| 阻擋 1．共用 bucket 的實例隔離 | **未修好** | `r2Prefix()` 會把不同站名轉成同一個前綴。實測 `class.a` 與 `class_a` 共用模擬 R2，前者自己清理後，兩小時前的課堂圖、作業圖都回 `200`。後者開首頁後，兩張都變 `404`。[前綴產生](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:39>) |
| 阻擋 2．刪除失敗後遺留 DO 舊照片 | **原案例已修好** | 實測先上傳 DO 作業照片，再啟用模擬 R2 並讓刪除失敗一次。單張刪除回 `503`，正文已移除參照，`photo-check` 仍保有該筆。超過寬限後再清理，DO 舊圖與待辦都已刪除。[單張刪除](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3666>) |
| 阻擋 3．訂正已提交卻回失敗，重試多一張 | **部分修好** | 相同內容立即重試只留一張。但讓提交後的畫面讀取失敗，仍得到 `503`，此時狀態已是 `assigned`，原成績與舊圖都已清除。延遲到再次批改完成才抵達的相同請求，還會清除新成績。[訂正提交與回應](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3645>) |
| 應修 1．教師 `GET /api/homework` | **正確性已修好，讀取成本仍在** | 實測只改摘要欄位順序，GET 沒有寫主檔。注入摘要修寫失敗仍回 `200` 與正確張數。缺正文時回 `broken: true`，前端顯示「作業資料遺失」。每次 GET 仍逐份讀正文。[清單與 `canonical` 比對](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3761>)、[前端顯示](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:635>) |
| 應修 2．其他寫入點的順序 | **部分修好** | 已核對兩種上傳、單張刪除、訂正、刪作業、刪課堂、刪班級、清除舊照均先呼叫 `notePhotos`。但課堂刪除仍先刪實體、最後才存主檔，中途失敗可留下指向缺圖的紀錄。[清除舊照](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1435>)、[刪課堂](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1749>) |
| 應修 3．大量清理 | **部分修好** | 實測 `deleteMany` 的 1,001 個 R2 key 分成 `1000 + 1`。但 `photo-check` 仍逐筆刪，整份清單最後才寫回。整站掃描沒有持久游標，失敗後下一次首頁請求會立刻重掃。[批次刪除](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:128>)、[清理與節流](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3342>) |
| 應修 4．設定頁張數與容量 | **原案例已修好** | 張數直接從作業正文取得，不依賴舊摘要有無 `photoCount`。兩個上傳入口都使用 `decodedBytes`，合法 base64 的尾端補位已扣除。顯示值統計有參照的照片，並非 bucket 實際用量。[用量計算](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1395>)、[`decodedBytes`](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:199>) |
| 應修 5．還原留下錯誤 `imageId` | **錯掛照片已修好，引入備份回歸** | 還原確實清除了 `imageId`。但實測純照片數值作答第一次還原回 `200`，再匯出、到另一個乾淨實例還原就回 `400`。[還原作答](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2990>) |
| 應修 6．示範批改遇到缺圖 | **已修好** | `drainHomework` 在示範與正式 AI 分流前逐張讀圖。實測移除模擬 R2 物件再送出，示範模式成為 `error`，照片清單保留。後續補傳還有另一個問題，見下表。[批改前讀圖](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3512>) |
| 應修 7．部署帳號與文件 | **部分修好** | `account_id` 與共用目錄的教學帳號一致，production 繼承此值。兩份文件對預設 R2 與舊 DO 圖的主線已一致。但部署文件仍要求使用預設登入，與本專案指定的 `teaching-cloud` profile 衝突。無 R2 時的選用 Supabase 作業照片分支，在部署文件第 106、114 行也有不同說法。[Wrangler 設定](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/wrangler.jsonc:5>)、[部署說明](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/DEPLOYMENT.md:100>) |
| 建議 1．DO 分支驗證圖片 | **已修好** | `vaultPhotos.put` 與 R2 都先經過 `parseDataUrl`。重跑 C-6 測試，無法解碼的 base64 回 `400`，沒有照片物件寫入。但失敗資料仍會新增待辦。[DO 寫入驗證](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:68>) |
| 建議 2．R2 故障回歸測試 | **部分補齊** | 最後一個 `R2 round 2` 測試通過。它手動放入 `other/` 與待辦，受引用的兩張作業圖則是剛上傳的。這能驗證一般前綴與寬限，無法驗證前綴碰撞、老照片的參照判斷，或真正刪除失敗後是否留下待辦。[最後一個 R2 測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:2849>) |

## 新發現

### 阻擋

| 位置 | 證據與影響 | 修正方向 |
|---|---|---|
| [`r2Prefix` 與 DO 命名](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:39>) | DO 用原始 `APP_INSTANCE` 選實例，R2 卻將非英數、底線、連字號的字元換成 `_`。這造成上述跨站刪圖。不同 Worker 若各有獨立 DO namespace，又共用 bucket 和預設站名 `default`，也缺少部署層隔離。 | 讓 R2 前綴唯一對應實際擁有資料的 DO，例如使用該 DO 的穩定唯一 ID，或強制每個部署使用專屬 bucket。保留兩個獨立狀態共用同一 bucket 的回歸測試。 |
| [訂正上傳與 `view()`](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3657>) | 提交與刪舊圖後才重讀作業及題目，讀取出錯就回 `503`。`photoHash` 雜湊的是 data URL，只能辨識相同內容。實測同一個 `restart: true` 請求在下一次批改完成後重送，回 `200`，把新成績清掉並換了照片 ID。這也違反作業文件第 157 行的失敗承諾。 | 前端對每次上傳產生穩定請求 ID，連同作業版本、照片 ID 與提交結果保存。重播同一請求直接回傳既有結果。將產生成功回應所需的可失敗讀取移到提交前。 |
| [還原作答](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2990>)、[作答驗證](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/validation.ts:713>) | 第一次還原先通過驗證、再刪掉唯一的 `imageId`，因此存下無法再次驗證的作答。實測第二次還原回 `400`「請在畫布作答、拍照或寫下說明」，整份備份匯入失敗。 | 為歷史備份定義可再次匯入的「原照片未隨備份還原」表示，保留文字、辨識稿與成績。維持正常學生提交的圖片要求，並測試連續兩次匯出、還原。 |

### 應修

| 位置 | 證據與影響 | 修正方向 |
|---|---|---|
| [上傳去重與六張上限](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3624>) | 實測缺圖後照錯誤提示重傳原檔，API 回 `200`，R2 仍是零個物件，讀圖仍回 `404`。另外，第六張已成功但回應遺失，重送第六張會先撞上限，回 `429`。 | 先辨認已完成的同一請求，再對真正新增的照片檢查上限。缺圖時允許補寫原照片 ID，成功前確認物件已可讀。 |
| [`photo-check` 的大小與清理進度](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:61>) | 每次都是讀寫同一個完整物件。成功上傳、成功刪除，以及通過外層正規式但無法解碼的輸入，都會留下一筆直到清理。實測一次壞圖回 `400`，待辦仍增加一筆。沒有教師開頁或清理持續中斷時，清單沒有筆數上限，最後可碰到 DO 單值限制，連正常上傳也無法登記。[Cloudflare 儲存限制](https://developers.cloudflare.com/durable-objects/platform/limits/) | 先完成解碼驗證，再登記。將待辦拆成獨立鍵或分頁，依固定批量處理並持久化進度。已確認提交或刪除的項目可提早移除。 |
| [`maybeSweep`](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3362>) | 時戳只在整輪成功後寫入。實測 R2 列舉失敗後連開兩次首頁，就重掃兩次。讀取 `photo-sweep-at` 本身也在錯誤處理外，注入此讀取失敗時首頁回 `503`。掃描期間，同一 DO 的課堂請求也在排隊。 | 分開記錄嘗試時間、成功時間與進度，失敗後退避，以背景分批清理。首頁讀取清理時戳失敗時仍應能回應。 |
| [課堂刪除](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1749>)、[清理計數](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3346>) | 課堂先刪實體，最後存主檔。主檔寫失敗會留下照片索引，後續清理看到索引就移除待辦。另實測只清一張舊作業圖，回應 `removed: 2`，因同一張先由到期清除計數，後由待辦對已不存在的物件再計一次。 | 先持久化解除參照與待刪工作，再刪實體。使用不同計數表示「移除照片參照」與「完成待辦」，避免重複向教師報數。 |
| [部署文件](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/DEPLOYMENT.md:88>)、[作業文件](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/HOMEWORK.md:157>) | 固定 `account_id` 已解決目標帳號設定，但文件仍指示用預設 profile。文件也把上傳失敗保留舊成績、每日最多清理一次寫成保證，與本輪故障測試不符。 | 建桶、查桶、設 secret、部署統一使用 `teaching-cloud`。無 R2 時分開說明課堂圖與選用 Supabase 的作業圖，並依修正後的行為更新重試承諾。 |

### 建議

| 位置 | 證據與影響 | 修正方向 |
|---|---|---|
| [一小時寬限與並行上傳](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3342>) | **正常單一 DO 路徑未發現並行覆寫或誤刪一小時內新圖。** HTTP 上傳與清理都經同一條 `enqueue`，新照片使用 UUID。待辦路徑看登記時間，R2 全掃看 `uploaded`。實測未登記、剛放入 R2 的物件也有保留。兩條路徑採用的時間來源不同，後續若改為背景並行清理，不能直接沿用目前假設。[DO 請求佇列](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:98>) | 固定時鐘測試寬限前後，分別覆蓋「有登記但未提交」「無登記的新物件」「已超時仍有參照」。若改成背景批次，在刪除前再次確認參照及物件版本。 |
| [R2 round 2 測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:2857>) | 目前測試可在上述三個阻擋問題都存在時通過。本輪額外確認了 1,001 個 key 的分批，以及有參照的兩小時舊圖在本人清理後仍可讀，這些尚未寫入專案測試。 | 將跨站碰撞、實際刪除故障、提交後回應失敗、缺圖補傳、第六張重試、備份二次還原納入固定回歸。上傳案例同時斷言 HTTP 狀態、學生與教師看到的成績、照片 ID 及實體物件。 |

本輪全程唯讀，以記憶體建置重跑既有兩個 R2 測試及兩個 C-6 上傳測試，四項均通過，另以模擬 R2、DO vault 與故障注入核對上述結果。`npm run check` 的 202/202 是作者交接紀錄。本輪未重跑完整套件、未連線正式 R2，也未修改檔案。
