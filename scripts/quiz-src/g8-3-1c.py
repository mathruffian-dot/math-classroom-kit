r"""3-1(3) 一整塊的公因式與變號：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一）。

用法：C:\AI\H3\venv\Scripts\python.exe -B -X utf8 scripts/quiz-src/g8-3-1c.py
範圍：3-1(1)(2)＋這一堂的「隱形的 1」：(x＋3)C＋C＝C(x＋3＋1)、公因式位置不同（例 4(2)）、
b−a＝−(a−b) 變號後提公因式（例 5(1)）、(5−2x)²＝(2x−5)² 平方後負號消失（例 5(2)）、兩個負號相乘變加號。
不用乘法公式分解（3-1(4) 的平方差、完全平方）。
因式分解的答案是代數式：□ 填數字，或選出正確的式子／改寫（每個等號都用 SymPy 核算）。
"""
import sys
from math import gcd
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import expand  # noqa: E402

from fac import L, ident, lin, npick, par, pt, x  # noqa: E402
from quizlib import export, slot, statement, value  # noqa: E402


def sgn_box(k):
    return ('+', k) if k > 0 else ('-', -k)


def const(k):
    return f'+{k}' if k > 0 else f'{k}'


def rev(p, q):
    """常數在前的寫法 p−qx（課本的 3−x、5−2x）。"""
    return f'{p}-{"" if q == 1 else q}x'


# ───────── 1. 補上隱形的 1（加號） ─────────
def plus_one(a, b, u, v):
    """(ax＋b)(ux＋v)＋(ux＋v)＝(ux＋v)(ax＋b＋1)。"""
    C = par(u, v)
    E = L(a, b) * L(u, v) + L(u, v)
    ident(E, L(u, v) * L(a, b + 1))
    k = b + 1
    sg, bx = sgn_box(k)
    s = 1 if k > 0 else -1
    return value(
        rf'${par(a, b)}{C}+{C}={C}({lin(a, 0)}{sg}\square)$，□ 是多少？',
        bx,
        npick(bx, [b * s, (b + 2) * s, -bx, (b * v) * s]),
        rf'第二項是 $1\times{C}$：${C}[{par(a, b)}+1]={C}({lin(a, k)})$，□＝${bx}$。提走之後剩下的是 $1$，不是 $0$。')


# ───────── 2. 補上隱形的 1（減號） ─────────
def minus_one(a, b, u, v):
    """(ax＋b)(ux＋v)−(ux＋v)＝(ux＋v)(ax＋b−1)。"""
    C = par(u, v)
    E = L(a, b) * L(u, v) - L(u, v)
    k = b - 1
    assert k != 0 and gcd(a, abs(k)) == 1
    ident(E, L(u, v) * L(a, k))
    sg, bx = sgn_box(k)
    s = 1 if k > 0 else -1
    return value(
        rf'${par(a, b)}{C}-{C}={C}({lin(a, 0)}{sg}\square)$，□ 是多少？',
        bx,
        npick(bx, [b * s, (b + 1) * s, -bx, (b - 2) * s]),
        rf'第二項是 $1\times{C}$：${C}[{par(a, b)}-1]={C}({lin(a, k)})$，□＝${bx}$。')


# ───────── 3. 公因式位置不同，中間是減號 ─────────
def swap_minus(a, b, u, v, c, d):
    """(ax＋b)(ux＋v)−(ux＋v)(cx＋d)＝(ux＋v)((a−c)x＋(b−d))。"""
    C = par(u, v)
    E = L(a, b) * L(u, v) - L(u, v) * L(c, d)
    k = b - d
    assert a - c > 0 and gcd(a - c, abs(k)) == 1 and k != 0
    ident(E, L(u, v) * L(a - c, k))
    sg, bx = sgn_box(k)
    s = 1 if k > 0 else -1
    return value(
        rf'${par(a, b)}{C}-{C}{par(c, d)}={C}({lin(a - c, 0)}{sg}\square)$，□ 是多少？',
        bx,
        npick(bx, [(b + d) * s, -bx, d * s, b * s, (k + 1) * s]),
        rf'公因式 ${C}$ 在第一項後面、第二項前面：${C}[{par(a, b)}-{par(c, d)}]={C}({lin(a, b)}-{lin(c, 0)}{const(-d)})={C}({lin(a - c, k)})$。')


# ───────── 4. 一次方變號 ─────────
def flip_one(k, p, q):
    """k(p−qx)＝−k(qx−p)。"""
    E = k * (p - q * x)
    t = rev(p, q)
    opts = [
        (f'${k}({t})=-{k}({lin(q, -p)})$', E, -k * L(q, -p)),
        (f'${k}({t})={k}({lin(q, -p)})$', E, k * L(q, -p)),
        (f'${k}({t})=-{k}({lin(q, p)})$', E, -k * L(q, p)),
        (f'${k}({t})=-{k}({lin(-q, -p)})$', E, -k * L(-q, -p)),
    ]
    return statement(
        '下列哪一個變號的等式正確？',
        opts,
        rf'${t}=-({lin(q, -p)})$：括號內兩項都變號，外面多一個負號。所以 ${k}({t})=-{k}({lin(q, -p)})$。')


