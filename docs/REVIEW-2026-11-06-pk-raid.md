# 審核報告：今天八年級／九年級 PK 對戰與魔王戰

- **日期**：2026-11-06（Asia/Taipei）
- **審核目的**：今天八、九年級都要做 PK 與魔王戰，確認有沒有漏修
- **Repo HEAD**：`61164df`（含答案外流修正、八 3-1、九 2-2、紅筆圈錯步驟）
- **正式站 live**：`13c866bf-68b6-4188-8d97-527b94e20380`（wrangler deployments 最新一筆；與先前部署紀錄一致）
- **正式站煙霧**：`/` → 200；`/api/health` → 401；`/api/config` → 200（`aiConfigured:true`）
- **前端資產**：正式站 `/assets/index-DR2ftq9-.js` 與本機 `dist` 同檔名（課文／題庫在 worker 端 catalog，需登入才看得到）
- **約束**：未 deploy、未 push；彈幕資格維持現況不改；未碰通靈之戰

---

## 一句話給老師

**若今天仍上八 2-3、九 2-1：PK／課後檢核可以上；這兩節的魔王戰還是不能上（題庫從未做過）。**  
今天若一定要上魔王戰，只能改上已有題庫的 **八 2-2（4）`g8-2-2d`** 或 **九 1-4（3）`g9-1-4c`**。  
八 3-1、九 2-2 目前沒有課後檢核題庫，也沒有魔王戰。

開課前建議：教師登入正式站，選對課程 id，確認有「課後檢核／PK」頁；魔王戰頁只會出現在有 raid 題庫的最後一堂。

---

## 結論總表（今天最可能的節）

| 項目 | 八年級 2-3（a/b/c） | 九年級 2-1（a/b/c） |
|---|---|---|
| 課後檢核題庫 | 有：各 10×3＝30 | 有：各 10×3＝30 |
| 數學答案（產生器 + quizlib.check） | **PASS** | **PASS** |
| catalog `quizPage` | 有 | 有 |
| PK 對戰 | **可上** | **可上** |
| 魔王戰題庫 `content/raids/` | **無**（缺 `g8-2-3c.json`，也無 `*-raid.py`） | **無**（缺 `g9-2-1c.json`，也無 `*-raid.py`） |
| catalog `raidPage` | **無** | **無** |
| 魔王戰 | **不可上** | **不可上** |

### 其他相關節（備用／新課）

| 課程 | PK／課後檢核 | 魔王戰 | 備註 |
|---|---|---|---|
| 八 2-2 a–d | 可上（皆有 quiz） | **僅 d 可上**（`g8-2-2d`） | 另有步驟格鬥 duel |
| 九 1-4 a–c | 可上 | **僅 c 可上**（`g9-1-4c`） | |
| 八 3-1 a–d | **無題庫** | **無** | 教材已上線，但尚無 quizzes／raids |
| 九 2-2 a–d | **無題庫** | **無** | 同上 |

---

## 1. 盤點（本機 catalog／題庫）

### 1.1 Quiz（PK 共用課後檢核）

現有 `content/quizzes/`：`g8-2-2a–d`、`g8-2-3a–c`、`g8-sum-square`、`g9-1-4a–c`、`g9-2-1a–c`（共 14 份；皆 10 slots × 3 variants）。

**沒有**：`g8-3-1*`、`g9-2-2*`。

### 1.2 Raid（魔王戰）

現有 `content/raids/`：**只有** `g8-2-2d.json`、`g9-1-4c.json`。  
產生器亦只有 `g8-2-2-raid.py`、`g9-1-4-raid.py`。

`npm run lessons` 後 `content/raids.generated.json` banks = `{ g8-2-2d, g9-1-4c }`；僅這兩堂會自動插入 `raidPage`。

### 1.3 推斷「今天可能上的節」

依昨日審核與手邊紀錄，今天八／九最可能仍是 **八 2-3、九 2-1**（昨天 PK 已確認可上、魔王戰跳過）。若改上新課八 3-1／九 2-2，目前 **沒有 PK 也沒有魔王**。

---

## 2. 數學／結構核對

1. 以 `C:\AI\H3\venv\Scripts\python.exe -B -X utf8` 重跑全部 quiz／raid 產生器（含 `quizlib.check`／`check_item`）：**16/16 PASS**。
2. 磁碟 JSON 結構：14 份 quiz 共 420 variants，`answer=0`、4 個不重複選項、有 stem／explanation：**全過**。
3. 兩份 raid JSON：`hostLesson` 正確；pools 數量  
   - g8-2-2d：attack 75 / shield 68 / ultimate 92 / analysis 18  
   - g9-1-4c：attack 79 / shield 50 / ultimate 99  
   基本 answer／選項檢查：**無異常**。
