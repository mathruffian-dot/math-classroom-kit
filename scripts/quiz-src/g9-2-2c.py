r"""2-2(3) 半圓與平行弦：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一，每題附圖）。

用法：C:\AI\H3\venv\Scripts\python.exe -B -X utf8 scripts/quiz-src/g9-2-2c.py
範圍：2-2(1)(2)＋這一堂的所對的弧拆成幾段相加（例 6）、等分點、直徑（半圓）所對的圓周角是直角、
一圓中兩弦平行⇒所截的兩弧相等（例 7：連弦得內錯角，再用圓周角）；先備：三角形內角和、平行線內錯角相等。
不用圓內接四邊形對角互補與外角（2-2(4)）、過圓外一點作切線（2-2(4)）。
附圖都用題目的同一組數字畫（角度照實際大小），題目問的角或弧標「?」。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from arcfig import A_, BLUE_ARC, Circ, R, away, dpick, lab  # noqa: E402
from quizlib import export, slot, statement, value, with_figure  # noqa: E402


# ───────── 1. 所對的弧拆成兩段（例 6(1)） ─────────
def split_sum(p, q, a0=200, bdeg=60):
    """{AD}＝p、∠COD＝q（{CD}＝q），∠ABC 對 {ADC}＝p＋q。"""
    c = Circ(oat=away(a0 + p + q / 2))
    A, D, C = c.p('A', a0), c.p('D', a0 + p), c.p('C', a0 + p + q)
    B = c.p('B', bdeg)
    c.seg(B, A)
    c.seg(B, C)
    c.rad(C)
    c.rad(D)
    c.angle(c.O, D, C, lab(q), r=15)
    c.arc(a0, a0 + p, lab(p), color=BLUE_ARC)
    c.angle(B, A, C, '?', r=20)
    ans = R(p + q, 2)
    return with_figure(value(
        rf'如圖，$A$、$B$、$C$、$D$ 在圓 $O$ 上，{A_("AD")} $={p}^\circ$，$\angle COD={q}^\circ$，$\angle ABC$ 是幾度？',
        ans,
        dpick(ans, [p + q, R(p, 2) + q, R(q, 2), p + R(q, 2), 180 - ans]),
        rf'{A_("CD")} $=\angle COD={q}^\circ$。$\angle ABC$ 對 {A_("ADC")} $=$ {A_("AD")} $+$ {A_("CD")} $={p + q}^\circ$，'
        rf'$\angle ABC=\dfrac{{1}}{{2}}\times{p + q}^\circ={ans}^\circ$。'),
        c.svg())


# ───────── 2. 由圓周角反求一段弧（例 6(2)） ─────────
def split_back(t, q, a0=150):
    """∠DAB＝t 對 {DCB}＝{CD}＋{BC}；已知 {CD}＝q，求 {BC}。順序 A、D、C、B（逆時針）。"""
    bc = 2 * t - q
    rest = 360 - q - bc
    assert bc > 0 and rest > 40
    dA = a0
    dD = dA + rest * 0.45
    dC = dD + q
    dB = dC + bc
    c = Circ(center=False)
    A, D, C, B = c.p('A', dA), c.p('D', dD), c.p('C', dC), c.p('B', dB)
    c.seg(A, D)
    c.seg(A, B)
    c.arc(dD, dC, lab(q), color=BLUE_ARC)
    c.arc(dC, dB, '?')
    c.angle(A, D, B, lab(t), r=20)
    return with_figure(value(
        rf'如圖，$A$、$B$、$C$、$D$ 在圓上，$\angle DAB={t}^\circ$，{A_("CD")} $={q}^\circ$，{A_("BC")} 是幾度？',
        bc,
        dpick(bc, [2 * t, t - R(q, 2), 2 * t + q, t, 360 - 2 * t]),
        rf'$\angle DAB$ 對 {A_("DCB")} $=$ {A_("CD")} $+$ {A_("BC")}：${t}^\circ=\dfrac{{1}}{{2}}\times{q}^\circ+\dfrac{{1}}{{2}}$ {A_("BC")}，'
        rf'{A_("BC")} $=2\times{t}^\circ-{q}^\circ={bc}^\circ$。'),
        c.svg())


# ───────── 3. 等分點 ─────────
def equal_parts(nn, k, cpos):
    c = Circ(center=False)
    base = 250
    pts = [c.at(base + 360 * i / nn) for i in range(nn)]
    for p in pts:
        c.f.dot(p, c.r * 0.035)
    A = c.p('A', base)
    B = c.p('B', base + 360 * k / nn)
    C = c.p('C', base + 360 * cpos / nn)
    c.seg(C, A)
    c.seg(C, B)
    c.arc(base, base + 360 * k / nn)
    c.angle(C, A, B, '?', r=20)
    ans = R(180 * k, nn)
    return with_figure(value(
        rf'如圖，圓周上有 ${nn}$ 個等分點，$A$、$B$、$C$ 是其中三點，{A_("AB")}（不含 $C$）占 ${k}$ 格，$\angle ACB$ 是幾度？',
        ans,
        dpick(ans, [R(360 * k, nn), R(360, nn), R(180, nn), 180 - ans]),
        rf'一格是 $360^\circ\div{nn}={R(360, nn)}^\circ$，{A_("AB")} $={R(360 * k, nn)}^\circ$，'
        rf'$\angle ACB=\dfrac{{1}}{{2}}\times{R(360 * k, nn)}^\circ={ans}^\circ$。'),
        c.svg())


def diam(cdeg, oat=(0.25, -1)):
    c = Circ(oat=oat)
    A, B = c.p('A', 180), c.p('B', 0)
    C = c.p('C', cdeg)
    c.seg(A, B)
    c.seg(C, A)
    c.seg(C, B)
    return c, A, B, C


# ───────── 4. 直徑所對的圓周角是直角 ─────────
def right_tri(t):
    """AB 直徑，∠CAB＝t：C 的位置在角度 180−2t（弧 BC＝2t）。"""
    c, A, B, C = diam(2 * t)
    c.angle(A, B, C, lab(t), r=24)
    c.angle(B, A, C, '?', r=22)
    ans = 90 - t
    return with_figure(value(
        rf'如圖，$\overline{{AB}}$ 是圓 $O$ 的直徑，$C$ 在圓上，$\angle CAB={t}^\circ$，$\angle ABC$ 是幾度？',
        ans,
        dpick(ans, [t, 180 - t, 2 * t, 180 - 2 * t]),
        rf'$\overline{{AB}}$ 是直徑，$\angle ACB$ 對半圓，$\angle ACB=90^\circ$。'
        rf'三角形內角和：$\angle ABC=180^\circ-90^\circ-{t}^\circ={ans}^\circ$。'),
        c.svg())


# ───────── 5. 直徑＋同弧 ─────────
def diam_same_arc(t, ddeg=290):
    """AB 直徑，∠BAC＝t，D 在下半圓；∠ADC＝∠ABC＝90−t。"""
    c, A, B, C = diam(2 * t, oat=(0.6, 0.9))
    D = c.p('D', ddeg)
    c.seg(D, A)
    c.seg(D, C)
    c.angle(A, B, C, lab(t), r=26)
    c.angle(D, A, C, '?', r=22)
    ans = 90 - t
    return with_figure(value(
        rf'如圖，$\overline{{AB}}$ 是圓 $O$ 的直徑，$\angle BAC={t}^\circ$，$D$ 在圓上，$\angle ADC$ 是幾度？',
        ans,
        dpick(ans, [t, 2 * t, 90 + t, 180 - 2 * t]),
        rf'$\angle ACB=90^\circ$（半圓），$\angle ABC=90^\circ-{t}^\circ={ans}^\circ$。$\angle ADC$、$\angle ABC$ 都對 {A_("AC")}：$\angle ADC={ans}^\circ$。'),
        c.svg())


# ───────── 6. 直徑所對的圓周角：判斷 ─────────
def diam_stmt(t):
    c, A, B, C = diam(2 * t)
    c.angle(A, B, C, lab(t), r=24)
    return with_figure(statement(
        rf'如圖，$\overline{{AB}}$ 是圓 $O$ 的直徑，$C$ 在圓上，$\angle CAB={t}^\circ$。下列何者正確？',
        [(r'$\angle ACB=90^\circ$', True),
         (r'$\angle ACB=180^\circ$', False),
         (rf'$\angle ACB={2 * t}^\circ$', False),
         (rf'$\angle ABC={t}^\circ$', False)],
        rf'$\angle ACB$ 對的是半圓（$180^\circ$ 的弧），$\angle ACB=\dfrac{{1}}{{2}}\times180^\circ=90^\circ$，'
        rf'所以 $\angle ABC=90^\circ-{t}^\circ={90 - t}^\circ$。$180^\circ$ 是弧的度數，不是角。'),
        c.svg())


def par_fig(u, s, ask_arc=None, labels=None, bc=False):
    """AB ∥ CD（水平）：{AB}＝u 在上方，{AC}＝{BD}＝s。"""
    c = Circ(center=False)
    dA, dB = 90 + u / 2, 90 - u / 2
    dC, dD = dA + s, dB - s
    A, B, C, D = c.p('A', dA), c.p('B', dB), c.p('C', dC), c.p('D', dD)
    c.seg(A, B)
    c.seg(C, D)
    if bc:
        c.seg(B, C)
    for d0, d1, txt in (labels or []):
        c.arc(d0, d1, txt, color=BLUE_ARC if txt != '?' else '#d2541b')
    return c, A, B, C, D, (dA, dB, dC, dD)


# ───────── 7. 平行弦截等弧：求第四段 ─────────
def par_fourth(u, s):
    cd = 360 - u - 2 * s
    dA, dB = 90 + u / 2, 90 - u / 2
    c, *_ = par_fig(u, s, labels=[(dB, dA, lab(u)), (dA, dA + s, lab(s)), (dA + s, dB - s + 360, '?')])
    return with_figure(value(
        rf'如圖，圓上兩弦 $\overline{{AB}}\parallel\overline{{CD}}$，{A_("AB")} $={u}^\circ$，{A_("AC")} $={s}^\circ$，{A_("CD")} 是幾度？',
        cd,
        dpick(cd, [u, 360 - u - s, s, 180 - u]),
        rf'平行弦所截的弧相等：{A_("BD")} $=$ {A_("AC")} $={s}^\circ$。{A_("CD")} $=360^\circ-{u}^\circ-{s}^\circ-{s}^\circ={cd}^\circ$。'
        rf'兩弦平行，不代表 {A_("CD")} $=$ {A_("AB")}。'),
        c.svg())


# ───────── 8. 平行＋內錯角＋圓周角 ─────────
def par_angle(t, u):
    s = 2 * t
    dA, dB = 90 + u / 2, 90 - u / 2
    c, A, B, C, D, _ = par_fig(u, s, labels=[(dB - s, dB, '?')], bc=True)
    c.angle(B, A, C, lab(t), r=22)
    return with_figure(value(
        rf'如圖，圓上兩弦 $\overline{{AB}}\parallel\overline{{CD}}$，連接 $\overline{{BC}}$，$\angle ABC={t}^\circ$，{A_("BD")} 是幾度？',
        s,
        dpick(s, [t, 180 - t, 4 * t, 180 - 2 * t]),
        rf'$\overline{{AB}}\parallel\overline{{CD}}$，內錯角 $\angle BCD=\angle ABC={t}^\circ$。$\angle BCD$ 對 {A_("BD")}：'
        rf'{A_("BD")} $=2\times{t}^\circ={s}^\circ$（也等於 {A_("AC")}）。'),
        c.svg())


# ───────── 9. 直徑：由弧求另一個角 ─────────
def diam_arc(x):
    c, A, B, C = diam(2 * x)
    c.arc(0, 2 * x, lab(2 * x), color=BLUE_ARC)
    c.angle(B, A, C, '?', r=22)
    ans = 90 - x
    return with_figure(value(
        rf'如圖，$\overline{{AB}}$ 是圓 $O$ 的直徑，{A_("BC")} $={2 * x}^\circ$，$\angle ABC$ 是幾度？',
        ans,
        dpick(ans, [x, 2 * x, 180 - 2 * x, 90 + x]),
        rf'$\angle BAC$ 對 {A_("BC")}：$\angle BAC={x}^\circ$。$\angle ACB=90^\circ$（半圓），$\angle ABC=180^\circ-90^\circ-{x}^\circ={ans}^\circ$。'),
        c.svg())


# ───────── 10. 四段弧：所對的弧是兩段的和 ─────────
def four_arcs(a1, a2, a3, a0=200):
    a4 = 360 - a1 - a2 - a3
    assert a4 > 20
    c = Circ(center=False)
    dA, dB, dC, dD = a0, a0 + a1, a0 + a1 + a2, a0 + a1 + a2 + a3
    A, B, C, D = c.p('A', dA), c.p('B', dB), c.p('C', dC), c.p('D', dD)
    c.seg(C, B)
    c.seg(C, D)
    c.arc(dA, dB, lab(a1), color=BLUE_ARC)
    c.arc(dB, dC, lab(a2), color=BLUE_ARC)
    c.arc(dC, dD, lab(a3), color=BLUE_ARC)
    c.angle(C, B, D, '?', r=20)
    ans = R(a4 + a1, 2)
    return with_figure(value(
        rf'如圖，$A$、$B$、$C$、$D$ 依序在圓上，{A_("AB")} $={a1}^\circ$，{A_("BC")} $={a2}^\circ$，{A_("CD")} $={a3}^\circ$，$\angle BCD$ 是幾度？',
        ans,
        dpick(ans, [R(a1, 2), R(a2 + a3, 2), a4 + a1, R(a4, 2)]),
        rf'{A_("DA")} $=360^\circ-{a1}^\circ-{a2}^\circ-{a3}^\circ={a4}^\circ$。$\angle BCD$ 對 {A_("BAD")} $=$ {A_("DA")} $+$ {A_("AB")} $={a4 + a1}^\circ$，'
        rf'$\angle BCD={ans}^\circ$。'),
        c.svg())


SLOTS = [
    slot(1, '所對的弧拆成兩段相加', [split_sum(60, 100), split_sum(40, 90, 210, 50), split_sum(56, 84, 195, 70)]),
    slot(2, '由圓周角反求一段弧', [split_back(100, 70), split_back(105, 90, 140), split_back(80, 60, 160)]),
    slot(3, '等分點：先算一格幾度', [equal_parts(10, 3, 6), equal_parts(12, 4, 8), equal_parts(9, 2, 5)]),
    slot(4, '直徑所對的圓周角是直角', [right_tri(34), right_tri(52), right_tri(23)]),
    slot(5, '直徑＋同弧所對的圓周角', [diam_same_arc(25), diam_same_arc(38, 300), diam_same_arc(56, 280)]),
    slot(6, '判斷：半圓所對的角', [diam_stmt(30), diam_stmt(42), diam_stmt(65)]),
    slot(7, '平行弦截等弧：求另一段弧', [par_fourth(100, 50), par_fourth(80, 70), par_fourth(110, 40)]),
    slot(8, '平行弦：內錯角再用圓周角', [par_angle(35, 90), par_angle(25, 110), par_angle(40, 70)]),
    slot(9, '直徑：由弧求三角形的角', [diam_arc(32), diam_arc(40), diam_arc(26)]),
    slot(10, '四段弧：所對的弧是兩段的和', [four_arcs(80, 100, 70), four_arcs(60, 110, 90), four_arcs(90, 80, 120)]),
]

if __name__ == '__main__':
    export('g9-2-2c', '2-2 圓心角、圓周角與弧（3）半圓與平行弦 課後檢核', '依課本 2-2 p.118–120（例 6 拆弧、隨堂等分點、直徑所對的圓周角、例 7 平行弦與隨堂）自編換數字題', SLOTS)
