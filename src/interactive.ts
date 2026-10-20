import type { Interactive, InteractiveShape } from '../shared/types';
import { compile, tryEval, variablesOf, type Vars } from '../shared/expr';
import { escape as esc } from './api';
import { md } from './math';

/** 數字格式：最多 4 位小數、去尾零、負號用 −。 */
export function fmt(v: number, digits?: number): string {
  if (!Number.isFinite(v)) return '—';
  const fixed = digits !== undefined ? v.toFixed(digits) : String(Math.round(v * 1e4) / 1e4);
  const trimmed = digits !== undefined ? String(Number(fixed)) : fixed;
  return trimmed.replace(/^-/, '−');
}
/**
 * 文字樣板：{運算式} 代入即時數值。
 * 在 $…$（LaTeX）裡，只有能解析且變數都已定義的 {…} 才代入，並保留大括號，
 * 所以 $\sqrt{m}$ 會變成 $\sqrt{12}$，而 \text{…}、\frac{1}{2} 這類 LaTeX 不受影響。
 */
export function template(text: string, vars: Vars): string {
  return text
    .split(/(\$[^$]+\$)/g)
    .map((part) => {
      if (!(part.length > 2 && part.startsWith('$') && part.endsWith('$')))
        return part.replace(/\{([^}]+)\}/g, (_, src) => fmt(tryEval(src, vars)));
      return part.replace(/\{([^{}]+)\}/g, (whole, src: string) => {
        try {
          compile(src);
          if (!variablesOf(src).every((v) => v in vars)) return whole;
        } catch {
          return whole;
        }
        const v = tryEval(src, vars);
        return Number.isFinite(v) ? `{${String(+v.toFixed(6))}}` : whole;
      });
    })
    .join('');
}
export interface InteractiveController {
  vars(): Vars;
  destroy(): void;
}
const W = 1000;
const INK = '#1f2a56';

export function initialVars(spec: Interactive): Vars {
  const vars: Vars = {};
  for (const p of spec.params || []) vars[p.id] = p.value;
  for (const p of spec.points || []) {
    vars[`${p.id}x`] = p.x;
    vars[`${p.id}y`] = p.y;
  }
  if (spec.steps?.length) vars.step = 0;
  return vars;
}

/**
 * 依教材 JSON 的 interactive 規格產生可操作的數學圖：
 * 滑桿／開關參數、可拖曳的點、步驟揭示、可點擊切換的圖形與即時讀數。
 */
