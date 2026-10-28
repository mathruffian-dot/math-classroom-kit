// 班級頁可以刪除班級：要輸入班級代碼才會刪；有課堂紀錄時會一起刪掉。
import { test, expect } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;

test('teacher deletes a class (and its records) after typing the class code', async ({ browser }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 860 } });
  const tp = await context.newPage();
  await tp.goto('/');
  await tp.getByLabel('帳號').fill('teacher');
  await tp.getByLabel('密碼').fill('11235813');
  await tp.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(tp.getByTestId('lesson-card').first()).toBeVisible();
  const headers = { Origin: baseURL };
  const name = `刪除測試 ${Date.now()}`;
  const cl = (await (await tp.request.post('/api/classes', { headers, data: { name, seats: 2 } })).json()).classroom;
  const lessonId = (await (await tp.request.get('/api/dashboard')).json()).lessons[0].id;
  await tp.request.post('/api/sessions', { headers, data: { lessonId, classId: cl.id } });

  await tp.goto('/#/classes');
  const card = tp.locator('.class-card').filter({ hasText: name });
  await card.getByTestId('delete-class').click();
  const dialog = tp.getByRole('dialog');
  await expect(dialog).toContainText('1 堂課堂紀錄');
  await dialog.getByTestId('delete-class-code').fill('WRONG');
  await dialog.getByRole('button', { name: '確認刪除' }).click();
  await expect(tp.getByText('班級代碼不正確')).toBeVisible();
  await expect(dialog).toBeVisible();
  if (process.env.MCK_SHOT_DIR) await tp.screenshot({ path: `${process.env.MCK_SHOT_DIR}/class-delete.png` });
  await dialog.getByTestId('delete-class-code').fill(cl.code.toLowerCase());
  await dialog.getByRole('button', { name: '確認刪除' }).click();
  await expect(tp.getByText('班級已刪除')).toBeVisible();
  await expect(card).toHaveCount(0);
  const d = await (await tp.request.get('/api/dashboard')).json();
  expect(d.sessions.some((s: { classId: string }) => s.classId === cl.id)).toBe(false);
  await context.close();
});
