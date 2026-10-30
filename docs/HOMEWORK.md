# 回家作業與學習紀錄

## 功能

1. **學習紀錄**：每個班級、每個座號的每一次作答都記下來：IRS 互動、課後檢核測驗、PK、魔王戰、步驟格鬥、補救練習。每一筆標上題型、對應的學習目標，以及 108 課綱的學習表現與學習內容代碼。
2. **差異化回家作業**：每一課（重點）的老師端都有「派發回家作業」。
   - 系統依互動紀錄算出每位同學各題型的答對率，預設勾選答對率最低的 1/3 同學，老師可以再加選或取消。
   - 每位同學的作業是 10 題手寫題，從他最需要練習的題型出題。
   - 老師下載一個 zip，裡面是每位同學一份 A4 PDF，已經印好班級、座號和 QR code。
3. **整節作業**：魔王戰那一課（沒有魔王戰的節，用最後一個重點）多一個「整節作業」選項，題型涵蓋該節所有重點。
4. **繳交與批改**：學生寫完後掃 QR code（或從學生端「回家作業」入口）拍照上傳。照片存在 Cloudflare Durable Object（老師 2026-10-30 決定；Supabase Storage 的程式只留作參考，目前不用）。AI 逐題對答案，學生立刻看到結果，老師端也看得到，並可改判。

## 手寫題庫：`content/homework/<課程 id>.json`

由 `scripts/homework-src/<節>.py` 產生，答案用 SymPy 核算。題型（slot）和課後檢核題庫 `content/quizzes/<課程 id>.json` 一一對應：同樣的 `id`、同樣的 `topic`。

```jsonc
{
  "lessonId": "g9-2-1a",
  "section": "9-2-1",                 // 同一節的各課用同一個值（整節作業用）
  "title": "2-1(1) 弧長、扇形與弓形",
  "source": "九上課本 2-1 p.xx–xx；備課用書 p.xx（學習表現、學習內容）",
  "curriculum": {
    "performance": [{ "code": "s-IV-14", "text": "（備課用書上的完整敘述）" }],
    "content":     [{ "code": "S-9-5",   "text": "（備課用書上的完整敘述）" }]
  },
  "slots": [
    {
      "id": "q1",                      // = 課後檢核題庫的題位 id
      "topic": "弧長",                  // = 課後檢核題庫的 topic
      "objective": 1,                  // 這課 lesson.objectives 的第幾條（從 0 起算）
      "performance": ["s-IV-14"],      // 這個題型對應的學習表現代碼（curriculum.performance 裡要有）
      "content": ["S-9-5"],
      "variants": [                    // 至少 5 題，同題型換數字或換情境
        {
          "stem": "圓 $O$ 的半徑為 $10$，圓心角 $\\angle AOB=60^\\circ$，求 $\\overset{\\frown}{AB}$ 的長度。",
          "figure": "<svg …>",         // 選用；幾何題一定要有圖，用題目自己的數字畫（重用 scripts/quiz-src 的 geom.py、circlefig.py）
          "answer": "$\\dfrac{10}{3}\\pi$",   // 最後答案（給 AI 對答案、老師看）
          "solution": "弧長＝$2\\pi\\times10\\times\\dfrac{60}{360}=\\dfrac{10}{3}\\pi$",  // 簡短詳解
          "space": 2                   // 作答空間：1 短（約 4 行）、2 中、3 長（證明、多步驟）
        }
      ]
    }
  ],
  // 學習紀錄用：課堂上的作答屬於哪個題型
  "links": {
    "activities": { "a-ex1": ["q1"], "a-ex1-practice": ["q1", "q2"] },  // 有 activity 的頁面 ID（slide.id，不是 activity.id）→ 題位 id（沒有對應的題型就不列）
    "items": { "a-ex1-practice": [["q1"], ["q2"]] },                   // 多小題的頁：每一小題各自的題位（依 activity.items 順序）。整頁對到 2 個以上題型的多小題頁一定要列
    "raidTopics": { "簡記：整數 × 根式": "g8-2-2a:q3" },              // 只有魔王戰的課：raid 題目的 topic → 「課程 id:題位 id」（魔王戰涵蓋整節）
    "raidSkip": ["估算"],                                              // 刻意不對到題型的 raid topic（前一節的先備題），只算總答對率
    "duelFamilies": { "√a × √b（乘起來是完全平方數）": "q2" }            // 只有步驟格鬥的課：這一課出現的每個 family → 題位 id（累積的、前面課的 family 寫「課程 id:題位 id」）
  }
}
```

### 出題規則

