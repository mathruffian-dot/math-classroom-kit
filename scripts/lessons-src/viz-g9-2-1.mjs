// 九上 2-1 點、直線與圓之間的位置關係：圓的視覺化樣板（不改 viz.mjs，圓的零件放在這裡）。
// 座標為數學座標（y 向上），幾何圖一律 aspect: 'equal'。運算式裡的三角函數是角度制。
import { C, G } from './viz.mjs';

const r2 = (v) => Math.round(v * 1000) / 1000;
/** 圓（靜態或運算式）。 */
export const circ = (x, y, r, o = {}) => ({
  type: 'circle', x, y, r, color: o.color ?? C.ink, width: o.width ?? 2, ...(o.fill ? { fill: o.fill } : {}), ...(o.dash ? { dash: true } : {}),
  ...(o.step !== undefined ? { step: o.step } : {}), ...(o.focus ? { focus: o.focus } : {}), ...(o.show ? { show: o.show } : {}),
});
/** 圓上角度 deg 的點（數字）。 */
export const on = (c, r, deg) => [r2(c[0] + r * Math.cos((deg * Math.PI) / 180)), r2(c[1] + r * Math.sin((deg * Math.PI) / 180))];
/** 圓弧上的點（a0 → a1 度，n 段）。 */
export const arcPts = (c, r, a0, a1, n = 24) => Array.from({ length: n + 1 }, (_, i) => on(c, r, a0 + ((a1 - a0) * i) / n));
/** 扇形（圓心＋弧）。 */
export const sector = (c, r, a0, a1, o = {}) => G.poly([c, ...arcPts(c, r, a0, a1, o.n ?? 24)], { fill: o.fill ?? C.fOrange, color: o.color ?? C.orange, width: o.width ?? 1.6, ...o });
/** 弓形（弧＋弦）。 */
export const bow = (c, r, a0, a1, o = {}) => G.poly(arcPts(c, r, a0, a1, o.n ?? 24), { fill: o.fill ?? C.fBlue, color: o.color ?? C.blue, width: o.width ?? 1.6, ...o });
/** 圓弧描粗（n 段線段）。 */
export const arcLine = (c, r, a0, a1, o = {}) => {
  const p = arcPts(c, r, a0, a1, o.n ?? 12);
  return p.slice(1).map((q, i) => G.seg(p[i], q, { color: o.color ?? C.red, width: o.width ?? 4, ...o }));
};
const unit = (a, b) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(dx, dy);
  return [dx / l, dy / l];
};
/** 直角記號：v 是直角頂點，a、b 是兩邊上的點（數字）。 */
export const rightAt = (v, a, b, s = 0.35, o = {}) => G.right(v, unit(v, a), unit(v, b), s, o);
/** 點名（小黑點＋標籤）。 */
export const dot = (p, o = {}) => ({ type: 'point', x: p[0], y: p[1], color: o.color ?? C.ink, ...(o.step !== undefined ? { step: o.step } : {}), ...(o.show ? { show: o.show } : {}) });

