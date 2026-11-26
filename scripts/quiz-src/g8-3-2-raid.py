r"""3-2 利用十字交乘法因式分解：魔王戰題庫（三類題目＋分析題，全部用 SymPy 核算）。

用法：C:\AI\H3\venv\Scripts\python.exe -B -X utf8 scripts/quiz-src/g8-3-2-raid.py
掛在這一節最後一堂（3-2(4)）後面，放在 g8-3-2d 的最後。
範圍：3-2(1)～(4) 全部（二次項係數為 1、常數項為正／負，二次項係數不為 1，先提公因數、首項為負、十字交乘與乘法公式），
加上先備 3-1（提公因式、乘法公式、因式與倍式）；不用 p.137 補給站的代換法、不用後面的單元（一元二次方程式）。
三類題目（學生自己選要做哪一類）：
- attack（記憶）：普通攻擊。一步就能完成：已知一個因式填另一個常數、十字的交叉相乘、展開的一次項、提出負號。
- shield（理解）：防護罩。判斷兩數的正負、哪一組十字合、哪一個分解正確、其他正確寫法、能不能分解、因式。
- ultimate（應用）：大招。完整的因式分解（含先提公因數、首項為負、完全平方）、會考題型、先分解再代入求值、k 有幾個可能。
- analysis（分析）：破盾題。找錯步驟（6 種錯誤 × 3 組數字），其中一種是判斷＋理由。
題庫＝四堂課後檢核題（依類型分配）＋新增換數字題、應用題與分析題。
題目 ID 一律是「課程 id-題位-第幾題」（新增的從第 4 題起編），學習紀錄直接對到回家作業的題型。
"""
import importlib.util
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import expand  # noqa: E402

from crossfac import F, cross_line, explain, mx, sg  # noqa: E402
from fac import ident, npick, pt, x  # noqa: E402
from quizlib import ROOT, check_item, item_json, statement, value  # noqa: E402

HERE = Path(__file__).parent


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), HERE / f'{name}.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


A, B, C, D = load('g8-3-2a'), load('g8-3-2b'), load('g8-3-2c'), load('g8-3-2d')
LESSON_MOD = {'g8-3-2a': A, 'g8-3-2b': B, 'g8-3-2c': C, 'g8-3-2d': D}

# 課後檢核依類型分配（記憶／理解／應用）；每個題位剛好出現在一類
FROM_LESSONS = {
    'g8-3-2a': {'attack': ['q1', 'q6', 'q8'], 'shield': ['q2', 'q5', 'q7', 'q9', 'q10'], 'ultimate': ['q3', 'q4']},
    'g8-3-2b': {'attack': ['q4', 'q8'], 'shield': ['q3', 'q5', 'q6', 'q7', 'q10'], 'ultimate': ['q1', 'q2', 'q9']},
    'g8-3-2c': {'attack': ['q7'], 'shield': ['q1', 'q2', 'q6', 'q9', 'q10'], 'ultimate': ['q3', 'q4', 'q5', 'q8']},
    'g8-3-2d': {'attack': ['q9'], 'shield': ['q5', 'q8'], 'ultimate': ['q1', 'q2', 'q3', 'q4', 'q6', 'q7', 'q10']},
}

_next = defaultdict(lambda: 4)


def nid(lesson, sid):
    """新增題目的 ID：同一個題位從第 4 題起編（第 1～3 題是課後檢核）。"""
    n = _next[(lesson, sid)]
    _next[(lesson, sid)] += 1
    return f'{lesson}-{sid}-{n}'


def topic_of(lesson, sid):
    return next(s['topic'] for s in LESSON_MOD[lesson].SLOTS if s['id'] == sid)


def new(lesson, sid, item, topic=None):
    return (nid(lesson, sid), topic or topic_of(lesson, sid), item)


