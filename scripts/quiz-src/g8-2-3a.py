r"""2-3(1) 畢氏定理與邊長計算：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一，每題附圖）。

用法：python -X utf8 scripts/quiz-src/g8-2-3a.py
範圍：2-1 平方根、2-2 根式的運算（化成最簡根式）＋這一堂的斜邊與股、a²＋b²＝c²、三邊上正方形的面積、
已知兩股求斜邊、已知一股與斜邊求另一股、梯子靠牆（課本例 2 隨堂的雲梯）。
不用斜邊上的高、複合圖形、竹竿下滑、對角線（2-3(2)）與坐標平面上的距離（2-3(3)）。
附圖都用題目的同一組數字畫（比例照實際長度），題目問的那一段標「?」。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import sqrt  # noqa: E402

from pyth import bad_root, hyp_bottom, lab, ladder_fig, right_tri, root, rtex, squares_fig  # noqa: E402
from quizlib import export, form, raw, slot, statement, value, with_figure  # noqa: E402

S = sqrt
ov = lambda s: rf'$\overline{{{s}}}$'  # noqa: E731


def q_int(n):
    return raw(f'${n}$', n)


# ───────── 1. 哪一邊是斜邊 ─────────
def which_hyp(right, names, corner, hyp, legs):
    """right：直角頂點名稱；hyp：斜邊名稱；legs：兩股名稱。"""
    svg = right_tri(4, 3, ('', '', ''), names=names, corner=corner)
    return with_figure(statement(
        rf'如圖，$\triangle ABC$ 中 $\angle {right}=90^\circ$，哪一邊是斜邊？',
        [(ov(hyp), True), (ov(legs[0]), False), (ov(legs[1]), False), ('最長的邊要量過才知道', False)],
        rf'直角所對的邊是斜邊：$\angle {right}$ 的對邊是 {ov(hyp)}，{ov(legs[0])}、{ov(legs[1])} 是兩股。'), svg)


# ───────── 2. 畢氏定理的式子 ─────────
def eq_text(x, y, z):
    return rf'$\overline{{{x}}}^2+\overline{{{y}}}^2=\overline{{{z}}}^2$'


def which_eq(right, names, corner, l1, l2, hyp):
    svg = right_tri(4, 3, ('', '', ''), names=names, corner=corner, fill='#cfd8ee')
    return with_figure(statement(
        rf'如圖，$\triangle ABC$ 中 $\angle {right}=90^\circ$，下列哪一個式子正確？',
        [(eq_text(l1, l2, hyp), True), (eq_text(l1, hyp, l2), False), (eq_text(l2, hyp, l1), False),
         (rf'$\overline{{{l1}}}+\overline{{{l2}}}=\overline{{{hyp}}}$', False)],
        rf'$\angle {right}$ 的對邊 {ov(hyp)} 是斜邊：兩股平方和＝斜邊平方，{eq_text(l1, l2, hyp)}。兩股相加不等於斜邊。'), svg)


# ───────── 3. 三邊上正方形的面積 ─────────
def square_hyp(p, q):
    """甲（鉛垂股上）面積 p、乙（水平股上）面積 q，求丙（斜邊上）。"""
    return with_figure(value(
        rf'如圖，直角三角形 $ABC$ 中 $\angle C=90^\circ$，以三邊為邊長向外作正方形甲、乙、丙。甲、乙的面積分別是 ${p}$、${q}$，丙的面積是多少？',
        p + q,
        [q_int(p + q), q_int(abs(q - p)), q_int(p * q), root(p + q)],
        rf'兩股上的正方形面積和＝斜邊上的正方形面積：丙 $={p}+{q}={p + q}$。'),
        squares_fig(float(S(q)), float(S(p)), (f'甲 {p}', f'乙 {q}', '丙 ?')))


def square_leg(p, r):
    """甲面積 p、丙面積 r，求乙。"""
    return with_figure(value(
        rf'如圖，直角三角形 $ABC$ 中 $\angle C=90^\circ$，以三邊為邊長向外作正方形甲、乙、丙。甲、丙的面積分別是 ${p}$、${r}$，乙的面積是多少？',
        r - p,
        [q_int(r - p), q_int(r + p), root(r - p), q_int(r - 2 * p)],
        rf'甲＋乙＝丙，所以乙 $={r}-{p}={r - p}$。'),
        squares_fig(float(S(r - p)), float(S(p)), (f'甲 {p}', '乙 ?', f'丙 {r}')))


# ───────── 4–5. 已知兩股求斜邊 ─────────
def hyp_int(a, b):
    c2 = a * a + b * b
    return with_figure(value(
        rf'如圖，直角三角形的兩股長是 ${a}$、${b}$，斜邊長是多少？',
        S(c2),
        [root(c2), q_int(a + b), root(abs(b * b - a * a)), q_int(c2)],
        rf'$c^2={a}^2+{b}^2={a * a}+{b * b}={c2}$，$c>0$，$c=\sqrt{{{c2}}}={rtex(c2)}$。'),
        right_tri(b, a, (str(b), str(a), '?')))


def hyp_rad(a, b, wrong):
    c2 = a * a + b * b
    return with_figure(form(
        rf'如圖，直角三角形的兩股長是 ${a}$、${b}$，斜邊長是多少？（化成最簡根式）',
        S(c2),
        [root(c2), bad_root(c2), q_int(a + b), wrong],
        rf'$c^2={a}^2+{b}^2={c2}$，$c=\sqrt{{{c2}}}={rtex(c2)}$；$\sqrt{{{c2}}}$ 還要化成最簡根式。'),
        right_tri(b, a, (str(b), str(a), '?'), corner='br'))


# ───────── 6–7. 已知一股與斜邊求另一股 ─────────
def leg_int(c, a):
    b2 = c * c - a * a
    return with_figure(value(
        rf'如圖，直角三角形的斜邊長是 ${c}$、一股長是 ${a}$，另一股長是多少？',
        S(b2),
        [root(b2), root(c * c + a * a), q_int(c - a), q_int(b2)],
        rf'另一股$^2={c}^2-{a}^2={c * c}-{a * a}={b2}$，另一股 $={rtex(b2)}$。斜邊最長，求股要用減的。'),
        right_tri(float(S(b2)), a, ('?', str(a), str(c))))


def leg_rad(c, a):
    b2 = c * c - a * a
    return with_figure(form(
        rf'如圖，直角三角形的斜邊長是 ${c}$、一股長是 ${a}$，另一股長是多少？（化成最簡根式）',
        S(b2),
        [root(b2), root(c * c + a * a), q_int(c - a), bad_root(b2)],
        rf'另一股$^2={c}^2-{a}^2={b2}$，另一股 $=\sqrt{{{b2}}}={rtex(b2)}$。'),
        right_tri(a, float(S(b2)), (str(a), '?', str(c)), corner='tl'))


# ───────── 8. 直角在上方：先找斜邊 ─────────
def apex_leg(bc, ab):
    ac2 = bc * bc - ab * ab
    opts = [root(ac2), root(bc * bc + ab * ab), q_int(bc - ab), q_int(ac2)]
    kind = value
    if ac2 not in (1, 4, 9, 16, 25, 36, 49, 64, 81, 100):
        kind, opts[3] = form, bad_root(ac2)
    return with_figure(kind(
        rf'如圖，$\triangle ABC$ 中 $\angle A=90^\circ$，$\overline{{BC}}={bc}$、$\overline{{AB}}={ab}$，則 $\overline{{AC}}=$？' + ('（化成最簡根式）' if kind is form else ''),
        S(ac2),
        opts,
        rf'$\angle A$ 的對邊 $\overline{{BC}}={bc}$ 才是斜邊：$\overline{{AC}}^2={bc}^2-{ab}^2={ac2}$，$\overline{{AC}}={rtex(ac2)}$。'),
        hyp_bottom(bc, ab, float(S(ac2)), (str(bc), str(ab), '?')))


# ───────── 9. 梯子靠牆 ─────────
def ladder(L, d):
    h2 = L * L - d * d
    return with_figure(value(
        rf'如圖，長 ${L}$ 公尺的梯子斜靠在垂直的牆上，梯子底端離牆腳 ${d}$ 公尺，梯子頂端離地面幾公尺？',
        S(h2),
        [root(h2), q_int(L - d), root(L * L + d * d), q_int(h2)],
        rf'梯子是斜邊：高$^2={L}^2-{d}^2={L * L}-{d * d}={h2}$，高 $={rtex(h2)}$ 公尺。'),
        ladder_fig(L, d, (f'{L} m', f'{d} m', '?')))


# ───────── 10. 邊長是根式 ─────────
def rad_sides(kind, a2, b2, opts, expl, labels, ask):
    """kind：'hyp'（兩股 √a2、√b2 求斜邊）或 'leg'（股 √a2、斜邊 √b2 求另一股）。"""
    ans = S(a2 + b2) if kind == 'hyp' else S(b2 - a2)
    t = (lambda n: f'$\\sqrt{{{n}}}$' if n not in (1, 4, 9, 16) else f'${int(n ** 0.5)}$')
    stem = (rf'如圖，直角三角形的兩股長是 {t(a2)}、{t(b2)}，斜邊長是多少？' if kind == 'hyp'
            else rf'如圖，直角三角形的一股長是 {t(a2)}、斜邊長是 {t(b2)}，另一股長是多少？')
    if kind == 'hyp':
        svg = right_tri(float(S(b2)), float(S(a2)), labels)
    else:
        svg = right_tri(float(ans), float(S(a2)), labels, corner='br')
    return with_figure(value(stem, ans, opts, expl), svg)


SLOTS = [
    slot(1, '辨認斜邊（直角的對邊）', [
        which_hyp('C', ('C', 'B', 'A'), 'bl', 'AB', ('BC', 'AC')),
        which_hyp('A', ('A', 'C', 'B'), 'tr', 'BC', ('AB', 'AC')),
        which_hyp('B', ('B', 'A', 'C'), 'br', 'AC', ('AB', 'BC')),
    ]),
    slot(2, '寫出畢氏定理的式子', [
        which_eq('C', ('C', 'A', 'B'), 'br', 'AC', 'BC', 'AB'),
        which_eq('A', ('A', 'B', 'C'), 'tl', 'AB', 'AC', 'BC'),
        which_eq('B', ('B', 'C', 'A'), 'tr', 'AB', 'BC', 'AC'),
    ]),
    slot(3, '三邊上正方形的面積', [
        square_hyp(9, 16),
        square_leg(25, 74),
        square_leg(25, 169),
    ]),
    slot(4, '已知兩股求斜邊（整數）', [hyp_int(6, 8), hyp_int(9, 12), hyp_int(8, 15)]),
    slot(5, '已知兩股求斜邊（最簡根式）', [
        hyp_rad(2, 4, root(12)),
        hyp_rad(3, 6, root(27)),
        hyp_rad(4, 4, raw('$16$', 16)),
    ]),
    slot(6, '已知斜邊與一股求另一股（整數）', [leg_int(13, 5), leg_int(17, 8), leg_int(25, 7)]),
    slot(7, '已知斜邊與一股求另一股（最簡根式）', [leg_rad(6, 4), leg_rad(9, 3), leg_rad(7, 5)]),
    slot(8, '直角不在下面：先找出斜邊', [apex_leg(5, 3), apex_leg(10, 6), apex_leg(4, 2)]),
    slot(9, '梯子靠牆的高度', [ladder(10, 6), ladder(13, 5), ladder(17, 8)]),
    slot(10, '邊長是根式的直角三角形', [
        rad_sides('leg', 3, 7, [raw('$2$', 2), root(10), raw('$4$', 4), raw('$10$', 10)],
                  r'另一股$^2=(\sqrt{7})^2-(\sqrt{3})^2=7-3=4$，另一股 $=2$。$(\sqrt{a})^2=a$。', ('?', '√3', '√7'), 'leg'),
        rad_sides('hyp', 5, 11, [raw('$4$', 4), raw('$16$', 16), root(6), raw(r'$\sqrt{5}+\sqrt{11}$', S(5) + S(11))],
                  r'$c^2=(\sqrt{5})^2+(\sqrt{11})^2=5+11=16$，$c=4$。根號不能直接相加。', ('√11', '√5', '?'), 'hyp'),
        rad_sides('hyp', 4, 5, [raw('$3$', 3), raw('$9$', 9), root(7), raw('$1$', 1)],
                  r'$c^2=2^2+(\sqrt{5})^2=4+5=9$，$c=3$。', ('√5', '2', '?'), 'hyp'),
    ]),
]

export('g8-2-3a', '2-3 畢氏定理（1）課後檢核', '依課本 2-3 p.92–96（斜邊與股、畢氏定理、例 1、例 2）自編換數字題', SLOTS)
