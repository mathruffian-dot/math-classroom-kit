r"""1-4 相似三角形的應用：魔王戰題庫（三類題目，四選一，全部用 SymPy 核算，幾何題每題附圖）。

用法：python -X utf8 scripts/quiz-src/g9-1-4-raid.py
出現時機：1-4 的最後一堂（1-4(3)）結束後，放在 g9-1-4c 的最後一頁。
範圍：1-4(1)～(3) 全部（影子測高、河寬、對應高、面積比、中點三角形、sin／cos／tan、特殊直角三角形），
以及先備的 1-1 比例式、1-2 平行線截比例線段、1-3 相似三角形（AA）與八年級的畢氏定理、根式。
不用後面章節（圓、三角形的心）。sin／cos／tan 在 1-4(3) 教，整節魔王戰可以用。
三類題目（學生自己選要做哪一類）：
- attack（記憶）：普通攻擊。一步就能算完的基本題（對應邊、對應高、面積比、比值、特殊直角三角形）。
- shield（理解）：防護罩。判斷相似與對應、列對比例式、哪個要平方、找出正確算法、比值不隨大小改變。
- ultimate（應用）：大招。多步驟、綜合、生活應用（影子測高、河寬、路燈、鏡子、標竿、坡道、梯子）。
題庫＝三堂的課後檢核題（依類型分配）＋這裡新增的換數字題與較難的應用題。
題目 ID：課後檢核題位來的、或新題和某個題位同一題型的，用「<課程 id>-<題位 id>-<第幾題>」（新題從 4 開始編）；
和任何題位都對不上的新題用「g9-1-4-new-<類型>-<題型>-<第幾題>」。學習紀錄靠 ID 對到題型。
"""
import importlib.util
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import Rational, sqrt  # noqa: E402

from geom import BLUE, LILAC, PEACH, YELLOW, Fig, lerp, num  # noqa: E402
from quizlib import ROOT, check_item, item_json, raw, statement, value, with_figure  # noqa: E402
from similar import q, qty, sides_fig, tex  # noqa: E402

R = Rational
S = sqrt
HERE = Path(__file__).parent


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), HERE / f'{name}.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


A4, B4, C4 = load('g9-1-4a'), load('g9-1-4b'), load('g9-1-4c')
LESSON_MOD = {'g9-1-4a': A4, 'g9-1-4b': B4, 'g9-1-4c': C4}

# ───────── 三堂的題位依類型分配 ─────────
FROM_LESSONS = {
    'g9-1-4a': {'attack': ['q1', 'q7', 'q8'], 'shield': ['q9'], 'ultimate': ['q2', 'q3', 'q4', 'q5', 'q6', 'q10']},
    'g9-1-4b': {'attack': ['q1', 'q2', 'q3', 'q6', 'q8'], 'shield': ['q9'], 'ultimate': ['q4', 'q5', 'q7', 'q10']},
    'g9-1-4c': {'attack': ['q1', 'q3', 'q6', 'q8', 'q9'], 'shield': ['q2', 'q5'], 'ultimate': ['q4', 'q7', 'q10']},
}


# ───────── 小工具 ─────────
def t(v):
    """數字的 LaTeX（不含 $）。"""
    return tex(v).strip('$')


def ratio_opt(a, b):
    v = R(a) / R(b)
    return raw(f'${a}:{b}$', v)


def fr(v):
    v = R(v)
    return raw(rf'$\dfrac{{{v.p}}}{{{v.q}}}$' if v.q != 1 else f'${v.p}$', v)


def rad_opt(c, n=1, den=1, unit=''):
    """c√n／den 的選項（c、den 整數）。"""
    from quizlib import rad
    tx, v, _ = rad(c, n, den)
    return raw(f'{tx} {unit}'.strip(), v)


# ───────── 附圖 ─────────
def tri_by_angles(f, names, left, right, base, x0, ats=((0, 1), (-1, -0.5), (1, -0.5))):
    """底邊水平的三角形：names＝(頂點, 左下, 右下)，left、right 是兩個底角（度）。"""
    la, ra = math.radians(left), math.radians(right)
    side = base * math.sin(ra) / math.sin(la + ra)  # 左下到頂點
    L = f.pt(names[1], x0, 0, at=ats[1])
    Rt = f.pt(names[2], x0 + base, 0, at=ats[2])
    T = f.pt(names[0], x0 + side * math.cos(la), side * math.sin(la), at=ats[0])
    return T, L, Rt


def aa_fig(t1, t2, show1, show2, k=0.9):
    """兩個三角形，標出已知的角。t1、t2＝(頂點, 左下, 右下, 左下角, 右下角)；show＝{點名: 角度}。"""
    f = Fig(460, 230)
    T1, L1, R1 = tri_by_angles(f, t1[:3], t1[3], t1[4], 5.0, 0)
    pos1 = {T1.name: (T1, L1, R1), L1.name: (L1, R1, T1), R1.name: (R1, T1, L1)}
    T2, L2, R2 = tri_by_angles(f, t2[:3], t2[3], t2[4], 5.0 * k, 5.0 + 2.6 + max(0, (T1.x - 5)) * 0.6)
    pos2 = {T2.name: (T2, L2, R2), L2.name: (L2, R2, T2), R2.name: (R2, T2, L2)}
    f.poly([T1, L1, R1], fill=PEACH)
    f.poly([T2, L2, R2], fill=BLUE)
    for show, pos in ((show1, pos1), (show2, pos2)):
        for nm, deg in show.items():
            v, a, b = pos[nm]
            f.arc(v, a, b, f'{deg}°', r=20 if deg >= 45 else 26)
    return f.svg()


def par_fig(m, n, labels):
    """△ABC 中 DE∥BC，AD：DB＝m：n。labels 的鍵：AD、DB、AE、EC、DE、BC。"""
    f = Fig(420, 240)
    A = f.pt('A', 2.2, 4.0, at=(0, 1))
    B = f.pt('B', 0, 0, at=(-1, -0.4))
    C = f.pt('C', 6.0, 0, at=(1, -0.4))
    tt = m / (m + n)
    d, e = lerp(A, B, tt), lerp(A, C, tt)
    D, E = f.pt('D', d.x, d.y, at=(-1, 0.2)), f.pt('E', e.x, e.y, at=(1, 0.2))
    f.poly([A, B, C], fill=PEACH)
    f.poly([A, D, E], fill=BLUE)
    where = {'AD': (A, D, C), 'DB': (D, B, C), 'AE': (A, E, B), 'EC': (E, C, B), 'DE': (D, E, A), 'BC': (B, C, A)}
    for k, text in labels.items():
        u, v, away = where[k]
        f.side(u, v, text, away=away)
    return f.svg()


def pair_right_fig(ac, bc, k, lab1, lab2):
    """直角 △ABC（∠C＝90°）和放大 k 倍的直角 △PQR（∠R＝90°，P 對應 A）。"""
    f = Fig(460, 230)
    A = f.pt('A', 0, 0, at=(-1, -0.3))
    C = f.pt('C', ac, 0, at=(1, -0.3))
    B = f.pt('B', ac, bc, at=(0.6, 0.8))
    off = ac + 1.2 + 0.25 * max(ac, ac * k)
    P = f.pt('P', off, 0, at=(-1, -0.3))
    Rr = f.pt('R', off + ac * k, 0, at=(1, -0.3))
    Q = f.pt('Q', off + ac * k, bc * k, at=(0.6, 0.8))
    f.poly([A, B, C], fill=PEACH)
    f.poly([P, Q, Rr], fill=YELLOW)
    f.right(C, A, B)
    f.right(Rr, P, Q)
    for (u, v, away), key in (((A, B, C), 'AB'), ((B, C, A), 'BC'), ((A, C, B), 'AC')):
        if lab1.get(key):
            f.side(u, v, lab1[key], away=away)
    for (u, v, away), key in (((P, Q, Rr), 'PQ'), ((Q, Rr, P), 'QR'), ((P, Rr, Q), 'PR')):
        if lab2.get(key):
            f.side(u, v, lab2[key], away=away)
    return f.svg()


def nested_mid_fig(labels=None, inner=None, outer=None):
    """△ABC → 三邊中點 △DEF → 再取中點 △GHI。"""
    f = Fig(440, 260)
    (ax, ay), (bx, by), (cx, cy) = B4.tri_from_sides(8, 7, 9)
    A, B, C = f.pt('A', ax, ay, at=(0, 1)), f.pt('B', bx, by, at=(-1, -0.4)), f.pt('C', cx, cy, at=(1, -0.4))
    D = f.pt('D', (bx + cx) / 2, (by + cy) / 2, at=(0, -1))
    E = f.pt('E', (cx + ax) / 2, (cy + ay) / 2, at=(1, 0.5))
    F = f.pt('F', (ax + bx) / 2, (ay + by) / 2, at=(-1, 0.5))
    G = f.pt('G', (E.x + F.x) / 2, (E.y + F.y) / 2, at=(0, 1))
    H = f.pt('H', (F.x + D.x) / 2, (F.y + D.y) / 2, at=(-1, -0.6))
    Ii = f.pt('I', (D.x + E.x) / 2, (D.y + E.y) / 2, at=(1, -0.6))
    f.poly([A, B, C], fill=PEACH)
    f.poly([D, E, F], fill=BLUE)
    f.poly([G, H, Ii], fill=YELLOW)
    if inner:
        f.text((G.x + H.x + Ii.x) / 3, (G.y + H.y + Ii.y) / 3 - 0.05, inner, 13, color='#1d3f8a')
    if outer:
        f.pt('', cx + 0.4 * 9, ay, False)
        f.text(cx + 0.4 * 9, ay, outer, 14, color='#8a2f0b', anchor='end')
    return f.svg()


