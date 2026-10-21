// 彈幕：在老師（投影）畫面的投影片上，由右至左飛過。
// 圖層掛在 body 上（不受重畫影響），每次出現時對齊投影片區的位置；pointer-events 關閉，不擋任何操作。
import type { Danmaku } from '../shared/types';

const COLORS = ['#ffffff', '#ffe08a', '#bfe3ff', '#ffc9b5', '#c9f2d8', '#e3d6ff'];
const SPEED = 110; // 每秒移動的像素（老師回饋：再慢一點，學生才讀得完）
const seen = new Set<string>();
let started = false,
  clearedAt = 0;
const laneFree: number[] = [];

function layer(): HTMLElement {
  let el = document.querySelector<HTMLElement>('#danmaku-layer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'danmaku-layer';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  const stage = document.querySelector('#slide-stage')?.getBoundingClientRect();
  if (stage) Object.assign(el.style, { left: `${stage.left}px`, top: `${stage.top}px`, width: `${stage.width}px`, height: `${stage.height}px` });
  return el;
}
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function fly(item: Danmaku) {
  const host = layer();
  const w = host.clientWidth,
    h = host.clientHeight;
  if (!w || !h) return;
  const size = Math.round(Math.max(30, Math.min(52, h / 13)));
  const lineH = Math.round(size * 1.5);
  const lanes = Math.max(1, Math.floor((h * 0.8) / lineH));
  const now = performance.now();
  // 選最早空出來的一條軌道（上一則已經完全進入畫面）
  let lane = -1;
  for (let i = 0; i < lanes && lane < 0; i++) if ((laneFree[i] ?? 0) <= now) lane = i;
  if (lane < 0) lane = [...Array(lanes).keys()].reduce((best, i) => ((laneFree[i] ?? 0) < (laneFree[best] ?? 0) ? i : best), 0);
  const el = document.createElement('div');
  el.className = 'danmaku-item';
  el.textContent = item.anon ? item.text : `${item.seat} 號：${item.text}`;
  el.style.fontSize = `${size}px`;
  el.style.top = `${Math.round(h * 0.06) + lane * lineH}px`;
  el.style.color = COLORS[hash(item.id) % COLORS.length];
  host.appendChild(el);
  const iw = el.offsetWidth;
  const ms = ((w + iw) / SPEED) * 1000;
  laneFree[lane] = now + ((iw + size) / SPEED) * 1000;
  const anim = el.animate([{ transform: `translateX(${w}px)` }, { transform: `translateX(${-iw - 20}px)` }], { duration: ms, easing: 'linear' });
  anim.onfinish = () => el.remove();
}

/** 老師端每次拿到新畫面時呼叫：新的彈幕才飛（第一次載入時，只補最近 5 秒內的）。 */
export function syncDanmaku(list: Danmaku[] | undefined, cleared: number | undefined, serverNow: number) {
  if ((cleared || 0) !== clearedAt) {
    clearedAt = cleared || 0;
    document.querySelectorAll('#danmaku-layer .danmaku-item').forEach((el) => el.remove());
  }
  for (const item of list || []) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    if (!started && serverNow - item.at > 5000) continue;
    if (serverNow - item.at > 20000) continue;
    fly(item);
  }
  started = true;
}
export function clearDanmakuLayer() {
  document.querySelector('#danmaku-layer')?.remove();
}
