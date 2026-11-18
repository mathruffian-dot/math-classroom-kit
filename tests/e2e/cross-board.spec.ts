// 十字交乘・大板操作（#/games/cross）：老師從「遊戲」打開；桌機用滑鼠拖曳、iPad 用觸控拖曳與「先點卡片再點格子」。
// 交叉相乘的乘積與和即時更新；答對變綠並寫出因式分解；答錯顯示差多少；下一題、提示、公布答案、重點切換；放卡片時畫面不跳動、不整個重畫。
// 重點（shared/game-focus.ts）：從「遊戲」選四個重點之一、舊網址 ?level=、混合、預設不自動前進／勾選後才前進。
// 拖曳穩定性：拖曳中換題／換重點／公布答案、pointercancel、lostpointercapture、第二根手指都不會留下殘影或放錯卡。
// 「iPad」測試預設是 Chromium（Edge）的觸控模擬（hasTouch＋CDP 觸控事件），不是 Safari；
// PW_BROWSER=webkit 時改走 WebKit 可執行的路徑（不用 CDP，觸控拖曳改成 tap 點選），需要先自行安裝 webkit。
// 答錯凍結 3 秒（src/cross-pad.ts）：大部分舊測試用 ?test=1&freeze=0 關掉（openBoard），凍結本身在後面的測試用真的 3 秒驗證。
// 先提公因式、首項為負：選正的最大公因數 → 第 2 步「提出負號」→ 十字交乘；直接選負的照樣可以。
// 截圖：CROSS_SHOTS=1 時存到 artifacts/cross-2026-11-18c/（不寫進 artifacts/screenshots，也不動之前的截圖）。
import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CROSS_SIGN_FEEDBACK, CROSS_SLOTS, crossAnswer, crossItem, crossJudge, crossKAccepted, crossKFeedback, crossKOptions, crossMixLevel, crossPool, crossSeed, crossSignOptions, gcd, leadText, polyTex, signed, type CrossFill, type CrossItem, type CrossLevel, type CrossSlot } from '../../shared/cross';
import { CROSS_FOCUS } from '../../shared/game-focus';
import { expectPickCue, expectXColorDistinct } from './cross-colors';

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const shots = resolve('artifacts/cross-2026-11-18c');
const contexts: BrowserContext[] = [];
const isWebkit = process.env.PW_BROWSER === 'webkit';

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
/**
 * 用舊網址 ?level= 打開（同時驗證舊網址相容）。freeze：答錯凍結的毫秒數（預設 0＝關掉，給「答錯後馬上改」的舊測試用；
 * null＝不帶測試參數，正式的 3 秒）。
 */
