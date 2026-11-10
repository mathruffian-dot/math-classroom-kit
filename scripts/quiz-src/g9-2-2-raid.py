r"""2-2 圓心角、圓周角與弧的關係：魔王戰題庫（三類題目＋分析題，全部用 SymPy 核算，每題附圖）。

用法：C:\AI\H3\venv\Scripts\python.exe -B -X utf8 scripts/quiz-src/g9-2-2-raid.py
掛在這一節最後一堂（2-2(4)）後面，放在 g9-2-2d 的最後。
範圍：2-2(1)～(4) 全部（弧的度數、等弧等弦、圓周角、同弧、半圓、平行弦、圓內接四邊形、過圓外一點作切線），
加上先備 2-1 弧長、切線、八上全等與內角和；不用 2-3 以後（外心、內心等）。
三類題目（學生自己選要做哪一類）：
- attack（記憶）：普通攻擊。一步就能算完（弧的度數、圓周角是一半、對角互補、外角）。
- shield（理解）：防護罩。判斷對哪一段弧、正確算法、比較角的大小、敘述對錯、理由。
- ultimate（應用）：大招。多步驟（拆弧、平行弦＋圓周角、直徑＋同弧、對角線、比例、等分點）。
- analysis（分析）：破盾題。找錯步驟、判斷＋理由。
題庫＝四堂課後檢核題（依類型分配）＋新增換數字題與較難應用題／分析題。
"""
import importlib.util
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import pi  # noqa: E402

from arcfig import A_, R, lab  # noqa: E402
from circlefig import etex  # noqa: E402
from quizlib import ROOT, check_item, item_json, relation, statement, with_figure  # noqa: E402

HERE = Path(__file__).parent


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), HERE / f'{name}.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


A, B, C, D = load('g9-2-2a'), load('g9-2-2b'), load('g9-2-2c'), load('g9-2-2d')
LESSON_MOD = {'g9-2-2a': A, 'g9-2-2b': B, 'g9-2-2c': C, 'g9-2-2d': D}

# 課後檢核依類型分配（記憶／理解／應用）；每個題位剛好出現在一類
FROM_LESSONS = {
    'g9-2-2a': {
        'attack': ['q1', 'q2', 'q3', 'q10'],
        'shield': ['q4', 'q6', 'q9'],
        'ultimate': ['q5', 'q7', 'q8'],
    },
    'g9-2-2b': {
        'attack': ['q1', 'q2', 'q3', 'q4'],
        'shield': ['q8', 'q9'],
        'ultimate': ['q5', 'q6', 'q7', 'q10'],
    },
    'g9-2-2c': {
        'attack': ['q3', 'q4', 'q9'],
        'shield': ['q6'],
        'ultimate': ['q1', 'q2', 'q5', 'q7', 'q8', 'q10'],
    },
    'g9-2-2d': {
        'attack': ['q1', 'q2', 'q6'],
        'shield': ['q7', 'q10'],
        'ultimate': ['q3', 'q4', 'q5', 'q8', 'q9'],
    },
}


def fig(item):
    return item['figure']


# ───────── 新增：攻擊（換數字） ─────────
def new_attack():
    items = []
    for args in [(60, 280), (105, 90), (36, 300), (150, 270)]:
        items.append(('弧的度數＝圓心角', A.minor_deg(*args)))
    for args in [(80, 270), (125, 90), (40, 290)]:
        items.append(('優弧的度數', A.major_deg(*args)))
    for args in [(8, 135, 270), (10, 72, 90), (15, 48, 280)]:
        items.append(('由弧的度數算弧長', A.arc_length(*args)))
    for args in [(6, 120, 270), (12, 75, 90), (9, 140, 280)]:
        items.append(('由弧長反求弧的度數', A.deg_from_len(*args)))
    for args in [(80, 250, 100), (124, 210, 80), (64, 245, 105), (150, 195, 70)]:
        items.append(('圓周角是所對弧的一半', B.from_arc(*args)))
    for args in [(160, 190, 75), (96, 240, 95), (70, 255, 110)]:
        items.append(('圓周角是同弧圓心角的一半', B.from_central(*args)))
    for args in [(25, 245, 100), (47, 230, 85), (65, 210, 90)]:
        items.append(('由圓周角求圓心角', B.to_central(*args)))
    for args in [(42, 245, (70, 145)), (30, 250, (65, 130)), (57, 235, (55, 125))]:
        items.append(('同弧所對的圓周角相等', B.same_arc(*args)))
    for t in (18, 40, 61):
        items.append(('直徑所對的圓周角是直角', C.right_tri(t)))
    for xx in (20, 35, 44):
        items.append(('直徑：由弧求三角形的角', C.diam_arc(xx)))
    for args in [(65,), (120, 80), (92, 100)]:
        items.append(('圓內接四邊形對角互補', D.opposite(*args)))
    for args in [(105,), (68, 95), (124, 70)]:
        items.append(('外角等於內對角', D.exterior(*args)))
    for args in [(75, 100), (100, 75), (115, 88)]:
        items.append(('已知兩角求第四個角', D.neighbor(*args)))
    return items


