// 九上 1-4 相似三角形的應用：由 agent 依課本與教用版答案製作的 3 堂課。
// 來源清單：content/sources/g9-1-4-inventory.json（每題頁碼、題目、官方答案、截圖檔）。
// 產生：node scripts/lessons-src/g9-1-4.mjs  → content/lessons/g9-1-4*.json，再執行 npm run lessons 驗證。
// 例題、隨堂、錯誤分析的視覺化依課本解法逐步呈現（左圖右式）；隨堂的示範用另一組數字（自編），錯誤分析留「？」。
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as V from './viz.mjs';
import { textbookOnly } from './textbook-only.mjs';

const { G, C } = V;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fig = (file, alt, caption) => ({ src: `g9-1-4/${file}`, alt, ...(caption ? { caption } : {}) });
const src = (p) => `對應課本 1-4 p.${p}（題目數字同課本）`;
const srcVar = (p) => `對應課本 1-4 p.${p}；第 1 題為課本隨堂，其餘為換數字題（自編）`;
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
const seg = (s) => String.raw`$\overline{${s}}$`;

/* ───────────── 圖形（座標：x 0–20、y 0–11；左邊放圖，右邊放算式） ───────────── */
const VIEW = { xMin: 0, xMax: 20, yMin: 0, yMax: 11, aspect: 'equal' };
const R = (c, u, v, s, o) => G.right(c, u, v, s ?? 0.35, o);
const foot = (p, a, b) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  return [a[0] + t * dx, a[1] + t * dy];
};
const unit = (a, b) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]],
    l = Math.hypot(dx, dy);
  return [dx / l, dy / l];
};
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** 影子測高：人 A–C（影 B–C），樹 D–F（影 E–F）。labels：人高、人影、樹影、樹高。 */
function treeFigure({ h, s, S, H, scale = 1, hl = 1 }) {
  const y0 = 1.2,
    k = 1.1 * scale;
  const Cp = [0.6 + s * k, y0], Ap = [0.6 + s * k, y0 + h * k], Bp = [0.6, y0];
  const Ep = [Cp[0] + 1.2, y0], Fp = [Cp[0] + 1.2 + S * k, y0], Dp = [Fp[0], y0 + (typeof H === 'number' ? H : (h * S) / s) * k];
  return [
    G.seg([0.2, y0], [Fp[0] + 0.6, y0], { color: '#6b7394' }),
    G.poly([Bp, Cp, Ap], { fill: C.fViolet, color: C.violet }),
    G.poly([Ep, Fp, Dp], { fill: C.fTeal, color: C.teal }),
    G.seg(Ap, Bp, { color: C.orange, dash: true }),
    G.seg(Dp, Ep, { color: C.orange, dash: true }),
    R(Cp, [-1, 0], [0, 1]),
    R(Fp, [-1, 0], [0, 1]),
    G.lab(Ap[0], Ap[1] + 0.45, 'A', { size: 14 }),
    G.lab(Bp[0] - 0.1, y0 - 0.5, 'B', { size: 14 }),
    G.lab(Cp[0] + 0.1, y0 - 0.5, 'C', { size: 14 }),
    G.lab(Dp[0], Dp[1] + 0.45, 'D', { size: 14 }),
    G.lab(Ep[0], y0 - 0.5, 'E', { size: 14 }),
    G.lab(Fp[0] + 0.1, y0 - 0.5, 'F', { size: 14 }),
    G.lab(Cp[0] + 0.85, (Ap[1] + y0) / 2, `${h}`, { size: 13, color: C.violet }),
    G.lab((Bp[0] + Cp[0]) / 2, y0 - 1.1, `${s}`, { size: 13, color: '#b4541a' }),
    G.lab((Ep[0] + Fp[0]) / 2, y0 - 1.1, `${S}`, { size: 13, color: '#b4541a' }),
    G.lab(Fp[0] + 0.8, (Dp[1] + y0) / 2, typeof H === 'number' ? `${H}` : H, { size: 15, color: '#0f766e' }),
    G.angle(Cp, Bp, Ap, '', { step: hl }),
    G.angle(Fp, Ep, Dp, '', { step: hl }),
  ];
}
/** 兩個相似三角形＋從頂點到底邊的高（例 3、例 4、暖身）。 */
function altitudePair({ names = ['A', 'B', 'C', 'P', 'D', 'E', 'F', 'Q'], k = 0.55, hlStep, side = {} } = {}) {
  const [a, b, c, p, d, e, f, q] = names;
  const B = [0.4, 1.2], Cc = [5.6, 1.2], A = [2.2, 5.6], P = [A[0], 1.2];
  const off = 7.0;
  const T = (pt) => [off + (pt[0] - B[0]) * k, 1.2 + (pt[1] - 1.2) * k];
  const E = T(B), F = T(Cc), D = T(A), Q = [D[0], 1.2];
  const shapes = [
    G.poly([B, Cc, A], { fill: C.fBlue, color: C.blue }),
    G.poly([E, F, D], { fill: C.fBlue, color: C.blue }),
    G.seg(A, P, { color: C.red, width: 2.4 }),
    G.seg(D, Q, { color: C.red, width: 2.4 }),
    R(P, [1, 0], [0, 1], 0.3),
    R(Q, [1, 0], [0, 1], 0.25),
    G.lab(A[0], A[1] + 0.45, a, { size: 14 }),
    G.lab(B[0] - 0.2, 0.7, b, { size: 14 }),
    G.lab(Cc[0] + 0.2, 0.7, c, { size: 14 }),
    G.lab(P[0], 0.7, p, { size: 14, color: C.red }),
    G.lab(D[0], D[1] + 0.45, d, { size: 14 }),
    G.lab(E[0] - 0.2, 0.7, e, { size: 14 }),
    G.lab(F[0] + 0.2, 0.7, f, { size: 14 }),
    G.lab(Q[0], 0.7, q, { size: 14, color: C.red }),
  ];
  if (side.big) shapes.push(G.lab((B[0] + Cc[0]) / 2 + 0.6, 1.75, side.big, { size: 13, color: '#1d4fa3' }));
  if (side.small) shapes.push(G.lab((E[0] + F[0]) / 2 + 0.4, 1.75, side.small, { size: 13, color: '#1d4fa3' }));
  if (side.hBig) shapes.push(G.lab(A[0] - 0.65, 3.4, side.hBig, { size: 13, color: C.red }));
  if (side.hSmall) shapes.push(G.lab(D[0] - 0.6, 2.4, side.hSmall, { size: 13, color: C.red }));
  if (hlStep !== undefined)
    shapes.push(G.poly([A, B, P], { fill: C.fOrange, color: C.orange, step: hlStep }), G.poly([D, E, Q], { fill: C.fOrange, color: C.orange, step: hlStep }));
  return shapes.flat();
}
/** 直角三角形 ABC（∠C＝90°，A 在左下）。labels：{ AC, BC, AB, angle } */
function rightTri({ w = 8, hgt = 4.5, labels = {}, color = {}, x0 = 0.6, y0 = 1.2, hl = {} } = {}) {
  const A = [x0, y0], Cc = [x0 + w, y0], B = [x0 + w, y0 + hgt];
  const sh = [
    G.poly([A, Cc, B], { fill: C.fOrange, color: 'rgba(0,0,0,0)', width: 0.5 }),
    G.seg(A, Cc, { color: color.AC ?? C.blue, width: 3, ...(hl.AC !== undefined ? { focus: hl.AC } : {}) }),
    G.seg(Cc, B, { color: color.BC ?? C.red, width: 3, ...(hl.BC !== undefined ? { focus: hl.BC } : {}) }),
    G.seg(A, B, { color: color.AB ?? '#16824f', width: 3, ...(hl.AB !== undefined ? { focus: hl.AB } : {}) }),
    R(Cc, [-1, 0], [0, 1], 0.35),
    G.lab(A[0] - 0.35, y0 - 0.45, 'A', { size: 14 }),
    G.lab(Cc[0] + 0.35, y0 - 0.45, 'C', { size: 14 }),
    G.lab(B[0] + 0.35, B[1] + 0.35, 'B', { size: 14 }),
  ];
  if (labels.angle) sh.push(G.angle(Cc, A, B, labels.angle));
  if (labels.AC) sh.push(G.lab((A[0] + Cc[0]) / 2, y0 - 0.6, labels.AC, { size: 15, color: color.AC ?? C.blue }));
  if (labels.BC) sh.push(G.lab(B[0] + 0.9, (y0 + B[1]) / 2, labels.BC, { size: 15, color: color.BC ?? C.red }));
  if (labels.AB) sh.push(G.lab((A[0] + B[0]) / 2 - 0.6, (A[1] + B[1]) / 2 + 0.55, labels.AB, { size: 15, color: color.AB ?? '#16824f' }));
  return sh.flat();
}

