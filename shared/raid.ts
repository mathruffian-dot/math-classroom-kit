// 魔王戰：全班合作打魔王。伺服器只存「誰在什麼時候答對／答錯哪一類題目」，
// 戰況（血量、防護罩、大招計量、魔王的攻擊）由這裡依時間先後推算；伺服器和各裝置用同一份程式，
// 學生答題之間魔王照時間表攻擊，大螢幕不用等伺服器推送也能即時播放。

/**
 * 題目類型：記憶＝普通攻擊、理解＝防護罩、應用＝大招計量；分析＝破盾（只有困難魔王、而且題庫有分析題時才有）。
 */
export type RaidKind = 'attack' | 'shield' | 'ultimate' | 'analysis';
/** 每一場都有的三類題目。 */
export type RaidBaseKind = Exclude<RaidKind, 'analysis'>;
export type RaidDifficulty = 'easy' | 'normal' | 'hard';
/** 英雄角色（只影響招式動畫）。 */
export type RaidRole = 'knight' | 'mage' | 'archer';

export const RAID_KINDS: RaidBaseKind[] = ['attack', 'shield', 'ultimate'];
/** 含分析題的四類（伺服器驗證、還原備份用）。 */
export const RAID_ALL_KINDS: RaidKind[] = ['attack', 'shield', 'ultimate', 'analysis'];
/** 分析題答錯：這位同學 20 秒內不能再抽分析題（其他題照常；不扣英雄血、不加魔王蓄力）。 */
export const RAID_ANALYSIS_LOCK_MS = 20_000;
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
/** 魔王大招落下前預告 12 秒（原本 30 秒）。 */
export const RAID_WARN_MS = 12_000;
/** 大招計量滿格。 */
export const RAID_ULT_NEED = 100;

export const KIND_NAME: Record<RaidKind, string> = { attack: '普通攻擊', shield: '防護罩', ultimate: '大招', analysis: '破盾' };
export const KIND_LEVEL: Record<RaidKind, string> = { attack: '記憶', shield: '理解', ultimate: '應用', analysis: '分析' };
export const ROLE_NAME: Record<RaidRole, string> = { knight: '劍士', mage: '法師', archer: '弓箭手' };
/** 職業被動技能：和三類題目各對應一種，選角色也是選自己想擅長的分工。 */
export const ROLE_PASSIVE: Record<RaidRole, { kind: RaidKind; name: string; tip: string }> = {
  knight: { kind: 'shield', name: '堅盾', tip: '理解題答對，防護罩多存 0.5 秒' },
  archer: { kind: 'attack', name: '連射', tip: '記憶題答對，普通攻擊 +30%' },
  mage: { kind: 'ultimate', name: '魔力湧泉', tip: '應用題答對，大招計量多 5%' },
};
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
  /**
   * 英雄血量的刻度（魔王血量的幾倍）：吸血大招回給魔王的血要除以它。
   * 普通攻擊每下要扣的防護罩是 BOSS_ATTACKS 的 cost × atkShieldPct%。
   * 舊的紀錄沒有這兩項（＝1、100），照當時的規則重算。
   */
  hpScale?: number;
  atkShieldPct?: number;
  /** 困難魔王的護盾與分析題（2026-11）。舊的紀錄、簡單／中等、沒有分析題的題庫都沒有這一項＝沒有護盾。 */
  phase?: RaidPhaseConfig;
}
/**
 * 魔王護盾：血量降到 at[i]%（70、35）時開啟第 i 層，答對分析題打出裂痕，裂痕數到門檻就破盾。
 * 護盾和「魔王護甲」（bossShield）是同一套魔王防禦的兩種狀態：護盾開啟時護甲併進護盾（歸零、不再回補），
 * 破盾後「破防」breakMs 毫秒，結束後護甲才重新回補。所以同一時間只會有一種魔王防禦。
 */
