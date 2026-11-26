# Codex 再審：遊戲區（第 13 輪，2026-11-24）

模型 gpt-6.2-astra，reasoning high，唯讀。原文如下。

**需修正後再審。** 第 12 輪已修好整批「發回批改」，但教師從單份作答按「儲存並發回」時，舊確認仍可能開戰或結束原課，收起學生剛收到的新回饋。

## 上一輪項目逐項

| 項目 | 是否修好 | 證據 |
|---|---|---|
| 已發回的個別批改應列入 `interruptions`，舊 token 應回 409 | **部分修好** | 我用學生帳號送出作答，教師整批發回後，`start`、`replace` 的新計畫都列出「已發回的個別批改」。兩種舊 token 都回 **409**，原課持續，學生仍可讀到回饋。單份重新發回的例外見下方阻擋。 [活動指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:479>) |
| `rounds.release` 應能分辨同一活動的不同發回輪次 | **部分修好** | 整批發回會遞增輪次。單份「儲存並發回」走另一個 `PUT`，只更新批改與 `session.revision`。發回份數相同時，開戰指紋仍相同。 [整批發回](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2194>)、[單份發回](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2280>) |
| Round 12 後端測試 | **既有案例通過，涵蓋不足** | 測試名稱寫了 `start` 和 `replace`，實際只對另一課 `other` 取計畫、送舊 token，且只呼叫整批發回。它確實驗到 `replace` 回 409、原課未結束、學生仍有一份回饋。本輪另補驗 `start` 與單份發回。 [測試本體](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3259>) |
| Round 10 補驗 `pk-start` | **行為通過，固定案例仍可另案** | 舊 token 回 409 後，我用兩個已上線座號完成配對，`pk-start` 回 **200**。現有固定案例停在 `ended === false`。 [Round 10 測試](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3187>) |
| 跨卡 E2E 等待 A 的正式回應 | **仍可另案** | 最後一例放行 A 後檢查攔截器旗標，200 分支另查班級課程，再固定等 300 毫秒。它尚未直接核對 A 的正式回應與 `raidId`。 [跨卡測試](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:275>) |

## 新發現

### 阻擋（合併前必修）

**1. 同一份作答收回後重新發回，上一輪的開戰確認仍然有效。**

教師可用現有介面重現：先發回一份批改，在遊戲區取得開戰確認，再回課堂按「收回批改」，打開該份作答，改評語並按「儲存並發回」。我在學生 API 確認已讀到新評語，再送出收回前的舊 token，得到下列結果。 [教師端送出位置](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:4117>)、[後端指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:482>)

| 路徑 | 新舊 token | 送出舊 token 的實際結果 |
|---|---|---|
| `start`，同一堂課換頁開戰 | 相同 | **200**。原課隨即開戰，學生面板改顯示魔王戰。 |
| `replace`，改開另一課 | 相同 | **200**。原課被標為結束，新課開戰。 |

**影響。** 教師同意收起的是前一次發回的回饋。其後教師已收回、改批並重新發回，系統卻仍接受舊確認。成績有保存，出錯的是課堂狀態與學生檢討時間。 [學生面板的顯示順序](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:1190>)

**修正方向。** 讓整批發回與單份「儲存並發回」共同更新**該活動**的發回版本，並把版本納入指紋。固定測試應讓 `start`、`replace` 都走一次「取舊計畫 → 收回 → 單份改批並發回 → 送舊 token」，斷言 **409、原課未結束、尚未開戰、學生仍讀得到新評語**。

### 已知限制／另案處理

- **應修：另一頁發回會讓目前頁多一次 409。** 我在 A 頁取得計畫，切到 B 頁整批發回，再回 A 頁。A 的批改與待收起清單都相同，舊 token 卻回 **409**。原因是 `rounds.release` 屬於整堂課。影響是教師要重按確認；上面的活動層級版本也可一併解決。 [輪次定義](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/shared/types.ts:622>)、[指紋取值](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:482>)
- **建議：保留兩項測試強化。** Round 10 可把已實測通過的 `pk-start` 寫進固定案例。跨卡 E2E 可在放行 A 前登記 `waitForResponse`，核對其 200／409，成功時再比對 `raidId`，最後確認 B 的對話框仍在。這能讓測試直接觀察所聲稱的結果。 [PK 測試](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3197>)、[跨卡 E2E](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:275>)

## 其餘指定路徑

| 路徑 | 本輪核對結果 |
|---|---|
| `POST /api/games/raid` 與前端 409 | 對同一個記憶體 Durable Object 並行送相同 token，得到 **200、409**，後者帶 `enter` 新計畫。前端首次只對 `new` 或空 `busy` 的 `start` 直接開戰，`replace` 一律確認；收到帶計畫的 409 後，只有 `enter` 直接導頁，其餘再確認。已定位的阻擋在發回版本。 [後端比對](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1725>)、[前端分流](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3846>) |
| 手動「結束課堂」、`POST /api/sessions`、遊戲區換課 | 三個入口各測十字交乘、魔王戰與全班測驗，**9 組通過**。十字交乘有結束時間，到期執行 alarm 後清除舊排程；魔王戰保留答對一題的個人最佳；測驗保留個人成績與該題錯題計數。相對 `d60e98c` 有刻意的行為差異：手動結課會補記魔王戰結束時間並關閉 PK 搶答，一般開新課也會完整結算舊課。 [共用結課邏輯](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:522>)、[alarm 清理](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:194>) |
| 課堂內「開戰」 | 與基準差異逐段核對，課堂入口保留題庫、難度與時間檢查；抽出的 `startRaid` 保留上線人數計算、其他活動收起、個人最佳快照、技能設定與前一場角色沿用。本輪亦從課堂入口實際開戰、作答並核對個人最佳。 [課堂入口](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1875>)、[開戰邏輯](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:575>) |
| `GET /api/games` | 實測未登入 **401**、學生 **403**、教師 **200**。查詢按教師所有權、題庫與魔王戰頁篩選，實際回傳欄位只有 `lessonId`、`lessonTitle`、`title`、`section`。 [清單路由](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1704>) |
| `crossPageFocus` | 以實際面板函式核對，同堂同頁預設 `gcf`，教師改選後重畫仍為 `a1`；另一堂使用相同頁面 ID 時讀到自己的 `gcf`。既有 E2E 另以獨立學生 context 核對等待畫面與開戰後的題目等級。 [面板取值](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:1636>)、[師生 E2E](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:175>) |

本輪全程唯讀，以記憶體編譯重跑 9 個既有後端案例，均通過；TypeScript `--noEmit` 與指定追蹤檔的 `git diff --check` 也通過。瀏覽器 E2E 本輪僅審閱原始碼，交接檔的 `13/13` 是作者的執行結果。八上 3-2 教材及 R2 照片遷移均依指定排除。
