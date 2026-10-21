// 魔王戰：老師在 2-2(4) 最後一頁開戰，3 位同學選角色、各自選題型作答（答對、答錯鎖 5 秒），
// 大螢幕顯示戰況（大招／防護罩寫出是哪些座號），結束後列出每個人的稱號。
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:8787';
const screenshots = resolve('artifacts/screenshots');
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

type Item = { id: string; options: string[]; answer: number };
async function bankAnswers() {
  const bank = JSON.parse(await readFile('content/raids/g8-2-2d.json', 'utf8')) as { pools: Record<string, Item[]> };
  return new Map(Object.values(bank.pools).flat().map((x) => [x.id, x.options[x.answer]]));
}
/** 依學生畫面上的題目（從 API 拿題目 ID 與選項順序）找出正確／錯誤選項的位置。 */
async function pick(page: Page, sessionId: string, answers: Map<string, string>, right: boolean) {
  const view = await (await page.request.get(`/api/sessions/${sessionId}`)).json();
  const q = view.raid.mine.question as { id: string; options: string[] };
  const k = q.options.indexOf(answers.get(q.id)!);
  expect(k).toBeGreaterThanOrEqual(0);
  return right ? k : (k + 1) % q.options.length;
}

test('raid: the class fights the boss together, shields and ultimates name the seats, titles at the end', async ({ browser }) => {
  test.setTimeout(180_000);
  await mkdir(screenshots, { recursive: true });
  const answers = await bankAnswers();
  const teacher = await surface(browser, 1440, 900);
  const tp = teacher.page;
  await tp.goto('/');
  await tp.getByLabel('帳號').fill('teacher');
  await tp.getByLabel('密碼').fill('11235813');
  await tp.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(tp.getByTestId('lesson-card').first()).toBeVisible();
  const cl = (await (await tp.request.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  await tp.request.patch(`/api/classes/${cl.id}`, { headers: { Origin: baseURL }, data: { requireCode: false } });
  await tp.getByTestId('lesson-card').filter({ hasText: '乘法公式與根式' }).getByRole('button', { name: '開始上課' }).click();
  await tp.locator('#start-form select').selectOption('demo-class');
  await tp.locator('#start-form').getByRole('button', { name: '開始上課' }).click();
  await expect(tp.getByTestId('session-slide')).toBeVisible();
  const sessionId = tp.url().split('/session/')[1];
  cleanup.push({ context: teacher.context, id: sessionId });

  const students: Page[] = [];
  for (const [seat, w, h] of [
    [11, 390, 844],
    [12, 1080, 810],
    [13, 1080, 810],
  ] as const) {
    const s = await surface(browser, w, h, true);
    await s.page.goto('/#/student');
    await s.page.getByLabel('座號').fill(String(seat));
    await s.page.locator('#login-form').getByRole('button', { name: '登入' }).click();
    await expect(s.page.getByTestId('session-slide')).toBeVisible();
    students.push(s.page);
  }
  const [s11, s12, s13] = students;

  // 魔王戰在最後一頁（課後檢核・PK 戰之後）
  await tp.locator('.slide-dots button').last().click();
  await expect(tp.getByTestId('raid-start')).toBeVisible();
  await expect(tp.getByTestId('quiz-class')).toHaveCount(0);
  await tp.locator('#raid-difficulty').selectOption('easy');
  await tp.locator('#raid-seconds').selectOption('300');
  await tp.getByTestId('raid-start').click();
  await expect(tp.getByTestId('raid-board')).toBeVisible();

  // 選角色（倒數中就可以選）
  const roles = ['knight', 'mage', 'archer'];
  for (const [i, s] of students.entries()) {
    const tab = s.locator('.phone-tabs [data-tab="answer"]');
    if (await tab.isVisible()) await tab.click();
    await s.getByTestId(`raid-role-${roles[i]}`).click();
  }
  await s11.screenshot({ path: resolve(screenshots, 'raid-student-countdown.png') });
  await expect(s11.getByTestId('raid-kind-attack')).toBeVisible({ timeout: 8000 });

  // 12 號、13 號做應用題（大招），11 號做防護罩題 → 防護罩與大招都寫出座號
  for (let round = 0; round < 2; round++) {
    for (const s of [s12, s13]) {
      await s.getByTestId('raid-kind-ultimate').click();
      await expect(s.getByTestId('raid-option-0')).toBeVisible();
      await s.getByTestId(`raid-option-${await pick(s, sessionId, answers, true)}`).click();
      await expect(s.getByTestId('raid-flash')).toContainText('答對');
    }
  }
  await expect(tp.locator('#rb-feed')).toContainText('大招', { timeout: 5000 });
  await expect(tp.locator('#rb-feed')).toContainText('12、13 號共同發動');
  await s11.getByTestId('raid-kind-shield').click();
  await s11.getByTestId(`raid-option-${await pick(s11, sessionId, answers, true)}`).click();
  await expect(tp.locator('#rb-shield-info')).toContainText('11 號提供');
  await tp.screenshot({ path: resolve(screenshots, 'raid-board.png') });

  // 普通攻擊：答對扣魔王血；答錯鎖住
  await s11.getByTestId('raid-kind-attack').click();
  await s11.getByTestId(`raid-option-${await pick(s11, sessionId, answers, true)}`).click();
  await expect(tp.locator('#rb-feed')).toContainText('11 號劍士 攻擊');
  await s12.getByTestId('raid-kind-attack').click();
  await s12.getByTestId(`raid-option-${await pick(s12, sessionId, answers, false)}`).click();
  await expect(s12.getByTestId('raid-lock')).toBeVisible();
  // 鎖住時伺服器也不給抽題
  const locked = await s12.request.post(`/api/sessions/${sessionId}/raid`, { headers: { Origin: baseURL }, data: { runId: (await (await s12.request.get(`/api/sessions/${sessionId}`)).json()).raid.run.id, op: 'draw', kind: 'attack' } });
  expect(locked.status()).toBe(409);
  await s11.getByTestId('raid-kind-shield').click();
  await expect(s11.locator('.quiz-stem')).toBeVisible();
  await s11.screenshot({ path: resolve(screenshots, 'raid-student-phone.png') });
  await s12.screenshot({ path: resolve(screenshots, 'raid-student-lock.png') });
  // 學生拿不到別人的成績
  const sv = await (await s13.request.get(`/api/sessions/${sessionId}`)).json();
  expect(Object.keys(sv.raid.state.stats)).toEqual(['13']);
  // 學生平板也顯示戰場（同一套戰況與動畫）
  await expect(s13.getByTestId('raid-board')).toBeVisible();
  await expect(s13.locator('#rb-feed')).toContainText('大招');
  await s13.screenshot({ path: resolve(screenshots, 'raid-student-ipad.png') });

  // 結束：大螢幕列出稱號；學生看到自己的
  await tp.getByTestId('raid-end').click();
  await expect(tp.getByTestId('raid-result')).toBeVisible();
  await expect(tp.locator('.raid-table tbody tr')).toHaveCount(3);
  await expect(tp.locator('.raid-table')).toContainText('12 號');
  await tp.screenshot({ path: resolve(screenshots, 'raid-result.png') });
  await expect(s13.getByTestId('raid-my-result')).toContainText('你的稱號');
  await s13.screenshot({ path: resolve(screenshots, 'raid-student-result.png') });
});
