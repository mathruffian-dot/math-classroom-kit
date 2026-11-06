// 魔王戰版面：iPad 橫向，每一題有附圖的題目，右側題目面板不可以上下跳動。
// 2026-10-30 老師實測：九年級魔王戰（無理數魔像）鏡子測樹高附圖題，面板一直上下跳——
// 垂直捲軸出現使面板變窄 → 依寬度縮放的附圖變矮 → 剛好放得下、捲軸消失 → 面板變寬 → 附圖變高又溢出，無限循環。
//
// 做法：真的開一場魔王戰、學生抽到一題（真的畫面、真的 CSS），再用真的 raidCardHtml 把作答卡依序換成
// content/raids/*.json 每一題有附圖的題目，每題取樣一段時間（預設 1 秒、每 50ms）：面板 clientWidth／clientHeight／
// scrollHeight／scrollTop、附圖尺寸。同一個量來回變（A→B→A）就是振盪。
// 環境變數：MCK_RAID_SAMPLE_MS（取樣毫秒，預設 1000）、MCK_RAID_ONLY（只跑某個題庫，例如 g9-1-4c）、
// MCK_RAID_LABEL（結果檔名標籤，例如 before／after）、MCK_RAID_FILTER（只跑 id 符合這個正規式的題目）、
// MCK_RAID_CLASSIC_SCROLLBAR=1（用 ::-webkit-scrollbar 強迫 WebKit 用會占寬度的捲軸；Playwright 的 WebKit 預設是浮動捲軸）。
// 結果 JSON 寫到 os.tmpdir()/mck-raid-layout/。
// 注意：要用會占寬度的傳統捲軸才重現得出來（isMobile=false）；真的 iPad Safari 是浮動捲軸，見 docs。
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// 無頭 Chromium 預設 --hide-scrollbars（捲軸不占寬度）；這裡要量的就是捲軸占寬度時的版面，所以拿掉
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const SAMPLE_MS = Number(process.env.MCK_RAID_SAMPLE_MS || 1000);
const STEP_MS = 50;
const VIEWPORTS = [
  [1180, 820],
  [1024, 768],
  [1366, 1024],
] as const;
const RAIDS = ['g8-2-2d', 'g8-2-3c', 'g9-1-4c', 'g9-2-1c'].filter((r) => !process.env.MCK_RAID_ONLY || process.env.MCK_RAID_ONLY === r);
const SEAT = 31;
const headers = { Origin: baseURL };

type BankQ = { id: string; topic: string; stem: string; figure?: string; options: string[] };
type Row = { raid: string; viewport: string; id: string; topic: string; kind: string; transitions: Record<string, number>; range: Record<string, [number, number]>; scrollbar: boolean; overflow: boolean; oscillating: boolean; replaced?: boolean; figure?: boolean };

let harness = '';
test.beforeAll(async () => {
  const out = await build({ entryPoints: [resolve('tests/e2e/raid-layout-harness.ts')], bundle: true, write: false, format: 'iife', platform: 'browser', loader: { '.css': 'empty' }, logLevel: 'silent' });
  harness = out.outputFiles[0].text;
});

