// 十字交乘・全班連線對戰（伺服器）：每位同學各自的題目（伺服器出題、伺服器判定）、計分、自動升級、紅藍拔河。
// 出題與判定用 shared/cross.ts（和老師大板同一套）；答案只在伺服器（StoredSession.crossPlay），不進 session 物件。
import type { CrossLiveItem, CrossLiveResult, CrossLiveRow, CrossLiveView, CrossRun, User } from '../shared/types';
import { crossItem, crossJudge, crossSeed, factoredTex, polyTex, type CrossCard, type CrossItem, type CrossLevel, type CrossSlot } from '../shared/cross';
import { DUEL_TEAMS, type DuelTeam } from '../shared/duel';
import { assert, HttpError, integer } from './validation';

/** 一位同學在這一場的狀態（只在伺服器）。 */
export interface CrossSeat {
  level: CrossLevel;
  score: number;
  streak: number;
  best: number;
  /** 目前等級連對幾題（升級用）。 */
  run: number;
  correct: number;
  attempts: number;
  /** 第幾題（出題種子用）。 */
  n: number;
  /** 上一次動作的時間（限速）。 */
  at: number;
  /** 連續答錯幾題（冷卻時間跟著加長）；冷卻到什麼時候（伺服器時間）。 */
  wrong?: number;
  cool?: number;
  /** 最近一分鐘內每一次送出的時間（每分鐘送出上限）。 */
  hits?: number[];
  /** 目前這一題：題目種子、等級、發題時間、發出去的卡片（伺服器洗過、重新編號）、L3 公因數選項。 */
  cur?: { id: string; seed: number; level: CrossLevel; issuedAt: number; cards: CrossCard[]; kOptions?: number[] };
  /** 送出過的題目（最近 30 題；出題時避開自己做過的）。完整紀錄在 CrossPlay.log。 */
  past: { id: string; key: string; level: CrossLevel; seed: number; ok: boolean; points: number; ms: number; at: number }[];
}
/** 一次送出的紀錄（CSV、老師「公布」用）；id 是題目 ID（不會變），n 是這位同學的第幾題（從 1 開始）。 */
export interface CrossRecord {
  id: string;
  seat: number;
  n: number;
  level: CrossLevel;
  seed: number;
  ok: boolean;
  points: number;
  ms: number;
  at: number;
}
export interface CrossPlay {
  secret: number;
  seats: Record<string, CrossSeat>;
  /** 這一場每一次送出（最多 CROSS_LOG_CAP 筆；超過時丟掉最舊的，dropped 記丟了幾筆）。 */
  log?: CrossRecord[];
  dropped?: number;
  /** 舊場次封存（crossPrune）：只留每人的總計，逐題紀錄與最近題目都清掉。 */
  archived?: boolean;
}
export interface CrossStore {
  crossRuns?: CrossRun[];
  /** 場次 ID → 秘密種子、每個座號的狀態、送出紀錄。 */
  crossPlay?: Record<string, CrossPlay>;
}

/**
 * 計分：答對 = 等級基本分＋速度加分（10 秒內全拿，40 秒後沒有）＋連對加分；答錯 0 分、連對歸零，不扣分。
 * 快得不合理（L1 不到 2 秒、L2 不到 3 秒、L3 不到 4 秒）的答對沒有速度分（只拿基本分＋連對分）。
 */
