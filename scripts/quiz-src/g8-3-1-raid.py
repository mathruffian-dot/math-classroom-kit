r"""3-1 提公因式與乘法公式作因式分解：魔王戰題庫（三類題目＋分析題，全部用 SymPy 核算）。

用法：C:\AI\H3\venv\Scripts\python.exe -B -X utf8 scripts/quiz-src/g8-3-1-raid.py
掛在這一節最後一堂（3-1(4)）後面，放在 g8-3-1d 的最後。
範圍：3-1(1)～(4) 全部（因式與倍式、提公因式、補 1 與變號、平方差與完全平方），加上先備 1 章乘法公式與多項式除法；
不用後面的單元（十字交乘、配方法、一元二次方程式）；不用餘式定理、綜合除法。
三類題目（學生自己選要做哪一類）：
- attack（記憶）：普通攻擊。一步就能填完的基本分解（餘式、提單項公因式、公式的 □）。
- shield（理解）：防護罩。判斷因式／倍式、哪一個分解正確、用哪一個公式、提完整了嗎、變號的改寫。
- ultimate（應用）：大招。多步驟（補 1＋變號、括號當一塊）、先提公因式再用公式、速算、完全平方求係數、面積。
- analysis（分析）：破盾題。找錯步驟、判斷＋理由。
題庫＝四堂課後檢核題（依類型分配）＋新增換數字題與較難應用題／分析題。
因式分解的答案是代數式，iPad 不能打字：一律四選一（□ 填數字，或選出正確的式子）。
"""
import importlib.util
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import expand  # noqa: E402

from fac import L, ident, lin, n, npick, par, pt, x, y  # noqa: E402
from geom import YELLOW, Fig  # noqa: E402
from quizlib import ROOT, check_item, item_json, statement, value, with_figure  # noqa: E402

HERE = Path(__file__).parent


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), HERE / f'{name}.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


A, B, C, D = load('g8-3-1a'), load('g8-3-1b'), load('g8-3-1c'), load('g8-3-1d')
LESSON_MOD = {'g8-3-1a': A, 'g8-3-1b': B, 'g8-3-1c': C, 'g8-3-1d': D}

# 課後檢核依類型分配（記憶／理解／應用）；每個題位剛好出現在一類
FROM_LESSONS = {
    'g8-3-1a': {
        'attack': ['q1', 'q3', 'q8'],
        'shield': ['q2', 'q4', 'q5', 'q6', 'q9'],
        'ultimate': ['q7', 'q10'],
    },
    'g8-3-1b': {
        'attack': ['q1', 'q2', 'q6'],
        'shield': ['q5', 'q7', 'q9'],
        'ultimate': ['q3', 'q4', 'q8', 'q10'],
    },
    'g8-3-1c': {
        'attack': ['q1', 'q2', 'q6'],
        'shield': ['q4', 'q5', 'q9'],
        'ultimate': ['q3', 'q7', 'q8', 'q10'],
    },
    'g8-3-1d': {
        'attack': ['q1', 'q2', 'q5', 'q6', 'q7'],
        'shield': ['q8', 'q9', 'q10'],
        'ultimate': ['q3', 'q4'],
    },
}


# ───────── 新增：攻擊（換數字） ─────────
def new_attack():
    items = []
    for args in [(1, 4, 7, 1), (1, -2, -5, 3), (3, 2, 1, -1), (1, 6, 3, -2)]:
        items.append(('直式除法求餘式', A.remainder(*args)))
    for args in [(4, -3), (-2, -5), (6, 1)]:
        items.append(('整除時的商式（另一個因式）', A.monic_quot(*args)))
    for args in [(4, -10), (9, 6), (15, 10), (12, -18)]:
        items.append(('提單項公因式：括號內的常數', B.mono_box(*args)))
    for args in [(1, 3, -2, 5), (3, 2, 7, 4), (1, 4, 1, 9)]:
        items.append(('公因式是一整個括號（相加）', B.bracket_plus(*args)))
    for args in [(1, 4, 2, -3), (2, -4, 1, 6), (3, 1, 1, -7)]:
        items.append(('補上隱形的 1（相加）', C.plus_one(*args)))
    for args in [(1, 5, 2, -1), (5, 3, 1, -6)]:
        items.append(('補上隱形的 1（相減）', C.minus_one(*args)))
    for args in [(2, 5, 4), (6, 1, 3), (3, 7, 5)]:
        items.append(('先變號再提公因式', C.flip_extract(*args)))
    for b in (4, 8, 10, 11):
        items.append(('平方差：x²−b²', D.diff_sq(b)))
    for args in [(4, 3), (6, 5), (7, 2)]:
        items.append(('平方差：係數也是平方', D.diff_sq_coef(*args)))
    for b in (7, 8, 4):
        items.append(('和的平方：x²＋2bx＋b²', D.sum_sq(b)))
    for args in [(2, 5), (6, 1), (3, 5)]:
        items.append(('和的平方：首項有係數', D.sum_sq_coef(*args)))
    for args in [(1, 7, 'b'), (2, 5, 'a'), (4, 3, 'a'), (1, 9, 'b')]:
        items.append(('差的平方', D.diff_square(*args)))
    return items


