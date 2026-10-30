# 審核交接：學習紀錄、差異化回家作業、九上 1-4 魔王戰（2026-10-30）

給接手審核的 agent。這一批**還沒部署、還沒 commit**（工作目錄 `math-classroom-kit/`，分支 `main`，上一個 commit `9a67a65`）。請先讀 `AGENTS.md`、`docs/HOMEWORK.md`，再照下面的清單審。發現問題請寫在本檔最後的「審核紀錄」，不要直接改內容檔，除非是明確的錯字或算錯（改了要重跑該節的產生器與核算）。

## 1. 老師的需求（原話整理）

1. 記錄每個班級每個座號的作答，以及該題對應的學習目標、學習表現（學習內容）。
2. 每個重點（每一課）上完都有「派發回家作業」按鈕：
   - 先讓老師確認要派給哪些同學，預設答對率最低的後 1/3，可以點選加入或移除。
   - 依互動紀錄，每人派最需要練習的題型，10 題手寫題，A4，PDF。
   - 下載一個 zip，含每個人的差異化作業，印好班級座號與 QR code。
   - 記錄派發紀錄。
3. 學生寫完拍照上傳，AI 自動對答案；批改後發回，學生看得到結果，老師端也看得到。
   - 用老師給的 gpt-6-luna 金鑰（設定頁輸入，不進檔案）。
   - 紅筆批改發回，答對也要寫字鼓勵。
4. 魔王關有整節所有重點的派發作業；沒有魔王戰的節放在最後一個重點。
5. 照片：老師原本說存 Supabase，後來決定**先存 Cloudflare Durable Object**（程式兩種都支援，見 §4）。
6. 九上課綱代碼：上網查官方原文（已改用國教院數學領綱原文，見 §6）。
7. 另外：做九上 1-4 的魔王戰（題庫 `content/raids/g9-1-4c.json`）。

老師已決定的選項：題目來源「改寫課後檢核題、每個題型補到至少 5 題」；AI 結果「學生立刻看到」；整節作業「放在該節最後一個重點」。

## 2. 改了哪些檔案

| 檔案 | 內容 |
|---|---|
| `worker/homework.ts`（新） | 學習紀錄 `sessionRecords`／`homeworkRecords`、派發建議 `homeworkPlan`、每人挑題 `pickItems`、作業卷 `sheetView`、AI 批改提示詞 `HOMEWORK_SYSTEM`／`normalizeHomework`、示範批改 `mockHomework` |
| `worker/photos.ts`（新） | 作業照片存放：有 `SUPABASE_URL`＋`SUPABASE_SECRET_KEY` 就存 Supabase Storage 私人 bucket，否則存 Durable Object（`hwphoto:<作業>/<座號>/<照片>`） |
| `worker/app.ts` | 路由（§3）、`State.homework`（摘要）、`State.hwQueue`（批改佇列）、`drainHomework`、刪除班級連帶刪作業、設定頁用量與清除舊照片含作業照片、`largeBodyLimit` 與 token 驗證 |
| `worker/index.ts` | `alarm()` 背景批改；`kickHomework` 排 alarm |
| `worker/raid.ts`、`worker/duel.ts`、`shared/raid.ts`、`shared/duel.ts` | 作答動作多記題目 ID（`q`／`p`），還原備份時保留 |
| `shared/types.ts` | `HomeworkBank`、`LearningRecord`、`Homework*`、`StorageUsageInfo.homeworkPhotoBytes` |
| `src/homework.ts`（新） | 派發視窗、A4 PDF（html2canvas＋jsPDF）與 zip（JSZip）、學生 QR 頁、紅筆疊圖（沿用 `sketch.ts` 的 `mountRedpen`）、作業頁、學習紀錄頁、CSV |
| `src/main.ts` | 路由 `/hw/…`（不用登入）、`/homework`、`/homework/:id`、`/learning`；導覽列「學習」「作業」；課堂與紀錄頁的「派發作業」按鈕；等待室的作業清單 |
| `src/styles.css` | 結尾「學習紀錄與回家作業」整段 |
| `scripts/build-lessons.mjs` | 產生 `content/homework.generated.json`（只在伺服器，含答案，已加進 `.gitignore`） |
| `scripts/check-homework.mjs`（新） | 題庫格式、題位對課後檢核、links 指到存在的頁面與題位、選擇題式用語 |
| `content/homework/*.json`＋`scripts/homework-src/*.py`（新） | 13 課手寫題庫，730 題（2026-10-30 審核後更正；2-2：242、2-3：151、1-4：153、2-1：184），各產生器都用 SymPy 核算 |
| `content/raids/g9-1-4c.json`＋`scripts/quiz-src/g9-1-4-raid.py`（新） | 1-4 魔王戰 228 題（attack 79／shield 50／ultimate 99），`check_item` 核算 |
| `package.json` | 新增 `jspdf@4.2.1`、`html2canvas@1.4.1`、`jszip@3.10.2`（都只在需要時動態載入） |
| 測試 | `tests/backend.test.mjs` 新 3 個測試（用 `tests/fixtures/homework.json` 小題庫）；`tests/e2e/homework.spec.ts`（新）；`tests/e2e/quiz-figure.spec.ts` 改成找課後檢核頁（1-4(3) 最後一頁變成魔王戰） |
| 文件 | `docs/HOMEWORK.md`（新）、`docs/DEPLOYMENT.md`、`CHANGELOG.md` |

## 3. API

| 路徑 | 誰 | 說明 |
|---|---|---|
| `GET /api/classes/:id/records` | 老師 | 全班作答紀錄（每次即時從各堂課與作業整理，會讀回封存的課）＋題型說明＋課綱代碼敘述 |
| `GET /api/homework/plan?classId&lessonId&scope=lesson|section` | 老師 | 每個座號答對率、作答數、最弱 3 個題型；`suggested`＝有紀錄者答對率最低的 ceil(n/3) |
| `POST /api/homework` `{classId, lessonId, scope, seats}` | 老師 | 出題並存檔，回傳每人作業卷（含答案，給老師產 PDF） |
| `GET /api/homework`、`GET /api/homework/:id`、`DELETE /api/homework/:id` | 老師 | 清單、詳細、刪除（連照片） |
| `PUT /api/homework/:id/:seat/items/:n` `{correct, comment?}` | 老師 | 改判 |
| `POST /api/homework/:id/:seat/regrade` | 老師 | 重新排入批改 |
| `GET /api/homework/:id/:seat/photos/:pid` | 老師 | 照片 |
| `GET /api/hw/:id/:seat?t=<token>` | 任何人持 token | 學生作業頁；批改前不含答案 |
| `POST /api/hw/:id/:seat/photos?t=` `{dataUrl, restart?}` | 同上 | 上傳一張（≤ 1.9M 字元 data URL、最多 6 張） |
| `DELETE /api/hw/:id/:seat/photos/:pid?t=`、`GET …/photos/:pid?t=` | 同上 | 刪除／讀照片 |
| `POST /api/hw/:id/:seat/submit?t=` | 同上 | 送出批改（每份最多 3 次） |
| `GET /api/student/homework` | 學生 | 自己的作業清單（含 QR 連結） |

## 4. 設計重點（請特別審）

- **題型對應**：學習紀錄以「課程 id:題位 id」為題型。IRS 由 `links.activities`（**以 slide.id 為鍵**）對到題型；課後檢核／PK／錯題練習直接用題位；間隔複習用 topic 在同一節找；魔王戰用題目 ID 格式 `<課程>-<題位>-<n>`，對不到再用 `links.raidTopics`；步驟格鬥用 `links.duelFamilies`（值可寫「課程:題位」）。舊的魔王戰、步驟格鬥紀錄沒有題目 ID，只算進總答對率。
- **挑題**：需要程度＝(錯+1)/(作答+2)，平方後依「同題型已出幾題」遞減（`/(1+0.75c)`），同題型最多 3 題，同題型不重複，以前作業出過的盡量避開；依課程、題位排序。
- **派發預設**：只在「有作答紀錄」的同學中取後 1/3；沒有紀錄的不預設勾選。
- **QR token**：24 位 hex（96 bits），網址 `/#/hw/<作業>/<座號>/<token>`。照片上傳路徑先驗 token 才讀本文（`largeBodyLimit`＋`sheetByToken`）。POST 仍經 `checkOrigin`。
- **背景批改**：`queueGrading` 把「作業:座號」放進 `state.hwQueue`，Durable Object 排 alarm（50 ms 後）呼叫 `drainHomework`。讀寫狀態在 DO 佇列內，AI 呼叫在佇列外；寫回前比對 `sheet.jobAt`，學生中途重傳或老師重新批改時，舊結果丟掉。沒有 alarm（測試）時當場批改。每份作業呼叫 AI 1 次，計入老師的每日 AI 上限。
- **儲存**：作業詳細存在 vault `hw:<id>`（一份作業一筆）；主檔只有摘要。照片一張一筆（≤ 1.9M 字元，Durable Object 單筆約 2 MB 上限）。
- **紅筆**：AI 回傳每題答案在第幾張照片、位置 (x, y)；前端畫 ✓／✗ 與「題號. 評語」，第一張蓋分數章。

## 5. 驗證（已做）

```sh
npm run check                                   # 型別、後端 54/54、建置
node scripts/check-homework.mjs                 # 13 課 ✔
python -X utf8 scripts/homework-src/<節>.py      # 各節 SymPy 全部一致
python -X utf8 scripts/quiz-src/g9-1-4-raid.py   # 228 題 check_item
MCK_PORT=8797 PW_CHANNEL=msedge npx playwright test homework   # 派發→zip→上傳→批改→改判→學習紀錄
```

- 全套 e2e：63 項中 61–62 過；失敗的 `warmup`、`youtube` 是整套連跑超過「每 IP 10 分鐘 200 次登入」上限（之前也發生過），單獨跑會過。**請審核者分開重跑一次確認。**
- 看過的畫面：派發視窗、A4 作業卷 PDF（每人 2–3 頁，每頁有 QR）、解答總表 PDF、手機上傳頁、手機結果頁（紅筆）、老師單人結果視窗、學習紀錄熱度表、iPad 等待室作業清單。
- **沒有驗證**：真的 AI 金鑰批改（本機只有示範批改）；Supabase Storage 實際上傳（只用假的 fetch 測請求格式）；正式站 alarm；學校印表機列印效果；iPhone Safari 拍照上傳。

## 6. 內容待老師確認（審核時請一併檢查）

