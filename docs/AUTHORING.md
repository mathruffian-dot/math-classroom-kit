# 教材格式與認知科學設計

教材是 `content/lessons/*.json`（`schemaVersion: 1`）。最終驗證依據是 `worker/validation.ts`，執行 `npm run lessons` 即可檢查。

## 一、認知科學設計流程

每份課程依下列順序排頁。每頁的 `phase` 填寫該頁的階段名稱：

| 階段（phase） | 目的 | 常用 IRS |
| --- | --- | --- |
| 提取練習 | 先喚起需要的舊知識（retrieval practice） | `numeric` 多小題 |
| 預測 | 講解前先猜，讓迷思浮現（pretesting） | `single`，先公布統計、暫不公布答案 |
| 具體操作 | 拖拉、切割、移動圖形（CRA 的具體階段） | `manipulate` |
| 圖式連結 | 圖和式用同色對應；逐步揭示，目前步驟發光 | `numeric`／`single` |
| 工作範例 | 先讓學生試算，再逐步講解 | `numeric`（就是例題本身） |
| 半完成範例 | 只留關鍵步驟讓學生完成（fading） | `numeric` |
| 隨堂練習 | 課本隨堂，加上換數字的同類題，共 1–3 小題 | `numeric` + `items` |
| 錯誤分析 | 找錯、更正並說明理由（自我解釋） | `canvas` + `rubric` |
| 交錯練習 | 混合不同類型的題目 | `multiple` |
| 出場券／後設認知 | 用自己的話說明、自評 | `short` + `rubric`、`scale` |

**檢查表**（`npm run lessons` 會自動提醒）：

- 每頁一個重點，內文 90 字以內。
- 每頁都有 IRS。
- 有步驟揭示的頁面，要設定 `step`／`focus`，讓目前步驟發光。
- **例題、隨堂、錯誤分析：依課本的解法，把解題過程步驟化或結構化地呈現**（逐行等號鏈、左右兩欄、面積模型、數線），不一定要做滑桿。滑桿留給「操作本身就是重點」的頁面（具體操作、概念探索）。
  - 隨堂頁的示範用**另一組數字**，不要示範 IRS 的原題。
  - 錯誤分析頁只給結構、結果留「？」，不要直接給正解。
  - 樣板在 `scripts/lessons-src/viz.mjs`：`stepsViz`（等號鏈）、`multSteps`（係數欄／根號欄）、`compareSteps`（比大小）、`binomialSteps`（和的平方面積模型）。最後一步會把全部步驟點亮。
  - 單欄等號鏈會由 `tests/content.test.mjs` 自動驗算。
- `canvas`、`short` 題要附評量規準（rubric），並寫好參考解答。
- 每頁標示 `source`（課本頁碼）；自編題目也要註明是自編。

## 二、頁面（slide）欄位

```json
{
  "id": "a-ex1",
  "phase": "工作範例",
  "eyebrow": "04 / 例 1 根式的乘法",
  "title": "√a × √b ＝ √(a×b)",
  "body": "長 √a、寬 √b 的長方形，面積是 √(ab)。",
  "source": "對應課本 2-2 p.74",
  "notes": "教師備註，學生看不到",
  "figures": [{ "src": "g8-2-2/ex1.png", "alt": "課本 p.74 例 1 題目" }],
  "interactive": { "...": "見第三節" },
  "activity": { "...": "見第四節" }
}
```

**數學式寫法**

- 用 `$…$` 包住 LaTeX，例如 `$\frac{4\sqrt{5}}{15}$`。
- 純文字也會自動排版成課本樣式：`√3 × (−2√5)`、`4/(3√5)`、`(√5+√3)/2`、`(a+b)²`。
- 自動排版會保留原本寫的括號、×、÷。若要精準控制（例如分數係數），請寫 LaTeX。
- 在 JS 產生器裡寫 LaTeX 時用 ``String.raw`…` ``，避免反斜線被轉義。

**課本截圖**

- `figures` 最多 3 張，路徑格式是「課程資料夾/檔名.png」，檔案放在 `public/lesson-assets/`。
- 截圖會排成一列顯示在頁面上方。授課中點一下，會在投影片區內放大：畫筆、橡皮擦、雷射、聚光、翻頁、IRS 都照常可用；放大時的筆跡另存，縮小後不會蓋到原版面（Esc 或「縮小」）。
- 只截最重要的區塊（題目框與附圖），不要截整頁。
- 只有已登入的師生看得到截圖，而且截圖不進 git。

**動畫片段（animation）**

```json
"animation": { "src": "g8-2-2/anim-a-ex1.mp4", "poster": "g8-2-2/anim-a-ex1.png", "caption": "為什麼 √2 × √3 ＝ √(2×3)", "seconds": 27.3 }
```

