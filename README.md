# 數感課堂 Math Classroom Kit

**國中數學的觸控互動課堂。** 教師大屏授課、學生 iPad／手機作答，一個畫面就能完成所有操作。

- **可操作的數學圖**：拖拉滑桿、拖曳點、點擊切換，步驟揭示時目前步驟會發光、其他部分反暗。
- **每頁一題 IRS**：單選、多選、量尺、短答、數值（可一次出 3 題換數字題、檢查最簡根式）、操作題、手寫畫布。
- **手寫與拍照作答**：學生在畫布寫、或寫在紙上拍照，再用筆加註。
- **依評量規準 AI 批改**：
  - 第 1 層（預設開啟）：只判斷對錯。
  - 第 2 層：逐項給分並加紅筆批註。
  - 兩層都可平行批改、多次投票、轉寫手寫內容，信心不足的作答會提醒教師覆核。
- **數學排版**：根號、分數、指數以 KaTeX 排成課本樣式；學生輸入的答案也會即時顯示成數學式。
- **課本截圖**：例題與隨堂可附上課本截圖（只截重點），只提供給已登入的師生。

本專案從 [health-classroom-kit](https://github.com/mathruffian-dot/health-classroom-kit) 延伸而來，沿用它的安全設計：同網域 API、Durable Object 序列化、學生資料不外流。

## 五分鐘開始（本機）

需要 Node.js 22.12+。

```sh
npm ci
npm run dev
```

打開 http://127.0.0.1:8787：

| 角色 | 登入方式 |
| ---- | -------- |
| 教師 | 帳號 `teacher`，密碼 `11235813`（本機示範） |
| 學生 | 班級 `DEMO801`、座號 `1`–`40`、識別碼 `DEMO01`–`DEMO40` |

請用不同瀏覽器或無痕視窗分別扮演教師與學生。

## 正式部署（Cloudflare，免 Supabase）

1. 登入 Cloudflare：

   ```sh
   npx wrangler login
   ```

2. 設定教師帳號（填你的 Cloudflare 帳號信箱）：

   ```sh
   npx wrangler secret put TEACHER_ACCOUNT --env production
   ```

3. 部署：

   ```sh
   npm run deploy
   ```

4. 用「帳號＝你的 Cloudflare 信箱、密碼＝11235813」登入。**第一次登入後立刻修改密碼**（設定 → 教師密碼）。

5. 在「設定 → AI 批改」輸入 API key。預設為 OpenAI `gpt-6-luna`，也可改用 Gemini、Claude 或其他 OpenAI 相容 API。

**資料存放位置**：課堂資料、作答照片與 API key 都存在 Cloudflare Durable Object。詳見 [部署指南](docs/DEPLOYMENT.md)，含免費額度與費用估算。

## 教材怎麼做

**正式教材由 agent 在專案裡製作與修改：**

1. 依 [docs/AUTHORING.md](docs/AUTHORING.md) 在 `content/lessons/` 新增或修改 JSON。重複使用的視覺化可寫成產生器，例如 `scripts/lessons-src/g8-2-2.mjs`。
2. 執行 `npm run lessons` 驗證格式，並取得認知科學檢查提醒。
3. 啟動或部署後，教師登入就會在「我的課程」看到標示「專案教材」的課程。

網站上的「AI 快速草稿」只是實驗功能，產出的草稿存在網站上，不會回寫到專案。

目前內建的課程：

| 課程 | 頁數 | 檔案 |
| ---- | ---- | ---- |
| 八上 1-1 和的平方公式 | 10 | `content/lessons/g8-1-1-sum-square.json` |
| 八上 2-2 根式的運算（1）根式的乘除 | 12 | `content/lessons/g8-2-2a.json` |
| 八上 2-2 根式的運算（2）最簡根式與分母有理化 | 13 | `content/lessons/g8-2-2b.json` |
| 八上 2-2 根式的運算（3）根式的加減與混合運算 | 13 | `content/lessons/g8-2-2c.json` |
| 八上 2-2 根式的運算（4）乘法公式與根式 | 12 | `content/lessons/g8-2-2d.json` |

**課本截圖**：放在 `public/lesson-assets/`。截圖有著作權，所以**不進 git**，只放在專案資料夾，部署時會一起上傳。重製方式見 `scripts/textbook-crops/`。

## 開發與測試

```sh
npm run check
PW_CHANNEL=msedge npm run test:e2e
```

- `npm run check`：課程驗證、TypeScript 型別檢查、單元測試與建置。
- `npm run test:e2e`：用獨立的師生瀏覽器跑完整課堂流程，並檢查每份課程在投影機、iPad、手機上都不用捲動頁面。若已安裝 Edge，加上 `PW_CHANNEL=msedge` 就不必另外下載瀏覽器。

## 文件

- [教材格式與認知科學設計](docs/AUTHORING.md)
- [部署](docs/DEPLOYMENT.md)
- [架構](docs/ARCHITECTURE.md)
- [安全](docs/SECURITY.md)
- [驗收紀錄](docs/VALIDATION.md)
- [教師一頁指南](docs/TEACHER-QUICKSTART.md)
- [HTML 擴充](docs/HTML-BRIDGE.md)
- [給 agent 的規則](AGENTS.md)

## 授權

程式採 [MIT](LICENSE)。課本截圖與教材內容的著作權屬原出版社。請勿把含課本截圖或學生資料的版本放到公開的 GitHub repository 或公開網站。
