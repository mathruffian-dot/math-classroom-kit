# Verdict：REJECT

有兩項阻擋問題：judge 會忽略部分錯誤填值；拖曳狀態可能跨題殘留。

驗證結果：13 項單元測試通過；直接執行 `tsc --noEmit` 通過。未執行完整 `npm run typecheck`，因為前置教材產生器會寫檔。未跑 Playwright，未修改檔案。

在現有卡片及「左欄正數」規則內，列舉測試未發現干擾卡誤判；L3 展開與指定的因式顯示案例均通過。

## BLOCKERS

- **[P1] judge 把錯誤左欄靜默改成 1，可能誤判正確。**  
  [shared/cross.ts:235–238](/C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/shared/cross.ts:235)  
  已實測：題目 `x²+5x−14`、`leadLocked: true`，傳入 `{lead0:2, lead1:3, const0:7, const1:-2}`，仍回傳 `ok:true`；實際填法展開是 `6x²+17x−14`。目前 UI 不會產生這個填法，但不符合後續伺服器共用 judge「拒絕所有錯誤排列」的要求。  
  **修正：**固定格允許省略／`null` 時補 1；明確傳入非 1 值時必須拒絕。補上此案例的回歸測試。

- **[P1] 拖曳期間換題，舊指標可能操作新題的同名卡片。**  
  [src/cross-board.ts:102–133](/C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/cross-board.ts:102)、[300–350](/C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/cross-board.ts:300)  
  事件流程上，一指拖住卡片、另一指按「下一題／等級」，`newItem()` 會替換卡片，但沒有清除 `drag`。新題又使用 `c0…` ID，舊指標放開時便可能把**新題同 ID 卡片**放進格子；失去 capture 且未收到 root 的放開事件時，ghost 也可能殘留。第二指按另一張卡還會直接取代第一指的拖曳。此項為靜態事件分析，未以瀏覽器重現。  
  **修正：**換題、清空、公布前取消拖曳並釋放 capture；拖曳中忽略額外指標；處理 `lostpointercapture`。補測多指、拖出邊界、取消及拖曳中換題。

## SHOULD-FIX

- **[P2]「iPad」測試無法驗證 Safari，切 WebKit 更會在 CDP 呼叫失敗。**  
  [tests/e2e/cross-board.spec.ts:88–98](/C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/cross-board.spec.ts:88)  
  `hasTouch:true` 加 Chromium 的 `newCDPSession()` 是 Chromium 觸控模擬；現有 `PW_BROWSER=webkit` 路徑無法執行這段。  
  **修正：**區分 Chromium 模擬與 Safari 驗證，提供 WebKit 可執行的測試路徑；補測 pointer cancellation、多指、鍵盤操作及未登入／學生帳號進入。

- **[P2] 選取與提示資訊只靠視覺呈現。**  
  [src/cross-board.ts:221–224](/C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/cross-board.ts:221)、[434–452](/C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/cross-board.ts:434)  
  選取只切換 `.selected`；提示只說「發亮的兩張」，讀屏使用者無法知道選了哪張或提示哪些數字。  
  **修正：**同步卡片的 `aria-pressed`，提示文字直接讀出數值；提供可用鍵盤操作的退回卡片匣入口。

- **[P2] 尚未用完題池就會重複，違反「同一場不重複」。**  
  [src/cross-board.ts:104–106](/C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/cross-board.ts:104)  
  重抽 50 次後會直接接受重複題。以相同邏輯實測，`base=0`、L1 第 **187 題**便重複，此前僅出過 186 種。  
  **修正：**從明確的未使用題池抽取；用盡時提示重新開始。補上接近題池耗盡的測試。

## NITS

- **文件的係數範圍與 L3 實作不同。**  
  [docs/CROSS.md:54](/C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/CROSS.md:54)、[shared/cross.ts:163–169](/C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/shared/cross.ts:163)  
  文件寫原式 `|b|≤30`，實際限制作用於 inner。`crossItem(9,3)` 產生 `12x²+81x−21`。  
  **修正：**文件明確標示 `|b′|≤30`，或在產生時限制原式係數，並加入對應斷言。

- **正確係數卡存在性的斷言可能假通過。**  
  [tests/cross.test.mjs:70–73](/C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/cross.test.mjs:70)  
  `indexOf(v) === -1` 時，`splice(-1,1)` 仍刪掉最後一張，後面的長度檢查照樣成立。  
  **修正：**像常數卡測試一樣，先斷言索引 `>=0` 再刪除。