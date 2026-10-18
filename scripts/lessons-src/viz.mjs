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

/** 最後一步把所有步驟都點亮：完整的解題過程一次看清楚（其餘步驟仍是目前步驟發光、其他反暗）。 */
function litAtEnd(spec) {
  const last = spec.steps.length - 1;
  for (const s of spec.shapes) if (s.step !== undefined && !s.focus) s.focus = s.step === last ? [last] : [s.step, last];
  return spec;
}

/**
 * 比大小（課本例 2 的解法，步驟化）：左右兩欄把係數平方移進根號，
 * 再比根號內的數，最後在數線上確認。沒有滑桿；按「下一步」逐步揭示，目前步驟發光。
 */
export function compareSteps({ a = 3, b = 2, c = 2, d = 3 } = {}) {
  const L = a * a * b,
    R = c * c * d,
    sign = L > R ? '＞' : L < R ? '＜' : '＝';
  const lo = Math.floor(Math.sqrt(Math.min(L, R))),
    hi = Math.ceil(Math.sqrt(Math.max(L, R))) + (Math.sqrt(Math.max(L, R)) % 1 === 0 ? 1 : 0),
    X = (v) => 1.5 + ((v - lo) / (hi - lo)) * 9; // 數線 1.5～10.5
  const col = (x, coef, rad, sq, color, s1, s2) => [
    { type: 'text', x, y: 4.15, text: `${coef} ＝ √${coef * coef}`, size: 17, color: C.orange, step: s1 },
    { type: 'text', x, y: 3.25, text: `${coef}√${rad} ＝ √${coef * coef} × √${rad}`, size: 19, color: C.ink, step: s1 },
    { type: 'text', x, y: 2.35, text: `＝ √${sq}`, size: 22, color, step: s2 },
  ];
  const ticks = [];
  for (let v = lo; v <= hi; v++) {
    ticks.push({ type: 'segment', points: [[X(v), 0.05], [X(v), 0.35]], color: C.ink, width: 1.6, step: 4 });
    ticks.push({ type: 'text', x: X(v), y: -0.35, text: String(v), size: 13, color: C.ink, step: 4 });
  }
  return litAtEnd({
    view: { xMin: 0, xMax: 12, yMin: -0.8, yMax: 5.9, aspect: 'fill' },
    shapes: [
      { type: 'text', x: 3, y: 5.2, text: `${a}√${b}`, size: 26, color: C.violet, step: 0 },
      { type: 'text', x: 9, y: 5.2, text: `${c}√${d}`, size: 26, color: C.blue, step: 0 },
      { type: 'segment', points: [[6, 1.9], [6, 5.6]], color: '#c9d0ea', width: 1.2, dash: true, step: 0 },
      ...col(3, a, b, L, C.violet, 1, 2),
      ...col(9, c, d, R, C.blue, 3, 3),
      { type: 'text', x: 6, y: 1.55, text: `${L} ${sign} ${R}，所以 √${L} ${sign} √${R}`, size: 18, color: C.ink, step: 4, show: 'step < 5' },
      { type: 'segment', points: [[1.2, 0.2], [10.8, 0.2]], color: C.ink, width: 2.2, step: 4 },
      ...ticks,
      { type: 'point', x: X(Math.sqrt(L)), y: 0.2, color: C.violet, step: 4 },
      { type: 'text', x: X(Math.sqrt(L)), y: 0.75, text: `√${L}`, size: 15, color: C.violet, step: 4 },
      { type: 'point', x: X(Math.sqrt(R)), y: 0.2, color: C.blue, step: 4 },
      { type: 'text', x: X(Math.sqrt(R)), y: 0.75, text: `√${R}`, size: 15, color: C.blue, step: 4 },
      { type: 'text', x: 6, y: 1.55, text: `結論：${a}√${b} ${sign} ${c}√${d}`, size: 24, color: '#5a3fd6', step: 5 },
    ],
    steps: [
      `比較 ${a}√${b} 與 ${c}√${d}：係數不同，不能直接比`,
      `左邊：係數 ${a} 寫成 √${a * a}，移進根號`,
      `左邊：√${a * a} × √${b} ＝ √${L}`,
      `右邊照做：${c} ＝ √${c * c}，所以 ${c}√${d} ＝ √${R}`,
      `比根號內的數：${L} ${sign} ${R}，數線上也看得到`,
      `結論：${a}√${b} ${sign} ${c}√${d}`,
    ],
    caption: '課本例 2 的方法：係數平方後移進根號，再比根號內的數',
  });
}

/**
 * 根式乘法（課本例 1 的解法，結構化）：係數一欄、根號一欄，最後合起來。
 * p√m × q√n；blank 為 true 時結果留「？」（錯誤分析頁的鷹架，不洩漏答案）。
 */