async function teacherApi(playwright: typeof import('@playwright/test')) {
  const t = await playwright.request.newContext({ baseURL });
  expect((await t.post('/api/login', { headers, data: { role: 'teacher', account: 'teacher', password: '11235813' } })).status()).toBe(200);
  return t;
}
/** 開戰（10 分鐘）→ 學生選角色、不設目標 → 抽一題應用題，停在作答畫面。 */
async function toQuestion(t: APIRequestContext, page: Page, sessionId: string) {
  expect((await t.post(`/api/sessions/${sessionId}/control`, { headers, data: { action: 'raid-start', difficulty: 'normal', seconds: 600 } })).status()).toBe(200);
  await page.reload();
  await expect(page.getByTestId('raid-card')).toBeVisible();
  const role = page.getByTestId('raid-role-knight');
  if (await role.isVisible().catch(() => false)) await role.click();
  const skip = page.getByTestId('raid-goal-skip');
  await expect(skip.or(page.getByTestId('raid-kind-ultimate'))).toBeVisible();
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect(page.getByTestId('raid-kind-ultimate')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('raid-kind-ultimate').click();
  await expect(page.locator('#student-answer .quiz-stem')).toBeVisible();
  await page.addScriptTag({ content: harness });
  if (process.env.MCK_RAID_CLASSIC_SCROLLBAR) await page.addStyleTag({ content: '.panel-scroll::-webkit-scrollbar{width:15px;background:#eef}.panel-scroll::-webkit-scrollbar-thumb{background:#99a;border-radius:8px}' });
}
/** 把作答卡換成這一題，取樣面板與附圖尺寸。 */
async function sample(page: Page, sessionId: string, q: BankQ, kind: string) {
  return page.evaluate(
    async ({ sessionId, q, kind, ms, step }) => {
      // 作答卡改名，app 每 0.25 秒的更新就不會把它換回原本抽到的題目（魔王血條等小地方也就不再更新）
      let card = document.querySelector<HTMLElement>('#raid-probe');
      if (!card) {
        card = document.querySelector<HTMLElement>('#student-answer');
        if (!card?.querySelector('[data-testid="raid-option-0"]')) return null;
        card.id = 'raid-probe';
      }
      const ps = card.closest<HTMLElement>('.panel-scroll');
      if (!ps) return null;
      const view = await (await fetch(`/api/sessions/${sessionId}`, { credentials: 'same-origin' })).json();
      if (!view.raid || view.raid.run.endedAt) return null;
      card.innerHTML = (window as any).__raidLayout.card(view.raid, { kind, id: q.id, topic: q.topic, stem: q.stem, figure: q.figure, options: q.options });
      card.firstElementChild!.setAttribute('data-probe', q.id);
      ps.scrollTop = 0;
      const img = card.querySelector<HTMLImageElement>('.quiz-figure');
      await img?.decode().catch(() => undefined);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const rows: number[][] = [];
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        const r = img?.getBoundingClientRect();
        const cs = getComputedStyle(ps);
        const border = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
        rows.push([ps.clientWidth, ps.clientHeight, ps.scrollHeight, Math.round(ps.scrollTop), Math.round((r?.width || 0) * 10) / 10, Math.round((r?.height || 0) * 10) / 10, ps.offsetWidth - ps.clientWidth - border]);
        await new Promise((res) => setTimeout(res, step));
      }
      return { rows, figure: !!img && img.naturalWidth > 0, replaced: !card.isConnected || !card.querySelector(`[data-probe="${q.id}"]`) };
    },
    { sessionId, q, kind, ms: SAMPLE_MS, step: STEP_MS },
  );
}
const COLS = ['clientWidth', 'clientHeight', 'scrollHeight', 'scrollTop', 'figW', 'figH', 'scrollbarW'] as const;
function analyse(rows: number[][]) {
  const transitions: Record<string, number> = {},
    range: Record<string, [number, number]> = {};
  COLS.forEach((c, i) => {
    let n = 0;
    for (let k = 1; k < rows.length; k++) if (rows[k][i] !== rows[k - 1][i]) n++;
    transitions[c] = n;
    const v = rows.map((r) => r[i]);
    range[c] = [Math.min(...v), Math.max(...v)];
  });
  // 來回變（至少兩次變化）才算振盪；一次變化（例如魔王大招預告出現）是正常的版面更新
  const oscillating = (['clientWidth', 'scrollHeight', 'figW', 'figH', 'scrollbarW'] as const).some((c) => transitions[c] >= 2);
  const last = rows[rows.length - 1];
  return { transitions, range, oscillating, scrollbar: rows.some((r) => r[6] > 0), overflow: last[2] > last[1] };
}

