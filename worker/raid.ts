// 魔王戰（伺服器）：開戰、抽題、判斷對錯、戰況與結算。戰況規則在 shared/raid.ts（各裝置共用）。
import raidCatalog from '../content/raids.generated.json';
import type { RaidBank, RaidItem, RaidResult, RaidRun, RaidSeat, RaidView, User } from '../shared/types';
import {
  RAID_KINDS,
  RAID_LOCK_MS,
  RAID_LOCK_ULT_MS,
  RAID_SKIP_COOLDOWN_MS,
  RAID_TITLES,
  raidBadges,
  raidLevel,
  raidReplay,
  type RaidAction,
  type RaidKind,
  type RaidState,
} from '../shared/raid';
import { assert, identifier, integer, record } from './validation';

export interface RaidStore {
  /** 每一場魔王戰（含已結束的）。 */
  raidRuns?: RaidRun[];
  /** 場次 ID → 作答（依時間先後）與每個座號的狀態。 */
  raidPlay?: Record<string, { actions: RaidAction[]; seats: Record<string, RaidSeat> }>;
}

const BANKS = (raidCatalog as unknown as { banks: Record<string, RaidBank> }).banks;
/** 這一課有沒有魔王戰題庫（依課程 ID）。 */
export function raidBank(lessonId: string): RaidBank | undefined {
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
/** 開始後第幾毫秒（結束後停在結束時間）。 */
export function raidElapsed(run: RaidRun, now: number): number {
  return Math.min(now, run.endedAt ?? Infinity) - run.startedAt;
}
export function raidState(run: RaidRun, store: RaidStore, now: number): RaidState {
  const play = store.raidPlay?.[run.id];
  return raidReplay(run.config, play?.actions || [], run.seconds, Math.max(0, raidElapsed(run, now)));
}
/** 結束了嗎：分出勝負、時間到，或老師按了結束。 */
export function raidOver(run: RaidRun, state: RaidState): boolean {
  return !!run.endedAt || !!state.result;
}

/** 抽一題：這一類裡這個人還沒做過的（都做過就重新來），盡量和上一題不同題型。 */
export function drawRaidItem(bank: RaidBank, seat: RaidSeat, kind: RaidKind, lastTopic?: string): RaidItem {
  const pool = bank.pools[kind];
  const used = new Set(seat.used[kind] || []);
  let fresh = pool.filter((x) => !used.has(x.id));
  if (!fresh.length) {
    seat.used[kind] = [];
    fresh = pool;
  }
  const other = fresh.filter((x) => x.topic !== lastTopic);
  const list = other.length ? other : fresh;
  return list[randomInt(list.length)];
}
export function newQuestion(bank: RaidBank, seat: RaidSeat, kind: RaidKind, now: number) {
  const last = seat.cur ? findItem(bank, seat.cur.kind, seat.cur.id)?.topic : undefined;
  const item = drawRaidItem(bank, seat, kind, last);
  (seat.used[kind] ||= []).push(item.id);
  seat.cur = { kind, id: item.id, order: shuffle(item.options.map((_, i) => i)), at: now };
  return item;
}
export function findItem(bank: RaidBank, kind: RaidKind, id: string): RaidItem | undefined {
  return bank.pools[kind].find((x) => x.id === id);
}
export function questionFor(bank: RaidBank, cur: NonNullable<RaidSeat['cur']>) {
  const item = findItem(bank, cur.kind, cur.id);
  if (!item) return undefined;
  return {
    kind: cur.kind,
    id: item.id,
    topic: item.topic,
    stem: item.stem,
    ...(item.figure ? { figure: item.figure } : {}),
    options: cur.order.map((i) => item.options[i]),
  };
}
/** 作答：回傳對錯與正解位置；答錯鎖住 5 秒。 */
export function answerRaid(bank: RaidBank, run: RaidRun, store: RaidStore, seatNo: number, choice: number, now: number) {
  const play = ((store.raidPlay ||= {})[run.id] ||= { actions: [], seats: {} });
  const seat = (play.seats[String(seatNo)] ||= { used: {} });
  const cur = seat.cur;
  assert(cur, '請先選一類題目', 409);
  const item = findItem(bank, cur.kind, cur.id);
  assert(item, '這一題已經不在題庫裡，請重新選題', 409);
  const original = cur.order[integer(choice, 0, cur.order.length - 1)];
  const ok = original === item.answer;
  const t = Math.max(0, raidElapsed(run, now));
  // 前後各推算一次：告訴學生這一題有沒有用到連對保護、有沒有贖回成功
  const before = raidState(run, store, now).stats[String(seatNo)];
  play.actions.push({ t, seat: seatNo, kind: cur.kind, ok, ...(seat.role ? { role: seat.role } : {}) });
  const after = raidState(run, store, now).stats[String(seatNo)];
  delete seat.cur;
  if (!ok) seat.lockUntil = now + (cur.kind === 'ultimate' ? RAID_LOCK_ULT_MS : RAID_LOCK_MS);
  return {
    correct: ok,
    answer: cur.order.indexOf(item.answer),
    ...(item.explanation ? { explanation: item.explanation } : {}),
    kind: cur.kind,
    ...(ok ? {} : { lockUntil: seat.lockUntil }),
    streak: after?.streak ?? 0,
    ...(after?.saved && !before?.saved ? { saved: true } : {}),
    ...((after?.redeemed || 0) > (before?.redeemed || 0) ? { redeemed: true } : {}),
  };
}

/** 不會做：換同一類的另一題（不算答錯；每 30 秒一次）。 */
export function skipRaid(bank: RaidBank, seat: RaidSeat, now: number) {
  const cur = seat.cur;
  assert(cur, '目前沒有題目', 409);
  assert(!seat.skipAt || now - seat.skipAt >= RAID_SKIP_COOLDOWN_MS, '換題太快了，等一下再換', 429);
  seat.skipAt = now;
  seat.skips = (seat.skips || 0) + 1;
  newQuestion(bank, seat, cur.kind, now);
  return questionFor(bank, seat.cur!);
}
/** 正在算應用題的座號（大螢幕顯示「正在算大招」）。 */
export function chargingSeats(store: RaidStore, run: RaidRun): number[] {
  return Object.entries(store.raidPlay?.[run.id]?.seats || {})
    .filter(([, s]) => s.cur?.kind === 'ultimate')
    .map(([seat]) => Number(seat))
    .sort((a, b) => a - b);
}

/** 結算：每個人的貢獻分數、9 級稱號與特別稱號。 */
/** 這位同學這一場答對幾題。 */
export const raidCorrect = (x: RaidState['stats'][string] | undefined) => (x ? x.ok.attack + x.ok.shield + x.ok.ultimate : 0);
export function raidResults(run: RaidRun, state: RaidState, seats: Record<string, RaidSeat> = {}): RaidResult[] {
  const minutes = (state.endAt ?? Math.min(state.t, run.seconds * 1000)) / 60000;
  const badges = raidBadges(state.stats);
  return Object.entries(state.stats)
    .map(([seat, stats]) => {
      const level = raidLevel(stats, minutes);
      const correct = raidCorrect(stats);
      const goal = seats[seat]?.goal;
      const prevBest = run.prevBest?.[seat];
      const extra = [...(goal && correct >= goal ? ['達成目標'] : []), ...(prevBest !== undefined && correct > prevBest ? ['突破個人紀錄'] : [])];
      return {
        seat: Number(seat),
        score: stats.score,
        level,
        title: level ? RAID_TITLES[level - 1] : '',
        badges: [...(badges[seat] || []), ...extra],
        stats,
        correct,
        ...(goal ? { goal } : {}),
        ...(prevBest !== undefined ? { prevBest } : {}),
      };
    })
    .filter((r) => r.level > 0)
    .sort((a, b) => b.score - a.score || a.seat - b.seat);
}

/** 老師看全部；學生看得到戰況（不含別人的成績）、自己的角色與題目，結束後只看到自己的稱號。 */
export function raidView(bank: RaidBank, run: RaidRun, store: RaidStore, user: User, now: number): RaidView {
  const bankTitle = bank.title;
  const state = raidState(run, store, now);
  const play = store.raidPlay?.[run.id];
  const teacher = user.role === 'teacher';
  const pools = Object.fromEntries(RAID_KINDS.map((k) => [k, bank.pools[k].length])) as RaidView['pools'];
  const over = raidOver(run, state);
  const all = over ? raidResults(run, state, play?.seats) : undefined;
  // 角色給所有人（學生平板也顯示戰場，出招動畫依角色不同）
  const roles = Object.fromEntries(Object.entries(play?.seats || {}).flatMap(([seat, s]) => (s.role ? [[seat, s.role]] : [])));
  const charging = over ? [] : chargingSeats(store, run);
  if (teacher) {
    const skips = Object.fromEntries(Object.entries(play?.seats || {}).flatMap(([seat, s]) => (s.skips ? [[seat, s.skips]] : [])));
    return { run, title: bankTitle, state, roles, charging, skips, pools, ...(all ? { results: all } : {}) };
  }
  const me = String(user.seat);
  const seat = play?.seats[me];
  const { stats, ...rest } = state;
  const mine: NonNullable<RaidView['mine']> = {};
  if (seat?.role) mine.role = seat.role;
  if (seat?.cur && !over) {
    const q = questionFor(bank, seat.cur);
    if (q) mine.question = q;
  }
  if (seat?.lockUntil && seat.lockUntil > now && !over) mine.lockUntil = seat.lockUntil;
  if (seat?.skipAt) mine.skipAt = seat.skipAt;
  if (seat?.goal) mine.goal = seat.goal;
  if (run.prevBest?.[me] !== undefined) mine.prevBest = run.prevBest[me];
  return {
    run,
    title: bankTitle,
    // 學生端：只留最近的戰況，成績只有自己的
    state: { ...rest, log: rest.log.slice(-12), stats: stats[me] ? { [me]: stats[me] } : {} },
    roles,
    charging,
    pools,
    mine,
    ...(all ? { results: all.filter((r) => String(r.seat) === me) } : {}),
  };
}

/** CSV：每一題作答。 */
export function raidCsvRows(store: RaidStore, bankFor: (run: RaidRun) => RaidBank | undefined): (string | number)[][] {
  const rows: (string | number)[][] = [];
  const NAME: Record<RaidKind, string> = { attack: '記憶（普通攻擊）', shield: '理解（防護罩）', ultimate: '應用（大招）' };
  for (const run of store.raidRuns || []) {
    const play = store.raidPlay?.[run.id];
    if (!play || !bankFor(run)) continue;
    const state = raidReplay(run.config, play.actions, run.seconds, Math.max(0, (run.endedAt ?? run.startedAt + run.seconds * 1000) - run.startedAt));
    const results = new Map(raidResults(run, state, play.seats).map((r) => [String(r.seat), r]));
    for (const a of play.actions) {
      const r = results.get(String(a.seat));
      rows.push(['魔王戰', a.seat, NAME[a.kind], '', '', a.ok ? 'Y' : 'N', r?.score ?? 0, '', r ? `${r.title}${r.badges.length ? `・${r.badges.join('、')}` : ''}` : '', new Date(run.startedAt + a.t).toISOString()]);
    }
  }
  return rows;
}

/** 備份還原（舊備份沒有就是空的）。 */
export function restoreRaid(runsInput: unknown, playInput: unknown, seats: number): RaidStore {
  if (runsInput === undefined) return {};
  assert(Array.isArray(runsInput) && runsInput.length <= 200, '魔王戰紀錄格式不正確');
  const ms = (v: unknown) => integer(v, 0, 8.64e15);
  const kinds = new Set<string>(RAID_KINDS);
  const raidRuns: RaidRun[] = runsInput.map((x) => {
    const r = record(x);
    const c = record(r.config);
    const config = Object.fromEntries(
      ['players', 'bossHp', 'bossShieldGain', 'bossShieldMax', 'bossShieldEvery', 'teamHp', 'bossAtk', 'bossAtkEvery', 'bossUlt', 'bossChargeMs', 'bossWarnMs', 'wrongChargeMs', 'heroAtk', 'ultGain', 'ultDamage'].map((k) => [k, integer(c[k], 0, 1e7)]),
    ) as unknown as RaidRun['config'];
    // 新規則才有的兩項（舊紀錄沒有，照舊規則重算）
    if (c.hpScale !== undefined) config.hpScale = integer(c.hpScale, 1, 100);
    if (c.atkShieldPct !== undefined) config.atkShieldPct = integer(c.atkShieldPct, 10, 100);
    assert(['easy', 'normal', 'hard'].includes(String(r.difficulty)), '魔王戰難度不正確');
    return {
      id: identifier(r.id),
      difficulty: r.difficulty as RaidRun['difficulty'],
      startedAt: ms(r.startedAt),
      seconds: integer(r.seconds, 60, 3600),
      ...(r.endedAt !== undefined ? { endedAt: ms(r.endedAt) } : {}),
      ...(r.prevBest !== undefined ? { prevBest: Object.fromEntries(Object.entries(record(r.prevBest)).map(([k, v]) => [String(integer(Number(k), 1, seats)), integer(v, 0, 999)])) } : {}),
      config,
    };
  });
  const raidPlay: NonNullable<RaidStore['raidPlay']> = {};
  for (const [runId, raw] of Object.entries(record(playInput ?? {}))) {
    assert(raidRuns.some((r) => r.id === runId), '魔王戰作答對不到場次');
    const p = record(raw);
    assert(Array.isArray(p.actions) && p.actions.length <= 20000, '魔王戰作答格式不正確');
    const actions = p.actions.map((x) => {
      const a = record(x);
      assert(kinds.has(String(a.kind)), '魔王戰題目類型不正確');
      return { t: ms(a.t), seat: integer(a.seat, 1, seats), kind: a.kind as RaidKind, ok: a.ok === true, ...(['knight', 'mage', 'archer'].includes(String(a.role)) ? { role: a.role as RaidSeat['role'] } : {}) };
    });
    const seatsOut: Record<string, RaidSeat> = {};
    for (const [seat, s] of Object.entries(record(p.seats ?? {}))) {
      const v = record(s);
      const used: RaidSeat['used'] = {};
      for (const k of RAID_KINDS) {
        const list = record(v.used ?? {})[k];
        if (Array.isArray(list)) used[k] = list.slice(0, 1000).map((id) => String(id).slice(0, 120));
      }
      seatsOut[String(integer(Number(seat), 1, seats))] = {
        ...(['knight', 'mage', 'archer'].includes(String(v.role)) ? { role: v.role as RaidSeat['role'] } : {}),
        ...(v.goal !== undefined ? { goal: integer(v.goal, 1, 99) } : {}),
        used,
      };
    }
    raidPlay[runId] = { actions, seats: seatsOut };
  }
  return { raidRuns, raidPlay };
}
