// 根式步驟格鬥的畫面：大螢幕（紅藍戰士、兩隊血量、戰況）、老師控制區、學生作答卡（選規則 → 用數字卡填出下一行）。
import './duel.css';
import type { DuelResult, DuelView } from '../shared/types';
import { DUEL_RULES, DUEL_TEAM_NAME, duelBlanks, duelFill, type DuelState, type DuelTeam, type DuelTok } from '../shared/duel';

export interface DuelHelpers {
  esc(s: string): string;
  btn(label: string, action: string, cls?: string, icon?: string, attrs?: string): string;
  icon(name: string): string;
  serverTime(): number;
}
let H: DuelHelpers;
export function initDuelUi(h: DuelHelpers) {
  H = h;
}
/** 學生這一小步填到哪：每一格的數字、目前選的格子、上一步的結果訊息。 */
export const duelLocal = { key: '', vals: [] as (string | undefined)[], active: 0, flash: '', flashOk: true, sending: false };

/* ───────── 算式（課本樣式：根號上面有線、分數上下排） ───────── */
const text = (s: string) => H.esc(s).replace(/-/g, '−');
export function tokHtml(toks: DuelTok[], blanks?: { vals: (string | undefined)[]; active: number; hint?: string }): string {
  return toks
    .map((t) => {
      if (typeof t === 'string') return `<span class="dl-t">${text(t)}</span>`;
      if ('b' in t) {
        if (!blanks) return '<span class="dl-blank"></span>';
        const v = blanks.vals[t.b];
        return `<button type="button" class="dl-blank ${v !== undefined ? 'filled' : ''} ${blanks.active === t.b ? 'active' : ''}" data-action="duel-blank" data-i="${t.b}" data-testid="duel-blank-${t.b}" aria-label="第 ${t.b + 1} 格">${v !== undefined ? text(v) : ''}</button>`;
      }
      if ('r' in t) return `<span class="dl-sqrt"><span class="dl-rad">√</span><span class="dl-under">${tokHtml(t.r, blanks)}</span></span>`;
      return `<span class="dl-frac"><span class="dl-num">${tokHtml(t.f[0], blanks)}</span><span class="dl-den">${tokHtml(t.f[1], blanks)}</span></span>`;
    })
    .join('');
}
const lineHtml = (toks: DuelTok[]) => `<span class="dl-line">${tokHtml(toks)}</span>`;

