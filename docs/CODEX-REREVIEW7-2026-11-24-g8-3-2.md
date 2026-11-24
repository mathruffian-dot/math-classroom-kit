# Codex 第 7 次複審：八上 3-2（2026-11-24）

- 模型 gpt-6.2-astra、high、唯讀；任務：`docs/codex-rereview7-g8-3-2-task.txt`。**四堂皆 no blocker。** 處理見 `docs/REVIEW-2026-11-24-g8-3-2.md`「第 7 次複審意見與處理」。

| 課堂 | 第 7 次複審 verdict | 判定依據 |
|---|---|---|
| g8-3-2a | **no blocker** | 出場券保留學生自行說明規則的空間。上輪點名的兩道 a 類魔王戰新增題均已換數字。 |
| g8-3-2b | **no blocker** | 公開規準未列出待答的正負與大小規則。先前兩組跨題給答也未復發。 |
| g8-3-2c | **no blocker** | 課堂操作頁已無法直接回答改寫後的 `c-q10-4`。另有一道 c 堂課後題的正解會出現在魔王戰分析題詳解，列為 should-fix。 |
| g8-3-2d | **no blocker** | 15 道找錯題均須看題幹才能確定答案，第②步、首錯位置與詳解一致。額外暖身及兩個 `crossSteps.pre` 使用點通過。 |

**第 6 次的 1 項 blocker 與 2 項 should-fix 均已解決。** 本輪仍查到一項影響評量獨立性的 should-fix：部分魔王戰分析題的作答回饋，會明寫另一道一般題的正解。

## 第 6 次複審各項狀態

| 上輪項目 | 第 7 次查證結果 |
|---|---|
| **Blocker．可從「都對」選項的理由反推正解** | **已解決。** 15 題的選項只保留「第幾步開始錯」與「都對」，理由移入詳解。12 道三步題有 24 種選項排列，3 道兩步題有 6 種。遮住題幹後，前者每一種排列都能對應到 **4 種不同正解**，後者每一種都能對應到 **3 種不同正解**。舊的文字線索已消失，實際抽題也會洗牌。15 題首錯分布為① 4 題、② 5 題、③ 4 題、全對 2 題。[選項模板](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/scripts/quiz-src/g8-3-2-raid.py:209>)、[目前題庫](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2563>)、[出題洗牌](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/raid.ts:83>) |
| **Should-fix．三道魔王戰新增題可從課堂直接取得答案** | **點名的三組均已解決。** `a-q6-5` 現在算 \(-3+(-13)=-16\)，已與 b 堂的 \(-3+(-8)=-11\) 分開。`a-q7-6` 現在問 \(x^2-17x+30\)，右欄是 \(-2,-15\)。`c-q10-4` 現在問 \(6x^2+5x-4=(3x+4)(2x-1)\) 的因式，正解為 \(3x+4\)。三題均逐選項核對，只有一個正解。[交叉和題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:334>)、[右欄題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:1285>)、[因式題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:1441>) |
| **Should-fix．d 暖身提示卡給出 \(100^2\)** | **已解決。** 公開條列只剩「這是哪一個乘法公式？」和「先寫成比較好算的樣子，再代入」。學生仍須自己辨認 \(x^2+2x+1=(x+1)^2\)。\(100^2=10000\) 出現在公布後解析。[d 暖身原檔](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/warmups/g8-3-2d.json:10>)、[公布前欄位過濾](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:850>) |

上輪一併追蹤的兩項舊修正也仍成立。a 堂簡介使用「二次式各項係數」。b 類 `q4-6` 與 `q1-1` 分別對應 \(x^2+6x-55\)、\(x^2+4x-45\)；`q4-1` 與 `q2-4` 分別對應 \(x^2-4x-45\)、\(x^2-7x-44\)。[a 堂簡介](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2a.json:5>)、[b 類 attack 數字](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/scripts/quiz-src/g8-3-2-raid.py:74>)、[b 類新增分解題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/scripts/quiz-src/g8-3-2-raid.py:150>)

