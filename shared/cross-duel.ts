/**
 * 十字交乘・雙人大屏對戰（純邏輯，沒有 DOM；src/cross-duel.ts 用、單元測試用）。
 *
 * 兩位同學在老師的大螢幕上左右各一半同時作答，時間內答對題數多的獲勝。
 * 公平：第 i 題兩邊一定是同一個重點（混合時同一種）、同一種題型（左欄是否固定、公因數正負），
 *   所以卡片張數、步驟都一樣；但數字不同。配對嚴格按題型分桶：找不到同題型的另一題就再拿題，絕不拿別的題型補。
 * 不重複：整局（左右兩邊合起來）每一題只出一次，所以同一邊不會重複、兩邊的題目集合也不相交
 *   （跟誰答得快無關，兩邊不會同時是同一題）。
 *   題目用完（某個重點的題目整局都出過了；x² 係數為 1 一共約 200 題＝每邊約 100 題，正常一局到不了）：
 *   不重新洗牌，從那一對起 deck.pair(i) 一律回傳 null（之後的每一對都是 null），畫面那一邊停止發題並顯示
 *   「這個重點的題目都出過了」。所以「整局不重複」「兩邊不相交」是程式保證，沒有例外。
 * 可重現：同一個 seed、同一個重點一定得到同一串配對（?seed=）。
 */
import { CROSS_POOL_SIZE, crossMixLevel, crossPool, crossSeed, type CrossItem, type CrossLevel } from './cross';
import { crossFocusLevel, isCrossFocus, type CrossFocusId } from './game-focus';

export type CrossDuelSide = 'L' | 'R';
export const CROSS_DUEL_SIDES: CrossDuelSide[] = ['L', 'R'];
/** 左方（紅）、右方（藍）——不寫學生姓名 */
export const CROSS_DUEL_SIDE_LABEL: Record<CrossDuelSide, string> = { L: '左方（紅）', R: '右方（藍）' };
/** 可選的時間（秒）：1、2、3 分鐘，預設 2 分鐘 */
export const CROSS_DUEL_TIMES = [60, 120, 180] as const;
export const CROSS_DUEL_DEFAULT_TIME = 120;
/** 答對後停多久再換下一題（毫秒） */
export const CROSS_DUEL_ADVANCE_MS = 800;
/** 開始前倒數幾秒 */
export const CROSS_DUEL_COUNTDOWN = 3;

export interface CrossDuelSettings {
  focus: CrossFocusId;
  /** 這一局幾秒 */
  time: number;
  /** 網址上有 seed 才有；沒有時由畫面隨機產生 */
  seed: number | null;
}
/**
 * 網址參數 → 設定：focus（a1／a-not-1／gcf／mix，預設 a1）、time（60／120／180，預設 120）、seed。
 * 測試用：同時帶 test=1 時 time 可以是 1～600 的任何整數秒（正式畫面只會出現 1／2／3 分鐘）。
 */
export function crossDuelSettings(params: URLSearchParams): CrossDuelSettings {
  const f = params.get('focus');
  const focus: CrossFocusId = isCrossFocus(f) ? f : 'a1';
  const t = Number(params.get('time'));
  const testing = params.get('test') === '1';
  const time = (CROSS_DUEL_TIMES as readonly number[]).includes(t) ? t : testing && Number.isInteger(t) && t >= 1 && t <= 600 ? t : CROSS_DUEL_DEFAULT_TIME;
  const s = params.get('seed');
  const n = Number(s);
  const seed = s !== null && s !== '' && Number.isFinite(n) ? n >>> 0 : null;
  return { focus, time, seed };
}

/** 第 index 題（從 0 起）的等級：單一重點固定；混合由場次種子決定（兩邊同一串）。 */
export function crossDuelLevel(focus: CrossFocusId, seed: number, index: number): CrossLevel {
  return crossFocusLevel(focus) ?? crossMixLevel(seed, index);
}
/** 題型：等級＋左欄是否固定＋公因數是不是負的。配對的兩題題型一樣（卡片張數、步驟一樣）。 */
export function crossDuelShape(item: Pick<CrossItem, 'level' | 'leadLocked' | 'k'>): string {
  return `${item.level}|${item.leadLocked ? 'locked' : 'lead'}|${item.k < 0 ? 'neg' : item.k === 1 ? 'one' : 'pos'}`;
}

export interface CrossDuelDeck {
  /** 第 index 題的一對（左、右）；依序計算，同一個 seed 一定同一串。題目用完之後（exhaustedAt 起）是 null */
  pair(index: number): [CrossItem, CrossItem] | null;
  item(side: CrossDuelSide, index: number): CrossItem | null;
  /** 第 index 對已經沒有題（題目用完）：這一邊停止發題 */
  exhausted(index: number): boolean;
}
/**
 * 連續幾輪題池都拿不到新題＝這個重點的題目都出過了：正式題池（150～200 題）3 輪；
 * 測試用的小題池一輪只有幾題，要多試幾輪才能確定（至少看過約 600 題）。
 */
const emptyRounds = (size: number) => Math.max(3, Math.ceil(600 / size));
/** 防呆上限（正常的產生器不會碰到） */
const MAX_ATTEMPTS = 64;

