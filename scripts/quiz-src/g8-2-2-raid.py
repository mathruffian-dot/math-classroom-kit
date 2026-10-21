r"""2-2 根式的運算：魔王戰題庫（三類題目，四選一，全部用 SymPy 核算）。

用法：python -X utf8 scripts/quiz-src/g8-2-2-raid.py
出現時機：2-2 的最後一堂（2-2(4)）結束後，放在 g8-2-2d 的最後一頁。
範圍：2-2(1)～(4) 全部，以及先備的 2-1（平方根、估算）與第 1 章乘法公式；不用 2-3 的畢氏定理。
三類題目（學生自己選要做哪一類）：
- attack（記憶）：普通攻擊。一步就能算完的基本運算。
- shield（理解）：防護罩。判斷相等、比大小、同類方根、估算、找出正確的算法。
- ultimate（應用）：大招。多步驟、綜合運算、生活應用（長方形、正方形的面積與周長）。
題庫＝前 4 堂的課後檢核題（依類型分配）＋這裡新增的換數字題與較難的應用題。
"""
import importlib.util
import json
import sys
from math import isqrt
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import Rational, nsimplify, sqrt  # noqa: E402

from geom import BLUE, PEACH, Fig  # noqa: E402
from quizlib import ROOT, check_item, item_json, rad, raw, statement, value  # noqa: E402

R = Rational
S = sqrt
HERE = Path(__file__).parent


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), HERE / f'{name}.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ───────── 前 4 堂的題位依類型分配 ─────────
FROM_LESSONS = {
    'g8-2-2a': {'attack': ['q1', 'q2', 'q3', 'q4', 'q5', 'q8'], 'shield': ['q7', 'q10'], 'ultimate': ['q6', 'q9']},
    'g8-2-2b': {'attack': ['q1', 'q2', 'q3', 'q4', 'q5'], 'shield': ['q9', 'q10'], 'ultimate': ['q6', 'q7', 'q8']},
    'g8-2-2c': {'attack': ['q1', 'q3'], 'shield': ['q2', 'q9', 'q10'], 'ultimate': ['q4', 'q5', 'q6', 'q7', 'q8']},
    'g8-2-2d': {'attack': ['q1', 'q2', 'q3', 'q4'], 'shield': ['q8', 'q10'], 'ultimate': ['q5', 'q6', 'q7', 'q9']},
}


# ───────── 小工具 ─────────
def simp(n):
    """√n ＝ c√m（m 沒有平方因數）。"""
    c, m = 1, n
    k = 2
    while k * k <= m:
        while m % (k * k) == 0:
            m //= k * k
            c *= k
        k += 1
    return c, m


def r(c, n, den=1):
    """根式選項 c√n／den（自動化成最簡）。"""
    k, m = simp(n)
    t, v, _ = rad(c * k, m, den)
    return raw(t, v)


def num_opt(v):
    v = nsimplify(v)
    if v.q == 1:
        return raw(f'${v.p}$', v)
    return raw(rf'$\dfrac{{{v.p}}}{{{v.q}}}$' if v.p > 0 else rf'$-\dfrac{{{-v.p}}}{{{v.q}}}$', v)


def tex_r(c, n):
    k, m = simp(n)
    return rad(c * k, m)[0].strip('$')


def rect_fig(w, h, wl, hl, fill=PEACH):
    """長方形（寬 w、高 h，標籤 wl、hl）。"""
    f = Fig(420, 220)
    A, B, C, D = f.pt('', 0, 0, False), f.pt('', w, 0, False), f.pt('', w, h, False), f.pt('', 0, h, False)
    f.pt('', w + max(w, h) * 0.45, h / 2, False)  # 右邊留位置給高的標籤
    f.poly([A, B, C, D], fill=fill)
    f.right(A, B, D)
    f.side(A, B, wl, away=C)
    f.side(B, C, hl, away=A)
    return f.svg()


def squares_fig(a, b, la, lb):
    """兩個正方形並排（面積 a、b）。"""
    sa, sb = float(S(a)), float(S(b))
    f = Fig(420, 220)
    p = [f.pt('', 0, 0, False), f.pt('', sa, 0, False), f.pt('', sa, sa, False), f.pt('', 0, sa, False)]
    q = [f.pt('', sa, 0, False), f.pt('', sa + sb, 0, False), f.pt('', sa + sb, sb, False), f.pt('', sa, sb, False)]
    f.poly(p, fill=PEACH)
    f.poly(q, fill=BLUE)
    f.text(sa / 2, sa / 2, la, 15)
    f.text(sa + sb / 2, sb / 2, lb, 15)
    return f.svg()


