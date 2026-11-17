// 十字交乘的「重點」難度（shared/game-focus.ts）：設定的形狀、例子的分類、等級 ↔ 重點（含舊網址 ?level 與 8ccf588 存的舊場次）、
// 混合的出題順序、伺服器嚴格驗證重點、預設不自動前進、混合兩位同學、答案不外洩。
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const dir = await mkdtemp(join(tmpdir(), 'classroom-cross-focus-'));
const homeworkFixture = { name: 'homework-fixture', setup(b) { b.onResolve({ filter: /homework\.generated\.json$/ }, () => ({ path: resolve('tests/fixtures/homework.json') })); } };
await build({ entryPoints: [resolve('worker/app.ts'), resolve('worker/cross.ts'), resolve('shared/cross.ts'), resolve('shared/game-focus.ts'), resolve('worker/sha256.ts'), resolve('worker/index.ts')], outdir: dir, bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' }, logLevel: 'silent', plugins: [homeworkFixture] });
const { handleApi, liveTicket, liveView, crossThrottleReset, settleCrossSession } = await import(pathToFileURL(join(dir, 'worker', 'app.mjs')).href);
const { ClassroomDurableObject } = await import(pathToFileURL(join(dir, 'worker', 'index.mjs')).href);
const lib = await import(pathToFileURL(join(dir, 'worker', 'cross.mjs')).href);
const cross = await import(pathToFileURL(join(dir, 'shared', 'cross.mjs')).href);
test.after(() => rm(dir, { recursive: true, force: true }));
const TEACHER = { role: 'teacher', account: 'teacher', password: '11235813' };

function fixture() {
  let data;
  const sched = [];
  const vaultMap = new Map();
  const vault = { async get(k) { const v = vaultMap.get(k); return v === undefined ? undefined : structuredClone(v); }, async put(k, v) { vaultMap.set(k, structuredClone(v)); }, async delete(k) { return vaultMap.delete(k); } };
  const store = { async read() { return data && structuredClone(data); }, async write(next) { data = structuredClone(next); } };
  const cookies = new Map();
  const seen = [];
  return {
    get data() { return data; }, store, seen, sched,
    async call(path, method = 'GET', body, who = 'teacher') {
      const headers = { Origin: 'http://localhost' };
      if (cookies.has(who)) headers.Cookie = cookies.get(who);
      if (method !== 'GET') headers['Content-Type'] = 'application/json';
      const response = await handleApi(new Request(`http://localhost${path}`, { method, headers, body: method !== 'GET' ? JSON.stringify(body ?? {}) : undefined }), { store, env: { APP_MODE: 'demo' }, vault, scheduleCross: async (id, at) => void sched.push([id, at]) });
      if (response.headers.has('Set-Cookie')) cookies.set(who, response.headers.get('Set-Cookie').split(';')[0]);
      const text = await response.text();
      // 學生收到的每一個回應都記下來（檢查有沒有洩漏答案）
      if (who !== 'teacher') seen.push({ path, op: body?.op, text });
      return { status: response.status, body: text ? JSON.parse(text) : null, quiet: response.headers.get('X-Classroom-Quiet') === '1', changed: response.headers.get('X-Classroom-Changed') === '1' };
    },
    cookie(who) { return cookies.get(who); },
  };
}
async function setup(seats = [1, 2, 3, 4]) {
  const f = fixture();
  assert.equal((await f.call('/api/login', 'POST', TEACHER)).status, 200);
  const dash = (await f.call('/api/dashboard')).body;
  const cl = dash.classes[0];
  await f.call(`/api/classes/${cl.id}`, 'PATCH', { requireCode: false });
  const s = (await f.call('/api/sessions', 'POST', { lessonId: dash.lessons[0].id, classId: cl.id })).body.session;
  for (const seat of seats) {
    assert.equal((await f.call('/api/login', 'POST', { role: 'student', classCode: 'DEMO801', seat }, `seat${seat}`)).status, 200);
    await f.call('/api/student/session', 'GET', null, `seat${seat}`);
  }
  const ctl = (body) => f.call(`/api/sessions/${s.id}/control`, 'POST', body);
  const act = async (who, body) => f.call(`/api/sessions/${s.id}/cross`, 'POST', { runId: (await f.call(`/api/sessions/${s.id}`)).body.session.cross?.id, ...body }, who);
  return { f, s, ctl, act };
}
/** 讓限速、冷卻、每分鐘上限不擋測試：上一次動作往前移、發題時間至少 5 秒前（速度分照算）、清掉冷卻與送出紀錄、清掉拿題限速。 */
function unthrottle(f, s) {
  crossThrottleReset();
  const t = Date.now();
  for (const p of Object.values(f.data.sessions[s.id].crossPlay || {}))
    for (const x of Object.values(p.seats)) {
      x.at -= 10_000;
      if (x.cur) x.cur.issuedAt = Math.min(x.cur.issuedAt, t - 5000);
      delete x.cool;
      x.hits = [];
    }
}
/** 只讓「兩次動作間隔」與拿題限速不擋（冷卻、每分鐘上限、發題時間都照實際）。 */
function ready(f, s) {
  crossThrottleReset();
  for (const p of Object.values(f.data.sessions[s.id].crossPlay || {})) for (const x of Object.values(p.seats)) x.at -= 10_000;
}
/** 學生端自己從原式算答案（測試用；不讀伺服器的答案）：列舉卡片擺法，用 crossJudge 檢查。 */
function solve(item) {
  const inner = innerOf(item);
  const leads = item.cards.filter((c) => c.kind === 'lead');
  const consts = item.cards.filter((c) => c.kind === 'const');
  const pairs = (list) => list.flatMap((a) => list.filter((b) => b !== a).map((b) => [a, b]));
  for (const k of item.kOptions || [1]) {
    if (k !== inner.k) continue;
    for (const [c0, c1] of pairs(consts)) {
      if (item.leadLocked) {
        const j = cross.crossJudge({ inner: inner.t, leadLocked: true }, { const0: c0.value, const1: c1.value });
        if (j.ok) return { cards: { const0: c0.id, const1: c1.id }, k };
        continue;
      }
      for (const [l0, l1] of pairs(leads)) {
        const j = cross.crossJudge({ inner: inner.t, leadLocked: false }, { lead0: l0.value, lead1: l1.value, const0: c0.value, const1: c1.value });
        if (j.ok) return { cards: { lead0: l0.id, lead1: l1.id, const0: c0.id, const1: c1.id }, k };
      }
    }
  }
  throw new Error('no solution');
}
/** 從原式自己提公因數（a 為正的本原三項式）。 */
function innerOf(item) {
  const { a, b, c } = item.poly;
  const g = cross.gcd(cross.gcd(a, b), c) * Math.sign(a);
  return { k: g, t: { a: a / g, b: b / g, c: c / g } };
}
function wrongOf(item) {
  const sol = solve(item);
  const ids = Object.values(sol.cards);
  // 換一張同種類的卡（有干擾卡用干擾卡，沒有就兩張常數對調成正負號錯的），保證不成立
  const spare = item.cards.find((c) => c.kind === 'const' && !ids.includes(c.id));
  const cards = { ...sol.cards };
  if (spare) cards.const0 = spare.id;
  else [cards.lead0, cards.lead1] = [cards.lead1, cards.lead0];
  return { cards, k: sol.k };
}
/** 答案的痕跡：因式分解的 LaTeX、標準答案的 p、q、r、s 欄位、種子。 */
function assertNoLeak(text, items) {
  assert(!/"factored"|"crossPlay"|"secret"|"seed"|"inner"|"answer"|"p":|"q":|"r":|"s":/.test(text), `leak in ${text.slice(0, 200)}`);
  for (const it of items) assert(!text.includes(it), `factored form leaked: ${it}`);
}
const focus = await import(pathToFileURL(join(dir, 'shared', 'game-focus.mjs')).href);
const control = (ctl, body) => ctl({ action: 'cross-start', ...body });
/** 拿一題、答對送出（避開限速）；回傳題目與判定。 */
async function solveOne(f, s, act, who) {
  unthrottle(f, s);
  const it = (await act(who, { op: 'next' })).body.item;
  unthrottle(f, s);
  const r = (await act(who, { op: 'submit', itemId: it.id, ...solve(it) })).body;
  return { it, r };
}

/* ───────────── 設定的形狀 ───────────── */
test('focus config: cross declares a1 / a-not-1 / gcf / mix with label, one-line example and generator params', () => {
  const list = focus.GAME_FOCUS.cross;
  assert.equal(list, focus.CROSS_FOCUS);
  assert.deepEqual(list.map((f) => f.id), ['a1', 'a-not-1', 'gcf', 'mix']);
  assert.deepEqual(list.map((f) => f.label), ['x² 係數為 1', 'x² 係數不為 1', '先提公因式', '混合']);
  for (const f of list) {
    assert.match(f.id, /^[a-z0-9-]+$/);
    assert.equal(typeof f.label, 'string');
    assert.ok(f.example || f.exampleText, `${f.id}: has an example`);
    assert.ok(Array.isArray(f.params.levels) && f.params.levels.length >= 1);
    for (const l of f.params.levels) assert.ok([1, 2, 3].includes(l));
    assert.ok(!/L[123]/.test(f.label + (f.example || '') + (f.exampleText || '') + (f.note || '')), `${f.id}: no L-number`);
  }
  assert.deepEqual(list.map((f) => f.example), ['x^2+5x-14', '6x^2+x-2', '2x^2+10x+12', undefined]);
  assert.equal(focus.crossFocusById('gcf').note, '含首項為負');
  assert.equal(focus.crossFocusById('mix').exampleText, '三種隨機出現');
  assert.deepEqual(focus.crossFocusById('mix').params.levels, [1, 2, 3]);
  // 混合以外每個重點只有一個等級，三個重點剛好涵蓋三個等級
  assert.deepEqual(list.filter((f) => f.id !== 'mix').map((f) => f.params.levels), [[1], [2], [3]]);
  // 每個遊戲的 id 不重複
  for (const [game, fs] of Object.entries(focus.GAME_FOCUS)) assert.equal(new Set(fs.map((f) => f.id)).size, fs.length, game);
});

test('examples are correct factorizations and belong to their focus by the generator classification rules', () => {
  const want = { a1: ['x^2+5x-14', '(x+7)(x-2)'], 'a-not-1': ['6x^2+x-2', '(2x-1)(3x+2)'], gcf: ['2x^2+10x+12', '2(x+2)(x+3)'] };
  for (const f of focus.CROSS_FOCUS.filter((x) => x.params.sample)) {
    const { k, p, q, r, s } = f.params.sample;
    const poly = cross.expand(k, p, q, r, s);
    assert.equal(cross.polyTex(poly), f.example, f.id);
    assert.deepEqual([f.example, cross.factoredTex(k, p, q, r, s)], want[f.id], f.id);
    // 展開核對（逐項）：k(px+q)(rx+s)
    assert.deepEqual(poly, { a: k * p * r, b: k * (p * s + q * r), c: k * q * s });
    // 內部三項式本原、首項正（和產生器同一套規則）
    const inner = cross.expand(1, p, q, r, s);
    assert.equal(cross.gcd(cross.gcd(inner.a, inner.b), inner.c), 1, f.id);
    assert.ok(p > 0 && r > 0 && inner.a > 0, f.id);
    assert.deepEqual(f.params.levels, [cross.crossClassify({ poly })], `${f.id}: example classified into its own level`);
    assert.equal(focus.crossItemFocus({ poly }), f.id);
  }
  // 分類規則和產生器一致：每一級 2000 題都分回同一級；負的首項一定是「先提公因式」
  for (const level of [1, 2, 3])
    for (let i = 0; i < 2000; i++) {
      const it = cross.crossItem(cross.crossSeed(20261118, level, i), level);
      assert.equal(cross.crossClassify(it), level, it.key);
      if (it.poly.a < 0) assert.equal(focus.crossItemFocus(it), 'gcf');
    }
  assert.equal(cross.crossClassify({ poly: { a: -1, b: 1, c: 6 } }), 3, '−x²+x+6 = −(x−3)(x+2) is 先提公因式');
});

/* ───────────── 對應：等級 ↔ 重點、舊網址、舊場次 ───────────── */
test('level ↔ focus mapping: ?focus wins, legacy ?level=1/2/3, unknown values, legacy stored runs, next focus', () => {
  const q = (s) => focus.crossFocusFromParams(new URLSearchParams(s));
  assert.equal(q(''), 'a1');
  assert.equal(q('level=1'), 'a1');
  assert.equal(q('level=2'), 'a-not-1');
  assert.equal(q('level=3'), 'gcf');
  assert.equal(q('level=9'), 'a1');
  for (const id of ['a1', 'a-not-1', 'gcf', 'mix']) assert.equal(q(`focus=${id}`), id);
  assert.equal(q('level=3&focus=a1'), 'a1', 'focus wins over level');
  assert.equal(q('focus=mix&level=2'), 'mix');
  assert.equal(q('focus=L2&level=2'), 'a-not-1', 'unknown focus falls back to the legacy level');
  assert.equal(q('focus=hard'), 'a1');
  assert.deepEqual([1, 2, 3].map((l) => focus.CROSS_LEVEL_FOCUS[l]), ['a1', 'a-not-1', 'gcf']);
  assert.deepEqual([1, 2, 3].map((l) => focus.crossLevelLabel(l)), ['x² 係數為 1', 'x² 係數不為 1', '先提公因式']);
  assert.equal(focus.crossFocusLevel('mix'), null);
  assert.equal(focus.crossFocusLevel('gcf'), 3);
  // 8ccf588 存的場次：只有 level（起始等級）與 lock
  assert.equal(focus.crossRunFocus({ level: 2, lock: false }), 'a-not-1');
  assert.equal(focus.crossRunFocus({ level: 3, lock: true }), 'gcf');
  assert.equal(focus.crossRunFocus({ level: 1, lock: true, focus: 'mix' }), 'mix');
  assert.equal(focus.crossRunFocus({ level: 1, focus: 'bogus' }), 'a1');
  // 自動前進的順序：a1 → a-not-1 → gcf；最後一個與混合沒有下一個
  assert.equal(focus.crossNextFocus('a1'), 'a-not-1');
  assert.equal(focus.crossNextFocus('a-not-1'), 'gcf');
  assert.equal(focus.crossNextFocus('gcf'), null);
  assert.equal(focus.crossNextFocus('mix'), null);
  assert.equal(focus.isCrossFocus('mix'), true);
  for (const bad of ['', 'L1', 1, null, undefined, 'MIX', 'a1 ']) assert.equal(focus.isCrossFocus(bad), false, String(bad));
});

test('mix sequencing: every block of 3 covers all three focuses, overall even, deterministic per seed, different per seed', () => {
  for (const base of [0, 1, 777, 20261118, 0xffffffff]) {
    const seq = Array.from({ length: 300 }, (_, i) => cross.crossMixLevel(base, i));
    for (let b = 0; b < 100; b++) assert.deepEqual([...seq.slice(b * 3, b * 3 + 3)].sort(), [1, 2, 3], `base ${base} block ${b}`);
    assert.deepEqual(Array.from({ length: 300 }, (_, i) => cross.crossMixLevel(base, i)), seq, 'deterministic');
    assert.deepEqual([1, 2, 3].map((l) => seq.filter((x) => x === l).length), [100, 100, 100]);
  }
  const a = Array.from({ length: 30 }, (_, i) => cross.crossMixLevel(1, i)).join('');
  const b = Array.from({ length: 30 }, (_, i) => cross.crossMixLevel(2, i)).join('');
  assert.notEqual(a, b, 'different seeds give different orders');
  // 不只一種排列：不是固定的 1,2,3 循環
  assert.ok(new Set(Array.from({ length: 50 }, (_, blk) => [0, 1, 2].map((j) => cross.crossMixLevel(5, blk * 3 + j)).join(''))).size > 1);
});

/* ───────────── 伺服器 ───────────── */
test('server: focus id is validated strictly; escalate must be boolean; mix is always locked', async () => {
  const { f, s, ctl } = await setup([1]);
  for (const bad of ['L1', 'hard', 'MIX', '', 2, null, true, ['a1'], { id: 'a1' }]) {
    const r = await control(ctl, { focus: bad });
    assert.equal(r.status, 400, `focus ${JSON.stringify(bad)} rejected`);
    assert.match(r.body.error, /重點/);
  }
  // escalate／lock／level 只要有送就驗證型別（含新舊欄位混用、沒有 focus 的情況）
  for (const bad of [{ focus: 'a1', escalate: 'yes' }, { escalate: 'yes' }, { level: 2, escalate: 'yes' }, { level: 2, escalate: 1 }, { level: 2, escalate: null }, { focus: 'a1', lock: 'no' }, { level: 2, lock: 1 }, { focus: 'gcf', level: 9 }, { level: 'x' }]) {
    const r = await control(ctl, bad);
    assert.equal(r.status, 400, `${JSON.stringify(bad)} rejected`);
  }
  assert.equal(f.data.sessions[s.id].session.cross ?? null, null, 'nothing started by a rejected request');
  for (const [id, level] of [['a1', 1], ['a-not-1', 2], ['gcf', 3], ['mix', 1]]) {
    assert.equal((await control(ctl, { focus: id })).status, 200);
    const run = f.data.sessions[s.id].session.cross;
    assert.equal(run.focus, id);
    assert.equal(run.level, level);
    assert.equal(run.lock, true, `${id}: no escalation by default`);
  }
  assert.equal((await control(ctl, { focus: 'a1', escalate: true })).status, 200);
  assert.equal(f.data.sessions[s.id].session.cross.lock, false);
  assert.equal((await control(ctl, { focus: 'mix', escalate: true })).status, 200);
  assert.equal(f.data.sessions[s.id].session.cross.lock, true, 'mix never escalates');
  // focus 和舊的 level 一起送：focus 優先
  assert.equal((await control(ctl, { focus: 'gcf', level: 1 })).status, 200);
  assert.equal(f.data.sessions[s.id].session.cross.level, 3);
  // 語意表：[請求, 重點, lock]。有 focus 或 escalate 就是新格式（只看 escalate，lock 不採用）；只有 level／lock 才是舊格式
  const cases = [
    [{}, 'a1', true], // 什麼都沒送：新的預設，不前進
    [{ seconds: 60 }, 'a1', true],
    [{ escalate: true }, 'a1', false], // 沒有 focus：重點用 level（預設 1）
    [{ level: 2, escalate: false }, 'a-not-1', true], // 舊 level＋新 escalate:false → 不前進（不再被缺省的 lock 蓋掉）
    [{ level: 2, escalate: true }, 'a-not-1', false],
    [{ level: 2, escalate: false, lock: false }, 'a-not-1', true], // 新格式不看 lock
    [{ focus: 'a1', lock: false }, 'a1', true], // 有 focus 時 lock 不採用，沒送 escalate = 不前進
    [{ focus: 'a1', escalate: true, lock: true }, 'a1', false],
    [{ focus: 'gcf', escalate: true }, 'gcf', true], // 沒有下一個重點
    [{ level: 3, escalate: true }, 'gcf', true],
    [{ level: 2 }, 'a-not-1', false], // 純舊格式：照 8ccf588，沒勾鎖定就前進
    [{ level: 2, lock: true }, 'a-not-1', true],
    [{ lock: false }, 'a1', false],
    [{ lock: true }, 'a1', true],
  ];
  for (const [body, id, lock] of cases) {
    assert.equal((await control(ctl, body)).status, 200, JSON.stringify(body));
    const run = f.data.sessions[s.id].session.cross;
    assert.deepEqual([run.focus, run.level, run.lock], [id, focus.crossFocusLevel(id), lock], JSON.stringify(body));
  }
  // 學生不能開
  assert.equal((await f.call(`/api/sessions/${s.id}/control`, 'POST', { action: 'cross-start', focus: 'a1' }, 'seat1')).status, 403);
});

test('server: a specific focus stays put after 3 correct by default; with escalate it advances a1 → a-not-1 → gcf', async () => {
  const { f, s, ctl, act } = await setup([1, 2]);
  assert.equal((await control(ctl, { focus: 'a-not-1' })).status, 200);
  for (let i = 0; i < 4; i++) {
    const { it, r } = await solveOne(f, s, act, 'seat1');
    assert.equal(it.level, 2);
    assert.equal(r.ok, true);
    assert.equal(r.levelUp, false);
    assert.equal(r.level, 2);
  }
  assert.equal((await control(ctl, { focus: 'a1', escalate: true })).status, 200);
  const levels = [];
  for (let i = 0; i < 7; i++) {
    const { it, r } = await solveOne(f, s, act, 'seat2');
    assert.equal(r.ok, true);
    levels.push(it.level);
  }
  assert.deepEqual(levels, [1, 1, 1, 2, 2, 2, 3]);
});

test('server: mix with 2 students — each gets items from all three focuses, per-student deterministic order, answers stay hidden, scoring by actual item', async () => {
  const { f, s, ctl, act } = await setup([1, 2]);
  assert.equal((await control(ctl, { focus: 'mix' })).status, 200);
  const run = f.data.sessions[s.id].session.cross;
  const got = { 1: [], 2: [] };
  const factored = [];
  for (let i = 0; i < 6; i++)
    for (const seat of [1, 2]) {
      unthrottle(f, s);
      const res = await act(`seat${seat}`, { op: 'next' });
      const it = res.body.item;
      assert.deepEqual(Object.keys(it).sort(), ['cards', 'id', 'leadLocked', 'level', 'poly', ...(it.level === 3 ? ['kOptions'] : [])].sort());
      const cur = f.data.sessions[s.id].crossPlay[run.id].seats[String(seat)].cur;
      const full = cross.crossItem(cur.seed, cur.level);
      factored.push(cross.factoredTex(full.k, full.p, full.q, full.r, full.s));
      assertNoLeak(res.text ?? JSON.stringify(res.body), [factored.at(-1)]);
      // 這一題真的屬於伺服器說的重點（照產生器的分類規則）
      assert.equal(cross.crossClassify({ poly: it.poly }), it.level);
      // 學生畫面的「重點」欄：混合時是這一題的等級
      unthrottle(f, s);
      const r = (await act(`seat${seat}`, { op: 'submit', itemId: it.id, ...solve(it) })).body;
      assert.equal(r.ok, true);
      assert.equal(r.levelUp, false, 'mix never escalates');
      assert.equal(r.points.base, lib.CROSS_SCORE.base[it.level], 'base points follow the actual item difficulty');
      got[seat].push(it.level);
    }
  for (const seat of [1, 2]) {
    for (let b = 0; b < 2; b++) assert.deepEqual([...got[seat].slice(b * 3, b * 3 + 3)].sort(), [1, 2, 3], `seat ${seat}: all three focuses every 3 items`);
    // 每位同學的順序由這一場獨立的混合秘密決定（可重現），和出題種子無關
    const play = f.data.sessions[s.id].crossPlay[run.id];
    assert.match(play.mixKey, /^[0-9a-f]{64}$/);
    assert.deepEqual(got[seat], [0, 1].flatMap((b) => lib.crossMixOrder(play.mixKey, run.id, seat, b)));
  }
  // 學生收到的所有回應都沒有答案（送出前）
  for (const x of f.seen.filter((x) => x.op === 'next')) assertNoLeak(x.text, factored);
  // 老師看到的排行：等級欄是目前這一題的等級；CSV 寫重點名稱，不寫 L 數字
  const exp = await handleApi(new Request(`http://localhost/api/sessions/${s.id}/export?format=csv`, { headers: { Origin: 'http://localhost', Cookie: f.cookie('teacher') } }), { store: f.store, env: { APP_MODE: 'demo' }, vault: { get: async () => undefined, put: async () => {}, delete: async () => true } });
  const rows = (await exp.text()).split('\n').filter((l) => l.includes('十字交乘對戰'));
  assert.equal(rows.length, 12);
  for (const l of ['x² 係數為 1', 'x² 係數不為 1', '先提公因式']) assert.ok(rows.some((r) => r.includes(l)), l);
  assert.ok(!rows.some((r) => /,L[123],/.test(r)));
  const json = await (await handleApi(new Request(`http://localhost/api/sessions/${s.id}/export`, { headers: { Origin: 'http://localhost', Cookie: f.cookie('teacher') } }), { store: f.store, env: { APP_MODE: 'demo' }, vault: { get: async () => undefined, put: async () => {}, delete: async () => true } })).json();
  const log = json.crossLog[run.id].log;
  assert.equal(log.length, 12);
  for (const x of log) assert.equal(x.focusLabel, focus.crossLevelLabel(x.level));
  assert.equal(json.crossRuns.at(-1).focus, 'mix');
});

test('backward compatibility: a battle stored by 8ccf588 (level + lock, no focus) still loads, runs and escalates as before', async () => {
  const { f, s, act } = await setup([1, 2]);
  // 8ccf588 的老師畫面送的是 level＋lock
  assert.equal((await f.call(`/api/sessions/${s.id}/control`, 'POST', { action: 'cross-start', level: 2, lock: false })).status, 200);
  // 變成 8ccf588 存下來的樣子：沒有 focus 欄位
  const data = structuredClone(f.data);
  const stored = data.sessions[s.id];
  const run = stored.session.cross;
  delete run.focus;
  for (const r of stored.crossRuns) delete r.focus;
  assert.deepEqual(Object.keys(run).sort(), ['deadline', 'id', 'level', 'lock', 'margin', 'pausedAt', 'seconds', 'startedAt', 'team', 'teams', 'winner'].sort());
  await f.store.write(data);
  // 讀得到、對應到「x² 係數不為 1」
  const tv = (await f.call(`/api/sessions/${s.id}`)).body;
  assert.equal(tv.cross.run.focus, undefined);
  assert.equal(focus.crossRunFocus(tv.cross.run), 'a-not-1');
  // 照舊：沒勾鎖定 → 連對 3 題升一級
  const levels = [];
  for (let i = 0; i < 4; i++) {
    const { it, r } = await solveOne(f, s, act, 'seat1');
    assert.equal(r.ok, true);
    levels.push(it.level);
  }
  assert.deepEqual(levels, [2, 2, 2, 3]);
  // 舊場次＋lock：固定
  const data2 = structuredClone(f.data);
  const run2 = data2.sessions[s.id].session.cross;
  run2.lock = true;
  await f.store.write(data2);
  for (let i = 0; i < 3; i++) {
    const { it, r } = await solveOne(f, s, act, 'seat2');
    assert.equal(r.ok, true);
    assert.equal(it.level, 2);
    assert.equal(r.levelUp, false);
  }
  // 重新開始也照舊（設定保留，沒有 focus 也能跑）
  assert.equal((await f.call(`/api/sessions/${s.id}/control`, 'POST', { action: 'cross-reset' })).status, 200);
  assert.equal(focus.crossRunFocus(f.data.sessions[s.id].session.cross), 'a-not-1');
  const { it } = await solveOne(f, s, act, 'seat1');
  assert.equal(it.level, 2);
});

/* ───────────── 混合順序不能洩漏出題種子（Codex B1） ───────────── */
const sha = await import(pathToFileURL(join(dir, 'worker', 'sha256.mjs')).href);
test('sha256 (sync, server) matches node:crypto for edge-case lengths', () => {
  for (const n of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
    const data = Uint8Array.from({ length: n }, (_, i) => (i * 131 + n) & 255);
    assert.equal(Buffer.from(sha.sha256(data)).toString('hex'), createHash('sha256').update(data).digest('hex'), `length ${n}`);
  }
  assert.equal(Buffer.from(sha.sha256(new TextEncoder().encode('abc'))).toString('hex'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('live mix order comes from the independent mix key, not from play.secret / item base; items keep the 8ccf588 derivation', () => {
  const run = { id: 'run-mix-test', startedAt: 0, focus: 'mix', level: 1, lock: true, seconds: 0, deadline: null, pausedAt: null, team: false, margin: 300, teams: {}, winner: null };
  const N = 30;
  const play = (secret, mixKey) => {
    const store = { crossRuns: [run], crossPlay: { [run.id]: { secret, mixKey, seats: {} } } };
    const out = [];
    for (let i = 0; i < N; i++) {
      const st = lib.issueItem(run, store, 7, 1000);
      out.push({ level: st.cur.level, seed: st.cur.seed });
    }
    return out;
  };
  const K1 = 'a'.repeat(64), K2 = 'b'.repeat(64);
  const a = play(12345, K1), b = play(99999, K1), c = play(12345, K2);
  const order = (x) => x.map((y) => y.level).join('');
  // 換出題種子，順序不變（順序和 secret／base 無關）；換混合秘密，順序跟著變
  assert.equal(order(a), order(b), 'order does not depend on play.secret');
  assert.notEqual(order(a), order(c), 'changing the mix key changes the order');
  assert.deepEqual(a.map((x) => x.level), Array.from({ length: N }, (_, i) => lib.crossMixOrder(K1, run.id, 7, Math.floor(i / 3))[i % 3]));
  // 出題照舊：第 i 題的種子 = crossSeed(base, 這一題的等級, i)（和 8ccf588 一樣的公式，只用 secret）
  for (const [secret, got] of [[12345, a], [99999, b], [12345, c]]) {
    const base = (secret ^ Math.imul(7, 0x27d4eb2d)) >>> 0;
    got.forEach((x, i) => assert.equal(x.seed, cross.crossSeed(base, x.level, i), `item ${i}`));
  }
  // 同一個出題種子、同一位置同一個重點 → 同一題（不論混合秘密是什麼）
  for (let i = 0; i < N; i++) if (a[i].level === c[i].level) assert.equal(a[i].seed, c[i].seed);
  // 舊的公開函式（大板用）算出來的順序不是直播的順序
  const base = (12345 ^ Math.imul(7, 0x27d4eb2d)) >>> 0;
  assert.notEqual(order(a), Array.from({ length: N }, (_, i) => cross.crossMixLevel(base, i)).join(''));
  // 每 3 題三種各一；不同座號、不同場次順序不同
  for (let blk = 0; blk < N / 3; blk++) assert.deepEqual(a.slice(blk * 3, blk * 3 + 3).map((x) => x.level).sort(), [1, 2, 3]);
  const seq = (k, id, seat) => Array.from({ length: 20 }, (_, i) => lib.crossMixOrder(k, id, seat, i).join('')).join('');
  assert.notEqual(seq(K1, run.id, 7), seq(K1, run.id, 8));
  assert.notEqual(seq(K1, run.id, 7), seq(K1, 'other-run', 7));
  // 6 種排列都會出現
  assert.equal(new Set(Array.from({ length: 200 }, (_, i) => lib.crossMixOrder(K1, run.id, 7, i).join(''))).size, 6);
  // 8ccf588 存的場次沒有 mixKey：第一次用到混合時補一個 64 位十六進位的隨機秘密
  const legacy = { crossRuns: [run], crossPlay: { [run.id]: { secret: 1, seats: {} } } };
  lib.issueItem(run, legacy, 1, 1000);
  assert.match(legacy.crossPlay[run.id].mixKey, /^[0-9a-f]{64}$/);
  // 新場次一開始就有，而且每場不同
  const k1 = lib.crossPlayOf({ crossRuns: [run] }, run).mixKey;
  const k2 = lib.crossPlayOf({ crossRuns: [run] }, run).mixKey;
  assert.match(k1, /^[0-9a-f]{64}$/);
  assert.notEqual(k1, k2);
});

test('server: the mix key never appears in any student or teacher payload (views, results, reveal, exports)', async () => {
  const { f, s, ctl, act } = await setup([1, 2]);
  assert.equal((await control(ctl, { focus: 'mix', team: true })).status, 200);
  const runId = f.data.sessions[s.id].session.cross.id;
  const texts = [];
  for (let i = 0; i < 4; i++)
    for (const seat of [1, 2]) {
      unthrottle(f, s);
      const it = (await act(`seat${seat}`, { op: 'next' })).body.item;
      unthrottle(f, s);
      const r = await act(`seat${seat}`, { op: 'submit', itemId: it.id, ...solve(it) });
      texts.push(JSON.stringify(r.body));
      texts.push(JSON.stringify((await f.call(`/api/student/session`, 'GET', null, `seat${seat}`)).body));
      texts.push(JSON.stringify((await f.call(`/api/sessions/${s.id}`, 'GET', null, `seat${seat}`)).body));
    }
  const key = f.data.sessions[s.id].crossPlay[runId].mixKey;
  assert.match(key, /^[0-9a-f]{64}$/);
  const tv = (await f.call(`/api/sessions/${s.id}`)).body;
  texts.push(JSON.stringify(tv));
  texts.push(JSON.stringify((await f.call('/api/dashboard')).body));
  const rec = tv.cross.recent[0];
  texts.push(JSON.stringify((await f.call(`/api/sessions/${s.id}/cross`, 'POST', { runId, op: 'reveal', seat: rec.seat, itemId: rec.id })).body));
  const ex = (q) => handleApi(new Request(`http://localhost/api/sessions/${s.id}/export${q}`, { headers: { Origin: 'http://localhost', Cookie: f.cookie('teacher') } }), { store: f.store, env: { APP_MODE: 'demo' }, vault: { get: async () => undefined, put: async () => {}, delete: async () => true } });
  texts.push(await (await ex('')).text());
  texts.push(await (await ex('?format=csv')).text());
  for (const x of f.seen) texts.push(x.text);
  for (const t of texts) {
    assert(!t.includes(key), 'mix key leaked');
    assert(!/mixKey/.test(t), 'mixKey field leaked');
  }
  assert.ok(texts.length > 20);
});

/* ───────────── 8ccf588 作答中的場次部署後照常（Codex S2） ───────────── */
// 舊版伺服器存下的「作答中」狀態固定在 tests/fixtures/cross-legacy-8ccf588-state.json（不依賴 git 歷史，測試一定會跑）。
// 重新擷取：CROSS_LEGACY_CAPTURE=1 node --test tests/cross-focus.test.mjs（需要 8ccf588 的 git 歷史；任何錯誤都直接失敗）。
const LEGACY_FIXTURE = resolve('tests/fixtures/cross-legacy-8ccf588-state.json');

/** 用 git 取出 8ccf588 的 worker／shared，打包成舊版伺服器（content 用目前的）。 */
async function legacyServer() {
  const { execFileSync } = await import('node:child_process');
  const { mkdir, writeFile } = await import('node:fs/promises');
  const git = (...a) => execFileSync('git', a, { encoding: 'buffer', maxBuffer: 64 << 20 });
  const own = await mkdtemp(join(tmpdir(), 'classroom-cross-legacy-')); // 自己的暫存資料夾，不和上面共用的 dir 一起被清掉
  const root = join(own, 'legacy-src');
  const files = git('ls-tree', '-r', '--name-only', '8ccf588', 'worker', 'shared').toString('utf8').split('\n').filter(Boolean);
  for (const file of files) {
    await mkdir(join(root, file, '..'), { recursive: true });
    await writeFile(join(root, file), git('show', `8ccf588:${file}`));
  }
  const content = { name: 'legacy-content', setup(b) { b.onResolve({ filter: /content\/[^/]+\.json$/ }, (a) => ({ path: a.path.endsWith('homework.generated.json') ? resolve('tests/fixtures/homework.json') : resolve('content', a.path.split('/').pop()) })); } };
  const out = join(own, 'legacy-out');
  await build({ entryPoints: [join(root, 'worker', 'app.ts')], outdir: out, bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' }, logLevel: 'silent', plugins: [content] });
  return { api: await import(pathToFileURL(join(out, 'app.mjs')).href), own };
}

/** 同一份儲存、同一組 cookie；api 可以換成新版（模擬部署）。 */
function legacyHarness(api) {
  const h = { data: undefined, vaultMap: new Map(), cookies: new Map(), sid: undefined };
  const store = { async read() { return h.data && structuredClone(h.data); }, async write(next) { h.data = structuredClone(next); } };
  const vault = { async get(k) { const v = h.vaultMap.get(k); return v === undefined ? undefined : structuredClone(v); }, async put(k, v) { h.vaultMap.set(k, structuredClone(v)); }, async delete(k) { return h.vaultMap.delete(k); } };
  h.call = async (path, method = 'GET', body, who = 'teacher') => {
    const headers = { Origin: 'http://localhost' };
    if (h.cookies.has(who)) headers.Cookie = h.cookies.get(who);
    if (method !== 'GET') headers['Content-Type'] = 'application/json';
    const res = await api.handleApi(new Request(`http://localhost${path}`, { method, headers, body: method !== 'GET' ? JSON.stringify(body ?? {}) : undefined }), { store, env: { APP_MODE: 'demo' }, vault, scheduleCross: async () => {} });
    if (res.headers.has('Set-Cookie')) h.cookies.set(who, res.headers.get('Set-Cookie').split(';')[0]);
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  h.loosen = () => {
    api.crossThrottleReset();
    const t0 = Date.now();
    for (const p of Object.values(h.data.sessions[h.sid].crossPlay || {}))
      for (const x of Object.values(p.seats)) {
        x.at -= 10_000;
        if (x.cur) x.cur.issuedAt = Math.min(x.cur.issuedAt, t0 - 5000);
      }
  };
  return h;
}

if (process.env.CROSS_LEGACY_CAPTURE === '1')
  test('capture: in-progress 8ccf588 battle → tests/fixtures/cross-legacy-8ccf588-state.json', async (t) => {
    const { writeFile } = await import('node:fs/promises');
    const { api, own } = await legacyServer();
    t.after(() => rm(own, { recursive: true, force: true }));
    const h = legacyHarness(api);
    const { call, loosen } = h;
    // ── 舊版（8ccf588）：開戰（level 1、沒鎖定 → 會升級）、兩位同學作答 ──
    assert.equal((await call('/api/login', 'POST', TEACHER)).status, 200);
    const dash = (await call('/api/dashboard')).body;
    const cl = dash.classes[0];
    await call(`/api/classes/${cl.id}`, 'PATCH', { requireCode: false });
    const sid = (h.sid = (await call('/api/sessions', 'POST', { lessonId: dash.lessons[0].id, classId: cl.id })).body.session.id);
    for (const seat of [1, 2]) {
      assert.equal((await call('/api/login', 'POST', { role: 'student', classCode: 'DEMO801', seat }, `seat${seat}`)).status, 200);
      await call('/api/student/session', 'GET', null, `seat${seat}`);
    }
    assert.equal((await call(`/api/sessions/${sid}/control`, 'POST', { action: 'cross-start', level: 1, lock: false, seconds: 0 })).status, 200);
    const runId = h.data.sessions[sid].session.cross.id;
    const act = (who, body) => call(`/api/sessions/${sid}/cross`, 'POST', { runId, ...body }, who);
    // 01 號：連對 3 題 → 舊版升到 2 級，再拿一題（作答中）
    for (let i = 0; i < 3; i++) {
      loosen();
      const it = (await act('seat1', { op: 'next' })).body.item;
      assert.equal(it.level, 1);
      loosen();
      const r = (await act('seat1', { op: 'submit', itemId: it.id, ...solve(it) })).body;
      assert.equal(r.ok, true);
      if (i === 2) assert.deepEqual([r.levelUp, r.level], [true, 2]);
    }
    loosen();
    const before = (await act('seat1', { op: 'next' })).body.item;
    assert.equal(before.level, 2);
    // 02 號：答錯一題 → 冷卻中、沒有題目
    loosen();
    const w = (await act('seat2', { op: 'next' })).body.item;
    loosen();
    assert.equal((await act('seat2', { op: 'submit', itemId: w.id, ...wrongOf(w) })).body.ok, false);
    h.data.sessions[sid].crossPlay[runId].seats['2'].cool = Date.now() + 60_000; // 冷卻拉長，部署後一定還在冷卻中
    // lessons／catalog 只是專案教材的副本（2 MB 多），新版讀取時會照 content/lessons 重新同步，不放進 fixture；場次本身的 lesson 快照保留
    const data = { ...h.data, lessons: {}, catalog: {} };
    const state = { commit: '8ccf588', capturedAt: Date.now(), sid, runId, before, cookies: Object.fromEntries(h.cookies), vault: Object.fromEntries(h.vaultMap), data };
    await writeFile(LEGACY_FIXTURE, JSON.stringify(state, null, 1) + '\n');
  });

test('backward compatibility: an in-progress 8ccf588 battle (escalated student, live item, past, cooldown, rate-limit hits) keeps running after deploy', async () => {
  const { readFile } = await import('node:fs/promises');
  const fx = JSON.parse(await readFile(LEGACY_FIXTURE, 'utf8'));
  assert.equal(fx.commit, '8ccf588');
  // 時鐘接在擷取的那一刻之後（冷卻、限速紀錄、登入期限都和剛存下來時一樣）
  const realNow = Date.now;
  const shift = realNow() - fx.capturedAt;
  Date.now = () => realNow() - shift;
  try {
    await legacyAfterDeploy(fx);
  } finally {
    Date.now = realNow;
  }
});

async function legacyAfterDeploy(fx) {
  // ── 部署：8ccf588 存下的資料改用新版伺服器 ──
  const h = legacyHarness({ handleApi, crossThrottleReset });
  h.data = structuredClone(fx.data);
  h.vaultMap = new Map(Object.entries(fx.vault));
  h.cookies = new Map(Object.entries(fx.cookies));
  const { sid, runId, before } = fx;
  h.sid = sid;
  const { call, loosen } = h;
  const act = (who, body) => call(`/api/sessions/${sid}/cross`, 'POST', { runId, ...body }, who);
  // 這就是 8ccf588 存下來的樣子
  const play0 = h.data.sessions[sid].crossPlay[runId];
  const run0 = h.data.sessions[sid].session.cross;
  assert.equal(run0.focus, undefined);
  assert.equal(play0.mixKey, undefined);
  const s1 = play0.seats['1'], s2 = play0.seats['2'];
  assert.deepEqual([s1.level, s1.run, s1.correct, s1.attempts, s1.past.length, s1.hits.length], [2, 0, 3, 3, 3, 3]);
  assert.ok(s1.cur && s1.cur.cards.length && Number.isInteger(s1.cur.seed) && s1.cur.id === before.id);
  assert.equal(s1.m, undefined);
  assert.ok(s2.cool > Date.now() + 30_000 && s2.wrong === 1 && !s2.cur);
  const score0 = s1.score, hits0 = [...s1.hits], curSeed = s1.cur.seed, curCards = structuredClone(s1.cur.cards);
  const pastIds = s1.past.map((p) => p.id);
  const data = { get sessions() { return h.data.sessions; } };

  // 原題不變（id、原式、卡片），重新拿題是原題奉還
  loosen();
  const again = (await act('seat1', { op: 'next' })).body.item;
  assert.deepEqual(again, before, 'current item unchanged after deploy');
  assert.equal(data.sessions[sid].crossPlay[runId].seats['1'].cur.seed, curSeed);
  assert.deepEqual(data.sessions[sid].crossPlay[runId].seats['1'].cur.cards, curCards);
  // 學生畫面也是同一題；run 沒有 focus → 對應 x² 係數為 1
  const sv = (await call(`/api/sessions/${sid}`, 'GET', null, 'seat1')).body;
  assert.equal(sv.cross.mine.item.id, before.id);
  assert.equal(focus.crossRunFocus(sv.cross.run), 'a1');
  // 舊題照舊送出有效：答對、2 級的基本分、分數累加、限速紀錄沿用
  loosen();
  const r1 = (await act('seat1', { op: 'submit', itemId: before.id, ...solve(before) })).body;
  assert.equal(r1.ok, true);
  assert.equal(r1.points.base, lib.CROSS_SCORE.base[2]);
  assert.equal(r1.score, score0 + r1.points.total);
  assert.equal(r1.levelUp, false);
  const s1b = data.sessions[sid].crossPlay[runId].seats['1'];
  assert.deepEqual(s1b.hits.slice(0, -1), hits0.filter((x) => Date.now() - x < 60_000), 'rate-limit records carried over');
  assert.equal(s1b.hits.length, hits0.length + 1);
  assert.deepEqual(s1b.past.slice(0, 3).map((p) => p.id), pastIds);
  // 重送同一題被拒
  loosen();
  assert.equal((await act('seat1', { op: 'submit', itemId: before.id, ...solve(before) })).status, 409);
  // 之後照舊：2 級再連對 2 題（共 3 題）→ 升到 3 級
  const levels = [];
  for (let i = 0; i < 3; i++) {
    loosen();
    const it = (await act('seat1', { op: 'next' })).body.item;
    loosen();
    const r = (await act('seat1', { op: 'submit', itemId: it.id, ...solve(it) })).body;
    assert.equal(r.ok, true);
    assert.equal(r.points.base, lib.CROSS_SCORE.base[it.level]);
    levels.push([it.level, r.levelUp]);
  }
  assert.deepEqual(levels, [[2, false], [2, true], [3, false]]);
  // 新出的題也照 8ccf588 的公式（secret ^ 座號雜湊 → crossSeed(base, 等級, n)）
  const play1 = data.sessions[sid].crossPlay[runId];
  const s1c = play1.seats['1'];
  const base = (play1.secret ^ Math.imul(1, 0x27d4eb2d)) >>> 0;
  for (const p of s1c.past.slice(-3)) assert.ok(Array.from({ length: s1c.n }, (_, n) => cross.crossSeed(base, p.level, n)).includes(p.seed));
  // 02 號：冷卻照舊擋住拿題
  loosen();
  assert.equal((await act('seat2', { op: 'next' })).status, 429);
  // 老師畫面正常
  const tv = (await call(`/api/sessions/${sid}`)).body;
  assert.equal(tv.cross.rows.find((r) => r.seat === 1).score, s1c.score);
  assert.equal(play1.mixKey, undefined, 'a non-mix legacy battle never needs a mix key');
}
