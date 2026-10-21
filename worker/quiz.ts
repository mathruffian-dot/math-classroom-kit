// 課後形成性評量、PK 戰、錯題練習：抽題、電腦對手、成績、錯題紀錄、給師生的畫面。
import type { Lesson, PkMatch, QuizBank, QuizPaper, QuizRecord, QuizRun, QuizScore, QuizSheet, QuizView, User } from '../shared/types';
import { botScore, decide, quizOver } from '../shared/quiz';
import { assert, identifier, integer, record } from './validation';

export interface QuizStore {
  /** 每一次測驗／PK／錯題練習（含已結束的），依時間先後。 */
  quizRuns?: QuizRun[];
  /** 作答：測驗 ID → 座號 → 作答。座號 0 是電腦對手（時間表在開始時就決定）。 */
  quizSheets?: Record<string, Record<string, QuizSheet>>;
}
type Picks = QuizPaper['picks'];

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
function pick(bank: QuizBank, slot: number, variant: number) {
  return { variant, order: shuffle(bank.slots[slot].variants[variant].options.map((_, i) => i)) };
}
/** 抽一份卷子：每個題位從 3 題裡抽 1 題，選項順序也打亂。全班（或這一場 PK）用同一份。 */
export function drawPaper(bank: QuizBank): QuizPaper {
  return { picks: bank.slots.map((slot, q) => pick(bank, q, randomInt(slot.variants.length))) };
}
/** 這位同學在這一次的卷子：錯題練習每人不同，其他模式全班同一份。 */
export function paperFor(bank: QuizBank, run: QuizRun, seat: string | number): { picks: Picks; slots: number[] } {
  const own = run.personal?.[String(seat)];
  if (own) return own;
  // 錯題練習沒有派給這個人（沒有錯題）：沒有題目
  return { picks: run.paper.picks, slots: run.mode === 'review' ? [] : bank.slots.map((_, i) => i) };
}
function item(bank: QuizBank, picks: Picks, q: number) {
  return bank.slots[q].variants[picks[q].variant];
}
/** 電腦對手：答對 6–8 題，每題 7–13 秒（在時間內答完）。 */
export function makeBot(bank: QuizBank, paper: QuizPaper, seconds: number): QuizSheet {
  const n = bank.slots.length,
    right = new Set(shuffle(bank.slots.map((_, i) => i)).slice(0, 6 + randomInt(3)));
  let t = 0;
  const gaps = bank.slots.map(() => 7000 + randomInt(6000));
  const scale = Math.min(1, (seconds * 1000 * 0.92) / gaps.reduce((s, x) => s + x, 0));
  const times = gaps.map((g) => (t += Math.round(g * scale)));
  const answers = bank.slots.map((_, q) => {
    const it = item(bank, paper.picks, q);
    return right.has(q) ? it.answer : (it.answer + 1 + randomInt(it.options.length - 1)) % it.options.length;
  });
  return { answers, times, done: times[n - 1] };
}
export function isCorrect(bank: QuizBank, picks: Picks, q: number, original: number | null | undefined): boolean | null {
  return original === null || original === undefined ? null : original === item(bank, picks, q).answer;
}
export function score(bank: QuizBank, run: QuizRun, sheet: QuizSheet | undefined, now: number, seat: string | number): QuizScore {
  const { picks, slots } = paperFor(bank, run, seat);
  const answers = sheet?.answers || [];
  const answered = slots.filter((q) => answers[q] !== null && answers[q] !== undefined).length;
  const correct = slots.filter((q) => isCorrect(bank, picks, q, answers[q]) === true).length;
  const finished = sheet?.done !== undefined || answered === slots.length;
  const last = Math.max(0, ...(sheet?.times || []).filter((x): x is number => x !== null));
  return {
    answered,
    correct,
    finished,
    timeMs: sheet?.done ?? (finished ? last : quizOver(run, now) ? run.seconds * 1000 : null),
  };
}
/** 作答後馬上知道對錯：PK 與錯題練習。 */
export const instantFeedback = (run: QuizRun) => run.mode === 'pk' || run.mode === 'review';

