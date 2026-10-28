// 八上 2-3 畢氏定理：由 agent 依課本與教用版答案製作的 3 堂課。
// 來源清單：content/sources/g8-2-3-inventory.json（每題頁碼、題目、官方答案、截圖檔）。
// 產生：node scripts/lessons-src/g8-2-3.mjs
//   → content/lessons/g8-2-3*.json、content/written/g8-2-3*.json（會考式規準，保留 photo 欄位）、
//     scripts/lessons-src/g8-2-3-checks.json（每一題的答案與 SymPy 驗算式，由 g8-2-3-check.py 核算）。
// 再執行 node scripts/photo-work.mjs 與 npm run lessons 驗證。
// 例題、隨堂、錯誤分析的視覺化依課本解法逐步呈現（左圖右式）；隨堂的示範用另一組數字（自編），錯誤分析留「？」。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as V from './viz.mjs';
import * as P from './viz-g8-2-3.mjs';
import { textbookOnly } from './textbook-only.mjs';

const { G, C } = V;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fig = (file, alt, caption) => ({ src: `g8-2-3/${file}`, alt, ...(caption ? { caption } : {}) });
const src = (p) => `對應課本 2-3 p.${p}（題目數字同課本）`;
const srcVar = (p) => `對應課本 2-3 p.${p}；第 1 題為課本隨堂，其餘為換數字題（自編）`;
const VIEW = { xMin: 0, xMax: 20, yMin: 0, yMax: 11, aspect: 'equal' };

/* ───────────── 答案核算：每一題都帶 SymPy 驗算式（ck），寫進 checks 檔後從課程 JSON 拿掉 ───────────── */
const checks = [];
/** 小題：[題目, 答案, SymPy 驗算式] */
const items = (id, list) =>
  list.map(([prompt, answer, ck], i) => {
    if (!ck) throw new Error(`${id} 第 ${i + 1} 小題沒有驗算式`);
    checks.push({ id: `${id}#${i + 1}`, prompt, answer, ck });
    return { prompt, answer };
  });
const numeric = (id, prompt, list, explanation, extra = {}) => ({ id, type: 'numeric', prompt, items: items(id, list), explanation, ...extra });
const radical = (id, prompt, list, explanation) => numeric(id, prompt, list, explanation, { form: 'simplest-radical' });
const rubric = (criteria, reference, graderNotes) => ({ criteria, reference, ...(graderNotes ? { graderNotes } : {}) });
const crit = (id, label, levels) => ({ id, label, points: Math.max(...levels.map((l) => l[0])), levels: levels.map(([score, description]) => ({ score, description })) });
const reflect = (id, prompt) => ({
  id,
  phase: '後設認知',
  eyebrow: '最後 / 給自己打分數',
  title: '今天的內容，我掌握了多少？',
  body: '誠實評估，下一節課會從大家最沒把握的地方開始複習。',
  visual: 'cards',
  notes: '3 分以下的學生，下節課開頭用提取練習再做一次；可用抽籤「答錯」請同學上台說明。',
  activity: { id, type: 'scale', prompt, min: 1, max: 5, minLabel: '還需要再看一次', maxLabel: '可以教別人' },
});
/** 會考式評分（0–3 分）的錯誤分析規準：寫進 content/written/<id>.json 的 rubrics。 */
const kai = (levels, reference, graderNotes) => ({
  criteria: [{ id: 'kai', label: '會考評分（0–3 分）', points: 3, levels: levels.map((description, i) => ({ score: 3 - i, description })) }],
  reference,
  graderNotes,
});

/* ───────────── 補救練習（每個 numeric 題 3 輪：同技能、同難度、換數字；題目自足） ───────────── */
const practice = { 'g8-2-3a': {}, 'g8-2-3b': {}, 'g8-2-3c': {} };
const drill = (lesson, id, list) => {
  if (list.length !== 3) throw new Error(`${id} 補救練習要 3 題`);
  practice[lesson][id] = list.map(([prompt, answer, ck, explanation], i) => {
    if (!ck) throw new Error(`${id} 補救練習第 ${i + 1} 題沒有驗算式`);
    checks.push({ id: `practice:${id}#${i + 1}`, prompt, answer, ck });
    return { prompt, answer, explanation };
  });
};

/* ───────────── 圖形（座標：x 0–20、y 0–11；左邊放圖，右邊放算式） ───────────── */
const { rightTri, rightApex, sideLabel, vertexLabel, unit, mid } = P;
const ground = (x0, x1, y) => G.seg([x0, y], [x1, y], { color: '#7a6a55', width: 2 });
const wall = (x, y0, y1) => ({ type: 'rect', x, y: y0, w: 0.55, h: y1 - y0, fill: 'rgba(229,72,77,.28)', color: '#b23a3a', width: 1.2 });

/** 例 1：兩個直角三角形（5、12）與（5、5）。 */
function ex1Figure() {
  const k = 0.55;
  const t1 = rightTri([0.9, 6.2 + 5 * k], [0.9 + 12 * k, 6.2], [0.9, 6.2], { labels: { PR: '5', QR: '12', PQ: 'c' }, o: { focus: [0, 1, 2, 4] } });
  const t2 = rightTri([6.5, 1.4 + 5 * k], [6.5 - 5 * k, 1.4], [6.5, 1.4], { labels: { PR: '5', QR: '5', PQ: 'x' }, o: { focus: [3, 4] } });
  return [...t1, ...t2, G.lab(0.5, 9.8, '(1)', { size: 14 }), G.lab(3.2, 4.6, '(2)', { size: 14 })];
}
/** 例 2：(1) 一股 15、斜邊 17；(2) 斜邊 4 在底下、直角在上方。 */
function ex2Figure() {
  const k = 0.35;
  const t1 = rightTri([0.9, 7 + 8 * k], [0.9 + 15 * k, 7], [0.9, 7], { labels: { PR: 'a', QR: '15', PQ: '17' }, o: { focus: [0, 1, 4] } });
  const s = 1.5,
    A = [1.8, 1.4],
    B = [1.8 + 4 * s, 1.4],
    T = rightApex(A, B, 3 * s, Math.sqrt(7) * s, 1);
  const t2 = rightTri(A, B, T, { labels: { PR: '3', QR: 'b', PQ: '4' }, o: { focus: [2, 3, 4] } });
  return [...t1, ...t2, G.lab(0.5, 10.2, '(1)', { size: 14 }), G.lab(1.2, 5.1, '(2)', { size: 14 })];
}
/** 雲梯（另一組數字）：梯長 13、水平距離 5。 */
function ladderFigure({ L = 13, d = 5, k = 0.6, top = 'h', base = '5', len = '13' } = {}) {
  const R = [7.2, 1.4],
    Pp = [7.2, 1.4 + Math.sqrt(L * L - d * d) * k],
    Q = [7.2 - d * k, 1.4];
  return [ground(1, 9, 1.4), wall(7.2, 1.4, Pp[1] + 0.6), ...rightTri(Pp, Q, R, { labels: { PR: top, QR: base, PQ: len }, fill: C.fBlue, color: C.blue })];
}

/** 例 3：快遞路線（C 左上、B 右上、A 在 C 下方、D 在右下）。 */
function ex3Figure() {
  const k = 0.55,
    Cc = [0.8, 8.8],
    B = [0.8 + 12 * k, 8.8],
    A = [0.8, 8.8 - 5 * k];
  const D = rightApex(A, B, Math.sqrt(105) * k, 8 * k, -1);
  const ctr = [(A[0] + B[0] + Cc[0] + D[0]) / 4, (A[1] + B[1] + Cc[1] + D[1]) / 4];
  return [
    G.poly([A, Cc, B], { fill: C.fBlue, color: C.blue, focus: [0, 1, 2, 5] }),
    G.poly([A, D, B], { fill: C.fTeal, color: C.teal, focus: [3, 4, 5] }),
    ...G.right(Cc, unit(Cc, A), unit(Cc, B), 0.32),
    ...G.right(D, unit(D, A), unit(D, B), 0.32),
    G.seg(A, B, { color: '#5a3fd6', width: 3, focus: [1, 2, 4, 5] }),
    sideLabel(A, Cc, '5', ctr),
    sideLabel(Cc, B, '12', ctr),
    sideLabel(B, D, '8', ctr),
    vertexLabel(A, 'A', ctr),
    vertexLabel(B, 'B', ctr),
    vertexLabel(Cc, 'C', ctr),
    vertexLabel(D, 'D', ctr),
  ];
}
/** 例 3 隨堂的示範（另一組數字）：四邊形 ABCD，∠A＝∠C＝90°，AB＝2、AD＝4、BC＝1。 */
function quadFigure({ ab = 2, ad = 4, bc = 1, k = 1.2, labels = {} } = {}) {
  const A = [1.6, 6.8],
    u = [0.3, -Math.sqrt(1 - 0.09)],
    w = [-u[1], u[0]];
  const B = [A[0] + u[0] * ab * k, A[1] + u[1] * ab * k],
    D = [A[0] + w[0] * ad * k, A[1] + w[1] * ad * k];
  const bd = Math.hypot(ab, ad),
    cd = Math.sqrt(bd * bd - bc * bc);
  const Cc = rightApex(B, D, bc * k, cd * k, -1);
  const ctr = [(A[0] + B[0] + Cc[0] + D[0]) / 4, (A[1] + B[1] + Cc[1] + D[1]) / 4];
  return [
    G.poly([A, B, D], { fill: C.fBlue, color: C.blue, focus: [1, 2, 4] }),
    G.poly([B, Cc, D], { fill: C.fTeal, color: C.teal, focus: [3, 4] }),
    ...G.right(A, unit(A, B), unit(A, D), 0.3),
    ...G.right(Cc, unit(Cc, B), unit(Cc, D), 0.3),
    sideLabel(A, B, labels.ab ?? String(ab), ctr),
    sideLabel(A, D, labels.ad ?? String(ad), ctr),
    sideLabel(B, Cc, labels.bc ?? String(bc), ctr),
    vertexLabel(A, 'A', ctr),
    vertexLabel(B, 'B', ctr),
    vertexLabel(Cc, 'C', ctr),
    vertexLabel(D, 'D', ctr),
  ];
}
/** 斜邊在底下的直角三角形＋斜邊上的高（例 4、例 4 隨堂、錯誤分析）。 */
function altitudeFigure({ left, right, k, labels, names = ['', '', '', ''], x0 = 0.8, y0 = 2, hStep, o = {} }) {
  const c = Math.hypot(left, right);
  const A = [x0, y0],
    B = [x0 + c * k, y0],
    T = rightApex(A, B, left * k, right * k, 1),
    D = [T[0], y0];
  const ctr = [(A[0] + B[0] + T[0]) / 3, (A[1] + B[1] + T[1]) / 3];
  const hOpt = hStep === undefined ? {} : { focus: hStep };
  return [
    G.poly([A, B, T], { fill: C.fViolet, color: C.violet, ...o }),
    ...G.right(T, unit(T, A), unit(T, B), 0.3),
    G.seg(T, D, { color: C.red, width: 2.4, ...hOpt }),
    ...G.right(D, [1, 0], [0, 1], 0.25, hOpt),
    sideLabel(A, T, labels.left, ctr),
    sideLabel(B, T, labels.right, ctr),
    G.lab((A[0] + B[0]) / 2, y0 - 0.65, labels.hyp, { size: 15 }),
    G.lab(D[0] + 0.4, (T[1] + y0) / 2, labels.h ?? 'h', { size: 15, color: C.red, ...hOpt }),
    ...[A, B, T, D].map((p, i) => (names[i] ? vertexLabel(p, names[i], i === 3 ? [p[0], p[1] + 1] : ctr, { size: 14 }) : null)).filter(Boolean),
  ];
}
/** 例 5：竹竿靠牆（兩個位置）。 */
function poleFigure() {
  const k = 3,
    W = 8.2,
    y0 = 0.8;
  const top1 = [W, y0 + 2.4 * k],
    bot1 = [W - 0.7 * k, y0],
    top2 = [W, y0 + 2 * k],
    bot2 = [W - 1.5 * k, y0];
  return [
    ground(1.6, W + 0.6, y0),
    wall(W, y0, 9.6),
    G.seg(bot1, top1, { color: '#9a7b3c', width: 4, focus: [0, 1, 2, 5] }),
    G.seg(bot2, top2, { color: '#9a7b3c', width: 4, dash: true, step: 3 }),
    ...G.right([W, y0], [-1, 0], [0, 1], 0.3),
    G.lab(bot1[0] + 0.8 * (top1[0] - bot1[0]) - 0.5, bot1[1] + 0.8 * (top1[1] - bot1[1]) + 0.3, '2.5', { size: 14, focus: [0, 1, 2, 5] }),
    G.lab((bot1[0] + W) / 2, y0 - 0.5, '0.7', { size: 14, focus: [0, 1, 2, 5] }),
    G.lab(W + 1.05, (y0 + top1[1]) / 2 + 1.2, 'x', { size: 15, color: '#5a3fd6', focus: [0, 1, 2, 5] }),
    G.lab((bot2[0] + top2[0]) / 2 - 0.6, (bot2[1] + top2[1]) / 2 + 0.1, '2.5', { size: 14, step: 3 }),
    G.lab(W + 1.05, (y0 + top2[1]) / 2 - 1, '2', { size: 15, color: C.red, step: 3 }),
    G.lab((bot2[0] + W) / 2, y0 - 0.5, 'y', { size: 15, color: C.red, step: 3 }),
  ];
}
/** 杯中玻棒（另一組數字）：半徑 r、高 h、玻棒 L。 */
function cupFigure({ r = 3, h = 4, L = 8, k = 1 } = {}) {
  const x0 = 1.4,
    y0 = 1.2,
    Wd = 2 * r * k,
    Ht = h * k;
  const bot = [x0, y0],
    topC = [x0 + r * k, y0 + Ht],
    corner = [x0, y0 + Ht];
  const inside = Math.hypot(r, h);
  const end = [bot[0] + ((topC[0] - bot[0]) * L) / inside, bot[1] + ((topC[1] - bot[1]) * L) / inside];
  return [
    { type: 'rect', x: x0, y: y0, w: Wd, h: Ht, fill: 'rgba(47,128,237,.10)', color: '#6b7394', width: 1.6 },
    G.poly([bot, corner, topC], { fill: C.fViolet, color: C.violet, width: 1.4 }),
    ...G.right(corner, [0, -1], [1, 0], 0.3),
    G.seg(bot, topC, { color: C.blue, width: 4 }),
    G.seg(topC, end, { color: C.orange, width: 4, step: 3 }),
    G.lab((corner[0] + topC[0]) / 2, corner[1] + 0.45, String(r), { size: 14 }),
    G.lab(x0 - 0.45, y0 + Ht / 2, String(h), { size: 14 }),
    G.lab((bot[0] + topC[0]) / 2 + 0.55, (bot[1] + topC[1]) / 2 - 0.2, 'x', { size: 15, color: '#1d4fa3' }),
    G.lab((topC[0] + end[0]) / 2 + 0.6, (topC[1] + end[1]) / 2, '露出', { size: 13, color: '#b4541a', step: 3 }),
  ];
}
/** 例 6：摺疊手機合起來（6×3）與展開（6×6）。 */
function phoneFigure() {
  const k = 0.75,
    y0 = 1.6;
  const r1 = [0.8, y0, 3 * k, 6 * k],
    r2 = [4.3, y0, 6 * k, 6 * k];
  const box = ([x, y, w, h], focus) => [
    { type: 'rect', x, y, w, h, fill: C.fBlue, color: C.blue, width: 2, focus },
    G.seg([x, y], [x + w, y + h], { color: C.red, width: 3, focus }),
  ];
  return [
    ...box(r1, [0, 1, 3, 4]),
    ...box(r2, [0, 2, 3, 4]),
    G.lab(r1[0] + r1[2] / 2, y0 + r1[3] + 0.45, '3', { size: 14 }),
    G.lab(r1[0] - 0.4, y0 + r1[3] / 2, '6', { size: 14 }),
    G.lab(r2[0] + r2[2] / 2, y0 + r2[3] + 0.45, '6', { size: 14 }),
    G.lab(r2[0] + r2[2] + 0.4, y0 + r2[3] / 2, '6', { size: 14 }),
    G.lab(r1[0] + r1[2] / 2, y0 - 0.6, '合起來', { size: 13, color: '#6b7394' }),
    G.lab(r2[0] + r2[2] / 2, y0 - 0.6, '展開', { size: 13, color: '#6b7394' }),
  ];
}
/** 正方形 ABCD 與 AB 上一點 E（例 6 隨堂的示範）。 */
function squareFigure({ side = 3, ae = 1, k = 1.8 } = {}) {
  const x0 = 1.2,
    y0 = 1.4,
    s = side * k;
  const A = [x0, y0 + s],
    B = [x0 + s, y0 + s],
    Cc = [x0 + s, y0],
    D = [x0, y0],
    E = [x0 + ae * k, y0 + s];
  const ctr = [x0 + s / 2, y0 + s / 2];
  return [
    { type: 'rect', x: x0, y: y0, w: s, h: s, fill: C.fBlue, color: C.blue, width: 2 },
    G.seg(D, B, { color: '#5a3fd6', width: 3, focus: [1, 3] }),
    G.seg(D, E, { color: C.orange, width: 3, focus: [2, 3] }),
    G.seg(E, [E[0], y0], { color: '#9aa3c4', width: 1.2, dash: true, focus: [2] }),
    vertexLabel(A, 'A', ctr),
    vertexLabel(B, 'B', ctr),
    vertexLabel(Cc, 'C', ctr),
    vertexLabel(D, 'D', ctr),
    G.lab(E[0], E[1] + 0.45, 'E', { size: 15 }),
    G.lab((A[0] + E[0]) / 2, A[1] + 0.45, String(ae), { size: 13, color: '#b4541a' }),
    G.lab(x0 - 0.45, y0 + s / 2, String(side), { size: 14 }),
  ];
}

