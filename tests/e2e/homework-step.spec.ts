// 回家作業紅筆「圈出做錯的步驟」：圈要對齊照片（縮放也一樣）、標籤不蓋字、座標壞掉只顯示文字、舊紀錄照常顯示、老師可以改寫或刪除。
// 不呼叫真的 AI：批改結果用固定的假 AI 回應（route 換掉 API 回覆），老師改寫走真的伺服器（示範批改）。截圖存到 artifacts/redpen-step/。
import { test, expect, type Browser, type BrowserContext, type Page, type Route } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const shotDir = join('artifacts', 'redpen-step');
const contexts: BrowserContext[] = [];
let homeworkId = '';

test.afterEach(async () => {
  const req = contexts[0]?.request;
  if (req && homeworkId) await req.delete(`/api/homework/${homeworkId}`, { headers: { Origin: baseURL }, data: {} });
  homeworkId = '';
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

type Box = [number, number, number, number];
/** 假的作答紙：每一行字的外框（0–1）。圈用它，標籤不蓋字的檢查也用它。 */
const SHEET = {
  w: 1240,
  h: 1754,
  printed: [
    { text: '回家作業　二年 1 班　1 號', y: 70, size: 34 },
    { text: '1. 解方程式 2x + 3 = 13', y: 180, size: 32 },
    { text: '2. 化簡 √12 + √27', y: 720, size: 32 },
    { text: '3. 直角三角形兩股 6、8，求斜邊', y: 1240, size: 32 },
  ],
  written: [
    { text: '2x + 3 = 13', x: 130, y: 280 },
    { text: '2x = 13 + 3', x: 130, y: 370 },
    { text: '2x = 16', x: 130, y: 460 },
    { text: 'x = 8', x: 130, y: 550 },
    { text: '√12 = 2√3', x: 130, y: 820 },
    { text: '√27 = 3√3', x: 130, y: 910 },
    { text: '2√3 + 3√3 = 6√6', x: 130, y: 1000 },
    { text: '6² + 8² = 36 + 64', x: 130, y: 1340 },
    { text: '= 100', x: 130, y: 1430 },
    { text: '斜邊 = 10', x: 130, y: 1520 },
  ],
};
/** 在頁面裡用 canvas 畫一張作答紙，回傳 JPEG data URL 與手寫每一行的外框。 */
async function drawSheet(page: Page) {
  return page.evaluate((sheet) => {
    const c = document.createElement('canvas');
    c.width = sheet.w;
    c.height = sheet.h;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f7f6f1';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#222';
    for (const p of sheet.printed) {
      g.font = `600 ${p.size}px "Microsoft JhengHei", sans-serif`;
      g.fillText(p.text, 80, p.y);
    }
    g.fillStyle = '#23304f';
    g.font = 'italic 52px "Segoe Print", "Comic Sans MS", "Microsoft JhengHei", cursive';
    const boxes = sheet.written.map((w) => {
      g.fillText(w.text, w.x, w.y);
      const m = g.measureText(w.text);
      return [(w.x - 6) / sheet.w, (w.y - m.actualBoundingBoxAscent - 6) / sheet.h, (w.x + m.width + 8) / sheet.w, (w.y + m.actualBoundingBoxDescent + 6) / sheet.h];
    });
    return { dataUrl: c.toDataURL('image/jpeg', 0.92), boxes: boxes as [number, number, number, number][] };
  }, SHEET);
}
/** 固定的假 AI 批改結果（normalizeHomework 之後的格式）：1、2 題有圈，3 題答對，老師、學生畫面都用這份。 */
function fakeResult(boxes: Box[], questions: number) {
  const items = Array.from({ length: questions }, (_, i) => ({ correct: true, read: '略', comment: '過程清楚，很棒！' }) as Record<string, unknown>);
  items[0] = { correct: false, read: 'x=8', comment: '移項要變號喔', photo: 0, x: 0.62, y: 0.31, step: { wrong: '2x = 13 + 3', why: '+3 移到等號另一邊要變號', fix: '改成 2x = 13 − 3', photo: 0, box: boxes[1] } };
  items[1] = { correct: false, read: '6√6', comment: '同類方根才能合併', photo: 0, x: 0.62, y: 0.57, step: { wrong: '2√3 + 3√3 = 6√6', why: '同類方根相加，根號內不變', fix: '改成 5√3', photo: 0, box: boxes[6] } };
  items[2] = { correct: true, read: '10', comment: '算得很仔細，讚！', photo: 0, x: 0.62, y: 0.86 };
  return { items, feedback: '算式寫得很清楚！下次移項記得變號。', score: questions - 2, max: questions, mode: 'live', gradedAt: new Date().toISOString() };
}

async function setup(browser: Browser) {
  const teacher = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
  contexts.push(teacher);
  const tp = await teacher.newPage();
  await tp.goto('/');
  await tp.getByLabel('帳號').fill('teacher');
  await tp.getByLabel('密碼').fill('11235813');
  await tp.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(tp.getByTestId('lesson-card').first()).toBeVisible();
  const headers = { Origin: baseURL };
  const cl = (await (await tp.request.get('/api/dashboard')).json()).classes.find((c: { code: string }) => c.code === 'DEMO801');
  const created = await (await tp.request.post('/api/homework', { headers, data: { classId: cl.id, lessonId: 'g9-2-1a', seats: [1] } })).json();
  homeworkId = created.homework.id;
  const sheetUrl = new URL(created.sheets[0].url);
  const token = sheetUrl.hash.split('/')[4];
  const pub = `/api/hw/${homeworkId}/1`;
  const { dataUrl, boxes } = await drawSheet(tp);
  expect((await tp.request.post(`${pub}/photos?t=${token}`, { headers, data: { dataUrl } })).status()).toBe(200);
  expect((await tp.request.post(`${pub}/submit?t=${token}`, { headers, data: {} })).status()).toBe(200);
  await expect.poll(async () => (await (await tp.request.get(`${pub}?t=${token}`)).json()).sheet.status, { timeout: 30_000 }).toBe('graded');
  return { tp, boxes, sheetUrl };
}
/** 把學生頁或老師頁讀到的批改結果換成假 AI 回應。 */
async function serveResult(page: Page, make: (questions: number) => unknown) {
  const swap = async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const res = await route.fetch();
    const body = await res.json();
    for (const s of body.sheet ? [body.sheet] : body.sheets) s.result = make(s.questions.length);
    return route.fulfill({ response: res, json: body });
  };
  await page.route(new RegExp(`/api/hw/${homeworkId}/1\\?t=`), swap);
  await page.route(new RegExp(`/api/homework/${homeworkId}$`), swap);
}
async function studentPage(browser: Browser, url: URL, size: { width: number; height: number }, make: (q: number) => unknown) {
  const ctx = await browser.newContext({ baseURL, viewport: size, hasTouch: true, ...(size.width < 500 ? { isMobile: true } : {}) });
  contexts.push(ctx);
  const page = await ctx.newPage();
  await serveResult(page, make);
  await page.goto(url.pathname + url.hash);
  await expect(page.getByTestId('hw-student')).toBeVisible();
  await expect(page.locator('.hw-photo svg.redpen')).toHaveCount(1);
  return page;
}
const rectIn = (r: { x: number; y: number; width: number; height: number }, f: { x: number; y: number; width: number; height: number }) => ({ x0: (r.x - f.x) / f.width, y0: (r.y - f.y) / f.height, x1: (r.x + r.width - f.x) / f.width, y1: (r.y + r.height - f.y) / f.height });
/** 圈的路徑外框要包住指定的那一行（換算成照片的比例），而且沒有大到碰到別行的中線。 */
async function expectRingOn(page: Page, index: number, box: Box) {
  const frame = (await page.locator('.hw-photo img').first().boundingBox())!;
  const ring = (await page.locator('svg.hw-step-rings path[stroke="#e03131"]').nth(index).boundingBox())!;
  const r = rectIn(ring, frame);
  expect(r.x0).toBeLessThanOrEqual(box[0] + 0.005);
  expect(r.x1).toBeGreaterThanOrEqual(box[2] - 0.005);
  expect(r.y0).toBeLessThanOrEqual(box[1] + 0.002);
  expect(r.y1).toBeGreaterThanOrEqual(box[3] - 0.002);
  expect(r.x0).toBeGreaterThan(box[0] - 0.08);
  expect(r.x1).toBeLessThan(box[2] + 0.08);
  expect(r.y0).toBeGreaterThan(box[1] - 0.04);
  expect(r.y1).toBeLessThan(box[3] + 0.04);
}
/** 標籤（含照片下方以外的所有字）不可以蓋到學生的字或印好的題目，也不可以超出照片。 */
async function expectLabelsClear(page: Page, boxes: Box[]) {
  const frame = (await page.locator('.hw-photo img').first().boundingBox())!;
  const labels = page.locator('.hw-step-label');
  const printed: Box[] = SHEET.printed.map((p) => [70 / SHEET.w, (p.y - p.size) / SHEET.h, 1000 / SHEET.w, (p.y + 8) / SHEET.h]);
  for (let i = 0; i < (await labels.count()); i++) {
    const l = rectIn((await labels.nth(i).boundingBox())!, frame);
    expect(l.x0).toBeGreaterThanOrEqual(-0.001);
    expect(l.y0).toBeGreaterThanOrEqual(-0.001);
    expect(l.x1).toBeLessThanOrEqual(1.001);
    expect(l.y1).toBeLessThanOrEqual(1.001);
    for (const b of [...boxes, ...printed]) {
      const overlap = l.x0 < b[2] && b[0] < l.x1 && l.y0 < b[3] && b[1] < l.y1;
      expect(overlap, `label ${i} ${JSON.stringify(l)} covers text at ${JSON.stringify(b)}`).toBe(false);
    }
  }
}
/** 測試用作答紙：一行一行的字（box:true 的行回傳真實字框），clear 把指定範圍塗回紙色（在字裡挖出通道）。 */
interface Row { text: string; x: number; y: number; font: string; color?: string; box?: boolean }
async function paintPhoto(page: Page, spec: { rows: Row[]; clear?: [number, number, number, number][]; paper?: string }) {
  const { dataUrl, boxes } = await page.evaluate((sp) => {
    const c = document.createElement('canvas');
    c.width = 1240;
    c.height = 1754;
    const g = c.getContext('2d')!;
    g.fillStyle = sp.paper || '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    const boxes: number[][] = [];
    for (const r of sp.rows) {
      g.font = r.font;
      g.fillStyle = r.color || '#222222';
      g.fillText(r.text, r.x, r.y);
      const m = g.measureText(r.text);
      if (r.box) boxes.push([(r.x - m.actualBoundingBoxLeft) / c.width, (r.y - m.actualBoundingBoxAscent) / c.height, (r.x + m.actualBoundingBoxRight) / c.width, (r.y + m.actualBoundingBoxDescent) / c.height]);
    }
    g.fillStyle = sp.paper || '#ffffff';
    for (const [x, y, w, h] of sp.clear || []) g.fillRect(x, y, w, h);
    return { dataUrl: c.toDataURL('image/jpeg', 0.92), boxes };
  }, spec);
  return { body: Buffer.from(dataUrl.split(',')[1], 'base64'), boxes: boxes as Box[] };
}
/** 學生頁（獨立 context）：照片換成 body，第 1、2 題的圈換成 stepBoxes。 */
async function paintedStudent(browser: Browser, url: URL, width: number, body: Buffer, stepBoxes: Box[], tweak?: (r: { items: { step?: Record<string, unknown> }[] }) => void) {
  const ctx = await browser.newContext({ baseURL, viewport: { width, height: 844 }, hasTouch: true, ...(width < 500 ? { isMobile: true } : {}) });
  contexts.push(ctx);
  const page = await ctx.newPage();
  await page.route(new RegExp(`/api/hw/${homeworkId}/1/photos/`), (route) => route.fulfill({ contentType: 'image/jpeg', body }));
  await serveResult(page, (q) => {
    const r = fakeResult(stepBoxes.concat(stepBoxes, stepBoxes, stepBoxes), q) as { items: { correct?: boolean; step?: Record<string, unknown> }[] };
    r.items[0].step!.box = stepBoxes[0];
    if (stepBoxes[1]) r.items[1].step!.box = stepBoxes[1];
    else r.items[1] = { correct: true };
    tweak?.(r);
    return r;
  });
  await page.goto(url.pathname + url.hash);
  await expect(page.locator('.hw-photo svg.redpen')).toHaveCount(1);
  await expect(page.locator('.hw-step-layer')).toHaveCount(1);
  return page;
}
/**
 * 逐像素核對：所有疊在照片上的東西實際畫到的範圍（圈線含線寬與白底、連線、小題號、標籤）底下，有沒有任何筆跡（包含被圈的那一行）；連線也不能穿過別的批註。
 * 用原圖判斷筆跡，和程式裡的筆跡偵測無關。
 */
async function inkUnderOverlays(page: Page) {
  return page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>('.hw-photo img')!;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    const lum = (x: number, y: number) => {
      const i = (y * c.width + x) * 4;
      return 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];
    };
    const samples: number[] = [];
    for (let y = 0; y < c.height; y += 37) for (let x = 0; x < c.width; x += 37) samples.push(lum(x, y));
    samples.sort((a, b) => a - b);
    const paper = samples[Math.floor(samples.length * 0.9)];
    const frame = img.getBoundingClientRect(),
      sx = c.width / frame.width,
      sy = c.height / frame.height;
    const inkIn = (left: number, top: number, right: number, bottom: number) => {
      let n = 0;
      for (let y = Math.max(0, Math.floor((top - frame.top) * sy)); y < Math.min(c.height, Math.ceil((bottom - frame.top) * sy)); y++)
        for (let x = Math.max(0, Math.floor((left - frame.left) * sx)); x < Math.min(c.width, Math.ceil((right - frame.left) * sx)); x++) if (lum(x, y) < paper * 0.85) n++;
      return n;
    };
    const out = { ring: 0, ringSamples: 0, leader: 0, leaderOverNote: 0, badge: 0, label: 0 };
    document.querySelectorAll<SVGPathElement>('svg.hw-step-rings path').forEach((path) => {
      const m = path.getScreenCTM()!,
        r = Number(path.getAttribute('stroke-width')) / 2,
        len = path.getTotalLength();
      for (let s = 0; s <= len; s += 0.5) {
        const p = path.getPointAtLength(s).matrixTransform(m);
        out.ring += inkIn(p.x - r, p.y - r, p.x + r, p.y + r);
        out.ringSamples++;
      }
    });
    const notes = [...document.querySelectorAll('.hw-step-label, .hw-step-badge, svg.redpen > *')].map((el) => el.getBoundingClientRect());
    document.querySelectorAll<SVGLineElement>('.hw-step-leaders line').forEach((line) => {
      const m = line.getScreenCTM()!;
      const at = (name: string) => Number(line.getAttribute(name));
      const a = new DOMPoint(at('x1'), at('y1')).matrixTransform(m),
        b = new DOMPoint(at('x2'), at('y2')).matrixTransform(m),
        len = Math.hypot(b.x - a.x, b.y - a.y);
      for (let s = 0; s <= len; s += 0.5) {
        const x = a.x + ((b.x - a.x) * s) / len,
          y = a.y + ((b.y - a.y) * s) / len;
        out.leader += inkIn(x - 0.75, y - 0.75, x + 0.75, y + 0.75);
        if (s > 2 && notes.some((n) => x > n.left && x < n.right && y > n.top && y < n.bottom)) out.leaderOverNote++;
      }
    });
    document.querySelectorAll('.hw-step-badge').forEach((el) => {
      const r = el.getBoundingClientRect();
      out.badge += inkIn(r.left, r.top, r.right, r.bottom);
    });
    document.querySelectorAll('.hw-step-label').forEach((el) => {
      const r = el.getBoundingClientRect();
      out.label += inkIn(r.left, r.top, r.right, r.bottom);
    });
    return out;
  });
}
async function expectNothingOnInk(page: Page) {
  const hits = await inkUnderOverlays(page);
  expect({ ...hits, ringSamples: 0 }, JSON.stringify(hits)).toEqual({ ring: 0, ringSamples: 0, leader: 0, leaderOverNote: 0, badge: 0, label: 0 });
  return hits;
}
const RED_PATH = 'svg.hw-step-rings path[stroke="#e03131"]';
/** 滿版的一行行字；target 那一行只寫短算式（回傳字框），同一行右邊隔一段再接別的字。 */
function fullRows(opts: { pitch: number; font: string; color?: string; from?: number; to: number; x?: number; targetY: number; targetX?: number }) {
  // 不留空格：相同的行上下對齊時，空格會連成一條真的通道（那樣連線可以安全通過）
  const line = '2x+3=13,x=8,12=2,6+8=100,'.repeat(4);
  const rows: Row[] = [];
  for (let y = opts.from ?? 60; y < opts.to; y += opts.pitch) {
    if (y === opts.targetY) {
      rows.push({ text: '2x = 13 + 3', x: opts.targetX ?? 124, y, font: opts.font, color: opts.color, box: true });
      rows.push({ text: line, x: 620, y, font: opts.font, color: opts.color });
    } else rows.push({ text: line, x: opts.x ?? 10, y, font: opts.font, color: opts.color });
  }
  return rows;
}