def equi_fig(side_lab=None, h_lab=None, base_lab=None, area=None):
    """正三角形 ABC，高 AH（H 是 BC 的中點）。"""
    f = Fig(420, 250)
    B = f.pt('B', 0, 0, at=(-1, -0.4))
    C = f.pt('C', 6, 0, at=(1, -0.4))
    A = f.pt('A', 3, 3 * math.sqrt(3), at=(0, 1))
    Hh = f.pt('H', 3, 0, at=(0, -1))
    f.poly([A, B, C], fill=LILAC)
    f.seg(A, Hh, dash=area is not None)
    f.right(Hh, A, C)
    f.ticks(A, B, 1)
    f.ticks(A, C, 1)
    if not base_lab:
        f.ticks(B, C, 1)
    if side_lab:
        f.side(A, B, side_lab, away=C)
    if h_lab:
        f.side(A, Hh, h_lab, away=B, offset=12, t=0.68)
    if base_lab:
        f.side(B, C, base_lab, away=A)
    if area:
        f.text(4.0, 1.2, area, 15, color='#8a2f0b')
    return f.svg()


def mirror_fig(h, a, b, labels):
    """鏡子平放在地上：眼睛（高 h）—鏡子—樹頂，人到鏡子 a、鏡子到樹 b。"""
    H = h * b / a
    f = Fig(460, 250)
    P0 = f.pt('', 0, 0, False)
    Eye = f.pt('', 0, h, False)
    M = f.pt('', a, 0, False)
    T0 = f.pt('', a + b, 0, False)
    Top = f.pt('', a + b, H, False)
    f.pt('', -(a + b) * 0.12, 0, False)
    f.ground(-0.2, a + b + 0.3)
    f.person(P0, h)
    f.tree(T0, H)
    f.seg(Eye, M, dash=True, color='#c98a12')
    f.seg(M, Top, dash=True, color='#c98a12')
    f.seg(f.pt('', a - 0.25, 0, False), f.pt('', a + 0.25, 0, False), width=5, color='#5b9bd5')
    f.right(P0, Eye, M, 7)
    f.right(T0, Top, M, 7)
    f.dim(Eye, P0, labels[0], away=M, off=10, clear=h * 0.16)
    f.side(P0, M, labels[1], away=Eye, offset=16)
    f.side(M, T0, labels[2], away=Top, offset=16)
    f.dim(Top, T0, labels[3], away=M, off=8, clear=H * 0.22)
    f.side(f.pt('', a - 0.01, 0, False), f.pt('', a + 0.01, 0, False), '鏡子', away=Eye, offset=36, color='#2f6f9f')
    return f.svg()


def stick_fig(e, st, d1, d2, labels):
    """標竿測高：眼睛（高 e）、標竿頂（高 st，距離 d1）、樹頂在同一直線上，標竿到樹 d2。"""
    H = e + (st - e) * (d1 + d2) / d1
    f = Fig(460, 250)
    P0 = f.pt('', 0, 0, False)
    Eye = f.pt('', 0, e, False)
    S0, St = f.pt('', d1, 0, False), f.pt('', d1, st, False)
    T0, Top = f.pt('', d1 + d2, 0, False), f.pt('', d1 + d2, H, False)
    f.pt('', -(d1 + d2) * 0.13, 0, False)
    f.ground(-0.2, d1 + d2 + 0.4)
    f.person(P0, e)
    f.tree(T0, H)
    f.seg(S0, St, width=3.5, color='#8a5a33')
    f.seg(Eye, Top, dash=True, color='#c98a12')
    f.seg(Eye, f.pt('', d1 + d2, e, False), dash=True, color='#9a9a9a', width=1.1)
    f.right(S0, St, P0, 7)
    f.right(T0, Top, P0, 7)
    f.dim(Eye, P0, labels[0], away=S0, off=10, clear=e * 0.16)
    f.side(St, S0, labels[1], away=P0, offset=10, t=0.2)
    f.side(P0, S0, labels[2], away=Eye, offset=16)
    f.side(S0, T0, labels[3], away=Eye, offset=16)
    f.dim(Top, T0, labels[4], away=S0, off=8, clear=H * 0.22)
    return f.svg()


def wall_fig(L, w, H, labels):
    """樹的影子一部分落在牆上：樹到牆 L，牆上影子高 w。"""
    f = Fig(460, 250)
    T0, Top = f.pt('', 0, 0, False), f.pt('', 0, H, False)
    W0, Ws = f.pt('', L, 0, False), f.pt('', L, w, False)
    Wt = f.pt('', L, max(H * 0.85, w * 1.6), False)
    f.pt('', -L * 0.25, 0, False)
    f.pt('', L * 1.25, 0, False)
    f.ground(-0.3, L + L * 0.18)
    f.tree(T0, H)
    f.poly([W0, Wt, f.pt('', L + L * 0.08, Wt.y, False), f.pt('', L + L * 0.08, 0, False)], fill='#d9d2c5')
    f.seg(Top, Ws, dash=True, color='#c98a12')
    f.seg(T0, W0, width=4, color='#555')
    f.seg(W0, Ws, width=4, color='#555')
    f.right(T0, Top, W0, 7)
    f.dim(Top, T0, labels[0], away=W0, off=8, clear=H * 0.22)
    f.side(T0, W0, labels[1], away=Top, offset=14)
    f.text(L * 1.11, w / 2, labels[2], 15, anchor='start')
    f.text(L + L * 0.04, Wt.y + 0.05 * H, '牆', 13, color='#6d6455')
    return f.svg()


def pyramid_fig(b, e, H, labels):
    """金字塔（底邊 b、高 H）的影子比底邊多出 e；頂點到影子尖端是陽光。"""
    f = Fig(460, 240)
    L, Rr = f.pt('', 0, 0, False), f.pt('', b, 0, False)
    Top, M = f.pt('', b / 2, H, False), f.pt('', b / 2, 0, False)
    Tip = f.pt('', b + e, 0, False)
    f.ground(-b * 0.05, b + e + b * 0.06)
    f.poly([L, Top, Rr], fill=YELLOW)
    f.seg(Top, M, dash=True)
    f.seg(Top, Tip, dash=True, color='#c98a12')
    f.seg(Rr, Tip, width=4, color='#555')
    f.right(M, Top, Rr, 8)
    f.side(L, Rr, labels[0], away=Top, offset=16)
    f.side(Rr, Tip, labels[1], away=Top, offset=16)
    f.side(Top, M, labels[2], away=L, offset=10)
    return f.svg()


def sight_fig(e, d, H, deg, labels):
    """眼睛高 e，離樹 d，看樹頂的視線和水平線夾 deg 度。"""
    f = Fig(460, 250)
    P0, Eye = f.pt('', 0, 0, False), f.pt('', 0, e, False)
    T0, Top = f.pt('', d, 0, False), f.pt('', d, H, False)
    Hz = f.pt('', d, e, False)
    f.pt('', -d * 0.2, 0, False)
    f.ground(-0.2, d + d * 0.12)
    f.person(P0, e)
    f.tree(T0, H)
    f.seg(Eye, Hz, dash=True, color='#9a9a9a', width=1.2)
    f.seg(Eye, Top, dash=True, color='#c98a12')
    f.right(Hz, Eye, Top, 7)
    f.arc(Eye, Hz, Top, f'{deg}°', r=30)
    f.dim(Eye, P0, labels[0], away=T0, off=10, clear=e * 0.16)
    f.side(P0, T0, labels[1], away=Eye, offset=14)
    f.dim(Top, T0, labels[2], away=P0, off=8, clear=H * 0.22)
    return f.svg()


# ═════════ 新增：記憶（普通攻擊） ═════════
def proportion(a, b, c, d, pos):
    """比例式求 x（1-1 先備）。pos：x 在第幾項（0～3）。"""
    terms = [a, b, c, d]
    a, b, c, d = (None if v is None else R(v) for v in (a, b, c, d))
    if pos == 0:
        x, wrong = b * c / d, [c * d / b, b * d / c, b + c - d]
    elif pos == 1:
        x, wrong = a * d / c, [c * d / a, a * c / d, a + d - c]
    elif pos == 2:
        x, wrong = a * d / b, [b * d / a, a * b / d, a + d - b]
    else:
        x, wrong = b * c / a, [a * c / b, a * b / c, b + c - a]
    # 錯誤選項：乘錯項、除錯邊、把比看成差
    terms[pos] = 'x'
    p, s = f'{terms[0]}:{terms[1]}', f'{terms[2]}:{terms[3]}'
    return value(rf'若 ${p}={s}$，則 $x=$？', x, [qty(x)] + [qty(w) for w in wrong],
                 rf'外項乘積＝內項乘積：${terms[0]}\times {terms[3]}={terms[1]}\times {terms[2]}$，解得 $x={t(x)}$。')


