import './styles.css';
import { api, download, escape as esc, serverTime, syncClock } from './api';
import { practiceStatus, practiceTotal, type PracticeStatus } from '../shared/practice';
import { botScore, decide, matchOver, quizDeadline, quizOver } from '../shared/quiz';
import { playCorrect, unlockSound } from './sound';
import { HandPad } from './handpad';
import { clearDanmakuLayer, syncDanmaku } from './danmaku';
import { icon } from './icons';
import { Whiteboard, type Tool } from './board';
import { mountInteractive, fmt, type InteractiveController } from './interactive';
import {
  emptySketch,
  openSketch,
  renderSketch,
  sketchHasContent,
  mountRedpen,
  downloadRedpen,
  compressPhoto,
  type SketchState,
} from './sketch';
import type {
  PkLobby,
  PkMatch,
  QuizScore,
  QuizView,
  AppConfig,
  AiSettings,
  StorageUsageInfo,
  User,
  Dashboard,
  Lesson,
  Slide,
  SessionView,
  Activity,
  Answer,
  Grade,
  CanvasAnswer,
  Classroom,
  TextMark,
} from '../shared/types';
import { parseNumberAnswer, type Vars } from '../shared/expr';
import { md, plain, answerHtml } from './math';
import QRCode from 'qrcode';

const app = document.querySelector<HTMLDivElement>('#app')!;
const BRAND = '數感課堂';
let config: AppConfig = { mode: 'demo', aiConfigured: false, version: '0.2.0' };
let user: User | null = null,
  dashboard: Dashboard | null = null,
  view: SessionView | null = null;
let board: Whiteboard | null = null,
  poll: ReturnType<typeof setTimeout> | undefined;
let currentTool: Tool = 'cursor',
  color = '#e5484d',
  draft: unknown = [],
  editing = false,
  studentSlide = 0,
  studentTab: 'slide' | 'answer' = 'slide',
  drawFilter: 'all' | 'unanswered' | 'correct' | 'incorrect' = 'all';
let pollBusy = false,
  routeVersion = 0,
  formBusy = false;
let currentRoute = '',
  modalReturnFocus: HTMLElement | null = null;
let viz: InteractiveController | null = null;
let lastNumericInput: HTMLInputElement | null = null;
document.addEventListener('focusin', (e) => {
  const el = e.target as HTMLElement;
  if (el instanceof HTMLInputElement && el.classList.contains('numeric-input')) {
    lastNumericInput = el;
    if (!el.disabled) openKeypad(el);
  } else if (!el.closest('#keypad')) closeKeypad();
});
// 點在鍵盤與答案框以外的地方：收起鍵盤
document.addEventListener('pointerdown', (e) => {
  const el = e.target as Element;
  if (!el.closest('#keypad') && !el.closest('.numeric-input')) closeKeypad();
}, true);
addEventListener('resize', () => placeKeypad());
document.addEventListener('scroll', () => placeKeypad(), true);
const vizState = new Map<string, Vars>();
const sketches = new Map<string, SketchState>();
const sketchPreview = new Map<string, string>();
let touchTap: {
  el: HTMLElement;
  x: number;
  y: number;
  pointerId: number;
  handled: boolean;
  fallback: boolean;
  at: number;
} | null = null;
const pendingPrefix = 'mathkit.pending.';
const prefs = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(`mathkit.pref.${key}`);
      return v === null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(`mathkit.pref.${key}`, JSON.stringify(value));
    } catch {}
  },
};
const TYPE_LABEL: Record<Activity['type'], string> = {
  single: '單選',
  multiple: '多選',
  scale: '自評量尺',
  short: '短答',
  numeric: '數值填答',
  canvas: '手寫／拍照',
  manipulate: '操作題',
};
const btn = (label: string, action: string, style = 'primary', glyph = '', attrs = '') =>
  `<button class="btn ${style}" data-action="${action}" ${attrs}>${glyph ? icon(glyph) : ''}<span>${label}</span></button>`;
const tag = (label: string, cls = '') => `<span class="tag ${cls}">${label}</span>`;
function toast(message: string, error = false) {
  const el = document.querySelector<HTMLElement>('#toast')!;
  el.textContent = message;
  el.className = `visible${error ? ' error' : ''}`;
  clearTimeout((toast as unknown as { t?: number }).t);
  (toast as unknown as { t?: number }).t = window.setTimeout(() => (el.className = ''), 4400);
}
function modal(title: string, body: string, size: '' | 'wide' | 'full' = '') {
  modalReturnFocus = document.activeElement as HTMLElement;
  document.querySelector('#modal-root')!.innerHTML =
    `<div class="modal-backdrop"><section class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><h2 id="modal-title">${title}</h2>${btn('關閉', 'close-modal', 'icon-btn', 'close', 'aria-label="關閉對話框"')}</header><div class="modal-body">${body}</div></section></div>`;
  document.querySelector<HTMLElement>('.modal input, .modal textarea, .modal select, .modal button')?.focus();
}
function closeModal() {
  document.querySelector('#modal-root')!.innerHTML = '';
  modalReturnFocus?.focus();
}
function navigate(path: string) {
  if (location.hash === `#${path}`) void renderRoute();
  else location.hash = path;
}
function brand(small = false) {
  return `<a class="brand ${small ? 'small' : ''}" href="#/dashboard"><span class="brand-mark">${icon('sigma')}</span><span class="brand-name">${BRAND}<small>MATH CLASSROOM KIT</small></span></a>`;
}
function modeBadge() {
  const label =
    config.mode === 'demo' ? '本機示範' : config.mode === 'cloudflare' ? 'Cloudflare 私人課堂' : 'Supabase 私人課堂';
  return `<span class="mode-badge ${config.mode}"><i></i>${label}</span>`;
}

