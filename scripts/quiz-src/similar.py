r"""九年級 1-4 題庫共用：數字寫法、兩個相似三角形的附圖（對應高、對應邊）。"""
from sympy import Rational, nsimplify

from geom import BLUE, PEACH, Fig, num
from quizlib import raw

R = Rational


def q(x):
    """把題目裡的數字（可能是小數字串）變成精確的有理數。"""
    return nsimplify(str(x), rational=True)


def tex(v):
    """有理數的寫法：整數、有限小數，其餘寫成分數。"""
    v = nsimplify(v, rational=True)
    if v.q == 1:
        return str(v.p)
    d = v.q
    while d % 2 == 0:
        d //= 2
    while d % 5 == 0:
        d //= 5
    if d == 1:
        return num(float(v))
    return rf'$\dfrac{{{v.p}}}{{{v.q}}}$'


def qty(v, unit=''):
    t = tex(v)
    return raw(f'{t} {unit}'.strip(), v)


def tri_pair(ratio, base=(6.0, 0.0), apex=(2.2, 3.4), names=('A', 'B', 'C', 'D', 'E', 'F'), fill=BLUE, height=None):
    """兩個相似三角形（右邊的縮放 ratio 倍），回傳 (Fig, 左三點, 右三點, 高的垂足)。
    左：B=(0,0)、C=base、A=apex；右邊照同樣形狀縮放，放在右側。"""
    f = Fig(460, 230)
    a, b, c, d, e, g = names
    B = f.pt(b, 0, 0, at=(-1, -0.5))
    C = f.pt(c, *base, at=(1, -0.5))
    A = f.pt(a, *apex, at=(0, 1))
    off = base[0] + 1.6 + 0.6 * max(1.0, float(ratio))
    E = f.pt(e, off, 0, at=(-1, -0.5))
    F = f.pt(g, off + base[0] * ratio, base[1] * ratio, at=(1, -0.5))
    D = f.pt(d, off + apex[0] * ratio, apex[1] * ratio, at=(0, 1))
    f.poly([A, B, C], fill=fill)
    f.poly([D, E, F], fill=fill)
    return f, (A, B, C), (D, E, F)


def _centroid(*ps):
    return sum(p.x for p in ps) / len(ps), sum(p.y for p in ps) / len(ps)


def heights_fig(ratio, labels, names=('A', 'B', 'C', 'D', 'E', 'F'), foot=('P', 'Q'), fill=BLUE):
    """兩個相似三角形，左邊高 A→P、右邊高 D→Q（垂足名稱 foot）。
    labels 的鍵：h1／h2（兩個高）、base1／base2（底 BC、EF）、side1／side2（AB、DE）、area1／area2（面積，寫在三角形裡）。"""
    f, (A, B, C), (D, E, F) = tri_pair(ratio, apex=(1.5, 3.3), names=names, fill=fill)
    Pp = f.pt(foot[0], A.x, 0, at=(0.25, -1))
    Q = f.pt(foot[1], D.x, 0, at=(0.25, -1))
    f.seg(A, Pp)
    f.seg(D, Q)
    f.right(Pp, A, C)
    f.right(Q, D, F)
    _labels(f, labels, (A, B, C), (D, E, F), {'h1': (A, Pp, B), 'h2': (D, Q, E)})
    return f.svg()


def sides_fig(ratio, labels, fill=PEACH):
    """兩個相似三角形（沒有高）。labels 的鍵：side1／side2（AB、DE）、base1／base2（BC、EF）、third1／third2（AC、DF）、area1／area2。"""
    f, L, Rt = tri_pair(ratio, base=(6.0, 0.0), apex=(1.6, 3.0), fill=fill)
    _labels(f, labels, L, Rt, {})
    return f.svg()


def _labels(f, labels, L, Rt, extra):
    (A, B, C), (D, E, F) = L, Rt
    where = {'side1': (A, B, C), 'side2': (D, E, F), 'base1': (B, C, A), 'base2': (E, F, D), 'third1': (A, C, B), 'third2': (D, F, E), **extra}
    for key, text in labels.items():
        if key in where:
            u, v, away = where[key]
            f.side(u, v, text, away=away, offset=13 if key in ('h1', 'h2') else 14)
        elif key in ('area1', 'area2'):
            tri = L if key == 'area1' else Rt
            x, y = _centroid(*tri)
            # 有高的時候字放在高的右邊
            f.text(x + (0.55 if 'h1' in extra else 0) * (1 if key == 'area1' else (Rt[2].x - Rt[1].x) / 6), y - 0.15, text, 16, color='#8a2f0b')