# ───────── 新增：防護罩 ─────────
def calc_other_arc(m, a0=210, bdeg=60):
    f = fig(B.other_arc(m, a0, bdeg))
    return with_figure(statement(
        rf'如圖，圓 $O$ 中 $\angle AOC={m}^\circ$，$D$ 在較短的 {A_("AC")} 上。$\angle ADC$ 的哪一個算法正確？',
        [(rf'$(360^\circ-{m}^\circ)\div2$', True), (rf'${m}^\circ\div2$', False), (rf'${m}^\circ\times2$', False), (rf'$180^\circ-{m}^\circ$', False)],
        rf'$\angle ADC$ 對的是不含 $D$ 的 {A_("ABC")} $={360 - m}^\circ$，所以 $\angle ADC={R(360 - m, 2)}^\circ$。${m}^\circ\div2$ 是 $\angle ABC$。'), f)


def calc_half(m, cdeg=110):
    f = fig(B.half_circle(m, cdeg))
    return with_figure(statement(
        rf'如圖，$\overline{{AB}}$ 是圓 $O$ 的直徑，{A_("BD")} $={m}^\circ$。$\angle ACD$ 的哪一個算法正確？',
        [(rf'$(180^\circ-{m}^\circ)\div2$', True), (rf'${m}^\circ\div2$', False), (rf'$180^\circ-{m}^\circ$', False), (rf'$(360^\circ-{m}^\circ)\div2$', False)],
        rf'$\angle ACD$ 對 {A_("AD")}，{A_("AD")} $=180^\circ-{m}^\circ$（半圓），再除以 $2$：$\angle ACD={R(180 - m, 2)}^\circ$。'), f)


def calc_cyclic(a, b=95):
    f = fig(D.opposite(a, b))
    return with_figure(statement(
        rf'如圖，四邊形 $ABCD$ 是圓內接四邊形，$\angle A={a}^\circ$。$\angle C$ 的哪一個算法正確？',
        [(rf'$180^\circ-{a}^\circ$', True), (rf'$360^\circ-{a}^\circ$', False), (rf'${a}^\circ$（對角相等）', False), (rf'${a}^\circ\div2$', False)],
        rf'圓內接四邊形對角互補：$\angle C=180^\circ-{a}^\circ={180 - a}^\circ$。'), f)


def compare_same(k, base=250, cd=(70, 140)):
    """同弧兩圓周角比大小（相等）。"""
    f = fig(B.same_arc(k, base, cd))
    return with_figure(relation(
        rf'如圖，$A$、$B$、$C$、$D$ 在圓上，$\angle ACB={k}^\circ$。比較 $\angle ACB$ 和 $\angle ADB$ 的大小。',
        k, k,
        [r'$\angle ACB>\angle ADB$', r'$\angle ACB<\angle ADB$', r'$\angle ACB=\angle ADB$', '要量過才知道'],
        rf'兩個角都對 {A_("AB")}，同弧所對的圓周角相等：都是 {A_("AB")} 的一半，${k}^\circ$。'), f)


