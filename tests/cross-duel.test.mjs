// 十字交乘・雙人大屏對戰與「先提公因式」的公因數選項：
// 共用的公因數選項（和答案無關、涵蓋所有題池的 k、伺服器用同一份）、選錯的說明不洩漏答案、
// 兩邊配對出題的公平性（同一串重點與題型、嚴格按題型分桶、數字不同、同一個 seed 可重現、整局跨題池不重複、兩邊不相交、耗盡時停止發題、不重洗）、勝負與平手、計時。
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = await mkdtemp(join(tmpdir(), 'mck-cross-duel-test-'));
test.after(() => rm(dir, { recursive: true, force: true }));
await build({ entryPoints: [resolve('shared/cross.ts'), resolve('shared/cross-duel.ts'), resolve('worker/cross.ts')], outdir: dir, bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' }, logLevel: 'silent' });
const X = await import(pathToFileURL(join(dir, 'shared', 'cross.mjs')).href);
const D = await import(pathToFileURL(join(dir, 'shared', 'cross-duel.mjs')).href);
const W = await import(pathToFileURL(join(dir, 'worker', 'cross.mjs')).href);
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));

test('k options: one fixed list shared by the board and the live battle; independent of the answer', () => {
  assert.deepEqual(X.crossKOptions(), [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]);
  // 伺服器（全班連線對戰）用同一份：值一樣、函式回傳一樣
  assert.deepEqual(W.CROSS_K_OPTIONS, X.crossKOptions());
  assert.deepEqual(W.kOptions(), X.crossKOptions());
  // 回傳的是複本，改了也不影響下一次
  const o = X.crossKOptions();
  o.push(99);
  assert.deepEqual(X.crossKOptions(), [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]);
  assert.throws(() => X.CROSS_K_OPTIONS.push(1));
  // 程式碼層面：worker/cross.ts 不再自己寫一份清單
  return readFile(resolve('worker/cross.ts'), 'utf8').then((src) => {
    assert.match(src, /crossKOptions\(\)/);
    assert.doesNotMatch(src, /\[-5, -4, -3, -2, -1, 1, 2, 3, 4, 5\]/);
  });
});

test('every gcf item in every pool (and 5000 random seeds) has its k inside the option list; the list has distractors', () => {
  const opts = X.crossKOptions();
  const ks = new Set();
  for (const base of [0, 1, 7, 123, 20261118, 4294967295]) for (const it of X.crossPool(base, 3)) (assert(opts.includes(it.k), `k ${it.k}`), ks.add(it.k));
  for (let i = 0; i < 5000; i++) {
    const it = X.crossItem(X.crossSeed(99, 3, i), 3);
    assert(opts.includes(it.k), `k ${it.k}`);
    ks.add(it.k);
    // 真的是最大公因數（首項為負時帶負號）
    assert.equal(it.k, Math.sign(it.poly.a) * gcd(gcd(it.poly.a, it.poly.b), it.poly.c));
  }
  assert.deepEqual([...ks].sort((a, b) => a - b), [-3, -2, -1, 2, 3, 4, 5]);
  // 干擾：正負號相反、±1、別的因數都在清單裡
  for (const k of ks) assert(opts.includes(-k));
  assert(opts.includes(1) && opts.includes(-1));
});

test('k options leak nothing: identical for every item, so option-only strategies do no better than always guessing one value', () => {
  const items = Array.from({ length: 3000 }, (_, i) => X.crossItem(X.crossSeed(5150, 3, i), 3));
  const lists = new Set(items.map(() => JSON.stringify(X.crossKOptions())));
  assert.equal(lists.size, 1);
  const freq = new Map();
  for (const it of items) freq.set(it.k, (freq.get(it.k) || 0) + 1);
  const best = Math.max(...freq.values()) / items.length;
  // 只看選項的猜法（第一個、最後一個、中間、絕對值最大）：命中率都不超過「永遠猜最常見的 k」
  const opts = X.crossKOptions();
  for (const pick of [opts[0], opts[opts.length - 1], opts[5], 5, -5]) assert(items.filter((it) => it.k === pick).length / items.length <= best + 1e-9);
});

