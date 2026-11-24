// 遊戲區：依單元列出魔王戰與十字交乘；魔王戰選班級就開戰（伺服器一次完成開課、翻頁、開戰）。
// 課程裡的「十字交乘對戰頁」：右側直接打開對戰設定、重點預設為那一頁的，老師改選後重畫也不會被蓋回。
import { test, expect, type Browser, type BrowserContext } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.MCK_PORT || 8787}`;
const contexts: BrowserContext[] = [];
const cleanup: string[] = [];
const lessons: string[] = [];
const headers = { Origin: baseURL };
// 每個測試用一個自己的臨時班級（不動示範班正在上的課），測完連課堂一起刪掉
const classes: string[] = [];

test.afterEach(async () => {
  const req = contexts[0]?.request;
  for (const id of cleanup.splice(0)) await req?.delete(`/api/sessions/${id}`, { headers, data: {} });
  for (const id of lessons.splice(0)) await req?.delete(`/api/lessons/${id}`, { headers, data: {} });
  for (const id of classes.splice(0)) await req?.delete(`/api/classes/${id}`, { headers, data: { withRecords: true } });
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

async function teacherPage(browser: Browser) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  contexts.push(context);
  const tp = await context.newPage();
  await tp.goto('/');
  await tp.getByLabel('帳號').fill('teacher');
  await tp.getByLabel('密碼').fill('11235813');
  await tp.locator('#login-form').getByRole('button', { name: '登入' }).click();
  await expect(tp.getByTestId('lesson-card').first()).toBeVisible();
  const cl = (await (await tp.request.post('/api/classes', { headers, data: { name: `遊戲區測試${Date.now()}`, seats: 10 } })).json()).classroom;
  classes.push(cl.id);
  await tp.request.patch(`/api/classes/${cl.id}`, { headers, data: { requireCode: false } });
  code = cl.code;
  return { tp, classId: cl.id as string };
}
let code = '';
async function studentPage(browser: Browser, seat: number) {
  const sc = await browser.newContext({ baseURL, viewport: { width: 820, height: 1180 }, hasTouch: true });
  contexts.push(sc);
  const sp = await sc.newPage();
  await sp.goto('/#/student');
  await sp.getByLabel('班級代碼').fill(code);
  await sp.getByLabel('座號').fill(String(seat));
  await sp.locator('#login-form').getByRole('button', { name: '登入' }).click();
  return sp;
}

test('games area: picking a unit and class starts the raid at once; asks before replacing another lesson, which is closed properly; 409 when the class changed meanwhile', async ({ browser }) => {
  const { tp, classId } = await teacherPage(browser);
  await tp.goto('/#/games');
  await expect(tp.getByRole('heading', { name: '遊戲區' })).toBeVisible();
  // 有魔王戰題庫的單元各一張卡片（伺服器決定），八上 3-2 有十字交乘的三種玩法
  for (const key of ['g8-2-2', 'g8-2-3', 'g8-3-1', 'g9-1-4', 'g9-2-1', 'g9-2-2']) await expect(tp.getByTestId(`game-raid-${key}`).getByTestId('game-raid-start')).toBeVisible();
  const cross = tp.getByTestId('game-unit-g8-3-2');
  await expect(cross.getByTestId('game-cross')).toBeVisible();
  await expect(cross.getByTestId('game-cross-live')).toBeVisible();
  await expect(tp.getByRole('button', { name: '九年級 1-4 1-4 相似三角形的應用：魔王戰：開始魔王戰' })).toBeVisible();
  if (process.env.MCK_SHOT_DIR) await tp.screenshot({ path: `${process.env.MCK_SHOT_DIR}/games-area.png`, fullPage: true });
  // iPad 直向寬度：遊戲區沒有橫向溢出，選單與按鈕夠大
  await tp.setViewportSize({ width: 820, height: 1180 });
  const fit = await tp.evaluate(() => {
    const c = document.querySelector<HTMLElement>('.workspace-content')!;
    const controls = [...document.querySelectorAll<HTMLElement>('.raid-game-card select, .raid-game-card button')];
    return { overflow: c.scrollWidth - c.clientWidth, minH: Math.min(...controls.map((x) => x.getBoundingClientRect().height)) };
  });
  expect(fit.overflow).toBeLessThanOrEqual(1);
  expect(fit.minH).toBeGreaterThanOrEqual(44);
  await tp.setViewportSize({ width: 1440, height: 900 });

  // 先開一堂別的課，裡面正在十字交乘對戰
  const other = (await (await tp.request.post('/api/sessions', { headers, data: { lessonId: 'g8-2-2a', classId } })).json()).session.id;
  cleanup.push(other);
  expect((await tp.request.post(`/api/sessions/${other}/control`, { headers, data: { action: 'cross-start', focus: 'a1', seconds: 0 } })).status()).toBe(200);

  // 帶舊的 token（老師看到的狀態已經變了）：伺服器回 409，不結束那一堂
  const stale = await tp.request.post('/api/games/raid', { headers, data: { lessonId: 'g9-1-4c', classId, token: 'new|0' } });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).plan.mode).toBe('replace');
  expect((await (await tp.request.get(`/api/sessions/${other}`)).json()).session.ended).toBe(false);
  // 沒有魔王戰題庫的課不能從遊戲區開戰
  expect((await tp.request.post('/api/games/raid', { headers, data: { lessonId: 'g8-2-2a', classId, dryRun: true } })).status()).toBe(409);

  const unit = tp.getByTestId('game-raid-g9-1-4');
  await unit.locator('[data-raid-class]').selectOption(classId);
  await unit.locator('[data-raid-difficulty]').selectOption('easy');
  await unit.getByTestId('game-raid-start').click();
  await expect(tp.locator('.modal')).toContainText('會結束那一堂課');
  await expect(tp.locator('.modal')).toContainText('十字交乘對戰');
  // 確認框開著就離開遊戲區：確認框關掉，什麼都沒送出
  await tp.goto('/#/records');
  await expect(tp.locator('.modal')).toHaveCount(0);
  expect((await (await tp.request.get(`/api/sessions/${other}`)).json()).session.ended).toBe(false);
  await tp.goto('/#/games');
  await unit.getByTestId('game-raid-start').click();
  await expect(tp.locator('.modal')).toContainText('會結束那一堂課');
  // 按 Esc 取消：原來那一堂照常進行
  await tp.keyboard.press('Escape');
  await expect(tp.locator('.modal')).toHaveCount(0);
  expect((await (await tp.request.get(`/api/sessions/${other}`)).json()).session.ended).toBe(false);
  await unit.getByTestId('game-raid-start').click();
  await tp.getByTestId('game-raid-confirm').click();
  await expect(tp).toHaveURL(/#\/session\//);
  const id = tp.url().split('/session/')[1];
  cleanup.push(id);
  const v = await (await tp.request.get(`/api/sessions/${id}`)).json();
  expect(v.session.lessonId).toBe('g9-1-4c');
  expect(v.lesson.slides[v.session.slideIndex].raidPage).toBe(true);
  // 已經開戰（不用再按一次）
  expect(v.session.raid?.id).toBeTruthy();
  expect(v.session.raid.difficulty).toBe('easy');
  await expect(tp.getByTestId('raid-board')).toBeVisible();
  // 被取代的那一堂：課堂結束，對戰也記上結束時間
  const old = await (await tp.request.get(`/api/sessions/${other}`)).json();
  expect(old.session.ended).toBe(true);
  expect(old.session.cross?.endedAt).toBeTruthy();

  // 學生照平常登入，直接進戰鬥
  const sp = await studentPage(browser, 5);
  await expect(sp.getByTestId('raid-card')).toBeVisible();

  // 同一班已經在打這一場：再按一次直接進那一堂、同一場
  await tp.goto('/#/games');
  // 班級預設是上次選的
  await expect(tp.getByTestId('game-raid-g9-1-4').locator('[data-raid-class]')).toHaveValue(classId);
  await tp.getByTestId('game-raid-g9-1-4').getByTestId('game-raid-start').click();
  await expect(tp).toHaveURL(new RegExp(`/session/${id}`));
  expect((await (await tp.request.get(`/api/sessions/${id}`)).json()).session.raid.id).toBe(v.session.raid.id);

  // 競態：老師在確認視窗看到 A 堂；按確認前，另一個分頁開了同一課的 B 堂、正在做課後檢核
  await tp.request.post(`/api/sessions/${id}/control`, { headers, data: { action: 'end' } });
  const a = (await (await tp.request.post('/api/sessions', { headers, data: { lessonId: 'g8-2-2a', classId } })).json()).session.id;
  cleanup.push(a);
  await tp.goto('/#/games');
  const u2 = tp.getByTestId('game-raid-g8-2-2');
  await u2.locator('[data-raid-class]').selectOption(classId);
  await u2.getByTestId('game-raid-start').click();
  await expect(tp.locator('.modal')).toContainText('會結束那一堂課');
  const b = (await (await tp.request.post('/api/sessions', { headers, data: { lessonId: 'g8-2-2d', classId } })).json()).session.id;
  cleanup.push(b);
  expect((await tp.request.post(`/api/sessions/${b}/control`, { headers, data: { action: 'quiz-class', seconds: 600 } })).status()).toBe(200);
  await tp.getByTestId('game-raid-confirm').click();
  // 伺服器 409 → 前端照最新的 B 堂再問一次，B 的測驗還在進行
  await expect(tp.locator('.modal')).toContainText('正在進行：課後檢核');
  const mid = await (await tp.request.get(`/api/sessions/${b}`)).json();
  expect(mid.session.quiz && !mid.session.quiz.endedAt).toBeTruthy();
  expect(mid.session.raid ?? null).toBeNull();
  await tp.getByTestId('game-raid-confirm').click();
  await expect(tp).toHaveURL(new RegExp(`/session/${b}`));
  const after = await (await tp.request.get(`/api/sessions/${b}`)).json();
  expect(after.session.raid?.id).toBeTruthy();
});

test('cross battle page: panel opens with the page focus, the teacher pick survives a redraw, students wait and then get items of the picked focus', async ({ browser }) => {
  const { tp, classId } = await teacherPage(browser);
  const lessonId = `cross-page-${Date.now()}`;
  const base = (await (await tp.request.get('/api/dashboard')).json()).lessons.find((l: { id: string }) => l.id === 'g8-3-1d');
  const plain = base.slides.filter((s: { quizPage?: boolean; raidPage?: boolean; unitQuizPage?: boolean; duelPage?: boolean }) => !s.quizPage && !s.raidPage && !s.unitQuizPage && !s.duelPage).slice(0, 2);
  const page = { id: 'x-cross', phase: '遊戲對戰', title: '十字交乘全班對戰', body: '老師按右邊「開始對戰」。', crossPage: { focus: 'gcf' } };
  const lesson = { ...base, id: lessonId, title: '十字交乘對戰頁測試', slides: [...plain, page] };
  delete lesson.quiz;
  delete lesson.unitQuiz;
  for (const bad of ['hard', ['gcf'], null]) expect((await tp.request.put(`/api/lessons/${lessonId}`, { headers, data: { lesson: { ...lesson, slides: [...plain, { ...page, crossPage: { focus: bad } }] } } })).status()).toBe(400);
  expect((await tp.request.put(`/api/lessons/${lessonId}`, { headers, data: { lesson } })).status()).toBe(200);
  lessons.push(lessonId);
  const id = (await (await tp.request.post('/api/sessions', { headers, data: { lessonId, classId } })).json()).session.id;
  cleanup.push(id);
  await tp.request.post(`/api/sessions/${id}/control`, { headers, data: { action: 'slide', index: 2 } });
  await tp.goto(`/#/session/${id}`);
  await expect(tp.getByTestId('cross-page')).toContainText('先提公因式');
  const panel = tp.getByTestId('xl-panel');
  await expect(panel.locator('input[value="gcf"]')).toBeChecked();
  await expect(tp.locator('.panel-col .quiet-moment')).toHaveCount(0);
  if (process.env.MCK_SHOT_DIR) await tp.screenshot({ path: `${process.env.MCK_SHOT_DIR}/cross-page.png` });

  const sp = await studentPage(browser, 6);
  await expect(sp.getByTestId('cross-wait')).toContainText('等老師開始十字交乘對戰');

  // 老師改選「x² 係數為 1」，課堂整頁重畫（開搶答）後還是 a1
  await panel.getByTestId('xl-focus-a1').click();
  await tp.getByTestId('buzz-open').click();
  await expect(tp.getByTestId('xl-panel').locator('input[value="a1"]')).toBeChecked();
  await tp.getByTestId('xl-panel').getByTestId('xl-start').click();
  await expect(tp.getByTestId('xl-board')).toBeVisible();
  await expect(tp.getByTestId('xl-panel-status')).toContainText('x² 係數為 1');
  await expect(sp.getByTestId('xl-card')).toBeVisible();
  await expect(sp.getByTestId('xl-item-focus')).toHaveAttribute('data-level', '1');
});