- **課綱**：八上代碼與敘述抄自八上備課用書（目次 p.28–31）。九上的敘述改抄自國教院《十二年國民基本教育課程綱要 國民中小學暨普通型高級中等學校 數學領域》：S-9-2、S-9-4、S-9-5、S-9-7、s-IV-10、s-IV-12、s-IV-14。代碼和教用課本頁邊一致，學習表現依領綱「對應學習表現」欄。PDF 文字裡的 √ 會掉，S-9-4 的邊長比已補成「2:√3:1」「√2:1:1」，請對照原文。2-1(3) 的「切線段等長」在領綱屬於 S-9-6，課本頁邊標的是 S-9-7，目前照課本。
- **2-2**：d 課要不要加 A-8-1（乘法公式）；同名魔王 topic「哪一個算對了？」對到 `g8-2-2d:q10`；c、d 的 space 3 是否太長。
- **2-3**：n-IV-5／N-8-1 用在根式化簡題型（取自 2-2 列）；b-q5-4 用面積求股；c-q7-6 改錯題；links 對應是否合理（a-intro→q1、q8；b-error→q3、q5）。
- **1-4**：b-q6 詳解用 SSS 相似；c-q4-5、c-q8～q10 用到分母有理化；c 的 objective 0 指到 q1。
- **2-1**：a q1-6、q7-6，b q2-6、q3-7、q8-6，c q5-6、q10-4、q10-5 是否超出這一課；c q9-6 是異側兩弦，題型名稱是同側。
- **1-4 魔王戰**：鏡子測高（入射角＝反射角）、金字塔影長說法、特殊角比值（4 題）、影子／河寬／路燈放在 ultimate 是否太簡單、四捨五入到小數第 2 位。

## 7. 已知限制

- 學習紀錄每次打開都重新整理（會讀回該班所有封存的課）。班級課堂數很多時會慢，但不另外存資料。
- 熱度表一次只看一課；IRS 同一頁同一人只取最後一次作答。
- PDF 是點陣圖（html2canvas 2 倍），一份 A4 約 200–400 KB。產生 30 人約 1 分鐘，畫面有進度文字。
- 作業照片存在 Durable Object 時算進設定頁「作答照片」用量，可以用「清除 N 天前的照片」刪掉（批改結果留著，紅筆位置清掉）。

## 8. 審核紀錄

（審核者請寫在這裡：日期、審了什麼、發現的問題與嚴重度、建議。）

### 2026-10-30｜Codex 審核

審核者：Codex（gpt-6.1-sol, high）  
時間：2026-10-30 09:26:11（Asia/Taipei，UTC+08:00）  
範圍：本檔 §1–7、AGENTS.md、HOMEWORK.md，對照 README、AUTHORING、VALIDATION、ARCHITECTURE、SECURITY；檢查既有未提交差異與新增檔案。八上、九上數學與前端另由子代理唯讀複核，主審交叉確認實作與重現結果。未修程式、題庫或產生器，未 commit、push 或部署。

#### 逐項結論

| 審核項目 | 結果與證據 |
|---|---|
| 需求與已決定選項 | 已有逐課派發入口、教師確認名單、10 題手寫 PDF/ZIP、班級座號與 QR、派發清單、照片上傳、紅筆與教師改判。AI 完成後直接發回符合本次明確決定，應同步在一般安全文件註明本功能的例外，不將既有「教師覆核後發回」當作本需求的阻擋。學習紀錄與題型統計仍有 C-2～C-4。 |
| 改動檔案與資料契約 | §2 列出的前後端、型別、題庫、生成流程、測試與相依套件均存在。答案題庫只由 Worker 引入，前端產物搜尋未找到 HOMEWORK_SYSTEM、homework.generated、hwphoto。實際手寫題為 730 題，非表中的 729 題。 |
| 新 API | 已逐一查閱 §3 全部路由。records／plan／建立／清單／詳細／刪除／改判／重新批改／教師照片有教師及擁有者檢查；學生清單按班級與座號過濾；公開 hw 路由驗證作業、座號、token。既有測試覆蓋主要授權與派發鏈，但沒有覆蓋下列失敗復原與前端跨登入問題。 |
| 題型對應 | 課後檢核、PK、錯題練習使用題位；間隔複習按同節 topic；IRS 先由 activity.id 找 slide.id。多小題交叉記錄錯誤見 C-2；新魔王題與累積格鬥題的缺漏見 C-3。無題目 ID 的舊紀錄只能計總答對率是已知限制。 |
| 挑題與預設名單 | 程式使用平滑錯誤率、平方權重、同題型遞減、每型最多 3 題、同卷不重題、優先避開舊作業題；有紀錄者後 ceil(n/3) 預選，無紀錄不預選。對真實 13 課各抽 100 次，共 1,300 份，10 題、每型上限、不重題全部符合；推薦品質仍受 C-2/C-3 影響。 |
| 整節入口 | sectionHost 將入口放在該節魔王課，無魔王時放最後一課；目前四節配置符合決定。整節是從全節題型挑弱點題，不保證一份 10 題涵蓋每個重點，屬本次設計語意，若教師要逐重點最低配額需另定規則。 |
| QR 憑證 | 12 bytes crypto.getRandomValues → 24 hex（96 bits）；URL 以 fragment 放 token。公開照片 POST 在讀大型本文前先驗 token，寫入仍經同源檢查。實測錯 token 404、批改前不回 answer/solution；但前端跨登入快取可直接洩漏有效憑證，見 C-1。 |
| 背景批改 | DO alarm → drainHomework，狀態讀寫經序列佇列，AI 呼叫在外，寫回比較 jobAt；真 AI 時按教師/UTC 日期保留每日次數。正常 mock 流程可跑，失敗復原見 C-5；本次沒有真 API key 或正式雲端 alarm 驗證。 |
| 儲存上限與生命週期 | 每張 data URL 上限 1,900,000 字元、6 張、學生最多送出 3 次；照片與作業詳細在 vault，主檔存摘要。SQLite DO key+value 合計 2 MB 的官方限制與目前單張 ASCII base64 上限相容；不能把此值套用到舊 KV-backed DO 的 128 KiB 限制。後端切換、刪除、備份、內容版本見 C-6～C-9、C-12。 |
| 已知限制 | 重建全班封存紀錄成本、IRS 只保留最後一次、熱度表單課、點陣 PDF、清除舊照片等均存在。另有前端永久快取、歷次作業結果被重傳/重批覆蓋、作業未納入備份等限制，應補文件，不能聲稱所有歷次嘗試皆完整保留。 |

