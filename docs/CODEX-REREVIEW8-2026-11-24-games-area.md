# Codex 再審：遊戲區（第 9 輪，2026-11-24）

模型 gpt-6.2-astra，reasoning high，唯讀。原文如下。

**需修正後再審。**

## 上一輪項目逐項

| 項目 | 是否修好 | 證據 |
|---|---|---|
| 阻擋 1．兩張卡回應交錯，以及確認框的班級、單元 | 部分修好 | 兩份 `dryRun` 交錯時，`raidPick`／`raidCurrent` 已能丟棄舊計畫。最後一個 E2E 確實檢查 B 班確認框，並在確認後查驗 B 舊課已結束、A 舊課仍進行。但正式開戰請求晚回仍可導向 A，且確認框的「單元」只取卡片標題。詳見下方。[卡片入口](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3102>)、[雙卡 E2E](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:189>) |
| 阻擋 2．十字交乘暫停時取得的 token，恢復後仍可結束對戰 | 已修好 | 指紋已納入 `pausedAt`、`deadline`，確認文字也會標示「暫停中」。第 8 輪後端測試實跑通過，同課 `start`、跨課 `replace` 都回 **409**。另測學生拿題，暫停時回 409，恢復並拒絕舊 token 後回 **200**。[活動指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:471>)、[第 8 輪測試](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:2889>) |
| 應修 1．已關閉的 PK 搶答上場使配對計畫失效 | 已修好 | `pkLobby.buzz` 開著時才帶 `pkBuzz`。實跑確認，無人加入、開了又關，token 相同；原先開著、關閉再重開，舊 token 回 **409**。[PK 指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:466>)、[兩種時序的斷言](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:2909>) |
| 應修 2．離開遊戲區後，載入中的舊卡片仍能送出 | 已修好 | `renderRoute` 在等待載入前更新 `currentRoute`。舊卡入口會直接返回，顯示確認框與正式送出前也都檢查 `/games`、路由版本及選擇序號。[路由切換](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:2858>)、[送出前檢查](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3822>) |
| 建議．拍照題重派、自然到期後實送舊 token 的固定回歸 | 部分補齊 | 第 7 輪測試有公布結果跨頁的 409，也有自然到期後的畫面名稱。拍照題跨頁／同頁重派、自然到期後實送舊 token 仍缺固定斷言。本輪在記憶體另測步驟格鬥與十字交乘到期，兩者的舊 token 都回 **409**。[第 7 輪測試](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:2803>) |

## 新發現

### 阻擋

1. **A 卡正式開戰的回應晚到，仍會把已選 B 班的老師導回 A 班。** 我用目前的前端函式延遲 A 的正式 POST，等 B 的確認框出現後再放行。A 回 **200**，畫面導向 `/session/A`；A 回 **409** 且新計畫為 `enter`，同樣導向 A。成功分支只比 `routeVersion`，409 的 `enter` 分支又位於 `raidCurrent` 檢查之前。這會中斷 B 的確認，把老師帶到另一班的控制台。應在正式回應後、任何導頁、提示或重載前統一檢查 `raidCurrent(opts, rv)`。回歸測試應延遲第二步 POST，覆蓋 200 與 `409 + enter`，並斷言 B 的確認框及網址。A 已送出的命令可能已成功，修正應保護後續畫面。[正式回應處理](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3847>)、[現有 E2E 只延遲 dryRun](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:199>)

2. **十字交乘改成紅藍拔河後，舊確認仍可直接結算剛開啟的團隊賽。** 我在個人模式取得計畫，再由教師控制將 `cross-team` 開啟。兩次 `dryRun` 的清單與 token 完全相同。同課 `start`、跨課 `replace` 送出舊 token 都回 **200**，歷史場次已寫入 `team: true`、`winner: 'draw'` 和結束時間，跨課案例也結束了舊課。這個切換改變分隊及勝負規則。應把 `run.team` 加入活動指紋，在確認文字區分個人對戰與紅藍拔河，並測兩條路徑都回 409、團隊賽仍可繼續。[指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:471>)、[切換分隊](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1958>)、[結算勝負](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:605>)

