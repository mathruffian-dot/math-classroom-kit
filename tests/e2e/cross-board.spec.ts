// 十字交乘・大板操作（#/games/cross）：老師從「遊戲」打開；桌機用滑鼠拖曳、iPad 用觸控拖曳與「先點卡片再點格子」。
// 交叉相乘的乘積與和即時更新；答對變綠並寫出因式分解；答錯顯示差多少；下一題、提示、公布答案、等級切換；放卡片時畫面不跳動、不整個重畫。
// 拖曳穩定性：拖曳中換題／換等級／公布答案、pointercancel、lostpointercapture、第二根手指都不會留下殘影或放錯卡。
// 「iPad」測試預設是 Chromium（Edge）的觸控模擬（hasTouch＋CDP 觸控事件），不是 Safari；
// PW_BROWSER=webkit 時改走 WebKit 可執行的路徑（不用 CDP，觸控拖曳改成 tap 點選），需要先自行安裝 webkit。
// 截圖：CROSS_SHOTS=1 時存到 artifacts/cross-2026-11-17/（不寫進 artifacts/screenshots）。
import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CROSS_SLOTS, crossAnswer, crossItem, crossJudge, crossPool, crossSeed, gcd, leadText, signed, type CrossFill, type CrossSlot } from '../../shared/cross';

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const shots = resolve('artifacts/cross-2026-11-17');
const contexts: BrowserContext[] = [];
const isWebkit = process.env.PW_BROWSER === 'webkit';

async function surface(browser: Browser, width: number, height: number, touch: boolean) {
  const context = await browser.newContext({ baseURL, viewport: { width, height }, hasTouch: touch, deviceScaleFactor: 1 });
  contexts.push(context);
  return context.newPage();
}
async function shot(page: Page, name: string) {
  if (!process.env.CROSS_SHOTS) return;
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: resolve(shots, `${name}.png`) });
}
async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('帳號').fill('teacher');
  await page.getByLabel('密碼').fill('11235813');
  await page.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(page.getByTestId('lesson-card').first()).toBeVisible();
}
async function openBoard(page: Page, level: number, seed: number) {
  await page.goto(`/#/games/cross?level=${level}&seed=${seed}`);
  await expect(page.getByTestId('cross-board')).toBeVisible();
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-level', String(level));
}

