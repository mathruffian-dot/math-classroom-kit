r"""2-3 畢氏定理：魔王戰題庫（三類題目＋分析題，全部用 SymPy 核算）。

用法：C:\AI\H3\venv\Scripts\python.exe -B -X utf8 scripts/quiz-src/g8-2-3-raid.py
掛在這一節最後一堂（2-3(3)）後面，放在 g8-2-3c 的最後。
範圍：2-3(1)～(3) 全部，加上先備 2-1 平方根、2-2 根式的運算；不用後面章節（圓等）。
三類題目（學生自己選要做哪一類）：
- attack（記憶）：普通攻擊。一步就能算完的基本題（斜邊／股、距離公式、水平鉛垂）。
- shield（理解）：防護罩。判斷式子、找正確算法、辨認斜邊、公式選擇。
- ultimate（應用）：大招。多步驟、複合圖形、斜邊上的高、生活題、周長／坐標應用。
- analysis（分析）：破盾題。找錯步驟、判斷＋理由。
題庫＝三堂課後檢核題（依類型分配）＋新增換數字題與較難應用題／分析題。
"""
import importlib.util
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import Rational, sqrt  # noqa: E402

from quizlib import ROOT, _eq, check_item, form, item_json, raw, statement, value  # noqa: E402
from pyth import bad_root, root, rtex  # noqa: E402

R = Rational
S = sqrt
HERE = Path(__file__).parent


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), HERE / f'{name}.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


A, B, C = load('g8-2-3a'), load('g8-2-3b'), load('g8-2-3c')
LESSON_MOD = {'g8-2-3a': A, 'g8-2-3b': B, 'g8-2-3c': C}

# 課後檢核依類型分配（記憶／理解／應用）
FROM_LESSONS = {
    'g8-2-3a': {
        'attack': ['q4', 'q5', 'q6', 'q7'],
        'shield': ['q1', 'q2', 'q3', 'q8'],
        'ultimate': ['q9', 'q10'],
    },
    'g8-2-3b': {
        'attack': ['q6'],
        'shield': ['q5'],
        'ultimate': ['q1', 'q2', 'q3', 'q4', 'q7', 'q8', 'q9', 'q10'],
    },
    'g8-2-3c': {
        'attack': ['q1', 'q2', 'q5', 'q8'],
        'shield': ['q4', 'q7'],
        'ultimate': ['q3', 'q6', 'q9', 'q10'],
    },
}


def n(v):
    return raw(f'${v}$', v)


# ───────── 新增：攻擊（換數字） ─────────
def new_attack():
    items = []
    # 兩股求斜邊（整數／根式）
    for args in [(5, 12), (7, 24), (20, 21), (9, 40), (11, 60), (12, 35), (15, 20), (15, 36)]:
        items.append(('已知兩股求斜邊（整數）', A.hyp_int(*args)))
    for a, b, wrong in [
        (1, 7, n(50)),
        (2, 6, n(40)),
        (3, 6, n(45)),
        (4, 4, n(32)),
        (4, 8, n(80)),
        (5, 5, n(50)),
        (6, 9, n(117)),
        (8, 12, n(208)),
    ]:
        items.append(('已知兩股求斜邊（最簡根式）', A.hyp_rad(a, b, wrong)))
    for c, a in [(26, 10), (29, 20), (37, 12), (41, 9), (50, 14), (65, 16), (85, 13), (34, 16)]:
        items.append(('已知斜邊與一股求另一股（整數）', A.leg_int(c, a)))
    for c, a in [(8, 2), (10, 6), (11, 2), (13, 5), (15, 9), (17, 1)]:
        items.append(('已知斜邊與一股求另一股（最簡根式）', A.leg_rad(c, a)))
    for args in [(3, -7, 4), (5, -1, -2), (-8, 2, 0), (0, 9, -3), (-2, 6, 5), (4, -4, 1)]:
        items.append(('水平線上兩點的距離', C.horizontal(*args)))
    for args in [(1, -5, 3), (-2, 4, -6), (0, -8, 2), (5, -1, 7)]:
        items.append(('鉛垂線上兩點的距離', C.vertical(*args)))
    for args in [
        (5, 12, 'P', [n(13), n(7), n(17), n(169)]),
        (-9, 12, 'Q', [n(15), n(3), n(21), n(225)]),
        (8, -15, 'R', [n(17), n(7), n(23), n(289)]),
        (-7, -24, 'S', [n(25), n(17), n(31), n(625)]),
        (20, -21, 'T', [n(29), n(1), n(41), n(841)]),
        (9, -12, 'U', [n(15), n(3), n(21), n(225)]),
    ]:
        items.append(('一點到原點的距離', C.to_origin(*args)))
    return items


