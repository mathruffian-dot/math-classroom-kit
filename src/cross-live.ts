/**
 * 十字交乘・全班連線對戰（課堂裡的畫面）：
 * - 老師大螢幕：排行榜、全班答對／作答數、紅藍拔河、最近送出的題目（按「公布」才看到因式分解）。
 * - 老師控制區：重點（x² 係數為 1／不為 1／先提公因式／混合）、要不要自動進到下一個重點、限時、紅藍拔河；暫停／繼續、結束、重新開始。
 * - 學生 iPad：原式、十字圖四格、卡片匣、送出。點卡片 → 點格子；點已放的格子收回。
 *   送出後先顯示中性的「已送出／判定中」並鎖住，不在本機猜對錯；伺服器回來才換成 ✓／✗。
 *   同學得分的推送只更新分數、名次、拔河這幾個小元素，不重畫題目。
 * 出題、判定都在伺服器（worker/cross.ts，用 shared/cross.ts），學生端拿不到答案。
 */
import './cross-live.css';
import type { CrossLiveItem, CrossLiveResult, CrossLiveView, SessionView, Session } from '../shared/types';
import { leadText, polyTex, signed, numText, type CrossLevel, type CrossSlot } from '../shared/cross';
import { CROSS_FOCUS, crossFocusById, crossLevelLabel, crossNextFocus, crossRunFocus, type CrossFocusId } from '../shared/game-focus';
import { focusLabelHtml, focusOptionHtml } from './cross-board';
import { DUEL_TEAM_NAME, type DuelTeam } from '../shared/duel';

export interface CrossLiveHelpers {
  esc(s: string): string;
  btn(label: string, action: string, cls?: string, icon?: string, attrs?: string): string;
  icon(name: string): string;
  tex(src: string): string;
  serverTime(): number;
  api<T>(path: string, method: string, body?: unknown): Promise<T>;
  view(): SessionView | null;
  route(): number;
  toast(message: string, error?: boolean): void;
  resync(): void;
  playCorrect(): void;
}
let H: CrossLiveHelpers;
export function initCrossLive(h: CrossLiveHelpers) {
  H = h;
}

const SLOTS: CrossSlot[] = ['lead0', 'lead1', 'const0', 'const1'];
type Placed = Record<CrossSlot, string | null>;
const emptyPlaced = (): Placed => ({ lead0: null, lead1: null, const0: null, const1: null });
/**
 * 學生本機的狀態：這一題放了哪些卡、選了哪張、L3 選的公因數、送出中、伺服器的判定。
 * 範圍（scope）＝路由＋課堂＋場次；範圍一變（換頁、換課、換場）就整個重設、世代（gen）加一，
 * 舊世代的請求回來時一律丟掉，舊請求的 finally 也不會動到新世代的 fetching。
 */
export const crossLocal = {
  scope: '',
  gen: 0,
  item: '',
  placed: emptyPlaced(),
  sel: null as string | null,
  k: null as number | null,
  /** 送出中：哪個世代、路由、課堂、場次、題目（晚到的回應對不上就丟掉）。 */
  pending: null as null | { gen: number; route: number; session: string; run: string; item: CrossLiveItem },
  /** 判定結果（下一題之前一直顯示）。 */
  result: null as null | { gen: number; run: string; item: CrossLiveItem; placed: Placed; k: number | null; r: CrossLiveResult },
  /** 拿題目中（這一個請求的記號；舊請求結束時對不上就不清）。 */
  fetching: null as object | null,
  /** 這個範圍內看過最新的 revision（回應與推送）：比它舊的回應、推送不蓋掉本機的題目與分數。 */
  revision: 0,
  /** 這個範圍內已經送出、拿到判定的題目 ID：舊的發題回應或推送帶回這些題目時不再裝回去。 */
  done: new Set<string>(),
  /** 時間到時要求結算：哪一場、什麼時候要求過。 */
  settle: { run: '', at: 0 },
};
/** 老師按過「公布」的題目（場次:題目 ID → 因式分解）。 */
const revealed = new Map<string, string>();
/** 目前的範圍不一樣了（換頁、換課、換場）：清掉本機狀態、世代加一。 */
function ensureScope(v: SessionView | null) {
  const scope = v?.cross ? `${H.route()}:${v.session.id}:${v.cross.run.id}` : '';
  if (scope !== crossLocal.scope) resetCrossLocal(scope);
}
/** 每一個繪製入口（載入課堂、卡片 key、卡片 HTML）先確認範圍，再讀本機的送出中／判定。 */
export function crossEnsureScope(v: SessionView | null) {
  ensureScope(v);
}
/** 這個範圍（世代）、這一場的送出中與判定；別的範圍留下來的一律不算。 */
const pendingOf = (runId: string) => (crossLocal.pending && crossLocal.pending.gen === crossLocal.gen && crossLocal.pending.run === runId ? crossLocal.pending : null);
const resultOf = (runId: string) => (crossLocal.result && crossLocal.result.gen === crossLocal.gen && crossLocal.result.run === runId ? crossLocal.result : null);

