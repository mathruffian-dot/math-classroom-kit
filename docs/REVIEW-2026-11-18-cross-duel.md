# 審核紀錄：十字交乘雙人大屏對戰＋先提公因式選項（2026-11-18b）

基準：`main` @ be15e86。沒有 commit、push、部署。

## 需求（老師回饋）

> 大屏版，新增雙人大屏對戰版本，左右分割視窗，時間內答對題數最多者獲勝；L3 版本，提公因數也要用選項讓使用者選。

## 改了哪些檔案

| 檔案 | 內容 |
|---|---|
| `shared/cross.ts` | 新增 `CROSS_K_OPTIONS`（凍結的 −5～5 不含 0）、`crossKOptions()`（回傳複本）、`crossKFeedback(poly, k, chosen)`（選錯的說明，不洩漏答案）。出題、判定都沒改。 |
| `worker/cross.ts` | `CROSS_K_OPTIONS`、`kOptions()` 改從 `shared/cross.ts` 來；值、順序、學生收到的 payload 完全一樣。 |
| `shared/cross-duel.ts`（新） | 雙人對戰的純邏輯：網址設定、配對出題 `crossDuelDeck`、題型 `crossDuelShape`、勝負 `crossDuelWinner`／`crossDuelResultText`、時鐘格式、可暫停的計時器 `CrossDuelTimer`。 |
| `src/cross-pad.ts`（新） | 從大板抽出的作答區元件：題目、十字圖、讀數、卡片匣、拖曳／點選／鍵盤、公因數選項、提示、公布答案、凍結。每個實例各自的狀態與指標追蹤。 |
| `src/cross-board.ts` | 改用 `createCrossPad`；只留題池、重點切換、分數、老師按鈕；上方列加「單人大板／雙人對戰」切換（`crossModeSwitchHtml`）。 |
| `src/cross-duel.ts`（新） | 雙人對戰頁：開始設定、倒數、左右兩塊作答區、計時、暫停／結束、結果、再來一局／回選單；「遊戲」頁的卡片。 |
| `src/main.ts` | 路由 `#/games/cross-duel`（放在 `#/games/cross` 之前判斷）、「遊戲」頁加第三張卡片。 |
| `src/cross.css` | 模式切換、公因數選項、雙人對戰版面（class 前綴 `xd-`，避開步驟格鬥 `duel.css` 已用的 `dl-`）。 |
| `tests/cross-duel.test.mjs`（新） | 10 項單元測試。 |
| `tests/e2e/cross-duel.spec.ts`（新） | 9 項 e2e。 |
| `tests/e2e/cross-board.spec.ts` | 先提公因式改成選項流程（沒有「提出公因數」按鈕、選錯說明、選對繼續、鍵盤）；混合裡的先提公因式題目有選項；截圖資料夾改 `cross-2026-11-18b`。 |
| `tests/e2e/cross-live.spec.ts` | 只改截圖資料夾常數（`cross-2026-11-18b`）。 |
| `docs/CROSS.md`、`CHANGELOG.md` | 說明。 |

## 設計決定

