// 十字交乘・全班連線對戰（伺服器）：答案不外洩、每人題目不同、判定、卡片／重送／限速、計分與連對、自動升級、紅藍拔河。
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = await mkdtemp(join(tmpdir(), 'classroom-cross-live-'));
const homeworkFixture = { name: 'homework-fixture', setup(b) { b.onResolve({ filter: /homework\.generated\.json$/ }, () => ({ path: resolve('tests/fixtures/homework.json') })); } };
await build({ entryPoints: [resolve('worker/app.ts'), resolve('worker/cross.ts'), resolve('shared/cross.ts'), resolve('worker/index.ts')], outdir: dir, bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' }, logLevel: 'silent', plugins: [homeworkFixture] });
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

test('live cards: 4 correct (or 2 when the lead column is fixed) + 2 distractors; kOptions contain k', () => {
  for (const level of [1, 2, 3])
    for (let i = 0; i < 400; i++) {
      const item = cross.crossItem(cross.crossSeed(77, level, i), level);
      const cards = lib.liveCards(item);
      const need = item.leadLocked ? 2 : 4;
      assert.equal(cards.length, need + 2, `L${level} ${cards.length}`);
      assert.equal(cards.filter((c) => c.kind === 'lead').length, item.leadLocked ? 0 : 3);
      assert.equal(new Set(cards.map((c) => c.id)).size, cards.length);
      const j = cross.crossJudge({ ...item, cards }, cross.crossAnswer(item));
      assert(j.ok, 'answer still placeable with the live cards');
      if (level === 3) assert(lib.kOptions().includes(item.k), `k ${item.k} is offered`);
    }
});

test('scoring: base by level, speed bonus decays 10s→40s, streak bonus capped', () => {
  assert.deepEqual(lib.crossPoints(1, 3000, 0), { base: 100, speed: 50, streak: 0, total: 150 });
  assert.equal(lib.crossPoints(1, 25_000, 0).speed, 25);
  assert.equal(lib.crossPoints(2, 60_000, 0).total, 130);
  assert.equal(lib.crossPoints(3, 5000, 2).streak, 20);
  assert.equal(lib.crossPoints(3, 5000, 20).streak, 50);
  // 快得不合理：沒有速度分（基本分、連對分照給）
  assert.deepEqual(lib.crossPoints(1, 1999, 2), { base: 100, speed: 0, streak: 20, total: 120 });
  assert.equal(lib.crossPoints(1, 2000, 0).speed, 50);
  assert.equal(lib.crossPoints(2, 2999, 0).speed, 0);
  assert.equal(lib.crossPoints(3, 3999, 0).speed, 0);
  assert.equal(lib.crossPoints(3, 4000, 0).speed, 50);
});

test('L3 common-factor options do not encode the answer: same options, same order for every item; option-only heuristics do not beat the best constant guess', () => {
  const opts = new Set(),
    ks = new Map();
  const items = [];
  for (let i = 0; i < 3000; i++) {
    const item = cross.crossItem(cross.crossSeed(1234, 3, i), 3);
    const o = lib.kOptions();
    opts.add(JSON.stringify(o));
    assert(o.includes(item.k));
    ks.set(item.k, (ks.get(item.k) || 0) + 1);
    items.push({ k: item.k, o });
  }
  assert.equal(opts.size, 1, 'options are identical for every L3 item (multiset, sign pattern and positions)');
  const [only] = [...opts].map((x) => JSON.parse(x));
  assert.deepEqual(only, lib.CROSS_K_OPTIONS);
  assert.equal(only.filter((x) => x > 0).length, only.filter((x) => x < 0).length, 'symmetric sign pattern');
  const best = Math.max(...ks.values()) / items.length;
  // 舊版的攻擊：找一對互為正負的選項，取和第三個同號的；取 |k| 最大；取第一個、最後一個、中間的位置
  const attacks = {
    pairSign: (o) => {
      const pair = o.filter((x) => o.includes(-x));
      const third = o.find((x) => !o.includes(-x));
      return pair.find((x) => third === undefined || Math.sign(x) === Math.sign(third)) ?? pair[0];
    },
    largest: (o) => o.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), o[0]),
    first: (o) => o[0],
    last: (o) => o[o.length - 1],
    middle: (o) => o[Math.floor(o.length / 2)],
  };
  for (const [name, attack] of Object.entries(attacks)) {
    const hit = items.filter((x) => attack(x.o) === x.k).length / items.length;
    assert(hit <= best + 0.02, `${name}: ${hit} vs best constant ${best}`);
    assert(hit < 0.35, `${name} accuracy ${hit}`);
  }
  // 正解的位置分散在多個位置（不是固定在某一格）
  const pos = new Set(items.map((x) => x.o.indexOf(x.k)));
  assert(pos.size >= 5, `answer positions ${[...pos]}`);
});

