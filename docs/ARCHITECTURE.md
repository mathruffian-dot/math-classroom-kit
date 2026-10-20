# 架構、資料與 API

## 執行邊界

| 層 | 職責 | 不應持有 |
| --- | --- | --- |
| `src/`：Vite＋TypeScript | 教師／學生介面、簡報、視覺化、白板、輪詢 | AI key、Supabase secret key |
| `worker/`：Cloudflare | 驗證登入、班級權限、資料驗證、答案保存、AI 呼叫 | 不記錄明文學生識別碼到日誌 |
| Durable Object | 序列化同一 instance 的更新；demo 的持久儲存 | 不向瀏覽器暴露內部狀態 |
| Supabase Auth | 正式環境教師 email/password 驗證 | 不直接把所有 Auth 帳號視為教師 |
| Supabase Postgres | 正式環境資料 snapshot、版本比較更新 | 不給匿名／學生直接資料表存取 |
| 選用 AI | 教師主動執行的教材分析、去識別回答摘要 | 班級、座號、識別碼、session cookie |

v0.1 的正式資料存於 `classroom_state` JSON payload，透過 atomic compare-and-swap 避免錯誤覆蓋。它不是每位學生各一列、由瀏覽器直接操作的 Supabase RLS 教學範本；前端所有資料操作經過 Worker。雲端安全取決於資料庫私有存取與 Worker 的角色／擁有者檢查共同成立。

將來需要大量班級、細粒度 SQL 報表、原生 Realtime 或多租戶時，應把資料正規化為獨立表、逐表設計 RLS、轉換資料並重新驗證。不要直接開放 `classroom_state.payload` 給學生訂閱。

## 資料生命週期

1. 教師保存 `Lesson`，經後端驗證與重設 `updatedAt`。
2. 開課建立 `Session`，保存當時課程快照。之後改教材不改動既有場次。
3. 學生登入後僅取得所屬班級開啟的場次，以及自己的已保存答案。
4. 每次提交帶 `submissionId`。同一提交重送應取得既有結果，不重複建立。
5. 教師公開結果後，學生可取得該活動匿名彙總；個別學生識別資訊不隨統計公開。
6. 教師可匯出紀錄及刪除場次。資料保存政策由各部署者自行訂定。

瀏覽器約每 2 秒取得可信後端狀態。畫面更新頻率不是搶答排序依據；搶答只以後端接受順序決定勝出者。

## API 一覽

所有錯誤回傳 JSON `{ "error": "訊息" }`。以同網域 cookie 驗證；需要寫入的請求接受 same-origin 防護。除 DELETE 可為空 body 外，寫入請求使用 JSON 與 `Content-Type: application/json`。具體型別以 [`shared/types.ts`](../shared/types.ts) 為準。

