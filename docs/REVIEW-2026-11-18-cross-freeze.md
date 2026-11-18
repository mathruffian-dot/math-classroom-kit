# 審核紀錄 2026-11-18c：十字交乘答錯凍結 3 秒、先提公因式的「提出負號」

- 起點：main `5ca99fc`（正式版）。未 commit、未 push、未部署。
- 老師回饋：
  - t64u：「答錯要凍結拖拉 3 秒，顯示訊息，防止學生用試誤法」。
  - t65u：先提公因式、首項為負時，選正的最大公因數也要算對，接著做「提出負號」這一步；直接選負的照樣可以。

## 改了哪些檔案

| 檔案 | 內容 |
|---|---|
| `shared/cross.ts` | `CROSS_WRONG_FREEZE_MS = 3000`；`crossKFeedback` 改寫（首項為負選正的最大公因數回傳 null，拿掉「首項是負的，要連負號一起提出」）；新增 `crossKAccepted`、`crossDivides`、`crossDivide`、`crossNeedsSign`、`crossSignOptions`、`crossSignSalt`（FNV-1a）、`CROSS_SIGN_FEEDBACK`、`outerTex` |
| `shared/cross-duel.ts` | `crossTestFreeze(params)`：只有 `test=1&freeze=0～10000` 才有值 |
| `shared/types.ts` | `CrossLiveResult.reason` 多 `'sign2'` |
| `src/cross-pad.ts` | 答錯凍結（`penalize`／`endPenalty`／`holdPenalty`／`runPenalty`、`applyLocks`、橫幅與 `aria-live`）；步驟 `stage()`：選公因數 → 提出負號 → 十字交乘；`chooseSign`；指標、鍵盤、點選在凍結中一律不理；`freeze(on)` 暫停／接續凍結倒數 |
| `src/cross-board.ts` | `?test=1&freeze=` 傳給作答區，改寫網址時保留 |
| `src/cross-duel.ts` | 同上；結算時 `endPenalty` |
| `src/cross.css` | 凍結橫幅、變暗、讀屏隱藏段落、提出負號按鈕（大板兩欄；對戰依式子寬度換行、做完後只留最後的等式） |
| `worker/cross.ts` | `CROSS_COOLDOWN = [3000, 4000, 5000]`；新題 `cur.v = 2`；送出驗證 `k`＋`sign`（新題嚴格、舊題相容）；判定 `sign2` |
| `src/cross-live.ts`、`src/cross-live.css` | 學生 iPad 的提出負號列（本機用公開資料算選項、送出帶 `sign`）、「答錯了，N 秒後再試」倒數 |
| 測試 | `tests/cross-duel.test.mjs`、`tests/cross-live.test.mjs`、`tests/e2e/cross-board.spec.ts`、`tests/e2e/cross-duel.spec.ts`、`tests/e2e/cross-live.spec.ts` |
| 文件 | `docs/CROSS.md`（〈答錯凍結 3 秒〉、〈首項是負的：兩條路〉、冷卻表、送出格式）、`CHANGELOG.md` |

## 決定

