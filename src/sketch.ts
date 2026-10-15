import type { Activity, Annotation, Grade } from '../shared/types';
import { escape as esc } from './api';
import { icon } from './icons';
import { md } from './math';

/* ───────────── 學生作答畫布 ───────────── */
interface SPoint {
  x: number;
  y: number;
}
interface SStroke {
  color: string;
  width: number;
  points: SPoint[];
}
export interface SketchState {
  strokes: SStroke[];
  /** 拍照底圖（已在瀏覽器縮圖壓縮）。 */
  photo?: string;
  width: number;
  height: number;
  text: string;
}
const MAX_SIDE = 1600;
const PENS = [
  ['#1b1f3b', '黑'],
  ['#2f6fd6', '藍'],
  ['#d93a3a', '紅'],
  ['#0f9d8a', '綠'],
];
export function emptySketch(): SketchState {
  return { strokes: [], width: 1200, height: 900, text: '' };
}
export function sketchHasContent(s: SketchState | undefined): boolean {
  return !!s && (s.strokes.length > 0 || !!s.photo || !!s.text.trim());
}
function paper(ctx: CanvasRenderingContext2D, w: number, h: number, kind: Activity['canvas']) {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  const g = w / 24;
  ctx.lineWidth = Math.max(1, w / 1200);
  if (kind === 'grid' || kind === 'axes') {
    ctx.strokeStyle = '#dfe5f2';
    ctx.beginPath();
    for (let x = g; x < w; x += g) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = g; y < h; y += g) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  }
  if (kind === 'dots') {
    ctx.fillStyle = '#c4cbe0';
    for (let x = g; x < w; x += g)
      for (let y = g; y < h; y += g) {
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.5, w / 600), 0, Math.PI * 2);
        ctx.fill();
      }
  }
  if (kind === 'axes') {
    const ox = Math.round(w / 2 / g) * g,
      oy = Math.round(h / 2 / g) * g;
    ctx.strokeStyle = '#7a84a6';
    ctx.lineWidth = Math.max(2, w / 600);
    ctx.beginPath();
    ctx.moveTo(0, oy);
    ctx.lineTo(w, oy);
    ctx.moveTo(ox, h);
    ctx.lineTo(ox, 0);
    ctx.stroke();
  }
}
function drawStrokes(ctx: CanvasRenderingContext2D, strokes: SStroke[], w: number, h: number) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of strokes) {
    if (!s.points.length) continue;
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.width * (w / 1200);
    ctx.beginPath();
    ctx.moveTo(s.points[0].x * w, s.points[0].y * h);
    if (s.points.length === 1) {
      ctx.arc(s.points[0].x * w, s.points[0].y * h, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    for (let i = 1; i < s.points.length - 1; i++) {
      const p = s.points[i],
        q = s.points[i + 1];
      ctx.quadraticCurveTo(p.x * w, p.y * h, ((p.x + q.x) / 2) * w, ((p.y + q.y) / 2) * h);
    }
    const last = s.points[s.points.length - 1];
    ctx.lineTo(last.x * w, last.y * h);
    ctx.stroke();
  }
}
const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('圖片無法讀取'));
    img.src = src;
  });
/** 讀取相機／相簿照片：轉正、縮到長邊 1600 px、壓成 JPEG。 */
export async function compressPhoto(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  if (!file.type.startsWith('image/')) throw new Error('請選擇圖片檔');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions).catch(
    async () => loadImage(URL.createObjectURL(file)),
  );
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale),
    height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.82), width, height };
}
/** 合成送出用的作答圖（底紙或照片＋筆跡），控制在約 1.3 MB 以內。 */
export async function renderSketch(state: SketchState, kind: Activity['canvas']): Promise<string> {
  const photo = state.photo ? await loadImage(state.photo) : null;
  let scale = 1;
  for (let attempt = 0; attempt < 4; attempt++) {
    const w = Math.round(state.width * scale),
      h = Math.round(state.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    if (photo) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(photo, 0, 0, w, h);
    } else paper(ctx, w, h, kind);
    drawStrokes(ctx, state.strokes, w, h);
    const url = canvas.toDataURL('image/jpeg', attempt ? 0.72 : 0.85);
    if (url.length < 1_300_000) return url;
    scale *= 0.78;
  }
  throw new Error('作答圖片過大，請清掉部分筆跡或重新拍照');
}

