// 十字交乘・全班連線對戰：老師在課堂老師工具列（或「遊戲活動」頁）開始對戰，學生用平常的課堂登入在 iPad 上作答。
// 每位同學題目不同；送出先顯示中性的「已送出／判定中」，伺服器回來才顯示 ✓／✗；大螢幕排行榜、紅藍拔河即時更新；
// 同學得分時，自己的題目不重畫、不跳動。學生收到的每個 HTTP 回應與 WebSocket 訊息在送出前都不含因式分解。
// 答案由測試自己從原式與卡片算出（列舉卡片擺法），不讀伺服器的答案。
// 重點（shared/game-focus.ts）：開始設定選重點（名稱＋例子）、預設固定、勾選才自動前進；混合兩位同學各自三種都會出現。
// 答錯冷卻（伺服器）：連錯 3、4、5 秒，學生 iPad 顯示「答錯了，N 秒後再試」倒數（伺服器時間），倒數完才能拿下一題。
// 先提公因式、首項為負：先選正的公因數、再選「提出負號」的式子，同一次送出由伺服器判定。
// 截圖：CROSS_SHOTS=1 時才寫，只寫到 artifacts/cross-2026-11-18c/，不寫 artifacts/screenshots，也不動之前的截圖。
import { test, expect, type Page, type Locator, type Browser, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { crossClassify, crossJudge, crossSignOptions, crossSignSalt, factoredTex, gcd, type CrossFill } from '../../shared/cross';
import { CROSS_FOCUS } from '../../shared/game-focus';
import { expectPickCue, expectXColorDistinct } from './cross-colors';

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const shots = resolve('artifacts/cross-2026-11-18c');
const contexts: BrowserContext[] = [];
const cleanup: { context: BrowserContext; id: string }[] = [];

async function surface(browser: Browser, width: number, height: number, touch = false) {
  const context = await browser.newContext({ baseURL, viewport: { width, height }, hasTouch: touch, deviceScaleFactor: 1 });
  contexts.push(context);
  return { context, page: await context.newPage() };
}
async function shot(page: Page | Locator, name: string, prefix = 'live-') {
  if (process.env.CROSS_SHOTS !== '1') return;
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: resolve(shots, `${prefix}${name}.png`) });
}
test.afterEach(async () => {
  for (const r of cleanup.splice(0)) await r.context.request.delete(`/api/sessions/${r.id}`, { headers: { Origin: baseURL }, data: {} });
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

async function teacherLogin(page: Page) {
  await page.goto('/');
  await page.getByLabel('帳號').fill('teacher');
  await page.getByLabel('密碼').fill('11235813');
  await page.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(page.getByTestId('lesson-card').first()).toBeVisible();
  const cl = (await (await page.request.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  await page.request.patch(`/api/classes/${cl.id}`, { headers: { Origin: baseURL }, data: { requireCode: false } });
}
async function startSession(page: Page, context: BrowserContext) {
  await page.getByTestId('lesson-card').first().getByRole('button', { name: '開始上課' }).click();
  await page.locator('#start-form select').selectOption('demo-class');
  await page.locator('#start-form').getByRole('button', { name: '開始上課' }).click();
  await expect(page.getByTestId('session-slide')).toBeVisible();
  const id = page.url().split('/session/')[1];
  cleanup.push({ context, id });
  return id;
}
/** 學生 iPad：記下收到的每一個 /api 回應與 WebSocket 訊息（檢查答案有沒有外洩）。 */
async function student(browser: Browser, seat: number) {
  const s = await surface(browser, 820, 1180, true);
  const seen: { at: number; text: string; url: string }[] = [];
  s.page.on('websocket', (ws) => ws.on('framereceived', (f) => seen.push({ at: Date.now(), text: String(f.payload), url: 'ws' })));
  s.page.on('response', async (r) => {
    if (!r.url().includes('/api/')) return;
    try {
      seen.push({ at: Date.now(), text: await r.text(), url: r.url() });
    } catch {}
  });
  await s.page.goto('/#/student');
  await s.page.getByLabel('座號').fill(String(seat));
  await s.page.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(s.page.getByTestId('session-slide')).toBeVisible();
  return { ...s, seat, seen };
}

type Card = { id: string; kind: 'lead' | 'const'; value: number };
/** 從畫面上的原式與卡片算答案：提出公因數（讓 x² 係數為正、三係數互質），列舉卡片擺法用 crossJudge 檢查。 */
async function solve(page: Page) {
  const poly = page.getByTestId('xl-poly');
  const [a, b, c] = await Promise.all(['a', 'b', 'c'].map(async (k) => Number(await poly.getAttribute(`data-${k}`))));
  const k = Math.sign(a) * gcd(gcd(a, b), c);
  const inner = { a: a / k, b: b / k, c: c / k };
  const leadLocked = inner.a === 1;
  // 先提公因式：選好公因數之前不產生卡片（也沒有 data-value），先選讓首項為正的 k
  if ((await page.getByTestId('xl-k').count()) && !(await page.locator('.xl-card-btn').count())) {
    await page.getByTestId(`xl-k-${k}`).tap();
    await expect(page.locator('.xl-card-btn').first()).toBeVisible();
  }
  const cards: Card[] = await page.locator('.xl-card-btn').evaluateAll((els) => els.map((e) => ({ id: (e as HTMLElement).dataset.card!, kind: (e as HTMLElement).dataset.kind as Card['kind'], value: Number((e as HTMLElement).dataset.value) })));
  const pairs = (l: Card[]) => l.flatMap((x) => l.filter((y) => y !== x).map((y) => [x, y] as const));
  const leads = leadLocked ? [[null, null] as const] : pairs(cards.filter((x) => x.kind === 'lead'));
  let right: Record<string, Card> | null = null,
    wrong: Record<string, Card> | null = null;
  for (const [p, r] of leads)
    for (const [q, s] of pairs(cards.filter((x) => x.kind === 'const'))) {
      const f: CrossFill = { lead0: p?.value, lead1: r?.value, const0: q.value, const1: s.value };
      const ok = crossJudge({ inner, leadLocked }, f).ok;
      const fill = { ...(p ? { lead0: p, lead1: r! } : {}), const0: q, const1: s };
      if (ok && !right) right = fill;
      if (!ok && !wrong) wrong = fill;
    }
  expect(right, `solvable ${a},${b},${c}`).not.toBeNull();
  const r = right!;
  const pp = r.lead0?.value ?? 1,
    rr = r.lead1?.value ?? 1;
  // 送出前不能出現的字：兩種順序的因式分解
  const forms = [factoredTex(k, pp, r.const0.value, rr, r.const1.value), factoredTex(k, rr, r.const1.value, pp, r.const0.value)];
  return { poly: { a, b, c }, k, right: r, wrong: wrong!, forms };
}
async function place(page: Page, fill: Record<string, Card>, k?: number) {
  if (k !== undefined && (await page.getByTestId('xl-k').count())) await page.getByTestId(`xl-k-${k}`).tap();
  for (const [slot, card] of Object.entries(fill)) {
    await page.getByTestId(`xl-card-${card.id}`).tap();
    await expect(page.getByTestId(`xl-card-${card.id}`)).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId(`xl-slot-${slot}`).tap();
    await expect(page.getByTestId(`xl-slot-${slot}`)).toHaveClass(/filled/);
  }
}
function assertNoLeak(seen: { at: number; text: string; url: string }[], before: number, forms: string[]) {
  const early = seen.filter((m) => m.at < before);
  expect(early.length).toBeGreaterThan(0);
  for (const m of early) {
    expect(m.text, m.url).not.toContain('"factored"');
    expect(m.text, m.url).not.toContain('crossPlay');
    expect(m.text, m.url).not.toMatch(/"seed"|"secret"|"inner"/);
    for (const f of forms) expect(m.text, m.url).not.toContain(f);
  }
}

test('live cross battle: teacher starts with tug-of-war, two iPads get different items, pending → official result, leaderboard and rope update, no jump, no leak', async ({ browser }) => {
  test.setTimeout(150_000);
  const teacher = await surface(browser, 1440, 900);
  const tp = teacher.page;
  await teacherLogin(tp);
  const id = await startSession(tp, teacher.context);
  const A = await student(browser, 31);
  const B = await student(browser, 32);

  // 老師工具列 → 十字交乘對戰 →「x² 係數為 1」＋自動進到下一個重點、紅藍拔河、門檻 800 → 開始
  await tp.getByTestId('xl-panel-open').click();
  await expect(tp.getByTestId('xl-panel')).toBeVisible();
  await tp.getByTestId('xl-focus-a1').click();
  await tp.getByTestId('xl-focus-escalate').check();
  await tp.getByTestId('xl-team').check();
  await tp.locator('#xl-margin').selectOption('800');
  await tp.getByTestId('xl-start').click();
  await expect(tp.getByTestId('xl-board')).toBeVisible();
  await expect(tp.getByTestId('xl-status')).toHaveText('進行中');
  await expect(tp.getByTestId('xl-rope')).toBeVisible();

  // 學生自動切到作答區、自動拿到題目；兩人的題目不同、隊伍不同
  for (const s of [A, B]) {
    await expect(s.page.getByTestId('xl-card')).toBeVisible();
    await expect(s.page.getByTestId('xl-poly')).toBeVisible();
    await expect(s.page.locator('.xl-card-btn')).toHaveCount(4);
  }
  const sa = await solve(A.page);
  const sb = await solve(B.page);
  expect(JSON.stringify(sa.poly)).not.toBe(JSON.stringify(sb.poly));
  const teams = await Promise.all([A, B].map((s) => s.page.getByTestId('xl-team').textContent()));
  expect(new Set(teams).size).toBe(2);
  await shot(A.page, 'student-ipad-question');
  await expect(tp.getByTestId('xl-knot')).toHaveAttribute('data-pos', '0.000');

  // B 的畫面：在題目上做記號、記下捲動位置（A 得分時不能重畫、不能跳）
  const markB = async () =>
    B.page.evaluate(() => {
      (document.querySelector('[data-testid="xl-question"]') as HTMLElement & { _mark?: number })._mark = 7;
      (document.querySelector('[data-testid="xl-tray"]') as HTMLElement & { _mark?: number })._mark = 7;
      const sc = document.querySelector('.panel-col .panel-scroll') as HTMLElement | null;
      return { y: window.scrollY, panel: sc?.scrollTop ?? 0, doc: document.documentElement.scrollTop };
    });
  // B 先放一張卡（自己的選取狀態也要留著）
  const bFirst = Object.entries(sb.right)[0];
  await B.page.getByTestId(`xl-card-${bFirst[1].id}`).tap();
  await B.page.getByTestId(`xl-slot-${bFirst[0]}`).tap();
  const before = await markB();

  // A 放好卡片；送出時伺服器慢 1.2 秒：先看到中性的「已送出／判定中」、四格鎖住，再換成官方 ✓
  await place(A.page, sa.right, sa.k);
  await A.page.route('**/api/sessions/*/cross', async (route) => {
    if (route.request().postDataJSON()?.op === 'submit') await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  const submitAt = Date.now();
  assertNoLeak(A.seen, submitAt, sa.forms);
  assertNoLeak(B.seen, submitAt, sb.forms);
  await A.page.getByTestId('xl-submit').tap();
  await expect(A.page.getByTestId('xl-card')).toHaveAttribute('data-mode', 'pending');
  await expect(A.page.getByTestId('xl-flash')).toHaveText('已送出／判定中…');
  await expect(A.page.locator('.xl-slot.pending')).toHaveCount(Object.keys(sa.right).length);
  await expect(A.page.getByTestId('xl-submit')).toBeDisabled();
  await expect(A.page.locator('.xl-slot.ok, .xl-slot.no')).toHaveCount(0);
  await shot(A.page, 'student-pending');
  await expect(A.page.getByTestId('xl-flash')).toHaveAttribute('data-ok', 'true', { timeout: 8000 });
  await expect(A.page.getByTestId('xl-flash')).toContainText('答對');
  await expect(A.page.locator('.xl-slot.ok')).toHaveCount(Object.keys(sa.right).length);
  await expect(A.page.getByTestId('xl-answer')).toBeVisible();
  await expect(A.page.getByTestId('xl-score')).not.toHaveText('0');
  await expect(A.page.getByTestId('xl-streak')).toHaveText('1');
  await expect(A.page.locator('[data-xl="red-total"], [data-xl="blue-total"]').filter({ hasText: /^[1-9]\d* 分/ })).toHaveCount(1);
  await A.page.waitForTimeout(800);
  await shot(A.page, 'student-correct');
  await A.page.unroute('**/api/sessions/*/cross');

  // 大螢幕：排行第一是 A，答對／作答 1 / 1；繩結往 A 的隊伍移動
  await expect(tp.getByTestId('xl-rows').locator('li').first()).toHaveAttribute('data-seat', '31');
  await expect(tp.getByTestId('xl-ratio')).toHaveText('1 / 1');
  const aTeam = teams[0]!.includes('紅') ? 'red' : 'blue';
  const knotPos = async () => Number(await tp.getByTestId('xl-knot').getAttribute('data-pos'));
  await expect.poll(async () => (aTeam === 'red' ? (await knotPos()) < 0 : (await knotPos()) > 0)).toBe(true);
  const pos1 = await knotPos();

  // B：拔河的分數更新了，但題目、卡片匣沒有重畫，捲動沒變，已放的卡還在
  await expect(B.page.locator('[data-xl="red-total"], [data-xl="blue-total"]').filter({ hasText: /^[1-9]\d* 分/ })).toHaveCount(1);
  const after = await B.page.evaluate(() => {
    const q = document.querySelector('[data-testid="xl-question"]') as HTMLElement & { _mark?: number };
    const sc = document.querySelector('.panel-col .panel-scroll') as HTMLElement | null;
    return { q: q?._mark, tray: (document.querySelector('[data-testid="xl-tray"]') as HTMLElement & { _mark?: number })?._mark, y: window.scrollY, panel: sc?.scrollTop ?? 0, doc: document.documentElement.scrollTop };
  });
  expect(after.q).toBe(7);
  expect(after.tray).toBe(7);
  expect({ y: after.y, panel: after.panel, doc: after.doc }).toEqual(before);
  await expect(B.page.getByTestId(`xl-slot-${bFirst[0]}`)).toHaveClass(/filled/);
  await shot(tp, 'teacher-leaderboard');

  // B 送出錯的：官方 ✗，連對 0，分數 0
  await B.page.getByTestId(`xl-slot-${bFirst[0]}`).tap(); // 點已放的格子收回
  await expect(B.page.getByTestId(`xl-slot-${bFirst[0]}`)).not.toHaveClass(/filled/);
  await place(B.page, sb.wrong, sb.k);
  await B.page.getByTestId('xl-submit').tap();
  await expect(B.page.getByTestId('xl-flash')).toHaveAttribute('data-ok', 'false');
  await expect(B.page.getByTestId('xl-flash')).toContainText('✗');
  await expect(B.page.locator('.xl-slot.no').first()).toBeVisible();
  await expect(B.page.getByTestId('xl-score')).toHaveText('0');
  await expect(tp.getByTestId('xl-ratio')).toHaveText('1 / 2');
  // 答錯後冷卻：「下一題」中性地倒數（停用、灰色），3 秒後才能按；「答錯了，N 秒後再試」
  await expect(B.page.getByTestId('xl-next')).toBeDisabled();
  await expect(B.page.getByTestId('xl-next')).toContainText(/下一題（\d 秒）/);
  await expect(B.page.getByTestId('xl-next')).toHaveClass(/xl-cooling/);
  await expect(B.page.getByTestId('xl-cool')).toBeVisible();
  await expect(B.page.getByTestId('xl-next')).toBeEnabled({ timeout: 6000 });
  await expect(B.page.getByTestId('xl-cool')).toBeHidden();
  await expect(B.page.getByTestId('xl-next')).toHaveText('下一題');
  await expect(B.page.getByTestId('xl-mine-ratio')).toHaveText('0/1');

  // 老師「公布」A 的第一題：因式分解（用題目 ID，不用會位移的索引）
  await tp.getByTestId('xl-reveal-31-1').click();
  await expect(tp.getByTestId('xl-revealed').first()).toBeVisible();

  // A 再答對兩題：拔河繼續往 A 那邊、連對 3
  for (let i = 0; i < 2; i++) {
    await A.page.getByTestId('xl-next').tap();
    await expect(A.page.getByTestId('xl-card')).toHaveAttribute('data-mode', 'item');
    const s2 = await solve(A.page);
    await place(A.page, s2.right, s2.k);
    await A.page.getByTestId('xl-submit').tap();
    await expect(A.page.getByTestId('xl-flash')).toHaveAttribute('data-ok', 'true');
  }
  await expect(A.page.getByTestId('xl-streak')).toHaveText('3');
  await expect(A.page.getByTestId('xl-flash')).toContainText('進到「x² 係數不為 1」');
  await expect.poll(async () => Math.abs(Number(await tp.getByTestId('xl-knot').getAttribute('data-pos')))).toBeGreaterThan(Math.abs(pos1));
  await A.page.getByTestId('xl-next').tap();
  await expect(A.page.getByTestId('xl-level-now')).toHaveText('x² 係數不為 1');
  await expect(A.page.getByTestId('xl-item-focus')).toHaveAttribute('data-level', '2');
  await expect(A.page.locator('.xl-card-btn')).toHaveCount(6);
  await expect(tp.getByTestId('xl-ratio')).toHaveText('3 / 4');
  await expect(B.page.locator('[data-xl="red-total"], [data-xl="blue-total"]').filter({ hasText: /^[1-9]\d* 分/ })).toHaveCount(1);
  await tp.waitForTimeout(800); // 繩結動畫跑完再截圖
  await shot(tp, 'team-tug-of-war');

  // 暫停：學生看到暫停中；繼續後回到題目
  await tp.getByTestId('xl-pause').click();
  await expect(A.page.getByTestId('xl-paused')).toBeVisible();
  await expect(tp.getByTestId('xl-status')).toHaveText('暫停中');
  await tp.getByTestId('xl-resume').click();
  await expect(A.page.getByTestId('xl-card')).toHaveAttribute('data-mode', 'item');
  // 結束：學生看到結算
  await tp.getByTestId('xl-end').click();
  await expect(A.page.getByTestId('xl-over')).toBeVisible();
  await expect(tp.getByTestId('xl-banner')).toHaveClass(/on/);
});

test('submit failure removes the pending state and unlocks; a late response for an old item is ignored', async ({ browser }) => {
  test.setTimeout(90_000);
  const teacher = await surface(browser, 1280, 800);
  const tp = teacher.page;
  await teacherLogin(tp);
  const id = await startSession(tp, teacher.context);
  const A = await student(browser, 33);
  await tp.getByTestId('xl-panel-open').click();
  await tp.getByTestId('xl-team').uncheck();
  await tp.getByTestId('xl-start').click();
  await expect(A.page.getByTestId('xl-poly')).toBeVisible();
  const s1 = await solve(A.page);
  await place(A.page, s1.right, s1.k);
  // 網路斷掉：判定中消失、解鎖，卡片還在，可以再送
  await A.page.route('**/api/sessions/*/cross', (route) => (route.request().postDataJSON()?.op === 'submit' ? route.abort() : route.continue()));
  await A.page.getByTestId('xl-submit').tap();
  await expect(A.page.getByTestId('xl-card')).toHaveAttribute('data-mode', 'item');
  await expect(A.page.locator('.xl-slot.pending')).toHaveCount(0);
  await expect(A.page.getByTestId('xl-submit')).toBeEnabled();
  await expect(A.page.locator('.xl-slot.filled')).toHaveCount(Object.keys(s1.right).length);
  await A.page.unroute('**/api/sessions/*/cross');
  // 送出很慢，期間老師「重新開始」（新的一場）：晚到的回應不能蓋掉新一場的題目
  await A.page.route('**/api/sessions/*/cross', async (route) => {
    if (route.request().postDataJSON()?.op === 'submit') await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await A.page.getByTestId('xl-submit').tap();
  await expect(A.page.getByTestId('xl-card')).toHaveAttribute('data-mode', 'pending');
  await tp.getByTestId('xl-reset').click();
  await expect(A.page.getByTestId('xl-card')).toHaveAttribute('data-mode', 'item', { timeout: 8000 });
  const fresh = await A.page.getByTestId('xl-question').getAttribute('data-item');
  await A.page.waitForTimeout(3000);
  await expect(A.page.getByTestId('xl-card')).toHaveAttribute('data-mode', 'item');
  await expect(A.page.getByTestId('xl-question')).toHaveAttribute('data-item', fresh!);
  await expect(A.page.locator('.xl-slot.ok, .xl-slot.no')).toHaveCount(0);
  await expect(A.page.getByTestId('xl-score')).toHaveText('0');
  expect(id).toBeTruthy();
});

/** 老師用 API 控制（和按鈕走同一個端點）。 */
async function control(page: Page, id: string, data: Record<string, unknown>) {
  const r = await page.request.post(`/api/sessions/${id}/control`, { headers: { Origin: baseURL }, data });
  expect(r.status(), JSON.stringify(data)).toBe(200);
  return r.json();
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('stale HTTP responses: the server already processed, the WebSocket push arrived first, the HTTP response is late — never overwrites newer state, stats are not counted twice', async ({ browser }) => {
  test.setTimeout(120_000);
  const teacher = await surface(browser, 1280, 800);
  const tp = teacher.page;
  await teacherLogin(tp);
  const id = await startSession(tp, teacher.context);
  const A = await student(browser, 35);
  // 第一次拿題：伺服器處理完（route.fetch），回應晚 5 秒才交給頁面
  let nextHeld = 0,
    nextReleased = false;
  await A.page.route('**/api/sessions/*/cross', async (route) => {
    if (route.request().postDataJSON()?.op === 'next' && nextHeld++ === 0) {
      const response = await route.fetch();
      await sleep(5000);
      await route.fulfill({ response });
      nextReleased = true;
      return;
    }
    await route.continue();
  });
  await control(tp, id, { action: 'cross-start', level: 1, seconds: 0 });
  // 推送先到：題目已經在畫面上（HTTP 回應還沒回來）
  await expect(A.page.getByTestId('xl-poly')).toBeVisible({ timeout: 4500 });
  expect(nextReleased).toBe(false);
  const first = await A.page.getByTestId('xl-question').getAttribute('data-item');
  const s1 = await solve(A.page);
  await place(A.page, s1.right, s1.k);
  await A.page.getByTestId('xl-submit').tap();
  await expect(A.page.getByTestId('xl-flash')).toHaveAttribute('data-ok', 'true');
  const score1 = await A.page.getByTestId('xl-score').textContent();
  await expect(A.page.getByTestId('xl-mine-ratio')).toHaveText('1/1');
  // 舊的拿題回應現在才到：不能把已經送出的題目裝回去、不能清掉判定
  await expect.poll(() => nextReleased, { timeout: 8000 }).toBe(true);
  await A.page.waitForTimeout(800);
  await expect(A.page.getByTestId('xl-card')).toHaveAttribute('data-mode', 'result');
  await expect(A.page.getByTestId('xl-question')).toHaveAttribute('data-item', first!);
  await expect(A.page.getByTestId('xl-flash')).toHaveAttribute('data-ok', 'true');
  await expect(A.page.getByTestId('xl-score')).toHaveText(score1!);
  await A.page.unroute('**/api/sessions/*/cross');

  // 送出：伺服器已經判定、推送先到，HTTP 回應晚 2.5 秒；統計用伺服器的（不會變成 2 題）
  await A.page.getByTestId('xl-next').tap();
  await expect(A.page.getByTestId('xl-card')).toHaveAttribute('data-mode', 'item');
  const second = await A.page.getByTestId('xl-question').getAttribute('data-item');
  expect(second).not.toBe(first);
  let submitFetched = false;
  await A.page.route('**/api/sessions/*/cross', async (route) => {
    if (route.request().postDataJSON()?.op === 'submit') {
      const response = await route.fetch();
      submitFetched = true;
      await sleep(2500);
      await route.fulfill({ response });
      return;
    }
    await route.continue();
  });
  const s2 = await solve(A.page);
  await place(A.page, s2.right, s2.k);
  await A.page.getByTestId('xl-submit').tap();
  await expect.poll(() => submitFetched).toBe(true);
  await expect(tp.getByTestId('xl-ratio')).toHaveText('2 / 2'); // 推送已經送出
  await A.page.waitForTimeout(500);
  await expect(A.page.getByTestId('xl-card')).toHaveAttribute('data-mode', 'pending'); // 推送沒有提早結束判定中
  await expect(A.page.getByTestId('xl-flash')).toHaveAttribute('data-ok', 'true', { timeout: 6000 });
  await expect(A.page.getByTestId('xl-question')).toHaveAttribute('data-item', second!);
  await expect(A.page.getByTestId('xl-mine-ratio')).toHaveText('2/2');
  await expect(A.page.getByTestId('xl-streak')).toHaveText('2');
  const pts = Number((await A.page.getByTestId('xl-flash').locator('b').textContent())!.match(/＋(\d+)/)![1]);
  await expect(A.page.getByTestId('xl-score')).toHaveText(String(Number(score1) + pts));
  // 之後再有推送（老師的操作）：還是 2/2
  await control(tp, id, { action: 'danmaku', value: true });
  await A.page.waitForTimeout(800);
  await expect(A.page.getByTestId('xl-mine-ratio')).toHaveText('2/2');
  await expect(A.page.getByTestId('xl-card')).toHaveAttribute('data-mode', 'result');
});

test('same-session round trip with an in-flight submit: the first render after returning never shows the old pending or verdict, and the late response is ignored', async ({ browser }) => {
  test.setTimeout(90_000);
  const teacher = await surface(browser, 1280, 800);
  const tp = teacher.page;
  await teacherLogin(tp);
  const id = await startSession(tp, teacher.context);
  const A = await student(browser, 38);
  await control(tp, id, { action: 'cross-start', level: 1, seconds: 0 });
  await expect(A.page.getByTestId('xl-poly')).toBeVisible();
  const old = await A.page.getByTestId('xl-question').getAttribute('data-item');
  const s1 = await solve(A.page);
  await place(A.page, s1.right, s1.k);
  // 送出：伺服器照常處理，但回應卡住，直到測試放行
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await A.page.route('**/api/sessions/*/cross', async (route) => {
    if (route.request().postDataJSON()?.op !== 'submit') return route.continue();
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  await A.page.getByTestId('xl-submit').tap();
  await expect(A.page.getByTestId('xl-card')).toHaveAttribute('data-mode', 'pending');
  // 同一堂課、同一場：換路由再回來（重新載入課堂、沿用同一條 WebSocket）。記下回來後第一次畫出的卡片狀態
  await A.page.evaluate(() => {
    const w = window as unknown as { __xlModes: string[] };
    w.__xlModes = [];
    // 換路由前的那張卡片（還在判定中、時鐘會跳）不算：只記重新載入後畫出的新卡片
    const before = document.querySelector<HTMLElement>('[data-testid="xl-card"]');
    new MutationObserver(() => {
      const card = document.querySelector<HTMLElement>('[data-testid="xl-card"]');
      if (card && card !== before) w.__xlModes.push(`${card.dataset.mode}:${card.querySelector<HTMLElement>('[data-testid="xl-question"]')?.dataset.item || ''}`);
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-mode'] });
    location.hash = '#/student/again';
  });
  await expect(A.page.getByTestId('xl-card')).toHaveAttribute('data-mode', 'item', { timeout: 10_000 });
  await expect(A.page.getByTestId('xl-question')).not.toHaveAttribute('data-item', old!);
  const modes = await A.page.evaluate(() => (window as unknown as { __xlModes: string[] }).__xlModes);
  expect(modes.length).toBeGreaterThan(0);
  for (const m of modes) {
    expect(m.startsWith('pending'), `no stale pending after returning: ${modes.join(', ')}`).toBe(false);
    expect(m.startsWith('result'), `no stale verdict after returning: ${modes.join(', ')}`).toBe(false);
  }
  await expect(A.page.locator('.xl-slot.pending')).toHaveCount(0);
  const fresh = await A.page.getByTestId('xl-question').getAttribute('data-item');
  // 舊的回應現在才到：不能把判定或「判定中」畫回來
  release();
  await A.page.waitForTimeout(1500);
  await expect(A.page.getByTestId('xl-card')).toHaveAttribute('data-mode', 'item');
  await expect(A.page.getByTestId('xl-question')).toHaveAttribute('data-item', fresh!);
  await expect(A.page.locator('.xl-slot.ok, .xl-slot.no, .xl-slot.pending')).toHaveCount(0);
  // 伺服器那一次確實判過（只判一次），統計由伺服器的推送／畫面帶回
  await expect(A.page.getByTestId('xl-mine-ratio')).toHaveText('1/1');
  await A.page.unroute('**/api/sessions/*/cross');
});

test('session switch: the old session had a much higher revision; the student follows the new session, gets a fresh item and can submit', async ({ browser }) => {
  test.setTimeout(120_000);
  const teacher = await surface(browser, 1280, 800);
  const tp = teacher.page;
  await teacherLogin(tp);
  const id1 = await startSession(tp, teacher.context);
  const A = await student(browser, 36);
  await control(tp, id1, { action: 'cross-start', level: 1, seconds: 0 });
  await expect(A.page.getByTestId('xl-poly')).toBeVisible();
  const old = await A.page.getByTestId('xl-question').getAttribute('data-item');
  // 舊課堂的 revision 衝高
  for (let i = 0; i < 30; i++) await control(tp, id1, { action: 'danmaku', value: i % 2 === 0 });
  await A.page.waitForTimeout(800);
  // 下課；同一班開新的一堂課，再開對戰
  await control(tp, id1, { action: 'end' });
  const dash = await (await tp.request.get('/api/dashboard')).json();
  const cl = dash.classes.find((c: { code: string }) => c.code === 'DEMO801');
  const r = await tp.request.post('/api/sessions', { headers: { Origin: baseURL }, data: { lessonId: dash.lessons[0].id, classId: cl.id } });
  expect(r.status()).toBe(200);
  const id2 = (await r.json()).session.id as string;
  cleanup.push({ context: teacher.context, id: id2 });
  await control(tp, id2, { action: 'cross-start', level: 1, seconds: 0 });
  // 學生跟著到新的一堂，拿到新題目（不被舊課堂的 revision 擋住），可以送出
  await expect(A.page.getByTestId('xl-poly')).toBeVisible({ timeout: 20_000 });
  await expect(A.page.getByTestId('xl-question')).not.toHaveAttribute('data-item', old!);
  const s = await solve(A.page);
  await place(A.page, s.right, s.k);
  await A.page.getByTestId('xl-submit').tap();
  await expect(A.page.getByTestId('xl-flash')).toHaveAttribute('data-ok', 'true');
  await expect(A.page.getByTestId('xl-mine-ratio')).toHaveText('1/1');
  const v2 = await (await tp.request.get(`/api/sessions/${id2}`)).json();
  expect(v2.cross.totals).toEqual({ players: 1, correct: 1, attempts: 1 });
});

test('double submit through the Durable Object queue and idle time-limit expiry settled by the server alarm (client settle requests blocked)', async ({ browser }) => {
  test.setTimeout(120_000);
  const teacher = await surface(browser, 1280, 800);
  const tp = teacher.page;
  await teacherLogin(tp);
  const id = await startSession(tp, teacher.context);
  await expect(tp.getByTestId('session-slide')).toBeVisible();
  const A = await student(browser, 37);
  // 用戶端的 settle 全部擋掉：只能靠伺服器的 alarm 結束
  let settleBlocked = 0;
  for (const page of [tp, A.page])
    await page.route('**/api/sessions/*/cross', (route) => {
      if (route.request().postDataJSON()?.op === 'settle') {
        settleBlocked++;
        return route.abort();
      }
      return route.continue();
    });
  await control(tp, id, { action: 'cross-start', level: 1, seconds: 12 });
  await tp.reload();
  await expect(tp.getByTestId('xl-board')).toBeVisible();
  await expect(A.page.getByTestId('xl-poly')).toBeVisible();
  // 同一題同時送出兩次（佇列一次處理一個）：只判一次
  const s = await solve(A.page);
  const item = await A.page.getByTestId('xl-question').getAttribute('data-item');
  const run = (await (await tp.request.get(`/api/sessions/${id}`)).json()).session.cross.id;
  await A.page.waitForTimeout(400);
  const cards = Object.fromEntries(Object.entries(s.right).map(([k, c]) => [k, c.id]));
  const statuses = await A.page.evaluate(
    async ({ id, run, item, cards }) => {
      const send = () => fetch(`/api/sessions/${id}/cross`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: run, op: 'submit', itemId: item, cards }) }).then((r) => r.status);
      return Promise.all([send(), send()]);
    },
    { id, run, item, cards },
  );
  expect(statuses.filter((x) => x === 200)).toHaveLength(1);
  expect(statuses.filter((x) => x === 409 || x === 429)).toHaveLength(1);
  await expect(tp.getByTestId('xl-ratio')).toHaveText('1 / 1');
  await A.page.waitForTimeout(1500);
  const revBefore = (await (await tp.request.get(`/api/sessions/${id}`)).json()).session.revision as number;
  // 之後全班閒置：時間到時伺服器自己結算、保存、推送
  await expect(tp.getByTestId('xl-banner')).toHaveClass(/on/, { timeout: 25_000 });
  await expect(A.page.getByTestId('xl-over')).toBeVisible({ timeout: 10_000 });
  const v = await (await tp.request.get(`/api/sessions/${id}`)).json();
  expect(v.session.cross.endedAt).toBeTruthy();
  expect(v.session.cross.endedAt).toBe(v.session.cross.deadline);
  // 真的保存了（不是讀取時才算出來的）：revision 加了、匯出的場次紀錄有結束時間
  expect(v.session.revision).toBeGreaterThan(revBefore);
  const exported = await (await tp.request.get(`/api/sessions/${id}/export`)).json();
  expect(exported.crossRuns.find((r: { id: string }) => r.id === run).endedAt).toBe(v.session.cross.deadline);
  console.log(`client settle requests blocked: ${settleBlocked}`);
});

test('遊戲活動 entry: pick the class session and start the battle; students join through the normal classroom', async ({ browser }) => {
  test.setTimeout(90_000);
  const teacher = await surface(browser, 1440, 900);
  const tp = teacher.page;
  await teacherLogin(tp);
  const id = await startSession(tp, teacher.context);
  const A = await student(browser, 34);
  await tp.goto('/#/games');
  await expect(tp.getByTestId('game-cross-live')).toBeVisible();
  // 遊戲活動頁的對戰卡片也用同一個重點選擇（名稱＋例子）
  const live = tp.getByTestId('game-cross-live');
  for (const f of CROSS_FOCUS) await expect(live.getByTestId(`xl-game-focus-${f.id}`)).toBeVisible();
  await expect(live).not.toContainText(/L[123]\b/);
  await shot(tp, 'games-picker', '');
  await live.getByTestId('xl-game-focus-gcf').click();
  await tp.getByTestId('xl-game-session').selectOption(id);
  await tp.getByTestId('xl-game-start').click();
  await expect(tp).toHaveURL(new RegExp(`/session/${id}`));
  await expect(tp.getByTestId('xl-board')).toBeVisible();
  await expect(tp.getByTestId('xl-panel-status')).toContainText('重點：先提公因式（固定）');
  await expect(A.page.getByTestId('xl-poly')).toBeVisible();
  await expect(A.page.getByTestId('xl-item-focus')).toHaveAttribute('data-level', '3');
  await expect(A.page.getByTestId('xl-k')).toBeVisible();
  await expect(A.page.getByTestId('xl-team')).toHaveCount(0);
});

/** 學生答對目前這一題（含公因數），回傳這一題的等級；然後按「下一題」等新題。 */
async function answerRight(page: Page) {
  await expect(page.getByTestId('xl-card')).toHaveAttribute('data-mode', 'item');
  const level = Number(await page.getByTestId('xl-item-focus').getAttribute('data-level'));
  const sol = await solve(page);
  // 畫面上的重點標籤和原式的分類一致
  expect(crossClassify({ poly: sol.poly })).toBe(level);
  await place(page, sol.right, sol.k);
  // 伺服器限速：拿題後至少隔 0.3 秒才能送出（CROSS_MIN_GAP）。測試放卡太快時會被 429 擋下（偶發失敗），先等一下
  await page.waitForTimeout(350);
  await page.getByTestId('xl-submit').tap();
  await expect(page.getByTestId('xl-flash')).toHaveAttribute('data-ok', 'true');
  return level;
}

test('live start dialog: focus choices with examples; students get items of the chosen focus, which stays put by default; mix with 2 students covers all three', async ({ browser }) => {
  test.setTimeout(180_000);
  const teacher = await surface(browser, 1440, 900);
  const tp = teacher.page;
  await teacherLogin(tp);
  await startSession(tp, teacher.context);
  const A = await student(browser, 36);
  const B = await student(browser, 37);

  await tp.getByTestId('xl-panel-open').click();
  const dialog = tp.getByTestId('xl-panel');
  await expect(dialog).toBeVisible();
  // 四個重點，各有名稱與一行例子（KaTeX），沒有 L 數字；預設不自動前進
  for (const f of CROSS_FOCUS) {
    const opt = dialog.getByTestId(`xl-focus-${f.id}`);
    await expect(opt).toBeVisible();
    if (f.example) await expect(opt.locator('.fx-example .katex')).toHaveCount(1);
    else await expect(opt).toContainText(f.exampleText!);
  }
  await expect(dialog.getByTestId('xl-focus-gcf')).toContainText('含首項為負');
  await expect(dialog).not.toContainText(/L[123]\b/);
  await expect(dialog.getByTestId('xl-focus-escalate')).not.toBeChecked();
  // 先提公因式：沒有下一個重點 → 勾選取消並停用（和大板一樣）；混合：整個隱藏
  await dialog.getByTestId('xl-focus-a1').click();
  await dialog.getByTestId('xl-focus-escalate').check();
  await dialog.getByTestId('xl-focus-gcf').click();
  await expect(dialog.getByTestId('xl-focus-escalate')).toBeDisabled();
  await expect(dialog.getByTestId('xl-focus-escalate')).not.toBeChecked();
  await expect(dialog.getByTestId('xl-focus-escalate')).toBeVisible();
  await dialog.getByTestId('xl-focus-mix').click();
  await expect(dialog.getByTestId('xl-focus-escalate')).toBeHidden();
  await expect(dialog.getByTestId('xl-focus-escalate')).toBeDisabled();
  await dialog.getByTestId('xl-focus-a-not-1').click();
  await expect(dialog.getByTestId('xl-focus-escalate')).toBeVisible();
  await expect(dialog.getByTestId('xl-focus-escalate')).toBeEnabled();
  await expect(dialog.getByTestId('xl-focus-escalate')).not.toBeChecked();
  await expect(dialog.getByTestId('xl-focus-a-not-1')).toHaveClass(/\bon\b/);
  await shot(dialog, 'start-dialog');
  await tp.getByTestId('xl-start').click();
  await expect(tp.getByTestId('xl-board')).toBeVisible();
  await expect(tp.getByTestId('xl-panel-status')).toContainText('重點：x² 係數不為 1（固定）');

  // 學生拿到的都是「x² 係數不為 1」；連對 3 題後還是（預設固定）
  await expect(A.page.getByTestId('xl-item-focus')).toHaveAttribute('data-level', '2');
  await expect(A.page.getByTestId('xl-item-focus')).toContainText('係數不為 1');
  await expect(A.page.getByTestId('xl-level-now')).toHaveText('x² 係數不為 1');
  await expect(B.page.getByTestId('xl-item-focus')).toHaveAttribute('data-level', '2');
  // 學生端的 x 係數卡（橘）和常數卡（藍）分得出來
  await expectXColorDistinct(B.page, '.xl-card-btn.lead', '.xl-card-btn:not(.lead)');
  // 已放 x 卡的格子＋另選一張卡：格子框是 navy 選取提示（不是橘色）；取消選取後回到橘色
  {
    const leads = B.page.locator('.xl-card-btn.lead');
    const [a, b] = [(await leads.nth(0).getAttribute('data-card'))!, (await leads.nth(1).getAttribute('data-card'))!];
    await B.page.getByTestId(`xl-card-${a}`).tap();
    await B.page.getByTestId('xl-slot-lead0').tap();
    await expect(B.page.getByTestId('xl-slot-lead0')).toHaveClass(/filled/);
    await expectXColorDistinct(B.page, '[data-testid="xl-slot-lead0"]', '.xl-card-btn:not(.lead)');
    await B.page.getByTestId(`xl-card-${b}`).tap();
    await expect(B.page.getByTestId('xl-slot-lead0')).toHaveClass(/\btarget\b/);
    await expectPickCue(B.page, '[data-testid="xl-slot-lead0"]', 'border');
    await B.page.getByTestId(`xl-card-${b}`).tap();
    await B.page.getByTestId('xl-slot-lead0').tap();
    await expect(B.page.getByTestId('xl-slot-lead0')).not.toHaveClass(/filled/);
  }
  for (let i = 0; i < 3; i++) {
    if (i) await A.page.getByTestId('xl-next').tap();
    expect(await answerRight(A.page)).toBe(2);
  }
  await expect(A.page.getByTestId('xl-flash')).not.toContainText('進到');
  await A.page.getByTestId('xl-next').tap();
  await expect(A.page.getByTestId('xl-item-focus')).toHaveAttribute('data-level', '2');
  // 大螢幕排行：重點名稱，不是 L 數字
  await expect(tp.getByTestId('xl-rows').locator('li').first()).toContainText('x² 係數不為 1');
  await expect(tp.getByTestId('xl-rows')).not.toContainText(/L[123]\b/);

  // 換成混合（結束這一場 → 關閉 → 選混合 → 開始）：兩位同學各答 3 題，三種重點都會出現
  await tp.getByTestId('xl-end').click();
  await tp.getByTestId('xl-close').click();
  await tp.getByTestId('xl-panel-open').click();
  await tp.getByTestId('xl-focus-mix').click();
  await tp.getByTestId('xl-start').click();
  await expect(tp.getByTestId('xl-panel-status')).toContainText('重點：混合');
  const seen: Record<string, number[]> = { A: [], B: [] };
  for (let i = 0; i < 3; i++)
    for (const [name, s] of [['A', A], ['B', B]] as const) {
      if (i) await s.page.getByTestId('xl-next').tap();
      await expect(s.page.getByTestId('xl-level-now')).toHaveText('混合');
      if (name === 'A' && i === 0) {
        await expect(A.page.getByTestId('xl-item-focus')).toBeVisible();
        await shot(A.page, 'student-focus');
      }
      seen[name].push(await answerRight(s.page));
    }
  for (const name of ['A', 'B']) expect([...seen[name]].sort(), `${name} sees all three focuses`).toEqual([1, 2, 3]);
  await expect(tp.getByTestId('xl-ratio')).toHaveText('6 / 6');
});

/** 老師開一場（關掉拔河）；focus：重點 */
async function startBattle(tp: Page, focus: string) {
  await tp.getByTestId('xl-panel-open').click();
  await tp.getByTestId('xl-team').uncheck();
  await tp.getByTestId(`xl-focus-${focus}`).click();
  await tp.getByTestId('xl-start').click();
  await expect(tp.getByTestId('xl-board')).toBeVisible();
}

/**
 * 記下倒數出現過的數字：倒數出現過、又收起來（或從畫面消失）就停；
 * 保存 animation frame，再呼叫一次先取消上一個循環，不會疊好幾個。
 */
const watchCoolOn = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __cool: string[]; __coolRaf?: number };
    if (w.__coolRaf) cancelAnimationFrame(w.__coolRaf);
    w.__cool = [];
    const tick = () => {
      const el = document.querySelector('[data-testid="xl-cool"]') as HTMLElement | null;
      const n = el && !el.hidden ? el.querySelector('b')!.textContent! : null;
      if (n && w.__cool[w.__cool.length - 1] !== n) w.__cool.push(n);
      if (!n && w.__cool.length) {
        w.__coolRaf = undefined;
        return;
      }
      w.__coolRaf = requestAnimationFrame(tick);
    };
    tick();
  });

test('wrong submit → 「答錯了，3 秒後再試」 countdown from the server cooldown, no next / submit until it ends; the second consecutive wrong is 4 s', async ({ browser }) => {
  test.setTimeout(120_000);
  const teacher = await surface(browser, 1280, 800);
  const tp = teacher.page;
  await teacherLogin(tp);
  await startSession(tp, teacher.context);
  const A = await student(browser, 38);
  await startBattle(tp, 'a1');
  const wrongOnce = async () => {
    await expect(A.page.getByTestId('xl-card')).toHaveAttribute('data-mode', 'item');
    const s = await solve(A.page);
    await place(A.page, s.wrong, s.k);
    const res = A.page.waitForResponse((r) => r.url().includes('/cross') && r.request().postDataJSON()?.op === 'submit');
    await A.page.getByTestId('xl-submit').tap();
    await expect(A.page.getByTestId('xl-flash')).toHaveAttribute('data-ok', 'false');
    // 伺服器給的冷卻長度：同一個回應裡的 mine.cool − serverNow
    const body = await (await res).json();
    return body.mine.cool - body.serverNow;
  };
  const watchCool = () => watchCoolOn(A.page);
  await watchCool();
  const left1 = await wrongOnce();
  expect(left1).toBeGreaterThan(2500);
  expect(left1).toBeLessThanOrEqual(3000);
  const cool = A.page.getByTestId('xl-cool');
  await expect(cool).toBeVisible();
  await expect(cool).toHaveText(/^答錯了，[1-3] 秒後再試$/);
  // 答錯的擺法留在畫面上；送出、卡片、下一題都鎖住
  await expect(A.page.locator('.xl-slot.no').first()).toBeVisible();
  await expect(A.page.getByTestId('xl-next')).toBeDisabled();
  await expect(A.page.locator('.xl-card-btn:not([disabled])')).toHaveCount(0);
  await expect(A.page.getByTestId('xl-submit')).toHaveCount(0);
  await shot(A.page, 'cooldown');
  // 直接呼叫 API 拿下一題也被伺服器擋（不能靠本機縮短）
  const v = await (await A.page.request.get(`/api/student/session`)).json();
  const blocked = await A.page.request.post(`/api/sessions/${v.session.id}/cross`, { headers: { Origin: baseURL }, data: { runId: v.session.cross.id, op: 'next' } });
  expect(blocked.status()).toBe(429);
  await expect(cool).toBeHidden({ timeout: 5000 });
  await expect(A.page.getByTestId('xl-next')).toBeEnabled();
  expect(await A.page.evaluate(() => (window as unknown as { __cool: string[] }).__cool)).toEqual(['3', '2', '1']);
  // 第二次連錯：4 秒
  await A.page.getByTestId('xl-next').tap();
  await watchCool();
  const left2 = await wrongOnce();
  await expect(cool).toBeVisible();
  // 伺服器給的冷卻是 4 秒
  expect(left2).toBeGreaterThan(3500);
  expect(left2).toBeLessThanOrEqual(4000);
  await expect(cool).toBeHidden({ timeout: 6000 });
  // 送出的回應帶 serverNow（收到判定的同一刻校正時間差）：倒數不會因為回應延遲多算 1 秒
  expect(await A.page.evaluate(() => (window as unknown as { __cool: string[] }).__cool)).toEqual(['4', '3', '2', '1']);
  await expect(A.page.getByTestId('xl-next')).toBeEnabled();
});

test('cooldown is rebuilt from the server (mine.cool) after a reload; a 429 on submit resyncs and shows the countdown', async ({ browser }) => {
  test.setTimeout(120_000);
  const teacher = await surface(browser, 1280, 800);
  const tp = teacher.page;
  await teacherLogin(tp);
  await startSession(tp, teacher.context);
  const A = await student(browser, 40);
  await startBattle(tp, 'a1');
  const card = A.page.getByTestId('xl-card');
  const cool = A.page.getByTestId('xl-cool');
  // 答錯 → 馬上重新整理：本機判定沒了，倒數畫面由伺服器的 mine.cool 重建，輸入鎖住
  await expect(card).toHaveAttribute('data-mode', 'item');
  const s1 = await solve(A.page);
  await place(A.page, s1.wrong, s1.k);
  await A.page.getByTestId('xl-submit').tap();
  await expect(A.page.getByTestId('xl-flash')).toHaveAttribute('data-ok', 'false');
  await A.page.reload();
  await expect(card).toHaveAttribute('data-mode', 'cool');
  await expect(cool).toBeVisible();
  await expect(cool).toHaveText(/^答錯了，[1-3] 秒後再試$/);
  await expect(A.page.getByTestId('xl-next')).toBeDisabled();
  await expect(A.page.getByTestId('xl-next')).toHaveAttribute('data-xl', 'next');
  await expect(A.page.getByTestId('xl-next')).toContainText(/下一題（[1-3] 秒）/);
  await expect(A.page.getByTestId('xl-submit')).toHaveCount(0);
  await expect(card.locator('.xl-card-btn')).toHaveCount(0);
  // 倒數完自動拿下一題（第二次連錯的冷卻會是 4 秒）
  await expect(card).toHaveAttribute('data-mode', 'item', { timeout: 6000 });
  await expect(cool).toHaveCount(0);

  // 送出時伺服器其實已判錯，但這台 iPad 拿到的是 429（例如另一個分頁、回應遺失）：重新同步，倒數照伺服器的 mine.cool
  let hit = false;
  let rejectedAt = 0;
  await A.page.route('**/api/sessions/*/cross', async (route) => {
    const body = route.request().postDataJSON() as { op?: string } | null;
    if (body?.op !== 'submit' || hit) return route.continue();
    hit = true;
    await route.fetch(); // 伺服器照常判定（答錯、開始冷卻）
    rejectedAt = Date.now();
    await route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: '冷卻中，稍等一下再送出' }) });
  });
  const resyncs: number[] = [];
  A.page.on('request', (r) => {
    if (r.method() === 'GET' && r.url().includes('/api/student/session')) resyncs.push(Date.now());
  });
  const s2 = await solve(A.page);
  await place(A.page, s2.wrong, s2.k);
  await A.page.getByTestId('xl-submit').tap();
  await expect(card).toHaveAttribute('data-mode', 'cool');
  await expect(cool).toBeVisible();
  expect(hit).toBe(true);
  expect(resyncs.some((t) => t >= rejectedAt)).toBe(true);
  // 第二次連錯：伺服器給 4 秒
  await expect(cool).toHaveText(/^答錯了，[2-4] 秒後再試$/);
  await expect(A.page.getByTestId('xl-next')).toBeDisabled();
  await A.page.unroute('**/api/sessions/*/cross');
  await expect(card).toHaveAttribute('data-mode', 'item', { timeout: 7000 });
});

test('live 先提公因式, negative leading coefficient: positive GCF → 提出負號 options → cross step → server says correct', async ({ browser }) => {
  test.setTimeout(150_000);
  const teacher = await surface(browser, 1280, 800);
  const tp = teacher.page;
  await teacherLogin(tp);
  await startSession(tp, teacher.context);
  const A = await student(browser, 39);
  await startBattle(tp, 'gcf');
  // 一直答對直到拿到首項為負的題（每題伺服器隨機出）
  let itemStart = Date.now();
  for (let i = 0; i < 30; i++) {
    await expect(A.page.getByTestId('xl-card')).toHaveAttribute('data-mode', 'item');
    const a = Number(await A.page.getByTestId('xl-poly').getAttribute('data-a'));
    if (a < 0) break;
    const s = await solve(A.page);
    await place(A.page, s.right, s.k);
    await A.page.getByTestId('xl-submit').tap();
    await expect(A.page.getByTestId('xl-flash')).toHaveAttribute('data-ok', 'true');
    await A.page.waitForTimeout(300);
    itemStart = Date.now();
    await A.page.getByTestId('xl-next').tap();
  }
  // 還沒選公因數：沒有卡片、沒有 data-value、沒有固定左欄
  const card = A.page.getByTestId('xl-card');
  await expect(card.locator('.xl-card-btn')).toHaveCount(0);
  await expect(card.locator('[data-value]')).toHaveCount(0);
  await expect(card.locator('.xl-slot.fixed')).toHaveCount(0);
  await expect(card.locator('.xl-slot[data-action]')).toHaveCount(0);
  // solve() 先選負的公因數（直接路線）才看得到卡片
  const s = await solve(A.page);
  expect(s.poly.a).toBeLessThan(0);
  const g = -s.k;
  const before = Date.now();
  // 選正的公因數 → 第 2 步的四個選項（只差正負號）；十字圖鎖著，卡片、固定左欄、data-value 都不產生
  await A.page.getByTestId(`xl-k-${g}`).tap();
  await expect(A.page.getByTestId('xl-sign')).toBeVisible();
  await expect(A.page.getByTestId('xl-sign').locator('.xl-signbtn')).toHaveCount(4);
  await expect(A.page.locator('.xl-lock')).toBeVisible();
  await expect(card.locator('.xl-card-btn')).toHaveCount(0);
  await expect(card.locator('[data-value]')).toHaveCount(0);
  await expect(card.locator('.xl-slot.fixed')).toHaveCount(0);
  await expect(card.locator('.xl-slot[data-action]')).toHaveCount(0);
  await expect(A.page.getByTestId('xl-tray-wait')).toBeVisible();
  const id = (await A.page.getByTestId('xl-question').getAttribute('data-item'))!;
  const opts = crossSignOptions(s.poly, g, crossSignSalt(id));
  // 處理函式也擋：自己做出帶 data-action 的按鈕去點卡片、格子（繞過畫面），放卡仍然無效
  await A.page.waitForTimeout(500);
  await A.page.evaluate((fill) => {
    const host = document.querySelector('[data-testid="xl-card"]')!;
    for (const [slot, id] of Object.entries(fill)) {
      for (const [k, v] of [['card', id], ['slot', slot]]) {
        const b = document.createElement('button');
        b.dataset.action = `xl-${k}`;
        b.dataset[k] = v;
        host.append(b);
        b.click();
        b.remove();
      }
    }
  }, Object.fromEntries(Object.entries(s.right).map(([slot, c]) => [slot, c.id])));
  await A.page.waitForTimeout(300);
  // 還沒選提出負號就送出：提示，不送
  await A.page.getByTestId('xl-submit').tap();
  await expect(A.page.locator('#toast')).toContainText('先完成「提出負號」');
  await expect(A.page.getByTestId('xl-card')).toHaveAttribute('data-mode', 'item');
  await A.page.getByTestId(`xl-sign-${opts.findIndex((o) => o.ok)}`).tap();
  await expect(A.page.getByTestId(`xl-sign-${opts.findIndex((o) => o.ok)}`)).toHaveClass(/\bon\b/);
  await expect(A.page.locator('.xl-lock')).toHaveCount(0);
  await expect(A.page.locator('.xl-inner')).toContainText(`＝ −${g === 1 ? '' : g}(`);
  // 第 2 步之前偷點的卡片一張都沒放上去：四格都是空的，卡片都還在匣子裡
  await expect(card.locator('.xl-slot.filled')).toHaveCount(0);
  await expect(card.locator('.xl-card-btn.used')).toHaveCount(0);
  // 選好提出負號後才完成十字圖
  await place(A.page, s.right);
  await shot(A.page, 'gcf-step2');
  await A.page.getByTestId('xl-submit').tap();
  await expect(A.page.getByTestId('xl-flash')).toHaveAttribute('data-ok', 'true');
  // 這一題送出前收到的回應（拿題、推送）都不含因式分解，也不含提出負號的選項
  const early = A.seen.filter((m) => m.at >= itemStart && m.at < before);
  expect(early.length).toBeGreaterThan(0);
  for (const m of early) expect(m.text).not.toMatch(/"factored"|"sign/);
});
