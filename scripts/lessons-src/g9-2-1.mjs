// 九上 2-1 點、直線與圓之間的位置關係：由 agent 依課本與教用版答案製作的 3 堂課。
// 來源清單：content/sources/g9-2-1-inventory.json（每題頁碼、題目、官方答案、截圖檔）。
// 產生：node scripts/lessons-src/g9-2-1.mjs  → content/lessons/g9-2-1*.json，再執行 npm run lessons 驗證。
// 例題、隨堂、錯誤分析的視覺化依課本解法逐步呈現（左圖右式）；隨堂的示範用另一組數字（自編），錯誤分析留「？」。
// 圓的視覺化樣板在 viz-g9-2-1.mjs；補救練習在 content/practice/g9-2-1*.json（scripts/lessons-src/g9-2-1-practice.py 產生）。
import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as V from './viz.mjs';
import * as O from './viz-g9-2-1.mjs';
import { textbookOnly } from './textbook-only.mjs';

const { G, C } = V;
const { circ, on, sector, bow, arcLine, rightAt, dot } = O;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fig = (file, alt, caption) => ({ src: `g9-2-1/${file}`, alt, ...(caption ? { caption } : {}) });
const src = (p) => `對應課本 2-1 p.${p}（題目數字同課本）`;
const srcVar = (p) => `對應課本 2-1 p.${p}；第 1 題為課本隨堂，其餘為換數字題（自編）`;
const num = (id, prompt, items, explanation, extra = {}) => ({
  id,
  type: 'numeric',
  prompt,
  items: items.map(([p, a, tol]) => ({ prompt: p, answer: a, ...(tol ? { tolerance: tol } : {}) })),
  explanation,
  ...extra,
});
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
/** 給圖形加上 focus（哪幾步發光）。 */
const F = (shapes, focus) => [shapes].flat().map((s) => ({ ...s, focus }));
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const GREEN = 'rgba(132,204,22,.30)';

/* ───────────── 圖形（座標：x 0–20、y 0–11；左邊放圖，右邊放算式） ───────────── */
const VIEW = { xMin: 0, xMax: 20, yMin: 0, yMax: 11, aspect: 'equal' };
const oLab = (c, dx = -0.45, dy = 0.4) => [dot(c), G.lab(c[0] + dx, c[1] + dy, 'O', { size: 15 })];

/** 扇形題的圖：圓心 c、半徑 R，扇形從 a0 到 a1 度。 */
function sectorFig({ c = [5, 5.4], R = 4, a0, a1, names = ['A', 'B'], rLab, angLab, fill = GREEN, focusArc, focusRad, focusFill, last }) {
  const A = on(c, R, a0), B = on(c, R, a1);
  const f = (x) => (x ? [...x, last] : undefined);
  const sh = [
    circ(c[0], c[1], R),
    { ...sector(c, R, a0, a1, { fill, color: 'rgba(0,0,0,0)', width: 0.5 }), ...(focusFill ? { focus: f(focusFill) } : {}) },
    ...arcLine(c, R, a0, a1, { color: C.red, width: 4 }).map((s) => (focusArc ? { ...s, focus: f(focusArc) } : s)),
    { ...G.seg(c, A, { color: C.blue, width: 3 }), ...(focusRad ? { focus: f(focusRad) } : {}) },
    { ...G.seg(c, B, { color: C.blue, width: 3 }), ...(focusRad ? { focus: f(focusRad) } : {}) },
    ...oLab(c, 0.15, 0.5),
    G.lab(...on(c, R + 0.5, a0), names[0], { size: 15 }),
    G.lab(...on(c, R + 0.5, a1), names[1], { size: 15 }),
  ];
  // 半徑標籤：放在 OA 中點、往扇形外側（a0 − 90° 方向）偏一點，不壓到角度
  if (rLab) sh.push(G.lab(...on(on(c, R * 0.55, a0), 0.55, a0 - 90), rLab, { size: 14, color: '#1d4fa3' }));
  if (angLab) sh.push(G.angle(A, c, B, angLab));
  return sh;
}

/* ───────────────────── 第 1 堂：圓、弧長與扇形面積 ───────────────────── */
const termsFig = () => {
  const c = [5, 5.4], R = 4;
  const A = on(c, R, 60), E1 = on(c, R, 120), E2 = on(c, R, 215), S1 = on(c, R, 290), S2 = on(c, R, 345);
  return [
    circ(c[0], c[1], R),
    ...F(oLab(c, -0.2, -0.5), [0, 5]),
    ...F(G.seg(c, A, { color: C.red, width: 3 }), [0, 5]),
    ...F(G.lab(...on(c, 2.3, 75), '半徑', { size: 13, color: C.red }), [0, 5]),
    ...F(G.seg([c[0] - R, c[1]], [c[0] + R, c[1]], { color: C.blue, width: 2.6 }), [1, 5]),
    ...F(G.lab(c[0] + 2.4, c[1] - 0.45, '直徑', { size: 13, color: C.blue }), [1, 5]),
    ...F(G.seg(E1, E2, { color: '#5a3fd6', width: 2.6 }), [1, 3, 5]),
    ...F(G.lab(...on(c, 2.4, 160), '弦', { size: 13, color: '#5a3fd6' }), [1, 5]),
    ...F(arcLine(c, R, 120, 215, { color: C.teal, width: 4 }), [2, 5]),
    ...F(G.lab(...on(c, R + 0.75, 168), '劣弧', { size: 13, color: '#0f766e' }), [2, 5]),
    ...F(G.lab(...on(c, R + 0.6, 20), '優弧', { size: 13, color: '#b4541a' }), [2, 5]),
    ...F(bow(c, R, 120, 215, { fill: 'rgba(123,97,255,.22)', color: 'rgba(0,0,0,0)', width: 0.5 }), [3, 5]),
    ...F(G.lab(...on(c, 3.3, 168), '弓形', { size: 12, color: '#5a3fd6' }), [3, 5]),
    ...F(sector(c, R, 290, 345, { fill: C.fOrange, color: C.orange }), [4, 5]),
    ...F(G.angle(S1, c, S2, ''), [4, 5]),
    ...F(G.lab(...on(c, 2.9, 318), '扇形', { size: 12, color: '#b4541a' }), [4, 5]),
  ];
};