type Card = { id: string; kind: 'lead' | 'const'; value: number };
/** 從畫面上的題目 key（L2:a,b,c）與卡片算出一組正確的填法，以及「兩欄乘積都對、和錯」的填法 */
async function board(page: Page) {
  const key = (await page.getByTestId('cross-board').getAttribute('data-key'))!;
  const [a, b, c] = key.split(':')[1].split(',').map(Number);
  const k = Math.sign(a) * gcd(gcd(a, b), c);
  const inner = { a: a / k, b: b / k, c: c / k };
  const item = { inner, leadLocked: inner.a === 1 };
  const cards: Card[] = await page.locator('.cx-card[data-card]').evaluateAll((els) =>
    els.map((e) => ({ id: (e as HTMLElement).dataset.card!, kind: (e as HTMLElement).dataset.kind as 'lead' | 'const', value: Number((e as HTMLElement).dataset.value) })),
  );
  const leads = cards.filter((x) => x.kind === 'lead');
  const consts = cards.filter((x) => x.kind === 'const');
  const pairs = (l: Card[]) => l.flatMap((x) => l.filter((y) => y !== x).map((y) => [x, y] as const));
  const leadPairs: (readonly [Card | null, Card | null])[] = item.leadLocked ? [[null, null]] : pairs(leads);
  let right: Partial<Record<CrossSlot, Card>> | null = null,
    wrong: Partial<Record<CrossSlot, Card>> | null = null;
  for (const [p, r] of leadPairs)
    for (const [q, s] of pairs(consts)) {
      const f: CrossFill = { lead0: p?.value, lead1: r?.value, const0: q.value, const1: s.value };
      const j = crossJudge(item, f);
      const pick = { ...(p ? { lead0: p, lead1: r! } : {}), const0: q, const1: s };
      if (j.ok && !right) right = pick;
      if (!j.ok && j.leadOk !== false && j.constOk && j.sum !== j.target && !wrong) wrong = pick;
    }
  return { key, k, inner, item, right: right!, wrong: wrong!, cards };
}
async function view(page: Page) {
  return page.evaluate(() => ({ y: scrollY, doc: document.documentElement.scrollTop, main: document.querySelector('#cx-main')!.scrollTop }));
}
/** 在板子上做標記：放卡片後還在＝沒有整個重畫 */
async function mark(page: Page) {
  await page.evaluate(() => {
    for (const sel of ['#cx-tray', '#cx-cross', '#cx-question']) (document.querySelector(sel) as HTMLElement & { _mark?: number })._mark = 1;
  });
}
async function marked(page: Page) {
  return page.evaluate(() => ['#cx-tray', '#cx-cross', '#cx-question'].every((sel) => (document.querySelector(sel) as HTMLElement & { _mark?: number })._mark === 1));
}
async function center(page: Page, selector: string) {
  const b = (await page.locator(selector).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function mouseDrag(page: Page, id: string, slot: CrossSlot) {
  const from = await center(page, `[data-card="${id}"]`);
  const to = await center(page, `[data-slot="${slot}"]`);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 12, from.y + 6, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}
/** 觸控拖曳：Chromium 用 CDP 觸控事件（觸控模擬）；WebKit 沒有 CDP，改用 tap 點選（同樣是觸控輸入） */
async function touchDrag(page: Page, id: string, slot: CrossSlot) {
  if (isWebkit) return tapPlace(page, id, slot, true);
  const from = await center(page, `[data-card="${id}"]`);
  const to = await center(page, `[data-slot="${slot}"]`);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
async function tapPlace(page: Page, id: string, slot: CrossSlot, touch: boolean) {
  const card = page.locator(`[data-card="${id}"]`);
  if (touch) await card.tap();
  else await card.click();
  await expect(card).toHaveClass(/selected/);
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  if (touch) await page.getByTestId(`cx-slot-${slot}`).tap();
  else await page.getByTestId(`cx-slot-${slot}`).click();
}
/** 按住滑鼠、拖一小段（複製卡出現），但還沒放開 */
async function holdMouseDrag(page: Page, id: string) {
  const from = await center(page, `[data-card="${id}"]`);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 24, from.y + 12, { steps: 3 });
  await expect(page.locator('.cx-ghost')).toHaveCount(1);
  await expect(page.locator(`[data-card="${id}"]`)).toHaveClass(/lifting/);
}
async function dropMouseAt(page: Page, selector: string) {
  const to = await center(page, selector);
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}
/** 記下最近一次 pointerdown 的 pointerId（給合成的 pointercancel／lostpointercapture 用） */
async function trackPointer(page: Page) {
  await page.evaluate(() => document.addEventListener('pointerdown', (e) => ((window as unknown as { __pid: number }).__pid = e.pointerId), true));
}
async function expectNoDragLeftovers(page: Page) {
  await expect(page.locator('.cx-ghost')).toHaveCount(0);
  await expect(page.locator('.cx-card.lifting')).toHaveCount(0);
  await expect(page.locator('.cx-slot.over, #cx-tray.over')).toHaveCount(0);
}
async function fill(page: Page, pick: Partial<Record<CrossSlot, Card>>, how: (id: string, slot: CrossSlot) => Promise<void>) {
  for (const slot of CROSS_SLOTS) {
    const c = pick[slot];
    if (!c) continue;
    const before = await view(page);
    await how(c.id, slot);
    await expect(page.getByTestId(`cx-slot-${slot}`).locator(`[data-card="${c.id}"]`)).toBeVisible();
    expect(await view(page), 'no scroll jump on drop').toEqual(before);
  }
}

test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

test('desktop: open from 遊戲, drag cards with the mouse, live products, correct / wrong, teacher buttons, levels', async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await surface(browser, 1440, 900, false);
  await login(page);
  // 入口：側欄「遊戲」→ 遊戲活動頁 → 十字交乘（大板操作）
  await page.locator('.nav-item[href="#/games"]').click();
  await expect(page.getByTestId('game-cross')).toContainText('十字交乘（大板操作）');
  await page.getByTestId('open-cross-1').click();
  await expect(page.getByTestId('cross-board')).toBeVisible();
  await expect(page.getByTestId('cx-poly')).toContainText('x');

  // 固定 seed：題目與 shared/cross.ts 的產生器一致
  const SEED = 777;
  await openBoard(page, 1, SEED);
  const expected = crossItem(crossSeed(SEED, 1, 0), 1);
  let g = await board(page);
  expect(g.key).toBe(expected.key);
  expect(g.cards.length).toBeGreaterThanOrEqual(6);
  await expect(page.getByTestId('cx-slot-lead0')).toHaveClass(/fixed/);
  await expect(page.getByTestId('cx-sum')).toHaveText('?');
  await shot(page, 'L1-empty');

  // 滑鼠拖曳：放一張，乘積即時出現；四格滿了（左欄固定 x）→ 綠色＋因式分解
  await mark(page);
  const q = g.right.const0!,
    s = g.right.const1!;
  await fill(page, { const0: q }, (id, slot) => mouseDrag(page, id, slot));
  await expect(page.getByTestId('cx-rq')).toHaveText(String(q.value).replace('-', '−'));
  await expect(page.getByTestId('cx-ps')).toHaveText('?');
  await fill(page, { const1: s }, (id, slot) => mouseDrag(page, id, slot));
  expect(await marked(page), 'board is not re-rendered on drop').toBe(true);
  await expect(page.getByTestId('cx-sum')).toHaveText(signed(expected.inner.b));
  await expect(page.getByTestId('cx-diagram')).toHaveClass(/\bok\b/);
  await expect(page.getByTestId('cx-feedback')).toContainText('✓ 正確');
  await expect(page.getByTestId('cx-answer')).toBeVisible();
  await expect(page.getByTestId('cx-score')).toContainText('答對 1 題');
  await shot(page, 'L1-correct');

  // 清空 → 卡片回到卡片匣；放正負號相反的兩張 → 顯示差多少，不洩漏答案
  await page.getByTestId('cx-clear').click();
  await expect(page.locator('.cx-slot .cx-card')).toHaveCount(0);
  await fill(page, g.wrong, (id, slot) => mouseDrag(page, id, slot));
  const wj = crossJudge(g.item, { const0: g.wrong.const0!.value, const1: g.wrong.const1!.value });
  await expect(page.getByTestId('cx-feedback')).toHaveText(`✗ 交叉相乘和 = ${signed(wj.sum!)}，目標 ${signed(wj.target)}，差 ${Math.abs(wj.diff!)}`);
  await expect(page.getByTestId('cx-diagram')).toHaveClass(/\bbad\b/);
  await expect(page.getByTestId('cx-diagram')).not.toHaveClass(/\bok\b/);
  // 卡片可以從格子拖回卡片匣
  const back = g.wrong.const0!.id;
  const tray = await center(page, '#cx-tray');
  const from = await center(page, `[data-card="${back}"]`);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(tray.x, tray.y + 30, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(`[data-home="${back}"] [data-card="${back}"]`)).toBeVisible();
  await expect(page.getByTestId('cx-rq')).toHaveText('?');

  // 提示：漸進（L1 先亮常數卡）；公布答案
  await page.getByTestId('cx-clear').click();
  await page.getByTestId('cx-hint').click();
  await expect(page.getByTestId('cx-feedback')).toContainText('提示');
  // 提示文字直接讀出數字（不只靠發亮）
  await expect(page.getByTestId('cx-feedback')).toContainText(`${signed(expected.q)} 和 ${signed(expected.s)}`);
  await expect(page.locator('.cx-card.hint')).toHaveCount(2);
  await page.getByTestId('cx-reveal').click();
  await expect(page.getByTestId('cx-diagram')).toHaveClass(/revealed/);
  await expect(page.getByTestId('cx-feedback')).toContainText('公布答案');
  await expect(page.getByTestId('cx-score')).toContainText('答對 1 題');

  // 下一題：換題、四格清空
  await page.getByTestId('cx-next').click();
  await expect(page.getByTestId('cross-board')).not.toHaveAttribute('data-key', g.key);
  await expect(page.locator('.cx-slot .cx-card')).toHaveCount(0);

  // 等級切換 L2：要放 x 係數卡；錯的擺法顯示差多少；放錯欄有提醒
  await page.getByTestId('cx-level-2').click();
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-level', '2');
  await expect(page.getByTestId('cx-level-2')).toHaveAttribute('aria-pressed', 'true');
  g = await board(page);
  expect(g.inner.a).toBeGreaterThan(1);
  await page.getByTestId('cx-hint').click();
  {
    const it2 = crossPool(SEED, 2, 1)[0];
    expect(it2.key).toBe(g.key);
    const av = crossAnswer(it2);
    await expect(page.getByTestId('cx-feedback')).toContainText(`${leadText(av.lead0)} 和 ${leadText(av.lead1)}`);
  }
  await expect(page.locator('.cx-card.hint')).toHaveCount(2);
  await expect(page.locator('.cx-card.hint.lead')).toHaveCount(2);
  await page.getByTestId('cx-hint').click();
  await expect(page.locator('.cx-card.hint')).toHaveCount(4);
  await page.getByTestId('cx-clear').click();
  await mouseDrag(page, g.right.lead0!.id, 'const0');
  await expect(page.getByTestId('cx-feedback')).toContainText('x 係數卡，要放在左欄');
  await expect(page.locator('.cx-slot .cx-card')).toHaveCount(0);
  await fill(page, g.wrong, (id, slot) => mouseDrag(page, id, slot));
  await expect(page.getByTestId('cx-feedback')).toContainText('差');
  await expect(page.getByTestId('cx-feedback')).toContainText('目標');
  await expect(page.getByTestId('cx-leadprod')).toContainText('✓');
  await shot(page, 'L2-wrong-difference');
  await page.getByTestId('cx-clear').click();
  await fill(page, g.right, (id, slot) => tapPlace(page, id, slot, false));
  await expect(page.getByTestId('cx-diagram')).toHaveClass(/\bok\b/);

  // L3：先提公因數（十字圖鎖住），再做括號裡的十字交乘，答案帶 k
  let seed3 = 1;
  while (crossItem(crossSeed(seed3, 3, 0), 3).k < 2 || crossItem(crossSeed(seed3, 3, 0), 3).leadLocked) seed3++;
  const it3 = crossItem(crossSeed(seed3, 3, 0), 3);
  await openBoard(page, 3, seed3);
  await expect(page.getByTestId('cx-diagram')).toHaveClass(/locked/);
  await expect(page.locator('.cx-card:disabled')).toHaveCount(it3.cards.length);
  await page.getByTestId('cx-hint').click();
  await expect(page.getByTestId('cx-feedback')).toContainText('最大公因數');
  await page.getByTestId('cx-extract').click();
  await expect(page.getByTestId('cx-extracted')).toBeVisible();
  await expect(page.getByTestId('cx-diagram')).not.toHaveClass(/locked/);
  g = await board(page);
  expect(g.k).toBe(it3.k);
  await fill(page, g.right, (id, slot) => mouseDrag(page, id, slot));
  await expect(page.getByTestId('cx-diagram')).toHaveClass(/\bok\b/);
  await expect(page.getByTestId('cx-answer')).toContainText(String(it3.k));
  await shot(page, 'L3-common-factor');

  // L3 負的首項：k < 0，公布答案會連提公因數一起顯示
  let seedN = 1;
  while (crossItem(crossSeed(seedN, 3, 0), 3).k > 0) seedN++;
  await openBoard(page, 3, seedN);
  await page.getByTestId('cx-reveal').click();
  await expect(page.getByTestId('cx-extracted')).toBeVisible();
  await expect(page.getByTestId('cx-diagram')).toHaveClass(/revealed/);
  await expect(page.getByTestId('cx-extract-step')).toContainText('負號');
  await shot(page, 'L3-negative-reveal');
});

test('auto level-up after consecutive correct answers', async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await surface(browser, 1280, 800, false);
  await login(page);
  await openBoard(page, 1, 4242);
  await page.getByTestId('cx-auto').check();
  for (let i = 0; i < 3; i++) {
    const g = await board(page);
    await fill(page, g.right, (id, slot) => tapPlace(page, id, slot, false));
    await expect(page.getByTestId('cx-diagram')).toHaveClass(/\bok\b/);
    await page.getByTestId('cx-next').click();
  }
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-level', '2');
  await expect(page.getByTestId('cx-score')).toContainText('答對 3 題');
});