test('student sees the wrong step circled on phone and iPad, aligned after resizing, labels clear of the writing', async ({ browser }) => {
  test.setTimeout(120_000);
  await mkdir(shotDir, { recursive: true });
  const { boxes, sheetUrl } = await setup(browser);
  const make = (q: number) => fakeResult(boxes, q);

  const phone = await studentPage(browser, sheetUrl, { width: 390, height: 844 }, make);
  await expect(phone.locator('svg.hw-step-rings')).toHaveCount(1);
  await expect(phone.locator('svg.hw-step-rings path[stroke="#e03131"]')).toHaveCount(2);
  await expectRingOn(phone, 0, boxes[1]);
  await expectRingOn(phone, 1, boxes[6]);
  await expect(phone.locator('.hw-step-label, .hw-step-badge')).toHaveCount(2);
  await expectLabelsClear(phone, boxes);
  await expectNothingOnInk(phone);
  // 手機上的字夠大
  expect(await phone.locator('.hw-step-label, .hw-step-badge').first().evaluate((el) => parseFloat(getComputedStyle(el.parentElement!).fontSize))).toBeGreaterThanOrEqual(13);
  // 每一題下面都有文字；答對的題沒有；原本的 ✓／✗ 與評語還在
  await expect(phone.locator('.hw-r').nth(0).locator('.hw-step')).toContainText('做錯的步驟：2x = 13 + 3');
  await expect(phone.locator('.hw-r').nth(0).locator('.hw-step')).toContainText('怎麼改：改成 2x = 13 − 3');
  await expect(phone.locator('.hw-r').nth(0).locator('.hw-comment')).toContainText('移項要變號喔');
  await expect(phone.locator('.hw-r').nth(2).locator('.hw-step')).toHaveCount(0);
  await expect(phone.locator('.hw-r.no')).toHaveCount(2);
  // 學生頁沒有老師的按鈕
  await expect(phone.locator('.hw-step-edit')).toHaveCount(0);
  await phone.locator('.hw-photo').first().scrollIntoViewIfNeeded();
  await phone.screenshot({ path: join(shotDir, 'student-phone-390x844.png') });
  await phone.screenshot({ path: join(shotDir, 'student-phone-390x844-full.png'), fullPage: true });
  await phone.locator('.hw-photo').first().screenshot({ path: join(shotDir, 'student-phone-photo.png') });

  // 橫放（縮放）：圈還是對齊，標籤重新擺
  await phone.setViewportSize({ width: 700, height: 420 });
  await expect.poll(async () => (await phone.locator('.hw-photo img').first().boundingBox())!.width).toBeGreaterThan(500);
  await expectRingOn(phone, 0, boxes[1]);
  await expectRingOn(phone, 1, boxes[6]);
  await expect.poll(async () => {
    await expectLabelsClear(phone, boxes);
    return true;
  }).toBe(true);

  const ipad = await studentPage(browser, sheetUrl, { width: 820, height: 1180 }, make);
  await expect(ipad.locator('svg.hw-step-rings path[stroke="#e03131"]')).toHaveCount(2);
  await expectRingOn(ipad, 0, boxes[1]);
  await expectRingOn(ipad, 1, boxes[6]);
  await expectLabelsClear(ipad, boxes);
  await expectNothingOnInk(ipad);
  await expect(ipad.locator('.hw-step-label').first()).toContainText('這裡做錯：');
  await ipad.locator('.hw-photo').first().scrollIntoViewIfNeeded();
  await ipad.screenshot({ path: join(shotDir, 'student-ipad-820x1180.png') });
});