/* ───────────────────── 第 1 堂：簡易測量與對應高 ───────────────────── */
const riverFig = () => {
  const A = [8.6, 2.2], Cc = [2.6, 2.2], D = [1.1, 2.2], E = [1.1, 1.2], B = [8.6, 6.2];
  return [
    { type: 'rect', x: 1.8, y: 2.8, w: 7.6, h: 2.8, fill: 'rgba(47,128,237,.14)', color: 'rgba(47,128,237,.35)', width: 1 },
    G.lab(5.6, 4.9, '河', { size: 15, color: '#1d4fa3' }),
    G.poly([A, Cc, B], { fill: C.fViolet, color: C.violet }),
    G.poly([D, Cc, E], { fill: C.fTeal, color: C.teal }),
    R(A, [-1, 0], [0, 1], 0.35),
    R(D, [1, 0], [0, -1], 0.3),
    G.lab(A[0] + 0.4, A[1] - 0.45, 'A', { size: 14 }),
    G.lab(B[0] + 0.4, B[1] + 0.3, 'B', { size: 14 }),
    G.lab(Cc[0] + 0.1, Cc[1] + 0.5, 'C', { size: 14 }),
    G.lab(D[0] - 0.4, D[1] + 0.4, 'D', { size: 14 }),
    G.lab(E[0] - 0.4, E[1] - 0.3, 'E', { size: 14 }),
    G.lab((A[0] + Cc[0]) / 2, 1.6, '20 步', { size: 13, color: C.violet }),
    G.lab(1.85, 2.75, '5 步', { size: 12, color: C.teal }),
    G.lab(0.4, 1.7, '2', { size: 13, color: C.teal }),
    G.lab(9.6, 4.2, '?', { size: 18, color: '#5a3fd6' }),
    G.angle(Cc, B, A, '', { step: 1 }),
    G.angle(Cc, E, D, '', { step: 1 }),
  ];
};
const riverPracticeFig = (ab, cd, bd) => {
  const k = 0.5;
  const B = [1, 1.2], A = [1, 1.2 + ab * k], x = (cd * bd) / (ab - cd), E = [1 + (bd + x) * k, 1.2], D = [1 + bd * k, 1.2], Cc = [D[0], 1.2 + cd * k];
  return [
    G.poly([A, B, E], { fill: C.fViolet, color: C.violet }),
    G.poly([Cc, D, E], { fill: C.fTeal, color: C.teal }),
    R(B, [1, 0], [0, 1], 0.35),
    R(D, [1, 0], [0, 1], 0.3),
    G.lab(A[0] - 0.4, A[1], 'A', { size: 14 }),
    G.lab(B[0] - 0.4, 0.7, 'B', { size: 14 }),
    G.lab(Cc[0] + 0.15, Cc[1] + 0.45, 'C', { size: 14 }),
    G.lab(D[0], 0.7, 'D', { size: 14 }),
    G.lab(E[0] + 0.35, 0.7, 'E', { size: 14 }),
    G.lab(0.4, (A[1] + B[1]) / 2, `${ab}`, { size: 13, color: C.violet }),
    G.lab(D[0] + 0.55, (Cc[1] + 1.2) / 2, `${cd}`, { size: 13, color: C.teal }),
    G.lab((B[0] + D[0]) / 2, 0.55, `${bd}`, { size: 13, color: C.ink }),
    G.lab((D[0] + E[0]) / 2, 0.55, 'x', { size: 14, color: '#5a3fd6' }),
  ];
};
const practiceAltFig = () => {
  // 隨堂（例 3）：高畫在 AB 上，C 到 AB 的垂足 M；△DEF 的高 FN
  const B = [0.6, 5.4], A = [5.6, 1.2], Cc = [2.4, 1.2];
  const M = foot(Cc, B, A);
  const k = 0.6, off = [6.2, 0];
  const T = (p) => [off[0] + p[0] * k, 1.2 + (p[1] - 1.2) * k];
  const E = T(B), D = T(A), F = T(Cc), N = foot(F, E, D);
  return [
    G.poly([B, Cc, A], { fill: C.fBlue, color: C.blue }),
    G.poly([E, F, D], { fill: C.fBlue, color: C.blue }),
    G.seg(Cc, M, { color: C.red, width: 2.4 }),
    G.seg(F, N, { color: C.red, width: 2.4 }),
    R(M, unit(M, B), unit(M, Cc), 0.3),
    R(N, unit(N, E), unit(N, F), 0.22),
    G.lab(B[0] - 0.3, B[1] + 0.35, 'B', { size: 14 }),
    G.lab(A[0] + 0.3, 0.7, 'A', { size: 14 }),
    G.lab(Cc[0], 0.7, 'C', { size: 14 }),
    G.lab(M[0] + 0.45, M[1] + 0.35, 'M', { size: 14, color: C.red }),
    G.lab(E[0] - 0.25, E[1] + 0.35, 'E', { size: 14 }),
    G.lab(D[0] + 0.3, 0.7, 'D', { size: 14 }),
    G.lab(F[0], 0.7, 'F', { size: 14 }),
    G.lab(N[0] + 0.4, N[1] + 0.3, 'N', { size: 14, color: C.red }),
  ];
};