export interface RaidPhaseConfig {
  /** 開啟護盾的血量百分比（由高到低）。 */
  at: number[];
  /** 每一層的破盾門檻（開戰時依上線人數算好：20%、25%，至少 3）。 */
  need: number[];
  /** 護盾存在時，非分析題的傷害只剩幾 %。 */
  dmgPct: number;
  /** 破防：多久（毫秒）、所有傷害變成幾 %。 */
  breakMs: number;
  breakPct: number;
  /** 護盾開啟期間，全班每答對 support 題應用題，門檻減 1。 */
  support: number;
  /** 護盾開啟 hintMs 毫秒還沒破：出現提示、門檻減 1（每層一次）。 */
  hintMs: number;
  /** 每位同學每一層最多 cap 題分析題算進破盾；超過的（以及沒有護盾時）改成直接扣魔王 dmg 血。 */
  cap: number;
  dmg: number;
  /** 題庫的分析題題數。每一題每一輪（每開一層護盾換一輪）全班只算一次；這一輪解完就要等下一層。 */
  pool: number;
  /** 護盾開啟期間魔王攻擊減弱：普通攻擊傷害只剩 atkPct%（2026-11-01 起；舊紀錄沒有＝不減弱）。 */
  atkPct?: number;
  /** 護盾開啟期間魔王蓄力速度只剩 chargePct%（0＝暫停；沒有＝照常）。 */
  chargePct?: number;
}
/** 開啟中的護盾。 */
export interface RaidPhase {
  /** 第幾層（0 起算）、開啟時間、原本的門檻。 */
  layer: number;
  at: number;
  base: number;
  /** 裂痕數、每個座號算進幾題。 */
  cracks: number;
  by: Record<string, number>;
  /** 這一層開啟後全班答對的應用題數。 */
  support: number;
  /** 3 分鐘提示已經出現。 */
  hinted: boolean;
}
/** 護盾的有效門檻：原本的門檻 − 應用題支援 − 提示，最低 1。 */
export function phaseNeed(c: RaidConfig, p: RaidPhase): number {
  const ph = c.phase!;
  return Math.max(1, p.base - Math.floor(p.support / ph.support) - (p.hinted ? 1 : 0));
}
/** 破防中嗎（t 毫秒時）。 */
export function inBreak(s: Pick<RaidState, 'breakUntil'>, t: number) {
  return !!s.breakUntil && t < s.breakUntil;
}

// atk、ult 是英雄血量 2000（25 人、8 分鐘）時的傷害；普通攻擊 25 人以上每 3 秒一次
// chargeS：蓄力秒數。2026-10-31 預告從 30 秒縮成 12 秒時，蓄力各加 18 秒（原本 90／80／75），
// 「蓄力＋預告」一輪的長度不變，一場的大招次數和以前一樣
const TABLE: Record<RaidDifficulty, { hpPer: number; atk: number; ult: number; chargeS: number; shield10: number }> = {
  easy: { hpPer: 80, atk: 5, ult: 300, chargeS: 108, shield10: 7 },
  normal: { hpPer: 88, atk: 20, ult: 450, chargeS: 98, shield10: 10 },
  hard: { hpPer: 106, atk: 25, ult: 550, chargeS: 93, shield10: 12 },
};
/** 護盾的固定規則（門檻依人數另外算）。 */
// atkPct、chargePct：護盾期間魔王攻擊減弱（普通攻擊減半、暫停蓄力；2026-11-01，scripts/raid-sim.ts 比較過三種候選）
// hpOffS／hpDivS：有護盾時魔王血量的時間長度＝（秒數 − hpOffS）／hpDivS（原本是 秒數／480）。28 人 5、8 分鐘勝率各約五成的校準值
// （修正「答錯蓄力」後重新校準，固定亂數種子各 600 場）。
// 兩層護盾平均要撐 4～5 分鐘（每層約 130 秒破盾，加上門檻），這段時間其他傷害只剩 20%，照原公式（28 人 8 分鐘 2970 血）
// 就算護盾期間魔王完全不攻擊也打不贏（模擬勝率 0%，魔王剩約四成血）
export const RAID_PHASE = { at: [70, 35], needPct: [20, 25], needMin: 3, dmgPct: 20, breakMs: 15_000, breakPct: 200, support: 10, hintMs: 180_000, cap: 2, dmg: 40, atkPct: 50, chargePct: 0, hpOffS: 264, hpDivS: 390 } as const;

/**
 * 依難度、上線人數（1–60）與時間長度（秒）決定數值：大班小班、5 分鐘或 10 分鐘，打起來的節奏差不多。
 * analysis：題庫的分析題題數；困難魔王而且有分析題時才有護盾（其他單元只要在題庫加分析題就會啟用）。
 */