1. **公因數選項沿用全班連線對戰的固定清單**（−5～5，不含 0）。和答案無關（每一題同一份、同一順序），涵蓋產生器所有的 k（2、3、4、5、−1、−2、−3），干擾包含別的因數、正負號相反與 ±1。單元測試對 6 個種子的完整題池（各 150 題）＋5000 個隨機 seed 核對 k 都在清單內，所以**不需要擴充清單**，連線對戰行為不變。清單搬到 `shared/cross.ts` 後伺服器也用它，測試確認 `worker` 的 `CROSS_K_OPTIONS`／`kOptions()` 和共用函式一致、`worker/cross.ts` 原始碼不再自己寫一份。
2. **選錯的說明只談選的那個數**（`crossKFeedback`）：不整除 →「不是三個係數的公因數」；正負號 →「首項是負的，要連負號一起提出」／「首項是正的，不用提出負號」（首項正負本來就看得到）；是公因數但不是最大 →「…不是最大公因數」。單元測試對 2000 題 × 9 個錯的選項確認訊息裡出現的數字只有選的那個數。選錯的按鈕標紅框劃線但仍可按（不鎖死，避免變成刪去法提示）；選錯只記在畫面上，不扣分。
3. **共用元件而不是複製**：`src/cross-pad.ts` 的 id／testid 用前綴（大板 `cx`、對戰 `xdL`／`xdR`），卡片 id 帶前綴＋題號（`q3-c0`、`L3-c0`、`R3-c0`），整頁不會重複。大板的既有 e2e（14 項）全部照舊通過。
4. **點選改用指標事件判斷**：大板原本格子、卡片匣用 `click`。兩個人同時點的時候，瀏覽器的多指手勢可能不產生 `click`，所以格子、卡片匣、公因數選項都改成 pointerdown／pointerup（以 pointerId 記、移動超過 16px 視為取消），`click` 只處理鍵盤（`detail === 0`），不會重複觸發。
5. **配對出題**：兩邊從同一個題池依序配對，右邊挑和左邊同題型的題目。這同時滿足「同一個重點、難度相當、數字不同」「同一邊不重複」「兩邊永遠不會同時同一題」（兩邊集合不相交，跟答題速度無關）與「同一個 seed 可重現」（第 i 對只由 seed 決定）。
6. **時間到的測試**：正式選項只有 1／2／3 分鐘；`&test=1` 時 `time` 才接受任意秒數（e2e 用 6 秒）。沒有用 Playwright clock（倒數、計時、0.8 秒換題都用真實時間，比較接近實際）。
7. **對戰中不提供提示／公布答案／跳過**（需求如此）；老師有暫停（兩邊凍結、計時停止）與結束。
8. **class 前綴 `xd-`**：第一版用 `dl-`，和步驟格鬥 `src/duel.css` 的 `.dl-count`、`.dl-side`… 撞名（隊名列被放大成整塊），改成 `xd-` 後解決；之後新增 class 前請先 grep。

## 測試與結果

（2026-11-18，Windows，Edge＝`PW_CHANNEL=msedge`，`MCK_PORT=8797`）

| 指令 | 結果 |
|---|---|
| `npm run typecheck` | 通過（23 份課程驗證 0 錯誤；`tsc --noEmit` 無錯誤） |
| `node --test tests/*.test.mjs` | 186 項：185 通過、1 失敗——失敗的是已知、與本次無關的 **C-3**（g8-2-3c／g9-2-1c 魔王戰 topic 沒有對應題型）。`tests/cross-duel.test.mjs` 10／10 通過；`cross.test.mjs`、`cross-focus.test.mjs`、`cross-live.test.mjs` 全部通過（連線對戰的 k 選項測試照舊通過） |
| `CROSS_SHOTS=1 PW_CHANNEL=msedge npx playwright test tests/e2e/cross-board.spec.ts tests/e2e/cross-duel.spec.ts tests/e2e/cross-live.spec.ts` | **31 passed**（大板 14、雙人對戰 9、連線對戰 8），3.6 分鐘 |
| `npx vite build` | 成功（只有既有的 chunk 大小警告） |

單元測試（`tests/cross-duel.test.mjs`）：共用 k 清單（值、複本、凍結、伺服器同一份、原始碼不再重複）；所有題池與 5000 個 seed 的 k 都在清單內且是真正的最大公因數；清單對每題一樣、只看選項的猜法不比亂猜好；選錯說明不洩漏答案（2000 題 × 9 個錯選項）；網址設定；配對公平（4 種重點 × 3 個 seed × 60 題：同等級、同題型、同卡片數、數字不同）；可重現且與詢問順序無關；同一邊不重複、兩邊不相交（每邊 70 題）、縮小題池換輪；勝負／平手／文字、時鐘；可暫停的計時器。

