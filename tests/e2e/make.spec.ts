// 根式湊數挑戰：投影片顯示目標與數字卡；學生點卡片與運算符號組成算式，即時看到值，湊到了再送出；公布後看全班的湊法。
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
  await page.screenshot({ path: resolve(screenshots, `make-${name}.png`) });
}

test.afterEach(async () => {
  for (const r of cleanup.splice(0)) await r.context.request.delete(`/api/sessions/${r.id}`, { headers: { Origin: baseURL }, data: {} });
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

test('make: build an expression from the cards, live value, hand in when it hits the target, class sees the ways', async ({ browser }) => {
  test.setTimeout(150_000);
  const teacher = await surface(browser, 1440, 900);
  const tp = teacher.page;
  await tp.goto('/');
  await tp.getByLabel('帳號').fill('teacher');
  await tp.getByLabel('密碼').fill('11235813');
  await tp.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(tp.getByTestId('lesson-card').first()).toBeVisible();
  const cl = (await (await tp.request.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  await tp.request.patch(`/api/classes/${cl.id}`, { headers: { Origin: baseURL }, data: { requireCode: false } });
  await tp.getByTestId('lesson-card').filter({ hasText: '最簡根式' }).getByRole('button', { name: '開始上課' }).click();
  await tp.locator('#start-form select').selectOption('demo-class');
  await tp.locator('#start-form').getByRole('button', { name: '開始上課' }).click();
  await expect(tp.getByTestId('session-slide')).toBeVisible();
  const id = tp.url().split('/session/')[1];
  cleanup.push({ context: teacher.context, id });
  const lesson = (await (await tp.request.get(`/api/sessions/${id}`)).json()).lesson;
  const index = lesson.slides.findIndex((s: { activity?: { id: string } }) => s.activity?.id === 'make-1');
  expect(index).toBeGreaterThan(0);

  const phone = await surface(browser, 390, 844, true);
  const ipad = await surface(browser, 1080, 810, true);
  for (const [s, seat] of [[phone, 34], [ipad, 35]] as const) {
    await s.page.goto('/#/student');
    await s.page.getByLabel('座號').fill(String(seat));
    await s.page.locator('#login-form').getByRole('button', { name: '登入' }).click();
    await expect(s.page.getByTestId('session-slide')).toBeVisible();
  }
  await tp.locator('.slide-dots button').nth(index).click();
  await expect(tp.getByTestId('make-visual')).toBeVisible();
  await expect(tp.locator('.make-visual .make-card')).toHaveCount(4);
  await tp.getByTestId('toggle-activity').click();
  await shot(tp, 'projector');

  // 手機：√2 × √8 ＋ √12 ÷ √3 ＝ 6
  const p = phone.page;
  await p.locator('.phone-tabs [data-tab="answer"]').click();
  await expect(p.getByTestId('make-board')).toBeVisible();
  const tap = async (page: Page, ...ids: string[]) => {
    for (const x of ids) await page.getByTestId(x).click();
  };
  await tap(p, 'make-card-0', 'make-op-times', 'make-card-1');
  await expect(p.getByTestId('make-card-0')).toBeDisabled(); // 用過的卡片不能再按
  await expect(p.getByTestId('make-status')).toContainText('≈ 4');
  await tap(p, 'make-op-plus', 'make-card-3', 'make-op-div');
  await expect(p.getByTestId('make-status')).toContainText('還沒完成');
  await tap(p, 'make-card-2');
  await expect(p.getByTestId('make-status')).toContainText('湊到了');
  await expect(p.getByTestId('make-expr')).toHaveClass(/ok/);
  await shot(p, 'phone-hit');
  await p.getByTestId('submit-answer').click();
  await expect(p.locator('.saved-answer')).toContainText('已送出');

  // iPad：先按錯再刪掉，最後送出一個湊不到的（也可以交）
  const q = ipad.page;
  await tap(q, 'make-card-0', 'make-op-plus', 'make-card-1', 'make-back');
  await expect(q.getByTestId('make-card-1')).toBeEnabled();
  await tap(q, 'make-card-1', 'make-op-plus', 'make-card-2', 'make-op-plus', 'make-card-3');
  await expect(q.getByTestId('make-status')).toContainText('還不是目標數');
  await q.getByTestId('submit-answer').click();
  await expect(q.locator('.saved-answer')).toBeVisible();

  await expect(tp.locator('.correct-rate strong')).toHaveText('1');
  await tp.getByRole('button', { name: '公布結果' }).click();
  await expect(p.locator('#aggregate')).toContainText('全班的湊法');
  await expect(p.locator('.explanation')).toContainText('一種湊法');
  await shot(p, 'phone-results');
  await shot(tp, 'teacher-results');
});
