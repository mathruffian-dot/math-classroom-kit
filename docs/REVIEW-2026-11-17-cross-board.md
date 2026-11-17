# 審核紀錄 2026-11-17：十字交乘・大板操作（第一階段）

基準：`main` @ 1ab8bc8。未 commit、未 push、未部署。

## 檔案

新增
- `shared/cross.ts`：出題（可重現的種子）、卡片／干擾卡、判定 `crossJudge`、顯示用 LaTeX／文字。純 TS，沒有 DOM，Worker 與瀏覽器都能 import。
- `src/cross-board.ts`：大板畫面（`renderCrossBoard`）與遊戲活動頁卡片（`crossGameCardHtml`）。
- `src/cross.css`：大板樣式（只用 `.cx-*`、`#app.cross-app`、`.games-grid`，不改既有選擇器）。
- `tests/cross.test.mjs`：單元測試（esbuild 打包 `shared/cross.ts`，和其他測試同一個寫法）。
- `scripts/quiz-src/cross-export.mjs`、`scripts/quiz-src/cross-check.py`：匯出抽樣＋SymPy 驗算。
- `tests/e2e/cross-board.spec.ts`：e2e。
- `docs/CROSS.md`：規則與使用說明。

修改
- `src/main.ts`：import；`NAV` 加「遊戲」（`#/games`）；`renderGames()`；`renderRoute` 在 `loadDashboard` 前處理 `/games/cross`（純前端，不讀課程資料），之後處理 `/games`。其他路由不變。
- `docs/AUTHORING.md`：最後加一節指向 `docs/CROSS.md`。
- `CHANGELOG.md`：2026-11-17 條目（舊條目沒動）。

沒有動到：資料契約（`shared/types.ts`、`worker/validation.ts`）、Worker、測驗／PK／魔王戰／格鬥／課程的程式與 CSS、`hideKeys`。

## 設計決定

1. **符號規則**：左欄（x 係數）一律是正數，x 係數卡只有正數；正負號全部放在常數；整個式子的負號由 k 提出（−x²+x+6 = −(x−3)(x+2)）。所以 (−2x+1)(−3x−2) 這種寫法不會出現，判定也把左欄非正數判為 `reason: 'sign'`（卡片上不會出現，但判定本身仍處理）。
2. **判定接受所有成立的填法**：p·r = a'、q·s = c'、p·s + r·q = b'（p、r > 0）。內部三項式本原（gcd = 1），由高斯引理，成立的填法只有標準答案與上下兩列對調；單元測試與 SymPy 腳本都列舉了每題所有卡片擺法確認。
3. **L1 左欄固定 x、x**：x² 係數是 1 時不放 x 係數卡（6 張常數卡），避免兩張一樣的「x」卡；L3 括號裡 x² 係數是 1 時也一樣。
4. **卡片分兩種**：x 係數卡（紫框、斜體 2x）只能放左欄，常數卡（藍框、帶號 +3）只能放右欄。卡片上的文字和放進格子後一樣，搬動時不改內容。
5. **不出的題**：b = 0、c = 0、完全平方、q = s（卡片會重複，正負號陷阱需要兩張同數字）。L1 在範圍內只有 200 種題目。
6. **L3 提公因數是一個步驟**：一開始十字圖鎖住，按「提出公因數」顯示 `原式 = k(…)`；提示第一層只問「三個係數的最大公因數」，不直接說 k。公布答案時一併顯示這一步。
7. **不跳動、不重畫**：換題時才重畫題目、卡片匣、四格內容；放卡片只把該卡片節點搬到格子或它在卡片匣的「家」，再更新讀數文字與 class。卡片匣每張卡有固定大小的家（拿走留虛線框），格子大小固定，所以沒有版面位移。拖曳用 Pointer Events＋`setPointerCapture`，跟著手指的是 `position: fixed` 的複製卡（`pointer-events: none`），卡片與格子 `touch-action: none`。
8. **計分**：一題第一次答對才加分；清空重做不再加分；公布答案不加分、連對歸零。自動升級在「下一題」時判斷（連對 3 題）。
9. **網址**：換等級／下一題用 `history.replaceState` 更新 `?level=&seed=`，不觸發 `hashchange` 整頁重畫；重新整理會回到同一個場次種子的第一題。
10. **第二階段**：`crossItem(seed, level)`、`crossSeed(base, level, index)`、`crossSequence`、`crossJudge` 都是純函式，伺服器可以發題、判題，給每位學生不同的種子。