# ───────── 新增：記憶（普通攻擊） ─────────
def mul(a, b):
    k, m = simp(a * b)
    return value(rf'$\sqrt{{{a}}}\times\sqrt{{{b}}}=$？', S(a * b),
                 [r(1, a * b), r(1, a + b), raw(f'${a * b}$', a * b), r(a, b)],
                 rf'$\sqrt{{{a}}}\times\sqrt{{{b}}}=\sqrt{{{a * b}}}$' + (rf'$={tex_r(1, a * b)}$' if k > 1 else '') + '。')


def simplify_n(k, m):
    n = k * k * m
    # 「m√k」當錯誤選項；k 是平方數（例如 4）時改用 (k＋1)√m，免得出現 2√4 這種寫法
    swap = raw(rad(m, k)[0], m * S(k)) if isqrt(k) ** 2 != k else raw(rad(k + 1, m)[0], (k + 1) * S(m))
    return value(rf'把 $\sqrt{{{n}}}$ 化成最簡根式。', S(n),
                 [r(k, m), swap, raw(rad(k * k, m)[0], k * k * S(m)), raw(rf'$\sqrt{{{k * m}}}$', S(k * m))],
                 rf'$\sqrt{{{n}}}=\sqrt{{{k * k}\times{m}}}={k}\sqrt{{{m}}}$，把平方因數 ${k * k}$ 開出來變成 ${k}$。')


def like_add(p, q, n):
    c = lambda k: '' if k == 1 else str(k)  # noqa: E731
    return value(rf'${c(p)}\sqrt{{{n}}}+{c(q)}\sqrt{{{n}}}=$？', (p + q) * S(n),
                 [raw(rad(p + q, n)[0], (p + q) * S(n)), raw(rad(p + q, 2 * n)[0], (p + q) * S(2 * n)), raw(rad(p * q, n)[0], p * q * S(n)), raw(f'${p + q}$', p + q)],
                 rf'同類方根，係數相加、根號不變：$({p}+{q})\sqrt{{{n}}}={p + q}\sqrt{{{n}}}$。')


# ───────── 新增：理解（防護罩） ─────────
def equal_to(k, m):
    """反過來想：係數移進根號。k√m ＝ √(k²m)。"""
    n = k * k * m
    return value(rf'下列哪一個和 ${k}\sqrt{{{m}}}$ 相等？', k * S(m),
                 [raw(rf'$\sqrt{{{n}}}$', S(n)), raw(rf'$\sqrt{{{k * m}}}$', S(k * m)), raw(rf'$\sqrt{{{k * k + m}}}$', S(k * k + m)), raw(rf'$\sqrt{{{k * m * m}}}$', S(k * m * m))],
                 rf'係數移進根號要平方：${k}\sqrt{{{m}}}=\sqrt{{{k}^2\times{m}}}=\sqrt{{{n}}}$。')


def like_root(base, right, wrongs):
    opts = [(rf'$\sqrt{{{right}}}$', (S(right) / S(base)).is_rational)] + [(rf'$\sqrt{{{w}}}$', (S(w) / S(base)).is_rational) for w in wrongs]
    k, m = simp(right)
    return statement(rf'下列哪一個和 $\sqrt{{{base}}}$ 是同類方根？', opts,
                     rf'化成最簡根式後根號裡一樣才是同類方根：$\sqrt{{{right}}}={k}\sqrt{{{m}}}$；其他的化簡後根號裡不是 ${base}$。')


def estimate(n):
    a = isqrt(n)
    assert a * a != n
    opts = [(f'${a}$ 和 ${a + 1}$ 之間', True), (f'${a - 1}$ 和 ${a}$ 之間', False), (f'${a + 1}$ 和 ${a + 2}$ 之間', False), (f'${n // 2}$ 和 ${n // 2 + 1}$ 之間', False)]
    return statement(rf'$\sqrt{{{n}}}$ 介於哪兩個連續整數之間？', opts,
                     rf'${a}^2={a * a}$、${a + 1}^2={(a + 1) ** 2}$，${a * a}<{n}<{(a + 1) ** 2}$，所以 ${a}<\sqrt{{{n}}}<{a + 1}$。')


