// 魔王戰版面檢查（raid-layout.spec.ts）用：在真的學生畫面裡，用真的 raidCardHtml 把作答卡換成指定的題目。
// spec 用 esbuild 打包成一段 script 注入頁面（CSS 已由 app 載入，這裡的 CSS import 打包成空的）。
import type { RaidView } from '../../shared/types';
import { escape as esc } from '../../src/api';
import { icon } from '../../src/icons';
import { md } from '../../src/math';
import { initRaidUi, raidCardHtml, raidLocal } from '../../src/raid-ui';

const btn = (label: string, action: string, style = 'primary', glyph = '', attrs = '') =>
  `<button class="btn ${style}" data-action="${action}" ${attrs}>${glyph ? icon(glyph) : ''}<span>${label}</span></button>`;
// 和 src/main.ts 的 quizFigure 相同
const figure = (svg: string | undefined) => (svg ? `<img class="quiz-figure " alt="題目附圖" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}">` : '');
initRaidUi({ esc, md, btn, icon, figure, serverTime: () => Date.now() });

type Question = NonNullable<NonNullable<RaidView['mine']>['question']>;
(window as unknown as { __raidLayout: unknown }).__raidLayout = {
  card(raid: RaidView, q: Question) {
    raidLocal.noGoal = raid.run.id; // 學生已經按過「先不設定」
    return raidCardHtml({ ...raid, mine: { ...(raid.mine || {}), question: q } }, Date.now());
  },
};
