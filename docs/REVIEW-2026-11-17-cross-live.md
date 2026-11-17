# 審核紀錄 2026-11-17：十字交乘・全班連線對戰（第二階段）

基準：`main` @ a160140（第一階段大板操作）。未 commit、未 push、未部署。

## 檔案

新增
- `worker/cross.ts`：伺服器端的對戰邏輯。每人發題（`issueItem`，種子 = `crossSeed(場次秘密 ^ 座號雜湊, 等級, 第幾題)`，避開同學目前的題目與自己最近 30 題）、iPad 卡片（`liveCards`：正解＋2 張干擾卡，伺服器打亂並重新編號）、L3 公因數選項（`kOptions`）、送出驗證與判定（`submitCross`，用 `shared/cross.ts` 的 `crossJudge`）、計分（`crossPoints`）、升級、拔河（`crossTeams`、門檻獲勝）、時間到（`crossCheckOver`）、暫停（`crossPause`）、老師畫面／學生畫面（`crossView`）、公布（`crossReveal`）、CSV（`crossCsvRows`）。
- `src/cross-live.ts`：老師大螢幕（排行、答對／作答、拔河、最近送出＋公布）、老師控制區、遊戲頁卡片、學生作答卡（點卡片 → 點格子、送出、判定中、✓／✗、下一題）、送出／拿題（`fetchNext`、`submit`，畫面＋課堂＋場次＋題目防護）、推送合併（`mergeCrossPush`）。
- `src/cross-live.css`：只用 `.xl-*`、`#cross-live-host`、`.student-room.xl-on`。
- `tests/cross-live.test.mjs`、`tests/e2e/cross-live.spec.ts`。

修改
- `shared/types.ts`：`Session.cross`、`SessionView.cross`，新型別 `CrossRun`、`CrossLiveItem`、`CrossLiveResult`、`CrossLiveRow`、`CrossLiveView`。
- `worker/app.ts`：`StoredSession` 加 `CrossStore`；`endCross`／`closeCross`；控制指令 `cross-start`、`cross-pause`、`cross-team`、`cross-end`、`cross-reset`、`cross-close`；路由 `/api/sessions/:id/cross`（學生 `next`／`submit`，老師 `reveal`）；`sessionView` 加 `view.cross`；開測驗／PK／魔王戰／步驟格鬥與結束課堂時一併結束對戰；課堂匯出 JSON 加 `crossRuns`、CSV 加每一次送出。
- `src/main.ts`：import 與 `initCrossLive`；課堂舞台加 `#cross-live-host`（老師）；學生面板在對戰中顯示作答卡、`app` 加 `xl-on`；老師工具列加「十字交乘對戰」按鈕與控制區；`viewSignature` 加對戰的場次／結束／暫停／拔河；推送時 `mergeCrossPush`＋`refreshCross`（每 0.5 秒也更新時間）；`action()` 把 `xl-*` 交給 `crossAction`；遊戲頁加「全班連線對戰」卡片；`./math` 多 import `tex`。
- `docs/CROSS.md`（新的一節〈全班連線對戰〉）、`CHANGELOG.md`（2026-11-17 條目追加）。

沒有動到：`shared/cross.ts`（照原樣共用，沒有分叉產生器）、第一階段大板、測驗／PK／魔王戰／步驟格鬥／作業的判定與畫面。對它們唯一的行為差異：開這些活動時會順便收起進行中的十字交乘對戰（沒有對戰時完全不變）。

## 設計決定

