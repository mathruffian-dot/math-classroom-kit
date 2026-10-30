r"""九上 1-4 相似三角形的應用：回家作業手寫題庫（g9-1-4a、g9-1-4b、g9-1-4c）。

用法：python -X utf8 scripts/homework-src/g9-1-4.py
輸出：content/homework/g9-1-4a.json、g9-1-4b.json、g9-1-4c.json

- 題型（slot）和課後檢核 content/quizzes/g9-1-4?.json 一一對應（同 id、同 topic，topic 直接讀課後檢核檔）。
- 每個題型至少 5 題手寫題：課後檢核能改的改成「求…」，「哪一個正確」的題目改寫成列式／訂正錯誤的手寫題，再補新題。
- 範圍（累積）：1-4(1) 只用 1-3 的相似＋影子測高、河寬、對應高；1-4(2) 再加面積比、中點連線；
  1-4(3) 才出現 sin、cos、tan 與特殊直角三角形（另可用八年級的畢氏定理、根式）。
- 附圖重用 scripts/quiz-src 的 geom.py、similar.py 與 g9-1-4a..c.py 的畫圖函式，都用題目自己的數字畫。
- 每一題的答案都用 SymPy 另外解一次（解比例式／方程式、三角函數精確值、座標內積）核對，結尾印「N 題全部一致」。
"""
import importlib.util
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
QS = ROOT / 'scripts' / 'quiz-src'
sys.path.insert(0, str(QS))

from sympy import Eq, Rational, cos, floor, latex, nsimplify, pi, simplify, sin, solve, sqrt, symbols  # noqa: E402

from geom import YELLOW, Fig, num  # noqa: E402


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), QS / f'{name}.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


QA, QB, QC = _load('g9-1-4a'), _load('g9-1-4b'), _load('g9-1-4c')
import similar  # noqa: E402

R = Rational
S = sqrt
x = symbols('x', positive=True)
TOTAL = [0]


# ───────── 數字寫法 ─────────
def T(v):
    r"""值的 LaTeX（不含 $）：整數、有限小數、分數 \dfrac、根式。"""
    v = nsimplify(v)
    if v.is_Rational:
        if v.q == 1:
            return str(v.p)
        d = v.q
        while d % 2 == 0:
            d //= 2
        while d % 5 == 0:
            d //= 5
        if d == 1:
            return num(float(v))
        sign = '-' if v < 0 else ''
        return rf'{sign}\dfrac{{{abs(v.p)}}}{{{v.q}}}'
    return latex(v).replace(r'\frac', r'\dfrac').replace(' ', '')


def F(v):
    """比值（sin、cos、tan）一律寫成分數。"""
    v = nsimplify(v)
    if v.is_Rational and v.q != 1:
        return rf'\dfrac{{{v.p}}}{{{v.q}}}'
    return T(v)


def RT(v):
    """比的寫法 p:q（最簡整數比）。"""
    v = R(v)
    return f'{v.p}:{v.q}'


def L(v):
    """圖上的標籤文字（純文字，根式用 √）。"""
    v = nsimplify(v)
    if v.is_Rational:
        return num(float(v)) if similar.tex(v).find('dfrac') < 0 else f'{v.p}/{v.q}'
    c, r = v.as_coeff_Mul()
    if r.is_Pow and r.exp == R(1, 2):
        return f'{"" if c == 1 else num(float(c))}√{r.base}'
    raise ValueError(v)


def pos(eq):
    """解方程式（x 為正數），只取一個解。"""
    s = solve(eq, x)
    assert len(s) == 1, (eq, s)
    return s[0]


def same(a, b):
    return simplify(nsimplify(a) - nsimplify(b)) == 0


def V(stem, answer, solution, checks, figure=None, space=2, shown=None, fmt=None):
    """一題手寫題。checks：[(答案裡的值, 另外算出來的值)…] 必須相等；
    shown：必須出現在答案與詳解裡的文字（預設是每個答案值的 T()）。"""
    for got, ref in checks:
        assert same(got, ref), f'{stem}\n答案 {got} ≠ 核算 {ref}'
    for s in (shown if shown is not None else [(fmt or T)(g) for g, _ in checks]):
        assert s in answer, f'{stem}\n答案沒有寫到 {s}：{answer}'
        assert s in solution, f'{stem}\n詳解沒有寫到 {s}：{solution}'
    solution = DUP_FRAC.sub(r'\1', DUP_RATIO.sub(r'\1', solution))
    TOTAL[0] += 1
    item = dict(stem=stem)
    if figure:
        item['figure'] = figure
    item.update(answer=answer, solution=solution, space=space)
    return item


seg = lambda s: rf'\overline{{{s}}}'  # noqa: E731
DUP_FRAC = re.compile(r'(\\dfrac\{[^{}]+\}\{[^{}]+\})=\1(?![\d{])')
DUP_RATIO = re.compile(r'(?<![\d.])(\d+:\d+)=\1(?![\d.])')


# ═════════════════════ 1-4(1) 簡易測量與對應高 ═════════════════════
def a_corr(ab, de, bc):
    ef = R(bc) * de / ab
    return V(rf'如圖，$\triangle ABC\sim\triangle DEF$，$\overline{{AB}}={ab}$、$\overline{{DE}}={de}$、$\overline{{BC}}={bc}$，求 $\overline{{EF}}$ 的長。',
             rf'$\overline{{EF}}={T(ef)}$',
             rf'對應邊成比例：$\overline{{AB}}:\overline{{DE}}=\overline{{BC}}:\overline{{EF}}$，${ab}:{de}={bc}:\overline{{EF}}$，${ab}\,\overline{{EF}}={de * bc}$，$\overline{{EF}}={T(ef)}$。',
             [(ef, pos(Eq(R(ab) / de, bc / x)))],
             similar.sides_fig(R(de, ab), {'side1': str(ab), 'side2': str(de), 'base1': str(bc), 'base2': '?'}), 1)


def a_corr_ratio(p, r, ac):
    df = R(ac) * r / p
    return V(rf'如圖，$\triangle ABC\sim\triangle DEF$，$\overline{{AB}}:\overline{{DE}}={p}:{r}$，$\overline{{AC}}={ac}$，求 $\overline{{DF}}$ 的長。',
             rf'$\overline{{DF}}={T(df)}$',
             rf'對應邊成比例：$\overline{{AC}}:\overline{{DF}}=\overline{{AB}}:\overline{{DE}}={p}:{r}$，${ac}:\overline{{DF}}={p}:{r}$，${p}\,\overline{{DF}}={ac * r}$，$\overline{{DF}}={T(df)}$。',
             [(df, pos(Eq(R(ac) / x, R(p, r))))],
             similar.sides_fig(R(r, p), {'third1': str(ac), 'third2': '?'}), 1)


def a_shadow_h(h, s, S_):
    h, s, S_ = similar.q(h), similar.q(s), similar.q(S_)
    H = h * S_ / s
    return V(rf'同一時刻，身高 ${T(h)}$ 公尺的人影長 ${T(s)}$ 公尺，旁邊一棵樹的影長 ${T(S_)}$ 公尺，求樹高。',
             rf'樹高 ${T(H)}$ 公尺',
             rf'同一時刻陽光可視為平行光，人與影子、樹與影子形成的兩個直角三角形相似（AA）。身高 : 影長 ＝ 樹高 : 樹影，設樹高 $x$ 公尺：${T(h)}:{T(s)}=x:{T(S_)}$，${T(s)}x={T(h * S_)}$，$x={T(H)}$。樹高 ${T(H)}$ 公尺。',
             [(H, pos(Eq(h / s, x / S_)))],
             QA.shadow_fig(float(h), float(s), float(H), float(S_), (f'{T(h)} m', f'{T(s)} m', '?', f'{T(S_)} m')))


def a_shadow_s(h, s, H):
    h, s, H = similar.q(h), similar.q(s), similar.q(H)
    S_ = s * H / h
    return V(rf'同一時刻，身高 ${T(h)}$ 公尺的人影長 ${T(s)}$ 公尺，旁邊高 ${T(H)}$ 公尺的旗桿，影長是多少公尺？',
             rf'旗桿的影長 ${T(S_)}$ 公尺',
             rf'兩個直角三角形相似（AA），身高 : 影長 ＝ 旗桿高 : 旗桿影。設影長 $x$ 公尺：${T(h)}:{T(s)}={T(H)}:x$，${T(h)}x={T(s * H)}$，$x={T(S_)}$。',
             [(S_, pos(Eq(h / s, H / x)))],
             QA.shadow_fig(float(h), float(s), float(H), float(S_), (f'{T(h)} m', f'{T(s)} m', f'{T(H)} m', '?'), obj='flag'))


def a_units(hc, sc, S_):
    H = R(hc) * S_ / sc
    return V(rf'同一時刻，身高 ${hc}$ 公分的人影長 ${sc}$ 公分，一棟大樓的影長 ${S_}$ 公尺，求大樓的高度（公尺）。',
             rf'大樓高 ${T(H)}$ 公尺',
             rf'${hc}$ 公分＝${T(R(hc, 100))}$ 公尺、${sc}$ 公分＝${T(R(sc, 100))}$ 公尺。兩個直角三角形相似（AA），設大樓高 $x$ 公尺：${T(R(hc, 100))}:{T(R(sc, 100))}=x:{S_}$，${T(R(sc, 100))}x={T(R(hc, 100) * S_)}$，$x={T(H)}$。',
             [(H, pos(Eq(R(hc, 100) / R(sc, 100), x / S_)))],
             QA.shadow_fig(hc / 100, sc / 100, float(H), float(S_), (f'{hc} cm', f'{sc} cm', '?', f'{S_} m'), obj='building'))


def a_units_back(hc, H, S_):
    """已知大樓高與樓影（公尺），求人影（公分）。"""
    sc = R(hc) * S_ / H
    return V(rf'同一時刻，高 ${H}$ 公尺的大樓影長 ${S_}$ 公尺，身高 ${hc}$ 公分的人影長是多少公分？',
             rf'人影長 ${T(sc)}$ 公分',
             rf'兩個直角三角形相似（AA），高 : 影長的比相同。比的兩邊各自用同一個單位就好：${H}:{S_}={hc}:x$（$x$ 和 ${hc}$ 都用公分），${H}x={hc * S_}$，$x={T(sc)}$ 公分。',
             [(sc, pos(Eq(R(H) / S_, hc / x)))],
             QA.shadow_fig(hc / 100, float(sc) / 100, float(H), float(S_), (f'{hc} cm', '?', f'{H} m', f'{S_} m'), obj='building'))


def a_cross(m, n, de, why=False):
    ab = R(de) * m / n
    ask = '(1) 說明 $\\triangle ABC\\sim\\triangle DEC$ 的理由；(2) 求河寬 $\\overline{AB}$。' if why else '求河寬 $\\overline{AB}$。'
    return V(rf'如圖，從岸邊 $A$ 沿河岸走 ${m}$ 步到 $C$，再走 ${n}$ 步到 $D$，轉直角走到 $E$，使 $B$、$C$、$E$ 在同一直線上。每步一樣長，$\overline{{DE}}={de}$ 公尺，{ask}',
             (r'(1) $\angle A=\angle D=90^\circ$、$\angle ACB=\angle DCE$（對頂角），AA 相似；(2) ' if why else '') + rf'河寬 ${T(ab)}$ 公尺',
             rf'$\angle A=\angle D=90^\circ$，$\angle ACB=\angle DCE$（對頂角相等），所以 $\triangle ABC\sim\triangle DEC$（AA）。$\overline{{AB}}:\overline{{DE}}=\overline{{AC}}:\overline{{DC}}={m}:{n}$，$\overline{{AB}}:{de}={m}:{n}$，${n}\,\overline{{AB}}={de * m}$，$\overline{{AB}}={T(ab)}$ 公尺。',
             [(ab, pos(Eq(x / de, R(m, n))))],
             QA.river_cross_fig(m, n, de, ('?', f'{m} 步', f'{n} 步', f'{de} m')), 3 if why else 2)