/* ───────────────────── 第 1 堂：畢氏定理與邊長計算 ───────────────────── */
const introTri = () => {
  const B = [2, 1.4],
    Cc = [10, 1.4],
    A = rightApex(B, Cc, 4.8, 6.4, 1);
  const ctr = [(A[0] + B[0] + Cc[0]) / 3, (A[1] + B[1] + Cc[1]) / 3];
  return {
    view: { xMin: 0, xMax: 12, yMin: 0, yMax: 7, aspect: 'equal' },
    shapes: [
      G.poly([A, B, Cc], { fill: C.fViolet, color: C.violet }),
      ...G.right(A, unit(A, B), unit(A, Cc), 0.35),
      G.seg(B, Cc, { color: C.red, width: 4, step: 1 }),
      vertexLabel(A, 'A', ctr, { size: 16 }),
      vertexLabel(B, 'B', ctr, { size: 16 }),
      vertexLabel(Cc, 'C', ctr, { size: 16 }),
      sideLabel(B, Cc, '斜邊', ctr, { size: 16, color: C.red, step: 1 }),
      sideLabel(A, B, '股', ctr, { size: 16, color: '#1d4fa3', step: 1 }),
      sideLabel(A, Cc, '股', ctr, { size: 16, color: '#1d4fa3', step: 1 }),
    ].map((s) => (s.step === undefined ? { ...s, focus: [0, 1] } : s)),
    steps: ['∠A ＝ 90°：先找直角', '直角所對的邊 BC 是斜邊（最長），AB、AC 是兩股'],
  };
};

