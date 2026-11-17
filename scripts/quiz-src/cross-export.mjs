// 十字交乘題目抽樣匯出（給 cross-check.py 用 SymPy 驗算）：node scripts/quiz-src/cross-export.mjs <輸出.json> [每級題數]
import { build } from 'esbuild';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [out = 'cross-sample.json', per = '300'] = process.argv.slice(2);
const dir = await mkdtemp(join(tmpdir(), 'mck-cross-export-'));
try {
  await build({ entryPoints: [resolve('shared/cross.ts')], outdir: dir, bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' }, logLevel: 'silent' });
  const X = await import(pathToFileURL(join(dir, 'cross.mjs')).href);
  const items = X.CROSS_LEVELS.flatMap((level) => X.crossSequence(20261117, level, Number(per)));
  await writeFile(out, JSON.stringify(items.map(({ key, seed, level, poly, k, inner, p, q, r, s, cards }) => ({ key, seed, level, poly, k, inner, p, q, r, s, cards: cards.map((c) => [c.kind, c.value]), factored: X.factoredTex(k, p, q, r, s) }))));
  console.log(`exported ${items.length} items → ${out}`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
