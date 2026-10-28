r"""八上 2-3 畢氏定理題庫共用：根式／分數的選項寫法，以及依題目數字畫的附圖（直角記號、邊長標在外側、題目問的那一段標「?」）。

附圖都用題目的同一組數字畫（比例照實際長度），點名用斜體、坐標平面附方格與坐標軸。
"""
from math import gcd, hypot, isqrt, sqrt as fsqrt

from sympy import Rational, factorint, sqrt

from geom import BLUE, INK, LILAC, PEACH, YELLOW, Fig, P, num
from quizlib import rad, raw

R = Rational


# ───────── 數字與選項 ─────────
def split(n):
    """√n ＝ c√m（m 沒有平方因數）。"""
    c, m = 1, 1
    for p, e in factorint(n).items():
        c *= p ** (e // 2)
        m *= p ** (e % 2)
    return c, m


def root(n, k=1, den=1):
    """k√n / den 的最簡根式選項（自動約分）。"""
    c, m = split(n)
    c *= k
    g = gcd(c, den)
    return rad(c // g, m, den // g)


def bad_root(n):
    """√n 原樣（不是最簡根式，值和答案可能相同）。"""
    c, m = split(n)
    return raw(rf'$\sqrt{{{n}}}$', sqrt(n), c == 1 and m == n)


def frac(v):
    """有理數：整數或分數（課本寫法，例如 60/13）。"""
    v = R(v)
    if v.q == 1:
        return raw(f'${v.p}$', v)
    s = '-' if v < 0 else ''
    return raw(rf'${s}\dfrac{{{abs(v.p)}}}{{{v.q}}}$', v)


def dec(v):
    """小數答案（題目數字是小數時）。"""
    v = R(v)
    return raw(f'${num(float(v))}$', v)


def ftex(v):
    """說明文字裡的有理數。"""
    v = R(v)
    return str(v.p) if v.q == 1 else rf'\dfrac{{{v.p}}}{{{v.q}}}'


def rtex(n):
    """說明文字裡的 √n（化成最簡）。"""
    c, m = split(n)
    if m == 1:
        return str(c)
    return (str(c) if c != 1 else '') + rf'\sqrt{{{m}}}'


def lab(n):
    """附圖上的長度文字：√n（化簡）或整數。"""
    c, m = split(n)
    if m == 1:
        return str(c)
    return (str(c) if c != 1 else '') + f'√{m}'


# ───────── 附圖 ─────────
class PFig(Fig):
    """geom.Fig 加上實心點。"""

    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.dots = []

    def dot(self, p, color=INK):
        self.dots.append((p, color))

    def svg(self):
        s = super().svg()
        extra = ''.join(f'<circle cx="{self.tx(p)[0]:.1f}" cy="{self.tx(p)[1]:.1f}" r="3.6" fill="{c}"/>' for p, c in self.dots)
        return s.replace('</svg>', extra + '</svg>')


def _apex(a, b, da, db, side):
    """以 ab 為斜邊、到 a 距離 da、到 b 距離 db 的直角頂點；side＝+1 在 a→b 的左側。"""
    c = hypot(b.x - a.x, b.y - a.y)
    t, h = da * da / c, da * db / c
    ux, uy = (b.x - a.x) / c, (b.y - a.y) / c
    return a.x + ux * t - side * uy * h, a.y + uy * t + side * ux * h


def right_tri(h_len, v_len, labels, names=('C', 'B', 'A'), corner='bl', fill=PEACH, w=380, hgt=230):
    """直角三角形：直角頂點 names[0]，水平股（長 h_len）的另一端 names[1]，鉛垂股（長 v_len）的另一端 names[2]。
    corner：直角在左下 'bl'、右下 'br'、左上 'tl'、右上 'tr'。labels＝(水平股, 鉛垂股, 斜邊) 的文字。"""
    sx = 1 if corner in ('bl', 'tl') else -1
    sy = 1 if corner in ('bl', 'br') else -1
    f = PFig(w, hgt)
    Cc = f.pt(names[0], 0, 0, bool(names[0]), at=(-sx, -sy))
    B = f.pt(names[1], sx * h_len, 0, bool(names[1]), at=(sx, -sy * 0.6))
    A = f.pt(names[2], 0, sy * v_len, bool(names[2]), at=(-sx * 0.6, sy))
    f.poly([Cc, B, A], fill=fill)
    f.right(Cc, B, A)
    f.side(Cc, B, labels[0], away=A)
    f.side(Cc, A, labels[1], away=B)
    f.side(A, B, labels[2], away=Cc)
    return f.svg()


def hyp_bottom(c, left, right, labels, names=('B', 'C', 'A'), foot=None, h_label=None, fill=PEACH, w=400, hgt=230):
    """斜邊 c 水平放在下面（names[0] 左、names[1] 右），直角頂點 names[2] 在上方；左股 left、右股 right。
    labels＝(斜邊, 左股, 右股)；foot 給垂足名稱時畫斜邊上的高（h_label 是高的標籤）。"""
    f = PFig(w, hgt)
    B = f.pt(names[0], 0, 0, bool(names[0]), at=(-1, -0.5))
    Cc = f.pt(names[1], c, 0, bool(names[1]), at=(1, -0.5))
    ax, ay = _apex(P('', 0, 0), P('', c, 0), left, right, 1)
    A = f.pt(names[2], ax, ay, bool(names[2]), at=(0, 1))
    f.poly([B, Cc, A], fill=fill)
    f.right(A, B, Cc)
    # 有垂足時，斜邊的標籤放在離垂足遠的那一側，不和垂足名稱重疊
    t = 0.5 if foot is None else (0.25 if ax > c / 2 else 0.75)
    f.side(B, Cc, labels[0], away=A, t=t)
    f.side(B, A, labels[1], away=Cc)
    f.side(Cc, A, labels[2], away=B)
    if foot is not None:
        D = f.pt(foot, ax, 0, bool(foot), at=(0.3, -1))
        f.seg(A, D, dash=True, color='#c0392b')
        f.right(D, Cc, A, 7)
        if h_label:
            f.side(A, D, h_label, away=Cc, color='#c0392b', t=0.5)
    return f.svg()


def squares_fig(h_len, v_len, texts, w=420, hgt=280):
    """直角三角形三邊向外作正方形。C 直角在原點，水平股 BC＝h_len、鉛垂股 AC＝v_len。
    texts＝(鉛垂股上的正方形, 水平股上的正方形, 斜邊上的正方形) 的文字。"""
    a, b = h_len, v_len
    f = PFig(w, hgt)
    Cc = f.pt('C', 0, 0, at=(-1, -1))
    B = f.pt('B', a, 0, at=(1, -0.7))
    A = f.pt('A', 0, b, at=(-0.7, 1))
    s1 = [Cc, A, f.pt('', -b, b, False), f.pt('', -b, 0, False)]
    s2 = [Cc, B, f.pt('', a, -a, False), f.pt('', 0, -a, False)]
    s3 = [A, B, f.pt('', a + b, a, False), f.pt('', b, a + b, False)]
    f.poly(s1, fill=BLUE)
    f.poly(s2, fill=YELLOW)
    f.poly(s3, fill=LILAC)
    f.poly([Cc, B, A], fill='#ffffff')
    f.right(Cc, B, A, 8)
    # 小正方形放不下文字時，標在正方形外側
    if b < 0.5 * a:
        f.pt('', -b - 0.45 * (a + b), b / 2, False)
        f.text(-b - 0.06 * (a + b), b / 2, texts[0], 16, anchor='end')
    else:
        f.text(-b / 2, b / 2, texts[0], 16)
    if a < 0.5 * b:
        f.pt('', a / 2, -a - 0.3 * (a + b), False)
        f.text(a / 2, -a - 0.12 * (a + b), texts[1], 16)
    else:
        f.text(a / 2, -a / 2, texts[1], 16)
    f.text((a + b) / 2, (a + b) / 2, texts[2], 16)
    return f.svg()


def ladder_fig(L, base, labels, second=None, w=380, hgt=260):
    """梯子（竹竿）斜靠牆：牆在右邊，底端離牆腳 base。labels＝(梯長, 離牆, 高)。
    second＝(新底距, 新高, 新標籤)：下滑後的位置（虛線）。"""
    top = fsqrt(L * L - base * base)
    f = PFig(w, hgt)
    V = f.pt('', 0, 0, False)
    T = f.pt('', 0, top, False)
    Fo = f.pt('', -base, 0, False)
    far = P('', 50, top / 2)
    span = max(base, second[0] if second else 0)
    wall = [V, f.pt('', 0.08 * L, 0, False), f.pt('', 0.08 * L, top * 1.08, False), f.pt('', 0, top * 1.08, False)]
    f.ground(-span - 0.1 * L, 0.08 * L)
    f.poly(wall, fill='#e8d3c6')
    f.seg(Fo, T, width=3.2, color='#9a7b3c')
    f.right(V, Fo, T, 8)
    f.side(Fo, T, labels[0], away=V)
    f.side(Fo, V, labels[1], away=T)
    f.pt('', 0.08 * L + 0.12 * L, top / 2, False)  # 牆的右邊留位置給高的標籤
    f.text(0.12 * L, top / 2, labels[2], 15, anchor='start')
    if second:
        b2, t2, l2 = second
        T2 = f.pt('', 0, t2, False)
        F2 = f.pt('', -b2, 0, False)
        f.seg(F2, T2, width=2.6, color='#9a7b3c', dash=True)
        f.side(T2, T, l2[0], away=far, color='#c0392b')
        f.side(F2, Fo, l2[1], away=T, color='#c0392b', offset=26)
    return f.svg()


def cup_fig(r, h, rod, labels, w=300, hgt=280):
    """直圓柱杯的側面：玻棒從杯蓋中心插到杯底邊緣。labels＝(半徑, 高, 杯內長, 露出)。"""
    f = PFig(w, hgt)
    BL = f.pt('', 0, 0, False)
    BR = f.pt('', 2 * r, 0, False)
    TR = f.pt('', 2 * r, h, False)
    TL = f.pt('', 0, h, False)
    TC = f.pt('', r, h, False)
    inside = hypot(r, h)
    E = f.pt('', r * rod / inside, h * rod / inside, False)
    f.poly([BL, BR, TR, TL], fill='#e8f1fb')
    f.poly([BL, TL, TC], fill=PEACH)
    f.right(TL, BL, TC, 8)
    f.seg(BL, E, width=3.4, color='#2f80ed')
    f.side(TL, TC, labels[0], away=BL)
    f.side(BL, TL, labels[1], away=BR)
    f.side(BL, TC, labels[2], away=TL, color='#1d4fa3')
    f.side(TC, E, labels[3], away=TR, color='#c0392b')
    return f.svg()


def rect_fig(wd, ht, labels, w=360, hgt=230):
    """長方形與對角線。labels＝(長, 寬, 對角線)。"""
    f = PFig(w, hgt)
    A = f.pt('A', 0, ht, at=(-1, 1))
    B = f.pt('B', wd, ht, at=(1, 1))
    Cc = f.pt('C', wd, 0, at=(1, -1))
    D = f.pt('D', 0, 0, at=(-1, -1))
    f.poly([A, B, Cc, D], fill=BLUE)
    f.seg(D, B, width=2.2, color='#c0392b')
    f.right(Cc, D, B, 8)
    f.side(D, Cc, labels[0], away=A)
    f.side(Cc, B, labels[1], away=D)
    f.side(D, B, labels[2], away=Cc, color='#c0392b', t=0.42)
    return f.svg()


def square_mid_fig(side, labels, w=300, hgt=280):
    """正方形 ABCD（A 左上、B 右上、C 右下、D 左下），E 是 AB 的中點，畫 DE 與 BD。labels＝(邊長, DE, BD)。"""
    f = PFig(w, hgt)
    A = f.pt('A', 0, side, at=(-1, 1))
    B = f.pt('B', side, side, at=(1, 1))
    Cc = f.pt('C', side, 0, at=(1, -1))
    D = f.pt('D', 0, 0, at=(-1, -1))
    E = f.pt('E', side / 2, side, at=(0, 1))
    f.poly([A, B, Cc, D], fill=BLUE)
    f.seg(D, E, width=2.2, color='#d2541b')
    f.seg(D, B, width=2.2, color='#5a3fd6')
    f.ticks(A, E, 1)
    f.ticks(E, B, 1)
    f.right(A, D, B, 8)
    f.side(D, Cc, labels[0], away=A)
    if labels[1]:
        f.side(D, E, labels[1], away=B, color='#d2541b', t=0.55)
    if labels[2]:
        f.side(D, B, labels[2], away=Cc, color='#5a3fd6', t=0.62)
    return f.svg()


def quad_shared(ac, bc, bd, labels, w=400, hgt=260):
    """課本例 3 的形狀：C 左上（直角）、A 在 C 下方、B 在 C 右方，D 在 AB 另一側（∠D 直角）。labels＝(AC, BC, BD, AD)。"""
    ad = fsqrt(ac * ac + bc * bc - bd * bd)
    f = PFig(w, hgt)
    A = f.pt('A', 0, 0, at=(-1, -0.3))
    Cc = f.pt('C', 0, ac, at=(-1, 1))
    B = f.pt('B', bc, ac, at=(1, 1))
    dx, dy = _apex(A, B, ad, bd, -1)
    D = f.pt('D', dx, dy, at=(0.5, -1))
    f.poly([A, Cc, B], fill=PEACH)
    f.poly([A, B, D], fill=BLUE)
    f.right(Cc, A, B, 8)
    f.right(D, A, B, 8)
    f.side(A, Cc, labels[0], away=B)
    f.side(Cc, B, labels[1], away=A)
    f.side(B, D, labels[2], away=A)
    f.side(A, D, labels[3], away=B)
    return f.svg()


def quad_kite(ab, ad, bc, labels, w=380, hgt=260):
    """課本例 3 隨堂的形狀：∠A＝∠C＝90°，A 左上、B 在 A 下方偏右、D 在 A 右上，C 在 BD 另一側。labels＝(AB, AD, BC, CD)。"""
    cd = fsqrt(ab * ab + ad * ad - bc * bc)
    ux, uy = 0.3, -fsqrt(1 - 0.09)
    f = PFig(w, hgt)
    A = f.pt('A', 0, 0, at=(-1, 0.3))
    B = f.pt('B', ux * ab, uy * ab, at=(-1, -0.6))
    D = f.pt('D', -uy * ad, ux * ad, at=(1, 0.6))
    cx, cy = _apex(B, D, bc, cd, -1)
    Cc = f.pt('C', cx, cy, at=(1, -0.6))
    f.poly([A, B, D], fill=PEACH)
    f.poly([B, Cc, D], fill=BLUE)
    f.right(A, B, D, 8)
    f.right(Cc, B, D, 8)
    f.side(A, B, labels[0], away=D)
    f.side(A, D, labels[1], away=B)
    f.side(B, Cc, labels[2], away=D)
    f.side(Cc, D, labels[3], away=B)
    return f.svg()


def plane_fig(points, segs=(), dashed=(), xr=None, yr=None, right=None, side_labels=(), w=380, hgt=300, extra=None):
    """坐標平面：points＝[(名稱, x, y, 標籤方向 'r'|'l'|'u'|'d')]；segs／dashed＝[(名稱1, 名稱2)]；
    right＝(頂點, 點1, 點2) 畫直角記號；side_labels＝[(名稱1, 名稱2, 文字, 遠離的名稱)]。"""
    xs = [p[1] for p in points] + [0]
    ys = [p[2] for p in points] + [0]
    # 原點四周至少留 2 格，坐標軸的 x、y、O 標籤才不會擠在一起
    xr = xr or (min(min(xs) - 1, -2), max(max(xs) + 1, 2))
    yr = yr or (min(min(ys) - 1, -2), max(max(ys) + 1, 2))
    f = PFig(w, hgt, pad=30)
    for x in range(xr[0], xr[1] + 1):
        f.seg(P('', x, yr[0]), P('', x, yr[1]), width=0.7, color='#dfe3ee')
    for y in range(yr[0], yr[1] + 1):
        f.seg(P('', xr[0], y), P('', xr[1], y), width=0.7, color='#dfe3ee')
    f.pt('', xr[0], yr[0], False)
    f.pt('', xr[1], yr[1], False)
    f.seg(P('', xr[0], 0), P('', xr[1], 0), width=1.3, color='#6b7394')
    f.seg(P('', 0, yr[0]), P('', 0, yr[1]), width=1.3, color='#6b7394')
    pts = {}
    busy = []  # 已經有東西的位置（點、點的標籤），坐標軸的 x、y、O 標籤要避開
    for name, x, y, d in points:
        p = P(name, x, y)
        pts[name] = p
        f.dot(p)
        busy.append((x, y))
        t = f'{name}({num(x).replace("-", "−")}, {num(y).replace("-", "−")})' if name else ''
        if t:
            dx, dy, anchor = {'r': (0.3, -0.12, 'start'), 'l': (-0.3, -0.12, 'end'), 'u': (0, 0.45, 'middle'), 'd': (0, -0.75, 'middle')}[d]
            f.text(x + dx, y + dy, t, 13, anchor=anchor)
            span = 0.22 * len(t)  # 標籤大約的寬度（格）
            cx = x + dx + (span / 2 if anchor == 'start' else -span / 2 if anchor == 'end' else 0)
            busy += [(cx - span / 2, y + dy), (cx, y + dy), (cx + span / 2, y + dy)]
    lines = []
    for a, b in segs:
        f.seg(pts[a], pts[b], width=2.2, color='#5a3fd6')
        lines.append((pts[a], pts[b]))
    for a, b in dashed:
        f.seg(pts[a], pts[b], width=1.8, color='#2f80ed', dash=True)
        lines.append((pts[a], pts[b]))

    def room(c):
        d = [hypot(c[0] - x, c[1] - y) for x, y in busy]
        for a, b in lines:
            vx, vy = b.x - a.x, b.y - a.y
            L2 = vx * vx + vy * vy or 1
            t = max(0, min(1, ((c[0] - a.x) * vx + (c[1] - a.y) * vy) / L2))
            d.append(hypot(c[0] - a.x - t * vx, c[1] - a.y - t * vy))
        return min(d + [99])

    for text, cands, size in (('x', [(xr[1] - 0.3, -0.5), (xr[1] - 0.3, 0.45)], 13),
                              ('y', [(-0.4, yr[1] - 0.4), (0.4, yr[1] - 0.4)], 13),
                              ('O', [(-0.5, -0.6), (0.5, -0.6), (-0.5, 0.55), (0.5, 0.55)], 12)):
        if text == 'O' and any(x == 0 and y == 0 for x, y in [(p[1], p[2]) for p in points if p[0]]):
            continue  # 有點就在原點（例如 A(0, 0)），不另外標 O
        c = max(cands, key=room)
        f.text(c[0], c[1], text, size, color='#6b7394')
        busy.append(c)
    if right:
        f.right(pts[right[0]], pts[right[1]], pts[right[2]], 8)
    for a, b, text, away in side_labels:
        f.side(pts[a], pts[b], text, away=pts[away], color='#c0392b')
    if extra:
        extra(f, pts)
    return f.svg()


def general_fig(names=('A', 'B', 'C'), coords=(('x₁', 'y₁'), ('x₂', 'y₂'), ('x₁', 'y₂')), w=360, hgt=230):
    """兩點距離公式的一般圖：A 左上、B 右下、C 是直角頂點（A 正下方）。"""
    f = PFig(w, hgt)
    A = f.pt('', 0, 3, False)
    B = f.pt('', 6, 0, False)
    Cc = f.pt('', 0, 0, False)
    f.poly([A, B, Cc], fill=PEACH)
    f.right(Cc, A, B, 8)
    for p, n, (cx, cy), d in ((A, names[0], coords[0], (0.2, 0.45)), (B, names[1], coords[1], (0, -0.6)), (Cc, names[2], coords[2], (-0.2, -0.6))):
        f.dot(p)
        f.text(p.x + d[0], p.y + d[1], f'{n}({cx}, {cy})', 13)
    return f.svg()


def origin_fig(x, y, name='P', w=320, hgt=260):
    """點 P(x, y) 與原點 O：畫出到兩軸的垂直虛線（P 的坐標以文字表示時 x、y 傳字串）。"""
    return plane_fig([(name, x, y, 'r' if x >= 0 else 'l'), ('', 0, 0, 'r')], segs=[(name, '')], w=w, hgt=hgt,
                     xr=(min(x, 0) - (2 if x < 0 else 3), max(x, 0) + (3 if x < 0 else 2)),
                     yr=(min(y, 0) - (2 if y < 0 else 3), max(y, 0) + (3 if y < 0 else 2)),
                     extra=lambda f, pts: (f.seg(pts[name], P('', x, 0), dash=True, color='#2f80ed'), f.seg(P('', x, 0), P('', 0, 0), dash=True, color='#2f80ed')))