async function openBoard(page: Page, level: number, seed: number, freeze: number | null = 0) {
  const url = `/#/games/cross?level=${level}&seed=${seed}${freeze === null ? '' : `&test=1&freeze=${freeze}`}`;
  // 同一個網址（只差 hash 也一樣）不會重新載入：重新整理，從頭開這一題
  if (page.url().endsWith(url.slice(1))) await page.reload();
  else await page.goto(url);
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

test('desktop: open from 遊戲, drag cards with the mouse, live products, correct / wrong, teacher buttons, focus switcher', async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await surface(browser, 1440, 900, false);
  await login(page);
  // 入口：側欄「遊戲」→ 遊戲活動頁 → 十字交乘（大板操作）
  await page.locator('.nav-item[href="#/games"]').click();
  await expect(page.getByTestId('game-cross')).toContainText('十字交乘（大板操作）');
  await page.getByTestId('open-cross-a1').click();
  await expect(page.getByTestId('cross-board')).toBeVisible();
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-focus', 'a1');
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

  // 重點切換「x² 係數不為 1」：要放 x 係數卡；錯的擺法顯示差多少；放錯欄有提醒
  await page.getByTestId('cx-focus-a-not-1').click();
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-level', '2');
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-focus', 'a-not-1');
  await expect(page.getByTestId('cx-focus-a-not-1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('cx-focus-a1')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('cx-item-focus')).toContainText('係數不為 1');
  expect(page.url()).toContain('focus=a-not-1');
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

  // 先提公因式：十字圖鎖住，先從固定的公因數選項（−5～5，和全班連線對戰同一份）選 k；沒有「提出公因數」按鈕
  let seed3 = 1;
  while (crossItem(crossSeed(seed3, 3, 0), 3).k < 2 || crossItem(crossSeed(seed3, 3, 0), 3).leadLocked) seed3++;
  const it3 = crossItem(crossSeed(seed3, 3, 0), 3);
  await openBoard(page, 3, seed3);
  await expect(page.getByTestId('cx-diagram')).toHaveClass(/locked/);
  // 選對 k 之前沒有任何數字卡（卡片的數值、張數都會洩漏括號裡的三項式）
  await expect(page.locator('#cx-main .cx-card')).toHaveCount(0);
  await expect(page.getByTestId('cx-tray-wait')).toBeVisible();
  await expect(page.getByTestId('cx-extract')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '提出公因數', exact: true })).toHaveCount(0);
  expect(await page.locator('[data-testid="cx-kopts"] .cx-kbtn').evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.k)))).toEqual(crossKOptions());
  const kSmall = await page.locator('.cx-kbtn').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).length);
  expect(kSmall, 'k options are large touch targets').toBe(0);
  await page.getByTestId('cx-hint').click();
  await expect(page.getByTestId('cx-feedback')).toContainText('最大公因數');
  await shot(page, 'board-gcf-options');
  // 選錯：說明哪裡不對（不洩漏答案），可以再選；十字圖仍然鎖住
  const wrongK = it3.k === 4 ? 2 : 1;
  await page.getByTestId(`cx-k-${wrongK}`).click();
  await expect(page.getByTestId('cx-kwrong')).toContainText(crossKFeedback(it3.poly, it3.k, wrongK)!);
  await expect(page.getByTestId('cx-kwrong')).not.toContainText(String(it3.k));
  await expect(page.getByTestId(`cx-k-${wrongK}`)).toHaveClass(/tried/);
  await expect(page.getByTestId('cx-diagram')).toHaveClass(/locked/);
  await expect(page.getByTestId('cx-extracted')).toHaveCount(0);
  await shot(page, 'board-gcf-wrong');
  await page.getByTestId(`cx-k--${it3.k}`).click();
  await expect(page.getByTestId('cx-kwrong')).toContainText('首項是正的，不用提出負號');
  const notDivisor = crossKOptions().find((x) => x > 0 && (it3.poly.a % x || it3.poly.b % x || it3.poly.c % x))!;
  await page.getByTestId(`cx-k-${notDivisor}`).click();
  await expect(page.getByTestId('cx-kwrong')).toContainText(`${notDivisor} 不是三個係數的公因數`);
  // 選對（用鍵盤：Tab 到選項按 Enter）：顯示 原式 = k(…)，十字圖解鎖，括號裡的三項式的卡片可以放
  await page.getByTestId(`cx-k-${it3.k}`).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('cx-extracted')).toBeVisible();
  await expect(page.getByTestId('cx-extracted')).toContainText(String(it3.k));
  await expect(page.getByTestId('cx-kopts')).toHaveCount(0);
  await expect(page.getByTestId('cx-diagram')).not.toHaveClass(/locked/);
  await expect(page.locator('.cx-card:disabled')).toHaveCount(0);
  g = await board(page);
  expect(g.k).toBe(it3.k);
  await fill(page, g.right, (id, slot) => mouseDrag(page, id, slot));
  await expect(page.getByTestId('cx-diagram')).toHaveClass(/\bok\b/);
  await expect(page.getByTestId('cx-answer')).toContainText(String(it3.k));
  await shot(page, 'board-gcf-correct');

  // 負的首項：選正的最大公因數也算對 → 第 2 步「提出負號」（不再是「要連負號一起提出」的錯誤）；
  // 公布答案會連提公因數、提出負號一起顯示
  let seedN = 1;
  while (crossItem(crossSeed(seedN, 3, 0), 3).k > 0) seedN++;
  const itN = crossItem(crossSeed(seedN, 3, 0), 3);
  await openBoard(page, 3, seedN);
  await page.getByTestId(`cx-k-${-itN.k}`).click();
  await expect(page.getByTestId('cx-kwrong')).toHaveCount(0);
  await expect(page.locator('#cx-main')).not.toContainText('要連負號一起提出');
  await expect(page.getByTestId('cx-signopts')).toBeVisible();
  await page.getByTestId('cx-reveal').click();
  await expect(page.getByTestId('cx-extracted')).toBeVisible();
  await expect(page.getByTestId('cx-signed')).toBeVisible();
  await expect(page.getByTestId('cx-diagram')).toHaveClass(/revealed/);
  await expect(page.getByTestId('cx-extract-step')).toContainText('負號');
});

/**
 * 選 k 之前的作答區 HTML（含所有屬性）：拿掉原式（.cx-poly，本來就該看得到）與 data-key（原式的係數），
 * 前綴換成 P。兩題的結果一樣＝畫面上除了原式以外，沒有任何跟這一題有關的資訊。
 */
