r"""九上 2-1 點、直線與圓之間的位置關係：回家作業手寫題庫（g9-2-1a、g9-2-1b、g9-2-1c）。

用法：python -X utf8 scripts/homework-src/g9-2-1.py
輸出：content/homework/g9-2-1a.json、g9-2-1b.json、g9-2-1c.json

題型（slot）和課後檢核 content/quizzes/g9-2-1a..c.json 一一對應（同 id、同 topic）。
每個題型先把課後檢核的 3 題改寫成手寫題（拿掉選項、改成「求…」；「哪一個敘述正確」改成看圖寫名稱、寫出判斷），
再補新題，每個題型至少 5 題。範圍只到這一課為止（累積）：
- 2-1(1)：圓的名詞、弧長、扇形面積與周長、反求圓心角或半徑、弓形面積與周長。
- 2-1(2)：＋點與圓、直線與圓（d 和 r 比）、切線垂直過切點的半徑、切線段長。
- 2-1(3)：＋切線段性質（PA＝PB、PO 平分∠APB）、弦心距垂直平分弦、弦愈長弦心距愈小。
附圖重用 scripts/quiz-src 的 geom.py、circlefig.py 與各課的畫圖函式，用題目自己的數字畫。

核算：每一題的 answer 由同一組數字算出，再用另一種方法驗算（積分算弧長與扇形面積、
sympy.geometry 求交點個數與切點、解方程式、由坐標量角度），全部一致才輸出。
"""
import importlib.util
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
QS = HERE.parent / 'quiz-src'
sys.path.insert(0, str(QS))
from sympy import (Circle, oo, Interval, Line, Point, Rational, Symbol, Triangle, cos, integrate, maximum, pi,  # noqa: E402
                   reduce_inequalities, simplify, sin, solve, sqrt, symbols, sympify)

from circlefig import GREEN, ROSE, SKY, CFig, P, etex  # noqa: E402
from geom import num  # noqa: E402

R = Rational
ROOT = HERE.parents[1]
x, t, rho = symbols('x t rho')
rr = Symbol('r', positive=True)


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), QS / f'{name}.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


QA, QB, QC = load('g9-2-1a'), load('g9-2-1b'), load('g9-2-1c')


# ───────── 共用 ─────────
def T(v):
    """數值的 LaTeX（不含 $）：aπ＋b√m＋c。"""
    return etex(sympify(v))


def M(v, unit=''):
    return f'${T(v)}$' + (f' {unit}' if unit else '')


def D(v):
    return rf'${T(v)}^\circ$'


def dec(v):
    """應用題：有限小數寫成小數。"""
    v = sympify(v)
    if v.is_rational and v.q in (1, 2, 4, 5, 10, 20, 25):
        return num(float(v))
    return T(v)


def sq(n):
    return f'({n})^2' if n < 0 else f'{n}^2'


def H(stem, answer, solution, space, figure, checks):
    assert checks, stem
    return dict(stem=stem, figure=figure, answer=answer, solution=solution, space=space, checks=checks)


def same(a, b):
    if isinstance(a, str) or isinstance(b, str):
        return a == b
    if isinstance(a, bool) or isinstance(b, bool):
        return a == b
    if isinstance(a, float) or isinstance(b, float):
        return abs(float(a) - float(b)) < 1e-7
    return simplify(sympify(a) - sympify(b)) == 0


def arc_int(r, a):
    """弧長（積分）：∫ r dθ，θ 從 0 到 a°。"""
    return integrate(r, (t, 0, a * pi / 180))


def sector_int(r, a):
    """扇形面積（極坐標積分）：∫∫ ρ dρ dθ。"""
    return integrate(integrate(rho, (rho, 0, r)), (t, 0, a * pi / 180))


def tri_area(r, a):
    """圓心角 a°（90 或 60）的 △AOB 面積（坐標）。"""
    return abs(Triangle(Point(0, 0), *chord_pts(r, a)).area)


def chord_pts(r, a):
    th = a * pi / 180
    return Point(r, 0), Point(r * cos(th), r * sin(th))


def n_meet(r, d):
    """圓心 (0,0)、半徑 r 的圓和直線 x＝d 的交點個數（sympy.geometry）。"""
    return len(Circle(Point(0, 0), r).intersection(Line(Point(d, 0), Point(d, 1))))


def where_pt(px, py, r):
    c = Circle(Point(0, 0), r)
    p = Point(px, py)
    return '圓上' if c.contains(p) else '圓內' if c.encloses_point(p) else '圓外'


LINE_NAME = {0: '不相交', 1: '切線', 2: '割線'}


def tangent_pts(r, op):
    """圓 O(0,0) 半徑 r、圓外一點 P(op,0) 的兩個切點（sympy.geometry）。"""
    c = Circle(Point(0, 0), r)
    pts = []
    for ln in c.tangent_lines(Point(op, 0)):
        pts += c.intersection(ln)
    assert len(pts) == 2
    return pts


def ang(v, a, b):
    """v 點的角度（度，浮點）。"""
    t1 = math.atan2(a[1] - v[1], a[0] - v[0])
    t2 = math.atan2(b[1] - v[1], b[0] - v[0])
    d = abs(t1 - t2) % (2 * math.pi)
    return math.degrees(min(d, 2 * math.pi - d))


def tan_float(r, op):
    """圓外一點 P(op,0) 的切點（浮點）：A 在上、B 在下。"""
    foot, h = r * r / op, r * math.sqrt(op * op - r * r) / op
    return (0, 0), (foot, h), (foot, -h), (op, 0)


def chord_len_geo(r, d):
    """半徑 r 的圓、弦心距 d 的弦長（sympy 求交點）。"""
    pts = Circle(Point(0, 0), r).intersection(Line(Point(0, -d), Point(1, -d)))
    return pts[0].distance(pts[1])


# ───────── 自訂附圖 ─────────
def major_arc_fig(r, a):
    """圓心角 a 的劣弧在下方，C 在優弧上，描紅優弧。"""
    f = CFig(440, 250)
    O = f.pt('O', 0, 0, at=(0, 1))
    a0, a1 = 270 - a / 2, 270 + a / 2
    f.circle(O, r)
    A = f.on(O, r, a0, 'A')
    B = f.on(O, r, a1, 'B')
    C = f.on(O, r, 90, 'C')
    f.seg(O, A)
    f.seg(O, B)
    f.dot(O, r * 0.03)
    f.dot(C, r * 0.03)
    f.arc_line(O, r, a1, a0 + 360, n=48)
    f.arc(O, A, B, None, r=14)
    m = f.at(O, r * 0.5, 270)
    f.text(m.x, m.y, f'{a}°', 13)
    f.side(O, A, str(r), away=B)
    m = f.at(O, r * 1.2, 135)
    f.text(m.x, m.y, '?', 15, color='#d2541b')
    return f.svg()


def big_bow_fig(r):
    """∠AOB＝90°，塗優弧與弦圍成的大弓形。"""
    f = CFig(440, 250)
    O = f.pt('O', 0, 0, at=(-1, 0.4))
    f.bow(O, r, 0, 270, fill=SKY)
    f.circle(O, r)
    A = f.on(O, r, 270, 'A', at=(0, -1))
    B = f.on(O, r, 360, 'B', at=(1, 0.2))
    C = f.on(O, r, 135, 'C')
    f.poly([O, A, B], fill=None)
    f.right(O, A, B)
    f.dot(O, r * 0.03)
    f.dot(C, r * 0.03)
    f.side(O, B, str(r), away=A)
    return f.svg()


def plain_circle_fig(r, kind):
    """kind='chord'：半徑 OA 標 r，另一條弦 PQ；kind='diam'：直徑 AB，描紅上半圓。"""
    f = CFig(440, 250)
    O = f.pt('O', 0, 0, at=(0.3, -1))
    f.circle(O, r)
    if kind == 'chord':
        A = f.on(O, r, 330, 'A')
        f.seg(O, A)
        f.side(O, A, str(r), away=P('', 0, r))
        Pp, Q = f.on(O, r, 110, 'P'), f.on(O, r, 200, 'Q')
        f.seg(Pp, Q)
    else:
        A, B = f.on(O, r, 180, 'A'), f.on(O, r, 0, 'B')
        f.seg(A, B)
        f.arc_line(O, r, 0, 180, n=36)
    f.dot(O, r * 0.03)
    return f.svg()


def coord_fig(r, px, py, r_text):
    """坐標平面：圓心原點、半徑 r，點 P(px, py)；r_text 是半徑標籤。"""
    f = CFig(440, 260)
    O = f.pt('O', 0, 0, at=(-1, -1))
    m = max(r, abs(px), abs(py)) + 1.2
    f.seg(P('', -m, 0), P('', m, 0), width=1, color='#9aa0b4')
    f.seg(P('', 0, -m), P('', 0, m), width=1, color='#9aa0b4')
    f.pt('', -m, 0, False)
    f.pt('', m, 0, False)
    f.text(m - 0.2, -0.7 * m / 6, 'x', 13, color='#6b7394')
    f.text(0.5 * m / 6, m - 0.3, 'y', 13, color='#6b7394')
    f.circle(O, r, fill='#fbf3c4')
    Pp = f.pt('', px, py, False)
    # 點的標籤放在 P 的外側（遠離原點），左半邊靠右對齊
    th = math.atan2(py, px)
    lx, ly = px + 0.14 * m * math.cos(th), py + 0.14 * m * math.sin(th) - 0.04 * m
    f.pt('', lx + (0.5 * m if px >= 0 else -0.5 * m), ly, False)
    f.text(lx, ly, f'P({px}, {py})'.replace('-', '−'), 15, anchor='start' if px >= 0 else 'end')
    f.seg(O, Pp, dash=True, color='#2f6f9f')
    f.dot(O, r * 0.035)
    f.dot(Pp, r * 0.05)
    q = f.at(O, r, math.degrees(th) + 140)
    f.seg(O, q, color='#6b7394')
    f.side(O, q, r_text, away=Pp)
    return f.svg()


def range_fig(oa, ob, r_draw):
    """圓 O、圓外一點 A（OA＝oa）、圓內一點 B（OB＝ob），半徑未知。"""
    f = CFig(440, 250)
    O = f.pt('O', 0, 0, at=(-0.6, 1))
    f.circle(O, r_draw, fill='#fbf3c4')
    A = f.on(O, oa, 25, 'A', at=(1, 0.4))
    B = f.on(O, ob, 205, 'B', at=(-0.4, -1))
    f.seg(O, A, color='#2f6f9f', width=2)
    f.seg(O, B, color='#2f6f9f', width=2)
    f.side(O, A, str(oa), away=B)
    f.side(O, B, str(ob), away=A)
    q = f.at(O, r_draw, 300)
    f.seg(O, q, dash=True, color='#6b7394')
    f.side(O, q, 'r', away=A)
    f.dot(O, r_draw * 0.035)
    f.dot(A, r_draw * 0.035)
    f.dot(B, r_draw * 0.035)
    return f.svg()