def a_nest(a, c, b):
    de = R(b) * c / (a - c)
    return V(rf'如圖，$\overline{{AB}}\perp\overline{{BE}}$、$\overline{{CD}}\perp\overline{{BE}}$，$A$、$C$、$E$ 在同一直線上。$\overline{{AB}}={a}$、$\overline{{CD}}={c}$、$\overline{{BD}}={b}$ 公尺，求河寬 $\overline{{DE}}$。',
             rf'河寬 ${T(de)}$ 公尺',
             rf'$\angle B=\angle CDE=90^\circ$、$\angle E$ 共用，$\triangle EAB\sim\triangle ECD$（AA）。$\overline{{AB}}:\overline{{CD}}=\overline{{BE}}:\overline{{DE}}$，設 $\overline{{DE}}=x$：${a}:{c}=({b}+x):x$，${a}x={c}({b}+x)$，${a - c}x={b * c}$，$x={T(de)}$ 公尺。',
             [(de, pos(Eq(R(a) / c, (b + x) / x)))],
             QA.river_nest_fig(a, c, b, (f'{a} m', f'{c} m', f'{b} m', '?')), 3)


def a_height(p, r, ap):
    dq = R(ap) * r / p
    return V(rf'如圖，$\triangle ABC\sim\triangle DEF$，$\overline{{AP}}$、$\overline{{DQ}}$ 是對應高。若 $\overline{{AB}}:\overline{{DE}}={p}:{r}$，$\overline{{AP}}={ap}$，求 $\overline{{DQ}}$。',
             rf'$\overline{{DQ}}={T(dq)}$',
             rf'相似三角形對應高的比＝對應邊的比：$\overline{{AP}}:\overline{{DQ}}={p}:{r}$，${ap}:\overline{{DQ}}={p}:{r}$，${p}\,\overline{{DQ}}={ap * r}$，$\overline{{DQ}}={T(dq)}$。',
             [(dq, pos(Eq(R(ap) / x, R(p, r))))],
             similar.heights_fig(R(r, p), {'h1': str(ap), 'h2': '?'}), 1)


def a_height_len(ab, de, ap):
    dq = R(ap) * de / ab
    return V(rf'如圖，$\triangle ABC\sim\triangle DEF$，$\overline{{AP}}$、$\overline{{DQ}}$ 是對應高。$\overline{{AB}}={ab}$、$\overline{{DE}}={de}$、$\overline{{AP}}={ap}$，求 $\overline{{DQ}}$。',
             rf'$\overline{{DQ}}={T(dq)}$',
             rf'相似比 $\overline{{AB}}:\overline{{DE}}={ab}:{de}={RT(R(ab, de))}$，對應高的比也是 ${RT(R(ab, de))}$：${ap}:\overline{{DQ}}={ab}:{de}$，${ab}\,\overline{{DQ}}={ap * de}$，$\overline{{DQ}}={T(dq)}$。',
             [(dq, pos(Eq(R(ap) / x, R(ab, de))))],
             similar.heights_fig(R(de, ab), {'side1': str(ab), 'side2': str(de), 'h1': str(ap), 'h2': '?'}), 1)


def a_side(p, r, bc):
    ef = R(bc) * r / p
    return V(rf'如圖，$\triangle ABC\sim\triangle DEF$，$\overline{{AP}}$、$\overline{{DQ}}$ 分別是 $\overline{{BC}}$、$\overline{{EF}}$ 上的高。若 $\overline{{AP}}:\overline{{DQ}}={p}:{r}$，$\overline{{BC}}={bc}$，求 $\overline{{EF}}$。',
             rf'$\overline{{EF}}={T(ef)}$',
             rf'對應高的比＝對應邊的比：$\overline{{BC}}:\overline{{EF}}=\overline{{AP}}:\overline{{DQ}}={p}:{r}$，${bc}:\overline{{EF}}={p}:{r}$，${p}\,\overline{{EF}}={bc * r}$，$\overline{{EF}}={T(ef)}$。',
             [(ef, pos(Eq(R(bc) / x, R(p, r))))],
             similar.heights_fig(R(r, p), {'base1': str(bc), 'base2': '?'}), 1)


def a_side_len(ap, dq, bc):
    ef = R(bc) * dq / ap
    return V(rf'如圖，$\triangle ABC\sim\triangle DEF$，$\overline{{AP}}$、$\overline{{DQ}}$ 分別是 $\overline{{BC}}$、$\overline{{EF}}$ 上的高。$\overline{{AP}}={ap}$、$\overline{{DQ}}={dq}$、$\overline{{BC}}={bc}$，求 $\overline{{EF}}$。',
             rf'$\overline{{EF}}={T(ef)}$',
             rf'對應高的比＝對應邊的比：$\overline{{BC}}:\overline{{EF}}=\overline{{AP}}:\overline{{DQ}}={ap}:{dq}$，${bc}:\overline{{EF}}={ap}:{dq}$，${ap}\,\overline{{EF}}={bc * dq}$，$\overline{{EF}}={T(ef)}$。',
             [(ef, pos(Eq(R(bc) / x, R(ap, dq))))],
             similar.heights_fig(R(dq, ap), {'h1': str(ap), 'h2': str(dq), 'base1': str(bc), 'base2': '?'}), 2)


def a_fix_shadow(h, s, S_):
    """小明把身高和樹影配成一對。"""
    h, s, S_ = similar.q(h), similar.q(s), similar.q(S_)
    H = h * S_ / s
    wrong = pos(Eq(h / S_, s / x))
    return V(rf'同一時刻，身高 ${T(h)}$ 公尺的人影長 ${T(s)}$ 公尺，樹影長 ${T(S_)}$ 公尺。小明設樹高 $x$ 公尺，列出 ${T(h)}:{T(S_)}={T(s)}:x$，得 $x={T(wrong)}$。(1) 說明小明錯在哪裡；(2) 寫出正確的比例式，求樹高。',
             rf'(1) 把人的身高和樹的影子配成一對，不是對應邊；(2) ${T(h)}:{T(s)}=x:{T(S_)}$，樹高 ${T(H)}$ 公尺',
             rf'人與影、樹與影形成的兩個直角三角形相似（AA），對應邊是「身高對樹高、人影對樹影」。小明的 ${T(h)}:{T(S_)}$ 把人的身高和樹影配在一起，對應錯了。正確：${T(h)}:{T(s)}=x:{T(S_)}$，${T(s)}x={T(h * S_)}$，$x={T(H)}$ 公尺。',
             [(H, pos(Eq(h / s, x / S_)))],
             QA.shadow_fig(float(h), float(s), float(H), float(S_), (f'{T(h)} m', f'{T(s)} m', 'x', f'{T(S_)} m')), 3,
             shown=[T(H), rf'{T(h)}:{T(s)}=x:{T(S_)}'])


def a_fix_cross(m, n, de):
    ab = R(de) * m / n
    wrong = pos(Eq(x / de, R(n, m)))
    return V(rf'如圖，$\angle A=\angle D=90^\circ$，$B$、$C$、$E$ 在同一直線上。從 $A$ 走 ${m}$ 步到 $C$、再走 ${n}$ 步到 $D$（每步一樣長），$\overline{{DE}}={de}$ 公尺。小美列出 $\overline{{AB}}:\overline{{DE}}=\overline{{DC}}:\overline{{AC}}$，得 $\overline{{AB}}={T(wrong)}$。(1) 寫出正確的相似三角形與理由；(2) 改正比例式，求河寬 $\overline{{AB}}$。',
             rf'(1) $\triangle ABC\sim\triangle DEC$（AA）；(2) $\overline{{AB}}:\overline{{DE}}=\overline{{AC}}:\overline{{DC}}$，$\overline{{AB}}={T(ab)}$ 公尺',
             rf'$\angle A=\angle D=90^\circ$、$\angle ACB=\angle DCE$（對頂角），$\triangle ABC\sim\triangle DEC$（AA）。$\overline{{AB}}$ 對應 $\overline{{DE}}$，$\overline{{AC}}$ 對應 $\overline{{DC}}$，小美把 $\overline{{AC}}$、$\overline{{DC}}$ 的順序放反了。$\overline{{AC}}:\overline{{DC}}={m}:{n}$（步數的比），$\overline{{AB}}:{de}={m}:{n}$，$\overline{{AB}}={T(ab)}$ 公尺。',
             [(ab, pos(Eq(x / de, R(m, n))))],
             QA.river_cross_fig(m, n, de, ('?', f'{m} 步', f'{n} 步', f'{de} m')), 3)


def a_fix_nest(a, c, b):
    de = R(b) * c / (a - c)
    wrong = pos(Eq(R(a) / c, b / x))
    return V(rf'如圖，$\overline{{AB}}\perp\overline{{BE}}$、$\overline{{CD}}\perp\overline{{BE}}$，$A$、$C$、$E$ 共線，$\overline{{AB}}={a}$、$\overline{{CD}}={c}$、$\overline{{BD}}={b}$。小華設 $\overline{{DE}}=x$，列出 ${a}:{c}={b}:x$，得 $x={T(wrong)}$。(1) 說明小華錯在哪裡；(2) 寫出正確的比例式，求 $\overline{{DE}}$。',
             rf'(1) $\overline{{AB}}$ 的對應邊 $\overline{{CD}}$ 配的底應該是整段 $\overline{{BE}}$，不是 $\overline{{BD}}$；(2) ${a}:{c}=({b}+x):x$，$\overline{{DE}}={T(de)}$',
             rf'$\triangle EAB\sim\triangle ECD$（AA），$\overline{{AB}}$ 對 $\overline{{CD}}$、$\overline{{BE}}$ 對 $\overline{{DE}}$。大三角形的底是 $\overline{{BE}}=\overline{{BD}}+\overline{{DE}}={b}+x$，小華只用了 $\overline{{BD}}$。正確：${a}:{c}=({b}+x):x$，${a}x={c}({b}+x)$，${a - c}x={b * c}$，$x={T(de)}$。',
             [(de, pos(Eq(R(a) / c, (b + x) / x)))],
             QA.river_nest_fig(a, c, b, (f'{a}', f'{c}', f'{b}', 'x')), 3)


def a_fix_lamp(H, h, d):
    H, h = similar.q(H), similar.q(h)
    s = h * d / (H - h)
    wrong = pos(Eq(h / H, x / d))
    return V(rf'路燈高 ${T(H)}$ 公尺，身高 ${T(h)}$ 公尺的人站在離燈柱 ${d}$ 公尺處。小安設影長 $x$ 公尺，列出 ${T(h)}:{T(H)}=x:{d}$，得 $x={T(wrong)}$。(1) 說明小安錯在哪裡；(2) 寫出正確的比例式，求影長。',
             rf'(1) 大三角形的底是「到燈柱的距離＋影長」，不是 ${d}$；(2) ${T(h)}:{T(H)}=x:({d}+x)$，影長 ${T(s)}$ 公尺',
             rf'人和燈柱都垂直地面，小三角形（人與影）和大三角形（燈柱與地面）相似（AA）。大三角形的底從燈柱量到影子的尖端，是 ${d}+x$。正確：${T(h)}:{T(H)}=x:({d}+x)$，${T(H)}x={T(h)}({d}+x)$，${T(H - h)}x={T(h * d)}$，$x={T(s)}$ 公尺。',
             [(s, pos(Eq(h / H, x / (d + x))))],
             QA.lamp_fig(float(H), float(h), d, (f'{T(H)} m', f'{T(h)} m', f'{d} m', 'x')), 3)


