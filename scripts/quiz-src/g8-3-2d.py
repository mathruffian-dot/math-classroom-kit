r"""3-2(4) 先提公因數、二次項係數為負、十字交乘與乘法公式：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一）。

用法：C:\AI\H3\venv\Scripts\python.exe -B -X utf8 scripts/quiz-src/g8-3-2d.py
範圍：3-1 全部＋3-2 全部（例 1～例 8）：先提公因數再十字交乘（例 6）、二次項係數為負先提出負號（例 7）、
十字交乘與乘法公式（例 8）；同一個多項式的不同正確寫法（課本 p.134、p.135）。
不用 p.137 補給站的代換法（教用版：教師視班級情況補充）。
因式分解的答案是代數式：□ 填數字，或選出正確的式子（每個等號、每個選項的真假都用 SymPy 核算）。
"""
import importlib.util
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import expand  # noqa: E402

from crossfac import F, explain, sum_tex  # noqa: E402
from fac import ident, npick, pt, x  # noqa: E402
from quizlib import export, slot, statement, value  # noqa: E402

_spec = importlib.util.spec_from_file_location('g8_3_2a', Path(__file__).parent / 'g8-3-2a.py')
A = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(A)
which_right = A.which_right


def K(k, m, p, n, q):
    """k(m x＋p)(n x＋q)。"""
    return expand(k * (m * x + p) * (n * x + q))


def opt(k, *lins):
    tex, e = F(k, *lins)
    return tex, e


# ───────── 1、2、3、4、6. 因式分解（先提公因數、首項為負、完全平方） ─────────
def choice(k, m, p, n, q, wrongs, note=''):
    """正解 k(m x＋p)(n x＋q)；wrongs：[(k, (m,p), (n,q))]。"""
    P = K(k, m, p, n, q)
    tex, e = opt(k, (m, p), (n, q))
    opts = [(f'${tex}$', P, e)] + [(f'${opt(w[0], *w[1:])[0]}$', P, opt(w[0], *w[1:])[1]) for w in wrongs]
    return statement(rf'${pt(P)}$ 因式分解的結果是？', opts, explain(P, k, m, n, p, q) + note)


# ───────── 5. 其他正確的寫法 ─────────
def also_right(k, m, p, n, q, good, wrongs):
    """P＝k(m x＋p)(n x＋q)；good、wrongs：(k, (m,p), (n,q))，good 是另一種正確寫法。"""
    P = K(k, m, p, n, q)
    base, _ = opt(k, (m, p), (n, q))
    opts = [(f'${opt(t[0], *t[1:])[0]}$', P, opt(t[0], *t[1:])[1]) for t in [good] + wrongs]
    g = opt(good[0], *good[1:])[0]
    return statement(
        rf'${pt(P)}={base}$。下列哪一個也是 ${pt(P)}$ 正確的因式分解？',
        opts,
        rf'${g}$ 展開也等於原式，而且每個因式都不能再降次分解，所以也是正確答案（課本 p.134、p.135：這些寫法都正確）。其他三個展開後和原式不同。')


# ───────── 7. 先提公因數後，填另一個常數 ─────────
def gcf_box(k, p, q):
    P = K(k, 1, p, 1, q)
    ident(P, k * (x + p) * (x + q))
    return value(
        rf'${pt(P)}={k}({"x" + ("+" if p > 0 else "") + str(p)})(x+\square)$，□ 是多少？（含正負號）',
        q,
        npick(q, [-q, k * q, p * q, k * p * q, p + q, q + k]),
        rf'先提出 ${k}$：${pt(P)}={k}({pt(expand(P / k))})$；右欄相乘要是 ${p * q}$，□＝${q}$，交叉相乘 ${sum_tex(1, 1, p, q)}$，合。')


