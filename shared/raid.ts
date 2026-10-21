// 魔王戰：全班合作打魔王。伺服器只存「誰在什麼時候答對／答錯哪一類題目」，
// 戰況（血量、防護罩、大招計量、魔王的攻擊）由這裡依時間先後推算；伺服器和各裝置用同一份程式，
// 學生答題之間魔王照時間表攻擊，大螢幕不用等伺服器推送也能即時播放。

/** 題目類型：記憶＝普通攻擊、理解＝防護罩、應用＝大招計量。 */
export type RaidKind = 'attack' | 'shield' | 'ultimate';
export type RaidDifficulty = 'easy' | 'normal' | 'hard';
/** 英雄角色（只影響招式動畫）。 */
export type RaidRole = 'knight' | 'mage' | 'archer';

export const RAID_KINDS: RaidKind[] = ['attack', 'shield', 'ultimate'];
export const RAID_ROLES: RaidRole[] = ['knight', 'mage', 'archer'];
export const RAID_COUNTDOWN_MS = 3000;
/** 答錯後鎖住的時間。 */
export const RAID_LOCK_MS = 5000;
/** 防護罩：答對一題理解題＝ 1 秒。 */
export const RAID_SHIELD_MS = 1000;
/** 大招計量滿格。 */
export const RAID_ULT_NEED = 100;

export const KIND_NAME: Record<RaidKind, string> = { attack: '普通攻擊', shield: '防護罩', ultimate: '大招' };
export const KIND_LEVEL: Record<RaidKind, string> = { attack: '記憶', shield: '理解', ultimate: '應用' };
export const ROLE_NAME: Record<RaidRole, string> = { knight: '劍士', mage: '法師', archer: '弓箭手' };
export const DIFFICULTY_NAME: Record<RaidDifficulty, string> = { easy: '簡單', normal: '中等', hard: '困難' };

export interface RaidConfig {
  /** 開始時上線的人數（魔王血量、攻擊頻率依人數調整，大班小班打起來差不多久）。 */
  players: number;
  bossHp: number;
  /** 魔王防護罩：每 bossShieldEvery 毫秒補 bossShieldGain，最多 bossShieldMax；擋普通攻擊，大招無視。 */
  bossShieldGain: number;
  bossShieldMax: number;
  bossShieldEvery: number;
  teamHp: number;
  /** 魔王普通攻擊：每 bossAtkEvery 毫秒一次。 */
  bossAtk: number;
  bossAtkEvery: number;
  /** 魔王大招：蓄力 bossChargeMs（毫秒）滿了先預告 bossWarnMs，再打 bossUlt；每答錯一題蓄力多 wrongChargeMs。 */
  bossUlt: number;
  bossChargeMs: number;
  bossWarnMs: number;
  wrongChargeMs: number;
  /** 英雄：普通攻擊傷害、每答對一題應用題的大招計量、大招傷害。 */
  heroAtk: number;
  ultGain: number;
  ultDamage: number;
}

const TABLE: Record<RaidDifficulty, { hpPer: number; atk: number; ult: number; chargeS: number; shield10: number }> = {
  easy: { hpPer: 34, atk: 1, ult: 15, chargeS: 100, shield10: 7 },
  normal: { hpPer: 46, atk: 2, ult: 20, chargeS: 90, shield10: 10 },
  hard: { hpPer: 52, atk: 2, ult: 25, chargeS: 95, shield10: 12 },
};

/** 依難度、上線人數（1–60）與時間長度（秒）決定數值：大班小班、5 分鐘或 10 分鐘，打起來的節奏差不多。 */
export function raidConfig(difficulty: RaidDifficulty, players: number, seconds = 480): RaidConfig {
  const n = Math.max(1, Math.min(60, Math.round(players)));
  const d = TABLE[difficulty];
  // 人越多，同一時間的防護罩越多、答錯也越多：攻擊頻率與答錯蓄力跟著人數調整
  const scale = Math.max(0.4, Math.min(1.6, n / 25));
  // 時間短：魔王血少一些、攻擊頻率不變（英雄血量照時間比例，短時間也要有壓力）
  const len = Math.max(0.5, Math.min(1.5, seconds / 480));
  return {
    players: n,
    bossHp: Math.max(150, Math.round((n * d.hpPer * len) / 10) * 10),
    // 魔王防護罩每 20 秒補一次（每人 0.7～1.3 點），大約吸掉三成的普通攻擊
    bossShieldGain: Math.max(10, Math.round((n * d.shield10) / 10)),
    bossShieldMax: Math.max(20, Math.round((n * d.shield10) / 5)),
    bossShieldEvery: 20000,
    teamHp: Math.round((200 * len) / 10) * 10,
    bossAtk: d.atk,
    bossAtkEvery: Math.round(6000 / scale),
    bossUlt: d.ult,
    bossChargeMs: d.chargeS * 1000,
    // 預告 20 秒：來得及改做防護罩題，在大招落下的那一刻撐起防護罩
    bossWarnMs: 20000,
    wrongChargeMs: Math.round(4000 / scale),
    heroAtk: 10,
    ultGain: 25,
    ultDamage: 80,
  };
}

