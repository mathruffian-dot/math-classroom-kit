r"""1-1 和的平方公式：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一）。

用法：python -X utf8 scripts/quiz-src/g8-sum-square.py
範圍：只用這一堂的 (a+b)² = a² + 2ab + b²（含面積圖、心算），以及先備的分配律。
不用差的平方 (a−b)²、平方差 (a+b)(a−b)（後面的課才教）。
錯誤選項都是常見錯法：漏掉 2ab、中間項只寫 ab、係數沒有平方、和周長搞混。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import symbols  # noqa: E402

from quizlib import export, raw, slot, statement, value  # noqa: E402

x, a, b, y = symbols('x a b y')


def opt(tex, v):
    return raw(f'${tex}$', v)


def distribute(k, p, q):
    """k(px+q)。"""
    inner = f'{p}x+{q}' if p != 1 else f'x+{q}'
    right = k * (p * x + q)
    return value(rf'${k}({inner})$ 展開後是？', right,
                 [opt(f'{k * p}x+{k * q}', right), opt(f'{k * p}x+{q}', k * p * x + q), opt(f'{p if p != 1 else ""}x+{k * q}', p * x + k * q), opt(f'{k * p}x+{k + q}', k * p * x + k + q)],
                 rf'分配律：括號裡每一項都要乘 ${k}$，$${k}\times {p if p != 1 else ""}x={k * p}x$、${k}\times {q}={k * q}$。'.replace('$$', '$'))


def square(n):
    """(x+n)²。"""
    right = (x + n) ** 2
    return value(rf'$(x+{n})^2$ 展開後是？', right,
                 [opt(f'x^2+{2 * n}x+{n * n}', right), opt(f'x^2+{n * n}', x ** 2 + n * n), opt(f'x^2+{n}x+{n * n}', x ** 2 + n * x + n * n), opt(f'x^2+{2 * n}x+{2 * n}', x ** 2 + 2 * n * x + 2 * n)],
                 rf'$(x+{n})^2=x^2+2\times x\times {n}+{n}^2=x^2+{2 * n}x+{n * n}$，中間的 $2ab$ 不能漏。')


def middle(n):
    return value(rf'$(x+{n})^2=x^2+\square x+{n * n}$，$\square$ 應填多少？', 2 * n,
                 [opt(str(2 * n), 2 * n), opt(str(n), n), opt(str(n * n), n * n), opt('2', 2)],
                 rf'中間項是 $2ab=2\times x\times {n}={2 * n}x$。')


def mental(tens, ones):
    """(10·tens + ones)²，ones 小。"""
    big = tens * 10
    n = big + ones
    right = n * n
    return value(rf'用和的平方公式心算：${n}^2=$？', right,
                 [opt(str(right), right), opt(str(big * big + ones * ones), big * big + ones * ones), opt(str(big * big + big * ones + ones * ones), big * big + big * ones + ones * ones), opt(str(big * big + 2 * big * ones), big * big + 2 * big * ones)],
                 rf'${n}^2=({big}+{ones})^2={big}^2+2\times {big}\times {ones}+{ones}^2={big * big}+{2 * big * ones}+{ones * ones}={right}$。')


def coef(p, q):
    """(px+q)²，p ≥ 2。"""
    right = (p * x + q) ** 2
    return value(rf'$({p}x+{q})^2$ 展開後是？', right,
                 [opt(f'{p * p}x^2+{2 * p * q}x+{q * q}', right), opt(f'{p * p}x^2+{q * q}', p * p * x ** 2 + q * q), opt(f'{p}x^2+{2 * p * q}x+{q * q}', p * x ** 2 + 2 * p * q * x + q * q), opt(f'{p * p}x^2+{p * q}x+{q * q}', p * p * x ** 2 + p * q * x + q * q)],
                 rf'$({p}x)^2={p * p}x^2$，$2\times {p}x\times {q}={2 * p * q}x$，${q}^2={q * q}$。係數也要平方。')


def letters(p, q):
    """(pa+qb)²，其中一個係數是 1。"""
    A = 'a' if p == 1 else f'{p}a'
    B = 'b' if q == 1 else f'{q}b'
    right = (p * a + q * b) ** 2
    pp = '' if p * p == 1 else str(p * p)
    qq = '' if q * q == 1 else str(q * q)
    return value(rf'$({A}+{B})^2$ 展開後是？', right,
                 [opt(f'{pp}a^2+{2 * p * q}ab+{qq}b^2', right), opt(f'{pp}a^2+{qq}b^2', p * p * a ** 2 + q * q * b ** 2), opt(f'{pp}a^2+{p * q if p * q != 1 else ""}ab+{qq}b^2', p * p * a ** 2 + p * q * a * b + q * q * b ** 2), opt(f'{pp}a^2+{2 * p * q}ab+{q if q != 1 else ""}b^2' if q != 1 else f'{p}a^2+{2 * p * q}ab+b^2', p * p * a ** 2 + 2 * p * q * a * b + q * b ** 2 if q != 1 else p * a ** 2 + 2 * p * q * a * b + b ** 2)],
                 rf'$a$ 項 ${A}$、$b$ 項 ${B}$：平方、平方，中間 $2\times {A}\times {B}={2 * p * q}ab$。')


def area(A, B):
    two = 2 * A * B
    return value(rf'邊長 $a+b$ 的正方形切成四塊，$a={A}$、$b={B}$。兩塊長方形 $ab$ 合計的面積是？', two,
                 [opt(str(two), two), opt(str(A * B), A * B), opt(str((A + B) ** 2), (A + B) ** 2), opt(str(A * A + B * B), A * A + B * B)],
                 rf'兩塊長方形各是 $ab={A}\times {B}={A * B}$，合計 $2ab={two}$。整個正方形是 $(a+b)^2={(A + B) ** 2}$。')


def side(p, q):
    """邊長 (px+q) 的正方形面積。"""
    s = p * x + q
    right = s ** 2
    S_ = 'x' if p == 1 else f'{p}x'
    pp = '' if p == 1 else str(p * p)
    return value(rf'邊長 $({S_}+{q})$ 公分的正方形，面積是多少平方公分？', right,
                 [opt(f'{pp}x^2+{2 * p * q}x+{q * q}', right), opt(f'{pp}x^2+{q * q}', p * p * x ** 2 + q * q), opt(f'{p if p != 1 else ""}x^2+{2 * p * q}x+{q * q}' if p != 1 else f'x^2+{q}x+{q * q}', p * x ** 2 + 2 * p * q * x + q * q if p != 1 else x ** 2 + q * x + q * q), opt(f'{4 * p}x+{4 * q}', 4 * p * x + 4 * q)],
                 rf'面積＝邊長的平方＝$({S_}+{q})^2$。$4\times$邊長是周長，不是面積。')


SLOTS = [
    slot(1, '分配律（先備）', [distribute(3, 1, 4), distribute(5, 2, 1), distribute(4, 3, 2)]),
    slot(2, '(x+n)² 展開', [square(3), square(5), square(4)]),
    slot(3, '中間項 2ab 的係數', [middle(7), middle(6), middle(9)]),
    slot(4, '心算：兩位數的平方', [mental(4, 1), mental(3, 1), mental(5, 1)]),
    slot(5, '心算：一百多的平方', [mental(10, 2), mental(10, 3), mental(20, 1)]),
    slot(6, '係數不是 1：(px+q)²', [coef(2, 3), coef(3, 1), coef(2, 5)]),
    slot(7, '兩個字母：(a+kb)²', [letters(1, 2), letters(2, 1), letters(1, 3)]),
    slot(8, '面積圖：兩塊 ab', [area(30, 4), area(20, 3), area(50, 2)]),
    slot(9, '正方形面積（應用）', [side(1, 2), side(1, 5), side(2, 1)]),
    slot(10, '哪一個展開正確？', [
        statement('下列哪一個是正確的？', [
            (r'$(x+1)^2=x^2+2x+1$', (x + 1) ** 2, x ** 2 + 2 * x + 1),
            (r'$(x+1)^2=x^2+1$', (x + 1) ** 2, x ** 2 + 1),
            (r'$(x+1)^2=x^2+x+1$', (x + 1) ** 2, x ** 2 + x + 1),
            (r'$(2x)^2=2x^2$', (2 * x) ** 2, 2 * x ** 2)],
            r'$(x+1)^2=x^2+2x+1$；平方不能只把兩項分開平方，$(2x)^2=4x^2$。'),
        statement('下列哪一個是正確的？', [
            (r'$51^2=2500+100+1$', 51 ** 2, 2500 + 100 + 1),
            (r'$51^2=2500+1$', 51 ** 2, 2500 + 1),
            (r'$51^2=2500+50+1$', 51 ** 2, 2500 + 50 + 1),
            (r'$(50+1)^2=2500+2$', 51 ** 2, 2502)],
            r'$51^2=(50+1)^2=50^2+2\times50\times1+1^2=2500+100+1=2601$。'),
        statement('下列哪一個是正確的？', [
            (r'$(3+y)^2=9+6y+y^2$', (3 + y) ** 2, 9 + 6 * y + y ** 2),
            (r'$(3+y)^2=9+y^2$', (3 + y) ** 2, 9 + y ** 2),
            (r'$(3+y)^2=9+3y+y^2$', (3 + y) ** 2, 9 + 3 * y + y ** 2),
            (r'$(3y)^2=3y^2$', (3 * y) ** 2, 3 * y ** 2)],
            r'$(3+y)^2=3^2+2\times3\times y+y^2=9+6y+y^2$；$(3y)^2=9y^2$。'),
    ]),
]

if __name__ == '__main__':
    export('g8-sum-square', '1-1 和的平方公式：課後檢核', '八年級 1-1 乘法公式（和的平方）；題目自編，答案已用 SymPy 核算', SLOTS)