## 本輪發現與分級

### Should-fix．分析題詳解會直接給出其他題的答案

查重程式實跑得到「互給答案 0 組」，另列「含分析題的共用二次式 10 個」。程式會略過分析題與一般題之間的阻擋判定，而且比對魔王戰題目時取題幹與正解選項，未取詳解。以下三組都能指出學生實際會讀到哪一個答案。魔王戰作答後會回傳詳解，因此在同一場先遇到分析題、後抽到對應一般題，就可能直接沿用答案。[查重範圍](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/scripts/quiz-src/g8-3-2-dupcheck.py:115>)、[作答後回傳詳解](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/raid.ts:166>)

| 分析題 | 會被直接回答的題目 |
|---|---|
| `c-q9-5` 詳解明寫 \(2x^2+11x+5=(2x+1)(x+5)\)。 | `c-q3-2` 正問這個二次式的因式分解，課後檢核與魔王戰都有這題。[分析題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2661>)、[課後題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/quizzes/g8-3-2c.json:100>) |
| `d-q9-8` 詳解指出，學生寫的 \(-(2x-3)(x+1)\) 實際展開是 \(-2x^2+x+3\)。 | `d-q4-1` 正問 \(-2x^2+x+3\) 的因式分解。分析題中的錯式，連同詳解給出的展開結果，恰好構成這一題的完整正解。[分析題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2744>)、[課後題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/quizzes/g8-3-2d.json:128>) |
| `d-q1-7` 詳解指出 \((x-1)(x+5)\) 展開是 \(x^2+4x-5\)。 | `d-q7-4` 問 \(3x^2+12x-15=3(x+5)(x+\square)\)。對照上一個分解即可填 \(-1\)。[分析題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2703>)、[填空題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2405>) |

這項沿用前輪對跨題給答的 **should-fix** 分級，影響取決於抽題順序。建議保留課後檢核原題，優先更換分析題數字。驗收時應把詳解中數學上成立的「乘積＝展開式」納入比對，包括用來解釋某一步為何錯的等式。

### Note．兩道全對題的問法預設了有錯

`d-q1-8`、`d-q9-9` 的步驟全部成立，選項和詳解也正確，但題幹仍問「哪一步開始錯了？」。改為「這份解法是否正確？若有錯，從哪一步開始？」即可讓學生公平考慮全對。這不影響現有答案的唯一性。[全對的提公因數題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2717>)、[全對的提負號題](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2757>)

### Note．交接檔對逐行驗算的描述可以更精確

交接檔記為「每一行的真假用 SymPy 算出」。實作中有些步驟依構造直接標記 `True` 或 `False`，例如提公因數後漏寫外部係數的分支。本輪另外從目前 JSON 的題幹算式核對，15 題的逐行判定、首錯位置與改正式均成立。這是驗證方式的紀錄差異，沒有造成目前題目的數學錯誤。[交接紀錄](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/docs/REVIEW-2026-11-24-g8-3-2.md:194>)、[直接標記的分支](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/scripts/quiz-src/g8-3-2-raid.py:281>)

## 學生公布前可見內容與對戰範圍

