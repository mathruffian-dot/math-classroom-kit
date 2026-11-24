# Codex 再審：遊戲區（第 11 輪，2026-11-24）

模型 gpt-6.2-astra，reasoning high，唯讀。原文如下。

**需修正後再審。** 第 10 輪的 PK 配對阻擋已修好，但跨課 `replace` 仍會接受舊 token，結束學生正在檢討結果的課堂。三個獨立案例都重現了這個問題。

## 上一輪項目逐項

| 項目 | 是否修好 | 證據 |
|---|---|---|
| 阻擋：`replace` 漏算未開搶答的 PK 配對 | **已修好** | `interruptions` 在結課時納入整個 `pkLobby`、配對輪次及開放中的搶答輪次。我依序建立空配對、讓 1 號等待、再將 1、2 號配成一組。三個較早階段的 token 都回 409，原課隨後執行 `pk-start` 回 200。[配對指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:466>) |
| 應修 1：卡片與確認框使用穩定的單元編號 | **已修好** | 用相同課名 `Final practice`、相同魔王戰頁名 `Review` 執行卡片函式。`section` 為 `1-4`、`2-2` 時，分別得到「九年級 1-4」、「九年級 2-2」。卡面、按鈕與確認框共用這個標籤。[卡片標籤](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:242>) |
| 應修 2：`raidGameError`／`renderGames` 忽略舊卡回應 | **部分修好** | `renderGames` 取得清單後會再次檢查 `raidCurrent`，舊卡已無法重畫。實測暫停 A 的 dashboard 回應、切到 B 再放行 A，重畫次數為 0，但共用 `dashboard` 仍被覆寫成 A 的舊資料。[錯誤重載](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3873>)、[資料寫入](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:195>) |
| 應修 3：round 9 測試解除教材依賴 | **部分修好** | 已移除對另案八上 3-2 的依賴，round 9 本輪也通過。但測試仍讀取正式教材 `g8-2-3a.json`，並要求其中至少有一題單選題。這份檔案已納入 git，原先乾淨 checkout 的缺檔問題已解決，教材可獨立改版的要求仍未達成。[round 9 測試](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3029>) |
| 應修 3：`AUTHORING` 說明 `crossPage` 與 `activity` 互斥 | **已修好** | 文件明寫同頁存檔回 400，並指示把作答放在別頁，與驗證器一致。[作者文件](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/AUTHORING.md:333>)、[驗證器](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/validation.ts:542>) |
| 建議：`games.spec` 最後一個測試等待 A 的正式回應 | **部分採用** | 已等 B 的確認框出現才放行 A。200 分支新增輪詢，確認 A 班已有目標教材的進行中課堂，但沒有斷言 `session.raid.id`，也沒有等待瀏覽器讀完 A 的正式回應。最後仍靠固定 300 毫秒判定 B 的畫面穩定。[最後一個 E2E](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:249>) |

## 新發現

### 阻擋

**1. 換課確認後才公布的結果，仍會被舊 token 中斷。** `replace` 傳入 `end: true, move: false, start: false`。公布中的 IRS 結果只在 `how.move` 時納入指紋，已結束但仍供檢討的測驗、十字交乘等結果則只在 `how.start` 時納入。[中斷判定](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:464>)、[`replace` 計畫](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:490>)

我先取得跨課計畫，再讓原課分別進入以下狀態，並以學生身分讀取當下課堂。

| 取得計畫後，原課發生的變化 | 學生端在換課前可讀到 | 再次 dryRun | 送出舊 token |
|---|---|---|---|
| 教師公布當頁 IRS 結果 | `resultsVisible: true` | `busy: []`，token 相同 | 200 |
| 教師開完全班測驗，結束測驗並留在檢討畫面 | 有 `endedAt` 的測驗結果 | `busy: []`，token 相同 | 200 |
| 教師結束十字交乘，保留結果畫面 | 有 `endedAt` 的對戰結果 | `busy: []`，token 相同 | 200 |

三例執行後，原課均變成 `ended: true`，學生再次讀取目前課堂都已進入新魔王戰。歷史資料仍保留，但全班當下的檢討被中斷，教師看到的確認框沒有列出這項影響。建議 `replace` 也納入學生正在看的公布或檢討狀態，沿用結果頁與輪次、各場次 ID 作指紋。回歸測試應斷言舊 token 回 **409**，而且學生仍能留在原課查看同一份結果。[學生目前課堂選取](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1743>)

