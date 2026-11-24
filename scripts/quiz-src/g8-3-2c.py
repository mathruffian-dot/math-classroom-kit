r"""3-2(3) 十字交乘法（二次項係數不為 1）：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一）。

用法：C:\AI\H3\venv\Scripts\python.exe -B -X utf8 scripts/quiz-src/g8-3-2c.py
範圍：3-1 全部＋3-2(1)(2)＋這一堂：(px＋q)(rx＋s) 展開的一次項＝交叉相乘的和、
二次項係數不為 1（正數、各項沒有公因數）的 ax²＋bx＋c 十字交乘（左欄拆 a、右欄拆 c，位置不同結果不同）。
不用先提公因數再十字交乘、二次項係數為負（3-2(4)）。
因式分解的答案是代數式：□ 填數字，或選出正確的式子（每個等號、每個選項的真假都用 SymPy 核算）；
「a、b、c 均為整數」的會考題型用 int_solutions 窮舉，確認所求的值只有一個。
"""
import importlib.util
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import expand, symbols  # noqa: E402

from crossfac import F, cross_line, cross_sum, explain, int_solutions, is_factor, mx, sum_tex  # noqa: E402
from fac import ident, lin, npick, pt, x  # noqa: E402
from quizlib import export, slot, statement, value  # noqa: E402

_spec = importlib.util.spec_from_file_location('g8_3_2a', Path(__file__).parent / 'g8-3-2a.py')
A = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(A)
which_right = A.which_right


def Q(m, p, n, q):
    """(m x＋p)(n x＋q)。"""
    return expand((m * x + p) * (n * x + q))


# ───────── 1. 展開：一次項是交叉相乘的和 ─────────
def mid_coef(m, p, n, q):
    P = Q(m, p, n, q)
    s = m * q + n * p
    return value(
        rf'$({lin(m, p)})({lin(n, q)})$ 展開後，$x$ 項的係數是多少？',
        s,
        npick(s, [p + q, m * p + n * q, m * n + p * q, -s]),
        rf'一次項是交叉相乘的和：${mx(m)}\cdot{"(" + str(q) + ")" if q < 0 else q}+{"(" + str(p) + ")" if p < 0 else p}\cdot {mx(n)}={mx(s)}$，所以 $({lin(m, p)})({lin(n, q)})={pt(P)}$。')


# ───────── 2. 十字：交叉相乘的和（左欄不是 x、x） ─────────
def cross_value(m, n, p, q):
    s = cross_sum(m, n, p, q)
    wrong_pair = m * p + n * q
    return value(
        rf'十字交乘時，{cross_line(m, n, p, q)}。交叉相乘的和是幾 $x$？',
        s,
        npick(s, [wrong_pair, p + q, m * n * p * q, -s]),
        rf'左上×右下＋左下×右上：${sum_tex(m, n, p, q)}$。注意是「交叉」相乘，不是同一列相乘（同一列是 ${mx(wrong_pair)}$）。')


# ───────── 3、4、5. 因式分解（二次項係數不為 1） ─────────
def factor_choice(m, p, n, q, wrongs):
    """正解 (m x＋p)(n x＋q)，十字左欄 m、n，右欄 p、q。"""
    P = Q(m, p, n, q)
    tex, e = F(1, (m, p), (n, q))
    opts = [(f'${tex}$', P, e)] + [(f'${F(1, *w)[0]}$', P, F(1, *w)[1]) for w in wrongs]
    return statement(rf'${pt(P)}$ 因式分解的結果是？', opts, explain(P, 1, m, n, p, q))


# ───────── 6. 哪一組十字合 ─────────
def which_cross(m, n, p, q, wrongs):
    P = Q(m, p, n, q)
    a, b, c = m * n, cross_sum(m, n, p, q), p * q
    opts = [(cross_line(*t), t[0] * t[1] == a and t[2] * t[3] == c and cross_sum(*t) == b) for t in [(m, n, p, q)] + wrongs]
    return statement(
        rf'用十字交乘法分解 ${pt(P)}$，下列哪一組十字合？',
        opts,
        rf'左欄相乘要是 ${mx(a, "x^2")}$、右欄相乘要是 ${c}$、交叉相乘的和要是 ${mx(b)}$：' + explain(P, 1, m, n, p, q))