def largest(items):
    """items：[(LaTeX, 值)…]；正確的是最大的那一個（放第一個）。"""
    vals = [v for _, v in items]
    top = max(vals, key=lambda x: float(x))
    opts = sorted(items, key=lambda x: -float(x[1]))
    return statement('下列哪一個最大？', [(t, v == top) for t, v in opts],
                     '把係數移進根號再比：' + '、'.join('$' + t.strip('$') + rf'=\sqrt{{{nsimplify(v * v)}}}$' for t, v in opts) + '。')


def rationalized(a, b):
    v = R(a) / S(b)
    return value(rf'下列哪一個等於 $\dfrac{{{a}}}{{\sqrt{{{b}}}}}$？', v,
                 [num_or_rad(v), raw(rad(a, b)[0], a * S(b)), raw(rf'$\sqrt{{\dfrac{{{R(b, a).p}}}{{{R(b, a).q}}}}}$' if R(b, a).q != 1 else rf'$\sqrt{{{R(b, a).p}}}$', S(R(b, a))), raw(rf'$\dfrac{{\sqrt{{{a}}}}}{{{b}}}$', S(a) / b)],
                 rf'分子分母同乘 $\sqrt{{{b}}}$：$\dfrac{{{a}\sqrt{{{b}}}}}{{{b}}}$，再約分。')


