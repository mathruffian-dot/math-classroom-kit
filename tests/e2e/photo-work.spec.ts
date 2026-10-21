// 拍照作答：照片 → AI 辨識稿 → 學生核對修改 → 送出；老師端快速批改（依辨識稿）、投影講解。
// 示範模式沒有 AI：伺服器回傳 window.__mckWorkMock 當作辨識結果。
import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:8787';
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
  await page.screenshot({ path: resolve(screenshots, `photo-${name}.png`) });
}
/** 一張 240×160 的「紙本作答」測試照片（白底、幾條深色橫線）。 */
function paperPng() {
  const w = 240,
    h = 160;
  const rows: number[] = [];
  for (let y = 0; y < h; y++) {
    rows.push(0);
    for (let x = 0; x < w; x++) {
      const ink = (y % 40 > 18 && y % 40 < 22 && x > 20 && x < 200 - (y % 3) * 20) as unknown as boolean;
      rows.push(ink ? 40 : 250, ink ? 50 : 250, ink ? 90 : 245);
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    let c = 0xffffffff;
    for (const b of td) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE((c ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from(rows))), chunk('IEND', Buffer.alloc(0))]);
}

test.afterEach(async () => {
  for (const r of cleanup.splice(0)) await r.context.request.delete(`/api/sessions/${r.id}`, { headers: { Origin: baseURL }, data: {} });
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

test('photo work: AI transcript to confirm, fast grading on the text, projector wall', async ({ browser }) => {
  test.setTimeout(150_000);
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
  await teacher.page.locator('.slide-dots button').nth(9).click(); // 錯誤分析（手寫／拍照）
  await teacher.page.getByTestId('toggle-activity').click();

  const students = [];
  for (const seat of [14, 15]) {
    const s = await surface(browser, 820, 1180, true);
    await s.page.goto('/#/student');
    await s.page.getByLabel('座號').fill(String(seat));
    await s.page.locator('#login-form').getByRole('button', { name: '登入' }).click();
    await expect(s.page.getByTestId('session-slide')).toBeVisible();
    students.push(s);
  }
  for (const [i, s] of students.entries()) {
    const tab = s.page.locator('.phone-tabs [data-tab="answer"]');
    if (await tab.isVisible()) await tab.click();
    await s.page.evaluate((t) => ((window as unknown as { __mckWorkMock: string }).__mckWorkMock = t), i === 0 ? '2√3 × 3√2\n= 6√5' : '2√3 × 3√2\n= 6√6');
    await s.page.locator('[data-action-input="quick-photo"]').setInputFiles({ name: 'work.png', mimeType: 'image/png', buffer: paperPng() });
    await expect(s.page.getByTestId('photo-review')).toBeVisible();
    await expect(s.page.locator('#work-text')).toHaveValue(/= 6√/);
    await expect(s.page.locator('#work-preview .katex').first()).toBeVisible();
  }
  // 14 號發現 AI 讀成自己寫的錯誤答案，改成自己真正寫的訂正
  await students[0].page.locator('#work-text').fill('2√3 × 3√2\n= 6√6\n錯在根號內要相乘');
  await shot(students[0].page, 'student-review');
  for (const s of students) {
    await s.page.getByTestId('submit-photo-work').click();
    await expect(s.page.locator('.saved-answer')).toContainText('已送出');
  }

  // 老師端：作答牆有照片＋辨識稿、14 號標「改過辨識」；快速批改依辨識稿
  await expect(teacher.page.getByTestId('submission-grid').locator('.submission')).toHaveCount(2);
  await expect(teacher.page.getByTestId('submission-grid')).toContainText('改過辨識');
  await expect(teacher.page.getByTestId('toggle-fast')).toBeChecked();
  // 預設「收件後自動 AI 批改」：收到就開始快速批改（還沒開始的話按一下）
  if (await teacher.page.getByTestId('grade-all').isEnabled().catch(() => false)) await teacher.page.getByTestId('grade-all').click();
  await expect.poll(async () => {
    const v = await (await teacher.page.request.get(`/api/sessions/${sessionId}`)).json();
    return v.grades.map((g: { basis?: string }) => g.basis).sort();
  }).toEqual(['text', 'text']);
  await teacher.page.getByTestId('work-wall').click();
  await expect(teacher.page.getByTestId('wall-card')).toHaveCount(2);
  await shot(teacher.page, 'teacher-wall');
  await teacher.page.getByTestId('wall-card').first().click();
  await expect(teacher.page.getByTestId('wall-focus')).toBeVisible();
  await expect(teacher.page.getByTestId('wall-focus')).toContainText('14 號');
  // 批註圈在辨識稿上（不是照片上）
  await expect(teacher.page.getByTestId('wall-focus').getByTestId('mark-circle').first()).toBeVisible();
  await teacher.page.locator('#wall-anon').check();
  await expect(teacher.page.getByTestId('wall-focus')).not.toContainText('14 號');
  await shot(teacher.page, 'teacher-wall-focus');
  // 發回後，學生在自己的辨識稿上看到圈出的錯處
  await teacher.page.keyboard.press('Escape');
  await teacher.page.getByRole('button', { name: '發回批改' }).click();
  await expect(students[0].page.getByTestId('feedback-marks').getByTestId('mark-circle').first()).toBeVisible();
  await shot(students[0].page, 'student-feedback-marks');
});

test('numeric question: type the answer or photograph the textbook work; AI reads the answers and scores 0–3', async ({ browser }) => {
  test.setTimeout(150_000);
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
  await teacher.page.locator('.slide-dots button').nth(8).click(); // 例 3 隨堂（課本原題 2 題）
  await teacher.page.getByTestId('toggle-activity').click();

  const students = [];
  for (const seat of [16, 17]) {
    const s = await surface(browser, 820, 1180, true);
    await s.page.goto('/#/student');
    await s.page.getByLabel('座號').fill(String(seat));
    await s.page.locator('#login-form').getByRole('button', { name: '登入' }).click();
    await expect(s.page.getByTestId('session-slide')).toBeVisible();
    const tab = s.page.locator('.phone-tabs [data-tab="answer"]');
    if (await tab.isVisible()) await tab.click();
    students.push(s);
  }
  // 16 號：直接送答案（和原本一樣）
  const typed = students[0].page;
  await expect(typed.getByTestId('photo-alt')).toContainText('拍照交計算過程');
  await expect(typed.getByTestId('photo-alt')).toContainText('課本上這題');
  for (const [i, v] of ['√6', '√3'].entries()) await typed.locator(`#numeric-item-${i}`).fill(v);
  await typed.getByTestId('submit-answer').click();
  await expect(typed.locator('.saved-answer')).toContainText('已送出');
  // 17 號：拍課本上的計算過程 → 核對辨識稿 → 送出
  const photo = students[1].page;
  await photo.evaluate(() => ((window as unknown as { __mckWorkMock: string }).__mckWorkMock = '√48 ÷ √8 = √(48÷8) = √6\n(√6/√3) ÷ √(2/3) = √2 × √(3/2) = √3'));
  await photo.getByTestId('photo-alt-input').setInputFiles({ name: 'work.png', mimeType: 'image/png', buffer: paperPng() });
  await expect(photo.getByTestId('photo-review')).toBeVisible();
  await expect(photo.locator('#work-text')).toHaveValue(/√3/);
  await shot(photo, 'numeric-review');
  await photo.getByTestId('submit-photo-work').click();
  await expect(photo.locator('.saved-answer')).toContainText('已送出');

  // 老師端：拍照的那份列在批改格，自動快速批改；AI 讀出的答案由系統判對錯
  await expect(teacher.page.getByTestId('submission-grid').locator('.submission')).toHaveCount(1);
  if (await teacher.page.getByTestId('grade-all').isEnabled().catch(() => false)) await teacher.page.getByTestId('grade-all').click();
  await expect.poll(async () => {
    const v = await (await teacher.page.request.get(`/api/sessions/${sessionId}`)).json();
    const a = v.answers.find((x: { seat: number }) => x.seat === 17);
    return { graded: v.grades.length, basis: v.grades[0]?.basis, correct: a?.correct, items: a?.itemsCorrect };
  }).toEqual({ graded: 1, basis: 'text', correct: true, items: [true, true] });
  const v = await (await teacher.page.request.get(`/api/sessions/${sessionId}`)).json();
  expect(v.grades[0].finals).toEqual(['√6', '√3']);
  expect(v.answers.find((x: { seat: number }) => x.seat === 16).correct).toBe(true);
  // 老師畫面即時更新：兩種交法一起統計
  await expect(teacher.page.locator('.correct-rate strong')).toHaveText('2');
  await shot(teacher.page, 'numeric-teacher');
});