const lessonA = {
  schemaVersion: 1,
  id: 'g9-2-1a',
  title: '2-1 點、直線與圓之間的位置關係（1）圓、弧長與扇形面積',
  description: '認識圓的名詞（弦、直徑、弧、弓形、圓心角、扇形），拖拉圓心角看見「扇形是整個圓的 x/360」，用弧長與扇形面積公式解例 1～例 3（含弓形）。例題與隨堂附課本截圖，解題過程逐步呈現，隨堂改為可即時批改的 IRS。',
  subject: '數學・九年級 2-1',
  duration: 45,
  objectives: ['能說出弦、直徑、弧、弓形、圓心角、扇形的意義', '能用弧長＝2πr×x/360、扇形面積＝πr²×x/360 計算，或由面積、弧長反求圓心角', '能用「扇形－三角形」求弓形面積，並求弓形周長'],
  slides: [
    {
      id: 'a-warmup',
      phase: '提取練習',
      eyebrow: '01 / 先想起圓周長與圓面積',
      title: '圓周長 ＝ 2πr，圓面積 ＝ πr²',
      body: '國小學過圓周長與圓面積，國中用 π 表示圓周率。先暖身三題，答案含 π 時只填 π 前面的數。',
      source: '銜接國小圓周長、圓面積（課本 p.88）',
      interactive: {
        view: VIEW,
        shapes: [
          circ(5, 5.4, 4, { fill: 'rgba(255,138,61,.16)', color: C.red, width: 2.6 }),
          ...oLab([5, 5.4], -0.2, -0.5),
          G.seg([5, 5.4], [9, 5.4], { color: C.blue, width: 3 }),
          G.lab(7, 5.9, 'r', { size: 16, color: '#1d4fa3' }),
          G.lab(14.6, 7.6, String.raw`圓周長 $=2\pi r$`, { size: 22, color: C.red }),
          G.lab(14.6, 5.6, String.raw`圓面積 $=\pi r^{2}$`, { size: 22, color: '#b4541a' }),
          G.lab(14.6, 3.6, '周角 ＝ 360°', { size: 20, color: '#5a3fd6' }),
        ],
        caption: 'π 讀作「ㄆㄞˋ」，是圓周長與直徑的比值，約 3.14',
      },
      activity: num(
        'a-warmup-q',
        '暖身：直接寫出答案',
        [
          ['半徑 3 的圓，周長 ＝ □π，□ ＝ ？', '6'],
          ['半徑 5 的圓，面積 ＝ □π，□ ＝ ？', '25'],
          ['90° 是周角 360° 的幾分之幾？', '1/4'],
        ],
        '(1) 2π×3＝6π。(2) π×5²＝25π。(3) 90/360＝1/4。',
      ),
      notes: '提取練習：第 3 題為預測頁鋪路（圓心角占周角的幾分之幾）。',
    },
    {
      id: 'a-predict',
      phase: '預測',
      eyebrow: '02 / 先猜',
      title: '扇形占整個圓的多少？',
      body: '把圓沿兩條半徑剪下一塊，圓心角 90°。這塊扇形的面積，是整個圓面積的幾分之幾？先猜，等一下拖拉驗證。',
      source: '對應課本 p.88 的問題（自編題）',
      visual: 'cards',
      activity: {
        id: 'a-predict-q',
        type: 'single',
        prompt: '圓心角 90° 的扇形，面積是整個圓的？',
        options: ['1/2', '1/4', '1/90', '1/360'],
        correct: [1],
        explanation: '圓心角 90° 是周角 360° 的 90/360＝1/4，扇形面積也是整個圓的 1/4。',
      },
      notes: '先公布統計、不公布答案，保留疑問到具體操作頁。',
    },
    {
      id: 'a-terms',
      phase: '概念建立',
      eyebrow: '03 / 圓的名詞',
      title: '弦、直徑、弧、弓形、圓心角、扇形',
      body: '按「下一步」一個一個看：每個名詞都對應圖上的一部分。對照課本的定義。',
      source: '對應課本 2-1 p.86–87',
      figures: [fig('terms-1.png', '課本 p.86 圓、弦的定義'), fig('terms-2.png', '課本 p.86 弧、優弧、劣弧'), fig('terms-3.png', '課本 p.87 弓形、圓心角、扇形')],
      interactive: V.figSteps({
        view: VIEW,
        figure: termsFig(),
        top: 9.4,
        x: 14.8,
        gap: 1.55,
        size: 17,
        lines: ['圓心 O；半徑：O 到圓上一點', '弦：圓上兩點的連線段', '弧：優弧（大）、劣弧（小）', '弓形：一弦和一弧圍成', '扇形：兩半徑和一弧圍成', '圓心角：頂點在圓心 O'],
        captions: ['和圓心 O 距離相等的點組成圓；OA 是半徑', '弦；通過圓心的弦是直徑（最長的弦）', '弦把圓分成兩段弧：大的是優弧、小的是劣弧', '弓形：弦與弧所圍成', '扇形：兩半徑與弧所圍成，夾的角是圓心角', '六個名詞一起看'],
      }),
      activity: {
        id: 'a-terms-q',
        type: 'single',
        prompt: '一條弦（不是直徑）把圓分成兩段弧，較小的那一段叫做？',
        options: ['優弧', '劣弧', '半圓', '弓形'],
        correct: [1],
        explanation: '較大的弧是優弧、較小的是劣弧；弦是直徑時，兩段弧一樣大，叫半圓。弓形是「弦和弧圍成的圖形」，不是弧。',
      },
      notes: '劣弧通常寫成 AB 上加弧號；優弧要在弧上另取一點 C，寫成 ACB。',
    },
    {
      id: 'a-terms-practice',
      phase: '隨堂練習',
      eyebrow: '04 / 名詞 隨堂',
      title: '分辨圓心角、弦、弓形、扇形',
      body: '課本 p.87 隨堂 1、2。選出所有正確的敘述（可複選），注意弓形和扇形的差別。',
      source: src(87),
      figures: [fig('terms-practice.png', '課本 p.87 隨堂練習')],
      activity: {
        id: 'a-terms-practice-q',
        type: 'multiple',
        prompt: '課本 p.87 隨堂：選出所有正確的敘述',
        options: ['1. 圓心角是 (B) ∠COD', '1. 圓心角是 (C)', '2. 連接圓上任兩點的線段：弦', '2. 圓的一弦和一弧所圍成的圖形：扇形', '2. 通過圓心的弦：直徑', '2. 兩半徑和一弧所圍成的圖形：扇形'],
        correct: [0, 2, 4, 5],
        explanation: '圓心角的頂點要在圓心：只有 (B)。一弦和一弧圍成的是弓形，兩半徑和一弧圍成的才是扇形。',
      },
      notes: '官方答案：1. (B)；2. 弦、弓形、直徑、扇形。(A) 的頂點不在圓心，(C) 的頂點在圓上（2-2 的圓周角）。',
    },
    {
      id: 'a-explore',
      phase: '具體操作',
      eyebrow: '05 / 拖拉圓心角',
      title: '圓心角變大，扇形跟著變大',
      body: '拖拉圓心角 x 和半徑 r：扇形占整個圓的 x/360，弧長、面積也都是整個圓的 x/360。',
      source: '補充（非課本）：扇形的動態示意，對應課本 p.88',
      interactive: O.sectorExplore({ r: 4, a: 60 }),
      activity: {
        id: 'a-explore-q',
        type: 'manipulate',
        prompt: '把圓心角調到「扇形面積是整個圓的 1/3」，再按「送出我的操作」。',
        check: 'a==120',
        record: ['a', 'r'],
        explanation: '360° × 1/3 ＝ 120°：圓心角 120° 的扇形是整個圓的 120/360＝1/3（和半徑無關）。',
      },
      notes: '具體操作（CRA）。追問：半徑變大時，「占整個圓的幾分之幾」會變嗎？（不會，只看圓心角）',
    },
    {
      id: 'a-formula',
      phase: '圖式連結',
      eyebrow: '06 / 跟著課本推導',
      title: '弧長與扇形面積的公式',
      body: '圓心角 x° 是周角的 x/360，所以弧長、扇形面積都是整個圓的 x/360。按「下一步」看推導。',
      source: src(88),
      figures: [fig('arc-explain.png', '課本 p.88 圓心角是周角的 x/360'), fig('keybox-arc.png', '課本 p.88 Key point 弧長與扇形面積'), fig('arc-fan.png', '課本 p.88 弧長與扇形面積圖解')],
      interactive: V.figSteps({
        view: VIEW,
        figure: sectorFig({ a0: 20, a1: 95, rLab: 'r', angLab: 'x°', focusArc: [1, 2], focusFill: [3, 4], last: 4 }),
        top: 9.8,
        x: 14.6,
        gap: 1.8,
        lines: [String.raw`圓心角是周角的 $\dfrac{x}{360}$`, String.raw`弧長 ＝ 圓周長 × $\dfrac{x}{360}$`, String.raw`$=2\pi r\times\dfrac{x}{360}$`, String.raw`扇形面積 ＝ 圓面積 × $\dfrac{x}{360}$`, String.raw`$=\pi r^{2}\times\dfrac{x}{360}$`],
        captions: ['周角是 360°', '紅色的弧是圓周長的 x/360', '圓周長 2πr', '橘色的扇形是圓面積的 x/360', '圓面積 πr²：課本的 Key point'],
      }),
      activity: { id: 'a-formula-q', type: 'single', prompt: '半徑 6、圓心角 60° 的扇形，弧長是？', options: ['2π', '6π', 'π', '12π'], correct: [0], explanation: '2π×6×60/360＝12π×1/6＝2π。6π 是扇形面積（π×36×1/6）。' },
      notes: '圖式連結：拖拉（具體）→ 公式（抽象）。提醒弧長公式是 2πr、面積公式是 πr²，不要混用。',
    },
    {
      id: 'a-ex1',
      phase: '工作範例',
      eyebrow: '07 / 例 1',
      title: '求弧長、扇形周長和面積',
      body: '扇形周長＝弧長＋兩條半徑。答案含 π 時只填 π 前面的數。先自己算，再按「下一步」。',
      source: src(89),
      figures: [fig('ex1.png', '課本 p.89 例 1 題目')],
      interactive: V.figSteps({
        view: VIEW,
        figure: sectorFig({ a0: 180, a1: 240, rLab: '10', angLab: '60°', focusArc: [0, 1, 2, 3], focusRad: [2, 3], focusFill: [4, 5], last: 5 }),
        top: 10,
        x: 14.6,
        gap: 1.6,
        lines: [
          String.raw`(1) 弧長 $=2\pi\times10\times\dfrac{60}{360}$`,
          String.raw`$=\dfrac{10}{3}\pi$`,
          String.raw`(2) 周長 ＝ 弧長 ＋ $\overline{OA}+\overline{OB}$`,
          String.raw`$=\dfrac{10}{3}\pi+20$`,
          String.raw`(3) 面積 $=\pi\times10^{2}\times\dfrac{60}{360}$`,
          String.raw`$=\dfrac{50}{3}\pi$`,
        ],
        captions: ['弧長＝圓周長 × 60/360', '約分：20π × 1/6', '扇形周長：弧長再加兩條半徑', '10＋10＝20', '扇形面積＝圓面積 × 60/360', '100π × 1/6'],
        caption: '課本例 1 的方法',
      }),
      activity: num(
        'a-ex1-q',
        '先自己算例 1',
        [
          ['弧 AB 的長 ＝ □π，□ ＝ ？', '10/3'],
          ['扇形 AOB 的周長 ＝ (10/3)π ＋ □，□ ＝ ？', '20'],
          ['扇形 AOB 的面積 ＝ □π，□ ＝ ？', '50/3'],
        ],
        '(1) 2π×10×60/360＝10/3 π。(2) 10/3 π＋10＋10＝10/3 π＋20。(3) π×10²×60/360＝50/3 π。',
      ),
      notes: '常見錯誤：周長忘了加兩條半徑；面積用了 2πr。計算機操作見課本書末 [6]。',
    },
    {
      id: 'a-ex1-practice',
      phase: '隨堂練習',
      eyebrow: '08 / 例 1 隨堂',
      title: '換你算：弧長、周長、面積',
      body: '三題都是課本隨堂（半徑 8、圓心角 135°）。左圖用另一組數字示範同樣的步驟。',
      source: src(89),
      figures: [fig('ex1-practice.png', '課本 p.89 例 1 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: sectorFig({ a0: 60, a1: 90, rLab: '12', angLab: '30°', names: ['P', 'Q'] }),
        top: 9.6,
        x: 14.6,
        gap: 1.65,
        lines: ['示範：半徑 12、圓心角 30°', String.raw`弧長 $=2\pi\times12\times\dfrac{30}{360}=2\pi$`, String.raw`周長 $=2\pi+12+12=2\pi+24$`, String.raw`面積 $=\pi\times12^{2}\times\dfrac{30}{360}=12\pi$`],
        captions: ['另一組數字（自編）', '圓周長 × 30/360', '弧長＋兩條半徑', '圓面積 × 30/360'],
      }),
      activity: num(
        'a-ex1-practice-q',
        '課本 p.89 隨堂：半徑 8、∠COD＝135°',
        [
          ['弧 CD 的長 ＝ □π，□ ＝ ？', '6'],
          ['扇形 COD 的周長 ＝ 6π ＋ □，□ ＝ ？', '16'],
          ['扇形 COD 的面積 ＝ □π，□ ＝ ？', '24'],
        ],
        '(1) 2π×8×135/360＝6π。(2) 6π＋8＋8＝6π＋16。(3) π×8²×135/360＝24π。',
      ),
      notes: '答案：(1) 6π (2) 6π＋16 (3) 24π。135/360＝3/8。',
    },
    {
      id: 'a-ex2',
      phase: '工作範例',
      eyebrow: '09 / 例 2',
      title: '已知扇形面積或弧長，求圓心角',
      body: '把公式倒過來用：設圓心角 x°，列方程式。先自己算，再按「下一步」。',
      source: src(90),
      figures: [fig('ex2.png', '課本 p.90 例 2 題目')],
      interactive: V.figSteps({
        view: VIEW,
        figure: [
          ...F(sectorFig({ c: [2.9, 7.7], R: 2.3, a0: 210, a1: 330, rLab: '12', angLab: 'x°', names: ['', ''], fill: C.fOrange }), [0, 1, 4]),
          ...F(G.lab(2.9, 6.3, '48π', { size: 13, color: '#b4541a' }), [0, 1, 4]),
          ...F([circ(6.6, 3.2, 2.3), ...arcLine([6.6, 3.2], 2.3, 40, 100, { color: C.red, width: 4 }), G.seg([6.6, 3.2], on([6.6, 3.2], 2.3, 40), { color: C.blue, width: 2.4 }), G.seg([6.6, 3.2], on([6.6, 3.2], 2.3, 100), { color: C.blue, width: 2.4 }), G.angle(on([6.6, 3.2], 2.3, 40), [6.6, 3.2], on([6.6, 3.2], 2.3, 100), 'y°'), dot([6.6, 3.2]), G.lab(...on([6.6, 3.2], 3.0, 70), '5π', { size: 13, color: C.red }), G.lab(...on([6.6, 3.2], 1.3, 5), '15', { size: 13, color: '#1d4fa3' })], [2, 3, 4]),
        ].flat(),
        top: 9.6,
        x: 14.8,
        gap: 1.75,
        lines: [String.raw`(1) $\pi\times12^{2}\times\dfrac{x}{360}=48\pi$`, String.raw`$144\times\dfrac{x}{360}=48$，x ＝ 120`, String.raw`(2) $2\pi\times15\times\dfrac{y}{360}=5\pi$`, String.raw`$30\times\dfrac{y}{360}=5$，y ＝ 60`, String.raw`也可以：$\dfrac{48\pi}{144\pi}=\dfrac13$，$360°\times\dfrac13=120°$`],
        captions: ['扇形面積公式，圓心角設 x°', '兩邊同除以 π，解方程式', '弧長公式，圓心角設 y°', '兩邊同除以 π', '課本 Hint：先算占整個圓的幾分之幾'],
        caption: '課本例 2 的方法',
      }),
      activity: num(
        'a-ex2-q',
        '先自己算例 2（寫度數）',
        [
          ['(1) 扇形面積 48π、半徑 12，圓心角幾度？', '120'],
          ['(2) 半徑 15、弧長 5π，圓心角幾度？', '60'],
        ],
        '(1) π×144×x/360＝48π，x＝120。(2) 2π×15×y/360＝5π，y＝60。',
      ),
      notes: '可以比較兩種做法：列方程式，或先求「占整個圓的幾分之幾」再乘 360°。',
    },
    {
      id: 'a-ex2-practice',
      phase: '隨堂練習',
      eyebrow: '10 / 例 2 隨堂',
      title: '換你算：反求圓心角',
      body: '前兩題是課本隨堂，第 3 題換數字。左圖用另一組數字示範。',
      source: srcVar(90),
      figures: [fig('ex2-practice.png', '課本 p.90 例 2 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: [...sectorFig({ a0: 250, a1: 286, rLab: '10', angLab: 'x°', fill: C.fOrange }), G.lab(5.6, 2.3, '10π', { size: 13, color: '#b4541a' })],
        top: 9.4,
        x: 14.8,
        gap: 1.7,
        lines: ['示範：扇形面積 10π、半徑 10', String.raw`$\pi\times10^{2}\times\dfrac{x}{360}=10\pi$`, String.raw`$100\times\dfrac{x}{360}=10$`, 'x ＝ 36'],
        captions: ['另一組數字（自編）', '扇形面積公式', '兩邊同除以 π', '圓心角 36°'],
      }),
      activity: num(
        'a-ex2-practice-q',
        '課本 p.90 隨堂：求圓心角（寫度數）',
        [
          ['(1) 扇形面積 2π、半徑 4，圓心角幾度？', '45'],
          ['(2) 半徑 9、弧長 2π，圓心角幾度？', '40'],
          ['扇形面積 6π、半徑 6，圓心角幾度？', '60'],
        ],
        '(1) π×16×x/360＝2π，x＝45。(2) 2π×9×y/360＝2π，y＝40。(3) π×36×x/360＝6π，x＝60。',
      ),
      notes: '答案：(1) 45° (2) 40° (3) 60°。常見錯誤：(2) 用了面積公式。',
    },
    {
      id: 'a-ex3',
      phase: '工作範例',
      eyebrow: '11 / 例 3',
      title: '求弓形的面積與周長',
      body: '弓形＝扇形－三角形；弓形周長＝弧長＋弦長。先自己算，再按「下一步」。',
      source: src(91),
      figures: [fig('ex3.png', '課本 p.91 例 3 題目')],
      interactive: V.figSteps({
        view: VIEW,
        figure: (() => {
          const c = [5, 5.6], R = 4, A = on(c, R, 270), B = on(c, R, 0);
          return [
            circ(c[0], c[1], R),
            ...F({ ...sector(c, R, 270, 360, { fill: C.fOrange, color: 'rgba(0,0,0,0)', width: 0.5 }) }, [0, 1, 2, 5]),
            ...F(G.poly([c, A, B], { fill: 'rgba(255,255,255,.75)', color: C.ink, width: 2 }), [0, 1, 2, 5]),
            ...F(bow(c, R, 270, 360, { fill: C.fBlue, color: C.blue }), [0, 2, 3, 5]),
            ...F(arcLine(c, R, 270, 360, { color: C.red, width: 4 }), [3, 4, 5]),
            ...F(G.seg(A, B, { color: '#5a3fd6', width: 3.2 }), [3, 4, 5]),
            ...rightAt(c, A, B, 0.4),
            ...oLab(c, -0.45, 0.35),
            G.lab(A[0], A[1] - 0.5, 'A', { size: 15 }),
            G.lab(B[0] + 0.45, B[1] + 0.2, 'B', { size: 15 }),
            G.lab(7, 6.05, '4', { size: 14, color: '#1d4fa3' }),
          ];
        })(),
        top: 10,
        x: 14.8,
        gap: 1.6,
        lines: [
          '(1) 弓形 ＝ 扇形 AOB － △AOB',
          String.raw`$=\pi\times4^{2}\times\dfrac{90}{360}-\dfrac12\times4\times4$`,
          String.raw`$=4\pi-8$`,
          String.raw`(2) 弓形周長 ＝ 弧 AB ＋ $\overline{AB}$`,
          String.raw`$=2\pi\times4\times\dfrac{90}{360}+\sqrt{4^{2}+4^{2}}$`,
          String.raw`$=2\pi+4\sqrt2$`,
        ],
        captions: ['課本 Hint：弓形＝扇形－直角三角形', '扇形面積 4π、△AOB 面積 8', '弓形面積', '弓形的周長是弧加弦', '弦 AB 用畢氏定理', '弓形周長'],
        caption: '課本例 3 的方法',
      }),
      activity: num(
        'a-ex3-q',
        '先自己算例 3（最簡根式）',
        [
          ['扇形 AOB 的面積 ＝ □π，□ ＝ ？', '4'],
          ['△AOB 的面積 ＝ ？（弓形面積 ＝ 4π － 這個數）', '8'],
          ['弓形周長 ＝ 2π ＋ □，□ ＝ ？', '4√2'],
        ],
        '(1) π×16×90/360＝4π。(2) ½×4×4＝8，弓形面積＝4π－8。(3) 弧長 2π×4×90/360＝2π，弦 AB＝√(4²＋4²)＝4√2，周長＝2π＋4√2。',
        { form: 'simplest-radical' },
      ),
      notes: '弓形周長常漏掉弦長，或把弦長寫成半徑 4。',
    },
    {
      id: 'a-ex3-practice',
      phase: '隨堂練習',
      eyebrow: '12 / 例 3 隨堂',
      title: '換你算：正三角形的弓形',
      body: '三小題由課本隨堂拆出（半徑 6、△COD 正三角形）。正三角形面積＝(√3/4)a²。左圖用另一組數字示範。',
      source: src(91),
      figures: [fig('ex3-practice.png', '課本 p.91 例 3 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: (() => {
          const c = [5, 5.6], R = 4, Cc = on(c, R, 270), D = on(c, R, 330);
          return [
            circ(c[0], c[1], R),
            G.poly([c, Cc, D], { fill: 'rgba(255,255,255,0)', color: C.ink, width: 2 }),
            bow(c, R, 270, 330, { fill: C.fBlue, color: C.blue }),
            G.angle(Cc, c, D, '60°'),
            ...oLab(c, -0.45, 0.35),
            G.lab(Cc[0], Cc[1] - 0.5, 'C', { size: 15 }),
            G.lab(D[0] + 0.4, D[1] - 0.2, 'D', { size: 15 }),
            G.lab(...mid(c, D).map((v, i) => v + [0.3, 0.45][i]), '4', { size: 14, color: '#1d4fa3' }),
          ];
        })(),
        top: 10,
        x: 14.8,
        gap: 1.6,
        lines: ['示範：半徑 4，△COD 是正三角形', '∠COD ＝ 60°', String.raw`扇形 $=\pi\times4^{2}\times\dfrac{60}{360}=\dfrac83\pi$`, String.raw`正△ $=\dfrac{\sqrt3}{4}\times4^{2}=4\sqrt3$`, String.raw`弓形面積 $=\dfrac83\pi-4\sqrt3$`, String.raw`弓形周長 $=\dfrac43\pi+4$`],
        captions: ['另一組數字（自編）', '正三角形每個角 60°', '扇形面積', '學習時光機：正三角形面積', '扇形－正三角形', '弧長 2π×4×1/6＋弦長 4'],
      }),
      activity: num(
        'a-ex3-practice-q',
        '課本 p.91 隨堂：半徑 6、△COD 正三角形（最簡根式）',
        [
          ['扇形 COD 的面積 ＝ □π，□ ＝ ？', '6'],
          ['正△COD 的面積 ＝ ？（弓形面積 ＝ 6π － 這個數）', '9√3'],
          ['弓形周長 ＝ 2π ＋ □，□ ＝ ？', '6'],
        ],
        '(1) π×36×60/360＝6π。(2) √3/4×6²＝9√3，弓形面積＝6π－9√3。(3) 弧長 2π×6×60/360＝2π，弦 CD＝6，周長＝2π＋6。',
        { form: 'simplest-radical' },
      ),
      notes: '官方答案：(1) 6π－9√3 (2) 2π＋6。正三角形三邊相等，所以弦 CD＝半徑 6。',
    },
    {
      id: 'a-error',
      phase: '錯誤分析',
      eyebrow: '13 / 當小老師',
      title: '小明寫：扇形面積 ＝ 2π × 6 × 120/360 ＝ 4π',
      body: '半徑 6、圓心角 120° 的扇形，小明算出面積 4π。他的答案對嗎？在畫布圈出錯誤、寫出正確算法與理由，也可以拍照上傳。',
      source: '錯誤示例（自編），對應課本 p.88–89',
      interactive: V.figSteps({
        view: VIEW,
        figure: sectorFig({ a0: 210, a1: 330, rLab: '6', angLab: '120°', fill: C.fOrange }),
        top: 9.4,
        x: 14.8,
        gap: 1.7,
        lines: [String.raw`小明：$2\pi\times6\times\dfrac{120}{360}=4\pi$`, '扇形面積是誰的 120/360？', '圓面積 ＝ ？', '扇形面積 ＝ ？'],
        captions: ['小明的算式', '想一想：面積對應圓面積，長度對應圓周長', '用哪一個公式？', '自己算出來'],
      }),
      activity: {
        id: 'a-error-q',
        type: 'canvas',
        prompt: '小明寫「扇形面積＝2π×6×120/360＝4π」。① 圈出錯誤 ② 寫出正確算法與答案 ③ 說明理由（4π 其實是什麼？）',
        canvas: 'grid',
        allowPhoto: true,
        aiAllowed: true,
        rubric: rubric(
          [
            crit('find', '找出錯誤', [[0, '未指出錯誤'], [1, '只說錯了，沒說錯在哪'], [2, '指出用了圓周長 2πr，不是圓面積 πr²']]),
            crit('fix', '正確計算', [[0, '答案錯誤或未作答'], [1, '公式正確但計算錯'], [2, 'π×6²×120/360＝12π']]),
            crit('why', '說明理由', [[0, '沒有理由'], [1, '只寫公式'], [2, '說明扇形面積是圓面積的 120/360；4π 其實是弧長']]),
          ],
          '扇形面積＝圓面積×x/360＝π×6²×120/360＝36π×1/3＝12π。小明用了圓周長 2πr，算出的 4π 是弧長，不是面積。',
          '接受「36π÷3＝12π」等先求幾分之幾的寫法。',
        ),
      },
      notes: '收件後按「AI 批改」，覆核後發回；可對照具體操作頁：弧長和面積是不同的量。',
    },
    {
      id: 'a-exit',
      phase: '出場券',
      eyebrow: '14 / 用自己的話說',
      title: '為什麼都要乘以 x/360？',
      body: '用一到兩句話說明：弧長和扇形面積的公式，為什麼都要乘以 x/360？',
      visual: 'steps',
      bullets: ['說出圓心角和周角 360° 的關係', '說出弧長是誰的幾分之幾', '說出扇形面積是誰的幾分之幾'],
      activity: {
        id: 'a-exit-q',
        type: 'short',
        prompt: '弧長和扇形面積的公式，為什麼都要乘以 x/360？',
        aiAllowed: true,
        rubric: rubric(
          [
            crit('angle', '圓心角與周角', [[0, '沒有提到'], [1, '只說「360 是一圈」'], [2, '說出圓心角 x° 是周角 360° 的 x/360']]),
            crit('whole', '對應的整體', [[0, '沒有說明'], [1, '只說到弧長或面積其中一個'], [2, '弧長是圓周長的 x/360、扇形面積是圓面積的 x/360']]),
          ],
          '圓心角 x° 是周角 360° 的 x/360，所以它所對的弧長是圓周長 2πr 的 x/360，所夾的扇形面積是圓面積 πr² 的 x/360。',
        ),
      },
    },
    reflect('a-reflect', '我能說出圓的名詞，並計算弧長、扇形與弓形的面積'),
  ],
};