export function raidConfig(difficulty: RaidDifficulty, players: number, seconds = 480, analysis = 0): RaidConfig {
  const n = Math.max(1, Math.min(60, Math.round(players)));
  const d = TABLE[difficulty];
  const phased = difficulty === 'hard' && analysis > 0;
  // 人數比例（以 25 人為 1）：輸出、防護罩、答錯都和人數成正比，所以英雄血量、魔王血量、
  // 魔王攻擊頻率、魔王大招傷害也都跟著人數，大班小班需要的分工比例一樣。
  const size = Math.max(0.3, Math.min(2.4, n / 25));
  // 時間長度（以 8 分鐘為 1）：魔王與英雄的血量照比例
  const len = Math.max(0.5, Math.min(1.5, seconds / 480));
  // 普通攻擊：25 人以上每 3 秒一次，人少時間隔拉長但最慢 5 秒一次；拉不長的部分改成每下傷害少一點（總傷害和人數成正比）
  const atkEvery = Math.min(5000, Math.round(3000 / size));
  // 魔王血量的時間長度：有護盾時扣掉護盾的時間（見 RAID_PHASE.hpOffS），其他和原本一樣
  const hpLen = phased ? Math.max(0.05, (seconds - RAID_PHASE.hpOffS) / RAID_PHASE.hpDivS) : len;
  return {
    players: n,
    // 人少時合擊加成小：魔王血量打折（8 人約 7 折、15 人約 8 折、25 人以上不打折）
    bossHp: Math.max(150, Math.round((n * d.hpPer * hpLen * Math.min(1, 0.55 + 0.45 * size)) / 10) * 10),
    // 魔王護甲每 20 秒補一次（每人 0.7～1.2 點），大約吸掉三成的普通攻擊
    bossShieldGain: Math.max(2, Math.round((n * d.shield10) / 10)),
    bossShieldMax: Math.max(4, Math.round((n * d.shield10) / 5)),
    bossShieldEvery: 20000,
    // 小班的血量不要太少（一下衝撞就少一大截）：人數比例最低算 0.6
    teamHp: Math.round((200 * len * Math.max(0.6, size)) / 10) * 100,
    bossAtk: Math.max(1, Math.round((d.atk * atkEvery * size) / 3000)),
    bossAtkEvery: atkEvery,
    bossUlt: Math.max(50, Math.round((d.ult * size) / 10) * 10),
    bossChargeMs: d.chargeS * 1000,
    // 預告 12 秒（原本 30 秒，老師覺得太長）：理解題一題要算 18 秒以上，預告後才開始做的來不及，
    // 要靠平常存的防護罩；預告時正在做理解題的同學還來得及補上
    bossWarnMs: RAID_WARN_MS,
    wrongChargeMs: Math.round(4000 / size),
    heroAtk: 12,
    ultGain: 25,
    ultDamage: 100,
    hpScale: 10,
    // 每下扣的防護罩和攻擊頻率成反比（原本每 6000/size 毫秒一下、每下 cost）
    atkShieldPct: Math.max(10, Math.round((100 * atkEvery * size) / 6000)),
    ...(phased
      ? {
          phase: {
            at: [...RAID_PHASE.at],
            need: RAID_PHASE.needPct.map((p) => Math.max(RAID_PHASE.needMin, Math.ceil((n * p) / 100))),
            dmgPct: RAID_PHASE.dmgPct,
            breakMs: RAID_PHASE.breakMs,
            breakPct: RAID_PHASE.breakPct,
            support: RAID_PHASE.support,
            hintMs: RAID_PHASE.hintMs,
            cap: RAID_PHASE.cap,
            dmg: RAID_PHASE.dmg,
            pool: analysis,
            atkPct: RAID_PHASE.atkPct,
            chargePct: RAID_PHASE.chargePct,
          },
        }
      : {}),
  };
}

