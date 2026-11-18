/**
 * 十字交乘的一塊作答區（題目、十字圖四格、讀數、卡片匣、回饋）：
 * 老師大板（src/cross-board.ts）用一塊，雙人大屏對戰（src/cross-duel.ts）左右各一塊。
 *
 * - 每一塊有自己的狀態、自己的拖曳與點選；指標事件只掛在自己的 host 上，
 *   拖曳的放下目標只找自己 host 裡的格子／卡片匣（手指滑過中線也碰不到另一邊）。
 * - 以 pointerId 追蹤：每一塊同時只接受一個拖曳，其他指標按卡片一律不理；另一塊完全不受影響。
 * - 點格子、點卡片匣、點公因數選項也用指標事件判斷（兩個人同時點也各算各的）；鍵盤走 click（detail = 0）與 keydown。
 * - 放卡片只搬動那張卡的節點、更新讀數，不重畫整塊。
 * - 「先提公因式」：先在固定的公因數選項（shared/cross.ts crossKOptions，和全班連線對戰同一份）選 k，
 *   選錯有說明（不洩漏答案）可以再選；選對顯示「原式 = k(括號裡的三項式)」，十字圖才解鎖。
 *   首項是負的：直接選負的 k；或先選正的最大公因數，再做第 2 步「提出負號」（四個只差正負號的選項，crossSignOptions）。
 * - 答錯凍結（CROSS_WRONG_FREEZE_MS，3 秒）：四格填滿但不對、公因數選錯、提出負號選錯，這一塊鎖住並顯示
 *   「答錯了，N 秒後再試」倒數；進行中的拖曳、點選立刻作廢，答錯的擺法留在畫面上。外部鎖住（暫停）時倒數也停住；
 *   換題、清空、公布答案立刻解除。只鎖這一塊（對戰的另一邊照常）。
 */
import { escape as esc } from './api';
import { tex } from './math';
import {
  CROSS_SIGN_FEEDBACK,
  CROSS_SLOTS,
  CROSS_WRONG_FREEZE_MS,
  crossAnswer,
  crossDivide,
  crossJudge,
  crossKFeedback,
  crossKOptions,
  crossNeedsSign,
  crossSignOptions,
  factoredTex,
  outerTex,
  leadText,
  numText,
  polyTex,
  signed,
  type CrossCard,
  type CrossFill,
  type CrossItem,
  type CrossSlot,
} from '../shared/cross';
import { crossLevelLabel } from '../shared/game-focus';

const DRAG_START_PX = 8;

export const cardText = (c: CrossCard) => (c.kind === 'lead' ? leadText(c.value) : signed(c.value));
export const slotKind = (slot: CrossSlot) => (slot.startsWith('lead') ? 'lead' : 'const');

/** 重點名稱（x² 換成 KaTeX 排版） */
export function focusLabelHtml(label: string): string {
  return label
    .split('x²')
    .map((part) => esc(part))
    .join(tex('x^2'));
}