# ───────── 新增：防護罩 ─────────
def new_shield():
    items = []
    for args in [
        ('C', ('C', 'B', 'A'), 'bl', 'AB', ('BC', 'AC')),
        ('B', ('B', 'C', 'A'), 'br', 'AC', ('AB', 'BC')),
        ('A', ('A', 'B', 'C'), 'tl', 'BC', ('AB', 'AC')),
        ('C', ('C', 'A', 'B'), 'tr', 'AB', ('AC', 'BC')),
    ]:
        items.append(('辨認斜邊（直角的對邊）', A.which_hyp(*args)))
    for args in [
        ('C', ('C', 'A', 'B'), 'br', 'AC', 'BC', 'AB'),
        ('A', ('A', 'C', 'B'), 'tl', 'AC', 'AB', 'BC'),
        ('B', ('B', 'A', 'C'), 'tr', 'BA', 'BC', 'AC'),
    ]:
        items.append(('寫出畢氏定理的式子', A.which_eq(*args)))
    for args in [(36, 64), (4, 9), (1, 16), (49, 576)]:
        items.append(('三邊上正方形的面積', A.square_hyp(*args)))
    for args in [(36, 100), (16, 80), (9, 45)]:
        items.append(('三邊上正方形的面積', A.square_leg(*args)))
    for k in (1, 2, 3):
        items.append(('兩點距離公式', C.formula(k)))
    for k in (1, 2, 3):
        items.append(('斜邊上的高：面積的兩種算法', B.alt_formula(k)))
    # 找正確算法：已知 a,b 求 c，哪個式子對
    for a, b in [(6, 8), (5, 12), (9, 12), (7, 24)]:
        c2 = a * a + b * b
        stem = rf'直角三角形兩股為 ${a}$、${b}$，斜邊長是？哪一個算法正確？'
        opts = [
            (rf'$\sqrt{{{a}^2+{b}^2}}=\sqrt{{{c2}}}$', True),
            (rf'${a}+{b}={a + b}$', False),
            (rf'$\sqrt{{{a}+{b}}}=\sqrt{{{a + b}}}$', False),
            (rf'${a}^2+{b}^2={c2}$（忘記開根號）', False),
        ]
        items.append(('找出正確算法：兩股求斜邊', statement(stem, opts, rf'畢氏定理：$c=\sqrt{{a^2+b^2}}=\sqrt{{{c2}}}$' + (rf'$={int(c2**0.5)}$' if int(c2**0.5)**2 == c2 else '') + '。')))
    return items


