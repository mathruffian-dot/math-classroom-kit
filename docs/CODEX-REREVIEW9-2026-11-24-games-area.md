# Codex 再審：遊戲區（第 10 輪，2026-11-24）

模型 gpt-6.2-astra，reasoning high，唯讀。原文如下。

**需修正後再審：跨課 `replace` 的舊 token 仍能結束剛建立 PK 配對的課堂，正式請求回了 200。**

## 上一輪項目逐項

| 項目 | 是否修好 | 證據 |
|---|---|---|
| 阻擋 1．A 卡正式開戰的回應晚到，把教師帶離 B 卡 | 已修好 | 實跑前端函式，在 A 送出後改選 B，再讓 A 回 `200`、`409 + enter` 或一般錯誤，三者都沒有導頁或提示。成功與錯誤分支均先檢查 `raidCurrent`。最後一個 E2E 也涵蓋前兩種回應。[正式回應處理](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3849>)、[E2E](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:231>) |
| 阻擋 2．十字交乘切到紅藍拔河後，舊 token 仍可結算 | 已修好 | `team` 已納入指紋，確認清單也會寫出「十字交乘紅藍拔河」。本輪實跑 round 9 測試，同課 `start`、跨課 `replace` 的舊 token 都回 409，舊課及拔河均持續進行。[活動指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:471>)、[round 9 斷言](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3020>) |
| 應修 1．同名魔王戰頁的確認框無法辨認單元 | 部分修好 | 確認框已讀取 `data-unit`，倒數第二個 E2E 也斷言「九年級 2-2」。原教材名稱可正確顯示，但單元編號仍取自可編輯的課名。同年級的兩堂課改名後可以再度撞名，詳見下方實測。[卡片標籤](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:234>)、[E2E 斷言](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:221>) |
| 應修 2．同頁 `crossPage` 加 `activity` 會藏掉 IRS 控制 | 功能已修好，文件尚待對齊 | 用同一份教材呼叫儲存 API，獨立 `crossPage` 回 200，加上 `activity` 回 400，錯誤訊息明確要求拆頁。round 9 的驗證器斷言也通過。作者文件仍寫「不需要 `activity`」，未說明兩者互斥。[驗證器](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/validation.ts:542>)、[作者文件](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/AUTHORING.md:333>) |
| 建議．雙卡 E2E 直接控制回應順序 | 已採用，正式回應的完成條件可再加強 | 最後兩個測試都等 B 確認框出現才放行 A。倒數第二個還驗證 B 舊課已結束、A 舊課仍進行。最後一個的真實 200 分支仍有固定等待，詳見建議。[雙卡測試](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:198>)、[正式回應測試](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:249>) |

## 新發現

### 阻擋

1. **跨課取代漏算未開放搶答的 PK 配對。** `interruptions` 只在 `how.start` 時把整個 `pkLobby` 放進指紋。`replace` 只看 `pkLobby.buzz`。我先取得跨課計畫，再從原課開啟 PK 配對，把 1、2 號配成一組，全程維持搶答關閉。前後兩次 `busy` 都是 `[]`，token 完全相同。送舊 token 回 **200**，原課變成 `ended: true`；配對名單雖然還在，按 `pk-start` 已回 **409**。教師確認後才開始的配對因此無法繼續。應讓 `replace` 也辨認配對的存在、輪次、等待者與分組，並補上這個回歸案例：舊 token 應回 409，原課仍可開始 PK。[配對指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:465>)、[`replace` 計畫](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:490>)、[結課後的控制限制](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1785>)

### 應修

1. **確認框應使用伺服器已提供的單元編號。** 我將九年級 1-4 與 2-2 的課名都改成 `Final practice`、魔王戰頁名都改成 `Review`，兩次教材儲存均回 200。`GET /api/games` 仍分別回傳 `section: "1-4"`、`"2-2"`，但實跑前端標籤函式，兩張卡都得到「九年級 Review」。教師在同一班的確認框無從辨認目標。應優先使用 `g.section` 產生卡面、按鈕與 `data-unit`，並用這組同年級改名案例測試。[清單回傳欄位](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1703>)、[標籤取值](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:242>)