1. **對戰掛在課堂上**（像步驟格鬥），不綁課程、不需要題庫：任何一課上課中都能開。學生走平常的學生入口，不用另外登入。入口有兩個：課堂老師工具列、遊戲頁（選上課中的課堂）。
2. **答案只在伺服器**：`session.cross`（學生看得到）只有設定、分隊、時間、勝負；題目種子、卡片、送出紀錄、場次秘密在 `StoredSession.crossPlay`，從不序列化給學生。學生的題目只有原式係數、卡片（id／種類／數字）、左欄是否固定、L3 k 選項。題目在伺服器用 `crossItem(seed, level)` 重算，不存答案欄位。
3. **送出用卡片 id**，不是數字：伺服器確認每格的卡片是這一題發出去的、沒有重複、種類對欄；L3 的 k 必須是選項之一；格式錯 400 且不算作答。`itemId` 必須是目前這一題，送出後立刻清掉（重送 409）。
4. **iPad 卡片數**：左欄固定 4 張（2 正解＋2 干擾，優先正負號放反）；要放 x 係數卡 6 張（4 正解＋常數 1、x 係數 1 干擾）。
5. **L3 提公因數是一步選擇**：學生從 2–3 個選項選 k（k、−k、一個真因數或 1），選了才解鎖十字圖；選錯判 `reason: 'k'`。
6. **計分**：基本分（100／130／160）＋速度（伺服器量發題 → 送出，10 秒內 50，40 秒 0，線性）＋連對（+10n，最多 50）；答錯 0 分、不扣分、連對歸零。同級連對 3 題升級，可鎖定。下一題要學生按「下一題」才發，看結果的時間不算進速度。暫停時把限時與每個人目前這一題的發題時間往後延。
7. **拔河比平均分**（兩隊人數不同也公平），分隊沿用步驟格鬥的 `duelTeams`（依程度蛇形）與「晚到分到人少的一隊」；平均分差 ≥ 門檻即獲勝，時間到比平均分。繩結只改 `transform`（`cqw`、有 transition）。
8. **重新開始 = 新的一場**（新 id，設定與分隊保留），舊場次紀錄留著（CSV 看得到）。
9. **先顯示再同步**：送出時把已放的格子標成中性灰色「已送出／判定中」、整張卡鎖住，不在本機判對錯；回應回來換成官方 ✓／✗。失敗（網路／被拒）拿掉判定中、解鎖、卡片留著；409 時另外重新同步。防護：`pending` 記 `routeVersion`＋課堂＋場次＋題目，回應對不上就丟掉；推送 revision ≤ 自己的作答回應時，題目與分數以本機為準。
10. **不跳動**：作答卡只有在 `crossCardKey`（場次、模式、題目 id、隊伍）改變時重畫；推送只改分數／連對／等級／名次／拔河／時間文字。自己的點選只換十字圖與卡片匣（尺寸固定）。老師排行固定 10 列。對戰中學生的教材欄收起，作答卡佔滿畫面（iPad 直向不用捲動）。
11. **限速**：拿題後到送出、兩次送出至少 0.3 秒（429）；拿題本身是冪等的（已有題目就回同一題），不限速。

## 測試指令與結果

| 指令 | 結果 |
|---|---|
| `npm run typecheck` | 通過（23 份課程 0 錯誤；tsc 無錯誤） |
| `node --test tests/cross-live.test.mjs` | 5/5 通過 |
| `node --test tests/*.test.mjs` | 149 個，147 通過、2 失敗：已知的 C-3（`backend.test.mjs`，g8-2-3c／g9-2-1c raidTopics）與已知時好時壞的 unit-quiz odd-records（`unit-quiz.test.mjs:188`），都和這次無關，沒有動 |
| `PW_CHANNEL=msedge MCK_PORT=8797 npx playwright test tests/e2e/cross-live.spec.ts tests/e2e/cross-board.spec.ts tests/e2e/optimistic-select.spec.ts tests/e2e/optimistic-late.spec.ts` | 20/20 通過（cross-live 3、cross-board 11、optimistic-late 3、optimistic-select 3） |
| `npx vite build` | 通過（只有原本就有的 chunk 大小提醒） |

沒有跑 `duel.spec.ts`、`ipad.spec.ts` 或其他會寫 `artifacts/screenshots/` 的 spec（照任務要求，由協調者另外備份後跑）。

