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
