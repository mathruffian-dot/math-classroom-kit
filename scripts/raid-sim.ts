// 魔王戰平衡模擬：假想一班學生（程度不同、各自選題型、答題快慢不同）打很多場，看勝率與打倒魔王的時間。
// 魔王預告大招時，中等以上的學生有一半會改做防護罩題（實際上課老師也會提醒）。
// 困難魔王有分析題時（ANALYSIS＝題庫的分析題題數，預設 18＝2-2）會有護盾，假設見下方 ANA_*。
// 用法：node scripts/raid-sim.ts [人數] [秒數]
//   RUNS=400（每種難度幾場）、ONLY=hard（只跑某個難度）、HPX=1（困難魔王血量倍率，調血量用）、ANALYSIS=0（沒有分析題＝舊的困難魔王）
//   ATKPCT=50、CHARGEPCT=0（護盾期間的攻擊修正，比較候選規則用；空字串＝不修正）
//   2026-11-01 調整時的比較：for n in 25 28 30; do for s in 300 480; do ONLY=hard RUNS=600 node scripts/raid-sim.ts $n $s; done; done
import { RAID_ANALYSIS_LOCK_MS, act, advance, raidConfig, raidStart, type RaidDifficulty, type RaidKind, type RaidState } from '../shared/raid.ts';

