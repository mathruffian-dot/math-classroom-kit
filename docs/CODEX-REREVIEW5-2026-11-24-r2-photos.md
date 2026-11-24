# Codex 再審：照片改存 R2（第 6 輪，2026-11-24）

模型 gpt-6.2-astra，reasoning high，唯讀。原文如下。

**需修正後再審。** 第 6 輪確認背景批改已不會讓已刪作業復活，但仍重現舊訂正清掉新成績、上傳成功後照片卻讀不到，以及刪除作業後舊學生照片留在 Durable Object 的問題。

## 上一輪項目逐項

| 項目 | 是否修好 | 證據 |
|---|---|---|
| 阻擋 1．`drainHomework` 寫回前檢查 | **已修好** | 寫回時重新讀取主檔，確認作業仍存在、工作仍在佇列，並核對 `jobAt` 與租約 ID。重跑「批改讀圖中刪作業、凍結題目刪除失敗」案例，批改返回後學生 QR 仍是 `404`，清理也收掉明細與 `hw-trash`。[寫回檢查](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3625>) |
| 阻擋 2．訂正綁定 `restartOf` | **部分修好，仍阻擋** | 新版前端會記下按訂正時的 `gradedAt`。作業仍為 `graded` 且請求有帶舊版本時，會回 `409`。但省略版本、教師手動改判、另一分頁已開啟新一輪訂正，三條路徑仍接受過期請求。[前端取版本](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:870>)、[後端判斷](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3726>) |
| 阻擋 3．還原 `correct`、`itemsCorrect` | **完整備份已修好；舊備份部分修好** | 以真正的 `numeric + photoWork` 題型連續還原兩次，`false`、`[true,false]` 均保留。若備份來自前版已還原過的資料，兩欄已遺失但 `grade.finals` 還在，本版兩次還原後仍無逐題判定。[作答還原](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3029>) |
| 阻擋 4．AI 依實際內容批改 | **空作答問題已修好** | 純 `imageLost` 回 `409`。攔看模擬供應商實收訊息，`verdict`、`full`、`fast` 都有收到短辨識稿。長稿截斷與批改依據標記仍需修正。[訊息組裝](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3192>) |
| 應修 1．照片 ID 沿用請求 ID、`photo-check` 收斂 | **部分修好** | 同一作業、座號及 `requestId` 連續三次寫 R2 失敗只留一筆，成功後照片 ID 正確。不同 ID 的失敗仍各留一筆，前端重新選檔會換 UUID；清單沒有總量或分頁界線。[照片 ID](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3748>)、[前端上傳](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:895>) |
| 應修 2．一小時寬限，作者標「未改」 | **不可接受** | 實測一般 R2 掃描保留剛上傳且無參照的新圖，也保留仍有參照的舊圖。但同一請求兩小時後重試，會沿用舊待辦及物件 key；剛寫入、尚未成功寫進作業清單的照片可被立即清掉。[待辦時間](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:62>)、[清理判斷](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3386>) |
| 應修 3．六張無 `hash` 舊照片的缺圖補傳，作者標「未改」 | **原位修復可延後，現行文件不可照留** | 新格式第六張重送可成功，第七張新圖回 `429`；舊格式六張中缺一張，重傳原檔仍回 `429`。舊照片也可能在 DO 缺失。若接受人工復原，須寫明可編輯狀態下先刪缺圖項目再補傳，新圖會排在最後，並以舊資料測過。[去重及張數檢查](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3728>)、[作業文件](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/HOMEWORK.md:158>) |
| 應修 4．`detachHomework` 座號與取消 `hw-trash` | **指定兩項已修好** | 座號取明細和主檔摘要的聯集。明細遺失後刪除可清掉凍結題目；主檔刪除寫入失敗後，實測下次清理取消 `hw-trash`，有效照片仍在。舊 DO 照片實體另有缺口，見阻擋 3。[座號來源](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3451>)、[取消刪除](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3401>) |
| 應修 5．`confidence`、`votes`、`needsReview` 與 `marks` | **前三欄已修好；`marks` 延後不可接受** | 連續還原兩次，信心 `0`、投票與待覆核旗標均保留。同一份備份內有有效行號、引文及對應辨識稿，批註仍從一筆變零筆。這會遺失已發回學生的文字回饋。[成績還原](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3050>) |
| 應修 6．移除 `sheet.restarts` | **已修好** | 新程式已停止累加 `restarts`，`uploads` 保留最近 12 筆，文件也已改寫。超過 12 筆後的安全性仍取決於版本檢查及物件 key 保護。[收據上限](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3761>) |
| 建議 1．前端 `lostOnly` | **計數與佇列已修好** | 工具列計數、自動批改及共用入列函式均已排除純缺圖作答。單筆「AI 判斷」「AI 紅筆批改」仍顯示可按，點擊後被入列函式略過，畫面沒有說明。[計數](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:2280>)、[入列](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:2434>) |
| 建議 2．補固定回歸 | **部分修好** | 已補背景批改與刪除交錯、重試只留一筆待辦等案例。新增的「拍照數值題」還原測試實際選 `canvas`，AI 斷言只查 mock 回 `200`。指定的 `R2 round 2` 通過，但舊待辦是測試直接放入，未涵蓋舊待辦碰上新寫入物件。[R2 round 2](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:2849>)、[第 5 輪還原測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3161>) |

