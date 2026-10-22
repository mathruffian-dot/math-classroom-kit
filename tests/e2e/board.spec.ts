// 白板畫筆（觸控大螢幕／觸控筆）：漏掉 pointerup 時，下一筆不能接在上一筆後面；快速書寫的點要夠密。
import { test, expect, type BrowserContext } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const contexts: BrowserContext[] = [];
let sessionId = '';

test.afterEach(async () => {
  if (sessionId && contexts[0]) await contexts[0].request.delete(`/api/sessions/${sessionId}`, { headers: { Origin: baseURL }, data: {} });
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

test('pen strokes stay separate when a pointerup is lost (same pen pointerId)', async ({ browser }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('帳號').fill('teacher');
  await page.getByLabel('密碼').fill('11235813');
  await page.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await page.getByTestId('lesson-card').filter({ hasText: '根式的乘除' }).getByRole('button', { name: '開始上課' }).click();
  await page.locator('#start-form select').selectOption('demo-class');
  await page.locator('#start-form').getByRole('button', { name: '開始上課' }).click();
  await expect(page.getByTestId('session-slide')).toBeVisible();
  sessionId = page.url().split('/session/')[1];
  await page.getByTestId('tool-pen').click();
  const box = (await page.getByTestId('whiteboard-canvas').boundingBox())!;
  // 模擬觸控筆：pointerId 都是 7，第一筆沒有 pointerup（硬體漏送），直接開始第二筆
  await page.getByTestId('whiteboard-canvas').evaluate(
    (cv, b) => {
      const fire = (type: string, x: number, y: number, buttons: number) =>
        cv.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'pen', isPrimary: true, bubbles: true, button: type === 'pointermove' ? -1 : 0, buttons, clientX: b.x + x, clientY: b.y + y }));
      fire('pointerdown', 100, 100, 1);
      for (let i = 1; i <= 10; i++) fire('pointermove', 100 + i * 10, 100, 1);
      // 漏掉 pointerup → 在遠處落筆
      fire('pointerdown', 100, 400, 1);
      for (let i = 1; i <= 10; i++) fire('pointermove', 100 + i * 10, 400, 1);
      fire('pointerup', 200, 400, 0);
    },
    { x: box.x, y: box.y },
  );
  await expect
    .poll(async () => {
      const v = await (await page.request.get(`/api/sessions/${sessionId}`)).json();
      const strokes = Object.values(v.whiteboard as Record<string, { points: { y: number }[] }[]>).flat();
      // 兩筆、而且每一筆都在同一條水平線上（沒有被連起來）
      return strokes.map((s) => Math.round((Math.max(...s.points.map((p) => p.y)) - Math.min(...s.points.map((p) => p.y))) * 1000));
    })
    .toEqual([0, 0]);
});
