# 審核紀錄：十字交乘難度改成「單元重點」（2026-11-18）

基準：main 8ccf588（大板 a160140＋全班連線對戰 8ccf588；正式站跑 8ccf588）。未 commit、未 push、未部署。

## 起因

老師回饋：遊戲難度要照單元的**重點**分，不是抽象的 L1／L2／L3，而且要能自己選。

## 改了哪些檔案

| 檔案 | 內容 |
|---|---|
| `shared/game-focus.ts`（新） | 可重用的重點設定：`GAME_FOCUS[遊戲 id] = [{ id, label, example?, exampleText?, note?, params }]`。十字交乘的四個重點、對應函式（`CROSS_LEVEL_FOCUS`、`crossLevelLabel`、`crossFocusFromParams`、`crossRunFocus`、`crossNextFocus`、`crossFocusLevel`、`isCrossFocus`、`crossItemFocus`） |
| `shared/cross.ts` | 只加兩個函式：`crossClassify`（產生器的分類規則）、`crossMixLevel`（混合的出題順序）；拿掉 `CROSS_LEVEL_NAME`（L 標籤）。出題、判定、卡片的邏輯沒動 |
| `shared/types.ts` | `CrossRun.focus?`（舊場次沒有） |
| `src/cross-board.ts`、`src/cross.css` | 遊戲卡片四個重點按鈕（名稱＋KaTeX 例子＋小字）、切換列、題目上的重點標籤、題池提示、自動前進開關（預設關、混合收起、先提公因式停用）、`?focus=` 與舊 `?level=`、混合出題 |
| `src/cross-live.ts`、`src/cross-live.css` | 開始設定的重點選擇（課堂控制區與遊戲頁共用 `crossFocusPickerHtml`）、狀態列文字、排行榜重點欄、學生「重點」欄與題目標籤、前進提示；勾選框尺寸修正 |
| `src/main.ts` | 送 `focus`／`escalate`、記住偏好（`xlFocus`、`xlEscalate`）、重點選項的 change 事件 |
| `worker/cross.ts` | 混合時每題由 `crossMixLevel(座號秘密種子, seat.m)` 決定等級；混合不前進；CSV 寫重點名稱；JSON 匯出加 `focus`／`focusLabel` |
| `worker/app.ts` | `cross-start` 嚴格驗證 `focus`／`escalate`，舊的 `level`＋`lock` 照舊對應 |
| `tests/cross-focus.test.mjs`（新） | 8 項單元測試 |
| `tests/e2e/cross-board.spec.ts`、`tests/e2e/cross-live.spec.ts` | 換新標籤、新增重點情境；截圖改成只在 `CROSS_SHOTS=1` 時寫到 `artifacts/cross-2026-11-18/` |
| `docs/CROSS.md`、`CHANGELOG.md` | 重點表、網址參數、怎麼替之後的遊戲加重點、計分與安全模型的對應 |

## 決定

1. **重點對應產生器等級**：a1 = 等級 1、a-not-1 = 等級 2、gcf = 等級 3、mix = 1、2、3。等級的分類規則寫成 `crossClassify`（k ≠ 1 → 3；x² 係數 1 → 1；其他 → 2），測試確認產生器出的每一題都分回自己的等級。
2. **例子不手寫**：`params.sample = {k,p,q,r,s}` 展開成 LaTeX；x²+5x−14 = (x+7)(x−2)、6x²+x−2 = (2x−1)(3x+2)、2x²+10x+12 = 2(x+2)(x+3)，測試逐項核對。
3. **預設不前進**：大板與對戰都是。前進順序 a1 → a-not-1 → gcf；先提公因式沒有下一個（開關停用）；混合不適用（大板收起、對戰停用，伺服器也強制 `lock`）。
4. **混合的順序**：每 3 題一組是 1、2、3 的排列（由種子決定），保證三種都出現且可重現。大板用場次種子、三個題池各自「用完才重來」；對戰用每位同學的秘密種子，另記 `seat.m`（`seat.n` 會因避開重複多跳號，不適合當計數）。學生看不到種子，排列也不洩漏答案。
5. **相容**：舊網址 `?level=` 照開；`focus` 和 `level` 都有時 focus 優先；舊畫面送的 `level`＋`lock` 照舊語意（沒鎖就前進）；8ccf588 存的場次沒有 `focus` → `crossRunFocus` 照 `level` 讀，不需要資料轉換。
6. **內部仍用數字等級**（計分、題目 key `L2:…`、`data-level` 屬性），畫面與匯出文字一律是重點名稱；JSON 匯出保留數字 `level` 並加 `focus`／`focusLabel`。
7. 排行榜的重點欄：這位同學目前這一題的重點（混合時也是）；學生自己的「重點」欄在混合場次顯示「混合」，題目上的小標籤顯示這一題的重點。