for (const raidId of RAIDS) {
  test(`raid layout: every figure question of ${raidId} keeps the panel still on iPad landscape`, async ({ browser, playwright, browserName }) => {
    const bank = JSON.parse(await readFile(`content/raids/${raidId}.json`, 'utf8')) as { pools: Record<string, BankQ[]> };
    const only = process.env.MCK_RAID_FILTER ? new RegExp(process.env.MCK_RAID_FILTER) : null;
    const items = Object.entries(bank.pools).flatMap(([kind, list]) => list.filter((q) => q.figure && (!only || only.test(q.id))).map((q) => ({ kind, q })));
    test.setTimeout(120_000 + items.length * VIEWPORTS.length * (SAMPLE_MS + 400));
    const t = await teacherApi(playwright);
    const cl = (await (await t.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
    await t.patch(`/api/classes/${cl.id}`, { headers, data: { requireCode: false } });
    const sessionId = (await (await t.post('/api/sessions', { headers, data: { lessonId: raidId, classId: cl.id } })).json()).session.id;
    const context = await browser.newContext({ baseURL, viewport: { width: VIEWPORTS[0][0], height: VIEWPORTS[0][1] }, hasTouch: true, isMobile: false, deviceScaleFactor: 1, bypassCSP: true });
    const rows: Row[] = [];
    try {
      const page = await context.newPage();
      await page.goto('/#/student');
      await page.getByLabel('座號').fill(String(SEAT));
      await page.locator('#login-form').getByRole('button', { name: '登入' }).click();
      await expect(page.getByTestId('session-slide')).toBeVisible();
      for (const [w, h] of VIEWPORTS) {
        await page.setViewportSize({ width: w, height: h });
        await toQuestion(t, page, sessionId);
        for (const { kind, q } of items) {
          let got = await sample(page, sessionId, q, kind);
          if (process.env.MCK_RAID_DEBUG) {
            console.log(w, h, q.id, got ? `replaced=${got.replaced} rows=${got.rows.length} first=${JSON.stringify(got.rows[0])}` : 'null');
            if (q === items[0].q) await page.screenshot({ path: join(tmpdir(), 'mck-raid-layout', `debug-${w}x${h}.png`) });
          }
          // 這一場打完了（或作答卡被重畫）：重新開一場再量一次
          if (!got || got.replaced) {
            await toQuestion(t, page, sessionId);
            got = await sample(page, sessionId, q, kind);
          }
          expect(got, `${q.id} sampled`).not.toBeNull();
          rows.push({ raid: raidId, viewport: `${w}x${h}`, id: q.id, topic: q.topic, kind, replaced: got!.replaced, figure: got!.figure, ...analyse(got!.rows) });
        }
      }
    } finally {
      await t.delete(`/api/sessions/${sessionId}`, { headers, data: {} }).catch(() => undefined);
      await t.dispose();
      await context.close();
    }
    const dir = join(tmpdir(), 'mck-raid-layout');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${browserName}-${process.env.MCK_RAID_LABEL || 'run'}-${raidId}.json`), JSON.stringify(rows, null, 1));
    const bad = rows.filter((r) => r.oscillating);
    console.log(`${browserName} ${raidId}: ${rows.length} 題次（${items.length} 題 × ${VIEWPORTS.length} 個視窗），振盪 ${bad.length}`);
    for (const r of bad.slice(0, 20)) console.log(`  振盪 ${r.viewport} ${r.id}（${r.topic}）`, JSON.stringify(r.transitions), JSON.stringify(r.range));
    expect(rows.filter((r) => r.replaced), 'probe card was replaced mid-sample').toEqual([]);
    expect(rows.filter((r) => !r.figure).map((r) => r.id), 'every question shows its figure').toEqual([]);
    expect(bad.map((r) => `${r.viewport} ${r.id}`)).toEqual([]);
  });
}

// 掃描視窗高度：上面逐題量的是三種 iPad 的固定高度，題目剛好落在「有捲軸放得下、沒捲軸放不下」那幾個像素的機會不高。
// 這裡固定寬度 1180，把高度從 760 到 1000 每 2px 掃一遍，一定會掃過那個區間（鏡子測高，2026-10-30 老師回報的題目）。
test('raid layout: the mirror-height question stays still at every panel height (1180 wide, 760–1000 px)', async ({ browser, playwright, browserName }) => {
  test.setTimeout(600_000);
  const bank = JSON.parse(await readFile('content/raids/g9-1-4c.json', 'utf8')) as { pools: Record<string, BankQ[]> };
  const pick = new RegExp(process.env.MCK_RAID_SWEEP || '鏡子測高-1$');
  const [kind, q] = Object.entries(bank.pools).flatMap(([k, list]) => list.map((x) => [k, x] as const)).find(([, x]) => pick.test(x.id))!;
  const t = await teacherApi(playwright);
  const cl = (await (await t.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  await t.patch(`/api/classes/${cl.id}`, { headers, data: { requireCode: false } });
  const sessionId = (await (await t.post('/api/sessions', { headers, data: { lessonId: 'g9-1-4c', classId: cl.id } })).json()).session.id;
  const context = await browser.newContext({ baseURL, viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: false, deviceScaleFactor: 1, bypassCSP: true });
  const rows: Row[] = [];
  try {
    const page = await context.newPage();
    await page.goto('/#/student');
    await page.getByLabel('座號').fill(String(SEAT + 1));
    await page.locator('#login-form').getByRole('button', { name: '登入' }).click();
    await expect(page.getByTestId('session-slide')).toBeVisible();
    await toQuestion(t, page, sessionId);
    for (let h = 760; h <= 1000; h += 2) {
      await page.setViewportSize({ width: 1180, height: h });
      let got = await sample(page, sessionId, q, kind);
      if (!got || got.replaced) {
        await toQuestion(t, page, sessionId);
        got = await sample(page, sessionId, q, kind);
      }
      rows.push({ raid: 'g9-1-4c', viewport: `1180x${h}`, id: q.id, topic: q.topic, kind, replaced: got!.replaced, figure: got!.figure, ...analyse(got!.rows) });
    }
  } finally {
    await t.delete(`/api/sessions/${sessionId}`, { headers, data: {} }).catch(() => undefined);
    await t.dispose();
    await context.close();
  }
  const dir = join(tmpdir(), 'mck-raid-layout');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${browserName}-${process.env.MCK_RAID_LABEL || 'run'}-sweep.json`), JSON.stringify(rows, null, 1));
  const bad = rows.filter((r) => r.oscillating);
  console.log(`${browserName} sweep ${q.id}: ${rows.length} 個高度，振盪 ${bad.length}${bad.length ? `（${bad.map((r) => r.viewport).join('、')}）` : ''}`);
  expect(bad.map((r) => r.viewport)).toEqual([]);
});
