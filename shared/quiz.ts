import type { QuizRun, QuizScore } from './types';

/** 截止後的寬限（網路延遲）：這段時間內送到的答案仍算數。 */
export const QUIZ_GRACE_MS = 2500;
/** PK 開始前的倒數。 */
export const PK_COUNTDOWN_MS = 3000;

export function quizDeadline(run: QuizRun): number {
  return run.startedAt + run.seconds * 1000;
}
/** 時間到或老師按了結束。 */
export function quizOver(run: QuizRun, now: number): boolean {
  return !!run.endedAt || now >= quizDeadline(run);
}
/**
 * 電腦對手的成績：作答時間表在開始時就決定好，伺服器和各裝置用同一份算出一樣的進度。
 */
export function botScore(bot: { correct: boolean[]; times: number[] }, run: QuizRun, now: number): QuizScore {
  const elapsed = Math.min(now, run.endedAt ?? Infinity) - run.startedAt;
  let answered = 0,
    correct = 0;
  bot.times.forEach((t, i) => {
    if (t <= elapsed) {
      answered++;
      if (bot.correct[i]) correct++;
    }
  });
  const finished = answered === bot.times.length;
  return {
    answered,
    correct,
    finished,
    timeMs: finished ? bot.times[bot.times.length - 1] : quizOver(run, now) ? run.seconds * 1000 : null,
  };
}
/** 勝負：答對題數多的贏；一樣多時用時少的贏；都一樣就平手。 */
export function decide(a: QuizScore, b: QuizScore): 'a' | 'b' | 'draw' {
  if (a.correct !== b.correct) return a.correct > b.correct ? 'a' : 'b';
  const ta = a.timeMs ?? Infinity,
    tb = b.timeMs ?? Infinity;
  if (ta !== tb) return ta < tb ? 'a' : 'b';
  return 'draw';
}
/** 這一組比完了嗎：兩人都交卷，或時間到。 */
export function matchOver(run: QuizRun, a: QuizScore, b: QuizScore, now: number): boolean {
  return quizOver(run, now) || (a.finished && b.finished);
}

/** 信心下注的分數：有把握答對 +3、答錯 −2；不太確定答對 +1、答錯 0（沒選當作不太確定）。 */
export const BET_POINTS = { sure: { right: 3, wrong: -2 }, unsure: { right: 1, wrong: 0 } } as const;
export interface BetSummary {
  points: number;
  sure: { right: number; total: number };
  unsure: { right: number; total: number };
  /** 給學生的校準回饋：把握和實際對錯對得上嗎。 */
  tip: string;
}
export function betSummary(correct: (boolean | null)[], conf: (number | null)[] | undefined): BetSummary {
  const sure = { right: 0, total: 0 },
    unsure = { right: 0, total: 0 };
  let points = 0;
  correct.forEach((ok, i) => {
    if (ok === null) return;
    const s = conf?.[i] === 1;
    const g = s ? sure : unsure;
    g.total++;
    if (ok) g.right++;
    const p = s ? BET_POINTS.sure : BET_POINTS.unsure;
    points += ok ? p.right : p.wrong;
  });
  const rate = (g: { right: number; total: number }) => (g.total ? g.right / g.total : 0);
  let tip = '';
  if (sure.total >= 3 && rate(sure) < 0.7) tip = '有把握的題目錯了不少：下次按「有把握」之前，再檢查一次算式。';
  else if (unsure.total >= 3 && rate(unsure) >= 0.7) tip = '不太確定的題目大多答對了：你比自己想的更厲害，可以多相信自己！';
  else if (sure.total >= 3 && rate(sure) >= 0.9) tip = '你的把握很準：知道自己會什麼、不會什麼，這是很重要的能力。';
  else if (sure.total + unsure.total) tip = '把握和結果大致對得上，繼續保持。';
  return { points, sure, unsure, tip };
}