/* ───────────── 教師工作空間 ───────────── */
const NAV: [string, string, string][] = [
  ['dashboard', 'grid', '課程'],
  ['generate', 'wand', 'AI 草稿'],
  ['classes', 'users', '班級'],
  ['records', 'chart', '紀錄'],
  ['settings', 'settings', '設定'],
];
function shell(active: string, title: string, body: string, actions = '') {
  app.className = 'workspace';
  app.innerHTML = `<aside class="sidebar">${brand()}<nav>${NAV.map(([id, glyph, label]) => `<a href="#/${id}" class="nav-item ${active === id ? 'active' : ''}" ${active === id ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span></a>`).join('')}</nav><div class="sidebar-user"><span class="avatar">師</span><span class="sidebar-user-name"><strong>${esc(user?.name || '')}</strong><small>教師</small></span><button class="icon-btn" data-action="logout" aria-label="登出" title="登出">${icon('logout')}</button></div></aside><main class="workspace-main"><header class="workspace-top"><h1>${title}</h1><div class="top-actions">${actions}${modeBadge()}</div></header><div class="workspace-content">${body}</div></main>`;
}
function landing(role = 'teacher') {
  app.className = 'landing';
  const demo = config.mode === 'demo';
  const teacherFields = `<label>帳號<input name="account" autocomplete="username" required value="${demo ? esc(config.teacherHint || '') : ''}" placeholder="${config.mode === 'supabase' ? 'teacher@example.edu' : '你的 Cloudflare 帳號信箱'}"></label><label>密碼<input name="password" type="password" autocomplete="current-password" required ${demo ? 'value="11235813"' : ''}></label>`;
  const studentFields = `<label>班級代碼<input name="classCode" autocomplete="off" value="${demo ? 'DEMO801' : ''}" required placeholder="由老師提供"></label><div class="field-row"><label>座號<input name="seat" type="number" inputmode="numeric" min="1" max="100" value="1" required></label><label>識別碼<input name="code" autocomplete="off" autocapitalize="characters" value="" placeholder="老師有要求才填"></label></div>`;
  app.innerHTML = `<section class="landing-art" aria-hidden="true"><div class="landing-brand">${brand()}</div><div class="hero-graph"><svg viewBox="0 0 400 300"><defs><pattern id="g" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#ffffff1c"/></pattern></defs><rect width="400" height="300" fill="url(#g)"/><rect x="60" y="70" width="150" height="150" fill="#7b61ff55" stroke="#b9a9ff" stroke-width="2"/><rect x="210" y="70" width="60" height="150" fill="#2f80ed55" stroke="#8fc0ff" stroke-width="2"/><rect x="60" y="220" width="150" height="60" fill="#2f80ed55" stroke="#8fc0ff" stroke-width="2"/><rect x="210" y="220" width="60" height="60" fill="#ff8a3d66" stroke="#ffc08f" stroke-width="2"/><text x="135" y="152" fill="#fff" font-size="26" text-anchor="middle">a²</text><text x="240" y="152" fill="#fff" font-size="20" text-anchor="middle">ab</text><text x="135" y="256" fill="#fff" font-size="20" text-anchor="middle">ab</text><text x="240" y="256" fill="#fff" font-size="20" text-anchor="middle">b²</text><circle cx="270" cy="70" r="9" fill="#ffc93c"/></svg></div><h1>看得見的數學，<br><span>摸得到的思考。</span></h1><p>拖拉滑桿、切開圖形、逐頁提問；學生手寫或拍照作答，依評量規準即時批改與紅筆回饋。</p><ul class="hero-points"><li>${icon('sliders')}可操作視覺化</li><li>${icon('chart')}每頁 IRS</li><li>${icon('stamp')}規準批改</li></ul></section><section class="login-card"><h2>進入課堂</h2><div class="segmented" role="group" aria-label="登入身分"><button class="${role === 'teacher' ? 'selected' : ''}" data-action="login-tab" data-role="teacher" aria-pressed="${role === 'teacher'}">${icon('book')}教師</button><button class="${role === 'student' ? 'selected' : ''}" data-action="login-tab" data-role="student" aria-pressed="${role === 'student'}">${icon('users')}學生</button></div><form id="login-form" data-role="${role}">${role === 'teacher' ? teacherFields : studentFields}<button type="submit" class="btn primary full">${icon('arrow')}<span>登入</span></button><p id="login-error" class="form-error" role="alert"></p></form><p class="login-foot">${icon('shield')}${demo ? (role === 'teacher' ? `示範帳號 ${esc(config.teacherHint || 'teacher')}・預設密碼 11235813` : '示範班 DEMO801・座號 1–40（老師開啟識別碼時：DEMO01–DEMO40）') : role === 'teacher' ? '首次登入使用部署時設定的帳號與預設密碼，登入後請立即修改。' : '班級代碼、座號由老師提供；老師開啟驗證時才需要識別碼。'}</p></section>`;
}
async function loadDashboard() {
  dashboard = await api<Dashboard>('/dashboard');
  return dashboard;
}
function lessonThumb(l: Lesson) {
  const phases = l.slides.map((s) => s.phase).filter(Boolean);
  const viz = l.slides.filter((s) => s.interactive).length;
  return `<div class="course-thumb"><span>${esc(l.subject || '數學')}</span><strong>${l.slides.length}<small>頁</small></strong><em>${viz} 個可操作圖・${l.slides.filter((s) => s.activity).length} 題 IRS</em>${phases.length ? `<div class="phase-strip">${phases
    .slice(0, 10)
    .map((p) => `<i title="${esc(p)}"></i>`)
    .join('')}</div>` : ''}</div>`;
}
function renderDashboard() {
  const d = dashboard!;
  const active = d.sessions.filter((s) => !s.ended);
  const body = `${active.length ? `<section class="active-sessions"><span class="live-dot"></span><strong>進行中的課堂</strong>${active.slice(0, 3).map((s) => btn(`${esc(s.className)}・${esc(s.title)}`, 'resume', 'secondary', 'play', `data-id="${esc(s.id)}"`)).join('')}</section>` : ''}<div class="course-grid">${d.lessons
    .map(
      (l) =>
        `<article class="course-card" data-testid="lesson-card">${lessonThumb(l)}<div class="course-details">${d.catalog?.includes(l.id) ? tag(`${icon('book')}專案教材`, 'green') : ''}<h3>${md(l.title)}</h3><p>${md(l.description)}</p><div class="course-meta">${icon('clock')}${l.duration} 分鐘</div><div class="course-actions">${btn('開始上課', 'start', 'primary', 'play', `data-id="${esc(l.id)}"`)}${btn('編輯', 'edit', 'secondary', 'pen', `data-id="${esc(l.id)}"`)}</div></div></article>`,
    )
    .join(
      '',
    )}<div class="new-course-card">${icon('book')}<strong>新教材請由 agent 在專案裡製作</strong><span>在 content/lessons/ 新增 JSON（見 docs/AUTHORING.md），執行 npm run lessons 驗證後啟動或部署，就會出現在這裡並標示「專案教材」。</span>${btn('AI 快速草稿（實驗）', 'go-generate', 'quiet', 'wand')}</div></div>`;
  shell(
    'dashboard',
    '我的課程',
    body,
    `${btn('匯入 JSON', 'import', 'secondary', 'upload', 'data-testid="import-lesson"')}${btn('新增課程', 'new-lesson', 'primary', 'plus')}`,
  );
}
function renderClasses() {
  shell(
    'classes',
    '班級與學生',
    `<p class="page-description">學生以班級代碼、座號登入，不需要姓名；每個班級可另外開啟「個人識別碼」驗證。</p><div class="class-grid">${dashboard!.classes.map((c) => `<article class="class-card"><h2>${esc(c.name)}</h2><p>${c.seats} 位學生</p><code class="class-code">${esc(c.code)}</code><label class="switch"><input type="checkbox" data-require-code="${esc(c.id)}" ${c.requireCode ? 'checked' : ''} data-testid="toggle-require-code"><span></span>學生登入需要個人識別碼</label><p class="muted small-text">${c.requireCode ? (config.mode === 'demo' && c.code === 'DEMO801' ? '示範識別碼：DEMO01–DEMO40' : '個人識別碼只在建立時提供一次，請妥善保存。') : '目前停用（測試用）：知道班級代碼的人都能用任一座號登入。正式上課前請開啟。'}</p><div class="actions">${btn('學生入口', 'join-code', 'secondary', 'users', `data-code="${esc(c.code)}"`)}${btn('重發識別碼', 'reset-code', 'quiet', 'shield', `data-id="${esc(c.id)}" data-seats="${c.seats}"`)}</div></article>`).join('') || '<p class="empty-state">還沒有班級。</p>'}</div>`,
    btn('建立班級', 'new-class', 'primary', 'plus'),
  );
}
function renderRecords() {
  const rows = dashboard!.sessions;
  shell(
    'records',
    '課堂紀錄',
    `<section class="panel"><div class="table-wrap"><table><thead><tr><th>課程與班級</th><th>時間</th><th>狀態</th><th>操作</th></tr></thead><tbody>${rows.map((s) => `<tr><td><strong>${esc(s.title)}</strong><small>${esc(s.className)}</small></td><td>${new Date(s.createdAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td>${tag(s.ended ? '已結束' : '進行中', s.ended ? '' : 'green')}</td><td><div class="actions">${btn('開啟', 'resume', 'quiet', 'eye', `data-id="${s.id}"`)}${btn('CSV', 'export-session', 'quiet', 'download', `data-id="${s.id}"`)}${btn('刪除', 'delete-session', 'quiet danger', 'trash', `data-id="${s.id}"`)}</div></td></tr>`).join('') || '<tr><td colspan="4" class="empty-state">還沒有課堂紀錄。</td></tr>'}</tbody></table></div></section><p class="muted small-text">備份含每一次送出的作答、批改分數、「原題再做一次」與彈幕紀錄；不含作答照片與任何金鑰。CSV 每一次送出一列（attempt＝第幾次）。</p>`,
    `${btn('還原備份', 'restore', 'secondary', 'upload')}${btn('下載備份', 'backup', 'primary', 'download')}`,
  );
}
function bytesText(n: number): string {
  return n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
}
function meter(used: number, limit: number): string {
  const pct = Math.min(100, (used / limit) * 100);
  return `<div class="usage-meter ${pct >= 80 ? 'warn' : ''}"><span style="width:${Math.max(pct, 0.5).toFixed(1)}%"></span></div>`;
}
/** 免費額度：儲存 5 GB、每天寫入 10 萬列；超過 80% 變色提醒。 */
function usagePanel(u: StorageUsageInfo | null): string {
  if (!u?.available)
    return `<section class="panel settings-panel"><h2>${icon('screen')}儲存空間</h2><p class="muted">這個部署模式沒有用量資料。</p></section>`;
  const total = u.dataBytes + u.photoBytes;
  return `<section class="panel settings-panel" id="usage-panel"><h2>${icon('screen')}儲存空間（Cloudflare 免費額度）</h2><dl class="setting-list"><div><dt>課堂資料</dt><dd>${bytesText(u.dataBytes)}・${u.sessions} 堂（封存 ${u.archived}）</dd></div><div><dt>作答照片</dt><dd>${u.photos} 張・約 ${bytesText(u.photoBytes)}</dd></div></dl><p class="usage-label">合計 ${bytesText(total)} / 5 GB</p>${meter(total, u.limits.storageBytes)}<p class="usage-label">今天寫入約 ${u.rowsToday.toLocaleString()} / ${u.limits.rowsPerDay.toLocaleString()} 列</p>${meter(u.rowsToday, u.limits.rowsPerDay)}<p class="muted small-text">結束超過 1 小時的課堂會自動封存，只在打開時讀取。照片最占空間：清除舊照片後，辨識稿、分數與圈記號都還在（備份本來就不含照片）。</p><div class="actions"><label class="inline-field">清除<select id="prune-days">${[30, 60, 90, 180].map((d) => `<option value="${d}" ${d === 90 ? 'selected' : ''}>${d} 天前</option>`).join('')}</select>的照片</label>${btn('清除', 'prune-photos', 'quiet danger', 'trash')}</div></section>`;
}
async function renderSettings() {
  let ai: AiSettings | null = null,
    usage: StorageUsageInfo | null = null;
  try {
    [ai, usage] = await Promise.all([
      api<AiSettings>('/settings/ai'),
      api<StorageUsageInfo>('/settings/usage').catch(() => null),
    ]);
  } catch {}
  const providers: [string, string][] = [
    ['openai', 'OpenAI（預設 gpt-6-luna）'],
    ['gemini', 'Google Gemini'],
    ['anthropic', 'Anthropic Claude'],
    ['custom', '其他 OpenAI 相容 API'],
  ];
  const votes = prefs.get<number>('votes', 1),
    concurrency = prefs.get<number>('concurrency', 10);
  shell(
    'settings',
    '設定',
    `<div class="settings-grid"><section class="panel settings-panel"><h2>${icon('key')}AI 批改與轉課程</h2><p class="muted">API key 只存在伺服器端（Cloudflare Durable Object），不會傳到學生裝置、不進備份。</p><form id="ai-form"><label>供應商<select name="provider">${providers.map(([v, n]) => `<option value="${v}" ${ai?.provider === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label><label>API 網址<input name="baseUrl" value="${esc(ai?.baseUrl || '')}" required></label><label>模型名稱<input name="model" value="${esc(ai?.model || '')}" required placeholder="需支援讀圖（vision）"></label><label>API key<input name="apiKey" type="password" autocomplete="off" placeholder="${ai?.keyHint ? `已設定 ${esc(ai.keyHint)}，留空則不變更` : '貼上你的 API key'}"></label><label>每日呼叫上限<input name="dailyLimit" type="number" min="1" max="5000" value="${ai?.dailyLimit || 200}"></label><p class="setting-status">${ai?.configured ? tag(`已啟用・${ai.source === 'env' ? '部署環境變數' : '教師設定'}・今日已用 ${ai.usedToday} 次`, 'green') : tag('尚未設定：批改與轉課程會使用模擬結果', 'warn')}</p><div class="actions"><button type="submit" class="btn primary">${icon('save')}<span>儲存 AI 設定</span></button>${ai?.configured ? btn('測試 AI 連線', 'test-ai', 'secondary', 'spark', 'data-testid="test-ai"') : ''}${ai?.source === 'teacher' ? btn('移除金鑰', 'clear-ai', 'quiet danger', 'trash') : ''}</div><p id="ai-test-result" class="small-text" role="status"></p>${ai?.lastError ? `<p class="setting-error" data-testid="ai-last-error">${icon('x')}最近一次 AI 失敗（${new Date(ai.lastError.at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}）：${esc(ai.lastError.message)}</p>` : ''}</form></section><section class="panel settings-panel"><h2>${icon('stamp')}批改節奏</h2><label>同時批改份數<select id="pref-concurrency">${[2, 4, 6, 8, 10, 16].map((n) => `<option ${n === concurrency ? 'selected' : ''}>${n}</option>`).join('')}</select></label><label>每份投票次數<select id="pref-votes"><option value="1" ${votes === 1 ? 'selected' : ''}>1 次（最快）</option><option value="3" ${votes === 3 ? 'selected' : ''}>3 次取共識（較準、費用 ×3）</option></select></label><p class="muted small-text">快速批改（拍照作答依辨識稿、只送文字）每份約 3–8 秒，一班 32 份同時 10 份約半分鐘；看圖＋紅筆的完整批改每份約 15–40 秒。實際速度視模型與供應商速率限制。信心低於 0.7 或多次投票不一致的作答會標示「需覆核」。</p></section><section class="panel settings-panel"><h2>${icon('shield')}教師密碼</h2>${config.mode === 'supabase' ? '<p>Supabase 模式請在 Supabase Auth 修改密碼。</p>' : `<form id="password-form"><label>目前密碼<input name="current" type="password" autocomplete="current-password" required></label><label>新密碼（至少 8 字元）<input name="next" type="password" autocomplete="new-password" minlength="8" required></label><button type="submit" class="btn primary">${icon('save')}<span>修改密碼</span></button></form>`}</section><section class="panel settings-panel"><h2>${icon('screen')}部署資訊</h2><dl class="setting-list"><div><dt>模式</dt><dd>${modeBadge()}</dd></div><div><dt>教師帳號</dt><dd>${esc(user?.name || '')}</dd></div><div><dt>課堂同步</dt><dd>即時連線（WebSocket），中斷時自動改用輪詢備援</dd></div><div><dt>版本</dt><dd>${esc(config.version)}</dd></div></dl></section>${usagePanel(usage)}</div>`,
  );
}
const NEW_LESSON = (): Lesson => ({
  schemaVersion: 1,
  id: `lesson-${crypto.randomUUID().slice(0, 8)}`,
  title: '我的新課程',
  description: '在這裡寫下課程簡介。',
  subject: '數學',
  duration: 45,
  objectives: ['填入學習目標'],
  slides: [
    {
      id: 'explore',
      phase: '具體操作',
      eyebrow: '01 / 動手做',
      title: '拖拉滑桿，觀察變化',
      body: '填入本頁重點（建議 60 字內）。',
      interactive: {
        view: { xMin: -1, xMax: 11, yMin: -1, yMax: 11, grid: 1, aspect: 'equal' },
        params: [{ id: 'a', label: '邊長 a', min: 1, max: 10, step: 1, value: 4 }],
        shapes: [
          { type: 'rect', x: 0, y: 0, w: 'a', h: 'a', fill: 'rgba(123,97,255,.25)', color: '#7b61ff' },
          { type: 'text', x: 'a/2', y: 'a/2', text: '面積 {a^2}' },
        ],
        readouts: [{ label: '面積 a²', expr: 'a^2' }],
      },
      activity: {
        id: 'explore-q',
        type: 'numeric',
        prompt: '邊長 7 的正方形面積是多少？',
        answer: '49',
      },
    },
  ],
});
function editLesson(lesson: Lesson) {
  shell(
    'dashboard',
    '編輯教材',
    `${dashboard?.catalog?.includes(lesson.id) ? `<div class="soft-notice">${icon('book')}<p><strong>這是專案教材</strong>（content/lessons）。在這裡修改只存在網站；專案檔案更新並部署後會被覆蓋。要長期保留請 agent 改專案檔，或匯出後改 ID 另存。</p></div>` : ''}<div class="editor-grid"><section class="panel editor-main"><div class="editor-head"><label>課程名稱<input id="lesson-title" value="${esc(lesson.title)}" maxlength="200"></label></div><textarea id="lesson-json" class="code-editor" spellcheck="false" aria-label="課程內容 JSON">${esc(JSON.stringify(lesson, null, 2))}</textarea><p class="muted small-text">格式見 docs/AUTHORING.md。保留 schemaVersion 與穩定 ID；畫布題必須附 rubric。</p></section><section class="panel editor-preview"><div class="editor-preview-bar"><select id="preview-slide" aria-label="預覽頁面">${lesson.slides.map((s, i) => `<option value="${i}">${i + 1}. ${esc(plain(s.title))}</option>`).join('')}</select>${btn('更新預覽', 'preview-lesson', 'secondary', 'eye')}</div><div id="preview-stage" class="preview-stage"></div></section></div>`,
    `${btn('返回', 'dashboard', 'quiet', 'back')}${btn('AI 檢查', 'review-lesson', 'secondary', 'spark', `data-id="${esc(lesson.id)}"`)}${btn('匯出', 'export-lesson', 'secondary', 'download', `data-id="${esc(lesson.id)}"`)}${btn('儲存', 'save-lesson', 'primary', 'save', 'data-testid="save-lesson"')}`,
  );
  previewSlide(lesson, 0);
}
let previewViz: InteractiveController | null = null;
function previewSlide(lesson: Lesson, index: number) {
  const host = document.querySelector<HTMLElement>('#preview-stage');
  if (!host) return;
  previewViz?.destroy();
  previewViz = null;
  const slide = lesson.slides[index];
  if (!slide) return;
  host.innerHTML = `<article class="slide-stage preview">${slideMarkup(slide, index, lesson.slides.length)}</article>${slide.activity ? `<div class="preview-activity">${tag(TYPE_LABEL[slide.activity.type])}<strong>${md(slide.activity.prompt)}</strong>${slide.activity.items ? `<ol>${slide.activity.items.map((it) => `<li>${md(it.prompt)} ＝ ${answerHtml(it.answer)}</li>`).join('')}</ol>` : ''}${slide.activity.rubric ? `<ul>${slide.activity.rubric.criteria.map((c) => `<li>${md(c.label)}（${c.points} 分）</li>`).join('')}</ul>` : ''}</div>` : '<p class="form-error">這一頁沒有 IRS 提問。</p>'}`;
  const v = host.querySelector<HTMLElement>('.viz-host');
  if (v && slide.interactive) previewViz = mountInteractive(v, slide.interactive, undefined, () => {});
}
function renderGenerate() {
  shell(
    'generate',
    'AI 快速草稿（實驗）',
    `<div class="soft-notice">${icon('book')}<p><strong>正式教材請由 agent 在專案裡製作與修改</strong>（content/lessons/*.json，可對照課本原頁並執行 npm run lessons 驗證）。這裡只產生快速草稿，存在網站上，不會回寫到專案。</p></div><div class="generate-grid"><section class="panel"><form id="generate-form"><div class="field-row"><label>年級與單元<input name="topic" required placeholder="例如：八上 1-1 乘法公式・和的平方"></label><label>課本頁碼<input name="pages" placeholder="例如：p.12–13"></label><label>時間（分鐘）<input name="duration" type="number" min="10" max="180" value="45"></label></div><label>教材文字（可貼課本、備課用書或自己的教案）<textarea name="text" rows="8" placeholder="貼上本節重點、例題、隨堂練習…"></textarea></label><label>課本頁面照片（最多 4 張）<input name="images" type="file" accept="image/*" multiple></label><label>給 AI 的期待（選填）<input name="wishes" placeholder="例如：多用拖曳點、加一題拍照作答的錯誤分析"></label><button type="submit" class="btn primary full">${icon('wand')}<span>轉成課程草稿</span></button></form></section><section class="panel generate-help"><h2>轉換時遵循的認知科學流程</h2><ol class="phase-list"><li><b>提取練習</b>先想起舊知識</li><li><b>預測</b>先猜再驗證，誘發迷思</li><li><b>具體操作</b>拖拉滑桿、切開圖形（CRA）</li><li><b>圖式連結</b>同色對應圖與式（雙重編碼）</li><li><b>工作範例</b>逐步揭示完整解法</li><li><b>半完成範例</b>只留關鍵步驟（褪除）</li><li><b>錯誤分析</b>手寫／拍照＋評量規準</li><li><b>交錯練習・出場券・自評</b></li></ol><p class="muted small-text">每頁都會配一題對應該頁的 IRS；手寫與短答題附評量規準與參考解答。產出是草稿，請核對教材後再上課。</p><div id="generate-result"></div></section></div>`,
  );
}

/* ───────────── 課堂 ───────────── */
function visual(slide: Slide) {
  const a = slide.activity;
  // 有選擇題時，左邊的卡片就是右邊的選項（同樣的 A、B、C…），不會兩邊不一樣
  if (a && (a.type === 'single' || a.type === 'multiple') && a.options?.length && slide.visual !== 'steps' && slide.visual !== 'bars')
    return `<div class="visual cards">${a.options.map((o, i) => `<div class="idea-card tone-${i % 4}"><span>${String.fromCharCode(65 + i)}</span><strong>${md(o)}</strong></div>`).join('')}</div>`;
  // 自評量表：和學生的按鈕一樣是 1–5 級，兩端寫出說明
  if (a?.type === 'scale') {
    const min = a.min ?? 1,
      max = a.max ?? 5;
    return `<div class="visual scale-strip">${Array.from({ length: max - min + 1 }, (_, i) => i + min).map((n) => `<div class="scale-card"><strong>${n}</strong>${n === min && a.minLabel ? `<small>${esc(a.minLabel)}</small>` : n === max && a.maxLabel ? `<small>${esc(a.maxLabel)}</small>` : ''}</div>`).join('')}</div>`;
  }
  const items = slide.bullets?.length ? slide.bullets : [];
  if (slide.visual === 'steps')
    return `<div class="visual steps">${items.map((x, i) => `<div class="step-card"><span>${i + 1}</span><strong>${md(x)}</strong></div>`).join('')}</div>`;
  if (slide.visual === 'bars')
    return `<div class="visual bars">${items.map((x, i) => `<div class="bar-row"><span>${md(x)}</span><i style="width:${30 + i * 15}%"></i></div>`).join('')}</div>`;
  return `<div class="visual cards">${items.map((x, i) => `<div class="idea-card tone-${i % 4}"><span>${String.fromCharCode(65 + i)}</span><strong>${md(x)}</strong></div>`).join('')}</div>`;
}
// 動畫卡：放在課本截圖那一排，點一下用大視窗播放（靜音動畫，老師邊播邊講）
function animationHtml(slide: Slide) {
  const a = slide.animation;
  if (!a) return '';
  const len = a.seconds ? `<span class="anim-len">${Math.round(a.seconds)} 秒</span>` : '';
  if (a.locked || !a.src)
    return `<figure class="anim-card locked" data-testid="animation-locked"><div class="anim-thumb" title="老師公布結果後可以看動畫"><span class="anim-lock">${icon('clock')}<span>公布後可看</span></span></div><figcaption>${md(a.caption)}</figcaption></figure>`;
  const poster = a.poster ? `<img src="/api/assets/lessons/${esc(a.poster)}" alt="" loading="lazy">` : '';
  return `<figure class="anim-card"><button type="button" class="anim-thumb" data-action="play-animation" data-src="${esc(a.src)}" data-poster="${esc(a.poster || '')}" data-caption="${esc(a.caption)}" aria-label="播放動畫：${esc(a.caption)}" data-testid="play-animation">${poster}<span class="anim-play">${icon('play')}</span>${len}</button><figcaption>${md(a.caption)}</figcaption></figure>`;
}
// 授課畫面裡放大課本截圖：疊在投影片區內、白板畫布之下，畫筆、雷射、聚光、翻頁、IRS 都照常可用。
// 放大時的筆跡另存在「頁ID--fig序號」，縮小後不會蓋到原本的版面。
// 動畫也一樣在投影片區內播放（index = -1），暫停後可以直接在畫面上畫，筆跡存在「頁ID--anim」。
let figZoom: { slideId: string; index: number } | null = null;
const boardKey = (slideId: string) =>
  figZoom?.slideId === slideId ? `${slideId}--${figZoom.index < 0 ? 'anim' : `fig${figZoom.index}`}` : slideId;
function figureFocusHtml(slide: Slide) {
  const close = (label: string) =>
    btn('縮小', 'close-figure', 'secondary fig-focus-close', 'close', `data-testid="close-figure" title="${label}（Esc）"`);
  if (figZoom?.index === -1) {
    const a = slide.animation;
    if (!a?.src) return '';
    const poster = a.poster ? ` poster="/api/assets/lessons/${esc(a.poster)}"` : '';
    return `<div class="fig-focus anim-focus" data-testid="animation-focus"><figure><video class="anim-player" src="/api/assets/lessons/${esc(a.src)}"${poster} controls autoplay muted playsinline preload="auto" data-testid="animation-player"></video><figcaption>🎬 ${md(a.caption)}</figcaption></figure></div>${close('關閉動畫')}`;
  }
  const f = figZoom && slide.figures?.[figZoom.index];
  if (!f) return '';
  return `<div class="fig-focus" data-testid="figure-focus"><figure><img src="/api/assets/lessons/${esc(f.src)}" alt="${esc(f.alt)}"><figcaption>${esc(f.alt)}</figcaption></figure></div>${close('縮小課本截圖')}`;
}
function figuresHtml(slide: Slide) {
  if (!slide.figures?.length && !slide.animation) return '';
  return `<div class="textbook-figs">${animationHtml(slide)}${(slide.figures || [])
    .map(
      (f, i) =>
        `<figure class="textbook-fig"><button type="button" data-action="zoom-figure" data-index="${i}" data-src="${esc(f.src)}" data-alt="${esc(f.alt)}" aria-label="放大課本截圖：${esc(f.alt)}"><img src="/api/assets/lessons/${esc(f.src)}" alt="${esc(f.alt)}" loading="lazy"></button>${f.caption ? `<figcaption>${md(f.caption)}</figcaption>` : ''}</figure>`,
    )
    .join('')}</div>`;
}
function slideMarkup(slide: Slide, index: number, total: number) {
  const figs = !!(slide.figures?.length || slide.animation);
  // 標了 visual 的選擇／自評題：卡片由選項產生（不需要 bullets）
  const optionCards = !!slide.visual && ['single', 'multiple', 'scale'].includes(slide.activity?.type || '');
  const hasVisual = slide.interactive || slide.customHtml || slide.bullets?.length || optionCards || figs;
  return `<div class="slide-head"><p class="slide-eyebrow">${slide.phase ? `<span class="phase-chip">${esc(slide.phase)}</span>` : ''}<span>${esc(slide.eyebrow || `${index + 1} / ${total}`)}</span></p><h1>${md(slide.title)}</h1>${slide.body ? `<p class="slide-body">${md(slide.body)}</p>` : ''}</div>${hasVisual ? `<div class="slide-visual ${figs ? 'with-figure' : ''} ${figs && !slide.interactive && !slide.customHtml ? 'figure-only' : ''}">${figuresHtml(slide)}${slide.customHtml ? '<iframe id="custom-activity" class="custom-activity" title="自訂互動教材" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>' : slide.interactive ? '<div class="viz-host"></div>' : figs ? '' : visual(slide)}</div>` : ''}${slide.source ? `<p class="slide-source">${icon('book')}${esc(slide.source)}</p>` : ''}`;
}
function latestBySeat(v: SessionView, activityId: string): Answer[] {
  const map = new Map<number, Answer>();
  for (const a of v.answers) if (a.activityId === activityId) map.set(a.seat, a);
  return [...map.values()].sort((a, b) => a.seat - b.seat);
}
/** 拍照交的作答（畫布題或可拍照的數值題）。 */
function isPhotoValue(value: Answer['value']): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value) && 'imageId' in value;
}
/** 要 AI 批改的作答：畫布／短答全部；可拍照的數值題只有拍照交的（直接送答案的由系統判對錯）。 */
function workAnswers(v: SessionView, a: Activity): Answer[] {
  const list = latestBySeat(v, a.id);
  return a.type === 'numeric' ? list.filter((x) => isPhotoValue(x.value)) : list;
}
function gradeFor(answerId: string): Grade | undefined {
  return view?.grades.find((g) => g.answerId === answerId);
}
function answerText(value: Answer['value']): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value))
    return value
      .map((x) => (typeof x === 'number' ? String.fromCharCode(65 + x) : x))
      .join(typeof value[0] === 'number' ? '、' : '｜');
  if ('vars' in value) return Object.entries(value.vars).map(([k, n]) => `${k}=${fmt(n)}`).join('，');
  return (value as CanvasAnswer).text || '';
}
/** 送出的答案用課本樣式顯示：算式排版、選項字母、操作數值。 */
function answerDisplay(value: Answer['value']): string {
  if (typeof value === 'string') return answerHtml(value);
  if (Array.isArray(value) && typeof value[0] === 'string')
    return (value as string[]).map((x, i) => `(${i + 1}) ${answerHtml(x)}`).join('　');
  return esc(answerText(value));
}
/** 輸入框下方的即時預覽：讓學生確認系統讀到的算式。 */
function previewHtml(value: string): string {
  if (!value.trim()) return '';
  const html = answerHtml(value);
  return html === esc(value) ? '<span class="muted">還看不懂這個算式</span>' : `<span class="muted">系統讀到：</span>${html}`;
}
function aggregateHtml(v: SessionView) {
  const a = v.lesson.slides[v.session.slideIndex]?.activity;
  if (!a) return '';
  const teacher = user?.role === 'teacher';
  if (!v.session.resultsVisible && !teacher) return `<p class="muted">結果由老師決定何時公布。</p>`;
  const total = v.aggregate.submitted;
  const correctLine =
    v.aggregate.correct !== undefined
      ? `<div class="correct-rate"><strong>${v.aggregate.correct}</strong><span>/ ${total} 答對</span><i style="--p:${total ? Math.round((v.aggregate.correct / total) * 100) : 0}%"></i></div>`
      : '';
  const bars = (rows: { label: string; value: number; ok?: boolean; html?: string }[]) =>
    `<div class="result-bars">${rows
      .map((r) => {
        const percent = total ? Math.round((r.value / total) * 100) : 0;
        return `<div class="result-row ${r.ok ? 'ok' : ''}"><div><span>${r.ok ? icon('check') : ''}${r.html ?? esc(r.label)}</span><strong>${r.value}<small> ${percent}%</small></strong></div><div class="bar-track"><span style="width:${percent}%"></span></div></div>`;
      })
      .join('')}</div>`;
  const reveal = teacher || v.session.resultsVisible;
  let body = '';
  if (a.type === 'single' || a.type === 'multiple')
    body = bars(a.options!.map((o, i) => ({ label: o, html: `${String.fromCharCode(65 + i)}. ${md(o)}`, value: v.aggregate.counts[String(i)] || 0, ok: reveal && a.correct?.includes(i) })));
  else if (a.type === 'scale')
    body = bars(Array.from({ length: (a.max || 5) - (a.min || 1) + 1 }, (_, i) => ({ label: String(i + (a.min || 1)), value: v.aggregate.counts[String(i + (a.min || 1))] || 0 })));
  else if (a.type === 'numeric' && a.items)
    body = `${correctLine}<p class="mini-label">各小題答對人數</p>${bars(a.items.map((it, i) => ({ label: it.prompt, html: `(${i + 1}) ${md(it.prompt)}`, value: v.aggregate.counts[`item${i}`] || 0, ok: true })))}`;
  else if (a.type === 'numeric') {
    const rows = Object.entries(v.aggregate.counts)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label: label.replace(/^-/, '−'), html: label.includes('未化簡') ? `${answerHtml(label.replace('（未化簡）', ''))}（未化簡）` : answerHtml(label), value, ok: a.answer !== undefined && !label.includes('未化簡') && Math.abs(Number(label) - evalSafe(a.answer)) < 1e-6 }));
    body = `${correctLine}${rows.length ? `<p class="mini-label">最多人的答案</p>${bars(rows)}` : ''}`;
  } else if (a.type === 'manipulate')
    body = `${correctLine}${bars([{ label: '達成條件', value: v.aggregate.counts.correct || 0, ok: true }, { label: '尚未達成', value: v.aggregate.counts.incorrect || 0 }])}`;
  else if (a.type === 'short' || a.type === 'canvas')
    body = `<div class="response-total">${total}<span>份作答已收到</span></div>`;
  const explanation = v.session.resultsVisible && a.explanation ? `<p class="explanation">${icon('spark')}<span>${md(a.explanation)}</span></p>` : '';
  return `${body}${explanation}`;
}
function evalSafe(src: string) {
  try {
    return parseNumberAnswer(src);
  } catch {
    return NaN;
  }
}
function currentStudentAnswer(a: Activity) {
  const mine = view?.answers.filter((x) => x.userId === user?.id && x.activityId === a.id) || [];
  return mine[mine.length - 1];
}
function canvasValuePreview(value: Answer['value']) {
  const v = value as CanvasAnswer;
  return `${v.imageId ? `<img class="answer-thumb" src="/api/images/${esc(v.imageId)}" alt="我送出的作答">` : ''}${v.work ? `<div class="work-lines small">${workHtml(v.work)}</div>` : ''}${v.text ? `<p class="answer-note">${md(v.text)}</p>` : ''}`;
}
/* ───────────── 拍照作答：照片 → AI 辨識稿 → 學生確認（可修改）→ 送出 ───────────── */
/** 一行計算過程：以 = 分段，每段能解析成算式就用課本樣式顯示，其他照原文字。[圖：…] 是圖的描述。 */
/** 一段算式：以 = 分段，每段能解析就排成課本樣式（分數、根號、次方），不能解析的照原文字。 */
function mathRunHtml(run: string) {
  return run
    .split(/[=＝]/)
    .map((part) => (part.trim() ? answerHtml(part.trim()) : ''))
    .join(' <span class="work-eq">=</span> ');
}
/** 中文和算式混在一起的一段文字：中文照常顯示，夾在中間的算式片段排版。 */
const CJK_RUN = /([　-〿一-鿿，。：；！？「」、…]+)/;
function mixedHtml(text: string) {
  return text
    .split(CJK_RUN)
    .map((part, i) => {
      if (i % 2) return esc(part);
      // 英文單字（API、key…）照原文；sin、cos、tan 和單一字母的變數才當算式排版
      const words = (part.match(/[A-Za-z]{2,}/g) || []).filter((w) => !/^(sin|cos|tan)$/i.test(w));
      if (!/[0-9A-Za-z√]/.test(part) || words.length) return esc(part);
      return `${/^\s/.test(part) ? ' ' : ''}${mathRunHtml(part)}${/\s$/.test(part) ? ' ' : ''}`;
    })
    .join('');
}
function workLineHtml(line: string, marks: TextMark[] = []) {
  const t = line.trim();
  if (/^\[.*\]$/.test(t)) return `<span class="work-figure">${esc(t)}</span>`;
  const err = marks.filter((m) => m.kind === 'error');
  const note = (m: TextMark) => (m.note ? `<span class="mark-note">${mixedHtml(m.note)}</span>` : '');
  let html = '';
  // 有 quote 的錯誤：只圈那一段（取第一個有對到原文的）
  const hit = err.find((m) => m.quote && t.includes(m.quote));
  if (hit) {
    const at = t.indexOf(hit.quote!);
    html = `${mixedHtml(t.slice(0, at))}<span class="mark-circle" data-testid="mark-circle">${mixedHtml(hit.quote!)}</span>${mixedHtml(t.slice(at + hit.quote!.length))}${note(hit)}`;
    for (const m of err) if (m !== hit) html += note(m);
  } else if (err.length) html = `<span class="mark-circle line" data-testid="mark-circle">${mixedHtml(t)}</span>${err.map(note).join('')}`;
  else html = mixedHtml(t);
  if (marks.some((m) => m.kind === 'ok') && !err.length) html += '<span class="mark-ok" aria-label="正確">✓</span>';
  return html;
}
/** 辨識稿（學生確認過的文字）：每行排版；有批改批註時把錯的地方圈起來、對的打勾、漏掉的步驟補一行提示。 */
function workHtml(work: string, marks: TextMark[] = []) {
  return work
    .split('\n')
    .filter((l) => l.trim())
    .map((l, i) => {
      const mine = marks.filter((m) => m.line === i + 1);
      const missing = mine.filter((m) => m.kind === 'missing').map((m) => `<p class="mark-missing">⌃ 少了：${mixedHtml(m.note || '一個步驟')}</p>`).join('');
      return `<p class="${mine.some((m) => m.kind === 'error') ? 'has-error' : ''}">${workLineHtml(l, mine)}</p>${missing}`;
    })
    .join('');
}
let photoDraft: {
  activityId: string;
  imageId: string;
  preview: string;
  status: 'reading' | 'ready' | 'error';
  work: string;
  ocr: string;
  message?: string;
} | null = null;
async function photoWork(a: Activity, file: File) {
  if (!view) return;
  if (a.type !== 'canvas' && !a.photoWork) return startSketch(a, file);
  const p = await compressPhoto(file);
  const draft = { activityId: a.id, imageId: '', preview: p.dataUrl, status: 'reading' as const, work: '', ocr: '' };
  photoDraft = draft;
  renderPhotoReview(a);
  try {
    draft.imageId = (await api<{ imageId: string }>(`/sessions/${view.session.id}/images`, 'POST', { dataUrl: p.dataUrl })).imageId;
    renderPhotoReview(a);
    const mock = (window as unknown as { __mckWorkMock?: string }).__mckWorkMock;
    const r = await api<{ work: string }>(`/sessions/${view.session.id}/ocr-work`, 'POST', {
      imageId: draft.imageId,
      activityId: a.id,
      ...(mock !== undefined ? { mockText: mock } : {}),
    });
    if (photoDraft !== draft) return; // 已經重拍或取消
    Object.assign(draft, { work: r.work, ocr: r.work, status: 'ready' });
  } catch (e) {
    if (photoDraft !== draft) return;
    Object.assign(draft, { status: 'error', message: (e as Error).message });
  }
  renderPhotoReview(a);
}
function renderPhotoReview(a: Activity) {
  const host = document.querySelector('#student-answer');
  if (host) host.innerHTML = answerForm(a);
}
function photoReviewHtml(a: Activity) {
  const d = photoDraft!;
  const reading = d.status === 'reading';
  const note =
    d.status === 'reading'
      ? `<p class="work-status">${icon('spark')}AI 正在辨識你的計算過程…（約 5–15 秒）</p>`
      : d.status === 'error'
        ? `<p class="work-status warn">${esc(d.message || '辨識失敗')}　可以自己打字補上，或直接送出照片。</p>`
        : `<p class="work-status ok">${icon('check')}請核對：AI 讀到的和你寫的一樣嗎？讀錯的地方直接修改，再按送出。</p>`;
  return `<section class="photo-review" data-testid="photo-review"><div class="photo-review-grid"><figure><img src="${d.preview}" alt="我拍的作答"></figure><div class="work-edit"><label for="work-text">辨識稿（一行一個步驟）</label><textarea id="work-text" rows="6" ${reading ? 'disabled' : ''} placeholder="${reading ? '辨識中…' : '一行寫一個步驟'}">${esc(d.work)}</textarea><div class="work-lines" id="work-preview" aria-live="polite">${workHtml(d.work)}</div></div></div>${note}<div class="tool-row"><label class="btn secondary">${icon('camera')}<span>重拍</span><input type="file" accept="image/*" capture="environment" data-action-input="quick-photo"></label>${btn('送出照片與辨識稿', 'submit-photo-work', 'primary', 'check', `data-testid="submit-photo-work" ${reading || !d.imageId ? 'disabled' : ''}`)}${btn('取消', 'cancel-photo-work', 'quiet', 'x')}</div>${criteriaHint(a)}</section>`;
}
/** 可拍照的數值題：另一種交法，拍課本上的計算過程（AI 讀答案並依會考標準給分）。 */
function photoOption(a: Activity, locked: boolean) {
  if (!a.photoWork || !view?.session.photoOpen) return ''; // 老師按「派發拍照題」才出現
  const which = a.items && a.photoWork.items && a.photoWork.items.length < a.items.length ? `第 ${a.photoWork.items.map((i) => `(${i + 1})`).join('')} 題` : '這題';
  return `<div class="photo-alt" data-testid="photo-alt"><span class="or-line">或</span><label class="btn secondary full photo-quick ${locked ? 'disabled' : ''}">${icon('camera')}<span>拍照交計算過程（AI 批改）</span><input type="file" accept="image/*" capture="environment" data-action-input="quick-photo" data-testid="photo-alt-input" ${locked ? 'disabled' : ''}></label><p class="muted small-text">把課本上${which}的計算過程拍下來，AI 讀出答案並依會考標準給 0–3 分。</p></div>`;
}
function answerForm(a: Activity) {
  const answered = currentStudentAnswer(a),
    over = timeUp(),
    open = view!.session.activityOpen && !view!.session.ended && !over,
    locked = (answered && !editing) || !open;
  const dis = locked ? 'disabled' : '';
  let fields = '';
  if (a.type === 'single' || a.type === 'multiple') {
    const chosen = (i: number) => draft === i || (Array.isArray(draft) && draft.includes(i));
    fields = `<div class="answer-options">${a.options!.map((o, i) => `<button class="answer-option ${chosen(i) ? 'chosen' : ''}" data-testid="poll-option-${i}" data-action="choose" data-index="${i}" aria-pressed="${chosen(i)}" ${dis}><span class="option-letter">${String.fromCharCode(65 + i)}</span><span>${md(o)}</span></button>`).join('')}</div>${a.type === 'multiple' ? '<p class="muted small-text">可以選多個。</p>' : ''}`;
  }
  if (a.type === 'scale')
    fields = `<div class="scale-options">${Array.from({ length: (a.max || 5) - (a.min || 1) + 1 }, (_, i) => i + (a.min || 1)).map((n) => `<button class="scale-option ${draft === n ? 'chosen' : ''}" data-action="scale" data-value="${n}" aria-pressed="${draft === n}" ${dis}>${n}</button>`).join('')}</div><div class="scale-labels"><span>${esc(a.minLabel)}</span><span>${esc(a.maxLabel)}</span></div>`;
  if (a.type === 'short')
    fields = `<label class="sr-only" for="short-answer">你的回答</label><textarea id="short-answer" maxlength="1000" placeholder="我認為……，因為……" ${dis}>${typeof draft === 'string' ? esc(draft) : ''}</textarea>${a.rubric ? criteriaHint(a) : ''}`;
  if (a.type === 'numeric' && a.items) {
    const values = Array.isArray(draft) ? (draft as string[]) : [];
    fields = `<ol class="numeric-items">${a.items.map((it, i) => `<li><label for="numeric-item-${i}">${md(it.prompt)}</label><div class="numeric-field"><input id="numeric-item-${i}" data-item="${i}" class="numeric-input" inputmode="${numericInputMode()}" autocomplete="off" placeholder="答案" value="${esc(values[i] ?? '')}" ${dis}>${a.unit ? `<span>${esc(a.unit)}</span>` : ''}</div><div class="tex-preview" data-preview="numeric-item-${i}" aria-live="polite">${previewHtml(values[i] ?? '')}</div></li>`).join('')}</ol>${a.form === 'simplest-radical' ? '<p class="muted small-text">答案請化成最簡根式，例如 2√3、√6/3。</p>' : ''}${photoOption(a, !!locked)}`;
  } else if (a.type === 'numeric')
    fields = `<div class="numeric-field"><input id="numeric-answer" class="numeric-input" inputmode="${numericInputMode()}" autocomplete="off" placeholder="輸入數字、分數或算式" value="${typeof draft === 'string' ? esc(draft) : ''}" ${dis} aria-label="數值答案">${a.unit ? `<span>${esc(a.unit)}</span>` : ''}</div><div class="tex-preview" data-preview="numeric-answer" aria-live="polite">${previewHtml(typeof draft === 'string' ? draft : '')}</div>${photoOption(a, !!locked)}`;
  if (a.type === 'manipulate') {
    const vars = viz?.vars() || vizState.get(view!.lesson.slides[view!.session.slideIndex].id) || {};
    const keys = a.record?.length ? a.record : Object.keys(vars).filter((k) => k !== 'step');
    fields = `<div class="manip-state">${icon('sliders')}<span>先在左邊的圖上操作，再送出目前的狀態。</span><code id="manip-vars">${keys.map((k) => `${esc(k)} = ${fmt(vars[k])}`).join('　')}</code></div>`;
  }
  if ((a.type === 'canvas' || a.photoWork) && photoDraft?.activityId === a.id && (!answered || editing) && open)
    return `<div class="activity-prompt"><span class="tag">${TYPE_LABEL[a.type]}</span>${view!.session.activityDeadline ? `<span class="time-chip">剩 ${countdown(view!.session.activityDeadline)}</span>` : ''}<h2>${md(a.prompt)}</h2></div>${photoReviewHtml(a)}`;
  if (a.type === 'canvas') {
    const sk = sketches.get(a.id);
    const preview = sketchPreview.get(a.id);
    fields = `${criteriaHint(a)}<button type="button" class="canvas-launch ${preview ? 'has-preview' : ''}" data-action="open-sketch" data-testid="open-sketch" ${dis}>${preview ? `<img src="${preview}" alt="畫布預覽">` : `<span>${icon('pen')}<strong>開啟畫布作答</strong><small>手寫、作圖${a.allowPhoto !== false ? '，或寫在紙上拍照' : ''}</small></span>`}</button>${sk?.text ? `<p class="answer-note">${esc(sk.text)}</p>` : ''}${a.allowPhoto !== false ? `<label class="btn secondary full photo-quick ${locked ? 'disabled' : ''}">${icon('camera')}<span>直接拍照作答</span><input type="file" accept="image/*" capture="environment" data-action-input="quick-photo" ${dis}></label>` : ''}`;
  }
  const saved = answered
    ? `<div class="saved-answer">${icon('check')}<div><strong>已送出</strong>${a.type === 'canvas' || isPhotoValue(answered.value) ? canvasValuePreview(answered.value) : `<span>${answerDisplay(answered.value)}</span>`}</div>${open && !editing ? `<button class="text-button" data-action="edit-answer">修改</button>` : ''}</div>`
    : '';
  const submit = (!answered || editing) ? btn(over ? '時間到' : open ? (a.type === 'manipulate' ? '送出我的操作' : '送出答案') : '等待老師開放', 'submit-answer', 'primary full', 'check', `data-testid="submit-answer" ${!open ? 'disabled' : ''}`) : '';
  const keys = a.type === 'numeric' && (!answered || editing); // 作答鍵盤浮在答案框下方（#keypad），這裡只留送出鈕
  const deadline = view!.session.activityOpen && view!.session.activityDeadline;
  const timer = over ? '<span class="time-chip up" data-testid="student-time-up">時間到，作答已鎖定</span>' : deadline ? `<span class="time-chip">剩 ${countdown(deadline)}</span>` : '';
  return `<div class="activity-prompt"><span class="tag">${TYPE_LABEL[a.type]}</span>${timer}<h2>${md(a.prompt)}</h2></div>${saved}${(!answered || editing) ? fields : ''}<div class="answer-dock ${keys ? 'with-keys' : ''}"><div class="submit-area">${submit}<p id="answer-status" role="status" class="muted small-text">${answered && !editing ? '' : open ? '' : '可以先操作與思考。'}</p></div></div>`;
}
// 作答鍵盤：數字＋運算＋√／分數／括號，觸控裝置不跳出系統鍵盤（不用切換）。
// √ 會插入 √( )、游標在括號裡；打完數字按 ＋ − ÷ 或 √ 會自動跳出根號。
const MATH_KEYS: [string, string, string][] = [
  ['7', '7', 'num'], ['8', '8', 'num'], ['9', '9', 'num'], ['√', '√', 'op'], ['⌫', 'back', 'op'],
  ['4', '4', 'num'], ['5', '5', 'num'], ['6', '6', 'num'], ['分數', 'frac', 'op'], ['( )', 'paren', 'op'],
  ['1', '1', 'num'], ['2', '2', 'num'], ['3', '3', 'num'], ['＋', '+', 'op'], ['−', '-', 'op'],
  ['0', '0', 'num'], ['.', '.', 'num'], ['◀', 'left', 'move'], ['▶', 'right', 'move'], ['⌨', 'keyboard', 'move'],
];
const KEY_LABEL: Record<string, string> = { back: '刪除', frac: '分數', paren: '括號', left: '游標左移', right: '游標右移', keyboard: '切換系統鍵盤' };
function systemKeyboard() {
  try {
    return localStorage.getItem('mck-syskb') === '1';
  } catch {
    return false;
  }
}
function numericInputMode() {
  return matchMedia('(pointer: coarse)').matches && !systemKeyboard() ? 'none' : 'text';
}
function mathKeys(dis: string) {
  return `<div class="math-keys" aria-label="作答鍵盤">${MATH_KEYS.map(([label, key, kind]) => `<button type="button" class="key-${kind}" data-action="math-key" data-key="${key}" ${KEY_LABEL[key] ? `aria-label="${KEY_LABEL[key]}"` : ''} ${dis}>${label}</button>`).join('')}</div><p class="muted small-text key-hint">√ 會自動加括號；按 ▶ 跳出括號、從分子到分母。</p>`;
}
/**
 * 浮動作答鍵盤：點答案框時出現在答案框正下方（題目有好幾格時放在最後一格下面，不會蓋住任何一格），
 * 下方放不下就放在上方；不用再捲到面板底部找鍵盤。標題列有「下一格」「送出」「收起」。
 */
