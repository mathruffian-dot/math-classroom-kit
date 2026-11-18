## Verdict：REJECT

審查範圍符合指定 diff／未追蹤檔案，未修改檔案、未執行 Playwright。指定單元測試 **57／57 通過**，`npx tsc --noEmit` 通過。

固定 k 清單與答案無關、涵蓋產生器全部 k；`crossKFeedback()` 本身未直接寫出正確 k。worker 修改未見 live payload／答案保密回歸。路由沿用教師權限檢查；雙指測試確實讓兩個觸點同時移動，且檢查兩張拖曳複製卡同時存在。

## BLOCKERS

1. **[P1] 新增的 k 選答流程提前洩漏可反推答案的資訊。**  
   [src/cross-pad.ts:178](C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/cross-pad.ts:178) 在 `needK()` 時仍顯示 `inner.b`，而遮罩只蓋住十字圖。學生直接計算「原式一次項係數 ÷ 目標」即可得到 k；例如原式一次項為 10、目標為 5，就知道 k＝2。  
   **修正：**選對 k 前，讀數區不得顯示內部三項式的係數；核對其他可見提示與卡片資訊，並補上選 k 前的畫面防洩漏測試。

2. **[P1] 截止時間後仍可能計分，影響勝負。**  
   [src/cross-duel.ts:160](C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/cross-duel.ts:160) 的 `solved()` 只檢查 `phase`；結算依賴每 100ms 的 interval。實際時間已到、interval 尚未執行時，最後一次放卡仍會加分。背景分頁節流／回到前景時也缺少立即核對。  
   **修正：**每次輸入提交與計分前檢查實際 deadline，逾時立即鎖定並結算；恢復可見時同步核對。補測截止前後輸入、延遲 tick、重複結算及分頁切換。

## SHOULD-FIX

1. **[P2] `lostpointercapture` 沒有取消待完成的點選。**  
   [src/cross-pad.ts:458](C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/cross-pad.ts:458) 只有 `pointercancel` 會刪除 `taps`。格子／卡片匣／k 按鈕失去 capture 後，後續同 pointerId 的 `pointerup` 仍可能執行過期操作。  
   **修正：**兩種取消事件都刪除對應 tap；補測點選失去 capture 後不放卡、不選 k，且另一側繼續正常操作。

2. **[P2] 不重複保證只適用單輪題池。**  
   [shared/cross-duel.ts:75](C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/shared/cross-duel.ts:75) 換輪時重新產生題池，沒有整局 `seen` 或左右保留集合，可能重出已答題目，也失去左右集合不相交的保證。現有測試只對前 70 題檢查；縮小題池測試沒有檢查跨輪重複。  
   **修正：**維持整局去重與左右分配約束，明確處理耗盡；補跨輪測試，並修正文檔的「永遠不重複／不相交」宣稱。

3. **[P2] 配對失敗時直接破壞同題型保證。**  
   [shared/cross-duel.ts:81](C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/shared/cross-duel.ts:81) 找不到相同 shape 就令 `j = 0`。當剩餘不同 shape 各有奇數題時，可能配到一側左欄固定、另一側需要四格操作，造成難度與步驟不對等。  
   **修正：**按 shape 分桶配對，不能以任意題補位；補題池尾端與多種 seed 的公平性測試。

4. **[P2] 版面測試僅檢查初始作答狀態。**  
   [tests/e2e/cross-duel.spec.ts:499](C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/cross-duel.spec.ts:499) 在開始後立即量測，沒有覆蓋提出公因數等式、錯誤訊息與完整成功因式分解。這些狀態會改變高度，而 `.xd-pad` 使用 `overflow: hidden`，初始通過不能證明後續內容未被裁切。  
   **修正：**四種尺寸都檢查上述狀態的裁切與可見性。本次依指示未跑瀏覽器，不能確認實際版面。

## NITS

- [docs/CROSS.md:213](C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/CROSS.md:213)、[docs/REVIEW-2026-11-18-cross-duel.md:19](C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/REVIEW-2026-11-18-cross-duel.md:19)：稱雙人入口是「第三張卡片」，但 `renderGames()` 排序為大板 → 雙人 → live，實際是第二張。調整排序或文件。
- [tests/e2e/cross-duel.spec.ts:24](C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/cross-duel.spec.ts:24)：`CROSS_SHOTS=0` 也會寫截圖。改成 `process.env.CROSS_SHOTS !== '1'` 時返回，符合指定的啟用條件。