test(`iPad viewport (${isWebkit ? 'WebKit, tap path' : 'Chromium touch emulation'}): touch drag and tap-to-place, one screen, large targets, no scroll jump`, async ({ browser }) => {
  test.setTimeout(120_000);
  for (const [w, h, name] of [
    [820, 1180, 'ipad-portrait'],
    [1180, 820, 'ipad-landscape'],
  ] as const) {
    const page = await surface(browser, w, h, true);
    await login(page);
    await openBoard(page, 2, 909);
    const g = await board(page);
    // 一個畫面放得下（不必整頁捲動），按鍵與卡片夠大
    const s = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight, main: (() => { const m = document.querySelector('#cx-main')!; return m.scrollHeight - m.clientHeight; })() }));
    expect(s.w, `${name}: no horizontal overflow`).toBeLessThanOrEqual(s.vw + 1);
    expect(s.h, `${name}: no page scroll`).toBeLessThanOrEqual(s.vh + 1);
    expect(s.main, `${name}: board fits without inner scroll`).toBeLessThanOrEqual(1);
    const small = await page.locator('.cx-card, .cx-slot, .cx-actions .btn, .cx-levels button, .cx-top .icon-btn').evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && (r.width < 44 || r.height < 44)).length,
    );
    expect(small, `${name}: touch targets ≥ 44px`).toBe(0);
    await mark(page);
    const slots = CROSS_SLOTS.filter((x) => g.right[x]);
    // 前兩張用觸控拖曳，其餘用「點卡片 → 點格子」
    await fill(page, Object.fromEntries(slots.slice(0, 2).map((x) => [x, g.right[x]!])), (id, slot) => touchDrag(page, id, slot));
    await expect(page.getByTestId('cx-leadprod')).toContainText('✓');
    await fill(page, Object.fromEntries(slots.slice(2).map((x) => [x, g.right[x]!])), (id, slot) => tapPlace(page, id, slot, true));
    expect(await marked(page)).toBe(true);
    await expect(page.getByTestId('cx-diagram')).toHaveClass(/\bok\b/);
    await expect(page.getByTestId('cx-feedback')).toContainText('✓ 正確');
    await shot(page, `${name}-L2-correct`);
    // 點已經放好的卡片 → 點卡片匣：放回去
    await page.getByTestId('cx-clear').tap();
    await tapPlace(page, g.right.const0!.id, 'const0', true);
    await page.locator(`[data-card="${g.right.const0!.id}"]`).tap();
    await page.locator(`[data-home]:not(:has(.cx-card))`).first().tap();
    await expect(page.locator('.cx-slot .cx-card')).toHaveCount(0);
  }
});