export const CROSS_SCORE = { base: { 1: 100, 2: 130, 3: 160 } as Record<CrossLevel, number>, speedMax: 50, speedFull: 10_000, speedZero: 40_000, streakStep: 10, streakMax: 50, plausible: { 1: 2000, 2: 3000, 3: 4000 } as Record<CrossLevel, number> };
/** 防亂猜：答錯後冷卻（連錯 1、2、3 題以上：1.5、3、5 秒），冷卻中不能拿下一題、不能送出。 */
export const CROSS_COOLDOWN = [1500, 3000, 5000];
/** 每位同學每分鐘最多送出幾次（一分鐘滑動視窗）。 */
export const CROSS_PER_MINUTE = 15;
/** 拿題目（含重複拿同一題）兩次最少間隔（毫秒；記憶體內限速，不寫入儲存）。 */
export const CROSS_NEXT_GAP = 250;
/** 每一場最多保存幾筆送出紀錄（約 40 人 × 每人 60 題）；超過丟掉最舊的並記數。 */
export const CROSS_LOG_CAP = 2400;
/** 整堂課的容量：最近幾場保留逐題紀錄；更早的場次只留每人總計（封存）。 */
export const CROSS_KEEP_ROUNDS = 3;
/** 整堂課最多保留幾場的場次紀錄（更早的連總計一起刪掉）。 */
export const CROSS_MAX_RUNS = 30;
/** L3 公因數的選項：每一題都一樣、順序固定（和正確答案無關），學生要自己從原式算出公因數。 */
export const CROSS_K_OPTIONS = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5];
/** 同一等級連對幾題升一級。 */
export const CROSS_LIVE_STREAK = 3;
/** 兩次動作最少間隔（毫秒）。 */
export const CROSS_MIN_GAP = 300;
/** 拔河：兩隊平均分差到這麼多就獲勝（預設）。 */
export const CROSS_MARGIN = 300;

export function crossPoints(level: CrossLevel, ms: number, streakBefore: number) {
  const t = Math.min(1, Math.max(0, (ms - CROSS_SCORE.speedFull) / (CROSS_SCORE.speedZero - CROSS_SCORE.speedFull)));
  const speed = ms < CROSS_SCORE.plausible[level] ? 0 : Math.round(CROSS_SCORE.speedMax * (1 - t));
  const streak = Math.min(CROSS_SCORE.streakMax, CROSS_SCORE.streakStep * streakBefore);
  return { base: CROSS_SCORE.base[level], speed, streak, total: CROSS_SCORE.base[level] + speed + streak };
}

function randomInt(n: number): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] % n;
}
function shuffle<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14);

/**
 * iPad 版的卡片：正解卡（左欄固定時 2 張常數卡，否則 2 張 x 係數卡＋2 張常數卡）＋2 張干擾卡。
 * 左欄固定（L1、L3 的一部分）：2 張常數干擾卡（優先正負號相反），共 4 張；
 * 要放 x 係數卡（L2、L3 的一部分）：1 張常數干擾卡（優先正負號相反）＋1 張 x 係數干擾卡，共 6 張。
 * 順序在伺服器打亂、重新編號，卡片 id 看不出哪張是正解。
 */
export function liveCards(item: CrossItem): CrossCard[] {
  const correct: Omit<CrossCard, 'id'>[] = [
    ...(item.leadLocked ? [] : [{ kind: 'lead' as const, value: item.p }, { kind: 'lead' as const, value: item.r }]),
    { kind: 'const', value: item.q },
    { kind: 'const', value: item.s },
  ];
  const taken = (c: CrossCard) => correct.some((x) => x.kind === c.kind && x.value === c.value);
  const consts = item.cards.filter((c) => c.kind === 'const' && !taken(c));
  const flips = consts.filter((c) => c.value === -item.q || c.value === -item.s);
  const constPick = [...flips, ...consts.filter((c) => !flips.includes(c))].slice(0, item.leadLocked ? 2 : 1);
  const leadPick = item.leadLocked ? [] : item.cards.filter((c) => c.kind === 'lead' && !taken(c)).slice(0, 1);
  return shuffle([...correct, ...constPick, ...leadPick].map((c) => ({ kind: c.kind, value: c.value }))).map((c, i) => ({ id: `k${i}`, ...c }));
}
/** L3 公因數的選項：固定的 −5～5（不含 0），每一題都一樣；選項本身看不出答案。 */
export function kOptions(): number[] {
  return [...CROSS_K_OPTIONS];
}