def tan_out_fig(r, op, names, labels):
    """直線切圓 O 於切點（正下方），圓外點在切線上，OP 交圓於第三點。names＝(O, 切點, 圓外點, 交點)；labels：r、out（交點到圓外點）、tan（切線段）。"""
    tl = math.sqrt(op * op - r * r)
    f = CFig(440, 250)
    O = f.pt(names[0], 0, 0, at=(-1, 0.4))
    f.circle(O, r, fill='#ece3f5')
    A = f.pt(names[1], 0, -r, at=(0, -1))
    B = f.pt(names[2], tl, -r, at=(0.4, -1))
    C = f.pt(names[3], tl * r / op, -r * r / op, at=(0.5, 1))
    f.seg(P('', -0.4 * r, -r), P('', tl + 0.4 * r, -r), width=1.8)
    f.pt('', -0.4 * r, -r, False)
    f.pt('', tl + 0.4 * r, -r, False)
    f.seg(O, A, dash=True, color='#2f6f9f')
    f.seg(O, B)
    f.right(A, O, B)
    f.dot(O, r * 0.035)
    f.dot(C, r * 0.035)
    if labels.get('r'):
        f.side(O, A, labels['r'], away=B, color='#2f6f9f')
    if labels.get('tan'):
        f.side(A, B, labels['tan'], away=O)
    if labels.get('out'):
        f.side(C, B, labels['out'], away=A, color='#d2541b')
    return f.svg()


def tfig(r, op, labels=None, arcs=(), chord=False):
    """圓外一點 P 的兩條切線 PA（上）、PB（下）。arcs：[(頂點, 邊1, 邊2, 文字, 半徑)]，用 'O'、'A'、'B'、'P' 指點。"""
    labels = labels or {}
    f = CFig(440, 250)
    O = f.pt('O', 0, 0, at=(-1, 0))
    f.circle(O, r, fill='#ece3f5')
    foot, h = r * r / op, r * (op * op - r * r) ** 0.5 / op
    A = f.pt('A', foot, h, at=(0, 1))
    B = f.pt('B', foot, -h, at=(0, -1))
    Pp = f.pt('P', op, 0, at=(1, 0))
    f.seg(O, A, color='#2f6f9f')
    f.seg(O, B, color='#2f6f9f')
    f.seg(Pp, A, color='#d2541b', width=2)
    f.seg(Pp, B, color='#d2541b', width=2)
    f.seg(O, Pp, dash=True, color='#6b7394')
    f.right(A, O, Pp)
    f.right(B, O, Pp)
    f.dot(O, r * 0.035)
    pts = dict(O=O, A=A, B=B, P=Pp)
    if chord:
        f.seg(A, B, color='#5a3fd6', width=2)
    if labels.get('r'):
        f.side(O, A, labels['r'], away=Pp)
    if labels.get('op'):
        f.side(O, Pp, labels['op'], away=A, t=0.8)
    for v, a, b, text, rad in arcs:
        f.arc(pts[v], pts[a], pts[b], text, r=rad)
    return f.svg()


def concentric_fig(big, small):
    """同心圓：大圓的弦 AB 切小圓於 C。"""
    f = CFig(440, 250)
    O = f.pt('O', 0, 0, at=(0.6, 0.8))
    f.circle(O, big, fill=SKY)
    f.circle(O, small, fill='#ffffff')
    half = math.sqrt(big * big - small * small)
    A = f.pt('A', -half, -small, at=(-1, -0.3))
    B = f.pt('B', half, -small, at=(1, -0.3))
    C = f.pt('C', 0, -small, at=(0.5, -1))
    f.seg(A, B, width=2)
    f.seg(O, C, color='#d2541b', width=2)
    f.seg(O, A, dash=True, color='#2f6f9f')
    f.right(C, O, B, 7)
    f.dot(O, big * 0.025)
    f.side(O, C, str(small), away=A, color='#d2541b')
    f.side(O, A, str(big), away=B)
    f.side(A, B, '?', away=O, t=0.75)
    return f.svg()


def opp_fig(om, ab, cd):
    """兩條平行弦在圓心兩側：AB（上，弦心距 OM）、CD（下，弦心距 ON），O、M、N 共線。"""
    r = math.sqrt(om * om + (ab / 2) ** 2)
    on = math.sqrt(r * r - (cd / 2) ** 2)
    f = CFig(440, 260)
    O = f.pt('O', 0, 0, at=(-1, 0))
    f.circle(O, r, fill='#eef6dd')
    M = f.pt('M', 0, om, at=(-0.6, -0.8))
    N = f.pt('N', 0, -on, at=(-0.6, 0.8))
    A = f.pt('A', -ab / 2, om, at=(-1, 0.3))
    B = f.pt('B', ab / 2, om, at=(1, 0.3))
    Cc = f.pt('C', -cd / 2, -on, at=(-1, -0.3))
    Dd = f.pt('D', cd / 2, -on, at=(1, -0.3))
    f.seg(A, B, width=2)
    f.seg(Cc, Dd, width=2)
    f.seg(M, N, color='#d2541b', width=2)
    f.right(M, O, B, 7)
    f.right(N, O, Dd, 7)
    f.dot(O, r * 0.03)
    f.side(A, B, str(ab), away=O, t=0.25)
    f.side(Cc, Dd, str(cd), away=O, t=0.25)
    f.side(O, M, str(om), away=B, color='#d2541b')
    f.dim(M, N, '?', away=P('', -r, 0), off=16, clear=r)
    return f.svg()


def app_fig(ab, cd, up):
    """弦心距應用：up＝True 時 C 在上方（隧道、拱橋），否則 C 在下方（水管屋、水管）。半徑標「?」。"""
    r = float((cd * cd + R(ab, 2) ** 2) / (2 * cd))
    s = 1 if up else -1
    f = CFig(440, 250)
    O = f.pt('O', 0, 0, at=((-0.8, 0.6) if cd > r else (-0.8, -0.6)) if up else (0.8, 0.6))
    f.circle(O, r, fill=SKY if up else '#f3ecd9')
    yD = s * (r - cd)
    yC = s * r
    D = f.pt('D', 0, yD, at=(-0.7, -0.7) if up else (0.7, 0.7))
    A = f.pt('A', -ab / 2, yD, at=(-1, 0))
    B = f.pt('B', ab / 2, yD, at=(1, 0))
    Cc = f.pt('C', 0, yC, at=(0, s))
    f.seg(A, B, width=2.4, color='#1b1b1b' if up else '#8a5a33')
    f.seg(Cc, D, width=1.6)
    # 隧道、拱橋：半徑畫到 A、尺寸線在右；水管屋、水管：半徑畫到 B、尺寸線在左
    near, far = (A, B) if up else (B, A)
    f.seg(O, near, dash=True, color='#2f6f9f')
    f.right(D, Cc, B, 7)
    f.dot(O, r * 0.035)
    f.side(O, near, '?', away=far, color='#2f6f9f', t=0.6)
    f.side(A, B, f'{ab}', away=Cc, t=0.2)
    f.dim(Cc, D, f'{cd}', away=near, off=14)
    return f.svg()


# ═══════════════ 2-1(1) 圓、弧長與扇形面積 ═══════════════
def a_arc(r, a):
    L = 2 * pi * r * R(a, 360)
    return H(rf'如圖，圓 $O$ 的半徑為 ${r}$，圓心角 $\angle AOB={a}^\circ$，求 $\overset{{\frown}}{{AB}}$ 的長度。',
             M(L), rf'弧長＝圓周長×$\dfrac{{{a}}}{{360}}$＝$2\pi\times{r}\times\dfrac{{{a}}}{{360}}={T(L)}$。', 1,
             QA.sector_fig(r, a, r_lab=str(r), ang_lab=f'{a}°', arc_lab='?'), [(L, arc_int(r, a))])


def a_major(r, a):
    L = 2 * pi * r * R(360 - a, 360)
    minor = 2 * pi * r * R(a, 360)
    return H(rf'如圖，圓 $O$ 的半徑為 ${r}$，$\angle AOB={a}^\circ$，$C$ 點在優弧上。求優弧 $\overset{{\frown}}{{ACB}}$ 的長度。',
             M(L), rf'劣弧 $\overset{{\frown}}{{AB}}=2\pi\times{r}\times\dfrac{{{a}}}{{360}}={T(minor)}$，優弧＝圓周長－劣弧＝${T(2 * pi * r)}-{T(minor)}={T(L)}$。', 2,
             major_arc_fig(r, a), [(L, arc_int(r, 360) - arc_int(r, a))])


def a_clock(r, mins):
    a = 360 * R(mins, 60)
    L = 2 * pi * r * a / 360
    return H(rf'如圖，時鐘的分針長 ${r}$ 公分，經過 ${mins}$ 分鐘，分針的針尖走過的弧長是多少公分？',
             M(L, '公分'), rf'分針 $60$ 分鐘轉一圈 $360^\circ$，${mins}$ 分鐘轉 $360^\circ\times\dfrac{{{mins}}}{{60}}={T(a)}^\circ$；弧長＝$2\pi\times{r}\times\dfrac{{{T(a)}}}{{360}}={T(L)}$（公分）。', 2,
             QA.sector_fig(r, float(a), r_lab=str(r), arc_lab='?'), [(L, arc_int(r, a))])


def a_area(r, a):
    S = pi * r * r * R(a, 360)
    return H(rf'如圖，圓 $O$ 的半徑為 ${r}$，圓心角 $\angle AOB={a}^\circ$，求扇形 $AOB$ 的面積。',
             M(S), rf'扇形面積＝圓面積×$\dfrac{{{a}}}{{360}}$＝$\pi\times{r}^2\times\dfrac{{{a}}}{{360}}={T(S)}$。', 1,
             QA.sector_fig(r, a, r_lab=str(r), ang_lab=f'{a}°', show='sector'), [(S, sector_int(r, a))])


def a_perim(r, a):
    L = 2 * pi * r * R(a, 360)
    return H(rf'如圖，圓 $O$ 的半徑為 ${r}$，圓心角 $\angle AOB={a}^\circ$，求扇形 $AOB$ 的周長。',
             M(L + 2 * r), rf'弧長＝$2\pi\times{r}\times\dfrac{{{a}}}{{360}}={T(L)}$，扇形周長＝弧長＋兩條半徑＝${T(L)}+{r}+{r}={T(L + 2 * r)}$。', 2,
             QA.sector_fig(r, a, r_lab=str(r), ang_lab=f'{a}°', show='both'), [(L + 2 * r, arc_int(r, a) + 2 * r)])


def a_ang_area(S, r):
    xs = solve(pi * r * r * x / 360 - S, x)
    a = xs[0]
    return H(rf'如圖，扇形 $AOB$ 的面積為 ${T(S)}$，半徑為 ${r}$，求圓心角 $\angle AOB$ 的度數。',
             D(a), rf'設圓心角為 $x^\circ$：$\pi\times{r}^2\times\dfrac{{x}}{{360}}={T(S)}$，$x={T(a)}$，圓心角為 ${T(a)}^\circ$。', 2,
             QA.sector_fig(r, float(a), r_lab=str(r), ang_lab='?', show='sector'), [(sector_int(r, a), S), (len(xs), 1)])


def a_ang_arc(L, r):
    xs = solve(2 * pi * r * x / 360 - L, x)
    a = xs[0]
    return H(rf'如圖，圓 $O$ 的半徑為 ${r}$，$\overset{{\frown}}{{AB}}$ 的長為 ${T(L)}$，求圓心角 $\angle AOB$ 的度數。',
             D(a), rf'設圓心角為 $x^\circ$：$2\pi\times{r}\times\dfrac{{x}}{{360}}={T(L)}$，$x={T(a)}$，圓心角為 ${T(a)}^\circ$。', 2,
             QA.sector_fig(r, float(a), r_lab=str(r), ang_lab='?', arc_lab=T(L).replace('\\pi', 'π')), [(arc_int(r, a), L), (len(xs), 1)])