test('live battle: answers never reach students before submit, distinct items, judge, strict payload, replay, rate limit, scoring, escalation', async () => {
  const { f, s, ctl, act } = await setup([1, 2, 3, 4]);
  assert.equal((await ctl({ action: 'cross-start', level: 1, seconds: 0 })).status, 200);
  const run = (await f.call(`/api/sessions/${s.id}`)).body.session.cross;
  assert.equal(run.level, 1);
  const factoredAll = () => Object.values(f.data.sessions[s.id].crossPlay[run.id].seats).flatMap((x) => (x.cur ? [cross.crossItem(x.cur.seed, x.cur.level)] : [])).map((it) => cross.factoredTex(it.k, it.p, it.q, it.r, it.s));
  // 四個人拿題：題目都不一樣
  const items = {};
  for (const seat of [1, 2, 3, 4]) items[seat] = (await act(`seat${seat}`, { op: 'next' })).body.item;
  assert.equal(new Set(Object.values(items).map((x) => JSON.stringify(x.poly))).size, 4, 'distinct per student');
  for (const it of Object.values(items)) {
    assert.equal(it.cards.length, 4);
    assert.deepEqual(Object.keys(it).sort(), ['cards', 'id', 'leadLocked', 'level', 'poly'].sort());
    for (const c of it.cards) assert.deepEqual(Object.keys(c).sort(), ['id', 'kind', 'value']);
  }
  // 拿兩次 next：同一題（不會換題刷分），revision 不變、不推送（X-Classroom-Quiet）
  unthrottle(f, s);
  const rev0 = f.data.sessions[s.id].session.revision;
  const again = await act('seat1', { op: 'next' });
  assert.equal(again.body.item.id, items[1].id);
  assert.equal(again.body.revision, rev0);
  assert.equal(f.data.sessions[s.id].session.revision, rev0, 'idempotent next does not bump the revision');
  assert.equal(again.quiet, true, 'idempotent next does not broadcast');
  // 拿題限速：0.25 秒內再拿 → 429
  assert.equal((await act('seat1', { op: 'next' })).status, 429);
  // 學生讀課堂畫面、即時推送：都沒有答案
  for (const seat of [1, 2]) {
    const v = await f.call(`/api/sessions/${s.id}`, 'GET', null, `seat${seat}`);
    assert.equal(v.body.cross.mine.item.id, items[seat].id);
    assert(!v.body.cross.rows && !v.body.cross.recent, 'students do not get the teacher board');
    const ticket = await liveTicket(new Request(`http://localhost/api/live?sessionId=${s.id}`, { headers: { Cookie: f.cookie(`seat${seat}`) } }), f.data);
    const live = liveView(f.data, ticket);
    f.seen.push({ path: 'live', text: JSON.stringify(live) });
    assert.equal(live.cross.mine.item.id, items[seat].id);
  }
  for (const m of f.seen) assertNoLeak(m.text, factoredAll());

  // 送出：卡片要是這一題的、不能重複、不能放錯欄、itemId 要對
  unthrottle(f, s);
  const it1 = items[1];
  const sol = solve(it1);
  const bad = async (body, status) => {
    unthrottle(f, s);
    const r = await act('seat1', { op: 'submit', itemId: it1.id, ...body });
    assert.equal(r.status, status, JSON.stringify(body) + ' ' + JSON.stringify(r.body));
  };
  await bad({ cards: { ...sol.cards, const0: 'k99' } }, 400);
  await bad({ cards: { ...sol.cards, const0: sol.cards.const1 } }, 400);
  await bad({ cards: { const0: sol.cards.const0 } }, 400);
  await bad({ cards: { ...sol.cards, lead0: sol.cards.const0 } }, 400);
  await bad({ cards: { ...sol.cards, extra: 'k0' } }, 400);
  await bad({ cards: 'k0,k1' }, 400);
  await bad({ cards: { const0: 7, const1: -2 } }, 400);
  unthrottle(f, s);
  assert.equal((await act('seat1', { op: 'submit', itemId: 'nope', ...sol })).status, 409);
  assert.equal(f.data.sessions[s.id].crossPlay[run.id].seats['1'].attempts, 0, 'rejected payloads are not counted');
  // 正確
  unthrottle(f, s);
  const ok = (await act('seat1', { op: 'submit', itemId: it1.id, ...sol })).body;
  assert.equal(ok.ok, true);
  assert.equal(ok.itemId, it1.id);
  assert.equal(ok.reason, null);
  assert.equal(ok.streak, 1);
  // 送出回應帶伺服器算好的完整個人統計（前端直接指派）
  assert.deepEqual(ok.mine, { score: ok.score, streak: 1, correct: 1, attempts: 1, level: 1 });
  assert(ok.points.total >= 100 && ok.points.speed === 50);
  assert.match(ok.factored, /\(x[+-]\d+\)\(x[+-]\d+\)/);
  assert.equal(ok.products[0] + ok.products[1], ok.target);
  // 重送同一題：拒絕（不會重複加分）
  unthrottle(f, s);
  assert.equal((await act('seat1', { op: 'submit', itemId: it1.id, ...sol })).status, 409);
  // 上下兩列對調也算對
  unthrottle(f, s);
  const it1b = (await act('seat1', { op: 'next' })).body.item;
  unthrottle(f, s);
  const solB = solve(it1b);
  const swapped = { cards: { const0: solB.cards.const1, const1: solB.cards.const0 }, k: 1 };
  assert.equal((await act('seat1', { op: 'submit', itemId: it1b.id, ...swapped })).body.ok, true);
  // 限速：拿題後馬上送出
  const it1c = (await act('seat1', { op: 'next' })).body.item;
  assert.equal((await act('seat1', { op: 'submit', itemId: it1c.id, ...solve(it1c) })).status, 429);
  // 第三題答對 → 升到 L2
  unthrottle(f, s);
  const r3 = (await act('seat1', { op: 'submit', itemId: it1c.id, ...solve(it1c) })).body;
  assert.equal(r3.ok, true);
  assert.equal(r3.levelUp, true);
  assert.equal(r3.level, 2);
  assert.equal(r3.points.streak, 20);
  unthrottle(f, s);
  const l2 = (await act('seat1', { op: 'next' })).body.item;
  assert.equal(l2.level, 2);
  assert.equal(l2.cards.length, 6);
  // 答錯：0 分、連對歸零、不扣分；送出後才有因式分解
  const before = f.data.sessions[s.id].crossPlay[run.id].seats['1'].score;
  unthrottle(f, s);
  const w = (await act('seat1', { op: 'submit', itemId: l2.id, ...wrongOf(l2) })).body;
  assert.equal(w.ok, false);
  assert(w.reason);
  assert.equal(w.streak, 0);
  assert.equal(w.points.total, 0);
  assert.equal(w.score, before);
  assert.equal(typeof w.factored, 'string');
  // 老師畫面：排行（座號 1 第一）、答對／作答數；最近送出的只有原式，「公布」才有因式分解
  const tv = (await f.call(`/api/sessions/${s.id}`)).body.cross;
  assert.equal(tv.rows[0].seat, 1);
  assert.deepEqual(tv.totals, { players: 4, correct: 3, attempts: 4 });
  assert(tv.recent.length === 4 && tv.recent.every((r) => !('factored' in r)));
  assert.equal(tv.recent[3].id, it1.id, 'recent uses immutable item ids (newest first)');
  assert.equal(tv.recent[3].n, 1);
  const rv = (await f.call(`/api/sessions/${s.id}/cross`, 'POST', { runId: run.id, op: 'reveal', seat: 1, itemId: it1.id })).body;
  assert.equal(rv.factored, ok.factored);
  assert.equal(rv.id, it1.id);
  assert.equal(rv.runId, run.id);
  assert.equal((await f.call(`/api/sessions/${s.id}/cross`, 'POST', { runId: run.id, op: 'reveal', seat: 2, itemId: it1.id })).status, 404, 'item id must belong to that seat');
  // 學生不能公布（學生的 reveal 是未知操作）
  unthrottle(f, s);
  const sr = await f.call(`/api/sessions/${s.id}/cross`, 'POST', { runId: run.id, op: 'reveal', seat: 1, itemId: it1.id }, 'seat2');
  assert.equal(sr.status, 400);
  assert(!JSON.stringify(sr.body).includes(ok.factored));
  // 舊場次的 runId：拒絕
  assert.equal((await f.call(`/api/sessions/${s.id}/cross`, 'POST', { runId: 'old', op: 'next' }, 'seat2')).status, 409);
});

