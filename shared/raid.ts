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
/** 應用題答錯只鎖 3 秒（比較難，鼓勵大家嘗試）。 */
export const RAID_LOCK_ULT_MS = 3000;
/** 應用題不會做可以換一題，每 30 秒一次。 */
export const RAID_SKIP_COOLDOWN_MS = 30_000;
/** 大招合擊倍率：每多 1 人 +10%，最多 2 倍。 */
export function raidCombo(people: number) {
  return Math.round(Math.min(2, 1 + 0.1 * Math.max(0, people - 1)) * 10) / 10;
}
/** 防護罩：答對一題理解題＝存 1 秒（魔王攻擊時自動扣來擋）。 */
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
  easy: { hpPer: 70, atk: 1, ult: 30, chargeS: 90, shield10: 7 },
  normal: { hpPer: 76, atk: 4, ult: 45, chargeS: 80, shield10: 10 },
  hard: { hpPer: 88, atk: 5, ult: 55, chargeS: 75, shield10: 12 },
};

/** 依難度、上線人數（1–60）與時間長度（秒）決定數值：大班小班、5 分鐘或 10 分鐘，打起來的節奏差不多。 */
export function raidConfig(difficulty: RaidDifficulty, players: number, seconds = 480): RaidConfig {
  const n = Math.max(1, Math.min(60, Math.round(players)));
  const d = TABLE[difficulty];
  // 人數比例（以 25 人為 1）：輸出、防護罩、答錯都和人數成正比，所以英雄血量、魔王血量、
  // 魔王攻擊頻率、魔王大招傷害也都跟著人數，大班小班需要的分工比例一樣。
  const size = Math.max(0.3, Math.min(2.4, n / 25));
  // 時間長度（以 8 分鐘為 1）：魔王與英雄的血量照比例
  const len = Math.max(0.5, Math.min(1.5, seconds / 480));
  return {
    players: n,
    // 人少時合擊加成小：魔王血量打折（8 人約 7 折、15 人約 8 折、25 人以上不打折）
    bossHp: Math.max(150, Math.round((n * d.hpPer * len * Math.min(1, 0.55 + 0.45 * size)) / 10) * 10),
    // 魔王護甲每 20 秒補一次（每人 0.7～1.2 點），大約吸掉三成的普通攻擊
    bossShieldGain: Math.max(2, Math.round((n * d.shield10) / 10)),
    bossShieldMax: Math.max(4, Math.round((n * d.shield10) / 5)),
    bossShieldEvery: 20000,
    // 小班的血量不要太少（一下衝撞就少一大截）：人數比例最低算 0.6
    teamHp: Math.round((200 * len * Math.max(0.6, size)) / 10) * 10,
    bossAtk: d.atk,
    bossAtkEvery: Math.round(6000 / size),
    bossUlt: Math.max(5, Math.round(d.ult * size)),
    bossChargeMs: d.chargeS * 1000,
    // 預告 30 秒：來得及改做防護罩題，存夠防護罩擋下大招
    bossWarnMs: 30000,
    wrongChargeMs: Math.round(4000 / size),
    heroAtk: 12,
    ultGain: 25,
    ultDamage: 100,
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
  | 'bossAtk' // 魔王普通攻擊命中（move＝招式；blocked＝被防護罩擋掉的毫秒數）
  | 'bossBlock' // 魔王攻擊被防護罩完全擋下（seats＝這一下用到誰的防護罩）
  | 'bossShield'
  | 'bossWarn' // 魔王大招預告（move＝大招）
  | 'bossUlt'
  | 'bossUltBlock'
  | 'bossBreak' // 破盾重錘：打碎防護罩存量（n＝毫秒）
  | 'bossHeal' // 吸血咆哮：魔王回血
  | 'bossSeal' // 封印之霧：英雄的大招計量歸零
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
  /** 魔王抗性：這一下的效果（只有打折時才有）。 */
  eff?: number;
  /** 大招的合擊倍率，與最近一起答對應用題的人數。 */
  combo?: number;
  team?: number;
  /** 魔王的招式（BOSS_ATTACKS／BOSS_ULTS 的 id）。 */
  move?: string;
  /** 被防護罩擋掉的毫秒數。 */
  blocked?: number;
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
  /** 防護罩存量：每答對一題理解題存 1 秒（依先後），魔王攻擊時自動扣來擋。 */
  shieldBank: { seat: number; ms: number }[];
  /** 英雄大招計量與這一格是誰累積的（座號 → 題數）。 */
  ult: number;
  ultBy: Record<string, number>;
  /** 魔王蓄力：上次重新蓄力的時間、之後答錯加的蓄力；warnAt＝預告中的大招落下時間。 */
  chargeFrom: number;
  chargeBonus: number;
  bossUltAt: number | null;
  /** 預告中的魔王大招（BOSS_ULTS 的 id）。 */
  bossUltMove: string | null;
  nextAtk: number;
  nextShield: number;
  result: null | 'win' | 'lose' | 'timeout';
  endAt?: number;
  /** 最近的戰況（新的在後面）。 */
  log: RaidEvent[];
  seq: number;
  /** 整場的次數統計（事件種類 → 次數；`${種類}:n` → 數值合計），結算畫面用。 */
  tally: Record<string, number>;
  /** 最近 45 秒全班答對的題目類型（魔王的抗性依這個算）。 */
  recent: { t: number; kind: RaidKind; seat: number }[];
  stats: Record<string, RaidSeatStats>;
}
const LOG_KEEP = 40;

/* ───────── 魔王適應（防止全班只做同一類題目）─────────
 * 最近 45 秒全班答對的題目裡，普通攻擊（記憶題）超過六成，魔王就產生抗性（大招與防護罩不會）：
 * 六成以下 100%，九成以上只剩 25%（線性）。只影響傷害與大招計量，個人的貢獻分數不受影響。
 * 答對的題數太少（少於人數的 1/5，至少 4 題）時不算，剛開戰不會誤判。 */
export const RESIST_WINDOW_MS = 45_000;
const RESIST_FROM = 0.6;
const RESIST_FULL = 0.9;
const RESIST_MIN = 0.25;
/** 這一類現在的效果（0.25～1）。players：開戰時的人數。 */
export function raidEffect(s: Pick<RaidState, 'recent'>, kind: RaidKind, t: number, players: number): number {
  // 鼓勵全班做應用題：只有普通攻擊（記憶題）會被魔王適應
  if (kind !== 'attack') return 1;
  const list = s.recent.filter((x) => x.t > t - RESIST_WINDOW_MS);
  if (list.length < Math.max(4, Math.ceil(players / 5))) return 1;
  const share = list.filter((x) => x.kind === kind).length / list.length;
  if (share <= RESIST_FROM) return 1;
  const k = Math.min(1, (share - RESIST_FROM) / (RESIST_FULL - RESIST_FROM));
  return Math.round((1 - k * (1 - RESIST_MIN)) * 100) / 100;
}

/** 每類答對一題的貢獻分數：應用題要算比較久，分數高一些，三類每分鐘拿到的分數差不多。 */
export const KIND_SCORE: Record<RaidKind, number> = { attack: 10, shield: 14, ultimate: 25 };

export function raidStart(c: RaidConfig): RaidState {
  return {
    t: 0,
    bossHp: c.bossHp,
    bossShield: 0,
    teamHp: c.teamHp,
    shieldBank: [],
    ult: 0,
    ultBy: {},
    chargeFrom: 0,
    chargeBonus: 0,
    bossUltAt: null,
    bossUltMove: null,
    nextAtk: c.bossAtkEvery,
    nextShield: Math.min(4000, c.bossShieldEvery),
    result: null,
    log: [],
    seq: 0,
    tally: {},
    recent: [],
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
/* ───────── 魔王的招式 ─────────
 * 普通攻擊 3 種（每次依時間輪到其中一種）；大招 4 種（蓄滿時決定，預告時就看得到是哪一招）。
 * cost：完全擋下需要的防護罩（毫秒）。存量不夠時擋掉一部分，傷害依比例減少。 */
export const BOSS_ATTACKS = [
  { id: 'claw', name: '爪擊', hits: 1, mult: 1, cost: 1000, tip: '普通的一擊' },
  { id: 'charge', name: '衝撞', hits: 1, mult: 1.8, cost: 2000, tip: '重擊，要 2 秒防護罩才擋得住' },
  { id: 'combo', name: '連擊', hits: 2, mult: 0.7, cost: 1000, tip: '連打兩下，每下扣 1 秒防護罩' },
] as const;
export const BOSS_ULTS = [
  { id: 'doom', name: '毀滅衝擊', mult: 1, tip: '超大傷害' },
  { id: 'drain', name: '吸血咆哮', mult: 0.8, tip: '沒擋下的傷害，魔王會回同樣多的血' },
  { id: 'seal', name: '封印之霧', mult: 0.6, tip: '沒有完全擋下，英雄的大招計量歸零' },
  { id: 'break', name: '破盾重錘', mult: 0.8, tip: '先打碎一半的防護罩存量再攻擊' },
] as const;
/** 完全擋下魔王大招要 3 秒防護罩。 */
export const RAID_ULT_BLOCK_MS = 3000;
/** 防護罩存量上限 30 秒。 */
export const RAID_SHIELD_MAX_MS = 30_000;
export function bossAttackAt(at: number) {
  // 爪擊一半、衝撞與連擊各四分之一（依時間決定，每台裝置一樣）
  const k = (Math.floor(at / 1000) * 7 + 3) % 4;
  return BOSS_ATTACKS[k < 2 ? 0 : k === 2 ? 1 : 2];
}
export function bossUltFor(at: number) {
  return BOSS_ULTS[(Math.floor(at / 1000) * 5 + 1) % BOSS_ULTS.length];
}
export function shieldMs(s: Pick<RaidState, 'shieldBank'>) {
  return s.shieldBank.reduce((p, x) => p + x.ms, 0);
}
/** 依先後扣防護罩存量，回傳扣了多少、用到誰的。 */
function useShield(s: RaidState, cost: number) {
  let used = 0;
  const seats: number[] = [];
  while (used < cost && s.shieldBank.length) {
    const x = s.shieldBank[0];
    const take = Math.min(x.ms, cost - used);
    used += take;
    x.ms -= take;
    if (!seats.includes(x.seat)) seats.push(x.seat);
    if (x.ms <= 0) s.shieldBank.shift();
  }
  for (const seat of seats) {
    const st = stat(s, seat);
    st.blocks++;
    st.score += cost >= RAID_ULT_BLOCK_MS ? 5 : 2;
  }
  return { used, seats };
}
function hurtTeam(s: RaidState, t: number, n: number) {
  s.teamHp = Math.max(0, s.teamHp - n);
  if (s.teamHp <= 0) finish(s, t, 'lose');
}
/** 魔王普通攻擊。 */
function bossAttack(c: RaidConfig, s: RaidState, at: number) {
  const m = bossAttackAt(at);
  for (let h = 0; h < m.hits && !s.result; h++) {
    const { used, seats } = useShield(s, m.cost);
    const full = Math.max(1, Math.round(c.bossAtk * m.mult));
    const dmg = Math.round(full * (1 - used / m.cost));
    if (dmg <= 0) push(s, { t: at, k: 'bossBlock', move: m.id, seats });
    else {
      push(s, { t: at, k: 'bossAtk', move: m.id, n: dmg, ...(used ? { blocked: used, seats } : {}) });
      hurtTeam(s, at, dmg);
    }
  }
}
/** 魔王大招落下。 */
function bossUltimate(c: RaidConfig, s: RaidState, at: number) {
  const m = BOSS_ULTS.find((x) => x.id === s.bossUltMove) || BOSS_ULTS[0];
  if (m.id === 'break') {
    const broken = Math.floor(shieldMs(s) / 2000) * 1000; // 打碎一半（以整秒計）
    let left = broken;
    // 從最新存的開始打碎
    while (left > 0 && s.shieldBank.length) {
      const x = s.shieldBank[s.shieldBank.length - 1];
      const take = Math.min(x.ms, left);
      x.ms -= take;
      left -= take;
      if (x.ms <= 0) s.shieldBank.pop();
    }
    if (broken) push(s, { t: at, k: 'bossBreak', move: m.id, n: broken });
  }
  const { used, seats } = useShield(s, RAID_ULT_BLOCK_MS);
  const dmg = Math.round(c.bossUlt * m.mult * (1 - used / RAID_ULT_BLOCK_MS));
  if (dmg <= 0) {
    push(s, { t: at, k: 'bossUltBlock', move: m.id, seats });
    return;
  }
  push(s, { t: at, k: 'bossUlt', move: m.id, n: dmg, ...(used ? { blocked: used, seats } : {}) });
  hurtTeam(s, at, dmg);
  if (m.id === 'drain') {
    const heal = Math.min(dmg, c.bossHp - s.bossHp);
    if (heal > 0) {
      s.bossHp += heal;
      push(s, { t: at, k: 'bossHeal', n: heal });
    }
  } else if (m.id === 'seal' && s.ult > 0) {
    push(s, { t: at, k: 'bossSeal', n: s.ult });
    s.ult = 0;
    s.ultBy = {};
  }
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
      bossUltimate(c, s, at);
      s.bossUltMove = null;
    } else if (s.bossUltAt === null && at >= s.chargeFrom + c.bossChargeMs - s.chargeBonus) {
      s.bossUltAt = at + c.bossWarnMs;
      s.bossUltMove = bossUltFor(at).id;
      push(s, { t: at, k: 'bossWarn', n: c.bossWarnMs, move: s.bossUltMove });
    } else if (at === s.nextAtk) {
      s.nextAtk += c.bossAtkEvery;
      bossAttack(c, s, at);
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
    // 應用題比較難：答錯時魔王蓄力只加一半
    s.chargeBonus += a.kind === 'ultimate' ? Math.round(c.wrongChargeMs / 2) : c.wrongChargeMs;
    push(s, { t: a.t, k: 'wrong', seat: a.seat });
    return s;
  }
  x.ok[a.kind]++;
  x.streak++;
  // 效果依「這一題之前」最近 30 秒的出招比例；算完再把這一題記進去
  const eff = raidEffect(s, a.kind, a.t, c.players);
  s.recent = s.recent.filter((r) => r.t > a.t - RESIST_WINDOW_MS);
  s.recent.push({ t: a.t, kind: a.kind, seat: a.seat });
  x.best = Math.max(x.best, x.streak);
  x.score += KIND_SCORE[a.kind] + (x.streak >= 3 ? 3 : 0);
  if (a.kind === 'attack') {
    const power = Math.max(1, Math.round(c.heroAtk * eff));
    const absorbed = Math.min(s.bossShield, power);
    s.bossShield -= absorbed;
    const dmg = Math.min(s.bossHp, power - absorbed);
    s.bossHp -= dmg;
    x.dmg += dmg;
    push(s, { t: a.t, k: 'atk', seat: a.seat, n: dmg, absorbed, ...(eff < 1 ? { eff } : {}) });
    if (s.bossHp <= 0) lastHit(s, a.t, a.seat);
  } else if (a.kind === 'shield') {
    // 存進防護罩存量（滿了就不再加）
    const room = RAID_SHIELD_MAX_MS - shieldMs(s);
    if (room > 0) s.shieldBank.push({ seat: a.seat, ms: Math.min(RAID_SHIELD_MS, room) });
    push(s, { t: a.t, k: 'shield', seat: a.seat, n: shieldMs(s) });
  } else {
    s.ult += Math.max(1, Math.round(c.ultGain * eff));
    s.ultBy[String(a.seat)] = (s.ultBy[String(a.seat)] || 0) + 1;
    if (s.ult >= RAID_ULT_NEED) {
      const seats = Object.keys(s.ultBy).map(Number);
      for (const seat of seats) stat(s, seat).ults++;
      // 合擊：最近 45 秒有幾位不同的同學答對應用題（全班一起做，傷害越高；每多 1 人 +10%，最多 2 倍）
      const team = new Set(s.recent.filter((r) => r.kind === 'ultimate' && r.t > a.t - RESIST_WINDOW_MS).map((r) => r.seat)).size;
      const combo = raidCombo(team);
      const dmg = Math.min(s.bossHp, Math.round(c.ultDamage * combo));
      s.bossHp -= dmg;
      // 大招傷害依累積的題數分給參與的人
      const total = Object.values(s.ultBy).reduce((p, q) => p + q, 0);
      for (const [seat, k] of Object.entries(s.ultBy)) stat(s, Number(seat)).dmg += Math.round((dmg * k) / total);
      push(s, { t: a.t, k: 'ult', seat: a.seat, n: dmg, seats, combo, team });
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