async function preKDom(page: Page, host: string, prefix: string) {
  return page.locator(host).evaluate((el, p) => {
    const c = el.cloneNode(true) as HTMLElement;
    c.querySelectorAll('.cx-poly').forEach((e) => e.remove());
    c.removeAttribute('data-key');
    return c.outerHTML.split(p).join('P');
  }, prefix);
}
/** 選 k 之前：讀數、卡片、格子、屬性都看不到括號裡的三項式 */
async function expectNoInnerLeak(page: Page, host: string, p: string, it: CrossItem) {
  const pad = page.locator(host);
  await expect(pad.locator('.cx-card, [data-card], [data-value], [data-home], .cx-slot.fixed, .cx-answer')).toHaveCount(0);
  for (const id of ['ps', 'rq', 'sum']) await expect(page.getByTestId(`${p}-${id}`)).toHaveText('?');
  await expect(page.getByTestId(`${p}-target`)).toHaveText('目標 ?');
  await expect(page.getByTestId(`${p}-leadprod`)).toHaveText('');
  await expect(page.getByTestId(`${p}-constprod`)).toHaveText('');
  await expect(page.getByTestId(`${p}-f0`)).toHaveText('(?x ?)');
  const html = await pad.evaluate((el) => el.outerHTML);
  expect(html, 'inner trinomial (KaTeX source) is not in the DOM').not.toContain(polyTex(it.inner));
  expect(html).not.toContain('目標 +');
  expect(html).not.toContain('目標 −');
  expect(html, 'no column products').not.toMatch(/相乘 [=\d−x]/);
}

/** 第 2 步「提出負號」時：卡片、讀數、欄乘積、因式都還看不到 */
async function expectStep2NoLeak(page: Page, host: string, p: string) {
  const pad = page.locator(host);
  await expect(pad.locator('.cx-card, [data-card], [data-value], [data-home], .cx-slot.fixed, .cx-answer')).toHaveCount(0);
  for (const id of ['ps', 'rq', 'sum']) await expect(page.getByTestId(`${p}-${id}`)).toHaveText('?');
  await expect(page.getByTestId(`${p}-target`)).toHaveText('目標 ?');
  await expect(page.getByTestId(`${p}-leadprod`)).toHaveText('');
  await expect(page.getByTestId(`${p}-f0`)).toHaveText('(?x ?)');
  await expect(page.getByTestId(`${p}-signopts`).locator('button')).toHaveCount(4);
  const html = await pad.evaluate((el) => {
    const c = el.cloneNode(true) as HTMLElement;
    c.querySelectorAll('.cx-signopts').forEach((x) => x.remove());
    return c.outerHTML;
  });
  expect(html).not.toContain('目標 +');
  expect(html).not.toContain('目標 −');
  expect(html, 'no column products').not.toMatch(/相乘 [=\d−x]/);
  expect(html, 'no 第 3 步 header naming the inner trinomial before 提出負號').not.toContain('第 3 步');
}

test('先提公因式: before the right k is chosen nothing on screen reveals the inner trinomial (text, cards, readouts, attributes)', async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await surface(browser, 1280, 800, false);
  await login(page);
  // 兩題同號的 k：一題左欄固定（括號裡 x² 係數 1）、一題不固定；還有兩題負的 k
  const find = (want: (it: CrossItem) => boolean) => {
    for (let s = 1; ; s++) if (want(crossItem(crossSeed(s, 3, 0), 3))) return s;
  };
  const cases = [
    [find((it) => it.k > 1 && it.leadLocked), find((it) => it.k > 1 && !it.leadLocked)],
    [find((it) => it.k < 0 && it.leadLocked), find((it) => it.k < 0 && !it.leadLocked)],
  ];
  for (const seeds of cases) {
    const doms: string[] = [];
    for (const seed of seeds) {
      const it = crossItem(crossSeed(seed, 3, 0), 3);
      await openBoard(page, 3, seed);
      await expect(page.getByTestId('cross-board')).toHaveAttribute('data-key', it.key);
      await expectNoInnerLeak(page, '#cx-main', 'cx', it);
      doms.push(await preKDom(page, '#cx-main', 'cx-'));
      // 選錯一次：說明也不洩漏（首項為負時 −k 是正的最大公因數，現在算對，改選一個錯的）
      const wrongK = it.k > 0 ? -it.k : crossKOptions().find((c) => !crossKAccepted(it.poly, it.k, c))!;
      await page.getByTestId(`cx-k-${wrongK}`).click();
      await expect(page.getByTestId('cx-kwrong')).toBeVisible();
      await expectNoInnerLeak(page, '#cx-main', 'cx', it);
      // 提示（第一層）只談原式的三個係數
      await page.getByTestId('cx-hint').click();
      await expect(page.getByTestId('cx-feedback')).toContainText('最大公因數');
      await expectNoInnerLeak(page, '#cx-main', 'cx', it);
      // 首項為負：先選正的最大公因數 → 第 2 步「提出負號」的選項出現，但卡片、讀數仍然看不到
      // （括號裡首項為正的三項式只會出現在四個只差正負號的選項裡——那是原式 ÷ k 的公開代數）
      if (it.k < 0) {
        await page.getByTestId(`cx-k-${-it.k}`).click();
        await expect(page.getByTestId('cx-signopts')).toBeVisible();
        await expectStep2NoLeak(page, '#cx-main', 'cx');
        const wrongSign = crossSignOptions(it.poly, -it.k, it.seed).findIndex((o) => !o.ok);
        await page.getByTestId(`cx-sign-${wrongSign}`).click();
        await expect(page.getByTestId('cx-signwrong')).toHaveText(`✗ ${CROSS_SIGN_FEEDBACK}`);
        await expectStep2NoLeak(page, '#cx-main', 'cx');
        await openBoard(page, 3, seed);
      }
      // 選對之後才出現卡片與目標
      await page.getByTestId(`cx-k-${it.k}`).click();
      await expect(page.locator('#cx-main .cx-card')).toHaveCount(it.cards.length);
      await expect(page.getByTestId('cx-target')).toHaveText(`目標 ${signed(it.inner.b)}`);
      await expect(page.locator('#cx-main .cx-slot.fixed')).toHaveCount(it.leadLocked ? 2 : 0);
    }
    expect(doms[0], 'apart from the original quadratic the pre-k board is identical for different items').toBe(doms[1]);
  }
});

