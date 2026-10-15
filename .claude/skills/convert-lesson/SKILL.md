---
name: convert-lesson
description: 把國中數學課本單元（例題、隨堂）轉成數感課堂課程 JSON：盤點來源、截取課本重點圖、依認知科學流程排頁、每頁設計 IRS（隨堂改成 1–3 題換數字的數值題）、錯誤分析附評量規準，並驗證。使用者說「把 X-X 做成課程」「教材轉課程」「新增數感課堂教材」「修改課程某頁」時使用。
---

# 教材轉課程（數感課堂）

在 `math-classroom-kit/` 裡工作。完整格式見 `docs/AUTHORING.md`，規則見 `AGENTS.md`。

## 步驟

1. **找來源。** 課本學用 PDF 在專案根目錄的 `<年級>/115上_國中_數學_教材資源_課本_學用PDF_*`，答案在備課用書（教用版紅字）。
   - 來源 PDF 唯讀，不得修改。
   - 文字抽取常是亂碼，請直接看頁面圖片；已轉好的頁面圖在 `<年級>/115上_視覺化互動教學/textbook-pages/<節>/`。

2. **盤點。** 逐一列出每個例題、隨堂練習、重點框：PDF 頁、課本頁、題目原式、官方答案，寫進 `content/sources/<課程id>-inventory.json`。
   - 以 `g8-2-2-inventory.json` 為範例。

3. **截圖。** 每個例題、隨堂只截最重要的區塊（題目框加附圖，不截解答），用 pymupdf 以 2.5 倍渲染，存到 `public/lesson-assets/<課程資料夾>/`。
   - 每張截圖都要親自看過確認。
   - 截圖不進 git。
   - 截圖座標與腳本放在 `scripts/textbook-crops/`。

4. **寫產生器。** 寫 `scripts/lessons-src/<id>.mjs`，視覺化盡量重用 `viz.mjs`，新的樣板也加到 `viz.mjs`。
   - **一節課約 12–14 頁**，依認知科學流程排：提取 → 預測 → 具體操作 → 圖式連結 → 工作範例 → 隨堂 → 錯誤分析 → 出場券／自評。
   - **例題頁**：放例題截圖＋可操作圖。IRS 是例題本身（學生先試，再看逐步講解）；逐步講解可用 `stepsViz`，目前步驟會發光。
   - **隨堂頁**：放隨堂截圖。IRS 用 `numeric` 加 `items`：課本原題放前面，不足 3 題時補換數字題（答案要自己算過）。根式題加上 `form: 'simplest-radical'`。
   - **錯誤分析頁**：用 `canvas` 題，附評量規準（2–3 個向度，含 0 分與滿分等級，附參考解答）。
   - **數學式**：用 `$LaTeX$`（產生器裡用 ``String.raw`…` ``），或課本純文字寫法 `√3 × (−2√5)`、`4/(3√5)`，兩種都會排成課本樣式。

5. **驗證。** 依序執行：

   ```sh
   node scripts/lessons-src/<id>.mjs
   npm run lessons
   npm run check
   ```

   版面有改動時再執行 `PW_CHANNEL=msedge npm run test:e2e`，並在 `tests/e2e/classroom.spec.ts` 的課程清單加入新課程，讓它跑全螢幕檢查。

6. **交接。** 更新專案根目錄的 `handoff.md`。若新增了來源，同時更新 `CONTENT_INDEX.md`。回報頁數、提醒、未收錄的內容與未驗證項目。