test('bad coordinates, old records and hostile text: no stray circles, text only, nothing executes', async ({ browser }) => {
  test.setTimeout(90_000);
  const { boxes, sheetUrl } = await setup(browser);
  const hostile = '<img src=x onerror="window.__xss=1"><b>粗</b>';
  const page = await studentPage(browser, sheetUrl, { width: 390, height: 844 }, (q) => {
    const r = fakeResult(boxes, q);
    const wrong = (step: unknown) => ({ correct: false, read: 'x', comment: '再想想', photo: 0, x: 0.6, y: 0.5, step });
    const text = { wrong: hostile, why: hostile, fix: hostile };
    // 存檔裡的座標壞掉時前端也要擋：超出範圍、面積太大、NaN（JSON 變 null）、不是這張照片
    r.items[0] = wrong({ ...text, photo: 0, box: [0.1, 0.2, 1.4, 0.3] });
    r.items[1] = wrong({ ...text, photo: 0, box: [0, 0, 1, 1] });
    r.items[2] = wrong({ ...text, photo: 0, box: [null, 0.2, 0.3, 0.4] });
    r.items[3] = wrong({ ...text, photo: 3, box: boxes[0] });
    r.items[4] = wrong({ ...text });
    // 舊紀錄：沒有 step
    r.items[5] = { correct: false, read: 'x', comment: '舊紀錄的評語', photo: 0, x: 0.6, y: 0.7 };
    // 改判成對：有 step 也不圈
    r.items[6] = { correct: true, read: 'x', comment: '老師改判', teacher: true, photo: 0, x: 0.6, y: 0.8, step: { wrong: 'w', why: 'y', fix: 'f', photo: 0, box: boxes[2] } };
    return r;
  });
  await expect(page.locator('.hw-r')).toHaveCount(10);
  await expect(page.locator('svg.hw-step-rings')).toHaveCount(0);
  await expect(page.locator('.hw-step-label, .hw-step-badge')).toHaveCount(0);
  await expect(page.locator('.hw-step')).toHaveCount(5);
  await expect(page.locator('.hw-r').nth(0).locator('.hw-step')).toContainText('做錯的步驟：<img src=x');
  await expect(page.locator('.hw-step img, .hw-step b:not(:first-child)')).toHaveCount(0);
  await expect(page.locator('.hw-r').nth(5).locator('.hw-comment')).toContainText('舊紀錄的評語');
  await expect(page.locator('.hw-r').nth(5).locator('.hw-step')).toHaveCount(0);
  await expect(page.locator('.hw-r').nth(6).locator('.hw-step')).toHaveCount(0);
  await expect(page.locator('.hw-photo svg.redpen')).toHaveCount(1);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
});

