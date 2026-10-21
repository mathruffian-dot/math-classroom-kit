// 驗證 content/lessons/*.json 並產生 content/catalog.generated.json（專案教材目錄）。
// 用法：npm run lessons            驗證全部並產生目錄
//       npm run lessons -- --strict  警告也視為錯誤
// agent 在專案裡新增或修改教材後，先跑這支腳本，再啟動或部署。
import { build } from 'esbuild';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');
const dir = await mkdtemp(join(tmpdir(), 'mck-lessons-'));
let validateLesson, validateRaidBank;
try {
  await build({
    entryPoints: [join(root, 'worker/validation.ts')],
    outfile: join(dir, 'validation.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });
  ({ validateLesson, validateRaidBank } = await import(pathToFileURL(join(dir, 'validation.mjs')).href));
} finally {
  await rm(dir, { recursive: true, force: true });
}

/** 認知科學與課堂可用性檢查：不擋存檔，但提醒 agent 修正。 */
function lint(lesson) {
  const warnings = [];
  const phases = lesson.slides.map((s) => s.phase || '');
  if (!phases.some((p) => /提取|暖身|先備/.test(p))) warnings.push('沒有「提取練習」頁：建議第一頁先喚起舊知識。');
  if (!phases.some((p) => /預測/.test(p))) warnings.push('沒有「預測」頁：建議在講解前先讓學生猜一猜。');
  if (!phases.some((p) => /出場券|後設|自評/.test(p))) warnings.push('沒有「出場券／後設認知」頁。');
  if (!lesson.slides.some((s) => s.interactive)) warnings.push('整份課程沒有可操作視覺化（interactive）。');
  if (!lesson.slides.some((s) => s.activity?.type === 'canvas')) warnings.push('沒有手寫／拍照（canvas）題，無法看到學生的推理過程。');
  for (const [i, s] of lesson.slides.entries()) {
    const where = `第 ${i + 1} 頁「${s.title}」`;
    if (!s.activity && !s.quizPage && !s.raidPage) warnings.push(`${where}沒有 IRS 題目。`);
    if ((s.body || '').length > 90) warnings.push(`${where}內文 ${s.body.length} 字，超過 90 字（分段原則：一頁一重點）。`);
    if (!s.phase) warnings.push(`${where}沒有標 phase（認知設計階段）。`);
    if (s.interactive?.steps?.length && !s.interactive.shapes.some((x) => x.step !== undefined || x.focus))
      warnings.push(`${where}有 steps 但沒有任何圖形設定 step／focus，步驟聚焦不會發光。`);
    if (s.activity?.rubric && !s.activity.rubric.reference) warnings.push(`${where}評量規準缺參考解答 reference。`);
    // 選擇題、自評量表的左邊卡片由選項產生；另外寫 bullets 會讓老師以為兩邊不一樣（2026-10-21 課堂回饋）
    if (['single', 'multiple', 'scale'].includes(s.activity?.type) && s.bullets?.length && !['steps', 'bars'].includes(s.visual))
      warnings.push(`${where}是選擇／自評題，bullets 不會顯示（左邊卡片＝選項），請刪掉 bullets。`);
    // 預測頁的標題不要先寫出正確答案
    if (/預測/.test(s.phase || '') && s.activity?.correct?.length === 1) {
      const right = s.activity.options?.[s.activity.correct[0]];
      if (right && right.length <= 12 && /\d|√/.test(right) && (s.title || '').includes(right))
        warnings.push(`${where}是預測題，標題已經寫出正確選項「${right}」。`);
    }
    if (['numeric', 'single', 'multiple', 'manipulate'].includes(s.activity?.type) && !s.activity.explanation)
      warnings.push(`${where}題目沒有 explanation（公布結果時的解析）。`);
  }
  if (!lesson.slides.some((s) => s.source)) warnings.push('沒有任何頁面標示 source（課本頁碼），來源無法追溯。');
  return warnings;
}

// 魔王戰題庫：content/raids/<一節最後一堂的課程 id>.json（scripts/quiz-src/*-raid.py 產生）。
// 題庫另外存成 content/raids.generated.json（只在伺服器，不進課程、不送到學生端），課程最後加一頁「魔王戰」。
const raids = {};
let raidErrors = 0;
for (const file of (await readdir(join(root, 'content/raids')).catch(() => [])).filter((f) => f.endsWith('.json')).sort()) {
  try {
    const bank = validateRaidBank(JSON.parse(await readFile(join(root, 'content/raids', file), 'utf8')));
    if (`${bank.hostLesson}.json` !== file) throw new Error(`檔名要和 hostLesson（${bank.hostLesson}）一樣`);
    raids[bank.hostLesson] = bank;
  } catch (e) {
    console.error(`✗ 魔王戰 ${file}：${e.message}`);
    raidErrors++;
  }
}

const lessonDir = join(root, 'content/lessons');
const files = (await readdir(lessonDir)).filter((f) => f.endsWith('.json')).sort();
const lessons = [];
const ids = new Map();
let errors = 0,
  warned = 0;
for (const file of files) {
  const path = join(lessonDir, file);
  let raw;
  try {
    raw = JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    console.error(`✗ ${file}：JSON 格式錯誤 — ${e.message}`);
    errors++;
    continue;
  }
  // 會考式評分放在 content/written/<課程 id>.json（由 scripts/photo-work.mjs 產生 photo 欄位）：
  // { rubrics: { 錯誤分析題 ID: 會考規準 }, photo: { 數值題 ID: { items, rubric } }, slides?: [{ after, slide }] }
  let writtenNote = '';
  try {
    const w = JSON.parse(await readFile(join(root, 'content/written', `${raw.id}.json`), 'utf8'));
    for (const { after, slide } of w.slides || []) {
      const at = raw.slides.findIndex((s) => s.id === after);
      if (at < 0) throw new Error(`手寫題要插在「${after}」之後，但課程裡沒有這一頁`);
      if (raw.slides.some((s) => s.id === slide.id)) throw new Error(`手寫題頁 ID「${slide.id}」重複`);
      raw.slides.splice(at + 1, 0, slide);
    }
    for (const [id, rubric] of Object.entries(w.rubrics || {})) {
      const a = raw.slides.find((s) => s.activity?.id === id)?.activity;
      if (!a) throw new Error(`要換規準的題目「${id}」不在課程裡`);
      a.rubric = rubric;
    }
    // photo：{ 題目 ID: { items, rubric } }：數值題也可以拍照交計算過程（AI 讀答案並依會考標準給分）
    for (const [id, pw] of Object.entries(w.photo || {})) {
      const a = raw.slides.find((s) => s.activity?.id === id)?.activity;
      if (!a) throw new Error(`拍照批改的題目「${id}」不在課程裡`);
      if (a.type !== 'numeric') throw new Error(`拍照批改只用在數值題：「${id}」是 ${a.type}`);
      a.photoWork = pw.items ? { items: pw.items } : {};
      a.rubric = pw.rubric;
      a.aiAllowed = true;
    }
    const n = raw.slides.filter((s) => s.activity?.type === 'canvas' && s.activity?.rubric?.criteria?.some((c) => c.id === 'kai')).length;
    const photo = Object.keys(w.photo || {}).length;
    writtenNote = `，會考式手寫題 ${n} 題${photo ? `、可拍照批改 ${photo} 題` : ''}`;
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error(`✗ ${file}：手寫題 — ${e.message}`);
      errors++;
      continue;
    }
  }
  // 課後形成性評量題庫放在 content/quizzes/<課程 id>.json（由 scripts/quiz-src/*.py 產生並用 SymPy 核算）
  let quizNote = '';
  try {
    const quiz = JSON.parse(await readFile(join(root, 'content/quizzes', `${raw.id}.json`), 'utf8'));
    raw.quiz = { title: quiz.title, source: quiz.source, slots: quiz.slots };
    // 課後檢核・PK 戰另外一頁（最後一頁），不放在上課的頁面底下
    if (!raw.slides.some((s) => s.quizPage))
      raw.slides.push({
        id: 'quiz-pk',
        phase: '課後檢核',
        eyebrow: '最後 / 課後檢核・PK 戰',
        title: '課後檢核・PK 戰',
        body: '10 題四選一，每題從 3 題換數字的題目抽 1 題。老師可以派全班測驗，或開 PK 戰兩兩對戰。',
        quizPage: true,
      });
    quizNote = `，形成性評量 ${quiz.slots.length} 題位 × ${quiz.slots[0]?.variants.length ?? 0}`;
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error(`✗ ${file}：形成性評量題庫 — ${e.message}`);
      errors++;
      continue;
    }
  }
  // 魔王戰（一節的最後一堂才有）：最後一頁
  let raidNote = '';
  const raid = raids[raw.id];
  if (raid) {
    if (!raw.slides.some((s) => s.raidPage))
      raw.slides.push({
        id: 'raid',
        phase: '魔王戰',
        eyebrow: `${raid.section || ''} 總複習 / 魔王戰`,
        title: raid.title,
        body: '全班合作打倒魔王：記憶題＝普通攻擊、理解題＝防護罩、應用題＝大招。每一題自己選要做哪一類。',
        raidPage: true,
      });
    raidNote = `，魔王戰 ${raid.pools.attack.length}＋${raid.pools.shield.length}＋${raid.pools.ultimate.length} 題`;
  }
  // 補救練習題另外放在 content/practice/<課程 id>.json（{ 題目 ID: [第 1、2、3 輪] }），在這裡併進課程。
  let practiceNote = '';
  try {
    const pool = JSON.parse(await readFile(join(root, 'content/practice', `${raw.id}.json`), 'utf8'));
    const acts = new Map(raw.slides.filter((s) => s.activity).map((s) => [s.activity.id, s.activity]));
    for (const [id, rounds] of Object.entries(pool)) {
      const a = acts.get(id);
      if (!a) throw new Error(`補救練習的題目 ID「${id}」不在課程裡`);
      if (a.type !== 'numeric') throw new Error(`補救練習只支援數值題：「${id}」是 ${a.type}`);
      a.practice = rounds;
    }
    const missing = [...acts.values()].filter((a) => a.type === 'numeric' && !a.practice).map((a) => a.id);
    practiceNote = `，補救練習 ${Object.keys(pool).length} 題${missing.length ? `（缺：${missing.join('、')}）` : ''}`;
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error(`✗ ${file}：補救練習 — ${e.message}`);
      errors++;
      continue;
    }
  }
  try {
    const lesson = validateLesson(raw);
    if (ids.has(lesson.id)) throw new Error(`課程 ID「${lesson.id}」與 ${ids.get(lesson.id)} 重複`);
    ids.set(lesson.id, file);
    const warnings = lint(raw);
    warned += warnings.length;
    console.log(`${warnings.length ? '△' : '✓'} ${file}（${lesson.id}，${lesson.slides.length} 頁${practiceNote}${writtenNote}${quizNote}${raidNote}）`);
    for (const w of warnings) console.log(`    · ${w}`);
    lessons.push(raw);
  } catch (e) {
    console.error(`✗ ${file}：${e.message}`);
    errors++;
  }
}
if (!lessons.length && !errors) {
  console.error('content/lessons/ 裡沒有任何課程。');
  errors++;
}
await writeFile(join(root, 'content/catalog.generated.json'), JSON.stringify({ lessons }) + '\n');
errors += raidErrors;
for (const id of Object.keys(raids))
  if (!ids.has(id)) {
    console.error(`✗ 魔王戰 ${id}.json：找不到課程 ${id}`);
    errors++;
  }
await writeFile(join(root, 'content/raids.generated.json'), JSON.stringify({ banks: raids }) + '\n');
console.log(`\n${lessons.length} 份課程通過驗證，${errors} 份錯誤，${warned} 則提醒。`);
if (errors || (strict && warned)) process.exitCode = 1;
