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
/** 強迫「大招預告＋抗性」同時成立：推送與 GET 的戰況改成 25 秒後大招落下、最近 45 秒全是記憶題（sweep 用）。 */
let forceAlert = false;
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
    if (forceAlert && raid?.state && !raid.state.result) {
      raid.state.bossUltAt = raid.state.t + 25_000;
      raid.state.recent = Array.from({ length: 12 }, () => ({ t: raid.state.t - 1000, kind: 'attack', seat: 40 }));
    }
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

// ───────────── 第三輪：各種 iPad 寬度下，題幹在畫面上的位置不可以自己動 ─────────────
// 2026-10-30 15:30 上課，bd99b3b 之後「少數」學生的 iPad 題目區仍會跳。只有少數 → 和裝置寬度、學生狀態有關。
// 這裡在數個代表性組合（橫向、直向、Split View、Safari 頁面縮放）各量一次：題幹 getBoundingClientRect().top、
// 捲動容器 scrollTop、戰況區高度、整頁 scrollY、visualViewport.height、app 自己寫 scrollTop 的次數。
// 找到的原因：戰況區的「已答對」行、抗性提示、大招預告是有才出現，依寬度換成 1～4 行，高度在 65～217px 之間跳；
// 「已答對」這一行還會因為 liveState 替別的座號建立成績而忽有忽無（還沒答過題、座號比同學大的學生）。
// 沒往下捲、或題目放得下的學生沒有補償可救；有往下捲的，bd99b3b 的 scrollTop 補償又會打斷慣性捲動。
// MCK_RAID_SWEEP=all 跑完整 13 組（量測用）；預設只跑 4 個代表性組合。結果 JSON（MCK_RAID_SWEEP_SHOT=1 時加截圖）寫到 os.tmpdir()/mck-raid-ipad3/。
type Combo = { name: string; device: string; width?: number; height?: number };
const COMBOS_ALL: Combo[] = [
  { name: 'gen7 橫 1080×810', device: 'iPad (gen 7) landscape' },
  { name: 'gen7 直 810×1080', device: 'iPad (gen 7)' },
  { name: 'gen11 直 656×944', device: 'iPad (gen 11)' },
  { name: 'gen11 橫 944×656', device: 'iPad (gen 11) landscape' },
  { name: 'Mini 橫 1024×768', device: 'iPad Mini landscape' },
  { name: 'Mini 直 768×1024', device: 'iPad Mini' },
  { name: 'Pro11 直 834×1194', device: 'iPad Pro 11' },
  { name: 'Split View 507×810', device: 'iPad (gen 7) landscape', width: 507, height: 810 },
  { name: 'Split View 678×810', device: 'iPad (gen 7) landscape', width: 678, height: 810 },
  { name: 'Split View 981×810', device: 'iPad (gen 7) landscape', width: 981, height: 810 },
  // Safari「頁面縮放」115%／125%／150%：等於版面寬高除以縮放比例
  { name: 'gen7 橫 縮放115% 939×704', device: 'iPad (gen 7) landscape', width: 939, height: 704 },
  { name: 'gen7 橫 縮放125% 864×648', device: 'iPad (gen 7) landscape', width: 864, height: 648 },
  { name: 'gen7 橫 縮放150% 720×540', device: 'iPad (gen 7) landscape', width: 720, height: 540 },
];
// gen11 橫 944×656：右側面板 360px，是所有組合裡最窄的提示格（檢查關鍵數字沒有被省略號切掉）
const SWEEP_DEFAULT = ['gen7 橫 1080×810', 'gen7 直 810×1080', 'gen11 橫 944×656', 'Split View 678×810', 'gen7 橫 縮放125% 864×648'];
const COMBOS = process.env.MCK_RAID_SWEEP === 'all' ? COMBOS_ALL : COMBOS_ALL.filter((c) => (process.env.MCK_RAID_SWEEP ? process.env.MCK_RAID_SWEEP.split(',') : SWEEP_DEFAULT).includes(c.name));
const SWEEP_MS = Number(process.env.MCK_RAID_SWEEP_MS || 5000);

type Sample = { mode: string; ended: boolean; overflow: boolean; scroller: string; jumps: number; maxJump: number; stemTop: [number, number]; scrollTop: [number, number]; miniH: number[]; pageY: [number, number]; vvH: [number, number]; appScrollWrites: number; flingStalls: number; miniTexts: string[]; shifts: string[] };