const lessonA = {
  schemaVersion: 1,
  id: 'g8-2-3a',
  title: '2-3 畢氏定理（1）畢氏定理與邊長計算',
  description: '認識直角三角形的斜邊與股；在方格紙上數三個正方形的面積、用拼圖證明 a²＋b²＝c²；練習已知兩股求斜邊、已知一股與斜邊求另一股。例題與隨堂皆附課本截圖，隨堂改為可即時批改的 IRS。',
  subject: '數學・八年級 2-3',
  duration: 45,
  objectives: ['能指出直角三角形的斜邊與兩股', '能用正方形面積說明畢氏定理 a²＋b²＝c²', '能用畢氏定理由兩邊求第三邊，並化成最簡根式'],
  slides: [
    {
      id: 'a-warmup',
      phase: '提取練習',
      eyebrow: '01 / 先想起平方根',
      title: '平方與平方根，你還記得嗎？',
      body: '今天會一直用到「先平方、再開平方根」。面積 50 的正方形，邊長是 √50 ＝ 5√2。先做三個暖身題。',
      source: '銜接 2-1 平方根的意義、2-2 最簡根式',
      interactive: V.squareGrid({ k: 5, m: 2 }),
      activity: radical(
        'a-warmup-q',
        '暖身：直接寫出答案（根式化成最簡根式）',
        [
          ['5² ＋ 12² ＝ ?', '169', '5**2+12**2'],
          ['√169 ＝ ?', '13', 'sqrt(169)'],
          ['√50 ＝ ?', '5√2', 'sqrt(50)'],
        ],
        '(1) 25 ＋ 144 ＝ 169。(2) 13² ＝ 169，所以 √169 ＝ 13。(3) 50 ＝ 5² × 2，√50 ＝ 5√2。',
      ),
      notes: '提取練習約 2 分鐘。第 3 題答錯的同學，提醒 2-2 學過「找出最大的平方因數搬到根號外」。',
    },
    {
      id: 'a-intro',
      phase: '概念建立',
      eyebrow: '02 / 斜邊與股',
      title: '直角對面的那一邊叫斜邊',
      body: '直角三角形中，直角所對的邊稱為斜邊，其餘兩邊稱為股。三角板都是直角三角形。',
      source: src(92),
      figures: [fig('intro-legs.png', '課本 p.92 斜邊與股、三角板')],
      interactive: introTri(),
      activity: {
        id: 'a-intro-q',
        type: 'single',
        prompt: '△ABC 中，∠A ＝ 90°，斜邊是哪一邊？',
        options: ['BC', 'AB', 'AC', '不一定'],
        correct: [0],
        explanation: '∠A 是直角，它所對的邊是 BC，所以 BC 是斜邊；AB、AC 是兩股。斜邊不一定畫在下面或斜斜的。',
      },
      notes: '刻意把直角放在上方：斜邊要看「直角的對邊」，不是看哪一條畫得斜。',
    },
    {
      id: 'a-predict',
      phase: '預測',
      eyebrow: '03 / 先猜再驗證',
      title: '兩股 3 和 4，斜邊多長？',
      body: '先憑直覺選一個，等一下用方格紙和拼圖驗證。',
      visual: 'cards',
      activity: {
        id: 'a-predict-q',
        type: 'single',
        prompt: '直角三角形的兩股是 3 和 4，斜邊是多少？',
        options: ['7', '5', '12', '√7'],
        correct: [1],
        explanation: '3² ＋ 4² ＝ 9 ＋ 16 ＝ 25 ＝ 5²，斜邊是 5，不是 3 ＋ 4 ＝ 7。接下來兩頁說明為什麼。',
      },
      notes: '先公布統計、不公布答案，保留疑問到下一頁。選 7 的同學是把長度直接相加。',
    },
    {
      id: 'a-grid',
      phase: '具體操作',
      eyebrow: '04 / 探索：數格子',
      title: '三個正方形的面積有什麼關係？',
      body: '課本探索活動：兩股 2、3。數出甲、乙、丙的面積（丙＝外框減 4 個三角形），再拖拉兩股試試。',
      source: src(93),
      figures: [fig('tiles.png', '課本 p.93 等腰直角三角形地磚'), fig('explore-grid.png', '課本 p.93 探索活動：直角三角形斜邊與兩股的關係')],
      interactive: P.gridSquares({ a: 2, b: 3 }),
      activity: numeric(
        'a-grid-q',
        '課本 p.93 探索活動：數出三個正方形的面積',
        [
          ['正方形甲（邊長 AC ＝ 3）的面積', '9', '3**2'],
          ['正方形乙（邊長 BC ＝ 2）的面積', '4', '2**2'],
          ['正方形丙（邊長 AB）的面積', '13', '(2+3)**2-4*Rational(2*3,2)'],
        ],
        '(1) 甲 ＝ 3 × 3 ＝ 9。(2) 乙 ＝ 2 × 2 ＝ 4。(3) 外框 5 × 5 ＝ 25，減去 4 個三角形 4 × 3 ＝ 12，丙 ＝ 13 ＝ 9 ＋ 4。',
      ),
      notes: '具體操作（CRA）。先讓學生數，再打開「數丙」與「顯示面積」對照；接著拖拉兩股，請學生說說甲＋乙和丙的關係。',
    },
    {
      id: 'a-proof',
      phase: '具體操作',
      eyebrow: '05 / 拼圖證明',
      title: '把 4 個三角形搬到四個角落',
      body: '兩個大正方形一樣大。拖拉滑桿把三角形從圖一搬到圖二：空白部分從甲＋乙變成丙。',
      source: src(94),
      figures: [fig('explore-proof.png', '課本 p.94 探索活動：畢氏定理')],
      interactive: P.rearrange({ a: 3, b: 2 }),
      activity: {
        id: 'a-proof-q',
        type: 'single',
        prompt: '課本 p.94 探索 (3)：搬完之後，a² ＋ b² 和 c² 的關係？',
        options: ['a² ＋ b² ＝ c²', 'a² ＋ b² ＞ c²', 'a² ＋ b² ＜ c²', '要看 a、b 的大小'],
        correct: [0],
        explanation: '大正方形面積相同、4 個三角形面積相同，所以剩下的空白也相同：甲＋乙＝丙，即 a² ＋ b² ＝ c²。',
      },
      notes: '可搭配附件 4 的貼紙實作。追問：丙為什麼是正方形？（四邊都是 c，四個角都是 90°。）',
    },
    {
      id: 'a-theorem',
      phase: '圖式連結',
      eyebrow: '06 / 畢氏定理',
      title: '兩股平方和 ＝ 斜邊平方',
      body: '按「下一步」：三邊各畫一個正方形，顏色和式子對應。只有直角三角形才成立。',
      source: src(94),
      figures: [fig('keybox-pythagoras.png', '課本 p.94 畢氏定理重點框')],
      videos: [{ youtube: 'XkDKOFpIYDk', title: '兩股平方和＝斜邊的平方！畢達哥拉斯饒舌（三帥爸 Sense Bar）', vertical: true }],
      interactive: V.figSteps({
        view: VIEW,
        figure: P.theoremFigure(),
        x: 15,
        top: 9.4,
        lines: [
          '直角三角形：兩股 a、b，斜邊 c',
          { text: '以 a 為邊的正方形：a²', color: '#5a3fd6' },
          { text: '以 b 為邊的正方形：b²', color: '#1d4fa3' },
          { text: '以 c 為邊的正方形：c²', color: '#b4541a' },
          { text: 'a² ＋ b² ＝ c²', size: 24 },
        ],
        captions: ['先認出斜邊：直角的對邊 c', '紫色正方形面積 a²', '藍色正方形面積 b²', '橘色正方形面積 c²', '畢氏定理：兩股長的平方和等於斜邊長的平方'],
        caption: '畢氏定理（畢達哥拉斯定理）：任意一個直角三角形 a² ＋ b² ＝ c²',
      }),
      activity: {
        id: 'a-theorem-q',
        type: 'single',
        prompt: '△ABC 中，∠C ＝ 90°，下列哪一個正確？',
        options: ['BC² ＋ AC² ＝ AB²', 'AB² ＋ BC² ＝ AC²', 'AB² ＋ AC² ＝ BC²', 'AB ＋ BC ＝ AC'],
        correct: [0],
        explanation: '∠C 的對邊 AB 是斜邊，兩股是 BC、AC：BC² ＋ AC² ＝ AB²。',
      },
    },
    {
      id: 'a-ex1',
      phase: '工作範例',
      eyebrow: '07 / 例 1 斜邊長的計算',
      title: '已知兩股，求斜邊',
      body: '例 1 的做法：兩股平方相加，再取正的平方根。先自己算，再按「下一步」對照課本的解法。',
      source: src(95),
      figures: [fig('ex1.png', '課本 p.95 例 1 題目')],
      interactive: V.figSteps({
        view: VIEW,
        figure: ex1Figure(),
        top: 9.6,
        lines: ['(1) c² ＝ 5² ＋ 12²', '＝ 25 ＋ 144 ＝ 169', '因為 c ＞ 0，c ＝ √169 ＝ 13', '(2) x² ＝ 5² ＋ 5² ＝ 50', '因為 x ＞ 0，x ＝ √50 ＝ 5√2'],
        captions: ['例 1(1)：兩股 5、12，由畢氏定理', '先算平方，再相加', '邊長是正數，取正的平方根', '例 1(2)：兩股都是 5', '√50 化成最簡根式 5√2'],
        caption: '課本例 1 的方法：c² ＝ a² ＋ b²，c 取正的平方根',
      }),
      activity: radical(
        'a-ex1-q',
        '先自己算例 1（最簡根式）',
        [
          ['(1) 兩股 5、12，斜邊 c ＝ ?', '13', 'sqrt(5**2+12**2)'],
          ['(2) 兩股 5、5，斜邊 x ＝ ?', '5√2', 'sqrt(5**2+5**2)'],
        ],
        '(1) c² ＝ 25 ＋ 144 ＝ 169，c ＝ 13。(2) x² ＝ 25 ＋ 25 ＝ 50，x ＝ √50 ＝ 5√2。',
      ),
      notes: '工作範例：先讓學生試算（生成效應），再逐步講解。強調「因為 c ＞ 0」：邊長取正的平方根。',
    },
    {
      id: 'a-ex1-practice',
      phase: '隨堂練習',
      eyebrow: '08 / 例 1 隨堂',
      title: '換你算：求斜邊',
      body: '前兩題是課本隨堂，第 3 題換數字。左圖用另一組數字示範同樣的步驟，答案化成最簡根式。',
      source: srcVar(95),
      figures: [fig('ex1-practice.png', '課本 p.95 例 1 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: rightTri([1.2, 2 + 4 * 0.9], [1.2 + 6 * 0.9, 2], [1.2, 2], { labels: { PR: '4', QR: '6', PQ: 'c' }, fill: C.fBlue, color: C.blue }),
        top: 9.2,
        lines: ['示範：兩股 4、6', 'c² ＝ 4² ＋ 6²', '＝ 16 ＋ 36 ＝ 52', 'c ＝ √52 ＝ 2√13'],
        captions: ['另一組數字（自編）', '畢氏定理：兩股平方和 ＝ 斜邊平方', '先算平方，再相加', '取正的平方根，化成最簡根式'],
      }),
      activity: radical(
        'a-ex1-practice-q',
        '課本 p.95 隨堂：求斜邊（最簡根式）',
        [
          ['(1) 兩股 3、4，斜邊 m', '5', 'sqrt(3**2+4**2)'],
          ['(2) 兩股 7、24，斜邊 n', '25', 'sqrt(7**2+24**2)'],
          ['(3) 兩股 2、6，斜邊', '2√10', 'sqrt(2**2+6**2)'],
        ],
        '(1) m² ＝ 9 ＋ 16 ＝ 25，m ＝ 5。(2) n² ＝ 49 ＋ 576 ＝ 625，n ＝ 25。(3) 4 ＋ 36 ＝ 40，√40 ＝ 2√10。',
      ),
      notes: '常見錯誤：3 ＋ 4 ＝ 7（沒有平方）；n² ＝ 625 時忘了開平方根。',
    },
    {
      id: 'a-ex2',
      phase: '工作範例',
      eyebrow: '09 / 例 2 股長的計算',
      title: '已知一股與斜邊，求另一股',
      body: '另一股² ＝ 斜邊² − 已知股²。例 2(2) 的直角在上方，先找出哪一邊是斜邊。先自己算再對照。',
      source: src(96),
      figures: [fig('ex2.png', '課本 p.96 例 2 題目')],
      interactive: V.figSteps({
        view: VIEW,
        figure: ex2Figure(),
        top: 9.6,
        lines: ['(1) a² ＋ 15² ＝ 17²', 'a² ＝ 289 − 225 ＝ 64，a ＝ 8', '(2) 4 是斜邊（直角的對邊）', '3² ＋ b² ＝ 4²，b² ＝ 16 − 9 ＝ 7', '因為 b ＞ 0，b ＝ √7'],
        captions: ['例 2(1)：已知一股 15、斜邊 17', '移項：a² ＝ 17² − 15²，取正的平方根', '例 2(2)：直角在上方，它的對邊 4 才是斜邊', '一股² ＝ 斜邊² − 另一股²', '取正的平方根'],
        caption: '課本例 2 的方法：先找斜邊，再用 斜邊² − 股²',
      }),
      activity: radical(
        'a-ex2-q',
        '先自己算例 2（最簡根式）',
        [
          ['(1) 一股 15、斜邊 17，另一股 a ＝ ?', '8', 'sqrt(17**2-15**2)'],
          ['(2) 一股 3、斜邊 4，另一股 b ＝ ?', '√7', 'sqrt(4**2-3**2)'],
        ],
        '(1) a² ＝ 289 − 225 ＝ 64，a ＝ 8。(2) b² ＝ 16 − 9 ＝ 7，b ＝ √7。',
      ),
      notes: '例 2(2) 是本堂最容易錯的地方：學生會把 3 和 4 當兩股，算成 5。請學生先用手指出直角。',
    },
    {
      id: 'a-ex2-practice',
      phase: '隨堂練習',
      eyebrow: '10 / 例 2 隨堂',
      title: '換你算：雲梯有多高？',
      body: '第 1 題是課本隨堂，後兩題換數字。左圖用另一組數字示範：雲梯是斜邊。',
      source: srcVar(96),
      figures: [fig('ex2-practice.png', '課本 p.96 例 2 隨堂練習'), fig('ex2-practice-fig.png', '課本 p.96 雲梯附圖')],
      interactive: V.figSteps({
        view: VIEW,
        figure: ladderFigure(),
        top: 9.2,
        lines: ['示範：雲梯長 13、水平距離 5', 'h² ＋ 5² ＝ 13²', 'h² ＝ 169 − 25 ＝ 144', 'h ＝ 12（公尺）'],
        captions: ['另一組數字（自編）：雲梯是斜邊', '畢氏定理', '斜邊² − 股²', '取正的平方根'],
      }),
      activity: radical(
        'a-ex2-practice-q',
        '求另一股（最簡根式）',
        [
          ['(1) 雲梯長 26 公尺、底部與建築物水平距離 10 公尺，h 是多少公尺？', '24', 'sqrt(26**2-10**2)'],
          ['(2) 斜邊 10、一股 6，另一股', '8', 'sqrt(10**2-6**2)'],
          ['(3) 斜邊 6、一股 2，另一股', '4√2', 'sqrt(6**2-2**2)'],
        ],
        '(1) h² ＝ 676 − 100 ＝ 576，h ＝ 24。(2) 100 − 36 ＝ 64，8。(3) 36 − 4 ＝ 32，√32 ＝ 4√2。',
      ),
    },
    {
      id: 'a-which',
      phase: '交錯練習',
      eyebrow: '11 / 哪一邊是斜邊？',
      title: '只知道兩邊 6 和 8，第三邊是多少？',
      body: '題目沒說 8 是股還是斜邊時，兩種情況都要想。可複選。',
      source: '改寫自備課用書「會考觀測站」（搭配例 1）',
      visual: 'cards',
      activity: {
        id: 'a-which-q',
        type: 'multiple',
        prompt: '直角三角形的兩邊長是 6 和 8，第三邊可能是？（可複選）',
        options: ['10', '2√7', '14', '√14'],
        correct: [0, 1],
        explanation: '6、8 都是股：√(36 ＋ 64) ＝ 10；8 是斜邊：√(64 − 36) ＝ √28 ＝ 2√7。6 不可能是斜邊（斜邊最長）。',
      },
      notes: '交錯練習：混合「求斜邊」和「求股」。追問：6 可以是斜邊嗎？為什麼不行？',
    },
    {
      id: 'a-error',
      phase: '錯誤分析',
      eyebrow: '12 / 當小老師',
      title: '小明：x² ＝ 13² ＋ 5²，x ＝ √194',
      body: '直角三角形斜邊 13、一股 5，求另一股 x。在畫布圈出錯誤、寫出正確算法並說明理由，也可以拍照。',
      source: src(96),
      interactive: V.figSteps({
        view: VIEW,
        figure: rightTri([1, 3.2 + 5 * 0.5], [1 + 12 * 0.5, 3.2], [1, 3.2], { labels: { PR: '5', QR: 'x', PQ: '13' }, fill: C.fOrange, color: C.orange }),
        top: 9.2,
        lines: ['小明：x² ＝ 13² ＋ 5² ＝ 194', 'x ＝ √194 ≈ 13.9？', '哪一邊是斜邊？', '正確：x² ＝ ？', 'x ＝ ？'],
        captions: ['小明的算法', '比斜邊 13 還長，合理嗎？', '直角的對邊是哪一條？', '斜邊² 和股² 該加還是減？', '答案是多少？'],
      }),
      activity: {
        id: 'a-error-q',
        type: 'canvas',
        prompt: '斜邊 13、一股 5，小明寫 x² ＝ 13² ＋ 5² ＝ 194，x ＝ √194。① 圈出錯誤 ② 寫出正確算法與答案 ③ 說明理由',
        canvas: 'grid',
        allowPhoto: true,
        aiAllowed: true,
        rubric: rubric(
          [
            crit('find', '找出錯誤', [[0, '未指出錯誤'], [1, '只說算錯，沒說錯在哪'], [2, '指出 13 是斜邊，不能和股的平方相加']]),
            crit('fix', '正確計算', [[0, '答案錯誤或未作答'], [1, '列出 x² ＝ 13² − 5² 但計算錯誤'], [2, 'x² ＝ 169 − 25 ＝ 144，x ＝ 12']]),
            crit('why', '說明理由', [[0, '沒有理由'], [1, '只寫公式'], [2, '說明斜邊是直角的對邊、最長，股² ＝ 斜邊² − 另一股²（或指出 √194 比斜邊長不合理）']]),
          ],
          'x² ＋ 5² ＝ 13²，x² ＝ 169 − 25 ＝ 144，x ＝ 12。13 是斜邊（直角的對邊、最長的邊）；小明把斜邊當成股相加，得到 √194 ≈ 13.9 比斜邊還長，不合理。',
          '接受直接寫 x ＝ √(13² − 5²) ＝ 12 的做法。',
        ),
      },
      notes: '收件後按「AI 批改」，覆核後發回；挑「用估算檢查合理性」的說明投影討論。',
    },
    {
      id: 'a-exit',
      phase: '出場券',
      eyebrow: '13 / 用自己的話說',
      title: '什麼時候用加、什麼時候用減？',
      body: '已知直角三角形兩邊求第三邊：用一到兩句話說明，並舉一個例子。',
      visual: 'steps',
      bullets: ['先找直角和斜邊', '求斜邊還是求股？', '算完檢查：斜邊最長'],
      activity: {
        id: 'a-exit-q',
        type: 'short',
        prompt: '已知直角三角形的兩邊求第三邊，什麼時候用「加」、什麼時候用「減」？舉一個例子。',
        aiAllowed: true,
        rubric: rubric(
          [
            crit('rule', '判斷規則', [[0, '沒有說明或說錯'], [1, '只說「求斜邊用加」，沒提到求股'], [2, '說明求斜邊：兩股平方相加；求股：斜邊平方減另一股平方']]),
            crit('example', '舉例', [[0, '沒有例子或算錯'], [2, '舉出正確的例子（如兩股 3、4，斜邊 5；斜邊 5、一股 3，另一股 4）']]),
          ],
          '求斜邊：c² ＝ a² ＋ b²（如兩股 3、4，斜邊 √25 ＝ 5）；求股：a² ＝ c² − b²（如斜邊 5、一股 3，另一股 √16 ＝ 4）。先找直角，它的對邊是斜邊。',
        ),
      },
    },
    reflect('a-reflect', '我能用畢氏定理由兩邊求出直角三角形的第三邊'),
  ],
};