test('games area: when two picks race, only the last one can ask or start; the dialog names the class and unit', async ({ browser }) => {
  const { tp, classId: a } = await teacherPage(browser);
  const clB = (await (await tp.request.post('/api/classes', { headers, data: { name: `遊戲區測試B${Date.now()}`, seats: 10 } })).json()).classroom;
  classes.push(clB.id);
  const b = clB.id as string;
  // 兩班都在上別的課（開魔王戰要先確認）
  const sa = (await (await tp.request.post('/api/sessions', { headers, data: { lessonId: 'g8-2-2a', classId: a } })).json()).session.id;
  const sb = (await (await tp.request.post('/api/sessions', { headers, data: { lessonId: 'g8-2-2a', classId: b } })).json()).session.id;
  cleanup.push(sa, sb);
  // A 班的計畫攔住，等 B 班的確認框出現後才放行（明確控制先後）
  let releaseA!: () => void;
  const heldA = new Promise<void>((r) => (releaseA = r));
  await tp.route('**/api/games/raid', async (route) => {
    const body = route.request().postDataJSON();
    if (body?.dryRun && body.classId === a) await heldA;
    await route.continue();
  });
  await tp.goto('/#/games');
  // 先在 9-1-4 的卡選 A 班按開始，A 班的回應還沒到，又在 9-2-2 的卡選 B 班按開始
  const cardA = tp.getByTestId('game-raid-g9-1-4'),
    cardB = tp.getByTestId('game-raid-g9-2-2');
  await cardA.locator('[data-raid-class]').selectOption(a);
  await cardB.locator('[data-raid-class]').selectOption(b);
  const late = tp.waitForResponse((r) => r.url().includes('/api/games/raid') && r.request().postDataJSON()?.classId === a);
  await cardA.getByTestId('game-raid-start').click();
  await cardB.getByTestId('game-raid-start').click();
  const dialog = tp.locator('#modal-root');
  await expect(dialog).toContainText(clB.name);
  releaseA();
  await late;
  await tp.waitForTimeout(300);
  // 晚到的 A 班計畫不會蓋掉 B 班的確認框
  await expect(dialog).toContainText(clB.name);
  await expect(dialog).toContainText('九年級 2-2');
  await dialog.getByTestId('game-raid-confirm').click();
  await expect(tp).toHaveURL(/#\/session\//);
  const state = async (id: string) => (await (await tp.request.get(`/api/sessions/${id}`)).json()).session.ended;
  expect(await state(sb)).toBe(true);
  expect(await state(sa)).toBe(false);
  cleanup.push(new URL(tp.url()).hash.split('/')[2]);
});

test('games area: a late reply to an earlier confirmed start (200 or 409 enter) does not take the teacher away from the card picked later', async ({ browser }) => {
  const { tp, classId: a } = await teacherPage(browser);
  const clB = (await (await tp.request.post('/api/classes', { headers, data: { name: `遊戲區測試B${Date.now()}`, seats: 10 } })).json()).classroom;
  classes.push(clB.id);
  const b = clB.id as string;
  const sa = (await (await tp.request.post('/api/sessions', { headers, data: { lessonId: 'g8-2-2a', classId: a } })).json()).session.id;
  const sb = (await (await tp.request.post('/api/sessions', { headers, data: { lessonId: 'g8-2-2a', classId: b } })).json()).session.id;
  cleanup.push(sa, sb);
  for (const mode of ['ok', 'enter'] as const) {
    // 每一輪 A 班都重新回到別的課（第一輪結束後 A 班在打魔王戰）
    if (mode === 'enter') cleanup.push((await (await tp.request.post('/api/sessions', { headers, data: { lessonId: 'g8-2-2a', classId: a } })).json()).session.id);
    // A 班按確認後的正式開戰請求攔住
    let releaseA!: () => void;
    const heldA = new Promise<void>((r) => (releaseA = r));
    let repliedA = false;
    await tp.unrouteAll();
    await tp.route('**/api/games/raid', async (route) => {
      const body = route.request().postDataJSON();
      if (!body?.dryRun && body?.classId === a) {
        await heldA;
        // enter：伺服器那邊 A 班已經在打這場魔王戰（例如另一台電腦先開了）
        if (mode === 'enter') await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: '這個班級的狀態變了', plan: { mode: 'enter', sessionId: 'elsewhere', busy: [], token: 'x' } }) });
        else await route.continue();
        repliedA = true;
        return;
      }
      await route.continue();
    });
    await tp.goto('/#/dashboard');
    await tp.goto('/#/games');
    const cardA = tp.getByTestId('game-raid-g9-1-4'),
      cardB = tp.getByTestId('game-raid-g9-2-2');
    // 卡片畫好、首頁資料載完再選班級（重畫會把選單改回上次的班級）
    await expect(cardB.getByTestId('game-raid-start')).toBeVisible();
    await tp.waitForTimeout(500);
    await cardA.locator('[data-raid-class]').selectOption(a);
    await cardA.getByTestId('game-raid-start').click();
    const dialog = tp.locator('#modal-root');
    await expect(dialog).toContainText('九年級 1-4');
    await dialog.getByTestId('game-raid-confirm').click();
    // A 還沒回來，老師改按 B 卡
    await cardB.locator('[data-raid-class]').selectOption(b);
    await cardB.getByTestId('game-raid-start').click();
    await expect(dialog).toContainText(clB.name);
    releaseA();
    await expect.poll(() => repliedA).toBe(true);
    // 200 那一輪：A 班的魔王戰確實建立了（命令已經生效），畫面仍留在 B
    if (mode === 'ok')
      await expect
        .poll(async () => ((await (await tp.request.get('/api/dashboard')).json()).sessions || []).some((s: { classId: string; lessonId: string; ended: boolean }) => s.classId === a && s.lessonId === 'g9-1-4c' && !s.ended))
        .toBe(true);
    await tp.waitForTimeout(300);
    await expect(tp).toHaveURL(/#\/games$/);
    await expect(dialog).toContainText(clB.name);
    await expect(dialog).toContainText('九年級 2-2');
    await tp.keyboard.press('Escape');
  }
  const ended = async (id: string) => (await (await tp.request.get(`/api/sessions/${id}`)).json()).session.ended;
  expect(await ended(sb)).toBe(false);
  for (const s of (await (await tp.request.get('/api/dashboard')).json()).sessions || []) if ([a, b].includes(s.classId) && !cleanup.includes(s.id)) cleanup.push(s.id);
});
