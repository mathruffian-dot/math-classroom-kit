import { test, expect, request, type APIRequestContext } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:8787';
const contexts: APIRequestContext[] = [];
const classCache = new Map<number, { classroom: any; credentials: any[] }>();
const created = { lessons: [] as string[], sessions: [] as string[], classes: [] as string[] };
const unique = () => `qa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function client() {
  const c = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  contexts.push(c);
  return c;
}

async function teacher() {
  const c = await client();
  const r = await c.post('/api/login', { data: { role: 'teacher', account: 'teacher', password: '11235813' } });
  expect(r.ok(), await r.text()).toBeTruthy();
  expect((await r.json()).user.role).toBe('teacher');
  return c;
}

async function fixture(seats = 3, separateClass = false) {
  const t = await teacher();
  const id = unique();
  const lesson = {
    schemaVersion: 1, id, title: `測試課程 ${id}`, description: '僅限自動化測試的虛構教材。', subject: '數學', duration: 15,
    objectives: ['閱讀情境並提出選擇'],
    slides: [
      { id: 'intro', title: '虛構情境', body: '小安在運動後休息。', notes: 'QA_TEACHER_ONLY_NOTE',
        activity: { id: 'poll', type: 'single', prompt: '哪一個是本示範的選項？', options: ['選項甲', '選項乙', '選項丙'], correct: [1], explanation: 'QA_PRIVATE_EXPLANATION' } },
      { id: 'reflect', title: '想法', body: '請分享虛構角色的想法。', activity: { id: 'short', type: 'short', prompt: '你會怎麼做？' } },
    ],
  };
  const saved = await t.put(`/api/lessons/${id}`, { data: { lesson } });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  created.lessons.push(id);
  let group = separateClass ? undefined : classCache.get(seats);
  if (!group) {
    const cr = await t.post('/api/classes', { data: { name: `測試班 ${id}`, seats } });
    expect(cr.ok(), await cr.text()).toBeTruthy();
    group = await cr.json();
    created.classes.push(group!.classroom.id);
    if (!separateClass) classCache.set(seats, group!);
  }
  const { classroom, credentials } = group!;
  const students = await Promise.all(Array.from({ length: seats }, (_, i) => i + 1).map(async seat => {
    const c = await client();
    const result = await c.post('/api/login', { data: { role: 'student', classCode: classroom.code, seat, code: credentials.find((v: any) => v.seat === seat).code } });
    expect(result.ok(), await result.text()).toBeTruthy();
    return c;
  }));
  const sr = await t.post('/api/sessions', { data: { lessonId: id, classId: classroom.id } });
  expect(sr.ok(), await sr.text()).toBeTruthy();
  const { session } = await sr.json();
  created.sessions.push(session.id);
  return { t, students, lesson, classroom, credentials, sid: session.id };
}

test.afterEach(async () => { await Promise.all(contexts.splice(0).map(c => c.dispose())); });
test.afterAll(async () => {
  if (Object.values(created).every(values => !values.length)) return;
  const t = await teacher();
  for (const [type, ids] of Object.entries(created)) {
    if (type === 'classes') continue;
    for (const id of ids) await t.delete(`/api/${type}/${id}`, { data: {} });
  }
  for (const id of created.classes) await t.delete(`/api/classes/${id}`, { data: {} });
  await Promise.all(contexts.splice(0).map(c => c.dispose()));
});

test('demo is explicit; unauthenticated, invalid and cross-origin requests cannot access data', async () => {
  const c = await client();
  const config = await (await c.get('/api/config')).json();
  expect(config.mode).toBe('demo');
  expect(config.aiConfigured).toBe(false);
  expect((await c.get('/api/dashboard')).status()).toBe(401);
  expect((await c.post('/api/login', { data: { role: 'student', classCode: 'DEMO801', seat: 1, code: 'wrong' } })).ok()).toBe(false);
  const hostile = await c.post('/api/login', { headers: { Origin: 'https://untrusted.invalid' }, data: { role: 'teacher' } });
  expect(hostile.ok()).toBe(false);
  const t = await teacher();
  const cookie = (await t.storageState()).cookies.find(c => c.httpOnly);
  expect(cookie).toBeTruthy();
  expect(cookie?.sameSite).not.toBe('None');
  await t.post('/api/logout', { data: {} });
  expect((await t.get('/api/dashboard')).status()).toBe(401);
});

test('student answers are private, idempotent, closed when required, and snapshot is immutable', async () => {
  const { t, students: [s1, s2], sid, lesson } = await fixture();
  const hidden = await (await s1.get(`/api/sessions/${sid}`)).json();
  expect(JSON.stringify(hidden)).not.toContain('QA_TEACHER_ONLY_NOTE');
  expect(JSON.stringify(hidden)).not.toContain('QA_PRIVATE_EXPLANATION');
  expect(hidden.lesson.slides[0].activity.correct).toBeUndefined();
  const payload = { submissionId: unique(), activityId: 'poll', value: 1 };
  expect((await s1.post(`/api/sessions/${sid}/answers`, { data: payload })).ok()).toBe(false);
  expect((await t.post(`/api/sessions/${sid}/control`, { data: { action: 'activity', value: true } })).ok()).toBe(true);
  const first = await s1.post(`/api/sessions/${sid}/answers`, { data: payload });
  expect(first.ok(), await first.text()).toBeTruthy();
  const repeated = await s1.post(`/api/sessions/${sid}/answers`, { data: payload });
  expect(repeated.ok(), await repeated.text()).toBeTruthy();
  expect((await first.json()).answer.id).toBe((await repeated.json()).answer.id);
  expect((await s1.post(`/api/sessions/${sid}/answers`, { data: { ...payload, submissionId: unique(), value: 99 } })).ok()).toBe(false);
  const s2View = await (await s2.get(`/api/sessions/${sid}`)).json();
  expect(s2View.answers).toHaveLength(0);
  expect((await (await t.get(`/api/sessions/${sid}`)).json()).answers).toHaveLength(1);
  await t.post(`/api/sessions/${sid}/control`, { data: { action: 'results', value: true } });
  const revealed = await (await s2.get(`/api/sessions/${sid}`)).json();
  expect(revealed.aggregate.submitted).toBe(1);
  expect(revealed.answers).toHaveLength(0);
  expect(JSON.stringify(revealed)).not.toContain('QA_TEACHER_ONLY_NOTE');
  await t.put(`/api/lessons/${lesson.id}`, { data: { lesson: { ...lesson, title: '改過的教材' } } });
  expect((await (await s1.get(`/api/sessions/${sid}`)).json()).lesson.title).toBe(lesson.title);
  await t.post(`/api/sessions/${sid}/control`, { data: { action: 'end' } });
  expect((await s2.post(`/api/sessions/${sid}/answers`, { data: { ...payload, submissionId: unique() } })).ok()).toBe(false);
});

test('class isolation and teacher-only writes remain enforced', async () => {
  const f = await fixture();
  const outsider = await fixture(3, true);
  expect((await outsider.students[0].get(`/api/sessions/${f.sid}`)).ok()).toBe(false);
  const student = f.students[0];
  for (const path of ['/api/dashboard', '/api/backup', `/api/sessions/${f.sid}/export?format=json`]) {
    expect((await student.get(path)).ok(), path).toBe(false);
  }
  expect((await student.put(`/api/lessons/${f.lesson.id}`, { data: { lesson: f.lesson } })).ok()).toBe(false);
  expect((await student.post(`/api/sessions/${f.sid}/control`, { data: { action: 'slide', index: 1 } })).ok()).toBe(false);
  expect((await student.post('/api/ai', { data: { task: 'lesson-review', lessonId: f.lesson.id } })).ok()).toBe(false);
  expect((await student.delete(`/api/sessions/${f.sid}`)).ok()).toBe(false);
});

test('whiteboard survives reload, draw avoids repeats, and concurrent buzz has one winner', async () => {
  const { t, students, sid } = await fixture();
  const strokes = [{ id: 'stroke-1', color: '#ff3366', width: 4, points: [{ x: .1, y: .2 }, { x: .5, y: .6 }] }];
  const write = await t.put(`/api/sessions/${sid}/whiteboard`, { data: { slideId: 'intro', strokes } });
  expect(write.ok(), await write.text()).toBeTruthy();
  expect((await (await students[0].get(`/api/sessions/${sid}`)).json()).whiteboard.intro).toEqual(strokes);
  const seats: number[] = [];
  for (let i = 0; i < 3; i++) {
    const draw = await t.post(`/api/sessions/${sid}/control`, { data: { action: 'draw' } });
    expect(draw.ok(), await draw.text()).toBeTruthy();
    seats.push((await draw.json()).session.drawnSeat);
  }
  expect(new Set(seats).size).toBe(3);
  expect(seats.every(v => v >= 1 && v <= 3)).toBe(true);
  await t.post(`/api/sessions/${sid}/control`, { data: { action: 'buzz-open' } });
  const answers = await Promise.all(students.map(c => c.post(`/api/sessions/${sid}/buzz`, { data: { submissionId: unique() } })));
  expect(answers.every(r => r.ok())).toBe(true);
  const winners = await Promise.all(answers.map(async r => (await r.json()).winner.seat));
  expect(new Set(winners).size).toBe(1);
  expect((await (await t.get(`/api/sessions/${sid}`)).json()).session.buzzWinner.seat).toBe(winners[0]);
  await t.post(`/api/sessions/${sid}/control`, { data: { action: 'buzz-reset' } });
  expect((await (await t.get(`/api/sessions/${sid}`)).json()).session.buzzWinner).toBeNull();
});

test('lesson save/read, valid backup restore, export, and mock AI are usable without cloud secrets', async () => {
  const { t, sid, lesson } = await fixture();
  const dashboard = await (await t.get('/api/dashboard')).json();
  expect(dashboard.lessons.find((v: any) => v.id === lesson.id).title).toBe(lesson.title);
  const ai = await t.post('/api/ai', { data: { task: 'lesson-review', lessonId: lesson.id } });
  expect(ai.ok(), await ai.text()).toBeTruthy();
  const analysis = await ai.json();
  expect(analysis.mode).toBe('mock');
  expect(analysis.text.length).toBeGreaterThan(20);
  const backupResponse = await t.get('/api/backup');
  expect(backupResponse.ok()).toBe(true);
  const backup = await backupResponse.json();
  const backupText = JSON.stringify(backup);
  expect(backupText).not.toMatch(/"(?:password|passwordHash|codeHash|apiKey|serviceRoleKey|accessToken|refreshToken|credentials)"\s*:/i);
  const restored = await t.post('/api/restore', { data: { backup } });
  expect(restored.ok(), await restored.text()).toBeTruthy();
  for (const format of ['json', 'csv']) {
    const exported = await t.get(`/api/sessions/${sid}/export?format=${format}`);
    expect(exported.ok(), await exported.text()).toBeTruthy();
    expect(await exported.text()).not.toMatch(/passwordHash|serviceRoleKey/);
  }
  const invalid = await t.put(`/api/lessons/${lesson.id}`, { data: { lesson: { ...lesson, slides: [] } } });
  expect(invalid.ok()).toBe(false);
});

test('40 local demo students can submit simultaneously with exact result count', async () => {
  const { t, students, sid } = await fixture(40);
  await t.post(`/api/sessions/${sid}/control`, { data: { action: 'activity', value: true } });
  const responses = await Promise.all(students.map((c, index) => c.post(`/api/sessions/${sid}/answers`, { data: {
    submissionId: unique(), activityId: 'poll', value: index % 3,
  } })));
  for (const response of responses) expect(response.ok(), await response.text()).toBeTruthy();
  const view = await (await t.get(`/api/sessions/${sid}`)).json();
  expect(view.answers).toHaveLength(40);
  expect(new Set(view.answers.map((a: any) => a.seat)).size).toBe(40);
  expect(view.aggregate.submitted).toBe(40);
  expect(view.aggregate.total).toBe(40);
});
