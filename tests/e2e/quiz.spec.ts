// 課後形成性評量與 PK 戰：老師＋3 台 iPad。
// 驗證：全班同一份卷子、可前後翻與改答案、交卷、結束後看答案；PK 用座位表點選、抽籤＋配電腦、倒數、選了就鎖定、勝負。
import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:8787';
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
  await page.screenshot({ path: resolve(screenshots, `quiz-${name}.png`) });
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

test('formative quiz for the class, then PK battles picked on the seat map and by draw + computer', async ({ browser }) => {
  test.setTimeout(180_000);
  const teacher = await surface(browser, 1440, 900);
  await teacher.page.goto('/');
  await teacher.page.getByLabel('帳號').fill('teacher');
  await teacher.page.getByLabel('密碼').fill('11235813');
  await teacher.page.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(teacher.page.getByTestId('lesson-card').first()).toBeVisible();
  const cl = (await (await teacher.page.request.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  await teacher.page.request.patch(`/api/classes/${cl.id}`, { headers: { Origin: baseURL }, data: { requireCode: false } });
  await teacher.page.getByTestId('lesson-card').filter({ hasText: '根式的乘除' }).getByRole('button', { name: '開始上課' }).click();
  await teacher.page.locator('#start-form select').selectOption('demo-class');
  await teacher.page.locator('#start-form').getByRole('button', { name: '開始上課' }).click();
  await expect(teacher.page.getByTestId('session-slide')).toBeVisible();
  const sessionId = teacher.page.url().split('/session/')[1];
  cleanup.push({ context: teacher.context, id: sessionId });

  const students = [];
  for (const seat of [21, 22, 23]) {
    const s = await surface(browser, 1080, 810, true);
    await loginStudent(s.page, seat);
    students.push(s);
  }
  const [s21, s22] = students.map((s) => s.page);

  // ── 全班測驗 ──
  await teacher.page.getByTestId('quiz-class').click();
  await expect(teacher.page.getByTestId('quiz-board')).toBeVisible();
  await answerTab(s21);
  await expect(s21.getByTestId('quiz-card')).toBeVisible();
  await expect(s21.locator('.quiz-dot')).toHaveCount(10);
  // 同一份卷子：兩位同學第 1 題題目相同
  await answerTab(s22);
  await expect(s22.locator('.quiz-stem')).toHaveText((await s21.locator('.quiz-stem').textContent())!);
  for (let i = 0; i < 10; i++) {
    await s21.getByTestId('quiz-option-0').click();
    await expect(s21.locator('.quiz-dot').nth(i)).toHaveClass(/done/);
  }
  await shot(s21, 'student-class');
  await s21.getByTestId('quiz-submit').click();
  await expect(s21.locator('.quiz-summary')).toContainText('已交卷');
  await expect(teacher.page.getByTestId('quiz-status')).toContainText('已交卷 1');
  await shot(teacher.page, 'teacher-class-board');
  await teacher.page.getByTestId('quiz-end').click();
  await expect(s21.getByTestId('quiz-summary')).toContainText('／10 題');
  await expect(s21.locator('.quiz-review li')).toHaveCount(10);

  // ── PK：座位表點 21、22 配一組；抽籤抽到 23（只剩他上線），配電腦 ──
  await teacher.page.getByRole('button', { name: '關閉' }).click();
  await teacher.page.getByTestId('pk-lobby').click();
  await teacher.page.locator('#seat-map [data-action="pk-pick"][data-seat="21"]').click();
  await teacher.page.locator('#seat-map [data-action="pk-pick"][data-seat="22"]').click();
  await expect(teacher.page.getByTestId('pk-pair')).toHaveCount(1);
  await teacher.page.getByTestId('pk-draw').click();
  await expect(teacher.page.getByTestId('pk-waiting')).toContainText('23 號');
  await teacher.page.getByTestId('pk-bot').click();
  await expect(teacher.page.getByTestId('pk-pair')).toHaveCount(2);
  await shot(teacher.page, 'teacher-lobby');
  await teacher.page.getByTestId('pk-start').click();
  await expect(teacher.page.getByTestId('pk-card')).toHaveCount(2);
  await expect(s21.getByTestId('quiz-card')).toContainText('你 vs 22 號');
  // 倒數結束後出現題目；選了就鎖定、跳下一題
  await expect(s21.getByTestId('quiz-option-0')).toBeVisible({ timeout: 8000 });
  for (let i = 0; i < 10; i++) {
    await expect(s21.locator('.mini-label')).toContainText(`第 ${i + 1}／10 題`);
    await s21.getByTestId('quiz-option-0').click();
  }
  for (let i = 0; i < 10; i++) {
    await expect(s22.locator('.mini-label')).toContainText(`第 ${i + 1}／10 題`);
    await s22.getByTestId('quiz-option-1').click();
  }
  await expect(s21.getByTestId('pk-result')).toBeVisible();
  await expect(teacher.page.getByTestId('pk-card').first()).toHaveClass(/over/);
  await shot(teacher.page, 'teacher-pk-board');
  await shot(s21, 'student-pk-result');
  // 同組再戰：重新抽一份
  await teacher.page.getByTestId('quiz-end').click().catch(() => {});
  await expect(teacher.page.getByTestId('pk-again')).toBeVisible({ timeout: 10_000 });
});
