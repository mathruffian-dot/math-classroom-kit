// 八上 2-3 畢氏定理的可操作視覺化樣板（只給 g8-2-3.mjs 用；共用的樣板在 viz.mjs）。
// 座標為數學座標（y 向上）；運算式語法見 docs/AUTHORING.md。
import { C, G } from './viz.mjs';

/* ───────────── 小工具 ───────────── */
export const unit = (a, b) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]],
    l = Math.hypot(dx, dy);
  return [dx / l, dy / l];
};
export const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const centroid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
/** 從 c 往遠離 o 的方向偏 d。 */
const away = (p, o, d) => {
  const [ux, uy] = unit(o, p);
  return [p[0] + ux * d, p[1] + uy * d];
};
/** 邊 pq 的標籤：放在中點、往遠離 o（圖形中心）的一側偏 off。 */
export function sideLabel(p, q, text, o, opt = {}) {
  const m = mid(p, q);
  let [nx, ny] = [-(q[1] - p[1]), q[0] - p[0]];
  const l = Math.hypot(nx, ny);
  [nx, ny] = [nx / l, ny / l];
  if ((m[0] - o[0]) * nx + (m[1] - o[1]) * ny < 0) [nx, ny] = [-nx, -ny];
  const off = opt.off ?? 0.5;
  return G.lab(m[0] + nx * off, m[1] + ny * off, text, { size: opt.size ?? 15, color: opt.color ?? C.ink, ...opt });
}
/** 頂點名稱：放在遠離中心的方向。 */
export function vertexLabel(p, name, o, opt = {}) {
  const q = away(p, o, opt.off ?? 0.45);
  return G.lab(q[0], q[1], name, { size: opt.size ?? 15, color: opt.color ?? C.ink, ...opt });
}
/** 以 a、b 為端點的線段為斜邊，直角頂點在 side（+1／−1）那一側，到 a 的距離 da、到 b 的距離 db（da² + db² = |ab|²）。 */
export function rightApex(a, b, da, db, side = 1) {
  const c = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const t = (da * da) / c,
    h = (da * db) / c;
  const [ux, uy] = unit(a, b);
  return [a[0] + ux * t - side * uy * h, a[1] + uy * t + side * ux * h];
}

/**
 * 直角三角形（R 是直角頂點）：淺色填色、直角記號、三邊標籤、頂點名稱。
 * labels：{ PR, QR, PQ }（P–R、Q–R 是兩股，P–Q 是斜邊）；names：[P, Q, R] 的名稱（空字串不標）。
 */
export function rightTri(P, Q, R, { labels = {}, names = ['', '', ''], fill = C.fViolet, color = C.violet, mark = 0.35, size = 15, o = {} } = {}) {
  const ctr = centroid([P, Q, R]);
  const sh = [
    G.poly([P, Q, R], { fill, color, ...o }),
    ...G.right(R, unit(R, P), unit(R, Q), mark, o),
  ];
  if (labels.PR) sh.push(sideLabel(P, R, labels.PR, ctr, { size, color: labels.PRc ?? C.ink, ...o }));
  if (labels.QR) sh.push(sideLabel(Q, R, labels.QR, ctr, { size, color: labels.QRc ?? C.ink, ...o }));
  if (labels.PQ) sh.push(sideLabel(P, Q, labels.PQ, ctr, { size, color: labels.PQc ?? C.ink, ...o }));
  [P, Q, R].forEach((p, i) => names[i] && sh.push(vertexLabel(p, names[i], ctr, { size: 14, ...o })));
  return sh;
}

/* ───────────── 第 1 堂：方格紙上的三個正方形（課本 p.93 探索活動） ───────────── */
/**
 * 直角三角形 ABC（∠C＝90°）：BC＝a（水平）、AC＝b（鉛垂），每格邊長 1。
 * 甲＝以 AC 為邊的正方形、乙＝以 BC 為邊的正方形、丙＝以 AB 為邊的正方形。
 * 「數丙」開關：外框大正方形 (a+b)² 減掉 4 個直角三角形；「顯示面積」開關才寫出數字。
 */