function keypadHtml() {
  const mode = keypadMode();
  const tab = (m: 'keys' | 'hand', label: string) => `<button type="button" data-action="keypad-mode" data-mode="${m}" data-testid="keypad-mode-${m}" aria-pressed="${mode === m}">${label}</button>`;
  return `<div class="keypad" id="keypad" data-testid="keypad" data-mode="${mode}" hidden><div class="keypad-head"><div class="keypad-mode" role="group" aria-label="輸入方式">${tab('keys', '鍵盤')}${tab('hand', '手寫')}</div><span class="keypad-timer" id="keypad-timer" data-testid="keypad-timer"></span>${btn('下一格', 'keypad-next', 'quiet', 'next', 'data-testid="keypad-next"')}${btn('送出', 'keypad-submit', 'primary', 'check', 'data-testid="keypad-submit"')}${btn('', 'keypad-close', 'icon-btn', 'x', 'aria-label="收起鍵盤"')}</div><div class="keypad-keys">${mathKeys('')}</div><div class="keypad-hand"><canvas class="hand-pad" data-testid="hand-pad" aria-label="手寫答案區"></canvas><div class="hand-bar"><span id="hand-status" class="muted small-text" aria-live="polite">${HAND_HINT}</span>${btn('清除', 'hand-clear', 'quiet', 'erase', 'data-testid="hand-clear"')}${btn('辨識', 'hand-read', 'secondary', 'spark', 'data-testid="hand-read"')}</div></div></div>`;
}
let keypadFor: HTMLInputElement | null = null;
/* 手寫模式：寫完停筆約 1 秒自動辨識，結果填進答案框（下方「系統讀到」可再確認），不對就清除重寫或改用鍵盤 */
const HAND_HINT = '用手指或 Apple Pencil 寫一個答案，停筆後自動辨識';
let hand: HandPad | null = null,
  handBusy = false;
function keypadMode(): 'keys' | 'hand' {
  return prefs.get<string>('keypadMode', 'keys') === 'hand' ? 'hand' : 'keys';
}
function handStatus(html: string, cls = '') {
  const el = document.querySelector<HTMLElement>('#hand-status');
  if (!el) return;
  el.className = `small-text ${cls || 'muted'}`;
  el.innerHTML = html;
}
function mountHandPad() {
  hand?.destroy();
  hand = null;
  const canvas = document.querySelector<HTMLCanvasElement>('#keypad .hand-pad');
  if (canvas) hand = new HandPad(canvas, () => void recognizeHand());
}
async function recognizeHand() {
  const input = keypadFor;
  if (!hand || hand.empty || !input || !view) return;
  if (handBusy) return;
  handBusy = true;
  const version = hand.version;
  handStatus('辨識中…');
  try {
    const r = await api<{ text: string; ok: boolean; message?: string }>(`/sessions/${view.session.id}/ocr`, 'POST', {
      dataUrl: hand.toDataUrl(),
      ...((window as unknown as { __mckOcrMock?: string }).__mckOcrMock !== undefined ? { mockText: (window as unknown as { __mckOcrMock?: string }).__mckOcrMock } : {}),
    });
    if (keypadFor !== input) return; // 已經換到別格
    if (r.ok) {
      input.value = r.text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      handStatus(`讀到 ${answerHtml(r.text)}　對了按「送出」，不對就「清除」重寫`, 'hand-ok');
    } else handStatus(esc(r.message || '看不清楚，請再寫一次'), 'hand-warn');
  } catch (e) {
    handStatus(esc((e as Error).message), 'hand-warn');
  } finally {
    handBusy = false;
  }
  // 辨識期間又多寫了筆畫：再辨識一次
  if (hand && hand.version !== version && keypadFor === input) void recognizeHand();
}
function keypadInputs() {
  return [...document.querySelectorAll<HTMLInputElement>('#student-answer .numeric-input:not([disabled])')];
}
function openKeypad(input: HTMLInputElement) {
  const kp = document.querySelector<HTMLElement>('#keypad');
  if (!kp || user?.role !== 'student') return;
  if (keypadFor !== input && hand) {
    hand.clear(); // 換格就清空手寫板
    handStatus(HAND_HINT);
  }
  keypadFor = input;
  kp.hidden = false;
  kp.querySelector<HTMLElement>('[data-action="keypad-next"]')!.hidden = keypadInputs().length < 2;
  // 鍵盤標題列也顯示倒數：題目捲出畫面時，學生仍看得到剩下多少時間
  const s = view?.session,
    mine = myPractice();
  const deadline = mine?.st.status === 'working' ? mine.st.deadline : s?.activityOpen && s.activityDeadline ? s.activityDeadline : 0;
  const timer = kp.querySelector('#keypad-timer');
  if (timer) timer.innerHTML = deadline ? `剩 ${countdown(deadline)}` : '';
  placeKeypad(true);
  hand?.fit();
}
let keypadPadded: HTMLElement | null = null;
function closeKeypad() {
  const kp = document.querySelector<HTMLElement>('#keypad');
  if (kp) kp.hidden = true;
  keypadFor = null;
  // 暫時加的底部空白稍後才拿掉：按下「送出」時（pointerdown 先收鍵盤）版面不能立刻跳動，否則點擊會落空
  const padded = keypadPadded;
  keypadPadded = null;
  if (padded)
    setTimeout(() => {
      if (keypadPadded !== padded) padded.style.paddingBottom = '';
    }, 700);
}
/**
 * 擺放順序：① 整組答案框的正下方（放得下時，每一格都看得到）；② 作答面板左邊、投影片上方（橫向 iPad／電腦）；
 * ③ 這一格（含「系統讀到」預覽）的正下方，必要時把面板往上捲（手機、直向 iPad 題目較長時；用「下一格」換格）。
 * scroll 只在打開或換格時才捲，學生自己捲動面板時鍵盤只跟著答案框移動。
 */