`tests/cross-live.test.mjs` 內容：
- iPad 卡片：每級 400 題，張數＝正解＋2、x 係數卡 0 或 3 張、標準答案用發出去的卡片判對；k 選項含 k、不重複。
- 計分公式（速度遞減、連對上限）。
- 四位同學題目都不同；拿兩次是同一題；學生 HTTP 回應與 `liveView` 推送送出前不含 `factored`／種子／`crossPlay`／`inner`／`p`、`q`…欄位與因式分解字串；學生拿不到老師的排行。
- 不是這題的卡、同一張卡兩次、少格、x 係數格放常數卡、多餘的鍵、字串、直接送數字 → 400，不算作答；舊 itemId → 409；答對、重送 409、上下兩列對調判對、拿題後馬上送出 429、連對 3 題升 L2（L2 6 張卡）、答錯 0 分不扣分且送出後才有因式分解；老師排行、答對／作答、最近送出沒有因式分解、公布才有；學生不能公布；舊 runId 409。
- 老師控制：L3＋鎖定（k 不在選項 400、選錯 `reason: 'k'`、連對 3 題仍 L3）、暫停（拿題／送出 409；繼續後限時與發題時間往後延）、時間到 409、重新開始（新場次、分數歸零、舊紀錄留著）、CSV 有對戰列、結束、收起。
- 拔河：開始時 4 人兩兩分隊、晚到的分到一隊、兩隊總分、學生看得到兩隊總分看不到排行、平均分差到門檻才結束且勝隊正確、結束後 409；開戰後才開拔河會把已在玩的人分隊。

`tests/e2e/cross-live.spec.ts` 內容：
1. 老師開課 → 工具列「十字交乘對戰」→ L1、紅藍拔河、門檻 800 → 開始；兩台 iPad（820×1180、`hasTouch`，不同 context，座號 31、32）自動拿到題目、題目不同、隊伍不同。測試從畫面上的原式與卡片自己算答案（列舉擺法＋`crossJudge`），不讀伺服器答案。A 送出時伺服器延遲 1.2 秒：看到 `data-mode=pending`、「已送出／判定中…」、灰色格子、送出鈕停用、沒有 ✓／✗，之後才是官方 ✓、綠色格子、因式分解、分數、連對 1。送出前檢查兩位學生收到的**所有 /api 回應與 WebSocket 訊息**：沒有 `"factored"`、`crossPlay`、種子，也沒有兩種順序的因式分解字串。老師排行第一是 31 號、答對／作答 1 / 1，繩結往 A 的隊伍移動。B 在 A 得分時：拔河分數更新，但題目與卡片匣節點沒換（記號還在）、`scrollY`／面板捲動不變、已放的卡還在。B 收回一張卡、送出錯的：官方 ✗、紅色格子、分數 0；老師 1 / 2。老師「公布」A 的第一題。A 再答對兩題：連對 3、升到 L2（6 張卡）、繩結更靠近 A 的隊伍。暫停／繼續、結束（學生看到結算、大螢幕勝負橫幅）。
2. 送出失敗（攔截中止）：判定中消失、解鎖、卡片留著；送出很慢時老師按「重新開始」：學生拿到新一場的題目，晚到的回應不蓋掉、分數 0、沒有 ✓／✗。
3. 遊戲頁入口：選上課中的課堂 → 開始對戰 → 跳到課堂、大螢幕出現；學生自動拿題（沒開拔河，沒有隊伍標籤）。

## 截圖（`artifacts/cross-2026-11-17/`，跑 `cross-live.spec.ts` 產生）

- `live-student-ipad-question.png`：學生 iPad 直向，題目、十字圖、卡片匣、分數、拔河條
- `live-student-pending.png`：送出後「已送出／判定中」（灰色、鎖住）
- `live-student-correct.png`：官方 ✓、得分明細、因式分解
- `live-teacher-leaderboard.png`：老師大螢幕排行、答對／作答、最近送出
- `live-team-tug-of-war.png`：紅藍拔河繩結移動、公布後的因式分解