test('no blank space on the photo: the words go under the photo, nothing covers the writing', async ({ browser }) => {
  test.setTimeout(90_000);
  const { tp, sheetUrl } = await setup(browser);
  // 每一區都有筆跡，左右也只剩一點點邊：連小題號都放不下
  const rows: Row[] = [];
  // 不留空格：相同的行上下對齊時，空格會連成一條真的通道
  const line = '2x+3=13,x=8,12=2,6+8=100,2x+3=13,x=8,12=2,6+8=100,2x+3=13,x=8';
  for (let y = 44; y < 1740; y += 62) rows.push({ text: line, x: 30, y, font: '35px sans-serif', box: y === 416 || y === 974 });
  const { body, boxes } = await paintPhoto(tp, { rows });
  expect(boxes).toHaveLength(2);
  expect(boxes[0][2], 'line must leave only a small margin').toBeGreaterThan(0.95);
  expect(boxes[0][2], 'line must stay on the photo').toBeLessThan(1);
  const page = await paintedStudent(browser, sheetUrl, 390, body, boxes);
  await expect(page.locator(RED_PATH)).toHaveCount(2);
  await expect(page.locator('.hw-step-legend li')).toHaveCount(2);
  await expect(page.locator('.hw-step-label')).toHaveCount(0);
  await expect(page.locator('.hw-step-badge')).toHaveCount(0); // 寫滿字：連小題號都不放，不蓋字
  await expect(page.locator('.hw-step-leaders line')).toHaveCount(0);
  await expect(page.locator('.hw-step-legend li').first()).toContainText('這裡做錯：+3 移到等號另一邊要變號');
  await expectNothingOnInk(page);
});

