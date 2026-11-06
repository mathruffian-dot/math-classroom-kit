# 審查報告：回家作業「全班合併 PDF」下載（2026-11-06）

## 老師的需求

> 我們在產生作業時，多一個下載檔是把所有學生的作業做成一個檔案

## 給老師看

**原本**：按「產生 N 份作業並下載 zip」，zip 裡是每位同學一份 A4 PDF，加上 `00_解答總表（老師用）.pdf`。「作業」詳情頁可以重下 zip，或下載單一座號的 PDF。

**現在多了**：

| 位置 | 你會看到 | 拿到的檔案 |
|---|---|---|
| 派發視窗（產生前） | 按鈕上方多一行說明：zip 裡有每人一份 PDF、解答總表和全班合併檔 | — |
| zip 裡 | 多一個 `01_全班作業（合併）.pdf`（排在解答總表後面、個人卷前面） | 全部被選的同學依座號接成一個檔 |
| 派發視窗（產生後） | 視窗不再自動關閉，顯示「已派發 N 份作業」，有「**下載全班合併 PDF**」和「完成」兩個按鈕 | `班級_標題_日期_全班合併.pdf` |
| 「作業」詳情頁上方 | 「下載 zip」旁邊多一個「**下載全班合併 PDF**」 | `班級_標題_日期_全班合併.pdf` |

合併檔的樣子：

- 依座號排序，一位同學印完接下一位；每位同學從新的一頁開始。
- 每頁頁首照樣有標題、班級、座號、QR code；頁尾有「班級・座號」和「第 x / y 頁」（每位同學自己的頁數），印完好分。
- **不含解答**。解答還是只在 zip 的 `00_解答總表（老師用）.pdf`。

為什麼沒有「按一次自動下載兩個檔」：Chrome 等瀏覽器在同一個網頁連續自動下載第二個檔時，常會跳出「這個網站想下載多個檔案」要老師允許，沒按就會被擋，老師容易以為沒有。所以改成「zip 裡一份＋產生完的視窗上一顆按鈕」，兩條路都拿得到同一份檔。

## 技術摘要（給審核）

- `src/homework.ts`
  - `pagesToPdf` 拆成 `pdfDoc()`（一份 jsPDF，`add(jpeg)` 一次一頁）與 `renderPages(pages, docs)`（一頁 html2canvas 一次，同一張 JPEG 同時加進個人卷和合併卷）。合併卷不必重新截圖，派發時的截圖次數和原本一樣。
  - 畫布轉成 JPEG 後把 `canvas.width/height` 設 0，早點放掉畫布記憶體。合併卷是一個 jsPDF 一頁一頁 `addPage`，沒有先把全班頁面 DOM 一次排出來（每位同學的排版容器用完就移除）。
  - `eachSheet()`：依座號排序、每位同學排版＋截圖；`downloadZip()` 用它同時產生個人卷與合併卷，zip 加入 `01_全班作業（合併）.pdf`，回傳合併 blob；`downloadMergedPdf()` 只產合併卷（作業頁用）。
  - zip 內個人卷現在也依座號順序加入（原本照 API 回傳順序，檔名本來就有座號，所以解開後看不出差別）。
  - 新按鈕：`hw-merged-save`（派發完成視窗，`data-testid="hw-merged-save"`）、`hw-merged`（作業詳情頁，`data-testid="hw-merged"`）；詳情頁的 zip 按鈕加上 `data-testid="hw-zip"`。
  - ~~完成視窗只在派發視窗還開著時才換內容，老師中途關掉或開了別的視窗不會被蓋掉。~~ **這句原本不成立**（Codex 審查 SHOULD-FIX，見下方「修復」）：舊寫法用全域選擇器找 `hw-plan`，重開的派發視窗也會被找到；合併 PDF 也存在全域 `lastMerged`，晚完成的派發會改寫它。
- `src/styles.css`：`.hw-done`、`.hw-plan-note` 的間距。
- 沒有改 worker、批改、紅筆、vault、API 契約。
- `tests/e2e/homework.spec.ts`：zip 從 4 個檔變 5 個；檢查 `01_全班作業（合併）.pdf` 的頁數＝三位同學個人卷頁數的和（所以不含解答頁）；完成視窗按鈕下載的檔名與頁數；作業詳情頁「下載全班合併 PDF」的檔名與頁數。

