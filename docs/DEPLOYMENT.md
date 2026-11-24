# 部署（Cloudflare）

數感課堂預設只用 Cloudflare：Worker 提供網站與 API，Durable Object 保存課程、班級、作答等資料，照片存在 R2（見〈照片存到 R2〉）。不需要 Supabase。

## 步驟

> 這台電腦的教學專案慣例用 `teaching-cloud` profile（和 `wrangler.jsonc` 固定的 `account_id` 是同一個帳號）。要用它時，在本資料夾執行一次 `npx wrangler auth activate teaching-cloud .`（把 profile 綁到這個資料夾；Wrangler 4.150 的 `whoami` 不接受 `--profile`），之後下面的指令照原樣執行就會用這個 profile；要改回預設登入用 `npx wrangler auth deactivate .`。

1. **登入 Cloudflare：**

   ```sh
   npx wrangler login
   ```

2. **設定教師帳號：** 輸入你的 Cloudflare 帳號信箱。

   ```sh
   npx wrangler secret put TEACHER_ACCOUNT --env production
   ```

3. **（選用）把 AI key 設成環境變數：** 也可以直接在網站的「設定」頁輸入，兩種擇一即可。

   ```sh
   npx wrangler secret put AI_API_KEY --env production
   ```

   用環境變數時，還要在 `wrangler.jsonc` 的 production vars 加上 `AI_MODEL`（例如 `gpt-6-luna`）與 `AI_BASE_URL`。

4. **部署：**

   ```sh
   npm run deploy
   ```

   這個指令會先驗證課程、建置網站，再用 `wrangler deploy --env production` 上傳。`public/lesson-assets/` 的課本截圖也會一起上傳，但只有登入的師生能透過 `/api/assets/…` 讀取。

5. **第一次登入：** 帳號是 `TEACHER_ACCOUNT`，密碼是 `11235813`。登入後會提示修改密碼，請立即修改。連續輸錯 10 次會鎖 15 分鐘。

6. **建立班級：** 下載個人識別碼，個別發給學生。

## 資料存放位置

| 資料 | 位置 | 是否在備份檔中 |
| --- | --- | --- |
| 課程、班級、課堂、作答、批改 | Durable Object（SQLite），以 64 KiB 分塊保存的快照 | 是 |
| 學生作答照片／畫布圖、回家作業照片 | R2 bucket `math-classroom-photos`，每張一個物件（2026-11-24 之前的照片在 Durable Object） | 否（太大） |
| 教師密碼雜湊、AI key | Durable Object 的 vault | 否 |
| 課本截圖 | 部署的靜態資產，需登入才能讀取 | 否 |

## 免費額度與費用

數字依 Cloudflare 官方文件，費率可能變動。

**Workers Free 方案**

- Durable Object 總儲存量 5 GB。
- 每天 100,000 次請求。
- 每天 100,000 列寫入、500 萬列讀取。
- 單一值最大 2 MB。

**實際用量估算**

- 作答照片在瀏覽器先壓縮到長邊 1600 px，約 200–400 KB。一班 30 人一題約 6–12 MB。
- 課堂同步採 WebSocket（Durable Object 可休眠連線）：
  - 每台裝置只在連上時算 1 次請求。之後伺服器有變化才推送，推送不計請求。
  - 心跳每 45 秒一次，由執行環境自動回覆，不會喚醒物件；收到的訊息以 20 則算 1 次請求計費。
  - 連線中斷時，裝置自動改用輪詢備援（2–10 秒），並以 1、2、4…最多 30 秒的間隔重連。
- 一班 31 台裝置、一堂 45 分鐘的課，請求數估計：
  - 連線約 31 次。
  - 心跳約 90 次。
  - 作答、翻頁、批改等操作約數百次。
  - 合計大約 1,000 次以內；免費方案一天可上數十堂課。
  - 若網路不穩、頻繁斷線改用輪詢，用量會增加。
- 額度在 UTC 00:00（台灣時間早上 8:00）重置。
- 改用 WebSocket 前用的是每 2 秒輪詢，一堂約需 1.7–4.2 萬次請求，免費方案一天只夠 2–3 堂。
- 每天上課建議改用 Workers Paid（每月 US$5，含 1,000 萬次請求）。

**AI 費用**另外由你的 AI 供應商計費。「設定」頁可以設每日呼叫上限。

- 第 1 層判對錯用的額度較少。
- 第 2 層紅筆批改用的額度較多。
- 每份作答投票 3 次時，費用是 3 倍。

## 照片存到 R2（2026-11-24 起）

