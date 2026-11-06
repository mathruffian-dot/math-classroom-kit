// 魔王戰學生作答卡在手機上：題目出現後，學生往下滑去看選項，畫面不可以被拉回上面（2026-11-06 老師手機錄影）。
// 做法：手機版面（390×844、觸控），真的開一場魔王戰，學生抽應用題（攔截回應換成題庫裡最長的題目，選項一定在畫面下方），
// 背景同學一直作答（戰況、抗性、推送一直在變）。學生用觸控手勢（CDP touch；headless 的 synthesizeScrollGesture 不會動）往下滑到選項，
// 停在同一題上一段時間：捲動位置不可以被 app 改回去（記下 app 自己寫 scrollTop／scrollTo／scrollIntoView 的呼叫堆疊）。
// 幾輪：第一題、答過一題之後、慢網路（抽題回應晚到）、題目在學生正在滑的時候才到（抽題回應與推送都晚到）。
// 找到的原因：refreshRaid 換新題目時一律 scrollTop = 0；手機的選招畫面本身就要捲，學生按了應用題、一邊往下滑，題目一到就被拉回最上面。
// 現在：學生正在自己捲動就不拉回；沒在捲動時，新題目仍從題幹開頭看起（每題最多一次）。
import { test, expect, devices, type APIRequestContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const { defaultBrowserType: _ignored, ...phone } = devices['iPhone 13'];
test.use({ ...phone });

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const headers = { Origin: baseURL };
const HOLD_MS = Number(process.env.MCK_RAID_PHONE_MS || 8000);

type BankQ = { id: string; topic: string; stem: string; figure?: string; options: string[]; answer: number };
type Bank = { pools: Record<string, BankQ[]> };

async function login(playwright: typeof import('@playwright/test'), data: Record<string, unknown>) {
  const c = await playwright.request.newContext({ baseURL });
  expect((await c.post('/api/login', { headers, data })).status()).toBe(200);
  return c;
}

/** 背景的同學：一直抽題、答對，讓魔王血量、事件、抗性、推送一直變。 */
function classmate(c: APIRequestContext, sessionId: string, bank: Bank) {
  const byId = new Map(Object.values(bank.pools).flat().map((q) => [q.id, q]));
  let stop = false,
    n = 0;
  const loop = (async () => {
    let runId = '';
    while (!stop) {
      try {
        const view = await (await c.get(`/api/sessions/${sessionId}`)).json();
        const run = view.raid?.run;
        if (!run || run.endedAt || view.raid.state?.result) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        if (run.id !== runId) {
          runId = run.id;
          await c.post(`/api/sessions/${sessionId}/raid`, { headers, data: { runId, op: 'role', role: 'mage' } });
        }
        const kind = n++ % 12 < 8 ? 'attack' : 'shield';
        const d = await c.post(`/api/sessions/${sessionId}/raid`, { headers, data: { runId, op: 'draw', kind } });
        if (d.ok()) {
          const q = byId.get((await d.json()).question.id);
          await c.post(`/api/sessions/${sessionId}/raid`, { headers, data: { runId, op: 'answer', choice: q?.answer ?? 0 } });
        }
      } catch {
        /* 下一輪再試 */
      }
      await new Promise((r) => setTimeout(r, 600));
    }
  })();
  return async () => {
    stop = true;
    await loop;
  };
}

/** 抽題回應、推送、GET 裡學生自己的題目都換成這一題（伺服器抽到的是別題；id 也換，app 看到的是同一題）。 */
let inject: (BankQ & { kind: string }) | null = null;
let drawDelay = 0,
  pushDelay = 0;
function rewrite(text: string) {
  try {
    const d = JSON.parse(text);
    const swap = (q: Record<string, unknown> | undefined) => (!q || !inject ? q : { ...q, id: inject.id, kind: inject.kind, topic: inject.topic, stem: inject.stem, figure: inject.figure, options: inject.options });
    if (d.question) d.question = swap(d.question);
    const raid = d.view?.raid || d.raid;
    if (raid?.mine?.question) raid.mine.question = swap(raid.mine.question);
    return JSON.stringify(d);
  } catch {
    return text;
  }
}
async function hook(page: Page) {
  await page.route(/\/api\/sessions\/[^/]+(\/raid)?$/, async (route) => {
    const res = await route.fetch();
    const body = await res.text();
    // 慢網路：抽題的回應比推送晚到（推送先把題目畫出來，回應才到）
    if (drawDelay && route.request().method() === 'POST' && /"op":"(draw|skip)"/.test(route.request().postData() || '')) await new Promise((r) => setTimeout(r, drawDelay));
    return route.fulfill({ response: res, body: rewrite(body) });
  });
  await page.routeWebSocket(/./, (ws) => {
    const server = ws.connectToServer();
    // pushDelay：推送也慢（題目在學生已經開始滑的時候才到）；同樣延遲，順序不變
    server.onMessage((m) => {
      const out = typeof m === 'string' ? rewrite(m) : m;
      if (pushDelay) setTimeout(() => ws.send(out), pushDelay);
      else ws.send(out);
    });
    ws.onMessage((m) => server.send(m));
  });
}

test('raid phone: scrolling down to the options is not pulled back while the same question is showing', async ({ page, playwright }) => {
  test.setTimeout(120_000);
  const raidId = 'g8-2-2d';
  const bank = JSON.parse(await readFile(`content/raids/${raidId}.json`, 'utf8')) as Bank;
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
    const ws = window.scrollTo.bind(window);
    window.scrollTo = ((...a: unknown[]) => {
      log('window.scrollTo', JSON.stringify(a));
      return (ws as (...x: unknown[]) => void)(...a);
    }) as typeof window.scrollTo;
  });

  const t = await login(playwright, { role: 'teacher', account: 'teacher', password: '11235813' });
  const cl = (await (await t.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  await t.patch(`/api/classes/${cl.id}`, { headers, data: { requireCode: false } });
  const sessionId = (await (await t.post('/api/sessions', { headers, data: { lessonId: raidId, classId: cl.id } })).json()).session.id;
  const mate = await login(playwright, { role: 'student', classCode: 'DEMO801', seat: 37 });
  const stopMate = classmate(mate, sessionId, bank);
  try {
    expect((await t.post(`/api/sessions/${sessionId}/control`, { headers, data: { action: 'raid-start', difficulty: 'hard', seconds: 600 } })).status()).toBe(200);
    await hook(page);
    await page.goto('/#/student');
    await page.getByLabel('座號').fill('36');
    await page.locator('#login-form').getByRole('button', { name: '登入' }).click();
    await expect(page.getByTestId('session-slide')).toBeAttached();
    const tab = page.locator('.phone-tabs [data-tab="answer"]');
    if (await tab.isVisible().catch(() => false)) await tab.click();
    await expect(page.getByTestId('raid-card')).toBeVisible();
    await page.getByTestId('raid-role-knight').click();
    await page.getByTestId('raid-goal-skip').click();
    const scroller = page.locator('.raid-scroll');
    const card = page.locator('#student-answer');
    const cdp = await page.context().newCDPSession(page);
    const box = () => scroller.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height * 0.7), top: r.top };
    });
    // 學生用手指往上撥（真的觸控捲動；手指往上＝內容往下）
    const swipe = async () => {
      const b = await box();
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
    // 幾種情況各一輪：第一題、答過一題之後（有上一題的結果訊息）、慢網路（推送比抽題回應早到，學生一看到題目就開始滑）
    const cycles = [
      { label: 'first question', delay: 0, early: false },
      { label: 'after an answer', delay: 0, early: false },
      { label: 'slow network, scroll right away', delay: 1500, early: true },
      { label: 'slow network again', delay: 1500, early: true },
      // 學生按了應用題就一直往下滑（選招畫面捲到一半），題目在手指還在滑的時候才到
      { label: 'question lands while the student is scrolling', delay: 1200, early: true, during: true },
    ];
    const longQs = [...bank.pools.ultimate].filter((x) => !x.figure).sort((a, b) => b.stem.length - a.stem.length);
    const fails: string[] = [];
    for (const [ci, cyc] of cycles.entries()) {
      const q = longQs[ci % longQs.length];
      // 前一輪答錯的話等鎖定結束
      await expect(page.getByTestId('raid-kind-ultimate')).toBeVisible({ timeout: 15_000 });
      await page.getByTestId('raid-kind-ultimate').scrollIntoViewIfNeeded();
      inject = { ...q, kind: 'ultimate' };
      drawDelay = cyc.delay;
      pushDelay = 'during' in cyc ? cyc.delay : 0;
      await writes();
      let set: number;
      let before: string[] = [];
      let t0: number;
      if ('during' in cyc) {
        // 選招畫面先捲到一半（像學生往下找應用題），按下去之後手指繼續往下滑，題目在滑的途中到
        const chooseTop = await scroller.evaluate((el) => (el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) / 2)));
        console.log(`${cyc.label}: choose screen scrolled to ${chooseTop}`);
        await writes();
        await page.getByTestId('raid-kind-ultimate').tap();
        const t1 = Date.now();
        while (Date.now() - t1 < cyc.delay + 1200) {
          await swipe();
          await page.waitForTimeout(60);
        }
        await expect.poll(() => card.getAttribute('data-raid-key')).toContain(`|${q.id}|`);
        t0 = Date.now();
        await page.waitForTimeout(300);
        set = await scroller.evaluate((el) => Math.round(el.scrollTop));
        const w = await writes();
        // 學生一直在滑：題目到的那一刻也不可以被拉回最上面
        if (w.length) fails.push(`${cyc.label}: app wrote scroll while the finger was moving ${w.length}x: ${w[0]}`);
      } else {
        await page.getByTestId('raid-kind-ultimate').tap();
        await expect.poll(() => card.getAttribute('data-raid-key')).toContain(`|${q.id}|`);
        const geo = await scroller.evaluate((el) => {
          const opts = el.querySelectorAll('[data-action="raid-answer"]');
          return { max: el.scrollHeight - el.clientHeight, optBottom: opts[opts.length - 1].getBoundingClientRect().bottom, boxBottom: el.getBoundingClientRect().bottom, top: el.scrollTop };
        });
        expect(geo.max, `${cyc.label}: question must overflow the phone panel`).toBeGreaterThan(80);
        expect(geo.optBottom, `${cyc.label}: options end below the fold`).toBeGreaterThan(geo.boxBottom);
        // 題目剛出現（學生還沒滑）：從題目開頭看起
        expect(geo.top, `${cyc.label}: new question starts at the top`).toBe(0);
        if (!cyc.early) await page.waitForTimeout(500);
        before = await writes();
        await swipe();
        await page.waitForTimeout(120);
        await swipe();
        t0 = Date.now();
        await page.waitForTimeout(300);
        set = await scroller.evaluate((el) => Math.round(el.scrollTop));
      }
      expect(set, `${cyc.label}: touch scroll moved the panel`).toBeGreaterThan(40);
      // 停在同一題：戰況、推送、抽題回應一直在來
      const samples: number[] = [];
      while (Date.now() - t0 < Math.max(HOLD_MS / 2, cyc.delay + 2500)) {
        samples.push(await scroller.evaluate((el) => Math.round(el.scrollTop)));
        await page.waitForTimeout(100);
      }
      const after = await writes();
      const key = await card.getAttribute('data-raid-key');
      console.log(`${cyc.label}: writes before scrolling ${before.length}; scrolled to ${set}, then ${Math.min(...samples)}~${Math.max(...samples)}; app scroll writes while scrolled ${after.length}`);
      for (const w of [...before, ...after].slice(0, 12)) console.log('  ' + w);
      expect(key, `${cyc.label}: still the same question`).toContain(`|${q.id}|`);
      if (samples.some((s) => Math.abs(s - set) > 4)) fails.push(`${cyc.label}: ${set} -> ${Math.min(...samples)}~${Math.max(...samples)}`);
      if (after.length) fails.push(`${cyc.label}: app wrote scroll ${after.length}x: ${after[0]}`);
      // 作答（換下一輪）：點最後一個選項
      drawDelay = pushDelay = 0;
      await page.locator('#student-answer [data-action="raid-answer"]').last().tap();
      await expect(card).not.toHaveAttribute('data-raid-key', new RegExp(`\\|${q.id}\\|`));
    }
    expect(fails, 'student scroll was pulled back').toEqual([]);
  } finally {
    inject = null;
    await stopMate();
    await t.delete(`/api/sessions/${sessionId}`, { headers, data: {} }).catch(() => undefined);
    await t.dispose();
    await mate.dispose();
  }
});
