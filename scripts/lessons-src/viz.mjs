// 可重複使用的「可操作視覺化」樣板：產生 lesson JSON 的 interactive 區塊。
// 座標為數學座標（y 向上）；運算式語法見 docs/AUTHORING.md。
export const C = {
  violet: '#7b61ff',
  blue: '#2f80ed',
  orange: '#ff8a3d',
  teal: '#12a39a',
  red: '#e5484d',
  ink: '#1f2a56',
  fViolet: 'rgba(123,97,255,.26)',
  fBlue: 'rgba(47,128,237,.26)',
  fOrange: 'rgba(255,138,61,.32)',
  fTeal: 'rgba(18,163,154,.26)',
};

/** 數線：底線＋每 every 一個刻度。 */
export function numberLine(min, max, every = 1, y = 0) {
  const shapes = [{ type: 'segment', points: [[min - 0.3, y], [max + 0.3, y]], color: '#6b7394', width: 1.6 }];
  for (let i = Math.ceil(min); i <= max; i += every) {
    shapes.push({ type: 'segment', points: [[i, y - 0.12], [i, y + 0.12]], color: '#6b7394', width: 1.4 });
    shapes.push({ type: 'text', x: i, y: y - 0.5, text: String(i), size: 12, color: '#6b7394' });
  }
  return shapes;
}

/** a√m 就是 a 個 √m 接起來。 */
export function rodsRadical({ a = 3, m = 2 } = {}) {
  const shapes = [...numberLine(0, 16, 2)];
  for (let i = 0; i < 6; i++) {
    shapes.push({
      type: 'rect', x: `${i}*sqrt(m)`, y: 0.25, w: 'sqrt(m)', h: 0.7,
      fill: i % 2 ? C.fBlue : C.fViolet, color: i % 2 ? C.blue : C.violet, show: `a>${i}`,
    });
    shapes.push({ type: 'text', x: `(${i}+0.5)*sqrt(m)`, y: 0.6, text: '$\\sqrt{m}$', size: 13, show: `a>${i}` });
  }
  shapes.push({ type: 'brace', points: [[0, 1.05], ['a*sqrt(m)', 1.05]], text: '${a}\\sqrt{m} \\approx {round(a*sqrt(m),2)}$' });
  shapes.push({ type: 'point', x: 'a*sqrt(m)', y: 0, color: C.red });
  return {
    view: { xMin: -0.6, xMax: 16.6, yMin: -1.4, yMax: 3.4, aspect: 'equal' },
    params: [
      { id: 'a', label: '幾個（係數 $a$）', min: 1, max: 6, step: 1, value: a },
      { id: 'm', label: '根號內 $m$', min: 2, max: 7, step: 1, value: m },
    ],
    shapes,
    readouts: [
      { label: '$a\\sqrt{m} \\approx$', expr: 'a*sqrt(m)', digits: 3 },
      { label: '$\\sqrt{a^2 m} \\approx$', expr: 'sqrt(a^2*m)', digits: 3 },
    ],
    caption: '$a\\sqrt{m}$ 表示 $a$ 個 $\\sqrt{m}$ 接在一起，也等於 $\\sqrt{a^2 m}$',
  };
}

/** √a × √b：長方形面積＝√(a×b)。 */
export function rectMult({ a = 3, b = 7 } = {}) {
  return {
    view: { xMin: -1.4, xMax: 6, yMin: -1.2, yMax: 5.4, aspect: 'equal', grid: 1 },
    params: [
      { id: 'a', label: '長 $\\sqrt{a}$ 的 $a$', min: 1, max: 20, step: 1, value: a },
      { id: 'b', label: '寬 $\\sqrt{b}$ 的 $b$', min: 1, max: 20, step: 1, value: b },
    ],
    shapes: [
      { type: 'rect', x: 0, y: 0, w: 'sqrt(a)', h: 'sqrt(b)', fill: C.fBlue, color: C.blue, width: 2 },
      { type: 'brace', points: [['sqrt(a)', 0], [0, 0]], text: '$\\sqrt{a}$' },
      { type: 'brace', points: [[0, 0], [0, 'sqrt(b)']], text: '$\\sqrt{b}$' },
      { type: 'text', x: 'sqrt(a)/2', y: 'sqrt(b)/2', text: '面積 $\\sqrt{a*b}$', size: 17, color: '#1d4fa3' },
    ],
    readouts: [
      { label: '$\\sqrt{a}\\times\\sqrt{b} \\approx$', expr: 'sqrt(a)*sqrt(b)', digits: 3 },
      { label: '$\\sqrt{a\\times b} \\approx$', expr: 'sqrt(a*b)', digits: 3 },
    ],
    caption: '長 $\\sqrt{a}$、寬 $\\sqrt{b}$ 的長方形，面積就是 $\\sqrt{a\\times b}$',
  };
}

