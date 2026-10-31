// 魔王戰（伺服器）：開戰、抽題、判斷對錯、戰況與結算。戰況規則在 shared/raid.ts（各裝置共用）。
import raidCatalog from '../content/raids.generated.json';
import type { RaidBank, RaidItem, RaidResult, RaidRun, RaidSeat, RaidView, User } from '../shared/types';
import {
  RAID_ALL_KINDS,
  RAID_ANALYSIS_LOCK_MS,
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

/**
 * 抽一題：這一類裡這個人還沒做過的（都做過就重新來），盡量和上一題不同題型。
 * 分析題另外：已經被全班解出的（solved）不出；盡量不和別人手上的同一題（held），每一題全班只算一次。
 */
export function drawRaidItem(bank: RaidBank, seat: RaidSeat, kind: RaidKind, lastTopic?: string, solved: string[] = [], held: string[] = []): RaidItem {
  if (kind === 'analysis') {
    // 每一題每一輪全班只算一次：這一輪解完了就要等下一層護盾（不重新開放，免得同一題再計入）
    const open = (bank.pools.analysis || []).filter((x) => !solved.includes(x.id));
    assert(open.length, '這一輪的分析題都被解開了，等下一層護盾再挑戰', 409);
    const free = open.filter((x) => !held.includes(x.id) && x.id !== seat.cur?.id);
    const list = free.length ? free : open;
    return list[randomInt(list.length)];
  }
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
/** analysis：分析題用，現在已經解出的題目與別人手上的題目。 */
export function newQuestion(bank: RaidBank, seat: RaidSeat, kind: RaidKind, now: number, analysis?: { solved: string[]; held: string[]; round?: number }) {
  const last = seat.cur ? findItem(bank, seat.cur.kind, seat.cur.id)?.topic : undefined;
  const item = drawRaidItem(bank, seat, kind, last, analysis?.solved, analysis?.held);
  (seat.used[kind] ||= []).push(item.id);
  seat.cur = { kind, id: item.id, order: shuffle(item.options.map((_, i) => i)), at: now, ...(item.reason ? { rorder: shuffle(item.reason.options.map((_, i) => i)) } : {}), ...(analysis ? { round: analysis.round ?? 0 } : {}) };
  return item;
}
export function findItem(bank: RaidBank, kind: RaidKind, id: string): RaidItem | undefined {
  return (bank.pools[kind] || []).find((x) => x.id === id);
}
/** 分析題抽題用：這一輪已經被解出的題目、其他同學手上的分析題。 */
export function analysisContext(run: RaidRun, store: RaidStore, seatNo: number, now: number) {
  const state = raidState(run, store, now);
  const held = Object.entries(store.raidPlay?.[run.id]?.seats || {})
    .filter(([seat, x]) => seat !== String(seatNo) && x.cur?.kind === 'analysis')
    .map(([, x]) => x.cur!.id);
  return { state, solved: state.solved || [], held, round: state.round || 0 };
}
/** 手上的分析題已經不能計入：這一輪被同學解開了，或是上一輪（開新護盾之前）抽到的。 */
export function analysisTaken(cur: RaidSeat['cur'], state: RaidState) {
  return cur?.kind === 'analysis' && (!!state.solved?.includes(cur.id) || (cur.round ?? 0) !== (state.round || 0));
}
/** 學生看到的題目（不含答案）。state：分析題用（3 分鐘提示、這題是不是剛被同學解出）。 */
export function questionFor(bank: RaidBank, cur: NonNullable<RaidSeat['cur']>, state?: RaidState) {
  const item = findItem(bank, cur.kind, cur.id);
  if (!item) return undefined;
  const reason = item.reason && cur.rorder ? cur.rorder.map((i) => item.reason!.options[i]) : undefined;
  return {
    kind: cur.kind,
    id: item.id,
    topic: item.topic,
    stem: item.stem,
    ...(item.figure ? { figure: item.figure } : {}),
    options: cur.order.map((i) => item.options[i]),
    ...(reason ? { reason } : {}),
    ...(item.hint && state?.phase?.hinted ? { hint: item.hint } : {}),
    ...(state && analysisTaken(cur, state) ? { taken: true } : {}),
  };
}
/** 作答：回傳對錯與正解位置；答錯鎖住 5 秒（分析題：只鎖分析題 20 秒）。reason：分析題第二段（理由）的選擇。 */
export function answerRaid(bank: RaidBank, run: RaidRun, store: RaidStore, seatNo: number, choice: number, now: number, reason?: number) {
  const play = ((store.raidPlay ||= {})[run.id] ||= { actions: [], seats: {} });
  const seat = (play.seats[String(seatNo)] ||= { used: {} });
  const cur = seat.cur;
  assert(cur, '請先選一類題目', 409);
  const item = findItem(bank, cur.kind, cur.id);
  assert(item, '這一題已經不在題庫裡，請重新選題', 409);
  if (cur.kind === 'analysis') {
    // 作答入口也檢查分析題鎖定（不只抽題）
    assert(!seat.analysisLockUntil || seat.analysisLockUntil <= now, '分析題答錯了，等一下才能再挑戰', 409);
    // 題目已經不能計入（被同學解開、或開新護盾前抽到的）：不判對錯、不鎖、不記錄，直接換一題（這一輪解完就不換）
    const ctx = analysisContext(run, store, seatNo, now);
    if (analysisTaken(cur, ctx.state)) {
      delete seat.cur;
      let question: ReturnType<typeof questionFor>;
      try {
        newQuestion(bank, seat, 'analysis', now, ctx);
        question = questionFor(bank, seat.cur!, ctx.state);
      } catch {
        question = undefined;
      }
      return { taken: true as const, kind: cur.kind, ...(question ? { question } : {}) };
    }
  }
  const original = cur.order[integer(choice, 0, cur.order.length - 1)];
  // 判斷＋理由：兩段都對才算對
  const rorder = item.reason ? cur.rorder || item.reason.options.map((_, i) => i) : undefined;
  if (rorder) assert(reason !== undefined, '請也選一個理由', 400);
  const reasonOk = !rorder || rorder[integer(reason, 0, rorder.length - 1)] === item.reason!.answer;
  const ok = original === item.answer && reasonOk;
  const t = Math.max(0, raidElapsed(run, now));
  // 前後各推算一次：告訴學生這一題有沒有用到連對保護、有沒有贖回成功
  const before = raidState(run, store, now).stats[String(seatNo)];
  play.actions.push({ t, seat: seatNo, kind: cur.kind, ok, q: cur.id, ...(seat.role ? { role: seat.role } : {}), ...(cur.kind === 'analysis' ? { r: cur.round ?? 0 } : {}) });
  const afterState = raidState(run, store, now);
  const after = afterState.stats[String(seatNo)];
  delete seat.cur;
  // 分析題答錯：只鎖分析題（20 秒），其他題馬上可以做
  if (!ok && cur.kind === 'analysis') seat.analysisLockUntil = now + RAID_ANALYSIS_LOCK_MS;
  else if (!ok) seat.lockUntil = now + (cur.kind === 'ultimate' ? RAID_LOCK_ULT_MS : RAID_LOCK_MS);
  // 分析題答對的結果：打出裂痕（第幾道／門檻）、直接傷害、或這題剛被同學解出
  const ev = ok && cur.kind === 'analysis' ? [...afterState.log].reverse().find((e) => e.seat === seatNo && e.t === t && (e.k === 'crack' || e.k === 'analysis')) : undefined;
  const broke = ok && cur.kind === 'analysis' && afterState.log.some((e) => e.k === 'phaseBreak' && e.t === t);
  return {
    correct: ok,
    answer: cur.order.indexOf(item.answer),
    ...(rorder ? { reasonAnswer: rorder.indexOf(item.reason!.answer) } : {}),
    ...(item.explanation ? { explanation: item.explanation } : {}),
    kind: cur.kind,
    ...(ok ? {} : cur.kind === 'analysis' ? { analysisLockUntil: seat.analysisLockUntil } : { lockUntil: seat.lockUntil }),
    ...(ev?.k === 'crack' ? (ev.dup ? { dup: true } : { crack: { n: ev.n || 0, need: ev.need || 0 } }) : ev?.k === 'analysis' ? { dmg: ev.n || 0 } : {}),
    ...(broke ? { broke: true } : {}),
    streak: after?.streak ?? 0,
    ...(after?.saved && !before?.saved ? { saved: true } : {}),
    ...((after?.redeemed || 0) > (before?.redeemed || 0) ? { redeemed: true } : {}),
  };
}

/** 不會做：換同一類的另一題（不算答錯；每 30 秒一次）。 */
export function skipRaid(bank: RaidBank, seat: RaidSeat, now: number) {
  const cur = seat.cur;
  assert(cur, '目前沒有題目', 409);
  // 分析題不能「換一題」（前端只在應用題顯示）：分析題要記輪次、避開已解的題，只能從抽題入口重新抽（「換成…」）
  assert(cur.kind !== 'analysis', '分析題不能換一題，請改選其他類型再回來抽', 409);
  assert(!seat.skipAt || now - seat.skipAt >= RAID_SKIP_COOLDOWN_MS, '換題太快了，等一下再換', 429);
  seat.skipAt = now;
  seat.skips = (seat.skips || 0) + 1;
  newQuestion(bank, seat, cur.kind, now);
  return questionFor(bank, seat.cur!);
}
/** 這一場有沒有分析題（困難魔王、題庫有分析題）。 */
export function raidHasAnalysis(run: RaidRun, bank: RaidBank) {
  return !!run.config.phase && (bank.pools.analysis || []).length > 0;
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
export const raidCorrect = (x: RaidState['stats'][string] | undefined) => (x ? x.ok.attack + x.ok.shield + x.ok.ultimate + (x.ok.analysis ?? 0) : 0);
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
  // 分析題只算有護盾的場次（困難魔王）；其他場次 0 題，學生端不會出現「分析題」
  const pools = { ...(Object.fromEntries(RAID_KINDS.map((k) => [k, bank.pools[k].length])) as Omit<RaidView['pools'], 'analysis'>), analysis: raidHasAnalysis(run, bank) ? bank.pools.analysis.length : 0 };
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
    const q = questionFor(bank, seat.cur, state);
    if (q) mine.question = q;
  }
  if (seat?.lockUntil && seat.lockUntil > now && !over) mine.lockUntil = seat.lockUntil;
  if (seat?.analysisLockUntil && seat.analysisLockUntil > now && !over) mine.analysisLockUntil = seat.analysisLockUntil;
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
  const NAME: Record<RaidKind, string> = { attack: '記憶（普通攻擊）', shield: '理解（防護罩）', ultimate: '應用（大招）', analysis: '分析（破盾）' };
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
  const kinds = new Set<string>(RAID_ALL_KINDS);
  const raidRuns: RaidRun[] = runsInput.map((x) => {
    const r = record(x);
    const c = record(r.config);
    const config = Object.fromEntries(
      ['players', 'bossHp', 'bossShieldGain', 'bossShieldMax', 'bossShieldEvery', 'teamHp', 'bossAtk', 'bossAtkEvery', 'bossUlt', 'bossChargeMs', 'bossWarnMs', 'wrongChargeMs', 'heroAtk', 'ultGain', 'ultDamage'].map((k) => [k, integer(c[k], 0, 1e7)]),
    ) as unknown as RaidRun['config'];
    // 新規則才有的兩項（舊紀錄沒有，照舊規則重算）
    if (c.hpScale !== undefined) config.hpScale = integer(c.hpScale, 1, 100);
    if (c.atkShieldPct !== undefined) config.atkShieldPct = integer(c.atkShieldPct, 10, 100);
    // 困難魔王的護盾（2026-11 起才有）
    if (c.phase !== undefined) {
      const ph = record(c.phase);
      const list = (v: unknown, lo: number, hi: number) => {
        assert(Array.isArray(v) && v.length >= 1 && v.length <= 5, '護盾設定格式不正確');
        return v.map((x) => integer(x, lo, hi));
      };
      config.phase = {
        at: list(ph.at, 1, 99),
        need: list(ph.need, 1, 60),
        dmgPct: integer(ph.dmgPct, 0, 100),
        breakMs: integer(ph.breakMs, 0, 600_000),
        breakPct: integer(ph.breakPct, 100, 1000),
        support: integer(ph.support, 1, 1000),
        hintMs: integer(ph.hintMs, 1000, 3_600_000),
        cap: integer(ph.cap, 0, 100),
        dmg: integer(ph.dmg, 0, 1e6),
        pool: integer(ph.pool, 1, 1000),
      };
    }
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
      return { t: ms(a.t), seat: integer(a.seat, 1, seats), kind: a.kind as RaidKind, ok: a.ok === true, ...(typeof a.q === 'string' && /^[\w-]{1,80}$/.test(a.q) ? { q: a.q } : {}), ...(a.r !== undefined ? { r: integer(a.r, 0, 100) } : {}), ...(['knight', 'mage', 'archer'].includes(String(a.role)) ? { role: a.role as RaidSeat['role'] } : {}) };
    });
    const seatsOut: Record<string, RaidSeat> = {};
    for (const [seat, s] of Object.entries(record(p.seats ?? {}))) {
      const v = record(s);
      const used: RaidSeat['used'] = {};
      for (const k of RAID_ALL_KINDS) {
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
