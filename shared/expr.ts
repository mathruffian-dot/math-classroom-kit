/**
 * 安全的數學運算式引擎（前後端共用）。
 * 不使用 eval／Function，因此能在嚴格 CSP 與 Worker 中執行；
 * 只支援數字、變數、四則、乘方、比較、邏輯與白名單函數。
 */
type Node =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'un'; op: string; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node; sym?: 'imp' | 'times' | 'div' }
  | { k: 'paren'; a: Node }
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
    /\s*(?:(\d+(?:\.\d*)?|\.\d+)|([A-Za-z_][A-Za-z0-9_]*)|(<=|>=|==|!=|&&|\|\||[-+*/^()<>!,?:%÷]))/y;
  let i = 0;
  // ÷ 保留為獨立符號，排版時才能顯示「÷」而不是分數。
  const s = src.replace(/[×＊]/g, '*').replace(/[／]/g, '/').replace(/[－−]/g, '-').replace(/＋/g, '+');
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
      if (x === '*') {
        take();
        a = { k: 'bin', op: '*', a, b: unary(), sym: 'times' };
      } else if (x === '÷') {
        take();
        a = { k: 'bin', op: '/', a, b: unary(), sym: 'div' };
      } else if (x === '/' || x === '%') a = { k: 'bin', op: take(), a, b: unary() };
      // 隱含乘法：2a、2(a+b)、(a+b)(a-b)
      else if (isNum(x) || isName(x) || x === '(') a = { k: 'bin', op: '*', a, b: power(), sym: 'imp' };
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
      return { k: 'paren', a: e };
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
    case 'paren':
      return run(n.a, vars);
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
    if (n.k === 'paren') walk(n.a);
  };
  walk(compile(src));
  return [...out];
}
/**
 * 解析學生輸入的數值答案：接受整數、小數、分數、帶負號、括號與 √／sqrt。
 * 例如 "3/4"、"-2.5"、"1681"、"2√3"、"(-3)^2"。
 */
/** 全形字（中文輸入法的 （）＋－／２ 等）轉半形、各種減號統一、去空白。不動括號，顯示用也安全。 */
export function normalizeChars(input: string): string {
  return String(input ?? '')
    .replace(/²/g, '^2') // 先換掉上標：NFKC 會把 ² 變成普通的 2
    .replace(/³/g, '^3')
    .normalize('NFKC')
    .replace(/[－−–—]/g, '-')
    .replace(/\s+/g, '');
}
/**
 * 判斷學生答案用：再拿掉包住單一數或單一根式的多餘括號，例如 √(6)→√6、(4√5)/(15)→4√5/15，
 * 讓作答鍵盤產生的括號不會被誤判成「沒化簡」。只拿掉不會改變值的括號：
 * 前後緊接數字（2(3)、(√3)2）、函式呼叫 sqrt(12)、相乘 (2)(3) 都保留；
 * 係數乘根號 (3√5) 在 ÷ 後面或 ^ 前後也保留（4/(3√5) ≠ 4/3√5）；負數的括號也保留。
 */
export function normalizeInput(input: string): string {
  let s = normalizeChars(input);
  // 一次只拿掉一組，每次都用「目前的字串」判斷前後字元：(2)(3) 不能變成 23。
  for (let guard = 0; guard < 40; guard++) {
    let changed = false;
    for (const m of s.matchAll(/\(([\d.]*√?[\d.]+)\)/g)) {
      const atom = m[1],
        before = s[m.index! - 1] ?? '',
        after = s[m.index! + m[0].length] ?? '',
        product = /^[\d.]+√/.test(atom); // 3√5 是「3 × √5」，不是單一個數
      const keep =
        /[\d.(^]/.test(after) ||
        /[A-Za-z)]/.test(before) || // sqrt(12) 是函式呼叫；(2)(3) 是相乘
        (before === '√' && atom.startsWith('√')) || // √(√4)
        (/[\d.]/.test(before) && !atom.startsWith('√')) ||
        (product && /[/÷^]/.test(before));
      if (keep) continue;
      s = s.slice(0, m.index) + atom + s.slice(m.index! + m[0].length);
      changed = true;
      break;
    }
    if (!changed) break;
  }
  return s;
}
export function parseNumberAnswer(input: string): number {
  const s = normalizeInput(input)
    .trim()
    .replace(/，/g, ',')
    .replace(/\s+/g, '')
    // √(n) 或 √n；括號要成對才吃掉，避免 (√5+√3)/2 的右括號被誤吞。
    .replace(/√\(([\d.]+)\)|√([\d.]+)/g, (_, a, b) => `sqrt(${a ?? b})`)
    .replace(/√\(/g, 'sqrt(');
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
  return normalizeInput(input)
    .replace(/÷/g, '/')
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
  // 負號寫在係數括號裡也算同一種寫法：(−2)/3√2 → −2/3√2、(−2/3)√2 → −(2/3)√2（作答鍵盤先按「分數」再打負號就是這樣）
  const s = normalizeRadicals(input)
    .replace(/(?<![\d.)√])\((-?\d+)\)(?=\/)/g, '$1')
    .replace(/\((-)(\d+\/\d+)\)/g, '$1($2)');
  if (!s || /√[^\d]/.test(s) || /√\d+\.\d/.test(s)) return false;
  // 分母不可有根號：「/√」或「/(…√…)」。
  if (/\/[-]?√/.test(s) || /\/\([^)]*√[^)]*\)/.test(s)) return false;
  const radicands = [...s.matchAll(/√(\d+)/g)].map((m) => Number(m[1]));
  if (radicands.some((n) => n < 2 || !squareFree(n))) return false;
  if (new Set(radicands).size !== radicands.length) return false;
  // 只允許最外層一組括號作為分子，例如 (3+√2)/2。
  // 分數係數 (2/3)√6 也算最簡。
  const body = s.replace(/^\(([^()]*)\)\/\d+$/, '$1').replace(/\(\d+\/\d+\)/g, 'q');
  if (/[()]/.test(body)) return false;
  const terms = body
    .replace(/^[+-]/, '')
    .split(/[+-]/)
    .filter(Boolean);
  return terms.filter((t) => !t.includes('√')).length <= 1;
}

