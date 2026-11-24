# Codex 第 4 次複審：八上 3-2（2026-11-24）

- 模型 gpt-6.2-astra、high、唯讀；任務：`docs/codex-rereview4-g8-3-2-task.txt`。處理見 `docs/REVIEW-2026-11-24-g8-3-2.md`「第 4 次複審意見與處理」。

| 堂次 | 第 4 次複審 verdict | 判定依據 |
|---|---|---|
| g8-3-2a | **blocker** | `a-exit` 本頁已遮蔽解答，但學生收到的課程簡介與學習目標直接給出「兩數的和、積」兩個得分條件。 |
| g8-3-2b | **blocker** | \(b=0\) 的參考解已補正。學生收到的課程簡介仍寫出 `b-exit` 教師備註列為「正負判斷」滿分的規則。 |
| g8-3-2c | **blocker** | 課程簡介用一句話完整回答 `c-exit` 的兩個問題，包括左右欄各拆什麼，以及怎麼知道試對。 |
| g8-3-2d | **blocker** | 上輪的 `topic` 洩漏已修正，但魔王戰 15 道找錯題都能靠同一個選項文字特徵答對 15/15，洗牌後仍然有效。 |

**第 3 次複審點名的 blocker、三組互給答案及 \(b=0\) 缺漏都已修正。** 本輪仍不建議整組通過。四堂課後檢核 120 題與魔王戰 196 道一般題均恰有一個數學正解。阻擋項在於學生能在作答前取得多少答案資訊。a～c 沿用第 3 次審 `topic` 的標準，將學生實際收到的欄位納入判定，並在下文區分資料回應與一般畫面。

## 第 3 次複審各項狀態

| 上輪項目 | 狀態與現行證據 |
|---|---|
| **d．分析題 `topic` 提前點出錯因** | **已解決。** 18 題共六種 `topic`，現在只說題型或分解情境。例如 `d-q1-6` 寫「找錯：先提公因數的分解步驟」，學生仍須檢查等號才能知道第③步漏了 2。`questionFor()` 仍傳送 `topic`、打亂後的選項，並按提示開放狀態另送 `hint`。教材成品與 Worker 使用的題庫一致。[現行分析題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2689>)、[學生抽題回應](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/raid.ts:106>) |
| **`b-q6-5` → `d-q7-1`** | **原配對已解決。** 前題現在給 \((x-7)(x+1)=x^2-6x-7\)。後題提出 4 後是 \(x^2-5x-6=(x-6)(x+1)\)。兩題雖都有 \(x+1\)，前題的恆等式已無法直接代入後題。[前題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:1378>)、[後題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2108>) |
| **`d-q5-4` → `d-q3-2`** | **原配對已解決。** 前題改為 \(2(x+11)(x-3)\)，後題為 \(-(x+5)(x-3)\)。沿用前題兩個括號已無法作答。前題換數字後另有兩個等價錯項，列於新發現。[前題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:1534>)、[後題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2004>) |
| **`a-sign` 初值 → `a-q8-4`** | **原配對已解決。** 滑桿仍從 \(2,7\) 開始，新題給 \(x^2+15x+26=(x+2)(x+\square)\)，須填 **13**。[課堂初值說明](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2a.json:2514>)、[新填空](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:362>) |
| **b．出場券漏列 \(b=0\)** | **參考解與批改備註均已解決。** 參考解明列兩數互為相反數、絕對值相等，並舉 \(x^2-9=(x+3)(x-3)\)。批改備註也接受這個例子。學生端條列尚有一處措辭可同步調整。[參考解與批改備註](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2b.json:2997>) |
| **首輪第 3 項後半．a1 對戰可能出負常數項** | **在本次教材範圍內接受教師備註。** `a1` 限制二次項係數為 1，內建例子即為 \((x+7)(x-2)\)。a 堂若要嚴守正的常數項，應採現有備註的「等第 2 堂再開」。短時間開放只能當預告，第一題就可能出負常數。這項限制已交代清楚，無須為這批教材更動共用題池。[教師備註](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2a.json:3116>)、[a1 定義](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/shared/game-focus.ts:42>)、[題目生成](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/shared/cross.ts:146>) |

### 當頁 IRS 與 `crossSteps.pre`

逐頁核對題幹、選項、`items[].prompt`、公開規準的 `levels[].description`、正文、條列、附圖、圖說與第 0 步。a～c 出場券的**當頁規準**已改成表現描述。`a-sign`、`b-sign` 的正文教符號規則，當頁 IRS 要學生將規則套用到指定式子，可以作為引導練習。b 的錯誤分析標題仍有明顯提示，另列於下。[a 出場券](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2a.json:3035>)、[b 符號教學頁](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2b.json:1924>)、[c 出場券](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2c.json:3453>)