- 靜音 mp4＋封面圖，檔名以 `anim-` 開頭，放在 `public/lesson-assets/`（和截圖一樣不進 git，部署時上傳）。
- 每頁一段，和課本截圖排在同一列；點一下在投影片區內播放，暫停後可以直接用畫筆標註。
- 頁面有 IRS 時，學生端要等老師在這一頁按「公布結果」才解鎖（伺服器端鎖定，直接讀檔也會被擋）；`"reveal": "always"` 則一律可看。預測頁若要「保留疑問到下一頁」，就不要放動畫。
- 2-2 的動畫由 `八年級/影片/根式的運算_動畫簡報_v1/tools/export_classroom.py` 從解說影片剪出，對照表在 `scripts/lessons-src/g8-2-2-animations.json`。

## 三、可操作視覺化（interactive）

**座標**：使用數學座標（y 向上）。幾何圖形請加上 `aspect: "equal"`。

```json
{
  "view": { "xMin": -1, "xMax": 12, "yMin": -1, "yMax": 12, "grid": 1, "axes": false, "aspect": "equal" },
  "params": [
    { "id": "a", "label": "$a$", "min": 1, "max": 8, "step": 1, "value": 5 },
    { "id": "cut", "label": "切割線", "kind": "toggle", "value": 0 }
  ],
  "points": [{ "id": "P", "x": 2, "y": 3, "snap": 1, "label": "P" }],
  "shapes": [
    { "type": "rect", "x": 0, "y": 0, "w": "a", "h": "a", "fill": "rgba(123,97,255,.25)", "color": "#7b61ff", "toggle": "cut" },
    { "type": "text", "x": "a/2", "y": "a/2", "text": "$a^2={a^2}$", "show": "cut" },
    { "type": "brace", "points": [[0, "a"], ["a", "a"]], "text": "$\\sqrt{a*2}$" },
    { "type": "segment", "points": [[0, 0], ["Px", "Py"]], "step": 1 },
    { "type": "function", "expr": "a*x+1" }
  ],
  "readouts": [{ "label": "面積 $a^2$", "expr": "a^2", "digits": 2 }],
  "steps": ["第 0 步說明", "第 1 步說明"],
  "caption": "圖說"
}
```

**圖形類型（type）**

| type | 用途 |
| --- | --- |
| `function` | 函數圖形，`expr` 是 y 關於 x 的式子 |
| `segment` | 線段 |
| `line` | 直線 |
| `polygon` | 多邊形 |
| `circle` | 圓 |
| `rect` | 長方形 |
| `text` | 文字 |
| `point` | 點 |
| `angle` | 角（三個點，中間是頂點） |
| `brace` | 尺寸標示線，畫在 p1→p2 方向的左側（外側） |

**運算式**

- 可用：`+ - * / ^`、比較運算、`&& || !`、`? :`。
- 函數：`sqrt abs round min max floor ceil sin cos tan`（角度制）、`gcd mod`。
- 點 P 的座標變數是 `Px`、`Py`。
- 步驟揭示的變數是 `step`，從 0 開始。

**文字樣板**

- `{運算式}` 會代入即時數值。
- 在 `$…$` 裡也可以用，例如 `$\sqrt{a*b}$` 會變成 `√21`。
- 不能解析的大括號（例如 `\text{…}`）會原樣保留。

**步驟聚焦**

- 有 `steps` 時，目前步驟相關的圖形發光，其他圖形反暗。
- 圖形預設在自己出現的那一步（`step`）發光。
- 要在其他步驟也發光，加上 `"focus": [0, 4]`。

**其他屬性**

| 屬性 | 作用 |
| --- | --- |
| `show` | 條件為假時隱藏圖形 |
| `toggle` | 點擊圖形可切換某個開關參數 |
| `step` | 第幾步之後才出現 |

**重複使用的樣板**：見 `scripts/lessons-src/viz.mjs`，包括：

- 根式長度積木
- 長方形面積乘法
- 數線比較大小
- 正方形切割化簡
- 對角線上數線
- 分母有理化
- 同類方根積木
- 分配律面積
- 和的平方
- 平方差
- 逐步解題

## 四、IRS 題型（activity）

| type | 必要欄位 | 說明 |
| --- | --- | --- |
| `single`／`multiple` | `options`（可加 `correct`） | 選擇題 |
| `scale` | `min`、`max` | 自評量尺 |
| `numeric` | `answer`，或 `items`（1–3 題） | 答案可寫分數或根式。加上 `form: "simplest-radical"` 時，數值對但沒化簡會判錯，並提示「還沒化成最簡根式」 |
| `manipulate` | `check`（例如 `"a==6 && b==2"`），可加 `record` | 學生操作同一頁的圖後送出，伺服器依 `check` 判定對錯 |
| `canvas` | `rubric`（必填），可加 `canvas: "grid"／"axes"／"dots"／"blank"`、`allowPhoto` | 手寫、作圖或拍照作答 |
| `short` | 可加 `rubric` | 短答 |