2. **404／無計畫的 409 開始重載後，舊卡仍可能重畫遊戲區。** `raidGameError` 在入口檢查 `raidCurrent`，但等待 `loadDashboard()` 後只檢查路由，`renderGames()` 等待清單後也只檢查路由版本。我用實際前端函式暫停 A 的錯誤重載，改選 B 後放行，A 仍呼叫 `shell()` 重建卡片。這會重設尚未送出的選單與焦點。應把同一次選卡序號帶過兩次讀取，在套用 dashboard 與重畫卡片前各檢查一次。[錯誤重載](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3870>)、[遊戲區重畫](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:255>)

3. **round 9 平台測試依賴另案尚未追蹤的教材。** 測試直接讀 `content/lessons/g8-3-2a.json`，再要求裡面同時有對戰頁與單選題。目前工作目錄可以通過，但只合併本次平台修改的乾淨 checkout 會因缺檔失敗，以後教材調整也可能讓平台測試失敗。應在測試內建立最小對戰頁與單選題，並將作者文件改為「`crossPage` 與 `activity` 不可放在同一頁」。[測試依賴](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3029>)、[作者文件](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/AUTHORING.md:333>)

### 建議

1. **讓最後一個 E2E 確認 A 的正式回應確實抵達。** 真實 200 分支在 `route.continue()` 後就設 `repliedA = true`，接著等 300 毫秒。慢環境下，斷言可能早於 A 的回應。可在放行前登記 `waitForResponse`，以 A 班、正式 POST 和預期狀態碼配對，等回應讀完，再檢查 B 的確認框與網址。200 案例也可查 A 的魔王戰已建立，直接證明「A 已開戰、畫面仍留在 B」。[等待與斷言](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:249>)

## 其餘指定路徑

| 路徑 | 本輪核對結果 |
|---|---|
| `POST /api/games/raid` 與前端 409 | 用同一 token 並行請求記憶體 Durable Object，得到 **200、409**，後者附 `enter` 新計畫。首次 `enter` 只導頁，`new` 與無 `busy` 的 `start` 直接送出，其餘先確認。有新計畫的 409 只有 `enter` 直接導頁，其餘再問一次。上述 PK 缺口發生在計畫內容。[伺服器比對](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1720>)、[前端分流](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3837>) |
| 手動結課、`POST /api/sessions`、遊戲區換課 | 三個入口各測十字交乘、魔王戰、全班測驗，共 **9 組通過**。十字交乘寫入結束時間，原 alarm 喚醒後清除舊排程；魔王戰保留學生答對一題的個人最佳；測驗保留成績及錯題計數。相較 `d60e98c`，手動結課現在會補記進行中魔王戰的結束時間並關閉 PK 搶答，一般開新課也會完整結算舊課，符合交接檔所述變更。[共用結課邏輯](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:517>)、[alarm 清理](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:194>) |
| 課堂內開戰、遊戲清單、`crossPageFocus` | 對照基準，課堂內 `startRaid` 保留難度、秒數、上線人數、舊活動收尾、個人最佳快照與角色沿用。`GET /api/games` 實測未登入 **401**、學生 **403**、教師 **200**，會排除其他教師教材及缺魔王戰頁的課，只回四個清單欄位。焦點函式實測依序取得原頁 `gcf`、同課同頁改選後的 `a1`、另一課同頁 ID 的 `gcf`。[課堂開戰](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:570>)、[遊戲清單](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1699>)、[頁面焦點](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:1633>) |

本輪全程唯讀。TypeScript `--noEmit` 與指定追蹤檔的 `git diff --check` 通過；6 個既有遊戲／結課後端案例以記憶體建置執行，全部通過，含 round 9。瀏覽器 E2E 已逐行核對，本輪未重跑；`games.spec` 4/4、重複執行 8/8 為作者交接紀錄。八上 3-2 教材內容與照片 R2 另案修改均排除於本次結論。