第一階段的 7 張截圖沒有覆蓋（新的都以 `live-` 開頭）；沒有寫 `artifacts/screenshots/`。

## 已知限制

- 對戰紀錄存在課堂裡（跟著課堂封存、CSV 匯出看得到），但不進學習紀錄頁、不在 `/api/backup` 備份；匯出 JSON 只有場次設定（`crossRuns`）。
- 時間到之後若沒有人再送出、老師也沒按結束，`crossRuns` 裡那一場的結束時間要等「結束這一場」／「關閉」／結束課堂才寫入（畫面照樣顯示已結束、拒絕作答）。
- 學生端只有點選放卡（沒有拖曳）；實機 iPad Safari 沒有測，e2e 是 Edge 的觸控模擬。
- 學生看不到全班排行（只有自己的名次與兩隊總分）；大螢幕排行只列前 10 名。
- 限速以每位學生「拿題 → 送出」「送出 → 送出」0.3 秒為準；拿題不限速（冪等）。
- 沒有接 Codex 審查（照任務只做建置）；未 commit、未 push、未部署。上層專案的 `handoff.md` 在這個 repo 外，沒有更新。

## Codex review fixes（第 3 輪審查：REJECT → 全部修正）

審查檔：`%TEMP%\mck-cross\codex-review3-final.md`（2 個 BLOCKER、7 個 SHOULD-FIX）。這一輪全部修正，未 commit、未 push、未部署。