# ───────── 新增：大招 ─────────
def new_ultimate():
    items = []
    for args in [(9, 12, 8), (8, 15, 9), (7, 24, 10), (20, 21, 12), (12, 16, 9), (5, 12, 9)]:
        items.append(('複合圖形：先求共用的斜邊', B.shared(*args)))
    for args in [(5, 12, 3), (4, 3, 2), (8, 15, 4), (9, 12, 5)]:
        items.append(('四邊形中的兩個直角三角形', B.kite(*args)))
    for a, b, wrong in [(8, 15, R(8)), (7, 24, R(7)), (20, 21, R(20)), (12, 16, R(12)), (9, 40, R(9)), (5, 12, R(5)), (9, 12, R(9))]:
        items.append(('斜邊上的高', B.altitude(a, b, wrong)))
    for args in [('2.5', '1.5'), ('3.9', '1.5'), ('5.2', '2'), ('6.5', '2.5')]:
        items.append(('竹竿靠牆的高度', B.pole(*args)))
    for args in [
        ('5', '4.8', '1.8'), ('6.5', '6', '0.8'), ('10', '9.6', '1.6'),
        ('5', '4.8', '0.8'), ('5', '4', '2.6'), ('6.5', '5.2', '1.9'),
        ('10', '9.6', '3.6'), ('10', '8', '5.2'), ('15', '9', '4.8'),
        ('25', '24', '4'), ('25', '20', '13'), ('17', '8', '5.4'),
    ]:
        items.append(('竹竿下滑：底端外移多少', B.slide(*args)))
    for args in [(9, 12, 25, 7), (8, 15, 25, 9), (6, 8, 15, 4), (20, 21, 40, 10), (12, 16, 30, 8), (9, 40, 50, 12), (6, 8, 14, 8), (8, 15, 20, 12)]:
        items.append(('杯中玻棒露出的長度', B.cup(*args)))
    for w, h, wrong in [
        (6, 3, root(27)), (8, 4, root(48)), (6, 2, root(32)),
        (4, 8, n(32)), (5, 5, n(25)), (9, 3, n(27)),
        (10, 5, n(50)), (12, 4, n(48)),
    ]:
        items.append(('長方形的對角線（最簡根式）', B.diagonal(w, h, wrong)))
    # square_mid 的比值選項文案只對偶數邊長正確（見 g8-2-3b.py）
    for side, ask in [(8, 'BD/DE'), (10, 'DE'), (12, 'DE/BD'), (4, 'BD/DE'), (6, 'DE'), (14, 'DE/BD'), (16, 'BD/DE')]:
        items.append(('正方形與中點：長度與比值', B.square_mid(side, ask)))
    # corner_tri：A 必須是直角頂（A、B 水平，A、C 鉛垂）
    for args in [
        ((-5, 2), (3, 2), (-5, 8)),
        ((0, -4), (6, -4), (0, 5)),
        ((-2, -1), (5, -1), (-2, 6)),
        ((1, 3), (-4, 3), (1, -2)),
        ((2, -5), (10, -5), (2, 1)),
    ]:
        items.append(('坐標平面上的直角三角形求斜邊', C.corner_tri(*args)))
    for args in [
        (((-4, 1), (2, 9)), [n(10), n(14), n(100), root(8)]),
        (((0, 0), (5, 12)), [n(13), n(17), n(169), root(17)]),
        (((-3, -4), (5, 2)), [n(10), n(14), n(100), root(40)]),
        (((1, -6), (-5, 2)), [n(10), n(14), root(28), n(2)]),
        (((8, -3), (-4, 2)), [n(13), n(17), root(29), n(7)]),
        (((-7, 1), (1, -5)), [n(10), n(14), root(20), n(2)]),
        (((2, 3), (7, 15)), [n(13), n(17), n(169), root(37)]),
        (((-1, 4), (8, -8)), [n(15), n(21), n(225), root(45)]),
    ]:
        (p, q), opts = args
        items.append(('用距離公式求兩點距離（整數／根式）', C.dist(p, q, opts=opts)))
    for args in [
        ((-4, 0), (2, 0), (2, 8), 21),
        ((-5, -2), (3, -2), (3, 4), 25),
        ((0, 0), (6, 0), (6, 8), 30),
        ((-3, 1), (5, 1), (5, 7), 18),
        ((1, -2), (7, -2), (7, 6), 20),
        ((-2, -3), (6, -3), (6, 3), 22),
    ]:
        items.append(('坐標平面上三角形的周長', C.perimeter(*args)))
    for args in [
        ((-4, -3), (4, -3), (4, 3), R(4)),
        ((-6, -2), (2, -2), (2, 4), R(6)),
        ((0, 0), (8, 0), (8, 6), R(8)),
        ((-3, -4), (5, -4), (5, 2), R(5)),
        ((-2, 1), (4, 1), (4, 9), R(6)),
    ]:
        items.append(('坐標平面上的斜邊上的高', C.plane_alt(*args)))
    for L, base in [(15, 9), (20, 12), (25, 7), (26, 10)]:
        items.append(('梯子靠牆的高度', A.ladder(L, base)))
    return items


# ───────── 分析題 ─────────
def analysis(stem, options, explanation, hint, reason=None):
    return dict(kind='analysis', stem=stem, options=options, reason=reason, explanation=explanation, hint=hint)


def check_analysis(v, where):
    for part, opts in (('選項', v['options']), ('理由', v['reason'])):
        if opts is None:
            continue
        texts = [o[0] for o in opts]
        assert 3 <= len(texts) <= 4 and len(set(texts)) == len(texts), f'{where}：{part}要有 3–4 個不同的 {texts}'
        truth = [bool(o[1]) for o in opts]
        assert truth == [True] + [False] * (len(opts) - 1), f'{where}：{part}的正確答案必須剛好一個而且排第一（{truth}）'
    assert v['hint'] and v['explanation']