**前幾輪回歸。** `r2Prefix` 的站名隔離、R2 優先與舊 DO 回讀、`vaultPhotos` 寫前驗證、`decodedBytes` 扣除 base64 補位、`photoHash` 對完整 data URL 取 SHA-256 前 12 bytes，以及 `imageLost` 二次還原，均未見退步。刪單張、作業、課堂、班級與清舊照的正常路徑都有先 `notePhotos`。同一 DO 的 HTTP 上傳與清理經同一條佇列，未見兩個正常請求互相覆寫待辦。`maybeSweep` 在列舉失敗後仍會節流。[照片儲存與驗證](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:39>)、[DO 佇列](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:83>)、[清理節流](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3427>)

**清單與部署。** 實測只調換摘要欄位順序，`GET /api/homework` 寫主檔 **0 次**；改錯摘要狀態後，回傳正確 `assigned` 並修復 **1 次**。`drainHomework` 遇到兩張中缺一張會進入 `error`。`wrangler.jsonc` 的 `account_id` 與共用教學目錄相符，本機與 production 都有 `PHOTOS` 綁定。兩份文件對部署 profile、R2 優先及舊 DO 回讀一致；一小時寬限和缺圖補傳的承諾需要依下列結果修訂。[教師清單](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3886>)、[批改讀圖](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3605>)、[帳號設定](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/wrangler.jsonc:5>)、[部署指南](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/DEPLOYMENT.md:89>)

## 新發現

### 阻擋

| 項目與位置 | 證據與影響 | 修正方向 |
|---|---|---|
| **1．舊分頁仍可清掉新成績，或把舊照片混入新訂正。** [訂正判斷](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3737>)、[教師改判](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3934>) | 實測三條路徑。① 教師重批後，舊版請求省略 `restartOf`，回 `200 assigned` 且成績消失。② 教師手動改判後 `gradedAt` 未變，帶舊畫面版本也得到相同結果。③ 新一輪訂正已開啟，此時舊分頁帶更早的 `restartOf` 上傳，回 `200`，舊圖被附加到目前作業。 | 每次 AI 重批或教師改判都更新獨立版本。凡帶 `restart: true` 都先驗版本與作業狀態；已確認成功的同請求可回既有結果，其餘過期或缺版本的訂正回 `409` 並提示重新整理。 |
| **2．照片 ID 沿用請求 ID 後，舊照清理能刪掉剛提交的同一個 key。** [配置 key 與取得舊清單](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3748>)、[提交後刪舊照](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3774>) | 實測保留第一張訂正照片，經 13 次加圖、刪圖使收據淘汰，再次批改後重送原來的無版本請求。上傳回 **`200`**、清單有 **1 張**，該張照片 GET 卻回 **`404`**。新 key 同時在舊清單裡，清理把它刪了；回滾分支也直接刪 `key`。 | 寫入前核對該 ID 是否已有有效照片及其內容。成功後只刪「舊集合減新集合」，回滾只移除本次新建且無參照的物件。回歸必須讀回照片實體。 |
| **3．明細遺失的作業刪除成功後，舊 DO 學生照片仍永久留存。** [建立刪除工作](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3451>)、[清理結案](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3408>) | 先將照片存在 DO，再啟用模擬 R2 並移除 `hw:<id>`。教師刪除回 `200`，清理後 `hw-trash` 已結案，`hwphoto:<作業>/<座號>/<照片>` 仍存在。摘要補得回座號，補不回照片 ID；R2 列舉也找不到 DO 裡的舊照片。 | 對已從主檔解除的作業，依精確的 `hwphoto:<作業 ID>/` 前綴分批清除舊 DO 物件，或使用可重建的持久索引。確認實體清完才結束 `hw-trash`。 |