test('teacher controls: lock level, L3 common factor, pause blocks answers and freezes the clock, end, reset, close', async () => {
  const { f, s, ctl, act } = await setup([1, 2]);
  assert.equal((await ctl({ action: 'cross-start', level: 3, lock: true, seconds: 120 })).status, 200);
  const run = (await f.call(`/api/sessions/${s.id}`)).body.session.cross;
  assert.equal(run.lock, true);
  assert(run.deadline > Date.now());
  let it = (await act('seat1', { op: 'next' })).body.item;
  assert.equal(it.level, 3);
  assert.deepEqual(it.kOptions, lib.CROSS_K_OPTIONS);
  // L3：選錯公因數 → reason k；不在選項裡的 k → 400
  unthrottle(f, s);
  const sol = solve(it);
  assert.equal((await act('seat1', { op: 'submit', itemId: it.id, cards: sol.cards, k: 97 })).status, 400);
  unthrottle(f, s);
  const wk = (await act('seat1', { op: 'submit', itemId: it.id, cards: sol.cards, k: it.kOptions.find((k) => k !== sol.k) })).body;
  assert.equal(wk.ok, false);
  assert.equal(wk.reason, 'k');
  // 鎖定等級：連對 3 題仍是 L3
  for (let i = 0; i < 3; i++) {
    unthrottle(f, s);
    it = (await act('seat1', { op: 'next' })).body.item;
    unthrottle(f, s);
    const r = (await act('seat1', { op: 'submit', itemId: it.id, ...solve(it) })).body;
    assert.equal(r.ok, true);
    assert.equal(r.level, 3);
    assert.equal(r.levelUp, false);
  }
  // 暫停：不能拿題、不能送出；限時與發題時間往後延
  unthrottle(f, s);
  it = (await act('seat1', { op: 'next' })).body.item;
  const cur = () => f.data.sessions[s.id].crossPlay[run.id].seats['1'].cur;
  unthrottle(f, s);
  const issued = cur().issuedAt;
  assert.equal((await ctl({ action: 'cross-pause', value: true })).status, 200);
  assert.equal((await act('seat1', { op: 'submit', itemId: it.id, ...solve(it) })).status, 409);
  assert.equal((await act('seat2', { op: 'next' })).status, 409);
  const st = f.data.sessions[s.id].session.cross;
  st.pausedAt -= 5000; // 暫停了 5 秒
  const deadline = st.deadline;
  assert.equal((await ctl({ action: 'cross-pause', value: false })).status, 200);
  const after = f.data.sessions[s.id].session.cross;
  assert(after.deadline >= deadline + 5000 && after.pausedAt === null);
  assert(cur().issuedAt >= issued + 5000);
  // 時間到：不能再作答
  f.data.sessions[s.id].session.cross.deadline = Date.now() - 1;
  unthrottle(f, s);
  assert.equal((await act('seat1', { op: 'submit', itemId: it.id, ...solve(it) })).status, 409);
  const tv = (await f.call(`/api/sessions/${s.id}`)).body.cross;
  assert(tv.run.endedAt && tv.left === 0);
  // 重新開始：新的一場，分數歸零，舊場次的紀錄還在
  assert.equal((await ctl({ action: 'cross-reset' })).status, 200);
  const run2 = (await f.call(`/api/sessions/${s.id}`)).body.session.cross;
  assert.notEqual(run2.id, run.id);
  assert(!run2.endedAt);
  assert.equal(run2.level, 3);
  assert.equal((await f.call(`/api/sessions/${s.id}`)).body.cross.rows.length, 0);
  assert.equal(f.data.sessions[s.id].crossRuns.length, 2);
  assert(f.data.sessions[s.id].crossRuns[0].endedAt);
  // CSV 匯出有十字交乘的列
  const csv = await handleApi(new Request(`http://localhost/api/sessions/${s.id}/export?format=csv`, { headers: { Origin: 'http://localhost', Cookie: f.cookie('teacher') } }), { store: f.store, env: { APP_MODE: 'demo' }, vault: { get: async () => undefined, put: async () => {}, delete: async () => true } });
  assert.match(await csv.text(), /十字交乘對戰/);
  // 結束、收起
  assert.equal((await ctl({ action: 'cross-end' })).status, 200);
  assert((await f.call(`/api/sessions/${s.id}`)).body.session.cross.endedAt);
  assert.equal((await ctl({ action: 'cross-close' })).status, 200);
  assert.equal((await f.call(`/api/sessions/${s.id}`)).body.session.cross, null);
  // 彈幕這類控制不會收起對戰
  assert.equal((await ctl({ action: 'cross-start', level: 1 })).status, 200);
  await ctl({ action: 'danmaku', value: true });
  assert((await f.call(`/api/sessions/${s.id}`)).body.session.cross);
});

test('team tug-of-war: balanced teams, late joiners go to the smaller team, totals, win by margin', async () => {
  const { f, s, ctl, act } = await setup([1, 2, 3, 4]);
  assert.equal((await ctl({ action: 'cross-start', level: 1, team: true, margin: 200 })).status, 200);
  const run = (await f.call(`/api/sessions/${s.id}`)).body.session.cross;
  const teams = Object.values(run.teams);
  assert.equal(teams.length, 4);
  assert.equal(teams.filter((t) => t === 'red').length, 2);
  // 晚到的同學：分到人少的一隊
  await f.call('/api/login', 'POST', { role: 'student', classCode: 'DEMO801', seat: 5 }, 'seat5');
  const j = (await act('seat5', { op: 'next' })).body;
  assert(['red', 'blue'].includes(j.team));
  const now = (await f.call(`/api/sessions/${s.id}`)).body.session.cross.teams;
  const red = Object.entries(now).filter(([, t]) => t === 'red').map(([k]) => Number(k));
  const solveSeat = async (seat) => {
    unthrottle(f, s);
    const it = (await act(`seat${seat}`, { op: 'next' })).body.item;
    unthrottle(f, s);
    return (await act(`seat${seat}`, { op: 'submit', itemId: it.id, ...solve(it) })).body;
  };
  // 紅隊一位答對一題：還沒結束；兩隊總分、學生也看得到（拔河），看不到排行
  const r1 = await solveSeat(red[0]);
  assert.equal(r1.ok, true);
  let tv = (await f.call(`/api/sessions/${s.id}`)).body.cross;
  assert.equal(tv.teams.total.red, r1.points.total);
  assert.equal(tv.teams.total.blue, 0);
  assert.equal(r1.over, r1.points.total / red.length >= 200);
  const sv = (await f.call(`/api/sessions/${s.id}`, 'GET', null, `seat${red[1]}`)).body.cross;
  assert.equal(sv.teams.total.red, r1.points.total);
  assert.equal(sv.mine.team, 'red');
  assert(!sv.rows);
  // 紅隊每人都答對：平均分差 ≥ 200 時分出勝負
  let total = r1.points.total,
    last = r1;
  for (let i = 1; i < red.length * 3 && !last.over; i++) {
    last = await solveSeat(red[i % red.length]);
    total += last.points.total;
    assert.equal(last.over, total / red.length >= 200);
  }
  assert.equal(last.over, true);
  tv = (await f.call(`/api/sessions/${s.id}`)).body.cross;
  assert.equal(tv.run.winner, 'red');
  assert(tv.run.endedAt);
  // 結束後不能再作答
  unthrottle(f, s);
  assert.equal((await act(`seat${red[0]}`, { op: 'next' })).status, 409);
  // 開戰後才打開拔河：已經在玩的人一起分隊
  await ctl({ action: 'cross-start', level: 1 });
  assert.deepEqual((await f.call(`/api/sessions/${s.id}`)).body.session.cross.teams, {});
  await ctl({ action: 'cross-team', value: true });
  const t2 = (await f.call(`/api/sessions/${s.id}`)).body.session.cross;
  assert.equal(t2.team, true);
  assert(Object.keys(t2.teams).length >= 4);
});

