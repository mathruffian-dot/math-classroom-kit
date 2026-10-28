r"""九上 2-1 題庫共用：圓的附圖（以 geom.Fig 為底，加上圓、扇形、弓形、圓弧）與含 π、根號的選項寫法。

圓用 72 邊形近似（單純 SVG polygon），四個極點登記成不標名字的點，讓圖自動縮放時把整個圓放進畫面。
    f = CFig()
    O = f.pt('O', 0, 0)
    f.circle(O, 5)
    A = f.on(O, 5, 30, 'A')
"""
from math import cos, pi as PI, radians, sin

from sympy import Rational, nsimplify, pi, simplify, sqrt

from geom import INK, P, Fig
from quizlib import raw

R = Rational
GREEN = '#e3f0c8'
SKY = '#d9ecf8'
ROSE = '#f9d8d3'


class CFig(Fig):
    def circle(self, c, r, fill=None, n=72):
        pts = [P('', c.x + r * cos(2 * PI * i / n), c.y + r * sin(2 * PI * i / n)) for i in range(n)]
        self.poly(pts, fill=fill)
        for dx, dy in ((r, 0), (-r, 0), (0, r), (0, -r)):
            self.pt('', c.x + dx, c.y + dy, False)

    def at(self, c, r, deg):
        """圓上（或圓外）角度 deg 的座標（不登記成點）。"""
        return P('', c.x + r * cos(radians(deg)), c.y + r * sin(radians(deg)))

    def on(self, c, r, deg, name='', label=True, at=None):
        p = self.at(c, r, deg)
        return self.pt(name, p.x, p.y, label and bool(name), at)

    def arcpts(self, c, r, a0, a1, n=36):
        return [self.at(c, r, a0 + (a1 - a0) * i / n) for i in range(n + 1)]

    def sector(self, c, r, a0, a1, fill=GREEN, stroke=False):
        self.poly([c] + self.arcpts(c, r, a0, a1), fill=fill, stroke=stroke)

    def bow(self, c, r, a0, a1, fill=SKY, stroke=False):
        self.poly(self.arcpts(c, r, a0, a1), fill=fill, stroke=stroke)

    def arc_line(self, c, r, a0, a1, color='#d2541b', width=3.2, n=24):
        pts = self.arcpts(c, r, a0, a1, n)
        for a, b in zip(pts, pts[1:]):
            self.seg(a, b, width=width, color=color)

    def dot(self, p, rr):
        """小黑點：半徑 rr（圖形單位）的實心 12 邊形。"""
        pts = [P('', p.x + rr * cos(2 * PI * i / 12), p.y + rr * sin(2 * PI * i / 12)) for i in range(12)]
        self.items.append((3, 'poly', (pts, INK, True)))
        return p


# ───────── 選項：a π ＋ b√m ＋ c 的寫法 ─────────
def _coef_tex(c, sym):
    c = nsimplify(c)
    if c.q == 1:
        body = ('' if abs(c.p) == 1 and sym else str(abs(c.p))) + sym
    else:
        body = rf'\dfrac{{{abs(c.p)}}}{{{c.q}}}{sym}'
    return ('-' if c < 0 else '+'), body


def etex(v):
    """把 aπ ＋ b√m ＋ c 寫成 LaTeX（不含 $）。"""
    v = nsimplify(simplify(v))
    a = simplify(v.coeff(pi))
    rest = simplify(v - a * pi)
    terms = []
    if a != 0:
        terms.append(_coef_tex(a, r'\pi'))
    rad_terms, const = [], 0
    for term, k in rest.as_coefficients_dict().items():
        if term == 1:
            const += k
        else:
            # term 是 sqrt(m)
            m = simplify(term**2)
            rad_terms.append((k, rf'\sqrt{{{m}}}'))
    for k, sym in rad_terms:
        terms.append(_coef_tex(k, sym))
    if const != 0 or not terms:
        terms.append(_coef_tex(const, '') if const != 0 else ('+', '0'))
    out = ''
    for i, (sg, body) in enumerate(terms):
        out += (('-' if sg == '-' else '') if i == 0 else sg) + body
    return out


def eopt(v, unit=''):
    """含 π／根號的選項。"""
    t = etex(v)
    return raw(f'${t}$' + (f' {unit}' if unit else ''), v)


def deg(v):
    return raw(rf'${etex(v)}^\circ$', v)


def ftext(v):
    """標籤用的數字文字（整數、小數、分數 a/b）。"""
    v = nsimplify(v)
    if v.q == 1:
        return str(v.p)
    f = float(v)
    if abs(f * 10 - round(f * 10)) < 1e-9:
        return f'{f:.1f}'
    return f'{v.p}/{v.q}'


def stext(v):
    """標籤用：含根號時寫成 2√3。"""
    v = nsimplify(v)
    if v.is_rational:
        return ftext(v)
    k, m = v.as_coeff_Mul()
    return f'{"" if k == 1 else k}√{simplify(m**2)}'


__all__ = ['CFig', 'P', 'INK', 'GREEN', 'SKY', 'ROSE', 'etex', 'eopt', 'deg', 'ftext', 'stext', 'R', 'pi', 'sqrt', 'simplify']
