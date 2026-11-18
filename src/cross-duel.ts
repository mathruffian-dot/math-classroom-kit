/**
 * 十字交乘・雙人大屏對戰（老師的大觸控螢幕，兩位同學同時上台）：#/games/cross-duel?focus=a1&time=120&seed=123
 *
 * - 純前端，不連伺服器、不記名：左方（紅）、右方（藍）。
 * - 左右各一塊作答區（src/cross-pad.ts，和單人大板同一個元件）；每一塊有自己的拖曳／點選狀態，
 *   以 pointerId 追蹤，兩個人同時拖曳互不影響，一邊換題不會重畫另一邊。
 * - 出題（shared/cross-duel.ts）：兩邊第 i 題同一個重點、同一種題型，但數字不同；同一個 seed 同一串。
 * - 時間內答對題數多的獲勝（一樣多＝平手）。對戰中沒有提示、公布答案；老師可以暫停／結束。
 * - 截止時間以實際時間（performance.now）為準：每一個作答輸入與計分前都核對，過了就立刻鎖住、結算（只結算一次），
 *   不靠每 100ms 的計時器；分頁切回前景（visibilitychange）、視窗取得焦點時也立刻核對。
 * - 測試用（?test=1）：window.__crossDuelTest 可以把時鐘往前撥（skew）、暫停計時器的拍子與自動換題（hold），
 *   用來重現「截止前／後的最後一個輸入」「計時器延遲」。只有網址帶 test=1 開的那一個畫面有：整個畫面存續期間網址
 *   一直保留 test=1（改選正式時間也一樣）；離開畫面（root 不在頁面上）就撤掉，而且 hook 只認建立它的畫面，
 *   所以之後用一般網址開的對局不受影響。
 * - 答錯凍結（src/cross-pad.ts）：只有答錯的那一邊凍結 3 秒，另一邊照常；凍結的時間照樣算在對戰時間裡（計時不停）。
 *   老師按暫停時凍結的倒數也停住，繼續後接著倒數剩下的時間；凍結中時間到照常結算（結算時解除凍結）。
 *   測試用：?test=1&freeze=毫秒 改凍結時間（shared/cross-duel.ts crossTestFreeze）。
 * - 題目用完（shared/cross-duel.ts 的 deck.exhausted）：那一邊停止發題、鎖住，顯示「這個重點的題目都出過了」；
 *   不重新洗牌，所以整局不重複、兩邊不會同時同一題。
 */
import './cross.css';
import { escape as esc } from './api';
import { icon } from './icons';
import { CROSS_FOCUS, type CrossFocusId } from '../shared/game-focus';
import {
  CROSS_DUEL_ADVANCE_MS,
  CROSS_DUEL_COUNTDOWN,
  CROSS_DUEL_SIDES,
  CROSS_DUEL_SIDE_LABEL,
  CROSS_DUEL_TIMES,
  CrossDuelTimer,
  crossDuelClock,
  crossDuelDeck,
  crossDuelResultText,
  crossDuelSettings,
  crossDuelWinner,
  crossTestFreeze,
  type CrossDuelDeck,
  type CrossDuelSide,
} from '../shared/cross-duel';
import { createCrossPad, type CrossPad } from './cross-pad';
import { crossModeSwitchHtml, focusOptionHtml } from './cross-board';

