r"""課後形成性評量題庫的共用工具：出題、SymPy 核算、匯出 content/quizzes/<課程 id>.json。

每一題的題目文字與正確答案都由同一組數字產生（避免題目和答案對不起來），匯出前全部核算：
- value：正確選項要等於題目的值，錯誤選項都不能等於；四個選項的值互不相同。
- form：最簡根式的題目。正確選項要等於題目的值而且是最簡根式；
  錯誤選項要嘛值不同，要嘛值相同但不是最簡根式（例如 √24、4/√2）。
- statement：「哪一個正確」。每個敘述用 SymPy 判斷真假，必須剛好一個為真。
- relation：比較大小。正確選項依兩數的真實大小產生。
第 1 個選項是正確答案（派題時伺服器會打亂選項順序）。
"""
import json
from math import gcd
from pathlib import Path

from sympy import Rational, factorint, nsimplify, simplify, sqrt

S = sqrt
R = Rational
ROOT = Path(__file__).resolve().parents[2]


# ───────── 根式的 LaTeX ─────────
def rad(coef, n, den=1):
    """coef√n / den 的 (LaTeX, 值, 是否最簡根式)。coef、den 為整數（den > 0）。"""
    v = R(coef, den) * (S(n) if n != 1 else 1)
    root = '' if n == 1 else rf'\sqrt{{{n}}}'
    if n == 1:
        body = str(abs(coef))
    else:
        body = ('' if abs(coef) == 1 else str(abs(coef))) + root
    sign = '-' if coef < 0 else ''
    tex = f'{sign}{body}' if den == 1 else rf'{sign}\dfrac{{{body}}}{{{den}}}'
    squarefree = n == 1 or all(e == 1 for e in factorint(n).values())
    simplest = squarefree and den > 0 and gcd(abs(coef), den) == 1
    return (f'${tex}$', v, simplest)


def raw(tex, v, simplest=True):
    """自己寫的選項：(LaTeX, 值, 是否最簡)。tex 不含 $ 時自動加上。"""
    return (tex if tex.startswith('$') or not any(c in tex for c in '\\^_{') else f'${tex}$', v, simplest)


def txt(text, v=None, simplest=True):
    """純文字選項（例如「無法比較」）。"""
    return (text, v, simplest)


# ───────── 題型 ─────────
def value(stem, expect, options, explanation):
    return dict(kind='value', stem=stem, expect=expect, options=options, explanation=explanation)


def form(stem, expect, options, explanation):
    return dict(kind='form', stem=stem, expect=expect, options=options, explanation=explanation)


def statement(stem, options, explanation):
    """options：[(LaTeX 敘述, 左式, 右式) 或 (敘述, 真假)…]，第一個是唯一正確的。"""
    return dict(kind='statement', stem=stem, options=options, explanation=explanation)


def relation(stem, a, b, texts, explanation):
    """texts＝[>, <, =, 第四個選項] 的敘述，依 a、b 的真實大小決定正確的是哪一個並移到第一個。"""
    truth = '>' if a > b else '<' if a < b else '='
    k = {'>': 0, '<': 1, '=': 2}[truth]
    opts = [texts[k]] + [t for i, t in enumerate(texts) if i != k]
    return dict(kind='relation', stem=stem, options=[(t, None, True) for t in opts], explanation=explanation, a=a, b=b)


def _eq(x, y):
    return simplify(nsimplify(x) - nsimplify(y)) == 0


def check(slots):
    assert len(slots) == 10, f'需要 10 個題位，現在 {len(slots)} 個'
    for slot in slots:
        assert len(slot['variants']) == 3, slot['id']
        for k, v in enumerate(slot['variants'], 1):
            where = f"{slot['id']}-{k}（{slot['topic']}）"
            texts = [o[0] for o in v['options']]
            assert len(texts) == 4 and len(set(texts)) == 4, f'{where}：要有 4 個不同的選項 {texts}'
            if v['kind'] == 'value':
                vals = [o[1] for o in v['options']]
                assert _eq(vals[0], v['expect']), f'{where}：正確選項 {texts[0]} 不等於題目的值 {v["expect"]}'
                for t, x in zip(texts[1:], vals[1:]):
                    assert not _eq(x, v['expect']), f'{where}：錯誤選項 {t} 其實也等於答案'
                for i in range(4):
                    for j in range(i + 1, 4):
                        assert not _eq(vals[i], vals[j]), f'{where}：{texts[i]} 和 {texts[j]} 的值相同'
            elif v['kind'] == 'form':
                t0, v0, s0 = v['options'][0]
                assert _eq(v0, v['expect']) and s0, f'{where}：正確選項 {t0} 要等於答案而且是最簡根式'
                for t, x, s in v['options'][1:]:
                    assert not _eq(x, v['expect']) or not s, f'{where}：錯誤選項 {t} 也是答案的最簡根式'
            elif v['kind'] == 'statement':
                truth = [(_eq(o[1], o[2]) if len(o) == 3 else bool(o[1])) for o in v['options']]
                assert truth == [True, False, False, False], f'{where}：正確敘述必須剛好一個（{truth}）'
            elif v['kind'] == 'relation':
                assert not _eq(v['a'], v['b']) or texts[0].count('=') == 1, f'{where}：大小關係'


def export(lesson_id, title, source, slots):
    check(slots)
    out = dict(
        lessonId=lesson_id,
        title=title,
        source=source,
        slots=[dict(id=s['id'], topic=s['topic'],
                    variants=[dict(stem=v['stem'], **({'figure': v['figure']} if v.get('figure') else {}), options=[o[0] for o in v['options']], answer=0, explanation=v['explanation'])
                              for v in s['variants']])
               for s in slots],
    )
    path = ROOT / 'content/quizzes' / f'{lesson_id}.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(f'✓ {lesson_id}：{len(slots)} 個題位 × 3 題，全部核算通過 → {path.name}')


def with_figure(item, svg):
    """給題目加上附圖（SVG 文字）。"""
    item['figure'] = svg
    return item


def slot(i, topic, variants):
    return dict(id=f'q{i}', topic=topic, variants=variants)