課堂作答照片與回家作業照片存在 Cloudflare R2 的 `math-classroom-photos` bucket（綁定名稱 `PHOTOS`，見 `wrangler.jsonc`）。R2 免費額度每月 10 GB 儲存、100 萬次寫入、1000 萬次讀取，下載不收流量費，也不占 Durable Object 的空間。

第一次啟用：
1. 老師在 Cloudflare 後台（Storage & Databases → R2）啟用 R2。這一步要自己做，可能需要付款資料。
2. 登入 wrangler，再用 `npx wrangler whoami` 確認是數感課堂的帳號（`account_id` 已固定在 `wrangler.jsonc`）。兩種擇一，之後的建 bucket、設 secret、部署都用同一種：
   - 預設登入：`npx wrangler login`。
   - 教學共用 profile（這台電腦的 Codex 慣例）：`npx wrangler auth activate teaching-cloud .`（綁到本資料夾）。
3. 建立 bucket：`npx wrangler r2 bucket create math-classroom-photos`，然後 `npx wrangler r2 bucket list` 確認有這個名稱。
4. 確認 bucket 是私人的：後台 R2 → `math-classroom-photos` → Settings，不要開 Public Development URL（r2.dev），也不要接自訂網域。照片只經過 Worker 讀寫。
5. 部署：`npm run deploy`（已綁 profile 時也一樣，不用另外加參數）。
   - Wrangler 4 有「自動配置資源」：bucket 不存在、而且帳號有建立權限時，部署會自動建立同名 bucket（一樣是私人的）。
   - R2 還沒啟用、或權限不足時，部署會失敗並說明原因：回到第 1 步。

說明：
- 改用 R2 之前存在 Durable Object 的舊照片照樣讀得到、刪得掉，程式會先讀 R2，讀不到再讀 Durable Object；新照片一律存 R2。
- 本機 `npm run dev` 用模擬的 R2，存在 `.wrangler/state`（測試存在暫存資料夾），不連到雲端。
- 設定頁「儲存空間」把 Durable Object 裡的舊照片與 R2 的照片分開列，合計只算 Durable Object 的 5 GB。
- 沒有任何紀錄指到的照片（刪除失敗、上傳到一半中斷留下的），放超過 1 小時後由清理收掉：老師打開首頁或設定頁時一天跑一次，按「清除舊照片」時也會跑。清理只看這一套站（`APP_INSTANCE`）自己的資料夾。
- `wrangler.jsonc` 固定了 `account_id`（數感課堂的帳號）：不管用預設登入或 `teaching-cloud` profile，登入的帳號沒有這個 account 的權限時，部署、建 bucket 都會直接失敗，不會跑到別的帳號（`school` profile 是另一個帳號，不要用）。
- 每一套站（`APP_INSTANCE`）在 bucket 裡有自己的資料夾（站名經過 `encodeURIComponent`，不同站名不會撞在一起）。另一個 Worker 要共用這個 bucket 時，`APP_INSTANCE` 一定要不同；最穩的是每個部署用自己的 bucket。
- 清理記下「這次嘗試的時間」：失敗也是隔天才再試；清理失敗不影響首頁與設定頁。

## 選用：回家作業照片存到 Supabase Storage

> 2026-10-30 老師決定：**目前不用**；2026-11-24 起照片改存 R2，這一節只留作參考。啟用前要先修審核 C-7、C-8（見 `docs/REVIEW-2026-10-30-homework.md`）。

有 R2（`PHOTOS` 綁定）時一律用 R2，Supabase 設定不會生效。只有拿掉 R2 綁定、又設定了 `SUPABASE_URL`、`SUPABASE_SECRET_KEY` 兩個 secret 時，回家作業照片才會存到 Supabase Storage（私人 bucket），`APP_MODE` 不用改。步驟見 [HOMEWORK.md](HOMEWORK.md#supabase-storage參考目前不用)。

## 選用：Supabase 模式

舊版的 Supabase 模式（`APP_MODE=supabase`）仍然保留，設定方式見 [SUPABASE-AGENT-SETUP.md](SUPABASE-AGENT-SETUP.md)。

在這個模式下：

- 照片照樣存 R2；沒有 R2 時，課堂作答照片存 Durable Object，回家作業照片存 Durable Object（或設定了 Supabase Storage 時存 Supabase，見上一節）。AI key 仍然存在 Durable Object。
- 教師改用 Supabase Auth 登入。

## 安全

- 不要把 `.dev.vars`、識別碼檔、作答匯出檔、課本截圖提交到 git。
- 正式網站不要設定 `ALLOW_PUBLIC_DEMO=true`。
