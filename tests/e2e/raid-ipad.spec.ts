// 魔王戰學生作答卡在 iPad（WebKit、觸控、浮動捲軸）上不可以一直被重畫。
// 2026-10-30 第二輪：老師回報 2-2 魔王戰的應用題（長題目）面板上下跳、捲動卡住。iPad 的捲軸不占寬度，
// 真正的原因是 app 每 0.25 秒用 innerHTML 重建作答卡上方的戰況（#raid-mini），而且同學一作答、
// 記憶題抗性一變（raidCardKey 裡的 eff）整張卡（題目、選項、附圖）就整個重建：觸控捲動的目標節點被拿掉、捲動位置被重設。
// 上一輪的 raid-layout.spec.ts 把作答卡改名（#raid-probe）擋掉了 app 的更新，所以量不到。
//
// 做法：真的開一場魔王戰，學生（iPad 橫向、WebKit）抽應用題，攔截抽題回應換成題庫裡指定的題目（app 的更新照常跑），
// 另一位同學（API）在背景一直答記憶題／理解題（魔王血量、抗性跟著變）。每題 MCK_RAID_IPAD_MS（預設 5 秒）：
// MutationObserver 計數作答卡新增／移除的節點與文字變動（題目區、戰況區分開算）、題幹節點有沒有被換掉、
// 捲動到一半後 scrollTop 有沒有被改、題幹 offsetTop、面板高度。
// 環境變數：MCK_RAID_IPAD_ONLY（只跑某個題庫）、MCK_RAID_IPAD_FILTER（題目 id 正規式）、MCK_RAID_IPAD_LABEL（結果檔名）、
// MCK_RAID_IPAD_STRICT=0（只記錄不判定，修正前量測用）。結果 JSON 寫到 os.tmpdir()/mck-raid-ipad/。
import { test, expect, devices, type APIRequestContext, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { defaultBrowserType: _ignored, ...ipad } = devices['iPad (gen 7) landscape'];
test.use({ ...ipad });

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const MS = Number(process.env.MCK_RAID_IPAD_MS || 5000);
const headers = { Origin: baseURL };
const STRICT = process.env.MCK_RAID_IPAD_STRICT !== '0';

type BankQ = { id: string; topic: string; stem: string; figure?: string; options: string[]; answer: number };
type Bank = { pools: Record<string, BankQ[]> };

/** 要量的題目：g8-2-2d 全部的長題目與附圖應用題；g9-1-4c 抽查第 18 題（應用題第 18 題）與前 3 題附圖題。 */
function pick(raidId: string, bank: Bank) {
  const ult = bank.pools.ultimate || [];
  let list: BankQ[];
  if (raidId === 'g9-1-4c') list = [ult[17], ...ult.filter((q) => q.figure).slice(0, 3)].filter(Boolean);
  else list = ult.filter((q) => q.stem.length > 60 || q.figure);
  const only = process.env.MCK_RAID_IPAD_FILTER ? new RegExp(process.env.MCK_RAID_IPAD_FILTER) : null;
  return [...new Map(list.map((q) => [q.id, q])).values()].filter((q) => !only || only.test(q.id));
}

async function login(playwright: typeof import('@playwright/test'), data: Record<string, unknown>) {
  const c = await playwright.request.newContext({ baseURL });
  expect((await c.post('/api/login', { headers, data })).status()).toBe(200);
  return c;
}

/** 背景的同學：一直抽題、答對（記憶題為主，抗性會起伏），讓魔王血量、事件、抗性像真的課堂一樣變。 */
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
        // 一陣子記憶題、一陣子理解題：記憶題比例在 60%～90% 之間起伏，抗性會一級一級變
        const kind = n++ % 12 < 8 ? 'attack' : 'shield';
        const d = await c.post(`/api/sessions/${sessionId}/raid`, { headers, data: { runId, op: 'draw', kind } });
        if (d.ok()) {
          const q = byId.get((await d.json()).question.id);
          await c.post(`/api/sessions/${sessionId}/raid`, { headers, data: { runId, op: 'answer', choice: q?.answer ?? 0 } });
        }
      } catch {
        /* 下一輪再試 */
      }
      await new Promise((r) => setTimeout(r, 700));
    }
  })();
  return async () => {
    stop = true;
    await loop;
  };
}

/** 開戰 → 學生選角色、不設目標 → 抽一題應用題。 */
async function toQuestion(t: APIRequestContext, page: Page, sessionId: string) {
  expect((await t.post(`/api/sessions/${sessionId}/control`, { headers, data: { action: 'raid-start', difficulty: 'hard', seconds: 600 } })).status()).toBe(200);
  await page.reload();
  await expect(page.getByTestId('raid-card')).toBeVisible();
  const role = page.getByTestId('raid-role-knight');
  if (await role.isVisible().catch(() => false)) await role.click();
  const skip = page.getByTestId('raid-goal-skip');
  await expect(skip.or(page.getByTestId('raid-kind-ultimate'))).toBeVisible();
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect(page.getByTestId('raid-kind-ultimate')).toBeVisible({ timeout: 10_000 });
}