def a_lamp(H, h, d):
    H, h = similar.q(H), similar.q(h)
    s = h * d / (H - h)
    return V(rf'路燈高 ${T(H)}$ 公尺，身高 ${T(h)}$ 公尺的人站在離燈柱 ${d}$ 公尺的地方，求他的影長。',
             rf'影長 ${T(s)}$ 公尺',
             rf'人和燈柱都垂直地面，小三角形和大三角形相似（AA）。設影長 $x$ 公尺，大三角形的底是 ${d}+x$：${T(h)}:{T(H)}=x:({d}+x)$，${T(H)}x={T(h)}({d}+x)$，${T(H - h)}x={T(h * d)}$，$x={T(s)}$ 公尺。',
             [(s, pos(Eq(h / H, x / (d + x))))],
             QA.lamp_fig(float(H), float(h), d, (f'{T(H)} m', f'{T(h)} m', f'{d} m', '?')), 3)


def a_lamp_dist(H, h, s):
    H, h, s = similar.q(H), similar.q(h), similar.q(s)
    d = s * (H - h) / h
    return V(rf'路燈高 ${T(H)}$ 公尺，身高 ${T(h)}$ 公尺的人站在路燈旁，影長 ${T(s)}$ 公尺。求他離燈柱多遠。',
             rf'離燈柱 ${T(d)}$ 公尺',
             rf'小三角形和大三角形相似（AA）。設人離燈柱 $x$ 公尺，大三角形的底是 $x+{T(s)}$：${T(h)}:{T(H)}={T(s)}:(x+{T(s)})$，${T(h)}(x+{T(s)})={T(H * s)}$，$x+{T(s)}={T(H * s / h)}$，$x={T(d)}$ 公尺。',
             [(d, pos(Eq(h / H, s / (x + s))))],
             QA.lamp_fig(float(H), float(h), float(d), (f'{T(H)} m', f'{T(h)} m', '?', f'{T(s)} m')), 3)


def a_lamp_height(h, d, s):
    h, s = similar.q(h), similar.q(s)
    H = h * (d + s) / s
    return V(rf'身高 ${T(h)}$ 公尺的人站在離燈柱 ${d}$ 公尺的地方，路燈照出的影長 ${T(s)}$ 公尺，求路燈的高度。',
             rf'路燈高 ${T(H)}$ 公尺',
             rf'小三角形和大三角形相似（AA），大三角形的底是 ${d}+{T(s)}={T(d + s)}$ 公尺。設路燈高 $x$ 公尺：${T(h)}:x={T(s)}:{T(d + s)}$，${T(s)}x={T(h * (d + s))}$，$x={T(H)}$ 公尺。',
             [(H, pos(Eq(h / x, s / (d + s))))],
             QA.lamp_fig(float(H), float(h), d, ('?', f'{T(h)} m', f'{d} m', f'{T(s)} m')), 2)


LESSON_A = {
    'q1': (1, [a_corr(9, 6, 12), a_corr(12, 8, 15), a_corr(10, 4, 15), a_corr_ratio(3, 2, 15), a_corr_ratio(5, 4, 15)]),
    'q2': (1, [a_shadow_h('1.6', '2', '5'), a_shadow_h('1.5', '1.2', '8'), a_shadow_h('1.8', '1.2', '6'), a_shadow_h('1.5', '2', '6'), a_shadow_h('1.6', '0.8', '4.5')]),
    'q3': (1, [a_shadow_s('1.5', '2', '9'), a_shadow_s('1.6', '1.2', '8'), a_shadow_s('1.8', '2.4', '6'), a_shadow_s('1.5', '1', '7.5'), a_shadow_s('1.6', '2', '12')]),
    'q4': (1, [a_units(160, 80, 12), a_units(150, 60, 10), a_units(180, 120, 15), a_units(165, 110, 12), a_units_back(150, 20, 8)]),
    'q5': (0, [a_cross(24, 6, 3), a_cross(18, 4, 2, why=True), a_cross(15, 5, 4), a_cross(28, 8, 2, why=True), a_cross(25, 10, 4)]),
    'q6': (1, [a_nest(12, 4, 10), a_nest(9, 3, 8), a_nest(8, 2, 12), a_nest(15, 6, 12), a_nest(10, 6, 8)]),
    'q7': (2, [a_height(4, 3, 12), a_height(3, 2, 9), a_height(5, 2, 15), a_height(7, 4, 21), a_height_len(15, 10, 12)]),
    'q8': (2, [a_side(4, 3, 16), a_side(5, 2, 15), a_side(3, 4, 9), a_side(6, 5, 18), a_side_len(6, 4, 9)]),
    'q9': (0, [a_fix_shadow('1.6', '2', '7'), a_fix_shadow('1.5', '1.2', '6'), a_fix_cross(24, 6, 3), a_fix_nest(12, 4, 10), a_fix_lamp('6', '1.5', 9)]),
    'q10': (1, [a_lamp('6', '1.5', 9), a_lamp('4', '1.6', 6), a_lamp('5', '1.5', 14), a_lamp('3.6', '1.6', 10), a_lamp_dist('6', '1.5', '2'), a_lamp_height('1.6', 6, '2')]),
}


# ═════════════════════ 1-4(2) 面積與邊長、中點連線 ═════════════════════
def b_height(p, r, ap):
    dq = R(ap) * r / p
    return V(rf'如圖，$\triangle ABC\sim\triangle DEF$，$\overline{{BC}}:\overline{{EF}}={p}:{r}$，$\overline{{AP}}$、$\overline{{DQ}}$ 是對應高，$\overline{{AP}}={ap}$，求 $\overline{{DQ}}$。',
             rf'$\overline{{DQ}}={T(dq)}$',
             rf'對應高的比＝相似比：${ap}:\overline{{DQ}}={p}:{r}$，${p}\,\overline{{DQ}}={ap * r}$，$\overline{{DQ}}={T(dq)}$。',
             [(dq, pos(Eq(R(ap) / x, R(p, r))))],
             similar.heights_fig(R(r, p), {'h1': str(ap), 'h2': '?'}), 1)


def b_ratio(b1, b2):
    k = R(b1, b2)
    return V(rf'如圖，$\triangle ABC\sim\triangle DEF$，$\overline{{BC}}={b1}$、$\overline{{EF}}={b2}$，求 $\triangle ABC$ 面積 : $\triangle DEF$ 面積。',
             rf'${RT(k ** 2)}$',
             rf'相似比＝$\overline{{BC}}:\overline{{EF}}={b1}:{b2}={RT(k)}$，面積比＝相似比的平方＝${k.p}^2:{k.q}^2={RT(k ** 2)}$。',
             [(k ** 2, (R(b1) / b2) ** 2)],
             similar.sides_fig(R(b2, b1), {'base1': str(b1), 'base2': str(b2)}), 1, shown=[RT(k ** 2)])


def b_ratio_perim(b1, b2, p1):
    k = R(b1, b2)
    p2 = p1 / k
    return V(rf'如圖，$\triangle ABC\sim\triangle DEF$，$\overline{{BC}}={b1}$、$\overline{{EF}}={b2}$，$\triangle ABC$ 的周長是 ${p1}$。求 (1) $\triangle DEF$ 的周長；(2) $\triangle ABC$ 面積 : $\triangle DEF$ 面積。',
             rf'(1) ${T(p2)}$；(2) ${RT(k ** 2)}$',
             rf'相似比 ${b1}:{b2}={RT(k)}$。(1) 周長比＝相似比（不用平方）：${p1}:x={RT(k)}$，$x={T(p2)}$。(2) 面積比＝相似比的平方＝${RT(k ** 2)}$。',
             [(p2, pos(Eq(R(p1) / x, k))), (k ** 2, (R(b1) / b2) ** 2)],
             similar.sides_fig(R(b2, b1), {'base1': str(b1), 'base2': str(b2)}), 2, shown=[T(p2), RT(k ** 2)])


def b_area_h(p, r, a1):
    a2 = R(a1) * r * r / (p * p)
    return V(rf'如圖，$\triangle ABC\sim\triangle DEF$，$\overline{{AH}}$、$\overline{{DK}}$ 是對應高，$\overline{{AH}}:\overline{{DK}}={p}:{r}$。$\triangle ABC$ 的面積是 ${a1}$，求 $\triangle DEF$ 的面積。',
             rf'$\triangle DEF$ 面積 ${T(a2)}$',
             rf'對應高的比＝相似比＝${p}:{r}$，面積比＝${p * p}:{r * r}$。${a1}:x={p * p}:{r * r}$，${p * p}x={a1 * r * r}$，$x={T(a2)}$。',
             [(a2, pos(Eq(R(a1) / x, R(p * p, r * r))))],
             similar.heights_fig(R(r, p), {'area1': str(a1), 'area2': '?'}, foot=('H', 'K'), fill=YELLOW), 2)


def b_area_side(b1, b2, a1):
    a2 = R(a1) * b2 * b2 / (b1 * b1)
    k = R(b1, b2)
    return V(rf'如圖，$\triangle ABC\sim\triangle DEF$，$\overline{{BC}}={b1}$、$\overline{{EF}}={b2}$，$\triangle ABC$ 的面積是 ${a1}$，求 $\triangle DEF$ 的面積。',
             rf'$\triangle DEF$ 面積 ${T(a2)}$',
             rf'相似比 ${b1}:{b2}={RT(k)}$，面積比 ${RT(k ** 2)}$。${a1}:x={RT(k ** 2)}$，$x={T(a2)}$。',
             [(a2, pos(Eq(R(a1) / x, k ** 2)))],
             similar.sides_fig(R(b2, b1), {'base1': str(b1), 'base2': str(b2), 'area1': str(a1), 'area2': '?'}), 2)


def b_side(A1, A2, bc):
    k = S(R(A1, A2))
    ef = bc / k
    return V(rf'如圖，$\triangle ABC\sim\triangle DEF$，面積分別是 ${A1}$ 和 ${A2}$。若 $\overline{{BC}}={bc}$，求 $\overline{{EF}}$。',
             rf'$\overline{{EF}}={T(ef)}$',
             rf'面積比 ${A1}:{A2}={S(A1)}^2:{S(A2)}^2$，所以相似比是 ${S(A1)}:{S(A2)}$。${bc}:\overline{{EF}}={S(A1)}:{S(A2)}$，${S(A1)}\,\overline{{EF}}={bc * S(A2)}$，$\overline{{EF}}={T(ef)}$。',
             [(ef, pos(Eq((bc / x) ** 2, R(A1, A2))))],
             similar.sides_fig(float(1 / k), {'base1': str(bc), 'base2': '?', 'area1': str(A1), 'area2': str(A2)}), 2)


