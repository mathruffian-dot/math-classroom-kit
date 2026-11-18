// 十字交乘・雙人大屏對戰（#/games/cross-duel）：從「遊戲」卡片打開、開始設定 → 倒數 → 對戰；
// 兩根手指同時拖曳（CDP 多點觸控）各自放進自己那一邊、互不影響；手指滑過中線碰不到另一邊；每一邊的點選各自獨立；
// 答對只加那一邊、自動換那一邊的下一題、另一邊不重畫；先提公因式的公因數選項；時間到顯示勝負與平手；再來一局／回選單；
// 先提公因式選對 k 之前，畫面（文字、卡片、讀數、屬性）看不到括號裡的三項式；
// 截止時間在每個輸入核對（截止前最後一個輸入算分、截止後不算並立刻結算、只結算一次、分頁切回前景／取得焦點時核對）；
// lostpointercapture 取消那根手指還沒完成的點選；
// 1920×1080、1366×768、iPad 橫向 1180×820／1024×768 在開始、選 k 等式、差多少的訊息、完整因式分解各狀態都不裁切、不溢出。
// 「iPad」是 Chromium（Edge）的觸控模擬（hasTouch＋CDP 觸控事件），不是 Safari。
// 截圖：CROSS_SHOTS=1 時才寫，只寫到 artifacts/cross-2026-11-18b/。
import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CROSS_SLOTS, crossJudge, crossKFeedback, crossKOptions, gcd, polyTex, signed, type CrossFill, type CrossItem, type CrossSlot } from '../../shared/cross';
import { crossDuelDeck } from '../../shared/cross-duel';
import { expectXColorDistinct, hue, hueGap } from './cross-colors';

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const shots = resolve('artifacts/cross-2026-11-18b');
const contexts: BrowserContext[] = [];
type Side = 'L' | 'R';

async function surface(browser: Browser, width: number, height: number, touch: boolean) {
  const context = await browser.newContext({ baseURL, viewport: { width, height }, hasTouch: touch, deviceScaleFactor: 1 });
  contexts.push(context);
  return context.newPage();
}
async function shot(page: Page, name: string) {
  if (process.env.CROSS_SHOTS !== '1') return;
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
const duel = (page: Page) => page.getByTestId('cross-duel');
async function openDuel(page: Page, query: string) {
  await page.goto(`/#/games/cross-duel?${query}`);
  await expect(duel(page)).toBeVisible();
  await expect(duel(page)).toHaveAttribute('data-phase', 'setup');
}
/** 按開始：倒數 3-2-1 → 對戰 */
async function start(page: Page, button = 'xd-start') {
  await page.getByTestId(button).click();
  await expect(duel(page)).toHaveAttribute('data-phase', 'countdown');
  await expect(page.getByTestId('xd-countdown')).toBeVisible();
  await expect(page.getByTestId('xd-count-num')).toHaveText(/^[123]$/);
  await expect(duel(page)).toHaveAttribute('data-phase', 'play', { timeout: 6000 });
  await expect(page.getByTestId('xd-countdown')).toBeHidden();
}

type Card = { id: string; kind: 'lead' | 'const'; value: number };
/** 從一邊的題目 key 與卡片算出一組正確的填法與一組錯的填法 */
async function side(page: Page, s: Side) {
  const pad = page.getByTestId(`xd-pad-${s}`);
  const key = (await pad.getAttribute('data-key'))!;
  const [a, b, c] = key.split(':')[1].split(',').map(Number);
  const k = Math.sign(a) * gcd(gcd(a, b), c);
  const inner = { a: a / k, b: b / k, c: c / k };
  const item = { inner, leadLocked: inner.a === 1 };
  const cards: Card[] = await pad.locator('.cx-card[data-card]').evaluateAll((els) =>
    els.map((e) => ({ id: (e as HTMLElement).dataset.card!, kind: (e as HTMLElement).dataset.kind as 'lead' | 'const', value: Number((e as HTMLElement).dataset.value) })),
  );
  const pairs = (l: Card[]) => l.flatMap((x) => l.filter((y) => y !== x).map((y) => [x, y] as const));
  const leadPairs: (readonly [Card | null, Card | null])[] = item.leadLocked ? [[null, null]] : pairs(cards.filter((x) => x.kind === 'lead'));
  let right: Partial<Record<CrossSlot, Card>> | null = null,
    wrong: Partial<Record<CrossSlot, Card>> | null = null;
  for (const [p, r] of leadPairs)
    for (const [q, t] of pairs(cards.filter((x) => x.kind === 'const'))) {
      const f: CrossFill = { lead0: p?.value, lead1: r?.value, const0: q.value, const1: t.value };
      const j = crossJudge(item, f);
      const pick = { ...(p ? { lead0: p, lead1: r! } : {}), const0: q, const1: t };
      if (j.ok && !right) right = pick;
      if (!j.ok && j.leadOk !== false && j.constOk && j.sum !== j.target && !wrong) wrong = pick;
    }
  return { key, k, poly: { a, b, c }, right: right!, wrong: wrong!, cards };
}
async function center(page: Page, selector: string) {
  const b = (await page.locator(selector).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function tapPlace(page: Page, s: Side, id: string, slot: CrossSlot) {
  await page.locator(`[data-card="${id}"]`).tap();
  await expect(page.locator(`[data-card="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId(`xd${s}-slot-${slot}`).tap();
  await expect(page.getByTestId(`xd${s}-slot-${slot}`).locator(`[data-card="${id}"]`)).toBeVisible();
}
async function solve(page: Page, s: Side) {
  const g = await side(page, s);
  for (const slot of CROSS_SLOTS) if (g.right[slot]) await tapPlace(page, s, g.right[slot]!.id, slot);
  return g;
}
/**
 * 監看一邊的作答區：MutationObserver（childList＋characterData，整個子樹）記下所有變動，
 * 同時保存題目、卡片盤、十字圖與每一張卡片節點的參照（重寫 innerHTML 就會換成新節點）。
 */
async function mark(page: Page, s: Side) {
  await page.evaluate((x) => {
    const host = document.querySelector(`#xd${x}-host`)!;
    const nodes = [`#xd${x}-tray`, `#xd${x}-question`, `#xd${x}-cross`, `#xd${x}-feedback`].map((sel) => document.querySelector(sel)!);
    nodes.push(...host.querySelectorAll('.cx-card, .cx-poly'));
    const w = window as unknown as { __xdWatch?: Record<string, { nodes: Element[]; mutations: number; obs: MutationObserver }> };
    const rec = { nodes, mutations: 0, obs: new MutationObserver((list) => (rec.mutations += list.length)) };
    rec.obs.observe(host, { childList: true, subtree: true, characterData: true });
    (w.__xdWatch ??= {})[x] = rec;
  }, s);
}
/** 從 mark 之後：沒有任何子樹變動，而且記下的節點全都還是同一個、還在頁面上 */
async function marked(page: Page, s: Side) {
  return page.evaluate((x) => {
    const rec = (window as unknown as { __xdWatch: Record<string, { nodes: Element[]; mutations: number; obs: MutationObserver }> }).__xdWatch[x];
    rec.mutations += rec.obs.takeRecords().length;
    rec.obs.disconnect();
    const host = document.querySelector(`#xd${x}-host`)!;
    return { mutations: rec.mutations, nodes: rec.nodes.length, detached: rec.nodes.filter((n) => !n.isConnected || !host.contains(n)).length };
  }, s);
}
type Pt = { x: number; y: number };
/**
 * 兩根手指同時拖曳（CDP 多點觸控）：兩根一起按下、交錯移動、一起放開。
 * mid：移動到一半時呼叫（檢查兩張複製卡同時存在）。
 */
async function twoFingerDrag(page: Page, a: { from: Pt; to: Pt }, b: { from: Pt; to: Pt }, mid?: () => Promise<void>) {
  const cdp = await page.context().newCDPSession(page);
  const at = (m: { from: Pt; to: Pt }, t: number, id: number) => ({ x: m.from.x + (m.to.x - m.from.x) * t, y: m.from.y + (m.to.y - m.from.y) * t, id });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at(a, 0, 1)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at(a, 0, 1), at(b, 0, 2)] });
  const N = 14;
  for (let i = 1; i <= N; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at(a, i / N, 1), at(b, i / N, 2)] });
    if (i === N / 2 && mid) await mid();
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** 合成的點一下（pointerdown → pointerup，同一個 pointerId）：在一次 evaluate 裡完成，中間不經過任何計時器 */
async function synthTap(page: Page, steps: { sel: string; id: number }[]) {
  await page.evaluate((list) => {
    for (const { sel, id } of list) {
      const el = document.querySelector(sel)!;
      const r = el.getBoundingClientRect();
      const o = { pointerId: id, pointerType: 'touch', isPrimary: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true, cancelable: true };
      el.dispatchEvent(new PointerEvent('pointerdown', o));
      el.dispatchEvent(new PointerEvent('pointerup', o));
    }
  }, steps);
}
/** 用點選把一組填法放進去；skip 的格子先不放（留著當「最後一個輸入」） */
async function fillSide(page: Page, s: Side, fill: Partial<Record<CrossSlot, Card>>, skip?: CrossSlot) {
  for (const slot of CROSS_SLOTS) if (fill[slot] && slot !== skip) await tapPlace(page, s, fill[slot]!.id, slot);
}
type Hook = { skew(ms: number): number; hold(tick: boolean, adv?: boolean): void; remaining(): number; settled(): number };
type HookWindow = Window & { __crossDuelTest: Hook };
/** 測試入口（?test=1）：把時鐘撥到「離截止還有 ms 毫秒」（負數＝已經過了截止 |ms| 毫秒），不觸發任何計時器 */
const skewTo = (page: Page, ms: number) =>
  page.evaluate((a) => {
    const h = (window as unknown as HookWindow).__crossDuelTest;
    return h.skew(h.remaining() - a);
  }, ms);