# ───────── 新增：防護罩 ─────────
def new_shield():
    items = []
    items.append(('用除法判別哪一個是因式', A.which_factor(x**2 + x - 20, x + 5, [x - 5, x + 4, x - 20])))
    items.append(('用除法判別哪一個是因式', A.which_factor(3 * x**2 - 5 * x - 2, 3 * x + 1, [3 * x - 1, x + 2, x - 1])))
    items.append(('由 A＝B×C 說出因式與倍式', A.fm_words(x + 6, x - 2, 'factor')))
    items.append(('由 A＝B×C 說出因式與倍式', A.fm_words(2 * x + 1, x - 3, 'multiple')))
    for args in [(3, -1, 2), (-1, 5, -3)]:
        items.append(('餘式不是 0：不是因式', A.nonzero_rem(*args)))
    for args in [(18, 12), (15, -20), (6, 8)]:
        items.append(('公因式要提完整', B.complete(*args)))
    for args in [(10, 15), (16, -24), (21, 14)]:
        items.append(('找出兩項的公因式（單項式）', B.gcf_mono(*args)))
    items.append(('找出兩個乘積的公因式', B.poly_gcf(x + 7, 2 * x - 3, x - 1, [('x+7', x + 7), ('x-1', x - 1), ('2x', 2 * x)])))
    items.append(('找出兩個乘積的公因式', B.poly_gcf(3 * x - 1, x + 4, x - 4, [('3x-1', 3 * x - 1), ('x-4', x - 4), ('(3x-1)(x-4)', (3 * x - 1) * (x - 4))])))
    for args in [(3, 5, 2), (6, 4, 1)]:
        items.append(('一次方變號：多一個負號', C.flip_one(*args)))
    for args in [(4, 3), (9, 2)]:
        items.append(('平方後負號消失', C.flip_square(*args)))
    for args in [(3, 4, 2), (5, 2, 7)]:
        items.append(('選出正確的變號改寫', C.rewrite(*args)))
    for P in (25 * x**2 - 10 * x + 1, x**2 - 64, 4 * x**2 + 20 * x + 25, 16 * x**2 - 49):
        items.append(('判斷用哪一個公式', D.which_formula(P)))
    items.append(('中間項對得上：完全平方', D.which_square([x**2 - 8 * x + 16, x**2 - 4 * x + 16, x**2 - 16, x**2 - 8 * x - 16])))
    items.append(('中間項對得上：完全平方', D.which_square([25 * x**2 + 20 * x + 4, 25 * x**2 + 10 * x + 4, 25 * x**2 - 4, 25 * x**2 + 20 * x - 4])))
    items.append(('中間項對得上：完全平方', D.which_square([x**2 + 14 * x + 49, x**2 + 7 * x + 49, x**2 + 49, x**2 - 14 * x - 49])))
    items.append(('常見錯誤：哪一個分解正確', D.which_right([
        (9 * x**2 - 6 * x + 1, '(3x-1)^2', (3 * x - 1)**2), (9 * x**2 - 6 * x + 1, '(6x-1)^2', (6 * x - 1)**2),
        (x**2 - 4, '(x-2)^2', (x - 2)**2), (x**2 + 10 * x + 25, '(x+10)^2', (x + 10)**2)])))
    items.append(('常見錯誤：哪一個分解正確', D.which_right([
        (4 * x**2 - 9, '(2x+3)(2x-3)', (2 * x + 3) * (2 * x - 3)), (4 * x**2 - 9, '(4x+3)(4x-3)', (4 * x + 3) * (4 * x - 3)),
        (x**2 + 9, '(x+3)(x-3)', (x + 3) * (x - 3)), (x**2 - 6 * x + 9, '(x+3)^2', (x + 3)**2)])))
    items.append(('展開檢查：哪一個提公因式正確', B.which_right([
        (8 * x**2 + 12 * x, '4x(2x+3)', 4 * x * (2 * x + 3)), (6 * x**2 - 3 * x, '3x(2x-3)', 3 * x * (2 * x - 3)),
        (5 * x**2 + 5 * x, '5x(x+5)', 5 * x * (x + 5)), (x**2 - 7 * x, 'x(x+7)', x * (x + 7))])))
    items.append(('展開檢查：哪一個提公因式正確', B.which_right([
        (14 * x**2 - 21 * x, '7x(2x-3)', 7 * x * (2 * x - 3)), (9 * x**2 + 3 * x, '3x(3x)', 3 * x * (3 * x)),
        (4 * x**2 - 8 * x, '4x(x-8)', 4 * x * (x - 8)), (10 * x**2 + 4 * x, '2x(5x+4)', 2 * x * (5 * x + 4))])))
    # 先提公因式還是先用公式：哪一個分解到底了
    for k, b in [(2, 3), (3, 4), (5, 2)]:
        P = k * x**2 - k * b * b
        full = f'{k}(x+{b})(x-{b})'
        items.append(('提公因式後再用公式：分解到底', statement(
            rf'${pt(P)}$ 分解到底（因式不能再分解），是哪一個？',
            [(f'${full}$', True),
             (f'${k}(x^2-{b * b})$', False),
             (f'$({k}x+{b})({k}x-{b})$', expand((k * x + b) * (k * x - b)) - P == 0),
             (f'${k}(x-{b})^2$', expand(k * (x - b)**2) - P == 0)],
            rf'先提出公因式 ${k}$：${pt(P)}={k}(x^2-{b * b})$，括號內還能用平方差：$={full}$。${k}(x^2-{b * b})$ 沒有分解完。')))
        ident(P, k * (x + b) * (x - b))
    return items


