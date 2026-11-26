# Codex 複審：遊戲區、遊戲區開魔王戰、十字交乘對戰頁（2026-11-24，第 2 輪）

審核者：Codex CLI（gpt-6.2-astra，model_reasoning_effort=high，read-only）。任務：`docs/codex-rereview-games-area-task.txt`。

**需修正後再審。** 上輪兩個阻擋的核心行為都已修好，但進行中的魔王戰遇到結課或換課時，仍會漏記場次結束時間與個人最佳。

## 上一輪項目逐項

| 項目 | 是否修好 | 證據 |
|---|---|---|
| 阻擋 1．確認 A 堂卻結束 B 堂 | 是，前端提示仍有缺口 | 前端送出老師看到的 `expectSessionId`，無課時明確送 `null`。Worker 在同一個 Durable Object 佇列操作中先比對，再換課。我在記憶體實測「原以為無課」及「確認 A 後已換成 B」兩種情況，均回 409，`current.id` 指向 B，B 與另一班的課都仍在進行。`src/main.ts:3101`、`worker/app.ts:1598`、`worker/index.ts:98`。 |
| 阻擋 2．遊戲卡只翻頁、沒有開戰 | 是 | 入口現在一次完成開課或沿用課堂、定位魔王戰頁、建立場次。記憶體實測再次進入會沿用同一 `raidId`。E2E 原始碼也檢查所選難度、獨立學生 context 的 `raid-card` 及再次進入的場次 ID。`worker/app.ts:1605`、`tests/e2e/games.spec.ts:74–94`。 |
| 應修 1．被取代的課跳過結算 | **部分** | 手動「結束課堂」、一般 `POST /api/sessions` 換課、遊戲區換課，三條路徑實測都會寫入測驗場次結束時間、班級成績歷史與錯題統計，也會結束十字交乘並更新歷史場次。三條路徑也都漏掉**尚在進行的魔王戰**。手動結課保留了 `d60e98c` 的既有行為，一般開新課則依本次需求增加了結算。`worker/app.ts:299`、`:400`、`:437`、`:1572`、`:2060`。 |
| 應修 2．沿用同堂會無條件翻頁 | 是 | 只有頁碼不同才呼叫 `moveSlide()`。記憶體實測在同頁開啟搶答再進遊戲，搶答與原場次都保留。把進行中課堂的快照設為缺少魔王戰頁後，請求回 409，課堂 revision 維持原值。`worker/app.ts:1610–1617`。 |
| 應修 3．遊戲卡可能沒有題庫 | 是 | `GET /api/games` 要求教師身分，只列本人擁有、同時有題庫及魔王戰頁的教材。實測未登入回 401、學生回 403，教師取得的每筆資料只有 `lessonId`、`lessonTitle`、`title`、`section`。POST 也在結束舊課前重驗教材、班級所有權、題庫與頁面。`worker/app.ts:1578–1594`。 |
| 應修 4．手選十字交乘重點在重畫後消失 | 是 | `change` 事件依「課堂 ID＋投影片 ID」寫入 `crossPageFocus`；尚未開戰時，重畫優先讀回該頁選擇。E2E 已有 `gcf → 手選 a1 → 搶答觸發重畫 → 開戰 → 獨立學生端收到 level 1` 的斷言。`src/main.ts:1620`、`:1689`、`:4082`、`tests/e2e/games.spec.ts:122–130`。 |
| 應修 5．`["gcf"]` 被當成合法重點 | 是 | 驗證器直接把原值交給 `isCrossFocus()`。透過記憶體 API 實測，四個合法字串均回 200，陣列、`null`、未知字串與缺少 `focus` 均回 400。`worker/validation.ts:468`、`shared/game-focus.ts:55`。 |
| 建議 1．學生開戰前的等待畫面 | 是 | 已有「等老師開始十字交乘對戰」；E2E 分別檢查學生等待文字、教師端無一般活動提示，以及開戰後學生看到作答卡。`src/main.ts:1188`、`tests/e2e/games.spec.ts:116–130`。 |
| 建議 2．窄螢幕與鍵盤驗收 | 部分 | 控制項已有單元名稱，520px 以下表單改單欄。教師 E2E 視窗仍固定為 1440px；820px 是學生視窗。尚缺教師遊戲區的窄版溢出、觸控框，以及按 Escape 取消換課後原課仍在的驗收。`src/main.ts:246`、`src/styles.css:5554`、`tests/e2e/games.spec.ts:19`。 |
| 建議 3．隔離測試資料、補作者文件 | 部分 | 測試教材已有唯一 ID 與清理，作者指南也補齊四種重點及師生畫面。測試仍會把共用 `DEMO801.requireCode` 改為 `false`，並在該班開課；若重用已有課堂的測試站，原課會被結束，清理也不會還原班級設定。`tests/e2e/games.spec.ts:11–28`、`:54`、`docs/AUTHORING.md:324`。 |

