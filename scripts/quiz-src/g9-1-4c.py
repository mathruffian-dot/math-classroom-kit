r"""1-4 相似三角形的應用（3）相似直角三角形與 sin、cos、tan：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一，每題附圖）。

用法：python -X utf8 scripts/quiz-src/g9-1-4c.py
範圍：前兩堂與 1-3（相似、對應高、面積比）＋八年級的畢氏定理、根式＋這一堂的
sin A＝對邊／斜邊、cos A＝鄰邊／斜邊、tan A＝對邊／鄰邊，45°-45°-90°（1：1：√2）、30°-60°-90°（1：√3：2）。
課本的記法：直角三角形 △ABC 中 ∠C＝90°，∠A 的對邊 BC、鄰邊 AC、斜邊 AB。
不是 30°、45°、60° 的角，題目一定附上它的 sin／cos 近似值（課本例 6 的寫法）。附圖都用題目的數字畫（角度照實際大小）。
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import Rational, sqrt  # noqa: E402

from geom import PEACH, YELLOW, Fig  # noqa: E402
from quizlib import export, rad, raw, slot, statement, value, with_figure  # noqa: E402
from similar import q, qty, tex  # noqa: E402

R = Rational
S = sqrt


def ftex(v):
    """比值寫成分數（解析裡用，不寫成小數）。"""
    v = R(v)
    return rf'\dfrac{{{v.p}}}{{{v.q}}}' if v.q != 1 else str(v.p)


def fr(v):
    """分數選項（sin、cos、tan 的值）。"""
    v = R(v)
    return raw(rf'$\dfrac{{{v.p}}}{{{v.q}}}$' if v.q != 1 else f'${v.p}$', v)


def sqrt_opt(n):
    """√n 化成最簡根式的選項。"""
    from sympy import factorint
    c, m = 1, 1
    for p_, e in factorint(n).items():
        c *= p_ ** (e // 2)
        m *= p_ ** (e % 2)
    return r_opt(c, m)


def r_opt(coef, n=1, den=1):
    """根式選項 coef√n／den（n＝1 時是整數或分數）。"""
    t, v, _ = rad(coef, n, den)
    return raw(t, v)


# ───────── 附圖 ─────────
def right_fig(ac, bc, labels=None, angle=None, fill=PEACH, scene=None):
    """直角 △ABC（∠C＝90°）：A 在左下、C 在右下、B 在 C 的正上方。
    labels：{'AB'、'BC'、'AC': 文字}；angle：{'A' 或 'B': 角度文字}；scene：'ladder'（牆）、'kite'、'ramp'、'flag'、'escalator'。"""
    f = Fig(440, 240)
    A = f.pt('A', 0, 0, at=(-1, -0.3))
    C = f.pt('C', ac, 0, at=(1, -0.3))
    B = f.pt('B', ac, bc, at=(0.6, 0.8))
    f.poly([A, B, C], fill=fill)
    f.right(C, A, B)
    if scene == 'ladder':
        f.seg(C, f.pt('', ac, bc * 1.12, False), width=5, color='#9b8a74')
    if scene in ('ladder', 'ramp', 'kite', 'flag', 'escalator'):
        f.ground(-0.05 * ac, ac * 1.05)
    for k, (u, v, away) in {'AB': (A, B, C), 'BC': (B, C, A), 'AC': (A, C, B)}.items():
        if labels and labels.get(k):
            f.side(u, v, labels[k], away=away)
    for k, text in (angle or {}).items():
        if k == 'A':
            f.arc(A, C, B, text, r=30)
        else:
            f.arc(B, A, C, text, r=24)
    return f.svg()


# ───────── 題目 ─────────
def pyth(ac, bc, ab, ask):
    lab = {'AC': str(ac) if ask != 'AC' else '?', 'BC': str(bc) if ask != 'BC' else '?', 'AB': str(ab) if ask != 'AB' else '?'}
    if ask == 'AB':
        x = S(ac * ac + bc * bc)
        opts = [r_opt(ab), r_opt(ac + bc), sqrt_opt(abs(ac * ac - bc * bc)), r_opt(ab * ab)]
        how = rf'$\overline{{AB}}^2={ac}^2+{bc}^2={ab * ab}$，$\overline{{AB}}={ab}$。'
        stem = rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$，$\overline{{AC}}={ac}$、$\overline{{BC}}={bc}$，斜邊 $\overline{{AB}}=$？'
    else:
        x = S(ab * ab - bc * bc)
        opts = [r_opt(ac), r_opt(ab - bc), sqrt_opt(ab * ab + bc * bc), r_opt(ab + bc)]
        how = rf'$\overline{{AC}}^2={ab}^2-{bc}^2={ac * ac}$，$\overline{{AC}}={ac}$。斜邊最長，要用減的。'
        stem = rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$，斜邊 $\overline{{AB}}={ab}$、$\overline{{BC}}={bc}$，$\overline{{AC}}=$？'
    return with_figure(value(stem, x, opts, how), right_fig(ac, bc, lab))


def names(kind):
    seg = lambda s: rf'$\overline{{{s}}}$'  # noqa: E731
    if kind == 1:
        opts = [(f'$\\angle A$ 的對邊是 {seg("BC")}', True), (f'$\\angle A$ 的鄰邊是 {seg("AB")}', False),
                (f'$\\angle A$ 的對邊是 {seg("AC")}', False), (f'斜邊是 {seg("BC")}', False)]
        why = r'$\angle A$ 對著的邊是 $\overline{BC}$（對邊），夾著 $\angle A$ 的股是 $\overline{AC}$（鄰邊），對著直角的 $\overline{AB}$ 是斜邊。'
        ang = {'A': ''}
    elif kind == 2:
        opts = [(f'$\\angle B$ 的鄰邊是 {seg("BC")}', True), (f'$\\angle B$ 的對邊是 {seg("BC")}', False),
                (f'$\\angle B$ 的鄰邊是 {seg("AB")}', False), (f'斜邊是 {seg("AC")}', False)]
        why = r'換成看 $\angle B$：對邊是 $\overline{AC}$，鄰邊是 $\overline{BC}$，斜邊還是 $\overline{AB}$。'
        ang = {'B': ''}
    else:
        opts = [(f'斜邊是 {seg("AB")}，它對著直角 $\\angle C$', True), (f'$\\angle A$ 的鄰邊是 {seg("BC")}', False),
                (f'$\\angle B$ 的對邊是 {seg("BC")}', False), (f'斜邊是 {seg("BC")}', False)]
        why = r'斜邊對著直角 $\angle C$，是 $\overline{AB}$；$\angle A$ 的鄰邊是 $\overline{AC}$；$\angle B$ 的對邊是 $\overline{AC}$。'
        ang = {}
    return with_figure(statement(r'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$。下列哪一個正確？', opts, why),
                       right_fig(4, 3, None, ang, fill=YELLOW))


def ratio3(bc, ac, ab, which):
    sin, cos, tan = R(bc, ab), R(ac, ab), R(bc, ac)
    want = {'sin': sin, 'cos': cos, 'tan': tan}[which]
    others = {'sin': [cos, tan, 1 / sin], 'cos': [sin, R(bc, ac), 1 / cos], 'tan': [1 / tan, sin, cos]}[which]
    name = {'sin': r'\sin A', 'cos': r'\cos A', 'tan': r'\tan A'}[which]
    rule = {'sin': '對邊／斜邊', 'cos': '鄰邊／斜邊', 'tan': '對邊／鄰邊'}[which]
    return with_figure(value(
        rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$，$\overline{{AB}}={ab}$、$\overline{{BC}}={bc}$、$\overline{{AC}}={ac}$，${name}=$？',
        want, [fr(want)] + [fr(x) for x in others],
        rf'${name}$＝{rule}，$\angle A$ 的對邊 $\overline{{BC}}={bc}$、鄰邊 $\overline{{AC}}={ac}$、斜邊 $\overline{{AB}}={ab}$，${name}={ftex(want)}$。'),
        right_fig(ac, bc, {'AB': str(ab), 'BC': str(bc), 'AC': str(ac)}))


def pyth_then(bc, ac, ab, give, which):
    sin, cos, tan = R(bc, ab), R(ac, ab), R(bc, ac)
    want = {'sin': sin, 'cos': cos, 'tan': tan}[which]
    pool = [sin, cos, tan, 1 / sin, 1 / cos, 1 / tan]
    others = [x for x in pool if x != want][:3]
    name = {'sin': r'\sin A', 'cos': r'\cos A', 'tan': r'\tan A'}[which]
    known = {'BC': bc, 'AC': ac, 'AB': ab}
    missing = [k for k in known if k not in give][0]
    lab = {k: (str(known[k]) if k in give else '?') for k in known}
    given = '、'.join(rf'$\overline{{{k}}}={known[k]}$' for k in give)
    return with_figure(value(
        rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$，{given}，${name}=$？',
        want, [fr(want)] + [fr(x) for x in others],
        rf'先用畢氏定理求 $\overline{{{missing}}}={known[missing]}$，再算 ${name}={ftex(want)}$。'),
        right_fig(ac, bc, lab))


def angle_b(bc, ac, ab, which):
    sinb, cosb, tanb = R(ac, ab), R(bc, ab), R(ac, bc)
    want = {'sin': sinb, 'cos': cosb, 'tan': tanb}[which]
    pool = [{'sin': R(bc, ab), 'cos': R(ac, ab), 'tan': R(bc, ac)}[which], sinb, cosb, tanb, 1 / want]
    others = []
    for x in pool:
        if x != want and x not in others:
            others.append(x)
    name = {'sin': r'\sin B', 'cos': r'\cos B', 'tan': r'\tan B'}[which]
    return with_figure(value(
        rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$，$\overline{{AB}}={ab}$、$\overline{{BC}}={bc}$、$\overline{{AC}}={ac}$，${name}=$？',
        want, [fr(want)] + [fr(x) for x in others[:3]],
        rf'看 $\angle B$：對邊是 $\overline{{AC}}={ac}$、鄰邊是 $\overline{{BC}}={bc}$、斜邊 $\overline{{AB}}={ab}$，${name}={ftex(want)}$。和 $\angle A$ 的對邊、鄰邊剛好互換。'),
        right_fig(ac, bc, {'AB': str(ab), 'BC': str(bc), 'AC': str(ac)}, {'B': ''}))


def from_ratio(bc, ac, ab, which):
    sin, cos, tan = R(bc, ab), R(ac, ab), R(bc, ac)
    if which == 'sin':
        stem = rf'直角 $\triangle ABC$ 中 $\angle C=90^\circ$，$\sin A=\dfrac{{{sin.p}}}{{{sin.q}}}$，$\overline{{AB}}={ab}$，$\overline{{BC}}=$？'
        want, opts = bc, [ab * sin, ab * cos, ab / sin, ab * tan]
        lab, how = {'AB': str(ab), 'BC': '?'}, rf'$\sin A=\dfrac{{\overline{{BC}}}}{{\overline{{AB}}}}$，$\overline{{BC}}={ab}\times\dfrac{{{sin.p}}}{{{sin.q}}}={bc}$。'
    elif which == 'cos':
        stem = rf'直角 $\triangle ABC$ 中 $\angle C=90^\circ$，$\cos A=\dfrac{{{cos.p}}}{{{cos.q}}}$，$\overline{{AB}}={ab}$，$\overline{{AC}}=$？'
        want, opts = ac, [ab * cos, ab * sin, ab / cos, ab * tan]
        lab, how = {'AB': str(ab), 'AC': '?'}, rf'$\cos A=\dfrac{{\overline{{AC}}}}{{\overline{{AB}}}}$，$\overline{{AC}}={ab}\times\dfrac{{{cos.p}}}{{{cos.q}}}={ac}$。'
    else:
        stem = rf'直角 $\triangle ABC$ 中 $\angle C=90^\circ$，$\tan A=\dfrac{{{tan.p}}}{{{tan.q}}}$，$\overline{{AC}}={ac}$，$\overline{{BC}}=$？'
        want, opts = bc, [ac * tan, ac / tan, R(ab), ac * sin]
        lab, how = {'AC': str(ac), 'BC': '?'}, rf'$\tan A=\dfrac{{\overline{{BC}}}}{{\overline{{AC}}}}$，$\overline{{BC}}={ac}\times\dfrac{{{tan.p}}}{{{tan.q}}}={bc}$。'
    return with_figure(value(stem, want, [qty(x) for x in opts], how), right_fig(ac, bc, lab))


def real_life(kind):
    if kind == 'ramp':
        L, deg, s, c = 200, 10, q('0.1736'), q('0.9848')
        want = L * s
        stem = rf'一條斜坡長 ${L}$ 公尺，和水平地面的夾角是 ${deg}^\circ$，斜坡的垂直高度約幾公尺？（$\sin {deg}^\circ\approx 0.1736$、$\cos {deg}^\circ\approx 0.9848$）'
        opts = [want, L * c, want * 10, want / 10]
        how = rf'要求的是 $\angle A$ 的對邊，已知斜邊：用 $\sin$。高度 $\approx {L}\times 0.1736={tex(want).strip("$")}$ 公尺。'
        fig = right_fig(L * float(c), L * float(s), {'AB': f'{L} m', 'BC': '?'}, {'A': f'{deg}°'}, scene='ramp')
    elif kind == 'ladder':
        L, deg, s, c = 5, 70, q('0.9397'), q('0.3420')
        want = L * c
        stem = rf'長 ${L}$ 公尺的梯子斜靠在牆上，梯子和地面的夾角是 ${deg}^\circ$，梯腳離牆約幾公尺？（$\sin {deg}^\circ\approx 0.9397$、$\cos {deg}^\circ\approx 0.3420$）'
        opts = [want, L * s, want * 10, L / c]
        how = rf'梯腳到牆是 $\angle A$ 的鄰邊，已知斜邊（梯長）：用 $\cos$。$\approx {L}\times 0.3420={tex(want).strip("$")}$ 公尺。'
        fig = right_fig(L * float(c), L * float(s), {'AB': f'{L} m', 'AC': '?'}, {'A': f'{deg}°'}, scene='ladder')
    else:
        L, deg, s, c = 50, 40, q('0.6428'), q('0.7660')
        want = L * s
        stem = rf'風箏線拉直長 ${L}$ 公尺，和水平地面的夾角是 ${deg}^\circ$，風箏離地約幾公尺？（手的高度不計；$\sin {deg}^\circ\approx 0.6428$、$\cos {deg}^\circ\approx 0.7660$）'
        opts = [want, L * c, want * 10, L / s]
        how = rf'高度是 $\angle A$ 的對邊，已知斜邊（線長）：用 $\sin$。$\approx {L}\times 0.6428={tex(want).strip("$")}$ 公尺。'
        fig = right_fig(L * float(c), L * float(s), {'AB': f'{L} m', 'BC': '?'}, {'A': f'{deg}°'}, scene='kite')
    # 選項取到小數第 2 位（L / sin 這種除不盡的四捨五入）
    def two(x):
        x = R(x)
        return x if (x * 100).q == 1 else R(round(float(x) * 100), 100)
    return with_figure(value(stem, want, [qty(two(x), '公尺') for x in opts], how + '（四捨五入到小數第 2 位）'), fig)


def iso(give, n):
    """45°-45°-90°：give 是已知的邊（AC、BC 或 AB）。"""
    if give == 'AC':
        stem = rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$、$\angle A=45^\circ$，$\overline{{AC}}={n}$，$\overline{{AB}}=$？'
        want, opts = n * S(2), [r_opt(n, 2), r_opt(n), r_opt(2 * n), r_opt(n, 3)]
        lab, how = {'AC': str(n), 'AB': '?'}, rf'$45^\circ$-$45^\circ$-$90^\circ$ 的邊長比 $1:1:\sqrt{{2}}$，$\overline{{AB}}={n}\sqrt{{2}}$。'
        side = n
    elif give == 'AB':
        stem = rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$、$\angle A=45^\circ$，$\overline{{AB}}={n}$，$\overline{{AC}}=$？'
        want, opts = n / S(2), [r_opt(n // 2, 2), r_opt(n, 2), r_opt(n // 2), r_opt(n)]
        lab, how = {'AB': str(n), 'AC': '?'}, rf'$\overline{{AC}}:\overline{{AB}}=1:\sqrt{{2}}$，$\overline{{AC}}=\dfrac{{{n}}}{{\sqrt{{2}}}}={n // 2}\sqrt{{2}}$。'
        side = n / math.sqrt(2)
    else:
        stem = rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$、$\angle A=45^\circ$，$\overline{{BC}}={n}$，$\overline{{AB}}=$？'
        want, opts = n * S(2), [r_opt(n, 2), r_opt(n), r_opt(2 * n), r_opt(n, 3)]
        lab, how = {'BC': str(n), 'AB': '?'}, rf'$\angle B=45^\circ$，$\overline{{AC}}=\overline{{BC}}={n}$，$\overline{{AB}}={n}\sqrt{{2}}$。'
        side = n
    return with_figure(value(stem, want, opts, how), right_fig(side, side, lab, {'A': '45°'}))


def thirty(angle_a, give, n):
    """30°-60°-90°。angle_a＝∠A 的度數（30 或 60）。"""
    if angle_a == 60:
        # ∠A＝60°：AC 是短股（對 30°），BC＝√3 AC，AB＝2 AC
        ac, bc = n, n * math.sqrt(3)
        stem = rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$、$\angle A=60^\circ$，$\overline{{AC}}={n}$，$\overline{{BC}}=$？'
        want, opts = n * S(3), [r_opt(n, 3), r_opt(2 * n), r_opt(n, 2), raw(rf'$\dfrac{{{n}\sqrt{{3}}}}{{3}}$', n * S(3) / 3)]
        lab, how = {'AC': str(n), 'BC': '?'}, rf'$\angle B=30^\circ$，$\overline{{AC}}$ 對 $30^\circ$ 是最短邊。$\overline{{AC}}:\overline{{BC}}:\overline{{AB}}=1:\sqrt{{3}}:2$，$\overline{{BC}}={n}\sqrt{{3}}$。'
    elif give == 'BC':
        ac, bc = n * math.sqrt(3), n
        stem = rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$、$\angle A=30^\circ$，$\overline{{BC}}={n}$，$\overline{{AB}}=$？'
        want, opts = R(2 * n), [r_opt(2 * n), r_opt(n, 3), r_opt(n, 2), r_opt(2 * n, 3)]
        lab, how = {'BC': str(n), 'AB': '?'}, rf'$\overline{{BC}}$ 對 $30^\circ$，是最短邊；斜邊是最短邊的 $2$ 倍：$\overline{{AB}}={2 * n}$。'
    else:
        ac, bc = n / 2 * math.sqrt(3), n / 2
        stem = rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$、$\angle A=30^\circ$，$\overline{{AB}}={n}$，$\overline{{AC}}=$？'
        want, opts = n // 2 * S(3), [r_opt(n // 2, 3), r_opt(n // 2), r_opt(n, 3), r_opt(n // 2, 2)]
        lab, how = {'AB': str(n), 'AC': '?'}, rf'$\overline{{BC}}=\dfrac{{{n}}}{{2}}={n // 2}$（對 $30^\circ$），$\overline{{AC}}=\sqrt{{3}}\times{n // 2}={n // 2}\sqrt{{3}}$。'
    return with_figure(value(stem, want, opts, how), right_fig(ac, bc, lab, {'A': f'{angle_a}°'}))


def special_life(kind):
    if kind == 'escalator':
        h = q('4.5')
        stem = r'電扶梯的傾斜角是 $30^\circ$，上下樓層的高度差 $4.5$ 公尺，電扶梯的長度是幾公尺？'
        want = 2 * h
        opts = [qty(want, '公尺'), raw(r'$\dfrac{9\sqrt{3}}{2}$ 公尺', h * S(3)), qty(h / 2, '公尺'), raw(r'$\dfrac{9\sqrt{2}}{2}$ 公尺', h * S(2))]
        how = r'高度差對著 $30^\circ$，是最短邊；長度（斜邊）是它的 $2$ 倍：$2\times4.5=9$ 公尺。'
        fig = right_fig(4.5 * math.sqrt(3), 4.5, {'BC': '4.5 m', 'AB': '?'}, {'A': '30°'}, scene='escalator')
    elif kind == 'flag':
        stem = r'從旗桿頂端 $B$ 拉一條繩子到地面的 $A$ 點，繩子和地面夾 $45^\circ$。旗桿高 $6$ 公尺，繩長是幾公尺？'
        want = 6 * S(2)
        opts = [r_opt(6, 2), r_opt(6), r_opt(12), r_opt(6, 3)]
        how = r'$45^\circ$-$45^\circ$-$90^\circ$，邊長比 $1:1:\sqrt{2}$，繩長 $6\sqrt{2}$ 公尺。'
        fig = right_fig(6, 6, {'BC': '6 m', 'AB': '?'}, {'A': '45°'}, scene='flag')
    else:
        stem = r'長 $8$ 公尺的梯子斜靠在牆上，梯子和地面的夾角是 $60^\circ$，梯子頂端離地多高？'
        want = 4 * S(3)
        opts = [r_opt(4, 3), r_opt(4), r_opt(8, 3), r_opt(4, 2)]
        how = r'梯腳到牆對著 $30^\circ$，是 $\dfrac{8}{2}=4$；頂端高度是 $4\sqrt{3}$ 公尺（邊長比 $1:\sqrt{3}:2$）。'
        fig = right_fig(4, 4 * math.sqrt(3), {'AB': '8 m', 'BC': '?'}, {'A': '60°'}, scene='ladder')
    return with_figure(value(stem, want, opts, how), fig)


SLOTS = [
    slot(1, '畢氏定理（先備）', [pyth(8, 6, 10, 'AB'), pyth(12, 5, 13, 'AC'), pyth(12, 9, 15, 'AB')]),
    slot(2, '對邊、鄰邊、斜邊', [names(1), names(2), names(3)]),
    slot(3, '由三邊寫 sin、cos、tan', [ratio3(8, 15, 17, 'sin'), ratio3(5, 12, 13, 'cos'), ratio3(7, 24, 25, 'tan')]),
    slot(4, '先用畢氏定理，再求比值', [pyth_then(3, 4, 5, ('BC', 'AC'), 'sin'), pyth_then(8, 6, 10, ('BC', 'AB'), 'tan'), pyth_then(8, 15, 17, ('AC', 'AB'), 'cos')]),
    slot(5, '換成 ∠B 的比值', [angle_b(3, 4, 5, 'sin'), angle_b(5, 12, 13, 'cos'), angle_b(8, 15, 17, 'tan')]),
    slot(6, '已知比值求邊長', [from_ratio(12, 16, 20, 'sin'), from_ratio(24, 10, 26, 'cos'), from_ratio(9, 12, 15, 'tan')]),
    slot(7, 'sin、cos 的生活問題', [real_life('ramp'), real_life('ladder'), real_life('kite')]),
    slot(8, '45°-45°-90° 的邊長', [iso('AC', 6), iso('AB', 10), iso('BC', 7)]),
    slot(9, '30°-60°-90° 的邊長', [thirty(60, 'AC', 4), thirty(30, 'BC', 4), thirty(30, 'AB', 12)]),
    slot(10, '特殊直角三角形的生活問題', [special_life('escalator'), special_life('flag'), special_life('ladder')]),
]

if __name__ == '__main__':
    export('g9-1-4c', '1-4 相似三角形的應用（3）：課後檢核', '九年級 1-4 課本 p.69–76（sin、cos、tan，特殊直角三角形）＋前兩堂、1-3 與畢氏定理；題目自編，答案已用 SymPy 核算', SLOTS)
