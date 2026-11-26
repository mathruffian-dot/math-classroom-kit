r"""八上 3-2 十字交乘法題庫共用：因式乘積的 LaTeX、十字的文字、解析、整數解的唯一性。

所有式子由同一組係數產生；每一個「＝」都在產生器裡用 SymPy 核對（ident），
選項真假也用 SymPy 判斷（statement 的 (敘述, 左式, 右式)），不手算。
    F(2, (1, -2), (1, 4))       → (2(x-2)(x+4) 的 LaTeX, SymPy 式子)
    cross_line(1, 5, -3, -2)    → '左欄 $x$、$5x$，右欄 $-3$、$-2$'
"""
from itertools import product

from sympy import Integer, Poly, expand, factor_list, solve, symbols

from fac import ident, lin, pt, x

a_, b_, c_ = symbols('a b c')


def mx(m, v='x'):
    """m·x 的 LaTeX：1 → x、−1 → −x。"""
    return v if m == 1 else f'-{v}' if m == -1 else f'{m}{v}'


def sg(v):
    """十字右欄的數：+3、−2。"""
    return f'-{-v}' if v < 0 else f'+{v}'


def F(k, *lins):
    """k·∏(m x＋p) 的 (LaTeX, SymPy)。兩個因式相同時寫成平方。"""
    e = Integer(k)
    for m, p in lins:
        e *= m * x + p
    head = '' if k == 1 else '-' if k == -1 else str(k)
    if len(lins) == 2 and lins[0] == lins[1]:
        tex = f'{head}({lin(*lins[0])})^2'
    else:
        tex = head + ''.join(f'({lin(m, p)})' for m, p in lins)
    return tex, expand(e)


def cross_sum(m, n, p, q):
    """左欄 m x、n x，右欄 p、q：交叉相乘的和 m·q＋n·p（x 的係數）。"""
    return m * q + n * p


def sum_tex(m, n, p, q):
    """交叉相乘的和：n p x ＋ m q x ＝ …（第二項是負的加括號）。"""
    u, w = n * p, m * q
    s = u + w
    second = f'({mx(w)})' if w < 0 else mx(w)
    return f'{mx(u)}+{second}={mx(s) if s else "0"}'


def cross_line(m, n, p, q):
    return f'左欄 ${mx(m)}$、${mx(n)}$，右欄 ${sg(p)}$、${sg(q)}$'


def explain(P, k, m, n, p, q, pre=''):
    """十字交乘的解析：k(m x＋p)(n x＋q)，含交叉相乘的和；並核對恆等式。"""
    tex, e = F(k, (m, p), (n, q))
    ident(P, e, f'{pt(P)}＝{tex}')
    inner = expand(e / k) if k != 1 else e
    head = ''
    if k != 1:
        ktex = '-' if k == -1 else str(k)
        head = (rf'先提出負號（括號內每一項都變號）：${pt(P)}=-({pt(inner)})$。' if k == -1
                else rf'先提出公因數 ${ktex}$：${pt(P)}={ktex}({pt(inner)})$。')
    return (pre + head + rf'十字：{cross_line(m, n, p, q)}，交叉相乘 ${sum_tex(m, n, p, q)}$，合。'
            + rf'所以 ${pt(P)}={tex}$。')


def int_solutions(P, form, unknowns, positive=(), rng=40):
    """P ＝ form 的所有整數解（positive 裡的未知數只試 1～40，其他 −rng～rng；form 是 SymPy 式子）。"""
    coeffs = Poly(expand(P - form), x).all_coeffs()
    pos = [u for u in unknowns if u in positive]
    rest = [u for u in unknowns if u not in positive]
    out = []
    for vals in product(range(1, 41), repeat=len(pos)):
        sub = {k: Integer(v) for k, v in zip(pos, vals)}
        eqs = [expand(c.subs(sub)) for c in coeffs]
        eqs = [e for e in eqs if e != 0]
        if any(e.is_number for e in eqs):
            continue
        for s in solve(eqs, rest, dict=True):
            full = {**sub, **s}
            if len(full) == len(unknowns) and all(v.is_integer for v in full.values()):
                out.append({str(k): int(v) for k, v in full.items()})
    return out


def integer_factorable(P):
    """P 能不能分解成整係數一次式的乘積（SymPy factor_list：每個因式都是一次以下）。"""
    _, fl = factor_list(expand(P))
    return all(f.as_poly(x).degree() <= 1 for f, _ in fl)


def is_factor(P, f):
    """f 是不是 P 的因式（多項式除法的餘式為 0）。"""
    from sympy import rem
    return rem(expand(P), expand(f), x) == 0
