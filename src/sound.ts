// 答對音效：用 Web Audio 即時合成（不需要音效檔）。
// iPad／手機要在使用者第一次觸碰時解鎖聲音，之後（例如老師按「公布結果」）才能自動播放。
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ||= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}
/** 第一次觸碰或按鍵時解鎖聲音。 */
export function unlockSound() {
  const unlock = () => {
    const a = audio();
    if (!a) return;
    // 播一個聽不到的極短音，iOS 才算真正解鎖
    const g = a.createGain();
    g.gain.value = 0;
    g.connect(a.destination);
    const o = a.createOscillator();
    o.connect(g);
    o.start();
    o.stop(a.currentTime + 0.01);
  };
  for (const type of ['pointerdown', 'keydown'] as const) document.addEventListener(type, unlock, { once: true, capture: true });
}
/** 答對：上行三和弦「叮－叮－叮♪」，約 0.6 秒。 */
export function playCorrect() {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + 0.02;
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
    const t = t0 + i * 0.09;
    const o = a.createOscillator(),
      g = a.createGain();
    o.type = i === 3 ? 'sine' : 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (i === 3 ? 0.5 : 0.22));
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + 0.55);
  });
}
