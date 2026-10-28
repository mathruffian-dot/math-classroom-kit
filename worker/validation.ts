import type {
  Activity,
  AnswerValue,
  CanvasAnswer,
  Interactive,
  InteractiveShape,
  Lesson,
  PracticeQuestion,
  QuizBank,
  QuizItem,
  RaidBank,
  Rubric,
  Stroke,
} from '../shared/types';
import {
  ExprError,
  compile,
  evaluate,
  isSimplestRadical,
  parseNumberAnswer,
  variablesOf,
} from '../shared/expr';
import type { RaidKind } from '../shared/raid';
import { makeCheck } from '../shared/make';
import { DUEL_RULES, duelBlanks, type DuelBank, type DuelTok } from '../shared/duel';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export function assert(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new HttpError(status, message);
}
export function record(value: unknown): Record<string, unknown> {
  assert(!!value && typeof value === 'object' && !Array.isArray(value), '資料必須是物件');
  return value as Record<string, unknown>;
}
export function str(value: unknown, name: string, max = 500, min = 0): string {
  assert(
    typeof value === 'string' && value.length >= min && value.length <= max,
    `${name}格式不正確`,
  );
  return value;
}
export function integer(value: unknown, min: number, max: number): number {
  assert(
    Number.isInteger(value) && Number(value) >= min && Number(value) <= max,
    `數值必須介於 ${min}–${max}`,
  );
  return Number(value);
}
export function num(value: unknown, name: string, min = -1e6, max = 1e6): number {
  assert(
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max,
    `${name}必須是 ${min}–${max} 的數字`,
  );
  return value;
}
export function identifier(value: unknown): string {
  const id = str(value, 'ID', 100, 1);
  assert(/^[a-zA-Z0-9_-]+$/.test(id), 'ID 只接受英數、底線和連字號');
  assert(!['__proto__', 'constructor', 'prototype'].includes(id), 'ID 為保留名稱');
  return id;
}
function texts(value: unknown, name: string, maxCount = 20): string[] {
  assert(Array.isArray(value) && value.length <= maxCount, `${name}必須是陣列`);
  return value.map((v) => str(v, name, 3000));
}
const VAR_NAME = /^[A-Za-z][A-Za-z0-9]{0,15}$/;
const COLOR = /^(#[\da-f]{3,8}|[a-z]{3,20})$/i;
function expression(value: unknown, name: string, known?: Set<string>): string {
  const src = str(value, name, 400, 1);
  try {
    compile(src);
    if (known)
      for (const v of variablesOf(src))
        assert(known.has(v), `${name}「${src}」使用了未定義的變數 ${v}`);
  } catch (e) {
    if (e instanceof ExprError) throw new HttpError(400, `${name}「${src}」無法解析：${e.message}`);
    throw e;
  }
  return src;
}
function expr(value: unknown, name: string, known: Set<string>): string | number {
  if (typeof value === 'number') return num(value, name);
  return expression(value, name, known);
}
const SHAPES = [
  'function',
  'segment',
  'line',
  'polygon',
  'circle',
  'rect',
  'text',
  'point',
  'angle',
  'brace',
];
export function validateInteractive(input: unknown): Interactive {
  const i = record(input),
    v = record(i.view);
  const view: Interactive['view'] = {
    xMin: num(v.xMin, 'xMin'),
    xMax: num(v.xMax, 'xMax'),
    yMin: num(v.yMin, 'yMin'),
    yMax: num(v.yMax, 'yMax'),
  };
  assert(view.xMax > view.xMin && view.yMax > view.yMin, '視覺化座標範圍不正確');
  if (v.grid !== undefined) view.grid = num(v.grid, 'grid', 0, 1000);
  if (v.axes !== undefined) view.axes = v.axes === true;
  if (v.aspect !== undefined) {
    assert(['equal', 'fill'].includes(String(v.aspect)), 'aspect 只能是 equal 或 fill');
    view.aspect = v.aspect as 'equal' | 'fill';
  }
  const known = new Set<string>(['step']);
  const out: Interactive = { view, shapes: [] };
  if (i.params !== undefined) {
    assert(Array.isArray(i.params) && i.params.length <= 8, '滑桿參數最多 8 個');
    out.params = i.params.map((input) => {
      const p = record(input),
        id = str(p.id, '參數 ID', 16, 1);
      assert(VAR_NAME.test(id) && !known.has(id), `參數 ID「${id}」不合法或重複`);
      known.add(id);
      const kind = p.kind === 'toggle' ? 'toggle' : 'slider';
      const param: NonNullable<Interactive['params']>[number] = {
        id,
        kind,
        value: num(p.value, '參數初始值'),
      };
      if (p.label !== undefined) param.label = str(p.label, '參數名稱', 40);
      if (p.unit !== undefined) param.unit = str(p.unit, '單位', 10);
      if (kind === 'slider') {
        param.min = num(p.min, '最小值');
        param.max = num(p.max, '最大值');
        param.step = num(p.step ?? 1, '間距', 1e-6, 1e6);
        assert(param.max > param.min, `參數 ${id} 的最大值需大於最小值`);
        assert((param.max - param.min) / param.step <= 2000, `參數 ${id} 的刻度過密`);
      }
      return param;
    });
  }
  if (i.points !== undefined) {
    assert(Array.isArray(i.points) && i.points.length <= 8, '拖曳點最多 8 個');
    out.points = i.points.map((input) => {
      const p = record(input),
        id = str(p.id, '點 ID', 8, 1);
      assert(/^[A-Za-z][A-Za-z0-9]{0,7}$/.test(id), `點 ID「${id}」不合法`);
      for (const n of [`${id}x`, `${id}y`]) {
        assert(!known.has(n), `點 ${id} 與其他變數名稱衝突`);
        known.add(n);
      }
      const point: NonNullable<Interactive['points']>[number] = {
        id,
        x: num(p.x, '點座標'),
        y: num(p.y, '點座標'),
      };
      if (p.label !== undefined) point.label = str(p.label, '點標籤', 20);
      if (p.snap !== undefined) point.snap = num(p.snap, 'snap', 0, 1000);
      if (p.lock !== undefined) {
        assert(['x', 'y'].includes(String(p.lock)), 'lock 只能是 x 或 y');
        point.lock = p.lock as 'x' | 'y';
      }
      for (const k of ['minX', 'maxX', 'minY', 'maxY'] as const)
        if (p[k] !== undefined) point[k] = num(p[k], k);
      if (p.color !== undefined) point.color = str(p.color, '顏色', 20);
      return point;
    });
  }
  assert(Array.isArray(i.shapes) && i.shapes.length <= 80, '圖形最多 80 個');
  out.shapes = i.shapes.map((input) => {
    const s = record(input);
    assert(SHAPES.includes(String(s.type)), `不支援的圖形類型 ${String(s.type)}`);
    const shape: InteractiveShape = { type: s.type as InteractiveShape['type'] };
    // 函數圖形的自變數是 x（不必另外宣告為參數）。
    if (s.expr !== undefined) shape.expr = expression(s.expr, '函數', new Set([...known, 'x']));
    if (s.domain !== undefined) {
      assert(Array.isArray(s.domain) && s.domain.length === 2, 'domain 需要兩個值');
      shape.domain = [expr(s.domain[0], 'domain', known), expr(s.domain[1], 'domain', known)];
    }
    if (s.points !== undefined) {
      assert(Array.isArray(s.points) && s.points.length <= 40, '圖形頂點最多 40 個');
      shape.points = s.points.map((pt) => {
        assert(Array.isArray(pt) && pt.length === 2, '頂點需要 [x, y]');
        return [expr(pt[0], '頂點', known), expr(pt[1], '頂點', known)] as [
          string | number,
          string | number,
        ];
      });
    }
    for (const k of ['x', 'y', 'w', 'h', 'r'] as const)
      if (s[k] !== undefined) shape[k] = expr(s[k], k, known);
    if (s.text !== undefined) {
      shape.text = str(s.text, '圖形文字', 200);
      // $…$ 內是 LaTeX，大括號不一定是運算式；只檢查 $ 外的 {運算式}。
      const outside = shape.text.replace(/\$[^$]+\$/g, '');
      for (const m of outside.matchAll(/\{([^}]+)\}/g)) expression(m[1], '文字運算式', known);
    }
    for (const k of ['color', 'fill'] as const)
      if (s[k] !== undefined) {
        shape[k] = str(s[k], '顏色', 30);
        assert(COLOR.test(shape[k]!) || /^rgba?\([\d\s.,%]+\)$/.test(shape[k]!), '顏色格式不正確');
      }
    if (s.dash !== undefined) shape.dash = s.dash === true;
    if (s.width !== undefined) shape.width = num(s.width, '線寬', 0.5, 20);
    if (s.size !== undefined) shape.size = num(s.size, '字級', 8, 80);
    if (s.show !== undefined) shape.show = expression(s.show, 'show', known);
    if (s.step !== undefined) shape.step = integer(s.step, 0, 20);
    if (s.focus !== undefined) {
      assert(Array.isArray(s.focus) && s.focus.length <= 21, 'focus 必須是步驟編號陣列');
      shape.focus = [...new Set(s.focus.map((n) => integer(n, 0, 20)))];
    }
    if (s.toggle !== undefined) {
      shape.toggle = str(s.toggle, 'toggle', 16, 1);
      assert(
        out.params?.some((p) => p.id === shape.toggle && p.kind === 'toggle'),
        `toggle「${shape.toggle}」必須是 kind: toggle 的參數`,
      );
    }
    return shape;
  });
  if (i.readouts !== undefined) {
    assert(Array.isArray(i.readouts) && i.readouts.length <= 8, '讀數最多 8 個');
    out.readouts = i.readouts.map((input) => {
      const r = record(input);
      const readout: NonNullable<Interactive['readouts']>[number] = {
        label: str(r.label, '讀數名稱', 60, 1),
        expr: expression(r.expr, '讀數', known),
      };
      if (r.digits !== undefined) readout.digits = integer(r.digits, 0, 6);
      return readout;
    });
  }
  if (i.steps !== undefined) out.steps = texts(i.steps, '步驟說明', 20);
  if (i.caption !== undefined) out.caption = str(i.caption, '圖說', 300);
  return out;
}
export function interactiveVariables(i?: Interactive): Set<string> {
  const known = new Set<string>();
  for (const p of i?.params || []) known.add(p.id);
  for (const p of i?.points || []) {
    known.add(`${p.id}x`);
    known.add(`${p.id}y`);
  }
  if (i?.steps?.length) known.add('step');
  return known;
}
function validateRubric(input: unknown): Rubric {
  const r = record(input);
  assert(
    Array.isArray(r.criteria) && r.criteria.length >= 1 && r.criteria.length <= 8,
    '評量規準需要 1–8 個向度',
  );
  const ids = new Set<string>();
  const rubric: Rubric = {
    criteria: r.criteria.map((input) => {
      const c = record(input),
        id = identifier(c.id);
      assert(!ids.has(id), '評量向度 ID 不可重複');
      ids.add(id);
      const points = integer(c.points, 1, 100);
      assert(Array.isArray(c.levels) && c.levels.length >= 2 && c.levels.length <= 6, `向度 ${id} 需要 2–6 個等級`);
      const levels = c.levels.map((l) => {
        const level = record(l);
        return {
          score: integer(level.score, 0, points),
          description: str(level.description, '等級描述', 600, 1),
        };
      });
      assert(levels.some((l) => l.score === points), `向度 ${id} 需要有滿分等級`);
      return { id, label: str(c.label, '向度名稱', 100, 1), points, levels };
    }),
  };
  if (r.reference !== undefined) rubric.reference = str(r.reference, '參考解答', 4000);
  if (r.graderNotes !== undefined) rubric.graderNotes = str(r.graderNotes, '批改提醒', 2000);
  return rubric;
}
const TYPES = ['single', 'multiple', 'scale', 'short', 'numeric', 'canvas', 'manipulate', 'make'];
export function validateActivity(input: unknown, interactive?: Interactive): Activity {
  const a = record(input);
  assert(TYPES.includes(String(a.type)), '不支援的活動類型');
  const out: Activity = {
    id: identifier(a.id),
    type: a.type as Activity['type'],
    prompt: str(a.prompt, '題目', 3000, 1),
  };
  if (out.type === 'single' || out.type === 'multiple') {
    out.options = texts(a.options, '選項', 12);
    assert(out.options.length >= 2, '至少需要兩個選項');
    if (a.correct !== undefined) {
      assert(Array.isArray(a.correct), '答案必須為陣列');
      out.correct = [...new Set(a.correct.map((v) => integer(v, 0, out.options!.length - 1)))];
      assert(out.type !== 'single' || out.correct.length === 1, '單選標準答案應為一個');
    }
  }
  if (out.type === 'scale') {
    out.min = integer(a.min ?? 1, 0, 100);
    out.max = integer(a.max ?? 5, out.min + 1, 100);
    if (a.minLabel !== undefined) out.minLabel = str(a.minLabel, '量尺標籤', 100);
    if (a.maxLabel !== undefined) out.maxLabel = str(a.maxLabel, '量尺標籤', 100);
  }
  if (out.type === 'numeric') {
    if (a.form !== undefined) {
      assert(a.form === 'simplest-radical', 'form 只支援 simplest-radical');
      out.form = 'simplest-radical';
    }
    const checkAnswer = (value: unknown, name: string) => {
      const answer = str(value, name, 60, 1);
      try {
        parseNumberAnswer(answer);
      } catch {
        throw new HttpError(400, `${name}「${answer}」無法解析`);
      }
      assert(
        out.form !== 'simplest-radical' || isSimplestRadical(answer),
        `${name}「${answer}」不是最簡根式，請改寫標準答案`,
      );
      return answer;
    };
    if (a.items !== undefined) {
      assert(
        Array.isArray(a.items) && a.items.length >= 1 && a.items.length <= 3,
        '換數字小題需要 1–3 題',
      );
      out.items = a.items.map((input, i) => {
        const it = record(input);
        const item: NonNullable<Activity['items']>[number] = {
          prompt: str(it.prompt, '小題題目', 300, 1),
          answer: checkAnswer(it.answer, `第 ${i + 1} 小題答案`),
        };
        if (it.tolerance !== undefined) item.tolerance = num(it.tolerance, '容許誤差', 0, 1e6);
        return item;
      });
    } else out.answer = checkAnswer(a.answer, '數值答案');
    if (a.tolerance !== undefined) out.tolerance = num(a.tolerance, '容許誤差', 0, 1e6);
    if (a.unit !== undefined) out.unit = str(a.unit, '單位', 20);
    if (a.practice !== undefined) {
      assert(Array.isArray(a.practice) && a.practice.length >= 1 && a.practice.length <= 5, '補救練習需要 1–5 題');
      out.practice = a.practice.map((input, i) => {
        const p = record(input);
        const q: PracticeQuestion = {
          prompt: str(p.prompt, `補救練習第 ${i + 1} 輪題目`, 300, 1),
          answer: checkAnswer(p.answer, `補救練習第 ${i + 1} 輪答案`),
        };
        if (p.explanation !== undefined) q.explanation = str(p.explanation, '補救練習說明', 300);
        if (p.tolerance !== undefined) q.tolerance = num(p.tolerance, '容許誤差', 0, 1e6);
        return q;
      });
    }
  }
  if (out.type === 'manipulate') {
    assert(interactive, '操作題需要同一頁的 interactive 視覺化');
    const known = interactiveVariables(interactive);
    known.delete('step');
    out.check = expression(a.check, '判斷式', known);
    if (a.record !== undefined) {
      assert(Array.isArray(a.record) && a.record.length <= 16, 'record 必須是陣列');
      out.record = a.record.map((v) => {
        const name = str(v, '記錄變數', 20, 1);
        assert(known.has(name), `record 的變數 ${name} 未定義`);
        return name;
      });
    }
  }
  if (out.type === 'make') {
    // 根式湊數挑戰：每張卡與目標都要是看得懂的數（2√3、3、√(1/2)…）
    const num = (v: unknown, name: string) => {
      const text = str(v, name, 20, 1).trim();
      try {
        parseNumberAnswer(text);
      } catch {
        throw new HttpError(400, `${name}「${text}」不是看得懂的數`);
      }
      return text;
    };
    assert(Array.isArray(a.cards) && a.cards.length >= 2 && a.cards.length <= 6, '湊數挑戰需要 2–6 張數字卡');
    out.cards = a.cards.map((c) => num(c, '數字卡'));
    out.target = num(a.target, '目標數');
  }
  if (out.type === 'canvas') {
    out.canvas = (['blank', 'grid', 'axes', 'dots'].includes(String(a.canvas))
      ? a.canvas
      : 'grid') as Activity['canvas'];
    out.allowPhoto = a.allowPhoto !== false;
  }
  if (a.photoWork !== undefined) {
    assert(out.type === 'numeric', '只有數值題可設定拍照交計算過程');
    const pw = record(a.photoWork),
      n = out.items?.length || 1;
    out.photoWork = {};
    if (pw.items !== undefined) {
      assert(Array.isArray(pw.items) && pw.items.length >= 1 && pw.items.length <= n, '拍照批改的小題格式不正確');
      out.photoWork.items = [...new Set(pw.items.map((i) => integer(i, 0, n - 1)))].sort((x, y) => x - y);
    }
    assert(a.rubric !== undefined, '拍照交計算過程必須事先寫好評量規準（rubric）');
  }
  if (a.rubric !== undefined) {
    assert(['short', 'canvas'].includes(out.type) || out.photoWork, '只有短答、畫布題與可拍照的數值題可設定評量規準');
    out.rubric = validateRubric(a.rubric);
  }
  if (out.type === 'canvas') assert(out.rubric, '畫布題必須事先寫好評量規準（rubric）');
  if (a.explanation !== undefined) out.explanation = str(a.explanation, '解析', 4000);
  out.sensitive = a.sensitive === true;
  out.aiAllowed = a.aiAllowed === true;
  return out;
}
export function validateLesson(input: unknown): Lesson {
  const l = record(input);
  assert(l.schemaVersion === 1, '不支援的課程版本');
  assert(
    Array.isArray(l.slides) && l.slides.length > 0 && l.slides.length <= 60,
    '課程需要 1–60 頁',
  );
  const slideIds = new Set<string>(),
    activityIds = new Set<string>();
  const out: Lesson = {
    schemaVersion: 1,
    id: identifier(l.id),
    title: str(l.title, '課程名稱', 200, 1),
    description: str(l.description ?? '', '描述', 3000),
    subject: str(l.subject ?? '', '科目', 100),
    duration: integer(l.duration ?? 45, 1, 600),
    objectives: texts(l.objectives ?? [], '學習目標'),
    slides: l.slides.map((input, index) => {
      const s = record(input),
        id = identifier(s.id);
      assert(!slideIds.has(id), '投影片 ID 不可重複');
      slideIds.add(id);
      const where = `第 ${index + 1} 頁`;
      try {
        const slide: Lesson['slides'][number] = {
          id,
          title: str(s.title, '投影片標題', 300, 1),
          body: str(s.body ?? '', '內文', 10000),
        };
        for (const field of ['eyebrow', 'notes', 'source', 'customHtml', 'phase'] as const)
          if (s[field] !== undefined)
            slide[field] = str(
              s[field],
              field,
              field === 'customHtml' ? 40000 : field === 'phase' ? 40 : 5000,
            );
        if (s.bullets !== undefined) slide.bullets = texts(s.bullets, '重點');
        if (s.quizPage === true) slide.quizPage = true;
        if (s.raidPage === true) slide.raidPage = true;
        if (s.duelPage === true) slide.duelPage = true;
        if (s.visual !== undefined) {
          assert(
            ['balance', 'steps', 'cards', 'bars'].includes(String(s.visual)),
            '不支援的視覺化',
          );
          slide.visual = s.visual as typeof slide.visual;
        }
        if (s.interactive !== undefined) slide.interactive = validateInteractive(s.interactive);
        if (s.figures !== undefined) {
          assert(Array.isArray(s.figures) && s.figures.length <= 3, '課本截圖每頁最多 3 張');
          slide.figures = s.figures.map((input) => {
            const f = record(input);
            const src = str(f.src, '截圖路徑', 160, 5);
            assert(
              /^[a-z0-9][a-z0-9-]*\/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$/.test(src) && !src.includes('..'),
              `截圖路徑「${src}」格式應為 課程資料夾/檔名.png`,
            );
            const fig: NonNullable<Lesson['slides'][number]['figures']>[number] = {
              src,
              alt: str(f.alt, '截圖說明', 300, 1),
            };
            if (f.caption !== undefined) fig.caption = str(f.caption, '截圖標題', 200);
            return fig;
          });
        }
        if (s.fullSlide === true) {
          assert(slide.figures?.length === 1, '整頁簡報圖（fullSlide）要剛好 1 張 figure');
          assert(!slide.interactive && !slide.customHtml, '整頁簡報圖（fullSlide）不能和 interactive／customHtml 一起用');
          slide.fullSlide = true;
        }
        if (s.animation !== undefined) {
          const a = record(s.animation);
          const asset = (v: unknown, label: string, ext: RegExp) => {
            const p = str(v, label, 160, 5);
            assert(
              /^[a-z0-9][a-z0-9-]*\/anim-[A-Za-z0-9._-]+$/.test(p) && ext.test(p) && !p.includes('..'),
              `${label}「${p}」格式應為 課程資料夾/anim-檔名`,
            );
            return p;
          };
          const anim: NonNullable<Lesson['slides'][number]['animation']> = {
            src: asset(a.src, '動畫路徑', /\.mp4$/),
            caption: str(a.caption, '動畫說明', 200, 1),
          };
          if (a.poster !== undefined) anim.poster = asset(a.poster, '動畫封面', /\.(png|jpe?g|webp)$/);
          if (a.seconds !== undefined) {
            assert(typeof a.seconds === 'number' && a.seconds > 0 && a.seconds <= 600, '動畫秒數不正確');
            anim.seconds = a.seconds;
          }
          if (a.reveal !== undefined) {
            assert(a.reveal === 'after-results' || a.reveal === 'always', '動畫 reveal 只能是 after-results 或 always');
            anim.reveal = a.reveal;
          }
          slide.animation = anim;
        }
        if (s.activity) {
          slide.activity = validateActivity(s.activity, slide.interactive);
          assert(!activityIds.has(slide.activity.id), '活動 ID 不可重複');
          activityIds.add(slide.activity.id);
        }
        return slide;
      } catch (e) {
        if (e instanceof HttpError) throw new HttpError(e.status, `${where}：${e.message}`);
        throw e;
      }
    }),
    updatedAt: new Date().toISOString(),
  };
  if (l.quiz !== undefined) out.quiz = validateQuiz(l.quiz);
  return out;
}
/** 驗證題庫（課程 JSON 的 quiz 欄位）。 */
export function validateQuiz(input: unknown): QuizBank {
  const b = record(input);
  assert(Array.isArray(b.slots) && b.slots.length >= 1 && b.slots.length <= 20, '題庫需要 1–20 個題位');
  return {
    title: str(b.title, '題庫名稱', 100, 1),
    ...(b.source !== undefined ? { source: str(b.source, '題庫來源', 300) } : {}),
    slots: b.slots.map((s) => {
      const slot = record(s);
      assert(Array.isArray(slot.variants) && slot.variants.length >= 1 && slot.variants.length <= 5, '每個題位需要 1–5 題');
      return {
        id: identifier(slot.id),
        topic: str(slot.topic, '題位主題', 100, 1),
        variants: slot.variants.map(quizItem),
      };
    }),
  };
}
/** 一題四選一（形成性評量與魔王戰共用）。 */
function quizItem(v: unknown): QuizItem {
  const it = record(v);
  assert(Array.isArray(it.options) && it.options.length >= 2 && it.options.length <= 6, '每題需要 2–6 個選項');
  const options = it.options.map((o) => str(o, '選項', 300, 1));
  const figure = it.figure === undefined ? undefined : str(it.figure, '附圖', 30000, 10);
  assert(!figure || (/^<svg[\s>]/.test(figure) && !/<script|on\w+\s*=|javascript:|<foreignObject/i.test(figure)), '附圖只能是單純的 SVG');
  return {
    stem: str(it.stem, '題目', 1000, 1),
    ...(figure ? { figure } : {}),
    options,
    answer: integer(it.answer, 0, options.length - 1),
    ...(it.explanation !== undefined ? { explanation: str(it.explanation, '解析', 2000) } : {}),
  };
}
/** 驗證魔王戰題庫（content/raids/<課程 id>.json）：三類題目各至少 10 題，題目 ID 不重複。 */
export function validateRaidBank(input: unknown): RaidBank {
  const b = record(input);
  const p = record(b.pools);
  const seen = new Set<string>();
  const pool = (k: RaidKind) => {
    const list = p[k];
    assert(Array.isArray(list) && list.length >= 10 && list.length <= 1000, `魔王戰「${k}」需要 10–1000 題`);
    return list.map((x) => {
      const it = record(x);
      const id = str(it.id, '題目 ID', 120, 1);
      assert(!seen.has(id), `魔王戰題目 ID「${id}」重複`);
      seen.add(id);
      return { id, topic: str(it.topic, '題型', 100, 1), ...quizItem(it) };
    });
  };
  return {
    hostLesson: identifier(b.hostLesson),
    title: str(b.title, '魔王戰名稱', 100, 1),
    ...(b.section !== undefined ? { section: str(b.section, '單元', 20) } : {}),
    ...(b.source !== undefined ? { source: str(b.source, '題庫來源', 300) } : {}),
    pools: { attack: pool('attack'), shield: pool('shield'), ultimate: pool('ultimate') },
  };
}