| # | 問題 | 修正 | 檔案 | 測試 |
|---|---|---|---|---|
| B1 | L3 公因數選項 `{k, −k, 同號因數}` 直接洩漏答案 | 改成固定的 −5～5（不含 0）共 10 個、順序固定（`CROSS_K_OPTIONS`），每一題都一樣；L3 一律有公因數步驟（`seat.level === 3`），送出時一律要 k | `worker/cross.ts`、`src/cross-live.css`（10 個按鈕兩列） | 3000 題選項完全相同（多重集合、正負號、位置）；「互為正負一對＋同號」「絕對值最大」「第一個／最後一個／中間」等只看選項的猜法都不超過最佳常數猜法＋2%、且 < 35%；正解位置分散 |
| B2 | 舊的拿題／送出 HTTP 回應會蓋掉較新的題目與判定 | 本機狀態以「路由＋課堂＋場次」為範圍、世代（`gen`）管理；拿題回應比對世代、revision、已送出題目（`done`）；送出回應比對世代、判定中、`itemId`；推送不會把已送出的題目裝回去 | `src/cross-live.ts` | e2e：第一次拿題伺服器處理完、推送先到、HTTP 回應晚 5 秒（`route.fetch()` 後延遲 `fulfill`）——學生先用推送的題目送出得到 ✓，晚到的回應不改題目、不清判定、不改分數；送出伺服器已判定、推送先到、回應晚 2.5 秒——一直是判定中，回應到了才顯示 ✓，答對／作答 2/2（不會 3/3） |
| S1 | 盲猜成本太低 | 答錯冷卻 1.5／3／5 秒（連錯遞增，答對歸零，冷卻中拿題、送出 429）；每分鐘最多送出 15 次；L1 < 2 秒、L2 < 3 秒、L3 < 4 秒的答對沒有速度分；學生端「下一題（N 秒）」灰色倒數 | `worker/cross.ts`、`worker/app.ts`、`src/cross-live.ts`、`src/cross-live.css` | 單元：冷卻 1.5／3／5／5 秒、冷卻中 429、學生畫面有 `mine.cool`、答對後清除、太快沒有速度分、每分鐘上限 429 且不算作答、一分鐘前的不算；e2e：答錯後「下一題」停用倒數，1.5 秒後恢復 |
| S2 | 冪等 `next` 仍加 revision、保存、推送 | 已有題目直接回傳，不加 revision；只有第一次分隊（加 revision）或出席時間超過 30 秒（只保存）才寫入；其他回 `X-Classroom-Quiet`，`worker/index.ts` 不廣播；拿題記憶體內限速 0.25 秒 | `worker/app.ts`、`worker/index.ts`、`worker/cross.ts` | 單元：重複拿題 revision 不變、`quiet`、0.25 秒內再拿 429 |
| S3 | 推送先到時前端重複 +1 | 送出回應帶伺服器算好的 `mine`（分數、連對、答對、作答、等級、冷卻），前端直接指派 | `worker/cross.ts`、`shared/types.ts`、`src/cross-live.ts` | 單元：`mine` 內容；e2e：推送先到仍是 2/2 |
| S4 | 換路由／課堂後 `revision`、`fetching`、`pending` 沒清 | `resetCrossLocal(scope)` 清掉全部並世代加一；`fetching` 改成請求記號（舊請求 `finally` 對不上就不清）；送出因範圍不符提早返回時一定清掉自己的判定中 | `src/cross-live.ts`、`src/main.ts` | e2e：舊課堂 revision 衝高 30 次後下課、同班開新課堂再開對戰，學生跟過去拿到新題、送出 ✓、1/1 |
| S5 | 公布用會位移的索引；CSV 只剩最後 30 筆 | 新增每一場的送出紀錄 `crossPlay[場次].log`（題目 ID、這位同學第幾題…），上限 2400 筆／場、丟最舊的並記 `dropped`、CSV 多一列說明；`past` 仍限 30 題只用來避開重複；最近送出、公布、前端快取都用題目 ID（快取鍵＝場次＋題目 ID）；匯出 JSON 加 `crossLog` | `worker/cross.ts`、`worker/app.ts`、`src/cross-live.ts`、`shared/types.ts` | 單元：35 題 → `past` 30、log 35、n＝1…35、最近 8 筆的 ID、第 1 題仍可公布、別人的座號 404、CSV 35 列、JSON 35 筆（含因式分解、不含種子）、上限時丟最舊 1 筆並有說明列 |
| S6 | 限時到期沒有伺服器結算 | Durable Object alarm 多工：`ctx.scheduleCross` 記下到期時間（storage `cross-due`）、alarm 排最早的；`alarm()` 先跑回家作業批改，再在佇列內 `settleCrossSession`（結束時間、勝負、`crossRuns`、revision＋1、保存、推送），下一次叫醒取兩者較早的（`kickHomework` 把 alarm 提早也沒關係，alarm 會重排）。保險：用戶端到期送 `op: 'settle'`（冪等）；到期後才到的請求也先結算保存再回 409（`X-Classroom-Changed` 觸發推送）。空隊規則統一：兩隊都有人才可能提前獲勝；時間到／老師結束時沒有人的隊伍不會獲勝，一隊有人且平均分 > 0 才獲勝，兩隊都沒人或同分平手 | `worker/index.ts`、`worker/app.ts`、`worker/cross.ts`、`src/cross-live.ts`、`src/main.ts` | 單元：開始／暫停／繼續／結束時排程正確、彈幕不重排、未到期 settle 不變且 quiet、到期結算一次（revision＋1、`crossRuns` 有結束時間）再呼叫不變、晚到的送出 409＋changed 且已保存；空隊各種情況；e2e：擋掉所有用戶端 settle，12 秒限時閒置，alarm 準時結束（老師橫幅、學生結算、`endedAt＝deadline`、revision 增加、匯出的 `crossRuns` 有結束時間） |
| S7 | 測試沒涵蓋安全與競態 | 新增上述測試；另外學生呼叫 7 個 `cross-*` 控制全部 403、場次不變；學生匯出 JSON／CSV 403；學生 reveal 400；同一題同時送兩次：單元經模擬佇列、e2e 經真正的 Durable Object 佇列（`Promise.all` 兩個 fetch），只判一次 | `tests/cross-live.test.mjs`、`tests/e2e/cross-live.spec.ts` | — |

### 這一輪的測試結果（2026-11-17）

