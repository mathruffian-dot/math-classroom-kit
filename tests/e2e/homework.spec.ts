// 回家作業：老師在課堂上派發（預設答對率最低的 1/3）→ 下載 zip（每人一份 A4 PDF＋全班合併 PDF＋解答）→ 學生掃 QR code 拍照上傳 → 批改發回（紅筆）→ 老師看結果、改判；學習紀錄頁。
import { test, expect, type Browser, type BrowserContext, type APIRequestContext, type Page, type Request } from '@playwright/test';
import JSZip from 'jszip';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const shots = process.env.MCK_SHOT_DIR;
const contexts: BrowserContext[] = [];
let sessionId = '';
let homeworkId = '';
const extraHomework: string[] = [];

test.afterEach(async () => {
  const req = contexts[0]?.request;
  if (req && homeworkId) await req.delete(`/api/homework/${homeworkId}`, { headers: { Origin: baseURL }, data: {} });
  for (const id of extraHomework.splice(0)) if (req) await req.delete(`/api/homework/${id}`, { headers: { Origin: baseURL }, data: {} });
  if (req && sessionId) await req.delete(`/api/sessions/${sessionId}`, { headers: { Origin: baseURL }, data: {} });
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

async function answer(req: APIRequestContext, seat: number, path: string, data: unknown) {
  const headers = { Origin: baseURL };
  await req.post('/api/login', { headers, data: { role: 'student', classCode: 'DEMO801', seat } });
  return req.post(path, { headers, data });
}

test('teacher assigns differentiated homework; a student uploads the sheet and gets it back marked in red', async ({ browser, playwright }) => {
  test.setTimeout(180_000);
  const teacher = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  contexts.push(teacher);
  const tp = await teacher.newPage();
  await tp.goto('/');
  await tp.getByLabel('帳號').fill('teacher');
  await tp.getByLabel('密碼').fill('11235813');
  await tp.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(tp.getByTestId('lesson-card').first()).toBeVisible();
  const headers = { Origin: baseURL };
  const cl = (await (await tp.request.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  await tp.request.patch(`/api/classes/${cl.id}`, { headers, data: { requireCode: false } });
  sessionId = (await (await tp.request.post('/api/sessions', { headers, data: { lessonId: 'g9-2-1a', classId: cl.id } })).json()).session.id;
  // 6 位同學在例題 1 作答：1–2 號錯、其他對
  const lesson = (await (await tp.request.get(`/api/sessions/${sessionId}`)).json()).lesson;
  const index = lesson.slides.findIndex((s: { activity?: { id: string } }) => s.activity?.id === 'a-ex1-q');
  const a = lesson.slides[index].activity;
  await tp.request.post(`/api/sessions/${sessionId}/control`, { headers, data: { action: 'slide', index } });
  await tp.request.post(`/api/sessions/${sessionId}/control`, { headers, data: { action: 'activity', value: true } });
  const students = await playwright.request.newContext({ baseURL });
  for (const seat of [1, 2, 3, 4, 5, 6]) {
    const value = a.items.map((it: { answer: string }) => (seat <= 2 ? '1' : it.answer));
    expect((await answer(students, seat, `/api/sessions/${sessionId}/answers`, { submissionId: `hw-e2e-${seat}`, activityId: a.id, value })).status()).toBe(200);
  }
  await students.dispose();

  // 課堂右側「派發作業」：預設勾答對率最低的 1/3（全新的測試伺服器是 1、2 號；班上有別的紀錄時會更多）
  const plan = (await (await tp.request.get(`/api/homework/plan?classId=${cl.id}&lessonId=g9-2-1a`)).json()).plan;
  expect(plan.suggested).toEqual(expect.arrayContaining([1, 2]));
  await tp.goto(`/#/session/${sessionId}`);
  await tp.getByTestId('hw-plan-open').click();
  await expect(tp.getByTestId('hw-plan')).toBeVisible();
  await expect(tp.getByTestId('hw-count')).toHaveText(`已選 ${plan.suggested.length} 人`);
  await expect(tp.getByLabel('1 號', { exact: true })).toBeChecked();
  await expect(tp.getByLabel('2 號', { exact: true })).toBeChecked();
  await tp.getByRole('button', { name: '清除' }).click();
  for (const n of [1, 2, 3]) await tp.getByLabel(`${n} 號`, { exact: true }).check();
  await expect(tp.getByTestId('hw-count')).toHaveText('已選 3 人');
  if (shots) await tp.screenshot({ path: join(shots, 'hw-plan.png') });
  const [dl] = await Promise.all([tp.waitForEvent('download', { timeout: 120_000 }), tp.getByTestId('hw-create').click()]);
  const zip = await JSZip.loadAsync(await readFile((await dl.path())!));
  const names = Object.keys(zip.files).sort();
  expect(names).toHaveLength(5);
  expect(names[0]).toMatch(/^00_解答總表/);
  expect(names[1]).toBe('01_全班作業（合併）.pdf');
  expect(names[2]).toMatch(/_01號_.*\.pdf$/);
  for (const n of names) expect((await zip.file(n)!.async('uint8array')).slice(0, 5)).toEqual(new TextEncoder().encode('%PDF-'));
  // 合併檔的頁數＝三位同學個人卷的頁數加起來（不含解答總表）
  const pdfPages = (b: Uint8Array) => (new TextDecoder('latin1').decode(b).match(/\/Type \/Page(?!s)/g) || []).length;
  const seatPages = await Promise.all(names.slice(2).map(async (n) => pdfPages(await zip.file(n)!.async('uint8array'))));
  const mergedBytes = await zip.file(names[1])!.async('uint8array');
  expect(seatPages.every((n) => n >= 1)).toBe(true);
  expect(pdfPages(mergedBytes)).toBe(seatPages.reduce((a, b) => a + b, 0));
  if (shots) for (const n of [names[0], names[2]]) await writeFile(join(shots, n.startsWith('00') ? 'hw-key.pdf' : 'hw-seat1.pdf'), await zip.file(n)!.async('uint8array'));
  // 產生完，派發視窗留著「下載全班合併 PDF」
  await expect(tp.getByTestId('hw-done')).toContainText('01_全班作業（合併）.pdf');
  const [mdl] = await Promise.all([tp.waitForEvent('download'), tp.getByTestId('hw-merged-save').click()]);
  expect(mdl.suggestedFilename()).toMatch(/_全班合併\.pdf$/);
  expect(pdfPages(await readFile((await mdl.path())!))).toBe(pdfPages(mergedBytes));
  await tp.getByRole('button', { name: '完成' }).click();

  const list = (await (await tp.request.get('/api/homework')).json()).homework;
  homeworkId = list[0].id;
  const detail = await (await tp.request.get(`/api/homework/${homeworkId}`)).json();
  const one = detail.sheets.find((s: { seat: number }) => s.seat === 1);
  expect(one.questions).toHaveLength(10);

  // 學生用手機掃 QR code（不用登入）
  const phone = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  contexts.push(phone);
  const sp = await phone.newPage();
  await sp.goto(new URL(one.url).pathname + new URL(one.url).hash);
  await expect(sp.getByTestId('hw-student')).toBeVisible();
  await expect(sp.getByText('1 號')).toBeVisible();
  const photo = shots ? join(shots, 'hw-photo.png') : join(test.info().outputDir, 'hw-photo.png');
  await tp.screenshot({ path: photo }); // 任何一張圖都可以當作答紙照片（示範批改）
  await sp.getByTestId('hw-upload').setInputFiles(photo);
  await expect(sp.getByRole('button', { name: '送出批改（1 張）' })).toBeEnabled();
  if (shots) await sp.screenshot({ path: join(shots, 'hw-student-upload.png') });
  await sp.getByTestId('hw-submit').click();
  await expect(sp.locator('.hw-score strong')).toBeVisible({ timeout: 30_000 });
  await expect(sp.locator('.hw-r')).toHaveCount(10);
  await expect(sp.locator('.hw-photo svg.redpen')).toHaveCount(1);
  await expect(sp.locator('.hw-r.ok .hw-comment').first()).not.toBeEmpty(); // 答對也有鼓勵
  // 手機上捲得到最後一題（畫面在 #app 裡面捲動）
  await expect(sp.locator('#app')).toHaveCSS('overflow-y', 'auto');
  await sp.locator('.hw-r').last().scrollIntoViewIfNeeded();
  await expect(sp.locator('.hw-r').last()).toBeInViewport();
  if (shots) await sp.screenshot({ path: join(shots, 'hw-student-result.png'), fullPage: true });

  // 老師：作業頁、改判
  await tp.goto(`/#/homework/${homeworkId}`);
  await expect(tp.getByTestId('hw-detail')).toContainText('已批改');
  // 作業頁也能重新下載全班合併 PDF
  const [ddl] = await Promise.all([tp.waitForEvent('download', { timeout: 120_000 }), tp.getByTestId('hw-merged').click()]);
  expect(ddl.suggestedFilename()).toMatch(/_全班合併\.pdf$/);
  expect(pdfPages(await readFile((await ddl.path())!))).toBe(pdfPages(mergedBytes));
  await tp.getByTestId('hw-seat-1').click();
  await expect(tp.getByTestId('hw-seat-modal')).toBeVisible();
  const score = Number((await tp.locator('.hw-score strong').innerText()).split('/')[0]);
  await tp.locator('.hw-r.no').first().getByRole('button', { name: '✓' }).click();
  await expect(tp.locator('.hw-score strong')).toContainText(String(score + 1));
  if (shots) await tp.screenshot({ path: join(shots, 'hw-teacher-seat.png') });
  await tp.keyboard.press('Escape');

  // 學生登入（iPad）：等待室列出自己的作業（課堂結束後）
  await tp.request.post(`/api/sessions/${sessionId}/control`, { headers, data: { action: 'end' } });
  const ipad = await browser.newContext({ baseURL, viewport: { width: 820, height: 1180 }, hasTouch: true });
  contexts.push(ipad);
  const ip = await ipad.newPage();
  await ip.goto('/#/student');
  await ip.getByLabel('座號').fill('1');
  await ip.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(ip.getByTestId('hw-mine')).toContainText('回家作業');
  await expect(ip.getByTestId('hw-mine').getByRole('link')).toHaveCount(1);
  if (shots) await ip.screenshot({ path: join(shots, 'hw-ipad-waiting.png') });
  await ip.getByTestId('hw-mine').getByRole('link').click();
  await expect(ip.getByTestId('hw-student')).toBeVisible();

  // 學習紀錄頁
  await tp.goto('/#/learning');
  await expect(tp.getByTestId('learn-table')).toContainText('1 號');
  if (shots) await tp.screenshot({ path: join(shots, 'hw-learning.png') });
});

// 2026-10-30 Codex 審核 C-1、C-4、C-16 的回歸測試（Codex 複審 R-4：各自獨立，前一項失敗不會遮住後面）
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
/** 老師登入、DEMO801 不用班級代碼，派一份作業給 1 號；graded=true 時先上傳一張照片並等背景批改完成。 */
async function teacherWithHomework(browser: Browser, graded = false) {
  const teacher = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  contexts.push(teacher);
  const tp = await teacher.newPage();
  await tp.goto('/');
  await tp.getByLabel('帳號').fill('teacher');
  await tp.getByLabel('密碼').fill('11235813');
  await tp.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(tp.getByTestId('lesson-card').first()).toBeVisible();
  const headers = { Origin: baseURL };
  const cl = (await (await tp.request.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  await tp.request.patch(`/api/classes/${cl.id}`, { headers, data: { requireCode: false } });
  const created = await (await tp.request.post('/api/homework', { headers, data: { classId: cl.id, lessonId: 'g9-2-1a', seats: [1] } })).json();
  homeworkId = created.homework.id;
  const sheetUrl = new URL(created.sheets[0].url);
  const token = sheetUrl.hash.split('/')[4];
  const pub = `/api/hw/${homeworkId}/1`;
  if (graded) {
    expect((await tp.request.post(`${pub}/photos?t=${token}`, { headers, data: { dataUrl: JPEG } })).status()).toBe(200);
    expect((await tp.request.post(`${pub}/submit?t=${token}`, { headers, data: {} })).status()).toBe(200);
    // 背景（alarm）批改
    await expect.poll(async () => (await (await tp.request.get(`${pub}?t=${token}`)).json()).sheet.status, { timeout: 30_000 }).toBe('graded');
  }
  return { tp, headers, cl, token, sheetUrl, pub };
}
/** 共用 iPad：學生登入（座號）。 */
async function studentLogin(page: Page, seat: number) {
  await page.getByLabel('座號').fill(String(seat));
  await page.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(page.getByText('你已入座')).toBeVisible();
}
async function logoutToStudentLogin(page: Page) {
  await page.getByRole('button', { name: '登出' }).click();
  await expect(page.getByRole('heading', { name: '進入課堂' })).toBeVisible();
  await page.getByRole('button', { name: '學生', exact: true }).click();
}
/** 前一位同學的作業（含 QR 憑證的連結或照片網址）不在畫面上。 */
async function expectNoTrace(page: Page, token: string) {
  await expect(page.locator('[data-testid="hw-student"]')).toHaveCount(0);
  await expect(page.locator('#app')).not.toHaveClass(/hw-student/);
  expect(await page.content()).not.toContain(token);
}
/** 攔住一個請求直到 release()；release 時請求可能已被頁面中止（修正後的行為），忽略那個錯誤。 */
function holdRequest(page: Page, url: string | RegExp, match: (r: Request) => boolean = () => true) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let held!: () => void;
  const seen = new Promise<void>((r) => (held = r));
  let done = false;
  void page.route(url, async (route) => {
    if (done || !match(route.request())) return route.fallback();
    done = true;
    held();
    await gate;
    await route.continue().catch(() => undefined);
  });
  return { seen, release: () => release() };
}

test('C-1: a shared iPad never shows the previous student’s homework link after logout', async ({ browser }) => {
  test.setTimeout(90_000);
  const { token } = await teacherWithHomework(browser);
  // 1 號在等待室看到作業連結 → 登出 → 同一個分頁 2 號登入：不能看到 1 號的連結（含憑證）
  const ipad = await browser.newContext({ baseURL, viewport: { width: 820, height: 1180 }, hasTouch: true });
  contexts.push(ipad);
  const ip = await ipad.newPage();
  await ip.goto('/#/student');
  await studentLogin(ip, 1);
  await expect(ip.locator(`a[href*="${token}"]`)).toHaveCount(1);
  await logoutToStudentLogin(ip);
  await ip.getByLabel('座號').fill('2');
  const list = ip.waitForResponse((r) => r.url().endsWith('/api/student/homework'));
  await ip.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await list;
  await expect(ip.getByText('你已入座')).toBeVisible();
  await expect(ip.locator(`a[href*="${token}"]`)).toHaveCount(0);
});

test('C-4: the learning page reloads every time it is opened', async ({ browser }) => {
  test.setTimeout(90_000);
  const { tp, headers, cl, token, pub } = await teacherWithHomework(browser);
  await tp.goto('/#/learning');
  await tp.locator('[data-learn="class"]').selectOption(cl.id);
  const count = async () => Number((await tp.locator('.learn-filters .muted').innerText()).match(/(\d+) 筆作答/)![1]);
  await expect(tp.locator('.learn-filters .muted')).toContainText('筆作答');
  const before = await count();
  expect((await tp.request.post(`${pub}/photos?t=${token}`, { headers, data: { dataUrl: JPEG } })).status()).toBe(200);
  expect((await tp.request.post(`${pub}/submit?t=${token}`, { headers, data: {} })).status()).toBe(200);
  await expect.poll(async () => (await (await tp.request.get(`${pub}?t=${token}`)).json()).sheet.status, { timeout: 30_000 }).toBe('graded');
  await tp.goto('/#/homework');
  await expect(tp.getByTestId('learn-table')).toHaveCount(0);
  await tp.goto('/#/learning');
  await expect.poll(count).toBe(before + 10);
});

test('C-16: a failed re-upload after correction can be retried', async ({ browser }) => {
  test.setTimeout(90_000);
  const { tp, sheetUrl } = await teacherWithHomework(browser, true);
  // 訂正後重新上傳，第一張因網路失敗；再選一次照片要成功（不是 409「已經批改完了」）
  const phone = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  contexts.push(phone);
  const sp = await phone.newPage();
  await sp.goto(sheetUrl.pathname + sheetUrl.hash);
  await sp.getByRole('button', { name: '訂正後重新上傳' }).click();
  let failed = false;
  await sp.route('**/photos?t=*', (route) => {
    if (route.request().method() === 'POST' && !failed) {
      failed = true;
      return route.abort('internetdisconnected');
    }
    return route.continue();
  });
  const photo = join(test.info().outputDir, 'hw-retry.png');
  await tp.screenshot({ path: photo });
  await sp.getByTestId('hw-upload').setInputFiles(photo);
  await expect.poll(() => failed).toBe(true);
  await sp.getByTestId('hw-upload').setInputFiles(photo);
  await expect(sp.getByRole('button', { name: '送出批改（1 張）' })).toBeEnabled();
});

// 2026-10-30 Codex 複審 R-1：公開作業頁的晚到回覆（初載、輪詢、上傳）在換人後都要丟掉
test('R-1: a late first load of the homework page is dropped after logout and another student logs in', async ({ browser }) => {
  test.setTimeout(90_000);
  const { token } = await teacherWithHomework(browser, true);
  const ipad = await browser.newContext({ baseURL, viewport: { width: 820, height: 1180 }, hasTouch: true });
  contexts.push(ipad);
  const ip = await ipad.newPage();
  await ip.goto('/#/student');
  await studentLogin(ip, 1);
  const load = holdRequest(ip, new RegExp(`/api/hw/${homeworkId}/1\\?t=`));
  await ip.locator(`a[href*="${token}"]`).click();
  await load.seen; // 1 號的作業還沒回來，畫面還是等待室
  await logoutToStudentLogin(ip);
  await studentLogin(ip, 2);
  load.release();
  await ip.waitForTimeout(1500);
  await expectNoTrace(ip, token);
  await expect(ip.getByText('你已入座')).toBeVisible();
});

test('R-1: a late poll reply of the homework page is dropped after leaving it and another student logs in', async ({ browser }) => {
  test.setTimeout(90_000);
  const { token } = await teacherWithHomework(browser, true);
  const ipad = await browser.newContext({ baseURL, viewport: { width: 820, height: 1180 }, hasTouch: true });
  contexts.push(ipad);
  const ip = await ipad.newPage();
  await ip.goto('/#/student');
  await studentLogin(ip, 1);
  // 第一次讀取改成「等待批改」，作業頁 4 秒後輪詢；輪詢的請求先攔住
  const sheetApi = new RegExp(`/api/hw/${homeworkId}/1\\?t=`);
  let first = true;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let polled!: () => void;
  const seen = new Promise<void>((r) => (polled = r));
  await ip.route(sheetApi, async (route) => {
    if (first) {
      first = false;
      const res = await route.fetch();
      const body = await res.json();
      body.sheet.status = 'queued';
      delete body.sheet.result;
      return route.fulfill({ response: res, json: body });
    }
    polled();
    await gate;
    await route.continue().catch(() => undefined);
  });
  await ip.locator(`a[href*="${token}"]`).click();
  await expect(ip.getByTestId('hw-wait')).toBeVisible();
  await seen;
  await ip.evaluate(() => (location.hash = '#/student'));
  await expect(ip.getByText('你已入座')).toBeVisible();
  await logoutToStudentLogin(ip);
  await studentLogin(ip, 2);
  release();
  await ip.waitForTimeout(1500);
  await expectNoTrace(ip, token);
});

test('R-1: a late photo-upload reply is dropped after leaving the homework page and another student logs in', async ({ browser }) => {
  test.setTimeout(90_000);
  const { tp, token } = await teacherWithHomework(browser);
  const ipad = await browser.newContext({ baseURL, viewport: { width: 820, height: 1180 }, hasTouch: true });
  contexts.push(ipad);
  const ip = await ipad.newPage();
  await ip.goto('/#/student');
  await studentLogin(ip, 1);
  await ip.locator(`a[href*="${token}"]`).click();
  await expect(ip.getByTestId('hw-upload')).toBeAttached();
  const upload = holdRequest(ip, '**/photos?t=*', (r) => r.method() === 'POST');
  const photo = join(test.info().outputDir, 'hw-late.png');
  await tp.screenshot({ path: photo });
  await ip.getByTestId('hw-upload').setInputFiles(photo);
  await upload.seen;
  await ip.evaluate(() => (location.hash = '#/student'));
  await expect(ip.getByText('你已入座')).toBeVisible();
  await logoutToStudentLogin(ip);
  await studentLogin(ip, 2);
  upload.release();
  await ip.waitForTimeout(1500);
  await expectNoTrace(ip, token);
});

// 2026-11-06 Codex 審查 25b202d SHOULD-FIX：晚完成的派發不能蓋掉新開的派發視窗，也不能讓別批的完成視窗下載到它的合併卷
async function teacherInSession(browser: Browser) {
  const teacher = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  contexts.push(teacher);
  const tp = await teacher.newPage();
  await tp.goto('/');
  await tp.getByLabel('帳號').fill('teacher');
  await tp.getByLabel('密碼').fill('11235813');
  await tp.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(tp.getByTestId('lesson-card').first()).toBeVisible();
  const headers = { Origin: baseURL };
  const cl = (await (await tp.request.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  sessionId = (await (await tp.request.post('/api/sessions', { headers, data: { lessonId: 'g9-2-1a', classId: cl.id } })).json()).session.id;
  tp.on('response', async (r) => {
    if (r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/homework' && r.ok()) extraHomework.push((await r.json()).homework.id);
  });
  await tp.goto(`/#/session/${sessionId}`);
  return tp;
}
async function openPlanFor(tp: Page, seats: number[]) {
  await tp.getByTestId('hw-plan-open').click();
  await expect(tp.getByTestId('hw-plan')).toBeVisible();
  await tp.getByRole('button', { name: '清除' }).click();
  for (const n of seats) await tp.getByLabel(`${n} 號`, { exact: true }).check();
  await expect(tp.getByTestId('hw-count')).toHaveText(`已選 ${seats.length} 人`);
}
const mergedOf = async (path: string) => (await JSZip.loadAsync(await readFile(path))).file('01_全班作業（合併）.pdf')!.async('uint8array');

test('SF-1: a late homework job never replaces a newly opened assign window', async ({ browser }) => {
  test.setTimeout(180_000);
  const tp = await teacherInSession(browser);
  await openPlanFor(tp, [1]);
  const a = holdRequest(tp, '**/api/homework', (r) => r.method() === 'POST');
  await tp.getByTestId('hw-create').click();
  await a.seen; // A 還在出題：老師關掉視窗，重開一個派給 2 號
  await tp.getByRole('button', { name: '關閉對話框' }).click();
  await openPlanFor(tp, [2]);
  const [dl] = await Promise.all([tp.waitForEvent('download', { timeout: 120_000 }), a.release()]);
  expect(dl.suggestedFilename()).toMatch(/\.zip$/); // A 的 zip 照樣下載
  await tp.waitForTimeout(500);
  await expect(tp.getByTestId('hw-done')).toHaveCount(0);
  await expect(tp.getByTestId('hw-plan')).toBeVisible();
  await expect(tp.getByTestId('hw-count')).toHaveText('已選 1 人');
  await expect(tp.getByLabel('2 號', { exact: true })).toBeChecked();
  await expect(tp.getByLabel('1 號', { exact: true })).not.toBeChecked();
  await expect(tp.locator('#hw-progress')).toHaveText('');
});

test('SF-1: the merged-PDF button of a finished window always downloads its own batch, even if an older job finishes later', async ({ browser }) => {
  test.setTimeout(240_000);
  const tp = await teacherInSession(browser);
  await openPlanFor(tp, [1]);
  const a = holdRequest(tp, '**/api/homework', (r) => r.method() === 'POST');
  await tp.getByTestId('hw-create').click();
  await a.seen;
  await tp.getByRole('button', { name: '關閉對話框' }).click();
  await openPlanFor(tp, [2, 3]);
  const [bZip] = await Promise.all([tp.waitForEvent('download', { timeout: 120_000 }), tp.getByTestId('hw-create').click()]);
  await expect(tp.getByTestId('hw-done')).toContainText('已派發 2 份作業');
  const [aZip] = await Promise.all([tp.waitForEvent('download', { timeout: 120_000 }), a.release()]);
  const bMerged = await mergedOf((await bZip.path())!);
  const aMerged = await mergedOf((await aZip.path())!);
  expect(Buffer.from(aMerged).equals(Buffer.from(bMerged))).toBe(false);
  await tp.waitForTimeout(500);
  await expect(tp.getByTestId('hw-done')).toContainText('已派發 2 份作業');
  for (let i = 0; i < 2; i++) {
    const [m] = await Promise.all([tp.waitForEvent('download'), tp.getByTestId('hw-merged-save').click()]);
    expect(Buffer.from(await readFile((await m.path())!)).equals(Buffer.from(bMerged))).toBe(true);
  }
});
