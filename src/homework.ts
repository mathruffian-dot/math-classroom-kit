// 學習紀錄與差異化回家作業（前端）：派發視窗、A4 作業卷 PDF（zip）、學生用 QR code 上傳、AI 紅筆批改結果、老師的作業與學習紀錄頁。
import QRCode from 'qrcode';
import type {
  Annotation,
  Classroom,
  Grade,
  HomeworkMark,
  HomeworkMeta,
  HomeworkPlan,
  HomeworkSheetView,
  LearningRecords,
  RecordSource,
  SlotInfo,
} from '../shared/types';
import { api, download, escape as esc } from './api';
import { icon } from './icons';
import { md, plain } from './math';
import { mountRedpen } from './sketch';

interface Helpers {
  toast(message: string, error?: boolean): void;
  modal(title: string, body: string, size?: '' | 'wide' | 'full'): void;
  closeModal(): void;
  navigate(path: string): void;
  shell(active: string, title: string, body: string, actions?: string): void;
  classes(): Classroom[];
}
let H: Helpers;
export function initHomeworkUi(h: Helpers) {
  H = h;
}
const btn = (label: string, action: string, style = 'primary', glyph = '', attrs = '') =>
  `<button class="btn ${style}" data-action="${action}" ${attrs}>${glyph ? icon(glyph) : ''}<span>${label}</span></button>`;
const tag = (label: string, cls = '') => `<span class="tag ${cls}">${label}</span>`;
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);
const date = (iso: string) => new Date(iso).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit' });
const dateTime = (iso: string | number) => new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const figure = (svg?: string) => (svg ? `<img class="hw-figure" alt="題目附圖" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}">` : '');
export const STATUS_LABEL: Record<HomeworkSheetView['status'], string> = { assigned: '未繳交', queued: '等待批改', grading: 'AI 批改中', graded: '已批改', error: '批改失敗' };
const STATUS_CLASS: Record<HomeworkSheetView['status'], string> = { assigned: '', queued: 'amber', grading: 'amber', graded: 'green', error: 'red' };
const SOURCE_LABEL: Record<RecordSource, string> = { irs: '課堂 IRS', quiz: '課後檢核', pk: 'PK', review: '錯題練習', spaced: '間隔複習', practice: '補救練習', raid: '魔王戰', duel: '步驟格鬥', homework: '回家作業' };
const safeName = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);

/* ───────────── 派發 ───────────── */
let plan: { classId: string; lessonId: string; plan: HomeworkPlan; slots: Record<string, SlotInfo>; picked: Set<number> } | null = null;
export async function openPlan(classId: string, lessonId: string, scope: 'lesson' | 'section' = 'lesson') {
  const r = await api<{ plan: HomeworkPlan; slots: Record<string, SlotInfo> }>(`/homework/plan?classId=${encodeURIComponent(classId)}&lessonId=${encodeURIComponent(lessonId)}&scope=${scope}`);
  plan = { classId, lessonId, ...r, picked: new Set(r.plan.suggested) };
  H.modal('派發回家作業', planHtml(), 'wide');
}
function planHtml() {
  const p = plan!.plan;
  const scopes = p.lessonIds.length > 1 || plan!.plan.section
    ? `<div class="segmented hw-scope" role="group" aria-label="範圍">${btn('這一個重點', 'hw-scope', p.scope === 'lesson' ? 'selected' : '', '', `data-scope="lesson" aria-pressed="${p.scope === 'lesson'}"`)}${p.section ? btn(esc(p.section.title), 'hw-scope', p.scope === 'section' ? 'selected' : '', '', `data-scope="section" aria-pressed="${p.scope === 'section'}" data-testid="hw-scope-section"`) : ''}</div>`
    : '';
  const rows = [...p.seats]
    .sort((a, b) => (a.acc ?? 2) - (b.acc ?? 2) || a.seat - b.seat)
    .map((s) => {
      const on = plan!.picked.has(s.seat);
      const weak = s.weak.map((w) => `<span class="chip">${esc(w.topic)} ${pct(w.acc)}</span>`).join('');
      return `<tr class="${on ? 'picked' : ''}"><td><label class="check"><input type="checkbox" data-hw-seat="${s.seat}" ${on ? 'checked' : ''} aria-label="${s.seat} 號"><span>${s.seat} 號</span></label></td><td><div class="acc-bar" style="--v:${s.acc === null ? 0 : Math.round(s.acc * 100)}"><i></i><b>${pct(s.acc)}</b></div></td><td>${s.n || '—'}</td><td class="chips">${weak || (!s.n ? '<span class="muted">沒有作答紀錄</span>' : s.acc === 1 ? '<span class="muted">全部答對</span>' : '<span class="muted">錯的題目沒有對應到題型</span>')}</td></tr>`;
    })
    .join('');
  const n = plan!.picked.size;
  return `<div class="hw-plan" data-testid="hw-plan"><p class="muted">${esc(p.title)}。依課堂上的作答（IRS、課後檢核、PK、魔王戰、步驟格鬥、補救練習）算答對率，預設勾選答對率最低的 1/3；每人 10 題，從自己最需要練習的題型出題。</p>${scopes}<div class="hw-plan-tools">${btn('預設（後 1/3）', 'hw-pick', 'quiet', '', 'data-pick="suggested"')}${btn('全選', 'hw-pick', 'quiet', '', 'data-pick="all"')}${btn('清除', 'hw-pick', 'quiet', '', 'data-pick="none"')}<span class="hw-count" data-testid="hw-count">已選 ${n} 人</span></div><div class="table-wrap hw-plan-table"><table><thead><tr><th>座號</th><th>答對率</th><th>作答數</th><th>最需要練習</th></tr></thead><tbody>${rows}</tbody></table></div><div class="hw-plan-foot"><span id="hw-progress" class="muted" role="status"></span>${btn(`產生 ${n} 份作業並下載 zip`, 'hw-create', 'primary', 'download', `data-testid="hw-create" ${n ? '' : 'disabled'}`)}</div></div>`;
}
function refreshPlan() {
  const body = document.querySelector('.modal-body');
  if (body) body.innerHTML = planHtml();
}
document.addEventListener('change', (e) => {
  const box = e.target as HTMLInputElement;
  if (!plan || !box.matches?.('[data-hw-seat]')) return;
  const seat = Number(box.dataset.hwSeat);
  if (box.checked) plan.picked.add(seat);
  else plan.picked.delete(seat);
  const n = plan.picked.size;
  box.closest('tr')?.classList.toggle('picked', box.checked);
  const count = document.querySelector('[data-testid="hw-count"]');
  if (count) count.textContent = `已選 ${n} 人`;
  const create = document.querySelector<HTMLButtonElement>('[data-testid="hw-create"]');
  if (create) {
    create.disabled = !n;
    create.querySelector('span')!.textContent = `產生 ${n} 份作業並下載 zip`;
  }
});