/* ───────────── 第 1 堂：扇形的具體操作 ───────────── */
/** 拖拉圓心角與半徑：扇形占整個圓的 x/360，弧長、面積跟著變。 */
export function sectorExplore({ r = 4, a = 60 } = {}) {
  const N = 30;
  const pts = [[0, 0]];
  for (let i = 0; i <= N; i++) pts.push([`r*cos(a*${i}/${N})`, `r*sin(a*${i}/${N})`]);
  const arc = [];
  for (let i = 0; i < 15; i++)
    arc.push(G.seg([`r*cos(a*${i}/15)`, `r*sin(a*${i}/15)`], [`r*cos(a*${i + 1}/15)`, `r*sin(a*${i + 1}/15)`], { color: C.red, width: 4 }));
  return {
    view: { xMin: -6.8, xMax: 16.5, yMin: -6.6, yMax: 6.6, aspect: 'equal' },
    params: [
      { id: 'a', label: '圓心角 $x$', min: 10, max: 360, step: 5, value: a, unit: '°' },
      { id: 'r', label: '半徑 $r$', min: 2, max: 6, step: 1, value: r },
    ],
    shapes: [
      circ(0, 0, 'r', { color: '#6b7394', width: 1.6 }),
      { type: 'polygon', points: pts, fill: C.fOrange, color: C.orange, width: 1.6 },
      ...arc,
      G.seg([0, 0], ['r', 0], { color: C.ink, width: 2.4 }),
      G.seg([0, 0], ['r*cos(a)', 'r*sin(a)'], { color: C.ink, width: 2.4 }),
      dot([0, 0]),
      G.lab(-0.45, -0.45, 'O', { size: 15 }),
      G.lab('r+0.45', -0.35, 'A', { size: 15 }),
      G.lab('(r+0.5)*cos(a)', '(r+0.5)*sin(a)', 'B', { size: 15 }),
      G.lab('r/2', -0.5, 'r＝{r}', { size: 13, color: '#4b5478' }),
      G.lab(11.6, 5.4, String.raw`占整個圓的 $\dfrac{{a}}{360}$`, { size: 18, color: '#5a3fd6' }),
      G.lab(11.6, 3.2, String.raw`弧長 $=2\pi\times{r}\times\dfrac{{a}}{360}$`, { size: 16, color: C.red }),
      G.lab(11.6, 1.9, String.raw`$={round(r*a/180*1000)/1000}\pi$`, { size: 16, color: C.red }),
      G.lab(11.6, -0.2, String.raw`面積 $=\pi\times{r}^2\times\dfrac{{a}}{360}$`, { size: 16, color: '#b4541a' }),
      G.lab(11.6, -1.5, String.raw`$={round(r*r*a/360*1000)/1000}\pi$`, { size: 16, color: '#b4541a' }),
    ],
    readouts: [
      { label: '占整個圓 x/360 ≈', expr: 'a/360', digits: 3 },
      { label: '弧長 ≈', expr: 'pi*r*a/180', digits: 2 },
      { label: '扇形面積 ≈', expr: 'pi*r^2*a/360', digits: 2 },
    ],
    caption: '圓心角是周角的 x/360，弧長就是圓周長的 x/360，扇形面積就是圓面積的 x/360',
  };
}

/* ───────────── 第 2 堂：點與圓、直線與圓 ───────────── */
/** 拖曳點 P：比較 OP 和半徑 r（r＝5）。 */
export function pointExplore({ r = 5, P = [2, 1] } = {}) {
  const d2 = 'Px^2+Py^2';
  return {
    view: { xMin: -6.8, xMax: 16.5, yMin: -6.6, yMax: 6.6, aspect: 'equal', grid: 1 },
    points: [{ id: 'P', x: P[0], y: P[1], snap: 1, label: 'P', minX: -6, maxX: 6, minY: -6, maxY: 6 }],
    shapes: [
      circ(0, 0, r, { fill: 'rgba(255,201,60,.22)', color: C.red, width: 2.4 }),
      G.seg([0, 0], [r, 0], { color: '#6b7394', width: 1.6, dash: true }),
      G.lab(r / 2, 0.45, `r＝${r}`, { size: 13, color: '#4b5478' }),
      G.seg([0, 0], ['Px', 'Py'], { color: C.blue, width: 3 }),
      dot([0, 0]),
      G.lab(-0.45, -0.45, 'O', { size: 15 }),
      G.lab(11.4, 5.2, 'OP ＝ {round(sqrt(Px^2+Py^2)*100)/100}', { size: 18, color: C.blue }),
      G.lab(11.4, 3.9, `半徑 r ＝ ${r}`, { size: 18 }),
      { type: 'text', x: 11.4, y: 2.2, text: 'OP ＜ r：P 在圓內', size: 19, color: '#16824f', show: `${d2}<${r * r}` },
      { type: 'text', x: 11.4, y: 2.2, text: 'OP ＝ r：P 在圓上', size: 19, color: C.red, show: `${d2}==${r * r}` },
      { type: 'text', x: 11.4, y: 2.2, text: 'OP ＞ r：P 在圓外', size: 19, color: '#5a3fd6', show: `${d2}>${r * r}` },
    ],
    readouts: [
      { label: 'OP ≈', expr: `sqrt(${d2})`, digits: 2 },
      { label: 'OP － r ≈', expr: `sqrt(${d2})-${r}`, digits: 2 },
    ],
    caption: '點和圓的位置，只要比較「點到圓心的距離 OP」和「半徑 r」',
  };
}

/**
 * 直線與圓：拉動圓心到直線的距離 d、直線方向、半徑 r，看交點數。
 * 直線畫成「離 O 不超過 7」的線段，右邊 x ≥ 7.4 留給結論文字（短字、分兩行），
 * 圖在 iPad 直放、手機上縮得很小時，固定像素的字也不會壓到圖。
 */