# ───────── 新增：攻擊（一步完成） ─────────
def new_attack():
    a, b, c, d = 'g8-3-2a', 'g8-3-2b', 'g8-3-2c', 'g8-3-2d'
    items = []
    items += [new(a, 'q1', A.expand_mid(*t)) for t in [(5, 7), (-2, -11), (1, 14)]]
    items += [new(a, 'q6', A.cross_value(*t)) for t in [(2, 11), (-3, -13), (6, 6)]]
    items += [new(a, 'q8', A.other_box(*t)) for t in [(2, 13), (-4, -11), (3, 10)]]
    items += [new(b, 'q4', B.cross_value(*t)) for t in [(13, -3), (-8, 2), (11, -5)]]
    items += [new(b, 'q8', B.other_box(*t)) for t in [(-4, 11), (6, -11), (-8, 7)]]
    items += [new(c, 'q7', C.other_box(*t)) for t in [(2, 5, 1, -3), (3, -1, 1, 5), (5, -2, 1, 1)]]
    items += [new(d, 'q9', D.pull_minus(P)) for P in [-5 * x**2 + 2 * x + 3, -2 * x**2 - 7 * x + 4, -6 * x**2 + x + 1]]
    return items


# ───────── 新增：防護罩（理解） ─────────
def new_shield():
    a, b, c, d = 'g8-3-2a', 'g8-3-2b', 'g8-3-2c', 'g8-3-2d'
    items = []
    items += [new(a, 'q5', A.sign_rule(*t)) for t in [(-4, -13), (6, 9), (-1, -12)]]
    items += [new(a, 'q7', A.which_cross(-5, -6, [(-2, -15), (-3, -10), (5, 6)])),
              new(a, 'q7', A.which_cross(1, 15, [(3, 5), (-1, -15), (-3, -5)])),
              new(a, 'q7', A.which_cross(-2, -15, [(-3, -10), (-1, -30), (2, 15)]))]
    items += [new(a, 'q10', A.which_factorable((2, 15), [x**2 + 8 * x + 14, x**2 + 8 * x + 13, x**2 + 6 * x + 7])),
              new(a, 'q10', A.which_factorable((-2, -13), [x**2 - 10 * x + 18, x**2 - 10 * x + 15, x**2 + 3 * x + 4]))]
    items += [new(b, 'q3', B.abs_rule(*t)) for t in [(12, -5), (-10, 4), (-12, 5)]]
    items += [new(b, 'q6', B.neg_x(*t)) for t in [(8, -1), (-7, 1)]]
    items += [new(b, 'q7', B.which_cross(-8, 9, [(8, -9), (-12, 6), (-24, 3)])),
              new(b, 'q7', B.which_cross(13, -2, [(-13, 2), (26, -1), (-26, 1)]))]
    items += [new(c, 'q6', C.which_cross(1, 2, 3, -5, [(1, 2, -5, 3), (1, 2, 5, -3), (1, 2, -3, 5)])),
              new(c, 'q6', C.which_cross(2, 3, 1, -5, [(2, 3, -5, 1), (2, 3, -1, 5), (1, 6, 1, -5)]))]
    items += [new(c, 'q10', C.factor_of(3, 4, 2, -1, [(3, -4), (2, 1), (1, 1)]))]
    # 展開的一次項、交叉相乘的和（二次項係數不為 1）要算兩個乘積再相加，不只一步：放防護罩
    items += [new(c, 'q1', C.mid_coef(*t)) for t in [(2, -1, 1, 5), (3, 5, 1, -2), (5, 2, 1, 1)]]
    items += [new(c, 'q2', C.cross_value(*t)) for t in [(3, 1, 2, -5), (2, 5, -1, 1), (4, 1, 1, -7)]]
    items += [new(d, 'q5', D.also_right(2, 1, 11, 1, -3, (1, (2, 22), (1, -3)), [(1, (2, -22), (1, 3)), (2, (1, 11), (1, 3)), (2, (1, -11), (1, -3))])),
              new(d, 'q5', D.also_right(-1, 3, -2, 1, 3, (1, (3, -2), (-1, -3)), [(1, (-3, -2), (1, 3)), (-1, (3, 2), (1, -3)), (1, (3, -2), (1, 3))]))]
    return items


