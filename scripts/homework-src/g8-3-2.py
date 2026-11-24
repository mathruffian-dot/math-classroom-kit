r"""八上 3-2 利用十字交乘法因式分解：回家作業手寫題庫（g8-3-2a～d），每個題位至少 5 題。

用法：python -X utf8 scripts/homework-src/g8-3-2.py
輸出：content/homework/g8-3-2a.json … g8-3-2d.json（格式見 docs/HOMEWORK.md）

題位和課後檢核題庫（content/quizzes/g8-3-2a..d.json）一一對應：同 id、同 topic。
課後檢核的選擇題改成手寫題（拿掉選項、改成「因式分解…」「求…」「寫出…」「說明…」），再補新題；
課本自我評量 p.138–139 第 2 題 (1)～(10) 分別放進對應的題位。範圍累積：3-2(1) 只用 3-1 與這一堂，依此類推。
代數題不用附圖。

核算（每一題都做）：
1. 題目的原式、答案、詳解都由同一組係數產生；每一個「＝」在產生時用 SymPy 核對（crossfac.explain、ident）。
2. 因式分解的答案：把答案的 LaTeX 另外解析成 SymPy，展開後必須等於題目的原式（answer_poly），
   而且每個因式的次數 ≤ 1（分解到底）。
3. 數值答案：答案的數必須等於另外用 SymPy 算出的值。
4. 「不能分解」的答案：SymPy factor_list 確認沒有整係數一次因式。
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / 'scripts/quiz-src'))

from sympy import expand, factor_list, rem  # noqa: E402
from sympy.parsing.sympy_parser import implicit_multiplication_application, parse_expr, standard_transformations  # noqa: E402

from crossfac import F, cross_line, explain, integer_factorable, int_solutions, mx, sg, sum_tex  # noqa: E402
from fac import ident, lin, pt, x  # noqa: E402

TR = standard_transformations + (implicit_multiplication_application,)
DIAG = re.compile(r'下列何者|下列哪|哪一個|哪一項|何者')
GUIDE = '備課用書 01-115國中數學2上-備課-目次(115f231509).pdf p.32–33（教學活動連結分析表 3-2：學習表現 a-IV-6，學習內容 A-8-4、A-8-5）'
CODES = {
    'a-IV-6': ('performance', '理解一元二次方程式及其解的意義，能以因式分解和配方法求解和驗算，並能運用到日常生活的情境解決問題。'),
    'A-8-4': ('content', '因式分解：因式的意義（限制在二次多項式的因式）；二次多項式的因式分解意義。'),
    'A-8-5': ('content', '因式分解的方法：提公因式法；利用乘法公式與十字交乘法因式分解。'),
}
P6 = ['a-IV-6']
C5 = ['A-8-5']
C45 = ['A-8-4', 'A-8-5']


def parse(tex):
    s = tex.replace('−', '-').replace('^', '**').replace(r'\cdot', '*').replace('$', '')
    return parse_expr(s, transformations=TR, local_dict={'x': x})


def answer_poly(tex, P):
    """答案的 LaTeX（例如 2(x-2)(x+4)、-(3x-1)(x-1)、(3x-4)^2）解析後等於原式，而且每個因式都是一次以下。"""
    e = parse(tex)
    assert expand(e - P) == 0, f'答案 {tex} 展開不等於 {P}'
    _, fl = factor_list(e)
    assert all(f.as_poly(x).degree() <= 1 for f, _ in fl), f'{tex} 沒有分解到底'


def V(stem, answer, solution, space=2, check=None):
    assert not DIAG.search(stem), f'像選擇題：{stem}'
    if check:
        check()
    return dict(stem=stem, answer=answer, solution=solution, space=space)


def Q(k, m, p, n, q):
    return expand(k * (m * x + p) * (n * x + q))


# ═════════ 共用題型 ═════════
def factor(k, m, p, n, q, lead='利用十字交乘法，因式分解', note=''):
    """因式分解 k(m x＋p)(n x＋q)。"""
    P = Q(k, m, p, n, q)
    tex, _ = F(k, (m, p), (n, q))
    return V(rf'{lead} ${pt(P)}$。', f'${tex}$', explain(P, k, m, n, p, q) + note, 2, lambda: answer_poly(tex, P))


def expand_q(m, p, n, q):
    P = Q(1, m, p, n, q)
    s = m * q + n * p
    return V(rf'展開 $({lin(m, p)})({lin(n, q)})$，並說明一次項是怎麼來的。', f'${pt(P)}$',
             rf'一次項是交叉相乘的和：${mx(m)}\cdot{"(" + str(q) + ")" if q < 0 else q}+{"(" + str(p) + ")" if p < 0 else p}\cdot {mx(n)}={mx(s)}$；常數項 ${p * q}$；所以 $({lin(m, p)})({lin(n, q)})={pt(P)}$。',
             1, lambda: ident(P, (m * x + p) * (n * x + q)))


def two_numbers(p, q):
    c, b = p * q, p + q
    pairs = {tuple(sorted((u, c // u))) for u in range(-abs(c), abs(c) + 1) if u and c % u == 0 and u + c // u == b}
    assert pairs == {tuple(sorted((p, q)))}
    lo, hi = sorted((p, q))
    return V(rf'找出兩個整數，相乘是 ${c}$、相加是 ${b}$。', f'${lo}$ 和 ${hi}$',
             rf'${c}$ 的整數拆法中，只有 ${lo}$ 和 ${hi}$ 相加是 ${b}$：${lo}\times{"(" + str(hi) + ")" if hi < 0 else hi}={c}$、${lo}+{"(" + str(hi) + ")" if hi < 0 else hi}={b}$。', 1)


def sign_q(p, q):
    """常數項為正：兩數同正或同負。"""
    P = Q(1, 1, p, 1, q)
    kind = '兩個負數' if p < 0 else '兩個正數'
    tex = F(1, (1, p), (1, q))[0]
    return V(rf'用十字交乘法分解 ${pt(P)}$ 時，常數項要拆成兩個正數還是兩個負數？說明理由，並寫出因式分解。',
             f'{kind}；${tex}$',
             rf'常數項 ${p * q}$ 是正的，兩數同號；一次項 ${mx(p + q)}$ 是{"負" if p < 0 else "正"}的，所以是{kind}。' + explain(P, 1, 1, 1, p, q),
             2, lambda: answer_poly(tex, P))


def abs_q(p, q):
    """常數項為負：誰的絕對值大。"""
    P = Q(1, 1, p, 1, q)
    pos, neg = max(p, q), min(p, q)
    big = '正數' if pos > -neg else '負數'
    tex = F(1, (1, p), (1, q))[0]
    return V(rf'分解 ${pt(P)}$ 時，常數項拆成一正一負。說明正數和負數誰的絕對值比較大，再寫出因式分解。',
             f'{big}的絕對值較大；${tex}$',
             rf'一次項 ${mx(p + q)}$ 是{"正" if p + q > 0 else "負"}的，所以{big}的絕對值較大。' + explain(P, 1, 1, 1, p, q),
             2, lambda: answer_poly(tex, P))


def cross_q(m, n, p, q):
    s = m * q + n * p
    P = Q(1, m, p, n, q)
    return V(rf'十字交乘時，{cross_line(m, n, p, q)}。寫出交叉相乘的和，以及這個十字代表的二次式。',
             f'${mx(s)}$；${pt(P)}$',
             rf'左上×右下＋左下×右上：${sum_tex(m, n, p, q)}$。兩欄橫著讀是 $({lin(m, p)})({lin(n, q)})={pt(P)}$。',
             1, lambda: ident(P, (m * x + p) * (n * x + q)))


def all_pairs(p, q):
    """常數項的所有拆法，找出合的那一組（二次項係數為 1）。"""
    P = Q(1, 1, p, 1, q)
    c, b = p * q, p + q
    pairs = sorted({tuple(sorted((u, c // u))) for u in range(-abs(c), abs(c) + 1) if u and c % u == 0})
    tex = F(1, (1, p), (1, q))[0]
    sums = '、'.join(rf'${u}$ 與 ${v}$（和 ${u + v}$）' for u, v in pairs)
    return V(rf'用十字交乘法分解 ${pt(P)}$：寫出右欄所有可能的整數組（相乘是 ${c}$），找出合的那一組，再寫出因式分解。',
             f'${tex}$',
             rf'相乘是 ${c}$ 的整數組：{sums}。和是 ${b}$ 的只有 ${min(p, q)}$ 與 ${max(p, q)}$，所以 ${pt(P)}={tex}$。',
             3, lambda: answer_poly(tex, P))


def other_factor(k, m, p, n, q):
    P = Q(k, m, p, n, q)
    known = lin(m, p)
    other = lin(n, q) if k == 1 else F(k, (n, q))[0]
    return V(rf'已知 ${known}$ 是 ${pt(P)}$ 的因式，求另一個因式。',
             f'${other}$',
             explain(P, k, m, n, p, q) + rf'所以另一個因式是 ${other}$。', 1,
             lambda: ident(P, (m * x + p) * k * (n * x + q)))


def fix_q(k, m, p, n, q, wrong, why):
    """錯誤分析：wrong＝(k, (m,p), (n,q)) 錯的寫法。"""
    P = Q(k, m, p, n, q)
    wtex, we = F(wrong[0], *wrong[1:])
    assert expand(we - P) != 0
    tex = F(k, (m, p), (n, q))[0]
    return V(rf'小明寫 ${pt(P)}={wtex}$。這個因式分解正確嗎？錯的話說明錯在哪裡，並寫出正確的分解。',
             f'不正確；${tex}$',
             rf'展開 ${wtex}={pt(we)}$，和原式不同。{why}' + explain(P, k, m, n, p, q), 2, lambda: answer_poly(tex, P))


def factorable_q(P, fac=None):
    """能不能分解成兩個整係數一次式；fac＝(p, q) 時能分解成 (x＋p)(x＋q)。"""
    c, b = P.coeff(x, 0), P.coeff(x, 1)
    if fac:
        tex = F(1, (1, fac[0]), (1, fac[1]))[0]
        return V(rf'${pt(P)}$ 能不能分解成兩個整係數一次式的乘積？能的話寫出因式分解，不能的話說明理由。', f'能；${tex}$',
                 explain(P, 1, 1, 1, *fac), 2, lambda: (answer_poly(tex, P), None))
    assert not integer_factorable(P)
    pairs = sorted({tuple(sorted((u, int(c) // u))) for u in range(-abs(int(c)), abs(int(c)) + 1) if u and c % u == 0})
    sums = '、'.join(f'${u + v}$' for u, v in pairs)
    return V(rf'${pt(P)}$ 能不能分解成兩個整係數一次式的乘積？能的話寫出因式分解，不能的話說明理由。', '不能',
             rf'相乘是 ${c}$ 的整數組相加只能是 {sums}，沒有一組等於 ${b}$，所以不能分解成兩個整係數一次式的乘積。', 2)


def negx_q(p, q):
    P = Q(1, 1, p, 1, q)
    tex = F(1, (1, p), (1, q))[0]
    neg = f'({mx(-1)}{sg(-p)})({mx(-1)}{sg(-q)})'
    return V(rf'小華把 ${pt(P)}$ 的十字左欄寫成 $-x$、$-x$，得到 ${neg}$。這個結果對嗎？把它化成左欄 $x$、$x$ 的寫法。',
             f'對；${neg}={tex}$',
             rf'${neg}=[-{F(1, (1, p))[0]}][-{F(1, (1, q))[0]}]={tex}$，兩個括號都提出負號，負負得正，和左欄寫 $x$、$x$ 的結果一樣。',
             2, lambda: (ident(P, (-x - p) * (-x - q)), answer_poly(tex, P)))


def trial_q(m, n, p, q, tries):
    """寫出試過的十字，找到合的那一組（二次項係數不為 1）。"""
    P = Q(1, m, p, n, q)
    tex = F(1, (m, p), (n, q))[0]
    lines = '；'.join(rf'{cross_line(*t)}：${sum_tex(*t)}$' for t in tries)
    return V(rf'用十字交乘法分解 ${pt(P)}$：寫出你試過的十字（至少兩組）與交叉相乘的和，找出合的那一組，再寫出因式分解。',
             f'${tex}$', rf'例如 {lines}。' + explain(P, 1, m, n, p, q), 3, lambda: answer_poly(tex, P))


def exam_q(P, k, ask_tex, ask, sol_tex, note=''):
    from sympy import symbols
    a_, b_, c_ = symbols('a b c')
    sols = int_solutions(P, (k * x + a_) * (b_ * x + c_), [a_, b_, c_], positive=(b_,))
    vals = {ask(s['a'], s['b'], s['c']) for s in sols}
    assert len(vals) == 1, (P, sols)
    v = vals.pop()
    s0 = sols[0]
    return V(rf'多項式 ${pt(P)}$ 可因式分解成 $({k}x+a)(bx+c)$，其中 $a$、$b$、$c$ 均為整數，求 ${ask_tex}$ 的值。{note}',
             f'${v}$', rf'${pt(P)}={sol_tex}$，所以 $a={s0["a"]}$、$b={s0["b"]}$、$c={s0["c"]}$，${ask_tex}={v}$。', 2,
             lambda: answer_poly(sol_tex, P))


def is_factor_q(P, f, fac):
    """判別 f 是不是 P 的因式；fac＝(k, m, p, n, q) 是 P 的分解。"""
    yes = rem(expand(P), expand(f), x) == 0
    tex = F(fac[0], (fac[1], fac[2]), (fac[3], fac[4]))[0]
    return V(rf'判別 ${pt(f)}$ 是不是 ${pt(P)}$ 的因式，並說明理由。', '是' if yes else '不是',
             explain(P, *fac[:2], fac[3], fac[2], fac[4]) + (rf'${pt(f)}$ 是其中一個因式（除以它餘式是 $0$）。' if yes else rf'兩個因式都不是 ${pt(f)}$，所以不是（除以它餘式不是 $0$）。'),
             2, lambda: answer_poly(tex, P))


def also_q(k, m, p, n, q, alt):
    P = Q(k, m, p, n, q)
    base = F(k, (m, p), (n, q))[0]
    alts = '、'.join(f'${F(1, *a)[0]}$' for a in alt)
    for a in alt:
        assert expand(F(1, *a)[1] - P) == 0
    return V(rf'${pt(P)}={base}$。把公因數 ${k}$ 乘進其中一個因式，寫出另一種正確的因式分解，並展開檢查。',
             f'{alts}（任一種）',
             rf'例如 {alts}：展開都等於 ${pt(P)}$，每個因式都不能再降次分解，所以都是正確答案（課本 p.134）。兩個因式交換順序也對；寫成其他等價的乘積，要看有沒有做到「把公因數乘進其中一個因式」。', 2)


def box_q(k, p, q):
    P = Q(k, 1, p, 1, q)
    return V(rf'已知 ${pt(P)}={k}({lin(1, p)})(x+\square)$，求 □ 裡的數。', f'${q}$',
             rf'先提出 ${k}$：${pt(P)}={k}({pt(expand(P / k))})$；右欄相乘要是 ${p * q}$，所以 □＝${q}$（交叉相乘 ${sum_tex(1, 1, p, q)}$，合）。', 1,
             lambda: ident(P, k * (x + p) * (x + q)))


def minus_q(k, m, p, n, q):
    """首項為負：先提出負號再分解（k＝−1）。"""
    P = Q(k, m, p, n, q)
    tex = F(k, (m, p), (n, q))[0]
    return V(rf'先把 ${pt(P)}$ 的負號提出來，寫成 $-(\quad)$ 的形式，再因式分解。', f'$-({pt(-P)})={tex}$',
             explain(P, k, m, n, p, q), 2, lambda: answer_poly(tex, P))


def coef_q(k, m, p, n, q):
    P = Q(k, m, p, n, q)
    a, b, c = [P.coeff(x, d) for d in (2, 1, 0)]
    tex = F(k, (m, p), (n, q))[0]
    lead = mx(int(a), 'x^2')
    return V(rf'若 ${lead}+bx{"+" if c > 0 else ""}{c}={tex}$，求 $b$。', f'$b={b}$',
             rf'展開：${tex}={pt(P)}$，所以 $b={b}$。', 1)


def diag_q(k, m, p, n, q, wrong, why):
    """交錯：給一個分解，判斷對錯並改正（wrong＝None 表示寫對了）。"""
    P = Q(k, m, p, n, q)
    tex = F(k, (m, p), (n, q))[0]
    if wrong is None:
        return V(rf'小華寫 ${pt(P)}={tex}$。這個因式分解正確嗎？說明你怎麼檢查。', '正確',
                 rf'展開 ${tex}={pt(P)}$，和原式相同，每個因式都不能再降次分解，所以正確。' + explain(P, k, m, n, p, q), 2,
                 lambda: answer_poly(tex, P))
    return fix_q(k, m, p, n, q, wrong, why)


# ═════════ 3-2(1) ═════════
A_SLOTS = [
    ('q1', 0, P6, C5, [expand_q(1, 4, 1, 6), expand_q(1, -3, 1, -5), expand_q(1, 2, 1, 9), expand_q(1, 5, 1, 7), expand_q(1, -4, 1, -6)]),
    ('q2', 0, P6, C5, [two_numbers(3, 8), two_numbers(-6, -3), two_numbers(2, 10), two_numbers(-4, -7), two_numbers(5, 9)]),
    ('q3', 1, P6, C5, [factor(1, 1, 4, 1, 5, '因式分解', '（課本 p.138 自我評量第 2 題 (1)）'), factor(1, 1, 2, 1, 9), factor(1, 1, 4, 1, 9), factor(1, 1, 3, 1, 8), factor(1, 1, 6, 1, 7)]),
    ('q4', 1, P6, C5, [factor(1, 1, -2, 1, -3, '因式分解', '（課本 p.138 自我評量第 2 題 (2)）'), factor(1, 1, -2, 1, -7), factor(1, 1, -4, 1, -6), factor(1, 1, -2, 1, -10), factor(1, 1, -5, 1, -8)]),
    ('q5', 2, P6, C5, [sign_q(-3, -10), sign_q(5, 10), sign_q(-2, -6), sign_q(4, 9), sign_q(-4, -9)]),
    ('q6', 0, P6, C5, [cross_q(1, 1, 3, 8), cross_q(1, 1, -2, -9), cross_q(1, 1, 5, 6), cross_q(1, 1, -4, -5), cross_q(1, 1, 2, 12)]),
    ('q7', 1, P6, C5, [all_pairs(-4, -7), all_pairs(2, 8), all_pairs(-3, -11), all_pairs(3, 6), all_pairs(-2, -12)]),
    ('q8', 1, P6, C45, [other_factor(1, 1, 3, 1, 8), other_factor(1, 1, -2, 1, -8), other_factor(1, 1, 5, 1, 9), other_factor(1, 1, -6, 1, -4), other_factor(1, 1, 7, 1, 2)]),
    ('q9', 2, P6, C5, [
        fix_q(1, 1, -4, 1, -5, (1, (1, 4), (1, 5)), '一次項是負的，兩數要都是負數。'),
        fix_q(1, 1, 3, 1, 6, (1, (1, 2), (1, 9)), '右欄相乘對了，但交叉相乘的和不是一次項。'),
        fix_q(1, 1, -2, 1, -9, (1, (1, -3), (1, -6)), '右欄相乘對了，但交叉相乘的和不是一次項。'),
        fix_q(1, 1, 4, 1, 6, (1, (1, -4), (1, -6)), '一次項是正的，兩數要都是正數。'),
        fix_q(1, 1, 2, 1, 5, (1, (1, 1), (1, 10)), '右欄相乘對了，但交叉相乘的和不是一次項。'),
    ]),
    ('q10', 1, P6, C5, [factorable_q(Q(1, 1, 2, 1, 5), (2, 5)), factorable_q(x**2 + 7 * x + 11), factorable_q(Q(1, 1, -4, 1, -5), (-4, -5)),
                        factorable_q(x**2 - 9 * x + 15), factorable_q(x**2 + 10 * x + 22)]),
]

# ═════════ 3-2(2) ═════════
B_SLOTS = [
    ('q1', 0, P6, C5, [factor(1, 1, 9, 1, -4, '因式分解', '（課本 p.138 自我評量第 2 題 (3)）'), factor(1, 1, 5, 1, -3), factor(1, 1, 7, 1, -4), factor(1, 1, 4, 1, -3), factor(1, 1, 8, 1, -2)]),
    ('q2', 0, P6, C5, [factor(1, 1, -6, 1, 2), factor(1, 1, -8, 1, 3), factor(1, 1, -5, 1, 4), factor(1, 1, -9, 1, 5), factor(1, 1, -12, 1, 2)]),
    ('q3', 1, P6, C5, [abs_q(8, -2), abs_q(-8, 5), abs_q(7, -3), abs_q(-9, 4), abs_q(10, -3)]),
    ('q4', 0, P6, C5, [cross_q(1, 1, 5, -8), cross_q(1, 1, -3, 7), cross_q(1, 1, 6, -2), cross_q(1, 1, -9, 4), cross_q(1, 1, 7, -10)]),
    ('q5', 0, P6, C5, [two_numbers(6, -3), two_numbers(-6, 5), two_numbers(7, -2), two_numbers(-8, 3), two_numbers(9, -4)]),
    ('q6', 2, P6, C5, [negx_q(3, -5), negx_q(3, -2), negx_q(-5, 2), negx_q(4, -3), negx_q(-6, 1)]),
    ('q7', 0, P6, C5, [all_pairs(-6, 4), all_pairs(7, -2), all_pairs(8, -4), all_pairs(-5, 3), all_pairs(9, -2)]),
    ('q8', 0, P6, C45, [other_factor(1, 1, -3, 1, 6), other_factor(1, 1, 3, 1, -9), other_factor(1, 1, -5, 1, 6), other_factor(1, 1, 4, 1, -7), other_factor(1, 1, -8, 1, 3)]),
    ('q9', 0, P6, C5, [factor(1, 1, -7, 1, 6), factor(1, 1, -6, 1, -7), factor(1, 1, 7, 1, -6), factor(1, 1, -3, 1, -8, '因式分解', '（課本 p.138 自我評量第 1 題）'), factor(1, 1, 4, 1, -9)]),
    ('q10', 1, P6, C5, [
        fix_q(1, 1, 2, 1, -4, (1, (1, -2), (1, 4)), '右欄相乘對了，但正負號放反，交叉相乘的和變成相反數。'),
        fix_q(1, 1, -5, 1, 3, (1, (1, 5), (1, -3)), '右欄相乘對了，但正負號放反，交叉相乘的和變成相反數。'),
        fix_q(1, 1, 6, 1, -1, (1, (1, -6), (1, 1)), '右欄相乘對了，但正負號放反，交叉相乘的和變成相反數。'),
        fix_q(1, 1, -7, 1, 2, (1, (1, -14), (1, 1)), '右欄相乘對了，但交叉相乘的和不是一次項。'),
        fix_q(1, 1, 8, 1, -3, (1, (1, -8), (1, 3)), '右欄相乘對了，但正負號放反，交叉相乘的和變成相反數。'),
    ]),
]

# ═════════ 3-2(3) ═════════
C_SLOTS = [
    ('q1', 0, P6, C5, [expand_q(2, 3, 1, 4), expand_q(3, -2, 1, 5), expand_q(4, 1, 1, -3), expand_q(2, -5, 3, 1), expand_q(5, 2, 1, -1)]),
    ('q2', 0, P6, C5, [cross_q(2, 3, 1, -4), cross_q(1, 5, -3, -2), cross_q(3, 2, 5, -1), cross_q(4, 1, -1, 3), cross_q(2, 5, 3, -1)]),
    ('q3', 1, P6, C5, [factor(1, 3, 1, 1, 3), factor(1, 2, 1, 1, 5), factor(1, 5, 1, 1, 3), factor(1, 2, 3, 3, 1), factor(1, 4, 1, 2, 3)]),
    ('q4', 1, P6, C5, [factor(1, 1, -4, 3, -7, '因式分解', '（課本 p.138 自我評量第 2 題 (4)）'), factor(1, 3, -2, 1, -3), factor(1, 2, -5, 1, -2), factor(1, 7, -1, 1, -2), factor(1, 3, -4, 2, -1)]),
    ('q5', 1, P6, C5, [factor(1, 1, 4, 5, -3, '因式分解', '（課本 p.139 自我評量第 2 題 (5)）'), factor(1, 4, 5, 1, -2, '因式分解', '（課本 p.139 自我評量第 2 題 (6)）'),
                       factor(1, 2, -3, 1, 2), factor(1, 3, 1, 1, -2), factor(1, 2, -1, 2, 3)]),
    ('q6', 2, P6, C5, [trial_q(1, 3, -4, 1, [(1, 3, 1, -4), (1, 3, -4, 1)]), trial_q(2, 1, -1, 3, [(2, 1, 3, -1), (2, 1, -1, 3)]),
                       trial_q(5, 1, -2, -1, [(5, 1, -1, -2), (5, 1, -2, -1)]), trial_q(2, 3, 1, -2, [(1, 6, 1, -2), (2, 3, 1, -2)]), trial_q(3, 2, 2, -1, [(3, 2, -1, 2), (3, 2, 2, -1)])]),
    ('q7', 1, P6, C45, [other_factor(1, 3, -2, 1, 4), other_factor(1, 2, -1, 1, -3), other_factor(1, 2, 1, 2, 3), other_factor(1, 5, -2, 1, 1), other_factor(1, 3, 4, 2, -1)]),
    ('q8', 1, P6, C5, [
        exam_q(6 * x**2 + x - 15, 3, 'a+2c', lambda a, b, c: a + 2 * c, '(3x+5)(2x-3)'),
        exam_q(10 * x**2 - x - 3, 5, 'a+b+c', lambda a, b, c: a + b + c, '(5x-3)(2x+1)'),
        exam_q(8 * x**2 - 10 * x + 3, 4, 'a+2c', lambda a, b, c: a + 2 * c, '(4x-3)(2x-1)'),
        exam_q(39 * x**2 + 5 * x - 14, 3, 'a+2c', lambda a, b, c: a + 2 * c, '(3x+2)(13x-7)', '（111 會考第 8 題，改為手寫）'),
        exam_q(12 * x**2 - x - 6, 3, 'a+b+c', lambda a, b, c: a + b + c, '(3x+2)(4x-3)'),
    ]),
    ('q9', 2, P6, C5, [
        fix_q(1, 2, 1, 1, 3, (1, (2, 3), (1, 1)), '數字對了，但位置放錯，交叉相乘的和不是一次項。'),
        fix_q(1, 3, -2, 1, 4, (1, (3, 4), (1, -2)), '數字對了，但位置放錯，交叉相乘的和不是一次項。'),
        fix_q(1, 4, 1, 1, -3, (1, (4, -3), (1, 1)), '數字對了，但位置放錯，交叉相乘的和不是一次項。'),
        fix_q(1, 5, -1, 1, -2, (1, (5, -2), (1, -1)), '數字對了，但位置放錯，交叉相乘的和不是一次項。'),
        fix_q(1, 2, -5, 1, 2, (1, (2, 2), (1, -5)), '數字對了，但位置放錯，交叉相乘的和不是一次項。'),
    ]),
    ('q10', 1, P6, C45, [is_factor_q(Q(1, 2, -1, 3, 2), 2 * x - 1, (1, 2, -1, 3, 2)), is_factor_q(Q(1, 2, 1, 2, -3), 2 * x - 1, (1, 2, 1, 2, -3)),
                         is_factor_q(Q(1, 3, 1, 1, 2), 3 * x + 1, (1, 3, 1, 1, 2)), is_factor_q(Q(1, 3, -2, 2, 1), 3 * x + 2, (1, 3, -2, 2, 1)),
                         is_factor_q(Q(1, 5, 2, 1, -1), x - 1, (1, 5, 2, 1, -1))]),
]

# ═════════ 3-2(4) ═════════
D_SLOTS = [
    ('q1', 0, P6, C5, [factor(3, 1, -12, 1, -3, '因式分解', '（課本 p.139 自我評量第 2 題 (7)）'), factor(3, 1, 2, 1, 3), factor(2, 1, -7, 1, 2), factor(5, 1, 3, 1, -2), factor(4, 1, -3, 1, 2)]),
    ('q2', 0, P6, C5, [factor(2, 2, -1, 1, 3), factor(3, 2, -1, 1, -2), factor(3, 3, -2, 1, 2), factor(2, 3, 1, 1, -4), factor(2, 3, 7, 1, -1)]),
    ('q3', 1, P6, C5, [factor(-1, 1, -3, 1, 2), factor(-1, 1, 5, 1, -3), factor(-1, 1, -3, 1, -4), factor(-1, 1, -4, 1, -5), factor(-1, 1, 6, 1, -2)]),
    ('q4', 1, P6, C5, [factor(-1, 2, -3, 1, 8, '因式分解', '（課本 p.139 自我評量第 2 題 (8)）'), factor(-1, 2, -3, 1, 1), factor(-1, 3, 1, 1, -2), factor(-1, 5, -4, 1, -1), factor(-1, 3, -1, 2, 5)]),
    ('q5', 1, P6, C45, [also_q(3, 1, 3, 1, -2, [((3, 9), (1, -2)), ((1, 3), (3, -6))]), also_q(2, 1, -5, 1, 2, [((2, -10), (1, 2)), ((1, -5), (2, 4))]),
                        also_q(2, 1, 3, 1, -4, [((2, 6), (1, -4)), ((1, 3), (2, -8))]), also_q(4, 1, 1, 1, -3, [((4, 4), (1, -3)), ((1, 1), (4, -12))]),
                        also_q(3, 1, -2, 1, -5, [((3, -6), (1, -5)), ((1, -2), (3, -15))])]),
    ('q6', 2, P6, C5, [factor(1, 6, -7, 6, -7, '因式分解', '（課本 p.139 自我評量第 2 題 (9)）'), factor(1, 5, 9, 5, 9, '因式分解', '（課本 p.139 自我評量第 2 題 (10)）'),
                       factor(1, 4, 3, 4, 3), factor(1, 2, -5, 2, -5), factor(1, 7, -1, 7, -1)]),
    ('q7', 0, P6, C5, [box_q(4, 3, -2), box_q(5, -2, -5), box_q(2, 3, 5), box_q(3, 4, -1), box_q(6, 1, 2)]),
    ('q8', 2, P6, C45, [
        diag_q(1, 3, -1, 2, 1, None, ''),
        diag_q(3, 1, -2, 1, -2, (3, (1, 2), (1, 2)), '中間項是負的，兩個因式都要是 x−2。'),
        diag_q(-1, 2, 1, 1, -1, (-1, (2, -1), (1, 1)), '右欄的正負號放反了。'),
        diag_q(2, 1, 1, 1, 4, (1, (1, 1), (1, 4)), '提出的公因數 2 不見了。'),
        diag_q(1, 2, 1, 1, -3, (1, (2, -3), (1, 1)), '數字的位置放錯，交叉相乘的和不是一次項。'),
    ]),
    ('q9', 1, P6, C5, [minus_q(-1, 2, -3, 1, 1), minus_q(-1, 3, 4, 1, -1), minus_q(-1, 4, 1, 1, -1), minus_q(-1, 5, -3, 1, -1), minus_q(-1, 3, 1, 1, -2)]),
    ('q10', 0, P6, C5, [coef_q(3, 1, 4, 1, -1), coef_q(2, 2, -1, 1, 3), coef_q(-1, 3, -2, 1, 1), coef_q(2, 1, -5, 1, 3), coef_q(-1, 2, 3, 1, -4)]),
]

# 多小題的 IRS 頁：每一小題各自對到的題型（順序＝課程 JSON 的 items 順序）
ITEM_LINKS = {
    'g8-3-2a': {'a-practice': [['q3'], ['q4']], 'a-ex2': [['q4'], ['q4']], 'a-ex1': [['q3'], ['q3']]},
    'g8-3-2b': {'b-warmup': [['q9'], ['q9'], ['q5']], 'b-faded': [['q1'], ['q2']], 'b-ex3-practice': [['q1'], ['q2']], 'b-ex3': [['q2'], ['q2']]},
    'g8-3-2c': {'c-warmup': [['q1'], ['q1'], []], 'c-ex5-practice': [['q3'], ['q5']], 'c-ex5': [['q5'], ['q5']]},
    'g8-3-2d': {'d-warmup': [['q1'], ['q9'], ['q6']], 'd-mix': [['q8'], ['q1'], ['q4']], 'd-ex6-practice': [['q2'], ['q2']]},
}
GUIDE_P = '備課用書 04-115國中數學2上-備課-L03(115f231512).pdf'
LESSONS = [
    ('g8-3-2a', '3-2(1) 十字交乘法：二次項係數為 1（常數項為正）',
     f'八上課本 3-2 p.128–130（例 1、例 2 與隨堂）、p.138 自我評量第 2 題 (1)(2)；{GUIDE}；{GUIDE_P} 第 23–25 頁（課本 p.128「對應學習內容 A-8-5」）',
     A_SLOTS,
     {'a-warmup': ['q1'], 'a-predict': ['q3'], 'a-tiles': ['q3'], 'a-pq': ['q2'], 'a-rule': ['q1'], 'a-ex1': ['q3'], 'a-ex2': ['q4'],
      'a-sign': ['q5'], 'a-practice': ['q3', 'q4'], 'a-error': ['q9'], 'a-exit': ['q2', 'q5']}),
    ('g8-3-2b', '3-2(2) 十字交乘法：二次項係數為 1（常數項為負）',
     f'八上課本 3-2 p.131（例 3 與隨堂）、p.138 自我評量第 1 題與第 2 題 (3)；{GUIDE}；{GUIDE_P} 第 26 頁',
     B_SLOTS,
     {'b-warmup': ['q9', 'q5'], 'b-predict': ['q2'], 'b-concrete': ['q7'], 'b-ex3': ['q2'], 'b-faded': ['q1', 'q2'], 'b-ex3-practice': ['q1', 'q2'],
      'b-sign': ['q3'], 'b-negx': ['q6'], 'b-mix': ['q9'], 'b-error': ['q10'], 'b-exit': ['q3']}),
    ('g8-3-2c', '3-2(3) 十字交乘法：二次項係數不為 1',
     f'八上課本 3-2 p.132–133（例 4、例 5 與隨堂）、p.138–139 自我評量第 2 題 (4)(5)(6)、111 會考第 8 題（q8 第 4 題）；{GUIDE}；{GUIDE_P} 第 27–28 頁（課本 p.132「對應學習內容 A-8-5」）',
     C_SLOTS,
     {'c-warmup': ['q1'], 'c-predict': ['q9'], 'c-tiles': ['q3'], 'c-intro': ['q1'], 'c-ex4': ['q4'], 'c-ex5': ['q5'], 'c-play': ['q6'],
      'c-ex5-practice': ['q3', 'q5'], 'c-error': ['q9'], 'c-exit': ['q6']}),
    ('g8-3-2d', '3-2(4) 先提公因數、二次項係數為負與乘法公式',
     f'八上課本 3-2 p.134–136（例 6、例 7、例 8 與隨堂）、p.139 自我評量第 2 題 (7)～(10)；{GUIDE}；{GUIDE_P} 第 29–31 頁',
     D_SLOTS,
     {'d-warmup': ['q1', 'q9', 'q6'], 'd-predict': ['q5'], 'd-ex6': ['q1'], 'd-ex6-practice': ['q2'], 'd-ex7': ['q4'], 'd-ex7-practice': ['q4'],
      'd-ex8': ['q6'], 'd-ex8-practice': ['q6'], 'd-mix': ['q8', 'q1', 'q4'], 'd-error': ['q9']}),
]


def build():
    total = 0
    for lid, title, source, slots, acts in LESSONS:
        quiz = json.loads((ROOT / 'content/quizzes' / f'{lid}.json').read_text(encoding='utf8'))
        topics = {s['id']: s['topic'] for s in quiz['slots']}
        assert [s[0] for s in slots] == list(topics), f'{lid}：題位和課後檢核不一致'
        used_p = sorted({c for s in slots for c in s[2]}, key=list(CODES).index)
        used_c = sorted({c for s in slots for c in s[3]}, key=list(CODES).index)
        out_slots = []
        for sid, obj, perf, cont, variants in slots:
            assert len(variants) >= 5, f'{lid} {sid} 只有 {len(variants)} 題'
            stems = [v['stem'] for v in variants]
            assert len(set(stems)) == len(stems), f'{lid} {sid} 有重複的題目'
            total += len(variants)
            out_slots.append(dict(id=sid, topic=topics[sid], objective=obj, performance=perf, content=cont, variants=variants))
        out = dict(lessonId=lid, section='8-3-2', title=title, source=source,
                   curriculum=dict(performance=[dict(code=c, text=CODES[c][1]) for c in used_p],
                                   content=[dict(code=c, text=CODES[c][1]) for c in used_c]),
                   slots=out_slots, links=dict(activities=acts, items=ITEM_LINKS[lid]))
        path = ROOT / 'content/homework' / f'{lid}.json'
        path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        print(f'✓ {lid}：{len(slots)} 個題型、{sum(len(s[4]) for s in slots)} 題 → content/homework/{lid}.json')
    print(f'{total} 題全部一致')


if __name__ == '__main__':
    build()
