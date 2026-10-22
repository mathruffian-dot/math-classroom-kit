// 幾何題附圖：9-1-4 的課後檢核每題都有圖。學生手機的作答卡看得到圖、不會超出畫面；
// 老師結束測驗後，在大螢幕點題目可以展開題目、附圖、選項與每個選項的人數。
import { test, expect, type Browser, type BrowserContext } from '@playwright/test';
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

test.afterEach(async () => {
  for (const r of cleanup.splice(0)) await r.context.request.delete(`/api/sessions/${r.id}`, { headers: { Origin: baseURL }, data: {} });
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

test('geometry quiz: every question shows its figure on the phone, and the teacher can review it on the board', async ({ browser }) => {
  test.setTimeout(120_000);
  await mkdir(screenshots, { recursive: true });
  const teacher = await surface(browser, 1440, 900);
  await teacher.page.goto('/');
  await teacher.page.getByLabel('帳號').fill('teacher');
  await teacher.page.getByLabel('密碼').fill('11235813');
  await teacher.page.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(teacher.page.getByTestId('lesson-card').first()).toBeVisible();
  const cl = (await (await teacher.page.request.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  await teacher.page.request.patch(`/api/classes/${cl.id}`, { headers: { Origin: baseURL }, data: { requireCode: false } });
  await teacher.page.getByTestId('lesson-card').filter({ hasText: 'sin、cos、tan' }).getByRole('button', { name: '開始上課' }).click();
  await teacher.page.locator('#start-form select').selectOption('demo-class');
  await teacher.page.locator('#start-form').getByRole('button', { name: '開始上課' }).click();
  await expect(teacher.page.getByTestId('session-slide')).toBeVisible();
  cleanup.push({ context: teacher.context, id: teacher.page.url().split('/session/')[1] });

  const phone = await surface(browser, 390, 844, true);
  await phone.page.goto('/#/student');
  await phone.page.getByLabel('座號').fill('31');
  await phone.page.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(phone.page.getByTestId('session-slide')).toBeVisible();

  await teacher.page.locator('.slide-dots button').last().click();
  await teacher.page.getByTestId('quiz-class').click();
  const tab = phone.page.locator('.phone-tabs [data-tab="answer"]');
  if (await tab.isVisible()) await tab.click();
  const s = phone.page;
  await expect(s.getByTestId('quiz-card')).toBeVisible();
  for (let i = 0; i < 10; i++) {
    const fig = s.locator('.quiz-card img.quiz-figure');
    await expect(fig).toBeVisible();
    // 圖真的畫出來了（SVG 載入成功），而且沒有超出手機寬度
    const box = await fig.evaluate((img: HTMLImageElement) => ({ ok: img.complete && img.naturalWidth > 0, right: img.getBoundingClientRect().right, w: window.innerWidth }));
    expect(box.ok).toBe(true);
    expect(box.right).toBeLessThanOrEqual(box.w);
    if (i === 0) await s.screenshot({ path: resolve(screenshots, 'quiz-figure-phone.png') });
    await s.getByTestId('quiz-option-0').click();
    await s.getByTestId('conf-sure').click(); // 信心下注：選了把握才跳下一題
    await expect(s.locator('.quiz-dot').nth(i)).toHaveClass(/done/);
  }
  await s.getByTestId('quiz-submit').click();

  await teacher.page.getByTestId('quiz-end').click();
  const detail = teacher.page.getByTestId('qb-detail').first();
  await expect(detail).toBeVisible();
  await detail.locator('summary').click();
  await expect(detail.locator('img.quiz-figure')).toBeVisible();
  await expect(detail.locator('.qb-options li')).toHaveCount(4);
  await expect(detail.locator('.qb-options li.ok')).toHaveCount(1);
  await teacher.page.screenshot({ path: resolve(screenshots, 'quiz-figure-board.png') });
});