const lessonA = {
  schemaVersion: 1,
  id: 'g9-1-4a',
  title: '1-4 相似三角形的應用（1）簡易測量與對應高',
  description: '從泰勒斯量金字塔出發：陽光是平行光，人和樹與影子形成相似直角三角形；用相似測樹高、河寬，並說明相似三角形「對應高的比＝對應邊的比」。例題與隨堂皆附課本截圖，解題過程逐步呈現，隨堂改為可即時批改的 IRS。',
  subject: '數學・九年級 1-4',
  duration: 45,
  objectives: ['能用 AA 相似性質說明影子測高、測河寬的兩個三角形相似', '能依對應邊成比例列式求出高度或距離', '能說明相似三角形對應高的比等於對應邊的比'],
  slides: [
    {
      id: 'a-warmup',
      phase: '提取練習',
      eyebrow: '01 / 先想起相似',
      title: '相似三角形，對應邊成比例',
      body: '1-3 學過：兩角對應相等就相似（AA），相似三角形對應邊成比例。先做三個暖身題。',
      source: '銜接 1-3 縮放與相似',
      interactive: {
        view: VIEW,
        shapes: [
          ...altitudePair({ names: ['A', 'B', 'C', '', 'D', 'E', 'F', ''], k: 0.62 }).filter((s) => s.type !== 'segment' || s.color !== C.red).slice(0, 2),
          G.lab(0.4, 0.7, 'B', { size: 14 }), G.lab(5.8, 0.7, 'C', { size: 14 }), G.lab(2.2, 6.05, 'A', { size: 14 }),
          G.lab(6.3, 0.7, 'E', { size: 14 }), G.lab(9.7, 0.7, 'F', { size: 14 }), G.lab(7.5, 4.4, 'D', { size: 14 }),
          G.lab(14.6, 7.5, String.raw`△ABC ～ △DEF`, { size: 20 }),
          G.lab(14.6, 6.0, String.raw`$\overline{AB}:\overline{DE}=\overline{BC}:\overline{EF}=\overline{CA}:\overline{FD}$`, { size: 18, color: '#5a3fd6' }),
        ],
        caption: '對應邊成比例：先找出「誰對誰」，再列比例式',
      },
      activity: num(
        'a-warmup-q',
        '暖身：直接寫出答案',
        [
          ['△ABC～△DEF，AB＝6、DE＝4、BC＝9，EF＝？', '6'],
          ['△ABC～△DEF，AB：DE＝3：2，AC＝12，DF＝？', '8'],
          ['x：4 ＝ 6：8，x ＝ ？', '3'],
        ],
        '(1) 6：4＝9：EF，EF＝6。(2) 3：2＝12：DF，DF＝8。(3) 8x＝24，x＝3。',
      ),
      notes: '提取練習：不公布答案前先看全班統計；答錯多的話先複習「對應邊」怎麼找。',
    },
    {
      id: 'a-predict',
      phase: '預測',
      eyebrow: '02 / 泰勒斯的問題',
      title: '影子可以量出金字塔有多高嗎？',
      body: '同一時刻，人的身高和影長的比，與樹高和樹影的比，會有什麼關係？先猜，下一頁動手驗證。',
      source: src(62),
      figures: [fig('intro-pyramid.png', '課本 p.62 泰勒斯量金字塔')],
      activity: {
        id: 'a-predict-q',
        type: 'single',
        prompt: '同一時刻，「身高÷影長」和「樹高÷樹影」的關係？',
        options: ['相等', '人的比較大', '樹的比較大', '不一定'],
        correct: [0],
        explanation: '陽光可視為平行光，同一時刻光線和地面的夾角相同，人與影、樹與影形成兩個相似直角三角形，所以比值相等。',
      },
      notes: '先公布統計、不公布答案，保留疑問到下一頁。',
    },
    {
      id: 'a-shadow',
      phase: '具體操作',
      eyebrow: '03 / 拖拉太陽',
      title: '太陽變高，影子會怎樣？',
      body: '拖拉太陽高度角和樹高，看看人和樹的「高 ÷ 影長」是不是永遠相等。',
      source: '補充（非課本）：影子測高的動態示意，對應課本 p.62–63',
      interactive: V.shadowExplore({ h: 1.6, H: 4, ang: 40 }),
      activity: {
        id: 'a-shadow-q',
        type: 'single',
        prompt: '太陽變高（高度角變大）時，人和樹的影子會？',
        options: ['都變短，但「高÷影長」仍然相等', '都變長', '人的影子變短、樹的影子變長', '「高÷影長」不再相等'],
        correct: [0],
        explanation: '高度角變大，影子都變短；但兩個三角形的角度仍相同（AA 相似），所以「高÷影長」仍相等。',
      },
      notes: '具體操作（CRA）。請學生說：哪兩個角相等，所以兩個三角形相似？（光線平行→同位角相等；都是直角）',
    },
    {
      id: 'a-ex1',
      phase: '工作範例',
      eyebrow: '04 / 例 1 測量樹高',
      title: '利用相似形測量樹高',
      body: '先找相似的兩個三角形，再列對應邊的比例式。先自己算，再按「下一步」對照課本的解法。',
      source: src(63),
      figures: [fig('ex1.png', '課本 p.63 例 1 題目'), fig('ex1-fig.png', '課本 p.63 例 1 附圖')],
      interactive: V.figSteps({
        view: VIEW,
        figure: treeFigure({ h: 1.6, s: 2, S: 5, H: 'x' }),
        top: 9.6,
        lines: [
          String.raw`∵ $\overline{AB}\parallel\overline{DE}$（陽光平行）`,
          String.raw`∴ ∠B ＝ ∠E，又 ∠C ＝ ∠F ＝ 90°`,
          String.raw`△ABC ～ △DEF（AA）`,
          String.raw`$\overline{AC}:\overline{DF}=\overline{BC}:\overline{EF}$`,
          '1.6 : x ＝ 2 : 5',
          '2x ＝ 8，x ＝ 4（公尺）',
        ],
        captions: ['陽光是平行光：AB ∥ DE', '同位角相等，兩個都是直角', 'AA 相似', '對應邊成比例（高對高、影對影）', '單位換成公尺：160 公分＝1.6 公尺、200 公分＝2 公尺', '樹高 4 公尺'],
        caption: '課本例 1 的方法：先說明相似，再列比例式',
      }),
      activity: num('a-ex1-q', '先自己算例 1', [['樹高是幾公尺？', '4']], '△ABC～△DEF（AA），1.6：x＝2：5，x＝4。'),
      notes: '工作範例：先讓學生試算（生成效應），再逐步講解。提醒單位要一致（公分換成公尺）。',
    },
    {
      id: 'a-ex1-practice',
      phase: '隨堂練習',
      eyebrow: '05 / 例 1 隨堂',
      title: '換你算：用影子測高',
      body: '第 1 題是課本隨堂，其餘是換數字題。左圖用另一組數字示範同樣的步驟。',
      source: srcVar(63),
      figures: [fig('ex1-practice.png', '課本 p.63 例 1 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: treeFigure({ h: 1.5, s: 1.2, S: 4, H: 'y', scale: 1.15 }),
        top: 9.4,
        lines: ['示範：身高 1.5 公尺、影長 1.2 公尺', '電線桿影長 4 公尺', '1.5 : y ＝ 1.2 : 4', '1.2y ＝ 6，y ＝ 5（公尺）'],
        captions: ['另一組數字（自編）', '同一時刻', '高對高、影對影', '電線桿高 5 公尺'],
      }),
      activity: num(
        'a-ex1-practice-q',
        '課本 p.63 隨堂：寫出高度（公尺）',
        [
          ['小翊身高 170 公分、影長 85 公分，建築物影長 15 公尺，建築物高？', '30'],
          ['身高 150 公分、影長 90 公分，旗桿影長 6 公尺，旗桿高？', '10'],
          ['樹高 6 公尺、影長 8 公尺，同時小明影長 2 公尺，小明身高幾公尺？', '1.5'],
        ],
        '(1) 1.7：y＝0.85：15，y＝30。(2) 1.5：y＝0.9：6，y＝10。(3) 6：h＝8：2，h＝1.5。',
      ),
      notes: '答案：(1) 30 公尺 (2) 10 公尺 (3) 1.5 公尺。常見錯誤：沒把公分換成公尺。',
    },
    {
      id: 'a-ex2',
      phase: '工作範例',
      eyebrow: '06 / 例 2 測量河寬',
      title: '不過河，也能量河寬',
      body: '小翊沿河岸走 20 步到 C、再走 5 步到 D，轉直角走到 E，讓 B、C、E 在同一直線。先自己算 AB，再看逐步解法。',
      source: src(64),
      figures: [fig('ex2.png', '課本 p.64 例 2 題目')],
      interactive: V.figSteps({
        view: VIEW,
        figure: riverFig(),
        top: 9.6,
        lines: [
          String.raw`∵ $\overline{AB}\perp\overline{AD}$、$\overline{DE}\perp\overline{AD}$`,
          String.raw`∴ $\overline{AB}\parallel\overline{DE}$，∠B ＝ ∠E（內錯角）`,
          '又 ∠A ＝ ∠D ＝ 90°',
          '∴ △ABC ～ △DEC（AA）',
          String.raw`$\overline{AB}:\overline{DE}=\overline{CA}:\overline{CD}$`,
          String.raw`$\overline{AB}$ : 2 ＝ 20 : 5`,
          String.raw`5$\overline{AB}$ ＝ 40，$\overline{AB}$ ＝ 8（公尺）`,
        ],
        captions: ['兩條線都垂直 AD', '同垂直的兩直線平行，內錯角相等', '兩個都是直角', 'AA 相似', '對應邊成比例', '步數一樣大，直接用步數的比', '河寬 8 公尺'],
        caption: '課本例 2 的方法：造出兩個相似的直角三角形',
      }),
      activity: num('a-ex2-q', '先自己算例 2', [['河寬 AB 是幾公尺？', '8']], '△ABC～△DEC（AA），AB：2＝20：5，AB＝8。'),
      notes: '可讓學生想：為什麼要讓 B、C、E 在同一直線？（才有對頂角 / 內錯角，兩個三角形才相似）',
    },
    {
      id: 'a-ex2-practice',
      phase: '隨堂練習',
      eyebrow: '07 / 例 2 隨堂',
      title: '換你算：測量河寬',
      body: '第 1 題是課本隨堂，其餘是換數字題。注意大三角形的底是 BD ＋ DE。左圖用另一組數字示範。',
      source: srcVar(64),
      figures: [fig('ex2-practice.png', '課本 p.64 例 2 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: riverPracticeFig(9, 3, 10),
        top: 9.6,
        lines: [
          '∵ ∠B ＝ ∠CDE ＝ 90°，∠E ＝ ∠E',
          '∴ △ABE ～ △CDE（AA）',
          String.raw`$\overline{AB}:\overline{CD}=\overline{BE}:\overline{DE}$`,
          '示範：9 : 3 ＝ (10 ＋ x) : x',
          '9x ＝ 30 ＋ 3x，6x ＝ 30',
          'x ＝ 5（公尺）',
        ],
        captions: ['兩個直角＋共用的角 E', 'AA 相似', '大三角形的底是 BD＋DE', '另一組數字（自編）：AB＝9、CD＝3、BD＝10', '交叉相乘', '河寬 5 公尺'],
      }),
      activity: num(
        'a-ex2-practice-q',
        '課本 p.64 隨堂：河寬 DE（公尺）',
        [
          ['AB＝10、CD＝4、BD＝9，DE＝？', '6'],
          ['AB＝8、CD＝2、BD＝12，DE＝？', '4'],
          ['AB＝15、CD＝5、BD＝16，DE＝？', '8'],
        ],
        '(1) 10：4＝(9＋x)：x，6x＝36，x＝6。(2) 8x＝2(12＋x)，x＝4。(3) 15x＝5(16＋x)，x＝8。',
      ),
      notes: '答案：(1) 6 (2) 4 (3) 8。常見錯誤：把 BE 寫成 BD。',
    },
    {
      id: 'a-ex3',
      phase: '工作範例',
      eyebrow: '08 / 例 3 對應高',
      title: '對應高的比 ＝ 對應邊的比',
      body: '高把三角形切出兩個直角三角形，找出哪兩個相似，就能說明。先自己想，再按「下一步」。',
      source: src(65),
      figures: [fig('ex3.png', '課本 p.65 例 3 題目'), fig('keybox-height.png', '課本 p.65 兩個相似三角形的對應高關係')],
      interactive: V.figSteps({
        view: VIEW,
        figure: altitudePair({ hlStep: 2 }),
        top: 9.4,
        x: 15,
        lines: [
          '∵ △ABC ～ △DEF，∴ ∠B ＝ ∠E',
          '又 ∠APB ＝ ∠DQE ＝ 90°',
          '∴ △ABP ～ △DEQ（AA）',
          String.raw`$\overline{AP}:\overline{DQ}=\overline{AB}:\overline{DE}$`,
          '對應高的比 ＝ 對應邊的比',
        ],
        captions: ['相似三角形對應角相等', '高和底邊垂直', '橘色的兩個直角三角形相似', '對應邊成比例', '這就是課本的重點'],
        caption: '課本例 3 的說明：用「高切出來的直角三角形」相似',
      }),
      activity: num('a-ex3-q', '用例 3 的結論算', [['△ABC～△DEF，AB：DE＝5：3，對應高 AP＝10，DQ＝？', '6']], '對應高的比＝對應邊的比，10：DQ＝5：3，DQ＝6。'),
      notes: '說明題。先問：要證明兩條高的比，需要哪兩個三角形相似？再逐步揭示。',
    },
    {
      id: 'a-ex3-practice',
      phase: '隨堂練習',
      eyebrow: '09 / 例 3 隨堂',
      title: '換你算：已知對應高求邊長',
      body: '第 1 題是課本隨堂，其餘是換數字題。左圖用另一組數字示範。',
      source: srcVar(65),
      figures: [fig('ex3-practice.png', '課本 p.65 例 3 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: practiceAltFig(),
        top: 9.4,
        x: 15,
        lines: ['∵ △ABC ～ △DEF', '∴ 對應高的比 ＝ 對應邊的比', String.raw`$\overline{BC}:\overline{EF}=\overline{CM}:\overline{FN}$`, String.raw`示範：15 : $\overline{EF}$ ＝ 5 : 3`, String.raw`5$\overline{EF}$ ＝ 45，$\overline{EF}$ ＝ 9`],
        captions: ['已知相似', '用例 3 的結論', 'CM、FN 是對應高', '另一組數字（自編）：BC＝15、CM：FN＝5：3', 'EF＝9'],
      }),
      activity: num(
        'a-ex3-practice-q',
        '課本 p.65 隨堂：求邊長',
        [
          ['CM：FN＝3：2、BC＝12，EF＝？', '8'],
          ['CM：FN＝4：3、BC＝20，EF＝？', '15'],
          ['CM＝6、FN＝4、AB＝9，DE＝？', '6'],
        ],
        '(1) 12：EF＝3：2，EF＝8。(2) 20：EF＝4：3，EF＝15。(3) 9：DE＝6：4，DE＝6。',
      ),
      notes: '答案：(1) 8 (2) 15 (3) 6。',
    },
    {
      id: 'a-error',
      phase: '錯誤分析',
      eyebrow: '10 / 當小老師',
      title: '小明寫：1.5 : 6 ＝ 2 : x，樹高 x ＝ 8',
      body: '小明身高 1.5 公尺、影長 2 公尺，樹影 6 公尺。他的答案對嗎？在畫布圈出錯誤、寫出正確算法與理由，也可以拍照上傳。',
      source: '錯誤示例（自編），對應課本 p.63',
      interactive: V.figSteps({
        view: VIEW,
        figure: treeFigure({ h: 1.5, s: 2, S: 6, H: "x", scale: 0.85 }),
        top: 9.4,
        lines: ['小明：1.5 : 6 ＝ 2 : x', '人的高對應樹的？', '人的影長對應？', '正確的比例式 ＝ ？'],
        captions: ['小明的算式', '先找對應：高對高', '影對影', '自己寫出來'],
      }),
      activity: {
        id: 'a-error-q',
        type: 'canvas',
        prompt: '小明寫 1.5 : 6 ＝ 2 : x，得樹高 x ＝ 8。① 圈出錯誤 ② 寫出正確比例式與答案 ③ 說明理由',
        canvas: 'grid',
        allowPhoto: true,
        aiAllowed: true,
        rubric: rubric(
          [
            crit('find', '找出錯誤', [[0, '未指出錯誤'], [1, '只說錯了，沒說錯在哪'], [2, '指出把人的高和樹影（不是對應邊）放在一起']]),
            crit('fix', '正確計算', [[0, '答案錯誤或未作答'], [1, '比例式正確但計算錯'], [2, '1.5：x＝2：6，x＝4.5 公尺']]),
            crit('why', '說明理由', [[0, '沒有理由'], [1, '只寫比例式'], [2, '說明兩個三角形相似，高對高、影對影（對應邊成比例）']]),
          ],
          '△人～△樹（AA），對應邊成比例：人高：樹高＝人影：樹影，1.5：x＝2：6，x＝4.5（公尺）。小明把人高和樹影配成一對，不是對應邊。',
          '接受 1.5：2＝x：6（同一個三角形的高：影）的寫法。',
        ),
      },
      notes: '收件後按「AI 批改」，覆核後發回；挑兩種寫法（高：高＝影：影、高：影＝高：影）比較。',
    },
    {
      id: 'a-exit',
      phase: '出場券',
      eyebrow: '11 / 用自己的話說',
      title: '為什麼影子可以用來量高度？',
      body: '用一到兩句話說明：同一時刻，為什麼人和樹的「高 ÷ 影長」會相等？',
      visual: 'steps',
      bullets: ['說出哪兩個三角形相似', '說出相似的理由（哪兩個角相等）', '寫出比例式'],
      activity: {
        id: 'a-exit-q',
        type: 'short',
        prompt: '同一時刻，為什麼人和樹的「高 ÷ 影長」會相等？',
        aiAllowed: true,
        rubric: rubric(
          [
            crit('similar', '說出相似', [[0, '沒有提到相似'], [2, '說出人與影、樹與影形成兩個相似的直角三角形']]),
            crit('reason', '相似的理由', [[0, '沒有理由'], [1, '只說角度一樣'], [2, '陽光平行→光線與地面夾角相等，且都是直角（AA）']]),
          ],
          '陽光是平行光，同一時刻光線和地面的夾角相同，人和樹都垂直地面，所以兩個直角三角形 AA 相似，對應邊成比例，高÷影長相等。',
        ),
      },
    },
    reflect('a-reflect', '我能用相似三角形測量高度、距離，並說明對應高的比'),
  ],
};

