// 暖身例行活動：每堂課第一頁（課堂一開始的 2–3 分鐘）。
// 兩種輪流：「哪一個不一樣？」（Which One Doesn't Belong，四張卡片每一張都有理由，沒有標準答案）
// 與「估一估」（不用計算機估到小數點後一位，容許誤差內都算對）。只用這一堂以前教過的內容。
// 執行：node scripts/lessons-src/warmups.mjs → content/warmups/<課程 id>.json，npm run lessons 會插在課程最前面。
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const S = String.raw;

/** 哪一個不一樣：選項＝四張卡片（單選、沒有正解），解析寫出每一張的理由。 */
function wodb({ options, reasons, body, source }) {
  assert.equal(options.length, 4);
  assert.equal(reasons.length, 4);
  return {
    id: 'warmup',
    phase: '暖身',
    eyebrow: '暖身 / 哪一個不一樣？',
    title: '哪一個不一樣？',
    body: body || '選一張和其他三張不一樣的卡片，想好理由。每一張都可能是答案！',
    visual: 'cards',
    activity: {
      id: 'warmup-wodb',
      type: 'single',
      prompt: '你選哪一張？準備說出你的理由。',
      options,
      explanation: `每一張都可以是答案：${reasons.map((r, i) => `${String.fromCharCode(65 + i)} ${r}`).join('；')}。`,
    },
    notes: `沒有標準答案。公布結果後，每個選項各抽一位同學說理由；最少人選的那一張先講。\n${reasons.map((r, i) => `${String.fromCharCode(65 + i)}：${r}`).join('\n')}`,
    source,
  };
}
/** 估一估：數值題＋容許誤差；value 是正確值（核對答案與容許範圍用）。 */
function estimate({ title, body, prompt, answer, value, tolerance, steps, explanation, accept, reject, source }) {
  for (const x of accept) assert(Math.abs(x - value) <= tolerance, `${x} 應該算對`);
  for (const x of reject) assert(Math.abs(x - value) > tolerance, `${x} 應該算錯`);
  return {
    id: 'warmup',
    phase: '暖身',
    eyebrow: '暖身 / 估一估',
    title,
    body,
    visual: 'steps',
    bullets: steps,
    activity: { id: 'warmup-est', type: 'numeric', prompt, answer, tolerance, explanation },
    notes: `容許誤差 ±${tolerance}：${accept.join('、')} 都算對。先看全班答案的分布，再請估得最近、最遠的同學說怎麼想。`,
    source,
  };
}

const r2 = Math.SQRT2,
  r3 = Math.sqrt(3);