// Codex 審核 B1：標籤放得下但連線會穿過筆跡時，不畫跨頁連線
test('far blank space that cannot be reached safely: no cross-page line, small number beside the ring, words under the photo', async ({ browser }) => {
  test.setTimeout(90_000);
  await mkdir(shotDir, { recursive: true });
  const { tp, sheetUrl } = await setup(browser);
  // 上面 70% 寫滿，底下空白；目標行左邊有 124 px 的邊，放得下小題號
  const { body, boxes } = await paintPhoto(tp, { rows: fullRows({ pitch: 70, font: '40px sans-serif', to: 1754 * 0.7, targetY: 480 }) });
  for (const width of [390, 820]) {
    const page = await paintedStudent(browser, sheetUrl, width, body, boxes);
    await expect(page.locator(RED_PATH)).toHaveCount(1);
    await expect(page.locator('.hw-step-leaders line'), `width ${width}`).toHaveCount(0);
    await expect(page.locator('.hw-step-label'), `width ${width}`).toHaveCount(0);
    await expect(page.locator('.hw-step-badge')).toHaveText('1');
    await expect(page.locator('.hw-step-legend li')).toHaveCount(1);
    await expect(page.locator('.hw-step-legend li')).toContainText('1. 這裡做錯：');
    // 小題號貼在圈旁，不是跑到遠處
    const ring = (await page.locator(RED_PATH).boundingBox())!,
      badge = (await page.locator('.hw-step-badge').boundingBox())!;
    expect(Math.max(ring.x - (badge.x + badge.width), badge.x - (ring.x + ring.width), ring.y - (badge.y + badge.height), badge.y - (ring.y + ring.height))).toBeLessThan(12);
    await expectNothingOnInk(page);
    if (width === 390) await page.locator('.hw-photo').first().screenshot({ path: join(shotDir, 'degraded-number-and-legend-phone.png') });
  }
});

test('far blank space with a clear corridor: the label stays on the photo and its line avoids the writing', async ({ browser }) => {
  test.setTimeout(90_000);
  await mkdir(shotDir, { recursive: true });
  const { tp, sheetUrl } = await setup(browser);
  // 目標行底下的字在 x=300–500 挖出一條通道通到下方空白；通道太窄放不下標籤
  const y0 = 480;
  const { body, boxes } = await paintPhoto(tp, { rows: fullRows({ pitch: 70, font: '40px sans-serif', to: 1000, targetY: y0 }), clear: [[300, y0 + 16, 200, 1000 - y0]] });
  const page = await paintedStudent(browser, sheetUrl, 390, body, boxes);
  await expect(page.locator(RED_PATH)).toHaveCount(1);
  await expect(page.locator('.hw-step-label')).toHaveCount(1);
  await expect(page.locator('.hw-step-leaders line')).toHaveCount(1);
  await expect(page.locator('.hw-step-legend li')).toHaveCount(0);
  const frame = (await page.locator('.hw-photo img').boundingBox())!;
  const label = rectIn((await page.locator('.hw-step-label').boundingBox())!, frame);
  expect(label.y0, 'label is in the far blank space').toBeGreaterThan(boxes[0][3] + 0.1);
  await expectNothingOnInk(page);
  await page.locator('.hw-photo').first().screenshot({ path: join(shotDir, 'far-label-safe-line-phone.png') });
});

// Codex 審核 B1：連線不能穿過別題的圈、標籤與其他紅筆（這裡第 1 題的路被第 2 題的圈擋住）
test('leader lines do not cross another ring or label', async ({ browser }) => {
  test.setTimeout(90_000);
  const { tp, sheetUrl } = await setup(browser);
  const y0 = 480;
  const rows = fullRows({ pitch: 70, font: '40px sans-serif', to: 480, targetY: -1 });
  rows.push({ text: '2x = 13 + 3', x: 124, y: y0, font: '40px sans-serif', box: true }, { text: '2x+3=13 x=8', x: 620, y: y0, font: '40px sans-serif' });
  rows.push({ text: '2x = 16 + 1', x: 124, y: y0 + 90, font: '40px sans-serif', box: true });
  const { body, boxes } = await paintPhoto(tp, { rows });
  const page = await paintedStudent(browser, sheetUrl, 390, body, boxes);
  await expect(page.locator(RED_PATH)).toHaveCount(2);
  await expect(page.locator('.hw-step-label, .hw-step-badge')).toHaveCount(2);
  await expectNothingOnInk(page);
});

