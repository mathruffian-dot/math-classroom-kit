/**
 * 十字交乘・大板操作（教師大螢幕／iPad）：#/games/cross?focus=a1&seed=123
 * 老師選的是單元重點（shared/game-focus.ts 的 CROSS_FOCUS）：x² 係數為 1／不為 1／先提公因式／混合。
 * 舊網址 ?level=1/2/3 照樣能開（對應到 a1／a-not-1／gcf；兩個都有時 focus 優先）。
 *
 * 老師在大螢幕上把數字卡拖進十字圖四格（Pointer Events：觸控、滑鼠、觸控筆），
 * 或先點卡片再點格子。每放一張只更新受影響的部分（卡片搬家、讀數、回饋），不重畫整個板子，
 * 拖曳中 touch-action: none，不會捲動或跳動。
 * 出題與判定在 shared/cross.ts（第二階段全班連線版在伺服器端共用）。
 */
import './cross.css';
import { escape as esc } from './api';
import { icon } from './icons';
import { tex } from './math';
import {
  CROSS_SLOTS,
  CROSS_POOL_SIZE,
  crossAnswer,
  crossJudge,
  crossMixLevel,
  crossPool,
  crossSeed,
  factoredTex,
  factorTex,
  leadText,
  numText,
  polyTex,
  signed,
  type CrossCard,
  type CrossFill,
  type CrossItem,
  type CrossLevel,
  type CrossSlot,
} from '../shared/cross';
import { CROSS_FOCUS, crossFocusFromParams, crossFocusLevel, crossLevelLabel, crossNextFocus, type CrossFocusId, type GameFocus } from '../shared/game-focus';

/** 勾「自動進到下一個重點」時，連續答對幾題換到下一個重點 */
export const CROSS_AUTO_STREAK = 3;
const DRAG_START_PX = 8;

interface BoardState {
  /** 老師選的重點；混合時每題的等級由 crossMixLevel 決定 */
  focus: CrossFocusId;
  /** 目前這一題的等級（產生器用） */
  level: CrossLevel;
  /** 混合：已經出到第幾題（決定下一題的等級） */
  mix: number;
  base: number;
  /** 第幾題（整場累計）；卡片 id 加上這個序號，舊題的指標永遠碰不到新題的卡 */
  serial: number;
  item: CrossItem;
  placed: Record<CrossSlot, string | null>;
  selected: string | null;
  hint: number;
  extracted: boolean;
  done: 'none' | 'ok' | 'revealed';
  /** 這一題已經計分（或公布過答案），清空後重做不再加分 */
  counted: boolean;
  score: number;
  streak: number;
  auto: boolean;
  /** 各等級目前這一輪的題池與還沒出過的題（依題池順序） */
  pools: Partial<Record<CrossLevel, { round: number; unused: CrossItem[] }>>;
}
interface Drag {
  id: string;
  el: HTMLElement;
  pointerId: number;
  x0: number;
  y0: number;
  moved: boolean;
  ghost: HTMLElement | null;
  over: HTMLElement | null;
}

const cardText = (c: CrossCard) => (c.kind === 'lead' ? leadText(c.value) : signed(c.value));
const slotKind = (slot: CrossSlot) => (slot.startsWith('lead') ? 'lead' : 'const');