export function gridSquares({ a = 2, b = 3 } = {}) {
  const shapes = [
    { type: 'rect', x: '-b', y: 0, w: 'b', h: 'b', fill: C.fBlue, color: C.blue, width: 2 },
    { type: 'rect', x: 0, y: '-a', w: 'a', h: 'a', fill: C.fBlue, color: C.blue, width: 2 },
    { type: 'polygon', points: [[0, 'b'], ['a', 0], ['a+b', 'a'], ['b', 'a+b']], fill: 'rgba(47,128,237,.18)', color: C.blue, width: 2 },
    // 數丙：外框與 4 個三角形
    { type: 'rect', x: 0, y: 0, w: 'a+b', h: 'a+b', color: C.red, dash: true, width: 1.6, show: 'count' },
    { type: 'polygon', points: [['a', 0], ['a+b', 0], ['a+b', 'a']], fill: C.fOrange, color: C.orange, width: 1.2, show: 'count' },
    { type: 'polygon', points: [['a+b', 'a'], ['a+b', 'a+b'], ['b', 'a+b']], fill: C.fOrange, color: C.orange, width: 1.2, show: 'count' },
    { type: 'polygon', points: [['b', 'a+b'], [0, 'a+b'], [0, 'b']], fill: C.fOrange, color: C.orange, width: 1.2, show: 'count' },
    { type: 'polygon', points: [[0, 0], ['a', 0], [0, 'b']], fill: C.fOrange, color: C.orange, width: 1.2, show: 'count' },
    // 直角三角形本身
    { type: 'polygon', points: [[0, 0], ['a', 0], [0, 'b']], fill: 'rgba(229,72,77,.22)', color: C.red, width: 2.4 },
    { type: 'segment', points: [[0.35, 0], [0.35, 0.35]], color: C.ink, width: 1.3 },
    { type: 'segment', points: [[0, 0.35], [0.35, 0.35]], color: C.ink, width: 1.3 },
    { type: 'text', x: -0.35, y: -0.4, text: 'C', size: 15 },
    { type: 'text', x: 'a+0.3', y: -0.4, text: 'B', size: 15 },
    { type: 'text', x: -0.4, y: 'b+0.35', text: 'A', size: 15 },
    { type: 'text', x: '-b/2', y: 'b/2', text: '甲', size: 18, color: '#1d4fa3', show: '!area' },
    { type: 'text', x: 'a/2', y: '-a/2', text: '乙', size: 18, color: '#1d4fa3', show: '!area' },
    { type: 'text', x: '(a+b)/2', y: '(a+b)/2', text: '丙', size: 18, color: '#1d4fa3', show: '!area' },
    { type: 'text', x: '-b/2', y: 'b/2', text: '甲 {b^2}', size: 17, color: '#1d4fa3', show: 'area' },
    { type: 'text', x: 'a/2', y: '-a/2', text: '乙 {a^2}', size: 17, color: '#1d4fa3', show: 'area' },
    { type: 'text', x: '(a+b)/2', y: '(a+b)/2', text: '丙 {a^2+b^2}', size: 17, color: '#1d4fa3', show: 'area' },
    { type: 'text', x: 4.2, y: -2.6, text: '丙 ＝ 外框 − 4 個三角形', size: 15, color: C.red, show: 'count' },
    { type: 'text', x: 4.2, y: -3.6, text: '＝ {(a+b)^2} − 4 × {a*b/2} ＝ {a^2+b^2}', size: 15, color: C.red, show: 'count && area' },
  ];
  return {
    view: { xMin: -5.5, xMax: 9.5, yMin: -5, yMax: 9, grid: 1, aspect: 'equal' },
    params: [
      { id: 'a', label: '股 $\\overline{BC}$（格）', min: 1, max: 4, step: 1, value: a },
      { id: 'b', label: '股 $\\overline{AC}$（格）', min: 1, max: 4, step: 1, value: b },
      { id: 'count', label: '數丙：外框減 4 個三角形', kind: 'toggle', value: 0 },
      { id: 'area', label: '顯示面積', kind: 'toggle', value: 0 },
    ],
    shapes,
    caption: '每一格邊長 1。先自己數甲、乙、丙的面積，再打開「數丙」與「顯示面積」對照',
  };
}

/* ───────────── 第 1 堂：拼圖證明（課本 p.94 探索活動） ───────────── */
/**
 * 邊長 a＋b 的正方形裡有 4 個全等的直角三角形（兩股 a、b，斜邊 c）。
 * 滑桿 t：0＝圖一（空白是甲 a² 與乙 b²），1＝圖二（空白是丙 c²）。三角形只平移，面積不變。
 */
