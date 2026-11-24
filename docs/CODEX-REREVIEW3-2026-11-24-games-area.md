# Codex 複審：遊戲區（2026-11-24，第 4 輪）

審核者：Codex CLI（gpt-6.2-astra，model_reasoning_effort=high，read-only）。任務：`docs/codex-rereview3-games-area-task.txt`。

**需修正後再審。** 第 3 輪的測驗案例已修好，但我重現了兩條仍會在老師未確認下中斷活動的路徑：409 後遇到 PK 配對或補救練習，以及課堂 ID 不變、另一個分頁剛開測驗。

## 上一輪項目逐項

| 項目 | 是否修好 | 證據 |
|---|---|---|
| 第 3 輪阻擋：409 後自動重送 | **部分** | 實測 A 換成正在測驗的 B，第一次 POST 回 409，前端再次詢問，B 的測驗保持進行。新增 E2E 也有在第二次確認**之前**檢查測驗仍在、魔王戰尚未建立。但 B 正在 PK 配對或補救練習時，實測仍是 `409 → 200`。[E2E 斷言](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:120>) |
| 第 3 輪應修 1：離頁後的晚到回應 | **晚到回應已修，舊確認框仍可送出** | 延遲成功、409、404 回應，再切到 `/records`，三者都沒有導頁、重畫或彈窗。但若確認框在離頁前已開啟，其按鈕仍能送出有效 POST，詳見下方應修 2。[回應處理](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3817>) |
| 第 3 輪應修 2：教材或班級刪除後仍可反覆點舊卡 | **是** | 在遊戲頁收到 404，實測前端依序重讀 dashboard 與遊戲清單。沒有 `current` 的教材不可用 409 也走相同流程。[錯誤分流](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3825>) |
| 前輪：課堂比對、遊戲清單權限與資料 | **課堂 ID 比對及清單已修** | Worker 在變更前比對該班進行中的課堂與 `expectSessionId`，不符即回 409。`GET /api/games` 實測未登入 401、學生 403、教師 200；清單限自己擁有且同時有題庫與魔王戰頁的教材，每張卡只回 `lessonId`、`lessonTitle`、`title`、`section`。[清單與開戰入口](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1587>) |
| 前輪：手動結課、一般開新課、遊戲區換課的結算 | **是** | 三個入口逐一實測，皆寫入目前與歷史魔王場次的結束時間、個人最佳、班級測驗成績與錯題統計；限時十字交乘也留下結束紀錄，並對舊課呼叫 `scheduleCross(id, null)`。相較 `d60e98c`，一般 `POST /api/sessions` **新增完整結算**，手動結課則補齊進行中魔王戰的結算。DO 仍沿用到期時清理舊排程的機制。[共用結算](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:445>)、[alarm 實作](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:194>) |
| 前輪：課堂內「開戰」、同場沿用與換課人數 | **課堂內入口已修** | 與基準差異逐段核對，原本的難度、秒數、人數、護盾設定、角色沿用及個人最佳邏輯保留。記憶體實跑既有開戰、個人最佳與護盾後端案例通過；遊戲區換課也通過三名心跳學生計入人數的斷言。遊戲卡對自然結束場次的判定另見應修 1。[共用開戰邏輯](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:497>) |
| 前輪：`crossPageFocus`、驗證與師生畫面 | **是** | 教師改選依「課堂 ID＋投影片 ID」寫入，重畫時讀回；開戰取目前勾選值。驗證器直接檢查原始 `focus`。E2E 有獨立學生 context，涵蓋 `gcf → a1 → 重畫 → 開戰 → 學生收到 level 1`。[選擇讀回](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:1624>)、[師生斷言](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:144>) |
| 第 3 輪建議：測試隔離、`raid-ipad` 追查 | **隔離已修；護盾 E2E 待確認** | `games.spec.ts` 每案建立臨時班級，學生用該班代碼，結束後清除。作者已記錄護盾失敗點與基準版通過結果；修改版第二次重跑因伺服器中斷，尚無完整通過紀錄。[臨時班級](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:13>)、[作者紀錄](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/REVIEW-2026-11-24-games-area.md:80>) |

