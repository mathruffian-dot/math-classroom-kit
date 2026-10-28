// 根式步驟格鬥 2-2 題庫：每一題是一串運算步驟（每一步：規則＋填好的下一行算式＋數字卡）。
// 每一題的每一行都算數值核對（和原式相等），每一種接受的填法也核對。數字卡放進常見錯誤的數字。
// 範圍：每一堂只用這一堂（含之前）教過的規則——(1) 乘除、(2) 最簡根式與分母有理化、(3) 加減與分配律、(4) 乘法公式。
// 執行：node scripts/lessons-src/duel-g8-2-2.mjs → content/duels/g8-2-2a～d.json，npm run lessons 併成伺服器題庫並加一頁「步驟格鬥」。
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const B = (b) => ({ b });
const R = (...r) => ({ r });
const F = (num, den) => ({ f: [num, den] });
const s = (n) => String(n);

/** 算式樹 → 數值（只在出題時用）。 */
function value(toks) {
  const parts = [];
  const push = (p) => {
    const prev = parts[parts.length - 1];
    if (prev !== undefined && /[\d)]$/.test(prev) && /^(\d|\(|Math)/.test(p)) parts.push('*');
    parts.push(p);
  };
  for (const t of toks) {
    if (typeof t === 'string') {
      const x = t.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/²/g, '**2');
      for (const piece of x.match(/\d+|\*\*2|[-+*/()]/g) || []) push(piece);
    } else if ('b' in t) throw new Error('還有空格');
    else if ('r' in t) push(`Math.sqrt(${value(t.r)})`);
    else push(`((${value(t.f[0])})/(${value(t.f[1])}))`);
  }
  const src = parts.join('');
  return Function(`return (${src})`)();
}
const fillLine = (line, vals) =>
  line.map((t) => (typeof t === 'string' ? t : 'b' in t ? vals[t.b] : 'r' in t ? { r: fillLine(t.r, vals) } : { f: [fillLine(t.f[0], vals), fillLine(t.f[1], vals)] }));
const blanks = (line) => {
  let n = 0;
  const walk = (l) => l.forEach((t) => (typeof t === 'string' ? 0 : 'b' in t ? (n = Math.max(n, t.b + 1)) : 'r' in t ? walk(t.r) : (walk(t.f[0]), walk(t.f[1]))));
  walk(line);
  return n;
};
const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** 一步：規則、下一行（含空格）、接受的填法、干擾數字。 */
const step = (rule, line, fill, extra = []) => ({ rule, line, fill: fill.map((f) => f.map(s)), extra: extra.map(s) });
function problem(id, family, lesson, start, steps) {
  const v0 = value(start);
  for (const st of steps) {
    const n = blanks(st.line);
    for (const f of st.fill) {
      assert.equal(f.length, n, `${id} ${st.rule}：空格數不對`);
      assert(near(value(fillLine(st.line, f)), v0), `${id} ${st.rule}：${f.join(',')} 算出來不等於原式`);
    }
  }
  return {
    id,
    family,
    lesson,
    start,
    steps: steps.map((st) => {
      const answers = [...new Set(st.fill.flat())];
      // 數字卡：正確的數字＋常見錯誤的數字（不和正確的重複），最多 8 張
      const tiles = [...answers, ...st.extra.filter((x) => !answers.includes(x) && Number.isInteger(Number(x)) && Number(x) > 0)].filter((x, i, a) => a.indexOf(x) === i).slice(0, 8);
      return { rule: st.rule, line: st.line, fill: st.fill, tiles };
    }),
  };
}
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const squareFree = (n) => {
  for (let k = 2; k * k <= n; k++) if (n % (k * k) === 0) return false;
  return true;
};
/** n ＝ k²m（k 最大）。 */
function split(n) {
  let k = 1;
  for (let i = 2; i * i <= n; i++) if (n % (i * i) === 0) k = i;
  return [k, n / (k * k)];
}