test('unauthenticated users cannot open #/games/cross (login page instead, like other teacher routes)', async ({ browser }) => {
  const page = await surface(browser, 1280, 800, false);
  await page.goto('/#/games/cross?level=1&seed=1');
  await expect(page.locator('#login-form')).toBeVisible();
  await expect(page.getByTestId('cross-board')).toHaveCount(0);
  await page.goto('/#/games');
  await expect(page.locator('#login-form')).toBeVisible();
  await expect(page.getByTestId('game-cross')).toHaveCount(0);
});

test('a logged-in student opening #/games and #/games/cross stays on the student screen (no teacher game UI)', async ({ browser }) => {
  // 老師先把示範班設成不用登入碼（跟其他學生端測試一樣），學生用座號登入
  const teacher = await surface(browser, 1280, 800, false);
  await login(teacher);
  const cl = (await (await teacher.request.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  await teacher.request.patch(`/api/classes/${cl.id}`, { headers: { Origin: baseURL }, data: { requireCode: false } });
  const page = await surface(browser, 1080, 810, true);
  await page.goto('/#/student');
  await page.getByLabel('座號').fill('28');
  await page.locator('#login-form').getByRole('button', { name: '登入' }).click();
  const studentView = page.locator('.waiting-room, [data-testid="session-slide"]').first();
  await expect(studentView).toBeAttached();
  for (const route of ['/#/games', '/#/games/cross?level=2&seed=7']) {
    await page.goto(route);
    await expect(studentView, route).toBeAttached();
    await expect(page.locator('#login-form'), route).toHaveCount(0);
    await expect(page.getByTestId('cross-board'), route).toHaveCount(0);
    await expect(page.getByTestId('game-cross'), route).toHaveCount(0);
    await expect(page.getByTestId('cx-tray'), route).toHaveCount(0);
  }
});

test('drag in progress is cancelled by 下一題 / level change / 公布答案 / 清空; stale pointer never acts on the new item', async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await surface(browser, 1440, 900, false);
  await login(page);
  await openBoard(page, 1, 555);
  // 另一根手指（或另一個人）在拖曳中按老師按鈕：用 DOM click 模擬，滑鼠仍按著
  const press = (cx: string) => page.evaluate((a) => (document.querySelector(`[data-cx="${a}"]`) as HTMLElement).click(), cx);
  for (const action of ['next', 'level', 'clear'] as const) {
    const g = await board(page);
    const id = g.right.const0!.id;
    await holdMouseDrag(page, id);
    if (action === 'level') await page.evaluate(() => (document.querySelector('[data-testid="cx-level-2"]') as HTMLElement).click());
    else await press(action);
    await expectNoDragLeftovers(page);
    if (action !== 'clear') {
      await expect(page.getByTestId('cross-board')).not.toHaveAttribute('data-key', g.key);
      // 舊題的卡片 id 不會出現在新題（每題的卡片 id 帶序號）
      await expect(page.locator(`[data-card="${id}"]`)).toHaveCount(0);
    }
    await dropMouseAt(page, '[data-slot="const0"]');
    await expect(page.locator('.cx-slot .cx-card')).toHaveCount(0);
    await expect(page.getByTestId('cx-sum')).toHaveText('?');
    await expectNoDragLeftovers(page);
    if (action === 'level') await openBoard(page, 1, 556);
  }
  // 公布答案：四格是正解，放開的舊拖曳不會把卡換掉
  const g = await board(page);
  const wrongId = g.wrong.const0!.id;
  await holdMouseDrag(page, wrongId);
  await press('reveal');
  await expectNoDragLeftovers(page);
  await dropMouseAt(page, '[data-slot="const1"]');
  await expect(page.getByTestId('cx-diagram')).toHaveClass(/revealed/);
  await expect(page.locator(`[data-home="${wrongId}"] [data-card="${wrongId}"]`)).toBeVisible();
  await expect(page.locator('.cx-slot .cx-card')).toHaveCount(2);
});

test('pointercancel and lostpointercapture return the card and remove the ghost', async ({ browser }) => {
  const page = await surface(browser, 1440, 900, false);
  await login(page);
  await openBoard(page, 2, 909);
  await trackPointer(page);
  const g = await board(page);
  for (const kind of ['pointercancel', 'lostpointercapture'] as const) {
    const id = g.right.const0!.id;
    await holdMouseDrag(page, id);
    await page.evaluate(
      ([cardId, type]) => {
        const el = document.querySelector(`[data-card="${cardId}"]`) as HTMLElement;
        const pointerId = (window as unknown as { __pid: number }).__pid;
        if (type === 'lostpointercapture' && el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
        else el.dispatchEvent(new PointerEvent(type, { pointerId, bubbles: true }));
      },
      [id, kind] as const,
    );
    // Chromium 在下一個指標事件才送出 lostpointercapture：動一下滑鼠
    await page.mouse.move(10, 10);
    await expectNoDragLeftovers(page);
    await expect(page.locator(`[data-home="${id}"] [data-card="${id}"]`)).toBeVisible();
    await dropMouseAt(page, '[data-slot="const0"]');
    await expect(page.locator('.cx-slot .cx-card'), `${kind}: released pointer does not drop`).toHaveCount(0);
    await expect(page.locator(`[data-card="${id}"]`)).not.toHaveClass(/selected/);
  }
  // 取消之後照常可以拖
  await mouseDrag(page, g.right.const0!.id, 'const0');
  await expect(page.getByTestId('cx-slot-const0').locator(`[data-card="${g.right.const0!.id}"]`)).toBeVisible();
});

test('a second pointer is ignored while one drag is active', async ({ browser }) => {
  const page = await surface(browser, 1440, 900, false);
  await login(page);
  await openBoard(page, 2, 909);
  const g = await board(page);
  const a = g.right.const0!.id,
    b = g.right.const1!.id;
  await holdMouseDrag(page, a);
  // 第二根手指：按下另一張卡、拖到格子、放開
  await page.evaluate(
    ([cardId]) => {
      const el = document.querySelector(`[data-card="${cardId}"]`) as HTMLElement;
      const r = el.getBoundingClientRect();
      const slot = (document.querySelector('[data-slot="const1"]') as HTMLElement).getBoundingClientRect();
      const ev = (type: string, x: number, y: number, target: Element) =>
        target.dispatchEvent(new PointerEvent(type, { pointerId: 77, pointerType: 'touch', isPrimary: false, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      ev('pointerdown', r.x + r.width / 2, r.y + r.height / 2, el);
      ev('pointermove', slot.x + slot.width / 2, slot.y + slot.height / 2, el);
      ev('pointerup', slot.x + slot.width / 2, slot.y + slot.height / 2, el);
    },
    [b] as const,
  );
  // 第一張還在拖、第二張沒動也沒被選取
  await expect(page.locator('.cx-ghost')).toHaveCount(1);
  await expect(page.locator(`[data-card="${a}"]`)).toHaveClass(/lifting/);
  await expect(page.locator(`[data-home="${b}"] [data-card="${b}"]`)).toBeVisible();
  await expect(page.locator(`[data-card="${b}"]`)).toHaveAttribute('aria-pressed', 'false');
  await dropMouseAt(page, '[data-slot="const0"]');
  await expect(page.getByTestId('cx-slot-const0').locator(`[data-card="${a}"]`)).toBeVisible();
  await expect(page.locator('.cx-slot .cx-card')).toHaveCount(1);
  await expectNoDragLeftovers(page);
});

test('keyboard: select with Enter (aria-pressed), place into a slot, Delete returns the card to the tray', async ({ browser }) => {
  const page = await surface(browser, 1440, 900, false);
  await login(page);
  await openBoard(page, 2, 909);
  const g = await board(page);
  const id = g.right.lead0!.id;
  const card = page.locator(`[data-card="${id}"]`);
  await expect(card).toHaveAttribute('aria-pressed', 'false');
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('cx-slot-lead0').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('cx-slot-lead0').locator(`[data-card="${id}"]`)).toBeVisible();
  await expect(card).toHaveAttribute('aria-pressed', 'false');
  await expect(card).toHaveAttribute('aria-label', /左欄上格/);
  await card.focus();
  await page.keyboard.press('Delete');
  await expect(page.locator(`[data-home="${id}"] [data-card="${id}"]`)).toBeVisible();
  await expect(card).toBeFocused();
  await expect(card).not.toHaveAttribute('aria-label', /格/);
  await expect(page.locator('.cx-slot .cx-card')).toHaveCount(0);
});

test('no repeats until the pool is exhausted, then a notice and a new round', async ({ browser }) => {
  const page = await surface(browser, 1280, 800, false);
  await login(page);
  const SEED = 31,
    N = 4;
  await page.goto(`/#/games/cross?level=1&seed=${SEED}&pool=${N}`);
  await expect(page.getByTestId('cross-board')).toBeVisible();
  const want = crossPool(SEED, 1, N).map((x) => x.key);
  const keys: string[] = [];
  for (let i = 0; i < N; i++) {
    if (i) await page.getByTestId('cx-next').click();
    await expect(page.getByTestId('cross-board')).toHaveAttribute('data-round', '0');
    keys.push((await page.getByTestId('cross-board').getAttribute('data-key'))!);
    await expect(page.getByTestId('cx-pool-notice')).toHaveCount(0);
  }
  expect(keys).toEqual(want);
  expect(new Set(keys).size).toBe(N);
  // 第 N+1 題：題池用完 → 提示重新開始，新的一輪
  await page.getByTestId('cx-next').click();
  await expect(page.getByTestId('cx-pool-notice')).toContainText('都出過了');
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-round', '1');
  const k = (await page.getByTestId('cross-board').getAttribute('data-key'))!;
  expect(k).not.toBe(keys[N - 1]);
  // 新一輪也是同一個題池範圍內的題目（L1 題池縮成 N 題時是另一個種子的 N 題）
  expect(k.startsWith('L1:')).toBe(true);
});

test('?pool=N survives 下一題 and level change, so reloading the URL keeps the same pool', async ({ browser }) => {
  const page = await surface(browser, 1280, 800, false);
  await login(page);
  const SEED = 31,
    N = 4;
  await page.goto(`/#/games/cross?level=1&seed=${SEED}&pool=${N}`);
  await expect(page.getByTestId('cross-board')).toBeVisible();
  await page.getByTestId('cx-next').click();
  expect(page.url()).toContain(`pool=${N}`);
  await page.getByTestId('cx-level-2').click();
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-level', '2');
  expect(page.url()).toContain(`pool=${N}`);
  await page.getByTestId('cx-level-1').click();
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-level', '1');
  // 重新整理：還是 N 題的題池 → 出完 N 題就提示新的一輪
  await page.reload();
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-level', '1');
  expect(page.url()).toContain(`pool=${N}`);
  expect(await page.getByTestId('cross-board').getAttribute('data-key')).toBe(crossPool(SEED, 1, N)[0].key);
  for (let i = 1; i < N; i++) await page.getByTestId('cx-next').click();
  await expect(page.getByTestId('cx-pool-notice')).toHaveCount(0);
  await page.getByTestId('cx-next').click();
  await expect(page.getByTestId('cx-pool-notice')).toContainText(`${N} 題都出過了`);
  // 沒有 pool 參數（或無效）時網址不帶 pool
  await page.goto(`/#/games/cross?level=1&seed=${SEED}&pool=abc`);
  await expect(page.getByTestId('cross-board')).toBeVisible();
  await page.getByTestId('cx-next').click();
  expect(page.url()).not.toContain('pool=');
});
