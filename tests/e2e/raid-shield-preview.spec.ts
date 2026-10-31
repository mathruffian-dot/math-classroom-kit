// 困難魔王護盾的預覽截圖（給老師看畫面用，不是回歸測試）：MCK_SHIELD_PREVIEW=1 才跑。
// 截圖存到 os.tmpdir()/mck-shield-preview/（不寫 artifacts/screenshots）：
// 1 老師大螢幕護盾開啟（裂痕＋破盾 x/y）、2 有人打出裂痕的提示、3 破防、4 學生 iPad 橫式選招（含分析題）、
// 5 學生分析題作答（判斷＋理由）、6 分析題答錯鎖定。
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const headers = { Origin: baseURL };
const out = join(tmpdir(), 'mck-shield-preview');
type Q = { id: string; options: string[]; answer: number; reason?: { options: string[]; answer: number } };

test('raid shield preview screenshots', async ({ browser, playwright }) => {
  test.skip(!process.env.MCK_SHIELD_PREVIEW, 'MCK_SHIELD_PREVIEW=1 才跑');
  test.setTimeout(240_000);
  await mkdir(out, { recursive: true });
  const bank = JSON.parse(await readFile('content/raids/g8-2-2d.json', 'utf8')) as { pools: Record<string, Q[]> };
  const byId = new Map(Object.values(bank.pools).flat().map((q) => [q.id, q]));
  // 老師：大螢幕（1440×900）
  const tctx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const tp = await tctx.newPage();
  await tp.goto('/');
  await tp.getByLabel('帳號').fill('teacher');
  await tp.getByLabel('密碼').fill('11235813');
  await tp.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(tp.getByTestId('lesson-card').first()).toBeVisible();
  const cl = (await (await tp.request.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  await tp.request.patch(`/api/classes/${cl.id}`, { headers, data: { requireCode: false } });
  await tp.getByTestId('lesson-card').filter({ hasText: '乘法公式與根式' }).getByRole('button', { name: '開始上課' }).click();
  await tp.locator('#start-form select').selectOption('demo-class');
  await tp.locator('#start-form').getByRole('button', { name: '開始上課' }).click();
  await expect(tp.getByTestId('session-slide')).toBeVisible();
  const sessionId = tp.url().split('/session/')[1];
  // 學生：iPad 橫式（1080×810、觸控）
  const sctx = await browser.newContext({ baseURL, viewport: { width: 1080, height: 810 }, hasTouch: true, isMobile: false, deviceScaleFactor: 1 });
  const sp = await sctx.newPage();
  await sp.goto('/#/student');
  await sp.getByLabel('座號').fill('21');
  await sp.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(sp.getByTestId('session-slide')).toBeVisible();
  // 背景同學（API）
  const mates: APIRequestContext[] = [];
  for (const seat of [7, 15, 23, 31]) {
    const c = await playwright.request.newContext({ baseURL });
    expect((await c.post('/api/login', { headers, data: { role: 'student', classCode: 'DEMO801', seat } })).status()).toBe(200);
    mates.push(c);
  }
  try {
    await tp.locator('.slide-dots button').last().click();
    await tp.locator('#raid-difficulty').selectOption('hard');
    await tp.locator('#raid-seconds').selectOption('600');
    await tp.getByTestId('raid-start').click();
    await expect(tp.getByTestId('raid-board')).toBeVisible();
    const view = await (await tp.request.get(`/api/sessions/${sessionId}`)).json();
    const runId = view.raid.run.id;
    const post = (c: APIRequestContext, data: Record<string, unknown>) => c.post(`/api/sessions/${sessionId}/raid`, { headers, data: { runId, ...data } });
    for (const m of mates) await post(m, { op: 'role', role: 'mage' });
    await sp.getByTestId('raid-role-mage').click();
    await sp.getByTestId('raid-goal-skip').click();
    await expect(sp.getByTestId('raid-kind-analysis')).toBeVisible({ timeout: 10_000 });
    const answer = async (m: APIRequestContext, kind: string) => {
      const q = (await (await post(m, { op: 'draw', kind })).json()).question as { id: string; options: string[]; reason?: string[] };
      const it = byId.get(q.id)!;
      return (await post(m, { op: 'answer', choice: q.options.indexOf(it.options[it.answer]), ...(it.reason ? { reason: q.reason!.indexOf(it.reason.options[it.reason.answer]) } : {}) })).json();
    };
    // 記憶題打到 70%：護盾開啟
    for (let i = 0; i < 60; i++) {
      const st = (await (await tp.request.get(`/api/sessions/${sessionId}`)).json()).raid.state;
      if (st.phase) break;
      await answer(mates[i % 4], 'attack');
    }
    await expect(tp.getByTestId('raid-phase')).toBeVisible();
    // 護盾期間魔王攻擊減弱的說明（2026-11-01）
    await expect(tp.getByTestId('raid-phase-weak')).toContainText('普攻減半、暫停蓄力');
    // 1. 一道裂痕之後（等提示條消失）
    await answer(mates[0], 'analysis');
    await tp.waitForTimeout(3800);
    await tp.screenshot({ path: join(out, '1-teacher-shield-open.png') });
    // 2. 有人打出裂痕的提示
    await answer(mates[1], 'analysis');
    await tp.waitForTimeout(700);
    await tp.screenshot({ path: join(out, '2-teacher-crack-toast.png') });
    // 4. 學生選招畫面（護盾開啟中，分析題特別標示）
    await expect(sp.getByTestId('raid-kind-analysis')).toHaveClass(/hot/);
    await sp.screenshot({ path: join(out, '4-student-ipad-choose.png') });
    // 5. 分析題作答：抽到「判斷＋理由」那一種（不是就換別的類型再抽）
    let q: { id: string; options: string[]; reason?: string[] } | undefined;
    for (let i = 0; i < 30; i++) {
      await sp.locator('#student-answer [data-kind="analysis"]').first().click();
      await expect(sp.locator('#student-answer .raid-kind.k-analysis')).toBeVisible();
      const v = await (await sp.request.get(`/api/sessions/${sessionId}`)).json();
      q = v.raid.mine.question;
      if (q?.reason) break;
      await sp.locator('#student-answer .raid-switch [data-kind="attack"]').click();
      await expect(sp.locator('#student-answer .raid-kind.k-attack')).toBeVisible();
    }
    expect(q?.reason, 'drew a judgement + reason question').toBeTruthy();
    const it = byId.get(q!.id)!;
    const right = q!.options.indexOf(it.options[it.answer]);
    const rr = q!.reason!.indexOf(it.reason!.options[it.reason!.answer]);
    // 判斷選對、理由選錯（常見的「答案對、理由錯」）
    await sp.getByTestId(`raid-option-${right}`).click();
    await sp.getByTestId(`raid-reason-${(rr + 1) % q!.reason!.length}`).click();
    await expect(sp.getByTestId('raid-submit')).toBeEnabled();
    await sp.screenshot({ path: join(out, '5-student-analysis-judge-reason.png'), fullPage: false });
    // 往下捲到「理由」與送出按鈕
    await sp.getByTestId('raid-submit').scrollIntoViewIfNeeded();
    await sp.waitForTimeout(300);
    await sp.screenshot({ path: join(out, '5b-student-analysis-reason-submit.png'), fullPage: false });
    // 6. 送出：答錯，鎖 20 秒（只鎖分析題）
    await sp.getByTestId('raid-submit').click();
    await expect(sp.getByTestId('raid-analysis-lock')).toBeVisible();
    await expect(sp.getByTestId('raid-kind-analysis')).toBeDisabled();
    await sp.waitForTimeout(1200);
    await sp.screenshot({ path: join(out, '6-student-analysis-locked.png') });
    // 3. 第三道裂痕：破盾、破防
    const need = (await (await tp.request.get(`/api/sessions/${sessionId}`)).json()).raid.run.config.phase.need[0];
    for (let i = 2; i < need; i++) await answer(mates[i % 4], 'analysis');
    await expect(tp.getByTestId('raid-phase')).toContainText('破防', { timeout: 5000 });
    await tp.waitForTimeout(900);
    await tp.screenshot({ path: join(out, '3-teacher-guard-broken.png') });
    // 學生端的戰況區（破防中）
    await sp.screenshot({ path: join(out, '7-student-ipad-break.png') });
  } finally {
    await tp.request.delete(`/api/sessions/${sessionId}`, { headers, data: {} }).catch(() => undefined);
    for (const m of mates) await m.dispose();
    await tctx.close();
    await sctx.close();
  }
});