### 應修

1. **兩個單元的魔王戰頁同名時，確認框無法辨認目標單元。** 在記憶體用教材 API 把八年級 2-2、九年級 1-4 的魔王戰頁都改成同一標題，兩次存檔均回 **200**。`GET /api/games` 仍回傳兩個不同的 `section`，但前端 `opts.unit` 只讀 `<h3>`；同班的兩個確認框因此顯示相同目標。應沿用卡片已算出的年級與單元編號，連同頁面標題傳給確認框。E2E 要斷言實際單元編號，現有斷言只比對 `<h3>`。[卡片上的單元與標題](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:252>)、[確認框取值](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3116>)、[現有斷言](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:219>)

2. **同頁有 `crossPage` 和 IRS 時，合法教材會讓老師失去「開放作答」按鈕。** 我在既有單選題加上 `crossPage`，教材 API 回 **200**。教師面板只要看到 `crossPage` 就隱藏整個 IRS 控制區，學生端則因為有 `activity` 而走一般作答畫面。老師無法從該頁開題，學生也看不到對戰等待提示。應明定這個組合的契約：若支援同頁 IRS，就保留教師控制；若對戰頁須獨立，就在驗證器明確回 400，並同步更新作者文件與測試。[教材驗證](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/validation.ts:543>)、[教師面板](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:1233>)、[學生面板](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:1196>)

### 建議

- **讓雙卡 E2E 直接控制回應順序。** 現有測試用 1.5 秒延遲 A，再額外等待 200 毫秒；執行環境較慢時，即使 A 先回，最終 B 畫面的斷言仍可能通過。可攔住 A，等測試明確觀察到 B 確認框後才釋放 A，再查兩班最終狀態。[雙卡測試](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:198>)

## 其餘指定路徑

| 路徑 | 本輪結果 |
|---|---|
| `POST /api/games/raid` 與前端直接執行 | 同一 token 並行送入實際 Durable Object 的記憶體實例，得到 **200、409**，後者附 `enter` 新計畫。首次 `enter` 只導頁，`new` 與空 `busy` 的 `start` 直接送出；`replace` 和有活動的 `start` 都先確認。[伺服器比對](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1716>)、[前端分流](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3831>) |
| 手動結課、`POST /api/sessions`、遊戲區換課 | 三個入口各驗證魔王戰、測驗、十字交乘，共 **9 組通過**。魔王戰保留個人最佳，測驗保留成績及錯題統計，十字交乘的舊排程在原到期時間由 `alarm()` 清掉。相較 `d60e98c` 有兩項刻意變更：手動結課補寫魔王戰結束時間，一般開新課也會完整結算舊課，符合交接紀錄。[結課共用邏輯](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:515>)、[alarm 清理](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:194>) |
| 課堂內「開戰」與 `GET /api/games` | 對照基準，`startRaid` 保留難度、秒數、在線人數、個人最佳快照、護盾配置與角色沿用。清單實測未登入 **401**、學生 **403**、教師 **200**，排除其他教師教材及缺魔王戰頁的課，只回四個清單欄位。[共用開戰](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:568>)、[清單權限與篩選](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1695>) |
| `crossPageFocus` | 前端函式實測依序取得 `gcf`、同課同頁改選重畫後的 `a1`、另一堂同名頁的 `gcf`。既有 E2E 使用獨立學生 context，查等待畫面及開戰後的 level 1 題目。[重點取值](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:1628>)、[師生 E2E](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:175>) |

本輪全程唯讀。TypeScript `--noEmit`、指定追蹤檔的 `git diff --check`、5 個遊戲區相關後端案例均通過。瀏覽器 E2E 本輪核對了測試碼，未重跑；`games.spec` 3/3 與 `raid-ipad.spec` 4/4 是作者交接紀錄的結果。八上 3-2 教材與照片 R2 修改均排除於本次結論。
