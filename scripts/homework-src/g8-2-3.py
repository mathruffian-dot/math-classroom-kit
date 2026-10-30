r"""八上 2-3 畢氏定理：回家作業手寫題庫（g8-2-3a、g8-2-3b、g8-2-3c），每個題位至少 5 題，每題附圖。

用法：python -X utf8 scripts/homework-src/g8-2-3.py
輸出：content/homework/g8-2-3a.json、g8-2-3b.json、g8-2-3c.json（格式見 docs/HOMEWORK.md）

題位和課後檢核題庫（content/quizzes/g8-2-3a..c.json）一一對應：同 id、同 topic。
先把課後檢核的題目改成手寫題（拿掉選項、改成「求…」；「哪一邊是斜邊」「哪一個式子正確」改成「寫出…」），
再補新題。範圍累積：2-3(1) 只用 2-1、2-2 與這一堂；2-3(2) 加上 2-3(1)；2-3(3) 用整個 2-3。
附圖重用 scripts/quiz-src/pyth.py（題目的同一組數字畫，比例照實際長度）。

核算（每一題都做）：
1. 答案的數值：把 answer 的 LaTeX 解析成 SymPy，和「另外用 sympy.geometry 由圖形的點坐標算出的值」比對
   （斜邊用兩點距離、股用 solve 解方程式、斜邊上的高用點到直線的距離、坐標題用 Point.distance）。
2. 最簡根式：根號內沒有平方因數、分母沒有根號、分數已約分。
3. 詳解：每一段 $…$ 用「=」切開，能解析成數值的每一段都必須相等（例如 13^2-5^2=169-25=144），
   而且每個答案的值都要在詳解裡出現。
4. 式子型的答案（例如 \overline{AC}^2+\overline{BC}^2=\overline{AB}^2、h=\dfrac{ab}{c}）代入圖形的實際長度驗證兩邊相等。
"""
import json
import re
import sys
from decimal import Decimal, getcontext
from math import gcd
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / 'scripts/quiz-src'))

from sympy import Abs, Eq, Line, Point, Rational, factorint, nsimplify, simplify, solve, sqrt, symbols  # noqa: E402
from sympy.parsing.sympy_parser import (implicit_multiplication_application, parse_expr, rationalize,  # noqa: E402
                                        standard_transformations)

from geom import SERIF, P  # noqa: E402
from pyth import (PFig, cup_fig, general_fig, hyp_bottom, ladder_fig, lab, origin_fig, plane_fig, quad_kite,  # noqa: E402
                  quad_shared, rect_fig, right_tri, split, square_mid_fig, squares_fig)

R = Rational
S = sqrt
getcontext().prec = 60


# ═════════ 數字的寫法 ═════════
def simp(v):
    """正數 v（v² 是有理數）化成最簡根式的 LaTeX：整數、分數、c√m、c√m/d。"""
    v = nsimplify(v)
    r = nsimplify(v * v)
    assert r.is_Rational and v > 0, v
    c, m = split(int(r.p * r.q))
    den = int(r.q)
    g = gcd(c, den)
    c, den = c // g, den // g
    body = (str(c) if (c != 1 or m == 1) else '') + (rf'\sqrt{{{m}}}' if m != 1 else '')
    return body if den == 1 else rf'\dfrac{{{body}}}{{{den}}}'


def dstr(v):
    """有限小數的寫法（例如 1.2、2.6）。"""
    v = R(nsimplify(v))
    s = format((Decimal(v.p) / Decimal(v.q)).normalize(), 'f')
    assert R(s) == v, v
    return s


def sq(n):
    r"""\sqrt{n}（不是完全平方數時再化成最簡根式）：例如 \sqrt{100}=10、\sqrt{20}=2\sqrt{5}、\sqrt{13}。"""
    n = nsimplify(n)
    t = rf'\sqrt{{{n if n.is_Integer else dstr(n)}}}'
    if n.is_Integer:
        return t if split(int(n))[0] == 1 else f'{t}={simp(S(n))}'
    return f'{t}={dstr(S(n))}'  # 小數（竹竿題）：開得盡，寫成小數


def c_(v):
    """坐標相減時負數加括號。"""
    return f'({v})' if v < 0 else str(v)


def t_(v):
    """題目上的數：整數、小數或根式。"""
    v = nsimplify(v)
    if v.is_Integer:
        return str(v)
    if v.is_Rational:
        return dstr(v)
    return simp(v)


ov = lambda s: rf'\overline{{{s}}}'  # noqa: E731


# ═════════ 答案 ═════════
class Num:
    """數值答案：label＋$lhs 值$＋單位。val 是出題用公式算出的值，truth 是用圖形另外算出的值。"""

    def __init__(self, val, truth, lhs='', unit='', label='', style='rad', tex=None):
        self.val, self.truth = nsimplify(val), nsimplify(truth)
        self.tex = tex or (dstr(self.val) if style == 'dec' else simp(self.val))
        self.lhs, self.unit, self.label = lhs, unit, label

    def text(self):
        return f'{self.label}${self.lhs}{self.tex}${self.unit}'


class Formula:
    """式子型答案：tex 是一個等式，subs 是圖形上的實際長度（代入後兩邊要相等）。"""

    def __init__(self, tex, subs, label=''):
        self.tex, self.subs, self.label = tex, subs, label

    def text(self):
        return f'{self.label}${self.tex}$'


class Txt:
    """文字答案（斜邊是哪一邊、點的坐標）：ok 是用圖形的點坐標另外判斷的結果。"""

    def __init__(self, s, ok):
        self.s, self.ok = s, ok

    def text(self):
        return self.s


def V(stem, parts, solution, figure, space):
    return dict(stem=stem, figure=figure, answer='；'.join(p.text() for p in parts), solution=solution, space=space, _parts=parts)


# ═════════ LaTeX → SymPy（只處理題庫用到的寫法） ═════════
TR = standard_transformations + (implicit_multiplication_application, rationalize)


def _group(s, i):
    assert s[i] == '{', s[i:]
    depth = 0
    for j in range(i, len(s)):
        depth += {'{': 1, '}': -1}.get(s[j], 0)
        if depth == 0:
            return s[i + 1:j], j + 1
    raise ValueError('括號不成對')


def _conv(s):
    out, i, bar = '', 0, False
    while i < len(s):
        if s.startswith(r'\dfrac', i) or s.startswith(r'\frac', i):
            a, j = _group(s, i + (6 if s.startswith(r'\dfrac', i) else 5))
            b, j = _group(s, j)
            out += f'(({_conv(a)})/({_conv(b)}))'
            i = j
        elif s.startswith(r'\sqrt', i):
            a, j = _group(s, i + 5)
            out += f'sqrt({_conv(a)})'
            i = j
        elif s.startswith(r'\overline', i):
            a, j = _group(s, i + 9)
            out += f' L_{a} '
            i = j
        elif s.startswith(r'\times', i):
            out, i = out + '*', i + 6
        elif s.startswith(r'\div', i):
            out, i = out + '/', i + 4
        elif s.startswith(r'\left', i) or s.startswith(r'\right', i):
            i += 5 if s.startswith(r'\left', i) else 6
        elif s[i] == '\\':
            raise ValueError('不是數式')
        elif s[i] == '^':
            if s[i + 1] == '{':
                a, j = _group(s, i + 1)
                out += f'**({_conv(a)})'
                i = j
            else:
                out, i = out + '**' + s[i + 1], i + 2
        elif s[i] == '{':
            a, j = _group(s, i)
            out += f'({_conv(a)})'
            i = j
        elif s[i] == '|':
            out, i, bar = out + (')' if bar else 'Abs('), i + 1, not bar
        elif s[i] in '，。、；：' or '\u4e00' <= s[i] <= '\u9fff':
            raise ValueError('有中文')
        else:
            out, i = out + s[i], i + 1
    return out


def parse(tex):
    py = _conv(tex.strip())
    if not py.strip():
        return None
    return parse_expr(py, transformations=TR, local_dict={'sqrt': sqrt, 'Abs': Abs})


def numeric(piece):
    try:
        e = parse(piece)
    except Exception:
        return None
    if e is None or not hasattr(e, 'free_symbols') or e.free_symbols:
        return None
    return e


def same(a, b):
    return simplify(nsimplify(a) - nsimplify(b)) == 0


# ═════════ 核算 ═════════
DIAG = re.compile(r'下列何者|下列哪|哪一個|哪一項|何者')


def simplest(tex):
    """答案的寫法是最簡根式：根號內沒有平方因數、分母沒有根號、分數約分。"""
    for m in re.findall(r'\\sqrt\{([^{}]*)\}', tex):
        n = int(m)
        assert n > 1 and all(e == 1 for e in factorint(n).values()), f'√{n} 不是最簡根式'
    assert not re.search(r'\\dfrac\{[^{}]*(\{[^{}]*\})?[^{}]*\}\{[^{}]*\\sqrt', tex), f'{tex} 分母有根號'
    for c, den in re.findall(r'\\dfrac\{(\d*)(?:\\sqrt\{\d+\})?\}\{(\d+)\}', tex):
        assert gcd(int(c or 1), int(den)) == 1 and int(den) > 1, f'{tex} 沒有約分'