/** 一次作答（t：開始後第幾毫秒）。 */
export interface RaidAction {
  t: number;
  seat: number;
  kind: RaidKind;
  ok: boolean;
  /** 題目 ID（學習紀錄用：對到題型）。 */
  q?: string;
  /** 作答時的角色（職業被動技能）。 */
  role?: RaidRole;
  /** 分析題：抽題時的輪次（RaidState.round）。和現在的輪次不同＝題目已過期，不計入。 */
  r?: number;
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
  | 'phaseOn' // 魔王護盾開啟（n＝門檻，layer＝第幾層）
  | 'crack' // 分析題打出裂痕（n＝裂痕數，need＝目前門檻）
  | 'analysis' // 分析題直接扣魔王血（超過每人 2 題、或沒有護盾時；n＝傷害）
  | 'phaseSupport' // 應用題支援：門檻減 1（need＝新的門檻）
  | 'phaseHint' // 護盾撐了 3 分鐘：出現提示、門檻減 1
  | 'phaseBreak' // 破盾（seats＝打出裂痕的人），接著破防
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
  /** 護盾：門檻、第幾層；傷害倍率（0.2＝被護盾擋、2＝破防）；同一題已經被同學解出（不算）。 */
  need?: number;
  layer?: number;
  x?: number;
  dup?: boolean;
  /** 傷害被下一層護盾的門檻擋住（血量停在 70%／35%，要先破這一層）。 */
  held?: boolean;
}
/** 各類題目的題數（分析題做過才有這一格，舊紀錄的成績格式不變）。 */
export type RaidKindCount = Record<RaidBaseKind, number> & { analysis?: number };
export interface RaidSeatStats {
  /** 各類題目：作答數、答對數。 */
  n: RaidKindCount;
  ok: RaidKindCount;
  /** 算進破盾的裂痕數。 */
  cracks?: number;
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
  /** 連對保護已經用掉（每場一次）。 */
  saved?: boolean;
  /** 上一題答錯的類型（下一題同類型答對＝贖回）、贖回了幾次。 */
  redeemKind?: RaidKind | null;
  redeemed?: number;
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
  /** 護盾（config.phase 有才有）：開啟中的護盾、已經開過幾層、破防到第幾毫秒、這一輪已經被解出的分析題。 */
  phase?: RaidPhase | null;
  phaseN?: number;
  breakUntil?: number;
  solved?: string[];
  /** 分析題的輪次：開戰時 0，每開一層護盾 +1（solved 跟著清空）。每一題每一輪全班只算一次。 */
  round?: number;
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
// 分析題：一題約 1～1.5 分鐘（不計速度），答對 35 分；打出裂痕的人破盾時每人再 +10（合作獎勵）。
// 換算每分鐘約 25～35 分，和應用題（25 分、約 45 秒）接近，不會讓分析題變成刷分捷徑，也不會吃虧
export const KIND_SCORE: Record<RaidKind, number> = { attack: 10, shield: 14, ultimate: 25, analysis: 35 };
/** 破盾時，這一層打出裂痕的每個人加分。 */
export const RAID_BREAK_SCORE = 10;

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
    ...(c.phase ? { phase: null, phaseN: 0, breakUntil: 0, solved: [], round: 0 } : {}),
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
  return Math.min(s.nextAtk, s.nextShield, Math.max(s.t, chargeDue(c, s)), s.bossUltAt ?? Infinity, hintTime(c, s), deferredOpen(c, s));
}
/** 魔王蓄滿（開始預告大招）在第幾毫秒（已經在預告就 Infinity）。護盾期間蓄力變慢（chargePct）時照比例延後。 */
function chargeDue(c: RaidConfig, s: RaidState): number {
  if (s.bossUltAt !== null) return Infinity;
  const due = s.chargeFrom + c.bossChargeMs - s.chargeBonus;
  const f = c.phase?.chargePct;
  if (f === undefined || f >= 100 || !s.phase) return due;
  // 暫停（0%）：護盾存在期間一定不會蓄滿（答錯也不加蓄力，見 chargeRate），已經宣告的大招不受影響（上面先回傳）
  if (f <= 0) return Infinity;
  const from = Math.max(s.phase.at, s.chargeFrom);
  if (due <= from) return from;
  return from + ((due - from) * 100) / f;
}
/** 蓄力速度倍率：護盾期間 chargePct%（答錯加的蓄力也照這個比例；暫停時不加），其他時候 1。 */
function chargeRate(c: RaidConfig, s: RaidState): number {
  const f = c.phase?.chargePct;
  return f !== undefined && f < 100 && s.phase ? Math.max(0, f) / 100 : 1;
}
/** 魔王蓄力的進度 0～1（大螢幕的蓄力條；護盾期間暫停蓄力時停住不動）。 */
export function chargeLevel(c: RaidConfig, s: RaidState): number {
  if (s.bossUltAt !== null) return 1;
  const f = c.phase?.chargePct;
  let elapsed = Math.max(0, s.t - s.chargeFrom);
  if (f !== undefined && f < 100 && s.phase) {
    const from = Math.max(s.phase.at, s.chargeFrom);
    if (s.t > from) elapsed -= ((s.t - from) * (100 - f)) / 100;
  }
  return Math.min(1, Math.max(0, elapsed + s.chargeBonus) / c.bossChargeMs);
}
/**
 * 護盾期間魔王攻擊減弱的簡短說明（大螢幕「普攻減半、暫停蓄力」；short＝學生戰況區「普攻減半・蓄力暫停」，窄面板放得下）。
 * 舊紀錄沒有這一項就是空字串。
 */
