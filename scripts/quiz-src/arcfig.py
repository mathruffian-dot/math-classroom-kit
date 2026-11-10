r"""九上 2-2 題庫共用：圓心角、圓周角與弧的附圖（以 circlefig.CFig 為底）與角度選項。

點用「圓上的角度」放（數學座標，逆時針），弧與角都照題目的度數畫；標籤往圓外放。
    c = Circ()
    A, B = c.p('A', 200), c.p('B', 340)
    c.chord(A, B)
    c.arc(200, 340, '140°')
    svg = c.svg()
"""
from math import cos, radians, sin, sqrt as fsqrt

from sympy import Rational, nsimplify

from circlefig import CFig, P, deg
from geom import ACCENT

R = Rational
BLUE_ARC = '#2f6fbf'


class Circ:
    def __init__(self, r=5, W=440, H=260, center=True, oname='O', oat=(0.9, -0.9), pad=46):
        self.f = CFig(W, H, pad=pad)
        self.r = r
        self.center = center
        self.O = self.f.pt(oname if center else '', 0, 0, center and bool(oname), at=oat) if center else P('', 0, 0)
        self.f.circle(self.O, r)

    # ───────── 點 ─────────
    def at(self, d, rr=None):
        rr = self.r if rr is None else rr
        return P('', rr * cos(radians(d)), rr * sin(radians(d)))

    def p(self, name, d, label=True, at=None):
        """圓上角度 d 的點，標籤預設往圓外。"""
        q = self.at(d)
        return self.f.pt(name, q.x, q.y, label and bool(name), at or (cos(radians(d)), sin(radians(d))))

    def pt(self, name, x, y, at=None):
        return self.f.pt(name, x, y, bool(name), at)

    # ───────── 線、弧、角 ─────────
    def seg(self, a, b, dash=False, color=None, width=1.6):
        if color:
            self.f.seg(a, b, dash, width, color)
        else:
            self.f.seg(a, b, dash, width)

    def rad(self, a, dash=False):
        self.f.seg(self.O, a, dash)

    def arc(self, d0, d1, label=None, color=ACCENT, lab_at=None, lab_r=1.22, size=15):
        """從角度 d0 逆時針描到 d1 的弧；label 放在弧的中間（lab_at 指定角度）往外。"""
        if d1 < d0:
            d1 += 360
        self.f.arc_line(self.O, self.r, d0, d1, color=color, width=3.2, n=max(6, int((d1 - d0) / 5)))
        if label:
            m = self.at(lab_at if lab_at is not None else (d0 + d1) / 2, self.r * lab_r)
            self.f.text(m.x, m.y, label, size, color=color)

    def angle(self, v, a, b, label=None, r=20, color='#1b1b1b'):
        self.f.arc(v, a, b, label, r=r, color=color)

    def right(self, v, a, b):
        self.f.right(v, a, b)

    def text(self, x, y, s, size=15, color='#1b1b1b'):
        self.f.text(x, y, s, size, color=color)

    def svg(self):
        if self.center:
            self.f.dot(self.O, self.r * 0.03)
        return self.f.svg()


def away(d):
    """圓心 O 的標籤方向：和角度 d 的方向相反（避開圓心角的角弧與標籤）。"""
    return (cos(radians(d + 180)), sin(radians(d + 180)))


def dpick(correct, cands):
    """角度選項：正確答案＋依序取 3 個不同、在 0°～360° 之間的錯誤答案。"""
    correct = nsimplify(correct)
    out, seen = [deg(correct)], [correct]
    for c in cands:
        c = nsimplify(c)
        if 0 < c < 360 and c not in seen:
            out.append(deg(c))
            seen.append(c)
        if len(out) == 4:
            return out
    raise AssertionError(f'錯誤選項不夠：{correct} {cands}')


def lab(v):
    """附圖的角度標籤：整數寫 50°，其他寫小數。"""
    v = nsimplify(v)
    return f'{v}°' if v.q == 1 else f'{float(v):g}°'


def arc_tex(s):
    return rf'\overset{{\frown}}{{{s}}}'


def A_(s):
    r"""題幹裡的弧：$\overset{\frown}{AB}$。"""
    return f'${arc_tex(s)}$'


def tangent_pts(r, d):
    """圓 O（半徑 r）外一點 P(d, 0) 的兩個切點 M（上）、N（下）的座標。"""
    mx = r * r / d
    my = r * fsqrt(d * d - r * r) / d
    return (mx, my), (mx, -my)


__all__ = ['Circ', 'away', 'dpick', 'lab', 'arc_tex', 'A_', 'tangent_pts', 'R', 'deg', 'BLUE_ARC']