def a_rad_arc(L, a):
    xs = solve(2 * pi * rr * R(a, 360) - L, rr)
    r = xs[0]
    return H(rf'如圖，扇形 $AOB$ 的圓心角為 ${a}^\circ$，$\overset{{\frown}}{{AB}}$ 的長為 ${T(L)}$，求半徑。',
             M(r), rf'設半徑為 $r$：$2\pi r\times\dfrac{{{a}}}{{360}}={T(L)}$，$r={T(r)}$。', 2,
             QA.sector_fig(float(r), a, r_lab='?', ang_lab=f'{a}°', arc_lab=T(L).replace('\\pi', 'π')), [(arc_int(r, a), L), (len(xs), 1)])


def a_bow90(r):
    S, Tr = pi * r * r / 4, R(r * r, 2)
    return H(rf'如圖，圓 $O$ 的半徑為 ${r}$，$\angle AOB=90^\circ$，求藍色弓形的面積。',
             M(S - Tr), rf'弓形＝扇形 $AOB$－$\triangle AOB$＝$\pi\times{r}^2\times\dfrac{{90}}{{360}}-\dfrac12\times{r}\times{r}={T(S - Tr)}$。', 2,
             QA.bow_fig(r, 90, r_lab=str(r)), [(S - Tr, sector_int(r, 90) - tri_area(r, 90))])


def a_bigbow(r):
    small = pi * r * r / 4 - R(r * r, 2)
    big = pi * r * r - small
    return H(rf'如圖，圓 $O$ 的半徑為 ${r}$，$\angle AOB=90^\circ$，$C$ 在優弧上。求藍色部分（優弧 $\overset{{\frown}}{{ACB}}$ 和弦 $\overline{{AB}}$ 圍成的弓形）的面積。',
             M(big), rf'小弓形＝扇形－$\triangle AOB$＝$\pi\times{r}^2\times\dfrac{{90}}{{360}}-\dfrac12\times{r}\times{r}={T(small)}$；藍色部分＝圓面積－小弓形＝${T(pi * r * r)}-({T(small)})={T(big)}$。'
             rf'（也可以算：扇形 $\dfrac{{270}}{{360}}$＋$\triangle AOB$）', 3,
             big_bow_fig(r), [(big, sector_int(r, 270) + tri_area(r, 90))])


def a_bow60(r):
    S, Tr = pi * r * r / 6, sqrt(3) / 4 * r * r
    return H(rf'如圖，圓 $O$ 的半徑為 ${r}$，$\triangle AOB$ 是正三角形，求藍色弓形的面積。',
             M(S - Tr), rf'正三角形的每個角都是 $60^\circ$，弓形＝扇形－正三角形＝$\pi\times{r}^2\times\dfrac{{60}}{{360}}-\dfrac{{\sqrt3}}{{4}}\times{r}^2={T(S - Tr)}$。', 2,
             QA.bow_fig(r, 60, r_lab=str(r), equi=True), [(S - Tr, sector_int(r, 60) - tri_area(r, 60))])


def a_bow60_chord(c):
    r = c
    S, Tr = pi * r * r / 6, sqrt(3) / 4 * r * r
    return H(rf'如圖，圓 $O$ 中，$\angle AOB=60^\circ$，弦 $\overline{{AB}}={c}$，求藍色弓形的面積。',
             M(S - Tr), rf'$\overline{{OA}}=\overline{{OB}}$ 而且 $\angle AOB=60^\circ$，所以 $\triangle AOB$ 是正三角形，半徑＝$\overline{{AB}}={c}$。'
             rf'弓形＝$\pi\times{c}^2\times\dfrac{{60}}{{360}}-\dfrac{{\sqrt3}}{{4}}\times{c}^2={T(S - Tr)}$。', 3,
             QA.bow_fig(c, 60, chord_lab=str(c), ang_lab='60°'),
             [(S - Tr, sector_int(r, 60) - tri_area(r, 60)), (chord_pts(r, 60)[0].distance(chord_pts(r, 60)[1]), c)])


def a_bow_perim(r, a):
    L = 2 * pi * r * R(a, 360)
    chord = sqrt(2) * r if a == 90 else r
    how = (rf'弦 $\overline{{AB}}=\sqrt{{{r}^2+{r}^2}}={T(chord)}$' if a == 90 else rf'正三角形三邊相等，弦 $\overline{{AB}}={r}$')
    cond = r'$\angle AOB=90^\circ$' if a == 90 else r'$\triangle AOB$ 是正三角形'
    A_, B_ = chord_pts(r, a)
    return H(rf'如圖，圓 $O$ 的半徑為 ${r}$，{cond}，求藍色弓形的周長。',
             M(L + chord), rf'弓形周長＝弧長＋弦長。弧長＝$2\pi\times{r}\times\dfrac{{{a}}}{{360}}={T(L)}$，{how}，周長＝${T(L + chord)}$。', 2,
             QA.bow_fig(r, a, r_lab=str(r), equi=(a == 60)), [(L + chord, arc_int(r, a) + A_.distance(B_))])


def a_terms(kind):
    def on_circle(deg_list, r=5):
        return all(abs(math.hypot(r * math.cos(math.radians(d)), r * math.sin(math.radians(d))) - r) < 1e-9 for d in deg_list)

    def dist_O_line(d1, d2, r=5):
        p1 = (r * math.cos(math.radians(d1)), r * math.sin(math.radians(d1)))
        p2 = (r * math.cos(math.radians(d2)), r * math.sin(math.radians(d2)))
        return abs(p1[0] * p2[1] - p1[1] * p2[0]) / math.dist(p1, p2)

    if kind == 1:
        # 圖：C(180°)、D(0°)、A(115°)、B(215°)、E(300°)
        return H(r'如圖，$A$、$B$、$C$、$D$、$E$ 都在圓 $O$ 上，$\overline{CD}$ 通過圓心 $O$。寫出：(1) 圖中的直徑；(2) 圖中不是直徑的弦；(3) $\overline{OE}$ 叫做什麼？',
                 r'(1) $\overline{CD}$　(2) $\overline{AB}$　(3) 半徑',
                 r'連接圓上兩點的線段是弦，通過圓心的弦是直徑：$\overline{CD}$ 通過 $O$，是直徑；$\overline{AB}$ 沒有通過 $O$，是弦但不是直徑。$\overline{OE}$ 一端是圓心、一端在圓上，是半徑，不是弦。', 1,
                 QA.terms_fig(1), [(dist_O_line(180, 0) < 1e-9, True), (dist_O_line(115, 215) > 0.5, True), (on_circle([180, 0, 115, 215, 300]), True)])
    if kind == 2:
        return H(r'如圖，甲由弦 $\overline{AB}$ 和一段弧圍成，乙由半徑 $\overline{OC}$、$\overline{OD}$ 和一段弧圍成。寫出甲、乙這兩種圖形的名稱。',
                 '甲：弓形；乙：扇形',
                 '圓的一弦和一弧圍成的圖形是弓形；兩半徑和一弧圍成的圖形是扇形。', 1,
                 QA.terms_fig(2), [(dist_O_line(100, 190) > 0.5, True), (on_circle([100, 190, 250, 330]), True)])
    if kind == 3:
        # 圖：A(200°)、B(330°)、C(90°)，劣弧 AB 是 200°→330°，C 不在上面
        return H(r'如圖，$O$ 是圓心，$A$、$B$、$C$ 在圓上。(1) 寫出圖中的圓心角；(2) 用符號寫出劣弧 $AB$ 和經過 $C$ 的優弧；(3) $\angle ACB$ 是不是圓心角？說明理由。',
                 r'(1) $\angle AOB$　(2) 劣弧 $\overset{\frown}{AB}$、優弧 $\overset{\frown}{ACB}$　(3) 不是，$\angle ACB$ 的頂點 $C$ 在圓上，不在圓心',
                 r'頂點在圓心、兩邊是半徑的角是圓心角，所以 $\angle AOB$ 是。優弧要在弧上多取一點來表示，記作 $\overset{\frown}{ACB}$。$\angle ACB$ 的頂點在圓上，不是圓心角。', 2,
                 QA.terms_fig(3), [(not (200 < 90 < 330), True), (330 - 200 < 180, True)])
    if kind == 4:
        return H(r'如圖，圓 $O$ 的半徑為 $5$。這個圓最長的弦叫做什麼？它的長度是多少？',
                 r'直徑，長度為 $10$',
                 r'直徑是圓中最長的弦，直徑＝半徑×2＝$5\times2=10$。', 1,
                 plain_circle_fig(5, 'chord'), [(maximum(2 * sqrt(25 - x ** 2), x, Interval(0, 5)), 10)])
    return H(r'如圖，$\overline{AB}$ 是圓 $O$ 的直徑，圓 $O$ 的周長為 $12\pi$。(1) 直徑把圓分成的兩段弧，每一段叫做什麼？(2) 每一段弧的長度是多少？',
             r'(1) 半圓　(2) $6\pi$',
             r'弦是直徑時，分成的兩段弧一樣大，叫做半圓；每一段是周長的一半：$12\pi\div2=6\pi$。', 1,
             plain_circle_fig(6, 'diam'), [(arc_int(6, 180), 6 * pi), (2 * pi * 6, 12 * pi)])


SLOTS_A = [
    ('q1', 1, [a_arc(10, 60), a_arc(6, 120), a_arc(9, 40), a_arc(12, 150), a_arc(8, 45), a_major(6, 100), a_clock(12, 20)]),
    ('q2', 1, [a_area(12, 30), a_area(6, 80), a_area(4, 135), a_area(10, 72), a_area(9, 100), a_area(6, 150)]),
    ('q3', 1, [a_perim(8, 135), a_perim(12, 60), a_perim(5, 72), a_perim(6, 90), a_perim(9, 80), a_perim(10, 108)]),
    ('q4', 1, [a_ang_area(48 * pi, 12), a_ang_area(2 * pi, 4), a_ang_area(15 * pi, 6), a_ang_area(6 * pi, 6), a_ang_area(5 * pi, 5), a_ang_area(10 * pi, 6)]),
    ('q5', 1, [a_ang_arc(5 * pi, 15), a_ang_arc(2 * pi, 9), a_ang_arc(3 * pi, 4), a_ang_arc(4 * pi, 8), a_ang_arc(pi, 6), a_ang_arc(10 * pi, 12)]),
    ('q6', 1, [a_rad_arc(4 * pi, 120), a_rad_arc(6 * pi, 90), a_rad_arc(2 * pi, 40), a_rad_arc(pi, 45), a_rad_arc(5 * pi, 150), a_rad_arc(8 * pi, 144)]),
    ('q7', 2, [a_bow90(4), a_bow90(6), a_bow90(10), a_bow90(8), a_bow90(2), a_bigbow(4)]),
    ('q8', 2, [a_bow60(6), a_bow60(4), a_bow60(12), a_bow60(8), a_bow60(10), a_bow60_chord(9)]),
    ('q9', 2, [a_bow_perim(4, 90), a_bow_perim(6, 90), a_bow_perim(6, 60), a_bow_perim(10, 90), a_bow_perim(12, 60), a_bow_perim(3, 90)]),
    ('q10', 0, [a_terms(1), a_terms(2), a_terms(3), a_terms(4), a_terms(5)]),
]