const P = [];
// ───────── 2-2(1) 根式的乘除 ─────────
for (const [a, b] of [[2, 8], [3, 12], [2, 18], [5, 20], [3, 27], [2, 32]]) {
  const k = Math.sqrt(a * b);
  P.push(problem(`mul-sq-${a}-${b}`, '√a × √b（乘起來是完全平方數）', 'a', [R(s(a)), '×', R(s(b))], [
    step('mul', [R(B(0), '×', B(1))], [[a, b], [b, a]], [a + b, a * b, b - a]),
    step('calc', [R(B(0))], [[a * b]], [a + b, k, 2 * a * b]),
    step('sqrt', [B(0)], [[k]], [a * b, k * k * 2, a + b, k + 1]),
  ]));
}
for (const [a, b] of [[2, 3], [2, 5], [3, 5], [2, 7], [3, 7], [5, 7]]) {
  P.push(problem(`mul-${a}-${b}`, '√a × √b', 'a', [R(s(a)), '×', R(s(b))], [
    step('mul', [R(B(0), '×', B(1))], [[a, b], [b, a]], [a + b, a * b]),
    step('calc', [R(B(0))], [[a * b]], [a + b, a * a, b * b]),
  ]));
}
for (const [a, b] of [[48, 3], [50, 2], [72, 2], [45, 5], [63, 7], [98, 2]]) {
  const q = a / b,
    k = Math.sqrt(q);
  P.push(problem(`div-${a}-${b}`, '√a ÷ √b', 'a', [R(s(a)), '÷', R(s(b))], [
    step('div', [R(B(0), '÷', B(1))], [[a, b]], [a - b, q, a * b]),
    step('calc', [R(B(0))], [[q]], [a - b, k, q * 2]),
    step('sqrt', [B(0)], [[k]], [q, q / 2, k + 1]),
  ]));
}
for (const [p, a, q, b] of [[2, 3, 5, 2], [3, 2, 4, 5], [2, 5, 3, 3], [4, 3, 2, 7], [5, 2, 3, 3]]) {
  P.push(problem(`coef-${p}-${a}-${q}-${b}`, 'a√b × c√d', 'a', [s(p), R(s(a)), '×', s(q), R(s(b))], [
    step('coef', ['(', B(0), '×', B(1), ')', R(B(2), '×', B(3))], [[p, q, a, b], [q, p, a, b], [p, q, b, a], [q, p, b, a]], [p + q, a + b, p * q]),
    step('calc', [B(0), R(B(1))], [[p * q, a * b]], [p + q, a + b, p * q * a]),
  ]));
}
// ───────── 2-2(2) 最簡根式與分母有理化 ─────────
for (const n of [12, 18, 20, 24, 27, 28, 45, 48, 50, 54, 63, 72, 75, 80]) {
  const [k, m] = split(n);
  // 不是最大的平方因數（例如 72 ＝ 4 × 18）也是常見錯誤
  const small = [4, 9].find((x) => n % x === 0 && x !== k * k);
  P.push(problem(`simp-${n}`, '√n 化成最簡根式', 'b', [R(s(n))], [
    step('factor', [R(B(0), '×', B(1))], [[k * k, m], [m, k * k]], [small ?? n / 2, small ? n / small : 2, k]),
    step('out', [B(0), R(B(1))], [[k, m]], [k * k, n / k, m * k]),
  ]));
}
for (const [a, b] of [[6, 12], [3, 15], [2, 10], [6, 8], [5, 10], [3, 6]]) {
  const n = a * b,
    [k, m] = split(n);
  P.push(problem(`mulsimp-${a}-${b}`, '√a × √b 再化成最簡根式', 'b', [R(s(a)), '×', R(s(b))], [
    step('mul', [R(B(0), '×', B(1))], [[a, b], [b, a]], [a + b]),
    step('calc', [R(B(0))], [[n]], [a + b, n / 2]),
    step('factor', [R(B(0), '×', B(1))], [[k * k, m], [m, k * k]], [k, 4, n / 4]),
    step('out', [B(0), R(B(1))], [[k, m]], [k * k, m * k]),
  ]));
}
for (const [c, n] of [[3, 5], [2, 7], [5, 3], [6, 3], [4, 6], [10, 5], [9, 6]]) {
  const g = gcd(c, n);
  const steps = [
    step('rat', [F([s(c), '×', R(B(0))], [R(s(n)), '×', R(B(1))])], [[n, n]], [c, n * n, 1]),
    step('calc', [F([B(0), R(B(1))], [B(2)])], [[c, n, n]], [n * n, c * n, 2 * n]),
  ];
  if (g > 1) {
    if (n / g === 1) steps.push(step('reduce', [B(0), R(B(1))], [[c / g, n]], [c, g, n * g]));
    else steps.push(step('reduce', [F([B(0), R(B(1))], [B(2)])], [[c / g, n, n / g]], [c, g, n]));
  }
  P.push(problem(`rat-${c}-${n}`, 'c ÷ √n 分母有理化', 'b', [F([s(c)], [R(s(n))])], steps));
}
for (const [a, b] of [[2, 3], [3, 5], [5, 7], [1, 2], [2, 5], [3, 7]]) {
  P.push(problem(`ratfrac-${a}-${b}`, '√(a/b) 分母有理化', 'b', [R(F([s(a)], [s(b)]))], [
    step('split', [F([R(B(0))], [R(B(1))])], [[a, b]], [a * b, b - a]),
    step('rat', [F([R(B(0)), '×', R(B(1))], [R(B(2)), '×', R(B(3))])], [[a, b, b, b], [b, a, b, b]], [a, a * b]),
    step('calc', [F([R(B(0))], [B(1)])], [[a * b, b]], [b * b, a + b, a]),
  ]));
}
// ───────── 2-2(3) 根式的加減 ─────────
const cell = (k, m, at) => (k === 1 ? [R(B(at))] : [B(at), R(B(at + 1))]);
for (const [x, y, op] of [[8, 18, '+'], [12, 27, '+'], [20, 45, '+'], [50, 8, '−'], [48, 12, '+'], [75, 12, '−'], [18, 32, '+'], [27, 75, '+']]) {
  const [p, m] = split(x),
    [q, m2] = split(y);
  assert.equal(m, m2);
  const sum = op === '+' ? p + q : p - q;
  assert(sum > 1);
  P.push(problem(`like-${x}-${y}`, '√a ± √b（化成同類方根再合併）', 'c', [R(s(x)), op, R(s(y))], [
    step('simp', [B(0), R(B(1)), op, B(2), R(B(3))], [[p, m, q, m]], [p * p, q * q, x / 2]),
    step('like', [B(0), R(B(1))], [[sum, m]], [op === '+' ? p - q : p + q, p * q, m * 2]),
  ]));
}
for (const [a, b, c] of [[2, 6, 3], [3, 6, 2], [2, 10, 5], [3, 15, 2], [5, 10, 2], [2, 14, 3]]) {
  // √a(√b ＋ c) ＝ √(a×b) ＋ c√a
  const n = a * b,
    [k, m] = split(n);
  assert(k > 1 && squareFree(a));
  P.push(problem(`dist-${a}-${b}-${c}`, '√a(√b ＋ c) 分配律', 'c', [R(s(a)), '(', R(s(b)), '+', s(c), ')'], [
    step('dist', [R(B(0), '×', B(1)), '+', B(2), R(B(3))], [[a, b, c, a], [b, a, c, a]], [c + a, a + b, c * a]),
    step('calc', [R(B(0)), '+', B(1), R(B(2))], [[n, c, a]], [a + b, c * a]),
    step('simp', [B(0), R(B(1)), '+', B(2), R(B(3))], [[k, m, c, a]], [k * k, n / 2]),
  ]));
}
// ───────── 2-2(4) 乘法公式與根式 ─────────
for (const [a, b] of [[5, 2], [7, 3], [6, 5], [11, 7], [3, 2], [10, 3]]) {
  P.push(problem(`diffsq-${a}-${b}`, '(√a ＋ √b)(√a − √b)', 'd', ['(', R(s(a)), '+', R(s(b)), ')', '(', R(s(a)), '−', R(s(b)), ')'], [
    step('diffsq', ['(', R(B(0)), ')²', '−', '(', R(B(1)), ')²'], [[a, b]], [a + b, a * b]),
    step('sq', [B(0), '−', B(1)], [[a, b]], [a * a, b * b, a * 2]),
    step('calc', [B(0)], [[a - b]], [a + b, a * a - b * b]),
  ]));
}
for (const [c, b] of [[3, 2], [2, 3], [1, 5], [4, 3], [3, 5]]) {
  // (c ＋ √b)² ＝ c² ＋ 2c√b ＋ b
  P.push(problem(`square-${c}-${b}`, '(c ＋ √b)²', 'd', ['(', s(c), '+', R(s(b)), ')²'], [
    step('square', [B(0), '²', '+', '2', '×', B(1), '×', R(B(2)), '+', '(', R(B(3)), ')²'], [[c, c, b, b]], [c * c, 2 * c, b * b]),
    step('calc', [B(0), '+', B(1), R(B(2)), '+', B(3)], [[c * c, 2 * c, b, b]], [2 * c * c, c, b * b]),
    step('calc', [B(0), '+', B(1), R(B(2))], [[c * c + b, 2 * c, b]], [c * c, c + b, 4 * c]),
  ]));
}
for (const [a, b] of [[3, 2], [5, 2], [7, 2], [5, 3], [6, 5]]) {
  // (√a − √b)² ＝ a − 2√(ab) ＋ b
  if (!squareFree(a * b)) continue;
  P.push(problem(`square2-${a}-${b}`, '(√a − √b)²', 'd', ['(', R(s(a)), '−', R(s(b)), ')²'], [
    step('square', ['(', R(B(0)), ')²', '−', '2', '×', R(B(1)), '×', R(B(2)), '+', '(', R(B(3)), ')²'], [[a, a, b, b], [a, b, a, b]], [a * b, a + b]),
    step('calc', [B(0), '−', '2', R(B(1)), '+', B(2)], [[a, a * b, b]], [a * a, a + b]),
    step('calc', [B(0), '−', '2', R(B(1))], [[a + b, a * b]], [a - b, 2 * a * b]),
  ]));
}
for (const [c, a, b] of [[3, 5, 2], [2, 7, 5], [4, 7, 3], [1, 3, 2], [6, 5, 2]]) {
  // c ÷ (√a − √b)：同乘 (√a ＋ √b)，分母 a − b
  const d = a - b,
    g = gcd(c, d);
  const steps = [
    step('ratc', [F([s(c), '(', R(B(0)), '+', R(B(1)), ')'], ['(', R(s(a)), '−', R(s(b)), ')', '(', R(B(2)), '+', R(B(3)), ')'])], [[a, b, a, b]], [a - b, a + b]),
    step('diffsq', [F([s(c), '(', R(B(0)), '+', R(B(1)), ')'], [B(2), '−', B(3)])], [[a, b, a, b]], [a * a, b * b]),
    step('calc', [F([s(c), '(', R(B(0)), '+', R(B(1)), ')'], [B(2)])], [[a, b, d]], [a + b, a * b]),
  ];
  if (g === d) steps.push(step('reduce', d === c ? [R(B(0)), '+', R(B(1))] : [B(0), '(', R(B(1)), '+', R(B(2)), ')'], d === c ? [[a, b]] : [[c / d, a, b]], [c, d]));
  P.push(problem(`ratc-${c}-${a}-${b}`, 'c ÷ (√a − √b) 分母有理化', 'd', [F([s(c)], [R(s(a)), '−', R(s(b))])], steps));
}

