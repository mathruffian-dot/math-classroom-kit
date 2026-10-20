import type { Point, Stroke } from '../shared/types';
export type Tool = 'cursor' | 'pen' | 'erase' | 'laser' | 'spot';
/** 雷射筆軌跡停留的時間（毫秒）：移動時留下一道逐漸淡出的紅光。 */
const LASER_TRAIL_MS = 2500;
export class Whiteboard {
  tool: Tool = 'cursor';
  color = '#dc795d';
  width = 4;
  strokes: Stroke[];
  private redoStack: Stroke[][] = [];
  private undoStack: Stroke[][] = [];
  private active: Stroke | null = null;
  private pointerId: number | null = null;
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private resize: ResizeObserver;
  private effect: HTMLDivElement;
  private laser: HTMLCanvasElement;
  private trail: { x: number; y: number; t: number }[] = [];
  private tip: { x: number; y: number } | null = null; // 雷射筆目前位置（游標停在投影片上時一直顯示紅點）
  private raf = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private pending = false;
  private inFlight = 0;
  private sending: Promise<void> = Promise.resolve();
  constructor(
    private stage: HTMLElement,
    initial: Stroke[],
    private save: (strokes: Stroke[]) => Promise<void>,
    private error: (message: string) => void,
  ) {
    this.strokes = structuredClone(initial);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'whiteboard';
    this.canvas.dataset.testid = 'whiteboard-canvas';
    this.canvas.setAttribute('aria-label', '簡報白板，使用畫筆工具書寫');
    this.context = this.canvas.getContext('2d')!;
    this.effect = document.createElement('div');
    this.effect.className = 'pointer-effect';
    this.laser = document.createElement('canvas');
    this.laser.className = 'pointer-effect laser-trail';
    stage.append(this.canvas, this.effect, this.laser);
    this.resize = new ResizeObserver(() => this.paint());
    this.resize.observe(stage);
    this.canvas.addEventListener('pointerdown', this.down);
    this.canvas.addEventListener('pointermove', this.move);
    this.canvas.addEventListener('pointerup', this.up);
    this.canvas.addEventListener('pointercancel', this.up);
    this.canvas.addEventListener('lostpointercapture', this.up);
    this.canvas.addEventListener('pointerleave', () => {
      if (this.pointerId === null) this.effect.style.background = '';
      this.tip = null;
      if (!this.raf) this.raf = requestAnimationFrame(this.drawTrail);
    });
    this.setTool('cursor');
    this.paint();
  }
  setTool(tool: Tool) {
    this.tool = tool;
    this.canvas.style.pointerEvents = tool === 'cursor' ? 'none' : 'auto';
    this.canvas.style.cursor = tool === 'pen' ? 'crosshair' : tool === 'erase' ? 'cell' : tool === 'laser' ? 'none' : 'default';
    this.effect.style.background = '';
    if (tool !== 'laser') {
      this.trail = [];
      this.tip = null;
      if (!this.raf) this.raf = requestAnimationFrame(this.drawTrail);
    }
  }
  setRemote(strokes: Stroke[]) {
    if (!this.pending && !this.active && !this.inFlight) {
      this.strokes = structuredClone(strokes);
      this.paint();
    }
  }
  private point(e: PointerEvent): Point {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }
  private down = (e: PointerEvent) => {
    // 觸控大螢幕／觸控筆的 pointerId 常常重複使用：上一筆的 pointerup 漏掉時（筆抬太快、滑出邊緣），
    // 先把上一筆收尾，否則新的一筆會接在舊的後面，畫出一條把兩筆連起來的線。
    if (this.pointerId !== null) {
      if (this.pointerId === e.pointerId || e.pointerType !== 'touch') this.finish();
      else return; // 另一根手指（多點觸控）不畫
    }
    if (e.button !== 0) return;
    if (this.tool === 'pen' && this.strokes.length >= 190) {
      this.error('這頁已有 190 筆，請先擦除部分筆跡或換一頁。');
      return;
    }
    this.pointerId = e.pointerId;
    try {
      this.canvas.setPointerCapture(e.pointerId); // 指標已經不存在時會丟錯（例如筆剛離開螢幕）
    } catch {}
    if (this.tool === 'pen' || this.tool === 'erase') {
      this.undoStack.push(structuredClone(this.strokes));
      this.redoStack = [];
    }
    if (this.tool === 'pen') {
      this.active = {
        id: crypto.randomUUID(),
        color: this.color,
        width: this.width,
        points: [this.point(e)],
      };
      this.strokes.push(this.active);
    }
    this.move(e);
  };
  private move = (e: PointerEvent) => {
    if (this.pointerId !== null && this.pointerId !== e.pointerId) return;
    const p = this.point(e);
    if (this.tool === 'laser') {
      this.trail.push({ ...p, t: performance.now() });
      this.tip = p;
      if (!this.raf) this.raf = requestAnimationFrame(this.drawTrail);
    }
    if (this.tool === 'spot')
      this.effect.style.background = `radial-gradient(circle 120px at ${p.x * 100}% ${p.y * 100}%, transparent 96%, #102725b8 100%)`;
    if (this.pointerId === null) return;
    // 筆已經離開螢幕但沒收到 pointerup（buttons 變成 0）：當作這一筆結束
    if (e.buttons === 0 && e.pointerType !== 'touch') return this.finish();
    if (this.tool === 'pen' && this.active) {
      // 用合併事件取得兩次畫面更新之間的所有點，快速書寫時筆跡才不會變成折線；太近的點略過（控制點數）
      const r = this.canvas.getBoundingClientRect();
      const minGap = 1.2 / Math.max(r.width, 1);
      for (const ev of e.getCoalescedEvents?.() || [e]) {
        const q = this.point(ev);
        const last = this.active.points[this.active.points.length - 1];
        if (last && Math.hypot(q.x - last.x, q.y - last.y) < minGap) continue;
        if (this.active.points.length >= 990) break;
        this.active.points.push(q);
      }
      this.drawActive();
    }
    if (this.tool === 'erase') {
      this.strokes = this.strokes.filter(
        (s) => !s.points.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.025),
      );
      this.paint();
    }
  };
  private up = (e: PointerEvent) => {
    if (this.pointerId !== e.pointerId) return;
    this.finish();
  };
  /** 結束目前這一筆（pointerup、pointercancel、失去捕捉或偵測到漏掉的 pointerup）。 */
  private finish() {
    const id = this.pointerId;
    if (id === null) return;
    this.pointerId = null;
    const ended = this.active;
    this.active = null;
    try {
      if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    } catch {}
    if (ended) this.paint(); // 收尾時整頁重畫一次（平滑曲線）
    if (this.tool === 'pen' || this.tool === 'erase') this.changed();
  }
  /** 雷射筆：每一段依存在時間變細、變淡；最新的點是發光的紅點。軌跡淡完就停止重畫。 */
  private drawTrail = () => {
    this.raf = 0;
    const now = performance.now();
    this.trail = this.trail.filter((q) => now - q.t < LASER_TRAIL_MS);
    const rect = this.stage.getBoundingClientRect(),
      ratio = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * ratio),
      h = Math.round(rect.height * ratio);
    if (this.laser.width !== w || this.laser.height !== h) {
      this.laser.width = w;
      this.laser.height = h;
    }
    const c = this.laser.getContext('2d')!;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.clearRect(0, 0, rect.width, rect.height);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const at = (q: { x: number; y: number }) => [q.x * rect.width, q.y * rect.height] as const;
    // 每 6 段畫成一條連續的線（同一個透明度），接點才不會疊出圓點
    for (let i = 1; i < this.trail.length; i += 6) {
      const end = Math.min(this.trail.length - 1, i + 5);
      const life = 1 - (now - this.trail[end].t) / LASER_TRAIL_MS;
      c.beginPath();
      c.moveTo(...at(this.trail[i - 1]));
      for (let j = i; j <= end; j++) c.lineTo(...at(this.trail[j]));
      c.strokeStyle = `rgba(255, 80, 64, ${0.28 * life})`; // 外圈光暈
      c.lineWidth = 4 + 10 * life;
      c.stroke();
      c.strokeStyle = `rgba(255, 59, 48, ${0.95 * life})`; // 中心
      c.lineWidth = 1.5 + 3.5 * life;
      c.stroke();
    }
    if (this.tip) {
      const [x, y] = at(this.tip);
      const glow = c.createRadialGradient(x, y, 0, x, y, 16);
      glow.addColorStop(0, 'rgba(255, 105, 88, 1)');
      glow.addColorStop(0.35, 'rgba(255, 105, 88, 0.55)');
      glow.addColorStop(1, 'rgba(255, 105, 88, 0)');
      c.fillStyle = glow;
      c.beginPath();
      c.arc(x, y, 16, 0, Math.PI * 2);
      c.fill();
    }
    if (this.trail.length) this.raf = requestAnimationFrame(this.drawTrail);
  };
  private changed() {
    this.pending = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush().catch((e) => this.error(e.message)), 350);
  }
  async flush() {
    clearTimeout(this.timer);
    if (!this.pending) return this.sending;
    const snapshot = structuredClone(this.strokes);
    this.pending = false;
    this.inFlight++;
    this.sending = this.sending
      .catch(() => {})
      .then(() => this.save(snapshot))
      .catch((e) => {
        this.pending = true;
        throw e;
      })
      .finally(() => {
        this.inFlight--;
      });
    return this.sending;
  }
  undo() {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(structuredClone(this.strokes));
    this.strokes = previous;
    this.paint();
    this.changed();
  }
  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(structuredClone(this.strokes));
    this.strokes = next;
    this.paint();
    this.changed();
  }
  clear() {
    this.undoStack.push(structuredClone(this.strokes));
    this.redoStack = [];
    this.strokes = [];
    this.paint();
    this.changed();
  }
  private size = { w: 0, h: 0 };
  /** 畫布大小只有在投影片區改變大小時才重設（每次重設都會清空並重新配置記憶體，書寫時會卡）。 */
  private fit() {
    const rect = this.stage.getBoundingClientRect(),
      ratio = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * ratio),
      h = Math.round(rect.height * ratio);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.size = { w: rect.width, h: rect.height };
    const c = this.context;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    return c;
  }
  /** 一筆畫成平滑曲線：經過相鄰兩點的中點、以原始點為控制點（二次貝茲），轉折不會一折一折的。 */
  private trace(s: Stroke, from = 0) {
    const c = this.context,
      { w, h } = this.size,
      pts = s.points;
    const X = (i: number) => pts[i].x * w,
      Y = (i: number) => pts[i].y * h;
    c.strokeStyle = s.color;
    c.fillStyle = s.color;
    c.lineWidth = s.width;
    if (pts.length === 1) {
      c.beginPath();
      c.arc(X(0), Y(0), s.width / 2, 0, Math.PI * 2);
      c.fill();
      return;
    }
    if (pts.length === 2) {
      c.beginPath();
      c.moveTo(X(0), Y(0));
      c.lineTo(X(1), Y(1));
      c.stroke();
      return;
    }
    const mid = (i: number) => [(X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2] as const;
    const start = Math.max(1, from);
    c.beginPath();
    if (start === 1) c.moveTo(X(0), Y(0));
    else c.moveTo(...mid(start - 1));
    for (let i = start; i < pts.length - 1; i++) c.quadraticCurveTo(X(i), Y(i), ...mid(i));
    if (from === 0) c.lineTo(X(pts.length - 1), Y(pts.length - 1)); // 整筆重畫時補上最後半段
    c.stroke();
  }
  private painted = 0; // 目前這一筆已經畫到第幾個點
  private paint() {
    const c = this.fit();
    c.clearRect(0, 0, this.size.w, this.size.h);
    for (const s of this.strokes) if (s.points.length) this.trace(s);
    this.painted = this.active?.points.length ?? 0;
  }
  /** 書寫中只補畫這一筆新增的部分，不重畫整頁。 */
  private drawActive() {
    const s = this.active;
    if (!s) return;
    if (this.painted < 2 || this.canvas.width !== Math.round(this.size.w * (window.devicePixelRatio || 1))) return this.paint();
    this.trace({ ...s, points: s.points }, this.painted - 1);
    this.painted = s.points.length;
  }
  destroy() {
    clearTimeout(this.timer);
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    this.canvas.remove();
    this.effect.remove();
    this.laser.remove();
  }
}