/** 一次作答（t：開始後第幾毫秒）。 */
export interface RaidAction {
  t: number;
  seat: number;
  kind: RaidKind;
  ok: boolean;
}
export type RaidEventKind =
  | 'atk' // 英雄普通攻擊（n＝傷害，shield＝被魔王防護罩吸收的量）
  | 'shield' // 英雄防護罩 +1 秒
  | 'ult' // 英雄大招（seats＝一起累積計量的座號）
  | 'wrong'
  | 'bossAtk'
  | 'bossBlock' // 魔王攻擊被防護罩擋下（seats＝提供防護罩的座號）
  | 'bossShield'
  | 'bossWarn' // 魔王大招預告
  | 'bossUlt'
  | 'bossUltBlock'
  | 'win'
  | 'lose'
  | 'timeout';
export interface RaidEvent {
  t: number;
  k: RaidEventKind;
  seat?: number;
  n?: number;
  absorbed?: number;
  seats?: number[];
}
export interface RaidSeatStats {
  /** 各類題目：作答數、答對數。 */
  n: Record<RaidKind, number>;
  ok: Record<RaidKind, number>;
  dmg: number;
  /** 提供的防護罩擋下幾次魔王攻擊。 */
  blocks: number;
  /** 參與幾次大招。 */
  ults: number;
  streak: number;
  best: number;
  score: number;
  /** 最後一擊。 */
  lastHit?: boolean;
}
export interface RaidState {
  t: number;
  bossHp: number;
  bossShield: number;
  teamHp: number;
  /** 防護罩到第幾毫秒；by＝這一段防護罩是哪些座號提供的（座號 → 秒數）。 */
  shieldUntil: number;
  shieldBy: Record<string, number>;
  /** 英雄大招計量與這一格是誰累積的（座號 → 題數）。 */
  ult: number;
  ultBy: Record<string, number>;
  /** 魔王蓄力：上次重新蓄力的時間、之後答錯加的蓄力；warnAt＝預告中的大招落下時間。 */
  chargeFrom: number;
  chargeBonus: number;
  bossUltAt: number | null;
  nextAtk: number;
  nextShield: number;
  result: null | 'win' | 'lose' | 'timeout';
  endAt?: number;
  /** 最近的戰況（新的在後面）。 */
  log: RaidEvent[];
  seq: number;
  /** 整場的次數統計（事件種類 → 次數；`${種類}:n` → 數值合計），結算畫面用。 */
  tally: Record<string, number>;
  stats: Record<string, RaidSeatStats>;
}
const LOG_KEEP = 40;

/** 每類答對一題的貢獻分數：應用題要算比較久，分數高一些，三類每分鐘拿到的分數差不多。 */
export const KIND_SCORE: Record<RaidKind, number> = { attack: 10, shield: 14, ultimate: 25 };