# ───────── 5. 平方後負號消失 ─────────
def flip_square(p, q):
    """(p−qx)²＝(qx−p)²。"""
    E = (p - q * x)**2
    t = rev(p, q)
    opts = [
        (f'$({lin(q, -p)})^2$', E, L(q, -p)**2),
        (f'$-({lin(q, -p)})^2$', E, -L(q, -p)**2),
        (f'$({lin(q, p)})^2$', E, L(q, p)**2),
        (f'$-({lin(q, p)})^2$', E, -L(q, p)**2),
    ]
    return statement(
        rf'$({t})^2$ 等於下列哪一個？',
        opts,
        rf'${t}=-({lin(q, -p)})$，平方後 $(-1)^2=1$：$({t})^2=({lin(q, -p)})^2$，不用多負號。')


# ───────── 6. 先變號再提公因式 ─────────
def flip_extract(a, k, m):
    """ax(x−m)＋k(m−x)＝(x−m)(ax−k)。"""
    E = a * x * (x - m) + k * (m - x)
    ident(E, (x - m) * (a * x - k))
    return value(
        rf'${a}x(x-{m})+{k}({m}-x)=(x-{m})({a}x-\square)$，□ 是多少？',
        k,
        npick(k, [-k, m, k + m, a * k]),
        rf'${k}({m}-x)=-{k}(x-{m})$，加號變減號：${a}x(x-{m})-{k}(x-{m})=(x-{m})({a}x-{k})$。'
        rf'忘了變號會得到 $(x-{m})({a}x+{k})$。')


# ───────── 7. 兩個負號相乘變加號 ─────────
def double_neg(a, b, m, c, d):
    """(ax＋b)(x−m)−(m−x)(cx＋d)＝(x−m)((a＋c)x＋(b＋d))。"""
    E = L(a, b) * (x - m) - (m - x) * L(c, d)
    k = b + d
    assert gcd(a + c, abs(k)) == 1 and k != 0
    ident(E, (x - m) * L(a + c, k))
    sg, bx = sgn_box(k)
    s = 1 if k > 0 else -1
    return value(
        rf'${par(a, b)}(x-{m})-({m}-x){par(c, d)}=(x-{m})({a + c}x{sg}\square)$，□ 是多少？',
        bx,
        npick(bx, [(b - d) * s, -bx, d * s, (b - d + 1) * s, (k + 1) * s]),
        rf'$-({m}-x)=+(x-{m})$：兩個負號相乘變加號。原式 $={par(a, b)}(x-{m})+(x-{m}){par(c, d)}=(x-{m})({lin(a + c, k)})$。')


# ───────── 8. 平方項變號再提公因式 ─────────
def square_extract(u, v, c, d, sign):
    """(v−ux)²＋sign·(cx＋d)(ux−v)＝(ux−v)[(ux−v)＋sign·(cx＋d)]；□ 填結果一次式的常數。"""
    B = L(u, -v)
    E = (v - u * x)**2 + sign * L(c, d) * B
    inner = expand(B + sign * L(c, d))
    a1, a0 = int(inner.coeff(x, 1)), int(inner.coeff(x, 0))
    ident(E, B * inner)
    assert a1 != 0 and a0 != 0
    sg, bx = sgn_box(a0)
    s = 1 if a0 > 0 else -1
    op = '+' if sign > 0 else '-'
    wrong_minus = expand(-B + sign * L(c, d)).coeff(x, 0)  # 平方也加了負號
    return value(
        rf'$({rev(v, u)})^2{op}{par(c, d)}{par(u, -v)}={par(u, -v)}({lin(a1, 0)}{sg}\square)$，□ 是多少？',
        bx,
        npick(bx, [int(wrong_minus) * s, -bx, (a0 + 2 * v) * s, v, (a0 - 2 * d * sign) * s]),
        rf'$({rev(v, u)})^2={par(u, -v)}^2$（平方後負號消失），再提出 ${par(u, -v)}$：'
        rf'${par(u, -v)}[{par(u, -v)}{op}{par(c, d)}]={par(u, -v)}({pt(inner)})$。')


