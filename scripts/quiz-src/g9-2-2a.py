r"""2-2(1) 圓心角與弧：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一，每題附圖）。

用法：C:\AI\H3\venv\Scripts\python.exe -B -X utf8 scripts/quiz-src/g9-2-2a.py
範圍：這一堂的弧的度數＝所對圓心角、優弧的度數、弧的度數與弧的長度不同（同心圓同一個圓心角）、
同圓或等圓中度數相等⇔長度相等、等弧對等弦（SAS）、等弦對等弧（SSS）、正多邊形的邊是等弦、兩等弦相交扣掉共同的弧；
先備 2-1 弧長＝2πr×x/360、全等性質。
不用圓周角（2-2(2)）、直徑所對的圓周角與平行弦（2-2(3)）、圓內接四邊形與作切線（2-2(4)）。
附圖都用題目的同一組數字畫（角度照實際大小），題目問的那一段標「?」。
"""
import sys
from math import cos, radians, sin
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import pi  # noqa: E402

from arcfig import A_, Circ, R, away, dpick, lab  # noqa: E402
from circlefig import eopt, etex  # noqa: E402
from quizlib import export, slot, statement, value, with_figure  # noqa: E402


def pick(correct, cands):
    out, seen = [eopt(correct)], [correct]
    for c in cands:
        if c != 0 and all((c - s).simplify() != 0 for s in seen):
            out.append(eopt(c))
            seen.append(c)
        if len(out) == 4:
            return out
    raise AssertionError(f'錯誤選項不夠：{correct} {cands}')


def sector_pic(a, mid=270, names=('A', 'B'), arc_lab='?', ang_lab=None, major=False, cname=None):
    c = Circ(oat=away(mid))
    d0, d1 = mid - a / 2, mid + a / 2
    A, B = c.p(names[0], d0), c.p(names[1], d1)
    c.rad(A)
    c.rad(B)
    c.angle(c.O, A, B, ang_lab, r=16)
    if major:
        c.arc(d1, d0 + 360, arc_lab, lab_at=mid + 180 + 35)
        if cname:
            c.p(cname, mid + 180)
    else:
        c.arc(d0, d1, arc_lab)
    return c.svg()


# ───────── 1. 弧的度數＝圓心角 ─────────
def minor_deg(a, mid):
    return with_figure(value(
        rf'如圖，圓 $O$ 中 $\angle AOB={a}^\circ$，{A_("AB")} 的度數是多少？',
        a,
        dpick(a, [R(a, 2), 2 * a, 360 - a, 180 - a]),
        rf'弧的度數就是它所對圓心角的度數：{A_("AB")} $={a}^\circ$。弧的度數和半徑無關。'),
        sector_pic(a, mid, ang_lab=lab(a)))


# ───────── 2. 優弧的度數 ─────────
def major_deg(a, mid):
    return with_figure(value(
        rf'如圖，圓 $O$ 中 $\angle AOB={a}^\circ$，$C$ 在優弧上，{A_("ACB")} 的度數是多少？',
        360 - a,
        dpick(360 - a, [a, 180 - a, R(360 - a, 2), 360 - 2 * a]),
        rf'整個圓周是 $360^\circ$：{A_("ACB")} $=360^\circ-{a}^\circ={360 - a}^\circ$。'),
        sector_pic(a, mid, ang_lab=lab(a), major=True, cname='C'))


# ───────── 3. 由度數算弧長 ─────────
def arc_length(r, a, mid):
    Lx = 2 * pi * r * R(a, 360)
    c = Circ(oat=away(mid))
    d0, d1 = mid - a / 2, mid + a / 2
    A, B = c.p('A', d0), c.p('B', d1)
    c.rad(A)
    c.rad(B)
    c.angle(c.O, A, B, None, r=14)
    c.arc(d0, d1, '?')
    c.f.side(c.O, B, str(r), away=A)
    return with_figure(value(
        rf'如圖，圓 $O$ 的半徑是 ${r}$，{A_("AB")} 的度數是 ${a}^\circ$，{A_("AB")} 的長度是多少？',
        Lx,
        pick(Lx, [pi * r * r * R(a, 360), 2 * pi * r * R(360 - a, 360), pi * r * R(a, 360), 2 * pi * r * R(a, 180)]),
        rf'弧的度數 ${a}^\circ$ 就是圓心角：弧長 $=2\pi\times{r}\times\dfrac{{{a}}}{{360}}={etex(Lx)}$。'),
        c.svg())


