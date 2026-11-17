# 複審 1（Codex review 4）

## Verdict：REJECT

前次 9 項問題中，6 項已修正，3 項仍有缺口。共用 alarm 的到期處理與保存順序需要修正。

本次未修改檔案、未執行 Playwright。指定 Node 測試 **111／112 通過**；唯一失敗為 C-3 題庫對應檢查，相關題庫不在此次差異中。`npx tsc --noEmit` 通過。以下新增問題依原始碼流程判定。

## 前次問題狀態

| 編號 | 問題 | 狀態與依據 |
|---|---|---|
| B1 | L3 選項結構洩漏 k | **已修正**：固定 −5～5、不含 0，各題順序相同；結構測試通過。`worker/cross.ts:118` |
| B2 | 舊 HTTP 回應覆蓋新題／判定 | **已修正主要交錯情境**：加入世代、revision、已提交題目集合與 pending 身分檢查。`src/cross-live.ts:407`、`:454`、`:490` |
| S1 | 跨題盲猜成本過低 | **已修正**：遞增冷卻、每分鐘 15 次預算及速度分門檻；冷卻與提交紀錄隨課堂保存。`worker/cross.ts:232` |
| S2 | 冪等 next 持續寫入／廣播 | **已修正**：已有題目不增加 revision；一般重取回 quiet，另有 250ms 限速。`worker/app.ts:2350` |
| S3 | 推送與 HTTP 重複累加統計 | **已修正**：直接指派伺服器 `mine`。`src/cross-live.ts:466` |
| S4 | 路由切換清理不完整 | **部分修正**：重設內容完整，但直接載入／首次繪製未先檢查 scope，見下方 SHOULD-FIX 2。 |
| S5 | 公布索引位移、CSV 遺失紀錄 | **已修正原問題**：不可變 item ID、獨立 log、2400 筆上限及丟棄說明；整堂課容量仍有缺口。`worker/cross.ts:291`、`:374`、`:394` |
| S6 | 閒置到期無可靠保存／推送 | **未完全修正**：新增 alarm，但仍會延遲或失去排程；另有結算被畫面函式繞過的情況。空隊規則已統一。 |
| S7 | 安全與競態測試不足 | **部分修正**：新增權限、容量及交錯測試；尚未涵蓋慢速作業批改與對戰共用 alarm、取消排程後保存失敗。`tests/cross-live.test.mjs:593` 主要測的是結算函式，並非實際共用 alarm。 |

未發現新增的學生匯出／公布權限繞過；題目、卡片與學生推送未直接包含種子或標準答案。既有 quiz／PK／raid／duel／homework 測試除上述 C-3 外通過，但這不涵蓋新增活動的所有切換情境。

## NEW BLOCKERS

1. **[P1] alarm 等整批作業批改完成，才處理已到期對戰。**  
   [worker/index.ts:143](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:143>)、`worker/app.ts:3184`、`:3257`  
   `alarm()` 先 `await drainHomework()`，之後才執行 `settleCross()`。前者逐份處理佇列，單次 AI 呼叫可等待 150 秒；即使 alarm 正好在對戰期限觸發，官方結算、保存與推送仍可能延後數分鐘。最後才計算兩者最早時間，無法補救已經錯過的期限。  
   **修正要求：**讓到期結算與喚醒排程不必等待整批外部 AI 呼叫；保留作業租約與提交防護，補慢速 AI、期限交錯及作業恰好完成一次的測試。

2. **[P1] 先取消到期排程、後保存課堂；保存失敗會失去可靠喚醒。**  
   [worker/app.ts:1986](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1986>)、`:2325`、`:2377`；`worker/index.ts:165`  
   例如暫停請求先成功從 `cross-due` 移除課堂，接著 `save()` 寫入失敗：持久資料仍是進行中的限時對戰，排程卻已取消。原 alarm 即使觸發，也因 due 清單已空而不結算。到期 settle／門檻勝利路徑也有相同順序。  
   **修正要求：**讓狀態與排程一致提交，或能從已保存的場次可靠重建排程；加入取消成功、課堂寫入失敗的故障測試。

## SHOULD-FIX