def check_variant(v, where):
    assert not DIAG.search(v['stem']), f'{where}：像選擇題'
    assert v['figure'] and v['figure'].startswith('<svg'), f'{where}：缺附圖'
    assert v['space'] in (1, 2, 3)
    # 詳解：每一段 $…$ 裡能算出數值的部分都要相等
    vals = []
    for seg in re.findall(r'\$([^$]+)\$', v['solution']):
        if any(k in seg for k in ('>', '<', r'\neq', r'\approx')):
            continue
        nums = [x for x in (numeric(p) for p in seg.split('=')) if x is not None]
        for a, b in zip(nums, nums[1:]):
            assert same(a, b), f'{where}：詳解 ${seg}$ 的 {a} ≠ {b}'
        vals += nums
    for p in v['_parts']:
        if isinstance(p, Num):
            got = parse(p.tex)
            assert same(got, p.val), f'{where}：答案 {p.tex} 的值是 {got}，出題的值是 {p.val}'
            assert same(p.val, p.truth), f'{where}：答案 {p.tex} 和圖形算出的 {p.truth} 不一致'
            simplest(p.tex)
            assert any(same(x, p.val) for x in vals), f'{where}：詳解裡沒有出現答案 {p.tex}'
        elif isinstance(p, Formula):
            lhs, rhs = p.tex.split('=')
            sub = {k: nsimplify(x) for k, x in p.subs.items()}
            L_, R_ = parse(lhs), parse(rhs)
            names = {str(s) for s in L_.free_symbols | R_.free_symbols}
            assert names <= set(sub), f'{where}：式子 {p.tex} 有沒有代入的符號 {names - set(sub)}'
            sub = {s: sub[str(s)] for s in L_.free_symbols | R_.free_symbols}
            assert same(L_.subs(sub), R_.subs(sub)), f'{where}：式子 {p.tex} 代入圖形的長度不成立'
        else:
            assert p.ok, f'{where}：文字答案 {p.s} 和圖形不一致'
    return 1


# ═════════ 圖形上的獨立核算 ═════════
X = symbols('x', positive=True)


def hyp_len(a, b):
    """兩股 a、b：兩點 (a, 0)、(0, b) 的距離。"""
    return Point(nsimplify(a), 0).distance(Point(0, nsimplify(b)))


def leg_len(c, a):
    """斜邊 c、一股 a：解 (0, 0) 到 (x, a) 的距離＝c 的正根。"""
    sol = solve(Point(0, 0).distance(Point(X, nsimplify(a))) - nsimplify(c), X)
    assert len(sol) == 1, sol
    return sol[0]


def rt_pts(h, v, names, corner):
    """和 pyth.right_tri 同樣的擺法：直角頂點在原點，水平股長 h、鉛垂股長 v。"""
    sx = 1 if corner in ('bl', 'tl') else -1
    sy = 1 if corner in ('bl', 'br') else -1
    return {names[0]: Point(0, 0), names[1]: Point(sx * nsimplify(h), 0), names[2]: Point(0, sy * nsimplify(v))}


def seg_name(a, b):
    return ''.join(sorted((a, b)))


# ═════════════════════════════════════════
# 2-3(1) 畢氏定理與邊長計算
# ═════════════════════════════════════════
def a_hyp_name(tri, right, names, corner, hv=(4, 3)):
    pts = rt_pts(*hv, names, corner)
    others = [n for n in names if n != right]
    hyp = seg_name(*others)
    legs = sorted(seg_name(right, o) for o in others)
    rv, p1, p2 = pts[right], pts[others[0]], pts[others[1]]
    ok = (p1 - rv).dot(p2 - rv) == 0 and p1.distance(p2) > max(rv.distance(p1), rv.distance(p2))
    return V(rf'如圖，$\triangle {tri}$ 中 $\angle {right}=90^\circ$，寫出這個三角形的斜邊和兩股。',
             [Txt(rf'斜邊：${ov(hyp)}$；兩股：${ov(legs[0])}$、${ov(legs[1])}$', ok)],
             rf'直角所對的邊叫做斜邊：$\angle {right}$ 的對邊是 ${ov(hyp)}$，所以斜邊是 ${ov(hyp)}$；夾著直角的 ${ov(legs[0])}$、${ov(legs[1])}$ 是兩股。斜邊不一定畫在下面。',
             right_tri(*hv, ('', '', ''), names=names, corner=corner), 1)


def a_eq(tri, right, names, corner, hv):
    pts = rt_pts(*hv, names, corner)
    others = [n for n in names if n != right]
    hyp = seg_name(*others)
    legs = sorted(seg_name(right, o) for o in others)
    eq = rf'{ov(legs[0])}^2+{ov(legs[1])}^2={ov(hyp)}^2'
    subs = {f'L_{s}': pts[s[0]].distance(pts[s[1]]) for s in (hyp, *legs)}
    return V(rf'如圖，$\triangle {tri}$ 中 $\angle {right}=90^\circ$，用三邊的長寫出畢氏定理的式子。',
             [Formula(eq, subs)],
             rf'$\angle {right}$ 的對邊 ${ov(hyp)}$ 是斜邊，${ov(legs[0])}$、${ov(legs[1])}$ 是兩股。兩股的平方和等於斜邊的平方：${eq}$。',
             right_tri(*hv, ('', '', ''), names=names, corner=corner, fill='#cfd8ee'), 1)


def a_eq_letters():
    names, corner, hv = ('B', 'C', 'A'), 'bl', (4, 3)
    pts = rt_pts(*hv, names, corner)
    subs = {'a': pts['A'].distance(pts['B']), 'b': pts['B'].distance(pts['C']), 'c': pts['A'].distance(pts['C'])}
    return V(r'如圖，$\triangle ABC$ 中 $\angle B=90^\circ$，$\overline{AB}=a$、$\overline{BC}=b$、$\overline{AC}=c$，寫出 $a$、$b$、$c$ 的關係式。',
             [Formula('a^2+b^2=c^2', subs)],
             r'$\angle B$ 的對邊 $\overline{AC}=c$ 是斜邊，$a$、$b$ 是兩股：兩股的平方和＝斜邊的平方，$a^2+b^2=c^2$。',
             right_tri(*hv, ('b', 'a', 'c'), names=names, corner=corner, fill='#cfd8ee'), 1)


SQ_STEM = r'如圖，直角三角形 $ABC$ 中 $\angle C=90^\circ$，以三邊為邊長向外作正方形甲、乙、丙。'


def a_sq_hyp(p, q, side=False):
    """甲（AC 上）面積 p、乙（BC 上）面積 q，求丙（AB 上）。"""
    C_, B_, A_ = Point(0, 0), Point(S(q), 0), Point(0, S(p))
    parts = [Num(p + q, A_.distance(B_) ** 2, label='(1) 丙的面積是 ' if side else '丙的面積是 ')]
    sol = rf'兩股上的正方形面積和＝斜邊上的正方形面積：丙＝${p}+{q}={p + q}$。'
    if side:
        parts.append(Num(S(p + q), A_.distance(B_), lhs=r'\overline{AB}=', label='(2) '))
        sol = '(1) ' + sol + rf'(2) $\overline{{AB}}^2={p + q}$，$\overline{{AB}}={sq(p + q)}$。'
    ask = r'求：(1) 丙的面積；(2) 斜邊 $\overline{AB}$ 的長。' if side else '求丙的面積。'
    return V(SQ_STEM + rf'甲、乙的面積分別是 ${p}$、${q}$，' + ask, parts, sol,
             squares_fig(float(S(q)), float(S(p)), (f'甲 {p}', f'乙 {q}', '丙 ?')), 2 if side else 1)


def a_sq_leg(p, r, side=False):
    """甲（AC 上）面積 p、丙面積 r，求乙（BC 上）。"""
    C_, A_ = Point(0, 0), Point(0, S(p))
    bc = leg_len(S(r), S(p))
    parts = [Num(r - p, bc ** 2, label='(1) 乙的面積是 ' if side else '乙的面積是 ')]
    sol = rf'甲＋乙＝丙，所以乙＝${r}-{p}={r - p}$。'
    if side:
        parts.append(Num(S(r - p), bc, lhs=r'\overline{BC}=', label='(2) '))
        sol = '(1) ' + sol + rf'(2) 乙是以 $\overline{{BC}}$ 為邊的正方形：$\overline{{BC}}^2={r - p}$，$\overline{{BC}}={sq(r - p)}$。'
    ask = r'求：(1) 乙的面積；(2) $\overline{BC}$ 的長。' if side else '求乙的面積。'
    return V(SQ_STEM + rf'甲、丙的面積分別是 ${p}$、${r}$，' + ask, parts, sol,
             squares_fig(float(S(r - p)), float(S(p)), (f'甲 {p}', '乙 ?', f'丙 {r}')), 2 if side else 1)


def a_hyp(a, b, corner='bl', radical=False):
    c2 = a * a + b * b
    return V(rf'如圖，直角三角形的兩股長是 ${a}$、${b}$，求斜邊長' + ('（化成最簡根式）。' if radical else '。'),
             [Num(S(c2), hyp_len(a, b))],
             rf'設斜邊長為 $c$：$c^2={a}^2+{b}^2={a * a}+{b * b}={c2}$。因為 $c>0$，所以 $c={sq(c2)}$。',
             right_tri(b, a, (str(b), str(a), '?'), corner=corner), 2 if radical else 1)


def a_leg(c, a, corner='bl', radical=False, flip=False):
    b2 = c * c - a * a
    if flip:  # 已知股放在水平
        fig = right_tri(a, float(S(b2)), (str(a), '?', str(c)), corner=corner)
    else:
        fig = right_tri(float(S(b2)), a, ('?', str(a), str(c)), corner=corner)
    return V(rf'如圖，直角三角形的斜邊長是 ${c}$、一股長是 ${a}$，求另一股長' + ('（化成最簡根式）。' if radical else '。'),
             [Num(S(b2), leg_len(c, a))],
             rf'設另一股長為 $b$：$b^2={c}^2-{a}^2={c * c}-{a * a}={b2}$。因為 $b>0$，所以 $b={sq(b2)}$。斜邊最長，求股要用減的。',
             fig, 2 if radical else 1)