### 應修

1. **在寫入共用 `dashboard` 前檢查選卡序號。** 現在 `await loadDashboard()` 已經寫入全域資料，呼叫端才檢查 `raidCurrent`。因此 B 卡或新頁面的畫面可以保持正確，下一次操作讀到的班名與課堂清單卻可能來自舊快照。錯誤重載可先將回應存入區域變數，確認路由與選卡序號仍有效才寫入；保留 `renderGames` 在清單回來後的第二次檢查。[寫入位置](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:195>)、[使用班名的位置](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3125>)
2. **讓 round 9 的驗證器案例自行提供單選題。** 現在只要 `g8-2-3a` 改掉最後一題單選題，`assert(q)` 就會先失敗，測不到 `crossPage` 的契約。用固定的最小 lesson、crossPage 頁及 single activity，分別斷言可單獨存檔與同頁被拒，即可解除這項教材耦合。[測試位置](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3030>)

### 建議

1. **把本輪實測成功的 PK 後續操作收進 round 10 測試。** 測試名稱寫了「PK can still start」，實際最後一行只檢查 `ended === false`。建議加入 1、2 號配對，確認舊 token 遭拒後直接斷言 `pk-start` 回 200。這能防止課堂仍開著、配對卻已無法使用的回歸。[round 10 測試](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:3183>)
2. **以正式回應完成取代 E2E 的固定等待。** 放行 A 前先登記 `waitForResponse`，比對 A 班、非 dryRun 的 POST 與預期的 200／409，讀完回應後再斷言 B 的網址與確認框。200 分支另驗證 A 的 `raid.id`。這樣才能分別證明伺服器已開戰、瀏覽器收到遲來回應後仍留在 B。[E2E 等待與斷言](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:275>)

## 其餘指定路徑

| 路徑 | 本輪核對結果 |
|---|---|
| `POST /api/games/raid` 與前端 409 | 同一 token 並行送入記憶體 Durable Object，得到 **200、409**，後者附 `enter` 新計畫。前端首次遇 `enter` 只導頁，`new` 或空 `busy` 的 `start` 才直接送出。收到附計畫的 409，僅 `enter` 直接導頁，其餘重新確認。上列阻擋發生在伺服器算出的指紋。[伺服器比對](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1720>)、[前端分流](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3840>) |
| 手動結課、`POST /api/sessions`、遊戲區換課 | 三個入口各實測十字交乘、魔王戰與全班測驗，**9 組通過**。十字交乘寫入結束時間，另以 Durable Object alarm 驗證三個入口均在原到期點清除舊排程。魔王戰保留學生答對一題的個人最佳，測驗保留成績及錯題計數。與 `d60e98c` 相比有兩項預期變更：手動結課會補記魔王戰結束時間並關閉 PK 搶答，一般開新課也會完整結算舊課。[共用結課邏輯](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:517>)、[alarm 清理](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:194>) |
| 課堂內「開戰」 | 對照基準差異，原入口保留難度與秒數驗證；`startRaid` 保留上線人數、舊活動收尾、個人最佳快照、題庫設定與前一場角色沿用。[課堂入口](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1866>)、[開戰實作](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:570>) |
| `GET /api/games` | 實測未登入 **401**、學生 **403**、教師 **200**。程式依教師擁有權、題庫與魔王戰頁篩選；實際清單每筆只有 `lessonId`、`lessonTitle`、`title`、`section`。[清單查詢](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1699>) |
| `crossPageFocus` | 執行實際面板函式，頁面預設為 `gcf`，同課同頁改選後重畫取得 `a1`，另一堂使用相同頁 ID 仍取回自己的 `gcf`。師生分開 browser context 的流程已收在 E2E。[面板焦點](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:1633>)、[師生 E2E](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:153>) |

本輪全程唯讀。TypeScript `--noEmit`、指定追蹤檔的 `git diff --check`、7 個既有遊戲與結課後端案例均通過。瀏覽器 E2E 本輪已逐行審查，未重新執行；交接檔的 `games.spec` 加 `homework.spec` 共 13/13 為作者的執行紀錄。八上 3-2 教材與照片 R2 修改均排除於本次審核。
