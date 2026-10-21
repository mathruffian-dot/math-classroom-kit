// 魔王戰特效預覽：在瀏覽器裡依序播 5 種大招與一般攻擊，給設計時逐張檢查（不連伺服器）。
// 用法：node scripts/raid-fx-preview.mjs（會建置這支檔案、開一個本機頁面並截圖）
import '../src/styles.css';
import { initRaidUi, raidBoardHtml, updateRaidBoard, ultSkill, wireArt } from '../src/raid-ui';
import { raidConfig, raidReplay, type RaidAction } from '../shared/raid';
import type { RaidView } from '../shared/types';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
initRaidUi({ esc, md: esc, btn: (l) => l, icon: () => '', figure: () => '', serverTime: () => Date.now() });

const difficulty = (new URLSearchParams(location.search).get('d') || 'normal') as RaidView['run']['difficulty'];
const config = raidConfig(difficulty, 28, 300);
const start = Date.now() - 60_000;
const actions: RaidAction[] = [];
const view = (): RaidView => ({
  run: { id: 'preview', difficulty, startedAt: start, seconds: 300, config },
  title: '預覽',
  state: raidReplay(config, actions, 300, Date.now() - start),
  roles: { '3': 'knight', '7': 'mage', '12': 'archer', '15': 'mage' },
  pools: { attack: 1, shield: 1, ultimate: 1 },
});
const host = document.createElement('div');
host.style.cssText = 'position:relative;width:1280px;height:720px;border-radius:16px;overflow:hidden';
document.body.style.cssText = 'margin:0;background:#111';
document.body.appendChild(host);
host.innerHTML = raidBoardHtml(view());
wireArt(host);
updateRaidBoard(host, view(), Date.now());
setInterval(() => updateRaidBoard(host, view(), Date.now()), 250);

/** 播第 k 種大招：找一個時間點，讓大招剛好是第 k 種。 */
(window as unknown as { ult: (k: number) => string }).ult = (k: number) => {
  const seats = [3, 7, 12, 15];
  const base = Date.now() - start;
  const want = ['meteor', 'thunder', 'flame', 'frost', 'holy'][k];
  for (let t = base; t < base + 400; t++) {
    // 第 4 題答對的那一刻（t＋3）發動，參與的座號由小到大
    const probe = { t: t + 3, k: 'ult' as const, seats };
    if (ultSkill(probe).id !== want) continue;
    seats.forEach((seat, i) => actions.push({ t: t + i, seat, kind: 'ultimate', ok: true }));
    return ultSkill(probe).name;
  }
  return '';
};
(window as unknown as { hit: () => void }).hit = () => {
  actions.push({ t: Date.now() - start, seat: 7, kind: 'attack', ok: true });
};