/** 比較 a√b 與 c√d：把係數平方移進根號，在數線上比位置。 */
export function compareRadicals({ a = 3, b = 2, c = 2, d = 3 } = {}) {
  return {
    view: { xMin: -0.5, xMax: 12.5, yMin: -2.6, yMax: 2.6, aspect: 'fill' },
    params: [
      { id: 'a', label: '$a$', min: 1, max: 5, step: 1, value: a },
      { id: 'b', label: '$\\sqrt{b}$ 的 $b$', min: 2, max: 7, step: 1, value: b },
      { id: 'c', label: '$c$', min: 1, max: 5, step: 1, value: c },
      { id: 'd', label: '$\\sqrt{d}$ 的 $d$', min: 2, max: 7, step: 1, value: d },
    ],
    shapes: [
      ...numberLine(0, 12, 1),
      { type: 'point', x: 'a*sqrt(b)', y: 0, color: C.violet },
      { type: 'segment', points: [['a*sqrt(b)', 0.15], ['a*sqrt(b)', 1.1]], color: C.violet, dash: true },
      { type: 'text', x: 'a*sqrt(b)', y: 1.5, text: '${a}\\sqrt{b} = \\sqrt{a^2*b}$', color: '#5a3fd6', size: 16 },
      { type: 'point', x: 'c*sqrt(d)', y: 0, color: C.orange },
      { type: 'segment', points: [['c*sqrt(d)', -0.9], ['c*sqrt(d)', -1.5]], color: C.orange, dash: true },
      { type: 'text', x: 'c*sqrt(d)', y: -1.95, text: '${c}\\sqrt{d} = \\sqrt{c^2*d}$', color: '#b4541a', size: 16 },
    ],
    readouts: [
      { label: '$a^2\\times b$', expr: 'a^2*b' },
      { label: '$c^2\\times d$', expr: 'c^2*d' },
    ],
    caption: '根號內的數越大，平方根越大',
  };
}

/** √a ÷ √b 與 √(a÷b) 在數線上落在同一點。 */
export function divideLine({ a = 35, b = 7 } = {}) {
  return {
    view: { xMin: -0.5, xMax: 8.5, yMin: -2.4, yMax: 2.8, aspect: 'fill' },
    params: [
      { id: 'a', label: '$\\sqrt{a}$ 的 $a$', min: 1, max: 60, step: 1, value: a },
      { id: 'b', label: '$\\sqrt{b}$ 的 $b$', min: 1, max: 12, step: 1, value: b },
    ],
    shapes: [
      ...numberLine(0, 8, 1),
      { type: 'point', x: 'sqrt(a)', y: 0, color: C.blue, text: '$\\sqrt{a}$' },
      { type: 'point', x: 'sqrt(b)', y: 0, color: C.orange, text: '$\\sqrt{b}$' },
      { type: 'segment', points: [['sqrt(a)/sqrt(b)', -0.2], ['sqrt(a)/sqrt(b)', -1.2]], color: C.violet, width: 3 },
      { type: 'text', x: 'sqrt(a)/sqrt(b)', y: -1.7, text: '$\\sqrt{a}\\div\\sqrt{b} = \\sqrt{\\frac{a}{b}}$', color: '#5a3fd6', size: 16 },
    ],
    readouts: [
      { label: '$\\sqrt{a}\\div\\sqrt{b} \\approx$', expr: 'sqrt(a)/sqrt(b)', digits: 3 },
      { label: '$\\sqrt{\\frac{a}{b}} \\approx$', expr: 'sqrt(a/b)', digits: 3 },
    ],
    caption: '先除再開根號，結果相同',
  };
}