def par_segment(m, n, ae, ask):
    """DE∥BC，AD＝m、DB＝n。ask＝'EC'：已知 AE 求 EC；ask＝'BC'：已知 DE（＝ae）求 BC。"""
    if ask == 'EC':
        ec = R(ae) * n / m
        return with_figure(value(
            rf'如圖，$\triangle ABC$ 中 $\overline{{DE}}\parallel\overline{{BC}}$，$\overline{{AD}}={m}$、$\overline{{DB}}={n}$、$\overline{{AE}}={ae}$，則 $\overline{{EC}}=$？',
            ec, [qty(ec), qty(R(ae) * m / n), qty(R(ae) * n / (m + n)), qty(ae + n - m if ae + n - m > 0 else ae + n)],
            rf'平行線截比例線段：$\overline{{AD}}:\overline{{DB}}=\overline{{AE}}:\overline{{EC}}$，${m}:{n}={ae}:\overline{{EC}}$，$\overline{{EC}}={t(ec)}$。'),
            par_fig(m, n, {'AD': str(m), 'DB': str(n), 'AE': str(ae), 'EC': '?'}))
    bc = R(ae) * (m + n) / m
    return with_figure(value(
        rf'如圖，$\triangle ABC$ 中 $\overline{{DE}}\parallel\overline{{BC}}$，$\overline{{AD}}={m}$、$\overline{{DB}}={n}$、$\overline{{DE}}={ae}$，則 $\overline{{BC}}=$？',
        bc, [qty(bc), qty(R(ae) * n / m), qty(R(ae) * m / n), qty(R(ae) * (m + n) / n)],
        rf'$\triangle ADE\sim\triangle ABC$（AA），$\overline{{AD}}:\overline{{AB}}=\overline{{DE}}:\overline{{BC}}$，${m}:{m + n}={ae}:\overline{{BC}}$，$\overline{{BC}}={t(bc)}$。要用整段 $\overline{{AB}}$，不是 $\overline{{DB}}$。'),
        par_fig(m, n, {'AD': str(m), 'DB': str(n), 'DE': str(ae), 'BC': '?'}))


def perim_ratio(p, r, P1):
    P2 = R(P1) * r / p
    return with_figure(value(
        rf'如圖，$\triangle ABC\sim\triangle DEF$，相似比是 ${p}:{r}$。若 $\triangle ABC$ 的周長是 ${P1}$，$\triangle DEF$ 的周長是多少？',
        P2, [qty(P2), qty(R(P1) * r * r / (p * p)), qty(R(P1) * p / r), qty(P1 + r - p)],
        rf'周長的比＝相似比（不用平方）：${P1}:x={p}:{r}$，$x={t(P2)}$。'),
        sides_fig(R(r, p), {'area1': f'周長 {P1}', 'area2': '周長 ?'}))


# ═════════ 新增：理解（防護罩） ═════════
def aa_judge(t1, t2, show1, show2, truth, wrongs, k=0.9):
    """依角度判斷相似與對應頂點。t1、t2＝(頂點, 左下, 右下, 左下角, 右下角)。"""
    ang1 = {t1[1]: t1[3], t1[2]: t1[4], t1[0]: 180 - t1[3] - t1[4]}
    ang2 = {t2[1]: t2[3], t2[2]: t2[4], t2[0]: 180 - t2[3] - t2[4]}
    assert len(set(ang1.values())) == 3

    def ok(s):
        if s is None:
            return False  # 「不能判斷」：兩個三角形其實相似
        a, b = s
        return all(ang1[x] == ang2[y] for x, y in zip(a, b))

    opts = [(rf'$\triangle {truth[0]}\sim\triangle {truth[1]}$', ok(truth))]
    for w in wrongs:
        opts.append((rf'$\triangle {w[0]}\sim\triangle {w[1]}$', ok(w)) if isinstance(w, tuple) else (w, False))
    s1 = '、'.join(rf'$\angle {k}={v}^\circ$' for k, v in show1.items())
    s2 = '、'.join(rf'$\angle {k}={v}^\circ$' for k, v in show2.items())
    miss1 = [k for k in ang1 if k not in show1][0]
    miss2 = [k for k in ang2 if k not in show2][0]
    pairs = '、'.join(rf'$\angle {x}=\angle {y}$' for x, y in zip(truth[0], truth[1]))
    return with_figure(statement(
        rf'如圖，{s1}；{s2}。下列哪一個正確？', opts,
        rf'先算第三個角：$\angle {miss1}={ang1[miss1]}^\circ$、$\angle {miss2}={ang2[miss2]}^\circ$。相等的角對在一起：{pairs}，所以 $\triangle {truth[0]}\sim\triangle {truth[1]}$（AA），寫的時候對應頂點要照順序。'),
        aa_fig(t1, t2, show1, show2, k))


def par_which(m, n, kind):
    """DE∥BC，哪一個比例式正確（用座標算出每一段的真實長度核對）。"""
    A, B, C = (R(11, 5), R(4)), (R(0), R(0)), (R(6), R(0))
    tt = R(m, m + n)
    D = (A[0] + (B[0] - A[0]) * tt, A[1] + (B[1] - A[1]) * tt)
    E = (A[0] + (C[0] - A[0]) * tt, A[1] + (C[1] - A[1]) * tt)
    dist = lambda p, r: S((p[0] - r[0]) ** 2 + (p[1] - r[1]) ** 2)  # noqa: E731
    seg = {'AD': dist(A, D), 'DB': dist(D, B), 'AB': dist(A, B), 'AE': dist(A, E), 'EC': dist(E, C), 'AC': dist(A, C), 'DE': dist(D, E), 'BC': dist(B, C)}

    def st(a, b, c, d):
        return (rf'$\overline{{{a}}}:\overline{{{b}}}=\overline{{{c}}}:\overline{{{d}}}$', seg[a] / seg[b], seg[c] / seg[d])

    sets = {
        1: ([st('AD', 'AB', 'DE', 'BC'), st('AD', 'DB', 'DE', 'BC'), st('AB', 'AD', 'DE', 'BC'), st('AE', 'EC', 'DE', 'BC')],
            r'$\triangle ADE\sim\triangle ABC$，$\overline{DE}$ 要和整段 $\overline{AB}$、$\overline{AC}$ 比：$\overline{AD}:\overline{AB}=\overline{DE}:\overline{BC}$。$\overline{AD}:\overline{DB}$ 是上下兩段的比，不能拿來配 $\overline{DE}:\overline{BC}$。'),
        2: ([st('AE', 'AC', 'DE', 'BC'), st('AE', 'EC', 'DE', 'BC'), st('DB', 'AB', 'DE', 'BC'), st('AD', 'AE', 'DE', 'BC')],
            r'$\triangle ADE\sim\triangle ABC$：$\overline{AE}$ 對 $\overline{AC}$、$\overline{DE}$ 對 $\overline{BC}$，所以 $\overline{AE}:\overline{AC}=\overline{DE}:\overline{BC}$。'),
        3: ([st('AD', 'DB', 'AE', 'EC'), st('AD', 'DB', 'DE', 'BC'), st('AD', 'AB', 'AE', 'EC'), st('DB', 'AB', 'AE', 'AC')],
            r'平行線截比例線段：$\overline{AD}:\overline{DB}=\overline{AE}:\overline{EC}$（兩邊都是「上段：下段」）。但 $\overline{DE}:\overline{BC}$ 要配整段的比。'),
        4: ([st('DE', 'BC', 'AD', 'AB'), st('DE', 'BC', 'AD', 'DB'), st('DE', 'BC', 'DB', 'AB'), st('DE', 'DB', 'BC', 'AB')],
            r'$\overline{DE}:\overline{BC}$ 是相似比，等於 $\overline{AD}:\overline{AB}$（小三角形的邊：大三角形的邊）。'),
    }
    opts, why = sets[kind]
    return with_figure(statement(rf'如圖，$\triangle ABC$ 中 $\overline{{DE}}\parallel\overline{{BC}}$，$\overline{{AD}}:\overline{{DB}}={m}:{n}$。下列哪一個比例式正確？', opts, why),
                       par_fig(m, n, {}))


def which_calc_shadow(h, s, Sh):
    h, s, Sh = q(h), q(s), q(Sh)
    H = h * Sh / s
    opts = [(rf'${num(h)}\times{num(Sh)}\div{num(s)}$', h * Sh / s, H),
            (rf'${num(s)}\times{num(Sh)}\div{num(h)}$', s * Sh / h, H),
            (rf'${num(h)}\times{num(s)}\div{num(Sh)}$', h * s / Sh, H),
            (rf'${num(Sh)}-{num(s)}+{num(h)}$', Sh - s + h, H)]
    return with_figure(statement(
        rf'同一時刻，身高 ${num(h)}$ 公尺的人影長 ${num(s)}$ 公尺，樹影長 ${num(Sh)}$ 公尺。哪一個算式可以算出樹高？', opts,
        rf'身高 : 影長 ＝ 樹高 : 樹影，${num(h)}:{num(s)}=x:{num(Sh)}$，$x={num(h)}\times{num(Sh)}\div{num(s)}={t(H)}$ 公尺。比例是乘除的關係，不能用加減。'),
        A4.shadow_fig(float(h), float(s), float(H), float(Sh), (f'{num(h)} m', f'{num(s)} m', '?', f'{num(Sh)} m')))


def which_eq_lamp(H, h, d):
    H, h, dd = q(H), q(h), q(d)
    x = h * dd / (H - h)
    d = num(dd)
    opts = [(rf'${num(h)}:{num(H)}=x:({d}+x)$', h / H, x / (dd + x)),
            (rf'${num(h)}:{num(H)}=x:{d}$', h / H, x / dd),
            (rf'${num(h)}:{num(H)}={d}:x$', h / H, dd / x),
            (rf'${num(h)}:x=({d}+x):{num(H)}$', h / x, (dd + x) / H)]
    return with_figure(statement(
        rf'路燈高 ${num(H)}$ 公尺，身高 ${num(h)}$ 公尺的人站在離燈柱 ${d}$ 公尺處，影長 $x$ 公尺。哪一個比例式是正確的？', opts,
        rf'人和燈柱都垂直地面，影子尖端的角共用，小三角形～大三角形（AA）。大三角形的底是「${d}+x$」：${num(h)}:{num(H)}=x:({d}+x)$，解得 $x={t(x)}$。'),
        A4.lamp_fig(float(H), float(h), dd, (f'{num(H)} m', f'{num(h)} m', f'{d} m', 'x')))