export const crossSize = (run: CrossRun): Record<DuelTeam, number> => {
  const size = { red: 0, blue: 0 };
  for (const t of Object.values(run.teams)) size[t]++;
  return size;
};
/** 之後才加入：分到人少的一隊（一樣多就隨機）。 */
export function crossJoin(run: CrossRun, seat: number): DuelTeam {
  const key = String(seat);
  if (!run.teams[key]) {
    const n = crossSize(run);
    run.teams[key] = n.red === n.blue ? DUEL_TEAMS[randomInt(2)] : n.red < n.blue ? 'red' : 'blue';
  }
  return run.teams[key];
}
export function crossPlayOf(store: CrossStore, run: CrossRun) {
  return ((store.crossPlay ||= {})[run.id] ||= { secret: crypto.getRandomValues(new Uint32Array(1))[0], seats: {} });
}
function seatOf(store: CrossStore, run: CrossRun, seatNo: number): CrossSeat {
  return (crossPlayOf(store, run).seats[String(seatNo)] ||= { level: run.level, score: 0, streak: 0, best: 0, run: 0, correct: 0, attempts: 0, n: 0, at: 0, past: [] });
}

/** 兩隊的總分、人數、平均。 */
export function crossTeams(run: CrossRun, store: CrossStore) {
  const seats = store.crossPlay?.[run.id]?.seats || {};
  const size = crossSize(run);
  const total = { red: 0, blue: 0 };
  for (const [seat, team] of Object.entries(run.teams)) total[team] += seats[seat]?.score || 0;
  const avg = { red: size.red ? total.red / size.red : 0, blue: size.blue ? total.blue / size.blue : 0 };
  // avg 取整只給畫面顯示；判勝、門檻用 crossAvgGap（不先取整）
  return { size, total, avg: { red: Math.round(avg.red), blue: Math.round(avg.blue) } };
}
/**
 * 兩隊平均分的精確差（交叉相乘，不先取整）：gap＝紅總分×藍人數 − 藍總分×紅人數，
 * 和「平均分差 × 兩隊人數相乘」（scale）同一個單位：gap > 0 紅隊高；|gap| ≥ margin × scale 才算達到門檻。
 */
function crossAvgGap(run: CrossRun, store: CrossStore) {
  const { size, total } = crossTeams(run, store);
  return { size, total, gap: total.red * size.blue - total.blue * size.red, scale: size.red * size.blue };
}
/** 這一場有沒有結束：老師結束、時間到（暫停的時間不算）、拔河分出勝負。結束時記下結果。 */
export function crossCheckOver(run: CrossRun, store: CrossStore, now: number): boolean {
  if (run.endedAt) return true;
  if (crossExpired(run, now)) {
    run.endedAt = run.deadline!;
    run.winner = run.team ? crossLeader(run, store) : null;
    return true;
  }
  return false;
}
/** 唯讀：限時到了沒（暫停中不算）。不改任何東西；要結束這一場請走結算（settleCrossSession）。 */
export function crossExpired(run: CrossRun, now: number): boolean {
  return !!run.deadline && !run.pausedAt && now >= run.deadline;
}
/** 唯讀：這一場結束了沒（老師結束、拔河分出勝負、時間到）。 */
export function crossOver(run: CrossRun, now: number): boolean {
  return !!run.endedAt || crossExpired(run, now);
}
/**
 * 時間到或老師結束時的勝負（空隊規則；限時到、老師結束、閒置到期都用這一個）：
 * - 沒有人的隊伍不會獲勝；兩隊都沒人 → 平手。
 * - 只有一隊有人：那一隊平均分 > 0 才獲勝，否則平手。
 * - 兩隊都有人：平均分高的獲勝，一樣 → 平手。
 * 拔河門檻（平均分差 ≥ margin）只在兩隊都有人時才會提前分出勝負（crossMarginWinner）。
 */
export function crossLeader(run: CrossRun, store: CrossStore): DuelTeam | 'draw' {
  const { total, size, gap } = crossAvgGap(run, store);
  if (!size.red && !size.blue) return 'draw';
  if (!size.red || !size.blue) {
    const only: DuelTeam = size.red ? 'red' : 'blue';
    return total[only] > 0 ? only : 'draw';
  }
  return gap === 0 ? 'draw' : gap > 0 ? 'red' : 'blue';
}
/** 拔河提前分出勝負：兩隊都要有人，平均分差 ≥ 門檻。 */
export function crossMarginWinner(run: CrossRun, store: CrossStore): DuelTeam | null {
  if (!run.team) return null;
  const { size, gap, scale } = crossAvgGap(run, store);
  if (!size.red || !size.blue || Math.abs(gap) < run.margin * scale) return null;
  return gap > 0 ? 'red' : 'blue';
}
/** 時間（不含暫停）：剩幾毫秒；沒有限時是 null。 */
export function crossLeft(run: CrossRun, now: number) {
  if (!run.deadline) return null;
  return Math.max(0, run.deadline - (run.endedAt ?? run.pausedAt ?? now));
}