def compare_two_sides(m, a0=210, bdeg=60):
    """∠ABC（B 在優弧）和 ∠ADC（D 在劣弧）比大小。"""
    f = fig(B.other_arc(m, a0, bdeg))
    big, small = R(360 - m, 2), R(m, 2)
    return with_figure(relation(
        rf'如圖，圓 $O$ 中 $\angle AOC={m}^\circ$，$B$、$D$ 在 $\overline{{AC}}$ 的兩側。比較 $\angle ABC$ 和 $\angle ADC$ 的大小。',
        small, big,
        [r'$\angle ABC>\angle ADC$', r'$\angle ABC<\angle ADC$', r'$\angle ABC=\angle ADC$', '要量過才知道'],
        rf'$\angle ABC$ 對 {A_("AC")}（${m}^\circ$），等於 ${small}^\circ$；$\angle ADC$ 對另一段 {A_("ABC")}（${360 - m}^\circ$），等於 ${big}^\circ$。兩個角互補，不一定相等。'), f)


def par_equal(u, s):
    cd = 360 - u - 2 * s
    dA, dB = 90 + u / 2, 90 - u / 2
    c, *_ = C.par_fig(u, s, labels=[(dB, dA, lab(u)), (dA + s, dB - s + 360, lab(cd))])
    return with_figure(statement(
        rf'如圖，圓上兩弦 $\overline{{AB}}\parallel\overline{{CD}}$，{A_("AB")} $={u}^\circ$、{A_("CD")} $={cd}^\circ$。下列哪兩段弧一定相等？',
        [(rf'{A_("AC")} 和 {A_("BD")}', True), (rf'{A_("AB")} 和 {A_("CD")}', False), (rf'{A_("AB")} 和 {A_("AC")}', False), (rf'{A_("CD")} 和 {A_("BD")}', False)],
        r'連接 $\overline{BC}$：$\angle ABC=\angle BCD$（內錯角），兩個圓周角相等，所對的弧也相等，所以 ' + A_('AC') + ' $=$ ' + A_('BD') + rf' $=(360^\circ-{u}^\circ-{cd}^\circ)\div2={s}^\circ$。'), c.svg())


def new_shield():
    items = []
    QUADS = [
        ('C', 'AB', 'AB', ['BC', 'AD', 'CD']),
        ('C', 'AD', 'AD', ['AB', 'CD', 'ABC']),
        ('D', 'BC', 'BC', ['AB', 'CD', 'BAD']),
        ('A', 'CD', 'CD', ['BC', 'AD', 'ABC']),
        ('B', 'CD', 'CD', ['BC', 'AB', 'DAB']),
        ('D', 'AC', 'ABC', ['AD', 'CD', 'BC']),
    ]
    for args in QUADS:
        items.append(('找出圓周角所對的弧', B.which_arc(*args)))
    for m in (70, 96, 124, 140):
        items.append(('弧、圓心角、圓周角的關係', B.relations(m)))
    for t in (20, 48, 72):
        items.append(('判斷：半圓所對的角', C.diam_stmt(t)))
    for args in [(3, 6, 100), (8, 12, 45), (5, 10, 72)]:
        items.append(('同心圓：度數相等、弧長不等', A.concentric_stmt(*args)))
    for args in [(35, 8), (45, 10), (70, 6)]:
        items.append(('同圓中弧長與度數成正比（弦長不是）', A.double_arc(*args)))
    for args in [(65,), (100, 90), (122, 70)]:
        items.append(('判斷：對角互補與外角', D.judge(*args)))
    for args in [(116,), (90, 215, 65), (160, 190, 55), (70, 225, 80)]:
        items.append(('找出正確算法：圓周角對另一段弧', calc_other_arc(*args)))
    for args in [(60,), (84, 115), (110, 100)]:
        items.append(('找出正確算法：半圓弧 180°', calc_half(*args)))
    for args in [(75,), (108, 80), (96, 100)]:
        items.append(('找出正確算法：對角互補', calc_cyclic(*args)))
    for args in [(38,), (50, 240, (60, 135)), (24, 255, (80, 150))]:
        items.append(('比較大小：同弧所對的圓周角', compare_same(*args)))
    for args in [(100,), (140, 200, 60), (80, 225, 75)]:
        items.append(('比較大小：弦兩側的圓周角', compare_two_sides(*args)))
    for args in [(100, 50), (80, 70), (120, 40)]:
        items.append(('平行弦截等弧：哪兩段相等', par_equal(*args)))
    return items


