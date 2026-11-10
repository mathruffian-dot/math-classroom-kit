r"""3-1(1) 因式與倍式：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一）。

用法：C:\AI\H3\venv\Scripts\python.exe -B -X utf8 scripts/quiz-src/g8-3-1a.py
範圍：這一堂的多項式除法判別因式（餘式為 0 才是因式，缺項補 0）、A＝B×C 的因式與倍式說法、
被除式＝除式×商式＋餘式、因式分解是「寫成乘積」。先備：1 章的多項式乘法與除法。
不用餘式定理、綜合除法（教師用書限制）；不把提公因式（3-1(2)）、變號（3-1(3)）、乘法公式（3-1(4)）當成新技能。
因式分解的答案是代數式，iPad 不能打字：一律用四選一（□ 填數字，或選出正確的式子／敘述）。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import div, expand, rem  # noqa: E402

from fac import L, ident, lin, n, npick, par, pt, x  # noqa: E402
from quizlib import export, slot, statement, value  # noqa: E402


def box_sign(d):
    """商式常數 d 寫成「x＋□」或「x−□」：回傳 (符號, □ 的值)。"""
    return ('+', d) if d > 0 else ('-', -d)


# ───────── 1. 直式除法求餘式 ─────────
def remainder(a2, a1, a0, c):
    P = a2 * x**2 + a1 * x + a0
    q, r = div(P, x + c, x)
    ident(P, (x + c) * q + r)
    # 常見錯：第一次相減把 a1−a2·c 算成 a1＋a2·c
    wrong = a0 - c * (a1 + a2 * c)
    return value(
        rf'用直式計算 $({pt(P)})\div({lin(1, c)})$，餘式是多少？',
        r,
        npick(int(r), [int(-r), int(wrong), 0, int(q.subs(x, 0))]),
        rf'${pt(P)}=({lin(1, c)})({pt(q)})' + (f'+{r}' if r > 0 else f'{r}') + rf'$：商式 ${pt(q)}$、餘式 ${r}$。'
        rf'相減時要變號，例如 ${pt(a1 * x)}-({pt(a2 * c * x)})={pt((a1 - a2 * c) * x)}$。')


# ───────── 2. 哪一個是因式 ─────────
def which_factor(P, good, bads):
    opts = [(f'${pt(f)}$', rem(P, f, x) == 0) for f in [good] + bads]
    q, r = div(P, good, x)
    assert r == 0
    return statement(
        rf'用多項式除法判別，下列哪一個是 ${pt(P)}$ 的因式？',
        opts,
        rf'$({pt(P)})\div({pt(good)})$ 的商式 ${pt(q)}$、餘式 $0$，所以 ${pt(good)}$ 是因式；其他三個除下去餘式都不是 $0$。')


# ───────── 3. 整除時的商式 ─────────
def monic_quot(c, d):
    P = expand((x + c) * (x + d))
    sg, b = box_sign(d)
    s = 1 if d > 0 else -1
    wrongs = [2 * c + d, -d, c * d, c + d]  # 相減沒變號、正負號、常數相乘、係數照抄
    return value(
        rf'$({pt(P)})\div({lin(1, c)})$ 的餘式是 $0$，商式是 $x{sg}\square$，□ 是多少？',
        b,
        npick(b, [w * s for w in wrongs]),
        rf'直式算出商式 ${lin(1, d)}$、餘式 $0$，所以 ${pt(P)}=({lin(1, c)})({lin(1, d)})$，□＝${b}$。'
        rf'檢查：${c}\times{"(" + str(d) + ")" if d < 0 else d}={c * d}$ 是常數項。')


# ───────── 4. 因式與倍式的說法 ─────────
def fm_words(b, c, ask):
    """A＝B×C。ask：'factor' 正確的是「B 是 A 的因式」；'multiple' 是「A 是 C 的倍式」。"""
    A = expand(b * c)
    tA, tB, tC = pt(A), pt(b), pt(c)
    if ask == 'factor':
        opts = [(f'${tB}$ 是 ${tA}$ 的因式', True), (f'${tA}$ 是 ${tB}$ 的因式', False),
                (f'${tB}$ 是 ${tA}$ 的倍式', False), (f'${tB}$ 是 ${tC}$ 的因式', False)]
    else:
        opts = [(f'${tA}$ 是 ${tC}$ 的倍式', True), (f'${tC}$ 是 ${tA}$ 的倍式', False),
                (f'${tA}$ 是 ${tC}$ 的因式', False), (f'${tC}$ 是 ${tB}$ 的倍式', False)]
    assert rem(b, c, x) != 0 and rem(c, b, x) != 0  # B、C 彼此不是因式
    return statement(
        rf'已知 ${tA}=({tB})({tC})$，下列敘述何者正確？',
        opts,
        rf'$A=B\times C$：$B$、$C$ 是 $A$ 的因式，$A$ 是 $B$、$C$ 的倍式。${tB}$ 和 ${tC}$ 彼此沒有因式倍式的關係。')


# ───────── 5. 哪一個是因式分解 ─────────
def which_factorization(c, d):
    """正確的是 P＝(x＋c)(x＋d)；錯的：展開方向、最後一步是加法、等號不成立的乘積。"""
    k = c + d  # x(x＋k)＋cd：只差最後一步是加法
    P = expand((x + c) * (x + d))
    tP = pt(P)
    prod = f'{par(1, c)}{par(1, d)}'
    rest = expand(P - x * (x + k))
    ident(P, x * (x + k) + rest)
    assert rest != 0
    wrong_prod = (x + c) * (x - d)
    opts = [
        (f'${tP}={prod}$', True),
        (f'${prod}={tP}$', False),
        (f'${tP}=x{par(1, k)}' + (f'+{rest}' if rest > 0 else f'{rest}') + '$', False),
        (f'${tP}={par(1, c)}{par(1, -d)}$', expand(wrong_prod - P) == 0),
    ]
    ident(P, (x + c) * (x + d))
    return statement(
        '下列哪一個式子是「因式分解」？',
        opts,
        rf'因式分解是把多項式寫成乘積：${tP}={prod}$。${prod}={tP}$ 是展開；$x{par(1, k)}+\cdots$ 最後一步是加法；'
        rf'${par(1, c)}{par(1, -d)}$ 展開是 ${pt(wrong_prod)}$，不等於原式。')


# ───────── 6. 餘式不是 0 的結論 ─────────
def nonzero_rem(c, d, r):
    """P＝(x＋c)(x＋d)＋r（r≠0），除以 x＋c 的商式 x＋d、餘式 r。"""
    P = expand((x + c) * (x + d) + r)
    q, rr = div(P, x + c, x)
    assert rr == r and r != 0 and rem(P, x + d, x) != 0
    tP, tB, tQ = pt(P), lin(1, c), lin(1, d)
    return statement(
        rf'$({tP})\div({tB})$ 的商式是 ${tQ}$、餘式是 ${r}$。下列何者正確？',
        [(f'${tB}$ 不是 ${tP}$ 的因式', True),
         (f'${tB}$ 是 ${tP}$ 的因式，因為除得出商式', False),
         (f'${tQ}$ 是 ${tP}$ 的因式', False),
         (f'${tP}$ 是 ${tB}$ 的倍式', False)],
        rf'判別要看餘式：餘式 ${r}\neq0$，所以 ${tB}$ 不是因式，${tP}$ 也不是 ${tB}$ 的倍式。'
        rf'${tP}=({tB})({tQ})' + (f'+{r}' if r > 0 else f'{r}') + rf'$，${tQ}$ 也除不盡。')


# ───────── 7. 首項係數不是 1 的商式 ─────────
def lead_quot(a, b, c, d):
    """P＝(ax＋b)(cx＋d) 除以 ax＋b，商式 cx＋d（填 d 的絕對值）。"""
    P = expand((a * x + b) * (c * x + d))
    sg, bx = box_sign(d)
    s = 1 if d > 0 else -1
    q, r = div(P, a * x + b, x)
    assert r == 0 and expand(q - (c * x + d)) == 0
    # 錯法：第二步把 (a1 − c·b)/a 的相減做成相加；把 b、d 搞混；正負號
    a1 = expand(P).coeff(x, 1)
    wrong = (a1 + c * b) / a
    wrongs = [w for w in (wrong, -d, b, d + 1, d - 1) if w == int(w)]
    return value(
        rf'用直式計算 $({pt(P)})\div({lin(a, b)})$，餘式是 $0$，商式是 ${c if c != 1 else ""}x{sg}\square$，□ 是多少？',
        bx,
        npick(bx, [int(w) * s for w in wrongs]),
        rf'商式第一項 ${pt(c * x)}$，${pt(c * x)}\times({lin(a, b)})={pt(c * x * (a * x + b))}$，相減剩 ${pt(P - c * x * (a * x + b))}$，'
        rf'再除得 ${d}$：商式 ${lin(c, d)}$，${pt(P)}=({lin(a, b)})({lin(c, d)})$。')


# ───────── 8. 被除式缺項要補 0 ─────────
def missing_term(a2, a0, c):
    P = a2 * x**2 + a0
    q, r = div(P, x + c, x)
    ident(P, (x + c) * q + r)
    tP = pt(P)
    # 錯法：沒補 0，把常數項對到 x 項下面（等於把 P 當成 a2x²＋a0x）
    wrong = rem(a2 * x**2 + a0 * x, x + c, x)
    return value(
        rf'用直式計算 $({tP})\div({lin(1, c)})$，餘式是多少？（被除式缺 $x$ 項）',
        r,
        npick(int(r), [int(-r), int(wrong), a0, 0]),
        rf'被除式寫成 ${a2 if a2 != 1 else ""}x^2+0x' + (f'+{a0}' if a0 > 0 else f'{a0}') + rf'$ 再做直式：商式 ${pt(q)}$、餘式 ${r}$。'
        rf'檢查：$({lin(1, c)})({pt(q)})' + (f'+{r}' if r > 0 else f'{r}') + rf'={tP}$。')


# ───────── 9. 由除法寫成乘積：因式倍式 ─────────
def from_division(P, B, ask):
    q, r = div(P, B, x)
    assert r == 0
    tP, tB, tQ = pt(P), pt(B), pt(q)
    assert rem(B, q, x) != 0 and rem(q, B, x) != 0
    if ask == 'multiple':
        opts = [(f'${tP}$ 是 ${tQ}$ 的倍式', True), (f'${tQ}$ 是 ${tP}$ 的倍式', False),
                (f'${tB}$ 是 ${tQ}$ 的因式', False), (f'${tP}$ 是 ${tB}$ 的因式', False)]
    else:
        opts = [(f'${tQ}$ 是 ${tP}$ 的因式', True), (f'${tQ}$ 是 ${tB}$ 的倍式', False),
                (f'${tP}$ 是 ${tQ}$ 的因式', False), (f'${tQ}$ 不是 ${tP}$ 的因式', False)]
    return statement(
        rf'已知 $({tP})\div({tB})={tQ}$，餘式 $0$。下列何者正確？',
        opts,
        rf'除法改寫成乘法：${tP}=({tB})({tQ})$。${tB}$、${tQ}$ 都是 ${tP}$ 的因式，${tP}$ 是它們的倍式。')


# ───────── 10. 判別後寫成乘積 ─────────
def factor_after(c, d, alts):
    """已知 x＋c 是 P＝(x＋c)(x＋d) 的因式，選出正確的乘積。alts：錯誤的另一個因式 (a, b)。"""
    P = expand((x + c) * (x + d))
    tB = lin(1, c)
    opts = [(f'${pt(P)}=({tB})({lin(1, d)})$', (x + c) * (x + d), P)]
    for a, b in alts:
        opts.append((f'${pt(P)}=({tB})({lin(a, b)})$', (x + c) * L(a, b), P))
    return statement(
        rf'用直式算出 $({pt(P)})\div({tB})$ 的餘式是 $0$。下列哪一個因式分解正確？',
        opts,
        rf'商式是 ${lin(1, d)}$：被除式＝除式×商式，${pt(P)}=({tB})({lin(1, d)})$。可以展開檢查常數項 ${c}\times({d})={c * d}$。')


SLOTS = [
    slot(1, '直式除法求餘式', [remainder(1, 5, 4, 2), remainder(1, -3, 5, -1), remainder(2, 1, -5, 2)]),
    slot(2, '用除法判別哪一個是因式', [
        which_factor(x**2 - x - 6, x - 3, [x + 3, x - 2, x - 6]),
        which_factor(2 * x**2 + 5 * x - 3, 2 * x - 1, [2 * x + 1, x - 3, x + 1]),
        which_factor(x**2 + 2 * x - 8, x - 2, [x + 2, x - 4, x + 8]),
    ]),
    slot(3, '整除時的商式（另一個因式）', [monic_quot(1, -6), monic_quot(2, 5), monic_quot(-3, -4)]),
    slot(4, '由 A＝B×C 說出因式與倍式', [
        fm_words(x - 5, x + 1, 'factor'),
        fm_words(x + 3, 2 * x - 1, 'multiple'),
        fm_words(x - 4, x + 2, 'multiple'),
    ]),
    slot(5, '因式分解是寫成乘積', [which_factorization(1, 2), which_factorization(2, 3), which_factorization(1, 4)]),
    slot(6, '餘式不是 0：不是因式', [nonzero_rem(2, 3, -2), nonzero_rem(1, 2, 3), nonzero_rem(-2, 4, 1)]),
    slot(7, '首項係數不是 1 的除法', [lead_quot(4, 5, 2, -1), lead_quot(2, -1, 3, 2), lead_quot(3, 1, 2, -3)]),
    slot(8, '被除式缺項要補 0', [missing_term(1, 1, 1), missing_term(1, -5, -2), missing_term(2, 3, -1)]),
    slot(9, '除法改寫成乘法：因式與倍式', [
        from_division(x**2 + x - 12, x - 3, 'multiple'),
        from_division(x**2 - 4 * x + 3, x - 3, 'factor'),
        from_division(2 * x**2 + 7 * x + 3, x + 3, 'factor'),
    ]),
    slot(10, '判別後寫成兩個一次式相乘', [
        factor_after(3, -5, [(1, 5), (1, -3), (1, -12)]),
        factor_after(2, -5, [(1, 5), (2, -5), (1, -2)]),
        factor_after(-2, 7, [(1, -7), (1, 5), (1, 2)]),
    ]),
]

if __name__ == '__main__':
    export('g8-3-1a', '3-1 因式分解（1）因式與倍式 課後檢核', '依課本 3-1 p.114–116（多項式除法判別因式、因式與倍式、二次式的因式分解、例 1）自編換數字題', SLOTS)
