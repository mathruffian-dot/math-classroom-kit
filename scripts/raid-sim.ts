// 魔王戰平衡模擬：假想一班學生（程度不同、各自選題型、答題快慢不同）打很多場，看勝率與打倒魔王的時間。
// 魔王預告大招時，中等以上的學生有一半會改做防護罩題（實際上課老師也會提醒）。
// 用法：node scripts/raid-sim.ts [人數] [秒數]
import { act, advance, raidConfig, raidStart, type RaidDifficulty, type RaidKind, type RaidState } from '../shared/raid.ts';

const N = Number(process.argv[2] || 28);
const SECONDS = Number(process.argv[3] || 480);
type Level = 'weak' | 'mid' | 'strong';
const choose: Record<Level, [RaidKind, number][]> = {
  weak: [['attack', 0.8], ['shield', 0.2]],
  mid: [['attack', 0.3], ['shield', 0.5], ['ultimate', 0.2]],
  strong: [['attack', 0.1], ['shield', 0.2], ['ultimate', 0.7]],
};
const acc: Record<Level, Record<RaidKind, number>> = {
  weak: { attack: 0.65, shield: 0.5, ultimate: 0.3 },
  mid: { attack: 0.85, shield: 0.75, ultimate: 0.55 },
  strong: { attack: 0.95, shield: 0.9, ultimate: 0.8 },
};
/** 應用題「會做」的機率（不會做就換一題）。 */
const KNOW: Record<Level, number> = { weak: 0.6, mid: 0.85, strong: 1 };
const time: Record<RaidKind, [number, number]> = { attack: [12, 25], shield: [18, 32], ultimate: [30, 60] };
function pick<T>(list: [T, number][]): T {
  let r = Math.random();
  for (const [x, p] of list) if ((r -= p) <= 0) return x;
  return list[list.length - 1][0];
}
function game(difficulty: RaidDifficulty): RaidState {
  const c = raidConfig(difficulty, N, SECONDS);
  const s = raidStart(c);
  const limit = SECONDS * 1000;
  // 每個人：程度、下一次答完的時間與題型
  const people = Array.from({ length: N }, (_, i) => ({
    seat: i + 1,
    level: (i < N * 0.3 ? 'weak' : i < N * 0.75 ? 'mid' : 'strong') as Level,
    at: 0,
    kind: 'attack' as RaidKind,
    skip: false,
    skipAt: -1e9,
  }));
  // STRAT=attack／shield／ultimate：全班都只做這一類（測試極端策略）
  // 用 + 連起來＝在這幾類裡平均選（例如 attack+ultimate：都不撐防護罩）
  const only = process.env.STRAT ? (process.env.STRAT.split('+') as RaidKind[]) : undefined;
  const plan = (p: (typeof people)[number], from: number) => {
    let kind = only ? only[Math.floor(Math.random() * only.length)] : pick(choose[p.level]);
    // 魔王預告大招：中等以上的同學一半改做防護罩
    // 魔王預告大招：中等以上的同學一半、程度弱的三成改做防護罩（策略裡沒有防護罩就不改）
    if ((!only || only.includes('shield')) && s.bossUltAt !== null && Math.random() < (p.level === 'weak' ? 0.3 : 0.5)) kind = 'shield';
    const [a, b] = time[kind];
    p.kind = kind;
    // 應用題不會做：想一陣子（35–50 秒）後按「換一題」（每 30 秒一次），這一題不作答
    p.skip = kind === 'ultimate' && Math.random() > KNOW[p.level] && from - p.skipAt >= 30000;
    p.at = Math.round(from + (p.skip ? 35 + Math.random() * 15 : a + Math.random() * (b - a)) * 1000 * (p.level === 'weak' ? 1.25 : 1));
    if (p.skip) p.skipAt = p.at;
  };
  for (const p of people) plan(p, 1000 + Math.random() * 4000);
  while (!s.result) {
    const p = people.reduce((x, y) => (y.at < x.at ? y : x));
    if (p.at >= limit) break;
    if (p.skip) {
      plan(p, p.at + 1000);
      continue;
    }
    const ok = Math.random() < acc[p.level][p.kind];
    act(c, s, { t: p.at, seat: p.seat, kind: p.kind, ok }, SECONDS);
    // 答錯鎖住：應用題 3 秒、其他 5 秒
    plan(p, p.at + (ok ? 1500 : p.kind === 'ultimate' ? 3000 : 5000));
  }
  return advance(c, s, limit, SECONDS);
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : NaN);
for (const d of ['easy', 'normal', 'hard'] as RaidDifficulty[]) {
  const runs = Array.from({ length: 400 }, () => game(d));
  const wins = runs.filter((s) => s.result === 'win');
  const c = raidConfig(d, N, SECONDS);
  console.log(
    `${d.padEnd(6)} 魔王 ${c.bossHp} 血／英雄 ${c.teamHp} 血｜勝 ${Math.round((wins.length / runs.length) * 100)}%｜打倒平均 ${(avg(wins.map((s) => s.endAt!)) / 60000).toFixed(1)} 分｜` +
      `輸 ${runs.filter((s) => s.result === 'lose').length}、時間到 ${runs.filter((s) => s.result === 'timeout').length}｜贏時英雄剩 ${Math.round(avg(wins.map((s) => s.teamHp)))} 血｜沒贏時魔王剩 ${Math.round(avg(runs.filter((s) => s.result !== 'win').map((s) => (s.bossHp / c.bossHp) * 100)))}%`,
  );
  const keys = ['atk', 'atk:n', 'ult', 'ult:n', 'shield', 'wrong', 'bossAtk', 'bossBlock', 'bossUlt', 'bossUltBlock', 'bossShield:n'];
  console.log('        平均：' + keys.map((k) => `${k} ${Math.round(avg(runs.map((s) => s.tally[k] || 0)))}`).join('、'));
}
// 稱號分布（中等難度）：各程度的同學拿到第幾級
{
  const { raidLevel } = await import('../shared/raid.ts');
  const hist: Record<string, number[]> = { weak: Array(10).fill(0), mid: Array(10).fill(0), strong: Array(10).fill(0) };
  for (let i = 0; i < 200; i++) {
    const s = game('normal');
    const minutes = (s.endAt ?? SECONDS * 1000) / 60000;
    for (const [seat, x] of Object.entries(s.stats)) {
      const level = Number(seat) <= N * 0.3 ? 'weak' : Number(seat) <= N * 0.75 ? 'mid' : 'strong';
      hist[level][raidLevel(x, minutes)]++;
    }
  }
  for (const [k, h] of Object.entries(hist)) console.log(`稱號 ${k.padEnd(6)}：` + h.slice(1).map((x, i) => `Lv${i + 1} ${Math.round((x / h.reduce((p, q) => p + q, 0)) * 100)}%`).join(' '));
}
