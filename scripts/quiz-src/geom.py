r"""幾何題附圖：依題目的同一組數字畫 SVG（課本樣式：斜體點名、淺色填色、直角記號、邊長標在邊的外側）。

座標用數學座標（y 向上），輸出時自動縮放置中。
    f = Fig()
    A, B, C = f.pt('A', 0, 0), f.pt('B', 4, 3), f.pt('C', 4, 0)
    f.poly([A, B, C], fill=PEACH)
    f.right(C, A, B)            # C 點的直角記號
    f.side(A, B, '17')          # 邊長標在邊的外側（離圖形中心較遠的一側）
    svg = f.svg()
"""
from math import atan2, cos, hypot, sin

PEACH = '#fde3cf'
LILAC = '#e2d3ec'
BLUE = '#cfd8ee'
YELLOW = '#fbf3c4'
INK = '#1b1b1b'
ACCENT = '#d2541b'
SERIF = "'Times New Roman',Times,serif"
# 文字加白邊，壓到線也看得清楚
HALO = 'stroke="#ffffff" stroke-width="4" stroke-linejoin="round" paint-order="stroke"'
SANS = "'Noto Sans TC','Microsoft JhengHei',sans-serif"


class P:
    def __init__(self, name, x, y):
        self.name, self.x, self.y = name, float(x), float(y)


def lerp(a, b, t, name=''):
    return P(name, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)


def _unit(dx, dy):
    d = hypot(dx, dy) or 1
    return dx / d, dy / d