## 測試與結果（2026-11-18，Windows，Edge）

| 指令 | 結果 |
|---|---|
| `npm run typecheck` | 通過 |
| `node --test tests/*.test.mjs` | 172 項，170 通過、2 失敗：`C-3`（g8-2-3c／g9-2-1c raidTopics，已知、與本次無關）與 `tests/unit-quiz.test.mjs` 的 odd-records 斷言（已知；把本次改動 stash 掉、在乾淨的 8ccf588 上一樣失敗） |
| `node --test tests/cross.test.mjs tests/cross-live.test.mjs tests/cross-focus.test.mjs` | 全部通過（35 ＋ 8） |
| `PW_CHANNEL=msedge MCK_PORT=8797 npx playwright test tests/e2e/cross-board.spec.ts tests/e2e/cross-live.spec.ts` | 22 通過（大板 14、對戰 8）；`CROSS_SHOTS=1` 再跑一次也全部通過 |
| `npx vite build` | 通過（只有原本就有的 chunk 大小提醒） |

沒有跑 `ipad.spec.ts`、`duel.spec.ts` 或其他會寫 `artifacts/screenshots` 的 spec；沒有設 `MCK_SHOT_DIR`。

新增的測試重點：
- 單元：設定形狀；例子屬於自己的重點；`?focus` 優先、舊 `?level=1/2/3`、不認得的值；舊場次 `{level, lock}` 對應；混合每 3 題三種、可重現、不同種子不同；伺服器拒絕 `L1`／`hard`／`MIX`／空字串／數字／null／陣列／物件，`escalate` 不是布林也拒絕；單一重點連對 4 題不前進、勾選後 1,1,1,2,2,2,3；混合兩位同學各 6 題都三種、順序等於 `crossMixLevel(秘密種子)`、基本分照實際重點、送出前回應不含答案、CSV 沒有 L 數字；舊形狀的場次（刪掉 `focus`）照樣拿題、送出、前進、鎖定、重新開始。
- e2e 大板：從「遊戲」點四個重點各自開到對的重點（例子是 KaTeX）；舊網址 `?level=2` 停在「x² 係數不為 1」、改寫成 `focus=`；`focus` 和 `level` 同時有時 focus 優先；`?focus=mix` 9 題三種都有、順序與題目等於種子算出來的、重新整理同一串；預設連對 3 題不前進，勾選後前進到「x² 係數不為 1」。原有的拖曳、iPad（一個畫面放得下、觸控目標 ≥ 44px）、題池、鍵盤測試照樣通過。
- e2e 對戰：開始設定四個重點（名稱＋例子、先提公因式的小字、預設不勾、混合時停用）；選「x² 係數不為 1」→ 學生拿到的都是、連對 3 題不前進、排行榜寫重點名稱；換成混合，兩位同學各 3 題都三種都有；「遊戲」頁的對戰卡片選「先提公因式」→ 學生拿到要選公因數的題目。原本的主流程改成勾「自動進到下一個重點」，提示文字變成「進到「x² 係數不為 1」」。

## 截圖（`artifacts/cross-2026-11-18/`）

- `games-picker.png`：「遊戲」頁，大板四個重點按鈕與對戰的重點選擇（名稱＋例子）。
- `board-focus-switcher.png`：大板切換列（選「先提公因式」，負首項的題目）。
- `board-mix.png`：混合，題目上的重點標籤。
- `live-start-dialog.png`：對戰開始設定的重點選擇。
- `live-student-focus.png`：學生 iPad，混合場次，「重點：混合」與題目標籤。
- 同一次執行也把原本的截圖（`L1-empty.png`、`live-student-pending.png` 等）寫進這個新資料夾；`artifacts/cross-2026-11-17/` 與 `artifacts/screenshots/` 沒有動。

## 限制

- 「先提公因式」的例子是 k = 2；含負首項只寫在小字說明，不另外放例子（一行放不下兩個式子）。
- 舊的偏好 `xlLevel`／`xlLock` 不轉成新的 `xlFocus`／`xlEscalate`（老師第一次會看到預設的「x² 係數為 1」、不前進）。
- 對戰的混合沒有讓老師調整三種的比例；大板的混合是依序 1、2、3 的排列，不是完全隨機。
- 實機 iPad Safari 仍沒有測（Edge 觸控模擬）。
- `handoff.md`（專案根目錄）沒有在這次更新，依任務只寫了這份紀錄與 CHANGELOG。