def which_calc_area(p, r, a):
    want = R(a) * r * r / (p * p)
    opts = [(rf'${a}\times\left(\dfrac{{{r}}}{{{p}}}\right)^2$', R(a) * r * r / (p * p), want),
            (rf'${a}\times\dfrac{{{r}}}{{{p}}}$', R(a) * r / p, want),
            (rf'${a}\times\left(\dfrac{{{p}}}{{{r}}}\right)^2$', R(a) * p * p / (r * r), want),
            (rf'${a}+{r * r - p * p}$' if r > p else rf'${a}-{p * p - r * r}$', a + r * r - p * p, want)]
    return with_figure(statement(
        rf'$\triangle ABC\sim\triangle DEF$，相似比是 ${p}:{r}$，$\triangle ABC$ 的面積是 ${a}$。哪一個算式可以算出 $\triangle DEF$ 的面積？', opts,
        rf'面積比＝相似比的平方＝${p * p}:{r * r}$，所以 $\triangle DEF$ 面積＝${a}\times\left(\dfrac{{{r}}}{{{p}}}\right)^2={t(want)}$。只乘 $\dfrac{{{r}}}{{{p}}}$ 是忘了平方。'),
        sides_fig(R(r, p), {'area1': str(a), 'area2': '?'}))


def scaled_ratio(bc, ac, ab, k, which):
    """放大（縮小）後 sin、cos、tan 不變。"""
    k = R(k)
    sin, cos, tan = R(bc, ab), R(ac, ab), R(bc, ac)
    want = {'sin': sin, 'cos': cos, 'tan': tan}[which]
    other = {'sin': cos, 'cos': sin, 'tan': 1 / tan}[which]
    name = {'sin': r'\sin P', 'cos': r'\cos P', 'tan': r'\tan P'}[which]
    word = '放大成 ' + t(k) + ' 倍' if k > 1 else '縮小成 ' + rf'$\dfrac{{{k.p}}}{{{k.q}}}$' + ' 倍'
    wrong = [want * k, want / k, other]
    return with_figure(value(
        rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$，$\overline{{BC}}={bc}$、$\overline{{AC}}={ac}$、$\overline{{AB}}={ab}$。把三邊都{word}，得到直角 $\triangle PQR$（$\angle R=90^\circ$，$\angle P$ 對應 $\angle A$），${name}=$？',
        want, [fr(want)] + [fr(w) for w in wrong],
        rf'$\triangle PQR\sim\triangle ABC$，$\angle P=\angle A$。三邊同時乘 ${t(k)}$，比值不變：${name}={name.replace("P", "A")}={fr(want)[0].strip("$")}$。sin、cos、tan 只和角度有關，和三角形大小無關。'),
        pair_right_fig(ac, bc, float(k), {'AB': str(ab), 'BC': str(bc), 'AC': str(ac)},
                       {'PQ': t(ab * k), 'QR': t(bc * k), 'PR': t(ac * k)}))


def compare_trig(bc, ac, ab, stmts):
    """stmts：[(LaTeX, 真假)…]，真假由這組邊長算出；必須剛好一個為真（放第一個）。"""
    return with_figure(statement(
        rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$，$\overline{{BC}}={bc}$、$\overline{{AC}}={ac}$、$\overline{{AB}}={ab}$。下列哪一個敘述正確？', stmts,
        rf'$\sin A=\dfrac{{{bc}}}{{{ab}}}$、$\cos A=\dfrac{{{ac}}}{{{ab}}}$、$\tan A=\dfrac{{{bc}}}{{{ac}}}$；$\sin B=\dfrac{{{ac}}}{{{ab}}}$、$\cos B=\dfrac{{{bc}}}{{{ab}}}$。斜邊最長，所以 sin、cos 都小於 $1$；tan 可以大於 $1$。'),
        C4.right_fig(ac, bc, {'AB': str(ab), 'BC': str(bc), 'AC': str(ac)}))


