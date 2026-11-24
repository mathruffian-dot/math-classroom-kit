# Codex 審核：照片改存 R2（2026-11-24）

審核者：Codex CLI（gpt-6.2-astra，model_reasoning_effort=high，read-only）。任務：`docs/codex-review-r2-photos-task.txt`。

**需修正後再審。** 新照片寫 R2、舊照片回讀 Durable Object 的正常流程通過，但故障注入確認會留下無法清除的學生照片，也會讓訂正上傳回報失敗後遺失原批改結果。

## 阻擋

1. **照片從清單移除後，刪除失敗就失去追蹤。** `worker/app.ts:3543` 的訂正流程忽略舊照片刪除錯誤。實測讓 R2 `delete` 失敗，訂正仍回 `200`，再刪除整份作業後，舊照片仍在 bucket。單張刪除與到期清除也都先寫入新清單才刪物件，失敗後重試已找不到原 key。反方向也有同樣問題：課堂照片寫 R2 成功、索引提交失敗時，實測留下 1 個物件、0 筆索引。應在 DO 持久保存待確認上傳與待刪 key，清理成功才移除，讓重試、刪作業與刪班級都能收尾。位置另見 `worker/app.ts:1441`、`worker/app.ts:2155`、`worker/app.ts:2163`、`worker/app.ts:3552`。

2. **訂正上傳的作業內容與主檔摘要可能永久不同步。** `worker/app.ts:3532` 先寫 `hw:<id>` 再寫主檔，主檔失敗時靠第二次寫回舊內容來復原。實測讓主檔寫入及復原寫入接連失敗，API 回 `503`，作業內容已是 `assigned`、原批改結果已消失，教師清單卻仍是 `graded`。這違反 `docs/HOMEWORK.md:157` 對學生重試的承諾。應將正式模式的兩筆 DO 資料放進同一交易，或以可恢復的提交紀錄明定哪一版有效。複審要同時核對學生頁、教師摘要與原批改結果。

3. **AI 批改讀圖缺少照片歸屬檢查。** `worker/app.ts:2948` 還原作答時會保留通過格式驗證的 `imageId`，`worker/app.ts:3108` 批改時直接依該 ID 讀照片，接著把影像加入 AI 請求。這條路徑只驗證教師有權批改目前課堂，沒有驗證照片也屬於該課堂及作答學生。若還原資料含有另一有效照片 ID，可能把別份作答的照片送交 AI。應在取圖前比對 `state.images` 的 `sessionId`、`ownerId` 與作答紀錄，還原時也應移除無法驗證的照片關聯。這是既有授權缺口，本次改用 R2 的呼叫點仍受影響。

## 應修