/* ───────────── A4 作業卷 ───────────── */
const PAGE_W = 794,
  PAGE_H = 1123;
function pageShell(v: HomeworkSheetView, qr: string, first: boolean) {
  // seat 0：老師用的解答總表（沒有座號、不印 QR code）
  const key = v.seat === 0;
  return `<div class="hw-page"><header class="hw-head"><div><strong>${esc(v.title)}</strong><span>${esc(v.className)}　${key ? '' : `<b>${v.seat} 號</b>　`}${date(v.createdAt)}</span></div>${key ? '' : `<img class="hw-qr" src="${qr}" alt="">`}</header>${first && !key ? '<p class="hw-tip">每題寫出計算過程，最後答案寫在「答：」後面。寫完用手機掃右上角 QR code，把每一頁拍清楚上傳，AI 會對答案並發回紅筆批改。</p>' : ''}<div class="hw-body"></div><footer class="hw-foot"><span>${esc(v.className)}${key ? '' : `・${v.seat} 號`}</span><span class="hw-pageno"></span></footer></div>`;
}
function questionHtml(q: HomeworkSheetView['questions'][number], key = false) {
  return `<section class="hw-q"><div class="hw-q-head"><b>${q.n}.</b><div class="hw-stem">${md(q.stem)}</div></div>${figure(q.figure)}${key ? `<div class="hw-key">答：${md(q.answer || '')}<small>${md(q.solution || '')}</small></div>` : `<div class="hw-work s${q.space}"></div><div class="hw-ans">答：<span></span></div>`}</section>`;
}
/** 把題目一題一題排進 A4 頁面（放不下就換頁）。 */
async function layoutPages(host: HTMLElement, v: HomeworkSheetView, blocks: string[]) {
  const qr = await QRCode.toDataURL(v.url, { width: 220, margin: 1, errorCorrectionLevel: 'M' });
  const pages: HTMLElement[] = [];
  const newPage = () => {
    host.insertAdjacentHTML('beforeend', pageShell(v, qr, !pages.length));
    const page = host.lastElementChild as HTMLElement;
    pages.push(page);
    return page.querySelector<HTMLElement>('.hw-body')!;
  };
  let body = newPage();
  await waitImages(host);
  for (const html of blocks) {
    body.insertAdjacentHTML('beforeend', html);
    await waitImages(body);
    if (body.scrollHeight > body.clientHeight + 1 && body.children.length > 1) {
      body.lastElementChild!.remove();
      body = newPage();
      body.insertAdjacentHTML('beforeend', html);
      await waitImages(body);
    }
  }
  pages.forEach((p, i) => (p.querySelector('.hw-pageno')!.textContent = `第 ${i + 1} / ${pages.length} 頁`));
  return pages;
}
function waitImages(el: HTMLElement) {
  return Promise.all(
    [...el.querySelectorAll('img')].map((img) =>
      img.complete
        ? null
        : new Promise((r) => {
            img.addEventListener('load', r, { once: true });
            img.addEventListener('error', r, { once: true });
          }),
    ),
  );
}
async function pagesToPdf(pages: HTMLElement[]) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4', compress: true });
  for (const [i, page] of pages.entries()) {
    const canvas = await html2canvas(page, { scale: 2, backgroundColor: '#ffffff', logging: false, width: PAGE_W, height: PAGE_H, windowWidth: PAGE_W });
    if (i) pdf.addPage('a4', 'p');
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.88), 'JPEG', 0, 0, 595.28, 841.89);
  }
  return pdf.output('blob');
}
function printHost() {
  const host = document.createElement('div');
  host.className = 'hw-print';
  host.setAttribute('aria-hidden', 'true');
  document.body.append(host);
  return host;
}
/** 一位同學的作業卷 PDF。 */
export async function sheetPdf(v: HomeworkSheetView): Promise<Blob> {
  const host = printHost();
  try {
    return await pagesToPdf(await layoutPages(host, v, v.questions.map((q) => questionHtml(q))));
  } finally {
    host.remove();
  }
}
/** 全部同學的作業卷（每人一份 PDF）加上解答總表，打包成 zip 下載。 */
export async function downloadZip(sheets: HomeworkSheetView[], progress?: (text: string) => void) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const first = sheets[0];
  for (const [i, v] of sheets.entries()) {
    progress?.(`正在產生 PDF ${i + 1} / ${sheets.length}…`);
    zip.file(`${safeName(v.className)}_${String(v.seat).padStart(2, '0')}號_${safeName(v.title)}.pdf`, await sheetPdf(v));
  }
  progress?.('正在產生解答…');
  const host = printHost();
  try {
    const key = { ...first, seat: 0, url: first.url, title: `${first.title}（解答，老師用）` };
    const blocks = sheets.map((v) => `<section class="hw-q hw-key-seat"><h3>${v.seat} 號</h3><ol>${v.questions.map((q) => `<li><span class="muted">${esc(q.topic)}</span>　${md(q.answer || '')}</li>`).join('')}</ol></section>`);
    zip.file('00_解答總表（老師用）.pdf', await pagesToPdf(await layoutPages(host, key, blocks)));
  } finally {
    host.remove();
  }
  progress?.('正在打包…');
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safeName(first.className)}_${safeName(first.title)}_${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  progress?.('');
}

