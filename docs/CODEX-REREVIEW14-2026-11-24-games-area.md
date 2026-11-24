# Codex 再審：遊戲區（第 15 輪，2026-11-24）：可以合併

模型 gpt-6.2-astra，reasoning high，唯讀。原文如下。

**可以合併。** 第 14 輪的阻擋已修好，兩種單份批改搭配同課開戰、換課開戰共四組，舊 token 全部回 **409**。原課持續、魔王戰尚未開始，學生仍讀得到新評語。

### 上一輪項目逐項

| 項目 | 是否修好 | 證據 |
|---|---|---|
| 已發回作答直接按「判對／判錯」 | 已修好 | PUT 先算出儲存後的 `verdict.released`，再決定是否呼叫 `bumpRelease`。實測省略 `released` 修改評語，`start`、`replace` 都回 409，並附上更新後的計畫。[判對錯 PUT](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2262>) |
| 已發回作答依規準按一般「儲存」 | 已修好 | 規準評分也依儲存後的 `grade.released` 更新版本，兩種開戰計畫實測都回 409。另測收回後編輯草稿，token 維持相同，學生端看不到草稿。[規準評分 PUT](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2285>) |
| Round 14 後端固定測試 | 通過，涵蓋不完整 | 案例兩次都呼叫 `plan(other)`，實際涵蓋 `replace` 的兩條 PUT。`start` 與最後註解提到的草稿均無固定斷言。本輪已用記憶體課堂補驗。[Round 14 測試](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3377>) |
| Round 13 跨頁發回隔離 | 行為正確，固定測試仍待補 | 本輪在 A 頁取計畫，到 B 頁發回，再回 A 頁，`start`、`replace` 的 token 都與原值相同。現有 Round 13 案例仍只操作一頁。[活動指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:479>)、[Round 13 測試](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3328>) |
| Round 10 的 `pk-start`、跨卡 E2E 的正式回應 | 維持另案 | Round 10 案例停在確認原課仍開著。跨卡 E2E 的最後一例以攔截器旗標、班級清單與固定等待判斷 A 已完成，未直接核對正式回應。[PK 測試](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3187>)、[跨卡 E2E](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:275>) |

### 新發現

**阻擋（合併前必修）：本輪未發現。**

**已知限制／另案處理**

| 分類 | 位置、證據與影響 | 修正方向 |
|---|---|---|
| 應修 | 自訂教材可讓 `raidPage` 同時帶 `activity`。我用通過驗證的混合頁，經課堂 API 開放作答、發回批改，再從同頁取開戰計畫，實得 `start`、`busy: []`，送出後回 200，魔王戰面板蓋過回饋。目前遊戲清單中的魔王戰頁都沒有混放 IRS，教師一般面板也隱藏這種頁面的作答控制，故列為自訂教材邊界。[教材驗證](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/validation.ts:541>)、[發回批改指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:482>)、[學生面板](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:1190>) | 若支援混合頁，同頁開戰也應列入會被蓋過的回饋與結果。若魔王戰頁專供遊戲，則在教材驗證明確拒絕混放，並處理既有課堂快照。 |
| 應修 | 學生修改答案後，若只有舊作答已發回，學生面板只顯示最新作答，開戰計畫卻仍列「已發回的個別批改」。實測造成一次多餘確認，作答與成績均保留。[指紋計數](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:479>)、[學生回饋選取](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:1024>) | 依學生面板相同的最新作答規則，計算實際可見的批改。 |
| 應修／建議 | Round 14 的名稱會讓維護者以為四組情境都有固定保護。Round 13、Round 10 與跨卡 E2E 也有上表所列的覆蓋缺口。[Round 14 測試](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3388>) | 優先把四組 409、原課持續、未開戰、學生可讀新評語及草稿不影響 token 寫成固定斷言。其餘可另補跨頁、實際 `pk-start` 與 E2E 的 `waitForResponse`。 |

### 其餘指定流程

| 路徑 | 本輪核對結果 |
|---|---|
| 計畫指紋與競態 | `raidGamePlan` 依結課、換頁、同頁開戰呼叫 `interruptions`，涵蓋測驗與檢討、PK 配對、作答、補救、對戰、搶答、拍照、公布結果、發回批改與彈幕。實際對同一個記憶體 Durable Object 並行送出兩次相同 token，得到一個 **200**、一個 **409**，後者附 `enter` 新計畫。[指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:452>)、[執行前比對](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1729>)、[請求佇列](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:83>) |
| 手動結課、`POST /api/sessions`、遊戲區換課 | 三個入口各測十字交乘、魔王戰、全班測驗，**9 組通過**。目前與歷史場次都有結束時間，魔王戰保留個人最佳，測驗保留個人成績與錯題計數。另實測換課後執行到期 alarm，舊課排程已清除。相對 `d60e98c`，一般開新課現在會完整結算舊課，手動結課也會補記魔王戰結束時間並關閉 PK 搶答。[共用結課](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:526>)、[alarm 清理](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:194>) |
| 課堂內「開戰」 | 比對基準後，入口仍驗證題庫、難度與時間，`startRaid` 保留上線人數、活動收起、個人最佳快照、技能設定與角色沿用。本輪也從課堂入口開戰，完成學生答題及結算。[課堂入口](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1875>)、[共用開戰](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:579>) |
| `GET /api/games` | 實測未登入 **401**、學生 **403**、教師 **200**。路由依教材所有權、題庫、魔王戰頁篩選，逐筆確認只回 `lessonId`、`lessonTitle`、`title`、`section`。[清單路由](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1708>) |
| 前端 409 與 `crossPageFocus` | 初次計畫只有 `new` 或 `busy` 為空的 `start` 會直接送出開戰；`enter` 只導頁，`replace` 一律確認。409 帶新計畫時，除 `enter` 外均再確認；無計畫的 409／404 會重載清單。晚到回應受路由版本與最後點選卡片檢查。`crossPageFocus` 以課堂 ID 和頁面 ID 保存手選值，E2E 原始碼使用獨立學生 context 核對等待畫面及開戰後的題目等級。[前端分流](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3846>)、[重點保存](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:1636>)、[師生 E2E](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:175>) |

本輪全程唯讀，以記憶體編譯執行 **10 個既有遊戲區後端案例，全數通過**。TypeScript `--noEmit` 與指定追蹤檔的 `git diff --check` 通過。瀏覽器 E2E 本輪僅核對原始碼，交接檔的 **14/14** 是作者的執行紀錄。八上 3-2 教材與 R2 照片遷移依指定排除。
