// 作答鍵盤的「手寫」模式：在小畫布上寫一個答案，停筆後自動送去辨識。
// 用 Apple Pencil 寫過之後，手指／手掌的觸碰不會畫線（防誤觸）。
type Pt = { x: number; y: number };

export class HandPad {
  private strokes: Pt[][] = [];
  private active: Pt[] | null = null;
  private pointerId: number | null = null;
  private sawPen = false;
  private idle?: ReturnType<typeof setTimeout>;
  /** 每次筆跡改變就加 1；辨識完成時比對，期間又寫了就再辨識一次。 */
  version = 0;
  constructor(
    private canvas: HTMLCanvasElement,
    private onIdle: () => void,
    private idleMs = 1100,
  ) {
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.up);
    this.fit();
  }
  get empty() {
    return !this.strokes.length;
  }
  /** 依顯示大小設定畫布解析度（鍵盤寬度改變時呼叫）。 */
  fit() {
    const r = this.canvas.getBoundingClientRect(),
      ratio = window.devicePixelRatio || 1;
    if (!r.width) return;
    this.canvas.width = Math.round(r.width * ratio);
    this.canvas.height = Math.round(r.height * ratio);
    this.paint();
  }
  clear() {
    this.strokes = [];
    this.active = null;
    this.version++;
    clearTimeout(this.idle);
    this.paint();
  }
  private point(e: PointerEvent): Pt {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  private down = (e: PointerEvent) => {
    if (e.pointerType === 'pen') this.sawPen = true;
    if (this.sawPen && e.pointerType === 'touch') return; // 防手掌誤觸
    if (this.pointerId !== null) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    clearTimeout(this.idle);
    this.active = [this.point(e)];
    this.strokes.push(this.active);
    this.paint();
  };
  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId || !this.active) return;
    for (const ev of e.getCoalescedEvents?.() || [e]) this.active.push(this.point(ev));
    this.paint();
  };
  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.active = null;
    this.version++;
    clearTimeout(this.idle);
    this.idle = setTimeout(() => this.onIdle(), this.idleMs);
  };
  private paint() {
    const c = this.canvas.getContext('2d')!,
      ratio = window.devicePixelRatio || 1;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = '#1f2a56';
    c.fillStyle = '#1f2a56';
    c.lineWidth = 3.2;
    for (const s of this.strokes) {
      if (s.length === 1) {
        c.beginPath();
        c.arc(s[0].x, s[0].y, 1.8, 0, Math.PI * 2);
        c.fill();
        continue;
      }
      c.beginPath();
      c.moveTo(s[0].x, s[0].y);
      for (const p of s.slice(1)) c.lineTo(p.x, p.y);
      c.stroke();
    }
  }
  /** 只裁出筆跡的範圍（加邊框），白底、高度最多 200 px 的 PNG：檔案小（約 10–30 KB）、辨識快。 */
  toDataUrl(): string | null {
    const pts = this.strokes.flat();
    if (!pts.length) return null;
    const pad = 16;
    const x0 = Math.min(...pts.map((p) => p.x)) - pad,
      y0 = Math.min(...pts.map((p) => p.y)) - pad,
      x1 = Math.max(...pts.map((p) => p.x)) + pad,
      y1 = Math.max(...pts.map((p) => p.y)) + pad;
    const k = Math.min(2, 200 / (y1 - y0), 900 / (x1 - x0));
    const out = document.createElement('canvas');
    out.width = Math.max(32, Math.round((x1 - x0) * k));
    out.height = Math.max(32, Math.round((y1 - y0) * k));
    const c = out.getContext('2d')!;
    c.fillStyle = '#fff';
    c.fillRect(0, 0, out.width, out.height);
    c.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = '#111';
    c.fillStyle = '#111';
    c.lineWidth = 3.4;
    for (const s of this.strokes) {
      c.beginPath();
      c.moveTo(s[0].x, s[0].y);
      for (const p of s.slice(1)) c.lineTo(p.x, p.y);
      if (s.length === 1) c.arc(s[0].x, s[0].y, 1.8, 0, Math.PI * 2);
      c.stroke();
    }
    return out.toDataURL('image/png');
  }
  destroy() {
    clearTimeout(this.idle);
  }
}