const warmups = {
  // 2-2(1)：先備是 2-1 平方根
  'g8-2-2a': wodb({
    options: [S`$-\sqrt{9}$`, '$5$', S`$\sqrt{7}$`, S`$\sqrt{\frac{1}{4}}$`],
    reasons: [
      S`是唯一的負數（$-\sqrt{9}=-3$）`,
      '是唯一沒有根號的',
      S`是唯一不是整數、也不是分數的（$\sqrt{7}\approx2.65$，小數一直寫不完）`,
      S`是唯一的值不是整數、但能寫成分數的（$\sqrt{\frac{1}{4}}=\frac{1}{2}$）`,
    ],
    source: '暖身：哪一個不一樣（複習 2-1 平方根）',
  }),
  // 2-2(2)：先備是 2-2(1) 根式的乘除
  'g8-2-2b': estimate({
    title: S`估一估：$2\sqrt{3}$ 大約是多少？`,
    body: '不用計算機，寫到小數點後一位。',
    prompt: S`$2\sqrt{3}\approx$？（寫到小數點後一位）`,
    answer: '2√3',
    value: 2 * r3,
    tolerance: 0.1,
    steps: [S`$\sqrt{3}$ 在哪兩個整數之間？`, S`$\sqrt{3}$ 大約是多少？`, '再乘以 2'],
    explanation: S`$\sqrt{3}\approx1.73$，所以 $2\sqrt{3}\approx3.46$，寫 3.5、3.4 都可以。也可以想成 $2\sqrt{3}=\sqrt{12}$，在 $\sqrt{9}=3$ 和 $\sqrt{16}=4$ 之間。`,
    accept: [3.4, 3.5, 3.46],
    reject: [3.3, 3.6, 2.4],
    source: '暖身：估一估（複習 2-2(1) 根式的乘法）',
  }),
  // 2-2(3)：先備是 2-2(1)(2)（最簡根式）
  'g8-2-2c': wodb({
    options: [S`$\sqrt{8}$`, S`$\sqrt{18}$`, S`$\sqrt{12}$`, S`$\sqrt{50}$`],
    reasons: [
      '是唯一被開方數是個位數的',
      S`化成最簡根式是 $3\sqrt{2}$，是唯一係數是 3 的`,
      S`化成最簡根式是 $2\sqrt{3}$，是唯一不是 $\sqrt{2}$ 的倍數的（另外三個都能化成「幾 $\sqrt{2}$」）`,
      S`是唯一大於 5 的（$\sqrt{50}\approx7.07$）`,
    ],
    source: '暖身：哪一個不一樣（複習 2-2(2) 最簡根式）',
  }),
  // 2-2(4)：先備是 2-2(1)～(3) 與第 1 章乘法公式
  'g8-2-2d': estimate({
    title: S`估一估：$(\sqrt{3}+1)^2$ 大約是多少？`,
    body: '不用計算機，寫到小數點後一位。',
    prompt: S`$(\sqrt{3}+1)^2\approx$？（寫到小數點後一位）`,
    answer: '4+2√3',
    value: (r3 + 1) ** 2,
    tolerance: 0.1,
    steps: [S`$\sqrt{3}+1$ 大約是多少？`, '把它平方（或用和的平方公式展開）', '寫到小數點後一位'],
    explanation: S`$\sqrt{3}+1\approx2.73$，$2.73^2\approx7.45$。用和的平方公式：$(\sqrt{3}+1)^2=3+2\sqrt{3}+1=4+2\sqrt{3}\approx7.46$。寫 7.5、7.4 都可以。`,
    accept: [7.4, 7.5, 7.46],
    reject: [7.3, 7.6, 4],
    source: '暖身：估一估（預告 2-2(4) 乘法公式與根式）',
  }),
  // 1-4(1)：先備是 1-1～1-3 比例線段、相似形
  'g9-1-4a': wodb({
    options: ['$2:3$', '$4:6$', '$6:9$', '$3:2$'],
    reasons: ['是唯一前項是 2 的', '是唯一前、後項都是偶數的', '是唯一前、後項都是 3 的倍數的', S`是唯一比值不是 $\frac{2}{3}$ 的（比值是 $\frac{3}{2}$）`],
    source: '暖身：哪一個不一樣（複習比例）',
  }),
  'g9-1-4b': wodb({
    options: ['三邊 3、4、5', '三邊 6、8、10', '三邊 5、12、13', '三邊 4、5、6'],
    reasons: ['是唯一三邊都小於 6 的', '是唯一三邊都是偶數的', '是唯一有一邊大於 10 的', S`是唯一不是直角三角形的（$4^2+5^2\neq6^2$）。另外，A 和 B 相似（三邊成比例 $1:2$）`],
    source: '暖身：哪一個不一樣（複習相似三角形、畢氏定理）',
  }),
  'g9-1-4c': estimate({
    title: '估一估：A4 紙對摺後，長是寬的幾倍？',
    body: 'A4 紙長 29.7 cm、寬 21 cm，對摺後是 A5（長 21 cm、寬 14.85 cm）。',
    prompt: 'A5 的長 ÷ 寬 ≈？（寫到小數點後一位）',
    answer: '1.414',
    value: 21 / 14.85,
    tolerance: 0.05,
    steps: ['A5 的長 ÷ 寬，估到小數點後一位', 'A4 的長 ÷ 寬又是多少？', '兩個比一比，發現什麼？'],
    explanation: S`$21\div14.85\approx1.41$，A4 的 $29.7\div21\approx1.41$ 也一樣：A4 和 A5 是相似的長方形！所以影印機把 A4 縮成 A5，圖不會變形。`,
    accept: [1.4, 1.41, 1.42],
    reject: [1.3, 1.5, 0.7],
    source: '暖身：估一估（生活中的相似形）',
  }),
  // 8 上 2-3(1)：先備是 2-1 平方根、2-2 根式
  'g8-2-3a': wodb({
    options: [S`$\sqrt{9}$`, S`$\sqrt{16}$`, S`$\sqrt{25}$`, S`$\sqrt{20}$`],
    reasons: ['是唯一小於 4 的（等於 3）', '是唯一的偶數（等於 4）', S`是唯一大於 4.5 的（等於 5）`, S`是唯一不是整數的（$\sqrt{20} = 2\sqrt{5} \approx 4.47$）`],
    source: '暖身：哪一個不一樣（複習平方根；3、4、5 等一下還會出現）',
  }),
  // 8 上 2-3(2)：先備是 2-3(1) 畢氏定理
  'g8-2-3b': estimate({
    title: '估一估：32 吋電視有多高？',
    body: '電視的「吋」是對角線的長。一台 32 吋電視，寬大約 28 吋。',
    prompt: '這台電視的高大約幾吋？（寫到小數點後一位）',
    answer: '√240',
    value: Math.sqrt(240),
    tolerance: 0.2,
    steps: ['寬、高、對角線圍成什麼三角形？', S`用畢氏定理：高$^2 = 32^2 - 28^2$`, S`估 $\sqrt{240}$ 在哪兩個整數之間`],
    explanation: S`高$^2 = 32^2 - 28^2 = 1024 - 784 = 240$，高 $= \sqrt{240} \approx 15.5$ 吋（$15^2 = 225$、$16^2 = 256$）。`,
    accept: [15.4, 15.5, 15.49],
    reject: [15, 16, 4],
    source: '暖身：估一估（畢氏定理的生活應用）',
  }),
  // 8 上 2-3(3)：先備是 2-3(1)(2)、七年級坐標平面
  'g8-2-3c': wodb({
    body: '四張卡片是坐標平面上的四條線段（寫出兩個端點）。選一張和其他三張不一樣的，想好理由。',
    options: ['$A(0,0)$、$B(3,4)$', '$C(1,1)$、$D(1,6)$', '$E(2,3)$、$F(7,3)$', '$G(-1,2)$、$H(2,6)$'],
    reasons: ['是唯一從原點出發的', S`是唯一鉛垂的線段（$x$ 坐標一樣）`, S`是唯一水平的線段（$y$ 坐標一樣）`, '是唯一有負數坐標的。而且四條線段其實一樣長，都是 5！斜的那兩條怎麼算？就是今天的主題'],
    source: '暖身：哪一個不一樣（坐標平面上的線段，預告兩點距離）',
  }),
  // 9 上 2-1(1)：先備是圓周長、圓面積（小學、七年級）
  'g9-2-1a': estimate({
    title: '估一估：披薩一片有多大？',
    body: '半徑 15 cm 的圓形披薩，平分成 6 片。π 可以用 3 或 3.14 估。',
    prompt: '一片的面積大約幾平方公分？',
    answer: '117.75',
    value: (15 * 15 * 3.14) / 6,
    tolerance: 6,
    steps: ['整個披薩的面積大約多少？', '平分成 6 片，一片是整個的幾分之幾？', '再算一片的面積'],
    explanation: S`整個披薩 $\pi \times 15^2 \approx 3.14 \times 225 = 706.5$，一片是 $\frac{1}{6}$，大約 $117.75$ 平方公分（π 用 3 估是 $112.5$，也很接近）。這就是今天要學的「扇形面積」。`,
    accept: [112.5, 117.75, 118, 120],
    reject: [100, 125, 706.5],
    source: '暖身：估一估（預告扇形面積）',
  }),
  // 9 上 2-1(2)：先備是 2-1(1) 與比大小、根式估算
  'g9-2-1b': wodb({
    body: '圓 O 的半徑是 5。四張卡片是四個點到圓心 O 的距離，選一張和其他三張不一樣的，想好理由。',
    options: ['$OA=3$', '$OB=5$', S`$OC=\sqrt{34}$`, '$OD=8$'],
    reasons: ['是唯一比半徑短的（A 在圓的裡面）', '是唯一剛好等於半徑的（B 在圓上）', S`是唯一不是整數的（$\sqrt{34} \approx 5.83$）`, '是唯一大於 6 的'],
    source: '暖身：哪一個不一樣（點到圓心的距離和半徑比一比）',
  }),
  // 9 上 2-1(3)：先備是 2-1(2) 切線垂直於半徑、畢氏定理
  'g9-2-1c': estimate({
    title: '估一估：切線段有多長？',
    body: '圓 O 的半徑是 4，圓外一點 P 到圓心的距離 OP ＝ 10。從 P 畫一條切線，切點是 A。',
    prompt: S`切線段 $\overline{PA}$ 大約多長？（寫到小數點後一位）`,
    answer: '√84',
    value: Math.sqrt(84),
    tolerance: 0.15,
    steps: [S`切線和半徑 $\overline{OA}$ 有什麼關係？`, S`用畢氏定理算 $\overline{PA}^2$`, S`估 $\sqrt{84}$ 在哪兩個整數之間`],
    explanation: S`切線垂直於過切點的半徑，所以 $\triangle OAP$ 是直角三角形：$\overline{PA}^2 = 10^2 - 4^2 = 84$，$\overline{PA} = \sqrt{84} = 2\sqrt{21} \approx 9.2$（$9^2 = 81$、$9.2^2 = 84.64$）。`,
    accept: [9.1, 9.2, 9.17],
    reject: [9, 9.4, 6],
    source: '暖身：估一估（複習切線與畢氏定理）',
  }),
  // 8 上 3-1(1)：先備是七年級因數與倍數
  'g8-3-1a': wodb({
    body: '四張卡片和 42 這個數有關。選一張和其他三張不一樣的，想好理由。',
    options: ['$2$', '$3$', '$5$', '$7$'],
    reasons: ['是唯一的偶數', '是唯一 3 的倍數', S`是唯一不是 42 的因數的（$42 = 2 \times 3 \times 7$）`, '是唯一大於 5 的'],
    source: '暖身（自編）：哪一個不一樣（複習因數，等一下換成多項式的因式）',
  }),
  // 8 上 3-1(2)：先備是分配律、3-1(1)
  'g8-3-1b': estimate({
    title: '估一估：不用直式算得出來嗎？',
    body: '不用計算機、不列直式，看看兩項有什麼一樣的地方。',
    prompt: S`$37 \times 12 + 37 \times 8$ 大約是多少？`,
    answer: '740',
    value: 740,
    tolerance: 40,
    steps: ['兩項都有哪一個數？', '另外兩個數加起來是多少？', '37 × 20 是多少？'],
    explanation: S`兩項都有 $37$：$37 \times 12 + 37 \times 8 = 37 \times (12 + 8) = 37 \times 20 = 740$。這一堂把同樣的想法用在多項式。`,
    accept: [740, 720, 760],
    reject: [600, 900, 444],
    source: '暖身（自編）：估一估（分配律倒過來用，預告提公因式）',
  }),
  // 8 上 3-1(3)：先備是 3-1(1)(2)、去括號
  'g8-3-1c': wodb({
    options: ['$x-3$', '$3-x$', '$-(x-3)$', '$-x+3$'],
    reasons: [S`是唯一和其他三張不相等的（其他三張都等於 $3-x$）`, '是唯一常數寫在最前面的', '是唯一有括號的', '是唯一以負號開頭、又沒有括號的'],
    source: '暖身（自編）：哪一個不一樣（複習去括號，預告變號）',
  }),
  // 8 上 3-1(4)：先備是 1-1 乘法公式、平方
  'g8-3-1d': estimate({
    title: '估一估：兩個平方相減',
    body: '不用計算機。51² 和 49² 都接近 2500，它們差多少？',
    prompt: S`$51^2 - 49^2$ 大約是多少？`,
    answer: '200',
    value: 200,
    tolerance: 20,
    steps: [S`$50^2$ 是多少？`, S`$51^2$ 比 $50^2$ 多大約多少？$49^2$ 少大約多少？`, '兩邊的差合起來'],
    explanation: S`$51^2 = 2601$、$49^2 = 2401$，差 $200$。這一堂會學到更快的算法：$51^2 - 49^2 = (51 + 49)(51 - 49) = 100 \times 2 = 200$。`,
    accept: [200, 190, 210],
    reject: [100, 4, 400],
    source: '暖身（自編）：估一估（兩個平方的差，預告平方差公式）',
  }),
  // 8 上 3-2(1)：先備是 3-1 提公因式與乘法公式
  'g8-3-2a': wodb({
    body: '四張卡片都是二次式。選一張和其他三張不一樣的，想好理由。',
    options: ['$x^2+5x+6$', '$x^2-9$', '$x^2+6x+9$', '$x^2+5x$'],
    reasons: [
      '是唯一不能用 3-1 的提公因式或乘法公式分解的（今天要學新方法）',
      '是唯一常數項是負的',
      S`是唯一的完全平方式（$(x+3)^2$）`,
      S`是唯一沒有常數項的（可以提出 $x$）`,
    ],
    source: '暖身（自編）：哪一個不一樣（複習 3-1 的分解方法，預告十字交乘法）',
  }),
  // 8 上 3-2(2)：先備是 3-2(1)
  'g8-3-2b': estimate({
    title: '估一估：代進去算算看',
    body: '不用計算機。先想 x² 是多少，再看後面兩項大約加減多少。',
    prompt: S`$x=10$ 時，$x^2+3x-10$ 大約是多少？`,
    answer: '120',
    value: 120,
    tolerance: 5,
    steps: [S`$x^2$ 是多少？`, S`再加上 $3x$、減掉 $10$`, '大約是多少？'],
    explanation: S`$100+30-10=120$。今天會學到另一種算法：先把 $x^2+3x-10$ 分解成兩個一次式相乘，再代入。`,
    accept: [120, 118, 125],
    reject: [130, 110, 100],
    source: '暖身（自編）：估一估（代值，預告常數項為負的十字交乘）',
  }),
  // 8 上 3-2(3)：先備是 3-2(1)(2)
  'g8-3-2c': wodb({
    body: '四張卡片都可以用十字交乘法分解。選一張和其他三張不一樣的，想好理由。',
    options: ['$x^2+7x+12$', '$x^2-x-12$', '$x^2+8x+12$', '$2x^2+7x+3$'],
    reasons: [
      S`是唯一有因式 $x+4$ 的（$(x+3)(x+4)$）`,
      '是唯一常數項是負的',
      '是唯一一次項係數是偶數的',
      '是唯一二次項係數不是 1 的（今天的重點）',
    ],
    source: '暖身（自編）：哪一個不一樣（複習 3-2(1)(2)，預告二次項係數不為 1）',
  }),
  // 8 上 3-2(4)：先備是 3-1 乘法公式、3-2(1)～(3)
  'g8-3-2d': estimate({
    title: '估一估：先看出是哪一個公式',
    body: '不用計算機，也不要直接平方 99。先看看這個式子是哪一種形式。',
    prompt: S`$x=99$ 時，$x^2+2x+1$ 大約是多少？`,
    answer: '10000',
    value: 10000,
    tolerance: 50,
    steps: ['這是哪一個乘法公式？', '先寫成比較好算的樣子，再代入'],
    explanation: S`$x^2+2x+1=(x+1)^2$，代入 $x=99$：$100^2=10000$。因式分解可以讓計算變簡單；今天會把提公因數、乘法公式和十字交乘合在一起用。`,
    accept: [10000, 9980, 10020],
    reject: [9800, 10200, 9900],
    source: '暖身（自編）：估一估（完全平方式，銜接例 8 的乘法公式）',
  }),
  // 9 上 2-2(1)：先備是 2-1 圓的名詞
  'g9-2-2a': wodb({
    body: '四張卡片都是 2-1 學過的名詞。選一張和其他三張不一樣的，想好理由。',
    options: ['半徑', '直徑', '弦', '弧'],
    reasons: ['是唯一有一端在圓心的', '是唯一一定是半徑 2 倍長的（圓裡最長的弦）', '是唯一長度不固定、又不一定通過圓心的線段', '是唯一彎的，不是線段'],
    source: '暖身（自編）：哪一個不一樣（複習 2-1 圓的名詞）',
  }),
  // 9 上 2-2(2)：先備是 2-2(1) 弧的度數
  'g9-2-2b': estimate({
    title: '估一估：切一片披薩的角度',
    body: '圓形披薩平分成 7 片。不用量角器，用周角 360° 估。',
    prompt: '一片披薩的圓心角大約幾度？',
    answer: '360/7',
    value: 360 / 7,
    tolerance: 3,
    steps: ['整個圓是幾度？', '平分成 7 片，一片是整個的幾分之幾？', '360 ÷ 7 大約是多少？（7 × 50 ＝ 350）'],
    explanation: S`$360^\circ \div 7 \approx 51.4^\circ$。這也是一片披薩那段弧的度數。今天要看：頂點不在圓心、在圓周上時，角度和弧又是什麼關係？`,
    accept: [50, 51, 51.4, 52, 54],
    reject: [45, 60, 36],
    source: '暖身（自編）：估一估（複習弧的度數，預告圓周角）',
  }),
  // 9 上 2-2(3)：先備是 2-2(1)(2)
  'g9-2-2c': wodb({
    body: '四張卡片都和圓有關。選一張和其他三張不一樣的，想好理由。',
    options: ['50° 的圓周角', '100° 的圓心角', '100° 的弧', '80° 的圓周角'],
    reasons: ['是唯一小於 60° 的', '是唯一頂點在圓心的', '是唯一不是角的', '是唯一對應的弧不是 100° 的（它對的弧是 160°）'],
    source: '暖身（自編）：哪一個不一樣（複習圓周角、圓心角與弧）',
  }),
  // 9 上 2-2(4)：先備是 2-2(1)～(3)
  'g9-2-2d': estimate({
    title: '估一估：對面的那段弧',
    body: 'A、B、C 在圓上，經過 B 的那段弧 ABC 是 260°。先想 ∠ABC 對的是哪一段弧。',
    prompt: '∠ABC 大約幾度？',
    answer: '50',
    value: 50,
    tolerance: 5,
    steps: ['∠ABC 對的是不經過 B 的那段弧', '那段弧是幾度？（整個圓是 360°）', '圓周角是弧的一半'],
    explanation: S`不經過 B 的弧是 $360^\circ - 260^\circ = 100^\circ$，$\angle ABC = 100^\circ \div 2 = 50^\circ$。今天把這個想法用在四邊形。`,
    accept: [50, 48, 52],
    reject: [130, 100, 260],
    source: '暖身（自編）：估一估（複習圓周角所對的弧，預告圓內接四邊形）',
  }),
};

