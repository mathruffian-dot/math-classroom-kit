# 模型說明
老師指定 gpt-6.2-sol（t60u），三次呼叫皆失敗：`The 'gpt-6.2-sol' model is not supported when using Codex with a ChatGPT account.`（400 model_not_found）。以下審查均以 gpt-6.1-sol 執行並明確標示。

# 複審 1（gpt-6.1-sol）
## Verdict：APPROVE WITH FIXES

指定單元測試 **60／60 通過**；`npx tsc --noEmit` 通過。未修改檔案、未執行 Playwright；實際版面與瀏覽器互動未在本次重驗。

### 前次發現狀態

| 前次項目 | 狀態 | 本次核對 |
|---|---|---|
| B1：選 k 前洩漏內部係數 | 已修正 | 卡片、固定左欄、目標與欄乘積均延後顯示；補上 DOM 防洩漏測試 |
| B2：截止後仍計分 | 已修正 | 輸入、計分、換題、暫停及前景事件均核對 deadline；結算有冪等保護 |
| S1：失去 capture 未取消 tap | 已修正 | 兩種取消事件均刪除對應 pointerId 的 tap |
| S2：跨輪重複／左右集合相交 | **部分修正** | 一般換池有整局去重；耗盡重洗牌後仍失去保證，見下方 |
| S3：配不到同型便任意補位 | 已修正 | 已移除異型補位，新增多 seed／小題池測試 |
| S4：版面測試只有初始狀態 | 測試碼已補 | 四種尺寸涵蓋選 k、等式、錯誤與成功狀態；本次未執行 |
| NIT：第三張卡片順序 | 已修正 | 現為大板 → live → 雙人 |
| NIT：`CROSS_SHOTS=0` 仍截圖 | 已修正 | 三份 spec 都要求值恰為 `'1'` |

## BLOCKERS

無新增的一般操作阻斷問題。

## SHOULD-FIX

1. **[P2] 測試 hook 可留在已移除測試標記的對局中。**  
   [src/cross-duel.ts:118](C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/cross-duel.ts:118)、[src/cross-duel.ts:140](C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/cross-duel.ts:140)

   以 `?test=1&time=20` 開頁，改選 120 秒並開始：`syncUrl()` 會移除 `test=1`，但同一實例的 `__crossDuelTest` 仍可修改 `skew`、停止 tick／換題。現有版面測試使用 `time=180&test=1`，開始後仍呼叫 hook，正好覆蓋這條路徑。因而「正式網址沒有這個入口」並不成立。

   **修正：**測試實例存續期間持續保留 `test=1`；離開實例時撤除 hook。補測從測試設定改選正式時間，以及離開測試頁後進入普通對局，確認普通對局不能被 hook 改變。

2. **[P2] 重洗牌仍可能重出另一側正在作答的題，S2 尚未完整解決。**  
   [shared/cross-duel.ts:132](C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/shared/cross-duel.ts:132)、[tests/cross-duel.test.mjs:194](C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/cross-duel.test.mjs:194)

   重啟時將 `seen` 縮成最近 10 對；若另一側落後超過 10 對，其目前題目便重新具備被抽出的資格。程式沒有保留實際畫面上的題目，也沒有固定左右題目歸屬。修正紀錄第 104 行亦承認此限制；「正常一局到不了」不是程式保證。

   **修正：**耗盡策略必須保留原規格的去重與同時不同題保證，例如耗盡後停止發題並明示原因。若保留重洗牌，至少保留左右歸屬與當前題目的排除約束；補測一側跨過耗盡點、另一側仍停在舊題的情境。

## NITS

- **「另一側未重畫」測試可能誤判通過。**  
  [tests/e2e/cross-duel.spec.ts:95](C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/cross-duel.spec.ts:95)：標記的是容器自身；即使重寫容器的 `innerHTML`，`_mark` 仍存在。改保存卡片／題目子節點參照，或監看子樹的 `childList` 變更。

