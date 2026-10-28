// 根式步驟格鬥（伺服器）：分隊、出題、判斷每一步的規則與填法、提示、戰況與結算。戰況規則在 shared/duel.ts（各裝置共用）。
import duelCatalog from '../content/duels.generated.json';
import type { DuelResult, DuelRun, DuelSeat, DuelView, User } from '../shared/types';
import { DUEL_HINT_AFTER, DUEL_TEAMS, duelFill, duelReplay, type DuelAction, type DuelBank, type DuelProblem, type DuelState, type DuelTeam } from '../shared/duel';
import { assert, identifier, integer, record } from './validation';

export interface DuelStore {
  /** 每一場步驟格鬥（含已結束的）。 */
  duelRuns?: DuelRun[];
  /** 場次 ID → 動作（依時間先後）與每個座號的狀態。 */
  duelPlay?: Record<string, { actions: DuelAction[]; seats: Record<string, DuelSeat> }>;
}

const BANKS = (duelCatalog as unknown as { banks: Record<string, DuelBank> }).banks;
export function duelBank(lessonId: string): DuelBank | undefined {
  return BANKS[lessonId];
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
export const duelSize = (run: DuelRun): Record<DuelTeam, number> => {
  const size = { red: 0, blue: 0 };
  for (const t of Object.values(run.teams)) size[t]++;
  return size;
};
export function duelElapsed(run: DuelRun, now: number) {
  return Math.min(now, run.endedAt ?? Infinity) - run.startedAt;
}
export function duelState(run: DuelRun, store: DuelStore, now: number): DuelState {
  return duelReplay(store.duelPlay?.[run.id]?.actions || [], duelSize(run), run.seconds, Math.max(0, duelElapsed(run, now)));
}
export function duelOver(run: DuelRun, state: DuelState) {
  return !!run.endedAt || !!state.result;
}
/**
 * 分隊：依程度由高到低蛇形排（紅、藍、藍、紅、紅、藍…），兩隊程度平均。
 * level 是 0–1 的程度（沒有紀錄當 0.5）。
 */
export function duelTeams(seats: number[], level: (seat: number) => number): Record<string, DuelTeam> {
  const sorted = shuffle(seats).sort((a, b) => level(b) - level(a));
  const out: Record<string, DuelTeam> = {};
  sorted.forEach((seat, i) => (out[String(seat)] = i % 4 === 0 || i % 4 === 3 ? 'red' : 'blue'));
  return out;
}
/** 之後才加入：分到人少的一隊（一樣多就隨機）。 */
export function duelJoin(run: DuelRun, seat: number): DuelTeam {
  const key = String(seat);
  if (!run.teams[key]) {
    const n = duelSize(run);
    run.teams[key] = n.red === n.blue ? DUEL_TEAMS[randomInt(2)] : n.red < n.blue ? 'red' : 'blue';
  }
  return run.teams[key];
}

/** 下一題：題型依序輪流（由淺到深），同題型裡挑這個人還沒做過的。 */
function nextProblem(bank: DuelBank, seat: DuelSeat): DuelProblem {
  const families = [...new Set(bank.problems.map((p) => p.family))];
  const family = families[seat.done.length % families.length];
  let pool = bank.problems.filter((p) => p.family === family && !seat.done.includes(p.id));
  if (!pool.length) pool = bank.problems.filter((p) => p.family === family);
  return pool[randomInt(pool.length)];
}
function setStep(bank: DuelBank, seat: DuelSeat, p: DuelProblem, step: number) {
  const st = p.steps[step];
  // 規則選項：正確的規則＋這一堂其他 3 個規則，順序打亂
  const others = shuffle(bank.rules.filter((r) => r !== st.rule)).slice(0, 3);
  seat.cur = { id: p.id, step, phase: 'rule', wrong: 0, rules: shuffle([st.rule, ...others]), tiles: shuffle(st.tiles) };
}
export function startProblem(bank: DuelBank, seat: DuelSeat) {
  const p = nextProblem(bank, seat);
  seat.vals = [];
  setStep(bank, seat, p, 0);
  return p;
}
const findProblem = (bank: DuelBank, id: string) => bank.problems.find((p) => p.id === id);

/** 學生的題目畫面：已完成的步驟、目前這一小步（規則選項或算式與數字卡）、提示。不含答案。 */
export function problemView(bank: DuelBank, seat: DuelSeat): NonNullable<NonNullable<DuelView['mine']>['problem']> | undefined {
  const cur = seat.cur;
  const p = cur && findProblem(bank, cur.id);
  if (!cur || !p) return undefined;
  const st = p.steps[cur.step];
  const hint = cur.wrong >= DUEL_HINT_AFTER ? (cur.phase === 'rule' ? st.rule : st.fill[0][0]) : undefined;
  return {
    id: p.id,
    family: p.family,
    start: p.start,
    total: p.steps.length,
    step: cur.step,
    phase: cur.phase,
    done: seat.vals.map((v, i) => ({ rule: p.steps[i].rule, line: duelFill(p.steps[i].line, v) })),
    ...(cur.phase === 'rule' ? { rules: cur.rules } : { rule: st.rule, line: st.line, tiles: cur.tiles }),
    wrong: cur.wrong,
    ...(hint ? { hint } : {}),
  };
}

/** 作答：選規則（choice＝第幾個選項）或填算式（values＝每一格的數字）。 */
export function answerDuel(bank: DuelBank, run: DuelRun, store: DuelStore, seatNo: number, body: { phase?: unknown; choice?: unknown; values?: unknown }, now: number) {
  const play = ((store.duelPlay ||= {})[run.id] ||= { actions: [], seats: {} });
  const seat = (play.seats[String(seatNo)] ||= { vals: [], done: [] });
  const cur = seat.cur;
  assert(cur, '請先拿題目', 409);
  const p = findProblem(bank, cur.id);
  assert(p, '這一題已經不在題庫裡', 409);
  assert(body.phase === cur.phase, cur.phase === 'rule' ? '請先選這一步的規則' : '請填這一步的算式', 409);
  const st = p.steps[cur.step];
  let ok: boolean;
  let values: string[] = [];
  if (cur.phase === 'rule') ok = cur.rules[integer(body.choice, 0, cur.rules.length - 1)] === st.rule;
  else {
    assert(Array.isArray(body.values) && body.values.length === st.fill[0].length, '每一格都要填');
    values = body.values.map((v) => String(v).slice(0, 12));
    assert(values.every((v) => st.tiles.includes(v)), '請用數字卡填');
    ok = st.fill.some((f) => f.every((x, i) => x === values[i]));
  }
  const team = duelJoin(run, seatNo);
  const hint = ok && cur.wrong >= DUEL_HINT_AFTER;
  const final = ok && cur.phase === 'fill' && cur.step === p.steps.length - 1;
  const w = duelSize(run)[team];
  play.actions.push({ t: Math.max(0, duelElapsed(run, now)), seat: seatNo, team, phase: cur.phase, rule: st.rule, ok, ...(hint ? { hint } : {}), ...(final ? { final } : {}), w });
  const phase = cur.phase;
  if (!ok) cur.wrong++;
  else if (phase === 'rule') {
    cur.phase = 'fill';
    cur.wrong = 0;
  } else {
    seat.vals.push(values);
    if (final) {
      seat.done.push(p.id);
      seat.cur = undefined;
    } else setStep(bank, seat, p, cur.step + 1);
  }
  return {
    ok,
    phase,
    final,
    // 完成的這一行（答對才有），以及答錯兩次後的提示
    ...(ok && phase === 'fill' ? { line: duelFill(st.line, values) } : {}),
    ...(final ? { solved: seat.done.length } : {}),
  };
}

/** 結算：每個人的傷害、完成題數、第一次就對的比例與特別稱號。 */
export function duelResults(run: DuelRun, state: DuelState): DuelResult[] {
  const list = Object.entries(state.stats).map(([seat, x]) => ({
    seat: Number(seat),
    team: run.teams[seat] ?? x.team,
    damage: x.damage,
    finished: x.finished,
    steps: x.steps,
    wrong: x.wrong,
    hints: x.hints,
    acc: x.steps + x.wrong ? Math.round((x.first / (x.steps + x.wrong)) * 100) : 0,
    badges: [] as string[],
  }));
  const top = (key: 'damage' | 'finished' | 'acc', name: string, min = 1) => {
    const pool = key === 'acc' ? list.filter((r) => r.steps >= 8) : list;
    const best = Math.max(0, ...pool.map((r) => r[key]));
    if (best >= min) for (const r of pool) if (r[key] === best) r.badges.push(name);
  };
  top('damage', '最強攻擊手');
  top('finished', '終結者');
  top('acc', '步步精準', 60);
  return list.sort((a, b) => b.damage - a.damage || a.seat - b.seat);
}
/** 老師：全班各規則的正確率（低的在前）。 */
export function duelWeak(state: DuelState) {
  const by: Record<string, { ok: number; n: number }> = {};
  for (const x of Object.values(state.stats))
    for (const [rule, r] of Object.entries(x.byRule)) {
      const t = (by[rule] ||= { ok: 0, n: 0 });
      t.ok += r.ok;
      t.n += r.n;
    }
  return Object.entries(by)
    .map(([rule, r]) => ({ rule, ...r }))
    .sort((a, b) => a.ok / a.n - b.ok / b.n || b.n - a.n);
}

/** 老師看全部；學生看得到戰況與自己的題目，結束後只看到自己的結算。 */
export function duelView(bank: DuelBank, run: DuelRun, store: DuelStore, user: User, now: number): DuelView {
  const state = duelState(run, store, now);
  const over = duelOver(run, state);
  const size = duelSize(run);
  const base = { run, title: bank.title, size };
  if (user.role === 'teacher')
    return { ...base, state, weak: duelWeak(state), ...(over ? { results: duelResults(run, state) } : {}) };
  const me = String(user.seat);
  const seat = store.duelPlay?.[run.id]?.seats[me];
  const { stats, ...rest } = state;
  const mine: NonNullable<DuelView['mine']> = {};
  if (run.teams[me]) mine.team = run.teams[me];
  const pv = seat && !over ? problemView(bank, seat) : undefined;
  if (pv) mine.problem = pv;
  return {
    ...base,
    state: { ...rest, log: rest.log.slice(-12), stats: stats[me] ? { [me]: stats[me] } : {} },
    mine,
    ...(over ? { results: duelResults(run, state).filter((r) => String(r.seat) === me) } : {}),
  };
}

/** CSV：每一次作答。 */
export function duelCsvRows(store: DuelStore): (string | number)[][] {
  const rows: (string | number)[][] = [];
  for (const run of store.duelRuns || []) {
    for (const a of store.duelPlay?.[run.id]?.actions || [])
      rows.push(['步驟格鬥', a.seat, a.rule, a.phase === 'rule' ? '選規則' : '填算式', a.team === 'red' ? '紅隊' : '藍隊', a.ok ? 'Y' : 'N', a.final ? '最後一擊' : '', '', a.hint ? '看過提示' : '', new Date(run.startedAt + a.t).toISOString()]);
  }
  return rows;
}

/** 備份還原（舊備份沒有就是空的）。 */
export function restoreDuel(runsInput: unknown, playInput: unknown, seats: number): DuelStore {
  if (runsInput === undefined) return {};
  assert(Array.isArray(runsInput) && runsInput.length <= 200, '步驟格鬥紀錄格式不正確');
  const ms = (v: unknown) => integer(v, 0, 8.64e15);
  const team = (v: unknown): DuelTeam => (v === 'blue' ? 'blue' : 'red');
  const duelRuns: DuelRun[] = runsInput.map((x) => {
    const r = record(x);
    return {
      id: identifier(r.id),
      startedAt: ms(r.startedAt),
      seconds: integer(r.seconds, 60, 3600),
      ...(r.endedAt !== undefined ? { endedAt: ms(r.endedAt) } : {}),
      teams: Object.fromEntries(Object.entries(record(r.teams ?? {})).map(([k, v]) => [String(integer(Number(k), 1, seats)), team(v)])),
    };
  });
  const duelPlay: NonNullable<DuelStore['duelPlay']> = {};
  for (const [runId, raw] of Object.entries(record(playInput ?? {}))) {
    assert(duelRuns.some((r) => r.id === runId), '步驟格鬥作答對不到場次');
    const p = record(raw);
    assert(Array.isArray(p.actions) && p.actions.length <= 50000, '步驟格鬥作答格式不正確');
    const actions = p.actions.map((x) => {
      const a = record(x);
      return {
        t: ms(a.t),
        seat: integer(a.seat, 1, seats),
        team: team(a.team),
        phase: (a.phase === 'fill' ? 'fill' : 'rule') as DuelAction['phase'],
        rule: String(a.rule ?? '').slice(0, 20),
        ok: a.ok === true,
        ...(a.hint === true ? { hint: true } : {}),
        ...(a.final === true ? { final: true } : {}),
        ...(a.w !== undefined ? { w: integer(a.w, 1, 100) } : {}),
      };
    });
    const seatsOut: Record<string, DuelSeat> = {};
    for (const [seat, s] of Object.entries(record(p.seats ?? {}))) {
      const v = record(s);
      seatsOut[String(integer(Number(seat), 1, seats))] = { vals: [], done: Array.isArray(v.done) ? v.done.slice(0, 2000).map((id) => String(id).slice(0, 80)) : [] };
    }
    duelPlay[runId] = { actions, seats: seatsOut };
  }
  return { duelRuns, duelPlay };
}