/* ───────────────────── 第 2 堂：面積與邊長、中點連線 ───────────────────── */
const ex4PracticeFig = (ab, ac) => {
  const bc = Math.hypot(ab, ac), s = 9 / bc;
  const B = [0.5, 1.2], Cc = [9.5, 1.2];
  const A = [0.5 + ((ab * ab) / bc) * s, 1.2 + ((ab * ac) / bc) * s];
  const D = mid(A, B), E = [D[0], 1.2];
  return [
    G.poly([A, B, Cc], { fill: C.fViolet, color: C.violet }),
    G.poly([E, B, D], { fill: C.fOrange, color: C.orange, step: 1 }),
    G.seg(D, E, { color: C.ink, width: 2 }),
    R(E, [-1, 0], [0, 1], 0.3),
    R(A, unit(A, B), unit(A, Cc), 0.35),
    G.lab(A[0] + 0.1, A[1] + 0.45, 'A', { size: 14 }),
    G.lab(B[0] - 0.3, 0.7, 'B', { size: 14 }),
    G.lab(Cc[0] + 0.3, 0.7, 'C', { size: 14 }),
    G.lab(D[0] - 0.35, D[1] + 0.4, 'D', { size: 14 }),
    G.lab(E[0], 0.7, 'E', { size: 14 }),
    G.lab((A[0] + B[0]) / 2 - 0.9, (A[1] + B[1]) / 2 + 0.7, `${ab}`, { size: 13, color: C.violet }),
    G.lab((A[0] + Cc[0]) / 2 + 0.5, (A[1] + Cc[1]) / 2 + 0.4, `${ac}`, { size: 13, color: C.violet }),
  ];
};
const midpointFig = ({ A = [4, 6.6], B = [0.5, 1.2], Cc = [9.6, 1.8], labels = {}, fourStep } = {}) => {
  const D = mid(B, Cc), E = mid(A, Cc), F = mid(A, B);
  const sh = [
    G.poly([A, B, Cc], { fill: 'rgba(255,201,60,.18)', color: C.ink }),
    G.poly([D, E, F], { fill: C.fOrange, color: C.orange }),
    G.lab(A[0], A[1] + 0.45, 'A', { size: 14 }),
    G.lab(B[0] - 0.35, B[1] - 0.3, 'B', { size: 14 }),
    G.lab(Cc[0] + 0.35, Cc[1] - 0.3, 'C', { size: 14 }),
    G.lab(D[0], D[1] - 0.55, 'D', { size: 14 }),
    G.lab(E[0] + 0.45, E[1] + 0.2, 'E', { size: 14 }),
    G.lab(F[0] - 0.45, F[1] + 0.2, 'F', { size: 14 }),
  ];
  if (labels.DE) sh.push(G.lab((D[0] + E[0]) / 2 + 0.45, (D[1] + E[1]) / 2 - 0.2, labels.DE, { size: 13, color: '#b4541a' }));
  if (labels.DF) sh.push(G.lab((D[0] + F[0]) / 2 - 0.45, (D[1] + F[1]) / 2 - 0.2, labels.DF, { size: 13, color: '#b4541a' }));
  if (labels.EF) sh.push(G.lab((E[0] + F[0]) / 2, (E[1] + F[1]) / 2 + 0.35, labels.EF, { size: 13, color: '#b4541a' }));
  if (labels.right) sh.push(R(D, unit(D, E), unit(D, F), 0.3));
  if (fourStep !== undefined)
    sh.push(
      G.poly([A, F, E], { fill: C.fBlue, color: C.blue, step: fourStep }),
      G.poly([F, B, D], { fill: C.fBlue, color: C.blue, step: fourStep }),
      G.poly([E, D, Cc], { fill: C.fBlue, color: C.blue, step: fourStep }),
    );
  return sh.flat();
};