/** 老師看得到所有人的成績、選項分布、每題對錯；學生只看到自己的作答，PK 時看得到各組的題數進度（不含答案）。 */
export function quizView(lesson: Lesson, store: QuizStore, run: QuizRun, user: User, now: number): QuizView | undefined {
  const bank = lesson.quiz;
  if (!bank) return undefined;
  const sheets = store.quizSheets?.[run.id] || {};
  const teacher = user.role === 'teacher',
    over = quizOver(run, now);
  const me = teacher ? '' : String(user.seat);
  const mineSheet = teacher ? undefined : sheets[me];
  const scores: Record<string, QuizScore> = {};
  if (teacher || run.mode === 'pk')
    for (const [seat, sheet] of Object.entries(sheets))
      scores[seat] = seat === '0' ? botScore(botTimeline(bank, run, sheet), run, now) : score(bank, run, sheet, now, seat);
  // 老師看全班同一份（錯題練習每人不同，老師看題位清單）；學生看自己的卷子
  const { picks, slots } = teacher ? { picks: run.paper.picks, slots: bank.slots.map((_, i) => i) } : paperFor(bank, run, me);
  const answeredByMe = (q: number) => mineSheet?.answers[q] !== null && mineSheet?.answers[q] !== undefined;
  const questions = slots.map((q) => {
    const it = item(bank, picks, q),
      order = picks[q].order;
    // PK、錯題練習：答過就看得到對錯；全班測驗：結束後才公布
    const reveal = teacher || over || (instantFeedback(run) && answeredByMe(q));
    return {
      slot: q,
      topic: bank.slots[q].topic,
      stem: it.stem,
      options: order.map((i) => it.options[i]),
      ...(reveal ? { answer: order.indexOf(it.answer), ...(it.explanation ? { explanation: it.explanation } : {}) } : {}),
    };
  });
  const view: QuizView = { run: teacher ? run : { ...run, personal: undefined }, title: bank.title, questions, scores };
  if (mineSheet || (!teacher && run.mode === 'review')) {
    const answers = mineSheet?.answers || [];
    view.mine = {
      answers: slots.map((q) => (answers[q] === null || answers[q] === undefined ? null : picks[q].order.indexOf(answers[q]!))),
      correct: slots.map((q) => (instantFeedback(run) || over ? isCorrect(bank, picks, q, answers[q]) : null)),
      ...(mineSheet?.done !== undefined ? { done: mineSheet.done } : {}),
    };
  }
  if (teacher) {
    if (run.mode !== 'review')
      view.picks = bank.slots.map((_, q) => {
        const counts = item(bank, run.paper.picks, q).options.map(() => 0);
        for (const [seat, sheet] of Object.entries(sheets)) {
          const x = sheet.answers[q];
          if (seat !== '0' && x !== null && x !== undefined) counts[run.paper.picks[q].order.indexOf(x)]++;
        }
        return counts;
      });
    view.detail = Object.fromEntries(
      Object.entries(sheets).map(([seat, sheet]) => {
        const own = paperFor(bank, run, seat);
        return [seat, bank.slots.map((_, q) => (own.slots.includes(q) ? isCorrect(bank, own.picks, q, sheet.answers[q]) : null))];
      }),
    );
  }
  if (sheets['0']) view.bot = botTimeline(bank, run, sheets['0']);
  return view;
}
function botTimeline(bank: QuizBank, run: QuizRun, sheet: QuizSheet) {
  return { correct: sheet.answers.map((x, q) => isCorrect(bank, run.paper.picks, q, x) === true), times: sheet.times.map((t) => t ?? Infinity) };
}
export function newMatch(a: number, b: number): PkMatch {
  return { id: crypto.randomUUID(), a, b };
}

/**
 * 錯題紀錄：依時間先後看每個人每個題型「最近一次」的結果；錯的、或那一次有作答卻沒做到的題位算錯題。
 * 之後做對了（例如錯題練習答對）就拿掉。只算已經結束（或已交卷）的那幾次。
 */