export function raidStart(c: RaidConfig): RaidState {
  return {
    t: 0,
    bossHp: c.bossHp,
    bossShield: 0,
    teamHp: c.teamHp,
    shieldUntil: 0,
    shieldBy: {},
    ult: 0,
    ultBy: {},
    chargeFrom: 0,
    chargeBonus: 0,
    bossUltAt: null,
    nextAtk: c.bossAtkEvery,
    nextShield: Math.min(4000, c.bossShieldEvery),
    result: null,
    log: [],
    seq: 0,
    tally: {},
    stats: {},
  };
}
function emptyStats(): RaidSeatStats {
  return { n: { attack: 0, shield: 0, ultimate: 0 }, ok: { attack: 0, shield: 0, ultimate: 0 }, dmg: 0, blocks: 0, ults: 0, streak: 0, best: 0, score: 0 };
}
function push(s: RaidState, e: RaidEvent) {
  s.seq++;
  s.tally[e.k] = (s.tally[e.k] || 0) + 1;
  if (e.n) s.tally[`${e.k}:n`] = (s.tally[`${e.k}:n`] || 0) + e.n;
  s.log.push(e);
  if (s.log.length > LOG_KEEP) s.log.splice(0, s.log.length - LOG_KEEP);
}
function stat(s: RaidState, seat: number) {
  return (s.stats[String(seat)] ||= emptyStats());
}
function finish(s: RaidState, t: number, result: 'win' | 'lose' | 'timeout') {
  s.result = result;
  s.endAt = t;
  push(s, { t, k: result });
}
/** 魔王的下一個動作在第幾毫秒（沒有就 Infinity）。 */
function nextBossTime(c: RaidConfig, s: RaidState): number {
  const charge = s.bossUltAt === null ? s.chargeFrom + c.bossChargeMs - s.chargeBonus : Infinity;
  return Math.min(s.nextAtk, s.nextShield, Math.max(s.t, charge), s.bossUltAt ?? Infinity);
}
/** 擋下攻擊：提供這一段防護罩的人都算一次。 */
function block(s: RaidState, t: number, ult: boolean) {
  const seats = Object.keys(s.shieldBy).map(Number);
  for (const seat of seats) {
    const x = stat(s, seat);
    x.blocks++;
    x.score += ult ? 5 : 2;
  }
  push(s, { t, k: ult ? 'bossUltBlock' : 'bossBlock', seats });
}
function hurtTeam(s: RaidState, t: number, n: number, ult: boolean) {
  s.teamHp = Math.max(0, s.teamHp - n);
  push(s, { t, k: ult ? 'bossUlt' : 'bossAtk', n });
  if (s.teamHp <= 0) finish(s, t, 'lose');
}

/** 時間往前推到 to（毫秒）：依序執行魔王的攻擊、防護罩、大招，時間到就結束。 */
export function advance(c: RaidConfig, s: RaidState, to: number, seconds: number): RaidState {
  const limit = seconds * 1000;
  while (!s.result) {
    const at = Math.min(nextBossTime(c, s), limit);
    if (at > to) break;
    s.t = at;
    if (at >= limit && at < nextBossTime(c, s)) {
      finish(s, limit, 'timeout');
      break;
    }
    if (s.bossUltAt !== null && at === s.bossUltAt) {
      s.bossUltAt = null;
      s.chargeFrom = at;
      s.chargeBonus = 0;
      if (at < s.shieldUntil) block(s, at, true);
      else hurtTeam(s, at, c.bossUlt, true);
    } else if (s.bossUltAt === null && at >= s.chargeFrom + c.bossChargeMs - s.chargeBonus) {
      s.bossUltAt = at + c.bossWarnMs;
      push(s, { t: at, k: 'bossWarn', n: c.bossWarnMs });
    } else if (at === s.nextAtk) {
      s.nextAtk += c.bossAtkEvery;
      if (at < s.shieldUntil) block(s, at, false);
      else hurtTeam(s, at, c.bossAtk, false);
    } else {
      s.nextShield += c.bossShieldEvery;
      const before = s.bossShield;
      s.bossShield = Math.min(c.bossShieldMax, s.bossShield + c.bossShieldGain);
      if (s.bossShield > before) push(s, { t: at, k: 'bossShield', n: s.bossShield - before });
    }
  }
  if (!s.result) s.t = Math.max(s.t, Math.min(to, limit));
  return s;
}

