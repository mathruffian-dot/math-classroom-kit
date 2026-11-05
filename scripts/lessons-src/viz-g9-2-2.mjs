// 九上 2-2 圓心角、圓周角與弧的關係：可拖曳圓上點的視覺化樣板（圓的零件重用 viz-g9-2-1.mjs）。
// 引擎的拖曳點沒有「限制在圓上」的設定（shared/types.ts 的 InteractivePoint），這裡用運算式把手把投影回圓上：
// 圓上點的角度 T ＝ round(atan2(y, x)/10)*10，每 10° 吸附一格，圓心在原點。這樣弧的度數都是整數，check 也能判定相等。
// 手把（橘點）可能離開圓周一點點，用淡虛線連到圓上真正的點。
// 文字一律放在圓的下方（不放右邊）：iPad 直放、手機上圖會縮小，但字級不變，放右邊會壓到圖。詳細數值看讀數。
import { C, G } from './viz.mjs';
import { circ, dot } from './viz-g9-2-1.mjs';

const S = String.raw;
const ARC = (s) => S`$\overset{\frown}{${s}}$`;
const r3 = (v) => Math.round(v * 1000) / 1000;
/** 手把 id 投影到圓上的角度（度）。 */
export const T = (id) => `round(atan2(${id}y,${id}x)/10)*10`;
/** 手把太靠近圓心：沒有唯一的方向可以投影回圓上（原點的 atan2 也不是有效角度），這時不算數。 */
export const nearO = (id) => `hypot(${id}x,${id}y)<1.5`;
/** 狀態不合法時讀數顯示「—」（NaN），不拿零向量算出來的角度當答案。 */
const unless = (bad, expr) => `(${bad})?sqrt(-1):(${expr})`;
const at = (R, a) => [`${R}*cos(${a})`, `${R}*sin(${a})`];
const seed = (R, deg) => [r3(R * Math.cos((deg * Math.PI) / 180)), r3(R * Math.sin((deg * Math.PI) / 180))];
/** 圓周上兩個角度（運算式）之間的弧，描粗。 */
const arcSegs = (R, a0, a1, n, o = {}) =>
  Array.from({ length: n }, (_, i) =>
    G.seg(at(R, `(${a0})+((${a1})-(${a0}))*${i}/${n}`), at(R, `(${a0})+((${a1})-(${a0}))*${i + 1}/${n}`), { color: o.color ?? C.red, width: o.width ?? 4.5, ...(o.show ? { show: o.show } : {}) }),
  );
/** 圓周上 a、b、c（度）三點，量 ∠bac：用兩條弦的方向相減，不套定理，所以讀數是真的量出來的。 */
export const measure = (a, b, c) => `abs(mod(atan2(sin(${b})-sin(${a}),cos(${b})-cos(${a}))-atan2(sin(${c})-sin(${a}),cos(${c})-cos(${a}))+180,360)-180)`;
const handle = (id, R, deg, box = {}) => {
  const [x, y] = seed(R, deg);
  return { id, x, y, color: '#ff7a45', ...box };
};
/** 圓上的點：實心點＋名稱＋連回手把的淡虛線。 */
const vertex = (id, name, R, a, o = {}) => {
  const show = o.show ? { show: o.show } : {};
  return [
    G.seg(at(R, a), [`${id}x`, `${id}y`], { color: '#b7bdd3', width: 1, dash: true, ...show }),
    { type: 'point', x: at(R, a)[0], y: at(R, a)[1], color: o.color ?? C.orange, ...show },
    G.lab(`${R + 0.6}*cos(${a})`, `${R + 0.6}*sin(${a})`, name, { size: 16, color: o.color ?? C.ink, ...show }),
  ];
};
const fixedPoint = (name, R, a) => [{ type: 'point', x: at(R, a)[0], y: at(R, a)[1], color: C.ink }, G.lab(`${R + 0.6}*cos(${a})`, `${R + 0.6}*sin(${a})`, name, { size: 16 })];
const oMark = (dx = -0.5, dy = 0.45) => [dot([0, 0]), G.lab(dx, dy, 'O', { size: 15 })];
/** 圓下方的文字（第 1、2 行）。 */
const under = (R, row, text, o = {}) => ({ ...G.lab(0, -(R + 1.9 + row * 2.3), text, { size: o.size ?? 17, color: o.color ?? C.ink }), ...(o.show ? { show: o.show } : {}) });
const VIEW = (R) => ({ xMin: -R - 1.3, xMax: R + 1.3, yMin: -R - 5.2, yMax: R + 1.3, aspect: 'equal' });

