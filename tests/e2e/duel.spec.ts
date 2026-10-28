// 根式步驟格鬥：老師開戰（自動分隊），學生在手機上每一步選規則、點數字卡填出下一行，大螢幕看到出招與血量，結束後有結算與「最需要加強的步驟」。
import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
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
  await page.screenshot({ path: resolve(screenshots, `duel-${name}.png`) });
}

test.afterEach(async () => {
  for (const r of cleanup.splice(0)) await r.context.request.delete(`/api/sessions/${r.id}`, { headers: { Origin: baseURL }, data: {} });
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

test('radical step duel: pick the rule, fill the next line with number cards, attack, finish, results', async ({ browser }) => {
  test.setTimeout(180_000);
  const teacher = await surface(browser, 1440, 900);
  const tp = teacher.page;
  await tp.goto('/');
  await tp.getByLabel('帳號').fill('teacher');
  await tp.getByLabel('密碼').fill('11235813');
  await tp.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(tp.getByTestId('lesson-card').first()).toBeVisible();
  const cl = (await (await tp.request.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  await tp.request.patch(`/api/classes/${cl.id}`, { headers: { Origin: baseURL }, data: { requireCode: false } });
  await tp.getByTestId('lesson-card').filter({ hasText: '根式的乘除' }).getByRole('button', { name: '開始上課' }).click();
  await tp.locator('#start-form select').selectOption('demo-class');
  await tp.locator('#start-form').getByRole('button', { name: '開始上課' }).click();
  await expect(tp.getByTestId('session-slide')).toBeVisible();
  const id = tp.url().split('/session/')[1];
  cleanup.push({ context: teacher.context, id });
  const lesson = (await (await tp.request.get(`/api/sessions/${id}`)).json()).lesson;
  const index = lesson.slides.findIndex((s: { duelPage?: boolean }) => s.duelPage);
  expect(index).toBeGreaterThan(0);

  const phone = await surface(browser, 390, 844, true);
  const ipad = await surface(browser, 820, 1180, true);
  for (const [s, seat] of [[phone, 26], [ipad, 27]] as const) {
    await s.page.goto('/#/student');
    await s.page.getByLabel('座號').fill(String(seat));
    await s.page.locator('#login-form').getByRole('button', { name: '登入' }).click();
    await expect(s.page.getByTestId('session-slide')).toBeVisible();
  }
  await tp.locator('.slide-dots button').nth(index).click();
  await expect(tp.getByTestId('duel-start')).toBeVisible();
  await tp.getByTestId('duel-start').click();
  await expect(tp.getByTestId('duel-board')).toBeVisible();
  await expect(tp.getByTestId('duel-status')).toContainText('紅隊 1 人・藍隊 1 人');

  const p = phone.page;
  // 開戰後學生端自動切到作答區
  await expect(p.getByTestId('duel-team')).toBeVisible();
  await shot(p, 'phone-countdown');
  await expect(p.getByTestId('duel-next')).toBeVisible({ timeout: 8000 });
  await p.getByTestId('duel-next').click();
  await expect(p.locator('.dl-rules .dl-rule')).toHaveCount(4);
  await shot(p, 'phone-rule');
  // 從題庫找答案（學生端拿不到答案）
  const bank = JSON.parse(await readFile(resolve('content/duels/g8-2-2a.json'), 'utf8'));
  const mine = async () => (await (await p.request.get(`/api/sessions/${id}`)).json()).duel.mine.problem;
  const pid = (await mine()).id;
  const item = bank.problems.find((x: { id: string }) => x.id === pid);
  for (const [k, stp] of item.steps.entries()) {
    await p.getByTestId(`duel-rule-${stp.rule}`).click();
    await expect(p.getByTestId('duel-flash')).toContainText('規則選對了');
    await expect(p.getByTestId('duel-blank-0')).toBeVisible();
    if (k === 0) await shot(p, 'phone-fill');
    for (const v of stp.fill[0]) await p.getByTestId(`duel-tile-${v}`).click();
    if (k === 0) await shot(p, 'phone-filled');
    await p.getByTestId('duel-submit').click();
    await expect(p.getByTestId('duel-flash')).toContainText(k === item.steps.length - 1 ? '最後一擊' : '算式正確');
  }
  // 下一題馬上出來；大螢幕有最後一擊、對方掉血
  await expect(p.locator('.dl-rules .dl-rule')).toHaveCount(4);
  await expect(tp.locator('#dl-feed')).toContainText('最後一擊');
  await shot(tp, 'projector');
  // iPad：選錯規則兩次，出現提示
  const q = ipad.page;
  await expect(q.getByTestId('duel-next')).toBeVisible();
  await q.getByTestId('duel-next').click();
  const qp = (await (await q.request.get(`/api/sessions/${id}`)).json()).duel.mine.problem;
  const qi = bank.problems.find((x: { id: string }) => x.id === qp.id);
  const wrong = qp.rules.find((r: string) => r !== qi.steps[0].rule);
  for (let i = 0; i < 2; i++) {
    await q.getByTestId(`duel-rule-${wrong}`).click();
    await expect(q.getByTestId('duel-flash')).toContainText('不是用這個規則');
  }
  await expect(q.locator('.dl-rule.hint')).toHaveCount(1);
  await expect(q.getByTestId(`duel-rule-${qi.steps[0].rule}`)).toHaveClass(/hint/);
  await shot(q, 'ipad-hint');
  // 老師提前結束：結算、最需要加強的步驟
  await tp.getByTestId('duel-end').click();
  await expect(tp.getByTestId('duel-results')).toBeVisible();
  await expect(tp.getByTestId('duel-weak')).toBeVisible();
  await expect(p.getByTestId('duel-over')).toBeVisible();
  await shot(tp, 'teacher-results');
  await shot(p, 'phone-over');
});