const lessonB = {
  schemaVersion: 1,
  id: 'g9-1-4b',
  title: '1-4 相似三角形的應用（2）面積與邊長、中點連線',
  description: '用「小三角形拼成大三角形」看見面積比＝邊長比的平方，跟著課本推導面積比，練習例 4，再用中點連線性質求周長與面積。例題與隨堂附課本截圖，解題過程逐步呈現，隨堂改為可即時批改的 IRS。',
  subject: '數學・九年級 1-4',
  duration: 45,
  objectives: ['能說明相似三角形面積的比等於對應邊長平方的比', '能由相似比求面積，或由面積比求相似比', '能用中點連線性質求三角形的周長與面積'],
  slides: [
    {
      id: 'b-warmup',
      phase: '提取練習',
      eyebrow: '01 / 先想起上一節',
      title: '對應高的比 ＝ 對應邊的比',
      body: '先想起上一節的結論，再暖身三題。',
      source: '銜接 1-4 p.65',
      interactive: { view: VIEW, shapes: [...altitudePair({ side: { big: '4', small: '3', hBig: '8', hSmall: '?' } }), G.lab(15, 7.6, '對應高的比 ＝ 對應邊的比', { size: 19 }), G.lab(15, 6.2, String.raw`$\overline{AP}:\overline{DQ}=\overline{BC}:\overline{EF}$`, { size: 19, color: '#5a3fd6' })], caption: '上一節的重點' },
      activity: num(
        'b-warmup-q',
        '暖身：直接寫出答案',
        [
          ['△ABC～△DEF，BC：EF＝4：3，高 AP＝8，DQ＝？', '6'],
          ['底 6、高 4 的三角形面積＝？', '12'],
          ['兩個正方形邊長 2 和 6，面積比 1：？', '9'],
        ],
        '(1) 8：DQ＝4：3，DQ＝6。(2) ½×6×4＝12。(3) 4：36＝1：9。',
      ),
      notes: '第 3 題為下一頁的預測鋪路：邊長 3 倍、面積 9 倍。',
    },
    {
      id: 'b-predict',
      phase: '預測',
      eyebrow: '02 / 先猜',
      title: '三角形放大 2 倍，面積變成幾倍？',
      body: '邊長都變成 2 倍（相似比 1：2），面積會變成幾倍？先猜，下一頁用小三角形拼拼看。',
      source: '對應課本 p.66 的問題',
      visual: 'cards',
      activity: { id: 'b-predict-q', type: 'single', prompt: '相似比 1：2，面積比是？', options: ['1：2', '1：4', '1：8', '不一定'], correct: [1], explanation: '面積比＝對應邊長平方的比＝1²：2²＝1：4。' },
      notes: '先公布統計、不公布答案，下一頁用拼圖驗證。',
    },
    {
      id: 'b-explore',
      phase: '具體操作',
      eyebrow: '03 / 拼拼看',
      title: '大三角形可以切成幾個小三角形？',
      body: '拖拉 k：邊長是 k 倍的大三角形，可以切成幾個原來的小三角形？',
      source: '補充（非課本）：面積比的拼圖示意，對應課本 p.66',
      interactive: V.triangleTiles({ k: 2 }),
      activity: {
        id: 'b-explore-q',
        type: 'manipulate',
        prompt: '把 k 調到「大三角形可以切成 9 個小三角形」，再按「送出我的操作」。',
        check: 'k==3',
        record: ['k'],
        explanation: 'k＝3：邊長 3 倍，面積 3²＝9 倍。',
      },
      notes: '具體操作（CRA）。完成後請學生說：邊長 3 倍為什麼面積是 9 倍？（長和高都變 3 倍）',
    },
    {
      id: 'b-area',
      phase: '圖式連結',
      eyebrow: '04 / 跟著課本推導',
      title: '面積的比 ＝ 對應邊長平方的比',
      body: '三角形面積是 ½ × 底 × 高。底的比和高的比都等於相似比，所以面積比是相似比的平方。按「下一步」看推導。',
      source: src(66),
      figures: [fig('explore-area.png', '課本 p.66 面積比的說明'), fig('keybox-area.png', '課本 p.66 兩個相似三角形的面積關係')],
      interactive: V.figSteps({
        view: VIEW,
        figure: altitudePair({}),
        top: 9.8,
        x: 15,
        gap: 2.2,
        lines: [
          String.raw`$\overline{AP}:\overline{DQ}=\overline{BC}:\overline{EF}$（對應高）`,
          String.raw`$\dfrac{△ABC}{△DEF}=\dfrac{\frac12\,\overline{BC}\times\overline{AP}}{\frac12\,\overline{EF}\times\overline{DQ}}$`,
          String.raw`$=\dfrac{\overline{BC}}{\overline{EF}}\times\dfrac{\overline{AP}}{\overline{DQ}}=\dfrac{\overline{BC}^2}{\overline{EF}^2}$`,
          '面積的比 ＝ 對應邊長平方的比',
        ],
        captions: ['上一節：對應高的比＝對應邊的比', '面積＝½×底×高', '高的比換成邊的比', '課本的重點'],
      }),
      activity: { id: 'b-area-q', type: 'single', prompt: '兩個相似三角形的相似比 2：3，面積比是？', options: ['2：3', '4：9', '4：6', '8：27'], correct: [1], explanation: '面積比＝2²：3²＝4：9。' },
      notes: '圖式連結：拼圖（具體）→ 公式推導（抽象）。',
    },
    {
      id: 'b-ex4',
      phase: '工作範例',
      eyebrow: '05 / 例 4',
      title: '已知面積，求另一個三角形的面積',
      body: '對應高的比就是相似比。先自己算，再按「下一步」對照。',
      source: src(67),
      figures: [fig('ex4.png', '課本 p.67 例 4 題目')],
      interactive: V.figSteps({
        view: VIEW,
        figure: altitudePair({ names: ['A', 'B', 'C', 'H', 'D', 'E', 'F', 'K'], side: { hBig: '3', hSmall: '2' } }),
        top: 9.6,
        x: 15,
        lines: ['設 △DEF 的面積為 x', String.raw`$\overline{BC}:\overline{EF}=\overline{AH}:\overline{DK}$ ＝ 3 : 2`, '面積比 ＝ 對應邊長平方的比', '18 : x ＝ 3² : 2²', '9x ＝ 72，x ＝ 8'],
        captions: ['設未知數', '對應高的比＝相似比', '面積比是平方', '代入', '△DEF 的面積是 8'],
        caption: '課本例 4 的方法',
      }),
      activity: num('b-ex4-q', '先自己算例 4', [['△DEF 的面積＝？', '8']], 'BC：EF＝AH：DK＝3：2，18：x＝9：4，x＝8。'),
      notes: '常見錯誤：直接用 3：2 算面積（得 12）。',
    },
    {
      id: 'b-ex4-practice',
      phase: '隨堂練習',
      eyebrow: '06 / 例 4 隨堂',
      title: '換你算：面積比',
      body: '第 1 題是課本隨堂 (2)，其餘是換數字題。面積比請寫成分數，例如 4/25。左圖用另一組數字示範。',
      source: srcVar(67),
      figures: [fig('ex4-practice.png', '課本 p.67 例 4 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: ex4PracticeFig(12, 5),
        top: 9.6,
        lines: ['∠B ＝ ∠B，∠DEB ＝ ∠A ＝ 90°', '∴ △EBD ～ △ABC（AA）', String.raw`示範：$\overline{BC}=\sqrt{12^2+5^2}$ ＝ 13`, String.raw`$\overline{BD}$ ＝ ½ × 12 ＝ 6`, '面積比 ＝ 6² : 13² ＝ 36 : 169'],
        captions: ['一個共用角＋一個直角', 'AA 相似（D 對應 C）', '另一組數字（自編）：AB＝12、AC＝5', 'D 是 AB 中點', 'BD 對應 BC'],
      }),
      activity: num(
        'b-ex4-practice-q',
        '課本 p.67 隨堂 (2)：△EBD 面積 ÷ △ABC 面積（寫成分數）',
        [
          ['AB＝8、AC＝6，D 是 AB 中點', '4/25'],
          ['AB＝8、AC＝6，但 BD＝2', '1/25'],
          ['AB＝15、AC＝8，BD＝5', '25/289'],
        ],
        '(1) BC＝10、BD＝4，4²：10²＝4：25。(2) 2²：10²＝1：25。(3) BC＝17，5²：17²＝25：289。',
      ),
      notes: '課本 (1) 請學生口頭說明 AA 相似；(2) 答案 4：25。換數字題：(2) 1/25 (3) 25/289。',
    },
    {
      id: 'b-midpoint',
      phase: '圖式連結',
      eyebrow: '07 / 中點連線',
      title: '三邊中點連起來，得到什麼三角形？',
      body: '跟著課本說明：中點三角形和原三角形相似，相似比 1：2。按「下一步」看周長與面積。',
      source: src(68),
      figures: [fig('explore-midpoint.png', '課本 p.68 中點連線的說明'), fig('keybox-midpoint.png', '課本 p.68 三角形各邊中點連線段性質')],
      interactive: V.figSteps({
        view: VIEW,
        figure: midpointFig({ fourStep: 4 }),
        top: 9.6,
        lines: [
          'D、E、F 是三邊中點',
          String.raw`$\overline{ED}=\frac12\overline{AB}$、$\overline{FE}=\frac12\overline{BC}$、$\overline{FD}=\frac12\overline{AC}$`,
          '△DEF ～ △ABC（SSS），相似比 1 : 2',
          '周長 ＝ ½ △ABC 周長',
          '面積 ＝ (½)² ＝ ¼ △ABC 面積',
        ],
        captions: ['連接三邊中點', '兩邊中點連線段＝第三邊的一半', 'SSS 相似', '周長比＝相似比', '面積比＝相似比的平方：切成 4 個一樣的三角形'],
      }),
      activity: { id: 'b-midpoint-q', type: 'single', prompt: '中點三角形 △DEF 的面積是 △ABC 的幾分之幾？', options: ['1/2', '1/3', '1/4', '1/8'], correct: [2], explanation: '相似比 1：2，面積比 1：4。' },
      notes: '學習時光機：三角形兩邊中點連線段平行第三邊且等於第三邊的一半（八下）。',
    },
    {
      id: 'b-midpoint-practice',
      phase: '隨堂練習',
      eyebrow: '08 / 中點連線 隨堂',
      title: '換你算：由中點三角形求原三角形',
      body: '前兩題是課本隨堂，第 3 題換數字。左圖用另一組數字示範。',
      source: srcVar(68),
      figures: [fig('midpoint-practice.png', '課本 p.68 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: midpointFig({ A: [3.5, 5.44], B: [0.5, 1.2], Cc: [9.5, 1.2], labels: { DE: '5', DF: '12', EF: '?', right: true } }),
        top: 9.6,
        lines: [String.raw`示範：$\overline{EF}=\sqrt{5^2+12^2}$ ＝ 13`, '△DEF 周長 ＝ 5 ＋ 12 ＋ 13 ＝ 30', '△DEF 面積 ＝ ½ × 5 × 12 ＝ 30', '△ABC 周長 ＝ 2 × 30 ＝ 60', '△ABC 面積 ＝ 4 × 30 ＝ 120'],
        captions: ['另一組數字（自編）：DE＝5、DF＝12、∠FDE＝90°', '先算中點三角形的周長', '再算面積', '周長是 2 倍', '面積是 4 倍'],
      }),
      activity: num(
        'b-midpoint-practice-q',
        '課本 p.68 隨堂：求 △ABC',
        [
          ['DE＝3、DF＝4、∠FDE＝90°，△ABC 周長＝？', '24'],
          ['同上，△ABC 面積＝？', '24'],
          ['DE＝6、DF＝8、∠FDE＝90°，△ABC 周長＝？', '48'],
        ],
        '(1) EF＝5，2×(3＋4＋5)＝24。(2) 4×(½×3×4)＝24。(3) EF＝10，2×24＝48。',
      ),
      notes: '答案：(1) 24 (2) 24 (3) 48。',
    },
    {
      id: 'b-mixed',
      phase: '交錯練習',
      eyebrow: '09 / 比一比',
      title: '高、周長、面積：哪個要平方？',
      body: '相似比知道了，對應高、周長、面積的比各是多少？哪一個要平方？想清楚再選，可以複選。',
      source: '自編題，對應課本 p.65–68',
      visual: 'cards',
      activity: {
        id: 'b-mixed-q',
        type: 'multiple',
        prompt: '選出所有正確的敘述（可複選）',
        options: ['相似比 3：4，對應高的比也是 3：4', '相似比 3：4，周長比是 9：16', '面積比 4：9，相似比是 2：3', '中點三角形的周長是原三角形的 1/4'],
        correct: [0, 2],
        explanation: '周長比＝相似比＝3：4（不是 9：16）；中點三角形周長是原來的 1/2、面積才是 1/4。',
      },
      notes: '交錯練習：把三種比混在一起，檢查學生是否會亂套平方。',
    },
    {
      id: 'b-error',
      phase: '錯誤分析',
      eyebrow: '10 / 當小老師',
      title: '小美寫：相似比 2 : 3，所以面積 8 : 12',
      body: '△ABC～△DEF，相似比 2：3，△ABC 面積 8。小美算出 △DEF 面積是 12。在畫布圈出錯誤、寫出正確答案與理由，也可以拍照上傳。',
      source: '錯誤示例（自編），對應課本 p.66–67',
      interactive: V.figSteps({
        view: VIEW,
        figure: altitudePair({}),
        top: 9.4,
        x: 15,
        lines: ['小美：8 : x ＝ 2 : 3，x ＝ 12', '相似比 2 : 3', '面積比 ＝ ？', '8 : x ＝ ？'],
        captions: ['小美的算式', '已知', '面積比和相似比的關係是？', '自己算出來'],
      }),
      activity: {
        id: 'b-error-q',
        type: 'canvas',
        prompt: '小美寫「相似比 2：3，8：x＝2：3，x＝12」。① 圈出錯誤 ② 寫出正確算法與答案 ③ 說明理由',
        canvas: 'grid',
        allowPhoto: true,
        aiAllowed: true,
        rubric: rubric(
          [
            crit('find', '找出錯誤', [[0, '未指出錯誤'], [1, '只說錯了'], [2, '指出面積比不是相似比，應該是相似比的平方']]),
            crit('fix', '正確計算', [[0, '答案錯誤或未作答'], [1, '列式正確但計算錯'], [2, '8：x＝2²：3²＝4：9，x＝18']]),
            crit('why', '說明理由', [[0, '沒有理由'], [1, '只寫公式'], [2, '說明面積＝½×底×高，底和高都按相似比放大，所以面積比是平方']]),
          ],
          '面積比＝對應邊長平方的比＝4：9，8：x＝4：9，4x＝72，x＝18。小美把面積比當成相似比。',
        ),
      },
      notes: '收件後按「AI 批改」，覆核後發回；可請學生用上一頁的拼圖說明。',
    },
    {
      id: 'b-exit',
      phase: '出場券',
      eyebrow: '11 / 用自己的話說',
      title: '為什麼邊長變 3 倍，面積會變 9 倍？',
      body: '用一到兩句話說明，可以用拼圖或面積公式當理由。',
      visual: 'steps',
      bullets: ['說出底怎麼變', '說出高怎麼變', '說出面積怎麼變'],
      activity: {
        id: 'b-exit-q',
        type: 'short',
        prompt: '為什麼三角形的邊長變 3 倍（相似），面積會變 9 倍？',
        aiAllowed: true,
        rubric: rubric(
          [
            crit('base', '底與高', [[0, '沒有提到'], [1, '只說邊長變 3 倍'], [2, '說出底和高（對應高）都變 3 倍']]),
            crit('area', '面積', [[0, '沒有說明'], [2, '面積＝½×底×高，所以變 3×3＝9 倍（或拼圖：可切成 9 個小三角形）']]),
          ],
          '相似三角形的底和對應高都變 3 倍，面積＝½×底×高，所以面積變 3×3＝9 倍；也可以把大三角形切成 9 個小三角形。',
        ),
      },
    },
    reflect('b-reflect', '我能用相似比求面積，並用中點連線性質求周長與面積'),
  ],
};

