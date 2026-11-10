r"""3-1(2) 提公因式法：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一）。

用法：C:\AI\H3\venv\Scripts\python.exe -B -X utf8 scripts/quiz-src/g8-3-1b.py
範圍：3-1(1) 因式與倍式＋這一堂的公因式（係數的最大公因數、x、一整個括號）、A×C＋B×C＝C×(A＋B)、
提單項公因式、提出後括號內合併（括號前是減號要每一項變號）、提完整（例如 2x(7x＋2) 而不是 x(14x＋4)）、提多項公因式。
不把「隱形的 1」與 b−a＝−(a−b) 變號當成新技能（3-1(3)），不用乘法公式分解（3-1(4)）。
最後一題的長方形附圖：長、寬照題目的式子標示（x 沒有固定的值，圖不按比例）。
"""
import sys
from math import gcd
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import Rational as R  # noqa: E402
from sympy import expand  # noqa: E402
from sympy import gcd as pgcd  # noqa: E402

from fac import L, ident, lin, npick, par, pt, x  # noqa: E402
from geom import YELLOW, Fig  # noqa: E402
from quizlib import export, slot, statement, value, with_figure  # noqa: E402


def sup(t):
    """附圖文字：x^2 → x²。"""
    return t.replace('^2', '²')


def sgn_box(k):
    return ('+', k) if k > 0 else ('-', -k)


# ───────── 1. 兩項的公因式（單項式） ─────────
def gcf_mono(a, b):
    g = gcd(a, b)
    d = next((k for k in range(g - 1, 1, -1) if g % k == 0), 1)
    gx = 'x' if g == 1 else f'{g}x'
    opts = [(f'${gx}$', True), (f'${g}x^2$', False), (f'${"" if d == 1 else d}x$', False), (f'${g}$', False)]
    ident(a * x**2 + b * x, g * x * (R(a, g) * x + R(b, g)))
    return statement(
        rf'把 ${pt(a * x**2 + b * x)}$ 提出所有公因式（係數提到最大），要提出的是？',
        opts,
        rf'${a}$ 和 ${abs(b)}$ 的最大公因數是 ${g}$，兩項都有 $x$：公因式 ${gx}$，${pt(a * x**2 + b * x)}={gx}({lin(a // g, b // g)})$。'
        rf'${g}x^2$ 不是 ${pt(b * x)}$ 的因式。')


