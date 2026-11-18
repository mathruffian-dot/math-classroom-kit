/**
 * 十字交乘・大板操作（教師大螢幕／iPad）：#/games/cross?focus=a1&seed=123
 * 老師選的是單元重點（shared/game-focus.ts 的 CROSS_FOCUS）：x² 係數為 1／不為 1／先提公因式／混合。
 * 舊網址 ?level=1/2/3 照樣能開（對應到 a1／a-not-1／gcf；兩個都有時 focus 優先）。
 * 測試用：?test=1&freeze=毫秒 改答錯凍結的時間（只有網址帶 test=1 才有效，正式畫面一律 3 秒；見 crossTestFreeze）。
 *
 * 作答區（十字圖、卡片匣、拖曳與點選、公因數選項）在 src/cross-pad.ts，雙人大屏對戰（src/cross-duel.ts）共用；
 * 這裡只管題目順序（題池）、重點切換、分數與老師按鈕。
 * 出題與判定在 shared/cross.ts（第二階段全班連線版在伺服器端共用）。
 */
import './cross.css';
import { escape as esc } from './api';
import { icon } from './icons';
import { tex } from './math';
import { CROSS_POOL_SIZE, crossMixLevel, crossPool, crossSeed, type CrossItem, type CrossLevel } from '../shared/cross';
import { crossTestFreeze } from '../shared/cross-duel';
import { CROSS_FOCUS, crossFocusFromParams, crossFocusLevel, crossLevelLabel, crossNextFocus, type CrossFocusId, type GameFocus } from '../shared/game-focus';
import { createCrossPad, focusLabelHtml } from './cross-pad';

export { focusLabelHtml };

/** 勾「自動進到下一個重點」時，連續答對幾題換到下一個重點 */
export const CROSS_AUTO_STREAK = 3;

interface BoardState {
  /** 老師選的重點；混合時每題的等級由 crossMixLevel 決定 */
  focus: CrossFocusId;
  /** 目前這一題的等級（產生器用） */
  level: CrossLevel;
  /** 混合：已經出到第幾題（決定下一題的等級） */
  mix: number;
  base: number;
  item: CrossItem | null;
  /** 這一題已經計分（或公布過答案），清空後重做不再加分 */
  counted: boolean;
  score: number;
  streak: number;
  auto: boolean;
  /** 各等級目前這一輪的題池與還沒出過的題（依題池順序） */
  pools: Partial<Record<CrossLevel, { round: number; unused: CrossItem[] }>>;
}

/** 重點選項的內容：名稱＋一行例子（KaTeX）＋補充說明。遊戲卡片、板子切換列、對戰的開始設定共用。 */
export function focusOptionHtml(f: GameFocus): string {
  const example = f.example ? tex(f.example) : esc(f.exampleText || '');
  return `<span class="fx-label">${focusLabelHtml(f.label)}</span><span class="fx-example">${example}${f.note ? `<small class="fx-note">${esc(f.note)}</small>` : ''}</span>`;
}

/** 遊戲活動頁的卡片（在 main.ts 的 shell 裡顯示）：老師先挑這一節課的重點 */
export function crossGameCardHtml(): string {
  return `<article class="course-card cx-game-card" data-testid="game-cross"><div class="course-thumb cx-thumb"><span>八年級 3-2</span><strong>十字<small>交乘</small></strong><em>大板操作・拖曳數字卡</em></div><div class="course-details"><h3>十字交乘（大板操作）</h3><p>在大螢幕或 iPad 上把數字卡拖進十字圖，交叉相乘的和即時顯示；答對變綠色並寫出因式分解。先選這節課要練的重點：</p><div class="course-meta">${icon('screen')}老師畫面操作，學生不用登入</div><div class="fx-picker" role="group" aria-label="選擇重點">${CROSS_FOCUS.map((f, i) => `<a class="fx-option ${i === 0 ? 'primary' : ''}" href="#/games/cross?focus=${f.id}" data-testid="open-cross-${f.id}" aria-label="${esc(f.label)}">${focusOptionHtml(f)}</a>`).join('')}</div></div></article>`;
}