// SEED（預設 1）：固定亂數種子，同樣的設定每次跑出一樣的結果（SEED=0＝真的隨機）
const SEED = Number(process.env.SEED ?? 1);
if (SEED) {
  let a = SEED >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const N = Number(process.argv[2] || 28);
const SECONDS = Number(process.argv[3] || 480);
const RUNS = Number(process.env.RUNS || 400);
const ANALYSIS = Number(process.env.ANALYSIS ?? 18);
const HPX = Number(process.env.HPX || 1);
// 護盾期間攻擊修正（比較候選規則用；沒設就用 raidConfig 的值）：ATKPCT＝普通攻擊剩幾 %、CHARGEPCT＝蓄力速度剩幾 %（0＝暫停）
const ATKPCT = process.env.ATKPCT;
const CHARGEPCT = process.env.CHARGEPCT;
// HPORIG=1：困難魔王用原本的血量公式（沒有分析題時的血量，28 人 8 分鐘 2970）；
// DMGPCT＝護盾期間普通傷害剩幾 %、NEED=4,5＝破盾門檻（替代方案掃描用，不是正式規則）
function tune(difficulty: RaidDifficulty, c: ReturnType<typeof raidConfig>) {
  if (difficulty !== 'hard') return c;
  if (process.env.HPORIG) c.bossHp = raidConfig('hard', N, SECONDS, 0).bossHp;
  c.bossHp = Math.round((c.bossHp * HPX) / 10) * 10;
  if (c.phase && process.env.DMGPCT) c.phase.dmgPct = Number(process.env.DMGPCT);
  if (c.phase && process.env.NEED) c.phase.need = process.env.NEED.split(',').map(Number);
  if (c.phase && ATKPCT !== undefined) {
    if (ATKPCT === '') delete c.phase.atkPct;
    else c.phase.atkPct = Number(ATKPCT);
  }
  if (c.phase && CHARGEPCT !== undefined) {
    if (CHARGEPCT === '') delete c.phase.chargePct;
    else c.phase.chargePct = Number(CHARGEPCT);
  }
  return c;
}
type Level = 'weak' | 'mid' | 'strong';
type Base = Exclude<RaidKind, 'analysis'>;
const choose: Record<Level, [Base, number][]> = {
  weak: [['attack', 0.8], ['shield', 0.2]],
  mid: [['attack', 0.3], ['shield', 0.5], ['ultimate', 0.2]],
  strong: [['attack', 0.1], ['shield', 0.2], ['ultimate', 0.7]],
};
const acc: Record<Level, Record<RaidKind, number>> = {
  // 分析題答對率（假設）：程度弱 30%、中等 50%、程度好 75%
  weak: { attack: 0.65, shield: 0.5, ultimate: 0.3, analysis: 0.3 },
  mid: { attack: 0.85, shield: 0.75, ultimate: 0.55, analysis: 0.5 },
  strong: { attack: 0.95, shield: 0.9, ultimate: 0.8, analysis: 0.75 },
};
/**
 * 分析題的選擇（假設）：護盾開啟時，程度好的 50%、中等 25%、程度弱 5% 改做分析題（這一層已經算進 2 題的人不再選）；
 * 沒有護盾時程度好的 10%、中等 5% 會做（直接傷害）。答錯鎖 20 秒（這段時間做別的題）。
 */
const ANA_ON: Record<Level, number> = { weak: Number(process.env.ANA_WEAK ?? 0.05), mid: Number(process.env.ANA_MID ?? 0.25), strong: Number(process.env.ANA_STRONG ?? 0.5) };
const ANA_OFF: Record<Level, number> = { weak: 0, mid: 0.05, strong: 0.1 };
/** 應用題「會做」的機率（不會做就換一題）。 */
const KNOW: Record<Level, number> = { weak: 0.6, mid: 0.85, strong: 1 };
// 作答時間（秒）：分析題作答時間寬裕，假設 50～100 秒（程度弱的再慢 25%）
const time: Record<RaidKind, [number, number]> = { attack: [12, 25], shield: [18, 32], ultimate: [30, 60], analysis: [50, 100] };
function pick<T>(list: [T, number][]): T {
  let r = Math.random();
  for (const [x, p] of list) if ((r -= p) <= 0) return x;
  return list[list.length - 1][0];
}
function game(difficulty: RaidDifficulty): RaidState {
  const c = raidConfig(difficulty, N, SECONDS, ANALYSIS);
  tune(difficulty, c);
  const s = raidStart(c);
  const limit = SECONDS * 1000;
  const ids = Array.from({ length: ANALYSIS }, (_, i) => `a${i}`);
  // 每個人：程度、下一次答完的時間與題型
  const people = Array.from({ length: N }, (_, i) => ({
    seat: i + 1,
    level: (i < N * 0.3 ? 'weak' : i < N * 0.75 ? 'mid' : 'strong') as Level,
    at: 0,
    kind: 'attack' as RaidKind,
    q: '',
    r: 0,
    skip: false,
    skipAt: -1e9,
    lockA: -1e9,
  }));
  // STRAT=attack／shield／ultimate：全班都只做這一類（測試極端策略）
  // 用 + 連起來＝在這幾類裡平均選（例如 attack+ultimate：都不撐防護罩）
  const only = process.env.STRAT ? (process.env.STRAT.split('+') as Base[]) : undefined;
  const plan = (p: (typeof people)[number], from: number) => {
    let kind: RaidKind = only ? only[Math.floor(Math.random() * only.length)] : pick(choose[p.level]);
    // 魔王預告大招：中等以上的同學一半、程度弱的三成改做防護罩（策略裡沒有防護罩就不改）
    if ((!only || only.includes('shield')) && s.bossUltAt !== null && Math.random() < (p.level === 'weak' ? 0.3 : 0.5)) kind = 'shield';
    else if (c.phase && !only && from >= p.lockA) {
      const capped = s.phase && (s.phase.by[String(p.seat)] || 0) >= c.phase.cap;
      if (Math.random() < (s.phase && !capped ? ANA_ON : ANA_OFF)[p.level]) kind = 'analysis';
    }
    p.kind = kind;
    // 分析題：抽一題這一輪還沒被解出、也不在別人手上的（伺服器的抽題規則）
    if (kind === 'analysis') {
      const held = new Set(people.filter((x) => x !== p && x.kind === 'analysis').map((x) => x.q));
      const open = ids.filter((id) => !(s.solved || []).includes(id));
      const free = open.filter((id) => !held.has(id));
      // 這一輪的分析題都解完了（伺服器不再發題）：改做應用題
      if (!open.length) p.kind = kind = 'ultimate';
      else {
        const list = free.length ? free : open;
        p.q = list[Math.floor(Math.random() * list.length)];
        p.r = s.round || 0; // 抽題時的輪次：開新護盾後才送出就不計入
      }
    }
    const [a, b] = time[kind];
    // 應用題不會做：想一陣子（35–50 秒）後按「換一題」（每 30 秒一次），這一題不作答
    p.skip = kind === 'ultimate' && Math.random() > KNOW[p.level] && from - p.skipAt >= 30000;
    p.at = Math.round(from + (p.skip ? 35 + Math.random() * 15 : a + Math.random() * (b - a)) * 1000 * (p.level === 'weak' ? 1.25 : 1));
    if (p.skip) p.skipAt = p.at;
  };
  for (const p of people) plan(p, 1000 + Math.random() * 4000);
  // 破盾時間：護盾開啟到破盾（phaseBreak 事件）的毫秒數
  const breakMs: number[] = [];
  let openAt = -1,
    seenBreaks = 0;
  const track = () => {
    if (s.phase) openAt = s.phase.at;
    if ((s.tally.phaseBreak || 0) > seenBreaks) {
      seenBreaks = s.tally.phaseBreak;
      const e = [...s.log].reverse().find((x) => x.k === 'phaseBreak');
      if (e && openAt >= 0) breakMs.push(e.t - openAt);
    }
  };
  while (!s.result) {
    const p = people.reduce((x, y) => (y.at < x.at ? y : x));
    if (p.at >= limit) break;
    if (p.skip) {
      plan(p, p.at + 1000);
      continue;
    }
    const ok = Math.random() < acc[p.level][p.kind];
    // 角色：程度弱的多選弓箭手（記憶題）、中等選劍士（防護罩）、程度好的選法師（大招）
    const role = p.level === 'weak' ? 'archer' : p.level === 'mid' ? 'knight' : 'mage';
    advance(c, s, p.at, SECONDS);
    track();
    act(c, s, { t: p.at, seat: p.seat, kind: p.kind, ok, role, ...(p.kind === 'analysis' ? { q: p.q, r: p.r } : {}) }, SECONDS);
    track();
    // 答錯鎖住：應用題 3 秒、分析題只鎖分析題 20 秒（馬上做別的）、其他 5 秒
    if (p.kind === 'analysis' && !ok) p.lockA = p.at + RAID_ANALYSIS_LOCK_MS;
    plan(p, p.at + (ok || p.kind === 'analysis' ? 1500 : p.kind === 'ultimate' ? 3000 : 5000));
  }
  advance(c, s, limit, SECONDS);
  track();
  return Object.assign(s, { breakMs });
}
/** 一場的護盾紀錄：開了幾層、破了幾層、每一層多久破（只看整場的計數，戰況 log 只留最近 40 筆）。 */
function phases(s: RaidState) {
  return { on: s.tally.phaseOn || 0, broke: s.tally.phaseBreak || 0 };
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : NaN);
const levels = (process.env.ONLY ? [process.env.ONLY] : ['easy', 'normal', 'hard']) as RaidDifficulty[];
for (const d of levels) {
  const runs = Array.from({ length: RUNS }, () => game(d));
  const wins = runs.filter((s) => s.result === 'win');
  const c = tune(d, raidConfig(d, N, SECONDS, ANALYSIS));
  const hp = c.bossHp;
  const pct = (k: number) => `${Math.round((k / runs.length) * 100)}%`;
  console.log(
    `${d.padEnd(6)} 魔王 ${hp} 血／英雄 ${c.teamHp} 血｜勝 ${pct(wins.length)}｜打倒平均 ${(avg(wins.map((s) => s.endAt!)) / 60000).toFixed(1)} 分｜` +
      `英雄被打光 ${pct(runs.filter((s) => s.result === 'lose').length)}、時間到 ${pct(runs.filter((s) => s.result === 'timeout').length)}｜平均時間 ${(avg(runs.map((s) => s.endAt ?? SECONDS * 1000)) / 60000).toFixed(1)} 分｜贏時英雄剩 ${Math.round(avg(wins.map((s) => s.teamHp)))} 血｜沒贏時魔王剩 ${Math.round(avg(runs.filter((s) => s.result !== 'win').map((s) => (s.bossHp / c.bossHp) * 100)))}%`,
  );
  if (c.phase) {
    const ph = runs.map(phases);
    const on = ph.reduce((p, x) => p + x.on, 0),
      broke = ph.reduce((p, x) => p + x.broke, 0);
    const bt = runs.flatMap((s) => s.breakMs);
    const mod = [c.phase.atkPct !== undefined ? `普攻 ${c.phase.atkPct}%` : '', c.phase.chargePct !== undefined ? `蓄力 ${c.phase.chargePct}%` : ''].filter(Boolean).join('、') || '無';
    console.log(
      `        護盾：期間修正 ${mod}｜門檻 ${c.phase.need.join('／')}｜第二層開啟率 ${pct(ph.filter((x) => x.on >= 2).length)}｜每場開 ${(on / runs.length).toFixed(2)} 層、破 ${(broke / runs.length).toFixed(2)} 層｜破盾成功率 ${Math.round((broke / Math.max(1, on)) * 100)}%｜平均破盾時間 ${(avg(bt) / 1000).toFixed(0)} 秒｜` +
        `分析題 答對 ${Math.round(avg(runs.map((s) => Object.values(s.stats).reduce((p, x) => p + (x.ok.analysis || 0), 0))))}／作答 ${Math.round(avg(runs.map((s) => Object.values(s.stats).reduce((p, x) => p + (x.n.analysis || 0), 0))))}、提示 ${(avg(runs.map((s) => s.tally.phaseHint || 0))).toFixed(2)}、支援 ${(avg(runs.map((s) => s.tally.phaseSupport || 0))).toFixed(2)}`,
    );
  }
  const keys = ['atk', 'atk:n', 'ult', 'ult:n', 'shield', 'wrong', 'bossAtk', 'bossBlock', 'bossUlt', 'bossUltBlock', 'bossShield:n', 'analysis:n'];
  console.log('        平均：' + keys.map((k) => `${k} ${Math.round(avg(runs.map((s) => s.tally[k] || 0)))}`).join('、'));
}
// 稱號分布（中等難度）：各程度的同學拿到第幾級
if (!process.env.ONLY) {
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
