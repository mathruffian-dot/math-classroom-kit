/**
 * 遊戲的「重點」難度設定（純資料，瀏覽器與 Worker 共用）。
 *
 * 老師挑的是這個單元的重點（例：「x² 係數為 1」），不是抽象的 L1／L2／L3。
 * 每個遊戲宣告自己的重點清單：{ id, label, example, note?, params }；
 * 畫面（遊戲卡片、板子的切換列、對戰的開始設定）一律照這份清單畫，伺服器也照這份清單驗證 id。
 * 之後的單元遊戲只要在 GAME_FOCUS 加一組（params 依遊戲自己的產生器定義），選單就會自動長出來。
 */
import { CROSS_LEVELS, crossClassify, expand, polyTex, type CrossLevel } from './cross';

export interface GameFocus<P = unknown> {
  /** 網址、儲存、API 用的代號（小寫英數與連字號） */
  id: string;
  /** 老師、學生看到的名稱 */
  label: string;
  /** 一行例子（KaTeX 的 LaTeX）；沒有算式時用 exampleText */
  example?: string;
  exampleText?: string;
  /** 補充說明（一小段，例：「含首項為負」） */
  note?: string;
  params: P;
}

/* ───────────── 十字交乘（八上 3-2） ───────────── */
export type CrossFocusId = 'a1' | 'a-not-1' | 'gcf' | 'mix';
export interface CrossFocusParams {
  /** 這個重點出哪些產生器等級（shared/cross.ts 的 CrossLevel）；超過一個＝混合 */
  levels: CrossLevel[];
  /** 例子的因式分解 k(px+q)(rx+s)（單元測試用產生器的分類規則核對它屬於這個重點） */
  sample?: { k: number; p: number; q: number; r: number; s: number };
}
const sampleTex = (x: CrossFocusParams['sample']) => (x ? polyTex(expand(x.k, x.p, x.q, x.r, x.s)) : undefined);
const crossFocus = (id: CrossFocusId, label: string, params: CrossFocusParams, extra: Pick<GameFocus, 'note' | 'exampleText'> = {}): GameFocus<CrossFocusParams> & { id: CrossFocusId } => ({
  id,
  label,
  ...(params.sample ? { example: sampleTex(params.sample) } : {}),
  ...extra,
  params,
});
export const CROSS_FOCUS: (GameFocus<CrossFocusParams> & { id: CrossFocusId })[] = [
  // x²+5x−14 = (x+7)(x−2)
  crossFocus('a1', 'x² 係數為 1', { levels: [1], sample: { k: 1, p: 1, q: 7, r: 1, s: -2 } }),
  // 6x²+x−2 = (2x−1)(3x+2)
  crossFocus('a-not-1', 'x² 係數不為 1', { levels: [2], sample: { k: 1, p: 2, q: -1, r: 3, s: 2 } }),
  // 2x²+10x+12 = 2(x+2)(x+3)
  crossFocus('gcf', '先提公因式', { levels: [3], sample: { k: 2, p: 1, q: 2, r: 1, s: 3 } }, { note: '含首項為負' }),
  crossFocus('mix', '混合', { levels: [...CROSS_LEVELS] }, { exampleText: '三種隨機出現' }),
];

export const GAME_FOCUS: Record<string, GameFocus[]> = {
  cross: CROSS_FOCUS,
};

export const CROSS_FOCUS_IDS = CROSS_FOCUS.map((f) => f.id);
export const isCrossFocus = (x: unknown): x is CrossFocusId => typeof x === 'string' && (CROSS_FOCUS_IDS as string[]).includes(x);
export const crossFocusById = (id: CrossFocusId) => CROSS_FOCUS.find((f) => f.id === id)!;
/** 產生器等級 → 只出這一級的重點（L1 → a1、L2 → a-not-1、L3 → gcf）。舊網址 ?level=、舊的對戰紀錄用。 */
export const CROSS_LEVEL_FOCUS: Record<CrossLevel, CrossFocusId> = { 1: 'a1', 2: 'a-not-1', 3: 'gcf' };
/** 一題（或一個等級）的重點名稱：x² 係數為 1／x² 係數不為 1／先提公因式。 */
export const crossLevelLabel = (level: CrossLevel) => crossFocusById(CROSS_LEVEL_FOCUS[level]).label;
/** 單一重點的等級；混合是 null。 */
export function crossFocusLevel(id: CrossFocusId): CrossLevel | null {
  const levels = crossFocusById(id).params.levels;
  return levels.length === 1 ? levels[0] : null;
}
/** 自動進到下一個重點的順序：a1 → a-not-1 → gcf（最後一個、混合：沒有下一個）。 */
export function crossNextFocus(id: CrossFocusId): CrossFocusId | null {
  const level = crossFocusLevel(id);
  return level && level < 3 ? CROSS_LEVEL_FOCUS[(level + 1) as CrossLevel] : null;
}
/**
 * 網址參數 → 重點：?focus= 優先；沒有（或不認得）時看舊的 ?level=1/2/3；都沒有就是 a1。
 */
export function crossFocusFromParams(params: URLSearchParams): CrossFocusId {
  const f = params.get('focus');
  if (isCrossFocus(f)) return f;
  const lv = Number(params.get('level'));
  return lv === 1 || lv === 2 || lv === 3 ? CROSS_LEVEL_FOCUS[lv] : 'a1';
}
/** 對戰的重點：新的場次存 focus；8ccf588 存的舊場次只有 level（起始等級）與 lock，對應到同一級的重點。 */
export function crossRunFocus(run: { focus?: string; level: CrossLevel }): CrossFocusId {
  return isCrossFocus(run.focus) ? run.focus : CROSS_LEVEL_FOCUS[run.level] || 'a1';
}
/** 一題屬於哪個重點（照產生器的分類規則：k ≠ 1 → 先提公因式；x² 係數 1 → a1；其他 → a-not-1）。 */
export const crossItemFocus = (item: Parameters<typeof crossClassify>[0]): CrossFocusId => CROSS_LEVEL_FOCUS[crossClassify(item)];
