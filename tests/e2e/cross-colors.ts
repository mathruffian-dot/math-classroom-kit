// 十字交乘的配色檢查（大板、雙人對戰、全班連線學生端共用）：x 係數卡是橘色，和常數卡的藍色色相差很遠。
import { expect, type Page } from '@playwright/test';

const rgb = (s: string) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number) as [number, number, number];
export function hue(css: string) {
  const [r, g, b] = rgb(css).map((v) => v / 255);
  const max = Math.max(r, g, b),
    d = max - Math.min(r, g, b);
  if (!d) return NaN;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
export const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/** xSel／cSel：畫面上一張 x 係數卡與一張常數卡。邊框色相差 > 60°，x 卡落在橘色（10°～40°），文字色也不是藍紫。 */
export async function expectXColorDistinct(page: Page, xSel: string, cSel: string) {
  const read = (sel: string) => page.locator(sel).first().evaluate((e) => ({ border: getComputedStyle(e).borderTopColor, color: getComputedStyle(e).color }));
  const [x, c] = [await read(xSel), await read(cSel)];
  const xh = hue(x.border),
    ch = hue(c.border);
  expect(hueGap(xh, ch), `x ${x.border} vs const ${c.border}`).toBeGreaterThan(60);
  expect(xh, `x border ${x.border} is orange`).toBeGreaterThanOrEqual(10);
  expect(xh, `x border ${x.border} is orange`).toBeLessThanOrEqual(40);
  const th = hue(x.color);
  expect(th >= 10 && th <= 40, `x text ${x.color} is orange`).toBe(true);
}

/** 選取提示（navy，--cross-pick）算出來的 rgb 字串 */
export async function pickColor(page: Page) {
  return page.evaluate(() => {
    const p = document.createElement('i');
    p.style.color = 'var(--cross-pick)';
    document.body.append(p);
    const c = getComputedStyle(p).color;
    p.remove();
    return c;
  });
}
/** 已放 x 卡的格子／已選的卡：選取提示是 navy，不能被橘色的 x 卡規則蓋掉。prop：border（連線版的格子）或 outline（大板／對戰的卡片） */
export async function expectPickCue(page: Page, sel: string, prop: 'border' | 'outline') {
  const want = await pickColor(page);
  const got = await page.locator(sel).first().evaluate((e, p) => (p === 'border' ? getComputedStyle(e).borderTopColor : getComputedStyle(e).outlineColor), prop);
  expect(got, `${sel} ${prop} is the navy pick colour`).toBe(want);
}