## 測試指令與結果

| 指令 | 結果 |
|---|---|
| `node --test tests/cross.test.mjs` | 13/13 通過（每級 3000 個 seed；每級 1500 題列舉所有卡片擺法） |
| `C:\AI\H3\venv\Scripts\python.exe -B -X utf8 scripts/quiz-src/cross-check.py` | `SymPy cross check: L1 200・L2 300・L3 300・total 800`；`distinct items: 800`；`all factorizations verified (expand + factor_list + card arrangements)` |
| `npm run typecheck` | 通過（23 份課程 0 錯誤；tsc 沒有錯誤） |
| `node --test tests/*.test.mjs` | 142 個測試，141 通過、1 失敗：已知的 C-3（`backend.test.mjs`，g8-2-3c／g9-2-1c 的 raidTopics），和這次無關，沒有動。unit-quiz 的 odd-records 這次通過。 |
| `PW_CHANNEL=msedge MCK_PORT=8797 npx playwright test tests/e2e/cross-board.spec.ts` | 3/3 通過 |
| `PW_CHANNEL=msedge MCK_PORT=8797 npx playwright test tests/e2e/ipad.spec.ts` | 1/1 通過（無回歸） |
| `npx vite build` | 通過 |

e2e 內容：
- 桌機 1440×900：側欄「遊戲」→ 卡片 → 打開大板；固定 seed 的題目和 `shared/cross.ts` 一致；滑鼠拖曳放卡，乘積即時出現；答對變綠、出現因式分解、答對 1 題；清空後放正負號相反的兩張，回饋文字逐字比對「✗ 交叉相乘和 = …，目標 …，差 …」；拖回卡片匣；提示（L1 亮 2 張常數卡；L2 先亮 2 張 x 係數卡、再亮共 4 張）；公布答案不加分；下一題換題；切換 L2；x 係數卡拖到右欄會被擋下並提醒；L3 鎖住→提示問最大公因數→提出公因數→拖曳答對，答案含 k；L3 負首項公布答案顯示提公因數那一步。
- 每次放卡都檢查 `scrollY`、`documentElement.scrollTop`、`#cx-main.scrollTop` 不變，並在 `#cx-tray`、`#cx-cross`、`#cx-question` 上做標記確認沒有被重畫。
- 自動升級：L1 連對 3 題後下一題變 L2。
- iPad 直向 820×1180、橫向 1180×820（`hasTouch`）：一個畫面放得下（沒有整頁捲動、板子內部也不用捲）、卡片／格子／按鈕至少 44px；前兩張用 CDP 觸控事件拖曳，其餘用「點卡片 → 點格子」（`tap()`）；點已放的卡片再點卡片匣收回。

## 截圖（`artifacts/cross-2026-11-17/`，`CROSS_SHOTS=1` 跑 e2e 產生）

- `L1-empty.png`：L1 空白板
- `L1-correct.png`：L1 答對（綠色＋因式分解）
- `L2-wrong-difference.png`：L2 兩欄乘積都對、交叉和錯，顯示差多少
- `L3-common-factor.png`：L3 提出公因數 k 後答對
- `L3-negative-reveal.png`：L3 負的首項，公布答案
- `ipad-portrait-L2-correct.png`、`ipad-landscape-L2-correct.png`：iPad 直向／橫向

注意：照任務要求跑 `tests/e2e/ipad.spec.ts` 回歸時，那支既有測試會照它原本的設計把 12 張 `ipad-*-{numeric,slide,canvas}.png` 寫進 `artifacts/screenshots/`（重新產生、內容是同一個畫面）。這個資料夾被 gitignore，舊圖無法還原。這次新增的截圖都只寫在 `artifacts/cross-2026-11-17/`。

## 已知限制