**`pre` 的兩個實際使用點通過。** 按學生端篩選條件重建後，`d-ex6`、`d-ex7` 第 0 步各只有一個文字圖形，分別顯示 \(2(x^2+2x-8)\) 與 \(-(3x^2-4x+1)\)。各頁 8 個十字圖形都從第 1 步才出現，四個填空的公開 prompt 只有 \(a\) 或 \(b\)，兩張當頁課本圖也只印題目。此結論限於這兩頁，因為共用模板的 `mask` 可讓留空的十字從第 0 步顯示，普通 `caption` 也會保留。若教師開放自由翻頁，下一頁的例 6、例 7 補充圖仍印有前題完整分解，維持上輪已知限制。[例 6](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2d.json:304>)、[例 7](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2d.json:700>)、[模板的遮罩處理](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/scripts/lessons-src/viz.mjs:730>)、[學生端步驟篩選](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:804>)

### 分析題第②步與普通攻擊

改寫②的 9 題，①都成立，②宣稱「交叉相乘也合」才是第一個錯誤。下表是從**現行題目**重算的一次項係數。特別是 a 第三題已換成 \(7,8\)，本輪數值是 \(15\) 與 \(-15\)。

| 分析題組 | 錯誤試排算出的係數 | 原式要求的係數 |
|---|---|---|
| a 三題 | \(9,10,15\) | \(-9,-10,-15\) |
| b 三題 | \(2,3,-3\) | \(-2,-3,3\) |
| c 三題 | \(-2,7,-13\) | \(10,11,7\) |

9 題的改正式都展開回原式，正確選項唯一，詳解與題幹一致。另外 9 題也一致：3 題在③漏掉外部公因數，3 題在①提出負號時變號錯誤，最後 3 題的兩種分解都正確，各有一個成立的理由。**42 道 attack 全部可以一步完成**，其中 18 題做一次帶號加法、18 題用常數項做一次除法、6 題對整式提出負號。[a 分析題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2563>)、[b 分析題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2605>)、[c 分析題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2647>)、[判斷與理由題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2773>)

## 新發現

### Blocker 1．a、b、c 的課程簡介隨學生課堂回應送出，內含出場券得分規則

`sessionView()` 會刪除教師備註、答案、參考解與批改備註，但保留課程層級的 `description`、`objectives`，並將 `lesson` 放入學生回應。這些文字在進入課堂時就已送達，與是否開放自由翻頁無關。本次確認的是**回應欄位**，未觀察到一般學生作答畫面印出課程簡介。[課程清理](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:663>)、[學生遮蔽邏輯](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:828>)、[回應中的 `lesson`](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:890>)

| 堂次 | 學生已收到的文字與評分影響 |
|---|---|
| a | 簡介直接說明相乘與相加的對應，第一項學習目標更直接列出 \(b=p+q,\ c=pq\)。照錄即可取得 `rule` 向度滿分。[課程簡介與目標](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2a.json:5>)、[給分依據](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2a.json:3079>) |
| b | 簡介寫「常數項為負時兩數異號，由一次項的正負判斷哪一個絕對值較大」。這正好涵蓋現行 `graderNotes` 列出的 `rule` 滿分條件。學生仍須自舉例子才能取得另一向度的分數。[課程簡介](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2b.json:5>)、[給分依據](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2b.json:2998>) |
| c | 簡介直接寫「左欄拆二次項係數、右欄拆常數項、交叉相乘的和是一次項」。出場券的 `split`、`check` 兩個向度都能由這一句回答。[課程簡介與目標](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2c.json:5>)、[題幹](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2c.json:3453>)、[給分依據](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2c.json:3497>) |

可直接在教材範圍內處理。例如 c 的簡介可寫成「能安排十字的左右兩欄，並用計算說明試排是否成立」。a、b 同樣保留學習目標，但把要學生自行提取的公式與判準留在教學頁和教師參考解。

### Blocker 2．d 魔王戰 15 道找錯題可憑「答案是」三字全部答對

逐一比對學生收到的選項後，**15/15 題都只有正確選項含「答案是」，而且該選項每次都是四項中最長的一項**。例如 `d-q1-6` 只有一項在指出步驟後接著寫「答案是」及完整分解。學生一旦發現這個規律，之後連題幹和等號都不用讀。這是一般作答畫面就能使用的線索，與上輪已修好的 `topic` 是兩個獨立問題。[實際選項](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2689>)、[產生器的正解句型](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/scripts/quiz-src/g8-3-2-raid.py:218>)、[學生選項顯示](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/raid-ui.ts:734>)

建議四個選項統一寫成「步驟＋理由」，把完整改正式放入詳解。只刪「答案是」三字仍會留下「唯一附完整解法、也總是最長」的線索。

### Should-fix．魔王戰仍有可直接給解的配對