/** 步驟格鬥題庫：每一題的每一步要有規則、算式（含空格）、接受的填法與數字卡。 */
export function validateDuelBank(input: unknown): DuelBank {
  const b = record(input);
  const tok = (v: unknown, depth = 0): DuelTok => {
    assert(depth < 8, '算式太深');
    if (typeof v === 'string') return str(v, '算式文字', 20);
    const t = record(v);
    if (t.b !== undefined) return { b: integer(t.b, 0, 11) };
    if (t.r !== undefined) return { r: toks(t.r, depth + 1) };
    assert(Array.isArray(t.f) && t.f.length === 2, '分數格式不正確');
    return { f: [toks(t.f[0], depth + 1), toks(t.f[1], depth + 1)] };
  };
  const toks = (v: unknown, depth = 0): DuelTok[] => {
    assert(Array.isArray(v) && v.length >= 1 && v.length <= 40, '算式格式不正確');
    return v.map((x) => tok(x, depth));
  };
  const num = (v: unknown) => {
    const x = str(v, '數字卡', 12, 1);
    assert(/^-?\d+$/.test(x), `數字卡「${x}」要是整數`);
    return x;
  };
  assert(Array.isArray(b.rules) && b.rules.length >= 2, '步驟格鬥需要規則清單');
  const rules = b.rules.map((r) => {
    const id = str(r, '規則', 20, 1);
    assert(DUEL_RULES[id], `不認得的規則「${id}」`);
    return id;
  });
  assert(Array.isArray(b.problems) && b.problems.length >= 4 && b.problems.length <= 2000, '步驟格鬥需要 4–2000 題');
  const seen = new Set<string>();
  return {
    hostLesson: identifier(b.hostLesson),
    title: str(b.title, '步驟格鬥名稱', 100, 1),
    rules,
    problems: b.problems.map((x) => {
      const p = record(x);
      const id = str(p.id, '題目 ID', 80, 1);
      assert(!seen.has(id), `步驟格鬥題目 ID「${id}」重複`);
      seen.add(id);
      assert(Array.isArray(p.steps) && p.steps.length >= 1 && p.steps.length <= 8, `「${id}」需要 1–8 步`);
      return {
        id,
        family: str(p.family, '題型', 60, 1),
        lesson: str(p.lesson, '堂次', 10, 1),
        start: toks(p.start),
        steps: p.steps.map((y) => {
          const st = record(y);
          const rule = str(st.rule, '規則', 20, 1);
          assert(rules.includes(rule), `「${id}」用了範圍外的規則「${rule}」`);
          const line = toks(st.line);
          const n = duelBlanks(line);
          assert(n >= 1, `「${id}」每一步至少要有一格`);
          assert(Array.isArray(st.fill) && st.fill.length >= 1 && st.fill.length <= 8, `「${id}」需要接受的填法`);
          const fill = st.fill.map((f) => {
            assert(Array.isArray(f) && f.length === n, `「${id}」填法的格數不對`);
            return f.map(num);
          });
          assert(Array.isArray(st.tiles) && st.tiles.length >= 2 && st.tiles.length <= 12, `「${id}」需要 2–12 張數字卡`);
          const tiles = st.tiles.map(num);
          for (const f of fill) for (const x of f) assert(tiles.includes(x), `「${id}」的數字卡少了 ${x}`);
          return { rule, line, fill, tiles };
        }),
      };
    }),
  };
}

