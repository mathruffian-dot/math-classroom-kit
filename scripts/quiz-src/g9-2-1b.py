r"""2-1 點、直線與圓之間的位置關係（2）點、直線與圓、切線：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一，每題附圖）。

用法：python -X utf8 scripts/quiz-src/g9-2-1b.py
範圍：前一堂（圓的名詞、弧長、扇形）＋這一堂的點與圓（OP 和 r 比大小）、直線與圓（圓心到直線的距離 d 和 r 比大小：
不相交、切線、割線）、切線垂直過切點的半徑、切線段長（畢氏定理）；先備：點到直線的距離（七下）、
畢氏定理、坐標平面上兩點距離、根式（八上）、三角形內角和（七下）。
不用切線段性質 PA＝PB、弦心距（第 3 堂）、圓周角（2-2）。
附圖都用題目的同一組數字畫（比例照實際數字）；判斷位置的題目不畫出答案（例如平行線題不畫圓）。
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import Rational, simplify, sqrt  # noqa: E402

from circlefig import GREEN, SKY, CFig, P, deg, eopt  # noqa: E402
from geom import num  # noqa: E402
from quizlib import export, raw, slot, statement, value, with_figure  # noqa: E402

R = Rational


def pick(correct, cands, fmt=eopt):
    out, seen = [fmt(correct)], [simplify(correct)]
    for c in cands:
        if all(simplify(c - x) != 0 for x in seen) and c > 0:
            out.append(fmt(c))
            seen.append(simplify(c))
        if len(out) == 4:
            return out
    raise AssertionError(f'錯誤選項不夠：{correct} {cands}')


# ───────── 附圖 ─────────
def point_fig(r, px, py):
    """坐標平面：圓心在原點、半徑 r，點 P(px, py)。"""
    f = CFig(440, 260)
    O = f.pt('O', 0, 0, at=(-1, -1))
    m = max(r, abs(px), abs(py)) + 1.2
    f.seg(P('', -m, 0), P('', m, 0), width=1, color='#9aa0b4')
    f.seg(P('', 0, -m), P('', 0, m), width=1, color='#9aa0b4')
    f.pt('', -m, 0, False)
    f.pt('', m, 0, False)
    f.text(m - 0.2, -0.7, 'x', 13, color='#6b7394')
    f.text(0.5, m - 0.3, 'y', 13, color='#6b7394')
    f.circle(O, r, fill='#fbf3c4')
    Pp = f.pt('', px, py, False)
    f.text(px + 0.45, py + 0.45, f'P({px}, {py})', 15, anchor='start')
    f.seg(O, Pp, dash=True, color='#2f6f9f')
    f.dot(O, r * 0.035)
    f.dot(Pp, r * 0.05)
    f.text(r * 0.55, -0.8, f'r＝{r}', 13, color='#4b5478')
    return f.svg()


def dist_fig(r, d, r_text, d_text, ang=35):
    """圓 O（半徑 r）與點 P（OP＝d）。"""
    f = CFig(440, 250)
    O = f.pt('O', 0, 0, at=(-1, 0.5))
    f.circle(O, r, fill='#fbf3c4')
    Pp = f.on(O, d, ang, 'P', at=(1, 0.5))
    f.seg(O, Pp, color='#2f6f9f', width=2)
    Q = f.on(O, r, 250)
    f.seg(O, Q, dash=True, color='#6b7394')
    f.side(O, Q, r_text, away=Pp)
    f.side(O, Pp, d_text, away=Q)
    f.dot(O, r * 0.035)
    f.dot(Pp, r * 0.035)
    return f.svg()


def line_fig(r, d, d_text, diam_text=None, r_text=None):
    """圓 O（半徑 r）與直線 L（圓心到 L 的距離 d），垂足 H。"""
    f = CFig(440, 250)
    O = f.pt('O', 0, 0, at=(-0.7, -0.7))
    f.circle(O, r, fill='#eef6dd')
    H = f.pt('H', d, 0, at=(1, -0.6))
    top, bot = P('', d, r * 1.25), P('', d, -r * 1.25)
    f.pt('', d, r * 1.25, False)
    f.pt('', d, -r * 1.25, False)
    f.seg(top, bot, width=2, color='#d2541b')
    f.text(d + 0.35 * r, r * 1.15, 'L', 15, color='#d2541b')
    f.seg(O, H, dash=True, color='#2f6f9f')
    f.right(H, O, top)
    f.side(O, H, d_text, away=P('', 0, -r))
    if diam_text:
        A, B = f.at(O, r, 120), f.at(O, r, 300)
        f.seg(A, B, color='#6b7394')
        f.side(A, B, diam_text, away=H, t=0.25)
    if r_text:
        A = f.at(O, r, 230)
        f.seg(O, A, color='#6b7394')
        f.side(O, A, r_text, away=H)
    f.dot(O, r * 0.035)
    return f.svg()


def tangent_fig(r, t, labels, names=('O', 'A', 'B'), angle=None):
    """圓 O（半徑 r），切線切圓於 A（正下方），B 在切線上、AB＝t。labels：{'OA','AB','OB'}；angle：{'O': 文字, 'B': 文字}。"""
    f = CFig(440, 250)
    O = f.pt(names[0], 0, 0, at=(-1, 0.4))
    f.circle(O, r, fill='#ece3f5')
    A = f.pt(names[1], 0, -r, at=(0, -1))
    B = f.pt(names[2], t, -r, at=(0.4, -1))
    f.seg(P('', -0.4 * r, -r), P('', t + 0.4 * r, -r), width=1.8)
    f.pt('', -0.4 * r, -r, False)
    f.pt('', t + 0.4 * r, -r, False)
    f.seg(O, A, dash=True, color='#2f6f9f')
    f.seg(O, B)
    f.right(A, O, B)
    f.dot(O, r * 0.035)
    if labels.get('OA'):
        f.side(O, A, labels['OA'], away=B, color='#2f6f9f')
    if labels.get('AB'):
        f.side(A, B, labels['AB'], away=O)
    if labels.get('OB'):
        f.side(O, B, labels['OB'], away=A)
    if angle and angle.get('O'):
        f.arc(O, A, B, angle['O'], r=24)
    if angle and angle.get('B'):
        f.arc(B, O, A, angle['B'], r=26)
    return f.svg()


def parallel_fig(gap, k, n=5):
    """五條水平平行線 L1～L5（相鄰間距 gap），O 在 Lk 上；不畫圓（題目要判斷）。"""
    f = CFig(440, 250)
    w = gap * 6
    ys = [(n - 1 - i) * gap for i in range(n)]
    for i, y in enumerate(ys):
        f.seg(P('', 0, y), P('', w, y), width=1.6)
        f.pt('', 0, y, False)
        f.pt('', w, y, False)
        f.text(w + gap * 0.45, y, f'L{"₁₂₃₄₅"[i]}', 15)
    O = f.pt('O', w * 0.45, ys[k - 1], at=(0, -1))
    f.dot(O, gap * 0.08)
    a, b = P('', w * 0.12, ys[0]), P('', w * 0.12, ys[1])
    f.dim(a, b, num(gap), away=P('', w, ys[0]), off=10)
    return f.svg()


def rays_fig(ds, names):
    """O 到幾條直線的距離（垂直線段），不畫圓。"""
    f = CFig(440, 260)
    O = f.pt('O', 0, 0, at=(-0.9, 0.5))
    angs = [90, 5, 205, 290][: len(ds)]
    m = max(ds)
    for d, nm, a in zip(ds, names, angs):
        Fp = f.at(O, d, a)
        ux, uy = -math.sin(math.radians(a)), math.cos(math.radians(a))
        h = m * 0.28
        p1, p2 = P('', Fp.x - ux * h, Fp.y - uy * h), P('', Fp.x + ux * h, Fp.y + uy * h)
        f.pt('', p1.x, p1.y, False)
        f.pt('', p2.x, p2.y, False)
        f.seg(p1, p2, width=2, color='#d2541b')
        f.seg(O, Fp, dash=True, color='#2f6f9f')
        f.right(Fp, O, p2, 7)
        f.side(O, Fp, num(d), away=p2)
        lp = f.at(O, d + m * 0.12, a)
        f.text(lp.x + ux * h * 0.9, lp.y + uy * h * 0.9, nm, 15, color='#d2541b')
    f.dot(O, m * 0.025)
    return f.svg()


# ───────── 題目 ─────────
POS = ['圓內', '圓上', '圓外']


def where(d2, r2):
    return 0 if d2 < r2 else 1 if d2 == r2 else 2


def point_coord(px, py, r=5):
    k = where(px * px + py * py, r * r)
    opts = [(f'$P$ 在{POS[k]}', True)] + [(f'$P$ 在{POS[i]}', False) for i in range(3) if i != k] + [('$P$ 是圓心', False)]
    rel = ['<', '=', '>'][k]
    return with_figure(statement(
        rf'坐標平面上，圓 $O$ 的圓心是原點、半徑為 ${r}$。點 $P({px},{py})$ 和圓 $O$ 的位置關係是？',
        opts,
        rf'$\overline{{OP}}=\sqrt{{{px}^2+{py}^2}}=\sqrt{{{px * px + py * py}}}$，和半徑 ${r}=\sqrt{{{r * r}}}$ 比較：$\overline{{OP}}{rel}r$，$P$ 在{POS[k]}。'),
        point_fig(r, px, py))


def point_dist(diam, op):
    r = R(diam, 2)
    op = R(op)
    k = where(op, r)
    rel = ['<', '=', '>'][k]
    t = lambda v: str(v) if v.q == 1 else f'{float(v):g}'
    opts = [(f'$P$ 在{POS[k]}', True)] + [(f'$P$ 在{POS[i]}', False) for i in range(3) if i != k] + [('無法判斷', False)]
    return with_figure(statement(
        rf'圓 $O$ 的直徑為 ${diam}$，$\overline{{OP}}={t(op)}$，點 $P$ 和圓 $O$ 的位置關係是？',
        opts,
        rf'半徑 $r={t(r)}$（直徑的一半），$\overline{{OP}}={t(op)}{rel}{t(r)}$，所以 $P$ 在{POS[k]}。要和半徑比，不是和直徑比。'),
        dist_fig(float(r), float(op), f'r＝{t(r)}', t(op)))


LINE = ['$L$ 是圓 $O$ 的割線', '$L$ 是圓 $O$ 的切線', '$L$ 和圓 $O$ 不相交']


def line_pos(diam, d):
    r = R(diam, 2)
    d = R(d)
    k = where(d, r)
    rel = ['<', '=', '>'][k]
    t = lambda v: str(v) if v.q == 1 else f'{float(v):g}'
    opts = [(LINE[k], True)] + [(LINE[i], False) for i in range(3) if i != k] + [('$L$ 通過圓心 $O$', False)]
    return with_figure(statement(
        rf'圓 $O$ 的直徑為 ${diam}$，圓心 $O$ 到直線 $L$ 的距離為 ${t(d)}$。哪一個敘述正確？',
        opts,
        rf'半徑 $r={t(r)}$，距離 $d={t(d)}{rel}r$，所以' + ['有兩個交點，是割線。', '只有一個交點，是切線。', '沒有交點。'][k]),
        line_fig(float(r), float(d), t(d), diam_text=str(diam)))


def tangent_diam(d):
    d = R(d)
    t = lambda v: str(v) if v.q == 1 else f'{float(v):g}'
    return with_figure(value(
        rf'直線 $L$ 是圓 $O$ 的切線，圓心 $O$ 到 $L$ 的距離為 ${t(d)}$，圓 $O$ 的直徑是多少？',
        2 * d,
        pick(2 * d, [d, 4 * d, d / 2], fmt=lambda v: raw(f'${num(float(v))}$', v)),
        rf'切線到圓心的距離等於半徑：$r={t(d)}$，直徑 $=2r={t(2 * d)}$。'),
        line_fig(float(d), float(d), t(d), diam_text='?'))


def tangent_angle(a):
    b = 90 - a
    r = 4
    t = r * math.tan(math.radians(a))
    return with_figure(value(
        rf'如圖，直線 $AB$ 切圓 $O$ 於 $A$ 點，$\angle AOB={a}^\circ$，則 $\angle ABO$ 是幾度？',
        b,
        pick(b, [a, 90, 180 - a, 2 * b], fmt=deg),
        rf'切線垂直過切點的半徑：$\angle OAB=90^\circ$，$\angle ABO=180^\circ-90^\circ-{a}^\circ={b}^\circ$。'),
        tangent_fig(r, t, {}, angle={'O': f'{a}°', 'B': '?'}))


def seg_len(r, ob):
    ab = sqrt(ob * ob - r * r)
    return with_figure(value(
        rf'如圖，直線 $AB$ 切圓 $O$ 於 $A$ 點，圓 $O$ 的半徑為 ${r}$，$\overline{{OB}}={ob}$，則切線段 $\overline{{AB}}$ 的長是多少？',
        ab,
        pick(ab, [sqrt(ob * ob + r * r), ob - r, ob + r, R(ob + r, 2)]),
        rf'連接 $\overline{{OA}}$，$\overline{{OA}}\perp\overline{{AB}}$，$\overline{{AB}}=\sqrt{{{ob}^2-{r}^2}}={ab}$。'),
        tangent_fig(r, float(ab), {'OA': str(r), 'OB': str(ob), 'AB': '?'}))


def radius_from_seg(cd, od):
    r = sqrt(od * od - cd * cd)
    return with_figure(value(
        rf'如圖，直線 $CD$ 切圓 $O$ 於 $C$ 點，$\overline{{CD}}={cd}$、$\overline{{OD}}={od}$，則圓 $O$ 的半徑是多少？',
        r,
        pick(r, [sqrt(od * od + cd * cd), od - cd, R(od, 2), od + cd]),
        rf'$\overline{{OC}}\perp\overline{{CD}}$，$\triangle OCD$ 的斜邊是 $\overline{{OD}}$：半徑 $\overline{{OC}}=\sqrt{{{od}^2-{cd}^2}}={r}$。'),
        tangent_fig(float(r), cd, {'OA': '?', 'AB': str(cd), 'OB': str(od)}, names=('O', 'C', 'D')))


def op_from_seg(r, pa):
    op = sqrt(r * r + pa * pa)
    return with_figure(value(
        rf'如圖，直線 $PA$ 切圓 $O$ 於 $A$ 點，圓 $O$ 的半徑為 ${r}$，切線段 $\overline{{PA}}={pa}$，則 $\overline{{OP}}$ 是多少？',
        op,
        pick(op, [r + pa, sqrt(abs(pa * pa - r * r)), pa, sqrt(r * r + pa)]),
        rf'$\overline{{OA}}\perp\overline{{PA}}$，$\overline{{OP}}$ 是斜邊：$\overline{{OP}}=\sqrt{{{r}^2+{pa}^2}}={eopt(op)[0].strip("$")}$。'),
        tangent_fig(r, pa, {'OA': str(r), 'AB': str(pa), 'OB': '?'}, names=('O', 'A', 'P')))


KIND = {'secant': '割線', 'tangent': '切線', 'none': '與圓 $O$ 不相交的直線'}


def parallel(gap, k, r, ask):
    gap = R(gap)
    ds = [abs(i - (k - 1)) * gap for i in range(5)]
    n = sum(1 for d in ds if bool((d < r) if ask == 'secant' else (d == r) if ask == 'tangent' else (d > r)))
    return with_figure(value(
        rf'如圖，五條平行線 $L_1$～$L_5$ 相鄰兩條的距離都是 ${num(gap)}$，$O$ 點在 $L_{k}$ 上。以 $O$ 為圓心、半徑 ${r}$ 畫圓，{KIND[ask]}有幾條？',
        n,
        pick(n, [n + 1, n - 1, n + 2, 4, 5, 1, 2, 3], fmt=lambda v: eopt(v, '條')),
        rf'$L_1$～$L_5$ 到 $O$ 的距離依序是 {"、".join(num(d) for d in ds)}，和半徑 ${r}$ 比較：' + ('距離小於半徑的是割線' if ask == 'secant' else '距離等於半徑的是切線' if ask == 'tangent' else '距離大於半徑的不相交') + f'，共 {n} 條。'),
        parallel_fig(float(gap), k))


def four_lines(diam, ds):
    r = R(diam, 2)
    ds = [R(str(d)) for d in ds]
    names = ['L', 'M', 'N', 'H']
    tang = [nm for d, nm in zip(ds, names) if d == r]
    sec = [nm for d, nm in zip(ds, names) if d < r]
    none = [nm for d, nm in zip(ds, names) if d > r]
    t = lambda v: str(v) if R(v).q == 1 else f'{float(v):g}'
    true = f'有 {len(tang)} 條切線、{len(sec)} 條割線'
    far = names[ds.index(max(ds))]
    opts = [(true, True), (f'有 {len(tang) + 1} 條切線、{len(sec)} 條割線', False), ('4 條都和圓 $O$ 相交', False), (f'直線 ${far}$ 是切線', False)]
    return with_figure(statement(
        rf'圓 $O$ 的直徑為 ${diam}$，$O$ 到直線 $L$、$M$、$N$、$H$ 的距離如圖。哪一個敘述正確？',
        opts,
        rf'半徑 $r={t(r)}$。距離等於 ${t(r)}$ 的是切線（{"、".join(tang) or "沒有"}），小於 ${t(r)}$ 的是割線（{"、".join(sec) or "沒有"}），大於 ${t(r)}$ 的不相交（{"、".join(none) or "沒有"}）。'),
        rays_fig([float(d) for d in ds], names))


SLOTS = [
    slot(1, '點與圓（坐標）', [point_coord(3, 4), point_coord(4, 4), point_coord(2, 4)]),
    slot(2, '點與圓（和半徑比）', [point_dist(12, 7), point_dist(10, 5), point_dist(16, '7.5')]),
    slot(3, '直線與圓的位置關係', [line_pos(14, 7), line_pos(10, 6), line_pos(18, 4)]),
    slot(4, '切線到圓心的距離＝半徑', [tangent_diam(6), tangent_diam('4.5'), tangent_diam('7.5')]),
    slot(5, '切線垂直半徑（角度）', [tangent_angle(50), tangent_angle(62), tangent_angle(35)]),
    slot(6, '求切線段長', [seg_len(5, 13), seg_len(8, 17), seg_len(6, 10)]),
    slot(7, '由切線段求半徑', [radius_from_seg(4, 5), radius_from_seg(12, 13), radius_from_seg(8, 10)]),
    slot(8, '由半徑與切線段求 OP', [op_from_seg(9, 12), op_from_seg(4, 6), op_from_seg(2, 4)]),
    slot(9, '平行線與圓', [parallel(3, 1, 7, 'secant'), parallel(2, 3, 4, 'tangent'), parallel('1.5', 2, 3, 'none')]),
    slot(10, '由距離判斷切線、割線', [four_lines(20, [12, 10, 8, 5]), four_lines(12, [6, 4, 7, 6]), four_lines(15, [7.5, 9, 6, 3])]),
]

if __name__ == '__main__':
    export('g9-2-1b', '2-1 點、直線與圓（2）：課後檢核', '九年級 2-1 課本 p.92–97（點與圓、直線與圓、切線、切線段長）＋2-1(1)、八上畢氏定理；題目自編，答案已用 SymPy 核算', SLOTS)