const cardText = (kind: 'lead' | 'const', v: number) => (kind === 'lead' ? leadText(v) : signed(v));
const clock = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const seatLabel = (n: number) => `${String(n).padStart(2, '0')} 號`;
/** 這一場的重點設定（一行文字）：固定在某個重點、從某個重點起自動前進、或混合。舊場次（只有 level／lock）也對得上。 */
export function crossRunFocusText(run: CrossLiveView['run']) {
  const f = crossFocusById(crossRunFocus(run));
  if (f.id === 'mix') return `重點：混合（三種隨機出現）`;
  return run.lock || !crossNextFocus(f.id) ? `重點：${f.label}（固定）` : `重點：從「${f.label}」起，答對 3 題自動進到下一個重點`;
}
/** 學生、排行榜的「重點」欄：混合的場次寫「混合」，其他寫目前這一級的重點名稱。 */
const mineFocusText = (run: CrossLiveView['run'], level: CrossLevel) => (crossRunFocus(run) === 'mix' ? '混合' : crossLevelLabel(level));
/** 本機推算剩下的時間（伺服器給的 left 是送出畫面那一刻的）。 */
function leftNow(v: CrossLiveView, now: number) {
  const r = v.run;
  if (!r.deadline) return null;
  return Math.max(0, r.deadline - (r.endedAt ?? r.pausedAt ?? now));
}
export function crossPhase(v: CrossLiveView, now: number): 'on' | 'paused' | 'over' {
  if (v.run.endedAt) return 'over';
  if (v.run.pausedAt) return 'paused';
  if (v.run.deadline && now >= v.run.deadline) return 'over';
  return 'on';
}
function winnerText(v: CrossLiveView) {
  const w = v.run.winner;
  if (w === 'draw') return '平手！';
  if (w) return `${DUEL_TEAM_NAME[w]}獲勝！`;
  return '這一場結束';
}

/* ───────── 拔河 ───────── */
/** 繩結的位置：−1（紅隊那一端）～ 1（藍隊那一端），兩隊平均分差 ÷ 門檻。 */
export function ropePos(v: CrossLiveView) {
  if (!v.teams) return 0;
  return Math.max(-1, Math.min(1, (v.teams.avg.blue - v.teams.avg.red) / Math.max(1, v.run.margin)));
}
function ropeHtml(small = false) {
  return `<div class="xl-rope ${small ? 'small' : ''}" data-testid="xl-rope"><div class="xl-end red"><b>${DUEL_TEAM_NAME.red}</b><span data-xl="red-total">0</span></div><div class="xl-track"><i class="xl-goal red"></i><i class="xl-goal blue"></i><div class="xl-line"></div><div class="xl-knot" data-xl="knot" data-testid="xl-knot"></div></div><div class="xl-end blue"><b>${DUEL_TEAM_NAME.blue}</b><span data-xl="blue-total">0</span></div></div>`;
}
function updateRope(root: HTMLElement, v: CrossLiveView) {
  const knot = root.querySelector<HTMLElement>('[data-xl="knot"]');
  if (!knot || !v.teams) return;
  const pos = ropePos(v);
  // 只改 transform（有 transition），版面不動
  knot.style.transform = `translateX(${(pos * 45).toFixed(2)}cqw)`;
  knot.dataset.pos = pos.toFixed(3);
  for (const t of ['red', 'blue'] as DuelTeam[]) {
    const el = root.querySelector<HTMLElement>(`[data-xl="${t}-total"]`);
    if (el) el.textContent = `${v.teams.total[t]} 分・${v.teams.size[t]} 人・平均 ${v.teams.avg[t]}`;
  }
}