export function phaseWeakText(ph: RaidPhaseConfig | undefined, short = false): string {
  if (!ph) return '';
  const a = ph.atkPct,
    f = ph.chargePct;
  const parts = [
    a === undefined || a >= 100 ? '' : a === 50 ? '普攻減半' : a === 0 ? '不普攻' : `普攻剩 ${a}%`,
    f === undefined || f >= 100 ? '' : f === 0 ? (short ? '蓄力暫停' : '暫停蓄力') : '蓄力變慢',
  ].filter(Boolean);
  return parts.join(short ? '・' : '、');
}
/** 護盾被破：護盾期間少蓄的部分補進 chargeFrom（之後照常速度）。 */
function chargeResume(c: RaidConfig, s: RaidState, t: number) {
  const f = c.phase?.chargePct;
  if (f === undefined || f >= 100 || !s.phase || s.bossUltAt !== null) return;
  const from = Math.max(s.phase.at, s.chargeFrom);
  if (t > from) s.chargeFrom += Math.round(((t - from) * (100 - f)) / 100);
}
/** 下一層護盾的門檻血量（已經開完就 -1）。 */
function nextGate(c: RaidConfig, s: RaidState) {
  const at = c.phase?.at[s.phaseN || 0];
  return at === undefined ? -1 : Math.ceil((c.bossHp * at) / 100);
}
/** 血量停在下一層門檻、但正在破防：破防結束那一刻開下一層（沒有就 Infinity）。 */
function deferredOpen(c: RaidConfig, s: RaidState) {
  if (!c.phase || s.phase || !s.breakUntil) return Infinity;
  const gate = nextGate(c, s);
  return gate > 0 && s.bossHp <= gate && s.breakUntil >= s.t ? s.breakUntil : Infinity;
}
/** 護盾的 3 分鐘提示在第幾毫秒（沒有就 Infinity）。 */
function hintTime(c: RaidConfig, s: RaidState) {
  return c.phase && s.phase && !s.phase.hinted ? s.phase.at + c.phase.hintMs : Infinity;
}
/** 破盾了嗎（裂痕數到了目前的門檻）：破防 breakMs 毫秒，打出裂痕的人加分。 */
function checkBreak(c: RaidConfig, s: RaidState, t: number) {
  const p = s.phase;
  if (!c.phase || !p || p.cracks < phaseNeed(c, p)) return;
  const seats = Object.keys(p.by).map(Number);
  for (const seat of seats) stat(s, seat).score += RAID_BREAK_SCORE;
  chargeResume(c, s, t);
  s.phase = null;
  s.breakUntil = t + c.phase.breakMs;
  // 魔王護甲在破防結束後才重新回補
  s.nextShield = Math.max(s.nextShield, s.breakUntil);
  push(s, { t, k: 'phaseBreak', seats, layer: p.layer, n: c.phase.breakMs });
}
/**
 * 扣魔王血（所有英雄傷害都走這裡）：護盾存在時非分析題只剩 dmgPct%，破防時全部 breakPct%。
 * 還沒開過的護盾擋在門口：這一下會讓血量跨過 70%／35% 時停在門檻上、開啟護盾（多的傷害被護盾吸走）。
 * 沒有 config.phase（舊紀錄、簡單／中等）時就是原本的 min(血量, 傷害)。
 */