## 截圖（`CROSS_SHOTS=1`，`artifacts/cross-2026-11-18b/`）

| 檔名 | 內容 |
|---|---|
| `duel-setup.png` | 開始設定（重點四選一＋時間 1／2／3 分鐘） |
| `duel-countdown.png` | 倒數 3（作答區模糊、鎖住） |
| `duel-midgame.png` | 中盤：左邊放了一張卡，右邊答對（綠色＋因式分解、答對 1 題） |
| `duel-result.png` | 時間到：右方（藍）獲勝 1 比 0 |
| `duel-tie.png` | 再來一局後：平手 1 比 1 |
| `duel-ipad-landscape.png` | iPad 橫向 1180×820：先提公因式，兩邊各有一排 10 個公因數選項 |
| `board-gcf-options.png` | 大板：先提公因式的公因數選項（十字圖鎖住）＋提示 |
| `board-gcf-wrong.png` | 大板：選錯（1）→「提出 1 之後，括號裡的係數還有公因數，再選一次」，選項標紅框 |
| `board-gcf-correct.png` | 大板：選對後 原式 = k(…)、十字交乘答對 |

同一次執行也重新產生了大板與連線對戰既有的截圖（`L1-*.png`、`L2-*.png`、`board-*.png`、`ipad-*.png`、`games-picker.png`、`live-*.png`），都在同一個資料夾；`artifacts/cross-2026-11-17/`、`artifacts/cross-2026-11-18/`、`artifacts/screenshots/` 沒有寫入。

## 限制與後續

- 實機大觸控螢幕、iPad Safari 沒有測；多點觸控用 Edge 的 CDP 觸控模擬（兩個觸控點同時移動）與交錯的合成 PointerEvent 驗證。部分觸控螢幕驅動（尤其 Windows 上的大屏）會把多指輸入當成手勢；畫面已設 `touch-action: none`，仍建議上課前實機試一次兩人同時拖曳。
- 對戰不存紀錄、不記名，重新整理回到開始設定。
- 直向（portrait）沒有特別排版。
- 種子在網址上，是課堂比賽用，不是防作弊的線上對戰。
- 沒有跑 `ipad.spec.ts`、`duel.spec.ts` 與其他會寫 `artifacts/screenshots` 的 spec（依指示）。

## Codex review fixes（2026-11-18，第 1 輪：`codex-duel1-61-final.md` REJECT → 全部修正）

仍然沒有 commit、push、部署。

