# Codex 再審：照片改存 R2（第 7 輪，2026-11-24）

模型 gpt-6.2-astra，reasoning high，唯讀。原文如下。

**需修正後再審。** 第 7 輪重現兩個會影響學生作業的問題：自動清理會刪掉尚未刪除作業的 R2 照片，已成功去重的舊上傳也可能在下一輪訂正重新加回舊照片。

## 上一輪項目逐項

| 項目 | 是否修好 | 證據 |
|---|---|---|
| 阻擋 1．訂正檢查 `restartOf`、教師改判更新版本 | **主要路徑已修，版本碰撞仍須修** | 新訂正須為 `graded`、有成績且版本相符。前後端都取 `editedAt \|\| gradedAt`，教師改判會寫 `editedAt`。缺版本、改判後帶舊版本、另一分頁已開始訂正，固定測試均回 `409`。已確認的重送可直接讀回現況，這個例外合理。另以固定毫秒測試，改判時間等於舊版本時，過期訂正仍回 `200` 並清掉成績。這是時鐘邊界測試。[訂正入口](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3734>)、[教師改判](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3962>)、[前端取版本](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:873>) |
| 阻擋 2．請求 ID 已是照片 ID、刪舊照排除本次 key | **原缺陷已修好** | 收據或現有照片 ID 任一命中即視為重送。訂正成功後，舊 key 集合也明確排除新 key。經 13 次增刪讓收據淘汰的測試通過，另有測試確認重送後照片 GET 回 `200`、清單只有一張。不同內容共用 ID 的問題見下方。[去重與刪除集合](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3734>)、[收據淘汰測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3063>) |
| 阻擋 3．明細遺失後刪作業，舊 DO 照片留存 | **未修，合併前必修** | 用 DO 存圖、切到模擬 R2，再移除作業明細。教師刪除回 `200`，清理後 `hw-trash` 已結案，仍留一個 `hwphoto:` 實體。教師確認框明示會刪除上傳照片。「無法從 QR 讀取」解決了存取問題，仍未履行刪除承諾。應依精確作業前綴分批清除，完成前保留待辦。[刪除工作](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3458>)、[教師確認框](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:807>) |
| 應修 1．舊待辦提前刪除剛重寫的照片 | **未修，合併前必修** | 第一次寫圖失敗，將待辦時間推前兩小時，同 ID 重試後模擬主檔提交與回滾刪除失敗。下一次清理刪掉剛寫入約 **12 毫秒**的物件。`??=` 保留第一次登記時間，待辦刪除早於 R2 物件年齡檢查。應在每次實際重寫前刷新該 key 的保護時間。[待辦時間](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:62>)、[待辦刪除](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3393>) |
| 應修 2．`photo-check` 持續成長、並行上傳 | **正常並行通過；容量問題合併前必修** | 經實際 `ClassroomDurableObject.fetch` 處理器，讓兩個上傳與一次清理交錯，三者均回 `200`，兩張圖都在，待辦歸零。同 ID 失敗會合併，六個不同 ID 失敗則留下六筆。全站仍讀寫同一個無分頁的值，每日清理也要等教師開頁，且刪除失敗會保留該筆。應將待辦拆成獨立鍵或有界分頁，逐批保存進度。[待辦讀寫](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:62>)、[DO 佇列](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:83>) |
| 應修 3．還原遺失 `marks`、舊備份缺逐題結果 | **分開處理** | **現有備份的合法 `marks` 合併前必修。** 實測已發回、行號與引文都有效的一筆批註，還原後變零筆。可直接用既有 `parseMarks` 對同份辨識稿驗證。**舊備份已缺 `itemsCorrect`、只剩 `finals` 的回推可另案**，應記明受影響版本及補救練習的限制。本版能保留備份中已有的布林判定。[還原](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3031>)、[批註驗證](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/ai.ts:275>) |
| 應修 4．`redact` 長度與 `basis: 'text'` | **供應商路徑已修，示範模式有漏** | 用 3,000 字辨識稿在末尾放識別字，攔看模擬供應商實收訊息。`verdict`、`full`、`fast` 都收到末行，三者的成績也都有 `basis: 'text'`。無 API key 時，`fast` 有標記，`verdict`、`full` 仍是 `undefined`。[送稿與合併成績](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3202>)、[示範批改](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3249>) |
| 應修 5．無雜湊舊圖的補傳說明 | **主要內容已修，可接受另案做原位補圖** | 文件已限定有雜湊才能原位補回。實測可編輯、已滿六張的舊作業，直接補傳回 `429`，先刪缺圖項目再傳回 `200`，新照片排最後。文件宜補「作業可編輯時」，已批改畫面沒有單張刪除入口。[作業指南](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/HOMEWORK.md:159>)、[單張刪除條件](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3795>) |
| 建議 1．純缺圖作答的單筆 AI 按鈕 | **已處理** | 共用入列處會提示教師直接判對錯或給分；計數與自動佇列也排除純缺圖作答。本項依前端程式核對。[入列處理](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:2443>) |
| 建議 2．固定回歸測試 | **部分完成** | 指定的 `R2 round 2` 與檔尾的 `R2 round 6` 均通過。前者直接放入舊待辦，未涵蓋舊待辦遇上剛重寫的物件。名為拍照數值題的還原測試實際選的是 `canvas`，AI 斷言也只檢查狀態碼。[R2 round 2](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:2851>)、[還原測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3163>)、[R2 round 6](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3231>) |