type Row = { raid: string; id: string; topic: string; stemLen: number; figure: boolean; overflow: boolean; nodes: number; questionNodes: number; miniNodes: number; text: number; stemReplaced: boolean; scrollSet: number; scrollChanged: number; scrollRange: [number, number]; stemTop: [number, number]; panelH: [number, number] };

/** 要換成的題目：抽題回應、推送（WebSocket）與重新整理拿到的 view 裡學生自己的題目都換成它（伺服器端抽到的是別題）。 */
let inject: (BankQ & { kind: string }) | null = null;
function swap(q: Record<string, unknown> | undefined) {
  if (!q || !inject) return q;
  return { ...q, id: inject.id, kind: inject.kind, topic: inject.topic, stem: inject.stem, figure: inject.figure, options: inject.options };
}
function rewrite(text: string) {
  try {
    const d = JSON.parse(text);
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
    return route.fulfill({ response: res, body: rewrite(await res.text()) });
  });
  await page.routeWebSocket(/./, (ws) => {
    const server = ws.connectToServer();
    server.onMessage((m) => ws.send(typeof m === 'string' ? rewrite(m) : m));
    ws.onMessage((m) => server.send(m));
  });
}
/** 抽題（換成指定題目）後量 MS 毫秒。 */
async function measure(page: Page, q: BankQ, kind: string, ms: number) {
  inject = { ...q, kind };
  // 這一場打完了：回去重新開一場
  const ready = page.locator('#student-answer [data-testid="raid-kind-ultimate"], #student-answer .raid-switch [data-kind="ultimate"]');
  if (!(await ready.first().isVisible().catch(() => false))) return null;
  // 作答畫面上有「換成…」的按鈕；選招畫面直接按應用題
  const sw = page.locator('#student-answer .raid-switch [data-kind="shield"]');
  if (await sw.isVisible().catch(() => false)) {
    await sw.click();
    await expect(page.locator('#student-answer .raid-kind.k-shield')).toBeVisible();
  }
  await page.locator('#student-answer [data-testid="raid-kind-ultimate"], #student-answer .raid-switch [data-kind="ultimate"]').first().click();
  await expect(page.locator('#student-answer .raid-kind.k-ultimate')).toBeVisible();
  await expect.poll(() => page.locator('#student-answer').getAttribute('data-raid-key')).toContain(`|${q.id}|`);
  return page.evaluate(
    async ({ ms }) => {
      const card = document.querySelector<HTMLElement>('#student-answer')!;
      const ps = card.closest<HTMLElement>('.panel-scroll')!;
      await card.querySelector<HTMLImageElement>('.quiz-figure')?.decode().catch(() => undefined);
      await new Promise((r) => setTimeout(r, 300));
      const stem0 = card.querySelector('.quiz-stem');
      const overflow = ps.scrollHeight > ps.clientHeight + 1;
      // 捲到最下面（模擬學生往下滑去看選項）
      const target = overflow ? ps.scrollHeight - ps.clientHeight : 0;
      ps.scrollTop = target;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const scrollSet = Math.round(ps.scrollTop);
      let nodes = 0,
        questionNodes = 0,
        miniNodes = 0,
        text = 0;
      const mo = new MutationObserver((list) => {
        for (const m of list) {
          const k = m.addedNodes.length + m.removedNodes.length;
          const t = m.target as Node;
          const el = (t.nodeType === 1 ? t : t.parentElement) as Element | null;
          if (m.type === 'characterData') text++;
          nodes += k;
          if (el?.closest('#raid-mini')) miniNodes += k + (m.type === 'characterData' ? 1 : 0);
          else questionNodes += k;
        }
      });
      mo.observe(card, { childList: true, subtree: true, characterData: true });
      const st: number[] = [],
        top: number[] = [],
        ph: number[] = [];
      let changed = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        const s = Math.round(ps.scrollTop);
        if (Math.abs(s - scrollSet) > 1) changed++;
        st.push(s);
        const stem = card.querySelector<HTMLElement>('.quiz-stem');
        top.push(stem ? Math.round(stem.getBoundingClientRect().top) : -1);
        ph.push(ps.clientHeight);
        await new Promise((r) => setTimeout(r, 100));
      }
      mo.disconnect();
      const rng = (a: number[]) => [Math.min(...a), Math.max(...a)] as [number, number];
      return { figure: !!card.querySelector('.quiz-figure'), overflow, nodes, questionNodes, miniNodes, text, stemReplaced: card.querySelector('.quiz-stem') !== stem0 || !stem0?.isConnected, scrollSet, scrollChanged: changed, scrollRange: rng(st), stemTop: rng(top), panelH: rng(ph), over: !!card.querySelector('[data-testid="raid-my-result"]') };
    },
    { ms },
  );
}