# ═══════════════ 2-1(2) 點、直線與圓、切線 ═══════════════
def frac(v):
    v = R(v)
    return str(v) if v.q == 1 else num(float(v))


def b_coord(px, py, r):
    op2 = px * px + py * py
    op = sqrt(op2)
    k = '圓內' if op2 < r * r else '圓上' if op2 == r * r else '圓外'
    rel = '<' if op2 < r * r else '=' if op2 == r * r else '>'
    cmp = rf'${T(op)}{rel}{r}$' if op.is_rational else rf'$\sqrt{{{op2}}}{rel}\sqrt{{{r * r}}}={r}$'
    return H(rf'坐標平面上，圓 $O$ 的圓心是原點、半徑為 ${r}$。求 $\overline{{OP}}$ 的長，並判斷點 $P({px},{py})$ 在圓內、圓上還是圓外。',
             rf'$\overline{{OP}}={T(op)}$，$P$ 在{k}',
             rf'$\overline{{OP}}=\sqrt{{{sq(px)}+{sq(py)}}}=\sqrt{{{op2}}}' + (rf'={T(op)}' if T(op) != rf'\sqrt{{{op2}}}' else '') +
             rf'$，和半徑比較：{cmp}，所以 $P$ 在{k}。', 2,
             coord_fig(r, px, py, f'r＝{r}'), [(k, where_pt(px, py, r))])


def b_coord_r(px, py):
    r = sqrt(px * px + py * py)
    return H(rf'坐標平面上，圓 $O$ 的圓心是原點，點 $P({px},{py})$ 在圓 $O$ 上，求圓 $O$ 的半徑。',
             M(r), rf'$P$ 在圓上，所以半徑＝$\overline{{OP}}=\sqrt{{{sq(px)}+{sq(py)}}}=\sqrt{{{px * px + py * py}}}={T(r)}$。', 1,
             coord_fig(float(r), px, py, 'r＝?'), [(where_pt(px, py, r), '圓上')])


def b_dist(diam, op):
    r = R(diam, 2)
    op = R(op)
    k = '圓內' if op < r else '圓上' if op == r else '圓外'
    rel = '<' if op < r else '=' if op == r else '>'
    return H(rf'如圖，圓 $O$ 的直徑為 ${diam}$，$\overline{{OP}}={frac(op)}$，判斷點 $P$ 在圓內、圓上還是圓外，並說明理由。',
             f'$P$ 在{k}',
             rf'半徑 $r={frac(r)}$（直徑的一半），$\overline{{OP}}={frac(op)}{rel}{frac(r)}$，所以 $P$ 在{k}。要和半徑比，不是和直徑比。', 1,
             QB.dist_fig(float(r), float(op), f'r＝{frac(r)}', frac(op)), [(k, where_pt(op, 0, r))])


def b_dist_diam(op):
    return H(rf'如圖，點 $P$ 在圓 $O$ 上，$\overline{{OP}}={op}$，求圓 $O$ 的直徑。',
             M(2 * op), rf'$P$ 在圓上，$\overline{{OP}}$ 就是半徑：$r={op}$，直徑＝$2r={2 * op}$。', 1,
             QB.dist_fig(op, op, 'r', str(op)), [(where_pt(op, 0, op), '圓上'), (2 * op, 2 * op)])


def b_range(oa, ob):
    sol = reduce_inequalities([rr < oa, rr > ob], rr)
    return H(rf'如圖，點 $A$ 在圓 $O$ 外，$\overline{{OA}}={oa}$；點 $B$ 在圓 $O$ 內，$\overline{{OB}}={ob}$。若圓 $O$ 的半徑為 $r$，求 $r$ 的範圍。',
             rf'${ob}<r<{oa}$', rf'$A$ 在圓外：$\overline{{OA}}>r$，$r<{oa}$；$B$ 在圓內：$\overline{{OB}}<r$，$r>{ob}$。所以 ${ob}<r<{oa}$。', 2,
             range_fig(oa, ob, (oa + ob) / 2), [(sol.as_set().intersect(Interval.open(0, oo)) == Interval.open(ob, oa), True)])


def b_line(diam, d):
    r = R(diam, 2)
    d = R(d)
    k = 2 if d < r else 1 if d == r else 0
    rel = ['>', '=', '<'][k]
    why = ['沒有交點，$L$ 和圓 $O$ 不相交', '只有 1 個交點，$L$ 是圓 $O$ 的切線', '有 2 個交點，$L$ 是圓 $O$ 的割線'][k]
    return H(rf'如圖，圓 $O$ 的直徑為 ${diam}$，圓心 $O$ 到直線 $L$ 的距離為 ${frac(d)}$。判斷 $L$ 是圓 $O$ 的割線、切線，還是和圓 $O$ 不相交，寫出理由和交點個數。',
             f'{LINE_NAME[k]}，交點 {k} 個',
             rf'半徑 $r={frac(r)}$，距離 $d={frac(d)}{rel}r$，所以{why}。', 1,
             QB.line_fig(float(r), float(d), frac(d), diam_text=str(diam)), [(k, n_meet(r, d))])


def b_line_range(d):
    sol = reduce_inequalities([rr < d], rr)
    return H(rf'如圖，圓心 $O$ 到直線 $L$ 的距離為 ${d}$，而且 $L$ 和圓 $O$ 不相交。若圓 $O$ 的半徑為 $r$，求 $r$ 的範圍。',
             rf'$0<r<{d}$', rf'直線和圓不相交時，圓心到直線的距離大於半徑：${d}>r$，又半徑大於 $0$，所以 $0<r<{d}$。', 1,
             QB.line_fig(d * 0.65, d, str(d), r_text='r'), [(sol.as_set().intersect(Interval.open(0, oo)) == Interval.open(0, d), True), (n_meet(R(d) * R(2, 3), d), 0)])


def b_tan_diam(d):
    d = R(d)
    return H(rf'如圖，直線 $L$ 是圓 $O$ 的切線，圓心 $O$ 到 $L$ 的距離為 ${frac(d)}$，求圓 $O$ 的直徑。',
             f'${frac(2 * d)}$',
             rf'切線到圓心的距離等於半徑：$r={frac(d)}$，直徑＝$2r={frac(2 * d)}$。', 1,
             QB.line_fig(float(d), float(d), frac(d), diam_text='?'), [(n_meet(d, d), 1)])


def b_tan_dist(diam):
    r = R(diam, 2)
    return H(rf'如圖，圓 $O$ 的直徑為 ${diam}$，直線 $L$ 和圓 $O$ 相切，求圓心 $O$ 到 $L$ 的距離。',
             f'${frac(r)}$', rf'切線到圓心的距離等於半徑：$d=r={diam}\div2={frac(r)}$。', 1,
             QB.line_fig(float(r), float(r), '?', diam_text=str(diam)), [(n_meet(r, r), 1)])


def b_tan_area(d):
    return H(rf'如圖，直線 $L$ 和圓 $O$ 相切，圓心 $O$ 到 $L$ 的距離為 ${d}$，求圓 $O$ 的面積。',
             M(pi * d * d), rf'切線到圓心的距離等於半徑，$r={d}$，圓面積＝$\pi\times{d}^2={T(pi * d * d)}$。', 1,
             QB.line_fig(d, d, str(d)), [(n_meet(d, d), 1), (sector_int(d, 360), pi * d * d)])


def b_tan_circ(d):
    return H(rf'如圖，直線 $L$ 和圓 $O$ 相切，圓心 $O$ 到 $L$ 的距離為 ${d}$，求圓 $O$ 的周長。',
             M(2 * pi * d), rf'切線到圓心的距離等於半徑，$r={d}$，圓周長＝$2\pi\times{d}={T(2 * pi * d)}$。', 1,
             QB.line_fig(d, d, str(d)), [(n_meet(d, d), 1), (arc_int(d, 360), 2 * pi * d)])


def b_tan_fig_angles(aob):
    r = 4
    tl = r * math.tan(math.radians(aob))
    O, A, B = (0, 0), (0, -r), (tl, -r)
    return ang(A, O, B), ang(B, O, A), ang(O, A, B)


def b_angle(a):
    b = 90 - a
    oab, abo, _ = b_tan_fig_angles(a)
    return H(rf'如圖，直線 $AB$ 切圓 $O$ 於 $A$ 點，$\angle AOB={a}^\circ$，求 $\angle ABO$ 的度數。',
             D(b), rf'切線垂直過切點的半徑：$\angle OAB=90^\circ$，$\angle ABO=180^\circ-90^\circ-{a}^\circ={b}^\circ$。', 1,
             QB.tangent_fig(4, 4 * math.tan(math.radians(a)), {}, angle={'O': f'{a}°', 'B': '?'}), [(float(b), abo), (oab, 90.0)])


def b_angle_rev(b):
    a = 90 - b
    oab, abo, _ = b_tan_fig_angles(a)
    return H(rf'如圖，直線 $AB$ 切圓 $O$ 於 $A$ 點，$\angle ABO={b}^\circ$，求 $\angle AOB$ 的度數。',
             D(a), rf'$\overline{{OA}}\perp\overline{{AB}}$，$\angle OAB=90^\circ$，$\angle AOB=180^\circ-90^\circ-{b}^\circ={a}^\circ$。', 1,
             QB.tangent_fig(4, 4 * math.tan(math.radians(a)), {}, angle={'O': '?', 'B': f'{b}°'}), [(float(b), abo), (oab, 90.0)])


def b_angle_alg():
    xs = solve((x + 10) + (2 * x + 20) + 90 - 180, x)
    xv = xs[0]
    a = 2 * xv + 20
    oab, abo, _ = b_tan_fig_angles(float(a))
    return H(r'如圖，直線 $AB$ 切圓 $O$ 於 $A$ 點，$\angle ABO=(x+10)^\circ$，$\angle AOB=(2x+20)^\circ$，求 $x$。',
             rf'$x={xv}$', rf'切線垂直過切點的半徑，$\angle OAB=90^\circ$。三角形內角和：$(x+10)+(2x+20)+90=180$，$3x+120=180$，$x={xv}$。', 3,
             QB.tangent_fig(4, 4 * math.tan(math.radians(float(a))), {}, angle={'O': '(2x＋20)°', 'B': '(x＋10)°'}),
             [(float(xv + 10), abo), (oab, 90.0)])


def b_seg(r, ob):
    ab = sqrt(ob * ob - r * r)
    A, B = Point(0, -r), Point(ab, -r)
    return H(rf'如圖，直線 $AB$ 切圓 $O$ 於 $A$ 點，圓 $O$ 的半徑為 ${r}$，$\overline{{OB}}={ob}$，求切線段 $\overline{{AB}}$ 的長。',
             M(ab), rf'連接 $\overline{{OA}}$，切線垂直過切點的半徑：$\overline{{OA}}\perp\overline{{AB}}$，$\overline{{AB}}=\sqrt{{{ob}^2-{r}^2}}=\sqrt{{{ob * ob - r * r}}}' + (rf'={T(ab)}' if T(ab) != rf'\sqrt{{{ob * ob - r * r}}}' else '') + '$。', 2,
             QB.tangent_fig(r, float(ab), {'OA': str(r), 'OB': str(ob), 'AB': '?'}),
             [(Point(0, 0).distance(B), ob), (len(Circle(Point(0, 0), r).intersection(Line(A, B))), 1)])