def b_side_perim(A1, A2, p1):
    k = S(R(A1, A2))
    p2 = p1 / k
    return V(rf'如圖，$\triangle ABC\sim\triangle DEF$，面積分別是 ${A1}$ 和 ${A2}$，$\triangle ABC$ 的周長是 ${p1}$，求 $\triangle DEF$ 的周長。',
             rf'$\triangle DEF$ 周長 ${T(p2)}$',
             rf'面積比 ${A1}:{A2}$ 開平方，相似比 ${S(A1)}:{S(A2)}$；周長比＝相似比：${p1}:x={S(A1)}:{S(A2)}$，$x={T(p2)}$。',
             [(p2, pos(Eq((p1 / x) ** 2, R(A1, A2))))],
             similar.sides_fig(float(1 / k), {'area1': str(A1), 'area2': str(A2)}), 2)


def b_right(ab, ac, ask='ratio'):
    bc = S(ab * ab + ac * ac)
    bd = R(ab, 2)
    k2 = (bd / bc) ** 2
    area = R(ab * ac, 2)
    common = rf'$\overline{{BC}}=\sqrt{{{ab}^2+{ac}^2}}={T(bc)}$。$\angle B$ 共用、$\angle BED=\angle BAC=90^\circ$，$\triangle EBD\sim\triangle ABC$（AA），斜邊 $\overline{{BD}}$ 對應斜邊 $\overline{{BC}}$，$\overline{{BD}}=\dfrac{{{ab}}}{{2}}={T(bd)}$。面積比＝$\overline{{BD}}^2:\overline{{BC}}^2={T(bd ** 2)}:{T(bc ** 2)}={RT(k2)}$'
    stem0 = rf'如圖，$\triangle ABC$ 中 $\angle A=90^\circ$，$\overline{{AB}}={ab}$、$\overline{{AC}}={ac}$，$D$ 是 $\overline{{AB}}$ 的中點，$\overline{{DE}}\perp\overline{{BC}}$ 於 $E$。'
    if ask == 'ratio':
        return V(stem0 + r'求 $\triangle EBD$ 面積 : $\triangle ABC$ 面積。', rf'${RT(k2)}$', common + '。',
                 [(k2, R(bd * bd) / (ab * ab + ac * ac))], QB.ex4p_fig(ab, ac), 3, shown=[RT(k2)])
    e = area * k2
    return V(stem0 + r'求 $\triangle EBD$ 的面積。', rf'$\triangle EBD$ 面積 ${T(e)}$',
             common + rf'。$\triangle ABC$ 面積 $\dfrac{{{ab}\times{ac}}}{{2}}={area}$，$\triangle EBD$ 面積＝${area}\times\dfrac{{{k2.p}}}{{{k2.q}}}={T(e)}$。',
             [(e, pos(Eq(x / area, R(bd * bd) / (ab * ab + ac * ac))))], QB.ex4p_fig(ab, ac), 3)


def b_mid(area):
    a = R(area, 4)
    return V(rf'如圖，$D$、$E$、$F$ 分別是 $\triangle ABC$ 三邊的中點。$\triangle ABC$ 的面積是 ${area}$，求 $\triangle DEF$ 的面積。',
             rf'$\triangle DEF$ 面積 ${T(a)}$',
             rf'三邊中點連線段都是對邊的一半，$\triangle DEF\sim\triangle ABC$（SSS），相似比 $1:2$，面積比 $1:4$。${area}\times\dfrac{{1}}{{4}}={T(a)}$。',
             [(a, pos(Eq(x / area, R(1, 4))))],
             QB.midpoint_fig(7, 8, 9, area=(str(area), '?')), 1)


def b_mid_back(a_def):
    a = 4 * a_def
    return V(rf'如圖，$D$、$E$、$F$ 分別是 $\triangle ABC$ 三邊的中點。$\triangle DEF$ 的面積是 ${a_def}$，求 $\triangle ABC$ 的面積。',
             rf'$\triangle ABC$ 面積 ${T(a)}$',
             rf'$\triangle DEF\sim\triangle ABC$，相似比 $1:2$，面積比 $1:4$。$\triangle ABC$ 面積＝$4\times{a_def}={T(a)}$。',
             [(a, pos(Eq(R(a_def) / x, R(1, 4))))],
             QB.midpoint_fig(8, 7, 9, area=('?', str(a_def))), 1)


def b_mid_rest(area):
    rest = R(area) * 3 / 4
    return V(rf'如圖，$D$、$E$、$F$ 分別是 $\triangle ABC$ 三邊的中點，$\triangle ABC$ 的面積是 ${area}$。求 $\triangle ABC$ 扣掉 $\triangle DEF$ 之後，剩下部分的面積。',
             rf'剩下的面積 ${T(rest)}$',
             rf'$\triangle DEF$ 和 $\triangle ABC$ 的相似比 $1:2$，面積比 $1:4$，$\triangle DEF$ 面積＝${area}\times\dfrac{{1}}{{4}}={T(R(area, 4))}$。剩下 ${area}-{T(R(area, 4))}={T(rest)}$。',
             [(rest, area - pos(Eq(x / area, R(1, 4))))],
             QB.midpoint_fig(7, 8, 9, area=(str(area), '')), 2)


def b_back(de, df, ask):
    ef = S(de * de + df * df)
    p_def, a_def = de + df + ef, R(de * df, 2)
    stem = rf'如圖，$D$、$E$、$F$ 分別是 $\overline{{BC}}$、$\overline{{CA}}$、$\overline{{AB}}$ 的中點，$\overline{{DE}}={de}$、$\overline{{DF}}={df}$、$\angle FDE=90^\circ$。'
    fig = QB.mid_right_fig(de, df, (str(de), str(df)))
    per = rf'$\overline{{EF}}=\sqrt{{{de}^2+{df}^2}}={T(ef)}$，$\triangle DEF$ 周長 ${de}+{df}+{T(ef)}={T(p_def)}$。$\triangle DEF$ 和 $\triangle ABC$ 的相似比 $1:2$，周長比也是 $1:2$，$\triangle ABC$ 周長＝$2\times{T(p_def)}={T(2 * p_def)}$'
    are = rf'$\triangle DEF$ 面積＝$\dfrac{{{de}\times{df}}}{{2}}={a_def}$，面積比 $1:4$，$\triangle ABC$ 面積＝$4\times{a_def}={T(4 * a_def)}$'
    if ask == 'perimeter':
        return V(stem + r'求 $\triangle ABC$ 的周長。', rf'$\triangle ABC$ 周長 ${T(2 * p_def)}$', per + '。',
                 [(2 * p_def, pos(Eq(p_def / x, R(1, 2))))], fig, 2)
    if ask == 'area':
        return V(stem + r'求 $\triangle ABC$ 的面積。', rf'$\triangle ABC$ 面積 ${T(4 * a_def)}$', are + '。',
                 [(4 * a_def, pos(Eq(a_def / x, R(1, 4))))], fig, 2)
    return V(stem + r'求 $\triangle ABC$ 的 (1) 周長；(2) 面積。', rf'(1) 周長 ${T(2 * p_def)}$；(2) 面積 ${T(4 * a_def)}$', f'(1) {per}。(2) {are}。',
             [(2 * p_def, pos(Eq(p_def / x, R(1, 2)))), (4 * a_def, pos(Eq(a_def / x, R(1, 4))))], fig, 3)


def b_perim(a, b, c, ask_ef=False):
    P = a + b + c
    half = R(P, 2)
    if ask_ef:
        return V(rf'如圖，$\triangle ABC$ 中 $\overline{{BC}}={a}$、$\overline{{CA}}={b}$、$\overline{{AB}}={c}$，$D$、$E$、$F$ 分別是 $\overline{{BC}}$、$\overline{{CA}}$、$\overline{{AB}}$ 的中點。求 (1) $\overline{{EF}}$；(2) $\triangle DEF$ 的周長。',
                 rf'(1) $\overline{{EF}}={T(R(a, 2))}$；(2) 周長 ${T(half)}$',
                 rf'(1) $E$、$F$ 是 $\overline{{CA}}$、$\overline{{AB}}$ 的中點，$\overline{{EF}}\parallel\overline{{BC}}$ 且 $\overline{{EF}}=\dfrac{{1}}{{2}}\overline{{BC}}={T(R(a, 2))}$。(2) 同理 $\overline{{DE}}=\dfrac{{{c}}}{{2}}$、$\overline{{DF}}=\dfrac{{{b}}}{{2}}$，周長＝$\dfrac{{{a}+{b}+{c}}}{{2}}={T(half)}$。',
                 [(R(a, 2), pos(Eq(x / a, R(1, 2)))), (half, pos(Eq(x / P, R(1, 2))))],
                 QB.midpoint_fig(a, b, c, labels=(str(a), str(b), str(c))), 2)
    return V(rf'如圖，$\triangle ABC$ 的三邊長是 ${a}$、${b}$、${c}$，$D$、$E$、$F$ 是三邊的中點，求 $\triangle DEF$ 的周長。',
             rf'$\triangle DEF$ 周長 ${T(half)}$',
             rf'$\triangle ABC$ 周長 ${a}+{b}+{c}={P}$。中點連線段是對邊的一半，相似比 $1:2$，周長比也是 $1:2$（不用平方），周長＝$\dfrac{{{P}}}{{2}}={T(half)}$。',
             [(half, pos(Eq(x / P, R(1, 2))))],
             QB.midpoint_fig(a, b, c, labels=(str(a), str(b), str(c))), 1)


def hero(p, r):
    """核算用：邊長 (5, 6, 7) 的三角形放大 p 倍與 r 倍，用海龍公式算面積，回傳 (周長比, 面積比)。"""
    def tri(t):
        a, b, c = 5 * t, 6 * t, 7 * t
        s_ = R(a + b + c, 2)
        return a + b + c, sqrt(s_ * (s_ - a) * (s_ - b) * (s_ - c))
    (p1, a1), (p2, a2) = tri(p), tri(r)
    return simplify(R(p1, p2)), simplify(a1 / a2)


def b_three(p, r):
    k = R(p, r)
    return V(rf'如圖，$\triangle ABC\sim\triangle DEF$，相似比 ${p}:{r}$。求 (1) 對應高的比；(2) 周長的比；(3) 面積的比。',
             rf'(1) ${RT(k)}$；(2) ${RT(k)}$；(3) ${RT(k ** 2)}$',
             rf'對應高的比、周長的比都等於相似比 ${RT(k)}$；只有面積要平方：${p}^2:{r}^2={RT(k ** 2)}$。',
             [(k, hero(p, r)[0]), (k ** 2, hero(p, r)[1])], similar.heights_fig(R(r, p), {}, fill=QB.PEACH), 2,
             shown=[RT(k), RT(k ** 2)])


def b_three_area(A1, A2):
    k = S(R(A1, A2))
    return V(rf'如圖，$\triangle ABC\sim\triangle DEF$，面積的比是 ${A1}:{A2}$。求 (1) 相似比；(2) 周長的比；(3) 對應高的比。',
             rf'(1) ${RT(k)}$；(2) ${RT(k)}$；(3) ${RT(k)}$',
             rf'面積比是相似比的平方，開平方：${A1}:{A2}={S(A1)}^2:{S(A2)}^2$，相似比 ${RT(k)}$；周長比、對應高的比都等於相似比 ${RT(k)}$。',
             [(k, pos(Eq(x ** 2, R(A1, A2))))], similar.heights_fig(float(1 / k), {'area1': str(A1), 'area2': str(A2)}, fill=QB.PEACH), 2,
             shown=[RT(k)])