# ───────── 2. 提單項公因式後括號內的常數 ─────────
def mono_box(a, b):
    g = gcd(a, abs(b))
    k = b // g
    sg, bx = sgn_box(k)
    ident(a * x**2 + b * x, g * x * (a // g * x + k))
    return value(
        rf'${pt(a * x**2 + b * x)}={g}x({a // g}x{sg}\square)$，□ 是多少？',
        bx,
        npick(bx, [abs(b), -bx, abs(b) - g, bx + g, a // g, bx + 1, 2 * bx]),
        rf'${pt(b * x)}={g}x\times({k})$，所以 □＝${bx}$。每一項都要除以公因式 ${g}x$，可以展開檢查。')


# ───────── 3. 提出 x 再合併括號內 ─────────
def combine_inside(m, p, q):
    """mx²＋x(px＋q)＝x((m＋p)x＋q)。"""
    assert gcd(m + p, abs(q)) == 1  # 括號內不能再提公因式
    E = m * x**2 + x * L(p, q)
    ident(E, x * L(m + p, q))
    return value(
        rf'${m}x^2+x{par(p, q)}=x(\square x' + (f'+{q}' if q > 0 else f'{q}') + r')$，□ 是多少？',
        m + p,
        npick(m + p, [m, p, m * p, m + p + 1]),
        rf'兩項都有 $x$：${m}x^2+x{par(p, q)}=x[{m}x+{par(p, q)}]=x({lin(m + p, q)})$，□＝${m + p}$。')


# ───────── 4. 括號前是減號 ─────────
def minus_bracket(a, b, c, d):
    """x(ax＋b)−x(cx＋d)＝x((a−c)x＋(b−d))。"""
    k = b - d
    assert c > 0 and gcd(a - c, abs(k)) == 1
    E = x * L(a, b) - x * L(c, d)
    ident(E, x * L(a - c, k))
    sg, bx = sgn_box(k)
    s = 1 if k > 0 else -1
    return value(
        rf'$x{par(a, b)}-x{par(c, d)}=x({a - c}x{sg}\square)$，□ 是多少？',
        bx,
        npick(bx, [(b + d) * s, -bx, d * s, (d - b) * s if d - b != k else b * s]),
        rf'$x[{par(a, b)}-{par(c, d)}]=x({lin(a, b)}-{lin(c, 0)}' + (f'-{d}' if d > 0 else f'+{-d}') + rf')=x({lin(a - c, k)})$。'
        rf'減去括號，${lin(c, 0)}$ 和 ${d}$ 都要變號。')


# ───────── 5. 提完整 ─────────
def complete(a, b):
    g = gcd(a, abs(b))
    assert g > 1
    E = a * x**2 + b * x
    full = f'{g}x({lin(a // g, b // g)})'
    half_x = f'x({lin(a, b)})'
    half_n = f'{g}({pt(E / g)})'
    wrong = f'{g}x({lin(a // g, b)})'
    ident(E, x * L(a, b))
    ident(E, g * (E / g))
    assert expand(g * x * L(a // g, b) - E) != 0
    return statement(
        rf'${pt(E)}$ 提出所有公因式後，是哪一個？',
        [(f'${full}$', True), (f'${half_x}$', False), (f'${half_n}$', False), (f'${wrong}$', False)],
        rf'兩項都有 ${g}$ 和 $x$：${pt(E)}={full}$。${half_x}$、${half_n}$ 的值相等，但括號內還有公因式，沒有提完整；'
        rf'${wrong}$ 展開是 ${pt(g * x * L(a // g, b))}$，不等於原式。')


# ───────── 6. 公因式是一整個括號（加號） ─────────
def bracket_plus(p, u, v, q):
    """px(ux＋v)＋q(ux＋v)＝(ux＋v)(px＋q)。"""
    E = p * x * L(u, v) + q * L(u, v)
    ident(E, L(u, v) * L(p, q))
    return value(
        rf'${lin(p, 0)}{par(u, v)}+{q}{par(u, v)}={par(u, v)}({lin(p, 0)}+\square)$，□ 是多少？',
        q,
        npick(q, [v, q + v, p * q, -q]),
        rf'把 ${par(u, v)}$ 看成一整塊 $C$：${lin(p, 0)}\cdot C+{q}\cdot C=C({lin(p, q)})$，所以 □＝${q}$。')


# ───────── 7. 兩個乘積的公因式（多項式） ─────────
def poly_gcf(f1, f2, f3, distract):
    """(f1)(f2) 與 (f2)(f3) 的公因式 f2；distract：三個錯誤選項（多項式）。"""
    A, B = f1 * f2, f2 * f3
    G = pgcd(expand(A), expand(B))
    opts = [(f'${pt(f2)}$', G, f2)] + [(f'${t}$', G, e) for t, e in distract]
    return statement(
        rf'$({pt(f1)})({pt(f2)})$ 與 $({pt(f2)})({pt(f3)})$ 的公因式是？',
        opts,
        rf'把兩項拆開，兩項都有的是 $({pt(f2)})$，位置可以不同；$({pt(f1)})$、$({pt(f3)})$ 只出現在其中一項。')


# ───────── 8. 公因式是一整個括號（減號） ─────────
def bracket_minus(p, u, v, q):
    E = p * x * L(u, v) - q * L(u, v)
    C = par(u, v)
    lhs = f'{lin(p, 0)}{C}-{q}{C}'
    return statement(
        rf'${lhs}$ 因式分解的結果是？',
        [(f'${C}({lin(p, -q)})$', E, L(u, v) * L(p, -q)),
         (f'${C}({lin(p, q)})$', E, L(u, v) * L(p, q)),
         (f'${C}\\cdot({-p * q}x)$', E, L(u, v) * (-p * q * x)),
         (f'${C}^2({lin(p, -q)})$', E, L(u, v)**2 * L(p, -q))],
        rf'把 ${C}$ 看成 $C$：${lin(p, 0)}C-{q}C=C({lin(p, -q)})$，答案是 ${C}({lin(p, -q)})$。${lin(p, 0)}$ 和 ${q}$ 是相減，不是相乘。')


# ───────── 9. 哪一個提公因式正確（展開檢查） ─────────
def which_right(cases):
    """cases：[(左式, 右式的 LaTeX, 右式)…]，第一個正確。"""
    opts = [(f'${pt(l)}={t}$', l, r) for l, t, r in cases]
    l0, t0, _ = cases[0]
    return statement(
        '下列哪一個提公因式的結果是正確的？（可以展開檢查）',
        opts,
        rf'把右式展開和左式比對：只有 ${pt(l0)}={t0}$ 展開後和原式相同。提出公因式後，括號內每一項都要除以公因式。')


# ───────── 10. 長方形的長（附圖） ─────────
def rect_fig(w_lab, area_lab):
    f = Fig(440, 230, pad=46)
    A, B, C, D = f.pt('', 0, 0, False), f.pt('', 7, 0, False), f.pt('', 7, 3.2, False), f.pt('', 0, 3.2, False)
    f.poly([A, B, C, D], fill=YELLOW)
    f.side(A, D, w_lab)
    f.side(D, C, '?')
    f.text(3.5, 1.45, area_lab, 18)
    return f.svg()


def rect_len(w_a, l_a, l_b, wrongs):
    """寬 w_a·x、長 (l_a x＋l_b)，面積 w_a·x(l_a x＋l_b)。wrongs：錯誤的長 (a, b)。"""
    W = w_a * x
    A = expand(W * L(l_a, l_b))
    opts = [(f'${lin(l_a, l_b)}$', W * L(l_a, l_b), A)] + [(f'${lin(a, b)}$', W * L(a, b), A) for a, b in wrongs]
    return with_figure(statement(
        rf'如圖，長方形的面積是 ${pt(A)}$，寬是 ${lin(w_a, 0)}$，長是多少？（圖不按比例）',
        opts,
        rf'面積＝長×寬：${pt(A)}={lin(w_a, 0)}({lin(l_a, l_b)})$，所以長是 ${lin(l_a, l_b)}$。兩項都要除以 ${lin(w_a, 0)}$。'),
        rect_fig(sup(lin(w_a, 0)), sup(pt(A))))


SLOTS = [
    slot(1, '找出兩項的公因式（單項式）', [gcf_mono(12, 18), gcf_mono(8, 20), gcf_mono(9, -6)]),
    slot(2, '提單項公因式：括號內的常數', [mono_box(6, -15), mono_box(10, 4), mono_box(8, 12)]),
    slot(3, '提出 x 後括號內合併', [combine_inside(3, 2, -4), combine_inside(5, 2, 3), combine_inside(4, 3, -1)]),
    slot(4, '括號前是減號：每一項都變號', [minus_bracket(4, 1, 1, 2), minus_bracket(5, 3, 2, 7), minus_bracket(7, 2, 3, 5)]),
    slot(5, '公因式要提完整', [complete(14, 4), complete(10, 15), complete(12, -8)]),
    slot(6, '公因式是一整個括號（相加）', [bracket_plus(1, 2, 5, 4), bracket_plus(2, 3, 1, 7), bracket_plus(4, 1, -6, 3)]),
    slot(7, '找出兩個乘積的公因式', [
        poly_gcf(x + 5, x - 3, 2 * x + 1, [('x+5', x + 5), ('2x+1', 2 * x + 1), ('(x+5)(2x+1)', (x + 5) * (2 * x + 1))]),
        poly_gcf(x - 1, 3 * x + 2, x + 4, [('x-1', x - 1), ('x+4', x + 4), ('3x', 3 * x)]),
        poly_gcf(x + 6, x - 2, x - 6, [('x+6', x + 6), ('x-6', x - 6), ('(x+6)(x-6)', (x + 6) * (x - 6))]),
    ]),
    slot(8, '公因式是一整個括號（相減）', [bracket_minus(5, 2, 3, 7), bracket_minus(4, 1, -6, 3), bracket_minus(2, 5, -1, 9)]),
    slot(9, '展開檢查：哪一個提公因式正確', [
        which_right([(6 * x**2 + 9 * x, '3x(2x+3)', 3 * x * (2 * x + 3)), (8 * x**2 - 4 * x, '4x(2x-4)', 4 * x * (2 * x - 4)),
                     (5 * x**2 + 10 * x, '5x(x+10)', 5 * x * (x + 10)), (x**2 + 4 * x, 'x(x+4x)', x * (x + 4 * x))]),
        which_right([(10 * x**2 - 15 * x, '5x(2x-3)', 5 * x * (2 * x - 3)), (4 * x**2 + 6 * x, '2x(2x+6)', 2 * x * (2 * x + 6)),
                     (7 * x**2 + 14 * x, '7x(x+14)', 7 * x * (x + 14)), (3 * x**2 - 6 * x, '3x(x-6)', 3 * x * (x - 6))]),
        which_right([(12 * x**2 + 8 * x, '4x(3x+2)', 4 * x * (3 * x + 2)), (9 * x**2 - 6 * x, '3x(3x-6)', 3 * x * (3 * x - 6)),
                     (2 * x**2 + 6 * x, '2x(x+6)', 2 * x * (x + 6)), (x**2 - 5 * x, 'x(x+5)', x * (x + 5))]),
    ]),
    slot(10, '長方形面積求長', [
        rect_len(3, 1, 4, [(1, 12), (3, 4), (1, 9)]),
        rect_len(2, 3, -5, [(3, -10), (6, -5), (3, 5)]),
        rect_len(5, 2, 1, [(2, 5), (10, 1), (2, 0)]),
    ]),
]

if __name__ == '__main__':
    export('g8-3-1b', '3-1 因式分解（2）提公因式法 課後檢核', '依課本 3-1 p.117–119（公因式、提公因式法、例 2、例 3 與隨堂）自編換數字題', SLOTS)
