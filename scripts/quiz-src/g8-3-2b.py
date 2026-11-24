r"""3-2(2) 十字交乘法（二次項係數為 1、常數項為負）：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一）。

用法：C:\AI\H3\venv\Scripts\python.exe -B -X utf8 scripts/quiz-src/g8-3-2b.py
範圍：3-1 全部＋3-2(1)＋這一堂：常數項為負的 x²＋bx＋c（兩數異號，一次項為正 → 正數的絕對值較大，
為負 → 負數的絕對值較大）、x² 拆成 (−x)(−x) 結果一樣。不用二次項係數不為 1、先提公因數（後面兩堂）。
因式分解的答案是代數式：□ 填數字，或選出正確的式子（每個等號、每個選項的真假都用 SymPy 核算）。
"""
import importlib.util
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import expand  # noqa: E402

from crossfac import F, explain, mx, sg  # noqa: E402
from fac import pt, x  # noqa: E402
from quizlib import export, slot, statement  # noqa: E402

_spec = importlib.util.spec_from_file_location('g8_3_2a', Path(__file__).parent / 'g8-3-2a.py')
A = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(A)
P1, case, factor_choice, which_right, two_numbers, cross_value, other_box = A.P1, A.case, A.factor_choice, A.which_right, A.two_numbers, A.cross_value, A.other_box


# ───────── 3. 異號兩數：誰的絕對值大 ─────────
def abs_rule(p, q):
    """p、q 一正一負。"""
    P = P1(p, q)
    pos, neg = max(p, q), min(p, q)
    assert pos > 0 > neg and pos != -neg
    big_pos = pos > -neg
    opts = [('正數的絕對值較大', big_pos), ('負數的絕對值較大', not big_pos), ('兩數的絕對值相等', False), ('兩數都是負數', False)]
    opts.sort(key=lambda t: not t[1])
    b = p + q
    return statement(
        rf'用十字交乘法分解 ${pt(P)}$，常數項拆成一正一負的兩個整數。哪一個敘述正確？',
        opts,
        rf'一次項 ${mx(b)}$ 是{"正" if b > 0 else "負"}的，所以{"正數" if big_pos else "負數"}的絕對值較大：' + explain(P, 1, 1, 1, p, q))


# ───────── 6. x² 拆成 (−x)(−x) ─────────
def neg_x(p, q):
    """(x＋p)(x＋q)＝(−x−p)(−x−q)。"""
    P = P1(p, q)

    def lin2(m, c):
        return f'({mx(m)}{sg(c)})'

    good = (f'${lin2(-1, -p)}{lin2(-1, -q)}$', P, expand((-x - p) * (-x - q)))
    # 三個錯誤選項彼此不等價：(x−p)(x−q)、−(x＋p)(x＋q)、(x−p)(x＋q)
    wrongs = [
        (f'${lin2(-1, p)}{lin2(-1, q)}$', P, expand((-x + p) * (-x + q))),
        (f'${lin2(-1, -p)}{lin2(1, q)}$', P, expand((-x - p) * (x + q))),
        (f'${lin2(-1, p)}{lin2(-1, -q)}$', P, expand((-x + p) * (-x - q))),
    ]
    return statement(
        rf'${pt(P)}={F(1, (1, p), (1, q))[0]}$。下列哪一個也等於 ${pt(P)}$？',
        [good] + wrongs,
        rf'${lin2(-1, -p)}{lin2(-1, -q)}=[-{F(1, (1, p))[0]}][-{F(1, (1, q))[0]}]={F(1, (1, p), (1, q))[0]}$：兩個括號都提出負號，負負得正。只把一個括號變號，會多一個負號。')


# ───────── 7. 哪一組十字合（常數項為負） ─────────
def which_cross(p, q, wrongs):
    P = P1(p, q)
    b, c = p + q, p * q
    opts = [(f'右欄 ${sg(u)}$、${sg(v)}$', u * v == c and u + v == b) for u, v in [(p, q)] + wrongs]
    return statement(
        rf'用十字交乘法分解 ${pt(P)}$（左欄 $x$、$x$），右欄填哪兩個數才合？',
        opts,
        rf'右欄相乘要是 ${c}$、交叉相乘的和要是 ${mx(b)}$：' + explain(P, 1, 1, 1, p, q))