export function multSteps({ p, m, q, n, blank = false }) {
  const num = (v) => (v < 0 ? `(−${-v})` : String(v)),
    term = (c, r) => `${c === 1 ? '' : c === -1 ? '−' : String(c).replace('-', '−')}√${r}`,
    first = term(p, m),
    second = q < 0 ? `(${term(q, n)})` : term(q, n),
    coef = p * q,
    res = `${String(coef).replace('-', '−')}√${m * n}`;
  return litAtEnd({
    view: { xMin: 0, xMax: 12, yMin: 0, yMax: 5.6, aspect: 'fill' },
    shapes: [
      { type: 'text', x: 6, y: 4.9, text: `${first} × ${second}`, size: 26, color: C.ink, step: 0 },
      { type: 'text', x: 3, y: 3.85, text: '係數 × 係數', size: 15, color: C.teal, step: 1 },
      { type: 'text', x: 3, y: 2.95, text: `${num(p)} × ${num(q)}`, size: 21, color: C.ink, step: 1 },
      { type: 'text', x: 3, y: 2.05, text: `＝ ${blank ? '？' : String(coef).replace('-', '−')}`, size: 22, color: C.teal, step: 1 },
      { type: 'segment', points: [[6, 1.7], [6, 4.1]], color: '#c9d0ea', width: 1.2, dash: true, step: 1 },
      { type: 'text', x: 9, y: 3.85, text: '根號 × 根號', size: 15, color: C.violet, step: 2 },
      { type: 'text', x: 9, y: 2.95, text: `√${m} × √${n}`, size: 21, color: C.ink, step: 2 },
      { type: 'text', x: 9, y: 2.05, text: `＝ ${blank ? '？' : `√${m * n}`}`, size: 22, color: C.violet, step: 2 },
      { type: 'text', x: 6, y: 0.85, text: `${first} × ${second} ＝ ${blank ? '？' : res}`, size: 24, color: '#5a3fd6', step: 3 },
    ],
    steps: [
      `題目：${first} × ${second}`,
      '係數和係數相乘（注意正負號）',
      `根號和根號相乘：根號內相乘（a ≥ 0、b ≥ 0）`,
      blank ? '兩欄的結果合起來，是多少？' : `合起來：${res}`,
    ],
    caption: '課本例 1 的方法：係數乘係數，根號乘根號',
  });
}

/**
 * (a+b)² 的面積模型（靜態，按「下一步」逐塊揭示）：a、b 可以是根式。
 * aLen、bLen 是畫圖用的長度；其餘是標籤文字（純文字寫法，會自動排版）。
 */
export function binomialSteps({ aLen, bLen, aLab, bLab, a2, ab, ab2, b2, total, expr }) {
  const S = aLen + bLen;
  return litAtEnd({
    view: { xMin: -1.4, xMax: S + 7.6, yMin: -0.8, yMax: S + 1.3, aspect: 'equal' },
    shapes: [
      { type: 'rect', x: 0, y: 0, w: S, h: S, color: C.ink, width: 2, step: 0 },
      { type: 'brace', points: [[0, S], [aLen, S]], text: aLab, step: 0 },
      { type: 'brace', points: [[aLen, S], [S, S]], text: bLab, step: 0 },
      { type: 'rect', x: 0, y: bLen, w: aLen, h: aLen, fill: C.fViolet, color: C.violet, step: 1 },
      { type: 'text', x: aLen / 2, y: bLen + aLen / 2, text: a2, size: 17, color: '#5a3fd6', step: 1 },
      { type: 'rect', x: aLen, y: bLen, w: bLen, h: aLen, fill: C.fBlue, color: C.blue, step: 2 },
      { type: 'rect', x: 0, y: 0, w: aLen, h: bLen, fill: C.fBlue, color: C.blue, step: 2 },
      { type: 'text', x: aLen + bLen / 2, y: bLen + aLen / 2, text: ab, size: 16, color: '#1d4fa3', step: 2 },
      { type: 'text', x: aLen / 2, y: bLen / 2, text: ab, size: 16, color: '#1d4fa3', step: 2 },
      { type: 'rect', x: aLen, y: 0, w: bLen, h: bLen, fill: C.fOrange, color: C.orange, step: 3 },
      { type: 'text', x: aLen + bLen / 2, y: bLen / 2, text: b2, size: 17, color: '#b4541a', step: 3 },
      { type: 'text', x: S + 3.8, y: S * 0.78, text: `a² ＝ ${a2}`, size: 17, color: '#5a3fd6', step: 1 },
      { type: 'text', x: S + 3.8, y: S * 0.56, text: `2ab ＝ 2 × ${ab} ＝ ${ab2}`, size: 17, color: '#1d4fa3', step: 2 },
      { type: 'text', x: S + 3.8, y: S * 0.34, text: `b² ＝ ${b2}`, size: 17, color: '#b4541a', step: 3 },
      { type: 'text', x: S + 3.8, y: S * 0.1, text: `${expr} ＝ ${total}`, size: 19, color: C.ink, step: 4 },
    ],
    steps: [
      `邊長 ${aLab} ＋ ${bLab} 的正方形，面積就是 ${expr}`,
      `切成四塊：左上 a² ＝ ${a2}`,
      `兩塊長方形，各是 ab ＝ ${ab}：中間項 2ab 不能漏`,
      `右下 b² ＝ ${b2}`,
      `四塊加起來：${total}`,
    ],
    caption: '和的平方公式 (a＋b)² ＝ a² ＋ 2ab ＋ b²，a、b 可以是根式',
  });
}

/** 逐步解題：每一行在自己的步驟發光，前面的步驟反暗。 */
export function stepsViz(lines, captions, { size = 25 } = {}) {
  const n = lines.length;
  return litAtEnd({
    view: { xMin: 0, xMax: 12, yMin: 0, yMax: n + 0.6, aspect: 'fill' },
    shapes: lines.map((text, i) => ({
      type: 'text', x: 6, y: n - i, text, size: i === 0 ? size + 2 : size, color: i === n - 1 ? '#5a3fd6' : C.ink, step: i,
    })),
    steps: captions,
  });
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