def a_apex(kind, x, y):
    """∠A＝90° 而且直角在上方。kind＝'leg'：BC＝x、AB＝y，求 AC；kind＝'hyp'：AB＝x、AC＝y，求 BC。"""
    if kind == 'leg':
        bc, ab = x, y
        ac2 = bc * bc - ab * ab
        return V(rf'如圖，$\triangle ABC$ 中 $\angle A=90^\circ$，$\overline{{BC}}={bc}$、$\overline{{AB}}={ab}$，求 $\overline{{AC}}$ 的長。',
                 [Num(S(ac2), leg_len(bc, ab), lhs=r'\overline{AC}=')],
                 rf'$\angle A$ 的對邊 $\overline{{BC}}$ 才是斜邊（雖然它畫在下面）。$\overline{{AC}}^2={bc}^2-{ab}^2={bc * bc}-{ab * ab}={ac2}$，$\overline{{AC}}={sq(ac2)}$。',
                 hyp_bottom(bc, ab, float(S(ac2)), (str(bc), str(ab), '?')), 2)
    ab, ac = x, y
    bc2 = ab * ab + ac * ac
    return V(rf'如圖，$\triangle ABC$ 中 $\angle A=90^\circ$，$\overline{{AB}}={ab}$、$\overline{{AC}}={ac}$，求 $\overline{{BC}}$ 的長。',
             [Num(S(bc2), hyp_len(ab, ac), lhs=r'\overline{BC}=')],
             rf'$\angle A$ 的對邊 $\overline{{BC}}$ 是斜邊，$\overline{{AB}}$、$\overline{{AC}}$ 是兩股：$\overline{{BC}}^2={ab}^2+{ac}^2={ab * ab}+{ac * ac}={bc2}$，$\overline{{BC}}={sq(bc2)}$。',
             hyp_bottom(float(S(bc2)), ab, ac, ('?', str(ab), str(ac))), 2)


def a_ladder(L, d=None, h=None):
    if h is None:
        h2 = L * L - d * d
        return V(rf'如圖，長 ${L}$ 公尺的梯子斜靠在垂直的牆上，梯子底端離牆腳 ${d}$ 公尺，求梯子頂端離地面的高度。',
                 [Num(S(h2), leg_len(L, d), unit=' 公尺')],
                 rf'梯子、牆、地面圍成直角三角形，梯子是斜邊。設高為 $x$ 公尺：$x^2={L}^2-{d}^2={L * L}-{d * d}={h2}$，$x={sq(h2)}$。',
                 ladder_fig(L, d, (f'{L} m', f'{d} m', '?')), 2)
    d2 = L * L - h * h
    return V(rf'如圖，長 ${L}$ 公尺的梯子斜靠在垂直的牆上，梯子頂端離地面 ${h}$ 公尺，求梯子底端離牆腳多遠。',
             [Num(S(d2), leg_len(L, h), unit=' 公尺')],
             rf'梯子是斜邊，頂端離地的 ${h}$ 公尺是一股。設底端離牆腳 $y$ 公尺：$y^2={L}^2-{h}^2={L * L}-{h * h}={d2}$，$y={sq(d2)}$。',
             ladder_fig(L, float(S(d2)), (f'{L} m', '?', f'{h} m')), 2)


def a_rad(kind, a2, b2):
    """kind＝'hyp'：兩股 √a2、√b2 求斜邊；'leg'：一股 √a2、斜邊 √b2 求另一股。"""
    tt = lambda n: simp(S(n))  # noqa: E731
    pw = lambda n: f'{tt(n)}^2' if S(n).is_Integer else rf'({tt(n)})^2'  # noqa: E731
    if kind == 'hyp':
        c2 = a2 + b2
        return V(rf'如圖，直角三角形的兩股長是 ${tt(a2)}$、${tt(b2)}$，求斜邊長。',
                 [Num(S(c2), hyp_len(S(a2), S(b2)))],
                 rf'設斜邊長為 $c$：$c^2={pw(a2)}+{pw(b2)}={a2}+{b2}={c2}$，$c={sq(c2)}$。$(\sqrt{{a}})^2=a$；根號不能直接相加。',
                 right_tri(float(S(b2)), float(S(a2)), (lab(b2), lab(a2), '?')), 2)
    c2 = b2 - a2
    return V(rf'如圖，直角三角形的一股長是 ${tt(a2)}$、斜邊長是 ${tt(b2)}$，求另一股長。',
             [Num(S(c2), leg_len(S(b2), S(a2)))],
             rf'設另一股長為 $x$：$x^2={pw(b2)}-{pw(a2)}={b2}-{a2}={c2}$，$x={sq(c2)}$。',
             right_tri(float(S(c2)), float(S(a2)), ('?', lab(a2), lab(b2)), corner='br'), 2)


A_SLOTS = [
    ('q1', 0, ['s-IV-7'], ['S-8-6'], [
        a_hyp_name('ABC', 'C', ('C', 'B', 'A'), 'bl'),
        a_hyp_name('ABC', 'A', ('A', 'C', 'B'), 'tr'),
        a_hyp_name('ABC', 'B', ('B', 'A', 'C'), 'br'),
        a_hyp_name('DEF', 'E', ('E', 'F', 'D'), 'tl', (5, 3)),
        a_hyp_name('PQR', 'R', ('R', 'P', 'Q'), 'tr', (3, 4.5)),
    ]),
    ('q2', 1, ['s-IV-7'], ['S-8-6'], [
        a_eq('ABC', 'C', ('C', 'A', 'B'), 'br', (4, 3)),
        a_eq('ABC', 'A', ('A', 'B', 'C'), 'tl', (5, 3)),
        a_eq('ABC', 'B', ('B', 'C', 'A'), 'tr', (4, 2.5)),
        a_eq('XYZ', 'Y', ('Y', 'Z', 'X'), 'bl', (3, 4)),
        a_eq_letters(),
    ]),
    ('q3', 1, ['s-IV-7'], ['S-8-6'], [
        a_sq_hyp(9, 16), a_sq_leg(25, 74), a_sq_leg(25, 169), a_sq_hyp(12, 13, side=True), a_sq_leg(18, 50, side=True),
    ]),
    ('q4', 2, ['s-IV-7'], ['S-8-6'], [a_hyp(6, 8), a_hyp(9, 12, 'br'), a_hyp(8, 15), a_hyp(7, 24, 'br'), a_hyp(20, 21)]),
    ('q5', 2, ['s-IV-7', 'n-IV-5'], ['S-8-6', 'N-8-1'], [
        a_hyp(2, 4, 'br', True), a_hyp(3, 6, 'bl', True), a_hyp(4, 4, 'br', True), a_hyp(2, 6, 'bl', True), a_hyp(6, 9, 'br', True),
    ]),
    ('q6', 2, ['s-IV-7'], ['S-8-6'], [a_leg(13, 5), a_leg(17, 8, 'br'), a_leg(25, 7), a_leg(10, 6, 'br', flip=True), a_leg(29, 20)]),
    ('q7', 2, ['s-IV-7', 'n-IV-5'], ['S-8-6', 'N-8-1'], [
        a_leg(6, 4, 'tl', True, True), a_leg(9, 3, 'bl', True), a_leg(7, 5, 'tl', True, True), a_leg(8, 4, 'br', True), a_leg(10, 4, 'bl', True, True),
    ]),
    ('q8', 2, ['s-IV-7'], ['S-8-6'], [a_apex('leg', 5, 3), a_apex('leg', 10, 6), a_apex('leg', 4, 2), a_apex('leg', 6, 4), a_apex('hyp', 5, 12)]),
    ('q9', 2, ['s-IV-7'], ['S-8-6'], [a_ladder(10, 6), a_ladder(13, 5), a_ladder(17, 8), a_ladder(6, 2), a_ladder(15, h=12)]),
    ('q10', 2, ['s-IV-7', 'n-IV-5'], ['S-8-6', 'N-8-1'], [
        a_rad('leg', 3, 7), a_rad('hyp', 5, 11), a_rad('hyp', 4, 5), a_rad('hyp', 2, 6), a_rad('leg', 5, 14),
    ]),
]


# ═════════════════════════════════════════
# 2-3(2) 畢氏定理的應用
# ═════════════════════════════════════════
def b_shared(ac, bc, bd):
    ab2 = ac * ac + bc * bc
    ad2 = ab2 - bd * bd
    AB = hyp_len(ac, bc)
    return V(rf'如圖，$\angle C=\angle D=90^\circ$，$\overline{{AC}}={ac}$、$\overline{{BC}}={bc}$、$\overline{{BD}}={bd}$，求：(1) $\overline{{AB}}$ 的長；(2) $\overline{{AD}}$ 的長。',
             [Num(S(ab2), AB, lhs=r'\overline{AB}=', label='(1) '), Num(S(ad2), leg_len(AB, bd), lhs=r'\overline{AD}=', label='(2) ')],
             rf'(1) 在直角三角形 $ABC$ 中：$\overline{{AB}}^2={ac}^2+{bc}^2={ac * ac}+{bc * bc}={ab2}$，$\overline{{AB}}={sq(ab2)}$。'
             rf'(2) $\overline{{AB}}$ 也是直角三角形 $ABD$ 的斜邊：$\overline{{AD}}^2=\overline{{AB}}^2-\overline{{BD}}^2={ab2}-{bd}^2={ab2}-{bd * bd}={ad2}$，$\overline{{AD}}={sq(ad2)}$。',
             quad_shared(ac, bc, bd, (str(ac), str(bc), str(bd), '?')), 3)


def b_kite(ab, ad, bc):
    bd2 = ab * ab + ad * ad
    cd2 = bd2 - bc * bc
    BD = hyp_len(ab, ad)
    return V(rf'如圖，四邊形 $ABCD$ 中 $\angle A=\angle C=90^\circ$，$\overline{{AB}}={ab}$、$\overline{{AD}}={ad}$、$\overline{{BC}}={bc}$，求：(1) $\overline{{BD}}$ 的長；(2) $\overline{{CD}}$ 的長。',
             [Num(S(bd2), BD, lhs=r'\overline{BD}=', label='(1) '), Num(S(cd2), leg_len(BD, bc), lhs=r'\overline{CD}=', label='(2) ')],
             rf'(1) 連 $\overline{{BD}}$，在直角三角形 $ABD$ 中：$\overline{{BD}}^2={ab}^2+{ad}^2={ab * ab}+{ad * ad}={bd2}$，$\overline{{BD}}={sq(bd2)}$。'
             rf'(2) $\overline{{BD}}$ 也是直角三角形 $BCD$ 的斜邊：$\overline{{CD}}^2=\overline{{BD}}^2-\overline{{BC}}^2={bd2}-{bc}^2={bd2}-{bc * bc}={cd2}$，$\overline{{CD}}={sq(cd2)}$。',
             quad_kite(ab, ad, bc, (str(ab), str(ad), str(bc), '?')), 3)


