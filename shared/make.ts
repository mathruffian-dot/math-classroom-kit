/**
 * 根式湊數挑戰（像 24 點）：每張數字卡各用一次，加上 + − × ÷ 和括號，湊出目標數。
 * 作答格式：卡片寫成 [0]、[1]…，例如 "[0]*([2]+[3])"。伺服器判定與學生端的即時檢查共用這一套。
 */
import { evaluate, parseNumberAnswer, sameNumber } from './expr';

export type MakeToken = number | '+' | '-' | '*' | '/' | '(' | ')';
const MAX_TOKENS = 40;

export function makeTokens(src: string): MakeToken[] {
  const s = String(src ?? '').replace(/\s+/g, '');
  const out: MakeToken[] = [];
  const re = /\[(\d)\]|([-+*/()])/y;
  let i = 0;
  while (i < s.length) {
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m) throw new Error('算式格式不正確');
    out.push(m[1] !== undefined ? Number(m[1]) : (m[2] as MakeToken));
    i = re.lastIndex;
  }
  if (out.length > MAX_TOKENS) throw new Error('算式太長');
  return out;
}
export interface MakeResult {
  /** 湊到目標數（每張卡都用到、算式完整）。 */
  ok: boolean;
  /** 算式完整（括號配對、最後是數字卡或右括號）。 */
  complete: boolean;
  value?: number;
  /** 看得懂的錯誤（例如卡片重複、少用卡片）。 */
  error?: string;
  /** 每張卡用了幾次。 */
  used: number[];
}
export function makeCheck(src: string, cards: string[], target: string): MakeResult {
  const used = cards.map(() => 0);
  let tokens: MakeToken[];
  try {
    tokens = makeTokens(src);
  } catch (e) {
    return { ok: false, complete: false, error: (e as Error).message, used };
  }
  let operand = true,
    depth = 0;
  for (const t of tokens) {
    if (operand) {
      if (typeof t === 'number') {
        if (t >= cards.length) return { ok: false, complete: false, error: '沒有這張卡片', used };
        used[t]++;
        operand = false;
      } else if (t === '(') depth++;
      else return { ok: false, complete: false, error: '運算符號前面要先放數字卡', used };
    } else if (t === ')') {
      if (!depth) return { ok: false, complete: false, error: '括號沒有配對', used };
      depth--;
    } else if (t === '+' || t === '-' || t === '*' || t === '/') operand = true;
    else return { ok: false, complete: false, error: '兩張數字卡中間要放運算符號', used };
  }
  if (used.some((n) => n > 1)) return { ok: false, complete: false, error: '每張卡片只能用一次', used };
  const complete = tokens.length > 0 && !operand && depth === 0;
  if (!complete) return { ok: false, complete: false, used };
  let value: number;
  try {
    value = evaluate(tokens.map((t) => (typeof t === 'number' ? `(${parseNumberAnswer(cards[t])})` : t)).join(''));
  } catch {
    return { ok: false, complete: true, error: '算不出來', used };
  }
  const all = used.every((n) => n === 1);
  const ok = all && Number.isFinite(value) && sameNumber(value, parseNumberAnswer(target));
  return { ok, complete: true, value, used, ...(all ? {} : { error: '每張卡片都要用到' }) };
}
/** 顯示用：卡片換回原本的寫法，運算符號換成 × ÷ −（給 md() 排成課本樣式）。 */
export function makeText(src: string, cards: string[]): string {
  try {
    return makeTokens(src)
      .map((t) => (typeof t === 'number' ? cards[t] ?? '?' : t === '*' ? ' × ' : t === '/' ? ' ÷ ' : t === '-' ? ' − ' : t === '+' ? ' + ' : t))
      .join('')
      .trim();
  } catch {
    return '';
  }
}
/** 刪掉最後一個符號或卡片。 */
export function makeBack(src: string): string {
  return String(src ?? '').replace(/(\[\d\]|[-+*/()])$/, '');
}