def b_fix(p, r, a1):
    k = R(p, r)
    a2 = R(a1) / k ** 2
    wrong = pos(Eq(R(a1) / x, k))
    return V(rf'如圖，$\triangle ABC\sim\triangle DEF$，相似比 ${p}:{r}$，$\triangle ABC$ 的面積是 ${a1}$。小美寫「${a1}:x={p}:{r}$，$x={T(wrong)}$」。(1) 說明小美錯在哪裡；(2) 求 $\triangle DEF$ 正確的面積。',
             rf'(1) 面積比是相似比的平方，不是相似比；(2) $\triangle DEF$ 面積 ${T(a2)}$',
             rf'小美把相似比直接當成面積比。面積比＝相似比的平方＝${p * p}:{r * r}$，${a1}:x={p * p}:{r * r}$，${p * p}x={a1 * r * r}$，$x={T(a2)}$。',
             [(a2, pos(Eq(R(a1) / x, k ** 2)))], similar.heights_fig(R(r, p), {'area1': str(a1), 'area2': '?'}, fill=QB.PEACH), 3)


def b_mixed(h1, h2, p1, a1):
    k = R(h1, h2)
    p2, a2 = p1 / k, a1 / k ** 2
    return V(rf'如圖，$\triangle ABC\sim\triangle DEF$，對應高 $\overline{{AP}}={h1}$、$\overline{{DQ}}={h2}$。$\triangle ABC$ 的周長是 ${p1}$、面積是 ${a1}$，求 $\triangle DEF$ 的 (1) 周長；(2) 面積。',
             rf'(1) 周長 ${T(p2)}$；(2) 面積 ${T(a2)}$',
             rf'對應高的比＝相似比＝${h1}:{h2}={RT(k)}$。(1) 周長比＝相似比：${p1}:x={RT(k)}$，$x={T(p2)}$。(2) 面積比＝${RT(k ** 2)}$：${a1}:y={RT(k ** 2)}$，$y={T(a2)}$。',
             [(p2, pos(Eq(R(p1) / x, k))), (a2, pos(Eq(R(a1) / x, k ** 2)))],
             similar.heights_fig(R(h2, h1), {'h1': str(h1), 'h2': str(h2), 'area1': str(a1)}, fill=QB.PEACH), 3)


def b_par(m, n, a):
    t = R(m, m + n)
    whole = a / t ** 2
    rest = whole - a
    return V(rf'如圖，$\triangle ABC$ 中 $\overline{{DE}}\parallel\overline{{BC}}$，$\overline{{AD}}:\overline{{DB}}={m}:{n}$。$\triangle ADE$ 的面積是 ${a}$，求四邊形 $DBCE$ 的面積。',
             rf'四邊形 $DBCE$ 面積 ${T(rest)}$',
             rf'$\overline{{DE}}\parallel\overline{{BC}}$，同位角相等，$\triangle ADE\sim\triangle ABC$（AA），相似比 $\overline{{AD}}:\overline{{AB}}={m}:{m + n}$，面積比 ${m * m}:{(m + n) ** 2}$。${a}:\triangle ABC={m * m}:{(m + n) ** 2}$，$\triangle ABC={T(whole)}$，四邊形 $DBCE={T(whole)}-{a}={T(rest)}$。',
             [(rest, pos(Eq(R(a) / (x + a), t ** 2)))],
             QB.parallel_fig(m, n, (str(m), str(n), str(a), '?')), 3)


def b_par_back(m, n, whole):
    t = R(m, m + n)
    a = whole * t ** 2
    return V(rf'如圖，$\triangle ABC$ 中 $\overline{{DE}}\parallel\overline{{BC}}$，$\overline{{AD}}:\overline{{DB}}={m}:{n}$，$\triangle ABC$ 的面積是 ${whole}$。求 (1) $\triangle ADE$ 的面積；(2) 四邊形 $DBCE$ 的面積。',
             rf'(1) $\triangle ADE$ 面積 ${T(a)}$；(2) 四邊形 $DBCE$ 面積 ${T(whole - a)}$',
             rf'$\triangle ADE\sim\triangle ABC$（AA），相似比 ${m}:{m + n}$，面積比 ${m * m}:{(m + n) ** 2}$。(1) $\triangle ADE={whole}\times\dfrac{{{m * m}}}{{{(m + n) ** 2}}}={T(a)}$。(2) ${whole}-{T(a)}={T(whole - a)}$。',
             [(a, pos(Eq(x / whole, t ** 2))), (whole - a, whole - pos(Eq(x / whole, t ** 2)))],
             QB.parallel_fig(m, n, (str(m), str(n), '?', '?')), 3)


LESSON_B = {
    'q1': (0, [b_height(5, 2, 10), b_height(3, 5, 9), b_height(6, 5, 12), b_height(4, 7, 8), b_height(2, 3, 10)]),
    'q2': (0, [b_ratio(4, 6), b_ratio(6, 10), b_ratio(3, 12), b_ratio(8, 6), b_ratio(14, 10), b_ratio_perim(6, 15, 14)]),
    'q3': (1, [b_area_h(4, 3, 32), b_area_h(5, 2, 50), b_area_h(2, 3, 20), b_area_h(3, 4, 27), b_area_side(6, 9, 12)]),
    'q4': (1, [b_side(16, 36, 8), b_side(9, 25, 6), b_side(4, 49, 4), b_side(25, 16, 10), b_side_perim(9, 16, 24)]),
    'q5': (1, [b_right(6, 8), b_right(12, 5), b_right(9, 12), b_right(6, 8, 'area'), b_right(16, 12, 'area')]),
    'q6': (2, [b_mid(48), b_mid(36), b_mid(50), b_mid_back(7), b_mid_rest(60)]),
    'q7': (2, [b_back(6, 8, 'perimeter'), b_back(6, 8, 'area'), b_back(5, 12, 'perimeter'), b_back(5, 12, 'area'), b_back(8, 15, 'both')]),
    'q8': (2, [b_perim(7, 8, 9), b_perim(5, 6, 9), b_perim(10, 12, 14), b_perim(6, 7, 9), b_perim(8, 10, 13, ask_ef=True)]),
    'q9': (0, [b_three(3, 4), b_three(2, 5), b_three_area(16, 25), b_fix(3, 5, 18), b_mixed(6, 9, 32, 36)]),
    'q10': (1, [b_par(2, 1, 8), b_par(1, 1, 5), b_par(3, 2, 18), b_par(1, 2, 4), b_par_back(1, 2, 45)]),
}


# ═════════════════════ 1-4(3) 相似直角三角形與 sin、cos、tan ═════════════════════
NAME = {'sin': r'\sin', 'cos': r'\cos', 'tan': r'\tan'}
RULE = {'sin': '對邊／斜邊', 'cos': '鄰邊／斜邊', 'tan': '對邊／鄰邊'}


def c_pyth(ac, bc, ab, ask):
    if ask == 'AB':
        v = S(ac * ac + bc * bc)
        stem = rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$，$\overline{{AC}}={ac}$、$\overline{{BC}}={bc}$，求斜邊 $\overline{{AB}}$。'
        how = rf'畢氏定理：$\overline{{AB}}^2={ac}^2+{bc}^2={ac * ac + bc * bc}$，$\overline{{AB}}=\sqrt{{{ac * ac + bc * bc}}}={T(v)}$。'
        lab = {'AC': str(ac), 'BC': str(bc), 'AB': '?'}
        ref = pos(Eq(x ** 2, ac ** 2 + bc ** 2))
    else:
        v = S(ab * ab - bc * bc)
        stem = rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$，斜邊 $\overline{{AB}}={ab}$、$\overline{{BC}}={bc}$，求 $\overline{{AC}}$。'
        how = rf'畢氏定理：$\overline{{AC}}^2={ab}^2-{bc}^2={ab * ab - bc * bc}$，$\overline{{AC}}={T(v)}$。斜邊最長，求股要用減的。'
        lab = {'AB': str(ab), 'BC': str(bc), 'AC': '?'}
        ref = pos(Eq(x ** 2 + bc ** 2, ab ** 2))
    return V(stem, f'${seg(ask)}={T(v)}$', how, [(v, ref)], QC.right_fig(ac, bc, lab), 1)


def named_fig(pts, right, ang):
    """任意名稱的直角三角形（pts：{名稱: (x, y)}），right／ang：[(頂點, (另兩點))]，畫直角記號／角弧。"""
    f = Fig(420, 230)
    P = {k: f.pt(k, float(a), float(b)) for k, (a, b) in pts.items()}
    f.poly(list(P.values()), fill=YELLOW)
    for v, (a, b) in right:
        f.right(P[v], P[a], P[b])
    for v, (a, b) in ang:
        f.arc(P[v], P[a], P[b], None, r=26, color='#d2541b')
    return f.svg()


def names_check(pts, tri, right, vertex, ans):
    """SymPy 核對：tri 在 right 是直角（內積 0）；vertex 的對邊不含 vertex，鄰邊含 vertex 與直角頂點，斜邊對著直角。"""
    P = {k: (nsimplify(a), nsimplify(b)) for k, (a, b) in pts.items()}
    o = [k for k in tri if k != right]
    u = (P[o[0]][0] - P[right][0], P[o[0]][1] - P[right][1])
    w = (P[o[1]][0] - P[right][0], P[o[1]][1] - P[right][1])
    assert simplify(u[0] * w[0] + u[1] * w[1]) == 0, f'{tri} 在 {right} 不是直角'
    other = [k for k in tri if k not in (vertex, right)][0]
    want = {'對邊': {other, right}, '鄰邊': {vertex, right}, '斜邊': {vertex, other}}
    for k, s in ans.items():
        assert set(s) == want[k], f'{tri} 的 ∠{vertex}：{k} 應為 {want[k]}，答案寫 {s}'


def c_names(pts, tri, right, vertex, stem_tri):
    ans = {}
    other = [k for k in tri if k not in (vertex, right)][0]
    ans = {'對邊': other + right, '鄰邊': vertex + right, '斜邊': vertex + other}
    # 線段名稱照字母順序寫
    ans = {k: ''.join(sorted(v)) for k, v in ans.items()}
    names_check(pts, tri, right, vertex, ans)
    TOTAL[0] += 1
    a = '、'.join(f'{k} ${seg(v)}$' for k, v in ans.items())
    return dict(stem=rf'如圖，直角 {stem_tri} 中 $\angle {right}=90^\circ$。寫出 $\angle {vertex}$ 的對邊、鄰邊和斜邊。',
                figure=named_fig(pts, [(right, [k for k in tri if k != right])], [(vertex, [k for k in tri if k != vertex])]),
                answer=a,
                solution=rf'斜邊對著直角 $\angle {right}$，是 ${seg(ans["斜邊"])}$；$\angle {vertex}$ 對著的股是對邊 ${seg(ans["對邊"])}$；夾著 $\angle {vertex}$ 的股是鄰邊 ${seg(ans["鄰邊"])}$。',
                space=1)