// 每一堂的題庫：這一堂與之前
const LESSONS = ['a', 'b', 'c', 'd'];
const RULES = { a: ['mul', 'div', 'coef', 'calc', 'sqrt'], b: ['factor', 'out', 'split', 'rat', 'reduce'], c: ['simp', 'like', 'dist'], d: ['diffsq', 'square', 'sq', 'ratc'] };
await mkdir(join(root, 'content/duels'), { recursive: true });
for (const [i, L] of LESSONS.entries()) {
  const scope = LESSONS.slice(0, i + 1);
  const problems = P.filter((p) => scope.includes(p.lesson));
  const rules = scope.flatMap((x) => RULES[x]);
  for (const p of problems) for (const st of p.steps) assert(rules.includes(st.rule), `${p.id} 用了範圍外的規則 ${st.rule}`);
  const bank = { hostLesson: `g8-2-2${L}`, title: `根式步驟格鬥・2-2(${i + 1})`, rules, problems };
  await writeFile(join(root, 'content/duels', `g8-2-2${L}.json`), JSON.stringify(bank) + '\n');
  const fams = [...new Set(problems.map((p) => p.family))];
  console.log(`✓ content/duels/g8-2-2${L}.json：${problems.length} 題、${fams.length} 種題型、${rules.length} 個規則`);
}