# ───────── 9. 選出能提公因式的改寫 ─────────
def rewrite(a, m, k):
    """ax(x−m)＋k(m−x) 的正確改寫：ax(x−m)−k(x−m)。"""
    E = a * x * (x - m) + k * (m - x)
    return statement(
        rf'分解 ${a}x(x-{m})+{k}({m}-x)$ 時，先改寫成哪一個才正確？',
        [(f'${a}x(x-{m})-{k}(x-{m})$', E, a * x * (x - m) - k * (x - m)),
         (f'${a}x(x-{m})+{k}(x-{m})$', E, a * x * (x - m) + k * (x - m)),
         (f'${a}x(x-{m})-{k}(x+{m})$', E, a * x * (x - m) - k * (x + m)),
         (f'${a}x({m}-x)+{k}({m}-x)$', E, a * x * (m - x) + k * (m - x))],
        rf'只改第二項：${k}({m}-x)=-{k}(x-{m})$，所以原式 $={a}x(x-{m})-{k}(x-{m})=(x-{m})({a}x-{k})$。'
        rf'把兩個括號都換方向，第一項的值就變了。')


# ───────── 10. 補 1 或變號：選出完整的結果 ─────────
def mixed(E, tex, right, wrongs, expl):
    opts = [(f'${right[0]}$', E, right[1])] + [(f'${t}$', E, e) for t, e in wrongs]
    return statement(rf'${tex}$ 因式分解的結果是？', opts, expl)


SLOTS = [
    slot(1, '補上隱形的 1（相加）', [plus_one(1, 6, 3, 1), plus_one(3, 1, 1, -5), plus_one(1, -6, 1, 3)]),
    slot(2, '補上隱形的 1（相減）', [minus_one(1, 2, 3, -1), minus_one(3, 5, 1, -4), minus_one(1, -7, 2, 3)]),
    slot(3, '公因式位置不同：中括號與變號', [
        swap_minus(4, 1, 1, 2, 1, -3), swap_minus(5, -1, 2, 3, 1, 2), swap_minus(2, 7, 1, -5, 1, 1)]),
    slot(4, '一次方變號：多一個負號', [flip_one(4, 3, 1), flip_one(5, 2, 1), flip_one(2, 7, 3)]),
    slot(5, '平方後負號消失', [flip_square(5, 2), flip_square(3, 1), flip_square(7, 4)]),
    slot(6, '先變號再提公因式', [flip_extract(3, 4, 2), flip_extract(5, 2, 3), flip_extract(4, 7, 1)]),
    slot(7, '兩個負號相乘變加號', [double_neg(1, 2, 4, 2, -1), double_neg(3, -1, 2, 1, 4), double_neg(2, 5, 1, 3, -2)]),
    slot(8, '平方項變號後提公因式', [
        square_extract(3, 4, 1, -1, -1), square_extract(1, 3, 2, 1, 1), square_extract(2, 5, 1, 4, 1)]),
    slot(9, '選出正確的變號改寫', [rewrite(4, 3, 5), rewrite(2, 5, 3), rewrite(6, 1, 5)]),
    slot(10, '補 1、變號綜合：完整的結果', [
        mixed((x + 5) * (2 * x - 3) + (3 - 2 * x), '(x+5)(2x-3)+(3-2x)',
              ('(2x-3)(x+4)', (2 * x - 3) * (x + 4)),
              [('(2x-3)(x+6)', (2 * x - 3) * (x + 6)), ('(2x-3)(x+5)', (2 * x - 3) * (x + 5)), ('(2x-3)(x-4)', (2 * x - 3) * (x - 4))],
              r'$3-2x=-(2x-3)=-1\cdot(2x-3)$：原式 $=(2x-3)[(x+5)-1]=(2x-3)(x+4)$。'),
        mixed(3 * x * (x + 2) - (x + 2), '3x(x+2)-(x+2)',
              ('(x+2)(3x-1)', (x + 2) * (3 * x - 1)),
              [('3x(x+2)', 3 * x * (x + 2)), ('(x+2)(3x+1)', (x + 2) * (3 * x + 1)), ('(x+2)^2\\cdot 3x', (x + 2)**2 * 3 * x)],
              r'第二項是 $1\times(x+2)$：原式 $=(x+2)(3x-1)$。提走之後剩 $1$，不是 $0$。'),
        mixed((x - 4)**2 - (4 - x) * (x + 1), '(x-4)^2-(4-x)(x+1)',
              ('(x-4)(2x-3)', (x - 4) * (2 * x - 3)),
              [('(x-4)(-5)', (x - 4) * -5), ('(x-4)(2x+5)', (x - 4) * (2 * x + 5)), ('-(x-4)(2x-3)', -(x - 4) * (2 * x - 3))],
              r'$-(4-x)=+(x-4)$：原式 $=(x-4)^2+(x-4)(x+1)=(x-4)[(x-4)+(x+1)]=(x-4)(2x-3)$。'),
    ]),
]

if __name__ == '__main__':
    export('g8-3-1c', '3-1 因式分解（3）一整塊的公因式與變號 課後檢核', '依課本 3-1 p.119–120（例 4 補 1 提公因式、例 5 變號、隨堂）自編換數字題', SLOTS)