/* ───────── 老師大螢幕 ───────── */
const ROWS = 10;
export function crossBoardHtml(): string {
  return `<div class="xl-board" data-testid="xl-board"><header class="xl-board-head"><strong>✚ 十字交乘對戰</strong><span class="xl-pill" data-xl="status" data-testid="xl-status"></span><span class="xl-clock" data-xl="clock" data-testid="xl-clock"></span></header><div class="xl-totals"><div><small>參加</small><b data-xl="players" data-testid="xl-players">0</b></div><div><small>答對／作答</small><b data-xl="ratio" data-testid="xl-ratio">0 / 0</b></div><div><small>答對率</small><b data-xl="acc">—</b></div></div><div class="xl-rope-host" data-xl="rope-host"></div><div class="xl-board-main"><ol class="xl-rows" data-xl="rows" data-testid="xl-rows">${Array.from({ length: ROWS }, () => '<li class="xl-row empty"></li>').join('')}</ol><section class="xl-recent"><h3>最近送出</h3><ol data-xl="recent" data-testid="xl-recent"></ol></section></div><div class="xl-banner" data-xl="banner" data-testid="xl-banner"></div></div>`;
}
let boardKey = '';
export function updateCrossBoard(root: HTMLElement, v: CrossLiveView, now: number) {
  const $ = (k: string) => root.querySelector<HTMLElement>(`[data-xl="${k}"]`);
  const phase = crossPhase(v, now);
  const status = $('status');
  if (status) {
    status.textContent = phase === 'on' ? '進行中' : phase === 'paused' ? '暫停中' : '已結束';
    status.dataset.phase = phase;
  }
  const left = leftNow(v, now);
  const c = $('clock');
  if (c) c.textContent = left === null ? '不限時' : clock(left);
  const key = JSON.stringify([v.rows, v.totals, v.recent, v.teams, v.run.team, v.run.endedAt, v.run.winner, [...revealed.keys()]]);
  if (key === boardKey && root.dataset.run === v.run.id) return;
  boardKey = key;
  root.dataset.run = v.run.id;
  const t = v.totals || { players: 0, correct: 0, attempts: 0 };
  $('players')!.textContent = String(t.players);
  $('ratio')!.textContent = `${t.correct} / ${t.attempts}`;
  $('acc')!.textContent = t.attempts ? `${Math.round((t.correct / t.attempts) * 100)}%` : '—';
  const ropeHost = $('rope-host')!;
  if (v.run.team && v.teams) {
    if (!ropeHost.firstElementChild) ropeHost.innerHTML = ropeHtml();
    updateRope(ropeHost, v);
  } else if (ropeHost.innerHTML) ropeHost.innerHTML = '';
  // 排行：固定 10 列（列高固定），只換內容
  const rows = v.rows || [];
  const list = $('rows')!;
  [...list.children].forEach((li, i) => {
    const r = rows[i];
    const html = r
      ? `<span class="xl-rank">${i + 1}</span><span class="xl-seat">${r.team ? `<i class="xl-dot ${r.team}"></i>` : ''}${seatLabel(r.seat)}</span><span class="xl-lv">${H.esc(crossLevelLabel(r.level))}</span><span class="xl-acc">${r.correct}/${r.attempts}</span><span class="xl-streak">${r.streak >= 2 ? `🔥${r.streak}` : ''}</span><b class="xl-score">${r.score}</b>`
      : '';
    if (li.innerHTML !== html) li.innerHTML = html;
    li.className = `xl-row ${r ? '' : 'empty'} ${i < 3 && r ? `top${i + 1}` : ''}`;
    if (r) (li as HTMLElement).dataset.seat = String(r.seat);
    else delete (li as HTMLElement).dataset.seat;
  });
  const recent = $('recent')!;
  recent.innerHTML = (v.recent || [])
    .map((x) => {
      const f = revealed.get(`${v.run.id}:${x.id}`);
      return `<li class="${x.ok ? 'ok' : 'no'}" data-item="${H.esc(x.id)}"><span>${seatLabel(x.seat)}</span><span class="xl-rpoly">${H.tex(x.poly)}</span><b>${x.ok ? `✓ +${x.points}` : '✗'}</b>${f ? `<span class="xl-factored" data-testid="xl-revealed">${H.tex(`=${f}`)}</span>` : H.btn('公布', 'xl-reveal', 'quiet xl-reveal', 'eye', `data-seat="${x.seat}" data-item="${H.esc(x.id)}" data-testid="xl-reveal-${x.seat}-${x.n}"`)}</li>`;
    })
    .join('') || '<li class="muted">還沒有人送出</li>';
  const banner = $('banner')!;
  banner.textContent = v.run.endedAt ? (v.run.team ? winnerText(v) : '這一場結束') : '';
  banner.classList.toggle('on', !!v.run.endedAt);
  if (v.run.winner && v.run.winner !== 'draw') banner.dataset.team = v.run.winner;
  else delete banner.dataset.team;
}

/* ───────── 老師控制區 ───────── */
/**
 * 重點選擇（單選）：名稱＋一行例子；底下「答對 3 題自動進到下一個重點」只對有下一個重點的選項有效
 * （和大板一樣：先提公因式沒有下一個 → 停用並取消勾選；混合 → 隱藏）。
 * name：表單名稱（課堂控制區 xl-focus、遊戲活動頁 xl-game-focus）。
 */
export function crossFocusPickerHtml(name: string, focus: CrossFocusId, escalate: boolean): string {
  const can = !!crossNextFocus(focus);
  return `<fieldset class="xl-focus" data-testid="${name}"><legend>重點</legend>${CROSS_FOCUS.map((f) => `<label class="xl-focus-opt fx-option ${f.id === focus ? 'on' : ''}" data-testid="${name}-${f.id}"><input type="radio" name="${name}" value="${f.id}" data-xl-focus="${name}" ${f.id === focus ? 'checked' : ''}>${focusOptionHtml(f)}</label>`).join('')}</fieldset><label class="xl-check" id="${name}-escalate-wrap" ${focus === 'mix' ? 'hidden' : ''}><input type="checkbox" id="${name}-escalate" data-testid="${name}-escalate" ${escalate && can ? 'checked' : ''} ${can ? '' : 'disabled'}>答對 3 題自動進到下一個重點</label>`;
}
/** 重點選項換了：標出選中的那一個；沒有下一個重點時停用並取消「自動進到下一個重點」，混合時隱藏。 */
export function crossFocusChanged(el: HTMLInputElement) {
  const name = el.dataset.xlFocus;
  if (!name) return false;
  document.querySelectorAll<HTMLInputElement>(`input[data-xl-focus="${name}"]`).forEach((x) => x.closest('label')?.classList.toggle('on', x.checked));
  const box = document.querySelector<HTMLInputElement>(`#${name}-escalate`);
  if (box) {
    box.disabled = !crossNextFocus(el.value as CrossFocusId);
    if (box.disabled) box.checked = false;
  }
  const wrap = document.querySelector<HTMLElement>(`#${name}-escalate-wrap`);
  if (wrap) wrap.hidden = el.value === 'mix';
  return true;
}
/** 表單上選的重點與「自動進到下一個重點」。 */
export function crossFocusValue(name: string): { focus: CrossFocusId; escalate: boolean } {
  const focus = (document.querySelector<HTMLInputElement>(`input[data-xl-focus="${name}"]:checked`)?.value || 'a1') as CrossFocusId;
  const box = document.querySelector<HTMLInputElement>(`#${name}-escalate`);
  return { focus, escalate: !!crossNextFocus(focus) && !!box?.checked };
}

