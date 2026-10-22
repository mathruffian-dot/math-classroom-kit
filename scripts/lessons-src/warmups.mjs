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
};

// 核對：哪一個不一樣的數值理由
assert.equal(-Math.sqrt(9), -3);
assert.equal(Math.sqrt(1 / 4), 0.5);
assert(Math.abs(Math.sqrt(8) - 2 * r2) < 1e-12 && Math.abs(Math.sqrt(18) - 3 * r2) < 1e-12 && Math.abs(Math.sqrt(50) - 5 * r2) < 1e-12);
assert(Math.abs(Math.sqrt(12) - 2 * r3) < 1e-12 && Math.sqrt(50) > 5 && Math.sqrt(18) < 5);
assert(3 ** 2 + 4 ** 2 === 5 ** 2 && 6 ** 2 + 8 ** 2 === 10 ** 2 && 5 ** 2 + 12 ** 2 === 13 ** 2 && 4 ** 2 + 5 ** 2 !== 6 ** 2);
assert(Math.abs(29.7 / 21 - 21 / 14.85) < 0.01);

await mkdir(join(root, 'content/warmups'), { recursive: true });
for (const [id, slide] of Object.entries(warmups)) {
  await writeFile(join(root, 'content/warmups', `${id}.json`), JSON.stringify({ slides: [slide] }, null, 2) + '\n');
  console.log(`✓ content/warmups/${id}.json（${slide.eyebrow}）`);
}