/** 面積 k²m 的正方形切成 k×k 個面積 m 的小正方形：√(k²m) = k√m（課本 p.77 探索）。 */
export function squareGrid({ k = 3, m = 2 } = {}) {
  const shapes = [
    { type: 'rect', x: 0, y: 0, w: 'k*sqrt(m)', h: 'k*sqrt(m)', fill: 'rgba(123,97,255,.12)', color: C.violet, width: 2.2 },
    { type: 'rect', x: 0, y: 0, w: 'sqrt(m)', h: 'sqrt(m)', fill: C.fOrange, color: C.orange },
    { type: 'text', x: 'sqrt(m)/2', y: 'sqrt(m)/2', text: '{m}', size: 14, color: '#b4541a' },
  ];
  for (let i = 1; i < 5; i++) {
    shapes.push({ type: 'segment', points: [[`${i}*sqrt(m)`, 0], [`${i}*sqrt(m)`, 'k*sqrt(m)']], color: C.violet, dash: true, show: `k>${i}` });
    shapes.push({ type: 'segment', points: [[0, `${i}*sqrt(m)`], ['k*sqrt(m)', `${i}*sqrt(m)`]], color: C.violet, dash: true, show: `k>${i}` });
  }
  shapes.push(
    { type: 'brace', points: [[0, 'k*sqrt(m)'], ['k*sqrt(m)', 'k*sqrt(m)']], text: '邊長 ${k}\\sqrt{m}$' },
    { type: 'brace', points: [['k*sqrt(m)', 'sqrt(m)'], ['k*sqrt(m)', 0]], text: '$\\sqrt{m}$' },
    { type: 'text', x: 'k*sqrt(m)/2', y: 'k*sqrt(m)/2 + 0.2', text: '面積 {k^2*m}', size: 18, color: '#5a3fd6', show: 'k>1' },
  );
  return {
    view: { xMin: -1.4, xMax: 15.6, yMin: -1, yMax: 15.6, aspect: 'equal' },
    params: [
      { id: 'k', label: '每邊幾個小正方形 $k$', min: 1, max: 5, step: 1, value: k },
      { id: 'm', label: '小正方形面積 $m$', min: 2, max: 7, step: 1, value: m },
    ],
    shapes,
    readouts: [
      { label: '大正方形面積 $k^2 m$', expr: 'k^2*m' },
      { label: '$\\sqrt{k^2 m} \\approx$', expr: 'sqrt(k^2*m)', digits: 3 },
      { label: '$k\\sqrt{m} \\approx$', expr: 'k*sqrt(m)', digits: 3 },
    ],
    caption: '大正方形的邊長：用面積算是 $\\sqrt{k^2 m}$，用小正方形數是 $k\\sqrt{m}$',
  };
}

/** 正方形對角線 s√2，用圓規轉到數線上（課本 p.78 補給站）。 */
export function diagonal({ s = 1 } = {}) {
  return {
    view: { xMin: -1.2, xMax: 7.2, yMin: -0.9, yMax: 4.6, aspect: 'equal' },
    params: [{ id: 's', label: '正方形邊長 $s$', min: 1, max: 4, step: 1, value: s }],
    shapes: [
      ...numberLine(-1, 6, 1),
      { type: 'rect', x: 0, y: 0, w: 's', h: 's', fill: C.fBlue, color: C.blue },
      { type: 'segment', points: [[0, 0], ['s', 's']], color: C.red, width: 3 },
      { type: 'circle', x: 0, y: 0, r: 's*sqrt(2)', color: C.red, dash: true, width: 1.4 },
      { type: 'point', x: 's*sqrt(2)', y: 0, color: C.red, text: '${s}\\sqrt{2} \\approx {round(s*sqrt(2),3)}$' },
      { type: 'text', x: 's/2 - 0.3', y: 's/2 + 0.35', text: '對角線', size: 13, color: C.red },
    ],
    readouts: [{ label: '對角線 $s\\sqrt{2} \\approx$', expr: 's*sqrt(2)', digits: 3 }],
    caption: '以原點為圓心、對角線為半徑畫弧，交數線於 $s\\sqrt{2}$',
  };
}

