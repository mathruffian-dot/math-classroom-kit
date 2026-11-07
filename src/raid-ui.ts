// 魔王戰的畫面：老師大螢幕（戰場、動畫、結算）、老師控制區、學生作答卡。
import './raid.css';
import './raid-fx.css';
// 戰況由 shared/raid.ts 依時間推算：伺服器給「某一刻」的戰況，各裝置每 0.25 秒往前推，魔王照時間表攻擊。
import type { RaidResult, RaidView } from '../shared/types';
import {
  DIFFICULTY_NAME,
  KIND_LEVEL,
  KIND_NAME,
  RAID_KINDS,
  RAID_ROLES,
  RAID_TITLES,
  RAID_ULT_NEED,
  ROLE_NAME,
  ROLE_PASSIVE,
  BOSS_ATTACKS,
  BOSS_ULTS,
  RAID_SKIP_COOLDOWN_MS,
  RAID_ULT_BLOCK_MS,
  RAID_WARN_MS,
  RAID_PHASE,
  advance,
  inBreak,
  phaseNeed,
  phaseWeakText,
  chargeLevel,
  raidEffect,
  shieldMs,
  type RaidEvent,
  type RaidKind,
  type RaidRole,
  type RaidState,
} from '../shared/raid';

export interface RaidHelpers {
  esc(s: string): string;
  md(s: string): string;
  btn(label: string, action: string, cls?: string, icon?: string, attrs?: string): string;
  icon(name: string): string;
  figure(svg: string | undefined): string;
  serverTime(): number;
}
let H: RaidHelpers;
export function initRaidUi(h: RaidHelpers) {
  H = h;
}

/* ───────── 美術：public/raid/ 的圖（Codex ImageGen 生成）；圖還沒放進去時用圖示代替 ───────── */
const HERO_ICON: Record<RaidRole, string> = { knight: '🛡️', mage: '🔮', archer: '🏹' };
const BOSS_ICON = { easy: '🐲', normal: '👹', hard: '💀' } as const;
type BossSet = { dir: string; name: Record<keyof typeof BOSS_ICON, string> };
/**
 * 魔王的圖與名字依魔王戰所屬年級（課程 id 的前綴，例如 g9-）切換；沒有自己一套的年級用原本的根號魔王。
 * 九年級的圖放在 public/raid/g9/（生成指示見 scripts/raid-art/PROMPT-g9.md）；圖還沒放進去時一樣顯示圖示。
 */
const BOSSES: Record<'default' | 'g9', BossSet> = {
  default: { dir: '/raid', name: { easy: '根號史萊姆王', normal: '無理數魔像', hard: '混沌根式龍' } },
  g9: { dir: '/raid/g9', name: { easy: '縮放史萊姆', normal: '影長巨像', hard: '相似三角龍' } },
};
export function bossOf(lessonId: string | undefined, d: keyof typeof BOSS_ICON) {
  const set = lessonId?.startsWith('g9-') ? BOSSES.g9 : BOSSES.default;
  return { name: set.name[d], src: `${set.dir}/boss-${d}.webp` };
}
const ROLE_SKILL: Record<RaidRole, string> = { knight: '揮劍斬擊', mage: '火球魔法', archer: '連射箭雨' };
/** 英雄大招：5 種畫面效果。依大招發生的時間與參與的座號決定，每台裝置看到的是同一招。 */
const ULT_SKILLS = [
  { id: 'meteor', name: '流星天墜' },
  { id: 'thunder', name: '雷霆萬鈞' },
  { id: 'flame', name: '烈焰焚天' },
  { id: 'frost', name: '冰晶風暴' },
  { id: 'holy', name: '聖光審判' },
] as const;
export function ultSkill(e: RaidEvent) {
  const seed = (e.seats || []).reduce((s, x) => (s * 31 + x) % 100003, Math.floor(e.t / 7));
  return ULT_SKILLS[seed % ULT_SKILLS.length];
}
const rnd = (a: number, b: number) => (a + Math.random() * (b - a)).toFixed(2);
/** 大招的粒子（每種效果不同）。 */
function ultParticles(id: string) {
  const many = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i)).join('');
  switch (id) {
    case 'meteor':
      return many(14, () => `<i class="meteor" style="--x:${rnd(35, 95)}%;--d:${rnd(0, 0.9)}s;--s:${rnd(0.7, 1.4)}"></i>`);
    case 'thunder':
      return many(6, (i) => `<i class="bolt" style="--x:${rnd(45, 90)}%;--d:${(i * 0.18).toFixed(2)}s"><svg viewBox="0 0 40 200" preserveAspectRatio="none"><polyline points="22,0 10,70 26,80 8,200 34,90 18,82 30,0" /></svg></i>`) + '<i class="thunder-flash"></i>';
    case 'flame':
      return '<i class="flame-ring"></i>' + many(26, () => `<i class="ember" style="--x:${rnd(45, 95)}%;--d:${rnd(0, 1.2)}s;--s:${rnd(0.6, 1.5)}"></i>`);
    case 'frost':
      return many(20, () => `<i class="shard" style="--y:${rnd(15, 80)}%;--d:${rnd(0, 0.9)}s;--r:${rnd(-40, 40)}deg"></i>`) + '<i class="frost-veil"></i>';
    default:
      return '<i class="holy-beam"></i><i class="holy-ring"></i><i class="holy-ring r2"></i><i class="holy-ring r3"></i>' + many(22, () => `<i class="spark" style="--x:${rnd(50, 92)}%;--y:${rnd(10, 85)}%;--d:${rnd(0, 1.4)}s"></i>`);
  }
}
/** 命中時的星光爆裂。 */
function burst(n: number, big = false) {
  return Array.from({ length: n }, (_, i) => `<i style="--a:${Math.round((360 / n) * i + Math.random() * 20)}deg;--l:${big ? rnd(90, 170) : rnd(40, 80)}px"></i>`).join('');
}
/** 背景飄浮的光點。 */
const AMBIENT = Array.from({ length: 18 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i * 0.7) % 9}s;--s:${0.6 + ((i * 13) % 10) / 10}"></i>`).join('');
function art(src: string, fallback: string, cls: string) {
  return `<span class="raid-art ${cls}"><img src="${src}" alt="" data-raid-art><b class="raid-art-icon">${fallback}</b></span>`;
}
/** 圖片載入失敗（還沒生成）就顯示圖示。 */
export function wireArt(root: ParentNode) {
  root.querySelectorAll<HTMLImageElement>('img[data-raid-art]').forEach((img) => {
    const fail = () => img.closest('.raid-art')?.classList.add('no-img');
    if (img.complete && img.naturalWidth === 0) fail();
    else img.addEventListener('error', fail, { once: true });
  });
}
const heroArt = (r: RaidRole, cls = '') => art(`/raid/hero-${r}.webp`, HERO_ICON[r], `hero ${cls}`);
const bossArt = (lessonId: string | undefined, d: keyof typeof BOSS_ICON) => art(bossOf(lessonId, d).src, BOSS_ICON[d], 'boss');

/* ───────── 戰況 ───────── */
export function elapsed(v: RaidView, now: number) {
  return Math.min(now, v.run.endedAt ?? Infinity) - v.run.startedAt;
}
/** 從伺服器給的戰況往前推到現在。 */
export function liveState(v: RaidView, now: number): RaidState {
  const s = structuredClone(v.state);
  return advance(v.run.config, s, Math.max(0, Math.max(s.t, elapsed(v, now))), v.run.seconds);
}
export function raidPhase(v: RaidView, s: RaidState, now: number): 'pre' | 'on' | 'over' {
  if (v.run.endedAt || s.result || v.results) return 'over';
  return now < v.run.startedAt ? 'pre' : 'on';
}
const pct = (a: number, b: number) => `${Math.max(0, Math.min(100, (a / Math.max(1, b)) * 100)).toFixed(1)}%`;
const seatsText = (by: Record<string, number> | number[]) => {
  const list = Array.isArray(by) ? by.map(String) : Object.keys(by);
  return list.length ? list.map((x) => `${x}`).join('、') + ' 號' : '';
};
const bossMove = (id?: string) => [...BOSS_ATTACKS, ...BOSS_ULTS].find((m) => m.id === id);
/** 防護罩存量是誰存的（依先後、不重複）。 */
function bankSeats(s: RaidState) {
  const out: number[] = [];
  for (const x of s.shieldBank) if (!out.includes(x.seat)) out.push(x.seat);
  return out;
}
function shortSeats(list: number[], max = 8) {
  return list.length > max ? `${list.slice(0, max).join('、')}…等 ${list.length} 人` : seatsText(list);
}
function eventKey(e: RaidEvent) {
  return `${e.t}:${e.k}:${e.seat ?? ''}`;
}
function resultTitle(s: RaidState, v: RaidView) {
  if (s.result === 'win') return '🎉 魔王被打倒了！';
  if (s.result === 'lose') return '英雄們倒下了…';
  if (s.result === 'timeout') return '⏰ 時間到！魔王獲勝';
  return v.run.endedAt ? '戰鬥提前結束（不分勝負）' : '';
}

