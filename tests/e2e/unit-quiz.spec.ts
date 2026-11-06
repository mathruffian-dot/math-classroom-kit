// 單元總測驗：魔王戰前一頁，玩法同課後檢核・PK 戰，12 題來自整個單元。老師＋2 台 iPad。
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
  await page.screenshot({ path: resolve(screenshots, `unit-quiz-${name}.png`) });
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

test('unit quiz page before the boss: 12 questions for the class, then a unit PK lobby', async ({ browser }) => {
  test.setTimeout(120_000);
  const teacher = await surface(browser, 1440, 900);
  const h = { Origin: baseURL };
  expect((await teacher.page.request.post('/api/login', { headers: h, data: { role: 'teacher', account: 'teacher', password: '11235813' } })).ok()).toBeTruthy();
  const d = await (await teacher.page.request.get('/api/dashboard')).json();
  const cl = d.classes.find((c: { code: string }) => c.code === 'DEMO801');
  await teacher.page.request.patch(`/api/classes/${cl.id}`, { headers: h, data: { requireCode: false } });
  const { session } = await (await teacher.page.request.post('/api/sessions', { headers: h, data: { lessonId: 'g8-2-3c', classId: cl.id } })).json();
  cleanup.push({ context: teacher.context, id: session.id });
  await teacher.page.goto(`/#/session/${session.id}`);
  await expect(teacher.page.getByTestId('session-slide')).toBeVisible();
  const students = [];
  for (const seat of [31, 32]) {
    const s = await surface(browser, 1080, 810, true);
    await loginStudent(s.page, seat);
    students.push(s.page);
  }
  const [s31, s32] = students;

  // 魔王戰前一頁：單元總測驗（課後檢核頁還在更前面）
  await teacher.page.locator('.slide-dots button').nth(-2).click();
  await expect(teacher.page.locator('.slide-stage h1')).toContainText('2-3 單元總測驗');
  await expect(teacher.page.getByTestId('unit-quiz-note')).toContainText('12 題');
  await expect(teacher.page.getByTestId('quiz-class')).toHaveCount(0);
  await shot(teacher.page, 'teacher-idle');
  await teacher.page.getByTestId('unit-quiz-class').click();
  await expect(teacher.page.getByTestId('quiz-board')).toContainText('2-3 單元總測驗（12 題）');
  await expect(teacher.page.getByTestId('quiz-status')).toContainText('單元總測驗');
  await answerTab(s31);
  await expect(s31.getByTestId('quiz-card')).toContainText('單元總測驗');
  await expect(s31.locator('.quiz-dot')).toHaveCount(12);
  await answerTab(s32);
  await expect(s32.locator('.quiz-stem')).toHaveText((await s31.locator('.quiz-stem').textContent())!);
  await s31.getByTestId('quiz-option-0').click();
  await s31.getByTestId('conf-sure').click();
  await expect(s31.locator('.mini-label')).toContainText('第 2／12 題');
  await shot(s31, 'student-class');
  await teacher.page.getByTestId('quiz-end').click();
  await expect(teacher.page.getByTestId('quiz-status')).toContainText('單元總測驗已結束');
  await expect(teacher.page.getByTestId('quiz-review')).toHaveCount(0);
  await expect(teacher.page.getByTestId('quiz-record')).toHaveCount(0);
  await expect(s31.getByTestId('quiz-summary')).toContainText('／12 題');
  await shot(teacher.page, 'teacher-ended');

  // 單元總測驗 PK：配對、開戰
  await teacher.page.getByRole('button', { name: '關閉' }).first().click();
  await teacher.page.getByTestId('unit-pk-lobby').click();
  await expect(teacher.page.getByTestId('quiz-board')).toContainText('單元總測驗 PK 戰・配對中');
  await teacher.page.getByTestId('pk-random').click();
  await expect(teacher.page.getByTestId('pk-pair').first()).toBeVisible();
  await teacher.page.getByTestId('pk-start').click();
  await expect(teacher.page.getByTestId('quiz-status')).toContainText('單元總測驗 PK 戰');
  await answerTab(s31);
  await expect(s31.getByTestId('quiz-card')).toContainText('單元總測驗 PK');
  await expect(s31.locator('.mini-label')).toContainText('／12 題', { timeout: 8_000 });
  await shot(s31, 'student-pk');
});