### 應修

| 項目與位置 | 證據與影響 | 修正方向 |
|---|---|---|
| **1．舊待辦會提前刪除新物件。** [登記](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:66>)、[刪除](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3387>) | 第一次 R2 寫入失敗，兩小時後以同 ID 重試；第二次照片寫入成功，主檔提交和回滾刪除失敗。下一次掃描刪掉物件年齡 **0 秒**的新圖。整個案例沒有人工移除參照。已提交且仍有參照的照片在對照測試中有保留。 | 每次重新寫物件都更新保護時間，或在待辦刪除 R2 前查物件 `uploaded`，以較晚時間計算一小時。兩條清理路徑共用寬限判斷。 |
| **2．持續故障時 `photo-check` 仍可無界成長。** [整份清單讀寫](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:62>)、[課堂上傳](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2219>) | 同一張作業照用五個不同 ID 寫入失敗，留下五筆。學生重新選檔會產生新 ID，課堂上傳也每次產生 UUID。所有班級共用同一筆完整物件，故障持續時會拖累其他班級的上傳與清理。 | 前端保留尚未確認的上傳 ID；待辦採獨立鍵或分頁，每批保存進度。保留追蹤未清實體的能力。 |
| **3．還原遺失可恢復的批註與逐題結果。** [還原](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3030>)、[現有批註驗證](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/ai.ts:275>) | 實測合法 `marks` 從一筆變零筆。另以保有 `finals`、缺少逐題欄位的備份還原，結果仍是 `undefined`，補救練習失去選題依據。 | 用既有 `parseMarks` 對還原的 `work` 驗證行號與引文。優先保留有效人工判定；拍照數值題缺少逐題結果且仍有 `finals` 時，用既有判題函式補回。 |
| **4．無圖時送出的長辨識稿會截掉最後答案。** [辨識稿上限](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/validation.ts:708>)、[遮蔽函式](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3088>)、[批改結果](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3217>) | 作答接受 3,000 字，送出前的 `redact` 截到 2,000 字。實測把最後答案放在第 2,050 字之後，三種模式收到的訊息都缺少末行；`verdict`、`full` 也沒有記錄 `basis: 'text'`。無圖作答只剩這份稿件，漏掉末行會直接影響給分。 | 將個資遮蔽與欄位長度分開，保留合法辨識稿全文。依實際送出的內容標記批改依據，測試直接核對供應商訊息末行。 |
| **5．補圖文件涵蓋了實作無法處理的舊資料。** [補寫條件](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3728>)、[作業文件](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/HOMEWORK.md:159>) | 有 `hash` 的第六張可原位補回；無 `hash`、已滿六張的舊作業實測回 `429`。文件承諾「重傳原檔會補回原位」，教師無法由文件判斷該怎麼處理。 | 實作依既有照片 ID 補缺圖，或將文件承諾限定於有 `hash` 的照片，列出經驗證的舊作業復原步驟。 |

### 建議

| 位置 | 證據與影響 | 修正方向 |
|---|---|---|
| [單筆批改畫面](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:2526>) | 純缺圖作答仍顯示兩個 AI 按鈕，點擊後沒有回饋，教師容易以為系統正在批改。 | 共用 `lostOnly` 停用這兩個按鈕，顯示「請教師直接批改」，保留人工判對錯與發回。 |
| [R2 與還原固定測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3125>) | 現有案例可以全數通過，同時仍有 `200` 後照片 `404`、垃圾清單結案後 DO 留圖、AI 收不到稿件末行等結果。 | 將本輪案例固定下來，末端斷言同時核對學生 QR、教師成績、照片實體、待辦及供應商實收內容。 |

本輪全程唯讀，以記憶體建置重跑 **13 個既有相關後端案例，13/13 通過**，另以模擬 R2、DO vault 與 AI 供應商執行上述針對性驗證。前端按鈕依原始碼核對。本輪未執行瀏覽器 E2E、完整 `npm run check` 或正式 R2 測試；交接檔的 `213/213` 與 `13/13` 是作者前次紀錄。