def alt_truth(a, b):
    """兩股 a、b：直角頂點 (0, 0) 到斜邊（(a, 0) 與 (0, b) 的連線）的距離。"""
    return Line(Point(nsimplify(a), 0), Point(0, nsimplify(b))).distance(Point(0, 0))


def b_alt(a, b):
    c = int(S(a * a + b * b))
    h = R(a * b, c)
    return V(rf'如圖，直角三角形的三邊長是 ${a}$、${b}$、${c}$，求斜邊上的高 $h$。',
             [Num(h, alt_truth(a, b), lhs='h=')],
             rf'同一個三角形面積的兩種算法相等（以斜邊為底、以兩股為底和高）：$\dfrac{{1}}{{2}}\times{c}\times h=\dfrac{{1}}{{2}}\times{a}\times{b}$，'
             rf'所以 $h=\dfrac{{{a}\times{b}}}{{{c}}}={simp(h)}$。',
             hyp_bottom(c, b, a, (str(c), str(b), str(a)), foot='', h_label='h'), 2)


def b_leg_alt(ab, bc):
    ac2 = bc * bc - ab * ab
    ac = S(ac2)
    ad = ab * ac / bc
    AC = leg_len(bc, ab)
    return V(rf'如圖，直角三角形 $ABC$ 中 $\angle A=90^\circ$，$\overline{{AD}}$ 是斜邊上的高。若 $\overline{{AB}}={ab}$、$\overline{{BC}}={bc}$，求：(1) $\overline{{AC}}$ 的長；(2) $\overline{{AD}}$ 的長。',
             [Num(ac, AC, lhs=r'\overline{AC}=', label='(1) '), Num(ad, alt_truth(ab, AC), lhs=r'\overline{AD}=', label='(2) ')],
             rf'(1) $\overline{{BC}}$ 是斜邊：$\overline{{AC}}^2={bc}^2-{ab}^2={bc * bc}-{ab * ab}={ac2}$，$\overline{{AC}}={sq(ac2)}$。'
             rf'(2) 面積 $=\dfrac{{1}}{{2}}\times\overline{{BC}}\times\overline{{AD}}=\dfrac{{1}}{{2}}\times\overline{{AB}}\times\overline{{AC}}$，'
             rf'所以 $\overline{{AD}}=\dfrac{{{ab}\times{simp(ac)}}}{{{bc}}}={simp(ad)}$。',
             hyp_bottom(bc, ab, float(ac), (str(bc), str(ab), ''), names=('B', 'C', 'A'), foot='D', h_label='?'), 3)


def b_area(kind):
    if kind == 'formula':
        return V(r'如圖，直角三角形的兩股長是 $a$、$b$，斜邊長是 $c$，斜邊上的高是 $h$。用三角形面積的兩種算法，寫出用 $a$、$b$、$c$ 表示 $h$ 的式子。',
                 [Formula(r'h=\dfrac{ab}{c}', {'a': 3, 'b': 4, 'c': 5, 'h': alt_truth(3, 4)})],
                 r'以兩股為底和高：面積 $=\dfrac{1}{2}ab$；以斜邊為底：面積 $=\dfrac{1}{2}ch$。兩種算法相等：$\dfrac{1}{2}ch=\dfrac{1}{2}ab$，所以 $ch=ab$，$h=\dfrac{ab}{c}$（兩股乘積 ÷ 斜邊）。',
                 hyp_bottom(5, 4, 3, ('c', 'b', 'a'), names=('', '', ''), foot='', h_label='h'), 2)
    if kind == 'from_area':
        assert R(5 * 12, 2) == 30 and hyp_len(5, 12) == 13
        return V(r'如圖，直角三角形的面積是 $30$，斜邊長是 $13$，求斜邊上的高 $h$。',
                 [Num(R(60, 13), alt_truth(5, 12), lhs='h=')],
                 r'以斜邊為底：$\dfrac{1}{2}\times13\times h=30$，所以 $h=\dfrac{30\times2}{13}=\dfrac{60}{13}$。',
                 hyp_bottom(13, 12, 5, ('13', '', ''), foot='', h_label='h'), 2)
    if kind == 'to_area':
        assert alt_truth(6, 8) == R(24, 5)
        return V(r'如圖，直角三角形的斜邊長是 $10$，斜邊上的高是 $4.8$，求這個三角形的面積。',
                 [Num(24, R(6 * 8, 2), label='面積是 ')],
                 r'以斜邊為底、斜邊上的高為高：面積 $=\dfrac{1}{2}\times10\times4.8=24$。',
                 hyp_bottom(10, 8, 6, ('10', '', ''), foot='', h_label='4.8'), 1)
    if kind == 'other_leg':
        assert alt_truth(15, 20) == 12 and hyp_len(15, 20) == 25
        return V(r'如圖，直角三角形的斜邊長是 $25$、斜邊上的高是 $12$、一股長是 $15$，用面積的兩種算法求另一股長 $x$。',
                 [Num(20, leg_len(25, 15), lhs='x=')],
                 r'以斜邊為底：面積 $=\dfrac{1}{2}\times25\times12=150$。以兩股為底和高：$\dfrac{1}{2}\times15\times x=150$，'
                 r'所以 $x=\dfrac{150\times2}{15}=20$。（用畢氏定理檢查：$\sqrt{25^2-15^2}=\sqrt{400}=20$）',
                 hyp_bottom(25, 15, 20, ('25', '15', 'x'), foot='', h_label='12'), 2)
    # 'foot'：先求斜邊上的高，再用畢氏定理求一段
    C_, A_, B_ = Point(0, 0), Point(3, 0), Point(0, 4)
    D_ = Line(A_, B_).projection(C_)
    return V(r'如圖，$\triangle ABC$ 中 $\angle C=90^\circ$，$\overline{AC}=3$、$\overline{BC}=4$、$\overline{AB}=5$，$\overline{CD}\perp\overline{AB}$ 於 $D$，求：(1) $\overline{CD}$ 的長；(2) $\overline{AD}$ 的長。',
             [Num(R(12, 5), C_.distance(D_), lhs=r'\overline{CD}=', label='(1) '), Num(R(9, 5), A_.distance(D_), lhs=r'\overline{AD}=', label='(2) ')],
             r'(1) 面積的兩種算法：$\dfrac{1}{2}\times5\times\overline{CD}=\dfrac{1}{2}\times3\times4$，$\overline{CD}=\dfrac{3\times4}{5}=\dfrac{12}{5}$。'
             r'(2) $\triangle ACD$ 中 $\angle ADC=90^\circ$，$\overline{AC}$ 是斜邊：$\overline{AD}^2=3^2-\left(\dfrac{12}{5}\right)^2=9-\dfrac{144}{25}=\dfrac{81}{25}$，$\overline{AD}=\dfrac{9}{5}$。',
             hyp_bottom(5, 3, 4, ('5', '3', '4'), names=('A', 'B', 'C'), foot='D'), 3)


def b_pole(Ls, ds):
    L, d = nsimplify(Ls), nsimplify(ds)
    h = S(L * L - d * d)
    return V(rf'如圖，長 ${Ls}$ 公尺的竹竿斜靠在垂直的牆上，竹竿底端離牆腳 ${ds}$ 公尺，求竹竿頂端離地面幾公尺。',
             [Num(h, leg_len(L, d), unit=' 公尺', style='dec')],
             rf'竹竿、牆、地面圍成直角三角形，竹竿是斜邊。設高為 $x$ 公尺：$x^2={Ls}^2-{ds}^2={dstr(L * L)}-{dstr(d * d)}={dstr(h * h)}$，$x={sq(h * h)}$。',
             ladder_fig(float(L), float(d), (f'{Ls} m', f'{ds} m', '?')), 2)


def b_slide(Ls, ts, drs):
    L, top, drop = nsimplify(Ls), nsimplify(ts), nsimplify(drs)
    b1 = S(L * L - top * top)
    t2 = top - drop
    b2 = S(L * L - t2 * t2)
    move = b2 - b1
    tb1, tb2 = leg_len(L, top), leg_len(L, t2)
    cmp = '多' if move > drop else '少'
    assert move != drop
    return V(rf'如圖，長 ${Ls}$ 公尺的梯子斜靠在垂直的牆上，頂端離地 ${ts}$ 公尺。頂端沿牆下滑 ${drs}$ 公尺後，求：(1) 原本梯子底端離牆腳幾公尺；(2) 下滑後梯子底端離牆腳幾公尺；(3) 梯子底端往外移動幾公尺。',
             [Num(b1, tb1, unit=' 公尺', label='(1) ', style='dec'), Num(b2, tb2, unit=' 公尺', label='(2) ', style='dec'),
              Num(move, tb2 - tb1, unit=' 公尺', label='(3) ', style='dec')],
             rf'(1) 梯子是斜邊：底端離牆 $\sqrt{{{Ls}^2-{ts}^2}}=\sqrt{{{dstr(L * L)}-{dstr(top * top)}}}={sq(b1 * b1)}$ 公尺。'
             rf'(2) 下滑後頂端離地 ${ts}-{drs}={dstr(t2)}$ 公尺，底端離牆 $\sqrt{{{Ls}^2-{dstr(t2)}^2}}=\sqrt{{{dstr(L * L)}-{dstr(t2 * t2)}}}={sq(b2 * b2)}$ 公尺。'
             rf'(3) 外移 ${dstr(b2)}-{dstr(b1)}={dstr(move)}$ 公尺，比頂端下滑的 ${drs}$ 公尺{cmp}。',
             ladder_fig(float(L), float(b1), (f'{Ls} m', '', f'{ts} m'), second=(float(b2), float(t2), (f'下滑 {drs}', '?'))), 3)