# ───────── 新增：大招 ─────────
def gcf_formula(k, kind, b):
    """k·(公式) 先提公因式 k 再用公式；□ 填 b。kind：'diff'、'sum'、'minus'。"""
    if kind == 'diff':
        P = k * (x**2 - b * b)
        tex, rhs = rf'{k}(x+{b})(x-\square)', k * (x + b) * (x - b)
        expl = rf'先提出 ${k}$：${pt(P)}={k}(x^2-{b * b})={k}(x+{b})(x-{b})$。'
        cands = [b * b, k * b, -b, b + 1]
    elif kind == 'sum':
        P = k * (x + b)**2
        tex, rhs = rf'{k}(x+\square)^2', P
        expl = rf'先提出 ${k}$：${pt(P)}={k}({pt((x + b)**2)})={k}(x+{b})^2$。'
        cands = [2 * b, b * b, k * b, b + 1]
    else:
        P = k * (x - b)**2
        tex, rhs = rf'{k}(x-\square)^2', P
        expl = rf'先提出 ${k}$：${pt(P)}={k}({pt((x - b)**2)})={k}(x-{b})^2$。'
        cands = [2 * b, b * b, k * b, -b]
    ident(P, rhs)
    return value(rf'${pt(P)}={tex}$，□ 是多少？', b, npick(b, cands), expl + '因式分解前先看有沒有公因式。')


def quick_diff(a, b):
    """a²−b²＝(a＋b)(a−b) 速算。"""
    v = a * a - b * b
    return value(
        rf'利用因式分解計算 ${a}^2-{b}^2$ 的值。',
        v,
        npick(v, [(a - b)**2, a * a - b, (a + b)**2, 2 * a * (a - b)]),
        rf'${a}^2-{b}^2=({a}+{b})({a}-{b})={a + b}\times{a - b}={v}$。')


def quick_square(a, b, sign):
    """a²±2ab＋b²＝(a±b)² 速算。"""
    s = a + b if sign > 0 else a - b
    v = s * s
    op = '+' if sign > 0 else '-'
    return value(
        rf'利用因式分解計算 ${a}^2{op}2\times{a}\times{b}+{b}^2$ 的值。',
        v,
        npick(v, [a * a + b * b, (a - b)**2 if sign > 0 else (a + b)**2, s * 2, v + 2 * a * b]),
        rf'這是 $a^2{op}2ab+b^2=(a{op}b)^2$：原式 $=({a}{op}{b})^2={s}^2={v}$。')


def square_coef(kind, a, b):
    """完全平方求係數：kind＝'mid'（中間項係數，正值）、'const'（常數項）、'lead'（首項係數）。"""
    if kind == 'mid':
        stem = rf'若 ${a * a if a != 1 else ""}x^2+kx+{b * b}$ 可以寫成 $({lin(a, b)})^2$，$k$ 是多少？'
        ans, cands = 2 * a * b, [a * b, b * b, a * a + b * b, 4 * a * b]
        expl = rf'$({lin(a, b)})^2={pt((a * x + b)**2)}$，中間項 $2\times {lin(a, 0)}\times{b}={2 * a * b}x$，$k={2 * a * b}$。'
    elif kind == 'const':
        stem = rf'若 ${pt(a * a * x**2 - 2 * a * b * x)}+c$ 是完全平方式，常數 $c$ 是多少？'
        ans, cands = b * b, [2 * b, b, 2 * a * b, (2 * a * b)**2]
        expl = (rf'${a * a}x^2=({lin(a, 0)})^2$，' if a != 1 else '') + rf'中間項 $-{2 * a * b}x=-2\times {lin(a, 0)}\times{b}$，所以 $b={b}$，$c={b}^2={b * b}$：$({lin(a, -b)})^2$。'
    else:
        stem = rf'若 $mx^2+{2 * a * b}x+{b * b}$ 可以寫成 $(\square x+{b})^2$，$m$ 是多少？'
        ans, cands = a * a, [a, 2 * a * b, (2 * a * b)**2, 2 * a * a]
        expl = rf'中間項 ${2 * a * b}x=2\times\square x\times{b}$，所以 □＝${a}$，$m={a}^2={a * a}$：$({lin(a, b)})^2$。'
    return value(stem, ans, npick(ans, cands), expl)


