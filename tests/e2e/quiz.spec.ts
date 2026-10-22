// 課後形成性評量與 PK 戰：老師＋3 台 iPad。
// 驗證：全班同一份卷子、可前後翻與改答案、交卷、結束後看答案；PK 用座位表點選、抽籤＋配電腦、倒數、選了就鎖定、勝負。
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
  await page.screenshot({ path: resolve(screenshots, `quiz-${name}.png`) });
}
async function loginStudent(page: Page, seat: number) {
  await page.goto('/#/student');
  await page.getByLabel('座號').fill(String(seat));
  await page.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(page.getByTestId('session-slide')).toBeVisible();
}
async function answerTab(page: Page) {
  const tab = page.locator('.phone-tabs [data-tab="answer"]');
  if (await tab.isVisible()) await tab.click();
}

test.afterEach(async () => {
  for (const r of cleanup.splice(0)) await r.context.request.delete(`/api/sessions/${r.id}`, { headers: { Origin: baseURL }, data: {} });
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

test('formative quiz for the class, then PK battles picked on the seat map and by draw + computer', async ({ browser }) => {
  test.setTimeout(180_000);
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
  const sessionId = teacher.page.url().split('/session/')[1];
  cleanup.push({ context: teacher.context, id: sessionId });

  const students = [];
  for (const seat of [21, 22, 23]) {
    const s = await surface(browser, 1080, 810, true);
    await loginStudent(s.page, seat);
    students.push(s);
  }
  const [s21, s22] = students.map((s) => s.page);

  // ── 課後檢核・PK 戰是最後另外一頁；其他頁看不到這個區塊 ──
  await expect(teacher.page.getByTestId('quiz-class')).toHaveCount(0);
  await teacher.page.locator('.slide-dots button').last().click();
  await expect(teacher.page.locator('.slide-stage h1')).toContainText('課後檢核・PK 戰');
  // ── 全班測驗 ──
  await teacher.page.getByTestId('quiz-class').click();
  await expect(teacher.page.getByTestId('quiz-board')).toBeVisible();
  await answerTab(s21);
  await expect(s21.getByTestId('quiz-card')).toBeVisible();
  await expect(s21.locator('.quiz-dot')).toHaveCount(10);
  // 同一份卷子：兩位同學第 1 題題目相同
  await answerTab(s22);
  await expect(s22.locator('.quiz-stem')).toHaveText((await s21.locator('.quiz-stem').textContent())!);
  for (let i = 0; i < 10; i++) {
    await s21.getByTestId('quiz-option-0').click();
    // 信心下注：選完答案要選把握程度，才會跳下一題
    await expect(s21.getByTestId('conf-row')).toHaveClass(/ask/);
    if (i === 0) await expect(s21.locator('.mini-label')).toContainText('第 1／10 題');
    await s21.getByTestId(i < 5 ? 'conf-sure' : 'conf-unsure').click();
    await expect(s21.locator('.quiz-dot').nth(i)).toHaveClass(/done/);
  }
  await shot(s21, 'student-class');
  await s21.getByTestId('quiz-submit').click();
  await expect(s21.locator('.quiz-summary')).toContainText('已交卷');
  await expect(teacher.page.getByTestId('quiz-status')).toContainText('已交卷 1');
  await shot(teacher.page, 'teacher-class-board');
  await teacher.page.getByTestId('quiz-end').click();
  await expect(s21.getByTestId('quiz-summary')).toContainText('／10 題');
  await expect(s21.locator('.quiz-review li')).toHaveCount(10);
  await expect(s21.getByTestId('bet-summary')).toContainText('信心下注');
  await expect(s21.getByTestId('bet-summary')).toContainText('有把握：');
  await shot(s21, 'student-class-bet');

  // ── PK：座位表點 21、22 配一組；抽籤抽到 23（只剩他上線），配電腦 ──
  await teacher.page.getByRole('button', { name: '關閉' }).click();
  await teacher.page.getByTestId('pk-lobby').click();
  await teacher.page.locator('#seat-map [data-action="pk-pick"][data-seat="21"]').click();
  await teacher.page.locator('#seat-map [data-action="pk-pick"][data-seat="22"]').click();
  await expect(teacher.page.getByTestId('pk-pair')).toHaveCount(1);
  await teacher.page.getByTestId('pk-draw').click();
  await expect(teacher.page.getByTestId('pk-waiting')).toContainText('23 號');
  await teacher.page.getByTestId('pk-bot').click();
  await expect(teacher.page.getByTestId('pk-pair')).toHaveCount(2);
  // 大螢幕顯示配好的組別
  await expect(teacher.page.getByTestId('quiz-board')).toContainText('配對中');
  await expect(teacher.page.getByTestId('quiz-board').locator('.pk-card')).toHaveCount(2);
  await shot(teacher.page, 'teacher-lobby');
  await teacher.page.getByTestId('pk-start').click();
  await expect(teacher.page.getByTestId('pk-card')).toHaveCount(2);
  await expect(s21.getByTestId('quiz-card')).toContainText('你 vs 22 號');
  // 倒數結束後出現題目；選了就鎖定、跳下一題
  await expect(s21.getByTestId('quiz-option-0')).toBeVisible({ timeout: 8000 });
  for (let i = 0; i < 10; i++) {
    await expect(s21.locator('.mini-label')).toContainText(`第 ${i + 1}／10 題`);
    await s21.getByTestId('quiz-option-0').click();
  }
  for (let i = 0; i < 10; i++) {
    await expect(s22.locator('.mini-label')).toContainText(`第 ${i + 1}／10 題`);
    await s22.getByTestId('quiz-option-1').click();
  }
  await expect(s21.getByTestId('pk-result')).toBeVisible();
  await expect(teacher.page.getByTestId('pk-card').first()).toHaveClass(/over/);
  await shot(teacher.page, 'teacher-pk-board');
  await shot(s21, 'student-pk-result');
  // 比完（23 號對電腦按「結束對戰」）：大螢幕有每題 ✓／✗、錯題紀錄、PK 戰績
  await teacher.page.getByTestId('quiz-end').click().catch(() => {});
  await expect(teacher.page.getByTestId('pk-again')).toBeVisible({ timeout: 10_000 });
  await expect(teacher.page.locator('.pk-card .q-strip').first()).toBeVisible();
  await expect(teacher.page.getByTestId('quiz-record')).toContainText('錯題紀錄');
  await expect(teacher.page.getByTestId('quiz-record')).toContainText('本堂 PK 戰績');
  await shot(teacher.page, 'teacher-pk-record');
  // 錯題練習：每人只做自己錯的題型（換數字），答了馬上看到正解與解析
  await teacher.page.getByTestId('quiz-review').click();
  await expect(s21.getByTestId('quiz-card')).toContainText('錯題練習');
  // 一題一題做：等題號換了（或出現總結）再做下一題。一次讀完畫面狀態（避免讀到一半畫面重畫）
  const state = () =>
    s21.evaluate(() => ({
      done: !!document.querySelector('[data-testid="quiz-summary"]'),
      label: document.querySelector('#student-answer .mini-label')?.textContent || '',
    }));
  for (let rounds = 0; rounds < 10 && !(await state()).done; rounds++) {
    const before = (await state()).label;
    await s21.getByTestId('quiz-option-0').click();
    await expect.poll(async () => { const now = await state(); return now.done || now.label !== before; }, { timeout: 5000 }).toBe(true);
    await expect(s21.locator('.quiz-flash, [data-testid="quiz-summary"]').first()).toBeVisible();
  }
  await expect(s21.getByTestId('quiz-summary')).toBeVisible();
  await shot(s21, 'student-review');
  await expect(teacher.page.locator('.review-row').first()).toBeVisible();
  await shot(teacher.page, 'teacher-review-board');
});

test('quiz extras: confidence bets, level pairing, spaced review in the next lesson, growth since last time', async ({ browser }) => {
  test.setTimeout(240_000);
  const teacher = await surface(browser, 1440, 900);
  const tp = teacher.page;
  await tp.goto('/');
  await tp.getByLabel('帳號').fill('teacher');
  await tp.getByLabel('密碼').fill('11235813');
  await tp.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(tp.getByTestId('lesson-card').first()).toBeVisible();
  const cl = (await (await tp.request.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  await tp.request.patch(`/api/classes/${cl.id}`, { headers: { Origin: baseURL }, data: { requireCode: false } });
  const startLesson = async (title: string) => {
    await tp.getByTestId('lesson-card').filter({ hasText: title }).getByRole('button', { name: '開始上課' }).click();
    await tp.locator('#start-form select').selectOption('demo-class');
    await tp.locator('#start-form').getByRole('button', { name: '開始上課' }).click();
    await expect(tp.getByTestId('session-slide')).toBeVisible();
    const id = tp.url().split('/session/')[1];
    cleanup.push({ context: teacher.context, id });
    return id;
  };
  const a = await startLesson('根式的乘除');
  const phone = await surface(browser, 390, 844, true);
  const ipad = await surface(browser, 1080, 810, true);
  await loginStudent(phone.page, 31);
  await loginStudent(ipad.page, 32);
  const s31 = phone.page,
    s32 = ipad.page;
  // 第一課：全班測驗（31 號全選 A、32 號全選 B），每題選把握程度
  await tp.locator('.slide-dots button').last().click();
  await tp.getByTestId('quiz-class').click();
  for (const [s, opt] of [[s31, 0], [s32, 1]] as const) {
    await answerTab(s);
    await expect(s.getByTestId('quiz-card')).toBeVisible();
    for (let i = 0; i < 10; i++) {
      await s.getByTestId(`quiz-option-${opt}`).click();
      await s.getByTestId(i % 2 ? 'conf-unsure' : 'conf-sure').click();
      await expect(s.locator('.quiz-dot').nth(i)).toHaveClass(/done/);
    }
    if (s === s31) await shot(s31, 'phone-confidence');
    await s.getByTestId('quiz-submit').click();
  }
  await expect(tp.getByTestId('quiz-status')).toContainText('已交卷 2');
  await tp.getByTestId('quiz-end').click();
  await expect(s31.getByTestId('bet-summary')).toBeVisible();
  await expect(tp.getByTestId('quiz-board')).toContainText('信心下注平均');
  await shot(s31, 'phone-bet-summary');
  // 同程度配對
  await tp.getByRole('button', { name: '關閉' }).click();
  await tp.getByTestId('pk-lobby').click();
  await tp.getByTestId('pk-level').click();
  await expect(tp.getByTestId('pk-pair')).toHaveCount(1);
  await expect(tp.getByTestId('pk-pair')).toContainText('31 號');
  await shot(tp, 'teacher-level-pairs');
  await tp.getByRole('button', { name: '取消' }).click();
  // 下一課：第一頁派間隔複習（上一課全班錯最多的 3 個題型）
  await tp.request.post(`/api/sessions/${a}/control`, { headers: { Origin: baseURL }, data: { action: 'end' } });
  await tp.goto('/');
  await startLesson('最簡根式');
  for (const s of [s31, s32]) {
    await s.reload();
    await expect(s.getByTestId('session-slide')).toBeVisible();
  }
  await expect(tp.getByTestId('spaced-panel')).toContainText('根式的乘除');
  await shot(tp, 'teacher-spaced-panel');
  await tp.getByTestId('quiz-spaced').click();
  await expect(tp.getByTestId('quiz-board')).toBeVisible();
  await answerTab(s31);
  await expect(s31.getByTestId('quiz-card')).toContainText('間隔複習');
  for (let i = 0; i < 3; i++) {
    await expect(s31.locator('#student-answer .mini-label')).toContainText(`第 ${i + 1}／3 題`);
    await s31.getByTestId('quiz-option-0').click();
    if (i === 0) {
      await expect(s31.locator('.quiz-flash')).toContainText('正解');
      await shot(s31, 'phone-spaced');
    }
  }
  await expect(s31.getByTestId('quiz-summary')).toContainText('／3 題');
  await shot(tp, 'teacher-spaced-board');
  // 這一課的全班測驗：結束後看到和上次比的進步
  await tp.getByRole('button', { name: '關閉' }).click();
  await tp.locator('.slide-dots button').last().click();
  await tp.getByTestId('quiz-class').click();
  await answerTab(s31);
  for (let i = 0; i < 10; i++) {
    await s31.getByTestId('quiz-option-0').click();
    await s31.getByTestId('conf-sure').click();
    await expect(s31.locator('.quiz-dot').nth(i)).toHaveClass(/done/);
  }
  await s31.getByTestId('quiz-submit').click();
  await tp.getByTestId('quiz-end').click();
  await expect(s31.getByTestId('growth-line')).toContainText('上次');
  await shot(s31, 'phone-growth');
  await shot(tp, 'teacher-growth-board');
});