/** 畫布／拍照作答：文字說明、圖片、辨識稿。 */
function canvasValue(value: unknown, photoOnly = false): CanvasAnswer {
  const v = record(value),
    out: CanvasAnswer = {};
  if (v.text !== undefined && v.text !== '') out.text = str(v.text, '文字說明', 2000).trim();
  if (v.work !== undefined && v.work !== '') out.work = str(v.work, '辨識稿', 3000).trim();
  if (v.ocr !== undefined && v.ocr !== '') out.ocr = str(v.ocr, 'AI 辨識結果', 3000).trim();
  if (v.imageId !== undefined) out.imageId = identifier(v.imageId);
  if (v.source !== undefined) {
    assert(['draw', 'photo'].includes(String(v.source)), '作答來源不正確');
    out.source = v.source as 'draw' | 'photo';
  }
  assert(out.text || out.imageId, '請在畫布作答、拍照或寫下說明');
  if (photoOnly) assert(out.imageId, '請拍照上傳計算過程');
  return out;
}
export function validateAnswer(a: Activity, value: unknown): AnswerValue {
  if (a.type === 'short') return str(str(value, '短答', 2000, 1).trim(), '短答', 2000, 1);
  if (a.type === 'scale') return integer(value, a.min!, a.max!);
  if (a.type === 'single') return integer(value, 0, a.options!.length - 1);
  if (a.type === 'numeric') {
    // 可拍照的數值題：學生也可以交照片＋辨識稿（AI 批改時讀出答案）
    if (a.photoWork && value && typeof value === 'object' && !Array.isArray(value)) return canvasValue(value, true);
    const one = (v: unknown) => {
      const text = str(v, '數值答案', 60, 1).trim();
      try {
        parseNumberAnswer(text);
      } catch {
        throw new HttpError(400, '請輸入數字、分數或算式，例如 12、-3/4、2√3');
      }
      return text;
    };
    if (a.items) {
      assert(
        Array.isArray(value) && value.length === a.items.length,
        `請完成全部 ${a.items.length} 小題`,
      );
      return value.map(one);
    }
    return one(value);
  }
  if (a.type === 'canvas') return canvasValue(value);
  if (a.type === 'make') {
    // 每張卡都要用到、算式完整才能送出（湊不湊得到目標由 judge 判定）
    const text = str(value, '算式', 200, 1).replace(/\s+/g, '');
    const r = makeCheck(text, a.cards || [], a.target || '0');
    assert(r.complete && !r.error, r.error || '算式還沒完成');
    return text;
  }
  if (a.type === 'manipulate') {
    const v = record(record(value).vars);
    const entries = Object.entries(v);
    assert(entries.length >= 1 && entries.length <= 24, '操作結果格式不正確');
    const vars: Record<string, number> = {};
    for (const [k, n] of entries) {
      assert(/^[A-Za-z][A-Za-z0-9]{0,15}$/.test(k), '操作變數名稱不正確');
      vars[k] = num(n, '操作數值');
    }
    return { vars };
  }
  assert(
    Array.isArray(value) && value.length > 0 && value.length <= a.options!.length,
    '請至少選一個答案',
  );
  return [...new Set(value.map((v) => integer(v, 0, a.options!.length - 1)))].sort((a, b) => a - b);
}
/** 伺服器判定 numeric／manipulate 的對錯；其他題型回傳 undefined。 */
function numericVerdict(
  a: Activity,
  given: string,
  answer: string,
  tolerance = 0,
): { ok: boolean; note?: string } {
  const got = parseNumberAnswer(given),
    want = parseNumberAnswer(answer),
    tol = Math.max(tolerance, 1e-9 * Math.max(1, Math.abs(want)));
  if (Math.abs(got - want) > tol) return { ok: false };
  if (a.form === 'simplest-radical' && !isSimplestRadical(given))
    return { ok: false, note: '數值正確，但還沒化成最簡根式' };
  return { ok: true };
}
/** 補救練習第 round 輪的對錯（沿用這一題的 form、tolerance）。 */
/** 原題再做一次：用原題第 item 小題的答案判定。 */
export function judgeOriginal(a: Activity, item: number, value: string): boolean {
  const it = a.items?.[item];
  try {
    return numericVerdict(a, value, it ? it.answer : a.answer || '', it?.tolerance ?? a.tolerance).ok;
  } catch {
    return false;
  }
}
export function judgePractice(a: Activity, round: number, value: string): boolean {
  const q = a.practice?.[round];
  if (!q) return false;
  try {
    return numericVerdict(a, value, q.answer, q.tolerance ?? a.tolerance).ok;
  } catch {
    return false;
  }
}
/** 拍照作答要批改（讀答案）的小題。 */
export function photoItems(a: Activity): number[] {
  const n = a.items?.length || 1;
  return a.photoWork?.items?.filter((i) => i < n) ?? Array.from({ length: n }, (_, i) => i);
}
/**
 * 拍照交的數值題：用 AI 讀到的最後答案判定對錯（和直接送答案同一套判定）。
 * 照片沒有批改的小題算未作答（不計入答對）。
 */