/** 單人大板 ↔ 雙人對戰的切換（兩個頁面的上方列共用） */
export function crossModeSwitchHtml(mode: 'board' | 'duel', focus: CrossFocusId): string {
  const a = (m: 'board' | 'duel', href: string, label: string) => `<a class="cx-mode-btn ${m === mode ? 'selected' : ''}" href="${href}" data-testid="cx-mode-${m}" ${m === mode ? 'aria-current="page"' : ''}>${label}</a>`;
  return `<nav class="cx-mode" aria-label="模式">${a('board', `#/games/cross?focus=${focus}`, '單人大板')}${a('duel', `#/games/cross-duel?focus=${focus}`, '雙人對戰')}</nav>`;
}

export function renderCrossBoard(app: HTMLElement, route: string): void {
  const params = new URLSearchParams(route.split('?')[1] || '');
  // ?focus= 優先；舊網址 ?level=1/2/3 對應到 a1／a-not-1／gcf
  const focus = crossFocusFromParams(params);
  const seedParam = Number(params.get('seed'));
  const base = Number.isFinite(seedParam) && params.has('seed') ? seedParam >>> 0 : (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0;
  // ?pool=N：把每一輪的題池縮小成 N 題（示範「題目出完重新開始」與測試用）
  const poolParam = Math.floor(Number(params.get('pool')));
  const poolSize = (l: CrossLevel) => (poolParam >= 1 ? Math.min(poolParam, CROSS_POOL_SIZE[l]) : CROSS_POOL_SIZE[l]);
  // 測試用的答錯凍結時間（只有 ?test=1 才讀；網址改寫時一起保留）
  const testFreeze = crossTestFreeze(params);
  const st: BoardState = { focus, level: crossFocusLevel(focus) || 1, mix: 0, base, item: null, counted: false, score: 0, streak: 0, auto: false, pools: {} };

  app.className = 'cross-app';
  app.innerHTML = `<div class="cx-root" id="cx-root" data-testid="cross-board"><header class="cx-top"><a class="icon-btn" href="#/games" aria-label="返回遊戲活動" title="返回遊戲活動">${icon('back')}</a><h1>十字交乘<small>大板操作</small></h1><span id="cx-mode-host">${crossModeSwitchHtml('board', focus)}</span><div class="cx-levels" role="group" aria-label="重點">${CROSS_FOCUS.map((f) => `<button type="button" class="fx-option" data-cx="focus" data-focus="${f.id}" data-testid="cx-focus-${f.id}" aria-label="${esc(f.label)}" title="${esc(f.label)}${f.note ? `（${esc(f.note)}）` : ''}">${focusOptionHtml(f)}</button>`).join('')}</div><label class="cx-auto" id="cx-auto-wrap"><input type="checkbox" data-cx="auto" data-testid="cx-auto"><span>答對 ${CROSS_AUTO_STREAK} 題自動進到下一個重點</span></label><span class="cx-score" id="cx-score" data-testid="cx-score" aria-live="polite"></span><button type="button" class="icon-btn" data-cx="fullscreen" aria-label="全螢幕" title="全螢幕">${icon('expand')}</button></header><main class="cx-main" id="cx-main"></main><footer class="cx-actions"><button type="button" class="btn secondary" data-cx="clear" data-testid="cx-clear" aria-label="清空，卡片放回">${icon('undo')}<span>清空</span></button><button type="button" class="btn secondary" data-cx="hint" data-testid="cx-hint" aria-label="提示（再按一次給更多提示）">${icon('spark')}<span>提示</span></button><button type="button" class="btn secondary" data-cx="reveal" id="cx-reveal" data-testid="cx-reveal" aria-label="公布答案">${icon('eye')}<span>公布答案</span></button><button type="button" class="btn primary" data-cx="next" data-testid="cx-next" aria-label="下一題">${icon('next')}<span>下一題</span></button></footer></div>`;
  const root = app.querySelector<HTMLElement>('#cx-root')!;
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const paintScore = () => ($('#cx-score').textContent = `答對 ${st.score} 題${st.streak ? `・連對 ${st.streak}` : ''}`);
  const pad = createCrossPad({
    host: $('#cx-main'),
    prefix: 'cx',
    cardPrefix: 'q',
    ...(testFreeze !== null ? { freezeMs: testFreeze } : {}),
    onSolved: () => {
      if (!st.counted) {
        st.counted = true;
        st.score++;
        st.streak++;
      }
      paintScore();
    },
    onUpdate: () => {
      $('#cx-reveal').toggleAttribute('disabled', pad.state.done !== 'none');
      root.classList.toggle('cx-done', pad.state.done !== 'none');
    },
  });

  /**
   * 從這個等級的題池依序抽一題（混合時三個等級各有自己的題池）；一輪用完才重新洗一輪（第 2 輪起換場次種子，順序不同）。
   * restarted＝這一題是新一輪的第一題（前一輪已經出完）。
   */
  function draw(level: CrossLevel): { item: CrossItem; restarted: boolean } {
    let pool = st.pools[level];
    const restarted = !!pool && !pool.unused.length;
    if (!pool || !pool.unused.length) {
      const round = pool ? pool.round + 1 : 0;
      const seed = round === 0 ? st.base : crossSeed(st.base, level, 1_000_000 + round);
      const unused = crossPool(seed, level, poolSize(level));
      // 新一輪的第一題不要剛好是上一題
      if (unused.length > 1 && unused[0].key === st.item?.key) unused.push(unused.shift()!);
      pool = st.pools[level] = { round, unused };
    }
    return { item: pool.unused.shift()!, restarted };
  }

  /* ── 換題 ── */
  function newItem(focus: CrossFocusId) {
    st.focus = focus;
    // 混合：這一題出哪一級由場次種子決定（同一個 seed 一定同一串，每 3 題三種都會出現）
    const level = crossFocusLevel(focus) ?? crossMixLevel(st.base, st.mix++);
    st.level = level;
    const { item, restarted } = draw(level);
    st.item = item;
    st.counted = false;
    root.querySelectorAll<HTMLButtonElement>('[data-cx="focus"]').forEach((b) => {
      const on = b.dataset.focus === focus;
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', String(on));
    });
    // 沒有下一個重點（先提公因式）時開關停用；混合不適用，整個收起來
    $<HTMLInputElement>('[data-cx="auto"]').disabled = !crossNextFocus(focus);
    $('#cx-auto-wrap').hidden = focus === 'mix';
    $('#cx-mode-host').innerHTML = crossModeSwitchHtml('board', focus);
    root.dataset.focus = focus;
    root.dataset.level = String(level);
    root.dataset.key = item.key;
    root.dataset.round = String(st.pools[level]!.round);
    pad.load(item);
    paintScore();
    if (restarted) pad.notice(`<span data-testid="cx-pool-notice">「${esc(crossLevelLabel(level))}」的 ${poolSize(level)} 題都出過了，重新洗牌開始新的一輪。</span>`, 'warn');
  }

  /* ── 老師按鈕（拖曳中按下一律讓拖曳作廢：pad 的每個動作都先 cancelDrag） ── */
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const act = t.closest<HTMLElement>('[data-cx]')?.dataset.cx;
    if (act === 'focus') {
      st.streak = 0;
      st.mix = 0;
      newItem(t.closest<HTMLElement>('[data-focus]')!.dataset.focus as CrossFocusId);
      syncUrl();
    } else if (act === 'next') next();
    else if (act === 'clear') pad.clear();
    else if (act === 'hint') pad.hint();
    else if (act === 'reveal') reveal();
    else if (act === 'fullscreen') {
      const req = document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen?.();
      req?.catch(() => {});
    }
  });
  root.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.cx === 'auto') st.auto = el.checked;
  });

  function syncUrl() {
    // 有效的 ?pool=N 要留著，重新整理或分享網址才會是同一個題池設定
    const t = testFreeze !== null ? `&test=1&freeze=${testFreeze}` : '';
    history.replaceState(null, '', `#/games/cross?focus=${st.focus}&seed=${st.base}${poolParam >= 1 ? `&pool=${poolParam}` : ''}${t}`);
  }
  function next() {
    let focus = st.focus;
    if (pad.state.done !== 'ok') st.streak = 0;
    // 預設停在老師選的重點；勾了「自動進到下一個重點」才在連對 3 題後前進（a1 → a-not-1 → gcf；混合不前進）
    const after = crossNextFocus(focus);
    if (st.auto && st.streak >= CROSS_AUTO_STREAK && after) {
      focus = after;
      st.streak = 0;
    }
    newItem(focus);
    syncUrl();
  }
  function reveal() {
    if (pad.state.done !== 'none') return;
    st.counted = true;
    st.streak = 0;
    pad.reveal();
    paintScore();
  }

  newItem(focus);
}
