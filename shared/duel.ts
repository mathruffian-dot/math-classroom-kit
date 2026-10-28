/**
 * 根式步驟格鬥（伺服器與各裝置共用的規則）。
 * 全班分紅、藍兩隊；每一題是一串運算步驟，每一步先選「這一步用哪個規則」，再用數字卡填出下一行算式。
 * 選對規則、填對算式就出招攻擊對手隊伍；填出最後一行（化成最簡）是這一題的最後一擊。答錯扣自己隊伍一點血。
 * 傷害依自己隊伍人數平均（人多的隊伍每一招比較輕），兩隊人數不同也公平。
 */

export type DuelTeam = 'red' | 'blue';
export const DUEL_TEAMS: DuelTeam[] = ['red', 'blue'];
export const DUEL_TEAM_NAME: Record<DuelTeam, string> = { red: '紅隊', blue: '藍隊' };
export const DUEL_COUNTDOWN_MS = 3000;
/** 同一小步連錯幾次後給提示。 */
export const DUEL_HINT_AFTER = 2;

/** 算式的樹：文字、空格（第幾格）、根號、分數。 */
export type DuelTok = string | { b: number } | { r: DuelTok[] } | { f: [DuelTok[], DuelTok[]] };
export interface DuelStep {
  /** 這一步用的規則（DUEL_RULES 的 id）。 */
  rule: string;
  /** 下一行算式（含空格）。 */
  line: DuelTok[];
  /** 接受的填法（每一種是各格依序的數字）。 */
  fill: string[][];
  /** 數字卡（含常見錯誤的數字）。 */
  tiles: string[];
}
export interface DuelProblem {
  id: string;
  /** 題型（同題型換數字）。 */
  family: string;
  /** 這一題屬於哪一堂（範圍：這一堂與之前）。 */
  lesson: string;
  start: DuelTok[];
  steps: DuelStep[];
}
export interface DuelBank {
  hostLesson: string;
  title: string;
  /** 這一堂可以出現的規則（選規則的干擾選項也從這裡抽）。 */
  rules: string[];
  problems: DuelProblem[];
}

/** 運算規則：名稱與一句話的寫法。 */
export const DUEL_RULES: Record<string, { name: string; tip: string }> = {
  mul: { name: '根式相乘', tip: '√a × √b ＝ √(a×b)' },
  div: { name: '根式相除', tip: '√a ÷ √b ＝ √(a÷b)' },
  coef: { name: '係數乘係數、根號乘根號', tip: 'a√b × c√d ＝ (a×c)√(b×d)' },
  calc: { name: '算出結果', tip: '把算得出來的部分算出來' },
  sqrt: { name: '開平方', tip: '√(k²) ＝ k' },
  factor: { name: '拆出最大的平方因數', tip: '√n ＝ √(k² × m)' },
  out: { name: '平方因數移到根號外', tip: '√(k² × m) ＝ k√m' },
  simp: { name: '每一項化成最簡根式', tip: '√n ＝ k√m' },
  split: { name: '分開分子、分母的根號', tip: '√(a/b) ＝ √a / √b' },
  rat: { name: '分母有理化', tip: '分子、分母同乘分母的根號' },
  ratc: { name: '分母有理化（乘共軛）', tip: '分子、分母同乘 (√a＋√b)' },
  reduce: { name: '約分', tip: '分子、分母同除以公因數' },
  like: { name: '合併同類方根', tip: 'a√m ＋ b√m ＝ (a＋b)√m' },
  dist: { name: '分配律展開', tip: '√a(√b＋c) ＝ √(a×b) ＋ c√a' },
  diffsq: { name: '平方差公式', tip: '(a＋b)(a−b) ＝ a² − b²' },
  square: { name: '和（差）的平方公式', tip: '(a±b)² ＝ a² ± 2ab ＋ b²' },
  sq: { name: '根號的平方', tip: '(√a)² ＝ a' },
};

/** 一個動作：選規則或填算式，對或錯、有沒有看過提示、是不是這一題的最後一步。 */
export interface DuelAction {
  t: number;
  seat: number;
  team: DuelTeam;
  phase: 'rule' | 'fill';
  rule: string;
  ok: boolean;
  hint?: boolean;
  final?: boolean;
  /** 作答當時自己隊伍的人數（中途有人加入，之前的傷害不變）。 */
  w?: number;
}
export interface DuelSeatStats {
  team: DuelTeam;
  /** 每一小步第一次就做對的次數、做過的小步數。 */
  first: number;
  steps: number;
  wrong: number;
  hints: number;
  /** 完成的題數（最後一擊）。 */
  finished: number;
  /** 造成的傷害（點數，還沒除以人數）。 */
  damage: number;
  /** 各規則：選規則與填算式第一次就對幾次／幾次。 */
  byRule: Record<string, { ok: number; n: number }>;
}
export interface DuelState {
  t: number;
  hp: Record<DuelTeam, number>;
  result: DuelTeam | 'draw' | null;
  endAt?: number;
  /** 最近的動作（大螢幕戰況與出招動畫）。 */
  log: { t: number; seat: number; team: DuelTeam; k: 'hit' | 'finish' | 'miss'; rule: string; n: number }[];
  stats: Record<string, DuelSeatStats>;
}

