# Codex 再審：遊戲區（第 12 輪，2026-11-24）

模型 gpt-6.2-astra，reasoning high，唯讀。原文如下。

**需修正後再審。** 第 11 輪的 1 個阻擋與 2 個應修均已修好，但本輪確認另有 1 個合併前必修問題：教師剛發回給學生的個別批改，仍可被舊 token 開啟的魔王戰蓋掉。

## 上一輪項目逐項

| 項目 | 是否修好 | 證據 |
|---|---|---|
| 阻擋：`replace` 漏算公布中與已結束的結果 | **已修好** | 我先取得換課計畫，再分別公布 IRS 結果、結束測驗、十字交乘、步驟格鬥及魔王戰。五種情況送舊 token 都回 **409**，新計畫列出對應結果。以學生身分重讀，五次都仍在原課，且能讀到同一份結果。[中斷判定](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:465>) |
| 應修：`loadDashboard(still)` 須在寫入前檢查 | **已修好** | 延後 A 的 dashboard 回應，切到 B 後才放行 A，執行實際 `loadDashboard` 函式後，共用資料仍為 B。錯誤重載路徑在取得遊戲清單後也會再次檢查選卡序號。[寫入前檢查](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:196>)、[錯誤重載](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3879>) |
| 應修：round 9 驗證器案例自組教材 | **已修好** | 案例自行建立最小 lesson、`crossPage` 與單選題，實測分頁通過、同頁遭拒。這段驗證已解除對正式教材題型的依賴，與作者文件一致。[測試](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3031>)、[教材契約](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/AUTHORING.md:333>) |
| round 11 新增的後端測試 | **已通過** | 既有案例對公布 IRS、已結束測驗、已結束十字交乘，均斷言新計畫含對應項目、舊 token 回 409，最後確認原課仍開放。上列五種情況的學生身分讀回是本輪額外驗證。[round 11 測試](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3201>) |
| 建議：round 10 補 `pk-start` | **尚未納入固定測試，可另案** | 原測試停在 `ended === false`。本輪另讓 1、2 號配成一組，舊 token 回 409 後，原課 `pk-start` 回 **200**。[round 10 測試](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3185>) |
| 建議：E2E 等待 A 的正式回應 | **尚未完成，可另案** | 最後一例仍在放行 A 後固定等待 300 毫秒。200 分支輪詢到 A 班有目標課堂，但未核對該回應的 `raidId`。[跨卡 E2E](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:275>) |

## 新發現

### 阻擋｜合併前必修

**1. 發回個別批改後，`start` 和 `replace` 的舊 token 都仍有效。** 教師的「發回批改」會改變 `grade.released`。學生可以在全班 IRS 結果關閉時看到「老師的回饋」，但 `interruptions` 只檢查 `resultsVisible` 等課堂狀態，未納入當頁已發回的個別回饋。[發回批改](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2191>)、[計畫指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:453>)、[學生面板](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:1196>)

我用學生帳號提交畫布作答，教師關閉作答、完成批改，先取開戰計畫，再按「發回批改」。學生 API 已讀到該則回饋，實際 `studentPanel` 函式也產生了含回饋文字的畫面。兩條路徑的結果如下。

| 路徑 | 發回後重新 dry run | 送出發回前的 token | 學生端影響 |
|---|---|---|---|
| `start`，同課翻到魔王戰頁 | `busy: []`，token 相同 | **200** | 前端可直接開戰。原課仍在，當頁回饋被魔王戰作答卡取代。 |
| `replace`，換成另一課 | `busy: []`，token 相同 | **200** | 發回前取得的換課確認仍然有效。原課結束，學生進入新課的魔王戰。 |

**修正方向。** 將這次開戰會蓋掉的當頁已發回回饋納入 `busy` 與指紋，以活動 ID 和發回輪次辨識即可，確認框只需顯示「已發回的個別批改」。兩條路徑都應加回歸斷言：發回前的 token 回 **409**，學生仍能讀到原回饋，教師重新確認後才開戰。無須將評語、分數或學生識別資料放進 token。

### 應修

除上述阻擋外，本輪沒有其他合併前必修項目。

### 建議｜可記為已知限制、另案處理

兩項測試強化可另案處理。round 10 可把本輪已通過的配對及 `pk-start` 步驟寫回固定案例，以涵蓋配對可繼續使用的行為。跨卡 E2E 可在放行 A 前登記 `waitForResponse`，核對 A 班正式 POST 的 200／409，200 分支再比對 `raidId`，最後斷言 B 的確認框仍在。這可避免慢速環境下的固定等待掩蓋晚到回應。[PK 測試](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3197>)、[跨卡 E2E](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:249>)

## 其餘指定路徑

| 路徑 | 本輪核對結果 |
|---|---|
| `POST /api/games/raid` 與前端 409 | 對同一個記憶體 Durable Object 並行送出相同 token，得到 **200、409**，後者帶 `enter` 新計畫。首次 `enter` 只導頁，`new` 與空 `busy` 的 `start` 可直接執行，`replace` 一律確認。收到帶計畫的 409 後，只有 `enter` 直接導頁，其餘重新確認。本輪阻擋發生在伺服器把回饋算成空 `busy`。[後端比對](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1722>)、[前端分流](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3846>) |
| 手動結課、`POST /api/sessions`、遊戲區換課 | 三個入口各測十字交乘、魔王戰、全班測驗，**9 組通過**。魔王戰保留答對一題的個人最佳，測驗保留成績與錯題計數。另以記憶體 Durable Object 驗證三個入口都在原到期點清除十字交乘舊排程。與 `d60e98c` 相比，手動結課會補記魔王戰結束時間並關閉 PK 搶答，一般開新課也會完整結算舊課；這些是交接檔記載的行為變更。[結課邏輯](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:519>)、[alarm 清理](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:194>) |
| 課堂內「開戰」 | 對照基準差異，入口保留題庫、難度與時間驗證。抽出的 `startRaid` 保留線上人數計算、舊活動收尾、個人最佳快照、護盾設定與前場角色沿用。[課堂入口](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1868>)、[開戰邏輯](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:572>) |
| `GET /api/games` | 實測未登入 **401**、學生 **403**、教師 **200**。查詢依教師所有權、題庫及魔王戰頁篩選，清單列只有 `lessonId`、`lessonTitle`、`title`、`section`。[清單路由](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1701>) |
| `crossPageFocus` | 執行實際面板函式，同一頁依序得到預設 `gcf`、教師改選後重畫的 `a1`；另一堂使用相同頁面 ID，仍得到自己的 `gcf`。既有 E2E 以獨立學生 context 檢查等待畫面及開戰後的題目等級。[面板取值](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:1636>)、[師生 E2E](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:175>) |

本輪全程唯讀。實跑 8 個既有遊戲區與結課後端案例、上述補充情境、TypeScript `--noEmit` 及指定追蹤檔的 `git diff --check`，均通過。瀏覽器 E2E 本輪僅審閱原始碼；交接檔的 `13/13` 是作者的執行紀錄。八上 3-2 教材與照片 R2 修改均排除於本次審查。