/**
 * 全螢幕畫布：手寫、拍照（可在照片上加註）、文字說明。
 * Apple Pencil／觸控筆出現後自動忽略手掌觸碰。
 */
export function openSketch(opts: {
  title: string;
  prompt: string;
  kind: Activity['canvas'];
  allowPhoto: boolean;
  state: SketchState;
  criteria?: string[];
}): Promise<SketchState | null> {
  return new Promise((resolve) => {
    const state: SketchState = structuredClone(opts.state);
    const undo: SStroke[][] = [],
      redo: SStroke[][] = [];
    let pen = PENS[0][0],
      width = 4,
      tool: 'pen' | 'erase' = 'pen',
      active: SStroke | null = null,
      pointerId: number | null = null,
      sawStylus = false;
    let photoImage: HTMLImageElement | null = null;
    const root = document.createElement('div');
    root.className = 'sketch-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', '作答畫布');
    root.innerHTML = `<header class="sketch-top"><div class="sketch-title"><strong>${esc(opts.title)}</strong><span>${md(opts.prompt)}</span></div><div class="sketch-top-actions"><button type="button" class="btn quiet" data-sk="cancel">${icon('x')}<span>取消</span></button><button type="button" class="btn primary" data-sk="done" data-testid="sketch-done">${icon('check')}<span>完成</span></button></div></header>
<div class="sketch-body"><div class="sketch-tools" role="toolbar" aria-label="畫布工具">${PENS.map(([c, n], i) => `<button type="button" class="sk-tool sk-color ${i === 0 ? 'selected' : ''}" data-sk="color" data-color="${c}" aria-label="${n}色筆" style="--pen:${c}"><i></i></button>`).join('')}<button type="button" class="sk-tool" data-sk="width" aria-label="筆畫粗細">${icon('pen')}<small>中</small></button><button type="button" class="sk-tool" data-sk="erase" aria-label="橡皮擦">${icon('erase')}</button><span class="sk-sep"></span><button type="button" class="sk-tool" data-sk="undo" aria-label="復原">${icon('undo')}</button><button type="button" class="sk-tool" data-sk="redo" aria-label="重做">${icon('redo')}</button><button type="button" class="sk-tool" data-sk="clear" aria-label="清空筆跡">${icon('trash')}</button>${opts.allowPhoto ? `<span class="sk-sep"></span><label class="sk-tool sk-file" aria-label="拍照作答">${icon('camera')}<small>拍照</small><input type="file" accept="image/*" capture="environment" data-sk="photo" data-testid="sketch-photo"></label><label class="sk-tool sk-file" aria-label="從相簿選照片">${icon('image')}<small>相簿</small><input type="file" accept="image/*" data-sk="photo"></label><button type="button" class="sk-tool" data-sk="unphoto" aria-label="移除照片" hidden>${icon('x')}<small>去背景</small></button>` : ''}</div>
<div class="sketch-stage"><canvas class="sketch-canvas" data-testid="sketch-canvas" aria-label="手寫作答區"></canvas></div>
<aside class="sketch-side">${opts.criteria?.length ? `<div class="sketch-criteria"><strong>${icon('target')}成功標準</strong><ul>${opts.criteria.map((c) => `<li>${md(c)}</li>`).join('')}</ul></div>` : ''}<label class="sketch-note">文字說明（選填）<textarea maxlength="1000" data-sk="text" placeholder="寫下你的想法或理由">${esc(state.text)}</textarea></label><p class="muted small-text">可以手寫，也可以寫在紙上按「拍照」，再用筆在照片上補充。</p></aside></div>`;
    document.body.append(root);
    const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
    const stage = root.querySelector<HTMLElement>('.sketch-stage')!;
    const ctx = canvas.getContext('2d')!;
    const unphoto = root.querySelector<HTMLButtonElement>('[data-sk="unphoto"]');

    function fit() {
      const box = stage.getBoundingClientRect(),
        ratio = state.width / state.height;
      let w = box.width - 16,
        h = w / ratio;
      if (h > box.height - 16) {
        h = box.height - 16;
        w = h * ratio;
      }
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${Math.max(50, w)}px`;
      canvas.style.height = `${Math.max(50, h)}px`;
      canvas.width = Math.round(Math.max(50, w) * dpr);
      canvas.height = Math.round(Math.max(50, h) * dpr);
      paint();
    }
    function paint() {
      const w = canvas.width,
        h = canvas.height;
      if (photoImage) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(photoImage, 0, 0, w, h);
      } else paper(ctx, w, h, opts.kind);
      drawStrokes(ctx, state.strokes, w, h);
      if (unphoto) unphoto.hidden = !state.photo;
    }
    const resize = new ResizeObserver(fit);
    resize.observe(stage);
    const setPhoto = async (src?: string) => {
      photoImage = src ? await loadImage(src) : null;
      fit();
    };
    if (state.photo) void setPhoto(state.photo);

    const point = (e: PointerEvent): SPoint => {
      const r = canvas.getBoundingClientRect();
      return {
        x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
        y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
      };
    };
    const snapshot = () => {
      undo.push(structuredClone(state.strokes));
      if (undo.length > 60) undo.shift();
      redo.length = 0;
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'pen') sawStylus = true;
      if (sawStylus && e.pointerType === 'touch') return; // 手掌防誤觸
      if (pointerId !== null || e.button > 0) return;
      e.preventDefault();
      pointerId = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      snapshot();
      if (tool === 'pen') {
        active = { color: pen, width: e.pointerType === 'pen' && e.pressure ? width * (0.6 + e.pressure) : width, points: [point(e)] };
        state.strokes.push(active);
      } else erase(point(e));
      paint();
    });
    const erase = (p: SPoint) => {
      const before = state.strokes.length;
      state.strokes = state.strokes.filter((s) => !s.points.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.025));
      if (before !== state.strokes.length) paint();
    };
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      if (tool === 'erase') return erase(point(e));
      if (!active) return;
      for (const ev of events) active.points.push(point(ev));
      if (active.points.length > 1500) active.points = active.points.filter((_, i) => i % 2 === 0);
      paint();
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      active = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    const close = (result: SketchState | null) => {
      resize.disconnect();
      root.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        root.querySelector<HTMLElement>(`[data-sk="${e.shiftKey ? 'redo' : 'undo'}"]`)?.click();
      }
    };
    document.addEventListener('keydown', onKey, true);
    root.addEventListener('input', (e) => {
      const t = e.target as HTMLTextAreaElement;
      if (t.dataset.sk === 'text') state.text = t.value;
    });
    root.addEventListener('change', async (e) => {
      const input = e.target as HTMLInputElement;
      if (input.dataset.sk !== 'photo' || !input.files?.[0]) return;
      try {
        const photo = await compressPhoto(input.files[0]);
        snapshot();
        state.photo = photo.dataUrl;
        state.width = photo.width;
        state.height = photo.height;
        state.strokes = [];
        await setPhoto(photo.dataUrl);
      } catch (err) {
        alert((err as Error).message);
      } finally {
        input.value = '';
      }
    });
    root.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-sk]');
      if (!b || b.tagName === 'INPUT' || b.tagName === 'TEXTAREA') return;
      const act = b.dataset.sk;
      if (act === 'cancel') return close(null);
      if (act === 'done') return close(state);
      if (act === 'color') {
        pen = b.dataset.color!;
        tool = 'pen';
      }
      if (act === 'erase') tool = tool === 'erase' ? 'pen' : 'erase';
      if (act === 'width') {
        width = width === 4 ? 8 : width === 8 ? 2.5 : 4;
        b.querySelector('small')!.textContent = width === 4 ? '中' : width === 8 ? '粗' : '細';
      }
      if (act === 'undo' && undo.length) {
        redo.push(structuredClone(state.strokes));
        state.strokes = undo.pop()!;
      }
      if (act === 'redo' && redo.length) {
        undo.push(structuredClone(state.strokes));
        state.strokes = redo.pop()!;
      }
      if (act === 'clear' && state.strokes.length) {
        snapshot();
        state.strokes = [];
      }
      if (act === 'unphoto') {
        state.photo = undefined;
        state.width = 1200;
        state.height = 900;
        void setPhoto();
      }
      root.querySelectorAll('.sk-color').forEach((x) =>
        x.classList.toggle('selected', tool === 'pen' && (x as HTMLElement).dataset.color === pen),
      );
      root.querySelector('[data-sk="erase"]')!.classList.toggle('selected', tool === 'erase');
      paint();
    });
    root.querySelector<HTMLElement>('[data-sk="done"]')!.focus();
  });
}

/* ───────────── 紅筆批註（向量疊圖，不改動原圖） ───────────── */
const RED = '#e03131';
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}
function wobblePath(points: [number, number][], amp: number, rnd: () => number) {
  return points
    .map(([x, y], i) => `${i ? 'L' : 'M'}${(x + (rnd() - 0.5) * amp).toFixed(1)} ${(y + (rnd() - 0.5) * amp).toFixed(1)}`)
    .join('');
}
function wrap(text: string, max = 11): string[] {
  const out: string[] = [];
  let line = '';
  for (const ch of text) {
    line += ch;
    if ([...line].length >= max) {
      out.push(line);
      line = '';
    }
  }
  if (line) out.push(line);
  return out.slice(0, 4);
}
/** 產生紅筆疊圖 SVG：W×H 為圖片比例座標（寬 1000）。 */
export function redpenSvg(
  annotations: Annotation[],
  grade: Pick<Grade, 'total' | 'max' | 'depth' | 'correct'> | null,
  ratio: number,
): string {
  const W = 1000,
    H = Math.round(W / ratio),
    u = W / 1000;
  const rnd = rng(7);
  const P = (x: number, y: number): [number, number] => [x * W, y * H];
  const pen = `fill="none" stroke="${RED}" stroke-width="${5 * u}" stroke-linecap="round" stroke-linejoin="round"`;
  const label = (x: number, y: number, text: string, size = 30) =>
    wrap(text)
      .map(
        (line, i) =>
          `<text x="${x}" y="${y + size + i * size * 1.25}" font-size="${size}" class="redpen-text">${esc(line)}</text>`,
      )
      .join('');
  const parts = annotations.map((a) => {
    const [x, y] = P(a.x, a.y);
    const [x2, y2] = a.x2 !== undefined && a.y2 !== undefined ? P(a.x2, a.y2) : [x + 120, y];
    switch (a.mark) {
      case 'check':
        return `<path d="${wobblePath([[x - 22, y - 2], [x - 6, y + 20], [x + 30, y - 30]], 3, rnd)}" ${pen} stroke-width="${7 * u}"/>${a.text ? label(x + 36, y - 30, a.text, 26) : ''}`;
      case 'cross':
        return `<path d="${wobblePath([[x - 20, y - 20], [x + 20, y + 20]], 3, rnd)}M${x + 20} ${y - 20}L${x - 20} ${y + 20}" ${pen} stroke-width="${7 * u}"/>${a.text ? label(x + 30, y - 24, a.text, 26) : ''}`;
      case 'question':
        return `<text x="${x}" y="${y + 20}" font-size="60" class="redpen-text redpen-mark">?</text>${a.text ? label(x + 34, y - 24, a.text, 26) : ''}`;
      case 'circle': {
        const cx = (x + x2) / 2,
          cy = (y + y2) / 2,
          rx = Math.max(20, Math.abs(x2 - x) / 2 + 10),
          ry = Math.max(16, Math.abs(y2 - y) / 2 + 10);
        const pts: [number, number][] = [];
        for (let i = 0; i <= 52; i++) {
          const t = -0.4 + (i / 48) * Math.PI * 2;
          pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
        }
        return `<path d="${wobblePath(pts, 4, rnd)}" ${pen}/>${a.text ? label(Math.min(W - 280, x2 + 12), y - 6, a.text, 26) : ''}`;
      }
      case 'underline': {
        const n = Math.max(4, Math.round(Math.hypot(x2 - x, y2 - y) / 22));
        const pts: [number, number][] = [];
        for (let i = 0; i <= n; i++) pts.push([x + ((x2 - x) * i) / n, y + ((y2 - y) * i) / n + (i % 2 ? 7 : -7)]);
        return `<path d="${wobblePath(pts, 2, rnd)}" ${pen}/>${a.text ? label(x2 + 10, y2 - 30, a.text, 26) : ''}`;
      }
      case 'arrow': {
        const mx = (x + x2) / 2 + (y2 - y) * 0.25,
          my = (y + y2) / 2 - (x2 - x) * 0.25,
          ang = Math.atan2(y2 - my, x2 - mx);
        const head = (d: number) => `${x2 - 24 * Math.cos(ang + d)} ${y2 - 24 * Math.sin(ang + d)}`;
        return `<path d="M${x} ${y}Q${mx} ${my} ${x2} ${y2}M${head(0.45)}L${x2} ${y2}L${head(-0.45)}" ${pen}/>${a.text ? label(x - 10, y - 40, a.text, 26) : ''}`;
      }
      default:
        return `${label(Math.min(x, W - 300), y, a.text || '', 28)}<circle cx="${x - 12}" cy="${y + 10}" r="5" fill="${RED}"/>`;
    }
  });
  // 第 1 層只蓋對錯章；第 2 層蓋分數章。
  const verdictStamp =
    grade?.depth === 'verdict'
      ? `<g transform="translate(${W - 110} ${Math.min(110, H * 0.18)}) rotate(-9)"><circle r="78" ${pen} stroke-width="${6 * u}"/><text y="30" font-size="96" text-anchor="middle" class="redpen-text redpen-score">${grade.correct ? '✓' : '✗'}</text></g>`
      : '';
  const stamp = verdictStamp
    ? verdictStamp
    : grade
    ? `<g transform="translate(${W - 110} ${Math.min(110, H * 0.18)}) rotate(-9)"><circle r="78" ${pen} stroke-width="${6 * u}"/><circle r="66" fill="none" stroke="${RED}" stroke-width="${2 * u}" opacity=".7"/><text y="16" font-size="52" text-anchor="middle" class="redpen-text redpen-score">${grade.total}/${grade.max}</text></g>`
    : '';
  return `<svg class="redpen" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${parts.join('')}${stamp}</svg>`;
}
/** 在容器中放入作答圖片，載入後疊上紅筆。 */
export function mountRedpen(host: HTMLElement, imageUrl: string, grade: Grade | null, annotations?: Annotation[]) {
  host.classList.add('redpen-wrap');
  host.innerHTML = `<img src="${esc(imageUrl)}" alt="學生作答圖片" loading="lazy">`;
  const img = host.querySelector('img')!;
  const draw = () => {
    host.querySelector('svg.redpen')?.remove();
    if (!grade && !annotations?.length) return;
    host.insertAdjacentHTML(
      'beforeend',
      redpenSvg(annotations || grade?.annotations || [], grade, img.naturalWidth / img.naturalHeight || 4 / 3),
    );
  };
  if (img.complete && img.naturalWidth) draw();
  else img.addEventListener('load', draw, { once: true });
}
/** 下載紅筆版 PNG：原圖逐像素不變，只在上層合成紅筆。 */
export async function downloadRedpen(imageUrl: string, grade: Grade, name: string) {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const svg = redpenSvg(grade.annotations, grade, img.naturalWidth / img.naturalHeight)
    .replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${img.naturalWidth}" height="${img.naturalHeight}" `)
    .replace(/class="redpen-text( redpen-\w+)?"/g, `fill="${RED}" stroke="#fff" stroke-width="6" paint-order="stroke" font-family="'Microsoft JhengHei','PingFang TC','Noto Sans TC',sans-serif" font-weight="700"`);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    ctx.drawImage(await loadImage(url), 0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('無法產生圖片');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
