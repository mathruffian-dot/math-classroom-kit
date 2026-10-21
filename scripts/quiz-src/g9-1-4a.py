r"""1-4 相似三角形的應用（1）簡易測量與對應高：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一，每題附圖）。

用法：python -X utf8 scripts/quiz-src/g9-1-4a.py
範圍：1-3 的相似三角形（AA、對應邊成比例、平行線截出相似三角形）＋這一堂的影子測高、測量河寬、
對應高的比＝對應邊的比。不用面積比（下一堂）、sin／cos／tan（第三堂）。
附圖都用題目的同一組數字畫（比例照實際數字），題目問的那一段標「?」。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import Rational  # noqa: E402

from geom import Fig, num  # noqa: E402
from quizlib import export, slot, statement, value, with_figure  # noqa: E402
from similar import heights_fig, q, qty, sides_fig, tex  # noqa: E402

R = Rational


# ───────── 附圖 ─────────
def shadow_fig(h, s, H, S, labels, obj='tree'):
    """同一時刻的人（高 h、影 s）和樹／旗桿（高 H、影 S）。labels＝(人高, 人影, 物高, 物影) 的文字。"""
    f = Fig(460, 250)
    # 人比物體矮很多時，把人的三角形等比例放大來畫（仍然和物體的三角形相似，標籤寫真實長度）
    z = max(1.0, 0.3 * H / h)
    h, s = h * z, s * z
    gap = max(s, S) * 0.35 + 0.6 + (H * 0.45 if obj == 'building' else 0)
    A, B, C = f.pt('', 0, h, False), f.pt('', 0, 0, False), f.pt('', s, 0, False)
    x0 = s + gap
    D, E, F = f.pt('', x0, H, False), f.pt('', x0, 0, False), f.pt('', x0 + S, 0, False)
    f.pt('', -max(s, S) * 0.22, 0, False)  # 左邊留位置給身高的標籤
    f.ground(-0.2, x0 + S + 0.2)
    f.person(B, h)
    {'tree': f.tree, 'flag': f.flag, 'building': f.building}[obj](E, H)
    f.seg(A, C, dash=True, color='#c98a12')
    f.seg(D, F, dash=True, color='#c98a12')
    f.seg(B, C, width=4, color='#555')
    f.seg(E, F, width=4, color='#555')
    f.right(B, A, C, 7)
    f.right(E, D, F, 7)
    f.dim(A, B, labels[0], away=C, off=12, clear=h * 0.16)
    f.side(B, C, labels[1], away=A, offset=14)
    # 尺寸線放在物體左側，避開樹冠／大樓
    f.dim(D, E, labels[2], away=F, off=8, clear={'tree': H * 0.22, 'flag': 0.0, 'building': H * 0.34}[obj])
    f.side(E, F, labels[3], away=D, offset=14)
    return f.svg()


def river_cross_fig(m, n, de, labels):
    """課本例 2：A 在岸邊、B 在對岸；A→C 走 m 步、C→D 再走 n 步，D 轉直角到 E，B、C、E 共線。"""
    ab = de * m / n
    k = de / n  # 一步的長度（只用來畫圖）
    f = Fig(460, 260)
    D = f.pt('D', 0, 0, at=(-1, 0.6))
    C = f.pt('C', n * k, 0, at=(0.9, -1))
    A = f.pt('A', (n + m) * k, 0, at=(0.6, -1))
    B = f.pt('B', (n + m) * k, ab, at=(0.6, 0.6))
    E = f.pt('E', 0, -de, at=(-1, -0.4))
    w = (n + m) * k
    r1, r2, r3, r4 = (f.pt('', -0.1 * w, ab * 0.15, False), f.pt('', 1.08 * w, ab * 0.15, False),
                      f.pt('', 1.08 * w, ab * 0.9, False), f.pt('', -0.1 * w, ab * 0.9, False))
    f.poly([r1, r2, r3, r4], fill='#dcecf7', stroke=False)
    f.text(0.25 * w, ab * 0.55, '河', 16, color='#5b8db8')
    f.seg(D, A)
    f.seg(A, B)
    f.seg(D, E)
    f.seg(B, E)
    f.right(A, B, D)
    f.right(D, A, E)
    f.side(A, B, labels[0], away=D)
    f.side(A, C, labels[1], away=E)
    f.side(C, D, labels[2], away=E)
    f.side(D, E, labels[3], away=A)
    return f.svg()


def river_nest_fig(a, c, b, labels):
    """課本例 2 隨堂：AB⊥BE、CD⊥BE，A、C、E 共線，河寬 DE。"""
    x = R(b) * c / (a - c)
    f = Fig(460, 250)
    B = f.pt('B', 0, 0, at=(-0.6, -1))
    D = f.pt('D', b, 0, at=(0, -1))
    E = f.pt('E', b + x, 0, at=(0.6, -1))
    A = f.pt('A', 0, a, at=(-0.6, 0.6))
    C = f.pt('C', b, c, at=(0.5, 0.8))
    r = [f.pt('', b + 0.15, -0.12 * a, False), f.pt('', b + x + 0.25 * x, -0.12 * a, False),
         f.pt('', b + x + 0.25 * x, 1.0 * a, False), f.pt('', b + 0.15, 1.0 * a, False)]
    f.poly(r, fill='#dcecf7', stroke=False)
    f.text(b + x * 0.75, a * 0.75, '河', 16, color='#5b8db8')
    f.poly([A, B, E], fill=None)
    f.seg(C, D)
    f.right(B, A, E)
    f.right(D, C, E)
    f.side(A, B, labels[0], away=E)
    f.side(C, D, labels[1], away=E)
    f.side(B, D, labels[2], away=A)
    f.side(D, E, labels[3], away=A)
    return f.svg()


def lamp_fig(H, h, d, labels):
    """路燈高 H、身高 h 的人站在離燈柱 d 處，影長 s：h : H ＝ s : (d＋s)。"""
    s = R(h) * d / (H - h)
    f = Fig(460, 250)
    B = f.pt('', 0, 0, False)
    A = f.pt('', 0, H, False)
    D = f.pt('', d, 0, False)
    C = f.pt('', d, h, False)
    E = f.pt('', d + s, 0, False)
    f.pt('', -float(d + s) * 0.14, 0, False)  # 左邊留位置給燈高的標籤
    f.ground(-0.3, float(d + s) + 0.3)
    f.seg(A, B, width=4, color='#555')
    f.sun(0, H)
    f.person(D, h)
    f.seg(A, E, dash=True, color='#c98a12')
    f.seg(D, E, width=4, color='#555')
    f.right(B, A, D, 7)
    f.dim(A, B, labels[0], away=E, off=10)
    f.dim(C, D, labels[1], away=B, off=8, clear=h * 0.16)
    f.side(B, D, labels[2], away=A)
    f.side(D, E, labels[3], away=A)
    return f.svg()


# ───────── 題目 ─────────
def corr_side(ab, de, bc):
    """△ABC～△DEF，AB、DE、BC 已知，求 EF。"""
    ef = R(bc) * de / ab
    return with_figure(value(
        rf'如圖，$\triangle ABC\sim\triangle DEF$，$\overline{{AB}}={ab}$、$\overline{{DE}}={de}$、$\overline{{BC}}={bc}$，則 $\overline{{EF}}=$？',
        ef,
        [qty(ef), qty(R(bc) * ab / de), qty(bc - (ab - de)), qty(R(bc) * de / ab + de)],
        rf'對應邊成比例：$\overline{{AB}}:\overline{{DE}}=\overline{{BC}}:\overline{{EF}}$，${ab}:{de}={bc}:\overline{{EF}}$，$\overline{{EF}}={tex(ef).strip("$")}$。'),
        sides_fig(R(de, ab), {'side1': str(ab), 'side2': str(de), 'base1': str(bc), 'base2': '?'}))


def shadow_height(h, s, S):
    """同一時刻，身高 h 公尺、影長 s 公尺；樹影 S 公尺，樹高？"""
    h, s, S = q(h), q(s), q(S)
    H = h * S / s
    return with_figure(value(
        rf'同一時刻，身高 ${num(h)}$ 公尺的人影長 ${num(s)}$ 公尺，旁邊一棵樹的影長 ${num(S)}$ 公尺，樹高幾公尺？',
        H,
        [qty(H, '公尺'), qty(s * S / h, '公尺'), qty(h * s / S if h * s / S != H else h + S, '公尺'), qty(S + (h - s) if S + (h - s) > 0 else S + h, '公尺')],
        rf'同一時刻陽光的角度相同，兩個直角三角形相似（AA）：身高 : 影長 ＝ 樹高 : 樹影，${num(h)}:{num(s)}=x:{num(S)}$，$x={tex(H).strip("$")}$ 公尺。'),
        shadow_fig(float(h), float(s), float(H), float(S), (f'{num(h)} m', f'{num(s)} m', '?', f'{num(S)} m')))


def shadow_length(h, s, H):
    """已知物高，求影長。"""
    h, s, H = q(h), q(s), q(H)
    S = s * H / h
    return with_figure(value(
        rf'同一時刻，身高 ${num(h)}$ 公尺的人影長 ${num(s)}$ 公尺，旁邊高 ${num(H)}$ 公尺的旗桿，影長是幾公尺？',
        S,
        [qty(S, '公尺'), qty(h * H / s, '公尺'), qty(H - (h - s), '公尺'), qty(H * s, '公尺')],
        rf'身高 : 影長 ＝ 旗桿高 : 旗桿影，${num(h)}:{num(s)}={num(H)}:x$，$x={tex(S).strip("$")}$ 公尺。'),
        shadow_fig(float(h), float(s), float(H), float(S), (f'{num(h)} m', f'{num(s)} m', f'{num(H)} m', '?'), obj='flag'))


def shadow_units(hc, sc, S):
    """身高、影長用公分，建築物影長用公尺。"""
    H = R(hc) * S / sc
    return with_figure(value(
        rf'同一時刻，身高 ${hc}$ 公分的人影長 ${sc}$ 公分，一棟大樓的影長 ${S}$ 公尺，大樓高幾公尺？',
        H,
        [qty(H, '公尺'), qty(H * 100, '公尺'), qty(R(sc) * S / hc, '公尺'), qty(H / 100, '公尺')],
        rf'比的兩邊單位一致就好：${hc}:{sc}=x:{S}$（$x$ 和 ${S}$ 都用公尺），$x={tex(H).strip("$")}$ 公尺。'),
        shadow_fig(hc / 100, sc / 100, float(H), float(S), (f'{hc} cm', f'{sc} cm', '?', f'{S} m'), obj='building'))


def river_cross(m, n, de):
    ab = R(de) * m / n
    return with_figure(value(
        rf'如圖，從岸邊 $A$ 沿河岸走 ${m}$ 步到 $C$，再走 ${n}$ 步到 $D$，轉直角走到 $E$，使 $B$、$C$、$E$ 在同一直線上。每步一樣長，$\overline{{DE}}={de}$ 公尺，河寬 $\overline{{AB}}$ 是幾公尺？',
        ab,
        [qty(ab, '公尺'), qty(R(de) * n / m, '公尺'), qty(R(de) * (m + n) / n, '公尺'), qty(de + m - n, '公尺')],
        rf'$\angle A=\angle D=90^\circ$、$\angle ACB=\angle DCE$（對頂角），$\triangle ABC\sim\triangle DEC$（AA）。$\overline{{AB}}:\overline{{DE}}=\overline{{AC}}:\overline{{DC}}={m}:{n}$，$\overline{{AB}}={tex(ab).strip("$")}$ 公尺。'),
        river_cross_fig(m, n, de, ('?', f'{m} 步', f'{n} 步', f'{de} m')))


def river_nest(a, c, b):
    x = R(b) * c / (a - c)
    return with_figure(value(
        rf'如圖，$\overline{{AB}}\perp\overline{{BE}}$、$\overline{{CD}}\perp\overline{{BE}}$，$A$、$C$、$E$ 在同一直線上。$\overline{{AB}}={a}$、$\overline{{CD}}={c}$、$\overline{{BD}}={b}$ 公尺，河寬 $\overline{{DE}}$ 是幾公尺？',
        x,
        [qty(x, '公尺'), qty(R(b) * c / a, '公尺'), qty(b + x, '公尺'), qty(R(a) * b / c, '公尺')],
        rf'$\triangle ECD\sim\triangle EAB$（AA），$\overline{{AB}}:\overline{{CD}}=\overline{{BE}}:\overline{{DE}}$。設 $\overline{{DE}}=x$：${a}:{c}=({b}+x):x$，${a}x={c}({b}+x)$，$x={tex(x).strip("$")}$。大三角形的底是 $\overline{{BD}}+\overline{{DE}}$。'),
        river_nest_fig(a, c, b, (f'{a} m', f'{c} m', f'{b} m', '?')))


def height_ratio(p, r, ap):
    """AB : DE ＝ p : r，對應高 AP，求 DQ。"""
    dq = R(ap) * r / p
    return with_figure(value(
        rf'如圖，$\triangle ABC\sim\triangle DEF$，$\overline{{AP}}$、$\overline{{DQ}}$ 是對應高。若 $\overline{{AB}}:\overline{{DE}}={p}:{r}$，$\overline{{AP}}={ap}$，則 $\overline{{DQ}}=$？',
        dq,
        [qty(dq), qty(R(ap) * p / r), qty(R(ap) * r * r / (p * p)), qty(ap - (p - r))],
        rf'相似三角形對應高的比＝對應邊的比：$\overline{{AP}}:\overline{{DQ}}={p}:{r}$，${ap}:\overline{{DQ}}={p}:{r}$，$\overline{{DQ}}={tex(dq).strip("$")}$。高的比不用平方。'),
        heights_fig(R(r, p), {'h1': str(ap), 'h2': '?'}))


def side_from_height(p, r, bc):
    """AP : DQ ＝ p : r，BC 已知，求 EF。"""
    ef = R(bc) * r / p
    return with_figure(value(
        rf'如圖，$\triangle ABC\sim\triangle DEF$，$\overline{{AP}}$、$\overline{{DQ}}$ 分別是 $\overline{{BC}}$、$\overline{{EF}}$ 上的高。若 $\overline{{AP}}:\overline{{DQ}}={p}:{r}$，$\overline{{BC}}={bc}$，則 $\overline{{EF}}=$？',
        ef,
        [qty(ef), qty(R(bc) * p / r), qty(R(bc) * r * r / (p * p)), qty(bc + (r - p))],
        rf'對應高的比＝對應邊的比：$\overline{{BC}}:\overline{{EF}}={p}:{r}$，${bc}:\overline{{EF}}={p}:{r}$，$\overline{{EF}}={tex(ef).strip("$")}$。'),
        heights_fig(R(r, p), {'base1': str(bc), 'base2': '?'}))


def lamp(H, h, d):
    H, h = q(H), q(h)
    s = h * d / (H - h)
    return with_figure(value(
        rf'路燈高 ${num(H)}$ 公尺，身高 ${num(h)}$ 公尺的人站在離燈柱 ${d}$ 公尺的地方，他的影長是幾公尺？',
        s,
        [qty(s, '公尺'), qty(h * d / H, '公尺'), qty(d + s, '公尺'), qty(H * d / h, '公尺')],
        rf'人和燈柱都垂直地面，小三角形和大三角形相似（AA）：${num(h)}:{num(H)}=x:({d}+x)$，大三角形的底是「到燈柱的距離＋影長」，解得 $x={tex(s).strip("$")}$ 公尺。'),
        lamp_fig(float(H), float(h), d, (f'{num(H)} m', f'{num(h)} m', f'{d} m', '?')))


def which_ratio_nest(a, c, b):
    x = R(b) * c / (a - c)
    BE = b + x
    return with_figure(statement(
        rf'如圖，$\overline{{AB}}\perp\overline{{BE}}$、$\overline{{CD}}\perp\overline{{BE}}$，$A$、$C$、$E$ 共線。哪一個比例式是正確的？',
        [(r'$\overline{AB}:\overline{CD}=\overline{BE}:\overline{DE}$', R(a) / c, BE / x),
         (r'$\overline{AB}:\overline{CD}=\overline{BD}:\overline{DE}$', R(a) / c, R(b) / x),
         (r'$\overline{AB}:\overline{CD}=\overline{DE}:\overline{BE}$', R(a) / c, x / BE),
         (r'$\overline{AB}:\overline{BE}=\overline{DE}:\overline{CD}$', R(a) / BE, x / c)],
        r'$\triangle EAB\sim\triangle ECD$，對應邊是 $\overline{AB}$ 對 $\overline{CD}$、$\overline{BE}$ 對 $\overline{DE}$（底要用整段 $\overline{BE}$）。'),
        river_nest_fig(a, c, b, ('', '', '', '')))


def which_ratio_cross(m, n, de):
    ab = R(de) * m / n
    return with_figure(statement(
        rf'如圖，$\angle A=\angle D=90^\circ$，$B$、$C$、$E$ 共線。哪一個比例式是正確的？',
        [(r'$\overline{AB}:\overline{DE}=\overline{AC}:\overline{DC}$', ab / de, R(m) / n),
         (r'$\overline{AB}:\overline{DE}=\overline{DC}:\overline{AC}$', ab / de, R(n) / m),
         (r'$\overline{AB}:\overline{DE}=\overline{AD}:\overline{DC}$', ab / de, R(m + n) / n),
         (r'$\overline{AB}:\overline{AC}=\overline{DC}:\overline{DE}$', ab / m, R(n) / de)],
        r'$\triangle ABC\sim\triangle DEC$（兩個直角＋對頂角），$\overline{AB}$ 對 $\overline{DE}$、$\overline{AC}$ 對 $\overline{DC}$。'),
        river_cross_fig(m, n, de, ('', '', '', '')))


def which_ratio_shadow(h, s, S):
    h, s, S = q(h), q(s), q(S)
    H = h * S / s
    return with_figure(statement(
        rf'同一時刻，身高 ${num(h)}$ 公尺的人影長 ${num(s)}$ 公尺，樹影 ${num(S)}$ 公尺。設樹高 $x$ 公尺，哪一個比例式是正確的？',
        [(rf'${num(h)}:{num(s)}=x:{num(S)}$', h / s, H / S),
         (rf'${num(h)}:{num(S)}={num(s)}:x$', h / S, s / H),
         (rf'${num(s)}:{num(h)}=x:{num(S)}$', s / h, H / S),
         (rf'$x:{num(h)}={num(s)}:{num(S)}$', H / h, s / S)],
        rf'高對高、影對影：身高 : 影長 ＝ 樹高 : 樹影。${num(h)}:{num(S)}={num(s)}:x$ 把人的身高和樹的影子配在一起，對應錯了。'),
        shadow_fig(float(h), float(s), float(H), float(S), (f'{num(h)} m', f'{num(s)} m', 'x', f'{num(S)} m')))


SLOTS = [
    slot(1, '相似三角形的對應邊（先備）', [corr_side(6, 4, 9), corr_side(8, 6, 12), corr_side(10, 4, 15)]),
    slot(2, '影子測高', [shadow_height('1.6', '2', '5'), shadow_height('1.5', '1.2', '8'), shadow_height('1.8', '1.2', '6')]),
    slot(3, '影子求影長', [shadow_length('1.5', '2', '9'), shadow_length('1.6', '1.2', '8'), shadow_length('1.8', '2.4', '6')]),
    slot(4, '影子測高（單位換算）', [shadow_units(160, 80, 12), shadow_units(150, 60, 10), shadow_units(180, 120, 15)]),
    slot(5, '測量河寬（對頂角）', [river_cross(20, 5, 2), river_cross(24, 6, 3), river_cross(18, 4, 2)]),
    slot(6, '測量河寬（大三角形套小三角形）', [river_nest(10, 4, 9), river_nest(12, 4, 10), river_nest(9, 3, 8)]),
    slot(7, '對應高的比＝相似比', [height_ratio(5, 3, 10), height_ratio(4, 3, 12), height_ratio(3, 2, 9)]),
    slot(8, '由對應高求邊長', [side_from_height(4, 3, 16), side_from_height(5, 2, 15), side_from_height(3, 4, 9)]),
    slot(9, '列對比例式', [which_ratio_shadow('1.5', '2', '6'), which_ratio_cross(20, 5, 2), which_ratio_nest(10, 4, 9)]),
    slot(10, '路燈下的影子', [lamp('6', '1.5', 9), lamp('4', '1.6', 6), lamp('4.5', '1.5', 10)]),
]

if __name__ == '__main__':
    export('g9-1-4a', '1-4 相似三角形的應用（1）：課後檢核', '九年級 1-4 課本 p.62–65（影子測高、河寬、對應高）＋1-3 相似三角形；題目自編，答案已用 SymPy 核算', SLOTS)
