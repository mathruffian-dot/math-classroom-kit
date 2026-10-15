import katex from 'katex';
import 'katex/dist/katex.min.css';
import { answerToTex } from '../shared/expr';
import { escape as esc } from './api';

/**
 * 數學排版：教材文字中以 $…$ 包住的 LaTeX 用 KaTeX 排成課本樣式
 * （根號橫線蓋住整個被開方數、分數上下排、指數上標）。
 * 沒有用 $ 標記的 √n、√(…) 也會自動排版，避免漏網的純文字根號。
 */
const cache = new Map<string, string>();
export function tex(src: string, display = false): string {
  const key = `${display ? 'D' : 'I'}${src}`;
  let html = cache.get(key);
  if (!html) {
    html = katex.renderToString(src, {
      throwOnError: false,
      displayMode: display,
      strict: 'ignore',
      output: 'htmlAndMathml',
      trust: false,
    });
    if (cache.size > 3000) cache.clear();
    cache.set(key, html);
  }
  return html;
}
/** 純文字裡的根號：2√3、√(7/2)、√12 → KaTeX（整段解析失敗時的備案）。 */
function autoRadicals(raw: string): string {
  let out = '',
    last = 0;
  for (const m of raw.matchAll(/(-?\d+(?:\.\d+)?)?√(\d+(?:\.\d+)?|[A-Za-z]|\(([^()]*)\))/g)) {
    const body = m[3] !== undefined ? answerToTex(m[3]) : m[2];
    out += esc(raw.slice(last, m.index));
    out += body === null ? esc(m[0]) : tex(`${m[1] ?? ''}\\sqrt{${body}}`);
    last = m.index! + m[0].length;
  }
  return out + esc(raw.slice(last));
}
const REL: Record<string, string> = { '=': '=', '＝': '=', '≈': '\\approx ', '<': '<', '>': '>', '≠': '\\ne ', '≤': '\\le ', '≥': '\\ge ' };
/** 一段連續的算式（含 √、²、³、^）整段解析成 LaTeX，保留作者寫的括號、×、÷。 */
function convertRun(run: string): string | null {
  if (!/[√²³^]/.test(run) || !/[0-9A-Za-z]/.test(run)) return null;
  const parts = run.split(/(＝|=|≈|<|>|≠|≤|≥)/);
  const texParts: string[] = [];
  for (const [i, part] of parts.entries()) {
    if (i % 2) texParts.push(REL[part]);
    else if (!part.trim()) texParts.push('');
    else {
      const t = answerToTex(part);
      if (t === null) return null;
      texParts.push(t);
    }
  }
  return tex(texParts.join(''));
}
const RUN = /[0-9A-Za-z√()+＋\-−×÷*/^.=＝<>≈≠≤≥²³ ]+/g;
function autoMath(raw: string): string {
  let out = '',
    last = 0;
  for (const m of raw.matchAll(RUN)) {
    const lead = m[0].match(/^\s*/)![0],
      trail = m[0].match(/\s*$/)![0],
      core = m[0].trim();
    const html = core ? convertRun(core) : null;
    out += esc(raw.slice(last, m.index));
    out += html === null ? autoRadicals(m[0]) : `${esc(lead)}${html}${esc(trail)}`;
    last = m.index! + m[0].length;
  }
  return out + esc(raw.slice(last));
}
/** 教材文字 → HTML（跳脫＋$…$ 排版＋自動辨識純文字算式）。 */
export function md(text: unknown): string {
  const s = String(text ?? '');
  if (!/[$√²³^]/.test(s)) return esc(s);
  return s
    .split(/(\$[^$]+\$)/g)
    .map((part) => (part.length > 2 && part.startsWith('$') && part.endsWith('$') ? tex(part.slice(1, -1)) : autoMath(part)))
    .join('');
}
/** 學生輸入的算式答案 → 課本樣式；看不懂就顯示原文。 */
export function answerHtml(value: string): string {
  const t = answerToTex(value);
  return t === null ? esc(value) : tex(t);
}
/** 給 title、aria-label、<option> 等只能放純文字的地方。 */
export function plain(text: unknown): string {
  return String(text ?? '')
    .replace(/\$([^$]+)\$/g, (_, t: string) =>
      t
        .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
        .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
        .replace(/\\times/g, '×')
        .replace(/\\div/g, '÷')
        .replace(/\\cdot/g, '·')
        .replace(/\\pm/g, '±')
        .replace(/\\left|\\right/g, '')
        .replace(/\\text\{([^{}]*)\}/g, '$1')
        .replace(/\^\{?2\}?/g, '²')
        .replace(/\^\{?3\}?/g, '³')
        .replace(/[{}\\]/g, ''),
    );
}