# ───────── 9. 提出負號：括號內每一項都變號 ─────────
def pull_minus(P):
    N = expand(-P)
    c2, c1, c0 = [N.coeff(x, d) for d in (2, 1, 0)]
    cands = [
        (f'$-({pt(N)})$', True),
        (f'$-({pt(c2 * x**2 - c1 * x + c0)})$', False),
        (f'$-({pt(c2 * x**2 + c1 * x - c0)})$', False),
        (f'$-({pt(P)})$', False),
    ]
    return statement(
        rf'分解 ${pt(P)}$ 時先提出負號，下列哪一個寫法正確？',
        cands,
        rf'提出負號時，括號內每一項都要變號：${pt(P)}=-({pt(N)})$。可以把負號乘回去檢查。')


# ───────── 10. 由分解結果求係數 ─────────
def coef_b(k, m, p, n, q):
    P = K(k, m, p, n, q)
    a, b, c = [P.coeff(x, d) for d in (2, 1, 0)]
    tex, _ = opt(k, (m, p), (n, q))
    lead = f'{a}x^2' if a not in (1, -1) else ('x^2' if a == 1 else '-x^2')
    return value(
        rf'若 ${lead}+bx{"+" if c > 0 else ""}{c}={tex}$，則 $b$ 是多少？',
        b,
        npick(b, [-b, m * q + n * p, k * (m * p + n * q), c, b + 2]),
        rf'展開：${tex}={pt(P)}$，所以 $b={b}$。也可以看十字：括號內交叉相乘的和是 ${m * q + n * p}$，再乘上前面的 ${k}$。')


def case(k, m, p, n, q, tex_k=None, lins=None):
    """原式 k(m x＋p)(n x＋q)，寫成 tex_k(lins…)（省略＝正確的寫法）。"""
    P = K(k, m, p, n, q)
    tk, tl = (k, [(m, p), (n, q)]) if tex_k is None else (tex_k, lins)
    tex, e = opt(tk, *tl)
    return (P, tex, e)


def wrong_case(P, k, *lins):
    tex, e = opt(k, *lins)
    return (P, tex, e)


