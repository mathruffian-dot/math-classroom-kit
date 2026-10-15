/**
 * 安全的數學運算式引擎（前後端共用）。
 * 不使用 eval／Function，因此能在嚴格 CSP 與 Worker 中執行；
 * 只支援數字、變數、四則、乘方、比較、邏輯與白名單函數。
 */
type Node =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'un'; op: string; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'call'; fn: string; args: Node[] }
  | { k: 'if'; c: Node; a: Node; b: Node };

const FUNCS: Record<string, (...x: number[]) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  sin: (d) => Math.sin((d * Math.PI) / 180),
  cos: (d) => Math.cos((d * Math.PI) / 180),
  tan: (d) => Math.tan((d * Math.PI) / 180),
  asin: (x) => (Math.asin(x) * 180) / Math.PI,
  acos: (x) => (Math.acos(x) * 180) / Math.PI,
  atan: (x) => (Math.atan(x) * 180) / Math.PI,
  atan2: (y, x) => (Math.atan2(y, x) * 180) / Math.PI,
  round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d,
  floor: Math.floor,
  ceil: Math.ceil,
  min: Math.min,
  max: Math.max,
  hypot: Math.hypot,
  log: Math.log10,
  ln: Math.log,
  sign: Math.sign,
  mod: (a, b) => ((a % b) + b) % b,
  gcd: (a, b) => {
    a = Math.abs(Math.round(a));
    b = Math.abs(Math.round(b));
    while (b) [a, b] = [b, a % b];
    return a;
  },
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };
const MAX_LENGTH = 400;

export class ExprError extends Error {}

function tokenize(src: string): string[] {
  const out: string[] = [];
  const re =
    /\s*(?:(\d+(?:\.\d*)?|\.\d+)|([A-Za-z_][A-Za-z0-9_]*)|(<=|>=|==|!=|&&|\|\||[-+*/^()<>!,?:%]))/y;
  let i = 0;
  const s = src.replace(/[×＊]/g, '*').replace(/[÷／]/g, '/').replace(/[－−]/g, '-');
  while (i < s.length) {
    if (/\s/.test(s[i])) {
      i++;
      continue;
    }
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m) throw new ExprError(`無法辨識的符號「${s[i]}」`);
    out.push(m[1] ?? m[2] ?? m[3]);
    i = re.lastIndex;
  }
  return out;
}

export function parse(src: string): Node {
  if (typeof src !== 'string' || !src.trim()) throw new ExprError('運算式不可空白');
  if (src.length > MAX_LENGTH) throw new ExprError('運算式過長');
  const t = tokenize(src);
  let p = 0;
  const peek = () => t[p];
  const take = (v?: string) => {
    const x = t[p];
    if (v !== undefined && x !== v) throw new ExprError(`預期「${v}」`);
    p++;
    return x;
  };
  const isNum = (x?: string) => !!x && /^(\d|\.\d)/.test(x);
  const isName = (x?: string) => !!x && /^[A-Za-z_]/.test(x);
  // 運算優先序：三元 < || < && < 比較 < 加減 < 乘除 < 單元 < 乘方
  function ternary(): Node {
    const c = or();
    if (peek() === '?') {
      take('?');
      const a = ternary();
      take(':');
      const b = ternary();
      return { k: 'if', c, a, b };
    }
    return c;
  }
  function or(): Node {
    let a = and();
    while (peek() === '||') a = { k: 'bin', op: take(), a, b: and() };
    return a;
  }
  function and(): Node {
    let a = cmp();
    while (peek() === '&&') a = { k: 'bin', op: take(), a, b: cmp() };
    return a;
  }
  function cmp(): Node {
    let a = add();
    while (['<', '>', '<=', '>=', '==', '!='].includes(peek())) a = { k: 'bin', op: take(), a, b: add() };
    return a;
  }
  function add(): Node {
    let a = mul();
    while (peek() === '+' || peek() === '-') a = { k: 'bin', op: take(), a, b: mul() };
    return a;
  }
  function mul(): Node {
    let a = unary();
    for (;;) {
      const x = peek();
      if (x === '*' || x === '/' || x === '%') a = { k: 'bin', op: take(), a, b: unary() };
      // 隱含乘法：2a、2(a+b)、(a+b)(a-b)
      else if (isNum(x) || isName(x) || x === '(') a = { k: 'bin', op: '*', a, b: power() };
      else return a;
    }
  }
  function unary(): Node {
    if (peek() === '-' || peek() === '+' || peek() === '!') {
      const op = take();
      return { k: 'un', op, a: unary() };
    }
    return power();
  }
  function power(): Node {
    const base = atom();
    if (peek() === '^') {
      take('^');
      return { k: 'bin', op: '^', a: base, b: unary() };
    }
    return base;
  }
  function atom(): Node {
    const x = peek();
    if (x === undefined) throw new ExprError('運算式不完整');
    if (isNum(x)) {
      take();
      return { k: 'num', v: Number(x) };
    }
    if (x === '(') {
      take('(');
      const e = ternary();
      take(')');
      return e;
    }
    if (isName(x)) {
      take();
      // 非函數名稱後接括號視為隱含乘法，例如 a(b+c)。
      if (peek() === '(' && Object.hasOwn(FUNCS, x)) {
        take('(');
        const args: Node[] = [];
        if (peek() !== ')') {
          args.push(ternary());
          while (peek() === ',') {
            take(',');
            args.push(ternary());
          }
        }
        take(')');
        return { k: 'call', fn: x, args };
      }
      return { k: 'var', name: x };
    }
    throw new ExprError(`無法解讀「${x}」`);
  }
  const node = ternary();
  if (p !== t.length) throw new ExprError(`多出的符號「${t[p]}」`);
  return node;
}