SLOTS = [
    slot(1, '十字交乘：常數項負、一次項正', [
        factor_choice(9, -5, [((1, -9), (1, 5)), ((1, 15), (1, -3)), ((1, 45), (1, -1))]),
        factor_choice(7, -4, [((1, -7), (1, 4)), ((1, 14), (1, -2)), ((1, 7), (1, 4))]),
        factor_choice(9, -7, [((1, -9), (1, 7)), ((1, 21), (1, -3)), ((1, 63), (1, -1))]),
    ]),
    slot(2, '十字交乘：常數項負、一次項負', [
        factor_choice(-10, 2, [((1, 10), (1, -2)), ((1, -5), (1, 4)), ((1, -20), (1, 1))]),
        factor_choice(-8, 3, [((1, 8), (1, -3)), ((1, -6), (1, 4)), ((1, -12), (1, 2))]),
        factor_choice(-5, 4, [((1, 5), (1, -4)), ((1, -10), (1, 2)), ((1, -20), (1, 1))]),
    ]),
    slot(3, '異號兩數：誰的絕對值較大', [abs_rule(8, -2), abs_rule(-8, 5), abs_rule(7, -3)]),
    slot(4, '十字：交叉相乘的和（含負數）', [cross_value(5, -9), cross_value(-4, 9), cross_value(10, -4)]),
    slot(5, '找兩數：積為負', [
        two_numbers(-18, 3, [6, -6, 3, -2]),
        two_numbers(-30, -1, [5, 6, -5, -10]),
        two_numbers(-14, 5, [7, 2, -7, -1]),
    ]),
    slot(6, '把 x² 拆成 (−x)(−x)', [neg_x(5, -4), neg_x(8, -5), neg_x(-9, 2)]),
    slot(7, '哪一組十字合（常數項為負）', [
        which_cross(-6, 4, [(6, -4), (-8, 3), (-12, 2)]),
        which_cross(10, -3, [(-10, 3), (15, -2), (30, -1)]),
        which_cross(8, -4, [(-8, 4), (16, -2), (32, -1)]),
    ]),
    slot(8, '已知一個因式，填另一個常數（常數項為負）', [other_box(-4, 6), other_box(3, -9), other_box(-5, 6)]),
    slot(9, '交錯：常數項為正或為負', [
        factor_choice(-7, 6, [((1, 7), (1, -6)), ((1, -7), (1, -6)), ((1, -14), (1, 3))]),
        factor_choice(-6, -7, [((1, 6), (1, 7)), ((1, -7), (1, 6)), ((1, -3), (1, -14))]),
        factor_choice(7, -6, [((1, -7), (1, 6)), ((1, 7), (1, 6)), ((1, 14), (1, -3))]),
    ]),
    slot(10, '常見錯誤：只檢查了相乘', [
        which_right([case(P1(4, -9), (1, 4), (1, -9)), case(P1(4, -9), (1, -4), (1, 9)), case(P1(-4, 9), (1, 4), (1, -9)), case(P1(4, -9), (1, -36), (1, 1))]),
        which_right([case(P1(-7, 4), (1, -7), (1, 4)), case(P1(-7, 4), (1, 7), (1, -4)), case(P1(7, -4), (1, -7), (1, 4)), case(P1(-7, 4), (1, -14), (1, 2))]),
        which_right([case(P1(9, -2), (1, 9), (1, -2)), case(P1(9, -2), (1, -9), (1, 2)), case(P1(-9, 2), (1, 9), (1, -2)), case(P1(9, -2), (1, 6), (1, -3))]),
    ]),
]

if __name__ == '__main__':
    export('g8-3-2b', '3-2 十字交乘法（2）二次項係數為 1（常數項為負） 課後檢核',
           '依課本 3-2 p.131（例 3 與隨堂、x² 拆成 (−x)(−x) 的說明）與 p.138 自我評量第 1 題自編換數字題', SLOTS)