def analysis_json(v):
    out = dict(stem=v['stem'], options=[o[0] for o in v['options']], answer=0, explanation=v['explanation'], hint=v['hint'])
    if v['reason']:
        out['reason'] = dict(options=[o[0] for o in v['reason']], answer=0)
    return out


def find_wrong_hyp(a, b):
    """找錯：兩股求斜邊，學生寫成 a＋b。"""
    c2 = a * a + b * b
    c = int(c2 ** 0.5) if int(c2 ** 0.5) ** 2 == c2 else None
    right = f'\\sqrt{{{c2}}}' if c is None else str(c)
    stem = (rf'小華求兩股為 ${a}$、${b}$ 的直角三角形斜邊，寫了：' + '\n'
            + rf'① $c^2={a}^2+{b}^2={c2}$' + '\n'
            + rf'② $c={a}+{b}={a + b}$' + '\n'
            + '哪一步開始錯了？')
    opts = [
        (rf'第②步錯：應該開根號，$c=\sqrt{{{c2}}}$' + (rf'$={c}$' if c else ''), True),
        (rf'第①步錯：應該是 ${a}^2-{b}^2$', False),
        (rf'第②步錯：應該是 $c={a}\times{b}={a * b}$', False),
        ('兩步都對', False),
    ]
    return analysis(stem, opts,
                    rf'畢氏定理求出 $c^2$ 後要開根號，不是把兩股相加。正確：$c=\sqrt{{{c2}}}$' + (rf'$={c}$' if c else '') + '。',
                    '看第②步：由平方得到長度時要開根號。')


def find_wrong_leg(c, a):
    """找錯：已知斜邊與一股，學生寫成 c－a。"""
    b2 = c * c - a * a
    stem = (rf'直角三角形斜邊 ${c}$、一股 ${a}$，小安求另一股：' + '\n'
            + rf'① 另一股$^2={c}^2-{a}^2={b2}$' + '\n'
            + rf'② 另一股 $={c}-{a}={c - a}$' + '\n'
            + '哪一步開始錯了？')
    opts = [
        (rf'第②步錯：應該開根號，另一股 $=\sqrt{{{b2}}}$', True),
        (rf'第①步錯：應該是 ${c}^2+{a}^2$', False),
        (rf'第②步錯：應該是另一股 $={c}+{a}$', False),
        ('兩步都對', False),
    ]
    return analysis(stem, opts,
                    rf'一樣要開根號：另一股 $=\sqrt{{{b2}}}$' + (rf'$={int(b2**0.5)}$' if int(b2**0.5)**2 == b2 else '') + '。',
                    '平方差算出來之後，長度要開根號。')


def find_wrong_dist(x1, y1, x2, y2):
    """找錯：距離公式，學生忘記平方。"""
    dx, dy = x2 - x1, y2 - y1
    wrong = abs(dx) + abs(dy)
    right2 = dx * dx + dy * dy
    stem = (rf'求 $A({x1},{y1})$、$B({x2},{y2})$ 的距離，小美寫了：' + '\n'
            + rf'① $\Delta x={dx}$，$\Delta y={dy}$' + '\n'
            + rf'② 距離 $=|{dx}|+|{dy}|={wrong}$' + '\n'
            + '哪一步開始錯了？')
    opts = [
        (rf'第②步錯：應該是 $\sqrt{{({dx})^2+({dy})^2}}=\sqrt{{{right2}}}$', True),
        (rf'第①步錯：$\Delta x$ 應該是 ${x1}-{x2}$', False),
        (rf'第②步錯：應該是 ${dx}\times{dy}$', False),
        ('兩步都對', False),
    ]
    return analysis(stem, opts,
                    rf'兩點距離是 $\sqrt{{(\Delta x)^2+(\Delta y)^2}}$，不是絕對值相加。',
                    '距離公式來自畢氏定理，兩股要先平方再相加再開根號。')