/** 暫停計時器的拍子（模擬背景分頁被節流、拍子延遲）與自動換題 */
const hold = (page: Page, on: boolean) => page.evaluate((v) => (window as unknown as HookWindow).__crossDuelTest.hold(v), on);
const settledCount = (page: Page) => page.evaluate(() => (window as unknown as HookWindow).__crossDuelTest.settled());

/** 選 k 之前：讀數、卡片、格子、屬性都看不到括號裡的三項式 */
async function expectNoInnerLeak(page: Page, s: Side, it: CrossItem) {
  const p = `xd${s}`;
  const pad = page.getByTestId(`xd-pad-${s}`);
  await expect(pad.locator('.cx-card, [data-card], [data-value], [data-home], .cx-slot.fixed, .cx-answer')).toHaveCount(0);
  for (const id of ['ps', 'rq', 'sum']) await expect(page.getByTestId(`${p}-${id}`)).toHaveText('?');
  await expect(page.getByTestId(`${p}-target`)).toHaveText('目標 ?');
  await expect(page.getByTestId(`${p}-leadprod`)).toHaveText('');
  await expect(page.getByTestId(`${p}-constprod`)).toHaveText('');
  const html = await page.getByTestId(`xd-side-${s}`).evaluate((el) => el.outerHTML);
  expect(html, `${s}: inner trinomial (KaTeX source) is not in the DOM`).not.toContain(polyTex(it.inner));
  expect(html).not.toContain('目標 +');
  expect(html).not.toContain('目標 −');
  expect(html, 'no column products').not.toMatch(/相乘 [=\d−x]/);
}
/** 選 k 之前的作答區 HTML（含所有屬性），拿掉原式與 data-key、前綴換成 P：兩題一樣＝沒有洩漏 */
async function preKDom(page: Page, s: Side) {
  return page.getByTestId(`xd-pad-${s}`).evaluate((el, p) => {
    const c = el.cloneNode(true) as HTMLElement;
    c.querySelectorAll('.cx-poly').forEach((e) => e.remove());
    c.removeAttribute('data-key');
    c.removeAttribute('id');
    c.removeAttribute('data-testid');
    return c.outerHTML.split(p).join('P');
  }, `xd${s}-`);
}

test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

