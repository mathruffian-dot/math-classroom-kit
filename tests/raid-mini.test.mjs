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
ui.initRaidUi({ esc: (s) => String(s), md: (s) => s, btn: () => '', icon: () => '', figure: () => '', serverTime: () => Date.now() });

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
  const html = ui.raidMiniHtml(view({ bossUltAt: T + 20_000, recent: attacks, shieldBank: [{ seat: 5, ms: 1500 }] }), NOW);
  assert.equal(line(html, 'warn'), '⚠ 魔王大招 20 秒後・防護罩 1.5／3 秒');
  assert.match(line(html, 'resist'), /^🧬 普通攻擊效果只剩 \d+%，換別的招！$/);
  assert.match(html, /class="raid-mini-alert warn"/);
});

test('raid mini: the same rows in every state (warning only, resistance only, neither)', () => {
  const states = [
    view({ bossUltAt: T + 20_000, recent: attacks }),
    view({ bossUltAt: T + 20_000 }),
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