/* ───────────────────── 第 2 堂：點、直線與圓的位置關係、切線 ───────────────────── */
const lineAcross = (c, n, d, len) => {
  // 法向量角度 n（度）、離圓心 d 的直線，畫成長 2·len 的線段
  const Fp = on(c, d, n), u = [-Math.sin((n * Math.PI) / 180), Math.cos((n * Math.PI) / 180)];
  return { F: Fp, a: [Fp[0] - u[0] * len, Fp[1] - u[1] * len], b: [Fp[0] + u[0] * len, Fp[1] + u[1] * len] };
};

const lessonB = {
  schemaVersion: 1,
  id: 'g9-2-1b',
  title: '2-1 點、直線與圓之間的位置關係（2）點、直線與圓、切線',
  description: '拖曳點 P、拉動直線，用「到圓心的距離」和半徑 r 比大小，判斷點在圓內／圓上／圓外、直線不相交／相切／割線；理解切線垂直過切點的半徑，再用畢氏定理求切線段長。例題與隨堂附課本截圖，解題過程逐步呈現，隨堂改為可即時批改的 IRS。',
  subject: '數學・九年級 2-1',
  duration: 45,
  objectives: ['能比較 OP 與 r，判斷點與圓的位置關係', '能比較圓心到直線的距離 d 與 r，判斷直線與圓的交點數（不相交、切線、割線）', '能說明圓心與切點的連線垂直切線，並用畢氏定理求切線段長或半徑'],
  slides: [
    {
      id: 'b-warmup',
      phase: '提取練習',
      eyebrow: '01 / 先想起距離與畢氏定理',
      title: '點到直線的距離、畢氏定理',
      body: '七下學過：點到直線的距離是「垂直線段」的長；八上學過畢氏定理。這節課兩個都會用到，先暖身三題。',
      source: '銜接課本 p.85 Are You Ready（七下點到直線距離、八上畢氏定理）',
      interactive: {
        view: VIEW,
        shapes: [
          G.seg([0.6, 2.4], [10, 2.4], { color: C.ink, width: 2 }),
          G.lab(10.2, 2.9, 'L', { size: 15 }),
          G.seg([3.6, 8.6], [3.6, 2.4], { color: C.red, width: 3 }),
          G.seg([3.6, 8.6], [8.2, 2.4], { color: '#6b7394', width: 2, dash: true }),
          ...rightAt([3.6, 2.4], [3.6, 8.6], [8, 2.4]),
          dot([3.6, 8.6]),
          G.lab(3.2, 9.1, 'O', { size: 15 }),
          G.lab(3.3, 1.8, 'P', { size: 15 }),
          G.lab(8.4, 1.8, 'Q', { size: 15 }),
          G.lab(14.8, 7.6, String.raw`O 到 L 的距離 ＝ $\overline{OP}$`, { size: 19, color: C.red }),
          G.lab(14.8, 5.8, '（垂直線段最短）', { size: 16, color: '#4b5478' }),
          G.lab(14.8, 3.8, String.raw`$a^{2}+b^{2}=c^{2}$`, { size: 22, color: '#5a3fd6' }),
        ],
        caption: '垂直線段 OP 比斜線段 OQ 短；直角三角形用畢氏定理',
      },
      activity: num(
        'b-warmup-q',
        '暖身：直接寫出答案',
        [
          ['課本 p.85：AB⊥BC，AB＝9、BC＝12，AC＝？', '15'],
          ['直角三角形斜邊 13、一股 5，另一股＝？', '12'],
          ['坐標平面上 P(6, 8) 到原點 O 的距離＝？', '10'],
        ],
        '(1) √(9²＋12²)＝15。(2) √(13²－5²)＝12。(3) √(6²＋8²)＝10。',
      ),
      notes: 'Are You Ready：O 到 L 的距離是 OP（垂直線段），不是 OQ。',
    },
    {
      id: 'b-predict',
      phase: '預測',
      eyebrow: '02 / 先猜',
      title: '直線離圓心多遠時，剛好碰到圓？',
      body: '一條直線慢慢靠近圓。當「圓心到直線的距離」剛好等於半徑時，直線和圓有幾個交點？先猜，等一下拖拉驗證。',
      source: '對應課本 p.93 的問題（自編題）',
      visual: 'cards',
      activity: {
        id: 'b-predict-q',
        type: 'single',
        prompt: '圓心到直線的距離＝半徑時，直線和圓有幾個交點？',
        options: ['0 個', '1 個', '2 個', '不一定'],
        correct: [1],
        explanation: '距離等於半徑時，垂足 P 剛好在圓上，直線上其他點都在圓外，只有 1 個交點（相切）。',
      },
      notes: '先公布統計、不公布答案，保留疑問到直線的具體操作頁。',
    },
    {
      id: 'b-point',
      phase: '具體操作',
      eyebrow: '03 / 拖曳點 P',
      title: '點在圓內、圓上，還是圓外？',
      body: '拖曳點 P，看 OP 和半徑 r 的大小關係。圓把平面分成三部分：內部、圓周、外部。',
      source: src(92),
      figures: [fig('point-circle.png', '課本 p.92 點與圓的位置關係')],
      interactive: O.pointExplore({ r: 5, P: [2, 1] }),
      activity: {
        id: 'b-point-q',
        type: 'manipulate',
        prompt: '把 P 拖到圓上，但不要放在水平或鉛直的方向上（提示：3、4、5），再按「送出我的操作」。',
        check: 'Px^2+Py^2==25 && Px*Py!=0',
        record: ['Px', 'Py'],
        explanation: '例如 P(3, 4)：OP＝√(3²＋4²)＝5＝r，P 在圓上。',
      },
      notes: '具體操作（CRA）。追問：怎麼不用量就知道 P 在圓上？（用畢氏定理算 OP）',
    },
    {
      id: 'b-point-practice',
      phase: '隨堂練習',
      eyebrow: '04 / 點與圓 隨堂',
      title: '換你判斷：五個點在哪裡？',
      body: '課本 p.92 隨堂 1、2 合在一起：看課本的圖，選出所有正確的敘述（可複選）。左圖用另一組點示範。',
      source: src(92),
      figures: [fig('point-practice.png', '課本 p.92 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: (() => {
          const c = [5, 5.6], X = on(c, 1.8, 35), Y = on(c, 3, 150), Z = on(c, 4.1, 265);
          return [
            circ(c[0], c[1], 3, { fill: 'rgba(255,201,60,.22)', color: C.red, width: 2.4 }),
            ...oLab(c, -0.3, -0.5),
            ...F([G.seg(c, X, { color: C.blue, width: 2.4 }), dot(X, { color: C.red }), G.lab(X[0] + 0.4, X[1] + 0.3, 'X', { size: 15 })], [1, 3]),
            ...F([G.seg(c, Y, { color: C.blue, width: 2.4 }), dot(Y, { color: C.red }), G.lab(Y[0] - 0.4, Y[1] + 0.35, 'Y', { size: 15 })], [2, 3]),
            ...F([G.seg(c, Z, { color: C.blue, width: 2.4 }), dot(Z, { color: C.red }), G.lab(Z[0] + 0.45, Z[1], 'Z', { size: 15 })], [3]),
          ];
        })(),
        top: 9.2,
        x: 14.8,
        gap: 1.7,
        lines: ['示範：半徑 r ＝ 3', 'OX ＝ 1.8 ＜ 3 → X 在圓內', 'OY ＝ 3 ＝ r → Y 在圓上', 'OZ ＝ 4.1 ＞ 3 → Z 在圓外'],
        captions: ['另一組點（自編）', '比半徑小：圓內', '等於半徑：圓上', '比半徑大：圓外'],
      }),
      activity: {
        id: 'b-point-practice-q',
        type: 'multiple',
        prompt: '課本 p.92 隨堂：選出所有正確的敘述',
        options: ['D、E 在圓外', 'B、C 在圓上', 'A 在圓外', 'BO ＞ r', 'DO ＞ r', 'AO ＝ r'],
        correct: [0, 1, 4],
        explanation: 'D、E 在圓外（DO、EO＞r），B、C 在圓上（BO＝CO＝r），A 在圓內（AO＜r）。',
      },
      notes: '官方答案：1.(1) D、E (2) B、C (3) A；2. AO＜r、BO＝r、CO＝r、DO＞r、EO＞r。',
    },
    {
      id: 'b-line',
      phase: '具體操作',
      eyebrow: '05 / 拉動直線',
      title: '直線與圓：比較 d 和 r',
      body: '拉動圓心到直線的距離 d（P 是垂足），也可以改半徑和直線方向，看交點有幾個。',
      source: src(93),
      figures: [fig('line-1.png', '課本 p.93 直線與圓不相交、交於兩點'), fig('line-2.png', '課本 p.93 直線與圓相切')],
      interactive: O.lineExplore({ d: 6, t: 45, r: 4 }),
      activity: {
        id: 'b-line-q',
        type: 'manipulate',
        prompt: '把直線調成圓的切線（d 和 r 要有什麼關係？），再按「送出我的操作」。',
        check: 'd==r',
        record: ['d', 'r', 't'],
        explanation: 'd＝r 時直線和圓只交於一點，是切線；d＞r 不相交，d＜r 是割線。',
      },
      notes: '具體操作（CRA）。回到預測頁：d＝r 時 1 個交點。請學生說出割線、切線、切點的意思。',
    },
    {
      id: 'b-tangent',
      phase: '圖式連結',
      eyebrow: '06 / 切線的性質',
      title: '切線垂直於過切點的半徑',
      body: '跟著課本 p.94 說明：過圓上一點 P 作 OP 的垂線 L，L 上其他點都在圓外。按「下一步」。',
      source: '對應課本 2-1 p.93–95',
      figures: [fig('tangent-proof.png', '課本 p.94 切線的說明'), fig('keybox-tangent.png', '課本 p.94 Key point 圓的切線性質'), fig('tangent-construct.png', '課本 p.95 隨堂 2 尺規作切線')],
      interactive: V.figSteps({
        view: VIEW,
        figure: (() => {
          const c = [4.4, 5.4], P = [8.2, 5.4], Q = [8.2, 8.8];
          return [
            circ(c[0], c[1], 3.8, { fill: 'rgba(132,204,22,.16)' }),
            ...oLab(c, -0.4, -0.45),
            ...F(G.seg(c, P, { color: C.red, width: 3 }), [0, 2, 3, 4]),
            ...F(G.seg([8.2, 1], [8.2, 10.2], { color: C.ink, width: 2.4 }), [0, 4]),
            ...rightAt(P, c, Q, 0.35),
            dot(P),
            G.lab(8.65, 5.0, 'P', { size: 15 }),
            G.lab(8.65, 10.2, 'L', { size: 15 }),
            ...F([G.seg(c, Q, { color: C.blue, width: 2.2, dash: true }), dot(Q, { color: C.blue }), G.lab(8.65, 8.9, 'Q', { size: 15, color: C.blue })], [1, 2, 3, 4]),
          ];
        })(),
        top: 9.6,
        x: 14.8,
        gap: 1.7,
        lines: [String.raw`$\overline{OP}$ 是半徑，L ⊥ $\overline{OP}$`, 'Q 是 L 上 P 以外的任一點', String.raw`△OPQ 是直角三角形，$\overline{OQ}$ 是斜邊`, String.raw`$\overline{OQ}>\overline{OP}=r$，Q 在圓外`, 'L 和圓只交於 P：L 是切線'],
        captions: ['課本 p.94 說明 (1)', '說明 (2)', '斜邊比股長', '說明 (3)：Q 在圓外', 'Key point：過圓上一點且垂直半徑的直線是切線；反過來，切線垂直過切點的半徑'],
      }),
      activity: {
        id: 'b-tangent-q',
        type: 'single',
        prompt: 'L 是圓 O 的切線、P 是切點，∠OPQ（Q 在 L 上）是幾度？',
        options: ['90°', '60°', '45°', '不一定'],
        correct: [0],
        explanation: '圓心與切點的連線必垂直切線：OP ⊥ L，∠OPQ＝90°。',
      },
      notes: '課本 p.95 隨堂 2（尺規作圖）：連接 OA，過 A 作 OA 的垂線。請學生在課本上作圖，不用 IRS。',
    },
    {
      id: 'b-line-practice',
      phase: '隨堂練習',
      eyebrow: '07 / 直線與圓 隨堂',
      title: '換你判斷：三條直線各有幾個交點？',
      body: '看課本 p.95 的圖寫出交點個數。三題都是課本隨堂 1(1)。左圖用另一組直線示範。',
      source: src(95),
      figures: [fig('line-practice.png', '課本 p.95 隨堂練習 1')],
      interactive: V.figSteps({
        view: VIEW,
        figure: (() => {
          const c = [5, 5.2], R = 2.6;
          const X = lineAcross(c, 90, 3.8, 4.2), Y = lineAcross(c, 0, 2.6, 4.2), Z = lineAcross(c, 225, 1.2, 4.0);
          const L = (l, name, step, color) => F([G.seg(l.a, l.b, { color, width: 2.6 }), G.seg(c, l.F, { color: C.blue, width: 1.8, dash: true }), G.lab(l.b[0] + 0.35, l.b[1] + 0.3, name, { size: 15, color })], [step, 3]);
          return [circ(c[0], c[1], R, { fill: 'rgba(132,204,22,.18)' }), ...oLab(c, -0.4, -0.45), ...L(X, 'X', 1, '#5a3fd6'), ...L(Y, 'Y', 2, C.red), ...L(Z, 'Z', 3, '#16824f')];
        })(),
        top: 9.2,
        x: 14.8,
        gap: 1.7,
        lines: ['示範：比較 d 和 r', 'X：d ＞ r → 0 個交點', 'Y：d ＝ r → 1 個（切線）', 'Z：d ＜ r → 2 個（割線）'],
        captions: ['另一組直線（自編），虛線是圓心到直線的距離', '不相交', '相切', '割線'],
      }),
      activity: num(
        'b-line-practice-q',
        '課本 p.95 隨堂 1(1)：與圓 O 的交點個數',
        [
          ['直線 L 與圓 O 有幾個交點？', '1'],
          ['直線 M 與圓 O 有幾個交點？', '2'],
          ['直線 N 與圓 O 有幾個交點？', '0'],
        ],
        '(1) L 垂直半徑 OA 於 A，是切線，1 個交點。(2) M 穿過圓，是割線，2 個。(3) N 不相交，0 個。',
      ),
      notes: '官方答案：(1) 1、2、0 (2) 切線 L、割線 M (3) r₂＞r＞r₁ (4) 交點數 0、1、2；距離大於、等於、小於半徑。(2)～(4) 口頭完成。',
    },
    {
      id: 'b-ex4',
      phase: '工作範例',
      eyebrow: '08 / 例 4',
      title: '由距離判斷直線與圓的位置',
      body: '先把直徑換成半徑，再拿每條直線的距離和半徑比。先自己判斷，再按「下一步」。',
      source: src(96),
      figures: [fig('ex4.png', '課本 p.96 例 4 題目')],
      interactive: V.figSteps({
        view: VIEW,
        figure: (() => {
          const c = [3, 5.6], k = 0.36, R = 7.5 * k;
          const v = (d, name, color, focus) => F([G.seg([c[0] + d * k, 1.6], [c[0] + d * k, 9.6], { color, width: 2.4 }), G.lab(c[0] + d * k, 10.1, name, { size: 15, color }), G.lab(c[0] + d * k, 1.1, `${d}`, { size: 12, color })], focus);
          return [
            circ(c[0], c[1], R, { fill: 'rgba(255,201,60,.2)' }),
            ...oLab(c, -0.2, 0.45),
            ...F(G.seg(c, [c[0] + R, c[1]], { color: C.blue, width: 2.4 }), [0, 4]),
            ...F(G.lab(c[0] + R / 2, c[1] - 0.45, '7.5', { size: 12, color: '#1d4fa3' }), [0, 4]),
            ...v(15, 'L', '#5a3fd6', [1, 4]),
            ...v(10, 'M', '#5a3fd6', [1, 4]),
            ...v(7.5, 'N', C.red, [2, 4]),
            ...v(5, 'H', '#16824f', [3, 4]),
          ];
        })(),
        top: 9.4,
        x: 14.8,
        gap: 1.7,
        lines: ['直徑 15 → 半徑 r ＝ 7.5', 'L、M：15、10 ＞ 7.5 → 0 個', 'N：7.5 ＝ 7.5 → 1 個，切線', 'H：5 ＜ 7.5 → 2 個，割線', '比的是「半徑」，不是直徑'],
        captions: ['先求半徑', '距離大於半徑：不相交', '距離等於半徑：切線', '距離小於半徑：割線', '圖的下方是圓心到各直線的距離（公分）'],
        caption: '課本例 4 的方法',
      }),
      activity: num(
        'b-ex4-q',
        '先自己判斷例 4：交點個數',
        [
          ['直線 L（距離 15 公分）有幾個交點？', '0'],
          ['直線 N（距離 7.5 公分）有幾個交點？', '1'],
          ['直線 H（距離 5 公分）有幾個交點？', '2'],
        ],
        '半徑 7.5：(1) 15＞7.5，0 個。(2) 7.5＝7.5，1 個（切線）。(3) 5＜7.5，2 個（割線）。',
      ),
      notes: '官方答案：L、M 和圓沒有交點；N 一個交點，是切線；H 兩個交點，是割線。常見錯誤：拿距離和直徑 15 比。',
    },
    {
      id: 'b-ex4-practice',
      phase: '隨堂練習',
      eyebrow: '09 / 例 4 隨堂',
      title: '換你判斷：五條平行線',
      body: '三題都是課本隨堂（寫出有幾條）。O 在 L₂ 上，先算每條線到 O 的距離。左圖用另一組數字示範。',
      source: src(96),
      figures: [fig('ex4-practice.png', '課本 p.96 例 4 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: (() => {
          const c = [4.6, 6.3], ys = [9.3, 7.8, 6.3, 4.8, 3.3];
          const col = [C.red, '#16824f', '#16824f', '#16824f', C.red];
          return [
            circ(c[0], c[1], 3, { fill: 'rgba(255,201,60,.2)', color: C.ink }),
            ...ys.flatMap((y, i) => F([G.seg([0.6, y], [8.6, y], { color: col[i], width: 2.2 }), G.lab(9.1, y, String.raw`$L_${i + 1}$`, { size: 15, color: col[i] })], i === 0 || i === 4 ? [2, 3] : [1, 3])),
            ...oLab(c, 0, -0.45),
          ];
        })(),
        top: 9.4,
        x: 15.2,
        gap: 1.7,
        lines: [String.raw`示範：間距 1.5，r ＝ 3`, String.raw`$L_2$、$L_3$、$L_4$：d ＜ 3，割線`, String.raw`$L_1$、$L_5$：d ＝ 3，切線`, '沒有 d ＞ 3：不相交 0 條'],
        captions: ['另一組數字（自編）：O 在 L₃ 上', 'L₃ 的距離是 0，L₂、L₄ 是 1.5', '距離 1.5＋1.5＝3＝r', '距離都不超過半徑'],
      }),
      activity: num(
        'b-ex4-practice-q',
        '課本 p.96 隨堂：間距 2、O 在 L₂ 上、半徑 4',
        [
          ['(1) 與圓 O 不相交的直線有幾條？', '1'],
          ['(2) 是圓 O 切線的直線有幾條？', '1'],
          ['(3) 是圓 O 割線的直線有幾條？', '3'],
        ],
        '距離：L₁ 2、L₂ 0、L₃ 2、L₄ 4、L₅ 6。(1) L₅ 不相交。(2) L₄ 是切線。(3) L₁、L₂、L₃ 是割線。',
      ),
      notes: '官方答案：(1) L₅ (2) L₄ (3) L₁、L₂、L₃。請學生說出是哪幾條。',
    },
    {
      id: 'b-ex5',
      phase: '工作範例',
      eyebrow: '10 / 例 5',
      title: '求切線段長',
      body: '連接圓心和切點：半徑垂直切線，得到直角三角形。先自己算，再按「下一步」。',
      source: '對應課本 2-1 p.97（題目數字同課本）',
      figures: [fig('tangent-seg-intro.png', '課本 p.97 切線段'), fig('ex5.png', '課本 p.97 例 5 題目')],
      interactive: V.figSteps({
        view: VIEW,
        figure: (() => {
          const c = [3.6, 6.2], A = [3.6, 3.6], B = [9.84, 3.6];
          return [
            circ(c[0], c[1], 2.6, { fill: 'rgba(123,97,255,.16)' }),
            G.seg([0.6, 3.6], [10.6, 3.6], { color: C.ink, width: 2 }),
            ...oLab(c, -0.4, 0.35),
            ...F(G.seg(c, A, { color: C.red, width: 2.6, dash: true }), [0, 1, 2, 4]),
            ...F(rightAt(A, c, B, 0.32), [1, 2, 4]),
            G.seg(c, B, { color: C.ink, width: 2 }),
            ...F(G.seg(A, B, { color: '#5a3fd6', width: 3.4 }), [3, 4]),
            dot(A),
            G.lab(A[0], 3.0, 'A', { size: 15 }),
            G.lab(B[0], 3.0, 'B', { size: 15 }),
            G.lab(3.15, 4.9, '5', { size: 14, color: C.red }),
            G.lab(7.2, 5.4, '13', { size: 14 }),
            G.lab(6.7, 3.05, '?', { size: 16, color: '#5a3fd6' }),
          ];
        })(),
        top: 9.6,
        x: 14.8,
        gap: 1.6,
        lines: [String.raw`連接 $\overline{OA}$，$\overline{OA}$ ＝ 5（半徑）`, String.raw`切線 ⊥ 半徑：$\overline{OA}\perp\overline{AB}$`, '△OAB 是直角三角形', String.raw`$\overline{AB}=\sqrt{\overline{OB}^{2}-\overline{OA}^{2}}=\sqrt{13^{2}-5^{2}}$`, '＝ 12'],
        captions: ['連接圓心和切點', '圓心與切點的連線垂直切線', '斜邊是 OB', '畢氏定理', '切線段 AB＝12'],
        caption: '課本例 5 的方法',
      }),
      activity: num('b-ex5-q', '先自己算例 5', [['切線段 AB 的長＝？', '12']], '連接 OA，OA⊥AB，AB＝√(13²－5²)＝12。'),
      notes: '切線段：圓外一點到切點的線段（課本 p.97 圖 3）。常見錯誤：13＋5、13－5。',
    },
    {
      id: 'b-ex5-practice',
      phase: '隨堂練習',
      eyebrow: '11 / 例 5 隨堂',
      title: '換你算：切線段與半徑',
      body: '第 1 題是課本隨堂，其餘是換數字題。先找直角在哪裡、哪一邊是斜邊。左圖用另一組數字示範。',
      source: srcVar(97),
      figures: [fig('ex5-practice.png', '課本 p.97 例 5 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: (() => {
          const c = [3.4, 6.0], Cc = [3.4, 3.5], D = [9.4, 3.5];
          return [
            circ(c[0], c[1], 2.5, { fill: 'rgba(47,128,237,.12)' }),
            G.seg([0.6, 3.5], [10.4, 3.5], { color: C.ink, width: 2 }),
            ...oLab(c, -0.4, 0.35),
            G.seg(c, D, { color: C.ink, width: 2 }),
            ...F(G.seg(c, Cc, { color: C.red, width: 2.6, dash: true }), [1, 2, 3]),
            ...F(rightAt(Cc, c, D, 0.32), [1, 2, 3]),
            G.lab(Cc[0], 2.9, 'C', { size: 15 }),
            G.lab(D[0], 2.9, 'D', { size: 15 }),
            G.lab(6.4, 2.95, '12', { size: 14, color: '#5a3fd6' }),
            G.lab(6.9, 5.3, '13', { size: 14 }),
            G.lab(2.95, 4.75, '?', { size: 15, color: C.red }),
          ];
        })(),
        top: 9.4,
        x: 14.8,
        gap: 1.7,
        lines: [String.raw`示範：$\overline{CD}$ ＝ 12、$\overline{OD}$ ＝ 13`, '切線 ⊥ 半徑：∠OCD ＝ 90°', String.raw`$\overline{OC}=\sqrt{13^{2}-12^{2}}$`, '＝ 5（半徑）'],
        captions: ['另一組數字（自編）', '連接 OC', '斜邊是 OD', '半徑 5'],
      }),
      activity: num(
        'b-ex5-practice-q',
        '課本 p.97 隨堂：直線 CD 切圓 O 於 C',
        [
          ['CD＝4、OD＝5，圓 O 的半徑＝？', '3'],
          ['半徑 6、OD＝10，切線段 CD＝？', '8'],
          ['半徑 8、切線段 CD＝15，OD＝？', '17'],
        ],
        '(1) OC＝√(5²－4²)＝3。(2) CD＝√(10²－6²)＝8。(3) OD＝√(8²＋15²)＝17。',
      ),
      notes: '答案：(1) 3 (2) 8 (3) 17。',
    },
    {
      id: 'b-error',
      phase: '錯誤分析',
      eyebrow: '12 / 當小老師',
      title: '小華寫：6 ＜ 10，所以 L 是割線',
      body: '圓 O 的直徑 10，圓心 O 到直線 L 的距離 6。小華說 L 是割線。他對嗎？在畫布圈出錯誤、寫出正確判斷與理由，也可以拍照上傳。',
      source: '錯誤示例（自編），對應課本 p.93、p.96',
      interactive: V.figSteps({
        view: VIEW,
        figure: (() => {
          const c = [4.4, 5.4], R = 3;
          return [
            circ(c[0], c[1], R, { fill: 'rgba(255,201,60,.2)' }),
            ...oLab(c, -0.3, 0.45),
            G.seg([c[0], c[1] - R], [c[0], c[1] + R], { color: C.blue, width: 2.2 }),
            G.lab(c[0] - 0.55, c[1] + 1.6, '10', { size: 13, color: '#1d4fa3' }),
            G.seg([8, 1.2], [8, 9.8], { color: C.red, width: 2.4 }),
            G.lab(8.4, 9.8, 'L', { size: 15, color: C.red }),
            G.seg(c, [8, c[1]], { color: '#6b7394', width: 1.8, dash: true }),
            ...rightAt([8, c[1]], c, [8, 9]),
            G.lab(6.6, c[1] + 0.45, '6', { size: 14 }),
          ];
        })(),
        top: 9.4,
        x: 14.8,
        gap: 1.7,
        lines: ['小華：6 ＜ 10，所以 L 是割線', 'd 要和「直徑」還是「半徑」比？', '半徑 r ＝ ？', 'd 和 r 的關係 → L 和圓 ？'],
        captions: ['小華的判斷', '回想例 4 的第一步', '先求半徑', '自己判斷'],
      }),
      activity: {
        id: 'b-error-q',
        type: 'canvas',
        prompt: '小華說「6＜10，所以 L 是割線」。① 圈出錯誤 ② 寫出正確的判斷 ③ 說明理由',
        canvas: 'grid',
        allowPhoto: true,
        aiAllowed: true,
        rubric: rubric(
          [
            crit('find', '找出錯誤', [[0, '未指出錯誤'], [1, '只說錯了'], [2, '指出應該和半徑比，不是和直徑比']]),
            crit('fix', '正確判斷', [[0, '判斷錯誤或未作答'], [1, '半徑算對但判斷錯'], [2, 'r＝5，d＝6＞5，L 和圓 O 不相交（0 個交點）']]),
            crit('why', '說明理由', [[0, '沒有理由'], [1, '只寫 6＞5'], [2, '說明 d＞r 時直線上所有點到 O 都比半徑遠，都在圓外']]),
          ],
          '直徑 10，半徑 r＝5。圓心到 L 的距離 d＝6＞5，所以 L 和圓 O 不相交（沒有交點）。小華把距離和直徑比較，應該和半徑比。',
        ),
      },
      notes: '收件後按「AI 批改」，覆核後發回；可用具體操作頁把 r 調成 5、d 調成 6 驗證。',
    },
    {
      id: 'b-exit',
      phase: '出場券',
      eyebrow: '13 / 用自己的話說',
      title: '怎麼判斷直線是不是圓的切線？',
      body: '用一到兩句話說明：怎麼判斷一條直線是不是圓的切線？寫出兩種方法。',
      visual: 'steps',
      bullets: ['用距離和半徑比', '用「過圓上一點」和「垂直半徑」'],
      activity: {
        id: 'b-exit-q',
        type: 'short',
        prompt: '怎麼判斷一條直線是不是圓的切線？寫出兩種方法。',
        aiAllowed: true,
        rubric: rubric(
          [
            crit('dist', '距離法', [[0, '沒有提到'], [1, '只說「碰到圓」'], [2, '圓心到直線的距離等於半徑（d＝r）']]),
            crit('perp', '垂直法', [[0, '沒有提到'], [1, '只說垂直，沒說過圓上一點'], [2, '直線過圓上一點，且垂直過這一點的半徑']]),
          ],
          '方法一：圓心到直線的距離 d 等於半徑 r，直線是切線。方法二：直線通過圓上一點 P，且垂直半徑 OP，直線是切線。',
        ),
      },
    },
    reflect('b-reflect', '我能判斷點、直線和圓的位置關係，並用切線性質求切線段長'),
  ],
};