export function judgePhotoFinals(
  a: Activity,
  finals: string[],
): { correct: boolean; itemsCorrect?: boolean[]; note?: string } {
  const pick = photoItems(a),
    notes: string[] = [];
  const verdict = (i: number) => {
    const k = pick.indexOf(i),
      given = (finals[k] || '').replace(/−/g, '-').trim();
    if (k < 0 || !given) return false;
    try {
      const it = a.items?.[i];
      const r = numericVerdict(a, given, it ? it.answer : a.answer || '', it?.tolerance ?? a.tolerance);
      if (r.note) notes.push(a.items ? `第 ${i + 1} 小題${r.note}` : r.note);
      return r.ok;
    } catch {
      return false;
    }
  };
  const results = a.items ? a.items.map((_, i) => verdict(i)) : [verdict(0)];
  return {
    correct: pick.every((i) => results[i]),
    ...(a.items ? { itemsCorrect: results } : {}),
    ...(notes.length ? { note: notes.join('；') } : {}),
  };
}
/** numeric 的詳細判定（含多小題與最簡根式說明）。 */
export function judgeNumeric(
  a: Activity,
  value: AnswerValue,
): { correct: boolean; itemsCorrect?: boolean[]; note?: string } | undefined {
  if (a.type !== 'numeric') return undefined;
  if (a.items && Array.isArray(value)) {
    const results = a.items.map((it, i) =>
      numericVerdict(a, String(value[i]), it.answer, it.tolerance ?? a.tolerance),
    );
    const notes = results.map((r, i) => (r.note ? `第 ${i + 1} 小題${r.note}` : '')).filter(Boolean);
    return {
      correct: results.every((r) => r.ok),
      itemsCorrect: results.map((r) => r.ok),
      ...(notes.length ? { note: notes.join('；') } : {}),
    };
  }
  if (typeof value === 'string' && a.answer) {
    const r = numericVerdict(a, value, a.answer, a.tolerance);
    return { correct: r.ok, ...(r.note ? { note: r.note } : {}) };
  }
  return undefined;
}
export function judge(a: Activity, value: AnswerValue): boolean | undefined {
  if (a.type === 'numeric') return judgeNumeric(a, value)?.correct;
  if (a.type === 'make' && typeof value === 'string') return makeCheck(value, a.cards || [], a.target || '0').ok;
  if (a.type === 'manipulate' && a.check && value && typeof value === 'object' && 'vars' in value) {
    try {
      return !!evaluate(a.check, value.vars);
    } catch {
      return false;
    }
  }
  if (a.type === 'single' && a.correct && typeof value === 'number') return a.correct[0] === value;
  if (a.type === 'multiple' && a.correct && Array.isArray(value))
    return (
      [...a.correct].sort((x, y) => x - y).join(',') ===
      [...(value as number[])].sort((x, y) => x - y).join(',')
    );
  return undefined;
}
export function validateStrokes(value: unknown): Stroke[] {
  assert(Array.isArray(value) && value.length <= 200, '每頁最多 200 筆畫');
  return value.map((input) => {
    const s = record(input),
      color = str(s.color, '筆色', 20);
    assert(/^#[\da-f]{3,8}$/i.test(color), '筆色格式不正確');
    assert(typeof s.width === 'number' && s.width >= 0.1 && s.width <= 30, '筆寬格式不正確');
    assert(Array.isArray(s.points) && s.points.length <= 1000, '每筆最多 1000 點');
    return {
      id: identifier(s.id),
      color,
      width: Math.round(s.width * 100) / 100,
      points: s.points.map((input) => {
        const p = record(input);
        assert(
          typeof p.x === 'number' &&
            typeof p.y === 'number' &&
            Number.isFinite(p.x) &&
            Number.isFinite(p.y) &&
            p.x >= 0 &&
            p.x <= 1 &&
            p.y >= 0 &&
            p.y <= 1,
          '白板座標必須是 0–1',
        );
        // 存到小數第 4 位（4K 螢幕上不到半個像素），資料量約少一半
        return { x: Math.round(p.x * 1e4) / 1e4, y: Math.round(p.y * 1e4) / 1e4 };
      }),
    };
  });
}