export function crossPanelHtml(v: CrossLiveView | undefined, prefs: { focus: CrossFocusId; seconds: number; team: boolean; escalate: boolean; margin: number }): string {
  const head = `<header><strong>${H.icon('grid')}十字交乘對戰</strong></header>`;
  if (!v) {
    const opt = (list: [number, string][], cur: number) => list.map(([x, l]) => `<option value="${x}" ${x === cur ? 'selected' : ''}>${l}</option>`).join('');
    return `${head}<p class="muted small-text">每位同學各自一題（數字都不一樣），在 iPad 上把卡片放進十字圖再送出；伺服器判定，答對看速度與連對加分。題目固定在選的重點；要逐步加深就勾「自動進到下一個重點」。</p><div class="xl-form">${crossFocusPickerHtml('xl-focus', prefs.focus, prefs.escalate)}<label>限時<select id="xl-seconds" data-testid="xl-seconds">${opt([[0, '不限時'], [180, '3 分鐘'], [300, '5 分鐘'], [480, '8 分鐘']], prefs.seconds)}</select></label><label class="xl-check"><input type="checkbox" id="xl-team" data-testid="xl-team" ${prefs.team ? 'checked' : ''}>紅藍兩隊拔河</label><label>拔河勝負門檻（平均分差）<select id="xl-margin">${opt([[200, '200 分'], [300, '300 分'], [500, '500 分'], [800, '800 分']], prefs.margin)}</select></label></div><div class="tool-row">${H.btn('開始對戰', 'xl-start', 'primary', 'bolt', 'data-testid="xl-start"')}</div>`;
  }
  const now = H.serverTime();
  const phase = crossPhase(v, now);
  const status = `<p class="quiz-status" data-testid="xl-panel-status">${phase === 'on' ? '進行中' : phase === 'paused' ? '暫停中' : v.run.team ? winnerText(v) : '已結束'}｜${H.esc(crossRunFocusText(v.run))}${v.run.team && v.teams ? `｜紅隊 ${v.teams.size.red} 人・藍隊 ${v.teams.size.blue} 人` : ''}</p>`;
  if (phase === 'over') return `${head}${status}<div class="tool-row">${H.btn('重新開始', 'xl-reset', 'primary', 'dice', 'data-testid="xl-reset"')}${H.btn('關閉', 'xl-close', 'quiet', 'x', 'data-testid="xl-close"')}</div>`;
  return `${head}${status}<div class="tool-row">${phase === 'paused' ? H.btn('繼續', 'xl-resume', 'primary', 'play', 'data-testid="xl-resume"') : H.btn('暫停', 'xl-pause', 'secondary', 'clock', 'data-testid="xl-pause"')}${H.btn(v.run.team ? '關閉拔河' : '開啟紅藍拔河', 'xl-team', 'secondary', 'users', `data-value="${v.run.team ? '0' : '1'}" data-testid="xl-team-toggle"`)}</div><div class="tool-row">${H.btn('重新開始', 'xl-reset', 'quiet', 'dice', 'data-testid="xl-reset"')}${H.btn('結束這一場', 'xl-end', 'quiet danger', 'x', 'data-testid="xl-end"')}</div>`;
}
export function crossPanelKey(v: CrossLiveView | undefined, now: number) {
  return v ? `${v.run.id}:${crossPhase(v, now)}:${v.run.team}:${v.teams?.size.red ?? ''}:${v.teams?.size.blue ?? ''}:${v.run.winner}` : 'none';
}

/** 遊戲活動頁：選一堂進行中的課，開始對戰（學生從平常的課堂畫面加入）。 */
export function crossLiveGameCardHtml(sessions: Session[]): string {
  const live = sessions.filter((s) => !s.ended);
  const pick = live.length
    ? `<label class="xl-game-pick">上課中的課堂<select id="xl-game-session" data-testid="xl-game-session">${live.map((s) => `<option value="${H.esc(s.id)}">${H.esc(s.className)}・${H.esc(s.title)}</option>`).join('')}</select></label>${crossFocusPickerHtml('xl-game-focus', 'a1', false)}<label class="xl-check"><input type="checkbox" id="xl-game-team">紅藍兩隊拔河</label><div class="course-actions">${H.btn('開始對戰', 'xl-game-start', 'primary', 'bolt', 'data-testid="xl-game-start"')}</div>`
    : `<p class="muted small-text">目前沒有上課中的課堂。先到「我的課程」按「開始上課」，學生登入後再回來開對戰（或在課堂的老師工具列按「十字交乘對戰」）。</p>`;
  return `<article class="course-card cx-game-card xl-game-card" data-testid="game-cross-live"><div class="course-thumb cx-thumb xl-thumb"><span>八年級 3-2</span><strong>十字<small>對戰</small></strong><em>全班連線・每人一題</em></div><div class="course-details"><h3>十字交乘（全班連線對戰）</h3><p>每位同學在 iPad 上拿到不同的題目，把卡片放進十字圖送出，伺服器判定；大螢幕顯示排行榜，可開紅藍兩隊拔河。</p><div class="course-meta">${H.icon('users')}學生用平常的課堂登入加入</div>${pick}</div></article>`;
}