test('wrong k feedback explains without revealing the answer; right k → null', () => {
  for (let i = 0; i < 2000; i++) {
    const it = X.crossItem(X.crossSeed(777, 3, i), 3);
    assert.equal(X.crossKFeedback(it.poly, it.k, it.k), null);
    for (const c of X.crossKOptions()) {
      if (c === it.k) continue;
      const msg = X.crossKFeedback(it.poly, it.k, c);
      assert.equal(typeof msg, 'string');
      // 說明只提到選的那個數，不寫出正確的公因數
      const nums = (msg.match(/−?\d+/g) || []).map((x) => Number(x.replace('−', '-')));
      for (const n of nums) assert.equal(n, c, `${msg} (k=${it.k})`);
      const divides = [it.poly.a, it.poly.b, it.poly.c].every((v) => v % c === 0);
      if (!divides) assert.match(msg, /不是三個係數的公因數/);
      else if (it.poly.a < 0 && c > 0) assert.match(msg, /首項是負的/);
      else if (it.poly.a > 0 && c < 0) assert.match(msg, /首項是正的/);
      else assert.match(msg, /最大公因數|還有公因數/);
    }
  }
  assert.equal(X.crossKFeedback({ a: 4, b: 8, c: 12 }, 4, 2), '2 是公因數，但不是最大公因數');
  assert.equal(X.crossKFeedback({ a: -1, b: 1, c: 6 }, -1, 1), '首項是負的，要連負號一起提出');
  assert.equal(X.crossKFeedback({ a: 2, b: 10, c: 12 }, 2, -2), '首項是正的，不用提出負號');
  assert.equal(X.crossKFeedback({ a: 2, b: 10, c: 12 }, 2, 3), '3 不是三個係數的公因數');
});

test('duel settings from the URL: focus / time defaults and validation; short times only with test=1', () => {
  const s = (q) => D.crossDuelSettings(new URLSearchParams(q));
  assert.deepEqual(s(''), { focus: 'a1', time: 120, seed: null });
  assert.deepEqual(s('focus=gcf&time=60&seed=42'), { focus: 'gcf', time: 60, seed: 42 });
  assert.equal(s('focus=nope').focus, 'a1');
  assert.equal(s('time=180').time, 180);
  assert.equal(s('time=3').time, 120);
  assert.equal(s('time=3&test=1').time, 3);
  assert.equal(s('time=0&test=1').time, 120);
  assert.equal(s('seed=abc').seed, null);
});

test('paired generation: both sides get the same focus sequence and item shape at every index, but different numbers', () => {
  for (const focus of ['a1', 'a-not-1', 'gcf', 'mix']) {
    for (const seed of [1, 99, 20261118]) {
      const deck = D.crossDuelDeck(seed, focus);
      for (let i = 0; i < 60; i++) {
        const [l, r] = deck.pair(i);
        assert.equal(l.level, r.level, `${focus} #${i} same level`);
        assert.equal(l.level, D.crossDuelLevel(focus, seed, i));
        if (focus !== 'mix') assert.equal(l.level, { a1: 1, 'a-not-1': 2, gcf: 3 }[focus]);
        assert.equal(D.crossDuelShape(l), D.crossDuelShape(r), `${focus} #${i} same shape`);
        assert.equal(l.cards.length, r.cards.length, 'same number of cards');
        assert.equal(l.leadLocked, r.leadLocked);
        assert.notEqual(l.key, r.key, 'different numbers');
        assert.equal(X.crossClassify(l), l.level);
        assert.equal(deck.item('L', i), l);
        assert.equal(deck.item('R', i), r);
      }
    }
  }
  // 混合：每 3 題三種都出現，兩邊同一串
  const deck = D.crossDuelDeck(2468, 'mix');
  const levels = Array.from({ length: 30 }, (_, i) => deck.pair(i)[0].level);
  for (let b = 0; b < 30; b += 3) assert.deepEqual([...levels.slice(b, b + 3)].sort(), [1, 2, 3]);
  assert.deepEqual(levels, Array.from({ length: 30 }, (_, i) => X.crossMixLevel(2468, i)));
});

