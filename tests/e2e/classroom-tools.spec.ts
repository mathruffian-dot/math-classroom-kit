// 課堂工具：座位表（已作答／未作答／未上線）、只抽上線的學生、畫面正中間的大顆搶答鈕、放大的學生作答區。
// 老師＋3 位 iPad 學生，各自獨立的瀏覽器 context（真的即時連線）。
import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const screenshots = resolve('artifacts/screenshots');
const contexts: BrowserContext[] = [];
const cleanup: { context: BrowserContext; id: string }[] = [];

async function surface(browser: Browser, width: number, height: number, touch = true) {
  const context = await browser.newContext({ baseURL, viewport: { width, height }, hasTouch: touch, deviceScaleFactor: 1 });
  contexts.push(context);
  return { context, page: await context.newPage() };
}
async function shot(page: Page, name: string) {
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: resolve(screenshots, `tools-${name}.png`) });
}
const seat = (p: Page, n: number) => p.locator(`#seat-map .seat:text-is("${n}")`);

test.afterEach(async () => {
  for (const r of cleanup.splice(0)) await r.context.request.delete(`/api/sessions/${r.id}`, { headers: { Origin: baseURL }, data: {} });
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

test('seat map, online-only draw, centered buzz button and larger answer panel', async ({ browser }) => {
  test.setTimeout(180_000);
  const teacher = await surface(browser, 1440, 900, false);
  await teacher.page.goto('/');
  await teacher.page.getByLabel('帳號').fill('teacher');
  await teacher.page.getByLabel('密碼').fill('11235813');
  await teacher.page.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await teacher.page.getByTestId('lesson-card').filter({ hasText: '根式的乘除' }).getByRole('button', { name: '開始上課' }).click();
  await teacher.page.locator('#start-form select').selectOption('demo-class');
  await teacher.page.locator('#start-form').getByRole('button', { name: '開始上課' }).click();
  await expect(teacher.page.getByTestId('session-slide')).toBeVisible();
  cleanup.push({ context: teacher.context, id: teacher.page.url().split('/session/')[1] });

  // 三位 iPad 學生（橫向、直向、橫向）上線
  const students = [] as { n: number; page: Page; context: BrowserContext }[];
  for (const [n, w, h] of [[31, 1180, 820], [32, 820, 1180], [33, 1180, 820]] as const) {
    const s = await surface(browser, w, h);
    await s.page.goto('/#/student');
    await s.page.getByLabel('座號').fill(String(n));
    await s.page.locator('#login-form').getByRole('button', { name: '登入' }).click();
    await expect(s.page.getByTestId('session-slide')).toBeVisible();
    await expect(s.page.locator('#sync-status.live')).toBeVisible();
    students.push({ n, ...s });
  }
  // 1) 座位表：三人上線（橘框），其他未上線（灰）
  for (const s of students) await expect(seat(teacher.page, s.n)).toHaveClass(/\bon\b/);
  await expect(seat(teacher.page, 1)).toHaveClass(/\boff\b/);

  // 第 2 頁：提取練習（3 小題；第 1 頁是暖身）。開放作答，31、32 號交卷
  await teacher.page.locator('.slide-dots button').nth(1).click();
  await expect(teacher.page.locator('.room-progress span').first()).toHaveText('2');
  await teacher.page.getByTestId('toggle-activity').click();
  for (const s of students.slice(0, 2)) {
    const tab = s.page.locator('.phone-tabs [data-tab="answer"]');
    if (await tab.isVisible()) await tab.click();
    for (let i = 0; i < 3; i++) await s.page.locator(`#numeric-item-${i}`).fill('1');
    await s.page.getByTestId('submit-answer').click();
  }
  await expect(seat(teacher.page, 31)).toHaveClass(/\bdone\b/);
  await expect(seat(teacher.page, 32)).toHaveClass(/\bdone\b/);
  await expect(seat(teacher.page, 33)).toHaveClass(/\bon\b/);
  await expect(teacher.page.locator('.seat-waiting')).toContainText('33');
  await expect(teacher.page.getByTestId('seat-map')).toContainText('已作答 2');
  await shot(teacher.page, 'teacher-seat-map');

  // 4) 放大的作答區：33 號（iPad 橫向）作答中，作答區至少 380px 寬，答案框夠高、字夠大
  const box = await students[2].page.locator('.panel-col').boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(380);
  const input = students[2].page.locator('#numeric-item-0');
  expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(50);
  expect(await input.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(22);
  await shot(students[2].page, 'ipad-landscape-answering');

  // 3) 33 號離線（關掉 iPad）→ 座位表變灰；抽籤只抽 31、32
  await students[2].context.close();
  await expect(seat(teacher.page, 33)).toHaveClass(/\boff\b/, { timeout: 15_000 });
  const drawn = new Set<number>();
  for (let i = 0; i < 6; i++) {
    await teacher.page.getByTestId('draw-seat').click();
    await expect(teacher.page.locator('.draw-result strong')).toBeVisible();
    drawn.add(Number((await teacher.page.locator('.draw-result strong').textContent())!.replace(/\D/g, '')));
  }
  expect([...drawn].sort()).toEqual([31, 32]);

  // 2) 搶答：學生畫面正中間的大顆圓形按鈕
  await teacher.page.getByTestId('buzz-open').click();
  const s31 = students[0].page;
  const big = s31.getByTestId('buzz-button');
  await expect(big).toBeVisible();
  const b = (await big.boundingBox())!,
    vp = s31.viewportSize()!;
  expect(Math.abs(b.x + b.width / 2 - vp.width / 2)).toBeLessThan(4); // 水平置中
  expect(Math.abs(b.y + b.height / 2 - vp.height / 2)).toBeLessThan(4); // 垂直置中
  expect(b.width).toBeGreaterThanOrEqual(Math.min(0.7 * Math.min(vp.width, vp.height), 580)); // 大顆：短邊的 70% 以上
  expect(Math.abs(b.width - b.height)).toBeLessThan(2); // 圓形
  expect(await big.evaluate((e) => getComputedStyle(e).borderRadius)).toBe('50%');
  await shot(s31, 'ipad-buzz');
  await big.tap({ force: true }); // 按鈕有呼吸動畫，Playwright 視為「不穩定」；真人點按沒問題
  await expect(s31.getByTestId('buzz-result')).toContainText('你搶到了');
  await expect(students[1].page.getByTestId('buzz-result')).toContainText('31');
  await expect(teacher.page.getByTestId('buzz-result')).toContainText('31');
  await shot(teacher.page, 'teacher-buzz-result');
  await teacher.page.getByTestId('buzz-result').getByRole('button', { name: '重設搶答' }).click();
  await expect(s31.getByTestId('buzz-result')).toHaveCount(0);
});
