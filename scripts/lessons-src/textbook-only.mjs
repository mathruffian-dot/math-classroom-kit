// 學生作答只用課本原題：隨堂的換數字題（自編）拿掉，題目數量學生才做得完（2026-10-21 老師課堂回饋）。
// keep：題目 ID → 保留前幾小題（課本原題排在最前面）。左圖的「另一組數字」示範不是題目，照舊保留。

/** 把「(1) … (2) … (3) …」這類逐題說明截到第 n 題；換數字題的說明一起拿掉。 */
function trimNumbered(text, n) {
  if (!text) return text;
  let out = text;
  const next = out.indexOf(`(${n + 1})`);
  if (next > 0) out = out.slice(0, next);
  // 2-2 的說明以「；」分隔每一小題（沒有編號）
  else if (!out.includes('(1)')) out = out.split('；').slice(0, n).join('；');
  const extra = out.indexOf('換數字題');
  if (extra > 0) out = out.slice(0, extra);
  if (n === 1) out = out.replace(/^(答案：)?\(1\)\s*/, '$1');
  return out.replace(/[\s；，。、]+$/, '') + '。';
}

export function textbookOnly(lessons, keep) {
  const seen = new Set();
  for (const lesson of lessons)
    for (const slide of lesson.slides) {
      const a = slide.activity;
      if (!a || keep[a.id] === undefined) continue;
      const n = keep[a.id];
      seen.add(a.id);
      if (!a.items || a.items.length < n) throw new Error(`${a.id} 只有 ${a.items?.length ?? 0} 小題，不能保留 ${n} 題`);
      a.items = a.items.slice(0, n);
      a.explanation = trimNumbered(a.explanation, n);
      if (slide.notes) slide.notes = trimNumbered(slide.notes, n);
      slide.body = slide.body
        .replace(/(前兩題|第 1 題)是課本隨堂(?: \(\d\))?，(第 3 題換數字|後兩題換數字|其餘是換數字題)。/, '課本隨堂原題。')
        .trim();
      if (slide.source) slide.source = slide.source.replace(/；第 1 題為課本隨堂，其餘為換數字題（自編）/, ' 隨堂（題目數字同課本）');
    }
  const missing = Object.keys(keep).filter((id) => !seen.has(id));
  if (missing.length) throw new Error(`textbookOnly 找不到題目：${missing.join('、')}`);
}