def b_seg_out(r, bc):
    ob = r + bc
    ab = sqrt(ob * ob - r * r)
    return H(rf'如圖，直線 $AB$ 切圓 $O$ 於 $A$ 點，$\overline{{OB}}$ 交圓 $O$ 於 $C$ 點。若圓 $O$ 的半徑為 ${r}$，$\overline{{BC}}={bc}$，求切線段 $\overline{{AB}}$ 的長。',
             M(ab), rf'$\overline{{OC}}$ 是半徑，$\overline{{OB}}={r}+{bc}={ob}$。$\overline{{OA}}\perp\overline{{AB}}$，$\overline{{AB}}=\sqrt{{{ob}^2-{r}^2}}={T(ab)}$。', 2,
             tan_out_fig(r, ob, ('O', 'A', 'B', 'C'), {'r': str(r), 'out': str(bc), 'tan': '?'}),
             [(Point(0, 0).distance(Point(ab, -r)) - r, bc)])


def b_radius(cd, od):
    r = sqrt(od * od - cd * cd)
    return H(rf'如圖，直線 $CD$ 切圓 $O$ 於 $C$ 點，$\overline{{CD}}={cd}$、$\overline{{OD}}={od}$，求圓 $O$ 的半徑。',
             M(r), rf'$\overline{{OC}}\perp\overline{{CD}}$，$\triangle OCD$ 的斜邊是 $\overline{{OD}}$：半徑 $\overline{{OC}}=\sqrt{{{od}^2-{cd}^2}}={T(r)}$。', 2,
             QB.tangent_fig(float(r), cd, {'OA': '?', 'AB': str(cd), 'OB': str(od)}, names=('O', 'C', 'D')),
             [(Point(0, 0).distance(Point(cd, -r)), od), (len(Circle(Point(0, 0), r).intersection(Line(Point(0, -r), Point(cd, -r)))), 1)])


def b_radius_out(pa, pc):
    xs = solve((x + pc) ** 2 - (x ** 2 + pa ** 2), x)
    r = xs[0]
    return H(rf'如圖，直線 $PA$ 切圓 $O$ 於 $A$ 點，$\overline{{OP}}$ 交圓 $O$ 於 $C$ 點。若 $\overline{{PA}}={pa}$、$\overline{{PC}}={pc}$，求圓 $O$ 的半徑。',
             M(r), rf'設半徑為 $r$，$\overline{{OA}}=\overline{{OC}}=r$，$\overline{{OP}}=r+{pc}$。$\overline{{OA}}\perp\overline{{PA}}$：$(r+{pc})^2=r^2+{pa}^2$，${2 * pc}r+{pc * pc}={pa * pa}$，$r={T(r)}$。', 3,
             tan_out_fig(float(r), float(r + pc), ('O', 'A', 'P', 'C'), {'r': 'r', 'out': str(pc), 'tan': str(pa)}),
             [(Point(0, 0).distance(Point(pa, -r)), r + pc), (len(xs), 1)])


def b_op(r, pa):
    op = sqrt(r * r + pa * pa)
    return H(rf'如圖，直線 $PA$ 切圓 $O$ 於 $A$ 點，圓 $O$ 的半徑為 ${r}$，切線段 $\overline{{PA}}={pa}$，求 $\overline{{OP}}$ 的長。',
             M(op), rf'$\overline{{OA}}\perp\overline{{PA}}$，$\overline{{OP}}$ 是斜邊：$\overline{{OP}}=\sqrt{{{r}^2+{pa}^2}}=\sqrt{{{r * r + pa * pa}}}' + (rf'={T(op)}' if T(op) != rf'\sqrt{{{r * r + pa * pa}}}' else '') + '$。', 2,
             QB.tangent_fig(r, pa, {'OA': str(r), 'AB': str(pa), 'OB': '?'}, names=('O', 'A', 'P')),
             [(Point(0, 0).distance(Point(pa, -r)), op)])


def b_op_pc(r, pa):
    op = sqrt(r * r + pa * pa)
    return H(rf'如圖，直線 $PA$ 切圓 $O$ 於 $A$ 點，$\overline{{OP}}$ 交圓 $O$ 於 $C$ 點。若圓 $O$ 的半徑為 ${r}$，$\overline{{PA}}={pa}$，求 $\overline{{OP}}$ 和 $\overline{{PC}}$ 的長。',
             rf'$\overline{{OP}}={T(op)}$，$\overline{{PC}}={T(op - r)}$',
             rf'$\overline{{OA}}\perp\overline{{PA}}$，$\overline{{OP}}=\sqrt{{{r}^2+{pa}^2}}={T(op)}$；$\overline{{OC}}$ 是半徑，$\overline{{PC}}=\overline{{OP}}-\overline{{OC}}={T(op)}-{r}={T(op - r)}$。', 2,
             tan_out_fig(r, float(op), ('O', 'A', 'P', 'C'), {'r': str(r), 'out': '?', 'tan': str(pa)}),
             [(Point(0, 0).distance(Point(pa, -r)), op)])


def _par(gap, k, r):
    """五條平行線 y＝(4-i)·gap（i＝0..4），O 在第 k 條上；回傳 (距離, 用 sympy 算的交點個數)。"""
    gap = R(gap)
    ys = [(4 - i) * gap for i in range(5)]
    y0 = ys[k - 1]
    c = Circle(Point(0, y0), r)
    cnt = [len(c.intersection(Line(Point(0, y), Point(1, y)))) for y in ys]
    return [abs(y - y0) for y in ys], cnt


def _names(idx):
    return '、'.join(f'$L_{i + 1}$' for i in idx) or '沒有'


def b_par(gap, k, r):
    ds, cnt = _par(gap, k, r)
    sec = [i for i, d in enumerate(ds) if d < r]
    tan = [i for i, d in enumerate(ds) if d == r]
    non = [i for i, d in enumerate(ds) if d > r]
    ans = f'割線：{_names(sec)}；切線：{_names(tan)}；不相交：{_names(non)}'
    geo = f'割線：{_names([i for i, c in enumerate(cnt) if c == 2])}；切線：{_names([i for i, c in enumerate(cnt) if c == 1])}；不相交：{_names([i for i, c in enumerate(cnt) if c == 0])}'
    return H(rf'如圖，五條平行線 $L_1$～$L_5$ 相鄰兩條的距離都是 ${num(float(R(gap)))}$，$O$ 點在 $L_{k}$ 上。以 $O$ 為圓心、半徑 ${r}$ 畫圓，把 $L_1$～$L_5$ 分成割線、切線、和圓不相交的直線三類寫出來。',
             ans, rf'$L_1$～$L_5$ 到 $O$ 的距離依序是 {"、".join(num(float(d)) for d in ds)}，和半徑 ${r}$ 比較：距離小於半徑的是割線，等於半徑的是切線，大於半徑的不相交。', 2,
             QB.parallel_fig(float(R(gap)), k), [(ans, geo)])


def b_par_rev(gap, k, tangent_idx):
    ds, _ = _par(gap, k, 1)
    r = ds[tangent_idx[0]]
    _, cnt = _par(gap, k, r)
    sec = [i for i, d in enumerate(ds) if d < r]
    return H(rf'如圖，五條平行線 $L_1$～$L_5$ 相鄰兩條的距離都是 ${gap}$，$O$ 點在 $L_{k}$ 上。以 $O$ 為圓心畫圓，若 {_names(tangent_idx)} 都是圓的切線，求圓的半徑，並寫出割線有幾條。',
             rf'半徑 ${r}$，割線 {len(sec)} 條（{_names(sec)}）',
             rf'切線到圓心的距離等於半徑，{_names(tangent_idx)} 到 $O$ 的距離是 ${r}$，所以半徑＝${r}$。距離小於 ${r}$ 的是割線：{_names(sec)}，共 {len(sec)} 條。', 2,
             QB.parallel_fig(gap, k), [([i for i, c in enumerate(cnt) if c == 1] == tangent_idx, True), (len(sec), sum(1 for c in cnt if c == 2))])


def b_four(diam, ds):
    r = R(diam, 2)
    ds = [R(str(d)) for d in ds]
    names = ['L', 'M', 'N', 'H']
    kind = lambda d: 2 if d < r else 1 if d == r else 0
    ans = '；'.join(f'${nm}$：{LINE_NAME[kind(d)]}（{kind(d)} 個交點）' for nm, d in zip(names, ds))
    geo = '；'.join(f'${nm}$：{LINE_NAME[n_meet(r, d)]}（{n_meet(r, d)} 個交點）' for nm, d in zip(names, ds))
    return H(rf'圓 $O$ 的直徑為 ${diam}$，$O$ 到直線 $L$、$M$、$N$、$H$ 的距離如圖。分別判斷這四條直線是圓 $O$ 的割線、切線，還是和圓 $O$ 不相交，並寫出交點個數。',
             ans, rf'半徑 $r={frac(r)}$。距離等於 ${frac(r)}$ 的是切線（1 個交點），小於 ${frac(r)}$ 的是割線（2 個交點），大於 ${frac(r)}$ 的不相交（0 個交點）。', 2,
             QB.rays_fig([float(d) for d in ds], names), [(ans, geo)])


SLOTS_B = [
    ('q1', 0, [b_coord(3, 4, 5), b_coord(4, 4, 5), b_coord(2, 4, 5), b_coord(-4, 2, 5), b_coord(6, -8, 10), b_coord(5, -3, 6), b_coord_r(-5, 12)]),
    ('q2', 0, [b_dist(12, 7), b_dist(10, 5), b_dist(16, '7.5'), b_dist(9, '4.5'), b_dist(20, 11), b_range(10, 6), b_dist_diam(7)]),
    ('q3', 1, [b_line(14, 7), b_line(10, 6), b_line(18, 4), b_line(9, '4.5'), b_line(15, 8), b_line(13, 6), b_line_range(9)]),
    ('q4', 1, [b_tan_diam(6), b_tan_diam('4.5'), b_tan_diam('7.5'), b_tan_dist(14), b_tan_area(5), b_tan_circ(3)]),
    ('q5', 2, [b_angle(50), b_angle(62), b_angle(35), b_angle_rev(24), b_angle_rev(40), b_angle_alg()]),
    ('q6', 2, [b_seg(5, 13), b_seg(8, 17), b_seg(6, 10), b_seg(7, 25), b_seg(4, 6), b_seg_out(12, 8)]),
    ('q7', 2, [b_radius(4, 5), b_radius(12, 13), b_radius(8, 10), b_radius(15, 17), b_radius(24, 25), b_radius_out(8, 4), b_radius_out(15, 9)]),
    ('q8', 2, [b_op(9, 12), b_op(4, 6), b_op(2, 4), b_op(5, 12), b_op(8, 15), b_op_pc(6, 8)]),
    ('q9', 1, [b_par(3, 1, 7), b_par(2, 3, 4), b_par('3/2', 2, 3), b_par(2, 1, 6), b_par(3, 4, 5), b_par('3/2', 5, 3), b_par_rev(2, 3, [0, 4])]),
    ('q10', 1, [b_four(20, [12, 10, 8, 5]), b_four(12, [6, 4, 7, 6]), b_four(15, [7.5, 9, 6, 3]), b_four(18, [9, 11, 6, 9]), b_four(7, [3.5, 5, 2, 3])]),
]