test('anti-guessing: escalating cooldown after wrong answers, per-minute submit budget, no speed bonus for implausibly fast answers', async () => {
  const { f, s, ctl, act } = await setup([1]);
  assert.equal((await ctl({ action: 'cross-start', level: 1, lock: true })).status, 200);
  const run = (await f.call(`/api/sessions/${s.id}`)).body.session.cross;
  const seat = () => f.data.sessions[s.id].crossPlay[run.id].seats['1'];
  const cooldowns = [];
  for (let i = 0; i < 4; i++) {
    unthrottle(f, s);
    const it = (await act('seat1', { op: 'next' })).body.item;
    unthrottle(f, s);
    const t0 = Date.now();
    const w = (await act('seat1', { op: 'submit', itemId: it.id, ...wrongOf(it) })).body;
    assert.equal(w.ok, false);
    assert(w.mine.cool >= t0, 'cooldown returned with the result');
    cooldowns.push(w.mine.cool - t0);
    // 冷卻中：不能拿下一題（429），被拒不算作答
    ready(f, s);
    const blocked = await act('seat1', { op: 'next' });
    assert.equal(blocked.status, 429);
    assert.match(blocked.body.error, /冷卻/);
    // 學生畫面也看得到冷卻時間（重新整理後一樣）
    assert.equal((await f.call(`/api/sessions/${s.id}`, 'GET', null, 'seat1')).body.cross.mine.cool, seat().cool);
  }
  // 連錯 1、2、3、4 題：1.5、3、5、5 秒（允許測試執行的誤差）
  for (const [i, want] of [1500, 3000, 5000, 5000].entries()) assert(cooldowns[i] >= want && cooldowns[i] < want + 1000, `cooldown ${i}: ${cooldowns[i]}`);
  assert.equal(seat().attempts, 4);
  // 冷卻過了：拿題、答對（剛發題就送出：快得不合理，沒有速度分）→ 冷卻與連錯歸零
  seat().cool = Date.now() - 1;
  ready(f, s);
  const it = (await act('seat1', { op: 'next' })).body.item;
  ready(f, s);
  const fast = (await act('seat1', { op: 'submit', itemId: it.id, ...solve(it) })).body;
  assert.equal(fast.ok, true);
  assert(fast.ms < 2000);
  assert.equal(fast.points.speed, 0, 'no speed bonus under 2 s at L1');
  assert.equal(fast.mine.cool, undefined);
  assert.equal(seat().wrong, 0);
  // 每分鐘上限：這一分鐘已經送出 15 次 → 429，不算作答
  ready(f, s);
  const it2 = (await act('seat1', { op: 'next' })).body.item;
  unthrottle(f, s);
  seat().hits = Array.from({ length: 15 }, (_, i) => Date.now() - 1000 * i);
  const over = await act('seat1', { op: 'submit', itemId: it2.id, ...solve(it2) });
  assert.equal(over.status, 429);
  assert.equal(seat().attempts, 5);
  // 一分鐘前的不算
  seat().hits = Array.from({ length: 15 }, (_, i) => Date.now() - 61_000 - i);
  seat().at -= 10_000;
  assert.equal((await act('seat1', { op: 'submit', itemId: it2.id, ...solve(it2) })).body.ok, true);
});

test('more than 30 submissions: recent list capped at 30 for repeats, full log kept for CSV/JSON with stable item ids; log cap drops the oldest and says so', async () => {
  const { f, s, ctl, act } = await setup([1, 2]);
  assert.equal((await ctl({ action: 'cross-start', level: 1, lock: true })).status, 200);
  const run = (await f.call(`/api/sessions/${s.id}`)).body.session.cross;
  const ids = [];
  for (let i = 0; i < 35; i++) {
    unthrottle(f, s);
    const it = (await act('seat1', { op: 'next' })).body.item;
    unthrottle(f, s);
    const r = (await act('seat1', { op: 'submit', itemId: it.id, ...(i % 5 === 4 ? wrongOf(it) : solve(it)) })).body;
    assert.equal(r.itemId, it.id);
    ids.push(it.id);
  }
  assert.equal(new Set(ids).size, 35);
  const play = f.data.sessions[s.id].crossPlay[run.id];
  assert.equal(play.seats['1'].past.length, 30);
  assert.equal(play.log.length, 35);
  assert.deepEqual(play.log.map((x) => x.n), Array.from({ length: 35 }, (_, i) => i + 1));
  // 老師畫面：最近 8 筆，用題目 ID；第 1 題（已經不在 past 裡）也還能公布
  const tv = (await f.call(`/api/sessions/${s.id}`)).body.cross;
  assert.deepEqual(tv.recent.map((x) => x.id), ids.slice(-8).reverse());
  const first = (await f.call(`/api/sessions/${s.id}/cross`, 'POST', { runId: run.id, op: 'reveal', seat: 1, itemId: ids[0] })).body;
  assert.equal(first.id, ids[0]);
  assert.match(first.factored, /\(x[+-]\d+\)/);
  // CSV：35 列；JSON：35 筆（含因式分解，不含種子）
  const exp = async (q) => handleApi(new Request(`http://localhost/api/sessions/${s.id}/export${q}`, { headers: { Origin: 'http://localhost', Cookie: f.cookie('teacher') } }), { store: f.store, env: { APP_MODE: 'demo' }, vault: { get: async () => undefined, put: async () => {}, delete: async () => true } });
  const csv = await (await exp('?format=csv')).text();
  assert.equal(csv.split('\n').filter((l) => l.includes('十字交乘對戰')).length, 35);
  const json = await (await exp('')).json();
  assert.equal(json.crossLog[run.id].log.length, 35);
  assert(json.crossLog[run.id].log.every((x) => x.factored && !('seed' in x)));
  // 容量上限：超過 CROSS_LOG_CAP 時丟掉最舊的、記下丟了幾筆，CSV 多一列說明
  const store = { crossRuns: [run], crossPlay: { [run.id]: { secret: 1, seats: {}, log: Array.from({ length: lib.CROSS_LOG_CAP }, (_, i) => ({ id: `old${i}`, seat: 2, n: i + 1, level: 1, seed: i, ok: true, points: 100, ms: 5000, at: 1 })) } } };
  const live = structuredClone(run);
  lib.issueItem(live, store, 3, Date.now() - 5000);
  const cur = store.crossPlay[run.id].seats['3'].cur;
  const item = lib.itemView(store.crossPlay[run.id].seats['3']);
  lib.submitCross(live, store, 3, { itemId: cur.id, ...solve(item) }, Date.now());
  assert.equal(store.crossPlay[run.id].log.length, lib.CROSS_LOG_CAP);
  assert.equal(store.crossPlay[run.id].dropped, 1);
  assert.equal(store.crossPlay[run.id].log[0].id, 'old1');
  const rows = lib.crossCsvRows(store);
  assert.equal(rows.length, lib.CROSS_LOG_CAP + 1);
  assert.match(String(rows[0][8]), /最早的 1 筆沒有保存/);
});

test('security: a student token cannot use any teacher cross control, reveal, or the JSON/CSV exports', async () => {
  const { f, s, ctl, act } = await setup([1]);
  assert.equal((await ctl({ action: 'cross-start', level: 1, seconds: 120 })).status, 200);
  const run = (await f.call(`/api/sessions/${s.id}`)).body.session.cross;
  const it = (await act('seat1', { op: 'next' })).body.item;
  for (const body of [{ action: 'cross-start', level: 3 }, { action: 'cross-pause', value: true }, { action: 'cross-pause', value: false }, { action: 'cross-team', value: true }, { action: 'cross-end' }, { action: 'cross-reset' }, { action: 'cross-close' }]) {
    const r = await f.call(`/api/sessions/${s.id}/control`, 'POST', body, 'seat1');
    assert.equal(r.status, 403, JSON.stringify(body));
  }
  const after = (await f.call(`/api/sessions/${s.id}`)).body.session.cross;
  assert.equal(after.id, run.id);
  assert(!after.endedAt && !after.pausedAt && !after.team);
  for (const q of ['', '?format=csv']) {
    const r = await f.call(`/api/sessions/${s.id}/export${q}`, 'GET', null, 'seat1');
    assert.equal(r.status, 403, `export${q}`);
  }
  ready(f, s);
  const rv = await f.call(`/api/sessions/${s.id}/cross`, 'POST', { runId: run.id, op: 'reveal', seat: 1, itemId: it.id }, 'seat1');
  assert.equal(rv.status, 400);
  assert(!/factored/.test(JSON.stringify(rv.body)));
  // 不認得的操作
  ready(f, s);
  assert.equal((await act('seat1', { op: 'grade' })).status, 400);
});