def num_or_rad(v):
    """c√m／d 的選項。"""
    v = nsimplify(v)
    c2 = v * v
    p, q = c2.p, c2.q
    # v = √(p/q) = √(pq)/q
    k, m = simp(p * q)
    from math import gcd
    g = gcd(k, q)
    t, val, _ = rad(k // g, m, q // g)
    return raw(t, val)


def rule_check(a, b, kind):
    """「哪一個正確」：只有一個是對的運算規則。"""
    if kind == 1:
        opts = [(rf'$\sqrt{{{a}}}\times\sqrt{{{b}}}=\sqrt{{{a * b}}}$', S(a) * S(b), S(a * b)),
                (rf'$\sqrt{{{a}}}+\sqrt{{{b}}}=\sqrt{{{a + b}}}$', S(a) + S(b), S(a + b)),
                (rf'$(\sqrt{{{a}}}+\sqrt{{{b}}})^2={a + b}$', (S(a) + S(b)) ** 2, a + b),
                (rf'$\sqrt{{{a}}}\times\sqrt{{{a}}}={a * a}$', S(a) * S(a), a * a)]
        why = rf'根號可以相乘：$\sqrt{{{a}}}\times\sqrt{{{b}}}=\sqrt{{{a * b}}}$；但根號不能相加，$(\sqrt{{{a}}}+\sqrt{{{b}}})^2$ 還有中間項，$\sqrt{{{a}}}\times\sqrt{{{a}}}={a}$。'
    elif kind == 2:
        opts = [(rf'$(\sqrt{{{a}}}+\sqrt{{{b}}})(\sqrt{{{a}}}-\sqrt{{{b}}})={a - b}$', (S(a) + S(b)) * (S(a) - S(b)), a - b),
                (rf'$\sqrt{{{a}}}-\sqrt{{{b}}}=\sqrt{{{a - b}}}$', S(a) - S(b), S(a - b)),
                (rf'$(\sqrt{{{a}}}-\sqrt{{{b}}})^2={a - b}$', (S(a) - S(b)) ** 2, a - b),
                (rf'$2\sqrt{{{a}}}=\sqrt{{{2 * a}}}$', 2 * S(a), S(2 * a))]
        why = rf'平方差：$(\sqrt{{{a}}}+\sqrt{{{b}}})(\sqrt{{{a}}}-\sqrt{{{b}}})={a}-{b}={a - b}$；$2\sqrt{{{a}}}=\sqrt{{{4 * a}}}$，不是 $\sqrt{{{2 * a}}}$。'
    else:
        opts = [(rf'$\dfrac{{1}}{{\sqrt{{{a}}}}}=\dfrac{{\sqrt{{{a}}}}}{{{a}}}$', 1 / S(a), S(a) / a),
                (rf'$\dfrac{{1}}{{\sqrt{{{a}}}}}=\sqrt{{{a}}}$', 1 / S(a), S(a)),
                (rf'$\sqrt{{{a}}}\div\sqrt{{{b}}}=\sqrt{{{a - b}}}$', S(a) / S(b), S(a - b)),
                (rf'$\sqrt{{{a * b}}}=\sqrt{{{a}}}+\sqrt{{{b}}}$', S(a * b), S(a) + S(b))]
        why = rf'分母有理化：分子分母同乘 $\sqrt{{{a}}}$，$\dfrac{{1}}{{\sqrt{{{a}}}}}=\dfrac{{\sqrt{{{a}}}}}{{{a}}}$。'
    return statement('下列哪一個正確？', opts, why)


# ───────── 新增：應用（大招） ─────────
def rect_perimeter(x, y):
    x, y = max(x, y), min(x, y)  # 長比寬長
    kx, mx = simp(x)
    ky, my = simp(y)
    assert mx == my
    P = 2 * (S(x) + S(y))
    return dict(**value(rf'長方形的長 $\sqrt{{{x}}}$ 公分、寬 $\sqrt{{{y}}}$ 公分，周長是幾公分？', P,
                        [r(2 * (kx + ky), mx), raw(rf'$2\sqrt{{{x + y}}}$', 2 * S(x + y)), r(kx + ky, mx), num_or_rad(S(x) * S(y))],
                        rf'先化簡：$\sqrt{{{x}}}={kx}\sqrt{{{mx}}}$、$\sqrt{{{y}}}={ky}\sqrt{{{my}}}$，周長 $2({kx}\sqrt{{{mx}}}+{ky}\sqrt{{{mx}}})={2 * (kx + ky)}\sqrt{{{mx}}}$。'),
                figure=rect_fig(float(S(x)), float(S(y)), f'√{x}', f'√{y}'))


def rect_area(x, y):
    x, y = max(x, y), min(x, y)
    A = S(x) * S(y)
    k, m = simp(x * y)
    return dict(**value(rf'長方形花圃長 $\sqrt{{{x}}}$ 公尺、寬 $\sqrt{{{y}}}$ 公尺，面積是幾平方公尺？', A,
                        [r(1, x * y), raw(f'${x * y}$', x * y), raw(rf'$\sqrt{{{x + y}}}$', S(x + y)), raw(f'${tex_r(2, x)}+{tex_r(2, y)}$', 2 * (S(x) + S(y)))],
                        rf'面積＝長×寬：$\sqrt{{{x}}}\times\sqrt{{{y}}}=\sqrt{{{x * y}}}={tex_r(1, x * y)}$。'),
                figure=rect_fig(float(S(x)), float(S(y)), f'√{x} m', f'√{y} m'))


def conj_area(a, b):
    return dict(**value(rf'長方形的長是 $(\sqrt{{{a}}}+\sqrt{{{b}}})$、寬是 $(\sqrt{{{a}}}-\sqrt{{{b}}})$，面積是多少？', R(a - b),
                        [raw(f'${a - b}$', a - b), raw(f'${a + b}$', a + b), raw(rf'$\sqrt{{{a - b}}}$', S(a - b)), num_or_rad(2 * S(a))],
                        rf'平方差公式：$(\sqrt{{{a}}}+\sqrt{{{b}}})(\sqrt{{{a}}}-\sqrt{{{b}}})=(\sqrt{{{a}}})^2-(\sqrt{{{b}}})^2={a}-{b}={a - b}$。'),
                figure=rect_fig(float(S(a) + S(b)), float(S(a) - S(b)) * 1.6, f'√{a}＋√{b}', f'√{a}－√{b}'))


def eval_x(n, c):
    """x＝√n＋c，求 x²－2cx（＝(x－c)²－c²＝n－c²）。"""
    x = S(n) + c
    expr = x ** 2 - 2 * c * x
    sx = rf'\sqrt{{{n}}}{"+" if c > 0 else "-"}{abs(c)}'
    term = rf'{"-" if c > 0 else "+"}{abs(2 * c)}x'
    return value(rf'若 $x={sx}$，則 $x^2{term}=$？', expr,
                 [num_opt(n - c * c), num_opt(n + c * c), num_opt(n), num_opt(c * c - n)],
                 rf'$x{"-" if c > 0 else "+"}{abs(c)}=\sqrt{{{n}}}$，兩邊平方：$x^2{term}+{c * c}={n}$，所以 $x^2{term}={n}-{c * c}={n - c * c}$。')


def xy_sum(a, b, ask):
    x, y = S(a) + S(b), S(a) - S(b)
    if ask == 'sq':
        want = x ** 2 + y ** 2
        return value(rf'若 $x=\sqrt{{{a}}}+\sqrt{{{b}}}$、$y=\sqrt{{{a}}}-\sqrt{{{b}}}$，則 $x^2+y^2=$？', want,
                     [num_opt(2 * (a + b)), num_opt(a + b), num_opt(4 * (a + b)), num_or_rad(4 * S(a * b))],
                     rf'$x^2=({a}+{b})+{tex_r(2, a * b)}$、$y^2=({a}+{b})-{tex_r(2, a * b)}$，相加中間項抵消：$2({a}+{b})={2 * (a + b)}$。')
    want = x * y
    return value(rf'若 $x=\sqrt{{{a}}}+\sqrt{{{b}}}$、$y=\sqrt{{{a}}}-\sqrt{{{b}}}$，則 $xy=$？', want,
                 [num_opt(a - b), num_opt(a + b), num_or_rad(2 * S(a)), num_opt(a * b)],
                 rf'平方差：$xy=(\sqrt{{{a}}})^2-(\sqrt{{{b}}})^2={a - b}$。')


def conj_sum(a, b):
    """1/(√a+√b)＋1/(√a−√b)，a−b＝1。"""
    want = 1 / (S(a) + S(b)) + 1 / (S(a) - S(b))
    sb = rf'\sqrt{{{b}}}' if isqrt(b) ** 2 != b else str(isqrt(b))
    return value(rf'$\dfrac{{1}}{{\sqrt{{{a}}}+{sb}}}+\dfrac{{1}}{{\sqrt{{{a}}}-{sb}}}=$？', want,
                 [num_or_rad(2 * S(a)), num_or_rad(2 * S(b)) if isqrt(b) ** 2 != b else num_opt(2 * isqrt(b)), num_opt(0), num_or_rad(S(a))],
                 rf'通分（或各自有理化）：分母 $({a})-({b})=1$，分子 $(\sqrt{{{a}}}-{sb})+(\sqrt{{{a}}}+{sb})=2\sqrt{{{a}}}$' + (rf'$={tex_r(2, a)}$' if simp(a)[0] > 1 else '') + '。')


def approx(coef, n, given):
    """coef／√n 的近似值（√n ≈ given）。"""
    v = R(coef) / S(n)
    k = nsimplify(v * S(n) / n)  # v ＝ k√n
    want = k * nsimplify(given)
    return value(rf'已知 $\sqrt{{{n}}}\approx {given}$，則 $\dfrac{{{coef}}}{{\sqrt{{{n}}}}}$ 約是多少？', want,
                 [num_dec(want), num_dec(want * 10), num_dec(nsimplify(given) * coef), num_dec(want / 10)],
                 rf'先有理化：$\dfrac{{{coef}}}{{\sqrt{{{n}}}}}=\dfrac{{{coef}\sqrt{{{n}}}}}{{{n}}}={k}\sqrt{{{n}}}$，再代入：${k}\times{given}={num_dec(want)[0].strip("$")}$。')


def num_dec(v):
    v = nsimplify(v)
    s = f'{float(v):.4f}'.rstrip('0').rstrip('.')
    return raw(f'${s}$', v)


def two_squares(a, b, ask):
    ka, m = simp(a)
    kb, m2 = simp(b)
    assert m == m2
    if ask == 'sum':
        want = S(a) + S(b)
        opts = [r(ka + kb, m), raw(rf'$\sqrt{{{a + b}}}$', S(a + b)), r(ka * kb, m), r(abs(ka - kb), m) if ka != kb else num_opt(0)]
        stem = rf'兩個正方形的面積分別是 ${a}$ 和 ${b}$ 平方公分，並排在一起，底邊全長是幾公分？'
        why = rf'邊長是 $\sqrt{{{a}}}={tex_r(1, a)}$、$\sqrt{{{b}}}={tex_r(1, b)}$，合起來 ${ka + kb}\sqrt{{{m}}}$；不能寫成 $\sqrt{{{a + b}}}$。'
    else:
        want = S(a) - S(b)
        opts = [r(ka - kb, m), raw(rf'$\sqrt{{{a - b}}}$', S(a - b)), r(ka + kb, m), num_opt(a - b)]
        stem = rf'兩個正方形的面積分別是 ${a}$ 和 ${b}$ 平方公分，大正方形的邊長比小正方形長幾公分？'
        why = rf'$\sqrt{{{a}}}-\sqrt{{{b}}}={tex_r(1, a)}-{tex_r(1, b)}={ka - kb}\sqrt{{{m}}}$。'
    return dict(**value(stem, want, opts, why), figure=squares_fig(a, b, f'{a}', f'{b}'))


def mixed(c, n, d, big):
    """(c√n − d)² ＋ √big，其中 √big ＝ 2cd√n（中間項剛好抵消）。"""
    want = (c * S(n) - d) ** 2 + S(big)
    k, m = simp(big)
    assert m == n and k == 2 * c * d
    sq = c * c * n + d * d
    term = rf'{c}\sqrt{{{n}}}' if c != 1 else rf'\sqrt{{{n}}}'
    return value(rf'$({term}-{d})^2+\sqrt{{{big}}}=$？', want,
                 [num_opt(sq), num_opt(c * c * n - d * d), raw(f'${sq}+{2 * k}\\sqrt{{{n}}}$', sq + 2 * k * S(n)), num_opt(c * c * n + d * d + k)],
                 rf'$({term}-{d})^2={c * c * n}-{k}\sqrt{{{n}}}+{d * d}$，$\sqrt{{{big}}}={k}\sqrt{{{n}}}$，中間項抵消，得 ${sq}$。')


NEW = {
    'attack': [
        ('根式乘法', [mul(2, 3), mul(3, 5), mul(2, 7), mul(5, 7), mul(3, 7), mul(2, 11), mul(5, 6), mul(3, 10)]),
        ('化成最簡根式', [simplify_n(2, 3), simplify_n(3, 2), simplify_n(2, 5), simplify_n(4, 2), simplify_n(3, 5), simplify_n(5, 2), simplify_n(2, 7), simplify_n(4, 3), simplify_n(6, 2), simplify_n(3, 6)]),
        ('同類方根相加', [like_add(2, 3, 5), like_add(4, 1, 3), like_add(3, 5, 2), like_add(6, 2, 7), like_add(2, 7, 6), like_add(5, 3, 11)]),
    ],
    'shield': [
        ('哪一個相等', [equal_to(2, 3), equal_to(3, 2), equal_to(2, 5), equal_to(2, 6), equal_to(2, 7), equal_to(4, 2), equal_to(3, 5), equal_to(5, 2), equal_to(3, 7), equal_to(5, 3)]),
        ('同類方根', [like_root(3, 12, [6, 18, 30]), like_root(2, 18, [12, 6, 27]), like_root(5, 45, [15, 50, 10]), like_root(3, 75, [24, 8, 15]), like_root(2, 50, [20, 12, 45]), like_root(7, 28, [14, 21, 72])]),
        ('估算', [estimate(20), estimate(40), estimate(55), estimate(70), estimate(90), estimate(110), estimate(130), estimate(150)]),
        ('比大小', [largest([(r'$3\sqrt{2}$', 3 * S(2)), (r'$2\sqrt{5}$', 2 * S(5)), (r'$\sqrt{19}$', S(19)), (r'$4$', 4)]),
                  largest([(r'$2\sqrt{3}$', 2 * S(3)), (r'$3\sqrt{2}$', 3 * S(2)), (r'$\sqrt{17}$', S(17)), (r'$\sqrt{10}$', S(10))]),
                  largest([(r'$5\sqrt{2}$', 5 * S(2)), (r'$4\sqrt{3}$', 4 * S(3)), (r'$3\sqrt{5}$', 3 * S(5)), (r'$7$', 7)]),
                  largest([(r'$2\sqrt{7}$', 2 * S(7)), (r'$3\sqrt{3}$', 3 * S(3)), (r'$5$', 5), (r'$\sqrt{26}$', S(26))]),
                  largest([(r'$6$', 6), (r'$4\sqrt{2}$', 4 * S(2)), (r'$2\sqrt{10}$', 2 * S(10)), (r'$3\sqrt{3}$', 3 * S(3))])]),
        ('分母有理化的結果', [rationalized(6, 3), rationalized(10, 5), rationalized(14, 7), rationalized(3, 6), rationalized(5, 10), rationalized(12, 6)]),
        ('哪一個正確（運算規則）', [rule_check(2, 3, 1), rule_check(5, 3, 1), rule_check(7, 2, 2), rule_check(11, 3, 2), rule_check(5, 2, 3), rule_check(7, 2, 3)]),
    ],
    'ultimate': [
        ('長方形的周長', [rect_perimeter(12, 27), rect_perimeter(8, 18), rect_perimeter(20, 45), rect_perimeter(24, 54), rect_perimeter(50, 32), rect_perimeter(28, 63)]),
        ('長方形的面積', [rect_area(50, 8), rect_area(12, 27), rect_area(18, 6), rect_area(20, 15), rect_area(24, 6), rect_area(10, 40)]),
        ('平方差的面積', [conj_area(7, 2), conj_area(11, 5), conj_area(10, 3), conj_area(13, 2), conj_area(15, 7)]),
        ('代入求值', [eval_x(3, 1), eval_x(5, -2), eval_x(2, 3), eval_x(7, -1), eval_x(6, 2), eval_x(10, -3)]),
        ('x、y 的綜合', [xy_sum(5, 3, 'sq'), xy_sum(7, 2, 'sq'), xy_sum(6, 2, 'sq'), xy_sum(5, 2, 'xy'), xy_sum(11, 3, 'xy'), xy_sum(10, 7, 'xy')]),
        ('共軛有理化後相加', [conj_sum(3, 2), conj_sum(5, 4), conj_sum(6, 5), conj_sum(8, 7), conj_sum(10, 9)]),
        ('近似值', [approx(6, 2, '1.414'), approx(6, 3, '1.732'), approx(10, 2, '1.414'), approx(12, 3, '1.732'), approx(15, 5, '2.236')]),
        ('兩個正方形', [two_squares(8, 18, 'sum'), two_squares(12, 27, 'sum'), two_squares(20, 5, 'sum'), two_squares(50, 2, 'diff'), two_squares(75, 12, 'diff'), two_squares(98, 8, 'diff')]),
        ('乘法公式綜合', [mixed(2, 3, 1, 48), mixed(1, 5, 2, 80), mixed(3, 2, 1, 72), mixed(1, 7, 3, 252), mixed(2, 5, 1, 80)]),
    ],
}


def main():
    pools = {'attack': [], 'shield': [], 'ultimate': []}
    for lesson, kinds in FROM_LESSONS.items():
        mod = load(lesson)
        slots = {s['id']: s for s in mod.SLOTS}
        for kind, ids in kinds.items():
            for sid in ids:
                s = slots[sid]
                for k, v in enumerate(s['variants'], 1):
                    where = f'{lesson}-{sid}-{k}'
                    check_item(v, where)
                    pools[kind].append(dict(id=where, topic=s['topic'], **item_json(v)))
    for kind, groups in NEW.items():
        for topic, items in groups:
            for k, v in enumerate(items, 1):
                where = f'new-{kind}-{topic}-{k}'
                check_item(v, where)
                pools[kind].append(dict(id=where, topic=topic, **item_json(v)))
    ids = [x['id'] for p in pools.values() for x in p]
    assert len(ids) == len(set(ids)), '題目 ID 重複'
    out = dict(hostLesson='g8-2-2d', title='2-2 根式的運算：魔王戰', section='2-2',
               source='八年級 2-2(1)～(4) 課後檢核題（依類型分配）＋新增換數字題與綜合應用題；範圍含 2-1、第 1 章乘法公式；答案已用 SymPy 核算',
               pools=pools)
    path = ROOT / 'content/raids' / 'g8-2-2d.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print('✓ 2-2 魔王戰題庫：' + '、'.join(f'{k} {len(v)} 題' for k, v in pools.items()) + f' → {path.name}（全部核算通過）')


if __name__ == '__main__':
    main()