- 只有老師畫面的單機版；全班連線對戰版是第二階段。
- 沒有從課堂畫面（上課中的老師工具列）直接開的入口，只能從側欄「遊戲」或網址開；上課中可另開分頁。
- 計分、連對只存在這個分頁的記憶體裡，重新整理就歸零，不寫進課堂紀錄。
- L1 在數字範圍內只有 200 種題目；L2、L3 的 x² 係數拆法 p ≤ 6（|a| ≤ 12）。
- 觸控拖曳在 Chromium（Edge）用 CDP 觸控事件與 `tap()` 測過；實機 iPad Safari 沒有測（Pointer Events 與 `touch-action: none` 是 Safari 13+ 支援的標準寫法）。
- 卡片是兩種固定的類型（x 係數卡／常數卡），所以不考「把常數放到左欄」這類錯誤。

## Codex review 1 fixes（2026-11-17）

審查：Codex 第一輪（REJECT，2 BLOCKERS、3 SHOULD-FIX、2 NITS）。全部修正，仍未 commit、未 push、未部署。

| # | 問題 | 修正 | 測試 |
|---|---|---|---|
| B1 | judge 在左欄固定時把左欄一律當 1，明確填 2、3 也判對 | `crossJudge`：左欄固定時只有省略／`null` 才補 1，明確填非 1 照實計算（判 `lead`）。另外對任何輸入都嚴格：非安全整數 → `invalid`；`item` 帶 `cards` 時數字必須是該欄的卡、同一張卡不能用兩次 → `card`。`fill` 不是物件也不會丟例外 | `tests/cross.test.mjs`「judge is strict」：x²+5x−14 填 lead0=2、lead1=3、7、−2 → `ok:false`；7.5／NaN／Infinity／'7'／true／{}／[7]／2⁶⁰ → `invalid`；不是卡片、常數卡數字放左欄、同一張卡用兩次 → `card` |
| B2 | 拖曳中換題，舊指標可能操作新題同 id 的卡；第二指會搶走拖曳；失去擷取時殘影留著 | `src/cross-board.ts`：`endDrag` 會放掉指標擷取；`newItem`（下一題、換等級）、清空、公布答案、提示、提出公因數都先 `cancelDrag()`；拖曳中其他 pointerdown 一律不理；`pointercancel`、`lostpointercapture` 都取消拖曳（卡片本來就沒動，留在原位、拿掉複製卡）；卡片 id 加題目序號（`q<序號>-c<i>`）；`pointerup` 時卡片已不在板子上就不動作；`place`／`toTray`／`tapCard` 找不到卡就不做事 | e2e「drag in progress is cancelled…」（下一題、換等級、清空、公布答案；舊 id 不存在、放開不會放卡、無殘影）、「pointercancel and lostpointercapture…」、「a second pointer is ignored…」 |
| S1 | 「iPad」測試其實是 Chromium 觸控模擬，WebKit 會在 CDP 失敗 | 測試名稱標明 `Chromium touch emulation`；`PW_BROWSER=webkit` 時不用 CDP，觸控拖曳改走 `tap()` 點選路徑，名稱變成 `WebKit, tap path`。新增未登入打開 `#/games/cross`、`#/games` 回到登入頁的測試 | 本機已有 webkit-2370（沒有另外安裝），`PW_BROWSER=webkit` 跑整支 spec 9/9 通過 |
| S2 | 選取、提示只靠視覺 | 卡片同步 `aria-pressed`；提示文字直接讀出數字（「2x 和 3x」「−1 和 +2」；第 3 次列出四張）；格子裡的卡按 Delete／Backspace 放回卡片匣（`aria-keyshortcuts`，焦點留在卡上），卡片讀屏名稱說出所在格子 | e2e「keyboard: …」；桌機測試檢查 L1、L2 提示文字含數字；`tapPlace` 檢查 `aria-pressed` |
| S3 | 題池沒用完就會重複（L1 第 187 題） | `shared/cross.ts` 新增 `crossPool`、`CROSS_POOL_SIZE`（L1 200＝全部、L2/L3 150）；板子每個等級從題池依序抽、用完才提示「都出過了，重新洗牌」並換種子開新一輪；`&pool=N` 可縮小題池 | 單元測試：列舉 L1 全部 200 題＝題池、三個種子各 200 題不重複、小題池是大題池的前綴；e2e「no repeats until the pool is exhausted…」（`pool=4`：前 4 題＝`crossPool` 且不重複、第 5 題出現提示、`data-round=1`、不等於上一題） |
| N1 | 文件寫 |b| ≤ 30，L3 實際限制在 b′ | 改成限制原式：L3 的 inner 用 `⌊30/|k|⌋`（a、c 原本就這樣）；備用題也檢查範圍。文件寫清楚原式與括號內的限制 | 單元測試每級 3000 題斷言 \|b\| ≤ 30 |
| N2 | `indexOf`／`splice(-1)` 假通過 | 先斷言索引 ≥ 0 再刪 | — |