test('focus stays put after 3 correct by default; the 「答對 3 題自動進到下一個重點」 toggle advances a1 → a-not-1', async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await surface(browser, 1280, 800, false);
  await login(page);
  await page.goto('/#/games/cross?focus=a1&seed=4242');
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-focus', 'a1');
  await expect(page.getByTestId('cx-auto')).not.toBeChecked();
  await expect(page.locator('#cx-auto-wrap')).toContainText('答對 3 題自動進到下一個重點');
  const solveThree = async () => {
    for (let i = 0; i < 3; i++) {
      const g = await board(page);
      await fill(page, g.right, (id, slot) => tapPlace(page, id, slot, false));
      await expect(page.getByTestId('cx-diagram')).toHaveClass(/\bok\b/);
      await page.getByTestId('cx-next').click();
    }
  };
  // 預設：連對 3 題後還是「x² 係數為 1」
  await solveThree();
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-focus', 'a1');
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-level', '1');
  await expect(page.getByTestId('cx-score')).toContainText('答對 3 題');
  // 勾選後：再連對 3 題 → 進到「x² 係數不為 1」，切換列與網址跟著換
  await page.getByTestId('cx-auto').check();
  await solveThree();
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-focus', 'a-not-1');
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-level', '2');
  await expect(page.getByTestId('cx-focus-a-not-1')).toHaveAttribute('aria-pressed', 'true');
  expect(page.url()).toContain('focus=a-not-1');
  await expect(page.getByTestId('cx-score')).toContainText('答對 6 題');
  // 先提公因式是最後一個重點：開關停用
  await page.getByTestId('cx-focus-gcf').click();
  await expect(page.getByTestId('cx-auto')).toBeDisabled();
});

test('picking each focus from 遊戲 opens the board on that focus; options show the name and a KaTeX example', async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await surface(browser, 1280, 900, false);
  await login(page);
  await page.locator('.nav-item[href="#/games"]').click();
  const card = page.getByTestId('game-cross');
  await expect(card).toBeVisible();
  for (const f of CROSS_FOCUS) {
    const opt = card.getByTestId(`open-cross-${f.id}`);
    await expect(opt).toContainText(f.label.replace('x²', '').trim().slice(-4));
    if (f.example) await expect(opt.locator('.katex')).toHaveCount(f.label.includes('x²') ? 2 : 1);
    else await expect(opt).toContainText(f.exampleText!);
    if (f.note) await expect(opt).toContainText(f.note);
  }
  await expect(card).not.toContainText(/L[123]\b/);
  await shot(page, 'games-picker');
  const levels: Record<string, string | null> = { a1: '1', 'a-not-1': '2', gcf: '3', mix: null };
  for (const f of CROSS_FOCUS) {
    await page.goto('/#/games');
    await page.getByTestId(`open-cross-${f.id}`).click();
    await expect(page.getByTestId('cross-board')).toHaveAttribute('data-focus', f.id);
    await expect(page.getByTestId(`cx-focus-${f.id}`)).toHaveAttribute('aria-pressed', 'true');
    if (levels[f.id]) await expect(page.getByTestId('cross-board')).toHaveAttribute('data-level', levels[f.id]!);
    expect(page.url()).toContain(`focus=${f.id}`);
    await expect(page.locator('#cx-auto-wrap')).toBeVisible({ visible: f.id !== 'mix' });
  }
  // 切換列也是同樣的名稱＋例子，沒有 L 數字
  await expect(page.locator('.cx-levels')).not.toContainText(/L[123]\b/);
  await expect(page.locator('.cx-levels .katex')).toHaveCount(5);
  await page.getByTestId('cx-focus-gcf').click();
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-level', '3');
  await shot(page, 'board-focus-switcher');
});

