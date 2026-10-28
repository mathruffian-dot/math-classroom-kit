r"""2-3(2) 畢氏定理的應用：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一，每題附圖）。

用法：python -X utf8 scripts/quiz-src/g8-2-3b.py
範圍：2-1、2-2（最簡根式、分母有理化）、2-3(1) 畢氏定理＋這一堂的複合圖形（共用斜邊）、斜邊上的高
（面積兩種算法、兩股乘積÷斜邊）、竹竿靠牆與下滑、杯中玻棒、長方形對角線、正方形與中點的比值。
不用坐標平面上兩點的距離（2-3(3)）。
附圖都用題目的同一組數字畫（比例照實際長度），題目問的那一段標「?」。
"""
import sys
from math import sqrt as fsqrt
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import Rational, nsimplify, sqrt  # noqa: E402

from geom import Fig, P, PEACH  # noqa: E402,F401
from pyth import bad_root, dec, frac, ftex, hyp_bottom, ladder_fig, lab, quad_kite, quad_shared, rect_fig, root, rtex, cup_fig, square_mid_fig  # noqa: E402
from quizlib import export, form, raw, slot, statement, value, with_figure  # noqa: E402

R = Rational
S = sqrt


def n(v):
    return raw(f'${v}$', v)


# ───────── 1. 複合圖形：共用斜邊（課本例 3） ─────────
def shared(ac, bc, bd):
    ab2 = ac * ac + bc * bc
    ad2 = ab2 - bd * bd
    opts = [root(ad2), root(ab2 + bd * bd), root(ab2), root(ac * ac + bd * bd)]
    return with_figure(value(
        rf'如圖，$\angle C=\angle D=90^\circ$，$\overline{{AC}}={ac}$、$\overline{{BC}}={bc}$、$\overline{{BD}}={bd}$，則 $\overline{{AD}}=$？',
        S(ad2),
        opts,
        rf'先在 $\triangle ABC$ 求共用的斜邊：$\overline{{AB}}^2={ac}^2+{bc}^2={ab2}$。再在 $\triangle ABD$：$\overline{{AD}}^2={ab2}-{bd}^2={ad2}$，$\overline{{AD}}={rtex(ad2)}$。'),
        quad_shared(ac, bc, bd, (str(ac), str(bc), str(bd), '?')))


# ───────── 2. 四邊形 ∠A＝∠C＝90°（課本例 3 隨堂） ─────────
def kite(ab, ad, bc):
    bd2 = ab * ab + ad * ad
    cd2 = bd2 - bc * bc
    opts = [root(cd2), root(bd2 + bc * bc), root(bd2), root(ab * ab + bc * bc)]
    return with_figure(value(
        rf'如圖，四邊形 $ABCD$ 中 $\angle A=\angle C=90^\circ$，$\overline{{AB}}={ab}$、$\overline{{AD}}={ad}$、$\overline{{BC}}={bc}$，則 $\overline{{CD}}=$？',
        S(cd2),
        opts,
        rf'$\overline{{BD}}$ 是兩個直角三角形共用的斜邊：$\overline{{BD}}^2={ab}^2+{ad}^2={bd2}$；$\overline{{CD}}^2={bd2}-{bc}^2={cd2}$，$\overline{{CD}}={rtex(cd2)}$。'),
        quad_kite(ab, ad, bc, (str(ab), str(ad), str(bc), '?')))