test('open from the 遊戲 card (focus + time picker), setup → countdown → play; mode switch between 單人大板 and 雙人對戰', async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await surface(browser, 1920, 1080, false);
  await login(page);
  await page.locator('.nav-item[href="#/games"]').click();
  const card = page.getByTestId('game-cross-duel');
  await expect(card).toContainText('十字交乘（雙人大屏對戰）');
  await expect(card.getByTestId('xd-card-time-120')).toBeChecked();
  for (const id of ['a1', 'a-not-1', 'gcf', 'mix']) await expect(card.getByTestId(`open-duel-${id}`)).toBeVisible();
  await card.getByTestId('xd-card-time-180').check();
  await expect(card.getByTestId('open-duel-gcf')).toHaveAttribute('href', '#/games/cross-duel?focus=gcf&time=180');
  await card.getByTestId('open-duel-gcf').click();
  await expect(duel(page)).toHaveAttribute('data-phase', 'setup');
  await expect(page.getByTestId('xd-setup')).toBeVisible();
  await expect(page.getByTestId('xd-focus-gcf')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('xd-time-180')).toBeChecked();
  await expect(page.getByTestId('xd-setup')).not.toContainText(/L[123]\b/);
  // 設定畫面：重點四個選項（名稱＋例子）、時間 1／2／3 分鐘
  await expect(page.locator('#xd-focus-pick .fx-option')).toHaveCount(4);
  await expect(page.locator('#xd-focus-pick .katex').first()).toBeVisible();
  await page.getByTestId('xd-focus-a1').click();
  await expect(page.getByTestId('xd-focus-a1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('xd-focus-gcf')).toHaveAttribute('aria-pressed', 'false');
  // 設定畫面蓋住上方列：自己有「返回遊戲活動」與「改用單人大板」（跟著選的重點）
  await expect(page.getByTestId('xd-setup-back')).toHaveAttribute('href', '#/games');
  await expect(page.getByTestId('xd-setup-board')).toHaveAttribute('href', '#/games/cross?focus=a1');
  await page.getByTestId('xd-time-120').check();
  await shot(page, 'duel-setup');
  // 開始 → 倒數（3-2-1）→ 對戰；倒數中作答區鎖住
  await page.getByTestId('xd-start').click();
  await expect(page.getByTestId('xd-count-num')).toHaveText('3');
  await expect(duel(page)).toHaveAttribute('data-phase', 'countdown');
  await expect(page.locator('[data-testid="xd-pad-L"] .cx-card:not(:disabled)')).toHaveCount(0);
  await shot(page, 'duel-countdown');
  await expect(page.getByTestId('xd-count-num')).toHaveText('2', { timeout: 2500 });
  await expect(duel(page)).toHaveAttribute('data-phase', 'play', { timeout: 6000 });
  expect(page.url()).toContain('focus=a1');
  expect(page.url()).toContain('time=120');
  expect(page.url()).toMatch(/seed=\d+/);
  await expect(page.getByTestId('xd-timer')).toHaveText(/^(2:00|1:5\d)$/);
  await expect(page.getByTestId('xd-side-L')).toContainText('左方（紅）');
  await expect(page.getByTestId('xd-side-R')).toContainText('右方（藍）');
  await expect(page.getByTestId('xd-score-L')).toHaveText('0');
  await expect(page.getByTestId('xd-score-R')).toHaveText('0');
  // 兩邊都是 x² 係數為 1、數字不同；對戰中沒有提示／公布答案
  const l = await side(page, 'L'),
    r = await side(page, 'R');
  expect(l.key.startsWith('L1:')).toBe(true);
  expect(r.key.startsWith('L1:')).toBe(true);
  expect(l.key).not.toBe(r.key);
  await expect(duel(page).getByRole('button', { name: /提示|公布答案/ })).toHaveCount(0);
  // 和同一個 seed 的產生器一致
  const seed = Number(new URL(page.url().replace('#/', '')).searchParams.get('seed'));
  const deck = crossDuelDeck(seed, 'a1');
  expect(l.key).toBe(deck.item('L', 0).key);
  expect(r.key).toBe(deck.item('R', 0).key);

  // 模式切換：對戰 → 單人大板（同一個重點）→ 雙人對戰
  await page.getByTestId('cx-mode-board').click();
  await expect(page.getByTestId('cross-board')).toBeVisible();
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-focus', 'a1');
  await page.getByTestId('cx-focus-a-not-1').click();
  await page.getByTestId('cx-mode-duel').click();
  await expect(duel(page)).toHaveAttribute('data-phase', 'setup');
  await expect(page.getByTestId('xd-focus-a-not-1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('cx-mode-duel')).toHaveAttribute('aria-current', 'page');
});

test('SIMULTANEOUS two-finger drag: each side receives its own card, neither affects the other; crossing the middle never drops on the other side', async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await surface(browser, 1366, 768, true);
  await login(page);
  await openDuel(page, 'focus=a1&seed=4242');
  await start(page);
  const l = await side(page, 'L'),
    r = await side(page, 'R');
  const lc = l.right.const0!,
    rc = r.right.const1!;
  // 兩根手指同時：左邊拖 const0 到左邊上格、右邊拖 const1 到右邊下格
  await twoFingerDrag(
    page,
    { from: await center(page, `[data-card="${lc.id}"]`), to: await center(page, '[data-testid="xdL-slot-const0"]') },
    { from: await center(page, `[data-card="${rc.id}"]`), to: await center(page, '[data-testid="xdR-slot-const1"]') },
    async () => {
      // 拖到一半：兩張複製卡同時存在，各在自己的那一邊
      await expect(page.locator('.cx-ghost')).toHaveCount(2);
      await expect(page.getByTestId('xd-pad-L').locator('.cx-ghost')).toHaveCount(1);
      await expect(page.getByTestId('xd-pad-R').locator('.cx-ghost')).toHaveCount(1);
      await expect(page.locator(`[data-card="${lc.id}"]`)).toHaveClass(/lifting/);
      await expect(page.locator(`[data-card="${rc.id}"]`)).toHaveClass(/lifting/);
    },
  );
  await expect(page.getByTestId('xdL-slot-const0').locator(`[data-card="${lc.id}"]`)).toBeVisible();
  await expect(page.getByTestId('xdR-slot-const1').locator(`[data-card="${rc.id}"]`)).toBeVisible();
  await expect(page.getByTestId('xd-pad-L').locator('.cx-slot .cx-card')).toHaveCount(1);
  await expect(page.getByTestId('xd-pad-R').locator('.cx-slot .cx-card')).toHaveCount(1);
  await expect(page.getByTestId('xd-pad-L').locator('[data-card^="R"]')).toHaveCount(0);
  await expect(page.getByTestId('xd-pad-R').locator('[data-card^="L"]')).toHaveCount(0);
  await expect(page.locator('.cx-ghost, .cx-card.lifting, .cx-slot.over, .cx-tray.over')).toHaveCount(0);
  await expect(page.getByTestId('xdL-rq')).not.toHaveText('?');
  await expect(page.getByTestId('xdR-ps')).not.toHaveText('?');
  await expect(page.getByTestId('xdL-ps')).toHaveText('?');

  // 手指從左邊滑過中線、放在右邊的空格子上：不會放進右邊（卡片留在左邊原位）；右邊同時拖曳照常
  const l2 = l.right.const1!,
    r2 = r.right.const0!;
  await twoFingerDrag(
    page,
    { from: await center(page, `[data-card="${l2.id}"]`), to: await center(page, '[data-testid="xdR-slot-const0"]') },
    { from: await center(page, `[data-card="${r2.id}"]`), to: await center(page, '[data-testid="xdR-slot-const0"]') },
  );
  await expect(page.locator(`[data-home="${l2.id}"] [data-card="${l2.id}"]`)).toBeVisible();
  await expect(page.getByTestId('xdR-slot-const0').locator(`[data-card="${r2.id}"]`)).toBeVisible();
  await expect(page.getByTestId('xd-pad-R').locator('[data-card^="L"]')).toHaveCount(0);
  await expect(page.locator('.cx-ghost')).toHaveCount(0);
  // 右邊答對了：只有右邊加分、變綠
  await expect(page.getByTestId('xdR-diagram')).toHaveClass(/\bok\b/);
  await expect(page.getByTestId('xd-score-R')).toHaveText('1');
  await expect(page.getByTestId('xd-score-L')).toHaveText('0');
  await expect(page.getByTestId('xdL-diagram')).not.toHaveClass(/\bok\b/);
});

test('one drag per side: a second finger on the same side is ignored while the other side still works (interleaved PointerEvents)', async ({ browser }) => {
  const page = await surface(browser, 1366, 768, true);
  await login(page);
  await openDuel(page, 'focus=a1&seed=99');
  await start(page);
  const l = await side(page, 'L'),
    r = await side(page, 'R');
  // 交錯送出三個指標：左邊 #11 拖 const0、左邊 #12（第二根手指）想拖 const1、右邊 #21 拖 const0
  await page.evaluate(
    ([a, b, c]) => {
      const rect = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
      const mid = (r: DOMRect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
      const ev = (type: string, id: number, p: { x: number; y: number }, target: Element) =>
        target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 11, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true }));
      const A = document.querySelector(`[data-card="${a}"]`)!,
        B = document.querySelector(`[data-card="${b}"]`)!,
        C = document.querySelector(`[data-card="${c}"]`)!;
      const pa = mid(A.getBoundingClientRect()),
        pb = mid(B.getBoundingClientRect()),
        pc = mid(C.getBoundingClientRect());
      const ta = mid(rect('[data-testid="xdL-slot-const0"]')),
        tb = mid(rect('[data-testid="xdL-slot-const1"]')),
        tc = mid(rect('[data-testid="xdR-slot-const0"]'));
      ev('pointerdown', 11, pa, A);
      ev('pointerdown', 21, pc, C);
      ev('pointerdown', 12, pb, B);
      for (let i = 1; i <= 6; i++) {
        const t = i / 6;
        const lerp = (f: { x: number; y: number }, g: { x: number; y: number }) => ({ x: f.x + (g.x - f.x) * t, y: f.y + (g.y - f.y) * t });
        ev('pointermove', 11, lerp(pa, ta), A);
        ev('pointermove', 12, lerp(pb, tb), B);
        ev('pointermove', 21, lerp(pc, tc), C);
      }
      ev('pointerup', 12, tb, B);
      ev('pointerup', 21, tc, C);
      ev('pointerup', 11, ta, A);
    },
    [l.right.const0!.id, l.right.const1!.id, r.right.const0!.id] as const,
  );
  await expect(page.getByTestId('xdL-slot-const0').locator(`[data-card="${l.right.const0!.id}"]`)).toBeVisible();
  await expect(page.getByTestId('xdR-slot-const0').locator(`[data-card="${r.right.const0!.id}"]`)).toBeVisible();
  // 第二根手指沒有動到卡片，也沒有變成選取
  await expect(page.locator(`[data-home="${l.right.const1!.id}"] [data-card="${l.right.const1!.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-card="${l.right.const1!.id}"]`)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.cx-ghost')).toHaveCount(0);
  // pointercancel 只影響那一根手指那一邊
  await page.evaluate(
    ([a, c]) => {
      const A = document.querySelector(`[data-card="${a}"]`)!,
        C = document.querySelector(`[data-card="${c}"]`)!;
      const p = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
      };
      const ev = (type: string, id: number, el: Element, dx = 0) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', ...p(el), ...(dx ? { clientX: p(el).clientX + dx } : {}), bubbles: true, cancelable: true }));
      ev('pointerdown', 31, A);
      ev('pointerdown', 41, C);
      ev('pointermove', 31, A, 30);
      ev('pointermove', 41, C, 30);
      ev('pointercancel', 31, A);
    },
    [l.right.const1!.id, r.right.const1!.id] as const,
  );
  await expect(page.getByTestId('xd-pad-L').locator('.cx-ghost')).toHaveCount(0);
  await expect(page.getByTestId('xd-pad-R').locator('.cx-ghost')).toHaveCount(1);
  await page.evaluate((c) => {
    const C = document.querySelector(`[data-card="${c}"]`)!;
    const t = document.querySelector('[data-testid="xdR-slot-const1"]')!.getBoundingClientRect();
    C.dispatchEvent(new PointerEvent('pointerup', { pointerId: 41, pointerType: 'touch', clientX: t.x + t.width / 2, clientY: t.y + t.height / 2, bubbles: true }));
  }, r.right.const1!.id);
  await expect(page.getByTestId('xdR-diagram')).toHaveClass(/\bok\b/);
  await expect(page.getByTestId('xd-score-R')).toHaveText('1');
});