export function rearrange({ a = 3, b = 2 } = {}) {
  const S = 'a+b';
  const tri = (pts, dx, dy) => ({
    type: 'polygon',
    points: pts.map(([x, y]) => [`${x}+t*(${dx})`, `${y}+t*(${dy})`]),
    fill: '#bcd4f6',
    color: C.blue,
    width: 1.8,
  });
  return {
    view: { xMin: -1.3, xMax: 19, yMin: -1.2, yMax: 9.6, aspect: 'equal' },
    params: [
      { id: 't', label: '移動 4 個三角形（圖一 → 圖二）', min: 0, max: 1, step: 0.1, value: 0 },
      { id: 'a', label: '$a$', min: 1, max: 4, step: 1, value: a },
      { id: 'b', label: '$b$', min: 1, max: 4, step: 1, value: b },
    ],
    shapes: [
      { type: 'rect', x: 0, y: 0, w: S, h: S, fill: 'rgba(255,138,61,.22)', color: C.ink, width: 2.2 },
      tri([[0, 0], ['a', 0], ['a', 'b']], 'b', 0),
      tri([[0, 0], [0, 'b'], ['a', 'b']], 0, 'a'),
      tri([['a', S], ['a', 'b'], [S, 'b']], '-a', '-b'),
      tri([['a', S], [S, S], [S, 'b']], 0, 0),
      { type: 'polygon', points: [['a', S], [S, 'b'], ['b', 0], [0, 'a']], color: C.orange, width: 2.6, show: 't>0.95' },
      { type: 'brace', points: [[0, S], ['a', S]], text: '$a$' },
      { type: 'brace', points: [['a', S], [S, S]], text: '$b$' },
      { type: 'brace', points: [[0, 0], [0, 'b']], text: '$b$', show: 't<0.05' },
      { type: 'brace', points: [[0, 'b'], [0, S]], text: '$a$', show: 't<0.05' },
      { type: 'brace', points: [[0, 'a'], [0, S]], text: '$b$', show: 't>0.95' },
      { type: 'brace', points: [[0, 0], [0, 'a']], text: '$a$', show: 't>0.95' },
      { type: 'text', x: 'a/2', y: 'b+a/2', text: '甲 $a^2$', size: 17, color: '#b4541a', show: 't<0.05' },
      { type: 'text', x: 'a+b/2', y: 'b/2', text: '乙 $b^2$', size: 15, color: '#b4541a', show: 't<0.05' },
      { type: 'text', x: '(a+b)/2', y: '(a+b)/2', text: '丙 $c^2$', size: 18, color: '#b4541a', show: 't>0.95' },
      { type: 'text', x: 13.8, y: 7.6, text: '兩個大正方形一樣大', size: 16 },
      { type: 'text', x: 13.8, y: 6.4, text: '4 個三角形只是搬位置', size: 16 },
      { type: 'text', x: 13.8, y: 4.6, text: '圖一：空白 ＝ 甲 ＋ 乙 ＝ $a^2+b^2$', size: 16, color: '#b4541a', show: 't<0.05' },
      { type: 'text', x: 13.8, y: 4.6, text: '圖二：空白 ＝ 丙 ＝ $c^2$', size: 16, color: '#b4541a', show: 't>0.95' },
      { type: 'text', x: 13.8, y: 4.6, text: '搬動中……', size: 16, color: '#6b7394', show: 't>=0.05 && t<=0.95' },
      { type: 'text', x: 13.8, y: 2.8, text: '空白的面積有沒有改變？', size: 16, color: C.violet },
    ],
    caption: '課本 p.94 探索活動：把圖一的 4 個三角形搬到圖二的四個角落',
  };
}

/* ───────────── 第 1 堂：三邊上的正方形（圖式連結，靜態逐步） ───────────── */
/** 直角三角形三邊各畫一個正方形，顏色和右邊的式子對應。 */
export function theoremFigure() {
  const k = 0.8,
    Cc = [4, 3.6],
    B = [4 + 4 * k, 3.6],
    A = [4, 3.6 + 3 * k];
  const nAB = [3 * k, 4 * k]; // AB 往外的法向量（長度 c）
  const B2 = [B[0] + nAB[0], B[1] + nAB[1]],
    A2 = [A[0] + nAB[0], A[1] + nAB[1]];
  return [
    { type: 'polygon', points: [Cc, B, [B[0], Cc[1] - 4 * k], [Cc[0], Cc[1] - 4 * k]], fill: C.fViolet, color: C.violet, width: 2, step: 1 },
    G.lab(Cc[0] + 2 * k, Cc[1] - 2 * k, 'a²', { size: 20, color: '#5a3fd6', step: 1 }),
    { type: 'polygon', points: [Cc, A, [Cc[0] - 3 * k, A[1]], [Cc[0] - 3 * k, Cc[1]]], fill: C.fBlue, color: C.blue, width: 2, step: 2 },
    G.lab(Cc[0] - 1.5 * k, Cc[1] + 1.5 * k, 'b²', { size: 20, color: '#1d4fa3', step: 2 }),
    { type: 'polygon', points: [A, B, B2, A2], fill: C.fOrange, color: C.orange, width: 2, step: 3 },
    G.lab((A[0] + B2[0]) / 2, (A[1] + B2[1]) / 2, 'c²', { size: 20, color: '#b4541a', step: 3 }),
    G.poly([Cc, B, A], { fill: 'rgba(255,255,255,.9)', color: C.ink }),
    ...G.right(Cc, [1, 0], [0, 1], 0.3),
    G.lab((Cc[0] + B[0]) / 2, Cc[1] + 0.35, 'a', { size: 16, color: '#5a3fd6' }),
    G.lab(Cc[0] + 0.35, (Cc[1] + A[1]) / 2, 'b', { size: 16, color: '#1d4fa3' }),
    G.lab((A[0] + B[0]) / 2 + 0.3, (A[1] + B[1]) / 2 + 0.4, 'c', { size: 16, color: '#b4541a' }),
  ];
}