- **文件測試數量未同步。**  
  [docs/CROSS.md:275](C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/CROSS.md:275)：10／9 應更新為 13／12。

其餘指定檢查未見新回歸：固定 k 清單與答案無關、錯選訊息未直接揭露正解；live 修改維持原選項值與順序，未見 payload 洩漏；教師路由權限一致。雙指測試確實同時移動兩個觸點，並驗證兩張 ghost 同時存在；指標隔離、跨中線限制及單板重構也未見新的靜態缺陷。

# 最終複審（gpt-6.1-sol）
## Verdict：APPROVE WITH FIXES

前兩輪問題均已有修正；本輪新增 **1 項配色回歸、1 項文件小問題**。

指定單元測試 **61／61 通過**；`npx tsc --noEmit` 通過。未修改檔案、未執行 Playwright，因此實際版面與瀏覽器互動未在本輪重驗。

### 前次發現狀態

| 項目 | 狀態與核對依據 |
|---|---|
| 選 k 前洩漏內部係數 | 已修正：`src/cross-pad.ts:147、255` 延後顯示卡片、固定欄與內部讀數 |
| 截止後仍可計分 | 已修正：`src/cross-duel.ts:102、239` 在輸入與計分前核對 deadline |
| lostpointercapture 未取消 tap | 已修正：`src/cross-pad.ts:499` 清除對應 pointerId 的 tap／drag |
| 跨輪重複、耗盡後可能撞到另一側當前題 | 已修正：`shared/cross-duel.ts:98、135` 整局去重，耗盡後持續回傳 null |
| 找不到同型便任意補位 | 已修正：`shared/cross-duel.ts:122` 嚴格配對同 shape |
| 版面僅測初始狀態 | 測試碼已補：`tests/e2e/cross-duel.spec.ts:771` 覆蓋四種尺寸與等式、錯誤、成功狀態；本輪未執行 |
| 第三張入口順序 | 已修正：`src/main.ts:228` |
| CROSS_SHOTS=0 仍截圖 | 已修正：三份 spec 均要求值恰為 `'1'` |
| 測試 hook 留在無標記對局 | 已修正：`src/cross-duel.ts:119、139、162` 保留標記、撤除 hook，舊參照綁定原實例 |
| 「另一側未重畫」測試失效 | 已修正：`tests/e2e/cross-duel.spec.ts:100` 使用子樹 observer 與子節點參照 |
| 文件測試數量 | 已修正：`docs/CROSS.md:275` 為單元 14／對戰 e2e 13 |

固定 k 清單與答案無關，涵蓋產生器全部 k；錯選訊息未直接揭露正解。worker 差異維持原選項值與順序，未見 payload／答案保密回歸。教師路由權限一致；雙指測試確實同時移動兩個觸點，並檢查兩張 ghost 同時存在。單板重構、指標隔離與勝負邏輯未見其他新缺陷。

## BLOCKERS

無。

## SHOULD-FIX

1. **[P2] 新的 x 格配色規則壓過連線版選取目標框。**  
   [src/cross-live.css:499](C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/cross-live.css:499)

   已放入 x 卡，再選另一張卡準備替換時，該格同時具有 `lead filled target`。新 selector 的 specificity 為 **0,6,0**，高於第 507 行目標框的 **0,3,0**，因此邊框仍為橘色，無法顯示這次指定的 navy 選取提示。修改前兩者 specificity 相同，後面的 target 規則可以生效。

   **修正：**將狀態排除條件包進 `:where(...)` 降低 specificity，或讓橘色邊框規則排除 `.target`。補測「已填 x 格＋另選卡片」的 computed border；目前 `cross-colors.ts` 只檢查卡片匣中的一般狀態，抓不到此回歸。

## NITS

- [docs/CROSS.md:107](C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/CROSS.md:107)：仍寫「耗盡時明確重新開始」，與目前停止發題的實作及後文矛盾。改成「耗盡時停止發題、不重洗」。