- **同頁 IRS。** 核對四堂的題幹、選項、`items[].prompt`、正文、條列、附圖、公開規準與第 0 步，未發現同頁直接列出待填答案或要求學生自行說明的完整規則。a、b 的符號教學頁先明教規則，再以不同式子要求套用；a、b、c 的出場券與四堂錯誤分析頁，則保留了學生自行解釋的部分。Worker 會移除教師備註、答案、解析、規準參考解與批改備註，小題只保留 `prompt`。[學生資料過濾](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:893>)、[a 出場券](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2a.json:3020>)、[b 出場券](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2b.json:2943>)、[c 出場券](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2c.json:3438>)
- **`crossSteps.pre` 兩處均通過。** `d-ex6` 第 0 步只有 \(2x^2+4x-16=2(x^2+2x-8)\)，`d-ex7` 只有 \(-3x^2+4x-1=-(3x^2-4x+1)\)。兩頁的小題都只標 \(a\)、\(b\)，同頁課本圖只印題目。各頁 8 個十字圖形都從第 1 步開始，最終分解在第 2 步。平台公布前只送第 0 步。本判定適用於這兩個使用點；共用模板的 `mask` 分支仍可讓半完成圖從第 0 步出現。[例 6](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2d.json:123>)、[例 7](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2d.json:519>)、[模板](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/scripts/lessons-src/viz.mjs:729>)、[步驟過濾](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/worker/app.ts:865>)
- **自由翻頁的限制仍在。** 例如 c 暖身要學生填 \((x+5)(3x+1)\) 的一次項係數，後面的 `c-intro` 正文和課本圖會給出 \(16\)。教師若要將這題當成獨立提取練習，應維持跟隨教師翻頁。[c 暖身](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2c.json:15>)、[後頁解說](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2c.json:937>)、[前端頁碼判定](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/src/main.ts:1094>)
- **首輪第 3 項後半，在教材範圍內接受教師備註。** `a1` 只限定二次項係數為 1，共用題池可抽到異號常數，內建示例就是 \((x+7)(x-2)\)。a 堂備註已指出負常數項屬下一堂，並提供「等第 2 堂再開」的可行做法。若第一堂必須只評量正的常數項，應採延後開戰；縮短對戰時間仍可能在第一題抽到負常數項。[教師備註](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/lessons/g8-3-2a.json:3116>)、[`a1` 定義](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/shared/game-focus.ts:42>)、[抽題邏輯](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/shared/cross.ts:146>)

## 實際執行的檢查與限制

| 檢查 | 本輪結果 |
|---|---|
| 教材與產物 | 讀取 **50 張主教材頁、4 張額外暖身頁**，在記憶體內檢視 **29 張相異 PNG**。四堂主教材、暖身及課後題位與 `catalog.generated.json` 對應內容一致，魔王戰與 `raids.generated.json` 一致。 |
| 課堂數學 | 以指定 Python 執行唯讀 `g8-3-2-check.py`，官方答案 **45 式**、課程填空 **49 格**、式子選項 **5 題**，共 **0 筆不一致**。 |
| 課後檢核與魔王戰一般題 | 從目前 JSON 獨立驗算 **42 attack、77 shield、77 ultimate，共 196 題**，逐題檢查所有選項，均恰有一個正解且符合答案鍵。四堂課後檢核各 30 題，共 **120 題**，題幹、選項、答案與詳解均與魔王戰副本一致。 |
| 分析題第②步 | 9 道十字試排題中，a、b、c 各有一題首錯在②，實算交叉和依序為 \(9x、2x、-2x\)，題幹卻寫成 \(-9x、-2x、10x\)。其餘 6 題的②就該行所列十字計算均成立。15 道找錯題的首錯與詳解一致。另 3 道「判斷＋理由」的兩種寫法均展開回原式，判斷與理由各有唯一正解。[分析題起點](<C:/Users/User/我的雲端硬碟/2026數學課/math-classroom-kit/content/raids/g8-3-2d.json:2563>) |
| attack 步數 | **42 題均可一步完成**：18 題做一次帶符號加法，18 題用常數項做一次除法，6 題提出負號、整體變號。 |
| 互給答案 | 實跑唯讀 `g8-3-2-dupcheck.py`，內建判定 **0 組**，另報含分析題的共用二次式 **10 個**。另行比對作答後詳解，確認上列三組可直接給答。 |

全程唯讀，未修改檔案，未執行產生器、`npm run lessons`、`npm run check` 或 E2E。本輪學生可見性的判定依據為目前教材產物、實際圖片、Worker 過濾與前端程式；未另開獨立學生瀏覽器，也未重新比對原始教用版 PDF。
