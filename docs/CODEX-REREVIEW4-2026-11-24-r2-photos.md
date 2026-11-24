# Codex 再審：照片改存 R2（第 5 輪，2026-11-24）

模型 gpt-6.2-astra，reasoning high，唯讀。原文如下。

**需修正後再審。**

## 上一輪項目逐項

| 項目 | 是否修好 | 證據 |
|---|---|---|
| 刪班級、刪作業的 `detachHomework`／`purgeHomework`／`hw-trash` | 部分修好 | 主檔寫入失敗時，班級、作業和照片仍可讀。主檔成功後才刪實體，凍結題目刪除失敗也能由清理收尾。但背景批改若已取得租約，仍能把刪除成功的作業寫回。見阻擋 1。[刪除流程](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3434>) |
| `sheet.restarts` 與舊訂正請求 | 原來的 12 筆淘汰案例已修好 | 同一個訂正 ID 經過 13 次加圖、刪圖及再次批改後重播，成績與照片 ID 均保留。但前端重新選檔會產生新 ID，伺服器也未核對訂正針對哪一版成績。見阻擋 2。[回歸測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3060>) |
| 重播與缺圖補存、R2 讀取故障、六張上限 | 新格式已修好，舊格式仍有缺口 | 有 `hash` 的照片用原請求 ID 即可補回原物件。注入 R2 讀取例外得到 `503`，補寫次數為 **0**。同一張第六張重送成功，新增第七張回 `429`。六張舊照片缺少 `hash` 時，原檔補傳仍回 `429`。[上傳判斷](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3692>) |
| 依 `depth` 還原、`normalizeVerdict`、`imageLost` 二次還原 | 畫布滿分已修好，拍照數值題部分修好 | 已發回的第 1 層 **3/3** 經兩次還原仍是滿分，`imageLost` 保留，舊 `imageId` 已移除。拍照數值題的逐小題對錯及待覆核狀態仍會消失。見阻擋 3。[還原處理](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3018>) |
| `imageLost` 作答不送 AI | 純缺圖案例已修好 | 只有 `imageLost` 的作答回 `409`，前端自動批改以 `lostOnly` 排除。另有辨識稿時，快速批改會送出稿件，但「AI 判斷」與「紅筆批改」會漏送。見阻擋 4。[伺服器檢查](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3178>)、[前端過濾](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:2493>) |
| 各刪除點的 `notePhotos`、清單收尾與並行上傳 | 正常路徑已修好，故障累積未修好 | 刪單張、作業、課堂、班級及清舊照都先登記。整份作業成功刪圖後會 `settlePhotos`。同一 DO 的 HTTP 上傳與清理共用 `enqueue`，未發現正常並行請求互相覆寫清單。相同請求連續五次寫圖失敗，仍新增五筆待辦。[清單寫入](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:62>)、[DO 請求序列](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:83>) |
| 一小時寬限與 `maybeSweep` | 節流已修好，寬限部分修好 | 實測保留無待辦的新物件及有參照的兩小時舊圖，刪除無參照的舊圖。R2 列舉失敗時，連續兩次首頁均回 `200`，只嘗試列舉一次。舊待辦遇到剛補寫的同 key 物件，仍可提前刪除。見應修 2。[待辦清理](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3372>)、[R2 列舉清理](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:155>) |
| 清除舊照片結尾不再寫主檔 | 已修好 | 只清一張舊作業照片，實測回 `200`、`removed: 1`，主檔只寫一次。結尾直接回應，沒有第二次寫入。[清除收尾](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1475>) |
| `r2Prefix`、`decodedBytes`、`photoHash`、`vaultPhotos` 驗證 | 未見退步 | `class.a` 與 `class_a` 共用模擬 bucket 的隔離測試通過。兩個上傳入口均先解碼再登記，vault 寫入也有驗證。`decodedBytes` 會扣除合法 base64 尾端補位。`photoHash` 取完整 data URL 的 SHA-256 前 12 bytes，判斷的是相同編碼內容。[儲存與驗證](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:39>)、[大小與雜湊](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:218>) |
| `canonical`、`GET /api/homework`、`drainHomework` 缺圖 | 指定行為已修好 | 只調換摘要欄位順序，GET 寫入 **0 次**。改錯摘要狀態後，GET 回傳正確的 `assigned` 並修復一次。內容遺失會標 `broken`。`drainHomework` 在模擬及正式批改前逐張讀圖，任一張缺失即進入錯誤處理。[摘要比對](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3874>)、[批改前讀圖](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3586>) |
| `account_id`、`teaching-cloud`、兩份文件 | 帳號、部署指令及刪除順序已修好 | `wrangler.jsonc` 的 `account_id` 與本機共用目錄一致。部署指南已寫明 `npm run deploy -- --profile teaching-cloud`，作業文件也已統一為先移除摘要並存檔，再刪實體。重試保證與「最多 3 筆」仍超過實作，見下方。[部署指南](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/DEPLOYMENT.md:95>)、[作業文件](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/HOMEWORK.md:157>)、[帳號設定](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/wrangler.jsonc:5>) |
| `R2 round 2` 與後續回歸 | 既有案例通過，仍缺下列交錯情境 | 本輪以記憶體建置重跑 **11 個相關後端案例，11/11 通過**，包含指定的 `R2 round 2`。該案的待辦由測試直接放入，未涵蓋真實刪除失敗後，背景批改又寫回的順序。[R2 round 2](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:2849>) |