/* ───────────── 第 2 堂：斜邊上的高（具體操作） ───────────── */
/**
 * 斜邊放在底下、直角在上方的直角三角形：兩股 a（右）、b（左）。
 * 開關「以斜邊為底」：畫出斜邊上的高 h；面積兩種算法相等 → h ＝ ab ÷ c。
 */
export function altitudeArea({ a = 5, b = 12 } = {}) {
  // 斜邊一律畫成 16 個單位長（圖不會忽大忽小），標籤寫真實長度。
  const L = 16;
  const Tx = `${L}*b^2/(a^2+b^2)`,
    Ty = `${L}*a*b/(a^2+b^2)`;
  const A = [0, 0],
    B = [L, 0],
    T = [Tx, Ty],
    D = [Tx, 0];
  return {
    view: { xMin: -1.5, xMax: 17.5, yMin: -2.4, yMax: 11.6, aspect: 'equal' },
    params: [
      { id: 'a', label: '右邊的股 $a$', min: 3, max: 12, step: 1, value: a },
      { id: 'b', label: '左邊的股 $b$', min: 3, max: 12, step: 1, value: b },
      { id: 'base', label: '以斜邊為底，畫出高 $h$', kind: 'toggle', value: 0 },
    ],
    shapes: [
      { type: 'polygon', points: [A, B, T], fill: C.fViolet, color: C.violet, width: 2.2 },
      { type: 'segment', points: [T, D], color: C.red, width: 2.6, show: 'base' },
      { type: 'text', x: `${Tx}+0.5`, y: `(${Ty})/2`, text: 'h', size: 17, color: C.red, show: 'base' },
      { type: 'text', x: `(${Tx})/2-0.6`, y: `(${Ty})/2+0.5`, text: '{b}', size: 16, color: '#5a3fd6' },
      { type: 'text', x: `(${Tx}+${L})/2+0.6`, y: `(${Ty})/2+0.5`, text: '{a}', size: 16, color: '#5a3fd6' },
      { type: 'brace', points: [B, A], text: '斜邊 c ≈ {round(sqrt(a^2+b^2)*100)/100}' },
      { type: 'text', x: 8, y: 10.9, text: '以股為底：面積 ＝ ½ × {a} × {b} ＝ {a*b/2}', size: 16, color: '#5a3fd6' },
      { type: 'text', x: 8, y: 9.8, text: '以斜邊為底：面積 ＝ ½ × c × h', size: 16, color: C.red, show: 'base' },
    ],
    readouts: [
      { label: '面積 $\\frac{1}{2}ab$', expr: 'a*b/2', digits: 2 },
      { label: '斜邊 $c\\approx$', expr: 'sqrt(a^2+b^2)', digits: 3 },
      { label: '斜邊上的高 $h\\approx$', expr: 'a*b/sqrt(a^2+b^2)', digits: 3 },
    ],
    caption: '同一個三角形的面積，用兩股算或用斜邊和高算，結果一樣',
  };
}