// Codex 審核 B2：密集行距
test('dense neighbouring lines: the ring tightens to stay off the next line, at every width', async ({ browser }) => {
  test.setTimeout(120_000);
  await mkdir(shotDir, { recursive: true });
  const { tp, sheetUrl } = await setup(browser);
  const font = '32px sans-serif';
  const { body, boxes } = await paintPhoto(tp, {
    rows: [
      { text: '2x + 3 = 13 + 3', x: 124, y: 710, font, box: true },
      { text: '2x + 3 = 13 + 3', x: 124, y: 746, font },
      { text: '2x + 3 = 13 + 3', x: 124, y: 674, font },
    ],
  });
  for (const width of [390, 700, 820]) {
    const page = await paintedStudent(browser, sheetUrl, width, body, boxes);
    await expect(page.locator(RED_PATH), `width ${width}`).toHaveCount(1);
    await expectRingOn(page, 0, boxes[0]);
    const hits = await expectNothingOnInk(page);
    expect(hits.ringSamples).toBeGreaterThan(100);
    await expect(page.locator('.hw-r').nth(0).locator('.hw-step')).toContainText('做錯的步驟：');
    if (width === 390) await page.locator('.hw-photo').first().screenshot({ path: join(shotDir, 'dense-lines-tight-ring-phone.png') });
  }
  // 手機轉向：寬度變了，線寬不變，要重新決定圈
  const page = await paintedStudent(browser, sheetUrl, 390, body, boxes);
  await page.setViewportSize({ width: 700, height: 420 });
  await expect.poll(async () => (await page.locator('.hw-photo img').first().boundingBox())!.width).toBeGreaterThan(500);
  await expect.poll(async () => (await inkUnderOverlays(page)).ring).toBe(0);
  await expectRingOn(page, 0, boxes[0]);
});

test('lines too close to circle safely: the ring is cancelled, the text stays, and it never redraws over the next line', async ({ browser }) => {
  test.setTimeout(90_000);
  const { tp, sheetUrl } = await setup(browser);
  const font = '32px sans-serif';
  // 行距比字高還小：完全沒有空隙
  const { body, boxes } = await paintPhoto(tp, {
    rows: [
      { text: '2x + 3 = 13 + 3', x: 124, y: 710, font, box: true },
      { text: '2x + 3 = 13 + 3', x: 124, y: 732, font },
    ],
  });
  const page = await paintedStudent(browser, sheetUrl, 390, body, boxes);
  await expect(page.locator(RED_PATH)).toHaveCount(0);
  await expect(page.locator('svg.hw-step-rings')).toHaveCount(0);
  await expect(page.locator('.hw-step-label, .hw-step-badge')).toHaveCount(0);
  await expect(page.locator('.hw-step-legend li')).toHaveCount(0);
  await expect(page.locator('.hw-r').nth(0).locator('.hw-step')).toContainText('做錯的步驟：2x = 13 + 3');
  await expect(page.locator('.hw-r').nth(0).locator('.hw-step')).toContainText('怎麼改：');
});

test('pixels cannot be read: no ring and no label over the photo, the text stays', async ({ browser }) => {
  test.setTimeout(90_000);
  const { boxes, sheetUrl } = await setup(browser);
  const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  contexts.push(ctx);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    CanvasRenderingContext2D.prototype.getImageData = () => {
      throw new DOMException('tainted', 'SecurityError');
    };
  });
  await serveResult(page, (q) => fakeResult(boxes, q));
  await page.goto(sheetUrl.pathname + sheetUrl.hash);
  await expect(page.locator('.hw-photo svg.redpen')).toHaveCount(1);
  await expect(page.locator('.hw-step-layer')).toHaveCount(1);
  await expect(page.locator(RED_PATH)).toHaveCount(0);
  await expect(page.locator('.hw-step-label, .hw-step-badge')).toHaveCount(0);
  await expect(page.locator('.hw-r').nth(0).locator('.hw-step')).toContainText('做錯的步驟：2x = 13 + 3');
});

// Codex 第 2 次複審 B4：被圈的那一行也不能被圈線壓到
test('the ring never touches the circled line itself: no safe gap means no ring, the text stays', async ({ browser }) => {
  test.setTimeout(120_000);
  const { tp, sheetUrl } = await setup(browser);
  const font = '32px Arial';
  // Codex 的重現：兩行相同算式，基線 710／743，顯示寬 390（縮放後空隙只剩約 3 px）
  const { body, boxes } = await paintPhoto(tp, {
    rows: [
      { text: '2x + 3 = 13 + 3', x: 124, y: 710, font, box: true },
      { text: '2x + 3 = 13 + 3', x: 124, y: 743, font },
    ],
  });
  const page = await paintedStudent(browser, sheetUrl, 390, body, boxes);
  await expectNothingOnInk(page);
  await expect(page.locator(RED_PATH)).toHaveCount(0);
  await expect(page.locator('.hw-step-label, .hw-step-badge')).toHaveCount(0);
  await expect(page.locator('.hw-r').nth(0).locator('.hw-step')).toContainText('做錯的步驟：2x = 13 + 3');
  // 同一張照片放大後空隙夠了：圈得起來，而且不碰任何一行
  const wide = await paintedStudent(browser, sheetUrl, 820, body, boxes);
  await expect(wide.locator(RED_PATH)).toHaveCount(1);
  await expectRingOn(wide, 0, boxes[0]);
  expect((await expectNothingOnInk(wide)).ringSamples).toBeGreaterThan(100);
  // 外框切進目標行（AI 框得太緊）：四周都空時圈繞到字外面，一樣不壓字
  const [x0, y0, x1, y1] = boxes[0];
  const alone = (await paintPhoto(tp, { rows: [{ text: '2x + 3 = 13 + 3', x: 124, y: 710, font }] })).body;
  const cropped = await paintedStudent(browser, sheetUrl, 390, alone, [[x0 + 0.002, y0 + 0.002, x1 - 0.002, y1 - 0.002]]);
  await expect(cropped.locator(RED_PATH)).toHaveCount(1);
  await expectNothingOnInk(cropped);
});

test('whatever the width and line spacing, a drawn ring leaves every line untouched', async ({ browser }) => {
  test.setTimeout(240_000);
  const { tp, sheetUrl } = await setup(browser);
  const font = '32px Arial';
  const drawn: string[] = [];
  for (const pitch of [33, 36, 42]) {
    const { body, boxes } = await paintPhoto(tp, {
      rows: [
        { text: '2x + 3 = 13 + 3', x: 124, y: 710, font, box: true },
        { text: '2x + 3 = 13 + 3', x: 124, y: 710 + pitch, font },
        { text: '2x + 3 = 13 + 3', x: 124, y: 710 - pitch, font },
      ],
    });
    for (const width of [360, 390, 430, 700, 820]) {
      const page = await paintedStudent(browser, sheetUrl, width, body, boxes);
      const hits = await inkUnderOverlays(page);
      expect(hits.ring, `pitch ${pitch}, width ${width}`).toBe(0);
      if (hits.ringSamples) drawn.push(`${pitch}@${width}`);
      await expect(page.locator('.hw-r').nth(0).locator('.hw-step')).toContainText('做錯的步驟：');
      await page.context().close();
      contexts.splice(contexts.indexOf(page.context()), 1);
    }
  }
  // 空隙夠的組合真的有圈，不是全部取消才通過
  for (const combo of ['36@700', '36@820', '42@390', '42@820']) expect(drawn).toContain(combo);
});