/** 重點名稱（x² 換成 KaTeX 排版） */
export function focusLabelHtml(label: string): string {
  return label
    .split('x²')
    .map((part) => esc(part))
    .join(tex('x^2'));
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

export function renderCrossBoard(app: HTMLElement, route: string): void {
  const params = new URLSearchParams(route.split('?')[1] || '');
  // ?focus= 優先；舊網址 ?level=1/2/3 對應到 a1／a-not-1／gcf
  const focus = crossFocusFromParams(params);
  const seedParam = Number(params.get('seed'));
  const base = Number.isFinite(seedParam) && params.has('seed') ? seedParam >>> 0 : (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0;
  // ?pool=N：把每一輪的題池縮小成 N 題（示範「題目出完重新開始」與測試用）
  const poolParam = Math.floor(Number(params.get('pool')));
  const poolSize = (l: CrossLevel) => (poolParam >= 1 ? Math.min(poolParam, CROSS_POOL_SIZE[l]) : CROSS_POOL_SIZE[l]);
  const st: BoardState = { focus, level: crossFocusLevel(focus) || 1, mix: 0, base, serial: 0, item: null as unknown as CrossItem, placed: emptyPlaced(), selected: null, hint: 0, extracted: false, done: 'none', counted: false, score: 0, streak: 0, auto: false, pools: {} };

  app.className = 'cross-app';
  app.innerHTML = `<div class="cx-root" id="cx-root" data-testid="cross-board"><header class="cx-top"><a class="icon-btn" href="#/games" aria-label="返回遊戲活動" title="返回遊戲活動">${icon('back')}</a><h1>十字交乘<small>大板操作</small></h1><div class="cx-levels" role="group" aria-label="重點">${CROSS_FOCUS.map((f) => `<button type="button" class="fx-option" data-cx="focus" data-focus="${f.id}" data-testid="cx-focus-${f.id}" aria-label="${esc(f.label)}" title="${esc(f.label)}${f.note ? `（${esc(f.note)}）` : ''}">${focusOptionHtml(f)}</button>`).join('')}</div><label class="cx-auto" id="cx-auto-wrap"><input type="checkbox" data-cx="auto" data-testid="cx-auto"><span>答對 ${CROSS_AUTO_STREAK} 題自動進到下一個重點</span></label><span class="cx-score" id="cx-score" data-testid="cx-score" aria-live="polite"></span><button type="button" class="icon-btn" data-cx="fullscreen" aria-label="全螢幕" title="全螢幕">${icon('expand')}</button></header><main class="cx-main" id="cx-main"><section class="cx-question" id="cx-question" aria-label="題目"></section><section class="cx-work"><div class="cx-cross" id="cx-cross" data-testid="cx-diagram" aria-label="十字圖"><div class="cx-colhead">x 係數</div><div></div><div class="cx-colhead">常數</div>${slotHtml('lead0')}<svg class="cx-x" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line class="cx-d1" x1="6" y1="10" x2="94" y2="90"/><line class="cx-d2" x1="6" y1="90" x2="94" y2="10"/></svg>${slotHtml('const0')}${slotHtml('lead1')}${slotHtml('const1')}<div class="cx-colprod" id="cx-leadprod" data-testid="cx-leadprod"></div><div></div><div class="cx-colprod" id="cx-constprod" data-testid="cx-constprod"></div><div class="cx-lock" id="cx-lock">先提出公因數</div></div><div class="cx-readout" aria-label="交叉相乘"><div class="cx-row-f"><span>因式</span><b id="cx-f0" data-testid="cx-f0"></b><b id="cx-f1" data-testid="cx-f1"></b></div><div class="cx-prod d1"><span>左上 × 右下</span><b id="cx-ps" data-testid="cx-ps">?</b></div><div class="cx-prod d2"><span>左下 × 右上</span><b id="cx-rq" data-testid="cx-rq">?</b></div><div class="cx-sum"><span>交叉相乘和</span><b id="cx-sum" data-testid="cx-sum">?</b><em id="cx-target" data-testid="cx-target"></em></div></div></section><section class="cx-tray" id="cx-tray" data-testid="cx-tray" aria-label="數字卡（格子裡的卡按 Delete 放回這裡）"></section><p class="cx-feedback" id="cx-feedback" data-testid="cx-feedback" role="status" aria-live="polite"></p></main><footer class="cx-actions"><button type="button" class="btn secondary" data-cx="clear" data-testid="cx-clear" aria-label="清空，卡片放回">${icon('undo')}<span>清空</span></button><button type="button" class="btn secondary" data-cx="hint" data-testid="cx-hint" aria-label="提示（再按一次給更多提示）">${icon('spark')}<span>提示</span></button><button type="button" class="btn secondary" data-cx="reveal" id="cx-reveal" data-testid="cx-reveal" aria-label="公布答案">${icon('eye')}<span>公布答案</span></button><button type="button" class="btn primary" data-cx="next" data-testid="cx-next" aria-label="下一題">${icon('next')}<span>下一題</span></button></footer></div>`;
  const root = app.querySelector<HTMLElement>('#cx-root')!;
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const slotEl = (slot: CrossSlot) => $(`[data-slot="${slot}"]`);
  const cardEl = (id: string) => root.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`);
  const cardOf = (id: string) => st.item.cards.find((c) => c.id === id);
  const whereIs = (id: string): CrossSlot | null => CROSS_SLOTS.find((s) => st.placed[s] === id) || null;
  const locked = () => st.done !== 'none' || (st.item.k !== 1 && !st.extracted);

  function emptyPlaced(): Record<CrossSlot, string | null> {
    return { lead0: null, lead1: null, const0: null, const1: null };
  }
  function slotHtml(slot: CrossSlot) {
    const lead = slotKind(slot) === 'lead';
    const pos = slot.endsWith('0') ? '上' : '下';
    return `<div class="cx-slot ${lead ? 'lead' : 'const'}" data-slot="${slot}" data-testid="cx-slot-${slot}" role="button" tabindex="0" aria-label="${lead ? 'x 係數' : '常數'}・${pos}格"><span class="cx-slot-empty">${lead ? '?x' : '?'}</span></div>`;
  }

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

  /* ── 換題：只有這裡會重畫題目、卡片匣與四格內容 ── */
  function newItem(focus: CrossFocusId) {
    cancelDrag();
    st.focus = focus;
    // 混合：這一題出哪一級由場次種子決定（同一個 seed 一定同一串，每 3 題三種都會出現）
    const level = crossFocusLevel(focus) ?? crossMixLevel(st.base, st.mix++);
    st.level = level;
    const { item: raw, restarted } = draw(level);
    const serial = ++st.serial;
    const item: CrossItem = { ...raw, cards: raw.cards.map((c) => ({ ...c, id: `q${serial}-${c.id}` })) };
    st.item = item;
    st.placed = emptyPlaced();
    st.selected = null;
    st.hint = 0;
    st.extracted = false;
    st.done = 'none';
    st.counted = false;
    root.querySelectorAll<HTMLButtonElement>('[data-cx="focus"]').forEach((b) => {
      const on = b.dataset.focus === focus;
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', String(on));
    });
    // 沒有下一個重點（先提公因式）時開關停用；混合不適用，整個收起來
    $<HTMLInputElement>('[data-cx="auto"]').disabled = !crossNextFocus(focus);
    $('#cx-auto-wrap').hidden = focus === 'mix';
    root.dataset.focus = focus;
    root.dataset.level = String(level);
    root.dataset.key = item.key;
    root.dataset.round = String(st.pools[level]!.round);
    renderQuestion();
    for (const slot of CROSS_SLOTS) {
      const el = slotEl(slot);
      el.querySelector('.cx-card')?.remove();
      const fixed = item.leadLocked && slotKind(slot) === 'lead';
      el.classList.toggle('fixed', fixed);
      el.classList.remove('filled', 'over', 'hint');
      el.querySelector<HTMLElement>('.cx-slot-empty')!.textContent = fixed ? 'x' : slotKind(slot) === 'lead' ? '?x' : '?';
      el.setAttribute('aria-disabled', String(fixed));
    }
    $('#cx-tray').innerHTML = item.cards
      .map((c) => `<div class="cx-cell" data-home="${c.id}"><button type="button" class="cx-card ${c.kind}" data-card="${c.id}" data-kind="${c.kind}" data-value="${c.value}" data-testid="cx-card-${c.id}" aria-label="${c.kind === 'lead' ? 'x 係數卡' : '常數卡'} ${esc(cardText(c))}">${esc(cardText(c))}</button></div>`)
      .join('');
    update();
    if (restarted) {
      const fb = $('#cx-feedback');
      fb.className = 'cx-feedback warn';
      fb.innerHTML = `<span data-testid="cx-pool-notice">「${esc(crossLevelLabel(level))}」的 ${poolSize(level)} 題都出過了，重新洗牌開始新的一輪。</span>`;
    }
  }
  function renderQuestion() {
    const it = st.item;
    const need = it.k !== 1;
    $('#cx-question').innerHTML = `<span class="cx-item-focus" data-testid="cx-item-focus" data-level="${it.level}">${focusLabelHtml(crossLevelLabel(it.level))}</span><div class="cx-poly" data-testid="cx-poly"><span class="cx-label">因式分解</span>${tex(polyTex(it.poly), true)}</div>${need ? `<div class="cx-extract ${st.extracted ? 'done' : ''}" data-testid="cx-extract-step"><span class="cx-step">第 1 步　提出公因數${it.k < 0 ? '（首項是負的，連負號一起提）' : ''}</span>${st.extracted ? `<div class="cx-extract-eq" data-testid="cx-extracted">${tex(`${polyTex(it.poly)}=${it.k === -1 ? '-' : it.k}(${polyTex(it.inner)})`)}</div><span class="cx-step">第 2 步　把括號裡的 ${tex(polyTex(it.inner))} 做十字交乘</span>` : `<button type="button" class="btn primary" data-cx="extract" data-testid="cx-extract" aria-label="提出公因數">${icon('arrow')}<span>提出公因數</span></button>`}</div>` : ''}`;
  }

  /* ── 只更新讀數、回饋與狀態 class ── */
  function fill(): CrossFill {
    const f: CrossFill = {};
    for (const s of CROSS_SLOTS) f[s] = st.placed[s] ? (cardOf(st.placed[s]!)?.value ?? null) : null;
    return f;
  }
  function update() {
    const it = st.item;
    const f = fill();
    const j = crossJudge(it, f);
    const show = (n: number | null) => (n === null ? '?' : numText(n));
    $('#cx-ps').textContent = show(j.products[0]);
    $('#cx-rq').textContent = show(j.products[1]);
    $('#cx-sum').textContent = j.sum === null ? '?' : signed(j.sum);
    $('#cx-target').textContent = `目標 ${signed(j.target)}`;
    $('#cx-target').title = `${it.k !== 1 ? '括號裡的' : ''}一次項係數`;
    const sumBox = $('#cx-sum').parentElement!;
    sumBox.classList.toggle('good', j.sum !== null && j.sum === j.target);
    sumBox.classList.toggle('bad', j.sum !== null && j.sum !== j.target);
    const colProd = (el: HTMLElement, n: number | null, want: number, okFlag: boolean | null, lead: boolean) => {
      el.textContent = n === null ? `相乘 = ${lead ? numText(want) + 'x²' : numText(want)}？` : `相乘 ${lead ? (n === 1 ? 'x²' : numText(n) + 'x²') : numText(n)} ${okFlag ? '✓' : '✗'}`;
      el.classList.toggle('good', okFlag === true);
      el.classList.toggle('bad', okFlag === false);
    };
    colProd($('#cx-leadprod'), it.leadLocked ? 1 : j.leadProduct, it.inner.a, it.leadLocked ? true : j.leadOk, true);
    colProd($('#cx-constprod'), j.constProduct, it.inner.c, j.constOk, false);
    const lead = (s: CrossSlot) => (it.leadLocked ? 1 : f[s] ?? null);
    const factor = (p: number | null, q: number | null) => `(${p === null ? '?x' : leadText(p)}${q === null ? '?' : signed(q)})`;
    $('#cx-f0').textContent = factor(lead('lead0'), f.const0 ?? null);
    $('#cx-f1').textContent = factor(lead('lead1'), f.const1 ?? null);

    const cross = $('#cx-cross');
    if (j.ok && st.done === 'none') {
      st.done = 'ok';
      if (!st.counted) {
        st.counted = true;
        st.score++;
        st.streak++;
      }
    }
    cross.classList.toggle('ok', st.done === 'ok');
    cross.classList.toggle('revealed', st.done === 'revealed');
    cross.classList.toggle('bad', j.complete && !j.ok);
    cross.classList.toggle('locked', it.k !== 1 && !st.extracted);
    root.classList.toggle('cx-done', st.done !== 'none');
    const fb = $('#cx-feedback');
    fb.className = 'cx-feedback';
    const answerTex = () => {
      const p = lead('lead0')!,
        r = lead('lead1')!;
      return tex(`${polyTex(it.poly)}=${factoredTex(it.k, p, f.const0!, r, f.const1!)}`);
    };
    if (st.done === 'ok') {
      fb.classList.add('good');
      fb.innerHTML = `<strong>✓ 正確！</strong><span class="cx-answer" data-testid="cx-answer">${answerTex()}</span>`;
    } else if (st.done === 'revealed') {
      fb.classList.add('reveal');
      fb.innerHTML = `<strong>公布答案</strong><span class="cx-answer" data-testid="cx-answer">${answerTex()}</span>`;
    } else if (it.k !== 1 && !st.extracted) {
      fb.textContent = '三項的係數有公因數：先按「提出公因數」，再做十字交乘。';
    } else if (!j.complete) {
      fb.textContent = it.leadLocked ? '把常數卡拖進右邊兩格（也可以先點卡片、再點格子）。' : '把 x 係數卡拖進左欄、常數卡拖進右欄（也可以先點卡片、再點格子）。';
    } else {
      fb.classList.add('bad');
      fb.textContent =
        j.reason === 'lead'
          ? `✗ 左欄相乘 = ${numText(j.leadProduct!)}，要等於 x² 的係數 ${numText(it.inner.a)}`
          : j.reason === 'const'
            ? `✗ 右欄相乘 = ${numText(j.constProduct!)}，要等於常數項 ${numText(it.inner.c)}`
            : j.reason === 'sign'
              ? '✗ 左欄的 x 係數請用正數，正負號放在常數'
              : j.reason === 'invalid' || j.reason === 'card' || j.sum === null
                ? '✗ 這個填法不成立，請清空再試'
                : `✗ 交叉相乘和 = ${signed(j.sum!)}，目標 ${signed(j.target)}，差 ${Math.abs(j.diff!)}`;
    }
    root.querySelectorAll<HTMLButtonElement>('.cx-card').forEach((b) => (b.disabled = locked()));
    $('#cx-reveal').toggleAttribute('disabled', st.done !== 'none');
    $('#cx-score').textContent = `答對 ${st.score} 題${st.streak ? `・連對 ${st.streak}` : ''}`;
    for (const s of CROSS_SLOTS) slotEl(s).classList.toggle('filled', !!st.placed[s]);
    labelCards();
    paintSelection();
  }
  /** 讀屏：卡片名稱帶上「在哪一格」與退回方式 */
  function labelCards() {
    for (const c of st.item.cards) {
      const el = cardEl(c.id);
      if (!el) continue;
      const at = whereIs(c.id);
      const name = `${c.kind === 'lead' ? 'x 係數卡' : '常數卡'} ${cardText(c)}`;
      el.setAttribute('aria-label', at ? `${name}，在${slotKind(at) === 'lead' ? '左欄' : '右欄'}${at.endsWith('0') ? '上' : '下'}格（按 Delete 放回卡片匣）` : name);
      if (at) el.setAttribute('aria-keyshortcuts', 'Delete Backspace');
      else el.removeAttribute('aria-keyshortcuts');
    }
  }
  function paintSelection() {
    root.querySelectorAll<HTMLElement>('.cx-card[data-card]').forEach((e) => {
      const on = !!st.selected && e.dataset.card === st.selected;
      e.classList.toggle('selected', on);
      e.setAttribute('aria-pressed', String(on));
    });
    root.classList.toggle('cx-picking', !!st.selected);
  }
  let flashTimer = 0;
  function flash(msg: string) {
    const fb = $('#cx-feedback');
    fb.className = 'cx-feedback warn';
    fb.textContent = msg;
    clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => st.done === 'none' && update(), 1800);
  }

  /* ── 搬卡片（只動到相關的節點） ── */
  function place(id: string, slot: CrossSlot): boolean {
    if (locked()) return false;
    const card = cardOf(id);
    if (!card || !cardEl(id)) return false;
    if (st.item.leadLocked && slotKind(slot) === 'lead') {
      flash('左欄已經是 x、x，只要放常數卡。');
      return false;
    }
    if (card.kind !== slotKind(slot)) {
      flash(card.kind === 'lead' ? '這張是 x 係數卡，要放在左欄。' : '這張是常數卡，要放在右欄。');
      return false;
    }
    const from = whereIs(id);
    const occupant = st.placed[slot];
    if (occupant === id) return true;
    st.placed[slot] = id;
    if (from) st.placed[from] = occupant;
    slotEl(slot).append(cardEl(id)!);
    if (occupant) {
      if (from) slotEl(from).append(cardEl(occupant)!);
      else home(occupant);
    }
    st.selected = null;
    update();
    return true;
  }
  function home(id: string) {
    const el = cardEl(id);
    if (el) root.querySelector(`[data-home="${CSS.escape(id)}"]`)?.append(el);
  }
  function toTray(id: string) {
    if (locked() || !cardOf(id)) return;
    const from = whereIs(id);
    if (from) st.placed[from] = null;
    home(id);
    st.selected = null;
    update();
  }
  function tapCard(id: string) {
    if (locked() || !cardOf(id)) return;
    const at = whereIs(id);
    if (st.selected && st.selected !== id && at) {
      place(st.selected, at);
      return;
    }
    st.selected = st.selected === id ? null : id;
    paintSelection();
  }
  function tapSlot(slot: CrossSlot) {
    if (!st.selected) return;
    place(st.selected, slot);
  }

  /* ── Pointer Events 拖曳 ── */
  let drag: Drag | null = null;
  const dropAt = (x: number, y: number): HTMLElement | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return (el?.closest('[data-slot]') as HTMLElement) || (el?.closest('#cx-tray') as HTMLElement) || null;
  };
  /** 結束／取消拖曳：拿掉跟著手指的複製卡、放掉指標擷取。拖曳中卡片本身沒有移動，所以取消＝留在原位。 */
  function endDrag() {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.ghost?.remove();
    d.el.classList.remove('lifting');
    d.over?.classList.remove('over');
    try {
      if (d.el.hasPointerCapture?.(d.pointerId)) d.el.releasePointerCapture(d.pointerId);
    } catch {
      /* 指標已經不在 */
    }
  }
  /** 換題、換重點、清空、公布答案、提示、提公因數時呼叫：進行中的拖曳一律作廢 */
  const cancelDrag = endDrag;
  root.addEventListener('pointerdown', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.cx-card[data-card]');
    if (!el || locked() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    // 已經有一根手指在拖：其他指標一律不理（不搶走拖曳，也不變成點選）
    if (drag || !cardOf(el.dataset.card!)) return;
    drag = { id: el.dataset.card!, el, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, ghost: null, over: null };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* 合成事件沒有可擷取的指標 */
    }
  });
  root.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.x0,
      dy = e.clientY - drag.y0;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < DRAG_START_PX) return;
      drag.moved = true;
      const r = drag.el.getBoundingClientRect();
      const g = drag.el.cloneNode(true) as HTMLElement;
      g.className = `${drag.el.className} cx-ghost`;
      g.removeAttribute('data-testid');
      g.removeAttribute('data-card');
      g.setAttribute('aria-hidden', 'true');
      Object.assign(g.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      root.append(g);
      drag.ghost = g;
      drag.el.classList.add('lifting');
    }
    e.preventDefault();
    drag.ghost!.style.transform = `translate(${dx}px, ${dy}px)`;
    const over = dropAt(e.clientX, e.clientY);
    if (over !== drag.over) {
      drag.over?.classList.remove('over');
      over?.classList.add('over');
      drag.over = over;
    }
  });
  root.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    const target = d.moved ? dropAt(e.clientX, e.clientY) : null;
    endDrag();
    // 拖曳中換過題：這張卡已經不在板子上
    if (!cardOf(d.id) || !root.contains(d.el)) return;
    if (!d.moved) tapCard(d.id);
    else if (target?.dataset.slot) place(d.id, target.dataset.slot as CrossSlot);
    else if (target?.id === 'cx-tray') toTray(d.id);
  });
  // 系統取消（捲動手勢、來電、切換 App）或擷取被搶走：卡片留在原位、拿掉複製卡
  const onCancel = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.pointerId) endDrag();
  };
  root.addEventListener('pointercancel', onCancel);
  root.addEventListener('lostpointercapture', onCancel);

  /* ── 點擊（點格子、點卡片匣、老師按鈕、鍵盤） ── */
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const card = t.closest<HTMLElement>('.cx-card');
    if (card) {
      // 滑鼠／觸控已在 pointerup 處理；鍵盤（Enter／空白鍵）沒有 pointer 事件
      if (e.detail === 0) tapCard(card.dataset.card!);
      return;
    }
    const slot = t.closest<HTMLElement>('[data-slot]');
    if (slot) return tapSlot(slot.dataset.slot as CrossSlot);
    if (t.closest('#cx-tray') && st.selected && whereIs(st.selected)) return toTray(st.selected);
    const act = t.closest<HTMLElement>('[data-cx]')?.dataset.cx;
    if (act === 'focus') {
      st.streak = 0;
      st.mix = 0;
      newItem(t.closest<HTMLElement>('[data-focus]')!.dataset.focus as CrossFocusId);
      syncUrl();
    }
    else if (act === 'next') next();
    else if (act === 'clear') clear();
    else if (act === 'hint') hint();
    else if (act === 'reveal') reveal();
    else if (act === 'extract') extract();
    else if (act === 'fullscreen') {
      const req = document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen?.();
      req?.catch(() => {});
    }
  });
  root.addEventListener('keydown', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.cx-card[data-card]');
    if (card && (e.key === 'Delete' || e.key === 'Backspace') && whereIs(card.dataset.card!)) {
      // 鍵盤把格子裡的卡放回卡片匣，焦點跟著卡片
      e.preventDefault();
      const id = card.dataset.card!;
      toTray(id);
      cardEl(id)?.focus();
      return;
    }
    const slot = (e.target as HTMLElement).closest<HTMLElement>('[data-slot]');
    if (slot && e.target === slot && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      tapSlot(slot.dataset.slot as CrossSlot);
    }
    if (e.key === 'Escape' && st.selected) {
      st.selected = null;
      paintSelection();
    }
  });
  root.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.cx === 'auto') st.auto = el.checked;
  });

  function syncUrl() {
    // 有效的 ?pool=N 要留著，重新整理或分享網址才會是同一個題池設定
    history.replaceState(null, '', `#/games/cross?focus=${st.focus}&seed=${st.base}${poolParam >= 1 ? `&pool=${poolParam}` : ''}`);
  }
  function next() {
    let focus = st.focus;
    if (st.done !== 'ok') st.streak = 0;
    // 預設停在老師選的重點；勾了「自動進到下一個重點」才在連對 3 題後前進（a1 → a-not-1 → gcf；混合不前進）
    const after = crossNextFocus(focus);
    if (st.auto && st.streak >= CROSS_AUTO_STREAK && after) {
      focus = after;
      st.streak = 0;
    }
    newItem(focus);
    syncUrl();
  }
  function clear() {
    cancelDrag();
    st.done = 'none';
    st.selected = null;
    for (const s of CROSS_SLOTS) if (st.placed[s]) home(st.placed[s]!);
    st.placed = emptyPlaced();
    clearHints();
    update();
  }
  function clearHints() {
    root.querySelectorAll('.cx-card.hint').forEach((e) => e.classList.remove('hint'));
    st.hint = 0;
  }
  /** 找出標準答案用的卡片 id（同數字的卡取第一張） */
  function answerCards(): Record<CrossSlot, string | null> {
    const ans = crossAnswer(st.item);
    const used = new Set<string>();
    const out = emptyPlaced();
    for (const s of CROSS_SLOTS) {
      if (st.item.leadLocked && slotKind(s) === 'lead') continue;
      const c = st.item.cards.find((x) => !used.has(x.id) && x.kind === slotKind(s) && x.value === ans[s])!;
      used.add(c.id);
      out[s] = c.id;
    }
    return out;
  }
  function hint() {
    cancelDrag();
    if (st.done !== 'none') return;
    const it = st.item;
    const fb = $('#cx-feedback');
    fb.className = 'cx-feedback hint';
    if (it.k !== 1 && !st.extracted) {
      fb.textContent = `提示：看看 ${numText(it.poly.a)}、${numText(it.poly.b)}、${numText(it.poly.c)} 三個係數，最大公因數是多少？${it.poly.a < 0 ? '首項是負的，負號也一起提出來。' : ''}`;
      return;
    }
    const ans = answerCards();
    const glow = (slots: CrossSlot[]) => slots.forEach((s) => ans[s] && cardEl(ans[s]!)?.classList.add('hint'));
    // 提示文字直接讀出數字（讀屏使用者看不到發亮）
    const av = crossAnswer(it);
    const leadPair = `${leadText(av.lead0)} 和 ${leadText(av.lead1)}`;
    const constPair = `${signed(av.const0)} 和 ${signed(av.const1)}`;
    st.hint++;
    if (st.hint === 1 && !it.leadLocked) {
      glow(['lead0', 'lead1']);
      fb.textContent = `提示 1：x² 的係數 ${numText(it.inner.a)} 拆成兩個正數相乘，先試發亮的兩張 x 係數卡：${leadPair}。`;
    } else if (st.hint <= 2) {
      st.hint = 2;
      glow(['const0', 'const1']);
      fb.textContent = `提示 2：常數 ${numText(it.inner.c)} 拆成發亮的兩張卡 ${constPair}${it.inner.c < 0 ? '（一正一負）' : it.inner.b < 0 ? '（兩個都是負的）' : '（兩個都是正的）'}；交叉相乘的和要等於 ${signed(it.inner.b)}，想想誰放上面。`;
    } else {
      glow(['lead0', 'lead1', 'const0', 'const1']);
      fb.textContent = `還是不行？發亮的是 ${it.leadLocked ? '' : leadPair + '、'}${constPair}；看看交叉相乘和差多少，或按「公布答案」。`;
    }
  }
  function reveal() {
    cancelDrag();
    if (st.done !== 'none') return;
    if (st.item.k !== 1 && !st.extracted) {
      st.extracted = true;
      renderQuestion();
    }
    for (const s of CROSS_SLOTS) if (st.placed[s]) home(st.placed[s]!);
    st.placed = answerCards();
    for (const s of CROSS_SLOTS) if (st.placed[s]) slotEl(s).append(cardEl(st.placed[s]!)!);
    st.done = 'revealed';
    st.counted = true;
    st.streak = 0;
    st.selected = null;
    update();
  }
  function extract() {
    cancelDrag();
    st.extracted = true;
    renderQuestion();
    update();
  }

  newItem(focus);
}