/* ───────────────────── 第 3 堂：切線段性質、弦與弦心距 ───────────────────── */
/** 圓外一點 P 的兩條切線（數字）：圓心 c、圖上半徑 R、圖上 OP 長 L（P 在 c 的右邊）。 */
function tangentPair(c, R, L) {
  const P = [c[0] + L, c[1]], foot = (R * R) / L, h = (R * Math.sqrt(L * L - R * R)) / L;
  return { P, M: [c[0] + foot, c[1] + h], N: [c[0] + foot, c[1] - h], Rp: [c[0] + foot, c[1]] };
}
const tangentFig = ({ c, R, L, labels, hlPerim, hlChord, last }) => {
  const { P, M, N, Rp } = tangentPair(c, R, L);
  const f = (x) => (x ? [...x, last] : undefined);
  return [
    circ(c[0], c[1], R, { fill: 'rgba(123,97,255,.14)' }),
    ...F([G.seg(c, M, { color: C.blue, width: 2.4 }), G.seg(c, N, { color: C.blue, width: 2.4 }), G.seg(P, M, { color: C.red, width: 2.8 }), G.seg(P, N, { color: C.red, width: 2.8 })], f(hlPerim)),
    G.seg(c, P, { color: '#6b7394', width: 1.8, dash: true }),
    ...F(G.seg(M, N, { color: '#5a3fd6', width: 2.8 }), f(hlChord)),
    ...rightAt(M, c, P, 0.3),
    ...rightAt(N, c, P, 0.3),
    ...F(rightAt(Rp, P, M, 0.25), f(hlChord)),
    ...oLab(c, -0.45, 0.1),
    G.lab(M[0], M[1] + 0.45, 'M', { size: 15 }),
    G.lab(N[0], N[1] - 0.5, 'N', { size: 15 }),
    G.lab(P[0] + 0.4, P[1], 'P', { size: 15 }),
    ...F(G.lab(Rp[0] + 0.35, Rp[1] - 0.4, 'R', { size: 13, color: '#5a3fd6' }), f(hlChord)),
    ...labels.map(([at, t, color]) => G.lab(at[0], at[1], t, { size: 14, color: color ?? C.ink })),
  ];
};
const chordFig = ({ c, R, d, half, names = ['A', 'B', 'M'], labels = [], ang = 270, focusTri, focusChord, last }) => {
  const n = [Math.cos((ang * Math.PI) / 180), Math.sin((ang * Math.PI) / 180)], u = [-n[1], n[0]];
  const Mp = [c[0] + d * n[0], c[1] + d * n[1]];
  const A = [Mp[0] - half * u[0], Mp[1] - half * u[1]], B = [Mp[0] + half * u[0], Mp[1] + half * u[1]];
  const f = (x) => (x ? [...x, last] : undefined);
  return {
    A, B, M: Mp,
    shapes: [
      ...F(G.seg(A, B, { color: C.ink, width: 2.6 }), f(focusChord)),
      ...F(G.seg(c, Mp, { color: C.red, width: 2.6 }), f(focusTri)),
      ...F(G.seg(c, A, { color: C.blue, width: 2, dash: true }), f(focusTri)),
      ...rightAt(Mp, c, B, 0.3),
      G.lab(A[0] - 0.4 * u[0], A[1] - 0.4 * u[1] - 0.15, names[0], { size: 15 }),
      G.lab(B[0] + 0.4 * u[0], B[1] + 0.4 * u[1] - 0.15, names[1], { size: 15 }),
      G.lab(Mp[0] + 0.45 * n[0] + 0.3 * u[0], Mp[1] + 0.45 * n[1] + 0.3 * u[1], names[2], { size: 14, color: C.red }),
      ...labels.map(([at, t, color]) => G.lab(at[0], at[1], t, { size: 14, color: color ?? C.ink })),
    ],
  };
};