# ───────── 同心圓附圖 ─────────
def concentric(r1, r2, a, mid=90, show=('', '')):
    c = Circ(r=r2, oat=away(mid))
    c.f.circle(c.O, r1)
    d0, d1 = mid - a / 2, mid + a / 2
    C, D = c.p('C', d0), c.p('D', d1)
    # 小圓上的點：標籤放在射線旁邊（不壓到大圓）
    A = c.f.pt('A', r1 * cos(radians(d0)), r1 * sin(radians(d0)), True, (cos(radians(d0 - 90)), sin(radians(d0 - 90))))
    B = c.f.pt('B', r1 * cos(radians(d1)), r1 * sin(radians(d1)), True, (cos(radians(d1 + 90)), sin(radians(d1 + 90))))
    c.rad(C)
    c.rad(D)
    c.angle(c.O, A, B, lab(a), r=14)
    c.f.arc_line(c.O, r1, d0, d1, color='#2f6fbf', width=3.2)
    c.arc(d0, d1)
    if show[0]:
        c.f.side(c.O, A, show[0], away=B)
    if show[1]:
        c.f.side(c.O, D, show[1], away=c.at(d1 + 60), t=0.78)
    return c.svg()


# ───────── 4. 同心圓：度數相等、弧長不等 ─────────
def concentric_stmt(r1, r2, a):
    L1, L2 = 2 * pi * r1 * R(a, 360), 2 * pi * r2 * R(a, 360)
    assert L1 != L2
    return with_figure(statement(
        rf'如圖，兩同心圓的半徑是 ${r1}$、${r2}$，$\angle AOB=\angle COD={a}^\circ$。下列敘述何者正確？',
        [(rf'兩弧都是 ${a}^\circ$，{A_("AB")} 長 ${etex(L1)}$、{A_("CD")} 長 ${etex(L2)}$', True),
         (rf'兩弧都是 ${a}^\circ$，長度都是 ${etex(L1)}$', False),
         (rf'{A_("AB")} 是 ${a}^\circ$，{A_("CD")} 是 ${R(a * r2, r1)}^\circ$', False),
         (rf'兩弧的長度都是 ${etex(L2)}$，度數不相等', False)],
        rf'度數看圓心角：兩弧都是 ${a}^\circ$。長度還要看半徑：$2\pi\times{r1}\times\dfrac{{{a}}}{{360}}={etex(L1)}$，'
        rf'$2\pi\times{r2}\times\dfrac{{{a}}}{{360}}={etex(L2)}$。度數相等，長度不一定相等。'),
        concentric(r1, r2, a, show=(str(r1), str(r2))))


# ───────── 5. 同心圓：大弧比小弧長多少 ─────────
def concentric_diff(r1, r2, a):
    L1, L2 = 2 * pi * r1 * R(a, 360), 2 * pi * r2 * R(a, 360)
    return with_figure(value(
        rf'如圖，兩同心圓的半徑是 ${r1}$、${r2}$，$\angle AOB=\angle COD={a}^\circ$。{A_("CD")} 比 {A_("AB")} 長多少？',
        L2 - L1,
        pick(L2 - L1, [L2, L1, pi * (r2 * r2 - r1 * r1) * R(a, 360), 2 * pi * (r2 - r1)]),
        rf'{A_("CD")} $={etex(L2)}$，{A_("AB")} $={etex(L1)}$，相差 ${etex(L2 - L1)}$。兩弧度數相同，長度不同。'),
        concentric(r1, r2, a, mid=100, show=(str(r1), str(r2))))


# ───────── 6. 等弧對等弦、等弦對等弧的理由 ─────────
def two_chords_fig(a, b0=200, b1=330):
    c = Circ(oat=(0, 1))
    A, B = c.p('A', b0), c.p('B', b0 + a)
    C, D = c.p('C', b1), c.p('D', b1 + a)
    for p in (A, B, C, D):
        c.rad(p)
    c.seg(A, B)
    c.seg(C, D)
    c.angle(c.O, A, B, None, r=13)
    c.angle(c.O, C, D, None, r=16)
    return c.svg()