def c_names_alt():
    """△ABC 中 ∠ACB＝90°，CD⊥AB：同一個 ∠A，在兩個直角三角形中的對邊不同。"""
    pts = {'A': (0, 0), 'B': (5, 0), 'C': (R(9, 5), R(12, 5)), 'D': (R(9, 5), 0)}
    a1 = {'對邊': 'BC', '鄰邊': 'AC', '斜邊': 'AB'}
    a2 = {'對邊': 'CD', '鄰邊': 'AD', '斜邊': 'AC'}
    names_check(pts, ['A', 'B', 'C'], 'C', 'A', a1)
    names_check(pts, ['A', 'C', 'D'], 'D', 'A', a2)
    TOTAL[0] += 1
    f = Fig(420, 230)
    P = {k: f.pt(k, float(a), float(b)) for k, (a, b) in pts.items()}
    f.poly([P['A'], P['B'], P['C']], fill=YELLOW)
    f.seg(P['C'], P['D'])
    f.right(P['C'], P['A'], P['B'])
    f.right(P['D'], P['C'], P['B'])
    f.arc(P['A'], P['B'], P['C'], None, r=26, color='#d2541b')
    fmt = lambda d: '、'.join(f'{k} ${seg(v)}$' for k, v in d.items())  # noqa: E731
    return dict(stem=r'如圖，$\triangle ABC$ 中 $\angle ACB=90^\circ$，$\overline{CD}\perp\overline{AB}$ 於 $D$。分別寫出 $\angle A$ 在 (1) 直角 $\triangle ABC$；(2) 直角 $\triangle ACD$ 中的對邊、鄰邊和斜邊。',
                figure=f.svg(), answer=f'(1) {fmt(a1)}；(2) {fmt(a2)}',
                solution=r'(1) $\triangle ABC$ 的直角在 $C$：斜邊 $\overline{AB}$，$\angle A$ 的對邊 $\overline{BC}$、鄰邊 $\overline{AC}$。(2) $\triangle ACD$ 的直角在 $D$：斜邊變成 $\overline{AC}$，對邊 $\overline{CD}$、鄰邊 $\overline{AD}$。先找直角，才知道哪一邊是斜邊。',
                space=2)


def three(bc, ac, ab):
    return {'sin': R(bc) / ab, 'cos': R(ac) / ab, 'tan': R(bc) / ac}


def trig_ref(bc, ac, which, angle='A'):
    """SymPy 核算：用座標算出角度的 sin、cos、tan（A＝(0,0)、C＝(ac,0)、B＝(ac,bc)）。"""
    from sympy import atan2
    th = atan2(bc, ac) if angle == 'A' else atan2(ac, bc)
    return simplify({'sin': sin(th), 'cos': cos(th), 'tan': sin(th) / cos(th)}[which])


def c_ratio3(bc, ac, ab):
    r3 = three(bc, ac, ab)
    return V(rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$，$\overline{{AB}}={ab}$、$\overline{{BC}}={bc}$、$\overline{{AC}}={ac}$，求 $\sin A$、$\cos A$、$\tan A$。',
             rf'$\sin A={F(r3["sin"])}$、$\cos A={F(r3["cos"])}$、$\tan A={F(r3["tan"])}$',
             rf'$\angle A$ 的對邊 $\overline{{BC}}={bc}$、鄰邊 $\overline{{AC}}={ac}$、斜邊 $\overline{{AB}}={ab}$。$\sin A=\dfrac{{{bc}}}{{{ab}}}={F(r3["sin"])}$，$\cos A=\dfrac{{{ac}}}{{{ab}}}={F(r3["cos"])}$，$\tan A=\dfrac{{{bc}}}{{{ac}}}={F(r3["tan"])}$。',
             [(r3[k], trig_ref(bc, ac, k)) for k in ('sin', 'cos', 'tan')],
             QC.right_fig(ac, bc, {'AB': str(ab), 'BC': str(bc), 'AC': str(ac)}, {'A': ''}), 2, fmt=F)


def c_pyth_then(bc, ac, give, which):
    bc, ac = nsimplify(bc), nsimplify(ac)
    ab = S(bc ** 2 + ac ** 2)
    known = {'BC': bc, 'AC': ac, 'AB': ab}
    missing = [k for k in known if k not in give][0]
    lab = {k: (L(known[k]) if k in give else '?') for k in known}
    given = '、'.join(rf'$\overline{{{k}}}={T(known[k])}$' for k in give)
    r3 = {'sin': bc / ab, 'cos': ac / ab, 'tan': bc / ac}
    if missing == 'AB':
        py = rf'$\overline{{AB}}=\sqrt{{{T(ac)}^2+{T(bc)}^2}}={T(ab)}$'
    else:
        other = 'AC' if missing == 'BC' else 'BC'
        py = rf'$\overline{{{missing}}}=\sqrt{{{T(ab)}^2-{T(known[other])}^2}}={T(known[missing])}$'
    side = {'sin': ('BC', 'AB'), 'cos': ('AC', 'AB'), 'tan': ('BC', 'AC')}
    parts = []
    for w in which:
        num_, den = side[w]
        raw_ = known[num_] / known[den]
        step = rf'{NAME[w]} A=\dfrac{{{T(known[num_])}}}{{{T(known[den])}}}'
        parts.append(rf'${step}={F(raw_)}$')
    ask = '、'.join(f'${NAME[w]} A$' for w in which)
    return V(rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$，{given}，求 {ask}。',
             '、'.join(rf'${NAME[w]} A={F(r3[w])}$' for w in which),
             f'先用畢氏定理：{py}。再算：' + '，'.join(parts) + ('（分母有理化）' if not ab.is_Rational else '') + '。',
             [(r3[w], trig_ref(bc, ac, w)) for w in which],
             QC.right_fig(float(ac), float(bc), lab, {'A': ''}), 2, fmt=F)


def c_angle_b(bc, ac, ab):
    rb = {'sin': R(ac, ab), 'cos': R(bc, ab), 'tan': R(ac, bc)}
    return V(rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$，$\overline{{AB}}={ab}$、$\overline{{BC}}={bc}$、$\overline{{AC}}={ac}$，求 $\sin B$、$\cos B$、$\tan B$。',
             rf'$\sin B={F(rb["sin"])}$、$\cos B={F(rb["cos"])}$、$\tan B={F(rb["tan"])}$',
             rf'看 $\angle B$：對邊是 $\overline{{AC}}={ac}$、鄰邊是 $\overline{{BC}}={bc}$、斜邊 $\overline{{AB}}={ab}$。$\sin B=\dfrac{{{ac}}}{{{ab}}}={F(rb["sin"])}$，$\cos B=\dfrac{{{bc}}}{{{ab}}}={F(rb["cos"])}$，$\tan B=\dfrac{{{ac}}}{{{bc}}}={F(rb["tan"])}$。和 $\angle A$ 的對邊、鄰邊剛好互換。',
             [(rb[k], trig_ref(bc, ac, k, 'B')) for k in ('sin', 'cos', 'tan')],
             QC.right_fig(ac, bc, {'AB': str(ab), 'BC': str(bc), 'AC': str(ac)}, {'B': ''}), 2, fmt=F)


def c_sin_cos(ab, bc):
    ac = S(ab * ab - bc * bc)
    sa, cb = R(bc, ab), R(bc, ab)
    return V(rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$，$\overline{{AB}}={ab}$、$\overline{{BC}}={bc}$。求 $\sin A$ 和 $\cos B$，並說明兩者為什麼相等。',
             rf'$\sin A=\cos B={F(sa)}$；$\overline{{BC}}$ 是 $\angle A$ 的對邊，也是 $\angle B$ 的鄰邊',
             rf'$\sin A=\dfrac{{\overline{{BC}}}}{{\overline{{AB}}}}=\dfrac{{{bc}}}{{{ab}}}={F(sa)}$，$\cos B=\dfrac{{\overline{{BC}}}}{{\overline{{AB}}}}={F(cb)}$。$\overline{{BC}}$ 對著 $\angle A$、又夾著 $\angle B$，所以兩個比值都是 $\dfrac{{\overline{{BC}}}}{{\overline{{AB}}}}$。（不必先求 $\overline{{AC}}={T(ac)}$）',
             [(sa, trig_ref(bc, ac, 'sin')), (cb, trig_ref(bc, ac, 'cos', 'B'))],
             QC.right_fig(float(ac), bc, {'AB': str(ab), 'BC': str(bc)}, {'A': '', 'B': ''}), 2, shown=[F(sa)])


def c_from(bc, ac, ab, which, also=None):
    bc, ac, ab = R(bc), R(ac), R(ab)
    r3 = three(bc, ac, ab)
    v = r3[which]
    given, want = {'sin': ('AB', 'BC'), 'cos': ('AB', 'AC'), 'tan': ('AC', 'BC')}[which]
    known = {'BC': bc, 'AC': ac, 'AB': ab}
    den = {'sin': 'AB', 'cos': 'AB', 'tan': 'AC'}[which]
    nume = {'sin': 'BC', 'cos': 'AC', 'tan': 'BC'}[which]
    ask = [want] + ([also] if also else [])
    lab = {given: str(known[given])}
    lab.update({k: '?' for k in ask})
    how = rf'${NAME[which]} A=\dfrac{{\overline{{{nume}}}}}{{\overline{{{den}}}}}={F(v)}$，$\overline{{{want}}}={known[given]}\times{F(v)}={T(known[want])}$'
    checks = [(known[want], pos(Eq(x / known[given], v)))]
    if also:
        if also == 'AB':
            how += rf'；畢氏定理 $\overline{{AB}}=\sqrt{{{ac}^2+{bc}^2}}={T(ab)}$'
            checks.append((ab, pos(Eq(x ** 2, ac ** 2 + bc ** 2))))
        else:
            how += rf'；畢氏定理 $\overline{{AC}}=\sqrt{{{ab}^2-{bc}^2}}={T(ac)}$'
            checks.append((ac, pos(Eq(x ** 2 + bc ** 2, ab ** 2))))
    return V(rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$，${NAME[which]} A={F(v)}$，$\overline{{{given}}}={known[given]}$，求 ' + '、'.join(f'${seg(k)}$' for k in ask) + '。',
             '、'.join(f'${seg(k)}={T(known[k])}$' for k in ask), how + '。', checks,
             QC.right_fig(float(ac), float(bc), lab, {'A': ''}), 3 if also else 2)


def round2(v):
    return floor(nsimplify(v) * 100 + R(1, 2)) / 100


def c_life(scene, Lm, deg, s, c, ask):
    """生活題：斜邊 Lm、夾角 deg（sin≈s、cos≈c），ask＝'BC'（高度，用 sin）或 'AC'（水平，用 cos）。"""
    s_txt, c_txt = s, c
    s, c = similar.q(s), similar.q(c)
    exact = Lm * (s if ask == 'BC' else c)
    v = round2(exact)
    fn, val, val_txt = ('sin', s, s_txt) if ask == 'BC' else ('cos', c, c_txt)
    text = {
        'ramp': (rf'一條斜坡長 ${Lm}$ 公尺，和水平地面的夾角是 ${deg}^\circ$，求斜坡的' + ('垂直高度' if ask == 'BC' else '水平距離')),
        'ladder': rf'長 ${Lm}$ 公尺的梯子斜靠在牆上，梯子和地面的夾角是 ${deg}^\circ$，求' + ('梯子頂端離地的高度' if ask == 'BC' else '梯腳離牆的距離'),
        'kite': rf'風箏線拉直長 ${Lm}$ 公尺，和水平地面的夾角是 ${deg}^\circ$，求風箏離地的高度（手的高度不計）',
        'slide': rf'溜滑梯的滑道長 ${Lm}$ 公尺，和地面的夾角是 ${deg}^\circ$，求滑道頂端離地的高度',
    }[scene]
    where = '對邊' if ask == 'BC' else '鄰邊'
    lab = {'AB': f'{Lm} m', ask: '?'}
    fig = QC.right_fig(Lm * float(c), Lm * float(s), lab, {'A': f'{deg}°'}, scene={'slide': 'ramp'}.get(scene, scene))
    return V(text + rf'。（$\sin {deg}^\circ\approx {s_txt}$、$\cos {deg}^\circ\approx {c_txt}$，四捨五入到小數第 $2$ 位）',
             rf'約 ${T(v)}$ 公尺',
             rf'要求的是 $\angle A$ 的{where}，已知斜邊 ${Lm}$ 公尺，用 ${NAME[fn]}$：$\dfrac{{x}}{{{Lm}}}={NAME[fn]} {deg}^\circ\approx{val_txt}$，$x\approx{Lm}\times{val_txt}={T(exact)}' + ('' if exact == v else rf'\approx{T(v)}') + '$ 公尺。',
             [(v, round2(pos(Eq(x / Lm, val))))], fig, 2)