def b_cup(r, h, rod):
    inside = int(S(r * r + h * h))
    tin = hyp_len(r, h)
    return V(rf'如圖，直圓柱杯子的底面半徑 ${r}$ 公分、高 ${h}$ 公分，長 ${rod}$ 公分的玻棒從杯蓋中央的小孔插到杯底邊緣。求：(1) 玻棒在杯內的長度；(2) 玻棒露出杯口外幾公分。',
             [Num(inside, tin, unit=' 公分', label='(1) '), Num(rod - inside, rod - tin, unit=' 公分', label='(2) ')],
             rf'(1) 半徑、杯高、杯內的玻棒圍成直角三角形，玻棒是斜邊：$\sqrt{{{r}^2+{h}^2}}=\sqrt{{{r * r}+{h * h}}}={sq(r * r + h * h)}$ 公分。'
             rf'(2) 露出 ${rod}-{inside}={rod - inside}$ 公分。',
             cup_fig(r, h, rod, (str(r), str(h), '', '?')), 2)


def b_diag(w, h=None, d=None):
    if d is None:
        d2 = w * w + h * h
        return V(rf'如圖，長方形 $ABCD$ 的長 $\overline{{CD}}={w}$、寬 $\overline{{BC}}={h}$，求對角線 $\overline{{BD}}$ 的長（化成最簡根式）。',
                 [Num(S(d2), Point(0, 0).distance(Point(w, h)), lhs=r'\overline{BD}=')],
                 rf'長方形的四個角都是直角，對角線 $\overline{{BD}}$ 是直角三角形 $BCD$ 的斜邊：$\overline{{BD}}^2={w}^2+{h}^2={w * w}+{h * h}={d2}$，$\overline{{BD}}={sq(d2)}$。',
                 rect_fig(w, h, (str(w), str(h), '?')), 2)
    h2 = d * d - w * w
    return V(rf'如圖，長方形 $ABCD$ 的長 $\overline{{CD}}={w}$，對角線 $\overline{{BD}}={d}$，求寬 $\overline{{BC}}$ 的長。',
             [Num(S(h2), leg_len(d, w), lhs=r'\overline{BC}=')],
             rf'$\angle C=90^\circ$，$\overline{{BD}}$ 是直角三角形 $BCD$ 的斜邊：$\overline{{BC}}^2={d}^2-{w}^2={d * d}-{w * w}={h2}$，$\overline{{BC}}={sq(h2)}$。',
             rect_fig(w, float(S(h2)), (str(w), '?', str(d))), 2)


def b_square(s, ask):
    """正方形 ABCD 邊長 s（偶數），E 是 AB 的中點。ask：要求的量的清單（'BD'、'DE'、'BD/DE'、'DE/BD'）。"""
    D_, A_, B_ = Point(0, 0), Point(0, s), Point(s, s)
    E_ = Point(R(s, 2), s)
    e = s // 2
    bd, de = s * S(2), e * S(5)
    val = {'BD': (bd, B_.distance(D_)), 'DE': (de, D_.distance(E_)),
           'BD/DE': (bd / de, B_.distance(D_) / D_.distance(E_)), 'DE/BD': (de / bd, D_.distance(E_) / B_.distance(D_))}
    step = {
        'BD': rf'$\overline{{BD}}$ 是直角三角形 $ABD$ 的斜邊：$\overline{{BD}}^2={s}^2+{s}^2={2 * s * s}$，$\overline{{BD}}={sq(2 * s * s)}$。',
        'DE': rf'$\overline{{AE}}={s}\div2={e}$，$\overline{{DE}}$ 是直角三角形 $ADE$ 的斜邊：$\overline{{DE}}^2={e}^2+{s}^2={e * e}+{s * s}={e * e + s * s}$，$\overline{{DE}}={sq(e * e + s * s)}$。',
        'BD/DE': rf'$\dfrac{{\overline{{BD}}}}{{\overline{{DE}}}}=\dfrac{{{simp(bd)}}}{{{simp(de)}}}=\dfrac{{2\sqrt{{2}}}}{{\sqrt{{5}}}}=\dfrac{{2\sqrt{{2}}\times\sqrt{{5}}}}{{\sqrt{{5}}\times\sqrt{{5}}}}=\dfrac{{2\sqrt{{10}}}}{{5}}$（分母有理化）。',
        'DE/BD': rf'$\dfrac{{\overline{{DE}}}}{{\overline{{BD}}}}=\dfrac{{{simp(de)}}}{{{simp(bd)}}}=\dfrac{{\sqrt{{5}}}}{{2\sqrt{{2}}}}=\dfrac{{\sqrt{{5}}\times\sqrt{{2}}}}{{2\sqrt{{2}}\times\sqrt{{2}}}}=\dfrac{{\sqrt{{10}}}}{{4}}$（分母有理化）。',
    }
    words = {'BD': r'$\overline{BD}$ 的長', 'DE': r'$\overline{DE}$ 的長', 'BD/DE': r'$\overline{BD}:\overline{DE}$ 的比值', 'DE/BD': r'$\overline{DE}:\overline{BD}$ 的比值'}
    lhs = {'BD': r'\overline{BD}=', 'DE': r'\overline{DE}=', 'BD/DE': r'\dfrac{\overline{BD}}{\overline{DE}}=', 'DE/BD': r'\dfrac{\overline{DE}}{\overline{BD}}='}
    multi = len(ask) > 1
    lbl = lambda i: f'({i}) ' if multi else ''  # noqa: E731
    ask_t = '；'.join(f'{lbl(i)}{words[k]}' for i, k in enumerate(ask, 1))
    sol = ''
    for i, k in enumerate(ask, 1):
        sol += lbl(i)
        if '/' in k:  # 比值要先算兩段長：前面沒問到的那一段寫在這一小題裡
            sol += ''.join(step[x] for x in ('BD', 'DE') if x not in ask)
        sol += step[k]
    fig_lab = (str(s), '?' if ask == ['DE'] else '', '?' if ask == ['BD'] else '')
    return V(rf'如圖，正方形 $ABCD$ 的邊長是 ${s}$，$E$ 是 $\overline{{AB}}$ 的中點，求' + ('：' if multi else '') + ask_t + '（化成最簡根式）。',
             [Num(val[k][0], val[k][1], lhs=lhs[k], label=lbl(i)) for i, k in enumerate(ask, 1)],
             sol, square_mid_fig(s, fig_lab), 3 if multi else 2)


B_SLOTS = [
    ('q1', 0, ['s-IV-7'], ['S-8-6'], [b_shared(6, 8, 5), b_shared(3, 4, 2), b_shared(5, 12, 4), b_shared(9, 12, 5), b_shared(2, 4, 3)]),
    ('q2', 0, ['s-IV-7'], ['S-8-6'], [b_kite(3, 4, 1), b_kite(6, 8, 2), b_kite(1, 3, 2), b_kite(5, 5, 1), b_kite(2, 3, 1)]),
    ('q3', 1, ['s-IV-7'], ['S-8-6'], [b_alt(6, 8), b_alt(5, 12), b_alt(9, 12), b_alt(8, 15), b_alt(7, 24)]),
    ('q4', 1, ['s-IV-7'], ['S-8-6'], [b_leg_alt(15, 25), b_leg_alt(6, 10), b_leg_alt(12, 13), b_leg_alt(8, 17), b_leg_alt(2, 4)]),
    ('q5', 1, ['s-IV-7'], ['S-8-6'], [b_area('formula'), b_area('from_area'), b_area('to_area'), b_area('other_leg'), b_area('foot')]),
    ('q6', 2, ['s-IV-7'], ['S-8-6'], [b_pole('1.3', '0.5'), b_pole('2.6', '1'), b_pole('1.7', '0.8'), b_pole('2.5', '1.5'), b_pole('3.9', '1.5')]),
    ('q7', 2, ['s-IV-7'], ['S-8-6'], [b_slide('5', '4.8', '1.8'), b_slide('6.5', '6', '0.8'), b_slide('10', '9.6', '1.6'), b_slide('2.5', '2.4', '0.9'), b_slide('6.5', '6', '2.1')]),
    ('q8', 2, ['s-IV-7'], ['S-8-6'], [b_cup(6, 8, 14), b_cup(8, 15, 20), b_cup(7, 24, 30), b_cup(9, 12, 18), b_cup(12, 16, 25)]),
    ('q9', 0, ['s-IV-7', 'n-IV-5'], ['S-8-6', 'N-8-1'], [b_diag(6, 3), b_diag(8, 4), b_diag(6, 2), b_diag(9, 3), b_diag(8, d=10)]),
    ('q10', 0, ['s-IV-7', 'n-IV-5'], ['S-8-6', 'N-8-1'], [
        b_square(4, ['BD', 'DE', 'BD/DE']), b_square(6, ['DE']), b_square(8, ['DE', 'DE/BD']), b_square(10, ['BD', 'DE']), b_square(12, ['BD/DE']),
    ]),
]


# ═════════════════════════════════════════
# 2-3(3) 平面上兩點的距離
# ═════════════════════════════════════════
def pt(name, x, y):
    return rf'${name}({x},{y})$'