interface LevelQueue {
  /** 下一輪題池的輪次（種子 crossSeed(seed, level, 3_000_000 + round)） */
  round: number;
  /** 還沒出過的題（依題池順序） */
  queue: CrossItem[];
  /** 整局已經出過（或丟掉）的題（左右兩邊合起來） */
  seen: Set<string>;
}
/**
 * 一局的題目：每個等級一個佇列，從題池（crossPool）依序取還沒出過的題。
 * 每一對：左邊取佇列裡的第一題 a，右邊取佇列裡下一個和 a 題型一樣的題；
 * 佇列裡沒有（題池尾端剩下別的題型）就再拿下一輪題池（只加整局還沒出過的題），直到找到為止。
 * 連續幾輪（emptyRounds）都拿不到新題＝這個重點（或這個題型）的題目都出過了：那一對和之後的每一對都是 null，
 * 不重新洗牌（重洗會讓另一邊螢幕上還在作答的題再出現）。poolSize 只給測試用（縮小題池驗證題池尾端與耗盡）。
 */
export function crossDuelDeck(seed: number, focus: CrossFocusId, poolSize?: (level: CrossLevel) => number): CrossDuelDeck {
  const pairs: [CrossItem, CrossItem][] = [];
  /** 從第幾對起沒有題（題目用完）；還沒用完是 Infinity */
  let exhaustedAt = Infinity;
  const levels: Partial<Record<CrossLevel, LevelQueue>> = {};
  const size = (l: CrossLevel) => Math.max(2, poolSize ? poolSize(l) : CROSS_POOL_SIZE[l]);
  /** 再拿一輪題池，只加還沒出過、也不在佇列裡的題；回傳加了幾題 */
  const refill = (level: CrossLevel, q: LevelQueue) => {
    const queued = new Set(q.queue.map((x) => x.key));
    let added = 0;
    for (const it of crossPool(crossSeed(seed, level, 3_000_000 + q.round++), level, size(level)))
      if (!q.seen.has(it.key) && !queued.has(it.key)) {
        queued.add(it.key);
        q.queue.push(it);
        added++;
      }
    return added;
  };
  /** 一直拿題池直到 ok()；連續 emptyRounds 輪沒有新題就放棄（回傳 false） */
  const fillUntil = (level: CrossLevel, q: LevelQueue, ok: () => boolean) => {
    for (let empty = 0; !ok(); ) {
      if (empty >= emptyRounds(size(level))) return false;
      empty = refill(level, q) ? 0 : empty + 1;
    }
    return true;
  };
  /** 下一對；這個等級（或佇列裡每一種題型）都配不到同題型的新題時回傳 null */
  const take = (level: CrossLevel): [CrossItem, CrossItem] | null => {
    const q = (levels[level] ??= { round: 0, queue: [], seen: new Set() });
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (!fillUntil(level, q, () => q.queue.length > 0)) return null;
      const shape = crossDuelShape(q.queue[0]);
      const partner = () => q.queue.findIndex((x, i) => i > 0 && crossDuelShape(x) === shape);
      if (fillUntil(level, q, () => partner() > 0)) {
        const [b] = q.queue.splice(partner(), 1);
        const a = q.queue.shift()!;
        for (const it of [a, b]) q.seen.add(it.key);
        return [a, b];
      }
      // 這一題的題型已經配不到搭檔了：丟掉它（不出，也不會再出），換佇列裡的下一題當左邊
      q.seen.add(q.queue.shift()!.key);
    }
    return null;
  };
  const pair = (index: number) => {
    while (pairs.length <= index && pairs.length < exhaustedAt) {
      const p = take(crossDuelLevel(focus, seed, pairs.length));
      if (p) pairs.push(p);
      else exhaustedAt = pairs.length;
    }
    return index < pairs.length ? pairs[index] : null;
  };
  return { pair, item: (side, index) => pair(index)?.[side === 'L' ? 0 : 1] ?? null, exhausted: (index) => pair(index) === null };
}

export type CrossDuelWinner = CrossDuelSide | 'tie';
/** 勝負：答對題數多的獲勝，一樣多＝平手。 */
export function crossDuelWinner(score: Record<CrossDuelSide, number>): CrossDuelWinner {
  return score.L > score.R ? 'L' : score.R > score.L ? 'R' : 'tie';
}
/** 結果畫面的標題 */
export function crossDuelResultText(score: Record<CrossDuelSide, number>): string {
  const w = crossDuelWinner(score);
  return w === 'tie' ? `平手！${score.L} 比 ${score.R}` : `${CROSS_DUEL_SIDE_LABEL[w]}獲勝！${Math.max(score.L, score.R)} 比 ${Math.min(score.L, score.R)}`;
}
/** 剩下的秒數 → 「1:05」 */
export function crossDuelClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * 計時（純邏輯，時間由呼叫端傳入）：開始、暫停、繼續；暫停的時間不算。
 */
export class CrossDuelTimer {
  private startedAt: number | null = null;
  private pausedAt: number | null = null;
  private pausedMs = 0;
  constructor(public readonly totalMs: number) {}
  start(now: number) {
    this.startedAt = now;
    this.pausedAt = null;
    this.pausedMs = 0;
  }
  pause(now: number) {
    if (this.startedAt !== null && this.pausedAt === null) this.pausedAt = now;
  }
  resume(now: number) {
    if (this.pausedAt !== null) {
      this.pausedMs += now - this.pausedAt;
      this.pausedAt = null;
    }
  }
  get paused() {
    return this.pausedAt !== null;
  }
  elapsed(now: number): number {
    if (this.startedAt === null) return 0;
    return (this.pausedAt ?? now) - this.startedAt - this.pausedMs;
  }
  remaining(now: number): number {
    return Math.max(0, this.totalMs - this.elapsed(now));
  }
  over(now: number): boolean {
    return this.startedAt !== null && this.remaining(now) <= 0;
  }
}