const RAIDS = ['g8-2-2d', 'g9-1-4c'].filter((r) => !process.env.MCK_RAID_IPAD_ONLY || process.env.MCK_RAID_IPAD_ONLY === r);
for (const [i, raidId] of RAIDS.entries()) {
  test(`raid iPad: the question card of ${raidId} is not rebuilt while classmates play`, async ({ page, playwright, browserName }) => {
    const bank = JSON.parse(await readFile(`content/raids/${raidId}.json`, 'utf8')) as Bank;
    const items = pick(raidId, bank);
    test.setTimeout(90_000 + items.length * (MS + 3000));
    const t = await login(playwright, { role: 'teacher', account: 'teacher', password: '11235813' });
    const cl = (await (await t.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
    await t.patch(`/api/classes/${cl.id}`, { headers, data: { requireCode: false } });
    const sessionId = (await (await t.post('/api/sessions', { headers, data: { lessonId: raidId, classId: cl.id } })).json()).session.id;
    const mate = await login(playwright, { role: 'student', classCode: 'DEMO801', seat: 38 + i });
    const stopMate = classmate(mate, sessionId, bank);
    const rows: Row[] = [];
    try {
      inject = null;
      await hook(page);
      await page.goto('/#/student');
      await page.getByLabel('座號').fill(String(33 + i));
      await page.locator('#login-form').getByRole('button', { name: '登入' }).click();
      await expect(page.getByTestId('session-slide')).toBeVisible();
      await toQuestion(t, page, sessionId);
      for (const q of items) {
        let got = await measure(page, q, 'ultimate', MS);
        if (!got || got.over) {
          await toQuestion(t, page, sessionId);
          got = await measure(page, q, 'ultimate', MS);
        }
        expect(got, `${q.id} measured`).toBeTruthy();
        rows.push({ raid: raidId, id: q.id, topic: q.topic, stemLen: q.stem.length, ...got! });
      }
    } finally {
      await stopMate();
      await t.delete(`/api/sessions/${sessionId}`, { headers, data: {} }).catch(() => undefined);
      await t.dispose();
      await mate.dispose();
    }
    const dir = join(tmpdir(), 'mck-raid-ipad');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${browserName}-${process.env.MCK_RAID_IPAD_LABEL || 'run'}-${raidId}.json`), JSON.stringify(rows, null, 1));
    const sum = (k: 'nodes' | 'questionNodes' | 'miniNodes' | 'text' | 'scrollChanged') => rows.reduce((a, r) => a + r[k], 0);
    console.log(`${browserName} ${raidId}: ${rows.length} 題 × ${MS / 1000} 秒｜新增移除節點 ${sum('nodes')}（題目區 ${sum('questionNodes')}、戰況 ${sum('miniNodes')}）｜文字變動 ${sum('text')}｜題幹被換掉 ${rows.filter((r) => r.stemReplaced).length} 題｜scrollTop 被改 ${rows.filter((r) => r.scrollChanged).length} 題｜可捲動 ${rows.filter((r) => r.overflow).length} 題`);
    for (const r of rows) console.log(`  ${r.id} len=${r.stemLen}${r.figure ? ' 圖' : ''} nodes=${r.nodes} q=${r.questionNodes} mini=${r.miniNodes} text=${r.text} stemReplaced=${r.stemReplaced} scroll ${r.scrollSet}→${r.scrollRange.join('~')} stemTop=${r.stemTop.join('~')} panelH=${r.panelH.join('~')}`);
    if (!STRICT) return;
    // 題目沒變：題目區一個節點都不可以被換掉，捲動位置不可以被改；戰況只更新有變的文字
    expect(rows.filter((r) => r.stemReplaced || r.questionNodes > 0).map((r) => r.id), 'question DOM rebuilt').toEqual([]);
    // 往下捲過的題目：不可以被重設回上面，題幹在畫面上的位置不可以動（戰況變高變矮時 scrollTop 會跟著補，這是對的）
    expect(rows.filter((r) => r.scrollSet > 0 && (r.scrollRange[0] === 0 || r.stemTop[1] - r.stemTop[0] > 1)).map((r) => `${r.id} ${r.scrollSet}→${r.scrollRange.join('~')} stemTop ${r.stemTop.join('~')}`), 'scrolled question moved').toEqual([]);
    // 戰況：每 0.25 秒整塊重建的話 5 秒會有上百個節點；只更新文字時是 0（血條出現、大招預告這種真的變了才會有幾個）
    expect(rows.filter((r) => r.miniNodes > 40).map((r) => `${r.id} ${r.miniNodes}`), 'mini rebuilt every tick').toEqual([]);
  });
}