def special(deg, give, gv):
    """直角 △ABC（∠C＝90°、∠A＝deg）由一邊 give 的值 gv 求另外兩邊（SymPy 用精確三角函數核算）。"""
    A = pi * deg / 180
    gv = nsimplify(gv)
    # 先求斜邊
    ab = {'AB': gv, 'BC': gv / sin(A), 'AC': gv / cos(A)}[give]
    sides = {'AB': simplify(ab), 'BC': simplify(ab * sin(A)), 'AC': simplify(ab * cos(A))}
    return sides


def c_iso(give, gv, ask=None):
    sd = special(45, give, gv)
    others = ask or [k for k in ('AC', 'BC', 'AB') if k != give]
    lab = {give: L(sd[give]), **{k: '?' for k in others if k in ('AC', 'BC', 'AB')}}
    leg = sd['AC']
    if give == 'AB':
        how = rf'$45^\circ$-$45^\circ$-$90^\circ$ 的邊長比 $\overline{{AC}}:\overline{{BC}}:\overline{{AB}}=1:1:\sqrt{{2}}$。$\overline{{AC}}=\overline{{BC}}=\dfrac{{{T(gv)}}}{{\sqrt{{2}}}}={T(leg)}$'
    else:
        how = rf'$\angle B=45^\circ$，等腰直角三角形，邊長比 $1:1:\sqrt{{2}}$。$\overline{{AC}}=\overline{{BC}}={T(leg)}$，$\overline{{AB}}={T(leg)}\times\sqrt{{2}}={T(sd["AB"])}$'
    # 答案（sd）用精確三角函數算；核算用邊長比 1:1:√2 另外算
    k = nsimplify(gv) / (S(2) if give == 'AB' else 1)
    ref = {'AC': k, 'BC': k, 'AB': k * S(2)}
    checks = [(sd[k_], ref[k_]) for k_ in others if k_ != 'area']
    ans = [f'${seg(k_)}={T(sd[k_])}$' for k_ in others if k_ != 'area']
    if 'area' in others:
        area = simplify(sd['AC'] * sd['BC'] / 2)
        how += rf'；面積＝$\dfrac{{1}}{{2}}\times{T(leg)}\times{T(leg)}={T(area)}$'
        ans.append(f'面積 ${T(area)}$')
        checks.append((area, k * k / 2))
    assert same(sd['AC'] ** 2 + sd['BC'] ** 2, sd['AB'] ** 2)
    ask_t = '、'.join('面積' if k_ == 'area' else f'${seg(k_)}$' for k_ in others)
    return V(rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$、$\angle A=45^\circ$，${seg(give)}={T(gv)}$，求 {ask_t}。（根式化成最簡）',
             '、'.join(ans), how + '。', checks,
             QC.right_fig(float(leg), float(leg), lab, {'A': '45°'}), 2)


def c_thirty(deg, give, gv):
    sd = special(deg, give, gv)
    others = [k for k in ('AC', 'BC', 'AB') if k != give]
    short = 'BC' if deg == 30 else 'AC'   # 對 30° 的股
    long_ = 'AC' if deg == 30 else 'BC'
    lab = {give: L(sd[give]), **{k: '?' for k in others}}
    order = rf'$\overline{{{short}}}:\overline{{{long_}}}:\overline{{AB}}=1:\sqrt{{3}}:2$'
    how = rf'$\angle A={deg}^\circ$，$\angle B={90 - deg}^\circ$，對 $30^\circ$ 的 ${seg(short)}$ 最短。{order}，'
    if give == short:
        how += rf'${seg(long_)}={T(gv)}\times\sqrt{{3}}={T(sd[long_])}$，$\overline{{AB}}=2\times{T(gv)}={T(sd["AB"])}$'
    elif give == 'AB':
        how += rf'${seg(short)}=\dfrac{{{T(gv)}}}{{2}}={T(sd[short])}$，${seg(long_)}={T(sd[short])}\times\sqrt{{3}}={T(sd[long_])}$'
    else:
        how += rf'${seg(short)}=\dfrac{{{T(gv)}}}{{\sqrt{{3}}}}={T(sd[short])}$（分母有理化），$\overline{{AB}}=2\times{T(sd[short])}={T(sd["AB"])}$'
    assert same(sd['AC'] ** 2 + sd['BC'] ** 2, sd['AB'] ** 2)
    # 核算：邊長比 1:√3:2（和精確三角函數算的結果比）
    k = sd[short]
    ref = {short: k, long_: k * S(3), 'AB': 2 * k}
    return V(rf'如圖，直角 $\triangle ABC$ 中 $\angle C=90^\circ$、$\angle A={deg}^\circ$，${seg(give)}={T(gv)}$，求 ' + '、'.join(f'${seg(k_)}$' for k_ in others) + '。（根式化成最簡）',
             '、'.join(f'${seg(k_)}={T(sd[k_])}$' for k_ in others), how + '。',
             [(sd[k_], ref[k_]) for k_ in others],
             QC.right_fig(float(sd['AC']), float(sd['BC']), lab, {'A': f'{deg}°'}), 2)


def c_special_life(kind):
    if kind == 'escalator':
        h = similar.q('4.5')
        sd = special(30, 'BC', h)
        return V(r'電扶梯的傾斜角是 $30^\circ$，上下樓層的高度差 $4.5$ 公尺，求電扶梯的長度。',
                 rf'${T(sd["AB"])}$ 公尺',
                 rf'高度差對著 $30^\circ$，是最短邊；邊長比 $1:\sqrt{{3}}:2$，長度（斜邊）是它的 $2$ 倍：$2\times4.5={T(sd["AB"])}$ 公尺。',
                 [(sd['AB'], 2 * h)], QC.right_fig(4.5 * 3 ** 0.5, 4.5, {'BC': '4.5 m', 'AB': '?'}, {'A': '30°'}, scene='escalator'), 2)
    if kind == 'escalator2':
        sd = special(30, 'AB', 12)
        return V(r'一座電扶梯長 $12$ 公尺，傾斜角是 $30^\circ$。求 (1) 上下樓層的高度差；(2) 電扶梯的水平長度。（根式化成最簡）',
                 rf'(1) ${T(sd["BC"])}$ 公尺；(2) ${T(sd["AC"])}$ 公尺',
                 rf'邊長比 $\overline{{BC}}:\overline{{AC}}:\overline{{AB}}=1:\sqrt{{3}}:2$。(1) 高度差對 $30^\circ$：$\dfrac{{12}}{{2}}={T(sd["BC"])}$ 公尺。(2) 水平長度 $={T(sd["BC"])}\times\sqrt{{3}}={T(sd["AC"])}$ 公尺。',
                 [(sd['BC'], 6), (sd['AC'], 6 * S(3))], QC.right_fig(6 * 3 ** 0.5, 6, {'AB': '12 m', 'BC': '?', 'AC': '?'}, {'A': '30°'}, scene='escalator'), 3)
    if kind == 'flag':
        sd = special(45, 'BC', 6)
        return V(r'從旗桿頂端 $B$ 拉一條繩子到地面的 $A$ 點，繩子和地面夾 $45^\circ$。旗桿高 $6$ 公尺，求繩長。（根式化成最簡）',
                 rf'${T(sd["AB"])}$ 公尺',
                 rf'$\angle B=45^\circ$，等腰直角三角形，邊長比 $1:1:\sqrt{{2}}$，繩長＝$6\times\sqrt{{2}}={T(sd["AB"])}$ 公尺。',
                 [(sd['AB'], 6 * S(2))], QC.right_fig(6, 6, {'BC': '6 m', 'AB': '?'}, {'A': '45°'}, scene='flag'), 2)
    if kind == 'ladder60':
        sd = special(60, 'AB', 8)
        return V(r'長 $8$ 公尺的梯子斜靠在牆上，梯子和地面的夾角是 $60^\circ$，求梯子頂端離地的高度。（根式化成最簡）',
                 rf'${T(sd["BC"])}$ 公尺',
                 rf'$\angle A=60^\circ$，梯腳到牆的 $\overline{{AC}}$ 對著 $30^\circ$，$\overline{{AC}}=\dfrac{{8}}{{2}}=4$；邊長比 $1:\sqrt{{3}}:2$，頂端高度 $\overline{{BC}}={T(sd["BC"])}$ 公尺。',
                 [(sd['BC'], 4 * S(3))], QC.right_fig(4, 4 * 3 ** 0.5, {'AB': '8 m', 'BC': '?'}, {'A': '60°'}, scene='ladder'), 2)
    if kind == 'ladder45':
        sd = special(45, 'AB', 6)
        return V(r'長 $6$ 公尺的梯子斜靠在牆上，梯子和地面的夾角是 $45^\circ$，求梯子頂端離地的高度。（根式化成最簡）',
                 rf'${T(sd["BC"])}$ 公尺',
                 rf'$45^\circ$-$45^\circ$-$90^\circ$，邊長比 $1:1:\sqrt{{2}}$，高度＝$\dfrac{{6}}{{\sqrt{{2}}}}={T(sd["BC"])}$ 公尺（分母有理化）。',
                 [(sd['BC'], 3 * S(2))], QC.right_fig(3 * 2 ** 0.5, 3 * 2 ** 0.5, {'AB': '6 m', 'BC': '?'}, {'A': '45°'}, scene='ladder'), 2)
    if kind == 'kite60':
        sd = special(60, 'AB', 40)
        return V(r'風箏線拉直長 $40$ 公尺，和水平地面的夾角是 $60^\circ$，求風箏離地的高度（手的高度不計；根式化成最簡）。',
                 rf'${T(sd["BC"])}$ 公尺',
                 rf'$\angle A=60^\circ$，水平距離 $\overline{{AC}}$ 對著 $30^\circ$，$\overline{{AC}}=\dfrac{{40}}{{2}}=20$；邊長比 $1:\sqrt{{3}}:2$，高度 $\overline{{BC}}={T(sd["BC"])}$ 公尺。',
                 [(sd['BC'], 20 * S(3))], QC.right_fig(20, 20 * 3 ** 0.5, {'AB': '40 m', 'BC': '?'}, {'A': '60°'}, scene='kite'), 2)
    raise ValueError(kind)