SLOTS = [
    slot(1, '先提公因數，再十字交乘（二次項係數為 1）', [
        choice(3, 1, 2, 1, 3, [(3, (1, 1), (1, 6)), (3, (1, -2), (1, -3)), (1, (3, 2), (1, 3))]),
        choice(2, 1, -7, 1, 2, [(2, (1, 7), (1, -2)), (2, (1, -7), (1, -2)), (2, (1, -14), (1, 1))]),
        choice(5, 1, 3, 1, -2, [(5, (1, -3), (1, 2)), (5, (1, 6), (1, -1)), (1, (5, 3), (1, -2))]),
    ]),
    slot(2, '先提公因數，再十字交乘（括號內二次項係數不為 1）', [
        choice(2, 3, 1, 1, -5, [(2, (3, -1), (1, 5)), (2, (3, -5), (1, 1)), (1, (3, 1), (1, -5))]),
        choice(3, 2, -1, 1, -2, [(6, (1, -1), (1, -1)), (3, (2, 1), (1, 2)), (1, (2, -1), (1, -2))]),
        choice(3, 3, -2, 1, 2, [(3, (3, 2), (1, -2)), (3, (3, -4), (1, 1)), (1, (3, -2), (1, 2))]),
    ]),
    slot(3, '二次項係數為 −1：先提出負號', [
        choice(-1, 1, -3, 1, 2, [(-1, (1, 3), (1, -2)), (1, (1, -3), (1, 2)), (-1, (1, -6), (1, 1))]),
        choice(-1, 1, 5, 1, -3, [(-1, (1, -5), (1, 3)), (1, (1, 5), (1, -3)), (-1, (1, 15), (1, -1))]),
        choice(-1, 1, -3, 1, -4, [(-1, (1, 3), (1, 4)), (1, (1, -3), (1, -4)), (-1, (1, -2), (1, -6))]),
    ]),
    slot(4, '二次項係數為負（不為 −1）：先提出負號', [
        choice(-1, 2, -3, 1, 1, [(-1, (2, 3), (1, -1)), (1, (2, -3), (1, 1)), (-1, (2, -1), (1, 3))]),
        choice(-1, 3, 2, 1, -1, [(-1, (3, -2), (1, 1)), (1, (3, 2), (1, -1)), (-1, (3, -1), (1, 2))]),
        choice(-1, 5, -4, 1, -1, [(-1, (5, 4), (1, 1)), (1, (5, -4), (1, -1)), (-1, (5, -1), (1, -4))]),
    ]),
    slot(5, '同一個式子的其他正確寫法', [
        also_right(3, 1, -4, 1, 1, (1, (3, -12), (1, 1)), [(1, (3, 12), (1, -1)), (3, (1, 4), (1, 1)), (3, (1, -2), (1, 2))]),
        also_right(2, 1, -5, 1, 2, (1, (1, -5), (2, 4)), [(1, (2, 5), (1, -2)), (1, (2, -5), (1, 4)), (2, (1, 5), (1, -2))]),
        also_right(-1, 2, 1, 1, -4, (1, (-2, -1), (1, -4)), [(1, (2, 1), (1, 4)), (-1, (2, -1), (1, -4)), (1, (2, 1), (1, -4))]),
    ]),
    slot(6, '完全平方：十字交乘或乘法公式', [
        choice(1, 4, 3, 4, 3, [(1, (4, 9), (4, 1)), (1, (8, 3), (2, 3)), (1, (4, -3), (4, -3))]),
        choice(1, 2, -5, 2, -5, [(1, (2, 5), (2, 5)), (1, (4, -5), (1, -5)), (1, (4, -25), (1, -1))]),
        choice(1, 7, -1, 7, -1, [(1, (7, 1), (7, 1)), (1, (49, -1), (1, -1)), (1, (7, -1), (7, 1))]),
    ]),
    slot(7, '先提公因數後，填另一個常數', [gcf_box(4, -6, 1), gcf_box(5, -2, -5), gcf_box(2, 3, 5)]),
    slot(8, '交錯：選出正確的因式分解（各種類型）', [
        which_right([case(1, 3, -1, 2, 1), wrong_case(x**2 - 9, 1, (1, -3), (1, -3)), wrong_case(2 * x**2 + 8 * x + 6, 2, (1, 1), (1, 4)), wrong_case(-x**2 + 5 * x - 6, -1, (1, 2), (1, 3))]),
        which_right([case(-1, 2, 1, 1, -1), wrong_case(4 * x**2 - 1, 1, (4, 1), (4, -1)), wrong_case(3 * x**2 + 6 * x + 3, 3, (1, 3), (1, 3)), wrong_case(x**2 + x - 12, 1, (1, -4), (1, 3))]),
        which_right([case(3, 1, -2, 1, -2), wrong_case(2 * x**2 - x - 3, 1, (2, 1), (1, -3)), wrong_case(-x**2 - x + 2, -1, (1, -2), (1, 1)), wrong_case(9 * x**2 + 6 * x + 1, 1, (9, 1), (1, 1))]),
    ]),
    slot(9, '提出負號：括號內每一項都變號', [pull_minus(-2 * x**2 + 3 * x + 5), pull_minus(-3 * x**2 - x + 4), pull_minus(-4 * x**2 + 3 * x + 1)]),
    slot(10, '由分解的結果求一次項係數', [coef_b(3, 1, 4, 1, -1), coef_b(2, 3, -1, 1, 2), coef_b(-1, 3, -2, 1, 1)]),
]

if __name__ == '__main__':
    export('g8-3-2d', '3-2 十字交乘法（4）先提公因數、首項為負與乘法公式 課後檢核',
           '依課本 3-2 p.134–136（例 6、例 7、例 8 與隨堂；多種正確寫法的說明）自編換數字題', SLOTS)
