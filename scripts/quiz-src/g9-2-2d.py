r"""2-2(4) 圓內接四邊形：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一，每題附圖）。

用法：C:\AI\H3\venv\Scripts\python.exe -B -X utf8 scripts/quiz-src/g9-2-2d.py
範圍：2-2(1)～(3)＋這一堂的圓內接四邊形對角互補（兩個對角所對的弧合起來是整個圓）、
外角等於內對角（例 8）、過圓外一點作切線（以 OP 為直徑作圓，半圓所對的圓周角是直角，半徑垂直切線）。
先備：2-1 切線垂直過切點的半徑、三角形內角和、比例。
不用 2-3 以後的內容（外心、內心等）。
附圖都用題目的同一組數字畫（四個頂點的位置由四段弧的度數決定，角度照實際大小），題目問的角標「?」。
"""
import sys
from math import cos, pi as PI, sin
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from arcfig import A_, BLUE_ARC, Circ, R, away, dpick, lab, tangent_pts  # noqa: E402
from circlefig import P  # noqa: E402
from quizlib import export, slot, statement, value, with_figure  # noqa: E402


def arcs_from(a, b, v=None):
    """∠A＝a、∠B＝b 的圓內接四邊形 ABCD 的四段弧 (AB, BC, CD, DA)。v＝{CD}（不給就取中間值）。"""
    if v is None:
        v = min(2 * a, 2 * b) * R(1, 2)
    u, z = 2 * a - v, 2 * b - v
    w = 360 - u - v - z
    assert min(w, u, v, z) >= 25, (a, b, v, (w, u, v, z))
    return w, u, v, z


def quad(a, b, v=None, a0=200, center=False, oat=None):
    """畫圓內接四邊形 ABCD（逆時針）：回傳 (Circ, 點, 各點角度)。"""
    w, u, v, z = arcs_from(a, b, v)
    deg_ = {'A': a0, 'B': a0 + w, 'C': a0 + w + u, 'D': a0 + w + u + v}
    c = Circ(center=center, oat=oat or (0.9, -0.9))
    Pt = {k: c.p(k, float(d)) for k, d in deg_.items()}
    for s in ('AB', 'BC', 'CD', 'DA'):
        c.seg(Pt[s[0]], Pt[s[1]])
    return c, Pt, deg_


def ang(c, Pt, v, txt, r=20):
    order = 'ABCD'
    i = order.index(v)
    c.angle(Pt[v], Pt[order[i - 1]], Pt[order[(i + 1) % 4]], txt, r=r)


def extend(c, p, q, name, k=0.55):
    """延長 pq 到 q 的外側一點（名稱 name）。"""
    e = c.f.pt(name, q.x + (q.x - p.x) * k, q.y + (q.y - p.y) * k, True)
    c.seg(q, e)
    return e


# ───────── 1. 對角互補 ─────────
def opposite(a, b=95):
    c, Pt, _ = quad(a, b)
    ang(c, Pt, 'A', lab(a))
    ang(c, Pt, 'C', '?')
    return with_figure(value(
        rf'如圖，四邊形 $ABCD$ 是圓內接四邊形，$\angle A={a}^\circ$，$\angle C$ 是幾度？',
        180 - a,
        dpick(180 - a, [a, 2 * a, 360 - a, 90 - a if a < 90 else a - 90]),
        rf'$\angle A$ 對 {A_("BCD")}、$\angle C$ 對 {A_("BAD")}，兩段弧合起來是整個圓：$\angle A+\angle C=\dfrac{{1}}{{2}}\times360^\circ=180^\circ$，'
        rf'$\angle C=180^\circ-{a}^\circ={180 - a}^\circ$。'),
        c.svg())


# ───────── 2. 外角等於內對角 ─────────
def exterior(a, b=88):
    c, Pt, _ = quad(a, b)
    E = extend(c, Pt['B'], Pt['C'], 'E')
    ang(c, Pt, 'A', lab(a))
    c.angle(Pt['C'], Pt['D'], E, '?', r=18)
    return with_figure(value(
        rf'如圖，四邊形 $ABCD$ 是圓內接四邊形，延長 $\overline{{BC}}$ 到 $E$，$\angle BAD={a}^\circ$，$\angle DCE$ 是幾度？',
        a,
        dpick(a, [180 - a, R(a, 2), 2 * a, 90 - R(a, 2)]),
        rf'對角互補：$\angle BCD=180^\circ-{a}^\circ={180 - a}^\circ$。$\angle DCE=180^\circ-\angle BCD={a}^\circ$，'
        rf'外角等於內對角 $\angle BAD$。'),
        c.svg())