function hitBoss(c: RaidConfig, s: RaidState, t: number, power: number, kind: RaidKind): { dmg: number; x?: number; open?: boolean; held?: boolean } {
  // 倍率二選一，不疊乘：破防中所有傷害 breakPct%；護盾中非分析題 dmgPct%（破防期間不會開下一層，兩者不會同時成立）
  let x = 1;
  const ph = c.phase;
  if (ph) {
    if (inBreak(s, t)) x = ph.breakPct / 100;
    else if (s.phase && kind !== 'analysis') x = ph.dmgPct / 100;
  }
  // 打折後至少 1 點（小額傷害的 20% 四捨五入會偏高一點，例如 12×20%＝2.4→2、3×20%＝0.6→1）
  let dmg = Math.min(s.bossHp, x === 1 ? power : Math.max(power > 0 ? 1 : 0, Math.round(power * x)));
  let open = false,
    held = false;
  if (ph) {
    // 還沒開過的下一層護盾擋在門檻上：不管現在是否有護盾、是否破防，血量都不會低於下一層門檻
    // （第一層存在期間把血打到 35% 以下、第二層就永遠不開的問題）。跨過門檻的那一下停在門檻上。
    const gate = nextGate(c, s);
    if (gate > 0 && s.bossHp - dmg <= gate) {
      held = dmg > s.bossHp - gate;
      dmg = Math.max(0, s.bossHp - gate);
      // 停在門檻上：沒有護盾、也不在破防中就立刻開；破防中等破防結束（advance 的 deferredOpen）；
      // 上一層護盾還在就等它被破、破防結束後再開
      open = !s.phase && !inBreak(s, t);
    }
  }
  s.bossHp -= dmg;
  return { dmg, ...(x !== 1 ? { x } : {}), ...(open ? { open } : {}), ...(held ? { held } : {}) };
}
/** 開啟下一層護盾（攻擊事件之後呼叫，戰況訊息的順序才對）。 */
function openPhase(c: RaidConfig, s: RaidState, t: number) {
  const ph = c.phase!;
  const layer = s.phaseN || 0;
  s.phase = { layer, at: t, base: ph.need[layer] ?? ph.need[ph.need.length - 1], cracks: 0, by: {}, support: 0, hinted: false };
  s.phaseN = layer + 1;
  // 魔王護甲併進護盾：歸零、護盾存在時不再回補；分析題換新的一輪（之前抽到的題目過期，送出時不計入）
  s.bossShield = 0;
  s.solved = [];
  s.round = (s.round || 0) + 1;
  push(s, { t, k: 'phaseOn', n: s.phase.base, layer });
}
/* ───────── 魔王的招式 ─────────
 * 普通攻擊 3 種（每次依時間輪到其中一種）；大招 4 種（蓄滿時決定，預告時就看得到是哪一招）。
 * cost：完全擋下需要的防護罩（毫秒）。存量不夠時擋掉一部分，傷害依比例減少。 */