def c_horizontal(a, b, y, names=('A', 'B')):
    d = Point(a, y).distance(Point(b, y))
    n1, n2 = names
    return V(rf'如圖，坐標平面上 {pt(n1, a, y)}、{pt(n2, b, y)}，求 $\overline{{{n1}{n2}}}$ 的長。',
             [Num(abs(a - b), d, lhs=rf'\overline{{{n1}{n2}}}=')],
             rf'兩點的 $y$ 坐標相同，在同一條水平線上，距離是 $x$ 坐標相減的絕對值：$\overline{{{n1}{n2}}}=|{a}-{c_(b)}|={abs(a - b)}$。距離不會是負數。',
             plane_fig([(n1, a, y, 'u'), (n2, b, y, 'u')], segs=[names]), 1)


def c_vertical(x, a, b, names=('C', 'D')):
    d = Point(x, a).distance(Point(x, b))
    n1, n2 = names
    return V(rf'如圖，坐標平面上 {pt(n1, x, a)}、{pt(n2, x, b)}，求 $\overline{{{n1}{n2}}}$ 的長。',
             [Num(abs(a - b), d, lhs=rf'\overline{{{n1}{n2}}}=')],
             rf'兩點的 $x$ 坐標相同，在同一條鉛垂線上，距離是 $y$ 坐標相減的絕對值：$\overline{{{n1}{n2}}}=|{b}-{c_(a)}|={abs(a - b)}$。',
             plane_fig([(n1, x, a, 'r'), (n2, x, b, 'r')], segs=[names]), 1)


def c_corner(A, B, C):
    """A 是直角頂點：A、B 在同一條水平線，A、C 在同一條鉛垂線。"""
    dx, dy = abs(A[0] - B[0]), abs(A[1] - C[1])
    d2 = dx * dx + dy * dy
    PA, PB, PC = Point(*A), Point(*B), Point(*C)
    side = 'r' if A[0] > B[0] else 'l'
    other = 'l' if side == 'r' else 'r'
    return V(rf'如圖，坐標平面上 {pt("A", *A)}、{pt("B", *B)}、{pt("C", *C)}，求：(1) $\overline{{AB}}$ 與 $\overline{{AC}}$ 的長；(2) $\overline{{BC}}$ 的長。',
             [Num(dx, PA.distance(PB), lhs=r'\overline{AB}=', label='(1) '), Num(dy, PA.distance(PC), lhs=r'\overline{AC}=', label=''),
              Num(S(d2), PB.distance(PC), lhs=r'\overline{BC}=', label='(2) ')],
             rf'(1) $A$、$B$ 在同一條水平線上：$\overline{{AB}}=|{A[0]}-{c_(B[0])}|={dx}$；$A$、$C$ 在同一條鉛垂線上：$\overline{{AC}}=|{A[1]}-{c_(C[1])}|={dy}$。'
             rf'(2) $\angle A=90^\circ$，由畢氏定理：$\overline{{BC}}^2={dx}^2+{dy}^2={dx * dx}+{dy * dy}={d2}$，$\overline{{BC}}={sq(d2)}$。',
             plane_fig([('A', *A, side), ('B', *B, other), ('C', *C, side)], segs=[('A', 'B'), ('A', 'C'), ('B', 'C')], right=('A', 'B', 'C')), 3)


def origin_general_fig(w=320, hgt=260):
    """P(x, y) 與原點：坐標軸、OP 連線、P 到 x 軸的鉛垂虛線與直角記號（P 的坐標用文字 x、y）。"""
    f = PFig(w, hgt, pad=30)
    f.pt('', -1.2, -1.2, False)
    f.pt('', 6.6, 4.8, False)
    f.seg(P('', -1.2, 0), P('', 6.6, 0), width=1.3, color='#6b7394')
    f.seg(P('', 0, -1.2), P('', 0, 4.8), width=1.3, color='#6b7394')
    O_, P_, F_ = P('', 0, 0), P('', 4, 3), P('', 4, 0)
    f.seg(O_, P_, width=2.2, color='#5a3fd6')
    f.seg(P_, F_, dash=True, color='#2f80ed')
    f.right(F_, O_, P_, 8)
    f.dot(O_)
    f.dot(P_)
    f.text(4.25, 3.15, 'P(x, y)', 14, anchor='start', font=SERIF)
    f.text(-0.45, -0.6, 'O', 13, color='#6b7394')
    f.text(6.3, -0.55, 'x', 13, color='#6b7394')
    f.text(-0.4, 4.5, 'y', 13, color='#6b7394')
    return f.svg()


def c_formula(kind):
    if kind == 'xy':
        x1, y1, x2, y2 = 1, 5, 7, -3  # 代入檢查用（和附圖一樣：A 在左上、B 在右下）
        A_, B_, C_ = Point(x1, y1), Point(x2, y2), Point(x1, y2)
        sub = {'x_1': x1, 'y_1': y1, 'x_2': x2, 'y_2': y2}
        return V(r'如圖，坐標平面上 $A(x_1,y_1)$、$B(x_2,y_2)$，過 $A$ 作鉛垂線、過 $B$ 作水平線，兩線交於 $C(x_1,y_2)$。用 $x_1$、$x_2$、$y_1$、$y_2$ 寫出：(1) 兩股 $\overline{AC}$、$\overline{BC}$ 的長；(2) $\overline{AB}$ 的長。',
                 [Formula(r'\overline{AC}=|y_1-y_2|', {**sub, 'L_AC': A_.distance(C_)}, label='(1) '),
                  Formula(r'\overline{BC}=|x_2-x_1|', {**sub, 'L_BC': B_.distance(C_)}),
                  Formula(r'\overline{AB}=\sqrt{(x_2-x_1)^2+(y_2-y_1)^2}', {**sub, 'L_AB': A_.distance(B_)}, label='(2) ')],
                 r'(1) $A$、$C$ 的 $x$ 坐標相同（鉛垂線），$\overline{AC}=|y_1-y_2|$；$B$、$C$ 的 $y$ 坐標相同（水平線），$\overline{BC}=|x_2-x_1|$。'
                 r'(2) $\angle C=90^\circ$，$\overline{AB}$ 是斜邊：$\overline{AB}^2=(x_2-x_1)^2+(y_2-y_1)^2$，所以 $\overline{AB}=\sqrt{(x_2-x_1)^2+(y_2-y_1)^2}$。'
                 r'平方後正負號不影響，寫成 $(x_1-x_2)^2+(y_1-y_2)^2$ 也對。',
                 general_fig(), 2)
    if kind == 'abcd':
        a, b, c, d = -2, 4, 3, -8
        return V(r'如圖，坐標平面上 $P(a,b)$、$Q(c,d)$，過 $P$ 作鉛垂線、過 $Q$ 作水平線，兩線交於 $R(a,d)$。用 $a$、$b$、$c$、$d$ 寫出 $\overline{PQ}$ 的長。',
                 [Formula(r'\overline{PQ}=\sqrt{(c-a)^2+(d-b)^2}', {'a': a, 'b': b, 'c': c, 'd': d, 'L_PQ': Point(a, b).distance(Point(c, d))})],
                 r'$\overline{QR}=|c-a|$（$x$ 坐標的差）、$\overline{PR}=|d-b|$（$y$ 坐標的差），$\angle R=90^\circ$，$\overline{PQ}$ 是斜邊：'
                 r'$\overline{PQ}=\sqrt{(c-a)^2+(d-b)^2}$。注意不是 $a-b$：同一點的 $x$、$y$ 坐標不能相減。',
                 general_fig(names=('P', 'Q', 'R'), coords=(('a', 'b'), ('c', 'd'), ('a', 'd'))), 2)
    if kind == 'origin':
        x, y = 4, 3
        return V(r'如圖，坐標平面上一點 $P(x,y)$，用 $x$、$y$ 寫出 $P$ 到原點 $O$ 的距離 $\overline{OP}$。',
                 [Formula(r'\overline{OP}=\sqrt{x^2+y^2}', {'x': x, 'y': y, 'L_OP': Point(0, 0).distance(Point(x, y))})],
                 r'原點 $O(0,0)$：$x$ 坐標的差是 $x-0=x$、$y$ 坐標的差是 $y-0=y$，兩股是 $|x|$、$|y|$，所以 $\overline{OP}=\sqrt{x^2+y^2}$。',
                 origin_general_fig(), 1)


def c_build(A, B, cpos):
    """過 A 作水平線、過 B 作鉛垂線交於 C：求 C 的坐標、兩股與 AB。"""
    PA, PB = Point(*A), Point(*B)
    C_ = Line(PA, PA + Point(1, 0)).intersection(Line(PB, PB + Point(0, 1)))[0]
    C = (int(C_.x), int(C_.y))
    ac, bc = abs(A[0] - B[0]), abs(A[1] - B[1])
    d2 = ac * ac + bc * bc

    def lbl(f, pts):
        f.text(C[0] + cpos[0], C[1] + cpos[1], 'C', 16, font=SERIF)

    return V(rf'如圖，坐標平面上 {pt("A", *A)}、{pt("B", *B)}，過 $A$ 作水平線、過 $B$ 作鉛垂線，兩線交於 $C$。求：(1) $C$ 點的坐標；(2) $\overline{{AC}}$ 與 $\overline{{BC}}$ 的長；(3) $\overline{{AB}}$ 的長。',
             [Txt(f'(1) $C({C[0]},{C[1]})$', C_ == Point(B[0], A[1])),
              Num(ac, PA.distance(C_), lhs=r'\overline{AC}=', label='(2) '), Num(bc, PB.distance(C_), lhs=r'\overline{BC}='),
              Num(S(d2), PA.distance(PB), lhs=r'\overline{AB}=', label='(3) ')],
             rf'(1) $C$ 和 $A$ 在同一條水平線上（$y$ 坐標同 $A$），和 $B$ 在同一條鉛垂線上（$x$ 坐標同 $B$），所以 $C({C[0]},{C[1]})$。'
             rf'(2) $\overline{{AC}}=|{C[0]}-{c_(A[0])}|={ac}$，$\overline{{BC}}=|{B[1]}-{c_(C[1])}|={bc}$。'
             rf'(3) $\angle C=90^\circ$，$\overline{{AB}}$ 是斜邊：$\overline{{AB}}^2={ac}^2+{bc}^2={ac * ac}+{bc * bc}={d2}$，$\overline{{AB}}={sq(d2)}$。',
             plane_fig([('A', *A, 'l' if A[0] < B[0] else 'r'), ('B', *B, 'r' if B[0] > A[0] else 'l'), ('', *C, 'r')],
                       segs=[('A', 'B')], dashed=[('A', ''), ('', 'B')], right=('', 'A', 'B'), extra=lbl), 3)