1. **凍結放在共用作答區**（`src/cross-pad.ts`），大板與對戰同一份程式；對戰左右各一個實例，所以只凍結答錯的那一邊。
2. **觸發點**：放卡讓四格填滿而且不對（`place()` 之後判定；拿掉卡片不會觸發）、`chooseK` 選錯、`chooseSign` 選錯。每次答錯都是新的 3 秒，不遞增（遞增只在連線對戰的伺服器冷卻）。
3. **凍結中輸入**：`pointerdown` 一開始就 return（凍結中按下的指標什麼都不記）；開始凍結時 `cancelDrag()`（放掉擷取、拿掉複製卡、清掉還沒完成的點選）；`pointerup` 若還在凍結直接 `endDrag()`；`keydown` 擋 Enter／空白／Delete／Backspace；`tapCard`／`tapSlot`／`tapTray`／`place`／`toTray`／`chooseK`／`chooseSign` 都檢查 `st.penalty`。CSS 另外把作答區 `pointer-events: none`。
4. **答錯的擺法留著**：不清空格子，回饋列維持原本的差多少／說明文字。
5. **老師按鈕**：不受凍結影響；`load`（下一題、換重點）、`clear`、`reveal` 呼叫 `endPenalty`。提示不解除（只換回饋文字）。
6. **暫停**：對戰暫停時 `setPhase` 會 `freeze(true)`，作答區把凍結剩下的毫秒數存起來、停掉計時器；`freeze(false)` 接著倒數。這是最一致的做法：暫停期間學生本來就不能操作，凍結也不該「偷偷用掉」。
7. **對戰時間**：凍結不暫停對戰計時（凍結是懲罰，時間照算）。時間到時 `finish()` 先 `endPenalty()` 再顯示結果。
8. **測試覆寫**：只有網址帶 `test=1` 才讀 `freeze=`（0＝不凍結，給「答錯後馬上改」的舊 e2e 用）；正式畫面不會有 `test=1`。單元測試確認沒有 `test=1` 時 `freeze=` 被忽略。
9. **首項為正卻選負的（含 −k）**：維持算錯「首項是正的，不用提出負號」＋凍結。理由：提出負號會讓括號裡首項變負，十字交乘的約定（左欄正數）就做不下去，等於多一步錯的方向；任務說明也建議保留。
10. **提出負號的選項**：正解 −g(−T)，干擾 −g(只改首項)、−g(T)、g(−T)（T＝原式 ÷ g）。四個都只由原式與 g 算出，`ok` 用「乘開等於原式而且括號裡首項為正」判斷，不看 p、q、r、s。順序：大板用題目種子、連線用題目 ID 的雜湊，同一題每次一樣，不同題位置不同（單元測試確認正解位置會變）。
11. **連線對戰的判定方式**：連線版的公因數本來就和四格在**同一次送出**裡判定（不是分開的步驟），所以提出負號也放進同一次送出（`sign`＝選項位置），伺服器用同一個函式重算清單判定；冷卻作用在這一次送出上（公因數錯、提出負號錯、四格錯都算一次答錯）。選項不從伺服器送：伺服器若在選 k 之前送出選項，選項本身就透露了公因數的大小。學生端在選了正的 k、而且 k 整除三個係數時才顯示提出負號列（整除與否是公開的算術）；不整除的正數不會有第 2 步，送出後由伺服器判 `k` 錯。
12. **舊資料相容**：5ca99fc 存的作答中題目沒有 `cur.v`：舊格式（直接選負的 k、正的 k 不帶 `sign`）照舊判定；帶了 `sign` 照新規則判。新題 `cur.v = 2` 格式嚴格。冷卻欄位名稱沒有改（`wrong`、`cool`），舊資料直接讀。
13. **每分鐘 15 次上限**：保留。冷卻至少 3 秒、第 3 次起 5 秒，連續答錯一分鐘最多約 12 次，上限只會擋到很快的連續答對（本來的用意），兩者不衝突。
14. **anti-leak**：第 2 步之前卡片、讀數、目標、欄乘積照舊不畫；第 2 步時唯一新出現的是「原式 = g(原式 ÷ g)」與四個只差正負號的式子（公開代數）。e2e 的洩漏檢查改成：第 2 步時拿掉選項之後，作答區沒有目標、欄乘積、「第 3 步」；選錯公因數的情境改挑真的會錯的數（首項為負時 −k 現在是對的）。

## 測試與結果（2026-11-18，Windows、Edge）

- `npm run typecheck`：通過。
- `node --test tests/*.test.mjs`：195 項，193 通過、2 失敗——
  - `C-3: new raid questions and cumulative duel families map to a topic`：已知、和這次無關（g8-2-3c 魔王戰 topic 對應）。
  - `class and PK unit quizzes run like the after-class quiz`（odd-records）：已知的不穩定測試；單獨重跑 `tests/unit-quiz.test.mjs` 兩次都 5/5 通過。
  - 這次相關：`tests/cross-duel.test.mjs` 16/16、`tests/cross-live.test.mjs` 23/23（新增：冷卻 3→4→5、答對歸零後又是 3、冷卻中送出 429 且不算作答；首項為負兩條路經伺服器判定、分數一樣、提出負號錯 → `sign2`＋3 秒冷卻、缺／多／範圍外的 `sign` 都 400、首項為正選 −k 判錯、L1 帶 `sign` 400；5ca99fc 舊題舊格式／新格式、舊冷卻欄位照擋、連錯次數接續）。