# ───────── 7. 已知一個因式，填另一個常數 ─────────
def other_box(m, p, n, q):
    P = Q(m, p, n, q)
    ident(P, (m * x + p) * (n * x + q))
    return value(
        rf'${pt(P)}=({lin(m, p)})({mx(n)}+\square)$，□ 是多少？（含正負號）',
        q,
        npick(q, [-q, p * q, cross_sum(m, n, p, q), q + 1]),
        rf'右欄相乘是常數項：${"(" + str(p) + ")" if p < 0 else p}\times\square={p * q}$，□＝${q}$；檢查交叉相乘 ${sum_tex(m, n, p, q)}$，合。')


# ───────── 8. 會考題型：a、b、c 均為整數 ─────────
a_, b_, c_ = symbols('a b c')


def exam(P, k, ask_tex, ask, wrongs, sol_tex):
    """P＝(k x＋a)(b x＋c)，a、b、c 均為整數，求 ask（a、b、c 的式子）。窮舉整數解，所求的值只能有一個。"""
    sols = int_solutions(P, (k * x + a_) * (b_ * x + c_), [a_, b_, c_], positive=(b_,))
    vals = {ask(s['a'], s['b'], s['c']) for s in sols}
    assert len(vals) == 1, (P, sols)
    v = vals.pop()
    s0 = sols[0]
    return value(
        rf'多項式 ${pt(P)}$ 可因式分解成 $({k}x+a)(bx+c)$，其中 $a$、$b$、$c$ 均為整數，求 ${ask_tex}$ 的值。',
        v,
        npick(v, wrongs),
        rf'${pt(P)}={sol_tex}$，所以 $a={s0["a"]}$、$b={s0["b"]}$、$c={s0["c"]}$，${ask_tex}={v}$。（同 111 會考第 8 題的題型）')


# ───────── 10. 因式（連結 3-1） ─────────
def factor_of(m, p, n, q, wrongs):
    P = Q(m, p, n, q)
    opts = [(f'${lin(u, v)}$', is_factor(P, u * x + v)) for u, v in [(m, p)] + wrongs]
    return statement(
        rf'下列哪一個是 ${pt(P)}$ 的因式？',
        opts,
        explain(P, 1, m, n, p, q) + rf'所以 ${lin(m, p)}$ 是因式（${pt(P)}$ 除以它，餘式是 $0$）。')


def case(P, *lins):
    tex, e = F(1, *lins)
    return (P, tex, e)


