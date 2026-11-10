r"""3-1(4) 利用乘法公式因式分解：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一）。

用法：C:\AI\H3\venv\Scripts\python.exe -B -X utf8 scripts/quiz-src/g8-3-1d.py
範圍：3-1(1)～(3)＋這一堂的平方差 a²−b²＝(a＋b)(a−b)（例 6、例 7 括號當一塊）、
和的平方 a²＋2ab＋b²＝(a＋b)²（例 8）、差的平方 a²−2ab＋b²＝(a−b)²（例 9）；先備 1-1 乘法公式。
因式以有理（整數）係數為限（教用版：x²−5 不分解成 (x＋√5)(x−√5)）。不用十字交乘、配方法、公式解（後面的單元）。
因式分解的答案是代數式：□ 填數字，或選出正確的式子／公式（每個等號都用 SymPy 核算）。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import expand, factor_list  # noqa: E402

from fac import L, ident, lin, npick, par, pt, x, y  # noqa: E402
from quizlib import export, slot, statement, value  # noqa: E402

FORMULAS = ['平方差公式', '和的平方公式', '差的平方公式']


def kind_of(P):
    """依 SymPy 分解結果判斷可以用哪一個公式（整數係數）：回傳公式名稱或 None。"""
    _, fl = factor_list(expand(P))
    if len(fl) == 1 and fl[0][1] == 2:
        f = fl[0][0]
        a1, a0 = f.coeff(x, 1), f.coeff(x, 0)
        return '和的平方公式' if a1 * a0 > 0 else '差的平方公式'
    if len(fl) == 2 and all(e == 1 for _, e in fl):
        prod = expand(fl[0][0] * fl[1][0])
        if prod.coeff(x, 1) == 0 and prod.coeff(x, 0) < 0:
            return '平方差公式'
    return None


# ───────── 1. 平方差（首項 x²） ─────────
def diff_sq(b):
    P = x**2 - b * b
    ident(P, (x + b) * (x - b))
    return value(
        rf'${pt(P)}=(x+\square)(x-{b})$，□ 是多少？',
        b,
        npick(b, [b * b, -b, 2 * b, b * b // 2 if b % 2 == 0 else b + 1]),
        rf'${pt(P)}=x^2-{b}^2=(x+{b})(x-{b})$。$a=x$、$b={b}$，□ 填的是 $b$，不是 $b^2$。')


# ───────── 2. 平方差（有係數） ─────────
def diff_sq_coef(a, b):
    P = a * a * x**2 - b * b
    ident(P, (a * x + b) * (a * x - b))
    return value(
        rf'${pt(P)}=({lin(a, b)})(\square x-{b})$，□ 是多少？',
        a,
        npick(a, [a * a, -a, b, a + 1]),
        rf'${a * a}x^2=({a}x)^2$，不是 $({a * a}x)^2$：${pt(P)}=({a}x)^2-{b}^2=({lin(a, b)})({lin(a, -b)})$。')


# ───────── 3. 括號當一塊：(x＋m)²−b² ─────────
def block_minus(m, b):
    P = (x + m)**2 - b * b
    f1, f2 = m + b, m - b
    ident(P, (x + f1) * (x + f2))
    sg, bx = ('+', f2) if f2 > 0 else ('-', -f2)
    s = 1 if f2 > 0 else -1
    return value(
        rf'${par(1, m)}^2-{b * b}={par(1, f1)}(x{sg}\square)$，□ 是多少？',
        bx,
        npick(bx, [(m - b * b) * s, -bx, (b - m) * s, b, (m * m - b * b) * s]),
        rf'把 ${par(1, m)}$ 看成 $a$、${b}$ 看成 $b$：$[{par(1, m)}+{b}][{par(1, m)}-{b}]={par(1, f1)}{par(1, f2)}$。')


# ───────── 4. 常數減括號平方 ─────────
def const_minus(a, u, v):
    """a²−(uy＋v)²＝(uy＋v＋a)(−uy−v＋a)；□ 填第二個括號的常數 a−v。"""
    P = a * a - L(u, v, y)**2
    f1 = L(u, v + a, y)
    k = a - v
    ident(P, f1 * L(-u, k, y))
    wrong = a + v  # 第二個括號後面的 v 沒變號
    return value(
        rf'${a * a}-{par(u, v, "y")}^2=({lin(u, v + a, "y")})({lin(-u, 0, "y")}+\square)$，□ 是多少？',
        k,
        npick(k, [wrong, -k, a, v]),
        rf'看成 ${a}^2-{par(u, v, "y")}^2$：$[{a}+{par(u, v, "y")}][{a}-{par(u, v, "y")}]=({lin(u, v + a, "y")})({lin(-u, k, "y")})$。'
        rf'${a}-{par(u, v, "y")}$ 的 ${v}$ 也要變號。')


# ───────── 5. 和的平方（首項 x²） ─────────
def sum_sq(b):
    P = (x + b)**2
    return value(
        rf'${pt(P)}=(x+\square)^2$，□ 是多少？',
        b,
        npick(b, [2 * b, b * b, b // 2 if b % 2 == 0 else b + 1, -b]),
        rf'首尾 $x^2$、${b * b}={b}^2$，中間項 $2\cdot x\cdot{b}={2 * b}x$ 對得上：${pt(P)}=(x+{b})^2$。')


# ───────── 6. 和的平方（有係數） ─────────
def sum_sq_coef(a, b):
    P = (a * x + b)**2
    return value(
        rf'${pt(P)}=(\square x+{b})^2$，□ 是多少？',
        a,
        npick(a, [a * a, 2 * a * b // 2 if 2 * a * b // 2 != a else a + 2, -a, a + 1]),
        rf'${a * a}x^2=({a}x)^2$、${b * b}={b}^2$，中間項 $2\cdot{a}x\cdot{b}={2 * a * b}x$ 對得上：${pt(P)}=({lin(a, b)})^2$。')


# ───────── 7. 差的平方 ─────────
def diff_square(a, b, ask):
    """(ax−b)²；ask＝'a' 填 x 的係數，'b' 填常數。"""
    P = (a * x - b)**2
    if ask == 'b':
        return value(
            rf'${pt(P)}=({lin(a, 0)}-\square)^2$，□ 是多少？',
            b,
            npick(b, [b * b, 2 * a * b, -b, b + 1]),
            rf'${b * b}={b}^2$，中間項 $-2\cdot {lin(a, 0)}\cdot{b}=-{2 * a * b}x$ 對得上：${pt(P)}=({lin(a, -b)})^2$。')
    return value(
        rf'${pt(P)}=(\square x-{b})^2$，□ 是多少？',
        a,
        npick(a, [a * a, a * b, -a, a + 1, a * b + 1]),
        rf'${a * a}x^2=({a}x)^2$，中間項 $-2\cdot{a}x\cdot{b}=-{2 * a * b}x$ 對得上：${pt(P)}=({lin(a, -b)})^2$。')


# ───────── 8. 用哪一個公式 ─────────
def which_formula(P):
    k = kind_of(P)
    assert k
    opts = [(k, True)] + [(f, False) for f in FORMULAS if f != k] + [('三個公式都不能用', False)]
    return statement(
        rf'${pt(P)}$ 可以用哪一個乘法公式因式分解？',
        opts,
        {'平方差公式': rf'兩項相減、都是平方：${pt(P)}$ 用 $a^2-b^2=(a+b)(a-b)$。',
         '和的平方公式': rf'首尾是平方、中間項是正的 $2ab$：${pt(P)}$ 用 $a^2+2ab+b^2=(a+b)^2$。',
         '差的平方公式': rf'首尾是平方、中間項是負的 $2ab$：${pt(P)}$ 用 $a^2-2ab+b^2=(a-b)^2$。'}[k])


# ───────── 9. 哪一個是完全平方 ─────────
def which_square(cands):
    """cands：多項式清單，第一個是完全平方（整數係數），其他都不是。"""
    def is_sq(P):
        return kind_of(P) in ('和的平方公式', '差的平方公式')
    opts = [(f'${pt(P)}$', is_sq(P)) for P in cands]
    P0 = cands[0]
    _, fl = factor_list(expand(P0))
    return statement(
        '下列哪一個多項式可以寫成 $(a+b)^2$ 或 $(a-b)^2$？',
        opts,
        rf'${pt(P0)}=({pt(fl[0][0])})^2$：首尾是平方，中間項剛好是 $\pm2ab$。其他的中間項對不上，或只有兩項。')


# ───────── 10. 常見錯誤：哪一個分解正確 ─────────
def which_right(cases):
    opts = [(f'${pt(l)}={t}$', l, r) for l, t, r in cases]
    l0, t0, _ = cases[0]
    return statement(
        '下列哪一個因式分解正確？（可以展開檢查）',
        opts,
        rf'只有 ${pt(l0)}={t0}$ 展開後和原式相同。檢查重點：$a$ 是平方根（$16x^2=(4x)^2$）、中間項要是 $2ab$、兩項相減才是平方差。')


SLOTS = [
    slot(1, '平方差：x²−b²', [diff_sq(6), diff_sq(7), diff_sq(9)]),
    slot(2, '平方差：係數也是平方', [diff_sq_coef(3, 4), diff_sq_coef(2, 7), diff_sq_coef(5, 1)]),
    slot(3, '平方差：括號當一塊', [block_minus(3, 5), block_minus(2, 5), block_minus(6, 2)]),
    slot(4, '平方差：常數減括號的平方', [const_minus(3, 1, 1), const_minus(6, 1, -2), const_minus(4, 2, 1)]),
    slot(5, '和的平方：x²＋2bx＋b²', [sum_sq(6), sum_sq(9), sum_sq(5)]),
    slot(6, '和的平方：首項有係數', [sum_sq_coef(3, 4), sum_sq_coef(5, 3), sum_sq_coef(4, 3)]),
    slot(7, '差的平方', [diff_square(1, 8, 'b'), diff_square(3, 2, 'a'), diff_square(5, 1, 'a')]),
    slot(8, '判斷用哪一個公式', [which_formula(x**2 - 12 * x + 36), which_formula(9 * x**2 - 4), which_formula(x**2 + 14 * x + 49)]),
    slot(9, '中間項對得上：完全平方', [
        which_square([x**2 + 6 * x + 9, x**2 + 3 * x + 9, x**2 - 9, x**2 + 6 * x + 6]),
        which_square([4 * x**2 - 4 * x + 1, 4 * x**2 - 2 * x + 1, 4 * x**2 + 1, 4 * x**2 - 4 * x - 1]),
        which_square([9 * x**2 + 30 * x + 25, 9 * x**2 + 15 * x + 25, 9 * x**2 - 25, 9 * x**2 + 30 * x - 25]),
    ]),
    slot(10, '常見錯誤：哪一個分解正確', [
        which_right([(16 * x**2 - 8 * x + 1, '(4x-1)^2', (4 * x - 1)**2), (16 * x**2 - 8 * x + 1, '(8x-1)^2', (8 * x - 1)**2),
                     (x**2 - 9, '(x-3)^2', (x - 3)**2), (x**2 + 4 * x + 4, '(x+4)^2', (x + 4)**2)]),
        which_right([(x**2 - 25, '(x+5)(x-5)', (x + 5) * (x - 5)), (x**2 + 25, '(x+5)(x-5)', (x + 5) * (x - 5)),
                     (9 * x**2 - 1, '(9x+1)(9x-1)', (9 * x + 1) * (9 * x - 1)), (x**2 - 10 * x + 25, '(x+5)^2', (x + 5)**2)]),
        which_right([(4 * x**2 + 12 * x + 9, '(2x+3)^2', (2 * x + 3)**2), (4 * x**2 + 12 * x + 9, '(4x+3)^2', (4 * x + 3)**2),
                     (x**2 + 6 * x + 9, '(x+9)^2', (x + 9)**2), (x**2 - 16, '(x-4)^2', (x - 4)**2)]),
    ]),
]

if __name__ == '__main__':
    export('g8-3-1d', '3-1 因式分解（4）利用乘法公式 課後檢核', '依課本 3-1 p.121–124（平方差、和的平方、差的平方公式，例 6～例 9 與隨堂）自編換數字題', SLOTS)