export type Vars = Record<string, number>;
function run(n: Node, vars: Vars): number {
  switch (n.k) {
    case 'num':
      return n.v;
    case 'var':
      if (Object.hasOwn(vars, n.name)) return vars[n.name];
      if (Object.hasOwn(CONSTS, n.name)) return CONSTS[n.name];
      throw new ExprError(`未知變數 ${n.name}`);
    case 'un': {
      const a = run(n.a, vars);
      return n.op === '-' ? -a : n.op === '!' ? Number(!a) : a;
    }
    case 'if':
      return run(n.c, vars) ? run(n.a, vars) : run(n.b, vars);
    case 'call':
      return FUNCS[n.fn](...n.args.map((x) => run(x, vars)));
    case 'bin': {
      if (n.op === '&&') return Number(!!run(n.a, vars) && !!run(n.b, vars));
      if (n.op === '||') return Number(!!run(n.a, vars) || !!run(n.b, vars));
      const a = run(n.a, vars),
        b = run(n.b, vars);
      switch (n.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return a / b;
        case '%':
          return a % b;
        case '^':
          return a ** b;
        case '<':
          return Number(a < b);
        case '>':
          return Number(a > b);
        case '<=':
          return Number(a <= b + 1e-9);
        case '>=':
          return Number(a >= b - 1e-9);
        case '==':
          return Number(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)));
        case '!=':
          return Number(Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)));
      }
    }
  }
  throw new ExprError('運算式結構不正確');
}

const cache = new Map<string, Node>();
export function compile(src: string): Node {
  let node = cache.get(src);
  if (!node) {
    node = parse(src);
    if (cache.size > 2000) cache.clear();
    cache.set(src, node);
  }
  return node;
}
export function evaluate(src: string | number, vars: Vars = {}): number {
  if (typeof src === 'number') return src;
  return run(compile(src), vars);
}
/** 取值失敗時回傳 NaN，供繪圖使用。 */
export function tryEval(src: string | number | undefined, vars: Vars, fallback = NaN): number {
  if (src === undefined) return fallback;
  try {
    const v = evaluate(src, vars);
    return Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
/** 回傳運算式使用的變數名稱，用於驗證教材。 */
export function variablesOf(src: string): string[] {
  const out = new Set<string>();
  const walk = (n: Node) => {
    if (n.k === 'var' && !Object.hasOwn(CONSTS, n.name)) out.add(n.name);
    if (n.k === 'un') walk(n.a);
    if (n.k === 'bin') {
      walk(n.a);
      walk(n.b);
    }
    if (n.k === 'call') n.args.forEach(walk);
    if (n.k === 'if') [n.c, n.a, n.b].forEach(walk);
  };
  walk(compile(src));
  return [...out];
}
/**
 * 解析學生輸入的數值答案：接受整數、小數、分數、帶負號、括號與 √／sqrt。
 * 例如 "3/4"、"-2.5"、"1681"、"2√3"、"(-3)^2"。
 */
export function parseNumberAnswer(input: string): number {
  const s = input
    .trim()
    .replace(/，/g, ',')
    .replace(/\s+/g, '')
    .replace(/√\(?([\d.]+)\)?/g, 'sqrt($1)');
  if (!s || s.length > 60 || /[A-Za-z_]/.test(s.replace(/sqrt/g, '')))
    throw new ExprError('請輸入數字、分數或算式');
  const v = evaluate(s);
  if (!Number.isFinite(v)) throw new ExprError('答案不是有限的數');
  return v;
}
export function sameNumber(a: number, b: number, tolerance = 0): boolean {
  const tol = Math.max(tolerance, 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)));
  return Math.abs(a - b) <= tol;
}

/** 把學生輸入的根號寫法統一成 √n。 */
function normalizeRadicals(input: string): string {
  return input
    .replace(/\s+/g, '')
    .replace(/[－−]/g, '-')
    .replace(/sqrt\(\s*(\d+)\s*\)/gi, '√$1')
    .replace(/√\((\d+)\)/g, '√$1');
}
const squareFree = (n: number) => {
  for (let k = 2; k * k <= n; k++) if (n % (k * k) === 0) return false;
  return true;
};
/**
 * 檢查答案是否為最簡根式：根號內是大於 1 的無平方因數整數、分母沒有根號、
 * 同類方根已合併、有理數部分最多一項。例如 2√3、3+2√2、√6/3 合格；√12、1/√2、√2+√2 不合格。
 */
export function isSimplestRadical(input: string): boolean {
  const s = normalizeRadicals(input);
  if (!s || /√[^\d]/.test(s) || /√\d+\.\d/.test(s)) return false;
  // 分母不可有根號。
  const slash = s.lastIndexOf('/');
  if (slash >= 0 && s.slice(slash).includes('√')) return false;
  const radicands = [...s.matchAll(/√(\d+)/g)].map((m) => Number(m[1]));
  if (radicands.some((n) => n < 2 || !squareFree(n))) return false;
  if (new Set(radicands).size !== radicands.length) return false;
  // 只允許最外層一組括號作為分子，例如 (3+√2)/2。
  const body = s.replace(/^\(([^()]*)\)\/\d+$/, '$1');
  if (/[()]/.test(body)) return false;
  const terms = body
    .replace(/^[+-]/, '')
    .split(/[+-]/)
    .filter(Boolean);
  return terms.filter((t) => !t.includes('√')).length <= 1;
}