export const BOSS_ATTACKS = [
  { id: 'claw', name: '爪擊', hits: 1, mult: 1, cost: 1000, tip: '普通的一擊，扣 0.5 秒防護罩' },
  { id: 'charge', name: '衝撞', hits: 1, mult: 1.8, cost: 2000, tip: '重擊，要 1 秒防護罩才擋得住' },
  { id: 'combo', name: '連擊', hits: 2, mult: 0.7, cost: 1000, tip: '連打兩下，每下扣 0.5 秒防護罩' },
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
function useShield(s: RaidState, cost: number, points = cost >= RAID_ULT_BLOCK_MS ? 5 : 2) {
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
    st.score += points;
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
  // 攻擊比較頻繁時，每下扣的防護罩與擋下的貢獻分也照比例少（每分鐘的總量不變）
  const pct = c.atkShieldPct ?? 100;
  const cost = Math.round((m.cost * pct) / 100);
  // 護盾開啟期間魔王攻擊減弱（atkPct；舊紀錄沒有這一項＝照原本）。明確設成 0＝護盾期間不普通攻擊（不扣血、不耗防護罩）
  const weak = s.phase && c.phase?.atkPct !== undefined ? c.phase.atkPct / 100 : 1;
  if (weak <= 0) return;
  for (let h = 0; h < m.hits && !s.result; h++) {
    const { used, seats } = useShield(s, cost, pct < 100 ? 1 : 2);
    const full = Math.max(1, Math.round(c.bossAtk * m.mult * weak));
    const dmg = Math.round(full * (1 - used / cost));
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
    const heal = Math.min(Math.round(dmg / (c.hpScale ?? 1)), c.bossHp - s.bossHp);
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
    if (at === deferredOpen(c, s)) {
      // 破防結束時血量已經停在下一層門檻：馬上開下一層
      openPhase(c, s, at);
    } else if (at === hintTime(c, s)) {
      // 護盾撐了 3 分鐘：提示（學生的分析題看得到）、門檻減 1
      s.phase!.hinted = true;
      push(s, { t: at, k: 'phaseHint', need: phaseNeed(c, s.phase!), layer: s.phase!.layer });
      checkBreak(c, s, at);
    } else if (s.bossUltAt !== null && at === s.bossUltAt) {
      s.bossUltAt = null;
      s.chargeFrom = at;
      s.chargeBonus = 0;
      bossUltimate(c, s, at);
      s.bossUltMove = null;
    } else if (at >= chargeDue(c, s)) {
      s.bossUltAt = at + c.bossWarnMs;
      s.bossUltMove = bossUltFor(at).id;
      push(s, { t: at, k: 'bossWarn', n: c.bossWarnMs, move: s.bossUltMove });
    } else if (at === s.nextAtk) {
      s.nextAtk += c.bossAtkEvery;
      bossAttack(c, s, at);
    } else {
      s.nextShield += c.bossShieldEvery;
      // 護盾開啟中、破防中：護甲併在護盾裡，不回補
      if (c.phase && (s.phase || inBreak(s, at))) continue;
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
  x.n[a.kind] = (x.n[a.kind] ?? 0) + 1;
  if (a.kind === 'analysis') return analysisAct(c, s, a, x);
  if (!a.ok) {
    // 連對保護：已經連對 2 題以上，第一次答錯不中斷連對（每場一次）
    if (x.streak >= 2 && !x.saved) x.saved = true;
    else x.streak = 0;
    x.redeemKind = a.kind;
    // 應用題比較難：答錯時魔王蓄力只加一半
    // 護盾期間暫停蓄力（chargePct）：答錯也不加蓄力（舊紀錄沒有這一項＝照原本）
    s.chargeBonus += Math.round((a.kind === 'ultimate' ? Math.round(c.wrongChargeMs / 2) : c.wrongChargeMs) * chargeRate(c, s));
    push(s, { t: a.t, k: 'wrong', seat: a.seat });
    return s;
  }
  x.ok[a.kind] = (x.ok[a.kind] ?? 0) + 1;
  x.streak++;
  // 效果依「這一題之前」最近 30 秒的出招比例；算完再把這一題記進去
  const eff = raidEffect(s, a.kind, a.t, c.players);
  s.recent = s.recent.filter((r) => r.t > a.t - RESIST_WINDOW_MS);
  s.recent.push({ t: a.t, kind: a.kind, seat: a.seat });
  x.best = Math.max(x.best, x.streak);
  x.score += KIND_SCORE[a.kind] + (x.streak >= 3 ? 3 : 0);
  // 贖回：上一題答錯，這一題同類型答對，再拿回一半的分數
  if (x.redeemKind === a.kind) {
    x.score += Math.round(KIND_SCORE[a.kind] / 2);
    x.redeemed = (x.redeemed || 0) + 1;
  }
  x.redeemKind = null;
  const passive = a.role && ROLE_PASSIVE[a.role].kind === a.kind;
  if (a.kind === 'attack') {
    const power = Math.max(1, Math.round(c.heroAtk * eff * (passive ? 1.3 : 1)));
    const absorbed = Math.min(s.bossShield, power);
    s.bossShield -= absorbed;
    const { dmg, x: mult, open, held } = hitBoss(c, s, a.t, power - absorbed, 'attack');
    x.dmg += dmg;
    push(s, { t: a.t, k: 'atk', seat: a.seat, n: dmg, absorbed, ...(eff < 1 ? { eff } : {}), ...(mult ? { x: mult } : {}), ...(held ? { held } : {}) });
    if (open) openPhase(c, s, a.t);
    if (s.bossHp <= 0) lastHit(s, a.t, a.seat);
  } else if (a.kind === 'shield') {
    // 存進防護罩存量（滿了就不再加）
    const room = RAID_SHIELD_MAX_MS - shieldMs(s);
    if (room > 0) s.shieldBank.push({ seat: a.seat, ms: Math.min(RAID_SHIELD_MS + (passive ? 500 : 0), room) });
    push(s, { t: a.t, k: 'shield', seat: a.seat, n: shieldMs(s) });
  } else {
    s.ult += Math.max(1, Math.round(c.ultGain * eff)) + (passive ? 5 : 0);
    s.ultBy[String(a.seat)] = (s.ultBy[String(a.seat)] || 0) + 1;
    // 護盾開啟中：全班每答對 support 題應用題，門檻減 1
    if (c.phase && s.phase) {
      const before = phaseNeed(c, s.phase);
      s.phase.support++;
      if (phaseNeed(c, s.phase) < before) {
        push(s, { t: a.t, k: 'phaseSupport', need: phaseNeed(c, s.phase), layer: s.phase.layer });
        checkBreak(c, s, a.t);
      }
    }
    if (s.ult >= RAID_ULT_NEED) {
      const seats = Object.keys(s.ultBy).map(Number);
      for (const seat of seats) stat(s, seat).ults++;
      // 合擊：最近 45 秒有幾位不同的同學答對應用題（全班一起做，傷害越高；每多 1 人 +10%，最多 2 倍）
      const team = new Set(s.recent.filter((r) => r.kind === 'ultimate' && r.t > a.t - RESIST_WINDOW_MS).map((r) => r.seat)).size;
      const combo = raidCombo(team);
      const { dmg, x: mult, open, held } = hitBoss(c, s, a.t, Math.round(c.ultDamage * combo), 'ultimate');
      // 大招傷害依累積的題數分給參與的人
      const total = Object.values(s.ultBy).reduce((p, q) => p + q, 0);
      for (const [seat, k] of Object.entries(s.ultBy)) stat(s, Number(seat)).dmg += Math.round((dmg * k) / total);
      push(s, { t: a.t, k: 'ult', seat: a.seat, n: dmg, seats, combo, team, ...(mult ? { x: mult } : {}), ...(held ? { held } : {}) });
      s.ult -= RAID_ULT_NEED;
      s.ultBy = {};
      if (open) openPhase(c, s, a.t);
      if (s.bossHp <= 0) lastHit(s, a.t, a.seat);
    }
  }
  return s;
}
/**
 * 分析題（只有 config.phase 才會有）。答錯：不扣英雄血、不加魔王蓄力、不中斷連對（鎖 20 秒是伺服器管的）。
 * 答對：每一題全班只算一次（solved；全部解完才重新開放）。護盾開啟中、這一層自己算進的還不到 cap 題＝打出裂痕；
 * 超過 cap 題、或沒有護盾時＝直接扣魔王 dmg 血（不受護盾的 20% 影響，破防時一樣 2 倍）。
 */
function analysisAct(c: RaidConfig, s: RaidState, a: RaidAction, x: RaidSeatStats): RaidState {
  const ph = c.phase;
  if (!a.ok || !ph) {
    if (!a.ok) push(s, { t: a.t, k: 'wrong', seat: a.seat });
    return s;
  }
  x.ok.analysis = (x.ok.analysis ?? 0) + 1;
  const solved = (s.solved ||= []);
  // 每一題每一輪全班只算一次：這一輪已經被解出，或是上一輪抽到的題目（開新護盾後才送出）都不計入
  // （伺服器在送出時就先擋下、回「這題剛被同學解開了」；這裡是保險，重算舊紀錄也一致）
  if ((a.q && solved.includes(a.q)) || (a.r !== undefined && a.r !== (s.round || 0))) {
    push(s, { t: a.t, k: 'crack', seat: a.seat, n: s.phase?.cracks ?? 0, dup: true });
    return s;
  }
  if (a.q) solved.push(a.q);
  x.streak++;
  x.best = Math.max(x.best, x.streak);
  x.score += KIND_SCORE.analysis;
  x.redeemKind = null;
  const p = s.phase;
  const mine = p ? p.by[String(a.seat)] || 0 : 0;
  if (p && mine < ph.cap) {
    p.by[String(a.seat)] = mine + 1;
    p.cracks++;
    x.cracks = (x.cracks || 0) + 1;
    push(s, { t: a.t, k: 'crack', seat: a.seat, n: p.cracks, need: phaseNeed(c, p), layer: p.layer });
    checkBreak(c, s, a.t);
    return s;
  }
  const { dmg, x: mult, open, held } = hitBoss(c, s, a.t, ph.dmg, 'analysis');
  x.dmg += dmg;
  push(s, { t: a.t, k: 'analysis', seat: a.seat, n: dmg, ...(mult ? { x: mult } : {}), ...(held ? { held } : {}) });
  if (open) openPhase(c, s, a.t);
  if (s.bossHp <= 0) lastHit(s, a.t, a.seat);
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
  if (!x || x.n.attack + x.n.shield + x.n.ultimate + (x.n.analysis ?? 0) === 0) return 0;
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
  give('破盾先鋒', (x) => x.cracks || 0, 2);
  for (const [seat, x] of Object.entries(stats)) if (x.lastHit) (out[seat] ||= []).push('致命一擊');
  return out;
}