export function quizRecord(bank: QuizBank, store: QuizStore, now: number): QuizRecord {
  const latest: Record<string, (boolean | undefined)[]> = {};
  // 依建立的先後（PK 的開始時間含 3 秒倒數，不能拿來排序）
  const runs = store.quizRuns || [];
  for (const run of runs) {
    const sheets = store.quizSheets?.[run.id] || {},
      over = quizOver(run, now);
    for (const [seat, sheet] of Object.entries(sheets)) {
      if (seat === '0' || (!over && sheet.done === undefined)) continue;
      if (!sheet.answers.some((x) => x !== null)) continue;
      const { picks, slots } = paperFor(bank, run, seat);
      const row = (latest[seat] ||= bank.slots.map(() => undefined));
      for (const q of slots) row[q] = isCorrect(bank, picks, q, sheet.answers[q]) === true;
    }
  }
  const wrong: QuizRecord['wrong'] = {};
  for (const [seat, row] of Object.entries(latest)) {
    const list = row.flatMap((ok, q) => (ok === false ? [q] : []));
    if (list.length) wrong[seat] = list;
  }
  // PK 戰績：每一場已比完的對戰
  const standings: QuizRecord['standings'] = {};
  const tally = (seat: number, k: 'win' | 'lose' | 'draw') => {
    if (seat === 0) return;
    (standings[String(seat)] ||= { win: 0, lose: 0, draw: 0 })[k]++;
  };
  for (const run of runs) {
    if (run.mode !== 'pk' || !run.matches) continue;
    const sheets = store.quizSheets?.[run.id] || {};
    const sc = (seat: number) =>
      seat === 0 && sheets['0'] ? botScore(botTimeline(bank, run, sheets['0']), run, now) : score(bank, run, sheets[String(seat)], now, seat);
    for (const m of run.matches) {
      const a = sc(m.a),
        b = sc(m.b);
      if (!quizOver(run, now) && !(a.finished && b.finished)) continue;
      const r = decide(a, b);
      tally(m.a, r === 'draw' ? 'draw' : r === 'a' ? 'win' : 'lose');
      tally(m.b, r === 'draw' ? 'draw' : r === 'b' ? 'win' : 'lose');
    }
  }
  return { topics: bank.slots.map((s) => s.topic), wrong, standings, runs: runs.length };
}
/** 錯題練習的卷子：每人只做自己的錯題題位，盡量換成這個人還沒看過的那一題（同類型換數字）。 */
export function drawReview(bank: QuizBank, store: QuizStore, wrong: Record<string, number[]>): QuizRun['personal'] {
  const seen: Record<string, Set<string>> = {};
  for (const run of store.quizRuns || [])
    for (const seat of Object.keys(store.quizSheets?.[run.id] || {})) {
      const { picks, slots } = paperFor(bank, run, seat);
      for (const q of slots) (seen[seat] ||= new Set()).add(`${q}:${picks[q].variant}`);
    }
  const personal: NonNullable<QuizRun['personal']> = {};
  for (const [seat, slots] of Object.entries(wrong)) {
    const picks = bank.slots.map((_, q) => {
      if (!slots.includes(q)) return { variant: 0, order: bank.slots[q].variants[0].options.map((__, i) => i) };
      const fresh = bank.slots[q].variants.map((_, v) => v).filter((v) => !seen[seat]?.has(`${q}:${v}`));
      const pool = fresh.length ? fresh : bank.slots[q].variants.map((_, v) => v);
      return pick(bank, q, pool[randomInt(pool.length)]);
    });
    personal[seat] = { picks, slots: [...slots] };
  }
  return personal;
}

/** 備份還原：測驗紀錄與作答（舊備份沒有就是空的）。 */
export function restoreQuiz(runsInput: unknown, sheetsInput: unknown, seats: number): QuizStore {
  if (runsInput === undefined) return {};
  assert(Array.isArray(runsInput) && runsInput.length <= 500, '測驗紀錄格式不正確');
  const ms = (v: unknown) => integer(v, 0, 8.64e15);
  const picksOf = (input: unknown): Picks => {
    assert(Array.isArray(input) && input.length <= 20, '測驗卷格式不正確');
    return input.map((p) => {
      const k = record(p);
      assert(Array.isArray(k.order) && k.order.length <= 6, '測驗卷格式不正確');
      return { variant: integer(k.variant, 0, 4), order: k.order.map((i) => integer(i, 0, 5)) };
    });
  };
  const quizRuns: QuizRun[] = runsInput.map((x) => {
    const r = record(x);
    const personal = r.personal === undefined ? undefined : record(r.personal);
    return {
      id: identifier(r.id),
      mode: r.mode === 'pk' ? 'pk' : r.mode === 'review' ? 'review' : 'class',
      paper: { picks: picksOf(record(r.paper).picks) },
      ...(personal
        ? {
            personal: Object.fromEntries(
              Object.entries(personal).map(([seat, v]) => {
                const own = record(v);
                assert(Array.isArray(own.slots) && own.slots.length <= 20, '錯題練習格式不正確');
                return [String(integer(Number(seat), 1, seats)), { picks: picksOf(own.picks), slots: own.slots.map((q) => integer(q, 0, 19)) }];
              }),
            ),
          }
        : {}),
      startedAt: ms(r.startedAt),
      seconds: integer(r.seconds, 1, 3600),
      ...(r.endedAt !== undefined ? { endedAt: ms(r.endedAt) } : {}),
      ...(Array.isArray(r.matches)
        ? { matches: r.matches.slice(0, 100).map((m) => ({ id: identifier(record(m).id), a: integer(record(m).a, 0, seats), b: integer(record(m).b, 0, seats) })) }
        : {}),
    };
  });
  const quizSheets: NonNullable<QuizStore['quizSheets']> = {};
  for (const [runId, bySeat] of Object.entries(record(sheetsInput ?? {}))) {
    assert(quizRuns.some((r) => r.id === runId), '作答紀錄對不到測驗');
    quizSheets[runId] = {};
    for (const [seat, raw] of Object.entries(record(bySeat))) {
      const sh = record(raw);
      assert(Array.isArray(sh.answers) && Array.isArray(sh.times) && sh.answers.length <= 20 && sh.times.length <= 20, '作答紀錄格式不正確');
      quizSheets[runId][String(integer(Number(seat), 0, seats))] = {
        answers: sh.answers.map((a) => (a === null ? null : integer(a, 0, 5))),
        times: sh.times.map((a) => (a === null ? null : ms(a))),
        ...(sh.done !== undefined ? { done: ms(sh.done) } : {}),
      };
    }
  }
  return { quizRuns, quizSheets };
}