test('paired generation is deterministic per seed, independent of which side asks first; different seeds differ', () => {
  for (const focus of ['a1', 'gcf', 'mix']) {
    const a = D.crossDuelDeck(31337, focus);
    const b = D.crossDuelDeck(31337, focus);
    // a：左邊先跑到第 20 題；b：右邊先跑、交錯詢問
    const la = Array.from({ length: 20 }, (_, i) => a.item('L', i).key);
    const ra = Array.from({ length: 20 }, (_, i) => a.item('R', i).key);
    const rb = [],
      lb = [];
    for (let i = 0; i < 20; i++) rb.push(b.item('R', i).key);
    for (let i = 0; i < 20; i++) lb.push(b.item('L', i).key);
    assert.deepEqual(la, lb);
    assert.deepEqual(ra, rb);
    const c = D.crossDuelDeck(31338, focus);
    assert.notDeepEqual(Array.from({ length: 20 }, (_, i) => c.item('L', i).key), la);
  }
});

test('no repeats within a side, and the two sides never share an item (so never the same question at the same time)', () => {
  for (const focus of ['a1', 'a-not-1', 'gcf', 'mix']) {
    const deck = D.crossDuelDeck(8080, focus);
    const N = 90; // 3 分鐘一個人答不到這麼多題
    const L = Array.from({ length: N }, (_, i) => deck.item('L', i).key);
    const R = Array.from({ length: N }, (_, i) => deck.item('R', i).key);
    assert.equal(new Set(L).size, N, `${focus}: left has no repeats`);
    assert.equal(new Set(R).size, N, `${focus}: right has no repeats`);
    assert.equal(L.filter((k) => R.includes(k)).length, 0, `${focus}: sides are disjoint`);
    for (let i = 0; i < N; i++) assert.equal(deck.exhausted(i), false);
  }
});

test('no repeats across pool rounds: tiny pools (many refills) still never repeat within the whole duel, both sides disjoint', () => {
  for (const focus of ['a1', 'a-not-1', 'gcf', 'mix'])
    for (const size of [2, 3, 5, 7])
      for (const seed of [5, 77, 2026]) {
        const deck = D.crossDuelDeck(seed, focus, () => size);
        const N = 60;
        const all = [];
        for (let i = 0; i < N; i++) {
          const [l, r] = deck.pair(i);
          all.push(l.key, r.key);
          assert.equal(deck.exhausted(i), false, `${focus}/${size}/${seed} #${i}: not exhausted this early`);
        }
        assert.equal(new Set(all).size, all.length, `${focus}/${size}/${seed}: whole duel has no repeats`);
      }
});

test('pairs are strictly by shape bucket — never two different shapes — across many seeds, pool sizes and pool tails', () => {
  for (const focus of ['gcf', 'mix', 'a-not-1', 'a1'])
    for (let seed = 0; seed < 40; seed++)
      for (const size of [undefined, 2, 3, 4, 9]) {
        const deck = D.crossDuelDeck(seed * 7919 + 1, focus, size && (() => size));
        for (let i = 0; i < 40; i++) {
          const [l, r] = deck.pair(i);
          assert.equal(D.crossDuelShape(l), D.crossDuelShape(r), `${focus} seed ${seed} size ${size} #${i}`);
          assert.equal(l.cards.length, r.cards.length);
          assert.notEqual(l.key, r.key);
        }
      }
  // 題池尾端：gcf 有四種題型，題池只有 3 題時一定常常剩下別的題型——仍然只配同題型
  const shapes = new Set();
  const deck = D.crossDuelDeck(31, 'gcf', () => 3);
  for (let i = 0; i < 80; i++) shapes.add(D.crossDuelShape(deck.pair(i)[0]));
  assert(shapes.size >= 3, 'several shapes actually occur');
});

