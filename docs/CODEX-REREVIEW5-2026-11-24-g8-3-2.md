# Codex 第 5 次複審：八上 3-2（2026-11-24）

- 模型 gpt-6.2-astra、high、唯讀；任務：`docs/codex-rereview5-g8-3-2-task.txt`。處理見 `docs/REVIEW-2026-11-24-g8-3-2.md`「第 5 次複審意見與處理」。

| 堂次 | 第 5 次複審 verdict | 判定依據 |
|---|---|---|
| g8-3-2a | **no blocker** | 簡介與目標已移除出場券要學生說明的和、積規則。簡介另有一處數學用語應修正。 |
| g8-3-2b | **no blocker** | 簡介已移除正負判準，出場券容許兩數絕對值相等，錯誤分析標題也已改成中性問句。 |
| g8-3-2c | **no blocker** | 簡介與目標已移除左右欄拆法及試對判準。開放自由翻頁時，後頁仍可查到一題暖身的答案。 |
| g8-3-2d | **blocker** | 魔王戰 15 道找錯題仍可用一條規則全答對：**每題只有正解含「和」字**。另有換數字後新形成的跨題池互給答案。 |

**整組仍未通過。** 四堂課後檢核 120 題與魔王戰 196 道一般題，逐選項核算都恰有一個正解。阻擋原因在於魔王戰找錯題可以完全跳過數學判斷。

## 第 4 次複審各項狀態

| 上輪項目 | 第 5 次核對結果 |
|---|---|
| **Blocker．a、b、c 的簡介與學習目標給出出場券規則** | **已解決。** a 現在只要求說明 \(p,q\) 與 \(b,c\) 的關係。b 要求判斷兩數的正負與絕對值大小，沒有說出哪一方較大。c 要求安排十字、判斷試排是否成立，沒有列出兩欄各放什麼及如何驗算。三堂目前的課程產物與來源一致。[a 簡介與目標](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2a.json:5>)、[b 簡介與目標](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2b.json:5>)、[c 簡介與目標](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2c.json:5>) |
| **Blocker．分析題正解有固定文字特徵** | **部分修正，仍為 blocker。** 18 題分析題的第一層選項都已移除「答案是」，也沒有一題的正解單獨最長。但 15 道找錯題的 **15 個正解都有「和」，45 個干擾項都沒有「和」**。學生看到的是洗牌後的原文，位置改變仍可辨認。具體證據見下節。[找錯題選項](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2567>)、[學生抽題回應](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/raid.ts:106>) |
| **Should-fix．三組點名的直接給解** | **原三組均已解決。** ① d 自評圖仍示範 \((x+1)(x+2)\)，`d-q7-6` 的空格已改為 **4**。② `a-q1-3` 仍用 \(3,9\)，`a-q7-5` 已改問 \(x^2+16x+15\)，右欄為 **1、15**。③ a 半完成頁第 0 步仍寫 \(x+8x=9x\)，`a-q1-6` 已改用 \((x+1)(x+12)\)，答案為 **13**。[自評原圖](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/public/lesson-assets/g8-3-2/summary.png>)、[d-q7-6](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2431>)、[a-q1-3](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:35>)、[a-q7-5](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:1272>)、[半完成頁第 0 步](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2a.json:1789>)、[a-q1-6](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:308>) |
| **Should-fix．`d-q5-4` 有兩個等價錯項** | **已解決。** 四個選項依序展開為 \(2x^2+16x-66\)、\(2x^2-16x-66\)、\(2x^2+28x+66\)、\(2x^2-28x+66\)。只有第一式等於題幹，三個錯項也彼此不同。[四個選項](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:1535>) |
| **Should-fix．b 出場券預設一方較大，錯誤分析標題暗示錯因** | **兩處均已解決。** 出場券改問「一次項係數和兩數的絕對值大小有什麼關係？」，容許 \(b=0\) 時兩數互為相反數。教師參考解保留 \(x^2-9=(x+3)(x-3)\)。`b-error` 標題已改為「小華的分解成立嗎？」。[公開條列](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2b.json:2952>)、[參考解](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2b.json:2997>)、[錯誤分析標題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2b.json:2784>) |
| **Note．`b-q4-2` 與 `b-q4-6` 只交換上下** | **原重複已解決，但新數字撞到另一題。** 現在前題算 \(-4+9=5\)，後題算 \(9-5=4\)。新配對及其影響列於下節。[b-q4-2](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:139>)、[b-q4-6](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:425>) |

