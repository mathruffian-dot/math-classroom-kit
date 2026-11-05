// 回家作業紅筆「圈出做錯的步驟」：外框驗證、顯示判斷、標籤擺位。後端（AI 輸出）與前端（畫圈前）共用。
import type { HomeworkMark, HomeworkStep, HomeworkStepBox } from './types';

export const STEP_TEXT_MAX = { wrong: 60, why: 60, fix: 60 } as const;
/**
 * 一行手寫字合理的外框大小（相對整張照片）。
 * 太小多半是 AI 只點了一個位置，太大多半是框到整段或整頁：都不圈，只顯示文字。
 */
export const STEP_BOX_LIMITS = { minW: 0.015, minH: 0.008, maxH: 0.35, minArea: 0.0002, maxArea: 0.25 } as const;

/** 外框 [左, 上, 右, 下]（0–1）：缺欄、NaN、超出範圍、左右上下顛倒、面積不合理都回傳 undefined。不夾回範圍，超出就是座標不可信。 */
export function parseStepBox(value: unknown): HomeworkStepBox | undefined {
  if (!Array.isArray(value) || value.length !== 4) return undefined;
  if (!value.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) return undefined;
  const [x0, y0, x1, y1] = value as number[];
  const w = x1 - x0,
    h = y1 - y0,
    L = STEP_BOX_LIMITS;
  if (w < L.minW || h < L.minH || h > L.maxH || w * h < L.minArea || w * h > L.maxArea) return undefined;
  return [x0, y0, x1, y1].map((v) => Math.round(v * 1e4) / 1e4) as HomeworkStepBox;
}