test('empty teams: no margin win while a team is empty; at the end an empty team never wins; both empty is a draw', async () => {
  const { f, s, ctl, act } = await setup([1]);
  // 只有一位同學（只有一隊有人）、門檻 50：答對也不會提前獲勝
  assert.equal((await ctl({ action: 'cross-start', level: 1, team: true, margin: 50 })).status, 200);
  const run = (await f.call(`/api/sessions/${s.id}`)).body.session.cross;
  const mine = run.teams['1'];
  assert(mine);
  unthrottle(f, s);
  const it = (await act('seat1', { op: 'next' })).body.item;
  unthrottle(f, s);
  const r = (await act('seat1', { op: 'submit', itemId: it.id, ...solve(it) })).body;
  assert.equal(r.ok, true);
  assert.equal(r.over, false, 'no margin win against an empty team');
  // 老師結束：有人且平均分 > 0 的那一隊獲勝
  assert.equal((await ctl({ action: 'cross-end' })).status, 200);
  assert.equal((await f.call(`/api/sessions/${s.id}`)).body.session.cross.winner, mine);
  // 只有一隊有人、0 分：平手；兩隊都沒人：平手；兩隊都有人同分：平手
  const base = { ...run, endedAt: undefined, team: true, margin: 50 };
  const store = (scores) => ({ crossPlay: { [run.id]: { secret: 1, seats: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, { score: v }])) } } });
  assert.equal(lib.crossLeader({ ...base, teams: { 1: 'red' } }, store({ 1: 0 })), 'draw');
  assert.equal(lib.crossLeader({ ...base, teams: { 1: 'blue' } }, store({ 1: 10 })), 'blue');
  assert.equal(lib.crossLeader({ ...base, teams: {} }, store({})), 'draw');
  assert.equal(lib.crossLeader({ ...base, teams: { 1: 'red', 2: 'blue' } }, store({ 1: 30, 2: 30 })), 'draw');
  assert.equal(lib.crossLeader({ ...base, teams: { 1: 'red', 2: 'blue' } }, store({ 1: 10, 2: 30 })), 'blue');
  assert.equal(lib.crossMarginWinner({ ...base, teams: { 1: 'red' } }, store({ 1: 999 })), null);
  assert.equal(lib.crossMarginWinner({ ...base, teams: { 1: 'red', 2: 'blue' } }, store({ 1: 999, 2: 0 })), 'red');
  // 時間到（沒有人送出、兩隊都沒人）：平手
  assert.equal((await ctl({ action: 'cross-reset' })).status, 200);
  const st = f.data.sessions[s.id];
  st.session.cross.teams = {};
  st.session.cross.deadline = Date.now() - 1;
  assert.equal(settleCrossSession(f.data, s.id).changed, true);
  assert.equal(f.data.sessions[s.id].session.cross.winner, 'draw');
});

test('idle time-limit expiry: alarm schedule follows start/pause/resume/end; settle persists once, bumps the revision and is idempotent; a late request settles too', async () => {
  const { f, s, ctl, act } = await setup([1, 2]);
  f.sched.length = 0;
  assert.equal((await ctl({ action: 'cross-start', level: 1, seconds: 60 })).status, 200);
  let run = (await f.call(`/api/sessions/${s.id}`)).body.session.cross;
  assert.deepEqual(f.sched.at(-1), [s.id, run.deadline]);
  await ctl({ action: 'cross-pause', value: true });
  assert.deepEqual(f.sched.at(-1), [s.id, null]);
  await ctl({ action: 'cross-pause', value: false });
  run = (await f.call(`/api/sessions/${s.id}`)).body.session.cross;
  assert.deepEqual(f.sched.at(-1), [s.id, run.deadline]);
  // 彈幕這類控制不會重排
  const n = f.sched.length;
  await ctl({ action: 'danmaku', value: true });
  assert.equal(f.sched.length, n);
  // 還沒到期：settle 不改任何東西、不推送
  const early = await act('seat1', { op: 'settle' });
  assert.equal(early.status, 200);
  assert.equal(early.body.over, false);
  assert.equal(early.quiet, true);
  // 全班閒置、時間到：alarm（settleCrossSession）結算一次；再呼叫不會再改
  const it = (await act('seat1', { op: 'next' })).body.item;
  assert(it);
  f.data.sessions[s.id].session.cross.deadline = Date.now() - 1;
  const copy = structuredClone(f.data);
  const rev = copy.sessions[s.id].session.revision;
  assert.deepEqual(settleCrossSession(copy, s.id), { changed: true, deadline: null });
  assert.equal(copy.sessions[s.id].session.revision, rev + 1);
  assert(copy.sessions[s.id].session.cross.endedAt);
  assert(copy.sessions[s.id].crossRuns.at(-1).endedAt, 'the kept run record is closed too');
  assert.deepEqual(settleCrossSession(copy, s.id), { changed: false, deadline: null });
  // 用戶端到期時的 settle（沒有 alarm 的環境）：第一次保存＋推送，第二次 quiet
  const a = await act('seat1', { op: 'settle' });
  assert.equal(a.status, 200);
  assert.deepEqual(a.body, { over: true, revision: rev + 1 });
  assert.equal(a.quiet, false);
  assert(f.data.sessions[s.id].session.cross.endedAt, 'persisted');
  assert.deepEqual(f.sched.at(-1), [s.id, null]);
  const b = await f.call(`/api/sessions/${s.id}/cross`, 'POST', { runId: run.id, op: 'settle' });
  assert.equal(b.quiet, true);
  assert.equal(b.body.revision, rev + 1);
  // 晚到的作答（時間到之後才送出）：409，並且觸發推送
  await ctl({ action: 'cross-reset' });
  run = (await f.call(`/api/sessions/${s.id}`)).body.session.cross;
  unthrottle(f, s);
  const it2 = (await act('seat2', { op: 'next' })).body.item;
  f.data.sessions[s.id].session.cross.deadline = Date.now() - 1;
  unthrottle(f, s);
  const late = await act('seat2', { op: 'submit', itemId: it2.id, ...solve(it2) });
  assert.equal(late.status, 409);
  assert.equal(late.changed, true);
  assert(f.data.sessions[s.id].session.cross.endedAt, 'expiry persisted by the rejected request');
  assert.equal(f.data.sessions[s.id].crossPlay[run.id].seats['2'].attempts, 0);
});

test('double submit of the same item through a serialized queue: exactly one is judged', async () => {
  const { f, s, ctl, act } = await setup([1]);
  await ctl({ action: 'cross-start', level: 1 });
  unthrottle(f, s);
  const it = (await act('seat1', { op: 'next' })).body.item;
  unthrottle(f, s);
  // 和 Durable Object 一樣把請求排成一列（ClassroomDurableObject.enqueue）
  let queue = Promise.resolve();
  const enqueue = (job) => {
    const r = queue.then(job);
    queue = r.then(() => {}, () => {});
    return r;
  };
  const sol = solve(it);
  const [x, y] = await Promise.all([enqueue(() => act('seat1', { op: 'submit', itemId: it.id, ...sol })), enqueue(() => act('seat1', { op: 'submit', itemId: it.id, ...sol }))]);
  // 第二次：同一題已經送出（409），或兩次送出太近（429）；不會再判一次
  assert.equal(x.status, 200);
  assert([409, 429].includes(y.status), String(y.status));
  const run = (await f.call(`/api/sessions/${s.id}`)).body.session.cross;
  assert.equal(f.data.sessions[s.id].crossPlay[run.id].seats['1'].attempts, 1);
  assert.equal(f.data.sessions[s.id].crossPlay[run.id].log.length, 1);
});