test('legacy ?level=2 lands on 「x² 係數不為 1」; ?focus wins over ?level; the URL is rewritten with focus', async ({ browser }) => {
  const page = await surface(browser, 1280, 800, false);
  await login(page);
  await page.goto('/#/games/cross?level=2&seed=88');
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-focus', 'a-not-1');
  await expect(page.getByTestId('cx-focus-a-not-1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('cx-item-focus')).toContainText('係數不為 1');
  expect(await page.getByTestId('cross-board').getAttribute('data-key')).toBe(crossPool(88, 2, 1)[0].key);
  await page.getByTestId('cx-next').click();
  expect(page.url()).toContain('focus=a-not-1');
  expect(page.url()).not.toContain('level=');
  for (const [lv, id] of [['1', 'a1'], ['3', 'gcf']] as const) {
    await page.goto(`/#/games/cross?level=${lv}&seed=88`);
    await expect(page.getByTestId('cross-board')).toHaveAttribute('data-focus', id);
  }
  await page.goto('/#/games/cross?level=3&focus=a1&seed=88');
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-focus', 'a1');
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-level', '1');
});

test('?focus=mix shows items from all three focuses, in the seed-determined order, each from its own no-repeat pool', async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await surface(browser, 1280, 800, false);
  await login(page);
  const SEED = 2468;
  await page.goto(`/#/games/cross?focus=mix&seed=${SEED}`);
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-focus', 'mix');
  await expect(page.getByTestId('cx-focus-mix')).toHaveAttribute('aria-pressed', 'true');
  // 混合沒有「下一個重點」：開關收起來
  await expect(page.locator('#cx-auto-wrap')).toBeHidden();
  const N = 9;
  const want = Array.from({ length: N }, (_, i) => crossMixLevel(SEED, i));
  const used: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  const wantKeys = want.map((lv) => crossPool(SEED, lv as CrossLevel, 10)[used[lv]++].key);
  const levels: number[] = [],
    keys: string[] = [];
  for (let i = 0; i < N; i++) {
    if (i) await page.getByTestId('cx-next').click();
    const lv = Number(await page.getByTestId('cross-board').getAttribute('data-level'));
    levels.push(lv);
    keys.push((await page.getByTestId('cross-board').getAttribute('data-key'))!);
    await expect(page.getByTestId('cx-item-focus')).toHaveAttribute('data-level', String(lv));
    await expect(page.getByTestId('cross-board')).toHaveAttribute('data-focus', 'mix');
    // 混合裡「先提公因式」的題目走同樣的公因數選項流程
    await expect(page.getByTestId('cx-kopts')).toHaveCount(lv === 3 ? 1 : 0);
    if (i === 2 && process.env.CROSS_SHOTS === '1') {
      // 截圖時把重點標籤也拍進去（換到一題有提公因式步驟的就更清楚）
      await shot(page, 'board-mix');
    }
  }
  expect(levels).toEqual(want);
  expect(new Set(levels).size).toBe(3);
  expect(keys).toEqual(wantKeys);
  expect(new Set(keys).size).toBe(N);
  expect(page.url()).toContain('focus=mix');
  // 重新整理：同一個 seed 同一串
  await page.reload();
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-key', wantKeys[0]);
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
    // x 係數卡（橘）和常數卡（藍）一眼分得出來
    await expectXColorDistinct(page, '#cx-tray .cx-card.lead', '#cx-tray .cx-card.const');
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
    // 格子裡已有 x 卡、再選另一張 x 卡：被選的卡是 navy 外框；改選格子裡那張也是 navy（橘色規則不蓋過選取提示）
    const [xa, xb] = g.cards.filter((c) => c.kind === 'lead');
    await tapPlace(page, xa.id, 'lead0', true);
    await expect(page.getByTestId('cx-slot-lead0')).toHaveClass(/filled/);
    await page.locator(`[data-card="${xb.id}"]`).tap();
    await expectPickCue(page, `[data-card="${xb.id}"]`, 'outline');
    await page.locator(`[data-card="${xb.id}"]`).tap();
    await page.locator(`[data-card="${xa.id}"]`).tap();
    await expect(page.locator(`[data-card="${xa.id}"]`)).toHaveClass(/selected/);
    await expectPickCue(page, `[data-card="${xa.id}"]`, 'outline');
    await expectXColorDistinct(page, `.cx-slot [data-card="${xa.id}"]`, '#cx-tray .cx-card.const');
    await page.locator(`[data-card="${xa.id}"]`).tap();
    await page.getByTestId('cx-clear').tap();
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

test('drag in progress is cancelled by 下一題 / focus change / 公布答案 / 清空; stale pointer never acts on the new item', async ({ browser }) => {
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
    if (action === 'level') await page.evaluate(() => (document.querySelector('[data-testid="cx-focus-a-not-1"]') as HTMLElement).click());
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

test('?pool=N survives 下一題 and focus change, so reloading the URL keeps the same pool', async ({ browser }) => {
  const page = await surface(browser, 1280, 800, false);
  await login(page);
  const SEED = 31,
    N = 4;
  await page.goto(`/#/games/cross?level=1&seed=${SEED}&pool=${N}`);
  await expect(page.getByTestId('cross-board')).toBeVisible();
  await page.getByTestId('cx-next').click();
  expect(page.url()).toContain(`pool=${N}`);
  await page.getByTestId('cx-focus-a-not-1').click();
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-level', '2');
  expect(page.url()).toContain(`pool=${N}`);
  await page.getByTestId('cx-focus-a1').click();
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-level', '1');
  // 重新整理：還是 N 題的題池 → 出完 N 題就提示新的一輪
  await page.reload();
  await expect(page.getByTestId('cross-board')).toHaveAttribute('data-level', '1');
  expect(page.url()).toContain(`pool=${N}`);
  expect(await page.getByTestId('cross-board').getAttribute('data-key')).toBe(crossPool(SEED, 1, N)[0].key);
  for (let i = 1; i < N; i++) await page.getByTestId('cx-next').click();
  await expect(page.getByTestId('cx-pool-notice')).toHaveCount(0);
  await page.getByTestId('cx-next').click();
  await expect(page.getByTestId('cx-pool-notice')).toContainText(`「x² 係數為 1」的 ${N} 題都出過了`);
  // 沒有 pool 參數（或無效）時網址不帶 pool
  await page.goto(`/#/games/cross?level=1&seed=${SEED}&pool=abc`);
  await expect(page.getByTestId('cross-board')).toBeVisible();
  await page.getByTestId('cx-next').click();
  expect(page.url()).not.toContain('pool=');
});

/* ───────────── 答錯凍結 3 秒、先提正的公因數＋提出負號 ───────────── */
const penalty = (page: Page) => page.getByTestId('cx-penalty');
/** 凍結中：橫幅「答錯了，N 秒後再試」、作答區變暗、卡片停用 */
async function expectFrozen(page: Page) {
  await expect(penalty(page)).toBeVisible();
  await expect(penalty(page)).toHaveText(/^答錯了，[123] 秒後再試$/);
  await expect(page.locator('#cx-main')).toHaveClass(/cx-penalty-on/);
  await expect(page.getByTestId('cx-penalty-live')).toHaveText('答錯了，3 秒後再試');
}
/** 每一格目前放的卡片 id */
async function slotCards(page: Page) {
  return page.evaluate(() => Object.fromEntries(['lead0', 'lead1', 'const0', 'const1'].map((s) => [s, (document.querySelector(`[data-slot="${s}"] .cx-card`) as HTMLElement | null)?.dataset.card ?? null])));
}

test('wrong cross answer freezes the board for 3 s: countdown 3 → 2 → 1, wrong placement and difference stay, drags / taps / keys ignored, in-progress drag cancelled, then editing works', async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await surface(browser, 1440, 900, false);
  await login(page);
  await openBoard(page, 2, 909, null);
  const g = await board(page);
  // 先放三格，第四格用鍵盤放；放之前用滑鼠拿起一張卡片匣的卡（拖曳中）
  const last: CrossSlot = 'const1';
  await fill(page, { ...g.wrong, [last]: undefined }, (id, slot) => mouseDrag(page, id, slot));
  const spare = g.cards.find((c) => c.kind === 'const' && !Object.values(g.wrong).some((w) => w?.id === c.id))!;
  await holdMouseDrag(page, spare.id);
  await page.locator(`[data-card="${g.wrong[last]!.id}"]`).focus();
  await page.keyboard.press('Enter');
  // 記下倒數的每一個數字（橫幅上的數字只在改變時才換）
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="cx-penalty-n"]')!;
    const w = window as unknown as { __pen: string[] };
    w.__pen = [el.textContent!];
    new MutationObserver(() => w.__pen.push(el.textContent!)).observe(el, { childList: true, characterData: true, subtree: true });
  });
  await page.getByTestId(`cx-slot-${last}`).focus();
  await page.keyboard.press('Enter');
  // 答錯那一刻：拖曳立刻作廢（複製卡不見、卡片沒有被拿起）
  await expectFrozen(page);
  await expectNoDragLeftovers(page);
  await dropMouseAt(page, '[data-slot="const0"]');
  const placed = await slotCards(page);
  expect(placed.const0, 'the stale drag did not place anything').toBe(g.wrong.const0!.id);
  await expect(page.locator(`[data-home="${spare.id}"] [data-card="${spare.id}"]`)).toBeVisible();
  // 答錯的擺法與差多少的訊息都留著
  const wj = crossJudge(g.item, { lead0: g.wrong.lead0!.value, lead1: g.wrong.lead1!.value, const0: g.wrong.const0!.value, const1: g.wrong.const1!.value });
  await expect(page.getByTestId('cx-feedback')).toHaveText(`✗ 交叉相乘和 = ${signed(wj.sum!)}，目標 ${signed(wj.target)}，差 ${Math.abs(wj.diff!)}`);
  await expect(page.getByTestId('cx-diagram')).toHaveClass(/\bbad\b/);
  await expect(page.locator('.cx-card').first()).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('cx-penalty-n')).toHaveText('3');
  await shot(page, 'freeze-single');
  // 凍結中：拖曳、點選、鍵盤都不理
  await mouseDrag(page, spare.id, 'const0');
  await page.locator(`[data-card="${g.wrong.const0!.id}"]`).click({ force: true });
  await page.locator('#cx-tray').click({ force: true, position: { x: 10, y: 10 } });
  await page.locator(`[data-card="${g.wrong.const1!.id}"]`).focus().catch(() => {});
  await page.keyboard.press('Delete');
  expect(await slotCards(page), 'nothing moved during the freeze').toEqual(placed);
  await expect(page.locator('.cx-card.selected')).toHaveCount(0);
  await expect(page.locator('.cx-ghost')).toHaveCount(0);
  // 倒數 3 → 2 → 1，大約 3 秒後解除
  await expect(penalty(page)).toBeHidden({ timeout: 4000 });
  expect(await page.evaluate(() => (window as unknown as { __pen: string[] }).__pen)).toEqual(['3', '2', '1']);
  await expect(page.locator('#cx-main')).not.toHaveClass(/cx-penalty-on/);
  await expect(page.getByTestId('cx-penalty-live')).toHaveText('');
  // 解除後：格子沒變，可以移動卡片再試（移回卡片匣、改成正確的擺法）
  expect(await slotCards(page)).toEqual(placed);
  await page.getByTestId('cx-clear').click();
  await fill(page, g.right, (id, slot) => mouseDrag(page, id, slot));
  await expect(page.getByTestId('cx-diagram')).toHaveClass(/\bok\b/);
  await expect(penalty(page)).toBeHidden();
  // 每一次答錯都重新凍結 3 秒；答對不凍結
  await page.getByTestId('cx-next').click();
  const g2 = await board(page);
  await fill(page, g2.wrong, (id, slot) => tapPlace(page, id, slot, false));
  await expectFrozen(page);
  // 老師的按鈕不凍結：下一題立刻解除，新的一題可以馬上作答
  await page.getByTestId('cx-hint').click();
  await expect(page.getByTestId('cx-feedback')).toContainText('提示');
  await expectFrozen(page);
  await page.getByTestId('cx-next').click();
  await expect(penalty(page)).toBeHidden();
  await expect(page.locator('#cx-main')).not.toHaveClass(/cx-penalty-on/);
  const g3 = await board(page);
  // 公布答案、清空也立刻解除
  await fill(page, g3.wrong, (id, slot) => tapPlace(page, id, slot, false));
  await expectFrozen(page);
  await page.getByTestId('cx-reveal').click();
  await expect(penalty(page)).toBeHidden();
  await page.getByTestId('cx-next').click();
  const g4 = await board(page);
  await fill(page, g4.wrong, (id, slot) => tapPlace(page, id, slot, false));
  await expectFrozen(page);
  await page.getByTestId('cx-clear').click();
  await expect(penalty(page)).toBeHidden();
  await fill(page, g4.right, (id, slot) => tapPlace(page, id, slot, false));
  await expect(page.getByTestId('cx-diagram')).toHaveClass(/\bok\b/);
});