| 指令 | 結果 |
|---|---|
| `npm run typecheck` | 通過 |
| `node --test tests/cross-live.test.mjs` | 12/12 通過 |
| `node --test tests/*.test.mjs` | 156 個，155 通過、1 失敗：已知的 C-3（g8-2-3c／g9-2-1c raidTopics，和這次無關）；unit-quiz odd-records 這次通過 |
| `PW_CHANNEL=msedge npx playwright test tests/e2e/cross-live.spec.ts` | 6/6 通過（8787 沒被占用，沒有改用 8797） |
| `PW_CHANNEL=msedge npx playwright test tests/e2e/cross-board.spec.ts tests/e2e/optimistic-select.spec.ts tests/e2e/optimistic-late.spec.ts` | 17/17 通過 |
| `npx vite build` | 通過（只有原本就有的 chunk 大小提醒） |

沒有跑 `duel.spec.ts`、`ipad.spec.ts`。`live-*.png` 五張截圖在 `artifacts/cross-2026-11-17/` 重新產生（學生統計列多了「答對 c/a」）；沒有寫 `artifacts/screenshots/`。

### 更新後的已知限制

- 上面〈已知限制〉第 2 點（時間到要等老師按結束才寫入 `crossRuns`）已經解決（alarm＋settle）；「匯出 JSON 只有場次設定」也已經解決（`crossLog`）。
- 拿題限速在記憶體裡，Durable Object 重啟就清空（冷卻與每分鐘上限存在課堂裡，不受影響）。
- 送出紀錄每場上限 2400 筆，超過會丟最舊的（CSV 有說明列）。
- alarm 在本機 `wrangler dev` 驗證過；正式環境的 Durable Object alarm 沒有實測。

## Codex re-review fixes（第 4 輪審查：REJECT → 2 個 NEW BLOCKER、3 個 SHOULD-FIX、1 個 NIT 全部修正）

審查報告：`%TEMP%\mck-cross\codex-review4-final.md`。

