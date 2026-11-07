// 先顯示再同步：回應晚到（2026-11-07 Codex 複審）。伺服器已經收下作答，只有回應被扣住（route.fetch 後才扣），
// 期間來了更新的正式狀態：另一個分頁改選、換題、老師開新的一場。晚到的回應不可以蓋掉新的狀態、不可以再鎖住；
// 推送先到、帶的是同一個作答時照樣算成功（不出現失敗）。
import { test, expect, type APIRequestContext, type APIResponse, type Page, type Route } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const headers = { Origin: baseURL };
const apis: APIRequestContext[] = [];
const sessions: { c: APIRequestContext; id: string }[] = [];

async function login(playwright: typeof import('@playwright/test'), data: Record<string, unknown>) {
  const c = await playwright.request.newContext({ baseURL });
  apis.push(c);
  expect((await c.post('/api/login', { headers, data })).status()).toBe(200);
  return c;
}
async function teacherSession(playwright: typeof import('@playwright/test'), lessonId: string) {
  const t = await login(playwright, { role: 'teacher', account: 'teacher', password: '11235813' });
  const cl = (await (await t.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  await t.patch(`/api/classes/${cl.id}`, { headers, data: { requireCode: false } });
  const id = (await (await t.post('/api/sessions', { headers, data: { lessonId, classId: cl.id } })).json()).session.id as string;
  sessions.push({ c: t, id });
  const control = async (action: string, data: Record<string, unknown> = {}) =>
    expect((await t.post(`/api/sessions/${id}/control`, { headers, data: { action, ...data } })).status(), action).toBe(200);
  return { t, id, control };
}
async function studentPage(page: Page, seat: number) {
  await page.goto('/#/student');
  await page.getByLabel('座號').fill(String(seat));
  await page.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(page.getByTestId('session-slide')).toBeAttached();
}

/** 攔下一個作答 POST：先真的送到伺服器（伺服器收下、改了狀態），回應扣住，等 release() 才交給頁面。 */
async function lateGate(page: Page, url: RegExp, isAnswer: (body: Record<string, unknown>) => boolean) {
  const g = { arm: false, sent: 0, held: null as null | { route: Route; res: APIResponse; status: number } };
  await page.route(url, async (route) => {
    const req = route.request();
    let body: Record<string, unknown> = {};
    try {
      body = req.postDataJSON() || {};
    } catch {
      /* 不是 JSON */
    }
    if (req.method() !== 'POST' || !isAnswer(body)) return route.continue();
    g.sent++;
    if (!g.arm) return route.continue();
    g.arm = false;
    const res = await route.fetch();
    g.held = { route, res, status: res.status() };
  });
  const processed = async () => {
    await expect.poll(() => g.held?.status, { message: 'server processed the held answer' }).toBe(200);
  };
  const release = async () => {
    await processed();
    const h = g.held!;
    g.held = null;
    await h.route.fulfill({ response: h.res });
  };
  return Object.assign(g, { processed, release });
}

test.afterEach(async () => {
  for (const s of sessions.splice(0)) await s.c.delete(`/api/sessions/${s.id}`, { headers, data: {} }).catch(() => undefined);
  for (const c of apis.splice(0)) await c.dispose();
});

test('class quiz: late response for B does not undo a newer C from another tab; a new run is not locked by the old request', async ({ page, playwright }) => {
  test.setTimeout(120_000);
  const { id, control } = await teacherSession(playwright, 'g8-2-3c');
  await studentPage(page, 23);
  const g = await lateGate(page, /\/api\/sessions\/[^/]+\/quiz$/, (b) => b.choice !== undefined);
  await control('quiz-class', { seconds: 600 });
  await expect(page.getByTestId('quiz-option-0')).toBeVisible({ timeout: 10_000 });
  const state = async () => (await (await page.request.get(`/api/sessions/${id}`)).json()).quiz;

  // 選 B：伺服器收下了，回應晚到
  g.arm = true;
  await page.getByTestId('quiz-option-1').click();
  await g.processed();
  expect((await state()).mine.answers[0]).toBe(1);
  // 另一個分頁（同一位學生）改選 C：較新的正式狀態推送過來
  const run = (await state()).run.id;
  expect((await page.request.post(`/api/sessions/${id}/quiz`, { headers, data: { runId: run, q: (await state()).questions[0].slot, choice: 2 } })).status()).toBe(200);
  await page.waitForTimeout(800);
  // B 的回應晚到：畫面維持 C，不被改回 B，也不再鎖住
  await g.release();
  await expect(page.getByTestId('quiz-option-2')).toHaveClass(/chosen/);
  await expect(page.locator('.answer-option.chosen')).toHaveCount(1);
  await page.waitForTimeout(600);
  await expect(page.getByTestId('quiz-option-2')).toHaveClass(/chosen/);
  await expect(page.getByTestId('quiz-option-1')).toBeEnabled();
  await expect(page.locator('#toast')).not.toContainText('網路連線不穩');
  expect((await state()).mine.answers[0]).toBe(2);

  // 推送先到、帶的就是同一個作答：照樣成功（第 2 題選 A 之前另一個分頁也選 A）
  await page.locator('.quiz-dot').nth(1).click();
  g.arm = true;
  await page.getByTestId('quiz-option-0').click();
  await g.processed();
  expect((await page.request.post(`/api/sessions/${id}/quiz`, { headers, data: { runId: run, q: (await state()).questions[1].slot, choice: 0 } })).status()).toBe(200);
  await page.waitForTimeout(800);
  await g.release();
  await expect(page.getByTestId('quiz-option-0')).toHaveClass(/chosen/);
  await expect(page.getByTestId('quiz-option-0')).toBeEnabled();
  await expect(page.locator('.quiz-dot').nth(1)).toHaveClass(/done/);

  // 新的一場：舊的請求還在路上，新的一場照樣可以作答；舊回應晚到不改新的一場、不鎖住
  g.arm = true;
  await page.getByTestId('quiz-option-3').click();
  await g.processed();
  await control('quiz-class', { seconds: 600 });
  await expect.poll(async () => (await state()).run.id).not.toBe(run);
  await expect(page.locator('.quiz-dot').first()).not.toHaveClass(/done/, { timeout: 10_000 });
  await expect(page.getByTestId('quiz-option-1')).toBeEnabled();
  await page.waitForTimeout(600); // 換場剛重畫：等畫面穩定（SETTLE_MS）再點
  await page.getByTestId('quiz-option-1').click();
  await expect(page.getByTestId('quiz-option-1')).toHaveClass(/chosen/);
  await expect(page.locator('.quiz-dot').first()).toHaveClass(/done/);
  await g.release();
  await page.waitForTimeout(600);
  await expect(page.getByTestId('quiz-option-1')).toHaveClass(/chosen/);
  await expect(page.locator('.answer-option.chosen')).toHaveCount(1);
  await expect(page.getByTestId('quiz-option-0')).toBeEnabled();
  expect((await state()).mine.answers[0]).toBe(1);
});

test('unit PK: push with my own answer arrives before the late response — still counts as success', async ({ page, playwright }) => {
  test.setTimeout(120_000);
  const { id, control } = await teacherSession(playwright, 'g8-2-3c');
  const mate = await login(playwright, { role: 'student', classCode: 'DEMO801', seat: 22 });
  await studentPage(page, 21);
  const g = await lateGate(page, /\/api\/sessions\/[^/]+\/quiz$/, (b) => b.choice !== undefined);
  await control('pk-lobby', { unit: true });
  await control('pk-pick', { seat: 21 });
  await control('pk-pick', { seat: 22 });
  await control('pk-start', { seconds: 600 });
  await expect(page.getByTestId('quiz-option-0')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.mini-label')).toContainText('第 1／');
  g.arm = true;
  await page.getByTestId('quiz-option-1').click();
  await g.processed();
  // 對手作答：推送（revision 比我的回應新）帶來我已經收下的第 1 題
  const v = await (await mate.get(`/api/sessions/${id}`)).json();
  expect((await mate.post(`/api/sessions/${id}/quiz`, { headers, data: { runId: v.quiz.run.id, q: v.quiz.questions[0].slot, choice: 0 } })).status()).toBe(200);
  await expect(page.locator('.mini-label')).toContainText('第 2／');
  await g.release();
  await expect(page.locator('.quiz-flash')).toContainText(/上一題答(對|錯)/);
  await expect(page.locator('#toast')).not.toContainText('網路連線不穩');
  await expect(page.getByTestId('quiz-option-0')).toBeEnabled();
  await page.getByTestId('quiz-option-0').click();
  await expect(page.locator('.mini-label')).toContainText('第 3／');
});

type Q = { id: string; options: string[]; answer: number };
test('raid: late response for question A keeps the newer question B; a new run is not locked by the old request', async ({ page, playwright }) => {
  test.setTimeout(150_000);
  const bank = JSON.parse(await readFile('content/raids/g8-2-2d.json', 'utf8')) as { pools: Record<string, Q[]> };
  const byId = new Map(Object.values(bank.pools).flat().map((q) => [q.id, q]));
  const { id, control } = await teacherSession(playwright, 'g8-2-2d');
  await page.setViewportSize({ width: 1080, height: 810 });
  await studentPage(page, 19);
  const g = await lateGate(page, /\/api\/sessions\/[^/]+\/raid$/, (b) => b.op === 'answer');
  await control('raid-start', { difficulty: 'normal', seconds: 600 });
  const raid = async () => (await (await page.request.get(`/api/sessions/${id}`)).json()).raid;
  await page.getByTestId('raid-role-mage').click();
  await page.getByTestId('raid-goal-skip').click();
  await expect(page.getByTestId('raid-kind-attack')).toBeVisible({ timeout: 15_000 });
  const rightOf = (q: { id: string; options: string[] }) => q.options.indexOf(byId.get(q.id)!.options[byId.get(q.id)!.answer]);

  // 題目 A 答對：伺服器收下了，回應晚到
  await page.getByTestId('raid-kind-attack').click();
  await expect(page.getByTestId('raid-option-0')).toBeVisible();
  const a = (await raid()).mine.question as Q;
  g.arm = true;
  await page.getByTestId(`raid-option-${rightOf(a)}`).click();
  await g.processed();
  // 另一個分頁（同一位學生）抽了題目 B：推送帶來 B
  const run = (await raid()).run.id;
  const b = (await (await page.request.post(`/api/sessions/${id}/raid`, { headers, data: { runId: run, op: 'draw', kind: 'shield' } })).json()).question as Q;
  expect(b.id).not.toBe(a.id);
  await expect(page.locator('#student-answer .raid-kind.k-shield')).toBeVisible({ timeout: 10_000 });
  // A 的回應晚到：B 留著、可以作答
  await g.release();
  await page.waitForTimeout(800);
  await expect(page.locator('#student-answer .raid-kind.k-shield')).toBeVisible();
  await expect(page.getByTestId('raid-option-0')).toBeEnabled();
  await expect(page.locator('[data-action="raid-answer"].selected')).toHaveCount(0);
  expect((await raid()).mine.question.id).toBe(b.id);
  await page.getByTestId(`raid-option-${rightOf(b)}`).click();
  await expect(page.getByTestId('raid-flash')).toContainText('答對');

  // 新的一場：舊的作答還在路上，新的一場照樣可以設目標（送伺服器）、出招；舊回應晚到不改新的一場、不鎖住
  await page.getByTestId('raid-kind-attack').click();
  await expect(page.getByTestId('raid-option-0')).toBeVisible();
  const c = (await raid()).mine.question as Q;
  g.arm = true;
  await page.getByTestId(`raid-option-${rightOf(c)}`).click();
  await g.processed();
  await control('raid-end');
  await control('raid-start', { difficulty: 'normal', seconds: 600 });
  await expect.poll(async () => (await raid()).run.id).not.toBe(run);
  const goal = page.locator('[data-action="raid-goal"]:not([data-testid="raid-goal-skip"])').first();
  await expect(goal).toBeEnabled({ timeout: 15_000 });
  await goal.click();
  await expect.poll(async () => (await raid()).mine?.goal).toBeGreaterThan(0);
  await expect(page.getByTestId('raid-kind-attack')).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId('raid-kind-attack').click();
  await expect(page.getByTestId('raid-option-0')).toBeVisible();
  const d = (await raid()).mine.question as Q;
  await g.release();
  await page.waitForTimeout(800);
  // 舊一場的結果不出現、新題目留著、選項可點
  await expect(page.getByTestId('raid-flash')).toHaveCount(0);
  expect((await raid()).mine.question.id).toBe(d.id);
  await expect(page.getByTestId('raid-option-0')).toBeEnabled();
  await page.getByTestId(`raid-option-${rightOf(d)}`).click();
  await expect(page.getByTestId('raid-flash')).toContainText('答對');
});