/* ───────────────────── 第 3 堂：相似直角三角形與三角比 ───────────────────── */
const S3 = Math.sqrt(3);
const lessonC = {
  schemaVersion: 1,
  id: 'g9-1-4c',
  title: '1-4 相似三角形的應用（3）相似直角三角形與 sin、cos、tan',
  description: '從無障礙坡道看見：角度固定的直角三角形都相似，任兩邊的比值固定。認識 sin、cos、tan，解決生活問題，並用 45°-45°-90°、30°-60°-90° 的邊長比計算。例題與隨堂附課本截圖，解題過程逐步呈現，隨堂改為可即時批改的 IRS。',
  subject: '數學・九年級 1-4',
  duration: 45,
  objectives: ['能說明銳角固定時，直角三角形任兩邊的比值固定', '能寫出 sin A、cos A、tan A 並求值，用來解生活問題', '能用特殊直角三角形的邊長比 1：1：√2、1：√3：2 求邊長'],
  slides: [
    {
      id: 'c-warmup',
      phase: '提取練習',
      eyebrow: '01 / 先想起畢氏定理與相似',
      title: '直角三角形：畢氏定理與相似',
      body: '這節課會一直用到直角三角形的邊長。先暖身三題。',
      source: '銜接 1-3 相似、八上畢氏定理',
      interactive: { view: VIEW, shapes: [...rightTri({ w: 8, hgt: 6, labels: { AC: 'b', BC: 'a', AB: 'c' } }), G.lab(15, 7.4, String.raw`$a^2+b^2=c^2$`, { size: 22, color: '#5a3fd6' }), G.lab(15, 5.6, '斜邊 c 對著直角', { size: 17 })], caption: '畢氏定理：兩股平方和＝斜邊平方' },
      activity: num(
        'c-warmup-q',
        '暖身：直接寫出答案',
        [
          ['直角三角形兩股 6、8，斜邊＝？', '10'],
          ['直角三角形斜邊 13、一股 5，另一股＝？', '12'],
          ['△ABC～△A′B′C′，AB＝3、BC＝4、A′B′＝6，B′C′＝？', '8'],
        ],
        '(1) √(36＋64)＝10。(2) √(169－25)＝12。(3) 3：6＝4：B′C′，B′C′＝8。',
      ),
      notes: '提取練習：畢氏定理與相似比，是本節求邊長的兩個工具。',
    },
    {
      id: 'c-ramp',
      phase: '預測',
      eyebrow: '02 / 無障礙坡道',
      title: '坡度固定，比值會變嗎？',
      body: '先猜：坡道加長（三角形變大），「高度差 ÷ 水平長度」會變嗎？送出後拖拉坡道長度和角度驗證。',
      source: src(69),
      figures: [fig('ramp.png', '課本 p.69 無障礙坡道'), fig('ramp-ratio.png', '課本 p.69 相似直角三角形')],
      interactive: V.rampExplore({ ang: 25, s: 2 }),
      activity: {
        id: 'c-ramp-q',
        type: 'single',
        prompt: '坡度角固定、坡道加長時，「高度差 ÷ 水平長度」會？',
        options: ['不變', '變大', '變小', '不一定'],
        correct: [0],
        explanation: '角度固定的直角三角形都相似（AA），對應邊成比例，所以任兩邊的比值固定。',
      },
      notes: '提取 1-3 的相似＋引入新概念：角度決定比值。坡度 1/12 的例子：高度差 20 公分→水平長度 240 公分。',
    },
    {
      id: 'c-def',
      phase: '概念建立',
      eyebrow: '03 / 給比值取名字',
      title: '對邊、鄰邊、斜邊：sin、cos、tan',
      body: '在直角三角形中，∠A 的對邊 a、鄰邊 b、斜邊 c。拖拉 ∠A，看三個比值怎麼變。',
      source: src(70),
      figures: [fig('trig-def.png', '課本 p.70 直角三角形的邊長比值'), fig('keybox-trig.png', '課本 p.70 Key point')],
      interactive: {
        view: { xMin: -0.6, xMax: 17, yMin: -1.4, yMax: 8.6, aspect: 'equal' },
        params: [{ id: 'ang', label: '∠A', min: 10, max: 75, step: 1, value: 30, unit: '°' }],
        shapes: [
          { type: 'polygon', points: [[0, 0], ['7*cos(ang)', 0], ['7*cos(ang)', '7*sin(ang)']], fill: C.fOrange, color: 'rgba(0,0,0,0)', width: 0.5 },
          G.seg([0, 0], ['7*cos(ang)', 0], { color: C.blue, width: 3 }),
          G.seg(['7*cos(ang)', 0], ['7*cos(ang)', '7*sin(ang)'], { color: C.red, width: 3 }),
          G.seg([0, 0], ['7*cos(ang)', '7*sin(ang)'], { color: '#16824f', width: 3 }),
          { type: 'angle', points: [[1, 0], [0, 0], ['cos(ang)', 'sin(ang)']], text: '{ang}°' },
          G.lab(-0.3, -0.5, 'A', { size: 14 }),
          G.lab('7*cos(ang)+0.3', -0.5, 'C', { size: 14 }),
          G.lab('7*cos(ang)+0.3', '7*sin(ang)+0.3', 'B', { size: 14 }),
          G.lab('7*cos(ang)+1.3', '3.5*sin(ang)', '對邊 a', { size: 14, color: C.red }),
          G.lab('3.5*cos(ang)', -0.7, '鄰邊 b', { size: 14, color: C.blue }),
          G.lab('3.5*cos(ang)-0.8', '3.5*sin(ang)+0.7', '斜邊 c', { size: 14, color: '#16824f' }),
          G.lab(12.5, 7.2, String.raw`$\sin A=\dfrac{a}{c}$`, { size: 18, color: C.red }),
          G.lab(12.5, 5.4, String.raw`$\cos A=\dfrac{b}{c}$`, { size: 18, color: C.blue }),
          G.lab(12.5, 3.6, String.raw`$\tan A=\dfrac{a}{b}$`, { size: 18, color: '#5a3fd6' }),
        ],
        readouts: [
          { label: 'sin A ≈', expr: 'sin(ang)', digits: 4 },
          { label: 'cos A ≈', expr: 'cos(ang)', digits: 4 },
          { label: 'tan A ≈', expr: 'tan(ang)', digits: 4 },
        ],
        caption: 'sin、cos、tan 是 sine、cosine、tangent 的縮寫',
      },
      activity: { id: 'c-def-q', type: 'single', prompt: '直角 △ABC 中 ∠C＝90°，∠A 的對邊是哪一邊？', options: [String.raw`$\overline{BC}$`, String.raw`$\overline{AC}$`, String.raw`$\overline{AB}$`], correct: [0], explanation: '∠A 的對邊是不和 ∠A 相連的那一股 BC；AC 是鄰邊、AB 是斜邊。' },
      notes: '用課本的手寫記憶法：s 從斜邊畫到對邊（a/c）、c 從斜邊繞到鄰邊（b/c）、t 從鄰邊到對邊（a/b）。',
    },
    {
      id: 'c-ex5',
      phase: '工作範例',
      eyebrow: '04 / 例 5',
      title: '求 sin A、cos A、tan A',
      body: '先標出 ∠A 的對邊、鄰邊、斜邊，再寫比值。先自己算，再按「下一步」對照。',
      source: src(71),
      figures: [fig('ex5.png', '課本 p.71 例 5 題目')],
      interactive: V.figSteps({
        view: VIEW,
        figure: rightTri({ w: 8.5, hgt: 4.53, labels: { AC: '15', BC: '8', AB: '17' } }),
        top: 9.4,
        lines: ['對邊 8、鄰邊 15、斜邊 17', String.raw`$\sin A=\dfrac{8}{17}$（對 ÷ 斜）`, String.raw`$\cos A=\dfrac{15}{17}$（鄰 ÷ 斜）`, String.raw`$\tan A=\dfrac{8}{15}$（對 ÷ 鄰）`],
        captions: ['先標出三個邊', 'sin：對邊 ÷ 斜邊', 'cos：鄰邊 ÷ 斜邊', 'tan：對邊 ÷ 鄰邊'],
        gap: 1.9,
        caption: '課本例 5',
      }),
      activity: num('c-ex5-q', '先自己做例 5（寫成分數）', [['sin A＝？', '8/17'], ['cos A＝？', '15/17'], ['tan A＝？', '8/15']], 'sin A＝8/17，cos A＝15/17，tan A＝8/15。'),
      notes: '先讓學生在課本圖上用三種顏色標出對邊、鄰邊、斜邊。',
    },
    {
      id: 'c-ex5-practice',
      phase: '隨堂練習',
      eyebrow: '05 / 例 5 隨堂',
      title: '換你算：三個比值',
      body: '三題都是課本隨堂，注意順序（先問 tan）。左圖用另一組數字示範。',
      source: src(71),
      figures: [fig('ex5-practice.png', '課本 p.71 例 5 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: rightTri({ w: 8.5, hgt: 3.54, labels: { AC: '12', BC: '5', AB: '13' } }),
        top: 9.4,
        lines: ['示範：對邊 5、鄰邊 12、斜邊 13', String.raw`$\sin A=\dfrac{5}{13}$`, String.raw`$\cos A=\dfrac{12}{13}$`, String.raw`$\tan A=\dfrac{5}{12}$`],
        captions: ['另一組數字（自編）', '對 ÷ 斜', '鄰 ÷ 斜', '對 ÷ 鄰'],
        gap: 1.9,
      }),
      activity: num('c-ex5-practice-q', '課本 p.71 隨堂：AB＝5、BC＝3、AC＝4（寫成分數）', [['tan A＝？', '3/4'], ['cos A＝？', '4/5'], ['sin A＝？', '3/5']], 'tan A＝3/4，cos A＝4/5，sin A＝3/5。'),
      notes: '答案：(1) 3/4 (2) 4/5 (3) 3/5。',
    },
    {
      id: 'c-ex6',
      phase: '工作範例',
      eyebrow: '06 / 例 6 好漢亭',
      title: '用 sin 求垂直高度',
      body: '已知斜邊（車道長）和夾角，要求對邊（高度）：用 sin。先自己算，再按「下一步」。',
      source: src(72),
      figures: [fig('ex6.png', '課本 p.72 例 6 題目')],
      interactive: V.figSteps({
        view: VIEW,
        figure: [
          G.poly([[0.6, 1.2], [9.6, 1.2], [9.6, 3.6]], { fill: C.fOrange, color: C.orange }),
          R([9.6, 1.2], [-1, 0], [0, 1], 0.35),
          G.angle([9.6, 1.2], [0.6, 1.2], [9.6, 3.6], '6°'),
          G.lab(0.3, 0.7, 'A', { size: 14 }), G.lab(9.9, 0.7, 'B', { size: 14 }), G.lab(9.9, 3.9, 'C', { size: 14 }),
          G.lab(4.6, 3.2, '1000', { size: 14, color: C.orange }),
          G.lab(10.5, 2.4, 'x', { size: 15, color: '#5a3fd6' }),
          G.lab(5, 0.4, '（示意圖：角度畫大一點）', { size: 11, color: '#6b7394' }),
        ],
        top: 9.6,
        gap: 1.6,
        lines: [String.raw`設 $\overline{BC}$ 為 x 公尺`, String.raw`$\dfrac{\overline{BC}}{\overline{AC}}=\sin A$（對 ÷ 斜）`, String.raw`$\dfrac{x}{1000}=\sin 6°\approx 0.1045$`, 'x ≈ 1000 × 0.1045 ＝ 104.5', '≈ 105（公尺）'],
        captions: ['設未知數', '已知斜邊、求對邊：sin', '查表或按計算機', '移項', '四捨五入到整數'],
        caption: '課本例 6 的方法',
      }),
      activity: num('c-ex6-q', '先自己算例 6', [['垂直高度 BC 約幾公尺？（四捨五入到整數）', '105']], 'x/1000＝sin 6°≈0.1045，x≈104.5≈105。'),
      notes: '計算機操作見課本書末 [6]。',
    },
    {
      id: 'c-ex6-practice',
      phase: '隨堂練習',
      eyebrow: '07 / 例 6 隨堂',
      title: '換你算：sin、cos 的生活問題',
      body: '第 1 題是課本隨堂，其餘是換數字題。先想：已知哪一邊、要求哪一邊、用哪個比？左圖用另一組數字示範。',
      source: srcVar(72),
      figures: [fig('ex6-practice.png', '課本 p.72 例 6 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: [
          G.poly([[0.6, 1.2], [9.6, 1.2], [9.6, 3.6]], { fill: C.fOrange, color: C.orange }),
          R([9.6, 1.2], [-1, 0], [0, 1], 0.35),
          G.angle([9.6, 1.2], [0.6, 1.2], [9.6, 3.6], '10°'),
          G.lab(0.3, 0.7, 'A', { size: 14 }), G.lab(9.9, 0.7, 'B', { size: 14 }), G.lab(9.9, 3.9, 'C', { size: 14 }),
          G.lab(4.6, 3.2, '500', { size: 14, color: C.orange }),
          G.lab(5, 0.55, 'y', { size: 15, color: '#5a3fd6' }),
        ],
        top: 9.6,
        gap: 1.6,
        lines: ['示範：坡道 500 公尺、夾角 10°', String.raw`$\dfrac{\overline{AB}}{\overline{AC}}=\cos A$（鄰 ÷ 斜）`, String.raw`$\dfrac{y}{500}=\cos 10°\approx 0.9848$`, 'y ≈ 492.4 ≈ 492（公尺）'],
        captions: ['另一組數字（自編）', '已知斜邊、求鄰邊：cos', '代入', '四捨五入到整數'],
      }),
      activity: num(
        'c-ex6-practice-q',
        '四捨五入到整數（公尺）',
        [
          ['承例 6，水平距離 AB＝？（cos 6°≈0.9945）', '995'],
          ['車道長 800 公尺、夾角 6°，垂直高度＝？（sin 6°≈0.1045）', '84'],
          ['夾角 6°、水平距離 2000 公尺，垂直高度＝？（tan 6°≈0.1051）', '210'],
        ],
        '(1) 1000×0.9945＝994.5≈995。(2) 800×0.1045＝83.6≈84。(3) 2000×0.1051＝210.2≈210（已知鄰邊求對邊用 tan）。',
      ),
      notes: '答案：(1) 995 (2) 84 (3) 210。第 3 題用 tan：已知鄰邊、求對邊。',
    },
    {
      id: 'c-special',
      phase: '圖式連結',
      eyebrow: '08 / 三角板',
      title: '兩種特殊直角三角形的邊長比',
      body: '跟著課本：45° 三角板用畢氏定理；30° 三角板兩個拼成正三角形。按「下一步」。',
      source: src(73),
      figures: [fig('keybox-special.png', '課本 p.73 特殊直角三角形的邊長比'), fig('special-45.png', '課本 p.73 45°、45°、90°'), fig('special-30.png', '課本 p.73 30°、60°、90°')],
      interactive: V.figSteps({
        view: VIEW,
        figure: [
          ...rightTri({ w: 3.8, hgt: 3.8, labels: { angle: '45°', AC: '1', BC: '1', AB: '√2' } }),
          ...rightTri({ w: 2, hgt: 2 * S3, x0: 6.6, labels: { angle: '60°', AC: '1', BC: '√3', AB: '2' } }).map((s) => ({ ...s, step: 3 })),
        ],
        top: 9.8,
        gap: 1.5,
        x: 15,
        lines: [
          String.raw`45°：$\overline{AC}=\overline{BC}$ ＝ a`,
          String.raw`$\overline{AB}=\sqrt{a^2+a^2}=\sqrt2\,a$`,
          '邊長比 1 : 1 : √2',
          String.raw`30°-60°：$\overline{AC}=\frac12\overline{AB}$`,
          String.raw`$\overline{BC}=\sqrt{b^2-\left(\frac12b\right)^2}=\frac{\sqrt3}{2}b$`,
          '邊長比 1 : √3 : 2',
        ],
        captions: ['等腰直角三角形', '畢氏定理', '45°-45°-90°', '兩個 30° 三角板拼成正三角形（課本 p.73 圖）', '畢氏定理', '30°-60°-90°（最短邊對 30°）'],
      }),
      activity: { id: 'c-special-q', type: 'single', prompt: '30°-60°-90° 三角形中，最短的邊對的是哪個角？', options: ['30°', '60°', '90°'], correct: [0], explanation: '大角對大邊、小角對小邊：最短邊（1）對 30°，√3 對 60°，斜邊 2 對 90°。' },
      notes: '請學生拿出三角板對照。',
    },
    {
      id: 'c-ex7',
      phase: '工作範例',
      eyebrow: '09 / 例 7',
      title: '用邊長比 1 : 1 : √2 求邊長',
      body: '先判斷是哪一種特殊直角三角形，再列比例。先自己算，再按「下一步」。',
      source: src(74),
      figures: [fig('ex7.png', '課本 p.74 例 7 題目')],
      interactive: V.figSteps({
        view: VIEW,
        figure: rightTri({ w: 5.6, hgt: 5.6, labels: { angle: '45°', AC: '6', BC: '?', AB: '?' } }),
        top: 9.6,
        gap: 1.6,
        lines: ['△ABC 是 45°-45°-90° 直角三角形', String.raw`$\overline{AC}:\overline{BC}:\overline{AB}$ ＝ 1 : 1 : √2`, String.raw`6 : $\overline{BC}$ ＝ 1 : 1，$\overline{BC}$ ＝ 6`, String.raw`6 : $\overline{AB}$ ＝ 1 : √2，$\overline{AB}$ ＝ 6√2`],
        captions: ['∠A＝45°、∠C＝90°', '邊長比', '兩股相等', '斜邊是股的 √2 倍'],
        caption: '課本例 7（也可以用畢氏定理：√(6²＋6²)＝6√2）',
      }),
      activity: num('c-ex7-q', '先自己做例 7', [['BC＝？', '6'], ['AB＝？（最簡根式）', '6√2']], 'BC＝6，AB＝6√2。', { form: 'simplest-radical' }),
      notes: 'Hint：也可以用等腰直角三角形＋畢氏定理。',
    },
    {
      id: 'c-ex7-practice',
      phase: '隨堂練習',
      eyebrow: '10 / 例 7 隨堂',
      title: '換你算：特殊直角三角形',
      body: '前兩題是課本隨堂，第 3 題換數字。左圖用另一組數字示範。',
      source: srcVar(74),
      figures: [fig('ex7-practice.png', '課本 p.74 例 7 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: rightTri({ w: 7.2, hgt: 7.2 / S3, labels: { angle: '30°', BC: '4', AC: '?', AB: '?' } }),
        top: 9.6,
        gap: 1.6,
        lines: ['示範：∠A ＝ 30°', String.raw`30° 的對邊 $\overline{BC}$ 最短`, String.raw`$\overline{BC}:\overline{AC}:\overline{AB}$ ＝ 1 : √3 : 2`, String.raw`4 : $\overline{AC}$ ＝ 1 : √3，$\overline{AC}$ ＝ 4√3`, String.raw`4 : $\overline{AB}$ ＝ 1 : 2，$\overline{AB}$ ＝ 8`],
        captions: ['另一組數字（自編）：∠A＝30°、BC＝4，是 30°-60°-90° 直角三角形', '先找 30° 的對邊', '邊長比', '√3 那一邊', '斜邊是最短邊的 2 倍'],
      }),
      activity: num(
        'c-ex7-practice-q',
        '課本 p.74 隨堂：∠C＝90°（最簡根式）',
        [
          ['∠A＝60°、AC＝10，BC＝？', '10√3'],
          ['∠A＝60°、AC＝10，AB＝？', '20'],
          ['∠A＝45°、AB＝8，AC＝？', '4√2'],
        ],
        '(1)(2) ∠A＝60°：AC 對 30° 最短，AC：BC：AB＝1：√3：2，BC＝10√3、AB＝20。(3) AC：AB＝1：√2，AC＝8/√2＝4√2。',
        { form: 'simplest-radical' },
      ),
      notes: '答案：(1) 10√3 (2) 20 (3) 4√2。常見錯誤：∠A＝60° 時把 AC 當成 √3 那一邊。',
    },
    {
      id: 'c-ex8',
      phase: '工作範例',
      eyebrow: '11 / 例 8 三角旗',
      title: '特殊直角三角形的生活問題',
      body: '三角旗和地面夾 45°，校舍高 15 公尺。先自己算，再按「下一步」。',
      source: src(75),
      figures: [fig('ex8.png', '課本 p.75 例 8 題目')],
      interactive: V.figSteps({
        view: VIEW,
        figure: rightTri({ w: 5.8, hgt: 5.8, labels: { angle: '45°', BC: '15', AB: '?' } }),
        top: 9.6,
        gap: 1.6,
        lines: ['△ABC 是 45°-45°-90° 直角三角形', String.raw`$\overline{BC}:\overline{AB}$ ＝ 1 : √2`, String.raw`$\overline{AB}=\overline{BC}\times\sqrt2$ ＝ 15√2`, '≈ 21.21（公尺）'],
        captions: ['∠A＝45°', '股：斜邊', '計算機：15 × √2', '四捨五入到小數第 2 位'],
        caption: '課本例 8',
      }),
      activity: num('c-ex8-q', '先自己算例 8', [['三角旗長度約幾公尺？（小數第 2 位）', '21.21', 0.006]], 'AB＝15√2≈21.21。'),
      notes: '寫 15√2 也算對（系統容許 0.006 的誤差）。',
    },
    {
      id: 'c-ex8-practice',
      phase: '隨堂練習',
      eyebrow: '12 / 例 8 隨堂',
      title: '換你算：電扶梯有多長？',
      body: '第 1 題是課本隨堂，其餘是換數字題。左圖用另一組數字示範。',
      source: srcVar(75),
      figures: [fig('ex8-practice.png', '課本 p.75 例 8 隨堂練習')],
      interactive: V.figSteps({
        view: VIEW,
        figure: rightTri({ w: 7.6, hgt: 7.6 / S3, labels: { angle: '30°', BC: '2.5', AB: '?' } }),
        top: 9.6,
        gap: 1.6,
        lines: ['示範：傾斜角 30°、高度 2.5 公尺', String.raw`$\overline{BC}:\overline{AB}$ ＝ 1 : 2`, String.raw`$\overline{AB}$ ＝ 2 × 2.5 ＝ 5（公尺）`],
        captions: ['另一組數字（自編）', '30° 的對邊：斜邊＝1：2', '電扶梯長 5 公尺'],
      }),
      activity: num(
        'c-ex8-practice-q',
        '電扶梯長度（公尺）',
        [
          ['傾斜角 30°、高度 3.6 公尺，長度＝？', '7.2'],
          ['傾斜角 30°、高度 4.5 公尺，長度＝？', '9'],
          ['傾斜角 45°、高度 4 公尺，長度＝？（小數第 2 位）', '5.66', 0.006],
        ],
        '(1) 2×3.6＝7.2。(2) 2×4.5＝9。(3) 4√2≈5.66。',
      ),
      notes: '答案：(1) 7.2 (2) 9 (3) 5.66。',
    },
    {
      id: 'c-error',
      phase: '錯誤分析',
      eyebrow: '13 / 當小老師',
      title: '小明寫：sin A ＝ 4/5',
      body: '直角 △ABC 中 ∠C＝90°，BC＝3、AC＝4、AB＝5。小明寫 sin A＝4/5。在畫布圈出錯誤、寫出正確答案與理由，也可以拍照上傳。',
      source: '錯誤示例（自編），對應課本 p.70–71',
      interactive: V.figSteps({
        view: VIEW,
        figure: rightTri({ w: 8, hgt: 6, labels: { AC: '4', BC: '3', AB: '5' } }),
        top: 9.4,
        gap: 1.6,
        lines: ['小明：sin A ＝ 4/5', '∠A 的對邊 ＝ ？', '斜邊 ＝ ？', 'sin A ＝ ？'],
        captions: ['小明的答案', '不和 ∠A 相連的那一股', '直角對的邊', '對 ÷ 斜'],
      }),
      activity: {
        id: 'c-error-q',
        type: 'canvas',
        prompt: '小明寫 sin A＝4/5。① 圈出錯誤 ② 寫出正確答案 ③ 說明理由（4/5 其實是什麼？）',
        canvas: 'grid',
        allowPhoto: true,
        aiAllowed: true,
        rubric: rubric(
          [
            crit('find', '找出錯誤', [[0, '未指出錯誤'], [1, '只說錯了'], [2, '指出 4 是鄰邊 AC，不是對邊']]),
            crit('fix', '正確答案', [[0, '答案錯誤或未作答'], [2, 'sin A＝3/5']]),
            crit('why', '說明理由', [[0, '沒有理由'], [1, '只寫定義'], [2, '說明 sin A＝對邊÷斜邊＝BC/AB，4/5 是 cos A（鄰邊÷斜邊）']]),
          ],
          '∠A 的對邊是 BC＝3、斜邊 AB＝5，sin A＝3/5。小明用了鄰邊 AC＝4，4/5 其實是 cos A。',
        ),
      },
      notes: '收件後按「AI 批改」，覆核後發回。',
    },
    {
      id: 'c-summary',
      phase: '出場券',
      eyebrow: '14 / 1-4 重點回顧',
      title: '1-4 相似三角形的應用：一張圖整理',
      body: '對照課本的重點整理，用自己的話寫出 sin、cos、tan 分別是哪兩邊的比。',
      source: '對應課本 p.76–77 重點整理',
      figures: [fig('summary-1.png', '課本 p.76 重點整理'), fig('summary-2.png', '課本 p.77 重點整理')],
      activity: {
        id: 'c-exit-q',
        type: 'short',
        prompt: 'sin A、cos A、tan A 分別是哪兩邊的比？舉一個直角三角形的例子說明。',
        aiAllowed: true,
        rubric: rubric(
          [
            crit('def', '三個定義', [[0, '沒有寫或全錯'], [1, '寫對一到兩個'], [2, 'sin＝對邊/斜邊、cos＝鄰邊/斜邊、tan＝對邊/鄰邊']]),
            crit('example', '舉例', [[0, '沒有例子'], [1, '例子不完整'], [2, '用具體邊長正確算出三個比值（例如 3-4-5）']]),
          ],
          '直角 △ABC 中 ∠C＝90°：sin A＝對邊/斜邊、cos A＝鄰邊/斜邊、tan A＝對邊/鄰邊。例：BC＝3、AC＝4、AB＝5，sin A＝3/5、cos A＝4/5、tan A＝3/4。',
        ),
      },
    },
    reflect('c-reflect', '我能用 sin、cos、tan 和特殊直角三角形的邊長比解題'),
  ],
};