## 修復：重疊派發（Codex 審查 25b202d 的 SHOULD-FIX，2026-11-06）

**老師會遇到的情況（修之前）**

1. 派給 1 號、還在產生時關掉視窗，重開一個選 2 號 → 1 號那批產生完，把你正在選的新視窗換成「已派發 1 份作業」。
2. 派給 1 號（很慢）→ 關掉、重開派給 2、3 號（先完成，畫面顯示「已派發 2 份」）→ 1 號那批隨後完成；畫面還是 2 份，但按「下載全班合併 PDF」下載到的是 1 號那批。可能印錯學生、甚至錯班。

**現在**：每次派發只認「按下產生時的那個派發視窗」。

- `src/homework.ts`
  - `openPlan()` 每開一次派發視窗就把 `planToken` 加一（切換範圍也算重開）。
  - `hw-create` 開始前記下 token 和按鈕所在的 `[data-testid="hw-plan"]` 元素；進度文字、完成畫面都要「token 沒變、而且那個元素還在畫面上」才更新，否則只下載 zip、跳 toast，不動畫面。
  - 拿掉全域 `lastMerged`。合併 PDF 存在 `WeakMap`，鍵是那個完成視窗的 `hw-done` 元素；「下載全班合併 PDF」從按鈕所在的 `hw-done` 找自己的檔，別批派發不可能改到它。
  - 副作用（刻意的）：產生途中在同一個視窗按「預設／全選／清除」會重畫派發內容，這時舊派發也不再換畫面（zip 照樣下載），避免把老師正在改的選擇蓋掉。
- `tests/e2e/homework.spec.ts` 新增兩個回歸測試（攔住 A 的 `POST /api/homework` 製造延遲）：
  - `SF-1: a late homework job never replaces a newly opened assign window`：A 完成後，新視窗仍是派發畫面、只勾 2 號、沒有 `hw-done`；A 的 zip 仍會下載。
  - `SF-1: the merged-PDF button of a finished window always downloads its own batch…`：B 先完成；A 隨後完成；B 視窗按兩次合併下載，位元組都等於 B zip 內的 `01_全班作業（合併）.pdf`，且與 A 的不同。
  - 測試裡建立的作業在 `afterEach` 一併刪除。

**證據**

| 指令 | 結果 |
|---|---|
| `npm run typecheck` | 通過 |
| 舊程式（`git show 25b202d:src/homework.ts`）＋新測試，`-g "SF-1" --workers=1` | **2 failed**（第一個：出現 `hw-done`，Expected 0 / Received 1；第二個：B 按鈕下載內容≠B）＝成功重現 |
| 修復後 `npx playwright test tests/e2e/homework.spec.ts --workers=1` | **9 passed** |

未做：Codex 的 NIT（亂序座號 10、2、1 的逐頁影像比對、URL 回收後下載、自動下載次數斷言）沒有加進測試；第二個新測試只補了「完成視窗下載的位元組＝zip 內合併檔」。

## 測試

| 指令 | 結果 |
|---|---|
| `npm run typecheck` | 通過 |
| `npx vite build` | 通過 |
| `npx playwright test tests/e2e/homework.spec.ts tests/e2e/homework-step.spec.ts --workers=1` | 22 passed |
| 同上，預設平行 workers | 第一次 6 failed（學生登入等不到「你已入座」、逾時），單獨重跑與 `--workers=1` 全過，判斷是本機平行負載，不是這次的改動 |
| `npm test` | 115 個 114 過；失敗的是 `C-3: new raid questions … map to a topic`（g8-2-3c、g9-2-1c 魔王戰題目沒有對應題型），來自 HEAD 的 raid 題庫 commit，與作業無關，這次沒有碰 |

## 未驗證／待老師決定

- 沒有在真的 35 人以上的班級量測記憶體與時間；測試只用 3 人。合併卷的 JPEG 和個人卷一樣大小，全班約多一份同樣大小的 PDF 放在記憶體裡。
- **雙面列印**：每位同學從新的一頁開始，但如果某位同學是奇數頁，雙面整本印時下一位會印在他最後一頁的背面。要不要在奇數頁的同學後面補一張空白頁（只在合併檔），請老師決定。
- 檔名日期沿用 zip 的 `toISOString()`（UTC），台灣早上 8 點前產生會是前一天的日期；原本 zip 就是這樣，這次沒改。
- 沒有在 Safari／iPad 實機試下載。