def c_dist(A, B, names=('A', 'B'), radical=False):
    dx, dy = B[0] - A[0], B[1] - A[1]
    d2 = dx * dx + dy * dy
    n1, n2 = names
    return V(rf'如圖，坐標平面上 {pt(n1, *A)}、{pt(n2, *B)}，求 $\overline{{{n1}{n2}}}$ 的長' + ('（化成最簡根式）。' if radical else '。'),
             [Num(S(d2), Point(*A).distance(Point(*B)), lhs=rf'\overline{{{n1}{n2}}}=')],
             rf'$\overline{{{n1}{n2}}}=\sqrt{{({B[0]}-{c_(A[0])})^2+({B[1]}-{c_(A[1])})^2}}=\sqrt{{{c_(dx)}^2+{c_(dy)}^2}}=\sqrt{{{dx * dx}+{dy * dy}}}={sq(d2)}$。',
             plane_fig([(n1, *A, 'r' if A[0] >= B[0] else 'l'), (n2, *B, 'r' if B[0] > A[0] else 'l'), ('', B[0], A[1], 'r')],
                       segs=[names], dashed=[(n1, ''), ('', n2)], right=('', n1, n2)), 2)


def c_fix(A, B, names=('M', 'N')):
    """改錯：把「減負數」算成「減正數」。"""
    dx, dy = B[0] - A[0], B[1] - A[1]
    wx, wy = B[0] - abs(A[0]), B[1] - abs(A[1])
    w2 = wx * wx + wy * wy
    d2 = dx * dx + dy * dy
    n1, n2 = names
    v = c_dist(A, B, names)
    v['stem'] = (rf'如圖，小明求 {pt(n1, *A)}、{pt(n2, *B)} 兩點的距離，寫成 $\sqrt{{({B[0]}-{abs(A[0])})^2+({B[1]}-{abs(A[1])})^2}}=\sqrt{{{w2}}}={simp(S(w2))}$。'
                 rf'指出他錯在哪裡，並寫出正確的算式，求 $\overline{{{n1}{n2}}}$ 的長。')
    v['solution'] = (rf'小明把 ${B[0]}-{c_(A[0])}$ 算成 ${B[0]}-{abs(A[0])}$、把 ${B[1]}-{c_(A[1])}$ 算成 ${B[1]}-{abs(A[1])}$：減去負數要變號。'
                     rf'正確：$\overline{{{n1}{n2}}}=\sqrt{{({B[0]}-{c_(A[0])})^2+({B[1]}-{c_(A[1])})^2}}=\sqrt{{{dx}^2+{dy}^2}}=\sqrt{{{dx * dx}+{dy * dy}}}={sq(d2)}$。')
    v['space'] = 3
    return v


def c_origin(x, y, name, radical=False):
    d2 = x * x + y * y
    return V(rf'如圖，坐標平面上一點 {pt(name, x, y)}，求 ${name}$ 到原點 $O$ 的距離' + ('（化成最簡根式）。' if radical else '。'),
             [Num(S(d2), Point(0, 0).distance(Point(x, y)), lhs=rf'\overline{{O{name}}}=')],
             rf'$O(0,0)$：$\overline{{O{name}}}=\sqrt{{({x}-0)^2+({y}-0)^2}}=\sqrt{{{c_(x)}^2+{c_(y)}^2}}=\sqrt{{{x * x}+{y * y}}}={sq(d2)}$。',
             origin_fig(x, y, name), 2)


def c_perimeter(A, B, C):
    """∠B＝90°：A、B 同一條水平線，B、C 同一條鉛垂線。"""
    ab, bc = abs(A[0] - B[0]), abs(B[1] - C[1])
    ac = S(ab * ab + bc * bc)
    per = ab + bc + ac
    PA, PB, PC = Point(*A), Point(*B), Point(*C)
    tper = f'{ab + bc}+{simp(ac)}' if not ac.is_Integer else str(per)
    sum_t = f'{ab}+{bc}+{simp(ac)}'
    return V(rf'如圖，坐標平面上 {pt("A", *A)}、{pt("B", *B)}、{pt("C", *C)}，求：(1) $\overline{{AC}}$ 的長；(2) $\triangle ABC$ 的周長。',
             [Num(ac, PA.distance(PC), lhs=r'\overline{AC}=', label='(1) '),
              Num(per, PA.distance(PB) + PB.distance(PC) + PC.distance(PA), label='(2) 周長是 ', tex=tper)],
             rf'(1) $\overline{{AB}}=|{B[0]}-{c_(A[0])}|={ab}$，$\overline{{BC}}=|{C[1]}-{c_(B[1])}|={bc}$，$\angle B=90^\circ$：'
             rf'$\overline{{AC}}=\sqrt{{{ab}^2+{bc}^2}}=\sqrt{{{ab * ab + bc * bc}}}' + (f'={simp(ac)}' if split(ab * ab + bc * bc)[0] != 1 else '') + '$。'
             rf'(2) 周長 $={sum_t}' + (f'={tper}' if tper != sum_t else '') + '$。' + ('（根式和整數不能合併）' if not ac.is_Integer else ''),
             plane_fig([('A', *A, 'l'), ('B', *B, 'r'), ('C', *C, 'r')], segs=[('A', 'B'), ('B', 'C'), ('A', 'C')], right=('B', 'A', 'C')), 2)


def c_plane_alt(A, B, C):
    """∠B＝90°，求 B 到斜邊 AC 的距離 h。"""
    ab, bc = abs(A[0] - B[0]), abs(B[1] - C[1])
    ac2 = ab * ab + bc * bc
    ac = S(ac2)
    h = ab * bc / ac
    PA, PB, PC = Point(*A), Point(*B), Point(*C)
    k, m = split(ac2)
    mid = '' if m == 1 else rf'=\dfrac{{{ab * bc}\times\sqrt{{{m}}}}}{{{simp(ac)}\times\sqrt{{{m}}}}}=\dfrac{{{ab * bc}\sqrt{{{m}}}}}{{{k * m}}}'

    def foot(f, pts):
        a, b_, c__ = pts['A'], pts['B'], pts['C']
        t = ((b_.x - a.x) * (c__.x - a.x) + (b_.y - a.y) * (c__.y - a.y)) / ((c__.x - a.x) ** 2 + (c__.y - a.y) ** 2)
        H = P('', a.x + t * (c__.x - a.x), a.y + t * (c__.y - a.y))
        f.seg(b_, H, dash=True, color='#c0392b')
        f.right(H, c__, b_, 7)
        f.side(b_, H, 'h', away=a, color='#c0392b')

    return V(rf'如圖，坐標平面上 {pt("A", *A)}、{pt("B", *B)}、{pt("C", *C)}，求：(1) $\overline{{AC}}$ 的長；(2) $B$ 到 $\overline{{AC}}$ 的距離 $h$。',
             [Num(ac, PA.distance(PC), lhs=r'\overline{AC}=', label='(1) '), Num(h, Line(PA, PC).distance(PB), lhs='h=', label='(2) ')],
             rf'(1) $\overline{{AB}}=|{B[0]}-{c_(A[0])}|={ab}$，$\overline{{BC}}=|{C[1]}-{c_(B[1])}|={bc}$，$\angle B=90^\circ$：$\overline{{AC}}=\sqrt{{{ab}^2+{bc}^2}}={sq(ac2)}$。'
             rf'(2) 面積的兩種算法：$\dfrac{{1}}{{2}}\times\overline{{AC}}\times h=\dfrac{{1}}{{2}}\times{ab}\times{bc}$，'
             rf'$h=\dfrac{{{ab}\times{bc}}}{{{simp(ac)}}}{mid}={simp(h)}$。' + ('（分母有理化）' if m != 1 else ''),
             plane_fig([('A', *A, 'l'), ('B', *B, 'r'), ('C', *C, 'r')], segs=[('A', 'B'), ('B', 'C'), ('A', 'C')], right=('B', 'A', 'C'), extra=foot), 3)