test('per-side tap fallback: selections are independent; a correct answer counts only for that side and advances only that side', async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await surface(browser, 1180, 820, true);
  await login(page);
  await openDuel(page, 'focus=a-not-1&seed=777');
  await start(page);
  const l = await side(page, 'L'),
    r = await side(page, 'R');
  expect(l.cards.length).toBe(r.cards.length);
  // 兩邊的 x 係數卡（橘）都和常數卡（藍）分得出來；左方隊伍色是玫瑰紅，不和 x 的橘色混在一起
  for (const s of ['L', 'R'] as const) await expectXColorDistinct(page, `[data-testid="xd-pad-${s}"] .cx-tray .cx-card.lead`, `[data-testid="xd-pad-${s}"] .cx-tray .cx-card.const`);
  const [xBorder, redHead] = await page.evaluate(() => [getComputedStyle(document.querySelector('[data-testid="xd-pad-L"] .cx-card.lead')!).borderTopColor, getComputedStyle(document.querySelector('.xd-side.red .xd-side-head')!).backgroundColor]);
  expect(hueGap(hue(xBorder), hue(redHead)), `x ${xBorder} vs team red ${redHead}`).toBeGreaterThan(25);
  // 左邊選一張、右邊選一張：兩個選取同時存在
  const la = l.right.lead0!,
    ra = r.right.lead0!;
  await page.locator(`[data-card="${la.id}"]`).tap();
  await page.locator(`[data-card="${ra.id}"]`).tap();
  await expect(page.locator(`[data-card="${la.id}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(`[data-card="${ra.id}"]`)).toHaveAttribute('aria-pressed', 'true');
  // 點右邊的格子：只放右邊選的卡；左邊的選取還在
  await page.getByTestId('xdR-slot-lead0').tap();
  await expect(page.getByTestId('xdR-slot-lead0').locator(`[data-card="${ra.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-card="${la.id}"]`)).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('xdL-slot-lead0').tap();
  await expect(page.getByTestId('xdL-slot-lead0').locator(`[data-card="${la.id}"]`)).toBeVisible();
  // 右邊放一個錯的擺法：顯示差多少（和大板同樣的訊息），可以繼續移動卡片
  await page.getByTestId('xdR-slot-lead0').locator('.cx-card').tap();
  await page.locator(`[data-home="${ra.id}"]`).tap();
  for (const slot of CROSS_SLOTS) if (r.wrong[slot]) await tapPlace(page, 'R', r.wrong[slot]!.id, slot);
  await expect(page.getByTestId('xdR-feedback')).toContainText('目標');
  await expect(page.getByTestId('xdR-feedback')).toContainText('差');
  await expect(page.getByTestId('xdR-diagram')).toHaveClass(/\bbad\b/);
  await expect(page.getByTestId('xd-score-R')).toHaveText('0');
  // 左邊答對：綠色＋因式分解，只有左邊 +1；約 0.8 秒後只有左邊換題，右邊不重畫、卡片原封不動
  // （先等右邊自己的回饋計時器跑完，之後右邊作答區的子樹應該完全不動）
  await page.waitForTimeout(2000);
  await mark(page, 'R');
  for (const slot of CROSS_SLOTS) if (l.right[slot] && slot !== 'lead0') await tapPlace(page, 'L', l.right[slot]!.id, slot);
  await expect(page.getByTestId('xdL-diagram')).toHaveClass(/\bok\b/);
  await expect(page.getByTestId('xdL-feedback')).toContainText('✓ 正確');
  await expect(page.getByTestId('xdL-answer')).toBeVisible();
  await expect(page.getByTestId('xd-score-L')).toHaveText('1');
  await expect(page.getByTestId('xd-score-R')).toHaveText('0');
  await expect(page.getByTestId('xd-pad-L')).not.toHaveAttribute('data-key', l.key, { timeout: 3000 });
  await expect(page.getByTestId('xd-side-L')).toHaveAttribute('data-index', '1');
  await expect(page.getByTestId('xd-side-R')).toHaveAttribute('data-index', '0');
  await expect(page.getByTestId('xd-pad-R')).toHaveAttribute('data-key', r.key);
  const watch = await marked(page, 'R');
  expect(watch.nodes, 'cards and question are watched').toBeGreaterThan(4);
  expect(watch, 'right side is not re-rendered: no subtree mutations, same nodes').toEqual({ mutations: 0, nodes: watch.nodes, detached: 0 });
  await expect(page.getByTestId('xd-pad-R').locator('.cx-slot .cx-card')).toHaveCount(4);
  await expect(page.getByTestId('xd-pad-L').locator('.cx-slot .cx-card')).toHaveCount(0);
  const seed = Number(new URL(page.url().replace('#/', '')).searchParams.get('seed'));
  expect(seed).toBe(777);
  await expect(page.getByTestId('xd-pad-L')).toHaveAttribute('data-key', crossDuelDeck(777, 'a-not-1').item('L', 1).key);
  // 右邊改對：拖回去重放
  for (const slot of CROSS_SLOTS) {
    const id = r.right[slot]!.id;
    if (await page.getByTestId(`xdR-slot-${slot}`).locator(`[data-card="${id}"]`).count()) continue;
    await tapPlace(page, 'R', id, slot);
  }
  await expect(page.getByTestId('xdR-diagram')).toHaveClass(/\bok\b/);
  await expect(page.getByTestId('xd-score-R')).toHaveText('1');
  await expect(page.getByTestId('xd-side-R')).toHaveAttribute('data-index', '1', { timeout: 3000 });
});

test('gcf in the duel: each side picks k from the fixed options; wrong pick feedback stays on that side; correct unlocks only that side', async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await surface(browser, 1920, 1080, true);
  await login(page);
  await openDuel(page, 'focus=gcf&seed=31');
  await start(page);
  const l = await side(page, 'L'),
    r = await side(page, 'R');
  expect(Math.sign(l.k)).toBe(Math.sign(r.k));
  const deck = crossDuelDeck(31, 'gcf');
  // 選 k 之前：兩邊都只看得到原式與公因數選項（沒有卡片、目標、欄乘積），兩邊除了原式之外一模一樣
  for (const s of ['L', 'R'] as const) await expectNoInnerLeak(page, s, deck.item(s, 0));
  expect(await preKDom(page, 'L')).toBe(await preKDom(page, 'R'));
  for (const s of ['L', 'R'] as const) {
    await expect(page.getByTestId(`xd${s}-diagram`)).toHaveClass(/locked/);
    expect(await page.getByTestId(`xd${s}-kopts`).locator('.cx-kbtn').evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.k)))).toEqual(crossKOptions());
  }
  await expect(page.getByRole('button', { name: '提出公因數', exact: true })).toHaveCount(0);
  // 左邊選錯（用正負號相反的數）：只有左邊顯示說明
  await page.getByTestId(`xdL-k-${-l.k}`).tap();
  await expect(page.getByTestId('xdL-kwrong')).toContainText(crossKFeedback(l.poly, l.k, -l.k)!);
  await expect(page.getByTestId('xdR-kwrong')).toHaveCount(0);
  await expect(page.getByTestId(`xdL-k-${-l.k}`)).toHaveClass(/tried/);
  await expectNoInnerLeak(page, 'L', deck.item('L', 0));
  // 右邊選對：右邊顯示 原式 = k(…) 並解鎖；左邊仍然鎖住
  await page.getByTestId(`xdR-k-${r.k}`).tap();
  await expect(page.getByTestId('xdR-extracted')).toBeVisible();
  await expect(page.getByTestId('xdR-diagram')).not.toHaveClass(/locked/);
  await expect(page.getByTestId('xdL-diagram')).toHaveClass(/locked/);
  await expect(page.getByTestId('xd-pad-L').locator('.cx-card')).toHaveCount(0);
  await expectNoInnerLeak(page, 'L', deck.item('L', 0));
  await expect(page.getByTestId('xd-pad-R').locator('.cx-card')).toHaveCount(deck.item('R', 0).cards.length);
  await expect(page.getByTestId('xdR-target')).toHaveText(`目標 ${signed(deck.item('R', 0).inner.b)}`);
  // 右邊做完十字交乘：答對 +1（k 也要對）
  await solve(page, 'R');
  await expect(page.getByTestId('xdR-diagram')).toHaveClass(/\bok\b/);
  await expect(page.getByTestId('xdR-answer')).toBeVisible();
  if (Math.abs(r.k) > 1) await expect(page.getByTestId('xdR-answer')).toContainText(String(Math.abs(r.k)));
  await expect(page.getByTestId('xd-score-R')).toHaveText('1');
  // 左邊選對後一樣可以作答
  await page.getByTestId(`xdL-k-${l.k}`).tap();
  await expect(page.getByTestId('xdL-extracted')).toBeVisible();
  await solve(page, 'L');
  await expect(page.getByTestId('xd-score-L')).toHaveText('1');
});

