// iPad 作答檢查：直向、橫向、mini、Pro 12.9，學生端的教材、作答鍵盤、畫布都要在一個畫面內、按鍵夠大。
import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const screenshots = resolve('artifacts/screenshots');
const contexts: BrowserContext[] = [];
const cleanup: { context: BrowserContext; id: string }[] = [];
const IPADS = [
  { name: 'ipad-portrait', width: 820, height: 1180 },
  { name: 'ipad-landscape', width: 1180, height: 820 },
  { name: 'ipad-mini', width: 744, height: 1133 },
  { name: 'ipad-pro-landscape', width: 1366, height: 1024 },
];

async function surface(browser: Browser, width: number, height: number, touch = true) {
  const context = await browser.newContext({ baseURL, viewport: { width, height }, hasTouch: touch, deviceScaleFactor: 1 });
  contexts.push(context);
  return { context, page: await context.newPage() };
}
async function shot(page: Page, name: string) {
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: resolve(screenshots, `${name}.png`) });
}
/** 一個畫面內：沒有整頁捲動、沒有水平溢位。 */
async function fits(page: Page, label: string) {
  const s = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight }));
  expect(s.w, `${label}: no horizontal overflow`).toBeLessThanOrEqual(s.vw + 1);
  expect(s.h, `${label}: no page scroll`).toBeLessThanOrEqual(s.vh + 1);
}
/** 觸控目標至少 44×44（Apple HIG）。 */
async function bigTargets(page: Page, selector: string, label: string, min = 44) {
  const small = await page.locator(selector).evaluateAll(
    (els, m) => els.filter((e) => (e as HTMLElement).offsetParent).map((e) => { const r = e.getBoundingClientRect(); return { t: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 12), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((r) => r.w < m || r.h < m),
    min,
  );
  expect(small, `${label}: touch targets smaller than ${min}px`).toEqual([]);
}
/** 元素完整在可視範圍內（不用在面板裡捲動才看得到）。 */
async function inView(page: Page, selector: string, label: string) {
  const r = await page.locator(selector).first().evaluate((e) => {
    const b = e.getBoundingClientRect();
    return { top: b.top, bottom: b.bottom, vh: innerHeight };
  });
  expect(r.bottom, `${label}: ${selector} visible without scrolling`).toBeLessThanOrEqual(r.vh + 1);
}

test.afterEach(async () => {
  for (const r of cleanup.splice(0)) await r.context.request.delete(`/api/sessions/${r.id}`, { headers: { Origin: baseURL }, data: {} });
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

test('iPad student: slide, keypad and canvas fit one screen with large touch targets', async ({ browser }) => {
  test.setTimeout(240_000);
  const teacher = await surface(browser, 1440, 900, false);
  await teacher.page.goto('/');
  await teacher.page.getByLabel('帳號').fill('teacher');
  await teacher.page.getByLabel('密碼').fill('11235813');
  await teacher.page.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(teacher.page.getByTestId('lesson-card').first()).toBeVisible();
  await teacher.page.getByTestId('lesson-card').filter({ hasText: '最簡根式' }).getByRole('button', { name: '開始上課' }).click();
  await teacher.page.locator('#start-form select').selectOption('demo-class');
  await teacher.page.locator('#start-form').getByRole('button', { name: '開始上課' }).click();
  await expect(teacher.page.getByTestId('session-slide')).toBeVisible();
  const sessionId = teacher.page.url().split('/session/')[1];
  cleanup.push({ context: teacher.context, id: sessionId });
  const go = async (n: number, open = true) => {
    await teacher.page.locator('.slide-dots button').nth(n - 1).click();
    await expect(teacher.page.locator('.room-progress span').first()).toHaveText(String(n));
    if (open) await teacher.page.getByTestId('toggle-activity').click();
  };

  const pads = [];
  for (const [i, d] of IPADS.entries()) {
    const s = await surface(browser, d.width, d.height);
    await s.page.goto('/#/student');
    await s.page.getByLabel('座號').fill(String(20 + i));
    await s.page.locator('#login-form').getByRole('button', { name: '登入' }).click();
    await expect(s.page.getByTestId('session-slide')).toBeVisible();
    pads.push({ ...d, page: s.page });
  }

  // 例 5：三小題數值填答＋作答鍵盤
  await go(9); // 第 1 頁是暖身
  for (const p of pads) {
    const tab = p.page.locator('.phone-tabs [data-tab="answer"]');
    if (await tab.isVisible()) await tab.click();
    await expect(p.page.locator('#app.answering')).toHaveCount(1);
    await expect(p.page.getByTestId('keypad')).toBeHidden(); // 點答案框才出現
    await p.page.waitForTimeout(300);
    await fits(p.page, `${p.name} numeric`);
    await inView(p.page, '[data-testid="submit-answer"]', `${p.name} numeric`);
    // 點第一格：鍵盤浮在答案框下方（或放不下時在上方），不蓋住任何一格，也不超出畫面
    await p.page.locator('#numeric-item-0').click();
    await expect(p.page.getByTestId('keypad')).toBeVisible();
    const place = await p.page.evaluate(() => {
      const k = document.querySelector('#keypad')!.getBoundingClientRect();
      const boxes = [...document.querySelectorAll('#student-answer .numeric-input')].map((e) => e.getBoundingClientRect());
      const first = boxes[0];
      const covered = first.bottom > k.top + 1 && first.top < k.bottom - 1 && first.right > k.left && first.left < k.right;
      return { covered, below: k.top >= first.bottom - 1, beside: k.right <= first.left + 1, inside: k.top >= 0 && k.bottom <= innerHeight && k.left >= 0 && k.right <= innerWidth, h: first.height, gap: k.top - first.bottom };
    });
    expect(place.h, `${p.name}: first answer box visible`).toBeGreaterThan(30);
    expect(place.inside, `${p.name}: keypad inside the screen`).toBe(true);
    expect(place.below || place.beside, `${p.name}: keypad right below (or beside) the field ${JSON.stringify(place)}`).toBe(true);
    expect(place.covered, `${p.name}: keypad does not cover the field being typed`).toBe(false);
    await bigTargets(p.page, '.math-keys button', `${p.name} keypad`);
    await bigTargets(p.page, '.slide-nav > button, .answer-option, [data-testid="submit-answer"]', `${p.name} buttons`);
    // 頁碼點：高 44、寬至少 36（一排 13 頁也放得下）
    const dots = await p.page.locator('.slide-dots button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && (r.height < 44 || r.width < 35.5)).length);
    expect(dots, `${p.name}: slide dots too small`).toBe(0);
    const fs = await p.page.locator('#numeric-item-0').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(fs, `${p.name}: input font ≥16px (iOS 不會自動放大)`).toBeGreaterThanOrEqual(16);
    await shot(p.page, `${p.name}-numeric`);
  }

  // 例 4 的教材頁（步驟視覺化＋截圖）
  await go(5, false);
  for (const p of pads) {
    const tab = p.page.locator('.phone-tabs [data-tab="slide"]');
    if (await tab.isVisible()) await tab.click();
    await expect(p.page.locator('.room-progress span').first()).toHaveText('5');
    await fits(p.page, `${p.name} slide`);
    await shot(p.page, `${p.name}-slide`);
  }

  // 錯誤分析：手寫畫布
  await go(13);
  for (const p of pads) {
    const tab = p.page.locator('.phone-tabs [data-tab="answer"]');
    if (await tab.isVisible()) await tab.click();
    await p.page.getByTestId('open-sketch').click();
    await expect(p.page.getByTestId('sketch-canvas')).toBeVisible();
    await fits(p.page, `${p.name} canvas`);
    await bigTargets(p.page, '.sketch-tools .sk-tool', `${p.name} canvas tools`);
    await shot(p.page, `${p.name}-canvas`);
    await p.page.getByTestId('sketch-done').click();
  }
});