| 項目 | 修正 | 檔案 | 測試 |
|---|---|---|---|
| **B1** 選 k 前洩漏括號裡的三項式 | 選對（或公布）k 之前，畫面只有原式與公因數選項：卡片匣空著（「選對公因數之後，數字卡才會出現」，卡片的數值、張數都不畫）、四格一律 ?x／?（不標左欄固定、`aria-disabled`）、讀數全是「?」、「目標 ?」（title 只寫「一次項係數」）、欄乘積空白、因式 (?x ?)。新增 `renderWork()`（只在選對／公布時畫卡片與左欄固定）與 `updateBeforeK()`（不碰任何括號裡的係數）。大板與雙人對戰共用同一個元件，兩邊同時修好。 | `src/cross-pad.ts`、`src/cross.css`（`.cx-tray-wait`） | 大板新 e2e：兩組（k>0、k<0）各兩題（左欄固定／不固定），選 k 前、選錯後、提示後都核對沒有卡片／`data-card`／`data-value`／`data-home`／`.fixed`／答案、讀數是「?」、HTML 裡沒有括號裡三項式的 KaTeX 原始碼、沒有「目標 ±n」「相乘 n」；選 k 前的作答區 HTML（含所有屬性）除了原式之外兩題完全一樣。對戰 gcf e2e：兩邊同樣核對，且左右兩塊（不同題）HTML 一樣；右邊選對後才出現卡片與「目標 ±n」，左邊仍然沒有。 |
| **B2** 截止後仍可能計分 | 截止時間用實際時間核對：`createCrossPad` 新增 `guard`，每個作答輸入（按下卡片／格子／公因數、放卡、退卡、選 k）前呼叫；對戰的 `inTime()` 過了截止就立刻 `finish()` 並拒絕輸入。`solved()` 計分前再核對一次；自動換題、暫停也先核對；`visibilitychange`／`focus`／`pageshow` 時核對（頁面離開後自動移除監聽）。`finish()` 只結算一次（`data-settled`，再來一局歸零）。測試入口 `?test=1` 的 `window.__crossDuelTest`（`skew`、`hold`、`remaining`、`settled`）。 | `src/cross-duel.ts`、`src/cross-pad.ts` | e2e：截止前 300ms 的最後一張卡算分；拍子暫停、截止後 50ms 的最後一張卡不算、卡片不進格子、立刻結算、結果 1 比 0；之後的輸入、恢復拍子、focus／visibilitychange 都不再結算（`settled` = 1）。另一項：分頁 hidden 時過了截止、回到 visible 那一刻結算；視窗 focus 時結算；截止後按暫停直接結算。 |
| **S1** `lostpointercapture` 沒取消點選 | `pointercancel`、`lostpointercapture` 都刪掉那個 pointerId 的待完成點選。 | `src/cross-pad.ts` | e2e：左邊按 k 選項後失去擷取 → 放開不選 k、沒有說明；同時右邊正常選 k。左邊按格子後失去擷取 → 不放卡、選取保留；右邊同時正常放卡；下一次點選照常。 |
| **S2** 不重複只限單輪 | `crossDuelDeck` 改成每個等級一個佇列＋整局 `seen`（左右合起來）：換輪時只加沒出過的題，所以整局不重複、兩邊不相交。耗盡（連續幾輪拿不到新題；正式題池 3 輪，小題池依大小多試）時明確重新開始：最近 `CROSS_DUEL_RECENT_PAIRS`（10）對先不出，`deck.restarted(i)` 標記，畫面那一邊的回饋列顯示「這個重點的題目都出過了，重新洗牌開始新的一輪。」文件的「永遠不重複／不相交」改成寫明這個例外。 | `shared/cross-duel.ts`、`src/cross-duel.ts`、`docs/CROSS.md`、`CHANGELOG.md` | 單元：每邊 90 題不重複、不相交、沒有重新開始；4 種重點 × 題池 2／3／5／7 題 × 3 個 seed，每局 120 題整局不重複；x² 係數為 1（200 題）在第 100 對重新開始，之前 200 題全部不同，重新開始後 10 對都不是最近 20 題、新的一輪也不重複，同 seed 可重現。 |
| **S3** 配對失敗時拿別的題型補 | 拿掉 `j = 0` 的補位：找不到同題型就再拿下一輪題池，直到找到；真的沒有（只可能在耗盡時）就重新開始一輪再找，仍然只配同題型（防呆上限後丟錯，正常產生器碰不到）。 | `shared/cross-duel.ts` | 單元：4 種重點 × 40 個 seed × 5 種題池大小（正式、2、3、4、9）× 40 對，每一對題型、卡片數一樣、數字不同；gcf 題池 3 題時確實出現至少 3 種題型（題池尾端常剩別的題型）。 |
| **S4** 版面只測初始狀態 | 版面 e2e 改成每個尺寸（1920×1080、1366×768、1180×820 觸控、1024×768 觸控）量：x² 係數不為 1 的開始、gcf 選 k 前、選錯 k 的說明、兩邊選對後的 `原式 = k(…)` 等式、差多少的錯誤訊息、完整因式分解（`hold` 暫停自動換題，停在答對畫面）。每個狀態檢查整頁不捲動、每一塊 `.xd-pad` 不捲動、題目／等式／選項／十字圖／格子／卡片／欄乘積／讀數／卡片匣／回饋／因式分解的框都在自己那一塊裡、文字容器沒有被切（`scrollWidth`）、觸控目標 ≥ 44px。沒有需要改 CSS（全部通過）。 | `tests/e2e/cross-duel.spec.ts` | 4 尺寸 × 6 狀態全部通過。 |
| NIT 卡片順序 | 「遊戲」頁改成 大板 → 全班連線對戰 → 雙人大屏對戰，雙人對戰是第三張，和文件一致。 | `src/main.ts`、`docs/CROSS.md` | 既有 e2e（從卡片打開）通過。 |
| NIT `CROSS_SHOTS` | 三個 spec 都改成 `process.env.CROSS_SHOTS !== '1'` 就不寫截圖。 | `tests/e2e/cross-{board,duel,live}.spec.ts` | — |

