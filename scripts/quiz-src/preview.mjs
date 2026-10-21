// 題庫預覽：把 content/quizzes/<id>.json 的每一題（題目、附圖、四個選項、解析）排成一頁並截圖，方便逐題檢查。
// 用法：node scripts/quiz-src/preview.mjs g9-1-4a [輸出資料夾]
//       node scripts/quiz-src/preview.mjs raid:g8-2-2d [輸出資料夾]   魔王戰題庫（content/raids/）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const arg = process.argv[2];
const raid = arg.startsWith('raid:');
const id = raid ? arg.slice(5) : arg;
const out = resolve(process.argv[3] || 'tmp/quiz-preview');
mkdirSync(out, { recursive: true });
const LEVEL = { attack: '記憶・普通攻擊', shield: '理解・防護罩', ultimate: '應用・大招' };
const bank = raid
  ? (() => {
      // 魔王戰：每一題當成一個「題位」，標題寫類型與題型
      const r = JSON.parse(readFileSync(`content/raids/${id}.json`, 'utf8'));
      // ONLY=new- 只看題目 ID 開頭符合的（例如只看新增的題目）
      const only = process.env.ONLY || '';
      return { slots: Object.entries(r.pools).flatMap(([k, list]) => list.filter((x) => x.id.startsWith(only)).map((x) => ({ topic: `${LEVEL[k]}｜${x.topic}｜${x.id}`, variants: [x] }))) };
    })()
  : JSON.parse(readFileSync(`content/quizzes/${id}.json`, 'utf8'));
const katexCss = resolve('node_modules/katex/dist/katex.css').replace(/\\/g, '/');
const katexJs = readFileSync('node_modules/katex/dist/katex.js', 'utf8');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const md = (s) => `<span class="md">${esc(s)}</span>`;
const cards = bank.slots
  .flatMap((slot, i) =>
    slot.variants.map(
      (v, k) => `<section><h3>q${i + 1}-${k + 1}　${esc(slot.topic)}</h3><p>${md(v.stem)}</p>${
        v.figure ? `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(v.figure)}">` : '<p class="nofig">（沒有附圖）</p>'
      }<ol>${v.options.map((o, j) => `<li class="${j === v.answer ? 'ok' : ''}">${md(o)}</li>`).join('')}</ol><p class="ex">${md(v.explanation)}</p></section>`,
    ),
  )
  .join('');
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="file:///${katexCss}"><style>
body{font-family:'Microsoft JhengHei',sans-serif;margin:16px;background:#f4f4f4;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;width:1500px}
section{background:#fff;border-radius:10px;padding:10px 14px;font-size:15px}h3{margin:0 0 4px;font-size:14px;color:#a33}
img{width:100%;border:1px solid #ddd;border-radius:6px}ol{margin:6px 0;padding-left:22px;display:grid;grid-template-columns:1fr 1fr;gap:2px 16px}
li.ok{color:#17803d;font-weight:700}.ex{color:#555;font-size:13px;margin:4px 0}.nofig{color:#999}</style>${cards}
<script>${katexJs}</script><script>
document.querySelectorAll('.md').forEach(el=>{el.innerHTML=el.textContent.split(/(\\$[^$]+\\$)/).map(p=>p.startsWith('$')&&p.endsWith('$')&&p.length>1?katex.renderToString(p.slice(1,-1),{throwOnError:false}):p.replace(/&/g,'&amp;').replace(/</g,'&lt;')).join('')})
</script>`;
const name = raid ? `raid-${id}` : id;
const file = join(out, `${name}.html`);
writeFileSync(file, html);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' });
const page = await browser.newPage({ viewport: { width: 1540, height: 900 } });
await page.goto('file:///' + file.replace(/\\/g, '/'));
await page.waitForTimeout(400);
// 每 3 個題位（9 題）一張圖，太長的一張圖看不清楚
const boxes = await page.$$eval('section', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { y: r.top + scrollY, h: r.height }; }));
for (let i = 0; i < boxes.length; i += 9) {
  const group = boxes.slice(i, i + 9);
  const y0 = Math.min(...group.map((b) => b.y)) - 4;
  const y1 = Math.max(...group.map((b) => b.y + b.h)) + 4;
  await page.screenshot({ path: join(out, `${name}-${i / 9 + 1}.png`), clip: { x: 0, y: y0, width: 1540, height: y1 - y0 }, fullPage: true });
}
await browser.close();
console.log(`✓ ${id} 預覽：${out}`);