## 新發現

### 阻擋

1. **魔王戰進行中結課，場次和個人最佳沒有一起結算。** `endSessionState()` 先呼叫 `recordRaidBest()`，而後者遇到尚無勝負、尚未到期、也未標記結束的場次就直接返回。我用已有一筆答對紀錄的進行中場次，分別測手動結課、一般換課及遊戲區換課。三者都是課堂已結束，`session.raid.endedAt`、歷史 `raidRuns[].endedAt` 與該生的 `raidBestBy` 卻仍無值。後續讀取舊場次時，戰況也會繼續依讀取時間推算。這是舊版手動結課已有的缺口，本次遊戲區換課也繼承了它。建議讓結課和既有 `raid-end` 共用同一段邏輯，先把結束時間寫入目前與歷史場次，再記個人最佳，並保留教師查看結算畫面的資料。另測三個入口提前結束後，戰況停止、下次開戰取得正確 `prevBest`。[結課邏輯](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:437>)、[既有 raid-end](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1741>)、[戰況時間計算](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/raid.ts:46>)

### 應修

1. **遊戲區換課時，使用輪詢連線的班級可能按一人規模開戰。** 新課的 `seen` 從空物件開始，入口隨即呼叫 `startRaid()`。若學生靠輪詢維持在線，近期出席紀錄仍在舊課，新課尚未收到首次輪詢，`players` 便取下限 1。這會把魔王血量等參數固定為一人規模。已有有效 WebSocket presence 的學生仍能計入。建議在換課前取得該班有效在線座號，供新場次初始化，並補「多人在舊課輪詢、換課後人數正確」的測試。這項是程式路徑核對；課堂內原有的「開戰」抽出後，難度、秒數、角色沿用與已結算的個人最佳則經記憶體實測正常。[新課與開戰初始化](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:483>)、[在線判定](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1096>)、[人數與血量公式](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/shared/raid.ts:193>)

2. **409 有保住新課，但畫面沒有顯示新課是哪一堂。** Worker 回傳了 `current`，共用 `api()` 拋錯時只保留訊息和狀態碼。`startRaidGame()` 顯示提示並呼叫 `loadDashboard()`，後者只更新記憶體資料。老師要再按一次才有機會看到最新課名；若教材已失去題庫或魔王戰頁，舊卡片也仍留在畫面。建議對課堂衝突顯示最新班級與課名，保留本次難度、時間供重新確認；教材不可用時則重載遊戲卡。補一個真正經過前端確認框的 A→B 競態測試。[409 回應](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1601>)、[前端錯誤資料](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/api.ts:39>)、[遊戲入口錯誤處理](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3793>)

3. **較晚回來的遊戲清單可能覆蓋教師已切換的畫面。** `renderRoute()` 在載入 dashboard 後檢查 `routeVersion`，接著 `renderGames()` 又等待一次 `/games`，回應後直接呼叫 `shell()`。若教師在第二個請求期間離開遊戲區，舊回應仍可把遊戲區畫回來，造成網址與內容不一致。建議在 `/games` 回應後、寫入 DOM 前再比對同一次路由版本，並用延遲回應測試快速切頁。[遊戲區繪製](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:251>)、[路由版本檢查](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:2904>)

### 建議

1. **讓 `finishSession()` 與手動結課用相同時點比較十字交乘期限。** 記憶體實測，限時場次尚未到期時，三個入口都會結算並呼叫 `scheduleCross(id, null)`。若期限剛過，手動結課仍會呼叫；兩個換課入口因為先 `settleCrossSession()` 才取 `before`，會略過回呼。三條路徑都有寫入場次結束時間。現行 Durable Object 對 `null` 直接返回，待已排定的 alarm 醒來再清索引，因此目前差異沒有造成漏結算。把 `before` 移到 settle 之前即可對齊，也值得把這兩個時序固定成測試。[換課時序](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:456>)、[手動結課時序](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1659>)、[alarm 清理契約](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:194>)

本次實跑了 `tsc --noEmit --incremental false`、指定檔案的 `git diff --check` 與上述記憶體 Worker 案例。瀏覽器 E2E 僅核對測試程式，未重跑，也未做 iPad 實機驗收。全程未改檔，八上 3-2 教材未納入審查。