## Codex review fixes（2026-11-18，回應 `codex-focus1-final.md` 的 REJECT）

### B1 混合順序不能洩漏出題種子
- 問題：直播混合用 `crossMixLevel(base)`，base＝`play.secret ^ 座號雜湊`，又是公開、非密碼學的函式；學生記下每 3 題的重點排列就能離線枚舉 base，再反推 `play.secret`。
- 修正：`CrossPlay.mixKey`（開場時 `crypto.getRandomValues` 32 bytes，十六進位；只在伺服器）。`crossMixOrder(mixKey, 場次 ID, 座號, 組號)`＝SHA-256(`cross-mix|mixKey|場次|座號|組號`) 前 4 bytes mod 6 選排列（偏差約 1e-9）。新增 `worker/sha256.ts`（同步版，因為 `issueItem` 是同步流程；`crypto.subtle` 只有非同步），單元測試和 `node:crypto` 對 0～1000 bytes 的邊界長度核對。
- 出題不變：題目種子仍是 `crossSeed(secret ^ 座號雜湊, 等級, n)`，8ccf588 的場次照用；`mixKey` 只決定「哪一級」，不碰題目數字。舊場次沒有 `mixKey`：第一次用到混合時才補（`crossMixKey`），非混合的舊場次不會加欄位。
- 大板的混合保留 `crossMixLevel(公開 seed)`（seed 本來就在網址上），在 `shared/cross.ts` 註明對戰不能用。
- 測試：換 `secret` 順序不變、換 `mixKey` 順序改變；每一題種子等於 8ccf588 公式；同一位置同一級時題目一樣；不等於舊公開函式的順序；不同座號、場次不同；6 種排列都會出現；`mixKey` 在學生回應、學生／老師課堂畫面、儀表板、公布、JSON／CSV 匯出、所有學生收到的回應裡都不出現（值與欄位名都查）。

### S1 欄位驗證與新舊混用的語意
- `focus`、`escalate`、`lock`、`level` 只要有送就驗證（`escalate`／`lock` 非布林、`level` 非 1～3 整數、`focus` 不認得 → 400，且不會開場）。
- 新格式＝有 `focus` 或 `escalate`，或什麼都沒送：重點＝`focus`（沒有就用 `level` 對應，再沒有是 `a1`）；前進只看 `escalate`（沒送＝不前進），`lock` 不採用；`gcf`、`mix` 一律不前進。只有純 `level`／`lock` 的請求走 8ccf588 的舊邏輯（沒勾鎖定就前進）。
- 測試：9 種錯誤型別（含沒有 focus 的 `{escalate:'yes'}`、`{level:2, escalate:1}`、`{level:2, escalate:null}`、`{focus:'a1', lock:'no'}`、`{focus:'gcf', level:9}`）全部 400；14 列語意表（空請求、只有 seconds、只有 escalate、`{level:2, escalate:false}` 不前進、新格式忽略 lock、gcf＋escalate 不前進、純舊格式照舊）。

### S2 作答中的 8ccf588 場次
- 新測試直接用 `git show 8ccf588:…` 取出當時的 `worker/`、`shared/` 打包成舊版伺服器（content 用目前的；沒有 git 歷史就 skip，這次有實際跑）。舊版上：01 號連對 3 題升到 2 級、手上有一題（卡片＋種子）、`past` 3 筆、每分鐘送出紀錄 3 筆；02 號答錯在冷卻中。確認存下來的樣子沒有 `focus`、`mixKey`、`m`。
- 換成新版（同一份資料、同一組 cookie）：重新拿題是同一題（id、原式、卡片、種子都一樣）；送出有效、基本分 130、分數累加、送出紀錄沿用並加 1；重送 409；之後 2 級再對 2 題升 3 級（`[2,false],[2,true],[3,false]`），新題種子照 8ccf588 公式；02 號冷卻照樣 429；老師排行分數一致；非混合的舊場次不會補 `mixKey`。

### NIT 對戰開始設定的「自動前進」
- 和大板一樣：選「先提公因式」（`crossNextFocus` 沒有下一個）時取消勾選並停用；選「混合」時隱藏（`.xl-check[hidden]` 另外蓋過 `display:flex !important`）；送出時 `escalate` 只在有下一個重點時才可能是 true。e2e 加上：a1 勾選 → 換 gcf 變成停用且未勾、可見 → mix 隱藏 → a-not-1 再出現、可勾、未勾。