# ───────── 3. 斜邊上的高（課本例 4） ─────────
def altitude(a, b, wrong):
    c = int(fsqrt(a * a + b * b))
    h = R(a * b, c)
    return with_figure(value(
        rf'如圖，直角三角形的三邊長是 ${a}$、${b}$、${c}$，斜邊上的高 $h$ 是多少？',
        h,
        [frac(h), n(a * b // 2) if a * b % 2 == 0 else frac(R(a * b, 2)), n(a * b), frac(wrong)],
        rf'面積的兩種算法相等：$\dfrac{{1}}{{2}}\times{c}\times h=\dfrac{{1}}{{2}}\times{a}\times{b}$，$h=\dfrac{{{a}\times{b}}}{{{c}}}={ftex(h)}$。'),
        hyp_bottom(c, b, a, (str(c), str(b), str(a)), foot='', h_label='h'))


# ───────── 4. 先求股再求高（課本例 4 隨堂） ─────────
def leg_then_alt(ab, bc, wrong):
    ac = int(fsqrt(bc * bc - ab * ab))
    ad = R(ab * ac, bc)
    return with_figure(value(
        rf'如圖，直角三角形 $ABC$ 中 $\angle A=90^\circ$，$\overline{{AD}}$ 是斜邊上的高。若 $\overline{{AB}}={ab}$、$\overline{{BC}}={bc}$，則 $\overline{{AD}}=$？',
        ad,
        [frac(ad), frac(R(ab * ac, 2)), n(ac), frac(wrong)],
        rf'$\overline{{AC}}=\sqrt{{{bc}^2-{ab}^2}}={ac}$；$\overline{{AD}}=\dfrac{{\overline{{AB}}\times\overline{{AC}}}}{{\overline{{BC}}}}=\dfrac{{{ab}\times{ac}}}{{{bc}}}={ftex(ad)}$。'),
        hyp_bottom(bc, ab, ac, (str(bc), str(ab), ''), names=('B', 'C', 'A'), foot='D', h_label='?'))


# ───────── 5. 斜邊上的高：哪一個式子正確 ─────────
def alt_formula(kind):
    if kind == 1:
        return with_figure(statement(
            r'如圖，直角三角形的兩股長是 $a$、$b$，斜邊長是 $c$，斜邊上的高是 $h$。下列哪一個正確？',
            [(r'$h=\dfrac{ab}{c}$', True), (r'$h=\dfrac{ab}{2}$', False), (r'$h=\dfrac{c}{ab}$', False), (r'$h=\dfrac{a+b}{c}$', False)],
            r'面積 $=\dfrac{1}{2}ab=\dfrac{1}{2}ch$，所以 $ch=ab$，$h=\dfrac{ab}{c}$（兩股乘積 ÷ 斜邊）。'),
            hyp_bottom(5, 4, 3, ('c', 'b', 'a'), names=('', '', ''), foot='', h_label='h'))
    if kind == 2:
        return with_figure(statement(
            r'如圖，$\triangle ABC$ 中 $\angle A=90^\circ$，$\overline{AD}\perp\overline{BC}$。下列哪一個正確？',
            [(r'$\overline{AD}=\dfrac{\overline{AB}\times\overline{AC}}{\overline{BC}}$', True),
             (r'$\overline{AD}=\dfrac{\overline{AB}\times\overline{BC}}{\overline{AC}}$', False),
             (r'$\overline{AD}=\dfrac{\overline{AB}\times\overline{AC}}{2}$', False),
             (r'$\overline{AD}=\dfrac{\overline{BC}}{2}$', False)],
            r'$\overline{BC}$ 是斜邊、$\overline{AB}$ 與 $\overline{AC}$ 是兩股：斜邊上的高 $\overline{AD}=$ 兩股乘積 ÷ 斜邊。'),
            hyp_bottom(5, 3, 4, ('', '', ''), names=('B', 'C', 'A'), foot='D'))
    return with_figure(statement(
        r'如圖，$\triangle ABC$ 中 $\angle C=90^\circ$，$h$ 是斜邊 $\overline{AB}$ 上的高。下列哪一個正確？',
        [(r'$\overline{AC}\times\overline{BC}=\overline{AB}\times h$', True),
         (r'$\overline{AC}\times\overline{BC}=\dfrac{1}{2}\overline{AB}\times h$', False),
         (r'$\overline{AB}\times\overline{BC}=\overline{AC}\times h$', False),
         (r'$\overline{AC}+\overline{BC}=\overline{AB}+h$', False)],
        r'同一個三角形的面積：$\dfrac{1}{2}\times\overline{AC}\times\overline{BC}=\dfrac{1}{2}\times\overline{AB}\times h$，兩邊同乘 2 得 $\overline{AC}\times\overline{BC}=\overline{AB}\times h$。'),
        hyp_bottom(5, 4, 3, ('', '', ''), names=('A', 'B', 'C'), foot='', h_label='h'))


# ───────── 6. 竹竿靠牆的高度（課本例 5） ─────────
def pole(L, d):
    Ls, ds = L, d  # 題目上的寫法（小數）
    L, d = nsimplify(L), nsimplify(d)
    h = S(L * L - d * d)
    return with_figure(value(
        rf'如圖，長 ${Ls}$ 公尺的竹竿斜靠在垂直的牆上，竹竿底端離牆腳 ${ds}$ 公尺，竹竿頂端離地面幾公尺？',
        h,
        [dec(h), dec(L - d), dec(h * h), raw(rf'$\sqrt{{{float(L * L + d * d):g}}}$', S(L * L + d * d))],
        rf'竹竿是斜邊：$x^2={Ls}^2-{ds}^2={float(L * L):g}-{float(d * d):g}={float(h * h):g}$，$x={float(h):g}$ 公尺。'),
        ladder_fig(float(L), float(d), (f'{Ls} m', f'{ds} m', '?')))


# ───────── 7. 竹竿下滑後，底端外移多少（課本例 5(2)） ─────────
def slide(L, top, drop):
    Ls, ts, ds = L, top, drop  # 題目上的寫法（小數）
    L, top, drop = nsimplify(L), nsimplify(top), nsimplify(drop)
    b1 = S(L * L - top * top)
    t2 = top - drop
    b2 = S(L * L - t2 * t2)
    move = b2 - b1
    g = lambda v: f'{float(v):g}'  # noqa: E731
    return with_figure(value(
        rf'如圖，長 ${Ls}$ 公尺的梯子斜靠在牆上，頂端離地 ${ts}$ 公尺。頂端沿牆下滑 ${ds}$ 公尺後，梯子底端會往外移動幾公尺？',
        move,
        [dec(move), dec(drop), dec(b2), dec(t2)],
        rf'原本底端離牆 $\sqrt{{{Ls}^2-{ts}^2}}={g(b1)}$；下滑後頂端離地 ${ts}-{ds}={g(t2)}$，底端離牆 $\sqrt{{{Ls}^2-{g(t2)}^2}}={g(b2)}$。外移 ${g(b2)}-{g(b1)}={g(move)}$ 公尺，不等於下滑的 ${ds}$ 公尺。'),
        ladder_fig(float(L), float(b1), (f'{Ls} m', '', f'{ts} m'), second=(float(b2), float(t2), (f'下滑 {ds}', '?'))))


# ───────── 8. 杯中玻棒（課本例 5 隨堂） ─────────
def cup(r, h, rod, wrong):
    inside = int(fsqrt(r * r + h * h))
    return with_figure(value(
        rf'如圖，直圓柱杯子的底面半徑 ${r}$ 公分、高 ${h}$ 公分，長 ${rod}$ 公分的玻棒從杯蓋中央的小孔插到杯底邊緣，玻棒露出杯口外幾公分？',
        rod - inside,
        [n(rod - inside), n(inside), n(rod - h), n(wrong)],
        rf'杯內的玻棒是斜邊：$\sqrt{{{r}^2+{h}^2}}=\sqrt{{{r * r + h * h}}}={inside}$；露出 ${rod}-{inside}={rod - inside}$ 公分。'),
        cup_fig(r, h, rod, (str(r), str(h), '', '?')))


# ───────── 9. 長方形的對角線（課本例 6） ─────────
def diagonal(w, h, wrong):
    d2 = w * w + h * h
    return with_figure(form(
        rf'如圖，長方形 $ABCD$ 的長 ${w}$、寬 ${h}$，對角線 $\overline{{BD}}$ 的長是多少？（化成最簡根式）',
        S(d2),
        [root(d2), bad_root(d2), n(w + h), wrong],
        rf'對角線是直角三角形 $BCD$ 的斜邊：$\overline{{BD}}=\sqrt{{{w}^2+{h}^2}}=\sqrt{{{d2}}}={rtex(d2)}$。'),
        rect_fig(w, h, (str(w), str(h), '?')))


# ───────── 10. 正方形與中點（課本例 6 隨堂） ─────────
def square_mid(side, ask):
    de2 = side * side + (side * side) // 4
    bd2 = 2 * side * side
    if ask == 'DE':
        return with_figure(form(
            rf'如圖，正方形 $ABCD$ 的邊長是 ${side}$，$E$ 是 $\overline{{AB}}$ 的中點，則 $\overline{{DE}}=$？（化成最簡根式）',
            S(de2),
            [root(de2), bad_root(de2), root(2 * (side // 2) ** 2), n(side + side // 2)],
            rf'$\overline{{AE}}={side // 2}$、$\overline{{AD}}={side}$，$\overline{{DE}}=\sqrt{{{side // 2}^2+{side}^2}}=\sqrt{{{de2}}}={rtex(de2)}$。'),
            square_mid_fig(side, (str(side), '?', '')))
    if ask == 'BD/DE':
        v = S(bd2) / S(de2)
        return with_figure(form(
            rf'如圖，正方形 $ABCD$ 的邊長是 ${side}$，$E$ 是 $\overline{{AB}}$ 的中點，$\overline{{BD}}:\overline{{DE}}$ 的比值是多少？（化成最簡根式）',
            v,
            [raw(r'$\dfrac{2\sqrt{10}}{5}$', v), raw(rf'$\dfrac{{{rtex(bd2)}}}{{{rtex(de2)}}}$', v, False), raw(r'$\dfrac{\sqrt{10}}{4}$', 1 / v), raw(r'$\dfrac{2}{5}$', R(2, 5))],
            rf'$\overline{{BD}}={rtex(bd2)}$、$\overline{{DE}}={rtex(de2)}$，比值 $\dfrac{{{rtex(bd2)}}}{{{rtex(de2)}}}=\dfrac{{2\sqrt{{10}}}}{{5}}$（分母要有理化）。'),
            square_mid_fig(side, (str(side), '', '')))
    v = S(de2) / S(bd2)
    return with_figure(form(
        rf'如圖，正方形 $ABCD$ 的邊長是 ${side}$，$E$ 是 $\overline{{AB}}$ 的中點，$\overline{{DE}}:\overline{{BD}}$ 的比值是多少？（化成最簡根式）',
        v,
        [raw(r'$\dfrac{\sqrt{10}}{4}$', v), raw(rf'$\dfrac{{{rtex(de2)}}}{{{rtex(bd2)}}}$', v, False), raw(r'$\dfrac{2\sqrt{10}}{5}$', 1 / v), raw(r'$\dfrac{1}{2}$', R(1, 2))],
        rf'$\overline{{DE}}={rtex(de2)}$、$\overline{{BD}}={rtex(bd2)}$，比值 $\dfrac{{{rtex(de2)}}}{{{rtex(bd2)}}}=\dfrac{{\sqrt{{10}}}}{{4}}$（分母要有理化）。'),
        square_mid_fig(side, (str(side), '', '')))


SLOTS = [
    slot(1, '複合圖形：先求共用的斜邊', [shared(6, 8, 5), shared(3, 4, 2), shared(5, 12, 4)]),
    slot(2, '四邊形中的兩個直角三角形', [kite(3, 4, 1), kite(6, 8, 2), kite(1, 3, 2)]),
    slot(3, '斜邊上的高', [altitude(6, 8, R(5)), altitude(5, 12, R(13, 2)), altitude(9, 12, R(15, 2))]),
    slot(4, '先求另一股，再求斜邊上的高', [leg_then_alt(15, 25, R(75, 4)), leg_then_alt(6, 10, R(15, 2)), leg_then_alt(12, 13, R(156, 5))]),
    slot(5, '斜邊上的高：面積的兩種算法', [alt_formula(1), alt_formula(2), alt_formula(3)]),
    slot(6, '竹竿靠牆的高度', [pole('1.3', '0.5'), pole('2.6', '1'), pole('1.7', '0.8')]),
    slot(7, '竹竿下滑：底端外移多少', [slide('5', '4.8', '1.8'), slide('6.5', '6', '0.8'), slide('10', '9.6', '1.6')]),
    slot(8, '杯中玻棒露出的長度', [cup(6, 8, 14, 8), cup(8, 15, 20, 12), cup(7, 24, 30, 23)]),
    slot(9, '長方形的對角線（最簡根式）', [diagonal(6, 3, root(27)), diagonal(8, 4, root(48)), diagonal(6, 2, root(32))]),
    slot(10, '正方形與中點：長度與比值', [square_mid(2, 'BD/DE'), square_mid(6, 'DE'), square_mid(4, 'DE/BD')]),
]

export('g8-2-3b', '2-3 畢氏定理（2）課後檢核', '依課本 2-3 p.97–100（例 3–例 6 與隨堂）自編換數字題', SLOTS)