/* ───────────── 紅筆（照片上的對錯與評語） ───────────── */
function marksFor(marks: HomeworkMark[], photo: number): Annotation[] {
  const out: Annotation[] = [];
  marks.forEach((m, i) => {
    if (m.photo !== photo || m.x === undefined || m.y === undefined || m.correct === null) return;
    const x = Math.min(0.9, m.x), y = Math.max(0.04, m.y);
    out.push({ mark: m.correct ? 'check' : 'cross', x, y, text: '' });
    out.push({ mark: 'note', x: Math.min(0.62, x + 0.05), y: Math.max(0, y - 0.03), text: `${i + 1}. ${m.comment}` });
  });
  return out;
}
function mountPhotos(root: ParentNode, v: HomeworkSheetView, src: (photoId: string) => string) {
  root.querySelectorAll<HTMLElement>('[data-hw-photo]').forEach((host) => {
    const i = Number(host.dataset.hwPhoto);
    const photo = v.photos[i];
    if (!photo) return;
    const r = v.result;
    const stamp = r && i === 0 ? ({ total: r.score, max: r.max, depth: 'full' } as unknown as Grade) : null;
    mountRedpen(host, src(photo.id), stamp, r ? marksFor(r.items, i) : []);
  });
}
function resultHtml(v: HomeworkSheetView, teacher: boolean) {
  const r = v.result!;
  const rows = v.questions
    .map((q, i) => {
      const m = r.items[i];
      const mark = m?.correct === true ? '<span class="hw-mark ok">✓</span>' : m?.correct === false ? '<span class="hw-mark no">✗</span>' : '<span class="hw-mark unk">?</span>';
      const fix = teacher
        ? `<div class="hw-fix" role="group" aria-label="第 ${q.n} 題改判">${(['true', 'false', 'null'] as const).map((c) => `<button class="btn quiet ${String(m?.correct ?? null) === c ? 'selected' : ''}" data-action="hw-override" data-seat="${v.seat}" data-n="${q.n}" data-correct="${c}">${c === 'true' ? '✓' : c === 'false' ? '✗' : '?'}</button>`).join('')}</div>`
        : '';
      return `<li class="hw-r ${m?.correct === true ? 'ok' : m?.correct === false ? 'no' : ''}">${mark}<div><div class="hw-stem"><b>${q.n}.</b> ${md(q.stem)}</div><p class="hw-comment">${esc(m?.comment || '')}${m?.teacher ? ' <small>（老師改判）</small>' : ''}</p><p class="small-text muted">你的答案：${esc(m?.read || '（沒有讀到）')}${q.answer ? `　正確答案：${md(q.answer)}` : ''}</p>${q.solution && m?.correct !== true ? `<details><summary>看詳解</summary><p>${md(q.solution)}</p></details>` : ''}</div>${fix}</li>`;
    })
    .join('');
  return `<section class="hw-result"><div class="hw-score"><strong>${r.score}<small>/${r.max}</small></strong><p>${esc(r.feedback)}</p>${r.mode === 'mock' ? tag('示範批改', 'amber') : ''}</div><div class="hw-photos">${v.photos.map((_, i) => `<div class="hw-photo" data-hw-photo="${i}"></div>`).join('')}</div><ol class="hw-results">${rows}</ol></section>`;
}

