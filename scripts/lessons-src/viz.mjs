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
    view: { xMin: 0, xMax: 12, yMin: 0.2, yMax: n + 0.9, aspect: 'fill' },
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


/* ───────────── 幾何（九上 1-4 相似三角形的應用） ───────────── */
const stepOf = (o) => ({ ...(o.step !== undefined ? { step: o.step } : {}), ...(o.show ? { show: o.show } : {}), ...(o.focus ? { focus: o.focus } : {}) });
/** 幾何小零件：三角形、線段、文字、直角記號、角弧。座標可以是數字或運算式。 */
export const G = {
  poly: (points, o = {}) => ({ type: 'polygon', points, fill: o.fill ?? C.fBlue, color: o.color ?? C.blue, width: o.width ?? 2, ...stepOf(o) }),
  seg: (a, b, o = {}) => ({ type: 'segment', points: [a, b], color: o.color ?? C.ink, width: o.width ?? 2, ...(o.dash ? { dash: true } : {}), ...stepOf(o) }),
  lab: (x, y, text, o = {}) => ({ type: 'text', x, y, text, size: o.size ?? 15, color: o.color ?? C.ink, ...stepOf(o) }),
  angle: (a, o, b, text, opt = {}) => ({ type: 'angle', points: [a, o, b], ...(text ? { text } : {}), color: opt.color ?? C.red, ...stepOf(opt) }),
  /** 直角記號：c 是直角頂點，u、v 是兩邊方向的單位向量（數字）。 */
  right: (c, u, v, s = 0.4, o = {}) => [
    { type: 'segment', points: [[c[0] + u[0] * s, c[1] + u[1] * s], [c[0] + u[0] * s + v[0] * s, c[1] + u[1] * s + v[1] * s]], color: o.color ?? C.ink, width: 1.4, ...stepOf(o) },
    { type: 'segment', points: [[c[0] + v[0] * s, c[1] + v[1] * s], [c[0] + u[0] * s + v[0] * s, c[1] + u[1] * s + v[1] * s]], color: o.color ?? C.ink, width: 1.4, ...stepOf(o) },
  ],
};

/**
 * 圖＋算式的逐步解題（課本例題的解法）：左邊是圖，右邊是一行一行的算式。
 * figure：圖形（可帶 step 讓某些標記在某一步才出現）；沒有 step 的圖形每一步都清楚顯示。
 * lines：字串或 { text, step, size, color }；預設第 i 行在第 i 步出現。最後一步全部點亮。
 */
export function figSteps({ view, figure, lines, captions, x = 14.5, top, gap = 1.25, size = 19, caption }) {
  const all = captions.map((_, i) => i);
  const fig = figure.flat().map((s) => (s.step === undefined && !s.focus ? { ...s, focus: all } : s));
  const text = lines.map((l, i) => {
    const o = typeof l === 'string' ? { text: l } : l;
    return { type: 'text', x, y: top - i * gap, text: o.text, size: o.size ?? size, color: o.color ?? (i === lines.length - 1 ? '#5a3fd6' : C.ink), step: o.step ?? i };
  });
  return litAtEnd({ view, shapes: [...fig, ...text], steps: captions, ...(caption ? { caption } : {}) });
}

/** 同一時刻的影子（具體操作）：拖拉太陽高度角，人和樹的「高÷影長」永遠一樣。 */
export function shadowExplore({ h = 1.6, H = 4, ang = 40 } = {}) {
  const sp = `${h}/tan(ang)`, st = 'H/tan(ang)';
  return {
    view: { xMin: -0.5, xMax: 17.5, yMin: -1.6, yMax: 6.2, aspect: 'equal' },
    params: [
      { id: 'ang', label: '太陽高度角', min: 20, max: 70, step: 1, value: ang, unit: '°' },
      { id: 'H', label: '樹高（公尺）', min: 2, max: 5, step: 0.5, value: H },
    ],
    shapes: [
      G.seg([-0.5, 0], [17.5, 0], { color: '#6b7394' }),
      // 人：A 在頭頂、C 在腳，影子 C→B
      G.seg([1, 0], [1, h], { color: C.violet, width: 5 }),
      G.lab(1.9, h / 2, `${h} 公尺`, { size: 12, color: C.violet }),
      G.lab(0.55, h + 0.35, '人', { size: 14, color: C.violet }),
      G.seg([1, h], [`1+${sp}`, 0], { color: C.orange, dash: true }),
      G.seg([1, 0], [`1+${sp}`, 0], { color: C.orange, width: 4 }),
      // 樹：D 在頂、F 在底，影子 F→E
      G.seg([8, 0], [8, 'H'], { color: C.teal, width: 6 }),
      G.lab(7.5, 'H+0.4', '樹', { size: 14, color: C.teal }),
      G.seg([8, 'H'], [`8+${st}`, 0], { color: C.orange, dash: true }),
      G.seg([8, 0], [`8+${st}`, 0], { color: C.orange, width: 4 }),
      G.lab(`1+${sp}/2`, -0.6, `影長 {round(${h}/tan(ang),2)}`, { size: 13, color: '#b4541a' }),
      G.lab(`8+${st}/2`, -0.6, '樹影 {round(H/tan(ang),2)}', { size: 13, color: '#b4541a' }),
    ],
    readouts: [
      { label: '人：身高 ÷ 影長', expr: 'tan(ang)', digits: 3 },
      { label: '樹：樹高 ÷ 樹影', expr: 'H/(H/tan(ang))', digits: 3 },
      { label: '樹影（公尺）', expr: 'H/tan(ang)', digits: 2 },
    ],
    caption: '陽光是平行光：同一時刻，人和樹的「高 ÷ 影長」相同（兩個直角三角形相似）',
  };
}