/* ───────────── 第 1 堂：弧的度數 ───────────── */
/** 同心圓（半徑 5、3）：拖 C，弧 CD 的度數＝∠COD；兩圈度數相同，弧長不同（課本 p.110–111）。只看小於半圓的弧：C 限制在 10°–170°，不碰優弧與優角。 */
export function arcDegreeExplore({ deg = 60 } = {}) {
  const R1 = 5, R2 = 3;
  const a = `max(10,min(170,${T('C')}))`;
  const near = nearO('C');
  const ticks = Array.from({ length: 12 }, (_, i) => G.seg(seed(R1, i * 30), seed(R1 + 0.28, i * 30), { color: '#8b93b3', width: 1.2 }));
  const pts = [[0, 0], ...Array.from({ length: 25 }, (_, i) => at(R1, `${a}*${i}/24`))];
  return {
    view: VIEW(R1),
    points: [handle('C', R1, deg, { minX: -6.2, maxX: 6.2, minY: 0.3, maxY: 6.2 })],
    shapes: [
      circ(0, 0, R1, { color: '#6b7394', width: 1.6 }),
      circ(0, 0, R2, { color: '#6b7394', width: 1.6 }),
      ...ticks,
      { type: 'polygon', points: pts, fill: 'rgba(255,138,61,.20)', color: 'rgba(0,0,0,0)', width: 0.5 },
      ...arcSegs(R1, '0', a, 20, { color: C.red }),
      ...arcSegs(R2, '0', a, 20, { color: C.blue }),
      G.seg([0, 0], [R1, 0], { color: C.ink, width: 2.2 }),
      G.seg([0, 0], at(R1, a), { color: C.ink, width: 2.2 }),
      ...oMark(-0.55, -0.45),
      ...vertex('C', 'C', R1, a, { color: C.red, show: `!(${near})` }),
      ...fixedPoint('D', R1, '0'),
      under(R1, 0, S`∠COD ＝ ${ARC('CD')} ＝ {${a}}°`, { color: '#5a3fd6', size: 18, show: `!(${near})` }),
      under(R1, 0, '太靠近圓心了，把 C 往圓周拖', { color: '#6b7394', show: near }),
    ],
    readouts: [
      { label: '弧的度數', expr: unless(near, a) },
      { label: '半徑 5 的弧長是 π 的幾倍', expr: unless(near, `${a}/36`), digits: 2 },
      { label: '半徑 3 的弧長是 π 的幾倍', expr: unless(near, `${a}/60`), digits: 2 },
    ],
    caption: '拖橘點，C 會沿著上半圓走（10°～170°，每 10° 一格）。兩圈度數一樣，弧長不一樣：弧長還要看半徑',
  };
}