SLOTS = [
    slot(1, '展開：一次項是交叉相乘的和', [mid_coef(2, 5, 1, 3), mid_coef(3, -4, 1, 2), mid_coef(4, -3, 1, 5)]),
    slot(2, '十字：交叉相乘的和（左欄不是 x、x）', [cross_value(2, 3, 1, -4), cross_value(1, 5, -4, -1), cross_value(3, 2, 5, -1)]),
    slot(3, '二次項係數不為 1：常數項正、一次項正', [
        factor_choice(3, 1, 1, 3, [((3, 3), (1, 1)), ((3, -1), (1, -3)), ((1, 1), (1, 3))]),
        factor_choice(2, 1, 1, 5, [((2, 5), (1, 1)), ((2, -1), (1, -5)), ((2, 1), (1, -5))]),
        factor_choice(5, 1, 1, 3, [((5, 3), (1, 1)), ((5, -1), (1, -3)), ((5, 3), (1, 3))]),
    ]),
    slot(4, '二次項係數不為 1：常數項正、一次項負', [
        factor_choice(3, -2, 1, -3, [((3, -3), (1, -2)), ((3, 2), (1, 3)), ((3, -1), (1, -6))]),
        factor_choice(2, -5, 1, -2, [((2, -2), (1, -5)), ((2, 5), (1, 2)), ((2, -1), (1, -10))]),
        factor_choice(7, -1, 1, -2, [((7, -2), (1, -1)), ((7, 1), (1, 2)), ((7, -1), (1, 2))]),
    ]),
    slot(5, '二次項係數不為 1：常數項為負', [
        factor_choice(2, -3, 1, 2, [((2, 3), (1, -2)), ((2, -2), (1, 3)), ((2, -1), (1, 6))]),
        factor_choice(3, 1, 1, -2, [((3, -1), (1, 2)), ((3, -2), (1, 1)), ((3, 2), (1, -1))]),
        factor_choice(2, -3, 2, 5, [((2, 3), (2, -5)), ((4, -3), (1, 5)), ((4, 5), (1, -3))]),
    ]),
    slot(6, '哪一組十字合（二次項係數不為 1）', [
        which_cross(1, 3, -4, 1, [(1, 3, 1, -4), (1, 3, 4, -1), (1, 3, -2, 2)]),
        which_cross(2, 1, -1, 3, [(2, 1, 3, -1), (2, 1, 1, -3), (2, 1, -3, 1)]),
        which_cross(5, 1, -2, -1, [(5, 1, -1, -2), (5, 1, 2, 1), (5, 1, 1, 2)]),
    ]),
    slot(7, '已知一個因式，填另一個常數（二次項係數不為 1）', [other_box(3, -4, 1, 3), other_box(2, -1, 1, -3), other_box(3, 1, 3, 4)]),
    slot(8, '會考題型：a、b、c 均為整數', [
        exam(6 * x**2 + x - 15, 3, 'a+2c', lambda a, b, c: a + 2 * c, [7, 1, -11, 4], '(3x+5)(2x-3)'),
        exam(10 * x**2 - x - 3, 5, 'a+b+c', lambda a, b, c: a + b + c, [6, -2, 4, 2], '(5x-3)(2x+1)'),
        exam(8 * x**2 - 10 * x + 3, 4, 'a+2c', lambda a, b, c: a + 2 * c, [-4, 5, -7, 1], '(4x-3)(2x-1)'),
    ]),
    slot(9, '常見錯誤：數字的位置放錯', [
        which_right([case(Q(2, 1, 1, 4), (2, 1), (1, 4)), case(Q(2, 1, 1, 4), (2, 4), (1, 1)), case(Q(3, 4, 1, 1), (3, 1), (1, 4)), case(Q(3, -1, 1, -2), (3, -2), (1, -1))]),
        which_right([case(Q(3, -1, 1, 4), (3, -1), (1, 4)), case(Q(3, -1, 1, 4), (3, 4), (1, -1)), case(Q(2, 3, 1, -5), (2, -5), (1, 3)), case(Q(5, 1, 1, 2), (5, 2), (1, 1))]),
        which_right([case(Q(4, 1, 1, -5), (4, 1), (1, -5)), case(Q(4, 1, 1, -5), (4, -5), (1, 1)), case(Q(2, 5, 1, 1), (2, 1), (1, 5)), case(Q(3, -4, 2, 1), (3, 1), (2, -4))]),
    ]),
    slot(10, '判別因式（連結 3-1）', [
        factor_of(2, 1, 3, -2, [(2, -1), (3, 2), (1, -2)]),
        factor_of(2, 1, 2, -5, [(2, -1), (4, 1), (1, -5)]),
        factor_of(3, 1, 1, 2, [(3, 2), (1, 1), (1, -2)]),
    ]),
]

if __name__ == '__main__':
    export('g8-3-2c', '3-2 十字交乘法（3）二次項係數不為 1 課後檢核',
           '依課本 3-2 p.132–133（(x＋5)(3x＋1) 與 3x²＋16x＋5、例 4、例 5 與隨堂）自編換數字題；會考題型仿 111 會考第 8 題', SLOTS)