/* ───────── 老師：冒險地圖（魔王戰頁、還沒開戰時） ───────── */
export function raidMapHtml(map: NonNullable<import('../shared/types').SessionView['raidMap']>, lessonId?: string): string {
  const order = ['easy', 'normal', 'hard'] as const;
  const nodes = order
    .map((d, i) => {
      const w = map.wins[d];
      const time = w ? `${Math.floor(w.ms / 60000)} 分 ${Math.round((w.ms % 60000) / 1000)} 秒` : '';
      return `<div class="raid-map-node ${w ? 'won' : ''}" data-testid="raid-map-${d}">${bossArt(lessonId, d)}<b>${bossOf(lessonId, d).name}</b><small>${DIFFICULTY_NAME[d]}</small><span>${w ? `✓ 已擊敗・最快 ${time}` : i > 0 && !map.wins[order[i - 1]] ? '先打倒前一隻吧' : '等待挑戰'}</span></div>`;
    })
    .join('<i class="raid-map-path"></i>');
  const done = order.filter((d) => map.wins[d]).length;
  return `<div class="raid-board raid-map" data-testid="raid-map"><div class="raid-map-head"><strong>🗺 冒險地圖・${H.esc(map.section || '')} ${H.esc(map.title)}</strong><small>全班已擊敗 ${done}／3 位魔王｜在右邊選難度和時間，按「開戰」</small></div><div class="raid-map-nodes">${nodes}</div><p class="raid-map-tip">記憶題＝普通攻擊・理解題＝存防護罩・應用題＝大招（越多人一起做越強）</p></div>`;
}