def congruence(kind):
    if kind == 'SAS':
        stem = r'如圖，圓 $O$ 中 $\angle AOB=\angle COD$。要說明弦 $\overline{AB}=\overline{CD}$，$\triangle OAB\cong\triangle OCD$ 的理由是？'
        opts = [('SAS 全等（兩條半徑夾一個相等的角）', True), ('SSS 全等', False), ('AAA 全等', False), ('RHS 全等', False)]
        expl = r'$\overline{OA}=\overline{OC}$、$\overline{OB}=\overline{OD}$（半徑），夾角 $\angle AOB=\angle COD$，SAS 全等，所以 $\overline{AB}=\overline{CD}$。SSS 要先知道弦相等，這正是要說明的事。'
        fig = two_chords_fig(70, 190, 320)
    elif kind == 'SSS':
        stem = r'如圖，圓 $O$ 中弦 $\overline{AB}=\overline{CD}$。要說明 $\angle AOB=\angle COD$（等弦對等弧），$\triangle OAB\cong\triangle OCD$ 的理由是？'
        opts = [('SSS 全等（兩條半徑和弦都相等）', True), ('SAS 全等', False), ('AAA 全等', False), ('ASA 全等', False)]
        expl = r'$\overline{OA}=\overline{OC}$、$\overline{OB}=\overline{OD}$（半徑）、$\overline{AB}=\overline{CD}$，SSS 全等，對應角 $\angle AOB=\angle COD$，所以兩弧的度數相等。'
        fig = two_chords_fig(80, 200, 330)
    else:
        stem = r'如圖，圓 $O$ 中 $\angle AOB=\angle COD$。用 SAS 說明 $\triangle OAB\cong\triangle OCD$，要用到哪三個條件？'
        opts = [(r'$\overline{OA}=\overline{OC}$、$\angle AOB=\angle COD$、$\overline{OB}=\overline{OD}$', True),
                (r'$\overline{OA}=\overline{OC}$、$\overline{OB}=\overline{OD}$、$\overline{AB}=\overline{CD}$', False),
                (r'$\angle OAB=\angle OCD$、$\angle OBA=\angle ODC$、$\angle AOB=\angle COD$', False),
                (r'$\overline{AB}=\overline{CD}$、$\angle AOB=\angle COD$、$\overline{OA}=\overline{OB}$', False)]
        expl = r'SAS：兩邊和它們的夾角。半徑 $\overline{OA}=\overline{OC}$、$\overline{OB}=\overline{OD}$，夾角 $\angle AOB=\angle COD$。$\overline{AB}=\overline{CD}$ 是要說明的結論，不能拿來當條件。'
        fig = two_chords_fig(60, 180, 300)
    return with_figure(statement(stem, opts, expl), fig)


# ───────── 7. 正多邊形的邊是等弦 ─────────
def polygon(nside, k):
    c = Circ(oat=away(90 + 180 * k / nside))
    names = 'ABCDEFGH'
    pts = [c.p(names[i], 90 + 360 * i / nside) for i in range(nside)]
    for i in range(nside):
        c.seg(pts[i], pts[(i + 1) % nside])
    c.rad(pts[0])
    c.rad(pts[k])
    c.angle(c.O, pts[0], pts[k], '?', r=16)
    ans = R(360 * k, nside)
    word = {5: '五', 6: '六', 8: '八'}[nside]
    arc = names[:k + 1]
    return with_figure(value(
        rf'如圖，正{word}邊形內接於圓 $O$，$\angle AO{names[k]}$ 是幾度？',
        ans,
        dpick(ans, [R(360, nside), R(180 * (nside - 2), nside), 360 - ans, R(180 * k, nside), R(ans, 2), ans + R(360, nside)]),
        rf'{word}條邊（弦）都相等，等弦對等弧：圓周分成 ${nside}$ 等分，每段 ${R(360, nside)}^\circ$。'
        rf'{A_(arc)} 占 ${k}$ 段，$\angle AO{names[k]}=$ {A_(arc)} $={ans}^\circ$。'),
        c.svg())


# ───────── 8. 兩等弦相交：扣掉共同的弧 ─────────
def equal_chords(xx, yy, t0=150):
    c = Circ()
    dA, dC, dB, dD = t0, t0 + xx, t0 + xx + yy, t0 + 2 * xx + yy
    A, C, B, D = c.p('A', dA), c.p('C', dC), c.p('B', dB), c.p('D', dD)
    c.seg(A, B)
    c.seg(C, D)
    c.arc(dC, dB, lab(yy), color='#2f6fbf')
    c.arc(dB, dD, '?')
    return with_figure(value(
        rf'如圖，圓 $O$ 中兩弦 $\overline{{AB}}=\overline{{CD}}$，{A_("ACB")} $={xx + yy}^\circ$，{A_("BC")} $={yy}^\circ$，{A_("BD")} 是幾度？',
        xx,
        dpick(xx, [xx + yy, yy, R(xx + yy, 2), 360 - 2 * xx - yy]),
        rf'等弦對等弧：{A_("ACB")} $=$ {A_("DBC")} $={xx + yy}^\circ$。兩段都包含 {A_("BC")}，'
        rf'扣掉後 {A_("BD")} $={xx + yy}^\circ-{yy}^\circ={xx}^\circ$（和 {A_("AC")} 一樣大）。'),
        c.svg())