/* ───────────────────── 第 2 堂：畢氏定理的應用 ───────────────────── */
const lessonB = {
  schemaVersion: 1,
  id: 'g8-2-3b',
  title: '2-3 畢氏定理（2）畢氏定理的應用',
  description: '在複合圖形裡找出直角三角形連續使用畢氏定理；用「面積兩種算法」求斜邊上的高；解決竹竿靠牆、杯中玻棒、摺疊手機螢幕等生活問題。例題與隨堂皆附課本截圖，隨堂改為可即時批改的 IRS。',
  subject: '數學・八年級 2-3',
  duration: 45,
  objectives: ['能在複合圖形中找出直角三角形，連續使用畢氏定理', '能用面積說明並計算直角三角形斜邊上的高', '能把生活情境畫成直角三角形，用畢氏定理解題'],
  slides: [
    {
      id: 'b-warmup',
      phase: '提取練習',
      eyebrow: '01 / 上一堂的畢氏定理',
      title: '先熱身：兩邊求第三邊',
      body: '先找斜邊：求斜邊用加，求股用減。三題暖身（根式化成最簡根式）。',
      source: '銜接 2-3(1) 例 1、例 2',
      interactive: P.gridSquares({ a: 3, b: 4 }),
      activity: radical(
        'b-warmup-q',
        '直接寫出答案（最簡根式）',
        [
          ['兩股 6、8，斜邊 ＝ ?', '10', 'sqrt(6**2+8**2)'],
          ['斜邊 13、一股 12，另一股 ＝ ?', '5', 'sqrt(13**2-12**2)'],
          ['兩股 2、3，斜邊 ＝ ?', '√13', 'sqrt(2**2+3**2)'],
        ],
        '(1) √(36 ＋ 64) ＝ 10。(2) √(169 − 144) ＝ 5。(3) √(4 ＋ 9) ＝ √13。',
      ),
    },
    {
      id: 'b-ex3',
      phase: '工作範例',
      eyebrow: '02 / 例 3 複合圖形',
      title: '先算共用的那一邊',
      body: 'AB 同時是兩個直角三角形的斜邊：先在 △ABC 求 AB，再到 △ABD 求 AD。先自己算，再按「下一步」。',
      source: src(97),
      figures: [fig('ex3.png', '課本 p.97 例 3 題目')],
      interactive: V.figSteps({
        view: VIEW,
        figure: ex3Figure(),
        top: 9.6,
        lines: ['(1) △ABC 中，∠C ＝ 90°', 'AB² ＝ 5² ＋ 12² ＝ 169', 'AB ＞ 0，AB ＝ 13', '(2) △ABD 中，∠D ＝ 90°', '169 ＝ AD² ＋ 8²', 'AD² ＝ 105，AD ＝ √105'],
        captions: ['例 3(1)：先看藍色直角三角形', 'AB 是 △ABC 的斜邊', '取正的平方根', '例 3(2)：AB 也是 △ABD 的斜邊', 'AB² ＝ AD² ＋ BD²', '169 − 64 ＝ 105，105 沒有平方因數'],
        caption: '課本例 3 的方法：找出共用的邊，一個三角形接一個三角形算',
      }),
      activity: radical(
        'b-ex3-q',
        '先自己算例 3（最簡根式）',
        [
          ['(1) AB 的長', '13', 'sqrt(5**2+12**2)'],
          ['(2) 貨物從 A 送到 D 的距離 AD', '√105', 'sqrt(13**2-8**2)'],
        ],
        '(1) AB² ＝ 25 ＋ 144 ＝ 169，AB ＝ 13。(2) 169 ＝ AD² ＋ 64，AD² ＝ 105，AD ＝ √105。',
      ),
      notes: '請學生先在圖上把兩個直角三角形分別描出來，再說出 AB 在兩個三角形裡各是什麼邊。',
    },
    {
      id: 'b-ex3-practice',
      phase: '隨堂練習',
      eyebrow: '03 / 例 3 隨堂',
      title: '換你算：四邊形裡的兩個直角三角形',
      body: '前兩題是課本隨堂，第 3 題換數字。左圖用另一組數字示範：先求共用的 BD。',
      source: srcVar(97),
      figures: [fig('ex3-practice.png', '課本 p.97 例 3 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: quadFigure(),
        top: 9.4,
        lines: ['示範：AB ＝ 2、AD ＝ 4、BC ＝ 1', '△ABD：BD² ＝ 2² ＋ 4² ＝ 20', 'BD ＝ √20 ＝ 2√5', '△BCD：CD² ＝ 20 − 1² ＝ 19', 'CD ＝ √19'],
        captions: ['另一組數字（自編）', '∠A ＝ 90°，BD 是斜邊', '化成最簡根式', '∠C ＝ 90°，BD 也是斜邊：CD² ＝ BD² − BC²', '19 沒有平方因數'],
      }),
      activity: radical(
        'b-ex3-practice-q',
        '四邊形 ABCD 中 ∠A ＝ ∠C ＝ 90°（最簡根式）',
        [
          ['(1) AB ＝ 4、AD ＝ 6，求 BD', '2√13', 'sqrt(4**2+6**2)'],
          ['(2) 承上，BC ＝ 3，求 CD', '√43', 'sqrt(4**2+6**2-3**2)'],
          ['(3) 另一個四邊形：∠A ＝ ∠C ＝ 90°，BC ＝ CD ＝ 5、AD ＝ 2，求 AB', '√46', 'sqrt(5**2+5**2-2**2)'],
        ],
        '(1) BD² ＝ 16 ＋ 36 ＝ 52，BD ＝ 2√13。(2) CD² ＝ 52 − 9 ＝ 43，CD ＝ √43。(3) BD² ＝ 50，AB² ＝ 50 − 4 ＝ 46，AB ＝ √46。',
      ),
      notes: '常見錯誤：(2) 用 BD ＝ 2√13 平方時算成 4 × 13 以外的數；提醒 (2√13)² ＝ 52，或直接用 BD² ＝ 52。',
    },
    {
      id: 'b-area',
      phase: '具體操作',
      eyebrow: '04 / 探索：斜邊上的高',
      title: '同一個面積，兩種算法',
      body: '拖拉兩股，打開「以斜邊為底」：面積 ＝ ½ × 兩股 ＝ ½ × 斜邊 × 高。看看高 h 怎麼變。',
      source: '補充（非課本）：斜邊上的高的動態示意，對應課本 p.98',
      interactive: P.altitudeArea({ a: 5, b: 12 }),
      activity: {
        id: 'b-area-q',
        type: 'manipulate',
        prompt: '調整兩股，找出「斜邊上的高」剛好是 2.4 的直角三角形，再按「送出我的操作」。',
        check: 'abs(a*b/sqrt(a^2+b^2)-2.4)<0.001',
        record: ['a', 'b'],
        explanation: '兩股 3、4（斜邊 5）：面積 ＝ ½ × 3 × 4 ＝ 6 ＝ ½ × 5 × h，h ＝ 12 ÷ 5 ＝ 2.4。',
      },
      notes: '具體操作（CRA）。完成後請學生說：為什麼 h ＝ 兩股相乘 ÷ 斜邊？（面積的兩種算法相等）',
    },
    {
      id: 'b-ex4',
      phase: '工作範例',
      eyebrow: '05 / 例 4 斜邊上的高',
      title: '溜滑梯有多高？',
      body: '例 4：三邊 5、12、13。用斜邊當底、也用兩股算面積，兩式相等就能求 h。先自己算再對照。',
      source: src(98),
      figures: [fig('ex4.png', '課本 p.98 例 4 題目'), fig('keybox-altitude.png', '課本 p.98 斜邊上的高 ＝ 兩股乘積 ÷ 斜邊')],
      interactive: V.figSteps({
        view: VIEW,
        figure: altitudeFigure({ left: 12, right: 5, k: 0.6, labels: { left: '12', right: '5', hyp: '13' }, hStep: [0, 2, 3] }),
        top: 9.4,
        gap: 1.45,
        lines: ['面積 ＝ ½ × 13 × h', '面積 ＝ ½ × 5 × 12', '½ × 13 × h ＝ ½ × 5 × 12', String.raw`$h=\dfrac{5\times 12}{13}=\dfrac{60}{13}$`],
        captions: ['以斜邊 13 為底，高是 h', '直角三角形：一股當底、另一股當高', '同一個面積，兩式相等', '斜邊上的高 ＝ 兩股乘積 ÷ 斜邊'],
        caption: '課本例 4 的方法：面積的兩種算法相等',
      }),
      activity: radical('b-ex4-q', '先自己算例 4（寫成分數）', [['溜滑梯的高 h', '60/13', 'Rational(5*12,13)']], '½ × 13 × h ＝ ½ × 5 × 12，h ＝ 60/13（約 4.6）。'),
      notes: '強調 h 比兩股都短（60/13 ≈ 4.6 ＜ 5）。推廣：斜邊上的高 ＝ 兩股乘積 ÷ 斜邊。',
    },
    {
      id: 'b-ex4-practice',
      phase: '隨堂練習',
      eyebrow: '06 / 例 4 隨堂',
      title: '換你算：先求股，再求高',
      body: '前兩題是課本隨堂，第 3 題換數字。左圖用另一組數字示範：先用畢氏定理求另一股，再求高。',
      source: srcVar(98),
      figures: [fig('ex4-practice.png', '課本 p.98 例 4 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: altitudeFigure({ left: 6, right: 8, k: 0.75, labels: { left: '6', right: '?', hyp: '10' }, names: ['B', 'C', 'A', 'D'], hStep: [3, 4] }),
        top: 9.6,
        gap: 1.35,
        lines: ['示範：AB ＝ 6、BC ＝ 10', '(1) AC² ＝ 10² − 6² ＝ 64', 'AC ＝ 8', '(2) AD ＝ 兩股乘積 ÷ 斜邊', String.raw`$\overline{AD}=\dfrac{6\times 8}{10}=\dfrac{24}{5}$`],
        captions: ['另一組數字（自編）：∠A ＝ 90°，BC 是斜邊', '斜邊² − 股²', '取正的平方根', 'AD 是斜邊上的高', '化成最簡分數'],
      }),
      activity: radical(
        'b-ex4-practice-q',
        '直角三角形 ABC 中，∠A ＝ 90°，AD 為斜邊上的高（分數寫成 72/5 的形式）',
        [
          ['(1) AB ＝ 24、BC ＝ 30，求 AC', '18', 'sqrt(30**2-24**2)'],
          ['(2) 承上，求 AD', '72/5', 'Rational(24*18,30)'],
          ['(3) 另一題：兩股 12、16 的直角三角形，斜邊上的高', '48/5', 'Rational(12*16,20)'],
        ],
        '(1) AC² ＝ 900 − 576 ＝ 324，AC ＝ 18。(2) AD ＝ 24 × 18 ÷ 30 ＝ 72/5。(3) 斜邊 20，高 ＝ 12 × 16 ÷ 20 ＝ 48/5。',
      ),
    },
    {
      id: 'b-ex5-predict',
      phase: '預測',
      eyebrow: '07 / 先猜再算',
      title: '竹竿頂端降低 0.4 公尺，底部要移多遠？',
      body: '例 5：長 2.5 公尺的竹竿靠牆，底部離牆腳 0.7 公尺。頂端往下 0.4 公尺時，底部往外移多少？先猜。',
      source: src(99),
      figures: [fig('ex5.png', '課本 p.99 例 5 題目')],
      activity: {
        id: 'b-ex5-predict-q',
        type: 'single',
        prompt: '竹竿頂端降低 0.4 公尺，竹竿底部會往外移多少？',
        options: ['也是 0.4 公尺', '比 0.4 公尺多', '比 0.4 公尺少', '不會移動'],
        correct: [1],
        explanation: '原本底部離牆 0.7 公尺，降低後離牆 1.5 公尺，往外移了 0.8 公尺，比 0.4 公尺多。下一頁算給你看。',
      },
      notes: '先公布統計、不公布答案，保留疑問到下一頁。可以拿掃把靠牆實際示範。',
    },
    {
      id: 'b-ex5',
      phase: '工作範例',
      eyebrow: '08 / 例 5 竹竿靠牆',
      title: '竹竿、地面、牆圍成直角三角形',
      body: '竹竿是斜邊。先求頂端離地多高，再求降低後底部的位置。先自己算，再按「下一步」。',
      source: src(99),
      figures: [fig('ex5.png', '課本 p.99 例 5 題目')],
      interactive: V.figSteps({
        view: VIEW,
        figure: poleFigure(),
        top: 9.8,
        lines: ['(1) 0.7² ＋ x² ＝ 2.5²', 'x² ＝ 6.25 − 0.49 ＝ 5.76', 'x ＞ 0，x ＝ 2.4', '(2) 頂端離地：2.4 − 0.4 ＝ 2', 'y² ＋ 2² ＝ 2.5²，y² ＝ 2.25', 'y ＞ 0，y ＝ 1.5（公尺）'],
        captions: ['例 5(1)：竹竿 2.5 是斜邊', '斜邊² − 股²', '2.4² ＝ 5.76，頂端離地 2.4 公尺', '例 5(2)：先算降低後的高度', '竹竿長度不變，還是斜邊 2.5', '底部離牆 1.5 公尺：往外移了 0.8 公尺'],
        caption: '課本例 5 的方法：把情境畫成直角三角形',
      }),
      activity: numeric(
        'b-ex5-q',
        '先自己算例 5（公尺，寫成小數）',
        [
          ['(1) 竹竿頂端離地面多少公尺？', '2.4', 'sqrt(Rational(25,10)**2-Rational(7,10)**2)'],
          ['(2) 頂端降低 0.4 公尺，底部要放在離牆腳幾公尺處？', '1.5', 'sqrt(Rational(25,10)**2-2**2)'],
        ],
        '(1) x² ＝ 6.25 − 0.49 ＝ 5.76，x ＝ 2.4。(2) 2.4 − 0.4 ＝ 2，y² ＝ 6.25 − 4 ＝ 2.25，y ＝ 1.5。',
      ),
      notes: '回扣預測：底部從 0.7 移到 1.5，移了 0.8 公尺，不是 0.4。',
    },
    {
      id: 'b-ex5-practice',
      phase: '隨堂練習',
      eyebrow: '09 / 例 5 隨堂',
      title: '換你算：玻棒露出多長？',
      body: '第 1 題是課本隨堂，後兩題換數字。左圖用另一組數字示範：杯內那段是斜邊，最後別忘了相減。',
      source: srcVar(99),
      figures: [fig('ex5-practice.png', '課本 p.99 例 5 隨堂練習'), fig('ex5-practice-fig.png', '課本 p.99 杯中玻棒附圖')],
      interactive: V.figSteps({
        view: VIEW,
        figure: cupFigure(),
        top: 9.2,
        lines: ['示範：半徑 3、高 4、玻棒 8', '杯內：x² ＝ 3² ＋ 4² ＝ 25', 'x ＝ 5', '露出：8 − 5 ＝ 3（公分）'],
        captions: ['另一組數字（自編）：從杯蓋中心到杯底邊緣', '半徑和高是兩股', '杯內的玻棒長 5', '玻棒全長減去杯內的長度'],
      }),
      activity: numeric(
        'b-ex5-practice-q',
        '玻棒（吸管）露出杯口外幾公分？',
        [
          ['(1) 杯子底圓半徑 5 公分、高 12 公分，玻棒長 20 公分', '7', '20-sqrt(5**2+12**2)'],
          ['(2) 杯子底圓半徑 8 公分、高 15 公分，玻棒長 20 公分', '3', '20-sqrt(8**2+15**2)'],
          ['(3) 水壺底圓半徑 7 公分、高 24 公分，吸管長 30 公分', '5', '30-sqrt(7**2+24**2)'],
        ],
        '(1) √(25 ＋ 144) ＝ 13，20 − 13 ＝ 7。(2) √(64 ＋ 225) ＝ 17，20 − 17 ＝ 3。(3) √(49 ＋ 576) ＝ 25，30 − 25 ＝ 5。',
      ),
      notes: '常見錯誤：算出杯內長度 13 就停了，或把直徑 10 當成股。',
    },
    {
      id: 'b-ex6',
      phase: '工作範例',
      eyebrow: '10 / 例 6 摺疊手機',
      title: '展開後，螢幕尺寸是兩倍嗎？',
      body: '螢幕尺寸是對角線長。合起來 6 × 3 吋、展開 6 × 6 吋。先自己算兩條對角線，再按「下一步」。',
      source: src(100),
      figures: [fig('ex6.png', '課本 p.100 例 6 題目')],
      interactive: V.figSteps({
        view: VIEW,
        figure: phoneFigure(),
        top: 9.4,
        lines: ['對角線是直角三角形的斜邊', '合起來：√(6² ＋ 3²) ＝ √45 ＝ 3√5', '展開：√(6² ＋ 6²) ＝ √72 ＝ 6√2', '3√5 × 2 ＝ 6√5 ≠ 6√2', '面積變兩倍，對角線不是兩倍'],
        captions: ['長方形的對角線把它切成兩個直角三角形', '合起來的螢幕尺寸', '展開後的螢幕尺寸', '如果是兩倍，應該是 6√5', '6√2 ≈ 8.5，3√5 ≈ 6.7：不是兩倍'],
        caption: '課本例 6：展開後面積是兩倍，但螢幕尺寸不是兩倍',
      }),
      activity: radical(
        'b-ex6-q',
        '先自己算例 6（最簡根式）',
        [
          ['(1) 合起來時的對角線（吋）', '3√5', 'sqrt(6**2+3**2)'],
          ['(2) 展開後的對角線（吋）', '6√2', 'sqrt(6**2+6**2)'],
        ],
        '(1) √(36 ＋ 9) ＝ √45 ＝ 3√5。(2) √(36 ＋ 36) ＝ √72 ＝ 6√2。3√5 × 2 ＝ 6√5 ≠ 6√2，所以不是兩倍。',
      ),
      notes: '補充：螢幕尺寸以吋為單位，指的是對角線長。追問：要對角線變兩倍，長和寬要怎麼變？（都變兩倍）',
    },
    {
      id: 'b-ex6-practice',
      phase: '隨堂練習',
      eyebrow: '11 / 例 6 隨堂',
      title: '換你算：BD 和 DE 的比值',
      body: '課本隨堂拆成三步：先求 BD、DE，再求比值並有理化。左圖用另一組數字示範。',
      source: src(100),
      figures: [fig('ex6-practice.png', '課本 p.100 例 6 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: squareFigure(),
        top: 9.6,
        gap: 1.55,
        lines: ['示範：正方形邊長 3、AE ＝ 1', 'BD ＝ √(3² ＋ 3²) ＝ 3√2', 'DE ＝ √(1² ＋ 3²) ＝ √10', String.raw`$\dfrac{\overline{BD}}{\overline{DE}}=\dfrac{3\sqrt{2}}{\sqrt{10}}=\dfrac{3\sqrt{5}}{5}$`],
        captions: ['另一組數字（自編）', 'BD 是 △BCD 的斜邊', 'DE 是 △AED 的斜邊（∠A ＝ 90°）', '比值寫成分數，分母有理化'],
      }),
      activity: radical(
        'b-ex6-practice-q',
        '課本 p.100 隨堂：正方形 ABCD 邊長 2，E、F 為 AB、CD 的中點（最簡根式）',
        [
          ['(1) BD 的長', '2√2', 'sqrt(2**2+2**2)'],
          ['(2) DE 的長', '√5', 'sqrt(1**2+2**2)'],
          ['(3) BD：DE 的比值', '2√10/5', 'sqrt(8)/sqrt(5)'],
        ],
        '(1) √(4 ＋ 4) ＝ 2√2。(2) AE ＝ 1、AD ＝ 2，√(1 ＋ 4) ＝ √5。(3) 2√2/√5 ＝ 2√10/5。',
      ),
      notes: '比值要有理化：2√2/√5 ＝ 2√2 × √5/5 ＝ 2√10/5（2-2 分母有理化）。',
    },
    {
      id: 'b-error',
      phase: '錯誤分析',
      eyebrow: '12 / 當小老師',
      title: '小華：斜邊上的高 ＝ 9 × 12 ÷ 2 ＝ 54',
      body: '兩股 9、12 的直角三角形，求斜邊上的高。在畫布圈出錯誤、寫出正確算法並說明理由，也可以拍照。',
      source: src(98),
      interactive: V.figSteps({
        view: VIEW,
        figure: altitudeFigure({ left: 12, right: 9, k: 0.5, labels: { left: '12', right: '9', hyp: '？' } }),
        top: 9.2,
        lines: ['小華：h ＝ 9 × 12 ÷ 2 ＝ 54', '9 × 12 ÷ 2 算的是什麼？', '斜邊 ＝ ？', '½ × 斜邊 × h ＝ ？', 'h ＝ ？'],
        captions: ['小華的算法', '54 比兩股都長，合理嗎？', '先用畢氏定理求斜邊', '面積的兩種算法相等', '答案是多少？'],
      }),
      activity: {
        id: 'b-error-q',
        type: 'canvas',
        prompt: '兩股 9、12，小華寫斜邊上的高 h ＝ 9 × 12 ÷ 2 ＝ 54。① 圈出錯誤 ② 寫出正確算法與答案 ③ 說明理由',
        canvas: 'grid',
        allowPhoto: true,
        aiAllowed: true,
        rubric: rubric(
          [
            crit('find', '找出錯誤', [[0, '未指出錯誤'], [1, '只說錯了'], [2, '指出 9 × 12 ÷ 2 ＝ 54 是面積，不是高']]),
            crit('fix', '正確計算', [[0, '答案錯誤或未作答'], [1, '求出斜邊 15 但高算錯'], [2, '斜邊 15，h ＝ 9 × 12 ÷ 15 ＝ 36/5']]),
            crit('why', '說明理由', [[0, '沒有理由'], [1, '只寫公式'], [2, '用面積兩種算法相等說明（½ × 15 × h ＝ ½ × 9 × 12），或指出高不可能比兩股長']]),
          ],
          '斜邊 ＝ √(81 ＋ 144) ＝ 15。面積 ＝ ½ × 9 × 12 ＝ 54 ＝ ½ × 15 × h，h ＝ 108 ÷ 15 ＝ 36/5（＝ 7.2）。小華算的 54 是面積，斜邊上的高要再用面積兩種算法求出。',
          '接受直接用「斜邊上的高 ＝ 兩股乘積 ÷ 斜邊」＝ 108/15 ＝ 36/5 的做法；寫 7.2 也正確。',
        ),
      },
      notes: '收件後按「AI 批改」，覆核後發回。',
    },
    reflect('b-reflect', '我能在圖形和生活情境中找出直角三角形，用畢氏定理解題'),
  ],
};