4. 產生器重跑後 `content/quizzes`、`content/raids` **無 git diff**（與 HEAD 一致）。

---

## 3. 自動化測試

| 測試 | 結果 |
|---|---|
| `tests/raid-*.test.mjs`（護盾／mini／美術） | **31 PASS** |
| `tests/content.test.mjs` | **3 PASS** |
| `tests/backend.test.mjs`（答案隱藏／grace／題庫不外送等 name filter） | **17 PASS** |
| Playwright Edge：`quiz` / `duel` / `raid` / `quiz-figure` | **5/5 PASS** |
| Playwright：`g8-2-3-pages`、`g9-2-1-pages`（投影片一屏） | **PASS**（八 2-3 含 iPad／手機學生頁） |
| Playwright：`raid-ipad`（題卡不重建、sweep、護盾） | **PASS** |
| Playwright：`raid-layout` g8-2-2d | **PASS**（69 題次、抽樣視窗，**抖動 0**） |
| Playwright：`raid-layout` g9-1-4c、mirror-height | **本輪未跑完**（worker 仍在跑／輸出未寫入總結；不擋今天八 2-3／九 2-1 的 PK 結論） |

答案外流回歸：後端測試確認 quiz 答案在寬限期內對學生隱藏；題庫／卷子／選項對照不送到學生端。與 HEAD `61164df`／live `13c866bf` 一致，**未發現回歸**。

---

## 4. 「漏掉沒修」清單

### 阻擋上課（若堅持上該節魔王戰）

1. **八 2-3、九 2-1 沒有魔王戰題庫**（與 2026-11-05 相同，至今未補）。  
   - 缺檔：`content/raids/g8-2-3c.json`、`content/raids/g9-2-1c.json`  
   - 缺產生器：`scripts/quiz-src/g8-2-3-raid.py`、`g9-2-1-raid.py`  
   - 因此 catalog 無 `raidPage`；正式站也不可能有這兩節魔王戰。

2. **八 3-1、九 2-2 沒有 PK／魔王**（若今天改上新課會落空）。

### 非阻擋提醒（可上課）

1. **g9-2-1c q10-3** 圖面標示仍偏擠（昨日已記；答案正確，未改題）。講解宜放大。  
2. **彈幕資格可從能不能發推對錯**：老師已決定維持現況，本次不改。  
3. **raid-layout g9-1-4c／mirror-height** 本輪未完成收尾；若今天改上九 1-4 魔王，建議課前再確認一次版面。  
4. 未以教師／學生帳號登入正式站點開實際課堂（catalog API 需登入）。

### 已確認「不是漏修」

- 護盾變輕／減弱（HEAD 含 `8443b3a` 一系）單元測試仍全過。  
- 八 2-2d 魔王題面在 iPad landscape 抽樣 **無抖動**。  
- PK／課後檢核流程 e2e 全過。  
- 答案外流修正已在 live，後端回歸通過。

---

## 5. 是否建議上課前緊急修／部署

- **不上緊急部署。** 現況已可支援八 2-3、九 2-1 的 PK；問題是魔王戰題庫根本不存在，不是「修一個 bug 就能上」。  
- **不要在上課前硬趕做兩節魔王題庫**（需出題、SymPy、建置、部署，風險高）。  
- 若課堂一定要魔王戰：**改開 `g8-2-2d` 或 `g9-1-4c`**（題庫與 `raidPage` 皆在，且與 live 同源建置鏈）。  
- 若之後要補八 2-3／九 2-1 魔王：另開任務做 `*-raid.py` → JSON → `npm run lessons` → 審核 → **經你同意後再部署**。

---

## 6. 未驗證項目

- 教師／學生帳號登入正式站，實點八 2-3／九 2-1 的 PK 頁與（應不存在的）魔王頁。  
- 真機教室網路、全班同時 PK／魔王負載。  
- 本輪 `raid-layout` 對 `g9-1-4c`、mirror-height 的完整結果。  
- 真實 AI 批改／紅筆圈錯（與本次 PK／魔王無關）。  
- Codex 第二意見：本輪以產生器 SymPy + e2e／單元為準；缺口（缺 raid 檔）屬盤點事實，未另開 Codex。

---

## 7. 進度檔

`%TEMP%\mck-review-pk-raid-2026-11-06.md`