/* ───── 2026-11-17 Codex 複審（第 4 輪）：共用 alarm、排程與保存一致、畫面唯讀、整堂課容量、公布座號範圍 ───── */
/** Durable Object 用的記憶體儲存（含 transaction、alarm）；failKey(key) 回傳 true 時這次寫入失敗（故障注入）。 */
function doStorage(failKey = () => false) {
  const values = new Map();
  const methods = (map) => ({
    async get(key) { const v = map.get(key); return v === undefined ? undefined : structuredClone(v); },
    async put(key, value) { if (failKey(key)) throw new Error('Injected storage failure'); map.set(key, structuredClone(value)); },
    async delete(key) { return map.delete(key); },
  });
  const storage = {
    ...methods(values),
    async transaction(operation) { const copy = structuredClone(values); const result = await operation(methods(copy)); values.clear(); for (const [k, v] of copy) values.set(k, v); return result; },
    alarmAt: null,
    async setAlarm(t) { storage.alarmAt = t; },
    async getAlarm() { return storage.alarmAt; },
  };
  return { values, storage };
}
async function doClassroom(env = { APP_MODE: 'demo' }, failKey) {
  const { values, storage } = doStorage(failKey);
  const object = new ClassroomDurableObject({ storage }, env);
  const request = (path, method = 'GET', body, cookie) => new Request(`http://localhost${path}`, { method, headers: { Origin: 'http://localhost', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
  const cookie = (await object.fetch(request('/api/login', 'POST', TEACHER))).headers.get('Set-Cookie').split(';')[0];
  const call = async (path, method = 'GET', body) => {
    const r = await object.fetch(request(path, method, body, cookie));
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  };
  const dash = (await call('/api/dashboard')).body;
  const cl = dash.classes[0];
  const s = (await call('/api/sessions', 'POST', { lessonId: dash.lessons[0].id, classId: cl.id })).body.session;
  return { values, storage, object, request, call, cl, s, ctl: (body) => call(`/api/sessions/${s.id}/control`, 'POST', body) };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('NB1: the shared alarm settles a due battle while a slow homework AI call is in flight; the homework job still completes exactly once', async () => {
  const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
  const env = { APP_MODE: 'demo', AI_API_KEY: 'test-only-no-real-key', AI_MODEL: 'test-model', AI_BASE_URL: 'https://provider.example/v1' };
  const original = globalThis.fetch;
  let aiCalls = 0, release, started;
  const gate = new Promise((r) => (release = r));
  const inFlight = new Promise((r) => (started = r));
  try {
    const { values, storage, object, request, call, cl, s, ctl } = await doClassroom(env);
    // 作業：派給 1 號、上傳照片、送出（排 alarm）
    const created = (await call('/api/homework', 'POST', { classId: cl.id, lessonId: 'g8-2-2a', seats: [1] })).body;
    const hw = created.homework.id, token = new URL(created.sheets[0].url).hash.split('/')[4];
    assert.equal((await object.fetch(request(`/api/hw/${hw}/1/photos?t=${token}`, 'POST', { dataUrl: JPEG }))).status, 200);
    // 慢速 AI：卡住直到測試放行（模擬 150 秒的批改）
    globalThis.fetch = async () => { aiCalls++; started(); await gate; return Response.json({ choices: [{ message: { content: '{"items":[]}' } }] }); };
    assert.equal((await (await object.fetch(request(`/api/hw/${hw}/1/submit?t=${token}`, 'POST', {}))).json()).sheet.status, 'queued');
    // 限時 1 秒的對戰
    assert.equal((await ctl({ action: 'cross-start', level: 1, seconds: 1 })).status, 200);
    const run = (await call(`/api/sessions/${s.id}`)).body.session.cross;
    assert.equal(values.get('cross-due')[s.id], run.deadline);
    storage.alarmAt = null;
    const alarm = object.alarm();
    await inFlight;
    // AI 還在批改：對戰到期後不等批改，就已經結算並保存
    let ended;
    for (let i = 0; i < 40 && !ended; i++) {
      await sleep(100);
      ended = (await call(`/api/sessions/${s.id}/export`)).body.crossRuns.find((r) => r.id === run.id).endedAt;
    }
    assert.equal(ended, run.deadline, 'settled while the homework AI call is still in flight');
    assert.equal(aiCalls, 1);
    assert.equal(values.get(`hw:${hw}`).sheets['1'].status, 'grading', 'homework still in flight');
    const exported = (await call(`/api/sessions/${s.id}/export`)).body;
    assert.equal(exported.crossRuns.find((r) => r.id === run.id).endedAt, run.deadline);
    assert(!(s.id in (values.get('cross-due') || {})), 'removed from the schedule after the save');
    release();
    await alarm;
    const sheet = values.get(`hw:${hw}`).sheets['1'];
    assert.equal(sheet.status, 'graded');
    assert.equal(sheet.submissions, 1);
    assert.equal(aiCalls, 1, 'graded exactly once');
    const main = (await call('/api/homework')).body.homework.find((h) => h.id === hw);
    assert.equal(main.sheets['1'].status, 'graded');
    // 再叫醒一次：沒有工作、沒有對戰，不會重批、不會再改
    const rev = (await call(`/api/sessions/${s.id}`)).body.session.revision;
    await object.alarm();
    assert.equal(aiCalls, 1);
    assert.equal((await call(`/api/sessions/${s.id}`)).body.session.revision, rev);
  } finally {
    release?.();
    globalThis.fetch = original;
  }
});

test('NB2: the schedule follows persisted state — a pause whose save fails keeps the wake-up, and the battle is still settled later; extra wake-ups are harmless', async () => {
  let failSess = false;
  const { values, storage, object, call, s, ctl } = await doClassroom({ APP_MODE: 'demo' }, (k) => failSess && k.startsWith('sess:'));
  // 保存的結束時間（不看畫面：畫面在時間到時就先顯示結束）：場次紀錄只有結算路徑會寫
  const persisted = async (runId) => (await call(`/api/sessions/${s.id}/export`)).body.crossRuns.find((r) => r.id === runId)?.endedAt;
  assert.equal((await ctl({ action: 'cross-start', level: 1, seconds: 1 })).status, 200);
  const run = (await call(`/api/sessions/${s.id}`)).body.session.cross;
  assert.equal(values.get('cross-due')[s.id], run.deadline);
  assert.equal(storage.alarmAt, run.deadline);
  // 暫停：排程先被要求取消，接著課堂保存失敗
  failSess = true;
  assert.notEqual((await ctl({ action: 'cross-pause', value: true })).status, 200);
  failSess = false;
  const kept = (await call(`/api/sessions/${s.id}`)).body.session.cross;
  assert.equal(kept.pausedAt, null, 'the pause was not persisted');
  assert.equal(values.get('cross-due')[s.id], run.deadline, 'the wake-up is still scheduled');
  // 到期：alarm 依保存的資料結算
  await sleep(Math.max(0, run.deadline - Date.now()) + 50);
  await object.alarm();
  const v = (await call(`/api/sessions/${s.id}`)).body;
  assert.equal(await persisted(run.id), run.deadline);
  assert.equal(v.session.cross.endedAt, run.deadline);
  assert(!(s.id in values.get('cross-due')));
  // 多叫醒一次：沒有變更
  await object.alarm();
  assert.equal((await call(`/api/sessions/${s.id}`)).body.session.revision, v.session.revision);

  // 結算的保存失敗：排程留著，下一次 alarm 再結算
  assert.equal((await ctl({ action: 'cross-reset' })).status, 200);
  const run2 = (await call(`/api/sessions/${s.id}`)).body.session.cross;
  assert.equal(values.get('cross-due')[s.id], run2.deadline);
  await sleep(Math.max(0, run2.deadline - Date.now()) + 50);
  failSess = true;
  storage.alarmAt = null;
  await object.alarm();
  failSess = false;
  assert.equal(values.get('cross-due')[s.id], run2.deadline, 'still scheduled after the failed save');
  assert(storage.alarmAt && storage.alarmAt <= Date.now() + 6000, 'retry soon');
  assert.equal(await persisted(run2.id), undefined, 'not persisted yet');
  await object.alarm();
  assert.equal(await persisted(run2.id), run2.deadline);
  assert(!(s.id in values.get('cross-due')));

  // 暫停再繼續（都保存成功）：排程跟著到期時間走；暫停中被叫醒不會結束
  assert.equal((await ctl({ action: 'cross-reset' })).status, 200);
  assert.equal((await ctl({ action: 'cross-pause', value: true })).status, 200);
  await sleep(1100);
  await object.alarm();
  assert(!(await call(`/api/sessions/${s.id}`)).body.session.cross.endedAt, 'paused: not ended');
  assert.equal(await persisted((await call(`/api/sessions/${s.id}`)).body.session.cross.id), undefined);
  assert(!(s.id in values.get('cross-due')), 'paused and persisted: removed');
  assert.equal((await ctl({ action: 'cross-pause', value: false })).status, 200);
  const run3 = (await call(`/api/sessions/${s.id}`)).body.session.cross;
  assert.equal(values.get('cross-due')[s.id], run3.deadline);
});

test('SF1: crossView is read-only — an expired battle is shown as over but only the settle path ends it (run record, revision)', async () => {
  const { f, s, ctl } = await setup([1]);
  assert.equal((await ctl({ action: 'cross-start', level: 1, seconds: 60 })).status, 200);
  const st = f.data.sessions[s.id];
  st.session.cross.deadline = Date.now() - 1;
  const before = structuredClone(st);
  const tv = lib.crossView(st.session.cross, st, { role: 'teacher' }, Date.now());
  const sv = lib.crossView(st.session.cross, st, { role: 'student', seat: 1 }, Date.now());
  assert.equal(tv.run.endedAt, st.session.cross.deadline);
  assert.equal(sv.run.endedAt, st.session.cross.deadline);
  assert.equal(sv.mine.item, undefined);
  assert.deepEqual(st, before, 'nothing mutated');
  // 學生出席更新（會保存整個課堂畫面）：保存的對戰沒有被畫面函式偷偷結束
  const r = await f.call('/api/student/session', 'GET', null, 'seat1');
  assert.equal(r.status, 200);
  assert(r.body.cross.run.endedAt, 'the student sees it as over');
  const saved = f.data.sessions[s.id];
  assert.equal(saved.session.cross.endedAt, undefined, 'not ended by a view');
  // 正式結算：場次紀錄、revision 都更新
  const rev = saved.session.revision;
  assert.equal(settleCrossSession(f.data, s.id).changed, true);
  assert.equal(f.data.sessions[s.id].crossRuns.at(-1).endedAt, saved.session.cross.deadline);
  assert.equal(f.data.sessions[s.id].session.revision, rev + 1);
  // 控制指令先結算：到期後按暫停 → 409（沒保存，交給 alarm）；下一個保存的控制指令把結束一起存進去
  const { f: g, s: s2, ctl: ctl2 } = await setup([1]);
  await ctl2({ action: 'cross-start', level: 1, seconds: 60 });
  g.data.sessions[s2.id].session.cross.deadline = Date.now() - 1;
  assert.equal((await ctl2({ action: 'cross-pause', value: true })).status, 409);
  assert.equal((await ctl2({ action: 'danmaku', value: true })).status, 200);
  const done = g.data.sessions[s2.id];
  assert.equal(done.session.cross.endedAt, done.session.cross.deadline, 'settled by the next saved control');
  assert.equal(done.crossRuns.at(-1).endedAt, done.session.cross.deadline);
});

test('SF3: whole-class storage budget — only the last rounds keep per-item logs, older rounds are archived as per-seat totals, round records are capped', async () => {
  const { f, s, ctl, act } = await setup([1]);
  assert.equal((await ctl({ action: 'cross-start', level: 1 })).status, 200);
  for (let round = 0; round < 5; round++) {
    unthrottle(f, s);
    const it = (await act('seat1', { op: 'next' })).body.item;
    unthrottle(f, s);
    assert.equal((await act('seat1', { op: 'submit', itemId: it.id, ...solve(it) })).body.ok, true);
    // 模擬一整場的大量紀錄（每一場最多 CROSS_LOG_CAP 筆）
    const run = f.data.sessions[s.id].session.cross;
    const play = f.data.sessions[s.id].crossPlay[run.id];
    const one = play.log[0];
    play.log = Array.from({ length: lib.CROSS_LOG_CAP }, (_, i) => ({ ...one, id: `${one.id}-${i}`, n: i + 1 }));
    assert.equal((await ctl({ action: 'cross-reset' })).status, 200);
  }
  const st = f.data.sessions[s.id];
  assert.equal(st.crossRuns.length, 6);
  const plays = st.crossRuns.map((r) => st.crossPlay[r.id]);
  assert.deepEqual(plays.map((p) => !!p.archived), [true, true, true, false, false, false]);
  for (const p of plays.slice(0, 3)) {
    assert.equal(p.log, undefined);
    assert.equal(p.dropped, lib.CROSS_LOG_CAP);
    assert.deepEqual(p.seats['1'].past, []);
    assert.equal(p.seats['1'].correct, 1, 'totals kept');
  }
  assert.equal(plays[3].log.length, lib.CROSS_LOG_CAP);
  // CSV／JSON：封存的場次是每人總計
  const csv = lib.crossCsvRows(st);
  assert(csv.some((r) => /已封存/.test(String(r[8]))));
  assert(csv.some((r) => r[1] === 1 && r[4] === '（總計）' && r[5] === '1/1'));
  const json = lib.crossExport(st);
  assert.equal(json[st.crossRuns[0].id].archived, true);
  assert.equal(json[st.crossRuns[0].id].totals['1'].correct, 1);
  // 很多場之後：場次紀錄有上限，整體大小有上限（不隨場數成長）
  const runs = Array.from({ length: 60 }, (_, i) => ({ ...st.crossRuns[0], id: `extra-${i}` }));
  const store = { crossRuns: [...runs, ...structuredClone(st.crossRuns)], crossPlay: { ...Object.fromEntries(runs.map((r) => [r.id, structuredClone(plays[3])])), ...structuredClone(st.crossPlay) } };
  lib.crossPrune(store);
  assert.equal(store.crossRuns.length, lib.CROSS_MAX_RUNS);
  assert.equal(Object.keys(store.crossPlay).length, lib.CROSS_MAX_RUNS);
  assert.equal(Object.values(store.crossPlay).filter((p) => !p.archived).length, lib.CROSS_KEEP_ROUNDS);
  const bytes = JSON.stringify(store).length;
  assert(bytes < 2 * 1024 * 1024, `bounded (${bytes} bytes)`);
  // 結算仍存得進去
  st.session.cross.deadline = Date.now() - 1;
  assert.equal(settleCrossSession(f.data, s.id).changed, true);
});

test('NIT: the teacher reveal accepts seat 100 in a 100-seat class (same range as login)', async () => {
  const f = fixture();
  assert.equal((await f.call('/api/login', 'POST', TEACHER)).status, 200);
  const dash = (await f.call('/api/dashboard')).body;
  const created = await f.call('/api/classes', 'POST', { name: '測試班', seats: 100 });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const cl = created.body.classroom;
  await f.call(`/api/classes/${cl.id}`, 'PATCH', { requireCode: false });
  const s = (await f.call('/api/sessions', 'POST', { lessonId: dash.lessons[0].id, classId: cl.id })).body.session;
  assert.equal((await f.call('/api/login', 'POST', { role: 'student', classCode: cl.code, seat: 100 }, 'seat100')).status, 200);
  await f.call('/api/student/session', 'GET', null, 'seat100');
  await f.call(`/api/sessions/${s.id}/control`, 'POST', { action: 'cross-start', level: 1 });
  const runId = (await f.call(`/api/sessions/${s.id}`)).body.session.cross.id;
  crossThrottleReset();
  const it = (await f.call(`/api/sessions/${s.id}/cross`, 'POST', { runId, op: 'next' }, 'seat100')).body.item;
  for (const p of Object.values(f.data.sessions[s.id].crossPlay)) for (const x of Object.values(p.seats)) { x.at -= 10_000; x.cur.issuedAt -= 5000; }
  assert.equal((await f.call(`/api/sessions/${s.id}/cross`, 'POST', { runId, op: 'submit', itemId: it.id, ...solve(it) }, 'seat100')).status, 200);
  const rv = await f.call(`/api/sessions/${s.id}/cross`, 'POST', { runId, op: 'reveal', seat: 100, itemId: it.id });
  assert.equal(rv.status, 200, JSON.stringify(rv.body));
  assert.equal(rv.body.seat, 100);
  assert.equal((await f.call(`/api/sessions/${s.id}/cross`, 'POST', { runId, op: 'reveal', seat: 101, itemId: it.id })).status, 400);
});

/* ───── 2026-11-17 Codex 複審（第 5 輪）：alarm 收尾保留已到期的作業喚醒、保存成功一定推送、平均分精確判勝 ───── */
test('R5-NB1: homework submitted after the drain finished keeps its (already past) 50ms wake-up — a later battle deadline does not delay it', async () => {
  const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
  const env = { APP_MODE: 'demo', AI_API_KEY: 'test-only-no-real-key', AI_MODEL: 'test-model', AI_BASE_URL: 'https://provider.example/v1' };
  const original = globalThis.fetch;
  let aiCalls = 0;
  globalThis.fetch = async () => { aiCalls++; return Response.json({ choices: [{ message: { content: '{"items":[]}' } }] }); };
  try {
    const { values, storage, object, request, call, cl, s, ctl } = await doClassroom(env);
    // 未來的對戰期限（60 秒後）
    assert.equal((await ctl({ action: 'cross-start', level: 1, seconds: 60 })).status, 200);
    const created = (await call('/api/homework', 'POST', { classId: cl.id, lessonId: 'g8-2-2a', seats: [1] })).body;
    const hw = created.homework.id, token = new URL(created.sheets[0].url).hash.split('/')[4];
    assert.equal((await object.fetch(request(`/api/hw/${hw}/1/photos?t=${token}`, 'POST', { dataUrl: JPEG }))).status, 200);
    // 交錯：作業佇列已經清空（drain 結束）之後、最後一次結算時，學生送出作業（kickHomework 排 50ms 後）
    const get = storage.get, getAlarm = storage.getAlarm;
    let dueReads = 0, submitted;
    storage.get = async (key) => {
      if (key === 'cross-due' && ++dueReads === 2) submitted = object.fetch(request(`/api/hw/${hw}/1/submit?t=${token}`, 'POST', {})).then((r) => r.json());
      return get(key);
    };
    // 收尾讀排程前已經過了 50ms：那個喚醒已經到期
    storage.getAlarm = async () => { await sleep(80); return getAlarm(); };
    storage.alarmAt = null;
    await object.alarm();
    storage.get = get;
    storage.getAlarm = getAlarm;
    assert(submitted, 'the homework was submitted during the final settle');
    assert.equal((await submitted).sheet.status, 'queued');
    assert.equal(aiCalls, 0, 'not graded by this handler (the drain had already finished)');
    assert(storage.alarmAt !== null && storage.alarmAt <= Date.now(), `homework wake-up kept and due now (got ${storage.alarmAt ? storage.alarmAt - Date.now() : 'null'} ms)`);
    // 被叫醒（alarm 觸發後排程清空，和 Cloudflare 一樣）：作業馬上批改
    storage.alarmAt = null;
    await object.alarm();
    assert.equal(values.get(`hw:${hw}`).sheets['1'].status, 'graded');
    assert.equal(aiCalls, 1);
    // 沒有工作了：排回對戰期限
    assert.equal(storage.alarmAt, (await call(`/api/sessions/${s.id}`)).body.session.cross.deadline);
  } finally {
    globalThis.fetch = original;
  }
});

test('R5-SF1: the settlement save succeeded but cleaning the schedule failed — the official result is still broadcast', async () => {
  let failDue = false;
  const { values, storage, object, call, s, ctl } = await doClassroom({ APP_MODE: 'demo' }, (k) => failDue && k === 'cross-due');
  assert.equal((await ctl({ action: 'cross-start', level: 1, seconds: 1 })).status, 200);
  const run = (await call(`/api/sessions/${s.id}`)).body.session.cross;
  await sleep(Math.max(0, run.deadline - Date.now()) + 50);
  let pushes = 0;
  object.scheduleBroadcast = () => void pushes++;
  failDue = true;
  storage.alarmAt = null;
  await object.alarm();
  failDue = false;
  const persisted = (await call(`/api/sessions/${s.id}/export`)).body.crossRuns.find((r) => r.id === run.id)?.endedAt;
  assert.equal(persisted, run.deadline, 'the settlement was saved');
  assert.equal(values.get('cross-due')[s.id], run.deadline, 'the cleanup failed (schedule still there)');
  assert(pushes >= 1, 'broadcast after the successful save');
  // 重試：場次已結束（沒有變更）→ 只清理排程
  await object.alarm();
  assert(!(s.id in values.get('cross-due')));
});

test('R5-SF2: team winner and margin compare exact averages (no rounding before judging)', () => {
  const run = { id: 'r', team: true, margin: 300, teams: { 1: 'red', 2: 'red', 3: 'red', 4: 'blue', 5: 'blue', 6: 'blue' } };
  const store = (scores) => ({ crossPlay: { r: { secret: 1, seats: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, { score: v }])) } } });
  // 3 對 3：總分 501 vs 502 → 平均 167 vs 167.33（取整都是 167），藍隊勝，不是平手
  const s1 = store({ 1: 501, 2: 0, 3: 0, 4: 502, 5: 0, 6: 0 });
  assert.equal(lib.crossTeams(run, s1).avg.red, lib.crossTeams(run, s1).avg.blue, 'display rounds to the same number');
  assert.equal(lib.crossLeader(run, s1), 'blue');
  assert.equal(lib.crossLeader(run, store({ 1: 502, 4: 501 })), 'red');
  assert.equal(lib.crossLeader(run, store({ 1: 501, 4: 501 })), 'draw');
  // 門檻 300：平均分差 299.67（取整 300）不算；剛好 300 才算
  const near = store({ 1: 899, 4: 0 }); // 299.67 vs 0
  assert.equal(Math.abs(lib.crossTeams(run, near).avg.red - lib.crossTeams(run, near).avg.blue), 300, 'display rounds up to 300');
  assert.equal(lib.crossMarginWinner(run, near), null);
  assert.equal(lib.crossMarginWinner(run, store({ 1: 900, 4: 0 })), 'red');
  assert.equal(lib.crossMarginWinner(run, store({ 4: 900, 1: 0 })), 'blue');
  // 人數不同：2 紅 vs 3 藍，平均 150 vs 50.33 → 差 99.67 < 100
  const uneven = { ...run, margin: 100, teams: { 1: 'red', 2: 'red', 4: 'blue', 5: 'blue', 6: 'blue' } };
  assert.equal(lib.crossMarginWinner(uneven, store({ 1: 300, 4: 151 })), null);
  assert.equal(lib.crossMarginWinner(uneven, store({ 1: 301, 4: 151 })), 'red');
});