function placeKeypad(scroll = false) {
  const kp = document.querySelector<HTMLElement>('#keypad');
  const input = keypadFor;
  if (!kp || kp.hidden || !input) return;
  if (!input.isConnected) return closeKeypad();
  const gap = 6,
    margin = 8;
  let r = input.getBoundingClientRect();
  const w = Math.min(innerWidth - margin * 2, Math.max(r.width, 380), 460);
  kp.style.width = `${w}px`;
  const h = kp.offsetHeight;
  // 「送出」列：內容短時緊接在答案框下面（inline），內容長時黏在面板底部（sticky）。黏在底部時鍵盤不蓋住它。
  const dockEl = input.closest('#student-answer')?.querySelector('.answer-dock');
  const scroller = input.closest('.panel-scroll') as HTMLElement | null;
  let dock = dockEl?.getBoundingClientRect();
  const box = (scroller || input.closest('.panel-col'))?.getBoundingClientRect();
  const stuck = !!dock && !!box && dock.bottom >= box.bottom - 20;
  // 「送出」緊接在答案框下面、但下面放不下鍵盤：把面板往上捲（必要時暫時加底部空白），答案框仍要看得到
  if (scroll && dock && box && scroller && !stuck && dock.bottom + gap + h > innerHeight - margin) {
    const need = dock.bottom + gap + h - (innerHeight - margin);
    if (r.top - need >= box.top) {
      scroller.style.paddingBottom = `${h + 24}px`;
      keypadPadded = scroller;
      scroller.scrollTop += need;
      r = input.getBoundingClientRect();
      dock = dockEl!.getBoundingClientRect();
    }
  }
  const floor = dock && stuck && dock.top - h - margin > margin ? Math.min(innerHeight, dock.top) : innerHeight;
  const maxTop = floor - h - margin;
  const preview = document.querySelector(`[data-preview="${input.id}"]`);
  const group = input.closest('.numeric-items');
  const panel = input.closest('.panel-col')?.getBoundingClientRect();
  let top: number, left: number;
  const groupBottom = group ? group.getBoundingClientRect().bottom + gap : 0;
  if (dock && !stuck && r.top >= 0 && dock.bottom + gap + h <= innerHeight - margin) {
    // 答案框和「送出」都看得到，鍵盤接在「送出」下面
    top = dock.bottom + gap;
    left = r.right - w;
  } else if (groupBottom && groupBottom <= maxTop && r.top >= 0) {
    top = groupBottom;
    left = r.right - w;
  } else if (panel && panel.left >= w + margin * 2 && panel.top < r.top) {
    top = Math.min(Math.max(margin, r.top - 40), maxTop);
    left = panel.left - w - gap;
  } else {
    const anchor = () => ((preview?.getBoundingClientRect().bottom ?? 0) || r.bottom) + gap;
    if (scroll && scroller && anchor() > maxTop) {
      // 面板內容太短捲不上去：暫時在底部加空白（收起鍵盤時拿掉），讓答案框能捲到鍵盤上方
      scroller.style.paddingBottom = `${h + 24}px`;
      keypadPadded = scroller;
      scroller.scrollTop += anchor() - maxTop;
      r = input.getBoundingClientRect();
    }
    // 還是放不下就放在這一格上方
    top = anchor() <= maxTop ? anchor() : r.top - h - gap >= margin ? r.top - h - gap : maxTop;
    left = r.right - w;
  }
  kp.style.top = `${Math.round(Math.max(margin, top))}px`;
  kp.style.left = `${Math.round(Math.min(Math.max(margin, left), innerWidth - w - margin))}px`;
}
/** 游標在 √(數字|) 裡、括號剛好在右邊：回傳要跳出的位置。 */
function radicalExit(v: string, at: number) {
  return /√\(\d+$/.test(v.slice(0, at)) && v[at] === ')' ? at + 1 : at;
}
function keyInput(input: HTMLInputElement, key: string) {
  let v = input.value,
    s = input.selectionStart ?? v.length,
    e = input.selectionEnd ?? v.length;
  const sel = v.slice(s, e);
  const put = (text: string, caret = text.length) => {
    v = v.slice(0, s) + text + v.slice(e);
    s = e = s + caret;
  };
  const exit = () => {
    if (s === e) s = e = radicalExit(v, s);
  };
  if (key === 'back') {
    if (s !== e) put('', 0);
    else if (s > 0) {
      // 空的 √( ) 或 ( )：一次刪掉整組
      const empty = v[s - 1] === '(' && v[s] === ')';
      const from = empty && v[s - 2] === '√' ? s - 2 : s - 1;
      v = v.slice(0, from) + v.slice(empty ? s + 1 : s);
      s = e = from;
    }
  } else if (key === 'left') s = e = Math.max(0, s - 1);
  else if (key === 'right') s = e = v.startsWith(')/(', e) ? e + 3 : Math.min(v.length, e + 1);
  else if (key === '√') {
    exit();
    if (sel) put(`√(${sel})`);
    else put('√()', 2);
  } else if (key === 'frac') {
    exit();
    if (sel) put(`(${sel})/()`, sel.length + 4);
    else if (s > 0 && /[\d)]/.test(v[s - 1])) put('/()', 2); // 前面已有分子，例如 4√5 → 4√5/( )
    else put('()/()', 1);
  } else if (key === 'paren') put(sel ? `(${sel})` : '()', sel ? sel.length + 2 : 1);
  else {
    if ('+-'.includes(key)) exit();
    put(key);
  }
  input.value = v;
  input.setSelectionRange(s, e);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
}
function criteriaHint(a: Activity) {
  if (!a.rubric) return '';
  return `<details class="criteria-hint"><summary>${icon('target')}成功標準（老師會依這些給分）</summary><ul>${a.rubric.criteria.map((c) => `<li><strong>${md(c.label)}</strong>（${c.points} 分）：${md(c.levels.find((l) => l.score === c.points)?.description || '')}</li>`).join('')}</ul></details>`;
}
function feedbackHtml(a: Activity) {
  const mine = currentStudentAnswer(a);
  if (!mine) return '';
  const g = gradeFor(mine.id);
  if (!g) return '';
  const rubric = a.rubric;
  if (g.depth === 'verdict')
    return `<section class="feedback-card ${g.correct ? 'right' : 'wrong'}" data-testid="student-feedback"><header><span>${icon('stamp')}老師的回饋</span><strong class="verdict-mark">${g.correct ? '✓ 正確' : '✗ 再檢查'}</strong></header>${(mine.value as CanvasAnswer).imageId ? `<div class="redpen-host" data-image="${esc((mine.value as CanvasAnswer).imageId!)}"></div>` : ''}${g.feedback ? `<p class="feedback-text">${md(g.feedback)}</p>` : ''}${g.transcript ? `<details><summary>AI 讀到的手寫內容（讀錯請告訴老師）</summary><pre>${esc(g.transcript)}</pre></details>` : ''}</section>`;
  const work = (mine.value as CanvasAnswer).work;
  // 快速批改：在自己確認過的辨識稿上看到圈出的錯處（不在照片上畫）
  if (g.basis === 'text' && work)
    return `<section class="feedback-card" data-testid="student-feedback"><header><span>${icon('stamp')}老師的回饋</span><strong>${g.total}<small>/ ${g.max}</small></strong></header><div class="work-lines marked" data-testid="feedback-marks">${workHtml(work, g.marks)}</div>${g.feedback ? `<p class="feedback-text">${md(g.feedback)}</p>` : ''}</section>`;
  return `<section class="feedback-card" data-testid="student-feedback"><header><span>${icon('stamp')}老師的回饋</span><strong>${g.total}<small>/ ${g.max}</small></strong></header>${(mine.value as CanvasAnswer).imageId ? `<div class="redpen-host" data-image="${esc((mine.value as CanvasAnswer).imageId!)}"></div>` : ''}<ul class="criteria-scores">${g.scores.map((s) => `<li><span>${md(rubric?.criteria.find((c) => c.id === s.criterionId)?.label || s.criterionId)}</span><b>${s.score}/${rubric?.criteria.find((c) => c.id === s.criterionId)?.points ?? ''}</b>${s.comment ? `<small>${md(s.comment)}</small>` : ''}</li>`).join('')}</ul>${g.feedback ? `<p class="feedback-text">${md(g.feedback)}</p>` : ''}${g.transcript ? `<details><summary>AI 讀到的手寫內容（讀錯請告訴老師）</summary><pre>${esc(g.transcript)}</pre></details>` : ''}</section>`;
}
function screenMode() {
  return currentRoute.startsWith('/screen/');
}
function needsPanelFocus() {
  return user?.role === 'student' && studentTab === 'answer';
}
function renderSession() {
  if (!view || !user) return;
  board?.destroy();
  board = null;
  viz?.destroy();
  viz = null;
  const teacher = user.role === 'teacher',
    s = view.session,
    screen = screenMode();
  const index = teacher || s.followTeacher ? s.slideIndex : studentSlide;
  const slide = view.lesson.slides[index] || view.lesson.slides[0];
  const a = !teacher && index !== s.slideIndex ? undefined : slide.activity;
  const own = a ? currentStudentAnswer(a) : undefined;
  if (own && !editing && a?.type !== 'canvas' && a?.type !== 'manipulate') draft = own.value;
  const total = view.lesson.slides.length;
  app.className = `classroom ${teacher ? 'teacher-room' : 'student-room'} ${screen ? 'big-screen' : ''} ${needsPanelFocus() ? 'show-panel' : ''} ${!teacher && a && s.activityOpen && (!own || editing) ? 'answering' : ''}`;
  const panel = teacher ? teacherPanel(a, screen) : studentPanel(a, index);
  // 重畫時（例如按「公布結果」）保留動畫的播放位置
  const oldVideo = document.querySelector<HTMLVideoElement>('.anim-focus video');
  const resume = oldVideo ? { t: oldVideo.currentTime, paused: oldVideo.paused } : null;
  app.innerHTML = `<header class="room-bar"><div class="room-identity">${teacher ? btn('返回', 'dashboard', 'icon-btn', 'back', 'aria-label="返回課程"') : `<span class="brand-mark small">${icon('sigma')}</span>`}<div><strong>${esc(teacher ? s.title : `${s.className}・${user.seat} 號`)}</strong><small>${teacher ? esc(s.className) : esc(view.lesson.title)}</small></div></div><div class="room-progress" aria-label="第 ${index + 1} 頁，共 ${total} 頁"><span>${index + 1}</span>/<span>${total}</span></div><div class="room-actions"><span id="sync-status" class="sync-status"><i></i>已連線</span>${teacher ? `${btn(screen ? '一般' : '大屏', 'screen', 'quiet', 'screen', 'title="切換大屏授課"')}` : ''}${btn('', 'fullscreen', 'icon-btn', 'expand', 'aria-label="全螢幕" title="全螢幕"')}${!teacher && s.danmakuOpen && !s.ended ? btn('彈幕', 'danmaku-bar', `quiet danmaku-btn ${danmakuBar ? 'selected' : ''}`, 'spark', 'data-testid="danmaku-open"') : ''}${teacher ? '' : btn('', 'logout', 'icon-btn', 'logout', 'aria-label="登出" title="登出"')}</div></header><div class="room-main"><main class="stage-col"><article class="slide-stage" data-testid="session-slide" id="slide-stage">${slideMarkup(slide, index, total)}<div id="quiz-board-host">${teacher ? quizBoardHtml() : ''}</div></article><nav class="slide-nav" aria-label="翻頁與白板工具">${btn('', 'prev-slide', 'icon-btn nav-btn', 'prev', `aria-label="上一頁" ${index === 0 || (!teacher && s.followTeacher) ? 'disabled' : ''}`)}${teacher ? toolbar() : ''}<div class="slide-dots">${view.lesson.slides.map((sl, i) => `<button class="${i === index ? 'active' : ''} ${sl.activity ? 'has-q' : ''} ${i === s.slideIndex && !teacher ? 'live' : ''}" data-action="go-slide" data-index="${i}" aria-label="第 ${i + 1} 頁${sl.phase ? `・${esc(sl.phase)}` : ''}" title="${esc(sl.phase || sl.title)}" ${!teacher && s.followTeacher ? 'disabled' : ''}><span></span></button>`).join('')}</div>${btn('', 'next-slide', 'icon-btn nav-btn primary', 'next', `aria-label="下一頁" data-testid="next-slide" ${index === total - 1 || (!teacher && s.followTeacher) ? 'disabled' : ''}`)}</nav></main><aside class="panel-col" aria-label="${teacher ? '課堂互動' : '作答區'}">${panel}</aside></div>${teacher ? '' : `<nav class="phone-tabs" aria-label="切換"><button class="${studentTab === 'slide' ? 'selected' : ''}" data-action="student-tab" data-tab="slide">${icon('book')}教材</button><button class="${studentTab === 'answer' ? 'selected' : ''}" data-action="student-tab" data-tab="answer">${icon('pen')}作答${a && s.activityOpen && (!own || editing) ? '<i class="badge-dot"></i>' : ''}</button></nav>`}<div id="buzz-root"></div><div id="danmaku-root">${teacher ? '' : danmakuStudentHtml()}</div>${teacher ? '' : keypadHtml()}`;
  const stage = document.querySelector<HTMLElement>('#slide-stage')!;
  renderBuzzLayer();
  if (!teacher) mountHandPad();
  if (teacher) syncDanmaku(view.danmaku, s.danmakuClearedAt, serverTime());
  if (
    figZoom &&
    (figZoom.slideId !== slide.id || (figZoom.index < 0 ? !slide.animation?.src : !slide.figures?.[figZoom.index]))
  )
    figZoom = null;
  if (figZoom) stage.insertAdjacentHTML('beforeend', figureFocusHtml(slide));
  const video = stage.querySelector<HTMLVideoElement>('.anim-focus video');
  if (video && resume) {
    video.autoplay = !resume.paused;
    video.addEventListener('loadedmetadata', () => (video.currentTime = resume.t), { once: true });
  }
  const vizHost = stage.querySelector<HTMLElement>('.viz-host');
  if (vizHost && slide.interactive)
    viz = mountInteractive(vizHost, slide.interactive, vizState.get(slide.id), (vars) => {
      vizState.set(slide.id, vars);
      const out = document.querySelector('#manip-vars');
      if (out && a?.type === 'manipulate') {
        const keys = a.record?.length ? a.record : Object.keys(vars).filter((k) => k !== 'step');
        out.textContent = keys.map((k) => `${k} = ${fmt(vars[k])}`).join('　');
      }
    });
  const inkKey = boardKey(slide.id);
  board = new Whiteboard(
    stage,
    view.whiteboard[inkKey] || [],
    async (strokes) => {
      await api(`/sessions/${s.id}/whiteboard`, 'PUT', { slideId: inkKey, strokes });
    },
    (m) => toast(m, true),
  );
  if (teacher) {
    board.color = color;
    board.setTool(currentTool);
  } else board.setTool('cursor');
  const frame = document.querySelector<HTMLIFrameElement>('#custom-activity');
  if (frame && slide.customHtml)
    frame.src = `/api/sessions/${encodeURIComponent(s.id)}/slides/${encodeURIComponent(slide.id)}/html`;
  mountRedpens();
}
function mountRedpens() {
  document.querySelectorAll<HTMLElement>('.redpen-host[data-image]').forEach((host) => {
    const answer = view?.answers.find((x) => (x.value as CanvasAnswer)?.imageId === host.dataset.image);
    mountRedpen(host, `/api/images/${host.dataset.image}`, answer ? gradeFor(answer.id) || null : null);
  });
}
function studentPanel(a: Activity | undefined, index: number) {
  const s = view!.session;
  if (s.ended) return `<div class="quiet-moment"><h2>課堂已結束</h2><p>你的作答已保存。</p></div>`;
  if (myPractice()) return `<div class="panel-scroll"><div id="student-answer">${practiceCard()}</div><div id="class-events">${eventsHtml()}</div></div>`;
  if (view!.quiz && s.quiz) return `<div class="panel-scroll"><div id="student-answer">${quizCard()}</div><div id="class-events">${eventsHtml()}</div></div>`;
  if (s.pkLobby?.buzz && !pkTakenSeats(s.pkLobby).has(user!.seat!)) return `<div class="panel-scroll"><div id="student-answer">${pkBuzzCard()}</div></div>`;
  if (index !== s.slideIndex)
    return `<div class="quiet-moment"><h2>自主瀏覽中</h2><p>作答只開放在老師目前的頁面。</p>${btn('回到目前頁面', 'go-slide', 'primary', 'arrow', `data-index="${s.slideIndex}"`)}</div>`;
  if (!a) return `<div class="quiet-moment">${icon('sigma')}<h2>先看、先想</h2><p>這一頁沒有題目，跟著老師操作圖形。</p></div><div id="class-events">${eventsHtml()}</div>`;
  const released = feedbackHtml(a);
  return `<div class="panel-scroll"><div id="student-answer">${answerForm(a)}</div>${s.resultsVisible ? `<details class="student-results" open><summary>全班結果</summary><div id="aggregate">${aggregateHtml(view!)}</div>${ownVerdict(a)}</details>` : ''}<div id="student-feedback">${released}</div><div id="class-events">${eventsHtml()}</div></div>`;
}
function ownVerdict(a: Activity) {
  const mine = currentStudentAnswer(a);
  if (!mine || mine.correct === undefined) return '';
  const items = mine.itemsCorrect?.length
    ? `<span class="item-verdicts">${mine.itemsCorrect.map((ok, i) => `<b class="${ok ? 'ok' : 'no'}">(${i + 1}) ${ok ? '✓' : '✗'}</b>`).join('')}</span>`
    : '';
  return `<p class="verdict ${mine.correct ? 'ok' : 'no'}">${icon(mine.correct ? 'check' : 'x')}<span>${mine.correct ? '你答對了！' : '這次沒對，看看解析再想一次。'}${mine.note ? `<small>${md(mine.note)}</small>` : ''}</span>${items}</p>`;
}
function teacherPanel(a: Activity | undefined, screen: boolean) {
  const s = view!.session;
  const gradable = a && a.rubric && (a.type === 'canvas' || a.type === 'short' || (a.type === 'numeric' && !!a.photoWork));
  const activity = a
    ? `<section class="teacher-activity"><div class="activity-top">${tag(TYPE_LABEL[a.type])}<span id="answer-count" class="count-pill">${view!.aggregate.submitted} / ${view!.aggregate.total}</span></div><h2>${md(a.prompt)}</h2><div class="activity-actions" id="activity-actions">${activityActions(a)}</div><div id="aggregate">${aggregateHtml(view!)}</div><div id="practice-board">${practiceBoard(a)}</div>${screen ? '' : `<div id="responses">${responsesHtml(a)}</div>`}${!screen && a.aiAllowed && ['short', 'numeric', 'canvas'].includes(a.type) ? btn('AI 整理全班迷思', 'summarize', 'quiet full', 'spark') : ''}</section>`
    : `<div class="quiet-moment">${icon('sigma')}<h2>這一頁沒有題目</h2><p>可以用畫筆在圖上標示，或抽籤請同學說明。</p></div>`;
  // 課後檢核・PK 戰在最後另外一頁；測驗或配對進行中時，其他頁也留著控制區（才能結束）
  const onQuizPage = !!view!.lesson.slides[s.slideIndex]?.quizPage;
  const quizSection = onQuizPage || s.quiz || s.pkLobby ? `<section class="quiz-tools" id="quiz-panel">${quizPanel()}</section>` : '';
  return `<div class="panel-scroll">${quizSection}${onQuizPage ? '' : activity}<section class="seat-map" id="seat-map" data-testid="seat-map">${seatMapInner()}</section>${gradable && !screen ? gradingBar(a!) : ''}<section class="class-tools">${screen && a ? drawFilterBar() : ''}<div class="tool-row">${btn(drawLabel(a), 'draw', 'secondary', 'dice', 'data-testid="draw-seat"')}${btn('搶答', 'buzz-open', 'secondary', 'bolt', 'data-testid="buzz-open"')}</div><div id="danmaku-tools">${danmakuTools()}</div><div id="class-events">${eventsHtml()}</div></section>${screen ? '' : `<section class="room-options">${btn(s.followTeacher ? '同步翻頁中' : '學生自主瀏覽', 'toggle-follow', 'quiet', s.followTeacher ? 'screen' : 'book', s.ended ? 'disabled' : '')}${btn('學生加入', 'join-info', 'quiet', 'users')}${btn('結束課堂', 'end-session', 'quiet danger', 'logout', s.ended ? 'disabled' : '')}</section>${view!.lesson.slides[s.slideIndex]?.notes ? `<details class="teacher-notes"><summary>教師備註（學生看不到）</summary><p>${esc(view!.lesson.slides[s.slideIndex].notes)}</p></details>` : ''}`}</div>`;
}
/* ───────────── 作答限時與補救練習 ───────────── */
const TIME_LIMITS: [number, string][] = [
  [30, '30 秒'],
  [60, '1 分鐘'],
  [90, '1 分 30 秒'],
  [120, '2 分鐘'],
  [180, '3 分鐘'],
  [300, '5 分鐘'],
  [0, '不限時'],
];
function clockText(ms: number) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
/** 倒數計時的文字；每半秒由 tickClocks() 更新。 */
function countdown(deadline: number, cls = '') {
  return `<span class="countdown ${cls}" data-deadline="${deadline}" role="timer">${clockText(deadline - serverTime())}</span>`;
}
/** 開放作答的時間到了（有限時、而且過了截止時間）。 */
function timeUp() {
  const d = view?.session.activityDeadline;
  return !!view?.session.activityOpen && !!d && serverTime() >= d;
}
function activityActions(a: Activity) {
  const s = view!.session,
    dis = s.ended ? 'disabled' : '';
  // 可拍照的數值題：老師按了才派發拍照交計算過程
  const photo = a.photoWork
    ? btn(s.photoOpen ? '收回拍照題' : '派發拍照題', 'photo-toggle', s.photoOpen ? 'primary' : 'secondary', 'camera', `data-testid="photo-toggle" aria-pressed="${!!s.photoOpen}" ${dis}`)
    : '';
  const results = `${btn(s.resultsVisible ? '隱藏結果' : '公布結果', 'toggle-results', 'secondary', 'chart')}${photo}`;
  if (!s.activityOpen) {
    const limit = prefs.get('activitySeconds', 60);
    const picker = `<label class="time-limit">${icon('clock')}<select id="activity-seconds" aria-label="作答限時" ${dis}>${TIME_LIMITS.map(([v, l]) => `<option value="${v}" ${v === limit ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
    return `${btn('開放作答', 'toggle-activity', 'primary', 'play', s.ended ? 'disabled' : 'data-testid="toggle-activity"')}${results}${picker}`;
  }
  const stop = btn('結束作答', 'toggle-activity', 'secondary', 'x', 'data-testid="toggle-activity"');
  if (!s.activityDeadline) return `${stop}${results}<span class="time-state">不限時</span>`;
  if (!timeUp()) return `${stop}${results}<span class="time-state">剩 ${countdown(s.activityDeadline)}</span>`;
  return `${stop}${results}<div class="time-up" data-testid="time-up"><strong>${icon('clock')}時間到，作答已鎖定</strong>${btn('＋30 秒', 'extend-time', 'quiet', '', 'data-seconds="30"')}${btn('＋1 分鐘', 'extend-time', 'quiet', '', 'data-seconds="60" data-testid="extend-60"')}</div>`;
}
function wrongSeats(a: Activity) {
  return latestBySeat(view!, a.id).filter((x) => x.correct === false).map((x) => x.seat);
}
/** 老師端：派補救練習的按鈕，或練習進行中每位同學的狀態。 */
function practiceBoard(a: Activity) {
  const v = view!,
    s = v.session,
    p = v.practice;
  if (p && s.practice?.activityId === a.id) {
    const now = serverTime();
    const rows = p.entries
      .map((e) => ({ e, st: practiceStatus(p.run, e, now) }))
      .sort((x, y) => x.e.seat - y.e.seat);
    const n = (k: PracticeStatus['status']) => rows.filter((r) => r.st.status === k).length;
    const chips = rows
      .map(({ e, st }) => {
        const total = practiceTotal(p.run, e);
        const label = p.run.retry
          ? st.status === 'passed' ? '✓ 原題全對' : st.status === 'help' ? '⚠ 個別指導' : `第 ${st.round + 1}/${total} 題 ${countdown(st.deadline)}`
          : st.status === 'passed' ? `✓ 第 ${st.round + 1} 輪過` : st.status === 'help' ? '⚠ 個別指導' : `第 ${st.round + 1} 輪 ${countdown(st.deadline)}`;
        return `<span class="practice-chip ${st.status}" data-testid="practice-seat-${e.seat}"><b>${e.seat}</b><small>${label}</small></span>`;
      })
      .join('');
    return `<section class="practice-board" data-testid="practice-board"><header><strong>${icon('target')}${p.run.retry ? '原題再做一次' : '補救練習中'}</strong><span>${p.run.retry ? `每題 ${p.run.seconds} 秒・重做自己答錯的小題` : `每輪 ${p.run.seconds} 秒・最多 ${p.run.rounds} 輪`}</span></header><p class="practice-counts"><b class="working">練習中 ${n('working')}</b><b class="passed">通過 ${n('passed')}</b><b class="help">需個別指導 ${n('help')}</b></p><div class="practice-chips">${chips}</div>${btn('結束練習', 'practice-end', 'quiet', 'x', 'data-testid="practice-end"')}</section>`;
  }
  if (a.type !== 'numeric' || s.activityOpen || s.ended || !v.aggregate.submitted) return '';
  const wrong = wrongSeats(a).length,
    unanswered = (v.roster || []).filter((x) => x.online && !x.answered).length;
  return `<section class="practice-start"><button class="btn primary full" data-action="practice-start" data-testid="practice-start" ${wrong || (unanswered && practiceWithUnanswered) ? '' : 'disabled'}>${icon('target')}<span>原題再派一次給答錯的同學（${wrong} 人）</span></button><label class="check-line"><input type="checkbox" id="practice-unanswered" ${practiceWithUnanswered ? 'checked' : ''}> 也派給上線但未作答的同學（${unanswered} 人）</label><p class="muted small-text">不另外出題：每人只重做自己答錯的小題，每題限時 1 分鐘；還是錯的會標「個別指導」。</p></section>`;
}
let practiceWithUnanswered = false;
/** 學生端：補救練習卡（取代原本的作答區）。 */
let practiceDraft = { key: '', value: '' };
function myPractice() {
  const p = view?.practice;
  if (!p || !p.entries.length || user?.role !== 'student') return null;
  return { p, st: practiceStatus(p.run, p.entries[0], serverTime()) };
}
function practiceCard() {
  const mine = myPractice()!;
  const { p, st } = mine;
  const reveal = (r: number) => p.reveals.find((x) => x.round === r);
  const retry = !!p.run.retry,
    total = practiceTotal(p.run, p.entries[0]),
    unit = retry ? '題' : '輪';
  const past = st.rounds
    .filter((r) => r.outcome && (retry || r.outcome !== 'correct'))
    .map((r) => {
      const rv = reveal(r.round);
      if (r.outcome === 'correct') return `<li class="practice-past ok"><b>第 ${r.round + 1} ${unit} ✓ 答對</b>${r.value ? `<span>你寫：${answerHtml(r.value)}</span>` : ''}</li>`;
      return `<li class="practice-past"><b>第 ${r.round + 1} ${unit} ${r.outcome === 'timeout' ? '⏱ 時間到' : '✗ 答錯'}</b>${r.value ? `<span>你寫：${answerHtml(r.value)}</span>` : ''}${rv ? `<span>答案：${answerHtml(rv.answer)}${rv.explanation ? `　${md(rv.explanation)}` : ''}</span>` : '<span class="muted">答案稍後顯示</span>'}</li>`;
    })
    .join('');
  const head = `<div class="activity-prompt"><span class="tag">${retry ? '原題再做一次' : '補救練習'}</span><h2>第 ${st.round + 1} / ${total} ${unit}${st.status === 'working' ? `　${countdown(st.deadline, 'big')}` : ''}</h2></div>`;
  let body = '';
  if (st.status === 'working') {
    const key = `${p.run.startedAt}:${st.round}`;
    if (practiceDraft.key !== key) practiceDraft = { key, value: '' };
    body = `<p class="practice-prompt">${md(p.prompts[st.round] || '')}</p><div class="numeric-field"><input id="practice-answer" class="numeric-input" inputmode="${numericInputMode()}" autocomplete="off" placeholder="答案" value="${esc(practiceDraft.value)}" aria-label="練習答案"></div><div class="tex-preview" data-preview="practice-answer" aria-live="polite">${previewHtml(practiceDraft.value)}</div><div class="answer-dock with-keys"><div class="submit-area">${btn('送出答案', 'submit-practice', 'primary full', 'check', `data-round="${st.round}" data-testid="submit-practice"`)}</div></div>`;
  } else if (st.status === 'passed')
    body = `<p class="verdict ok" data-testid="practice-passed">${icon('check')}<span>${retry ? '原題全部答對了！' : `答對了！第 ${st.round + 1} 輪過關。`}</span></p>`;
  else body = `<p class="verdict no" data-testid="practice-help">${icon('x')}<span>${retry ? '還有題目沒答對' : `${p.run.rounds} 輪都還沒過`}，老師等一下會來和你一起看。</span></p>`;
  return `<section class="practice-card" data-testid="practice-card">${head}${past ? `<ol class="practice-history">${past}</ol>` : ''}${body}</section>`;
}

/* ───────────── 課後形成性評量＋PK 戰＋錯題練習 ───────────── */
/** 老師：大螢幕戰況／結果（課後檢核頁的投影片區）。 */
let quizBoardOpen = true;
/** 學生：全班測驗目前看第幾題。 */
let quizIndex = 0;
/** 學生：PK、錯題練習上一題的對錯（錯題練習附解析）。 */
let quizFlash = '';
/** 學生：作答送出中（避免重複點、點到還沒換掉的舊題目）。 */
let quizSending = false;
const EMPTY_SCORE: QuizScore = { answered: 0, correct: 0, timeMs: null, finished: false };
const quizClassSeconds = () => prefs.get<number>('quizSeconds', 600);
const pkSeconds = () => prefs.get<number>('pkSeconds', 180);
const seatName = (n: number) => (n === 0 ? '電腦' : `${n} 號`);
const secText = (ms: number | null) => (ms === null ? '' : `${(ms / 1000).toFixed(1)} 秒`);
const MODE_NAME = { class: '全班測驗', pk: 'PK 戰', review: '錯題練習' } as const;
function quizScoreOf(q: QuizView, seat: number): QuizScore {
  if (seat === 0 && q.bot) return botScore(q.bot, q.run, serverTime());
  return q.scores[String(seat)] || { ...EMPTY_SCORE, timeMs: quizOver(q.run, serverTime()) ? q.run.seconds * 1000 : null };
}
function matchState(q: QuizView, m: PkMatch) {
  const a = quizScoreOf(q, m.a),
    b = quizScoreOf(q, m.b);
  const over = matchOver(q.run, a, b, serverTime());
  return { a, b, over, result: over ? decide(a, b) : null };
}
function selectHtml(id: string, list: [number, string][], value: number) {
  return `<select id="${id}">${list.map(([v, l]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
}
/** 錯題紀錄的摘要與「派錯題練習」：每個人只做自己錯的題型，換數字。 */
function reviewButton() {
  const rec = view?.quizRecord;
  const people = rec ? Object.keys(rec.wrong).length : 0;
  return people
    ? `<div class="tool-row">${btn(`派錯題練習（${people} 人）`, 'quiz-review', 'primary', 'target', 'data-testid="quiz-review"')}</div><p class="muted small-text">每個人只做自己錯的題型，換成沒看過的那一題（同類型換數字），答完馬上看到對錯與解析。</p>`
    : '';
}
/** 老師面板：派全班測驗、PK 配對、錯題練習、進行中狀態。 */
function quizPanel(): string {
  const v = view!,
    s = v.session,
    q = v.quiz;
  if (!v.lesson.quiz && !q && !s.pkLobby) return '';
  const head = `<header><strong>${icon('target')}課後檢核・PK 戰</strong></header>`;
  if (s.pkLobby) return head + pkLobbyHtml(s.pkLobby);
  if (q && s.quiz) return head + (q.run.mode === 'pk' ? pkRunPanel(q) : classRunPanel(q));
  return `${head}<p class="muted small-text">10 題四選一，每題從 3 題換數字的題目抽 1 題。全班同一份；重新派題或 PK 都會重新抽。</p><div class="tool-row">${btn('派全班測驗', 'quiz-class', 'primary', 'check', 'data-testid="quiz-class"')}<label class="time-limit">${icon('clock')}${selectHtml('quiz-seconds', [[300, '5 分鐘'], [600, '10 分鐘'], [900, '15 分鐘']], quizClassSeconds())}</label></div><div class="tool-row">${btn('PK 戰：開始配對', 'pk-lobby', 'secondary', 'bolt', 'data-testid="pk-lobby"')}</div>${reviewButton()}`;
}
function pkLobbyHtml(l: PkLobby) {
  const pairs = l.pairs
    .map(([a, b], i) => `<span class="pk-pair" data-testid="pk-pair"><b>${seatName(a)}</b><i>vs</i><b>${seatName(b)}</b>${btn('', 'pk-remove', 'icon-btn', 'x', `data-index="${i}" aria-label="移除這一組"`)}</span>`)
    .join('');
  const waiting = l.waiting !== null ? `<span class="pk-pair waiting" data-testid="pk-waiting"><b>${l.waiting} 號</b><i>vs</i><b>？</b></span>` : '';
  return `<div class="pk-pairs">${pairs}${waiting}${pairs || waiting ? '' : '<p class="muted small-text">還沒有組別。</p>'}</div><div class="tool-row">${btn('全班隨機配對', 'pk-random', 'secondary', 'users', 'data-testid="pk-random"')}${btn('抽籤', 'pk-draw', 'secondary', 'dice', 'data-testid="pk-draw"')}</div><div class="tool-row">${btn(l.buzz ? '關閉搶答' : '開放搶答上場', 'pk-buzz', l.buzz ? 'primary' : 'secondary', 'bolt', `data-testid="pk-buzz" aria-pressed="${l.buzz}"`)}${l.waiting !== null ? btn('配電腦', 'pk-bot', 'quiet', 'sigma', 'data-testid="pk-bot"') : ''}</div><p class="muted small-text">也可以直接點座位表的號碼：第一下選人，第二下配成一組。抽籤、搶答可以混搭（抽一位＋搶答當對手）。單數時多出來的一位和電腦對戰。</p><div class="tool-row"><label class="time-limit">${icon('clock')}${selectHtml('pk-seconds', [[60, '1 分鐘'], [120, '2 分鐘'], [180, '3 分鐘'], [300, '5 分鐘']], pkSeconds())}</label>${btn(`開始對戰（${l.pairs.length} 組）`, 'pk-start', 'primary', 'play', `data-testid="pk-start" ${l.pairs.length ? '' : 'disabled'}`)}</div>${btn('取消', 'quiz-close', 'quiet', 'x')}`;
}
/** 全班測驗與錯題練習的進行狀態（錯題練習每人題數不同）。 */
function classRunPanel(q: QuizView) {
  const over = quizOver(q.run, serverTime()),
    review = q.run.mode === 'review';
  const scores = Object.entries(q.scores).filter(([seat]) => seat !== '0');
  const assigned = review ? Object.keys(q.run.personal || {}).length : (view!.roster || []).filter((r) => r.online).length;
  const done = scores.filter(([, x]) => x.finished).length;
  const total = (seat: string) => (review ? q.run.personal?.[seat]?.slots.length ?? 0 : q.questions.length);
  const list = scores
    .sort((x, y) => Number(x[0]) - Number(y[0]))
    .map(([seat, x]) => `<span class="seat-chip ${x.finished ? 'ok' : ''}"><b class="chip-seat">${seat}</b><small>${x.correct}/${total(seat)}${x.finished ? (review ? '' : `・${secText(x.timeMs)}`) : `・作答 ${x.answered}`}</small></span>`)
    .join('');
  return `<p class="quiz-status" data-testid="quiz-status">${MODE_NAME[q.run.mode]}${over ? '已結束' : `・剩 ${countdown(quizDeadline(q.run))}`}・${review ? '做完' : '已交卷'} ${done}／${review ? '派給' : '上線'} ${assigned}</p><div class="tool-row">${btn(quizBoardOpen ? '收起大螢幕' : '大螢幕顯示', 'quiz-board', 'secondary', 'screen', 'data-testid="quiz-board-toggle"')}${over ? btn('重新派一份全班測驗', 'quiz-class', 'secondary', 'dice') : btn(`結束${MODE_NAME[q.run.mode]}`, 'quiz-end', 'secondary', 'x', 'data-testid="quiz-end"')}</div>${over ? reviewButton() : ''}<details class="answer-list"><summary>個別成績（${scores.length} 人）</summary><div class="seat-chips">${list || '<p class="muted">還沒有人作答。</p>'}</div></details>${btn('關閉', 'quiz-close', 'quiet', 'x')}`;
}
function pkRunPanel(q: QuizView) {
  const now = serverTime(),
    ms = q.run.matches || [];
  const allOver = ms.every((m) => matchState(q, m).over);
  const status = q.run.startedAt > now ? '倒數準備中' : allOver ? '全部比完' : `剩 ${countdown(quizDeadline(q.run))}`;
  return `<p class="quiz-status" data-testid="quiz-status">PK 戰・${ms.length} 組・${status}</p><div class="tool-row">${btn(quizBoardOpen ? '收起戰況' : '大螢幕戰況', 'quiz-board', 'secondary', 'screen', 'data-testid="quiz-board-toggle"')}${allOver ? '' : btn('結束對戰', 'quiz-end', 'secondary', 'x', 'data-testid="quiz-end"')}</div>${allOver ? `<div class="tool-row">${btn('同組再戰（重新抽題）', 'pk-again', 'primary', 'dice', 'data-testid="pk-again"')}${btn('重新配對', 'pk-lobby', 'secondary', 'users')}</div>${reviewButton()}` : ''}${btn('關閉', 'quiz-close', 'quiet', 'x')}`;
}
/** 每題 ✓／✗ 一排小格（大螢幕；不含答案）。 */
function strip(row: (boolean | null)[] | undefined, n: number) {
  return `<div class="q-strip">${Array.from({ length: n }, (_, i) => {
    const ok = row?.[i];
    return `<i class="${ok === true ? 'ok' : ok === false ? 'no' : ''}" title="第 ${i + 1} 題">${ok === true ? '✓' : ok === false ? '✗' : i + 1}</i>`;
  }).join('')}</div>`;
}
/** 錯題紀錄（每一題錯的人）與 PK 戰績：比完、測驗結束、或課後檢核頁閒置時顯示。 */
function recordHtml() {
  const rec = view?.quizRecord;
  if (!rec) return '';
  const bySlot = rec.topics.map((topic, q) => ({ topic, q, seats: Object.entries(rec.wrong).filter(([, list]) => list.includes(q)).map(([seat]) => Number(seat)).sort((a, b) => a - b) }));
  const rows = bySlot
    .map(({ topic, q, seats }) => `<div class="wrong-row"><span>${q + 1}. ${esc(topic)}</span><b class="${seats.length ? 'warn' : 'ok'}">${seats.length ? `${seats.length} 人` : '全對'}</b><small>${seats.map((n) => `${n}`).join('、')}</small></div>`)
    .join('');
  const standings = Object.entries(rec.standings)
    .sort((a, b) => b[1].win - a[1].win || a[1].lose - b[1].lose || Number(a[0]) - Number(b[0]))
    .map(([seat, s]) => `<span class="standing"><b>${seat} 號</b>${s.win} 勝 ${s.lose} 負${s.draw ? ` ${s.draw} 平` : ''}</span>`)
    .join('');
  return `<section class="quiz-record" data-testid="quiz-record"><h3>${icon('target')}錯題紀錄（這堂課最近一次的結果；之後答對就拿掉）</h3><div class="wrong-rows">${rows}</div>${standings ? `<h3>${icon('bolt')}本堂 PK 戰績</h3><div class="standings">${standings}</div>` : ''}</section>`;
}
/** 課後檢核頁的投影片區：配對中的組別、PK 對戰卡、全班測驗每題答對率、錯題練習進度、錯題紀錄。 */
function quizBoardHtml(): string {
  if (user?.role !== 'teacher' || !view || !view.lesson.slides[view.session.slideIndex]?.quizPage) return '';
  const lobby = view.session.pkLobby;
  if (lobby) {
    const pairs = lobby.pairs.map(([a, b]) => `<div class="pk-card lobby"><div class="pk-side"><strong>${seatName(a)}</strong></div><div class="pk-vs">VS</div><div class="pk-side"><strong>${seatName(b)}</strong></div></div>`).join('');
    const waiting = lobby.waiting !== null ? `<div class="pk-card lobby waiting"><div class="pk-side"><strong>${lobby.waiting} 號</strong></div><div class="pk-vs">VS</div><div class="pk-side"><strong>？</strong></div></div>` : '';
    return `<div class="quiz-board" data-testid="quiz-board"><header><strong>${icon('bolt')}PK 戰・配對中</strong><small>${lobby.buzz ? '搶答開放中！最先按的同學上場' : `${lobby.pairs.length} 組`}</small></header><div class="pk-grid">${pairs}${waiting || (pairs ? '' : '<p class="muted">老師配對中…</p>')}</div></div>`;
  }
  const q = view.quiz;
  if (!q || !view.session.quiz) return view.quizRecord ? `<div class="quiz-board" data-testid="quiz-board"><header><strong>${icon('target')}課後檢核・PK 戰</strong><small>${view.quizRecord.runs} 次測驗／對戰</small></header>${recordHtml()}</div>` : '';
  if (!quizBoardOpen) return '';
  const now = serverTime(),
    n = q.questions.length,
    over = quizOver(q.run, now),
    close = btn('', 'quiz-board', 'icon-btn', 'x', 'aria-label="收起"');
  if (q.run.mode === 'pk') {
    const before = q.run.startedAt > now;
    const clock = before ? `<span class="pk-count" data-pk-start="${q.run.startedAt}">${Math.ceil((q.run.startedAt - now) / 1000)}</span>` : over ? '<span class="pk-clock">時間到</span>' : `<span class="pk-clock">${countdown(quizDeadline(q.run))}</span>`;
    const side = (seat: number, sc: QuizScore, mark: string) => {
      const row = seat === 0 && q.bot ? q.bot.times.map((t, i) => (t <= now - q.run.startedAt ? q.bot!.correct[i] : null)) : q.detail?.[String(seat)];
      return `<div class="pk-side ${mark}"><strong>${seatName(seat)}</strong><b class="pk-score">${sc.correct}</b><small>答對</small><div class="pk-bar"><i style="width:${(sc.answered / n) * 100}%"></i></div><small>${sc.answered}／${n} 題${sc.finished && sc.timeMs !== null ? `・${secText(sc.timeMs)}` : ''}</small>${strip(row, n)}${mark === 'win' ? '<em class="pk-crown">勝</em>' : ''}</div>`;
    };
    const matches = q.run.matches || [];
    const cards = matches
      .map((m) => {
        const st = matchState(q, m);
        const mark = (who: 'a' | 'b') => (st.result === who ? 'win' : st.result && st.result !== 'draw' ? 'lose' : '');
        return `<div class="pk-card ${st.over ? 'over' : ''}" data-testid="pk-card">${side(m.a, st.a, mark('a'))}<div class="pk-vs">${st.result === 'draw' ? '平手' : 'VS'}</div>${side(m.b, st.b, mark('b'))}</div>`;
      })
      .join('');
    const allOver = matches.every((m) => matchState(q, m).over);
    return `<div class="quiz-board" data-testid="quiz-board"><header><strong>${icon('bolt')}PK 戰</strong><small>答對題數多的贏；一樣多比用時</small>${clock}${close}</header><div class="pk-grid">${cards}</div>${allOver ? recordHtml() : ''}</div>`;
  }
  if (q.run.mode === 'review') {
    const rows = Object.entries(q.run.personal || {})
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([seat, own]) => {
        const sc = q.scores[seat] || EMPTY_SCORE;
        const row = q.detail?.[seat];
        return `<div class="review-row"><b>${seat} 號</b><span>${own.slots.map((slot) => `<i class="${row?.[slot] === true ? 'ok' : row?.[slot] === false ? 'no' : ''}" title="${esc(q.questions[slot]?.topic || '')}">${slot + 1}</i>`).join('')}</span><small>${sc.correct}／${own.slots.length}${sc.finished ? ' 完成' : ''}</small></div>`;
      })
      .join('');
    return `<div class="quiz-board" data-testid="quiz-board"><header><strong>${icon('target')}錯題練習（換數字）</strong><small>每個人只做自己錯的題型</small>${over ? '<span class="pk-clock">已結束</span>' : `<span class="pk-clock">${countdown(quizDeadline(q.run))}</span>`}${close}</header><div class="review-rows">${rows}</div>${over ? recordHtml() : ''}</div>`;
  }
  const rows = q.questions
    .map((x, i) => {
      const counts = q.picks?.[i] || [],
        total = counts.reduce((s, c) => s + c, 0),
        right = x.answer !== undefined ? counts[x.answer] || 0 : 0;
      const wrong = counts.map((c, k) => [c, k] as const).filter(([, k]) => k !== x.answer).sort((p, r) => r[0] - p[0])[0];
      const pct = total ? Math.round((right / total) * 100) : 0;
      const row = `<div class="qb-row"><span>${i + 1}. ${esc(x.topic)}</span><div class="bar-track"><span style="width:${pct}%"></span></div><b>${total ? `${pct}%` : '—'}</b>${over && wrong && wrong[0] ? `<small>最多人錯選 ${String.fromCharCode(65 + wrong[1])}（${wrong[0]} 人）</small>` : '<small></small>'}</div>`;
      // 結束後點一下題目，大螢幕展開題目、附圖、選項與解析（檢討用）
      if (!over) return row;
      const opts = x.options.map((o, k) => `<li class="${k === x.answer ? 'ok' : ''}">${String.fromCharCode(65 + k)}. ${md(o)}<small>${counts[k] || 0} 人</small></li>`).join('');
      return `<details class="qb-detail" data-testid="qb-detail"><summary>${row}</summary><div class="qb-question"><div class="quiz-stem">${md(x.stem)}</div>${quizFigure(x.figure)}<ol class="qb-options">${opts}</ol>${x.explanation ? `<p class="muted">${md(x.explanation)}</p>` : ''}</div></details>`;
    })
    .join('');
  const scores = Object.values(q.scores);
  const avg = scores.length ? (scores.reduce((s, x) => s + x.correct, 0) / scores.length).toFixed(1) : '—';
  return `<div class="quiz-board" data-testid="quiz-board"><header><strong>${icon('target')}${esc(q.title)}</strong><small>${scores.length} 人作答・平均答對 ${avg} 題</small>${over ? '<span class="pk-clock">已結束</span>' : `<span class="pk-clock">${countdown(quizDeadline(q.run))}</span>`}${close}</header><div class="qb-rows">${rows}</div>${over ? recordHtml() : ''}</div>`;
}
/** 學生：搶答上場 PK。 */
function pkBuzzCard() {
  return `<section class="quiz-card pk-buzz-card"><h2>${icon('bolt')}PK 戰搶答上場</h2><p class="muted">最先按的同學上場對戰。</p><button type="button" class="buzz-big" data-action="pk-buzz-in" data-testid="pk-buzz-in">${icon('bolt')}<span>搶答上場</span></button></section>`;
}
function pkTakenSeats(l: PkLobby) {
  const out = new Set<number>(l.pairs.flat());
  if (l.waiting !== null) out.add(l.waiting);
  return out;
}
/** 幾何題附圖：SVG 以圖片顯示（不會執行任何程式）。 */
function quizFigure(svg: string | undefined, cls = '') {
  return svg ? `<img class="quiz-figure ${cls}" alt="題目附圖" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}">` : '';
}
/** 學生的測驗卡：全班測驗可以前後翻、改答案再交卷；PK 與錯題練習選了就鎖定、馬上知道對錯。 */
function quizCard(): string {
  const q = view!.quiz!,
    me = user!.seat!,
    now = serverTime(),
    n = q.questions.length,
    over = quizOver(q.run, now);
  const mine: NonNullable<QuizView['mine']> = q.mine || { answers: Array(n).fill(null), correct: Array(n).fill(null) };
  const letter = (k: number) => String.fromCharCode(65 + k);
  const review = () =>
    `<ol class="quiz-review">${q.questions
      .map((x, i) => {
        const pick = mine.answers[i],
          ok = mine.correct[i];
        return `<li class="${ok === true ? 'ok' : ok === false ? 'no' : ''}"><div>${md(x.stem)}</div>${quizFigure(x.figure, 'small')}<small>你選 ${pick === null ? '—' : `${letter(pick)}. ${md(x.options[pick])}`}${x.answer !== undefined ? `　正解 ${letter(x.answer)}. ${md(x.options[x.answer])}` : ''}</small>${x.explanation ? `<small class="muted">${md(x.explanation)}</small>` : ''}</li>`;
      })
      .join('')}</ol>`;
  const options = (i: number, chosen: number | null) =>
    `<div class="quiz-options">${q.questions[i].options.map((o, k) => `<button class="answer-option ${chosen === k ? 'chosen' : ''}" data-action="quiz-choose" data-q="${i}" data-choice="${k}" data-testid="quiz-option-${k}"><span class="option-letter">${letter(k)}</span><span>${md(o)}</span></button>`).join('')}</div>`;
  // PK 與錯題練習：一題一題做，選了就鎖定
  if (q.run.mode === 'pk' || q.run.mode === 'review') {
    const pk = q.run.mode === 'pk';
    const m = pk ? q.run.matches?.find((x) => x.a === me || x.b === me) : undefined;
    const opp = m ? (m.a === me ? m.b : m.a) : null;
    const title = pk ? (m ? `PK 戰：你 vs ${seatName(opp!)}` : 'PK 戰：跟著做（不影響勝負）') : '錯題練習（換數字）';
    const glyph = icon(pk ? 'bolt' : 'target');
    if (!n) return `<section class="quiz-card" data-testid="quiz-card"><h2>${glyph}${title}</h2><p class="quiz-summary">你沒有錯題，太棒了！</p></section>`;
    if (q.run.startedAt > now)
      return `<section class="quiz-card" data-testid="quiz-card"><h2>${glyph}${title}</h2><p class="pk-countdown" data-pk-start="${q.run.startedAt}">${Math.ceil((q.run.startedAt - now) / 1000)}</p><p class="muted">準備開始…</p></section>`;
    const progress = m ? `<p class="pk-progress" id="pk-progress">${pkProgressText(q, me, opp!)}</p>` : '';
    const next = mine.answers.findIndex((x) => x === null);
    if (next < 0 || over || mine.done !== undefined) {
      let result = '';
      if (m) {
        const st = matchState(q, m);
        const r = st.result === 'draw' ? '平手' : st.result ? ((st.result === 'a') === (m.a === me) ? '你贏了！' : '這次輸了，再接再厲') : '';
        result = st.over ? `<p class="pk-result" data-testid="pk-result">${r}</p>` : `<p class="muted">答完了，等${seatName(opp!)}…</p>`;
      }
      const right = mine.correct.filter((x) => x === true).length;
      return `<section class="quiz-card" data-testid="quiz-card"><h2>${glyph}${title}</h2>${progress}${result}<p class="quiz-summary" data-testid="quiz-summary">答對 ${right}／${n} 題${pk && quizScoreOf(q, me).timeMs !== null ? `，用時 ${secText(quizScoreOf(q, me).timeMs)}` : ''}</p>${review()}</section>`;
    }
    return `<section class="quiz-card" data-testid="quiz-card"><h2>${glyph}${title}　${countdown(quizDeadline(q.run))}</h2>${progress}${quizFlash ? `<div class="quiz-flash">${quizFlash}</div>` : ''}<p class="mini-label">第 ${next + 1}／${n} 題・${esc(q.questions[next].topic)}</p><div class="quiz-stem">${md(q.questions[next].stem)}</div>${quizFigure(q.questions[next].figure)}${options(next, null)}</section>`;
  }
  // 全班測驗
  if (mine.done !== undefined || over)
    return `<section class="quiz-card" data-testid="quiz-card"><h2>${icon('target')}${esc(q.title)}</h2>${over ? `<p class="quiz-summary" data-testid="quiz-summary">答對 ${mine.correct.filter((x) => x === true).length}／${n} 題</p>${review()}` : '<p class="quiz-summary">已交卷，老師結束測驗後就能看到答案與解析。</p>'}</section>`;
  quizIndex = Math.min(Math.max(0, quizIndex), n - 1);
  const dots = q.questions.map((_, i) => `<button class="quiz-dot ${mine.answers[i] !== null ? 'done' : ''} ${i === quizIndex ? 'current' : ''}" data-action="quiz-go" data-q="${i}" aria-label="第 ${i + 1} 題">${i + 1}</button>`).join('');
  const left = mine.answers.filter((x) => x === null).length;
  return `<section class="quiz-card" data-testid="quiz-card"><h2>${icon('target')}${esc(q.title)}　${countdown(quizDeadline(q.run))}</h2><div class="quiz-dots">${dots}</div><p class="mini-label">第 ${quizIndex + 1}／${n} 題・${esc(q.questions[quizIndex].topic)}</p><div class="quiz-stem">${md(q.questions[quizIndex].stem)}</div>${quizFigure(q.questions[quizIndex].figure)}${options(quizIndex, mine.answers[quizIndex])}<div class="tool-row">${btn('上一題', 'quiz-go', 'quiet', 'prev', `data-q="${quizIndex - 1}" ${quizIndex ? '' : 'disabled'}`)}${btn('下一題', 'quiz-go', 'quiet', 'next', `data-q="${quizIndex + 1}" ${quizIndex < n - 1 ? '' : 'disabled'}`)}</div>${btn(left ? `交卷（還有 ${left} 題沒作答）` : '交卷', 'quiz-submit', 'primary full', 'check', 'data-testid="quiz-submit"')}</section>`;
}
function pkProgressText(q: QuizView, me: number, opp: number) {
  const a = quizScoreOf(q, me),
    b = quizScoreOf(q, opp);
  return `你 ${a.correct}✓（${a.answered} 題）｜${seatName(opp)} ${b.correct}✓（${b.answered} 題）`;
}
/** 測驗狀態變了（開始倒數結束、時間到、新的作答）：重畫面板與大螢幕。 */
function refreshQuiz() {
  if (!view) return;
  if (user?.role === 'teacher') {
    const panel = document.querySelector('#quiz-panel');
    if (panel && !panel.contains(document.activeElement)) panel.innerHTML = quizPanel();
    const host = document.querySelector('#quiz-board-host');
    if (host) host.innerHTML = quizBoardHtml();
    return;
  }
  const card = document.querySelector('#student-answer');
  if (card && view.quiz && card.querySelector('[data-testid="quiz-card"]')) card.innerHTML = quizCard();
}
/* ───────────── 彈幕 ───────────── */
/** 老師端：開關、清除、紀錄（紀錄看得到座號，畫面上匿名的不顯示）。 */
function danmakuTools() {
  const v = view!,
    s = v.session;
  const toggle = btn(s.danmakuOpen ? '關閉彈幕' : '開啟彈幕', 'danmaku-toggle', s.danmakuOpen ? 'primary' : 'secondary', 'spark', `data-testid="danmaku-toggle" aria-pressed="${!!s.danmakuOpen}" ${s.ended ? 'disabled' : ''}`);
  const list = (v.danmaku || []).slice(-12).reverse();
  const log = list.length
    ? `<details class="danmaku-log"><summary>彈幕紀錄（${v.danmaku!.length}）・只有老師看得到座號</summary><ol>${list.map((d) => `<li><b>${d.seat} 號</b>${d.anon ? '<small>匿名</small>' : ''}<span>${esc(d.text)}</span></li>`).join('')}</ol></details>`
    : '';
  return `<div class="tool-row">${toggle}${s.danmakuOpen || list.length ? btn('清除彈幕', 'danmaku-clear', 'quiet', 'trash') : ''}</div>${log}`;
}
let danmakuBar = false,
  danmakuDraft = '',
  danmakuAnon = true;