| 方法／路徑 | 對象 | 用途 |
| --- | --- | --- |
| `GET /api/config` | 公開 | 模式、AI 是否設定、版本；不回傳秘密 |
| `POST /api/login` | 公開 | 教師 email/password；學生 classCode/seat/code |
| `POST /api/logout` | 已登入 | 登出 |
| `GET /api/me` | 公開 | 目前使用者或 null |
| `GET /api/dashboard` | 教師 | 課程、班級及場次 |
| `PUT /api/lessons/:id` | 教師 | 驗證並儲存 `{lesson}` |
| `DELETE /api/lessons/:id` | 教師 | 刪除課程 |
| `POST /api/classes` | 教師 | 建班 `{name,seats}`，回傳識別碼 |
| `POST /api/classes/:id/credentials` | 該班教師 | `{seat}` 重發該座號識別碼，撤銷舊登入 |
| `PATCH /api/classes/:id` | 該班教師 | `{requireCode}` 開關個人識別碼（預設停用）；開啟時撤銷該班既有登入 |
| `POST /api/sessions` | 教師 | `{lessonId,classId}` 開課 |
| `GET /api/sessions/:id` | 場次教師／該班學生 | 角色過濾後的場次 |
| `GET /api/student/session` | 學生 | 所屬班級目前場次 |
| `GET /api/sessions/:id/slides/:slideId/html` | 場次教師／該班學生 | 經權限檢查及 CSP 隔離的自訂 HTML |
| `GET /api/lessons/:id/slides/:slideId/html` | 課程教師 | 自訂 HTML 預覽 |
| `POST /api/sessions/:id/control` | 教師 | 換頁、開關題、結果、抽籤、搶答、模式、結束 |
| `POST /api/sessions/:id/answers` | 該班學生 | `{submissionId,activityId,value}` |
| `POST /api/sessions/:id/buzz` | 該班學生 | `{submissionId}` 搶答 |
| `PUT /api/sessions/:id/whiteboard` | 教師 | `{slideId,strokes}` 保存白板 |
| `GET /api/sessions/:id/export?format=json` | 教師 | 場次 JSON；可改 `format=csv` |
| `DELETE /api/sessions/:id` | 教師 | 刪除場次與其作答 |
| `GET /api/backup` | 教師 | 下載排除驗證憑證的備份 |
| `POST /api/restore` | 教師 | `{backup}` 驗證並還原 |
| `POST /api/ai` | 教師 | `lesson-review`／`response-summary` |
| `GET /api/realtime?sessionId=...` | 有權限使用者 | 本版回傳 polling transport 與 2,000ms 間隔 |

控制 action：`slide`、`activity`、`results`、`draw`、`buzz-open`、`buzz-reset`、`mode`、`end`。`draw` 只抽**上線**的學生：有即時連線（WebSocket，每 45 秒 ping、100 秒內有效），或 45 秒內有輪詢／作答；連線關閉後沒再出現就算離線。老師端的 `roster` 帶每個座號的 `online`、`answered`（目前這一頁），用來顯示座位表。`slide` 帶 `index`；布林切換使用 `value`。端點即使從開發者工具直接呼叫，也必須由後端檢查角色和場次權限。

## 自訂 HTML 與 AI

HTML 擴充只經 [bridge](HTML-BRIDGE.md) 提交現有答案格式。AI 供應商設定位於 Worker，不放教材。現有 adapter 使用 OpenAI 相容的 chat/completions 格式；新增不同協議的供應商時，必須修改與測試 adapter，不能假設換 URL 即可。

AI 文字輸入視為待分析資料，不是系統指令。分析結果只提供教師參考；不直接修改標準答案或正式成績；AI 批改的分數需教師覆核後才發回。

## v0.1 實作限制

- 課程最多 60 頁，每題 2–12 個選項；短答最多 2,000 字元。細節見 Worker validator。
- 白板每頁最多 100 筆，每筆最多 1,000 個正規化座標點。
- demo 與正式資料 snapshot 上限 **8 MiB**，本機 Durable Object 使用分塊及交易保存。班級變多、筆跡增加時，應定期匯出並清理或改為分表儲存。SQL 的 25 MB 防護值不是應用程式可用容量。
- 一般 JSON API 請求上限 1 MiB；教師備份還原請求上限 9 MiB，先驗證教師身分再讀取內容。還原後全部資料仍須符合 8 MiB snapshot 上限。
- 教師登入最長 1 小時，受 Supabase token 期限限制；每次已登入請求仍核對 Auth 與教師允許名單。
- 學生登入為最長 4 小時的簽名 cookie；重發識別碼撤銷該座號舊登入。
- 登入限速為每個 IP 每 10 分鐘 200 次；全班共用出口網路時須納入實測。
- AI 每位教師依 UTC 日期計數，預設每天 20 次；已保留的呼叫次數即使失敗仍計入。台灣時區在上午 08:00 換 UTC 日期。
- AI 單次輸入最多 50,000 字元、逾時 20 秒、輸出 `max_tokens: 1200`。供應商實際支援仍需驗證。
- AI 次數先在課堂更新佇列中保留，外部供應商請求於佇列外執行；慢速 AI 不應讓學生作答等待整段供應商回應。