/** 出下一題：同一場不和自己最近做過的、也不和同學目前的題目重複（題目數字每個人都不一樣）。 */
export function issueItem(run: CrossRun, store: CrossStore, seatNo: number, now: number): CrossSeat {
  const play = crossPlayOf(store, run);
  const seat = seatOf(store, run, seatNo);
  const others = new Set<string>();
  for (const [k, x] of Object.entries(play.seats)) if (k !== String(seatNo) && x.cur) others.add(crossItem(x.cur.seed, x.cur.level).key);
  const mine = new Set(seat.past.map((p) => p.key));
  const base = (play.secret ^ Math.imul(seatNo, 0x27d4eb2d)) >>> 0;
  let seed = 0,
    item: CrossItem | undefined;
  for (let i = 0; i < 400; i++) {
    seed = crossSeed(base, seat.level, seat.n++);
    item = crossItem(seed, seat.level);
    if (!others.has(item.key) && (!mine.has(item.key) || i > 200)) break;
  }
  const it = item!;
  seat.cur = { id: randomId(), seed, level: seat.level, issuedAt: now, cards: liveCards(it), ...(seat.level === 3 ? { kOptions: kOptions() } : {}) };
  return seat;
}
/** 學生看到的題目：原式、卡片（含干擾卡）、左欄是否固定、L3 的公因數選項。不含答案、不標示干擾卡。 */
export function itemView(seat: CrossSeat): CrossLiveItem | undefined {
  const cur = seat.cur;
  if (!cur) return undefined;
  const it = crossItem(cur.seed, cur.level);
  return {
    id: cur.id,
    level: cur.level,
    poly: { ...it.poly },
    leadLocked: it.leadLocked,
    cards: cur.cards.map((c) => ({ ...c })),
    ...(cur.kOptions ? { kOptions: [...cur.kOptions] } : {}),
  };
}