def area_to_ratio(A1, A2, ask):
    from math import gcd, isqrt
    g2 = gcd(A1, A2)
    p, r = isqrt(A1 // g2), isqrt(A2 // g2)
    assert p * p == A1 // g2 and r * r == A2 // g2, '面積比化簡後要是兩個平方數'
    word = {'perimeter': '周長的比', 'height': '對應高的比', 'side': '對應邊 $\\overline{BC}:\\overline{EF}$'}[ask]
    return with_figure(value(
        rf'如圖，$\triangle ABC\sim\triangle DEF$，面積分別是 ${A1}$ 和 ${A2}$。{word}＝？',
        R(p, r), [ratio_opt(p, r), ratio_opt(A1 // g2, A2 // g2), ratio_opt(r, p), ratio_opt(p * p * p, r * r * r) if A1 // g2 != p ** 3 else ratio_opt(2 * p, 2 * r + 1)],
        rf'面積比 ${A1}:{A2}={A1 // g2}:{A2 // g2}={p}^2:{r}^2$，開平方得相似比 ${p}:{r}$。{word.replace("＝", "")}都等於相似比，不用平方。'),
        sides_fig(float(r) / p, {'area1': str(A1), 'area2': str(A2)}))


def names_more(kind):
    seg = lambda s: rf'$\overline{{{s}}}$'  # noqa: E731
    if kind == 4:
        opts = [(f'$\\angle B$ 的對邊是 {seg("AC")}', True), (f'$\\angle B$ 的對邊是 {seg("BC")}', False),
                (f'$\\angle A$ 的鄰邊是 {seg("AB")}', False), (f'$\\angle A$ 的對邊是 {seg("AC")}', False)]
        why = r'$\angle B$ 對著的是 $\overline{AC}$；$\angle A$ 的對邊是 $\overline{BC}$、鄰邊是 $\overline{AC}$；斜邊 $\overline{AB}$ 不叫鄰邊。'
        ang = {'B': ''}
    elif kind == 5:
        opts = [(f'$\\angle A$ 的鄰邊是 {seg("AC")}', True), (f'$\\angle A$ 的鄰邊是 {seg("BC")}', False),
                (f'$\\angle B$ 的鄰邊是 {seg("AC")}', False), (f'$\\angle C$ 的對邊是 {seg("BC")}', False)]
        why = r'鄰邊是夾著這個角的「股」：$\angle A$ 的鄰邊 $\overline{AC}$、$\angle B$ 的鄰邊 $\overline{BC}$；直角 $\angle C$ 的對邊是斜邊 $\overline{AB}$。'
        ang = {'A': ''}
    else:
        opts = [(f'$\\angle A$ 的對邊和 $\\angle B$ 的鄰邊是同一邊 {seg("BC")}', True),
                (f'$\\angle A$ 的對邊和 $\\angle B$ 的對邊是同一邊 {seg("BC")}', False),
                (f'$\\angle A$ 的鄰邊和 $\\angle B$ 的鄰邊是同一邊 {seg("AC")}', False),
                (f'$\\angle A$ 的鄰邊是斜邊 {seg("AB")}', False)]
        why = r'$\overline{BC}$ 對著 $\angle A$（$\angle A$ 的對邊），又夾著 $\angle B$（$\angle B$ 的鄰邊）。所以 $\sin A=\cos B$。'
        ang = {'A': '', 'B': ''}
    return with_figure(statement(r'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$。下列哪一個正確？', opts, why),
                       C4.right_fig(5, 3.4, None, ang, fill=YELLOW))


def square_or_not_more(p, r, kind):
    """哪個要平方（換數字）。"""
    s, a = R(p, r), R(p * p, r * r)
    if kind == 1:
        opts = [(rf'相似比 ${p}:{r}$，面積比 ${p * p}:{r * r}$', s ** 2, a),
                (rf'相似比 ${p}:{r}$，周長比 ${p * p}:{r * r}$', s, a),
                (rf'相似比 ${p}:{r}$，對應高的比 ${p * p}:{r * r}$', s, a),
                (rf'面積比 ${p * p}:{r * r}$，對應邊的比 ${p * p}:{r * r}$', S(a), a)]
        why = rf'只有面積要平方：面積比 ${p}^2:{r}^2={p * p}:{r * r}$；周長、對應高、對應邊的比都是 ${p}:{r}$。'
    elif kind == 2:
        opts = [(rf'對應高的比 ${p}:{r}$，周長比 ${p}:{r}$', s, s),
                (rf'對應高的比 ${p}:{r}$，面積比 ${p}:{r}$', s ** 2, s),
                (rf'相似比 ${p}:{r}$，面積比 ${2 * p}:{2 * r}$', s ** 2, R(2 * p, 2 * r)),
                (rf'面積比 ${p * p}:{r * r}$，周長比 ${p * p}:{r * r}$', S(a), a)]
        why = rf'對應高的比、周長比都等於相似比 ${p}:{r}$；面積比是 ${p * p}:{r * r}$（平方，不是乘 $2$）。'
    else:
        opts = [(rf'面積比 ${p * p}:{r * r}$，周長比 ${p}:{r}$', S(a), s),
                (rf'面積比 ${p * p}:{r * r}$，周長比 ${p * p}:{r * r}$', S(a), a),
                (rf'周長比 ${p}:{r}$，面積比 ${p}:{r}$', s ** 2, s),
                (rf'相似比 ${p}:{r}$，面積比 ${2 * p}:{2 * r}$', s ** 2, R(2 * p, 2 * r))]
        why = rf'面積比 ${p * p}:{r * r}$ 開平方得相似比 ${p}:{r}$，周長比也是 ${p}:{r}$。'
    return with_figure(statement(r'$\triangle ABC\sim\triangle DEF$，下列哪一個敘述正確？', opts, why),
                       A4.heights_fig(R(r, p), {}, fill=PEACH))


# ═════════ 新增：應用（大招） ═════════
def real_life_more(scene, L, deg, s, c, ask):
    """sin、cos 的生活問題（換數字）。ask：'opp'（垂直高度）或 'adj'（水平距離）。"""
    s, c = q(s), q(c)
    want = L * (s if ask == 'opp' else c)
    other = L * (c if ask == 'opp' else s)
    use = r'\sin' if ask == 'opp' else r'\cos'
    vs = num(s) if ask == 'opp' else num(c)

    def two(x):
        x = R(x)
        return x if (x * 100).q == 1 else R(round(float(x) * 100), 100)
    stems = {
        'ramp': (rf'一條斜坡長 ${L}$ 公尺，和水平地面的夾角是 ${deg}^\circ$，斜坡的垂直高度約幾公尺？', '高度是 $\\angle A$ 的對邊，已知斜邊（坡長）：用 $\\sin$。'),
        'ladder': (rf'長 ${L}$ 公尺的梯子斜靠在牆上，梯子和地面的夾角是 ${deg}^\circ$，梯腳離牆約幾公尺？', '梯腳到牆是 $\\angle A$ 的鄰邊，已知斜邊（梯長）：用 $\\cos$。'),
        'ladder-top': (rf'長 ${L}$ 公尺的梯子斜靠在牆上，梯子和地面的夾角是 ${deg}^\circ$，梯子頂端離地約幾公尺？', '頂端高度是 $\\angle A$ 的對邊，已知斜邊（梯長）：用 $\\sin$。'),
        'kite': (rf'風箏線拉直長 ${L}$ 公尺，和水平地面的夾角是 ${deg}^\circ$，風箏離地約幾公尺？（手的高度不計）', '高度是 $\\angle A$ 的對邊，已知斜邊（線長）：用 $\\sin$。'),
        'slide': (rf'溜滑梯的滑道長 ${L}$ 公尺，和地面的夾角是 ${deg}^\circ$，滑道底端到頂端正下方的水平距離約幾公尺？', '水平距離是 $\\angle A$ 的鄰邊，已知斜邊（滑道）：用 $\\cos$。'),
    }
    stem, how = stems[scene]
    stem += rf'（$\sin {deg}^\circ\approx {num(s)}$、$\cos {deg}^\circ\approx {num(c)}$）'
    dist = [want, other, want * 10, L / (s if ask == 'opp' else c)]
    ac, bc = L * float(c), L * float(s)
    lab = {'AB': f'{L} m', ('BC' if ask == 'opp' else 'AC'): '?'}
    fig_scene = {'ramp': 'ramp', 'ladder': 'ladder', 'ladder-top': 'ladder', 'kite': 'kite', 'slide': 'ramp'}[scene]
    approx = '' if two(want) == want else rf'\approx {t(two(want))}'
    return with_figure(value(stem, two(want), [qty(two(x), '公尺') for x in dist],
                             how + rf'${L}\times{vs}={t(want)}{approx}$ 公尺。（斜邊除以比值是除錯了；選項四捨五入到小數第 2 位）'),
                       C4.right_fig(ac, bc, lab, {'A': f'{deg}°'}, scene=fig_scene))


def special_more(kind, n):
    if kind == 'escalator':
        h = q(n)
        stem = rf'電扶梯的傾斜角是 $30^\circ$，上下樓層的高度差 ${num(h)}$ 公尺，電扶梯的長度是幾公尺？'
        want = 2 * h
        opts = [qty(want, '公尺'), raw(f'${t(h)}\\sqrt{{3}}$ 公尺', h * S(3)), qty(h / 2, '公尺'), raw(f'${t(h)}\\sqrt{{2}}$ 公尺', h * S(2))]
        how = rf'高度差對著 $30^\circ$，是最短邊；斜邊是它的 $2$ 倍：$2\times{num(h)}={t(want)}$ 公尺。'
        fig = C4.right_fig(float(h) * math.sqrt(3), float(h), {'BC': f'{num(h)} m', 'AB': '?'}, {'A': '30°'}, scene='escalator')
    elif kind == 'flag':
        stem = rf'從旗桿頂端 $B$ 拉一條繩子到地面的 $A$ 點，繩子和地面夾 $45^\circ$。旗桿高 ${n}$ 公尺，繩長是幾公尺？'
        want = n * S(2)
        opts = [rad_opt(n, 2, unit='公尺'), rad_opt(n, unit='公尺'), rad_opt(2 * n, unit='公尺'), rad_opt(n, 3, unit='公尺')]
        how = rf'$45^\circ$-$45^\circ$-$90^\circ$，邊長比 $1:1:\sqrt{{2}}$，繩長 ${n}\sqrt{{2}}$ 公尺。'
        fig = C4.right_fig(n, n, {'BC': f'{n} m', 'AB': '?'}, {'A': '45°'}, scene='flag')
    elif kind == 'ladder':
        stem = rf'長 ${n}$ 公尺的梯子斜靠在牆上，梯子和地面的夾角是 $60^\circ$，梯子頂端離地多高？'
        want = R(n, 2) * S(3)
        opts = [rad_opt(n // 2, 3, unit='公尺'), rad_opt(n // 2, unit='公尺'), rad_opt(n, 3, unit='公尺'), rad_opt(n // 2, 2, unit='公尺')]
        how = rf'梯腳到牆對著 $30^\circ$，是 $\dfrac{{{n}}}{{2}}={n // 2}$；頂端高度是 ${n // 2}\sqrt{{3}}$ 公尺（邊長比 $1:\sqrt{{3}}:2$）。'
        fig = C4.right_fig(n / 2, n / 2 * math.sqrt(3), {'AB': f'{n} m', 'BC': '?'}, {'A': '60°'}, scene='ladder')
    else:  # slide：滑道長 n、夾角 30°，頂端高度
        stem = rf'溜滑梯的滑道長 ${n}$ 公尺，和地面的夾角是 $30^\circ$，滑道頂端離地多高？'
        want = R(n, 2)
        opts = [qty(want, '公尺'), rad_opt(n // 2, 3, unit='公尺') if n % 2 == 0 else raw(rf'$\dfrac{{{n}\sqrt{{3}}}}{{2}}$ 公尺', want * S(3)), rad_opt(n, 3, unit='公尺'), qty(2 * n, '公尺')]
        how = rf'頂端高度對著 $30^\circ$，是最短邊，等於斜邊的一半：$\dfrac{{{n}}}{{2}}={t(want)}$ 公尺。'
        fig = C4.right_fig(n / 2 * math.sqrt(3), n / 2, {'AB': f'{n} m', 'BC': '?'}, {'A': '30°'}, scene='ramp')
    return with_figure(value(stem, want, opts, how), fig)


def mirror(h, a, b):
    h, a, b = q(h), q(a), q(b)
    H = h * b / a
    return with_figure(value(
        rf'小明把一面小鏡子平放在地上，退到眼睛剛好從鏡子裡看到樹頂。他的眼睛離地 ${num(h)}$ 公尺，他到鏡子 ${num(a)}$ 公尺，鏡子到樹 ${num(b)}$ 公尺。樹高幾公尺？',
        H, [qty(H, '公尺'), qty(h * a / b, '公尺'), qty(a * b / h, '公尺'), qty(h + b - a, '公尺')],
        rf'光線反射時入射角＝反射角，兩個直角三角形還有一組角相等，相似（AA）。眼高 : 人到鏡子 ＝ 樹高 : 鏡子到樹，${num(h)}:{num(a)}=x:{num(b)}$，$x={t(H)}$ 公尺。'),
        mirror_fig(float(h), float(a), float(b), (f'{num(h)} m', f'{num(a)} m', f'{num(b)} m', '?')))


def stick(e, st, d1, d2):
    e, st, d1, d2 = q(e), q(st), q(d1), q(d2)
    H = e + (st - e) * (d1 + d2) / d1
    return with_figure(value(
        rf'小華眼睛離地 ${num(e)}$ 公尺，在前方 ${num(d1)}$ 公尺處立一根 ${num(st)}$ 公尺高的竹竿，竹竿再往前 ${num(d2)}$ 公尺是一棵樹。他的眼睛、竹竿頂端、樹頂剛好在同一直線上，樹高幾公尺？',
        H, [qty(H, '公尺'), qty((st - e) * (d1 + d2) / d1, '公尺'), qty(st * (d1 + d2) / d1, '公尺'), qty(st * d2 / d1, '公尺')],
        rf'從眼睛畫水平線：小三角形的兩股是 ${num(d1)}$ 和 ${num(st)}-{num(e)}={t(st - e)}$，大三角形的兩股是 ${num(d1)}+{num(d2)}={t(d1 + d2)}$ 和「樹高$-{num(e)}$」，兩者相似（AA）。樹高$-{num(e)}={t(st - e)}\times\dfrac{{{t(d1 + d2)}}}{{{t(d1)}}}={t(H - e)}$，樹高 ${t(H)}$ 公尺。最後別忘了加回眼睛的高度。'),
        stick_fig(float(e), float(st), float(d1), float(d2), (f'{num(e)} m', f'{num(st)} m', f'{num(d1)} m', f'{num(d2)} m', '?')))


def wall(h, s, L, w):
    h, s, L, w = q(h), q(s), q(L), q(w)
    H = w + L * h / s
    return with_figure(value(
        rf'同一時刻，身高 ${num(h)}$ 公尺的人影長 ${num(s)}$ 公尺。一棵樹離牆 ${num(L)}$ 公尺，樹影一部分落在地上（剛好到牆腳），一部分落在牆上，牆上的影子高 ${num(w)}$ 公尺。樹高幾公尺？',
        H, [qty(H, '公尺'), qty(L * h / s, '公尺'), qty((L + w) * h / s, '公尺'), qty(w + L * s / h, '公尺')],
        rf'牆上的影子高 ${num(w)}$ 公尺，就是樹最下面的 ${num(w)}$ 公尺；樹的上面一段（樹高$-{num(w)}$）的影子落在地上 ${num(L)}$ 公尺。${num(h)}:{num(s)}=(x-{num(w)}):{num(L)}$，$x-{num(w)}={t(L * h / s)}$，樹高 ${t(H)}$ 公尺。'),
        wall_fig(float(L), float(w), float(H), ('?', f'{num(L)} m', f'{num(w)} m')))


def pyramid(b, e, h, s):
    b, e, h, s = q(b), q(e), q(h), q(s)
    H = (b / 2 + e) * h / s
    return with_figure(value(
        rf'金字塔的底是正方形，邊長 ${num(b)}$ 公尺。某一時刻，金字塔影子的尖端超出靠影子那一側的底邊 ${num(e)}$ 公尺（如圖，從正中間看過去）；同一時刻，${num(h)}$ 公尺長的竿子影長 ${num(s)}$ 公尺。金字塔高幾公尺？',
        H, [qty(H, '公尺'), qty(e * h / s, '公尺'), qty((b + e) * h / s, '公尺'), qty((b / 2 + e) * s / h, '公尺')],
        rf'金字塔的高在正中間，它的「影長」要從正中間量到影子尖端：$\dfrac{{{num(b)}}}{{2}}+{num(e)}={t(b / 2 + e)}$ 公尺。${num(h)}:{num(s)}=x:{t(b / 2 + e)}$，$x={t(H)}$ 公尺。'),
        pyramid_fig(float(b), float(e), float(H), (f'{num(b)} m', f'{num(e)} m', '?')))


def perim_to_area(P1, P2, a1):
    from math import gcd, sqrt
    g = gcd(P1, P2)
    p, r = P1 // g, P2 // g
    a2 = R(a1) * r * r / (p * p)
    # 幾何條件要能成立：周長 P 的三角形面積最多是正三角形的 P²/(12√3)
    for P, A in ((P1, a1), (P2, a2)):
        assert float(A) < P * P / (12 * sqrt(3)), f'周長 {P} 的三角形面積不可能是 {A}（最多約 {P * P / (12 * sqrt(3)):.2f}）'
    return with_figure(value(
        rf'如圖，$\triangle ABC\sim\triangle DEF$，周長分別是 ${P1}$ 和 ${P2}$。若 $\triangle ABC$ 的面積是 ${a1}$，$\triangle DEF$ 的面積是多少？',
        a2, [qty(a2), qty(R(a1) * r / p), qty(R(a1) * p * p / (r * r)), qty(a1 + P2 - P1)],
        rf'周長比＝相似比＝${P1}:{P2}={p}:{r}$，面積比＝${p * p}:{r * r}$。${a1}:x={p * p}:{r * r}$，$x={t(a2)}$。'),
        sides_fig(R(r, p), {'area1': str(a1), 'area2': '?'}))


def nested_mid(v, ask):
    if ask == 'area':
        want = R(v, 16)
        opts = [qty(want), qty(R(v, 4)), qty(R(v, 8)), qty(R(v, 2))]
        stem = rf'如圖，$D$、$E$、$F$ 是 $\triangle ABC$ 三邊的中點，$G$、$H$、$I$ 又是 $\triangle DEF$ 三邊的中點。若 $\triangle ABC$ 的面積是 ${v}$，$\triangle GHI$ 的面積是多少？'
        how = rf'每取一次中點三角形，面積變成 $\dfrac{{1}}{{4}}$：${v}\times\dfrac{{1}}{{4}}\times\dfrac{{1}}{{4}}={t(want)}$。'
        fig = nested_mid_fig(inner='?', outer=f'△ABC 面積＝{v}')
    else:
        want = R(v, 4)
        opts = [qty(want), qty(R(v, 16)), qty(R(v, 2)), qty(R(v, 8))]
        stem = rf'如圖，$D$、$E$、$F$ 是 $\triangle ABC$ 三邊的中點，$G$、$H$、$I$ 又是 $\triangle DEF$ 三邊的中點。若 $\triangle ABC$ 的周長是 ${v}$，$\triangle GHI$ 的周長是多少？'
        how = rf'每取一次中點三角形，周長變成 $\dfrac{{1}}{{2}}$（周長不用平方）：${v}\times\dfrac{{1}}{{2}}\times\dfrac{{1}}{{2}}={t(want)}$。'
        fig = nested_mid_fig(inner='?', outer=f'△ABC 周長＝{v}')
    return with_figure(value(stem, want, opts, how), fig)


def slope(bc, ac, ab, L):
    """坡道 tan A＝bc/ac，沿坡走 L 公尺，升高多少（要先用畢氏定理求斜邊的比）。"""
    tanA, sinA, cosA = R(bc, ac), R(bc, ab), R(ac, ab)
    want = L * sinA
    return with_figure(value(
        rf'一條坡道的 $\tan A=\dfrac{{{bc}}}{{{ac}}}$（$A$ 是坡道和水平地面的夾角）。沿著坡道往上走 ${L}$ 公尺，升高了幾公尺？',
        want, [qty(want, '公尺'), qty(L * tanA, '公尺'), qty(L * cosA, '公尺'), qty(L / tanA, '公尺')],
        rf'$\tan A=\dfrac{{{bc}}}{{{ac}}}$：可以設對邊 ${bc}k$、鄰邊 ${ac}k$，畢氏定理得斜邊 ${ab}k$，所以 $\sin A=\dfrac{{{bc}}}{{{ab}}}$。走的 ${L}$ 公尺是斜邊，升高＝${L}\times\dfrac{{{bc}}}{{{ab}}}={t(want)}$ 公尺。'),
        C4.right_fig(float(L * cosA), float(L * sinA), {'AB': f'{L} m', 'BC': '?'}, scene='ramp'))


def equilateral(kind, n):
    if kind == 'height':
        want = R(n, 2) * S(3)
        opts = [rad_opt(n // 2, 3), rad_opt(n // 2, 2), rad_opt(n, 3), rad_opt(n // 2)]
        stem = rf'如圖，正三角形 $ABC$ 的邊長是 ${n}$，$\overline{{AH}}$ 是高，$\overline{{AH}}=$？'
        how = rf'$\triangle ABH$ 是 $30^\circ$-$60^\circ$-$90^\circ$（$\angle B=60^\circ$），$\overline{{BH}}={n // 2}$，$\overline{{AH}}=\sqrt{{3}}\times{n // 2}={n // 2}\sqrt{{3}}$。'
        fig = equi_fig(side_lab=str(n), h_lab='?')
    elif kind == 'area':
        want = R(n * n, 4) * S(3)
        k = n * n // 4
        opts = [rad_opt(k, 3), rad_opt(2 * k, 3), rad_opt(k), rad_opt(n * n)]
        stem = rf'如圖，正三角形 $ABC$ 的邊長是 ${n}$，它的面積是多少？'
        how = rf'高 $\overline{{AH}}={n // 2}\sqrt{{3}}$（$30^\circ$-$60^\circ$-$90^\circ$），面積＝$\dfrac{{1}}{{2}}\times{n}\times{n // 2}\sqrt{{3}}={k}\sqrt{{3}}$。'
        fig = equi_fig(side_lab=str(n), area='面積＝?')
    else:  # 已知高 n√3，求邊長 2n
        want = R(2 * n)
        opts = [qty(want), qty(R(n)), rad_opt(2 * n, 3), rad_opt(n, 2)]
        stem = rf'如圖，正三角形 $ABC$ 的高 $\overline{{AH}}={n}\sqrt{{3}}$，邊長 $\overline{{BC}}=$？'
        how = rf'$\overline{{BH}}:\overline{{AH}}:\overline{{AB}}=1:\sqrt{{3}}:2$，$\overline{{BH}}={n}$，邊長 $\overline{{AB}}=\overline{{BC}}={2 * n}$。'
        fig = equi_fig(h_lab=f'{n}√3', base_lab='?')
    return with_figure(value(stem, want, opts, how), fig)


def sight(deg, d, e='1.5'):
    e = q(e)
    rise = {45: R(d), 30: R(d) / S(3), 60: R(d) * S(3)}[deg]
    H = e + rise
    rt = {45: (str(d), R(d)), 30: (rf'{t(R(d, 3))}\sqrt{{3}}', R(d, 3) * S(3)), 60: (rf'{d}\sqrt{{3}}', d * S(3))}[deg]
    if deg == 45:
        opts = [qty(H, '公尺'), qty(R(d), '公尺'), raw(rf'${num(e)}+{d}\sqrt{{2}}$ 公尺', e + d * S(2)), qty(e + R(d, 2), '公尺')]
        how = rf'視線、水平線和樹圍成 $45^\circ$-$45^\circ$-$90^\circ$ 三角形，樹在眼睛以上的部分 ＝ 水平距離 ${d}$ 公尺，樹高 ${num(e)}+{d}={t(H)}$ 公尺。'
    elif deg == 30:
        opts = [raw(rf'${num(e)}+{rt[0]}$ 公尺', H), raw(rf'${rt[0]}$ 公尺', rise), raw(rf'${num(e)}+{d}\sqrt{{3}}$ 公尺', e + d * S(3)), qty(e + R(d, 2), '公尺')]
        how = rf'$30^\circ$-$60^\circ$-$90^\circ$：對 $30^\circ$ 的邊 : 對 $60^\circ$ 的邊 ＝ $1:\sqrt{{3}}$，樹在眼睛以上的部分＝$\dfrac{{{d}}}{{\sqrt{{3}}}}={rt[0]}$，再加眼高 ${num(e)}$。'
    else:
        opts = [raw(rf'${num(e)}+{rt[0]}$ 公尺', H), raw(rf'${rt[0]}$ 公尺', rise), raw(rf'${num(e)}+\dfrac{{{d}\sqrt{{3}}}}{{3}}$ 公尺', e + R(d, 3) * S(3)), qty(e + 2 * d, '公尺')]
        how = rf'$30^\circ$-$60^\circ$-$90^\circ$：水平距離 ${d}$ 對著 $30^\circ$，樹在眼睛以上的部分對著 $60^\circ$，是 ${d}\sqrt{{3}}$，再加眼高 ${num(e)}$。'
    return with_figure(value(
        rf'小安的眼睛離地 ${num(e)}$ 公尺，站在離樹 ${d}$ 公尺的地方，看樹頂的視線和水平線夾 ${deg}^\circ$。樹高幾公尺？',
        H, opts, how),
        sight_fig(float(e), float(d), float(H), deg, (f'{num(e)} m', f'{d} m', '?')))


def special_ratio(deg, which, n):
    """特殊直角三角形：已知角度與一邊，求 sin／cos／tan（要先用邊長比求另外兩邊）。"""
    r3 = S(3)
    n = R(n)
    if deg == 30:  # ∠A＝30°，BC＝n、AC＝n√3、AB＝2n
        bc, ac, ab, give = n, n * r3, 2 * n, ('BC', str(n))
        figsize = (n * math.sqrt(3), n)
    elif deg == 60:  # ∠A＝60°，AC＝n、BC＝n√3、AB＝2n
        bc, ac, ab, give = n * r3, n, 2 * n, ('AC', str(n))
        figsize = (n, n * math.sqrt(3))
    else:
        bc, ac, ab, give = n, n, n * S(2), ('BC', str(n))
        figsize = (n, n)
    vals = {'sin': bc / ab, 'cos': ac / ab, 'tan': bc / ac}
    want = vals[which]
    name = {'sin': r'\sin A', 'cos': r'\cos A', 'tan': r'\tan A'}[which]

    def opt(v):
        from sympy import nsimplify
        v = nsimplify(v)
        table = {R(1, 2): r'\dfrac{1}{2}', r3 / 2: r'\dfrac{\sqrt{3}}{2}', r3: r'\sqrt{3}', r3 / 3: r'\dfrac{\sqrt{3}}{3}',
                 S(2) / 2: r'\dfrac{\sqrt{2}}{2}', R(1): '1', S(2): r'\sqrt{2}', 2 * r3 / 3: r'\dfrac{2\sqrt{3}}{3}', R(2): '2'}
        for k, s in table.items():
            if (v - k).equals(0):
                return raw(f'${s}$', v)
        raise ValueError(v)
    pool = [vals['sin'], vals['cos'], vals['tan'], 1 / vals['tan'], ab / bc, R(2)]
    others = []
    for x in pool:
        if not (x - want).equals(0) and all(not (x - o).equals(0) for o in others):
            others.append(x)
    others = others[:3]
    side_tex = {30: rf'$\overline{{AC}}={n}\sqrt{{3}}$、$\overline{{AB}}={2 * n}$', 60: rf'$\overline{{BC}}={n}\sqrt{{3}}$、$\overline{{AB}}={2 * n}$',
                45: rf'$\overline{{AC}}={n}$、$\overline{{AB}}={n}\sqrt{{2}}$'}[deg]
    rule = {'sin': '對邊／斜邊', 'cos': '鄰邊／斜邊', 'tan': '對邊／鄰邊'}[which]
    return with_figure(value(
        rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$、$\angle A={deg}^\circ$，$\overline{{{give[0]}}}={give[1]}$，${name}=$？',
        want, [opt(want)] + [opt(x) for x in others],
        rf'先用特殊直角三角形的邊長比求另外兩邊：{side_tex}。${name}$＝{rule}，化簡後是 ${opt(want)[0].strip("$")}$（和邊長是多少無關）。'),
        C4.right_fig(figsize[0], figsize[1], {give[0]: give[1]}, {'A': f'{deg}°'}))


# ───────── 新題依類型、題型排好：(ID 前綴, 題型, 題目)；ID 前綴是題位（例如 g9-1-4a-q1）或 None（新題型） ─────────
def slotted(lesson, sid, items):
    return (f'{lesson}-{sid}', None, items)


def fresh(kind, topic, items):
    return (None, (kind, topic), items)


NEW = {
    'attack': [
        slotted('g9-1-4a', 'q1', [A4.corr_side(9, 6, 12), A4.corr_side(6, 9, 10), A4.corr_side(4, 6, 7)]),
        slotted('g9-1-4a', 'q7', [A4.height_ratio(5, 4, 15), A4.height_ratio(2, 3, 8)]),
        slotted('g9-1-4a', 'q8', [A4.side_from_height(3, 2, 12), A4.side_from_height(2, 5, 6)]),
        slotted('g9-1-4b', 'q2', [B4.area_ratio(8, 12), B4.area_ratio(5, 15)]),
        slotted('g9-1-4b', 'q3', [B4.area_from_height(2, 3, 8), B4.area_from_height(3, 4, 27)]),
        slotted('g9-1-4b', 'q6', [B4.mid_area(80), B4.mid_area(100)]),
        slotted('g9-1-4b', 'q8', [B4.mid_perimeter(6, 8, 10), B4.mid_perimeter(9, 10, 11)]),
        slotted('g9-1-4c', 'q1', [C4.pyth(15, 8, 17, 'AB'), C4.pyth(24, 7, 25, 'AC')]),
        slotted('g9-1-4c', 'q3', [C4.ratio3(12, 5, 13, 'sin'), C4.ratio3(20, 21, 29, 'cos'), C4.ratio3(6, 8, 10, 'tan')]),
        slotted('g9-1-4c', 'q6', [C4.from_ratio(15, 20, 25, 'sin'), C4.from_ratio(5, 12, 13, 'cos'), C4.from_ratio(8, 6, 10, 'tan')]),
        slotted('g9-1-4c', 'q8', [C4.iso('AC', 5), C4.iso('AB', 8), C4.iso('BC', 9)]),
        slotted('g9-1-4c', 'q9', [C4.thirty(60, 'AC', 6), C4.thirty(30, 'BC', 7), C4.thirty(30, 'AB', 10)]),
        fresh('attack', '比例式（先備）', [proportion(None, 6, 4, 3, 0), proportion(5, None, 2, 3, 1), proportion(9, 6, None, 4, 2), proportion(3, 5, 12, None, 3)]),
        fresh('attack', '平行線截比例線段（先備）', [par_segment(4, 2, 6, 'EC'), par_segment(3, 6, 4, 'EC'), par_segment(4, 2, 6, 'BC'), par_segment(6, 3, 8, 'BC')]),
        fresh('attack', '相似三角形的周長比', [perim_ratio(3, 5, 24), perim_ratio(4, 3, 36), perim_ratio(2, 7, 18)]),
    ],
    'shield': [
        slotted('g9-1-4a', 'q9', [A4.which_ratio_shadow('1.6', '2', '8'), A4.which_ratio_shadow('1.8', '1.2', '6'), A4.which_ratio_cross(24, 6, 3), A4.which_ratio_nest(12, 4, 10)]),
        slotted('g9-1-4b', 'q9', [square_or_not_more(2, 3, 1), square_or_not_more(5, 4, 2), square_or_not_more(3, 7, 3), square_or_not_more(4, 5, 1)]),
        slotted('g9-1-4c', 'q2', [names_more(4), names_more(5), names_more(6)]),
        slotted('g9-1-4c', 'q5', [C4.angle_b(12, 5, 13, 'sin'), C4.angle_b(7, 24, 25, 'cos'), C4.angle_b(20, 21, 29, 'tan')]),
        fresh('shield', '判斷相似與對應頂點（先備）', [
            aa_judge(('A', 'B', 'C', 70, 60), ('D', 'E', 'F', 70, 60), {'A': 50, 'B': 70}, {'D': 50, 'F': 60},
                     ('ABC', 'DEF'), [('ABC', 'DFE'), ('ABC', 'EDF'), '只知道一組角相等，不能判斷相似']),
            aa_judge(('A', 'B', 'C', 80, 60), ('D', 'E', 'F', 40, 80), {'A': 40, 'B': 80}, {'D': 60, 'E': 40},
                     ('ABC', 'EFD'), [('ABC', 'DEF'), ('ABC', 'EDF'), ('ABC', 'FED')], k=1.1),
            aa_judge(('A', 'B', 'C', 50, 100), ('E', 'F', 'D', 30, 100), {'A': 30, 'C': 100}, {'E': 50, 'F': 30},
                     ('ABC', 'FED'), [('ABC', 'DEF'), ('ABC', 'FDE'), ('ABC', 'EFD')], k=1.1),
            aa_judge(('A', 'B', 'C', 65, 45), ('D', 'E', 'F', 45, 65), {'B': 65, 'C': 45}, {'D': 70, 'E': 45},
                     ('ABC', 'DFE'), [('ABC', 'DEF'), ('ABC', 'EDF'), '兩個三角形不相似']),
        ]),
        fresh('shield', '平行線的比例式：哪一個正確', [par_which(2, 1, 1), par_which(3, 2, 2), par_which(1, 2, 3), par_which(3, 1, 4)]),
        fresh('shield', '找出正確算法：影子與路燈', [which_calc_shadow('1.6', '2', '7.5'), which_calc_shadow('1.5', '1.2', '6'),
                                       which_eq_lamp('6', '1.5', 9), which_eq_lamp('5', '1.6', 8.5)]),
        fresh('shield', '找出正確算法：面積', [which_calc_area(2, 3, 8), which_calc_area(3, 5, 18), which_calc_area(4, 3, 32)]),
        fresh('shield', '放大縮小後比值不變', [scaled_ratio(3, 4, 5, 2, 'sin'), scaled_ratio(5, 12, 13, 3, 'cos'), scaled_ratio(8, 6, 10, R(1, 2), 'tan')]),
        fresh('shield', 'sin、cos、tan 的判斷', [
            compare_trig(5, 12, 13, [(r'$\sin A<\tan A$', R(5, 13) < R(5, 12)), (r'$\sin A>\cos A$', R(5, 13) > R(12, 13)), (r'$\tan A>1$', R(5, 12) > 1), (r'$\sin A=\sin B$', R(5, 13) == R(12, 13))]),
            compare_trig(8, 6, 10, [(r'$\sin A=\cos B$', R(8, 10) == R(8, 10)), (r'$\tan A<1$', R(8, 6) < 1), (r'$\cos A>\sin A$', R(6, 10) > R(8, 10)), (r'$\sin B>1$', R(6, 10) > 1)]),
            compare_trig(15, 8, 17, [(r'$\tan A>1$', R(15, 8) > 1), (r'$\sin A>1$', R(15, 17) > 1), (r'$\cos A=\cos B$', R(8, 17) == R(15, 17)), (r'$\tan A=\tan B$', R(15, 8) == R(8, 15))]),
        ]),
        fresh('shield', '由面積比求相似比', [area_to_ratio(18, 50, 'perimeter'), area_to_ratio(12, 27, 'height'), area_to_ratio(32, 8, 'side')]),
    ],
    'ultimate': [
        slotted('g9-1-4a', 'q2', [A4.shadow_height('1.6', '0.8', '7.5'), A4.shadow_height('1.5', '2', '10')]),
        slotted('g9-1-4a', 'q3', [A4.shadow_length('1.5', '1.8', '10'), A4.shadow_length('1.6', '2', '12')]),
        slotted('g9-1-4a', 'q4', [A4.shadow_units(160, 120, 18), A4.shadow_units(150, 100, 20)]),
        slotted('g9-1-4a', 'q5', [A4.river_cross(30, 6, 4), A4.river_cross(15, 3, 2)]),
        slotted('g9-1-4a', 'q6', [A4.river_nest(8, 2, 9), A4.river_nest(15, 5, 12)]),
        slotted('g9-1-4a', 'q10', [A4.lamp('5', '1.5', 7), A4.lamp('4.8', '1.6', 8)]),
        slotted('g9-1-4b', 'q4', [B4.side_from_area(25, 64, 10), B4.side_from_area(9, 16, 12)]),
        slotted('g9-1-4b', 'q5', [B4.ex4p(16, 30), B4.ex4p(24, 7)]),
        slotted('g9-1-4b', 'q7', [B4.mid_back(9, 12, 'perimeter'), B4.mid_back(8, 15, 'area')]),
        slotted('g9-1-4b', 'q10', [B4.parallel_area(1, 2, 3), B4.parallel_area(2, 3, 12), B4.parallel_area(3, 1, 9)]),
        slotted('g9-1-4c', 'q4', [C4.pyth_then(5, 12, 13, ('BC', 'AC'), 'cos'), C4.pyth_then(12, 9, 15, ('BC', 'AB'), 'sin'), C4.pyth_then(24, 7, 25, ('AC', 'AB'), 'tan')]),
        slotted('g9-1-4c', 'q7', [real_life_more('ramp', 150, 15, '0.2588', '0.9659', 'opp'), real_life_more('ladder', 8, 65, '0.9063', '0.4226', 'adj'),
                                  real_life_more('kite', 80, 35, '0.5736', '0.8192', 'opp'), real_life_more('ladder-top', 6, 75, '0.9659', '0.2588', 'opp'),
                                  real_life_more('slide', 5, 25, '0.4226', '0.9063', 'adj')]),
        slotted('g9-1-4c', 'q10', [special_more('escalator', '6'), special_more('flag', 9), special_more('ladder', 10), special_more('slide', 4)]),
        fresh('ultimate', '鏡子測高', [mirror('1.5', '2', '10'), mirror('1.6', '1.2', '6'), mirror('1.5', '2.5', '12')]),
        fresh('ultimate', '竹竿測高（要加眼高）', [stick('1.5', '3', '2', '8'), stick('1.6', '2.4', '1.5', '6')]),
        fresh('ultimate', '影子落在牆上', [wall('1.5', '2', '6', '1'), wall('1.6', '1.2', '4.5', '1.2')]),
        fresh('ultimate', '金字塔的高', [pyramid('40', '10', '1', '1.5'), pyramid('60', '15', '2', '3')]),
        fresh('ultimate', '由周長比求面積', [perim_to_area(12, 18, 6), perim_to_area(30, 20, 36)]),
        fresh('ultimate', '中點三角形取兩次', [nested_mid(64, 'area'), nested_mid(48, 'perimeter'), nested_mid(80, 'area')]),
        fresh('ultimate', '由 tan 求坡道升高', [slope(3, 4, 5, 50), slope(5, 12, 13, 26), slope(8, 15, 17, 34)]),
        fresh('ultimate', '正三角形的高與面積', [equilateral('height', 8), equilateral('area', 6), equilateral('side', 5)]),
        fresh('ultimate', '視線與樹高（要加眼高）', [sight(45, 6), sight(30, 9), sight(60, 2)]),
        fresh('ultimate', '特殊直角三角形的比值', [special_ratio(30, 'cos', 2), special_ratio(60, 'sin', 3), special_ratio(45, 'tan', 4), special_ratio(30, 'tan', 5)]),
    ],
}


def main():
    pools = {'attack': [], 'shield': [], 'ultimate': []}
    topics = {}
    imported = 0
    for lesson, kinds in FROM_LESSONS.items():
        slots = {s['id']: s for s in LESSON_MOD[lesson].SLOTS}
        for kind, ids in kinds.items():
            for sid in ids:
                s = slots[sid]
                topics[f'{lesson}-{sid}'] = s['topic']
                for k, v in enumerate(s['variants'], 1):
                    where = f'{lesson}-{sid}-{k}'
                    check_item(v, where)
                    pools[kind].append(dict(id=where, topic=s['topic'], **item_json(v)))
                    imported += 1
    # 匯入的題目必須和 content/quizzes 的課後檢核題一模一樣（產生器沒有被改動過）
    for lesson in FROM_LESSONS:
        bank = json.loads((ROOT / 'content/quizzes' / f'{lesson}.json').read_text(encoding='utf8'))
        for s in bank['slots']:
            for k, v in enumerate(s['variants'], 1):
                mine = next((x for p in pools.values() for x in p if x['id'] == f"{lesson}-{s['id']}-{k}"), None)
                if mine:
                    assert {kk: mine[kk] for kk in v} == v, f"{lesson}-{s['id']}-{k} 和 content/quizzes 的題目不一樣"
    added = 0
    for kind, groups in NEW.items():
        for prefix, fresh_topic, items in groups:
            if prefix:
                topic = topics.get(prefix) or {s['id']: s for s in LESSON_MOD[prefix[:7]].SLOTS}[prefix[8:]]['topic']
                start = 4  # 題位原本有 1～3 題
            else:
                topic = fresh_topic[1]
                prefix = f'g9-1-4-new-{kind}-{topic}'
                start = 1
            for k, v in enumerate(items, start):
                where = f'{prefix}-{k}'
                check_item(v, where)
                pools[kind].append(dict(id=where, topic=topic, **item_json(v)))
                added += 1
    ids = [x['id'] for p in pools.values() for x in p]
    assert len(ids) == len(set(ids)), '題目 ID 重複'
    for p in pools.values():
        for x in p:
            if x['id'].startswith('g9-1-4-new-'):
                continue
            assert x['id'].rsplit('-', 1)[0] in topics or x['id'][:7] in LESSON_MOD, x['id']
    out = dict(hostLesson='g9-1-4c', title='1-4 相似三角形的應用：魔王戰', section='1-4',
               source='九年級 1-4(1)～(3) 課後檢核題（依類型分配）＋新增換數字題與綜合應用題；範圍含 1-1～1-3 比例、相似與畢氏定理；答案已用 SymPy 核算',
               pools=pools)
    path = ROOT / 'content/raids' / 'g9-1-4c.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print('✓ 1-4 魔王戰題庫：' + '、'.join(f'{k} {len(v)} 題' for k, v in pools.items())
          + f'（匯入 {imported} 題、新增 {added} 題）→ {path.name}（全部核算通過）')


if __name__ == '__main__':
    main()