test('wrong common factor freezes the board for 3 s (k buttons ignored), then the right k works', async ({ browser }) => {
  test.setTimeout(60_000);
  const page = await surface(browser, 1440, 900, false);
  await login(page);
  let seed = 1;
  while (crossItem(crossSeed(seed, 3, 0), 3).k < 2) seed++;
  const it = crossItem(crossSeed(seed, 3, 0), 3);
  await openBoard(page, 3, seed, null);
  await page.getByTestId(`cx-k-${-it.k}`).click();
  await expect(page.getByTestId('cx-kwrong')).toContainText('首項是正的，不用提出負號');
  await expectFrozen(page);
  await expect(page.getByTestId(`cx-k-${it.k}`)).toBeDisabled();
  await shot(page, 'freeze-k-wrong');
  // 凍結中按對的 k：不理（指標與鍵盤都一樣）
  await page.getByTestId(`cx-k-${it.k}`).click({ force: true });
  await page.getByTestId(`cx-k-${it.k}`).dispatchEvent('click');
  await expect(page.getByTestId('cx-kopts')).toBeVisible();
  await expect(page.getByTestId('cx-extracted')).toHaveCount(0);
  await expect(penalty(page)).toBeHidden({ timeout: 4000 });
  await page.getByTestId(`cx-k-${it.k}`).click();
  await expect(page.getByTestId('cx-extracted')).toBeVisible();
  await expect(page.locator('#cx-main .cx-card')).toHaveCount(it.cards.length);
});