# ───────── 新增：大招 ─────────
def new_ultimate():
    items = []
    for args in [(6, 9, 120), (5, 9, 100), (4, 6, 150)]:
        items.append(('同心圓：兩弧長相差多少', A.concentric_diff(*args)))
    for args in [(8, 2), (6, 1), (5, 1)]:
        items.append(('正多邊形：等弦對等弧', A.polygon(*args)))
    for args in [(80, 70, 150), (60, 90, 145), (100, 50, 165)]:
        items.append(('兩等弦相交：扣掉共同的弧', A.equal_chords(*args)))
    for args in [(64,), (40, 115), (116, 100)]:
        items.append(('直徑與半圓弧 180°（例 4）', B.half_circle(*args)))
    for args in [(136,), (84, 230, 60), (164, 190, 50)]:
        items.append(('圓周角對另一段弧（例 5）', B.other_arc(*args)))
    for args in [(40,), (55, 225, 90), (28, 255, 100)]:
        items.append(('圓周角與等腰三角形', B.isosceles(*args)))
    for args in [(1, 3, 5), (2, 5, 5), (5, 6, 7)]:
        items.append(('三點分圓周：比例求圓周角', B.ratio(*args)))
    for args in [(50, 110), (76, 64, 200, 55), (44, 96, 205, 65)]:
        items.append(('所對的弧拆成兩段相加', C.split_sum(*args)))
    for args in [(110, 80), (96, 52, 150), (88, 100, 160)]:
        items.append(('由圓周角反求一段弧', C.split_back(*args)))
    for args in [(8, 3, 6), (12, 5, 9), (10, 4, 7)]:
        items.append(('等分點：先算一格幾度', C.equal_parts(*args)))
    for args in [(32,), (44, 290), (63, 300)]:
        items.append(('直徑＋同弧所對的圓周角', C.diam_same_arc(*args)))
    for args in [(90, 55), (130, 45), (70, 80)]:
        items.append(('平行弦截等弧：求另一段弧', C.par_fourth(*args)))
    for args in [(30, 80), (45, 60), (20, 120)]:
        items.append(('平行弦：內錯角再用圓周角', C.par_angle(*args)))
    for args in [(70, 90, 110), (100, 60, 80), (50, 130, 100)]:
        items.append(('四段弧：所對的弧是兩段的和', C.four_arcs(*args)))
    for args in [(240,), (170, 90), (130, 100)]:
        items.append(('由弧的度數求內角', D.from_arc(*args)))
    for args in [(150,), (100, 90), (124, 100)]:
        items.append(('由圓心角求對角', D.from_central(*args)))
    for args in [(2, 7), (5, 4), (3, 7, 70)]:
        items.append(('對角的比', D.ratio(*args)))
    for args in [(35, 45), (50, 30, 95), (28, 62, 90)]:
        items.append(('對角線分角後用對角互補', D.diagonal(*args)))
    for args in [(90, 70), (60, 110, 85), (100, 84, 90)]:
        items.append(('由兩段弧求外角', D.arc_exterior(*args)))
    return items


# ───────── 分析題 ─────────
def analysis(stem, options, explanation, hint, reason=None, figure=None):
    return dict(kind='analysis', stem=stem, options=options, reason=reason, explanation=explanation, hint=hint, figure=figure)


def check_analysis(v, where):
    for part, opts in (('選項', v['options']), ('理由', v['reason'])):
        if opts is None:
            continue
        texts = [o[0] for o in opts]
        assert 3 <= len(texts) <= 4 and len(set(texts)) == len(texts), f'{where}：{part}要有 3–4 個不同的 {texts}'
        truth = [bool(o[1]) for o in opts]
        assert truth == [True] + [False] * (len(opts) - 1), f'{where}：{part}的正確答案必須剛好一個而且排第一（{truth}）'
    assert v['hint'] and v['explanation'] and v.get('figure')


def analysis_json(v):
    out = dict(stem=v['stem'], **({'figure': v['figure']} if v.get('figure') else {}), options=[o[0] for o in v['options']], answer=0, explanation=v['explanation'], hint=v['hint'])
    if v['reason']:
        out['reason'] = dict(options=[o[0] for o in v['reason']], answer=0)
    return out