- **手寫題，不是選擇題**：不能有「下列何者」「哪一個」這種要看選項的題目；要學生寫出過程和最後答案。
- 先把課後檢核題庫裡能改的題目改成手寫題（拿掉選項、改成「求…」），不能改的換掉；每個題型補到至少 5 題。
- 範圍只到這一課為止（累積，前面的課可以用，後面的不行）。
- 數學式用 `$LaTeX$`；產生器裡用 Python raw string，避免反斜線消失。
- 每一題的 `answer` 和 `solution` 都要用 SymPy 驗算；核算程式放在 `scripts/homework-src/`，跑完要印出「N 題全部一致」。
- 幾何題每一題都要有用自己的數字畫的 SVG 圖，產生後逐題看過預覽。
- 學習表現、學習內容代碼抄自備課用書（八上：`八年級/115上_國中_數學_教材資源_備課用書_備課PDF_二年級/`；九上：`九年級/01_115國中數學3上課本PDF/01_115國中數學3上課本PDF(教)/00_…編輯要旨與目次(教).pdf` 或各節教用課本），`source` 寫頁碼。來源 PDF 唯讀。

### 驗證

```sh
python scripts/homework-src/<節>.py      # 產生 content/homework/*.json 並核算
node scripts/check-homework.mjs           # 檢查格式、題位是否和課後檢核一致、links 的 activity 是否存在、
                                          # 多小題頁有沒有逐小題對應、每一題魔王戰與每個步驟格鬥 family 都對到題型
python -X utf8 scripts/quiz-src/g9-1-4-raid.py   # 1-4 魔王戰（check_item 核算＋幾何條件可實現性）
```

### 學習紀錄怎麼對題型

- IRS 多小題：有 `links.items` 就逐小題記一筆、對到該小題的題型；沒有時，整頁只對到一個題型就每小題都算它，對到兩個以上題型就不猜（只算總答對率）。
- IRS 單一作答、補救練習：對到幾個題型記幾筆，第二筆起標 `dup`，各題型都算、總答對率只算一次。「原題再做一次」每一輪做的是哪一小題，照該小題的題型。
- 課後檢核、PK、錯題練習：題位；間隔複習：同一節同名 topic。
- 魔王戰：題目 ID「課程-題位-n」→ `links.raidTopics` → 同一節同名 topic；`links.raidSkip` 裡的不對。
- 步驟格鬥：`links.duelFamilies`，這一課沒列時往同一節前面的課找。
- 舊的魔王戰、步驟格鬥紀錄沒有題目 ID，只算總答對率。IRS 同一頁同一人只取最後一次作答。

## 老師怎麼用

1. 上課時在課堂右側按「派發作業」（「紀錄」頁每一堂課也有）。視窗列出每位同學的答對率、作答數與最需要練習的題型，預設勾選答對率最低的 1/3，可以加選、取消、全選、清除。
2. 魔王戰那一課（沒有魔王戰的節是最後一課）上方多一個「整節」選項，題型涵蓋這一節所有重點。
3. 按「產生 N 份作業並下載 zip」：每位同學一份 A4 PDF（印好班級、座號、QR code，每頁都有），加上 `00_解答總表（老師用）.pdf`。
4. 「作業」頁：每份作業的繳交、批改人數與平均答對率；開啟後看每位同學的照片（紅筆）、每一題的對錯與評語，可以改判（✓ ✗ ?）、重新批改、重新下載 PDF。
5. 「學習」頁：選班級、課程，看每個座號每個題型的答對率（顏色深淺）；點座號看每一筆作答；「下載 CSV」含學習目標、學習表現與學習內容代碼與敘述。

## 學生怎麼交

- 掃作業卷右上角的 QR code（不用登入），每一頁拍一張（最多 6 張）→「送出批改」。
- AI 大約 1 分鐘批改完，畫面自動更新：照片上有紅筆 ✓／✗ 與評語（答對也有鼓勵的話），每題的正確答案與詳解。
- 訂正後可以「重新上傳」（每份最多送出 3 次）。
- 學生登入後，等待室下方也列出自己的回家作業。

## 批改