/** 傷害點數：選對規則 1、填對算式 2、最後一擊 4；看過提示減半；答錯扣自己隊伍 1。 */
export const DUEL_POINTS = { rule: 1, fill: 2, final: 4, miss: 1 };
/**
 * 每一點傷害扣對方百分之幾的血：一般程度的隊員 8 分鐘大約打出 100 點，整隊平均起來接近打倒對手，
 * 程度好、答得穩的隊伍會先打倒對方。時間短就每點重一點。
 */
export function duelScale(seconds: number, ownSize: number) {
  return (1.2 * (480 / Math.max(60, seconds))) / Math.max(1, ownSize);
}
export function duelPoints(a: Pick<DuelAction, 'phase' | 'ok' | 'hint' | 'final'>) {
  if (!a.ok) return DUEL_POINTS.miss;
  const base = a.final ? DUEL_POINTS.final : a.phase === 'rule' ? DUEL_POINTS.rule : DUEL_POINTS.fill;
  return a.hint ? Math.max(1, Math.floor(base / 2)) : base;
}
const other = (t: DuelTeam): DuelTeam => (t === 'red' ? 'blue' : 'red');
/** 從頭推算戰況（各裝置用同一份動作得到一樣的結果）。size：各隊人數。 */
export function duelReplay(actions: DuelAction[], size: Record<DuelTeam, number>, seconds: number, now: number): DuelState {
  const s: DuelState = { t: now, hp: { red: 100, blue: 100 }, result: null, log: [], stats: {} };
  const limit = seconds * 1000;
  for (const a of actions) {
    if (a.t > now || a.t > limit) break;
    const st = (s.stats[String(a.seat)] ||= { team: a.team, first: 0, steps: 0, wrong: 0, hints: 0, finished: 0, damage: 0, byRule: {} });
    const r = (st.byRule[a.rule] ||= { ok: 0, n: 0 });
    const pts = duelPoints(a);
    const dmg = pts * duelScale(seconds, a.w ?? size[a.team]);
    if (a.ok) {
      st.steps++;
      if (!a.hint) st.first++;
      if (a.hint) st.hints++;
      if (a.final) st.finished++;
      st.damage += pts;
      const foe = other(a.team);
      s.hp[foe] = Math.max(0, s.hp[foe] - dmg);
      s.log.push({ t: a.t, seat: a.seat, team: a.team, k: a.final ? 'finish' : 'hit', rule: a.rule, n: Math.round(dmg * 10) / 10 });
      if (s.hp[foe] <= 0) {
        s.result = a.team;
        s.endAt = a.t;
        break;
      }
    } else {
      st.wrong++;
      // 答錯：扣自己隊伍一點血，但不會因此直接輸（最低留 1）
      s.hp[a.team] = Math.max(Math.min(1, s.hp[a.team]), s.hp[a.team] - dmg);
      s.log.push({ t: a.t, seat: a.seat, team: a.team, k: 'miss', rule: a.rule, n: Math.round(dmg * 10) / 10 });
    }
    // 各規則的正確率：每一次作答都算（答錯也算一次），看過提示才對的不算對
    r.n++;
    if (a.ok && !a.hint) r.ok++;
    if (s.log.length > 40) s.log.shift();
  }
  if (!s.result && now >= limit) {
    s.endAt = limit;
    s.result = s.hp.red === s.hp.blue ? 'draw' : s.hp.red > s.hp.blue ? 'red' : 'blue';
  }
  return s;
}

/** 填好的算式（把空格換成數字）。 */
export function duelFill(line: DuelTok[], values: (string | undefined)[]): DuelTok[] {
  return line.map((t) => (typeof t === 'string' ? t : 'b' in t ? values[t.b] ?? { b: t.b } : 'r' in t ? { r: duelFill(t.r, values) } : { f: [duelFill(t.f[0], values), duelFill(t.f[1], values)] as [DuelTok[], DuelTok[]] }));
}
/** 一行算式有幾格空格。 */
export function duelBlanks(line: DuelTok[]): number {
  let n = 0;
  const walk = (list: DuelTok[]) => {
    for (const t of list) {
      if (typeof t === 'string') continue;
      if ('b' in t) n = Math.max(n, t.b + 1);
      else if ('r' in t) walk(t.r);
      else walk(t.f[0]), walk(t.f[1]);
    }
  };
  walk(line);
  return n;
}
