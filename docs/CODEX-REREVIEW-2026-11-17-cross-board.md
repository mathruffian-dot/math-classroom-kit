# Verdict：APPROVE WITH FIXES

兩項原有阻擋問題已修復；未發現新的判題誤判或拖曳阻擋問題。仍有網址設定遺失與測試缺口需要補齊。

本次實跑：`node --test tests/cross.test.mjs` **15/15 通過**；`npx tsc --noEmit` **通過**。未執行 Playwright，未修改檔案；瀏覽器相關結論為靜態審查。

## 前次發現狀態

| 項目 | 狀態 | 核對結果 |
|---|---|---|
| B1 固定左欄忽略錯誤填值 | 已修復 | `shared/cross.ts:270` 保留明確填值；安全整數、卡片種類與使用數量檢查未發現合法答案遭拒。回歸案例通過。 |
| B2 拖曳跨題殘留／第二指搶占 | 已修復（靜態確認） | `src/cross-board.ts:127、131、345、365、415`：集中取消、題目序號 ID、額外指標阻擋與 capture 清理均已加入。 |
| S1 Chromium／WebKit 測試與操作覆蓋 | 部分修復 | `tests/e2e/cross-board.spec.ts:94` 避開 WebKit CDP；清楚標示 tap 替代路徑。已補取消、多指、鍵盤及未登入測試，**仍缺學生帳號測試**。 |
| S2 選取與提示只靠視覺 | 已修復 | `src/cross-board.ts:262、271、448、524`：選取狀態、數值提示、所在格與鍵盤退回均已補上。 |
| S3 題池耗盡前重複 | 已修復 | `shared/cross.ts:202` 去重建池，`src/cross-board.ts:111` 逐題消耗；L1 完整 200 題測試通過。 |
| N1 L3 係數範圍不符文件 | 已修復 | `shared/cross.ts:169` 限制原式係數；每級 3000 題斷言通過。 |
| N2 `splice(-1)` 假通過 | 已修復 | `tests/cross.test.mjs:75` 已先斷言索引存在。 |

## NEW BLOCKERS

無。

## SHOULD-FIX

- **[P2] 換題會遺失新增的 `pool` 網址設定。**  
  [src/cross-board.ts:472](C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/cross-board.ts:472)  
  開啟 `?level=1&seed=31&pool=4` 後按「下一題」或切換等級，`syncUrl()` 只保留 level、seed。當下仍使用閉包中的四題設定，但重新整理或分享目前網址後會變成預設題池，同一網址無法重現目前設定。應保留有效的 `pool`，並補換題後重新整理的回歸測試。

- **[P2，前次殘項] 學生帳號路由隔離仍無回歸測試。**  
  [tests/e2e/cross-board.spec.ts:341](C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/cross-board.spec.ts:341)  
  此處只測未登入。`src/main.ts:2723` 的學生分支目前確實先於遊戲路由，未發現權限繞過；但前次要求的學生情境仍未驗證。應以獨立學生 context 測試直接進入 `#/games`、`#/games/cross`，確認不出現教師遊戲介面。

## NITS

- **固定左欄錯值的 `reason` 範例不完整。**  
  [docs/CROSS.md:55](C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/CROSS.md:55)  
  文件寫明確填非 1 回傳 `lead`；實際傳入含 `cards` 的完整題目時，`shared/cross.ts:311` 會優先回傳 `card`。應區分有無 `cards` 的結果，避免後續伺服器依錯誤原因實作時誤解契約。