/** 量一個模式：top（不捲動）、half（捲到一半）、fling（每一幀往下捲 3px，模擬慣性捲動，看 app 有沒有把位置拉回）。 */
async function sample(page: Page, mode: 'top' | 'half' | 'fling', ms: number): Promise<Sample> {
  return page.evaluate(
    async ({ mode, ms }) => {
      const w = window as unknown as { __mckScroll: { app: number; mine: boolean } };
      const card = document.querySelector<HTMLElement>('#student-answer')!;
      await card.querySelector<HTMLImageElement>('.quiz-figure')?.decode().catch(() => undefined);
      await new Promise((r) => setTimeout(r, 400));
      const stemEl = () => card.querySelector<HTMLElement>('.quiz-stem');
      // 真正的捲動容器：往上找第一個可以捲的祖先，找不到就是整頁
      let sc: HTMLElement | null = stemEl();
      while (sc && sc !== document.body) {
        const oy = getComputedStyle(sc).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && sc.scrollHeight > sc.clientHeight + 1) break;
        sc = sc.parentElement;
      }
      const scroller = sc && sc !== document.body ? sc : (document.scrollingElement as HTMLElement);
      const overflow = scroller.scrollHeight > scroller.clientHeight + 1;
      const max = scroller.scrollHeight - scroller.clientHeight;
      const set = (v: number) => {
        w.__mckScroll.mine = true;
        scroller.scrollTop = v;
        w.__mckScroll.mine = false;
      };
      set(0);
      if (mode === 'half') set(Math.round(max / 2));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      w.__mckScroll.app = 0;
      const shifts: string[] = [];
      let po: PerformanceObserver | null = null;
      try {
        po = new PerformanceObserver((l) => {
          for (const e of l.getEntries() as unknown as { value: number; sources?: { node?: Node }[] }[])
            for (const s of e.sources || []) {
              const n = s.node as Element | undefined;
              const el = n?.nodeType === 1 ? n : n?.parentElement;
              shifts.push(`${el?.id ? '#' + el.id : el?.className || n?.nodeName || '?'}`);
            }
        });
        po.observe({ type: 'layout-shift', buffered: false });
      } catch {
        po = null;
      }
      const mini = () => card.querySelector<HTMLElement>('#raid-mini');
      const top: number[] = [],
        st: number[] = [],
        py: number[] = [],
        vv: number[] = [];
      const miniH = new Set<number>(),
        miniTexts = new Map<number, string>();
      let jumps = 0,
        maxJump = 0,
        stalls = 0,
        prev: number | null = null;
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        if (mode === 'fling' && overflow) {
          // 慣性捲動：每一幀往下 3px，到底就回到上面再來；app 若在中途寫 scrollTop，位置會偏離我們設的值
          const want = scroller.scrollTop + 3 > max ? 0 : scroller.scrollTop + 3;
          set(want);
          await new Promise((r) => requestAnimationFrame(r));
          if (Math.abs(scroller.scrollTop - want) > 1) stalls++;
          continue;
        }
        const s = stemEl();
        const t = s ? Math.round(s.getBoundingClientRect().top * 10) / 10 : -1;
        // 使用者沒有捲動：題幹在畫面上動了 > 1px 就算一次跳動
        if (prev !== null && Math.abs(t - prev) > 1) {
          jumps++;
          maxJump = Math.max(maxJump, Math.round(Math.abs(t - prev)));
        }
        prev = t;
        top.push(t);
        st.push(Math.round(scroller.scrollTop));
        py.push(Math.round(window.scrollY));
        vv.push(Math.round(window.visualViewport?.height || 0));
        const m = mini();
        const h = m ? Math.round(m.getBoundingClientRect().height * 10) / 10 : -1;
        miniH.add(h);
        if (m && !miniTexts.has(h) && miniTexts.size < 4) miniTexts.set(h, Array.from(m.children).map((c) => `[${Math.round(c.getBoundingClientRect().height)}]${(c as HTMLElement).innerText.replace(/\s+/g, ' ')}`).join(' / '));
        await new Promise((r) => setTimeout(r, 50));
      }
      po?.disconnect();
      const rng = (a: number[]) => (a.length ? ([Math.min(...a), Math.max(...a)] as [number, number]) : ([0, 0] as [number, number]));
      // 題幹不見了：魔王戰在量測中結束（英雄被打倒、時間到），這一段不算跳動
      return { mode, ended: top.includes(-1), overflow, scroller: scroller === document.scrollingElement ? 'document' : scroller.className, jumps, maxJump, stemTop: rng(top), scrollTop: rng(st), miniH: [...miniH].sort((a, b) => a - b), pageY: rng(py), vvH: rng(vv), appScrollWrites: w.__mckScroll.app, flingStalls: stalls, miniTexts: [...miniTexts.entries()].map(([h, t]) => `${h}: ${t}`), shifts: [...new Set(shifts)].slice(0, 8) };
    },
    { mode, ms },
  );
}