export function lineExplore({ d = 6, t = 45, r = 4 } = {}) {
  const Fx = 'd*cos(t)', Fy = 'd*sin(t)', ux = '(-sin(t))', uy = 'cos(t)', h = 'sqrt(r^2-d^2)', L = 'sqrt(49-d^2)';
  const s = 0.4;
  const p1 = [`${Fx}-${s}*cos(t)`, `${Fy}-${s}*sin(t)`];
  const p2 = [`${Fx}-${s}*cos(t)+${s}*${ux}`, `${Fy}-${s}*sin(t)+${s}*${uy}`];
  const p3 = [`${Fx}+${s}*${ux}`, `${Fy}+${s}*${uy}`];
  const tx = 10.6;
  const say = (cond, a, b, color) => [
    { type: 'text', x: tx, y: 3.4, text: a, size: 17, color, show: cond },
    { type: 'text', x: tx, y: 1.6, text: b, size: 17, color, show: cond },
  ];
  return {
    view: { xMin: -5.6, xMax: 13.8, yMin: -5.6, yMax: 6.6, aspect: 'equal' },
    params: [
      { id: 'd', label: '圓心到直線的距離 $d$', min: 0.5, max: 6, step: 0.5, value: d },
      { id: 'r', label: '半徑 $r$', min: 2, max: 5, step: 0.5, value: r },
      { id: 't', label: '直線的方向', min: 0, max: 180, step: 15, value: t, unit: '°' },
    ],
    shapes: [
      circ(0, 0, 'r', { fill: 'rgba(132,204,22,.18)', color: C.ink, width: 2 }),
      G.seg([`${Fx}-${L}*${ux}`, `${Fy}-${L}*${uy}`], [`${Fx}+${L}*${ux}`, `${Fy}+${L}*${uy}`], { color: C.red, width: 2.6 }),
      G.seg([0, 0], [Fx, Fy], { color: C.blue, width: 2.4, dash: true }),
      G.seg(p1, p2, { color: C.ink, width: 1.4 }),
      G.seg(p2, p3, { color: C.ink, width: 1.4 }),
      dot([0, 0]),
      G.lab('-0.6*cos(t)', '-0.6*sin(t)', 'O', { size: 15 }),
      { type: 'point', x: Fx, y: Fy, color: C.blue },
      G.lab(`${Fx}+0.6*cos(t)`, `${Fy}+0.6*sin(t)`, 'P', { size: 15, color: C.blue }),
      G.lab('d/2*cos(t)-0.55*sin(t)', 'd/2*sin(t)+0.55*cos(t)', 'd', { size: 15, color: C.blue }),
      { type: 'point', x: `${Fx}+${h}*${ux}`, y: `${Fy}+${h}*${uy}`, color: C.red, show: 'd<r' },
      { type: 'point', x: `${Fx}-${h}*${ux}`, y: `${Fy}-${h}*${uy}`, color: C.red, show: 'd<r' },
      ...say('d>r', 'd ＞ r', '不相交', '#5a3fd6'),
      ...say('d==r', 'd ＝ r', '相切', C.red),
      ...say('d<r', 'd ＜ r', '割線', '#16824f'),
    ],
    readouts: [{ label: '交點個數', expr: 'd<r ? 2 : (d==r ? 1 : 0)' }],
    caption: '比較「圓心到直線的距離 d」和「半徑 r」：d＞r 不相交、d＝r 相切（OP ⊥ L）、d＜r 割線；P 是垂足',
  };
}

