# Codex 複審：遊戲區（2026-11-24，第 7 輪）

審核者：Codex CLI（gpt-6.2-astra，model_reasoning_effort=high，read-only）。任務：`docs/codex-rereview6-games-area-task.txt`。

需修正後再審。

## 上一輪項目逐項

| 項目 | 是否修好 | 證據 |
|---|---|---|
| 第 6 輪阻擋：取消後重開一般搶答或整個 PK 配對 | 原案例已修好 | 兩個入口都會遞增 `openRound`。記憶體 Worker 實測，重開後送舊 token 均回 409，新一輪搶答與配對都保留。另有兩種舊確認仍會生效，詳見下方阻擋。[輪次指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:461>)、[後端回歸案例](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:2711>) |
| 第 6 輪應修 1：結課關閉 PK 搶答上場 | 已修好 | `endSessionState` 關閉 `pkLobby.buzz`、保留名單，學生入口另行檢查 `session.ended`。實測結課後旗標為 `false`，遲到的學生請求回 409。[結課](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:518>)、[學生入口](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2593>) |
| 第 6 輪應修 2：開戰前提示正在檢討的測驗結果 | 測驗已修好 | `session.quiz` 仍在時，截止後 0.5 秒仍列為進行中的測驗；寬限結束後列為「測驗結果（檢討中）」。兩者都會先確認才收起。步驟格鬥與十字交乘自然到期另有落差，見應修 2。[計畫判斷](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:456>)、[測驗案例](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/backend.test.mjs:2701>) |
| 第 6 輪應修 3：清單與指紋使用同一張表 | 部分修好 | `names` 與 `print` 都取自 `items`。單獨在魔王戰頁開一般搶答，實測 token 不變，開戰後搶答仍在。但若同頁原先已有 PK 配對，共用的 `openRound` 仍造成誤報 409，見應修 1。[清單與指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:450>) |
| 前輪回歸：手動結課、一般 `POST /api/sessions`、遊戲區換課 | 結算通過，與基準有預期差異 | 三個入口各測十字交乘、測驗、魔王戰，共九組通過。限時對戰寫入目前與歷史場次的結束時間，並呼叫 `scheduleCross(id, null)`；測驗保留班級成績及錯題統計；魔王戰保留個人最佳。相較 `d60e98c`，手動結課補上魔王戰結算，一般開新課也改為完整結算舊課。DO 已排定的 alarm 仍會醒來清理索引。[共用結課](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:506>)、[alarm 實作](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:194>) |
| 前輪回歸：課堂內「開戰」與 `GET /api/games` | 通過 | 對照基準，課堂內開戰保留難度、秒數、在線人數、舊活動結算、個人最佳快照、護盾設定與角色沿用。清單實測未登入 401、學生 403、教師 200；排除其他教師教材，只列兼有題庫及魔王戰頁的課，回傳欄位為 `lessonId`、`lessonTitle`、`title`、`section`。[共用開戰](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:558>)、[遊戲清單](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1650>) |
| 前輪回歸：token 比對、前端 409 與直接執行條件 | 流程通過，指紋仍有缺口 | DO 序列化請求，Worker 在改動前重算計畫。前端函式實測，首次只有 `new` 和空清單的 `start` 會直接送出，`enter` 只導頁，`replace` 即使清單為空也會詢問。有新計畫的 409 只有 `enter` 直接導頁，其餘重新詢問；404 與無計畫的 409 會提示並重載卡片。下列阻擋發生在不同活動算出相同 token。[伺服器比對](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1671>)、[前端確認](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:3814>) |
| 前輪回歸：`crossPageFocus` | 通過函式驗證 | 頁面預設 `gcf`，同課同頁改選後讀回 `a1`，另一堂課的同名頁仍讀回 `gcf`。現有 E2E 使用獨立學生 context 檢查等待畫面與開戰後的 level 1 題目。[面板取值](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:1626>)、[師生 E2E](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/tests/e2e/games.spec.ts:175>) |
| 第 6 輪兩項建議 | 快照檢查已修；iPad 護盾待驗 | 實測現行教材有魔王戰頁、開課快照沒有時，dryRun 已直接回無 `plan` 的 409，原課仍在。`raid-ipad` 的「破盾 2/3 → 破防」仍缺本版通過紀錄。[快照檢查](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:489>)、[護盾交接紀錄](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/REVIEW-2026-11-24-games-area.md:127>) |

