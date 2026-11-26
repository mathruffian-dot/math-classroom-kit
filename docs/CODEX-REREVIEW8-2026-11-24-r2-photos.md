# Codex 再審：照片改存 R2（第 9 輪，2026-11-24）

模型 gpt-6.2-astra，reasoning high，唯讀。原文如下。

**需修正後再審。** 第 8 輪的兩個案例在新版訂正卷上已通過，但仍重現三個合併前必修問題：升級前的訂正卷會被當成初始卷、批改失敗後舊請求會重複扣送出次數，以及學生選取的照片尚未傳完就能送出批改。

## 上一輪項目逐項

| 項目 | 是否修好 | 證據 |
|---|---|---|
| 一般上傳帶 `version`，舊分頁不能加圖 | 新版卷已修好；舊資料仍有缺口 | 前端一般上傳帶 `version` 和 `round`。重跑「訂正 → 教師重新批改 → 再訂正」，舊版本與省略版本的加圖都回 `409`，新卷仍可加第二頁。升級前已開始訂正的卷見阻擋 1。[前端上傳](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:903>)、[固定測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3350>) |
| 前端送出批改帶 `version`，後端先核對再扣次數 | 新版成功批改路徑已修好；失敗路徑仍有缺口 | 前端確實送 `{ version }`。上述新版訂正卷收到舊版本或空 `{}` 都回 `409`，維持可編輯。批改失敗後，同一個版本仍能再扣次數，見阻擋 2。[前端送出](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:872>)、[後端送出](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3858>) |
| 上傳失敗後重讀作業卷，依版本決定是否保留訂正畫面 | 已修好 | 教師改判後，舊訂正上傳回 `409`，重讀會顯示新成績。另模擬「後端已存好，前端沒有收到回應」，重讀後畫面顯示已存的那張照片，可繼續上傳。只有伺服器仍是原成績版本時才保留訂正畫面。[錯誤處理](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:620>) |
| 舊 `photo-check` 搬移取較晚時間，一小時內的新圖保護 | 已修好 | 將兩小時前的舊項目、剛登記的同名 `pc:`、尚未寫入作業清單的新 R2 物件放在一起清理。實測保留較新的時間戳與照片。R2 全桶掃描也另查物件的上傳時間。[舊清單搬移](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3410>)、[R2 寬限判斷](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:150>) |
| `hwphoto:` 每批 50，`hw-trash` 延後結案 | 已修好 | 放入 51 個同作業前綴的舊 DO 照片鍵。刪作業後剩 1 個，`hw-trash` 仍在；下次清理移除最後 1 個才結案。立即刪除與後續清理兩處都使用 50。[立即刪除](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3510>)、[後續清理](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3443>) |
| `notePhotos`、待辦增長與並行上傳 | 正常上傳已修好；大量待辦另案 | 成功上傳會移除自己的 `pc:`。經 `ClassroomDurableObject.fetch` 同時送兩筆上傳與一次清理，三者皆回 `200`，作業有兩張、R2 有兩個物件、待辦歸零。未結案待辦的總數仍無上限，見下方應修。[登記與移除](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:67>)、[DO 請求佇列](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:83>) |
| `requestId`、內容去重與合理重傳 | 既有案例通過 | 新 ID 重傳相同內容仍只有一張；同 ID 換內容回 `409`；第六張重送、同圖補回遺失物件、有效訂正重新傳同圖均通過。沒有發現這些合理重傳被六張上限或去重擋掉。[去重與補圖](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3765>) |
| `r2Prefix`、`decodedBytes`、`photoHash`、`vaultPhotos` | 未見退步 | 站名經 `encodeURIComponent` 隔離；R2 查無物件才回讀舊 DO。DO 寫入前也檢查 data URL 與 base64 可解碼性。大小計算扣除補位，雜湊取完整 data URL 的 SHA-256 前 12 bytes。[儲存與隔離](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:39>)、[大小與雜湊](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/photos.ts:212>) |
| `sweepPhotos`、`maybeSweep`、各刪除點 | 未見退步 | 作業主檔仍在但明細遺失時，清理保留整份作業的照片。刪單張、訂正換圖、刪作業、刪課堂、刪班級及清舊照都可追到先登記待辦的路徑。自動清理先記嘗試時間，失敗仍按日節流。[清理與引用判斷](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3393>)、[節流](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3462>) |
| `canonical`、`GET /api/homework`、`drainHomework` 缺圖 | 已確認 | 摘要只有欄位順序不同時，實測主檔寫入 **0 次**；竄改張數後修復 **1 次**。兩張作業缺一張時，批改進入 `error`，沒有產生成績。[摘要修復](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3948>)、[逐張讀圖](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3642>) |
| 還原、`imageLost` 二次還原、文字批改 | 未見退步 | 照片作答還原後可再匯出、再還原；已發回的判定、逐項對錯及覆核旗標回歸案例通過。批註依辨識稿核對行號與引文，只有辨識稿時保留文字批改依據。僅剩 `finals` 的歷史備份仍屬前輪已知限制。[還原作答與成績](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3030>)、[`imageLost` 驗證](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/validation.ts:715>) |
| `account_id`、部署與作業文件、`R2 round 2` | 設定與指定測試已確認；文件有一項行為落差 | `account_id` 與共用 `teaching-cloud` 目錄一致，本機與 production 均綁 `PHOTOS → math-classroom-photos`。兩份文件對 R2 儲存、舊 DO 回讀及站名隔離一致。指定的 `R2 round 2` 已重跑通過。`HOMEWORK.md` 已訂正 `pc:` 名稱，但「沒帶版本只限初始卷」仍受阻擋 1 影響。[Wrangler 設定](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/wrangler.jsonc:5>)、[部署指南](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/DEPLOYMENT.md:100>)、[作業指南](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/HOMEWORK.md:158>)、[round 2 測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:2853>) |