// Codex 審核 B3：輸入框和後端一樣用碼點計算
test('teacher fields count code points like the server: typing, paste, IME, then a real save', async ({ browser }) => {
  test.setTimeout(120_000);
  const { tp } = await setup(browser);
  await tp.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL });
  await tp.route(new RegExp(`/api/homework/${homeworkId}/1/photos/`), async (route) => route.fulfill({ contentType: 'image/jpeg', body: (await paintPhoto(tp, { rows: [] })).body }));
  await tp.goto(`/#/homework/${homeworkId}`);
  await tp.getByTestId('hw-seat-1').click();
  const row = tp.locator('.hw-r.no').first();
  await row.locator('.hw-step-edit summary').click();
  const field = row.locator('[data-step-field="why"]');
  await expect(field).not.toHaveAttribute('maxlength');
  const units = () => field.evaluate((el: HTMLInputElement) => ({ points: [...el.value].length, utf16: el.value.length, caret: el.selectionStart }));
  const X = '𝑥';

  // 鍵盤：可以打滿 60 個，第 61 個打不進去
  await field.fill('');
  await field.focus();
  await tp.keyboard.type(X.repeat(61));
  expect(await units()).toEqual({ points: 60, utf16: 120, caret: 120 });
  // Codex 的重現：31 個 𝑥（62 個 UTF-16）後面還可以再打字
  await field.fill(X.repeat(31));
  await field.press('End');
  await tp.keyboard.type('z');
  await expect(field).toHaveValue(`${X.repeat(31)}z`);

  // 貼上：超過時截掉貼上的尾巴，游標後面的字留著；不切斷代理字元
  await field.fill('abc');
  await field.evaluate((el: HTMLInputElement) => el.setSelectionRange(1, 1));
  await tp.evaluate((text) => navigator.clipboard.writeText(text), X.repeat(70));
  await tp.keyboard.press('Control+V');
  await expect(field).toHaveValue(`a${X.repeat(57)}bc`);
  expect(await units()).toEqual({ points: 60, utf16: 117, caret: 115 });

  // 輸入法：組字中不截（否則會打斷組字），組完才截到 60
  const cdp = await tp.context().newCDPSession(tp);
  await field.fill(X.repeat(59));
  await field.press('End');
  await cdp.send('Input.imeSetComposition', { text: 'ㄎㄜˋ', selectionStart: 3, selectionEnd: 3 });
  expect((await units()).points, 'composition is not interrupted').toBe(62);
  await cdp.send('Input.insertText', { text: '課本' });
  await expect.poll(async () => (await units()).points).toBe(60);
  await expect(field).toHaveValue(`${X.repeat(59)}課`);

  // 打滿 60 個真的存得進去（走真的伺服器）
  await field.fill('');
  await field.focus();
  await tp.keyboard.type(X.repeat(60));
  await row.getByRole('button', { name: '儲存' }).click();
  const saved = tp.locator('.hw-r.no').first();
  await expect(saved.locator('.hw-step')).toContainText(`為什麼錯：${X.repeat(60)}`);
  await saved.locator('.hw-step-edit summary').click();
  await expect(saved.locator('[data-step-field="why"]')).toHaveValue(X.repeat(60));
});