TRI_ABC = {'A': (0, 0), 'C': (4, 0), 'B': (4, 3)}
LESSON_C = {
    'q1': (0, [c_pyth(8, 6, 10, 'AB'), c_pyth(12, 5, 13, 'AC'), c_pyth(12, 9, 15, 'AB'), c_pyth(24, 7, 25, 'AC'), c_pyth(6, 3, None, 'AB')]),
    'q2': (1, [c_names(TRI_ABC, ['A', 'B', 'C'], 'C', 'A', r'$\triangle ABC$'),
               c_names(TRI_ABC, ['A', 'B', 'C'], 'C', 'B', r'$\triangle ABC$'),
               c_names({'D': (0, R(16, 5)), 'E': (0, 0), 'F': (R(9, 2), 0)}, ['D', 'E', 'F'], 'E', 'D', r'$\triangle DEF$'),
               c_names({'P': (0, 0), 'Q': (4, 2), 'R': (-1, 2)}, ['P', 'Q', 'R'], 'P', 'Q', r'$\triangle PQR$'),
               c_names_alt()]),
    'q3': (1, [c_ratio3(5, 12, 13), c_ratio3(7, 24, 25), c_ratio3(12, 5, 13), c_ratio3(20, 21, 29), c_ratio3(9, 40, 41)]),
    'q4': (1, [c_pyth_then(3, 4, ('BC', 'AC'), ('sin', 'cos')), c_pyth_then(8, 6, ('BC', 'AB'), ('tan', 'cos')),
               c_pyth_then(8, 15, ('AC', 'AB'), ('cos', 'tan')), c_pyth_then(5, 12, ('BC', 'AB'), ('sin', 'tan')),
               c_pyth_then(2, 4, ('BC', 'AC'), ('sin', 'cos'))]),
    'q5': (1, [c_angle_b(3, 4, 5), c_angle_b(5, 12, 13), c_angle_b(8, 15, 17), c_angle_b(7, 24, 25), c_sin_cos(10, 6)]),
    'q6': (1, [c_from(12, 16, 20, 'sin'), c_from(24, 10, 26, 'cos'), c_from(9, 12, 15, 'tan'), c_from(15, 36, 39, 'sin', also='AC'), c_from(16, 30, 34, 'tan', also='AB')]),
    'q7': (1, [c_life('ramp', 200, 10, '0.1736', '0.9848', 'BC'), c_life('ladder', 5, 70, '0.9397', '0.3420', 'AC'),
               c_life('kite', 50, 40, '0.6428', '0.7660', 'BC'), c_life('ramp', 120, 8, '0.1392', '0.9903', 'AC'),
               c_life('slide', 4, 35, '0.5736', '0.8192', 'BC')]),
    'q8': (2, [c_iso('AC', 6), c_iso('AB', 10), c_iso('BC', 7), c_iso('AB', 8, ['AC', 'area']), c_iso('AC', 3 * S(2), ['AB'])]),
    'q9': (2, [c_thirty(60, 'AC', 4), c_thirty(30, 'BC', 4), c_thirty(30, 'AB', 12), c_thirty(60, 'AB', 10), c_thirty(30, 'AC', 9)]),
    'q10': (2, [c_special_life('escalator'), c_special_life('flag'), c_special_life('ladder60'), c_special_life('kite60'), c_special_life('ladder45'), c_special_life('escalator2')]),
}


# ═════════════════════ 課綱與匯出 ═════════════════════
TEXTBOOK = '九上教用課本 04_115國中數學3上課本_1-4 相似三角形的應用(教).pdf'
PENDING_C = '（原文待補：教用課本頁邊只標代碼，沒有敘述；九上備課用書不在資料夾內）'
PENDING_P = '（待確認：教用課本 1-4 只標學習內容，沒有標學習表現；此代碼依 108 課綱暫填，代碼與敘述請老師用備課用書核對）'
# 敘述抄自國家教育研究院《十二年國民基本教育課程綱要 國民中小學暨普通型高級中等學校 數學領域》學習表現、學習內容（https://www.naer.edu.tw/upload/1/16/doc/815/）（教用課本頁邊只印學習內容代碼；學習表現依課綱「對應學習表現」欄）
CUR = {
    'S-9-2': dict(code='S-9-2', text='三角形的相似性質：三角形的相似判定（AA、SAS、SSS）；對應邊長之比＝對應高之比；對應面積之比＝對應邊長平方之比；利用三角形相似的概念解應用問題；相似符號（~）。'),
    'S-9-4': dict(code='S-9-4', text='相似直角三角形邊長比值的不變性：直角三角形中某一銳角的角度決定邊長比值，該比值為不變量，不因相似直角三角形的大小而改變；三內角為30°, 60°, 90° 其邊長比記錄為「2:√3:1」；三內角為45°, 45°, 90° 其邊長比記錄為「√2:1:1」。'),
    's-IV-10': dict(code='s-IV-10', text='理解三角形相似的性質，利用對應角相等或對應邊成比例，判斷兩個三角形的相似，並能應用於解決幾何與日常生活的問題。'),
    's-IV-12': dict(code='s-IV-12', text='理解直角三角形中某一銳角的角度決定邊長的比值，認識這些比值的符號，並能運用到日常生活的情境解決問題。'),
}

META = {
    'g9-1-4a': dict(title='1-4(1) 簡易測量與對應高', lesson=LESSON_A, perf=['s-IV-10'], cont=['S-9-2'],
                    source=f'{TEXTBOOK} p.62–65（PDF 第 1–4 頁；頁邊「學習內容 S-9-2」標於 p.63 例 1、p.64 例 2、p.65 例 3）；學習表現依數學領綱「對應學習表現」，敘述抄自數學領綱。題目自編，答案已用 SymPy 核算',
                    links={'a-warmup': ['q1'], 'a-predict': ['q2'], 'a-shadow': ['q2'], 'a-ex1': ['q2'], 'a-ex1-practice': ['q4'],
                           'a-ex2': ['q5'], 'a-ex2-practice': ['q6'], 'a-ex3': ['q7'], 'a-ex3-practice': ['q8'], 'a-error': ['q9'], 'a-exit': ['q2']}),
    'g9-1-4b': dict(title='1-4(2) 面積與邊長、中點連線', lesson=LESSON_B, perf=['s-IV-10'], cont=['S-9-2'],
                    source=f'{TEXTBOOK} p.66–68（PDF 第 5–7 頁；頁邊「學習內容 S-9-2」標於 p.67 例 4）；學習表現依數學領綱「對應學習表現」，敘述抄自數學領綱。題目自編，答案已用 SymPy 核算',
                    links={'b-warmup': ['q1'], 'b-predict': ['q2'], 'b-explore': ['q2'], 'b-area': ['q2'], 'b-ex4': ['q3'], 'b-ex4-practice': ['q5'],
                           'b-midpoint': ['q6'], 'b-midpoint-practice': ['q7'], 'b-mixed': ['q9'], 'b-error': ['q9', 'q3'], 'b-exit': ['q2']}),
    'g9-1-4c': dict(title='1-4(3) 相似直角三角形與 sin、cos、tan', lesson=LESSON_C, perf=['s-IV-12'], cont=['S-9-4'],
                    source=f'{TEXTBOOK} p.69–76（PDF 第 8–15 頁；頁邊「學習內容 S-9-4」標於 p.71 例 5、p.72 例 6 隨堂、p.74 例 7 隨堂、p.75 例 8）；學習表現依數學領綱「對應學習表現」，敘述抄自數學領綱。題目自編，答案已用 SymPy 核算',
                    links={'c-warmup': ['q1'], 'c-def': ['q2'], 'c-ex5': ['q3'], 'c-ex5-practice': ['q3'], 'c-ex6': ['q7'], 'c-ex6-practice': ['q7'],
                           'c-special': ['q9'], 'c-ex7': ['q8'], 'c-ex7-practice': ['q9'], 'c-ex8': ['q10'], 'c-ex8-practice': ['q10'],
                           'c-error': ['q3', 'q2'], 'c-summary': ['q3']}),
}

TRIG = ('sin', 'cos', 'tan')

# 1-4 魔王戰（整節，放在 1-4(3)）：新增題目的 topic → 「課程 id:題位 id」（課後檢核搬過去的題目 ID 自帶題位，不用列）
RAID_TOPICS = {
    '判斷相似與對應頂點（先備）': 'g9-1-4a:q1',
    '找出正確算法：影子與路燈': 'g9-1-4a:q2',
    '鏡子測高': 'g9-1-4a:q2',
    '影子落在牆上': 'g9-1-4a:q2',
    '金字塔的高': 'g9-1-4a:q2',
    '竹竿測高（要加眼高）': 'g9-1-4a:q6',        # 大三角形套小三角形
    '相似三角形的周長比': 'g9-1-4b:q9',          # 高、周長、面積：哪個要平方？
    '由周長比求面積': 'g9-1-4b:q9',
    '找出正確算法：面積': 'g9-1-4b:q3',
    '由面積比求相似比': 'g9-1-4b:q4',
    '中點三角形取兩次': 'g9-1-4b:q6',
    '放大縮小後比值不變': 'g9-1-4c:q3',
    'sin、cos、tan 的判斷': 'g9-1-4c:q3',
    '由 tan 求坡道升高': 'g9-1-4c:q7',
    '正三角形的高與面積': 'g9-1-4c:q9',
    '特殊直角三角形的比值': 'g9-1-4c:q9',
    '視線與樹高（要加眼高）': 'g9-1-4c:q10',
}
# 1-2、1-3 的先備題（1-4 沒有對應題型）：學習紀錄只算總答對率；要不要對到題型待老師決定
RAID_SKIP = ['比例式（先備）', '平行線截比例線段（先備）', '平行線的比例式：哪一個正確']


def raid_links():
    raid = json.loads((ROOT / 'content' / 'raids' / 'g9-1-4c.json').read_text(encoding='utf8'))
    banks = {lid: set(m['lesson']) for lid, m in META.items()}
    used = {}
    for q in (x for pool in raid['pools'].values() for x in pool):
        m = re.match(r'^(g[\w-]+?)-(q\d+)-\d+$', q['id'])
        if m and m.group(2) in banks.get(m.group(1), ()):
            continue
        t = q['topic']
        if t in RAID_SKIP:
            continue
        assert t in RAID_TOPICS, f'魔王戰 topic「{t}」沒有對應題型（{q["id"]}）'
        used[t] = RAID_TOPICS[t]
    for t, ref in used.items():
        lid, sid = ref.split(':')
        assert sid in banks[lid], f'魔王戰 topic「{t}」對到不存在的 {ref}'
    return dict(raidTopics=used, raidSkip=RAID_SKIP)


def export():
    out_dir = ROOT / 'content' / 'homework'
    out_dir.mkdir(parents=True, exist_ok=True)
    for lid, m in META.items():
        quiz = json.loads((ROOT / 'content' / 'quizzes' / f'{lid}.json').read_text(encoding='utf8'))
        topics = {s['id']: s['topic'] for s in quiz['slots']}
        assert set(topics) == set(m['lesson']), f'{lid} 題位和課後檢核不一致'
        slots = []
        for sid in topics:
            obj, variants = m['lesson'][sid]
            assert len(variants) >= 5, f'{lid}:{sid} 只有 {len(variants)} 題'
            for v in variants:
                # 範圍：三角比只出現在 1-4(3)
                if lid != 'g9-1-4c':
                    assert not any(t in v['stem'] + v['solution'] for t in TRIG), f'{lid}:{sid} 出現三角比'
                if lid == 'g9-1-4a':
                    assert '面積' not in v['stem'] + v['solution'], f'{lid}:{sid} 出現面積比（下一堂）'
                assert v.get('figure'), f'{lid}:{sid} 幾何題缺附圖'
            slots.append(dict(id=sid, topic=topics[sid], objective=obj, performance=m['perf'], content=m['cont'], variants=variants))
        data = dict(lessonId=lid, section='9-1-4', title=m['title'], source=m['source'],
                    curriculum=dict(performance=[CUR[c] for c in m['perf']], content=[CUR[c] for c in m['cont']]),
                    slots=slots, links=dict(activities=m['links'], **(raid_links() if lid == 'g9-1-4c' else {})))
        (out_dir / f'{lid}.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        print(f'✓ {lid}：{len(slots)} 個題型、{sum(len(s["variants"]) for s in slots)} 題 → content/homework/{lid}.json')
    print(f'{TOTAL[0]} 題全部一致')


if __name__ == '__main__':
    export()