class Fig:
    def __init__(self, width=440, height=260, pad=44):
        self.W, self.H, self.pad = width, height, pad
        self.points = []
        self.labeled = []
        self.items = []  # (z, kind, data)

    # ───────── 元素 ─────────
    def pt(self, name, x, y, label=True, at=None):
        """點；label=False 不標名字；at=(dx, dy) 指定標籤方向（數學座標），預設離圖形中心遠的方向。"""
        p = P(name, x, y)
        self.points.append(p)
        if label and name:
            self.labeled.append(p)
            self.items.append((5, 'plabel', (p, at)))
        return p

    def poly(self, pts, fill=None, stroke=True):
        self.items.append((0, 'poly', (pts, fill, stroke)))

    def seg(self, a, b, dash=False, width=1.6, color=INK):
        self.items.append((1, 'seg', (a, b, dash, width, color)))

    def side(self, a, b, text, away=None, offset=14, color=INK, t=0.5):
        """邊長標籤：放在 ab 上（t＝0.5 是中點）、往遠離 away（預設全部點的中心）的那一側。"""
        self.items.append((4, 'side', (a, b, text, away, offset, color, t)))

    def dim(self, a, b, text, away=None, off=18, clear=0.0):
        """尺寸線：和 ab 平行、往遠離 away 的方向偏 off 像素（再加 clear 個圖形單位，例如樹冠的半徑），兩端有短線，標籤在外側。"""
        self.items.append((4, 'dim', (a, b, text, away, off, clear)))

    def right(self, v, a, b, size=9):
        """v 點的直角記號（v→a 與 v→b 兩個方向）。"""
        self.items.append((2, 'right', (v, a, b, size)))

    def arc(self, v, a, b, text=None, r=22, color=INK):
        """v 點的角弧，text 是角度標籤（例如 30°）。"""
        self.items.append((2, 'arc', (v, a, b, text, r, color)))

    def ticks(self, a, b, n=1):
        """等長記號：在 ab 中點畫 n 條短線。"""
        self.items.append((3, 'ticks', (a, b, n)))

    def text(self, x, y, s, size=15, anchor='middle', color=INK, font=SANS):
        self.items.append((6, 'text', (P('', x, y), s, size, anchor, color, font)))

    def ground(self, x0, x1, y=0):
        """地面線（細線＋斜紋）。"""
        self.items.append((1, 'ground', (x0, x1, y)))

    def person(self, foot, h):
        """簡單的人形（腳在 foot，身高 h）。"""
        self.items.append((1, 'person', (foot, h)))

    def tree(self, foot, h):
        self.items.append((1, 'tree', (foot, h)))

    def building(self, foot, h):
        """大樓（右下角在 foot，高 h）：往左畫，影子往右。"""
        self.items.append((1, 'building', (foot, h)))

    def flag(self, foot, h):
        """旗桿（腳在 foot，高 h），頂端一面小旗子。"""
        self.items.append((1, 'flag', (foot, h)))

    def sun(self, x, y):
        self.items.append((1, 'sun', (P('', x, y),)))

    # ───────── 輸出 ─────────
    def _fit(self):
        xs = [p.x for p in self.points]
        ys = [p.y for p in self.points]
        for z, kind, d in self.items:
            if kind == 'ground':
                xs += [d[0], d[1]]
                ys += [d[2]]
            if kind == 'sun':
                xs.append(d[0].x)
                ys.append(d[0].y)
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        w, h = (x1 - x0) or 1, (y1 - y0) or 1
        k = min((self.W - 2 * self.pad) / w, (self.H - 2 * self.pad) / h)
        ox = (self.W - k * w) / 2 - k * x0
        oy = (self.H + k * h) / 2 + k * y0
        self.k = k
        self.tx = lambda p: (ox + k * p.x, oy - k * p.y)
        ref = self.labeled or self.points
        cx = sum(p.x for p in ref) / len(ref)
        cy = sum(p.y for p in ref) / len(ref)
        self.center = P('', cx, cy)

    def svg(self):
        self._fit()
        out = []
        T = self.tx
        for z, kind, d in sorted(self.items, key=lambda it: it[0]):
            if kind == 'poly':
                pts, fill, stroke = d
                path = ' '.join(f'{T(p)[0]:.1f},{T(p)[1]:.1f}' for p in pts)
                out.append(f'<polygon points="{path}" fill="{fill or "none"}" stroke="{INK if stroke else "none"}" stroke-width="1.6" stroke-linejoin="round"/>')
            elif kind == 'seg':
                a, b, dash, width, color = d
                (x1, y1), (x2, y2) = T(a), T(b)
                da = ' stroke-dasharray="6 5"' if dash else ''
                out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{width}"{da}/>')
            elif kind == 'right':
                v, a, b, s = d
                (vx, vy), (ax, ay), (bx, by) = T(v), T(a), T(b)
                ux, uy = _unit(ax - vx, ay - vy)
                wx, wy = _unit(bx - vx, by - vy)
                p1 = (vx + ux * s, vy + uy * s)
                p2 = (vx + ux * s + wx * s, vy + uy * s + wy * s)
                p3 = (vx + wx * s, vy + wy * s)
                out.append(f'<polyline points="{p1[0]:.1f},{p1[1]:.1f} {p2[0]:.1f},{p2[1]:.1f} {p3[0]:.1f},{p3[1]:.1f}" fill="none" stroke="{INK}" stroke-width="1.3"/>')
            elif kind == 'arc':
                v, a, b, text, r, color = d
                (vx, vy), (ax, ay), (bx, by) = T(v), T(a), T(b)
                t1, t2 = atan2(ay - vy, ax - vx), atan2(by - vy, bx - vx)
                diff = (t2 - t1 + 6.283185307) % 6.283185307
                if diff > 3.14159265:
                    t1, t2, diff = t2, t1, 6.283185307 - diff
                sx, sy = vx + r * cos(t1), vy + r * sin(t1)
                ex, ey = vx + r * cos(t2), vy + r * sin(t2)
                out.append(f'<path d="M{sx:.1f},{sy:.1f} A{r},{r} 0 0 1 {ex:.1f},{ey:.1f}" fill="none" stroke="{color}" stroke-width="1.3"/>')
                if text:
                    tm = t1 + diff / 2
                    lr = r + 15
                    out.append(f'<text {HALO} x="{vx + lr * cos(tm):.1f}" y="{vy + lr * sin(tm) + 5:.1f}" font-family="{SANS}" font-size="14" text-anchor="middle" fill="{color}">{text}</text>')
            elif kind == 'ticks':
                a, b, n = d
                (x1, y1), (x2, y2) = T(a), T(b)
                mx, my = (x1 + x2) / 2, (y1 + y2) / 2
                ux, uy = _unit(x2 - x1, y2 - y1)
                nx, ny = -uy, ux
                for i in range(n):
                    o = (i - (n - 1) / 2) * 5
                    cx, cy = mx + ux * o, my + uy * o
                    out.append(f'<line x1="{cx - nx * 6:.1f}" y1="{cy - ny * 6:.1f}" x2="{cx + nx * 6:.1f}" y2="{cy + ny * 6:.1f}" stroke="{INK}" stroke-width="1.4"/>')
            elif kind == 'dim':
                a, b, text, away, off, clear = d
                away = away or self.center
                (x1, y1), (x2, y2) = T(a), T(b)
                (cx, cy) = T(away)
                ux, uy = _unit(x2 - x1, y2 - y1)
                nx, ny = -uy, ux
                mx, my = (x1 + x2) / 2, (y1 + y2) / 2
                if (mx - cx) * nx + (my - cy) * ny < 0:
                    nx, ny = -nx, -ny
                o = off + clear * self.k
                ax, ay, bx, by = x1 + nx * o, y1 + ny * o, x2 + nx * o, y2 + ny * o
                out.append(f'<g stroke="#6b6b6b" stroke-width="1.1"><line x1="{ax:.1f}" y1="{ay:.1f}" x2="{bx:.1f}" y2="{by:.1f}"/>'
                           f'<line x1="{ax - nx * 5:.1f}" y1="{ay - ny * 5:.1f}" x2="{ax + nx * 5:.1f}" y2="{ay + ny * 5:.1f}"/>'
                           f'<line x1="{bx - nx * 5:.1f}" y1="{by - ny * 5:.1f}" x2="{bx + nx * 5:.1f}" y2="{by + ny * 5:.1f}"/></g>')
                out.append(_label((ax + bx) / 2, (ay + by) / 2, nx, ny, text, 8))
            elif kind == 'side':
                a, b, text, away, off, color, tt = d
                away = away or self.center
                (x1, y1), (x2, y2) = T(a), T(b)
                (cx, cy) = T(away)
                mx, my = x1 + (x2 - x1) * tt, y1 + (y2 - y1) * tt
                ux, uy = _unit(x2 - x1, y2 - y1)
                nx, ny = -uy, ux
                if (mx - cx) * nx + (my - cy) * ny < 0:
                    nx, ny = -nx, -ny
                out.append(_label(mx, my, nx, ny, text, off, color))
            elif kind == 'plabel':
                p, at = d
                x, y = T(p)
                if at:
                    ux, uy = _unit(at[0], -at[1])
                else:
                    cx, cy = T(self.center)
                    ux, uy = _unit(x - cx, y - cy)
                    if ux == 0 and uy == 0:
                        uy = -1
                out.append(f'<text {HALO} x="{x + ux * 15:.1f}" y="{y + uy * 15 + 6:.1f}" font-family="{SERIF}" font-style="italic" font-size="18" text-anchor="middle" fill="{INK}">{p.name}</text>')
            elif kind == 'text':
                p, s, size, anchor, color, font = d
                x, y = T(p)
                out.append(f'<text {HALO} x="{x:.1f}" y="{y + 5:.1f}" font-family="{font}" font-size="{size}" text-anchor="{anchor}" fill="{color}">{s}</text>')
            elif kind == 'ground':
                x0, x1, y = d
                (ax, ay), (bx, _) = T(P('', x0, y)), T(P('', x1, y))
                out.append(f'<line x1="{ax - 12:.1f}" y1="{ay:.1f}" x2="{bx + 12:.1f}" y2="{ay:.1f}" stroke="#7a6a55" stroke-width="1.2"/>')
                n = int((bx - ax + 24) // 14)
                for i in range(n + 1):
                    gx = ax - 12 + i * 14
                    out.append(f'<line x1="{gx:.1f}" y1="{ay + 1:.1f}" x2="{gx - 6:.1f}" y2="{ay + 7:.1f}" stroke="#b5a68f" stroke-width="1"/>')
            elif kind == 'person':
                foot, h = d
                (fx, fy) = T(foot)
                ph = h * self.k
                hr = ph * 0.1
                head = fy - ph + hr
                out.append(f'<g stroke="#2f6f9f" stroke-width="2.4" stroke-linecap="round" fill="none"><circle cx="{fx:.1f}" cy="{head:.1f}" r="{hr:.1f}" fill="#cfe3f3"/>'
                           f'<line x1="{fx:.1f}" y1="{head + hr:.1f}" x2="{fx:.1f}" y2="{fy - ph * 0.42:.1f}"/>'
                           f'<line x1="{fx:.1f}" y1="{fy - ph * 0.42:.1f}" x2="{fx - ph * 0.12:.1f}" y2="{fy:.1f}"/><line x1="{fx:.1f}" y1="{fy - ph * 0.42:.1f}" x2="{fx + ph * 0.12:.1f}" y2="{fy:.1f}"/>'
                           f'<line x1="{fx - ph * 0.16:.1f}" y1="{fy - ph * 0.66:.1f}" x2="{fx + ph * 0.16:.1f}" y2="{fy - ph * 0.66:.1f}"/></g>')
            elif kind == 'tree':
                foot, h = d
                (fx, fy) = T(foot)
                ph = h * self.k
                out.append(f'<g><rect x="{fx - ph * 0.04:.1f}" y="{fy - ph * 0.45:.1f}" width="{ph * 0.08:.1f}" height="{ph * 0.45:.1f}" fill="#8a5a33"/>'
                           f'<ellipse cx="{fx:.1f}" cy="{fy - ph * 0.68:.1f}" rx="{ph * 0.22:.1f}" ry="{ph * 0.32:.1f}" fill="#7cb46b" stroke="#4f8a43" stroke-width="1.2"/></g>')
            elif kind == 'building':
                foot, h = d
                (fx, fy) = T(foot)
                ph = h * self.k
                bw = max(26, ph * 0.32)
                win = ''.join(f'<rect x="{fx - bw + 5 + c * (bw - 10) / 2:.1f}" y="{fy - ph + 6 + r * 14:.1f}" width="{(bw - 10) / 2 - 4:.1f}" height="8" fill="#dbe7f3"/>'
                              for r in range(int((ph - 12) // 14)) for c in range(2))
                out.append(f'<g><rect x="{fx - bw:.1f}" y="{fy - ph:.1f}" width="{bw:.1f}" height="{ph:.1f}" fill="#b9c3cf" stroke="#6d7886" stroke-width="1.2"/>{win}</g>')
            elif kind == 'flag':
                foot, h = d
                (fx, fy) = T(foot)
                ph = h * self.k
                out.append(f'<g><line x1="{fx:.1f}" y1="{fy:.1f}" x2="{fx:.1f}" y2="{fy - ph:.1f}" stroke="#666" stroke-width="3"/>'
                           f'<polygon points="{fx:.1f},{fy - ph:.1f} {fx - 30:.1f},{fy - ph + 9:.1f} {fx:.1f},{fy - ph + 18:.1f}" fill="#e2483d"/></g>')
            elif kind == 'sun':
                (p,) = d
                x, y = T(p)
                out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="11" fill="#ffd35a" stroke="#e8a317" stroke-width="1.5"/>')
        body = ''.join(out)
        return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.W} {self.H}" width="{self.W}" height="{self.H}"><rect width="100%" height="100%" fill="#ffffff"/>{body}</svg>'


def _label(mx, my, nx, ny, text, off, color=INK):
    """標籤放在 (mx, my) 往 (nx, ny) 偏 off 的地方；直的邊用靠左／靠右對齊，字才不會壓到線。"""
    if not text:
        return ''
    if abs(nx) > 0.75:
        anchor = 'start' if nx > 0 else 'end'
        lx, ly = mx + nx * min(off, 9), my + ny * min(off, 9)
    else:
        anchor = 'middle'
        lx, ly = mx + nx * off, my + ny * off
    return f'<text {HALO} x="{lx:.1f}" y="{ly + 5:.1f}" font-family="{SANS}" font-size="15" text-anchor="{anchor}" fill="{color}" font-weight="600">{text}</text>'


def num(x):
    """數字標籤：整數不帶小數點，其餘去掉多餘的 0。"""
    x = float(x)
    if abs(x - round(x)) < 1e-9:
        return str(int(round(x)))
    return f'{x:.4f}'.rstrip('0').rstrip('.')