test('teacher sees the circle and can rewrite or delete it; students see the change; re-grading brings a new one', async ({ browser }) => {
  test.setTimeout(120_000);
  await mkdir(shotDir, { recursive: true });
  const { tp, boxes, sheetUrl } = await setup(browser);

  // 老師作業頁的截圖用假 AI 回應
  const shot = await tp.context().newPage();
  await serveResult(shot, (q) => fakeResult(boxes, q));
  await shot.goto(`/#/homework/${homeworkId}`);
  await shot.getByTestId('hw-seat-1').click();
  await expect(shot.getByTestId('hw-seat-modal')).toBeVisible();
  await expect(shot.locator('svg.hw-step-rings path[stroke="#e03131"]')).toHaveCount(2);
  await expectRingOn(shot, 0, boxes[1]);
  await expectLabelsClear(shot, boxes);
  await expectNothingOnInk(shot);
  await expect(shot.locator('.hw-step-edit')).toHaveCount(2);
  await shot.locator('.hw-step-label').first().scrollIntoViewIfNeeded();
  await shot.screenshot({ path: join(shotDir, 'teacher-homework.png') });
  await shot.locator('.hw-step-edit').first().locator('summary').click();
  await shot.locator('.hw-step-edit').first().scrollIntoViewIfNeeded();
  await shot.screenshot({ path: join(shotDir, 'teacher-homework-edit.png') });
  await shot.close();

  // 真的伺服器（示範批改）：改寫、刪除。示範的外框不對應實際的字（會壓到字而取消），照片換成白紙才圈得出來
  const blank = (await paintPhoto(tp, { rows: [] })).body;
  await tp.route(new RegExp(`/api/homework/${homeworkId}/1/photos/`), (route) => route.fulfill({ contentType: 'image/jpeg', body: blank }));
  await tp.goto(`/#/homework/${homeworkId}`);
  await tp.getByTestId('hw-seat-1').click();
  const row = tp.locator('.hw-r.no').first();
  await expect(row.locator('.hw-step')).toContainText('（示範）');
  const rings = await tp.locator('svg.hw-step-rings path[stroke="#e03131"]').count();
  expect(rings).toBeGreaterThan(0);
  await row.locator('.hw-step-edit summary').click();
  await row.locator('[data-step-field="why"]').fill('老師說："移項"要變號');
  await row.locator('[data-step-field="fix"]').fill('改成 2x=10');
  await row.getByRole('button', { name: '儲存' }).click();
  const after = tp.locator('.hw-r.no').first();
  await expect(after.locator('.hw-step')).toContainText('老師說："移項"要變號');
  await expect(after.locator('.hw-step')).toContainText('（老師改寫）');
  await expect(tp.locator('.hw-step-label').first()).toContainText('老師說："移項"要變號');
  await expect(tp.locator('svg.hw-step-rings path[stroke="#e03131"]')).toHaveCount(rings);
  // 欄位值有引號也不會壞
  await after.locator('.hw-step-edit summary').click();
  await expect(after.locator('[data-step-field="why"]')).toHaveValue('老師說："移項"要變號');

  // 學生立刻看到
  const student = await tp.context().browser()!.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  contexts.push(student);
  const sp = await student.newPage();
  await sp.goto(sheetUrl.pathname + sheetUrl.hash);
  await expect(sp.locator('.hw-r.no').first().locator('.hw-step')).toContainText('老師說："移項"要變號');
  await expect(sp.locator('.hw-step-edit')).toHaveCount(0);

  // 刪除：圈少一個，✗ 與評語還在
  await after.getByRole('button', { name: '刪除這個圈' }).click();
  const gone = tp.locator('.hw-r.no').first();
  await expect(gone.locator('.hw-step')).toHaveCount(0);
  await expect(gone.locator('.hw-comment')).not.toBeEmpty();
  await expect(gone.locator('.hw-step-edit summary')).toHaveText('加上做錯的步驟');
  await expect(tp.locator('svg.hw-step-rings path[stroke="#e03131"]')).toHaveCount(rings - 1);

  // 改判成對：這一題的圈也不見；重新批改：全部回來
  const second = tp.locator('.hw-r.no').nth(0);
  await second.getByRole('button', { name: '✓' }).click();
  await expect(tp.locator('svg.hw-step-rings path[stroke="#e03131"]')).toHaveCount(rings - 1);
  await tp.locator('.hw-r.no').nth(1).getByRole('button', { name: '✓' }).click();
  await expect(tp.locator('svg.hw-step-rings path[stroke="#e03131"]')).toHaveCount(rings - 2);
  await tp.keyboard.press('Escape');
  const gradedAt = async () => {
    const sheet = (await (await tp.request.get(`/api/homework/${homeworkId}`)).json()).sheets[0];
    return sheet.status === 'graded' ? sheet.result.gradedAt : '';
  };
  const before = await gradedAt();
  await Promise.all([tp.waitForResponse((r) => r.url().endsWith('/regrade')), tp.locator('[data-action="hw-regrade"]').click()]);
  await expect.poll(async () => { const at = await gradedAt(); return !!at && at !== before; }, { timeout: 30_000 }).toBe(true);
  await tp.goto('/#/homework');
  await expect(tp.getByTestId('hw-list')).toBeVisible();
  await tp.goto(`/#/homework/${homeworkId}`);
  await expect(tp.getByTestId('hw-detail')).toContainText('已批改');
  await tp.getByTestId('hw-seat-1').click();
  await expect(tp.locator('svg.hw-step-rings path[stroke="#e03131"]')).toHaveCount(rings);
});

// Codex 審核：淡鉛筆不能被當成空白；長字串不能裁切、不能撐寬手機頁面
test('faint pencil counts as writing: no label, line or ring on it', async ({ browser }) => {
  test.setTimeout(90_000);
  const { tp, sheetUrl } = await setup(browser);
  // 上半部 70% 寫滿 #bbb 的細字，下面才是空白。Codex 的重現：兩條線都會從底部穿回頂部
  const FAINT_BOTTOM = 0.7;
  const font = '28px sans-serif';
  const rows = fullRows({ pitch: 44, font, color: '#bbbbbb', from: 30, to: 1754 * FAINT_BOTTOM, targetY: 118 });
  const { body, boxes } = await paintPhoto(tp, { rows });
  const page = await paintedStudent(browser, sheetUrl, 390, body, boxes);
  await expect(page.locator(RED_PATH)).toHaveCount(1);
  await expect(page.locator('.hw-step-leaders line')).toHaveCount(0);
  await expect(page.locator('.hw-step-label')).toHaveCount(0);
  await expect(page.locator('.hw-step-legend li')).toHaveCount(1);
  await expectNothingOnInk(page);
  // 外框沒有對齊行距（切過別行）：取消圈，不蓋淡鉛筆
  const crooked = await paintedStudent(browser, sheetUrl, 390, body, [[0.1, 0.03, 0.5, 0.06], [0.1, 0.1, 0.5, 0.13]]);
  await expect(crooked.locator(RED_PATH)).toHaveCount(0);
  await expect(crooked.locator('.hw-step-leaders line')).toHaveCount(0);
  await expect(crooked.locator('.hw-r').nth(0).locator('.hw-step')).toContainText('做錯的步驟：');
});

test('long unbroken text wraps instead of overflowing, on the photo and under it', async ({ browser }) => {
  test.setTimeout(90_000);
  const { tp, sheetUrl } = await setup(browser);
  const long = 'W'.repeat(60);
  const longStep = (r: { items: { step?: Record<string, unknown> }[] }) => void Object.assign(r.items[0].step!, { wrong: long, why: long, fix: long });
  const { body, boxes } = await paintPhoto(tp, { rows: [{ text: '2x = 13 + 3', x: 124, y: 200, font: '40px sans-serif', box: true }] });
  const page = await paintedStudent(browser, sheetUrl, 390, body, boxes, longStep);
  await expect(page.locator(RED_PATH)).toHaveCount(1);
  const labels = page.locator('.hw-step-label');
  await expect(labels).toHaveCount(1);
  expect(await labels.first().evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1), 'label text is not cut off').toBe(true);
  await expect(page.locator('.hw-r').nth(0).locator('.hw-step')).toContainText(long);
  const widths = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth, app: document.querySelector('#app')!.scrollWidth }));
  expect(widths.doc).toBeLessThanOrEqual(widths.win);
  expect(widths.app).toBeLessThanOrEqual(widths.win);
});
