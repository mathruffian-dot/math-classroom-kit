// 十字交乘（大板操作）：shared/cross.ts 的出題與判定。每個等級幾千個 seed，
// 展開要等於原式、標準答案要判對、所有錯的卡片擺法都要判錯、干擾卡不重複、等級限制成立。
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = await mkdtemp(join(tmpdir(), 'mck-cross-test-'));
test.after(() => rm(dir, { recursive: true, force: true }));
await build({ entryPoints: [resolve('shared/cross.ts')], outdir: dir, bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' }, logLevel: 'silent' });
const X = await import(pathToFileURL(join(dir, 'cross.mjs')).href);

const SEEDS = 3000;
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const items = (level, n = SEEDS) => Array.from({ length: n }, (_, i) => X.crossItem(X.crossSeed(20261117, level, i), level));
/** 卡片放進四格的所有擺法（x 係數卡只進左欄、常數卡只進右欄，一張卡只用一次） */
function* arrangements(item) {
  const leads = item.cards.filter((c) => c.kind === 'lead');
  const consts = item.cards.filter((c) => c.kind === 'const');
  const pairs = (list) => list.flatMap((x) => list.filter((y) => y !== x).map((y) => [x.value, y.value]));
  const leadPairs = item.leadLocked ? [[1, 1]] : pairs(leads);
  for (const [p, r] of leadPairs) for (const [q, s] of pairs(consts)) yield { lead0: p, lead1: r, const0: q, const1: s };
}
const sameFactors = (f, it) => {
  const key = (p, q) => `${p},${q}`;
  const want = [key(it.p, it.q), key(it.r, it.s)].sort().join('|');
  return [key(f.lead0, f.const0), key(f.lead1, f.const1)].sort().join('|') === want;
};

for (const level of X.CROSS_LEVELS) {
  test(`L${level}: expansion, constraints and canonical answer (${SEEDS} seeds)`, () => {
    for (const it of items(level)) {
      const e = X.expand(it.k, it.p, it.q, it.r, it.s);
      assert.deepEqual(e, it.poly, it.key);
      assert.deepEqual(X.expand(1, it.p, it.q, it.r, it.s), it.inner, it.key);
      assert.ok(it.p > 0 && it.r > 0, `${it.key}: leading column positive`);
      assert.ok(it.inner.a > 0, it.key);
      assert.equal(gcd(gcd(it.inner.a, it.inner.b), it.inner.c), 1, `${it.key}: inner primitive`);
      assert.notEqual(it.poly.b, 0, it.key);
      assert.notEqual(it.poly.c, 0, it.key);
      assert.ok(Math.abs(it.poly.a) <= 12, `${it.key}: |a| ≤ 12`);
      assert.ok(Math.abs(it.poly.c) <= 60, `${it.key}: |c| ≤ 60`);
      // 範圍限制作用在原式（L3 的 b = k·b′ 也要 ≤ 30），和 docs/CROSS.md 一致
      assert.ok(Math.abs(it.poly.b) <= X.CROSS_LIMITS.maxB, `${it.key}: |b| ≤ 30`);
      assert.ok(!(it.p === it.r && it.q === it.s), `${it.key}: no perfect square`);
      if (level === 1) assert.ok(it.poly.a === 1 && it.k === 1, it.key);
      if (level === 2) assert.ok(it.poly.a > 1 && it.k === 1 && gcd(gcd(it.poly.a, it.poly.b), it.poly.c) === 1, it.key);
      if (level === 3) assert.ok(it.k !== 1 && Math.abs(it.k) === gcd(gcd(it.poly.a, it.poly.b), it.poly.c) && Math.sign(it.k) === Math.sign(it.poly.a), it.key);
      assert.equal(it.leadLocked, it.inner.a === 1);
      const ans = X.crossAnswer(it);
      const j = X.crossJudge(it, ans);
      assert.ok(j.ok && j.complete && j.sum === it.inner.b && j.diff === 0, it.key);
      assert.ok(X.crossJudge(it, { lead0: it.r, lead1: it.p, const0: it.s, const1: it.q }).ok, `${it.key}: row swap accepted`);
    }
  });

  test(`L${level}: cards — 6–8 cards, correct values present, distractors distinct, sign trap exists`, () => {
    for (const it of items(level)) {
      const n = it.cards.length;
      assert.ok(n >= 6 && n <= 8, `${it.key}: ${n} cards`);
      assert.equal(new Set(it.cards.map((c) => c.id)).size, n);
      const leads = it.cards.filter((c) => c.kind === 'lead').map((c) => c.value);
      const consts = it.cards.filter((c) => c.kind === 'const').map((c) => c.value);
      assert.ok(leads.every((v) => v > 0), `${it.key}: lead cards positive`);
      assert.ok(consts.every((v) => v !== 0 && Math.abs(v) <= 60), it.key);
      if (it.leadLocked) assert.equal(leads.length, 0, it.key);
      else {
        // 正解兩張（p = r 時是兩張同數），其餘不重複也不和正解相同
        const need = [it.p, it.r];
        const rest = [...leads];
        for (const v of need) {
          const i = rest.indexOf(v);
          assert.ok(i >= 0, `${it.key}: lead correct ${v} present`);
          rest.splice(i, 1);
        }
        assert.ok(rest.length >= 1, `${it.key}: at least one lead distractor`);
        assert.equal(new Set(rest).size, rest.length);
        assert.ok(rest.every((v) => !need.includes(v)), it.key);
      }
      const rest = [...consts];
      for (const v of [it.q, it.s]) {
        const i = rest.indexOf(v);
        assert.ok(i >= 0, `${it.key}: const correct present`);
        rest.splice(i, 1);
      }
      assert.ok(rest.length >= 2, `${it.key}: const distractors`);
      assert.equal(new Set(rest).size, rest.length, `${it.key}: distractors distinct`);
      assert.ok(rest.every((v) => v !== it.q && v !== it.s), it.key);
      // 有一種擺法：兩欄乘積都對、交叉和剛好是 −b（正負號放反的陷阱）
      const trap = [...arrangements(it)].some((f) => {
        const j = X.crossJudge(it, f);
        return j.leadOk && j.constOk && j.sum === -it.inner.b;
      });
      assert.ok(trap, `${it.key}: sign trap`);
    }
  });

  test(`L${level}: every wrong arrangement is rejected; only the factorization (or its row swap) passes`, () => {
    for (const it of items(level, 1500)) {
      let passed = 0;
      for (const f of arrangements(it)) {
        const j = X.crossJudge(it, f);
        const valid = f.lead0 * f.lead1 === it.inner.a && f.const0 * f.const1 === it.inner.c && f.lead0 * f.const1 + f.lead1 * f.const0 === it.inner.b;
        assert.equal(j.ok, valid, `${it.key}: ${JSON.stringify(f)}`);
        if (j.ok) {
          passed++;
          assert.ok(sameFactors(f, it), `${it.key}: alternate valid arrangement ${JSON.stringify(f)} is an equivalent factorization`);
          assert.deepEqual(X.expand(it.k, f.lead0, f.const0, f.lead1, f.const1), it.poly);
        } else assert.ok(j.reason && j.reason !== 'incomplete', it.key);
      }
      assert.ok(passed >= 1, `${it.key}: canonical answer reachable with the cards`);
    }
  });
}

test('determinism: same seed → same item; sequence has no duplicates', () => {
  for (const level of X.CROSS_LEVELS) {
    for (let i = 0; i < 200; i++) assert.deepEqual(X.crossItem(i * 7919, level), X.crossItem(i * 7919, level));
    const seq = X.crossSequence(42, level, 40);
    assert.equal(seq.length, 40);
    assert.equal(new Set(seq.map((x) => x.key)).size, 40);
    assert.deepEqual(seq.map((x) => x.key), X.crossSequence(42, level, 40).map((x) => x.key));
  }
  // 等級之間有變化：同一個場次種子，各等級的題目不同
  assert.notEqual(X.crossSequence(1, 1, 1)[0].key, X.crossSequence(2, 1, 1)[0].key);
});

test('L3 covers both common factor and negative leading coefficient', () => {
  const list = items(3);
  assert.ok(list.some((x) => x.k < 0));
  assert.ok(list.some((x) => x.k > 1));
  assert.ok(list.some((x) => x.k === -1));
  assert.ok(list.some((x) => x.leadLocked) && list.some((x) => !x.leadLocked));
});

test('judge: partial fills, difference text values, reasons', () => {
  const it = { inner: { a: 1, b: 5, c: -14 }, leadLocked: true };
  let j = X.crossJudge(it, { const0: 7 });
  assert.deepEqual([j.complete, j.ok, j.products[0], j.products[1], j.sum], [false, false, null, 7, null]);
  assert.equal(j.reason, 'incomplete');
  j = X.crossJudge(it, { const0: 7, const1: -2 });
  assert.ok(j.ok);
  assert.deepEqual(j.products, [-2, 7]);
  j = X.crossJudge(it, { const0: -7, const1: 2 });
  assert.deepEqual([j.ok, j.sum, j.target, j.diff, j.reason], [false, -5, 5, -10, 'sum']);
  j = X.crossJudge(it, { const0: 14, const1: -1 });
  assert.equal(j.reason, 'sum');
  const two = { inner: { a: 6, b: 1, c: -2 }, leadLocked: false };
  assert.ok(X.crossJudge(two, { lead0: 2, const0: -1, lead1: 3, const1: 2 }).ok);
  assert.equal(X.crossJudge(two, { lead0: 1, const0: -1, lead1: 3, const1: 2 }).reason, 'lead');
  assert.equal(X.crossJudge(two, { lead0: 2, const0: 1, lead1: 3, const1: 2 }).reason, 'const');
  assert.equal(X.crossJudge(two, { lead0: -2, const0: 1, lead1: -3, const1: -2 }).reason, 'sign');
});

test('judge is strict: locked lead column, non-integers, values that are not cards', () => {
  const it = { inner: { a: 1, b: 5, c: -14 }, leadLocked: true };
  // 左欄固定：省略、null、1 都可以；明確填了不是 1 的數 → 判錯（Codex review 1 回歸案例）
  assert.ok(X.crossJudge(it, { const0: 7, const1: -2 }).ok);
  assert.ok(X.crossJudge(it, { lead0: null, lead1: null, const0: 7, const1: -2 }).ok);
  assert.ok(X.crossJudge(it, { lead0: 1, lead1: 1, const0: 7, const1: -2 }).ok);
  let j = X.crossJudge(it, { lead0: 2, lead1: 3, const0: 7, const1: -2 });
  assert.equal(j.ok, false);
  assert.equal(j.reason, 'lead');
  assert.equal(X.crossJudge(it, { lead0: 2, const0: 7, const1: -2 }).ok, false);
  assert.equal(X.crossJudge(it, { lead0: -1, lead1: -1, const0: -7, const1: 2 }).ok, false);
  // 不是整數、不是數字、超出安全整數 → invalid
  for (const bad of [7.5, NaN, Infinity, '7', true, {}, [7], 2 ** 60]) {
    j = X.crossJudge(it, { const0: bad, const1: -2 });
    assert.equal(j.ok, false, String(bad));
    assert.equal(j.reason, 'invalid', String(bad));
  }
  assert.equal(X.crossJudge(it, { lead0: 1.5, const0: 7, const1: -2 }).reason, 'invalid');
  assert.equal(X.crossJudge(it, null).ok, false);
  assert.equal(X.crossJudge(it, undefined).reason, 'incomplete');
  // 有 cards 時：數字要是這題該欄的卡，同一張卡不能用兩次
  const item = X.crossItem(X.crossSeed(1, 2, 0), 2);
  const ans = X.crossAnswer(item);
  assert.ok(X.crossJudge(item, ans).ok);
  const notCard = [...Array(200).keys()].map((n) => n - 100).find((n) => n !== 0 && !item.cards.some((c) => c.value === n));
  assert.equal(X.crossJudge(item, { ...ans, const0: notCard }).reason, 'card');
  // 常數卡的數字放進左欄 → 不是 x 係數卡
  const constOnly = item.cards.find((c) => c.kind === 'const' && c.value > 0 && !item.cards.some((d) => d.kind === 'lead' && d.value === c.value));
  if (constOnly) assert.equal(X.crossJudge(item, { ...ans, lead0: constOnly.value }).reason, 'card');
  // 同一張卡用兩次（q = s 的填法，題目保證 q ≠ s，且常數卡不重複）
  assert.equal(X.crossJudge(item, { ...ans, const1: ans.const0 }).reason, 'card');
  // 左欄固定的題帶 cards：左欄填 1 以外的數 → card
  const l1 = X.crossItem(X.crossSeed(1, 1, 0), 1);
  assert.equal(X.crossJudge(l1, { ...X.crossAnswer(l1), lead0: 2 }).ok, false);
});

test('pool: L1 has exactly 200 items and the pool holds all of them, no repeats; L2/L3 pools are distinct', () => {
  // 列舉 L1 範圍內所有題目，確認題池大小是全部
  const all = new Set();
  for (let q = -12; q <= 12; q++)
    for (let s = -12; s <= 12; s++) {
      if (!q || !s || q === s) continue;
      const b = q + s,
        c = q * s;
      if (b && Math.abs(c) <= 60 && Math.abs(b) <= 30) all.add(`L1:1,${b},${c}`);
    }
  assert.equal(all.size, X.CROSS_POOL_SIZE[1]);
  for (const base of [0, 1, 20261117]) {
    const pool = X.crossPool(base, 1);
    assert.equal(pool.length, 200, `base ${base}`);
    assert.equal(new Set(pool.map((x) => x.key)).size, 200);
    assert.ok(pool.every((x) => all.has(x.key)));
    assert.equal(pool[0].key, X.crossItem(X.crossSeed(base, 1, 0), 1).key, 'first item = seed index 0');
  }
  for (const level of [2, 3]) {
    const pool = X.crossPool(7, level);
    assert.equal(pool.length, X.CROSS_POOL_SIZE[level]);
    assert.equal(new Set(pool.map((x) => x.key)).size, pool.length);
  }
  // 接近用完：小題池依序出、不重複，第 N+1 題才需要新一輪
  const small = X.crossPool(42, 1, 5);
  assert.equal(small.length, 5);
  assert.deepEqual(small.map((x) => x.key), X.crossPool(42, 1, 200).slice(0, 5).map((x) => x.key));
});

test('display helpers', () => {
  assert.equal(X.polyTex({ a: 1, b: 5, c: -14 }), 'x^2+5x-14');
  assert.equal(X.polyTex({ a: -1, b: 1, c: 6 }), '-x^2+x+6');
  assert.equal(X.polyTex({ a: 6, b: -1, c: -2 }), '6x^2-x-2');
  assert.equal(X.factoredTex(1, 1, 7, 1, -2), '(x+7)(x-2)');
  assert.equal(X.factoredTex(2, 1, -4, 1, 3), '2(x-4)(x+3)');
  assert.equal(X.factoredTex(-1, 1, -3, 1, 2), '-(x-3)(x+2)');
  assert.equal(X.factoredTex(1, 2, -1, 3, 2), '(2x-1)(3x+2)');
  assert.equal(X.signed(-2), '−2');
  assert.equal(X.leadText(1), 'x');
  assert.equal(X.leadText(3), '3x');
});
