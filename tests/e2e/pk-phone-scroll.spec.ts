// 單元總測驗 PK／PK 戰的學生作答卡在手機上：同學答對（比分推送）時，題目不可以往上跳（2026-11-06 下午老師回報）。
// 原因：refreshQuiz 每次推送（任何人作答，所有人的比分都在 quiz.scores 裡）都把整張測驗卡 innerHTML 換掉；
// 附圖重新解碼時高度先歸零，面板捲動位置被截短 → 學生往下滑到選項時被拉回上面。
// 做法：手機版面、觸控；學生 36 和 37 一組，另外四組同學在背景一直作答（推送一直來）。
// 題目換成很長的題幹＋高的附圖，選項一定在畫面下方。學生往下滑，停在同一題：捲動位置不變、app 不寫 scrollTop。
// 答了換下一題：新題目從題幹開頭看起一次；之後在新題目上往下滑，同學作答也不可以再拉回去。
import { test, expect, devices, type APIRequestContext, type Page } from '@playwright/test';

const { defaultBrowserType: _ignored, ...phone } = devices['iPhone 13'];
test.use({ ...phone });

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const headers = { Origin: baseURL };
const HOLD_MS = Number(process.env.MCK_PK_PHONE_MS || 5000);
const ME = 36,
  MATES = [37, 38, 39, 40, 33, 34, 35, 32, 31];

async function login(playwright: typeof import('@playwright/test'), data: Record<string, unknown>) {
  const c = await playwright.request.newContext({ baseURL });
  expect((await c.post('/api/login', { headers, data })).status()).toBe(200);
  return c;
}

/** 背景的同學：一題一題作答（每人每 1～2 秒一題），比分一直變、推送一直來。37 號（對手）慢一點，題目不會先做完。 */
function classmates(cs: { seat: number; c: APIRequestContext }[], sessionId: string) {
  let stop = false;
  const loops = cs.map(async ({ seat, c }, k) => {
    await new Promise((r) => setTimeout(r, 300 * k));
    while (!stop) {
      try {
        const view = await (await c.get(`/api/sessions/${sessionId}`)).json();
        const q = view.quiz;
        if (q && q.run.startedAt <= Date.now()) {
          const i = (q.mine?.answers || q.questions.map(() => null)).findIndex((x: number | null) => x === null);
          if (i >= 0) await c.post(`/api/sessions/${sessionId}/quiz`, { headers, data: { runId: q.run.id, q: q.questions[i].slot, choice: (seat + i) % 2 } });
        }
      } catch {
        /* 下一輪再試 */
      }
      await new Promise((r) => setTimeout(r, seat === 37 ? 2500 : 900 + (seat % 3) * 300));
    }
  });
  return async () => {
    stop = true;
    await Promise.all(loops);
  };
}

