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
  advance,
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
const BOSS_NAME = { easy: '根號史萊姆王', normal: '無理數魔像', hard: '混沌根式龍' } as const;
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
const bossArt = (d: keyof typeof BOSS_ICON) => art(`/raid/boss-${d}.webp`, BOSS_ICON[d], 'boss');

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
export function raidMapHtml(map: NonNullable<import('../shared/types').SessionView['raidMap']>): string {
  const order = ['easy', 'normal', 'hard'] as const;
  const nodes = order
    .map((d, i) => {
      const w = map.wins[d];
      const time = w ? `${Math.floor(w.ms / 60000)} 分 ${Math.round((w.ms % 60000) / 1000)} 秒` : '';
      return `<div class="raid-map-node ${w ? 'won' : ''}" data-testid="raid-map-${d}">${bossArt(d)}<b>${BOSS_NAME[d]}</b><small>${DIFFICULTY_NAME[d]}</small><span>${w ? `✓ 已擊敗・最快 ${time}` : i > 0 && !map.wins[order[i - 1]] ? '先打倒前一隻吧' : '等待挑戰'}</span></div>`;
    })
    .join('<i class="raid-map-path"></i>');
  const done = order.filter((d) => map.wins[d]).length;
  return `<div class="raid-board raid-map" data-testid="raid-map"><div class="raid-map-head"><strong>🗺 冒險地圖・${H.esc(map.section || '')} ${H.esc(map.title)}</strong><small>全班已擊敗 ${done}／3 位魔王｜在右邊選難度和時間，按「開戰」</small></div><div class="raid-map-nodes">${nodes}</div><p class="raid-map-tip">記憶題＝普通攻擊・理解題＝存防護罩・應用題＝大招（越多人一起做越強）</p></div>`;
}