export function mountInteractive(
  host: HTMLElement,
  spec: Interactive,
  saved: Vars | undefined,
  onChange: (vars: Vars) => void,
): InteractiveController {
  const vars: Vars = { ...initialVars(spec), ...(saved || {}) };
  const v = spec.view;
  const sx = W / (v.xMax - v.xMin);
  const H = v.aspect === 'fill' ? 620 : Math.min(1400, (v.yMax - v.yMin) * sx);
  const sy = H / (v.yMax - v.yMin);
  const X = (x: number) => (x - v.xMin) * sx;
  const Y = (y: number) => H - (y - v.yMin) * sy;
  // k：每個螢幕像素對應的 viewBox 單位。字級、點與標示線依實際顯示大小換算，圖縮小時字不會跟著變小。
  let k = 1;
  let lastStep = -1;
  const glowId = `viz-glow-${Math.random().toString(36).slice(2, 8)}`;
  const font = (n = 18) => n * k;

  host.innerHTML = `<div class="viz" data-testid="interactive"><div class="viz-figure"><svg viewBox="0 0 ${W} ${H.toFixed(1)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(spec.caption || '可操作的數學圖形')}"></svg></div><div class="viz-controls"></div></div>`;
  const svg = host.querySelector('svg')!;
  const controls = host.querySelector<HTMLElement>('.viz-controls')!;

  const ev = (e: string | number | undefined, fallback = NaN) => tryEval(e, vars, fallback);
  const visible = (s: InteractiveShape) =>
    (s.step === undefined || (vars.step ?? 0) >= s.step) &&
    (s.show === undefined || !!tryEval(s.show, vars, 0));
  const pt = (p: [string | number, string | number]) => [X(ev(p[0])), Y(ev(p[1]))] as const;
  const finite = (...n: number[]) => n.every(Number.isFinite);
  const stroke = (s: InteractiveShape, fallback = INK) =>
    `stroke="${esc(s.color || fallback)}" stroke-width="${(s.width || 2) * 1.3}" vector-effect="non-scaling-stroke"${s.dash ? ` stroke-dasharray="${7 * k} ${5 * k}"` : ''}`;

  function grid(): string {
    let out = '';
    const g = v.grid;
    if (g && (v.xMax - v.xMin) / g <= 80 && (v.yMax - v.yMin) / g <= 80) {
      for (let x = Math.ceil(v.xMin / g) * g; x <= v.xMax + 1e-9; x += g)
        out += `<line x1="${X(x)}" y1="0" x2="${X(x)}" y2="${H}" class="viz-grid"/>`;
      for (let y = Math.ceil(v.yMin / g) * g; y <= v.yMax + 1e-9; y += g)
        out += `<line x1="0" y1="${Y(y)}" x2="${W}" y2="${Y(y)}" class="viz-grid"/>`;
    }
    if (v.axes) {
      const ox = Math.min(Math.max(0, v.xMin), v.xMax),
        oy = Math.min(Math.max(0, v.yMin), v.yMax);
      out += `<line x1="0" y1="${Y(oy)}" x2="${W}" y2="${Y(oy)}" class="viz-axis" marker-end="url(#viz-arrow)"/><line x1="${X(ox)}" y1="${H}" x2="${X(ox)}" y2="0" class="viz-axis" marker-end="url(#viz-arrow)"/>`;
      const step = g || 1;
      const every = Math.max(1, Math.ceil(((v.xMax - v.xMin) / step) / 16));
      for (let x = Math.ceil(v.xMin / step) * step, i = 0; x <= v.xMax; x += step, i++)
        if (Math.abs(x) > 1e-9 && i % every === 0)
          out += `<text x="${X(x)}" y="${Y(oy) + 18 * k}" class="viz-tick" font-size="${12 * k}">${fmt(x)}</text>`;
      for (let y = Math.ceil(v.yMin / step) * step, i = 0; y <= v.yMax; y += step, i++)
        if (Math.abs(y) > 1e-9 && i % every === 0)
          out += `<text x="${X(ox) - 8 * k}" y="${Y(y) + 4 * k}" class="viz-tick" font-size="${12 * k}" text-anchor="end">${fmt(y)}</text>`;
      out += `<text x="${W - 6 * k}" y="${Y(oy) - 8 * k}" class="viz-tick" font-size="${14 * k}" text-anchor="end">x</text><text x="${X(ox) + 10 * k}" y="${16 * k}" class="viz-tick" font-size="${14 * k}">y</text>`;
    }
    return out;
  }
  function label(x: number, y: number, size: number, color: string, content: string, anchor: 'middle' | 'start' = 'middle') {
    if (/[$√]/.test(content)) {
      // 靠左對齊的標籤（點旁的文字）把方框往右挪半個寬度。
      return mathLabel(anchor === 'start' ? x + W / 2 - 4 * k : x, y, size, color, content, anchor === 'start' ? ' data-align="start"' : '');
    }
    return `<text x="${x}" y="${y}" class="viz-label" font-size="${font(size)}" fill="${esc(color)}" text-anchor="${anchor}">${esc(content)}</text>`;
  }
  function mathLabel(cx: number, cy: number, size: number, color: string, content: string, extra = '') {
    const h = size * k * 2.4,
      w = W;
    return `<foreignObject x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" class="viz-math"${extra}><div class="viz-math-box" style="font-size:${size * k}px;color:${esc(color)}">${md(content)}</div></foreignObject>`;
  }
  function shape(s: InteractiveShape): string {
    const tog = s.toggle ? ` data-toggle="${esc(s.toggle)}" class="viz-clickable"` : '';
    switch (s.type) {
      case 'function': {
        if (!s.expr) return '';
        const a = s.domain ? ev(s.domain[0], v.xMin) : v.xMin,
          b = s.domain ? ev(s.domain[1], v.xMax) : v.xMax;
        let d = '',
          pen = false;
        for (let i = 0; i <= 240; i++) {
          const x = a + ((b - a) * i) / 240,
            y = tryEval(s.expr, { ...vars, x });
          if (!Number.isFinite(y) || y < v.yMin - (v.yMax - v.yMin) || y > v.yMax + (v.yMax - v.yMin)) {
            pen = false;
            continue;
          }
          d += `${pen ? 'L' : 'M'}${X(x).toFixed(1)} ${Y(y).toFixed(1)}`;
          pen = true;
        }
        return `<path d="${d}" fill="none" ${stroke(s, '#2f80ed')}${tog}/>`;
      }
      case 'segment':
      case 'line': {
        if (!s.points || s.points.length < 2) return '';
        let [x1, y1] = pt(s.points[0]),
          [x2, y2] = pt(s.points[1]);
        if (!finite(x1, y1, x2, y2)) return '';
        if (s.type === 'line') {
          const dx = x2 - x1,
            dy = y2 - y1,
            k = (W + H) * 3 / Math.max(1e-9, Math.hypot(dx, dy));
          [x1, y1, x2, y2] = [x1 - dx * k, y1 - dy * k, x2 + dx * k, y2 + dy * k];
        }
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${stroke(s)} stroke-linecap="round"${tog}/>`;
      }
      case 'polygon': {
        const pts = (s.points || []).map(pt);
        if (pts.length < 3 || !pts.every((p) => finite(...p))) return '';
        return `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="${esc(s.fill || 'none')}" ${stroke(s)} stroke-linejoin="round"${tog}/>`;
      }
      case 'circle': {
        const cx = ev(s.x),
          cy = ev(s.y),
          r = ev(s.r);
        if (!finite(cx, cy, r) || r < 0) return '';
        return `<ellipse cx="${X(cx)}" cy="${Y(cy)}" rx="${r * sx}" ry="${r * sy}" fill="${esc(s.fill || 'none')}" ${stroke(s)}${tog}/>`;
      }
      case 'rect': {
        let x = ev(s.x),
          y = ev(s.y),
          w = ev(s.w),
          h = ev(s.h);
        if (!finite(x, y, w, h)) return '';
        if (w < 0) [x, w] = [x + w, -w];
        if (h < 0) [y, h] = [y + h, -h];
        return `<rect x="${X(x)}" y="${Y(y + h)}" width="${w * sx}" height="${h * sy}" fill="${esc(s.fill || 'none')}" ${stroke(s, s.fill && !s.color ? 'none' : INK)}${tog}/>`;
      }
      case 'text': {
        const x = ev(s.x),
          y = ev(s.y);
        if (!finite(x, y) || !s.text) return '';
        const content = template(s.text, vars);
        // 含 $…$ 或 √ 的文字用 KaTeX 排版（foreignObject），其他用 SVG 文字。
        if (/[$√]/.test(content)) return mathLabel(X(x), Y(y), s.size || 18, s.color || INK, content, tog);
        return `<text x="${X(x)}" y="${Y(y)}" class="viz-text" font-size="${font(s.size)}" fill="${esc(s.color || INK)}"${tog}>${esc(content)}</text>`;
      }
      case 'point': {
        const x = ev(s.x),
          y = ev(s.y);
        if (!finite(x, y)) return '';
        return `<circle cx="${X(x)}" cy="${Y(y)}" r="${5 * k}" fill="${esc(s.color || INK)}"/>${s.text ? label(X(x) + 10 * k, Y(y) - 10 * k, s.size || 16, s.color || '#4b5478', template(s.text, vars), 'start') : ''}`;
      }
      case 'angle': {
        if (!s.points || s.points.length < 3) return '';
        const [a, o, b] = s.points.map(pt);
        if (![a, o, b].every((p) => finite(...p))) return '';
        const r = 26 * k,
          t1 = Math.atan2(a[1] - o[1], a[0] - o[0]),
          t2 = Math.atan2(b[1] - o[1], b[0] - o[0]);
        let delta = t2 - t1;
        while (delta <= -Math.PI) delta += 2 * Math.PI;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        const p1 = [o[0] + r * Math.cos(t1), o[1] + r * Math.sin(t1)],
          p2 = [o[0] + r * Math.cos(t2), o[1] + r * Math.sin(t2)],
          mid = t1 + delta / 2;
        return `<path d="M${p1[0]} ${p1[1]} A${r} ${r} 0 0 ${delta > 0 ? 1 : 0} ${p2[0]} ${p2[1]}" fill="none" ${stroke(s, '#e5484d')}/>${s.text ? `<text x="${o[0] + (r + 16 * k) * Math.cos(mid)}" y="${o[1] + (r + 16 * k) * Math.sin(mid)}" class="viz-label" font-size="${font(s.size || 15)}" fill="${esc(s.color || '#e5484d')}">${esc(template(s.text, vars))}</text>` : ''}`;
      }
      case 'brace': {
        // 尺寸標示線：畫在 p1→p2 方向的左側（外側），中間寫長度。
        if (!s.points || s.points.length < 2) return '';
        const [a, b] = s.points.map(pt);
        if (![a, b].every((p) => finite(...p))) return '';
        const dx = b[0] - a[0],
          dy = b[1] - a[1],
          len = Math.hypot(dx, dy);
        if (len < 1) return '';
        // 在 SVG 座標（y 向下）中，數學座標的左側法向量是 (dy, -dx)。
        const nx = dy / len,
          ny = -dx / len,
          off = 12 * k,
          a2 = [a[0] + nx * off, a[1] + ny * off],
          b2 = [b[0] + nx * off, b[1] + ny * off],
          m = [(a2[0] + b2[0]) / 2 + nx * 14 * k, (a2[1] + b2[1]) / 2 + ny * 14 * k];
        return `<path d="M${a[0] + nx * 4 * k} ${a[1] + ny * 4 * k}L${a2[0]} ${a2[1]}L${b2[0]} ${b2[1]}L${b[0] + nx * 4 * k} ${b[1] + ny * 4 * k}" class="viz-brace" stroke="${esc(s.color || '#6b7394')}"/>${s.text ? label(m[0], m[1], s.size || 16, s.color || '#4b5478', template(s.text, vars)) : ''}`;
      }
    }
    return '';
  }
  function handles(): string {
    return (spec.points || [])
      .map((p) => {
        const x = vars[`${p.id}x`],
          y = vars[`${p.id}y`];
        return `<g class="viz-handle" data-point="${esc(p.id)}" tabindex="0" role="slider" aria-label="拖曳點 ${esc(p.label || p.id)}（${fmt(x)}, ${fmt(y)}）"><circle cx="${X(x)}" cy="${Y(y)}" r="${24 * k}" class="viz-hit"/><circle cx="${X(x)}" cy="${Y(y)}" r="${9 * k}" fill="${esc(p.color || '#ff7a45')}" class="viz-dot"/>${p.label ? `<text x="${X(x) + 14 * k}" y="${Y(y) - 14 * k}" class="viz-label" font-size="${font(16)}">${esc(p.label)}</text>` : ''}</g>`;
      })
      .join('');
  }
  function measure() {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const scale = Math.min(r.width / W, r.height / H);
    k = 1 / Math.max(scale, 0.05);
    svg.style.setProperty('--k', String(k));
  }
  function paint() {
    measure();
    // 步驟聚焦：目前步驟相關的圖形發光，其餘反暗，引導學生視線（降低外在認知負荷）。
    const step = vars.step ?? 0;
    const shown = spec.shapes.filter(visible);
    const inFocus = (s: InteractiveShape) =>
      s.focus ? s.focus.includes(step) : s.step !== undefined && s.step === step;
    const focusing = !!spec.steps?.length && shown.some(inFocus);
    const entering = step !== lastStep;
    lastStep = step;
    const body = shown
      .map((s) => {
        const html = shape(s);
        if (!html || !focusing) return html;
        return inFocus(s)
          ? `<g class="viz-focus${entering ? ' viz-enter' : ''}" filter="url(#${glowId})">${html}</g>`
          : `<g class="viz-dim">${html}</g>`;
      })
      .join('');
    // 發光濾鏡用整張圖的座標（userSpaceOnUse）：水平／垂直線的外框高度或寬度是 0，用物件外框會讓線整條消失。
    svg.innerHTML = `<defs><marker id="viz-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${INK}"/></marker><filter id="${glowId}" filterUnits="userSpaceOnUse" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur in="SourceAlpha" stdDeviation="${5 * k}" result="blur"/><feFlood flood-color="#ffc93c" flood-opacity="1"/><feComposite in2="blur" operator="in" result="halo"/><feComposite in="halo" in2="SourceAlpha" operator="out" result="glow"/><feMerge><feMergeNode in="glow"/><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${grid()}${body}${handles()}`;
    for (const r of spec.readouts || []) {
      const el = controls.querySelector<HTMLElement>(`[data-readout="${CSS.escape(r.label)}"]`);
      if (el) el.textContent = fmt(tryEval(r.expr, vars), r.digits);
    }
    for (const p of spec.params || []) {
      const out = controls.querySelector<HTMLElement>(`[data-param-value="${p.id}"]`);
      if (out) out.textContent = `${fmt(vars[p.id])}${p.unit || ''}`;
      const toggle = controls.querySelector<HTMLElement>(`[data-param-toggle="${p.id}"]`);
      if (toggle) toggle.setAttribute('aria-pressed', String(!!vars[p.id]));
    }
    const cap = controls.querySelector<HTMLElement>('.viz-step-caption');
    if (cap && spec.steps) {
      cap.innerHTML = md(spec.steps[vars.step] || '');
      controls.querySelector<HTMLElement>('.viz-step-count')!.textContent =
        `${vars.step + 1} / ${spec.steps.length}`;
      controls.querySelector<HTMLButtonElement>('[data-viz="prev"]')!.disabled = vars.step <= 0;
      controls.querySelector<HTMLButtonElement>('[data-viz="next"]')!.disabled =
        vars.step >= spec.steps.length - 1;
    }
  }
  const changed = () => {
    paint();
    onChange({ ...vars });
  };

  const sliders = (spec.params || [])
    .map((p) =>
      p.kind === 'toggle'
        ? `<button type="button" class="viz-toggle" data-param-toggle="${p.id}" aria-pressed="${!!vars[p.id]}"><i></i>${md(p.label || p.id)}</button>`
        : `<label class="viz-slider"><span class="viz-slider-head"><span>${md(p.label || p.id)}</span><output data-param-value="${p.id}"></output></span><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${vars[p.id]}" data-param="${p.id}" aria-label="${esc(p.label || p.id)}"></label>`,
    )
    .join('');
  const steps = spec.locked
    ? `<p class="viz-locked">老師公布結果後，才能看完整的解題步驟。</p>`
    : spec.steps?.length
    ? `<div class="viz-steps"><button type="button" class="viz-step-btn" data-viz="prev" aria-label="上一步">‹</button><span class="viz-step-count"></span><button type="button" class="viz-step-btn primary" data-viz="next">下一步 ›</button><p class="viz-step-caption" aria-live="polite"></p></div>`
    : '';
  const readouts = spec.readouts?.length
    ? `<dl class="viz-readouts">${spec.readouts.map((r) => `<div><dt>${md(r.label)}</dt><dd data-readout="${esc(r.label)}"></dd></div>`).join('')}</dl>`
    : '';
  controls.innerHTML = `${steps}${sliders ? `<div class="viz-params">${sliders}</div>` : ''}${readouts}${spec.caption ? `<p class="viz-caption">${md(spec.caption)}</p>` : ''}${(spec.params?.length || spec.points?.length || spec.steps?.length) ? '<button type="button" class="viz-reset" data-viz="reset">重設</button>' : ''}`;

  const onInput = (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (!input.dataset.param) return;
    vars[input.dataset.param] = Number(input.value);
    changed();
  };
  const onClick = (e: Event) => {
    const target = e.target as Element;
    const toggle = target.closest<HTMLElement>('[data-param-toggle]');
    const viz = target.closest<HTMLElement>('[data-viz]');
    const shapeToggle = target.closest<SVGElement>('[data-toggle]');
    if (toggle) vars[toggle.dataset.paramToggle!] = vars[toggle.dataset.paramToggle!] ? 0 : 1;
    else if (shapeToggle) vars[shapeToggle.dataset.toggle!] = vars[shapeToggle.dataset.toggle!] ? 0 : 1;
    else if (viz?.dataset.viz === 'next') vars.step = Math.min((spec.steps?.length || 1) - 1, vars.step + 1);
    else if (viz?.dataset.viz === 'prev') vars.step = Math.max(0, vars.step - 1);
    else if (viz?.dataset.viz === 'reset') {
      Object.assign(vars, initialVars(spec));
      controls.querySelectorAll<HTMLInputElement>('input[data-param]').forEach((i) => {
        i.value = String(vars[i.dataset.param!]);
      });
    } else return;
    e.stopPropagation();
    changed();
  };

  // 拖曳點：以 SVG 的螢幕轉換矩陣換算回數學座標，再套用格點吸附與邊界。
  let dragging: { id: string; pointerId: number } | null = null;
  const toMath = (e: PointerEvent) => {
    const m = svg.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x / sx + v.xMin, y: (H - p.y) / sy + v.yMin };
  };
  const place = (id: string, x: number, y: number) => {
    const p = spec.points!.find((q) => q.id === id)!;
    const snap = (n: number) => (p.snap ? Math.round(n / p.snap) * p.snap : Math.round(n * 100) / 100);
    if (p.lock !== 'y') vars[`${id}x`] = Math.min(p.maxX ?? v.xMax, Math.max(p.minX ?? v.xMin, snap(x)));
    if (p.lock !== 'x') vars[`${id}y`] = Math.min(p.maxY ?? v.yMax, Math.max(p.minY ?? v.yMin, snap(y)));
  };
  const down = (e: PointerEvent) => {
    const g = (e.target as Element).closest<SVGGElement>('[data-point]');
    if (!g || dragging) return;
    e.preventDefault();
    dragging = { id: g.dataset.point!, pointerId: e.pointerId };
    svg.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== dragging.pointerId) return;
    const m = toMath(e);
    if (!m) return;
    place(dragging.id, m.x, m.y);
    changed();
  };
  const up = (e: PointerEvent) => {
    if (dragging?.pointerId !== e.pointerId) return;
    dragging = null;
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  };
  const key = (e: KeyboardEvent) => {
    const g = (e.target as Element).closest?.<SVGGElement>('[data-point]');
    if (!g) return;
    const p = spec.points!.find((q) => q.id === g.dataset.point)!;
    const d = p.snap || 0.1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-d, 0],
      ArrowRight: [d, 0],
      ArrowUp: [0, d],
      ArrowDown: [0, -d],
    };
    if (!moves[e.key]) return;
    e.preventDefault();
    e.stopPropagation();
    place(p.id, vars[`${p.id}x`] + moves[e.key][0], vars[`${p.id}y`] + moves[e.key][1]);
    changed();
    host.querySelector<SVGGElement>(`[data-point="${CSS.escape(p.id)}"]`)?.focus();
  };
  host.addEventListener('input', onInput);
  host.addEventListener('click', onClick);
  svg.addEventListener('pointerdown', down);
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  host.addEventListener('keydown', key);
  const resize = new ResizeObserver(() => paint());
  resize.observe(host.querySelector('.viz-figure')!);
  paint();
  return {
    vars: () => ({ ...vars }),
    destroy() {
      resize.disconnect();
      host.removeEventListener('input', onInput);
      host.removeEventListener('click', onClick);
      host.removeEventListener('keydown', key);
      host.innerHTML = '';
    },
  };
}