def wrong_other_arc(m, a0=210, bdeg=60):
    """小安：D 在較短的弧上，還是用 ∠AOC÷2。"""
    f = fig(B.other_arc(m, a0, bdeg))
    stem = (rf'圓 $O$ 中 $\angle AOC={m}^\circ$，$D$ 在較短的 {A_("AC")} 上。小安求 $\angle ADC$：' + '\n'
            + rf'① {A_("AC")}（較短的弧）$={m}^\circ$' + '\n'
            + rf'② $\angle ADC$ 對 {A_("AC")}' + '\n'
            + rf'③ $\angle ADC={m}^\circ\div2={R(m, 2)}^\circ$' + '\n'
            + '哪一步開始錯了？')
    opts = [
        (rf'第②步錯：$\angle ADC$ 對的是 {A_("ABC")} $={360 - m}^\circ$，$\angle ADC={R(360 - m, 2)}^\circ$', True),
        (rf'第①步錯：{A_("AC")} 應該是 ${R(m, 2)}^\circ$', False),
        (rf'第③步錯：應該是 ${m}^\circ\times2={2 * m}^\circ$', False),
        ('三步都對', False),
    ]
    return analysis(stem, opts,
                    rf'圓周角對的是兩邊之間、不含頂點的那一段弧。$D$ 在較短的弧上，所以 $\angle ADC$ 對 {A_("ABC")} $={360 - m}^\circ$，$\angle ADC={R(360 - m, 2)}^\circ$。',
                    '角的頂點在哪一段弧上？它對的是另一段。', figure=f)


def wrong_concentric(r1, r2, a):
    f = fig(A.concentric_stmt(r1, r2, a))
    L1, L2 = 2 * pi * r1 * R(a, 360), 2 * pi * r2 * R(a, 360)
    stem = (rf'兩同心圓半徑 ${r1}$、${r2}$，$\angle AOB=\angle COD={a}^\circ$。小華求 {A_("CD")} 的長度：' + '\n'
            + rf'① 兩弧的度數都是 ${a}^\circ$' + '\n'
            + rf'② 度數相等，所以長度也相等' + '\n'
            + rf'③ {A_("CD")} $=$ {A_("AB")} $={etex(L1)}$' + '\n'
            + '哪一步開始錯了？')
    opts = [
        (rf'第②步錯：半徑不同，長度不相等；{A_("CD")} $={etex(L2)}$', True),
        (rf'第①步錯：{A_("CD")} 的度數是 ${R(a * r2, r1)}^\circ$', False),
        (rf'第③步錯：{A_("AB")} 的長度應該是 ${etex(L2)}$', False),
        ('三步都對', False),
    ]
    return analysis(stem, opts,
                    rf'度數只看圓心角，兩弧都是 ${a}^\circ$；長度還要看半徑：{A_("CD")} $=2\pi\times{r2}\times\dfrac{{{a}}}{{360}}={etex(L2)}$。只有同圓或等圓，度數相等才長度相等。',
                    '「度數相等⇒長度相等」需要什麼條件？', figure=f)


def wrong_parallel(u, s):
    c, *_ = C.par_fig(u, s)
    cd = 360 - u - 2 * s
    assert cd != u
    stem = (rf'圓上兩弦 $\overline{{AB}}\parallel\overline{{CD}}$，{A_("AB")} $={u}^\circ$，{A_("AC")} $={s}^\circ$。小華求 {A_("CD")}：' + '\n'
            + rf'① 平行弦所截的弧相等：{A_("BD")} $={s}^\circ$' + '\n'
            + rf'② 兩弦平行，所以 {A_("CD")} $=$ {A_("AB")} $={u}^\circ$' + '\n'
            + '哪一步開始錯了？')
    opts = [
        (rf'第②步錯：{A_("CD")} $=360^\circ-{u}^\circ-{s}^\circ-{s}^\circ={cd}^\circ$', True),
        (rf'第①步錯：{A_("BD")} 應該是 ${u}^\circ$', False),
        (rf'第②步錯：{A_("CD")} $=$ {A_("AC")} $={s}^\circ$', False),
        ('兩步都對', False),
    ]
    return analysis(stem, opts,
                    rf'平行弦相等的是夾在兩弦之間的兩段弧（{A_("AC")}、{A_("BD")}），不是兩弦各自的弧。{A_("CD")} $=360^\circ-{u}^\circ-2\times{s}^\circ={cd}^\circ$。',
                    '兩弦平行時，是哪兩段弧相等？', figure=c.svg())


