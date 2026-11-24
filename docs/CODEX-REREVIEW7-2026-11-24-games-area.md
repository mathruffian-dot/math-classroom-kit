# Codex 再審：遊戲區（第 8 輪，2026-11-24）

模型 gpt-6.2-astra，reasoning high，唯讀。原文如下。

**需修正後再審。** 第 7 輪的 2 個阻擋與 2 個應修均已修好；本輪另重現 2 個阻擋，其中一個會結束老師最後選擇以外的班級。

## 上一輪項目逐項

| 項目 | 是否修好 | 證據 |
|---|---|---|
| 阻擋 1．A 頁的確認可收掉 B 頁的公布結果或拍照題 | 已修好 | `resultsSlide`、`photoSlide` 與各自輪次已納入指紋。實測公布結果、派發拍照各做「跨頁重開」及「同頁重開」，四種情況的舊 token 均回 **409**，新一輪仍開放，魔王戰尚未建立。[指紋比對](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:474>) |
| 阻擋 2．PK 搶答上場、彈幕關閉再開，仍接受舊確認 | 已修好 | 兩個入口分別遞增 `rounds.pkBuzz`、`rounds.danmaku`。實跑換課案例，關閉再開後送舊 token 均回 **409**，原課保留。[後端回歸案例](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:2813>) |
| 應修 1．一般搶答錯誤地使同頁 PK 配對的確認失效 | 已修好 | `Session.rounds` 已將 `buzz` 與 `pk` 分開。已在魔王戰頁且有 PK 配對時，另開一般搶答，前後 `busy` 與 token 相同。另有一個涉及 `pkBuzz` 的誤報，列在下方。[兩種活動並存的回歸案例](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:2824>) |
| 應修 2．自然到期的步驟格鬥、十字交乘仍列為進行中 | 已修好 | 現行計畫使用 `duelOver(run, duelState(...))` 與 `crossOver(run, now)`。實測跨過期限、尚未寫回 `endedAt` 時，清單分別顯示「步驟格鬥結果」「十字交乘結果」；送到期前的 token 均回 **409**，結果保留。[計畫判斷](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:462>) |
| 建議．唯讀計畫免觸發全班推送 | 已修好 | 實測 `dryRun` 與 `enter` 的成功回應都有 `X-Classroom-Quiet: 1`，符合 Durable Object 略過廣播的條件。[API 回應](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1692>)、[廣播條件](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:106>) |
| 手動結課、`POST /api/sessions`、遊戲區換課 | 三個入口的結算通過 | 三個入口各測十字交乘、測驗、魔王戰，共 **9 組通過**。目前與歷史場次的結束時間一致，測驗保留班級成績與錯題統計，魔王戰保留個人最佳。另以記憶體儲存執行實際 DO 的 `alarm()`，三條路徑都會在原定時間清理對戰索引。相較 `d60e98c`，手動結課補全魔王戰結算，一般開新課也改為完整結算舊課，符合交接紀錄。[結課實作](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:515>)、[alarm 清理](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:208>) |
| 課堂內「開戰」、`GET /api/games` | 通過 | 對照基準，`startRaid` 保留難度、秒數、在線人數、舊活動結算、個人最佳快照、護盾配置與角色沿用。清單實測未登入 **401**、學生 **403**、教師 **200**；排除其他教師教材與缺魔王戰頁的課，只回 `lessonId`、`lessonTitle`、`title`、`section`。[共用開戰](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:568>)、[清單篩選](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1669>) |
| token 比對、前端直接執行與 409 | 既有案例通過，另有下列競態 | 同一 token 並行送進 DO，實得 **200、409**，第二份計畫是 `enter`。前端函式實測，首次只有 `new` 與空清單的 `start` 直接送出，`enter` 只導頁，`replace` 一律詢問。有新計畫的 409 只有 `enter` 直接導頁；404 或無計畫的 409 會提示並重載。[伺服器重算](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1690>)、[前端確認](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3814>) |
| `crossPageFocus` | 通過函式驗證 | 頁面預設 `gcf`，同課同頁改選後重畫讀回 `a1`，另一堂的同名頁仍讀回 `gcf`。現有 E2E 使用獨立學生 context，檢查等待畫面與開戰後收到的 level 1 題目。[面板取值](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:1626>)、[師生 E2E](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:175>) |

## 新發現

### 阻擋

1. **兩張遊戲卡的回應交錯，可能結束錯班。** 我以兩個正在上同名課程的班級測試，先點 A 卡、再點 B 卡，讓 B 的計畫先回、A 後回。兩次確認框的可見文字相同；A 的回應覆蓋了 B 的按鈕資料。將前端確認函式接到記憶體 Worker，按一次確認後，實際結果是 **A 班舊課已結束，最後選擇的 B 班仍在上課**。兩份 token 對各自班級都有效，所以伺服器不會回 409。應讓同一頁只有最後一次選擇能顯示確認框或送出，並在確認框明列班級與目標單元。回歸測試應斷言兩班最後的課堂狀態。[卡片請求](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3100>)、[確認框內容](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3818>)

2. **十字交乘從暫停恢復作答後，暫停時取得的 token 仍能收掉對戰。** 指紋只記 `[run.id, crossLive]`，暫停與進行中得到相同值。實測暫停時學生拿題回 **409**，恢復後拿題回 **200**，此時送舊 token 仍回 **200**。同課 `start` 直接收掉已恢復的對戰，跨課 `replace` 則結束整堂舊課。應讓指紋與確認文字區分「暫停中、作答中、已結算」，並在兩種模式都驗證舊 token 回 409、學生仍可繼續作答。[活動指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:471>)、[學生收件判斷](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2521>)、[既有畫面狀態](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/cross-live.ts:106>)

### 應修

1. **已關閉的 PK 搶答上場仍會讓相同的配對計畫回 409。** 實測在 PK 配對中取得計畫，再開放、關閉搶答上場，期間無人加入。前後名單相同，`busy` 都只有「PK 配對」，舊 token 卻回 **409**。原因是配對指紋無條件納入 `r.pkBuzz`。應保留配對輪次及名單，只在 `pkLobby.buzz` 開放時納入該收件輪次。這樣仍可攔住第 7 輪的「開放 → 關閉 → 重新開放」案例。[PK 配對指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:466>)

2. **離開遊戲區後，載入空檔內仍可從舊卡片開戰。** `renderRoute` 先更新路由，再等待 `loadDashboard()`，這段期間舊卡片仍可點擊。若此時才點卡片，處理器會取得**新路由**的 `routeVersion`，後續版本檢查因此通過。前端函式驗證中，當 `currentRoute` 已是 `/records`，舊卡片仍能送出開戰請求並導回課堂。應在卡片入口與送出前核對目前路由確為 `/games`，並在離頁時停用舊卡片。[路由載入順序](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:2856>)、[卡片取得路由版本](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3110>)

### 建議

將本輪補測的「拍照題跨頁及同頁重派」與「自然到期後實送舊 token」納入固定回歸測試。現有第 7 輪案例已斷言公布結果跨頁的 409；拍照分支與到期後的提交結果仍缺相同層級的斷言。[現有回歸案例](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:2798>)

本輪全程唯讀。已實跑 TypeScript `--noEmit`、指定追蹤檔的 `git diff --check`、4 個既有後端案例，以及上述記憶體 Worker、DO 與前端函式檢查。瀏覽器 E2E 本輪只核對原始碼，iPad 護盾仍缺本版通過紀錄。八上 3-2 教材與照片 R2 儲存排除於本次結論。
