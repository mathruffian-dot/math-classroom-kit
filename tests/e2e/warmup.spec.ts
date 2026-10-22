// 暖身例行活動與全班目標條：第一頁「估一估」容許誤差內都算對，全班答對率達 80% 慶祝；「哪一個不一樣」沒有標準答案。
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
  await page.screenshot({ path: resolve(screenshots, `warmup-${name}.png`) });
}
async function loginStudent(page: Page, seat: number) {
  await page.goto('/#/student');
  await page.getByLabel('座號').fill(String(seat));
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

test('warm-up first page: estimate within tolerance, class goal bar celebrates at 80%; which-one-doesn\'t-belong has no single answer', async ({ browser }) => {
  test.setTimeout(180_000);
  const teacher = await surface(browser, 1440, 900);
  const tp = teacher.page;
  await tp.goto('/');
  await tp.getByLabel('帳號').fill('teacher');
  await tp.getByLabel('密碼').fill('11235813');
  await tp.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(tp.getByTestId('lesson-card').first()).toBeVisible();
  const cl = (await (await tp.request.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  await tp.request.patch(`/api/classes/${cl.id}`, { headers: { Origin: baseURL }, data: { requireCode: false } });
  const startLesson = async (title: string) => {
    await tp.goto('/');
    await tp.getByTestId('lesson-card').filter({ hasText: title }).getByRole('button', { name: '開始上課' }).click();
    await tp.locator('#start-form select').selectOption('demo-class');
    await tp.locator('#start-form').getByRole('button', { name: '開始上課' }).click();
    await expect(tp.getByTestId('session-slide')).toBeVisible();
    const id = tp.url().split('/session/')[1];
    cleanup.push({ context: teacher.context, id });
    return id;
  };
  // 2-2(2) 第一頁：估一估 2√3
  const b = await startLesson('最簡根式');
  await expect(tp.locator('.slide-stage h1')).toContainText('估一估');
  const students = [];
  for (const [seat, w, h] of [[36, 390, 844], [37, 1080, 810], [38, 1080, 810]] as const) {
    const s = await surface(browser, w, h, true);
    await loginStudent(s.page, seat);
    students.push(s.page);
  }
  await tp.getByTestId('toggle-activity').click();
  for (const [i, s] of students.entries()) {
    await answerTab(s);
    await s.locator('#numeric-answer').fill(['3.5', '3.4', '3.46'][i]);
    await s.getByTestId('submit-answer').click();
    if (i === 0) {
      // 2 人答對之前：目標條還沒滿
      await expect(tp.getByTestId('class-goal')).toBeVisible();
    }
  }
  // 3 人都在容許誤差內 → 100%，全班達標
  await expect(tp.getByTestId('class-goal')).toHaveClass(/hit/);
  await expect(tp.getByTestId('class-goal')).toContainText('全班達標');
  await expect(tp.locator('.confetti-layer')).toHaveCount(1);
  await shot(tp, 'teacher-goal-hit');
  await tp.getByRole('button', { name: '公布結果' }).click();
  await expect(students[0].getByTestId('class-goal')).toContainText('3／3 人答對');
  await shot(students[0], 'phone-goal');
  await tp.request.post(`/api/sessions/${b}/control`, { headers: { Origin: baseURL }, data: { action: 'end' } });
  // 2-2(1) 第一頁：哪一個不一樣（卡片＝選項，沒有正解、沒有目標條）
  await startLesson('根式的乘除');
  await expect(tp.locator('.slide-stage h1')).toContainText('哪一個不一樣');
  await expect(tp.locator('.slide-stage .idea-card')).toHaveCount(4);
  for (const s of students) {
    await s.reload();
    await expect(s.getByTestId('session-slide')).toBeVisible();
  }
  await tp.getByTestId('toggle-activity').click();
  for (const [i, s] of students.entries()) {
    await answerTab(s);
    await s.locator('.answer-option').nth(i).click();
    await s.getByTestId('submit-answer').click();
  }
  await tp.getByRole('button', { name: '公布結果' }).click();
  await expect(tp.getByTestId('class-goal')).toHaveCount(0);
  await expect(students[1].locator('.explanation')).toContainText('每一張都可以是答案');
  await shot(tp, 'teacher-wodb');
  await shot(students[1], 'ipad-wodb');
});
