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
let validateLesson;
try {
  await build({
    entryPoints: [join(root, 'worker/validation.ts')],
    outfile: join(dir, 'validation.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });
  ({ validateLesson } = await import(pathToFileURL(join(dir, 'validation.mjs')).href));
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
    if (!s.activity) warnings.push(`${where}沒有 IRS 題目。`);
    if ((s.body || '').length > 90) warnings.push(`${where}內文 ${s.body.length} 字，超過 90 字（分段原則：一頁一重點）。`);
    if (!s.phase) warnings.push(`${where}沒有標 phase（認知設計階段）。`);
    if (s.interactive?.steps?.length && !s.interactive.shapes.some((x) => x.step !== undefined || x.focus))
      warnings.push(`${where}有 steps 但沒有任何圖形設定 step／focus，步驟聚焦不會發光。`);
    if (s.activity?.rubric && !s.activity.rubric.reference) warnings.push(`${where}評量規準缺參考解答 reference。`);
    if (['numeric', 'single', 'multiple', 'manipulate'].includes(s.activity?.type) && !s.activity.explanation)
      warnings.push(`${where}題目沒有 explanation（公布結果時的解析）。`);
  }
  if (!lesson.slides.some((s) => s.source)) warnings.push('沒有任何頁面標示 source（課本頁碼），來源無法追溯。');
  return warnings;
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
  try {
    const lesson = validateLesson(raw);
    if (ids.has(lesson.id)) throw new Error(`課程 ID「${lesson.id}」與 ${ids.get(lesson.id)} 重複`);
    ids.set(lesson.id, file);
    const warnings = lint(raw);
    warned += warnings.length;
    console.log(`${warnings.length ? '△' : '✓'} ${file}（${lesson.id}，${lesson.slides.length} 頁）`);
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
console.log(`\n${lessons.length} 份課程通過驗證，${errors} 份錯誤，${warned} 則提醒。`);
if (errors || (strict && warned)) process.exitCode = 1;