### 驗證（這一輪）
| 指令 | 結果 |
|---|---|
| `npm run typecheck` | 通過 |
| `node --test tests/cross-focus.test.mjs` | 12 項全部通過（8ccf588 相容測試實際執行，沒有 skip） |
| `node --test tests/*.test.mjs` | 176 項，174 通過、2 失敗：已知的 `C-3`（g8-2-3c／g9-2-1c raidTopics）與 `unit-quiz` odd-records 斷言，和本次無關 |
| `PW_CHANNEL=msedge MCK_PORT=8797 CROSS_SHOTS=1 npx playwright test tests/e2e/cross-board.spec.ts tests/e2e/cross-live.spec.ts` | 22 通過；截圖只更新 `artifacts/cross-2026-11-18/` |
| `npx vite build` | 通過（只有原本就有的 chunk 大小提醒） |

沒有跑 `ipad.spec.ts`、`duel.spec.ts` 或其他會寫 `artifacts/screenshots` 的 spec；沒有設 `MCK_SHOT_DIR`；沒有 commit／push／部署。

### 變更檔案（這一輪）
`worker/sha256.ts`（新）、`worker/cross.ts`（`mixKey`、`crossMixKey`、`crossMixOrder`、`issueItem`）、`worker/app.ts`（`cross-start` 驗證與語意）、`shared/cross.ts`（註解）、`src/cross-live.ts`、`src/cross-live.css`（自動前進的停用／隱藏）、`tests/cross-focus.test.mjs`（＋4 項、改 2 項）、`tests/e2e/cross-live.spec.ts`、`docs/CROSS.md`、`CHANGELOG.md`、本檔。

## Codex re-review fixes（2026-11-18，第二次複審：APPROVE WITH FIXES）

### SHOULD-FIX 舊版相容性測試不得默默 skip
- 8ccf588 作答中的場次改成固定 fixture：`tests/fixtures/cross-legacy-8ccf588-state.json`（約 60 KB）。內容是真的用 8ccf588 伺服器跑出來的儲存資料＋cookie＋vault＋擷取時間＋01 號手上那一題；只有示範班 `DEMO801`、「1 號／2 號」、demo 帳號，沒有真實姓名。`lessons`／`catalog` 只是 content/lessons 的副本（2 MB 多），沒放進來，新版讀取時會重新同步；場次自己的 lesson 快照有保留。
- 相容測試一律讀這份 fixture，不再需要 git，也沒有 `t.skip`；fixture 缺漏、讀取失敗或斷言失敗都會直接失敗。測試時把 `Date.now` 平移到擷取的那一刻之後（測試結束就還原），冷卻、每分鐘送出紀錄、登入期限都和剛存下來時一樣；部署後的斷言照舊。
- 重新擷取（選用）：`CROSS_LEGACY_CAPTURE=1 node --test tests/cross-focus.test.mjs`。需要 8ccf588 的 git 歷史，git／建置／載入／斷言有任何錯誤都直接失敗，不會 skip。舊版伺服器建在自己的暫存資料夾：原本和共用的 `dir` 放在一起，用 `--test-name-pattern` 時 `test.after` 會把它提早清掉，結果出現 `Could not resolve "../shared/cross"`。這個錯誤以前會被整個吞成 skip。

### 已知待辦（NIT，這次沒改）
- `worker/sha256.ts` 是自己寫的 SHA-256，`crossMixKey` 用的是「秘密前綴雜湊」，不是 HMAC。目前沒找到能利用的漏洞（只公開六種排列之一、輸入由伺服器組成），但之後應該改成 Web Crypto 的 HMAC-SHA-256（`crypto.subtle`，Cloudflare Workers 支援）。發題入口本來就在 async handler 裡，改成 await 就好。

### 驗證（這一輪）
| 指令 | 結果 |
|---|---|
| `node --test tests/cross-focus.test.mjs` | 12 項全部通過，0 skip（相容測試只讀 fixture） |
| `CROSS_LEGACY_CAPTURE=1 node --test tests/cross-focus.test.mjs` | 13 項通過（含重新擷取）；加 `--test-name-pattern=capture` 也通過 |
| `npm run typecheck` | 通過 |
| `node --test tests/*.test.mjs` | 176 項，175 通過、1 失敗：已知的 `C-3`（g8-2-3c／g9-2-1c raidTopics）。`unit-quiz` odd-records 這次沒有失敗 |

變更檔案：`tests/cross-focus.test.mjs`、`tests/fixtures/cross-legacy-8ccf588-state.json`（新）、本檔。沒有跑 Playwright；沒有 commit／push／部署。