/* ───────────── 第 2 堂：圓周角 ───────────── */
const R0 = 4.6;
/** 弧 BC 放在圓的下方：B、C 的角度是 270∓x/2。 */
const B = '(270-x/2)', CC = '(270+x/2)';
/** 拖 A 到圓上任一處：看圓周角和弧、圓心位置（圓心在邊上／角內／角外）的關係（課本 p.114–115）。 */
export function inscribedExplore({ x = 100, deg = 110 } = {}) {
  const t = T('A');
  const dist = `abs(mod(${t}-90,360)-180)`; // A 到弧 BC 中點（270°）的角距離
  const out = `${dist}>x/2`, inArc = `${dist}<x/2`, same = `${dist}==x/2`;
  const p = `abs(mod(${t}+90,360)-180)`; // A 的對徑點到 270° 的角距離
  const q = `abs(mod(${t}+270,360)-180)`; // A 的對徑點到 90° 的角距離
  const inside = `(${out}&&${p}<x/2)||(${inArc}&&${q}<180-x/2)`;
  const onSide = `(${out}&&${p}==x/2)||(${inArc}&&${q}==180-x/2)`;
  const outside = `(${out}&&${p}>x/2)||(${inArc}&&${q}>180-x/2)`;
  const near = nearO('A');
  const bad = `${near}||${same}`; // 頂點和 B、C 重合時一條角邊是零向量，角沒有定義
  const a = at(R0, t), b = at(R0, B), c = at(R0, CC);
  return {
    view: VIEW(R0),
    params: [{ id: 'x', label: S`弧 BC 的度數 $x$`, min: 40, max: 300, step: 20, value: x, unit: '°' }],
    points: [handle('A', R0, deg, { minX: -5.8, maxX: 5.8, minY: -5.8, maxY: 5.8 })],
    shapes: [
      circ(0, 0, R0, { fill: 'rgba(132,204,22,.12)', color: C.ink }),
      ...arcSegs(R0, B, CC, 18, { color: C.red, show: `!(${near})&&${out}` }),
      ...arcSegs(R0, CC, `(630-x/2)`, 18, { color: C.red, show: `!(${near})&&${inArc}` }),
      G.seg([0, 0], b, { color: C.blue, width: 2, dash: true }),
      G.seg([0, 0], c, { color: C.blue, width: 2, dash: true }),
      G.seg(a, b, { color: C.orange, width: 3, show: `!(${bad})` }),
      G.seg(a, c, { color: C.orange, width: 3, show: `!(${bad})` }),
      G.angle(b, a, c, '', { color: C.orange, show: `!(${bad})` }),
      ...oMark(0.5, 0.45),
      ...vertex('A', 'A', R0, t, { show: `!(${near})` }),
      ...fixedPoint('B', R0, B),
      ...fixedPoint('C', R0, CC),
      under(R0, 0, '對的弧 {x}°，∠BAC ＝ {x/2}°', { color: '#b4541a', show: `!(${near})&&${out}` }),
      under(R0, 0, '對的弧 {360-x}°，∠BAC ＝ {180-x/2}°', { color: '#b4541a', show: `!(${near})&&${inArc}` }),
      under(R0, 0, 'A 要和 B、C 分開', { color: '#6b7394', show: `!(${near})&&${same}` }),
      under(R0, 0, '太靠近圓心了，把 A 往圓周拖', { color: '#6b7394', show: near }),
      under(R0, 1, '圓心在角的裡面', { color: '#16824f', show: `!(${near})&&(${inside})` }),
      under(R0, 1, '圓心在角的一邊上', { color: '#5a3fd6', show: `!(${near})&&(${onSide})` }),
      under(R0, 1, '圓心在角的外面', { color: '#1d4fa3', show: `!(${near})&&(${outside})` }),
    ],
    readouts: [
      { label: '量到的 ∠BAC', expr: unless(bad, measure(t, B, CC)), digits: 1 },
      { label: '所對弧的度數', expr: unless(bad, `${out} ? x : 360-x`) },
    ],
    caption: '拖橘點 A：只要所對的弧不變，圓周角就不變，而且永遠是弧的一半',
  };
}

/** 弧 AE 固定：拖 B、C、D 三個頂點，同弧的圓周角都一樣（課本 p.116 圖 11）。 */
export function sameArcExplore({ x = 100, degs = [150, 90, 40] } = {}) {
  const A = '(270-x/2)', E = '(270+x/2)';
  const names = ['B', 'C', 'D'];
  const colors = [C.blue, C.orange, C.teal];
  const outOf = (id) => `abs(mod(${T(id)}-90,360)-180)>x/2`;
  const hit = (id) => `abs(mod(${T(id)}-90,360)-180)==x/2`; // 和 A 或 E 重合
  const bad = (id) => `${nearO(id)}||${hit(id)}`;
  const anyNear = names.map(nearO).join('||');
  const anyHit = names.map(hit).join('||');
  const parts = names.flatMap((n, i) => {
    const p = at(R0, T(n));
    const show = `!(${bad(n)})`;
    return [
      G.seg(p, at(R0, A), { color: colors[i], width: 2.6, show }),
      G.seg(p, at(R0, E), { color: colors[i], width: 2.6, show }),
      G.angle(at(R0, A), p, at(R0, E), '', { color: colors[i], show }),
      ...vertex(n, n, R0, T(n), { color: colors[i], show: `!(${nearO(n)})` }),
    ];
  });
  return {
    view: VIEW(R0),
    params: [{ id: 'x', label: S`弧 AE 的度數 $x$`, min: 40, max: 240, step: 20, value: x, unit: '°' }],
    points: names.map((n, i) => handle(n, R0, degs[i], { minX: -5.8, maxX: 5.8, minY: -5.8, maxY: 5.8 })),
    shapes: [
      circ(0, 0, R0, { fill: 'rgba(255,201,60,.12)', color: C.ink }),
      ...arcSegs(R0, A, E, 18),
      ...parts,
      ...oMark(0.5, 0.45),
      ...fixedPoint('A', R0, A),
      ...fixedPoint('E', R0, E),
      under(R0, 0, S`${ARC('AE')} ＝ {x}°，一半是 {x/2}°`, { color: '#b4541a' }),
      under(R0, 1, '三個角都對著同一段弧', { color: '#16824f', show: `!(${anyNear})&&${outOf('B')}&&${outOf('C')}&&${outOf('D')}` }),
      under(R0, 1, '有點跑到紅色的弧上了', { color: '#5a3fd6', show: `!(${anyNear})&&!(${anyHit})&&!(${outOf('B')}&&${outOf('C')}&&${outOf('D')})` }),
      under(R0, 1, '頂點要和 A、E 分開', { color: '#6b7394', show: `!(${anyNear})&&(${anyHit})` }),
      under(R0, 1, '太靠近圓心了，把頂點往圓周拖', { color: '#6b7394', show: anyNear }),
    ],
    readouts: names.map((n) => ({ label: `量到的 ∠A${n}E`, expr: unless(bad(n), measure(T(n), A, E)), digits: 1 })),
    caption: '拖三個橘點：頂點都在紅弧的另一側時，三個圓周角都是同一段弧的一半',
  };
}

