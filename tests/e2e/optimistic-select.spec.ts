// 先顯示再同步（2026-11-07 老師授權）：學生點選項，送出前就標成「已選」並鎖住，伺服器回應才給對錯。
// 每個測試都把學生的作答 POST 攔下來（hold），確認：回應前已選看得到、重複點不送第二次、同學作答的推送／
// 魔王戰每 0.25 秒更新不會把已選洗掉；放行後顯示伺服器的正式結果；失敗時拿掉已選、恢復之前確認的選擇、可以再點。
// 已選只代表「我選了這個」：回應前不可以出現對錯、比分、傷害。
import { test, expect, type APIRequestContext, type Page, type Route } from '@playwright/test';
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

/**
 * 攔學生的作答 POST。mode：pass 直接送；hold 先扣住，等測試呼叫 release('ok'｜'fail')。
 * sent 記錄瀏覽器送出（被攔到）的作答次數：重複點不可以多送。
 */
async function gate(page: Page, url: RegExp, isAnswer: (body: Record<string, unknown>) => boolean) {
  const g = { mode: 'pass' as 'pass' | 'hold', sent: 0, held: [] as { route: Route; go: (how: 'ok' | 'fail') => Promise<void> }[] };
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
    if (g.mode === 'pass') return route.continue();
    await new Promise<void>((done) => {
      g.held.push({ route, go: async (how) => (how === 'ok' ? route.continue() : route.abort('failed')).finally(done) });
    });
  });
  const release = async (how: 'ok' | 'fail') => {
    await expect.poll(() => g.held.length, { message: 'a held answer POST' }).toBeGreaterThan(0);
    g.mode = 'pass';
    await g.held.shift()!.go(how);
  };
  return Object.assign(g, { release });
}

test.afterEach(async () => {
  for (const s of sessions.splice(0)) await s.c.delete(`/api/sessions/${s.id}`, { headers, data: {} }).catch(() => undefined);
  for (const c of apis.splice(0)) await c.dispose();
});