### 測試結果（2026-11-18，Windows，Edge，`MCK_PORT=8797`）

| 指令 | 結果 |
|---|---|
| `npm run typecheck` | 通過（23 份課程 0 錯誤；`tsc --noEmit` 0 錯誤） |
| `node --test tests/*.test.mjs` | 189 項：188 通過、1 失敗＝已知無關的 **C-3**。`tests/cross-duel.test.mjs` 13／13。 |
| `PW_CHANNEL=msedge npx playwright test tests/e2e/cross-board.spec.ts tests/e2e/cross-duel.spec.ts tests/e2e/cross-live.spec.ts` | **35 passed**（大板 15、雙人對戰 12、連線對戰 8），4.0 分鐘；`CROSS_SHOTS=1` 重跑一次也 35 passed（4.1 分鐘） |
| `npx vite build` | 成功（只有既有的 chunk 大小警告） |

截圖（`CROSS_SHOTS=1`）只重新寫入 `artifacts/cross-2026-11-18b/`；`board-gcf-options.png` 現在是選 k 前的畫面：只有原式、公因數選項與提示，卡片匣顯示「選對公因數之後，數字卡才會出現」。沒有跑 `ipad.spec.ts`、`duel.spec.ts`，沒有設 `MCK_SHOT_DIR`。

### 仍然的限制

- 截止時間的 e2e 用 `?test=1` 的時鐘偏移（injected time）而不是 Playwright clock；真實的背景分頁節流以手動改 `document.visibilityState` 並送出事件模擬。
- 題目耗盡後的新一輪只保證最近 10 對不重出；兩邊進度差超過 10 對的同一個重點的題時，理論上可能同時是同一題（正常一局遠遠到不了耗盡）。

## Codex re-review fixes（2026-11-18，第 2 輪：`codex-duel2-gpt-6.1-sol-final.md` APPROVE WITH FIXES → SHOULD-FIX＋NITS 全部修正）

仍然沒有 commit、push、部署。