// 動畫片段（九年級/影片/相似三角形的應用_動畫簡報_v1 的 tools/export_classroom.py 產生）：依頁 ID 掛上。
const animFile = join(root, 'scripts/lessons-src/g9-1-4-animations.json');
if (existsSync(animFile)) {
  const animations = JSON.parse(await readFile(animFile, 'utf8'));
  const used = new Set();
  for (const lesson of [lessonA, lessonB, lessonC])
    for (const slide of lesson.slides) {
      const a = animations[slide.id];
      if (!a) continue;
      slide.animation = { src: a.src, poster: a.poster, caption: a.caption, seconds: a.seconds };
      used.add(slide.id);
    }
  const unused = Object.keys(animations).filter((id) => !used.has(id));
  if (unused.length) throw new Error(`動畫對照表有找不到的頁 ID：${unused.join('、')}`);
}

// 只用課本原題（換數字題拿掉）：題目 ID → 保留前幾小題
textbookOnly([lessonA, lessonB, lessonC], {
  'a-ex1-practice-q': 1,
  'a-ex2-practice-q': 1,
  'a-ex3-practice-q': 1,
  'b-ex4-practice-q': 1,
  'b-midpoint-practice-q': 2,
  'c-ex6-practice-q': 1,
  'c-ex7-practice-q': 2,
  'c-ex8-practice-q': 1,
});

for (const lesson of [lessonA, lessonB, lessonC]) {
  const file = join(root, 'content/lessons', `${lesson.id}.json`);
  await writeFile(file, JSON.stringify(lesson, null, 2) + '\n');
  console.log(`寫入 ${file}（${lesson.slides.length} 頁）`);
}