def wrong_cyclic(a, b=95):
    f = fig(D.opposite(a, b))
    stem = (rf'四邊形 $ABCD$ 是圓內接四邊形，$\angle A={a}^\circ$。小明求 $\angle C$：' + '\n'
            + rf'① $\angle A$ 對 {A_("BCD")}，$\angle C$ 對 {A_("BAD")}' + '\n'
            + rf'② 對角相等，所以 $\angle C={a}^\circ$' + '\n'
            + '哪一步開始錯了？')
    opts = [
        (rf'第②步錯：兩段弧合起來是 $360^\circ$，對角互補，$\angle C={180 - a}^\circ$', True),
        (rf'第①步錯：$\angle A$ 對 {A_("BAD")}', False),
        (rf'第②步錯：$\angle C=2\times{a}^\circ={2 * a}^\circ$', False),
        ('兩步都對', False),
    ]
    return analysis(stem, opts,
                    rf'{A_("BCD")} $+$ {A_("BAD")} $=360^\circ$，所以 $\angle A+\angle C=180^\circ$，$\angle C={180 - a}^\circ$。對角相等是平行四邊形的性質，圓內接四邊形不一定。',
                    '∠A、∠C 所對的兩段弧合起來是多少度？', figure=f)


def judge_semicircle(t1, t2):
    """AB 直徑，C、D 在兩側：∠ACB 與 ∠ADB 比較。"""
    from arcfig import Circ
    c = Circ(oat=(0.3, 1))
    A_p, B_p = c.p('A', 180), c.p('B', 0)
    C_p, D_p = c.p('C', 2 * t1), c.p('D', 360 - 2 * t2)
    c.seg(A_p, B_p)
    for p in (C_p, D_p):
        c.seg(p, A_p)
        c.seg(p, B_p)
    c.angle(A_p, B_p, C_p, lab(t1), r=26)
    c.angle(A_p, B_p, D_p, lab(t2), r=34)
    stem = rf'如圖，$\overline{{AB}}$ 是圓 $O$ 的直徑，$\angle CAB={t1}^\circ$、$\angle DAB={t2}^\circ$。$\angle ACB$ 和 $\angle ADB$ 哪一個比較大？'
    opts = [('一樣大', True), (r'$\angle ACB$ 比較大', False), (r'$\angle ADB$ 比較大', False)]
    reason = [
        ('兩個角都對半圓，都是 $90^\\circ$', True),
        (rf'$\angle CAB$ 比較{"小" if t1 < t2 else "大"}，所以 $\angle ACB$ 比較{"大" if t1 < t2 else "小"}', False),
        ('兩個角互補，所以一定不相等', False),
    ]
    return analysis(stem, opts,
                    rf'直徑所對的圓周角是直角：$\angle ACB=\angle ADB=90^\circ$。和 $\angle CAB$、$\angle DAB$ 的大小無關（$\angle ABC={90 - t1}^\circ$、$\angle ABD={90 - t2}^\circ$ 才不同）。',
                    'AB 是直徑，∠ACB 和 ∠ADB 對的是哪一段弧？', reason=reason, figure=c.svg())


def judge_central(m, b=230, a=95):
    c, *_ = B.insc(m, b, a, arc_lab=lab(m), radii=True)
    stem = rf'如圖，圓 $O$ 中 {A_("BC")} $={m}^\circ$，$A$ 在優弧上。$\angle BAC$ 和 $\angle BOC$ 的關係是？'
    opts = [(r'$\angle BOC=2\angle BAC$', True), (r'$\angle BOC=\angle BAC$', False), (r'$\angle BAC=2\angle BOC$', False)]
    reason = [
        (rf'圓心角等於弧的度數 ${m}^\circ$，圓周角是弧的一半 ${R(m, 2)}^\circ$', True),
        ('兩個角對同一段弧，所以相等', False),
        ('$A$ 離弧比較遠，所以角比較大', False),
    ]
    return analysis(stem, opts,
                    rf'$\angle BOC={m}^\circ$、$\angle BAC={R(m, 2)}^\circ$：同弧所對的圓心角是圓周角的 $2$ 倍。「同弧相等」說的是兩個圓周角。',
                    '圓心角、圓周角和弧的度數各是什麼關係？', reason=reason, figure=c.svg())