/** 相似比 1：k 的三角形可以切成 k² 個原來的小三角形（具體操作：面積比＝邊長比的平方）。 */
export function triangleTiles({ k = 2 } = {}) {
  const shapes = [];
  const A = [0, 0], B = [8, 0], T = [3, 6.4]; // 大三角形（k 一變，小三角形邊長是 1/k）
  const at = (i, j) => [`${(B[0] - A[0])}*${i}/k + ${(T[0] - A[0])}*${j}/k`, `${T[1]}*${j}/k`];
  for (let j = 0; j < 4; j++)
    for (let i = 0; i + j < 4; i++) {
      // 朝上的小三角形
      shapes.push({ type: 'polygon', points: [at(i, j), at(i + 1, j), at(i, j + 1)], fill: i === 0 && j === 0 ? C.fOrange : C.fBlue, color: i === 0 && j === 0 ? C.orange : C.blue, width: 1.5, show: `${i + j}<k` });
      // 朝下的小三角形
      if (i + j + 1 < 4) shapes.push({ type: 'polygon', points: [at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)], fill: C.fViolet, color: C.violet, width: 1.5, show: `${i + j + 1}<k` });
    }
  shapes.push(
    { type: 'polygon', points: [A, B, T], fill: 'rgba(0,0,0,0)', color: C.ink, width: 2.6 },
    G.lab(10.6, 5.6, '大三角形邊長是小三角形的 {k} 倍', { size: 15 }),
    G.lab(10.6, 4.4, '可以切成 {k*k} 個小三角形', { size: 17, color: '#5a3fd6' }),
  );
  return {
    view: { xMin: -0.6, xMax: 15.6, yMin: -0.6, yMax: 7.2, aspect: 'equal' },
    params: [{ id: 'k', label: '相似比 1 : k 的 k', min: 1, max: 4, step: 1, value: k }],
    shapes,
    readouts: [
      { label: '邊長比 1 : k', expr: 'k' },
      { label: '面積比 1 : k²', expr: 'k^2' },
    ],
    caption: '橘色是原來的小三角形；邊長變 k 倍，面積變 k² 倍',
  };
}

/** 坡度固定的相似直角三角形（具體操作）：拉長坡道，三組邊長的比值都不變。 */
export function rampExplore({ ang = 25, s = 2 } = {}) {
  const b = 's*4*cos(ang)', a = 's*4*sin(ang)';
  return {
    view: { xMin: -0.6, xMax: 17, yMin: -1.2, yMax: 8.6, aspect: 'equal' },
    params: [
      { id: 's', label: '坡道長度（倍）', min: 1, max: 3.6, step: 0.1, value: s },
      { id: 'ang', label: '∠A（坡度角）', min: 10, max: 40, step: 1, value: ang, unit: '°' },
    ],
    shapes: [
      { type: 'polygon', points: [[0, 0], [b, 0], [b, a]], fill: C.fTeal, color: C.teal, width: 2 },
      { type: 'polygon', points: [[0, 0], ['4*cos(ang)', 0], ['4*cos(ang)', '4*sin(ang)']], fill: 'rgba(0,0,0,0)', color: C.violet, width: 2, dash: true },
      { type: 'angle', points: [[1, 0], [0, 0], [b, a]], text: '{ang}°' },
      G.lab(-0.3, -0.5, 'A', { size: 14 }),
      G.lab(b, -0.5, 'C', { size: 14 }),
      G.lab(`${b}+0.3`, `${a}+0.3`, 'B', { size: 14 }),
      G.lab(`${b}+0.9`, `${a}/2`, '對邊 a', { size: 13, color: C.red }),
      G.lab(`${b}/2`, -0.6, '鄰邊 b', { size: 13, color: C.blue }),
      G.lab(`${b}/2-0.6`, `${a}/2+0.6`, '斜邊 c', { size: 13, color: '#16824f' }),
    ],
    readouts: [
      { label: 'a ÷ c（對邊÷斜邊）', expr: 'sin(ang)', digits: 4 },
      { label: 'b ÷ c（鄰邊÷斜邊）', expr: 'cos(ang)', digits: 4 },
      { label: 'a ÷ b（對邊÷鄰邊）', expr: 'tan(ang)', digits: 4 },
    ],
    caption: '角度固定時，坡道拉長或縮短（相似），三個比值都不變；角度一改，比值才跟著改',
  };
}