def sum_diff(s, d):
    """已知 a＋b、a−b，求 a²−b²。"""
    v = s * d
    return value(
        rf'已知 $a+b={s}$、$a-b={d}$，$a^2-b^2$ 是多少？',
        v,
        npick(v, [s * s - d * d, s + d, s * s, d * d]),
        rf'$a^2-b^2=(a+b)(a-b)={s}\times{d}={v}$，不用先求 $a$、$b$。')


def known_diff(v, s):
    """已知 a²−b²、a＋b，求 a−b。"""
    d = v // s
    assert d * s == v
    return value(
        rf'已知 $a^2-b^2={v}$、$a+b={s}$，$a-b$ 是多少？',
        d,
        npick(d, [v - s, s - d, v // 2, d * d]),
        rf'$a^2-b^2=(a+b)(a-b)$：${v}={s}\times(a-b)$，$a-b={d}$。')


def value_at(xv, kind, b):
    """x 代入前先因式分解：kind＝'sum'：x²＋2bx＋b²；'minus'：x²−2bx＋b²；'diff'：x²−b²。"""
    if kind == 'sum':
        P, f, ftex = (x + b)**2, xv + b, rf'(x+{b})^2'
        v = f * f
        cands = [xv * xv + b * b, (xv - b)**2, v + 2 * b, f * 10]
    elif kind == 'minus':
        P, f, ftex = (x - b)**2, xv - b, rf'(x-{b})^2'
        v = f * f
        cands = [xv * xv + b * b, (xv + b)**2, v - 2 * b, f * 10]
    else:
        P, ftex = x**2 - b * b, rf'(x+{b})(x-{b})'
        v = (xv + b) * (xv - b)
        cands = [(xv - b)**2, xv * xv - b, v + b * b, (xv + b)**2]
    assert P.subs(x, xv) == v
    return value(
        rf'當 $x={xv}$ 時，${pt(P)}$ 的值是多少？（先因式分解再代入）',
        v,
        npick(v, cands),
        rf'${pt(P)}={ftex}$，代入 $x={xv}$：' + (rf'$({f})^2={v}$。' if kind != 'diff' else rf'$({xv + b})({xv - b})={v}$。'))


def square_fig(area_lab):
    f = Fig(440, 230, pad=40)
    A_, B_, C_, D_ = f.pt('', 0, 0, False), f.pt('', 4, 0, False), f.pt('', 4, 4, False), f.pt('', 0, 4, False)
    f.poly([A_, B_, C_, D_], fill=YELLOW)
    f.side(D_, C_, '?')
    f.text(2, 1.8, area_lab, 18)
    return f.svg()


def square_side(a, b, wrongs):
    S = expand((a * x + b)**2)
    opts = [(f'${lin(a, b)}$', L(a, b)**2, S)] + [(f'${t}$', e**2, S) for t, e in wrongs]
    return with_figure(statement(
        rf'如圖，正方形的面積是 ${pt(S)}$。已知 $x>0$，邊長是多少？（圖不按比例）',
        opts,
        rf'${pt(S)}=({lin(a, b)})^2$（首尾是平方、中間項是 $2ab$），邊長是 ${lin(a, b)}$。'),
        square_fig(B.sup(pt(S))))


def rect_fig2(w_lab, l_lab, area_lab):
    """長方形：左邊標寬、上邊標長。"""
    f = Fig(440, 230, pad=46)
    A_, B_, C_, D_ = f.pt('', 0, 0, False), f.pt('', 7, 0, False), f.pt('', 7, 3.2, False), f.pt('', 0, 3.2, False)
    f.poly([A_, B_, C_, D_], fill=YELLOW)
    f.side(A_, D_, w_lab)
    f.side(D_, C_, l_lab)
    f.text(3.5, 1.45, area_lab, 18)
    return f.svg()


def rect_width(b, wrongs):
    S = x**2 - b * b
    opts = [(f'${lin(1, -b)}$', (x + b) * (x - b), S)] + [(f'${t}$', (x + b) * e, S) for t, e in wrongs]
    return with_figure(statement(
        rf'如圖，長方形的面積是 ${pt(S)}$，長是 ${lin(1, b)}$，寬是多少？（圖不按比例）',
        opts,
        rf'${pt(S)}=(x+{b})(x-{b})$（平方差），長 $x+{b}$，寬 $x-{b}$。'),
        rect_fig2('?', lin(1, b), B.sup(pt(S))))


def new_ultimate():
    items = []
    for args in [(2, 3, 3, -1), (3, -2, 2, 5), (5, 1, 1, -2)]:
        items.append(('首項係數不是 1 的除法', A.lead_quot(*args)))
    items.append(('判別後寫成兩個一次式相乘', A.factor_after(4, -3, [(1, 3), (1, -4), (1, -12)])))
    items.append(('判別後寫成兩個一次式相乘', A.factor_after(-5, 2, [(1, -2), (1, 5), (1, -10)])))
    items.append(('判別後寫成兩個一次式相乘', A.factor_after(6, -1, [(1, 1), (1, -6), (1, 5)])))
    for args in [(2, 5, -3), (6, 1, -5), (4, 5, -2)]:
        items.append(('提出 x 後括號內合併', B.combine_inside(*args)))
    for args in [(6, 5, 1, 2), (8, -1, 3, 3), (5, -2, 3, 1)]:
        items.append(('括號前是減號：每一項都變號', B.minus_bracket(*args)))
    for args in [(3, 1, 4, 8), (6, 3, -2, 5), (2, 4, 1, 7)]:
        items.append(('公因式是一整個括號（相減）', B.bracket_minus(*args)))
    items.append(('長方形面積求長', B.rect_len(4, 1, -3, [(1, -12), (4, -3), (1, 3)])))
    items.append(('長方形面積求長', B.rect_len(6, 2, 1, [(2, 6), (12, 1), (2, -1)])))
    items.append(('長方形面積求長', B.rect_len(2, 5, 4, [(5, 8), (10, 4), (5, 2)])))
    for args in [(3, 4, 1, -2, 1, 1), (5, 2, 2, -1, 2, -3), (4, -3, 1, 6, 1, 2)]:
        items.append(('公因式位置不同：中括號與變號', C.swap_minus(*args)))
    for args in [(1, 3, 5, 2, -1), (2, -1, 3, 1, 5), (3, 2, 2, 2, -5)]:
        items.append(('兩個負號相乘變加號', C.double_neg(*args)))
    for args in [(2, 3, 1, 1, -1), (3, 2, 2, -1, 1), (1, 5, 3, 2, 1)]:
        items.append(('平方項變號後提公因式', C.square_extract(*args)))
    items.append(('補 1、變號綜合：完整的結果', C.mixed(
        (x - 2) * (3 * x + 1) + (2 - x), '(x-2)(3x+1)+(2-x)', ('(x-2)\\cdot 3x', (x - 2) * 3 * x),
        [('(x-2)(3x+2)', (x - 2) * (3 * x + 2)), ('(x-2)(3x+1)', (x - 2) * (3 * x + 1)), ('(x-2)(3x-1)', (x - 2) * (3 * x - 1))],
        r'$2-x=-(x-2)$：原式 $=(x-2)[(3x+1)-1]=(x-2)\cdot3x=3x(x-2)$。')))
    items.append(('補 1、變號綜合：完整的結果', C.mixed(
        (2 * x + 1)**2 - (2 * x + 1), '(2x+1)^2-(2x+1)', ('2x(2x+1)', 2 * x * (2 * x + 1)),
        [('(2x+1)^2', (2 * x + 1)**2), ('(2x+1)(2x+2)', (2 * x + 1) * (2 * x + 2)), ('-(2x+1)', -(2 * x + 1))],
        r'第二項是 $1\times(2x+1)$：原式 $=(2x+1)[(2x+1)-1]=(2x+1)\cdot2x=2x(2x+1)$。')))
    items.append(('補 1、變號綜合：完整的結果', C.mixed(
        (3 - x)**2 + 2 * (x - 3), '(3-x)^2+2(x-3)', ('(x-3)(x-1)', (x - 3) * (x - 1)),
        [('(x-3)(x+1)', (x - 3) * (x + 1)), ('(3-x)(x-1)', (3 - x) * (x - 1)), ('(x-3)(x-5)', (x - 3) * (x - 5))],
        r'$(3-x)^2=(x-3)^2$：原式 $=(x-3)^2+2(x-3)=(x-3)[(x-3)+2]=(x-3)(x-1)$。')))
    for args in [(4, 3), (5, 7), (1, 6)]:
        items.append(('平方差：括號當一塊', D.block_minus(*args)))
    for args in [(7, 1, 3), (5, 3, -1), (8, 2, 1)]:
        items.append(('平方差：常數減括號的平方', D.const_minus(*args)))
    for args in [(2, 'diff', 3), (4, 'diff', 5), (3, 'minus', 2), (5, 'sum', 3), (2, 'sum', 7), (7, 'minus', 1)]:
        items.append(('先提公因式再用公式', gcf_formula(*args)))
    for args in [(53, 47), (75, 25), (102, 98), (61, 39)]:
        items.append(('利用平方差速算', quick_diff(*args)))
    for args in [(38, 12, 1), (97, 3, 1), (103, 3, -1), (59, 9, -1)]:
        items.append(('利用完全平方速算', quick_square(*args)))
    for args in [('mid', 1, 7), ('mid', 3, 2), ('const', 1, 5), ('const', 4, 3), ('lead', 6, 1), ('lead', 5, 2)]:
        items.append(('完全平方求係數', square_coef(*args)))
    for args in [(9, 4), (12, 5), (15, 7)]:
        items.append(('已知 a＋b、a−b 求 a²−b²', sum_diff(*args)))
    for args in [(24, 6), (45, 9)]:
        items.append(('已知 a²−b²、a＋b 求 a−b', known_diff(*args)))
    for args in [(97, 'sum', 3), (52, 'minus', 2), (21, 'diff', 1), (105, 'minus', 5)]:
        items.append(('先因式分解再代入求值', value_at(*args)))
    items.append(('正方形面積求邊長', square_side(1, 6, [('x+36', x + 36), ('x+12', x + 12), ('x+3', x + 3)])))
    items.append(('正方形面積求邊長', square_side(3, 2, [('9x+2', 9 * x + 2), ('3x+4', 3 * x + 4), ('3x+12', 3 * x + 12)])))
    items.append(('正方形面積求邊長', square_side(2, 5, [('4x+5', 4 * x + 5), ('2x+25', 2 * x + 25), ('2x+10', 2 * x + 10)])))
    for b, wr in [(5, [('x+5', x + 5), ('x-25', x - 25), ('x', x)]), (9, [('x+9', x + 9), ('x-81', x - 81), ('x-3', x - 3)]),
                  (6, [('x+6', x + 6), ('x-36', x - 36), ('x-12', x - 12)])]:
        items.append(('長方形面積（平方差）求寬', rect_width(b, wr)))
    return items


# ───────── 分析題 ─────────
def analysis(stem, options, explanation, hint, reason=None, figure=None):
    return dict(kind='analysis', stem=stem, options=options, reason=reason, explanation=explanation, hint=hint, figure=figure)


def check_analysis(v, where):
    for part, opts in (('選項', v['options']), ('理由', v['reason'])):
        if opts is None:
            continue
        texts = [o[0] for o in opts]
        assert 3 <= len(texts) <= 4 and len(set(texts)) == len(texts), f'{where}：{part}要有 3–4 個不同的 {texts}'
        truth = [bool(o[1]) for o in opts]
        assert truth == [True] + [False] * (len(opts) - 1), f'{where}：{part}的正確答案必須剛好一個而且排第一（{truth}）'
    assert v['hint'] and v['explanation']


def analysis_json(v):
    out = dict(stem=v['stem'], **({'figure': v['figure']} if v.get('figure') else {}), options=[o[0] for o in v['options']], answer=0, explanation=v['explanation'], hint=v['hint'])
    if v['reason']:
        out['reason'] = dict(options=[o[0] for o in v['reason']], answer=0)
    return out


def wrong_divisible(c, d, r):
    """小明：商式除得出來就說是因式（餘式 r≠0）。"""
    P = expand((x + c) * (x + d) + r)
    from sympy import div
    q, rr = div(P, x + c, x)
    assert rr == r != 0 and expand(q - (x + d)) == 0
    tP, tB = pt(P), lin(1, c)
    stem = (rf'小明判別 ${tB}$ 是不是 ${tP}$ 的因式，寫了：' + '\n'
            + rf'① 直式算出商式 ${lin(1, d)}$' + '\n'
            + rf'② 餘式是 ${r}$' + '\n'
            + rf'③ 商式除得出來，所以 ${tB}$ 是因式' + '\n'
            + '哪一步開始錯了？')
    opts = [
        (rf'第③步錯：餘式 ${r}\neq0$，${tB}$ 不是 ${tP}$ 的因式', True),
        (rf'第①步錯：商式應該是 ${lin(1, -d)}$', False),
        (r'第②步錯：餘式應該是 $0$', False),
        ('三步都對', False),
    ]
    return analysis(stem, opts,
                    rf'${tP}=({tB})({lin(1, d)})' + (f'+{r}' if r > 0 else f'{r}') + rf'$：判別要看餘式，餘式為 $0$ 才是因式；餘式 ${r}$，所以不是。',
                    '判別因式要看直式的哪一個結果？')


def wrong_minus(a, b, c, d):
    """小華：x(ax＋b)−x(cx＋d)＝x(ax＋b−cx＋d)（第二項沒變號）。"""
    E = x * L(a, b) - x * L(c, d)
    bad = x * (L(a, b) - L(c, 0) + d)
    good = x * L(a - c, b - d)
    ident(E, good)
    assert expand(bad - E) != 0
    stem = (rf'小華分解 $x{par(a, b)}-x{par(c, d)}$：' + '\n'
            + rf'① $=x({lin(a, b)}-{lin(c, 0)}+{d})$' + '\n'
            + rf'② $=x({pt(expand(L(a, b) - L(c, 0) + d))})$' + '\n'
            + '哪一步開始錯了？')
    opts = [
        (rf'第①步錯：減去括號，${d}$ 也要變號，答案是 $x({lin(a - c, b - d)})$', True),
        (rf'第②步錯：合併後應該是 $x({lin(a + c, b + d)})$', False),
        (rf'第①步錯：應該提出 ${lin(a, 0)}$', False),
        ('兩步都對', False),
    ]
    return analysis(stem, opts,
                    rf'$x[{par(a, b)}-{par(c, d)}]=x({lin(a, b)}-{lin(c, 0)}-{d})=x({lin(a - c, b - d)})$。可以展開檢查：小華的答案展開不等於原式。',
                    '括號前是減號時，括號裡的每一項都要變號。')


def wrong_flip(a, m, k):
    """小美：ax(x−m)＋k(m−x)＝ax(x−m)＋k(x−m)（變號忘了負號）。"""
    E = a * x * (x - m) + k * (m - x)
    bad = (x - m) * (a * x + k)
    assert expand(bad - E) != 0
    ident(E, (x - m) * (a * x - k))
    stem = (rf'小美分解 ${a}x(x-{m})+{k}({m}-x)$：' + '\n'
            + rf'① $={a}x(x-{m})+{k}(x-{m})$' + '\n'
            + rf'② $=(x-{m})({a}x+{k})$' + '\n'
            + '哪一步開始錯了？')
    opts = [
        (rf'第①步錯：${k}({m}-x)=-{k}(x-{m})$，答案是 $(x-{m})({a}x-{k})$', True),
        (rf'第②步錯：應該是 $(x-{m})^2({a}x+{k})$', False),
        (rf'第①步錯：要改成 ${a}x({m}-x)+{k}({m}-x)$', False),
        ('兩步都對', False),
    ]
    return analysis(stem, opts,
                    rf'${m}-x=-(x-{m})$，一次方變號要多一個負號：原式 $={a}x(x-{m})-{k}(x-{m})=(x-{m})({a}x-{k})$。代 $x=0$ 檢查：原式 $={k * m}$，小美的答案 $={-m * k}$。',
                    f'{m}−x 和 x−{m} 差什麼？')


def wrong_square(a, b):
    """小強：把中間項的係數當成 a。"""
    P = expand((a * x - b)**2)
    w = 2 * a * b
    assert expand((w * x - b)**2 - P) != 0
    stem = (rf'小強分解 ${pt(P)}$：' + '\n'
            + rf'① 首項 ${a * a}x^2=({lin(a, 0)})^2$，末項 ${b * b}={b}^2$' + '\n'
            + rf'② 中間項 $-{w}x=-2\times{lin(a, 0)}\times{b}$，對得上' + '\n'
            + rf'③ 所以 ${pt(P)}=({lin(w, -b)})^2$' + '\n'
            + '哪一步開始錯了？')
    opts = [
        (rf'第③步錯：$a$ 是 ${lin(a, 0)}$，應該是 $({lin(a, -b)})^2$', True),
        (rf'第①步錯：${a * a}x^2=({lin(a * a, 0)})^2$', False),
        (rf'第②步錯：中間項應該是 $-{a * b}x$', False),
        ('三步都對', False),
    ]
    return analysis(stem, opts,
                    rf'①② 都對，已經找到 $a={lin(a, 0)}$、$b={b}$，代入 $(a-b)^2$ 得 $({lin(a, -b)})^2$。小強把中間項的係數 ${w}$ 當成 $a$：$({lin(w, -b)})^2={pt((w * x - b)**2)}$，不等於原式。',
                    '公式裡的 a 是首項的平方根，不是中間項的係數。')


def wrong_block(a, u, v):
    """a²−(uy＋v)²：第二個括號的 v 沒變號。"""
    E = a * a - L(u, v, y)**2
    good = L(u, v + a, y) * L(-u, a - v, y)
    bad = L(u, v + a, y) * L(-u, a + v, y)
    ident(E, good)
    assert expand(bad - E) != 0
    stem = (rf'小安分解 ${a * a}-{par(u, v, "y")}^2$：' + '\n'
            + rf'① $=[{a}+{par(u, v, "y")}][{a}-{par(u, v, "y")}]$' + '\n'
            + rf'② $=({lin(u, v + a, "y")})({lin(-u, a + v, "y")})$' + '\n'
            + '哪一步開始錯了？')
    opts = [
        (rf'第②步錯：${a}-{par(u, v, "y")}={lin(-u, a - v, "y")}$，答案是 $({lin(u, v + a, "y")})({lin(-u, a - v, "y")})$', True),
        (rf'第①步錯：應該是 $({a}-{lin(u, v, "y")})^2$', False),
        (rf'第②步錯：應該是 $({lin(u, v + a, "y")})^2$', False),
        ('兩步都對', False),
    ]
    return analysis(stem, opts,
                    rf'① 用平方差公式，$a={a}$、$b={lin(u, v, "y")}$，正確。② 減去 ${par(u, v, "y")}$ 時 ${v}$ 也要變號：${a}-{lin(u, 0, "y")}{"-" if v > 0 else "+"}{abs(v)}={lin(-u, a - v, "y")}$。',
                    '中括號拆開時，前面是減號的那一個要每一項變號。')


def judge_square(b):
    """x²＋2bx＋b² 與 x²＋2bx−b²，哪一個是完全平方。"""
    P1, P2 = (x + b)**2, expand(x**2 + 2 * b * x - b * b)
    assert D.kind_of(P1) == '和的平方公式' and D.kind_of(P2) is None
    stem = rf'${pt(P1)}$ 和 ${pt(P2)}$，哪一個可以寫成 $(a+b)^2$？'
    opts = [(rf'只有 ${pt(P1)}$', True), (rf'只有 ${pt(P2)}$', False), ('兩個都可以', False)]
    reason = [
        (rf'常數項要是 $+b^2$：${b * b}={b}^2$，中間項 $2\cdot x\cdot{b}={2 * b}x$ 也對得上', True),
        (rf'兩個的中間項都是 ${2 * b}x$，所以兩個都可以', False),
        (rf'常數項是負的，才能寫成 $(x+{b})^2$', False),
    ]
    return analysis(stem, opts,
                    rf'${pt(P1)}=(x+{b})^2$。${pt(P2)}$ 的常數項是 $-{b * b}$，不是平方，展開 $(x+{b})^2$ 會得到 $+{b * b}$，所以不能。',
                    '完全平方展開後，常數項是正的還是負的？',
                    reason=reason)


ANALYSIS = [
    ('找錯：只看商式判別因式', [wrong_divisible(2, 3, -2), wrong_divisible(1, 4, 3), wrong_divisible(-3, 2, 5)]),
    ('找錯：括號前的減號', [wrong_minus(4, 1, 1, 2), wrong_minus(5, 3, 2, 4), wrong_minus(6, -1, 1, 3)]),
    ('找錯：變號少了負號', [wrong_flip(5, 2, 3), wrong_flip(3, 4, 2), wrong_flip(2, 5, 7)]),
    ('找錯：完全平方的 a', [wrong_square(4, 1), wrong_square(3, 2), wrong_square(5, 1)]),
    ('找錯：括號當一塊的平方差', [wrong_block(4, 2, 3), wrong_block(5, 1, 2), wrong_block(3, 1, -1)]),
    ('判斷＋理由：哪一個是完全平方', [judge_square(3), judge_square(5), judge_square(4)]),
]


def main():
    pools = {'attack': [], 'shield': [], 'ultimate': [], 'analysis': []}
    used = {}
    for lesson, kinds in FROM_LESSONS.items():
        slots = {s['id']: s for s in LESSON_MOD[lesson].SLOTS}
        for kind, ids in kinds.items():
            for sid in ids:
                assert (lesson, sid) not in used, f'{lesson}-{sid} 分配到兩類'
                used[(lesson, sid)] = kind
                s = slots[sid]
                for k, v in enumerate(s['variants'], 1):
                    where = f'{lesson}-{sid}-{k}'
                    check_item(v, where)
                    pools[kind].append(dict(id=where, topic=s['topic'], **item_json(v)))
        assert len(kinds['attack'] + kinds['shield'] + kinds['ultimate']) == len(slots) == 10, f'{lesson}：每個題位都要分配'
    # 與 content/quizzes 一致（每一題都要在題庫裡，而且內容相同）
    for lesson in FROM_LESSONS:
        bank = json.loads((ROOT / 'content/quizzes' / f'{lesson}.json').read_text(encoding='utf8'))
        for s in bank['slots']:
            for k, v in enumerate(s['variants'], 1):
                mine = next((x for p in pools.values() for x in p if x['id'] == f"{lesson}-{s['id']}-{k}"), None)
                assert mine, f"{lesson}-{s['id']}-{k} 沒有放進魔王戰"
                assert {kk: mine[kk] for kk in v} == v, f"{lesson}-{s['id']}-{k} 和 content/quizzes 的題目不一樣"

    NEW = {'attack': new_attack(), 'shield': new_shield(), 'ultimate': new_ultimate()}
    for kind, items in NEW.items():
        for i, (topic, v) in enumerate(items, 1):
            where = f'new-{kind}-{topic}-{i}'
            check_item(v, where)
            pools[kind].append(dict(id=where, topic=topic, **item_json(v)))

    for topic, items in ANALYSIS:
        for k, v in enumerate(items, 1):
            where = f'new-analysis-{topic}-{k}'
            check_analysis(v, where)
            pools['analysis'].append(dict(id=where, topic=topic, **analysis_json(v)))

    ids = [x['id'] for p in pools.values() for x in p]
    assert len(ids) == len(set(ids)), '題目 ID 重複'
    # 不要有完全一樣的題目（題幹＋選項）
    keys = [(x['stem'], tuple(x['options'])) for p in pools.values() for x in p]
    dup = {k for k in keys if keys.count(k) > 1}
    assert not dup, f'重複的題目：{list(dup)[:3]}'
    for kind in ('attack', 'shield', 'ultimate'):
        assert len(pools[kind]) >= 10, f'{kind} 題數不足'
    assert len(pools['analysis']) >= 4

    out = dict(
        hostLesson='g8-3-1d',
        title='3-1 因式分解：魔王戰',
        section='3-1',
        source='八年級 3-1(1)～(4) 課後檢核題（依類型分配）＋新增換數字題、綜合應用題與分析題（自編）；範圍含 1 章乘法公式與多項式除法；答案已用 SymPy 核算',
        pools=pools,
    )
    path = ROOT / 'content/raids' / 'g8-3-1d.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print('✓ 3-1 魔王戰題庫：' + '、'.join(f'{k} {len(v)} 題' for k, v in pools.items()) + f' → {path.name}（全部核算通過）')


if __name__ == '__main__':
    main()