## 新發現與分級

### Blocker．同一個字仍能辨認全部 15 道找錯題的正解

| 題群 | 題數 | 正確選項獨有的寫法 |
|---|---:|---|
| a、b、c 的十字試排 | 9 | 都寫「交叉相乘的**和和**一次項……」 |
| d 的先提公因數 | 3 | 都寫「最後一行**和**原式不相等」 |
| d 的先提負號 | 3 | 都寫「負號提出後，**和**原式不相等」 |

逐題在四個選項中找出含「和」的選項，**15 題都只找到一項，且每次都等於答案鍵**。這個判法不需要看題幹、辨認是哪一步錯，或等系統開放提示。應改寫正解與干擾項，讓同題有多個理由都談到一次項的和或與原式的比較，必須檢查算式才能區分。只把「和和」換成「和與」，仍會留下同一條線索。[a 題群](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2567>)、[b 題群](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2605>)、[c 題群](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2647>)、[d 公因數題群](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2693>)、[d 負號題群](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2735>)

### Should-fix．換數字後，魔王戰兩個一般題池可互給答案

新改的 attack `b-q4-6` 在題幹列出右欄 **\(+9,-5\)**，問交叉相乘的和。ultimate `b-q1-1` 則列出 **\(x^2+4x-45\)**，問因式分解。看過前題就能從後題選出 \((x+9)(x-5)\)；反過來，後題的一次項係數 **4** 也直接回答前題。兩題都是一般題，且 `b-q1-1` 同時收在 b 堂課後檢核，因此先做過該題的學生也可能帶答案進魔王戰。[attack 題幹](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:425>)、[ultimate 題幹](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:1638>)、[b 課後檢核原題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/quizzes/g8-3-2b.json:11>)

另有一組同樣可由兩邊題幹直接讀答案：`b-q4-1` 給 **\(+5,-9\)**，`b-q2-4` 給 **\(x^2-4x-45\)**。因此製作者所記「剩下的配對都是分析題情境」不適用於目前整份題庫。這些配對須先後抽到才會影響學生，沿用第 4 次標準列為 should-fix。[b-q4-1](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:126>)、[b-q2-4](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2223>)、[製作者處理紀錄](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/REVIEW-2026-11-24-g8-3-2.md:171>)

### Should-fix．a 的新簡介把展開結果寫成「一次式」

現行文字是「從 \((x+p)(x+q)\) 的展開找出兩個常數和**一次式各項**的關係」。展開結果是二次式。可改為「從 \((x+p)(x+q)\) 的展開，觀察 \(p、q\) 與二次式各項係數的關係」，也能保留出場券要學生自行說明的空間。[a 課程簡介](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2a.json:5>)

### Note．公布前的可見範圍與 `crossSteps.pre`

- **出場券本頁。** a、b、c 的題幹、條列與公開 `levels[].description` 現在要求學生說明條件、判準或舉例，未直接列出完整得分規則。`a-sign`、`b-sign` 的正文仍明教符號規則，該頁 IRS 隨即要求套用到指定二次式。本審將這兩頁視為引導練習；出場券才要求獨立說明。[a 出場券](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2a.json:3020>)、[b 出場券](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2b.json:2943>)、[c 出場券](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2c.json:3438>)、[a 符號頁](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2a.json:2255>)、[b 符號頁](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2b.json:1928>)
- **`pre` 的兩個實際使用點通過。** `d-ex6`、`d-ex7` 第 0 步各只有一個文字圖形，分別顯示提出公因數或負號後的 \(2(x^2+2x-8)\)、\(-(3x^2-4x+1)\)。兩頁各有 8 個十字圖形到第 1 步才出現，沒有額外 `caption`，公開的小題 prompt 只有 \(a\)、\(b\)，同頁課本截圖也只給題目。共用模板另有讓 `mask` 自第 0 步顯示的分支，所以此結論限於這兩個使用點。[例 6](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2d.json:123>)、[例 7](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2d.json:519>)、[模板步驟處理](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/scripts/lessons-src/viz.mjs:730>)
- **自由翻頁時，仍有可直接查到的前題答案。** c 暖身第 1 格問 \((x+5)(3x+1)\) 的一次項係數，後面 `c-intro` 正文和第 0 步直接寫 **16**。b 的後頁附圖印有例 3 的完整分解；d 的例 6、例 7 也各在下一張隨堂頁附上前題完整分解。Worker 會濾除未公布的答案欄位及動畫步驟，但仍回傳整份課程的投影片文字與圖檔參照；同步授課時，學生介面依教師頁碼顯示。這是既有的跨頁條件，應與同頁直接給答分開判定。[c 暖身第 1 格](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2c.json:81>)、[c 後頁正文](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2c.json:941>)、[b 附圖](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2b.json:2106>)、[d 例 6 附圖](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2d.json:332>)、[d 例 7 附圖](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2d.json:728>)、[Worker 過濾](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:828>)、[學生顯示頁碼](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:1092>)

