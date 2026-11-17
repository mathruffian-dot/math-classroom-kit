## Verdict：REJECT

僅審查指定的未提交變更；未修改檔案、未執行 Playwright。

驗證結果：指定 Node 測試 **20/20 通過**；`npx tsc --noEmit` 通過。靜態檢查未發現學生繞過教師控制／匯出權限的路徑；Durable Object 既有佇列也會序列化提交。但以下問題仍須修正。

## BLOCKERS

1. **[P1] L3 選項結構直接編碼正確公因數。**  
   [worker/cross.ts:82](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/cross.ts:82>)  
   `kOptions()` 固定產生 `{k, −k, 同號真因數或替代值}`。學生只看選項即可辨識：找出互為正負的那一對，再取與第三個選項同號者，就是正確 k。例如 `[4, −4, 2]` 必選 `4`，完全不用計算原式。洗牌無法消除這個答案通道。  
   **修正：**改用與正解無關的固定候選集合，或讓學生輸入 k；加入「僅憑選項結構不能識別正解」的測試。

2. **[P1] 同場次的舊 HTTP 回應仍能覆蓋新題。**  
   [src/cross-live.ts:372](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/cross-live.ts:372>)、[src/cross-live.ts:401](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/cross-live.ts:401>)  
   `fetchNext()` 只核對路由／課堂／場次，沒有拒絕較舊 revision；`submit()` 也沒有核對目前題目是否已更新。若發題回應延遲，但 WebSocket 已送達該題，學生可以先完成提交；隨後舊發題回應仍會清掉結果、重新裝入已提交的題目。之後提交會得到 409，而相同 revision 的同步又可能被 `mergeCrossPush()` 保留成錯誤狀態。  
   **修正：**讓所有發題與提交回應具備請求世代、題目 ID 與 revision 防護；已知較新題目／提交狀態時，不得套用舊回應。補「伺服器已處理、僅延遲 HTTP 回應」的交錯測試。

## SHOULD-FIX

1. **[P1] 跨題盲猜的成本太低，足以刷高排行榜。**  
   [worker/app.ts:2318](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2318>)、[worker/cross.ts:212](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/cross.ts:212>)  
   同一 item 的排列重送會被拒絕，這點正確；但答錯不扣分，下一題沒有額外冷卻。L1 從四張卡隨機選兩張，成功率為 `1/6`，每題約 300 毫秒即可嘗試，猜中仍拿完整速度分。  
   **修正：**增加答錯後冷卻／連錯遞增冷卻與每分鐘提交預算，並限制不合理短時間作答的速度獎勵。

2. **[P1] 冪等 `next` 可無限制觸發持久寫入與全班推送。**  
   [worker/app.ts:2309](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2309>)  
   已有題目時，每次 `next` 仍更新時間、增加 revision、保存資料並觸發廣播。任一學生可持續呼叫，消耗共用 DO 的佇列、儲存寫入與廣播資源；提交的 300 毫秒限制不涵蓋此路徑。  
   **修正：**已有題目直接回傳，不增加 revision；出題與重複拿題都加伺服器限速，出席時間另外節流更新。

3. **[P2] 推送先到時，提交回應會重複累加作答數。**  
   [src/cross-live.ts:405](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/cross-live.ts:405>)  
   WebSocket 若已更新 `mine.correct/attempts`，HTTP 回應再執行 `+1`，一題會顯示成兩題；相同 revision 的後續同步還會保留這個數字。  
   **修正：**提交回應回傳伺服器的完整個人統計，前端直接指派，避免對可能已更新的統計再累加。

4. **[P2] 路由／課堂切換後，本機狀態清理不完整。**  
   [src/cross-live.ts:430](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/cross-live.ts:430>)  
   `resetCrossLocal()` 未清除或重新限定 `revision`、`fetching` 的作用範圍。上一堂較大的 revision 可能讓新課堂的同步長期被覆蓋；舊發題請求未完成時，也會阻擋新場次拿題。另外，提交因 routeVersion 不符而直接返回時，原 `pending` 沒有清除，返回同場可能持續鎖在「判定中」。  
   **修正：**以課堂＋場次＋請求世代管理狀態，離開路由時撤銷舊請求；舊請求的 `finally` 不得影響新世代。

5. **[P2] 最近紀錄的陣列索引不是穩定題目識別，且 CSV 會遺失資料。**  
   [worker/cross.ts:230](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/cross.ts:230>)、[src/cross-live.ts:146](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/cross-live.ts:146>)  
   第 31 次提交會刪掉第一筆；CSV 因而只剩最後 30 筆，與「每一次送出」的文件承諾不符。`recent.n`／公布端點又使用會位移的索引；前端公布快取僅以 `seat:n` 為鍵，重開場次或索引位移後，可能直接顯示另一題的因式分解。  
   **修正：**公布與快取改用課堂＋場次＋不可變 item ID；最近列表可限制 30 筆，完整作答紀錄應另外保存、分頁封存並設定容量政策。

6. **[P2] 限時結束缺少可靠的保存與推送流程。**  
   [worker/cross.ts:121](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/cross.ts:121>)  
   到期依賴後續請求或 `crossView()` 才變更狀態。全班停手且連線閒置時，沒有到期推送；前端雖可自行顯示結束，卻未必取得官方勝隊，`crossRuns` 也未同步完成。空隊目前在門檻勝利與時間勝利上採不同條件，應明確定義。  
   **修正：**排程伺服器到期結算，在佇列內保存結果、增加 revision 並廣播；明確規定空隊時是否允許判勝。

7. **[P2] 測試尚未涵蓋主要安全與競態邊界。**  
   [tests/cross-live.test.mjs:100](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/cross-live.test.mjs:100>)、[tests/e2e/cross-live.spec.ts:165](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/cross-live.spec.ts:165>)  
   洩漏測試主要搜尋欄位名稱與答案字串，抓不到選項結構洩漏。現有延遲是在送達伺服器前等待，沒有測到「已提交成功、推送先到、HTTP 回應晚到」。也缺少學生呼叫所有教師控制、JSON／CSV 匯出的拒絕測試，以及超過 30 題、換課堂、空隊與閒置到期情境。  
   **修正：**補上述負向與交錯測試；雙重提交驗證應經過 DO 佇列。

## NITS

- 無額外純風格項目；應先處理上述答案保密與狀態一致性問題。