ANALYSIS = [
    ('找錯：圓周角對另一段弧', [wrong_other_arc(130), wrong_other_arc(100, 220, 70), wrong_other_arc(150, 195, 50)]),
    ('找錯：度數相等不代表弧長相等', [wrong_concentric(6, 9, 120), wrong_concentric(6, 10, 90), wrong_concentric(5, 8, 135)]),
    ('找錯：平行弦截的是哪兩段弧', [wrong_parallel(100, 50), wrong_parallel(80, 70), wrong_parallel(110, 40)]),
    ('找錯：圓內接四邊形對角', [wrong_cyclic(70), wrong_cyclic(104, 80), wrong_cyclic(83, 100)]),
    ('判斷＋理由：直徑所對的兩個角', [judge_semicircle(30, 50), judge_semicircle(55, 25), judge_semicircle(40, 65)]),
    ('判斷＋理由：圓心角與圓周角', [judge_central(100), judge_central(76, 245, 100), judge_central(130, 205, 80)]),
]


def main():
    pools = {'attack': [], 'shield': [], 'ultimate': [], 'analysis': []}
    used = {}
    for lesson, kinds in FROM_LESSONS.items():
        slots = {s['id']: s for s in LESSON_MOD[lesson].SLOTS}
        for kind, ids in kinds.items():
            for sid in ids:
                assert (lesson, sid) not in used, f'{lesson}-{sid} 分配到兩類'
                used[(lesson, sid)] = kind
                s = slots[sid]
                for k, v in enumerate(s['variants'], 1):
                    where = f'{lesson}-{sid}-{k}'
                    check_item(v, where)
                    pools[kind].append(dict(id=where, topic=s['topic'], **item_json(v)))
        assert len(kinds['attack'] + kinds['shield'] + kinds['ultimate']) == len(slots) == 10, f'{lesson}：每個題位都要分配'
    # 與 content/quizzes 一致（每一題都要在題庫裡，而且內容相同）
    for lesson in FROM_LESSONS:
        bank = json.loads((ROOT / 'content/quizzes' / f'{lesson}.json').read_text(encoding='utf8'))
        for s in bank['slots']:
            for k, v in enumerate(s['variants'], 1):
                mine = next((x for p in pools.values() for x in p if x['id'] == f"{lesson}-{s['id']}-{k}"), None)
                assert mine, f"{lesson}-{s['id']}-{k} 沒有放進魔王戰"
                assert {kk: mine[kk] for kk in v} == v, f"{lesson}-{s['id']}-{k} 和 content/quizzes 的題目不一樣"

    NEW = {'attack': new_attack(), 'shield': new_shield(), 'ultimate': new_ultimate()}
    for kind, items in NEW.items():
        for i, (topic, v) in enumerate(items, 1):
            where = f'new-{kind}-{topic}-{i}'
            check_item(v, where)
            assert v.get('figure'), f'{where}：幾何題要附圖'
            pools[kind].append(dict(id=where, topic=topic, **item_json(v)))

    for topic, items in ANALYSIS:
        for k, v in enumerate(items, 1):
            where = f'new-analysis-{topic}-{k}'
            check_analysis(v, where)
            pools['analysis'].append(dict(id=where, topic=topic, **analysis_json(v)))

    ids = [x['id'] for p in pools.values() for x in p]
    assert len(ids) == len(set(ids)), '題目 ID 重複'
    keys = [(x['stem'], tuple(x['options'])) for p in pools.values() for x in p]
    dup = {k for k in keys if keys.count(k) > 1}
    assert not dup, f'重複的題目：{list(dup)[:3]}'
    for kind in ('attack', 'shield', 'ultimate'):
        assert len(pools[kind]) >= 10, f'{kind} 題數不足'
    assert len(pools['analysis']) >= 4

    out = dict(
        hostLesson='g9-2-2d',
        title='2-2 圓心角、圓周角與弧：魔王戰',
        section='2-2',
        source='九年級 2-2(1)～(4) 課後檢核題（依類型分配）＋新增換數字題、綜合應用題與分析題（自編）；範圍含 2-1 弧長與切線；答案已用 SymPy 核算',
        pools=pools,
    )
    path = ROOT / 'content/raids' / 'g9-2-2d.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print('✓ 2-2 魔王戰題庫：' + '、'.join(f'{k} {len(v)} 題' for k, v in pools.items()) + f' → {path.name}（全部核算通過）')


if __name__ == '__main__':
    main()