**評量規準（rubric）**

```json
{
  "criteria": [
    {
      "id": "find",
      "label": "找出錯誤",
      "points": 2,
      "levels": [
        { "score": 0, "description": "未指出錯誤" },
        { "score": 1, "description": "只說錯了" },
        { "score": 2, "description": "明確指出漏了 2ab" }
      ]
    }
  ],
  "reference": "參考解答（公布前不會給學生）",
  "graderNotes": "可接受的替代做法"
}
```

**批改分兩層**

- **第 1 層（預設）**：只判斷對錯，快又省。
- **第 2 層**：教師開啟「依規準給分＋紅筆批註」後，AI 依規準逐項給分，並在學生作答圖上用紅筆批註（向量疊圖，原圖不更動）。

兩層的結果都要經教師覆核後再發回學生。

**作答限時與補救練習（numeric）**

- 老師開放作答時選限時（預設 1 分鐘，可選 30 秒～5 分鐘或不限時）。時間到就鎖住作答，老師可以「＋30 秒／＋1 分鐘」或結束作答。
- 全班作答後，老師按「派補救練習給答錯的同學」（可勾選也派給未作答的同學）。每人各自計時 1 分鐘、一輪一題；答錯或時間到就換下一題，最多 3 輪；3 輪都沒過就標「需個別指導」。每輪結束後學生會看到該輪答案與說明。
- 練習題放在 `content/practice/<課程 id>.json`，`npm run lessons` 會併進課程：

```json
{ "<activity id>": [
  { "prompt": "(−3√2) ÷ 6（化成最簡根式）", "answer": "-√2/2", "explanation": "−3 ÷ 6 ＝ −1/2" },
  { "prompt": "…", "answer": "…" },
  { "prompt": "…", "answer": "…" }
] }
```

  每個 numeric 題目寫 3 題：同技能、同難度、換數字，題目要自足（學生看不到新圖）；`answer` 用半形可解析寫法，沿用原題的 `form`、`unit`、`tolerance`；答案要用 SymPy 獨立驗算。

**會考式手寫題（拍照批改，0–3 分）**

- 需要看計算過程的題目做成 `canvas` 題，評量規準用單一向度 `kai`（會考評分，滿分 3）：3 完整正確／2 觀念正確但有小錯或不完整／1 部分正確／0 空白或錯誤，每一級寫成這一題的具體描述；`reference` 寫完整解法，`graderNotes` 寫可接受的其他做法與常見錯誤。
- 放在 `content/written/<課程 id>.json`，`npm run lessons` 會插入新頁並換掉規準：

```json
{ "slides": [{ "after": "<插在哪一頁之後>", "slide": { "id": "a-written", "phase": "會考練習", "activity": { "type": "canvas", "rubric": { "criteria": [{ "id": "kai", "points": 3, "levels": [] }] } } } }],
  "rubrics": { "<既有 canvas 題 ID>": { "criteria": [{ "id": "kai", "points": 3, "levels": [] }] } } }
```

- 課堂流程：學生紙本作答 → 拍照 → AI 逐行辨識 → 學生核對 → 送出 → 自動快速批改（只看辨識稿）→ 在辨識稿上圈出錯處、寫原因 → 老師覆核後發回。

## 五、交給 agent 的提示詞

```text
請依 math-classroom-kit/AGENTS.md 與 docs/AUTHORING.md，把〈年級 單元〉做成數感課堂課程：
先盤點課本每個例題與隨堂（頁碼、題目、教用版答案），截取重點課本圖到 public/lesson-assets/，
依認知科學流程排頁，每頁都有對應的 IRS，隨堂改成 numeric items（課本題＋換數字題，最多 3 題），
錯誤分析用 canvas＋評量規準。完成後執行 npm run lessons 與 npm run check，並回報頁數與提醒。
```

## 課後形成性評量題庫（PK 戰共用）

- 每堂課一份：`content/quizzes/<課程 id>.json`，由 `scripts/quiz-src/<課程 id>.py` 產生（範例：`g8-2-2a.py`）。
- 10 個題位，每個題位 3 題「同類型換數字」的四選一題目；第 1 個選項是正確答案（派題時伺服器會打亂選項順序）。
- 錯誤選項寫學生常見的錯法（加進根號、係數相加、正負號、乘除顛倒…），老師看選項分布就知道卡在哪裡。
- 產生器用 SymPy 核算：正確選項必須等於題目的值、錯誤選項都不能相等；「哪一個正確」的題目必須剛好一個敘述為真。
- `npm run lessons` 會把題庫併進課程（`lesson.quiz`，學生端看不到）。派題時每個題位抽 1 題，全班同一份；重新派題或 PK 會重新抽。