/* ───────── 學生 iPad ───────── */
function shownItem(v: CrossLiveView): CrossLiveItem | undefined {
  const runId = v.run.id;
  const pend = pendingOf(runId);
  if (pend) return pend.item;
  if (crossPhase(v, H.serverTime()) === 'over') return undefined;
  const res = resultOf(runId);
  if (res) return res.item;
  return v.mine?.item;
}
function mode(v: CrossLiveView, now: number): 'wait' | 'item' | 'pending' | 'result' | 'paused' | 'over' {
  const runId = v.run.id;
  if (pendingOf(runId)) return 'pending';
  const phase = crossPhase(v, now);
  if (phase === 'over') return 'over';
  if (resultOf(runId)) return 'result';
  if (phase === 'paused') return 'paused';
  return v.mine?.item ? 'item' : 'wait';
}
/** 卡片什麼時候要整個重畫：換場、換題、送出／判定、暫停、結束。同學得分不會改變這個 key。 */
export function crossCardKey(v: CrossLiveView, now: number) {
  ensureScope(H.view());
  const it = shownItem(v);
  return [v.run.id, mode(v, now), it?.id || '', v.run.team ? v.mine?.team || '?' : ''].join('|');
}
/** 換題：本機狀態歸零。 */
function syncLocal(it: CrossLiveItem | undefined) {
  if (!it || crossLocal.item === it.id) return;
  crossLocal.item = it.id;
  crossLocal.placed = emptyPlaced();
  crossLocal.sel = null;
  crossLocal.k = it.kOptions ? null : 1;
}
export function crossCardHtml(v: CrossLiveView, now: number): string {
  ensureScope(H.view());
  const m = mode(v, now);
  const it = shownItem(v);
  if (m === 'item') syncLocal(it);
  const team = v.mine?.team;
  const tag = team ? `<span class="xl-team-tag ${team}" data-testid="xl-team">你是${DUEL_TEAM_NAME[team]}</span>` : '';
  const head = `<div class="xl-card-head"><h2>✚ 十字交乘對戰</h2>${tag}<span class="xl-clock small" data-xl="clock"></span></div><div class="xl-stats" data-testid="xl-stats"><span>分數 <b data-xl="score" data-testid="xl-score">0</b></span><span>連對 <b data-xl="streak" data-testid="xl-streak">0</b></span><span class="xl-stat-focus">重點 <b data-xl="level" data-testid="xl-level-now">${H.esc(mineFocusText(v.run, v.mine?.level ?? v.run.level))}</b></span><span>名次 <b data-xl="rank" data-testid="xl-rank">—</b></span><span>答對 <b data-xl="ratio" data-testid="xl-mine-ratio">0/0</b></span></div>${v.run.team ? ropeHtml(true) : ''}`;
  let body = '';
  if (m === 'over') body = `<div class="xl-over" data-testid="xl-over"><h3>${H.esc(v.run.team ? winnerText(v) : '這一場結束')}</h3><p>你答對 <b>${v.mine?.correct || 0}</b> 題（作答 ${v.mine?.attempts || 0} 題），得 <b>${v.mine?.score || 0}</b> 分。</p></div>`;
  else if (m === 'paused') body = `<div class="xl-over" data-testid="xl-paused"><h3>老師暫停中</h3><p>等老師按「繼續」。</p></div>`;
  else if (m === 'wait') body = `<div class="xl-over" data-testid="xl-wait"><p>拿題目中…</p>${H.btn('拿題目', 'xl-next', 'primary xl-big', 'next', 'data-testid="xl-next"')}</div>`;
  else if (it) body = questionHtml(it, m);
  return `<div class="xl-card ${m}" data-testid="xl-card" data-mode="${m}">${head}${body}</div>`;
}
function questionHtml(it: CrossLiveItem, m: 'item' | 'pending' | 'result') {
  const res = m === 'result' ? crossLocal.result : null;
  const placed = res ? res.placed : crossLocal.placed;
  const k = res ? res.k : crossLocal.k;
  const lockedK = !!it.kOptions && k === null;
  const kStep = it.kOptions
    ? `<div class="xl-k" data-testid="xl-k"><span>先提出公因數：</span>${it.kOptions.map((x) => `<button type="button" class="xl-kbtn ${k === x ? 'on' : ''}" data-action="xl-k" data-k="${x}" data-testid="xl-k-${x}" ${m !== 'item' ? 'disabled' : ''}>${numText(x)}</button>`).join('')}</div>`
    : '';
  const lead = (slot: CrossSlot) => slotHtml(it, slot, placed, m);
  const kText = k === null || k === 1 ? '' : k === -1 ? '−' : numText(k);
  const verdict = res ? verdictHtml(res.r) : m === 'pending' ? '<p class="xl-flash pending" data-testid="xl-flash">已送出／判定中…</p>' : '<p class="xl-flash" data-testid="xl-flash"></p>';
  // 答錯後的冷卻：「下一題」先停用並倒數（中性的灰色，不是錯誤訊息），updateCrossCard 每 0.5 秒更新
  const action =
    m === 'result'
      ? `<button type="button" class="btn primary xl-big" data-action="xl-next" data-testid="xl-next" data-xl="next">${H.icon('next')}<span data-xl="next-label">下一題</span></button>`
      : `<button type="button" class="btn primary xl-big xl-submit" data-action="xl-submit" data-testid="xl-submit" ${m !== 'item' ? 'disabled' : ''}>${H.icon('check')}<span>${m === 'pending' ? '判定中…' : '送出'}</span></button>`;
  return `<div class="xl-q" data-testid="xl-question" data-item="${H.esc(it.id)}"><span class="xl-lvtag" data-testid="xl-item-focus" data-level="${it.level}">${focusLabelHtml(crossLevelLabel(it.level))}</span><div class="xl-poly" data-testid="xl-poly" data-a="${it.poly.a}" data-b="${it.poly.b}" data-c="${it.poly.c}">${H.tex(polyTex(it.poly))}</div>${kText ? `<div class="xl-inner">＝ ${H.esc(kText)}(　　)(　　)</div>` : ''}</div>${kStep}<div class="xl-work ${lockedK ? 'locked' : ''}" data-xl="work"><div class="xl-cross" data-testid="xl-cross"><div class="xl-colhead">x 係數</div><div></div><div class="xl-colhead">常數</div>${lead('lead0')}<svg class="xl-x" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="6" y1="10" x2="94" y2="90"/><line x1="6" y1="90" x2="94" y2="10"/></svg>${lead('const0')}${lead('lead1')}${lead('const1')}</div>${lockedK ? '<div class="xl-lock">先選公因數</div>' : ''}</div><div class="xl-tray" data-xl="tray" data-testid="xl-tray">${it.cards.map((c) => trayCardHtml(it, c.id, placed, m)).join('')}</div>${verdict}<div class="xl-actions">${action}</div>`;
}
function slotHtml(it: CrossLiveItem, slot: CrossSlot, placed: Placed, m: string) {
  const kind = slot.startsWith('lead') ? 'lead' : 'const';
  if (kind === 'lead' && it.leadLocked) return `<div class="xl-slot lead fixed" data-testid="xl-slot-${slot}"><span>x</span></div>`;
  const id = placed[slot];
  const card = id ? it.cards.find((c) => c.id === id) : undefined;
  const res = m === 'result' ? crossLocal.result?.r : undefined;
  const cls = [kind, card ? 'filled' : '', m === 'pending' && card ? 'pending' : '', res ? (res.ok ? 'ok' : 'no') : '', crossLocal.sel && m === 'item' ? 'target' : ''].join(' ');
  return `<button type="button" class="xl-slot ${cls}" data-action="xl-slot" data-slot="${slot}" data-testid="xl-slot-${slot}" ${m !== 'item' ? 'disabled' : ''} aria-label="${kind === 'lead' ? 'x 係數' : '常數'}・${slot.endsWith('0') ? '上' : '下'}格${card ? `：${H.esc(cardText(card.kind, card.value))}` : ''}">${card ? H.esc(cardText(card.kind, card.value)) : `<span class="xl-empty">${kind === 'lead' ? '?x' : '?'}</span>`}</button>`;
}
function trayCardHtml(it: CrossLiveItem, id: string, placed: Placed, m: string) {
  const c = it.cards.find((x) => x.id === id)!;
  const used = SLOTS.some((s) => placed[s] === id);
  return `<span class="xl-home"><button type="button" class="xl-card-btn ${c.kind} ${crossLocal.sel === id && m === 'item' ? 'sel' : ''} ${used ? 'used' : ''}" data-action="xl-card" data-card="${H.esc(id)}" data-testid="xl-card-${H.esc(id)}" data-kind="${c.kind}" data-value="${c.value}" aria-pressed="${crossLocal.sel === id}" ${m !== 'item' || used ? 'disabled' : ''}>${H.esc(cardText(c.kind, c.value))}</button></span>`;
}
function verdictHtml(r: CrossLiveResult) {
  const why: Record<string, string> = { k: '公因數選錯了', sign: '左欄要是正的', lead: '左欄相乘不等於 x² 係數', const: '右欄相乘不等於常數項', sum: '交叉相乘的和不對', card: '卡片放錯了', incomplete: '四格還沒放滿', invalid: '卡片不正確' };
  const [ps, rq] = r.products;
  const products = ps !== null && rq !== null ? `交叉相乘 ${numText(ps)} ＋ ${numText(rq)} ＝ ${numText(ps + rq)}（目標 ${numText(r.target)}）` : '';
  return `<div class="xl-flash ${r.ok ? 'ok' : 'no'}" data-testid="xl-flash" data-ok="${r.ok}"><b>${r.ok ? `✓ 答對！＋${r.points.total} 分` : `✗ ${H.esc(why[r.reason || ''] || '不對')}`}</b>${r.ok ? `<small>基本 ${r.points.base}・速度 ${r.points.speed}・連對 ${r.points.streak}${r.levelUp ? `・進到「${H.esc(crossLevelLabel(r.level))}」！` : ''}</small>` : ''}<small>${products}</small><span class="xl-answer" data-testid="xl-answer">${H.tex(`${r.poly}=${r.factored}`)}</span></div>`;
}
/** 同學得分、時間：只更新這幾個小元素，不重畫題目。 */
export function updateCrossCard(root: HTMLElement, v: CrossLiveView, now: number) {
  const set = (k: string, text: string) => {
    const el = root.querySelector<HTMLElement>(`[data-xl="${k}"]`);
    if (el && el.textContent !== text) el.textContent = text;
  };
  const mine = v.mine;
  set('score', String(mine?.score ?? 0));
  set('streak', String(mine?.streak ?? 0));
  set('level', mineFocusText(v.run, mine?.level ?? v.run.level));
  set('rank', mine?.rank ? `${mine.rank} / ${mine.players}` : '—');
  set('ratio', `${mine?.correct ?? 0}/${mine?.attempts ?? 0}`);
  const left = leftNow(v, now);
  set('clock', left === null ? '' : clock(left));
  if (v.run.team) updateRope(root, v);
  const next = root.querySelector<HTMLButtonElement>('[data-xl="next"]');
  if (next) {
    const wait = mine?.cool ? Math.ceil((mine.cool - now) / 1000) : 0;
    const cooling = wait > 0;
    if (next.disabled !== cooling) next.disabled = cooling;
    next.classList.toggle('xl-cooling', cooling);
    set('next-label', cooling ? `下一題（${wait} 秒）` : '下一題');
  }
}
/** 學生要求結算前多等一點（每台 iPad 不同），全班不會同一瞬間送出。 */
const settleJitter = Math.floor(Math.random() * 2000);
/** 時間到了但畫面還沒收到結束：請伺服器結算（可重複呼叫；學生錯開時間，3 秒內不重送）。 */
export function maybeSettle(v: SessionView | null, teacher: boolean) {
  const cv = v?.cross && v.session.cross ? v.cross : undefined;
  if (!v || !cv || cv.run.endedAt || cv.run.pausedAt || !cv.run.deadline) return;
  const now = H.serverTime();
  const delay = teacher ? 300 : 800 + settleJitter;
  if (now < cv.run.deadline + delay) return;
  if (crossLocal.settle.run === cv.run.id && Date.now() - crossLocal.settle.at < 3000) return;
  crossLocal.settle = { run: cv.run.id, at: Date.now() };
  void H.api(`/sessions/${v.session.id}/cross`, 'POST', { runId: cv.run.id, op: 'settle' })
    .then(() => H.resync())
    .catch(() => {});
}