| 先看到的內容 | 後題可直接取得的答案 |
|---|---|
| **d 自評課本圖 → 本輪換數字的 `d-q7-6`** | 已檢視 `summary.png` 實圖，圖上印有 \(x^2+3x+2=(x+1)(x+2)\)。魔王戰問 \(6x^2+18x+12=6(x+1)(x+\square)\)，空格可直接填 **2**。這組碰撞來自圖片內文，最容易被文字掃描漏掉。[d 自評附圖位置](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2d.json:1554>)、[實際附圖](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/public/lesson-assets/g8-3-2/summary.png>)、[魔王戰題幹](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2433>) |
| **attack `a-q1-3` ↔ shield `a-q7-5`** | attack 題幹給 \((x+3)(x+9)\) 與常數項 27，shield 題幹給 \(x^2+12x+27\)。兩題互補，一邊可讀出右欄 **3、9**，另一邊可讀出一次項係數 **12**。兩者都不必先看詳解。[attack](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:35>)、[shield](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:1272>) |
| **a 半完成例題第 0 步 → attack `a-q1-6`** | 圖上第一組已寫 \(x+8x=9x\)。它對當頁的目標式「不合」，但 **9** 正好是魔王戰問 \((x+1)(x+8)\) 展開後的一次項係數。[第 0 步](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2a.json:1789>)、[attack](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:308>) |

這些例子足以排除「剩下的都只是分析題中的錯誤寫法」這項判斷。依前輪尺度，魔王戰逐題抽取、影響取決於遇題順序，列 **should-fix**。優先換魔王戰新增變式，即可保留課本圖與原課堂例題。[製作者處理紀錄](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/REVIEW-2026-11-24-g8-3-2.md:152>)

### Should-fix．`d-q5-4` 換數字後，兩個錯誤選項彼此等價

原始選項第 2 項 \((2x-22)(x+3)\) 與第 4 項 \(2(x+3)(x-11)\) 都等於 \(2x^2-16x-66\)。正解仍只有第 1 項；問題在於四選一實際只提供三種不同的數學結果。換掉其中一個干擾項即可。[四個選項](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:1535>)

### Should-fix．b 的兩處學生文字仍可收緊

- `b-exit` 的參考解已接受 \(b=0\)，但公開條列仍問「一次項是正的還是負的？」「哪一個數的絕對值要比較大？」兩句都預設有一方較大。可合併為「一次項係數和兩數的絕對值大小有什麼關係？」這樣既容納相等，也保留學生自行說明的空間。[公開條列](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2b.json:2952>)
- `b-error` 標題「小華的正負號放反了嗎？」已把診斷方向縮到正確錯因。學生仍須算出 \(+2x\)、更正並說明，因此列為提示過強。改成「小華的分解成立嗎？」即可保留原題與評分規準。[學生標題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2b.json:2784>)、[教師給分依據](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2b.json:2937>)

### Note．魔王戰同池也有近乎重出的題目

`b-q4-2` 與 `b-q4-6` 只把右欄 \(-4,+9\) 上下交換。左欄都是 \(x,x\)，所以兩題做的是同一次加法，答案都是 **5**。現有腳本的魔王戰統計只計跨池，這組同池重題不在該數字內。[第一題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:139>)、[第二題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:425>)

## 實際執行的檢查與限制

- **教材與學生資料。** 以唯讀方式檢查四堂共 **50 張主教材頁、4 張額外暖身、29 張實際 PNG**，核對第 0 步、滑桿初值、題目、選項、小題 prompt、規準等級及圖文。另比對四堂來源與現有 `catalog.generated.json` 的簡介、目標、頁面及 PK 題位，並確認魔王戰來源與 `raids.generated.json` 的整份題庫相同。
- **數學核算。** 以指定 Python 加 `-B -X utf8` 實跑唯讀課堂檢查，結果為官方答案 **45 式**、填空 **49 格**、式子選項 **5 題**，**0 筆不一致**。另從成品 JSON 以 SymPy 逐選項重算 **42 attack、77 shield、77 ultimate**，196 題均恰有一個正解。其中四堂 PK 的 **120 題**已逐題比對魔王戰副本；另核對 **18 道分析題**及 3 道第二層理由。
- **互給答案。** 實跑 `g8-3-2-dupcheck.py` 得「互給答案的組合：**0 組**」，另列魔王戰有 **18 個二次式跨池**。前者涵蓋腳本辨識到的同卷、跨堂 PK 與同堂教材對 PK 碰撞；魔王戰只計數，圖片內文也未列入文字比對。上述具體配對已另以題幹、圖形或 PNG 核實。[檢查範圍與判定程式](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/scripts/quiz-src/g8-3-2-dupcheck.py:64>)
- **驗證界線。** 全程唯讀，未修改檔案，未執行產生器、`npm run lessons`、`npm run check` 或 E2E。學生可見性的結論來自目前成品、Worker 回應及前端顯示路徑的靜態核對。本輪未另開獨立學生瀏覽器、未實測 AI 批改，亦未重新核對原始教用版 PDF。
