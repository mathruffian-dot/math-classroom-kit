r"""2-2(2) 圓周角與弧：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一，每題附圖）。

用法：C:\AI\H3\venv\Scripts\python.exe -B -X utf8 scripts/quiz-src/g9-2-2b.py
範圍：2-2(1) 圓心角與弧＋這一堂的圓周角（頂點在圓上、兩邊是弦）、圓周角＝所對弧度數的一半＝同弧圓心角的一半、
同弧所對的圓周角相等、圓周角對的是「不含頂點」的那一段弧（例 5(2) 對優弧）、例 4 的半圓弧 180°；
先備：等腰三角形底角相等、三角形內角和。
「直徑所對的圓周角是直角」是下一堂（2-2(3)）的重點，這裡只用課本例 4 的「半圓弧＝180°」。
不用平行弦（2-2(3)）、圓內接四邊形與作切線（2-2(4)）。
附圖都用題目的同一組數字畫（角度照實際大小），題目問的角標「?」。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from arcfig import A_, Circ, R, away, dpick, lab  # noqa: E402
from quizlib import export, slot, statement, value, with_figure  # noqa: E402


def insc(m, b=240, a=100, center=False, arc_lab=True, a_lab='?', o_lab=None, radii=False):
    """B 在角度 b、C 在 b＋m（弧 BC＝m°，逆時針），A 在優弧上角度 a；回傳 (Circ, A, B, C)。"""
    c = Circ(center=center or radii, oat=away(b + m / 2) if (center or radii) else (0.9, -0.9))
    B, C = c.p('B', b), c.p('C', b + m)
    A = c.p('A', a)
    c.seg(A, B)
    c.seg(A, C)
    if arc_lab:
        c.arc(b, b + m, arc_lab if isinstance(arc_lab, str) else None)
    if radii:
        c.rad(B)
        c.rad(C)
        c.angle(c.O, B, C, o_lab, r=15)
    c.angle(A, B, C, a_lab, r=20)
    return c, A, B, C


# ───────── 1. 由弧求圓周角 ─────────
def from_arc(m, b, a):
    c, *_ = insc(m, b, a, arc_lab=lab(m))
    return with_figure(value(
        rf'如圖，$A$、$B$、$C$ 在圓上，{A_("BC")} $={m}^\circ$，圓周角 $\angle BAC$ 是幾度？',
        R(m, 2),
        dpick(R(m, 2), [m, 2 * m, 180 - R(m, 2), 360 - m]),
        rf'圓周角是所對弧度數的一半：$\angle BAC=\dfrac{{1}}{{2}}\times{m}^\circ={R(m, 2)}^\circ$。'),
        c.svg())


# ───────── 2. 由圓心角求圓周角 ─────────
def from_central(m, b, a):
    c, *_ = insc(m, b, a, arc_lab=True, radii=True, o_lab=lab(m))
    return with_figure(value(
        rf'如圖，圓 $O$ 中 $\angle BOC={m}^\circ$，$A$ 在優弧上，$\angle BAC$ 是幾度？',
        R(m, 2),
        dpick(R(m, 2), [m, 2 * m, 180 - m, 90 - R(m, 2)]),
        rf'$\angle BAC$ 和 $\angle BOC$ 對同一段 {A_("BC")}：圓周角是圓心角的一半，$\angle BAC=\dfrac{{1}}{{2}}\times{m}^\circ={R(m, 2)}^\circ$。'),
        c.svg())


# ───────── 3. 由圓周角求圓心角 ─────────
def to_central(k, b, a):
    c, *_ = insc(2 * k, b, a, arc_lab=True, radii=True, o_lab='?', a_lab=lab(k))
    return with_figure(value(
        rf'如圖，圓 $O$ 中 $\angle BAC={k}^\circ$，$\angle BOC$ 是幾度？',
        2 * k,
        dpick(2 * k, [k, R(k, 2), 180 - 2 * k, 360 - 2 * k, 180 - k]),
        rf'同弧 {A_("BC")} 所對的圓心角是圓周角的 $2$ 倍：$\angle BOC=2\times{k}^\circ={2 * k}^\circ$。'),
        c.svg())


# ───────── 4. 同弧所對的圓周角相等 ─────────
def same_arc(k, base=250, cd=(70, 140)):
    c = Circ(center=False)
    m = 2 * k
    A, B = c.p('A', base), c.p('B', base + m)
    C, D = c.p('C', cd[0]), c.p('D', cd[1])
    for p in (C, D):
        c.seg(p, A)
        c.seg(p, B)
    c.arc(base, base + m)
    c.angle(C, A, B, lab(k), r=22)
    c.angle(D, A, B, '?', r=22)
    return with_figure(value(
        rf'如圖，$A$、$B$、$C$、$D$ 在圓上，$\angle ACB={k}^\circ$，$\angle ADB$ 是幾度？',
        k,
        dpick(k, [2 * k, R(k, 2), 180 - k, 90 - k]),
        rf'$\angle ACB$、$\angle ADB$ 都對 {A_("AB")}，同弧所對的圓周角相等：$\angle ADB={k}^\circ$（都是 {A_("AB")} $={2 * k}^\circ$ 的一半）。'),
        c.svg())


# ───────── 5. 半圓弧 180°（課本例 4） ─────────
def half_circle(m, cdeg=110):
    """AB 為直徑（A 在 180°、B 在 0°），D 在下半圓、{A_('BD')}＝m，C 在上半圓；求 ∠ACD。"""
    c = Circ(oat=(0.3, 1))
    A, B = c.p('A', 180), c.p('B', 0)
    D = c.p('D', 360 - m)
    C = c.p('C', cdeg)
    c.seg(A, B)
    c.seg(C, A)
    c.seg(C, D)
    c.arc(360 - m, 360, lab(m), color='#2f6fbf')
    c.angle(C, A, D, '?', r=22)
    ans = R(180 - m, 2)
    return with_figure(value(
        rf'如圖，$\overline{{AB}}$ 是圓 $O$ 的直徑，{A_("BD")} $={m}^\circ$，$\angle ACD$ 是幾度？',
        ans,
        dpick(ans, [R(m, 2), 180 - m, m, 90 - m if m < 90 else 90 + R(m, 2), 180 - R(m, 2), R(180 - m, 4)]),
        rf'直徑把圓分成兩個半圓，半圓弧 $180^\circ$：{A_("AD")} $=180^\circ-{m}^\circ={180 - m}^\circ$。'
        rf'$\angle ACD$ 對的是 {A_("AD")}，$\angle ACD=\dfrac{{1}}{{2}}\times{180 - m}^\circ={ans}^\circ$。'),
        c.svg())


# ───────── 6. 圓周角對另一段弧（優弧） ─────────
def other_arc(m, a0=210, bdeg=60):
    """∠AOC＝m（劣弧 ADC），D 在劣弧上，B 在優弧上；求 ∠ADC（對優弧 ABC）。"""
    c = Circ(oat=away(a0 + m / 2))
    A, C = c.p('A', a0), c.p('C', a0 + m)
    D = c.p('D', a0 + m / 2)
    B = c.p('B', bdeg)
    c.rad(A)
    c.rad(C)
    c.angle(c.O, A, C, lab(m), r=15)
    c.seg(D, A)
    c.seg(D, C)
    c.seg(B, A)
    c.seg(B, C)
    c.angle(D, A, C, '?', r=16)
    ans = R(360 - m, 2)
    return with_figure(value(
        rf'如圖，圓 $O$ 中 $\angle AOC={m}^\circ$，$D$ 在 {A_("AC")}（較短的弧）上，$\angle ADC$ 是幾度？',
        ans,
        dpick(ans, [R(m, 2), m, 360 - m, 180 - m, 90 + R(m, 4)]),
        rf'$\angle ADC$ 的頂點 $D$ 在較短的弧上，它對的是另一段 {A_("ABC")} $=360^\circ-{m}^\circ={360 - m}^\circ$，'
        rf'$\angle ADC=\dfrac{{1}}{{2}}\times{360 - m}^\circ={ans}^\circ$。直接算 ${m}^\circ\div2$ 是 $\angle ABC$。'),
        c.svg())


# ───────── 7. 圓周角與等腰三角形 ─────────
def isosceles(k, b=240, a=95):
    c, A, B, C = insc(2 * k, b, a, arc_lab=False, radii=True, a_lab=lab(k))
    c.seg(B, C)
    c.angle(B, c.O, C, '?', r=22)
    ans = 90 - k
    return with_figure(value(
        rf'如圖，圓 $O$ 中 $\angle BAC={k}^\circ$，連接 $\overline{{OB}}$、$\overline{{OC}}$、$\overline{{BC}}$，$\angle OBC$ 是幾度？',
        ans,
        dpick(ans, [k, 2 * k, 180 - 2 * k, 90 - R(k, 2)]),
        rf'$\angle BOC=2\angle BAC={2 * k}^\circ$。$\overline{{OB}}=\overline{{OC}}$（半徑），等腰三角形底角相等：'
        rf'$\angle OBC=\dfrac{{180^\circ-{2 * k}^\circ}}{{2}}={ans}^\circ$。'),
        c.svg())


# ───────── 8. 這個角對的是哪一段弧 ─────────
QUAD = {'A': 230, 'B': 320, 'C': 40, 'D': 140}


def which_arc(vertex, sides, right, wrongs):
    c = Circ(center=False)
    P = {k: c.p(k, d) for k, d in QUAD.items()}
    for s in ('AB', 'BC', 'CD', 'DA'):
        c.seg(P[s[0]], P[s[1]], color='#9a9a9a', width=1.1)
    c.seg(P[vertex], P[sides[0]])
    c.seg(P[vertex], P[sides[1]])
    c.angle(P[vertex], P[sides[0]], P[sides[1]], '?', r=20)
    name = rf'\angle {sides[0]}{vertex}{sides[1]}'
    return with_figure(statement(
        rf'如圖，$A$、$B$、$C$、$D$ 依序在圓上。圓周角 ${name}$ 所對的弧是哪一段？',
        [(A_(right), True)] + [(A_(w), False) for w in wrongs],
        rf'圓周角對的是兩邊之間、不含頂點 ${vertex}$ 的那一段弧：${name}$ 對 {A_(right)}，${name}=\dfrac{{1}}{{2}}$ {A_(right)}。'),
        c.svg())


# ───────── 9. 弧、圓心角、圓周角的關係 ─────────
def relations(m):
    c = Circ(oat=away(270))
    A, C = c.p('A', 270 - m / 2), c.p('C', 270 + m / 2)
    B = c.p('B', 100)
    c.rad(A)
    c.rad(C)
    c.seg(B, A)
    c.seg(B, C)
    c.arc(270 - m / 2, 270 + m / 2, lab(m))
    return with_figure(statement(
        rf'如圖，圓 $O$ 中 {A_("AC")} $={m}^\circ$，$B$ 在優弧上。下列何者正確？',
        [(rf'$\angle ABC={R(m, 2)}^\circ$', True),
         (rf'$\angle ABC={m}^\circ$', False),
         (rf'$\angle AOC={R(m, 2)}^\circ$', False),
         (rf'$\angle ABC={2 * m}^\circ$', False)],
        rf'圓心角等於弧的度數：$\angle AOC={m}^\circ$；圓周角是一半：$\angle ABC={R(m, 2)}^\circ$。'),
        c.svg())


# ───────── 10. 三點把圓分成比例的三段弧 ─────────
def ratio(p, q, r):
    s = p + q + r
    arcs = [R(360 * p, s), R(360 * q, s), R(360 * r, s)]
    c = Circ(center=False)
    dA = 200
    A = c.p('A', dA)
    B = c.p('B', dA + arcs[0])
    C = c.p('C', dA + arcs[0] + arcs[1])
    c.seg(A, B)
    c.seg(B, C)
    c.seg(C, A)
    c.arc(dA, dA + float(arcs[0]))
    c.angle(C, A, B, '?', r=20)
    ans = arcs[0] / 2
    return with_figure(value(
        rf'如圖，$A$、$B$、$C$ 把圓分成三段弧，{A_("AB")}：{A_("BC")}：{A_("CA")} $={p}:{q}:{r}$（都不含第三個點），$\angle ACB$ 是幾度？',
        ans,
        dpick(ans, [arcs[0], arcs[1] / 2, arcs[2] / 2, 180 - ans, R(360, s)]),
        rf'{A_("AB")} $=360^\circ\times\dfrac{{{p}}}{{{s}}}={arcs[0]}^\circ$，$\angle ACB$ 對 {A_("AB")}：$\angle ACB=\dfrac{{1}}{{2}}\times{arcs[0]}^\circ={ans}^\circ$。'),
        c.svg())


SLOTS = [
    slot(1, '圓周角是所對弧的一半', [from_arc(100, 240, 90), from_arc(76, 250, 110), from_arc(130, 205, 80)]),
    slot(2, '圓周角是同弧圓心角的一半', [from_central(140, 200, 80), from_central(84, 250, 100), from_central(110, 215, 75)]),
    slot(3, '由圓周角求圓心角', [to_central(31, 240, 95), to_central(54, 225, 80), to_central(40, 235, 120)]),
    slot(4, '同弧所對的圓周角相等', [same_arc(35), same_arc(52, 240, (60, 130)), same_arc(28, 255, (75, 150))]),
    slot(5, '直徑與半圓弧 180°（例 4）', [half_circle(72), half_circle(50, 120), half_circle(104, 100)]),
    slot(6, '圓周角對另一段弧（例 5）', [other_arc(130), other_arc(100, 220, 70), other_arc(150, 195, 50)]),
    slot(7, '圓周角與等腰三角形', [isosceles(50), isosceles(35, 250, 100), isosceles(62, 225, 90)]),
    slot(8, '找出圓周角所對的弧', [
        which_arc('D', 'AB', 'AB', ['AD', 'BC', 'BCD']),
        which_arc('A', 'BC', 'BC', ['AB', 'CD', 'ADC']),
        which_arc('B', 'AD', 'AD', ['AB', 'CD', 'BCD']),
    ]),
    slot(9, '弧、圓心角、圓周角的關係', [relations(60), relations(110), relations(84)]),
    slot(10, '三點分圓周：比例求圓周角', [ratio(2, 3, 4), ratio(1, 2, 3), ratio(3, 4, 5)]),
]

if __name__ == '__main__':
    export('g9-2-2b', '2-2 圓心角、圓周角與弧（2）圓周角與弧 課後檢核', '依課本 2-2 p.114–118（圓周角、問題探索三種情形、例 4 同弧與半圓弧、例 5 與隨堂）自編換數字題', SLOTS)