/* ───────── 學生操作 ───────── */
function liveCross() {
  const v = H.view();
  ensureScope(v);
  return v?.cross && v.session.cross ? v : null;
}
function rerenderWork(root: HTMLElement) {
  // 自己的操作：只重畫十字圖與卡片匣（大小固定，不會跳動）；題目不動
  const v = liveCross();
  const it = v && shownItem(v.cross!);
  if (!v || !it) return;
  const html = questionHtml(it, 'item');
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  for (const sel of ['[data-xl="work"]', '[data-xl="tray"]', '.xl-k', '.xl-inner']) {
    const now = root.querySelector(sel),
      next = tmp.querySelector(sel);
    if (now && next) now.replaceWith(next);
    else if (!now && next && sel === '.xl-inner') root.querySelector('.xl-q')?.append(next);
  }
}
/** 回傳 true：這個 data-action 是十字交乘對戰的。 */
export async function crossAct(act: string, el: HTMLElement, renderCard: () => void): Promise<boolean> {
  if (!act.startsWith('xl-')) return false;
  const v = H.view();
  if (!v) return true;
  const root = document.querySelector<HTMLElement>('.xl-card');
  const cv = v.cross;
  if (act === 'xl-reveal') {
    if (!cv) return true;
    const r = await H.api<{ runId: string; id: string; factored: string }>(`/sessions/${v.session.id}/cross`, 'POST', { runId: cv.run.id, op: 'reveal', seat: Number(el.dataset.seat), itemId: el.dataset.item });
    revealed.set(`${r.runId}:${r.id}`, r.factored);
    boardKey = '';
    const host = document.querySelector<HTMLElement>('[data-testid="xl-board"]');
    if (host && H.view()?.cross) updateCrossBoard(host, H.view()!.cross!, H.serverTime());
    return true;
  }
  if (!cv || !v.session.cross) return true;
  const it = shownItem(cv);
  if (act === 'xl-card') {
    if (!it || mode(cv, H.serverTime()) !== 'item') return true;
    const id = el.dataset.card!;
    crossLocal.sel = crossLocal.sel === id ? null : id;
    if (root) rerenderWork(root);
    return true;
  }
  if (act === 'xl-slot') {
    if (!it || mode(cv, H.serverTime()) !== 'item') return true;
    const slot = el.dataset.slot as CrossSlot;
    const sel = crossLocal.sel;
    if (sel) {
      const card = it.cards.find((c) => c.id === sel);
      if (card && card.kind !== (slot.startsWith('lead') ? 'lead' : 'const')) {
        H.toast(card.kind === 'lead' ? 'x 係數卡要放在左欄' : '常數卡要放在右欄');
        return true;
      }
      for (const s of SLOTS) if (crossLocal.placed[s] === sel) crossLocal.placed[s] = null;
      crossLocal.placed[slot] = sel;
      crossLocal.sel = null;
    } else crossLocal.placed[slot] = null; // 點已放的格子：收回
    if (root) rerenderWork(root);
    return true;
  }
  if (act === 'xl-k') {
    if (!it || mode(cv, H.serverTime()) !== 'item') return true;
    crossLocal.k = Number(el.dataset.k);
    if (root) rerenderWork(root);
    return true;
  }
  if (act === 'xl-next') {
    if (cv.mine?.cool && H.serverTime() < cv.mine.cool) return true;
    await fetchNext();
    renderCard();
    return true;
  }
  if (act === 'xl-submit') {
    await submit(renderCard);
    return true;
  }
  return false;
}
const blankMine = (level: CrossLevel): NonNullable<CrossLiveView['mine']> => ({ score: 0, streak: 0, correct: 0, attempts: 0, level, players: 0 });
/**
 * 拿題目（沒有題目時自動呼叫；同一時間只送一次）。auto＝自動拿題（被限速時不跳訊息）。
 * 回應的防護：世代（換頁、換課、換場就丟掉）＋revision（比已知的舊就不裝題目）＋題目 ID（已經送出的題目不再裝回去）。
 */