/* ───────────── 因式分解（八上 3-1） ───────────── */
/** 代數磚：1 張 x²、(p+q) 張 x、pq 張 1 拼成長方形，長和寬就是兩個因式（拖拉 p、q）。 */
export function algebraTiles({ p = 1, q = 1, xLen = 3.5, max = 5 } = {}) {
  const shapes = [
    { type: 'rect', x: 0, y: 'q', w: xLen, h: xLen, fill: C.fViolet, color: C.violet, width: 2 },
    { type: 'text', x: xLen / 2, y: `q+${xLen / 2}`, text: '$x^2$', size: 20, color: '#5a3fd6' },
  ];
  for (let i = 0; i < max; i++) {
    shapes.push({ type: 'rect', x: xLen + i, y: 'q', w: 1, h: xLen, fill: C.fBlue, color: C.blue, show: `p>${i}` });
    shapes.push({ type: 'text', x: xLen + i + 0.5, y: `q+${xLen / 2}`, text: '$x$', size: 15, color: '#1d4fa3', show: `p>${i}` });
    shapes.push({ type: 'rect', x: 0, y: i, w: xLen, h: 1, fill: C.fBlue, color: C.blue, show: `q>${i}` });
    shapes.push({ type: 'text', x: xLen / 2, y: i + 0.5, text: '$x$', size: 15, color: '#1d4fa3', show: `q>${i}` });
    for (let j = 0; j < max; j++) shapes.push({ type: 'rect', x: xLen + i, y: j, w: 1, h: 1, fill: C.fOrange, color: C.orange, show: `p>${i} && q>${j}` });
  }
  shapes.push(
    { type: 'brace', points: [[0, `q+${xLen}`], [`${xLen}+p`, `q+${xLen}`]], text: '長 $x+{p}$' },
    { type: 'brace', points: [[0, 0], [0, `q+${xLen}`]] },
    { type: 'text', x: -1.5, y: `(q+${xLen})/2`, text: '寬 $x+{q}$', size: 15, color: C.ink },
  );
  return {
    view: { xMin: -2.8, xMax: xLen + max + 0.6, yMin: -0.6, yMax: xLen + max + 1.4, aspect: 'equal' },
    params: [
      { id: 'p', label: '右邊加幾排（$x+p$ 的 $p$）', min: 1, max, step: 1, value: p },
      { id: 'q', label: '下面加幾排（$x+q$ 的 $q$）', min: 1, max, step: 1, value: q },
    ],
    shapes,
    readouts: [
      { label: '$x$ 磚（藍）幾張', expr: 'p+q' },
      { label: '$1$ 磚（橘）幾張', expr: 'p*q' },
    ],
    caption: '總面積 ＝ 長 × 寬：磚數決定多項式，長和寬就是它的兩個因式',
  };
}

/**
 * 提公因式的面積模型：兩塊高相同的長方形靠攏（拖拉 t），共同的高就是公因式。
 * hLen、w1Len、w2Len 是畫圖長度；其餘是標籤（LaTeX 字串）。
 */
export function mergeArea({ hLen, w1Len, w2Len, hLab, w1Lab, w2Lab, a1Lab, a2Lab, whole, expr, gap = 2.4, caption }) {
  const W = w1Len + w2Len + gap,
    x2 = `${w1Len}+(1-t)*${gap}`;
  return {
    view: { xMin: -2.4, xMax: W + 2.4, yMin: -1.4, yMax: hLen + 2.8, aspect: 'equal' },
    params: [{ id: 't', label: '把兩塊靠在一起', min: 0, max: 1, step: 0.25, value: 0 }],
    shapes: [
      { type: 'rect', x: 0, y: 0, w: w1Len, h: hLen, fill: C.fViolet, color: C.violet, width: 2 },
      { type: 'rect', x: x2, y: 0, w: w2Len, h: hLen, fill: C.fBlue, color: C.blue, width: 2 },
      { type: 'text', x: w1Len / 2, y: hLen / 2, text: a1Lab, size: 17, color: '#5a3fd6' },
      { type: 'text', x: `${x2}+${w2Len / 2}`, y: hLen / 2, text: a2Lab, size: 17, color: '#1d4fa3' },
      { type: 'brace', points: [[0, 0], [0, hLen]] },
      { type: 'text', x: -1.25, y: hLen / 2, text: hLab, size: 15, color: C.ink },
      { type: 'brace', points: [[`${x2}+${w2Len}`, hLen], [`${x2}+${w2Len}`, 0]], show: 't<1' },
      { type: 'text', x: `${x2}+${w2Len}+1.25`, y: hLen / 2, text: hLab, size: 15, color: C.ink, show: 't<1' },
      { type: 'brace', points: [[0, hLen], [w1Len, hLen]], text: w1Lab },
      { type: 'brace', points: [[x2, hLen], [`${x2}+${w2Len}`, hLen]], text: w2Lab },
      { type: 'text', x: W / 2, y: hLen + 2.1, text: expr, size: 20, color: C.ink, show: 't<1' },
      { type: 'text', x: W / 2, y: hLen + 2.1, text: whole, size: 22, color: '#5a3fd6', show: 't==1' },
      { type: 'text', x: (w1Len + w2Len) / 2, y: -0.8, text: '兩塊的高一樣，高就是公因式', size: 15, color: C.teal, show: 't==1' },
    ],
    caption: caption ?? '$A\\times C+B\\times C=C\\times(A+B)$：高相同的兩塊可以併成一塊',
  };
}