# ───────── 3. 由弧求內角 ─────────
def from_arc(m, b=92):
    a = R(m, 2)
    c, Pt, d = quad(a, b)
    c.arc(float(d['B']), float(d['D']), lab(m), color=BLUE_ARC, lab_at=float(d['C']) + 14)
    ang(c, Pt, 'C', '?')
    return with_figure(value(
        rf'如圖，四邊形 $ABCD$ 是圓內接四邊形，{A_("BCD")} $={m}^\circ$，$\angle BCD$ 是幾度？',
        180 - a,
        dpick(180 - a, [a, m, 360 - m, 180 - m if m < 180 else m - 180, R(360 - m, 4), 90 + R(m, 4)]),
        rf'$\angle A$ 對 {A_("BCD")}：$\angle A=\dfrac{{1}}{{2}}\times{m}^\circ={a}^\circ$。對角互補：$\angle BCD=180^\circ-{a}^\circ={180 - a}^\circ$。'
        rf'（也可以直接算 {A_("BAD")} $={360 - m}^\circ$ 的一半。）'),
        c.svg())


# ───────── 4. 由圓心角求對角 ─────────
def from_central(m, b=100):
    a = R(m, 2)
    c, Pt, d = quad(a, b, center=True, oat=away(float(d_mid(a, b))))
    c.rad(Pt['B'])
    c.rad(Pt['D'])
    c.angle(c.O, Pt['B'], Pt['D'], lab(m), r=15)
    ang(c, Pt, 'C', '?')
    return with_figure(value(
        rf'如圖，圓 $O$ 的內接四邊形 $ABCD$ 中，$\angle BOD={m}^\circ$（$C$ 在 $\angle BOD$ 所對的弧上），$\angle BCD$ 是幾度？',
        180 - a,
        dpick(180 - a, [a, m, 180 - m, 360 - m]),
        rf'$\angle BAD$ 和 $\angle BOD$ 對同一段 {A_("BCD")}：$\angle BAD=\dfrac{{1}}{{2}}\times{m}^\circ={a}^\circ$。'
        rf'對角互補：$\angle BCD=180^\circ-{a}^\circ={180 - a}^\circ$。'),
        c.svg())


def d_mid(a, b, a0=200):
    """{BCD} 的中點角度（給圓心標籤找方向）。"""
    w, u, v, z = arcs_from(a, b)
    return a0 + w + (u + v) / 2


# ───────── 5. 對角的比 ─────────
def ratio(p, q, b=96):
    a = R(180 * p, p + q)
    cc = R(180 * q, p + q)
    c, Pt, _ = quad(a, b)
    ang(c, Pt, 'A', None)
    ang(c, Pt, 'C', '?')
    return with_figure(value(
        rf'如圖，四邊形 $ABCD$ 是圓內接四邊形，$\angle A:\angle C={p}:{q}$，$\angle C$ 是幾度？',
        cc,
        dpick(cc, [a, R(360 * q, p + q), 180 - R(360 * p, p + q) if p < q else R(90 * q, p + q), R(90 * q, p + q)]),
        rf'對角互補，$\angle A+\angle C=180^\circ$：$\angle C=180^\circ\times\dfrac{{{q}}}{{{p + q}}}={cc}^\circ$。'),
        c.svg())


# ───────── 6. 已知兩個鄰角，求第四個角 ─────────
def neighbor(a, b):
    c, Pt, _ = quad(a, b)
    ang(c, Pt, 'A', lab(a))
    ang(c, Pt, 'B', lab(b))
    ang(c, Pt, 'D', '?')
    return with_figure(value(
        rf'如圖，四邊形 $ABCD$ 是圓內接四邊形，$\angle A={a}^\circ$，$\angle B={b}^\circ$，$\angle D$ 是幾度？',
        180 - b,
        dpick(180 - b, [180 - a, 360 - a - b, b, a]),
        rf'$\angle B$、$\angle D$ 是一組對角：$\angle D=180^\circ-{b}^\circ={180 - b}^\circ$。$\angle A$ 的對角是 $\angle C={180 - a}^\circ$。'),
        c.svg())


