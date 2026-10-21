r"""1-4 相似三角形的應用（2）面積與邊長、中點連線：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一，每題附圖）。

用法：python -X utf8 scripts/quiz-src/g9-1-4b.py
範圍：前一堂（對應高的比＝相似比）＋1-3 相似三角形（含平行線截出相似三角形）＋這一堂的
面積比＝相似比的平方、三邊中點連線形成的三角形（相似比 1：2，周長 1/2、面積 1/4）。
不用 sin／cos／tan（下一堂）。附圖都用題目的同一組數字畫。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import Rational, sqrt  # noqa: E402

from geom import BLUE, LILAC, PEACH, Fig, lerp  # noqa: E402
from quizlib import export, raw, slot, statement, value, with_figure  # noqa: E402
from similar import heights_fig, qty, sides_fig, tex  # noqa: E402

R = Rational


def ratio_opt(a, b):
    return raw(f'${a}:{b}$', R(a, b))


def frac(v):
    return qty(v)


# ───────── 附圖 ─────────
def tri_from_sides(a, b, c):
    """邊長 BC＝a、CA＝b、AB＝c 的三角形頂點座標（B 在原點、C 在 x 軸上）。"""
    x = (a * a + c * c - b * b) / (2 * a)
    y = (c * c - x * x) ** 0.5
    return (x, y), (0.0, 0.0), (float(a), 0.0)


def midpoint_fig(a, b, c, labels=None, inner_labels=None, area=None):
    """△ABC 與三邊中點 D（BC）、E（CA）、F（AB）連成的 △DEF。labels：外圈三邊的標籤 (BC, CA, AB)。"""
    (ax, ay), (bx, by), (cx, cy) = tri_from_sides(a, b, c)
    f = Fig(440, 250)
    A, B, C = f.pt('A', ax, ay, at=(0, 1)), f.pt('B', bx, by, at=(-1, -0.4)), f.pt('C', cx, cy, at=(1, -0.4))
    D = f.pt('D', (bx + cx) / 2, (by + cy) / 2, at=(0.45, -1))
    E = f.pt('E', (cx + ax) / 2, (cy + ay) / 2, at=(1, 0.5))
    F = f.pt('F', (ax + bx) / 2, (ay + by) / 2, at=(-1, 0.5))
    f.poly([A, B, C], fill=PEACH)
    f.poly([D, E, F], fill=BLUE)
    f.ticks(B, D, 1), f.ticks(D, C, 1)
    f.ticks(C, E, 2), f.ticks(E, A, 2)
    f.ticks(A, F, 3), f.ticks(F, B, 3)
    if labels:
        # 邊長標籤避開中點（點名）和等長記號（1/4、3/4 處）
        f.side(B, C, labels[0], away=A, offset=14, t=0.36)
        f.side(C, A, labels[1], away=B, offset=14, t=0.38)
        f.side(A, B, labels[2], away=C, offset=14, t=0.38)
    if area:
        f.text((D.x + E.x + F.x) / 3, (D.y + E.y + F.y) / 3 - 0.1, area[1], 15, color='#1d3f8a')
        f.pt('', cx + 0.45 * a, ay, False)
        f.text(cx + 0.45 * a, ay, f'△ABC 面積＝{area[0]}', 14, color='#8a2f0b', anchor='end')
    return f.svg()


def mid_right_fig(de, df, labels):
    """課本中點連線隨堂：△DEF 中 ∠FDE＝90°，D、E、F 是 BC、CA、AB 的中點，BC 畫成水平。"""
    import math
    al = math.atan2(de, df)  # 讓 FE 水平
    D = (0.0, 0.0)
    Fv = (-df * math.cos(al), df * math.sin(al))
    Ev = (de * math.sin(al), de * math.cos(al))
    Av = (Ev[0] + Fv[0] - D[0], Ev[1] + Fv[1] - D[1])
    Bv = (Fv[0] + D[0] - Ev[0], Fv[1] + D[1] - Ev[1])
    Cv = (D[0] + Ev[0] - Fv[0], D[1] + Ev[1] - Fv[1])
    f = Fig(440, 240)
    A, B, C = f.pt('A', *Av, at=(0, 1)), f.pt('B', *Bv, at=(-1, -0.4)), f.pt('C', *Cv, at=(1, -0.4))
    Dp, E, F = f.pt('D', *D, at=(0, -1)), f.pt('E', *Ev, at=(1, 0.3)), f.pt('F', *Fv, at=(-1, 0.3))
    f.poly([A, B, C], fill=PEACH)
    f.poly([Dp, E, F], fill=BLUE)
    f.right(Dp, E, F)
    f.side(Dp, E, labels[0], away=F)
    f.side(Dp, F, labels[1], away=E)
    return f.svg()


def ex4p_fig(ab, ac):
    """課本例 4 隨堂：∠A＝90°，D 是 AB 中點，DE⊥BC 於 E。"""
    bc = (ab * ab + ac * ac) ** 0.5
    f = Fig(440, 230)
    B = f.pt('B', 0, 0, at=(-1, -0.3))
    C = f.pt('C', bc, 0, at=(1, -0.3))
    A = f.pt('A', ab * ab / bc, ab * ac / bc, at=(0.2, 1))
    D = f.pt('D', A.x / 2, A.y / 2, at=(1, -0.15))
    E = f.pt('E', D.x, 0, at=(0, -1))
    f.poly([A, B, C], fill=LILAC)
    f.seg(D, E)
    f.right(A, B, C)
    f.right(E, D, C)
    f.ticks(A, D, 1), f.ticks(D, B, 1)
    f.side(A, B, str(ab), away=C, offset=20, t=0.36)  # 避開中點 D 和等長記號
    f.side(A, C, str(ac), away=B)
    return f.svg()


def parallel_fig(m, n, labels):
    """△ABC 中 DE∥BC，AD：DB＝m：n，標出 △ADE 與四邊形 DBCE 的面積。"""
    f = Fig(420, 240)
    A = f.pt('A', 2.2, 4.0, at=(0, 1))
    B = f.pt('B', 0, 0, at=(-1, -0.4))
    C = f.pt('C', 6.0, 0, at=(1, -0.4))
    t = m / (m + n)
    D = lerp(A, B, t, 'D')
    E = lerp(A, C, t, 'E')
    D, E = f.pt('D', D.x, D.y, at=(-1, 0.2)), f.pt('E', E.x, E.y, at=(1, 0.2))
    f.poly([D, B, C, E], fill=PEACH)
    f.poly([A, D, E], fill=BLUE)
    f.side(A, D, labels[0], away=C)
    f.side(D, B, labels[1], away=C)
    f.text((A.x + D.x + E.x) / 3, (A.y + D.y + E.y) / 3 - 0.1, labels[2], 15, color='#1d3f8a')
    f.text((D.x + E.x) / 2 + 0.3, D.y * 0.45, labels[3], 15, color='#8a2f0b')
    return f.svg()


# ───────── 題目 ─────────
def height_warm(p, r, ap):
    dq = R(ap) * r / p
    return with_figure(value(
        rf'如圖，$\triangle ABC\sim\triangle DEF$，$\overline{{BC}}:\overline{{EF}}={p}:{r}$，$\overline{{AP}}$、$\overline{{DQ}}$ 是對應高，$\overline{{AP}}={ap}$，則 $\overline{{DQ}}=$？',
        dq,
        [qty(dq), qty(R(ap) * p / r), qty(R(ap) * r * r / (p * p)), qty(ap + (r - p) if ap + (r - p) != dq else ap + 1)],
        rf'對應高的比＝相似比：${ap}:\overline{{DQ}}={p}:{r}$，$\overline{{DQ}}={tex(dq).strip("$")}$。'),
        heights_fig(R(r, p), {'h1': str(ap), 'h2': '?'}))


def area_ratio(b1, b2):
    from math import gcd
    g = gcd(b1, b2)
    p, r = b1 // g, b2 // g
    return with_figure(value(
        rf'如圖，$\triangle ABC\sim\triangle DEF$，$\overline{{BC}}={b1}$、$\overline{{EF}}={b2}$。$\triangle ABC$ 面積 : $\triangle DEF$ 面積＝？',
        R(p * p, r * r),
        [ratio_opt(p * p, r * r), ratio_opt(p, r), ratio_opt(r * r, p * p), ratio_opt(p ** 3, r ** 3)],
        rf'相似比＝$\overline{{BC}}:\overline{{EF}}={b1}:{b2}={p}:{r}$，面積比＝相似比的平方＝${p * p}:{r * r}$。'),
        sides_fig(R(b2, b1), {'base1': str(b1), 'base2': str(b2)}, fill=PEACH))


def area_from_height(p, r, a1):
    a2 = R(a1) * r * r / (p * p)
    return with_figure(value(
        rf'如圖，$\triangle ABC\sim\triangle DEF$，$\overline{{AH}}$、$\overline{{DK}}$ 是對應高，$\overline{{AH}}:\overline{{DK}}={p}:{r}$。若 $\triangle ABC$ 的面積是 ${a1}$，$\triangle DEF$ 的面積是多少？',
        a2,
        [qty(a2), qty(R(a1) * r / p), qty(R(a1) * p * p / (r * r)), qty(R(a1) * p / r)],
        rf'對應高的比＝相似比＝${p}:{r}$，面積比＝${p * p}:{r * r}$。${a1}:x={p * p}:{r * r}$，$x={tex(a2).strip("$")}$。'),
        heights_fig(R(r, p), {'area1': str(a1), 'area2': '?'}, foot=('H', 'K'), fill='#fbf3c4'))


def side_from_area(A1, A2, bc):
    s1, s2 = sqrt(A1), sqrt(A2)
    ef = bc * s2 / s1
    return with_figure(value(
        rf'如圖，$\triangle ABC\sim\triangle DEF$，面積分別是 ${A1}$ 和 ${A2}$。若 $\overline{{BC}}={bc}$，則 $\overline{{EF}}=$？',
        ef,
        [qty(ef), qty(R(bc) * A2 / A1), qty(R(bc) * A1 / A2), qty(bc + s2 - s1)],
        rf'面積比 ${A1}:{A2}={s1}^2:{s2}^2$，所以相似比是 ${s1}:{s2}$。${bc}:\overline{{EF}}={s1}:{s2}$，$\overline{{EF}}={tex(ef).strip("$")}$。'),
        sides_fig(float(s2 / s1), {'base1': str(bc), 'base2': '?', 'area1': str(A1), 'area2': str(A2)}))


def ex4p(ab, ac):
    bc = sqrt(ab * ab + ac * ac)
    bd = R(ab, 2)
    want = (bd / bc) ** 2
    return with_figure(value(
        rf'如圖，$\triangle ABC$ 中 $\angle A=90^\circ$，$\overline{{AB}}={ab}$、$\overline{{AC}}={ac}$，$D$ 是 $\overline{{AB}}$ 的中點，$\overline{{DE}}\perp\overline{{BC}}$。$\triangle EBD$ 面積 : $\triangle ABC$ 面積＝？',
        want,
        [raw(f'${(bd * bd / (bc * bc)).p}:{(bd * bd / (bc * bc)).q}$', want), raw('$1:4$', R(1, 4)),
         raw(f'${(bd / bc).p}:{(bd / bc).q}$', bd / bc), raw(f'${((bd / ac) ** 2).p}:{((bd / ac) ** 2).q}$', (bd / ac) ** 2)],
        rf'$\angle B$ 共用、$\angle BED=\angle BAC=90^\circ$，$\triangle EBD\sim\triangle ABC$（AA），$\overline{{BD}}$ 對應 $\overline{{BC}}$（都是斜邊）。$\overline{{BC}}={bc}$，相似比 ${bd}:{bc}$，面積比是它的平方。'),
        ex4p_fig(ab, ac))


def mid_area(area):
    a = R(area, 4)
    return with_figure(value(
        rf'如圖，$D$、$E$、$F$ 分別是 $\triangle ABC$ 三邊的中點。若 $\triangle ABC$ 的面積是 ${area}$，$\triangle DEF$ 的面積是多少？',
        a,
        [qty(a), qty(R(area, 2)), qty(R(area, 3)), qty(R(area, 8))],
        rf'中點三角形和原三角形相似，相似比 $1:2$，面積比 $1:4$，${area}\times\dfrac{{1}}{{4}}={tex(a).strip("$")}$。'),
        midpoint_fig(7, 8, 9, area=(str(area), '?')))


def mid_back(de, df, ask):
    ef = sqrt(de * de + df * df)
    p_def, a_def = de + df + ef, R(de * df, 2)
    if ask == 'perimeter':
        ans = 2 * p_def
        opts = [qty(ans), qty(p_def), qty(4 * p_def), qty(2 * (de + df))]
        what, how = '周長', rf'$\overline{{EF}}={ef}$，$\triangle DEF$ 周長 ${p_def}$。原三角形周長是它的 $2$ 倍：${tex(ans).strip("$")}$。'
    else:
        ans = 4 * a_def
        opts = [qty(ans), qty(a_def), qty(2 * a_def), qty(8 * a_def)]
        what, how = '面積', rf'$\triangle DEF$ 面積 $\dfrac{{{de}\times{df}}}{{2}}={a_def}$。原三角形面積是它的 $4$ 倍：${tex(ans).strip("$")}$。'
    return with_figure(value(
        rf'如圖，$D$、$E$、$F$ 分別是 $\overline{{BC}}$、$\overline{{CA}}$、$\overline{{AB}}$ 的中點，$\overline{{DE}}={de}$、$\overline{{DF}}={df}$、$\angle FDE=90^\circ$。$\triangle ABC$ 的{what}是多少？',
        ans, opts, how),
        mid_right_fig(de, df, (str(de), str(df))))


def mid_perimeter(a, b, c):
    P = a + b + c
    half = R(P, 2)
    return with_figure(value(
        rf'如圖，$\triangle ABC$ 的三邊長是 ${a}$、${b}$、${c}$，$D$、$E$、$F$ 是三邊的中點。$\triangle DEF$ 的周長是多少？',
        half,
        [qty(half), qty(P), qty(R(P, 4)), qty(R(P, 3))],
        rf'$\triangle ABC$ 周長 ${P}$。中點三角形和原三角形的相似比 $1:2$，周長比也是 $1:2$（不用平方），周長＝${tex(half).strip("$")}$。'),
        midpoint_fig(a, b, c, labels=(str(a), str(b), str(c))))


def square_or_not(kind):
    if kind == 1:
        opts = [(r'相似比 $3:4$，面積比 $9:16$', R(3, 4) ** 2, R(9, 16)),
                (r'相似比 $3:4$，周長比 $9:16$', R(3, 4), R(9, 16)),
                (r'相似比 $3:4$，對應高的比 $9:16$', R(3, 4), R(9, 16)),
                (r'面積比 $9:16$，相似比 $9:16$', sqrt(R(9, 16)), R(9, 16))]
        why, k = r'只有面積要平方；周長、對應高的比都等於相似比 $3:4$。', R(4, 3)
    elif kind == 2:
        opts = [(r'相似比 $2:5$，周長比 $2:5$', R(2, 5), R(2, 5)),
                (r'相似比 $2:5$，面積比 $2:5$', R(2, 5) ** 2, R(2, 5)),
                (r'面積比 $4:25$，對應高的比 $4:25$', sqrt(R(4, 25)), R(4, 25)),
                (r'相似比 $2:5$，面積比 $4:10$', R(2, 5) ** 2, R(4, 10))]
        why, k = r'周長比＝相似比 $2:5$；面積比是 $2^2:5^2=4:25$，不是 $4:10$。', R(5, 2)
    else:
        opts = [(r'面積比 $16:25$，相似比 $4:5$', sqrt(R(16, 25)), R(4, 5)),
                (r'對應高的比 $4:5$，面積比 $4:5$', R(4, 5) ** 2, R(4, 5)),
                (r'相似比 $4:5$，周長比 $16:25$', R(4, 5), R(16, 25)),
                (r'中點三角形的周長是原三角形的 $\dfrac{1}{4}$', R(1, 2), R(1, 4))]
        why, k = r'面積比 $16:25$ 開平方得相似比 $4:5$；周長比＝相似比；中點三角形周長是 $\dfrac{1}{2}$、面積才是 $\dfrac{1}{4}$。', R(5, 4)
    return with_figure(statement(r'$\triangle ABC\sim\triangle DEF$，下列哪一個敘述正確？', opts, why),
                       heights_fig(k, {}, fill=PEACH))


def parallel_area(m, n, a):
    t = R(m, m + n)
    whole = a / t ** 2
    rest = whole - a
    return with_figure(value(
        rf'如圖，$\triangle ABC$ 中 $\overline{{DE}}\parallel\overline{{BC}}$，$\overline{{AD}}:\overline{{DB}}={m}:{n}$。若 $\triangle ADE$ 的面積是 ${a}$，四邊形 $DBCE$ 的面積是多少？',
        rest,
        [qty(rest), qty(whole), qty(a / t - a), qty(a / t)],
        rf'$\overline{{DE}}\parallel\overline{{BC}}$，$\triangle ADE\sim\triangle ABC$，相似比 $\overline{{AD}}:\overline{{AB}}={m}:{m + n}$，面積比 ${m * m}:{(m + n) ** 2}$，$\triangle ABC={tex(whole).strip("$")}$，四邊形＝${tex(whole).strip("$")}-{a}={tex(rest).strip("$")}$。'),
        parallel_fig(m, n, (str(m), str(n), str(a), '?')))


SLOTS = [
    slot(1, '對應高的比（先備）', [height_warm(4, 3, 8), height_warm(5, 2, 10), height_warm(3, 5, 9)]),
    slot(2, '面積比＝相似比的平方', [area_ratio(4, 6), area_ratio(6, 10), area_ratio(3, 12)]),
    slot(3, '已知面積求另一個面積', [area_from_height(3, 2, 18), area_from_height(4, 3, 32), area_from_height(5, 2, 50)]),
    slot(4, '由面積比求邊長', [side_from_area(16, 36, 8), side_from_area(9, 25, 6), side_from_area(4, 49, 4)]),
    slot(5, '直角三角形中的相似與面積比', [ex4p(8, 6), ex4p(6, 8), ex4p(12, 5)]),
    slot(6, '中點三角形的面積', [mid_area(48), mid_area(36), mid_area(60)]),
    slot(7, '由中點三角形求原三角形', [mid_back(3, 4, 'perimeter'), mid_back(6, 8, 'area'), mid_back(5, 12, 'perimeter')]),
    slot(8, '中點三角形的周長', [mid_perimeter(7, 8, 9), mid_perimeter(5, 6, 9), mid_perimeter(10, 12, 14)]),
    slot(9, '高、周長、面積：哪個要平方？', [square_or_not(1), square_or_not(2), square_or_not(3)]),
    slot(10, '平行線截出的相似三角形與面積', [parallel_area(2, 1, 8), parallel_area(1, 1, 5), parallel_area(3, 2, 18)]),
]

if __name__ == '__main__':
    export('g9-1-4b', '1-4 相似三角形的應用（2）：課後檢核', '九年級 1-4 課本 p.66–68（面積比、中點連線）＋前一堂與 1-3；題目自編，答案已用 SymPy 核算', SLOTS)