/** 平方差：a² 切掉角落 b²，剩下的 L 形切一塊轉 90° 搬到右邊（拖拉 t），變成 (a＋b)(a−b) 的長方形。每個 t 都是剛體運動，面積不變。 */
export function diffSquareCut({ a = 5, b = 2 } = {}) {
  const lerp = (u, v) => `(${u})+t*((${v})-(${u}))`,
    cx = lerp('(a-b)/2', 'a+b/2'),
    cy = lerp('a-b/2', '(a-b)/2'),
    corner = (sx, sy) => [`${cx}+(${sx})*(a-b)/2*cos(90*t)+(${sy})*b/2*sin(90*t)`, `${cy}-(${sx})*(a-b)/2*sin(90*t)+(${sy})*b/2*cos(90*t)`];
  return {
    view: { xMin: -1.4, xMax: 10.4, yMin: -1.4, yMax: 8, aspect: 'equal' },
    params: [
      { id: 'a', label: '大正方形邊長 $a$', min: 4, max: 6, step: 1, value: a },
      { id: 'b', label: '切掉的小正方形邊長 $b$', min: 1, max: 3, step: 1, value: b },
      { id: 't', label: '把上面那一塊轉 90° 搬到右邊', min: 0, max: 1, step: 0.25, value: 0 },
    ],
    shapes: [
      { type: 'rect', x: 'a-b', y: 'a-b', w: 'b', h: 'b', color: C.red, width: 1.6, dash: true, show: 't==0' },
      { type: 'text', x: 'a-b/2', y: 'a-b/2', text: '$b^2$', size: 15, color: C.red, show: 't==0' },
      { type: 'rect', x: 0, y: 0, w: 'a', h: 'a-b', fill: C.fViolet, color: C.violet, width: 2 },
      { type: 'polygon', points: [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], fill: C.fBlue, color: C.blue, width: 2 },
      { type: 'brace', points: [[0, 0], [0, 'a']], text: '$a$', show: 't==0' },
      { type: 'brace', points: [[0, 'a'], ['a', 'a']], text: '$a$', show: 't==0' },
      { type: 'brace', points: [[0, 'a-b'], ['a+b', 'a-b']], text: '長 $a+b={a+b}$', show: 't==1' },
      { type: 'brace', points: [['a+b', 'a-b'], ['a+b', 0]], text: '寬 $a-b={a-b}$', show: 't==1' },
      { type: 'text', x: 5, y: 7.3, text: '面積 $a^2-b^2={a^2-b^2}$', size: 18, color: C.ink, show: 't<1' },
      { type: 'text', x: 5, y: 7.3, text: '$a^2-b^2=(a+b)(a-b)={a+b}\\times{a-b}$', size: 18, color: '#5a3fd6', show: 't==1' },
    ],
    readouts: [
      { label: '$a^2-b^2$', expr: 'a^2-b^2' },
      { label: '$(a+b)(a-b)$', expr: '(a+b)*(a-b)' },
    ],
    caption: '藍色塊只有搬動和旋轉，大小形狀不變，所以總面積一直是 $a^2-b^2$：兩個平方的差可以寫成兩個因式的積',
  };
}

/** 差的平方的面積模型（靜態，按「下一步」）：a² 去掉兩條 ab，多扣的 b² 要加回來。 */
export function diffSquareSteps({ aLen = 6, bLen = 2, aLab = '$a$', bLab = '$b$', caption } = {}) {
  const r = aLen - bLen;
  return litAtEnd({
    view: { xMin: -1.4, xMax: aLen + 7, yMin: -0.8, yMax: aLen + 1.3, aspect: 'equal' },
    shapes: [
      { type: 'rect', x: 0, y: 0, w: aLen, h: aLen, fill: 'rgba(123,97,255,.1)', color: C.violet, width: 2, step: 0 },
      { type: 'brace', points: [[0, aLen], [aLen, aLen]], text: aLab, step: 0 },
      { type: 'rect', x: r, y: 0, w: bLen, h: aLen, fill: C.fBlue, color: C.blue, step: 1 },
      { type: 'rect', x: 0, y: 0, w: aLen, h: bLen, fill: C.fBlue, color: C.blue, step: 2 },
      { type: 'rect', x: r, y: 0, w: bLen, h: bLen, fill: C.fOrange, color: C.orange, width: 2, step: 3 },
      { type: 'text', x: r + bLen / 2, y: bLen / 2, text: '$b^2$', size: 15, color: '#b4541a', step: 3 },
      { type: 'brace', points: [[aLen, bLen], [aLen, 0]], text: bLab, step: 1 },
      { type: 'rect', x: 0, y: bLen, w: r, h: r, fill: C.fViolet, color: C.violet, width: 2.6, step: 4 },
      { type: 'text', x: r / 2, y: bLen + r / 2, text: '$(a-b)^2$', size: 18, color: '#5a3fd6', step: 4 },
      { type: 'text', x: aLen + 3.7, y: aLen * 0.84, text: '$a^2$', size: 20, color: '#5a3fd6', step: 0 },
      { type: 'text', x: aLen + 3.7, y: aLen * 0.66, text: '$-ab$', size: 20, color: '#1d4fa3', step: 1 },
      { type: 'text', x: aLen + 3.7, y: aLen * 0.48, text: '$-ab$', size: 20, color: '#1d4fa3', step: 2 },
      { type: 'text', x: aLen + 3.7, y: aLen * 0.3, text: '$+b^2$', size: 20, color: '#b4541a', step: 3 },
      { type: 'text', x: aLen + 3.7, y: aLen * 0.1, text: '$a^2-2ab+b^2=(a-b)^2$', size: 18, color: C.ink, step: 4 },
    ],
    steps: ['邊長 a 的正方形，面積 a²', '右邊切掉一條 ab', '下面再切掉一條 ab', '角落的 b² 被扣了兩次，要加回來一次', '剩下的就是邊長 a − b 的正方形'],
    ...(caption ? { caption } : {}),
  });
}