/** 一位同學答完一題（時間要先推到 a.t）。 */
export function act(c: RaidConfig, s: RaidState, a: RaidAction, seconds: number): RaidState {
  advance(c, s, a.t, seconds);
  if (s.result) return s;
  const x = stat(s, a.seat);
  x.n[a.kind]++;
  if (!a.ok) {
    x.streak = 0;
    s.chargeBonus += c.wrongChargeMs;
    push(s, { t: a.t, k: 'wrong', seat: a.seat });
    return s;
  }
  x.ok[a.kind]++;
  x.streak++;
  x.best = Math.max(x.best, x.streak);
  x.score += KIND_SCORE[a.kind] + (x.streak >= 3 ? 3 : 0);
  if (a.kind === 'attack') {
    const absorbed = Math.min(s.bossShield, c.heroAtk);
    s.bossShield -= absorbed;
    const dmg = Math.min(s.bossHp, c.heroAtk - absorbed);
    s.bossHp -= dmg;
    x.dmg += dmg;
    push(s, { t: a.t, k: 'atk', seat: a.seat, n: dmg, absorbed });
    if (s.bossHp <= 0) lastHit(s, a.t, a.seat);
  } else if (a.kind === 'shield') {
    if (a.t >= s.shieldUntil) s.shieldBy = {};
    s.shieldUntil = Math.max(a.t, s.shieldUntil) + RAID_SHIELD_MS;
    s.shieldBy[String(a.seat)] = (s.shieldBy[String(a.seat)] || 0) + 1;
    push(s, { t: a.t, k: 'shield', seat: a.seat, n: s.shieldUntil - a.t });
  } else {
    s.ult += c.ultGain;
    s.ultBy[String(a.seat)] = (s.ultBy[String(a.seat)] || 0) + 1;
    if (s.ult >= RAID_ULT_NEED) {
      const seats = Object.keys(s.ultBy).map(Number);
      for (const seat of seats) stat(s, seat).ults++;
      const dmg = Math.min(s.bossHp, c.ultDamage);
      s.bossHp -= dmg;
      // 大招傷害依累積的題數分給參與的人
      const total = Object.values(s.ultBy).reduce((p, q) => p + q, 0);
      for (const [seat, k] of Object.entries(s.ultBy)) stat(s, Number(seat)).dmg += Math.round((dmg * k) / total);
      push(s, { t: a.t, k: 'ult', seat: a.seat, n: dmg, seats });
      s.ult -= RAID_ULT_NEED;
      s.ultBy = {};
      if (s.bossHp <= 0) lastHit(s, a.t, a.seat);
    }
  }
  return s;
}
function lastHit(s: RaidState, t: number, seat: number) {
  const x = stat(s, seat);
  x.lastHit = true;
  x.score += 20;
  finish(s, t, 'win');
}

/** 從頭推算到 now（毫秒，開始後第幾毫秒）：伺服器與各裝置都用這個。 */
export function raidReplay(c: RaidConfig, actions: RaidAction[], seconds: number, to: number): RaidState {
  const s = raidStart(c);
  for (const a of actions) {
    if (a.t > to) break;
    act(c, s, a, seconds);
  }
  return advance(c, s, to, seconds);
}

/* ───────── 稱號（9 級）：依每分鐘的貢獻分數，人數多少都公平 ───────── */
export const RAID_TITLES = ['見習冒險者', '新手戰士', '勇敢守衛', '熟練劍士', '精英騎士', '戰術大師', '傳奇勇者', '數學英雄', '魔王終結者'];
/** 第 2～9 級的門檻（每分鐘的貢獻分數）。 */
export const RAID_TITLE_RATE = [4, 8, 12, 16, 20, 25, 31, 38];
/** 稱號等級 1–9；沒有作答回傳 0。 */
export function raidLevel(x: RaidSeatStats | undefined, minutes: number): number {
  if (!x || x.n.attack + x.n.shield + x.n.ultimate === 0) return 0;
  const rate = x.score / Math.max(2, minutes);
  return 1 + RAID_TITLE_RATE.filter((r) => rate >= r).length;
}
/** 特別稱號：擋下最多攻擊、最後一擊、最長連對、參與最多次大招（各取最多的人，要有一定次數）。 */
export function raidBadges(stats: Record<string, RaidSeatStats>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const give = (label: string, key: (x: RaidSeatStats) => number, min: number) => {
    const best = Math.max(0, ...Object.values(stats).map(key));
    if (best < min) return;
    for (const [seat, x] of Object.entries(stats)) if (key(x) === best) (out[seat] ||= []).push(label);
  };
  give('最佳守護者', (x) => x.blocks, 2);
  give('連擊王', (x) => x.best, 3);
  give('大招核心', (x) => x.ults, 2);
  for (const [seat, x] of Object.entries(stats)) if (x.lastHit) (out[seat] ||= []).push('致命一擊');
  return out;
}