/* ───────────────────── 第 3 堂：平面上兩點的距離 ───────────────────── */
/** 例 7：A(3,2)、B(−5,2)、C(3,−4)。 */
function ex7Figure() {
  const { shapes, at } = P.plane({ xr: [-6, 4], yr: [-5, 3], s: 0.85, ox: 0.5 + 6 * 0.85, oy: 1.2 + 5 * 0.85 });
  const A = at(3, 2),
    B = at(-5, 2),
    Cc = at(3, -4);
  return [
    ...shapes,
    G.seg(B, A, { color: C.blue, width: 3.4, focus: [0, 1, 3, 4] }),
    G.seg(A, Cc, { color: '#c026d3', width: 3.4, focus: [2, 3, 4] }),
    G.seg(B, Cc, { color: '#5a3fd6', width: 3, step: 3 }),
    ...G.right(A, unit(A, B), unit(A, Cc), 0.3, { step: 3 }),
    ...P.dot(at, 3, 2, 'A(3, 2)', { dir: [0.4, 1] }),
    ...P.dot(at, -5, 2, 'B(−5, 2)', { dir: [0.4, 1] }),
    ...P.dot(at, 3, -4, 'C(3, −4)', { dir: [1.3, 0] }),
  ];
}
/** 例 7 隨堂的示範：P(−4,1)、Q(2,1)、R(2,−3)。 */
function ex7DemoFigure() {
  const s = 0.95;
  const { shapes, at } = P.plane({ xr: [-5, 3], yr: [-4, 3], s, ox: 0.6 + 5 * s, oy: 1.2 + 4 * s, tickAt: [1, 2] });
  const Pp = at(-4, 1),
    Q = at(2, 1),
    R = at(2, -3);
  return [
    ...shapes,
    G.seg(Pp, Q, { color: C.blue, width: 3.4, focus: [1, 4] }),
    G.seg(Q, R, { color: '#c026d3', width: 3.4, focus: [2, 4] }),
    G.seg(Pp, R, { color: '#5a3fd6', width: 3, step: 3 }),
    ...G.right(Q, unit(Q, Pp), unit(Q, R), 0.3, { step: 3 }),
    ...P.dot(at, -4, 1, 'P(−4, 1)', { dir: [0, 1] }),
    ...P.dot(at, 2, 1, 'Q(2, 1)', { dir: [0.4, 1] }),
    ...P.dot(at, 2, -3, 'R(2, −3)', { dir: [1.4, 0] }),
  ];
}
/** 兩點與水平、鉛垂的兩股（例 8 與示範、錯誤分析）。 */
function twoPointFigure({ A, B, names, xr, yr, s, ox, oy, labels = {}, steps = {} }) {
  const { shapes, at } = P.plane({ xr, yr, s, ox, oy });
  const pa = at(...A),
    pb = at(...B),
    corner = at(B[0], A[1]);
  return [
    ...shapes,
    G.seg(pa, corner, { color: C.blue, width: 3.2, dash: true, ...(steps.dx ? { focus: steps.dx } : {}) }),
    G.seg(corner, pb, { color: '#c026d3', width: 3.2, dash: true, ...(steps.dy ? { focus: steps.dy } : {}) }),
    G.seg(pa, pb, { color: '#5a3fd6', width: 3.2, ...(steps.ab ? { focus: steps.ab } : {}) }),
    ...G.right(corner, unit(corner, pa), unit(corner, pb), 0.28),
    ...P.dot(at, ...A, names[0], { dir: labels.dirA ?? [1.4, 0] }),
    ...P.dot(at, ...B, names[1], { dir: labels.dirB ?? [1.4, 0] }),
    // 兩股的長度標在直角三角形裡面（靠近該股），不會壓到坐標軸的刻度
    ...(labels.dx ? [G.lab((pa[0] + corner[0]) / 2, pa[1] + Math.sign(pb[1] - pa[1]) * 0.45, labels.dx, { size: 14, color: '#1d4fa3', ...(steps.dx ? { focus: steps.dx } : {}) })] : []),
    ...(labels.dy ? [G.lab(corner[0] + Math.sign(pa[0] - corner[0]) * 0.5, (corner[1] + pb[1]) / 2, labels.dy, { size: 14, color: '#a21caf', ...(steps.dy ? { focus: steps.dy } : {}) })] : []),
  ];
}
/** 距離公式的一般圖（課本 p.102 推導）。 */
function formulaFigure() {
  const A = [1.6, 8],
    Cc = [1.6, 3],
    B = [8.6, 3];
  return [
    G.seg(Cc, B, { color: C.blue, width: 3.4, focus: [0, 2, 3, 4] }),
    G.seg(A, Cc, { color: '#c026d3', width: 3.4, focus: [1, 2, 3, 4] }),
    G.seg(A, B, { color: C.ink, width: 3, focus: [2, 4] }),
    ...G.right(Cc, [1, 0], [0, 1], 0.32),
    { type: 'circle', x: A[0], y: A[1], r: 0.12, fill: C.ink, color: C.ink, width: 1 },
    { type: 'circle', x: B[0], y: B[1], r: 0.12, fill: C.ink, color: C.ink, width: 1 },
    G.lab(A[0] + 0.2, A[1] + 0.6, 'A(x₁, y₁)', { size: 14 }),
    G.lab(Cc[0] + 0.2, Cc[1] - 0.6, 'C(x₁, y₂)', { size: 14 }),
    G.lab(B[0], B[1] - 0.6, 'B(x₂, y₂)', { size: 14 }),
    G.lab((Cc[0] + B[0]) / 2 + 0.7, Cc[1] + 0.5, '|x₂ − x₁|', { size: 14, color: '#1d4fa3', focus: [0, 4] }),
    G.lab(A[0] + 1.2, (A[1] + Cc[1]) / 2, '|y₂ − y₁|', { size: 14, color: '#a21caf', focus: [1, 4] }),
  ];
}
/** √5＋√2 與 √7：兩股 √5、√2，斜邊 √7（一題多解：三角形的邊長關係）。 */
function compareFigure() {
  const k = 2.3,
    R = [1.4, 2],
    Q = [1.4 + Math.sqrt(5) * k, 2],
    Pp = [1.4, 2 + Math.sqrt(2) * k];
  return rightTri(Pp, Q, R, { labels: { PR: '√2', QR: '√5', PQ: '√7' }, fill: C.fOrange, color: C.orange });
}