1. **[P2] `crossView()` 修改結束狀態，會讓正式結算跳過場次紀錄更新。**  
   [worker/cross.ts:339](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/cross.ts:339>)、`worker/app.ts:459`、`:1527`  
   到期後，學生出席更新會執行 `save(sessionView(...))`；其中 `crossView()` 先設定 `run.endedAt`，卻未更新 `crossRuns` 或增加結算 revision。後續 alarm／settle 因 `run.endedAt` 已存在而直接返回，匯出場次仍可能沒有結束時間。  
   **修正：**畫面函式保持唯讀，所有到期變更集中走保存與推送流程。

2. **[P2，前次 S4 殘留] 首次繪製仍可能沿用上一個路由的 pending／result。**  
   [src/cross-live.ts:217](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/cross-live.ts:217>)、`src/main.ts:2790`  
   `loadStudent()` 直接指派 view 並繪製，`crossCardKey()`／`crossCardHtml()` 未先 `ensureScope()`，讀取 pending／result 時也只比 run ID。返回同一場次時，可能先顯示舊判定或舊「判定中」，直到新推送、互動或原請求完成才清理；沿用既有 WebSocket 時不保證立即有新推送。  
   **修正：**在路由切換或所有繪製入口先更新 scope，再讀取本機狀態；補同場次往返的在途請求測試。

3. **[P2] 每場 log 有上限，整堂課的累積容量沒有控制。**  
   [worker/app.ts:1763](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1763>)、`worker/cross.ts:295`  
   每次重新開始都永久保留舊場次的 log、各學生最近 30 題及其他狀態。多輪累積仍會撞上課堂 8 MiB 限制，使後續提交、結束等保存失敗；2400 筆／場無法保護整堂課容量。  
   **修正：**增加跨場次總預算及清理／封存政策，並確保接近容量上限時仍能保存結算。

## NITS

- **[P3] 公布端點排除了合法的 100 號學生。** `worker/app.ts:2333` 使用 `integer(body.seat, 1, 99)`，但班級與登入允許座號 100。應依該班合法座號範圍驗證。


# 複審 2（Codex review 5）

## Verdict：REJECT

前兩輪的主要修正已落實，但新增 alarm 收尾邏輯仍可能延後既有作業批改，未符合「共用排程不得延遲作業」要求。

本次未修改檔案、未執行 Playwright。指定 Node 測試 **116／117 通過**；唯一失敗為前次已有的 C-3 題庫對應檢查，相關題庫不在此次差異中。`npx tsc --noEmit` 通過。

## 前次問題狀態

| 編號 | 前次問題 | 本次核對 |
|---|---|---|
| R3-B1 | L3 選項洩漏 k | **已修正**：固定選項、固定順序，結構測試通過。`worker/cross.ts:77`、`:125` |
| R3-B2 | 舊 HTTP 回應覆蓋新題／判定 | **原交錯情境已修正**：世代、revision、題目 ID、pending 身分防護。`src/cross-live.ts:432`、`:469`；未重跑 e2e |
| R3-S1 | 跨題盲猜成本過低 | **已修正**：遞增冷卻、每分鐘 15 次、速度獎勵門檻；限制資料隨課堂保存。`worker/cross.ts:247`、`:284`、`:297` |
| R3-S2 | 重複 next 持續寫入／廣播 | **已修正**：已有題目不增加 revision；一般重取 quiet，另有限速。`worker/app.ts:2358` |
| R3-S3 | HTTP 與推送重複累加統計 | **已修正**：直接套用伺服器 `mine`。`src/cross-live.ts:481` |
| R3-S4 | 路由／課堂切換清理不完整 | **已修正原缺口**：首次載入與繪製入口先確認 scope，pending／result 比對世代。`src/main.ts:2797`、`src/cross-live.ts:73`；未重跑 e2e |
| R3-S5 | 公布索引位移、CSV 只剩 30 筆 | **已修正**：不可變 item ID、獨立 log、截斷與封存說明。`worker/cross.ts:309`、`:389`、`:437` |
| R3-S6 | 閒置到期缺少可靠保存／推送 | **部分修正**：正常結算、保存與空隊規則通過；仍有下述推送故障缺口 |
| R3-S7 | 安全與競態測試不足 | **原缺口已有補測**；新增排程交錯與清理失敗情境仍缺測 |
| R4-NB1 | 慢速作業批改阻擋到期結算 | **原問題已修正**：批改期間持續檢查對戰，實際 DO 類別測試通過。`worker/index.ts:156`、`:164` |
| R4-NB2 | 先取消排程，保存失敗後失去喚醒 | **已修正**：null 不立即移除，結算保存成功後才清理。故障測試通過。`worker/index.ts:186`、`:223` |
| R4-SF1 | crossView 修改持久狀態 | **已修正**：畫面函式唯讀，正式結算更新場次紀錄與 revision。`worker/cross.ts:355` |
| R4-SF2 | 同場往返首次繪製沿用 pending／result | **程式缺口已修正**：入口先確認 scope。`src/main.ts:2797`；新增 e2e 已閱讀，未執行 |
| R4-SF3 | 跨場次累積容量無上限 | **已修正原問題**：保留 3 場詳細資料、最多 30 場總計。`worker/cross.ts:414`；容量測試通過 |
| R4-NIT | 公布排除合法座號 100 | **已修正**：依班級座號上限驗證，測試通過。`worker/app.ts:2339` |

