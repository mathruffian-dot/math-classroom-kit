# Codex 再審：遊戲區（第 14 輪，2026-11-24）

模型 gpt-6.2-astra，reasoning high，唯讀。原文如下。

需修正後再審：第 13 輪的「收回後重新發回」已修好，但教師直接修改一份**已發回**的批改時，舊確認仍可開戰，收起學生剛收到的新回饋。

## 上一輪項目逐項

| 項目 | 是否修好 | 證據 |
|---|---|---|
| 每個活動各自記錄發回版本 | 已修好 | `session.releaseRev` 以活動 ID 為鍵。開戰指紋只取目前活動的 ID、已發回份數與版本。實測在 A 頁取計畫，到 B 頁發回另一份作答，再回 A 頁，`start`、`replace` 的 token 都維持相同。[活動指紋與版本](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:479>) |
| 整批發回、單份判對錯 PUT、單份規準評分 PUT | 明確發回已修好 | 整批發回與兩條 PUT 的 `released: true` 分支都呼叫 `bumpRelease`。我補測兩種 PUT 各自搭配 `start`、`replace`，四組「取計畫 → 收回 → 改評語並重新發回」都得到 **409**。原課未結束、未開戰，學生仍讀得到新評語。[整批發回](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2198>)、[判對錯](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2262>)、[規準評分](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2285>) |
| Round 13 後端固定測試 | 通過，涵蓋部分情境 | 案例確實驗到單份判對錯重新發回後，`replace` 舊 token 回 409、原課繼續、學生讀到新評語。雖然測試名稱提到另一頁，內文沒有切到另一頁，也沒有執行 `start` 或規準評分 PUT。這些情境本輪已另行實測。[固定案例](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3328>) |
| Round 10 補驗 `pk-start`、跨卡 E2E 等待 A 的正式回應 | 維持另案 | Round 10 固定案例停在確認原課未結束。跨卡 E2E 仍以攔截器旗標、班級清單與固定等待判斷 A 已完成。這兩項屬測試強化。[PK 案例](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3199>)、[跨卡 E2E](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:275>) |

## 新發現

### 阻擋（合併前必修）

**1. 已發回的作答直接按「判對／判錯」或「儲存」，學生看得到修改，開戰指紋卻維持舊版。**

**位置與原因。** 教師按「判對／判錯」時，前端送出判定與評語；依規準按一般「儲存」時，也會省略 `released`。兩條 PUT 都會沿用原有的 `released: true`，因此改判或新評語立即對學生可見。但兩處都只在請求明列 `released: true` 時更新 `releaseRev`。[教師表單](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:4098>)、[判對錯寫入](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2262>)、[規準評分寫入](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2285>)

**證據與影響。** 我先取得開戰計畫，再依教師表單實際送出的欄位修改已發回作答，並從學生 API 確認已讀到新評語。以下四組的活動版本都停在 `2`，前後 token 相同。送出舊 token 後的結果如下。

| 計畫 | 直接判對／判錯 | 依規準一般儲存 | 課堂結果 |
|---|---:|---:|---|
| `start` 同課開戰 | 200 | 200 | 同堂立即開戰，魔王戰面板蓋過新回饋 |
| `replace` 換課開戰 | 200 | 200 | 原課結束，新課立即開戰 |

成績與評語仍有保存。出錯的是課堂狀態：教師確認時看到的是前一版回饋，系統卻用那次確認收起修改後的學生畫面。[學生面板顯示順序](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:1190>)

**修正方向。** 兩條 PUT 都應依「寫入後是否已發回」決定是否更新該活動的版本。這樣一般儲存對學生可見的變更也會使舊 token 失效，未發回的草稿仍可照常編輯。固定回歸測試應涵蓋上表四組，並斷言 **409、原課持續、尚未開戰、學生仍讀得到新回饋**。

### 已知限制／另案處理

| 分類 | 位置、證據與影響 | 修正方向 |
|---|---|---|
| 應修 | Round 13 固定案例名稱宣稱涵蓋跨頁隔離，實際只操作一頁。這會讓日後跨活動誤用版本時仍可通過測試。[測試本體](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3328>) | 加入 A 頁取計畫、B 頁發回、回 A 頁比對 token 的斷言。 |
| 建議 | Round 10 沒有真的送 `pk-start`。跨卡 E2E 的最後一例也沒有直接核對 A 的正式回應與 `raidId`，失敗時較難判斷是哪一步出錯。[PK 測試](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3187>)、[跨卡測試](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:275>) | 前者補配對後開戰，後者在放行 A 前登記 `waitForResponse`，核對 200／409 與成功回應的場次 ID。 |

## 其餘指定路徑

| 路徑 | 本輪核對結果 |
|---|---|
| `raidGamePlan`、活動指紋與競態 | 現行 `interruptions` 按結課、換頁與同課開戰列出受影響活動，包含測驗與檢討、PK 配對、IRS 作答、補救、兩種對戰、魔王戰、搶答、拍照、公布結果、發回批改與彈幕。本輪定位的漏判是上述已發回批改的直接修改。同一個記憶體 Durable Object 並行送出兩個相同有效 token，實得一個 **200**、一個 **409**，後者附 `enter` 新計畫。[指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:452>)、[執行前比對](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1729>)、[請求佇列](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:83>) |
| 手動結課、`POST /api/sessions`、遊戲區換課 | 三個入口各測十字交乘、魔王戰、全班測驗，**9 組通過**。十字交乘的目前與歷史場次均有結束時間，執行到期 alarm 後舊排程清除；魔王戰保留學生答對一題的個人最佳；測驗保留個人成績與該題錯題計數。相對 `d60e98c`，一般開新課現在會完整結算舊課，手動結課也會補記魔王戰結束時間並關閉 PK 搶答。[共用結課](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:526>)、[alarm 清理](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:194>) |
| 課堂內「開戰」 | 比對基準後，原入口仍驗證題庫、難度與時間。`startRaid` 保留上線人數、既有活動收起、個人最佳快照、技能設定與角色沿用。本輪也從此入口開戰並完成學生作答。[課堂入口](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1875>)、[共用開戰](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:579>) |
| `GET /api/games` | 實測未登入 **401**、學生 **403**、教師 **200**。清單依教材所有權、題庫與魔王戰頁篩選，逐筆核對只有 `lessonId`、`lessonTitle`、`title`、`section`。[清單路由](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1708>) |
| 前端 409、`crossPageFocus` | 首次只有 `new` 或 `busy` 為空的 `start` 會直接送出開戰，`enter` 只導頁，`replace` 一律確認。帶新計畫的 409 除 `enter` 外都再詢問；晚到的回應受路由與最後點選卡片檢查。`crossPageFocus` 依課堂 ID 與頁面 ID 保存教師選擇。既有 E2E 使用獨立學生 context 檢查等待畫面與開戰後題目等級。[前端分流](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3846>)、[重點保存](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:1636>)、[師生 E2E](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:175>) |

本輪全程唯讀。9 個既有遊戲區後端案例、TypeScript `--noEmit` 與指定追蹤檔的 `git diff --check` 均通過。瀏覽器 E2E 本輪只核對原始碼；交接檔的 `13/13` 是作者的執行紀錄。八上 3-2 教材與 R2 照片遷移依指定排除。
