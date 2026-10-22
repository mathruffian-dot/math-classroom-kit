// 根式湊數挑戰（像 24 點）：四張數字卡各用一次，加上 ＋ − × ÷ 和括號，湊出目標數。
// 每一關用窮舉找出所有湊法：確定有解，並把不同的湊法寫進教師備註。只用這一堂（含）以前教過的運算。
// 執行：node scripts/lessons-src/make-puzzles.mjs → content/make/<課程 id>.json，npm run lessons 會插在課後檢核頁前面。
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** 卡片與目標的值：整數、√n、k√n、a+b√n。 */
function value(text) {
  return text
    .split('+')
    .map((part) => {
      const m = /^(\d*)√(\d+)$/.exec(part);
      return m ? (m[1] ? Number(m[1]) : 1) * Math.sqrt(Number(m[2])) : Number(part);
    })
    .reduce((s, x) => s + x, 0);
}
/** 窮舉所有湊法（＋、× 兩邊排序，去掉只是交換順序的寫法）。 */
function solutions(cards, target) {
  const want = value(target),
    out = new Set();
  const walk = (items) => {
    if (items.length === 1) {
      if (Math.abs(items[0].v - want) < 1e-9 * Math.max(1, Math.abs(want))) out.add(items[0].s);
      return;
    }
    for (let i = 0; i < items.length; i++)
      for (let j = 0; j < items.length; j++) {
        if (i === j) continue;
        const a = items[i],
          b = items[j],
          rest = items.filter((_, k) => k !== i && k !== j);
        const [p, q] = [a.s, b.s].sort();
        const next = [
          { v: a.v + b.v, s: `(${p} + ${q})` },
          { v: a.v - b.v, s: `(${a.s} − ${b.s})` },
          { v: a.v * b.v, s: `${p} × ${q}` },
        ];
        if (Math.abs(b.v) > 1e-12) next.push({ v: a.v / b.v, s: `${a.s} ÷ ${b.s}` });
        for (const n of next) walk([...rest, n]);
      }
  };
  walk(cards.map((c) => ({ v: value(c), s: c })));
  return [...out];
}

function puzzle(n, { cards, target, check, solution, idea }) {
  // 寫在解析裡的湊法要真的算得出目標
  assert(Math.abs(check(cards.map(value)) - value(target)) < 1e-9, `${cards} → ${target}`);
  const all = solutions(cards, target);
  assert(all.length > 0, `${cards} 湊不出 ${target}`);
  return {
    id: `make-${n}`,
    phase: '挑戰',
    eyebrow: `根式湊數挑戰 / 第 ${n} 關`,
    title: `根式湊數挑戰：湊出 ${target}`,
    body: '四張數字卡各用一次，加上 ＋ − × ÷ 和括號，湊出目標數。湊到了再送出！',
    activity: {
      id: `make-${n}`,
      type: 'make',
      prompt: `用 ${cards.join('、')} 湊出 ${target}`,
      cards,
      target,
      explanation: `一種湊法：${solution}。${idea}`,
    },
    notes: `窮舉找到 ${all.length} 種寫法（只交換順序的不算），例如：\n${all.slice(0, 6).join('\n')}\n公布結果後看「全班的湊法」，請用不同湊法的同學說明。`,
    source: '根式湊數挑戰（自編，用每張卡一次湊出目標數）',
  };
}

const puzzles = {
  // 2-2(2)：用 2-2(1) 根式的乘除
  'g8-2-2b': [
    puzzle(1, {
      cards: ['√2', '√8', '√3', '√12'],
      target: '6',
      check: (c) => c[0] * c[1] + c[3] / c[2],
      solution: '√2 × √8 + √12 ÷ √3 ＝ 4 ＋ 2 ＝ 6',
      idea: '先找哪兩張相乘、相除會變成整數。',
    }),
    puzzle(2, {
      cards: ['√5', '√20', '√3', '√27'],
      target: '7',
      check: (c) => c[0] * c[1] - c[3] / c[2],
      solution: '√5 × √20 − √27 ÷ √3 ＝ 10 − 3 ＝ 7',
      idea: '√5 × √20 ＝ √100，√27 ÷ √3 ＝ √9。',
    }),
  ],
  // 2-2(3)：加上根式的加減（同類方根）
  'g8-2-2c': [
    puzzle(1, {
      cards: ['√2', '√8', '√18', '2'],
      target: '10√2',
      check: (c) => c[1] + c[3] * (c[0] + c[2]),
      solution: '√8 ＋ 2 × (√2 ＋ √18) ＝ 2√2 ＋ 2 × 4√2 ＝ 10√2',
      idea: '先把 √8、√18 化成最簡根式，變成同類方根就能相加。',
    }),
    puzzle(2, {
      cards: ['√3', '√12', '√27', '3'],
      target: '5√3',
      check: (c) => (c[1] * c[2] - c[3]) / c[0],
      solution: '(√12 × √27 − 3) ÷ √3 ＝ 15 ÷ √3 ＝ 5√3',
      idea: '15 ÷ √3 要分母有理化：15√3 ÷ 3 ＝ 5√3。',
    }),
  ],
  // 2-2(4)：加上乘法公式
  'g8-2-2d': [
    puzzle(1, {
      cards: ['√5', '√2', '√5', '√2'],
      target: '3',
      check: (c) => (c[0] + c[1]) * (c[2] - c[3]),
      solution: '(√5 ＋ √2) × (√5 − √2) ＝ 5 − 2 ＝ 3（平方差公式）',
      idea: '也可以 √5 × √5 − √2 × √2 ＝ 3，兩種湊法比一比。',
    }),
    puzzle(2, {
      cards: ['√2', '√3', '√2', '√3'],
      target: '5+2√6',
      check: (c) => (c[0] + c[1]) * (c[2] + c[3]),
      solution: '(√2 ＋ √3) × (√2 ＋ √3) ＝ 2 ＋ 2√6 ＋ 3 ＝ 5 ＋ 2√6（和的平方公式）',
      idea: '還有一種：(√2 ＋ √3) ÷ (√3 − √2)，分母有理化後也是 5 ＋ 2√6。',
    }),
  ],
};

await mkdir(join(root, 'content/make'), { recursive: true });
for (const [id, slides] of Object.entries(puzzles)) {
  await writeFile(join(root, 'content/make', `${id}.json`), JSON.stringify({ slides }, null, 2) + '\n');
  console.log(`✓ content/make/${id}.json：${slides.map((s) => `${s.activity.cards.join(' ')} → ${s.activity.target}（${s.notes.match(/找到 (\d+)/)[1]} 種）`).join('；')}`);
}