/** a/√b 乘以 √b/√b（等於 1）變成 a√b/b，數線上是同一點。 */
export function rationalize({ a = 1, b = 2 } = {}) {
  return {
    view: { xMin: -0.4, xMax: 6.4, yMin: -2.2, yMax: 4.2, aspect: 'fill' },
    params: [
      { id: 'a', label: '分子 $a$', min: 1, max: 6, step: 1, value: a },
      { id: 'b', label: '分母 $\\sqrt{b}$ 的 $b$', min: 2, max: 7, step: 1, value: b },
    ],
    shapes: [
      ...numberLine(0, 6, 1),
      { type: 'point', x: 'a/sqrt(b)', y: 0, color: C.violet, text: '≈ {round(a/sqrt(b),3)}' },
      { type: 'text', x: 3.2, y: 3.5, text: '$\\dfrac{a}{\\sqrt{b}}$', size: 22, color: C.ink, focus: [0] },
      { type: 'text', x: 3.2, y: 2.5, text: '$= \\dfrac{a\\times\\sqrt{b}}{\\sqrt{b}\\times\\sqrt{b}}$', size: 19, color: '#1d4fa3', step: 1 },
      { type: 'text', x: 3.2, y: 1.5, text: '$= \\dfrac{a\\sqrt{b}}{b}$', size: 22, color: '#5a3fd6', step: 2 },
    ],
    steps: [
      '分母有根號，不容易估算大小',
      '分子、分母同乘 $\\sqrt{b}$（$\\frac{\\sqrt{b}}{\\sqrt{b}}=1$，值不變）',
      '$\\sqrt{b}\\times\\sqrt{b}=b$，分母變成整數：完成有理化',
    ],
    readouts: [
      { label: '$\\frac{a}{\\sqrt{b}} \\approx$', expr: 'a/sqrt(b)', digits: 4 },
      { label: '$\\frac{a\\sqrt{b}}{b} \\approx$', expr: 'a*sqrt(b)/b', digits: 4 },
    ],
  };
}

/** 逐步解題：每一行在自己的步驟發光，前面的步驟反暗。 */
export function stepsViz(lines, captions, { size = 21 } = {}) {
  const n = lines.length;
  return {
    view: { xMin: 0, xMax: 12, yMin: 0, yMax: n + 0.6, aspect: 'fill' },
    shapes: lines.map((text, i) => ({
      type: 'text', x: 6, y: n - i, text, size: i === 0 ? size + 2 : size, color: i === n - 1 ? '#5a3fd6' : C.ink, step: i,
    })),
    steps: captions,
  };
}

/** 同類方根：a 個 √m ＋ b 個 √m＝(a+b)√m；切換「不同類」看 √m＋√n 為何不能合併。 */
export function likeRods({ a = 3, b = 2, m = 2, n = 3 } = {}) {
  const shapes = [...numberLine(0, 16, 2)];
  for (let i = 0; i < 5; i++) {
    shapes.push({ type: 'rect', x: `${i}*sqrt(m)`, y: 0.25, w: 'sqrt(m)', h: 0.7, fill: C.fBlue, color: C.blue, show: `a>${i}` });
    shapes.push({ type: 'text', x: `(${i}+0.5)*sqrt(m)`, y: 0.6, text: '$\\sqrt{m}$', size: 12, show: `a>${i}` });
    const w = '(unlike ? sqrt(n) : sqrt(m))';
    shapes.push({ type: 'rect', x: `a*sqrt(m)+${i}*${w}`, y: 0.25, w, h: 0.7, fill: C.fOrange, color: C.orange, show: `b>${i}` });
    shapes.push({ type: 'text', x: `a*sqrt(m)+(${i}+0.5)*${w}`, y: 0.6, text: '$\\sqrt{unlike ? n : m}$', size: 12, show: `b>${i}` });
  }
  shapes.push(
    { type: 'brace', points: [[0, 1.05], ['(a+b)*sqrt(m)', 1.05]], text: '${a}\\sqrt{m} + {b}\\sqrt{m} = {a+b}\\sqrt{m}$', show: '!unlike' },
    { type: 'brace', points: [[0, 1.05], ['a*sqrt(m)', 1.05]], text: '${a}\\sqrt{m}$', show: 'unlike' },
    { type: 'brace', points: [['a*sqrt(m)', 1.05], ['a*sqrt(m)+b*sqrt(n)', 1.05]], text: '${b}\\sqrt{n}$', show: 'unlike' },
    { type: 'text', x: 8, y: 2.9, text: '長度不同的「單位」不能合併成一種', size: 15, color: C.red, show: 'unlike' },
  );
  return {
    view: { xMin: -0.6, xMax: 16.6, yMin: -1.4, yMax: 3.4, aspect: 'equal' },
    params: [
      { id: 'a', label: '藍色個數 $a$', min: 1, max: 5, step: 1, value: a },
      { id: 'b', label: '橘色個數 $b$', min: 1, max: 5, step: 1, value: b },
      { id: 'm', label: '$\\sqrt{m}$ 的 $m$', min: 2, max: 7, step: 1, value: m },
      { id: 'unlike', label: '橘色換成 $\\sqrt{n}$（不同類）', kind: 'toggle', value: 0 },
      { id: 'n', label: '$\\sqrt{n}$ 的 $n$', min: 2, max: 7, step: 1, value: n },
    ],
    shapes,
    readouts: [{ label: '總長 ≈', expr: 'a*sqrt(m) + b*(unlike ? sqrt(n) : sqrt(m))', digits: 3 }],
    caption: '同類方根像同樣長的積木，可以數個數合併',
  };
}

