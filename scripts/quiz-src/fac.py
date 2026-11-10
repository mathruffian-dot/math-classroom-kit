r"""八上 3-1 因式分解題庫共用：多項式的 LaTeX、一次式括號、數字選項、恆等式核算。

題目裡的式子都由同一組係數產生；每一個「＝」在產生器裡用 SymPy 展開核對（ident），
選項的真假也用 SymPy 判斷（statement 的 (敘述, 左式, 右式)），不手算。
    lin(2, -3)        → '2x-3'
    pt(x**2 - 4*x + 3) → 'x^2-4x+3'
"""
from sympy import Poly, Rational, expand, symbols

from quizlib import raw

x, y = symbols('x y')
R = Rational


def _mono(cx, cy, v1='x', v2='y'):
    s = ''
    if cx:
        s += v1 + (f'^{cx}' if cx > 1 else '')
    if cy:
        s += v2 + (f'^{cy}' if cy > 1 else '')
    return s


def pt(e):
    """多項式（x、y，整數係數）依降冪寫成 LaTeX，例如 3x^2-x+5。"""
    e = expand(e)
    if e == 0:
        return '0'
    p = Poly(e, x, y)
    terms = sorted(p.terms(), key=lambda t: (-(t[0][0] + t[0][1]), -t[0][0]))
    out = ''
    for i, ((dx, dy), c) in enumerate(terms):
        c = int(c)
        m = _mono(dx, dy)
        body = (str(abs(c)) if (abs(c) != 1 or not m) else '') + m
        if i == 0:
            out += ('-' if c < 0 else '') + body
        else:
            out += ('-' if c < 0 else '+') + body
    return out


def lin(a, b, v='x'):
    """一次式 ax＋b 的 LaTeX（a、b 是整數）。"""
    if a == 0:
        return str(b)
    head = ('' if a == 1 else '-' if a == -1 else str(a)) + v
    if b == 0:
        return head
    return head + (f'+{b}' if b > 0 else f'-{-b}')


def par(a, b, v='x'):
    return f'({lin(a, b, v)})'


def L(a, b, v=x):
    return a * v + b


def ident(lhs, rhs, where=''):
    """核對一個恆等式（題目、解析裡寫的每一個等號）。"""
    assert expand(lhs - rhs) == 0, f'{where}：{lhs} ≠ {rhs}'


def n(v):
    return raw(f'${v}$', v)


def npick(correct, cands):
    """正確的數字＋依序取 3 個不同的錯誤數字（常見錯法排前面）。"""
    out, seen = [n(correct)], [correct]
    for c in cands:
        if c not in seen:
            out.append(n(c))
            seen.append(c)
        if len(out) == 4:
            return out
    raise AssertionError(f'錯誤選項不夠：{correct} {cands}')


def eq(lhs_tex, rhs_tex):
    return f'${lhs_tex}={rhs_tex}$'