const ex8Fig = () => {
  const c = [5, 5.6], R = 4;
  const ab = chordFig({ c, R, d: 2, half: 2 * Math.sqrt(3), ang: 110, names: ['B', 'A', 'M'], focusTri: [3, 4], focusChord: [4], last: 4 });
  const cd = chordFig({ c, R, d: 3.2, half: 2.4, ang: 270, names: ['C', 'D', 'N'], focusTri: [0, 1, 2], last: 4 });
  return [
    circ(c[0], c[1], R, { fill: 'rgba(47,128,237,.10)' }),
    ...ab.shapes,
    ...cd.shapes,
    ...oLab(c, 0.45, 0),
    G.lab(4.1, 6.55, '5', { size: 13, color: C.red }),
    G.lab(5.35, 3.9, '8', { size: 13, color: C.red }),
    G.lab(6.5, 1.9, '12', { size: 13 }),
  ];
};

const lessonC = {
  schemaVersion: 1,
  id: 'g9-2-1c',
  title: '2-1 點、直線與圓之間的位置關係（3）切線段性質、弦與弦心距',
  description: '拖曳圓外一點看見兩條切線段等長（PA＝PB，PO 平分∠APB 並垂直平分 AB）；拉動弦心距看見弦心距垂直平分弦、弦愈長弦心距愈小，再用畢氏定理解例 6～例 9。例題與隨堂附課本截圖，解題過程逐步呈現，隨堂改為可即時批改的 IRS。',
  subject: '數學・九年級 2-1',
  duration: 45,
  objectives: ['能說明圓外一點到圓的兩條切線段等長，並求四邊形周長與切點連線長', '能說明弦心距垂直平分弦，並用畢氏定理求弦長、弦心距或半徑', '能用「弦愈長，弦心距愈小」比較同一圓中的弦'],
  slides: [
    {
      id: 'c-warmup',
      phase: '提取練習',
      eyebrow: '01 / 先想起上一堂',
      title: '切線 ⊥ 半徑、d 和 r 比大小',
      body: '上一堂學過：切線垂直過切點的半徑；直線與圓的位置看 d 和 r。八上學過等腰三角形的頂角平分線垂直平分底邊。先暖身三題。',
      source: '銜接 2-1 p.93–97、八上等腰三角形性質',
      interactive: {
        view: VIEW,
        shapes: [
          circ(3.6, 6.2, 2.6, { fill: 'rgba(123,97,255,.16)' }),
          G.seg([0.6, 3.6], [10.6, 3.6], { color: C.ink, width: 2 }),
          G.seg([3.6, 6.2], [3.6, 3.6], { color: C.red, width: 2.6 }),
          G.seg([3.6, 6.2], [9.84, 3.6], { color: C.ink, width: 2 }),
          ...rightAt([3.6, 3.6], [3.6, 6.2], [9.8, 3.6], 0.32),
          ...oLab([3.6, 6.2], -0.4, 0.35),
          G.lab(3.6, 3.0, 'A', { size: 15 }),
          G.lab(9.84, 3.0, 'B', { size: 15 }),
          G.lab(15, 7.4, '切線 ⊥ 過切點的半徑', { size: 19, color: C.red }),
          G.lab(15, 5.6, String.raw`$\overline{AB}=\sqrt{\overline{OB}^{2}-\overline{OA}^{2}}$`, { size: 19, color: '#5a3fd6' }),
        ],
        caption: '上一堂例 5：連接圓心和切點，得到直角三角形',
      },
      activity: num(
        'c-warmup-q',
        '暖身：直接寫出答案',
        [
          ['直線 AB 切圓 O 於 A，半徑 5、OB＝13，切線段 AB＝？', '12'],
          ['圓 O 半徑 6，圓心到直線 L 的距離 4，L 和圓有幾個交點？', '2'],
          ['等腰三角形底邊長 10，頂角平分線把底邊分成兩段，每段長？', '5'],
        ],
        '(1) √(13²－5²)＝12。(2) 4＜6，割線，2 個交點。(3) 頂角平分線垂直平分底邊，10÷2＝5。',
      ),
      notes: '第 3 題為切線段性質（PO 垂直平分 AB）與弦的性質鋪路。',
    },
    {
      id: 'c-predict',
      phase: '預測',
      eyebrow: '02 / 先猜',
      title: '從圓外一點畫兩條切線，誰比較長？',
      body: 'P 在圓外，從 P 畫圓 O 的兩條切線，切點 A、B。切線段 PA 和 PB 哪一條比較長？先猜，下一頁拖曳驗證。',
      source: '對應課本 p.98 的問題（自編題）',
      visual: 'cards',
      activity: {
        id: 'c-predict-q',
        type: 'single',
        prompt: '切線段 PA 和 PB 的長度？',
        options: ['PA 比較長', 'PB 比較長', '一樣長', '要看 P 在哪裡'],
        correct: [2],
        explanation: '△OAP 和 △OBP 都是直角三角形，OA＝OB（半徑）、OP 共用，RHS 全等，所以 PA＝PB。',
      },
      notes: '先公布統計、不公布答案，保留疑問到下一頁。',
    },
    {
      id: 'c-tangent',
      phase: '具體操作',
      eyebrow: '03 / 拖曳圓外一點',
      title: '兩條切線段永遠等長嗎？',
      body: '拖曳 P，看 PA、PB 的長度。對照課本：RHS 全等推出 PA＝PB，PO 平分 ∠APB、垂直平分 AB。',
      source: '對應課本 2-1 p.98',
      figures: [fig('tangent-seg-proof.png', '課本 p.98 切線段等長的說明'), fig('tangent-seg-fig5.png', '課本 p.98 PO 垂直平分 AB'), fig('keybox-tangent-seg.png', '課本 p.98 Key point 圓的切線段性質')],
      interactive: O.tangentExplore({ r: 3, P: [6, 2] }),
      activity: {
        id: 'c-tangent-q',
        type: 'manipulate',
        prompt: '圓的半徑是 3。把 P 拖到「切線段 PA＝4」的位置，再按「送出我的操作」。',
        check: 'Px^2+Py^2==25',
        record: ['Px', 'Py'],
        explanation: 'PA＝4、OA＝3，OP＝√(3²＋4²)＝5：P 要離圓心 5，例如 (5, 0)、(4, 3)、(3, 4)。',
      },
      notes: '具體操作（CRA）。回到預測頁：PA＝PB。請學生說出全等的理由（RHS：直角、斜邊 OP、一股 OA＝OB）。',
    },
    {
      id: 'c-ex6',
      phase: '工作範例',
      eyebrow: '04 / 例 6',
      title: '圓的切線段性質：周長與 MN',
      body: '(1) 用畢氏定理和 PM＝PN；(2) OP 垂直平分 MN，用△OMP 面積算兩次。先自己算，再按「下一步」。',
      source: src(99),
      figures: [fig('ex6.png', '課本 p.99 例 6 題目')],
      interactive: V.figSteps({
        view: VIEW,
        figure: tangentFig({ c: [3.2, 5.5], R: 2.4, L: 5.1, labels: [[[3.25, 6.9], '8', C.blue], [[6.2, 5.05], '17']], hlPerim: [0, 1, 2], hlChord: [3, 4, 5], last: 5 }),
        top: 10,
        x: 14.8,
        gap: 1.6,
        lines: [
          String.raw`(1) $\overline{PM}=\sqrt{17^{2}-8^{2}}$ ＝ 15`,
          String.raw`$\overline{PN}=\overline{PM}$ ＝ 15（切線段等長）`,
          '周長 ＝ 8 ＋ 15 ＋ 15 ＋ 8 ＝ 46',
          String.raw`(2) $\overline{OP}$ 垂直平分 $\overline{MN}$`,
          String.raw`$\dfrac{8\times15}{2}=\dfrac{17\times\overline{MR}}{2}$`,
          String.raw`$\overline{MR}=\dfrac{120}{17}$，$\overline{MN}=\dfrac{240}{17}$`,
        ],
        captions: ['∠OMP＝90°，畢氏定理', '圓的切線段性質', '四邊形 OMPN 的周長', 'MN 交 OP 於 R，MR＝NR', '△OMP 面積：底×高算兩次', 'MN＝2MR'],
        caption: '課本例 6 的方法',
      }),
      activity: num(
        'c-ex6-q',
        '先自己算例 6',
        [
          ['四邊形 OMPN 的周長＝？', '46'],
          ['MN 的長＝？（寫成分數）', '240/17'],
        ],
        '(1) PM＝√(17²－8²)＝15＝PN，周長＝8＋15＋15＋8＝46。(2) 8×15÷2＝17×MR÷2，MR＝120/17，MN＝240/17。',
      ),
      notes: '(2) 是新的技巧：同一個直角三角形的面積，用兩股算和用斜邊×斜邊上的高算，結果相同。',
    },
    {
      id: 'c-ex6-practice',
      phase: '隨堂練習',
      eyebrow: '05 / 例 6 隨堂',
      title: '換你算：OP 與 MN',
      body: '兩題都是課本隨堂（半徑 9、PM＝12）。左圖用另一組數字示範。',
      source: src(99),
      figures: [fig('ex6-practice.png', '課本 p.99 例 6 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: tangentFig({ c: [3.4, 5.5], R: 2.4, L: 4, labels: [[[3.45, 6.75], '6', C.blue], [[6.25, 7.1], '8', C.red]], hlPerim: [0, 1], hlChord: [2, 3], last: 3 }),
        top: 9.4,
        x: 14.8,
        gap: 1.7,
        lines: [String.raw`示範：半徑 6、$\overline{PM}$ ＝ 8`, String.raw`$\overline{OP}=\sqrt{6^{2}+8^{2}}$ ＝ 10`, String.raw`$\dfrac{6\times8}{2}=\dfrac{10\times\overline{MR}}{2}$`, String.raw`$\overline{MR}=\dfrac{24}{5}$，$\overline{MN}=\dfrac{48}{5}$`],
        captions: ['另一組數字（自編）', '∠OMP＝90°，OP 是斜邊', '△OMP 面積算兩次', 'MN＝2MR'],
      }),
      activity: num(
        'c-ex6-practice-q',
        '課本 p.99 隨堂：半徑 9、PM＝12',
        [
          ['(1) OP 的長＝？', '15'],
          ['(2) MN 的長＝？（寫成分數）', '72/5'],
        ],
        '(1) OP＝√(9²＋12²)＝15。(2) 9×12÷2＝15×MR÷2，MR＝36/5，MN＝72/5。',
      ),
      notes: '官方答案：(1) 15 (2) 72/5。',
    },
    {
      id: 'c-chord',
      phase: '具體操作',
      eyebrow: '06 / 拉動弦心距',
      title: '弦離圓心愈近，弦愈長？',
      body: '拉動弦心距 OM、ON：OM 垂直平分弦 AB。比一比兩條弦，弦心距和弦長有什麼關係？',
      source: '對應課本 2-1 p.100–104',
      figures: [fig('chord-fold.png', '課本 p.100 問題探索：對摺找圓心'), fig('keybox-chord.png', '課本 p.101 Key point 弦的性質'), fig('chord-distance.png', '課本 p.102 弦心距')],
      interactive: O.chordExplore({ d: 4, e: 2, t: 270 }),
      activity: {
        id: 'c-chord-q',
        type: 'manipulate',
        prompt: '半徑 5。把弦心距 OM 調到「弦 AB＝8」，再按「送出我的操作」。',
        check: 'd==3',
        record: ['d', 'e', 't'],
        explanation: 'AM＝AB÷2＝4，OM＝√(5²－4²)＝3。弦心距 3 時弦長 8。',
      },
      notes: '弦的性質（p.101）：弦的中垂線過圓心；過圓心且垂直弦的直線平分弦。p.101 隨堂（尺規找圓心）：取兩條弦作中垂線，交點是圓心，請學生在課本上作圖。動動腦（p.104）：等圓中性質也成立（半徑相等）。',
    },
    {
      id: 'c-ex7',
      phase: '工作範例',
      eyebrow: '07 / 例 7',
      title: '弦心距的應用：求弦長',
      body: '連接 OA，△OAM 是直角三角形；OM 垂直平分 AB。先自己算，再按「下一步」。',
      source: src(102),
      figures: [fig('ex7.png', '課本 p.102 例 7 題目')],
      interactive: V.figSteps({
        view: VIEW,
        figure: (() => {
          const c = [5, 6.2];
          const ch = chordFig({ c, R: 3.9, d: 1.5, half: 3.6, focusTri: [0, 1, 2], focusChord: [3, 4], last: 4 });
          return [circ(c[0], c[1], 3.9, { fill: 'rgba(132,204,22,.18)' }), ...ch.shapes, ...oLab(c, 0.4, 0.35), G.lab(3.05, 5.8, '13', { size: 13, color: '#1d4fa3' }), G.lab(5.4, 5.45, '5', { size: 13, color: C.red })];
        })(),
        top: 9.6,
        x: 14.8,
        gap: 1.6,
        lines: [String.raw`連接 $\overline{OA}$ ＝ 13（半徑）`, String.raw`$\overline{OM}\perp\overline{AB}$，△OAM 是直角三角形`, String.raw`$\overline{AM}=\sqrt{13^{2}-5^{2}}$ ＝ 12`, String.raw`$\overline{OM}$ 垂直平分 $\overline{AB}$`, String.raw`$\overline{AB}=2\overline{AM}$ ＝ 24`],
        captions: ['連接圓心和弦的端點', '弦心距垂直弦', '畢氏定理', '弦的性質：過圓心且垂直弦的直線平分弦', 'AB＝2×12'],
        caption: '課本例 7 的方法',
      }),
      activity: num('c-ex7-q', '先自己算例 7', [['AM 的長＝？', '12'], ['AB 的長＝？', '24']], 'AM＝√(13²－5²)＝12，AB＝2AM＝24。'),
      notes: '常見錯誤：AB 只寫 12（忘了 ×2）。',
    },
    {
      id: 'c-ex7-practice',
      phase: '隨堂練習',
      eyebrow: '08 / 例 7 隨堂',
      title: '換你算：弦心距與三角形面積',
      body: '兩題都是課本隨堂（CD＝16、半徑 10）。左圖用另一組數字示範。',
      source: src(102),
      figures: [fig('ex7-practice.png', '課本 p.102 例 7 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: (() => {
          const c = [5, 6.2];
          const ch = chordFig({ c, R: 3.9, d: 1.5, half: 3.6, names: ['C', 'D', 'N'], focusTri: [1, 2, 3], focusChord: [1], last: 3 });
          return [circ(c[0], c[1], 3.9, { fill: 'rgba(47,128,237,.12)' }), ...ch.shapes, G.seg(c, ch.B, { color: C.blue, width: 2, dash: true }), ...oLab(c, 0.4, 0.35), G.lab(6.9, 4.2, '24', { size: 13 }), G.lab(3.05, 5.8, '13', { size: 13, color: '#1d4fa3' })];
        })(),
        top: 9.4,
        x: 14.8,
        gap: 1.7,
        lines: [String.raw`示範：$\overline{CD}$ ＝ 24、半徑 13`, String.raw`$\overline{CN}=\dfrac12\overline{CD}$ ＝ 12`, String.raw`$\overline{ON}=\sqrt{13^{2}-12^{2}}$ ＝ 5`, String.raw`△CON $=\dfrac12\times12\times5$ ＝ 30`],
        captions: ['另一組數字（自編）', 'ON 垂直平分 CD', '畢氏定理', '直角三角形面積＝兩股相乘÷2'],
      }),
      activity: num(
        'c-ex7-practice-q',
        '課本 p.102 隨堂：CD＝16、半徑 10',
        [
          ['(1) ON 的長＝？', '6'],
          ['(2) △CON 的面積＝？', '24'],
        ],
        '(1) CN＝8，ON＝√(10²－8²)＝6。(2) ½×8×6＝24。',
      ),
      notes: '官方答案：(1) 6 (2) 24。常見錯誤：△CON 用了 CD＝16 當底（得 48，那是 △COD）。',
    },
    {
      id: 'c-ex8',
      phase: '工作範例',
      eyebrow: '09 / 例 8',
      title: '兩條弦：先求半徑，再求弦長',
      body: '從已知的弦 CD 和 ON 求半徑，再用半徑和 OM 求 AB。先自己算，再按「下一步」。',
      source: src(103),
      figures: [fig('ex8.png', '課本 p.103 例 8 題目'), fig('keybox-chord-distance.png', '課本 p.104 Key point 弦心距的性質')],
      interactive: V.figSteps({
        view: VIEW,
        figure: ex8Fig(),
        top: 9.6,
        x: 14.8,
        gap: 1.6,
        lines: [String.raw`$\overline{CN}=\dfrac12\overline{CD}$ ＝ 6`, String.raw`$\overline{OC}=\sqrt{8^{2}+6^{2}}$ ＝ 10`, String.raw`$\overline{OA}=\overline{OC}$ ＝ 10（半徑）`, String.raw`$\overline{AM}=\sqrt{10^{2}-5^{2}}=5\sqrt3$`, String.raw`$\overline{AB}=2\overline{AM}=10\sqrt3$`],
        captions: ['ON 垂直平分 CD', '在直角△OCN 用畢氏定理求半徑', '同一圓的半徑相等', '在直角△OAM 用畢氏定理', 'OM 垂直平分 AB'],
        caption: '課本例 8 的方法；弦心距 5＜8，所以 AB 比 CD 長（p.104 性質）',
      }),
      activity: num('c-ex8-q', '先自己算例 8（最簡根式）', [['半徑 OC＝？', '10'], ['AB 的長＝？', '10√3']], 'CN＝6，OC＝√(8²＋6²)＝10＝OA，AM＝√(10²－5²)＝5√3，AB＝10√3。', { form: 'simplest-radical' }),
      notes: 'p.104 弦心距的性質：同一圓中，弦心距愈小，弦愈長（10√3≈17.3＞12）。',
    },
    {
      id: 'c-ex8-practice',
      phase: '隨堂練習',
      eyebrow: '10 / 例 8 隨堂',
      title: '換你算：同側的兩條弦',
      body: '第 1 題是課本隨堂，其餘是換數字題。O、M、N 共線，MN＝ON－OM。左圖用另一組數字示範。',
      source: srcVar(103),
      figures: [fig('ex8-practice.png', '課本 p.103 例 8 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: (() => {
          const c = [5, 4.6], R = 4.25;
          const ab = chordFig({ c, R, d: 2, half: 3.75, ang: 90, names: ['B', 'A', 'M'], focusTri: [1], last: 3 });
          const cd = chordFig({ c, R, d: 3.75, half: 2, ang: 90, names: ['D', 'C', 'N'], focusTri: [2], last: 3 });
          return [circ(c[0], c[1], R, { fill: 'rgba(132,204,22,.16)' }), ...ab.shapes, ...cd.shapes, ...oLab(c, 0.4, -0.3), ...F(G.seg(ab.M, cd.M, { color: '#5a3fd6', width: 3.4 }), [3])];
        })(),
        top: 9.4,
        x: 14.8,
        gap: 1.7,
        lines: [String.raw`示範：$\overline{OM}$ ＝ 8、$\overline{AB}$ ＝ 30、$\overline{CD}$ ＝ 16`, String.raw`$\overline{OA}=\sqrt{8^{2}+15^{2}}$ ＝ 17`, String.raw`$\overline{ON}=\sqrt{17^{2}-8^{2}}$ ＝ 15`, String.raw`$\overline{MN}=\overline{ON}-\overline{OM}$ ＝ 7`],
        captions: ['另一組數字（自編）', 'AM＝15，先求半徑', 'CN＝8，OC＝17', '兩條弦在圓心同側'],
      }),
      activity: num(
        'c-ex8-practice-q',
        '課本 p.103 隨堂：求 MN',
        [
          ['OM＝7、AB＝48、CD＝30，MN＝？', '13'],
          ['OM＝5、AB＝24、CD＝10，MN＝？', '7'],
          ['OM＝6、AB＝16、CD＝12，MN＝？', '2'],
        ],
        '(1) 半徑＝√(7²＋24²)＝25，ON＝√(25²－15²)＝20，MN＝20－7＝13。(2) 半徑 13，ON＝12，MN＝7。(3) 半徑 10，ON＝8，MN＝2。',
      ),
      notes: '答案：(1) 13 (2) 7 (3) 2。題目說 O、M、N 共線且兩弦在 O 的同側（看圖）；若在兩側要相加。',
    },
    {
      id: 'c-ex9',
      phase: '工作範例',
      eyebrow: '11 / 例 9 隧道',
      title: '弦心距的生活應用：隧道半徑',
      body: '設半徑 x，OD＝8－x，在直角△OAD 用畢氏定理列方程式。先自己算，再按「下一步」。',
      source: src(105),
      figures: [fig('ex9.png', '課本 p.105 例 9 題目')],
      interactive: V.figSteps({
        view: VIEW,
        figure: (() => {
          const c = [5, 5.2], A = [1.8, 2.8], B = [8.2, 2.8], D = [5, 2.8], Cc = [5, 9.2];
          return [
            circ(c[0], c[1], 4, { fill: 'rgba(47,128,237,.10)' }),
            G.seg(A, B, { color: C.ink, width: 2.6 }),
            ...F(G.seg(Cc, D, { color: C.ink, width: 2 }), [0, 1, 4]),
            ...F(G.seg(c, A, { color: C.blue, width: 2.2, dash: true }), [0, 2, 3, 4]),
            ...F(G.poly([c, A, D], { fill: C.fOrange, color: 'rgba(0,0,0,0)', width: 0.5 }), [2, 3, 4]),
            ...rightAt(D, c, B, 0.3),
            ...oLab(c, 0.4, 0.2),
            G.lab(A[0] - 0.3, A[1] - 0.4, 'A', { size: 15 }),
            G.lab(B[0] + 0.3, B[1] - 0.4, 'B', { size: 15 }),
            G.lab(Cc[0] + 0.3, Cc[1] + 0.4, 'C', { size: 15 }),
            G.lab(D[0] + 0.35, D[1] - 0.45, 'D', { size: 15 }),
            G.lab(5.4, 7.3, 'x', { size: 15, color: C.red }),
            G.lab(3.1, 4.4, 'x', { size: 15, color: C.red }),
            G.lab(5.75, 4.0, '8－x', { size: 13, color: C.red }),
            G.lab(3.4, 2.3, '4', { size: 14, color: C.red }),
          ];
        })(),
        top: 9.8,
        x: 14.8,
        gap: 1.6,
        lines: [String.raw`設半徑 $\overline{OA}=\overline{OC}=x$`, String.raw`$\overline{OD}=8-x$，$\overline{AD}=\dfrac12\times8=4$`, String.raw`$x^{2}=(8-x)^{2}+4^{2}$`, String.raw`$x^{2}=64-16x+x^{2}+16$`, '16x ＝ 80，x ＝ 5（公尺）'],
        captions: ['設未知數', 'CD 是高度：OD＝CD－OC；OD 垂直平分 AB', '直角△OAD 的畢氏定理', '展開（乘法公式）', '隧道半徑 5 公尺'],
        caption: '課本例 9 的方法',
      }),
      activity: num('c-ex9-q', '先自己算例 9', [['隧道的半徑是幾公尺？', '5']], 'x²＝(8－x)²＋4²，16x＝80，x＝5。'),
      notes: '關鍵：把「高度 CD」拆成半徑 x 和弦心距 8－x。',
    },
    {
      id: 'c-ex9-practice',
      phase: '隨堂練習',
      eyebrow: '12 / 例 9 隨堂',
      title: '換你算：水管屋的半徑',
      body: '第 1 題是課本隨堂，其餘是換數字題。注意這次弦在圓心下方：OD＝x－CD。左圖用另一組數字示範。',
      source: srcVar(105),
      figures: [fig('ex9-practice.png', '課本 p.105 例 9 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: (() => {
          const c = [5, 5.8], R = 3.9, A = [1.4, 4.3], B = [8.6, 4.3], D = [5, 4.3], Cc = [5, 1.9];
          return [
            circ(c[0], c[1], R, { fill: 'rgba(47,128,237,.10)' }),
            G.seg(A, B, { color: '#b4541a', width: 3 }),
            G.seg(c, Cc, { color: C.ink, width: 2 }),
            ...F(G.seg(c, A, { color: C.blue, width: 2.2, dash: true }), [1, 2, 3]),
            ...rightAt(D, c, B, 0.3),
            ...oLab(c, 0.4, 0.3),
            G.lab(A[0] - 0.35, A[1] + 0.3, 'A', { size: 15 }),
            G.lab(B[0] + 0.35, B[1] + 0.3, 'B', { size: 15 }),
            G.lab(Cc[0], Cc[1] - 0.5, 'C', { size: 15 }),
            G.lab(D[0] + 0.4, D[1] + 0.45, 'D', { size: 15 }),
            G.lab(3.2, 3.8, '12', { size: 13 }),
            G.lab(5.45, 3.1, '8', { size: 13 }),
          ];
        })(),
        top: 9.4,
        x: 14.8,
        gap: 1.7,
        lines: [String.raw`示範：$\overline{AB}$ ＝ 24、$\overline{CD}$ ＝ 8`, String.raw`設半徑 x，$\overline{OD}$ ＝ x － 8`, String.raw`$x^{2}=(x-8)^{2}+12^{2}$`, '16x ＝ 208，x ＝ 13'],
        captions: ['另一組數字（自編）', '弦在圓心下方：OD＝OC－CD', '直角△OAD', '半徑 13'],
      }),
      activity: num(
        'c-ex9-practice-q',
        '課本 p.105 隨堂：水管屋的半徑',
        [
          ['床長 AB＝160 公分、CD＝40 公分，半徑幾公分？', '100'],
          ['AB＝48、CD＝8，半徑＝？', '40'],
          ['AB＝60、CD＝10，半徑＝？', '50'],
        ],
        '(1) x²＝(x－40)²＋80²，80x＝8000，x＝100。(2) x²＝(x－8)²＋24²，16x＝640，x＝40。(3) x²＝(x－10)²＋30²，20x＝1000，x＝50。',
      ),
      notes: '官方答案：(1) 100 公分。換數字題：(2) 40 (3) 50。',
    },
    {
      id: 'c-error',
      phase: '錯誤分析',
      eyebrow: '13 / 當小老師',
      title: '小美寫：半徑 ＝ √(12² ＋ 8²) ＝ 4√13',
      body: '弦 AB＝12、弦心距 OM＝8。小美算出半徑 4√13。她對嗎？在畫布圈出錯誤、寫出正確算法與理由，也可以拍照上傳。',
      source: '錯誤示例（自編），對應課本 p.102',
      interactive: V.figSteps({
        view: VIEW,
        figure: (() => {
          const c = [5, 6];
          const ch = chordFig({ c, R: 4, d: 3.2, half: 2.4 });
          return [circ(c[0], c[1], 4, { fill: 'rgba(255,201,60,.18)' }), ...ch.shapes, ...oLab(c, 0.4, 0.35), G.lab(6.5, 2.3, '12', { size: 13 }), G.lab(5.4, 4.4, '8', { size: 13, color: C.red }), G.lab(3.3, 4.7, '?', { size: 15, color: '#1d4fa3' })];
        })(),
        top: 9.4,
        x: 14.8,
        gap: 1.7,
        lines: [String.raw`小美：$r=\sqrt{12^{2}+8^{2}}=4\sqrt{13}$`, '直角△OAM 的兩股是哪兩段？', String.raw`$\overline{AM}$ ＝ ？`, 'r ＝ ？'],
        captions: ['小美的算式', '看圖：直角在 M', 'OM 垂直平分 AB', '自己算出來'],
      }),
      activity: {
        id: 'c-error-q',
        type: 'canvas',
        prompt: '小美寫「r＝√(12²＋8²)＝4√13」。① 圈出錯誤 ② 寫出正確算法與答案 ③ 說明理由',
        canvas: 'grid',
        allowPhoto: true,
        aiAllowed: true,
        rubric: rubric(
          [
            crit('find', '找出錯誤', [[0, '未指出錯誤'], [1, '只說錯了'], [2, '指出直角三角形的股是半弦 AM＝6，不是整條弦 12']]),
            crit('fix', '正確計算', [[0, '答案錯誤或未作答'], [1, '列式正確但計算錯'], [2, 'r＝√(6²＋8²)＝10']]),
            crit('why', '說明理由', [[0, '沒有理由'], [1, '只寫畢氏定理'], [2, '說明弦心距 OM 垂直平分弦 AB，所以 AM＝AB÷2＝6，△OAM 是直角三角形']]),
          ],
          '弦心距 OM 垂直平分 AB，AM＝12÷2＝6。在直角△OAM 中，r＝OA＝√(6²＋8²)＝10。小美用了整條弦 12。',
        ),
      },
      notes: '收件後按「AI 批改」，覆核後發回；可用具體操作頁看 OM 和 AM 的位置。',
    },
    {
      id: 'c-summary',
      phase: '出場券',
      eyebrow: '14 / 2-1 重點回顧',
      title: '2-1 點、直線與圓：一張圖整理',
      body: '對照課本的重點整理，用自己的話說明：為什麼求弦長、切線段長都會用到畢氏定理？',
      source: '對應課本 p.106–107 重點整理',
      figures: [fig('summary-1.png', '課本 p.106 重點整理'), fig('summary-2.png', '課本 p.107 重點整理')],
      activity: {
        id: 'c-exit-q',
        type: 'short',
        prompt: '為什麼求弦長、切線段長都會用到畢氏定理？各說出直角在哪裡。',
        aiAllowed: true,
        rubric: rubric(
          [
            crit('tangent', '切線段', [[0, '沒有說明'], [1, '只說有直角'], [2, '切線垂直過切點的半徑，直角在切點，OP 是斜邊']]),
            crit('chord', '弦', [[0, '沒有說明'], [1, '只說有直角'], [2, '弦心距垂直平分弦，直角在弦的中點，半徑是斜邊、半弦和弦心距是兩股']]),
          ],
          '切線段：半徑垂直切線，△OAP 的直角在切點 A，OP²＝OA²＋PA²。弦：弦心距 OM 垂直平分弦 AB，△OAM 的直角在 M，OA²＝AM²＋OM²，AB＝2AM。',
        ),
      },
    },
    reflect('c-reflect', '我能用切線段性質、弦心距的性質和畢氏定理解題'),
  ],
};

// 只用課本原題（換數字題拿掉）：題目 ID → 保留前幾小題
textbookOnly([lessonA, lessonB, lessonC], {
  'a-ex2-practice-q': 2,
  'b-ex5-practice-q': 1,
  'c-ex8-practice-q': 1,
  'c-ex9-practice-q': 1,
});

for (const lesson of [lessonA, lessonB, lessonC]) {
  const file = join(root, 'content/lessons', `${lesson.id}.json`);
  await writeFile(file, JSON.stringify(lesson, null, 2) + '\n');
  console.log(`寫入 ${file}（${lesson.slides.length} 頁）`);
}