L3 題目因為 |b| 限制改變而不同（同 seed 的 L1、L2 題目不變；各等級題池第一題仍是 `crossItem(crossSeed(base, level, 0))`）。

### 重新驗證

| 指令 | 結果 |
|---|---|
| `node --test tests/cross.test.mjs` | 15/15 通過 |
| `C:\AI\H3\venv\Scripts\python.exe -B -X utf8 scripts/quiz-src/cross-check.py` | `L1 200・L2 300・L3 300・total 800`；`distinct items: 800`；`all factorizations verified` |
| `npm run typecheck` | 通過（23 份課程 0 錯誤；tsc 無錯誤） |
| `node --test tests/*.test.mjs` | 144 個，142 通過、2 失敗：已知的 C-3（g8-2-3c／g9-2-1c raidTopics）與已知會時好時壞的 unit-quiz odd-records（單獨重跑 3 次 1 過 2 不過，和十字交乘無關）；都沒動 |
| `PW_CHANNEL=msedge MCK_PORT=8797 npx playwright test tests/e2e/cross-board.spec.ts` | 9/9 通過 |
| `PW_BROWSER=webkit MCK_PORT=8797 npx playwright test tests/e2e/cross-board.spec.ts` | 9/9 通過 |
| `npx vite build` | 通過 |

這次沒有跑 `ipad.spec.ts`、`duel.spec.ts`，也沒有寫 `artifacts/screenshots/`。截圖用 `CROSS_SHOTS=1` 重新產生在 `artifacts/cross-2026-11-17/`（同樣 7 張）。

### 仍然的限制

- WebKit 路徑是 Playwright 的 WebKit，不是實機 iPad Safari；WebKit 下觸控「拖曳」用點選代替（Playwright 在 WebKit 沒有觸控移動的 API）。
- 多指、pointercancel 測試用合成的 PointerEvent（第二根手指、系統取消）；拖曳中按老師按鈕用 DOM click 模擬另一隻手。
- 學生帳號打開 `#/games/cross` 會被既有路由導到學生畫面（`loadStudent`）；Codex 複審後已補 e2e（見下方）。

## Codex re-review fixes（2026-11-17）

Codex 第二次審查結論 APPROVE WITH FIXES，三項都已處理：

- **[P2] 換題遺失 `pool`**：`src/cross-board.ts` 的 `syncUrl()` 會保留有效的 `?pool=N`（N ≥ 1；無效值不寫回網址）。新增 e2e「?pool=N survives 下一題 and level change…」：換題、換等級後網址仍帶 pool，重新整理後第一題是 `crossPool(seed, 1, N)[0]`，出完 N 題出現新一輪提示；`pool=abc` 換題後網址不帶 pool。
- **[P2] 學生帳號路由隔離**：新增 e2e，用獨立的學生 context（座號 28，示範班設成不用登入碼）直接開 `#/games`、`#/games/cross`，畫面仍是學生端（等候室或課堂頁），沒有 `cross-board`、`game-cross`、`cx-tray`，也沒有登入頁。
- **[Nit] 判題原因文件**：`docs/CROSS.md` 註明左欄固定時明確填非 1 的數：沒帶 `cards` → `reason: 'lead'`；帶 `cards` → `'card'` 優先。

驗證：`node --test tests/cross.test.mjs` 15/15；`npm run typecheck` 通過；`PW_CHANNEL=msedge MCK_PORT=8797 npx playwright test tests/e2e/cross-board.spec.ts` 11/11 通過。未執行其他會寫入 artifacts/screenshots 的 spec；未 commit／push／deploy。
