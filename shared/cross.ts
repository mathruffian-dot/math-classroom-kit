/**
 * 十字交乘：題目產生器與判定（純 TS，沒有 DOM；瀏覽器與 Worker 共用）。
 *
 * 題目 ax²+bx+c = k(px+q)(rx+s)，k 是公因數（可以是負數）。
 * 十字交乘一律做在「內部」的本原三項式 a'x²+b'x+c'（a' > 0、gcd(a',b',c') = 1）上。
 *
 * 十字圖四格：
 *   左欄＝x 係數（上 p、下 r），右欄＝常數（上 q、下 s）；每一列是一個因式（px+q）、（rx+s）。
 *   交叉相乘 p·s、r·q，兩個相加要等於 b'。
 *
 * 符號規則：左欄 p、r 一律是正數（x 係數卡只有正數），符號全部放在常數；
 * 整個式子的負號由 k 提出（例：−x²+x+6 = −(x−3)(x+2)）。
 * 判定接受任何數學上成立的填法（p·r = a'、q·s = c'、p·s + r·q = b'，p、r > 0）。
 * 內部三項式是本原的，所以成立的填法只有標準答案和「上下兩列對調」兩種。
 *
 * 同一個 seed、同一個等級一定得到同一題（第二階段全班連線版在伺服器端用同一套產生器）。
 */

export type CrossLevel = 1 | 2 | 3;
export const CROSS_LEVELS: CrossLevel[] = [1, 2, 3];
export const CROSS_LEVEL_NAME: Record<CrossLevel, string> = {
  1: 'L1　x² 係數是 1',
  2: 'L2　x² 係數不是 1',
  3: 'L3　先提公因數',
};

export type CrossSlot = 'lead0' | 'lead1' | 'const0' | 'const1';
export const CROSS_SLOTS: CrossSlot[] = ['lead0', 'lead1', 'const0', 'const1'];

export interface CrossCard {
  id: string;
  /** lead：x 係數卡（只能放左欄）；const：常數卡（只能放右欄） */
  kind: 'lead' | 'const';
  value: number;
}
export interface Trinomial {
  a: number;
  b: number;
  c: number;
}
export interface CrossItem {
  /** 等級＋係數，同一場不重複 */
  key: string;
  seed: number;
  level: CrossLevel;
  /** 原式 */
  poly: Trinomial;
  /** 公因數（L1、L2 是 1；L3 不是 1，可能是負數） */
  k: number;
  /** 提出公因數後的本原三項式，十字交乘做在這裡 */
  inner: Trinomial;
  /** 標準答案：inner = (p x + q)(r x + s)，p、r > 0 */
  p: number;
  q: number;
  r: number;
  s: number;
  /** 左欄固定是 x、x（inner.a = 1），不必放 x 係數卡 */
  leadLocked: boolean;
  cards: CrossCard[];
}
export type CrossFill = Partial<Record<CrossSlot, number | null>>;
export interface CrossJudge {
  /** 四格都有數字 */
  complete: boolean;
  ok: boolean;
  /** [p·s, r·q]（左上×右下、左下×右上）；缺數字的是 null */
  products: [number | null, number | null];
  sum: number | null;
  /** 目標＝內部三項式的一次項係數 */
  target: number;
  /** sum − target */
  diff: number | null;
  /** 左欄相乘（p·r），目標 inner.a */
  leadProduct: number | null;
  /** 右欄相乘（q·s），目標 inner.c */
  constProduct: number | null;
  leadOk: boolean | null;
  constOk: boolean | null;
  /**
   * 不成立時的主要原因（不洩漏答案）。
   * invalid：有格子填了不是整數的東西；card：填的數字不是這題的卡片（或同一張卡用兩次、放錯欄）。
   */
  reason: 'incomplete' | 'invalid' | 'card' | 'sign' | 'lead' | 'const' | 'sum' | null;
}

