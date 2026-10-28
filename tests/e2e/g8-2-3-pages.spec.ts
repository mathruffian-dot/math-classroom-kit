// 八上 2-3 三堂課：每一頁走到最後一步，確認一個畫面放得下，並截圖（artifacts/screenshots/g8-2-3/）供人工檢查。
import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const out = resolve('artifacts/screenshots/g8-2-3');

for (const id of ['g8-2-3a', 'g8-2-3b', 'g8-2-3c'])
  test(`${id}: every slide fits one screen`, async ({ browser }) => {
    test.setTimeout(180_000);
    await mkdir(out, { recursive: true });
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const h = { Origin: baseURL };
    expect((await page.request.post('/api/login', { headers: h, data: { role: 'teacher', account: 'teacher', password: '11235813' } })).ok()).toBeTruthy();
    const d = await (await page.request.get('/api/dashboard')).json();
    const lesson = d.lessons.find((l: { id: string }) => l.id === id);
    const { session } = await (await page.request.post('/api/sessions', { headers: h, data: { lessonId: id, classId: d.classes[0].id } })).json();
    await page.goto(`/#/session/${session.id}`);
    for (let i = 0; i < lesson.slides.length; i++) {
      await page.request.post(`/api/sessions/${session.id}/control`, { headers: h, data: { action: 'slide', index: i } });
      await expect(page.locator('.room-progress span').first()).toHaveText(String(i + 1));
      const next = page.locator('[data-viz="next"]');
      for (let k = 0; k < 9 && (await next.count()) && (await next.isEnabled()); k++) {
        const before = (await page.locator('.viz-step-count').textContent()) || '';
        await next.click();
        await expect(page.locator('.viz-step-count')).not.toHaveText(before);
      }
      await page.waitForTimeout(900);
      const s = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight }));
      expect(s.w, `${id} slide ${i + 1}: no horizontal overflow`).toBeLessThanOrEqual(s.vw + 1);
      expect(s.h, `${id} slide ${i + 1}: no page scroll`).toBeLessThanOrEqual(s.vh + 1);
      await page.locator('#slide-stage').screenshot({ path: resolve(out, `${id}-${String(i + 1).padStart(2, '0')}-${lesson.slides[i].id}.png`) });
    }
    await page.request.delete(`/api/sessions/${session.id}`, { headers: h, data: {} });
    await context.close();
  });

// 學生端：iPad 直向與手機，挑幾頁（具體操作、例題、隨堂、坐標平面）開放作答後截圖，沒有水平溢位。
const PICKS: Record<string, number[]> = { 'g8-2-3a': [3, 4, 6, 7], 'g8-2-3b': [3, 4, 8], 'g8-2-3c': [2, 4, 6, 9] };
const DEVICES = [
  { name: 'ipad', viewport: { width: 820, height: 1180 }, isMobile: false },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true },
];
test('g8-2-3 student pages on iPad and phone', async ({ browser }) => {
  test.setTimeout(240_000);
  await mkdir(out, { recursive: true });
  const tctx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const t = await tctx.newPage();
  const h = { Origin: baseURL };
  expect((await t.request.post('/api/login', { headers: h, data: { role: 'teacher', account: 'teacher', password: '11235813' } })).ok()).toBeTruthy();
  const d = await (await t.request.get('/api/dashboard')).json();
  for (const [id, picks] of Object.entries(PICKS)) {
    const lesson = d.lessons.find((l: { id: string }) => l.id === id);
    const { session } = await (await t.request.post('/api/sessions', { headers: h, data: { lessonId: id, classId: d.classes[0].id } })).json();
    const studs = [];
    for (const [k, dev] of DEVICES.entries()) {
      const c = await browser.newContext({ baseURL, viewport: dev.viewport, hasTouch: true, isMobile: dev.isMobile });
      const p = await c.newPage();
      await p.goto('/#/student');
      await p.getByLabel('座號').fill(String(30 + k));
      await p.locator('#login-form').getByRole('button', { name: '登入' }).click();
      await expect(p.getByTestId('session-slide')).toBeVisible();
      studs.push({ ...dev, page: p, c });
    }
    for (const i of picks) {
      await t.request.post(`/api/sessions/${session.id}/control`, { headers: h, data: { action: 'slide', index: i } });
      if (lesson.slides[i].activity) await t.request.post(`/api/sessions/${session.id}/control`, { headers: h, data: { action: 'activity', value: true } });
      const name = `${id}-${String(i + 1).padStart(2, '0')}-${lesson.slides[i].id}`;
      for (const s of studs) {
        await s.page.waitForTimeout(1500);
        // 手機分成「投影片／作答」兩個分頁：兩個都截
        const slideTab = s.page.locator('.phone-tabs [data-tab="slide"]');
        if (await slideTab.isVisible()) {
          await slideTab.click();
          await s.page.waitForTimeout(400);
        }
        await s.page.screenshot({ path: resolve(out, `${name}-${s.name}.png`) });
        const tab = s.page.locator('.phone-tabs [data-tab="answer"]');
        if (await tab.isVisible()) {
          await tab.click();
          await s.page.waitForTimeout(400);
          await s.page.screenshot({ path: resolve(out, `${name}-${s.name}-answer.png`) });
        }
        const m = await s.page.evaluate(() => ({ w: document.documentElement.scrollWidth, vw: innerWidth }));
        expect(m.w, `${name} ${s.name}: no horizontal overflow`).toBeLessThanOrEqual(m.vw + 1);
      }
    }
    for (const s of studs) await s.c.close();
    await t.request.delete(`/api/sessions/${session.id}`, { headers: h, data: {} });
  }
  await tctx.close();
});