/** 多項式的一項：係數、次數 → LaTeX；first 表示式子第一項（正號不寫）。 */
function polyTerm(c, deg, v, first) {
  const sign = c < 0 ? '-' : first ? '' : '+',
    abs = Math.abs(c),
    body = deg === 0 ? String(abs) : `${abs === 1 ? '' : abs}${v}${deg === 2 ? '^2' : ''}`;
  return `${sign}${body}`;
}
/**
 * 直式除法：(a2 v² + a1 v + a0) ÷ (d1 v + d0)，商與餘式由數字算出來（不會打錯）；一步一步揭示。
 * after：結論文字（最多兩行）。steps 依序是列式、第一次商、第二次商、看餘式、結論。
 */
export function longDivSteps({ a, d, v = 'x', after = [], caption, conclusion = '看餘式是不是 0' }) {
  const [a2, a1, a0] = a,
    [d1, d0] = d,
    q1 = a2 / d1,
    r1 = a1 - q1 * d0,
    q0 = r1 / d1,
    rem = a0 - q0 * d0;
  const COL = [5.2, 7.2, 9.2];
  const line = (cells, y, step, color = C.ink, size = 19) =>
    cells.map((c, i) => (c === null ? null : { type: 'text', x: COL[i], y, text: `$${c}$`, size, color, step })).filter(Boolean);
  const rule = (x0, x1, y, step) => ({ type: 'segment', points: [[x0, y], [x1, y]], color: C.ink, width: 1.6, step });
  const dtex = `${polyTerm(d1, 1, v, true)}${polyTerm(d0, 0, v, false)}`;
  const shapes = [
    { type: 'text', x: 2.4, y: 6.5, text: `$${dtex}$`, size: 19, color: C.blue, step: 0 },
    { type: 'segment', points: [[4, 7.1], [4, 5.95]], color: C.ink, width: 1.8, step: 0 },
    rule(4, 10.4, 7.1, 0),
    ...line([polyTerm(a2, 2, v, true), polyTerm(a1, 1, v, false), polyTerm(a0, 0, v, false)], 6.5, 0),
    ...line([null, polyTerm(q1, 1, v, true), null], 7.6, 1, '#5a3fd6'),
    ...line([polyTerm(q1 * d1, 2, v, true), polyTerm(q1 * d0, 1, v, false), null], 5.5, 1, C.teal),
    rule(4.2, 10.4, 5.0, 1),
    ...line([null, polyTerm(r1, 1, v, true), polyTerm(a0, 0, v, false)], 4.4, 1),
    ...line([null, null, polyTerm(q0, 0, v, false)], 7.6, 2, '#5a3fd6'),
    ...line([null, polyTerm(q0 * d1, 1, v, true), polyTerm(q0 * d0, 0, v, false)], 3.4, 2, C.teal),
    rule(6.2, 10.4, 2.9, 2),
    ...line([null, null, String(rem)], 2.3, 3, rem === 0 ? '#16824f' : C.red, 22),
    { type: 'text', x: 11.8, y: 2.3, text: `餘式 ${String(rem).replace('-', '−')}`, size: 15, color: rem === 0 ? '#16824f' : C.red, step: 3 },
    ...after.map((text, i) => ({ type: 'text', x: 7.5, y: 1.2 - i * 0.85, text, size: 17, color: '#5a3fd6', step: 4 })),
  ];
  return litAtEnd({
    view: { xMin: 0.4, xMax: 14.6, yMin: after.length > 1 ? -0.3 : 0.5, yMax: 8.2, aspect: 'fill' },
    shapes,
    steps: ['寫成直式（缺項補 0）', `第一次商 ${polyTerm(q1, 1, v, true).replace('-', '−')}，乘回去再相減`, `第二次商 ${polyTerm(q0, 0, v, true).replace('-', '−')}，乘回去再相減`, conclusion, '結論'],
    ...(caption ? { caption } : {}),
  });
}

/**
 * 幾小題並排的逐步解題（課本的左右欄）：columns 每欄 { lines }，一行一步，整體依序揭示。
 * captions 的數量要等於總行數；最後一步全部點亮。
 */
export function columnsSteps({ columns, captions, size = 19, caption }) {
  const n = columns.length,
    rows = Math.max(...columns.map((c) => c.lines.length)),
    all = captions.map((_, k) => k),
    shapes = [];
  let step = 0;
  columns.forEach((col, i) => {
    const x = (12 / n) * (i + 0.5);
    col.lines.forEach((text, r) => {
      shapes.push({ type: 'text', x, y: rows - r, text, size: r === 0 ? size + 1 : size, color: r === col.lines.length - 1 ? '#5a3fd6' : C.ink, step });
      step++;
    });
    if (i < n - 1) shapes.push({ type: 'segment', points: [[(12 / n) * (i + 1), 0.4], [(12 / n) * (i + 1), rows + 0.5]], color: '#c9d0ea', width: 1.2, dash: true, focus: all });
  });
  if (step !== captions.length) throw new Error(`columnsSteps：${step} 行算式配 ${captions.length} 句說明`);
  return litAtEnd({
    view: { xMin: 0, xMax: 12, yMin: 0.2, yMax: rows + 0.9, aspect: 'fill' },
    shapes,
    steps: captions,
    ...(caption ? { caption } : {}),
  });
}