def judge_larger_hyp(a1, b1, a2, b2):
    """判斷：哪個斜邊比較長，並選理由。"""
    c1, c2 = S(a1 * a1 + b1 * b1), S(a2 * a2 + b2 * b2)
    left = c1 > c2
    stem = rf'兩個直角三角形：兩股 ${a1},{b1}$ 與兩股 ${a2},{b2}$。哪一個斜邊比較長？'
    opts = [
        (rf'第一個比較長（$\sqrt{{{a1*a1+b1*b1}}}>\sqrt{{{a2*a2+b2*b2}}}$）' if left else rf'第二個比較長（$\sqrt{{{a2*a2+b2*b2}}}>\sqrt{{{a1*a1+b1*b1}}}$）', True),
        ('一樣長', False),
        (rf'第二個比較長' if left else rf'第一個比較長', False),
        ('無法比較，要量過才知道', False),
    ]
    reason = [
        (rf'比 $a^2+b^2$：${a1*a1+b1*b1}$ 與 ${a2*a2+b2*b2}$，較大的斜邊較長', True),
        (rf'比兩股之和：${a1+b1}$ 與 ${a2+b2}$', False),
        (rf'比兩股之積', False),
    ]
    return analysis(stem, opts,
                    rf'斜邊長由 $a^2+b^2$ 決定，開根號後大小關係不變。',
                    '不用真的開根號，先比 $a^2+b^2$。',
                    reason=reason)


ANALYSIS = [
    ('找錯：兩股求斜邊開根號', [find_wrong_hyp(6, 8), find_wrong_hyp(5, 12), find_wrong_hyp(9, 12)]),
    ('找錯：求另一股開根號', [find_wrong_leg(13, 5), find_wrong_leg(25, 7), find_wrong_leg(17, 8)]),
    ('找錯：距離公式', [find_wrong_dist(1, 2, 4, 6), find_wrong_dist(-3, 1, 3, -7), find_wrong_dist(0, 0, 5, 12)]),
    ('判斷＋理由：誰的斜邊較長', [judge_larger_hyp(6, 8, 5, 12), judge_larger_hyp(9, 12, 8, 15), judge_larger_hyp(7, 24, 20, 21)]),
]


def main():
    pools = {'attack': [], 'shield': [], 'ultimate': [], 'analysis': []}
    topics = {}
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
    # 與 content/quizzes 一致
    for lesson in FROM_LESSONS:
        bank = json.loads((ROOT / 'content/quizzes' / f'{lesson}.json').read_text(encoding='utf8'))
        for s in bank['slots']:
            for k, v in enumerate(s['variants'], 1):
                mine = next((x for p in pools.values() for x in p if x['id'] == f"{lesson}-{s['id']}-{k}"), None)
                if mine:
                    assert {kk: mine[kk] for kk in v} == v, f"{lesson}-{s['id']}-{k} 和 content/quizzes 的題目不一樣"

    NEW = {
        'attack': new_attack(),
        'shield': new_shield(),
        'ultimate': new_ultimate(),
    }
    for kind, items in NEW.items():
        for i, (topic, v) in enumerate(items, 1):
            where = f'new-{kind}-{topic}-{i}'
            check_item(v, where)
            pools[kind].append(dict(id=where, topic=topic, **item_json(v)))

    for topic, items in ANALYSIS:
        for k, v in enumerate(items, 1):
            where = f'new-analysis-{topic}-{k}'
            check_analysis(v, where)
            pools['analysis'].append(dict(id=where, topic=topic, **analysis_json(v)))

    ids = [x['id'] for p in pools.values() for x in p]
    assert len(ids) == len(set(ids)), '題目 ID 重複'
    for kind in ('attack', 'shield', 'ultimate'):
        assert len(pools[kind]) >= 10, f'{kind} 題數不足'
    assert len(pools['analysis']) >= 4

    out = dict(
        hostLesson='g8-2-3c',
        title='2-3 畢氏定理：魔王戰',
        section='2-3',
        source='八年級 2-3(1)～(3) 課後檢核題（依類型分配）＋新增換數字題、綜合應用題與分析題（自編）；範圍含 2-1、2-2 根式；答案已用 SymPy 核算',
        pools=pools,
    )
    path = ROOT / 'content/raids' / 'g8-2-3c.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print('✓ 2-3 魔王戰題庫：' + '、'.join(f'{k} {len(v)} 題' for k, v in pools.items()) + f' → {path.name}（全部核算通過）')


if __name__ == '__main__':
    main()