/** 學生端：按上方的「彈幕」後出現的輸入列（在畫面上方，iPad 鍵盤不會擋住）。 */
function danmakuStudentHtml() {
  const s = view?.session;
  if (!s?.danmakuOpen || s.ended) {
    danmakuBar = false; // 關閉後下次開放時，先收起輸入列
    danmakuDraft = '';
    return '';
  }
  if (!danmakuBar) return '';
  // 平常不限則數；作答開放中只有答對的同學能送，這一題每人 3 則
  const q = view?.danmakuQuota;
  const locked = !!q?.limited && (!q.eligible || q.left <= 0);
  const status = !q?.limited ? '' : !q.eligible ? '作答中：答對這一題才能送' : q.left > 0 ? `答對了！這題還能送 ${q.left} 則` : '這題的 3 則用完了';
  return `<form class="danmaku-bar" id="danmaku-form" data-testid="danmaku-bar"><input id="danmaku-text" maxlength="30" autocomplete="off" placeholder="${locked ? status : '說點什麼…（30 字內）'}" value="${esc(danmakuDraft)}" aria-label="彈幕文字" ${locked ? 'disabled' : ''}><label class="check-line"><input type="checkbox" id="danmaku-anon" ${danmakuAnon ? 'checked' : ''}> 匿名</label>${status ? `<small class="danmaku-left" data-testid="danmaku-left">${status}</small>` : ''}${btn('送出', 'danmaku-send', 'primary', 'arrow', `data-testid="danmaku-send" ${locked ? 'disabled' : ''}`)}${btn('', 'danmaku-bar', 'icon-btn', 'x', 'aria-label="收起彈幕"')}</form>`;
}
/** 學生端：老師公布結果、自己答對時播一次答對音效。 */
const sounded = new Set<string>();
function cheerIfCorrect(v: SessionView, silent = false) {
  if (user?.role !== 'student' || !v.session.resultsVisible) return;
  const a = v.lesson.slides[v.session.slideIndex]?.activity;
  const mine = a ? v.answers.filter((x) => x.userId === user!.id && x.activityId === a.id).pop() : undefined;
  if (!mine || mine.correct !== true || sounded.has(mine.id)) return;
  sounded.add(mine.id);
  if (!silent) playCorrect();
}
let clockKey = '';
/** 每半秒：更新倒數文字；狀態跨過界線（時間到、換下一輪）時重畫相關區塊。 */
function tickClocks() {
  if (!view || !user) return;
  const now = serverTime();
  document.querySelectorAll<HTMLElement>('[data-deadline]').forEach((el) => {
    el.textContent = clockText(Number(el.dataset.deadline) - now);
    el.classList.toggle('urgent', Number(el.dataset.deadline) - now < 10_000);
  });
  document.querySelectorAll<HTMLElement>('[data-pk-start]').forEach((el) => {
    el.textContent = String(Math.max(0, Math.ceil((Number(el.dataset.pkStart) - now) / 1000)));
  });
  const qz = view.quiz;
  const quizPhase = qz && view.session.quiz ? (qz.run.startedAt > now ? 'pre' : quizOver(qz.run, now) ? 'over' : 'on') : '';
  if (qz && qz.run.mode === 'pk' && quizPhase === 'on') {
    // 電腦對手的進度由各裝置依時間表自己算
    if (user.role === 'teacher' && qz.bot) {
      const host = document.querySelector('#quiz-board-host');
      if (host) host.innerHTML = quizBoardHtml();
    }
    const prog = document.querySelector('#pk-progress');
    const m = qz.run.matches?.find((x) => x.a === user!.seat || x.b === user!.seat);
    if (prog && m) prog.textContent = pkProgressText(qz, user.seat!, m.a === user.seat ? m.b : m.a);
  }
  const mine = myPractice();
  const p = view.practice;
  const teacherStates = user.role === 'teacher' && p ? p.entries.map((e) => { const st = practiceStatus(p.run, e, now); return `${st.status}${st.round}`; }).join() : '';
  const key = `${timeUp()}|${mine ? `${mine.st.status}${mine.st.round}` : ''}|${teacherStates}|${quizPhase}`;
  if (key === clockKey) return;
  const first = !clockKey;
  clockKey = key;
  if (first) return;
  if (quizPhase) refreshQuiz();
  if (user.role === 'teacher') {
    const a = view.lesson.slides[view.session.slideIndex]?.activity;
    const actions = document.querySelector('#activity-actions');
    if (a && actions && !actions.contains(document.activeElement)) actions.innerHTML = activityActions(a);
    const board = document.querySelector('#practice-board');
    if (a && board) board.innerHTML = practiceBoard(a);
    return;
  }
  if (document.querySelector('.sketch-overlay') || document.querySelector('.modal')) return;
  renderSession();
  // 這一輪逾時：寬限過後向伺服器拿這一輪的答案
  if (mine) setTimeout(() => void refreshSession(), 3200);
}
setInterval(tickClocks, 500);
unlockSound();
/** 學生改過 AI 的辨識結果（老師批改時要留意照片和文字是否一致）。 */
function workEdited(v: CanvasAnswer) {
  return !!v.work && !!v.ocr && v.work.replace(/\s+/g, '') !== v.ocr.replace(/\s+/g, '');
}
/* ───────────── 投影講解：全班的作答（照片＋辨識稿＋分數），點一份放大 ───────────── */
let wallAnon = false;
function wallScore(id: string) {
  const g = gradeFor(id);
  if (!g) return '<em class="st">未批改</em>';
  return g.depth === 'verdict' ? `<em class="st ${g.correct ? 'right' : 'wrong'}">${g.correct ? '✓ 對' : '✗ 錯'}</em>` : `<em class="st graded">${g.total}/${g.max}</em>`;
}
function workWallHtml(a: Activity, focusId?: string) {
  const list = workAnswers(view!, a);
  const who = (seat: number, i: number) => (wallAnon ? `第 ${i + 1} 份` : `${seat} 號`);
  const head = `<div class="wall-head"><span>${list.length} 份作答</span><label class="check-line"><input type="checkbox" id="wall-anon" ${wallAnon ? 'checked' : ''}> 投影時隱藏座號</label></div>`;
  if (focusId) {
    const i = list.findIndex((x) => x.id === focusId);
    const x = list[i];
    if (x) {
      const v = x.value as CanvasAnswer;
      const g = gradeFor(x.id);
      return `${head}<div class="wall-focus" data-testid="wall-focus"><figure>${v.imageId ? `<img src="/api/images/${esc(v.imageId)}" alt="${who(x.seat, i)}的作答">` : ''}</figure><div class="wall-focus-text"><h3>${who(x.seat, i)} ${wallScore(x.id)}</h3>${v.work ? `<div class="work-lines big">${workHtml(v.work, g?.marks)}</div>` : v.text ? `<p>${md(v.text)}</p>` : '<p class="muted">（沒有辨識稿）</p>'}${g?.feedback ? `<p class="wall-feedback">${md(g.feedback)}</p>` : ''}</div></div><div class="tool-row wall-nav">${btn('上一份', 'wall-focus', 'quiet', 'prev', `data-id="${esc(list[i - 1]?.id || '')}" ${i > 0 ? '' : 'disabled'}`)}${btn('回到全班', 'wall-back', 'secondary', 'grid')}${btn('下一份', 'wall-focus', 'quiet', 'next', `data-id="${esc(list[i + 1]?.id || '')}" ${i < list.length - 1 ? '' : 'disabled'}`)}</div>`;
    }
  }
  const cards = list
    .map((x, i) => {
      const v = x.value as CanvasAnswer;
      return `<button class="wall-card" data-action="wall-focus" data-id="${esc(x.id)}" data-testid="wall-card"><header><b>${who(x.seat, i)}</b>${wallScore(x.id)}</header>${v.imageId ? `<img src="/api/images/${esc(v.imageId)}" alt="" loading="lazy">` : ''}${v.work ? `<div class="work-lines small clamp">${workHtml(v.work, gradeFor(x.id)?.marks)}</div>` : ''}</button>`;
    })
    .join('');
  return `${head}<div class="wall-grid">${cards || '<p class="muted">還沒有作答。</p>'}</div>`;
}
let wallFocus: string | undefined;
function showWall(a: Activity, focusId?: string) {
  wallFocus = focusId;
  const body = document.querySelector('.modal.full .modal-body');
  if (body && document.querySelector('[data-wall]')) body.innerHTML = workWallHtml(a, focusId);
  else {
    modal(`投影講解：${md(a.prompt)}`, workWallHtml(a, focusId), 'full');
    document.querySelector('.modal')?.setAttribute('data-wall', '');
  }
}
function responsesHtml(a: Activity) {
  const r = filteredResponses(a);
  // 投影講解是老師要投影時才按，放在收起的清單外面
  const wall = r.wall ? `<div class="tool-row">${btn('投影講解：全班作答', 'work-wall', 'secondary', 'screen', 'data-testid="work-wall"')}</div>` : '';
  return `${drawFilterBar()}${wall}<details class="answer-list" ${answerListOpen ? 'open' : ''} data-testid="answer-list"><summary>${r.summary}</summary>${r.body}</details>`;
}
/** 個別作答預設收起（老師的畫面常常投影出去，答案不能被還沒作答的同學看到）；老師打開後保持打開。 */
let answerListOpen = false;
/** 依「全部／未作答／答對／答錯」列出個別作答。 */
function filteredResponses(a: Activity): { summary: string; body: string; wall: boolean } {
  const pick = filterSeats(),
    label = pick ? `${FILTER_LABEL[drawFilter]} ` : '';
  if (drawFilter === 'unanswered') {
    const seats = [...(pick || [])].sort((x, y) => x - y);
    const roster = new Map((view!.roster || []).map((r) => [r.seat, r]));
    return {
      summary: `個別作答（未作答 ${seats.length} 人）`,
      wall: false,
      body: seats.length
        ? `<div class="seat-chips" data-testid="unanswered-list">${seats.map((n) => `<span class="seat-chip ${roster.get(n)?.online ? '' : 'off'}"><b class="chip-seat">${n}</b><small>${roster.get(n)?.online ? '上線・還沒交' : '未上線'}</small></span>`).join('')}</div>`
        : '<p class="muted">全班都交了。</p>',
    };
  }
  const all = latestBySeat(view!, a.id);
  const answers = all.filter((x) => !pick || pick.has(x.seat));
  const empty = pick ? `<p class="muted">目前沒有${FILTER_LABEL[drawFilter]}的同學${a.rubric ? '（或還沒批改）' : ''}。</p>` : '<p class="muted">等待第一份作答。</p>';
  if (a.type === 'canvas' || (a.type === 'short' && a.rubric))
    return { summary: `個別作答（${label}${answers.length} 份）`, wall: a.type === 'canvas' && all.length > 0, body: answers.length ? submissionGrid(a, answers) : empty };
  if (a.type === 'short')
    return {
      summary: `個別作答（${answers.length} 人）`,
      wall: false,
      body: answers.length ? `<div class="short-responses">${answers.map((x) => `<div><span class="seat-tag">${x.seat}</span><p>${esc(x.value)}</p></div>`).join('')}</div>` : empty,
    };
  // 可拍照的數值題：直接送答案的看小卡，拍照交的另外列成批改格（照片＋辨識稿＋分數）
  const photos = a.type === 'numeric' && a.photoWork ? workAnswers(view!, a).filter((x) => !pick || pick.has(x.seat)) : [];
  const grid = photos.length ? `<p class="mini-label">拍照交計算過程（${photos.length} 份）</p>${submissionGrid(a, photos)}` : '';
  // 每一位同學的作答（選擇、量表、數值、操作），對錯用顏色與 ✓／✗ 標出
  const tries = (seat: number) => view!.answers.filter((x) => x.activityId === a.id && x.seat === seat).length;
  const right = answers.filter((x) => x.correct).length,
    wrong = answers.filter((x) => x.correct === false).length;
  return {
    summary: `個別作答（${label}${answers.length} 人${!pick && (right || wrong) ? `・✓ ${right}・✗ ${wrong}` : ''}）`,
    wall: photos.length > 0,
    body: answers.length
      ? `<div class="seat-chips">${answers.map((x) => `<span class="seat-chip ${x.correct ? 'ok' : x.note ? 'warn' : x.correct === undefined ? '' : 'no'}" title="${esc(answerText(x.value))}${x.note ? `（${esc(x.note)}）` : ''}"><b class="chip-seat">${x.seat}${x.correct === undefined ? '' : x.correct ? ' ✓' : ' ✗'}${tries(x.seat) > 1 ? `<small>改 ${tries(x.seat) - 1} 次</small>` : ''}</b>${chipAnswer(x, a)}</span>`).join('')}</div>${grid}`
      : empty,
  };
}
function submissionGrid(a: Activity, answers: Answer[]) {
  return `<div class="submission-grid" data-testid="submission-grid">${answers
      .map((x) => {
        const g = gradeFor(x.id);
        const v = x.value as CanvasAnswer;
        const state = grading.inFlight.has(x.id) ? '<em class="st busy">批改中</em>' : g ? `<em class="st ${g.released ? 'released' : g.needsReview ? 'review' : 'graded'} ${g.depth === 'verdict' ? (g.correct ? 'right' : 'wrong') : ''}">${g.depth === 'verdict' ? (g.correct ? '✓ 對' : '✗ 錯') : `${g.total}/${g.max}`}${g.needsReview ? ' ⚠' : ''}</em>` : '<em class="st">未批改</em>';
        return `<button class="submission" data-action="open-grade" data-id="${esc(x.id)}"><span class="seat">${x.seat}</span>${typeof x.value === 'string' ? `<span class="excerpt">${esc(x.value.slice(0, 60))}</span>` : v.imageId ? `<img src="/api/images/${esc(v.imageId)}" alt="${x.seat} 號作答" loading="lazy">` : `<span class="excerpt">${esc(v.text || '')}</span>`}${v.work ? `<span class="excerpt work">${esc(v.work.split('\n').slice(-2).join('　'))}</span>` : ''}${workEdited(v) ? '<em class="st edited">改過辨識</em>' : ''}${state}</button>`;
      })
      .join('') || '<p class="muted">等待第一份作答。</p>'}</div>`;
}
/** 個別作答小卡：多小題逐題排成 (1) (2) (3)、各自標 ✓／✗，算式照課本樣式顯示（不用「｜」分隔，免得看成絕對值）。 */
function chipAnswer(x: Answer, a?: Activity) {
  // 選擇題：選了哪幾個（A、B…）
  if (a && (a.type === 'single' || a.type === 'multiple')) {
    const picked = (Array.isArray(x.value) ? x.value : [x.value]) as number[];
    return `<span class="chip-items"><span class="chip-item">${picked.map((i) => String.fromCharCode(65 + i)).join('、')}</span></span>`;
  }
  if (a?.type === 'scale') return `<span class="chip-items"><span class="chip-item">${esc(String(x.value))}</span></span>`;
  if (Array.isArray(x.value) && typeof x.value[0] === 'string')
    return `<span class="chip-items">${(x.value as string[]).map((v, i) => {
      const ok = x.itemsCorrect?.[i];
      return `<span class="chip-item ${ok === undefined ? '' : ok ? 'ok' : 'no'}"><b>${ok === undefined ? '' : ok ? '✓' : '✗'}(${i + 1})</b>${answerHtml(v)}</span>`;
    }).join('')}</span>${x.note ? '<small class="chip-note">未化簡</small>' : ''}`;
  if (typeof x.value === 'string') return `<span class="chip-items"><span class="chip-item">${answerHtml(x.value)}</span></span>${x.note ? '<small class="chip-note">未化簡</small>' : ''}`;
  if (isPhotoValue(x.value)) {
    const g = gradeFor(x.id);
    const items = x.itemsCorrect?.map((ok, i) => (ok ? `<b>✓(${i + 1})</b>` : '')).join('') || '';
    return `<span class="chip-items"><span class="chip-item">📷${g ? ` ${g.total}/${g.max}` : ' 批改中'}</span>${items ? `<span class="chip-item ok">${items}</span>` : ''}</span>`;
  }
  return `<small>${esc(answerText(x.value)).slice(0, 14)}</small>`;
}
function gradingBar(a: Activity) {
  const answers = workAnswers(view!, a);
  const ungraded = answers.filter((x) => needsGrading(x.id) && !grading.inFlight.has(x.id)).length;
  const redpen = prefs.get('redpen', false);
  const right = answers.filter((x) => gradeFor(x.id)?.correct ?? (gradeFor(x.id) ? gradeFor(x.id)!.total === gradeFor(x.id)!.max : false)).length;
  const graded = answers.filter((x) => gradeFor(x.id));
  const released = graded.filter((x) => gradeFor(x.id)!.released).length;
  const review = graded.filter((x) => gradeFor(x.id)!.needsReview).length;
  const auto = prefs.get('autoGrade', true);
  return `<section class="grading-bar" id="grading-bar"><div class="grading-status"><strong>${icon('stamp')}${redpen ? '第 2 層：紅筆批改' : '第 1 層：判斷對錯'}</strong><span>${graded.length}/${answers.length} 已批改${graded.length ? `・答對 ${right}` : ''}${review ? `・<b class="warn">${review} 需覆核</b>` : ''}${released ? `・${released} 已發回` : ''}</span>${grading.total ? `<span class="grading-progress"><i style="width:${Math.round((grading.done / grading.total) * 100)}%"></i></span>` : ''}</div><div class="tool-row">${btn(`${fastGrade() && answers.some((x) => hasWork(x.id)) ? 'AI 快速批改' : redpen ? 'AI 紅筆批改' : 'AI 判斷對錯'}${ungraded ? `（${ungraded}）` : ''}`, 'grade-all', 'primary', 'wand', `${ungraded ? '' : 'disabled'} data-testid="grade-all"`)}${btn(released && released === graded.length ? '收回批改' : '發回批改', 'release-grades', 'secondary', 'arrow', graded.length ? '' : 'disabled')}</div><label class="switch"><input type="checkbox" data-pref="redpen" ${redpen ? 'checked' : ''} data-testid="toggle-redpen"><span></span>第 2 層：依規準給分＋紅筆批註</label><label class="switch"><input type="checkbox" data-pref="autoGrade" ${auto ? 'checked' : ''}><span></span>收件後自動 AI 批改</label><label class="switch"><input type="checkbox" data-pref="fastGrade" ${fastGrade() ? 'checked' : ''} data-testid="toggle-fast"><span></span>快速批改：拍照作答依學生確認的辨識稿給分（不看圖、不畫紅筆）</label>${config.aiConfigured ? '' : '<p class="muted small-text">尚未設定 API key：會產生「模擬批改」供試用流程。</p>'}</section>`;
}
function toolbar() {
  return `<div class="teaching-toolbar" role="toolbar" aria-label="白板工具">${[
    ['cursor', 'cursor', '操作'],
    ['pen', 'pen', '畫筆'],
    ['erase', 'erase', '橡皮擦'],
    ['laser', 'laser', '雷射'],
    ['spot', 'spot', '聚光'],
  ]
    .map(([tool, glyph, label]) =>
      btn(label, 'tool', `tool-button ${currentTool === tool ? 'selected' : ''}`, glyph, `data-tool="${tool}" data-testid="tool-${tool === 'spot' ? 'spotlight' : tool}" aria-pressed="${currentTool === tool}" title="${label}"`),
    )
    .join('')}<label class="color-picker" title="畫筆顏色"><input type="color" id="pen-color" value="${color}" aria-label="畫筆顏色"></label>${btn('復原', 'undo', 'tool-button', 'undo', 'title="復原"')}${btn('清空', 'clear-board', 'tool-button', 'trash', 'title="清空筆跡"')}</div>`;
}
const FILTER_LABEL = { all: '', unanswered: '未作答', correct: '答對', incorrect: '答錯' };
/** 搶答層：開放搶答時，學生畫面正中間出現大顆圓形按鈕；有人搶到時，全班畫面正中間顯示座號。 */
let buzzPressed = '';
let buzzDismissed = '';
function buzzLayerHtml() {
  const s = view?.session;
  if (s && !s.buzzOpen && !s.buzzWinner) buzzPressed = ''; // 老師重設後，下一輪可以再按
  if (!s || !user || s.ended || (!s.buzzOpen && !s.buzzWinner)) return '';
  const key = `${s.id}:${s.buzzWinner?.at || 'open'}`;
  if (s.buzzWinner) {
    if (buzzDismissed === key) return '';
    const mine = user.role === 'student' && s.buzzWinner.seat === user.seat;
    return `<div class="buzz-layer result ${mine ? 'mine' : ''}" data-testid="buzz-result"><div class="buzz-card"><span>${icon('bolt')}${mine ? '你搶到了！' : '搶答成功'}</span><strong>${s.buzzWinner.seat}<small> 號</small></strong><div class="buzz-actions">${user.role === 'teacher' ? btn('重設搶答', 'buzz-reset', 'secondary', 'undo') : ''}${btn(user.role === 'teacher' ? '關閉' : '知道了', 'buzz-dismiss', 'quiet', user.role === 'teacher' ? 'x' : 'check', `data-key="${key}"`)}</div></div></div>`;
  }
  if (user.role === 'teacher')
    return `<div class="buzz-layer waiting teacher"><div class="buzz-card"><span class="pulse">${icon('bolt')}搶答開放中…</span>${btn('取消', 'buzz-reset', 'quiet', 'x')}</div></div>`;
  const pressed = buzzPressed === s.id;
  return `<div class="buzz-layer waiting" data-testid="buzz-layer"><button type="button" class="buzz-big" data-action="buzz" data-testid="buzz-button" ${pressed ? 'disabled' : ''} aria-label="搶答">${icon('bolt')}<span>${pressed ? '已按下' : '搶答'}</span></button><p>${pressed ? '等老師公布誰最快…' : '想回答就按！'}</p></div>`;
}
function renderBuzzLayer() {
  const host = document.querySelector('#buzz-root');
  if (host) host.innerHTML = buzzLayerHtml();
}
/** 老師端座位表：每個座號是否已作答（這一頁的題目）、是否上線；未上線的不列入抽籤。 */
/** 抽籤範圍選了「未作答／答對／答錯」時符合的座號（和伺服器抽籤的規則一樣）；「全部」回傳 null。 */
/** 換到另一頁（另一題）時，範圍回到「全部」。 */
let drawFilterSlide = -1;
function syncDrawFilter() {
  const i = view?.session.slideIndex ?? -1;
  if (i !== drawFilterSlide) {
    drawFilterSlide = i;
    drawFilter = 'all';
  }
}
function filterSeats(filter?: typeof drawFilter): Set<number> | null {
  syncDrawFilter();
  filter ??= drawFilter;
  const a = view?.lesson.slides[view.session.slideIndex]?.activity;
  if (!view || filter === 'all' || !a) return null;
  if (filter === 'unanswered') return new Set((view.roster || []).filter((x) => !x.answered).map((x) => x.seat));
  const want = filter === 'correct';
  return new Set(
    latestBySeat(view, a.id)
      .filter((x) => {
        const g = gradeFor(x.id);
        const verdict = x.correct !== undefined ? x.correct : g ? (g.depth === 'verdict' ? g.correct : g.total === g.max) : undefined;
        return verdict === want;
      })
      .map((x) => x.seat),
  );
}
const DRAW_FILTERS = [
  ['all', '全部'],
  ['unanswered', '未作答'],
  ['correct', '答對'],
  ['incorrect', '答錯'],
] as const;
/** 看作答狀況＋抽籤範圍：選一個，下面的個別作答只列這些同學，抽籤也只從這些同學抽。 */
function drawFilterBar() {
  syncDrawFilter();
  return `<div class="draw-filter" role="group" aria-label="看作答狀況與抽籤範圍" data-testid="draw-filter">${DRAW_FILTERS.map(([k, l]) => {
    const n = k === 'all' ? (view?.roster || []).length : filterSeats(k)?.size ?? 0;
    return `<button class="${drawFilter === k ? 'selected' : ''}" data-action="draw-filter" data-filter="${k}" aria-pressed="${drawFilter === k}">${l}<small>${n}</small></button>`;
  }).join('')}</div>`;
}
function drawLabel(a: Activity | undefined) {
  syncDrawFilter();
  return `抽籤${a && drawFilter !== 'all' ? `（${FILTER_LABEL[drawFilter]}）` : ''}`;
}
function seatMapInner() {
  const r = view?.roster;
  if (!r?.length) return '';
  const a = view!.lesson.slides[view!.session.slideIndex]?.activity;
  const on = r.filter((x) => x.online).length,
    done = r.filter((x) => x.answered).length;
  const waiting = r.filter((x) => x.online && !x.answered).map((x) => x.seat);
  const head = a
    ? `<strong>已作答 <b class="ok">${done}</b>・未作答 <b class="warn">${r.length - done}</b></strong><small>上線 ${on} / ${r.length}</small>`
    : `<strong>上線 <b class="ok">${on}</b> / ${r.length}</strong><small>這一頁沒有題目</small>`;
  const pick = filterSeats();
  const seats = r
    .map((x) => {
      const state = a && x.answered ? 'done' : x.online ? 'on' : 'off';
      const label = `${x.seat} 號：${a ? (x.answered ? '已作答' : '未作答') : ''}${a ? '・' : ''}${x.online ? '上線' : '未上線'}`;
      const mark = pick ? (pick.has(x.seat) ? ' pick' : ' faded') : '';
      // PK 配對中：點號碼選人（第一下選人、第二下配成一組）
      const lobby = user?.role === 'teacher' ? view!.session.pkLobby : null;
      if (lobby) {
        const inPair = lobby.pairs.some(([p, r]) => p === x.seat || r === x.seat),
          waiting = lobby.waiting === x.seat;
        return `<button type="button" class="seat ${state} pk-seat ${inPair ? 'paired' : ''} ${waiting ? 'waiting' : ''}" data-action="pk-pick" data-seat="${x.seat}" title="${label}" aria-label="${label}" ${inPair ? 'disabled' : ''}>${x.seat}</button>`;
      }
      return `<span class="seat ${state}${mark}" title="${label}" aria-label="${label}">${x.seat}</span>`;
    })
    .join('');
  // 選了抽籤範圍：符合的座號框起來，其他變淡，老師一眼看到會抽到誰
  const scope = pick ? `<p class="seat-scope" data-testid="seat-scope">${FILTER_LABEL[drawFilter]} ${pick.size} 人${pick.size ? `：${[...pick].sort((x, y) => x - y).join('、')} 號` : ''}（抽籤只抽上線的）</p>` : '';
  const legend = `<p class="seat-legend">${a ? '<i class="done"></i>已作答' : ''}<i class="on"></i>${a ? '上線未作答' : '上線'}<i class="off"></i>未上線（不抽籤）</p>`;
  const list = a && view!.session.activityOpen && waiting.length ? `<p class="seat-waiting">還沒交：${waiting.join('、')} 號</p>` : '';
  return `<div class="seat-head">${head}</div><div class="seat-grid">${seats}</div>${scope}${list}${legend}`;
}
function eventsHtml() {
  if (!view) return '';
  const s = view.session;
  return `${s.drawnSeat ? `<div class="draw-result">${icon('dice')}<div><small>抽中${s.drawFilter && s.drawFilter !== 'all' ? `（${FILTER_LABEL[s.drawFilter]}）` : ''}</small><strong>${s.drawnSeat}<span> 號</span></strong></div></div>` : ''}${s.buzzOpen || s.buzzWinner ? `<div class="buzz-panel">${s.buzzWinner ? `<span>${icon('bolt')}搶答成功</span><strong>${s.buzzWinner.seat}<small> 號</small></strong>` : `<span class="pulse">${icon('bolt')}搶答開放中</span>`}${user?.role === 'teacher' ? btn('重設', 'buzz-reset', 'quiet', 'undo') : ''}</div>` : ''}`;
}

