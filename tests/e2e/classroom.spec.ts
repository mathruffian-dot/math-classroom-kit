import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:8787';
const screenshots = resolve('artifacts/screenshots');
const contexts: BrowserContext[] = [];
const cleanup: { context: BrowserContext; id: string }[] = [];
const LESSON_FILE = 'content/lessons/g8-1-1-sum-square.json';

async function surface(browser: Browser, width = 1440, height = 900, touch = false) {
  const context = await browser.newContext({ baseURL, viewport: { width, height }, hasTouch: touch, deviceScaleFactor: 1 });
  contexts.push(context);
  return { context, page: await context.newPage() };
}
async function loginTeacher(page: Page) {
  await page.goto('/');
  await page.getByLabel('帳號').fill('teacher');
  await page.getByLabel('密碼').fill('11235813');
  await page.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(page.getByTestId('lesson-card').first()).toBeVisible();
  // 重複使用的本機 Wrangler 可能保留舊版範例；只刷新本專案的範例課程。
  const sample = JSON.parse(await readFile(resolve(LESSON_FILE), 'utf8'));
  const refreshed = await page.request.put(`/api/lessons/${sample.id}`, { headers: { Origin: baseURL }, data: { lesson: sample } });
  expect(refreshed.ok(), await refreshed.text()).toBeTruthy();
  await page.reload();
}
async function start(page: Page, context: BrowserContext, title = '和的平方公式') {
  await page.getByTestId('lesson-card').filter({ hasText: title }).getByRole('button', { name: '開始上課' }).click();
  await page.locator('#start-form select').selectOption('demo-class');
  await page.locator('#start-form').getByRole('button', { name: '開始上課' }).click();
  await expect(page.getByTestId('session-slide')).toBeVisible();
  const id = page.url().split('/session/')[1];
  cleanup.push({ context, id });
  return id;
}
async function loginStudent(page: Page, seat: number) {
  await page.goto('/#/student');
  await page.getByLabel('座號').fill(String(seat));
  await page.getByLabel('識別碼').fill(`DEMO${String(seat).padStart(2, '0')}`);
  await page.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(page.getByTestId('session-slide')).toBeVisible();
}
async function goSlide(page: Page, n: number) {
  await page.locator(`.slide-dots button`).nth(n - 1).click();
  await expect(page.locator('.room-progress span').first()).toHaveText(String(n));
}
async function openActivity(page: Page) {
  await page.getByTestId('toggle-activity').click();
  await expect(page.getByRole('button', { name: '結束作答' })).toBeVisible();
}
/** 一個頁面在全螢幕內完成：不得出現頁面捲動或水平溢位。 */
async function fitsViewport(page: Page) {
  const size = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth,
    h: document.documentElement.scrollHeight,
    vw: innerWidth,
    vh: innerHeight,
  }));
  expect(size.w, 'no horizontal overflow').toBeLessThanOrEqual(size.vw + 1);
  expect(size.h, 'no page scroll').toBeLessThanOrEqual(size.vh + 1);
}
async function shot(page: Page, name: string) {
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: resolve(screenshots, name) });
}
async function answerPanel(page: Page) {
  // 手機版作答區在「作答」分頁。
  const tab = page.locator('.phone-tabs [data-tab="answer"]');
  if (await tab.isVisible()) {
    await tab.click();
    await expect(page.locator('.panel-col')).toBeVisible();
  }
}
test.afterEach(async () => {
  for (const r of cleanup.splice(0))
    await r.context.request.delete(`/api/sessions/${r.id}`, { headers: { Origin: baseURL }, data: {} });
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

test('teacher and students complete numeric, manipulate and handwritten answers with grading and release', async ({ browser }) => {
  test.setTimeout(120_000);
  const teacher = await surface(browser, 1440, 900);
  await loginTeacher(teacher.page);
  await fitsViewport(teacher.page);
  await shot(teacher.page, 'teacher-dashboard.png');
  await start(teacher.page, teacher.context);
  await fitsViewport(teacher.page);
  await shot(teacher.page, 'teacher-slide1.png');

  const ipad = await surface(browser, 1024, 768, true);
  await loginStudent(ipad.page, 1);
  const phone = await surface(browser, 390, 844, true);
  await loginStudent(phone.page, 2);
  await fitsViewport(ipad.page);
  await fitsViewport(phone.page);

  // 即時連線：學生不再每 2 秒輪詢；老師翻頁後由伺服器推送。
  await expect(ipad.page.locator('#sync-status.live')).toBeVisible();
  await expect(teacher.page.locator('#sync-status.live')).toBeVisible();
  const polls: string[] = [];
  ipad.page.on('request', (r) => {
    if (/\/api\/(student\/session|sessions\/[\w-]+)$/.test(new URL(r.url()).pathname)) polls.push(r.url());
  });
  await goSlide(teacher.page, 2);
  await expect(ipad.page.locator('.room-progress span').first()).toHaveText('2');
  await ipad.page.waitForTimeout(5000);
  expect(polls.length, 'student should get slide changes by push, not polling').toBe(0);

  // 操作題：拖滑桿到 a=6、b=2 後送出。
  await goSlide(teacher.page, 3);
  await openActivity(teacher.page);
  await expect(ipad.page.getByRole('button', { name: '送出我的操作' })).toBeEnabled();
  await ipad.page.locator('input[data-param="a"]').fill('6');
  await ipad.page.locator('input[data-param="b"]').fill('2');
  await expect(ipad.page.locator('#manip-vars')).toContainText('a = 6');
  await ipad.page.getByRole('button', { name: '送出我的操作' }).click();
  await expect(ipad.page.locator('.saved-answer')).toBeVisible();
  await answerPanel(phone.page);
  await phone.page.getByRole('button', { name: '送出我的操作' }).click();
  await expect(teacher.page.locator('#answer-count')).toHaveText(/^2 \//);
  await expect(teacher.page.locator('.correct-rate strong')).toHaveText('1');
  await shot(ipad.page, 'ipad-manipulate.png');

  // 步驟聚焦：第 4 頁按下一步後，目前步驟發光、其他反暗。
  await goSlide(teacher.page, 4);
  await teacher.page.locator('[data-viz="next"]').click();
  await expect.poll(() => teacher.page.locator('.viz-focus').count()).toBeGreaterThan(0);
  expect(await teacher.page.locator('.viz-dim').count()).toBeGreaterThan(0);

  // 數值題：分數、算式都接受，伺服器判定對錯；抽「答對」只會抽到答對的人。
  await goSlide(teacher.page, 5);
  await openActivity(teacher.page);
  await answerPanel(phone.page);
  await phone.page.locator('#numeric-answer').fill('1681');
  await phone.page.getByTestId('submit-answer').click();
  await ipad.page.locator('#numeric-answer').fill('1600+1');
  await ipad.page.getByTestId('submit-answer').click();
  await expect(teacher.page.locator('#answer-count')).toHaveText(/^2 \//);
  await teacher.page.locator('[data-action="draw-filter"][data-filter="correct"]').click();
  await teacher.page.getByTestId('draw-seat').click();
  await expect(teacher.page.locator('.draw-result strong')).toContainText('2');
  await expect(teacher.page.locator('.draw-result small')).toContainText('答對');
  await teacher.page.getByRole('button', { name: '公布結果' }).click();
  await expect(phone.page.locator('.verdict.ok')).toBeVisible();
  await fitsViewport(phone.page);
  await shot(phone.page, 'phone-numeric-result.png');

  // 手寫題：在畫布上寫字後送出；教師 AI 批改（無金鑰時為模擬）、改分、發回。
  await goSlide(teacher.page, 7);
  await openActivity(teacher.page);
  await ipad.page.getByTestId('open-sketch').click();
  const canvas = ipad.page.getByTestId('sketch-canvas');
  const box = (await canvas.boundingBox())!;
  await ipad.page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await ipad.page.mouse.down();
  for (let i = 1; i <= 12; i++) await ipad.page.mouse.move(box.x + box.width * (0.2 + i * 0.04), box.y + box.height * (0.3 + (i % 2) * 0.05));
  await ipad.page.mouse.up();
  await ipad.page.locator('[data-sk="text"]').fill('小明漏了 12x');
  await shot(ipad.page, 'ipad-sketch.png');
  await ipad.page.getByTestId('sketch-done').click();
  await expect(ipad.page.locator('.canvas-launch img')).toBeVisible();
  await ipad.page.getByTestId('submit-answer').click();
  await expect(ipad.page.locator('.saved-answer .answer-thumb')).toBeVisible();
  await expect(teacher.page.getByTestId('submission-grid').locator('.submission')).toHaveCount(1);
  // 第 1 層（預設）：只判斷對錯。
  await expect(teacher.page.getByTestId('grade-all')).toContainText('AI 判斷對錯');
  // 預設「收件後自動 AI 批改」：多半已經開始批改；還沒開始就按一下
  if (await teacher.page.getByTestId('grade-all').isEnabled().catch(() => false)) await teacher.page.getByTestId('grade-all').click();
  await expect(teacher.page.locator('.submission .st.wrong')).toBeVisible({ timeout: 15_000 });
  await teacher.page.locator('.submission').first().click();
  await expect(teacher.page.locator('#grade-form')).toBeVisible();
  await expect(teacher.page.locator('.layer2')).not.toHaveAttribute('open', '');
  await teacher.page.locator('#grade-form textarea[name="feedback"]').fill('找到錯誤了，很好！');
  await teacher.page.getByTestId('judge-right').click();
  await expect(teacher.page.locator('.submission .st.right')).toBeVisible();
  await teacher.page.getByRole('button', { name: '發回批改' }).click();
  await expect(ipad.page.getByTestId('student-feedback')).toContainText('✓ 正確', { timeout: 10_000 });
  await expect(ipad.page.locator('.feedback-card svg.redpen')).toBeVisible();
  // 第 2 層：開啟紅筆批改後依規準給分。
  await teacher.page.getByTestId('toggle-redpen').check({ force: true });
  await teacher.page.locator('.submission').first().click();
  await expect(teacher.page.locator('.layer2')).toHaveAttribute('open', '');
  await expect(teacher.page.locator('.redpen-host svg.redpen')).toBeVisible();
  for (const [criterion, score] of [['find', 2], ['expand', 3], ['model', 2]] as const)
    await teacher.page.locator(`input[name="c-${criterion}"][value="${score}"]`).check({ force: true });
  await teacher.page.locator('#grade-form textarea[name="feedback"]').fill('找到錯誤了，面積圖再標上 6x。');
  await shot(teacher.page, 'teacher-grading.png');
  await teacher.page.locator('#grade-form button[value="release"]').click();
  await expect(ipad.page.getByTestId('student-feedback')).toContainText('7', { timeout: 10_000 });
  await expect(ipad.page.getByTestId('student-feedback')).toContainText('面積圖再標上 6x');
  await expect(ipad.page.locator('.feedback-card svg.redpen')).toBeVisible();
  await shot(ipad.page, 'ipad-feedback.png');
  await answerPanel(phone.page);
  await expect(phone.page.getByTestId('student-feedback')).toHaveCount(0);
  await fitsViewport(teacher.page);
  await fitsViewport(ipad.page);
});

for (const [lessonTitle, tag] of [
  ['和的平方公式', 'g8-1-1'],
  ['2-2 根式的運算（1）', 'g8-2-2a'],
  ['2-2 根式的運算（2）', 'g8-2-2b'],
  ['2-2 根式的運算（3）', 'g8-2-2c'],
  ['2-2 根式的運算（4）', 'g8-2-2d'],
  ['1-4 相似三角形的應用（1）', 'g9-1-4a'],
  ['1-4 相似三角形的應用（2）', 'g9-1-4b'],
  ['1-4 相似三角形的應用（3）', 'g9-1-4c'],
] as const)
test(`every page of ${tag} fits one screen on projector, iPad and phone`, async ({ browser }) => {
  test.setTimeout(150_000);
  const teacher = await surface(browser, 1920, 1080);
  await loginTeacher(teacher.page);
  await start(teacher.page, teacher.context, lessonTitle);
  const pages = await teacher.page.locator('.slide-dots button').count();
  const ipad = await surface(browser, 820, 1180, true);
  await loginStudent(ipad.page, 3);
  const phone = await surface(browser, 375, 667, true);
  await loginStudent(phone.page, 4);
  for (let n = 1; n <= pages; n++) {
    await goSlide(teacher.page, n);
    for (const p of [teacher.page, ipad.page, phone.page]) {
      await expect(p.locator('.room-progress span').first()).toHaveText(String(n));
      await fitsViewport(p);
      const visual = p.locator('.slide-visual');
      if (await visual.count()) {
        const b = await visual.boundingBox();
        expect(b && b.height, `page ${n}: visual area must keep usable height`).toBeGreaterThan(p === phone.page ? 120 : 180);
      }
    }
    if (n === 3 || n === 7) {
      await shot(teacher.page, `${tag}-projector-p${n}.png`);
      await shot(ipad.page, `${tag}-ipad-portrait-p${n}.png`);
      await shot(phone.page, `${tag}-phone-p${n}.png`);
    }
    // 課本截圖要能載入（只給登入者）。
    for (const img of await teacher.page.locator('.textbook-fig img').all())
      expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), `page ${n}: textbook crop loads`).toBe(true);
  }
});

test('teacher edits a lesson with live preview, sees AI drafts labelled, and settings never echo the API key', async ({ browser }) => {
  const teacher = await surface(browser, 1440, 900);
  await loginTeacher(teacher.page);
  await teacher.page.getByTestId('lesson-card').filter({ hasText: '和的平方公式' }).getByRole('button', { name: '編輯' }).click();
  await expect(teacher.page.locator('#preview-stage .viz')).toBeVisible();
  await teacher.page.locator('#preview-slide').selectOption('6');
  await expect(teacher.page.locator('#preview-stage h1')).toContainText('小明');
  await teacher.page.goto('/#/settings');
  await expect(teacher.page.locator('#ai-form select[name="provider"]')).toHaveValue('openai');
  await expect(teacher.page.locator('#ai-form input[name="model"]')).toHaveValue('gpt-6-luna');
  const key = 'sk-test-e2e-not-real-WXYZ9876';
  await teacher.page.locator('#ai-form input[name="apiKey"]').fill(key);
  await teacher.page.locator('#ai-form button[type="submit"]').click();
  await expect(teacher.page.locator('#ai-form input[name="apiKey"]')).toHaveAttribute('placeholder', /9876/);
  expect(await teacher.page.content()).not.toContain(key);
  const settings = await teacher.page.request.get('/api/settings/ai');
  expect(await settings.text()).not.toContain(key);
  await teacher.page.getByRole('button', { name: '移除金鑰' }).click();
  await expect(teacher.page.locator('.setting-status')).toContainText('尚未設定');
});
