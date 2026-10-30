// 檢查回家作業手寫題庫（content/homework/*.json）：格式、題位和課後檢核一致、links 指到存在的頁面與題位。
// 用法：node scripts/check-homework.mjs [課程 id …]
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = join(root, 'content/homework');
const only = process.argv.slice(2);
const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.json') && (!only.length || only.includes(f.replace(/\.json$/, ''))));
let problems = 0;
const fail = (file, msg) => {
  problems++;
  console.error(`✖ ${file}: ${msg}`);
};
const read = async (p) => JSON.parse(await readFile(p, 'utf8'));
const DIAG = /下列何者|下列哪|哪一個|哪一項|何者/;

for (const file of files) {
  const hw = await read(join(dir, file));
  const id = file.replace(/\.json$/, '');
  if (hw.lessonId !== id) fail(file, `lessonId 應為 ${id}`);
  if (!hw.section || !hw.title) fail(file, '缺 section 或 title');
  const lesson = await read(join(root, 'content/lessons', `${id}.json`)).catch(() => null);
  const quiz = await read(join(root, 'content/quizzes', `${id}.json`)).catch(() => null);
  if (!lesson) fail(file, '找不到 content/lessons 的課程');
  const perf = new Set((hw.curriculum?.performance || []).map((x) => x.code));
  const cont = new Set((hw.curriculum?.content || []).map((x) => x.code));
  if (!perf.size || !cont.size) fail(file, 'curriculum.performance／content 不可以是空的');
  for (const x of [...(hw.curriculum?.performance || []), ...(hw.curriculum?.content || [])])
    if (!/^[a-zA-Z]-(IV|[789])-\d+$/.test(x.code) || !x.text) fail(file, `課綱代碼格式不對：${JSON.stringify(x)}`);
  const quizSlots = new Map((quiz?.slots || []).map((s) => [s.id, s.topic]));
  const ids = new Set();
  let n = 0;
  for (const s of hw.slots || []) {
    ids.add(s.id);
    if (quizSlots.size && quizSlots.get(s.id) !== s.topic) fail(file, `${s.id} 的 topic「${s.topic}」和課後檢核「${quizSlots.get(s.id)}」不一致`);
    if (!Number.isInteger(s.objective) || !lesson || s.objective < 0 || s.objective >= lesson.objectives.length) fail(file, `${s.id} objective 超出範圍`);
    for (const c of s.performance || []) if (!perf.has(c)) fail(file, `${s.id} 的學習表現 ${c} 不在 curriculum 裡`);
    for (const c of s.content || []) if (!cont.has(c)) fail(file, `${s.id} 的學習內容 ${c} 不在 curriculum 裡`);
    if (!s.performance?.length || !s.content?.length) fail(file, `${s.id} 缺學習表現或學習內容`);
    if ((s.variants || []).length < 5) fail(file, `${s.id} 只有 ${(s.variants || []).length} 題（至少 5 題）`);
    for (const [i, v] of (s.variants || []).entries()) {
      n++;
      if (!v.stem || !v.answer || !v.solution) fail(file, `${s.id}#${i} 缺 stem／answer／solution`);
      if (DIAG.test(v.stem)) fail(file, `${s.id}#${i} 像選擇題（${v.stem.match(DIAG)[0]}）`);
      if (v.figure && !/^<svg[\s>]/.test(v.figure)) fail(file, `${s.id}#${i} figure 不是 SVG`);
      if (![1, 2, 3].includes(v.space ?? 2)) fail(file, `${s.id}#${i} space 只能是 1、2、3`);
    }
  }
  for (const q of quizSlots.keys()) if (!ids.has(q)) fail(file, `課後檢核的題位 ${q} 沒有手寫題`);
  const acts = new Set((lesson?.slides || []).filter((sl) => sl.activity).map((sl) => sl.id));
  for (const [act, slots] of Object.entries(hw.links?.activities || {})) {
    if (!acts.has(act)) fail(file, `links.activities 的 ${act} 不是這課有 activity 的頁`);
    for (const q of slots) if (!ids.has(q)) fail(file, `links.activities.${act} 指到不存在的題位 ${q}`);
  }
  // 多小題的頁：逐小題對題型。整頁對到兩個以上題型卻沒有 links.items，學習紀錄就只能算總答對率
  const slideById = new Map((lesson?.slides || []).map((sl) => [sl.id, sl]));
  for (const [act, per] of Object.entries(hw.links?.items || {})) {
    const items = slideById.get(act)?.activity?.items;
    if (!items?.length) {
      fail(file, `links.items 的 ${act} 不是多小題的頁`);
      continue;
    }
    if (!Array.isArray(per) || per.length !== items.length) fail(file, `links.items.${act} 要有 ${items.length} 小題，現在是 ${per?.length}`);
    for (const qs of per || []) for (const q of qs) if (!ids.has(q)) fail(file, `links.items.${act} 指到不存在的題位 ${q}`);
  }
  for (const [act, slots] of Object.entries(hw.links?.activities || {})) {
    const n = slideById.get(act)?.activity?.items?.length || 0;
    if (n > 1 && slots.length > 1 && !hw.links?.items?.[act]) fail(file, `${act} 有 ${n} 小題、對到 ${slots.length} 個題型，要在 links.items 逐小題列出`);
  }
  // 步驟格鬥：這一課的每個 family 都要對到題型（累積的 family 寫「課程 id:題位 id」）
  const duel = await read(join(root, 'content/duels', `${id}.json`)).catch(() => null);
  for (const fam of new Set((duel?.problems || []).map((p) => p.family)))
    if (!hw.links?.duelFamilies?.[fam]) fail(file, `步驟格鬥 family「${fam}」沒有對應題型（links.duelFamilies）`);
  // 魔王戰：每一題都要對到題型——題目 ID 自帶「課程-題位-n」、links.raidTopics，或刻意列在 links.raidSkip
  const raid = await read(join(root, 'content/raids', `${id}.json`)).catch(() => null);
  if (raid) {
    const banks = new Map();
    const slotsOf = async (l) => {
      if (!banks.has(l)) banks.set(l, l === id ? hw : await read(join(dir, `${l}.json`)).catch(() => null));
      return banks.get(l)?.slots || [];
    };
    const skip = new Set(hw.links?.raidSkip || []);
    const missing = new Map();
    for (const q of Object.values(raid.pools || {}).flat()) {
      const m = /^(g[\w-]+?)-(q\d+)-\d+$/.exec(q.id);
      if (m && (await slotsOf(m[1])).some((s) => s.id === m[2])) continue;
      if (skip.has(q.topic) || hw.links?.raidTopics?.[q.topic]) continue;
      missing.set(q.topic, (missing.get(q.topic) || 0) + 1);
    }
    for (const [t, c] of missing) fail(file, `魔王戰 topic「${t}」${c} 題沒有對應題型（links.raidTopics，或刻意不對應就列進 links.raidSkip）`);
  }
  for (const [k, q] of Object.entries(hw.links?.duelFamilies || {})) {
    if (!q.includes(':')) {
      if (!ids.has(q)) fail(file, `links.duelFamilies 的「${k}」指到不存在的題位 ${q}`);
      continue;
    }
    const [l, s] = q.split(':');
    const other = l === id ? hw : await read(join(dir, `${l}.json`)).catch(() => null);
    if (!other?.slots?.some((x) => x.id === s)) fail(file, `links.duelFamilies 的「${k}」指到不存在的 ${q}`);
  }
  for (const [k, ref] of Object.entries(hw.links?.raidTopics || {})) {
    const [l, q] = String(ref).split(':');
    const other = l === id ? hw : await read(join(dir, `${l}.json`)).catch(() => null);
    if (!q || !other?.slots?.some((s) => s.id === q)) fail(file, `links.raidTopics 的「${k}」指到不存在的 ${ref}（格式：課程 id:題位 id）`);
  }
  console.log(`${problems ? '…' : '✔'} ${id}：${hw.slots?.length || 0} 個題型、${n} 題、${Object.keys(hw.links?.activities || {}).length} 個互動頁對應`);
}
if (!files.length) console.log('沒有題庫');
if (problems) {
  console.error(`共 ${problems} 個問題`);
  process.exit(1);
}
