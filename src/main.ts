import './styles.css';
import { api, download, escape as esc } from './api';
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
  AppConfig,
  AiSettings,
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
  if (el instanceof HTMLInputElement && el.classList.contains('numeric-input')) lastNumericInput = el;
});
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
    `<section class="panel"><div class="table-wrap"><table><thead><tr><th>課程與班級</th><th>時間</th><th>狀態</th><th>操作</th></tr></thead><tbody>${rows.map((s) => `<tr><td><strong>${esc(s.title)}</strong><small>${esc(s.className)}</small></td><td>${new Date(s.createdAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td>${tag(s.ended ? '已結束' : '進行中', s.ended ? '' : 'green')}</td><td><div class="actions">${btn('開啟', 'resume', 'quiet', 'eye', `data-id="${s.id}"`)}${btn('CSV', 'export-session', 'quiet', 'download', `data-id="${s.id}"`)}${btn('刪除', 'delete-session', 'quiet danger', 'trash', `data-id="${s.id}"`)}</div></td></tr>`).join('') || '<tr><td colspan="4" class="empty-state">還沒有課堂紀錄。</td></tr>'}</tbody></table></div></section><p class="muted small-text">備份含作答與批改分數，不含作答照片本身與任何金鑰。</p>`,
    `${btn('還原備份', 'restore', 'secondary', 'upload')}${btn('下載備份', 'backup', 'primary', 'download')}`,
  );
}
async function renderSettings() {
  let ai: AiSettings | null = null;
  try {
    ai = await api<AiSettings>('/settings/ai');
  } catch {}
  const providers: [string, string][] = [
    ['openai', 'OpenAI（預設 gpt-6-luna）'],
    ['gemini', 'Google Gemini'],
    ['anthropic', 'Anthropic Claude'],
    ['custom', '其他 OpenAI 相容 API'],
  ];
  const votes = prefs.get<number>('votes', 1),
    concurrency = prefs.get<number>('concurrency', 6);
  shell(
    'settings',
    '設定',
    `<div class="settings-grid"><section class="panel settings-panel"><h2>${icon('key')}AI 批改與轉課程</h2><p class="muted">API key 只存在伺服器端（Cloudflare Durable Object），不會傳到學生裝置、不進備份。</p><form id="ai-form"><label>供應商<select name="provider">${providers.map(([v, n]) => `<option value="${v}" ${ai?.provider === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label><label>API 網址<input name="baseUrl" value="${esc(ai?.baseUrl || '')}" required></label><label>模型名稱<input name="model" value="${esc(ai?.model || '')}" required placeholder="需支援讀圖（vision）"></label><label>API key<input name="apiKey" type="password" autocomplete="off" placeholder="${ai?.keyHint ? `已設定 ${esc(ai.keyHint)}，留空則不變更` : '貼上你的 API key'}"></label><label>每日呼叫上限<input name="dailyLimit" type="number" min="1" max="5000" value="${ai?.dailyLimit || 200}"></label><p class="setting-status">${ai?.configured ? tag(`已啟用・${ai.source === 'env' ? '部署環境變數' : '教師設定'}・今日已用 ${ai.usedToday} 次`, 'green') : tag('尚未設定：批改與轉課程會使用模擬結果', 'warn')}</p><div class="actions"><button type="submit" class="btn primary">${icon('save')}<span>儲存 AI 設定</span></button>${ai?.source === 'teacher' ? btn('移除金鑰', 'clear-ai', 'quiet danger', 'trash') : ''}</div></form></section><section class="panel settings-panel"><h2>${icon('stamp')}批改節奏</h2><label>同時批改份數<select id="pref-concurrency">${[2, 4, 6, 8].map((n) => `<option ${n === concurrency ? 'selected' : ''}>${n}</option>`).join('')}</select></label><label>每份投票次數<select id="pref-votes"><option value="1" ${votes === 1 ? 'selected' : ''}>1 次（最快）</option><option value="3" ${votes === 3 ? 'selected' : ''}>3 次取共識（較準、費用 ×3）</option></select></label><p class="muted small-text">一班 30 份、同時 6 份時，單次投票約 1.5–3 分鐘可改完（視模型速度與供應商速率限制）。信心低於 0.7 或多次投票不一致的作答會標示「需覆核」。</p></section><section class="panel settings-panel"><h2>${icon('shield')}教師密碼</h2>${config.mode === 'supabase' ? '<p>Supabase 模式請在 Supabase Auth 修改密碼。</p>' : `<form id="password-form"><label>目前密碼<input name="current" type="password" autocomplete="current-password" required></label><label>新密碼（至少 8 字元）<input name="next" type="password" autocomplete="new-password" minlength="8" required></label><button type="submit" class="btn primary">${icon('save')}<span>修改密碼</span></button></form>`}</section><section class="panel settings-panel"><h2>${icon('screen')}部署資訊</h2><dl class="setting-list"><div><dt>模式</dt><dd>${modeBadge()}</dd></div><div><dt>教師帳號</dt><dd>${esc(user?.name || '')}</dd></div><div><dt>課堂同步</dt><dd>即時連線（WebSocket），中斷時自動改用輪詢備援</dd></div><div><dt>版本</dt><dd>${esc(config.version)}</dd></div></dl></section></div>`,
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
  const hasVisual = slide.interactive || slide.customHtml || slide.bullets?.length || figs;
  return `<div class="slide-head"><p class="slide-eyebrow">${slide.phase ? `<span class="phase-chip">${esc(slide.phase)}</span>` : ''}<span>${esc(slide.eyebrow || `${index + 1} / ${total}`)}</span></p><h1>${md(slide.title)}</h1>${slide.body ? `<p class="slide-body">${md(slide.body)}</p>` : ''}</div>${hasVisual ? `<div class="slide-visual ${figs ? 'with-figure' : ''} ${figs && !slide.interactive && !slide.customHtml ? 'figure-only' : ''}">${figuresHtml(slide)}${slide.customHtml ? '<iframe id="custom-activity" class="custom-activity" title="自訂互動教材" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>' : slide.interactive ? '<div class="viz-host"></div>' : figs ? '' : visual(slide)}</div>` : ''}${slide.source ? `<p class="slide-source">${icon('book')}${esc(slide.source)}</p>` : ''}`;
}
function latestBySeat(v: SessionView, activityId: string): Answer[] {
  const map = new Map<number, Answer>();
  for (const a of v.answers) if (a.activityId === activityId) map.set(a.seat, a);
  return [...map.values()].sort((a, b) => a.seat - b.seat);
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
  return `${v.imageId ? `<img class="answer-thumb" src="/api/images/${esc(v.imageId)}" alt="我送出的作答">` : ''}${v.text ? `<p class="answer-note">${md(v.text)}</p>` : ''}`;
}
function answerForm(a: Activity) {
  const answered = currentStudentAnswer(a),
    open = view!.session.activityOpen && !view!.session.ended,
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
    fields = `<ol class="numeric-items">${a.items.map((it, i) => `<li><label for="numeric-item-${i}">${md(it.prompt)}</label><div class="numeric-field"><input id="numeric-item-${i}" data-item="${i}" class="numeric-input" inputmode="${numericInputMode()}" autocomplete="off" placeholder="答案" value="${esc(values[i] ?? '')}" ${dis}>${a.unit ? `<span>${esc(a.unit)}</span>` : ''}</div><div class="tex-preview" data-preview="numeric-item-${i}" aria-live="polite">${previewHtml(values[i] ?? '')}</div></li>`).join('')}</ol>${a.form === 'simplest-radical' ? '<p class="muted small-text">答案請化成最簡根式，例如 2√3、√6/3。</p>' : ''}`;
  } else if (a.type === 'numeric')
    fields = `<div class="numeric-field"><input id="numeric-answer" class="numeric-input" inputmode="${numericInputMode()}" autocomplete="off" placeholder="輸入數字、分數或算式" value="${typeof draft === 'string' ? esc(draft) : ''}" ${dis} aria-label="數值答案">${a.unit ? `<span>${esc(a.unit)}</span>` : ''}</div><div class="tex-preview" data-preview="numeric-answer" aria-live="polite">${previewHtml(typeof draft === 'string' ? draft : '')}</div>`;
  if (a.type === 'manipulate') {
    const vars = viz?.vars() || vizState.get(view!.lesson.slides[view!.session.slideIndex].id) || {};
    const keys = a.record?.length ? a.record : Object.keys(vars).filter((k) => k !== 'step');
    fields = `<div class="manip-state">${icon('sliders')}<span>先在左邊的圖上操作，再送出目前的狀態。</span><code id="manip-vars">${keys.map((k) => `${esc(k)} = ${fmt(vars[k])}`).join('　')}</code></div>`;
  }
  if (a.type === 'canvas') {
    const sk = sketches.get(a.id);
    const preview = sketchPreview.get(a.id);
    fields = `${criteriaHint(a)}<button type="button" class="canvas-launch ${preview ? 'has-preview' : ''}" data-action="open-sketch" data-testid="open-sketch" ${dis}>${preview ? `<img src="${preview}" alt="畫布預覽">` : `<span>${icon('pen')}<strong>開啟畫布作答</strong><small>手寫、作圖${a.allowPhoto !== false ? '，或寫在紙上拍照' : ''}</small></span>`}</button>${sk?.text ? `<p class="answer-note">${esc(sk.text)}</p>` : ''}${a.allowPhoto !== false ? `<label class="btn secondary full photo-quick ${locked ? 'disabled' : ''}">${icon('camera')}<span>直接拍照作答</span><input type="file" accept="image/*" capture="environment" data-action-input="quick-photo" ${dis}></label>` : ''}`;
  }
  const saved = answered
    ? `<div class="saved-answer">${icon('check')}<div><strong>已送出</strong>${a.type === 'canvas' ? canvasValuePreview(answered.value) : `<span>${answerDisplay(answered.value)}</span>`}</div>${open && !editing ? `<button class="text-button" data-action="edit-answer">修改</button>` : ''}</div>`
    : '';
  const submit = (!answered || editing) ? btn(open ? (a.type === 'manipulate' ? '送出我的操作' : '送出答案') : '等待老師開放', 'submit-answer', 'primary full', 'check', `data-testid="submit-answer" ${!open ? 'disabled' : ''}`) : '';
  const keys = a.type === 'numeric' && (!answered || editing) ? mathKeys(dis) : '';
  return `<div class="activity-prompt"><span class="tag">${TYPE_LABEL[a.type]}</span><h2>${md(a.prompt)}</h2></div>${saved}${(!answered || editing) ? fields : ''}<div class="answer-dock ${keys ? 'with-keys' : ''}">${keys}<div class="submit-area">${submit}<p id="answer-status" role="status" class="muted small-text">${answered && !editing ? '' : open ? '' : '可以先操作與思考。'}</p></div></div>`;
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
  app.innerHTML = `<header class="room-bar"><div class="room-identity">${teacher ? btn('返回', 'dashboard', 'icon-btn', 'back', 'aria-label="返回課程"') : `<span class="brand-mark small">${icon('sigma')}</span>`}<div><strong>${esc(teacher ? s.title : `${s.className}・${user.seat} 號`)}</strong><small>${teacher ? esc(s.className) : esc(view.lesson.title)}</small></div></div><div class="room-progress" aria-label="第 ${index + 1} 頁，共 ${total} 頁"><span>${index + 1}</span>/<span>${total}</span></div><div class="room-actions"><span id="sync-status" class="sync-status"><i></i>已連線</span>${teacher ? `${btn(screen ? '一般' : '大屏', 'screen', 'quiet', 'screen', 'title="切換大屏授課"')}` : ''}${btn('', 'fullscreen', 'icon-btn', 'expand', 'aria-label="全螢幕" title="全螢幕"')}${teacher ? '' : btn('', 'logout', 'icon-btn', 'logout', 'aria-label="登出" title="登出"')}</div></header><div class="room-main"><main class="stage-col"><article class="slide-stage" data-testid="session-slide" id="slide-stage">${slideMarkup(slide, index, total)}</article><nav class="slide-nav" aria-label="翻頁與白板工具">${btn('', 'prev-slide', 'icon-btn nav-btn', 'prev', `aria-label="上一頁" ${index === 0 || (!teacher && s.followTeacher) ? 'disabled' : ''}`)}${teacher ? toolbar() : ''}<div class="slide-dots">${view.lesson.slides.map((sl, i) => `<button class="${i === index ? 'active' : ''} ${sl.activity ? 'has-q' : ''} ${i === s.slideIndex && !teacher ? 'live' : ''}" data-action="go-slide" data-index="${i}" aria-label="第 ${i + 1} 頁${sl.phase ? `・${esc(sl.phase)}` : ''}" title="${esc(sl.phase || sl.title)}" ${!teacher && s.followTeacher ? 'disabled' : ''}><span></span></button>`).join('')}</div>${btn('', 'next-slide', 'icon-btn nav-btn primary', 'next', `aria-label="下一頁" data-testid="next-slide" ${index === total - 1 || (!teacher && s.followTeacher) ? 'disabled' : ''}`)}</nav></main><aside class="panel-col" aria-label="${teacher ? '課堂互動' : '作答區'}">${panel}</aside></div>${teacher ? '' : `<nav class="phone-tabs" aria-label="切換"><button class="${studentTab === 'slide' ? 'selected' : ''}" data-action="student-tab" data-tab="slide">${icon('book')}教材</button><button class="${studentTab === 'answer' ? 'selected' : ''}" data-action="student-tab" data-tab="answer">${icon('pen')}作答${a && s.activityOpen && (!own || editing) ? '<i class="badge-dot"></i>' : ''}</button></nav>`}<div id="buzz-root"></div>`;
  const stage = document.querySelector<HTMLElement>('#slide-stage')!;
  renderBuzzLayer();
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
  const gradable = a && a.rubric && (a.type === 'canvas' || a.type === 'short');
  const activity = a
    ? `<section class="teacher-activity"><div class="activity-top">${tag(TYPE_LABEL[a.type])}<span id="answer-count" class="count-pill">${view!.aggregate.submitted} / ${view!.aggregate.total}</span></div><h2>${md(a.prompt)}</h2><div class="activity-actions">${btn(s.activityOpen ? '結束作答' : '開放作答', 'toggle-activity', s.activityOpen ? 'secondary' : 'primary', s.activityOpen ? 'x' : 'play', s.ended ? 'disabled' : 'data-testid="toggle-activity"')}${btn(s.resultsVisible ? '隱藏結果' : '公布結果', 'toggle-results', 'secondary', 'chart')}</div><div id="aggregate">${aggregateHtml(view!)}</div>${screen ? '' : `<div id="responses">${responsesHtml(a)}</div>`}${!screen && a.aiAllowed && ['short', 'numeric', 'canvas'].includes(a.type) ? btn('AI 整理全班迷思', 'summarize', 'quiet full', 'spark') : ''}</section>`
    : `<div class="quiet-moment">${icon('sigma')}<h2>這一頁沒有題目</h2><p>可以用畫筆在圖上標示，或抽籤請同學說明。</p></div>`;
  return `<div class="panel-scroll">${activity}<section class="seat-map" id="seat-map" data-testid="seat-map">${seatMapInner()}</section>${gradable && !screen ? gradingBar(a!) : ''}<section class="class-tools"><div class="draw-filter" role="group" aria-label="抽籤範圍">${(
    [
      ['all', '全部'],
      ['unanswered', '未作答'],
      ['correct', '答對'],
      ['incorrect', '答錯'],
    ] as const
  )
    .map(([k, l]) => `<button class="${drawFilter === k ? 'selected' : ''}" data-action="draw-filter" data-filter="${k}" aria-pressed="${drawFilter === k}" ${k !== 'all' && !a ? 'disabled' : ''}>${l}</button>`)
    .join('')}</div><div class="tool-row">${btn('抽籤', 'draw', 'secondary', 'dice', 'data-testid="draw-seat"')}${btn('搶答', 'buzz-open', 'secondary', 'bolt', 'data-testid="buzz-open"')}</div><div id="class-events">${eventsHtml()}</div></section>${screen ? '' : `<section class="room-options">${btn(s.followTeacher ? '同步翻頁中' : '學生自主瀏覽', 'toggle-follow', 'quiet', s.followTeacher ? 'screen' : 'book', s.ended ? 'disabled' : '')}${btn('學生加入', 'join-info', 'quiet', 'users')}${btn('結束課堂', 'end-session', 'quiet danger', 'logout', s.ended ? 'disabled' : '')}</section>${view!.lesson.slides[s.slideIndex]?.notes ? `<details class="teacher-notes"><summary>教師備註（學生看不到）</summary><p>${esc(view!.lesson.slides[s.slideIndex].notes)}</p></details>` : ''}`}</div>`;
}
function responsesHtml(a: Activity) {
  const answers = latestBySeat(view!, a.id);
  if (a.type === 'canvas' || (a.type === 'short' && a.rubric))
    return `<div class="submission-grid" data-testid="submission-grid">${answers
      .map((x) => {
        const g = gradeFor(x.id);
        const v = x.value as CanvasAnswer;
        const state = grading.inFlight.has(x.id) ? '<em class="st busy">批改中</em>' : g ? `<em class="st ${g.released ? 'released' : g.needsReview ? 'review' : 'graded'} ${g.depth === 'verdict' ? (g.correct ? 'right' : 'wrong') : ''}">${g.depth === 'verdict' ? (g.correct ? '✓ 對' : '✗ 錯') : `${g.total}/${g.max}`}${g.needsReview ? ' ⚠' : ''}</em>` : '<em class="st">未批改</em>';
        return `<button class="submission" data-action="open-grade" data-id="${esc(x.id)}"><span class="seat">${x.seat}</span>${typeof x.value === 'string' ? `<span class="excerpt">${esc(x.value.slice(0, 60))}</span>` : v.imageId ? `<img src="/api/images/${esc(v.imageId)}" alt="${x.seat} 號作答" loading="lazy">` : `<span class="excerpt">${esc(v.text || '')}</span>`}${state}</button>`;
      })
      .join('') || '<p class="muted">等待第一份作答。</p>'}</div>`;
  if (a.type === 'short')
    return `<div class="short-responses">${answers.map((x) => `<div><span class="seat-tag">${x.seat}</span><p>${esc(x.value)}</p></div>`).join('') || '<p class="muted">等待第一個想法。</p>'}</div>`;
  if (['numeric', 'manipulate'].includes(a.type) && answers.length)
    return `<details class="answer-list"><summary>個別作答</summary><div class="seat-chips">${answers.map((x) => `<span class="seat-chip ${x.correct ? 'ok' : x.note ? 'warn' : 'no'}" title="${esc(answerText(x.value))}${x.note ? `（${esc(x.note)}）` : ''}">${x.seat}${chipAnswer(x)}</span>`).join('')}</div></details>`;
  return '';
}
/** 個別作答小卡：多小題逐題排成 (1) (2) (3)、各自標 ✓／✗，算式照課本樣式顯示（不用「｜」分隔，免得看成絕對值）。 */
function chipAnswer(x: Answer) {
  if (Array.isArray(x.value) && typeof x.value[0] === 'string')
    return `<span class="chip-items">${(x.value as string[]).map((v, i) => {
      const ok = x.itemsCorrect?.[i];
      return `<span class="chip-item ${ok === undefined ? '' : ok ? 'ok' : 'no'}"><b>${ok === undefined ? '' : ok ? '✓' : '✗'}(${i + 1})</b>${answerHtml(v)}</span>`;
    }).join('')}</span>${x.note ? '<small class="chip-note">未化簡</small>' : ''}`;
  if (typeof x.value === 'string') return `<span class="chip-items"><span class="chip-item">${answerHtml(x.value)}</span></span>${x.note ? '<small class="chip-note">未化簡</small>' : ''}`;
  return `<small>${esc(answerText(x.value)).slice(0, 14)}</small>`;
}
function gradingBar(a: Activity) {
  const answers = latestBySeat(view!, a.id);
  const ungraded = answers.filter((x) => needsGrading(x.id) && !grading.inFlight.has(x.id)).length;
  const redpen = prefs.get('redpen', false);
  const right = answers.filter((x) => gradeFor(x.id)?.correct ?? (gradeFor(x.id) ? gradeFor(x.id)!.total === gradeFor(x.id)!.max : false)).length;
  const graded = answers.filter((x) => gradeFor(x.id));
  const released = graded.filter((x) => gradeFor(x.id)!.released).length;
  const review = graded.filter((x) => gradeFor(x.id)!.needsReview).length;
  const auto = prefs.get('autoGrade', false);
  return `<section class="grading-bar" id="grading-bar"><div class="grading-status"><strong>${icon('stamp')}${redpen ? '第 2 層：紅筆批改' : '第 1 層：判斷對錯'}</strong><span>${graded.length}/${answers.length} 已批改${graded.length ? `・答對 ${right}` : ''}${review ? `・<b class="warn">${review} 需覆核</b>` : ''}${released ? `・${released} 已發回` : ''}</span>${grading.total ? `<span class="grading-progress"><i style="width:${Math.round((grading.done / grading.total) * 100)}%"></i></span>` : ''}</div><div class="tool-row">${btn(`${redpen ? 'AI 紅筆批改' : 'AI 判斷對錯'}${ungraded ? `（${ungraded}）` : ''}`, 'grade-all', 'primary', 'wand', `${ungraded ? '' : 'disabled'} data-testid="grade-all"`)}${btn(released && released === graded.length ? '收回批改' : '發回批改', 'release-grades', 'secondary', 'arrow', graded.length ? '' : 'disabled')}</div><label class="switch"><input type="checkbox" data-pref="redpen" ${redpen ? 'checked' : ''} data-testid="toggle-redpen"><span></span>第 2 層：依規準給分＋紅筆批註</label><label class="switch"><input type="checkbox" data-pref="autoGrade" ${auto ? 'checked' : ''}><span></span>收件後自動 AI 批改</label>${config.aiConfigured ? '' : '<p class="muted small-text">尚未設定 API key：會產生「模擬批改」供試用流程。</p>'}</section>`;
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
  const seats = r
    .map((x) => {
      const state = a && x.answered ? 'done' : x.online ? 'on' : 'off';
      const label = `${x.seat} 號：${a ? (x.answered ? '已作答' : '未作答') : ''}${a ? '・' : ''}${x.online ? '上線' : '未上線'}`;
      return `<span class="seat ${state}" title="${label}" aria-label="${label}">${x.seat}</span>`;
    })
    .join('');
  const legend = `<p class="seat-legend">${a ? '<i class="done"></i>已作答' : ''}<i class="on"></i>${a ? '上線未作答' : '上線'}<i class="off"></i>未上線（不抽籤）</p>`;
  const list = a && view!.session.activityOpen && waiting.length ? `<p class="seat-waiting">還沒交：${waiting.join('、')} 號</p>` : '';
  return `<div class="seat-head">${head}</div><div class="seat-grid">${seats}</div>${list}${legend}`;
}
function eventsHtml() {
  if (!view) return '';
  const s = view.session;
  return `${s.drawnSeat ? `<div class="draw-result">${icon('dice')}<div><small>抽中${s.drawFilter && s.drawFilter !== 'all' ? `（${FILTER_LABEL[s.drawFilter]}）` : ''}</small><strong>${s.drawnSeat}<span> 號</span></strong></div></div>` : ''}${s.buzzOpen || s.buzzWinner ? `<div class="buzz-panel">${s.buzzWinner ? `<span>${icon('bolt')}搶答成功</span><strong>${s.buzzWinner.seat}<small> 號</small></strong>` : `<span class="pulse">${icon('bolt')}搶答開放中</span>`}${user?.role === 'teacher' ? btn('重設', 'buzz-reset', 'quiet', 'undo') : ''}</div>` : ''}`;
}

/* ───────────── 批改佇列（教師端並行） ───────────── */
const grading = {
  queue: [] as { sessionId: string; answerId: string; depth: 'verdict' | 'full' }[],
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
function enqueueGrades(answerIds: string[], depth = gradeDepth()) {
  if (!view) return;
  for (const answerId of answerIds) {
    if (grading.inFlight.has(answerId) || grading.queue.some((q) => q.answerId === answerId)) continue;
    grading.queue.push({ sessionId: view.session.id, answerId, depth });
    grading.total++;
  }
  pumpGrades();
  refreshPanelParts();
}
function pumpGrades() {
  const limit = prefs.get('concurrency', 6);
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
      .catch((e) => toast(`批改失敗：${(e as Error).message}`, true))
      .finally(() => {
        grading.running--;
        grading.inFlight.delete(job.answerId);
        grading.done++;
        if (!grading.queue.length && !grading.running) {
          if (grading.total) toast(`批改完成 ${grading.done} 份，請覆核後再發回。`);
          grading.done = grading.total = 0;
        }
        refreshPanelParts();
        pumpGrades();
      });
  }
}
function autoGradeCheck() {
  if (!view || user?.role !== 'teacher' || screenMode() || !prefs.get('autoGrade', false)) return;
  const a = view.lesson.slides[view.session.slideIndex]?.activity;
  if (!a?.rubric) return;
  const ids = latestBySeat(view, a.id)
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
}
function openGrade(answerId: string) {
  if (!view) return;
  const answer = view.answers.find((x) => x.id === answerId);
  const a = view.lesson.slides.find((s) => s.activity?.id === answer?.activityId)?.activity;
  if (!answer || !a?.rubric) return;
  const g = gradeFor(answerId);
  const v = answer.value as CanvasAnswer;
  const text = typeof answer.value === 'string' ? answer.value : v.text;
  const list = latestBySeat(view, a.id);
  const pos = list.findIndex((x) => x.id === answerId);
  modal(
    `${answer.seat} 號作答`,
    `<div class="grade-layout"><div class="grade-work">${v.imageId ? `<div class="redpen-host big" data-image="${esc(v.imageId)}"></div>` : ''}${text ? `<blockquote class="student-text">${md(text)}</blockquote>` : ''}${g?.transcript ? `<details><summary>AI 轉寫的手寫內容</summary><pre>${esc(g.transcript)}</pre></details>` : ''}</div><form id="grade-form" class="grade-form" data-answer="${esc(answerId)}">${g ? `<p class="grade-meta">${tag(g.depth === 'verdict' ? '第 1 層・對錯' : '第 2 層・紅筆')}${tag(g.mode === 'live' ? 'AI 初評' : g.mode === 'mock' ? '模擬批改' : '教師批改', g.mode === 'teacher' ? 'green' : '')}${g.confidence !== undefined ? tag(`信心 ${g.confidence}`, g.needsReview ? 'warn' : '') : ''}${g.votes && g.votes.length > 1 ? tag(`投票 ${g.votes.join('、')}`) : ''}${g.released ? tag('已發回', 'green') : ''}</p>` : '<p class="muted">尚未批改。</p>'}<section class="layer1"><h3>第 1 層：判斷對錯</h3>${g?.depth === 'verdict' ? `<p class="verdict ${g.correct ? 'ok' : 'no'}">${icon(g.correct ? 'check' : 'x')}<span>${g.correct ? '判定：正確' : '判定：不正確'}</span></p>` : ''}<label>給學生的一句話<textarea name="feedback" rows="2" maxlength="600">${esc(g?.feedback || '')}</textarea></label><div class="grade-actions"><button type="submit" class="btn primary" name="mode" value="right" data-testid="judge-right">${icon('check')}<span>判對</span></button><button type="submit" class="btn secondary" name="mode" value="wrong" data-testid="judge-wrong">${icon('x')}<span>判錯</span></button>${btn('AI 判斷', 'regrade', 'quiet', 'wand', `data-id="${esc(answerId)}" data-depth="verdict"`)}</div></section><details class="layer2" ${g?.depth === 'full' || prefs.get('redpen', false) ? 'open' : ''}><summary>第 2 層：依規準給分＋紅筆批註</summary>${a.rubric.criteria
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
  return [s.id, s.slideIndex, s.activityOpen, s.resultsVisible, s.followTeacher, s.ended].join(':');
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
      if (msg.type === 'view') void applyView(msg.view, currentRoute);
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
      view = n;
      if (changedSlide) {
        draft = [];
        editing = false;
        if (user.role === 'student') studentTab = 'slide';
      }
      if (opened && user.role === 'student') studentTab = 'answer';
      if (!busy) renderSession();
    } else {
      const gradesChanged = gradesSignature(n) !== gradesSignature(view);
      const answersChanged = n.answers.length !== view.answers.length;
      view = n;
      const count = document.querySelector('#answer-count');
      if (count) count.textContent = `${n.aggregate.submitted} / ${n.aggregate.total}`;
      const agg = document.querySelector('#aggregate');
      if (agg) agg.innerHTML = aggregateHtml(n);
      const events = document.querySelector('#class-events');
      if (events) events.innerHTML = eventsHtml();
      const seatMap = document.querySelector('#seat-map');
      if (seatMap) seatMap.innerHTML = seatMapInner();
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
      return control('activity', { value: !s.activityOpen });
    case 'toggle-results':
      return control('results', { value: !s.resultsVisible });
    case 'toggle-follow':
      return control('mode', { value: !s.followTeacher });
    case 'draw-filter':
      drawFilter = el.dataset.filter as typeof drawFilter;
      document.querySelectorAll('[data-action="draw-filter"]').forEach((b) => {
        b.classList.toggle('selected', (b as HTMLElement).dataset.filter === drawFilter);
        b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.filter === drawFilter));
      });
      return;
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
      enqueueGrades(latestBySeat(view, a.id).filter((x) => needsGrading(x.id)).map((x) => x.id));
      return;
    case 'regrade':
      closeModal();
      enqueueGrades([id!], (el.dataset.depth as 'verdict' | 'full') || gradeDepth());
      toast(el.dataset.depth === 'full' ? '已加入紅筆批改佇列' : '已加入批改佇列');
      return;
    case 'release-grades': {
      if (!a) return;
      const graded = latestBySeat(view, a.id).map((x) => gradeFor(x.id)).filter(Boolean) as Grade[];
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
  if (el.id === 'pref-concurrency') prefs.set('concurrency', Number(el.value));
  if (el.id === 'pref-votes') prefs.set('votes', Number(el.value));
  if (el.id === 'preview-slide') document.querySelector<HTMLElement>('[data-action="preview-lesson"]')?.click();
  if (el instanceof HTMLInputElement && el.dataset.actionInput === 'quick-photo' && el.files?.[0] && view) {
    const a = view.lesson.slides[view.session.slideIndex]?.activity;
    if (a) await startSketch(a, el.files[0]).catch((err) => toast(err.message, true));
    el.value = '';
  }
});
document.addEventListener('submit', (e) => {
  const form = e.target as HTMLFormElement;
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
        const list = latestBySeat(view, a.id);
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
      const list = latestBySeat(view, a.id);
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
  if (pendingReload && !typing && !document.hidden) location.reload();
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