/** 送出：itemId 要是目前這一題；四格填卡片 id（左欄固定時不填左欄）；L3 另外選公因數 k。 */
export function submitCross(run: CrossRun, store: CrossStore, seatNo: number, body: Record<string, unknown>, now: number): CrossLiveResult {
  const seat = seatOf(store, run, seatNo);
  const cur = seat.cur;
  assert(cur, '這一題已經送出了，請拿下一題', 409);
  assert(typeof body.itemId === 'string' && body.itemId === cur.id, '這一題已經送出了，請拿下一題', 409);
  // 防亂猜：答錯後冷卻、每分鐘送出上限（被拒的不算一次作答）
  assert(!seat.cool || now >= seat.cool, '冷卻中，稍等一下再送出', 429);
  const hits = (seat.hits || []).filter((x) => now - x < 60_000 && x <= now);
  assert(hits.length < CROSS_PER_MINUTE, '這一分鐘送出太多次了，先想一想再送', 429);
  const raw = body.cards;
  assert(raw && typeof raw === 'object' && !Array.isArray(raw), '卡片格式不正確');
  const it = crossItem(cur.seed, cur.level);
  const picks = raw as Record<string, unknown>;
  for (const key of Object.keys(picks)) assert(['lead0', 'lead1', 'const0', 'const1'].includes(key), '卡片格式不正確');
  const used = new Set<string>();
  const fill: Partial<Record<CrossSlot, number>> = {};
  for (const slot of ['lead0', 'lead1', 'const0', 'const1'] as CrossSlot[]) {
    const id = picks[slot];
    const lead = slot.startsWith('lead');
    if (lead && it.leadLocked) {
      assert(id === undefined || id === null, '左欄已經固定是 x，不用放卡');
      continue;
    }
    assert(typeof id === 'string', '四格都要放卡片');
    const card = cur.cards.find((c) => c.id === id);
    assert(card, '這張卡片不是這一題的');
    assert(!used.has(id), '同一張卡片不能用兩次');
    assert(card.kind === (lead ? 'lead' : 'const'), lead ? 'x 係數卡只能放左欄' : '常數卡只能放右欄');
    used.add(id);
    fill[slot] = card.value;
  }
  let k = 1;
  if (cur.kOptions) {
    k = integer(body.k, -99, 99);
    assert(cur.kOptions?.includes(k), '請先選公因數');
  }
  const judge = crossJudge({ inner: it.inner, leadLocked: it.leadLocked, cards: cur.cards }, fill);
  const kOk = k === it.k;
  const ok = judge.ok && kOk;
  const ms = Math.max(0, now - cur.issuedAt);
  const before = seat.streak;
  const pts = ok ? crossPoints(cur.level, ms, before) : { base: 0, speed: 0, streak: 0, total: 0 };
  seat.attempts++;
  seat.hits = [...hits, now];
  if (ok) {
    seat.correct++;
    seat.streak++;
    seat.best = Math.max(seat.best, seat.streak);
    seat.score += pts.total;
    seat.run++;
    seat.wrong = 0;
    delete seat.cool;
  } else {
    seat.streak = 0;
    seat.run = 0;
    seat.wrong = (seat.wrong || 0) + 1;
    seat.cool = now + CROSS_COOLDOWN[Math.min(seat.wrong, CROSS_COOLDOWN.length) - 1];
  }
  let levelUp = false;
  if (ok && !run.lock && seat.run >= CROSS_LIVE_STREAK && seat.level < 3) {
    seat.level = (seat.level + 1) as CrossLevel;
    seat.run = 0;
    levelUp = true;
  }
  seat.past.push({ id: cur.id, key: it.key, level: cur.level, seed: cur.seed, ok, points: pts.total, ms, at: now });
  if (seat.past.length > 30) seat.past.shift();
  const play = crossPlayOf(store, run);
  const log = (play.log ||= []);
  log.push({ id: cur.id, seat: seatNo, n: seat.attempts, level: cur.level, seed: cur.seed, ok, points: pts.total, ms, at: now });
  if (log.length > CROSS_LOG_CAP) play.dropped = (play.dropped || 0) + log.splice(0, log.length - CROSS_LOG_CAP).length;
  seat.cur = undefined;
  // 拔河：兩隊都有人、平均分差到門檻就分出勝負
  if (!run.endedAt) {
    const w = crossMarginWinner(run, store);
    if (w) {
      run.endedAt = now;
      run.winner = w;
    }
  }
  return {
    itemId: cur.id,
    ok,
    reason: !kOk ? 'k' : judge.reason,
    products: judge.products,
    sum: judge.sum,
    target: it.inner.b,
    k: it.k,
    factored: factoredTex(it.k, it.p, it.q, it.r, it.s),
    poly: polyTex(it.poly),
    points: pts,
    score: seat.score,
    streak: seat.streak,
    level: seat.level,
    levelUp,
    ms,
    mine: crossMine(seat, run),
  };
}
/** 學生自己的統計（送出回應與推送都用這一份；前端直接指派，不自己累加）。cool＝冷卻到什麼時候。 */
export function crossMine(seat: CrossSeat | undefined, run: CrossRun) {
  return { score: seat?.score || 0, streak: seat?.streak || 0, correct: seat?.correct || 0, attempts: seat?.attempts || 0, level: seat?.level || run.level, ...(seat?.cool ? { cool: seat.cool } : {}) };
}

/** 排行榜（分數高的在前；同分看答對題數、座號）。 */
export function crossRows(run: CrossRun, store: CrossStore): CrossLiveRow[] {
  const seats = store.crossPlay?.[run.id]?.seats || {};
  return Object.entries(seats)
    .map(([seat, x]) => ({ seat: Number(seat), score: x.score, correct: x.correct, attempts: x.attempts, streak: x.streak, best: x.best, level: x.level, ...(run.teams[seat] ? { team: run.teams[seat] } : {}) }))
    .sort((a, b) => b.score - a.score || b.correct - a.correct || a.seat - b.seat);
}