# ───────── 7. 過圓外一點作切線 ─────────
def tangent_fig(r=3, dd=7.2, complete=True):
    c = Circ(r=r, oat=(-0.6, -1))
    Pp = c.pt('P', dd, 0, at=(1, 0))
    c.seg(c.O, Pp)
    if not complete:
        return c.svg()
    Q = c.f.pt('Q', dd / 2, 0, True, (0.2, -1))
    c.f.dot(Q, 0.08)
    qr = dd / 2
    pts = [P('', dd / 2 + qr * cos(2 * PI * i / 72), qr * sin(2 * PI * i / 72)) for i in range(73)]
    for a_, b_ in zip(pts, pts[1:]):
        c.seg(a_, b_, dash=True, color='#6b6b6b', width=1.2)
    (mx, my), (nx, ny) = tangent_pts(r, dd)
    M = c.pt('M', mx, my, at=(-0.2, 1))
    N = c.pt('N', nx, ny, at=(-0.2, -1))
    c.rad(M)
    c.rad(N)
    for T in (M, N):
        ex = P('', T.x + (T.x - dd) * 0.25, T.y + T.y * 0.25)
        c.seg(Pp, ex)
    c.right(M, c.O, Pp)
    return c.svg()


def tangent(kind):
    if kind == 'why90':
        stem = r'如圖，過圓 $O$ 外一點 $P$ 作切線：以 $\overline{OP}$ 為直徑作圓 $Q$，交圓 $O$ 於 $M$、$N$。為什麼 $\angle OMP=90^\circ$？'
        opts = [(r'$\overline{OP}$ 是圓 $Q$ 的直徑，半圓所對的圓周角是直角', True),
                (r'$\overline{OM}=\overline{OP}$', False),
                (r'$\angle MOP=90^\circ$', False),
                (r'$\overline{PM}=\overline{PO}$', False)]
        expl = r'$M$ 在圓 $Q$ 上，$\overline{OP}$ 是圓 $Q$ 的直徑，所以 $\angle OMP$ 是半圓所對的圓周角，等於 $90^\circ$。'
    elif kind == 'step1':
        stem = r'如圖，要過圓 $O$ 外一點 $P$ 作圓 $O$ 的切線。連接 $\overline{OP}$ 之後，要以哪一條線段為直徑作圓？'
        opts = [(r'$\overline{OP}$', True), (r'圓 $O$ 的任一條半徑', False), (r'過 $P$ 且垂直 $\overline{OP}$ 的線段', False), (r'圓 $O$ 的任一條直徑', False)]
        expl = r'以 $\overline{OP}$ 為直徑作圓 $Q$（$Q$ 是 $\overline{OP}$ 的中點），和圓 $O$ 的交點 $M$、$N$ 就是切點：$\angle OMP=\angle ONP=90^\circ$。'
    else:
        stem = r'如圖，以 $\overline{OP}$ 為直徑作圓 $Q$，交圓 $O$ 於 $M$。為什麼直線 $PM$ 是圓 $O$ 的切線？'
        opts = [(r'$\overline{PM}$ 垂直半徑 $\overline{OM}$，而且 $M$ 在圓 $O$ 上', True),
                (r'直線 $PM$ 通過圓心 $O$', False),
                (r'$\overline{PM}=\overline{OP}$', False),
                (r'$M$ 是 $\overline{OP}$ 的中點', False)]
        expl = r'$\angle OMP=90^\circ$（半圓所對的圓周角），所以 $\overline{PM}\perp\overline{OM}$；直線垂直半徑而且通過圓上的點 $M$，就是切線。'
    return with_figure(statement(stem, opts, expl), tangent_fig(complete=(kind != 'step1')))