/* ───────────── 學生：QR code 連結頁（不用登入） ───────────── */
/**
 * 打開中的作業頁（一個「實例」）。每次進入作業頁、換一份作業、離開、登入、登出都換掉：
 * 舊實例的計時器停掉、在途請求中止；晚到的回覆（成功或失敗）用 alive() 檢查後丟掉，不會畫回前一位同學的作業與照片。
 */
interface PubSheet {
  id: string;
  seat: string;
  token: string;
  view?: HomeworkSheetView;
  timer?: number;
  abort: AbortController;
  /** 學生按了「訂正後重新上傳」：下一張照片帶 restart，伺服器才清掉上一次的照片與結果。 */
  restart?: boolean;
}
let pub: PubSheet | null = null;
const pubPath = (p: { id: string; seat: string; token: string }, rest = '') => `/hw/${p.id}/${p.seat}${rest}?t=${p.token}`;
/** 這個實例還是目前畫面上的作業頁（沒有離開、沒有換人、沒有換作業）。 */
const alive = (p: PubSheet) => pub === p && location.hash.split('?')[0] === `#/hw/${p.id}/${p.seat}/${p.token}`;
/** 這個作業頁實例的請求：實例已經失效時，回覆（成功或失敗）一律丟掉，回傳 null。 */
async function pubApi(p: PubSheet, rest = '', method = 'GET', body?: unknown): Promise<HomeworkSheetView | null> {
  try {
    const r = await api<{ sheet: HomeworkSheetView }>(pubPath(p, rest), method, body, p.abort.signal);
    return alive(p) ? r.sheet : null;
  } catch (e) {
    if (alive(p)) throw e;
    return null;
  }
}
/**
 * 離開作業頁（換路由、登入、登出、登入到期時呼叫）：停計時器、中止在途請求、清掉作業狀態，
 * 並清掉已經畫出來的作業畫面（照片網址含 QR 憑證）。
 */
export function leaveStudentSheet() {
  const p = pub;
  pub = null;
  if (p) {
    clearTimeout(p.timer);
    p.abort.abort();
  }
  const app = document.querySelector<HTMLElement>('#app');
  if (app?.classList.contains('hw-student')) {
    app.querySelectorAll('img').forEach((img) => img.removeAttribute('src'));
    app.replaceChildren();
    app.className = '';
  }
}
export async function renderStudentSheet(app: HTMLElement, route: string) {
  leaveStudentSheet();
  const [, , id, seat, token] = route.split('/');
  const p: PubSheet = { id, seat, token, abort: new AbortController() };
  pub = p;
  const view = await pubApi(p);
  if (!view) return;
  p.view = view;
  drawStudentSheet(app, p);
}
function drawStudentSheet(app: HTMLElement, p: PubSheet) {
  if (!alive(p)) return;
  const v = p.view!;
  clearTimeout(p.timer);
  app.className = 'hw-student';
  let main = '';
  if (v.status === 'queued' || v.status === 'grading') {
    main = `<section class="panel hw-wait" data-testid="hw-wait"><div class="spinner" aria-hidden="true"></div><h2>${STATUS_LABEL[v.status]}…</h2><p>大約 1 分鐘，畫面會自動更新；可以先關掉，等一下再掃一次 QR code。</p></section>`;
    p.timer = window.setTimeout(() => void refreshStudent(app, p), 4000);
  } else if (v.status === 'graded' && v.result) {
    main = `${resultHtml(v, false)}${btn('訂正後重新上傳', 'hw-restart', 'secondary', 'camera')}`;
  } else {
    const thumbs = v.photos.map((ph, i) => `<figure class="hw-thumb"><img src="/api${pubPath(p, `/photos/${ph.id}`)}" alt="第 ${i + 1} 張"><figcaption>第 ${i + 1} 張</figcaption><button class="icon-btn" data-action="hw-del-photo" data-photo="${ph.id}" aria-label="刪除第 ${i + 1} 張">${icon('trash')}</button></figure>`).join('');
    main = `<section class="panel hw-upload">${v.status === 'error' ? `<p class="form-error" role="alert">${esc(v.error || '批改失敗')}</p>` : ''}<h2>拍照上傳作答紙</h2><p class="muted">每一頁都要拍，拍正、拍清楚（光線充足、不要有陰影）。</p><div class="hw-thumbs">${thumbs}</div><label class="btn secondary hw-pick-photo">${icon('camera')}<span>${v.photos.length ? '再拍一張' : '拍照／選照片'}</span><input type="file" accept="image/*" capture="environment" multiple data-hw-upload hidden data-testid="hw-upload"></label>${btn(`送出批改（${v.photos.length} 張）`, 'hw-submit', 'primary', 'check', `data-testid="hw-submit" ${v.photos.length ? '' : 'disabled'}`)}</section>`;
  }
  const qs = v.status === 'graded' ? '' : `<details class="panel hw-questions"><summary>看題目（${v.questions.length} 題）</summary><ol>${v.questions.map((q) => `<li>${md(q.stem)}${figure(q.figure)}</li>`).join('')}</ol>${btn('下載作業卷 PDF', 'hw-own-pdf', 'quiet', 'download')}</details>`;
  app.innerHTML = `<header class="hw-top"><span class="brand-mark small">${icon('sigma')}</span><div><strong>${esc(v.title)}</strong><small>${esc(v.className)}・${v.seat} 號</small></div>${tag(STATUS_LABEL[v.status], STATUS_CLASS[v.status])}</header><main class="hw-main" data-testid="hw-student">${main}${qs}</main>`;
  if (v.status === 'graded') mountPhotos(app, v, (pid) => `/api${pubPath(p, `/photos/${pid}`)}`);
}
async function refreshStudent(app: HTMLElement, p: PubSheet) {
  if (!alive(p)) return;
  const view = await pubApi(p).catch(() => null);
  if (!alive(p)) return;
  if (!view) {
    p.timer = window.setTimeout(() => void refreshStudent(app, p), 6000);
    return;
  }
  p.view = view;
  drawStudentSheet(app, p);
}
/** 作業紙照片：長邊 2000 像素的 JPEG（看得清楚手寫，又不會太大）。 */
async function compressSheetPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('請選擇圖片檔');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  let side = 2000;
  for (let attempt = 0; attempt < 4; attempt++, side = Math.round(side * 0.8)) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/jpeg', 0.8);
    if (url.length < 1_850_000) return url;
  }
  throw new Error('照片太大，請重新拍一張');
}
document.addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const p = pub;
  if (!p || !alive(p) || !input.matches?.('[data-hw-upload]') || !input.files?.length) return;
  const app = document.querySelector<HTMLElement>('#app')!;
  try {
    for (const file of [...input.files]) {
      H.toast('正在上傳照片…');
      const dataUrl = await compressSheetPhoto(file);
      if (!alive(p)) return;
      const view = await uploadBody(p, dataUrl);
      // 上傳期間離開了這一頁（換人、登出）：剩下的照片不傳、畫面不畫
      if (!view) return;
      p.view = view;
    }
    drawStudentSheet(app, p);
    H.toast('照片已上傳');
  } catch (err) {
    if (!alive(p)) return;
    H.toast((err as Error).message, true);
    drawStudentSheet(app, p);
  }
});