test('unit PK: tapped option shows as picked before the server answers, survives score pushes, fails back to retry', async ({ page, playwright }) => {
  test.setTimeout(120_000);
  const { id, control } = await teacherSession(playwright, 'g8-2-3c');
  const mate = await login(playwright, { role: 'student', classCode: 'DEMO801', seat: 28 });
  await studentPage(page, 27);
  const g = await gate(page, /\/api\/sessions\/[^/]+\/quiz$/, (b) => b.choice !== undefined);
  await control('pk-lobby', { unit: true });
  await control('pk-pick', { seat: 27 });
  await control('pk-pick', { seat: 28 });
  await control('pk-start', { seconds: 600 });
  await expect(page.getByTestId('quiz-card')).toContainText('單元總測驗 PK');
  await expect(page.getByTestId('quiz-option-0')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.mini-label')).toContainText('第 1／');
  const progress = page.locator('#pk-progress');
  const before = await progress.textContent();
  const options = page.locator('[data-action="quiz-choose"]');
  // 對手作答：讓伺服器推送新的比分
  const mateAnswers = async () => {
    const v = await (await mate.get(`/api/sessions/${id}`)).json();
    const i = (v.quiz.mine?.answers || v.quiz.questions.map(() => null)).findIndex((x: number | null) => x === null);
    expect((await mate.post(`/api/sessions/${id}/quiz`, { headers, data: { runId: v.quiz.run.id, q: v.quiz.questions[i].slot, choice: 0 } })).status()).toBe(200);
  };

  // 1. 扣住回應：點了就標成已選、整排鎖住，還沒有對錯
  g.mode = 'hold';
  await page.evaluate(() => ((window as unknown as { __stem: Element | null }).__stem = document.querySelector('.quiz-stem')));
  await page.getByTestId('quiz-option-1').click();
  await expect(page.getByTestId('quiz-option-1')).toHaveClass(/chosen/);
  await expect(page.locator('.answer-option.chosen')).toHaveCount(1);
  for (const b of await options.all()) await expect(b).toBeDisabled();
  await expect(page.locator('.quiz-flash')).toHaveCount(0);
  await expect(progress).toHaveText(before!); // 比分不猜
  // 重複點（含點別的選項）都不會多送
  await page.getByTestId('quiz-option-2').dispatchEvent('click');
  await page.getByTestId('quiz-option-1').dispatchEvent('click');
  // 同學作答的推送：只更新比分，已選與鎖定照舊、題幹不重畫
  await mateAnswers();
  await expect(progress).not.toHaveText(before!);
  await expect(page.getByTestId('quiz-option-1')).toHaveClass(/chosen/);
  await expect(page.getByTestId('quiz-option-0')).toBeDisabled();
  expect(await page.evaluate(() => !!(window as unknown as { __stem: Element | null }).__stem?.isConnected), 'stem kept').toBe(true);
  expect(g.sent).toBe(1);
  // 2. 放行：伺服器的正式結果（下一題、上一題對錯）
  await g.release('ok');
  await expect(page.locator('.mini-label')).toContainText('第 2／');
  await expect(page.locator('.quiz-flash')).toContainText(/上一題答(對|錯)/);
  await expect(page.locator('.answer-option.chosen')).toHaveCount(0);
  await expect(page.getByTestId('quiz-option-0')).toBeEnabled();

  // 3. 送出失敗：拿掉已選、解鎖、提示網路，同一題可以再點
  g.mode = 'hold';
  await page.getByTestId('quiz-option-0').click();
  await expect(page.getByTestId('quiz-option-0')).toHaveClass(/chosen/);
  await expect(page.getByTestId('quiz-option-1')).toBeDisabled();
  await g.release('fail');
  await expect(page.locator('#toast')).toContainText('網路連線不穩');
  await expect(page.locator('.answer-option.chosen')).toHaveCount(0);
  await expect(page.getByTestId('quiz-option-0')).toBeEnabled();
  await expect(page.locator('.mini-label')).toContainText('第 2／');
  await page.getByTestId('quiz-option-0').click();
  await expect(page.locator('.mini-label')).toContainText('第 3／');
  expect(g.sent).toBe(3);
});

test('class quiz: a re-pick shows immediately, failure restores the confirmed answer, editing still works', async ({ page, playwright }) => {
  test.setTimeout(90_000);
  const { id, control } = await teacherSession(playwright, 'g8-2-3c');
  const mate = await login(playwright, { role: 'student', classCode: 'DEMO801', seat: 30 });
  await studentPage(page, 29);
  const g = await gate(page, /\/api\/sessions\/[^/]+\/quiz$/, (b) => b.choice !== undefined);
  await control('quiz-class', { seconds: 600 });
  await expect(page.getByTestId('quiz-option-0')).toBeVisible({ timeout: 10_000 });
  // 第 1 題先正常選 A（伺服器確認）
  await page.getByTestId('quiz-option-0').click();
  await expect(page.locator('.quiz-dot').first()).toHaveClass(/done/);
  await expect(page.getByTestId('quiz-option-0')).toHaveClass(/chosen/);
  await expect(page.getByTestId('quiz-option-0')).toBeEnabled();

  // 改選 B，扣住回應：B 立刻已選、A 不再標、整排鎖住
  g.mode = 'hold';
  await page.getByTestId('quiz-option-1').click();
  await expect(page.getByTestId('quiz-option-1')).toHaveClass(/chosen/);
  await expect(page.locator('.answer-option.chosen')).toHaveCount(1);
  await expect(page.getByTestId('quiz-option-2')).toBeDisabled();
  await page.getByTestId('quiz-option-2').dispatchEvent('click');
  // 同學作答（老師端計數變了，推送到學生端）：已選不被洗掉
  const v = await (await mate.get(`/api/sessions/${id}`)).json();
  expect((await mate.post(`/api/sessions/${id}/quiz`, { headers, data: { runId: v.quiz.run.id, q: v.quiz.questions[0].slot, choice: 0 } })).status()).toBe(200);
  await page.waitForTimeout(800);
  await expect(page.getByTestId('quiz-option-1')).toHaveClass(/chosen/);
  await expect(page.getByTestId('quiz-option-1')).toBeDisabled();
  expect(g.sent).toBe(2);
  // 失敗：回到伺服器確認過的 A，可以再改
  await g.release('fail');
  await expect(page.locator('#toast')).toContainText('網路連線不穩');
  await expect(page.getByTestId('quiz-option-0')).toHaveClass(/chosen/);
  await expect(page.locator('.answer-option.chosen')).toHaveCount(1);
  await expect(page.getByTestId('quiz-option-1')).toBeEnabled();
  // 改選 C，放行：正式改成 C（全班測驗可以改答案）
  g.mode = 'hold';
  await page.getByTestId('quiz-option-2').click();
  await expect(page.getByTestId('quiz-option-2')).toHaveClass(/chosen/);
  await g.release('ok');
  await expect(page.getByTestId('quiz-option-2')).toBeEnabled();
  await expect(page.getByTestId('quiz-option-2')).toHaveClass(/chosen/);
  await expect(page.locator('.answer-option.chosen')).toHaveCount(1);
  const mine = (await (await page.request.get(`/api/sessions/${id}`)).json()).quiz.mine;
  expect(mine.answers[0]).toBe(2);
});

type Q = { id: string; options: string[]; answer: number; reason?: { options: string[]; answer: number } };
test('raid: answer and analysis judge+reason show as picked while sending, ticks keep it, failure unlocks retry', async ({ page, playwright }) => {
  test.setTimeout(150_000);
  const bank = JSON.parse(await readFile('content/raids/g8-2-2d.json', 'utf8')) as { pools: Record<string, Q[]> };
  const byId = new Map(Object.values(bank.pools).flat().map((q) => [q.id, q]));
  const { id, control } = await teacherSession(playwright, 'g8-2-2d');
  const mate = await login(playwright, { role: 'student', classCode: 'DEMO801', seat: 26 });
  await page.setViewportSize({ width: 1080, height: 810 });
  await studentPage(page, 25);
  const g = await gate(page, /\/api\/sessions\/[^/]+\/raid$/, (b) => b.op === 'answer');
  await control('raid-start', { difficulty: 'hard', seconds: 600 });
  const runId = (await (await mate.get(`/api/sessions/${id}`)).json()).raid.run.id;
  const post = (data: Record<string, unknown>) => mate.post(`/api/sessions/${id}/raid`, { headers, data: { runId, ...data } });
  await post({ op: 'role', role: 'knight' });
  await page.getByTestId('raid-role-mage').click();
  await page.getByTestId('raid-goal-skip').click();
  await expect(page.getByTestId('raid-kind-attack')).toBeVisible({ timeout: 15_000 });
  // 同學出招：推送新的戰況
  const mateHits = async () => {
    const q = (await (await post({ op: 'draw', kind: 'shield' })).json()).question as Q;
    const it = byId.get(q.id)!;
    expect((await post({ op: 'answer', choice: q.options.indexOf(it.options[it.answer]) })).status()).toBe(200);
  };
  const myQuestion = async () => (await (await page.request.get(`/api/sessions/${id}`)).json()).raid.mine.question as { id: string; options: string[]; reason?: string[] };
  const rightOf = (q: { id: string; options: string[] }) => q.options.indexOf(byId.get(q.id)!.options[byId.get(q.id)!.answer]);

  // 1. 一般題：扣住回應，點的選項已選、整排鎖住，沒有對錯
  await page.getByTestId('raid-kind-attack').click();
  await expect(page.getByTestId('raid-option-0')).toBeVisible();
  let q = await myQuestion();
  const k = rightOf(q);
  g.mode = 'hold';
  await page.getByTestId(`raid-option-${k}`).click();
  await expect(page.getByTestId(`raid-option-${k}`)).toHaveClass(/selected/);
  await expect(page.getByTestId(`raid-option-${k}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-action="raid-answer"].selected')).toHaveCount(1);
  for (const b of await page.locator('[data-action="raid-answer"]').all()) await expect(b).toBeDisabled();
  await expect(page.getByTestId('raid-flash')).toHaveCount(0);
  await page.getByTestId(`raid-option-${(k + 1) % q.options.length}`).dispatchEvent('click');
  // 同學出招的推送＋本機每 0.25 秒的更新：已選照舊
  await mateHits();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId(`raid-option-${k}`)).toHaveClass(/selected/);
  await expect(page.getByTestId(`raid-option-${k}`)).toBeDisabled();
  await expect(page.getByTestId('raid-flash')).toHaveCount(0);
  expect(g.sent).toBe(1);
  await g.release('ok');
  await expect(page.getByTestId('raid-flash')).toContainText('答對');
  await expect(page.getByTestId('raid-kind-attack')).toBeVisible();

  // 2. 送出失敗：拿掉已選、解鎖、提示網路，同一題再點一次
  await page.getByTestId('raid-kind-attack').click();
  await expect(page.getByTestId('raid-option-0')).toBeVisible();
  q = await myQuestion();
  const k2 = rightOf(q);
  g.mode = 'hold';
  await page.getByTestId(`raid-option-${k2}`).click();
  await expect(page.getByTestId(`raid-option-${k2}`)).toHaveClass(/selected/);
  await g.release('fail');
  await expect(page.locator('#toast')).toContainText('網路連線不穩');
  await expect(page.locator('[data-action="raid-answer"].selected')).toHaveCount(0);
  await expect(page.getByTestId(`raid-option-${k2}`)).toBeEnabled();
  await page.waitForTimeout(600); // 失敗後的重新整理
  await page.getByTestId(`raid-option-${k2}`).click();
  await expect(page.getByTestId('raid-flash')).toContainText('答對');

  // 3. 分析題「判斷＋理由」：兩段的選擇（本機、中性）送出中照舊顯示、鎖住；失敗後選擇留著，再送一次
  let aq: { id: string; options: string[]; reason?: string[] } | undefined;
  for (let i = 0; i < 30; i++) {
    await page.locator('#student-answer [data-kind="analysis"]').first().click();
    await expect(page.locator('#student-answer .raid-kind.k-analysis')).toBeVisible();
    aq = await myQuestion();
    if (aq?.reason) break;
    await page.locator('#student-answer .raid-switch [data-kind="attack"]').click();
    await expect(page.locator('#student-answer .raid-kind.k-attack')).toBeVisible();
  }
  expect(aq?.reason, 'drew a judgement + reason question').toBeTruthy();
  const it = byId.get(aq!.id)!;
  const ra = aq!.options.indexOf(it.options[it.answer]);
  const rr = aq!.reason!.indexOf(it.reason!.options[it.reason!.answer]);
  await page.getByTestId(`raid-option-${ra}`).click();
  await page.getByTestId(`raid-reason-${rr}`).click();
  await expect(page.getByTestId(`raid-option-${ra}`)).toHaveClass(/selected/);
  await expect(page.getByTestId(`raid-reason-${rr}`)).toHaveClass(/selected/);
  g.mode = 'hold';
  const sentBefore = g.sent;
  await page.getByTestId('raid-submit').click();
  await expect(page.getByTestId('raid-submit')).toBeDisabled();
  await expect(page.getByTestId('raid-submit')).toContainText('送出中');
  await expect(page.getByTestId(`raid-option-${ra}`)).toBeDisabled();
  await expect(page.getByTestId(`raid-reason-${(rr + 1) % aq!.reason!.length}`)).toBeDisabled();
  await page.getByTestId(`raid-reason-${(rr + 1) % aq!.reason!.length}`).dispatchEvent('click');
  await page.getByTestId('raid-submit').dispatchEvent('click');
  await mateHits();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId(`raid-option-${ra}`)).toHaveClass(/selected/);
  await expect(page.getByTestId(`raid-reason-${rr}`)).toHaveClass(/selected/);
  await expect(page.locator('[data-action="raid-pick"].selected')).toHaveCount(2);
  await expect(page.getByTestId('raid-flash')).toHaveCount(0);
  expect(g.sent - sentBefore).toBe(1);
  await g.release('fail');
  await expect(page.locator('#toast')).toContainText('網路連線不穩');
  await expect(page.getByTestId(`raid-option-${ra}`)).toHaveClass(/selected/);
  await expect(page.getByTestId(`raid-reason-${rr}`)).toHaveClass(/selected/);
  await expect(page.getByTestId('raid-submit')).toBeEnabled();
  await page.waitForTimeout(600);
  await page.getByTestId('raid-submit').click();
  await expect(page.getByTestId('raid-flash')).toContainText('答對');
});
