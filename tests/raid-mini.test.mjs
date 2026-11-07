// 學生作答卡上方的戰況區（raidMiniHtml）：行數固定、大招預告與抗性同時成立時兩個都要在、「已答對」是自己的數字。
// 2026-10-30 第三輪＋Codex 審查。版面高度的實測在 tests/e2e/raid-ipad.spec.ts。
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = await mkdtemp(join(tmpdir(), 'raid-mini-'));
test.after(() => rm(dir, { recursive: true, force: true }));
await build({ entryPoints: [resolve('src/raid-ui.ts'), resolve('shared/raid.ts')], outdir: dir, bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' }, loader: { '.css': 'empty' }, logLevel: 'silent' });
const ui = await import(pathToFileURL(join(dir, 'src', 'raid-ui.mjs')).href);
const raid = await import(pathToFileURL(join(dir, 'shared', 'raid.mjs')).href);
ui.initRaidUi({ esc: (s) => String(s), md: (s) => s, btn: () => '', icon: () => '', figure: () => '', serverTime: () => Date.now(), route: () => 0 });

const NOW = 1_800_000_000_000;
const T = 10_000;
function view(patch, mine = {}) {
  const config = raid.raidConfig('hard', 2, 600);
  const state = { ...raid.raidStart(config), t: T, nextAtk: T + 60_000, nextShield: T + 60_000, chargeFrom: T, ...patch };
  return { run: { id: 'r1', difficulty: 'hard', startedAt: NOW - T, seconds: 600, config }, title: '魔王戰', state, roles: {}, charging: [], pools: { attack: 1, shield: 1, ultimate: 1 }, mine };
}
const line = (html, cls) => html.match(new RegExp(`data-testid="raid-alert-${cls}">([^<]*)<`))?.[1];
const shape = (html) => [...html.matchAll(/class="(raid-mini-[a-z]+|raid-alert-line)[ "]/g)].map((m) => m[1]).join(',');
const attacks = Array.from({ length: 10 }, () => ({ t: T - 1000, kind: 'attack', seat: 5 }));

test('raid mini: boss-ultimate warning and resistance are both shown when both apply', () => {
  const html = ui.raidMiniHtml(view({ bossUltAt: T + raid.RAID_WARN_MS, recent: attacks, shieldBank: [{ seat: 5, ms: 1500 }] }), NOW);
  assert.equal(line(html, 'warn'), '⚠ 魔王大招 12 秒後・防護罩 1.5／3 秒');
  assert.match(line(html, 'resist'), /^🧬 普通攻擊只剩 \d+%，換別招！$/);
  assert.match(html, /class="raid-mini-alert warn"/);
  // 倒數到個位數：只是字變少，結構不變
  const late = ui.raidMiniHtml(view({ bossUltAt: T + 4_000, recent: attacks }), NOW);
  assert.equal(line(late, 'warn'), '⚠ 魔王大招 4 秒後・防護罩 0／3 秒');
  assert.equal(shape(late), shape(html));
});

test('raid config: the boss warns 12 seconds before its ultimate; charge + warning keeps the old 120/110/105-second cycle', () => {
  assert.equal(raid.RAID_WARN_MS, 12_000);
  const cycle = { easy: 120_000, normal: 110_000, hard: 105_000 };
  for (const d of ['easy', 'normal', 'hard'])
    for (const n of [8, 25, 30]) {
      const c = raid.raidConfig(d, n, 480);
      assert.equal(c.bossWarnMs, 12_000, `${d} ${n}`);
      assert.equal(c.bossChargeMs + c.bossWarnMs, cycle[d], `${d} ${n}`);
    }
  // 開戰後沒人作答：蓄力滿了預告，12 秒後落下
  const c = raid.raidConfig('normal', 25, 480);
  const s = raid.raidReplay(c, [], 480, c.bossChargeMs + 1);
  const warn = s.log.find((e) => e.k === 'bossWarn');
  assert.equal(warn.t, c.bossChargeMs);
  assert.equal(warn.n, 12_000);
  assert.equal(s.bossUltAt, c.bossChargeMs + 12_000);
});

test('raid mini: the same rows in every state (warning only, resistance only, neither)', () => {
  const states = [
    view({ bossUltAt: T + 12_000, recent: attacks }),
    view({ bossUltAt: T + 12_000 }),
    view({ recent: attacks }),
    view({}),
    view({}, { goal: 5 }),
  ];
  const shapes = states.map((v) => shape(ui.raidMiniHtml(v, NOW)));
  // 血條、存量／大招、自己的進度、提示格（兩行）：每一種狀態結構都一樣，高度才會固定
  for (const s of shapes) assert.equal(s, shapes[0]);
  assert.equal(shapes[0], 'raid-mini-bars,raid-mini-info,raid-mini-me,raid-mini-alert,raid-alert-line,raid-alert-line');
  assert.ok(line(ui.raidMiniHtml(states[1], NOW), 'warn'));
  assert.ok(line(ui.raidMiniHtml(states[2], NOW), 'resist'));
});

test('raid mini: "已答對" shows my own count even when a lower seat\'s shield is used during the local replay', () => {
  // 伺服器給學生的 stats 只有自己（12 號，答對 7 題）。前端往前推算時魔王攻擊用掉 3 號的防護罩，替 3 號建立成績；
  // 數字形式的 key 會排在前面（'3' < '12'），以前拿 Object.values(stats)[0] 會顯示 3 號的 0 題。
  const mine = { n: { attack: 7, shield: 0, ultimate: 0 }, ok: { attack: 7, shield: 0, ultimate: 0 }, dmg: 0, blocks: 0, ults: 0, streak: 0, best: 3, score: 70 };
  const v = view({ nextAtk: T + 200, shieldBank: [{ seat: 3, ms: 5000 }], stats: { 12: mine } });
  const s = ui.liveState(v, NOW + 500);
  assert.deepEqual(Object.keys(s.stats), ['3', '12'], 'the replay created seat 3 before me');
  const html = ui.raidMiniHtml(v, NOW + 500);
  assert.match(html, /已答對 <b>7<\/b> 題/);
  // 還沒答過題（伺服器沒有給自己的成績）：一直顯示 0 題，不會忽有忽無
  const fresh = ui.raidMiniHtml(view({ nextAtk: T + 200, shieldBank: [{ seat: 3, ms: 5000 }] }), NOW + 500);
  assert.match(fresh, /已答對 <b>0<\/b> 題/);
});

test('raid mini: shield states (none, open, broken, open + boss warning) keep the same rows; the status sits inside the fixed rows', () => {
  const config = raid.raidConfig('hard', 28, 600, 18);
  const base = { ...raid.raidStart(config), t: T, nextAtk: T + 60_000, nextShield: T + 60_000, chargeFrom: T };
  const v = (patch) => ({ run: { id: 'r2', difficulty: 'hard', startedAt: NOW - T, seconds: 600, config }, title: '魔王戰', state: { ...base, ...patch }, roles: {}, charging: [], pools: { attack: 1, shield: 1, ultimate: 1, analysis: 18 }, mine: {} });
  const open = { phase: { layer: 0, at: T - 5000, base: 6, cracks: 3, by: { 5: 1 }, support: 10, hinted: false } };
  const states = [v({}), v(open), v({ phase: null, breakUntil: T + 12_000 }), v({ ...open, bossUltAt: T + 12_000 }), v({ ...open, recent: attacks })];
  const html = states.map((x) => ui.raidMiniHtml(x, NOW));
  for (const h of html) assert.equal(shape(h), 'raid-mini-bars,raid-mini-info,raid-mini-me,raid-mini-alert,raid-alert-line,raid-alert-line');
  const ph = (h) => h.match(/data-testid="raid-mini-phase">([^<]*)</)?.[1];
  assert.equal(ph(html[0]), '');
  assert.equal(ph(html[1]), '🔰 破盾 3/5', 'support lowered the threshold 6 → 5');
  assert.equal(ph(html[2]), '💥 破防 12 秒');
  assert.match(html[1], /raid-bar boss small shielded/);
  assert.match(html[2], /raid-bar boss small guard-broken/);
  assert.equal(line(html[3], 'warn'), '⚠ 魔王大招 12 秒後・防護罩 0／3 秒', 'the boss warning keeps its line');
  // 簡單／中等、沒有分析題：戰況區的 HTML 和以前一樣（沒有護盾那一格）
  assert.doesNotMatch(ui.raidMiniHtml(view({}), NOW), /raid-mini-phase/);
});

test('raid mini: "boss attacks weaken" sits in the first tip line while the shield is up (same rows); older shield runs keep the old text', () => {
  const config = raid.raidConfig('hard', 28, 600, 18);
  const base = { ...raid.raidStart(config), t: T, nextAtk: T + 60_000, nextShield: T + 60_000, chargeFrom: T };
  const v = (patch, cfg = config) => ({ run: { id: 'r3', difficulty: 'hard', startedAt: NOW - T, seconds: 600, config: cfg }, title: '魔王戰', state: { ...base, ...patch }, roles: {}, charging: [], pools: { attack: 1, shield: 1, ultimate: 1, analysis: 18 }, mine: {} });
  const open = { phase: { layer: 0, at: T - 5000, base: 6, cracks: 1, by: { 5: 1 }, support: 0, hinted: false } };
  const lines = (h) => [...h.matchAll(/class="raid-alert-line [a-z]+" data-testid="raid-alert-[a-z]+">([^<]*)</g)].map((m) => m[1]);
  const on = ui.raidMiniHtml(v(open), NOW);
  assert.deepEqual(lines(on), ['🛡 普攻剩 25%・蓄力暫停', '🛡 護盾：其他只剩 50%，做分析題']);
  // 沒有護盾、破防：第 1 行是原本的說明
  assert.equal(lines(ui.raidMiniHtml(v({}), NOW))[0], '記憶題攻擊・理解題存防護罩・應用題累積大招');
  assert.equal(lines(ui.raidMiniHtml(v({ phase: null, breakUntil: T + 12_000 }), NOW))[0], '記憶題攻擊・理解題存防護罩・應用題累積大招');
  // 大招預告、抗性優先（行數不變）
  assert.match(lines(ui.raidMiniHtml(v({ ...open, bossUltAt: T + 12_000 }), NOW))[0], /^⚠ 魔王大招/);
  assert.match(lines(ui.raidMiniHtml(v({ ...open, recent: attacks }), NOW))[0], /^🧬/);
  // 2ad505f 的護盾場次（沒有 atkPct／chargePct）：沒有這一句
  const old = { ...config, phase: { ...config.phase } };
  delete old.phase.atkPct;
  delete old.phase.chargePct;
  const h = ui.raidMiniHtml(v(open, old), NOW);
  assert.equal(lines(h)[0], '記憶題攻擊・理解題存防護罩・應用題累積大招');
  assert.equal(shape(h), shape(on));
});