# ───────── 新增：大招（應用） ─────────
def value_at(xv, k, m, p, n, q):
    """先因式分解再代入求值：k(m x＋p)(n x＋q)，代入的數讓兩個因式是整十、整百。"""
    P = expand(k * (m * x + p) * (n * x + q))
    f1, f2 = m * xv + p, n * xv + q
    v = k * f1 * f2
    assert P.subs(x, xv) == v
    tex, _ = F(k, (m, p), (n, q))
    return value(
        rf'當 $x={xv}$ 時，${pt(P)}$ 的值是多少？（先因式分解再代入）',
        v,
        npick(v, [v + 2 * xv, v - 2 * xv, f1 * f1, v + 100]),
        rf'${pt(P)}={tex}$，代入 $x={xv}$：' + (rf'${k}\times' if k != 1 else '$') + rf'{f1}\times{f2}={v}$。先分解，數字就變成好算的整數。')


def count_k(c):
    """x²＋kx＋c 可以分解成兩個整係數一次式：整數 k 有幾個可能的值。"""
    ks = sorted({u + c // u for u in range(-abs(c), abs(c) + 1) if u and c % u == 0})
    n = len(ks)
    pairs = sorted({tuple(sorted((u, c // u))) for u in range(-abs(c), abs(c) + 1) if u and c % u == 0})
    return value(
        rf'若 $x^2+kx{"+" if c > 0 else ""}{c}$ 可以分解成兩個整係數一次式的乘積，整數 $k$ 有幾個可能的值？',
        n,
        npick(n, [n // 2, n + 2, n - 1, 2 * n]),
        rf'右欄兩數相乘要是 ${c}$：' + '、'.join(rf'${u}$ 和 ${v}$' for u, v in pairs)
        + rf'，$k$ 是兩數的和：' + '、'.join(f'${k}$' for k in ks) + rf'，共 ${n}$ 個。')


def factor_sum(m, p, n, q, wrongs):
    """分解成兩個一次因式後，兩個因式的和。"""
    P = expand((m * x + p) * (n * x + q))
    s = expand((m * x + p) + (n * x + q))
    opts = [(f'${pt(s)}$', s, s)] + [(f'${pt(w)}$', w, s) for w in wrongs]
    return statement(
        rf'${pt(P)}$ 可以分解成兩個整係數一次因式（$x$ 的係數都是正的），這兩個因式的和是？',
        opts,
        explain(P, 1, m, n, p, q) + rf'兩個因式的和：$({pt(m * x + p)})+({pt(n * x + q)})={pt(s)}$。')


def new_ultimate():
    a, b, c, d = 'g8-3-2a', 'g8-3-2b', 'g8-3-2c', 'g8-3-2d'
    items = []
    items += [new(a, 'q4', A.factor_choice(-4, -10, [((1, -2), (1, -20)), ((1, 4), (1, 10)), ((1, -4), (1, 10))])),
              new(a, 'q3', A.factor_choice(6, 7, [((1, 3), (1, 14)), ((1, 2), (1, 21)), ((1, -6), (1, -7))]))]
    items += [new(b, 'q1', B.factor_choice(12, -3, [((1, -12), (1, 3)), ((1, 9), (1, -4)), ((1, 18), (1, -2))])),
              new(b, 'q2', B.factor_choice(-11, 4, [((1, 11), (1, -4)), ((1, -22), (1, 2)), ((1, -4), (1, -11))]))]
    items += [new(c, 'q3', C.factor_choice(5, 2, 1, 3, [((5, 3), (1, 2)), ((5, 1), (1, 6)), ((5, -2), (1, -3))])),
              new(c, 'q4', C.factor_choice(3, -4, 2, -1, [((3, -1), (2, -4)), ((6, -1), (1, -4)), ((3, 4), (2, 1))])),
              new(c, 'q5', C.factor_choice(4, 3, 1, -2, [((4, -3), (1, 2)), ((4, -2), (1, 3)), ((2, 3), (2, -2))]))]
    items += [new(c, 'q8', C.exam(15 * x**2 + 7 * x - 2, 3, 'a+b+c', lambda a_, b_, c_: a_ + b_ + c_, [4, 8, -6, 2], '(3x+2)(5x-1)')),
              new(c, 'q8', C.exam(12 * x**2 - x - 6, 3, 'a+2c', lambda a_, b_, c_: a_ + 2 * c_, [4, -1, 2, -8], '(3x+2)(4x-3)')),
              new(c, 'q8', C.exam(21 * x**2 + x - 10, 3, 'a+b+c', lambda a_, b_, c_: a_ + b_ + c_, [0, 14, -10, 6], '(3x-2)(7x+5)'))]
    items += [new(d, 'q1', D.choice(4, 1, -8, 1, 1, [(4, (1, 8), (1, -1)), (4, (1, -4), (1, 2)), (1, (4, -8), (1, 1))])),
              new(d, 'q2', D.choice(2, 3, 1, 1, -6, [(2, (3, -1), (1, 6)), (2, (3, -6), (1, 1)), (1, (3, 1), (1, -6))])),
              new(d, 'q3', D.choice(-1, 1, -5, 1, -7, [(-1, (1, 5), (1, 7)), (1, (1, -5), (1, -7)), (-1, (1, -1), (1, -35))])),
              new(d, 'q4', D.choice(-1, 3, -1, 2, 5, [(-1, (3, 1), (2, -5)), (1, (3, -1), (2, 5)), (-1, (3, 5), (2, -1))])),
              new(d, 'q6', D.choice(1, 5, -2, 5, -2, [(1, (5, 2), (5, 2)), (1, (25, -2), (1, -2)), (1, (5, -4), (5, -1))])),
              new(d, 'q10', D.coef_b(2, 1, -11, 1, 2)),
              new(d, 'q10', D.coef_b(-1, 2, 3, 1, -4))]
    # 先提公因數後填常數：要先提出公因數再除，放大招
    items += [new(d, 'q7', D.gcf_box(*t)) for t in [(3, 5, -1), (2, -5, -11), (6, 1, 4)]]
    items += [new(a, 'q3', value_at(98, 1, 1, 2, 1, 17), '先因式分解再代入求值'),
              new(b, 'q2', value_at(47, 1, 1, 3, 1, -17), '先因式分解再代入求值'),
              new(b, 'q1', value_at(51, 1, 1, -1, 1, 9), '先因式分解再代入求值'),
              new(d, 'q1', value_at(49, 2, 1, 1, 1, -9), '先因式分解再代入求值')]
    items += [new(a, 'q2', count_k(12), '可以分解時，一次項係數有幾種'),
              new(a, 'q2', count_k(18), '可以分解時，一次項係數有幾種'),
              new(b, 'q5', count_k(-10), '可以分解時，一次項係數有幾種')]
    items += [new(b, 'q2', factor_sum(1, -11, 1, 3, [2 * x + 8, 2 * x - 14, 2 * x + 14]), '分解後兩個因式的和'),
              new(c, 'q5', factor_sum(2, 3, 3, -1, [5 * x - 2, 5 * x + 4, 5 * x - 4]), '分解後兩個因式的和')]
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


def same(P, e):
    return expand(P - e) == 0


STEP = '①②③④'


def step_item(name, P, steps, hint):
    """找錯題：steps＝[(這一行的文字, 這一行是否成立, 說明)]，每一行的真假由呼叫端用 SymPy 算出。
    選項只有「第幾步開始錯」與「都對」，沒有理由文字（理由寫在詳解），學生一定要逐行檢查；
    同一類題的第一個錯誤分散在不同步驟（也有全對的）。"""
    first = next((i for i, (_, ok, _) in enumerate(steps) if not ok), None)
    n = len(steps)
    stem = f'{name}分解 ${pt(P)}$：' + '\n' + '\n'.join(f'{STEP[i]} {t}' for i, (t, _, _) in enumerate(steps)) + '\n' + '哪一步開始錯了？'
    texts = [f'第{STEP[i]}步開始錯' for i in range(n)] + ['三步都對' if n == 3 else '兩步都對']
    right = texts[first] if first is not None else texts[-1]
    opts = [(right, True)] + [(t, False) for t in texts if t != right]
    expl = '；'.join(f'{STEP[i]} {"對" if ok else "錯"}：{why}' for i, (_, ok, why) in enumerate(steps)) + '。'
    expl += '所以' + (f'從第{STEP[first]}步開始錯' if first is not None else ('三步都對' if n == 3 else '兩步都對')) + '。'
    return analysis(stem, opts, expl, hint)


def par_n(v):
    return f'({v})' if v < 0 else f'{v}'


def cross_trial(name, m, n, p, q, err):
    """十字交乘的試排；正確的十字是左欄 m x、n x，右欄 p、q。err：第幾步開始錯（1、2、3）。"""
    P = expand((m * x + p) * (n * x + q))
    a, b, c = m * n, m * q + n * p, p * q
    monic = m == n == 1
    lm, ln, rp, rq = m, n, p, q
    # ① 拆法
    if err == 1 and monic:
        rp = p + 1 if (p + 1) * q != c and p + 1 != 0 else p - 1
        s1 = (rf'常數項 ${c}={rp}\times{par_n(rq)}$', rp * rq == c, rf'${rp}\times{par_n(rq)}={rp * rq}$，不是 ${c}$')
    elif err == 1:
        ln = n + 1
        s1 = (rf'二次項 ${mx(a, "x^2")}={mx(lm)}\cdot {mx(ln)}$', lm * ln == a, rf'${mx(lm)}\cdot {mx(ln)}={mx(lm * ln, "x^2")}$，不是 ${mx(a, "x^2")}$')
    elif monic:
        s1 = (rf'常數項 ${c}={p}\times{par_n(q)}$', True, '兩數相乘等於常數項')
    else:
        s1 = (rf'二次項 ${mx(a, "x^2")}={mx(m)}\cdot {mx(n)}$', True, '左欄相乘等於二次項')
    # ② 十字與交叉相乘
    if err == 2:
        rp, rq = (q, p) if not monic or p == q else (-p, -q)
        if monic and rp * rq != c:
            rp, rq = q, p
        ws = lm * rq + ln * rp
        assert ws != b
        s2 = (rf'十字右欄放 ${sg(rp)}$、${sg(rq)}$，交叉相乘的和是 ${mx(b)}$', ws == b, rf'右欄放 ${sg(rp)}$、${sg(rq)}$ 時，交叉相乘是 ${mx(ws)}$，不是 ${mx(b)}$')
    else:
        ws = lm * rq + ln * rp
        s2 = (rf'十字右欄放 ${sg(rp)}$、${sg(rq)}$，交叉相乘的和是 ${mx(ws)}$', True, f'這個十字交叉相乘確實是 ${mx(ws)}$')
    # ③ 橫著讀出分解
    if err == 3:
        wtex, we = F(1, (lm, -rp), (ln, -rq))
        s3 = (rf'所以 ${pt(P)}={wtex}$', expand(we - P) == 0, rf'十字對了，但橫著讀時正負號寫反：${wtex}$ 展開是 ${pt(we)}$')
    else:
        tex, e = F(1, (lm, rp), (ln, rq))
        s3 = (rf'所以 ${pt(P)}={tex}$', expand(e - P) == 0, rf'${tex}$ 展開是 ${pt(e)}$' + ('，等於原式' if expand(e - P) == 0 else '，不等於原式'))
    steps = [s1, s2, s3]
    first = next(i for i, s in enumerate(steps) if not s[1])
    assert first == err - 1, (P, err, [s[1] for s in steps])
    item = step_item(name, P, steps, '逐行檢查：拆的兩數相乘對嗎？交叉相乘的和對嗎？橫著讀出的因式展開等於原式嗎？')
    item['explanation'] += rf'正確的分解：${pt(P)}={F(1, (m, p), (n, q))[0]}$。'
    return item


def gcf_steps(name, k, p, q, err):
    """先提公因數：① 提出 k ② 括號內十字交乘 ③ 寫回 k。err：0＝全對，2、3＝第幾步開始錯。"""
    P = expand(k * (x + p) * (x + q))
    inner = expand(P / k)
    s1 = (rf'$={k}({pt(inner)})$', expand(k * inner - P) == 0, f'三項都是 ${k}$ 的倍數，提出後乘回去等於原式')
    if err == 2:
        u, v = -p, -q
        s2 = (rf'${pt(inner)}={F(1, (1, u), (1, v))[0]}$', expand((x + u) * (x + v) - inner) == 0, rf'${F(1, (1, u), (1, v))[0]}$ 展開是 ${pt((x + u) * (x + v))}$，一次項的正負號不對')
        s3 = (rf'所以 ${pt(P)}={F(k, (1, u), (1, v))[0]}$', expand(k * (x + u) * (x + v) - P) == 0, '沿用了第②步的錯誤')
    else:
        s2 = (rf'${pt(inner)}={F(1, (1, p), (1, q))[0]}$', True, '括號內十字交乘正確')
        if err == 3:
            s3 = (rf'所以 ${pt(P)}={F(1, (1, p), (1, q))[0]}$', False, rf'提出來的 ${k}$ 不見了，${F(1, (1, p), (1, q))[0]}$ 展開是 ${pt(inner)}$')
        else:
            s3 = (rf'所以 ${pt(P)}={F(k, (1, p), (1, q))[0]}$', True, f'寫回 ${k}$，展開等於原式')
    steps = [s1, s2, s3]
    first = next((i for i, s in enumerate(steps) if not s[1]), None)
    assert (first is None and err == 0) or first == err - 1, (P, err, [s[1] for s in steps])
    item = step_item(name, P, steps, '逐一檢查每個等號的左右兩邊是否相等，再核對最後一行是否等於原式。')
    item['explanation'] += rf'正確的分解：${pt(P)}={F(k, (1, p), (1, q))[0]}$。'
    return item


def minus_steps(name, m, p, n, q, err):
    """首項為負：① 提出負號 ② 括號內十字交乘。原式 −(m x＋p)(n x＋q)。err：0＝全對，1、2＝第幾步開始錯。"""
    P = expand(-(m * x + p) * (n * x + q))
    N = expand(-P)
    c2, c1, c0 = [N.coeff(x, d) for d in (2, 1, 0)]
    if err == 1:
        W = c2 * x**2 - c1 * x + c0
        s1 = (rf'${pt(P)}=-({pt(W)})$', expand(-W - P) == 0, rf'把負號乘回去是 ${pt(-W)}$，一次項的正負號和原式不同')
        tex, e = F(-1, (m, -p), (n, -q))
        s2 = (rf'$={tex}$', expand(e + W) == 0, '括號內的分解和第①步的括號一致，但第①步已經錯了')
    else:
        s1 = (rf'${pt(P)}=-({pt(N)})$', True, '提出負號，括號內每一項都變號，乘回去等於原式')
        if err == 2:
            tex, e = F(-1, (m, q), (n, p))
            s2 = (rf'$={tex}$', expand(e - P) == 0, rf'右欄上下放反了：${tex}$ 展開是 ${pt(e)}$')
        else:
            tex, e = F(-1, (m, p), (n, q))
            s2 = (rf'$={tex}$', expand(e - P) == 0, f'十字 {cross_line(m, n, p, q)}，交叉相乘合')
    steps = [s1, s2]
    first = next((i for i, s in enumerate(steps) if not s[1]), None)
    assert (first is None and err == 0) or first == err - 1, (P, err, [s[1] for s in steps])
    item = step_item(name, P, steps, '把每一行展開或把負號乘回去，和原式比較。')
    item['explanation'] += rf'正確的分解：${pt(P)}={F(-1, (m, p), (n, q))[0]}$。'
    return item


def judge_forms(k, p, q, m2):
    """k(x＋p)(x＋q) 與 (k x＋k p)(x＋q)：兩種寫法都正確嗎？判斷＋理由。"""
    P = expand(k * (x + p) * (x + q))
    t1, e1 = F(k, (1, p), (1, q))
    t2, e2 = F(1, (k, k * p), (1, q))
    assert same(P, e1) and same(P, e2)
    stem = rf'${pt(P)}$ 的因式分解，小明寫 ${t1}$，小華寫 ${t2}$。誰的寫法正確？'
    opts = [('兩個人都正確', True), ('只有小明正確', False), ('只有小華正確', False)]
    reason = [
        ('兩個展開都等於原式，而且每個因式都不能再降次分解', True),
        (rf'${lin2(k, k * p)}$ 還能提出公因數 ${k}$，所以小華的不算因式分解', False),
        ('同一個多項式的因式分解只能有一種寫法', False),
    ]
    return analysis(stem, opts,
                    rf'展開：${t1}={pt(P)}$，${t2}={pt(P)}$。課本 p.134：$2(x-2)(x+4)$、$(2x-4)(x+4)$、$(x-2)(2x+8)$ 都是正確答案，因為每個因式都不能再降次分解。',
                    '因式分解的要求是什麼？把兩種寫法都展開檢查。',
                    reason=reason)


def lin2(m, c):
    from fac import lin
    return f'{lin(m, c)}'


ANALYSIS = [
    # 找錯題的答案分散在不同步驟（也有全對）：選項只有「第幾步開始錯／都對」，一定要逐行檢查
    ('g8-3-2a', 'q4', '找錯：十字交乘的步驟（常數項為正）', [cross_trial('小明', 1, 1, -4, -5, 2), cross_trial('小明', 1, 1, -3, -7, 3), cross_trial('小明', 1, 1, -7, -8, 1)]),
    ('g8-3-2b', 'q10', '找錯：十字交乘的步驟（常數項為負）', [cross_trial('小華', 1, 1, 2, -4, 2), cross_trial('小華', 1, 1, -13, 4, 3), cross_trial('小華', 1, 1, 5, -2, 1)]),
    ('g8-3-2c', 'q9', '找錯：十字交乘的步驟（二次項係數不為 1）', [cross_trial('小美', 3, 1, -2, 4, 2), cross_trial('小美', 2, 1, 1, 7, 3), cross_trial('小美', 5, 1, -3, 2, 1)]),
    ('g8-3-2d', 'q1', '找錯：先提公因數的分解步驟', [gcf_steps('小強', 2, -2, 4, 3), gcf_steps('小強', 3, 1, -11, 2), gcf_steps('小強', 5, -1, -3, 0)]),
    ('g8-3-2d', 'q9', '找錯：首項為負的分解步驟', [minus_steps('小安', 3, 2, 1, -7, 1), minus_steps('小安', 2, 7, 1, -1, 2), minus_steps('小安', 4, -1, 1, 2, 0)]),
    ('g8-3-2d', 'q5', '判斷＋理由：因式分解的寫法', [judge_forms(2, -3, 8, 0), judge_forms(3, 2, -4, 0), judge_forms(2, 1, 6, 0)]),
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
                mine = next((it for p in pools.values() for it in p if it['id'] == f"{lesson}-{s['id']}-{k}"), None)
                assert mine, f"{lesson}-{s['id']}-{k} 沒有放進魔王戰"
                assert {kk: mine[kk] for kk in v} == v, f"{lesson}-{s['id']}-{k} 和 content/quizzes 的題目不一樣"

    for kind, items in (('attack', new_attack()), ('shield', new_shield()), ('ultimate', new_ultimate())):
        for qid, topic, v in items:
            check_item(v, qid)
            pools[kind].append(dict(id=qid, topic=topic, **item_json(v)))

    for lesson, sid, topic, items in ANALYSIS:
        for v in items:
            qid = nid(lesson, sid)
            check_analysis(v, qid)
            pools['analysis'].append(dict(id=qid, topic=topic, **analysis_json(v)))

    ids = [it['id'] for p in pools.values() for it in p]
    assert len(ids) == len(set(ids)), '題目 ID 重複'
    keys = [(it['stem'], tuple(sorted(it['options']))) for p in pools.values() for it in p]
    dup = {k for k in keys if keys.count(k) > 1}
    assert not dup, f'重複的題目：{list(dup)[:3]}'
    # 近重複：同一個原式＋同一種問法（題幹完全一樣）只能出現一次
    stems = [it['stem'] for p in pools.values() for it in p]
    near = {s for s in stems if stems.count(s) > 1 and '下列哪一個因式分解正確' not in s and '下列哪一個可以分解' not in s}
    assert not near, f'題幹重複：{list(near)[:3]}'
    for kind in ('attack', 'shield', 'ultimate'):
        assert len(pools[kind]) >= 10, f'{kind} 題數不足'
    assert len(pools['analysis']) >= 4

    out = dict(
        hostLesson='g8-3-2d',
        title='3-2 十字交乘法：魔王戰',
        section='3-2',
        source='八年級 3-2(1)～(4) 課後檢核題（依類型分配）＋新增換數字題、綜合應用題與分析題（自編）；範圍含 3-1 提公因式與乘法公式；答案已用 SymPy 核算',
        pools=pools,
    )
    path = ROOT / 'content/raids' / 'g8-3-2d.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print('✓ 3-2 魔王戰題庫：' + '、'.join(f'{k} {len(v)} 題' for k, v in pools.items()) + f' → {path.name}（全部核算通過）')


if __name__ == '__main__':
    main()
