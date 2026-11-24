r"""3-2(1) 十字交乘法（二次項係數為 1、常數項為正）：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一）。

用法：C:\AI\H3\venv\Scripts\python.exe -B -X utf8 scripts/quiz-src/g8-3-2a.py
範圍：3-1 全部（因式與倍式、提公因式、乘法公式）＋這一堂：(x＋p)(x＋q)＝x²＋(p＋q)x＋pq、
十字交乘法分解常數項為正的 x²＋bx＋c（兩數同號，由一次項的正負決定同正或同負）。
不用常數項為負（3-2(2)）、二次項係數不為 1（3-2(3)）、先提公因數再十字交乘（3-2(4)）。
因式分解的答案是代數式：□ 填數字，或選出正確的式子（每個等號、每個選項的真假都用 SymPy 核算）。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import expand  # noqa: E402

from crossfac import F, cross_line, explain, integer_factorable, is_factor, mx, sg, sum_tex  # noqa: E402
from fac import ident, npick, par, pt, x  # noqa: E402
from quizlib import export, slot, statement, value  # noqa: E402


def P1(p, q):
    return expand((x + p) * (x + q))


# ───────── 1. 展開：一次項是兩數的和 ─────────
def plus(u, v):
    """u＋v 的寫法：v 是負數時加括號。"""
    return f'{u}+({v})' if v < 0 else f'{u}+{v}'


def times(u, v):
    return (f'({u})' if u < 0 else f'{u}') + r'\times ' + (f'({v})' if v < 0 else f'{v}')


def expand_mid(p, q):
    P = P1(p, q)
    s = p + q
    sign = '+' if s > 0 else '-'
    return value(
        rf'${par(1, p)}{par(1, q)}=x^2{sign}\square x+{p * q}$，□ 是多少？',
        abs(s),
        npick(abs(s), [p * q, abs(p - q), abs(s) + 1, abs(p) * 2]),
        rf'一次項的係數是 ${plus(p, q)}={s}$，常數項是 ${times(p, q)}={p * q}$：${par(1, p)}{par(1, q)}={pt(P)}$，□ 填 ${abs(s)}$。')


# ───────── 2. 找兩數：相乘是 c、相加是 b ─────────
def two_numbers(c, b, wrongs):
    pairs = [(u, c // u) for u in range(-abs(c), abs(c) + 1) if u and c % u == 0 and u + c // u == b]
    lo = min(min(pq) for pq in pairs)
    assert len({tuple(sorted(pq)) for pq in pairs}) == 1, pairs
    hi = c // lo
    return value(
        rf'兩個整數相乘是 ${c}$、相加是 ${b}$，其中較小的數是多少？',
        lo,
        npick(lo, wrongs),
        rf'${times(lo, hi)}={c}$、${plus(lo, hi)}={b}$，兩數是 ${lo}$ 和 ${hi}$，較小的是 ${lo}$。')


# ───────── 3、4. 因式分解（常數項為正） ─────────
def factor_choice(p, q, wrongs, note=''):
    P = P1(p, q)
    tex, e = F(1, (1, p), (1, q))
    opts = [(f'${tex}$', P, e)] + [(f'${F(1, *w)[0]}$', P, F(1, *w)[1]) for w in wrongs]
    return statement(rf'${pt(P)}$ 因式分解的結果是？', opts, note + explain(P, 1, 1, 1, p, q))


# ───────── 5. 兩數的正負 ─────────
def sign_rule(p, q):
    P = P1(p, q)
    both_neg = p < 0 and q < 0
    texts = [('兩個負數', both_neg), ('兩個正數', not both_neg), ('一正一負', False), ('其中一個是 $0$', False)]
    texts.sort(key=lambda t: not t[1])
    c, b = p * q, p + q
    return statement(
        rf'用十字交乘法分解 ${pt(P)}$，常數項 ${c}$ 要拆成哪一種兩個整數？',
        texts,
        rf'常數項 ${c}$ 是正的，兩數同號；一次項 ${mx(b)}$ 是{"負" if b < 0 else "正"}的，所以是{"兩個負數" if both_neg else "兩個正數"}：'
        + explain(P, 1, 1, 1, p, q))


# ───────── 6. 十字：交叉相乘的和 ─────────
def cross_value(p, q):
    s = p + q
    return value(
        rf'十字交乘時，{cross_line(1, 1, p, q)}。交叉相乘的和是幾 $x$？',
        s,
        npick(s, [p * q, -s, p - q, abs(p) + abs(q) + 1]),
        rf'左上×右下＋左下×右上：${sum_tex(1, 1, p, q)}$，是 ${s}x$。')


# ───────── 7. 哪一組十字合 ─────────
def which_cross(p, q, wrongs):
    P = P1(p, q)
    b, c = p + q, p * q
    opts = []
    for u, v in [(p, q)] + wrongs:
        ok = u * v == c and u + v == b
        opts.append((f'右欄 ${sg(u)}$、${sg(v)}$', ok))
    return statement(
        rf'用十字交乘法分解 ${pt(P)}$（左欄 $x$、$x$），右欄填哪兩個數才合？',
        opts,
        rf'右欄相乘要是 ${c}$、交叉相乘的和要是 ${mx(b)}$：' + explain(P, 1, 1, 1, p, q))


# ───────── 8. 已知一個因式，填另一個 ─────────
def other_box(p, q):
    P = P1(p, q)
    ident(P, (x + p) * (x + q))
    return value(
        rf'${pt(P)}={par(1, p)}(x+\square)$，□ 是多少？（含正負號）',
        q,
        npick(q, [p * q, -q, p + q, q + 1]),
        rf'右欄相乘：${"(" + str(p) + ")" if p < 0 else p}\times\square={p * q}$，□＝${q}$；檢查交叉相乘 ${sum_tex(1, 1, p, q)}$，合。')


# ───────── 9. 常見錯誤：哪一個分解正確 ─────────
def which_right(cases):
    """cases：[(原式, 寫法 LaTeX, 寫法 SymPy)]，第一個是唯一正確的。"""
    opts = [(f'${pt(L)}={t}$', L, R) for L, t, R in cases]
    L0, t0, _ = cases[0]
    return statement(
        '下列哪一個因式分解正確？（可以展開檢查）',
        opts,
        rf'只有 ${pt(L0)}={t0}$ 展開後和原式相同。檢查重點：右欄相乘是常數項、交叉相乘的和是一次項，正負號也要對。')


def case(P, *lins):
    tex, e = F(1, *lins)
    return (P, tex, e)


# ───────── 10. 能不能分解 ─────────
def which_factorable(pq, others):
    """第一個是 (x＋p)(x＋q)，其他三個不能分解成整係數一次式。"""
    p, q = pq
    P0 = P1(p, q)
    cands = [P0] + others
    opts = [(f'${pt(P)}$', integer_factorable(P)) for P in cands]
    return statement(
        '下列哪一個可以分解成兩個整係數一次式的乘積？',
        opts,
        explain(P0, 1, 1, 1, p, q) + '其他三個都找不到「相乘是常數項、相加是一次項係數」的兩個整數。')


SLOTS = [
    slot(1, '展開：一次項是兩數的和', [expand_mid(4, 7), expand_mid(-3, -9), expand_mid(3, 9)]),
    slot(2, '找兩數：相乘是常數項、相加是一次項', [
        two_numbers(24, 11, [8, 4, 2, -3]),
        two_numbers(18, -9, [-3, 3, -2, -18]),
        two_numbers(20, 12, [10, 4, 5, -2]),
    ]),
    slot(3, '十字交乘：常數項正、一次項正', [
        factor_choice(2, 12, [((1, 4), (1, 6)), ((1, 3), (1, 8)), ((1, -2), (1, -12))]),
        factor_choice(2, 9, [((1, 3), (1, 6)), ((1, -2), (1, -9)), ((1, 1), (1, 18))]),
        factor_choice(4, 9, [((1, 6), (1, 6)), ((1, 3), (1, 12)), ((1, -4), (1, -9))]),
    ]),
    slot(4, '十字交乘：常數項正、一次項負', [
        factor_choice(-1, -9, [((1, 1), (1, 9)), ((1, -3), (1, -3)), ((1, -1), (1, 9))]),
        factor_choice(-4, -6, [((1, -3), (1, -8)), ((1, 4), (1, 6)), ((1, -2), (1, -12))]),
        factor_choice(-2, -10, [((1, -4), (1, -5)), ((1, 2), (1, 10)), ((1, -1), (1, -20))]),
    ]),
    slot(5, '判斷兩數同為正或同為負', [sign_rule(-3, -10), sign_rule(5, 10), sign_rule(-2, -12)]),
    slot(6, '十字：交叉相乘的和', [cross_value(5, 8), cross_value(-4, -9), cross_value(5, 6)]),
    slot(7, '哪一組十字合', [
        which_cross(-4, -7, [(-2, -14), (-1, -28), (4, 7)]),
        which_cross(2, 8, [(4, 4), (1, 16), (-2, -8)]),
        which_cross(-3, -11, [(-1, -33), (3, 11), (-4, -10)]),
    ]),
    slot(8, '已知一個因式，填另一個常數', [other_box(6, 8), other_box(-2, -8), other_box(5, 9)]),
    slot(9, '常見錯誤：哪一個分解正確', [
        which_right([case(P1(2, 5), (1, 2), (1, 5)), case(P1(-2, -5), (1, 2), (1, 5)), case(P1(3, 4), (1, 2), (1, 6)), case(P1(-4, -4), (1, 4), (1, -4))]),
        which_right([case(P1(-4, -8), (1, -4), (1, -8)), case(P1(4, 8), (1, -4), (1, -8)), case(P1(4, 9), (1, 3), (1, 12)), case(P1(-1, -32), (1, -2), (1, -16))]),
        which_right([case(P1(4, 6), (1, 4), (1, 6)), case(P1(5, 5), (1, 4), (1, 6)), case(P1(-4, -6), (1, 4), (1, 6)), case(P1(3, 8), (1, 4), (1, 6))]),
    ]),
    slot(10, '判斷能不能用十字交乘分解', [
        which_factorable((1, 11), [x**2 + 7 * x + 11, x**2 + 5 * x + 10, x**2 + 3 * x + 5]),
        which_factorable((-1, -10), [x**2 - 9 * x + 19, x**2 - 9 * x + 15, x**2 + 2 * x + 9]),
        which_factorable((1, 9), [x**2 + 10 * x + 20, x**2 + 10 * x + 22, x**2 + 10 * x + 23]),
    ]),
]

if __name__ == '__main__':
    export('g8-3-2a', '3-2 十字交乘法（1）二次項係數為 1（常數項為正） 課後檢核',
           '依課本 3-2 p.128–130（(x＋p)(x＋q) 的展開、b＝p＋q 與 c＝pq、例 1、例 2 與隨堂）自編換數字題', SLOTS)