const lessonC = {
  schemaVersion: 1,
  id: 'g8-2-3c',
  title: '2-3 畢氏定理（3）平面上兩點的距離',
  description: '水平線、鉛垂線上的兩點用「數線上兩點的距離」計算；斜斜的兩點畫出水平與鉛垂的兩股，用畢氏定理得到兩點距離公式。例題與隨堂皆附課本截圖，隨堂改為可即時批改的 IRS。',
  subject: '數學・八年級 2-3',
  duration: 45,
  objectives: ['能求水平線或鉛垂線上兩點的距離', '能說明兩點距離公式與畢氏定理的關係', '能用距離公式求坐標平面上兩點的距離並化成最簡根式'],
  slides: [
    {
      id: 'c-warmup',
      phase: '提取練習',
      eyebrow: '01 / 先想起數線上的距離',
      title: '數線上兩點的距離 ＝ |a − b|',
      body: '七年級學過：數線上 A(a)、B(b) 的距離是 |a − b|。再加一題畢氏定理暖身。',
      source: '銜接七年級數線上兩點的距離、2-3(1) 畢氏定理',
      interactive: {
        view: { xMin: -7, xMax: 5, yMin: -1.2, yMax: 2.2, aspect: 'equal' },
        shapes: [
          ...V.numberLine(-6, 4, 1),
          { type: 'point', x: -5, y: 0, color: C.blue, text: 'B(−5)' },
          { type: 'point', x: 3, y: 0, color: C.red, text: 'A(3)' },
          { type: 'brace', points: [[-5, 0.35], [3, 0.35]], text: '|3 − (−5)|' },
        ],
        caption: '數線上兩點的距離：大減小，或取差的絕對值',
      },
      activity: numeric(
        'c-warmup-q',
        '暖身：直接寫出答案',
        [
          ['數線上 A(3)、B(−5)，AB ＝ ?', '8', 'Abs(3-(-5))'],
          ['|2 − (−4)| ＝ ?', '6', 'Abs(2-(-4))'],
          ['兩股 8、6 的直角三角形，斜邊 ＝ ?', '10', 'sqrt(8**2+6**2)'],
        ],
        '(1) |3 − (−5)| ＝ 8。(2) |2 ＋ 4| ＝ 6。(3) √(64 ＋ 36) ＝ 10。',
      ),
      notes: '減去負數要變號：3 − (−5) ＝ 8，不是 −2。',
    },
    {
      id: 'c-predict',
      phase: '預測',
      eyebrow: '02 / 先猜再驗證',
      title: '這兩點相距多遠？',
      body: 'A(2, 1)、B(−4, 9) 不在同一條水平線或鉛垂線上。先憑直覺猜，這一堂最後會算出來。',
      source: src(102),
      interactive: (() => {
        const { shapes, at } = P.plane({ xr: [-5, 3], yr: [-1, 10], s: 0.8, ox: 6 + 5 * 0.8, oy: 0.9 + 0.8 });
        return { view: VIEW, shapes: [...shapes, ...P.dot(at, 2, 1, 'A(2, 1)', { dir: [1.4, 0] }), ...P.dot(at, -4, 9, 'B(−4, 9)', { dir: [-1.5, 0] })] };
      })(),
      activity: {
        id: 'c-predict-q',
        type: 'single',
        prompt: 'A(2, 1)、B(−4, 9) 兩點的距離是多少？',
        options: ['14', '10', '2', '√14'],
        correct: [1],
        explanation: '水平差 6、鉛垂差 8，AB 是兩股 6、8 的直角三角形斜邊：√(36 ＋ 64) ＝ 10（課本例 8）。14 是把兩段直接相加。',
      },
      notes: '先公布統計、不公布答案；例 8 再回來對答案。選 14 的同學是「繞路走」的距離。',
    },
    {
      id: 'c-ex7',
      phase: '工作範例',
      eyebrow: '03 / 例 7 水平與鉛垂',
      title: '同一條水平線：x 坐標相減',
      body: '例 7：AB 在水平線上、AC 在鉛垂線上，用數線上的距離；BC 斜斜的，用畢氏定理。先自己算再對照。',
      source: src(101),
      figures: [fig('section2-intro.png', '課本 p.101 平面上兩點的距離'), fig('ex7.png', '課本 p.101 例 7 題目')],
      interactive: V.figSteps({
        view: VIEW,
        figure: ex7Figure(),
        x: 15,
        top: 9.6,
        lines: ['(1) A、B 的 y 坐標相同', 'AB ＝ |3 − (−5)| ＝ 8', 'AC ＝ |2 − (−4)| ＝ 6', '(2) BC² ＝ 8² ＋ 6² ＝ 100', 'BC ＞ 0，BC ＝ 10'],
        captions: ['例 7(1)：A、B 在同一條水平線上', '水平線：x 坐標的差', '鉛垂線：y 坐標的差', '例 7(2)：∠A ＝ 90°，BC 是斜邊', '取正的平方根'],
        caption: '課本例 7 的方法：水平、鉛垂用數線距離，斜的用畢氏定理',
      }),
      activity: numeric(
        'c-ex7-q',
        '先自己算例 7',
        [
          ['(1) AB 的長', '8', 'Abs(3-(-5))'],
          ['(1) AC 的長', '6', 'Abs(2-(-4))'],
          ['(2) BC 的長', '10', 'sqrt(8**2+6**2)'],
        ],
        '(1) AB ＝ |3 − (−5)| ＝ 8，AC ＝ |2 − (−4)| ＝ 6。(2) BC² ＝ 64 ＋ 36 ＝ 100，BC ＝ 10。',
      ),
      notes: '可用平移說明：A(3, 2) 向左 8 單位到 B(−5, 2)。',
    },
    {
      id: 'c-ex7-practice',
      phase: '隨堂練習',
      eyebrow: '04 / 例 7 隨堂',
      title: '換你算：先水平、鉛垂，再斜的',
      body: '三題都是課本隨堂。左圖用另一組數字示範；第 3 題化成最簡根式。',
      source: src(101),
      figures: [fig('ex7-practice.png', '課本 p.101 例 7 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: ex7DemoFigure(),
        x: 15,
        top: 9.6,
        lines: ['示範：P(−4, 1)、Q(2, 1)、R(2, −3)', 'PQ ＝ |2 − (−4)| ＝ 6', 'QR ＝ |1 − (−3)| ＝ 4', 'PR² ＝ 6² ＋ 4² ＝ 52', 'PR ＝ √52 ＝ 2√13'],
        captions: ['另一組數字（自編）', '水平線：x 坐標的差', '鉛垂線：y 坐標的差', '∠Q ＝ 90°，PR 是斜邊', '化成最簡根式'],
      }),
      activity: radical(
        'c-ex7-practice-q',
        '課本 p.101 隨堂：C(1, −4)、D(1, 3)、E(−2, 3)（最簡根式）',
        [
          ['(1) CD 的長', '7', 'Abs(3-(-4))'],
          ['(1) DE 的長', '3', 'Abs(1-(-2))'],
          ['(2) CE 的長', '√58', 'sqrt(7**2+3**2)'],
        ],
        '(1) CD ＝ |−4 − 3| ＝ 7，DE ＝ |1 − (−2)| ＝ 3。(2) CE² ＝ 49 ＋ 9 ＝ 58，CE ＝ √58。',
      ),
    },
    {
      id: 'c-explore',
      phase: '具體操作',
      eyebrow: '05 / 探索：拖拉兩點',
      title: '任意兩點，都能畫出一個直角三角形',
      body: '拖拉 P、Q：水平虛線長 ＝ x 坐標的差，鉛垂虛線長 ＝ y 坐標的差，PQ 是斜邊。',
      source: '補充（非課本）：兩點距離的動態示意，對應課本 p.102',
      interactive: P.distanceExplore(),
      activity: {
        id: 'c-explore-q',
        type: 'manipulate',
        prompt: '拖拉 P、Q，做出「距離剛好是 5、但不在同一條水平線或鉛垂線上」的兩點，再按「送出我的操作」。',
        check: '(Qx-Px)^2+(Qy-Py)^2==25 && Px!=Qx && Py!=Qy',
        record: ['Px', 'Py', 'Qx', 'Qy'],
        explanation: '坐標差是 3 和 4（或 4 和 3）時，PQ ＝ √(9 ＋ 16) ＝ 5，例如 P(0, 0)、Q(3, 4)。',
      },
      notes: '具體操作（CRA）。公布後請學生分享不同的做法：坐標差都是 3 與 4。',
    },
    {
      id: 'c-formula',
      phase: '圖式連結',
      eyebrow: '06 / 兩點距離公式',
      title: '坐標的差就是兩股',
      body: '按「下一步」：過 A、B 作鉛垂線與水平線交於 C，兩股是坐標的差，AB 是斜邊。',
      source: src(102),
      figures: [fig('distance-derivation.png', '課本 p.102 兩點距離的推導'), fig('keybox-distance.png', '課本 p.102 平面上兩點的距離')],
      interactive: V.figSteps({
        view: VIEW,
        figure: formulaFigure(),
        x: 15,
        top: 9.4,
        lines: [
          { text: String.raw`$\overline{BC}=|x_2-x_1|$`, color: '#1d4fa3' },
          { text: String.raw`$\overline{AC}=|y_2-y_1|$`, color: '#a21caf' },
          String.raw`$\overline{AB}^2=\overline{BC}^2+\overline{AC}^2$`,
          String.raw`$=(x_2-x_1)^2+(y_2-y_1)^2$`,
          String.raw`$\overline{AB}=\sqrt{(x_2-x_1)^2+(y_2-y_1)^2}$`,
        ],
        captions: ['水平的股：x 坐標的差', '鉛垂的股：y 坐標的差', '∠C ＝ 90°，由畢氏定理', '平方之後，絕對值可以拿掉', String.raw`兩點距離 $=\sqrt{(x\text{ 坐標的差})^2+(y\text{ 坐標的差})^2}$`],
        caption: '平面上兩點的距離公式就是畢氏定理',
      }),
      activity: {
        id: 'c-formula-q',
        type: 'single',
        prompt: 'A(x₁, y₁)、B(x₂, y₂) 兩點的距離，下列何者正確？',
        options: [
          String.raw`$\sqrt{(x_2-x_1)^2+(y_2-y_1)^2}$`,
          String.raw`$(x_2-x_1)+(y_2-y_1)$`,
          String.raw`$\sqrt{(x_2-x_1)^2-(y_2-y_1)^2}$`,
          String.raw`$(x_2-x_1)^2+(y_2-y_1)^2$`,
        ],
        correct: [0],
        explanation: '兩股是 |x₂ − x₁| 與 |y₂ − y₁|，AB 是斜邊：AB² ＝ (x₂ − x₁)² ＋ (y₂ − y₁)²，再取正的平方根。',
      },
    },
    {
      id: 'c-ex8',
      phase: '工作範例',
      eyebrow: '07 / 例 8 兩點的距離',
      title: '用距離公式算 AB',
      body: '例 8：A(2, 1)、B(−4, 9)。代入距離公式，先算坐標的差再平方。先自己算，再按「下一步」。',
      source: src(102),
      figures: [fig('ex8.png', '課本 p.102 例 8 題目')],
      interactive: V.figSteps({
        view: VIEW,
        figure: twoPointFigure({ A: [2, 1], B: [-4, 9], names: ['A(2, 1)', 'B(−4, 9)'], xr: [-5, 3], yr: [-1, 10], s: 0.8, ox: 0.6 + 5 * 0.8, oy: 0.9 + 0.8, labels: { dx: '6', dy: '8', dirB: [0.2, 1] }, steps: { dx: [1, 2, 4], dy: [1, 2, 4] } }),
        top: 9.6,
        lines: ['代入兩點距離公式', 'AB ＝ √((−4 − 2)² ＋ (9 − 1)²)', '＝ √((−6)² ＋ 8²)', '＝ √100', '＝ 10'],
        captions: ['A(2, 1)、B(−4, 9)：用兩點距離公式', '代入：後減前（x₂ − x₁、y₂ − y₁）', '坐標的差 −6 與 8：負號平方後不見', '36 ＋ 64 ＝ 100', '回扣預測：答案是 10，不是 14'],
        caption: '課本例 8 的方法：代入距離公式',
      }),
      activity: radical('c-ex8-q', '先自己算例 8', [['A(2, 1)、B(−4, 9)，AB 的長', '10', 'sqrt((-4-2)**2+(9-1)**2)']], 'AB ＝ √((−6)² ＋ 8²) ＝ √100 ＝ 10。'),
      notes: '回扣第 2 頁的預測。提醒：坐標的差誰減誰都可以，平方後一樣。',
    },
    {
      id: 'c-ex8-practice',
      phase: '隨堂練習',
      eyebrow: '08 / 例 8 隨堂',
      title: '換你算：兩點的距離',
      body: '第 1 題是課本隨堂，後兩題換數字。左圖用另一組數字示範，答案化成最簡根式。',
      source: srcVar(102),
      figures: [fig('ex8-practice.png', '課本 p.102 例 8 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: twoPointFigure({ A: [1, -2], B: [-3, 4], names: ['P(1, −2)', 'Q(−3, 4)'], xr: [-4, 2], yr: [-3, 5], s: 0.95, ox: 0.8 + 4 * 0.95, oy: 1 + 3 * 0.95, labels: { dx: '4', dy: '6', dirA: [1.5, 0], dirB: [0.2, 1] } }),
        x: 14.8,
        top: 9.4,
        lines: ['示範：P(1, −2)、Q(−3, 4)', 'x 坐標的差：−3 − 1 ＝ −4', 'y 坐標的差：4 − (−2) ＝ 6', 'PQ ＝ √((−4)² ＋ 6²) ＝ √52', '＝ 2√13'],
        captions: ['另一組數字（自編）', '後減前', '減負數要變號', '代入距離公式', '化成最簡根式'],
      }),
      activity: radical(
        'c-ex8-practice-q',
        '求兩點的距離（最簡根式）',
        [
          ['(1) C(−2, 0)、D(−7, 13)，CD 的長', '√194', 'sqrt((-7-(-2))**2+(13-0)**2)'],
          ['(2) E(−3, −4)、F(6, 2)，EF 的長', '3√13', 'sqrt((6-(-3))**2+(2-(-4))**2)'],
          ['(3) G(5, −1)、H(−1, 2)，GH 的長', '3√5', 'sqrt((-1-5)**2+(2-(-1))**2)'],
        ],
        '(1) √((−5)² ＋ 13²) ＝ √194。(2) √(9² ＋ 6²) ＝ √117 ＝ 3√13。(3) √((−6)² ＋ 3²) ＝ √45 ＝ 3√5。',
      ),
      notes: '常見錯誤：−7 − (−2) 算成 −9。194 ＝ 2 × 97 沒有平方因數，√194 已經是最簡根式。',
    },
    {
      id: 'c-mixed',
      phase: '交錯練習',
      eyebrow: '09 / 一題多解',
      title: '√5 ＋ √2 和 √7，哪個大？',
      body: '課本「一題多解」。左圖：兩股 √5、√2，斜邊恰好是 √7。可以用 2-2 的平方法，也可以看圖。',
      source: '對應課本 p.107 一題多解',
      figures: [fig('multi-solution.png', '課本 p.107 一題多解題目')],
      interactive: V.figSteps({
        view: VIEW,
        figure: compareFigure(),
        top: 9.2,
        lines: ['比較 √5 ＋ √2 與 √7', '(√5 ＋ √2)² ＝ 7 ＋ 2√10', '(√7)² ＝ 7', '7 ＋ 2√10 ＞ 7', '所以 √5 ＋ √2 ＞ √7'],
        captions: ['兩個正數比大小：平方後再比', '和的平方公式（2-2）', '√7 平方是 7', '多了 2√10', '圖上看：走兩股比走斜邊遠'],
      }),
      activity: {
        id: 'c-mixed-q',
        type: 'single',
        prompt: '√5 ＋ √2 與 √7 的大小關係？',
        options: ['√5 ＋ √2 ＞ √7', '√5 ＋ √2 ＜ √7', '√5 ＋ √2 ＝ √7'],
        correct: [0],
        explanation: '(√5 ＋ √2)² ＝ 7 ＋ 2√10 ＞ 7 ＝ (√7)²；圖上 √5、√2 是兩股、√7 是斜邊，兩股長的和大於斜邊。',
      },
      notes: '交錯練習：混合 2-2 的乘法公式、比較大小與畢氏定理。可再請學生說出課本另外三種解法（計算機、整數部分、三角形邊長關係）。',
    },
    {
      id: 'c-error',
      phase: '錯誤分析',
      eyebrow: '10 / 當小老師',
      title: '小美：AB ＝ √((3 − 1)² ＋ (−1 − 2)²) ＝ √13',
      body: '小美求 A(−1, 2)、B(3, −1) 的距離。在畫布圈出錯誤、寫出正確算法並說明理由，也可以拍照。',
      source: src(102),
      interactive: V.figSteps({
        view: VIEW,
        figure: twoPointFigure({ A: [-1, 2], B: [3, -1], names: ['A(−1, 2)', 'B(3, −1)'], xr: [-3, 4], yr: [-3, 4], s: 1, ox: 0.8 + 3, oy: 1.2 + 3, labels: { dx: '？', dy: '？', dirA: [-1.5, 0.3], dirB: [1.5, 0] } }),
        top: 9.4,
        lines: ['小美：(3 − 1)² ＋ (−1 − 2)²', 'x 坐標的差 ＝ 3 − (−1) ＝ ？', 'y 坐標的差 ＝ −1 − 2 ＝ ？', 'AB ＝ ？'],
        captions: ['小美的算式', '減去負數要怎麼算？', 'y 坐標的差', '答案是多少？在方格上數一數檢查'],
      }),
      activity: {
        id: 'c-error-q',
        type: 'canvas',
        prompt: '小美求 A(−1, 2)、B(3, −1) 的距離，寫 AB ＝ √((3 − 1)² ＋ (−1 − 2)²) ＝ √13。① 圈出錯誤 ② 寫出正確算法與答案 ③ 說明理由',
        canvas: 'grid',
        allowPhoto: true,
        aiAllowed: true,
        rubric: rubric(
          [
            crit('find', '找出錯誤', [[0, '未指出錯誤'], [1, '只說錯了'], [2, '指出 x 坐標的差應為 3 − (−1)，小美把 −1 寫成 1']]),
            crit('fix', '正確計算', [[0, '答案錯誤或未作答'], [1, '坐標差正確但平方或開方算錯'], [2, 'AB ＝ √(4² ＋ (−3)²) ＝ √25 ＝ 5']]),
            crit('why', '說明理由', [[0, '沒有理由'], [1, '只寫公式'], [2, '說明減去負數要變號，或在方格上數出水平 4 格、鉛垂 3 格驗證']]),
          ],
          'AB ＝ √((3 − (−1))² ＋ (−1 − 2)²) ＝ √(4² ＋ (−3)²) ＝ √(16 ＋ 9) ＝ √25 ＝ 5。小美把 x 坐標的差寫成 3 − 1，漏了 −1 的負號。',
          '接受 (−1 − 3)² ＋ (2 − (−1))² 的寫法（前減後也可以）。',
        ),
      },
      notes: '收件後按「AI 批改」，覆核後發回。',
    },
    {
      id: 'c-summary',
      phase: '出場券',
      eyebrow: '11 / 重點回顧',
      title: '2-3 畢氏定理：三個重點',
      body: '看課本重點回顧，用一句話說明：兩點距離公式和畢氏定理有什麼關係？',
      source: src(103),
      figures: [fig('summary-1.png', '課本 p.103 重點回顧：畢氏定理、斜邊上的高'), fig('summary-2.png', '課本 p.103 重點回顧：平面上兩點的距離')],
      videos: [{ youtube: 'XyVs0EUNWko', title: '正名之戰：畢達哥拉斯 vs 趙爽 數學史饒舌對決（三帥爸 Sense Bar）' }],
      activity: {
        id: 'c-exit-q',
        type: 'short',
        prompt: '用一句話說明：平面上兩點的距離公式，和畢氏定理有什麼關係？',
        aiAllowed: true,
        rubric: rubric(
          [
            crit('link', '說出關係', [[0, '沒有提到直角三角形或畢氏定理'], [1, '只寫出公式'], [2, '說明兩點連線是直角三角形的斜邊，x、y 坐標的差是兩股']]),
            crit('example', '舉例或說明步驟', [[0, '沒有'], [1, '有例子但計算錯'], [2, '舉出正確的例子或步驟（如 A(0, 0)、B(3, 4)，AB ＝ 5）']]),
          ],
          '過兩點分別作水平線與鉛垂線，得到一個直角三角形：兩股是 x 坐標的差與 y 坐標的差，兩點的連線是斜邊，所以距離 ＝ √((x 坐標的差)² ＋ (y 坐標的差)²)。例：A(0, 0)、B(3, 4)，AB ＝ √(9 ＋ 16) ＝ 5。',
        ),
      },
    },
    reflect('c-reflect', '我能求出坐標平面上兩點的距離'),
  ],
};