/* ───────────── 第 3 堂：拖拉兩點（具體操作） ───────────── */
/** 坐標平面上拖拉 P、Q：水平股 |x 坐標的差|、鉛垂股 |y 坐標的差|，用畢氏定理求 PQ。 */
export function distanceExplore({ P = [-3, -1], Q = [3, 3] } = {}) {
  return {
    view: { xMin: -7, xMax: 7, yMin: -5, yMax: 6, grid: 1, axes: true, aspect: 'equal' },
    points: [
      { id: 'P', label: 'P', x: P[0], y: P[1], snap: 1, color: C.violet },
      { id: 'Q', label: 'Q', x: Q[0], y: Q[1], snap: 1, color: C.orange },
    ],
    shapes: [
      { type: 'segment', points: [['Px', 'Py'], ['Qx', 'Py']], color: C.blue, width: 3, dash: true },
      { type: 'segment', points: [['Qx', 'Py'], ['Qx', 'Qy']], color: '#c026d3', width: 3, dash: true },
      { type: 'segment', points: [['Px', 'Py'], ['Qx', 'Qy']], color: C.ink, width: 3 },
      { type: 'point', x: 'Qx', y: 'Py', color: '#6b7394' },
      { type: 'text', x: '(Px+Qx)/2', y: 'Py-0.55', text: '|x 坐標的差| ＝ {abs(Qx-Px)}', size: 14, color: '#1d4fa3', show: 'Px!=Qx' },
      { type: 'text', x: 'Qx+(Qx>=Px?0.7:-0.7)', y: '(Py+Qy)/2', text: '{abs(Qy-Py)}', size: 15, color: '#a21caf', show: 'Py!=Qy' },
    ],
    readouts: [
      { label: 'x 坐標的差', expr: 'abs(Qx-Px)', digits: 0 },
      { label: 'y 坐標的差', expr: 'abs(Qy-Py)', digits: 0 },
      { label: '$\\overline{PQ}^2$', expr: '(Qx-Px)^2+(Qy-Py)^2', digits: 0 },
      { label: '$\\overline{PQ}\\approx$', expr: 'sqrt((Qx-Px)^2+(Qy-Py)^2)', digits: 3 },
    ],
    caption: '拖拉 P、Q：水平虛線和鉛垂虛線是兩股，PQ 是斜邊',
  };
}

/* ───────────── 坐標平面（靜態，配合 figSteps 左圖右式） ───────────── */
/**
 * 在 view 的 (ox, oy) 放原點，每格 s 個單位，畫 xr、yr 範圍的方格與坐標軸。
 * 回傳 { shapes, at }：at(x, y) 把坐標換成 view 座標。
 */
export function plane({ xr, yr, s = 0.7, ox, oy, ticks = true, tickAt = [1, 1] }) {
  const at = (x, y) => [ox + x * s, oy + y * s];
  const shapes = [];
  for (let x = xr[0]; x <= xr[1]; x++) shapes.push(G.seg(at(x, yr[0]), at(x, yr[1]), { color: '#d9deef', width: 1 }));
  for (let y = yr[0]; y <= yr[1]; y++) shapes.push(G.seg(at(xr[0], y), at(xr[1], y), { color: '#d9deef', width: 1 }));
  shapes.push(G.seg(at(xr[0] - 0.3, 0), at(xr[1] + 0.5, 0), { color: '#6b7394', width: 1.6 }));
  shapes.push(G.seg(at(0, yr[0] - 0.3), at(0, yr[1] + 0.5), { color: '#6b7394', width: 1.6 }));
  const [xx, xy] = at(xr[1] + 0.9, 0),
    [yx, yy] = at(0, yr[1] + 0.9);
  shapes.push(G.lab(xx, xy, 'x', { size: 14, color: '#6b7394' }), G.lab(yx, yy, 'y', { size: 14, color: '#6b7394' }));
  const [o1, o2] = at(-0.5, -0.6);
  shapes.push(G.lab(o1, o2, 'O', { size: 13, color: '#6b7394' }));
  if (ticks) {
    const [t1, t2] = at(tickAt[0], -0.6),
      [u1, u2] = at(-0.5, tickAt[1]);
    shapes.push(G.lab(t1, t2, String(tickAt[0]), { size: 12, color: '#6b7394' }), G.lab(u1, u2, String(tickAt[1]), { size: 12, color: '#6b7394' }));
  }
  return { shapes, at };
}
/** 坐標平面上的一個點：實心點＋名稱與坐標（dir：標籤方向 [dx, dy]）。 */
export function dot(at, x, y, text, { dir = [0, 1], color = C.ink, size = 14, o = {} } = {}) {
  const [px, py] = at(x, y);
  return [
    { type: 'circle', x: px, y: py, r: 0.12, fill: color, color, width: 1, ...o },
    G.lab(px + dir[0] * 0.9, py + dir[1] * 0.5, text, { size, color, ...o }),
  ];
}