/** 分配律面積模型：高 h、寬 w1 + w2 的長方形（皆為數值），標籤為文字。 */
export function areaSplit({ h, w1, w2, hLabel, w1Label, w2Label, area1, area2, total }) {
  const W = w1 + w2;
  return {
    view: { xMin: -1.2, xMax: W + 0.6, yMin: -1.2, yMax: h + 1.4, aspect: 'equal' },
    shapes: [
      { type: 'rect', x: 0, y: 0, w: w1, h, fill: C.fBlue, color: C.blue, focus: [1, 3] },
      { type: 'rect', x: w1, y: 0, w: w2, h, fill: C.fOrange, color: C.orange, focus: [2, 3] },
      { type: 'brace', points: [[0, h], [w1, h]], text: w1Label },
      { type: 'brace', points: [[w1, h], [W, h]], text: w2Label },
      { type: 'brace', points: [[0, 0], [0, h]], text: hLabel },
      { type: 'text', x: w1 / 2, y: h / 2, text: area1, size: 15, color: '#1d4fa3', step: 1 },
      { type: 'text', x: w1 + w2 / 2, y: h / 2, text: area2, size: 15, color: '#b4541a', step: 2 },
      { type: 'text', x: W / 2, y: -0.7, text: total, size: 17, color: '#5a3fd6', step: 3 },
    ],
    steps: ['整塊長方形 = 高 ×（兩段寬的和）', '左塊：高 × 第一段', '右塊：高 × 第二段', '兩塊相加，化成最簡根式'],
  };
}