1. **大量刪除可能每次都停在同一批照片。** `worker/app.ts:1410`、`worker/app.ts:1619`、`worker/app.ts:1719` 對每張照片各發一次 R2 刪除，整批完成才提交課堂照片索引。若一班累積的照片超過單次執行的內部子請求額度，重試會從第一張重新發出刪除，已刪的 key 也耗用請求。應改用 R2 多鍵刪除，並逐批保存進度。Cloudflare 的 Free 方案每次執行最多 1,000 個內部服務子請求，R2 一次可刪最多 1,000 個 key。[Workers 限制](https://developers.cloudflare.com/workers/platform/limits/) · [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)

2. **設定頁的張數、照片容量與 DO 合計都會算錯。** `worker/app.ts:1395`、`src/main.ts:293`。實測只有 1 張 R2 回家作業照片時，API 回報 `photos=0`、`photoBytes=0`、`homeworkPhotoBytes=216`，畫面會同時顯示「0 張」與非零的作業照片容量。R2 存的是二進位，乘 `4/3` 又高估其容量；啟用 R2 後把所有照片從 DO 合計剔除，則低估舊照片占用。應逐張記錄儲存位置，舊資料依原存放方式相容處理，再分別加總課堂與作業的張數、R2 原始位元組、DO 估算位元組。

3. **部署文件把「缺 bucket」誤寫為必定部署失敗。** `docs/DEPLOYMENT.md:88`、`package.json:14`、`wrangler.jsonc:35`。專案鎖定的 Wrangler 4.150.0 預設開啟自動配置；本機 CLI 原始碼顯示，指定名稱但查無 bucket 時，具備權限即可進入同名建立流程。現有指令也沒有明確選擇教學帳號與 `teaching-cloud` profile。應把帳號、profile、bucket 名稱與私有狀態的核對放到部署步驟，區分「有權自動建立」和「R2 未啟用或權限不足」。`README.md:59`、`docs/DEPLOYMENT.md:44`、`wrangler.jsonc:27` 仍稱照片全在 DO，也應一併更新。[Cloudflare 自動配置說明](https://developers.cloudflare.com/changelog/post/2025-10-24-automatic-resource-provisioning/)

4. **共用 iPad 可能直接重用上一位使用者的課堂照片快取。** `worker/app.ts:1498` 對登入授權後的照片回 `private, max-age=3600`，`worker/index.ts:458` 又將 `/api/images/` 排除在全域 `no-store` 之外。`private` 允許瀏覽器自身快取，同一瀏覽器切換帳號後，同一 URL 在一小時內可能不再經過 Worker 授權。建議該端點回 `Cache-Control: no-store`，並以同一瀏覽器登出、換帳號驗證。現有不同學生的後端 `403` 測試只涵蓋請求真的到達 Worker 的情形。

5. **回家作業批改會略過遺失的照片。** `worker/app.ts:3407` 只收集讀得到的圖片，`worker/app.ts:3410` 只要求至少一張。若三張作答紙少了中間一張，仍可能以不完整作答計分，後面照片的紅筆索引也會錯位。應要求清單中的每張都成功取回，缺任一張就保留原清單、回報可重試的讀圖錯誤。

## 建議

1. **把失敗後的最終狀態納入 R2 回歸測試。** `tests/backend.test.mjs:2749` 的新增案例涵蓋課堂照片正常寫讀、舊 DO 照片、刪課與無綁定模式；`tests/backend.test.mjs:2216` 注入的是 DO 寫入失敗，`tests/e2e/homework.spec.ts:262` 攔截的是瀏覽器請求。建議補上 R2 `put/get/delete` 個別失敗、同一 key 兩邊皆有、提交與復原連續失敗、混合儲存用量。每個案例都核對 HTTP 結果、作業清單、批改結果及兩邊實際剩餘物件。

2. **區分圖片格式錯誤與儲存服務失敗。** `worker/photos.ts:66`、`worker/photos.ts:75`、`worker/photos.ts:120`。目前格式檢查可能接受無法由 `atob` 解碼的字串，解碼例外最後會呈現為 `503`。應在共用解析函式把解碼失敗轉成 `400`，並保留真正 R2 寫入失敗的 `503`，讓學生知道該重新選圖或稍後重試。

## 已確認沒問題的項目

- **新舊照片的正常讀寫順序正確。** `worker/photos.ts:35`、`worker/photos.ts:42`、`worker/photos.ts:55`。有 `PHOTOS` 時新圖只寫 R2，保留 MIME；R2 回傳物件不存在才讀舊 DO。正常刪除依序處理兩邊。課堂照片沒有 R2 時仍寫 DO。實測作業訂正遇到 R2 `put` 失敗會回 `503`，此時舊照片與原批改結果都保留。
- **未發現漏改的正式 `blob:`／`hwphoto:` 直接存取。** 兩種舊 key 的實際讀寫已集中於 `worker/photos.ts:36`、`worker/photos.ts:43`。課堂匯出處理作答紀錄，備份在 `worker/app.ts:2746` 明列排除照片及回家作業；還原不會回填照片位元組。清除、刪課、刪班均有經過照片儲存介面。
- **物件命名與學生讀圖端點有適當邊界。** 課堂圖使用伺服器 UUID；作業圖以作業 UUID、作業卷座號、照片 UUID 組成。課堂讀圖先比對上傳者，作業讀圖先驗作業卷 token，再從該卷清單找照片。未見前端可提供任意 R2 key 的讀取入口。位置見 `worker/app.ts:1490`、`worker/app.ts:3288`、`worker/app.ts:3502`、`worker/app.ts:3631`。
- **Wrangler 綁定本身沒有公開照片。** `wrangler.jsonc:17`、`wrangler.jsonc:35` 在本機與 production 都宣告 `PHOTOS`，本機未開 `remote`。正式 bucket 的 `r2.dev` 與自訂網域是獨立設定，本次未連正式帳號驗證其狀態。[Wrangler R2 綁定](https://developers.cloudflare.com/workers/wrangler/configuration/) · [R2 公開存取設定](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- **本次驗證範圍。** 全程唯讀，以記憶體建置執行了檔尾 R2 測試及上述故障注入。交接檔所列 `npm run check` 199/199 與 e2e 9/9 是原作者紀錄，本次沒有重跑完整套件、操作正式 R2 或修改檔案。