/* ───────── 老師：大螢幕戰場 ───────── */
export function raidBoardHtml(v: RaidView): string {
  const d = v.run.difficulty;
  const roles = Object.values(v.roles || {});
  const heroes = RAID_ROLES.map((r) => `<div class="raid-hero" data-role="${r}">${heroArt(r)}<small>${ROLE_NAME[r]} ×<b id="rb-n-${r}">${roles.filter((x) => x === r).length}</b></small></div>`).join('');
  return `<div class="raid-board" data-testid="raid-board" data-difficulty="${d}">
<div class="raid-top"><strong class="raid-boss-name">${BOSS_NAME[d]}<small>${DIFFICULTY_NAME[d]}</small></strong><div class="raid-bar boss" title="魔王血量"><i class="hp" id="rb-boss-hp"></i><i class="sh" id="rb-boss-sh"></i><span id="rb-boss-text"></span></div><div class="raid-bar charge" title="魔王蓄力（滿了會預告大招）"><i id="rb-charge"></i><span>魔王蓄力</span></div><span class="raid-clock" id="rb-clock"></span></div>
<div class="raid-arena" id="rb-arena"><div class="raid-ambient" aria-hidden="true">${AMBIENT}</div><div class="raid-heroes" id="rb-heroes">${heroes}<div class="raid-shield" id="rb-shield"></div></div><div class="raid-boss" id="rb-boss"><i class="raid-aura"></i>${bossArt(d)}</div><div class="raid-fx" id="rb-fx"></div><div class="raid-warn" id="rb-warn" hidden></div><div class="raid-resist" id="rb-resist" hidden></div></div>
<div class="raid-bottom"><div class="raid-bar team" title="英雄血量（全班共用）"><i id="rb-team"></i><span id="rb-team-text"></span></div><div class="raid-info" id="rb-shield-info"></div><div class="raid-bar ult" title="大招計量"><i id="rb-ult"></i><span id="rb-ult-text"></span></div><ol class="raid-feed" id="rb-feed"></ol></div>
<div class="raid-overlay" id="rb-overlay"></div></div>`;
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
  $('rb-boss-text')!.textContent = `${s.bossHp} / ${c.bossHp}${s.bossShield ? `　魔王護甲 ${s.bossShield}` : ''}`;
  // 血少的時候血條閃爍、畫面邊緣變紅
  const board = root.querySelector<HTMLElement>('.raid-board');
  board?.classList.toggle('boss-low', s.bossHp > 0 && s.bossHp / c.bossHp < 0.25);
  board?.classList.toggle('team-low', s.teamHp > 0 && s.teamHp / c.teamHp < 0.3);
  board?.classList.toggle('warning', s.bossUltAt !== null && !s.result);
  const charge = s.bossUltAt === null ? Math.min(1, (Math.max(0, s.t - s.chargeFrom) + s.chargeBonus) / c.bossChargeMs) : 1;
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
function feedText(e: RaidEvent, v: RaidView) {
  const who = e.seat ? `${e.seat} 號${v.roles?.[String(e.seat)] ? ROLE_NAME[v.roles[String(e.seat)]] : ''}` : '';
  switch (e.k) {
    case 'atk':
      return (e.n ? `⚔ ${who} 攻擊 −${e.n}${e.absorbed ? `（魔王護甲擋下 ${e.absorbed}）` : ''}` : `⚔ ${who} 攻擊，被魔王護甲擋下 ${e.absorbed}`) + (e.eff ? `（魔王抗性 ${Math.round(e.eff * 100)}%）` : '');
    case 'shield':
      return `🛡 ${who} 存了 1 秒防護罩（共 ${(e.n || 0) / 1000} 秒）`;
    case 'ult':
      return `💥 大招・${ultSkill(e).name} −${e.n}！${shortSeats(e.seats || [])}共同發動${(e.combo || 1) > 1 ? `（全班 ${e.team} 人合擊 ×${e.combo}）` : ''}`;
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
  } else if (e.k === 'win') {
    pulse(boss, 'defeated');
  }
}
function resultsHtml(v: RaidView, s: RaidState) {
  const res = v.results || [];
  const tally = s.tally;
  const ms = s.endAt ?? Math.min(s.t, v.run.seconds * 1000);
  const minutes = `${Math.floor(ms / 60000)} 分 ${Math.round((ms % 60000) / 1000)} 秒`;
  const rows = res
    .map(
      (r, i) =>
        `<tr><td>${i + 1}</td><td><b>${r.seat} 號</b></td><td><span class="raid-title lv${r.level}">Lv${r.level} ${H.esc(r.title)}</span>${r.badges.map((b) => `<span class="raid-badge">${H.esc(b)}</span>`).join('')}</td><td>${r.score}</td><td>${r.correct}${r.goal ? `／${r.goal}${r.correct >= r.goal ? ' ✓' : ''}` : ''}</td><td>${r.stats.ok.attack}/${r.stats.n.attack}</td><td>${r.stats.ok.shield}/${r.stats.n.shield}</td><td>${r.stats.ok.ultimate}/${r.stats.n.ultimate}</td></tr>`,
    )
    .join('');
  if (!v.results) return `<div class="raid-result ${s.result || 'ended'}" data-testid="raid-result"><h2>${resultTitle(s, v)}</h2><p class="raid-sum">結算中…</p></div>`;
  return `<div class="raid-result ${s.result || 'ended'}" data-testid="raid-result"><h2>${resultTitle(s, v)}</h2><p class="raid-sum">${minutes}・限時 ${v.run.seconds / 60} 分鐘・攻擊 ${tally.atk || 0} 次・防護罩擋下 ${(tally.bossBlock || 0) + (tally.bossUltBlock || 0)} 次・大招 ${tally.ult || 0} 次・魔王剩 ${s.bossHp} 血</p>${
    rows
      ? `<div class="raid-table-wrap"><table class="raid-table"><thead><tr><th></th><th>座號</th><th>稱號</th><th>貢獻</th><th>答對／目標</th><th>記憶</th><th>理解</th><th>應用</th></tr></thead><tbody>${rows}</tbody></table></div>`
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
    return `${head}<p class="muted small-text">全班合作打魔王。學生每一題自己選：記憶題＝普通攻擊、理解題＝防護罩（答對 1 題存 1 秒，魔王攻擊時自動擋下；沒人存很容易輸）、應用題＝大招計量（無視魔王護甲，越多人一起做合擊加成越高，最多 2 倍；不會做可以換一題、答錯只鎖 3 秒）。全班一直只做記憶題，魔王會適應、普通攻擊效果變差。答錯鎖 5 秒，魔王蓄力加快。魔王有 3 種普通攻擊、4 種大招，大招落下前 30 秒預告。<b>時間到還沒打倒魔王，就算魔王獲勝。</b>魔王的血量依上線人數、難度和時間調整。</p>${setup}<div class="tool-row">${H.btn('開戰', 'raid-start', 'primary', 'bolt', 'data-testid="raid-start"')}</div>`;
  }
  const s = liveState(v, now),
    phase = raidPhase(v, s, now);
  const players = Object.keys(v.roles || {}).length;
  const status = phase === 'pre' ? '倒數中' : phase === 'on' ? '戰鬥中' : resultTitle(s, v);
  return `${head}<p class="quiz-status" data-testid="raid-status">${DIFFICULTY_NAME[v.run.difficulty]}・${v.run.seconds / 60} 分鐘・${status}｜已選角色 ${players} 人（開戰時上線 ${v.run.config.players} 人）</p>${
    phase === 'over'
      ? `${setup}<div class="tool-row">${H.btn('再戰一場', 'raid-start', 'primary', 'bolt', 'data-testid="raid-again"')}${H.btn('關閉', 'raid-close', 'quiet', 'x')}</div>`
      : `<p class="muted small-text">時間到還沒打倒魔王就算魔王獲勝；「提前結束」不分勝負。</p><div class="tool-row">${H.btn('提前結束', 'raid-end', 'secondary', 'x', 'data-testid="raid-end"')}</div>`
  }<p class="muted small-text">題庫：記憶 ${v.pools.attack} 題、理解 ${v.pools.shield} 題、應用 ${v.pools.ultimate} 題。</p>`;
}

/* ───────── 學生：作答卡 ───────── */
export interface RaidLocal {
  flash: string;
  sending: boolean;
  /** 學生按了「先不設定目標」（這一場）。 */
  noGoal: string;
}
export const raidLocal: RaidLocal = { flash: '', sending: false, noGoal: '' };
/** 目標的建議：有個人最佳就追平、突破、挑戰；沒有就 3、5、8 題。 */
function goalChoices(prev?: number): [number, string][] {
  if (prev === undefined || prev < 1) return [[3, '穩穩來'], [5, '拚一下'], [8, '挑戰']];
  return [[prev, '追平紀錄'], [prev + 2, '突破紀錄'], [prev + 4, '大挑戰']];
}
/** 上方的小戰況（每 0.25 秒更新）。 */
export function raidMiniHtml(v: RaidView, now: number) {
  const s = liveState(v, now),
    c = v.run.config;
  const bank = shieldMs(s);
  return `<div class="raid-mini-bars"><div class="raid-bar boss small"><i class="hp" style="width:${pct(s.bossHp, c.bossHp)}"></i><span>魔王 ${s.bossHp}</span></div><div class="raid-bar team small"><i style="width:${pct(s.teamHp, c.teamHp)}"></i><span>英雄 ${s.teamHp}</span></div></div><div class="raid-mini-info">${
    bank > 0 ? `<span class="on">🛡 存量 ${bank / 1000} 秒</span>` : '<span>🛡 存量 0</span>'
  }<span>💥 大招 ${Math.round((s.ult / RAID_ULT_NEED) * 100)}%</span></div>${myLine(v, s)}${resistText(s, c.players) ? `<p class="raid-mini-resist">${resistText(s, c.players)}</p>` : ''}${s.bossUltAt !== null && !s.result ? `<p class="raid-mini-warn">⚠ 魔王大招「${bossMove(s.bossUltMove || undefined)?.name || ''}」${Math.max(0, Math.ceil((s.bossUltAt - s.t) / 1000))} 秒後落下！防護罩存量 ${bank / 1000}／${RAID_ULT_BLOCK_MS / 1000} 秒，做理解題存防護罩！</p>` : ''}`;
}
/** 自己的進度：目標、答對題數、連對。 */
function myLine(v: RaidView, s: RaidState) {
  const me = Object.values(s.stats)[0];
  const ok = me ? me.ok.attack + me.ok.shield + me.ok.ultimate : 0;
  const goal = v.mine?.goal;
  if (!goal && !me) return '';
  return `<div class="raid-mini-me">${goal ? `<span>🎯 目標 ${goal} 題：已答對 <b>${ok}</b>${ok >= goal ? ' ✓ 達成！' : ''}</span>` : `<span>已答對 <b>${ok}</b> 題</span>`}${me && me.streak >= 2 ? `<span>🔥 連對 ${me.streak}${me.saved ? '' : '・有保護'}</span>` : ''}</div>`;
}
/** 作答卡的主體會變的時候才重畫（題目、結果、鎖住、階段），避免每次推送都重排數學式。 */
export function raidCardKey(v: RaidView, now: number) {
  const s = liveState(v, now);
  const lock = v.mine?.lockUntil && v.mine.lockUntil > now ? 'lock' : '';
  const skipReady = !v.mine?.skipAt || now - v.mine.skipAt >= RAID_SKIP_COOLDOWN_MS ? 'skip' : '';
  // 抗性變了（每 10% 一級）也要重畫選招按鈕
  const eff = (['attack', 'ultimate'] as const).map((k) => Math.round(raidEffect(s, k, s.t, v.run.config.players) * 10)).join('');
  return [v.run.id, raidPhase(v, s, now), v.mine?.role || '', v.mine?.goal || raidLocal.noGoal, v.mine?.question?.id || '', lock, raidLocal.flash, v.results ? 'r' : '', eff, skipReady].join('|');
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
    body = `<div class="raid-q-head"><span class="raid-kind k-${q.kind}">${KIND_LEVEL[q.kind]}・${KIND_NAME[q.kind]}</span>${kindSwitch(q.kind)}</div><div class="quiz-stem">${H.md(q.stem)}</div>${H.figure(q.figure)}<div class="quiz-options">${q.options
      .map((o, i) => `<button type="button" class="answer-option" data-action="raid-answer" data-choice="${i}" data-testid="raid-option-${i}" ${raidLocal.sending ? 'disabled' : ''}><span class="option-letter">${String.fromCharCode(65 + i)}</span><span>${H.md(o)}</span></button>`)
      .join('')}</div>${skip}`;
  } else {
    body = `${raidLocal.flash}<h3 class="raid-h">選下一招</h3><div class="raid-kinds">${RAID_KINDS.map((k) => {
      const e = raidEffect(s, k, s.t, v.run.config.players);
      const mine = v.mine?.role && ROLE_PASSIVE[v.mine.role].kind === k ? `<i class="raid-eff passive">★ ${ROLE_PASSIVE[v.mine.role].name}</i>` : '';
      return `<button type="button" class="raid-kind-btn k-${k} ${e < 1 ? 'weak' : ''}" data-action="raid-draw" data-kind="${k}" data-testid="raid-kind-${k}"><b>${KIND_NAME[k]}${mine}${e < 1 ? `<i class="raid-eff">效果 ${Math.round(e * 100)}%</i>` : ''}</b><small>${KIND_LEVEL[k]}題・${KIND_TIP[k]}</small></button>`;
    }).join('')}</div>`;
  }
  return `<section class="raid-card" data-testid="raid-card"><h2>${H.icon('bolt')}${H.esc(v.title)}</h2>${mini}<div class="raid-body">${body}</div></section>`;
}
const KIND_TIP: Record<RaidKind, string> = { attack: '答對就攻擊（先打掉魔王護甲）', shield: '答對存 1 秒防護罩，魔王攻擊時自動擋下', ultimate: '答對累積大招，越多人一起做威力越大' };
function kindSwitch(cur: RaidKind) {
  return `<span class="raid-switch">換成${RAID_KINDS.filter((k) => k !== cur)
    .map((k) => `<button type="button" class="link-btn" data-action="raid-draw" data-kind="${k}">${KIND_NAME[k]}</button>`)
    .join('')}</span>`;
}
function myTitle(r: RaidResult) {
  const goal = r.goal ? `<p class="raid-goal-line">🎯 目標 ${r.goal} 題：答對 ${r.correct} 題${r.correct >= r.goal ? '，達成！' : `，還差 ${r.goal - r.correct} 題，下次再拚`}</p>` : '';
  const pb = r.prevBest !== undefined ? `<p class="raid-goal-line">${r.correct > r.prevBest ? `🏆 突破個人紀錄！${r.prevBest} → ${r.correct} 題` : `個人最佳 ${r.prevBest} 題（這場 ${r.correct} 題）`}</p>` : '';
  return `<div class="raid-my-title lv${r.level}"><small>你的稱號</small><strong>Lv${r.level} ${H.esc(r.title)}</strong>${r.badges.length ? `<span>${r.badges.map((b) => `<i class="raid-badge">${H.esc(b)}</i>`).join('')}</span>` : ''}${goal}${pb}<p>貢獻 ${r.score} 分｜記憶 ${r.stats.ok.attack}/${r.stats.n.attack}、理解 ${r.stats.ok.shield}/${r.stats.n.shield}、應用 ${r.stats.ok.ultimate}/${r.stats.n.ultimate}｜最長連對 ${r.stats.best} 題</p></div>`;
}
/** 作答結果（下一張卡上方顯示）。 */
export function raidFlashHtml(r: { correct: boolean; answer: number; explanation?: string; kind: RaidKind; streak?: number; saved?: boolean; redeemed?: boolean }, options: string[]) {
  const right = options[r.answer];
  const extra = [
    r.redeemed ? '♻ 贖回成功！上一題的分數拿回一半' : '',
    r.saved ? `🛡 連對保護：連對 ${r.streak} 沒有中斷（每場一次）` : '',
    r.correct && (r.streak || 0) >= 3 ? `🔥 連對 ${r.streak} 題` : '',
    !r.correct && !r.saved ? `下一題做${KIND_NAME[r.kind]}答對，可以贖回一半分數` : '',
  ].filter(Boolean);
  return `<div class="raid-flash ${r.correct ? 'ok' : 'no'}" data-testid="raid-flash"><b>${r.correct ? `✓ 答對！${{ attack: '發動攻擊', shield: '防護罩 +1 秒', ultimate: '大招計量 +25%' }[r.kind]}` : '✗ 答錯了'}</b>${extra.map((x) => `<span class="raid-flash-extra">${x}</span>`).join('')}${r.correct ? '' : `<span>正解 ${String.fromCharCode(65 + r.answer)}. ${H.md(right)}</span>`}${!r.correct && r.explanation ? `<small>${H.md(r.explanation)}</small>` : ''}</div>`;
}
