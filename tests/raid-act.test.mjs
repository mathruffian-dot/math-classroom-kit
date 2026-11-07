// 魔王戰學生操作（src/raid-act.ts 的 raidAct）：回應晚到的競態（2026-11-07 Codex 複審第三輪）。
// 直接驅動真正的 raidAct，伺服器換成手動放行的假 api；推送照 main.ts 的規則（revision 不比本機新就沿用本機的 mine）。
// 瀏覽器端的晚到回應另見 tests/e2e/optimistic-late.spec.ts。
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = await mkdtemp(join(tmpdir(), 'raid-act-'));
test.after(() => rm(dir, { recursive: true, force: true }));
// raid-act 與 raid-ui 要在同一個 bundle（共用同一份 raidLocal）
const out = await build({
  stdin: { contents: "export * from './src/raid-act.ts'; export { initRaidUi, raidBusy, raidLocal } from './src/raid-ui.ts';", resolveDir: resolve('.'), loader: 'ts' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  loader: { '.css': 'empty' },
  logLevel: 'silent',
});
const file = join(dir, 'raid-act.mjs');
await writeFile(file, out.outputFiles[0].text);
const R = await import(pathToFileURL(file).href);

let route = 1,
  view = null,
  calls = [];
R.initRaidUi({ esc: (s) => String(s), md: (s) => s, btn: () => '', icon: () => '', figure: () => '', serverTime: () => Date.now(), route: () => route });
R.initRaidAct({
  api: (path, method, body) => new Promise((res, rej) => calls.push({ body, res, rej })),
  view: () => view,
  route: () => route,
  refresh: () => {},
  resync: () => {},
  toast: () => {},
  playCorrect: () => {},
});

const tick = () => new Promise((r) => setImmediate(r));
const question = (id, kind = 'attack') => ({ id, kind, stem: id, options: ['甲', '乙', '丙', '丁'] });
function start(run, mine) {
  calls = [];
  R.raidLocal.sending = null;
  R.raidLocal.flash = '';
  R.raidLocal.pick = { q: '' };
  view = { session: { id: 's1', revision: 1 }, raid: { run: { id: run }, mine } };
}
/** 推送：照 main.ts applyView，revision 不比本機看過的新就沿用本機的 mine。 */
function push(rev, mine) {
  const run = view.raid.run.id;
  view = { session: { id: 's1', revision: rev }, raid: { run: { id: run }, mine: rev <= R.raidRevisionOf(run) ? view.raid.mine : mine } };
}
const answer = (choice) => R.raidAct('raid-answer', { dataset: { choice: String(choice) } });
const lastCall = () => calls[calls.length - 1];

test('raid act: late accepted A@2 does not delete the same bank question redrawn @3 before its push', async () => {
  start('run-1', { role: 'mage', question: question('m1') });
  const a = answer(0);
  await tick();
  const held = lastCall();
  assert.equal(held.body.op, 'answer');
  // 伺服器收下 A（revision 2），推送把題目收掉
  push(2, { role: 'mage' });
  assert.equal(R.raidBusy(view.raid), false);
  // 再抽：題庫循環抽到同一個 id，抽題回應（revision 3）比它的推送先到
  const d = R.raidAct('raid-draw', { dataset: { kind: 'attack' } });
  await tick();
  lastCall().res({ question: question('m1'), revision: 3 });
  await d;
  assert.equal(view.raid.mine.question?.id, 'm1');
  // A 的回應晚到：新抽到的同一題留著，不顯示舊的結果、不鎖
  held.res({ correct: true, answer: 0, kind: 'attack', revision: 2 });
  await a;
  assert.equal(view.raid.mine.question?.id, 'm1');
  assert.equal(R.raidLocal.flash, '');
  assert.equal(R.raidBusy(view.raid), false);
  // 晚一點才到的 revision 3 推送也不蓋掉
  push(3, { role: 'mage', question: question('m1') });
  assert.equal(view.raid.mine.question?.id, 'm1');
});

test('raid act: late correct A does not replace the wrong-answer flash of a newer completed B while B is locked', async () => {
  start('run-2', { role: 'mage', question: question('a1') });
  const a = answer(0);
  await tick();
  const held = lastCall();
  push(2, { role: 'mage' });
  const d = R.raidAct('raid-draw', { dataset: { kind: 'shield' } });
  await tick();
  lastCall().res({ question: question('b1', 'shield'), revision: 3 });
  await d;
  // B 答錯：伺服器的鎖住時間
  const lockUntil = Date.now() + 5000;
  const b = answer(1);
  await tick();
  lastCall().res({ correct: false, answer: 2, kind: 'shield', lockUntil, revision: 4 });
  await b;
  assert.match(R.raidLocal.flash, /答錯/);
  assert.equal(view.raid.mine.lockUntil, lockUntil);
  push(4, { role: 'mage', lockUntil });
  // A 的回應晚到：B 的答錯與鎖住時間留著
  held.res({ correct: true, answer: 0, kind: 'attack', revision: 2 });
  await a;
  assert.match(R.raidLocal.flash, /答錯/);
  assert.doesNotMatch(R.raidLocal.flash, /✓ 答對/);
  assert.equal(view.raid.mine.lockUntil, lockUntil);
  assert.equal(view.raid.mine.question, undefined);
});

test('raid act: push with the same answer arrives first — the late response still shows its result', async () => {
  start('run-3', { role: 'mage', question: question('c1') });
  const a = answer(2);
  await tick();
  // 送出中：中性標記（已選），不猜對錯
  assert.equal(R.raidBusy(view.raid), true);
  assert.equal(R.raidLocal.sending.choice, 2);
  assert.equal(R.raidLocal.flash, '');
  const held = lastCall();
  push(2, { role: 'mage' });
  held.res({ correct: true, answer: 2, kind: 'attack', revision: 2 });
  await a;
  assert.match(R.raidLocal.flash, /✓ 答對/);
  assert.equal(R.raidLocal.sending, null);
});

test('raid act: leaving and re-entering the same run while role is pending does not block new actions; the old finally keeps the new lock', async () => {
  start('run-4', {});
  const role = R.raidAct('raid-role', { dataset: { role: 'knight' } });
  await tick();
  const heldRole = lastCall();
  assert.equal(heldRole.body.op, 'role');
  assert.equal(R.raidBusy(view.raid), true);
  // 離開再回來同一場（routeVersion 變了，畫面重新載入）
  route++;
  view = { session: { id: 's1', revision: 1 }, raid: { run: { id: 'run-4' }, mine: {} } };
  assert.equal(R.raidBusy(view.raid), false);
  const role2 = R.raidAct('raid-role', { dataset: { role: 'archer' } });
  await tick();
  const heldRole2 = lastCall();
  assert.notEqual(heldRole2, heldRole, 'the new action is sent');
  assert.equal(R.raidBusy(view.raid), true);
  // 舊的回應晚到：不套用到新畫面，finally 也不解開新的請求
  heldRole.res({ revision: 2 });
  await role;
  assert.equal(view.raid.mine.role, undefined);
  assert.equal(R.raidBusy(view.raid), true);
  heldRole2.res({ revision: 3 });
  await role2;
  assert.equal(view.raid.mine.role, 'archer');
  assert.equal(R.raidBusy(view.raid), false);
});

test('raid act: leaving and re-entering while a goal is pending does not block drawing', async () => {
  start('run-5', { role: 'mage' });
  const goal = R.raidAct('raid-goal', { dataset: { goal: '5' } });
  await tick();
  const held = lastCall();
  route++;
  view = { session: { id: 's1', revision: 1 }, raid: { run: { id: 'run-5' }, mine: { role: 'mage' } } };
  const d = R.raidAct('raid-draw', { dataset: { kind: 'attack' } });
  await tick();
  assert.equal(lastCall().body.op, 'draw');
  lastCall().res({ question: question('e1'), revision: 3 });
  await d;
  assert.equal(view.raid.mine.question?.id, 'e1');
  held.res({ goal: 5, revision: 2 });
  await goal;
  assert.equal(view.raid.mine.goal, undefined);
  assert.equal(R.raidBusy(view.raid), false);
});