| 項目 | 修正 | 檔案 | 測試 |
|---|---|---|---|
| **S1** 測試 hook 留在已移除 test=1 的對局 | `syncUrl()` 改成只看這個畫面是不是用 `test=1` 打開（`testing`），整個畫面存續期間網址都保留 `&test=1`（改選正式時間也一樣）。hook 記下 `owner`（這個畫面的 root）；`hashchange`、畫面不在頁面上時 `teardown()` 撤掉（只撤自己的）；每個新的對戰畫面一打開先 `delete window.__crossDuelTest`，只有 `test=1` 才重新掛上；hook 的每個方法先確認畫面還在，否則什麼都不做並撤掉。時鐘偏移、暫停拍子是畫面自己的變數，所以一般對局不可能被改到。 | `src/cross-duel.ts` | 新 e2e：`time=20&test=1` 改選 2 分鐘開始 → 網址 `test=1`、`time=120`，hook 可用；留舊參照、回 `#/games` → hook 不在；一般網址開對局 → 沒有 hook、網址沒有 test=1，舊參照的 `skew`／`hold`／`remaining`／`settled` 全部是 no-op（回傳 undefined），時鐘照走（1:5x）、答對照常換題；測試頁直接換到一般對局（中間不經過別的頁）→ 也沒有 hook。 |
| **S2** 耗盡後重洗可能重出另一側的當前題 | 選擇「停止發題」：`crossDuelDeck` 拿掉重洗（`restarted`、`CROSS_DUEL_RECENT_PAIRS`、`history` 都移除）。某個等級拿不到同題型的新題時，從那一對起 `pair(i)`／`item(side, i)` 一律 `null`（`exhausted(i)`，之後每一對都是 null；混合時任何一種用完就整串停止）；配不到搭檔的題直接丟掉不出。畫面那一邊答完最後一題後鎖住（`out[s]`，暫停／繼續也不會解鎖；`data-exhausted`），回饋列顯示「這個重點的題目都出過了，這一邊不再出新題。」。整局不重複、兩邊不相交因此沒有例外。 | `shared/cross-duel.ts`、`src/cross-duel.ts`、`docs/CROSS.md`、`CHANGELOG.md` | 單元：x² 係數為 1 剛好 100 對（200 題全部不同）後一律 null、同 seed 同一處用完；新增「一邊跨過耗盡、另一邊還停在第 0 題」：4 種重點 × 題池 2／3／5 × 2 個 seed，左邊一路要題到用完，從沒拿到右邊當前的題、自己不重複、用完後連續 20 次都是 null，右邊到同一個位置也是 null、兩邊不相交。 |
| NIT 「另一邊未重畫」測試可能誤判 | `mark()` 改成在另一邊的作答區（`#xdR-host`）掛 `MutationObserver`（`childList`＋`characterData`＋`subtree`），同時保存題目、卡片匣、十字圖、回饋列、每張卡片、原式節點的參照；`marked()` 回傳變動數與脫離頁面的節點數，要求 0／0。開始監看前先等右邊自己的回饋計時器（1.8 秒）跑完。 | `tests/e2e/cross-duel.spec.ts` | 通過（重寫 `innerHTML` 一定會被抓到：子樹 childList 變動＋舊節點脫離）。 |
| NIT 文件測試數量 | `docs/CROSS.md` 改成單元 14 項、雙人對戰 e2e 13 項，並寫明耗盡策略與 hook 生命週期。 | `docs/CROSS.md` | — |

### 測試結果（2026-11-18，Windows，Edge，`MCK_PORT=8797`）

| 指令 | 結果 |
|---|---|
| `npm run typecheck` | 通過 |
| `node --test tests/*.test.mjs` | 190 項：188 通過、2 失敗＝已知無關的 **C-3**，以及已知會偶發失敗的 `unit-quiz`（單獨重跑 `tests/unit-quiz.test.mjs` 兩次都 5／5）。`tests/cross-duel.test.mjs` 14／14。 |
| `PW_CHANNEL=msedge npx playwright test tests/e2e/cross-duel.spec.ts tests/e2e/cross-board.spec.ts` | 大板 15 passed；雙人對戰 13 passed（第一次跑新的 hook 測試忘了開觸控而失敗，改成 `hasTouch` 後整份重跑 13 passed） |
| `npx vite build` | 成功（只有既有的 chunk 大小警告） |

這一輪沒有設 `CROSS_SHOTS`（截圖沒有重寫）；沒有跑 `cross-live.spec.ts`（這一輪沒有改 live）、`ipad.spec.ts`、`duel.spec.ts`。

### 仍然的限制

- 題目用完的畫面（停止發題＋提示）只有單元測試驗證出題邏輯，沒有 e2e 實際答 100 題走到那一步。
- 截止時間 e2e 仍用 `?test=1` 的時鐘偏移與手動 `visibilityState` 模擬背景分頁。

## x 項顏色（2026-11-18，老師回饋 t59u：「x 項用別的醒目的顏色，紫色的色系太接近藍色」）