const PAD = '小明把題目讀了一遍又一遍，想清楚每個條件代表的意思，再一步一步列出算式。'.repeat(6);
const FIG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="360" viewBox="0 0 320 360"><rect x="10" y="10" width="300" height="340" fill="none" stroke="#333" stroke-width="3"/><path d="M20 340 L160 30 L300 340 Z" fill="none" stroke="#06c" stroke-width="3"/></svg>`;
/** 學生自己拿到的題目都換成長題幹＋高附圖（伺服器的題目不變，作答照常）。 */
function rewrite(text: string) {
  try {
    const d = JSON.parse(text);
    const quiz = d.view?.quiz || d.quiz;
    if (quiz?.questions) for (const x of quiz.questions) Object.assign(x, { stem: `${x.stem}${PAD}`, figure: FIG });
    return JSON.stringify(d);
  } catch {
    return text;
  }
}
async function hook(page: Page) {
  await page.route(/\/api\/sessions\/[^/]+$/, async (route) => {
    const res = await route.fetch();
    return route.fulfill({ response: res, body: rewrite(await res.text()) });
  });
  await page.routeWebSocket(/./, (ws) => {
    const server = ws.connectToServer();
    server.onMessage((m) => ws.send(typeof m === 'string' ? rewrite(m) : m));
    ws.onMessage((m) => server.send(m));
  });
}

test('PK phone: classmates answering does not make the question jump while the student scrolls', async ({ page, playwright }) => {
  test.setTimeout(120_000);
  // 記下 app 自己改捲動位置的每一次呼叫（含堆疊）
  await page.addInitScript(() => {
    const w = window as unknown as { __mckWrites: string[] };
    w.__mckWrites = [];
    const log = (what: string, v: unknown) => w.__mckWrites.push(`${what}=${String(v)} @ ${(new Error().stack || '').split('\n').slice(2, 5).join(' | ')}`);
    const d = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!;
    Object.defineProperty(Element.prototype, 'scrollTop', {
      configurable: true,
      get: d.get,
      set(v: number) {
        log('scrollTop', v);
        d.set!.call(this, v);
      },
    });
    for (const k of ['scrollTo', 'scrollBy', 'scrollIntoView'] as const) {
      const orig = Element.prototype[k] as (...a: unknown[]) => void;
      (Element.prototype as unknown as Record<string, unknown>)[k] = function (this: Element, ...a: unknown[]) {
        log(k, JSON.stringify(a));
        return orig.apply(this, a);
      };
    }
  });

  const t = await login(playwright, { role: 'teacher', account: 'teacher', password: '11235813' });
  const cl = (await (await t.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  await t.patch(`/api/classes/${cl.id}`, { headers, data: { requireCode: false } });
  const sessionId = (await (await t.post('/api/sessions', { headers, data: { lessonId: 'g8-2-3c', classId: cl.id } })).json()).session.id;
  const mates = await Promise.all(MATES.map(async (seat) => ({ seat, c: await login(playwright, { role: 'student', classCode: 'DEMO801', seat }) })));
  let stopMates = async () => undefined as unknown;
  try {
    await hook(page);
    await page.goto('/#/student');
    await page.getByLabel('座號').fill(String(ME));
    await page.locator('#login-form').getByRole('button', { name: '登入' }).click();
    await expect(page.getByTestId('session-slide')).toBeAttached();
    // 單元總測驗 PK：36 vs 37，其他同學兩兩一組
    const control = async (action: string, data: Record<string, unknown> = {}) =>
      expect((await t.post(`/api/sessions/${sessionId}/control`, { headers, data: { action, ...data } })).status(), action).toBe(200);
    await control('pk-lobby', { unit: true });
    for (const seat of [ME, ...MATES]) await control('pk-pick', { seat });
    await control('pk-start', { seconds: 600 });
    stopMates = classmates(mates, sessionId);

    const tab = page.locator('.phone-tabs [data-tab="answer"]');
    if (await tab.isVisible().catch(() => false)) await tab.click();
    await expect(page.getByTestId('quiz-card')).toContainText('單元總測驗 PK');
    await expect(page.getByTestId('quiz-option-0')).toBeAttached({ timeout: 10_000 });
    const scroller = page.locator('.panel-col .panel-scroll');
    const cdp = await page.context().newCDPSession(page);
    const swipe = async () => {
      const b = await scroller.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height * 0.7), top: r.top };
      });
      const dy = Math.min(300, b.y - b.top - 20);
      let y = b.y;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y }] });
      for (let i = 0; i < 12; i++) {
        y -= dy / 12;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x, y: Math.round(y) }] });
        await page.waitForTimeout(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const writes = () => page.evaluate(() => (window as unknown as { __mckWrites: string[] }).__mckWrites.splice(0));
    const top = () => scroller.evaluate((el) => Math.round(el.scrollTop));
    const fails: string[] = [];
    for (const round of [1, 2, 3]) {
      await expect(page.locator('.mini-label')).toContainText(`第 ${round}／`);
      const geo = await scroller.evaluate((el) => {
        const opts = el.querySelectorAll('[data-action="quiz-choose"]');
        return { max: el.scrollHeight - el.clientHeight, optBottom: opts[opts.length - 1].getBoundingClientRect().bottom, boxBottom: el.getBoundingClientRect().bottom };
      });
      expect(geo.max, `question ${round} must overflow the phone panel`).toBeGreaterThan(200);
      expect(geo.optBottom, `question ${round}: options below the fold`).toBeGreaterThan(geo.boxBottom);
      // 新題目：從題幹開頭看起（上一題是捲到下面作答的）
      expect(await top(), `question ${round} starts at the top`).toBe(0);
      await writes();
      await swipe();
      await page.waitForTimeout(120);
      await swipe();
      await page.waitForTimeout(300);
      const set = await top();
      expect(set, `question ${round}: touch scroll moved the panel`).toBeGreaterThan(100);
      // 停在同一題：同學一直作答，推送一直來。題幹與附圖的節點要原封不動（沒有被重畫）
      await scroller.evaluate((el) => {
        (window as unknown as { __mckStem: Element | null }).__mckStem = el.querySelector('.quiz-stem');
      });
      const t0 = Date.now(),
        progress = new Set<string>(),
        samples: number[] = [];
      while (Date.now() - t0 < HOLD_MS) {
        samples.push(await top());
        progress.add((await page.locator('#pk-progress').textContent()) || '');
        await page.waitForTimeout(100);
      }
      const kept = await page.evaluate(() => !!(window as unknown as { __mckStem: Element | null }).__mckStem?.isConnected);
      const after = await writes();
      console.log(`question ${round}: scrolled to ${set}, then ${Math.min(...samples)}~${Math.max(...samples)}; progress texts ${progress.size}; app scroll writes ${after.length}; card kept ${kept}`);
      for (const w of after.slice(0, 8)) console.log('  ' + w);
      await expect(page.locator('.mini-label')).toContainText(`第 ${round}／`);
      if (samples.some((s) => Math.abs(s - set) > 4)) fails.push(`question ${round}: ${set} -> ${Math.min(...samples)}~${Math.max(...samples)}`);
      if (!kept) fails.push(`question ${round}: quiz card was re-rendered while only scores changed`);
      if (after.length) fails.push(`question ${round}: app wrote scroll ${after.length}x: ${after[0]}`);
      // 作答換下一題：點最後一個選項（在下面，要捲過去才點得到）
      await page.locator('[data-action="quiz-choose"]').last().tap();
    }
    expect(fails, 'question jumped while classmates answered').toEqual([]);
  } finally {
    await stopMates();
    await t.delete(`/api/sessions/${sessionId}`, { headers, data: {} }).catch(() => undefined);
    await t.dispose();
    for (const m of mates) await m.c.dispose();
  }
});