- `PW_CHANNEL=msedge npx playwright test tests/e2e/cross-board.spec.ts tests/e2e/cross-duel.spec.ts tests/e2e/cross-live.spec.ts`（`CROSS_SHOTS=1`）：**44 passed**（大板 18、對戰 16、連線 10）。新增的情境：
  - 大板：答錯凍結（倒數 3 → 2 → 1 用 MutationObserver 記下、擺法與差多少留著、凍結中拖曳／點卡片／點卡片匣／Delete 都不動、**答錯那一刻進行中的滑鼠拖曳被取消**（滑鼠拿著一張卡時用鍵盤放第四張觸發答錯，複製卡立刻消失、之後放開滑鼠不放卡）、3 秒後解除可以改、每次答錯重新凍結、提示不解除、下一題／公布答案／清空立刻解除）；公因數選錯凍結（凍結中按對的 k 指標與鍵盤都不理）；首項為負：選 2 → 四個選項 → 選錯凍結 → 選對 → 第 3 步 → 拖卡答對；直接選 −2；−1 的題選 1。
  - 對戰：左邊答錯只凍結左邊，**兩根手指同時拖**時左邊不動、右邊放得進去，右邊點選照常；凍結中計時照走；暫停 4 秒凍結還在（數字不變）、繼續後接著倒數；凍結中時間到照常結算一次、橫幅收起；一邊走正的公因數＋提出負號、另一邊直接負的，兩邊都得分；版面測試加上「提出負號」狀態（四種尺寸都不溢出）。
  - 連線：答錯 → 「答錯了，3 秒後再試」倒數 3、2、1（伺服器時間），擺法留著、卡片與下一題鎖住、直接打 API 拿題也 429，倒數完才能拿下一題；第二次連錯從 4 開始；首項為負選正的 → 提出負號列 → 沒選就送出會提示 → 選對 → 伺服器判對；這一題送出前收到的回應不含因式分解或提出負號的資料。
  - 沒有跑 `ipad.spec.ts`、`duel.spec.ts`，沒有設 `MCK_SHOT_DIR`。
- `npx vite build`：通過（只有既有的 chunk 大小提醒）。

## 截圖（`artifacts/cross-2026-11-18c/`，只在 `CROSS_SHOTS=1` 時寫）

- `freeze-single.png`：大板答錯，紅框「答錯了，3 秒後再試」、作答區變暗、下方「✗ 交叉相乘和 = +1，目標 −23，差 24」。
- `freeze-k-wrong.png`：選錯公因數的凍結。
- `freeze-duel-one-side.png`：對戰左邊凍結、右邊正在放卡。
- `live-cooldown.png`：學生 iPad「答錯了，3 秒後再試」＋「下一題（3 秒）」。
- `gcf-positive-step2.png`：選 2 之後第 2 步的四個選項。
- `gcf-step2-wrong-freeze.png`：提出負號選錯（紅框）＋凍結。
- `live-gcf-step2.png`：學生 iPad 的提出負號列（已選正解，十字圖解鎖）。
- 同一次執行也重新產生了三個 spec 原本的截圖（都在同一個資料夾）。

## 已知限制

- 實機 iPad Safari、大觸控螢幕沒有測；觸控是 Edge 的 CDP 觸控模擬。
- 凍結是前端的（大板、雙人對戰本來就是純前端、不記名）；有心的人用開發者工具可以繞過。連線對戰的冷卻在伺服器，繞不過。
- 凍結的倒數用 `performance.now()`＋0.1 秒的拍子；背景分頁被節流時數字可能晚一點更新，但解除時間由 `setTimeout` 決定（也可能被節流延後，最多讓凍結變長，不會變短）。
- 連線對戰答錯後仍然會顯示正確的因式分解（既有設計：送出後才給答案），冷卻只擋「下一題」；學生不能在同一題重試，所以「答錯的擺法留著」就是判定畫面。
- 連線對戰學生端：選了不整除的正數不會出現提出負號列（直接送出由伺服器判公因數錯）；這等於告訴學生「這個數不整除」，但這是公開的算術，大板也會直接說明。

## Codex review fixes（2026-11-18，回應 `codex-freeze1-gpt-6.1-sol-final.md`）

### B1（P1）連線版第 2 步只有視覺鎖定 → 修好
- `src/cross-live.ts`：新增 `workReady(item, k, sign)`（不用選公因數，或已選公因數且不需要／已選提出負號）。沒準備好時 `questionHtml` **不產生**卡片（`.xl-card-btn`）、固定左欄（`.xl-slot.fixed`）和任何 `data-value`：四格改成不能點的空格（`lockedSlotHtml`，沒有 `data-action`），卡片匣只有一行「完成上面的步驟後才會出現卡片」（`xl-tray-wait`）；鎖的字樣分成「先選公因數」／「先選『提出負號』」。
- `xl-card`、`xl-slot` 處理函式也照步驟狀態擋掉（`workReady`），不是只靠 CSS；選公因數後還沒準備好就清掉 `sel`。
- 送出的檢查順序改成公因數 → 提出負號 → 四格（解鎖前沒有卡可放，提示要說缺的是哪一步）。
- 伺服器判定不變（仍是合併送出）。
- 大板／雙人對戰複查：`src/cross-pad.ts` 本來就照 `needK()`（`stage() !== 'cross'`）不產生卡片（`hide = needK()`），`locked()` 也包含 `needK()`，所以放卡、退卡、鍵盤都被擋；既有的防外洩測試（`expectNoInnerLeak`、`expectStep2NoLeak`、對戰的選 k 前 DOM 比對）照樣通過。