test('先提公因式, negative leading coefficient: positive GCF → 提出負號 options (wrong one freezes 3 s) → cross step → solved; the negative GCF still works directly', async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await surface(browser, 1440, 900, false);
  await login(page);
  let seed = 1;
  while (crossItem(crossSeed(seed, 3, 0), 3).k > -2) seed++;
  const it = crossItem(crossSeed(seed, 3, 0), 3);
  const g = -it.k;
  await openBoard(page, 3, seed, null);
  await page.getByTestId(`cx-k-${g}`).click();
  // 第 1 步選對（正的）：原式 = g(原式 ÷ g)，第 2 步的四個選項（順序洗過）
  await expect(page.getByTestId('cx-extracted')).toContainText(String(g));
  await expect(page.getByTestId('cx-signopts')).toBeVisible();
  const opts = crossSignOptions(it.poly, g, it.seed);
  await expect(page.getByTestId('cx-signopts').locator('.cx-signbtn')).toHaveCount(4);
  await expect(page.getByTestId('cx-signopts').locator('.katex')).toHaveCount(4);
  await expect(penalty(page)).toBeHidden();
  await expectStep2NoLeak(page, '#cx-main', 'cx');
  await shot(page, 'gcf-positive-step2');
  // 選錯：同一句說明＋凍結 3 秒（選項停用）
  const bad = opts.findIndex((o) => !o.ok);
  await page.getByTestId(`cx-sign-${bad}`).click();
  await expect(page.getByTestId('cx-signwrong')).toHaveText(`✗ ${CROSS_SIGN_FEEDBACK}`);
  await expect(page.getByTestId(`cx-sign-${bad}`)).toHaveClass(/tried/);
  await expectFrozen(page);
  const good = opts.findIndex((o) => o.ok);
  await expect(page.getByTestId(`cx-sign-${good}`)).toBeDisabled();
  await shot(page, 'gcf-step2-wrong-freeze');
  await page.getByTestId(`cx-sign-${good}`).click({ force: true });
  await expect(page.getByTestId('cx-signed')).toHaveCount(0);
  await expect(penalty(page)).toBeHidden({ timeout: 4000 });
  // 選對：= k(括號裡首項為正)，卡片出現，接著十字交乘
  await page.getByTestId(`cx-sign-${good}`).click();
  await expect(page.getByTestId('cx-signed')).toBeVisible();
  await expect(page.getByTestId('cx-signopts')).toHaveCount(0);
  await expect(page.getByTestId('cx-extract-step')).toContainText('第 3 步');
  await expect(page.locator('#cx-main .cx-card')).toHaveCount(it.cards.length);
  await expect(page.getByTestId('cx-target')).toHaveText(`目標 ${signed(it.inner.b)}`);
  const b = await board(page);
  await fill(page, b.right, (id, slot) => mouseDrag(page, id, slot));
  await expect(page.getByTestId('cx-diagram')).toHaveClass(/\bok\b/);
  await expect(page.getByTestId('cx-answer')).toContainText(String(g));
  await expect(page.getByTestId('cx-score')).toContainText('答對 1 題');
  // 直接選負的公因數：沒有第 2 步
  await openBoard(page, 3, seed, null);
  await page.getByTestId(`cx-k-${it.k}`).click();
  await expect(page.getByTestId('cx-signopts')).toHaveCount(0);
  await expect(page.getByTestId('cx-extracted')).toBeVisible();
  await expect(page.locator('#cx-main .cx-card')).toHaveCount(it.cards.length);
  const b2 = await board(page);
  await fill(page, b2.right, (id, slot) => mouseDrag(page, id, slot));
  await expect(page.getByTestId('cx-diagram')).toHaveClass(/\bok\b/);
  // −1 的題：選 1 也接受、接著提出負號 −(…)
  let s1 = 1;
  while (crossItem(crossSeed(s1, 3, 0), 3).k !== -1) s1++;
  const m1 = crossItem(crossSeed(s1, 3, 0), 3);
  await openBoard(page, 3, s1, null);
  await page.getByTestId('cx-k-1').click();
  await expect(page.getByTestId('cx-signopts')).toBeVisible();
  await page.getByTestId(`cx-sign-${crossSignOptions(m1.poly, 1, m1.seed).findIndex((o) => o.ok)}`).click();
  await expect(page.getByTestId('cx-signed')).toBeVisible();
  await expect(page.locator('#cx-main .cx-card')).toHaveCount(m1.cards.length);
});