/* ───────────── 第 3 堂：半圓、平行弦 ───────────── */
/** AB 是直徑：拖 C 沿上半圓走，∠ACB 永遠 90°（課本 p.119 圖 13）。 */
export function semicircleExplore({ deg = 130 } = {}) {
  const R = 5;
  const t = `max(10,min(170,${T('C')}))`;
  const near = nearO('C');
  const c = at(R, t);
  // C 往 B、往 A 的方向角：弦的方向由兩端的角度決定
  const u = `(${t}/2-90)`, v = `(${t}/2+180)`;
  const s = 0.5;
  const q1 = [`${c[0]}+${s}*cos(${u})`, `${c[1]}+${s}*sin(${u})`];
  const q3 = [`${c[0]}+${s}*cos(${v})`, `${c[1]}+${s}*sin(${v})`];
  const q2 = [`${c[0]}+${s}*cos(${u})+${s}*cos(${v})`, `${c[1]}+${s}*sin(${u})+${s}*sin(${v})`];
  return {
    view: VIEW(R),
    points: [handle('C', R, deg, { minX: -6, maxX: 6, minY: 0.3, maxY: 6.2 })],
    shapes: [
      circ(0, 0, R, { fill: 'rgba(47,128,237,.08)', color: C.ink }),
      ...arcSegs(R, '180', '360', 18),
      G.seg([-R, 0], [R, 0], { color: C.blue, width: 3 }),
      G.seg(c, [-R, 0], { color: C.teal, width: 3 }),
      G.seg(c, [R, 0], { color: C.teal, width: 3 }),
      G.seg(q1, q2, { color: C.ink, width: 1.5 }),
      G.seg(q3, q2, { color: C.ink, width: 1.5 }),
      dot([0, 0]),
      G.lab(0, -0.55, 'O', { size: 15 }),
      ...vertex('C', 'C', R, t, { color: C.teal }),
      G.lab(-R - 0.55, 0, 'A', { size: 16 }),
      G.lab(R + 0.55, 0, 'B', { size: 16 }),
      under(R, 0, '∠ACB ＝ 90°', { color: '#0f766e', size: 19, show: `!(${near})` }),
      under(R, 1, `∠CAB ＝ {${t}/2}°，∠CBA ＝ {90-${t}/2}°`, { size: 16, show: `!(${near})` }),
      under(R, 0, '太靠近圓心了，把 C 往圓周拖', { color: '#6b7394', show: near }),
    ],
    readouts: [
      { label: '量到的 ∠ACB', expr: unless(near, measure(t, '180', '0')), digits: 1 },
      { label: '∠CAB ＋ ∠CBA', expr: unless(near, `${t}/2+90-${t}/2`) },
    ],
    caption: '拖橘點 C：三角形的形狀一直變，但只要 AB 是直徑，∠ACB 就是直角',
  };
}