# ───────── 8. 對角線分角，再用對角互補 ─────────
def diagonal(p, q, b=90):
    c, Pt, _ = quad(p + q, b, v=2 * q)
    c.seg(Pt['A'], Pt['C'])
    c.angle(Pt['A'], Pt['B'], Pt['C'], lab(p), r=30)
    c.angle(Pt['A'], Pt['C'], Pt['D'], lab(q), r=20)
    ang(c, Pt, 'C', '?')
    ans = 180 - p - q
    return with_figure(value(
        rf'如圖，四邊形 $ABCD$ 是圓內接四邊形，$\angle BAC={p}^\circ$，$\angle CAD={q}^\circ$，$\angle BCD$ 是幾度？',
        ans,
        dpick(ans, [p + q, 180 - p, 180 - q, 2 * (p + q)]),
        rf'$\angle BAD=\angle BAC+\angle CAD={p + q}^\circ$。對角互補：$\angle BCD=180^\circ-{p + q}^\circ={ans}^\circ$。'),
        c.svg())


# ───────── 9. 由弧求外角 ─────────
def arc_exterior(u, v, b=95):
    a = R(u + v, 2)
    c, Pt, d = quad(a, b, v=v)
    E = extend(c, Pt['D'], Pt['C'], 'E')
    c.arc(float(d['B']), float(d['C']), lab(u), color=BLUE_ARC)
    c.arc(float(d['C']), float(d['D']), lab(v), color=BLUE_ARC)
    c.angle(Pt['C'], Pt['B'], E, '?', r=18)
    return with_figure(value(
        rf'如圖，四邊形 $ABCD$ 是圓內接四邊形，{A_("BC")} $={u}^\circ$，{A_("CD")} $={v}^\circ$，延長 $\overline{{DC}}$ 到 $E$，$\angle BCE$ 是幾度？',
        a,
        dpick(a, [u + v, 180 - a, R(u, 2), R(v, 2) + u]),
        rf'外角等於內對角：$\angle BCE=\angle BAD$。$\angle BAD$ 對 {A_("BCD")} $={u}^\circ+{v}^\circ={u + v}^\circ$，'
        rf'$\angle BCE=\dfrac{{1}}{{2}}\times{u + v}^\circ={a}^\circ$。'),
        c.svg())


# ───────── 10. 判斷：對角互補、外角 ─────────
def judge(a, b=95):
    c, Pt, _ = quad(a, b)
    ang(c, Pt, 'A', lab(a))
    return with_figure(statement(
        rf'如圖，四邊形 $ABCD$ 是圓內接四邊形，$\angle A={a}^\circ$。下列何者正確？',
        [(rf'$\angle C={180 - a}^\circ$', True),
         (rf'$\angle C={a}^\circ$', False),
         (rf'$\angle C$ 的外角是 ${180 - a}^\circ$', False),
         (r'$\angle A+\angle C=360^\circ$', False)],
        rf'對角互補：$\angle C=180^\circ-{a}^\circ={180 - a}^\circ$；$\angle C$ 的外角 $=180^\circ-\angle C={a}^\circ$，等於內對角 $\angle A$。'),
        c.svg())


SLOTS = [
    slot(1, '圓內接四邊形對角互補', [opposite(70), opposite(104, 80), opposite(83, 100)]),
    slot(2, '外角等於內對角', [exterior(115), exterior(76, 95), exterior(98)]),
    slot(3, '由弧的度數求內角', [from_arc(220), from_arc(150, 85), from_arc(196, 100)]),
    slot(4, '由圓心角求對角', [from_central(140), from_central(110, 95), from_central(160, 90)]),
    slot(5, '對角的比', [ratio(2, 3), ratio(4, 5), ratio(7, 3, 70)]),
    slot(6, '已知兩角求第四個角', [neighbor(70, 95), neighbor(110, 82), neighbor(85, 104)]),
    slot(7, '過圓外一點作切線：步驟與理由', [tangent('why90'), tangent('step1'), tangent('why_tangent')]),
    slot(8, '對角線分角後用對角互補', [diagonal(40, 35), diagonal(30, 55, 100), diagonal(45, 50, 85)]),
    slot(9, '由兩段弧求外角', [arc_exterior(80, 100), arc_exterior(70, 120, 90), arc_exterior(96, 64, 100)]),
    slot(10, '判斷：對角互補與外角', [judge(64), judge(115, 85), judge(88, 100)]),
]

if __name__ == '__main__':
    export('g9-2-2d', '2-2 圓心角、圓周角與弧（4）圓內接四邊形 課後檢核', '依課本 2-2 p.120–123（圓內接四邊形對角互補、例 8 外角、隨堂、過圓外一點作切線、自我檢核）自編換數字題', SLOTS)
