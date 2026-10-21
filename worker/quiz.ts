// 課後形成性評量與 PK 戰：抽題、電腦對手、成績、給師生的畫面。
import type { Lesson, PkMatch, QuizBank, QuizPaper, QuizRun, QuizScore, QuizSheet, QuizView, User } from '../shared/types';
import { botScore, quizOver } from '../shared/quiz';
import { assert, identifier, integer, record } from './validation';

export interface QuizStore {
  /** 每一次測驗／PK（含已結束的），依時間先後。 */
  quizRuns?: QuizRun[];
  /** 作答：測驗 ID → 座號 → 作答。座號 0 是電腦對手（時間表在開始時就決定）。 */
  quizSheets?: Record<string, Record<string, QuizSheet>>;
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
/** 抽一份卷子：每個題位從 3 題裡抽 1 題，選項順序也打亂。全班（或這一場 PK）用同一份。 */
export function drawPaper(bank: QuizBank): QuizPaper {
  return {
    picks: bank.slots.map((slot) => {
      const variant = randomInt(slot.variants.length);
      return { variant, order: shuffle(slot.variants[variant].options.map((_, i) => i)) };
    }),
  };
}
function item(bank: QuizBank, paper: QuizPaper, q: number) {
  return bank.slots[q].variants[paper.picks[q].variant];
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
    const it = item(bank, paper, q);
    return right.has(q) ? it.answer : (it.answer + 1 + randomInt(it.options.length - 1)) % it.options.length;
  });
  return { answers, times, done: times[n - 1] };
}
export function isCorrect(bank: QuizBank, paper: QuizPaper, q: number, original: number | null): boolean | null {
  return original === null ? null : original === item(bank, paper, q).answer;
}
export function score(bank: QuizBank, run: QuizRun, sheet: QuizSheet | undefined, now: number): QuizScore {
  const answers = sheet?.answers || [];
  const answered = answers.filter((x) => x !== null).length;
  const correct = answers.filter((x, q) => isCorrect(bank, run.paper, q, x) === true).length;
  const finished = sheet?.done !== undefined || answered === bank.slots.length;
  const last = Math.max(0, ...(sheet?.times || []).filter((x): x is number => x !== null));
  return {
    answered,
    correct,
    finished,
    timeMs: sheet?.done ?? (finished ? last : quizOver(run, now) ? run.seconds * 1000 : null),
  };
}
/** 老師看得到所有人的成績與選項分布；學生只看到自己的作答，PK 時看得到各組的題數進度（不含答案）。 */
export function quizView(lesson: Lesson, store: QuizStore, run: QuizRun, user: User, now: number): QuizView | undefined {
  const bank = lesson.quiz;
  if (!bank) return undefined;
  const sheets = store.quizSheets?.[run.id] || {};
  const teacher = user.role === 'teacher',
    over = quizOver(run, now);
  const mineSheet = teacher ? undefined : sheets[String(user.seat)];
  const scores: Record<string, QuizScore> = {};
  if (teacher || run.mode === 'pk')
    for (const [seat, sheet] of Object.entries(sheets))
      scores[seat] = seat === '0' ? botScore(botTimeline(bank, run, sheet), run, now) : score(bank, run, sheet, now);
  const answeredByMe = (q: number) => mineSheet?.answers[q] !== null && mineSheet?.answers[q] !== undefined;
  const questions = bank.slots.map((slot, q) => {
    const it = item(bank, run.paper, q),
      order = run.paper.picks[q].order;
    // PK：答過就看得到對錯；全班測驗：結束後才公布
    const reveal = teacher || over || (run.mode === 'pk' && answeredByMe(q));
    return {
      topic: slot.topic,
      stem: it.stem,
      options: order.map((i) => it.options[i]),
      ...(reveal ? { answer: order.indexOf(it.answer), ...(it.explanation ? { explanation: it.explanation } : {}) } : {}),
    };
  });
  const view: QuizView = { run, title: bank.title, questions, scores };
  if (mineSheet) {
    const order = (q: number) => run.paper.picks[q].order;
    view.mine = {
      answers: mineSheet.answers.map((x, q) => (x === null ? null : order(q).indexOf(x))),
      correct: mineSheet.answers.map((x, q) => (run.mode === 'pk' || over ? isCorrect(bank, run.paper, q, x) : null)),
      ...(mineSheet.done !== undefined ? { done: mineSheet.done } : {}),
    };
  }
  if (teacher)
    view.picks = bank.slots.map((_, q) => {
      const counts = item(bank, run.paper, q).options.map(() => 0);
      for (const [seat, sheet] of Object.entries(sheets)) {
        const x = sheet.answers[q];
        if (seat !== '0' && x !== null && x !== undefined) counts[run.paper.picks[q].order.indexOf(x)]++;
      }
      return counts;
    });
  if (sheets['0']) view.bot = botTimeline(bank, run, sheets['0']);
  return view;
}
function botTimeline(bank: QuizBank, run: QuizRun, sheet: QuizSheet) {
  return { correct: sheet.answers.map((x, q) => isCorrect(bank, run.paper, q, x) === true), times: sheet.times.map((t) => t ?? Infinity) };
}
export function newMatch(a: number, b: number): PkMatch {
  return { id: crypto.randomUUID(), a, b };
}
/** 備份還原：測驗紀錄與作答（舊備份沒有就是空的）。 */
export function restoreQuiz(runsInput: unknown, sheetsInput: unknown, seats: number): QuizStore {
  if (runsInput === undefined) return {};
  assert(Array.isArray(runsInput) && runsInput.length <= 500, '測驗紀錄格式不正確');
  const ms = (v: unknown) => integer(v, 0, 8.64e15);
  const quizRuns: QuizRun[] = runsInput.map((x) => {
    const r = record(x),
      paper = record(r.paper);
    assert(Array.isArray(paper.picks) && paper.picks.length <= 20, '測驗卷格式不正確');
    return {
      id: identifier(r.id),
      mode: r.mode === 'pk' ? 'pk' : 'class',
      paper: {
        picks: paper.picks.map((p) => {
          const k = record(p);
          assert(Array.isArray(k.order) && k.order.length <= 6, '測驗卷格式不正確');
          return { variant: integer(k.variant, 0, 4), order: k.order.map((i) => integer(i, 0, 5)) };
        }),
      },
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