變數只定義一次（`src/styles.css` 的 `:root`），`src/cross.css`、`src/cross-live.css` 的 x 項全部改用變數；其他功能的 `--violet`（品牌、課程頁）沒動。

| 用途 | 舊 | 新 | 對比（WCAG） |
|---|---|---|---|
| x 係數文字（卡片、「左上 × 右下」讀數、公因數選項） | #4b36c9（紫） | `--cross-x` #c2410c（橘） | 白底 5.18、#fff7ed 卡底 4.88、#f5f7fc 讀數底 4.83（皆 ≥ 4.5） |
| x 卡／x 格／公因數選項邊框、x 欄斜線 | #7b61ff／#8a6df0 | `--cross-x-border` #ea580c | 白底 3.56（非文字圖形 ≥ 3） |
| x 卡底色 | 白 | `--cross-x-bg` #fff7ed | — |
| 連線對戰選中的公因數 | 底 #8a6df0 | 底 #c2410c、白字 | 5.18 |
| 對戰左方（紅）隊伍色 | #e5484d（白字 3.91） | `--cross-team-red` #e11d48（白字 4.70）；淡底 `--cross-team-red-bg` #fff1f3；深色大屏文字 `--cross-team-red-light` #fb7185（#13204a 底 5.85） | |
| 選取卡片／放置目標框 | 橘色 accent #ff7a45 | `--cross-pick` #1f2a56（深藍黑），底 `--cross-pick-bg` #e8ecf8 | 11.67 |

色相：x 橘 17°～21°、常數藍 214°（差約 195°，紅綠色弱也分得開——橘／藍是色盲友善的組合）、答對綠 152°、答錯紅 358°（橘比錯誤紅暗、且錯誤一律搭配 ✗／刪除線／紅底）、左方玫瑰紅 347°（和橘差約 30°，且明度、飽和不同；隊伍色只用在標頭／底色，x 橘只用在卡片與數字）。原本的「選取」用橘色 accent，和新的 x 卡撞色，所以十字交乘畫面裡改成深藍黑外框。

測試：`tests/e2e/cross-colors.ts`（共用）讀計算後的顏色：x 卡邊框落在橘色 10°～40°、文字也是橘色、和常數卡邊框色相差 > 60°；大板（iPad 測試）、雙人對戰（兩邊各一次，並檢查 x 橘和左方隊伍紅色相差 > 25°）、連線對戰學生端（x² 係數不為 1）各一次。

| 指令 | 結果 |
|---|---|
| `npm run typecheck` | 通過 |
| `node --test tests/*.test.mjs` | 190 項：189 通過、1 失敗＝已知無關的 **C-3** |
| `PW_CHANNEL=msedge MCK_PORT=8797 npx playwright test tests/e2e/cross-board.spec.ts tests/e2e/cross-duel.spec.ts tests/e2e/cross-live.spec.ts` | 36 passed |
| 同上加 `CROSS_SHOTS=1` | 36 passed，`artifacts/cross-2026-11-18b/` 截圖全部重寫 |
| `npx vite build` | 成功（只有既有的 chunk 大小警告） |

沒有跑 `ipad.spec.ts`、`duel.spec.ts`，沒有設 `MCK_SHOT_DIR`。

- Final review fixes：連線版 x 格橘色規則的排除條件改包 `:where(...)`（`src/cross-live.css:500`），已填 x 格＋另選卡片時 `.target` navy 框不再被蓋過；`tests/e2e/cross-colors.ts` 新增 `expectPickCue`，連線版（格子 border）與大板（卡片 outline）各補一項檢查（還原舊 CSS 時連線版測試會失敗）；大板／對戰的 `src/cross.css` 選取提示是 `.cx-card.selected` 的 outline，不受橘色 border 規則影響，免改；`docs/CROSS.md:107` 改為「耗盡時停止發題、不重洗」。typecheck、cross-live／board／duel e2e 36／36、vite build 通過。