C_SLOTS = [
    ('q1', 0, ['g-IV-1'], ['G-8-1'], [
        c_horizontal(3, -5, 2), c_horizontal(-4, 2, -1, ('P', 'Q')), c_horizontal(-6, -1, 3, ('M', 'N')), c_horizontal(7, -2, -3), c_horizontal(-3, 5, -4, ('E', 'F')),
    ]),
    ('q2', 0, ['g-IV-1'], ['G-8-1'], [
        c_vertical(2, -3, 5), c_vertical(-3, -6, -1, ('E', 'F')), c_vertical(4, -2, 7, ('G', 'H')), c_vertical(-4, 4, -3), c_vertical(5, -5, 1, ('P', 'Q')),
    ]),
    ('q3', 1, ['g-IV-1', 's-IV-7'], ['G-8-1', 'S-8-6'], [
        c_corner((2, 1), (-4, 1), (2, 9)), c_corner((-1, -2), (4, -2), (-1, 10)), c_corner((1, 3), (-2, 3), (1, -3)),
        c_corner((-2, -1), (2, -1), (-2, 3)), c_corner((4, 2), (-4, 2), (4, -4)),
    ]),
    ('q4', 1, ['g-IV-1', 's-IV-7'], ['G-8-1', 'S-8-6'], [
        c_formula('xy'), c_formula('abcd'), c_formula('origin'), c_build((3, 1), (7, 4), (0.35, -0.5)), c_build((-2, 3), (4, -5), (0.4, 0.4)),
    ]),
    ('q5', 2, ['g-IV-1'], ['G-8-1'], [
        c_dist((1, 2), (4, 6)), c_dist((-3, 1), (3, -7)), c_dist((2, -5), (-3, 7)), c_dist((-4, -5), (5, 7), ('P', 'Q')), c_dist((0, 3), (-4, 0), ('M', 'N')),
    ]),
    ('q6', 2, ['g-IV-1', 'n-IV-5'], ['G-8-1', 'N-8-1'], [
        c_dist((3, -2), (-3, 1), ('C', 'D'), True), c_dist((0, -4), (-2, 2), ('E', 'F'), True), c_dist((-1, 3), (3, -1), ('G', 'H'), True),
        c_dist((2, 5), (-2, -3), ('P', 'Q'), True), c_dist((-2, -2), (3, 3), ('M', 'N'), True),
    ]),
    ('q7', 2, ['g-IV-1'], ['G-8-1'], [
        c_dist((-1, 2), (3, -1)), c_dist((-2, -3), (4, 5), ('P', 'Q')), c_dist((-4, 1), (2, -7), ('M', 'N')),
        c_dist((-3, 4), (2, -8), ('E', 'F')), c_dist((-2, 5), (1, -1), ('G', 'H'), True), c_fix((-1, -2), (5, 6)),
    ]),
    ('q8', 2, ['g-IV-1', 'n-IV-5'], ['G-8-1', 'N-8-1'], [
        c_origin(-6, 8, 'P'), c_origin(12, -5, 'Q'), c_origin(-3, -3, 'R', True), c_origin(2, -4, 'S', True), c_origin(-4, -6, 'T', True),
    ]),
    ('q9', 2, ['g-IV-1', 's-IV-7'], ['G-8-1', 'S-8-6'], [
        c_perimeter((-2, 1), (4, 1), (4, 9)), c_perimeter((-3, -2), (2, -2), (2, 10)), c_perimeter((-3, -1), (0, -1), (0, 3)),
        c_perimeter((-1, -1), (1, -1), (1, 3)), c_perimeter((-2, 3), (2, 3), (2, -1)),
    ]),
    ('q10', 2, ['g-IV-1', 's-IV-7'], ['G-8-1', 'S-8-6'], [
        c_plane_alt((-3, -2), (3, -2), (3, 6)), c_plane_alt((-2, -3), (3, -3), (3, 9)), c_plane_alt((1, 1), (4, 1), (4, 5)),
        c_plane_alt((-1, -2), (1, -2), (1, 2)), c_plane_alt((0, 0), (3, 0), (3, 3)),
    ]),
]


# ═════════ 課綱（照備課用書原文） ═════════
GUIDE = '備課用書 01-115國中數學2上-備課-目次(115f231509).pdf'
CODES = {
    's-IV-7': ('performance', '理解畢氏定理與其逆敘述，並能應用於數學解題與日常生活的問題。'),
    'g-IV-1': ('performance', '認識直角坐標的意義與構成要素，並能報讀與標示坐標點，以及計算兩個坐標點的距離。'),
    'n-IV-5': ('performance', '理解二次方根的意義、符號與根式的四則運算，並能運用到日常生活的情境解決問題。'),
    'S-8-6': ('content', '畢氏定理：畢氏定理（勾股弦定理、商高定理）的意義及其數學史；畢氏定理在生活上的應用；三邊長滿足畢氏定理的三角形必定是直角三角形。'),
    'G-8-1': ('content', r'直角坐標系上兩點距離公式：直角坐標系上兩點 $A(a,b)$ 和 $B(c,d)$ 的距離為 $\overline{AB}=\sqrt{(a-c)^2+(b-d)^2}$；生活上相關問題。'),
    'N-8-1': ('content', '二次方根：二次方根的意義；根式的化簡及四則運算。'),
}

# 多小題的 IRS 頁：每一小題各自對到的題型（順序＝課程 JSON 的 items 順序）。
# 學習紀錄逐小題記錄；沒列的多小題頁若整頁對到兩個以上題型，check-homework 會報錯。
ITEM_LINKS = {
    'g8-2-3a': {
        'a-warmup': [['q4'], ['q4'], ['q5']],
        'a-ex1': [['q4'], ['q5']],
        'a-ex2': [['q6'], ['q7']],
    },
    'g8-2-3b': {
        'b-ex5': [['q6'], ['q7']],
    },
    'g8-2-3c': {
        # 暖身：數線上兩點、兩數差的絕對值、兩股求斜邊
        'c-warmup': [['q1'], ['q2'], ['q3']],
        # 例 7：AB 在水平線、AC 在鉛垂線、BC 用畢氏定理；隨堂 CD 鉛垂、DE 水平、CE 斜的
        'c-ex7': [['q1'], ['q2'], ['q3']],
        'c-ex7-practice': [['q2'], ['q1'], ['q3']],
    },
}

LESSONS = [
    ('g8-2-3a', '2-3(1) 畢氏定理與邊長計算',
     f'八上課本 2-3 p.92–96（斜邊與股、畢氏定理、例 1、例 2 與隨堂）；{GUIDE} p.30–31（2-3 教學活動連結分析表：學習表現 s-IV-7、學習內容 S-8-6）、'
     'p.28–29（2-2：n-IV-5、N-8-1，用於化成最簡根式的題型）；備課用書 03-115國中數學2上-備課-L02(115f231511).pdf p.154（課本 p.92「對應學習內容 S-8-6」）',
     A_SLOTS,
     {'a-warmup': ['q4', 'q5'], 'a-intro': ['q1', 'q8'], 'a-predict': ['q4'], 'a-grid': ['q3'], 'a-proof': ['q2', 'q3'], 'a-theorem': ['q2'],
      'a-ex1': ['q4', 'q5'], 'a-ex1-practice': ['q4'], 'a-ex2': ['q6', 'q7'], 'a-ex2-practice': ['q9'], 'a-which': ['q4', 'q7'],
      'a-error': ['q6'], 'a-exit': ['q4', 'q6']}),
    ('g8-2-3b', '2-3(2) 畢氏定理的應用',
     f'八上課本 2-3 p.97–100（例 3–例 6 與隨堂）；{GUIDE} p.30–31（2-3 教學活動連結分析表：學習表現 s-IV-7、學習內容 S-8-6）、'
     'p.28–29（2-2：n-IV-5、N-8-1，用於化成最簡根式、分母有理化的題型）；備課用書 03-115國中數學2上-備課-L02(115f231511).pdf p.159–162（課本 p.97–100）',
     B_SLOTS,
     {'b-ex3': ['q1'], 'b-ex3-practice': ['q2'], 'b-area': ['q3', 'q5'], 'b-ex4': ['q3'], 'b-ex4-practice': ['q4'], 'b-ex5-predict': ['q7'],
      'b-ex5': ['q6', 'q7'], 'b-ex5-practice': ['q8'], 'b-ex6': ['q9'], 'b-ex6-practice': ['q10'], 'b-error': ['q3', 'q5']}),
    ('g8-2-3c', '2-3(3) 平面上兩點的距離',
     f'八上課本 2-3 p.101–103（例 7、例 8、兩點距離公式）；{GUIDE} p.30–31（2-3 教學活動連結分析表：學習表現 s-IV-7、g-IV-1，學習內容 S-8-6、G-8-1）、'
     'p.28–29（2-2：n-IV-5、N-8-1，用於化成最簡根式的題型）；備課用書 03-115國中數學2上-備課-L02(115f231511).pdf p.163（課本 p.101「對應學習內容 G-8-1」）',
     C_SLOTS,
     {'c-warmup': ['q1', 'q2'], 'c-predict': ['q5'], 'c-ex7': ['q1', 'q2', 'q3'], 'c-ex7-practice': ['q1', 'q2', 'q3'], 'c-explore': ['q4'],
      'c-formula': ['q4'], 'c-ex8': ['q5', 'q7'], 'c-ex8-practice': ['q6', 'q7'], 'c-error': ['q7'], 'c-summary': ['q4']}),
]


def build():
    total = 0
    for lid, title, source, slots, acts in LESSONS:
        quiz = json.loads((ROOT / 'content/quizzes' / f'{lid}.json').read_text(encoding='utf8'))
        topics = {s['id']: s['topic'] for s in quiz['slots']}
        assert [s[0] for s in slots] == list(topics), f'{lid}：題位和課後檢核不一致'
        used_p = sorted({c for s in slots for c in s[2]}, key=list(CODES).index)
        used_c = sorted({c for s in slots for c in s[3]}, key=list(CODES).index)
        out_slots = []
        for sid, obj, perf, cont, variants in slots:
            assert len(variants) >= 5, f'{lid} {sid} 只有 {len(variants)} 題'
            for k, v in enumerate(variants, 1):
                total += check_variant(v, f'{lid} {sid}-{k}（{topics[sid]}）')
            out_slots.append(dict(id=sid, topic=topics[sid], objective=obj, performance=perf, content=cont,
                                  variants=[{k: v[k] for k in ('stem', 'figure', 'answer', 'solution', 'space')} for v in variants]))
        out = dict(lessonId=lid, section='8-2-3', title=title, source=source,
                   curriculum=dict(performance=[dict(code=c, text=CODES[c][1]) for c in used_p],
                                   content=[dict(code=c, text=CODES[c][1]) for c in used_c]),
                   slots=out_slots, links=dict(activities=acts, **({'items': ITEM_LINKS[lid]} if lid in ITEM_LINKS else {})))
        path = ROOT / 'content/homework' / f'{lid}.json'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        n = sum(len(s[4]) for s in slots)
        print(f'✓ {lid}：{len(slots)} 個題型、{n} 題 → content/homework/{lid}.json')
    print(f'{total} 題全部一致')


if __name__ == '__main__':
    build()