/* ───────────── 亂數 ───────────── */
/** mulberry32：32 位元、可重現。 */
export function crossRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
/** 場次種子＋第幾題 → 這一題的種子（不同等級錯開）。 */
export function crossSeed(base: number, level: CrossLevel, index: number): number {
  let h = (base ^ Math.imul(level, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca77)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
const pick = <T>(rnd: () => number, list: readonly T[]): T => list[Math.floor(rnd() * list.length)];
function shuffle<T>(rnd: () => number, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
export function gcd(x: number, y: number): number {
  x = Math.abs(x);
  y = Math.abs(y);
  while (y) [x, y] = [y, x % y];
  return x;
}
const nonzero = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter((v) => v !== 0);

/* ───────────── 範圍 ───────────── */
export const CROSS_LIMITS = { maxA: 12, maxC: 60, maxB: 30, maxConst: 12, maxLead: 6 };
const CONSTS = nonzero(-CROSS_LIMITS.maxConst, CROSS_LIMITS.maxConst);
const SMALL_CONSTS = nonzero(-9, 9);
/** a' 與它的拆法（p ≤ r），L2 用；p=1 的拆法照樣可出（例 5x²…） */
const LEAD_SPLITS: [number, number][] = [];
for (let p = 1; p <= CROSS_LIMITS.maxLead; p++)
  for (let r = p; r <= CROSS_LIMITS.maxLead * 2; r++) if (p * r >= 2 && p * r <= CROSS_LIMITS.maxA) LEAD_SPLITS.push([p, r]);

function innerOk(p: number, q: number, r: number, s: number, maxA: number, maxB: number, maxC: number): boolean {
  const a = p * r,
    b = p * s + r * q,
    c = q * s;
  if (b === 0 || c === 0) return false;
  if (a > maxA || Math.abs(b) > maxB || Math.abs(c) > maxC) return false;
  if (q === s) return false; // 完全平方不出；兩個常數相同（卡片要重複）也不出
  return gcd(gcd(a, b), c) === 1;
}

/* ───────────── 出題 ───────────── */
function makeInner(rnd: () => number, leadOne: boolean, maxA: number, maxB: number, maxC: number): [number, number, number, number] {
  for (let tries = 0; tries < 500; tries++) {
    let p = 1,
      r = 1;
    if (!leadOne) {
      const splits = LEAD_SPLITS.filter(([x, y]) => x * y <= maxA);
      [p, r] = pick(rnd, splits);
      if (rnd() < 0.5) [p, r] = [r, p];
    }
    const q = pick(rnd, leadOne ? CONSTS : SMALL_CONSTS);
    const s = pick(rnd, leadOne ? CONSTS : SMALL_CONSTS);
    if (innerOk(p, q, r, s, maxA, maxB, maxC)) return [p, q, r, s];
  }
  // 備用題（極少用到）：挑第一個在範圍內的；(x+2)(x−1) 在任何 k 下都在範圍內
  const spare: [number, number, number, number][] = leadOne ? [[1, 7, 1, -2], [1, 2, 1, -1]] : [[2, -1, 3, 2], [1, -1, 2, 1], [1, 2, 1, -1]];
  return spare.find(([p, q, r, s]) => innerOk(p, q, r, s, maxA, maxB, maxC)) || [1, 2, 1, -1];
}

export function crossItem(seed: number, level: CrossLevel): CrossItem {
  const rnd = crossRng(seed);
  let k = 1,
    leadOne = level === 1,
    maxA = CROSS_LIMITS.maxA,
    maxB = CROSS_LIMITS.maxB,
    maxC = CROSS_LIMITS.maxC;
  if (level === 3) {
    k = pick(rnd, [2, 3, 4, 5, -1, -1, -2, -3]);
    leadOne = rnd() < 0.5;
    // 範圍限制作用在原式：|k·a'| ≤ 12、|k·b'| ≤ 30、|k·c'| ≤ 60
    maxA = Math.floor(CROSS_LIMITS.maxA / Math.abs(k));
    maxB = Math.floor(CROSS_LIMITS.maxB / Math.abs(k));
    maxC = Math.floor(CROSS_LIMITS.maxC / Math.abs(k));
    if (maxA < 2) leadOne = true;
  }
  const [p, q, r, s] = makeInner(rnd, leadOne, maxA, maxB, maxC);
  const inner = { a: p * r, b: p * s + r * q, c: q * s };
  const poly = { a: k * inner.a, b: k * inner.b, c: k * inner.c };
  const leadLocked = inner.a === 1;
  const cards = makeCards(rnd, inner, p, q, r, s, leadLocked);
  return { key: `L${level}:${poly.a},${poly.b},${poly.c}`, seed, level, poly, k, inner, p, q, r, s, leadLocked, cards };
}

/** 一場的題目：依序產生，同一場不重複。 */
export function crossSequence(base: number, level: CrossLevel, count: number): CrossItem[] {
  const out: CrossItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < count && i < count * 20; i++) {
    const item = crossItem(crossSeed(base, level, i), level);
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    out.push(item);
  }
  return out;
}

/** 各等級一輪的題池大小（L1 在範圍內一共 200 種，全部都放進題池）。 */
export const CROSS_POOL_SIZE: Record<CrossLevel, number> = { 1: 200, 2: 150, 3: 150 };
/**
 * 一輪的題池：依 crossSeed(base, level, 0, 1, 2…) 的順序收集不重複的題目，直到 size 題（或試滿次數）。
 * 第一題一定是 crossItem(crossSeed(base, level, 0), level)。板子從題池依序出題，用完才重新開始。
 */
export function crossPool(base: number, level: CrossLevel, size: number = CROSS_POOL_SIZE[level]): CrossItem[] {
  const out: CrossItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < size && i < size * 200; i++) {
    const item = crossItem(crossSeed(base, level, i), level);
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    out.push(item);
  }
  return out;
}

/* ───────────── 卡片（正解＋干擾） ───────────── */
function divisorPairs(n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let d = 1; d <= Math.abs(n); d++) if (n % d === 0) out.push([d, n / d], [-d, -n / d]);
  return out;
}
function makeCards(rnd: () => number, inner: Trinomial, p: number, q: number, r: number, s: number, leadLocked: boolean): CrossCard[] {
  const used = new Set([q, s]);
  const consts: number[] = [];
  const add = (v: number) => {
    if (v !== 0 && Math.abs(v) <= CROSS_LIMITS.maxC && !used.has(v)) {
      used.add(v);
      consts.push(v);
    }
  };
  // 1) 正負號放反：和的絕對值對、符號錯
  add(-q);
  add(-s);
  const flips = consts.length;
  // 2) 常數的其他拆法（小的優先）
  const others = shuffle(rnd, divisorPairs(inner.c).filter(([x, y]) => !((x === q && y === s) || (x === s && y === q))).flat());
  for (const v of others.sort((x, y) => Math.abs(x) - Math.abs(y)).slice(0, 8)) add(v);

  // x 係數卡：a' 的其他拆法；a' 是質數時補一張拆不出來的數
  const leads: number[] = [];
  if (!leadLocked) {
    const lu = new Set([p, r]);
    const pool = [...new Set(divisorPairs(inner.a).filter(([x]) => x > 0).flat())].filter((v) => !lu.has(v));
    for (const v of shuffle(rnd, pool)) if (leads.length < 2) (lu.add(v), leads.push(v));
    for (const v of shuffle(rnd, [1, 2, 3, 4, 5, 6])) if (leads.length < 1 && !lu.has(v)) (lu.add(v), leads.push(v));
  }
  // 總數：左欄固定（L1）6 張；要放 x 係數卡時 8 張
  const fixed = leadLocked ? 2 : 4 + leads.length;
  const room = (leadLocked ? 6 : 8) - fixed;
  // 3) 不夠時補相近的數
  for (const v of shuffle(rnd, [q + 1, q - 1, s + 1, s - 1, 2 * q, 2 * s, -(q + 1), -(s - 1)])) if (consts.length < room) add(v);
  for (let d = 1; consts.length < room && d <= 20; d++) (add(d), add(-d));
  const constDistract = [...consts.slice(0, flips), ...shuffle(rnd, consts.slice(flips))].slice(0, Math.max(room, flips));
  const list: Omit<CrossCard, 'id'>[] = [
    ...(leadLocked ? [] : [p, r, ...leads].map((value) => ({ kind: 'lead' as const, value }))),
    ...[q, s, ...constDistract].map((value) => ({ kind: 'const' as const, value })),
  ];
  return shuffle(rnd, list).map((c, i) => ({ id: `c${i}`, ...c }));
}