test('time up locks both sides and shows the winner; 再來一局 starts a new seed with the same settings and can end in a tie; 回選單', async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await surface(browser, 1920, 1080, true);
  await login(page);
  await openDuel(page, 'focus=a1&time=6&test=1&seed=2024');
  await start(page);
  // 中盤：左邊放一張、右邊答對（綠色）
  const l = await side(page, 'L');
  await tapPlace(page, 'L', l.right.const0!.id, 'const0');
  await solve(page, 'R');
  await expect(page.getByTestId('xdR-diagram')).toHaveClass(/\bok\b/);
  await shot(page, 'duel-midgame');
  await expect(page.getByTestId('xd-score-R')).toHaveText('1');
  // 時間到：兩邊鎖住、結果畫面
  await expect(duel(page)).toHaveAttribute('data-phase', 'over', { timeout: 10_000 });
  await expect(page.getByTestId('xd-result')).toBeVisible();
  await expect(page.getByTestId('xd-result-title')).toHaveText('右方（藍）獲勝！1 比 0');
  await expect(page.getByTestId('xd-result')).toHaveAttribute('data-winner', 'R');
  await expect(page.getByTestId('xd-result')).toContainText('時間到');
  await expect(page.getByTestId('xd-final-L')).toHaveText('0');
  await expect(page.getByTestId('xd-final-R')).toHaveText('1');
  await expect(page.getByTestId('xd-timer')).toHaveText('0:00');
  await expect(page.locator('.cx-card:not(:disabled)')).toHaveCount(0);
  await shot(page, 'duel-result');
  // 再來一局：同樣的設定、新的 seed、分數歸零
  const seed1 = new URL(page.url().replace('#/', '')).searchParams.get('seed');
  await start(page, 'xd-again');
  const seed2 = new URL(page.url().replace('#/', '')).searchParams.get('seed');
  expect(seed2).not.toBe(seed1);
  expect(page.url()).toContain('focus=a1');
  await expect(page.getByTestId('xd-score-L')).toHaveText('0');
  await expect(page.getByTestId('xd-score-R')).toHaveText('0');
  await solve(page, 'L');
  await solve(page, 'R');
  await expect(page.getByTestId('xd-score-L')).toHaveText('1');
  await expect(page.getByTestId('xd-score-R')).toHaveText('1');
  await expect(duel(page)).toHaveAttribute('data-phase', 'over', { timeout: 10_000 });
  await expect(page.getByTestId('xd-result-title')).toHaveText('平手！1 比 1');
  await expect(page.getByTestId('xd-result')).toHaveAttribute('data-winner', 'tie');
  await shot(page, 'duel-tie');
  // 回選單：回到開始設定，設定保留
  await page.getByTestId('xd-menu').click();
  await expect(duel(page)).toHaveAttribute('data-phase', 'setup');
  await expect(page.getByTestId('xd-setup')).toBeVisible();
  await expect(page.getByTestId('xd-focus-a1')).toHaveAttribute('aria-pressed', 'true');
});