/* ───────────── 老師：作業清單、批改結果 ───────────── */
let detail: { meta: HomeworkMeta; sheets: HomeworkSheetView[] } | null = null;
export async function renderHomeworkList() {
  const { homework } = await api<{ homework: HomeworkMeta[] }>('/homework');
  const rows = homework
    .map((h) => {
      const all = Object.values(h.sheets);
      const graded = all.filter((s) => s.status === 'graded');
      const handed = all.filter((s) => s.status !== 'assigned').length;
      const avg = graded.length ? graded.reduce((n, s) => n + (s.score || 0) / (s.max || 10), 0) / graded.length : null;
      return `<tr><td><strong>${esc(h.title)}</strong><small>${esc(h.className)}</small></td><td>${dateTime(h.createdAt)}</td><td>${all.length} 人</td><td>${handed} / ${all.length}</td><td>${graded.length}</td><td>${pct(avg)}</td><td><div class="actions">${btn('開啟', 'hw-open', 'quiet', 'eye', `data-id="${h.id}"`)}${btn('zip', 'hw-zip', 'quiet', 'download', `data-id="${h.id}"`)}${btn('刪除', 'hw-delete', 'quiet danger', 'trash', `data-id="${h.id}"`)}</div></td></tr>`;
    })
    .join('');
  H.shell('homework', '回家作業', `<section class="panel"><div class="table-wrap"><table data-testid="hw-list"><thead><tr><th>作業與班級</th><th>派發時間</th><th>人數</th><th>已繳交</th><th>已批改</th><th>平均答對率</th><th>操作</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="empty-state">還沒有派發過作業。上課時在課堂右側按「派發作業」。</td></tr>'}</tbody></table></div></section><p class="muted small-text">學生寫完後掃作業卷右上角的 QR code 拍照上傳，AI 逐題對答案、在照片上用紅筆批改，學生立刻看得到結果；老師可以在這裡改判。</p>`);
}
export async function renderHomeworkDetail(id: string) {
  const r = await api<{ homework: HomeworkMeta; sheets: HomeworkSheetView[] }>(`/homework/${id}`);
  detail = { meta: r.homework, sheets: r.sheets };
  const rows = r.sheets
    .map((s) => `<tr><td>${s.seat} 號</td><td>${tag(STATUS_LABEL[s.status], STATUS_CLASS[s.status])}</td><td>${s.result ? `${s.result.score} / ${s.result.max}` : '—'}</td><td>${s.submittedAt ? dateTime(s.submittedAt) : '—'}</td><td class="chips">${[...new Set(s.questions.map((q) => q.topic))].map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</td><td><div class="actions">${s.photos.length ? btn('查看', 'hw-seat', 'quiet', 'eye', `data-seat="${s.seat}" data-testid="hw-seat-${s.seat}"`) : ''}${s.photos.length && s.status !== 'queued' && s.status !== 'grading' ? btn('重新批改', 'hw-regrade', 'quiet', 'stamp', `data-seat="${s.seat}"`) : ''}${btn('PDF', 'hw-seat-pdf', 'quiet', 'download', `data-seat="${s.seat}"`)}</div></td></tr>`)
    .join('');
  H.shell('homework', esc(r.homework.title), `<p class="muted">${esc(r.homework.className)}・${dateTime(r.homework.createdAt)} 派發・${r.sheets.length} 人</p><section class="panel"><div class="table-wrap"><table data-testid="hw-detail"><thead><tr><th>座號</th><th>狀態</th><th>答對</th><th>繳交時間</th><th>題型</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div></section>`, `${btn('返回', 'hw-back', 'secondary', 'back')}${btn('下載 zip', 'hw-zip', 'primary', 'download', `data-id="${id}"`)}`);
}
function seatModal(seat: number) {
  const v = detail!.sheets.find((s) => s.seat === seat)!;
  const body = v.result ? resultHtml(v, true) : `<p>${STATUS_LABEL[v.status]}${v.error ? `：${esc(v.error)}` : ''}</p><div class="hw-photos">${v.photos.map((_, i) => `<div class="hw-photo" data-hw-photo="${i}"></div>`).join('')}</div>`;
  H.modal(`${v.seat} 號・${esc(v.title)}`, `<div data-testid="hw-seat-modal">${body}</div>`, 'wide');
  mountPhotos(document.querySelector('#modal-root')!, v, (pid) => `/api/homework/${v.homeworkId}/${v.seat}/photos/${pid}`);
}