/* ───────────── 判定 ───────────── */
/**
 * 判定一個填法。伺服器端也用（第二階段），所以對任何輸入都嚴格：
 * - 空格是 undefined／null；左欄固定（leadLocked）時左欄可以省略或填 null（視為 1），明確填了不是 1 的數就判錯。
 * - 填的不是安全整數 → reason 'invalid'。
 * - item 帶 cards 時，每個數字都要是該欄種類的卡片，且同一張卡不能用兩次 → 否則 reason 'card'。
 */
export function crossJudge(item: Pick<CrossItem, 'inner' | 'leadLocked'> & Partial<Pick<CrossItem, 'cards'>>, fill: CrossFill): CrossJudge {
  const f = (fill && typeof fill === 'object' ? fill : {}) as Record<string, unknown>;
  let invalid = false;
  const isLockedLead = (slot: CrossSlot) => item.leadLocked && (slot === 'lead0' || slot === 'lead1');
  const v = (slot: CrossSlot): number | null => {
    const x = f[slot];
    if (x === undefined || x === null) return isLockedLead(slot) ? 1 : null;
    if (typeof x !== 'number' || !Number.isSafeInteger(x)) {
      invalid = true;
      return null;
    }
    return x;
  };
  // 卡片檢查：數字要是該欄種類、還沒用過的卡（左欄固定時左欄不用卡）
  let cardBad = false;
  if (Array.isArray(item.cards)) {
    const left = item.cards.map((c) => ({ kind: c.kind, value: c.value, used: false }));
    for (const slot of CROSS_SLOTS) {
      const x = f[slot];
      if (typeof x !== 'number' || !Number.isSafeInteger(x)) continue;
      if (isLockedLead(slot)) {
        if (x !== 1) cardBad = true;
        continue;
      }
      const kind = slot.startsWith('lead') ? 'lead' : 'const';
      const c = left.find((y) => !y.used && y.kind === kind && y.value === x);
      if (c) c.used = true;
      else cardBad = true;
    }
  }
  const p = v('lead0'),
    r = v('lead1'),
    q = v('const0'),
    s = v('const1');
  const ps = p !== null && s !== null ? p * s : null;
  const rq = r !== null && q !== null ? r * q : null;
  const sum = ps !== null && rq !== null ? ps + rq : null;
  const target = item.inner.b;
  const leadProduct = p !== null && r !== null ? p * r : null;
  const constProduct = q !== null && s !== null ? q * s : null;
  const complete = p !== null && r !== null && q !== null && s !== null;
  const leadOk = leadProduct === null ? null : leadProduct === item.inner.a;
  const constOk = constProduct === null ? null : constProduct === item.inner.c;
  let reason: CrossJudge['reason'] = null;
  if (invalid) reason = 'invalid';
  else if (cardBad) reason = 'card';
  else if (!complete) reason = 'incomplete';
  else if (p! <= 0 || r! <= 0) reason = 'sign';
  else if (!leadOk) reason = 'lead';
  else if (!constOk) reason = 'const';
  else if (sum !== target) reason = 'sum';
  return { complete, ok: complete && reason === null, products: [ps, rq], sum, target, diff: sum === null ? null : sum - target, leadProduct, constProduct, leadOk, constOk, reason };
}
/** 標準答案的四格 */
export function crossAnswer(item: CrossItem): Record<CrossSlot, number> {
  return { lead0: item.p, lead1: item.r, const0: item.q, const1: item.s };
}