test('暫停 freezes the clock and both sides; 繼續; 結束 shows the result right away', async ({ browser }) => {
  const page = await surface(browser, 1366, 768, false);
  await login(page);
  await openDuel(page, 'focus=a1&seed=5');
  await start(page);
  await page.getByTestId('xd-pause').click();
  await expect(duel(page)).toHaveAttribute('data-phase', 'paused');
  await expect(page.getByTestId('xd-paused')).toBeVisible();
  const t1 = await page.getByTestId('xd-timer').textContent();
  await page.waitForTimeout(1300);
  expect(await page.getByTestId('xd-timer').textContent()).toBe(t1);
  await expect(page.locator('.cx-card:not(:disabled)')).toHaveCount(0);
  await page.getByTestId('xd-resume').click();
  await expect(duel(page)).toHaveAttribute('data-phase', 'play');
  await expect(page.locator('[data-testid="xd-pad-L"] .cx-card:not(:disabled)').first()).toBeVisible();
  await page.getByTestId('xd-end').click();
  await expect(duel(page)).toHaveAttribute('data-phase', 'over');
  await expect(page.getByTestId('xd-result-title')).toHaveText('平手！0 比 0');
  await expect(page.getByTestId('xd-result')).toContainText('對戰結束');
});

test('deadline: the real deadline is checked on every input — just before counts, just after is rejected and settles at once (tick delayed), exactly once', async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await surface(browser, 1366, 768, true);
  await login(page);
  await openDuel(page, 'focus=a1&time=20&test=1&seed=2024');
  await start(page);
  // 計時器的拍子與自動換題暫停：之後的結算只能來自輸入時的截止核對
  await hold(page, true);
  const l = await side(page, 'L'),
    r = await side(page, 'R');
  // 兩邊都先放到只差最後一格
  await fillSide(page, 'L', l.right, 'const1');
  await fillSide(page, 'R', r.right, 'const1');
  // 截止前 300ms：左邊放最後一張（一次 evaluate 完成）→ 算分
  await skewTo(page, 300);
  await synthTap(page, [
    { sel: `[data-card="${l.right.const1!.id}"]`, id: 71 },
    { sel: '[data-testid="xdL-slot-const1"]', id: 72 },
  ]);
  await expect(page.getByTestId('xdL-diagram')).toHaveClass(/\bok\b/);
  await expect(page.getByTestId('xd-score-L')).toHaveText('1');
  await expect(duel(page)).toHaveAttribute('data-phase', 'play');
  // 過了截止 50ms（拍子還沒來）：右邊放最後一張 → 不算分、立刻鎖住並結算
  await skewTo(page, -50);
  await expect(duel(page)).toHaveAttribute('data-phase', 'play');
  await synthTap(page, [
    { sel: `[data-card="${r.right.const1!.id}"]`, id: 73 },
    { sel: '[data-testid="xdR-slot-const1"]', id: 74 },
  ]);
  await expect(duel(page)).toHaveAttribute('data-phase', 'over');
  await expect(page.getByTestId('xd-score-R')).toHaveText('0');
  await expect(page.getByTestId('xdR-diagram')).not.toHaveClass(/\bok\b/);
  await expect(page.getByTestId('xdR-slot-const1').locator('.cx-card')).toHaveCount(0);
  await expect(page.getByTestId('xd-result-title')).toHaveText('左方（紅）獲勝！1 比 0');
  await expect(page.getByTestId('xd-result')).toContainText('時間到');
  await expect(page.getByTestId('xd-timer')).toHaveText('0:00');
  expect(await settledCount(page)).toBe(1);
  // 之後的輸入、延遲到的拍子、焦點／分頁事件都不會再結算或加分
  await synthTap(page, [{ sel: `[data-card="${r.right.const1!.id}"]`, id: 75 }]);
  await hold(page, false);
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await settledCount(page)).toBe(1);
  await expect(duel(page)).toHaveAttribute('data-settled', '1');
  await expect(page.getByTestId('xd-final-L')).toHaveText('1');
  await expect(page.getByTestId('xd-final-R')).toHaveText('0');
  await expect(page.locator('.cx-card:not(:disabled)')).toHaveCount(0);
});

