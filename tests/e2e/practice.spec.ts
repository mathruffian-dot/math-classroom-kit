// 作答限時與補救練習：老師＋2 台 iPad。
// 驗證：限時開放 → 時間到鎖住 → 老師加時間 → 原題再派一次給答錯的同學（只重做自己錯的小題）→ 逐題作答，老師端即時看到狀態。
import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const screenshots = resolve('artifacts/screenshots');
const contexts: BrowserContext[] = [];
const cleanup: { context: BrowserContext; id: string }[] = [];

async function surface(browser: Browser, width: number, height: number, touch = false) {
  const context = await browser.newContext({ baseURL, viewport: { width, height }, hasTouch: touch, deviceScaleFactor: 1 });
  contexts.push(context);
  return { context, page: await context.newPage() };
}
async function shot(page: Page, name: string) {
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: resolve(screenshots, `practice-${name}.png`) });
}
async function loginTeacher(page: Page) {
  await page.goto('/');
  await page.getByLabel('帳號').fill('teacher');
  await page.getByLabel('密碼').fill('11235813');
  await page.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(page.getByTestId('lesson-card').first()).toBeVisible();
}
async function loginStudent(page: Page, seat: number) {
  await page.goto('/#/student');
  await page.getByLabel('座號').fill(String(seat));
  await page.getByLabel('識別碼').fill('');
  await page.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(page.getByTestId('session-slide')).toBeVisible();
}
async function answerTab(page: Page) {
  const tab = page.locator('.phone-tabs [data-tab="answer"]');
  if (await tab.isVisible()) await tab.click();
}

test.afterEach(async () => {
  for (const r of cleanup.splice(0)) await r.context.request.delete(`/api/sessions/${r.id}`, { headers: { Origin: baseURL }, data: {} });
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

test('time limit locks answers, teacher extends; wrong items are re-assigned as the original questions', async ({ browser }) => {
  test.setTimeout(150_000);
  const teacher = await surface(browser, 1440, 900);
  await loginTeacher(teacher.page);
  const cl = (await (await teacher.page.request.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  await teacher.page.request.patch(`/api/classes/${cl.id}`, { headers: { Origin: baseURL }, data: { requireCode: false } });
  await teacher.page.getByTestId('lesson-card').filter({ hasText: '根式的乘除' }).getByRole('button', { name: '開始上課' }).click();
  await teacher.page.locator('#start-form select').selectOption('demo-class');
  await teacher.page.locator('#start-form').getByRole('button', { name: '開始上課' }).click();
  await expect(teacher.page.getByTestId('session-slide')).toBeVisible();
  const sessionId = teacher.page.url().split('/session/')[1];
  cleanup.push({ context: teacher.context, id: sessionId });
  await teacher.page.locator('.slide-dots button').nth(2).click(); // 第 1 頁是暖身；課本 p.73 隨堂（3 小題都是課本原題）

  // 預設限時 1 分鐘
  await expect(teacher.page.locator('#activity-seconds')).toHaveValue('60');
  const right = await surface(browser, 820, 1180, true);
  const wrong = await surface(browser, 820, 1180, true);
  await loginStudent(right.page, 11);
  await loginStudent(wrong.page, 12);
  await teacher.page.getByTestId('toggle-activity').click();
  await expect(teacher.page.locator('#activity-actions')).toContainText('剩');
  await answerTab(right.page);
  await expect(right.page.locator('.time-chip')).toContainText('剩');

  // 11 號全對、12 號第 2、3 題錯
  for (const [s, v] of [[right, ['-10√3', '8√2', '-2√2/3']], [wrong, ['-10√3', '8', '-2√2']]] as const) {
    await answerTab(s.page);
    for (let i = 0; i < 3; i++) await s.page.locator(`#numeric-item-${i}`).fill(v[i]);
    await s.page.getByTestId('submit-answer').click();
    await expect(s.page.locator('.saved-answer')).toContainText('已送出');
  }

  // 改成 3 秒限時重新開放（直接呼叫 API，等時間到）
  await teacher.page.request.post(`/api/sessions/${sessionId}/control`, { headers: { Origin: baseURL }, data: { action: 'activity', value: true, seconds: 3 } });
  const late = await surface(browser, 820, 1180, true);
  await loginStudent(late.page, 13);
  await answerTab(late.page);
  await expect(late.page.getByTestId('student-time-up')).toBeVisible({ timeout: 10_000 });
  await expect(late.page.getByTestId('submit-answer')).toBeDisabled();
  await expect(teacher.page.getByTestId('time-up')).toBeVisible();
  await shot(teacher.page, 'teacher-time-up');
  await shot(late.page, 'student-time-up');
  // 老師加 1 分鐘：學生端解鎖
  await teacher.page.getByTestId('extend-60').click();
  await expect(late.page.getByTestId('student-time-up')).toHaveCount(0);
  await expect(late.page.getByTestId('submit-answer')).toBeEnabled();
  await teacher.page.getByTestId('toggle-activity').click(); // 結束作答

  // 原題再派一次：只有 12 號，只重做第 2、3 題（不另外出題）
  await expect(teacher.page.getByTestId('practice-start')).toContainText('1 人');
  await expect(teacher.page.getByTestId('practice-start')).toContainText('原題再派一次');
  await teacher.page.getByTestId('practice-start').click();
  await expect(teacher.page.getByTestId('practice-board')).toBeVisible();
  await expect(teacher.page.getByTestId('practice-seat-12')).toContainText('第 1/2 題');
  await expect(wrong.page.getByTestId('practice-card')).toBeVisible();
  await expect(right.page.getByTestId('practice-card')).toHaveCount(0);
  await expect(wrong.page.locator('.practice-card h2')).toContainText('第 1 / 2 題');
  await expect(wrong.page.locator('.practice-prompt')).toContainText('(2)');
  await shot(wrong.page, 'student-round1');

  // 第 1 題（原題第 2 小題）答對 → 下一題是原題第 3 小題
  await wrong.page.locator('#practice-answer').fill('8√2');
  await wrong.page.getByTestId('submit-practice').click();
  await expect(wrong.page.locator('.practice-card h2')).toContainText('第 2 / 2 題');
  await expect(wrong.page.locator('.practice-prompt')).toContainText('(3)');
  await expect(wrong.page.locator('.practice-past')).toContainText('答對');
  await expect(teacher.page.getByTestId('practice-seat-12')).toContainText('第 2/2 題');

  // 第 2 題又錯 → 看到答案、標「個別指導」
  await wrong.page.locator('#practice-answer').fill('-2√2');
  await wrong.page.getByTestId('submit-practice').click();
  await expect(wrong.page.getByTestId('practice-help')).toBeVisible();
  await expect(wrong.page.locator('.practice-past').last()).toContainText('答案');
  await expect(teacher.page.getByTestId('practice-seat-12')).toContainText('個別指導');
  await shot(teacher.page, 'teacher-board');
  await shot(wrong.page, 'student-help');

  await teacher.page.getByTestId('practice-end').click();
  await expect(wrong.page.getByTestId('practice-card')).toHaveCount(0);
});
