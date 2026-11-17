// 十字交乘・全班連線對戰：老師在課堂老師工具列（或「遊戲活動」頁）開始對戰，學生用平常的課堂登入在 iPad 上作答。
// 每位同學題目不同；送出先顯示中性的「已送出／判定中」，伺服器回來才顯示 ✓／✗；大螢幕排行榜、紅藍拔河即時更新；
// 同學得分時，自己的題目不重畫、不跳動。學生收到的每個 HTTP 回應與 WebSocket 訊息在送出前都不含因式分解。
// 答案由測試自己從原式與卡片算出（列舉卡片擺法），不讀伺服器的答案。
// 截圖只寫到 artifacts/cross-2026-11-17/（live- 開頭），不寫 artifacts/screenshots。
import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { crossJudge, factoredTex, gcd, type CrossFill } from '../../shared/cross';

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const shots = resolve('artifacts/cross-2026-11-17');
const contexts: BrowserContext[] = [];
const cleanup: { context: BrowserContext; id: string }[] = [];

async function surface(browser: Browser, width: number, height: number, touch = false) {
  const context = await browser.newContext({ baseURL, viewport: { width, height }, hasTouch: touch, deviceScaleFactor: 1 });
  contexts.push(context);
  return { context, page: await context.newPage() };
}
async function shot(page: Page, name: string) {
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: resolve(shots, `live-${name}.png`) });
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

  // 老師工具列 → 十字交乘對戰 → L1、紅藍拔河、門檻 800 → 開始
  await tp.getByTestId('xl-panel-open').click();
  await expect(tp.getByTestId('xl-panel')).toBeVisible();
  await tp.getByTestId('xl-level').selectOption('1');
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
  // 答錯後冷卻：「下一題」中性地倒數（停用、灰色），1.5 秒後才能按
  await expect(B.page.getByTestId('xl-next')).toBeDisabled();
  await expect(B.page.getByTestId('xl-next')).toContainText(/下一題（\d 秒）/);
  await expect(B.page.getByTestId('xl-next')).toHaveClass(/xl-cooling/);
  await expect(B.page.getByTestId('xl-next')).toBeEnabled({ timeout: 4000 });
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
  await expect(A.page.getByTestId('xl-flash')).toContainText('升到 L2');
  await expect.poll(async () => Math.abs(Number(await tp.getByTestId('xl-knot').getAttribute('data-pos')))).toBeGreaterThan(Math.abs(pos1));
  await A.page.getByTestId('xl-next').tap();
  await expect(A.page.getByTestId('xl-level-now')).toHaveText('L2');
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
  await tp.getByTestId('xl-game-session').selectOption(id);
  await tp.getByTestId('xl-game-start').click();
  await expect(tp).toHaveURL(new RegExp(`/session/${id}`));
  await expect(tp.getByTestId('xl-board')).toBeVisible();
  await expect(A.page.getByTestId('xl-poly')).toBeVisible();
  await expect(A.page.getByTestId('xl-team')).toHaveCount(0);
});