test('test hook only lives with its own test page: test=1 stays in the URL after picking a normal time; leaving removes it; a normal duel is never affected', async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await surface(browser, 1366, 768, true);
  await login(page);
  const hasHook = () => page.evaluate(() => '__crossDuelTest' in window);
  const urlParams = () => new URLSearchParams(page.url().split('?')[1] || '');
  // 測試設定（短時間）改選正式的 2 分鐘再開始：網址仍然保留 test=1，hook 仍然有效
  await openDuel(page, 'focus=a1&time=20&test=1&seed=5');
  expect(await hasHook()).toBe(true);
  await page.getByTestId('xd-time-120').check();
  await start(page);
  expect(urlParams().get('test')).toBe('1');
  expect(urlParams().get('time')).toBe('120');
  expect(await page.evaluate(() => typeof (window as unknown as HookWindow).__crossDuelTest.remaining())).toBe('number');
  // 留一個舊 hook 的參照，離開測試頁：hook 撤掉
  await page.evaluate(() => ((window as unknown as { __old: unknown }).__old = (window as unknown as HookWindow).__crossDuelTest));
  await page.goto('/#/games');
  await expect(page.getByTestId('game-cross-duel')).toBeVisible();
  expect(await hasHook()).toBe(false);
  // 一般網址開對局：沒有 hook，網址沒有 test=1；舊 hook 的參照也改不動這一局（時鐘、計時器照走）
  await openDuel(page, 'focus=a1&seed=5');
  expect(await hasHook()).toBe(false);
  await start(page);
  expect(urlParams().get('test')).toBeNull();
  const res = await page.evaluate(() => {
    const old = (window as unknown as { __old: Hook }).__old;
    return [old.skew(10_000_000), old.hold(true, true), old.remaining(), old.settled()].map((v) => v === undefined);
  });
  expect(res, 'a stale hook is a no-op').toEqual([true, true, true, true]);
  expect(await hasHook()).toBe(false);
  await expect(page.getByTestId('xd-timer')).toHaveText(/^1:5\d$/, { timeout: 4000 });
  await expect(duel(page)).toHaveAttribute('data-phase', 'play');
  await solve(page, 'L');
  await expect(page.getByTestId('xd-score-L')).toHaveText('1');
  await expect(page.getByTestId('xd-side-L')).toHaveAttribute('data-index', '1', { timeout: 3000 });
  // 測試頁直接換到一般對局（中間不經過別的頁）：一樣沒有 hook
  await openDuel(page, 'focus=a1&time=20&test=1&seed=6');
  expect(await hasHook()).toBe(true);
  await openDuel(page, 'focus=gcf&seed=6');
  expect(await hasHook()).toBe(false);
  expect(urlParams().get('test')).toBeNull();
});

test('deadline: a delayed tick (background tab) is caught up on visibilitychange and on focus; the score at the deadline stands', async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await surface(browser, 1366, 768, true);
  await login(page);
  const setVisibility = (v: 'hidden' | 'visible') =>
    page.evaluate((x) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => x });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => x === 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    }, v);
  // 分頁切到背景（拍子停了），時間在背景中過了截止，切回前景的那一刻就結算
  await openDuel(page, 'focus=a1&time=20&test=1&seed=7');
  await start(page);
  await solve(page, 'R');
  await expect(page.getByTestId('xd-score-R')).toHaveText('1');
  await hold(page, true);
  await setVisibility('hidden');
  await expect(duel(page)).toHaveAttribute('data-phase', 'play');
  await skewTo(page, -2000);
  await page.waitForTimeout(300);
  await expect(duel(page)).toHaveAttribute('data-phase', 'play');
  await setVisibility('visible');
  await expect(duel(page)).toHaveAttribute('data-phase', 'over');
  await expect(page.getByTestId('xd-result-title')).toHaveText('右方（藍）獲勝！1 比 0');
  expect(await settledCount(page)).toBe(1);
  await setVisibility('visible');
  expect(await settledCount(page)).toBe(1);

  // 再來一局：視窗取得焦點時也核對
  await start(page, 'xd-again');
  await expect(duel(page)).not.toHaveAttribute('data-settled', /./);
  await hold(page, true);
  await skewTo(page, -10);
  await expect(duel(page)).toHaveAttribute('data-phase', 'play');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(duel(page)).toHaveAttribute('data-phase', 'over');
  await expect(page.getByTestId('xd-result-title')).toHaveText('平手！0 比 0');
  expect(await settledCount(page)).toBe(1);

  // 再來一局：過了截止才按暫停 → 直接結算，不會進入暫停
  await start(page, 'xd-again');
  await hold(page, true);
  await skewTo(page, -10);
  await page.getByTestId('xd-pause').click();
  await expect(duel(page)).toHaveAttribute('data-phase', 'over');
  expect(await settledCount(page)).toBe(1);
});

/** 在一次 evaluate 裡交錯送出兩根手指的事件；A 那根在 pointerup 之前失去擷取 */
async function lostCaptureRace(page: Page, a: string, b: string, ids: [number, number]) {
  await page.evaluate(
    ([sa, sb, ia, ib]) => {
      const at = (sel: string, id: number) => {
        const el = document.querySelector(sel)!;
        const r = el.getBoundingClientRect();
        return [el, { pointerId: id, pointerType: 'touch', clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true, cancelable: true }] as const;
      };
      const [A, oa] = at(sa, ia),
        [B, ob] = at(sb, ib);
      A.dispatchEvent(new PointerEvent('pointerdown', oa));
      B.dispatchEvent(new PointerEvent('pointerdown', ob));
      A.dispatchEvent(new PointerEvent('lostpointercapture', oa));
      B.dispatchEvent(new PointerEvent('pointerup', ob));
      A.dispatchEvent(new PointerEvent('pointerup', oa));
    },
    [a, b, ids[0], ids[1]] as const,
  );
}

test('lostpointercapture cancels that pointer’s pending tap (k option, slot) on its own side only; the other side keeps working', async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await surface(browser, 1366, 768, true);
  await login(page);
  await openDuel(page, 'focus=gcf&seed=31');
  await start(page);
  const deck = crossDuelDeck(31, 'gcf');
  const kL = deck.item('L', 0).k,
    kR = deck.item('R', 0).k;
  // 左邊 #52 按在正確的 k 上、失去擷取；同時右邊 #61 正常點右邊的 k
  await lostCaptureRace(page, `[data-testid="xdL-k-${kL}"]`, `[data-testid="xdR-k-${kR}"]`, [52, 61]);
  await expect(page.getByTestId('xdR-extracted')).toBeVisible();
  await expect(page.getByTestId('xdL-extracted')).toHaveCount(0);
  await expect(page.getByTestId('xdL-kwrong')).toHaveCount(0);
  await expect(page.getByTestId('xdL-diagram')).toHaveClass(/locked/);
  // 左邊正常選 k；選一張卡，再按格子但失去擷取 → 不放卡（選取保留）；右邊同時正常放卡
  await page.getByTestId(`xdL-k-${kL}`).tap();
  await expect(page.getByTestId('xdL-extracted')).toBeVisible();
  const l = await side(page, 'L'),
    r = await side(page, 'R');
  await page.locator(`[data-card="${l.right.const0!.id}"]`).tap();
  await page.locator(`[data-card="${r.right.const0!.id}"]`).tap();
  await lostCaptureRace(page, '[data-testid="xdL-slot-const0"]', '[data-testid="xdR-slot-const0"]', [53, 62]);
  await expect(page.getByTestId('xdR-slot-const0').locator(`[data-card="${r.right.const0!.id}"]`)).toBeVisible();
  await expect(page.getByTestId('xdL-slot-const0').locator('.cx-card')).toHaveCount(0);
  await expect(page.locator(`[data-card="${l.right.const0!.id}"]`)).toHaveAttribute('aria-pressed', 'true');
  // 下一次點選照常
  await page.getByTestId('xdL-slot-const0').tap();
  await expect(page.getByTestId('xdL-slot-const0').locator(`[data-card="${l.right.const0!.id}"]`)).toBeVisible();
});

