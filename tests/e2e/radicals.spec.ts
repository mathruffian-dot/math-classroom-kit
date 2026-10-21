// 模擬一堂 2-2 根式（1）：老師＋3 位學生（桌機、iPad、手機），各自獨立的瀏覽器 context。
// 驗證：學生只用班級代碼＋座號登入（識別碼預設停用）、動畫在「公布結果」前鎖住、
// 步驟化視覺化、課本截圖放大後工具照常可用、個人識別碼開關。
import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
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
async function shot(page: Page, name: string) {
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: resolve(screenshots, `radicals-${name}.png`) });
}
async function loginTeacher(page: Page) {
  await page.goto('/');
  await page.getByLabel('帳號').fill('teacher');
  await page.getByLabel('密碼').fill('11235813');
  await page.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(page.getByTestId('lesson-card').first()).toBeVisible();
}
async function setRequireCode(page: Page, on: boolean) {
  const r = await page.request.get('/api/dashboard');
  const cl = (await r.json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  const res = await page.request.patch(`/api/classes/${cl.id}`, { headers: { Origin: baseURL }, data: { requireCode: on } });
  expect(res.ok(), await res.text()).toBeTruthy();
}
/** 學生登入：預設只填班級代碼與座號（識別碼留空）。 */
async function loginStudent(page: Page, seat: number, code = '') {
  await page.goto('/#/student');
  await page.getByLabel('座號').fill(String(seat));
  await page.getByLabel('識別碼').fill(code);
  await page.locator('#login-form').getByRole('button', { name: '登入' }).click();
}
async function goSlide(page: Page, n: number) {
  await page.locator('.slide-dots button').nth(n - 1).click();
  await expect(page.locator('.room-progress span').first()).toHaveText(String(n));
}
async function slideTab(page: Page) {
  const tab = page.locator('.phone-tabs [data-tab="slide"]');
  if (await tab.isVisible()) await tab.click();
}
async function answerTab(page: Page) {
  const tab = page.locator('.phone-tabs [data-tab="answer"]');
  if (await tab.isVisible()) await tab.click();
}

test.afterEach(async () => {
  for (const r of cleanup.splice(0)) await r.context.request.delete(`/api/sessions/${r.id}`, { headers: { Origin: baseURL }, data: {} });
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

test('phone keypad: √ and fraction keys type textbook answers without the system keyboard', async ({ browser }) => {
  test.setTimeout(120_000);
  const teacher = await surface(browser, 1440, 900);
  await loginTeacher(teacher.page);
  await setRequireCode(teacher.page, false);
  await teacher.page.getByTestId('lesson-card').filter({ hasText: '最簡根式' }).getByRole('button', { name: '開始上課' }).click();
  await teacher.page.locator('#start-form select').selectOption('demo-class');
  await teacher.page.locator('#start-form').getByRole('button', { name: '開始上課' }).click();
  await expect(teacher.page.getByTestId('session-slide')).toBeVisible();
  const sessionId = teacher.page.url().split('/session/')[1];
  cleanup.push({ context: teacher.context, id: sessionId });
  await goSlide(teacher.page, 8); // 例 5：4/(3√5)、√(7/18)、√0.7
  await teacher.page.getByTestId('toggle-activity').click();

  const phone = await surface(browser, 390, 844, true);
  await loginStudent(phone.page, 8);
  await expect(phone.page.getByTestId('session-slide')).toBeVisible();
  await answerTab(phone.page);
  const tap = async (...keys: string[]) => {
    for (const k of keys) await phone.page.locator(`.math-keys [data-key="${k}"]`).tap();
  };
  // 觸控裝置不跳出系統鍵盤
  await expect(phone.page.locator('#numeric-item-0')).toHaveAttribute('inputmode', 'none');
  // (1) 4√5/15：4 √ 5 分數 1 5 —— 打完 5 按「分數」自動跳出根號
  await phone.page.locator('#numeric-item-0').tap();
  await tap('4', '√', '5', 'frac', '1', '5');
  await expect(phone.page.locator('#numeric-item-0')).toHaveValue('4√(5)/(15)');
  await expect(phone.page.locator('[data-preview="numeric-item-0"] .katex')).toBeVisible();
  // (2) √14/6：先按分數，分子打 √14，按 ▶ 兩次到分母
  await phone.page.getByTestId('keypad-next').tap(); // 用鍵盤上的「下一格」換格
  await tap('frac', '√', '1', '4', 'right', 'right', '6');
  await expect(phone.page.locator('#numeric-item-1')).toHaveValue('(√(14))/(6)');
  // ⌫ 一次刪掉空的 √( )
  await phone.page.getByTestId('keypad-next').tap(); // 用鍵盤上的「下一格」換格
  await tap('√', 'back');
  await expect(phone.page.locator('#numeric-item-2')).toHaveValue('');
  // (3) √70/10
  await tap('√', '7', '0', 'frac', '1', '0');
  await shot(phone.page, 'phone-keypad');
  await phone.page.getByTestId('submit-answer').tap();
  await expect
    .poll(async () => {
      const v = await (await teacher.page.request.get(`/api/sessions/${sessionId}`)).json();
      return v.answers.find((x: { seat: number }) => x.seat === 8)?.itemsCorrect;
    })
    .toEqual([true, true, true]);
});

test('negative fraction typed fraction-key-first is correct; teacher chips show (1)(2)(3) and seat map counts it at once', async ({ browser }) => {
  test.setTimeout(120_000);
  const teacher = await surface(browser, 1440, 900);
  await loginTeacher(teacher.page);
  await setRequireCode(teacher.page, false);
  await teacher.page.getByTestId('lesson-card').filter({ hasText: '根式的乘除' }).getByRole('button', { name: '開始上課' }).click();
  await teacher.page.locator('#start-form select').selectOption('demo-class');
  await teacher.page.locator('#start-form').getByRole('button', { name: '開始上課' }).click();
  await expect(teacher.page.getByTestId('session-slide')).toBeVisible();
  const sessionId = teacher.page.url().split('/session/')[1];
  cleanup.push({ context: teacher.context, id: sessionId });
  await goSlide(teacher.page, 2); // 課本 p.73 隨堂：−10√3、8√2、−2√2/3
  await teacher.page.getByTestId('toggle-activity').click();

  const ipad = await surface(browser, 820, 1180, true);
  await loginStudent(ipad.page, 1);
  await expect(ipad.page.getByTestId('session-slide')).toBeVisible();
  await answerTab(ipad.page);
  const tap = async (...keys: string[]) => {
    for (const k of keys) await ipad.page.locator(`.math-keys [data-key="${k}"]`).tap();
  };
  await ipad.page.locator('#numeric-item-0').tap();
  await tap('-', '1', '0', '√', '3');
  await ipad.page.getByTestId('keypad-next').tap(); // 用鍵盤上的「下一格」換格
  await tap('8', '√', '2');
  // 先按「分數」，分子打 −2，▶ 到分母打 3，▶ 跳出，再 √2
  await ipad.page.getByTestId('keypad-next').tap(); // 用鍵盤上的「下一格」換格
  await tap('frac', '-', '2', 'right', '3', 'right', '√', '2');
  await expect(ipad.page.locator('#numeric-item-2')).toHaveValue('(-2)/(3)√(2)');
  await ipad.page.getByTestId('submit-answer').tap();
  await expect(ipad.page.locator('.saved-answer')).toContainText('已送出');

  // 老師端（不重新整理）：座位表馬上算到、個別作答逐題 ✓
  await expect(teacher.page.locator('#seat-map')).toContainText('已作答 1');
  await expect
    .poll(async () => {
      const v = await (await teacher.page.request.get(`/api/sessions/${sessionId}`)).json();
      return v.answers.find((x: { seat: number }) => x.seat === 1)?.itemsCorrect;
    })
    .toEqual([true, true, true]);
  // 個別作答預設收起（投影時不讓同學看到答案），老師點開才看
  await expect(teacher.page.getByTestId('answer-list')).not.toHaveAttribute('open', '');
  await teacher.page.getByTestId('answer-list').locator('summary').click();
  await expect(teacher.page.getByTestId('answer-list')).toHaveAttribute('open', '');
  const chip = teacher.page.locator('.seat-chip').first();
  await expect(chip).toHaveClass(/ok/);
  await expect(chip.locator('.chip-item')).toHaveCount(3);
  await expect(chip).not.toContainText('｜');
  await shot(teacher.page, 'teacher-chips');
});

test('handwriting mode on the keypad: write, auto-recognize, fill the box, submit', async ({ browser }) => {
  test.setTimeout(120_000);
  const teacher = await surface(browser, 1440, 900);
  await loginTeacher(teacher.page);
  await setRequireCode(teacher.page, false);
  await teacher.page.getByTestId('lesson-card').filter({ hasText: '根式的乘除' }).getByRole('button', { name: '開始上課' }).click();
  await teacher.page.locator('#start-form select').selectOption('demo-class');
  await teacher.page.locator('#start-form').getByRole('button', { name: '開始上課' }).click();
  await expect(teacher.page.getByTestId('session-slide')).toBeVisible();
  const sessionId = teacher.page.url().split('/session/')[1];
  cleanup.push({ context: teacher.context, id: sessionId });
  await goSlide(teacher.page, 2);
  await teacher.page.getByTestId('toggle-activity').click();

  const ipad = await surface(browser, 820, 1180, true);
  await loginStudent(ipad.page, 9);
  await expect(ipad.page.getByTestId('session-slide')).toBeVisible();
  await answerTab(ipad.page);
  const write = async (text: string) => {
    // 示範模式沒有 AI：伺服器回傳測試用文字（模擬辨識結果）
    await ipad.page.evaluate((t) => ((window as unknown as { __mckOcrMock: string }).__mckOcrMock = t), text);
    const pad = (await ipad.page.getByTestId('hand-pad').boundingBox())!;
    await ipad.page.mouse.move(pad.x + 30, pad.y + pad.height / 2);
    await ipad.page.mouse.down();
    for (let i = 1; i <= 12; i++) await ipad.page.mouse.move(pad.x + 30 + i * 15, pad.y + pad.height / 2 + (i % 2 ? -18 : 18));
    await ipad.page.mouse.up();
  };
  await ipad.page.locator('#numeric-item-0').tap();
  await ipad.page.getByTestId('keypad-mode-hand').tap();
  await expect(ipad.page.getByTestId('hand-pad')).toBeVisible();
  await write('-10√3');
  await expect(ipad.page.locator('#numeric-item-0')).toHaveValue('-10√3'); // 停筆後自動辨識、填入
  await expect(ipad.page.locator('#hand-status')).toContainText('讀到');
  await expect(ipad.page.locator('[data-preview="numeric-item-0"] .katex')).toBeVisible();
  await shot(ipad.page, 'ipad-handwriting');
  await ipad.page.getByTestId('keypad-next').tap(); // 換格：手寫板清空
  await write('8√2');
  await expect(ipad.page.locator('#numeric-item-1')).toHaveValue('8√2');
  await ipad.page.getByTestId('keypad-next').tap();
  await write('2√?'); // 看不清楚：請學生重寫，不填入
  await expect(ipad.page.locator('#hand-status')).toContainText('再寫一次');
  await expect(ipad.page.locator('#numeric-item-2')).toHaveValue('');
  await ipad.page.getByTestId('hand-clear').tap();
  await write('-2√2/3');
  await expect(ipad.page.locator('#numeric-item-2')).toHaveValue('-2√2/3');
  // 手寫模式會記住；送出
  await ipad.page.getByTestId('keypad-submit').tap();
  await expect(ipad.page.locator('.saved-answer')).toContainText('已送出');
  await expect
    .poll(async () => {
      const v = await (await teacher.page.request.get(`/api/sessions/${sessionId}`)).json();
      return v.answers.find((x: { seat: number }) => x.seat === 9)?.itemsCorrect;
    })
    .toEqual([true, true, true]);
});

test('2-2 classroom: students join with seat only, animation unlocks after results, zoom keeps every tool working', async ({ browser }) => {
  test.setTimeout(180_000);
  const teacher = await surface(browser, 1440, 900);
  await loginTeacher(teacher.page);
  await setRequireCode(teacher.page, false);

  // 開課：2-2 根式的運算（1）
  await teacher.page.getByTestId('lesson-card').filter({ hasText: '根式的乘除' }).getByRole('button', { name: '開始上課' }).click();
  await teacher.page.locator('#start-form select').selectOption('demo-class');
  await teacher.page.locator('#start-form').getByRole('button', { name: '開始上課' }).click();
  await expect(teacher.page.getByTestId('session-slide')).toBeVisible();
  const sessionId = teacher.page.url().split('/session/')[1];
  cleanup.push({ context: teacher.context, id: sessionId });

  // 三位學生：只用班級代碼＋座號
  const desk = await surface(browser, 1280, 800);
  const ipad = await surface(browser, 820, 1180, true);
  const phone = await surface(browser, 390, 844, true);
  for (const [s, seat] of [[desk, 3], [ipad, 4], [phone, 5]] as const) {
    await loginStudent(s.page, seat);
    await expect(s.page.getByTestId('session-slide')).toBeVisible();
  }

  // 第 4 頁：例 1。學生端的動畫鎖住，直接讀檔也被擋
  await goSlide(teacher.page, 4);
  for (const s of [desk, ipad, phone]) {
    await slideTab(s.page);
    await expect(s.page.getByTestId('animation-locked')).toBeVisible();
  }
  expect((await desk.page.request.get('/api/assets/lessons/g8-2-2/anim-a-ex1.mp4')).status()).toBe(403);
  await expect(teacher.page.getByTestId('play-animation')).toBeVisible();
  await shot(ipad.page, 'ipad-locked');

  // 老師：放大課本截圖 → 畫筆、雷射、IRS 都能用 → 縮小
  await teacher.page.locator('[data-action="zoom-figure"]').first().click();
  await expect(teacher.page.getByTestId('figure-focus')).toBeVisible();
  await teacher.page.getByTestId('tool-pen').click();
  const box = (await teacher.page.getByTestId('whiteboard-canvas').boundingBox())!;
  await teacher.page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
  await teacher.page.mouse.down();
  await teacher.page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.52, { steps: 8 });
  await teacher.page.mouse.up();
  await expect
    .poll(async () => Object.keys((await (await teacher.page.request.get(`/api/sessions/${sessionId}`)).json()).whiteboard))
    .toContain('a-ex1--fig0');
  await teacher.page.getByTestId('tool-laser').click();
  await expect(teacher.page.getByTestId('tool-laser')).toHaveAttribute('aria-pressed', 'true');
  // 雷射筆移動時留下軌跡，1.5 秒後仍看得到
  await teacher.page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  for (let i = 1; i <= 20; i++) await teacher.page.mouse.move(box.x + box.width * (0.2 + i * 0.025), box.y + box.height * (0.3 + 0.15 * Math.sin(i / 3)));
  await teacher.page.waitForTimeout(1500);
  const lit = await teacher.page.locator('canvas.laser-trail').evaluate((cv: HTMLCanvasElement) => {
    const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 16) if (d[i] > 20) n++;
    return n;
  });
  expect(lit, 'laser trail still visible after 1.5 s').toBeGreaterThan(50);
  await shot(teacher.page, 'teacher-laser-trail');
  await expect(teacher.page.getByTestId('figure-focus')).toBeVisible();
  await teacher.page.getByTestId('toggle-activity').click(); // 放大中也能開放作答
  await expect(teacher.page.getByRole('button', { name: '結束作答' })).toBeVisible();
  await shot(teacher.page, 'teacher-zoom-pen');
  await teacher.page.getByTestId('close-figure').click(); // 雷射模式下也點得到縮小
  await expect(teacher.page.getByTestId('figure-focus')).toHaveCount(0);
  await teacher.page.getByTestId('tool-cursor').click();

  // 學生作答例 1：一對一錯
  for (const [s, answers] of [[desk, ['√21', '-6√15']], [ipad, ['√21', '6√15']]] as const) {
    await answerTab(s.page);
    await s.page.locator('#numeric-item-0').fill(answers[0]);
    await s.page.locator('#numeric-item-1').fill(answers[1]);
    await s.page.getByTestId('submit-answer').click();
  }
  await expect(teacher.page.locator('#answer-count')).toContainText('2 /');

  // 公布結果 → 動畫解鎖，學生可以在投影片區內播放
  await teacher.page.getByRole('button', { name: '公布結果' }).click();
  for (const s of [desk, ipad, phone]) {
    await slideTab(s.page);
    await expect(s.page.getByTestId('play-animation')).toBeVisible();
  }
  expect((await desk.page.request.get('/api/assets/lessons/g8-2-2/anim-a-ex1.mp4', { headers: { Range: 'bytes=0-99' } })).status()).toBe(206);
  await ipad.page.getByTestId('play-animation').click();
  await expect(ipad.page.getByTestId('animation-focus')).toBeVisible();
  await expect.poll(() => ipad.page.locator('[data-testid="animation-player"]').evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0);
  await shot(ipad.page, 'ipad-animation');
  await ipad.page.keyboard.press('Escape');
  await expect(ipad.page.getByTestId('animation-focus')).toHaveCount(0);

  // 學生自己放大課本截圖
  await phone.page.locator('[data-action="zoom-figure"]').first().click();
  await expect(phone.page.getByTestId('figure-focus')).toBeVisible();
  await shot(phone.page, 'phone-zoom');
  await phone.page.getByTestId('close-figure').click();

  // 第 6 頁：例 2 比大小，步驟化（沒有滑桿）
  await goSlide(teacher.page, 6);
  await slideTab(desk.page);
  await expect(desk.page.locator('.room-progress span').first()).toHaveText('6');
  // 公布結果前：學生只看到題目，解題步驟鎖住
  await expect(desk.page.locator('.viz-locked')).toBeVisible();
  await expect(desk.page.locator('[data-viz="next"]')).toHaveCount(0);
  await teacher.page.getByRole('button', { name: '公布結果' }).click();
  await expect(desk.page.locator('.viz-step-count')).toContainText('1 / 6');
  await expect(desk.page.locator('.viz-host input[type="range"]')).toHaveCount(0);
  for (let i = 2; i <= 6; i++) {
    await desk.page.locator('[data-viz="next"]').click();
    await expect(desk.page.locator('.viz-step-count')).toContainText(`${i} / 6`);
  }
  await expect(desk.page.locator('.viz-step-caption')).toContainText('結論');
  await shot(desk.page, 'desk-compare-steps');

  // 開啟個人識別碼：學生被登出，沒有識別碼登不進來，有就可以
  await setRequireCode(teacher.page, true);
  await desk.page.reload();
  await expect(desk.page.locator('#login-form')).toBeVisible();
  await loginStudent(desk.page, 3);
  await expect(desk.page.locator('#login-error')).toContainText('識別碼');
  await loginStudent(desk.page, 3, 'DEMO03');
  await expect(desk.page.getByTestId('session-slide')).toBeVisible();
  await setRequireCode(teacher.page, false); // 測試階段維持停用
});