/* ───────────────────── 補救練習（3 輪，SymPy 核算） ───────────────────── */
drill('g8-2-3a', 'a-warmup-q', [
  ['計算：8² ＋ 15² ＝ ?', '289', '8**2+15**2', '64 ＋ 225 ＝ 289。'],
  ['寫出答案：√225 ＝ ?', '15', 'sqrt(225)', '15² ＝ 225，所以 √225 ＝ 15。'],
  ['化成最簡根式：√72 ＝ ?', '6√2', 'sqrt(72)', '72 ＝ 6² × 2，√72 ＝ 6√2。'],
]);
drill('g8-2-3a', 'a-grid-q', [
  ['直角三角形兩股 1、3，以斜邊為邊的正方形面積是多少？', '10', '1**2+3**2', '1² ＋ 3² ＝ 10；或外框 4² 減 4 個三角形 4 × 1.5：16 − 6 ＝ 10。'],
  ['直角三角形兩股 3、4，以斜邊為邊的正方形面積是多少？', '25', '3**2+4**2', '9 ＋ 16 ＝ 25。'],
  ['直角三角形兩股 2、4，以斜邊為邊的正方形面積是多少？', '20', '2**2+4**2', '4 ＋ 16 ＝ 20；外框 6² 減 4 × 4：36 − 16 ＝ 20。'],
]);
drill('g8-2-3a', 'a-ex1-q', [
  ['直角三角形兩股 9、12，斜邊長是多少？（最簡根式）', '15', 'sqrt(9**2+12**2)', '81 ＋ 144 ＝ 225，√225 ＝ 15。'],
  ['直角三角形兩股都是 3，斜邊長是多少？（最簡根式）', '3√2', 'sqrt(3**2+3**2)', '9 ＋ 9 ＝ 18，√18 ＝ 3√2。'],
  ['直角三角形兩股 4、8，斜邊長是多少？（最簡根式）', '4√5', 'sqrt(4**2+8**2)', '16 ＋ 64 ＝ 80，√80 ＝ 4√5。'],
]);
drill('g8-2-3a', 'a-ex1-practice-q', [
  ['直角三角形兩股 6、8，斜邊長是多少？（最簡根式）', '10', 'sqrt(6**2+8**2)', '36 ＋ 64 ＝ 100，√100 ＝ 10。'],
  ['直角三角形兩股 8、15，斜邊長是多少？（最簡根式）', '17', 'sqrt(8**2+15**2)', '64 ＋ 225 ＝ 289，√289 ＝ 17。'],
  ['直角三角形兩股 3、6，斜邊長是多少？（最簡根式）', '3√5', 'sqrt(3**2+6**2)', '9 ＋ 36 ＝ 45，√45 ＝ 3√5。'],
]);
drill('g8-2-3a', 'a-ex2-q', [
  ['直角三角形斜邊 25、一股 7，另一股是多少？（最簡根式）', '24', 'sqrt(25**2-7**2)', '625 − 49 ＝ 576，√576 ＝ 24。'],
  ['直角三角形斜邊 5、一股 2，另一股是多少？（最簡根式）', '√21', 'sqrt(5**2-2**2)', '25 − 4 ＝ 21，√21。'],
  ['直角三角形斜邊 9、一股 3，另一股是多少？（最簡根式）', '6√2', 'sqrt(9**2-3**2)', '81 − 9 ＝ 72，√72 ＝ 6√2。'],
]);
drill('g8-2-3a', 'a-ex2-practice-q', [
  ['梯子長 17 公尺靠牆，底部離牆 8 公尺，梯子頂端離地幾公尺？', '15', 'sqrt(17**2-8**2)', '289 − 64 ＝ 225，√225 ＝ 15。'],
  ['梯子長 5 公尺靠牆，底部離牆 3 公尺，梯子頂端離地幾公尺？', '4', 'sqrt(5**2-3**2)', '25 − 9 ＝ 16，√16 ＝ 4。'],
  ['梯子長 7 公尺靠牆，底部離牆 3 公尺，梯子頂端離地幾公尺？（最簡根式）', '2√10', 'sqrt(7**2-3**2)', '49 − 9 ＝ 40，√40 ＝ 2√10。'],
]);
drill('g8-2-3b', 'b-warmup-q', [
  ['直角三角形兩股 5、12，斜邊是多少？（最簡根式）', '13', 'sqrt(5**2+12**2)', '25 ＋ 144 ＝ 169，√169 ＝ 13。'],
  ['直角三角形斜邊 10、一股 8，另一股是多少？（最簡根式）', '6', 'sqrt(10**2-8**2)', '100 − 64 ＝ 36，√36 ＝ 6。'],
  ['直角三角形兩股 1、4，斜邊是多少？（最簡根式）', '√17', 'sqrt(1**2+4**2)', '1 ＋ 16 ＝ 17，√17。'],
]);
drill('g8-2-3b', 'b-ex3-q', [
  ['四邊形 ABCD 中 ∠C ＝ ∠D ＝ 90°，AC ＝ 3、BC ＝ 4、BD ＝ 2，AB 是 △ABC、△ABD 共用的斜邊。求 AD。（最簡根式）', '√21', 'sqrt(3**2+4**2-2**2)', 'AB² ＝ 9 ＋ 16 ＝ 25；AD² ＝ 25 − 4 ＝ 21，AD ＝ √21。'],
  ['四邊形 ABCD 中 ∠C ＝ ∠D ＝ 90°，AC ＝ 6、BC ＝ 8、BD ＝ 5，AB 是共用的斜邊。求 AD。（最簡根式）', '5√3', 'sqrt(6**2+8**2-5**2)', 'AB² ＝ 36 ＋ 64 ＝ 100；AD² ＝ 100 − 25 ＝ 75，AD ＝ 5√3。'],
  ['四邊形 ABCD 中 ∠C ＝ ∠D ＝ 90°，AC ＝ 2、BC ＝ 4、BD ＝ 2，AB 是共用的斜邊。求 AD。（最簡根式）', '4', 'sqrt(2**2+4**2-2**2)', 'AB² ＝ 4 ＋ 16 ＝ 20；AD² ＝ 20 − 4 ＝ 16，AD ＝ 4。'],
]);
drill('g8-2-3b', 'b-ex3-practice-q', [
  ['四邊形 ABCD 中 ∠A ＝ ∠C ＝ 90°，AB ＝ 2、AD ＝ 6、BC ＝ 4，BD 是共用的斜邊。求 CD。（最簡根式）', '2√6', 'sqrt(2**2+6**2-4**2)', 'BD² ＝ 4 ＋ 36 ＝ 40；CD² ＝ 40 − 16 ＝ 24，CD ＝ 2√6。'],
  ['四邊形 ABCD 中 ∠A ＝ ∠C ＝ 90°，AB ＝ 3、AD ＝ 3、BC ＝ 1，BD 是共用的斜邊。求 CD。（最簡根式）', '√17', 'sqrt(3**2+3**2-1**2)', 'BD² ＝ 9 ＋ 9 ＝ 18；CD² ＝ 18 − 1 ＝ 17，CD ＝ √17。'],
  ['四邊形 ABCD 中 ∠A ＝ ∠C ＝ 90°，AB ＝ 5、AD ＝ 5、BC ＝ 7，BD 是共用的斜邊。求 CD。（最簡根式）', '1', 'sqrt(5**2+5**2-7**2)', 'BD² ＝ 25 ＋ 25 ＝ 50；CD² ＝ 50 − 49 ＝ 1，CD ＝ 1。'],
]);
drill('g8-2-3b', 'b-ex4-q', [
  ['直角三角形三邊長 6、8、10，斜邊上的高是多少？（寫成分數）', '24/5', 'Rational(6*8,10)', '½ × 10 × h ＝ ½ × 6 × 8，h ＝ 48/10 ＝ 24/5。'],
  ['直角三角形三邊長 8、15、17，斜邊上的高是多少？（寫成分數）', '120/17', 'Rational(8*15,17)', 'h ＝ 8 × 15 ÷ 17 ＝ 120/17。'],
  ['直角三角形三邊長 7、24、25，斜邊上的高是多少？（寫成分數）', '168/25', 'Rational(7*24,25)', 'h ＝ 7 × 24 ÷ 25 ＝ 168/25。'],
]);
drill('g8-2-3b', 'b-ex4-practice-q', [
  ['直角三角形 ABC 中 ∠A ＝ 90°，AB ＝ 9、BC ＝ 15，AD 為斜邊上的高。求 AD。（寫成分數）', '36/5', 'Rational(9*12,15)', 'AC ＝ √(225 − 81) ＝ 12，AD ＝ 9 × 12 ÷ 15 ＝ 36/5。'],
  ['直角三角形 ABC 中 ∠A ＝ 90°，AB ＝ 5、BC ＝ 13，AD 為斜邊上的高。求 AD。（寫成分數）', '60/13', 'Rational(5*12,13)', 'AC ＝ √(169 − 25) ＝ 12，AD ＝ 5 × 12 ÷ 13 ＝ 60/13。'],
  ['直角三角形 ABC 中 ∠A ＝ 90°，AB ＝ 16、BC ＝ 20，AD 為斜邊上的高。求 AD。（寫成分數）', '48/5', 'Rational(16*12,20)', 'AC ＝ √(400 − 256) ＝ 12，AD ＝ 16 × 12 ÷ 20 ＝ 48/5。'],
]);
drill('g8-2-3b', 'b-ex5-q', [
  ['長 2.6 公尺的竹竿斜靠牆，底部離牆腳 1 公尺，竹竿頂端離地幾公尺？', '2.4', 'sqrt(Rational(26,10)**2-1)', '2.6² − 1² ＝ 6.76 − 1 ＝ 5.76，√5.76 ＝ 2.4。'],
  ['長 1.3 公尺的竹竿斜靠牆，底部離牆腳 0.5 公尺，竹竿頂端離地幾公尺？', '1.2', 'sqrt(Rational(13,10)**2-Rational(5,10)**2)', '1.69 − 0.25 ＝ 1.44，√1.44 ＝ 1.2。'],
  ['長 1.5 公尺的竹竿斜靠牆，頂端離地 1.2 公尺，底部離牆腳幾公尺？', '0.9', 'sqrt(Rational(15,10)**2-Rational(12,10)**2)', '2.25 − 1.44 ＝ 0.81，√0.81 ＝ 0.9。'],
]);
drill('g8-2-3b', 'b-ex5-practice-q', [
  ['杯子底圓半徑 6 公分、高 8 公分，長 15 公分的玻棒從杯蓋中心插到杯底邊緣，露出杯口外幾公分？', '5', '15-sqrt(6**2+8**2)', '杯內 √(36 ＋ 64) ＝ 10，15 − 10 ＝ 5。'],
  ['杯子底圓半徑 9 公分、高 12 公分，長 20 公分的玻棒從杯蓋中心插到杯底邊緣，露出杯口外幾公分？', '5', '20-sqrt(9**2+12**2)', '杯內 √(81 ＋ 144) ＝ 15，20 − 15 ＝ 5。'],
  ['杯子底圓半徑 5 公分、高 12 公分，長 18 公分的吸管從杯蓋中心插到杯底邊緣，露出杯口外幾公分？', '5', '18-sqrt(5**2+12**2)', '杯內 √(25 ＋ 144) ＝ 13，18 − 13 ＝ 5。'],
]);
drill('g8-2-3b', 'b-ex6-q', [
  ['長方形螢幕長 4 吋、寬 2 吋，對角線長幾吋？（最簡根式）', '2√5', 'sqrt(4**2+2**2)', '√(16 ＋ 4) ＝ √20 ＝ 2√5。'],
  ['長方形螢幕長 8 吋、寬 4 吋，對角線長幾吋？（最簡根式）', '4√5', 'sqrt(8**2+4**2)', '√(64 ＋ 16) ＝ √80 ＝ 4√5。'],
  ['正方形螢幕邊長 5 吋，對角線長幾吋？（最簡根式）', '5√2', 'sqrt(5**2+5**2)', '√(25 ＋ 25) ＝ √50 ＝ 5√2。'],
]);
drill('g8-2-3b', 'b-ex6-practice-q', [
  ['正方形 ABCD 邊長 4，E 為 AB 的中點，求 DE 的長。（最簡根式）', '2√5', 'sqrt(2**2+4**2)', 'AE ＝ 2、AD ＝ 4，DE ＝ √(4 ＋ 16) ＝ √20 ＝ 2√5。'],
  ['正方形 ABCD 邊長 2，E 為 AB 的中點，求 DE：BD 的比值。（最簡根式）', '√10/4', 'sqrt(5)/sqrt(8)', 'DE ＝ √5、BD ＝ 2√2，√5/(2√2) ＝ √10/4。'],
  ['正方形 ABCD 邊長 6，E 為 AB 的中點，求 BD：DE 的比值。（最簡根式）', '2√10/5', 'sqrt(72)/sqrt(45)', 'BD ＝ 6√2、DE ＝ √(9 ＋ 36) ＝ 3√5，6√2/(3√5) ＝ 2√10/5。'],
]);
drill('g8-2-3c', 'c-warmup-q', [
  ['數線上 A(−3)、B(4)，AB ＝ ?', '7', 'Abs(4-(-3))', '|4 − (−3)| ＝ 7。'],
  ['|−6 − 2| ＝ ?', '8', 'Abs(-6-2)', '|−8| ＝ 8。'],
  ['直角三角形兩股 5、12，斜邊 ＝ ?', '13', 'sqrt(5**2+12**2)', '√(25 ＋ 144) ＝ 13。'],
]);
drill('g8-2-3c', 'c-ex7-q', [
  ['坐標平面上 A(2, 3)、B(−4, 3)，AB 的長是多少？', '6', 'Abs(2-(-4))', 'y 坐標相同，|2 − (−4)| ＝ 6。'],
  ['坐標平面上 A(−1, 5)、B(−1, −3)，AB 的長是多少？', '8', 'Abs(5-(-3))', 'x 坐標相同，|5 − (−3)| ＝ 8。'],
  ['坐標平面上 A(1, 2)、B(−5, 2)、C(1, −6)，BC 的長是多少？', '10', 'sqrt(6**2+8**2)', 'AB ＝ 6、AC ＝ 8，∠A ＝ 90°，BC ＝ √(36 ＋ 64) ＝ 10。'],
]);
drill('g8-2-3c', 'c-ex7-practice-q', [
  ['坐標平面上 C(2, −3)、D(2, 1)、E(−1, 1)，CE 的長是多少？', '5', 'sqrt(4**2+3**2)', 'CD ＝ 4、DE ＝ 3，CE ＝ √(16 ＋ 9) ＝ 5。'],
  ['坐標平面上 C(−2, −1)、D(−2, 4)、E(1, 4)，CE 的長是多少？（最簡根式）', '√34', 'sqrt(5**2+3**2)', 'CD ＝ 5、DE ＝ 3，CE ＝ √(25 ＋ 9) ＝ √34。'],
  ['坐標平面上 C(3, −2)、D(3, 4)、E(−3, 4)，CE 的長是多少？（最簡根式）', '6√2', 'sqrt(6**2+6**2)', 'CD ＝ 6、DE ＝ 6，CE ＝ √72 ＝ 6√2。'],
]);
drill('g8-2-3c', 'c-ex8-q', [
  ['坐標平面上 A(1, 2)、B(4, 6)，AB 的長是多少？', '5', 'sqrt((4-1)**2+(6-2)**2)', '√(3² ＋ 4²) ＝ √25 ＝ 5。'],
  ['坐標平面上 A(−3, 1)、B(3, −7)，AB 的長是多少？', '10', 'sqrt((3-(-3))**2+(-7-1)**2)', '√(6² ＋ (−8)²) ＝ √100 ＝ 10。'],
  ['坐標平面上 A(2, −5)、B(−3, 7)，AB 的長是多少？', '13', 'sqrt((-3-2)**2+(7-(-5))**2)', '√((−5)² ＋ 12²) ＝ √169 ＝ 13。'],
]);
drill('g8-2-3c', 'c-ex8-practice-q', [
  ['坐標平面上 C(−1, 0)、D(−4, 7)，CD 的長是多少？（最簡根式）', '√58', 'sqrt((-4-(-1))**2+(7-0)**2)', '√((−3)² ＋ 7²) ＝ √58。'],
  ['坐標平面上 C(3, −2)、D(−3, 1)，CD 的長是多少？（最簡根式）', '3√5', 'sqrt((-3-3)**2+(1-(-2))**2)', '√((−6)² ＋ 3²) ＝ √45 ＝ 3√5。'],
  ['坐標平面上 C(0, −4)、D(−2, 2)，CD 的長是多少？（最簡根式）', '2√10', 'sqrt((-2-0)**2+(2-(-4))**2)', '√((−2)² ＋ 6²) ＝ √40 ＝ 2√10。'],
]);