## 新發現

### 阻擋

| 位置 | 證據與影響 | 修正方向 |
|---|---|---|
| **自動清理會刪除仍在主檔內的作業照片。** [建立保留清單](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3384>)、[教師清單的 `broken` 處理](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3905>) | 同一份作業，教師清單仍列出 `broken: true`，清理卻把缺明細視為沒有照片。實測保留主檔、移除明細、讓兩張 R2 圖超過一小時，再讀設定用量，實體從 **2 張變 0 張**。放回原明細後，學生讀圖回 `404`。全程沒有刪作業。 | 主檔仍有作業、明細缺失時，待辦清理與 R2 掃描都應保留該作業的完整照片前綴。教師明確刪除、主檔解除後，再由持久待辦清除該前綴。 |
| **已成功去重的舊上傳，可在下一輪訂正重新加入舊照片。** [雜湊命中即返回](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3740>)、[收據寫入](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3771>) | 以新請求 ID 上傳卷內已有的照片，第一次回 `200`，卻沒有記錄該 ID。完成批改、以新照片開啟訂正後，重送剛才**完全相同**的請求，仍回 `200`，舊圖實際加進新卷。批改可能讀到上一輪答案。 | 雜湊命中也要保存收據。普通加圖請求應綁定作業輪次，讓舊輪請求在收據淘汰後也無法改動新卷。 |

### 應修

| 位置 | 證據與影響 | 修正方向 |
|---|---|---|
| **學生重新選檔無法恢復已成功的訂正上傳。** [前端上傳](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:895>)、[失敗後重畫](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:620>) | 模擬第一張訂正已提交但學生沒收到回應。沿用原 ID 重送回 `200`；照前端重新選原檔的行為換 UUID，回 `409`。失敗後畫面保留本地的訂正狀態，與文件所述「再傳一次會看到已上傳畫面」有落差。另測同 ID 改傳不同內容也回 `200`，新內容未存。 | 前端保留尚未確認上傳的 ID，失敗後重新讀取卷面核對。後端收據綁定輪次與內容雜湊，同 ID 而內容不同時明確回 `409`。 |
| **成績版本只精確到毫秒。** [版本來源](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3367>)、[改判寫入](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3961>) | 固定時鐘測試中，教師已成功改判，版本字串仍相同，舊訂正得以清除改判結果。 | 每次 AI 批改與人工改判產生獨立版本，或使用單調遞增版號；日期繼續用於畫面顯示。 |
| **部署文件的具名 profile 查帳指令會被拒絕。** [部署指南](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/DEPLOYMENT.md:92>)、[本機 Wrangler 參數驗證](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/node_modules/wrangler/wrangler-dist/cli.js:357409>) | `wrangler.jsonc` 的 `account_id` 與共用教學目錄一致，本機及 production 都綁定 `PHOTOS → math-classroom-photos`。但本專案安裝的 Wrangler **4.150.0** 會直接拒絕文件範例 `wrangler whoami --profile teaching-cloud`。 | 將查帳步驟改為在專案目錄啟用既有 `teaching-cloud` profile，再執行不帶 `--profile` 的 `wrangler whoami`。建桶與部署保留各自支援的明確 profile 參數。[綁定設定](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/wrangler.jsonc:5>) |
| **文字批改依據的記錄與顯示不一致。** [示範成績](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3249>)、[教師批改畫面](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:2532>) | 示範模式的兩種深度漏記 `basis`。反過來，供應商路徑已正確標為 `text`，畫面卻一律稱為「快速批改」，並建議看圖重改；還原作答的原圖可能已不存在。 | 依實際送出的內容統一設定 `basis`。畫面顯示「依辨識稿批改」，有可讀原圖時才提示看圖重改。 |

### 建議

將上述兩個阻擋案例固定成測試，末端分別驗證「放回明細後，學生仍能讀到原圖」及「舊請求到達後，新卷的照片 ID、順序與內容都不變」。另外用真正的 `numeric + photoWork` 備份驗證逐題結果，並直接斷言供應商收到辨識稿末行。[後端測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3163>)

**其餘指定回歸。** `r2Prefix` 站名隔離、R2 優先與舊 DO 回讀、`vaultPhotos` 寫前驗證、`decodedBytes` 扣除補位、`photoHash` 對完整 data URL 取 SHA-256 前 12 bytes，以及 `imageLost` 二次還原，均未見退步。刪單張、訂正換圖、刪作業、刪課堂、刪班級及清舊照，在可取得照片 ID 的路徑都先 `notePhotos`。`maybeSweep` 列舉失敗後仍節流。另實測 `GET /api/homework` 只換摘要欄位順序時寫主檔 **0 次**，摘要狀態錯誤時修復 **1 次**；`drainHomework` 兩張缺一張時進入 `error`，沒有產生成績。兩份指南對 R2 優先及舊 DO 回讀一致，一小時寬限、重選原檔及刪除結案的承諾仍須與上述修正同步。[照片儲存](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:39>)、[還原驗證](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/validation.ts:715>)、[清理節流](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3434>)、[批改讀圖](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3612>)

本輪全程唯讀，以記憶體建置重跑 **14 個既有相關後端案例，14/14 通過**，另做上述故障、重送、並行與模擬供應商驗證。未執行完整 `npm run check`、瀏覽器 E2E 或正式 R2 測試。