/* ───────────── 顯示（純文字／LaTeX） ───────────── */
const MINUS = '−';
/** 帶號整數：+7、−2 */
export const signed = (n: number) => (n < 0 ? `${MINUS}${-n}` : `+${n}`);
/** x 係數卡：x、2x */
export const leadText = (n: number) => (n === 1 ? 'x' : n === -1 ? `${MINUS}x` : `${n < 0 ? MINUS + -n : n}x`);
export const numText = (n: number) => (n < 0 ? `${MINUS}${-n}` : String(n));
export function polyTex(t: Trinomial): string {
  const term = (coef: number, x: string, first: boolean) => {
    if (coef === 0) return '';
    const sign = coef < 0 ? '-' : first ? '' : '+';
    const mag = Math.abs(coef);
    return `${sign}${mag === 1 && x ? '' : mag}${x}`;
  };
  return `${term(t.a, 'x^2', true)}${term(t.b, 'x', false)}${term(t.c, '', false)}`;
}
export function factorTex(p: number, q: number): string {
  return `(${p === 1 ? '' : p}x${q < 0 ? '-' : '+'}${Math.abs(q)})`;
}
/** k(px+q)(rx+s) 的 LaTeX；k = 1 不寫、k = −1 只寫負號 */
export function factoredTex(k: number, p: number, q: number, r: number, s: number): string {
  const lead = k === 1 ? '' : k === -1 ? '-' : String(k);
  return `${lead}${factorTex(p, q)}${factorTex(r, s)}`;
}
/** 展開 k(px+q)(rx+s) */
export function expand(k: number, p: number, q: number, r: number, s: number): Trinomial {
  return { a: k * p * r, b: k * (p * s + r * q), c: k * q * s };
}