# ═══════════════ 2-1(3) 切線段性質、弦與弦心距 ═══════════════
def c_angles(r, op):
    O, A, B, Pp = tan_float(r, op)
    return dict(APB=ang(Pp, A, B), APO=ang(Pp, A, O), AOB=ang(O, A, B), AOP=ang(O, A, Pp), OAP=ang(A, O, Pp))


def c_apb(a):
    op = 3 / math.sin(math.radians(a))
    g = c_angles(3, op)
    return H(rf'如圖，$\overline{{PA}}$、$\overline{{PB}}$ 分別切圓 $O$ 於 $A$、$B$ 兩點。若 $\angle APO={a}^\circ$，求 $\angle APB$ 的度數。',
             D(2 * a), rf'圓的切線段性質：$\overline{{PO}}$ 平分 $\angle APB$，$\angle APB=2\angle APO=2\times{a}^\circ={2 * a}^\circ$。', 1,
             QC.tangents_fig(3, op, angP=f'{a}°', angAPB='?'), [(g['APB'], float(2 * a)), (g['APO'], float(a))])


def c_apo(p):
    a = R(p, 2)
    op = 3 / math.sin(math.radians(float(a)))
    g = c_angles(3, op)
    return H(rf'如圖，$\overline{{PA}}$、$\overline{{PB}}$ 分別切圓 $O$ 於 $A$、$B$ 兩點。若 $\angle APB={p}^\circ$，求 $\angle APO$ 的度數。',
             D(a), rf'$\overline{{PO}}$ 平分 $\angle APB$，$\angle APO=\dfrac12\angle APB=\dfrac12\times{p}^\circ={T(a)}^\circ$。', 1,
             tfig(3, op, arcs=[('P', 'A', 'B', f'{p}°', 56), ('P', 'O', 'A', '?', 30)]), [(g['APO'], float(a)), (g['APB'], float(p))])


def c_aop(o):
    a = 90 - o
    op = 3 / math.sin(math.radians(a))
    g = c_angles(3, op)
    return H(rf'如圖，$\overline{{PA}}$、$\overline{{PB}}$ 分別切圓 $O$ 於 $A$、$B$ 兩點。若 $\angle AOP={o}^\circ$，求 $\angle APB$ 的度數。',
             D(2 * a), rf'$\angle OAP=90^\circ$（切線垂直半徑），$\angle APO=180^\circ-90^\circ-{o}^\circ={a}^\circ$；$\overline{{PO}}$ 平分 $\angle APB$，$\angle APB=2\times{a}^\circ={2 * a}^\circ$。', 2,
             tfig(3, op, arcs=[('O', 'A', 'P', f'{o}°', 18), ('P', 'A', 'B', '?', 46)]), [(g['APB'], float(2 * a)), (g['AOP'], float(o))])


def c_apb_alg():
    xs = solve((2 * x + 5) - (3 * x - 10), x)
    xv = xs[0]
    a = 2 * xv + 5
    op = 3 / math.sin(math.radians(float(a)))
    g = c_angles(3, op)
    return H(r'如圖，$\overline{PA}$、$\overline{PB}$ 分別切圓 $O$ 於 $A$、$B$ 兩點。若 $\angle APO=(2x+5)^\circ$、$\angle BPO=(3x-10)^\circ$，求 $x$ 和 $\angle APB$ 的度數。',
             rf'$x={xv}$，$\angle APB={2 * a}^\circ$', rf'$\overline{{PO}}$ 平分 $\angle APB$，$\angle APO=\angle BPO$：$2x+5=3x-10$，$x={xv}$。$\angle APO={a}^\circ$，$\angle APB=2\times{a}^\circ={2 * a}^\circ$。', 3,
             tfig(3, op, arcs=[('P', 'O', 'A', '(2x＋5)°', 40), ('P', 'B', 'O', '(3x－10)°', 40)]), [(g['APB'], float(2 * a)), (len(xs), 1)])


def c_aob(p):
    o = 180 - p
    op = 3 / math.sin(math.radians(p / 2))
    g = c_angles(3, op)
    return H(rf'如圖，$\overline{{PA}}$、$\overline{{PB}}$ 分別切圓 $O$ 於 $A$、$B$ 兩點。若 $\angle APB={p}^\circ$，求 $\angle AOB$ 的度數。',
             D(o), rf'切線垂直半徑：$\angle OAP=\angle OBP=90^\circ$。四邊形 $OAPB$ 內角和 $360^\circ$：$\angle AOB=360^\circ-90^\circ-90^\circ-{p}^\circ={o}^\circ$。', 2,
             QC.tangents_fig(3, op, angAPB=f'{p}°', angO='?'), [(g['AOB'], float(o)), (g['OAP'], 90.0)])


def c_apb_from_aob(o):
    p = 180 - o
    op = 3 / math.sin(math.radians(p / 2))
    g = c_angles(3, op)
    return H(rf'如圖，$\overline{{PA}}$、$\overline{{PB}}$ 分別切圓 $O$ 於 $A$、$B$ 兩點。若 $\angle AOB={o}^\circ$，求 $\angle APB$ 的度數。',
             D(p), rf'$\angle OAP=\angle OBP=90^\circ$，四邊形 $OAPB$ 內角和 $360^\circ$：$\angle APB=360^\circ-90^\circ-90^\circ-{o}^\circ={p}^\circ$。', 2,
             QC.tangents_fig(3, op, angAPB='?', angO=f'{o}°'), [(g['APB'], float(p))])


def c_aob_from_apo(a):
    o = 180 - 2 * a
    op = 3 / math.sin(math.radians(a))
    g = c_angles(3, op)
    return H(rf'如圖，$\overline{{PA}}$、$\overline{{PB}}$ 分別切圓 $O$ 於 $A$、$B$ 兩點。若 $\angle APO={a}^\circ$，求 $\angle AOB$ 的度數。',
             D(o), rf'$\overline{{PO}}$ 平分 $\angle APB$，$\angle APB={2 * a}^\circ$。$\angle OAP=\angle OBP=90^\circ$，$\angle AOB=360^\circ-90^\circ-90^\circ-{2 * a}^\circ={o}^\circ$。', 2,
             tfig(3, op, arcs=[('P', 'O', 'A', f'{a}°', 40), ('O', 'A', 'B', '?', 20)]), [(g['AOB'], float(o))])


def c_aob_ratio():
    xs = solve(3 * x + x - 180, x)
    p = xs[0]
    o = 3 * p
    op = 3 / math.sin(math.radians(float(p) / 2))
    g = c_angles(3, op)
    return H(r'如圖，$\overline{PA}$、$\overline{PB}$ 分別切圓 $O$ 於 $A$、$B$ 兩點。若 $\angle AOB$ 是 $\angle APB$ 的 $3$ 倍，求 $\angle AOB$ 的度數。',
             D(o), rf'$\angle OAP=\angle OBP=90^\circ$，所以 $\angle AOB+\angle APB=180^\circ$。設 $\angle APB=x^\circ$：$3x+x=180$，$x={p}$，$\angle AOB={o}^\circ$。', 3,
             QC.tangents_fig(3, op), [(g['AOB'], float(o)), (g['APB'], float(p))])


def c_perim(r, op):
    pa = sqrt(op * op - r * r)
    A, B = tangent_pts(r, op)
    Pp = Point(op, 0)
    geo = 2 * r + Pp.distance(A) + Pp.distance(B)
    return H(rf'如圖，$\overline{{PA}}$、$\overline{{PB}}$ 分別切圓 $O$ 於 $A$、$B$。若圓 $O$ 的半徑為 ${r}$，$\overline{{OP}}={op}$，求四邊形 $OAPB$ 的周長。',
             M(2 * r + 2 * pa), rf'$\angle OAP=90^\circ$，$\overline{{PA}}=\sqrt{{{op}^2-{r}^2}}={T(pa)}$；切線段性質 $\overline{{PB}}=\overline{{PA}}={T(pa)}$。周長＝${r}+{T(pa)}+{T(pa)}+{r}={T(2 * r + 2 * pa)}$。', 2,
             QC.tangents_fig(r, op, labels={'r': str(r), 'op': str(op)}), [(geo, 2 * r + 2 * pa)])


def c_perim_rev(r, per):
    pa = R(per - 2 * r, 2)
    op = sqrt(r * r + pa * pa)
    A, B = tangent_pts(r, op)
    return H(rf'如圖，$\overline{{PA}}$、$\overline{{PB}}$ 分別切圓 $O$ 於 $A$、$B$。若圓 $O$ 的半徑為 ${r}$，四邊形 $OAPB$ 的周長為 ${per}$，求 $\overline{{OP}}$ 的長。',
             M(op), rf'$\overline{{PA}}=\overline{{PB}}$，${r}+{r}+2\overline{{PA}}={per}$，$\overline{{PA}}={T(pa)}$。$\angle OAP=90^\circ$，$\overline{{OP}}=\sqrt{{{r}^2+{T(pa)}^2}}={T(op)}$。', 3,
             QC.tangents_fig(r, float(op), labels={'r': str(r), 'op': '?'}), [(2 * r + Point(op, 0).distance(A) + Point(op, 0).distance(B), per)])


def c_ab(r, op):
    pa = sqrt(op * op - r * r)
    ab = 2 * r * pa / op
    A, B = tangent_pts(r, op)
    return H(rf'如圖，$\overline{{PA}}$、$\overline{{PB}}$ 分別切圓 $O$ 於 $A$、$B$。若圓 $O$ 的半徑為 ${r}$，$\overline{{OP}}={op}$，求 $\overline{{AB}}$ 的長。',
             M(ab), rf'$\overline{{PA}}=\sqrt{{{op}^2-{r}^2}}={T(pa)}$。$\overline{{PO}}$ 垂直平分 $\overline{{AB}}$，設交點為 $R$：$\triangle OAP$ 面積＝$\dfrac{{{r}\times{T(pa)}}}{{2}}=\dfrac{{{op}\times\overline{{AR}}}}{{2}}$，'
             rf'$\overline{{AR}}={T(ab / 2)}$，$\overline{{AB}}=2\overline{{AR}}={T(ab)}$。', 3,
             QC.tangents_fig(r, op, labels={'r': str(r), 'op': str(op), 'ab': '?'}, chord=True), [(A.distance(B), ab)])


def c_chord(r, d):
    ab = 2 * sqrt(r * r - d * d)
    return H(rf'如圖，圓 $O$ 的半徑為 ${r}$，$\overline{{OM}}$ 是弦 $\overline{{AB}}$ 的弦心距，$\overline{{OM}}={d}$，求 $\overline{{AB}}$ 的長。',
             M(ab), rf'連接 $\overline{{OA}}$，$\overline{{AM}}=\sqrt{{{r}^2-{d}^2}}={T(ab / 2)}$。弦心距垂直平分弦：$\overline{{AB}}=2\overline{{AM}}={T(ab)}$。', 2,
             QC.chord_fig(r, d, labels={'r': str(r), 'd': str(d), 'ab': '?'})[0], [(chord_len_geo(r, d), ab)])