export async function fetchNext(auto = false) {
  const v = liveCross();
  if (!v || crossLocal.fetching) return;
  const cv = v.cross!;
  if (cv.mine?.cool && H.serverTime() < cv.mine.cool) return;
  const tok = {};
  crossLocal.fetching = tok;
  const gen = crossLocal.gen,
    session = v.session.id,
    run = cv.run.id;
  try {
    const r = await H.api<{ item: CrossLiveItem; revision: number; team?: DuelTeam }>(`/sessions/${session}/cross`, 'POST', { runId: run, op: 'next' });
    const now = H.view();
    ensureScope(now);
    if (gen !== crossLocal.gen || now?.session.id !== session || now.cross?.run.id !== run) return;
    const mine = now.cross.mine || blankMine(cv.run.level);
    if (r.revision >= crossLocal.revision && !crossLocal.done.has(r.item.id)) {
      crossLocal.revision = r.revision;
      now.cross.mine = { ...mine, item: r.item, ...(r.team ? { team: r.team } : {}) };
    }
    // 有一題還沒送出的題目（這個回應或更新的推送帶來的）才收起上一題的判定
    const cur = now.cross.mine?.item;
    if (cur && !crossLocal.done.has(cur.id)) crossLocal.result = null;
  } catch (e) {
    if (gen !== crossLocal.gen) return;
    const status = (e as { status?: number }).status;
    if (!(auto && status === 429)) H.toast((e as Error).message, status !== 429);
    H.resync();
  } finally {
    if (crossLocal.fetching === tok) crossLocal.fetching = null;
  }
}
async function submit(renderCard: () => void) {
  const v = liveCross();
  if (!v) return;
  const cv = v.cross!;
  const it = shownItem(cv);
  if (!it || mode(cv, H.serverTime()) !== 'item') return;
  const need = SLOTS.filter((s) => !(it.leadLocked && s.startsWith('lead')));
  if (need.some((s) => !crossLocal.placed[s])) return H.toast('四格都要放卡片');
  if (it.kOptions && crossLocal.k === null) return H.toast('先選公因數');
  const placed = { ...crossLocal.placed };
  const k = crossLocal.k;
  const pend = (crossLocal.pending = { gen: crossLocal.gen, route: H.route(), session: v.session.id, run: cv.run.id, item: it });
  renderCard(); // 中性的「已送出／判定中」，鎖住
  const cards = Object.fromEntries(need.map((s) => [s, placed[s]]));
  try {
    const r = await H.api<CrossLiveResult & { revision: number; over: boolean; team?: DuelTeam }>(`/sessions/${pend.session}/cross`, 'POST', { runId: pend.run, op: 'submit', itemId: it.id, cards, ...(it.kOptions ? { k } : {}) });
    const now = H.view();
    ensureScope(now);
    // 晚到的回應：已經換頁、換課、換場（世代變了）或不是這一題，就不要動現在的畫面（自己的判定中也要清掉）
    if (pend.gen !== crossLocal.gen || crossLocal.pending !== pend || pend.route !== H.route() || now?.session.id !== pend.session || now.cross?.run.id !== pend.run || r.itemId !== it.id) {
      if (crossLocal.pending === pend) crossLocal.pending = null;
      return;
    }
    crossLocal.done.add(it.id);
    crossLocal.pending = null;
    crossLocal.result = { gen: pend.gen, run: pend.run, item: it, placed, k, r };
    const mine = now.cross.mine || blankMine(r.level);
    if (r.revision >= crossLocal.revision) {
      // 伺服器算好的統計直接指派（推送先到也不會重複加）
      crossLocal.revision = r.revision;
      const { cool: _cool, ...rest } = mine;
      now.cross.mine = { ...rest, ...r.mine, ...(r.team ? { team: r.team } : {}) };
    }
    if (now.cross.mine?.item?.id === it.id) delete now.cross.mine.item;
    if (r.ok) H.playCorrect();
    if (r.over) H.resync();
  } catch (e) {
    // 送不出去（網路、被拒）：拿掉判定中、解鎖，卡片留著可以再送
    if (crossLocal.pending === pend) crossLocal.pending = null;
    if (pend.gen !== crossLocal.gen) return;
    const status = (e as { status?: number }).status;
    H.toast((e as Error).message, status !== 429);
    if (status === 409) H.resync();
  } finally {
    if (pend.gen === crossLocal.gen) renderCard();
  }
}
/**
 * 推送進來時（同一個範圍）：比本機已知的 revision 新就照推送；舊的（或一樣的）推送，學生端的題目與分數以本機為準。
 * 已經送出的題目不會被推送裝回去。
 */