test('exhaustion stops issuing (no reshuffle): a1 has 200 items → exactly 100 pairs, then null forever; no repeats, sides disjoint', () => {
  const deck = D.crossDuelDeck(8080, 'a1');
  const keys = [];
  let first = -1;
  for (let i = 0; i < 130; i++) {
    const p = deck.pair(i);
    if (!p) {
      if (first < 0) first = i;
      assert.equal(deck.exhausted(i), true);
      assert.equal(deck.item('L', i), null);
      assert.equal(deck.item('R', i), null);
      continue;
    }
    assert.equal(first, -1, `#${i}: nothing after exhaustion`);
    assert.equal(deck.exhausted(i), false);
    keys.push(p[0].key, p[1].key);
  }
  assert.equal(first, 100);
  assert.equal(new Set(keys).size, 200, 'every item once, never again');
  // 同一個 seed 一樣在第 100 對用完
  const again = D.crossDuelDeck(8080, 'a1');
  assert.equal(again.exhausted(100), true);
  assert.equal(again.exhausted(99), false);
});

test('one side crosses exhaustion while the other is still on an old question: never the same question, nothing repeats', () => {
  for (const focus of ['a1', 'a-not-1', 'gcf', 'mix'])
    for (const size of [2, 3, 5])
      for (const seed of [5, 77]) {
        const deck = D.crossDuelDeck(seed, focus, () => size);
        // 右邊一直停在第 0 題；左邊一路答到題目用完
        const right = deck.item('R', 0);
        assert(right, `${focus}/${size}/${seed}: right has a question`);
        const left = [];
        let i = 0;
        for (; i < 5000 && !deck.exhausted(i); i++) left.push(deck.item('L', i).key);
        assert(deck.exhausted(i), `${focus}/${size}/${seed}: left side reaches exhaustion`);
        assert(!left.includes(right.key), `${focus}/${size}/${seed}: left never gets the right side's current question`);
        assert.equal(new Set(left).size, left.length, `${focus}/${size}/${seed}: left never repeats`);
        // 用完之後一直是 null（不會重洗出右邊還在作答的題）
        for (let k = i; k < i + 20; k++) assert.equal(deck.item('L', k), null);
        // 右邊之後的題也都在用完之前，而且和左邊不相交
        const rights = [];
        for (let k = 0; k < i; k++) rights.push(deck.item('R', k).key);
        assert.equal(rights.filter((x) => left.includes(x)).length, 0, `${focus}/${size}/${seed}: disjoint`);
        assert.equal(new Set(rights).size, rights.length);
        assert.equal(deck.item('R', i), null, 'right also stops at the same index');
      }
});

test('winner, tie and result text; clock formatting', () => {
  assert.equal(D.crossDuelWinner({ L: 3, R: 2 }), 'L');
  assert.equal(D.crossDuelWinner({ L: 0, R: 1 }), 'R');
  assert.equal(D.crossDuelWinner({ L: 4, R: 4 }), 'tie');
  assert.equal(D.crossDuelWinner({ L: 0, R: 0 }), 'tie');
  assert.equal(D.crossDuelResultText({ L: 3, R: 2 }), '左方（紅）獲勝！3 比 2');
  assert.equal(D.crossDuelResultText({ L: 1, R: 5 }), '右方（藍）獲勝！5 比 1');
  assert.equal(D.crossDuelResultText({ L: 2, R: 2 }), '平手！2 比 2');
  assert.equal(D.crossDuelClock(120_000), '2:00');
  assert.equal(D.crossDuelClock(65_000), '1:05');
  assert.equal(D.crossDuelClock(9_001), '0:10');
  assert.equal(D.crossDuelClock(-5), '0:00');
  assert.deepEqual(D.CROSS_DUEL_TIMES, [60, 120, 180]);
  assert.equal(D.CROSS_DUEL_DEFAULT_TIME, 120);
  assert.deepEqual(D.CROSS_DUEL_SIDE_LABEL, { L: '左方（紅）', R: '右方（藍）' });
});

test('timer: pause time does not count; over only after the full time', () => {
  const t = new D.CrossDuelTimer(60_000);
  assert.equal(t.over(0), false, 'not started');
  t.start(1000);
  assert.equal(t.remaining(31_000), 30_000);
  t.pause(31_000);
  assert.equal(t.paused, true);
  assert.equal(t.remaining(100_000), 30_000, 'frozen while paused');
  t.resume(100_000);
  assert.equal(t.remaining(110_000), 20_000);
  assert.equal(t.over(129_999), false);
  assert.equal(t.over(130_000), true);
  assert.equal(t.remaining(500_000), 0);
});