## 新發現

### 阻擋

| 項目與位置 | 證據及影響 | 修正方向 |
|---|---|---|
| **1. 進行中的批改可讓已刪作業復活。** [批改寫回](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3606>)、[重建摘要](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3339>) | 讓背景批改取得照片後暫停，再刪作業並注入凍結題目刪除失敗。刪除回 `200`，原 QR 隨即回 `404`。恢復批改後，同一 QR 又回 **`200 graded`**，教師清單也重新出現該作業，照片卻回 `404`。清理看到復活的摘要便跳過 `hw-trash`。 | 在同一個 DO 佇列內，寫回前確認主檔仍有該作業、工作仍在佇列，且租約相符。作業已解除參照時直接丟棄結果。固定測試應等批改返回、再跑一次清理，最後同時查教師清單、學生 QR 及垃圾清單。 |
| **2. 換了請求 ID 的舊訂正仍會清掉新成績。** [前端產生 ID](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:892>)、[伺服器判斷訂正](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3705>) | 實測第一次訂正完成並再次批改後，用同一張照片、`restart: true`、新 ID 重送，回 **`200 assigned`**，新成績被清空。前端在每次選檔上傳時產生新 UUID。回應遺失後重新選檔，或另一個分頁仍停在舊成績時，都缺少能辨認原批次的資訊。 | 讓訂正攜帶學生點「訂正」時看到的成績版本，伺服器只接受對該版的一次轉換。前端保留尚未確認的請求 ID，直到收到回應。同一張原稿仍可用於學生針對**新版本**主動發起的下一次訂正。 |
| **3. 拍照數值題還原後遺失逐小題判定。** [作答還原](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3029>)、[補救題選取](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1818>) | 兩小題的已發回作答，備份前為 `correct: false`、`itemsCorrect: [true, false]`。還原後兩欄均消失，`grade.finals` 仍有 `["1","3"]`。老師仍看得到成績，但補救練習會從只重做錯題變成重做全部，逐題學習紀錄也失去依據。 | 有 `finals` 時沿用 `applyFinals` 重建逐題結果。教師已改判、沒有 `finals` 的資料，依原人工判定與 `photoWork.items` 還原。回歸測試應核對兩次還原後的逐題結果與實際派發的補救題。 |
| **4. 還原後有辨識稿，AI 仍可能收到空作答並給分。** [批改資料組裝](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3179>) | 用只剩 `work` 的還原作答攔看送往模擬供應商的內容。`verdict`、`full` 都回 `200`，兩者均沒有圖片，也沒有學生辨識稿。只有 `fast` 帶入稿件。老師關閉快速批改或手按紅筆批改，就可能拿到只依題目與規準產生的分數。 | 依**最後實際要送出的內容**檢查作答證據。缺圖但有確認稿時，明確採文字批改並記錄 `basis: 'text'`。需要看圖的模式則回 `409`。測試直接斷言供應商收到的訊息含學生作答。 |

### 應修