/* ───────────── 十字交乘（八上 3-2） ───────────── */
const CIRC = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];
/** mx 的 LaTeX：1 → x、−1 → −x、0 → 0。 */
export const mx = (m, v = 'x') => (m === 0 ? '0' : m === 1 ? v : m === -1 ? `-${v}` : `${m}${v}`);
/** 十字右欄的數：+3、−2。 */
export const signed = (v) => (v < 0 ? `-${-v}` : `+${v}`);
/** ax²＋bx＋c 的 LaTeX（a、b、c 是整數）。 */
export function quadTex(a, b, c, v = 'x') {
  const t = [mx(a, `${v}^2`)];
  if (b) t.push(b < 0 ? `-${mx(-b, v)}` : `+${mx(b, v)}`);
  if (c) t.push(signed(c));
  return t.join('');
}
/** 交叉相乘的和：u x ＋ w x ＝ (u＋w) x（第二項是負的加括號，同課本例 2、例 3）。 */
export const crossSumTex = (u, w) => `${mx(u)}+${w < 0 ? `(${mx(w)})` : mx(w)}=${mx(u + w)}`;

/** 一個靜態的十字：左欄 m x、n x，右欄 p、q；左上×右下＝m·q（紫線），左下×右上＝n·p（橘線）。 */
function crossAt({ m, n, p, q, b, cx, cy, size = 19, dx = 1.3, dy = 0.62, mask = false, note = '', extra = {} }) {
  const L = cx - dx,
    R = cx + dx;
  return [
    { type: 'text', x: L, y: cy + dy, text: `$${mx(m)}$`, size, color: C.ink, ...extra },
    { type: 'text', x: L, y: cy - dy, text: `$${mx(n)}$`, size, color: C.ink, ...extra },
    { type: 'text', x: R, y: cy + dy, text: `$${signed(p)}$`, size, color: C.ink, ...extra },
    { type: 'text', x: R, y: cy - dy, text: mask ? '$?$' : `$${signed(q)}$`, size, color: mask ? C.red : C.ink, ...extra },
    { type: 'segment', points: [[L + 0.5, cy + dy - 0.15], [R - 0.55, cy - dy + 0.15]], color: C.violet, width: 2.2, ...extra },
    { type: 'segment', points: [[L + 0.5, cy - dy + 0.15], [R - 0.55, cy + dy - 0.15]], color: C.orange, width: 2.2, ...extra },
    { type: 'segment', points: [[L - 0.75, cy - dy - 0.42], [R + 0.85, cy - dy - 0.42]], color: '#6b7394', width: 1.3, ...extra },
    {
      type: 'text',
      x: cx + 0.05,
      y: cy - dy - 0.95,
      text: mask ? `$${mx(n * p)}+${mx(m)}\\cdot(?)=${mx(b)}$` : `$${crossSumTex(n * p, m * q)}$${note}`,
      size: size - 3,
      color: mask ? C.red : '#5a3fd6',
      ...extra,
    },
  ];
}

/**
 * 十字交乘的嘗試（課本例 1～例 5 的 ①②③…）：按「下一步」一組一組試，目前那一組發光，
 * 合的那一組框起來；最後一步寫結論。trials：[{ m, n, p, q, mask? }]（mask：右下留「?」，半完成範例用）。
 */
export function crossSteps({ a = 1, b, c, trials, cols, conclusion, captions, caption, size, header, pre }) {
  // pre：第 0 步只顯示題目（header），十字從第 1 步才出現（學生端在老師公布前只看得到第 0 步，十字本身就是答案時用）
  const off = pre ? 1 : 0;
  const n = trials.length,
    k = cols ?? (n <= 2 ? n : n <= 4 ? 2 : 3),
    rows = Math.ceil(n / k),
    cw = 12 / k,
    ch = 3.05,
    top = rows * ch + 1.3 + (header ? 0.9 : 0),
    last = n + off,
    shapes = [],
    auto = [];
  // header：十字上方的一行（例如先提公因數），從第 0 步就顯示，每一步都亮著
  if (header) shapes.push({ type: 'text', x: 6, y: top - 0.45, text: header, size: 20, color: C.ink, focus: Array.from({ length: n + 1 + off }, (_, i) => i) });
  trials.forEach((t, i) => {
    if (t.m * t.n !== a || t.p * t.q !== c) throw new Error(`crossSteps：第 ${i + 1} 組的左欄或右欄乘起來不對 ${JSON.stringify(t)}`);
    const ok = t.m * t.q + t.n * t.p === b,
      cx = cw * ((i % k) + 0.5) + 0.25,
      cy = top - (header ? 0.9 : 0) - Math.floor(i / k) * ch - 1.25,
      focus = ok ? [i + off, last] : [i + off],
      // 半完成範例留空的那一組從第 0 步就顯示（學生端在老師公布前只看得到第 0 步）
      extra = t.mask ? { focus: Array.from({ length: n + 1 + off }, (_, j) => j) } : { step: i + off, focus };
    if (n > 1) shapes.push({ type: 'text', x: cx - cw * 0.45, y: cy + 0.95, text: CIRC[i], size: 15, color: '#6b7394', ...extra });
    shapes.push(...crossAt({ ...t, b, cx, cy, size: size ?? (k === 3 ? 17 : 19), dx: k === 3 ? 1.05 : 1.3, mask: t.mask, note: t.mask || n === 1 ? '' : ok ? '（合）' : '（不合）', extra }));
    if (ok && !t.mask && n > 1) shapes.push({ type: 'rect', x: cx - cw * 0.46, y: cy - 1.95, w: cw * 0.9, h: 3.0, color: C.red, width: 2, ...extra });
    auto.push(
      t.mask
        ? `右下的數是多少，交叉相乘的和才會是 ${mx(b).replace('-', '−')}？`
        : `${n > 1 ? CIRC[i] + ' ' : ''}交叉相乘：${crossSumTex(t.n * t.p, t.m * t.q).replace(/-/g, '−')}，${ok ? '合' : '不合'}`,
    );
  });
  shapes.push({ type: 'text', x: 6, y: 0.55, text: conclusion, size: 20, color: '#5a3fd6', step: last, focus: [last] });
  const steps = captions ?? [...(pre ? [pre] : []), ...auto, '合的那一組：左右兩欄各自橫著讀，就是兩個因式'];
  if (steps.length !== n + 1 + off) throw new Error(`crossSteps：${n} 組嘗試要配 ${n + 1 + off} 句說明`);
  return { view: { xMin: 0, xMax: 12, yMin: 0, yMax: top + 0.2, aspect: 'fill' }, shapes, steps, ...(caption ? { caption } : {}) };
}