export interface CrossPadOptions {
  /** 這一塊的容器（內容由這裡畫） */
  host: HTMLElement;
  /** id 與 data-testid 的前綴：大板用 cx（cx-tray、cx-slot-lead0…），對戰用 dlL／dlR */
  prefix: string;
  /** 卡片 id 的前綴（加上題目序號）：大板 q3-c0，對戰 L3-c0／R3-c0；整個頁面不會重複 */
  cardPrefix: string;
  /** 答對（四格都對，「先提公因式」也選對 k）的那一刻 */
  onSolved?: () => void;
  /** 每次更新讀數之後（大板用來更新分數、按鈕狀態） */
  onUpdate?: () => void;
  /**
   * 每一個作答輸入（按下卡片／格子／公因數、放卡、退卡、選 k）之前問一次；回傳 false＝這個輸入不算。
   * 對戰用來核對實際的截止時間：時間已到就不接受輸入，並由呼叫端立刻結算（不等計時器的下一拍）。
   */
  guard?: () => boolean;
  /** 答錯凍結幾毫秒（預設 CROSS_WRONG_FREEZE_MS；只有 ?test=1 的畫面會改；0＝不凍結） */
  freezeMs?: number;
}
export interface CrossPadState {
  item: CrossItem;
  serial: number;
  placed: Record<CrossSlot, string | null>;
  selected: string | null;
  hint: number;
  /** 公因數選對了（或公布了）；k = 1 的題目不需要 */
  extracted: boolean;
  /** 選錯過的公因數（畫面標成紅框；只用來顯示） */
  kTried: number[];
  /** 選對的公因數（k，或首項為負時正的最大公因數 −k）；還沒選對是 null */
  kChosen: number | null;
  /** 第 2 步「提出負號」做完了（只有首項是負的、kChosen 是正的才需要） */
  signDone: boolean;
  /** 第 2 步選錯過的選項（位置） */
  signTried: number[];
  /** 答錯凍結中（3 秒倒數） */
  penalty: boolean;
  done: 'none' | 'ok' | 'revealed';
  /** 外部鎖住（對戰倒數、暫停、時間到） */
  frozen: boolean;
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
type Tap = { kind: 'slot'; slot: CrossSlot } | { kind: 'tray' } | { kind: 'k'; k: number } | { kind: 'sign'; i: number };

export interface CrossPad {
  readonly state: CrossPadState;
  load(item: CrossItem): void;
  clear(): void;
  hint(): void;
  reveal(): void;
  chooseK(k: number): void;
  cancelDrag(): void;
  freeze(on: boolean): void;
  /** 第 2 步「提出負號」：選第 i 個選項 */
  chooseSign(i: number): void;
  /** 立刻解除答錯凍結（換題、清空、公布答案、對戰結算時） */
  endPenalty(): void;
  /** 在回饋列顯示一段訊息（換題時的題池提示等） */
  notice(html: string, cls: string): void;
}

export const emptyPlaced = (): Record<CrossSlot, string | null> => ({ lead0: null, lead1: null, const0: null, const1: null });

export function createCrossPad(opts: CrossPadOptions): CrossPad {
  const { host, prefix: p } = opts;
  const st: CrossPadState = { item: null as unknown as CrossItem, serial: 0, placed: emptyPlaced(), selected: null, hint: 0, extracted: false, kTried: [], kChosen: null, signDone: false, signTried: [], penalty: false, done: 'none', frozen: false };

  const slotHtml = (slot: CrossSlot) => {
    const lead = slotKind(slot) === 'lead';
    const pos = slot.endsWith('0') ? '上' : '下';
    return `<div class="cx-slot ${lead ? 'lead' : 'const'}" data-slot="${slot}" data-testid="${p}-slot-${slot}" role="button" tabindex="0" aria-label="${lead ? 'x 係數' : '常數'}・${pos}格"><span class="cx-slot-empty">${lead ? '?x' : '?'}</span></div>`;
  };
  host.innerHTML = `<section class="cx-question" id="${p}-question" aria-label="題目"></section><section class="cx-work"><div class="cx-cross" id="${p}-cross" data-testid="${p}-diagram" aria-label="十字圖"><div class="cx-colhead">x 係數</div><div></div><div class="cx-colhead">常數</div>${slotHtml('lead0')}<svg class="cx-x" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line class="cx-d1" x1="6" y1="10" x2="94" y2="90"/><line class="cx-d2" x1="6" y1="90" x2="94" y2="10"/></svg>${slotHtml('const0')}${slotHtml('lead1')}${slotHtml('const1')}<div class="cx-colprod" id="${p}-leadprod" data-testid="${p}-leadprod"></div><div></div><div class="cx-colprod" id="${p}-constprod" data-testid="${p}-constprod"></div><div class="cx-lock">先選出公因數</div></div><div class="cx-readout" aria-label="交叉相乘"><div class="cx-row-f"><span>因式</span><b id="${p}-f0" data-testid="${p}-f0"></b><b id="${p}-f1" data-testid="${p}-f1"></b></div><div class="cx-prod d1"><span>左上 × 右下</span><b id="${p}-ps" data-testid="${p}-ps">?</b></div><div class="cx-prod d2"><span>左下 × 右上</span><b id="${p}-rq" data-testid="${p}-rq">?</b></div><div class="cx-sum"><span>交叉相乘和</span><b id="${p}-sum" data-testid="${p}-sum">?</b><em id="${p}-target" data-testid="${p}-target"></em></div></div></section><section class="cx-tray" id="${p}-tray" data-testid="${p}-tray" aria-label="數字卡（格子裡的卡按 Delete 放回這裡）"></section><p class="cx-feedback" id="${p}-feedback" data-testid="${p}-feedback" role="status" aria-live="polite"></p><div class="cx-penalty" id="${p}-penalty" data-testid="${p}-penalty" aria-hidden="true" hidden><strong>答錯了，<b id="${p}-penalty-n" data-testid="${p}-penalty-n">3</b> 秒後再試</strong></div><p class="cx-sr" id="${p}-penalty-live" data-testid="${p}-penalty-live" aria-live="assertive"></p>`;

  const $ = <T extends HTMLElement = HTMLElement>(id: string) => host.querySelector<T>(`#${p}-${id}`)!;
  const slotEl = (slot: CrossSlot) => host.querySelector<HTMLElement>(`[data-slot="${slot}"]`)!;
  const cardEl = (id: string) => host.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`);
  const cardOf = (id: string) => st.item.cards.find((c) => c.id === id);
  const whereIs = (id: string): CrossSlot | null => CROSS_SLOTS.find((s) => st.placed[s] === id) || null;
  /** 這一題做到哪一步：選公因數 →（首項為負、選了正的）提出負號 → 十字交乘 */
  const stage = (): 'k' | 'sign' | 'cross' =>
    st.item.k === 1 ? 'cross' : !st.extracted ? 'k' : st.kChosen !== null && crossNeedsSign(st.item.poly, st.kChosen) && !st.signDone ? 'sign' : 'cross';
  /** 還沒做到十字交乘（選公因數或提出負號）：卡片、讀數都不畫 */
  const needK = () => stage() !== 'cross';
  const locked = () => st.frozen || st.penalty || st.done !== 'none' || needK();
  const signOptions = () => crossSignOptions(st.item.poly, st.kChosen!, st.item.seed);
  const allowed = () => !opts.guard || opts.guard();

  /* ── 換題：只有這裡會重畫題目、卡片匣與四格內容 ── */
  function load(raw: CrossItem) {
    cancelDrag();
    const serial = ++st.serial;
    const item: CrossItem = { ...raw, cards: raw.cards.map((c) => ({ ...c, id: `${opts.cardPrefix}${serial}-${c.id}` })) };
    st.item = item;
    st.placed = emptyPlaced();
    st.selected = null;
    st.hint = 0;
    st.extracted = false;
    st.kTried = [];
    st.kChosen = null;
    st.signDone = false;
    st.signTried = [];
    st.done = 'none';
    kMsg = '';
    signMsg = '';
    endPenalty();
    host.dataset.key = item.key;
    host.dataset.level = String(item.level);
    renderQuestion();
    renderWork();
    update();
  }
  /**
   * 十字圖四格與卡片匣。「先提公因式」還沒選對 k 時，畫面上只能有原式和公因數選項：
   * 卡片（數值、張數）、左欄是否固定都看得出括號裡的三項式（→ 反推 k），所以先不畫，選對（或公布）才畫。
   */
  function renderWork() {
    const hide = needK();
    $('cross').querySelector('.cx-lock')!.textContent = stage() === 'sign' ? '先提出負號' : '先選出公因數';
    for (const slot of CROSS_SLOTS) {
      const el = slotEl(slot);
      el.querySelector('.cx-card')?.remove();
      const fixed = !hide && st.item.leadLocked && slotKind(slot) === 'lead';
      el.classList.toggle('fixed', fixed);
      el.classList.remove('filled', 'over', 'hint');
      el.querySelector<HTMLElement>('.cx-slot-empty')!.textContent = fixed ? 'x' : slotKind(slot) === 'lead' ? '?x' : '?';
      el.setAttribute('aria-disabled', String(fixed || hide));
    }
    $('tray').innerHTML = hide
      ? `<p class="cx-tray-wait" data-testid="${p}-tray-wait">選對公因數之後，數字卡才會出現</p>`
      : st.item.cards
          .map((c) => `<div class="cx-cell" data-home="${c.id}"><button type="button" class="cx-card ${c.kind}" data-card="${c.id}" data-kind="${c.kind}" data-value="${c.value}" data-testid="${p}-card-${c.id}" aria-label="${c.kind === 'lead' ? 'x 係數卡' : '常數卡'} ${esc(cardText(c))}">${esc(cardText(c))}</button></div>`)
          .join('');
  }
  function renderQuestion() {
    const it = st.item;
    const kTex = (k: number) => (k === 1 ? '' : k === -1 ? '-' : String(k));
    let step = '';
    if (it.k !== 1) {
      let body: string;
      if (!st.extracted)
        body = `<div class="cx-kopts" role="group" aria-label="選出要提出的公因數" data-testid="${p}-kopts">${crossKOptions()
          .map((k) => `<button type="button" class="cx-kbtn ${st.kTried.includes(k) ? 'tried' : ''}" data-k="${k}" data-testid="${p}-k-${k}" aria-label="提出公因數 ${numText(k)}">${numText(k)}</button>`)
          .join('')}</div>`;
      else {
        const k = st.kChosen ?? it.k;
        // 選對之後顯示的式子：原式 = k(原式 ÷ k)，是公開的代數
        body = `<div class="cx-extract-eq" data-testid="${p}-extracted">${tex(`${polyTex(it.poly)}=${kTex(k)}(${polyTex(crossDivide(it.poly, k))})`)}</div>`;
        if (crossNeedsSign(it.poly, k)) {
          body += `<span class="cx-step cx-step2">第 2 步　提出負號（括號裡的首項變成正的）</span>`;
          body += st.signDone
            ? `<div class="cx-extract-eq" data-testid="${p}-signed">${tex(`${polyTex(it.poly)}=${kTex(it.k)}(${polyTex(it.inner)})`)}</div><span class="cx-step">第 3 步　把括號裡的 ${tex(polyTex(it.inner))} 做十字交乘</span>`
            : `<div class="cx-signopts" role="group" aria-label="提出負號：選出正確的式子" data-testid="${p}-signopts">${signOptions()
                .map((o, i) => `<button type="button" class="cx-signbtn ${st.signTried.includes(i) ? 'tried' : ''}" data-sign="${i}" data-testid="${p}-sign-${i}">${tex(outerTex(o.outer, o.inner))}</button>`)
                .join('')}</div>`;
        } else body += `<span class="cx-step">第 2 步　把括號裡的 ${tex(polyTex(it.inner))} 做十字交乘</span>`;
      }
      step = `<div class="cx-extract ${st.extracted ? 'done' : ''} ${st.signDone && st.kChosen !== null && crossNeedsSign(it.poly, st.kChosen) ? 'signed' : ''}" data-testid="${p}-extract-step"><span class="cx-step">第 1 步　提出公因數${it.k < 0 ? '（首項是負的：可以連負號一起提）' : ''}</span>${body}</div>`;
    }
    $('question').innerHTML = `<span class="cx-item-focus" data-testid="${p}-item-focus" data-level="${it.level}">${focusLabelHtml(crossLevelLabel(it.level))}</span><div class="cx-poly" data-testid="${p}-poly"><span class="cx-label">因式分解</span>${tex(polyTex(it.poly), true)}</div>${step}`;
  }

  /* ── 只更新讀數、回饋與狀態 class ── */
  function fill(): CrossFill {
    const f: CrossFill = {};
    for (const s of CROSS_SLOTS) f[s] = st.placed[s] ? (cardOf(st.placed[s]!)?.value ?? null) : null;
    return f;
  }
  let kMsg = '';
  let signMsg = '';
  function update() {
    const it = st.item;
    const f = fill();
    const j = crossJudge(it, f);
    const show = (n: number | null) => (n === null ? '?' : numText(n));
    if (needK()) return updateBeforeK();
    $('ps').textContent = show(j.products[0]);
    $('rq').textContent = show(j.products[1]);
    $('sum').textContent = j.sum === null ? '?' : signed(j.sum);
    $('target').textContent = `目標 ${signed(j.target)}`;
    $('target').title = `${it.k !== 1 ? '括號裡的' : ''}一次項係數`;
    const sumBox = $('sum').parentElement!;
    sumBox.classList.toggle('good', j.sum !== null && j.sum === j.target);
    sumBox.classList.toggle('bad', j.sum !== null && j.sum !== j.target);
    const colProd = (el: HTMLElement, n: number | null, want: number, okFlag: boolean | null, lead: boolean) => {
      el.textContent = n === null ? `相乘 = ${lead ? numText(want) + 'x²' : numText(want)}？` : `相乘 ${lead ? (n === 1 ? 'x²' : numText(n) + 'x²') : numText(n)} ${okFlag ? '✓' : '✗'}`;
      el.classList.toggle('good', okFlag === true);
      el.classList.toggle('bad', okFlag === false);
    };
    colProd($('leadprod'), it.leadLocked ? 1 : j.leadProduct, it.inner.a, it.leadLocked ? true : j.leadOk, true);
    colProd($('constprod'), j.constProduct, it.inner.c, j.constOk, false);
    const lead = (s: CrossSlot) => (it.leadLocked ? 1 : f[s] ?? null);
    const factor = (a: number | null, b: number | null) => `(${a === null ? '?x' : leadText(a)}${b === null ? '?' : signed(b)})`;
    $('f0').textContent = factor(lead('lead0'), f.const0 ?? null);
    $('f1').textContent = factor(lead('lead1'), f.const1 ?? null);

    const cross = $('cross');
    let solvedNow = false;
    if (j.ok && st.done === 'none') {
      st.done = 'ok';
      solvedNow = true;
    }
    cross.classList.toggle('ok', st.done === 'ok');
    cross.classList.toggle('revealed', st.done === 'revealed');
    cross.classList.toggle('bad', j.complete && !j.ok);
    cross.classList.remove('locked');
    host.classList.toggle('cx-done', st.done !== 'none');
    const fb = $('feedback');
    fb.className = 'cx-feedback';
    const answerTex = () => tex(`${polyTex(it.poly)}=${factoredTex(it.k, lead('lead0')!, f.const0!, lead('lead1')!, f.const1!)}`);
    if (st.done === 'ok') {
      fb.classList.add('good');
      fb.innerHTML = `<strong>✓ 正確！</strong><span class="cx-answer" data-testid="${p}-answer">${answerTex()}</span>`;
    } else if (st.done === 'revealed') {
      fb.classList.add('reveal');
      fb.innerHTML = `<strong>公布答案</strong><span class="cx-answer" data-testid="${p}-answer">${answerTex()}</span>`;
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
    for (const s of CROSS_SLOTS) slotEl(s).classList.toggle('filled', !!st.placed[s]);
    labelCards();
    applyLocks();
    paintSelection();
    opts.onUpdate?.();
    if (solvedNow) opts.onSolved?.();
  }
  /** 還沒選對公因數：讀數一律是「?」，不寫目標、欄乘積（那些是括號裡的係數，看得到就能反推 k） */
  function updateBeforeK() {
    for (const id of ['ps', 'rq', 'sum']) $(id).textContent = '?';
    $('target').textContent = '目標 ?';
    $('target').title = '一次項係數';
    $('sum').parentElement!.classList.remove('good', 'bad');
    for (const id of ['leadprod', 'constprod']) {
      $(id).textContent = '';
      $(id).classList.remove('good', 'bad');
    }
    $('f0').textContent = '(?x ?)';
    $('f1').textContent = '(?x ?)';
    const cross = $('cross');
    cross.classList.remove('ok', 'revealed', 'bad');
    cross.classList.add('locked');
    host.classList.remove('cx-done');
    const fb = $('feedback');
    fb.className = 'cx-feedback';
    if (stage() === 'sign') {
      if (signMsg) {
        fb.classList.add('bad');
        fb.innerHTML = `<span data-testid="${p}-signwrong">✗ ${esc(signMsg)}</span>`;
      } else fb.textContent = '首項是負的：再把負號提到括號外面，選出正確的式子。';
    } else if (kMsg) {
      fb.classList.add('bad');
      fb.innerHTML = `<span data-testid="${p}-kwrong">✗ ${esc(kMsg)}，再選一次</span>`;
    } else fb.textContent = '三項的係數有公因數：先選出要提出的公因數，再做十字交乘。';
    applyLocks();
    paintSelection();
    opts.onUpdate?.();
  }
  /** 依目前狀態停用卡片、公因數與提出負號的選項（答錯凍結、外部鎖住、做完都停用） */
  function applyLocks() {
    const off = locked();
    host.querySelectorAll<HTMLButtonElement>('.cx-card').forEach((b) => {
      b.disabled = off;
      b.setAttribute('aria-disabled', String(off));
    });
    const optOff = st.frozen || st.penalty || st.done !== 'none';
    host.querySelectorAll<HTMLButtonElement>('.cx-kbtn, .cx-signbtn').forEach((b) => {
      b.disabled = optOff;
      b.setAttribute('aria-disabled', String(optOff));
    });
    for (const s of CROSS_SLOTS) {
      const el = slotEl(s);
      el.setAttribute('aria-disabled', String(el.classList.contains('fixed') || needK() || st.penalty || st.frozen));
    }
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
    host.querySelectorAll<HTMLElement>('.cx-card[data-card]').forEach((e) => {
      const on = !!st.selected && e.dataset.card === st.selected;
      e.classList.toggle('selected', on);
      e.setAttribute('aria-pressed', String(on));
    });
    host.classList.toggle('cx-picking', !!st.selected);
  }
  let flashTimer = 0;
  function flash(msg: string) {
    const fb = $('feedback');
    fb.className = 'cx-feedback warn';
    fb.textContent = msg;
    clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => st.done === 'none' && update(), 1800);
  }
  function notice(html: string, cls: string) {
    const fb = $('feedback');
    fb.className = `cx-feedback ${cls}`;
    fb.innerHTML = html;
  }

  /* ── 公因數 ── */
  function chooseK(k: number) {
    if (st.frozen || st.penalty || st.done !== 'none' || stage() !== 'k' || !allowed()) return;
    cancelDrag();
    const why = crossKFeedback(st.item.poly, st.item.k, k);
    if (why) {
      kMsg = why;
      if (!st.kTried.includes(k)) st.kTried.push(k);
      host.querySelector(`.cx-kbtn[data-k="${k}"]`)?.classList.add('tried');
      update();
      penalize();
      return;
    }
    kMsg = '';
    st.extracted = true;
    st.kChosen = k;
    renderQuestion();
    renderWork();
    update();
  }
  /** 第 2 步「提出負號」：選對才進到十字交乘；選錯一律同一句說明＋凍結 */
  function chooseSign(i: number) {
    if (st.frozen || st.penalty || st.done !== 'none' || stage() !== 'sign' || !allowed()) return;
    cancelDrag();
    const o = signOptions()[i];
    if (!o) return;
    if (!o.ok) {
      signMsg = CROSS_SIGN_FEEDBACK;
      if (!st.signTried.includes(i)) st.signTried.push(i);
      host.querySelector(`.cx-signbtn[data-sign="${i}"]`)?.classList.add('tried');
      update();
      penalize();
      return;
    }
    signMsg = '';
    st.signDone = true;
    renderQuestion();
    renderWork();
    update();
  }

  /* ── 答錯凍結：倒數只在沒有外部鎖住（暫停）時跑 ── */
  const freezeMs = opts.freezeMs ?? CROSS_WRONG_FREEZE_MS;
  let penLeft = 0,
    penEnd = 0,
    penTimer = 0,
    penTick = 0;
  function penalize() {
    if (freezeMs <= 0) return;
    cancelDrag();
    st.selected = null;
    stopPenaltyClock();
    st.penalty = true;
    penLeft = freezeMs;
    host.classList.add('cx-penalty-on');
    $('penalty').hidden = false;
    // 讀屏只念一次（倒數的數字在 aria-hidden 的橫幅上）
    $('penalty-live').textContent = `答錯了，${Math.ceil(freezeMs / 1000)} 秒後再試`;
    paintPenalty();
    if (!st.frozen) runPenalty();
    applyLocks();
    paintSelection();
  }
  function runPenalty() {
    if (!st.penalty || penTimer) return;
    penEnd = performance.now() + penLeft;
    penTimer = window.setTimeout(endPenalty, penLeft);
    penTick = window.setInterval(() => {
      if (!host.isConnected) return endPenalty();
      penLeft = Math.max(0, penEnd - performance.now());
      paintPenalty();
    }, 100);
  }
  function holdPenalty() {
    if (!penTimer) return;
    penLeft = Math.max(0, penEnd - performance.now());
    stopPenaltyClock();
    paintPenalty();
  }
  function stopPenaltyClock() {
    clearTimeout(penTimer);
    clearInterval(penTick);
    penTimer = penTick = 0;
  }
  function paintPenalty() {
    const n = String(Math.max(1, Math.ceil(penLeft / 1000)));
    const el = $('penalty-n');
    if (el.textContent !== n) el.textContent = n;
    host.dataset.penalty = n;
  }
  function endPenalty() {
    stopPenaltyClock();
    const was = st.penalty;
    st.penalty = false;
    penLeft = 0;
    host.classList.remove('cx-penalty-on');
    $('penalty').hidden = true;
    $('penalty-live').textContent = '';
    delete host.dataset.penalty;
    if (was && st.item) applyLocks();
  }

  /* ── 搬卡片（只動到相關的節點） ── */
  function place(id: string, slot: CrossSlot): boolean {
    if (locked() || !allowed()) return false;
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
    // 四格填滿但不對：答錯凍結（擺法留著，倒數完可以移動卡片再試）
    if (st.done === 'none' && crossJudge(st.item, fill()).complete) penalize();
    return true;
  }
  function home(id: string) {
    const el = cardEl(id);
    if (el) host.querySelector(`[data-home="${CSS.escape(id)}"]`)?.append(el);
  }
  function toTray(id: string) {
    if (locked() || !cardOf(id) || !allowed()) return;
    const from = whereIs(id);
    if (from) st.placed[from] = null;
    home(id);
    st.selected = null;
    update();
  }
  function tapCard(id: string) {
    if (locked() || !cardOf(id) || !allowed()) return;
    const at = whereIs(id);
    if (st.selected && st.selected !== id && at) {
      place(st.selected, at);
      return;
    }
    st.selected = st.selected === id ? null : id;
    paintSelection();
  }
  function tapSlot(slot: CrossSlot) {
    if (!st.selected || st.penalty) return;
    place(st.selected, slot);
  }
  function tapTray() {
    if (st.penalty) return;
    if (st.selected && whereIs(st.selected)) toTray(st.selected);
  }

  /* ── Pointer Events：拖曳（卡片）與點選（格子、卡片匣、公因數），都以 pointerId 追蹤 ── */
  let drag: Drag | null = null;
  const taps = new Map<number, Tap & { x0: number; y0: number }>();
  /** 放下的目標：只找這一塊裡的格子或卡片匣 */
  const dropAt = (x: number, y: number): HTMLElement | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const hit = (el?.closest('[data-slot]') as HTMLElement) || (el?.closest('.cx-tray') as HTMLElement) || null;
    return hit && host.contains(hit) ? hit : null;
  };
  const capture = (el: Element, id: number) => {
    try {
      el.setPointerCapture(id);
    } catch {
      /* 合成事件沒有可擷取的指標 */
    }
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
  /** 換題、清空、公布答案、提示、選公因數時呼叫：進行中的拖曳一律作廢 */
  function cancelDrag() {
    endDrag();
    taps.clear();
  }
  host.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // 答錯凍結中：這一塊的任何指標都不理（不開始拖曳、不記點選）
    if (st.penalty) return;
    const t = e.target as HTMLElement;
    const el = t.closest<HTMLElement>('.cx-card[data-card]');
    if (el) {
      if (locked() || !allowed()) return;
      e.preventDefault();
      // 這一塊已經有一根手指在拖：其他指標一律不理（不搶走拖曳，也不變成點選）
      if (drag || !cardOf(el.dataset.card!)) return;
      drag = { id: el.dataset.card!, el, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, ghost: null, over: null };
      capture(el, e.pointerId);
      return;
    }
    if (drag) return;
    const kb = t.closest<HTMLButtonElement>('.cx-kbtn');
    const sb = t.closest<HTMLButtonElement>('.cx-signbtn');
    const slot = t.closest<HTMLElement>('[data-slot]');
    const tray = t.closest<HTMLElement>('.cx-tray');
    const opt: Tap | null = kb ? { kind: 'k', k: Number(kb.dataset.k) } : sb ? { kind: 'sign', i: Number(sb.dataset.sign) } : null;
    const tap: Tap | null = kb || sb ? ((kb || sb)!.disabled ? null : opt) : slot ? { kind: 'slot', slot: slot.dataset.slot as CrossSlot } : tray ? { kind: 'tray' } : null;
    if (!tap || !allowed()) return;
    taps.set(e.pointerId, { ...tap, x0: e.clientX, y0: e.clientY });
    capture(kb || sb || slot || tray!, e.pointerId);
  });
  host.addEventListener('pointermove', (e) => {
    const tp = taps.get(e.pointerId);
    if (tp && Math.hypot(e.clientX - tp.x0, e.clientY - tp.y0) >= DRAG_START_PX * 2) taps.delete(e.pointerId);
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
      host.append(g);
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
  host.addEventListener('pointerup', (e) => {
    const tp = taps.get(e.pointerId);
    if (tp) {
      taps.delete(e.pointerId);
      if (tp.kind === 'k') chooseK(tp.k);
      else if (tp.kind === 'sign') chooseSign(tp.i);
      else if (tp.kind === 'slot') tapSlot(tp.slot);
      else tapTray();
      return;
    }
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    if (st.penalty) return endDrag();
    const target = d.moved ? dropAt(e.clientX, e.clientY) : null;
    endDrag();
    // 拖曳中換過題：這張卡已經不在這一塊上
    if (!cardOf(d.id) || !host.contains(d.el)) return;
    if (!d.moved) tapCard(d.id);
    else if (target?.dataset.slot) place(d.id, target.dataset.slot as CrossSlot);
    else if (target?.classList.contains('cx-tray')) toTray(d.id);
  });
  // 系統取消（捲動手勢、來電、切換 App）或擷取被搶走：卡片留在原位、拿掉複製卡；
  // 這根手指還沒完成的點選（格子、卡片匣、公因數）也作廢——之後同一個 pointerId 的 pointerup 不做任何事。
  // 只動這一根手指（pointerId）的狀態，其他手指、另一塊不受影響。
  const onCancel = (e: PointerEvent) => {
    taps.delete(e.pointerId);
    if (drag && e.pointerId === drag.pointerId) endDrag();
  };
  host.addEventListener('pointercancel', onCancel);
  host.addEventListener('lostpointercapture', onCancel);

  /* ── 鍵盤：Enter／空白鍵觸發的 click（detail = 0）；滑鼠、觸控已在 pointerup 處理 ── */
  host.addEventListener('click', (e) => {
    if (e.detail !== 0) return;
    const t = e.target as HTMLElement;
    const card = t.closest<HTMLElement>('.cx-card[data-card]');
    if (card) return tapCard(card.dataset.card!);
    const kb = t.closest<HTMLElement>('.cx-kbtn');
    if (kb) return chooseK(Number(kb.dataset.k));
    const sb = t.closest<HTMLElement>('.cx-signbtn');
    if (sb) return chooseSign(Number(sb.dataset.sign));
    const slot = t.closest<HTMLElement>('[data-slot]');
    if (slot) return tapSlot(slot.dataset.slot as CrossSlot);
    if (t.closest('.cx-tray')) tapTray();
  });
  host.addEventListener('keydown', (e) => {
    if (st.penalty) {
      // 答錯凍結中：鍵盤放卡、退卡都不理
      if (['Delete', 'Backspace', 'Enter', ' '].includes(e.key)) e.preventDefault();
      return;
    }
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

  /* ── 老師按鈕（大板）：清空、提示、公布答案 ── */
  function clear() {
    cancelDrag();
    endPenalty();
    st.done = 'none';
    st.selected = null;
    for (const s of CROSS_SLOTS) if (st.placed[s]) home(st.placed[s]!);
    st.placed = emptyPlaced();
    clearHints();
    update();
  }
  function clearHints() {
    host.querySelectorAll('.cx-card.hint').forEach((e) => e.classList.remove('hint'));
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
    const fb = $('feedback');
    fb.className = 'cx-feedback hint';
    if (stage() === 'sign') {
      fb.textContent = '提示：把負號提到括號外面，括號裡的每一項都要變號（正變負、負變正）。';
      return;
    }
    if (needK()) {
      fb.textContent = `提示：看看 ${numText(it.poly.a)}、${numText(it.poly.b)}、${numText(it.poly.c)} 三個係數，最大公因數是多少？${it.poly.a < 0 ? '首項是負的：負號可以一起提出來，也可以先提正的、再提出負號。' : ''}`;
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
    endPenalty();
    if (needK()) {
      // 公布答案也公布公因數那一步（已經先提了正的，就連提出負號一起公布）
      if (st.kChosen === null) st.kChosen = st.item.k;
      st.extracted = true;
      st.signDone = true;
      kMsg = '';
      signMsg = '';
      renderQuestion();
      renderWork();
    }
    for (const s of CROSS_SLOTS) if (st.placed[s]) home(st.placed[s]!);
    st.placed = answerCards();
    for (const s of CROSS_SLOTS) if (st.placed[s]) slotEl(s).append(cardEl(st.placed[s]!)!);
    st.done = 'revealed';
    st.selected = null;
    update();
  }
  function freeze(on: boolean) {
    if (on) cancelDrag();
    st.frozen = on;
    if (on) st.selected = null;
    // 外部鎖住（暫停）時答錯凍結的倒數停住，解鎖後接著倒數剩下的時間
    if (on) holdPenalty();
    else runPenalty();
    if (st.item) update();
  }

  return { state: st, load, clear, hint, reveal, chooseK, chooseSign, cancelDrag, freeze, endPenalty, notice };
}