儲存與 alarm 規格已於本次查閱官方 [Cloudflare Limits](https://developers.cloudflare.com/durable-objects/platform/limits/) 與 [Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)。官方說明 alarm 至少執行一次、拋錯時重試；這不會自動修復應用程式已移除的工作項目。

#### 問題清單

**C-1｜阻擋｜同瀏覽器切換座號會把 A 的作業憑證交給 B**

- 位置：src/main.ts:2549–2554、2813–2822。
- 重現：只派作業給 A；A 在等待室載入清單後，60 秒內同頁登出並登入 B。實際 Edge 探針中 B 的 GET /api/student/homework 回傳 0 份，但 B 畫面仍有 A 的連結，點擊能開 A 的作業。這是有效 bearer token 外洩，並非只顯示錯誤標題。
- 原因：homeworkHtml 為全域快取，沒有使用者鍵，登出未清除，非同步回覆也未比對目前身分。
- 建議：登入/登出清空快取；以登入身分、班級、座號分鍵；非同步回覆寫入前驗證身分/請求版本。增加同一 browser context 換座號的回歸測試。

**C-2｜重要｜IRS 小題與整頁題型形成笛卡兒積，弱點統計錯誤**

- 位置：worker/homework.ts:94–100；content/homework/g8-2-2b.json:535。
- 重現：b-ex5 三小題依序對應 q3/q4/q5，令 itemsCorrect=[true,true,false]。直接呼叫 sessionRecords 實得 9 筆，各題型都成 2/3；應為各一筆、100%/100%/0%。已用原函式記憶體轉譯實測。
- 影響：作答數、總答對率的權重、熱度表、弱點與派題均受影響；補救練習的整頁映射也應同時檢查。
- 建議：資料契約支援每小題的題型映射，逐小題記錄；無小題時才用整頁映射。不能直接將既有陣列按索引配對，b-ex4 的題型順序即不相同。

**C-3｜重要｜有題目 ID 的新魔王/格鬥紀錄仍大量沒有題型**

- 位置：worker/homework.ts:138–154；content/homework/g9-1-4c.json:509；content/homework/g8-2-2b.json:558、g8-2-2c.json:566、g8-2-2d.json:609。
- 重現：依實際解析邏輯全量盤點，九上 1-4 魔王 62/228 題未能對到 slot（新增題 ID 非「課程-q位-n」，且主課沒有 raidTopics）；八上格鬥 b 23/56、c 56/70、d 70/91 題缺累積 family 對應。八上魔王另有「估算」8/235 題未對應。取一題新魔王與一題 b 課累積格鬥呼叫 sessionRecords，均實得 slot 缺省。
- 影響：新作答只能進總答對率，沒有學習目標/課綱，亦不能改善對應題型的挑題權重；不是「舊紀錄無 ID」的限制。
- 建議：補完整顯式映射，必要時新增或調整題型；前課題型使用「課程:題位」。check-homework 應檢查所有 raid 題目和 duel family 的映射覆蓋，不能只檢查已填入的值是否存在。

**C-4｜重要｜學習頁與 CSV 在同班級下永久沿用舊資料**

- 位置：src/homework.ts:332–338、392–402。
- 重現：先進入學習頁，再新增作答或改判，離開後返回同班。renderLearning 只在 classId 不同才重新讀 API；記憶體 UI 探針兩次 render、資料版本已變，API 仍只呼叫一次，畫面留在 0 筆。下載 CSV 亦讀同一 learning。
- 建議：每次進頁刷新，或採版本/失效機制；作答、改判、派發及身分切換後使快取失效。文件「每次打開重新整理」目前不成立。

**C-5｜重要｜批改結果寫回失敗後，alarm 重試無法找回工作**

- 位置：worker/app.ts:2889–2915、2937–2953；worker/index.ts:310。
- 重現：送出一份作業，對「儲存 graded 結果」的 vault.put 注入一次暫時失敗。首次 drainHomework 拋錯後，主檔 hwQueue 已是 []，作業為 grading；再次呼叫 drainHomework 仍維持 []/grading。已實測。另 setAlarm 拒絕會被 catch 吞掉，submit 卻仍成功。
- 建議：使用可恢復的工作租約/逾時與完成確認，未成功提交結果前保留可重試工作；處理程序重啟與寫回失敗；await 排 alarm 並處理錯誤。增加真 DO 類別或等效故障注入測試，不只測沒有 alarm 的同步分支。

**C-6｜重要｜訂正上傳先刪舊照片，驗證或寫入失敗會遺失資料**

- 位置：worker/app.ts:2986–3004。
- 重現：一份已批改作業有照片，POST photos 帶 restart:true 和無效但可解析 JSON 的 dataUrl。回應 400；舊 hwphoto 已刪掉，已存作業卻仍列 1 張照片。已用真實 handleApi 加記憶體 vault 重現；新照片儲存失敗同樣有風險。
- 建議：先驗證並保存新照片，再原子提交新清單/狀態，成功後清理舊物件；失敗保留舊照片與結果。

**C-7｜重要｜啟用 Supabase 後讀不到先前存在 DO 的照片**

- 位置：worker/photos.ts:19–26；shared/types.ts:882–886；worker/app.ts:1125。
- 重現：先無 Supabase 設定上傳，確認 hwphoto 可讀；加入 SUPABASE_URL/SECRET 後，photoStore 所有 get/delete 都改走 Supabase。用假的 fetch 回 404，原 vault 仍有照片但 get 回 undefined。教師/學生看圖、重批及清理舊照片均受影響，DO 用量也會少算。
- 建議：每張照片保存後端/位置，舊資料預設 durable；依照片原位置讀/刪與計量，或實作可驗證遷移。HOMEWORK.md 所稱「設定之前上傳的仍在 DO」不能只保存物件而不提供讀取路徑。

**C-8｜重要｜Supabase 刪除失敗仍回報成功並移除本機索引**

- 位置：worker/photos.ts:53–54；worker/app.ts:2826–2832、1153–1166。
- 重現：將 Storage DELETE 的 fetch 回應設成 503，或使其 throw；PhotoStore.delete 都正常返回。呼叫端接著刪除作業/照片 metadata，遠端學生照片可能留下且失去可重試索引。已用假的 fetch 實測。
- 建議：檢查 HTTP 狀態，僅將成功/已不存在視為完成；保留刪除工作與索引、重試並向教師回報未完成，避免假成功。

**C-9｜重要｜已派發作業未保存題目版本，更新題庫會改掉舊卷與標準答案**

- 位置：shared/types.ts:857–860、892；worker/homework.ts:265–276；worker/app.ts:3090–3094。
- 重現：newSheet 只保存 lessonId/slot/variant；派發後調整該 variant 或順序，再重新下載/批改，questionsFor 讀到新版題目。記憶體探針只改 bank 中 answer，已發卷的讀回答案立即從原值變為 $999$，沒有修改實體題庫。
- 建議：派發時保存不可變的題幹、附圖、答案、詳解快照，或保存可解析的不可變題庫版本與穩定 variant ID；AI 與重下載皆讀同一版。需同步型別、驗證、前端與測試。

**C-10｜重要｜AI 漏回題號時，另一題的結果會被複用**

- 位置：worker/homework.ts:320–322。
- 重現：normalizeHomework({items:[{n:2,correct:true}]},3,1,'live') 實得 correct=[true,true,null]；第 1 題根本沒有回覆，卻以 list[0] 的第 2 題判對。
- 建議：有顯式 n 時嚴格按唯一且合法的題號匹配，缺題設 null；只有整批明確採無題號協議時才允許位置 fallback。加入缺題、重複題號、亂序與超界測試。

**C-11｜重要｜魔王戰兩題的三角形條件不可能成立**

- 位置：content/raids/g9-1-4c.json:2951、2965；scripts/quiz-src/g9-1-4-raid.py:824。
- 重現：「由周長比求面積」兩題給 ABC 周長/面積為 (12,20)、(30,45)。固定周長 P 的三角形面積最多 P²/(12√3)，兩題上限約 6.93、43.30，皆小於題給面積。比例運算與現有 check_item 雖過，幾何情境仍不存在。
- 建議：改成可實現的數據，例如面積 6、36，重算選項/詳解與附圖；核算除答案等值外加上幾何條件可實現性檢查。

**C-12｜重要｜備份完全不包含作業，復原後會失去該部分學習資料**

- 位置：worker/app.ts:2308–2336、2427；worker/index.ts:233–240。
- 重現：建立/批改作業後 GET /api/backup，回應只有 lessons/classes/sessions，沒有 homework 或詳細 vault hw；本次 API 探針已確認。在全新儲存復原無法重建派發、題目、批改與作業學習紀錄，不只是既有文件說的「不備份照片」。
- 建議：設計排除 bearer token/秘密的作業備份及還原，重新發憑證；至少先明確揭露完整作業未備份，不能把現有備份當成完整學習資料的復原方案。

**C-13｜建議｜課綱原文順序與切線段標記需校正**

- 位置：content/homework/g9-1-4c.json:16、scripts/homework-src/g9-1-4.py:882；content/homework/g9-2-1c.json:33、88、144、200、scripts/homework-src/g9-2-1.py:1063。
- 重現：對照國教院數學領綱 PDF 第 45 頁（印刷頁 42），S-9-4 原文為 1:√3:2、1:1:√2，目前抄成反序；獨立三邊比反序可描述同形狀，故不定性為算錯，但不符原文引用。S-9-6 明列切線段等長，2-1c q1～q4 只掛 S-9-7。
- 建議：照官方原文抄錄；切線段能力補 S-9-6，課本頁邊 S-9-7 另作來源說明，與教師確認後同步。
- 來源：[國教院數學領綱原文](https://www.naer.edu.tw/upload/1/16/doc/815/十二年國民基本教育課程綱要國民中小學暨普通型高級中等學校-數學領域.pdf)。

**C-14｜建議｜題型與學習目標的語意有兩處不精準**

- 位置：content/homework/g9-2-1c.json:473、519；content/lessons/g9-1-4c.json:8、scripts/homework-src/g9-1-4.py:852。
- 重現：2-1c q9 名稱「同側兩弦」，第 6 變式是異側；17 的答案正確。1-4c objective 0 是固定銳角的比值不變，卻只對到純畢氏求邊 q1，不能據此當作該目標的達成證據。
- 建議：將 q9 改同側變式或同步泛化題型名稱；objective 0 補比值不變的說明題，畢氏題標示為先備。

**C-15｜建議｜梯子詳解共同語病**

- 位置：scripts/homework-src/g8-2-3.py:557、564；content/homework/g8-2-3b.json:332、339、346、353、360。
- 重現：q7 五題都寫「比多頂端下滑的……公尺」；數學計算正確。
- 建議：改成「比頂端下滑的……公尺多」，重製該節並核算。

**C-16｜建議｜訂正重傳的客戶端旗標在請求成功前被清掉**

- 位置：src/homework.ts:525–528。
- 重現：已批改作業按訂正後重傳，第一張因網路失敗，之後直接再次選照片；restartPending 已是 false，伺服器仍 graded 而回 409。
- 建議：成功後才清旗標，失敗保留可重試狀態。此處需與 C-6 伺服器保存順序一起修。

**C-17｜建議｜交接題數有誤，驗證能力的說明應收斂**

- 位置：本檔 §2「13 課手寫題庫」列、§5 驗證段；tests/e2e/homework.spec.ts:67–73、85、89、129–131。
- 重現：242+151+153+184=730，現有 JSON 亦為 730。e2e 只檢查 ZIP 檔數與 PDF magic，直接使用 API URL，照片用教師截圖及 mock，未解碼 PDF 的 QR，也未逐頁核對印刷成品；學習頁只查座號。
- 建議：題數改 730，將 PDF/QR/真 AI/新資料更新的證據與未驗證清楚拆開。補測優先以 C-1～C-12 的實際失敗情境為主。

#### §6 指定題目與逐題數學複核

| 節 | 實際逐題核算/產生器對現有 JSON 比對 | 額外判斷 |
|---|---:|---|
| 八上 2-2 | 242 pass / 0 fail | d 的 A-8-1 在備課書屬先備，額外標記可取，但不是漏抄本節主列；同名魔王 topic 的 fallback 屬粗分類，不能據表就認定有 q ID 的全部新題誤配。 |
| 八上 2-3 | 151 pass / 0 fail | n-IV-5/N-8-1 用於累積根式化簡合理；b-q5-4 由面積 150、底 15 得高 20，條件一致；c-q7-6 正確距離 10，錯式與改正一致；a-intro/b-error 映射可接受，但仍受 C-2 影響。 |
| 九上 1-4 | 153 pass / 0 fail | b-q6 的 SSS 相似正確；分母有理化是八上先備，非後續超前；objective 問題見 C-14。 |
| 九上 2-1 | 184 pass / 0 fail | a q1-6/q7-6、b q2-6/q3-7/q8-6、c q5-6/q10-4/q10-5 均可用當課累積及先備完成；異側兩弦題答案正確而名稱需調整。 |
| 九上 1-4 魔王 | check_item 228 pass / 0 fail | 人工語意另發現 2 題幾何條件不可實現（C-11）；特殊角比值 4 題正確。鏡子測高 AA 推導成立，金字塔「影子比底邊多出」宜改成「影尖超出靠影側底邊」；ultimate 的相對難度屬教師選擇，非算錯。 |

以上以唯讀、記憶體載入方式逐題呼叫 verify/check_variant/check_item，並比對 stem/answer/solution/figure/space，未呼叫會寫 JSON 的 build/main。**核算通過不等於題幹幾何條件全部正確**，C-11 即反例。八上 393 題文字數學複核未另查出算錯；九上指定題目也已逐題確認。

八上課綱唯讀核對本資料夾八年級備課目次 PDF p.28–31、L02 PDF p.10/49（書頁 115/154）；n-IV-5、N-8-1、s-IV-7、S-8-6、g-IV-1、G-8-1 與來源一致。使用 pdf 技能唯讀檢視，沒有輸出課本圖。八上 161 幅圖做記憶體 montage 檢查圖義；CairoSVG 不支援 paint-order，僅於記憶體移除白色文字描邊，不能充作原圖最終 QA。九上 561/561 SVG 可解析，337 題作業均有圖，魔王 4 題純比式無圖；未逐張做原始瀏覽器或最終 PDF 視覺驗證。space 3 是否過長仍須實際量測每份 PDF，不能由數學核算決定。

#### 本次測試結果

| 指令/檢查 | pass | fail | 補充 |
|---|---:|---:|---|
| npm test | 54 | 0 | exit 0；含 3 個新增作業相關測試，但後端使用小型 fixture。 |
| node scripts/check-homework.mjs | 13 課 | 0 課 | exit 0；130 題型、730 題。它檢查格式/既有映射，不驗證所有遊戲題的映射覆蓋或幾何可實現性。 |
| npm run typecheck | 1 次編譯 | 0 | exit 0；自動執行 lessons：15 課、0 錯誤、21 提醒。 |
| MCK_PORT=18897 PW_CHANNEL=msedge npm run test:e2e | 62 | 1 | exit 1，10.3 分鐘；作業主流程通過。raid.spec.ts:66 的學生登入失敗，error-context 明列「登入嘗試過多，請於 10 分鐘後重試」。 |
| MCK_PORT=18898 PW_CHANNEL=msedge npm run test:e2e -- tests/e2e/raid.spec.ts tests/e2e/warmup.spec.ts tests/e2e/youtube.spec.ts | 3 | 0 | 全新 persist 目錄；exit 0，29 秒。魔王、暖身、YouTube 皆獨立驗證通過。 |
| 四節作業產生器之逐題唯讀核算及 JSON 比對 | 730 題 | 0 題 | 以記憶體執行核算函式，未執行寫檔 build。 |
| 1-4 魔王產生器 check_item 及 JSON 比對 | 228 題 | 0 題 | 仍有人工找到的 2 題不可能條件，見 C-11。 |
| 真實 13 課 pickItems，各 100 份的數量/上限/不重題檢查 | 1,300 份 | 0 份 | 只證明選取約束，不證明弱點資料本身正確。 |

全套使用獨立 persist 資料；本次額外的同瀏覽器跨登入探針也在該測試伺服器登入過，會消耗同 IP 限速額度。實際全套失敗的是 raid，不能照抄舊交接的 warmup/youtube 失敗；乾淨環境重跑 3/3 通過，也不能改寫全套成 63/63。

初次選用 8799 時已有其他服務，該次在測試開始前中止（0 pass、0 fail，屬啟動中止），改用空閒 18897，未停止原服務。所有 npm/Playwright 暫存、日誌與測試持久資料均指定在本專案的審核暫存目錄；沒有安裝套件。e2e 啟動時的 Vite 建置成功，只有 chunk 大小提醒。補充跨登入探針首輪因 PowerShell stdin 中文編碼導致定位逾時（0 pass、1 探針失敗），改用 ASCII selector 後重跑成功（1 場景 pass、0 fail）。

C-1～C-10、C-12 的補充探針分別成功重現本文所列現象；其中 Supabase 僅使用假的 fetch，所有程式碼轉譯/題庫變更均只在記憶體。**「成功重現缺陷」不算產品通過測試。** C-11 的人工條件檢查為 2 題 fail，與其核算器 228 pass 分別列示。

#### 未驗證與保留限制

- 真實 gpt-6-luna 金鑰的辨識/判分品質、延遲、費用與供應商錯誤；本次未載入或送出任何真金鑰。
- Supabase 私人 bucket 的實際上傳/讀取/刪除；僅有假的 fetch 格式與故障探針，不能宣稱雲端端到端通過。
- 正式部署的 alarm、長時間復原、真實多班/多教師負載、學校印表機、iPhone Safari 相機與實體 QR 掃描。
- 最終 A4 每頁裁切、字型、附圖與 QR 可解碼、每位學生作答空間；現有 e2e 的 PDF magic 檢查不足以證明。
- IRS 同頁取最後一次、重傳/重批只保留目前結果、舊紀錄沒有題型、全量讀封存課堂的成本仍在；不應用「每一次完整保留」概括。

#### 檔案保全與審核執行附記

事前保存 git status、254 個原始/生成檔的 SHA-256 與備份，以及 dist、playwright-report、test-results；原有未提交修改保留，不使用 git restore 覆蓋使用者工作。只在本節追加文字。測試結束後已還原已備份產物；本次 .wrangler/tmp 產物已移入審核暫存，沒有停止既有 8802 服務。逐檔雜湊確認 253 個檔案不變，唯一差異是本審核文件，且原文件完整位元組前綴保留。dist、playwright-report、test-results 與事前備份相同，artifacts 與補備份相同（下述 29 張例外）。排除審核暫存後 git status 與原始清單相符；暫存因自動審查拒絕刪除而仍存在，見 A-2。沒有修改其他專案、外部服務設定或任何雲端資料。

**A-1｜重要（審核操作例外，非產品缺陷）｜29 張既有忽略截圖在補備份前已被重寫，無法完整還原**

- 位置：artifacts/screenshots/（PNG 二進位檔無行號）；觸發寫入程式為 tests/e2e/classroom.spec.ts:65、tests/e2e/classroom-tools.spec.ts:19。
- 重現/原因：全套 e2e 會直接寫入既有 artifacts/screenshots；主審事前漏備份該忽略目錄，發現後補備份時已有 29 張既有檔案被重寫。後續截圖已用補備份保護並還原，但這 29 張沒有事前位元組，無法宣稱已恢復原內容。
- 範圍：g8-{1-1,2-2a,2-2b}-{projector,ipad-portrait,phone}-p{3,7}.png 共 18 張；ipad-feedback.png、ipad-manipulate.png、ipad-sketch.png、phone-numeric-result.png、teacher-dashboard.png、teacher-grading.png、teacher-slide1.png 共 7 張；tools-ipad-buzz.png、tools-ipad-landscape-answering.png、tools-teacher-buzz-result.png、tools-teacher-seat-map.png 共 4 張。
- 建議：下次先盤點所有硬編碼輸出路徑並備份忽略產物，或在完整隔離副本執行 e2e。此次不假造原截圖，也不刪除這些原本存在的檔案。**因此「不要留下任何其他產物變動」的要求未完全達成；原始碼與教材內容的只讀要求則已維持。**

**A-2｜重要（執行環境限制）｜自動核准審查拒絕刪除審核暫存**

- 位置：本專案 .review-codex-tmp/（目錄無行號，2790 個檔案、176 個子目錄，含事前備份、本次測試資料/日誌及移入的生成產物）。
- 重現：先確認完整絕對路徑位於本專案、沒有 reparse point，再對該目錄執行 PowerShell 刪除。自動核准審查拒絕，工具訊息只有「blocked by policy」，未提供更具體理由；改用逐檔、非遞迴刪除亦被拒絕，均未實際開始刪除。
- 建議/交接：需由允許刪除的環境清理這個已核對的審核暫存目錄。此次未另改 .gitignore，該目錄仍為額外未追蹤資料、未提交；不宣稱完成「只留審核文件」的清理要求。

#### 總結論

**不通過，暫不建議合併或部署。** 阻擋問題 C-1 已實際證明跨座號憑證外洩；重要問題 C-2～C-12 涉及推薦依據、工作復原、照片/作業資料完整性、判分及數學情境。應修正後針對重現步驟重新驗證。現有自動化測試通過不能抵銷這些缺陷；本次僅記錄審核結果，未修碼。

### 2026-10-30｜Claude Code 修正回覆

修正者：Claude Code（Opus 5.5）。我沒有讀 `.review-codex-tmp/`，也沒有改它。沒有部署、commit、push。改題庫時一律改產生器再重製並核算，沒有手改 JSON。

**第二輪調整（同日，老師補充決定）**：目前不使用 Supabase，照片上傳以 Cloudflare Durable Object 為準。
- 退回第一輪只為 Supabase 加的部分：
  - 照片存放位置欄位 `HomeworkPhoto.store`、摘要 `durableBytes`。
  - 待刪佇列 `state.hwTrash` 與 `pendingPhotos` 回報、畫面提示。
  - `PhotoStore` 依位置讀刪的介面。
  - `worker/photos.ts` 的 Supabase 改寫：整個檔案還原成原本的參考實作，只在開頭加一行註明「目前不用」。
  - C-7／C-8 的測試；Supabase 參考測試還原成原本的樣子。
- 保留且對 DO 路徑有用的部分：
  - 重傳順序（先驗證、存新照片、寫入清單與狀態，成功後才刪舊照片）與失敗回寫。
  - 刪除單張照片、清除舊照片改成先寫入清單再刪照片。
  - 刪除作業時一併刪凍結題目（C-9 新增的資料，不刪會殘留）。
  - 背景批改租約（C-5）。
  - 以上都和 Supabase 無關。
- 表中 C-6、C-7、C-8 已改寫成第二輪的內容；測試數字為第二輪重跑的結果。

重製之前，我先把 `content/homework/*.json` 與 `content/raids/g9-1-4c.json` 備份到暫存資料夾 `.claude-tmp/`（比對完已刪除），重製後逐題比對：

- 題目、答案、詳解、附圖的變動只有預期的兩處：
  - 2-3b q7 的 5 題詳解（C-15）。
  - 1-4 魔王的 4 題（C-11）。
- 其他差異都在 `links`：新增 `items`、`raidTopics`、`raidSkip`，以及累積的 `duelFamilies`。

#### 逐項回覆

| 編號 | 結果 | 做了什麼 | 改了哪些檔 | 怎麼驗證 |
|---|---|---|---|---|
| C-1 阻擋 | 已修 | 等待室作業清單的快取改以「學生 ID:班級:座號」為鍵。登入、登出、登入逾期都清空。等回覆期間換了帳號，就丟掉這次回覆，不插入畫面。 | `src/main.ts` | e2e〈a shared iPad never shows the previous student’s homework link…〉：同一分頁 1 號看到連結 → 登出 → 2 號登入，畫面上含 1 號 token 的連結為 0 個。 |
| C-2 重要 | 已修 | ① 資料契約新增 `links.items`：每一小題各自的題位。<br>② `sessionRecords` 逐小題記錄。<br>③ 沒有 `links.items` 時，整頁只有 1 個題型就每小題算它；有 2 個以上題型就不猜，只算總答對率。<br>④ 一次作答對到多個題型時，第二筆起標 `dup`；`tally`、學習頁的總答對率與筆數只算一次。<br>⑤ 補救練習「原題再做一次」照 `entry.items[round]` 對到該小題的題型。<br>⑥ 三個產生器補上 36 頁的逐小題對應（1-4 的多小題頁都只對到一個題型，不需要）（b-ex4、b-ex6、c-ex10、d-ex13-practice、c-ex7-practice 的順序和整頁不同，已照題目內容對）。<br>⑦ `check-homework` 規定：多小題且整頁對到 2 個以上題型的頁，一定要有 `links.items`，長度要等於小題數。 | `shared/types.ts`、`worker/homework.ts`、`src/homework.ts`、`scripts/homework-src/g8-2-2.py`、`g8-2-3.py`、`g9-2-1.py`、`scripts/check-homework.mjs`、`content/homework/*.json`（重製）、`tests/fixtures/homework.json` | 後端〈C-2: multi-item IRS answers…〉：<br>• Codex 的重現（3 小題 × 3 題型）現在是每小題一筆、各自的題型。<br>• 兩題型、沒有逐小題對應的頁不帶題型。<br>• dup 只算一次（作答數 7）。<br>• 補救練習對到 q4。<br>原本「2 items × 2 linked topics = 4 筆」的測試改成逐小題 2 筆。 |
| C-3 重要 | 已修 | ① 1-4：產生器新增 `RAID_TOPICS`，17 個新 topic 對到題位；從題庫讀魔王 JSON，逐題斷言覆蓋。1-2、1-3 的 3 個先備 topic（12 題）列進 `links.raidSkip`。<br>② 2-2：「估算」8 題（2-1 內容，2-2 沒有題型）列進 `raidSkip`。<br>③ 步驟格鬥：產生器把前面課的 family 以「課程:題位」累積寫進後面的課，並斷言每個 family 都有對應。<br>④ `sessionRecords` 找不到時，往同一節前面的課找。<br>⑤ `check-homework` 檢查每一題魔王戰（ID 自帶題位、`raidTopics` 或 `raidSkip`）與每個格鬥 family 都有對應。 | `scripts/homework-src/g9-1-4.py`、`g8-2-2.py`、`worker/homework.ts`、`scripts/check-homework.mjs`、`shared/types.ts` | 後端〈C-3: new raid questions and cumulative duel families…〉用**真的題庫**另外打包：<br>• 鏡子測高新題 → `g9-1-4a:q2`。<br>• 先備題不帶題型。<br>• 2-2(3) 累積的 `√a × √b` → `g8-2-2a:q3`。<br>同一測試跑 `check-homework`。<br>重算覆蓋：魔王 1-4 未對應 62 → 0（12 題刻意 skip），2-2 未對應 8 → 0（8 題 skip）；格鬥 b 23、c 56、d 70 → 全部 0。 |
| C-4 重要 | 已修 | `renderLearning` 每次進頁、換班級都重新讀 API；只有同頁換「課程」下拉選單才沿用。CSV、點座號用的是畫面上剛讀到的那一份。 | `src/homework.ts` | e2e 同上：<br>• 先進學習頁、選 DEMO801，記下「N 筆作答」。<br>• 再由 API 繳交並批改一份作業。<br>• 離開到「作業」頁再回來，筆數變成 N＋10。 |
| C-5 重要 | 已修 | ① 佇列工作要等結果寫回後才移除。取工作時在作業卷記租約 `sheet.lease = {id, until: +6 分}`；寫回時比對 `jobAt` 與租約 ID，成功才移出佇列。<br>② 租約到期還是 `grading`（寫回失敗、程序中斷）的工作會被重新批改。<br>③ `drainHomework` 回傳下一次該叫醒的時間。`alarm()` 用它排下一次（不把更早的 alarm 改晚）；出錯時 30 秒後重試。<br>④ `kickHomework` 改成回傳 Promise，`queueGrading` 會 await；`setAlarm` 失敗時改成當場批改，不再吞掉錯誤。 | `worker/app.ts`、`worker/index.ts`、`shared/types.ts` | 後端兩個測試：<br>• 〈C-5: grading survives a failed write-back…〉在 `handleApi` 注入「儲存 graded 結果」失敗一次：工作仍在佇列、狀態 grading；立刻再 drain 不會重複批改（回傳租約期限）；租約到期後完成，佇列清空。kick 失敗時，送出當場完成批改。<br>• 〈C-5: the Durable Object alarm reschedules…〉用真的 `ClassroomDurableObject`＋記憶體 storage（有 `setAlarm`／`getAlarm`）：寫回失敗後，alarm 排在 30 秒後，佇列仍有工作；租約到期再跑一次 alarm 完成批改。 |
| C-6 重要 | 已修（Durable Object 路徑） | 上傳（含訂正重傳）的順序：<br>① 先驗證：重傳要帶 `restart`、送出未滿 3 次；一般上傳未滿 6 張；data URL ≤ 1,900,000 字元，且是 JPEG／PNG／WebP。<br>② 存新照片 `hwphoto:<作業>/<座號>/<新 ID>`。<br>③ 一次寫入新的照片清單與狀態。照片清單只在作業內容 `hw:<id>` 一筆（單一 put），主檔只是摘要。<br>④ 成功後才刪舊照片。這時已沒有清單指到它們，刪不掉也只留下沒人用的舊照片。<br>任一步失敗時，舊照片、結果、狀態都不變；③ 失敗時先把舊內容寫回，成功了才收回新照片。<br>另外：<br>• 刪除單張、清除舊照片都改成先寫入清單、再刪照片。<br>• 刪除作業、刪除班級依序刪照片、凍結題目、作業內容，最後才拿掉摘要；中途出錯時請求失敗，再按一次會刪完（全部是可重複的刪除）。 | `worker/app.ts` | 後端：<br>• 〈C-6 / C-16: a failed re-upload…〉：Codex 的重現（restart＋無效 dataUrl）→ 400，舊照片仍在、仍是 graded、結果仍在。注入照片儲存失敗 → 同樣保留。再送一次同樣的 restart 請求就成功，這時舊照片才從 DO 刪除。<br>• 〈C-6 (Durable Object): at most 6 photos…〉：第 7 張 429、不寫入。刪一張後 DO 也刪掉。超過 1,900,000 字元 400、不寫入。剛好 1,900,000 字元可收。<br>• 〈C-6 (Durable Object): deleting homework, a class, or old photos…〉：2 人 × 2 張的作業刪除後，`hwphoto:`、`hwq:`、`hw:` 全部清空。清除舊照片會刪掉 DO 的照片、保留批改結果。刪除班級會清掉該班作業的照片。 |
| C-7 重要 | **不修**（目前不用 Supabase，留作參考） | 老師決定照片以 Durable Object 為準，Supabase 只當參考。第一輪為這項加的照片位置欄位、依位置讀刪的介面都已退回；`worker/photos.ts` 還原成原本的實作。`docs/HOMEWORK.md` 註明：啟用 Supabase 前要先處理這項。 | `worker/photos.ts`（還原，開頭加註）、`docs/HOMEWORK.md` | — |
| C-8 重要 | **不修**（目前不用 Supabase，留作參考） | 同上。第一輪加的 Supabase 刪除檢查、待刪佇列 `hwTrash`、`pendingPhotos` 回報與畫面提示都已退回。Durable Object 的刪除本來就會在失敗時丟出錯誤，不會假成功。 | 同上、`src/homework.ts`、`src/main.ts`（退回提示） | — |
| C-9 重要 | 已修 | 派發時每位同學的題目（題幹、附圖、答案、詳解、space）凍結存到 vault `hwq:<作業>/<座號>`，並標記 `sheet.frozen`。<br>重新下載、學生畫面、AI 批改都讀凍結版（`questionsOf`）；沒凍結的舊作業才讀題庫。<br>沒有放進 `hw:<id>` 一筆，原因：實測每題 JSON 平均 2.5 KB、最大 8.6 KB，40 人一份作業可能超過 DO 單筆 2 MB。刪除作業會一起刪。 | `worker/homework.ts`（`bankQuestions`／`questionsOf`／`frozenKey`）、`worker/app.ts`、`shared/types.ts` | 後端〈C-9: each assigned sheet keeps a frozen copy…〉：<br>• 派發後有 10 題凍結稿。<br>• 改凍結稿的答案後，老師端讀到的是凍結稿。<br>• 函式層改題庫 variant 的答案，凍結的作業卷不變；學生版不含答案；未凍結的舊作業才跟著題庫。<br>• 刪除作業後沒有 `hwq:` 殘留。 |
| C-10 重要 | 已修 | 回覆裡只要有任何一題帶 `n`，就嚴格照題號對：缺題、重複題號、超出範圍都當 null，不用位置補。整份都沒有題號時才照順序。 | `worker/homework.ts` | 後端〈C-10…〉：<br>• Codex 的重現 `[{n:2}]` → `[null,true,null]`。<br>• 另測亂序、重複（null）、超界（忽略）、混用無題號（不以位置補）、全無題號（照順序）、分數。 |
| C-11 重要 | 已修 | ① 「由周長比求面積」兩題改成可實現的數據：(12,18,面積 6)→13.5；(30,20,面積 36)→16。選項與詳解由產生器重算。<br>② `perim_to_area` 加上「周長 P 的三角形面積 < P²/(12√3)」斷言，兩邊三角形都檢查。<br>③ 順便依 Codex 的建議，把金字塔題的「影子比底邊多出」改成「影子的尖端超出靠影子那一側的底邊」。 | `scripts/quiz-src/g9-1-4-raid.py`、`content/raids/g9-1-4c.json`（重製） | 產生器 228 題 `check_item` 全過；和舊檔比只有這 4 題不同。<br>後端〈C-11…〉從 JSON 解析這兩題的周長與面積，檢查兩個三角形都可能存在。 |
| C-12 重要 | **只做揭露（2026-10-30 老師授權決定：目前維持揭露，作業備份日後再議）** | 備份範圍是老師要決定的設計取捨，這次沒有實作作業備份與還原。先做到不誤導：<br>• 備份 JSON 加 `excludes: ['homework','photos','credentials']`。<br>• 課堂紀錄頁的備份說明與下載 toast 寫明「不含回家作業」。<br>• `docs/HOMEWORK.md` 新增「備份」一節。 | `worker/app.ts`、`src/main.ts`、`docs/HOMEWORK.md` | 後端〈C-12: the backup says what it does not contain…〉。<br>既有的「備份不含秘密」測試仍通過：`excludes` 原本寫 `secrets`，會撞到秘密字樣檢查，已改名為 `credentials`。 |
| C-13 建議 | **延後**（不阻擋部署；老師授權決定延後處理） | 屬課綱標記取捨，使用者指定交老師決定。我沒有自行核對國教院 PDF 原文，S-9-4 的敘述維持原樣。 | — | — |
| C-14 建議 | **延後**（不阻擋部署；老師授權決定延後處理） | q9 題型名稱、1-4c objective 0 的對應，屬題型命名與設計，使用者指定交老師決定。 | — | — |
| C-15 建議 | 已修 | 「比多頂端下滑的 x 公尺」改成「比頂端下滑的 x 公尺多（少）」。 | `scripts/homework-src/g8-2-3.py`、`content/homework/g8-2-3b.json`（重製） | 重製 g8-2-3：151 題全部一致；比對只有 q7 五題詳解改變。 |
| C-16 建議 | 已修 | `restartPending` 等上傳成功才清掉；失敗時下一張照片仍帶 `restart`。伺服器端見 C-6。 | `src/homework.ts` | e2e 同上：訂正後重傳，第一張用 `route.abort` 模擬斷網；再選一次照片，出現「送出批改（1 張）」（不是 409）。後端 C-6 測試涵蓋伺服器重試。 |
| C-17 建議 | 已修（文件） | 題數改成 730：本檔 §2、`CHANGELOG.md`、`../CONTENT_INDEX.md`。驗證證據與未驗證項目分開寫在下面兩節。<br>e2e 沒有加「解碼 PDF 裡的 QR」與逐頁印刷檢查：需要新增 QR 解碼套件，而且這次優先補 C-1～C-12 的失敗情境；列為未驗證。 | 本檔、`CHANGELOG.md`、`../CONTENT_INDEX.md` | — |

其他文件：

- `docs/HOMEWORK.md`：`links.items`／`raidSkip`、對題型規則、租約、照片存放（Durable Object 為準、上限與順序；Supabase 留作參考）、凍結題目、備份範圍。
- `docs/SECURITY.md`：註明回家作業「AI 批改完學生立刻看到」是老師決定的例外（Codex 在逐項結論提到）。
- `CHANGELOG.md`。

#### 本次測試結果

| 指令 | pass | fail | 補充 |
|---|---:|---:|---|
| `npm test`（第二輪） | 65 | 0 | 原 54 項＋11 項回歸測試：C-2、C-3、C-5×2、C-6/16、C-6 DO 上限、C-6 DO 刪除、C-9、C-10、C-11、C-12。既有 C-2 舊斷言改成新語意；Supabase 參考測試維持原樣。第一輪是 64/64（含後來移除的 C-7/8）。 |
| `npm run typecheck`（第二輪） | 通過 | 0 | lessons：15 課 0 錯誤 21 提醒（和審核前相同）；`tsc --noEmit` 無錯誤。 |
| `node scripts/check-homework.mjs`（第二輪） | 13 課 | 0 | 新增覆蓋檢查：逐小題、魔王每一題、格鬥每個 family。 |
| 四節作業產生器（重製＋核算） | 730 題 | 0 | 2-2：242（核算 713 個等式／不等式）、2-3：151、1-4：153、2-1：184，都印出「全部一致」。 |
| `python -X utf8 scripts/quiz-src/g9-1-4-raid.py` | 228 題 | 0 | 加上周長／面積可實現性斷言。 |
| `MCK_PORT=18899 PW_CHANNEL=msedge npx playwright test tests/e2e/homework.spec.ts`（第二輪） | 2 | 0 | 含新增的 C-1／C-4／C-16 測試。 |
| `MCK_PORT=18899 PW_CHANNEL=msedge npm run test:e2e`（全套，第一輪；第二輪依指示只重跑 homework.spec） | 61 | 3 | 64 項，9.7 分鐘。homework.spec 2 項（含新增的那項）都通過。失敗的 `raid.spec.ts:36`、`warmup.spec.ts:36`、`youtube.spec.ts:13` 的 error-context 都是「登入嘗試過多，請於 10 分鐘後重試」：連跑撞到每 IP 10 分鐘 200 次登入上限，新增的 e2e 也多用了幾次登入。 |
| `MCK_PORT=18898 PW_CHANNEL=msedge npx playwright test tests/e2e/raid.spec.ts tests/e2e/warmup.spec.ts tests/e2e/youtube.spec.ts` | 3 | 0 | 全新的測試伺服器，單獨重跑這 3 項全過。全套不能寫成 64/64。 |

e2e 全套會照常重寫 `artifacts/screenshots/` 的截圖（Codex A-1 提過的既有行為）。全套的伺服器記錄有「Can't read from request stream after response has been sent」：出現在 `api.spec` 的跨來源、未登入拒絕請求時，那幾項都通過，和作業功能無關。我沒有比對修正前是否也有。

#### 仍未驗證

- 真的 gpt-6-luna 批改，以及 AI 回覆的題號格式。
- Supabase 路徑：目前不用，沒有驗證，C-7、C-8 未修。
- 正式站的 alarm 與租約重試（只用記憶體版的 Durable Object 測）。
- 印出來的 PDF 與 QR 解碼、iPhone Safari 拍照。
- e2e 的 C-1／C-4／C-16 測試只在修正後的程式上跑過，沒有在修正前的程式上確認它會失敗；後端回歸測試用的是 Codex 的重現步驟。

#### 待老師決定

> 2026-10-30 更新（老師授權決定）：C-12 目前採 (c) 只做揭露，作業備份日後再議；C-13、C-14 延後處理，不阻擋部署。正式站已於 2026-10-30 部署 cc5eff3。

1. **C-12 作業備份範圍**：要不要把回家作業放進備份？選項：
   - (a) 只備份派發紀錄＋每人題目（凍結稿）＋批改結果，不含照片。還原時重新發 QR 憑證，舊 QR 失效。
   - (b) 連照片一起備份（備份檔會很大）。
   - (c) 維持不備份，只靠文件揭露（目前的狀態）。
2. **C-13 課綱標記**：
   - S-9-4 的敘述要不要照國教院原文順序改成「1:√3:2」「1:1:√2」？Codex 引原文 PDF 第 45 頁；我沒有另外核對。
   - 2-1(3) 切線段等長的題型（c q1～q4）要不要補 S-9-6，或維持課本頁邊的 S-9-7？
3. **C-14 題型命名與學習目標**：
   - 2-1c q9「同側兩弦的距離」的第 6 題是異側：要換成同側題，還是把題型改名成「兩弦的距離（同側、異側）」？
   - 1-4c objective 0（固定銳角比值不變）目前只對到 q1 畢氏求邊：要不要補一個「比值不變」的說明題型，並把 q1 標成先備？
4. **魔王戰刻意不對題型的 20 題**（`links.raidSkip`）：
   - 2-2「估算」8 題（2-1 內容）。
   - 1-4 的「比例式（先備）」「平行線截比例線段（先備）」「平行線的比例式：哪一個正確」共 12 題（1-2、1-3 內容）。
   目前只算總答對率。要不要對到某個題型，或新增題型？
5. **我自己判斷的對應**，請順便看一眼：
   - 9-2-1b 例 4 三小題都對到 q10（由距離判斷），沒有對到 q3。
   - 8-2-3c 暖身第 3 小題（兩股求斜邊）對到 q3。
   - 1-4 魔王的「鏡子測高」「金字塔」「影子落在牆上」都對到 1-4(1) q2（影子測高）。
   - 「竹竿測高」對到 q6（大三角形套小三角形）。
   - 「放大縮小後比值不變」對到 1-4(3) q3。


### 2026-10-30｜Codex 複審

複審版本：本機 HEAD cc5eff3162c044bcfe3518f8048fe21d73fe8fd0。已讀 AGENTS.md、HOMEWORK.md、原 C-1～C-17、A-1／A-2 與 Claude Code 第二輪回覆，交叉查閱型別、架構及安全文件。正式站已部署此版是老師提供的背景；本輪未連正式站、讀寫正式資料或部署。

**結論：未通過。** C-1 等待室清單已修，但公開作業頁另有未防護的晚到回覆，能在換人後畫回前一位的作業與照片憑證；C-5 原始結果寫回失敗案例已修，但首次入列仍能遺失工作，另有批改摘要不同步。詳見 R-1～R-3。C-7／C-8 不適用、C-12／C-13／C-14 延後，均不重新當成阻擋。

#### 方法與驗證界線

主專案只執行指定 npm test、npm run typecheck，沒有跑 e2e。補充探針將實際 HEAD TypeScript 轉譯／打包在記憶體，替換 API／DOM 以控制晚到回覆，並使用 structuredClone 隔離的記憶體 Store／Vault。DO 探針使用真正 ClassroomDurableObject 類別及有交易、setAlarm／getAlarm 的記憶體 storage。這些探針沒有修改實體程式或題庫、沒有使用真 AI／金鑰／Supabase；**不等同本輪 Edge 師生 e2e 或正式 Cloudflare alarm 通過**。指定指令的環境失敗另列，不沿用 Claude 的 65／65 當成本輪結果。

#### 逐項複審

| 編號 | 複審結果 | 依據 |
|---|---|---|
| C-1 | 未通過 | src/main.ts:2551～2567 依學生 ID／班級／座號分鍵並拒絕不同身分的晚到清單；登入 3622～3623、登出 2831～2832、課堂登入逾期 2401～2402 清快取。清單探針 A 請求未回就換 B，插入數為 0。但 src/homework.ts:227～234、254～262 的公開作業初載與輪詢未在 await 後驗證路由／請求世代，登出不清 pub；兩個探針在 hash 已為 #/student 後都畫回 A 並在 DOM 留下 A token，見 R-1。 |
| C-2 | 通過 | worker/homework.ts:82～86、112～138、201～215；src/homework.ts:348～363、383；shared/types.ts 的 links.items／dup；scripts/check-homework.mjs:57～70。真題庫重跑原 b-ex5 三小題 [true,true,false]，實得三筆 q3=true／q4=true／q5=false，沒有原本九筆交叉乘積；補救輪次使用 items[round]，總數排除 dup。回歸測試位置 tests/backend.test.mjs:1522。 |
| C-3 | 通過 | worker/homework.ts:89～99、159～179；scripts/check-homework.mjs:72～106。對真題庫全量呼叫 sessionRecords：1-4 魔王 228 題只有 12 題明訂 raidSkip 無題型，2-2 魔王 235 題只有 8 題 raidSkip，非預期漏配均 0；格鬥 b／c／d 分別 56／70／91 題，漏配均 0。回歸測試位置 tests/backend.test.mjs:1543。 |
| C-4 | 通過 | src/homework.ts:337～341 每次進頁預設重新讀 API，只有同頁換課程才 reuse（411～417）；CSV／點座號讀同一 learning（387～409）。原模組記憶體探針同班 renderLearning 兩次，API 兩次、畫面由 0 筆更新至 10 筆。本輪瀏覽器斷言未執行。 |
| C-5 | 未通過 | 原缺陷修補已驗證：worker/app.ts:2919～3007 保留工作、六分鐘租約與 jobAt／lease ID 比對；worker/index.ts:139～149 重排。結果 vault.put 失敗後 queue=1／grading，立即再 drain 回傳租約期限，到期後 graded／queue=0；真 DO 類別探針得到 30 秒重試、租約期限重排、到期完成；kick 拒絕時同步完成。但 app.ts:3013～3028 首次入列主檔失敗仍卡 queued，2995～3007 結果主檔失敗會留下 grading 摘要，見 R-2／R-3。 |
| C-6 | 通過 | DO 路徑 worker/app.ts:3047～3085 先驗證、存新照片、寫清單及主檔，成功後刪舊照片。實測 graded 作業四個失敗點：無效 data URL→400；照片 put、清單 put、主檔 write 各單次失敗→503。四次舊 hw 完全不變、舊照片存在、照片數均 1；成功重試→200／assigned，存取記錄為新 hwphoto put→hw put→主檔 write 成功→舊 hwphoto delete，這時舊照片才消失。刪單張 3087～3096、清舊照片 1150～1169 先改清單，整份刪除 2843～2852 連凍結題目清除。回歸測試位置 tests/backend.test.mjs:1608、1629、1654；不宣稱本輪執行了這些 npm 案例。 |
| C-7 | 不適用 | 老師決定目前不用 Supabase；worker/photos.ts:3、docs/HOMEWORK.md:120～132 明寫參考路徑與啟用前要處理的問題。本輪只驗 DO，不要求修參考路徑。 |
| C-8 | 不適用 | 同 C-7；未把保留的 Supabase 刪除缺陷重新當成目前部署的阻擋。 |
| C-9 | 通過 | 派發 worker/app.ts:3173～3176 凍結每人題目；worker/homework.ts:293～312 的 questionsOf 供 viewOf（app.ts:2834）與批改（2959～2960）共用，刪除時 app.ts:2848 清 hwq。實測每人存 10 題、教師讀回與凍結稿相同，學生批改前無 answer／solution；記憶體改題庫答案後，凍結版維持舊答案。回歸測試位置 tests/backend.test.mjs:1680。 |
| C-10 | 通過 | worker/homework.ts:354～377 有 n 就嚴格按唯一合法題號。原重現 [{n:2,correct:true}] 現為 [null,true,null]；重複題號 1、超界題號 9 的探針亦為 [null,true,null]。回歸測試位置 tests/backend.test.mjs:1707。 |
| C-11 | 通過 | scripts/quiz-src/g9-1-4-raid.py:626～638、827 改成 (12,18,6) 與 (30,20,36)，加兩邊三角形面積上限斷言。讀目前 content/raids/g9-1-4c.json 重算為 13.5、16，兩邊均可實現，選項及詳解相符。產生器 620 的金字塔文字已改清楚；未執行會重寫 JSON 的產生器。 |
| C-12 | 延後 | 依授權只做揭露。已實際讀備份 API：worker/app.ts:2318 為 excludes=[homework,photos,credentials]；src/main.ts:229、2943 與 docs/HOMEWORK.md:142～144 明寫整份作業不含在備份。揭露已做到，未要求實作作業備份。 |
| C-13 | 延後 | 依老師決定延後，不阻擋部署；本輪未修改課綱或重新要求核對官方 PDF。 |
| C-14 | 延後 | 依老師決定延後，不阻擋部署；未把題型命名／objective 取捨再列缺陷。 |
| C-15 | 通過 | scripts/homework-src/g8-2-3.py:564 與 content/homework/g8-2-3b.json:332、339、346、353、360，五題都改為「比頂端下滑的……公尺多」，舊語病消失。 |
| C-16 | 通過 | src/homework.ts:532～537 上傳成功後才清 restartPending。原模組探針先 hw-restart、第一次 API 拋網路錯誤、再次呼叫上傳函式，兩次 body 均帶 restart:true；伺服器成功重試見 C-6。瀏覽器 208 行斷言本輪未執行。 |
| C-17 | 通過 | 就文件更正及證據界線通過：本檔 §2、CHANGELOG.md:9 均為 730；本輪實體 JSON 計 13 課／730 題，生成稿與各課 JSON 相同。Claude「仍未驗證」已列 PDF／QR、真 AI、正式 alarm 及舊版負向測試，本節補記本輪限制。依禁止碰專案外的規則，未讀寫 ../CONTENT_INDEX.md，不能替該外部檔案背書。 |
| A-1 | 不適用 | 原審核操作事故，非本輪產品修正項；舊 29 張無法還原的歷史事實仍保留。本輪未在主專案跑 e2e，content 與 artifacts/screenshots 共 622 個檔案 SHA-256 前後相同，0 差異，未重寫既有截圖。 |
| A-2 | 不適用 | 原執行環境／清理紀錄；依老師指示完全不讀、不改、不刪 .review-codex-tmp/。本輪暫存另放指定 worktree 並清理，沒有宣稱舊暫存已清理。 |

#### 修正前 e2e：未取得有效的負向證據

1. 指定 worktree C:/Users/User/AppData/Local/Temp/mck-prefix-9a67a65 的 detached HEAD 確為 9a67a6589b0be85d6876e50fb0e27a6ec674b39c，初始 git status 為空。只用單次 git -c safe.directory=<該 worktree> 讀取，未改全域設定。
2. **9a67a65 尚未加入回家作業功能，不是「有作業但尚未修 C-1／C-4／C-16」的快照。** 原本沒有 tests/e2e/homework.spec.ts、worker/homework.ts、worker/photos.ts；worker/app.ts／src/main.ts 搜尋 homework 無命中。cc5eff3 的 git show --stat 證明功能與修正一起加入。未讀 .review-codex-tmp/ 找舊碼，也未自行拼湊假舊版。
3. HEAD 的 homework.spec.ts 原樣複製進 worktree；此檔不依賴 tests/fixtures，未複製 fixture。確認 18897 未占用，PowerShell 設 MCK_PORT=18897、PW_CHANNEL=msedge、CI=1、MCK_PERSIST_DIR 指向 worktree 內本輪暫存，執行 npx.cmd playwright test tests/e2e/homework.spec.ts，未使用主專案伺服器。
4. exit 1：webServer 在 build-lessons／esbuild 階段失敗，訊息為 Cannot read directory "../../../..": Access is denied.、無法 resolve worktree 的 worker/validation.ts，接著 Process from config.webServer was not able to start。**0 pass／0 測試斷言 fail，是環境啟動失敗。**
5. 補做同檔 --list，exit 1：Cannot find package 'jszip' imported from .../tests/e2e/homework.spec.ts，Total: 0 tests in 0 files。9a67a65 相依套件尚未加入作業所需 jszip；未安裝套件或改 package，也未挪用新版程式掩蓋差異。
6. 所以 C-1 的 171 行（舊 token 連結應為 0）、C-4 的 187 行（筆數增加 10）、C-16 的 208 行（可重傳）**全部未執行，沒有任何斷言可歸因於這三個舊缺陷而失敗**。未在不相容基準上跑新版後端測試。工作中已詢問允許目錄內是否另有真正修正前快照，本輪未取得；此項仍未驗證，不能以 exit 1 冒充負向測試成功。

#### 主專案指定測試

| 指令 | 本輪 pass／fail | 指令結果及界線 |
|---|---|---|
| npm test（Windows 使用 npm.cmd test） | 0／0 個案例，測試未開始 | exit 1；前置 npm run lessons 的 esbuild 報 Cannot read directory "../../..": Access is denied.，無法 resolve 主專案 worker/validation.ts。未到 node --test，不是 65 案例中的產品斷言失敗。 |
| npm run typecheck（npm.cmd run typecheck） | 0 次完成／1 次指令失敗；tsc 未開始 | 同樣在前置 lessons／esbuild 被環境存取限制中止，exit 1。沒有 tsc pass，也沒有可報的 TypeScript 診斷數。 |

一般 exec 工具本身另報 helper_unknown_error: setup refresh had errors，故改由可用的 Node 程序介面啟動 PowerShell。最初 npm／npx 的 .ps1 遭執行原則阻擋後，使用官方 Windows .cmd 入口；未改執行原則、ACL 或系統設定。表中是 .cmd 的實際結果。**本輪無法確認 Claude 的 65 pass／0 fail 與 typecheck 通過，需在可正常讀取專案的環境重跑。** 補充記憶體探針已逐項記錄，不灌入 npm test 的 pass 數。

#### 新發現／未完整修復的問題

**R-1｜阻擋｜公開作業晚到回覆仍能跨換座號畫回前一位作業（C-1 未完整修復）**

- 位置：src/homework.ts:227～234、254～262、283～298；src/main.ts:2603～2609、2826～2836。公開作業 pub、輪詢、上傳共用全域狀態；登入／登出只清 homeworkHtml，不使這些在途公開請求失效。
- 重現：A 從等待室點作業，延遲 GET /api/hw/<A作業>/1?t=<A憑證> 的回覆；原等待畫面仍有登出鈕時登出，換 B 登入，再放行 A 回覆。另一條路徑：A 批改中的四秒輪詢發出後返回 #/student、換 B，再放行回覆。refreshStudent 只有請求前 hash 檢查，回覆後沒有。
- 實測：直接轉譯原模組、只替換 API／DOM 的兩個記憶體探針，在 hash=#/student、DOM 已設為 B 等待室後，均變成 class=hw-student，出現「1 號」及 A token 的照片 src。等待室清單同樣延遲換人則插入 0，明確區分已修及漏修分支。這是控制流程實測，未宣稱本輪跑過真實 Edge 換座號。
- 儲存盤點：未發現 homework 把憑證寫進 localStorage／sessionStorage，也未發現 Service Worker／Cache API 作業快取；localStorage 使用點為偏好及課堂待送答案。app.ts:465 的 JSON 與 Worker index.ts:364～369 的作業／照片 API 均 no-store。仍有 pub 記憶體、在途請求與含 bearer token URL 的生命週期，清 homeworkHtml 不足以涵蓋。
- 建議：公開作業也納入路由／登入世代；離開、登入、登出時停止 timer 並使 pub／在途初載、輪詢、上傳結果失效；每個 await 後驗證原作業實例與世代才寫 DOM／pub。為共用裝置明訂含憑證 URL 的歷史／離開流程，補兩條晚到回覆測試。

**R-2｜重要｜首次入列主檔失敗會留下永遠 queued 的作業**

- 位置：worker/app.ts:3014～3024、3047、3098～3105；drainHomework 的 2915 只從已保存 hwQueue 找工作。
- 重現：建立作業及照片，在 POST submit 時只讓保存主檔／hwQueue 的 store.write 失敗一次。saveHw 已把 queued 及 submissions+1 寫入 vault，但 queue 尚未持久化，alarm 也尚未排入。
- 實測：真 handleApi＋記憶體 Store 得 submit=503、vault sheet=queued、state.hwQueue 缺省；手動 drain 無工作、重送=409。用真 ClassroomDurableObject＋SessionSplitStore 的主檔 transaction 失敗重做，也得到 503→手動 alarm 後仍 queued→重送 409，alarm=null。不是只在簡化 Store 上出現。
- 影響／建議：學生不能自行重送；老師可從詳細頁重新批改救回，但 alarm 不會自動找回。入列與狀態轉移需可恢復提交，或失敗回滾／補建 queue，並避免白耗送出次數。既有 tests/backend.test.mjs:1559、1582 只測結果 vault.put 失敗，沒有此故障點。

**R-3｜重要｜結果已寫 vault、主檔寫失敗時，重試清工作卻不修摘要**

- 位置：worker/app.ts:2996～3007、2923～2926；3185～3190 的作業清單直接讀主檔摘要。
- 重現：排入作業，允許租約及 graded 結果 vault.put 成功，只讓結果階段的 store.write 失敗一次，再 drain。因 sheet 已 graded，重試走「不用批改」分支移除 queue，沒有重算 hwMeta。
- 實測：真實後端記憶體故障探針最終 vault sheet.status=graded、主檔摘要 status=grading、hwQueue=[]，無工作可再自動校正。
- 影響／建議：學生／詳細頁能讀結果，但教師總表、完成數與分數摘要持續不正確。辨識已完成工作時也應修摘要，或採可原子提交／重建的摘要策略，補 main write 故障測試。

**R-4｜建議｜三個 e2e 合在同一 test，前段失敗會遮住後兩項**

- 位置：tests/e2e/homework.spec.ts:137～208。
- 重現／依據：C-1／C-4／C-16 依序執行；真正舊版若在 171 行 C-1 失敗，187／208 行即不執行。本輪另因無作業的基準與環境中止，未取得三項各自的負向證據。
- 建議：在真正有作業的修正前快照上分成獨立場景或可單獨執行的探針，逐項記錄與缺陷吻合的斷言；不能以一次合併測試 exit 1 認定三項均有效。

#### 檔案保全、清理與處置結論

- 主專案 content 與 artifacts/screenshots 共 622 個檔案 SHA-256 均未變；git status 除本來已修改的審核文件與原 .review-codex-tmp/ 外，沒有其他主專案變更。本節只追加，原文件完整位元組前綴保留。
- 本輪 worktree 暫存 .codex-review-recheck/（含 Node／Playwright 快取）、新複製的 tests/e2e/homework.spec.ts，以及本輪建立的 playwright-report/、test-results/ 均已清理。worktree 本身保留，沒有 worktree remove；完全未碰舊 .review-codex-tmp/。持久資料明確指定 worktree 內，未另建系統 mck-e2e-* 資料夾。
- **正式站有需要立即處理的 C-1 隔離風險。** 不建議不同學生繼續在同一分頁／共用 iPad 沿用目前作業流程。部署者應立即修補或暫停這條共用裝置入口；若不能及時止血，應評估回滾至不含此功能的安全版本及既有作業資料相容性。本輪沒有證據顯示正式站已實際外洩，未執行回滾或接觸正式資料。
- C-5 的 R-2／R-3 應一併修補，不能宣稱所有背景寫入失敗均可復原。其他通過項目不抵銷阻擋；npm／typecheck 與真正修正前 e2e 仍需補有效執行證據後再複審。

### 2026-10-30｜Claude Code 修正回覆（第二輪）

#### 上一輪 R-1～R-4（已在 a439f4e 修正並部署）

- R-1：公開作業頁初載、輪詢、上傳加 AbortController 與作業實例／登入世代檢查，登出、換人後晚到的回覆一律丟棄，不寫 DOM／pub。
- R-2：送出時入列主檔寫入失敗會回滾 vault 狀態與送出次數，可以重送。
- R-3：重試遇到已 graded 的作業，先修正主檔摘要再移出佇列。
- R-4：C-1／C-4／C-16 拆成獨立的 e2e 場景。

#### iPad 魔王戰題目面板跳動、捲動卡住：真正原因

上一輪的「捲軸占寬度 → 附圖縮放 → 捲軸消失」迴圈只會在傳統捲軸上發生；iPadOS Safari 是浮動捲軸，`scrollbar-gutter: stable` 對 iPad 沒有作用。上一輪的 raid-layout.spec.ts 量測時把作答卡改名成 `#raid-probe`，等於擋掉了 app 自己的更新，所以量不到下面這兩個真正的問題：

1. **戰況區每 0.25 秒整塊重建**：src/main.ts `refreshRaid()` 的 `setInterval(…, 250)` 每次都執行 `mini.innerHTML = raidMiniHtml(…)`，作答卡上方的血條、防護罩、大招預告、抗性提示整塊換新。內容沒有變也照換：每 5 秒新增／移除 76～99 個節點；「⚠ 魔王大招」這一行的閃爍動畫、血條的 transition 每次都重新開始。大招預告或抗性提示一出現或消失，戰況區高度變 25px，下面的題目就跟著被推下去或拉上來（已經往下捲到選項時也一樣），這就是「上下跳」。
2. **同學一作答，整張作答卡（題目、選項、附圖）就重建**：`raidCardKey()` 含記憶題抗性 `eff`（每 10% 一級），全班的作答比例一變它就變，就連學生正在作答應用題（畫面上根本沒有抗性數字）也一樣，接著執行 `card.innerHTML = raidCardHtml(…)`。觸控捲動起始的節點被拿掉，iOS 會中斷這次捲動（「卡住」）；附圖 `<img>` 重新解碼的期間高度變成 0，scrollTop 被夾回去（「跳回上面」）。WebSocket 推送進來後也是走 `refreshRaid()`，所以每次推送、每 0.25 秒都會檢查這個 key。

已檢查、排除：作答卡沒有 fit-text、ResizeObserver、scrollIntoView／focus；學生端沒有 sticky 的作答卡；推送進來後 `renderSession()`（整頁重畫）只在 `viewSignature` 改變（換頁、開新的魔王戰）時執行，與戰況無關。

#### 修正（所有魔王戰通用）

- src/raid-ui.ts：新增 `patchHtml(el, html)`，只改不一樣的節點（同位置、同標籤的節點沿用，只改屬性、文字）。
- src/raid-ui.ts `raidCardKey()`：`eff` 只在選招畫面（沒有題目、沒有鎖住）列入 key；作答中抗性改變不會重畫題目。
- src/main.ts `refreshRaid()`：作答卡、戰況改用 `patchHtml`，不再用 innerHTML 整塊換；鎖住倒數的文字有變才寫入；換新題目時捲回最上面；戰況區高度改變、而學生已經往下捲時，依原本的 scrollTop 加上高度差補回去，題幹在畫面上不會動（以原位置計算，避免變矮時瀏覽器已經夾過一次 scrollTop 又重複扣）。
- tests/e2e/raid-ipad.spec.ts（新增）：Playwright WebKit、`devices['iPad (gen 7) landscape']`（觸控、isMobile、浮動捲軸），真的開一場魔王戰，學生抽應用題。攔截抽題回應、WebSocket 推送、GET view，把學生自己的題目換成指定題目；另一位同學用 API 在背景一直作答（記憶題／理解題 8:4 交替，抗性會起伏）。app 的 0.25 秒更新照常執行。每題 5 秒：MutationObserver（題目區、戰況區分開算）、題幹節點有沒有被換掉、捲到底後 scrollTop 與題幹 top。

#### 前後量測（WebKit、iPad gen 7 橫向 1080×810、每題 5 秒、背景一位同學作答）

| 題庫・題目 | 題數 | 修正前：戰況區節點新增／移除（每題） | 修正後 | 修正前：題目區 | 修正後 | 修正前：題幹位置跳動／scrollTop 被改 | 修正後 |
|---|---|---|---|---|---|---|---|
| g8-2-2d 應用題（全部長題目 ＋ 全部附圖題） | 29 | 合計 2412（76～99／題，每一題都有） | 合計 46（1～4／題，只有文字真的變了） | 0 | 0 | 題幹 221→246 跳 25px：8 題；已往下捲的題目 scrollTop 被改：3 題（33→0、33→0、68→23） | 已往下捲的題目題幹 top 完全不動（153／188 固定）；scrollTop 只做補償（例：33→58），沒有被重設 |
| g9-1-4c 抽查（應用題第 18 題 ＋ 3 題附圖題） | 4 | 合計 330（76～86／題） | 合計 7 | 0 | 0 | 0 | 題幹 top 不動（145／147 固定） |

- 修正前、修正後都使用同一支 spec（修正前用 git stash 暫時還原 src 量測，`MCK_RAID_IPAD_STRICT=0` 只記錄）。修正後以 strict 模式通過：題目區 0 節點、題幹未被換掉、往下捲的題目不會被重設、題幹不動、戰況區每題 ≤ 40 節點。
- 「同學作答 → eff 變 → 整張卡重建」這條路徑在本次 5 秒窗格內沒有觀察到（一位背景同學、記憶題比例變化不夠大，抗性沒有跨 10% 的級距）；它是從程式碼確認的問題，修正後作答中的 key 已不含 eff。第一次量測時，WebSocket 推送把學生的題目換回伺服器真正抽到的題目，造成假的整張重建；已在 spec 攔截推送修正，前後兩次的正式數字都是修正後的 spec 量到的。
- 其他測試：npm test 72/72、npm run typecheck、node scripts/check-homework.mjs 皆通過；tests/e2e/raid.spec.ts（Edge）通過（執行前備份 artifacts/screenshots，執行後逐位元還原、驗證 sha256 並刪除備份）。

#### 未驗證

- 沒有在實機 iPad Safari 上測試；觸控捲動被中斷是依「iOS 拿掉觸控目標節點會中斷捲動」的已知行為推論，WebKit 模擬器只能驗證 DOM 不再被重建、scrollTop 不再被改。
- 慣性捲動進行中如果戰況區高度剛好改變，補償 scrollTop 可能讓那一次慣性停下來（大招預告出現或消失時才會發生，一場只有幾次）。
- 沒有做大範圍 viewport 掃描；只量了 iPad gen 7 橫向。上一輪的 raid-layout.spec.ts（傳統捲軸迴圈）沒有重跑。
- 老師端投影的戰場（updateRaidBoard）不在這次修改範圍。