# ───────── 9. 同圓中度數加倍 ─────────
def double_arc(a, r):
    c = Circ(oat=(0, 1))
    A, B = c.p('A', 200), c.p('B', 200 + a)
    C, D = c.p('C', 300), c.p('D', 300 + 2 * a)
    for p in (A, B, C, D):
        c.rad(p)
    c.angle(c.O, A, B, lab(a), r=14)
    c.angle(c.O, C, D, lab(2 * a), r=18)
    c.seg(A, B, dash=True)
    c.seg(C, D, dash=True)
    L1 = 2 * pi * r * R(a, 360)
    return with_figure(statement(
        rf'如圖，半徑 ${r}$ 的圓 $O$ 中，$\angle AOB={a}^\circ$、$\angle COD={2 * a}^\circ$。下列何者正確？',
        [(rf'{A_("CD")} 的長度是 {A_("AB")} 的 $2$ 倍', True),
         (r'弦 $\overline{CD}$ 的長度是弦 $\overline{AB}$ 的 $2$ 倍', False),
         (rf'{A_("CD")} 的度數是 ${a}^\circ$', False),
         (rf'{A_("AB")} 和 {A_("CD")} 的長度都是 ${etex(L1)}$', False)],
        rf'同圓中弧長和度數成正比：{A_("AB")} $={etex(L1)}$、{A_("CD")} $={etex(2 * L1)}$，是 $2$ 倍。'
        r'弦長不和圓心角成正比：例如 $180^\circ$ 所對的弦是直徑 $2r$，$90^\circ$ 所對的弦是 $\sqrt{2}r$，不是 $r$。'),
        c.svg())


# ───────── 10. 由弧長反求度數 ─────────
def deg_from_len(r, a, mid):
    Lx = 2 * pi * r * R(a, 360)
    c = Circ(oat=away(mid))
    d0, d1 = mid - a / 2, mid + a / 2
    A, B = c.p('A', d0), c.p('B', d1)
    c.rad(A)
    c.rad(B)
    c.angle(c.O, A, B, '?', r=16)
    k = Lx / pi
    assert k.q == 1
    c.arc(d0, d1, f'{k}π')
    c.f.side(c.O, B, str(r), away=A)
    return with_figure(value(
        rf'如圖，圓 $O$ 的半徑是 ${r}$，{A_("AB")} 的長度是 ${etex(Lx)}$，{A_("AB")} 的度數是多少？',
        a,
        dpick(a, [R(a, 2), 2 * a, 360 - a, a + 30]),
        rf'設度數 $x^\circ$：$2\pi\times{r}\times\dfrac{{x}}{{360}}={etex(Lx)}$，$x={a}$。也可以算：周長 ${etex(2 * pi * r)}$，弧長占 $\dfrac{{{a}}}{{360}}$。'),
        c.svg())


SLOTS = [
    slot(1, '弧的度數＝圓心角', [minor_deg(72, 270), minor_deg(130, 90), minor_deg(48, 300)]),
    slot(2, '優弧的度數', [major_deg(110, 270), major_deg(64, 300), major_deg(145, 90)]),
    slot(3, '由弧的度數算弧長', [arc_length(6, 120, 270), arc_length(9, 80, 90), arc_length(12, 150, 280)]),
    slot(4, '同心圓：度數相等、弧長不等', [concentric_stmt(6, 9, 120), concentric_stmt(6, 10, 90), concentric_stmt(5, 8, 135)]),
    slot(5, '同心圓：兩弧長相差多少', [concentric_diff(6, 9, 80), concentric_diff(7, 10, 72), concentric_diff(3, 5, 108)]),
    slot(6, '等弧對等弦、等弦對等弧的理由', [congruence('SAS'), congruence('SSS'), congruence('SAS3')]),
    slot(7, '正多邊形：等弦對等弧', [polygon(5, 2), polygon(6, 2), polygon(8, 3)]),
    slot(8, '兩等弦相交：扣掉共同的弧', [equal_chords(90, 60), equal_chords(70, 80, 160), equal_chords(50, 100, 140)]),
    slot(9, '同圓中弧長與度數成正比（弦長不是）', [double_arc(40, 9), double_arc(50, 6), double_arc(60, 12)]),
    slot(10, '由弧長反求弧的度數', [deg_from_len(9, 60, 270), deg_from_len(8, 135, 90), deg_from_len(10, 72, 280)]),
]

if __name__ == '__main__':
    export('g9-2-2a', '2-2 圓心角、圓周角與弧（1）圓心角與弧 課後檢核', '依課本 2-2 p.110–114（弧的度數、例 1 同心圓、例 2 等弧對等弦、例 3 等弦對等弧與隨堂）自編換數字題', SLOTS)
