# 部署（Cloudflare）

數感課堂預設只用 Cloudflare：Worker 提供網站與 API，Durable Object 保存所有資料。不需要 Supabase。

## 步驟

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
| 學生作答照片／畫布圖 | Durable Object，每張一筆 | 否（太大） |
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

## 選用：Supabase 模式

舊版的 Supabase 模式（`APP_MODE=supabase`）仍然保留，設定方式見 [SUPABASE-AGENT-SETUP.md](SUPABASE-AGENT-SETUP.md)。

在這個模式下：

- 作答照片與 AI key 仍然存在 Durable Object。
- 教師改用 Supabase Auth 登入。

## 安全

- 不要把 `.dev.vars`、識別碼檔、作答匯出檔、課本截圖提交到 git。
- 正式網站不要設定 `ALLOW_PUBLIC_DEMO=true`。
