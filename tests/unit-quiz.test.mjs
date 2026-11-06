// 單元總測驗（魔王戰前一頁）：整個單元各堂的課後檢核題庫抽 12 題，玩法同課後檢核・PK 戰。
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = await mkdtemp(join(tmpdir(), 'mck-unit-quiz-test-'));
await build({ entryPoints: [resolve('worker/app.ts'), resolve('worker/quiz.ts'), resolve('worker/homework.ts')], outdir: dir, bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' }, logLevel: 'silent' });
const { handleApi, liveTicket, liveView } = await import(pathToFileURL(join(dir, 'app.mjs')).href);
const { drawUnit, drawUnitSlots, UNIT_QUIZ_SIZE } = await import(pathToFileURL(join(dir, 'quiz.mjs')).href);
const { sessionRecords } = await import(pathToFileURL(join(dir, 'homework.mjs')).href);
test.after(() => rm(dir, { recursive: true, force: true }));

const TEACHER = { role: 'teacher', account: 'teacher', password: '11235813' };
const catalog = JSON.parse(readFileSync('content/catalog.generated.json', 'utf8')).lessons;
const quizOf = (id) => JSON.parse(readFileSync(`content/quizzes/${id}.json`, 'utf8'));
const UNITS = {
  'g8-2-2d': ['g8-2-2a', 'g8-2-2b', 'g8-2-2c', 'g8-2-2d'],
  'g8-2-3c': ['g8-2-3a', 'g8-2-3b', 'g8-2-3c'],
  'g9-1-4c': ['g9-1-4a', 'g9-1-4b', 'g9-1-4c'],
  'g9-2-1c': ['g9-2-1a', 'g9-2-1b', 'g9-2-1c'],
};

function fixture() {
  let data;
  const vaultMap = new Map();
  const vault = { async get(k) { const v = vaultMap.get(k); return v === undefined ? undefined : structuredClone(v); }, async put(k, v) { vaultMap.set(k, structuredClone(v)); }, async delete(k) { return vaultMap.delete(k); } };
  const store = { async read() { return data && structuredClone(data); }, async write(next) { data = structuredClone(next); } };
  const cookies = new Map();
  return {
    get data() { return data; },
    cookie(user) { return cookies.get(user); },
    async call(path, method = 'GET', body, user = 'teacher') {
      const headers = { Origin: 'http://localhost' };
      if (cookies.has(user)) headers.Cookie = cookies.get(user);
      if (method !== 'GET') headers['Content-Type'] = 'application/json';
      const response = await handleApi(new Request(`http://localhost${path}`, { method, headers, body: method !== 'GET' ? JSON.stringify(body ?? {}) : undefined }), { store, env: { APP_MODE: 'demo' }, vault });
      if (response.headers.has('Set-Cookie')) cookies.set(user, response.headers.get('Set-Cookie').split(';')[0]);
      const type = response.headers.get('Content-Type') || '';
      return { status: response.status, body: type.includes('json') ? await response.json() : await response.arrayBuffer() };
    },
  };
}
async function goOnline(f, seats) {
  for (const seat of seats) {
    const u = `seat${seat}`;
    await f.call('/api/login', 'POST', { role: 'student', classCode: 'DEMO801', seat }, u);
    await f.call('/api/student/session', 'GET', null, u);
  }
}

test('pages: every lesson with a raid gets the unit quiz page right before the raid, after its own quiz page; others do not', () => {
  for (const lesson of catalog) {
    const i = lesson.slides.findIndex((s) => s.unitQuizPage);
    if (!UNITS[lesson.id]) {
      assert.equal(i, -1, `${lesson.id} has no raid, so no unit quiz page`);
      assert.equal(lesson.unitQuiz, undefined);
      continue;
    }
    assert(lesson.slides[i + 1]?.raidPage, `${lesson.id}: unit quiz is right before the raid`);
    assert(lesson.slides[i - 1]?.quizPage, `${lesson.id}: the lesson's own after-class quiz stays before it`);
    assert.equal(lesson.slides.filter((s) => s.unitQuizPage).length, 1);
    assert.deepEqual(lesson.unitQuiz.lessons, UNITS[lesson.id]);
    assert.match(lesson.unitQuiz.title, /單元總測驗/);
    assert.match(lesson.slides[i].body, /12 題/);
    assert(!('slots' in lesson.unitQuiz), 'the lesson only names the source lessons, no questions');
  }
});

test('drawing: 12 slots spread evenly over the lessons, no repeats, in lesson order; short banks are topped up by the others', () => {
  const src = (sizes) => sizes.map((n, k) => ({ lessonId: `L${k}`, bank: { title: `L${k}`, slots: Array.from({ length: n }, (_, q) => ({ id: `q${q + 1}`, topic: `t${q}`, variants: [0, 1, 2].map((v) => ({ stem: `L${k} q${q} v${v}`, options: ['a', 'b', 'c', 'd'], answer: 0 })) })) } }));
  const per = (picked, n) => Array.from({ length: n }, (_, k) => picked.filter((x) => x.lesson === k).length);
  assert.equal(UNIT_QUIZ_SIZE, 12);
  for (let i = 0; i < 50; i++) {
    assert.deepEqual(per(drawUnitSlots(src([10, 10, 10])), 3), [4, 4, 4]);
    assert.deepEqual(per(drawUnitSlots(src([10, 10, 10, 10])), 4), [3, 3, 3, 3]);
    const five = per(drawUnitSlots(src([10, 10, 10, 10, 10])), 5);
    assert.equal(five.reduce((a, b) => a + b), 12);
    assert(five.every((n) => n === 2 || n === 3), 'remainder goes to different lessons');
    assert.deepEqual(per(drawUnitSlots(src([10, 2, 10])), 3), [5, 2, 5], 'a short lesson gives all it has; the others fill up');
    const picked = drawUnitSlots(src([10, 10, 10]));
    assert.equal(new Set(picked.map((x) => `${x.lesson}:${x.slot}`)).size, 12, 'no slot twice');
    assert.deepEqual(picked, [...picked].sort((a, b) => a.lesson - b.lesson || a.slot - b.slot), 'lesson order, then question order');
  }
  assert.equal(drawUnitSlots(src([3, 4])).length, 7, 'fewer than 12 slots in the whole unit: all of them, nothing repeated');
  const seen = new Set();
  for (let i = 0; i < 30; i++) seen.add(drawUnitSlots(src([10, 10, 10])).map((x) => `${x.lesson}:${x.slot}`).join());
  assert(seen.size > 20, 'each draw is different');
  // 存進這一次的題庫：只留抽到的那一題（卷子 variant 都是 0），選項順序打亂
  const { bank, paper } = drawUnit('2-3 單元總測驗', src([10, 10, 10]));
  assert.equal(bank.slots.length, 12);
  assert.equal(bank.title, '2-3 單元總測驗（12 題）');
  assert(bank.slots.every((s) => s.variants.length === 1 && /^L\d__q\d+$/.test(s.id)));
  assert(paper.picks.every((p) => p.variant === 0 && [...p.order].sort().join() === '0,1,2,3'));
});

test('real units: 12 questions from every lesson of the unit, each a real question from that lesson’s bank', () => {
  for (const [host, ids] of Object.entries(UNITS)) {
    const sources = ids.map((id) => ({ lessonId: id, bank: quizOf(id) }));
    assert(sources.reduce((n, s) => n + s.bank.slots.length, 0) >= 30, `${host}: at least 30 slots in the unit`);
    const { bank } = drawUnit('x', sources);
    assert.equal(bank.slots.length, 12);
    const from = bank.slots.map((s) => s.id.split('__')[0]);
    assert.deepEqual([...new Set(from)], ids, `${host}: every lesson appears, in order`);
    for (const s of bank.slots) {
      const [lessonId, slotId] = s.id.split('__');
      const orig = quizOf(lessonId).slots.find((x) => x.id === slotId);
      assert(orig.variants.some((v) => JSON.stringify(v) === JSON.stringify(s.variants[0])), `${s.id} is a real variant`);
      assert.equal(s.topic, orig.topic);
    }
  }
});

test('class and PK unit quizzes run like the after-class quiz; banks and answers stay on the server until revealed', async () => {
  const f = fixture();
  assert.equal((await f.call('/api/login', 'POST', TEACHER)).status, 200);
  const sid = (await f.call('/api/sessions', 'POST', { lessonId: 'g8-2-3c', classId: 'demo-class' })).body.session.id;
  await goOnline(f, [1, 2, 3]);
  const ctl = (body) => f.call(`/api/sessions/${sid}/control`, 'POST', body);
  const look = (who = 'teacher') => f.call(`/api/sessions/${sid}`, 'GET', null, who).then((r) => r.body);
  const answer = (who, body) => f.call(`/api/sessions/${sid}/quiz`, 'POST', body, who);
  const unitIndex = (await look()).lesson.slides.findIndex((s) => s.unitQuizPage);
  assert((await ctl({ action: 'slide', index: unitIndex })).status, 200);
  const pool = UNITS['g8-2-3c'].flatMap((id) => quizOf(id).slots.flatMap((s) => s.variants));
  const SERVER_ONLY = new Set(['bank', 'paper', 'personal', 'picks', 'order', 'variants', 'slots', 'detail']);
  const RUN_KEYS = new Set(['id', 'mode', 'from', 'unit', 'startedAt', 'seconds', 'endedAt', 'matches']);
  const keysOf = (x, out = []) => { if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { out.push(k); keysOf(v, out); } return out; };
  // 學生的三條路徑（課堂 GET、學生 GET、WebSocket）：沒有題庫、卷子；只有這一份卷子的題目；解析只在公布後
  const clean = async (who, revealed) => {
    const ticket = await liveTicket(new Request('http://localhost/api/live', { headers: { Cookie: f.cookie(who), Origin: 'http://localhost' } }), f.data);
    const list = [await look(who), (await f.call('/api/student/session', 'GET', null, who)).body, JSON.parse(JSON.stringify(liveView(f.data, ticket)))];
    for (const v of list) {
      assert.equal(v.lesson.quiz, undefined);
      const { slides: _s, unitQuiz: _u, ...rest } = v.lesson;
      assert.deepEqual(keysOf({ ...v, lesson: rest }).filter((k) => SERVER_ONLY.has(k)), [], 'server-only fields in a student payload');
      for (const run of [v.session.quiz, v.quiz.run]) for (const k of Object.keys(run)) assert(RUN_KEYS.has(k), `unexpected run field ${k}`);
      assert.equal(v.quiz.run.unit, true);
      assert.equal(v.quiz.questions.length, 12);
      const text = JSON.stringify(v);
      const stems = pool.filter((it) => text.includes(JSON.stringify(it.stem).slice(1, -1)));
      assert(stems.length >= 12 && stems.length <= 14, 'only the stems on this paper (a few stems repeat across variants)');
      const shownExpl = pool.filter((it) => it.explanation && text.includes(JSON.stringify(it.explanation).slice(1, -1))).length;
      if (!revealed) assert.equal(shownExpl, 0, 'no explanations before reveal');
      assert.equal(v.quiz.questions.filter((q) => q.answer !== undefined).length, revealed);
    }
    return list[0];
  };
  // 全班：12 題，來源跨三堂；題庫只在伺服器
  assert.equal((await ctl({ action: 'quiz-class', unit: true, seconds: 600 })).status, 200);
  const stored = f.data.sessions[sid].session.quiz;
  assert.equal(stored.mode, 'class');
  assert.equal(stored.unit, true);
  assert.equal(stored.bank.slots.length, 12);
  assert.deepEqual([...new Set(stored.bank.slots.map((s) => s.id.split('__')[0]))], UNITS['g8-2-3c']);
  const t = await look();
  assert.equal(t.session.quiz.bank, undefined);
  assert.equal(t.quiz.run.bank, undefined);
  assert.equal(t.quiz.questions.length, 12);
  assert(t.quiz.questions.every((q) => q.answer !== undefined), 'the teacher sees the answers');
  assert.match(t.quiz.title, /2-3 單元總測驗（12 題）/);
  await clean('seat1', 0);
  for (let q = 0; q < 12; q++) assert.equal((await answer('seat1', { runId: t.quiz.run.id, q, choice: q === 11 ? (t.quiz.questions[q].answer + 1) % 4 : t.quiz.questions[q].answer })).status, 200);
  assert.equal((await answer('seat1', { runId: t.quiz.run.id, q: 12, choice: 0 })).status, 400, 'only 12 questions');
  await clean('seat1', 0);
  assert.equal((await look()).quiz.scores['1'].correct, 11);
  assert.equal((await ctl({ action: 'quiz-end' })).status, 200);
  const ended = await clean('seat1', 12);
  assert.equal(ended.quiz.mine.correct.filter(Boolean).length, 11);
  assert.equal(ended.quiz.prev, undefined, 'not compared with a single-lesson quiz');
  // 單元總測驗不進單堂的錯題紀錄／班級測驗成績（題位對不上）
  assert.equal((await look()).quizRecord.wrong['1'], undefined);
  assert.equal(f.data.classes['demo-class'].quizHistory?.['1'], undefined);
  // 學習紀錄：對回原本那一堂的題型
  const recs = sessionRecords(f.data.sessions[sid]).filter((r) => r.seat === 1);
  assert.equal(recs.length, 12);
  assert.deepEqual([...new Set(recs.map((r) => r.lessonId))], UNITS['g8-2-3c']);
  assert(recs.every((r) => r.slot === `${r.item.split('__')[0]}:${r.item.split('__')[1]}`));
  // 原題位 ID 本身含「__」也只在第一個「__」切開
  const odd = structuredClone(f.data.sessions[sid]);
  const oddRun = odd.quizRuns.find((x) => x.unit);
  oddRun.bank.slots[0].id = 'g8-2-3a__q1__x';
  assert(sessionRecords(odd).some((r) => r.item === 'g8-2-3a__q1__x' && r.slot !== 'g8-2-3a:q1'));
  // PK：配對、開戰都用單元題庫；答過的題才看得到答案
  assert.equal((await ctl({ action: 'pk-lobby', unit: true })).status, 200);
  assert.equal((await look('seat2')).session.pkLobby.unit, true);
  await ctl({ action: 'pk-pick', seat: 1 });
  await ctl({ action: 'pk-pick', seat: 2 });
  await ctl({ action: 'pk-start', seconds: 120 });
  const pk = f.data.sessions[sid].session.quiz;
  assert.equal(pk.mode, 'pk');
  assert.equal(pk.unit, true);
  assert.equal(pk.bank.slots.length, 12);
  pk.startedAt -= 4000;
  const pv = await clean('seat1', 0);
  const key = (await look()).quiz.questions[0].answer;
  const r = await answer('seat1', { runId: pv.quiz.run.id, q: 0, choice: key });
  assert.equal(r.body.correct, true);
  assert.equal(r.body.answer, key);
  await clean('seat1', 1);
  await clean('seat2', 0);
  await clean('seat3', 0);
  // 同組再戰：重新從整個單元抽
  await ctl({ action: 'quiz-end' });
  await ctl({ action: 'pk-again', seconds: 120 });
  const again = f.data.sessions[sid].session.quiz;
  assert.equal(again.unit, true);
  assert.equal(again.bank.slots.length, 12);
  assert.notEqual(again.id, pk.id);
  // 電腦對手也能用 12 題的卷子
  await ctl({ action: 'quiz-close' });
  await ctl({ action: 'pk-lobby', unit: true });
  for (const body of [{ action: 'pk-pick', seat: 3 }, { action: 'pk-bot' }, { action: 'pk-start', seconds: 120 }]) { const res = await ctl(body); assert.equal(res.status, 200, body.action + JSON.stringify(res.body)); }
  const bot = f.data.sessions[sid].quizSheets[f.data.sessions[sid].session.quiz.id]['0'];
  assert.equal(bot.answers.length, 12);
  // 單堂的課後檢核照舊：10 題、沒有 unit
  await ctl({ action: 'quiz-class', seconds: 600 });
  const lessonRun = f.data.sessions[sid].session.quiz;
  assert.equal(lessonRun.unit, undefined);
  assert.equal(lessonRun.bank, undefined);
  assert.equal((await look()).quiz.questions.length, 10);
  await ctl({ action: 'pk-lobby' });
  assert.equal(f.data.sessions[sid].session.pkLobby.unit, undefined);
  await ctl({ action: 'quiz-close' });
  // CSV 標出單元總測驗；備份還原後 unit 留著
  const csv = new TextDecoder().decode((await f.call(`/api/sessions/${sid}/export?format=csv`)).body);
  assert(csv.includes('單元總測驗'));
  assert(csv.includes('單元總測驗PK戰'));
  assert(csv.includes('g8-2-3a__'));
  const backup = (await f.call('/api/backup')).body;
  assert.equal((await f.call('/api/restore', 'POST', { backup })).status, 200);
  const units = f.data.sessions[sid].quizRuns.filter((x) => x.unit);
  assert.equal(units.length, 4);
  assert(units.every((x) => x.bank.slots.length === 12));
});

test('a lesson without a raid cannot start a unit quiz; the unit list must include the lesson itself', async () => {
  const f = fixture();
  await f.call('/api/login', 'POST', TEACHER);
  const sid = (await f.call('/api/sessions', 'POST', { lessonId: 'g8-2-3a', classId: 'demo-class' })).body.session.id;
  assert.equal((await f.call(`/api/sessions/${sid}/control`, 'POST', { action: 'quiz-class', unit: true })).status, 409);
  assert.equal((await f.call(`/api/sessions/${sid}/control`, 'POST', { action: 'pk-lobby', unit: true })).status, 409);
  const base = catalog.find((l) => l.id === 'g8-2-3c');
  const bad = await f.call('/api/lessons/unit-bad', 'PUT', { lesson: { ...base, id: 'unit-bad', unitQuiz: { title: 'x', lessons: ['g8-2-3a'] } } });
  assert.equal(bad.status, 400);
  // 少了任何一堂（不存在、沒有題庫、或是別位老師的課）就不開，不會只用剩下的幾堂出題
  const missing = await f.call('/api/lessons/unit-miss', 'PUT', { lesson: { ...base, id: 'unit-miss', unitQuiz: { title: '缺一堂', lessons: ['g8-2-3a', 'no-such-lesson', 'unit-miss'] } } });
  assert.equal(missing.status, 200);
  const ms = (await f.call('/api/sessions', 'POST', { lessonId: 'unit-miss', classId: 'demo-class' })).body.session.id;
  assert.equal((await f.call(`/api/sessions/${ms}/control`, 'POST', { action: 'quiz-class', unit: true })).status, 409);
  f.data.lessons['g8-2-3a'].ownerId = 'someone-else';
  const fs = (await f.call('/api/sessions', 'POST', { lessonId: 'g8-2-3c', classId: 'demo-class' })).body.session.id;
  assert.equal((await f.call(`/api/sessions/${fs}/control`, 'POST', { action: 'pk-lobby', unit: true })).status, 409, "another teacher's lesson is never used");
  // 名稱上限 90 字：加上「（12 題）」仍在題庫名稱 100 字內，備份還原得回來
  assert.equal((await f.call('/api/lessons/unit-long', 'PUT', { lesson: { ...base, id: 'unit-long', unitQuiz: { title: '長'.repeat(91), lessons: ['unit-long'] } } })).status, 400);
  const { bank } = drawUnit('長'.repeat(200), [{ lessonId: 'x', bank: quizOf('g8-2-3a') }]);
  assert(bank.title.length <= 100);
});