### S1（P2）冷卻倒數無法從重新整理後的狀態恢復 → 修好
- 新的學生畫面模式 `cool`：沒有本機判定、沒有題目，但伺服器的 `mine.cool` 比現在晚 → 顯示一樣的「答錯了，N 秒後再試」倒數＋停用的「下一題（N 秒）」。倒數完 `crossCardKey` 變回 `wait`，原本的自動拿題接手（冷卻中不再每 0.5 秒自動拿題又被擋）。
- 「下一題／拿題目」按鈕統一用 `nextBtnHtml`，一定帶 `data-xl="next"`（`wait`、`cool`、判定畫面都是），`updateCrossCard` 會停用並倒數（`data-label` 保留原本的字）。
- 送出收到 429（冷卻中、限速）時也 `resync`（原本只有 409 才同步），冷卻畫面照伺服器狀態重建。
- 另外修了倒數多算 1 秒的問題（完整 e2e 一起跑、負載高時抓到的）：時間差原本只用最近一次回應估，回應延遲會讓 `serverTime()` 落後真正的伺服器時間，3 秒的冷卻剛開始會顯示「4」。現在 `worker/app.ts` 十字交乘的送出回應多帶 `serverNow`（`syncClock` 本來就會讀），收到判定時馬上校正時間差。這個欄位只有時間戳，不含答案。

### NIT watchCool() → 修好
- `tests/e2e/cross-live.spec.ts`：抽成 `watchCoolOn(page)`，把 animation frame 存在 `window.__coolRaf`，再呼叫一次會先取消上一個；倒數出現過又收起（或元素消失）就停止，不會疊好幾個循環。

### 測試
- `tests/e2e/cross-live.spec.ts`
  - `solve()`：有公因數選項、卡片還沒出現時，先選讓首項為正的 k（卡片在那之後才有 `data-value`）。
  - 先提公因式、首項為負：選公因數前、選正的公因數後（第 2 步）都確認**沒有** `.xl-card-btn`、`[data-value]`、`.xl-slot.fixed`、帶 `data-action` 的格子，`xl-tray-wait` 有出現。接著自己做出帶 `data-action="xl-card"`／`"xl-slot"` 的按鈕，把正解四張卡點進去（繞過畫面，直接打處理函式），再選對提出負號：四格仍然是空的、卡片都沒有用過。之後才放卡完成十字圖，送出由伺服器判對。
  - 新增「重新整理後由伺服器重建冷卻；送出 429 時重新同步」：答錯後馬上 `reload` → `data-mode="cool"`、倒數 1–3、「下一題（N 秒）」停用且帶 `data-xl="next"`、沒有送出鈕與卡片 → 倒數完自動拿到題目。接著用 `route.fetch()` 讓伺服器真的判錯，但回給 iPad 429 → 這次 429 之後有 `GET /api/student/session`（重新同步）、畫面進入 `cool` 倒數（第二次連錯，2–4）→ 解除。
  - 冷卻測試的長度改用送出回應裡的 `mine.cool − serverNow` 檢查（第一次在 2.5–3 秒之間、第二次在 3.5–4 秒之間）；畫面倒數嚴格等於 `['3','2','1']` 和 `['4','3','2','1']`。

### 執行結果（修正後）
- `npm run typecheck`：通過。
- `node --test tests/*.test.mjs`：195 項，194 通過，1 失敗。失敗的是已知、和這次無關的 `C-3`（g8-2-3c 魔王戰 topic 對應）；這一輪 unit-quiz odd-records 沒有失敗。
- `CROSS_SHOTS=1 PW_CHANNEL=msedge npx playwright test tests/e2e/cross-board.spec.ts tests/e2e/cross-duel.spec.ts tests/e2e/cross-live.spec.ts`：**45 passed**（大板 18、對戰 16、連線 11）。
- 兩個冷卻測試另外用 `--repeat-each 3 --workers 1` 跑：6/6 通過。用 `--workers 4` 重複跑會失敗，因為同一班同一座號的副本同時開課、互相干擾，這種跑法本身不成立，和程式無關。
- `npx vite build`：通過（只有既有的 chunk 大小提醒）。
- 截圖只寫到 `artifacts/cross-2026-11-18c/`（`live-gcf-step2.png` 現在是選好提出負號、十字圖放好卡之後的畫面），共 31 張。沒有跑 `ipad.spec.ts`、`duel.spec.ts`，沒有設 `MCK_SHOT_DIR`。
- 動到的檔案：`src/cross-live.ts`、`src/cross-live.css`、`worker/app.ts`（十字交乘送出回應多一個 `serverNow`）、`tests/e2e/cross-live.spec.ts`、`docs/CROSS.md`、`CHANGELOG.md`、本檔。沒有 commit、push、部署。
