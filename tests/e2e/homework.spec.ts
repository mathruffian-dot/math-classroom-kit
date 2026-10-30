// 回家作業：老師在課堂上派發（預設答對率最低的 1/3）→ 下載 zip（每人一份 A4 PDF＋解答）→ 學生掃 QR code 拍照上傳 → 批改發回（紅筆）→ 老師看結果、改判；學習紀錄頁。
import { test, expect, type BrowserContext, type APIRequestContext } from '@playwright/test';
import JSZip from 'jszip';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const shots = process.env.MCK_SHOT_DIR;
const contexts: BrowserContext[] = [];
let sessionId = '';
let homeworkId = '';

test.afterEach(async () => {
  const req = contexts[0]?.request;
  if (req && homeworkId) await req.delete(`/api/homework/${homeworkId}`, { headers: { Origin: baseURL }, data: {} });
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
  expect(names).toHaveLength(4);
  expect(names[0]).toMatch(/^00_解答總表/);
  expect(names[1]).toMatch(/_01號_.*\.pdf$/);
  for (const n of names) expect((await zip.file(n)!.async('uint8array')).slice(0, 5)).toEqual(new TextEncoder().encode('%PDF-'));
  if (shots) for (const n of names.slice(0, 2)) await writeFile(join(shots, n.startsWith('00') ? 'hw-key.pdf' : 'hw-seat1.pdf'), await zip.file(n)!.async('uint8array'));

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

// 2026-10-30 Codex 審核 C-1、C-4、C-16 的回歸測試
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
test('a shared iPad never shows the previous student’s homework link; the learning page reloads; a failed re-upload can be retried', async ({ browser }) => {
  test.setTimeout(120_000);
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

  // C-1：1 號在等待室看到作業連結 → 登出 → 同一個分頁 2 號登入：不能看到 1 號的連結（含憑證）
  const ipad = await browser.newContext({ baseURL, viewport: { width: 820, height: 1180 }, hasTouch: true });
  contexts.push(ipad);
  const ip = await ipad.newPage();
  await ip.goto('/#/student');
  await ip.getByLabel('座號').fill('1');
  await ip.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(ip.locator(`a[href*="${token}"]`)).toHaveCount(1);
  await ip.getByRole('button', { name: '登出' }).click();
  await expect(ip.getByRole('heading', { name: '進入課堂' })).toBeVisible();
  await ip.getByRole('button', { name: '學生', exact: true }).click();
  await ip.getByLabel('座號').fill('2');
  const list = ip.waitForResponse((r) => r.url().endsWith('/api/student/homework'));
  await ip.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await list;
  await expect(ip.getByText('你已入座')).toBeVisible();
  await expect(ip.locator(`a[href*="${token}"]`)).toHaveCount(0);

  // C-4：學習紀錄頁每次進來都重新讀
  await tp.goto('/#/learning');
  await tp.locator('[data-learn="class"]').selectOption(cl.id);
  const count = async () => Number((await tp.locator('.learn-filters .muted').innerText()).match(/(\d+) 筆作答/)![1]);
  await expect(tp.locator('.learn-filters .muted')).toContainText('筆作答');
  const before = await count();
  const pub = `/api/hw/${homeworkId}/1`;
  expect((await tp.request.post(`${pub}/photos?t=${token}`, { headers, data: { dataUrl: JPEG } })).status()).toBe(200);
  expect((await tp.request.post(`${pub}/submit?t=${token}`, { headers, data: {} })).status()).toBe(200);
  // 背景（alarm）批改
  await expect.poll(async () => (await (await tp.request.get(`${pub}?t=${token}`)).json()).sheet.status, { timeout: 30_000 }).toBe('graded');
  await tp.goto('/#/homework');
  await expect(tp.getByTestId('learn-table')).toHaveCount(0);
  await tp.goto('/#/learning');
  await expect.poll(count).toBe(before + 10);

  // C-16：訂正後重新上傳，第一張因網路失敗；再選一次照片要成功（不是 409「已經批改完了」）
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