- 用設定頁的 AI 金鑰（預設 OpenAI gpt-6-luna），計入每日 AI 上限。沒有金鑰時是「示範批改」。
- 由 Durable Object 的 alarm 在背景批改（`worker/index.ts` 的 `alarm()` → `drainHomework`），學生關掉網頁也會繼續；AI 失敗時狀態是「批改失敗」，老師按「重新批改」。
- 佇列（`state.hwQueue`）裡的工作要等結果寫回後才移除：開始批改時在作業卷記一個 6 分鐘的租約（`sheet.lease`）。寫回失敗、程序中斷時，租約到期後 alarm 會重新批改；alarm 本身出錯時 30 秒後重試。送出時 alarm 排不進去，就當場批改。
- 老師重新批改、學生重傳後，舊的那一次結果不寫回（比對 `jobAt` 與租約 ID）。
- AI 回覆依題號 `n` 對應：只要有題號就嚴格照題號，缺的、重複的題號都當「看不清楚」，不拿別題的結果補。
- 提示詞在 `worker/homework.ts` 的 `HOMEWORK_SYSTEM`：讀出每題最後答案、判斷是否和標準答案等價、寫 20 字內的紅筆評語、標出答案在照片上的位置。
- AI 批改完學生立刻看到結果（老師 2026-10-30 決定），是 `docs/SECURITY.md`「教師覆核後才發回」的例外。

## 照片存放（Durable Object）

**目前照片一律存在 Cloudflare Durable Object**（vault 的 `hwphoto:<作業 ID>/<座號>/<照片 ID>`，和課堂作答照片一樣），老師 2026-10-30 決定。不要設定 `SUPABASE_URL`／`SUPABASE_SECRET_KEY`。

- 每份作業最多 6 張照片；每張 data URL 最多 1,900,000 字元（Durable Object 單筆約 2 MB）。超過的請求直接拒絕，不寫入任何東西。
- 上傳（含訂正後重新上傳）的順序：先驗證格式與大小 → 存新照片 → 一次寫入新的照片清單與狀態（作業內容 `hw:<id>` 一筆）→ 成功後才刪舊照片。任一步失敗，舊照片、批改結果都不變，學生可以直接再傳一次。
- 刪除單張照片、清除舊照片：先寫入新的照片清單，再刪照片，清單不會指到已刪的照片。
- 刪除作業、刪除班級：Durable Object 裡的照片、凍結的題目、作業內容都刪掉。中途出錯時整個請求失敗，再按一次會把剩下的刪完。

### Supabase Storage（參考，目前不用）

`worker/photos.ts` 保留 Supabase Storage 的實作作為參考：設定 Supabase 後作業照片會存到私人 bucket，照片只經過 Worker，瀏覽器拿不到金鑰。這條路徑的已知問題沒有修，啟用前要先處理：審核 C-7（啟用前存在 DO 的照片讀不到）、C-8（Supabase 刪除失敗仍回報成功）。下面是當初的設定步驟。

1. 在 Supabase 建立專案，Storage → New bucket，名稱 `homework-photos`，**不要勾 Public**。
2. Project Settings → API Keys 複製 **secret key**（`sb_secret_…`），不要貼到聊天或檔案裡。
3. 存成 Cloudflare Worker 的 secret：

   ```sh
   npx wrangler secret put SUPABASE_URL --env production
   npx wrangler secret put SUPABASE_SECRET_KEY --env production
   ```

   `SUPABASE_URL` 是 `https://<專案代碼>.supabase.co`。bucket 名稱不是 `homework-photos` 時，再設 `HOMEWORK_BUCKET`。
4. 設定之前上傳的照片仍在 Durable Object，設定之後的才存到 Supabase。目前的程式設定後只讀 Supabase，舊照片會讀不到（C-7，未修）。

## 資料

- 作業內容（每位同學的題目、照片清單、批改結果）存在 vault 的 `hw:<作業 ID>`；主檔只有摘要（`state.homework`）與批改佇列（`state.hwQueue`）。
- 派發時把每位同學的 10 題（題幹、附圖、答案、詳解）凍結存到 vault 的 `hwq:<作業 ID>/<座號>`（`sheet.frozen`）。之後改題庫、重新產生題庫，已派發作業的重新下載、學生畫面與 AI 批改都用派發時的版本。2026-10-30 修正前派發的作業沒有凍結，仍讀目前題庫。
- 學習紀錄不另外存：每次打開時從各堂課的作答（含封存的課）與批改完的作業整理出來（`worker/homework.ts` 的 `sessionRecords`、`homeworkRecords`）。學習頁每次進入都重新讀。
- 學生重傳、老師重新批改後只保留目前這一次的照片與結果，舊的批改結果不保留。
- 刪除班級會一起刪除該班的作業、凍結題目與照片。

## 備份

**目前的備份（課堂紀錄頁「下載備份」）不含回家作業**：派發紀錄、每人的題目、照片、批改結果，以及由作業產生的學習紀錄都不在裡面（備份檔的 `excludes` 寫著 `homework`）。在全新的儲存還原後，課堂上的作答紀錄會回來，作業不會。要不要把作業納入備份、範圍到哪裡（見審核回覆「待老師決定」），等老師決定。