/* ───────────── 轉成 LaTeX（讓學生輸入的算式以課本樣式顯示） ───────────── */
const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 4 };
function prec(n: Node): number {
  if (n.k === 'bin') return PREC[n.op] ?? 0;
  if (n.k === 'un') return 3;
  if (n.k === 'if') return 0;
  return 5;
}
function texNumber(v: number): string {
  return String(+v.toFixed(10));
}
const unparen = (n: Node): Node => (n.k === 'paren' ? unparen(n.a) : n);
export function nodeToTex(n: Node): string {
  const wrap = (x: Node, min: number) => (prec(x) < min ? `\\left(${nodeToTex(x)}\\right)` : nodeToTex(x));
  switch (n.k) {
    case 'num':
      return texNumber(n.v);
    case 'var':
      return n.name === 'pi' ? '\\pi' : n.name;
    case 'paren':
      return `\\left(${nodeToTex(n.a)}\\right)`;
    case 'un':
      return n.op === '-' ? `-${wrap(n.a, 2)}` : wrap(n.a, 3);
    case 'call':
      if (n.fn === 'sqrt') return `\\sqrt{${nodeToTex(unparen(n.args[0]))}}`;
      if (n.fn === 'abs') return `\\left|${nodeToTex(unparen(n.args[0]))}\\right|`;
      return `\\operatorname{${n.fn}}\\left(${n.args.map(nodeToTex).join(',')}\\right)`;
    case 'if':
      return nodeToTex(n.a);
    case 'bin': {
      if (n.op === '/' && n.sym === 'div') return `${wrap(n.a, 2)}\\div ${wrap(n.b, 3)}`;
      if (n.op === '/') return `\\frac{${nodeToTex(unparen(n.a))}}{${nodeToTex(unparen(n.b))}}`;
      if (n.op === '^') return `${wrap(n.a, 5)}^{${nodeToTex(unparen(n.b))}}`;
      if (n.op === '+') return `${nodeToTex(n.a)}+${nodeToTex(n.b)}`;
      if (n.op === '-') return `${nodeToTex(n.a)}-${wrap(n.b, 2)}`;
      if (n.op === '*') {
        const left = wrap(n.a, 2),
          right = wrap(n.b, 3);
        if (n.sym === 'times') return `${left}\\times ${right}`;
        // 隱含乘法照原樣並排：2√3、3x、(a+b)(a−b)。
        return n.b.k === 'num' ? `${left}\\cdot ${right}` : `${left}${right}`;
      }
      return `${nodeToTex(n.a)}${n.op}${nodeToTex(n.b)}`;
    }
  }
}
/** 學生輸入的答案（如 4√6/3+√2）轉 LaTeX；無法解析時回傳 null。 */
export function answerToTex(input: string): string | null {
  try {
    const s = normalizeChars(input)
      .replace(/[－−]/g, '-')
      .replace(/[×＊]/g, '*')
      .replace(/[／]/g, '/')
      .replace(/＋/g, '+')
      .replace(/²/g, '^2')
      .replace(/³/g, '^3')
      // 前面加空格，避免 a√b 被讀成變數「asqrt」。
      .replace(/√\(([\d.]+)\)|√([\d.]+|[A-Za-z])/g, (_, a, b) => ` sqrt(${a ?? b})`)
      .replace(/√\(/g, ' sqrt(');
    if (!s || s.length > 120) return null;
    return nodeToTex(parse(s));
  } catch {
    return null;
  }
}
