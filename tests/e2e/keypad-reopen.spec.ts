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

/** 老師開 2-2(1)、到第 3 頁（課本 p.73 隨堂 3 小題）開放作答；學生 iPad 登入。 */
async function setup(browser: Browser, seat: number, width = 820, height = 1180, init?: () => void) {
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

  const ipad = await surface(browser, width, height, true);
  const p = ipad.page;
  if (init) await p.addInitScript(init);
  await p.goto('/#/student');
  await p.getByLabel('座號').fill(String(seat));
  await p.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(p.getByTestId('session-slide')).toBeVisible();

  // 第 3 頁：課本 p.73 隨堂（3 小題數值填答；第 1 頁是暖身）
  await tp.locator('.slide-dots button').nth(2).click();
  await tp.getByTestId('toggle-activity').click();
  const tab = p.locator('.phone-tabs [data-tab="answer"]');
  if (await tab.isVisible()) await tab.click();
  return { tp, p, sessionId: tp.url().split('/session/')[1] };
}

test('keypad comes back when the focused answer box is tapped again', async ({ browser }) => {
  test.setTimeout(90_000);
  const { p } = await setup(browser, 39);
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

test('no system-keyboard switch: an iPad that saved the old switch still gets the math keypad on every box', async ({ browser }) => {
  test.setTimeout(90_000);
  // 舊版的 ⌨ 切換會記在 localStorage；載入新版時要清掉
  const { p } = await setup(browser, 38, 1180, 820, () => localStorage.setItem('mck-syskb', '1'));
  expect(await p.evaluate(() => localStorage.getItem('mck-syskb'))).toBeNull();
  await expect(p.locator('#keypad [data-key="keyboard"]')).toHaveCount(0);
  for (const i of [0, 1, 2]) {
    const box = p.locator(`#numeric-item-${i}`);
    await expect(box).toHaveAttribute('inputmode', 'none');
    await box.tap();
    await expect(p.getByTestId('keypad')).toBeVisible();
    await p.locator('#keypad [data-key="3"]').tap();
    await expect(box).toHaveValue('3');
  }
  // 「清空」取代原本的 ⌨
  await p.locator('#keypad [data-key="clear"]').tap();
  await expect(p.locator('#numeric-item-2')).toHaveValue('');
});

test('a full re-render while typing keeps the scroll position, the box, the caret and the keypad', async ({ browser }) => {
  test.setTimeout(90_000);
  const { tp, p, sessionId } = await setup(browser, 37, 820, 1180);
  await p.locator('#numeric-item-0').tap();
  await p.locator('#keypad [data-key="1"]').tap();
  await p.locator('#numeric-item-2').tap();
  await p.locator('#keypad [data-key="√"]').tap();
  await p.locator('#keypad [data-key="5"]').tap();
  const before = await p.evaluate(() => ({ scroll: document.querySelector('.panel-col .panel-scroll')?.scrollTop ?? 0, top: document.querySelector('#numeric-item-2')!.getBoundingClientRect().top }));
  // 老師開彈幕：學生端整頁重畫
  await tp.request.post(`/api/sessions/${sessionId}/control`, { headers: { Origin: baseURL }, data: { action: 'danmaku', value: true } });
  await expect(p.getByTestId('danmaku-open')).toBeVisible();
  await expect(p.getByTestId('keypad')).toBeVisible();
  const after = await p.evaluate(() => ({ scroll: document.querySelector('.panel-col .panel-scroll')?.scrollTop ?? 0, top: document.querySelector('#numeric-item-2')!.getBoundingClientRect().top, focus: document.activeElement?.id }));
  expect(after.focus).toBe('numeric-item-2');
  expect(Math.abs(after.scroll - before.scroll)).toBeLessThanOrEqual(2);
  expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(2);
  await expect(p.locator('#numeric-item-0')).toHaveValue('1');
  // 游標還在 √(5|) 裡：繼續打字接在後面
  await p.locator('#keypad [data-key="2"]').tap();
  await expect(p.locator('#numeric-item-2')).toHaveValue('√(52)');
});