/** 老師：排行、全班答對／作答數、兩隊、最近送出的題目（只有原式，因式分解要按「公布」）。學生：自己的狀態、題目、兩隊總分與名次。 */
export function crossView(stored: CrossRun, store: CrossStore, user: User, now: number): CrossLiveView {
  // 唯讀：時間到了但還沒結算（alarm／settle 還沒跑到）時，畫面先當作結束顯示，不改保存的資料
  const run: CrossRun = !stored.endedAt && crossExpired(stored, now) ? { ...stored, endedAt: stored.deadline!, winner: stored.team ? crossLeader(stored, store) : null } : stored;
  const rows = crossRows(run, store);
  const teams = run.team ? crossTeams(run, store) : undefined;
  const base = { run: { ...run, teams: { ...run.teams } }, left: crossLeft(run, now), ...(teams ? { teams } : {}) };
  if (user.role === 'teacher') {
    // 最近送出：送出紀錄的最後 8 筆；「公布」用題目 ID（不會變）
    const recent: CrossLiveView['recent'] = (store.crossPlay?.[run.id]?.log || [])
      .slice(-8)
      .reverse()
      .map((p) => ({ seat: p.seat, id: p.id, n: p.n, ok: p.ok, points: p.points, at: p.at, level: p.level, poly: polyTex(crossItem(p.seed, p.level).poly) }));
    return {
      ...base,
      rows,
      totals: { players: rows.length, correct: rows.reduce((s, r) => s + r.correct, 0), attempts: rows.reduce((s, r) => s + r.attempts, 0) },
      recent,
    };
  }
  const me = String(user.seat);
  const seat = store.crossPlay?.[run.id]?.seats[me];
  const rank = rows.findIndex((r) => String(r.seat) === me);
  const over = !!run.endedAt;
  const item = seat && !over ? itemView(seat) : undefined;
  return {
    ...base,
    mine: {
      ...(run.teams[me] ? { team: run.teams[me] } : {}),
      ...crossMine(seat, run),
      ...(rank >= 0 ? { rank: rank + 1 } : {}),
      players: rows.length,
      ...(item ? { item } : {}),
    },
  };
}
/** 老師按「公布」：某位同學送出過的某一題（用題目 ID 找，不用會位移的索引）的因式分解。 */
export function crossReveal(run: CrossRun, store: CrossStore, seatNo: number, itemId: string) {
  const play = store.crossPlay?.[run.id];
  const p = play?.log?.find((x) => x.id === itemId && x.seat === seatNo) || play?.seats[String(seatNo)]?.past.find((x) => x.id === itemId);
  if (!p) throw new HttpError(404, '找不到這一題');
  const it = crossItem(p.seed, p.level);
  return { runId: run.id, seat: seatNo, id: itemId, ok: p.ok, poly: polyTex(it.poly), factored: factoredTex(it.k, it.p, it.q, it.r, it.s) };
}
/** 暫停／繼續：暫停中不能作答；繼續時把限時與每個人目前這一題的發題時間往後移（速度分不吃暫停的時間）。 */
export function crossPause(run: CrossRun, store: CrossStore, pause: boolean, now: number) {
  if (pause) {
    run.pausedAt ??= now;
    return;
  }
  if (!run.pausedAt) return;
  const d = now - run.pausedAt;
  if (run.deadline) run.deadline += d;
  for (const x of Object.values(store.crossPlay?.[run.id]?.seats || {})) if (x.cur) x.cur.issuedAt += d;
  run.pausedAt = null;
}
/**
 * 整堂課的容量政策（開新的一場時呼叫）：每一場的逐題紀錄最多 CROSS_LOG_CAP 筆、每人最近 30 題，
 * 再加上跨場次的上限——只有最近 CROSS_KEEP_ROUNDS 場保留逐題紀錄與每人最近題目；更早的場次封存成每人總計
 * （分數、答對、作答、最高連對、等級），最多保留 CROSS_MAX_RUNS 場，再早的連場次紀錄一起刪除。
 * 這樣不論重開幾場，十字交乘佔用的容量都有上限（約 3 場 × 數百 KB），結算與送出都還存得進去。
 */
