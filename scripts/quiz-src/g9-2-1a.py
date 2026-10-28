r"""2-1 點、直線與圓之間的位置關係（1）圓、弧長與扇形面積：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一，每題附圖）。

用法：python -X utf8 scripts/quiz-src/g9-2-1a.py
範圍：這一堂的圓的名詞（弦、直徑、弧、優弧、劣弧、弓形、圓心角、扇形）、弧長＝2πr×x/360、
扇形面積＝πr²×x/360、扇形周長、由面積或弧長反求圓心角或半徑、弓形面積＝扇形－三角形、弓形周長＝弧＋弦；
先備：圓周長、圓面積（國小）、畢氏定理與根式（八上）、正三角形面積＝(√3/4)a²（課本 p.91 學習時光機）。
不用點、直線與圓的位置關係、切線（第 2 堂）、弦心距（第 3 堂）、圓周角（2-2）。
附圖都用題目的同一組數字畫（半徑、角度照實際大小），題目問的那一段標「?」。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import Rational, pi, sqrt  # noqa: E402
from sympy import simplify as sp_simplify  # noqa: E402

from circlefig import GREEN, ROSE, SKY, CFig, deg, eopt, etex  # noqa: E402
from quizlib import export, slot, statement, value, with_figure  # noqa: E402

R = Rational


# ───────── 附圖 ─────────
def sector_fig(r, a, *, r_lab=None, ang_lab=None, arc_lab=None, show='arc', names=('A', 'B'), mid=270):
    """圓 O、半徑 r、圓心角 a 的扇形（對稱放在 mid 方向）。show：'arc' 描紅弧、'sector' 塗扇形、'both'。"""
    f = CFig(440, 250)
    O = f.pt('O', 0, 0, at=(0, 1) if mid == 270 else (0, -1))
    a0, a1 = mid - a / 2, mid + a / 2
    if show in ('sector', 'both'):
        f.sector(O, r, a0, a1, fill=GREEN)
    f.circle(O, r)
    A = f.on(O, r, a0, names[0])
    B = f.on(O, r, a1, names[1])
    f.seg(O, A)
    f.seg(O, B)
    f.dot(O, r * 0.03)
    if show in ('arc', 'both'):
        f.arc_line(O, r, a0, a1)
    if r_lab:
        f.side(O, A, r_lab, away=B)
    if ang_lab:
        # 角度標籤放在扇形裡（小角度放遠一點，才不會壓到半徑）
        f.arc(O, A, B, None, r=14)
        m = f.at(O, r * (0.5 if a >= 90 else 0.6 if a >= 50 else 0.74), mid)
        f.text(m.x, m.y, ang_lab, 13)
    if arc_lab:
        m = f.at(O, r * 1.18, mid)
        f.text(m.x, m.y, arc_lab, 15, color='#d2541b')
    return f.svg()


def bow_fig(r, a, *, r_lab=None, chord_lab=None, ang_lab=None, names=('A', 'B'), equi=False):
    """圓心角 a 的弓形（塗色）＋三角形 OAB。"""
    f = CFig(440, 250)
    O = f.pt('O', 0, 0, at=(-1, 0.4))
    a0, a1 = 270, 270 + a
    f.bow(O, r, a0, a1, fill=SKY)
    f.circle(O, r)
    A = f.on(O, r, a0, names[0], at=(0, -1))
    B = f.on(O, r, a1, names[1], at=(1, 0.2))
    f.poly([O, A, B], fill=None)
    f.dot(O, r * 0.03)
    if a == 90:
        f.right(O, A, B)
    if ang_lab:
        f.arc(O, A, B, ang_lab, r=18)
    if r_lab:
        f.side(O, B, r_lab, away=A, t=0.3 if equi else 0.5)
    if chord_lab:
        f.side(A, B, chord_lab, away=O, color='#d2541b')
    if equi:
        f.ticks(O, A)
        f.ticks(O, B)
        f.ticks(A, B)
    return f.svg()


# ───────── 題目 ─────────
def pick(correct, cands, fmt=eopt):
    """正確選項＋依序取 3 個值不同的錯誤選項（常見錯法排前面）。"""
    out, seen = [fmt(correct)], [sp_simplify(correct)]
    for c in cands:
        c2 = sp_simplify(c)
        if all(sp_simplify(c2 - x) != 0 for x in seen):
            out.append(fmt(c))
            seen.append(c2)
        if len(out) == 4:
            return out
    raise AssertionError(f'錯誤選項不夠：{correct} {cands}')


def arc_len(r, a):
    L = 2 * pi * r * R(a, 360)
    return with_figure(value(
        rf'如圖，圓 $O$ 的半徑為 ${r}$，圓心角 $\angle AOB={a}^\circ$，則 $\overset{{\frown}}{{AB}}$ 的長度為多少？',
        L,
        pick(L, [pi * r * r * R(a, 360), pi * r * R(a, 360), 2 * pi * r * R(360 - a, 360), 2 * pi * r * R(a, 180)]),
        rf'弧長＝圓周長×$\dfrac{{{a}}}{{360}}$＝$2\pi\times{r}\times\dfrac{{{a}}}{{360}}={etex(L)}$。用 $\pi r^2$ 算的是扇形面積。'),
        sector_fig(r, a, r_lab=str(r), ang_lab=f'{a}°', arc_lab='?'))


def sector_area(r, a):
    S = pi * r * r * R(a, 360)
    return with_figure(value(
        rf'如圖，圓 $O$ 的半徑為 ${r}$，圓心角 $\angle AOB={a}^\circ$，則扇形 $AOB$ 的面積為多少？',
        S,
        pick(S, [2 * pi * r * R(a, 360), pi * r * r * R(360 - a, 360), pi * r * r * R(a, 180), pi * r * R(a, 360)]),
        rf'扇形面積＝圓面積×$\dfrac{{{a}}}{{360}}$＝$\pi\times{r}^2\times\dfrac{{{a}}}{{360}}={etex(S)}$。'),
        sector_fig(r, a, r_lab=str(r), ang_lab=f'{a}°', show='sector'))


def sector_perim(r, a):
    L = 2 * pi * r * R(a, 360)
    return with_figure(value(
        rf'如圖，圓 $O$ 的半徑為 ${r}$，圓心角 $\angle AOB={a}^\circ$，則扇形 $AOB$ 的周長為多少？',
        L + 2 * r,
        pick(L + 2 * r, [L + r, L, pi * r * r * R(a, 360) + 2 * r, L + 4 * r]),
        rf'扇形周長＝弧長＋兩條半徑＝${etex(L)}+{r}+{r}={etex(L + 2 * r)}$。'),
        sector_fig(r, a, r_lab=str(r), ang_lab=f'{a}°', show='both'))


def wrong_angles(x):
    out = []
    for c in (x / 2, 2 * x, 360 - x, x + 30, x - 15, x + 60, x - 30):
        if c != x and 0 < c <= 360 and c not in out and R(c).q == 1:
            out.append(c)
    return out[:3]


def angle_from_area(S, r):
    x = S / (pi * r * r) * 360
    return with_figure(value(
        rf'如圖，扇形 $AOB$ 的面積為 ${etex(S)}$，半徑為 ${r}$，則圓心角 $\angle AOB$ 是幾度？',
        x,
        [deg(x)] + [deg(c) for c in wrong_angles(x)],
        rf'設圓心角 $x^\circ$：$\pi\times{r}^2\times\dfrac{{x}}{{360}}={etex(S)}$，$x={x}$。也可以算 $\dfrac{{{etex(S)}}}{{{etex(pi * r * r)}}}$ 再乘 $360^\circ$。'),
        sector_fig(r, float(x), r_lab=str(r), ang_lab='?', show='sector'))


def angle_from_arc(L, r):
    x = L / (2 * pi * r) * 360
    return with_figure(value(
        rf'如圖，圓 $O$ 的半徑為 ${r}$，$\overset{{\frown}}{{AB}}$ 的長為 ${etex(L)}$，則圓心角 $\angle AOB$ 是幾度？',
        x,
        [deg(x)] + [deg(c) for c in wrong_angles(x)],
        rf'設圓心角 $x^\circ$：$2\pi\times{r}\times\dfrac{{x}}{{360}}={etex(L)}$，$x={x}$。弧長要用圓周長 $2\pi r$。'),
        sector_fig(r, float(x), r_lab=str(r), ang_lab='?', arc_lab=f'{etex(L).replace(chr(92) + "pi", "π")}'))


def radius_from_arc(L, a):
    r = L / (2 * pi * R(a, 360))
    return with_figure(value(
        rf'如圖，扇形 $AOB$ 的圓心角為 ${a}^\circ$，$\overset{{\frown}}{{AB}}$ 的長為 ${etex(L)}$，則半徑是多少？',
        r,
        [eopt(r), eopt(2 * r), eopt(r / 2), eopt(r + 3)],
        rf'設半徑 $r$：$2\pi r\times\dfrac{{{a}}}{{360}}={etex(L)}$，$r={etex(r)}$。'),
        sector_fig(float(r), a, r_lab='?', ang_lab=f'{a}°', arc_lab=etex(L).replace('\\pi', 'π')))


def bow90_area(r):
    S, T = pi * r * r / 4, R(r * r, 2)
    return with_figure(value(
        rf'如圖，圓 $O$ 的半徑為 ${r}$，$\angle AOB=90^\circ$，則藍色弓形的面積為多少？',
        S - T,
        [eopt(S - T), eopt(S), eopt(S + T), eopt(S - r * r)],
        rf'弓形＝扇形 $AOB$－直角$\triangle AOB$＝$\pi\times{r}^2\times\dfrac{{90}}{{360}}-\dfrac12\times{r}\times{r}={etex(S - T)}$。'),
        bow_fig(r, 90, r_lab=str(r)))


def bow60_area(r):
    S, T = pi * r * r / 6, sqrt(3) / 4 * r * r
    return with_figure(value(
        rf'如圖，圓 $O$ 的半徑為 ${r}$，$\triangle AOB$ 是正三角形，則藍色弓形的面積為多少？',
        S - T,
        [eopt(S - T), eopt(S + T), eopt(S - R(r * r, 2)), eopt(pi * r * r / 4 - T)],
        rf'正三角形的角都是 $60^\circ$，弓形＝扇形－正三角形＝$\pi\times{r}^2\times\dfrac{{60}}{{360}}-\dfrac{{\sqrt3}}{{4}}\times{r}^2={etex(S - T)}$。'),
        bow_fig(r, 60, r_lab=str(r), equi=True))


def bow_perim(r, a):
    L = 2 * pi * r * R(a, 360)
    chord = sqrt(2) * r if a == 90 else r
    alt = r if a == 90 else sqrt(2) * r
    how = rf'弦 $\overline{{AB}}=\sqrt{{{r}^2+{r}^2}}={etex(chord)}$' if a == 90 else rf'正三角形三邊相等，弦 $\overline{{AB}}={r}$'
    return with_figure(value(
        rf'如圖，圓 $O$ 的半徑為 ${r}$，' + (r'$\angle AOB=90^\circ$' if a == 90 else r'$\triangle AOB$ 是正三角形') + '，則藍色弓形的周長為多少？',
        L + chord,
        [eopt(L + chord), eopt(L + 2 * r), eopt(L + alt), eopt(L)],
        rf'弓形周長＝弧長＋弦長。弧長＝$2\pi\times{r}\times\dfrac{{{a}}}{{360}}={etex(L)}$，{how}，周長＝${etex(L + chord)}$。'),
        bow_fig(r, a, r_lab=str(r), chord_lab='', equi=(a == 60)))


# 名詞（附圖）
def terms_fig(kind):
    f = CFig(440, 250)
    O = f.pt('O', 0, 0, at=(0.3, 1))
    r = 5
    if kind == 1:
        f.circle(O, r)
        C, D = f.on(O, r, 180, 'C'), f.on(O, r, 0, 'D')
        A, B = f.on(O, r, 115, 'A'), f.on(O, r, 215, 'B')
        E = f.on(O, r, 300, 'E')
        f.seg(C, D)
        f.seg(A, B)
        f.seg(O, E)
    elif kind == 2:
        f.bow(O, r, 100, 190, fill=ROSE)
        f.sector(O, r, 250, 330, fill=GREEN)
        f.circle(O, r)
        A, B = f.on(O, r, 100, 'A'), f.on(O, r, 190, 'B')
        Cp, D = f.on(O, r, 250, 'C'), f.on(O, r, 330, 'D')
        f.seg(A, B)
        f.seg(O, Cp)
        f.seg(O, D)
        m = f.at(O, r * 0.8, 145)
        f.text(m.x, m.y, '甲', 15)
        m = f.at(O, r * 0.62, 290)
        f.text(m.x, m.y, '乙', 15)
    else:
        f.circle(O, r)
        A, B = f.on(O, r, 200, 'A'), f.on(O, r, 330, 'B')
        Cp = f.on(O, r, 90, 'C')
        f.seg(O, A)
        f.seg(O, B)
        f.seg(Cp, A, dash=True)
        f.seg(Cp, B, dash=True)
        f.arc(O, A, B, None, r=16)
    f.dot(O, 0.15)
    return f.svg()


def terms(kind):
    if kind == 1:
        return with_figure(statement(
            r'如圖，$\overline{CD}$ 通過圓心 $O$，$A$、$B$、$C$、$D$、$E$ 都在圓上。哪一個敘述正確？',
            [(r'$\overline{CD}$ 是直徑', True), (r'$\overline{AB}$ 是直徑', False), (r'$\overline{OE}$ 是弦', False), (r'弦 $\overline{AB}$ 比直徑 $\overline{CD}$ 長', False)],
            r'通過圓心的弦是直徑，直徑是最長的弦；$\overline{OE}$ 一端是圓心，是半徑，不是弦。'),
            terms_fig(1))
    if kind == 2:
        return with_figure(statement(
            r'如圖，甲由弦 $\overline{AB}$ 和一段弧圍成，乙由半徑 $\overline{OC}$、$\overline{OD}$ 和一段弧圍成。哪一個敘述正確？',
            [('甲是弓形，乙是扇形', True), ('甲是扇形，乙是弓形', False), ('甲、乙都是扇形', False), ('甲、乙都是弓形', False)],
            '一弦和一弧圍成的是弓形；兩半徑和一弧圍成的是扇形。'),
            terms_fig(2))
    return with_figure(statement(
        r'如圖，$O$ 是圓心，$A$、$B$、$C$ 在圓上。哪一個敘述正確？',
        [(r'$\angle AOB$ 是圓心角', True), (r'$\angle ACB$ 是圓心角', False), (r'劣弧 $\overset{\frown}{AB}$ 比優弧 $\overset{\frown}{ACB}$ 長', False), ('圓心角的頂點可以在圓上任一點', False)],
        r'圓心角的頂點要在圓心、兩邊是半徑：$\angle AOB$ 是，$\angle ACB$ 的頂點在圓上，不是圓心角。優弧比劣弧長。'),
        terms_fig(3))


SLOTS = [
    slot(1, '弧長', [arc_len(10, 60), arc_len(6, 120), arc_len(9, 40)]),
    slot(2, '扇形面積', [sector_area(12, 30), sector_area(6, 80), sector_area(4, 135)]),
    slot(3, '扇形周長', [sector_perim(8, 135), sector_perim(12, 60), sector_perim(5, 72)]),
    slot(4, '由扇形面積求圓心角', [angle_from_area(48 * pi, 12), angle_from_area(2 * pi, 4), angle_from_area(15 * pi, 6)]),
    slot(5, '由弧長求圓心角', [angle_from_arc(5 * pi, 15), angle_from_arc(2 * pi, 9), angle_from_arc(3 * pi, 4)]),
    slot(6, '由弧長求半徑', [radius_from_arc(4 * pi, 120), radius_from_arc(6 * pi, 90), radius_from_arc(2 * pi, 40)]),
    slot(7, '弓形面積（直角）', [bow90_area(4), bow90_area(6), bow90_area(10)]),
    slot(8, '弓形面積（正三角形）', [bow60_area(6), bow60_area(4), bow60_area(12)]),
    slot(9, '弓形周長', [bow_perim(4, 90), bow_perim(6, 90), bow_perim(6, 60)]),
    slot(10, '圓的名詞', [terms(1), terms(2), terms(3)]),
]

if __name__ == '__main__':
    export('g9-2-1a', '2-1 點、直線與圓（1）：課後檢核', '九年級 2-1 課本 p.86–91（圓的名詞、弧長、扇形、弓形）＋國小圓周長與圓面積、八上畢氏定理；題目自編，答案已用 SymPy 核算', SLOTS)
