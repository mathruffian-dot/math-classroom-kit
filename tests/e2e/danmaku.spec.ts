// 彈幕：老師開啟 → iPad 學生送出（預設匿名）→ 老師畫面上由右至左飛過；紀錄只有老師看得到座號。
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
  await page.screenshot({ path: resolve(screenshots, `danmaku-${name}.png`) });
}

test.afterEach(async () => {
  for (const r of cleanup.splice(0)) await r.context.request.delete(`/api/sessions/${r.id}`, { headers: { Origin: baseURL }, data: {} });
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

test('teacher opens danmaku; anonymous student messages fly right to left over the slide', async ({ browser }) => {
  test.setTimeout(120_000);
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
  cleanup.push({ context: teacher.context, id: teacher.page.url().split('/session/')[1] });

  const ipad = await surface(browser, 820, 1180, true);
  await ipad.page.goto('/#/student');
  await ipad.page.getByLabel('座號').fill('7');
  await ipad.page.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(ipad.page.getByTestId('session-slide')).toBeVisible();
  await expect(ipad.page.getByTestId('danmaku-open')).toHaveCount(0); // 還沒開放

  await teacher.page.getByTestId('danmaku-toggle').click();
  await expect(teacher.page.getByTestId('danmaku-toggle')).toHaveAttribute('aria-pressed', 'true');
  await ipad.page.getByTestId('danmaku-open').tap();
  await expect(ipad.page.getByTestId('danmaku-bar')).toBeVisible();
  await expect(ipad.page.locator('#danmaku-anon')).toBeChecked();
  await ipad.page.locator('#danmaku-text').fill('原來根號可以這樣乘！');
  await ipad.page.keyboard.press('Enter');
  await expect(ipad.page.locator('#danmaku-text')).toHaveValue('');
  await shot(ipad.page, 'student-bar');

  // 老師畫面：匿名彈幕出現在投影片上，從右邊往左移動
  const item = teacher.page.locator('#danmaku-layer .danmaku-item').filter({ hasText: '原來根號可以這樣乘！' });
  await expect(item).toBeVisible();
  await expect(item).not.toContainText('7 號');
  const x1 = (await item.boundingBox())!.x;
  await teacher.page.waitForTimeout(700);
  const x2 = (await item.boundingBox())!.x;
  expect(x2).toBeLessThan(x1);
  const stage = (await teacher.page.getByTestId('session-slide').boundingBox())!;
  const layer = (await teacher.page.locator('#danmaku-layer').boundingBox())!;
  expect(Math.abs(layer.x - stage.x) + Math.abs(layer.width - stage.width)).toBeLessThan(2);
  await shot(teacher.page, 'teacher-flying');

  // 不匿名：顯示座號；老師紀錄看得到座號
  await ipad.page.waitForTimeout(3100); // 3 秒一則
  await ipad.page.locator('#danmaku-anon').uncheck();
  await ipad.page.locator('#danmaku-text').fill('我懂了');
  await ipad.page.getByTestId('danmaku-send').tap();
  await expect(teacher.page.locator('#danmaku-layer .danmaku-item').filter({ hasText: '7 號：我懂了' })).toBeVisible();
  await teacher.page.locator('.danmaku-log summary').click();
  await expect(teacher.page.locator('.danmaku-log')).toContainText('7 號');

  // 清除與關閉
  await teacher.page.getByRole('button', { name: '清除彈幕' }).click();
  await expect(teacher.page.locator('#danmaku-layer .danmaku-item')).toHaveCount(0);
  await teacher.page.getByTestId('danmaku-toggle').click();
  await expect(ipad.page.getByTestId('danmaku-open')).toHaveCount(0);
  await expect(ipad.page.getByTestId('danmaku-bar')).toHaveCount(0);
});