/* ───────────────────── 會考式評分（錯誤分析題，0–3 分） ───────────────────── */
const written = {
  'g8-2-3a': {
    'a-error-q': kai(
      ['圈出把斜邊當成股相加的錯誤，寫出 x² ＝ 13² − 5² ＝ 144、x ＝ 12，並說明斜邊是直角的對邊（最長），求股要用減', 'x ＝ 12 正確但理由不完整，或理由正確但計算有一處小錯', '只指出「錯了」或只列出 13² − 5²，沒有正確答案與理由', '空白、同意 √194，或沒有任何正確內容'],
      'x² ＋ 5² ＝ 13²，x² ＝ 169 − 25 ＝ 144，x ＝ 12。13 是斜邊，小明把斜邊和股的平方相加，得到 √194 ≈ 13.9 比斜邊還長，不合理。',
      '接受直接寫 x ＝ √(13² − 5²) ＝ 12；用「√194 比斜邊長」說明不合理也算理由。',
    ),
  },
  'g8-2-3b': {
    'b-error-q': kai(
      ['指出 9 × 12 ÷ 2 ＝ 54 是面積不是高，求出斜邊 15，h ＝ 9 × 12 ÷ 15 ＝ 36/5，並用面積兩種算法說明', '答案 36/5（或 7.2）正確但理由不完整，或理由正確但計算有一處小錯', '只指出「錯了」或只求出斜邊 15，沒有正確的高與理由', '空白、同意 54，或沒有任何正確內容'],
      '斜邊 ＝ √(81 ＋ 144) ＝ 15。½ × 15 × h ＝ ½ × 9 × 12 ＝ 54，h ＝ 108 ÷ 15 ＝ 36/5（＝ 7.2）。54 是面積，不是高。',
      '接受「斜邊上的高 ＝ 兩股乘積 ÷ 斜邊」的寫法；7.2 與 36/5 都正確。',
    ),
  },
  'g8-2-3c': {
    'c-error-q': kai(
      ['圈出 x 坐標的差寫成 3 − 1 的錯誤，寫出 3 − (−1) ＝ 4、AB ＝ √(16 ＋ 9) ＝ 5，並說明減去負數要變號', 'AB ＝ 5 正確但理由不完整，或理由正確但計算有一處小錯', '只指出「錯了」或只改對坐標差，沒有正確答案與理由', '空白、同意 √13，或沒有任何正確內容'],
      'AB ＝ √((3 − (−1))² ＋ (−1 − 2)²) ＝ √(16 ＋ 9) ＝ √25 ＝ 5。小美漏了 −1 的負號。',
      '接受前減後的寫法 (−1 − 3)² ＋ (2 − (−1))²；在方格上數出 4 格與 3 格說明也算理由。',
    ),
  },
};

// 只用課本原題（換數字題拿掉）：題目 ID → 保留前幾小題（2026-10-21 老師課堂回饋，與 2-2、1-4 相同）
textbookOnly([lessonA, lessonB, lessonC], {
  'a-ex1-practice-q': 2,
  'a-ex2-practice-q': 1,
  'b-ex3-practice-q': 2,
  'b-ex4-practice-q': 2,
  'b-ex5-practice-q': 1,
  'c-ex8-practice-q': 1,
});

// 補救練習：課堂上派的是答錯的課本原題（10-21 起不另外寫換數字的補救題庫）；practice 只留著一起核算答案
for (const lesson of [lessonA, lessonB, lessonC]) {
  const file = join(root, 'content/lessons', `${lesson.id}.json`);
  await writeFile(file, JSON.stringify(lesson, null, 2) + '\n');
  console.log(`寫入 ${file}（${lesson.slides.length} 頁）`);
  // 會考式規準：保留 photo-work.mjs 寫入的 photo 欄位
  const wfile = join(root, 'content/written', `${lesson.id}.json`);
  const old = await readFile(wfile, 'utf8').then(JSON.parse, () => ({}));
  await writeFile(wfile, JSON.stringify({ rubrics: written[lesson.id], ...(old.photo ? { photo: old.photo } : {}) }, null, 2) + '\n');
}
await writeFile(join(root, 'scripts/lessons-src/g8-2-3-checks.json'), JSON.stringify(checks, null, 1) + '\n');
console.log(`換數字題 ${Object.values(practice).reduce((n, p) => n + Object.keys(p).length * 3, 0)} 題（只核算，不放進課程）；待核算答案 ${checks.length} 筆 → python -X utf8 scripts/lessons-src/g8-2-3-check.py`);
