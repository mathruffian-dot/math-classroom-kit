// 困難魔王的護盾與分析題（shared/raid.ts）：開啟點、門檻、支援、3 分鐘提示、每人 2 題、超出轉傷害、每題只算一次、
// 護盾中 20% 傷害、破防 15 秒 2 倍、魔王護甲併進護盾；舊紀錄（沒有 config.phase）、簡單／中等和改版前的規則逐筆一樣。
// 伺服器的抽題、20 秒鎖定、判斷＋理由在 tests/backend.test.mjs 的「raid analysis」。
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = await mkdtemp(join(tmpdir(), 'raid-shield-'));
test.after(() => rm(dir, { recursive: true, force: true }));
await build({ entryPoints: [resolve('shared/raid.ts'), resolve('tests/fixtures/raid-legacy.ts')], outdir: dir, bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' }, logLevel: 'silent' });
const raid = await import(pathToFileURL(join(dir, 'shared', 'raid.mjs')).href);
const legacy = await import(pathToFileURL(join(dir, 'tests', 'fixtures', 'raid-legacy.mjs')).href);

const S = 600;
/** 只看英雄這邊的計算：魔王不攻擊、不回護甲、不蓄力（要測的才打開）。 */
function quiet(players = 28, patch = {}) {
  return { ...raid.raidConfig('hard', players, 480, 18), bossAtkEvery: 9e9, bossShieldEvery: 9e9, bossChargeMs: 9e9, ...patch };
}
const atk = (t, seat = 1, ok = true) => ({ t, seat, kind: 'attack', ok });
const ana = (t, seat, q, ok = true) => ({ t, seat, kind: 'analysis', ok, q });
const ult = (t, seat, ok = true) => ({ t, seat, kind: 'ultimate', ok });
/** 用大傷害的普通攻擊打到第一層護盾開啟。 */
function toShield(c, t = 1000) {
  const s = raid.raidStart(c);
  let i = 0;
  while (!s.phase) raid.act(c, s, atk(t + i++ * 10, 99), S);
  return s;
}

test('raid shield: only the hard boss with analysis questions gets shields; thresholds 20%/25% of online players, at least 3', () => {
  for (const d of ['easy', 'normal']) assert.equal(raid.raidConfig(d, 28, 480, 18).phase, undefined, d);
  assert.equal(raid.raidConfig('hard', 28, 480, 0).phase, undefined, 'no analysis questions: the old hard boss');
  const need = (n) => raid.raidConfig('hard', n, 480, 18).phase.need;
  assert.deepEqual(need(28), [6, 7]); // 5.6→6、7
  assert.deepEqual(need(25), [5, 7]); // 5、6.25→7
  assert.deepEqual(need(30), [6, 8]); // 6、7.5→8
  assert.deepEqual(need(40), [8, 10]);
  assert.deepEqual(need(10), [3, 3], 'at least 3');
  assert.deepEqual(need(1), [3, 3]);
  const ph = raid.raidConfig('hard', 28, 480, 18).phase;
  assert.deepEqual(ph.at, [70, 35]);
  assert.equal(ph.dmgPct, 20);
  assert.equal(ph.breakMs, 15_000);
  assert.equal(ph.breakPct, 200);
  assert.equal(ph.support, 10);
  assert.equal(ph.hintMs, 180_000);
  assert.equal(ph.cap, 2);
  assert.equal(ph.pool, 18);
  assert.equal(raid.RAID_WARN_MS, 12_000, 'the 12-second ultimate warning is kept');
});

test('raid shield: opens exactly at 70% and 35% (the hit that crosses stops at the gate); the boss armor merges into the shield', () => {
  const c = quiet(28, { heroAtk: 100, bossShieldEvery: 500, bossShieldGain: 5, bossShieldMax: 5 });
  const gate1 = Math.ceil(c.bossHp * 0.7);
  const s = raid.raidStart(c);
  let t = 1000;
  while (!s.phase) raid.act(c, s, atk((t += 1000)), S);
  assert.equal(s.bossHp, gate1, 'stops at 70%');
  assert.equal(s.phase.layer, 0);
  assert.equal(s.phase.base, 6);
  const tail = s.log.slice(-2).map((e) => e.k);
  assert.deepEqual(tail, ['atk', 'phaseOn'], 'attack first, then the shield');
  assert.equal(s.bossShield, 0, 'armor merged into the shield');
  // 護盾中護甲不回補
  raid.advance(c, s, t + 30_000, S);
  assert.equal(s.bossShield, 0);
  const before = s.log.filter((e) => e.k === 'bossShield').length;
  raid.advance(c, s, t + 60_000, S);
  assert.equal(s.log.filter((e) => e.k === 'bossShield').length, before);
});

test('raid shield: non-analysis damage is 20% while the shield is up; analysis over the cap hits for full damage', () => {
  const c = quiet(28);
  const s = toShield({ ...c, heroAtk: 200 });
  const hp = s.bossHp;
  const c2 = { ...c }; // 普通攻擊 12
  raid.act(c2, s, atk(5000, 1), S);
  const e = s.log.at(-1);
  assert.equal(e.k, 'atk');
  assert.equal(e.n, Math.round(12 * 0.2));
  assert.equal(e.x, 0.2);
  assert.equal(s.bossHp, hp - 2);
  // 大招：4 題應用題（不同的人），合擊後 ×0.2
  for (let i = 0; i < 4; i++) raid.act(c2, s, ult(6000 + i, 10 + i), S);
  const u = s.log.findLast((x) => x.k === 'ult');
  assert.equal(u.n, Math.round(Math.round(100 * u.combo) * 0.2));
  assert.equal(u.x, 0.2);
});

test('raid shield: each student counts at most 2 analysis answers per layer; the rest hit the boss directly', () => {
  const c = quiet(28);
  const s = toShield({ ...c, heroAtk: 200 });
  raid.act(c, s, ana(5000, 3, 'a1'), S);
  raid.act(c, s, ana(5100, 3, 'a2'), S);
  assert.equal(s.phase.cracks, 2);
  assert.equal(s.phase.by['3'], 2);
  const hp = s.bossHp;
  raid.act(c, s, ana(5200, 3, 'a3'), S);
  assert.equal(s.phase.cracks, 2, 'third one does not crack');
  const e = s.log.at(-1);
  assert.equal(e.k, 'analysis');
  assert.equal(e.n, c.phase.dmg, 'full damage (not reduced by the shield)');
  assert.equal(s.bossHp, hp - c.phase.dmg);
  assert.equal(s.stats['3'].cracks, 2);
  assert.equal(s.stats['3'].ok.analysis, 3);
  // 沒有護盾時：分析題答對＝直接傷害
  const s2 = raid.raidStart(c);
  raid.act(c, s2, ana(1000, 4, 'a1'), S);
  assert.equal(s2.log.at(-1).k, 'analysis');
  assert.equal(s2.bossHp, c.bossHp - c.phase.dmg);
});

test('raid shield: each analysis question counts once for the whole class (a second solver gets no crack or score)', () => {
  const c = quiet(28);
  const s = toShield({ ...c, heroAtk: 200 });
  raid.act(c, s, ana(5000, 3, 'a1'), S);
  raid.act(c, s, ana(5100, 4, 'a1'), S);
  assert.equal(s.phase.cracks, 1);
  assert.equal(s.log.at(-1).dup, true);
  assert.equal(s.stats['4'].score, 0);
  assert.deepEqual(s.solved, ['a1']);
  // 這一輪的題目全部解完：不重新開放（同一題不會在同一層再計入），等下一層護盾才換新的一輪
  const c3 = quiet(28, { phase: { ...c.phase, pool: 2 } });
  const s3 = toShield({ ...c3, heroAtk: 200 });
  raid.act(c3, s3, ana(5000, 3, 'a1'), S);
  raid.act(c3, s3, ana(5100, 4, 'a2'), S);
  assert.deepEqual(s3.solved, ['a1', 'a2'], 'all solved: stays solved for this layer');
  raid.act(c3, s3, ana(5200, 5, 'a1'), S);
  assert.equal(s3.log.at(-1).dup, true);
  assert.equal(s3.phase.cracks, 2);
});

test('raid shield: a question drawn in an earlier round (before a new shield opened) does not count; each question counts once per layer', () => {
  const c = quiet(28);
  const s = raid.raidStart(c);
  assert.equal(s.round, 0);
  // 開戰後（還沒有護盾）解出 a1：直接傷害，這一輪 a1 已解
  raid.act(c, s, { ...ana(1000, 3, 'a1'), r: 0 }, S);
  assert.equal(s.log.at(-1).k, 'analysis');
  // 6 號在第 0 輪抽到 a2，還沒送出時第一層護盾開了（第 1 輪）
  const big = { ...c, heroAtk: 400 };
  while (!s.phase) raid.act(big, s, atk(s.t + 10, 99), S);
  assert.equal(s.round, 1);
  assert.deepEqual(s.solved, [], 'new layer: new round');
  raid.act(c, s, { ...ana(s.t + 100, 6, 'a2'), r: 0 }, S);
  assert.equal(s.log.at(-1).dup, true, 'stale round: not counted');
  assert.equal(s.phase.cracks, 0);
  assert.equal(s.stats['6'].score, 0);
  // 同一題在新的一輪（這一層）可以計入一次，第二次就不行
  raid.act(c, s, { ...ana(s.t + 200, 7, 'a1'), r: 1 }, S);
  assert.equal(s.phase.cracks, 1);
  raid.act(c, s, { ...ana(s.t + 300, 8, 'a1'), r: 1 }, S);
  assert.equal(s.phase.cracks, 1);
  assert.equal(s.log.at(-1).dup, true);
});

test('raid shield: while layer 1 is up the boss never drops below the 35% gate; layer 2 opens right after the break ends', () => {
  const c = quiet(28);
  const gate2 = Math.ceil(c.bossHp * 0.35);
  const s = toShield({ ...c, heroAtk: 200 }, 1000);
  assert.equal(s.phase.layer, 0);
  // 第一層存在期間：超過上限的分析重擊（全額）與很大的攻擊，血量停在 35%，不會跳過第二層
  for (let i = 0; i < 2; i++) raid.act(c, s, ana(2000 + i, 40, `x${i}`), S);
  for (let i = 0; i < 40; i++) raid.act(c, s, ana(3000 + i, 41, `y${i}`), S);
  for (let i = 0; i < 20; i++) raid.act({ ...c, heroAtk: 5000 }, s, atk(4000 + i, 1), S);
  assert.equal(s.bossHp, gate2, 'held at the layer-2 gate');
  assert.equal(s.phaseN, 1, 'layer 2 not opened while layer 1 is up');
  assert.equal(s.log.at(-1).held, true);
  assert.equal(s.result, null);
  // 破第一層：破防 15 秒中不開第二層，破防結束那一刻開
  for (let i = 0; i < 6; i++) raid.act(c, s, ana(5000 + i, 50 + i, `z${i}`), S);
  assert.equal(s.phase, null);
  const end = s.breakUntil;
  raid.advance(c, s, end - 1, S);
  assert.equal(s.phase, null, 'no layer 2 during the break');
  raid.act(c, s, atk(end - 500, 1), S);
  assert.equal(s.log.at(-1).n, 0, 'still held during the break');
  raid.advance(c, s, end, S);
  assert.equal(s.phase?.layer, 1, 'layer 2 opens when the break ends');
  assert.equal(s.phase.at, end);
  assert.equal(s.log.at(-1).k, 'phaseOn');
});

test('raid shield: break and the next layer never stack (×2 during the break, ×0.2 under the shield, never ×0.4)', () => {
  // 血量固定 280：打到 35% 的那幾下不要多到觸發記憶題抗性（這裡只測倍率）
  const c = quiet(28, { bossHp: 280 });
  const gate2 = Math.ceil(c.bossHp * 0.35);
  const s = toShield({ ...c, heroAtk: 200 }, 1000);
  for (let i = 0; i < 6; i++) raid.act(c, s, ana(2000 + i, 50 + i, `z${i}`), S);
  assert.equal(s.phase, null);
  // 破防中打到 35%：停在門檻、不開第二層，倍率一直是 ×2
  while (s.bossHp > gate2) raid.act({ ...c, heroAtk: 100 }, s, atk(s.t + 10, 1), S);
  const hits = s.log.filter((e) => e.k === 'atk' && e.t > 2005);
  assert(hits.every((e) => e.x === 2), 'every hit during the break is ×2');
  assert.equal(s.phase, null);
  raid.act(c, s, atk(s.t + 10, 1), S);
  assert.equal(s.log.at(-1).x, 2);
  assert.equal(s.log.at(-1).n, 0, 'held at the gate');
  raid.advance(c, s, s.breakUntil, S);
  assert.equal(s.phase.layer, 1);
  // 第二層：×0.2，不是 ×0.4
  raid.act(c, s, atk(s.t + 10, 1), S);
  assert.equal(s.log.at(-1).x, 0.2);
  assert.equal(s.log.at(-1).n, Math.round(12 * 0.2));
  for (const e of s.log) if (e.x !== undefined) assert([0.2, 2].includes(e.x), `x=${e.x}`);
});

test('raid shield: a wrong analysis answer costs no hero HP, no boss charge and no streak', () => {
  const c = quiet(28, { bossChargeMs: 90_000 });
  const s = raid.raidStart(c);
  raid.act(c, s, atk(1000, 5), S);
  raid.act(c, s, atk(1100, 5), S);
  const before = { team: s.teamHp, charge: s.chargeBonus, streak: s.stats['5'].streak };
  raid.act(c, s, ana(1200, 5, 'a1', false), S);
  assert.equal(s.teamHp, before.team);
  assert.equal(s.chargeBonus, before.charge);
  assert.equal(s.stats['5'].streak, before.streak);
  assert.equal(s.stats['5'].n.analysis, 1);
  assert.equal(raid.RAID_ANALYSIS_LOCK_MS, 20_000);
});

test('raid shield: breaking the shield at the threshold; 15 seconds of double damage; armor regrows only afterwards', () => {
  const c = quiet(28, { bossShieldEvery: 20_000, bossShieldGain: 4, bossShieldMax: 8 });
  const s = toShield({ ...c, heroAtk: 200 }, 1000);
  for (let i = 0; i < 6; i++) raid.act(c, s, ana(5000 + i * 100, 10 + Math.floor(i / 2), `q${i}`), S);
  assert.equal(s.phase, null, 'broken at 6 cracks');
  const brk = s.log.findLast((e) => e.k === 'phaseBreak');
  assert.equal(brk.t, 5500);
  assert.deepEqual(brk.seats, [10, 11, 12]);
  assert.equal(s.breakUntil, 5500 + 15_000);
  assert.equal(s.stats['10'].score, 2 * raid.KIND_SCORE.analysis + raid.RAID_BREAK_SCORE, 'crackers get the break bonus');
  raid.act(c, s, atk(10_000, 1), S);
  assert.equal(s.log.at(-1).n, 24, '×2 during the break');
  assert.equal(s.log.at(-1).x, 2);
  assert.equal(s.bossShield, 0, 'no armor during the break');
  raid.act(c, s, atk(20_400, 1), S);
  assert.equal(s.log.at(-1).x, 2, 'still in the break');
  raid.act(c, s, atk(20_600, 1), S);
  assert.equal(s.log.at(-1).x, undefined, 'break over');
  raid.advance(c, s, 41_000, S);
  assert(s.bossShield > 0, 'armor regrows after the break');
  // 第二層在 35%
  const c2 = { ...c, heroAtk: 400 };
  while (!s.phase && !s.result) raid.act(c2, s, atk(s.t + 10, 1), S);
  assert.equal(s.phase.layer, 1);
  assert.equal(s.phase.base, 7);
  assert.equal(s.bossHp, Math.ceil(c.bossHp * 0.35));
});

test('raid shield: support (every 10 application answers) and the 3-minute hint lower the threshold, never below 1', () => {
  const c = quiet(28);
  const s = toShield({ ...c, heroAtk: 200 }, 1000);
  const at = s.phase.at;
  for (let i = 0; i < 10; i++) raid.act(c, s, ult(at + 100 + i, 20 + (i % 3)), S);
  assert.equal(raid.phaseNeed(c, s.phase), 5);
  assert.equal(s.log.filter((e) => e.k === 'phaseSupport').length, 1);
  for (let i = 0; i < 10; i++) raid.act(c, s, ult(at + 200 + i, 20 + (i % 3)), S);
  assert.equal(raid.phaseNeed(c, s.phase), 4);
  // 3 分鐘：提示、門檻再減 1
  raid.advance(c, s, at + 180_000 - 1, S);
  assert.equal(s.phase.hinted, false);
  raid.advance(c, s, at + 180_000, S);
  assert.equal(s.phase.hinted, true);
  assert.equal(s.log.at(-1).k, 'phaseHint');
  assert.equal(raid.phaseNeed(c, s.phase), 3);
  // 最低 1：支援很多次、又有提示
  assert.equal(raid.phaseNeed(c, { ...s.phase, cracks: 0, support: 999, hinted: true }), 1);
  // 門檻降到已經有的裂痕數：馬上破盾
  const s2 = toShield({ ...c, heroAtk: 200 }, 1000);
  for (let i = 0; i < 5; i++) raid.act(c, s2, ana(s2.phase.at + 100 + i, 30 + i, `q${i}`), S);
  assert.equal(s2.phase.cracks, 5);
  for (let i = 0; i < 10; i++) raid.act(c, s2, ult(s2.phase.at + 1000 + i, 20 + (i % 3)), S);
  assert.equal(s2.phase, null, 'support brought the threshold down to 5 → broken');
  const s3 = toShield({ ...c, heroAtk: 200 }, 1000);
  for (let i = 0; i < 5; i++) raid.act(c, s3, ana(s3.phase.at + 100 + i, 30 + i, `q${i}`), S);
  raid.advance(c, s3, s3.phase.at + 180_000, S);
  assert.equal(s3.phase, null, 'the hint brought the threshold down to 5 → broken');
});

test('raid shield: titles and badges count analysis answers', () => {
  const x = { n: { attack: 0, shield: 0, ultimate: 0, analysis: 2 }, ok: { attack: 0, shield: 0, ultimate: 0, analysis: 2 }, cracks: 2, dmg: 0, blocks: 0, ults: 0, streak: 2, best: 2, score: 80 };
  assert.equal(raid.raidLevel(x, 5) > 0, true);
  assert.deepEqual(raid.raidBadges({ 7: x }), { 7: ['破盾先鋒'] });
});

/** 隨機的一場（各類題目、答對答錯、角色），用來比對新舊規則。 */
function randomActions(seed, n = 260) {
  let r = seed;
  const rnd = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  const kinds = ['attack', 'shield', 'ultimate'];
  const roles = ['knight', 'mage', 'archer'];
  let t = 2000;
  return Array.from({ length: n }, () => ({ t: (t += Math.floor(rnd() * 2500)), seat: 1 + Math.floor(rnd() * 28), kind: kinds[Math.floor(rnd() * 3)], ok: rnd() < 0.75, role: roles[Math.floor(rnd() * 3)] }));
}
test('raid shield: old records (no config.phase), easy and normal replay exactly as before the change', () => {
  for (const d of ['easy', 'normal', 'hard'])
    for (const n of [8, 25, 28, 30])
      for (const secs of [300, 480, 600]) {
        // 簡單／中等不管題庫有沒有分析題，設定和以前完全一樣；困難沒有分析題時也一樣
        const old = legacy.raidConfig(d, n, secs);
        assert.deepEqual(raid.raidConfig(d, n, secs, d === 'hard' ? 0 : 18), old, `${d} ${n} ${secs}`);
      }
  for (let seed = 1; seed <= 12; seed++) {
    const d = ['easy', 'normal', 'hard'][seed % 3];
    const c = legacy.raidConfig(d, 28, 480);
    const acts = randomActions(seed);
    for (const to of [60_000, 240_000, 480_000]) assert.deepEqual(raid.raidReplay(c, acts, 480, to), legacy.raidReplay(c, acts, 480, to), `seed ${seed} ${d} ${to}`);
  }
  // 舊紀錄（存的是改版前的設定，沒有 hpScale／atkShieldPct／phase）
  const c = legacy.raidConfig('hard', 25, 480);
  delete c.hpScale;
  delete c.atkShieldPct;
  const acts = randomActions(99);
  assert.deepEqual(raid.raidReplay(c, acts, 480, 480_000), legacy.raidReplay(c, acts, 480, 480_000));
});

/* ───────── 護盾期間魔王攻擊減弱（2026-11-01）：普通攻擊減半、暫停蓄力；血量回到原本的每人每秒血量 ───────── */
test('raid shield: hard boss HP uses the original per-student rate over the time without shields; easy/normal and the old hard boss unchanged', () => {
  const hard = (n, secs) => raid.raidConfig('hard', n, secs, 18);
  // n × 106 ×（秒數 − 264）/ 390（25 人以上不打折）
  assert.equal(hard(28, 480).bossHp, 1640);
  assert.equal(hard(28, 300).bossHp, 270);
  assert.equal(hard(25, 480).bossHp, 1470);
  assert.equal(hard(30, 300).bossHp, 290);
  assert.equal(hard(28, 600).bossHp, 2560);
  assert.equal(raid.raidConfig('hard', 28, 480, 0).bossHp, 2970, 'no analysis questions: original 2970');
  for (const d of ['easy', 'normal']) assert.deepEqual(raid.raidConfig(d, 28, 480, 18), legacy.raidConfig(d, 28, 480), d);
  const ph = hard(28, 480).phase;
  assert.equal(ph.atkPct, 50);
  assert.equal(ph.chargePct, 0);
  assert.equal(raid.phaseWeakText(ph), '普攻減半、暫停蓄力');
  assert.equal(raid.phaseWeakText(ph, true), '普攻減半・蓄力暫停');
  assert.equal(raid.phaseWeakText({ ...ph, atkPct: undefined, chargePct: undefined }), '', 'older shield runs: no text');
  // 其他項目和血量以外的設定與舊的困難魔王一樣
  const { phase: _p, bossHp: _h, ...rest } = hard(28, 480);
  const { bossHp: _h2, ...old } = legacy.raidConfig('hard', 28, 480);
  assert.deepEqual(rest, old);
});

/** 打開第一層護盾，之後只留魔王的普通攻擊（不蓄力）。 */
function underShield(patch = {}) {
  const c = quiet(28, { bossAtkEvery: 3000, ...patch });
  const s = toShield({ ...c, heroAtk: 400 });
  return { c, s };
}
const teamLoss = (s, from) => s.log.filter((e) => e.k === 'bossAtk' && e.t > from).reduce((p, e) => p + e.n, 0);
test('raid shield: boss normal attacks are halved only while the shield is up (no hero shield to absorb)', () => {
  const weak = underShield();
  const full = underShield();
  delete full.c.phase.atkPct;
  const t0 = weak.s.t;
  raid.advance(weak.c, weak.s, t0 + 60_000, S);
  raid.advance(full.c, full.s, t0 + 60_000, S);
  const a = teamLoss(weak.s, t0),
    b = teamLoss(full.s, t0);
  assert(b > 0);
  assert(Math.abs(a - b / 2) <= weak.s.log.filter((e) => e.k === 'bossAtk' && e.t > t0).length, `halved: ${a} vs ${b}`);
  // 每一下都是原本的一半（四捨五入，至少 1）
  for (const e of weak.s.log.filter((x) => x.k === 'bossAtk' && x.t > t0)) assert.equal(e.n, Math.max(1, Math.round(weak.c.bossAtk * raid.bossAttackAt(e.t).mult * 0.5)));
  // 破盾後（破防、沒有護盾）恢復原本的傷害
  const { c, s } = weak;
  for (let i = 0; i < 6; i++) raid.act(c, s, ana(s.t + 10 + i, 50 + i, `z${i}`), S);
  assert.equal(s.phase, null);
  const t1 = s.t;
  const hp = s.teamHp;
  raid.advance(c, s, t1 + 30_000, S);
  const after = s.log.filter((e) => e.k === 'bossAtk' && e.t > t1);
  assert(after.length > 0);
  for (const e of after) assert.equal(e.n, Math.max(1, Math.round(c.bossAtk * raid.bossAttackAt(e.t).mult)), 'full damage after the break');
  assert.equal(hp - s.teamHp, after.reduce((p, e) => p + e.n, 0));
});

test('raid shield: boss charge pauses while the shield is up and resumes where it was after the break; a warned ultimate still lands', () => {
  const c = quiet(28, { bossChargeMs: 90_000 });
  const s = toShield({ ...c, heroAtk: 400 }, 30_000);
  const openAt = s.phase.at;
  const level = raid.chargeLevel(c, s);
  assert(Math.abs(level - openAt / 90_000) < 1e-9);
  raid.advance(c, s, openAt + 150_000, S); // 不到 3 分鐘提示
  assert.equal(s.bossUltAt, null, 'no warning while the shield is up');
  assert(Math.abs(raid.chargeLevel(c, s) - level) < 1e-9, 'the charge bar stays still');
  const brk = s.t + 10;
  for (let i = 0; i < 6; i++) raid.act(c, s, ana(brk + i, 50 + i, `z${i}`), S);
  assert.equal(s.phase, null);
  const left = 90_000 - openAt; // 護盾開啟時還差的蓄力
  raid.advance(c, s, brk + 5 + left - 1000, S);
  assert.equal(s.bossUltAt, null);
  raid.advance(c, s, brk + 5 + left + 1000, S);
  assert.notEqual(s.bossUltAt, null, 'charge resumes after the break');
  // 已經預告的大招：護盾開了還是會落下
  const c2 = quiet(28, { bossChargeMs: 2000 });
  const s2 = raid.raidStart(c2);
  raid.advance(c2, s2, 2500, S);
  assert.notEqual(s2.bossUltAt, null);
  while (!s2.phase) raid.act({ ...c2, heroAtk: 400 }, s2, atk(s2.t + 10, 99), S);
  raid.advance(c2, s2, s2.t + 20_000, S);
  assert(s2.log.some((e) => e.k === 'bossUlt' || e.k === 'bossUltBlock'), 'warned ultimate lands');
  assert.equal(s2.bossUltAt, null, 'no new charge under the shield');
});

test('raid shield: shield runs stored before the weakening (no atkPct/chargePct) replay unchanged', () => {
  // 2ad505f 的護盾場次：config.phase 沒有 atkPct／chargePct（血量 280）＝護盾期間照常攻擊、照常蓄力
  const c = raid.raidConfig('hard', 28, 480, 18);
  c.bossHp = 280;
  delete c.phase.atkPct;
  delete c.phase.chargePct;
  const s = toShield({ ...c, heroAtk: 400 });
  const t0 = s.t;
  raid.advance(c, s, t0 + 120_000, S);
  for (const e of s.log.filter((x) => x.k === 'bossAtk' && x.t > t0 && !x.blocked)) assert.equal(e.n, Math.max(1, Math.round(c.bossAtk * raid.bossAttackAt(e.t).mult)));
  assert.equal(s.tally.bossWarn > 0 || s.tally.bossUlt > 0 || s.tally.bossUltBlock > 0 || s.bossUltAt !== null, true, 'still charging under the shield');
  // 隨機作答重算：有沒有寫 atkPct=100、chargePct=100 結果一樣（不減弱＝舊規則）
  const acts = randomActions(7).map((a) => ({ ...a }));
  const c100 = { ...c, phase: { ...c.phase, atkPct: 100, chargePct: 100 } };
  assert.deepEqual(raid.raidReplay(c, acts, 480, 480_000), raid.raidReplay(c100, acts, 480, 480_000));
});

test('raid shield: wrong answers under the shield add no charge and never announce a new ultimate (Codex P1); older shield runs still charge', () => {
  const c = quiet(28, { bossChargeMs: 90_000 });
  const s = toShield({ ...c, heroAtk: 400 }, 30_000);
  const level = raid.chargeLevel(c, s);
  assert(level > 0.3 && level < 0.4, `about 32% charged when the shield opens (${level})`);
  const bonus = s.chargeBonus;
  // 18 次普通題答錯（記憶、理解、應用都有），以前會把蓄力加到 100% 並宣告大招
  for (let i = 0; i < 18; i++) raid.act(c, s, { t: s.t + 2000, seat: 10 + (i % 5), kind: ['attack', 'shield', 'ultimate'][i % 3], ok: false }, S);
  assert.equal(s.chargeBonus, bonus, 'no charge from wrong answers under the shield');
  assert(Math.abs(raid.chargeLevel(c, s) - level) < 1e-9);
  raid.advance(c, s, s.phase.at + 170_000, S);
  assert.equal(s.bossUltAt, null);
  assert.equal(s.log.filter((e) => e.k === 'bossWarn').length, 0, 'no new ultimate announced');
  // 破盾後答錯照常加蓄力
  for (let i = 0; i < 6; i++) raid.act(c, s, ana(s.t + 10 + i, 50 + i, `z${i}`), S);
  assert.equal(s.phase, null);
  raid.act(c, s, { t: s.t + 100, seat: 3, kind: 'attack', ok: false }, S);
  assert.equal(s.chargeBonus, bonus + c.wrongChargeMs);
  // 2026-10-31 的護盾場次（沒有 chargePct）：護盾中答錯照舊加蓄力、會宣告大招
  const old = quiet(28, { bossChargeMs: 90_000 });
  delete old.phase.atkPct;
  delete old.phase.chargePct;
  const s2 = toShield({ ...old, heroAtk: 400 }, 30_000);
  raid.act(old, s2, { t: s2.t + 2000, seat: 10, kind: 'attack', ok: false }, S);
  assert.equal(s2.chargeBonus, old.wrongChargeMs, 'old rule: a wrong answer under the shield adds charge');
  for (let i = 1; i < 18; i++) raid.act(old, s2, { t: s2.t + 2000, seat: 10 + (i % 5), kind: 'attack', ok: false }, S);
  assert(s2.log.some((e) => e.k === 'bossWarn'), 'old rule: the boss still announces');
});

test('raid shield: atkPct explicitly 0 means no normal attacks under the shield (no damage, no hero shield used); undefined keeps the old floor of 1', () => {
  const zero = underShield();
  zero.c.phase.atkPct = 0;
  zero.s.shieldBank.push({ seat: 3, ms: 5000 });
  const t0 = zero.s.t;
  const hp = zero.s.teamHp;
  raid.advance(zero.c, zero.s, t0 + 60_000, S);
  assert.equal(zero.s.teamHp, hp);
  assert.equal(raid.shieldMs(zero.s), 5000, 'hero shield not used');
  assert.equal(zero.s.log.filter((e) => (e.k === 'bossAtk' || e.k === 'bossBlock') && e.t > t0).length, 0);
  // 小額傷害打 1%：仍然至少 1 點（只有明確 0 才完全不攻擊）
  const tiny = underShield();
  tiny.c.phase.atkPct = 1;
  const t1 = tiny.s.t;
  raid.advance(tiny.c, tiny.s, t1 + 30_000, S);
  const hits = tiny.s.log.filter((e) => e.k === 'bossAtk' && e.t > t1);
  assert(hits.length > 0 && hits.every((e) => e.n === 1));
});
