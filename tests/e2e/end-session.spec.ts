// 結束課堂：九年級各課（含魔王戰、步驟格鬥的課）按「結束並保存」後，畫面不當掉、學生看到課堂已結束。
import { test, expect, type BrowserContext } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const contexts: BrowserContext[] = [];
const sessions: string[] = [];
// 老師只登入一次（整套 e2e 一起跑時才不會撞到登入次數限制）
let storageState: Awaited<ReturnType<BrowserContext['storageState']>>, studentState: typeof storageState;

test.beforeAll(async ({ browser }) => {
  const c = await browser.newContext({ baseURL });
  const p = await c.newPage();
  await p.goto('/');
  await p.getByLabel('帳號').fill('teacher');
  await p.getByLabel('密碼').fill('11235813');
  await p.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(p.getByTestId('lesson-card').first()).toBeVisible();
  storageState = await c.storageState();
  await c.close();
  const sc = await browser.newContext({ baseURL });
  const sp = await sc.newPage();
  await sp.goto('/#/student');
  await sp.getByLabel('座號').fill('7');
  await sp.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(sp.getByText('等老師開始上課')).toBeVisible();
  studentState = await sc.storageState();
  await sc.close();
});

test.afterEach(async () => {
  for (const id of sessions.splice(0)) await contexts[0].request.delete(`/api/sessions/${id}`, { headers: { Origin: baseURL }, data: {} });
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

for (const lessonId of ['g9-1-4a', 'g9-1-4b', 'g9-1-4c', 'g9-2-1a', 'g9-2-1b', 'g9-2-1c']) {
  test(`ending ${lessonId} keeps the page alive`, async ({ browser }) => {
    const teacher = await browser.newContext({ baseURL, storageState, viewport: { width: 1440, height: 900 } });
    contexts.push(teacher);
    const tp = await teacher.newPage();
    const errors: string[] = [];
    tp.on('pageerror', (e) => errors.push(e.message));
    tp.on('response', (r) => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });
    await tp.goto('/');
    await expect(tp.getByTestId('lesson-card').first()).toBeVisible();
    const headers = { Origin: baseURL };
    const d = await (await tp.request.get('/api/dashboard')).json();
    const cl = d.classes.find((c: { code: string }) => c.code === 'DEMO801');
    await tp.request.patch(`/api/classes/${cl.id}`, { headers, data: { requireCode: false } });
    const res = await tp.request.post('/api/sessions', { headers, data: { lessonId, classId: cl.id } });
    expect(res.status()).toBeLessThan(300);
    const id = (await res.json()).session.id;
    sessions.push(id);
    await tp.goto(`/#/session/${id}`);
    await expect(tp.getByTestId('session-slide')).toBeVisible();

    const student = await browser.newContext({ baseURL, storageState: studentState, viewport: { width: 820, height: 1180 } });
    contexts.push(student);
    const sp = await student.newPage();
    sp.on('pageerror', (e) => errors.push(`student: ${e.message}`));
    await sp.goto('/#/student');
    await expect(sp.getByTestId('session-slide')).toBeVisible();

    await tp.getByRole('button', { name: '結束課堂' }).click();
    await tp.getByRole('button', { name: '結束並保存' }).click();
    await expect(tp.getByText('課堂已結束').first()).toBeVisible();
    await expect(sp.getByText('等老師開始上課')).toBeVisible(); // 學生回到等待畫面
    // 結束後再操作：主執行緒沒卡住
    expect(await tp.evaluate(() => 1 + 1)).toBe(2);
    await tp.getByRole('button', { name: '返回' }).click();
    await expect(tp.getByTestId('lesson-card').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('ending while the network is down shows a clear message; trying again after it is back works', async ({ browser }) => {
  const teacher = await browser.newContext({ baseURL, storageState, viewport: { width: 1440, height: 900 } });
  contexts.push(teacher);
  const tp = await teacher.newPage();
  await tp.goto('/');
  await expect(tp.getByTestId('lesson-card').first()).toBeVisible();
  const headers = { Origin: baseURL };
  const cl = (await (await tp.request.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  const id = (await (await tp.request.post('/api/sessions', { headers, data: { lessonId: 'g9-2-1a', classId: cl.id } })).json()).session.id;
  sessions.push(id);
  await tp.goto(`/#/session/${id}`);
  await expect(tp.getByTestId('session-slide')).toBeVisible();

  await teacher.setOffline(true);
  await tp.getByRole('button', { name: '結束課堂' }).click();
  await tp.getByRole('button', { name: '結束並保存' }).click();
  await expect(tp.getByText('網路連線不穩')).toBeVisible();
  await teacher.setOffline(false);
  await expect(tp.getByRole('button', { name: '結束課堂' })).toBeEnabled();
  await tp.getByRole('button', { name: '結束課堂' }).click();
  await tp.getByRole('button', { name: '結束並保存' }).click();
  await expect(tp.getByText('課堂已結束').first()).toBeVisible();
  await expect(tp.getByRole('button', { name: '結束課堂' })).toBeDisabled();
});