def c_concentric(big, small):
    ab = 2 * sqrt(big * big - small * small)
    return H(rf'如圖，兩個圓的圓心都是 $O$（同心圓），大圓的弦 $\overline{{AB}}$ 切小圓於 $C$ 點。若大圓的半徑為 ${big}$、小圓的半徑為 ${small}$，求 $\overline{{AB}}$ 的長。',
             M(ab), rf'連接 $\overline{{OC}}$、$\overline{{OA}}$。$\overline{{AB}}$ 切小圓於 $C$，$\overline{{OC}}\perp\overline{{AB}}$，$\overline{{OC}}={small}$ 就是大圓弦 $\overline{{AB}}$ 的弦心距。'
             rf'$\overline{{AC}}=\sqrt{{{big}^2-{small}^2}}={T(ab / 2)}$，$\overline{{AB}}=2\overline{{AC}}={T(ab)}$。', 3,
             concentric_fig(big, small), [(chord_len_geo(big, small), ab), (len(Circle(Point(0, 0), small).intersection(Line(Point(0, -small), Point(1, -small)))), 1)])


def c_dist(r, c):
    d = sqrt(r * r - R(c, 2) ** 2)
    return H(rf'如圖，圓 $O$ 的半徑為 ${r}$，弦 $\overline{{AB}}={c}$，$\overline{{OM}}$ 是 $\overline{{AB}}$ 的弦心距，求 $\overline{{OM}}$ 的長。',
             M(d), rf'$\overline{{OM}}$ 垂直平分 $\overline{{AB}}$，$\overline{{AM}}={T(R(c, 2))}$，$\overline{{OM}}=\sqrt{{{r}^2-{T(R(c, 2))}^2}}={T(d)}$。', 2,
             QC.chord_fig(r, float(d), labels={'r': str(r), 'd': '?', 'ab': str(c)})[0], [(chord_len_geo(r, d), c)])


def c_compare(r, ab, cd):
    om = sqrt(r * r - R(ab, 2) ** 2)
    on = sqrt(r * r - R(cd, 2) ** 2)
    rel = '<' if om < on else '>'
    return H(rf'如圖，圓 $O$ 的半徑為 ${r}$，弦 $\overline{{AB}}={ab}$、$\overline{{CD}}={cd}$，$\overline{{OM}}$、$\overline{{ON}}$ 分別是它們的弦心距。求 $\overline{{OM}}$、$\overline{{ON}}$ 的長，並比較兩者的大小。',
             rf'$\overline{{OM}}={T(om)}$，$\overline{{ON}}={T(on)}$，$\overline{{OM}}{rel}\overline{{ON}}$',
             rf'$\overline{{OM}}=\sqrt{{{r}^2-{R(ab, 2)}^2}}={T(om)}$，$\overline{{ON}}=\sqrt{{{r}^2-{R(cd, 2)}^2}}={T(on)}$，$\overline{{OM}}{rel}\overline{{ON}}$。同一個圓中，弦愈長，弦心距愈小。', 2,
             QC.two_chords_fig(cd, on, om, False, {'ab': str(ab), 'cd': str(cd), 'om': '?', 'on': '?'}),
             [(chord_len_geo(r, om), ab), (chord_len_geo(r, on), cd), ((om < on) == (ab > cd), True)])


def c_radius(c, d):
    r = sqrt(R(c, 2) ** 2 + d * d)
    return H(rf'如圖，圓 $O$ 的弦 $\overline{{AB}}={c}$，弦心距 $\overline{{OM}}={d}$，求圓 $O$ 的半徑。',
             M(r), rf'$\overline{{AM}}=\dfrac12\overline{{AB}}={T(R(c, 2))}$，半徑 $\overline{{OA}}=\sqrt{{{T(R(c, 2))}^2+{d}^2}}={T(r)}$。要用弦長的一半，不是整條弦。', 2,
             QC.chord_fig(float(r), d, labels={'r': '?', 'd': str(d), 'ab': str(c)})[0], [(chord_len_geo(r, d), c)])


def c_radius_alg(c, k):
    xs = solve(x ** 2 - ((x - k) ** 2 + R(c, 2) ** 2), x)
    r = xs[0]
    return H(rf'如圖，圓 $O$ 的弦 $\overline{{AB}}={c}$，弦心距 $\overline{{OM}}$ 比半徑少 ${k}$，求圓 $O$ 的半徑。',
             M(r), rf'設半徑為 $r$，$\overline{{OM}}=r-{k}$，$\overline{{AM}}={R(c, 2)}$。$r^2=(r-{k})^2+{R(c, 2)}^2$，${2 * k}r={k * k + R(c, 2) ** 2}$，$r={T(r)}$。', 3,
             QC.chord_fig(float(r), float(r - k), labels={'r': 'r', 'd': f'r－{k}', 'ab': str(c)})[0], [(chord_len_geo(r, r - k), c), (len(xs), 1)])


def c_two(cd, on, om):
    r = sqrt(on * on + R(cd, 2) ** 2)
    am = sqrt(r * r - om * om)
    return H(rf'如圖，$\overline{{OM}}$、$\overline{{ON}}$ 分別是圓 $O$ 的弦 $\overline{{AB}}$、$\overline{{CD}}$ 的弦心距。若 $\overline{{CD}}={cd}$、$\overline{{ON}}={on}$、$\overline{{OM}}={om}$，求 $\overline{{AB}}$ 的長。',
             M(2 * am), rf'$\overline{{CN}}={R(cd, 2)}$，半徑 $\overline{{OC}}=\sqrt{{{on}^2+{R(cd, 2)}^2}}={T(r)}$，$\overline{{OA}}=\overline{{OC}}={T(r)}$；$\overline{{AM}}=\sqrt{{{T(r)}^2-{om}^2}}={T(am)}$，$\overline{{AB}}=2\overline{{AM}}={T(2 * am)}$。', 3,
             QC.two_chords_fig(cd, on, om, False, {'cd': str(cd), 'on': str(on), 'om': str(om), 'ab': '?'}),
             [(chord_len_geo(r, on), cd), (chord_len_geo(r, om), 2 * am)])


def c_same(om, ab, cd):
    r = sqrt(om * om + R(ab, 2) ** 2)
    on = sqrt(r * r - R(cd, 2) ** 2)
    mn = on - om
    assert mn > 0
    return H(rf'如圖，$\overline{{OM}}$、$\overline{{ON}}$ 分別是圓 $O$ 的弦 $\overline{{AB}}$、$\overline{{CD}}$ 的弦心距，兩弦在圓心 $O$ 的同側，而且 $O$、$M$、$N$ 三點共線。若 $\overline{{OM}}={om}$、$\overline{{AB}}={ab}$、$\overline{{CD}}={cd}$，求 $\overline{{MN}}$ 的長。',
             M(mn), rf'半徑＝$\sqrt{{{om}^2+{R(ab, 2)}^2}}={T(r)}$，$\overline{{ON}}=\sqrt{{{T(r)}^2-{R(cd, 2)}^2}}={T(on)}$，兩弦在 $O$ 的同側：$\overline{{MN}}=\overline{{ON}}-\overline{{OM}}={T(on)}-{om}={T(mn)}$。', 3,
             QC.two_chords_fig(cd, on, om, True, {'ab': str(ab), 'cd': str(cd), 'om': str(om), 'mn': '?'}),
             [(chord_len_geo(r, om), ab), (chord_len_geo(r, on), cd), (Point(0, om).distance(Point(0, on)), mn)])


def c_opp(om, ab, cd):
    r = sqrt(om * om + R(ab, 2) ** 2)
    on = sqrt(r * r - R(cd, 2) ** 2)
    mn = on + om
    return H(rf'如圖，$\overline{{OM}}$、$\overline{{ON}}$ 分別是圓 $O$ 的弦 $\overline{{AB}}$、$\overline{{CD}}$ 的弦心距，兩弦在圓心 $O$ 的兩側，而且 $M$、$O$、$N$ 三點共線。若 $\overline{{OM}}={om}$、$\overline{{AB}}={ab}$、$\overline{{CD}}={cd}$，求 $\overline{{MN}}$ 的長。',
             M(mn), rf'半徑＝$\sqrt{{{om}^2+{R(ab, 2)}^2}}={T(r)}$，$\overline{{ON}}=\sqrt{{{T(r)}^2-{R(cd, 2)}^2}}={T(on)}$，兩弦在 $O$ 的兩側：$\overline{{MN}}=\overline{{OM}}+\overline{{ON}}={om}+{T(on)}={T(mn)}$。', 3,
             opp_fig(om, ab, cd), [(chord_len_geo(r, on), cd), (Point(0, om).distance(Point(0, -on)), mn)])


APP = {
    'tunnel': (r'如圖，某隧道的橫切面是圓 $O$ 的一部分，路面寬 $\overline{{AB}}={ab}$ 公尺，隧道高度 $\overline{{CD}}={cd}$ 公尺（$\overline{{CD}}$ 通過圓心且垂直 $\overline{{AB}}$），求隧道所在圓的半徑是幾公尺。', '公尺', 'tunnel'),
    'arch': (r'如圖，一座拱橋的橋拱是圓 $O$ 的一段弧，跨度 $\overline{{AB}}={ab}$ 公尺，拱高 $\overline{{CD}}={cd}$ 公尺（$\overline{{CD}}$ 垂直 $\overline{{AB}}$，它的延長線通過圓心 $O$），求橋拱所在圓的半徑是幾公尺。', '公尺', 'tunnel'),
    'bed': (r'如圖，圓形水管屋的截面圓心為 $O$，床長 $\overline{{AB}}={ab}$ 公分，床與地面的距離 $\overline{{CD}}={cd}$ 公分（$\overline{{CD}}$ 通過圓心且垂直 $\overline{{AB}}$），求水管屋的半徑是幾公分。', '公分', 'bed'),
    'pipe': (r'如圖，一根圓形水管的截面圓心為 $O$，管內水面寬 $\overline{{AB}}={ab}$ 公分，水最深的地方 $\overline{{CD}}={cd}$ 公分（$\overline{{CD}}$ 垂直水面，延長線通過圓心），求水管截面的半徑是幾公分。', '公分', 'bed'),
}


def c_app(ab, cd, kind):
    tpl, unit, fk = APP[kind]
    xs = solve(x ** 2 - ((cd - x) ** 2 + R(ab, 2) ** 2), x)
    r = xs[0]
    od = rf'{cd}-x' if (fk == 'tunnel' and cd > r) else rf'x-{cd}'
    Q = 'A' if fk == 'tunnel' else 'B'  # 附圖裡畫出的那條半徑
    # 驗算：C、A 都在半徑 r 的圓上（C 在 y＝±r，弦 AB 在 y＝±(r−cd)）
    yD = (r - cd) if fk == 'tunnel' else (cd - r)
    geo = [(Point(0, 0).distance(Point(R(ab, 2), yD)), r), (abs(yD - (r if fk == 'tunnel' else -r)), cd)]
    return H(tpl.format(ab=ab, cd=cd),
             f'${dec(r)}$ {unit}', rf'設半徑為 $x$，連接 $\overline{{O{Q}}}$，$\overline{{O{Q}}}=x$，$\overline{{OD}}={od}$，$\overline{{{Q}D}}=\dfrac12\overline{{AB}}={R(ab, 2)}$。'
             rf'$x^2=({od})^2+{R(ab, 2)}^2$，${2 * cd}x={cd * cd + R(ab, 2) ** 2}$，$x={dec(r)}$（{unit}）。', 3,
             app_fig(ab, cd, fk == 'tunnel'), geo + [(len(xs), 1)])