### Note．首輪第 3 項後半可接受教師備註處理

`a1` 的定義是「\(x^2\) 係數為 1」，內建示例就是 \((x+7)(x-2)\)。因此即使只開很短時間，第一題也可能出現負常數項。a 堂教師備註已清楚說明這是下一堂內容，並提供「等第 2 堂再開」的可行選擇。**在本次教材範圍內可接受**；若當堂必須限定正的常數項，就採用延後開對戰的做法。[a 堂教師備註](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2a.json:3116>)、[`a1` 定義](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/shared/game-focus.ts:42>)、[共用出題邏輯](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/shared/cross.ts:146>)

## 實際執行的檢查與限制

- **來源與學生可見資料。** 唯讀檢查 50 張主教材頁、4 張額外暖身頁與 29 張課本 PNG。核對題目、選項、`items[].prompt`、規準等級、正文、條列、附圖、圖說、滑桿初值與第 0 步。另確認四堂簡介、目標、原始教材頁、暖身及課後檢核題位與 `catalog.generated.json` 一致，魔王戰與 `raids.generated.json` 的對應題庫也一致。
- **課堂與一般題核算。** 以指定 Python 加 `-B -X utf8` 執行唯讀課堂檢查，結果為官方答案 **45 式**、課程填空 **49 格**、式子選項 **5 題**，**0 筆不一致**。另直接讀取產物，以 SymPy 逐選項核算 **42 attack、77 shield、77 ultimate**，共 **196 題**均恰有一個正解，且與答案鍵相符。四堂課後檢核的 **120 題**也已逐題比對其魔王戰副本的題幹、選項、答案及詳解。
- **分析題與 attack。** 9 道十字試排題的第①步成立，第②步宣稱「交叉相乘也合」才是第一個錯誤。錯排與目標的一次項係數，a 三題依序為 \(9/-9、10/-10、15/-15\)，b 為 \(2/-2、3/-3、-3/3\)，c 為 \(-2/10、7/11、-13/7\)。九題詳解的改正式全部展開回原式。另六道找錯題各有唯一的第一個錯誤，三道「判斷＋理由」的兩種分解均成立，理由鍵一致。**42 道 attack 都可一步完成**：18 題做一次帶符號加法、18 題比對常數項做一次除法、6 題提出負號整體變號。
- **互給答案。** 實跑 `g8-3-2-dupcheck.py` 得「互給答案的組合：**0 組**」，另報魔王戰有 **18 個二次式**跨題池。程式對魔王戰只統計重合數，也沒有從 PNG 讀取數式，所以「0 組」不能作為整份教材與魔王戰零洩題的結論。本報告列出的跨池配對另行核對了兩端實際題幹。[檢查器的題目取樣](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/scripts/quiz-src/g8-3-2-dupcheck.py:64>)、[魔王戰統計範圍](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/scripts/quiz-src/g8-3-2-dupcheck.py:111>)
- **驗證限制。** 全程未修改檔案，未執行產生器、`npm run lessons`、`npm run check` 或 E2E。學生可見性的判定依目前教材產物、實際 PNG、Worker 回應與前端顯示程式；本輪未另開獨立學生瀏覽器，也未重新比對原始教用版 PDF。