| 編號 | 問題 | 修正 | 檔案 | 測試 |
|---|---|---|---|---|
| NB1 | alarm 先 `await drainHomework()`（單次 AI 最長 150 秒）才結算到期的對戰 | `alarm()` 一叫醒就先 `settleCross()`；批改改成和「對戰檢查迴圈」並行：批改進行中每 1 秒（`CROSS_TICK`）或到期時間一到就再結算一次，也接得住批改期間才開始的限時對戰；批改結束後再結算一次、下一次叫醒取兩者較早。`settleCross` 沒有到期的就不讀課堂（迴圈很便宜）。批改的租約、提交防護、寫回順序都沒改 | `worker/index.ts` | 單元（真正的 `ClassroomDurableObject`）：AI 的 `fetch` 卡住不放、1 秒限時對戰——AI 還在批改時對戰已結算並保存（匯出 `crossRuns` 的結束時間＝deadline、排程已移除），放行後作業 `graded`、`submissions` 1、AI 只呼叫 1 次；再叫醒一次不重批、revision 不變 |
| NB2 | 先從 `cross-due` 取消排程、後保存課堂；保存失敗就再也不會結算 | 排程改成「只加不減」：`scheduleCross(id, null)` 不動排程；`scheduleCross(id, at)` 在保存前呼叫、同一堂取較早時間（保存失敗只會多叫醒一次）。移除只在 alarm 讀到**已保存**的課堂確認沒有到期時間（暫停、結束、收起）或結算**保存成功後**才做；結算保存失敗時整份排程不動、5 秒後再試 | `worker/index.ts`、`worker/app.ts`（`scheduleCross` 說明） | 單元（Durable Object＋故障注入 `sess:*` 寫入失敗）：暫停的保存失敗 → 排程還在 → 到期 alarm 結算並保存；多叫醒一次沒有變更；結算的保存失敗 → 排程還在、5 秒內重試 → 下一次 alarm 結算；暫停（已保存）時叫醒不結束、移除排程，繼續後重新排 |
| SF1 | `crossView()` 會改 `run.endedAt`，學生出席更新順手存進去，正式結算就跳過 `crossRuns` | 新增唯讀的 `crossExpired`／`crossOver`；`crossView()` 不改資料，時間到但未結算時只在回傳的畫面上顯示結束；老師控制指令開頭先 `settleCrossSession`（走結算路徑），暫停／分隊的檢查改用唯讀的 `crossOver` | `worker/cross.ts`、`worker/app.ts` | 單元：到期後老師／學生畫面顯示結束、儲存的資料完全沒變；學生出席更新後保存的對戰沒有結束；正式結算後 `crossRuns` 有結束時間、revision＋1；到期後按暫停 409，下一個保存的控制指令把結束（含 `crossRuns`）一起存進去 |
| SF2 | 首次繪製沒有先 `ensureScope()`，同一場往返時會先畫出舊的判定中／判定 | `loadStudent()` 指派 view 後先 `crossEnsureScope(view)` 再繪製；`crossCardKey()`／`crossCardHtml()` 開頭都 `ensureScope(H.view())`；判定也記世代（`result.gen`），讀 pending／result 一律比對世代＋場次 | `src/cross-live.ts`、`src/main.ts` | e2e：送出後回應卡住、換路由回到同一堂同一場——回來後畫出的每一張卡片都不是 pending／result，拿到新題；放行舊回應後仍是新題、沒有 ✓／✗／判定中，答對／作答 1/1（伺服器只判一次）。把修正拿掉時這個測試會失敗（`pending:…` 被畫出來），已確認 |
| SF3 | 每場有上限，但整堂課跨場次累積沒有上限 | `crossPrune()`（開始／重新開始時）：最近 3 場保留逐題紀錄與每人最近題目，更早的封存成每人總計（`archived`），最多 30 場；CSV／JSON 對封存的場次輸出總計 | `worker/cross.ts`、`worker/app.ts`、`docs/CROSS.md` | 單元：連開 6 場（每場 2400 筆）→ 前 3 場封存（沒有 log、`dropped` 2400、`past` 空、總計保留），後 3 場完整；CSV 有封存說明列與總計列，JSON 有 `totals`；90 場 → 剩 30 場、只有 3 場完整、整體 < 2 MiB；之後結算照常 |
| NIT | 公布端點座號上限 99 | 改用該班的座號數（和登入、班級設定一樣最多 100） | `worker/app.ts` | 單元：100 人的班，座號 100 送出後公布 200；座號 101 → 400 |

### 這一輪的測試結果（2026-11-17）

| 指令 | 結果 |
|---|---|
| `npm run typecheck` | 通過 |
| `node --test tests/cross-live.test.mjs` | 17/17 通過 |
| `node --test tests/*.test.mjs` | 161 個，159 通過、2 失敗：已知的 C-3（g8-2-3c／g9-2-1c raidTopics，和這次無關）；unit-quiz「class and PK unit quizzes」（已知的 odd-records 偶發，單獨重跑 2 次都通過） |
| `PW_CHANNEL=msedge MCK_PORT=8797 npx playwright test tests/e2e/cross-live.spec.ts tests/e2e/cross-board.spec.ts tests/e2e/optimistic-select.spec.ts tests/e2e/optimistic-late.spec.ts tests/e2e/homework.spec.ts` | 33/33 通過（新的往返測試第一次寫法把換路由前那張卡片的時鐘更新也算進去而失敗，改成只記新畫出的卡片後通過；之後 cross-live＋cross-board 再跑一次 18/18） |
| `npx vite build` | 通過（只有原本就有的 chunk 大小提醒） |

`homework.spec.ts` 只在設了 `MCK_SHOT_DIR` 時才寫截圖，這次沒設，所以不會寫到 `artifacts/screenshots/`。沒有跑 `duel.spec.ts`、`ipad.spec.ts`。

### 更新後的已知限制