/** 兩弦 AB、CD：調 CD 的傾斜 k，k＝0 時 AB ∥ CD，兩段弧 AC、BD 的度數相等（課本 p.120）。 */
export function parallelChordsExplore({ a1 = 50, a2 = 110, k = 15 } = {}) {
  const R = 5;
  const A = '(90+a1)', Bb = '(90-a1)', Cc = '(90+a2+k)', D = '(90-a2+k)';
  return {
    view: VIEW(R),
    params: [
      { id: 'a1', label: '弦 AB 的長短', min: 30, max: 70, step: 10, value: a1 },
      { id: 'a2', label: '弦 CD 的高低', min: 100, max: 150, step: 10, value: a2 },
      { id: 'k', label: '弦 CD 的傾斜', min: -20, max: 20, step: 5, value: k, unit: '°' },
    ],
    shapes: [
      circ(0, 0, R, { fill: 'rgba(18,163,154,.10)', color: C.ink }),
      ...arcSegs(R, A, Cc, 8, { color: C.red }),
      ...arcSegs(R, D, Bb, 8, { color: C.red }),
      G.seg(at(R, A), at(R, Bb), { color: C.blue, width: 3.2 }),
      G.seg(at(R, Cc), at(R, D), { color: C.violet, width: 3.2 }),
      ...oMark(0.5, 0.4),
      ...fixedPoint('A', R, A),
      ...fixedPoint('B', R, Bb),
      ...fixedPoint('C', R, Cc),
      ...fixedPoint('D', R, D),
      under(R, 0, S`${ARC('AC')} ＝ {a2+k-a1}°，${ARC('BD')} ＝ {a2-k-a1}°`, { color: C.red, size: 18 }),
      under(R, 1, '兩弦平行：兩弧相等', { color: '#16824f', show: 'k==0' }),
      under(R, 1, '兩弦不平行：兩弧不相等', { color: '#5a3fd6', show: 'k!=0' }),
    ],
    readouts: [
      { label: '弧 AC 的度數', expr: 'a2+k-a1' },
      { label: '弧 BD 的度數', expr: 'a2-k-a1' },
    ],
    caption: '傾斜調成 0° 時兩弦平行，紅色兩段弧一樣大；反過來，兩弧相等時兩弦也平行',
  };
}

/* ───────────── 第 4 堂：圓內接四邊形 ───────────── */
/** 拖四個頂點（各在一個象限，順序不會交叉）：對角互補（課本 p.121）。 */
export function cyclicExplore({ degs = [140, 210, 320, 50] } = {}) {
  const R = 5;
  const names = ['A', 'B', 'C', 'D'];
  const box = [
    { minX: -6.2, maxX: -1, minY: 1, maxY: 6.2 },
    { minX: -6.2, maxX: -1, minY: -6.2, maxY: -1 },
    { minX: 1, maxX: 6.2, minY: -6.2, maxY: -1 },
    { minX: 1, maxX: 6.2, minY: 1, maxY: 6.2 },
  ];
  const t = Object.fromEntries(names.map((n) => [n, T(n)]));
  const p = Object.fromEntries(names.map((n) => [n, at(R, t[n])]));
  // 每個內角＝所對的弧（不含該頂點）的一半
  const ang = { A: `mod(${t.D}-${t.B},360)/2`, B: `mod(${t.A}-${t.C},360)/2`, C: `mod(${t.B}-${t.D},360)/2`, D: `mod(${t.C}-${t.A},360)/2` };
  const mark = (v, a, b, color) => G.angle(p[a], p[v], p[b], '', { color });
  return {
    view: VIEW(R),
    points: names.map((n, i) => handle(n, R, degs[i], box[i])),
    shapes: [
      circ(0, 0, R, { color: C.ink }),
      { type: 'polygon', points: [p.A, p.B, p.C, p.D], fill: 'rgba(132,204,22,.20)', color: C.ink, width: 2.4 },
      mark('A', 'D', 'B', C.red),
      mark('C', 'B', 'D', C.red),
      mark('B', 'A', 'C', C.blue),
      mark('D', 'C', 'A', C.blue),
      ...names.flatMap((n) => vertex(n, n, R, t[n], { color: n === 'A' || n === 'C' ? C.red : '#1d4fa3' })),
      under(R, 0, `∠A ＋ ∠C ＝ {${ang.A}}° ＋ {${ang.C}}°`, { color: C.red }),
      under(R, 1, `∠B ＋ ∠D ＝ {${ang.B}}° ＋ {${ang.D}}°`, { color: '#1d4fa3' }),
    ],
    readouts: [
      { label: '量到的 ∠A', expr: measure(t.A, t.D, t.B), digits: 1 },
      { label: '量到的 ∠C', expr: measure(t.C, t.B, t.D), digits: 1 },
      { label: '量到的 ∠B', expr: measure(t.B, t.A, t.C), digits: 1 },
      { label: '量到的 ∠D', expr: measure(t.D, t.C, t.A), digits: 1 },
    ],
    caption: '拖四個橘點（各在自己的象限內）：四邊形怎麼變，對角加起來都是 180°',
  };
}
