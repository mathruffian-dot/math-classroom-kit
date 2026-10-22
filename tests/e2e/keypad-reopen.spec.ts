// 作答鍵盤收起後再點答案框，鍵盤一定要再出現（iPad：滑動面板或按 ✕ 收起鍵盤時，答案框仍保有焦點）。
import { test, expect, type Browser, type BrowserContext } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
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

test('keypad comes back when the focused answer box is tapped again', async ({ browser }) => {
  test.setTimeout(90_000);
  const teacher = await surface(browser, 1440, 900);
  const tp = teacher.page;
  await tp.goto('/');
  await tp.getByLabel('帳號').fill('teacher');
  await tp.getByLabel('密碼').fill('11235813');
  await tp.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(tp.getByTestId('lesson-card').first()).toBeVisible();
  const cl = (await (await tp.request.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  await tp.request.patch(`/api/classes/${cl.id}`, { headers: { Origin: baseURL }, data: { requireCode: false } });
  await tp.getByTestId('lesson-card').filter({ hasText: '根式的乘除' }).getByRole('button', { name: '開始上課' }).click();
  await tp.locator('#start-form select').selectOption('demo-class');
  await tp.locator('#start-form').getByRole('button', { name: '開始上課' }).click();
  await expect(tp.getByTestId('session-slide')).toBeVisible();
  cleanup.push({ context: teacher.context, id: tp.url().split('/session/')[1] });

  const ipad = await surface(browser, 820, 1180, true);
  const p = ipad.page;
  await p.goto('/#/student');
  await p.getByLabel('座號').fill('39');
  await p.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(p.getByTestId('session-slide')).toBeVisible();

  // 第 3 頁：課本 p.73 隨堂（3 小題數值填答；第 1 頁是暖身）
  await tp.locator('.slide-dots button').nth(2).click();
  await tp.getByTestId('toggle-activity').click();
  const tab = p.locator('.phone-tabs [data-tab="answer"]');
  if (await tab.isVisible()) await tab.click();
  const box = p.locator('#numeric-item-0');
  const keypad = p.getByTestId('keypad');

  await box.tap();
  await expect(keypad).toBeVisible();
  // ① 手指碰到面板（開始滑動看題目）：鍵盤收起，但答案框沒有失去焦點
  await p.locator('#student-answer .activity-prompt').evaluate((el) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })));
  await expect(keypad).toBeHidden();
  await box.tap();
  await expect(keypad).toBeVisible();
  // ② 按 ✕ 收起鍵盤後再點答案框
  await p.locator('#keypad [data-action="keypad-close"]').evaluate((el) => (el as HTMLElement).click()); // iPad 點按鈕不會搶走焦點
  await expect(keypad).toBeHidden();
  await box.tap();
  await expect(keypad).toBeVisible();
  // 鍵盤還能輸入
  await p.locator('#keypad [data-key="2"]').tap();
  await expect(box).toHaveValue('2');
});