/* ───────── 戰況 ───────── */
export function duelPhase(v: DuelView, now: number): 'pre' | 'on' | 'over' {
  if (v.run.endedAt || v.state.result) return 'over';
  if (now < v.run.startedAt) return 'pre';
  if (now >= v.run.startedAt + v.run.seconds * 1000) return 'over';
  return 'on';
}
const clock = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const hp = (x: number) => Math.max(0, Math.round(x * 10) / 10);
function resultText(v: DuelView) {
  const r = v.state.result;
  if (v.run.endedAt && !r) return '老師結束了這一場';
  if (r === 'draw') return '平手！';
  if (r) return `${DUEL_TEAM_NAME[r]}獲勝！${v.state.hp[r === 'red' ? 'blue' : 'red'] <= 0 ? '（KO）' : ''}`;
  return '時間到';
}
export function duelBoardHtml(v: DuelView): string {
  const side = (t: DuelTeam) =>
    `<div class="dl-side ${t}" data-team="${t}"><img class="dl-fighter" src="/duel/${t}-fighter.png" alt="${DUEL_TEAM_NAME[t]}"><div class="dl-name"><b>${DUEL_TEAM_NAME[t]}</b><small id="dl-size-${t}"></small></div></div>`;
  return `<div class="duel-board" data-testid="duel-board"><header class="dl-head"><strong>⚔ ${H.esc(v.title)}</strong><span class="dl-clock" id="dl-clock"></span></header><div class="dl-bars">${(['red', 'blue'] as DuelTeam[]).map((t) => `<div class="dl-bar ${t}"><i id="dl-hp-${t}"></i><span id="dl-hp-text-${t}"></span></div>`).join('')}</div><div class="dl-arena">${side('red')}<div class="dl-center" id="dl-center"></div>${side('blue')}<div class="dl-fx" id="dl-fx"></div></div><ol class="dl-feed" id="dl-feed"></ol></div>`;
}
const seen = new Set<string>();
const evKey = (e: DuelState['log'][number]) => `${e.t}:${e.seat}:${e.k}:${e.rule}`;
export function updateDuelBoard(root: HTMLElement, v: DuelView, now: number) {
  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`);
  const phase = duelPhase(v, now);
  const c = $('dl-clock');
  if (c) c.textContent = phase === 'pre' ? `${Math.ceil((v.run.startedAt - now) / 1000)}` : phase === 'over' ? '結束' : clock(v.run.startedAt + v.run.seconds * 1000 - now);
  for (const t of ['red', 'blue'] as DuelTeam[]) {
    const bar = $(`dl-hp-${t}`);
    if (bar) bar.style.width = `${hp(v.state.hp[t])}%`;
    const tx = $(`dl-hp-text-${t}`);
    if (tx) tx.textContent = `${DUEL_TEAM_NAME[t]} ${hp(v.state.hp[t])}`;
    const sz = $(`dl-size-${t}`);
    if (sz) sz.textContent = `${v.size[t]} 人`;
  }
  const center = $('dl-center');
  if (center) center.innerHTML = phase === 'pre' ? `<b class="dl-count">${Math.max(1, Math.ceil((v.run.startedAt - now) / 1000))}</b>` : phase === 'over' ? `<b class="dl-result" data-testid="duel-result">${resultText(v)}</b>` : '<b class="dl-vs">VS</b>';
  const feed = $('dl-feed');
  if (feed)
    feed.innerHTML = v.state.log
      .slice(-5)
      .reverse()
      .map((e) => `<li class="${e.team} ${e.k}">${e.k === 'miss' ? `✗ ${e.seat} 號・${H.esc(DUEL_RULES[e.rule]?.name || '')}（自己 −${e.n}）` : `${e.k === 'finish' ? '💥 最後一擊' : '⚔'} ${e.seat} 號・${H.esc(DUEL_RULES[e.rule]?.name || '')} −${e.n}`}</li>`)
      .join('');
  // 出招動畫：新的動作才播（第一次畫面只記下來，不重播）
  const fresh = v.state.log.filter((e) => !seen.has(evKey(e)));
  const first = !root.dataset.dlSeen;
  root.dataset.dlSeen = '1';
  for (const e of fresh) seen.add(evKey(e));
  if (first) return;
  const fxHost = $('dl-fx');
  for (const [i, e] of fresh.slice(-4).entries()) {
    const me = root.querySelector<HTMLElement>(`.dl-side[data-team="${e.team}"]`);
    const foe = root.querySelector<HTMLElement>(`.dl-side[data-team="${e.team === 'red' ? 'blue' : 'red'}"]`);
    if (e.k === 'miss') pulse(me, 'oops');
    else {
      pulse(me, e.k === 'finish' ? 'atk big' : 'atk');
      pulse(foe, 'hurt');
    }
    if (fxHost) {
      const el = document.createElement('div');
      el.className = `dl-pop ${e.team} ${e.k}`;
      el.textContent = e.k === 'miss' ? `−${e.n}` : e.k === 'finish' ? `最後一擊 −${e.n}` : `−${e.n}`;
      // 跳在被打的那一方（答錯跳在自己這一方），同時好幾招就上下錯開
      const at = e.k === 'miss' ? e.team : e.team === 'red' ? 'blue' : 'red';
      el.style.setProperty('--at', at === 'red' ? '22%' : '78%');
      el.style.setProperty('--x', `${(Math.random() * 10 - 5).toFixed(0)}%`);
      el.style.setProperty('--y', `${i * 9}%`);
      el.style.animationDelay = `${i * 0.12}s`;
      fxHost.append(el);
      setTimeout(() => el.remove(), 1200);
    }
  }
}
function pulse(el: HTMLElement | null, cls: string) {
  if (!el) return;
  const list = cls.split(' ');
  el.classList.remove(...list);
  void el.offsetWidth;
  el.classList.add(...list);
  setTimeout(() => el.classList.remove(...list), 600);
}

/* ───────── 老師控制區 ───────── */
function resultsTable(list: DuelResult[]) {
  return `<table class="dl-results" data-testid="duel-results"><thead><tr><th>座號</th><th>隊</th><th>傷害</th><th>完成</th><th>一次就對</th><th>提示</th></tr></thead><tbody>${list
    .map((r) => `<tr class="${r.team}"><td><b>${r.seat}</b></td><td>${DUEL_TEAM_NAME[r.team]}</td><td>${r.damage}</td><td>${r.finished}</td><td>${r.acc}%</td><td>${r.hints}</td></tr>${r.badges.length ? `<tr class="dl-badges"><td colspan="6">${r.badges.map((b) => `<i>${H.esc(b)}</i>`).join('')}</td></tr>` : ''}`)
    .join('')}</tbody></table>`;
}
export function duelWeakHtml(v: DuelView) {
  const list = (v.weak || []).filter((w) => w.n >= 3).slice(0, 5);
  if (!list.length) return '';
  return `<div class="dl-weak" data-testid="duel-weak"><b>最需要加強的步驟</b>${list.map((w) => `<div><span>${H.esc(DUEL_RULES[w.rule]?.name || w.rule)}</span><small>${H.esc(DUEL_RULES[w.rule]?.tip || '')}</small><em>${Math.round((w.ok / w.n) * 100)}%（${w.ok}/${w.n}）</em></div>`).join('')}</div>`;
}
export function duelPanelHtml(v: DuelView | undefined, seconds: number, hasBank: boolean): string {
  const head = `<header><strong>${H.icon('bolt')}根式步驟格鬥</strong></header>`;
  if (!v) {
    if (!hasBank) return `${head}<p class="muted small-text">這一課沒有步驟格鬥題庫。</p>`;
    return `${head}<p class="muted small-text">全班依程度平均分成紅、藍兩隊。每一步先選規則、再用數字卡填出下一行；選對、填對就出招，最後一行是最後一擊，答錯扣自己隊伍的血。先把對方打到 0，或時間到血多的一隊獲勝。</p><div class="tool-row"><label class="time-limit">${H.icon('clock')}<select id="duel-seconds">${[[300, '5 分鐘'], [480, '8 分鐘'], [600, '10 分鐘']].map(([s, l]) => `<option value="${s}" ${s === seconds ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${H.btn('開戰（自動分隊）', 'duel-start', 'primary', 'bolt', 'data-testid="duel-start"')}</div>`;
  }
  const now = H.serverTime();
  const phase = duelPhase(v, now);
  const status = `<p class="quiz-status" data-testid="duel-status">紅隊 ${v.size.red} 人・藍隊 ${v.size.blue} 人｜${phase === 'pre' ? '倒數準備中' : phase === 'on' ? '對戰中' : resultText(v)}</p>`;
  if (phase !== 'over') return `${head}${status}${duelWeakHtml(v)}${H.btn('提前結束', 'duel-end', 'secondary', 'x', 'data-testid="duel-end"')}`;
  return `${head}${status}${duelWeakHtml(v)}${v.results ? resultsTable(v.results) : '<p class="muted">結算中…</p>'}<div class="tool-row">${H.btn('再戰一場', 'duel-start', 'primary', 'dice', 'data-testid="duel-again"')}${H.btn('關閉', 'duel-close', 'quiet', 'x')}</div>`;
}

/* ───────── 學生作答卡 ───────── */
export function duelCardKey(v: DuelView, now: number) {
  const p = v.mine?.problem;
  return [v.run.id, duelPhase(v, now), v.mine?.team || '', p ? `${p.id}:${p.step}:${p.phase}:${p.wrong}:${p.hint || ''}` : '', duelLocal.flash, !!v.results].join('|');
}
function miniBars(v: DuelView, team?: DuelTeam) {
  return `<div class="dl-mini">${(['red', 'blue'] as DuelTeam[]).map((t) => `<div class="dl-bar small ${t} ${t === team ? 'mine' : ''}"><i style="width:${hp(v.state.hp[t])}%"></i><span>${DUEL_TEAM_NAME[t]} ${hp(v.state.hp[t])}</span></div>`).join('')}</div>`;
}
export function duelCardHtml(v: DuelView, now: number): string {
  const team = v.mine?.team;
  const phase = duelPhase(v, now);
  const tag = team ? `<span class="dl-team-tag ${team}" data-testid="duel-team">你是${DUEL_TEAM_NAME[team]}</span>` : '';
  const head = `<div class="dl-card-head"><h2>⚔ 根式步驟格鬥</h2>${tag}${phase === 'on' ? `<span class="dl-clock small">${clock(v.run.startedAt + v.run.seconds * 1000 - now)}</span>` : ''}</div>${miniBars(v, team)}`;
  if (phase === 'pre') return `<section class="duel-card" data-testid="duel-card">${head}<p class="dl-big-count">${Math.max(1, Math.ceil((v.run.startedAt - now) / 1000))}</p><p class="muted">準備開始…每一步先選規則，再用數字卡填出下一行。</p></section>`;
  if (phase === 'over') {
    const r = v.results?.[0];
    return `<section class="duel-card" data-testid="duel-card">${head}<p class="dl-over" data-testid="duel-over">${resultText(v)}</p>${
      r ? `<p class="dl-mine">你造成 <b>${r.damage}</b> 點傷害，完成 <b>${r.finished}</b> 題，${r.acc}% 一次就對${r.badges.length ? `<br>${r.badges.map((b) => `<i class="dl-badge">${H.esc(b)}</i>`).join('')}` : ''}</p>` : ''
    }</section>`;
  }
  const p = v.mine?.problem;
  if (!p) return `<section class="duel-card" data-testid="duel-card">${head}<p class="muted">每一步先選這一步用的規則，再用數字卡填出下一行算式。</p>${H.btn('開始解題', 'duel-next', 'primary full', 'play', 'data-testid="duel-next"')}</section>`;
  const key = `${p.id}:${p.step}:${p.phase}`;
  if (duelLocal.key !== key) {
    duelLocal.key = key;
    duelLocal.vals = [];
    duelLocal.active = 0;
  }
  const flash = duelLocal.flash ? `<p class="dl-flash ${duelLocal.flashOk ? 'ok' : 'no'}" data-testid="duel-flash">${duelLocal.flash}</p>` : '';
  const done = p.done.map((d) => `<li><span class="dl-eq">＝</span>${lineHtml(d.line)}<small class="dl-rule-chip">${H.esc(DUEL_RULES[d.rule]?.name || '')}</small></li>`).join('');
  let body = '';
  if (p.phase === 'rule') {
    body = `<p class="dl-ask">第 ${p.step + 1}／${p.total} 步：這一步要用哪個規則？</p><div class="dl-rules">${(p.rules || [])
      .map((r, i) => `<button type="button" class="dl-rule ${p.hint === r ? 'hint' : ''}" data-action="duel-rule" data-choice="${i}" data-testid="duel-rule-${r}"><b>${H.esc(DUEL_RULES[r]?.name || r)}</b><small>${H.esc(DUEL_RULES[r]?.tip || '')}</small></button>`)
      .join('')}</div>${p.hint ? '<p class="dl-hint">提示：發亮的就是這一步的規則。</p>' : ''}`;
  } else {
    const n = duelBlanks(p.line!);
    const full = Array.from({ length: n }, (_, i) => duelLocal.vals[i]).every((x) => x !== undefined);
    body = `<p class="dl-ask">第 ${p.step + 1}／${p.total} 步・<span class="dl-rule-chip">${H.esc(DUEL_RULES[p.rule!]?.name || '')}</span>　用數字卡填出下一行：</p><div class="dl-next"><span class="dl-eq">＝</span><span class="dl-line">${tokHtml(p.line!, { vals: duelLocal.vals, active: duelLocal.active })}</span></div>${p.hint ? `<p class="dl-hint">提示：第 1 格填 ${H.esc(p.hint)}。</p>` : ''}<div class="dl-tiles">${(p.tiles || [])
      .map((t) => `<button type="button" class="dl-tile" data-action="duel-tile" data-v="${H.esc(t)}" data-testid="duel-tile-${H.esc(t)}">${text(t)}</button>`)
      .join('')}</div><div class="tool-row">${H.btn('清除這一格', 'duel-back', 'quiet', 'erase', 'data-testid="duel-back"')}${H.btn('出招！', 'duel-submit', 'primary', 'bolt', `data-testid="duel-submit" ${full ? '' : 'disabled'}`)}</div>`;
  }
  return `<section class="duel-card" data-testid="duel-card">${head}${flash}<div class="dl-work"><p class="dl-family">${H.esc(p.family)}</p><div class="dl-start">${lineHtml(p.start)}</div><ol class="dl-done">${done}</ol>${body}</div></section>`;
}
/** 選數字卡：填進目前的格子，跳到下一個空格。 */
export function duelPutTile(n: number, value: string) {
  duelLocal.vals[duelLocal.active] = value;
  const next = Array.from({ length: n }, (_, i) => i).find((i) => i > duelLocal.active && duelLocal.vals[i] === undefined) ?? Array.from({ length: n }, (_, i) => i).find((i) => duelLocal.vals[i] === undefined);
  if (next !== undefined) duelLocal.active = next;
}
export { duelBlanks, duelFill };