// 核對：哪一個不一樣的數值理由
assert(3 < 5 && Math.sqrt(34) > 5 && Math.sqrt(34) < 6 && 8 > 6);
assert(Math.sqrt(20) > 4.4 && Math.sqrt(20) < 4.5);
const dist = (a, b, c, d) => Math.hypot(c - a, d - b);
assert(dist(0, 0, 3, 4) === 5 && dist(1, 1, 1, 6) === 5 && dist(2, 3, 7, 3) === 5 && dist(-1, 2, 2, 6) === 5);
assert.equal(-Math.sqrt(9), -3);
assert.equal(Math.sqrt(1 / 4), 0.5);
assert(Math.abs(Math.sqrt(8) - 2 * r2) < 1e-12 && Math.abs(Math.sqrt(18) - 3 * r2) < 1e-12 && Math.abs(Math.sqrt(50) - 5 * r2) < 1e-12);
assert(Math.abs(Math.sqrt(12) - 2 * r3) < 1e-12 && Math.sqrt(50) > 5 && Math.sqrt(18) < 5);
assert(3 ** 2 + 4 ** 2 === 5 ** 2 && 6 ** 2 + 8 ** 2 === 10 ** 2 && 5 ** 2 + 12 ** 2 === 13 ** 2 && 4 ** 2 + 5 ** 2 !== 6 ** 2);
assert(Math.abs(29.7 / 21 - 21 / 14.85) < 0.01);
// 3-2 暖身的數值理由
assert.equal(10 * 10 + 3 * 10 - 10, (10 + 5) * (10 - 2));
assert.equal(99 * 99 + 2 * 99 + 1, 100 ** 2);
// 哪一個不一樣（3-2(3)）：一次項係數 7、−1、8、7 中只有 8 是偶數；只有 x²+7x+12＝(x+3)(x+4) 有因式 x+4
assert.deepEqual([7, -1, 8, 7].filter((b) => b % 2 === 0), [8]);

await mkdir(join(root, 'content/warmups'), { recursive: true });
for (const [id, slide] of Object.entries(warmups)) {
  await writeFile(join(root, 'content/warmups', `${id}.json`), JSON.stringify({ slides: [slide] }, null, 2) + '\n');
  console.log(`✓ content/warmups/${id}.json（${slide.eyebrow}）`);
}