test('raid iPad sweep: the stem stays put on representative iPad widths while the battle runs', async ({ browser, playwright, browserName }) => {
  const raidId = 'g8-2-2d';
  const bank = JSON.parse(await readFile(`content/raids/${raidId}.json`, 'utf8')) as Bank;
  // 代表性題目：文字最長的一題、附圖題中文字最長的一題
  const byLen = [...bank.pools.ultimate].sort((a, b) => b.stem.length - a.stem.length);
  const qs = [byLen.find((q) => !q.figure)!, byLen.find((q) => q.figure)!];
  test.setTimeout(120_000 + COMBOS.length * (SWEEP_MS * 4 + 20_000));
  const t = await login(playwright, { role: 'teacher', account: 'teacher', password: '11235813' });
  const cl = (await (await t.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  await t.patch(`/api/classes/${cl.id}`, { headers, data: { requireCode: false } });
  const sessionId = (await (await t.post('/api/sessions', { headers, data: { lessonId: raidId, classId: cl.id } })).json()).session.id;
  const mate = await login(playwright, { role: 'student', classCode: 'DEMO801', seat: 40 });
  const stopMate = classmate(mate, sessionId, bank);
  const out: (Sample & { combo: string; q: string; lines?: { cls: string; text: string; cut: boolean }[] })[] = [];
  try {
    expect((await t.post(`/api/sessions/${sessionId}/control`, { headers, data: { action: 'raid-start', difficulty: 'hard', seconds: 600 } })).status()).toBe(200);
    for (const [ci, combo] of COMBOS.entries()) {
      const { defaultBrowserType: _d, ...dev } = devices[combo.device];
      const size = combo.width ? { width: combo.width, height: combo.height! } : null;
      const ctx = await browser.newContext({ ...dev, baseURL, ...(size ? { viewport: size, screen: size } : {}) });
      // 數 app 自己寫 scrollTop 的次數（量測程式自己的寫入不算）
      await ctx.addInitScript(() => {
        const w = window as unknown as { __mckScroll: { app: number; mine: boolean } };
        w.__mckScroll = { app: 0, mine: false };
        const d = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!;
        Object.defineProperty(Element.prototype, 'scrollTop', {
          configurable: true,
          get: d.get,
          set(v: number) {
            if (!w.__mckScroll.mine) w.__mckScroll.app++;
            d.set!.call(this, v);
          },
        });
      });
      const page = await ctx.newPage();
      try {
        inject = null;
        await hook(page);
        await page.goto('/#/student');
        await page.getByLabel('座號').fill(String(10 + ci));
        await page.locator('#login-form').getByRole('button', { name: '登入' }).click();
        await expect(page.getByTestId('session-slide')).toBeAttached();
        // 手機分頁版面（寬度 ≤ 760）：切到「作答」
        const tab = page.locator('.phone-tabs [data-tab="answer"]');
        if (await tab.isVisible().catch(() => false)) await tab.click();
        await expect(page.getByTestId('raid-card')).toBeVisible();
        const role = page.getByTestId('raid-role-knight');
        if (await role.isVisible().catch(() => false)) await role.click();
        const skip = page.getByTestId('raid-goal-skip');
        await expect(skip.or(page.getByTestId('raid-kind-ultimate'))).toBeVisible();
        if (await skip.isVisible().catch(() => false)) await skip.click();
        for (const [qi, q] of qs.entries()) {
          if (qi === 0) {
            inject = { ...q, kind: 'ultimate' };
            await page.getByTestId('raid-kind-ultimate').click();
          } else {
            // 先換成理解題（不換題目內容），再換回應用題，抽到的就是這一題
            inject = null;
            await page.locator('#student-answer .raid-switch [data-kind="shield"]').click();
            await expect(page.locator('#student-answer .raid-kind.k-shield')).toBeVisible();
            inject = { ...q, kind: 'ultimate' };
            await page.locator('#student-answer .raid-switch [data-kind="ultimate"]').click();
          }
          await expect.poll(() => page.locator('#student-answer').getAttribute('data-raid-key')).toContain(`|${q.id}|`);
          for (const mode of qi === 0 ? (['top', 'half', 'fling'] as const) : (['top'] as const)) {
            const r = await sample(page, mode, SWEEP_MS);
            out.push({ combo: combo.name, q: q.id + (q.figure ? '（圖）' : ''), ...r });
          }
          if (qi === qs.length - 1) {
            // 大招預告＋抗性同時成立：兩行都在、關鍵數字沒有被切掉、戰況區高度和平常一樣
            forceAlert = true;
            try {
              await expect(page.getByTestId('raid-alert-resist')).toBeVisible({ timeout: 10_000 });
              await expect(page.getByTestId('raid-alert-warn')).toBeVisible();
              const r = await sample(page, 'top', 2500);
              const lines = await page.$$eval('[data-testid="raid-mini-alert"] .raid-alert-line', (els) => els.map((e) => ({ cls: e.className, text: e.textContent || '', cut: e.scrollWidth > e.clientWidth + 1 })));
              out.push({ combo: combo.name, q: '預告＋抗性', ...r, lines });
            } finally {
              forceAlert = false;
            }
          }
          if (process.env.MCK_RAID_SWEEP_SHOT) await page.screenshot({ path: join(tmpdir(), 'mck-raid-ipad3', `${combo.name.replace(/[^\w]+/g, '_')}-${qi}.png`) });
        }
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await stopMate();
    await t.delete(`/api/sessions/${sessionId}`, { headers, data: {} }).catch(() => undefined);
    await t.dispose();
    await mate.dispose();
  }
  const dir = join(tmpdir(), 'mck-raid-ipad3');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${browserName}-${process.env.MCK_RAID_IPAD_LABEL || 'sweep'}.json`), JSON.stringify(out, null, 1));
  for (const r of out)
    console.log(
      `${r.combo} | ${r.q} | ${r.mode} | ${r.scroller}${r.overflow ? '' : '（放得下）'} | 跳 ${r.jumps} 次 最大 ${r.maxJump}px | stemTop ${r.stemTop.join('~')} | scrollTop ${r.scrollTop.join('~')} | mini ${r.miniH.join('/')} | pageY ${r.pageY.join('~')} | vv ${r.vvH.join('~')} | app 寫 scrollTop ${r.appScrollWrites} | 慣性被拉回 ${r.flingStalls}${r.shifts.length ? ` | CLS ${r.shifts.join(' ')}` : ''}\n    ${r.miniTexts.join('\n    ')}`,
    );
  for (const r of out.filter((x) => x.lines)) console.log(`  ${r.combo} 提示格：${r.lines!.map((l) => `${l.text}${l.cut ? '（被切掉）' : ''}`).join(' ／ ')}`);
  if (!STRICT) return;
  // 大招預告與抗性同時成立：兩行都看得到，倒數、防護罩、抗性百分比都沒有被省略號切掉
  for (const r of out.filter((x) => x.lines && !x.ended)) {
    const warn = r.lines!.find((l) => l.cls.includes('warn')),
      resist = r.lines!.find((l) => l.cls.includes('resist'));
    expect(warn?.text, `${r.combo} warn`).toMatch(/\d+ 秒後・防護罩 [\d.]+／3 秒/);
    expect(resist?.text, `${r.combo} resist`).toMatch(/只剩 \d+%/);
    expect(r.lines!.filter((l) => l.cut).map((l) => `${r.combo} ${l.text}`), 'alert text cut off').toEqual([]);
  }
  // 同一個組合裡，平常、大招預告＋抗性時的戰況區都是同一個高度
  for (const c of new Set(out.map((r) => r.combo))) {
    const hs = new Set(out.filter((r) => r.combo === c && !r.ended).flatMap((r) => r.miniH));
    expect([...hs].length, `${c} mini heights ${[...hs].join('/')}`).toBe(1);
  }
  // 沒有使用者捲動：題幹在畫面上 0 次跳動；戰況區只有一種高度；app 不寫 scrollTop（不會打斷慣性捲動）；整頁不捲
  console.log(`戰鬥在量測中結束：${out.filter((r) => r.ended).length} 段（不列入判定）`);
  expect(out.filter((r) => !r.ended).length, 'enough samples').toBeGreaterThan(out.length / 2);
  expect(out.filter((r) => !r.ended && r.mode !== 'fling' && r.jumps > 0).map((r) => `${r.combo} ${r.q} ${r.mode} 跳 ${r.jumps} 次 ${r.maxJump}px`), 'stem moved').toEqual([]);
  expect(out.filter((r) => !r.ended && r.miniH.length > 1).map((r) => `${r.combo} ${r.q} ${r.mode} mini ${r.miniH.join('/')}`), 'mini height changed').toEqual([]);
  expect(out.filter((r) => r.appScrollWrites > 0 || r.flingStalls > 0).map((r) => `${r.combo} ${r.mode} writes ${r.appScrollWrites} stalls ${r.flingStalls}`), 'app wrote scrollTop').toEqual([]);
  expect(out.filter((r) => r.pageY[1] > 0).map((r) => `${r.combo} pageY ${r.pageY.join('~')}`), 'page scrolled').toEqual([]);
});