## 新發現

### 阻擋

1. **老師確認收起 A 頁的活動，舊 token 可以收掉 B 頁的活動。** 在 `g8-2-2d` 第 1 頁公布結果並取得計畫，再翻到第 2 頁公布該頁結果，兩次 token 完全相同。送第一枚回 **200**，第 2 頁的結果被收起，魔王戰已開始。第 3、4 頁分別派發拍照題也得到相同結果。原因是這兩項指紋只記 `true`，`how.move` 只記是否需要翻頁。請在結果與拍照項目記入來源頁或活動 ID，以及每次重新公布、派發的輪次。回歸測試應斷言舊 token 回 **409**、B 頁狀態保留、尚未開戰。[指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:468>)、[換頁收起狀態](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:495>)

2. **同一個 PK 配對裡，關閉再開放「搶答上場」仍可沿用舊確認；彈幕也一樣。** 實測開放 PK 搶答上場、取得換課計畫，再關閉並重新開放收件。舊 token 回 **200**，原課結束，第二輪收件被關閉。彈幕關閉再重開也重現相同結果。`openRound` 會在建立整個 PK 配對時遞增，切換其內的搶答上場只改布林值。請為這兩個入口各自記錄重新開放的輪次，只在本次操作會關閉它時納入指紋。[PK 收件開關](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2028>)、[彈幕開關](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1797>)、[換課指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:461>)

### 應修

1. **一般搶答會讓同頁 PK 配對的確認失效。** 實測已在魔王戰頁、已有 PK 配對時，另一分頁開一般搶答，前後 `busy` 都只有「PK 配對」，舊 token 卻回 **409**。用新 token 開戰回 200，一般搶答仍保留。老師因此要為相同的中斷內容確認兩次。請將一般搶答與 PK 配對的輪次分開，各自只放進對應項目，並保留這個兩種活動並存的反向測試。[PK 配對指紋](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:461>)、[一般搶答遞增共用輪次](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:2069>)

2. **自然到期的步驟格鬥與十字交乘，畫面已結算，計畫仍列為進行中。** 固定時鐘實測，180 秒場次到期後，步驟格鬥教師檢視已回傳平手結果；十字交乘在 alarm 寫回前，教師檢視也已回傳結束時間。兩者的 dryRun 仍沿用到期前的名稱與 token，送舊 token 均回 **200**。老師看到的「進行中 → 檢討中」沒有反映在確認。請讓計畫共用 `duelOver(run, duelState(...))` 與 `crossOver(run, now)`，並測試自然到期、尚未寫入 `endedAt` 的時段。[計畫判斷](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:458>)、[步驟格鬥檢視](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/duel.ts:190>)、[十字交乘檢視](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/cross.ts:434>)

### 建議

- **讓唯讀計畫免觸發全班畫面推送。** dryRun 和 `enter` 都是成功的 POST，回應未設 `X-Classroom-Quiet`，DO 因而安排一次廣播檢查。兩個唯讀分支可沿用現有 quiet 回應，省去未改動課堂時的檢查。[遊戲區回應](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:1672>)、[DO 廣播條件](</C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/index.ts:106>)

本輪全程唯讀。TypeScript `--noEmit`、指定追蹤檔的 `git diff --check`、三個既有後端案例，以及上列記憶體 Worker 和前端函式檢查均已實跑。瀏覽器 E2E 本輪核對原始碼，未重跑；八上 3-2 教材與照片 R2 修改均未納入結論。