/** (a+b)²，a = p、b = c√q 的面積模型。 */
export function binomialSquare({ p = 3, c = 2, q = 5 } = {}) {
  const S = 'p+c*sqrt(q)';
  return {
    view: { xMin: -1.6, xMax: 15.2, yMin: -1.2, yMax: 16.4, aspect: 'equal' },
    params: [
      { id: 'p', label: '$a$（整數）', min: 1, max: 5, step: 1, value: p },
      { id: 'c', label: '$b=c\\sqrt{q}$ 的 $c$', min: 1, max: 3, step: 1, value: c },
      { id: 'q', label: '$b=c\\sqrt{q}$ 的 $q$', min: 2, max: 7, step: 1, value: q },
    ],
    shapes: [
      { type: 'rect', x: 0, y: 'c*sqrt(q)', w: 'p', h: 'p', fill: C.fViolet, color: C.violet },
      { type: 'rect', x: 'p', y: 'c*sqrt(q)', w: 'c*sqrt(q)', h: 'p', fill: C.fBlue, color: C.blue },
      { type: 'rect', x: 0, y: 0, w: 'p', h: 'c*sqrt(q)', fill: C.fBlue, color: C.blue },
      { type: 'rect', x: 'p', y: 0, w: 'c*sqrt(q)', h: 'c*sqrt(q)', fill: C.fOrange, color: C.orange },
      { type: 'text', x: 'p/2', y: 'c*sqrt(q)+p/2', text: '$a^2={p^2}$', color: '#5a3fd6', size: 15 },
      { type: 'text', x: 'p+c*sqrt(q)/2', y: 'c*sqrt(q)+p/2', text: '${p*c}\\sqrt{q}$', color: '#1d4fa3', size: 15 },
      { type: 'text', x: 'p/2', y: 'c*sqrt(q)/2', text: '${p*c}\\sqrt{q}$', color: '#1d4fa3', size: 15 },
      { type: 'text', x: 'p+c*sqrt(q)/2', y: 'c*sqrt(q)/2', text: '$b^2={c^2*q}$', color: '#b4541a', size: 15 },
      { type: 'brace', points: [[0, S], ['p', S]], text: '$a={p}$' },
      { type: 'brace', points: [['p', S], [S, S]], text: '$b={c}\\sqrt{q}$' },
      { type: 'text', x: `(${S})/2`, y: `${S}+1.7`, text: '$(a+b)^2 = {p^2+c^2*q} + {2*p*c}\\sqrt{q}$', size: 17, color: C.ink },
    ],
    readouts: [
      { label: '$(a+b)^2 \\approx$', expr: `(${S})^2`, digits: 3 },
      { label: '$a^2+b^2$', expr: 'p^2+c^2*q' },
      { label: '中間兩塊 $2ab \\approx$', expr: '2*p*c*sqrt(q)', digits: 3 },
    ],
    caption: '根式也能用和的平方公式：中間兩塊 $2ab$ 不能漏',
  };
}

/** (a+b)(a−b) = a² − b²：把切下的長條移過去拼成長方形。 */
export function diffSquares({ p = 3, q = 5 } = {}) {
  const b = 'sqrt(q)';
  return {
    view: { xMin: -1.4, xMax: 9.6, yMin: -1.6, yMax: 6.8, aspect: 'equal' },
    params: [
      { id: 'p', label: '$a$（整數）', min: 2, max: 5, step: 1, value: p },
      { id: 'q', label: '$b=\\sqrt{q}$ 的 $q$', min: 1, max: 15, step: 1, value: q },
      { id: 'move', label: '把長條移到右邊', kind: 'toggle', value: 0 },
    ],
    shapes: [
      { type: 'rect', x: 0, y: 0, w: 'p', h: `p-${b}`, fill: C.fBlue, color: C.blue, show: `q<p^2` },
      { type: 'rect', x: 0, y: `p-${b}`, w: `p-${b}`, h: b, fill: C.fTeal, color: C.teal, show: `q<p^2 && !move`, toggle: 'move' },
      { type: 'rect', x: `p-${b}`, y: `p-${b}`, w: b, h: b, color: C.red, dash: true, show: `q<p^2 && !move` },
      { type: 'text', x: `p-${b}/2`, y: `p-${b}/2+${b}`, text: '挖掉 $b^2$', size: 13, color: C.red, show: `q<p^2 && !move` },
      { type: 'rect', x: 'p', y: 0, w: b, h: `p-${b}`, fill: C.fTeal, color: C.teal, show: `q<p^2 && move`, toggle: 'move' },
      { type: 'brace', points: [[0, 'p'], ['p', 'p']], text: '$a={p}$', show: '!move' },
      { type: 'brace', points: [[0, `p-${b}`], [`p+${b}`, `p-${b}`]], text: '$a+b={p}+\\sqrt{q}$', show: 'move' },
      { type: 'brace', points: [[0, 0], [0, `p-${b}`]], text: '$a-b$', show: 'move' },
      { type: 'text', x: 4, y: -1, text: '面積 $= a^2-b^2 = {p^2}-{q} = {p^2-q}$', size: 16, color: '#5a3fd6', show: 'q<p^2' },
      { type: 'text', x: 4, y: 3, text: '請讓 $b^2$ 小於 $a^2$（$q < {p^2}$）', size: 15, color: C.red, show: 'q>=p^2' },
    ],
    readouts: [
      { label: '$(a+b)(a-b) \\approx$', expr: `(p+${b})*(p-${b})`, digits: 3 },
      { label: '$a^2-b^2$', expr: 'p^2-q' },
    ],
    caption: '點綠色長條或開關，把它移過去拼成長方形',
  };
}