/**
 * 可操作的十字圖：拖拉右欄的 p、q（二次項係數不為 1 時再選左欄的拆法 k），交叉相乘的和即時算出，
 * 和一次項相符時顯示「合」。lefts：x² 項的拆法 [[m, n], …]（省略＝二次項係數為 1，左欄固定 x、x）。
 */
export function crossPlay({ a = 1, b, c, lefts, k = 0, p = 1, q = 1, range = 9, caption }) {
  const multi = !!lefts,
    pick = (j) => lefts.slice(0, -1).reduceRight((acc, pair, i) => `(k==${i}?${pair[j]}:${acc})`, String(lefts.at(-1)[j])),
    M = multi ? pick(0) : '1',
    N = multi ? pick(1) : '1',
    s1 = multi ? `${N}*p` : 'p',
    s2 = multi ? `${M}*q` : 'q',
    sum = `${s1}+${s2}`,
    L = 3.3,
    R = 6.5,
    T = 4.75,
    B = 3.15;
  if (multi && !lefts.every(([m, n]) => m * n === a)) throw new Error('crossPlay：左欄的拆法乘起來要等於二次項係數');
  const shapes = [{ type: 'text', x: 6, y: 6.4, text: `要分解：$${quadTex(a, b, c)}$`, size: 20, color: C.ink }];
  if (multi)
    lefts.forEach(([m, n], i) =>
      shapes.push(
        { type: 'text', x: L, y: T, text: `$${mx(m)}$`, size: 22, color: C.ink, show: `k==${i}` },
        { type: 'text', x: L, y: B, text: `$${mx(n)}$`, size: 22, color: C.ink, show: `k==${i}` },
      ),
    );
  else shapes.push({ type: 'text', x: L, y: T, text: '$x$', size: 22, color: C.ink }, { type: 'text', x: L, y: B, text: '$x$', size: 22, color: C.ink });
  for (const [id, y] of [['p', T], ['q', B]])
    shapes.push(
      { type: 'text', x: R, y, text: '$+{' + id + '}$', size: 22, color: C.ink, show: `${id}>=0` },
      { type: 'text', x: R, y, text: '${' + id + '}$', size: 22, color: C.ink, show: `${id}<0` },
    );
  shapes.push(
    { type: 'segment', points: [[L + 0.55, T - 0.18], [R - 0.6, B + 0.18]], color: C.violet, width: 2.6 },
    { type: 'segment', points: [[L + 0.55, B + 0.18], [R - 0.6, T - 0.18]], color: C.orange, width: 2.6 },
    { type: 'text', x: 1.0, y: (T + B) / 2, text: multi ? `$${mx(a, 'x^2')}$` : '$x\\cdot x=x^2$', size: 17, color: '#5a3fd6' },
    { type: 'segment', points: [[1.7, 2.45], [8.3, 2.45]], color: '#6b7394', width: 1.4 },
  );
  const par = (id, plain) => (plain ? '{' + id + '}' : '({' + id + '})');
  for (const [cp, cq] of [[true, true], [true, false], [false, true], [false, false]])
    shapes.push({
      type: 'text',
      x: 9.3,
      y: (T + B) / 2,
      text: '$' + par('p', cp) + '\\times ' + par('q', cq) + '={p*q}$',
      size: 17,
      color: C.teal,
      show: `${cp ? 'p>=0' : 'p<0'} && ${cq ? 'q>=0' : 'q<0'}`,
    });
  const head = '$\\textcolor{#ff8a3d}{{' + s1 + '}x}+';
  shapes.push(
    { type: 'text', x: 4.9, y: 1.75, text: head + '\\textcolor{#7b61ff}{{' + s2 + '}x}={' + sum + '}x$', size: 20, color: C.ink, show: `${s2}>=0` },
    { type: 'text', x: 4.9, y: 1.75, text: head + '(\\textcolor{#7b61ff}{{' + s2 + '}x})={' + sum + '}x$', size: 20, color: C.ink, show: `${s2}<0` },
    { type: 'text', x: 9.8, y: 1.75, text: `目標 $${mx(b)}$`, size: 16, color: '#6b7394' },
    { type: 'text', x: 6, y: 0.65, text: '合！左右兩欄橫著讀，就是兩個因式', size: 17, color: '#16824f', show: `p*q==${c} && ${sum}==${b}` },
    { type: 'text', x: 6, y: 0.65, text: `右欄兩數相乘，要等於常數項 ${String(c).replace('-', '−')}`, size: 16, color: C.red, show: `p*q!=${c}` },
    { type: 'text', x: 6, y: 0.65, text: '常數項對了，交叉相乘的和還不是一次項：換一組', size: 16, color: C.orange, show: `p*q==${c} && ${sum}!=${b}` },
  );
  return {
    view: { xMin: 0, xMax: 12, yMin: 0.1, yMax: 7, aspect: 'fill' },
    params: [
      ...(multi ? [{ id: 'k', label: '左欄：x² 項的第幾種拆法', min: 0, max: lefts.length - 1, step: 1, value: k }] : []),
      { id: 'p', label: '右上的數', min: -range, max: range, step: 1, value: p },
      { id: 'q', label: '右下的數', min: -range, max: range, step: 1, value: q },
    ],
    shapes,
    readouts: [
      { label: '右欄相乘', expr: 'p*q' },
      { label: '交叉相乘的和（$x$ 的係數）', expr: sum },
    ],
    caption: caption ?? '紫線：左上×右下；橘線：左下×右上。兩個乘積加起來要等於一次項，右欄相乘要等於常數項。',
  };
}

