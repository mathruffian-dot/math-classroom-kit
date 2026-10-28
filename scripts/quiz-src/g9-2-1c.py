r"""2-1 點、直線與圓之間的位置關係（3）切線段性質、弦與弦心距：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一，每題附圖）。

用法：python -X utf8 scripts/quiz-src/g9-2-1c.py
範圍：2-1 全部（圓的名詞、弧長扇形、點與直線和圓的位置、切線垂直半徑、切線段長）＋這一堂的
切線段性質（PA＝PB、PO 平分∠APB、PO 垂直平分 AB）、弦的性質（過圓心且垂直弦的直線平分弦）、
弦心距（垂直平分弦，AM²＋OM²＝r²）、同圓中弦愈長弦心距愈小；
先備：畢氏定理、根式、三角形與四邊形內角和、直角三角形面積（兩股相乘÷2＝斜邊×斜邊上的高÷2）、乘法公式（八上）。
不用圓周角、圓心角與弧的度數關係（2-2）、外心內心（3-2）。
附圖都用題目的同一組數字畫（比例照實際數字），題目問的那一段標「?」。
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import Rational, simplify, solve, sqrt, symbols  # noqa: E402

from circlefig import SKY, CFig, P, deg, eopt, etex  # noqa: E402
from geom import num  # noqa: E402
from quizlib import export, raw, slot, value, with_figure  # noqa: E402

R = Rational
x = symbols('x')
LILAC = '#ece3f5'
PALE = '#eef6dd'


def pick(correct, cands, fmt=eopt):
    out, seen = [fmt(correct)], [simplify(correct)]
    for c in cands:
        c = simplify(c)
        if c.is_positive and all(simplify(c - s) != 0 for s in seen):
            out.append(fmt(c))
            seen.append(c)
        if len(out) == 4:
            return out
    raise AssertionError(f'錯誤選項不夠：{correct} {cands}')


def dec(v):
    """有限小數寫成小數，其餘照 etex。"""
    v = simplify(v)
    if v.is_rational and v.q in (1, 2, 4, 5, 10, 20, 25):
        return raw(f'${num(float(v))}$', v)
    return eopt(v)


# ───────── 附圖 ─────────
def tangents_fig(r, op, *, labels=None, chord=False, angP=None, angAPB=None, angO=None, names=('O', 'A', 'B', 'P')):
    """圓 O（半徑 r）、圓外一點 P（OP＝op，在 O 的右邊），兩條切線 PA（上）、PB（下）。"""
    labels = labels or {}
    f = CFig(440, 250)
    O = f.pt(names[0], 0, 0, at=(-1, 0))
    f.circle(O, r, fill=LILAC)
    foot, h = r * r / op, r * (op * op - r * r) ** 0.5 / op
    A = f.pt(names[1], foot, h, at=(0, 1))
    B = f.pt(names[2], foot, -h, at=(0, -1))
    Pp = f.pt(names[3], op, 0, at=(1, 0))
    f.seg(O, A, color='#2f6f9f')
    f.seg(O, B, color='#2f6f9f')
    f.seg(Pp, A, color='#d2541b', width=2)
    f.seg(Pp, B, color='#d2541b', width=2)
    f.seg(O, Pp, dash=True, color='#6b7394')
    f.right(A, O, Pp)
    f.right(B, O, Pp)
    f.dot(O, r * 0.035)
    if chord:
        Rp = P('', foot, 0)
        f.seg(A, B, color='#5a3fd6', width=2)
        f.right(Rp, Pp, A, 7)
    if labels.get('r'):
        f.side(O, A, labels['r'], away=Pp)
    if labels.get('op'):
        f.side(O, Pp, labels['op'], away=A, t=0.8)
    if labels.get('pa'):
        f.side(Pp, A, labels['pa'], away=O)
    if labels.get('ab'):
        f.side(A, B, labels['ab'], away=O, color='#5a3fd6', t=0.3)
    if angP:
        f.arc(Pp, O, A, angP, r=34)
    if angAPB:
        f.arc(Pp, A, B, angAPB, r=56)
    if angO:
        f.arc(O, A, B, angO, r=20)
    return f.svg()


def chord_fig(r, d, *, labels, ang=270, names=('A', 'B', 'M'), fill=SKY):
    """圓 O（半徑 r）與弦 AB（弦心距 OM＝d），OM 方向 ang 度。"""
    f = CFig(440, 250)
    O = f.pt('O', 0, 0, at=(0.5, 0.9) if ang == 270 else (0.5, -0.9))
    f.circle(O, r, fill=fill)
    n = (math.cos(math.radians(ang)), math.sin(math.radians(ang)))
    u = (-n[1], n[0])
    half = (r * r - d * d) ** 0.5
    M = f.pt(names[2], d * n[0], d * n[1], at=(0.6 * n[0] - 0.6 * u[0], 0.6 * n[1] - 0.6 * u[1]))
    A = f.pt(names[0], M.x - half * u[0], M.y - half * u[1], at=(-u[0], -u[1]))
    B = f.pt(names[1], M.x + half * u[0], M.y + half * u[1], at=(u[0], u[1]))
    f.seg(A, B, width=2)
    f.seg(O, M, color='#d2541b', width=2)
    f.seg(O, A, dash=True, color='#2f6f9f')
    f.right(M, O, B)
    f.dot(O, r * 0.035)
    if labels.get('r'):
        f.side(O, A, labels['r'], away=B)
    if labels.get('d'):
        f.side(O, M, labels['d'], away=A, color='#d2541b')
    if labels.get('ab'):
        f.side(A, B, labels['ab'], away=O, t=0.8)
    return f.svg(), f


def two_chords_fig(cd, on, om, same_side, labels):
    """兩弦：CD（弦心距 ON）、AB（弦心距 OM）。same_side：兩弦都在 O 上方且 O、M、N 共線；否則 AB 斜放在上方、CD 在下方。"""
    r = float(sqrt(on * on + R(cd, 2) ** 2))
    f = CFig(440, 260)
    O = f.pt('O', 0, 0, at=(0.6, -0.8) if same_side else (0.9, 0.1))
    f.circle(O, r, fill=PALE if same_side else SKY)
    half_ab = (r * r - float(om) ** 2) ** 0.5
    if same_side:
        M = f.pt('M', 0, float(om), at=(-0.6, -0.6))
        N = f.pt('N', 0, float(on), at=(-0.6, -0.6))
        A = f.pt('A', -half_ab, float(om), at=(-1, 0))
        B = f.pt('B', half_ab, float(om), at=(1, 0))
        Cc = f.pt('C', -cd / 2, float(on), at=(-1, 0.4))
        D = f.pt('D', cd / 2, float(on), at=(1, 0.4))
        f.seg(O, N, color='#d2541b', width=2)
        f.right(M, O, B, 7)
        f.right(N, M, D, 7)
    else:
        a = 110
        n = (math.cos(math.radians(a)), math.sin(math.radians(a)))
        u = (-n[1], n[0])
        M = f.pt('M', float(om) * n[0], float(om) * n[1], at=(0.3, 1))
        A = f.pt('A', M.x + half_ab * u[0], M.y + half_ab * u[1], at=(-1, 0))
        B = f.pt('B', M.x - half_ab * u[0], M.y - half_ab * u[1], at=(1, 0.3))
        N = f.pt('N', 0, -float(on), at=(0.7, 0.6))
        Cc = f.pt('C', -cd / 2, -float(on), at=(-0.6, -1))
        D = f.pt('D', cd / 2, -float(on), at=(0.6, -1))
        f.seg(O, M, color='#d2541b', width=2)
        f.seg(O, N, color='#d2541b', width=2)
        f.right(M, O, B, 7)
        f.right(N, O, D, 7)
    f.seg(A, B, width=2)
    f.seg(Cc, D, width=2)
    f.dot(O, r * 0.035)
    spots = {'ab': (A, B, Cc if same_side else O, 0.8 if same_side else 0.25), 'cd': (Cc, D, O, 0.65), 'om': (O, M, A, 0.5), 'on': (O, N, D if not same_side else A, 0.5), 'mn': (M, N, A, 0.5)}
    if same_side:
        spots['cd'] = (Cc, D, M, 0.8)
    for key, (a_, b_, away, t) in spots.items():
        if labels.get(key):
            f.side(a_, b_, labels[key], away=away, t=t, color='#d2541b' if key in ('om', 'on', 'mn') else '#1b1b1b')
    return f.svg()


def tunnel_fig(ab, cd, kind):
    """隧道（C 在上方、弦 AB 在 O 下方）或水管屋（C 在下方、弦 AB 在 O 下方）；半徑標「?」。"""
    r = float((cd * cd + R(ab, 2) ** 2) / (2 * cd))
    f = CFig(440, 250)
    O = f.pt('O', 0, 0, at=(0.8, 0.4))
    f.circle(O, r, fill=SKY if kind == 'tunnel' else '#f3ecd9')
    yD = -(cd - r) if kind == 'tunnel' else -(r - cd)
    yC = r if kind == 'tunnel' else -r
    D = f.pt('D', 0, yD, at=(-0.6, 0.7) if kind == 'tunnel' else (0.7, -0.8))
    A = f.pt('A', -ab / 2, yD, at=(-1, 0))
    B = f.pt('B', ab / 2, yD, at=(1, 0))
    Cc = f.pt('C', 0, yC, at=(0, 1) if kind == 'tunnel' else (0, -1))
    f.seg(A, B, width=2.4, color='#8a5a33' if kind == 'bed' else '#1b1b1b')
    f.seg(Cc, D, width=1.6)
    f.seg(O, A, dash=True, color='#2f6f9f')
    f.right(D, O, B, 7)
    f.dot(O, r * 0.035)
    f.side(O, A, '?', away=B, color='#2f6f9f', t=0.4)
    f.side(A, B, f'{ab}', away=Cc if kind == 'bed' else O, t=0.75)
    f.dim(Cc, D, f'{cd}', away=A, off=14)
    return f.svg()


# ───────── 題目 ─────────
def apb_angle(a):
    return with_figure(value(
        rf'如圖，$\overline{{PA}}$、$\overline{{PB}}$ 分別切圓 $O$ 於 $A$、$B$ 兩點。若 $\angle APO={a}^\circ$，則 $\angle APB$ 是幾度？',
        2 * a,
        pick(2 * a, [a, 90 - a, 180 - 2 * a, 90 + a, 3 * a, 90 - 2 * a], fmt=deg),
        rf'圓的切線段性質：$\overline{{PO}}$ 平分 $\angle APB$，$\angle APB=2\times{a}^\circ={2 * a}^\circ$。'),
        tangents_fig(3, 3 / math.sin(math.radians(a)), angP=f'{a}°', angAPB='?'))


def aob_angle(p):
    o = 180 - p
    return with_figure(value(
        rf'如圖，$\overline{{PA}}$、$\overline{{PB}}$ 分別切圓 $O$ 於 $A$、$B$ 兩點。若 $\angle APB={p}^\circ$，則 $\angle AOB$ 是幾度？',
        o,
        pick(o, [p, 90 + p, 2 * p, 90 - p, 360 - 2 * p], fmt=deg),
        rf'切線垂直半徑：$\angle OAP=\angle OBP=90^\circ$。四邊形內角和 $360^\circ$：$\angle AOB=360^\circ-90^\circ-90^\circ-{p}^\circ={o}^\circ$。'),
        tangents_fig(3, 3 / math.sin(math.radians(p / 2)), angAPB=f'{p}°', angO='?'))


def quad_perim(r, op):
    pa = sqrt(op * op - r * r)
    return with_figure(value(
        rf'如圖，$\overline{{PA}}$、$\overline{{PB}}$ 分別切圓 $O$ 於 $A$、$B$。若圓 $O$ 的半徑為 ${r}$，$\overline{{OP}}={op}$，則四邊形 $OAPB$ 的周長是多少？',
        2 * r + 2 * pa,
        pick(2 * r + 2 * pa, [r + pa, 2 * pa + op, 2 * r + 2 * op, r + pa + op]),
        rf'$\angle OAP=90^\circ$，$\overline{{PA}}=\sqrt{{{op}^2-{r}^2}}={pa}$，又 $\overline{{PA}}=\overline{{PB}}$，周長 $={r}+{pa}+{pa}+{r}={2 * r + 2 * pa}$。'),
        tangents_fig(r, op, labels={'r': str(r), 'op': str(op)}))


def tangent_chord(r, op):
    pa = sqrt(op * op - r * r)
    ab = 2 * r * pa / op
    return with_figure(value(
        rf'如圖，$\overline{{PA}}$、$\overline{{PB}}$ 分別切圓 $O$ 於 $A$、$B$。若圓 $O$ 的半徑為 ${r}$，$\overline{{OP}}={op}$，則 $\overline{{AB}}$ 的長是多少？',
        ab,
        pick(ab, [ab / 2, pa, 2 * r, op - r]),
        rf'$\overline{{PA}}={pa}$。$\overline{{PO}}$ 垂直平分 $\overline{{AB}}$，設交點 $R$：$\triangle OAP$ 面積 $=\dfrac{{{r}\times{pa}}}{{2}}=\dfrac{{{op}\times\overline{{AR}}}}{{2}}$，$\overline{{AR}}={etex(ab / 2)}$，$\overline{{AB}}={etex(ab)}$。'),
        tangents_fig(r, op, labels={'r': str(r), 'op': str(op), 'ab': '?'}, chord=True))


def chord_len(r, d):
    ab = 2 * sqrt(r * r - d * d)
    return with_figure(value(
        rf'如圖，圓 $O$ 的半徑為 ${r}$，$\overline{{OM}}$ 是弦 $\overline{{AB}}$ 的弦心距，$\overline{{OM}}={d}$，則 $\overline{{AB}}$ 的長是多少？',
        ab,
        pick(ab, [ab / 2, 2 * sqrt(r * r + d * d), 2 * (r - d), r + d, 2 * r, ab + 2]),
        rf'連接 $\overline{{OA}}$，$\overline{{AM}}=\sqrt{{{r}^2-{d}^2}}={etex(ab / 2)}$。弦心距垂直平分弦：$\overline{{AB}}=2\overline{{AM}}={etex(ab)}$。'),
        chord_fig(r, d, labels={'r': str(r), 'd': str(d), 'ab': '?'})[0])


def chord_dist(r, c):
    d = sqrt(r * r - R(c, 2) ** 2)
    return with_figure(value(
        rf'如圖，圓 $O$ 的半徑為 ${r}$，弦 $\overline{{AB}}={c}$，$\overline{{OM}}$ 是 $\overline{{AB}}$ 的弦心距，則 $\overline{{OM}}$ 是多少？',
        d,
        pick(d, [sqrt(r * r + R(c, 2) ** 2), r - R(c, 2), R(c, 2), d + 2]),
        rf'$\overline{{OM}}$ 垂直平分 $\overline{{AB}}$，$\overline{{AM}}={R(c, 2)}$，$\overline{{OM}}=\sqrt{{{r}^2-{R(c, 2)}^2}}={etex(d)}$。'),
        chord_fig(r, float(d), labels={'r': str(r), 'd': '?', 'ab': str(c)})[0])


def radius_from_chord(c, d):
    r = sqrt(R(c, 2) ** 2 + d * d)
    return with_figure(value(
        rf'如圖，弦 $\overline{{AB}}={c}$，弦心距 $\overline{{OM}}={d}$，則圓 $O$ 的半徑是多少？',
        r,
        pick(r, [sqrt(c * c + d * d), R(c, 2) + d, R(c, 2), r + 2]),
        rf'$\overline{{AM}}=\dfrac12\overline{{AB}}={R(c, 2)}$，半徑 $\overline{{OA}}=\sqrt{{{R(c, 2)}^2+{d}^2}}={etex(r)}$。用整條弦 ${c}$ 是常見錯誤。'),
        chord_fig(float(r), d, labels={'r': '?', 'd': str(d), 'ab': str(c)})[0])


def two_chords(cd, on, om):
    r = sqrt(on * on + R(cd, 2) ** 2)
    am = sqrt(r * r - om * om)
    return with_figure(value(
        rf'如圖，$\overline{{OM}}$、$\overline{{ON}}$ 分別是圓 $O$ 的弦 $\overline{{AB}}$、$\overline{{CD}}$ 的弦心距。若 $\overline{{CD}}={cd}$、$\overline{{ON}}={on}$、$\overline{{OM}}={om}$，則 $\overline{{AB}}$ 的長是多少？',
        2 * am,
        pick(2 * am, [am, 2 * r, cd, 2 * sqrt(r * r + om * om), am + om]),
        rf'$\overline{{CN}}={R(cd, 2)}$，半徑 $\overline{{OC}}=\sqrt{{{on}^2+{R(cd, 2)}^2}}={etex(r)}=\overline{{OA}}$；$\overline{{AM}}=\sqrt{{{etex(r)}^2-{om}^2}}={etex(am)}$，$\overline{{AB}}={etex(2 * am)}$。'),
        two_chords_fig(cd, on, om, False, {'cd': str(cd), 'on': str(on), 'om': str(om), 'ab': '?'}))


def same_side(om, ab, cd):
    r = sqrt(om * om + R(ab, 2) ** 2)
    on = sqrt(r * r - R(cd, 2) ** 2)
    mn = on - om
    return with_figure(value(
        rf'如圖，$\overline{{OM}}$、$\overline{{ON}}$ 分別是弦 $\overline{{AB}}$、$\overline{{CD}}$ 的弦心距，且 $O$、$M$、$N$ 三點共線。若 $\overline{{OM}}={om}$、$\overline{{AB}}={ab}$、$\overline{{CD}}={cd}$，則 $\overline{{MN}}$ 的長是多少？',
        mn,
        pick(mn, [on + om, on, r - om, r - on]),
        rf'半徑 $=\sqrt{{{om}^2+{R(ab, 2)}^2}}={etex(r)}$，$\overline{{ON}}=\sqrt{{{etex(r)}^2-{R(cd, 2)}^2}}={etex(on)}$，兩弦在 $O$ 的同側：$\overline{{MN}}=\overline{{ON}}-\overline{{OM}}={etex(mn)}$。'),
        two_chords_fig(cd, on, om, True, {'ab': str(ab), 'cd': str(cd), 'om': str(om), 'mn': '?'}))


def tunnel(ab, cd, kind):
    r = (cd * cd + R(ab, 2) ** 2) / (2 * cd)
    assert simplify(r**2 - ((cd - r) ** 2 + R(ab, 2) ** 2)) == 0
    if kind == 'tunnel':
        stem = rf'如圖，某隧道的橫切面是圓 $O$ 的一部分，路面寬 $\overline{{AB}}={ab}$ 公尺，隧道高度 $\overline{{CD}}={cd}$ 公尺（$\overline{{CD}}$ 通過圓心且垂直 $\overline{{AB}}$），隧道半徑是幾公尺？'
        how = rf'設半徑 $x$，$\overline{{OD}}={cd}-x$'
    else:
        stem = rf'如圖，圓形水管屋的截面圓心為 $O$，床長 $\overline{{AB}}={ab}$ 公分，床與地面的距離 $\overline{{CD}}={cd}$ 公分（$\overline{{CD}}$ 通過圓心且垂直 $\overline{{AB}}$），水管屋的半徑是幾公分？'
        how = rf'設半徑 $x$，$\overline{{OD}}=x-{cd}$'
    return with_figure(value(
        stem,
        r,
        pick(r, [R(ab, 2), 2 * r, R(cd, 2) + R(ab, 4), cd], fmt=dec),
        rf'{how}，$\overline{{AD}}={R(ab, 2)}$。$x^2=\overline{{OD}}^2+{R(ab, 2)}^2$，解得 $x={num(float(r))}$。'),
        tunnel_fig(ab, cd, kind))


SLOTS = [
    slot(1, '切線段性質：PO 平分∠APB', [apb_angle(25), apb_angle(30), apb_angle(35)]),
    slot(2, '切線與半徑：求∠AOB', [aob_angle(30), aob_angle(60), aob_angle(50)]),
    slot(3, '切線段等長：四邊形周長', [quad_perim(5, 13), quad_perim(6, 10), quad_perim(9, 15)]),
    slot(4, '切點連線 AB 的長', [tangent_chord(6, 10), tangent_chord(5, 13), tangent_chord(7, 25)]),
    slot(5, '由弦心距求弦長', [chord_len(13, 5), chord_len(17, 8), chord_len(5, 3)]),
    slot(6, '由弦長求弦心距', [chord_dist(10, 16), chord_dist(13, 24), chord_dist(17, 30)]),
    slot(7, '由弦長與弦心距求半徑', [radius_from_chord(12, 8), radius_from_chord(10, 12), radius_from_chord(16, 15)]),
    slot(8, '兩弦：先求半徑再求弦長', [two_chords(24, 5, 12), two_chords(10, 12, 5), two_chords(16, 15, 8)]),
    slot(9, '同側兩弦的距離 MN', [same_side(5, 24, 10), same_side(6, 16, 12), same_side(15, 40, 14)]),
    slot(10, '弦心距的生活應用', [tunnel(30, 25, 'tunnel'), tunnel(24, 16, 'tunnel'), tunnel(72, 12, 'bed')]),
]

if __name__ == '__main__':
    export('g9-2-1c', '2-1 點、直線與圓（3）：課後檢核', '九年級 2-1 課本 p.98–105（切線段性質、弦與弦心距）＋2-1(1)(2)、八上畢氏定理與乘法公式；題目自編，答案已用 SymPy 核算', SLOTS)