type Phase = 'setup' | 'countdown' | 'play' | 'paused' | 'over';
const minutes = (t: number) => (t % 60 === 0 ? `${t / 60} 分鐘` : `${t} 秒`);
const randomSeed = () => (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0;

/** 時間選項（遊戲卡片與開始設定共用）：1／2／3 分鐘 */
function timePickerHtml(name: string, time: number): string {
  return `<div class="xd-times" role="radiogroup" aria-label="時間">${CROSS_DUEL_TIMES.map((t) => `<label class="xd-time"><input type="radio" name="${name}" value="${t}" data-testid="${name}-${t}" ${t === time ? 'checked' : ''}><span>${minutes(t)}</span></label>`).join('')}</div>`;
}

/** 遊戲活動頁的卡片：選重點（連結）＋時間（改連結上的 time） */
export function crossDuelGameCardHtml(): string {
  return `<article class="course-card cx-game-card xd-game-card" data-testid="game-cross-duel"><div class="course-thumb xd-thumb"><span>八年級 3-2</span><strong>十字<small>交乘</small></strong><em>雙人大屏・左右對戰</em></div><div class="course-details"><h3>十字交乘（雙人大屏對戰）</h3><p>兩位同學同時在大螢幕上作答，左右各一題、數字不同但難度一樣；時間內答對題數多的獲勝。</p><div class="course-meta">${icon('users')}大觸控螢幕，兩個人可以同時拖曳</div>${timePickerHtml('xd-card-time', 120)}<div class="fx-picker" role="group" aria-label="選擇重點">${CROSS_FOCUS.map((f, i) => `<a class="fx-option ${i === 0 ? 'primary' : ''}" href="#/games/cross-duel?focus=${f.id}&time=120" data-duel-focus="${f.id}" data-testid="open-duel-${f.id}" aria-label="${esc(f.label)}（雙人對戰）">${focusOptionHtml(f)}</a>`).join('')}</div></div></article>`;
}
// 遊戲卡片上換時間：改寫四個重點連結的 time（卡片在 main.ts 的 shell 裡，事件委派掛一次就好）
if (typeof document !== 'undefined')
  document.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.name !== 'xd-card-time') return;
    el.closest('[data-testid="game-cross-duel"]')
      ?.querySelectorAll<HTMLAnchorElement>('[data-duel-focus]')
      .forEach((a) => (a.href = `#/games/cross-duel?focus=${a.dataset.duelFocus}&time=${el.value}`));
  });