## 新發現

### 阻擋（合併前必修）

| 項目與位置 | 證據與影響 | 修正方向 |
|---|---|---|
| **1. 升級前已開始訂正的卷，仍接受舊分頁加圖及送出。** [卷面版本](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/homework.ts:333>)、[上傳檢查](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3771>)、[送出檢查](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3861>) | 我用目前 `HEAD` 的舊後端實際送出、取得成績，再開始訂正。留下的卷是 `assigned`、`submissions=1`、已有一張訂正照，而且沒有 `version`。交給新版讀取後，舊分頁不帶版本加圖回 `200`，再送空 `{}` 也回 `200`。新版把混入舊照片的兩張卷送去評分，送出次數由 1 變 2。這會影響更新時正在訂正的學生。 | 上傳、送出及卷面回傳共用同一套版本判斷。只有能從送出與批改紀錄確認是首次作答的卷，才接受省略版本；為已有歷史的舊卷建立可區別的版本，讓重新整理後的學生仍可繼續。 |
| **2. 批改失敗後，重送原請求會重複扣次數。** [失敗寫回](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3671>)、[送出及計次](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3858>) | 模擬 R2 暫時讀圖失敗。第一次送出後是 `error / version=0 / round=1`。原 `{version:0}` 再送仍被接受。實測同一個請求得到的輪次依序為 **1、2、3**，第四次回 `429`。另一次測試中，讀圖恢復後，舊請求直接完成第二次批改。網路重送或舊分頁就能用掉學生的訂正機會。 | 前端送出同時帶所見 `round`，後端在增加次數前嚴格核對；或在每次成功入列時原子地遞增送出版本。學生重讀錯誤畫面後可以主動重試，上一輪的請求不能再扣次。 |
| **3. 學生已選第二頁，第一頁仍可單獨送去批改。** [選檔與送出按鈕](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:565>)、[壓縮與上傳](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:609>)、[送出動作](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/homework.ts:868>) | 這是原有介面競態，本輪的版本檢查仍擋不住。我用學生端實際事件處理函式，讓已有第一頁的學生選取第二頁，暫停在影像壓縮，再按畫面上仍啟用的「送出批改」。送出回 `200`，第二頁隨後上傳回 `409`，最後是 **已批改、只有一張照片、已扣一次**。同一分頁即可發生。 | 從選檔事件開始到整批照片傳完，記錄該卷仍有上傳中的檔案，停用送出，並在送出處理函式再檢查一次。若其中一張失敗，先顯示實際已存張數，讓學生確認後再送。 |

### 已知限制／另案處理

| 分級與位置 | 證據與影響 | 修正方向 |
|---|---|---|
| **應修｜`pc:` 每次從前 1,000 筆開始。** [批次清理](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:3415>) | 作者交接表寫「要持續刪除失敗 1,000 張以上才會發生」，條件過窄。實測前 1,000 筆全都只是未滿一小時，沒有任何刪除失敗，第 1,001 筆已過期的 DO 殘圖仍未被檢查。偶發時只是延後一輪；若前段持續有新待辦或失敗項目，後段可長期累積。本輪未因此觀察到已繳作業缺圖。 | 保存最後掃過的 key，以 `startAfter` 續掃，到尾端再繞回。舊 `photo-check` 的整包搬移也宜分批保存進度。 |
| **建議｜將升級、失敗重送與上傳中的送出納入固定測試。** [現有版本測試](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3350>)、[學生端 C-16](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/homework.spec.ts:252>) | 現有版本測試從新版建立作業；C-16 在請求抵達後端前中斷。兩者都能通過，同時漏掉舊資料、已存好但回應遺失，以及第二頁仍在處理的情境。 | 固定保留上述重現，除了 HTTP 狀態，也斷言最終照片 ID、張數、作業狀態與送出次數。 |

本輪全程唯讀，**17 個既有後端案例全部通過**，另以記憶體中的 R2、儲存層及前端事件處理函式做了 **9 個針對性驗證**。本輪未重跑完整 `npm run check`、真實瀏覽器 E2E 或正式 Cloudflare R2。依老師的停止條件，只有上述三個會改錯學生作業、成績或送出次數的問題阻止合併。