test('layout: 1920×1080, 1366×768, iPad landscape 1180×820 / 1024×768 (touch) — nothing clipped or overflowing in every state (start, k equation, wrong difference, full factored form)', async ({ browser }) => {
  test.setTimeout(240_000);
  /** 每一塊（.xd-pad）裡的重要元素都完整在那一塊裡面；那一塊、整頁都沒有捲動 */
  async function fits(page: Page, label: string) {
    const m = await page.evaluate(() => {
      // 文字容器：內容不能比框寬（字被切掉）。格子裡的卡片本來就蓋住格子的虛線框，不算。
      const TEXT = '.cx-poly, .cx-extract-eq, .cx-kbtn, .cx-card, .cx-colprod, .cx-readout > div, .cx-tray-wait, .cx-feedback, .cx-answer';
      const pads = [...document.querySelectorAll<HTMLElement>('.xd-pad')].map((p) => {
        const pr = p.getBoundingClientRect();
        const bad = [...p.querySelectorAll<HTMLElement>('.cx-question, .cx-poly, .cx-item-focus, .cx-extract, .cx-extract-eq, .cx-kopts, .cx-kbtn, .cx-cross, .cx-slot, .cx-card, .cx-colprod, .cx-readout, .cx-readout > div, .cx-tray, .cx-tray-wait, .cx-feedback, .cx-answer')]
          // 空著的欄乘積（選 k 之前）沒有內容，不算
          .filter((e) => !e.closest('.cx-ghost') && getComputedStyle(e).display !== 'none' && !(e.classList.contains('cx-colprod') && !e.textContent))
          .map((e) => ({ e, r: e.getBoundingClientRect() }))
          .filter(({ e, r }) => r.width === 0 || r.height === 0 || r.left < pr.left - 1 || r.right > pr.right + 1 || r.top < pr.top - 1 || r.bottom > pr.bottom + 1 || (e.matches(TEXT) && e.scrollWidth > e.clientWidth + 2))
          .map(({ e, r }) => `${e.className} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} sw${e.scrollWidth}/${e.clientWidth} in ${Math.round(pr.left)},${Math.round(pr.top)} ${Math.round(pr.width)}x${Math.round(pr.height)}`);
        return { over: Math.max(p.scrollHeight - p.clientHeight, p.scrollWidth - p.clientWidth), bad };
      });
      return { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight, pads };
    });
    expect(m.w, `${label}: no horizontal overflow`).toBeLessThanOrEqual(m.vw + 1);
    expect(m.h, `${label}: no page scroll`).toBeLessThanOrEqual(m.vh + 1);
    for (const p of m.pads) {
      expect(p.over, `${label}: pad content fits`).toBeLessThanOrEqual(1);
      expect(p.bad, `${label}: elements inside their pad`).toEqual([]);
    }
    const small = await page.locator('.xd-pad .cx-card, .xd-pad .cx-slot:not(.fixed), .xd-pad .cx-kbtn, .xd-controls .btn').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).length);
    expect(small, `${label}: touch targets ≥ 44px`).toBe(0);
  }
  for (const [w, h, touch, name] of [
    [1920, 1080, false, '1920x1080'],
    [1366, 768, false, '1366x768'],
    [1180, 820, true, 'ipad-landscape'],
    [1024, 768, true, 'ipad-1024'],
  ] as const) {
    const page = await surface(browser, w, h, touch);
    await login(page);
    const tap = (sel: string) => (touch ? page.locator(sel).tap() : page.locator(sel).click());
    const place = async (s: Side, fill: Partial<Record<CrossSlot, Card>>) => {
      for (const slot of CROSS_SLOTS)
        if (fill[slot]) {
          await tap(`[data-card="${fill[slot]!.id}"]`);
          await tap(`[data-testid="xd${s}-slot-${slot}"]`);
        }
    };
    // x² 係數不為 1：開始的狀態
    await openDuel(page, 'focus=a-not-1&seed=1');
    await start(page);
    await fits(page, `${name} a-not-1 start`);
    // 先提公因式：左欄要放 x 係數卡（卡片最多）、首項為負（等式最長）的 seed
    let seed = 1;
    while (crossDuelDeck(seed, 'gcf').item('L', 0).leadLocked || crossDuelDeck(seed, 'gcf').item('L', 0).k > 0) seed++;
    await openDuel(page, `focus=gcf&time=180&test=1&seed=${seed}`);
    await start(page);
    // 自動換題暫停（停在答對的畫面量）；計時器照走
    await page.evaluate(() => (window as unknown as HookWindow).__crossDuelTest.hold(false, true));
    await fits(page, `${name} gcf before k`);
    const deck = crossDuelDeck(seed, 'gcf');
    // 選錯 k 的說明
    await tap(`[data-testid="xdL-k-${-deck.item('L', 0).k}"]`);
    await expect(page.getByTestId('xdL-kwrong')).toBeVisible();
    await fits(page, `${name} gcf wrong k`);
    // 兩邊都選對：顯示 原式 = k(…) 的等式與卡片
    for (const s of ['L', 'R'] as const) await tap(`[data-testid="xd${s}-k-${deck.item(s, 0).k}"]`);
    for (const s of ['L', 'R'] as const) await expect(page.getByTestId(`xd${s}-extracted`)).toBeVisible();
    await fits(page, `${name} gcf k equation`);
    // 左邊錯的擺法（差多少的訊息）、右邊完整的因式分解
    const l = await side(page, 'L'),
      r = await side(page, 'R');
    await place('L', l.wrong);
    await expect(page.getByTestId('xdL-feedback')).toContainText('差');
    await fits(page, `${name} gcf wrong difference`);
    await place('R', r.right);
    await expect(page.getByTestId('xdR-diagram')).toHaveClass(/\bok\b/);
    await expect(page.getByTestId('xdR-answer')).toBeVisible();
    await fits(page, `${name} gcf full factored form`);
    if (name === 'ipad-landscape') await shot(page, 'duel-ipad-landscape');
    await contexts.pop()!.close();
  }
});

test('unauthenticated users cannot open #/games/cross-duel', async ({ browser }) => {
  const page = await surface(browser, 1280, 800, false);
  await page.goto('/#/games/cross-duel?focus=a1');
  await expect(page.locator('#login-form')).toBeVisible();
  await expect(duel(page)).toHaveCount(0);
});