- 批改期間的對戰檢查是每 1 秒一次的計時器（在 alarm 執行期間）；Durable Object 在批改期間被重啟時，靠下一次 alarm（作業租約到期、或 `cross-due` 的時間）接手。
- 排程「只加不減」：暫停、結束後可能多叫醒一次（只讀一下排程與課堂，沒有變更、不推送）。
- 較早的場次（第 4 場以前）只剩每人總計：不能再「公布」那幾場的題目，CSV 也沒有逐題紀錄。
- alarm 在單元測試（真正的 `ClassroomDurableObject`＋記憶體儲存）與本機 `wrangler dev` 驗證；正式環境的 Durable Object alarm 沒有實測。


## Codex review 5 fixes（2026-11-17）

審查報告：`%TEMP%\mck-cross\codex-review5-final.md`（Verdict：REJECT，1 個 blocker、2 個 should-fix）。

| 編號 | 問題 | 修正 | 檔案 | 測試 |
|---|---|---|---|---|
| NB1 | alarm 收尾只保留「還沒到期」的排程：drain 結束後才送出的作業排了 50ms 後的喚醒，收尾讀到時已過期，就被較晚的對戰期限蓋掉，作業延到對戰期限才批改 | 收尾的「讀排程＋比較＋設定」放進同一個佇列（`enqueue`），和送出作業時的 `kickHomework`（在請求的佇列工作裡）序列化；handler 期間讀到的排程一律視為新排的：比下一次叫醒早（含已過期）就保留，已過期就設成現在馬上叫醒；只有比它晚的才改成較早的時間 | `worker/index.ts` | 單元 `R5-NB1`（真正的 `ClassroomDurableObject`）：60 秒後的對戰期限；最後一次結算時才送出作業，讀排程前已過 80ms → 收尾後排程 ≤ 現在（沒被改成對戰期限）、這次沒有批改；叫醒後作業 `graded`、AI 1 次；沒有工作後排回對戰期限 |
| SF1 | 結算保存成功、清理 `cross-due` 寫入失敗 → 推送不會執行，重試時場次已結束（沒有變更）也不推送 | 保存成功後**立刻**安排推送，再清理排程 | `worker/index.ts` | 單元 `R5-SF1`（故障注入 `cross-due` 寫入失敗）：結算已保存、排程還在、有推送；重試只清理排程 |
| SF2 | 平均分先取整再判勝／判門檻（3 對 3 總分 501 vs 502 判成平手；差 299.67 取整成 300 提前獲勝） | 新增 `crossAvgGap`：紅總分×藍人數 − 藍總分×紅人數（交叉相乘），判勝看正負、門檻比 `margin × 紅人數 × 藍人數`；單隊時看總分 > 0。`avg` 取整只給畫面（拔河位置、隊伍分數） | `worker/cross.ts` | 單元 `R5-SF2`：501 vs 502（畫面都是 167）藍勝、相反紅勝、相同平手；門檻 300：899 vs 0（畫面 300）不算、900 算；2 對 3 人數不同的門檻邊界 |

把三個修正拿掉時，三個新測試都會失敗（已確認），修正後都通過。

### 這一輪的測試結果

| 指令 | 結果 |
|---|---|
| `npm run typecheck` | 通過 |
| `node --test tests/cross-live.test.mjs` | 20/20 通過 |
| `node --test tests/*.test.mjs` | 164 個，163 通過；唯一失敗是已知的 C-3（g8-2-3c／g9-2-1c raidTopics，和這次無關） |
| `PW_CHANNEL=msedge MCK_PORT=8797 npx playwright test tests/e2e/cross-live.spec.ts tests/e2e/homework.spec.ts` | 16/16 通過（沒設 `MCK_SHOT_DIR`；沒有跑 duel／ipad） |
| `npx vite build` | 通過（只有原本就有的 chunk 大小提醒） |

已知限制補充：單元測試的記憶體 alarm 不會在觸發後自動清空（Cloudflare 會），測試在模擬「被叫醒」前手動清空；收尾邏輯依 Cloudflare 文件「handler 期間 `getAlarm()` 只回傳期間新設的 alarm」設計，正式環境沒有實測。
