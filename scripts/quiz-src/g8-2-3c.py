r"""2-3(3) 平面上兩點的距離：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一，每題附圖）。

用法：python -X utf8 scripts/quiz-src/g8-2-3c.py
範圍：七年級數線上兩點的距離、2-1、2-2（最簡根式）、2-3(1)(2)（畢氏定理、斜邊上的高）＋這一堂的
水平線／鉛垂線上兩點的距離、兩點距離公式、到原點的距離、坐標平面上的直角三角形。
附圖都是坐標平面（方格＋坐標軸），點的位置和題目的坐標相同。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import Rational, sqrt  # noqa: E402

from geom import P  # noqa: E402
from pyth import bad_root, frac, ftex, general_fig, origin_fig, plane_fig, root, rtex  # noqa: E402
from quizlib import export, form, raw, slot, statement, value, with_figure  # noqa: E402

R = Rational
S = sqrt


def n(v):
    return raw(f'${v}$', v)


def c(v):
    """坐標的寫法：負數加括號。"""
    return f'({v})' if v < 0 else str(v)


def pt(name, x, y):
    return rf'${name}({x},{y})$'


# ───────── 1. 水平線上兩點的距離 ─────────
def horizontal(a, b, y, names=('A', 'B')):
    d = abs(a - b)
    wrong = abs(a + b) if abs(a + b) != d else d + 2
    return with_figure(value(
        rf'如圖，坐標平面上 {pt(names[0], a, y)}、{pt(names[1], b, y)}，則 $\overline{{{names[0]}{names[1]}}}=$？',
        d,
        [n(d), n(wrong), n(-d), n(abs(y) if abs(y) not in (d, wrong) else abs(y) + d + 1)],
        rf'兩點的 $y$ 坐標相同（在同一條水平線上），距離＝$x$ 坐標的差：$|{a}-{c(b)}|={d}$。距離不會是負數。'),
        plane_fig([(names[0], a, y, 'u'), (names[1], b, y, 'u')], segs=[names]))


# ───────── 2. 鉛垂線上兩點的距離 ─────────
def vertical(x, a, b, names=('C', 'D')):
    d = abs(a - b)
    wrong = abs(a + b) if abs(a + b) != d else d + 2
    return with_figure(value(
        rf'如圖，坐標平面上 {pt(names[0], x, a)}、{pt(names[1], x, b)}，則 $\overline{{{names[0]}{names[1]}}}=$？',
        d,
        [n(d), n(wrong), n(-d), n(abs(x) + d + 1 if abs(x) in (d, wrong) else abs(x))],
        rf'兩點的 $x$ 坐標相同（在同一條鉛垂線上），距離＝$y$ 坐標的差：$|{b}-{c(a)}|={d}$。'),
        plane_fig([(names[0], x, a, 'r'), (names[1], x, b, 'r')], segs=[names]))


# ───────── 3. 坐標平面上的直角三角形（課本例 7） ─────────
def corner_tri(A, B, Cc):
    """A 是直角頂點：A、B 在同一條水平線，A、C 在同一條鉛垂線。求 BC。"""
    dx, dy = abs(A[0] - B[0]), abs(A[1] - Cc[1])
    d2 = dx * dx + dy * dy
    kind = value if split_sq(d2) else form
    opts = [root(d2), n(dx + dy), root(abs(dx * dx - dy * dy)), n(d2)]
    if kind is form:
        opts = [root(d2), bad_root(d2), n(dx + dy), root(abs(dx * dx - dy * dy))]
    return with_figure(kind(
        rf'如圖，坐標平面上 {pt("A", *A)}、{pt("B", *B)}、{pt("C", *Cc)}，則 $\overline{{BC}}=$？' + ('（化成最簡根式）' if kind is form else ''),
        S(d2),
        opts,
        rf'$\overline{{AB}}=|{A[0]}-{c(B[0])}|={dx}$、$\overline{{AC}}=|{A[1]}-{c(Cc[1])}|={dy}$，$\angle A=90^\circ$：$\overline{{BC}}=\sqrt{{{dx}^2+{dy}^2}}=\sqrt{{{d2}}}={rtex(d2)}$。'),
        plane_fig([('A', *A, 'r' if A[0] > B[0] else 'l'), ('B', *B, 'l' if A[0] > B[0] else 'r'), ('C', *Cc, 'r' if A[0] > B[0] else 'l')],
                  segs=[('A', 'B'), ('A', 'C'), ('B', 'C')], right=('A', 'B', 'C')))


def split_sq(n_):
    r = int(n_ ** 0.5)
    return r * r == n_


# ───────── 4. 距離公式 ─────────
def formula(kind):
    if kind == 1:
        return with_figure(statement(
            r'如圖，坐標平面上 $A(x_1,y_1)$、$B(x_2,y_2)$ 兩點的距離 $\overline{AB}=$？',
            [(r'$\sqrt{(x_2-x_1)^2+(y_2-y_1)^2}$', True), (r'$(x_2-x_1)+(y_2-y_1)$', False),
             (r'$\sqrt{(x_2-x_1)^2-(y_2-y_1)^2}$', False), (r'$(x_2-x_1)^2+(y_2-y_1)^2$', False)],
            r'過 $A$、$B$ 作鉛垂線與水平線交於 $C$：兩股是 $|x_2-x_1|$、$|y_2-y_1|$，$\overline{AB}$ 是斜邊，所以 $\overline{AB}=\sqrt{(x_2-x_1)^2+(y_2-y_1)^2}$。'),
            general_fig())
    if kind == 2:
        return with_figure(statement(
            r'如圖，坐標平面上 $P(a,b)$、$Q(c,d)$ 兩點的距離 $\overline{PQ}=$？',
            [(r'$\sqrt{(c-a)^2+(d-b)^2}$', True), (r'$\sqrt{(a-b)^2+(c-d)^2}$', False),
             (r'$\sqrt{(c-a)+(d-b)}$', False), (r'$(c-a)^2+(d-b)^2$', False)],
            r'$x$ 坐標的差是 $c-a$，$y$ 坐標的差是 $d-b$：$\overline{PQ}=\sqrt{(c-a)^2+(d-b)^2}$。$a-b$ 是同一點的 $x$、$y$ 坐標相減，沒有意義。'),
            general_fig(names=('P', 'Q', 'R'), coords=(('a', 'b'), ('c', 'd'), ('a', 'd'))))
    return with_figure(statement(
        r'如圖，坐標平面上一點 $P(x,y)$ 到原點 $O$ 的距離 $\overline{OP}=$？',
        [(r'$\sqrt{x^2+y^2}$', True), (r'$x+y$', False), (r'$x^2+y^2$', False), (r'$\sqrt{x+y}$', False)],
        r'$O(0,0)$：$x$ 坐標的差是 $x$、$y$ 坐標的差是 $y$，$\overline{OP}=\sqrt{x^2+y^2}$。'),
        origin_fig(4, 3))


# ───────── 5–7. 用距離公式 ─────────
def dist(A, B, names=('A', 'B'), opts=None, kind=value, hint=''):
    dx, dy = B[0] - A[0], B[1] - A[1]
    d2 = dx * dx + dy * dy
    return with_figure(kind(
        rf'如圖，坐標平面上 {pt(names[0], *A)}、{pt(names[1], *B)}，則 $\overline{{{names[0]}{names[1]}}}=$？' + ('（化成最簡根式）' if kind is form else ''),
        S(d2),
        opts,
        rf'$\overline{{{names[0]}{names[1]}}}=\sqrt{{({B[0]}-{c(A[0])})^2+({B[1]}-{c(A[1])})^2}}=\sqrt{{{c(dx)}^2+{c(dy)}^2}}=\sqrt{{{d2}}}={rtex(d2)}$。{hint}'),
        plane_fig([(names[0], *A, 'r' if A[0] >= B[0] else 'l'), (names[1], *B, 'r' if B[0] > A[0] else 'l'), ('', B[0], A[1], 'r')],
                  segs=[names], dashed=[(names[0], ''), ('', names[1])], right=('', names[0], names[1])))


# ───────── 8. 到原點的距離 ─────────
def to_origin(x, y, name, opts, kind=value):
    d2 = x * x + y * y
    return with_figure(kind(
        rf'如圖，坐標平面上一點 {pt(name, x, y)} 到原點 $O$ 的距離是多少？' + ('（化成最簡根式）' if kind is form else ''),
        S(d2),
        opts,
        rf'$\overline{{O{name}}}=\sqrt{{{c(x)}^2+{c(y)}^2}}=\sqrt{{{d2}}}={rtex(d2)}$。'),
        origin_fig(x, y, name))


# ───────── 9. 坐標平面上三角形的周長 ─────────
def perimeter(A, B, Cc, wrong):
    """∠B＝90°：A、B 同一條水平線，B、C 同一條鉛垂線。"""
    ab, bc = abs(A[0] - B[0]), abs(B[1] - Cc[1])
    ac = int((ab * ab + bc * bc) ** 0.5)
    per = ab + bc + ac
    return with_figure(value(
        rf'如圖，坐標平面上 {pt("A", *A)}、{pt("B", *B)}、{pt("C", *Cc)}，$\triangle ABC$ 的周長是多少？',
        per,
        [n(per), n(ab + bc), n(2 * (ab + bc)), n(wrong)],
        rf'$\overline{{AB}}={ab}$、$\overline{{BC}}={bc}$，$\angle B=90^\circ$：$\overline{{AC}}=\sqrt{{{ab}^2+{bc}^2}}={ac}$。周長 $={ab}+{bc}+{ac}={per}$。'),
        plane_fig([('A', *A, 'l'), ('B', *B, 'r'), ('C', *Cc, 'r')], segs=[('A', 'B'), ('B', 'C'), ('A', 'C')], right=('B', 'A', 'C')))


# ───────── 10. 坐標平面上的斜邊上的高 ─────────
def plane_alt(A, B, Cc, wrong):
    """∠B＝90°，求 B 到斜邊 AC 的距離。"""
    ab, bc = abs(A[0] - B[0]), abs(B[1] - Cc[1])
    ac = int((ab * ab + bc * bc) ** 0.5)
    h = R(ab * bc, ac)

    def foot(f, pts):
        a, b_, c_ = pts['A'], pts['B'], pts['C']
        t = ((b_.x - a.x) * (c_.x - a.x) + (b_.y - a.y) * (c_.y - a.y)) / ((c_.x - a.x) ** 2 + (c_.y - a.y) ** 2)
        H = P('', a.x + t * (c_.x - a.x), a.y + t * (c_.y - a.y))
        f.seg(b_, H, dash=True, color='#c0392b')
        f.right(H, c_, b_, 7)
        f.side(b_, H, 'h', away=a, color='#c0392b')

    return with_figure(value(
        rf'如圖，坐標平面上 {pt("A", *A)}、{pt("B", *B)}、{pt("C", *Cc)}，$B$ 到 $\overline{{AC}}$ 的距離 $h$ 是多少？',
        h,
        [frac(h), n(ab * bc // 2) if ab * bc % 2 == 0 else frac(R(ab * bc, 2)), n(ab * bc), frac(wrong)],
        rf'$\overline{{AB}}={ab}$、$\overline{{BC}}={bc}$、$\overline{{AC}}={ac}$（$\angle B=90^\circ$）。斜邊上的高 ＝ 兩股乘積 ÷ 斜邊 $=\dfrac{{{ab}\times{bc}}}{{{ac}}}={ftex(h)}$。'),
        plane_fig([('A', *A, 'l'), ('B', *B, 'r'), ('C', *Cc, 'r')], segs=[('A', 'B'), ('B', 'C'), ('A', 'C')], right=('B', 'A', 'C'), extra=foot))


SLOTS = [
    slot(1, '水平線上兩點的距離', [horizontal(3, -5, 2), horizontal(-4, 2, -1, ('P', 'Q')), horizontal(-6, -1, 3, ('M', 'N'))]),
    slot(2, '鉛垂線上兩點的距離', [vertical(2, -3, 5), vertical(-3, -6, -1, ('E', 'F')), vertical(4, -2, 7, ('G', 'H'))]),
    slot(3, '坐標平面上的直角三角形求斜邊', [corner_tri((2, 1), (-4, 1), (2, 9)), corner_tri((-1, -2), (4, -2), (-1, 10)), corner_tri((1, 3), (-2, 3), (1, -3))]),
    slot(4, '兩點距離公式', [formula(1), formula(2), formula(3)]),
    slot(5, '用距離公式求兩點距離（整數）', [
        dist((1, 2), (4, 6), opts=[n(5), n(7), n(25), root(7)], hint='不是 $3+4=7$。'),
        dist((-3, 1), (3, -7), opts=[n(10), n(14), n(100), n(2)], hint='坐標的差是 $6$ 和 $-8$，平方後都是正的。'),
        dist((2, -5), (-3, 7), opts=[n(13), n(17), n(169), root(119)]),
    ]),
    slot(6, '用距離公式求兩點距離（最簡根式）', [
        dist((3, -2), (-3, 1), ('C', 'D'), [root(45), bad_root(45), n(9), root(27)], form),
        dist((0, -4), (-2, 2), ('E', 'F'), [root(40), bad_root(40), n(8), root(32)], form),
        dist((-1, 3), (3, -1), ('G', 'H'), [root(32), bad_root(32), n(8), raw('$0$', 0)], form),
    ]),
    slot(7, '坐標有負數：減去負數要變號', [
        dist((-1, 2), (3, -1), opts=[n(5), root(13), root(17), n(7)], hint='常見錯誤：把 $3-(-1)$ 算成 $3-1$。'),
        dist((-2, -3), (4, 5), ('P', 'Q'), [n(10), root(8), root(40), n(14)], hint='常見錯誤：把 $4-(-2)$ 算成 $2$。'),
        dist((-4, 1), (2, -7), ('M', 'N'), [n(10), root(68), root(72), n(14)], hint='常見錯誤：$2-(-4)$ 寫成 $2-4$。'),
    ]),
    slot(8, '一點到原點的距離', [
        to_origin(-6, 8, 'P', [n(10), n(2), n(14), n(100)]),
        to_origin(12, -5, 'Q', [n(13), n(7), n(17), n(169)]),
        to_origin(-3, -3, 'R', [root(18), bad_root(18), n(6), n(3)], form),
    ]),
    slot(9, '坐標平面上三角形的周長', [
        perimeter((-2, 1), (4, 1), (4, 9), 20),
        perimeter((-3, -2), (2, -2), (2, 10), 43),
        perimeter((-3, -1), (0, -1), (0, 3), 9),
    ]),
    slot(10, '坐標平面上的斜邊上的高', [
        plane_alt((-3, -2), (3, -2), (3, 6), R(5)),
        plane_alt((-2, -3), (3, -3), (3, 9), R(13, 2)),
        plane_alt((1, 1), (4, 1), (4, 5), R(5, 2)),
    ]),
]

export('g8-2-3c', '2-3 畢氏定理（3）課後檢核', '依課本 2-3 p.101–103（例 7、例 8、兩點距離公式）自編換數字題', SLOTS)