SLOTS_C = [
    ('q1', 0, [c_apb(25), c_apb(30), c_apb(35), c_apo(48), c_aop(62), c_apb_alg()]),
    ('q2', 0, [c_aob(30), c_aob(60), c_aob(50), c_apb_from_aob(110), c_aob_from_apo(20), c_aob_ratio()]),
    ('q3', 0, [c_perim(5, 13), c_perim(6, 10), c_perim(9, 15), c_perim(7, 25), c_perim(20, 29), c_perim_rev(8, 46)]),
    ('q4', 0, [c_ab(6, 10), c_ab(5, 13), c_ab(7, 25), c_ab(3, 5), c_ab(15, 25), c_ab(10, 26)]),
    ('q5', 1, [c_chord(13, 5), c_chord(17, 8), c_chord(5, 3), c_chord(10, 6), c_chord(6, 4), c_concentric(17, 8)]),
    ('q6', 1, [c_dist(10, 16), c_dist(13, 24), c_dist(17, 30), c_dist(5, 8), c_dist(9, 12), c_compare(13, 24, 10)]),
    ('q7', 1, [c_radius(12, 8), c_radius(10, 12), c_radius(16, 15), c_radius(48, 7), c_radius(8, 4), c_radius_alg(16, 2)]),
    ('q8', 1, [c_two(24, 5, 12), c_two(10, 12, 5), c_two(16, 15, 8), c_two(6, 4, 3), c_two(14, 24, 20), c_two(12, 8, 4)]),
    ('q9', 1, [c_same(5, 24, 10), c_same(6, 16, 12), c_same(15, 40, 14), c_same(7, 48, 14), c_same(8, 30, 16), c_opp(12, 10, 24)]),
    ('q10', 1, [c_app(30, 25, 'tunnel'), c_app(24, 16, 'tunnel'), c_app(72, 12, 'bed'), c_app(16, 4, 'arch'), c_app(48, 8, 'pipe'), c_app(12, 9, 'tunnel')]),
]


# ═══════════════ 課綱、對應與匯出 ═══════════════
TEXTBOOK = '九年級/01_115國中數學3上課本PDF/01_115國中數學3上課本PDF(教)/06_115國中數學3上課本_2-1 點、直線與圓之間的位置關係(教).pdf'
PREP8 = '八年級/115上_國中_數學_教材資源_備課用書_備課PDF_二年級/01-115國中數學2上-備課-目次(115f231509).pdf'
TODO_PERF = '（待補原文：九上教用課本 2-1 與九上習教都沒有標學習表現代碼；此代碼沿用 docs/HOMEWORK.md 的範例，敘述待老師依九上備課用書補上）'
S_IV_7 = dict(code='s-IV-7', text='理解畢氏定理與其逆敘述，並能應用於數學解題與日常生活的問題。')
G_IV_1 = dict(code='g-IV-1', text='認識直角坐標的意義與構成要素，並能報讀與標示坐標點，以及計算兩個坐標點的距離。')
# s-IV-14、S-9-5、S-9-7 的敘述抄自國家教育研究院《十二年國民基本教育課程綱要 國民中小學暨普通型高級中等學校 數學領域》學習表現、學習內容（https://www.naer.edu.tw/upload/1/16/doc/815/）
S_IV_14 = dict(code='s-IV-14', text='認識圓的相關概念（如半徑、弦、弧、弓形等）和幾何性質（如圓心角、圓周角、圓內接四邊形的對角互補等），並理解弧長、圓面積、扇形面積的公式。')
S95 = dict(code='S-9-5', text='圓弧長與扇形面積：以π表示圓周率；弦、圓弧、弓形的意義；圓弧長公式；扇形面積公式。')
S97 = dict(code='S-9-7', text='點、直線與圓的關係：點與圓的位置關係（內部、圓上、外部）；直線與圓的位置關係（不相交、相切、交於兩點）；圓心與切點的連線垂直此切線（切線性質）；圓心到弦的垂直線段（弦心距）垂直平分此弦。')

# 多小題的 IRS 頁：每一小題各自對到的題型（順序＝課程 JSON 的 items 順序）。
# 學習紀錄逐小題記錄；沒列的多小題頁若整頁對到兩個以上題型，check-homework 會報錯。
ITEM_LINKS = {
    'g9-2-1a': {
        'a-ex1': [['q1'], ['q3'], ['q2']],
        'a-ex1-practice': [['q1'], ['q3'], ['q2']],
        'a-ex2': [['q4'], ['q5']],
        'a-ex2-practice': [['q4'], ['q5']],
        'a-ex3': [['q7'], ['q7'], ['q9']],
        'a-ex3-practice': [['q8'], ['q8'], ['q9']],
    },
    'g9-2-1b': {
        # 每一小題都是「由圓心到直線的距離判斷交點個數」
        'b-ex4': [['q10'], ['q10'], ['q10']],
    },
    'g9-2-1c': {
        'c-ex6': [['q3'], ['q4']],
    },
}

LESSONS = {
    'g9-2-1a': dict(
        title='2-1(1) 圓、弧長與扇形面積',
        source=f'九上教用課本 2-1 p.86–91（{TEXTBOOK}，PDF 第 3–8 頁；p.89、90、91 頁邊標「學習內容 S-9-5」）；'
               f's-IV-7 敘述抄自八上備課用書教學活動連結分析表 p.30（{PREP8}）；s-IV-14、S-9-5 敘述抄自數學領綱。題目自編，答案已用 SymPy 核算',
        curriculum=dict(performance=[S_IV_14, S_IV_7], content=[S95]),
        slots=SLOTS_A,
        perf={'q9': ['s-IV-14', 's-IV-7']},
        default_perf=['s-IV-14'], content=['S-9-5'],
        activities={
            'a-predict': ['q2'], 'a-terms': ['q10'], 'a-terms-practice': ['q10'], 'a-explore': ['q4'],
            'a-formula': ['q1'], 'a-ex1': ['q1', 'q2', 'q3'], 'a-ex1-practice': ['q1', 'q2', 'q3'],
            'a-ex2': ['q4', 'q5'], 'a-ex2-practice': ['q4', 'q5'], 'a-ex3': ['q7', 'q9'], 'a-ex3-practice': ['q8', 'q9'],
            'a-error': ['q2'], 'a-exit': ['q1', 'q2'],
        },
    ),
    'g9-2-1b': dict(
        title='2-1(2) 點、直線與圓、切線',
        source=f'九上教用課本 2-1 p.92–97（{TEXTBOOK}，PDF 第 9–14 頁；p.96、97 頁邊標「學習內容 S-9-7」）＋2-1(1)；'
               f's-IV-7、g-IV-1 敘述抄自八上備課用書教學活動連結分析表 p.30（{PREP8}）；s-IV-14、S-9-7 敘述抄自數學領綱。題目自編，答案已用 SymPy 核算',
        curriculum=dict(performance=[S_IV_14, S_IV_7, G_IV_1], content=[S97]),
        slots=SLOTS_B,
        perf={'q1': ['s-IV-14', 'g-IV-1'], 'q6': ['s-IV-14', 's-IV-7'], 'q7': ['s-IV-14', 's-IV-7'], 'q8': ['s-IV-14', 's-IV-7']},
        default_perf=['s-IV-14'], content=['S-9-7'],
        activities={
            'b-predict': ['q3'], 'b-point': ['q1'], 'b-point-practice': ['q2'], 'b-line': ['q3', 'q4'], 'b-tangent': ['q5'],
            'b-line-practice': ['q3'], 'b-ex4': ['q3', 'q10'], 'b-ex4-practice': ['q9'], 'b-ex5': ['q6'], 'b-ex5-practice': ['q7'],
            'b-error': ['q3'], 'b-exit': ['q4', 'q5'],
        },
    ),
    'g9-2-1c': dict(
        title='2-1(3) 切線段性質、弦與弦心距',
        source=f'九上教用課本 2-1 p.98–105（{TEXTBOOK}，PDF 第 15–22 頁；p.99、102、103、105 頁邊標「學習內容 S-9-7」）＋2-1(1)(2)；'
               f's-IV-7 敘述抄自八上備課用書教學活動連結分析表 p.30（{PREP8}）；s-IV-14、S-9-7 敘述抄自數學領綱。題目自編，答案已用 SymPy 核算',
        curriculum=dict(performance=[S_IV_14, S_IV_7], content=[S97]),
        slots=SLOTS_C,
        perf={'q1': ['s-IV-14'], 'q2': ['s-IV-14']},
        default_perf=['s-IV-14', 's-IV-7'], content=['S-9-7'],
        activities={
            'c-predict': ['q3'], 'c-tangent': ['q3'], 'c-ex6': ['q3', 'q4'], 'c-ex6-practice': ['q4'], 'c-chord': ['q6'],
            'c-ex7': ['q5'], 'c-ex7-practice': ['q6'], 'c-ex8': ['q8'], 'c-ex8-practice': ['q9'], 'c-ex9': ['q10'], 'c-ex9-practice': ['q10'],
            'c-error': ['q7'], 'c-summary': ['q3', 'q5'],
        },
    ),
}


def run_checks(v, where):
    for c in v['checks']:
        if isinstance(c, tuple):
            assert same(c[0], c[1]), f'{where}：驗算不一致 {c[0]} ≠ {c[1]}\n  題目：{v["stem"]}\n  答案：{v["answer"]}'
        else:
            assert c is True, f'{where}：驗算不成立\n  題目：{v["stem"]}'


def main():
    total = 0
    for lid, L in LESSONS.items():
        quiz = json.loads((ROOT / 'content/quizzes' / f'{lid}.json').read_text(encoding='utf8'))
        topics = {s['id']: s['topic'] for s in quiz['slots']}
        assert [s[0] for s in L['slots']] == list(topics), lid
        slots = []
        for sid, obj, variants in L['slots']:
            assert len(variants) >= 5, f'{lid} {sid} 只有 {len(variants)} 題'
            out = []
            for k, v in enumerate(variants, 1):
                where = f'{lid} {sid}-{k}'
                run_checks(v, where)
                assert not any(w in v['stem'] for w in ('下列何者', '下列哪', '哪一個', '哪一項', '何者')), where
                assert v['figure'] and v['figure'].startswith('<svg'), f'{where} 缺附圖'
                out.append(dict(stem=v['stem'], figure=v['figure'], answer=v['answer'], solution=v['solution'], space=v['space']))
                total += 1
            slots.append(dict(id=sid, topic=topics[sid], objective=obj, performance=L['perf'].get(sid, L['default_perf']),
                              content=L['content'], variants=out))
        data = dict(lessonId=lid, section='9-2-1', title=L['title'], source=L['source'], curriculum=L['curriculum'],
                    slots=slots, links=dict(activities=L['activities'], **({'items': ITEM_LINKS[lid]} if lid in ITEM_LINKS else {})))
        path = ROOT / 'content/homework' / f'{lid}.json'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        print(f'✓ {lid}：{len(slots)} 個題型、{sum(len(s["variants"]) for s in slots)} 題 → {path.relative_to(ROOT)}')
    print(f'{total} 題全部一致')


if __name__ == '__main__':
    main()