export function crossPrune(store: CrossStore) {
  const runs = store.crossRuns || [];
  if (runs.length > CROSS_MAX_RUNS)
    for (const old of runs.splice(0, runs.length - CROSS_MAX_RUNS)) delete store.crossPlay?.[old.id];
  for (const old of runs.slice(0, Math.max(0, runs.length - CROSS_KEEP_ROUNDS))) {
    const play = store.crossPlay?.[old.id];
    if (!play || play.archived) continue;
    play.dropped = (play.dropped || 0) + (play.log?.length || 0);
    delete play.log;
    for (const x of Object.values(play.seats)) {
      x.past = [];
      delete x.cur;
      delete x.hits;
      delete x.cool;
      delete x.wrong;
    }
    play.archived = true;
  }
  // 沒有場次紀錄的對戰狀態（不該有）：一起清掉
  const ids = new Set(runs.map((r) => r.id));
  for (const id of Object.keys(store.crossPlay || {})) if (!ids.has(id)) delete store.crossPlay![id];
}
/** CSV：每一次送出（每一場最多 CROSS_LOG_CAP 筆；丟掉過最舊的紀錄時，多一列說明丟了幾筆）。 */
export function crossCsvRows(store: CrossStore): (string | number)[][] {
  const rows: (string | number)[][] = [];
  for (const run of store.crossRuns || []) {
    const play = store.crossPlay?.[run.id];
    if (play?.archived) {
      // 封存的舊場次：每人一列總計（attempt 欄是作答題數）
      rows.push(['十字交乘對戰', 0, '', '', '', '', '', '', `較早的場次已封存：只保留每人總計（${play.dropped || 0} 筆逐題紀錄沒有保存）`, new Date(run.startedAt).toISOString()]);
      for (const [seat, x] of Object.entries(play.seats))
        rows.push(['十字交乘對戰', Number(seat), `L${x.level}`, x.attempts, '（總計）', `${x.correct}/${x.attempts}`, x.score, '', `最高連對 ${x.best}`, new Date(run.startedAt).toISOString()]);
      continue;
    }
    if (play?.dropped) rows.push(['十字交乘對戰', 0, '', '', '', '', '', '', `這一場超過 ${CROSS_LOG_CAP} 筆，最早的 ${play.dropped} 筆沒有保存`, new Date(run.startedAt).toISOString()]);
    for (const p of play?.log || []) {
      const team = run.teams[String(p.seat)];
      rows.push(['十字交乘對戰', p.seat, `L${p.level}`, p.n, polyTex(crossItem(p.seed, p.level).poly), p.ok ? 'Y' : 'N', p.points, '', `${team === 'red' ? '紅隊' : team === 'blue' ? '藍隊' : ''}・${Math.round(p.ms / 100) / 10} 秒`, new Date(p.at).toISOString()]);
    }
  }
  return rows;
}
/** 匯出 JSON：每一場的送出紀錄（含原式與因式分解；匯出只有老師能用）。 */
export function crossExport(store: CrossStore) {
  return Object.fromEntries(
    Object.entries(store.crossPlay || {}).map(([id, play]) => [
      id,
      {
        dropped: play.dropped || 0,
        ...(play.archived ? { archived: true, totals: Object.fromEntries(Object.entries(play.seats).map(([seat, x]) => [seat, { score: x.score, correct: x.correct, attempts: x.attempts, best: x.best, level: x.level }])) } : {}),
        log: (play.log || []).map(({ seed, ...p }) => {
          const it = crossItem(seed, p.level);
          return { ...p, poly: polyTex(it.poly), factored: factoredTex(it.k, it.p, it.q, it.r, it.s) };
        }),
      },
    ]),
  );
}

/** 拿題目的記憶體內限速（課堂:座號 → 上一次時間）；不寫入儲存，Durable Object 重啟就清空。 */
const nextHits = new Map<string, number>();
export function crossNextThrottle(key: string, now: number): boolean {
  const last = nextHits.get(key);
  if (last !== undefined && now >= last && now - last < CROSS_NEXT_GAP) return false;
  if (nextHits.size > 5000) nextHits.clear();
  nextHits.set(key, now);
  return true;
}
/** 測試用：清掉拿題目的限速。 */
export function crossThrottleReset() {
  nextHits.clear();
}