## 新發現

### 阻擋

1. **409 後仍會自動清掉 PK 配對與補救練習。** `confirmRaidGame()` 的 `busy` 只看一般作答、測驗、步驟格鬥與十字交乘；409 的 `current` 也缺少 `pkLobby`、`practice`。我建立已有一組配對的 B 課，再用老師先前看到的 A 課送出，實際得到 `409 → 自動 POST 200`，原配對被清空。換成正在做補救練習的 B 課，得到同樣結果，`practice` 變成 `null`。**修正方向**：課堂 ID 已改變時，凡下一步會開戰或翻頁，一律顯示最新班級、課名並等老師確認；只有進入既有戰場的唯讀導頁可直接執行。首次點卡也應涵蓋開戰及換頁會收起的活動。回歸測試應斷言第二次確認前，配對和練習仍在。[前端判定](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3806>)、[409 回傳欄位](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1612>)、[開戰清理](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:500>)

2. **同一堂課內換了活動，開戰請求仍會通過。** 我讓遊戲卡讀到 B 課閒置，再從另一分頁於 B 開全班測驗，最後送出原本的開戰請求。Worker 因 `expectSessionId` 仍等於 B 而回 **200**，新測驗立即寫入 `endedAt`，全程沒有確認框。這條路甚至不會進入 409 處理。**修正方向**：讓請求帶上老師看到、同意收起的活動狀態，例如活動種類與場次 ID；Worker 在同一次序列化操作中核對，有變化就回 409。測試需固定課堂 ID，只在讀取與送出之間更換活動。[前置讀取](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3106>)、[Worker 比對](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1607>)

### 應修

1. **魔王戰自然結束後，遊戲卡會把老師帶回舊結算。** 前端以 `!raid.endedAt` 判定正在打，Worker 則用 `raidOver()` 把已分勝負或超時也算結束。實測超時後，課堂已有 `raid.results`、`endedAt` 仍未設定；點卡只導向舊課堂。同一狀態直接走開戰 API，才取得新 `raidId`。**修正方向**：讓前置查詢與 409 回應都提供由 Worker 計算的「此場仍可繼續」狀態，並補自然超時後從卡片重新開戰的測試。[前端捷徑](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3808>)、[後端結束判定](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/raid.ts:54>)

2. **離開遊戲頁後，已開啟的舊確認框仍能結束原課。** 確認框在獨立的 `#modal-root`，切換路由時仍會保留。確認按鈕把舊 `rv` 傳給 `startRaidGame()`，但該函式在發出 POST **之後**才檢查版本。實測以舊 `rv` 在 `/records` 送出，Worker 回 200、原課已結束，畫面仍停在紀錄頁。**修正方向**：離開遊戲區時關閉該確認框，並在 `startRaidGame()` 第一行核對路由與版本。以「確認框已開 → 瀏覽器上一頁 → 舊操作不得發出 POST」補回歸測試。[確認按鈕](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3112>)、[POST 與版本檢查順序](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3817>)

### 建議

- **補齊修改版 `raid-ipad` 護盾案例的瀏覽器結果。** 作者記錄的失敗點是「破盾 2/3 → 破防」。本輪後端護盾案例通過，學生 iPad 畫面的這段轉換仍待驗證。建議以獨立測試服務重跑同一案例，將失敗斷言或通過結果補回交接檔。[作者追查紀錄](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/REVIEW-2026-11-24-games-area.md:80>)

本輪全程唯讀。TypeScript 無輸出檢查、指定追蹤檔的 `git diff --check`、上述記憶體 Worker 與前端函式案例均已實跑。瀏覽器 E2E 本輪只核對原始碼；`games.spec` 的 2/2 為作者紀錄。八上 3-2 教材未納入本次審查。