/* ───────────── 第 3 堂：切線段、弦與弦心距 ───────────── */
/** 拖曳圓外一點 P（r＝3）：兩條切線段 PA、PB 永遠等長。 */
export function tangentExplore({ r = 3, P = [6, 2] } = {}) {
  const d2 = '(Px^2+Py^2)';
  const k = `(${r * r}/${d2})`, h = `(${r}*sqrt(${d2}-${r * r})/${d2})`;
  const A = [`${k}*Px-${h}*Py`, `${k}*Py+${h}*Px`];
  const B = [`${k}*Px+${h}*Py`, `${k}*Py-${h}*Px`];
  const L = `sqrt(${d2}-${r * r})`;
  const mark = (T) => {
    // 直角記號：T 往圓心、T 往 P 兩個方向
    const s = 0.35;
    const uO = [`(-(${T[0]})/${r})`, `(-(${T[1]})/${r})`];
    const uP = [`((Px-(${T[0]}))/${L})`, `((Py-(${T[1]}))/${L})`];
    const q1 = [`${T[0]}+${s}*${uO[0]}`, `${T[1]}+${s}*${uO[1]}`];
    const q2 = [`${T[0]}+${s}*${uO[0]}+${s}*${uP[0]}`, `${T[1]}+${s}*${uO[1]}+${s}*${uP[1]}`];
    const q3 = [`${T[0]}+${s}*${uP[0]}`, `${T[1]}+${s}*${uP[1]}`];
    return [G.seg(q1, q2, { color: C.ink, width: 1.3, show: `${d2}>${r * r}` }), G.seg(q2, q3, { color: C.ink, width: 1.3, show: `${d2}>${r * r}` })];
  };
  const out = `${d2}>${r * r}`;
  return {
    view: { xMin: -4.5, xMax: 19, yMin: -6.5, yMax: 6.5, aspect: 'equal', grid: 1 },
    points: [{ id: 'P', x: P[0], y: P[1], snap: 1, label: 'P', minX: -4, maxX: 9, minY: -6, maxY: 6 }],
    shapes: [
      circ(0, 0, r, { fill: 'rgba(18,163,154,.16)', color: C.ink }),
      { type: 'polygon', points: [[0, 0], A, ['Px', 'Py'], B], fill: 'rgba(132,204,22,.16)', color: 'rgba(0,0,0,0)', width: 0.5, show: out },
      G.seg(['Px', 'Py'], A, { color: C.red, width: 3, show: out }),
      G.seg(['Px', 'Py'], B, { color: C.red, width: 3, show: out }),
      G.seg([0, 0], A, { color: C.blue, width: 2, dash: true, show: out }),
      G.seg([0, 0], B, { color: C.blue, width: 2, dash: true, show: out }),
      G.seg([0, 0], ['Px', 'Py'], { color: '#6b7394', width: 1.6, dash: true }),
      G.seg(A, B, { color: '#6b7394', width: 1.4, show: out }),
      ...mark(A),
      ...mark(B),
      dot([0, 0]),
      G.lab(-0.5, -0.45, 'O', { size: 15 }),
      { type: 'point', x: A[0], y: A[1], color: C.red, show: out },
      { type: 'point', x: B[0], y: B[1], color: C.red, show: out },
      G.lab(`1.15*(${A[0]})`, `1.15*(${A[1]})`, 'A', { size: 15, show: out }),
      G.lab(`1.15*(${B[0]})`, `1.15*(${B[1]})`, 'B', { size: 15, show: out }),
      G.lab(14.2, 5.2, 'OA ＝ OB ＝ r ＝ 3', { size: 17 }),
      { type: 'text', x: 14.2, y: 3.8, text: 'PA ＝ {round(sqrt((Px-(' + A[0] + '))^2+(Py-(' + A[1] + '))^2)*100)/100}', size: 18, color: C.red, show: out },
      { type: 'text', x: 14.2, y: 2.6, text: 'PB ＝ {round(sqrt((Px-(' + B[0] + '))^2+(Py-(' + B[1] + '))^2)*100)/100}', size: 18, color: C.red, show: out },
      { type: 'text', x: 14.2, y: 1.2, text: 'OP ＝ {round(sqrt(Px^2+Py^2)*100)/100}', size: 17, color: '#4b5478' },
      { type: 'text', x: 14.2, y: 3.2, text: 'P 要拖到圓外', size: 18, color: '#5a3fd6', show: `!(${out})` },
    ],
    readouts: [
      { label: '切線段 PA ≈', expr: `sqrt((Px-(${A[0]}))^2+(Py-(${A[1]}))^2)`, digits: 2 },
      { label: '切線段 PB ≈', expr: `sqrt((Px-(${B[0]}))^2+(Py-(${B[1]}))^2)`, digits: 2 },
      { label: '√(OP² － r²) ≈', expr: `sqrt(max(${d2}-${r * r},0))`, digits: 2 },
    ],
    caption: '半徑垂直切線，△OAP、△OBP 是全等的直角三角形（RHS），所以 PA＝PB',
  };
}