未發現新增的學生教師控制／JSON／CSV 匯出權限繞過，或直接傳回秘密種子、標準答案的路徑。指定的既有 quiz／PK／raid／duel／homework 測試除 C-3 外通過。

## NEW BLOCKERS

1. **[P1] alarm 收尾忽略已到期的新排程，可能把作業延到對戰期限才批改。**  
   [worker/index.ts:177](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:177>)，另見 `:173`、`:178`、`:402`。

   可發生以下交錯：`drainHomework()` 剛確認沒有工作；新作業隨後保存成功，`kickHomework` 排入 50ms 後的 alarm；目前 handler 的最後一次 `settleCross()` 尚在等待佇列或執行儲存操作。等到收尾讀取排程時，該 50ms 已過，`pending > Date.now()` 為假，於是覆寫成數分鐘後的對戰 deadline。新作業仍在佇列，卻失去立即批改的喚醒。

   這個過期時間不能視為目前 handler 留下的舊值：[Cloudflare 官方文件](https://developers.cloudflare.com/durable-objects/api/alarms/) 明確說明，handler 執行期間 `getAlarm()` 原本回傳 null，重新設定過才會回傳時間，而且同一物件一次只執行一個 alarm handler。

   **要求：**保留已到期的 pending 喚醒；最後的排程比較與更新應納入同一序列化流程。補「drain 已完成、新作業插入、pending 已過期、另有未來對戰期限」的測試。

## SHOULD-FIX

1. **[P2] 結算保存成功、排程清理失敗時，官方結算推送會永久漏掉。**  
   [worker/index.ts:223](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:223>)。

   `store.write(latest)` 成功後，若 `put(CROSS_DUE, kept)` 失敗，`:226` 的廣播不會執行。重試時場次已結束，`changed` 為 false，因此仍不廣播。持久資料正確，但閒置連線需要另外的用戶端同步或其他事件才能取得官方結果。

   **修正：**保存成功後即確保安排推送，讓排程清理失敗不會吞掉通知；補「課堂保存成功、cross-due 寫入失敗」測試。

2. **[P2] 平均分先四捨五入再判勝，會誤判平手或提前勝利。**  
   [worker/cross.ts:157](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/cross.ts:157>)，另見 `:191`、`:197`。

   例如兩隊各 3 人、總分分別 501 與 502，平均分都被取整為 167，結算判成平手。門檻判定也可能把實際不足 300 的差距取整成 300 而提前結束。

   **修正：**判勝保留原始平均值，或用總分與人數交叉相乘比較；僅顯示時取整。

## NITS

- 無新增純風格項目。


# 複審 3（Codex review 6）

## Verdict：APPROVE

前三輪發現的問題已在本次審查範圍內修正；未發現新的阻擋項或必修問題。

本次未修改檔案、未執行 Playwright。指定 Node 測試 **119／120 通過**，其中 cross-live **20／20 通過**；唯一失敗仍為既有 C-3 題庫對應檢查，相關題庫不在本次差異中。`npx tsc --noEmit` 通過。

## 前次問題狀態

| 編號 | 前次問題 | 本次核對 |
|---|---|---|
| R3-B1 | L3 選項洩漏 k | **已修正**：固定 −5～5、不含 0，順序與正解無關。`worker/cross.ts:77`、`:125` |
| R3-B2 | 舊 HTTP 回應覆蓋新題／判定 | **原交錯情境已修正**：世代、revision、已提交 ID 與 pending 身分防護。`src/cross-live.ts:434`、`:469` |
| R3-S1 | 跨題盲猜成本過低 | **已修正**：遞增冷卻、滑動分鐘預算及速度分門檻；限制資料隨課堂保存。`worker/cross.ts:256`、`:293`、`:306` |
| R3-S2 | 重複 next 持續寫入／廣播 | **已修正**：已有題目不增加 revision，一般重取回 quiet；另有 250ms 限速。`worker/app.ts:2358`、`worker/index.ts:106` |
| R3-S3 | 推送與 HTTP 重複累加統計 | **已修正**：直接指派伺服器 `mine`。`src/cross-live.ts:477` |
| R3-S4 | 換路由／課堂清理不完整 | **已修正**：scope 改變即重設世代、revision、pending、fetching 等狀態。`src/cross-live.ts:64`、`:519` |
| R3-S5 | 公布索引位移、CSV 遺失紀錄 | **已修正**：不可變題目 ID、獨立 log、截斷與封存說明。`worker/cross.ts:398`、`:446` |
| R3-S6 | 閒置到期缺少可靠保存／推送 | **已修正**：alarm 結算、保存、增加 revision、安排推送；空隊規則一致。`worker/index.ts:208`、`worker/app.ts:458` |
| R3-S7 | 安全與競態測試不足 | **原指出情境已補測**：權限、容量、重送、故障與排程交錯；前端 e2e 本次僅閱讀。`tests/cross-live.test.mjs:534`、`:649`、`:707` |
| R4-NB1 | 慢速作業批改阻擋對戰結算 | **已修正**：批改期間持續結算到期對戰；實際 DO 類別測試確認作業只完成一次。`worker/index.ts:156`、`:164` |
| R4-NB2 | 取消排程後保存失敗，失去喚醒 | **已修正**：null 不立即刪除；依已保存狀態清理，結算寫入失敗保留排程。`worker/index.ts:194`、`:232` |
| R4-SF1 | crossView 修改持久狀態 | **已修正**：畫面使用副本，正式結算集中處理。`worker/cross.ts:362` |
| R4-SF2 | 首次繪製沿用舊 pending／result | **已修正**：載入與卡片繪製入口先確認 scope。`src/main.ts:2797`、`src/cross-live.ts:226`、`:239` |
| R4-SF3 | 跨場次容量無上限 | **已修正原問題**：保留 3 場詳細資料、最多 30 場總計；容量測試通過。`worker/cross.ts:423` |
| R4-NIT | 公布排除座號 100 | **已修正**：依班級座號上限驗證。`worker/app.ts:2339` |
| R5-NB1 | 收尾忽略過期 pending，延後新作業 | **已修正**：比較與設定納入同一佇列；過期 pending 立即重新喚醒。交錯測試通過。`worker/index.ts:177` |
| R5-SF1 | 保存成功、排程清理失敗造成漏推送 | **已修正**：保存成功後先安排廣播，再清理排程。故障測試通過。`worker/index.ts:232` |
| R5-SF2 | 平均分取整造成誤判 | **已修正**：判勝與門檻使用交叉相乘；僅顯示值取整。`worker/cross.ts:164`、`:193`、`:203` |

共用 alarm 的收尾處理符合 handler 期間 `getAlarm()` 的語意；序列化比較可保留期間新增的較早喚醒，包括已過期者。[Cloudflare 官方說明](https://developers.cloudflare.com/durable-objects/api/alarms/)

未發現新增的學生教師控制／公布／JSON／CSV 匯出權限繞過，或送出前直接暴露秘密種子、標準答案的路徑。指定的既有 quiz／PK／raid／duel／homework 測試除 C-3 外通過。

## NEW BLOCKERS

無。

## SHOULD-FIX

無新增。

## NITS

無新增。

本次結論基於原始碼、指定 Node 測試與型別檢查；未重新驗證瀏覽器互動或正式 Cloudflare 環境。

