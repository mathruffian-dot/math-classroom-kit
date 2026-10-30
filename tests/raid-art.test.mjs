// 魔王的圖與名字依年級切換：九年級（g9-）用 public/raid/g9/ 的三隻相似形魔王，八年級維持原本的根號魔王。
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = await mkdtemp(join(tmpdir(), 'raid-art-'));
test.after(() => rm(dir, { recursive: true, force: true }));
await build({ entryPoints: [resolve('src/raid-ui.ts')], outdir: dir, bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' }, loader: { '.css': 'empty' }, logLevel: 'silent' });
const ui = await import(pathToFileURL(join(dir, 'raid-ui.mjs')).href);
ui.initRaidUi({ esc: (s) => String(s), md: (s) => s, btn: () => '', icon: () => '', figure: () => '', serverTime: () => Date.now() });

const G9 = { easy: '縮放史萊姆', normal: '影長巨像', hard: '相似三角龍' };
const G8 = { easy: '根號史萊姆王', normal: '無理數魔像', hard: '混沌根式龍' };
const map = { title: '魔王戰', wins: {} };
const board = (difficulty) => ({ run: { difficulty }, roles: {} });

test('grade-9 raids use the grade-9 boss art and names', () => {
  const html = ui.raidMapHtml(map, 'g9-1-4c');
  for (const d of ['easy', 'normal', 'hard']) {
    assert.deepEqual(ui.bossOf('g9-1-4c', d), { name: G9[d], src: `/raid/g9/boss-${d}.webp` });
    assert.match(html, new RegExp(`src="/raid/g9/boss-${d}\\.webp"`));
    assert.ok(html.includes(G9[d]), G9[d]);
    const b = ui.raidBoardHtml(board(d), 'g9-1-4c');
    assert.ok(b.includes(`src="/raid/g9/boss-${d}.webp"`));
    assert.ok(b.includes(`<strong class="raid-boss-name">${G9[d]}<small>`));
  }
  for (const name of Object.values(G8)) assert.ok(!html.includes(name), `no grade-8 name ${name}`);
});

test('grade-8 raids keep the original boss art and names', () => {
  const html = ui.raidMapHtml(map, 'g8-2-2d');
  for (const d of ['easy', 'normal', 'hard']) {
    assert.deepEqual(ui.bossOf('g8-2-2d', d), { name: G8[d], src: `/raid/boss-${d}.webp` });
    assert.ok(html.includes(`src="/raid/boss-${d}.webp"`));
    assert.ok(html.includes(G8[d]));
    assert.ok(ui.raidBoardHtml(board(d), 'g8-2-2d').includes(`<strong class="raid-boss-name">${G8[d]}<small>`));
  }
  assert.ok(!html.includes('/raid/g9/'));
  // 沒有課程 id（舊的呼叫方式）也是原本的魔王
  assert.equal(ui.bossOf(undefined, 'hard').name, G8.hard);
});

test('every raid bank picks the boss set of its grade', async () => {
  for (const [file, set, dirName] of [['g8-2-2d', G8, '/raid/'], ['g9-1-4c', G9, '/raid/g9/']]) {
    const bank = JSON.parse(await readFile(`content/raids/${file}.json`, 'utf8'));
    assert.equal(ui.bossOf(bank.hostLesson, 'normal').name, set.normal);
    assert.ok(ui.bossOf(bank.hostLesson, 'normal').src.startsWith(dirName));
  }
});