/** 弦與弦心距（r＝5）：拉動弦心距 d，看弦長；第二條弦 CD 用來比較。 */
export function chordExplore({ d = 4, e = 2, t = 270 } = {}) {
  const R = 5;
  const half = (v) => `sqrt(${R * R}-${v}^2)`;
  const chord = (dist, ang, names, color, labelHalf) => {
    const Fx = `${dist}*cos(${ang})`, Fy = `${dist}*sin(${ang})`, ux = `(-sin(${ang}))`, uy = `cos(${ang})`;
    const P1 = [`${Fx}+${half(dist)}*${ux}`, `${Fy}+${half(dist)}*${uy}`];
    const P2 = [`${Fx}-${half(dist)}*${ux}`, `${Fy}-${half(dist)}*${uy}`];
    const s = 0.35;
    const q1 = [`${Fx}-${s}*cos(${ang})`, `${Fy}-${s}*sin(${ang})`];
    const q2 = [`${Fx}-${s}*cos(${ang})+${s}*${ux}`, `${Fy}-${s}*sin(${ang})+${s}*${uy}`];
    const q3 = [`${Fx}+${s}*${ux}`, `${Fy}+${s}*${uy}`];
    const out = [
      G.seg(P1, P2, { color, width: 3 }),
      G.seg([0, 0], [Fx, Fy], { color: C.red, width: 2.6 }),
      G.seg(q1, q2, { color: C.ink, width: 1.3, show: `${dist}>0` }),
      G.seg(q2, q3, { color: C.ink, width: 1.3, show: `${dist}>0` }),
      G.lab(`1.1*(${P1[0]})+0.2*${ux}`, `1.1*(${P1[1]})+0.2*${uy}`, names[1], { size: 15 }),
      G.lab(`1.1*(${P2[0]})-0.2*${ux}`, `1.1*(${P2[1]})-0.2*${uy}`, names[0], { size: 15 }),
      G.lab(`(${dist}+0.55)*cos(${ang})+0.4*${ux}`, `(${dist}+0.55)*sin(${ang})+0.4*${uy}`, names[2], { size: 15, color: C.red }),
    ];
    if (labelHalf) out.push(G.seg([0, 0], P2, { color: C.blue, width: 1.8, dash: true }));
    return out;
  };
  return {
    view: { xMin: -6.5, xMax: 17.5, yMin: -6.3, yMax: 6.3, aspect: 'equal' },
    params: [
      { id: 'd', label: 'AB 的弦心距 $\\overline{OM}$', min: 0, max: 4.5, step: 0.5, value: d },
      { id: 'e', label: 'CD 的弦心距 $\\overline{ON}$', min: 0, max: 4.5, step: 0.5, value: e },
      { id: 't', label: '弦 AB 的方向', min: 0, max: 345, step: 15, value: t, unit: '°' },
    ],
    shapes: [
      circ(0, 0, R, { fill: 'rgba(255,201,60,.18)', color: C.ink }),
      ...chord('d', 't', ['A', 'B', 'M'], C.blue, true),
      ...chord('e', '(t+135)', ['C', 'D', 'N'], C.teal, false),
      dot([0, 0]),
      G.lab(-0.45, 0.45, 'O', { size: 15 }),
      G.lab(12, 5.4, 'r ＝ 5', { size: 18 }),
      G.lab(12, 4.0, 'OM ＝ {d}，AB ＝ {round(2*sqrt(25-d^2)*100)/100}', { size: 17, color: C.blue }),
      G.lab(12, 2.7, 'ON ＝ {e}，CD ＝ {round(2*sqrt(25-e^2)*100)/100}', { size: 17, color: C.teal }),
      G.lab(12, 1.0, String.raw`$\overline{AM}=\sqrt{5^2-\overline{OM}^2}$`, { size: 17, color: '#5a3fd6' }),
      { type: 'text', x: 12, y: -0.6, text: '弦心距相等 → 兩弦等長', size: 16, color: '#16824f', show: 'd==e' },
      { type: 'text', x: 12, y: -0.6, text: 'OM 較小 → AB 較長', size: 16, color: '#16824f', show: 'd<e' },
      { type: 'text', x: 12, y: -0.6, text: 'ON 較小 → CD 較長', size: 16, color: '#16824f', show: 'd>e' },
    ],
    readouts: [
      { label: '半弦 AM ≈', expr: 'sqrt(25-d^2)', digits: 2 },
      { label: '弦長 AB ≈', expr: '2*sqrt(25-d^2)', digits: 2 },
    ],
    caption: '弦心距 OM 垂直平分弦 AB：△OAM 是直角三角形，AM² ＋ OM² ＝ r²',
  };
}