/* ───────────── 批改佇列（教師端並行） ───────────── */
const grading = {
  failed: 0,
  lastError: '',
  queue: [] as { sessionId: string; answerId: string; depth: 'verdict' | 'full' | 'fast' }[],
  inFlight: new Set<string>(),
  running: 0,
  done: 0,
  total: 0,
};
/** 第 2 層（紅筆批改）預設關閉，只做第 1 層「判斷對錯」。 */
const gradeDepth = (): 'verdict' | 'full' => (prefs.get('redpen', false) ? 'full' : 'verdict');
function needsGrading(answerId: string) {
  const g = gradeFor(answerId);
  if (!g) return true;
  // 開啟第 2 層時，只有 AI 判過對錯的作答要補紅筆；教師已親自判定的不覆蓋。
  return gradeDepth() === 'full' && g.depth === 'verdict' && g.mode !== 'teacher';
}
/** 快速批改（預設開啟）：拍照作答有學生確認過的辨識稿時，只依文字給分，不看圖、不畫紅筆。 */
const fastGrade = () => prefs.get('fastGrade', true);
function hasWork(answerId: string) {
  const v = view?.answers.find((x) => x.id === answerId)?.value as CanvasAnswer | undefined;
  return !!v?.work;
}
/** depth 省略：有辨識稿而且開啟快速批改就用 'fast'，否則依第 1／2 層設定；老師指定的層級（例如紅筆重改）照指定。 */
function enqueueGrades(answerIds: string[], depth?: 'verdict' | 'full' | 'fast') {
  if (!view) return;
  for (const answerId of answerIds) {
    if (grading.inFlight.has(answerId) || grading.queue.some((q) => q.answerId === answerId)) continue;
    const d = depth ?? (fastGrade() && hasWork(answerId) ? 'fast' : gradeDepth());
    grading.queue.push({ sessionId: view.session.id, answerId, depth: d });
    grading.total++;
  }
  pumpGrades();
  refreshPanelParts();
}
function pumpGrades() {
  const limit = prefs.get('concurrency', 10);
  while (grading.running < limit && grading.queue.length) {
    const job = grading.queue.shift()!;
    grading.running++;
    grading.inFlight.add(job.answerId);
    void api<{ grade?: Grade; pending?: boolean }>('/ai', 'POST', {
      task: 'grade',
      sessionId: job.sessionId,
      answerId: job.answerId,
      votes: prefs.get('votes', 1),
      depth: job.depth,
    })
      .then((r) => {
        if (r.grade && view?.session.id === job.sessionId) {
          view.grades = view.grades.filter((g) => g.answerId !== job.answerId).concat(r.grade);
        }
      })
      .catch((e) => {
        grading.failed++;
        grading.lastError = (e as Error).message;
        toast(`批改失敗：${grading.lastError}`, true);
      })
      .finally(() => {
        grading.running--;
        grading.inFlight.delete(job.answerId);
        grading.done++;
        if (!grading.queue.length && !grading.running) {
          if (grading.total)
            toast(
              grading.failed
                ? `批改結束：${grading.done - grading.failed} 份完成、${grading.failed} 份失敗（${grading.lastError}）`
                : `批改完成 ${grading.done} 份，請覆核後再發回。`,
              !!grading.failed,
            );
          grading.done = grading.total = grading.failed = 0;
        }
        refreshPanelParts();
        pumpGrades();
      });
  }
}
function autoGradeCheck() {
  if (!view || user?.role !== 'teacher' || screenMode() || !prefs.get('autoGrade', true)) return;
  const a = view.lesson.slides[view.session.slideIndex]?.activity;
  if (!a?.rubric) return;
  const ids = workAnswers(view, a)
    .filter((x) => needsGrading(x.id))
    .map((x) => x.id);
  if (ids.length) enqueueGrades(ids);
}
function refreshPanelParts() {
  if (!view || user?.role !== 'teacher') return;
  const a = view.lesson.slides[view.session.slideIndex]?.activity;
  if (!a) return;
  const responses = document.querySelector('#responses');
  if (responses && !screenMode()) responses.innerHTML = responsesHtml(a);
  const bar = document.querySelector('#grading-bar');
  if (bar && a.rubric) bar.outerHTML = gradingBar(a);
  const board = document.querySelector('#practice-board');
  if (board) board.innerHTML = practiceBoard(a);
  // 投影講解開著：新的作答與批改即時更新
  const wall = document.querySelector('.modal[data-wall] .modal-body');
  if (wall) wall.innerHTML = workWallHtml(a, wallFocus);
}
function openGrade(answerId: string) {
  if (!view) return;
  const answer = view.answers.find((x) => x.id === answerId);
  const a = view.lesson.slides.find((s) => s.activity?.id === answer?.activityId)?.activity;
  if (!answer || !a?.rubric) return;
  const g = gradeFor(answerId);
  const v = answer.value as CanvasAnswer;
  const text = typeof answer.value === 'string' ? answer.value : v.text;
  const list = workAnswers(view, a);
  const pos = list.findIndex((x) => x.id === answerId);
  modal(
    `${answer.seat} 號作答`,
    `<div class="grade-layout"><div class="grade-work">${v.imageId ? `<div class="redpen-host big" data-image="${esc(v.imageId)}"></div>` : ''}${v.work ? `<section class="work-confirmed"><h3>學生確認的辨識稿${workEdited(v) ? '<em class="st edited">學生改過</em>' : ''}</h3><div class="work-lines">${workHtml(v.work, g?.marks)}</div>${workEdited(v) ? `<details><summary>AI 原始辨識</summary><pre>${esc(v.ocr!)}</pre></details>` : ''}</section>` : ''}${text ? `<blockquote class="student-text">${md(text)}</blockquote>` : ''}${g?.transcript && !v.work ? `<details><summary>AI 轉寫的手寫內容</summary><pre>${esc(g.transcript)}</pre></details>` : ''}${g?.basis === 'text' ? '<p class="muted small-text">快速批改：依辨識稿給分（沒有看圖、沒有紅筆）。需要時按「AI 紅筆批改」看圖重改。</p>' : ''}</div><form id="grade-form" class="grade-form" data-answer="${esc(answerId)}">${g ? `<p class="grade-meta">${tag(g.depth === 'verdict' ? '第 1 層・對錯' : '第 2 層・紅筆')}${tag(g.mode === 'live' ? 'AI 初評' : g.mode === 'mock' ? '模擬批改' : '教師批改', g.mode === 'teacher' ? 'green' : '')}${g.confidence !== undefined ? tag(`信心 ${g.confidence}`, g.needsReview ? 'warn' : '') : ''}${g.votes && g.votes.length > 1 ? tag(`投票 ${g.votes.join('、')}`) : ''}${g.released ? tag('已發回', 'green') : ''}</p>` : '<p class="muted">尚未批改。</p>'}<section class="layer1"><h3>第 1 層：判斷對錯</h3>${g?.depth === 'verdict' ? `<p class="verdict ${g.correct ? 'ok' : 'no'}">${icon(g.correct ? 'check' : 'x')}<span>${g.correct ? '判定：正確' : '判定：不正確'}</span></p>` : ''}<label>給學生的一句話<textarea name="feedback" rows="2" maxlength="600">${esc(g?.feedback || '')}</textarea></label><div class="grade-actions"><button type="submit" class="btn primary" name="mode" value="right" data-testid="judge-right">${icon('check')}<span>判對</span></button><button type="submit" class="btn secondary" name="mode" value="wrong" data-testid="judge-wrong">${icon('x')}<span>判錯</span></button>${btn('AI 判斷', 'regrade', 'quiet', 'wand', `data-id="${esc(answerId)}" data-depth="verdict"`)}</div></section><details class="layer2" ${g?.depth === 'full' || prefs.get('redpen', false) ? 'open' : ''}><summary>第 2 層：依規準給分＋紅筆批註</summary>${a.rubric.criteria
      .map((c) => {
        const s = g?.scores.find((x) => x.criterionId === c.id);
        return `<fieldset class="criterion"><legend>${md(c.label)}<small>${c.points} 分</small></legend>${c.levels
          .slice()
          .sort((x, y) => y.score - x.score)
          .map((l) => `<label class="level"><input type="radio" name="c-${esc(c.id)}" value="${l.score}" ${s?.score === l.score ? 'checked' : ''}><b>${l.score}</b><span>${md(l.description)}</span></label>`)
          .join('')}<input name="m-${esc(c.id)}" placeholder="評語（選填）" value="${esc(s?.comment || '')}"></fieldset>`;
      })
      .join('')}<div class="grade-actions">${btn('AI 紅筆批改', 'regrade', 'secondary', 'wand', `data-id="${esc(answerId)}" data-depth="full"`)}${v.imageId && g?.depth === 'full' ? btn('紅筆圖', 'download-redpen', 'quiet', 'download', `data-id="${esc(answerId)}"`) : ''}<button type="submit" class="btn secondary" name="mode" value="save">${icon('save')}<span>儲存分數</span></button><button type="submit" class="btn primary" name="mode" value="release">${icon('arrow')}<span>儲存並發回</span></button></div></details>${a.rubric.reference ? `<details><summary>參考解答</summary><p>${md(a.rubric.reference)}</p></details>` : ''}<div class="grade-nav">${btn('上一位', 'open-grade', 'quiet', 'prev', `data-id="${esc(list[pos - 1]?.id || '')}" ${pos > 0 ? '' : 'disabled'}`)}${btn('下一位', 'open-grade', 'quiet', 'next', `data-id="${esc(list[pos + 1]?.id || '')}" ${pos < list.length - 1 ? '' : 'disabled'}`)}</div></form></div>`,
    'full',
  );
  mountRedpens();
}

/* ───────────── 同步 ───────────── */
function viewSignature(v: SessionView) {
  const s = v.session;
  // 學生端：自己被派到（或結束）補救練習也要整個重畫
  const mine = user?.role === 'student' ? (v.practice?.entries.length ?? 0) : '';
  return [s.id, s.slideIndex, s.activityOpen, s.resultsVisible, s.followTeacher, s.ended, s.activityDeadline ?? '', s.practice?.startedAt ?? '', s.danmakuOpen ?? false, s.photoOpen ?? false, `${s.quiz?.id ?? ''}/${s.quiz?.endedAt ?? ''}`, s.pkLobby ? JSON.stringify(s.pkLobby) : '', `${v.danmakuQuota?.limited ?? ''}/${v.danmakuQuota?.eligible ?? ''}`, mine].join(':');
}
function gradesSignature(v: SessionView) {
  return v.grades.map((g) => `${g.answerId}:${g.total}:${g.released}:${g.gradedAt}`).sort().join('|');
}
function pollDelay() {
  if (document.hidden) return 10000;
  const s = view?.session;
  if (!s) return 4000;
  return s.activityOpen || s.buzzOpen || grading.running ? 2000 : 5000;
}
/**
 * 備援輪詢：只在即時連線（WebSocket）中斷時才真的發出請求。
 * 老師端另外每 30 秒更新一次：學生 iPad 闔上時連線不一定會關，上線名單要靠這次更新變灰。
 */
let lastRosterRefresh = 0;
function schedulePoll(fn: () => Promise<void>) {
  clearTimeout(poll);
  const tick = async () => {
    // 開放作答時每 6 秒補一次（即時連線若無聲斷掉，作答名單也不會落後太久）
    const every = view?.session.activityOpen ? 6000 : 30000;
    const roster = user?.role === 'teacher' && !!view && Date.now() - lastRosterRefresh > every;
    if (!liveOpen || roster) {
      lastRosterRefresh = Date.now();
      await fn().catch(() => {});
    }
    poll = setTimeout(tick, pollDelay());
  };
  poll = setTimeout(tick, pollDelay());
}

/* ───────────── 即時連線：伺服器有變化才推送，取代每 2 秒輪詢 ───────────── */
let live: WebSocket | null = null,
  liveKey = '',
  liveOpen = false,
  liveRetry = 0,
  liveTimer: ReturnType<typeof setTimeout> | undefined,
  liveHeartbeat: ReturnType<typeof setInterval> | undefined,
  liveHeard = 0;
function disconnectLive() {
  clearTimeout(liveTimer);
  clearInterval(liveHeartbeat);
  liveOpen = false;
  liveKey = '';
  if (live) {
    const ws = live;
    live = null;
    ws.onclose = null;
    ws.close(1000);
  }
}
function connectLive() {
  if (!user || typeof WebSocket === 'undefined') return;
  const key = user.role === 'student' ? 'student' : view?.session.id;
  if (!key) return;
  if (live && liveKey === key && live.readyState <= WebSocket.OPEN) return;
  disconnectLive();
  liveKey = key;
  const url = new URL('/api/live', location.href);
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  url.hash = '';
  url.search = '';
  if (user.role === 'teacher') url.searchParams.set('sessionId', key);
  const ws = new WebSocket(url);
  live = ws;
  ws.onopen = () => {
    liveRetry = 0;
    liveOpen = true;
    updateSync(true);
    // 心跳由伺服器自動回覆，不會喚醒 Durable Object；只用來讓手機網路保持連線。
    // 兩次心跳都沒有回音（連線無聲斷掉）就主動重連。
    liveHeard = Date.now();
    liveHeartbeat = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (Date.now() - liveHeard > 100000) return ws.close();
      ws.send('ping');
    }, 45000);
  };
  ws.onmessage = (e) => {
    liveHeard = Date.now();
    if (e.data === 'pong' || typeof e.data !== 'string') return;
    try {
      const msg = JSON.parse(e.data) as { type: string; view: SessionView | { session: null } };
      if (msg.type === 'view') {
        syncClock(msg.view);
        void applyView(msg.view, currentRoute);
      }
    } catch {}
  };
  ws.onclose = () => {
    clearInterval(liveHeartbeat);
    if (live !== ws) return;
    live = null;
    liveOpen = false;
    updateSync(false);
    // 斷線期間改用輪詢備援，並以 1、2、4…最多 30 秒的間隔重連。
    const wanted = liveKey;
    liveTimer = setTimeout(
      () => {
        if (liveKey === wanted) {
          liveKey = '';
          connectLive();
        }
      },
      Math.min(30000, 1000 * 2 ** liveRetry++),
    );
  };
}
async function refreshSession() {
  if (pollBusy || !user || !view) return;
  pollBusy = true;
  const route = currentRoute;
  try {
    const next = await api<SessionView | { session: null }>(
      user.role === 'student' ? '/student/session' : `/sessions/${view.session.id}`,
    );
    await applyView(next, route);
  } catch (e) {
    if ((e as { status?: number }).status === 401) {
      clearTimeout(poll);
      disconnectLive();
      user = null;
      view = null;
      board?.destroy();
      board = null;
      toast('登入已到期，請重新登入。', true);
      landing(currentRoute.startsWith('/student') ? 'student' : 'teacher');
    } else updateSync(false);
  } finally {
    pollBusy = false;
  }
}
/**
 * 套用伺服器送來的最新畫面（輪詢或即時推送共用）。依到達順序一次套用一份，
 * 而且同一堂課不會用舊版（revision 較小）蓋掉新版：避免全班同時交卷時，
 * 先到的舊畫面在等待中被後套用，老師端停在「未作答」。
 */