const invisible = (c: number) => c < 0x20 || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2060 && c <= 0x206f) || c === 0xfeff;
/** AI 或老師寫的短句：拿掉控制字元與隱形字元（換行、零寬、方向控制）、合併空白、限制長度（不切斷 emoji）。跳脫 HTML 在畫面輸出時做。 */
export function stepText(value: unknown, max: number): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const text = [...String(value)]
    .map((ch) => (invisible(ch.codePointAt(0)!) ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return [...text].slice(0, max).join('').trim();
}

/** 這一題要顯示的做錯步驟：只有答錯才有（老師改判成對就不顯示）；舊紀錄沒有這欄時回傳 undefined。 */
export function shownStep(mark: HomeworkMark | undefined): HomeworkStep | undefined {
  return mark?.correct === false && mark.step ? mark.step : undefined;
}
/** 可以圈在第 photo 張照片上的外框；座標不可信或不是這張照片時回傳 undefined（只顯示文字）。 */
export function stepRing(step: HomeworkStep | undefined, photo: number): HomeworkStepBox | undefined {
  return step && step.photo === photo ? parseStepBox(step.box) : undefined;
}

/* ───────────── 標籤擺位（單位：畫面上的像素） ───────────── */
export interface StepRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const hit = (a: StepRect, b: StepRect, gap = 0) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
/** 標籤範圍內「最密的一小格」可接受的筆跡比例（雜點、JPEG 雜訊）；超過就算蓋到學生的字。 */
export const STEP_INK_LIMIT = 0.05;
/**
 * 找一個放標籤的空白處。先試圈的右、左、上、下（必要時自動換邊），都有字時再掃全圖找最近的空白。
 * 不可以碰到：圈（所有題的）、已放好的標籤、其他紅筆、學生的字（ink 回傳範圍內最密一小格的筆跡比例）。
 * link：這個位置連不連得回圈（連線也不能蓋字）；連不回去的位置不算。near：只找圈旁（小題號用，不掃全圖）。
 * 整張都找不到時回傳 null：呼叫端把文字放到照片下方，不蓋字。
 */
export function placeStepLabel(opts: { W: number; H: number; ring: StepRect; sizes: { w: number; h: number }[]; blocked: StepRect[]; ink: (r: StepRect) => number; link?: (r: StepRect) => boolean; near?: boolean }): StepRect | null {
  const { W, H, ring, sizes, blocked, ink, link, near } = opts;
  const gap = 4;
  let best: StepRect | null = null,
    bestCost = Infinity;
  const consider = (r: StepRect, sideCost: number) => {
    if (r.x < 0 || r.y < 0 || r.x + r.w > W || r.y + r.h > H) return;
    if (hit(r, ring, 1) || blocked.some((b) => hit(r, b, 2))) return;
    const amount = ink(r);
    if (amount > STEP_INK_LIMIT) return;
    const dx = Math.max(ring.x - (r.x + r.w), r.x - (ring.x + ring.w), 0),
      dy = Math.max(ring.y - (r.y + r.h), r.y - (ring.y + ring.h), 0);
    const cost = Math.hypot(dx, dy) + sideCost + amount * 400;
    if (cost < bestCost && (!link || link(r))) {
      best = r;
      bestCost = cost;
    }
  };
  for (const { w, h } of sizes) {
    const cy = Math.min(H - h, Math.max(0, ring.y + ring.h / 2 - h / 2)),
      cx = Math.min(W - w, Math.max(0, ring.x + ring.w / 2 - w / 2));
    consider({ x: ring.x + ring.w + gap, y: cy, w, h }, 0);
    consider({ x: ring.x - w - gap, y: cy, w, h }, 4);
    consider({ x: cx, y: ring.y - h - gap, w, h }, 8);
    consider({ x: cx, y: ring.y + ring.h + gap, w, h }, 12);
    if (near) {
      // 小題號：沿著圈的上下緣找，還是貼在圈旁
      for (let t = 0; t <= 1; t += 0.1) {
        const x = ring.x + (ring.w - w) * t;
        consider({ x, y: ring.y - h - gap, w, h }, 8);
        consider({ x, y: ring.y + ring.h + gap, w, h }, 12);
      }
      continue;
    }
    // 靠左右邊的上下兩側（圈很寬、正上下方都是字時）
    consider({ x: 0, y: ring.y - h - gap, w, h }, 10);
    consider({ x: W - w, y: ring.y - h - gap, w, h }, 10);
    consider({ x: 0, y: ring.y + ring.h + gap, w, h }, 14);
    consider({ x: W - w, y: ring.y + ring.h + gap, w, h }, 14);
  }
  if (best || near) return best;
  // 圈的四周都有字：掃全圖找最近的空白（用線連回圈）
  const stepX = Math.max(8, W / 24),
    stepY = Math.max(8, H / 32);
  for (const { w, h } of sizes) for (let y = 0; y + h <= H; y += stepY) for (let x = 0; x + w <= W; x += stepX) consider({ x, y, w, h }, 30);
  return best;
}

/* ───────────── 圈線與連線的避字（單位：畫面上的像素；線寬不隨照片縮放，所以每個寬度都要重算） ───────────── */
type Point = [number, number];
/** 手繪圈的實際線條：points 是畫出來的折線（含抖動），reach 是線條厚度的一半加上反鋸齒的寬度。 */
export interface StepRingPlan {
  points: Point[];
  pen: number;
  halo: number;
  reach: number;
  /** 圈線（含厚度）的外框。 */
  rect: StepRect;
  /** 目標行的外框。 */
  box: StepRect;
}
export interface StepLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
/** 由寬鬆到收緊：先用原本的手繪圈；碰到相鄰筆跡時依四邊的空隙收留白、改成接近圓角矩形、拿掉白底、線條變細。 */
const RING_STYLES = [
  { pen: 3, halo: 6, fit: false },
  { pen: 3, halo: 6, fit: true },
  { pen: 2.5, halo: 0, fit: true },
  { pen: 2, halo: 0, fit: true },
];
const square = ([x, y]: Point, r: number): StepRect => ({ x: x - r, y: y - r, w: r * 2, h: r * 2 });
/** 沿折線每隔約 1 px 取一點。 */
function samplePath(points: Point[]): Point[] {
  const out: Point[] = [];
  points.forEach(([x, y], i) => {
    if (!i) return void out.push([x, y]);
    const [px, py] = points[i - 1],
      n = Math.max(1, Math.ceil(Math.hypot(x - px, y - py)));
    for (let k = 1; k <= n; k++) out.push([px + ((x - px) * k) / n, py + ((y - py) * k) / n]);
  });
  return out;
}
function ringPoints(c: StepRect, W: number, H: number, power: number, fit: boolean, seed: number): Point[] {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647 - 0.5;
  const cx = c.x + c.w / 2,
    cy = c.y + c.h / 2,
    wobble = fit ? 0.2 : (2.5 * W) / 1000,
    swell = fit ? 0 : 0.02,
    steps = fit ? 90 : 58,
    pow = (v: number) => Math.sign(v) * Math.abs(v) ** power;
  const pts: Point[] = [];
  // 頭尾多畫一小段交叉，像手畫的圈
  for (let i = 0; i <= steps + 4; i++) {
    const t = -0.5 + (i / steps) * Math.PI * 2,
      grow = 1 + swell * Math.sin(t * 2 + 1);
    const x = Math.max(1.5, Math.min(W - 1.5, cx + (c.w / 2) * grow * pow(Math.cos(t)))),
      y = Math.max(1.5, Math.min(H - 1.5, cy + (c.h / 2) * grow * pow(Math.sin(t))));
    pts.push([x + rnd() * wobble, y + rnd() * wobble]);
  }
  return pts;
}
/** 目標行的筆畫可以超出外框多少（反鋸齒、筆跡圖取整）。超出更多就是外框切過字，不沿著它收緊。 */
const RING_OVERHANG = 3;
/**
 * 外框一側可以走線的空白帶（從框邊往外算）：start 之前是目標行超出框的筆畫，end 之後是相鄰筆跡（沒碰到時是 Infinity）。
 * 外框切過字時回傳 null。
 */
function freeBand(band: (d: number) => StepRect, limit: number, inkCount: (r: StepRect) => number) {
  let d = 0;
  while (inkCount(band(d)) > 0) if ((d += 0.5) > RING_OVERHANG) return null;
  const start = d;
  while (d < limit) {
    if (inkCount(band(d)) > 0) return { start, end: d };
    d += 0.5;
  }
  return { start, end: Infinity };
}
/**
 * 決定這一行的圈怎麼畫：實際圈線（含線寬與白底）不可以壓到任何筆跡，包含被圈的這一行；也不可以碰到其他圈。
 * 怎麼收都畫不下時回傳 null：取消這個圈，只留文字說明。
 */
export function planStepRing(opts: { W: number; H: number; box: StepRect; pad: { x: number; y: number }; seed: number; inkCount: (r: StepRect) => number; others: StepRingPlan[] }): StepRingPlan | null {
  const { W, H, box, pad, seed, inkCount, others } = opts;
  for (const { pen, halo, fit } of RING_STYLES) {
    // 筆跡圖本身已經比字粗一點（縮圖的模糊也算筆跡），線條厚度外只再留 0.25 px
    const reach = Math.max(pen, halo) / 2 + 0.25;
    // 線放在空白帶裡：盡量用原本的留白，空間不夠時放中間；兩邊都留不出線寬就回傳 NaN（這個線寬畫不下）
    const room = (side: { start: number; end: number } | null, normal: number) => {
      if (!side) return NaN;
      const near = side.start + reach,
        far = side.end - reach;
      return near > far ? NaN : Math.max(near, Math.min(normal, (side.start + side.end) / 2));
    };
    let [l, r, t, b] = [pad.x, pad.x, pad.y, pad.y];
    if (fit) {
      l = room(freeBand((d) => ({ x: box.x - d - 0.5, y: box.y, w: 0.5, h: box.h }), pad.x + reach * 2 + 2, inkCount), pad.x);
      r = room(freeBand((d) => ({ x: box.x + box.w + d, y: box.y, w: 0.5, h: box.h }), pad.x + reach * 2 + 2, inkCount), pad.x);
      if (Number.isNaN(l + r)) continue;
      const across = { x: box.x - l - reach, w: box.w + l + r + reach * 2 };
      t = room(freeBand((d) => ({ ...across, y: box.y - d - 0.5, h: 0.5 }), pad.y + reach * 2 + 2, inkCount), pad.y);
      b = room(freeBand((d) => ({ ...across, y: box.y + box.h + d, h: 0.5 }), pad.y + reach * 2 + 2, inkCount), pad.y);
      if (Number.isNaN(t + b)) continue;
    }
    // 收緊時由接近圓角矩形到幾乎方正：圈的四個角才不會切過行頭、行尾的字
    for (const power of fit ? [0.3, 0.15] : [0.72]) {
      const points = ringPoints({ x: box.x - l, y: box.y - t, w: box.w + l + r, h: box.h + t + b }, W, H, power, fit, seed);
      const line = samplePath(points);
      if (line.some((p) => inkCount(square(p, reach)) > 0)) continue;
      const xs = points.map((p) => p[0]),
        ys = points.map((p) => p[1]);
      const rect: StepRect = { x: Math.min(...xs) - reach, y: Math.min(...ys) - reach, w: Math.max(...xs) - Math.min(...xs) + reach * 2, h: Math.max(...ys) - Math.min(...ys) + reach * 2 };
      const touches = others.some((o) => hit(rect, o.rect) && samplePath(o.points).some(([ox, oy]) => line.some(([x, y]) => Math.hypot(x - ox, y - oy) <= reach + o.reach)));
      if (touches) continue;
      return { points, pen, halo, reach, rect, box };
    }
  }
  return null;
}
const crosses = (a: StepLine, b: StepLine) => {
  const side = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
  return side(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1) * side(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2) <= 0 && side(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1) * side(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2) <= 0;
};
/** 標籤和圈線最近的距離不超過這個值時，標籤算貼著圈，不用畫連線。 */
export const STEP_LEADER_MIN = 8;
/** 連線兩側都要留這麼寬：線很細，但不該從字和字的細縫鑽過去。 */
const LEADER_REACH = 3;
/**
 * 從標籤連回圈的線。回傳 'touching'（貼著圈，不用畫）、一條線，或 null（每一條路都會碰到筆跡或批註：這個位置不能用）。
 * blocked 是其他批註與其他圈的範圍；也不能穿過目標行或別條連線。只接圈朝向標籤的那一面，線才不會穿過自己的圈。
 */
export function stepLeader(opts: { label: StepRect; ring: StepRingPlan; inkCount: (r: StepRect) => number; blocked: StepRect[]; lines: StepLine[] }): StepLine | 'touching' | null {
  const { label, ring, inkCount, blocked, lines } = opts;
  const nearest = ([x, y]: Point): Point => [Math.max(label.x, Math.min(label.x + label.w, x)), Math.max(label.y, Math.min(label.y + label.h, y))];
  const cx = ring.box.x + ring.box.w / 2,
    cy = ring.box.y + ring.box.h / 2,
    // 沿線等距取點：接近方正的圈，折線點都擠在四個角
    pts = samplePath(ring.points),
    every = Math.max(1, Math.floor(pts.length / 32));
  const tries: { line: StepLine; len: number }[] = [];
  let closest = Infinity;
  for (let i = 1; i < pts.length - 1; i += every) {
    const p = pts[i],
      [lx, ly] = nearest(p),
      len = Math.hypot(p[0] - lx, p[1] - ly);
    closest = Math.min(closest, len);
    // 朝外的法線（切線轉 90 度，指離圈心）要朝向標籤
    let nx = pts[i + 1][1] - pts[i - 1][1],
      ny = pts[i - 1][0] - pts[i + 1][0];
    if (nx * (p[0] - cx) + ny * (p[1] - cy) < 0) [nx, ny] = [-nx, -ny];
    if (nx * (lx - p[0]) + ny * (ly - p[1]) > 0) tries.push({ line: { x1: lx, y1: ly, x2: p[0], y2: p[1] }, len });
  }
  if (closest <= STEP_LEADER_MIN) return 'touching';
  const avoid = [...blocked, ring.box];
  for (const { line } of tries.sort((a, b) => a.len - b.len)) {
    if (lines.some((o) => crosses(line, o))) continue;
    const safe = samplePath([[line.x1, line.y1], [line.x2, line.y2]]).every((p) => {
      const r = square(p, LEADER_REACH);
      return inkCount(r) === 0 && !avoid.some((b) => hit(r, b));
    });
    if (safe) return line;
  }
  return null;
}

/* ───────────── 老師輸入框的字數（和後端一樣用碼點計算，𝑥 算 1 個字） ───────────── */
/** 超過上限時從游標前面（剛打進去或貼上的內容）刪掉多的字元，游標後面的字不動。回傳新的內容與游標位置（UTF-16 索引）。 */
export function clipStepInput(value: string, caret: number, max: number): { value: string; caret: number } {
  if ([...value].length <= max) return { value, caret };
  const after = value.slice(caret),
    room = Math.max(0, max - [...after].length);
  const before = [...value.slice(0, caret)].slice(0, room).join('');
  const clipped = before + [...after].slice(0, max - [...before].length).join('');
  return { value: clipped, caret: before.length };
}