export function mergeCrossPush(next: SessionView, prev: SessionView | null) {
  ensureScope(next);
  if (!next.cross) return;
  if (!prev?.cross || next.cross.run.id !== prev.cross.run.id || next.session.id !== prev.session.id) return;
  const mine = next.cross.mine;
  if (next.session.revision > crossLocal.revision) crossLocal.revision = next.session.revision;
  else if (prev.cross.mine && mine) {
    const item = prev.cross.mine.item;
    const { score, streak, level, correct, attempts, cool } = prev.cross.mine;
    next.cross.mine = { ...mine, score, streak, level, correct, attempts };
    if (cool) next.cross.mine.cool = cool;
    else delete next.cross.mine.cool;
    if (item) next.cross.mine.item = item;
    else delete next.cross.mine.item;
  }
  if (next.cross.mine?.item && crossLocal.done.has(next.cross.mine.item.id)) delete next.cross.mine.item;
}
/** 換一場、換課、換頁（或收起）：清掉上一個範圍的本機狀態；世代加一，舊請求的回應一律丟掉。 */
export function resetCrossLocal(scope = '') {
  crossLocal.scope = scope;
  crossLocal.gen++;
  crossLocal.item = '';
  crossLocal.placed = emptyPlaced();
  crossLocal.sel = null;
  crossLocal.k = null;
  crossLocal.pending = null;
  crossLocal.result = null;
  crossLocal.fetching = null;
  crossLocal.revision = 0;
  crossLocal.done = new Set();
}