| 項目與位置 | 證據及影響 | 修正方向 |
|---|---|---|
| **1. `photo-check` 在持續故障時沒有大小上限。** [清單寫入](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:62>)、[配置照片 key](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3725>) | 同一份資料、同一 `requestId` 連續五次 R2 寫入失敗，清單新增 **5 筆**。每次登記及結案都讀寫同一個完整物件，掃描也到整輪結束才保存進度。持續故障時，其他班級的正常上傳也要承擔這份清單的成本。 | 未完成的同一請求沿用同一筆待辦與物件 key。把清單拆鍵或分頁，每批保存進度，並保留未確認項目供下次續做。 |
| **2. 待辦路徑仍可提前刪掉一小時內的新物件。** [保留最早時間](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:66>)、[刪除判斷](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3373>) | 模擬刪作業主檔失敗留下舊待辦，兩小時後補存同 key 的缺圖，再讓移除參照後的實體刪除失敗。下一次清理立即刪掉剛補回的物件。此例的參照已由使用者移除；正常新上傳與清理經同一 DO 排隊，本輪未重現有效作答的照片在提交途中被誤刪。 | 待辦刪 R2 前也核對物件的 `uploaded`，以較晚時間計算寬限。保留「舊待辦＋新物件」及一小時界線的固定測試。 |
| **3. 滿六張的舊作業無法原位補圖。** [去重與上限](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3707>) | 舊照片沒有 `hash`，遺失其中一張後重傳原檔，實測回 `429`，原物件仍缺失。文件對「重傳原檔會補回原位」未限定資料版本。 | 允許學生指定目前這張作業卷上的缺圖 ID，確認歸屬與實體確實缺失後才補寫。另將 `queued`／`grading` 期間重播會回 `409` 的行為寫入文件。 |
| **4. 刪除 `broken` 作業會留下凍結題目。** [建立清理工作](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3434>) | 模擬只遺失 `hw:<id>`，主檔仍有該生摘要與凍結題目。從教師端刪除回 `200`，再清理後仍有 **1 份 `hwq:`**，`hw-trash` 卻已結案。原因是座號只從已遺失的作業內容取得。 | 解除摘要前合併 `meta.sheets` 與明細中的座號。另處理主檔提交失敗、作業仍有效時留下的 `hw-trash`，使這類取消的刪除也能結案。 |
| **5. 還原會丟失覆核標記與辨識稿批註。** [依層級還原](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3045>) | 第 1 層案例的 `needsReview: true` 與 `confidence: 0` 在還原後都消失，`votes` 也未被帶入。另一個快速批改案例的稿上批註從 **1 筆變成 0 筆**。老師失去待覆核提示，學生也看不到原有文字批註。 | 驗證後保留信心、投票及覆核狀態。用已還原的辨識稿重新驗證 `marks` 的行號與引文，再保留有效批註。 |
| **6. `sheet.restarts` 的「最多三筆」不成立。** [教師重新批改](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3934>)、[文件承諾](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/HOMEWORK.md:158>) | 交替執行學生訂正與教師重新批改，實測 `submissions` 仍為 **1**，`restarts` 已有 **5** 筆。教師重批不增加學生送出次數，兩者不能共用這個上限推論。 | 以成績版本控制訂正重播，讓收據可安全收斂。同步修正型別註解與文件；直接截斷舊 ID 會重新引入上一輪的成績遺失問題。 |

### 建議

| 位置 | 證據及影響 | 修正方向 |
|---|---|---|
| [批改工具列](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:2280>)、[手動批次入口](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3785>) | `lostOnly` 已套用在自動批改，但工具列待批數、「全部批改」與單筆 AI 按鈕仍納入純缺圖作答。伺服器會擋下，老師卻看到可操作的按鈕並收到可預期的錯誤。 | 計數、排隊與按鈕共用同一個可批改判斷。純缺圖作答直接顯示「請教師批改」，保留人工判對錯與給分。 |
| [第 4 輪回歸測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3036>) | 目前測試能驗證刪除當下的 `404`、相同 ID 重播及畫布滿分還原。這三項全部通過時，背景批改復活、舊分頁清成績及逐題判定遺失仍可發生。 | 將上述故障順序固定成測試，最後核對教師清單、學生 QR、照片實體、逐題成績及清理待辦。 |

本輪全程唯讀，額外驗證使用模擬 R2、DO vault 與攔截的 AI 請求。前端按鈕行為以原始碼核對，未操作瀏覽器或連線正式 R2。完整 `npm run check` 的 **210/210** 是作者交接紀錄，本輪重跑的是上述 **11 個**相關案例。