/* ───────────── 老師：學習紀錄 ───────────── */
let learning: LearningRecords | null = null;
/**
 * 學習紀錄頁。每次進頁、換班級都重新讀（作答、改判、派發隨時會變）；
 * 只有同一頁裡換課程（reuse）才沿用剛讀到的資料。點座號、下載 CSV 用的就是畫面上這一份。
 */
export async function renderLearning(classId?: string, lessonId?: string, reuse = false) {
  const classes = H.classes();
  const cid = classId || learning?.classId || classes[0]?.id;
  if (!cid) return H.shell('learning', '學習紀錄', '<section class="panel empty-state">還沒有班級。</section>');
  if (!reuse || learning?.classId !== cid) learning = await api<LearningRecords>(`/classes/${cid}/records`);
  const L = learning;
  const lessonIds = [...new Set(Object.values(L.slots).map((s) => s.lessonId))].sort();
  const lid = lessonId && lessonIds.includes(lessonId) ? lessonId : lessonIds[lessonIds.length - 1];
  const slots = Object.entries(L.slots).filter(([, s]) => s.lessonId === lid).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }));
  const cell = new Map<string, { ok: number; n: number }>();
  const seatAll = new Map<number, { ok: number; n: number; total: number }>();
  for (const r of L.records) {
    const t = seatAll.get(r.seat) || { ok: 0, n: 0, total: 0 };
    seatAll.set(r.seat, t);
    // 同一次作答對到多個題型：每個題型都算，全部的筆數與答對率只算一次
    if (!r.dup) t.total++;
    if (r.correct === null) continue;
    if (!r.dup) {
      t.n++;
      if (r.correct) t.ok++;
    }
    if (!r.slot) continue;
    const k = `${r.seat}|${r.slot}`;
    const c = cell.get(k) || { ok: 0, n: 0 };
    c.n++;
    if (r.correct) c.ok++;
    cell.set(k, c);
  }
  const head = slots.map(([k, s]) => `<th title="${esc(plain(s.objective))}｜${esc(s.performance.join('、'))}">${esc(s.topic)}<small>${esc(s.performance.join(' '))}</small></th>`).join('');
  const body = Array.from({ length: L.seats }, (_, i) => i + 1)
    .filter((seat) => seatAll.has(seat))
    .map((seat) => {
      const all = seatAll.get(seat)!;
      const tds = slots.map(([k]) => {
        const c = cell.get(`${seat}|${k}`);
        const v = c ? c.ok / c.n : null;
        return `<td class="heat" style="--v:${v === null ? -1 : Math.round(v * 100)}" title="${c ? `${c.ok}/${c.n}` : '沒有作答'}">${c ? pct(v) : ''}</td>`;
      });
      return `<tr><th><button class="link" data-action="learn-seat" data-seat="${seat}">${seat} 號</button></th><td>${pct(all.n ? all.ok / all.n : null)}<small> ${all.total} 筆</small></td>${tds.join('')}</tr>`;
    })
    .join('');
  const classSel = `<select data-learn="class" aria-label="班級">${classes.map((c) => `<option value="${c.id}" ${c.id === cid ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`;
  const lessonSel = lessonIds.length ? `<select data-learn="lesson" aria-label="課程">${lessonIds.map((id) => `<option value="${id}" ${id === lid ? 'selected' : ''}>${esc(Object.values(L.slots).find((s) => s.lessonId === id)!.lessonTitle)}</option>`).join('')}</select>` : '';
  H.shell(
    'learning',
    '學習紀錄',
    `<div class="learn-filters">${classSel}${lessonSel}<span class="muted">${L.records.filter((r) => !r.dup).length} 筆作答</span></div><section class="panel"><div class="table-wrap learn-table"><table data-testid="learn-table"><thead><tr><th>座號</th><th>全部</th>${head}</tr></thead><tbody>${body || `<tr><td colspan="${slots.length + 2}" class="empty-state">這個班級還沒有作答紀錄。</td></tr>`}</tbody></table></div></section><p class="muted small-text">每一格是該題型的答對率（IRS、課後檢核、PK、錯題練習、補救練習、魔王戰、步驟格鬥、回家作業合計）。滑到題型上看學習目標；點座號看每一筆作答。CSV 含學習目標、學習表現與學習內容代碼。</p>`,
    btn('下載 CSV', 'learn-csv', 'primary', 'download'),
  );
}
function seatRecords(seat: number) {
  const L = learning!;
  const rows = L.records
    .filter((r) => r.seat === seat)
    .reverse()
    .map((r) => {
      const s = r.slot ? L.slots[r.slot] : undefined;
      return `<tr><td>${dateTime(r.at)}</td><td>${SOURCE_LABEL[r.source]}</td><td>${esc(s?.topic || r.item)}<small>${esc(s?.lessonTitle || '')}</small></td><td><small>${esc(s?.objective || '')}</small></td><td><small>${esc([...(s?.performance || []), ...(s?.content || [])].join(' '))}</small></td><td>${r.correct === true ? '✓' : r.correct === false ? '✗' : '—'}</td></tr>`;
    })
    .join('');
  H.modal(`${seat} 號的作答紀錄`, `<div class="table-wrap"><table><thead><tr><th>時間</th><th>來源</th><th>題型</th><th>學習目標</th><th>學習表現／內容</th><th>對錯</th></tr></thead><tbody>${rows}</tbody></table></div>`, 'wide');
}
function learningCsv() {
  const L = learning!;
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['時間', '班級', '座號', '來源', '課程', '題型', '題目', '對錯', '學習目標', '學習表現', '學習表現敘述', '學習內容', '學習內容敘述'].join(',')];
  for (const r of L.records) {
    const s = r.slot ? L.slots[r.slot] : undefined;
    const perf = s?.performance || [],
      cont = s?.content || [];
    lines.push([new Date(r.at).toISOString(), L.className, r.seat, SOURCE_LABEL[r.source], s?.lessonTitle || r.lessonId, s?.topic || '', r.item, r.correct === null ? '' : r.correct ? 'Y' : 'N', s ? plain(s.objective) : '', perf.join(' '), perf.map((c) => L.codes[c] || '').join('；'), cont.join(' '), cont.map((c) => L.codes[c] || '').join('；')].map(q).join(','));
  }
  download(`學習紀錄_${safeName(L.className)}_${new Date().toISOString().slice(0, 10)}.csv`, `﻿${lines.join('\n')}`, 'text/csv;charset=utf-8');
}
document.addEventListener('change', (e) => {
  const sel = e.target as HTMLSelectElement;
  if (!sel.matches?.('[data-learn]')) return;
  if (sel.dataset.learn === 'class') {
    learning = null;
    void renderLearning(sel.value).catch((err) => H.toast(err.message, true));
  } else void renderLearning(learning?.classId, sel.value, true).catch((err) => H.toast(err.message, true));
});

/* ───────────── 按鈕 ───────────── */
/** 這個模組的按鈕；不是的話回傳 false。 */
export async function homeworkAction(el: HTMLElement): Promise<boolean> {
  const act = el.dataset.action;
  switch (act) {
    case 'hw-scope':
      await openPlan(plan!.classId, plan!.lessonId, el.dataset.scope as 'lesson' | 'section');
      return true;
    case 'hw-pick': {
      const p = plan!;
      p.picked = new Set(el.dataset.pick === 'all' ? p.plan.seats.map((s) => s.seat) : el.dataset.pick === 'none' ? [] : p.plan.suggested);
      refreshPlan();
      return true;
    }
    case 'hw-create': {
      const p = plan!;
      const progress = (t: string) => {
        const el = document.querySelector('#hw-progress');
        if (el) el.textContent = t;
      };
      progress('正在出題…');
      const r = await api<{ homework: HomeworkMeta; sheets: HomeworkSheetView[] }>('/homework', 'POST', { classId: p.classId, lessonId: p.lessonId, scope: p.plan.scope, seats: [...p.picked] });
      await downloadZip(r.sheets, progress);
      H.closeModal();
      H.toast(`已派發 ${r.sheets.length} 份作業；到「作業」頁看繳交與批改`);
      return true;
    }
    case 'hw-open':
      H.navigate(`/homework/${el.dataset.id}`);
      return true;
    case 'hw-back':
      H.navigate('/homework');
      return true;
    case 'hw-zip': {
      const r = await api<{ sheets: HomeworkSheetView[] }>(`/homework/${el.dataset.id}`);
      await downloadZip(r.sheets, (t) => t && H.toast(t));
      return true;
    }
    case 'hw-delete':
      H.modal('刪除這份作業？', `<p>每位同學的作業卷、上傳的照片與批改結果都會刪除，學生的 QR code 也會失效。</p>${btn('確認刪除', 'hw-delete-ok', 'danger-fill', 'trash', `data-id="${el.dataset.id}"`)}`);
      return true;
    case 'hw-delete-ok':
      await api(`/homework/${el.dataset.id}`, 'DELETE');
      H.closeModal();
      H.toast('作業已刪除');
      await renderHomeworkList();
      return true;
    case 'hw-seat':
      seatModal(Number(el.dataset.seat));
      return true;
    case 'hw-seat-pdf': {
      const v = detail!.sheets.find((s) => s.seat === Number(el.dataset.seat))!;
      const blob = await sheetPdf({ ...v, questions: v.questions.map(({ answer: _a, solution: _s, ...q }) => q) });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${safeName(v.className)}_${v.seat}號_${safeName(v.title)}.pdf`;
      a.click();
      return true;
    }
    case 'hw-regrade': {
      const seat = Number(el.dataset.seat);
      await api(`/homework/${detail!.meta.id}/${seat}/regrade`, 'POST', {});
      H.toast('已重新排入批改');
      await renderHomeworkDetail(detail!.meta.id);
      return true;
    }
    case 'hw-override': {
      const seat = Number(el.dataset.seat),
        n = Number(el.dataset.n);
      const correct = el.dataset.correct === 'true' ? true : el.dataset.correct === 'false' ? false : null;
      const r = await api<{ sheet: HomeworkSheetView }>(`/homework/${detail!.meta.id}/${seat}/items/${n}`, 'PUT', { correct });
      detail!.sheets = detail!.sheets.map((s) => (s.seat === seat ? r.sheet : s));
      seatModal(seat);
      return true;
    }
    case 'learn-seat':
      seatRecords(Number(el.dataset.seat));
      return true;
    case 'learn-csv':
      learningCsv();
      return true;
    // 學生頁
    case 'hw-submit':
    case 'hw-del-photo': {
      const p = pub;
      if (!p || !alive(p)) return true;
      const view = act === 'hw-submit' ? await pubApi(p, '/submit', 'POST', {}) : await pubApi(p, `/photos/${el.dataset.photo}`, 'DELETE', {});
      if (!view) return true;
      p.view = view;
      drawStudentSheet(document.querySelector('#app')!, p);
      return true;
    }
    case 'hw-restart': {
      const p = pub;
      if (!p?.view || !alive(p)) return true;
      p.view = { ...p.view, status: 'assigned', photos: [], result: undefined };
      p.restart = true;
      drawStudentSheet(document.querySelector('#app')!, p);
      return true;
    }
    case 'hw-own-pdf': {
      const p = pub;
      if (!p?.view || !alive(p)) return true;
      const v = p.view;
      const blob = await sheetPdf(v);
      if (!alive(p)) return true;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${safeName(v.title)}_${v.seat}號.pdf`;
      a.click();
      return true;
    }
  }
  return false;
}
/** 上傳一張照片；實例失效（離開、換人）時回傳 null。 */
async function uploadBody(p: PubSheet, dataUrl: string) {
  const view = await pubApi(p, '/photos', 'POST', { dataUrl, ...(p.restart ? { restart: true } : {}) });
  // 上傳成功、伺服器換掉舊照片後才清旗標；失敗時下一張照片仍帶 restart
  if (view) p.restart = false;
  return view;
}
/** 學生登入後的作業清單（等待室與課堂上都看得到）。 */
export async function studentHomeworkHtml(): Promise<string> {
  const r = await api<{ homework: { id: string; title: string; createdAt: string; status: HomeworkSheetView['status']; score?: number; max?: number; url: string }[] }>('/student/homework').catch(() => ({ homework: [] }));
  if (!r.homework.length) return '';
  return `<section class="panel hw-mine" data-testid="hw-mine"><h2>${icon('pen')}回家作業</h2><ul>${r.homework.map((h) => `<li><a href="${esc(new URL(h.url).hash)}"><strong>${esc(h.title)}</strong><small>${date(h.createdAt)}</small></a>${tag(h.score !== undefined ? `${h.score}/${h.max}` : STATUS_LABEL[h.status], STATUS_CLASS[h.status])}</li>`).join('')}</ul></section>`;
}