/* ───────── 老師：大螢幕戰場 ───────── */
export function raidBoardHtml(v: RaidView, lessonId?: string): string {
  const d = v.run.difficulty;
  const roles = Object.values(v.roles || {});
  const heroes = RAID_ROLES.map((r) => `<div class="raid-hero" data-role="${r}">${heroArt(r)}<small>${ROLE_NAME[r]} ×<b id="rb-n-${r}">${roles.filter((x) => x === r).length}</b></small></div>`).join('');
  return `<div class="raid-board" data-testid="raid-board" data-difficulty="${d}">
<div class="raid-top"><strong class="raid-boss-name">${bossOf(lessonId, d).name}<small>${DIFFICULTY_NAME[d]}</small></strong><div class="raid-bar boss" title="魔王血量"><i class="hp" id="rb-boss-hp"></i><i class="sh" id="rb-boss-sh"></i>${phaseMarks(v)}<span id="rb-boss-text"></span></div><div class="raid-bar charge" title="魔王蓄力（滿了會預告大招）"><i id="rb-charge"></i><span>魔王蓄力</span></div><span class="raid-clock" id="rb-clock"></span></div>
<div class="raid-arena" id="rb-arena"><div class="raid-ambient" aria-hidden="true">${AMBIENT}</div><div class="raid-heroes" id="rb-heroes">${heroes}<div class="raid-shield" id="rb-shield"></div></div><div class="raid-boss" id="rb-boss"><i class="raid-aura"></i>${bossArt(lessonId, d)}${v.run.config?.phase ? BARRIER : ''}</div><div class="raid-fx" id="rb-fx"></div><div class="raid-warn" id="rb-warn" hidden></div><div class="raid-resist" id="rb-resist" hidden></div>${v.run.config?.phase ? '<div class="raid-phase" id="rb-phase" data-testid="raid-phase" hidden></div><div class="raid-toasts" id="rb-toasts" aria-live="polite"></div>' : ''}</div>
<div class="raid-bottom"><div class="raid-bar team" title="英雄血量（全班共用）"><i id="rb-team"></i><span id="rb-team-text"></span></div><div class="raid-info" id="rb-shield-info"></div><div class="raid-bar ult" title="大招計量"><i id="rb-ult"></i><span id="rb-ult-text"></span></div><ol class="raid-feed" id="rb-feed"></ol></div>
<div class="raid-overlay" id="rb-overlay"></div></div>`;
}
/* ───────── 魔王護盾（困難魔王、題庫有分析題時）───────── */
/** 護盾上的裂痕：8 道，依「裂痕數／門檻」一道一道亮起來。 */
const CRACKS = [
  'M50 8 L46 24 L54 33 L47 47',
  'M86 26 L72 34 L74 46 L62 52',
  'M92 62 L76 60 L68 70 L58 66',
  'M70 92 L64 78 L54 76 L52 64',
  'M30 92 L38 78 L33 68 L44 62',
  'M8 62 L24 60 L30 50 L42 54',
  'M14 26 L28 34 L26 46 L38 50',
  'M50 50 L58 44 L66 50 L72 42',
];
const BARRIER = `<div class="raid-barrier" id="rb-barrier" data-testid="raid-barrier" hidden><svg viewBox="0 0 100 100" aria-hidden="true">${CRACKS.map((d) => `<path d="${d}" />`).join('')}</svg></div>`;
/** 魔王血條上張開護盾的刻度（8 分鐘以上 70%、35%；未滿 8 分鐘只有 50%，舊紀錄照當時的設定）。 */
function phaseMarks(v: RaidView) {
  return (v.run.config?.phase?.at || []).map((p) => `<b class="raid-mark" style="left:${p}%" title="血量 ${p}% 張開護盾"></b>`).join('');
}
/** 這一刻的護盾狀態（給大螢幕、學生戰況區、選招按鈕）。 */
export function phaseInfo(v: RaidView, s: RaidState) {
  const c = v.run.config;
  if (!c.phase) return null;
  const p = s.phase || null;
  const brk = inBreak(s, s.t);
  return { p, need: p ? phaseNeed(c, p) : 0, brk, breakLeft: brk ? Math.ceil((s.breakUntil! - s.t) / 1000) : 0, hintLeft: p && !p.hinted ? Math.max(0, Math.ceil((p.at + c.phase.hintMs - s.t) / 1000)) : 0, cfg: c.phase };
}
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
function updatePhase(root: HTMLElement, v: RaidView, s: RaidState) {
  const info = phaseInfo(v, s);
  const el = root.querySelector<HTMLElement>('#rb-phase');
  const bar = root.querySelector<HTMLElement>('#rb-barrier');
  const board = root.querySelector<HTMLElement>('.raid-board');
  if (!info || !el || !bar) return;
  const { p, need, brk, cfg } = info;
  const weak = phaseWeakText(cfg);
  board?.classList.toggle('shielded', !!p && !s.result);
  board?.classList.toggle('guard-broken', brk && !s.result);
  bar.hidden = !p;
  if (p) {
    const lit = Math.min(CRACKS.length, Math.round((p.cracks / Math.max(1, need)) * CRACKS.length));
    bar.querySelectorAll('path').forEach((x, i) => x.classList.toggle('on', i < lit));
    bar.style.setProperty('--crack', String(Math.min(1, p.cracks / Math.max(1, need))));
  }
  let html = '';
  if (s.result) html = '';
  else if (p) {
    const sup = p.support % cfg.support;
    html = `<b>🛡 魔王護盾${cfg.at.length > 1 ? `・第 ${p.layer + 1}/${cfg.at.length} 層` : ''}</b><span class="raid-phase-count" data-testid="raid-phase-count">破盾 <em>${p.cracks}</em>/${need}</span><small>答對分析題打出裂痕（每人最多 ${cfg.cap} 道）・其他傷害只剩 ${cfg.dmgPct}%</small>${weak ? `<small data-testid="raid-phase-weak">😮‍💨 護盾期間魔王攻擊減弱：${weak}</small>` : ''}<small>🤝 應用題支援 ${sup}/${cfg.support}（滿了門檻 −1）・${p.hinted ? '💡 已給提示、門檻 −1' : `💡 ${mmss(info.hintLeft)} 後給提示`}</small>`;
  } else if (brk) html = `<b>💥 破防！</b><span class="raid-phase-count">所有傷害 ×${cfg.breakPct / 100}</span><small>剩 ${info.breakLeft} 秒，全力攻擊！</small>`;
  el.hidden = !html;
  if (el.innerHTML !== html) el.innerHTML = html;
  el.classList.toggle('brk', brk);
}
/** 大螢幕的提示條（打出裂痕、支援、提示）：疊在戰場上，不佔版面。 */
function toast(root: HTMLElement, html: string, cls = '') {
  const box = root.querySelector<HTMLElement>('#rb-toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `raid-toast ${cls}`;
  el.innerHTML = html;
  box.appendChild(el);
  while (box.children.length > 4) box.firstElementChild?.remove();
  setTimeout(() => el.remove(), 3200);
}

const animated = new Set<string>();
let boardRun = '';
/** 每 0.25 秒：更新血條、防護罩、計量、預告；新的事件播動畫。 */
export function updateRaidBoard(root: HTMLElement, v: RaidView, now: number) {
  const s = liveState(v, now),
    c = v.run.config,
    t = elapsed(v, now);
  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`);
  if (boardRun !== v.run.id) {
    boardRun = v.run.id;
    animated.clear();
    // 進場前已經發生的事件不重播
    for (const e of s.log) animated.add(eventKey(e));
  }
  $('rb-boss-hp')!.style.width = pct(s.bossHp, c.bossHp);
  $('rb-boss-sh')!.style.width = pct(s.bossShield, c.bossHp);
  $('rb-boss-text')!.textContent = `${s.bossHp} / ${c.bossHp}${s.bossShield ? `　魔王護甲 ${s.bossShield}` : ''}${s.phase ? '　🛡 護盾中' : ''}`;
  updatePhase(root, v, s);
  // 血少的時候血條閃爍、畫面邊緣變紅
  const board = root.querySelector<HTMLElement>('.raid-board');
  board?.classList.toggle('boss-low', s.bossHp > 0 && s.bossHp / c.bossHp < 0.25);
  board?.classList.toggle('team-low', s.teamHp > 0 && s.teamHp / c.teamHp < 0.3);
  board?.classList.toggle('warning', s.bossUltAt !== null && !s.result);
  const charge = chargeLevel(c, s);
  $('rb-charge')!.style.width = `${(charge * 100).toFixed(1)}%`;
  $('rb-team')!.style.width = pct(s.teamHp, c.teamHp);
  $('rb-team-text')!.textContent = `英雄血量 ${s.teamHp} / ${c.teamHp}`;
  $('rb-ult')!.style.width = pct(s.ult, RAID_ULT_NEED);
  $('rb-ult-text')!.textContent = `大招計量 ${Math.round((s.ult / RAID_ULT_NEED) * 100)}%${Object.keys(s.ultBy).length ? `｜${seatsText(s.ultBy)}` : ''}`;
  const bank = shieldMs(s);
  $('rb-shield')!.classList.toggle('on', bank > 0);
  const charging = v.charging || [];
  $('rb-shield-info')!.innerHTML =
    (bank > 0 ? `<b>🛡 防護罩存量 ${bank / 1000} 秒</b><span>${shortSeats(bankSeats(s))}提供</span>` : '<span class="muted">🛡 防護罩存量 0（做理解題存防護罩，魔王攻擊時自動擋下）</span>') +
    (charging.length ? `<span class="raid-charging">🔥 正在算大招：${shortSeats(charging)}</span>` : '');
  const warn = $('rb-warn')!;
  if (s.bossUltAt !== null && !s.result) {
    const m = bossMove(s.bossUltMove || undefined);
    warn.hidden = false;
    warn.innerHTML = `⚠ 魔王大招「${m?.name || ''}」${Math.max(0, Math.ceil((s.bossUltAt - s.t) / 1000))} 秒後落下！<small>${m?.tip || ''}｜存滿 ${RAID_ULT_BLOCK_MS / 1000} 秒防護罩就能擋下（目前 ${bank / 1000} 秒）</small>`;
  } else warn.hidden = true;
  const resist = $('rb-resist');
  const rt = resistText(s, c.players);
  if (resist) {
    resist.hidden = !rt;
    resist.textContent = rt;
  }
  const left = v.run.seconds * 1000 - Math.max(0, t);
  $('rb-clock')!.textContent = now < v.run.startedAt ? '準備' : `${Math.floor(Math.max(0, left) / 60000)}:${String(Math.floor((Math.max(0, left) % 60000) / 1000)).padStart(2, '0')}`;
  for (const r of RAID_ROLES) {
    const n = $(`rb-n-${r}`);
    if (n) n.textContent = String(Object.values(v.roles || {}).filter((x) => x === r).length);
  }
  // 戰況訊息
  $('rb-feed')!.innerHTML = s.log
    .filter((e) => e.k !== 'wrong')
    .slice(-5)
    .reverse()
    .map((e) => `<li class="k-${e.k}">${feedText(e, v)}</li>`)
    .join('');
  for (const e of s.log) {
    const key = eventKey(e);
    if (animated.has(key)) continue;
    animated.add(key);
    fx(root, e, v);
  }
  // 倒數、結算
  const overlay = $('rb-overlay')!;
  const phase = raidPhase(v, s, now);
  const want = phase === 'pre' ? `pre:${Math.ceil((v.run.startedAt - now) / 1000)}` : phase === 'over' ? `over:${v.results ? v.results.length : 'x'}:${s.result}:${v.run.endedAt ?? ''}` : '';
  if (overlay.dataset.key !== want) {
    overlay.dataset.key = want;
    overlay.className = `raid-overlay ${phase}`;
    overlay.innerHTML =
      phase === 'pre'
        ? `<div class="raid-count">${Math.max(1, Math.ceil((v.run.startedAt - now) / 1000))}</div><p>選好角色，準備開戰！</p>`
        : phase === 'over'
          ? resultsHtml(v, s)
          : '';
  }
}
/** 魔王適應：某一類出招太多時的提示（沒有就空字串）。 */
function resistText(s: RaidState, players: number) {
  const parts = (['attack', 'ultimate'] as const)
    .map((k) => [k, raidEffect(s, k, s.t, players)] as const)
    .filter(([, e]) => e < 1)
    .map(([k, e]) => `${KIND_NAME[k]}效果只剩 ${Math.round(e * 100)}%`);
  return parts.length ? `🧬 魔王適應了！${parts.join('、')}，換別的招！` : '';
}
/** 護盾擋掉（×0.5，舊紀錄 ×0.2）、破防（×2）的標記。 */
const mult = (e: RaidEvent) => (!e.x ? '' : e.x < 1 ? '（護盾擋下，只剩 ' + Math.round(e.x * 100) + '%）' : `（破防 ×${e.x}）`) + (e.held ? '（魔王血量停在護盾門檻，先破盾）' : '');
function feedText(e: RaidEvent, v: RaidView) {
  const who = e.seat ? `${e.seat} 號${v.roles?.[String(e.seat)] ? ROLE_NAME[v.roles[String(e.seat)]] : ''}` : '';
  switch (e.k) {
    case 'atk':
      return (e.n ? `⚔ ${who} 攻擊 −${e.n}${e.absorbed ? `（魔王護甲擋下 ${e.absorbed}）` : ''}` : `⚔ ${who} 攻擊，被魔王護甲擋下 ${e.absorbed}`) + (e.eff ? `（魔王抗性 ${Math.round(e.eff * 100)}%）` : '') + mult(e);
    case 'shield':
      return `🛡 ${who} 存了 1 秒防護罩（共 ${(e.n || 0) / 1000} 秒）`;
    case 'ult':
      return `💥 大招・${ultSkill(e).name} −${e.n}！${shortSeats(e.seats || [])}共同發動${(e.combo || 1) > 1 ? `（全班 ${e.team} 人合擊 ×${e.combo}）` : ''}${mult(e)}`;
    case 'bossAtk':
      return `👊 魔王${bossMove(e.move)?.name || '攻擊'} −${e.n}${e.blocked ? `（防護罩擋掉 ${e.blocked / 1000} 秒）` : ''}`;
    case 'bossBlock':
      return `✨ 防護罩擋下魔王${bossMove(e.move)?.name || '攻擊'}！（${shortSeats(e.seats || [])}的防護罩）`;
    case 'bossShield':
      return `🔰 魔王護甲 +${e.n}`;
    case 'bossWarn':
      return `⚠ 魔王開始蓄力大招「${bossMove(e.move)?.name || ''}」！`;
    case 'bossUlt':
      return `☄ 魔王大招・${bossMove(e.move)?.name || ''} −${e.n}${e.blocked ? `（防護罩擋掉 ${e.blocked / 1000} 秒）` : ''}`;
    case 'bossUltBlock':
      return `🌟 防護罩擋下魔王大招・${bossMove(e.move)?.name || ''}！（${shortSeats(e.seats || [])}）`;
    case 'bossBreak':
      return `💔 破盾重錘打碎了 ${(e.n || 0) / 1000} 秒防護罩`;
    case 'bossHeal':
      return `🩸 魔王吸血，回復 ${e.n} 血`;
    case 'bossSeal':
      return `🌫 封印之霧：英雄的大招計量歸零`;
    case 'phaseOn':
      return `🛡 魔王張開${(v.run.config.phase?.at.length ?? 2) > 1 ? `第 ${(e.layer || 0) + 1} 層` : ''}護盾！破盾需要 ${e.n} 道裂痕（分析題）`;
    case 'crack':
      return e.dup ? `✓ ${who} 也解出同一題（已經算過）` : `⚡ ${who} 打出裂痕！破盾 ${e.n}/${e.need}`;
    case 'analysis':
      return `🧠 ${who} 分析重擊 −${e.n}${mult(e)}`;
    case 'phaseSupport':
      return `🤝 應用題支援：破盾門檻 −1（現在 ${e.need}）`;
    case 'phaseHint':
      return `💡 護盾撐了 3 分鐘：分析題出現提示，門檻 −1（現在 ${e.need}）`;
    case 'phaseBreak':
      return `💥 破盾！破防 ${(e.n || 0) / 1000} 秒，所有傷害 ×2（${shortSeats(e.seats || [])}打出裂痕）`;
    case 'win':
      return '🎉 魔王被打倒了！';
    case 'lose':
      return '英雄們倒下了…';
    case 'timeout':
      return '⏰ 時間到！魔王獲勝';
    default:
      return '';
  }
}
/** 一個事件的動畫：英雄出招、魔王受傷、防護罩閃光、大招全畫面。 */
function fx(root: HTMLElement, e: RaidEvent, v: RaidView) {
  const layer = root.querySelector<HTMLElement>('#rb-fx');
  const boss = root.querySelector<HTMLElement>('#rb-boss');
  const arena = root.querySelector<HTMLElement>('#rb-arena');
  if (!layer || !boss || !arena) return;
  const add = (cls: string, html = '', ms = 1200) => {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    layer.appendChild(el);
    setTimeout(() => el.remove(), ms);
    return el;
  };
  const pulse = (el: HTMLElement, cls: string) => {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  };
  const role = (e.seat && v.roles?.[String(e.seat)]) || 'knight';
  if (e.k === 'atk') {
    const hero = root.querySelector<HTMLElement>(`.raid-hero[data-role="${role}"]`);
    if (hero) pulse(hero, 'lunge');
    add(`raid-shot role-${role}`, `<span>${{ knight: '⚔', mage: '🔥', archer: '➶' }[role]}</span>`, 900);
    setTimeout(() => {
      pulse(boss, 'hit');
      add(`raid-burst role-${role}`, burst(10), 700);
      // 全部被魔王護甲吸收時不寫「−0」
      add('raid-dmg', `${e.n ? `−${e.n}` : '護甲擋下'}${e.absorbed && e.n ? `<small>護甲擋 ${e.absorbed}</small>` : ''}<em>${e.seat} 號</em>`, 1400);
    }, 450);
  } else if (e.k === 'shield') {
    add('raid-shield-pop', `+1 秒<em>${e.seat} 號</em>`, 1200);
  } else if (e.k === 'ult') {
    // 大招：5 種效果隨機（每台裝置同一招），名稱「大招・四個字」
    const sk = ultSkill(e);
    pulse(arena, 'ult-flash');
    const combo = (e.combo || 1) > 1 ? `・全班 ${e.team} 人合擊 ×${e.combo}` : '';
    add(`raid-ult fx-${sk.id}`, `<div class="ult-fx">${ultParticles(sk.id)}</div><div class="ult-banner"><b>大招・${sk.name}</b><span>${shortSeats(e.seats || [], 10)}共同發動${combo}</span><strong>−${e.n}</strong></div>`, 3800);
    setTimeout(() => {
      pulse(boss, 'hit-big');
      pulse(arena, 'shake-big');
      add(`raid-burst big fx-${sk.id}`, burst(22, true), 1300);
    }, 1100);
  } else if (e.k === 'bossAtk' || e.k === 'bossUlt' || e.k === 'bossBlock' || e.k === 'bossUltBlock') {
    // 魔王出招：每一招的動畫不同（爪擊、衝撞、連擊；4 種大招）
    const m = bossMove(e.move);
    const ult = e.k === 'bossUlt' || e.k === 'bossUltBlock';
    const blocked = e.k === 'bossBlock' || e.k === 'bossUltBlock';
    pulse(boss, e.move === 'charge' ? 'boss-charge' : 'boss-attack');
    add(`raid-boss-move mv-${e.move || 'claw'}`, ult ? `<b>${m?.name || ''}</b>` : '<i></i><i></i><i></i>', ult ? 2400 : 900);
    setTimeout(() => {
      if (blocked) {
        const sh = root.querySelector<HTMLElement>('#rb-shield');
        if (sh) pulse(sh, 'flash');
        add(`raid-blocked ${ult ? 'big' : ''}`, `擋下${m?.name || ''}！<em>${shortSeats(e.seats || [])}的防護罩</em>`, 1600);
      } else {
        pulse(arena, ult || e.move === 'charge' ? 'shake-big' : 'shake');
        add(`raid-hurt ${ult ? 'big' : ''}`, `−${e.n}${e.blocked ? `<small>防護罩擋 ${e.blocked / 1000} 秒</small>` : ''}`, 1300);
      }
    }, ult ? 900 : 300);
  } else if (e.k === 'bossBreak') {
    const sh = root.querySelector<HTMLElement>('#rb-shield');
    if (sh) pulse(sh, 'shatter');
    add('raid-blocked big broken', `💔 防護罩被打碎 ${(e.n || 0) / 1000} 秒`, 1600);
  } else if (e.k === 'bossHeal') {
    pulse(boss, 'boss-heal');
    add('raid-heal', `+${e.n}`, 1500);
  } else if (e.k === 'bossSeal') {
    add('raid-seal', '<b>🌫 大招計量被封印</b>', 2200);
  } else if (e.k === 'bossShield') {
    pulse(boss, 'boss-guard');
  } else if (e.k === 'phaseOn') {
    pulse(boss, 'boss-guard');
    add('raid-phase-banner', `<b>🛡 魔王張開護盾！</b><span>答對分析題打出 ${e.n} 道裂痕才能破盾・其他攻擊只剩 ${v.run.config.phase?.dmgPct ?? 20}%${phaseWeakText(v.run.config.phase) ? '・魔王攻擊減弱' : ''}</span>`, 3200);
  } else if (e.k === 'crack' && !e.dup) {
    const bar = root.querySelector<HTMLElement>('#rb-barrier');
    if (bar) pulse(bar, 'hit');
    toast(root, `⚡ <b>${e.seat} 號</b> 打出裂痕！<em>破盾 ${e.n}/${e.need}</em>`, 'crack');
  } else if (e.k === 'analysis') {
    pulse(boss, 'hit');
    add('raid-dmg', `−${e.n}<small>分析重擊</small><em>${e.seat} 號</em>`, 1400);
  } else if (e.k === 'phaseSupport') {
    toast(root, `🤝 應用題支援！<em>破盾門檻 −1（現在 ${e.need}）</em>`, 'support');
  } else if (e.k === 'phaseHint') {
    toast(root, `💡 護盾撐了 3 分鐘：<em>分析題出現提示、門檻 −1</em>`, 'hint');
  } else if (e.k === 'phaseBreak') {
    pulse(arena, 'shake-big');
    pulse(boss, 'hit-big');
    add('raid-phase-banner brk', `<b>💥 破盾！</b><span>破防 ${(e.n || 0) / 1000} 秒：所有傷害 ×2</span><em>${shortSeats(e.seats || [], 10)}打出裂痕</em>`, 3600);
  } else if (e.k === 'win') {
    pulse(boss, 'defeated');
  }
}
function resultsHtml(v: RaidView, s: RaidState) {
  const res = v.results || [];
  const tally = s.tally;
  const ms = s.endAt ?? Math.min(s.t, v.run.seconds * 1000);
  const minutes = `${Math.floor(ms / 60000)} 分 ${Math.round((ms % 60000) / 1000)} 秒`;
  // 有分析題的場次多一欄（裂痕數）
  const ana = !!v.run.config.phase;
  const rows = res
    .map(
      (r, i) =>
        `<tr><td>${i + 1}</td><td><b>${r.seat} 號</b></td><td><span class="raid-title lv${r.level}">Lv${r.level} ${H.esc(r.title)}</span>${r.badges.map((b) => `<span class="raid-badge">${H.esc(b)}</span>`).join('')}</td><td>${r.score}</td><td>${r.correct}${r.goal ? `／${r.goal}${r.correct >= r.goal ? ' ✓' : ''}` : ''}</td><td>${r.stats.ok.attack}/${r.stats.n.attack}</td><td>${r.stats.ok.shield}/${r.stats.n.shield}</td><td>${r.stats.ok.ultimate}/${r.stats.n.ultimate}</td>${ana ? `<td>${r.stats.ok.analysis ?? 0}/${r.stats.n.analysis ?? 0}${r.stats.cracks ? `（裂痕 ${r.stats.cracks}）` : ''}</td>` : ''}</tr>`,
    )
    .join('');
  if (!v.results) return `<div class="raid-result ${s.result || 'ended'}" data-testid="raid-result"><h2>${resultTitle(s, v)}</h2><p class="raid-sum">結算中…</p></div>`;
  return `<div class="raid-result ${s.result || 'ended'}" data-testid="raid-result"><h2>${resultTitle(s, v)}</h2><p class="raid-sum">${minutes}・限時 ${v.run.seconds / 60} 分鐘・攻擊 ${tally.atk || 0} 次・防護罩擋下 ${(tally.bossBlock || 0) + (tally.bossUltBlock || 0)} 次・大招 ${tally.ult || 0} 次${ana ? `・破盾 ${tally.phaseBreak || 0}／${tally.phaseOn || 0} 層` : ''}・魔王剩 ${s.bossHp} 血</p>${
    rows
      ? `<div class="raid-table-wrap"><table class="raid-table"><thead><tr><th></th><th>座號</th><th>稱號</th><th>貢獻</th><th>答對／目標</th><th>記憶</th><th>理解</th><th>應用</th>${ana ? '<th>分析</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>`
      : '<p class="muted">這一場沒有人作答。</p>'
  }</div>`;
}

/* ───────── 老師：控制區 ───────── */
export function raidPanelHtml(v: RaidView | undefined, prefs: { difficulty: string; seconds: number }, hasBank: boolean): string {
  const head = `<header><strong>${H.icon('bolt')}魔王戰</strong></header>`;
  if (!hasBank) return `${head}<p class="muted small-text">這一課沒有魔王戰題庫。</p>`;
  const now = H.serverTime();
  const setup = `<div class="tool-row"><label class="time-limit">難度 <select id="raid-difficulty">${(['easy', 'normal', 'hard'] as const).map((d) => `<option value="${d}" ${prefs.difficulty === d ? 'selected' : ''}>${DIFFICULTY_NAME[d]}</option>`).join('')}</select></label><label class="time-limit">${H.icon('clock')}<select id="raid-seconds">${[300, 360, 420, 480, 540, 600].map((x) => `<option value="${x}" ${prefs.seconds === x ? 'selected' : ''}>${x / 60} 分鐘</option>`).join('')}</select></label></div>`;
  if (!v) {
    return `${head}<p class="muted small-text">全班合作打魔王。學生每一題自己選：記憶題＝普通攻擊、理解題＝防護罩（答對 1 題存 1 秒，魔王攻擊時自動擋下；沒人存很容易輸）、應用題＝大招計量（無視魔王護甲，越多人一起做合擊加成越高，最多 2 倍；不會做可以換一題、答錯只鎖 3 秒）。全班一直只做記憶題，魔王會適應、普通攻擊效果變差。答錯鎖 5 秒，魔王蓄力加快。魔王有 3 種普通攻擊、4 種大招，大招落下前 ${RAID_WARN_MS / 1000} 秒預告。<b>時間到還沒打倒魔王，就算魔王獲勝。</b>魔王的血量依上線人數、難度和時間調整。<b>困難魔王（題庫有分析題時）</b>：未滿 8 分鐘（含 5 分鐘）血量 50% 張開一層護盾；8 分鐘以上 70%、35% 各一層。護盾中其他題只剩 ${RAID_PHASE.dmgPct}% 傷害，魔王攻擊減弱（普攻只剩 ${RAID_PHASE.atkPct}%、暫停蓄力；已經預告的大招照樣落下）；學生答對分析題打出裂痕（每人每層最多 ${RAID_PHASE.cap} 道），裂痕到門檻（線上人數 ${RAID_PHASE.needPct[0]}%，至少 ${RAID_PHASE.needMin}；28 人＝5）就破盾、破防 15 秒傷害 ×2。全班每答對 10 題應用題門檻 −1；撐 3 分鐘給提示、門檻 −1。</p>${setup}<div class="tool-row">${H.btn('開戰', 'raid-start', 'primary', 'bolt', 'data-testid="raid-start"')}</div>`;
  }
  const s = liveState(v, now),
    phase = raidPhase(v, s, now);
  const players = Object.keys(v.roles || {}).length;
  const status = phase === 'pre' ? '倒數中' : phase === 'on' ? '戰鬥中' : resultTitle(s, v);
  return `${head}<p class="quiz-status" data-testid="raid-status">${DIFFICULTY_NAME[v.run.difficulty]}・${v.run.seconds / 60} 分鐘・${status}｜已選角色 ${players} 人（開戰時上線 ${v.run.config.players} 人）</p>${
    phase === 'over'
      ? `${setup}<div class="tool-row">${H.btn('再戰一場', 'raid-start', 'primary', 'bolt', 'data-testid="raid-again"')}${H.btn('關閉', 'raid-close', 'quiet', 'x')}</div>`
      : `<p class="muted small-text">時間到還沒打倒魔王就算魔王獲勝；「提前結束」不分勝負。</p><div class="tool-row">${H.btn('提前結束', 'raid-end', 'secondary', 'x', 'data-testid="raid-end"')}</div>`
  }<p class="muted small-text">題庫：記憶 ${v.pools.attack} 題、理解 ${v.pools.shield} 題、應用 ${v.pools.ultimate} 題${v.pools.analysis ? `、分析 ${v.pools.analysis} 題（破盾門檻 ${v.run.config.phase?.need.join('／')}）` : ''}。</p>`;
}

/* ───────── 學生：作答卡 ───────── */
export interface RaidLocal {
  flash: string;
  sending: boolean;
  /** 學生按了「先不設定目標」（這一場）。 */
  noGoal: string;
  /** 分析題「判斷＋理由」：兩段各選了哪一個（q＝題目 id）。 */
  pick: { q: string; a?: number; r?: number };
  /**
   * 作答送出中（先顯示再同步）：剛點的選項先標成已選、整排鎖住，只代表「我選了這個」，不猜對錯、不動血量。
   * run＋q（題目 id）對得上才顯示；回應回來（成功或失敗）就拿掉。
   */
  pending?: { run: string; q: string; choice: number };
}
export const raidLocal: RaidLocal = { flash: '', sending: false, noGoal: '', pick: { q: '' } };
/** 這一題送出中的選擇（別場、別題不算）。 */
function pendingChoice(v: RaidView, qid: string) {
  const p = raidLocal.pending;
  return p && p.run === v.run.id && p.q === qid ? p.choice : undefined;
}
/** 一般選項（點了就送出）：送出中的那一個標成已選。 */
function answerOption(v: RaidView, qid: string, o: string, i: number) {
  const on = pendingChoice(v, qid) === i;
  return `<button type="button" class="answer-option ${on ? 'selected' : ''}" data-action="raid-answer" data-choice="${i}" data-testid="raid-option-${i}" aria-pressed="${on}" ${raidLocal.sending ? 'disabled' : ''}><span class="option-letter">${String.fromCharCode(65 + i)}</span><span>${H.md(o)}</span></button>`;
}
/** 目標的建議：有個人最佳就追平、突破、挑戰；沒有就 3、5、8 題。 */
function goalChoices(prev?: number): [number, string][] {
  if (prev === undefined || prev < 1) return [[3, '穩穩來'], [5, '拚一下'], [8, '挑戰']];
  return [[prev, '追平紀錄'], [prev + 2, '突破紀錄'], [prev + 4, '大挑戰']];
}
/**
 * 上方的小戰況（每 0.25 秒更新）。行數固定：血條、存量／大招、自己的進度、一格固定兩行高的提示。
 * 2026-10-30 第三輪：以前「已答對」、抗性提示、大招預告是有才出現，文字長度每秒在變，在不同寬度換行成 1～4 行，
 * 戰況區高度一變，下面的題目就被推上推下（沒往下捲、或題目放得下的學生沒有捲動補償可以救）。現在每一行都不換行、
 * 提示格的高度固定，戰況區的高度在整場魔王戰中不變。
 * 提示格的兩行各自不換行，關鍵數字放在最前面（太長只會省略尾巴）：
 * 大招預告和抗性同時成立時第 1 行大招預告、第 2 行抗性，兩個都看得到（≤760px 的作答分頁看不到戰場，這裡是唯一來源，Codex 審查）。
 */
export function raidMiniHtml(v: RaidView, now: number) {
  const s = liveState(v, now),
    c = v.run.config;
  const bank = shieldMs(s);
  const warning = s.bossUltAt !== null && !s.result;
  const warn = warning ? `⚠ 魔王大招 ${Math.max(0, Math.ceil(((s.bossUltAt ?? 0) - s.t) / 1000))} 秒後・防護罩 ${bank / 1000}／${RAID_ULT_BLOCK_MS / 1000} 秒` : '';
  const eff = raidEffect(s, 'attack', s.t, c.players);
  // 2026-11：卡片不再被提示格撐寬（src/raid.css .raid-mini），300px 面板放得下的長度
  const resist = eff < 1 ? `🧬 ${KIND_NAME.attack}只剩 ${Math.round(eff * 100)}%，換別招！` : '';
  const line = (cls: string, text: string) => `<span class="raid-alert-line ${cls}" data-testid="raid-alert-${cls}">${text}</span>`;
  // 護盾（困難魔王）：狀態放進既有的固定列（存量那一行中間一格、提示格第 2 行），血條加疊加樣式，不新增任何一行
  const ph = phaseInfo(v, s);
  // 護盾期間魔王攻擊減弱（新場次才有）：護盾開啟、沒有大招預告與抗性時放在提示格第 1 行（同一格換文字，高度不變）
  const weak = ph ? phaseWeakText(ph.cfg, true) : '';
  const phTip = !ph ? '' : ph.p ? `🛡 護盾：其他只剩 ${ph.cfg.dmgPct}%，做分析題` : ph.brk ? `💥 破防：所有傷害 ×${ph.cfg.breakPct / 100}！` : `血量 ${ph.cfg.at.join('%／')}% 時張開護盾`;
  const lines = warning
    ? [line('warn', warn), resist ? line('resist', resist) : line('tip', `「${bossMove(s.bossUltMove || undefined)?.name || ''}」：做理解題存防護罩擋下！`)]
    : resist
      ? [line('resist', resist), line('tip', ph && (ph.p || ph.brk) ? phTip : '理解題、應用題不受影響')]
      : [line('tip', ph?.p && weak ? `🛡 ${weak}` : '記憶題攻擊・理解題存防護罩・應用題累積大招'), line('tip', phTip)];
  const phSpan = !ph ? '' : `<span class="raid-info-ph ${ph.p ? 'on' : ph.brk ? 'brk' : ''}" data-testid="raid-mini-phase">${ph.p ? `🔰 破盾 ${ph.p.cracks}/${ph.need}` : ph.brk ? `💥 破防 ${ph.breakLeft} 秒` : ''}</span>`;
  const bossCls = ph?.p ? ' shielded' : ph?.brk ? ' guard-broken' : '';
  return `<div class="raid-mini-bars"><div class="raid-bar boss small${bossCls}"><i class="hp" style="width:${pct(s.bossHp, c.bossHp)}"></i><span>魔王 ${s.bossHp}</span></div><div class="raid-bar team small"><i style="width:${pct(s.teamHp, c.teamHp)}"></i><span>英雄 ${s.teamHp}</span></div></div><div class="raid-mini-info">${
    // 護盾／破防那一格出現時，存量省略「存量」兩字（944px 的 iPad 面板放不下「🛡 存量 1.5 秒」＋「💥 破防 15 秒」＋大招）
    bank > 0 ? `<span class="on">🛡 ${ph?.p || ph?.brk ? '' : '存量 '}${bank / 1000} 秒</span>` : `<span>🛡 ${ph?.p || ph?.brk ? '0 秒' : '存量 0'}</span>`
  }${phSpan}<span>💥 大招 ${Math.round((s.ult / RAID_ULT_NEED) * 100)}%</span></div>${myLine(v, s)}<div class="raid-mini-alert ${warning ? 'warn' : resist ? 'resist' : 'idle'}" data-testid="raid-mini-alert">${lines.join('')}</div>`;
}
/**
 * 自己的進度：目標、答對題數、連對（這一行一直都在）。
 * 自己的座號從伺服器給的戰況取（學生只拿得到自己的成績）；liveState 往前推算時會替別的座號建立成績（防護罩、大招），
 * 不可以拿 Object.values(s.stats)[0]——座號比較小的同學會排在前面（2026-10-30 第三輪）。
 */
/** 自己的座號（伺服器給學生的 stats 只有自己的；還沒答過題時是空字串）。 */
function mySeat(v: RaidView) {
  return Object.keys(v.state.stats)[0] || '';
}
function myLine(v: RaidView, s: RaidState) {
  const seat = mySeat(v);
  const me = seat ? s.stats[seat] : undefined;
  const ok = me ? me.ok.attack + me.ok.shield + me.ok.ultimate + (me.ok.analysis ?? 0) : 0;
  const goal = v.mine?.goal;
  return `<div class="raid-mini-me">${goal ? `<span>🎯 目標 ${goal} 題：已答對 <b>${ok}</b>${ok >= goal ? ' ✓ 達成！' : ''}</span>` : `<span>已答對 <b>${ok}</b> 題</span>`}${me && me.streak >= 2 ? `<span>🔥 連對 ${me.streak}${me.saved ? '' : '・有保護'}</span>` : ''}</div>`;
}
/**
 * 把 el 的內容改成 html，但只動真的不一樣的節點（同位置、同標籤就沿用，只改屬性和文字）。
 * 作答卡每 0.25 秒更新一次：用 innerHTML 整塊換掉，iPad 上正在觸控捲動的節點會被拿掉（捲動卡住）、
 * 動畫重新開始、附圖重新載入時高度歸零、捲動位置被重設（2026-10-30 第二輪）。
 */
export function patchHtml(el: Element, html: string) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  patchChildren(el, tpl.content);
}
function patchChildren(cur: Node, next: Node) {
  const a = Array.from(cur.childNodes),
    b = Array.from(next.childNodes);
  b.forEach((n, i) => {
    const o = a[i];
    if (!o) cur.appendChild(n);
    else if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName) cur.replaceChild(n, o);
    else if (o.nodeType !== 1) {
      if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue;
    } else {
      const oe = o as Element,
        ne = n as Element;
      for (const { name } of Array.from(oe.attributes)) if (!ne.hasAttribute(name)) oe.removeAttribute(name);
      for (const { name, value } of Array.from(ne.attributes)) if (oe.getAttribute(name) !== value) oe.setAttribute(name, value);
      patchChildren(o, n);
    }
  });
  for (let i = b.length; i < a.length; i++) cur.removeChild(a[i]);
}
/** 作答卡的主體會變的時候才重畫（題目、結果、鎖住、階段），避免每次推送都重排數學式。 */
export function raidCardKey(v: RaidView, now: number) {
  const s = liveState(v, now);
  const lock = v.mine?.lockUntil && v.mine.lockUntil > now ? 'lock' : '';
  const skipReady = !v.mine?.skipAt || now - v.mine.skipAt >= RAID_SKIP_COOLDOWN_MS ? 'skip' : '';
  // 抗性變了（每 10% 一級）也要重畫選招按鈕；只有選招畫面看得到，作答中不算（同學一作答抗性就變，不可以因此重畫題目）
  const choosing = !v.mine?.question && !lock;
  const eff = choosing ? (['attack', 'ultimate'] as const).map((k) => Math.round(raidEffect(s, k, s.t, v.run.config.players) * 10)).join('') : '';
  // 分析題：選招畫面的護盾狀態（開／破防、裂痕數）與鎖定；作答中只看自己的選擇、提示、這題是不是被同學解出（護盾變化不重畫題目）
  const ph = phaseInfo(v, s);
  const aLock = v.mine?.analysisLockUntil && v.mine.analysisLockUntil > now ? 'alock' : '';
  const ana = !ph ? '' : choosing ? `${ph.p ? `${ph.p.cracks}/${ph.need}/${ph.p.by[mySeat(v)] || 0}` : ph.brk ? 'brk' : 'off'}${aLock}` : v.mine?.question?.kind === 'analysis' ? `${raidLocal.pick.q === v.mine.question.id ? `${raidLocal.pick.a ?? ''},${raidLocal.pick.r ?? ''}` : ''}${v.mine.question.hint ? 'h' : ''}${v.mine.question.taken ? 't' : ''}` : '';
  const sending = raidLocal.sending ? `s${pendingChoice(v, v.mine?.question?.id || '') ?? ''}` : '';
  return [v.run.id, raidPhase(v, s, now), v.mine?.role || '', v.mine?.goal || raidLocal.noGoal, v.mine?.question?.id || '', lock, raidLocal.flash, v.results ? 'r' : '', eff, skipReady, ana, sending].join('|');
}
export function raidCardHtml(v: RaidView, now: number): string {
  const s = liveState(v, now),
    phase = raidPhase(v, s, now);
  const mini = `<div class="raid-mini" id="raid-mini">${raidMiniHtml(v, now)}</div>`;
  let body = '';
  if (phase === 'over') {
    const r = v.results?.[0];
    // 結算還沒從伺服器回來（時間到的那一刻）：先顯示結算中
    const mineHtml = !v.results ? '<p class="muted" data-testid="raid-settling">結算中…</p>' : r ? myTitle(r) : '<p class="muted">這一場你沒有作答。</p>';
    body = `<div class="raid-end-card" data-testid="raid-my-result"><h2>${resultTitle(s, v)}</h2>${mineHtml}<p class="muted small-text">稱號依每分鐘的貢獻分數決定，一共 9 級：${RAID_TITLES.join('、')}。</p></div>`;
  } else if (!v.mine?.role) {
    body = `<h3 class="raid-h">選你的英雄</h3><div class="raid-roles">${RAID_ROLES.map((r) => `<button type="button" class="raid-role" data-action="raid-role" data-role="${r}" data-testid="raid-role-${r}">${heroArt(r)}<b>${ROLE_NAME[r]}</b><small>${ROLE_SKILL[r]}</small><em class="raid-passive">被動「${ROLE_PASSIVE[r].name}」：${ROLE_PASSIVE[r].tip}</em></button>`).join('')}</div>`;
  } else if (!v.mine.goal && raidLocal.noGoal !== v.run.id) {
    // 個人目標：和自己比（個人最佳），不和別人比
    const prev = v.mine.prevBest;
    body = `<h3 class="raid-h">這一場的目標</h3><p class="muted small-text">${prev ? `你的個人最佳是一場答對 <b>${prev}</b> 題。` : '設一個自己的目標，和自己比就好。'}</p><div class="raid-goals">${goalChoices(prev)
      .map(([n, label]) => `<button type="button" class="raid-goal" data-action="raid-goal" data-goal="${n}" data-testid="raid-goal-${n}"><b>${n} 題</b><small>${label}</small></button>`)
      .join('')}</div><button type="button" class="link-btn" data-action="raid-goal" data-goal="0" data-testid="raid-goal-skip">先不設定</button>`;
  } else if (phase === 'pre') {
    body = `<div class="raid-wait">${heroArt(v.mine.role, 'big')}<p>你是<b>${ROLE_NAME[v.mine.role]}</b>，<span data-pk-start="${v.run.startedAt}">${Math.max(0, Math.ceil((v.run.startedAt - now) / 1000))}</span> 秒後開戰！</p></div>`;
  } else if (v.mine.lockUntil && v.mine.lockUntil > now) {
    body = `${raidLocal.flash}<div class="raid-lock" data-testid="raid-lock">✗ 答錯了，<b data-lock-until="${v.mine.lockUntil}">${Math.ceil((v.mine.lockUntil - now) / 1000)}</b> 秒後再出招（魔王蓄力加快了）。看懂解析，下一題再拚！</div>`;
  } else if (v.mine.question) {
    const q = v.mine.question;
    // 應用題不會做：可以換一題（不算答錯，每 30 秒一次）
    const wait = v.mine.skipAt ? Math.max(0, Math.ceil((v.mine.skipAt + RAID_SKIP_COOLDOWN_MS - now) / 1000)) : 0;
    const skip =
      q.kind === 'ultimate'
        ? `<div class="raid-skip"><span>不會做也沒關係：</span>${H.btn(wait ? `換一題（${wait} 秒後）` : '換一題', 'raid-skip', 'quiet', 'dice', `data-testid="raid-skip" ${wait || raidLocal.sending ? 'disabled' : ''}`)}<small>不算答錯；也可以先做理解題幫忙存防護罩</small></div>`
        : '';
    body =
      q.kind === 'analysis'
        ? analysisHtml(v, q)
        : `<div class="raid-q-head"><span class="raid-kind k-${q.kind}">${KIND_LEVEL[q.kind]}・${KIND_NAME[q.kind]}</span>${kindSwitch(q.kind, v)}</div><div class="quiz-stem">${H.md(q.stem)}</div>${H.figure(q.figure)}<div class="quiz-options">${q.options
            .map((o, i) => answerOption(v, q.id, o, i))
            .join('')}</div>${skip}`;
  } else {
    body = `${raidLocal.flash}<h3 class="raid-h">選下一招</h3><div class="raid-kinds">${RAID_KINDS.map((k) => {
      const e = raidEffect(s, k, s.t, v.run.config.players);
      const mine = v.mine?.role && ROLE_PASSIVE[v.mine.role].kind === k ? `<i class="raid-eff passive">★ ${ROLE_PASSIVE[v.mine.role].name}</i>` : '';
      return `<button type="button" class="raid-kind-btn k-${k} ${e < 1 ? 'weak' : ''}" data-action="raid-draw" data-kind="${k}" data-testid="raid-kind-${k}"><b>${KIND_NAME[k]}${mine}${e < 1 ? `<i class="raid-eff">效果 ${Math.round(e * 100)}%</i>` : ''}</b><small>${KIND_LEVEL[k]}題・${KIND_TIP[k]}</small></button>`;
    }).join('')}${analysisButton(v, s, now)}</div>`;
  }
  return `<section class="raid-card" data-testid="raid-card"><h2>${H.icon('bolt')}${H.esc(v.title)}</h2>${mini}<div class="raid-body">${body}</div></section>`;
}
const KIND_TIP: Record<RaidKind, string> = { attack: '答對就攻擊（先打掉魔王護甲）', shield: '答對存 1 秒防護罩，魔王攻擊時自動擋下', ultimate: '答對累積大招，越多人一起做威力越大', analysis: '答對打出護盾裂痕，全班合力破盾' };
/** 這一場有沒有分析題（困難魔王、題庫有分析題）。 */
const hasAnalysis = (v: RaidView) => !!v.run.config.phase && (v.pools.analysis || 0) > 0;
function kindSwitch(cur: RaidKind, v: RaidView) {
  const kinds: RaidKind[] = [...RAID_KINDS, ...(hasAnalysis(v) && !(v.mine?.analysisLockUntil && v.mine.analysisLockUntil > H.serverTime()) ? (['analysis'] as const) : [])];
  return `<span class="raid-switch">換成${kinds
    .filter((k) => k !== cur)
    .map((k) => `<button type="button" class="link-btn" data-action="raid-draw" data-kind="${k}">${KIND_NAME[k]}</button>`)
    .join('')}</span>`;
}
/** 選招畫面的第 4 個選項「分析題・破盾」：護盾開啟時特別標示；答錯鎖 20 秒時顯示倒數。 */
function analysisButton(v: RaidView, s: RaidState, now: number) {
  if (!hasAnalysis(v)) return '';
  const ph = phaseInfo(v, s)!;
  const until = v.mine?.analysisLockUntil && v.mine.analysisLockUntil > now ? v.mine.analysisLockUntil : 0;
  const mine = ph.p ? ph.p.by[mySeat(v)] || 0 : 0;
  const capped = !!ph.p && mine >= ph.cfg.cap;
  const tag = ph.p ? `<i class="raid-eff hot">🛡 護盾開啟中・破盾 ${ph.p.cracks}/${ph.need}</i>` : ph.brk ? '<i class="raid-eff hot">💥 破防中 ×2</i>' : '';
  const tip = until
    ? `🔒 答錯了，<span data-analysis-until="${until}">${Math.ceil((until - now) / 1000)}</span> 秒後可再挑戰（先做別的題幫忙）`
    : ph.p
      ? capped
        ? `你已打出 ${mine} 道裂痕：再答對改成直接重擊魔王`
        : `分析題・答對打出裂痕（這一層你還能打 ${ph.cfg.cap - mine} 道）・時間寬裕、不計速度`
      : `分析題・答對直接重擊魔王；血量 ${ph.cfg.at.join('%／')}% 時用來破盾`;
  return `<button type="button" class="raid-kind-btn k-analysis ${ph.p ? 'hot' : ''} ${until ? 'locked' : ''}" data-action="raid-draw" data-kind="analysis" data-testid="raid-kind-analysis" ${until ? 'disabled' : ''}><b>${KIND_NAME.analysis}${tag}</b><small>${tip}</small></button>`;
}
/** 分析題作答：步驟分行；「判斷＋理由」兩段各選一個再送出；3 分鐘提示；被同學解出時換一題。 */
function analysisHtml(v: RaidView, q: NonNullable<NonNullable<RaidView['mine']>['question']>) {
  const pick = raidLocal.pick.q === q.id ? raidLocal.pick : { q: q.id };
  const dis = raidLocal.sending ? 'disabled' : '';
  const head = `<div class="raid-q-head"><span class="raid-kind k-analysis">${KIND_LEVEL.analysis}・${KIND_NAME.analysis}</span>${kindSwitch('analysis', v)}</div>`;
  const taken = q.taken ? `<div class="raid-taken" data-testid="raid-taken">✓ 這題剛被同學解出了！${H.btn('換一題新的', 'raid-draw', 'quiet', 'dice', 'data-kind="analysis" data-testid="raid-taken-next"')}</div>` : '';
  const hint = q.hint ? `<div class="raid-hint" data-testid="raid-hint">💡 提示：${H.md(q.hint)}</div>` : '';
  const opt = (o: string, i: number, part: 'a' | 'r') =>
    `<button type="button" class="answer-option ${pick[part] === i ? 'selected' : ''}" data-action="raid-pick" data-part="${part}" data-choice="${i}" data-testid="raid-${part === 'a' ? 'option' : 'reason'}-${i}" aria-pressed="${pick[part] === i}" ${dis}><span class="option-letter">${part === 'a' ? String.fromCharCode(65 + i) : i + 1}</span><span>${H.md(o)}</span></button>`;
  const choices = q.reason
    ? `<p class="raid-part">① 判斷</p><div class="quiz-options">${q.options.map((o, i) => opt(o, i, 'a')).join('')}</div><p class="raid-part">② 理由</p><div class="quiz-options">${q.reason.map((o, i) => opt(o, i, 'r')).join('')}</div>${H.btn(pick.a === undefined || pick.r === undefined ? '兩段都選好才能送出' : raidLocal.sending && raidLocal.pending?.q === q.id ? '送出中…' : '送出（判斷和理由都對才算對）', 'raid-answer', 'primary', 'check', `data-testid="raid-submit" ${pick.a === undefined || pick.r === undefined || raidLocal.sending ? 'disabled' : ''}`)}`
    : `<div class="quiz-options">${q.options.map((o, i) => answerOption(v, q.id, o, i)).join('')}</div>`;
  return `${head}${taken}<div class="quiz-stem raid-a-stem">${H.md(q.stem)}</div>${H.figure(q.figure)}${hint}${choices}<p class="raid-a-note">時間寬裕、不計速度，想清楚再作答。答錯不扣血，但 20 秒內不能再抽分析題。</p>`;
}
function myTitle(r: RaidResult) {
  const goal = r.goal ? `<p class="raid-goal-line">🎯 目標 ${r.goal} 題：答對 ${r.correct} 題${r.correct >= r.goal ? '，達成！' : `，還差 ${r.goal - r.correct} 題，下次再拚`}</p>` : '';
  const pb = r.prevBest !== undefined ? `<p class="raid-goal-line">${r.correct > r.prevBest ? `🏆 突破個人紀錄！${r.prevBest} → ${r.correct} 題` : `個人最佳 ${r.prevBest} 題（這場 ${r.correct} 題）`}</p>` : '';
  return `<div class="raid-my-title lv${r.level}"><small>你的稱號</small><strong>Lv${r.level} ${H.esc(r.title)}</strong>${r.badges.length ? `<span>${r.badges.map((b) => `<i class="raid-badge">${H.esc(b)}</i>`).join('')}</span>` : ''}${goal}${pb}<p>貢獻 ${r.score} 分｜記憶 ${r.stats.ok.attack}/${r.stats.n.attack}、理解 ${r.stats.ok.shield}/${r.stats.n.shield}、應用 ${r.stats.ok.ultimate}/${r.stats.n.ultimate}${r.stats.n.analysis ? `、分析 ${r.stats.ok.analysis ?? 0}/${r.stats.n.analysis}${r.stats.cracks ? `（裂痕 ${r.stats.cracks} 道）` : ''}` : ''}｜最長連對 ${r.stats.best} 題</p></div>`;
}
/** 作答結果（下一張卡上方顯示）。 */
export interface RaidAnswerResult {
  correct: boolean;
  answer: number;
  explanation?: string;
  kind: RaidKind;
  streak?: number;
  saved?: boolean;
  redeemed?: boolean;
  /** 分析題：理由的正解、打出裂痕／直接傷害／被同學先解出、這一下破盾了、答錯鎖到什麼時候。 */
  reasonAnswer?: number;
  crack?: { n: number; need: number };
  dmg?: number;
  dup?: boolean;
  broke?: boolean;
  analysisLockUntil?: number;
}
export function raidFlashHtml(r: RaidAnswerResult, options: string[], reasons?: string[]) {
  if (r.kind === 'analysis') return analysisFlash(r, options, reasons);
  const right = options[r.answer];
  const extra = [
    r.redeemed ? '♻ 贖回成功！上一題的分數拿回一半' : '',
    r.saved ? `🛡 連對保護：連對 ${r.streak} 沒有中斷（每場一次）` : '',
    r.correct && (r.streak || 0) >= 3 ? `🔥 連對 ${r.streak} 題` : '',
    !r.correct && !r.saved ? `下一題做${KIND_NAME[r.kind]}答對，可以贖回一半分數` : '',
  ].filter(Boolean);
  return `<div class="raid-flash ${r.correct ? 'ok' : 'no'}" data-testid="raid-flash"><b>${r.correct ? `✓ 答對！${{ attack: '發動攻擊', shield: '防護罩 +1 秒', ultimate: '大招計量 +25%' }[r.kind]}` : '✗ 答錯了'}</b>${extra.map((x) => `<span class="raid-flash-extra">${x}</span>`).join('')}${r.correct ? '' : `<span>正解 ${String.fromCharCode(65 + r.answer)}. ${H.md(right)}</span>`}${!r.correct && r.explanation ? `<small>${H.md(r.explanation)}</small>` : ''}</div>`;
}
/** 分析題的結果：答對＝裂痕／重擊／同學先解出；答錯＝兩段的正解、詳解、20 秒鎖定。 */
function analysisFlash(r: RaidAnswerResult, options: string[], reasons?: string[]) {
  const head = r.correct
    ? r.dup
      ? '✓ 答對了！不過同學剛好先解出這一題（每題全班只算一次）'
      : r.crack
        ? `✓ 答對！打出裂痕（破盾 ${r.crack.n}/${r.crack.need}）${r.broke ? '　💥 破盾了！' : ''}`
        : `✓ 答對！分析重擊魔王 −${r.dmg ?? 0}`
    : '✗ 答錯了（不扣血）';
  const right = r.correct
    ? ''
    : `<span>正解 ${String.fromCharCode(65 + r.answer)}. ${H.md(options[r.answer] || '')}</span>${reasons && r.reasonAnswer !== undefined ? `<span>理由 ${r.reasonAnswer + 1}. ${H.md(reasons[r.reasonAnswer] || '')}</span>` : ''}`;
  const lock = !r.correct && r.analysisLockUntil ? `<span class="raid-flash-extra" data-testid="raid-analysis-lock">🔒 分析題 <b data-analysis-until="${r.analysisLockUntil}">${Math.max(0, Math.ceil((r.analysisLockUntil - H.serverTime()) / 1000))}</b> 秒後可再挑戰；先做別的題幫忙！</span>` : '';
  return `<div class="raid-flash ${r.correct ? 'ok' : 'no'} analysis" data-testid="raid-flash"><b>${head}</b>${lock}${right}${r.explanation && !r.correct ? `<small>${H.md(r.explanation)}</small>` : ''}</div>`;
}
/** 分析題送出時已經不能計入（同學先解開了、或是開新護盾前抽到的）：不算錯、不鎖定。 */
export function raidTakenHtml(next: boolean) {
  return `<div class="raid-flash ok analysis" data-testid="raid-flash"><b>✓ 這題剛被同學解開了（不算錯）</b><span>${next ? '已經換一題新的分析題給你。' : '這一輪的分析題都解完了，先做別的題，等下一層護盾。'}</span></div>`;
}
