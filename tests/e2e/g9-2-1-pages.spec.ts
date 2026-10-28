// 九上 2-1 三堂課：每一頁走到最後一步，確認一個畫面放得下，並截圖（artifacts/screenshots/g9-2-1/）供人工檢查。
import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const out = resolve('artifacts/screenshots/g9-2-1');

for (const id of ['g9-2-1a', 'g9-2-1b', 'g9-2-1c'])
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