/**
 * 代數磚（二次項係數不為 1）：a 張 x² 排成一列，長是 a·x＋p、寬是 x＋q；
 * x 磚 a·q＋p 張、1 磚 p·q 張。拖拉 a、p、q 拼出指定的多項式（每個設定都是完整的長方形，沒有中間狀態）。
 */
export function algebraTilesAx({ a = 1, p = 1, q = 1, xLen = 2.4, maxA = 3, max = 5 } = {}) {
  const shapes = [];
  for (let k = 0; k < maxA; k++) {
    shapes.push(
      { type: 'rect', x: k * xLen, y: 'q', w: xLen, h: xLen, fill: C.fViolet, color: C.violet, width: 2, show: `a>${k}` },
      { type: 'text', x: k * xLen + xLen / 2, y: `q+${xLen / 2}`, text: '$x^2$', size: 18, color: '#5a3fd6', show: `a>${k}` },
    );
    for (let i = 0; i < max; i++)
      shapes.push(
        { type: 'rect', x: k * xLen, y: i, w: xLen, h: 1, fill: C.fBlue, color: C.blue, show: `a>${k} && q>${i}` },
        { type: 'text', x: k * xLen + xLen / 2, y: i + 0.5, text: '$x$', size: 14, color: '#1d4fa3', show: `a>${k} && q>${i}` },
      );
  }
  for (let i = 0; i < max; i++) {
    shapes.push(
      { type: 'rect', x: `a*${xLen}+${i}`, y: 'q', w: 1, h: xLen, fill: C.fBlue, color: C.blue, show: `p>${i}` },
      { type: 'text', x: `a*${xLen}+${i + 0.5}`, y: `q+${xLen / 2}`, text: '$x$', size: 14, color: '#1d4fa3', show: `p>${i}` },
    );
    for (let j = 0; j < max; j++) shapes.push({ type: 'rect', x: `a*${xLen}+${i}`, y: j, w: 1, h: 1, fill: C.fOrange, color: C.orange, show: `p>${i} && q>${j}` });
  }
  shapes.push(
    { type: 'brace', points: [[0, `q+${xLen}`], [`a*${xLen}+p`, `q+${xLen}`]], text: '長 $x+{p}$', show: 'a==1' },
    { type: 'brace', points: [[0, `q+${xLen}`], [`a*${xLen}+p`, `q+${xLen}`]], text: '長 ${a}x+{p}$', show: 'a>1' },
    { type: 'brace', points: [[0, 0], [0, `q+${xLen}`]] },
    { type: 'text', x: -1.5, y: `(q+${xLen})/2`, text: '寬 $x+{q}$', size: 15, color: C.ink },
  );
  return {
    view: { xMin: -2.8, xMax: maxA * xLen + max + 0.6, yMin: -0.6, yMax: xLen + max + 1.4, aspect: 'equal' },
    params: [
      { id: 'a', label: '$x^2$ 磚幾張（長的 $x$ 係數）', min: 1, max: maxA, step: 1, value: a },
      { id: 'p', label: '右邊加幾排（長的常數）', min: 1, max, step: 1, value: p },
      { id: 'q', label: '下面加幾排（寬的常數）', min: 1, max, step: 1, value: q },
    ],
    shapes,
    readouts: [
      { label: '$x^2$ 磚（紫）', expr: 'a' },
      { label: '$x$ 磚（藍）', expr: 'a*q+p' },
      { label: '$1$ 磚（橘）', expr: 'p*q' },
    ],
    caption: '總面積 ＝ 長 × 寬：$x$ 磚的張數就是「交叉相乘」的和，$1$ 磚的張數是兩個常數的積',
  };
}