export function renderCrossDuel(app: HTMLElement, route: string): void {
  const params = new URLSearchParams(route.split('?')[1] || '');
  const settings = crossDuelSettings(params);
  let urlSeed = settings.seed;
  let focus: CrossFocusId = settings.focus;
  let time = settings.time;
  let seed = 0;
  let phase: Phase = 'setup';
  let round = 0;
  let deck: CrossDuelDeck | null = null;
  let timer = new CrossDuelTimer(time * 1000);
  let tick = 0;
  const index: Record<CrossDuelSide, number> = { L: 0, R: 0 };
  const score: Record<CrossDuelSide, number> = { L: 0, R: 0 };
  const advance: Partial<Record<CrossDuelSide, number>> = {};
  /** 這一邊的題目用完了（停止發題、一直鎖住） */
  const out: Record<CrossDuelSide, boolean> = { L: false, R: false };
  const testing = params.get('test') === '1';
  const testFreeze = crossTestFreeze(params);
  /** 測試用：時鐘偏移、暫停計時器的拍子／自動換題 */
  const test = { skew: 0, holdTick: false, holdAdvance: false };
  const now = () => performance.now() + test.skew;
  /** 結算了幾次（應該永遠是 0 或 1；畫面 data-settled 供測試核對） */
  let settled = 0;

  const sideHtml = (s: CrossDuelSide) =>
    `<section class="xd-side ${s === 'L' ? 'red' : 'blue'}" data-side="${s}" data-testid="xd-side-${s}" aria-label="${CROSS_DUEL_SIDE_LABEL[s]}"><header class="xd-side-head"><strong>${CROSS_DUEL_SIDE_LABEL[s]}</strong><span class="xd-count" aria-live="polite">答對 <b data-testid="xd-score-${s}">0</b> 題</span></header><div class="xd-pad cx-pad" id="xd${s}-host" data-testid="xd-pad-${s}"></div></section>`;
  const focusButtons = () =>
    CROSS_FOCUS.map((f) => `<button type="button" class="fx-option ${f.id === focus ? 'selected' : ''}" data-xd="focus" data-focus="${f.id}" data-testid="xd-focus-${f.id}" aria-pressed="${f.id === focus}" aria-label="${esc(f.label)}">${focusOptionHtml(f)}</button>`).join('');

  app.className = 'cross-app cross-duel-app';
  app.innerHTML = `<div class="xd-root" id="xd-root" data-testid="cross-duel" data-phase="setup"><header class="cx-top xd-top"><a class="icon-btn" href="#/games" aria-label="返回遊戲活動" title="返回遊戲活動">${icon('back')}</a><h1>十字交乘<small>雙人對戰</small></h1><span id="xd-mode-host">${crossModeSwitchHtml('duel', focus)}</span><span class="xd-focus-tag" id="xd-focus-tag" data-testid="xd-focus-tag"></span><div class="xd-timer" id="xd-timer" data-testid="xd-timer" role="timer" aria-label="剩下時間">${crossDuelClock(time * 1000)}</div><div class="xd-controls"><button type="button" class="btn secondary" data-xd="pause" id="xd-pause" data-testid="xd-pause" disabled>${icon('clock')}<span>暫停</span></button><button type="button" class="btn secondary" data-xd="end" id="xd-end" data-testid="xd-end" disabled>${icon('close')}<span>結束</span></button><button type="button" class="icon-btn" data-xd="fullscreen" aria-label="全螢幕" title="全螢幕">${icon('expand')}</button></div></header><main class="xd-arena" id="xd-arena">${sideHtml('L')}<div class="xd-divider" aria-hidden="true"></div>${sideHtml('R')}</main><div class="xd-overlay xd-setup" id="xd-setup" data-testid="xd-setup"><div class="xd-panel"><h2>雙人大屏對戰</h2><p>左右兩位同學同時作答，兩邊的題目數字不同、難度一樣。時間內答對題數多的獲勝。</p><h3>重點</h3><div class="fx-picker xd-focus-pick" role="group" aria-label="選擇重點" id="xd-focus-pick">${focusButtons()}</div><h3>時間</h3>${timePickerHtml('xd-time', time)}<button type="button" class="btn primary xd-start" data-xd="start" data-testid="xd-start">${icon('play')}<span>開始</span></button><div class="xd-setup-links"><a class="btn quiet" href="#/games" data-testid="xd-setup-back">${icon('back')}<span>返回遊戲活動</span></a><a class="btn quiet" id="xd-setup-board" href="#/games/cross?focus=${focus}" data-testid="xd-setup-board">${icon('grid')}<span>改用單人大板</span></a></div></div></div><div class="xd-overlay xd-countdown" id="xd-countdown" data-testid="xd-countdown" hidden><span id="xd-count-num" data-testid="xd-count-num"></span></div><div class="xd-overlay xd-paused" id="xd-paused" data-testid="xd-paused" hidden><div class="xd-panel"><h2>暫停中</h2><button type="button" class="btn primary" data-xd="resume" data-testid="xd-resume">${icon('play')}<span>繼續</span></button></div></div><div class="xd-overlay xd-result" id="xd-result" data-testid="xd-result" hidden><div class="xd-panel"><p class="xd-result-kicker">時間到</p><h2 id="xd-result-title" data-testid="xd-result-title"></h2><div class="xd-result-scores"><div class="red"><span>${CROSS_DUEL_SIDE_LABEL.L}</span><b data-testid="xd-final-L">0</b><small>題</small></div><div class="blue"><span>${CROSS_DUEL_SIDE_LABEL.R}</span><b data-testid="xd-final-R">0</b><small>題</small></div></div><div class="xd-result-actions"><button type="button" class="btn primary" data-xd="again" data-testid="xd-again">${icon('undo')}<span>再來一局</span></button><button type="button" class="btn secondary" data-xd="menu" data-testid="xd-menu">${icon('menu')}<span>回選單</span></button></div></div></div></div>`;
  const root = app.querySelector<HTMLElement>('#xd-root')!;
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const alive = () => root.isConnected;

  const pads = {} as Record<CrossDuelSide, CrossPad>;
  for (const s of CROSS_DUEL_SIDES) pads[s] = createCrossPad({ host: $(`#xd${s}-host`), prefix: `xd${s}`, cardPrefix: s, onSolved: () => solved(s), guard: () => inTime(), ...(testFreeze !== null ? { freezeMs: testFreeze } : {}) });

  /** 對戰中而且還沒過截止時間；已經過了就立刻結算（回傳 false） */
  function inTime(): boolean {
    if (phase !== 'play') return false;
    if (!timer.over(now())) return true;
    finish();
    return false;
  }
  /** 計時器的拍子可能延遲（背景分頁被節流）：回到前景、取得焦點時立刻核對 */
  const recheck = () => {
    if (!alive()) return teardown();
    if (phase === 'play') {
      paintClock();
      inTime();
    }
  };
  type HookWindow = { __crossDuelTest?: { owner?: unknown } };
  const hookWin = window as unknown as HookWindow;
  /** 離開畫面：拿掉事件、撤掉這個畫面的測試 hook（別的畫面建立的不動） */
  const teardown = () => {
    document.removeEventListener('visibilitychange', recheck);
    window.removeEventListener('focus', recheck);
    window.removeEventListener('pageshow', recheck);
    window.removeEventListener('hashchange', onHash);
    if (hookWin.__crossDuelTest?.owner === root) delete hookWin.__crossDuelTest;
  };
  // 換頁（hashchange；replaceState 不會觸發）＝要離開這個畫面了（main.ts 可能非同步才重畫 #app）：立刻撤掉
  const onHash = () => teardown();
  window.addEventListener('hashchange', onHash);
  document.addEventListener('visibilitychange', recheck);
  window.addEventListener('focus', recheck);
  window.addEventListener('pageshow', recheck);
  // 上一個畫面留下的 hook 一律撤掉；只有 test=1 的畫面才重新掛上（每個操作都先確認畫面還在）
  delete hookWin.__crossDuelTest;
  const live = <A extends unknown[], R>(f: (...a: A) => R) => (...a: A): R | undefined => {
    if (alive()) return f(...a);
    teardown();
    return undefined;
  };
  if (testing)
    hookWin.__crossDuelTest = {
      owner: root,
      skew: live((ms: number) => (test.skew += ms)),
      hold: live((tick: boolean, adv?: boolean) => ((test.holdTick = tick), (test.holdAdvance = adv ?? tick))),
      remaining: live(() => timer.remaining(now())),
      settled: live(() => settled),
    } as HookWindow['__crossDuelTest'];

  /* ── 階段 ── */
  function setPhase(p: Phase) {
    phase = p;
    root.dataset.phase = p;
    $('#xd-setup').hidden = p !== 'setup';
    $('#xd-countdown').hidden = p !== 'countdown';
    $('#xd-paused').hidden = p !== 'paused';
    $('#xd-result').hidden = p !== 'over';
    const playing = p === 'play' || p === 'paused';
    $<HTMLButtonElement>('#xd-pause').disabled = !playing;
    $<HTMLButtonElement>('#xd-end').disabled = !playing;
    $('#xd-pause').querySelector('span')!.textContent = p === 'paused' ? '繼續' : '暫停';
    for (const s of CROSS_DUEL_SIDES) pads[s].freeze(p !== 'play' || out[s]);
  }
  function syncUrl() {
    // 測試畫面整個存續期間都保留 test=1（hook 在這個畫面上一直有效，網址要看得出來）
    const t = testing ? `&test=1${testFreeze !== null ? `&freeze=${testFreeze}` : ''}` : '';
    history.replaceState(null, '', `#/games/cross-duel?focus=${focus}&time=${time}&seed=${seed}${t}`);
  }
  function stopTimers() {
    clearInterval(tick);
    for (const s of CROSS_DUEL_SIDES) clearTimeout(advance[s]);
  }
  function loadSide(s: CrossDuelSide) {
    const item = deck!.item(s, index[s]);
    const side = $(`[data-side="${s}"]`);
    if (!item) {
      // 這個重點的題目整局都出過了：這一邊停止發題（留著上一題的答案），不重新洗牌
      out[s] = true;
      side.dataset.exhausted = 'true';
      pads[s].freeze(true);
      pads[s].notice(`<span data-testid="xd${s}-pool-notice">這個重點的題目都出過了，這一邊不再出新題。</span>`, 'warn');
      return;
    }
    pads[s].load(item);
    side.dataset.index = String(index[s]);
  }
  /** 開一局：新的題目串、分數歸零、倒數 3-2-1 */
  function startRound(newSeed: number) {
    stopTimers();
    round++;
    seed = newSeed;
    syncUrl();
    deck = crossDuelDeck(seed, focus);
    timer = new CrossDuelTimer(time * 1000);
    settled = 0;
    delete root.dataset.settled;
    for (const s of CROSS_DUEL_SIDES) {
      index[s] = 0;
      score[s] = 0;
      out[s] = false;
      delete $(`[data-side="${s}"]`).dataset.exhausted;
      $(`[data-testid="xd-score-${s}"]`).textContent = '0';
    }
    root.dataset.seed = String(seed);
    root.dataset.focus = focus;
    $('#xd-focus-tag').innerHTML = focusOptionHtml(CROSS_FOCUS.find((f) => f.id === focus)!);
    $('#xd-mode-host').innerHTML = crossModeSwitchHtml('duel', focus);
    $('#xd-timer').textContent = crossDuelClock(time * 1000);
    $('#xd-timer').classList.remove('low');
    for (const s of CROSS_DUEL_SIDES) loadSide(s);
    setPhase('countdown');
    const r = round;
    let n = CROSS_DUEL_COUNTDOWN;
    const step = () => {
      if (!alive() || r !== round || phase !== 'countdown') return;
      if (n > 0) {
        $('#xd-count-num').textContent = String(n--);
        window.setTimeout(step, 1000);
      } else play();
    };
    step();
  }
  function play() {
    timer.start(now());
    setPhase('play');
    const r = round;
    tick = window.setInterval(() => {
      if (!alive() || r !== round) return clearInterval(tick);
      if (test.holdTick) return;
      paintClock();
      inTime();
    }, 100);
  }
  function paintClock() {
    const left = timer.remaining(now());
    const txt = crossDuelClock(left);
    const el = $('#xd-timer');
    if (el.textContent !== txt) el.textContent = txt;
    el.classList.toggle('low', left <= 10_000);
  }
  function solved(s: CrossDuelSide) {
    // 輸入時已經核對過截止時間；這裡再核對一次（計分是最後一道關）
    if (!inTime()) return;
    score[s]++;
    $(`[data-testid="xd-score-${s}"]`).textContent = String(score[s]);
    const r = round;
    clearTimeout(advance[s]);
    // 綠色＋因式分解停一下，再換這一邊的下一題（另一邊不動）
    const go = () => {
      if (!alive() || r !== round || phase === 'over' || phase === 'setup') return;
      if (test.holdAdvance) return void (advance[s] = window.setTimeout(go, 100));
      if (phase === 'play' && !inTime()) return;
      index[s]++;
      loadSide(s);
    };
    advance[s] = window.setTimeout(go, CROSS_DUEL_ADVANCE_MS);
  }
  /** 結算（時間到或老師按結束）：只會做一次，之後兩邊都鎖住 */
  function finish() {
    if (phase === 'over' || phase === 'setup' || phase === 'countdown') return;
    settled++;
    root.dataset.settled = String(settled);
    stopTimers();
    paintClock();
    for (const s of CROSS_DUEL_SIDES) pads[s].endPenalty();
    setPhase('over');
    const w = crossDuelWinner(score);
    root.dataset.winner = w;
    $('#xd-result').dataset.winner = w;
    $('#xd-result-title').textContent = crossDuelResultText(score);
    $('.xd-result-kicker').textContent = timer.over(now()) ? '時間到' : '對戰結束';
    for (const s of CROSS_DUEL_SIDES) $(`[data-testid="xd-final-${s}"]`).textContent = String(score[s]);
    $('[data-xd="again"]').focus();
  }
  function pause(on: boolean) {
    if (on && phase === 'play') {
      // 已經過了截止時間才按暫停：直接結算
      if (!inTime()) return;
      timer.pause(now());
      setPhase('paused');
    } else if (!on && phase === 'paused') {
      timer.resume(now());
      setPhase('play');
    }
  }
  function menu() {
    stopTimers();
    round++;
    $('#xd-focus-pick').innerHTML = focusButtons();
    setPhase('setup');
  }

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const act = t.closest<HTMLElement>('[data-xd]')?.dataset.xd;
    if (act === 'focus') {
      focus = t.closest<HTMLElement>('[data-focus]')!.dataset.focus as CrossFocusId;
      root.querySelectorAll<HTMLElement>('[data-xd="focus"]').forEach((b) => {
        b.classList.toggle('selected', b.dataset.focus === focus);
        b.setAttribute('aria-pressed', String(b.dataset.focus === focus));
      });
      $<HTMLAnchorElement>('#xd-setup-board').href = `#/games/cross?focus=${focus}`;
    } else if (act === 'start') {
      const picked = Number(root.querySelector<HTMLInputElement>('input[name="xd-time"]:checked')?.value);
      // 測試用的短時間（?test=1&time=3）沒有對應的選項（沒有一個是選取的）：沒有改選就沿用
      if ((CROSS_DUEL_TIMES as readonly number[]).includes(picked)) time = picked;
      // 第一局用網址上的 seed（示範、測試可以重現），之後每局換新的
      startRound(urlSeed ?? randomSeed());
      urlSeed = null;
    } else if (act === 'pause') pause(phase === 'play');
    else if (act === 'resume') pause(false);
    else if (act === 'end') finish();
    else if (act === 'again') startRound(randomSeed());
    else if (act === 'menu') menu();
    else if (act === 'fullscreen') {
      const req = document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen?.();
      req?.catch(() => {});
    }
  });
  // 對戰中不要讓長按選單、兩指縮放（Safari 的 gesture 事件）干擾
  root.addEventListener('contextmenu', (e) => phase !== 'setup' && e.preventDefault());
  root.addEventListener('gesturestart', (e) => e.preventDefault());

  setPhase('setup');
  for (const s of CROSS_DUEL_SIDES) pads[s].freeze(true);
}
