// 魔王戰實測：對本機伺服器開一場真的戰鬥，N 位虛擬學生（程度不同、各自選題型、真的等思考時間）用 API 作答；
// 另外開老師大螢幕與一台學生 iPad 兩個瀏覽器，定時截圖並收集錯誤。最後核對伺服器的戰況與每個人的作答紀錄。
// 用法：node scripts/raid-loadtest.mjs [人數=32] [秒數=300] [難度=normal] [輸出資料夾]
// 只對本機（npm run dev，http://127.0.0.1:8787）跑，不要對正式網站跑。
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const N = Number(process.argv[2] || 32);
const SECONDS = Number(process.argv[3] || 300);
const DIFF = process.argv[4] || 'normal';
const OUT = resolve(process.argv[5] || 'artifacts/raid-loadtest');
await mkdir(OUT, { recursive: true });
if (!/127\.0\.0\.1|localhost/.test(BASE)) throw new Error('只能對本機伺服器跑');

const bank = JSON.parse(await readFile('content/raids/g8-2-2d.json', 'utf8'));
const answerOf = new Map(Object.values(bank.pools).flat().map((x) => [x.id, x.options[x.answer]]));

/** 一個帳號（自己的 cookie）。 */
function client(name) {
  let cookie = '';
  const stats = { calls: 0, ms: [], errors: {} };
  async function call(path, method = 'GET', body) {
    const t0 = performance.now();
    const res = await fetch(BASE + path, {
      method,
      headers: { Origin: BASE, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    stats.calls++;
    stats.ms.push(performance.now() - t0);
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
    if (!res.ok) stats.errors[`${res.status} ${data?.error || ''}`] = (stats.errors[`${res.status} ${data?.error || ''}`] || 0) + 1;
    return { status: res.status, body: data };
  }
  return { name, call, stats, cookie: () => cookie };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
function pick(list) {
  let r = Math.random();
  for (const [x, p] of list) if ((r -= p) <= 0) return x;
  return list[list.length - 1][0];
}
const PROFILE = {
  weak: { choose: [['attack', 0.8], ['shield', 0.2]], acc: { attack: 0.65, shield: 0.5, ultimate: 0.3 }, slow: 1.25 },
  mid: { choose: [['attack', 0.3], ['shield', 0.5], ['ultimate', 0.2]], acc: { attack: 0.85, shield: 0.75, ultimate: 0.55 }, slow: 1 },
  strong: { choose: [['attack', 0.1], ['shield', 0.2], ['ultimate', 0.7]], acc: { attack: 0.95, shield: 0.9, ultimate: 0.8 }, slow: 1 },
};
const THINK = { attack: [12, 25], shield: [18, 32], ultimate: [30, 60] };
/** 應用題「會做」的機率。 */
const KNOW = { weak: 0.6, mid: 0.85, strong: 1 };

// ── 老師：開課、開戰 ──
const teacher = client('teacher');
await teacher.call('/api/login', 'POST', { role: 'teacher', account: 'teacher', password: '11235813' });
const dash = (await teacher.call('/api/dashboard')).body;
const cl = dash.classes.find((c) => c.code === 'DEMO801');
await teacher.call(`/api/classes/${cl.id}`, 'PATCH', { requireCode: false });
const session = (await teacher.call('/api/sessions', 'POST', { lessonId: 'g8-2-2d', classId: cl.id })).body.session;
console.log(`課堂 ${session.id}`);

// ── 學生登入（座號 2..N+1；1 號留給瀏覽器的 iPad） ──
const seats = Array.from({ length: N - 1 }, (_, i) => i + 2);
const students = [];
for (const seat of seats) {
  const c = client(`seat${seat}`);
  await c.call('/api/login', 'POST', { role: 'student', classCode: 'DEMO801', seat });
  await c.call('/api/student/session');
  const level = seat <= 1 + N * 0.3 ? 'weak' : seat <= 1 + N * 0.75 ? 'mid' : 'strong';
  students.push({ seat, c, level, log: [] });
}

// ── 瀏覽器：老師大螢幕＋1 號學生 iPad ──
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' });
const consoleErrors = [];
const tctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const tpage = await tctx.newPage();
tpage.on('console', (m) => m.type() === 'error' && consoleErrors.push(`老師：${m.text()}`));
tpage.on('pageerror', (e) => consoleErrors.push(`老師：${e.message}`));
await tpage.goto(BASE + '/');
await tpage.getByLabel('帳號').fill('teacher');
await tpage.getByLabel('密碼').fill('11235813');
await tpage.locator('#login-form').getByRole('button', { name: '登入' }).click();
await tpage.waitForSelector('[data-testid="lesson-card"]');
await tpage.evaluate((id) => (location.hash = `#/session/${id}`), session.id);
await tpage.waitForSelector('[data-testid="session-slide"]');
await tpage.locator('.slide-dots button').last().click();
const sctx = await browser.newContext({ viewport: { width: 1080, height: 810 }, hasTouch: true });
const spage = await sctx.newPage();
spage.on('console', (m) => m.type() === 'error' && consoleErrors.push(`學生：${m.text()}`));
spage.on('pageerror', (e) => consoleErrors.push(`學生：${e.message}`));
await spage.goto(BASE + '/#/student');
await spage.getByLabel('座號').fill('1');
await spage.locator('#login-form').getByRole('button', { name: '登入' }).click();
await spage.waitForSelector('[data-testid="session-slide"]');

// ── 開戰 ──
await tpage.locator('#raid-difficulty').selectOption(DIFF);
await tpage.locator('#raid-seconds').selectOption(String(SECONDS));
await tpage.getByTestId('raid-start').click();
await tpage.waitForSelector('[data-testid="raid-board"]');
const run = (await teacher.call(`/api/sessions/${session.id}`)).body.raid.run;
console.log(`開戰：${DIFF}、${SECONDS} 秒、開戰時上線 ${run.config.players} 人、魔王 ${run.config.bossHp} 血、英雄 ${run.config.teamHp} 血`);
const roles = ['knight', 'mage', 'archer'];
await Promise.all(students.map((s, i) => s.c.call(`/api/sessions/${session.id}/raid`, 'POST', { runId: run.id, op: 'role', role: roles[i % 3] })));
const tab = spage.locator('.phone-tabs [data-tab="answer"]');
if (await tab.isVisible()) await tab.click();
await spage.getByTestId('raid-role-mage').click();

let over = false;
// 1 號（瀏覽器）：真的點畫面作答，中等程度
async function browserStudent() {
  await spage.waitForSelector('[data-testid="raid-kind-attack"]', { timeout: 15000 });
  while (!over) {
    try {
      const kind = pick(PROFILE.mid.choose);
      await spage.getByTestId(`raid-kind-${kind}`).click({ timeout: 3000 });
      await spage.waitForSelector('[data-testid="raid-option-0"]', { timeout: 5000 });
      await sleep(rnd(...THINK[kind]) * 1000);
      const v = await (await sctx.request.get(`${BASE}/api/sessions/${session.id}`)).json();
      const q = v.raid?.mine?.question;
      if (!q) continue;
      const k = q.options.indexOf(answerOf.get(q.id));
      const ok = Math.random() < PROFILE.mid.acc[kind];
      await spage.getByTestId(`raid-option-${ok ? k : (k + 1) % 4}`).click({ timeout: 3000 });
      await sleep(ok ? 1500 : 5600);
    } catch (e) {
      if (!over) {
        consoleErrors.push(`1 號操作：${e.message.split('\n')[0]}`);
        await spage.screenshot({ path: join(OUT, `ipad-error-${consoleErrors.length}.png`) });
      }
      await sleep(1000);
    }
  }
}
// 虛擬學生：選題型→等思考時間→作答（依程度的答對率）
async function virtualStudent(s) {
  const P = PROFILE[s.level];
  await sleep(RAID_START_WAIT + rnd(500, 4000));
  while (!over) {
    const kind = pick(P.choose);
    const d = await s.c.call(`/api/sessions/${session.id}/raid`, 'POST', { runId: run.id, op: 'draw', kind });
    if (d.status !== 200) {
      if (d.status === 409 && /結束/.test(d.body?.error || '')) break;
      await sleep(1000);
      continue;
    }
    let q = d.body.question;
    // 應用題不會做：想一陣子後按「換一題」（每 30 秒一次）
    if (kind === 'ultimate' && Math.random() > KNOW[s.level]) {
      await sleep(rnd(35, 50) * 1000 * P.slow);
      if (over) break;
      const k = await s.c.call(`/api/sessions/${session.id}/raid`, 'POST', { runId: run.id, op: 'skip' });
      if (k.status === 200) {
        q = k.body.question;
        s.skips = (s.skips || 0) + 1;
      }
    }
    await sleep(rnd(...THINK[kind]) * 1000 * P.slow);
    if (over) break;
    const k = q.options.indexOf(answerOf.get(q.id));
    if (k < 0) s.log.push({ bug: `題目 ${q.id} 找不到正解選項` });
    const ok = Math.random() < P.acc[kind];
    const a = await s.c.call(`/api/sessions/${session.id}/raid`, 'POST', { runId: run.id, op: 'answer', choice: ok ? k : (k + 1) % 4 });
    if (a.status === 200) {
      s.log.push({ kind, ok, correct: a.body.correct, at: Date.now() });
      if (a.body.correct !== ok) s.log.push({ bug: `題目 ${q.id}：預期 ${ok}，伺服器判 ${a.body.correct}` });
    }
    await sleep(ok ? 1500 : kind === 'ultimate' ? 3200 : 5200);
  }
}
const RAID_START_WAIT = Math.max(0, run.startedAt - Date.now());
// 每 15 秒截圖、記錄戰況
const timeline = [];
async function monitor() {
  let i = 0;
  while (!over) {
    await sleep(15000);
    const v = (await teacher.call(`/api/sessions/${session.id}`)).body.raid;
    const s = v.state;
    const bank = s.shieldBank.reduce((p, x) => p + x.ms, 0) / 1000;
    timeline.push({ t: Math.round((Date.now() - run.startedAt) / 1000), boss: s.bossHp, armor: s.bossShield, team: s.teamHp, ult: s.ult, result: s.result });
    console.log(`${String(timeline.at(-1).t).padStart(4)} 秒｜魔王 ${s.bossHp}（護甲 ${s.bossShield}）｜英雄 ${s.teamHp}｜防護罩存量 ${bank} 秒｜大招計量 ${s.ult}%｜正在算大招 ${(v.charging || []).length} 人${s.bossUltAt !== null ? `｜⚠ 魔王蓄大招 ${s.bossUltMove}` : ''}${s.result ? `｜${s.result}` : ''}`);
    await tpage.screenshot({ path: join(OUT, `board-${String(++i).padStart(2, '0')}.png`) });
    if (i % 4 === 1) await spage.screenshot({ path: join(OUT, `ipad-${String(i).padStart(2, '0')}.png`) });
    if (s.result || v.run.endedAt) over = true;
  }
}
const t0 = Date.now();
await Promise.all([monitor(), browserStudent(), ...students.map(virtualStudent)]);
await sleep(2500);
console.log(`實際經過 ${Math.round((Date.now() - t0) / 1000)} 秒`);

// ── 結算與核對 ──
const final = (await teacher.call(`/api/sessions/${session.id}`)).body.raid;
await tpage.waitForTimeout(1500);
await tpage.screenshot({ path: join(OUT, 'result-board.png') });
await spage.screenshot({ path: join(OUT, 'result-ipad.png') });
const st = final.state;
console.log(`\n結果：${st.result}（第 ${Math.round((st.endAt ?? st.t) / 1000)} 秒）｜魔王剩 ${st.bossHp}/${run.config.bossHp}｜英雄剩 ${st.teamHp}/${run.config.teamHp}`);
console.log(`次數：攻擊 ${st.tally.atk || 0}、防護罩 ${st.tally.shield || 0}、大招 ${st.tally.ult || 0}、答錯 ${st.tally.wrong || 0}、魔王攻擊命中 ${st.tally.bossAtk || 0}、擋下 ${st.tally.bossBlock || 0}、魔王大招 ${st.tally.bossUlt || 0}、擋下魔王大招 ${st.tally.bossUltBlock || 0}、破盾 ${st.tally.bossBreak || 0}、吸血 ${st.tally.bossHeal || 0}、封印 ${st.tally.bossSeal || 0}`);
console.log(`換一題：${students.reduce((p, s) => p + (s.skips || 0), 0)} 次（伺服器記 ${Object.values(final.skips || {}).reduce((p, q) => p + q, 0)} 次）`);
const ults = st.log.filter((e) => e.k === 'ult').map((e) => `${e.seats.length} 人×${e.combo}＝${e.n}`);
console.log(`最近的大招：${ults.join('、') || '無'}`);
const bugs = students.flatMap((s) => s.log.filter((x) => x.bug).map((x) => `${s.seat} 號：${x.bug}`));
// 伺服器統計和各人自己的紀錄（結束前的作答）一致嗎
const endAt = run.startedAt + (st.endAt ?? st.t);
for (const s of students) {
  const mine = s.log.filter((x) => !x.bug && x.at <= endAt);
  const server = st.stats[String(s.seat)];
  const n = server ? server.n.attack + server.n.shield + server.n.ultimate : 0;
  if (Math.abs(n - mine.length) > 1) bugs.push(`${s.seat} 號：伺服器記 ${n} 題，學生送出 ${mine.length} 題`);
}
const results = final.results || [];
const levels = Array(10).fill(0);
for (const r of results) levels[r.level]++;
console.log(`稱號：${levels.slice(1).map((x, i) => `Lv${i + 1}×${x}`).join(' ')}（${results.length} 人有稱號）`);
const byLevel = (lv) => results.filter((r) => students.find((s) => s.seat === r.seat)?.level === lv).map((r) => r.level);
for (const lv of ['weak', 'mid', 'strong']) console.log(`  ${lv}：${byLevel(lv).join(' ')}`);
console.log(`特別稱號：${results.filter((r) => r.badges.length).map((r) => `${r.seat} 號 ${r.badges.join('、')}`).join('；') || '無'}`);
const all = [teacher, ...students.map((s) => s.c)];
const ms = all.flatMap((c) => c.stats.ms).sort((a, b) => a - b);
console.log(`\n請求 ${ms.length} 次｜中位數 ${Math.round(ms[Math.floor(ms.length / 2)])} ms｜95% ${Math.round(ms[Math.floor(ms.length * 0.95)])} ms｜最慢 ${Math.round(ms.at(-1))} ms`);
const errs = {};
for (const c of all) for (const [k, v] of Object.entries(c.stats.errors)) errs[k] = (errs[k] || 0) + v;
console.log(`錯誤回應：${JSON.stringify(errs)}`);
console.log(`瀏覽器錯誤：${consoleErrors.length ? '\n  ' + consoleErrors.slice(0, 20).join('\n  ') : '無'}`);
console.log(`核對：${bugs.length ? '\n  ' + bugs.join('\n  ') : '伺服器紀錄與學生送出的作答一致'}`);
await browser.close();
// 清掉這一堂測試課
await teacher.call(`/api/sessions/${session.id}`, 'DELETE', {});
