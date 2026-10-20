import type { PracticeEntry, PracticeRun } from './types';

/** 送出時間的寬限（網路延遲）：截止後這段時間內送到的答案仍算這一輪。 */
export const PRACTICE_GRACE_MS = 2500;

export interface PracticeRound {
  round: number;
  start: number;
  deadline: number;
  outcome?: 'correct' | 'wrong' | 'timeout';
  value?: string;
}
export interface PracticeStatus {
  /** working：正在做第 round 輪；passed：答對；help：每一輪都沒過，需要老師個別指導。 */
  status: 'working' | 'passed' | 'help';
  /** 目前（或最後）一輪，從 0 起算。 */
  round: number;
  deadline: number;
  rounds: PracticeRound[];
}

/**
 * 補救練習的狀態只由「開始時間、每輪作答、現在時間」決定，伺服器與各裝置算出來都一樣：
 * 第 r 輪從上一輪結束時開始，限時 run.seconds；答對就通過，答錯（送出的時間）或逾時（截止時間）就開始下一輪。
 */
export function practiceStatus(run: PracticeRun, entry: PracticeEntry, now: number): PracticeStatus {
  const ms = run.seconds * 1000;
  const rounds: PracticeRound[] = [];
  let start = entry.start;
  for (let r = 0; r < run.rounds; r++) {
    const deadline = start + ms;
    const sub = entry.subs.find((x) => x.round === r);
    if (sub) {
      rounds.push({ round: r, start, deadline, outcome: sub.correct ? 'correct' : 'wrong', value: sub.value });
      if (sub.correct) return { status: 'passed', round: r, deadline, rounds };
      start = sub.at;
      continue;
    }
    if (now < deadline) {
      rounds.push({ round: r, start, deadline });
      return { status: 'working', round: r, deadline, rounds };
    }
    rounds.push({ round: r, start, deadline, outcome: 'timeout' });
    start = deadline;
  }
  const last = rounds[rounds.length - 1];
  return { status: 'help', round: last.round, deadline: last.deadline, rounds };
}
