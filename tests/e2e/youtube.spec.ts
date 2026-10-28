// YouTube 影片：老師端有縮圖卡片，點了在對話框播放（youtube-nocookie）；學生端不顯示。
import { test, expect, type BrowserContext } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const contexts: BrowserContext[] = [];
let sessionId = '';

test.afterEach(async () => {
  if (sessionId) await contexts[0].request.delete(`/api/sessions/${sessionId}`, { headers: { Origin: baseURL }, data: {} });
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

test('teacher plays an embedded YouTube Short; students do not see the card', async ({ browser }) => {
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
  await tp.getByTestId('lesson-card').filter({ hasText: '畢氏定理與邊長計算' }).getByRole('button', { name: '開始上課' }).click();
  await tp.locator('#start-form select').selectOption('demo-class');
  await tp.locator('#start-form').getByRole('button', { name: '開始上課' }).click();
  await expect(tp.getByTestId('session-slide')).toBeVisible();
  sessionId = tp.url().split('/session/')[1];
  const lesson = (await (await tp.request.get(`/api/sessions/${sessionId}`)).json()).lesson;
  const index = lesson.slides.findIndex((s: { id: string }) => s.id === 'a-theorem');
  await tp.request.post(`/api/sessions/${sessionId}/control`, { headers, data: { action: 'slide', index } });
  await expect(tp.getByRole('heading', { name: '兩股平方和 ＝ 斜邊平方' })).toBeVisible();

  const card = tp.getByTestId('play-youtube');
  await expect(card).toHaveCount(1);
  await card.click();
  const player = tp.getByTestId('youtube-player');
  await expect(player).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/XkDKOFpIYDk\?autoplay=1/);
  const box = (await player.boundingBox())!;
  expect(box.height).toBeGreaterThan(box.width * 1.6); // 直式 Shorts
  if (process.env.MCK_SHOT_DIR) {
    await tp.waitForTimeout(3000);
    await tp.screenshot({ path: `${process.env.MCK_SHOT_DIR}/youtube-teacher.png` });
  }
  // 課堂畫面重畫（例如換頁指令回來）時，影片對話框不會被關掉
  await tp.evaluate(() => window.dispatchEvent(new Event('resize')));
  await expect(player).toBeVisible();
  await tp.keyboard.press('Escape');

  const student = await browser.newContext({ baseURL, viewport: { width: 820, height: 1180 } });
  contexts.push(student);
  const sp = await student.newPage();
  await sp.goto('/#/student');
  await sp.getByLabel('座號').fill('7');
  await sp.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(sp.getByTestId('session-slide')).toContainText('兩股平方和 ＝ 斜邊平方');
  await expect(sp.locator('.textbook-fig').first()).toBeAttached();
  await expect(sp.getByTestId('play-youtube')).toHaveCount(0);
});