let applyChain: Promise<void> = Promise.resolve();
function applyView(next: SessionView | { session: null }, route: string): Promise<void> {
  const run = applyChain.then(() => applyViewNow(next, route));
  applyChain = run.catch(() => {});
  return run;
}
async function applyViewNow(next: SessionView | { session: null }, route: string) {
  if (!user || route !== currentRoute) return;
  {
    if (!next.session) {
      if (user.role === 'student') {
        view = null;
        studentWaiting();
      }
      return;
    }
    const n = next as SessionView;
    if (view && n.session.id === view.session.id && n.session.revision < view.session.revision) return;
    if (!view) {
      // 學生在等待畫面時，老師開始上課：直接進入課堂。
      view = n;
      studentSlide = n.session.slideIndex;
      draft = [];
      if (n.session.activityOpen) studentTab = 'answer';
      cheerIfCorrect(n, true); // 重新整理時不重播
      renderSession();
      updateSync(true);
      return;
    }
    const busy = document.querySelector('.sketch-overlay') || document.querySelector('.modal');
    if (viewSignature(n) !== viewSignature(view)) {
      await board?.flush();
      const changedSlide = n.session.slideIndex !== view.session.slideIndex;
      const changed = n.session.slideIndex !== view.session.slideIndex;
      // 輪詢可能跳過中間狀態（換頁＋開放作答發生在同一個間隔內），換頁時也視為新開放。
      const opened = n.session.activityOpen && (!view.session.activityOpen || changed);
      const newQuiz = !!n.session.quiz && n.session.quiz.id !== view.session.quiz?.id;
      view = n;
      if (changedSlide) {
        draft = [];
        editing = false;
        if (user.role === 'student') studentTab = 'slide';
      }
      if (opened && user.role === 'student') studentTab = 'answer';
      // 新的一次測驗／PK／錯題練習：清掉上一次的提示，從第 1 題開始
      if (newQuiz && user.role === 'student') {
        studentTab = 'answer';
        quizIndex = 0;
        quizFlash = '';
      }
      if (user.role === 'student' && n.practice?.entries.length && !view.practice?.entries.length) studentTab = 'answer';
      if (!busy) renderSession();
    } else {
      const gradesChanged = gradesSignature(n) !== gradesSignature(view);
      const answersChanged = n.answers.length !== view.answers.length;
      const practiceChanged = JSON.stringify(n.practice ?? null) !== JSON.stringify(view.practice ?? null);
      const quizChanged = JSON.stringify(n.quiz ?? null) !== JSON.stringify(view.quiz ?? null);
      view = n;
      if (quizChanged && !busy) refreshQuiz();
      if (practiceChanged) {
        const a = n.lesson.slides[n.session.slideIndex]?.activity;
        const board = document.querySelector('#practice-board');
        if (user.role === 'teacher' && a && board) board.innerHTML = practiceBoard(a);
        if (user.role === 'student' && !busy) renderSession();
      }
      const count = document.querySelector('#answer-count');
      if (count) count.textContent = `${n.aggregate.submitted} / ${n.aggregate.total}`;
      const agg = document.querySelector('#aggregate');
      if (agg) agg.innerHTML = aggregateHtml(n);
      const events = document.querySelector('#class-events');
      if (events) events.innerHTML = eventsHtml();
      const seatMap = document.querySelector('#seat-map');
      if (seatMap) seatMap.innerHTML = seatMapInner();
      if (user.role === 'teacher') {
        const tools = document.querySelector('#danmaku-tools');
        if (tools && !tools.contains(document.activeElement)) {
          const open = tools.querySelector('details')?.open; // 重畫時保留紀錄的展開狀態
          tools.innerHTML = danmakuTools();
          if (open) tools.querySelector('details')?.setAttribute('open', '');
        }
        syncDanmaku(n.danmaku, n.session.danmakuClearedAt, serverTime());
      }
      renderBuzzLayer();
      if (user.role === 'teacher' && (gradesChanged || answersChanged)) refreshPanelParts();
      if (user.role === 'student' && gradesChanged) {
        const a = n.lesson.slides[n.session.slideIndex]?.activity;
        const fb = document.querySelector('#student-feedback');
        if (fb && a) {
          fb.innerHTML = feedbackHtml(a);
          mountRedpens();
          if (fb.innerHTML) toast('老師發回了你的批改回饋');
        }
      }
      const idx = user.role === 'teacher' || n.session.followTeacher ? n.session.slideIndex : studentSlide;
      const sid = n.lesson.slides[idx]?.id;
      board?.setRemote((sid && n.whiteboard[boardKey(sid)]) || []);
    }
    if (view) cheerIfCorrect(view);
    autoGradeCheck();
    await retryPending();
    updateSync(true);
  }
}
function updateSync(online: boolean) {
  const el = document.querySelector<HTMLElement>('#sync-status');
  if (el) {
    el.className = `sync-status ${online ? (liveOpen ? 'live' : '') : 'offline'}`;
    el.title = liveOpen ? '即時連線：有變化才更新' : online ? '輪詢備援中' : '連線中斷';
    el.innerHTML = `<i></i>${online ? (liveOpen ? '即時連線' : '已連線') : '重新連線中'}`;
  }
}
function studentWaiting() {
  app.className = 'waiting-room';
  app.innerHTML = `<header>${brand()}${btn('登出', 'logout', 'quiet', 'logout')}</header><main><div class="waiting-graph" aria-hidden="true"><i></i><i></i><i></i><i></i></div><h1>你已入座，<br>等老師開始上課。</h1><p>${esc(user?.name)}・畫面會自動更新。</p></main>`;
}
async function loadStudent() {
  const result = await api<SessionView | { session: null }>('/student/session');
  if (result.session) {
    view = result as SessionView;
    studentSlide = view.session.slideIndex;
    draft = [];
    renderSession();
  } else studentWaiting();
  connectLive();
  schedulePoll(async () => {
    if (view) await refreshSession();
    else await applyView(await api<SessionView | { session: null }>('/student/session'), currentRoute);
  });
}
async function renderRoute() {
  const version = ++routeVersion;
  currentRoute = location.hash.slice(1) || '/dashboard';
  clearTimeout(poll);
  // 離開課堂畫面就關閉即時連線；同一堂課切換一般／大屏則沿用。
  const sessionId = /^\/(?:session|screen)\/([\w-]+)/.exec(currentRoute)?.[1];
  if (!(user?.role === 'student' || (sessionId && sessionId === liveKey))) disconnectLive();
  if (!sessionId) clearDanmakuLayer();
  await board?.flush().catch((e) => toast(e.message, true));
  board?.destroy();
  board = null;
  viz?.destroy();
  viz = null;
  previewViz?.destroy();
  previewViz = null;
  if (!user) {
    landing(currentRoute.startsWith('/student') ? 'student' : 'teacher');
    return;
  }
  try {
    if (user.role === 'student') {
      await loadStudent();
      return;
    }
    if (currentRoute.startsWith('/session/') || currentRoute.startsWith('/screen/')) {
      view = await api<SessionView>(`/sessions/${currentRoute.split('/')[2]}`);
      if (version !== routeVersion) return;
      renderSession();
      connectLive();
      schedulePoll(refreshSession);
      return;
    }
    view = null;
    await loadDashboard();
    if (version !== routeVersion) return;
    if (currentRoute === '/classes') renderClasses();
    else if (currentRoute === '/records') renderRecords();
    else if (currentRoute === '/settings') await renderSettings();
    else if (currentRoute === '/generate') renderGenerate();
    else if (currentRoute.startsWith('/lesson/')) {
      const lesson = dashboard!.lessons.find((l) => l.id === currentRoute.split('/')[2]);
      if (lesson) editLesson(lesson);
      else navigate('/dashboard');
    } else renderDashboard();
  } catch (e) {
    toast((e as Error).message, true);
    if (!app.innerHTML) app.innerHTML = '<p>讀取失敗，請重新整理。</p>';
  }
}

/* ───────────── 學生作答 ───────────── */
async function buildValue(a: Activity): Promise<unknown> {
  if (a.type === 'manipulate') {
    const vars = viz?.vars() || {};
    const keys = a.record?.length ? a.record : Object.keys(vars).filter((k) => k !== 'step');
    return { vars: Object.fromEntries(keys.filter((k) => k in vars).map((k) => [k, vars[k]])) };
  }
  if (a.type === 'canvas') {
    const sk = sketches.get(a.id);
    if (!sketchHasContent(sk)) throw new Error('請先在畫布上作答或拍照。');
    let imageId: string | undefined;
    if (sk!.strokes.length || sk!.photo) {
      const status = document.querySelector('#answer-status');
      if (status) status.textContent = '正在上傳作答圖片…';
      const dataUrl = await renderSketch(sk!, a.canvas);
      imageId = (await api<{ imageId: string }>(`/sessions/${view!.session.id}/images`, 'POST', { dataUrl })).imageId;
    }
    return { ...(sk!.text.trim() ? { text: sk!.text.trim() } : {}), ...(imageId ? { imageId } : {}), source: sk!.photo ? 'photo' : 'draw' };
  }
  if (a.type === 'numeric' && a.items) {
    const values = a.items.map((_, i) => (Array.isArray(draft) ? String((draft as string[])[i] ?? '') : '').replace(/−/g, '-').trim());
    if (values.some((v) => !v)) throw new Error(`請完成全部 ${a.items.length} 小題。`);
    return values;
  }
  if (a.type === 'numeric' && typeof draft === 'string') return draft.replace(/−/g, '-');
  return draft;
}
async function submitAnswer(value?: unknown) {
  if (!view || user?.role !== 'student') return;
  const a = view.lesson.slides[view.session.slideIndex].activity;
  if (!a) return;
  if (!view.session.activityOpen || view.session.ended) {
    toast('請等待老師開放作答。', true);
    return;
  }
  if (timeUp()) {
    toast('時間到，作答已鎖定。', true);
    return renderSession();
  }
  if (value === undefined) value = await buildValue(a);
  if ((Array.isArray(value) && !value.length) || (typeof value === 'string' && !value.trim())) {
    toast('先作答，再送出。', true);
    return;
  }
  const key = `${pendingPrefix}${user.id}.${view.session.id}.${a.id}`;
  const payload = { submissionId: crypto.randomUUID(), activityId: a.id, value };
  try {
    localStorage.setItem(key, JSON.stringify({ sessionId: view.session.id, ...payload }));
  } catch {}
  const status = document.querySelector('#answer-status');
  if (status) status.textContent = '正在儲存…';
  try {
    await api(`/sessions/${view.session.id}/answers`, 'POST', payload);
    localStorage.removeItem(key);
    editing = false;
    view = await api(`/sessions/${view.session.id}`);
    renderSession();
    toast('已送出');
  } catch (e) {
    const code = (e as { status?: number }).status;
    if (code && code < 500) {
      localStorage.removeItem(key);
      toast((e as Error).message, true);
    } else {
      if (status) status.textContent = '待送出：恢復連線後會自動重試。';
      toast('答案已暫存，等待連線。');
    }
  }
}
async function retryPending() {
  if (user?.role !== 'student') return;
  for (const key of Object.keys(localStorage).filter((k) => k.startsWith(`${pendingPrefix}${user!.id}.`))) {
    try {
      const p = JSON.parse(localStorage.getItem(key)!);
      await api(`/sessions/${p.sessionId}/answers`, 'POST', p);
      localStorage.removeItem(key);
      toast('暫存的答案已送達');
      if (view?.session.id === p.sessionId) {
        view = await api(`/sessions/${p.sessionId}`);
        renderSession();
      }
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status && status < 500) {
        localStorage.removeItem(key);
        toast('暫存答案未被接受：' + (e as Error).message, true);
      }
    }
  }
}
async function startSketch(a: Activity, photo?: File) {
  let state = sketches.get(a.id) || emptySketch();
  if (photo) {
    const p = await compressPhoto(photo);
    state = { ...state, photo: p.dataUrl, width: p.width, height: p.height, strokes: [] };
  }
  const result = await openSketch({
    title: TYPE_LABEL[a.type],
    prompt: a.prompt,
    kind: a.canvas,
    allowPhoto: a.allowPhoto !== false,
    state,
    criteria: a.rubric?.criteria.map((c) => c.label),
  });
  if (!result) return;
  sketches.set(a.id, result);
  if (sketchHasContent(result) && (result.strokes.length || result.photo))
    sketchPreview.set(a.id, await renderSketch(result, a.canvas));
  else sketchPreview.delete(a.id);
  const host = document.querySelector('#student-answer');
  if (host) host.innerHTML = answerForm(a);
}

