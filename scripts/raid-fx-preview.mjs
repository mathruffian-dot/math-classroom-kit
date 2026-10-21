// 建置 scripts/raid-fx-preview.ts，開本機頁面，依序截圖：一般攻擊、5 種大招（每種 2 個時間點）。
// 用法：node scripts/raid-fx-preview.mjs [輸出資料夾] [難度]
import { build } from 'esbuild';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const out = resolve(process.argv[2] || 'tmp/raid-fx');
const difficulty = process.argv[3] || 'normal';
const site = join(out, 'site');
mkdirSync(site, { recursive: true });
await build({ entryPoints: ['scripts/raid-fx-preview.ts'], bundle: true, outdir: site, format: 'esm', external: ['/raid/*', '/fonts/*'], loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, logLevel: 'silent' });
cpSync('public/raid', join(site, 'raid'), { recursive: true });
writeFileSync(join(site, 'index.html'), '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/raid-fx-preview.css"><script type="module" src="/raid-fx-preview.js"></script>');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = join(site, path === '/' ? 'index.html' : path);
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://127.0.0.1:${port}/?d=${difficulty}`);
await page.waitForTimeout(1500);
await page.screenshot({ path: join(out, '0-idle.png') });
await page.evaluate(() => window.hit());
await page.waitForTimeout(800);
await page.screenshot({ path: join(out, '0-hit.png') });
for (let k = 0; k < 5; k++) {
  await page.waitForTimeout(3000);
  const name = await page.evaluate((k) => window.ult(k), k);
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(out, `${k + 1}-${name}-a.png`) });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(out, `${k + 1}-${name}-b.png`) });
}
await browser.close();
server.close();
console.log(`✓ 特效預覽：${out}`);