/* ───────────── AI ───────────── */
async function analyze(task: 'lesson-review' | 'response-summary', lessonId?: string) {
  modal('AI 教學助手', `<div class="ai-loading">${icon('spark')}正在分析…</div>`);
  try {
    const result = await api('/ai', 'POST', {
      task,
      lessonId,
      sessionId: view?.session.id,
      activityId: view?.lesson.slides[view.session.slideIndex].activity?.id,
    });
    modal('AI 教學助手', `${tag(result.mode === 'mock' ? '模擬分析・未呼叫 AI' : 'AI 分析草稿')}<div class="ai-output">${esc(result.text)}</div><p class="muted small-text">請以教材與學生原始作答為依據，覆核後再採用。</p>`, 'wide');
  } catch (e) {
    modal('AI 暫時無法使用', `<p>${esc((e as Error).message)}</p><p class="muted">其他課堂功能不受影響。</p>`);
  }
}
async function chooseFile(handler: (data: any) => Promise<void>, maxBytes = 1_048_000) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > maxBytes) throw new Error(`檔案超過 ${Math.ceil(maxBytes / 1048576)} MB 限制。`);
      await handler(JSON.parse(await file.text()));
    } catch (e) {
      toast((e as Error).message, true);
    }
  });
  input.click();
}
async function showJoinInfo(code: string) {
  const url = new URL(location.href);
  url.hash = '/student';
  url.search = '';
  url.searchParams.set('class', code);
  const qr = await QRCode.toDataURL(url.href, { width: 260, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#1f2a56ff', light: '#ffffffff' } });
  modal(
    '學生加入課堂',
    `<div class="join-qr"><img src="${qr}" width="260" height="260" alt="學生入口 QR Code" data-testid="join-qr"></div><label>班級代碼<code class="class-code">${esc(code)}</code></label><label>學生入口<input readonly value="${esc(url.href)}" aria-label="學生入口連結"></label>${btn('複製連結', 'copy-student', 'primary full', 'arrow', `data-code="${esc(code)}"`)}<p class="muted small-text">${['127.0.0.1', 'localhost'].includes(location.hostname) ? '目前是本機網址，其他裝置連不到；部署後的 QR Code 才能讓學生掃描。' : '個人識別碼請個別發給學生，不要投影完整名冊。'}</p>`,
  );
}

/* ───────────── 事件 ───────────── */
async function action(el: HTMLElement) {
  const act = el.dataset.action,
    id = el.dataset.id;
  switch (act) {
    case 'close-modal':
      return closeModal();
    case 'login-tab':
      return landing(el.dataset.role);
    case 'logout':
      disconnectLive();
      await board?.flush();
      await api('/logout', 'POST', {});
      for (const key of Object.keys(localStorage).filter((k) => k.startsWith(pendingPrefix))) localStorage.removeItem(key);
      user = null;
      view = null;
      sketches.clear();
      sketchPreview.clear();
      return navigate('/dashboard');
    case 'dashboard':
      return navigate('/dashboard');
    case 'go-generate':
      return navigate('/generate');
    case 'edit':
      return navigate(`/lesson/${id}`);
    case 'new-lesson': {
      const l = NEW_LESSON();
      await api(`/lessons/${l.id}`, 'PUT', { lesson: l });
      return navigate(`/lesson/${l.id}`);
    }
    case 'preview-lesson': {
      try {
        const l = JSON.parse(document.querySelector<HTMLTextAreaElement>('#lesson-json')!.value) as Lesson;
        const select = document.querySelector<HTMLSelectElement>('#preview-slide')!;
        const i = Math.min(Number(select.value) || 0, l.slides.length - 1);
        select.innerHTML = l.slides.map((s, k) => `<option value="${k}" ${k === i ? 'selected' : ''}>${k + 1}. ${esc(plain(s.title))}</option>`).join('');
        previewSlide(l, i);
      } catch (e) {
        toast(`JSON 格式錯誤：${(e as Error).message}`, true);
      }
      return;
    }
    case 'save-lesson': {
      const l = JSON.parse(document.querySelector<HTMLTextAreaElement>('#lesson-json')!.value);
      l.title = document.querySelector<HTMLInputElement>('#lesson-title')!.value;
      const saved = await api<{ lesson: Lesson }>(`/lessons/${l.id}`, 'PUT', { lesson: l });
      toast('教材已儲存');
      await loadDashboard();
      if (!currentRoute.endsWith(saved.lesson.id)) return navigate(`/lesson/${saved.lesson.id}`);
      return editLesson(saved.lesson);
    }
    case 'import':
      return chooseFile(async (lesson) => {
        if (!lesson.slides) throw new Error('這不是課程 JSON。');
        lesson.id = `lesson-${crypto.randomUUID().slice(0, 8)}`;
        await api(`/lessons/${lesson.id}`, 'PUT', { lesson });
        toast('已匯入為新的課程');
        navigate('/dashboard');
      });
    case 'export-lesson': {
      const l = dashboard?.lessons.find((l) => l.id === id);
      if (l) download(`${l.id}.json`, JSON.stringify(l, null, 2));
      return;
    }
    case 'review-lesson':
      return analyze('lesson-review', id);
    case 'start':
      if (!dashboard!.classes.length)
        return modal('先建立班級', `<p>建立班級並發下個人識別碼後，就可以開始上課。</p>${btn('建立班級', 'new-class', 'primary', 'users')}`);
      return modal(
        '開始上課',
        `<form id="start-form" data-lesson="${esc(id)}"><label>授課班級<select name="classId">${dashboard!.classes.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}・${esc(c.code)}</option>`).join('')}</select></label><button class="btn primary full" type="submit">${icon('play')}<span>開始上課</span></button></form>`,
      );
    case 'resume':
      return navigate(`/session/${id}`);
    case 'new-class':
      return modal(
        '建立班級',
        `<form id="class-form"><label>班級名稱<input name="name" required maxlength="60" placeholder="例如：809"></label><label>學生人數<input name="seats" type="number" min="1" max="60" value="30" required></label><p class="muted small-text">建立後會下載各座號的隨機識別碼，請個別發給學生。</p><button type="submit" class="btn primary full">建立班級</button></form>`,
      );
    case 'reset-code':
      return modal(
        '重發個人識別碼',
        `<p>舊識別碼與該座號目前的登入會失效。</p><label>座號<input id="reset-seat" type="number" min="1" max="${el.dataset.seats}" value="1" inputmode="numeric"></label>${btn('確認重發', 'confirm-reset', 'primary', 'shield', `data-id="${id}"`)}`,
      );
    case 'confirm-reset': {
      const seat = Number(document.querySelector<HTMLInputElement>('#reset-seat')!.value);
      const result = await api(`/classes/${id}/credentials`, 'POST', { seat });
      return modal('新的識別碼', `<p>${seat} 號的新識別碼只顯示這一次：</p><code class="class-code">${esc(result.credential.code)}</code>`);
    }
    case 'join-code':
      return showJoinInfo(el.dataset.code!);
    case 'copy-student': {
      const url = new URL(location.href);
      url.hash = '/student';
      url.search = '';
      url.searchParams.set('class', el.dataset.code!);
      try {
        await navigator.clipboard.writeText(url.href);
        toast('學生入口已複製');
      } catch {
        toast('無法存取剪貼簿，請手動複製連結。', true);
      }
      return;
    }
    case 'backup': {
      const b = await api('/backup');
      download('classroom-backup.json', JSON.stringify(b, null, 2));
      return toast('備份已下載（含作答與分數），請妥善保存。');
    }
    case 'restore':
      return modal('還原備份', `<p>匯入會與現有資料合併；建議先下載目前的備份。</p>${btn('選擇備份 JSON', 'restore-file', 'primary', 'upload')}`);
    case 'restore-file':
      return chooseFile(async (backup) => {
        await api('/restore', 'POST', { backup });
        closeModal();
        toast('備份已匯入');
        await renderRoute();
      }, 9 * 1024 * 1024);
    case 'export-session': {
      const r = await fetch(`/api/sessions/${id}/export?format=csv`);
      if (!r.ok) throw new Error('無法匯出資料');
      download(`classroom-${id}.csv`, await r.text(), 'text/csv;charset=utf-8');
      return;
    }
    case 'delete-session':
      return modal('刪除這次課堂？', `<p>作答、批改與作答照片都會刪除。請先確認已備份。</p>${btn('確認刪除', 'confirm-delete', 'danger-fill', 'trash', `data-id="${id}"`)}`);
    case 'confirm-delete':
      await api(`/sessions/${id}`, 'DELETE');
      closeModal();
      await renderRoute();
      return toast('課堂紀錄已刪除');
    case 'play-animation': {
      // 授課中：在投影片區內播放，工具照常可用
      if (view && document.querySelector('#slide-stage')) {
        const t = user?.role === 'teacher' || view.session.followTeacher ? view.session.slideIndex : studentSlide;
        const sl = view.lesson.slides[t];
        if (sl?.animation?.src) {
          await board?.flush().catch((e) => toast(e.message, true));
          figZoom = { slideId: sl.id, index: -1 };
          return renderSession();
        }
      }
      const poster = el.dataset.poster ? ` poster="/api/assets/lessons/${esc(el.dataset.poster)}"` : '';
      return modal(
        `🎬 ${esc(el.dataset.caption || '動畫')}`,
        `<video class="anim-player" src="/api/assets/lessons/${esc(el.dataset.src!)}"${poster} controls autoplay muted playsinline preload="auto" data-testid="animation-player"></video>`,
        'wide',
      );
    }
    case 'close-figure':
      await board?.flush().catch((e) => toast(e.message, true));
      figZoom = null;
      return renderSession();
    case 'zoom-figure':
      // 授課中：在投影片區內放大，工具照常可用；課程編輯預覽：沿用對話框
      if (view && document.querySelector('#slide-stage') && el.dataset.index) {
        const t = user?.role === 'teacher' || view.session.followTeacher ? view.session.slideIndex : studentSlide;
        const sl = view.lesson.slides[t];
        if (sl) {
          await board?.flush().catch((e) => toast(e.message, true));
          figZoom = { slideId: sl.id, index: Number(el.dataset.index) };
          return renderSession();
        }
      }
      return modal(
        '課本截圖',
        `<img class="figure-zoom" src="/api/assets/lessons/${esc(el.dataset.src!)}" alt="${esc(el.dataset.alt || '')}">`,
        'wide',
      );
    case 'prune-photos': {
      const days = Number((document.querySelector('#prune-days') as HTMLSelectElement | null)?.value || 90);
      return modal(
        `清除 ${days} 天前的作答照片？`,
        `<p>照片刪除後無法復原（備份也不含照片）。課堂紀錄裡的辨識稿、批改分數與圈記號都會保留。</p>${btn('確認清除', 'confirm-prune', 'danger-fill', 'trash', `data-days="${days}"`)}`,
      );
    }
    case 'confirm-prune': {
      const r = await api<{ removed: number }>('/settings/prune-photos', 'POST', { days: Number(el.dataset.days) });
      closeModal();
      toast(`已清除 ${r.removed} 張照片`);
      return renderSettings();
    }
    case 'test-ai': {
      const out = document.querySelector('#ai-test-result');
      if (out) out.textContent = '測試中…（約 2–10 秒）';
      const r = await api<{ ok: boolean; ms: number; model: string; reply?: string; error?: string }>('/settings/ai/test', 'POST', {});
      if (out) {
        out.className = `small-text ${r.ok ? 'ok-text' : 'warn-text'}`;
        out.textContent = r.ok ? `✓ 連線正常：${r.model} 回覆「${r.reply}」，耗時 ${(r.ms / 1000).toFixed(1)} 秒` : `✗ 連線失敗：${r.error}`;
      }
      return;
    }
    case 'clear-ai':
      await api('/settings/ai', 'DELETE');
      config.aiConfigured = false;
      toast('已移除 API key');
      return renderSettings();
  }
  if (!view) return;
  const s = view.session,
    a = view.lesson.slides[s.slideIndex]?.activity;
  switch (act) {
    case 'screen':
      await board?.flush();
      return navigate(`/${screenMode() ? 'session' : 'screen'}/${s.id}`);
    case 'fullscreen':
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch {
        toast('這個瀏覽器不支援全螢幕，可用「加入主畫面」開啟。');
      }
      return;
    case 'student-tab':
      studentTab = el.dataset.tab as 'slide' | 'answer';
      app.classList.toggle('show-panel', studentTab === 'answer');
      document.querySelectorAll('.phone-tabs button').forEach((b) => b.classList.toggle('selected', (b as HTMLElement).dataset.tab === studentTab));
      return;
    case 'tool':
      currentTool = el.dataset.tool as Tool;
      board?.setTool(currentTool);
      document.querySelectorAll('[data-action="tool"]').forEach((b) => {
        b.classList.toggle('selected', (b as HTMLElement).dataset.tool === currentTool);
        b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.tool === currentTool));
      });
      return;
    case 'undo':
      return board?.undo();
    case 'clear-board':
      return modal('清空這頁的筆跡？', `<p>只清空目前這一頁，仍可按「復原」。</p>${btn('清空', 'confirm-clear', 'danger-fill', 'trash')}`);
    case 'confirm-clear':
      board?.clear();
      return closeModal();
    case 'prev-slide':
    case 'next-slide':
    case 'go-slide': {
      const current = user!.role === 'teacher' || s.followTeacher ? s.slideIndex : studentSlide;
      const index = act === 'go-slide' ? Number(el.dataset.index) : current + (act === 'next-slide' ? 1 : -1);
      if (index < 0 || index >= view.lesson.slides.length) return;
      if (user!.role === 'teacher') return control('slide', { index });
      if (!s.followTeacher) {
        studentSlide = index;
        draft = [];
        renderSession();
      }
      return;
    }
    case 'toggle-activity':
      return control('activity', s.activityOpen ? { value: false } : { value: true, seconds: prefs.get('activitySeconds', 60) });
    case 'extend-time':
      await control('extend', { seconds: Number(el.dataset.seconds) });
      return toast(`已延長 ${Number(el.dataset.seconds) >= 60 ? `${Number(el.dataset.seconds) / 60} 分鐘` : `${el.dataset.seconds} 秒`}`);
    case 'practice-start': {
      await control('practice-start', { includeUnanswered: practiceWithUnanswered });
      return toast(`已把原題再派給 ${view.practice?.entries.length ?? 0} 位同學`);
    }
    case 'practice-end':
      return control('practice-end');
    case 'quiz-class':
      quizBoardOpen = true;
      return control('quiz-class', { seconds: quizClassSeconds() });
    case 'quiz-review':
      quizBoardOpen = true;
      return control('quiz-review', { seconds: 600 });
    case 'quiz-end':
    case 'quiz-close':
    case 'pk-lobby':
    case 'pk-random':
    case 'pk-draw':
    case 'pk-bot':
      return control(act);
    case 'pk-buzz':
      return control('pk-buzz', { value: !s.pkLobby?.buzz });
    case 'pk-remove':
      return control('pk-remove', { index: Number(el.dataset.index) });
    case 'pk-pick':
      return control('pk-pick', { seat: Number(el.dataset.seat) });
    case 'pk-start':
    case 'pk-again':
      quizBoardOpen = true;
      return control(act, { seconds: pkSeconds() });
    case 'quiz-board':
      quizBoardOpen = !quizBoardOpen;
      return refreshQuiz();
    case 'pk-buzz-in': {
      const r = await api<{ paired: boolean }>(`/sessions/${s.id}/pk-buzz`, 'POST', {});
      toast(r.paired ? '搶到了！準備上場 PK' : '搶到了！等待對手');
      return refreshSession();
    }
    case 'quiz-go':
      quizIndex = Number(el.dataset.q);
      return refreshQuiz();
    case 'quiz-choose': {
      const q = view.quiz;
      if (!q || quizSending) return;
      const i = Number(el.dataset.q),
        choice = Number(el.dataset.choice);
      const n = q.questions.length;
      q.mine ||= { answers: Array(n).fill(null), correct: Array(n).fill(null) };
      if (q.run.mode !== 'class' && q.mine.answers[i] !== null) return; // 已經答過（畫面還沒換）
      quizSending = true;
      document.querySelectorAll<HTMLButtonElement>('[data-action="quiz-choose"]').forEach((b) => (b.disabled = true));
      try {
        // 送題位（錯題練習每人的題目不同；全班測驗與 PK 題位就是第幾題）
        const r = await api<{ correct?: boolean; answer?: number; explanation?: string; revision: number }>(`/sessions/${s.id}/quiz`, 'POST', { runId: q.run.id, q: q.questions[i].slot, choice });
        // 比這次作答更舊的畫面（送出前就在路上的推送或輪詢）一律丟掉
        view!.session.revision = Math.max(view!.session.revision, r.revision);
        // 等回應時畫面可能已經換成較舊的推送：結果寫進「現在的」畫面
        const cur = view?.quiz?.run.id === q.run.id ? view.quiz : q;
        const k = cur.questions.findIndex((x) => x.slot === q.questions[i].slot);
        if (k < 0) return;
        cur.mine ||= { answers: cur.questions.map(() => null), correct: cur.questions.map(() => null) };
        cur.mine.answers[k] = choice;
        if (q.run.mode !== 'class') {
          cur.mine.correct[k] = r.correct ?? null;
          if (cur.mine.answers.every((x) => x !== null)) cur.mine.done ??= 0;
          if (r.answer !== undefined) Object.assign(cur.questions[k], { answer: r.answer, ...(r.explanation ? { explanation: r.explanation } : {}) });
          if (r.correct) playCorrect();
          const x = cur.questions[k];
          // 錯題練習附上正解與解析，看懂再做下一題；PK 只說對錯（節奏快）
          quizFlash =
            q.run.mode === 'review' && x.answer !== undefined
              ? `<b>${r.correct ? '✓ 答對了！' : '✗ 答錯了'}</b> 正解 ${String.fromCharCode(65 + x.answer)}. ${md(x.options[x.answer])}${x.explanation ? `<small>${md(x.explanation)}</small>` : ''}`
              : r.correct ? '✓ 上一題答對！' : '✗ 上一題答錯了';
        } else if (i === quizIndex && quizIndex < n - 1) quizIndex++;
      } finally {
        quizSending = false;
        refreshQuiz();
      }
      return;
    }
    case 'quiz-submit': {
      const q = view.quiz;
      if (!q) return;
      const left = (q.mine?.answers || q.questions.map(() => null)).filter((x) => x === null).length;
      if (left) return modal('確定交卷？', `<p>還有 ${left} 題沒作答，交卷後就不能再改。</p>${btn('確定交卷', 'quiz-submit-confirm', 'primary', 'check', 'data-testid="quiz-submit-confirm"')}`);
      await api(`/sessions/${s.id}/quiz`, 'POST', { runId: q.run.id, submit: true });
      return refreshSession();
    }
    case 'quiz-submit-confirm': {
      closeModal();
      const q = view.quiz;
      if (!q) return;
      await api(`/sessions/${s.id}/quiz`, 'POST', { runId: q.run.id, submit: true });
      return refreshSession();
    }
    case 'photo-toggle':
      await control('photo', { value: !s.photoOpen });
      return toast(view.session.photoOpen ? '已派發拍照題：學生可以拍課本上的計算過程' : '已收回拍照題');
    case 'danmaku-toggle':
      await control('danmaku', { value: !s.danmakuOpen });
      return toast(view.session.danmakuOpen ? '彈幕已開啟：學生可以送出彈幕' : '彈幕已關閉');
    case 'danmaku-clear':
      return control('danmaku-clear');
    case 'danmaku-bar': {
      danmakuBar = !danmakuBar;
      const root = document.querySelector('#danmaku-root');
      if (root) root.innerHTML = danmakuStudentHtml();
      document.querySelector('.danmaku-btn')?.classList.toggle('selected', danmakuBar);
      if (danmakuBar) document.querySelector<HTMLInputElement>('#danmaku-text')?.focus();
      return;
    }
    case 'danmaku-send': {
      const text = danmakuDraft.trim();
      if (!text) return toast('先輸入文字。', true);
      const r = await api<{ left?: number }>(`/sessions/${s.id}/danmaku`, 'POST', { text, anon: danmakuAnon });
      if (r.left !== undefined && view.danmakuQuota) view.danmakuQuota.left = r.left;
      danmakuDraft = '';
      const root = document.querySelector('#danmaku-root');
      if (root) root.innerHTML = danmakuStudentHtml();
      document.querySelector<HTMLInputElement>('#danmaku-text:not([disabled])')?.focus();
      return toast(r.left === undefined ? '彈幕已送出' : r.left ? `彈幕已送出（這題還能送 ${r.left} 則）` : '彈幕已送出（這題的 3 則用完了）');
    }
    case 'submit-practice': {
      const value = practiceDraft.value.replace(/−/g, '-').trim();
      if (!value) return toast('先作答，再送出。', true);
      const r = await api<{ correct: boolean }>(`/sessions/${s.id}/practice`, 'POST', { round: Number(el.dataset.round), value });
      practiceDraft = { key: '', value: '' };
      if (r.correct) playCorrect();
      view = await api(`/sessions/${s.id}`);
      renderSession();
      return toast(r.correct ? '答對了！' : '這題沒對，看一下答案，換下一題。', !r.correct);
    }
    case 'toggle-results':
      return control('results', { value: !s.resultsVisible });
    case 'toggle-follow':
      return control('mode', { value: !s.followTeacher });
    case 'draw-filter': {
      syncDrawFilter();
      drawFilter = el.dataset.filter as typeof drawFilter;
      answerListOpen = true; // 老師選了範圍，就是要看這些同學的作答
      // 個別作答、座位表、抽籤鈕馬上換成這個範圍
      refreshPanelParts();
      const map = document.querySelector('#seat-map');
      if (map) map.innerHTML = seatMapInner();
      // 大屏模式的範圍列在抽籤鈕上方（不在 #responses 裡），選取狀態另外同步
      document.querySelectorAll('.class-tools [data-action="draw-filter"]').forEach((b) => {
        b.classList.toggle('selected', (b as HTMLElement).dataset.filter === drawFilter);
        b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.filter === drawFilter));
      });
      const drawBtn = document.querySelector('[data-testid="draw-seat"] span');
      if (drawBtn) drawBtn.textContent = drawLabel(a);
      return;
    }
    case 'draw':
      await control('draw', { filter: a ? drawFilter : 'all' });
      return toast(`請 ${view.session.drawnSeat} 號同學分享`);
    case 'buzz-open':
      return control('buzz-open');
    case 'buzz-reset':
      return control('buzz-reset');
    case 'buzz':
      buzzPressed = s.id;
      renderBuzzLayer();
      await api(`/sessions/${s.id}/buzz`, 'POST', { submissionId: crypto.randomUUID() });
      return refreshSession();
    case 'buzz-dismiss':
      buzzDismissed = el.dataset.key || '';
      return renderBuzzLayer();
    case 'choose':
      if (!a) return;
      {
        const n = Number(el.dataset.index);
        draft = a.type === 'single' ? n : Array.isArray(draft) ? (draft.includes(n) ? draft.filter((x) => x !== n) : [...draft, n]) : [n];
      }
      document.querySelector('#student-answer')!.innerHTML = answerForm(a);
      return;
    case 'scale':
      if (!a) return;
      draft = Number(el.dataset.value);
      document.querySelector('#student-answer')!.innerHTML = answerForm(a);
      return;
    case 'work-wall':
      if (a) showWall(a);
      return;
    case 'wall-focus':
      if (a && el.dataset.id) showWall(a, el.dataset.id);
      return;
    case 'wall-back':
      if (a) showWall(a);
      return;
    case 'submit-photo-work': {
      const d = photoDraft;
      if (!d?.imageId) return;
      await submitAnswer({ imageId: d.imageId, source: 'photo', ...(d.work.trim() ? { work: d.work.trim() } : {}), ...(d.ocr.trim() ? { ocr: d.ocr.trim() } : {}) });
      const act = view?.lesson.slides[view.session.slideIndex].activity;
      if (act && currentStudentAnswer(act)) {
        photoDraft = null;
        renderSession();
      }
      return;
    }
    case 'cancel-photo-work': {
      photoDraft = null;
      const act = view.lesson.slides[view.session.slideIndex]?.activity;
      if (act) renderPhotoReview(act);
      return;
    }
    case 'keypad-close':
      return closeKeypad();
    case 'keypad-mode': {
      const mode = el.dataset.mode === 'hand' ? 'hand' : 'keys';
      prefs.set('keypadMode', mode);
      const kp = document.querySelector<HTMLElement>('#keypad');
      if (kp) kp.dataset.mode = mode;
      document.querySelectorAll('[data-action="keypad-mode"]').forEach((b) => b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.mode === mode)));
      placeKeypad(true);
      hand?.fit();
      keypadFor?.focus();
      return;
    }
    case 'hand-clear':
      hand?.clear();
      handStatus(HAND_HINT);
      return;
    case 'hand-read':
      return recognizeHand();
    case 'keypad-next': {
      const inputs = keypadInputs();
      const next = inputs[(inputs.indexOf(keypadFor!) + 1) % inputs.length];
      next?.focus();
      next?.setSelectionRange(next.value.length, next.value.length);
      return;
    }
    case 'keypad-submit':
      closeKeypad();
      return document.querySelector<HTMLElement>('[data-testid="submit-answer"]:not([disabled]), [data-testid="submit-practice"]')?.click();
    case 'math-key': {
      const input =
        lastNumericInput && document.body.contains(lastNumericInput)
          ? lastNumericInput
          : document.querySelector<HTMLInputElement>('.numeric-input');
      if (!input) return;
      if (el.dataset.key === 'keyboard') {
        try {
          localStorage.setItem('mck-syskb', systemKeyboard() ? '0' : '1');
        } catch {
          /* 無痕模式：只切換這一次 */
        }
        const mode = input.inputMode === 'none' ? 'text' : 'none';
        document.querySelectorAll<HTMLInputElement>('.numeric-input').forEach((x) => (x.inputMode = mode));
        input.blur();
        input.focus();
        return;
      }
      keyInput(input, el.dataset.key!);
      return;
    }
    case 'edit-answer':
      editing = true;
      if (a) {
        const own = currentStudentAnswer(a);
        if (own && a.type !== 'canvas' && a.type !== 'manipulate') draft = own.value;
        document.querySelector('#student-answer')!.innerHTML = answerForm(a);
        app.classList.toggle('answering', !!view.session.activityOpen);
      }
      return;
    case 'open-sketch':
      if (a) await startSketch(a);
      return;
    case 'submit-answer':
      return submitAnswer();
    case 'summarize':
      return analyze('response-summary');
    case 'grade-all':
      if (!a) return;
      enqueueGrades(workAnswers(view, a).filter((x) => needsGrading(x.id)).map((x) => x.id));
      return;
    case 'regrade':
      closeModal();
      enqueueGrades([id!], (el.dataset.depth as 'verdict' | 'full') || gradeDepth());
      toast(el.dataset.depth === 'full' ? '已加入紅筆批改佇列' : '已加入批改佇列');
      return;
    case 'release-grades': {
      if (!a) return;
      const graded = workAnswers(view, a).map((x) => gradeFor(x.id)).filter(Boolean) as Grade[];
      const all = graded.length && graded.every((g) => g.released);
      await control('release-grades', { activityId: a.id, value: !all });
      return toast(all ? '已收回批改' : `已發回 ${graded.length} 份批改`);
    }
    case 'open-grade':
      if (id) openGrade(id);
      return;
    case 'download-redpen': {
      const answer = view.answers.find((x) => x.id === id);
      const g = id ? gradeFor(id) : undefined;
      const imageId = (answer?.value as CanvasAnswer)?.imageId;
      if (answer && g && imageId) await downloadRedpen(`/api/images/${imageId}`, g, `${answer.seat}號-${answer.activityId}-紅筆.png`);
      return;
    }
    case 'end-session':
      return modal('結束這堂課？', `<p>學生將停止作答，作答與批改都會保留。</p>${btn('結束並保存', 'confirm-end', 'primary', 'check')}`);
    case 'confirm-end':
      closeModal();
      await control('end');
      return toast('課堂已結束');
    case 'join-info': {
      const c = dashboard?.classes.find((c) => c.id === s.classId) || (await loadDashboard()).classes.find((c) => c.id === s.classId);
      if (c) await showJoinInfo(c.code);
      return;
    }
  }
}
async function control(actionName: string, extra: Record<string, unknown> = {}) {
  if (!view) return;
  await board?.flush();
  view = await api<SessionView>(`/sessions/${view.session.id}/control`, 'POST', { action: actionName, ...extra });
  if (actionName === 'slide') {
    draft = [];
    editing = false;
  }
  renderSession();
}
document.addEventListener('click', (e) => {
  const el = (e.target as Element).closest<HTMLElement>('[data-action]');
  if (!el || el.hasAttribute('disabled')) return;
  if (touchTap?.el === el) {
    if (e.isTrusted && e.detail !== 0 && touchTap.fallback && Date.now() - touchTap.at < 650) return;
    touchTap.handled = true;
  }
  const button = el as HTMLButtonElement;
  button.disabled = true;
  void action(el)
    .catch((err) => toast(err.message, true))
    .finally(() => (button.disabled = false));
});
// 有些觸控瀏覽器在畫布捕捉後會吞掉第一個相容 click；以短暫的 pointerup 補送一次。
document.addEventListener('pointerdown', (e) => {
  touchTap = null;
  if (e.pointerType === 'mouse') return;
  const el = (e.target as Element).closest<HTMLElement>('.classroom button[data-action]');
  touchTap = el && !el.hasAttribute('disabled') ? { el, x: e.clientX, y: e.clientY, pointerId: e.pointerId, handled: false, fallback: false, at: Date.now() } : null;
});
document.addEventListener('pointercancel', () => {
  touchTap = null;
});
document.addEventListener('pointerup', (e) => {
  const tap = touchTap;
  if (!tap || e.pointerId !== tap.pointerId) return;
  if (Date.now() - tap.at > 800 || (e.target as Element).closest('.classroom button[data-action]') !== tap.el || Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 12) {
    touchTap = null;
    return;
  }
  setTimeout(() => {
    if (touchTap === tap && !tap.handled && tap.el.isConnected && !tap.el.hasAttribute('disabled')) {
      tap.fallback = true;
      tap.el.click();
    }
  }, 40);
});
// 實體鍵盤也一樣：在 √(數字|) 裡打 ＋ − ／ ×，先跳出根號再輸入。
document.addEventListener('beforeinput', (e) => {
  const el = e.target as HTMLInputElement;
  if (!(el instanceof HTMLInputElement) || !el.classList.contains('numeric-input') || e.inputType !== 'insertText') return;
  if (!e.data || !/^[+\-−－＋/／*×÷]$/.test(e.data) || el.selectionStart !== el.selectionEnd) return;
  const at = el.selectionStart ?? el.value.length,
    out = radicalExit(el.value, at);
  if (out === at) return;
  e.preventDefault();
  el.setRangeText(e.data, out, out, 'end');
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
document.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id === 'short-answer' || el.id === 'numeric-answer') draft = el.value;
  if (el.id === 'practice-answer') practiceDraft.value = el.value;
  if (el.id === 'work-text' && photoDraft) {
    photoDraft.work = el.value;
    const pv = document.querySelector('#work-preview');
    if (pv) pv.innerHTML = workHtml(el.value);
  }
  if (el.id === 'danmaku-text') danmakuDraft = el.value;
  if (el.id === 'danmaku-anon') danmakuAnon = el.checked;
  const preview = document.querySelector<HTMLElement>(`[data-preview="${el.id}"]`);
  if (preview) preview.innerHTML = previewHtml(el.value);
  if (el.dataset.item !== undefined) {
    const values = Array.isArray(draft) ? [...(draft as string[])] : [];
    values[Number(el.dataset.item)] = el.value;
    draft = values;
  }
  if (el.id === 'pen-color') {
    color = el.value;
    if (board) board.color = color;
  }
});
document.addEventListener('change', async (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  if (el instanceof HTMLInputElement && el.dataset.pref) {
    prefs.set(el.dataset.pref, el.checked);
    refreshPanelParts();
    if (el.checked) autoGradeCheck();
  }
  if (el instanceof HTMLInputElement && el.dataset.requireCode) {
    try {
      const result = await api<{ classroom: Classroom }>(`/classes/${el.dataset.requireCode}`, 'PATCH', { requireCode: el.checked });
      const c = dashboard?.classes.find((x) => x.id === result.classroom.id);
      if (c) c.requireCode = result.classroom.requireCode;
      toast(el.checked ? '已開啟：學生要輸入個人識別碼，原本的登入需重新登入。' : '已停用：學生只要班級代碼＋座號就能登入。');
      renderClasses();
    } catch (err) {
      el.checked = !el.checked;
      toast((err as Error).message, true);
    }
  }
  if (el.id === 'activity-seconds') prefs.set('activitySeconds', Number(el.value));
  if (el.id === 'wall-anon' && el instanceof HTMLInputElement && view) {
    wallAnon = el.checked;
    const a = view.lesson.slides[view.session.slideIndex]?.activity;
    if (a) showWall(a, wallFocus);
  }
  if (el.id === 'practice-unanswered' && el instanceof HTMLInputElement) {
    practiceWithUnanswered = el.checked;
    const a = view?.lesson.slides[view.session.slideIndex]?.activity,
      board = document.querySelector('#practice-board');
    if (a && board) board.innerHTML = practiceBoard(a);
  }
  if (el.id === 'pref-concurrency') prefs.set('concurrency', Number(el.value));
  if (el.id === 'pref-votes') prefs.set('votes', Number(el.value));
  if (el.id === 'quiz-seconds') prefs.set('quizSeconds', Number(el.value));
  if (el.id === 'pk-seconds') prefs.set('pkSeconds', Number(el.value));
  if (el.id === 'preview-slide') document.querySelector<HTMLElement>('[data-action="preview-lesson"]')?.click();
  if (el instanceof HTMLInputElement && el.dataset.actionInput === 'quick-photo' && el.files?.[0] && view) {
    const a = view.lesson.slides[view.session.slideIndex]?.activity;
    if (a) await photoWork(a, el.files[0]).catch((err) => toast(err.message, true));
    el.value = '';
  }
});
// 記住個別作答清單開或關（畫面更新時照舊）；toggle 不會冒泡，用捕捉階段聽
document.addEventListener(
  'toggle',
  (e) => {
    const d = e.target;
    if (d instanceof HTMLDetailsElement && d.dataset.testid === 'answer-list') answerListOpen = d.open;
  },
  true,
);
document.addEventListener('submit', (e) => {
  const form = e.target as HTMLFormElement;
  // 彈幕輸入列：按 Enter 會觸發「送出」按鈕的 click（已處理），這裡只擋住表單的預設送出
  if (form.id === 'danmaku-form') return e.preventDefault();
  if (!['login-form', 'start-form', 'class-form', 'ai-form', 'password-form', 'grade-form', 'generate-form', 'change-password-form'].includes(form.id)) return;
  e.preventDefault();
  if (formBusy) return;
  formBusy = true;
  const data = new FormData(form),
    submitter = (e as SubmitEvent).submitter as HTMLButtonElement | null,
    submit = submitter || form.querySelector<HTMLButtonElement>('[type="submit"]')!;
  submit.disabled = true;
  void (async () => {
    if (form.id === 'login-form') {
      const result = await api('/login', 'POST', {
        role: form.dataset.role,
        account: data.get('account'),
        password: data.get('password'),
        classCode: data.get('classCode'),
        seat: Number(data.get('seat')),
        code: data.get('code'),
      });
      user = result.user;
      if (new URLSearchParams(location.search).get('class')) history.replaceState(null, '', location.pathname + location.hash);
      navigate(user!.role === 'teacher' ? '/dashboard' : '/student');
      if (result.mustChange && config.mode !== 'demo')
        setTimeout(
          () =>
            modal(
              '請修改預設密碼',
              `<p>你正在使用預設密碼。網站公開後任何人都可能猜到，請立即修改。</p><form id="change-password-form"><input type="hidden" name="current" value=""><label>新密碼（至少 8 字元）<input name="next" type="password" autocomplete="new-password" minlength="8" required></label><button type="submit" class="btn primary full">${icon('shield')}<span>修改密碼</span></button></form>`,
            ),
          300,
        );
    }
    if (form.id === 'change-password-form') {
      await api('/teacher/password', 'POST', { current: '11235813', next: data.get('next') });
      closeModal();
      toast('密碼已修改');
    }
    if (form.id === 'password-form') {
      await api('/teacher/password', 'POST', { current: data.get('current'), next: data.get('next') });
      form.reset();
      toast('密碼已修改，其他裝置的教師登入已登出');
    }
    if (form.id === 'ai-form') {
      await api('/settings/ai', 'PUT', {
        provider: data.get('provider'),
        baseUrl: data.get('baseUrl'),
        model: data.get('model'),
        apiKey: data.get('apiKey'),
        dailyLimit: Number(data.get('dailyLimit')),
      });
      config = await api<AppConfig>('/config');
      toast('AI 設定已儲存');
      await renderSettings();
    }
    if (form.id === 'start-form') {
      const result = await api('/sessions', 'POST', { lessonId: form.dataset.lesson, classId: data.get('classId') });
      closeModal();
      navigate(`/session/${result.session.id}`);
    }
    if (form.id === 'class-form') {
      const result = await api('/classes', 'POST', { name: data.get('name'), seats: Number(data.get('seats')) });
      closeModal();
      download(`${result.classroom.code}-識別碼.json`, JSON.stringify(result, null, 2));
      toast('班級已建立，識別碼檔案已下載。');
      await renderRoute();
    }
    if (form.id === 'grade-form' && view) {
      const answerId = form.dataset.answer!;
      const answer = view.answers.find((x) => x.id === answerId)!;
      const a = view.lesson.slides.find((s) => s.activity?.id === answer.activityId)!.activity!;
      if (submitter?.value === 'right' || submitter?.value === 'wrong') {
        const r = await api<{ grade: Grade }>(`/sessions/${view.session.id}/grades/${answerId}`, 'PUT', {
          verdict: submitter.value === 'right',
          feedback: data.get('feedback'),
        });
        view.grades = view.grades.filter((g) => g.answerId !== answerId).concat(r.grade);
        toast(submitter.value === 'right' ? `${answer.seat} 號：判對` : `${answer.seat} 號：判錯`);
        const list = workAnswers(view, a);
        const next = list[list.findIndex((x) => x.id === answerId) + 1];
        if (next) openGrade(next.id);
        else closeModal();
        refreshPanelParts();
        return;
      }
      const scores = a.rubric!.criteria.map((c) => {
        const v = data.get(`c-${c.id}`);
        if (v === null) throw new Error(`請為「${c.label}」選擇等級`);
        return { criterionId: c.id, score: Number(v), comment: String(data.get(`m-${c.id}`) || '') };
      });
      const r = await api<{ grade: Grade }>(`/sessions/${view.session.id}/grades/${answerId}`, 'PUT', {
        scores,
        feedback: data.get('feedback'),
        released: submitter?.value === 'release' ? true : undefined,
      });
      view.grades = view.grades.filter((g) => g.answerId !== answerId).concat(r.grade);
      toast(submitter?.value === 'release' ? '已儲存並發回' : '已儲存');
      const list = workAnswers(view, a);
      const next = list[list.findIndex((x) => x.id === answerId) + 1];
      if (next) openGrade(next.id);
      else closeModal();
      refreshPanelParts();
    }
    if (form.id === 'generate-form') {
      const files = Array.from((form.querySelector('[name="images"]') as HTMLInputElement).files || []).slice(0, 4);
      const images = await Promise.all(files.map(async (f) => (await compressPhoto(f)).dataUrl));
      const out = document.querySelector('#generate-result')!;
      out.innerHTML = `<div class="ai-loading">${icon('wand')}AI 正在設計課程（約 30–90 秒）…</div>`;
      const r = await api<{ mode: string; lesson?: Lesson; text?: string; error?: string }>('/ai', 'POST', {
        task: 'lesson-generate',
        topic: data.get('topic'),
        pages: data.get('pages'),
        duration: Number(data.get('duration')),
        text: data.get('text'),
        wishes: data.get('wishes'),
        images,
      });
      if (r.lesson) {
        await api(`/lessons/${r.lesson.id}`, 'PUT', { lesson: r.lesson });
        toast(r.mode === 'mock' ? '已建立模擬骨架（尚未設定 API key）' : '課程草稿已建立，請核對後再上課');
        navigate(`/lesson/${r.lesson.id}`);
      } else
        out.innerHTML = `<p class="form-error">${esc(r.error || '轉換失敗')}</p><textarea class="code-editor" readonly>${esc(r.text || '')}</textarea>`;
    }
  })()
    .catch((err) => {
      const error = form.querySelector('#login-error');
      if (error) error.textContent = err.message;
      else toast(err.message, true);
      const out = form.id === 'generate-form' ? document.querySelector('#generate-result') : null;
      if (out) out.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
    })
    .finally(() => {
      formBusy = false;
      submit.disabled = false;
    });
});
document.addEventListener('change', (e) => {
  const el = e.target as HTMLSelectElement;
  if (el.name !== 'provider' || el.form?.id !== 'ai-form') return;
  const presets: Record<string, [string, string]> = {
    gemini: ['https://generativelanguage.googleapis.com/v1beta/openai', 'gemini-2.5-flash'],
    openai: ['https://api.openai.com/v1', 'gpt-6-luna'],
    anthropic: ['https://api.anthropic.com/v1', 'claude-sonnet-5-5'],
  };
  const p = presets[el.value];
  if (!p) return;
  el.form.querySelector<HTMLInputElement>('[name="baseUrl"]')!.value = p[0];
  el.form.querySelector<HTMLInputElement>('[name="model"]')!.value = p[1];
});
window.addEventListener('hashchange', () => void renderRoute());
window.addEventListener('online', () => {
  void refreshSession();
  void retryPending();
});
/**
 * 新版本上線後，已經開著的頁面還在跑舊程式：回到前景時、以及每 3 分鐘檢查一次，
 * 有新版就自動重新載入（學生正在輸入答案時先不重載，避免答案不見）。
 */
let pendingReload = false;
async function checkNewVersion() {
  try {
    const mine = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src');
    if (!mine) return; // 開發模式
    const html = await (await fetch('/', { cache: 'no-store' })).text();
    const live = html.match(/\/assets\/index-[\w-]+\.js/)?.[0];
    if (live && !mine.endsWith(live)) pendingReload = true;
  } catch {
    /* 離線時下次再試 */
  }
  const typing = !!document.querySelector('.numeric-input:focus, textarea:focus') || !!document.querySelector('.sketch-overlay');
  if (pendingReload && !typing && !unsavedWork() && !document.hidden) location.reload();
}
/** 學生手上有還沒送出的東西：重新載入會不見，先不要自動更新。 */
function unsavedWork() {
  if (user?.role !== 'student' || !view) return !!document.querySelector('.modal');
  const a = view.lesson.slides[view.session.slideIndex]?.activity;
  const typed = Array.isArray(draft) ? (draft as unknown[]).some((x) => x !== undefined && x !== '') : draft !== undefined && draft !== '';
  return (
    !!photoDraft ||
    myPractice()?.st.status === 'working' ||
    !!danmakuDraft.trim() ||
    !!(hand && !hand.empty) ||
    (!!a && view.session.activityOpen && !currentStudentAnswer(a) && typed)
  );
}
setInterval(() => void checkNewVersion(), 180_000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void checkNewVersion();
  if (document.hidden || !view) return;
  if (liveOpen) return;
  void refreshSession();
  connectLive();
});
window.addEventListener('message', (e) => {
  const frame = document.querySelector<HTMLIFrameElement>('#custom-activity');
  if (!frame || e.source !== frame.contentWindow || !view || !e.data || typeof e.data !== 'object') return;
  const a = view.lesson.slides[view.session.slideIndex]?.activity;
  if (!a) return;
  if (e.data.type === 'math-classroom:ready' || e.data.type === 'health-classroom:ready')
    frame.contentWindow?.postMessage(
      {
        type: 'math-classroom:state',
        activityId: a.id,
        open: view.session.activityOpen && (user?.role === 'teacher' || view.session.followTeacher || studentSlide === view.session.slideIndex),
        role: user?.role,
      },
      '*',
    );
  if (
    (e.data.type === 'math-classroom:submit' || e.data.type === 'health-classroom:submit') &&
    user?.role === 'student' &&
    e.data.activityId === a.id &&
    view.session.activityOpen &&
    (view.session.followTeacher || studentSlide === view.session.slideIndex)
  )
    void submitAnswer(e.data.value).catch((err) => toast(err.message, true));
});
document.addEventListener('keydown', (e) => {
  const dialog = document.querySelector<HTMLElement>('.modal');
  if (dialog) {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Tab') {
      const items = Array.from(dialog.querySelectorAll<HTMLElement>('button,input,select,textarea,[tabindex="0"]')).filter((x) => !(x as HTMLButtonElement).disabled);
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    return;
  }
  if ((e.target as HTMLElement).matches('input,textarea,select,[data-point]') || !view) return;
  if (e.key === 'Escape' && figZoom) {
    document.querySelector<HTMLElement>('[data-action="close-figure"]')?.click();
    return;
  }
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const next = document.querySelector<HTMLElement>(`[data-action="${e.key === 'ArrowRight' ? 'next-slide' : 'prev-slide'}"]`);
    if (next && !next.hasAttribute('disabled')) {
      e.preventDefault();
      next.click();
    }
  }
});
async function boot() {
  try {
    config = await api<AppConfig>('/config');
    user = (await api<{ user: User | null }>('/me')).user;
    await renderRoute();
    const classCode = new URLSearchParams(location.search).get('class');
    if (!user && classCode) {
      landing('student');
      const input = document.querySelector<HTMLInputElement>('[name="classCode"]');
      if (input) input.value = classCode;
    }
  } catch (e) {
    app.className = 'boot-error';
    app.innerHTML = `${brand()}<h1>課堂服務尚未就緒。</h1><p>${esc((e as Error).message)}</p><p>請依 README 啟動本機服務，或檢查部署設定。</p><button class="btn primary" id="reload-btn">重新連線</button>`;
    document.querySelector('#reload-btn')?.addEventListener('click', () => location.reload());
  }
}
void boot();
