r"""2-2 根式的運算：回家作業手寫題庫（g8-2-2a～g8-2-2d）。

用法：python -X utf8 scripts/homework-src/g8-2-2.py
產生 content/homework/g8-2-2a.json … g8-2-2d.json，格式與出題規則見 docs/HOMEWORK.md。

- 題位（id、topic）和課後檢核題庫 content/quizzes/g8-2-2?.json 一一對應（topic 直接從課後檢核讀進來）。
- 每個題位 6～7 題手寫題：前 3 題改寫自課後檢核（拿掉選項；「哪一個算對了／哪一個是最簡根式」改成找錯訂正、判斷並化簡），其餘換數字自編。
- 範圍累積：2-2(1) 不用最簡根式化簡與有理化（答案本來就是最簡）；2-2(3) 不用乘法公式；2-2(4) 可用 2-2 全部與第 1 章乘法公式。
- 核算（全部用 SymPy）：
  1. 題目裡的算式（或應用題由題目數字算出的值）用 LaTeX 解析器轉成 SymPy，和 answer 的值比對；
  2. answer 必須是最簡根式（根號內無平方因數、無分數小數、分母無根號、分數已約分、同類方根已合併）；
  3. 比大小題：answer 的關係式用 SymPy 判斷真假，且兩邊就是題目給的數；
  4. 找錯題：題目中「錯誤的算式」用 SymPy 確認真的不成立，answer 等於左式的正確值；
  5. 詳解裡每一個 $…$ 中用 =、<、>、≈ 連起來的式子，逐段用 SymPy 核算成立，且詳解中要出現和答案相等的值。
"""
import json
import re
import sys
from functools import reduce
from math import gcd
from pathlib import Path

from sympy import Expr, N, Rational, Symbol, expand, factorint, radsimp, simplify, sqrt

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / 'scripts/quiz-src'))
from geom import BLUE, PEACH, Fig  # noqa: E402

SOURCE_CURR = ('備課用書 01-115國中數學2上-備課-目次 p.28（教學活動連結分析表：學習表現）、p.29（學習內容）；'
               '03-115國中數學2上-備課-L02 p.115（PDF 第 10 頁，本章學習內容解析）')
PERF = [{'code': 'n-IV-5', 'text': '理解二次方根的意義、符號與根式的四則運算，並能運用到日常生活的情境解決問題。'}]
CONT = [{'code': 'N-8-1', 'text': '二次方根：二次方根的意義；根式的化簡及四則運算。'}]


# ═════════ LaTeX → SymPy（只處理本節用到的寫法） ═════════
class ParseError(Exception):
    pass


TOKEN = re.compile(r'\\left|\\right|\\[,;!]|\\(?:sqrt|dfrac|tfrac|frac|times|cdot|div)|\d+(?:\.\d+)?|[a-z]|[-+−()\[\]{}^]|\s+')


def tokenize(s):
    out, i = [], 0
    while i < len(s):
        m = TOKEN.match(s, i)
        if not m:
            raise ParseError(f'無法解析 {s[i:i + 12]!r}（{s!r}）')
        t, i = m.group(), m.end()
        if t.isspace() or t in (r'\left', r'\right', r'\,', r'\;', r'\!'):
            continue
        out.append('-' if t == '−' else t)
    return out


class Parser:
    def __init__(self, s, subs):
        self.t, self.i, self.subs = tokenize(s), 0, subs

    def peek(self):
        return self.t[self.i] if self.i < len(self.t) else None

    def take(self, want=None):
        t = self.peek()
        if t is None or (want is not None and t != want):
            raise ParseError(f'預期 {want}，遇到 {t}')
        self.i += 1
        return t

    @staticmethod
    def starts(t):
        return t is not None and (t[0].isdigit() or t in (r'\sqrt', r'\dfrac', r'\frac', r'\tfrac', '(', '{', '[') or (len(t) == 1 and t.isalpha()))

    def expr(self):
        v = self.term()
        while self.peek() in ('+', '-'):
            op = self.take()
            w = self.term()
            v = v + w if op == '+' else v - w
        return v

    def term(self):
        v = self.unary()
        while True:
            t = self.peek()
            if t in (r'\times', r'\cdot'):
                self.take()
                v = v * self.unary()
            elif t == r'\div':
                self.take()
                v = v / self.unary()
            elif self.starts(t):
                v = v * self.power()  # 隱含乘法：2\sqrt{3}、\sqrt{6}(\sqrt{3}+1)
            else:
                return v

    def unary(self):
        t = self.peek()
        if t == '-':
            self.take()
            return -self.unary()
        if t == '+':
            self.take()
            return self.unary()
        return self.power()

    def power(self):
        b = self.atom()
        if self.peek() == '^':
            self.take()
            b = b ** self.atom()
        return b

    def group(self):
        self.take('{')
        v = self.expr()
        self.take('}')
        return v

    def atom(self):
        t = self.take()
        if t[0].isdigit():
            return Rational(t)
        if t == r'\sqrt':
            return sqrt(self.group())
        if t in (r'\dfrac', r'\frac', r'\tfrac'):
            a = self.group()
            return a / self.group()
        if t in '([{':
            v = self.expr()
            self.take({'(': ')', '[': ']', '{': '}'}[t])
            return v
        if len(t) == 1 and t.isalpha():
            return self.subs.get(t, Symbol(t))
        raise ParseError(f'不認得 {t}')


def P(s, subs=None):
    p = Parser(s, subs or {})
    v = p.expr()
    if p.peek() is not None:
        raise ParseError(f'多出 {p.peek()}（{s!r}）')
    return v


def eq(a, b):
    num = abs(N(a - b, 80)) < Rational(1, 10 ** 60)
    if num:
        d = a - b
        assert simplify(radsimp(d)) == 0 or d.equals(0), f'數值相等但符號化簡不為 0：{a} vs {b}'
    return num


def rel_ok(a, b, op):
    if op == '=':
        return eq(a, b)
    if op == r'\neq':
        return not eq(a, b)
    if op == r'\approx':
        return abs(N(a - b, 30)) < 0.005 * max(1, abs(N(b, 30)))
    d = N(a - b, 80)
    return (d > 0) if op == '>' else (d < 0)


def segs(s):
    return re.findall(r'\$([^$]+)\$', s)


REL = re.compile(r'(=|<|>|\\approx|\\neq)')


def split_rel(seg):
    parts = REL.split(seg)
    return [p.strip() for p in parts[0::2]], parts[1::2]


def braces(s, i):
    """s[i] == '{'，回傳對應的 '}' 之後的位置與內容。"""
    depth, j = 0, i
    while True:
        if s[j] == '{':
            depth += 1
        elif s[j] == '}':
            depth -= 1
            if depth == 0:
                return j + 1, s[i + 1:j]
        j += 1


def sqrt_args(s):
    out = []
    for m in re.finditer(r'\\sqrt', s):
        _, arg = braces(s, m.end())
        out.append(arg)
    return out


def dfrac_parts(s):
    out = []
    for m in re.finditer(r'\\dfrac', s):
        j, num = braces(s, m.end())
        _, den = braces(s, j)
        out.append((num, den))
    return out


def is_simplest(tex):
    """最簡根式：根號內是無平方因數的整數、沒有小數與次方、分母沒有根號、分數已約分、同類方根已合併、沒有括號。"""
    if '.' in tex or '^' in tex or '(' in tex:
        return False
    for arg in sqrt_args(tex):
        if not arg.isdigit():
            return False
        n = int(arg)
        if n < 2 or any(e > 1 for e in factorint(n).values()):
            return False
    for num, den in dfrac_parts(tex):
        if not den.isdigit() or int(den) < 2:
            return False
        coeffs = [abs(t.as_coeff_Mul()[0]) for t in expand(P(num)).as_ordered_terms()]
        if any(not c.is_Integer for c in coeffs) or reduce(gcd, [int(c) for c in coeffs] + [int(den)]) != 1:
            return False
    rads = re.findall(r'\\sqrt\{(\d+)\}', tex)
    return len(rads) == len(set(rads))


# ═════════ 出題小工具 ═════════
def simp(n):
    """n = k²·m，m 無平方因數。"""
    k = 1
    for p, e in factorint(n).items():
        k *= p ** (e // 2)
    return k, n // (k * k)


def T(c, n=1, d=1):
    """c√n / d 的最簡根式 LaTeX（不含 $）。"""
    k, m = simp(n)
    c *= k
    if d < 0:
        c, d = -c, -d
    g = gcd(abs(c), d) or 1
    c, d = c // g, d // g
    if c == 0:
        return '0'
    body = str(abs(c)) if m == 1 else ('' if abs(c) == 1 else str(abs(c))) + rf'\sqrt{{{m}}}'
    return ('-' if c < 0 else '') + (body if d == 1 else rf'\dfrac{{{body}}}{{{d}}}')


def chain(*pieces):
    out = []
    for p in pieces:
        if not out or out[-1] != p:
            out.append(p)
    return '='.join(out)


def V(stem, answer, solution, space, check, figure=None):
    v = dict(stem=stem, answer=answer, solution=solution, space=space)
    if figure:
        v['figure'] = figure
    v['_check'] = check
    return v


def calc(q, ans, sol, space=1, tail='，並化成最簡根式'):
    return V(f'計算 ${q}${tail}。', f'${ans}$', sol, space, dict(kind='value', q=q))


def calc_a(q, ans, sol, space=1):
    """2-2(1)：答案本來就是最簡形式，題目只寫「計算」。"""
    return calc(q, ans, sol, space, tail='')


def simp_q(q, ans, sol, space=1):
    return V(f'把 ${q}$ 化成最簡根式。', f'${ans}$', sol, space, dict(kind='value', q=q))


def ratz_q(q, ans, sol, space=2):
    return V(f'把 ${q}$ 的分母有理化，並化成最簡根式。', f'${ans}$', sol, space, dict(kind='value', q=q))


def word(stem, ans, unit, expr, sol, space, figure=None):
    """應用題：expr 是由題目數字列出的算式（只用來核算，不放進題目）。"""
    return V(stem, f'${ans}$ {unit}', sol, space, dict(kind='value', expr=expr), figure)


def rel(items, ans, sol, space=2):
    if len(items) == 2:
        stem = f'比較 ${items[0]}$ 和 ${items[1]}$ 的大小，用「＞」、「＜」或「＝」寫出兩數的關係，並說明理由。'
    else:
        stem = '把 ' + '、'.join(f'${x}$' for x in items) + ' 由小到大排列（用「＜」連接），並說明理由。'
    return V(stem, f'${ans}$', sol, space, dict(kind='relation', items=items))


NAMES = ['小華', '小明', '小美', '阿哲', '小安', '小芸', '阿凱']


def err(k, claim, correct, sol, space=2):
    stem = f'{NAMES[k % len(NAMES)]}計算 ${claim}$，這是錯的。請說明錯在哪裡，並寫出正確的計算過程與答案。'
    return V(stem, f'${correct}$', sol, space, dict(kind='error', claim=claim))


def judge(items, space=2):
    """判斷是不是最簡根式；items＝[(LaTeX, 最簡答案或 None, 理由)]。"""
    nums = '（1）（2）（3）（4）'
    lab = [nums[3 * i:3 * i + 3] for i in range(len(items))]
    stem = '判斷下列各數是不是最簡根式；不是的，請化成最簡根式。' + '　'.join(f'{lab[i]}${t}$' for i, (t, _, _) in enumerate(items))
    ans = '　'.join(f'{lab[i]}是' if a is None else f'{lab[i]}不是，${a}$' for i, (_, a, _) in enumerate(items))
    sol = ''.join(f'{lab[i]}{why}。' for i, (_, _, why) in enumerate(items))
    return V(stem, ans, sol, space, dict(kind='judge', items=items))


def subs_q(xs, q, ans, sol, space=3):
    cond = '、'.join(f'${k}={v}$' for k, v in xs.items())
    return V(f'若 {cond}，求 ${q}$ 的值。', f'${ans}$', sol, space, dict(kind='value', q=q, subs=xs))


SIMPLE = '根號內沒有平方因數、分數或小數，分母也沒有根號，是最簡根式'


def frac_chain(p, q):
    """√(p/q)（已約分）化成最簡根式的連等式，從 √p/√q 開始。"""
    kq, mq = simp(q)
    Np, Dq = T(1, p), T(1, q)
    top = '1' if p == 1 else rf'\sqrt{{{p}}}'
    pieces = [rf'\dfrac{{{top}}}{{\sqrt{{{q}}}}}', rf'\dfrac{{{Np}}}{{{Dq}}}']
    if mq > 1:
        pieces.append(rf'\dfrac{{{Np}\times\sqrt{{{mq}}}}}{{{Dq}\times\sqrt{{{mq}}}}}')
        pieces.append(rf'\dfrac{{{T(1, p * mq)}}}{{{kq * mq}}}')
    pieces.append(T(1, p * q, q))
    return chain(*pieces)


# ───────── 附圖（和魔王戰題庫同樣的畫法） ─────────
def rect_fig(w, h, wl, hl, fill=PEACH):
    f = Fig(420, 220)
    A, B, C, D = f.pt('', 0, 0, False), f.pt('', w, 0, False), f.pt('', w, h, False), f.pt('', 0, h, False)
    f.pt('', w + max(w, h) * 0.45, h / 2, False)  # 右邊留位置給寬的標籤
    f.poly([A, B, C, D], fill=fill)
    f.right(A, B, D)
    f.side(A, B, wl, away=C)
    f.side(B, C, hl, away=A)
    return f.svg()


def squares_fig(a, b, la, lb):
    sa, sb = float(sqrt(a)), float(sqrt(b))
    f = Fig(420, 220)
    p = [f.pt('', 0, 0, False), f.pt('', sa, 0, False), f.pt('', sa, sa, False), f.pt('', 0, sa, False)]
    q = [f.pt('', sa, 0, False), f.pt('', sa + sb, 0, False), f.pt('', sa + sb, sb, False), f.pt('', sa, sb, False)]
    f.poly(p, fill=PEACH)
    f.poly(q, fill=BLUE)
    f.text(sa / 2, sa / 2, la, 15)
    f.text(sa + sb / 2, sb / 2, lb, 15)
    f.dim(p[0], q[1], '?', away=p[2], off=22)
    return f.svg()


def rect_word(L, W, Ll, Wl, ans, mid, unit='公分', thing='長方形'):
    stem = f'一個{thing}的長是 ${L}$ {unit}、寬是 ${W}$ {unit}，求它的面積。'
    sol = rf'面積＝長×寬：${L}\times{W}={mid}$（平方{unit}）。'
    return word(stem, ans, f'平方{unit}', rf'{L}\times{W}', sol, 1, rect_fig(float(P(L)), float(P(W)), Ll, Wl))


# ═════════ 2-2(1) 根式的乘除 ═════════
def int_times(a, c, n):
    A = f'({a})' if a < 0 else str(a)
    C = T(c, n)
    q = rf'{A}\times{"(" + C + ")" if c < 0 else C}'
    cc = f'({c})' if c < 0 else str(c)
    ans = T(a * c, n)
    return calc_a(q, ans, rf'整數和係數相乘：${A}\times{cc}={a * c}$，根號部分 $\sqrt{{{n}}}$ 不變，得 ${ans}$。')


def rad_div_int(c, n, d):
    C = T(c, n)
    D = f'({d})' if d < 0 else str(d)
    f = T(c, 1, d)
    ans = T(c, n, d)
    return calc_a(rf'{"(" + C + ")" if c < 0 else C}\div{D}', ans,
                  rf'係數相除：${c}\div{D}={f}$，根號部分不變：${f}\sqrt{{{n}}}={ans}$。')


def mul(a, b):
    assert simp(a * b)[0] == 1
    return calc_a(rf'\sqrt{{{a}}}\times\sqrt{{{b}}}', rf'\sqrt{{{a * b}}}',
                  rf'根號乘根號，根號內相乘（不是相加）：$\sqrt{{{a}}}\times\sqrt{{{b}}}=\sqrt{{{a}\times{b}}}=\sqrt{{{a * b}}}$。')


def cmul(c1, n1, c2, n2):
    A, B = T(c1, n1), T(c2, n2)
    q = rf'{"(" + A + ")" if c1 < 0 else A}\times{"(" + B + ")" if c2 < 0 else B}'
    c2s = f'({c2})' if c2 < 0 else str(c2)
    ans = T(c1 * c2, n1 * n2)
    return calc_a(q, ans, rf'係數乘係數：${c1}\times{c2s}={c1 * c2}$；根號乘根號：$\sqrt{{{n1}}}\times\sqrt{{{n2}}}=\sqrt{{{n1 * n2}}}$，得 ${ans}$。')


def mul_sq(a, b):
    k, m = simp(a * b)
    assert m == 1
    return calc_a(rf'\sqrt{{{a}}}\times\sqrt{{{b}}}', str(k),
                  rf'$\sqrt{{{a}}}\times\sqrt{{{b}}}=\sqrt{{{a * b}}}={k}$（${a * b}={k}^2$ 是完全平方數，要開出來）。')


def rel_into(x, y, X, Y, op):
    return rel([x, y], f'{x}{op}{y}', rf'把係數移進根號：${x}=\sqrt{{{X}}}$、${y}=\sqrt{{{Y}}}$，因為 ${X}{op}{Y}$，所以 ${x}{op}{y}$。')


def div(a, b):
    m = a // b
    k, r = simp(m)
    tail = f'={k}' if r == 1 else ''
    return calc_a(rf'\sqrt{{{a}}}\div\sqrt{{{b}}}', str(k) if r == 1 else rf'\sqrt{{{m}}}',
                  rf'根號除以根號，根號內相除：$\sqrt{{{a}}}\div\sqrt{{{b}}}=\sqrt{{{a}\div{b}}}=\sqrt{{{m}}}{tail}$。')


A_SLOTS = [
    ('q1', 0, [
        int_times(-5, 2, 3), int_times(4, -3, 2), int_times(-6, 5, 7),
        calc_a(r'\left(-\dfrac{3}{2}\sqrt{5}\right)\times(-4)', r'6\sqrt{5}',
               r'係數相乘：$\left(-\dfrac{3}{2}\right)\times(-4)=6$，根號部分 $\sqrt{5}$ 不變，得 $6\sqrt{5}$。'),
        int_times(7, -2, 5), int_times(-3, -4, 6),
    ]),
    ('q2', 0, [
        rad_div_int(-4, 2, 6), rad_div_int(-6, 5, 4), rad_div_int(9, 3, -6),
        rad_div_int(10, 7, -4), rad_div_int(-12, 2, -8), rad_div_int(8, 6, 12),
    ]),
    ('q3', 1, [
        mul(3, 7), mul(5, 6), mul(2, 11), mul(7, 5), mul(13, 2),
        calc_a(r'\sqrt{2}\times\sqrt{3}\times\sqrt{7}', r'\sqrt{42}', r'三個根號相乘，根號內全部相乘：$\sqrt{2}\times\sqrt{3}\times\sqrt{7}=\sqrt{2\times3\times7}=\sqrt{42}$。'),
    ]),
    ('q4', 1, [
        cmul(3, 3, -2, 5), cmul(-2, 3, 4, 2), cmul(5, 2, -3, 7), cmul(-4, 5, -3, 2), cmul(2, 7, 6, 3),
        calc_a(r'\left(-\dfrac{1}{2}\sqrt{6}\right)\times4\sqrt{5}', r'-2\sqrt{30}',
               r'係數乘係數：$-\dfrac{1}{2}\times4=-2$；根號乘根號：$\sqrt{6}\times\sqrt{5}=\sqrt{30}$，得 $-2\sqrt{30}$。'),
    ]),
    ('q5', 1, [
        mul_sq(2, 8), mul_sq(3, 12), mul_sq(5, 20), mul_sq(6, 24),
        calc_a(r'3\sqrt{2}\times\sqrt{32}', '24', r'$3\sqrt{2}\times\sqrt{32}=3\sqrt{2\times32}=3\sqrt{64}=3\times8=24$。'),
        calc_a(r'\sqrt{\dfrac{1}{3}}\times\sqrt{27}', '3', r'$\sqrt{\dfrac{1}{3}}\times\sqrt{27}=\sqrt{\dfrac{1}{3}\times27}=\sqrt{9}=3$。'),
    ]),
    ('q6', 1, [
        rect_word(r'\sqrt{13}', r'\sqrt{5}', '√13 公分', '√5 公分', r'\sqrt{65}', r'\sqrt{65}'),
        rect_word(r'\sqrt{7}', r'\sqrt{3}', '√7 公分', '√3 公分', r'\sqrt{21}', r'\sqrt{21}'),
        rect_word(r'2\sqrt{3}', r'\sqrt{5}', '2√3 公分', '√5 公分', r'2\sqrt{15}', r'2\sqrt{15}'),
        rect_word(r'3\sqrt{2}', r'\sqrt{5}', '3√2 公分', '√5 公分', r'3\sqrt{10}', r'3\sqrt{10}'),
        rect_word(r'\sqrt{12}', r'\sqrt{3}', '√12 公分', '√3 公分', '6', r'\sqrt{36}=6'),
        rect_word(r'2\sqrt{5}', r'3\sqrt{2}', '2√5 公分', '3√2 公分', r'6\sqrt{10}', r'(2\times3)\sqrt{5\times2}=6\sqrt{10}'),
    ]),
    ('q7', 2, [
        rel_into(r'3\sqrt{2}', r'2\sqrt{3}', 18, 12, '>'),
        rel_into(r'6\sqrt{2}', r'5\sqrt{3}', 72, 75, '<'),
        rel_into(r'4\sqrt{3}', r'3\sqrt{5}', 48, 45, '>'),
        rel_into(r'2\sqrt{7}', r'3\sqrt{3}', 28, 27, '>'),
        rel_into(r'2\sqrt{6}', r'3\sqrt{3}', 24, 27, '<'),
        rel([r'2\sqrt{5}', r'3\sqrt{2}', r'\sqrt{19}'], r'3\sqrt{2}<\sqrt{19}<2\sqrt{5}',
            r'把係數移進根號：$2\sqrt{5}=\sqrt{20}$、$3\sqrt{2}=\sqrt{18}$，因為 $18<19<20$，所以 $3\sqrt{2}<\sqrt{19}<2\sqrt{5}$。'),
    ]),
    ('q8', 1, [
        div(35, 7), div(48, 8), div(54, 6), div(66, 11),
        calc_a(r'(6\sqrt{30})\div(2\sqrt{5})', r'3\sqrt{6}', r'係數相除：$6\div2=3$；根號相除：$\sqrt{30}\div\sqrt{5}=\sqrt{6}$，得 $3\sqrt{6}$。'),
        calc_a(r'(-8\sqrt{42})\div(4\sqrt{7})', r'-2\sqrt{6}', r'係數相除：$(-8)\div4=-2$；根號相除：$\sqrt{42}\div\sqrt{7}=\sqrt{6}$，得 $-2\sqrt{6}$。'),
    ]),
    ('q9', 1, [
        calc_a(r'\dfrac{\sqrt{6}}{\sqrt{3}}\div\sqrt{\dfrac{2}{3}}', r'\sqrt{3}',
               r'$\dfrac{\sqrt{6}}{\sqrt{3}}=\sqrt{6\div3}=\sqrt{2}$；除以分數要乘倒數：$\sqrt{2}\div\sqrt{\dfrac{2}{3}}=\sqrt{2\times\dfrac{3}{2}}=\sqrt{3}$。', 2),
        calc_a(r'\sqrt{\dfrac{7}{2}}\div\dfrac{\sqrt{3}}{\sqrt{6}}', r'\sqrt{7}',
               r'$\dfrac{\sqrt{3}}{\sqrt{6}}=\sqrt{\dfrac{3}{6}}=\sqrt{\dfrac{1}{2}}$，$\sqrt{\dfrac{7}{2}\div\dfrac{1}{2}}=\sqrt{\dfrac{7}{2}\times2}=\sqrt{7}$。', 2),
        calc_a(r'\sqrt{\dfrac{5}{3}}\div\sqrt{\dfrac{1}{6}}', r'\sqrt{10}',
               r'$\sqrt{\dfrac{5}{3}\div\dfrac{1}{6}}=\sqrt{\dfrac{5}{3}\times6}=\sqrt{10}$（除以分數要乘倒數）。', 2),
        calc_a(r'\sqrt{\dfrac{3}{5}}\div\sqrt{\dfrac{1}{10}}', r'\sqrt{6}',
               r'$\sqrt{\dfrac{3}{5}\div\dfrac{1}{10}}=\sqrt{\dfrac{3}{5}\times10}=\sqrt{6}$。', 2),
        calc_a(r'\dfrac{\sqrt{10}}{\sqrt{2}}\div\sqrt{\dfrac{5}{7}}', r'\sqrt{7}',
               r'$\dfrac{\sqrt{10}}{\sqrt{2}}=\sqrt{10\div2}=\sqrt{5}$，$\sqrt{5\div\dfrac{5}{7}}=\sqrt{5\times\dfrac{7}{5}}=\sqrt{7}$。', 2),
        calc_a(r'\sqrt{\dfrac{2}{7}}\div\sqrt{\dfrac{2}{21}}', r'\sqrt{3}',
               r'$\sqrt{\dfrac{2}{7}\div\dfrac{2}{21}}=\sqrt{\dfrac{2}{7}\times\dfrac{21}{2}}=\sqrt{3}$。', 2),
    ]),
    ('q10', 1, [
        err(0, r'2\sqrt{3}\times3\sqrt{2}=6\sqrt{5}', r'6\sqrt{6}',
            r'根號乘根號要把根號內相乘，不是相加：$2\sqrt{3}\times3\sqrt{2}=(2\times3)\sqrt{3\times2}=6\sqrt{6}$。'),
        err(1, r'\sqrt{2}\times\sqrt{8}=\sqrt{10}', '4',
            r'根號內要相乘，不是相加：$\sqrt{2}\times\sqrt{8}=\sqrt{16}=4$。'),
        err(2, r'\sqrt{12}\div\sqrt{3}=\sqrt{9}', '2',
            r'根號內要相除，不是相減：$\sqrt{12}\div\sqrt{3}=\sqrt{12\div3}=\sqrt{4}=2$。'),
        err(3, r'3\sqrt{2}\times2\sqrt{2}=6\sqrt{2}', '12',
            r'$\sqrt{2}\times\sqrt{2}=2$，根號會消失：$3\sqrt{2}\times2\sqrt{2}=(3\times2)\times(\sqrt{2}\times\sqrt{2})=6\times2=12$。'),
        err(4, r'\sqrt{3}\times\sqrt{3}=9', '3',
            r'$\sqrt{3}\times\sqrt{3}=\sqrt{9}=3$，也就是 $(\sqrt{3})^2=3$，不是 $3$ 的平方。'),
        err(5, r'4\sqrt{2}\div2=2', r'2\sqrt{2}',
            r'只有係數相除，根號要留著：$4\sqrt{2}\div2=(4\div2)\sqrt{2}=2\sqrt{2}$。'),
    ]),
]

A_LINKS = dict(
    activities={
        'a-notation': ['q1', 'q2'], 'a-predict': ['q3'], 'a-ex1': ['q3', 'q4'], 'a-ex1-practice': ['q3', 'q4', 'q6'],
        'a-ex2': ['q7'], 'a-ex2-practice': ['q7'], 'a-ex3': ['q8', 'q9'], 'a-ex3-practice': ['q8', 'q9'],
        'a-error': ['q4', 'q10'], 'a-exit': ['q5'],
    },
    duelFamilies={'√a × √b（乘起來是完全平方數）': 'q5', '√a × √b': 'q3', '√a ÷ √b': 'q8', 'a√b × c√d': 'q4'},
)


# ═════════ 2-2(2) 最簡根式與分母有理化 ═════════
def simp_n(n):
    k, m = simp(n)
    return simp_q(rf'\sqrt{{{n}}}', T(1, n), rf'找出最大的平方因數：$\sqrt{{{n}}}=\sqrt{{{k * k}\times{m}}}={T(1, n)}$。')


def power(b, e):
    h = (e - 1) // 2
    outside = f'{b}^{{{h}}}' if h > 1 else str(b)
    ans = T(1, b ** e)
    c = chain(rf'\sqrt{{{b}^{{{e}}}}}', rf'\sqrt{{{b}^{{{e - 1}}}}}\times\sqrt{{{b}}}', rf'{outside}\sqrt{{{b}}}', ans)
    return simp_q(rf'\sqrt{{{b}^{{{e}}}}}', ans, rf'${b}^{{{e}}}={b}^{{{e - 1}}}\times{b}$，${b}^{{{e - 1}}}$ 是平方數：${c}$。')


def ratz_int(c, d, n):
    D = rf'\sqrt{{{n}}}' if d == 1 else rf'{d}\sqrt{{{n}}}'
    ans = T(c, n, d * n)
    reduced = ans != rf'\dfrac{{{c}\sqrt{{{n}}}}}{{{d * n}}}'
    c_ = chain(rf'\dfrac{{{c}}}{{{D}}}', rf'\dfrac{{{c}\sqrt{{{n}}}}}{{{D}\times\sqrt{{{n}}}}}', rf'\dfrac{{{c}\sqrt{{{n}}}}}{{{d * n}}}', ans)
    return ratz_q(rf'\dfrac{{{c}}}{{{D}}}', ans, rf'分子、分母同乘 $\sqrt{{{n}}}$：${c_}${"，有理化後還要約分" if reduced else ""}。', 1)


def frac_q(p, q):
    return simp_q(rf'\sqrt{{\dfrac{{{p}}}{{{q}}}}}', T(1, p * q, q),
                  rf'根號內的分子、分母分開開方，再把分母有理化：$\sqrt{{\dfrac{{{p}}}{{{q}}}}}={frac_chain(p, q)}$。', 2)


def dec_q(s, p, q):
    assert Rational(s) == Rational(p, q)
    return simp_q(rf'\sqrt{{{s}}}', T(1, p * q, q),
                  rf'先把小數化成分數：$\sqrt{{{s}}}=\sqrt{{\dfrac{{{p}}}{{{q}}}}}={frac_chain(p, q)}$。根號內不能留小數，分母也不能有根號。', 2)


def mul_simp(a, b):
    k, m = simp(a * b)
    ans = T(1, a * b)
    return calc(rf'\sqrt{{{a}}}\times\sqrt{{{b}}}', ans,
                rf'先乘再化簡：$\sqrt{{{a}}}\times\sqrt{{{b}}}=\sqrt{{{a * b}}}=\sqrt{{{k * k}\times{m}}}={ans}$。')


def div_rat(a, b):
    g = gcd(a, b)
    p, q = a // g, b // g
    c = chain(rf'\sqrt{{{a}}}\div\sqrt{{{b}}}', rf'\sqrt{{\dfrac{{{a}}}{{{b}}}}}', rf'\sqrt{{\dfrac{{{p}}}{{{q}}}}}', frac_chain(p, q))
    return calc(rf'\sqrt{{{a}}}\div\sqrt{{{b}}}', T(1, p * q, q), rf'合成一個根號、約分，再有理化：${c}$。', 2)


B_SLOTS = [
    ('q1', 1, [
        simp_n(72), simp_n(48), simp_n(108), simp_n(98), simp_n(180),
        simp_q(r'2\sqrt{75}', r'10\sqrt{3}', r'$\sqrt{75}=\sqrt{25\times3}=5\sqrt{3}$，所以 $2\sqrt{75}=2\times5\sqrt{3}=10\sqrt{3}$。'),
    ]),
    ('q2', 1, [
        power(3, 5), power(5, 3), power(2, 7), power(3, 7),
        simp_q(r'\sqrt{2^{3}\times3^{2}}', r'6\sqrt{2}', r'把平方的部分分出來：$\sqrt{2^{3}\times3^{2}}=\sqrt{2^{2}\times3^{2}\times2}=2\times3\sqrt{2}=6\sqrt{2}$。'),
        simp_q(r'\sqrt{2^{4}\times5^{3}}', r'20\sqrt{5}', r'$\sqrt{2^{4}\times5^{3}}=\sqrt{2^{4}\times5^{2}\times5}=2^{2}\times5\sqrt{5}=20\sqrt{5}$。'),
    ]),
    ('q3', 2, [
        ratz_int(5, 1, 2), ratz_int(6, 1, 3), ratz_int(3, 2, 6), ratz_int(10, 1, 5), ratz_int(2, 3, 2), ratz_int(15, 2, 3),
    ]),
    ('q4', 2, [frac_q(3, 8), frac_q(5, 12), frac_q(2, 27), frac_q(5, 18), frac_q(7, 20), frac_q(9, 50)]),
    ('q5', 2, [dec_q('0.3', 3, 10), dec_q('0.5', 1, 2), dec_q('1.2', 6, 5), dec_q('0.8', 4, 5), dec_q('2.5', 5, 2), dec_q('0.18', 9, 50)]),
    ('q6', 1, [
        mul_simp(6, 8), mul_simp(10, 15), mul_simp(12, 6), mul_simp(14, 21),
        calc(r'2\sqrt{15}\times3\sqrt{10}', r'30\sqrt{6}', r'$2\sqrt{15}\times3\sqrt{10}=6\sqrt{150}=6\sqrt{25\times6}=6\times5\sqrt{6}=30\sqrt{6}$。'),
        rect_word(r'\sqrt{18}', r'\sqrt{6}', '√18 公尺', '√6 公尺', r'6\sqrt{3}', r'\sqrt{108}=\sqrt{36\times3}=6\sqrt{3}', unit='公尺', thing='長方形花圃'),
    ]),
    ('q7', 2, [
        div_rat(45, 30), div_rat(2, 11), div_rat(20, 35), div_rat(10, 6), div_rat(21, 28),
        calc(r'4\sqrt{3}\div\sqrt{24}', r'\sqrt{2}',
             r'$4\sqrt{3}\div\sqrt{24}=4\sqrt{\dfrac{3}{24}}=4\sqrt{\dfrac{1}{8}}=\dfrac{4}{\sqrt{8}}=\dfrac{4}{2\sqrt{2}}=\dfrac{2}{\sqrt{2}}=\dfrac{2\sqrt{2}}{2}=\sqrt{2}$。', 2),
    ]),
    ('q8', 2, [
        calc(r'\sqrt{\dfrac{8}{3}}\times\sqrt{\dfrac{27}{16}}', r'\dfrac{3\sqrt{2}}{2}',
             r'合成一個根號：$\sqrt{\dfrac{8}{3}\times\dfrac{27}{16}}=\sqrt{\dfrac{9}{2}}=\dfrac{3}{\sqrt{2}}=\dfrac{3\sqrt{2}}{2}$。', 2),
        calc(r'\sqrt{\dfrac{3}{5}}\times\sqrt{\dfrac{10}{9}}', r'\dfrac{\sqrt{6}}{3}',
             r'$\sqrt{\dfrac{3}{5}\times\dfrac{10}{9}}=\sqrt{\dfrac{2}{3}}=\dfrac{\sqrt{2}}{\sqrt{3}}=\dfrac{\sqrt{2}\times\sqrt{3}}{\sqrt{3}\times\sqrt{3}}=\dfrac{\sqrt{6}}{3}$。', 2),
        calc(r'\sqrt{\dfrac{7}{2}}\times\sqrt{\dfrac{3}{14}}', r'\dfrac{\sqrt{3}}{2}',
             r'$\sqrt{\dfrac{7}{2}\times\dfrac{3}{14}}=\sqrt{\dfrac{3}{4}}=\dfrac{\sqrt{3}}{\sqrt{4}}=\dfrac{\sqrt{3}}{2}$。', 2),
        calc(r'\sqrt{\dfrac{10}{3}}\times\sqrt{\dfrac{6}{5}}', '2',
             r'$\sqrt{\dfrac{10}{3}\times\dfrac{6}{5}}=\sqrt{4}=2$。', 2),
        calc(r'\sqrt{12}\times\sqrt{\dfrac{1}{6}}\div\sqrt{\dfrac{1}{5}}', r'\sqrt{10}',
             r'除以 $\sqrt{\dfrac{1}{5}}$ 就是乘 $\sqrt{5}$：$\sqrt{12\times\dfrac{1}{6}\times5}=\sqrt{10}$。', 2),
        calc(r'\sqrt{\dfrac{5}{7}}\div\sqrt{\dfrac{10}{21}}', r'\dfrac{\sqrt{6}}{2}',
             r'$\sqrt{\dfrac{5}{7}\div\dfrac{10}{21}}=\sqrt{\dfrac{5}{7}\times\dfrac{21}{10}}=\sqrt{\dfrac{3}{2}}=\dfrac{\sqrt{3}}{\sqrt{2}}=\dfrac{\sqrt{6}}{2}$。', 2),
    ]),
    ('q9', 2, [
        rel([r'\dfrac{1}{\sqrt{2}}', r'\dfrac{\sqrt{2}}{2}'], r'\dfrac{1}{\sqrt{2}}=\dfrac{\sqrt{2}}{2}',
            r'分子、分母同乘 $\sqrt{2}$（等於乘以 $1$，值不變）：$\dfrac{1}{\sqrt{2}}=\dfrac{1\times\sqrt{2}}{\sqrt{2}\times\sqrt{2}}=\dfrac{\sqrt{2}}{2}$，所以 $\dfrac{1}{\sqrt{2}}=\dfrac{\sqrt{2}}{2}$。'),
        rel([r'\dfrac{3}{\sqrt{2}}', '2'], r'\dfrac{3}{\sqrt{2}}>2',
            r'$\dfrac{3}{\sqrt{2}}=\dfrac{3\sqrt{2}}{2}=\sqrt{\dfrac{18}{4}}=\sqrt{\dfrac{9}{2}}$，$2=\sqrt{4}$，因為 $\dfrac{9}{2}>4$，所以 $\dfrac{3}{\sqrt{2}}>2$。'),
        rel([r'\dfrac{\sqrt{3}}{3}', r'\dfrac{1}{2}'], r'\dfrac{\sqrt{3}}{3}>\dfrac{1}{2}',
            r'$\dfrac{\sqrt{3}}{3}=\sqrt{\dfrac{3}{9}}=\sqrt{\dfrac{1}{3}}$，$\dfrac{1}{2}=\sqrt{\dfrac{1}{4}}$，因為 $\dfrac{1}{3}>\dfrac{1}{4}$，所以 $\dfrac{\sqrt{3}}{3}>\dfrac{1}{2}$。'),
        rel([r'\dfrac{5}{\sqrt{5}}', r'\sqrt{5}'], r'\dfrac{5}{\sqrt{5}}=\sqrt{5}',
            r'有理化：$\dfrac{5}{\sqrt{5}}=\dfrac{5\sqrt{5}}{5}=\sqrt{5}$，所以 $\dfrac{5}{\sqrt{5}}=\sqrt{5}$。'),
        rel([r'\dfrac{4}{\sqrt{2}}', '3'], r'\dfrac{4}{\sqrt{2}}<3',
            r'$\dfrac{4}{\sqrt{2}}=\dfrac{4\sqrt{2}}{2}=2\sqrt{2}=\sqrt{8}$，$3=\sqrt{9}$，因為 $8<9$，所以 $\dfrac{4}{\sqrt{2}}<3$。'),
        rel([r'\dfrac{6}{\sqrt{3}}', r'3\sqrt{2}'], r'\dfrac{6}{\sqrt{3}}<3\sqrt{2}',
            r'$\dfrac{6}{\sqrt{3}}=\dfrac{6\sqrt{3}}{3}=2\sqrt{3}=\sqrt{12}$，$3\sqrt{2}=\sqrt{18}$，因為 $12<18$，所以 $\dfrac{6}{\sqrt{3}}<3\sqrt{2}$。'),
    ]),
    ('q10', 0, [
        judge([(r'3\sqrt{2}', None, SIMPLE),
               (r'\sqrt{12}', r'2\sqrt{3}', r'根號內有平方因數 $4$：$\sqrt{12}=\sqrt{4\times3}=2\sqrt{3}$'),
               (r'\sqrt{\dfrac{2}{3}}', r'\dfrac{\sqrt{6}}{3}', r'根號內是分數：$\sqrt{\dfrac{2}{3}}=\dfrac{\sqrt{2}}{\sqrt{3}}=\dfrac{\sqrt{6}}{3}$')]),
        judge([(r'\dfrac{2\sqrt{6}}{3}', None, SIMPLE),
               (r'\dfrac{\sqrt{24}}{2}', r'\sqrt{6}', r'根號內有平方因數 $4$：$\dfrac{\sqrt{24}}{2}=\dfrac{2\sqrt{6}}{2}=\sqrt{6}$'),
               (r'\dfrac{\sqrt{5}}{\sqrt{3}}', r'\dfrac{\sqrt{15}}{3}', r'分母有根號：$\dfrac{\sqrt{5}}{\sqrt{3}}=\dfrac{\sqrt{5}\times\sqrt{3}}{\sqrt{3}\times\sqrt{3}}=\dfrac{\sqrt{15}}{3}$')]),
        judge([(r'5\sqrt{7}', None, SIMPLE),
               (r'\sqrt{18}', r'3\sqrt{2}', r'根號內有平方因數 $9$：$\sqrt{18}=\sqrt{9\times2}=3\sqrt{2}$'),
               (r'\dfrac{2}{\sqrt{2}}', r'\sqrt{2}', r'分母有根號：$\dfrac{2}{\sqrt{2}}=\dfrac{2\sqrt{2}}{2}=\sqrt{2}$')]),
        judge([(r'\sqrt{\dfrac{1}{3}}', r'\dfrac{\sqrt{3}}{3}', r'根號內是分數：$\sqrt{\dfrac{1}{3}}=\dfrac{1}{\sqrt{3}}=\dfrac{\sqrt{3}}{3}$'),
               (r'\sqrt{0.5}', r'\dfrac{\sqrt{2}}{2}', r'根號內是小數：$\sqrt{0.5}=\sqrt{\dfrac{1}{2}}=\dfrac{1}{\sqrt{2}}=\dfrac{\sqrt{2}}{2}$'),
               (r'\sqrt{30}', None, SIMPLE)]),
        judge([(r'\sqrt{45}', r'3\sqrt{5}', r'根號內有平方因數 $9$：$\sqrt{45}=\sqrt{9\times5}=3\sqrt{5}$'),
               (r'\dfrac{\sqrt{14}}{2}', None, SIMPLE),
               (r'\dfrac{3}{\sqrt{6}}', r'\dfrac{\sqrt{6}}{2}', r'分母有根號：$\dfrac{3}{\sqrt{6}}=\dfrac{3\sqrt{6}}{6}=\dfrac{\sqrt{6}}{2}$')]),
        judge([(r'\sqrt{3^{3}}', r'3\sqrt{3}', r'根號內有平方因數 $3^{2}$：$\sqrt{3^{3}}=\sqrt{3^{2}\times3}=3\sqrt{3}$'),
               (r'\sqrt{1.5}', r'\dfrac{\sqrt{6}}{2}', r'根號內是小數：$\sqrt{1.5}=\sqrt{\dfrac{3}{2}}=\dfrac{\sqrt{3}}{\sqrt{2}}=\dfrac{\sqrt{6}}{2}$'),
               (r'\dfrac{\sqrt{10}}{5}', None, SIMPLE)]),
    ]),
]

B_LINKS = dict(
    activities={
        'b-explore': ['q1'], 'b-simplest': ['q10'], 'b-ex4': ['q1', 'q2'], 'b-ex4-practice': ['q1', 'q2'], 'b-numberline': ['q1'],
        'b-rationalize': ['q9'], 'b-ex5': ['q3', 'q4', 'q5'], 'b-ex5-practice': ['q3', 'q4', 'q5'],
        'b-ex6': ['q7', 'q8'], 'b-ex6-practice': ['q7', 'q8'], 'b-error': ['q3', 'q10'],
    },
    duelFamilies={'√n 化成最簡根式': 'q1', '√a × √b 再化成最簡根式': 'q6', 'c ÷ √n 分母有理化': 'q3', '√(a/b) 分母有理化': 'q4'},
)


# ═════════ 2-2(3) 根式的加減與混合運算 ═════════
def calc_c(q, ans, sol, space=1):
    return calc(q, ans, sol, space, tail='')


C_SLOTS = [
    ('q1', 0, [
        calc_c(r'7\sqrt{3}-3\sqrt{3}', r'4\sqrt{3}', r'同類方根像同類項，係數相減：$(7-3)\sqrt{3}=4\sqrt{3}$，根號部分不變。'),
        calc_c(r'5\sqrt{2}+3\sqrt{2}', r'8\sqrt{2}', r'係數相加：$(5+3)\sqrt{2}=8\sqrt{2}$，根號內不相加。'),
        calc_c(r'3\sqrt{11}-8\sqrt{11}', r'-5\sqrt{11}', r'$(3-8)\sqrt{11}=-5\sqrt{11}$。'),
        calc_c(r'2\sqrt{5}+3\sqrt{5}-4\sqrt{5}', r'\sqrt{5}', r'$(2+3-4)\sqrt{5}=1\sqrt{5}=\sqrt{5}$。'),
        calc_c(r'\sqrt{6}-4\sqrt{6}+2\sqrt{6}', r'-\sqrt{6}', r'$\sqrt{6}$ 的係數是 $1$：$(1-4+2)\sqrt{6}=-\sqrt{6}$。'),
        calc_c(r'\dfrac{1}{2}\sqrt{3}+\dfrac{3}{2}\sqrt{3}', r'2\sqrt{3}', r'$\left(\dfrac{1}{2}+\dfrac{3}{2}\right)\sqrt{3}=2\sqrt{3}$。'),
    ]),
    ('q2', 0, [
        calc_c(r'\sqrt{2}-5\sqrt{2}+\sqrt{3}', r'-4\sqrt{2}+\sqrt{3}', r'只有 $\sqrt{2}$ 的項能合併：$\sqrt{2}-5\sqrt{2}=-4\sqrt{2}$；$\sqrt{3}$ 不是同類方根，留著，得 $-4\sqrt{2}+\sqrt{3}$。'),
        calc_c(r'7\sqrt{2}-2\sqrt{3}-3\sqrt{2}', r'4\sqrt{2}-2\sqrt{3}', r'$7\sqrt{2}-3\sqrt{2}=4\sqrt{2}$；$-2\sqrt{3}$ 不能和 $\sqrt{2}$ 的項合併，得 $4\sqrt{2}-2\sqrt{3}$。'),
        calc_c(r'5\sqrt{5}+2\sqrt{7}-\sqrt{5}', r'4\sqrt{5}+2\sqrt{7}', r'$5\sqrt{5}-\sqrt{5}=4\sqrt{5}$；$2\sqrt{7}$ 留著，得 $4\sqrt{5}+2\sqrt{7}$。'),
        calc_c(r'3\sqrt{6}+2\sqrt{3}-5\sqrt{6}+\sqrt{3}', r'-2\sqrt{6}+3\sqrt{3}', r'$3\sqrt{6}-5\sqrt{6}=-2\sqrt{6}$，$2\sqrt{3}+\sqrt{3}=3\sqrt{3}$，兩種方根不能再合併，得 $-2\sqrt{6}+3\sqrt{3}$。'),
        calc_c(r'4-\sqrt{2}+3\sqrt{2}-1', r'3+2\sqrt{2}', r'整數和整數合併：$4-1=3$；$-\sqrt{2}+3\sqrt{2}=2\sqrt{2}$。整數和根式不能合併，得 $3+2\sqrt{2}$。'),
        calc_c(r'2\sqrt{5}-3\sqrt{2}+\sqrt{2}-\sqrt{5}', r'\sqrt{5}-2\sqrt{2}', r'$2\sqrt{5}-\sqrt{5}=\sqrt{5}$，$-3\sqrt{2}+\sqrt{2}=-2\sqrt{2}$，得 $\sqrt{5}-2\sqrt{2}$。'),
    ]),
    ('q3', 1, [
        calc(r'\sqrt{8}+\sqrt{18}', r'5\sqrt{2}', r'先化成最簡根式：$\sqrt{8}=2\sqrt{2}$、$\sqrt{18}=3\sqrt{2}$，是同類方根：$2\sqrt{2}+3\sqrt{2}=5\sqrt{2}$。', 2),
        calc(r'\sqrt{50}-\sqrt{32}', r'\sqrt{2}', r'$\sqrt{50}=5\sqrt{2}$、$\sqrt{32}=4\sqrt{2}$，$5\sqrt{2}-4\sqrt{2}=\sqrt{2}$。根號內不能直接相減。', 2),
        calc(r'\sqrt{12}+\sqrt{27}', r'5\sqrt{3}', r'$\sqrt{12}=2\sqrt{3}$、$\sqrt{27}=3\sqrt{3}$，$2\sqrt{3}+3\sqrt{3}=5\sqrt{3}$。', 2),
        calc(r'\sqrt{75}-\sqrt{12}+\sqrt{20}', r'3\sqrt{3}+2\sqrt{5}',
             r'$\sqrt{75}-\sqrt{12}+\sqrt{20}=5\sqrt{3}-2\sqrt{3}+2\sqrt{5}=3\sqrt{3}+2\sqrt{5}$；$\sqrt{3}$ 和 $\sqrt{5}$ 不是同類方根，不能再合併。', 2),
        calc(r'2\sqrt{18}-\sqrt{50}+\sqrt{8}', r'3\sqrt{2}', r'$2\sqrt{18}-\sqrt{50}+\sqrt{8}=6\sqrt{2}-5\sqrt{2}+2\sqrt{2}=3\sqrt{2}$。', 2),
        word(r'如圖，面積分別是 $20$ 平方公分和 $45$ 平方公分的兩個正方形並排在一起，求底邊的全長。', r'5\sqrt{5}', '公分', r'\sqrt{20}+\sqrt{45}',
             r'兩個正方形的邊長分別是 $\sqrt{20}=2\sqrt{5}$、$\sqrt{45}=3\sqrt{5}$，底邊全長 $2\sqrt{5}+3\sqrt{5}=5\sqrt{5}$（公分）。不能寫成 $\sqrt{65}$。', 2,
             squares_fig(20, 45, '20 cm²', '45 cm²')),
        word(r'一個長方形的長是 $\sqrt{50}$ 公分、寬是 $\sqrt{8}$ 公分，求它的周長。', r'14\sqrt{2}', '公分', r'2(\sqrt{50}+\sqrt{8})',
             r'$\sqrt{50}=5\sqrt{2}$、$\sqrt{8}=2\sqrt{2}$，周長＝$2(5\sqrt{2}+2\sqrt{2})=2\times7\sqrt{2}=14\sqrt{2}$（公分）。', 2,
             rect_fig(float(sqrt(50)), float(sqrt(8)), '√50 公分', '√8 公分')),
    ]),
    ('q4', 1, [
        calc(r'\dfrac{6}{\sqrt{3}}+\sqrt{3}', r'3\sqrt{3}', r'先有理化：$\dfrac{6}{\sqrt{3}}=\dfrac{6\sqrt{3}}{3}=2\sqrt{3}$，再合併：$2\sqrt{3}+\sqrt{3}=3\sqrt{3}$。', 2),
        calc(r'\dfrac{4}{\sqrt{2}}+\sqrt{2}', r'3\sqrt{2}', r'$\dfrac{4}{\sqrt{2}}=\dfrac{4\sqrt{2}}{2}=2\sqrt{2}$，$2\sqrt{2}+\sqrt{2}=3\sqrt{2}$。', 2),
        calc(r'\dfrac{1}{\sqrt{5}}+\dfrac{4}{5}\sqrt{5}', r'\sqrt{5}', r'$\dfrac{1}{\sqrt{5}}=\dfrac{\sqrt{5}}{5}$，$\dfrac{\sqrt{5}}{5}+\dfrac{4\sqrt{5}}{5}=\dfrac{5\sqrt{5}}{5}=\sqrt{5}$。', 2),
        calc(r'\dfrac{10}{\sqrt{5}}-\sqrt{20}+\sqrt{45}', r'3\sqrt{5}',
             r'$\dfrac{10}{\sqrt{5}}=\dfrac{10\sqrt{5}}{5}=2\sqrt{5}$、$\sqrt{20}=2\sqrt{5}$、$\sqrt{45}=3\sqrt{5}$，$2\sqrt{5}-2\sqrt{5}+3\sqrt{5}=3\sqrt{5}$。', 2),
        calc(r'\sqrt{27}+\dfrac{3}{\sqrt{3}}', r'4\sqrt{3}', r'$\sqrt{27}=3\sqrt{3}$，$\dfrac{3}{\sqrt{3}}=\dfrac{3\sqrt{3}}{3}=\sqrt{3}$，$3\sqrt{3}+\sqrt{3}=4\sqrt{3}$。', 2),
        calc(r'\sqrt{\dfrac{1}{2}}+\sqrt{18}', r'\dfrac{7\sqrt{2}}{2}',
             r'$\sqrt{\dfrac{1}{2}}=\dfrac{1}{\sqrt{2}}=\dfrac{\sqrt{2}}{2}$，$\sqrt{18}=3\sqrt{2}$，$\dfrac{\sqrt{2}}{2}+3\sqrt{2}=\dfrac{\sqrt{2}}{2}+\dfrac{6\sqrt{2}}{2}=\dfrac{7\sqrt{2}}{2}$。', 2),
    ]),
    ('q5', 2, [
        calc(r'\sqrt{6}(\sqrt{3}+2\sqrt{2})', r'3\sqrt{2}+4\sqrt{3}', r'括號裡每一項都要乘：$\sqrt{6}\times\sqrt{3}=\sqrt{18}=3\sqrt{2}$，$\sqrt{6}\times2\sqrt{2}=2\sqrt{12}=4\sqrt{3}$，得 $3\sqrt{2}+4\sqrt{3}$。', 2),
        calc(r'-2\sqrt{3}(\sqrt{6}-\sqrt{2})', r'-6\sqrt{2}+2\sqrt{6}', r'負號要分配到每一項：$-2\sqrt{3}\times\sqrt{6}=-2\sqrt{18}=-6\sqrt{2}$，$-2\sqrt{3}\times(-\sqrt{2})=2\sqrt{6}$，得 $-6\sqrt{2}+2\sqrt{6}$。', 2),
        calc(r'\sqrt{2}(\sqrt{6}-\sqrt{10})', r'2\sqrt{3}-2\sqrt{5}', r'$\sqrt{2}\times\sqrt{6}=\sqrt{12}=2\sqrt{3}$，$\sqrt{2}\times\sqrt{10}=\sqrt{20}=2\sqrt{5}$，得 $2\sqrt{3}-2\sqrt{5}$。', 2),
        calc(r'\sqrt{5}(\sqrt{10}+\sqrt{15})', r'5\sqrt{2}+5\sqrt{3}', r'$\sqrt{5}\times\sqrt{10}=\sqrt{50}=5\sqrt{2}$，$\sqrt{5}\times\sqrt{15}=\sqrt{75}=5\sqrt{3}$，得 $5\sqrt{2}+5\sqrt{3}$。', 2),
        calc(r'3\sqrt{2}(\sqrt{6}-2)', r'6\sqrt{3}-6\sqrt{2}', r'$3\sqrt{2}\times\sqrt{6}=3\sqrt{12}=6\sqrt{3}$，$3\sqrt{2}\times2=6\sqrt{2}$，得 $6\sqrt{3}-6\sqrt{2}$。', 2),
        calc(r'-\sqrt{3}(\sqrt{12}-\sqrt{6})', r'-6+3\sqrt{2}', r'$-\sqrt{3}\times\sqrt{12}=-\sqrt{36}=-6$，$-\sqrt{3}\times(-\sqrt{6})=\sqrt{18}=3\sqrt{2}$，得 $-6+3\sqrt{2}$。', 2),
    ]),
    ('q6', 2, [
        calc(r'(\sqrt{3}-\sqrt{2})(\sqrt{6}+1)', r'2\sqrt{2}-\sqrt{3}',
             r'用分配律逐項乘開：$(\sqrt{3}-\sqrt{2})(\sqrt{6}+1)=\sqrt{18}+\sqrt{3}-\sqrt{12}-\sqrt{2}=3\sqrt{2}+\sqrt{3}-2\sqrt{3}-\sqrt{2}=2\sqrt{2}-\sqrt{3}$。', 3),
        calc(r'(\sqrt{2}-1)(\sqrt{6}+\sqrt{3})', r'\sqrt{3}',
             r'$(\sqrt{2}-1)(\sqrt{6}+\sqrt{3})=\sqrt{12}+\sqrt{6}-\sqrt{6}-\sqrt{3}=2\sqrt{3}-\sqrt{3}=\sqrt{3}$。', 3),
        calc(r'(\sqrt{3}+1)(\sqrt{3}+2)', r'5+3\sqrt{3}',
             r'$(\sqrt{3}+1)(\sqrt{3}+2)=\sqrt{3}\times\sqrt{3}+2\sqrt{3}+\sqrt{3}+2=3+3\sqrt{3}+2=5+3\sqrt{3}$。', 3),
        calc(r'(\sqrt{5}+2)(\sqrt{5}-3)', r'-1-\sqrt{5}',
             r'$(\sqrt{5}+2)(\sqrt{5}-3)=5-3\sqrt{5}+2\sqrt{5}-6=-1-\sqrt{5}$。', 3),
        calc(r'(2\sqrt{2}+1)(\sqrt{2}+3)', r'7+7\sqrt{2}',
             r'$(2\sqrt{2}+1)(\sqrt{2}+3)=2\sqrt{2}\times\sqrt{2}+6\sqrt{2}+\sqrt{2}+3=4+6\sqrt{2}+\sqrt{2}+3=7+7\sqrt{2}$。', 3),
        calc(r'(\sqrt{6}-\sqrt{2})(\sqrt{3}+1)', r'2\sqrt{2}',
             r'$(\sqrt{6}-\sqrt{2})(\sqrt{3}+1)=\sqrt{18}+\sqrt{6}-\sqrt{6}-\sqrt{2}=3\sqrt{2}-\sqrt{2}=2\sqrt{2}$。', 3),
    ]),
    ('q7', 2, [
        calc(r'(6\sqrt{3}+\sqrt{6})\div\sqrt{3}', r'6+\sqrt{2}', r'括號裡每一項都除以 $\sqrt{3}$：$6\sqrt{3}\div\sqrt{3}=6$，$\sqrt{6}\div\sqrt{3}=\sqrt{2}$，得 $6+\sqrt{2}$。', 2),
        calc(r'(4\sqrt{6}-2)\div\sqrt{2}', r'4\sqrt{3}-\sqrt{2}', r'$4\sqrt{6}\div\sqrt{2}=4\sqrt{3}$，$2\div\sqrt{2}=\dfrac{2}{\sqrt{2}}=\dfrac{2\sqrt{2}}{2}=\sqrt{2}$，得 $4\sqrt{3}-\sqrt{2}$。', 2),
        calc(r'(4\sqrt{2}+\sqrt{6})\div\sqrt{3}', r'\dfrac{4\sqrt{6}}{3}+\sqrt{2}', r'$4\sqrt{2}\div\sqrt{3}=\dfrac{4\sqrt{2}}{\sqrt{3}}=\dfrac{4\sqrt{6}}{3}$，$\sqrt{6}\div\sqrt{3}=\sqrt{2}$，得 $\dfrac{4\sqrt{6}}{3}+\sqrt{2}$。', 2),
        calc(r'(\sqrt{15}-\sqrt{10})\div\sqrt{5}', r'\sqrt{3}-\sqrt{2}', r'$\sqrt{15}\div\sqrt{5}=\sqrt{3}$，$\sqrt{10}\div\sqrt{5}=\sqrt{2}$，得 $\sqrt{3}-\sqrt{2}$。', 2),
        calc(r'(6\sqrt{2}+\sqrt{10})\div\sqrt{2}', r'6+\sqrt{5}', r'$6\sqrt{2}\div\sqrt{2}=6$，$\sqrt{10}\div\sqrt{2}=\sqrt{5}$，得 $6+\sqrt{5}$。', 2),
        calc(r'(3\sqrt{5}-\sqrt{10})\div\sqrt{2}', r'\dfrac{3\sqrt{10}}{2}-\sqrt{5}', r'$3\sqrt{5}\div\sqrt{2}=\dfrac{3\sqrt{5}}{\sqrt{2}}=\dfrac{3\sqrt{10}}{2}$，$\sqrt{10}\div\sqrt{2}=\sqrt{5}$，得 $\dfrac{3\sqrt{10}}{2}-\sqrt{5}$。', 2),
    ]),
    ('q8', 2, [
        calc(r'\sqrt{\dfrac{1}{3}}\times\sqrt{\dfrac{2}{3}}\div\sqrt{\dfrac{1}{4}}', r'\dfrac{2\sqrt{2}}{3}',
             r'除以 $\sqrt{\dfrac{1}{4}}$ 就是乘 $\sqrt{4}$：$\sqrt{\dfrac{1}{3}\times\dfrac{2}{3}\times4}=\sqrt{\dfrac{8}{9}}=\dfrac{\sqrt{8}}{3}=\dfrac{2\sqrt{2}}{3}$。', 2),
        calc(r'\sqrt{\dfrac{3}{4}}\times\sqrt{\dfrac{1}{2}}\div\sqrt{\dfrac{3}{2}}', r'\dfrac{1}{2}',
             r'$\sqrt{\dfrac{3}{4}\times\dfrac{1}{2}\times\dfrac{2}{3}}=\sqrt{\dfrac{1}{4}}=\dfrac{1}{2}$。', 2),
        calc(r'\sqrt{\dfrac{2}{5}}\times\sqrt{\dfrac{5}{6}}\div\sqrt{\dfrac{1}{3}}', '1',
             r'$\sqrt{\dfrac{2}{5}\times\dfrac{5}{6}\times3}=\sqrt{1}=1$。', 2),
        calc(r'\sqrt{\dfrac{5}{6}}\times\sqrt{\dfrac{3}{10}}\div\sqrt{\dfrac{1}{8}}', r'\sqrt{2}',
             r'$\sqrt{\dfrac{5}{6}\times\dfrac{3}{10}\times8}=\sqrt{\dfrac{1}{4}\times8}=\sqrt{2}$。', 2),
        calc(r'\sqrt{\dfrac{3}{5}}\times\sqrt{\dfrac{10}{7}}\div\sqrt{\dfrac{3}{14}}', '2',
             r'$\sqrt{\dfrac{3}{5}\times\dfrac{10}{7}\times\dfrac{14}{3}}=\sqrt{4}=2$。', 2),
        calc(r'\sqrt{\dfrac{1}{2}}\times\sqrt{\dfrac{3}{5}}\div\sqrt{\dfrac{9}{10}}', r'\dfrac{\sqrt{3}}{3}',
             r'$\sqrt{\dfrac{1}{2}\times\dfrac{3}{5}\times\dfrac{10}{9}}=\sqrt{\dfrac{1}{3}}=\dfrac{1}{\sqrt{3}}=\dfrac{\sqrt{3}}{3}$。', 2),
    ]),
    ('q9', 1, [
        rel([r'\sqrt{2}+\sqrt{3}', r'\sqrt{5}'], r'\sqrt{2}+\sqrt{3}>\sqrt{5}',
            r'$\sqrt{2}+\sqrt{3}\approx1.414+1.732=3.146$，$\sqrt{5}\approx2.236$，所以 $\sqrt{2}+\sqrt{3}>\sqrt{5}$。根號不能直接相加。'),
        rel([r'\sqrt{3}+\sqrt{12}', r'\sqrt{27}'], r'\sqrt{3}+\sqrt{12}=\sqrt{27}',
            r'化成最簡根式：$\sqrt{3}+\sqrt{12}=\sqrt{3}+2\sqrt{3}=3\sqrt{3}$，$\sqrt{27}=3\sqrt{3}$，所以 $\sqrt{3}+\sqrt{12}=\sqrt{27}$。'),
        rel([r'2\sqrt{2}', r'\sqrt{2}+\sqrt{3}'], r'2\sqrt{2}<\sqrt{2}+\sqrt{3}',
            r'$2\sqrt{2}=\sqrt{2}+\sqrt{2}$，而 $\sqrt{2}<\sqrt{3}$，所以 $2\sqrt{2}<\sqrt{2}+\sqrt{3}$。'),
        rel([r'\sqrt{5}+\sqrt{20}', r'\sqrt{45}'], r'\sqrt{5}+\sqrt{20}=\sqrt{45}',
            r'$\sqrt{5}+\sqrt{20}=\sqrt{5}+2\sqrt{5}=3\sqrt{5}$，$\sqrt{45}=3\sqrt{5}$，所以 $\sqrt{5}+\sqrt{20}=\sqrt{45}$。'),
        rel([r'\sqrt{8}+\sqrt{2}', r'\sqrt{10}'], r'\sqrt{8}+\sqrt{2}>\sqrt{10}',
            r'$\sqrt{8}+\sqrt{2}=2\sqrt{2}+\sqrt{2}=3\sqrt{2}=\sqrt{18}$，因為 $18>10$，所以 $\sqrt{8}+\sqrt{2}>\sqrt{10}$。'),
        rel([r'\sqrt{12}+\sqrt{3}', r'4\sqrt{2}'], r'\sqrt{12}+\sqrt{3}<4\sqrt{2}',
            r'$\sqrt{12}+\sqrt{3}=2\sqrt{3}+\sqrt{3}=3\sqrt{3}=\sqrt{27}$，$4\sqrt{2}=\sqrt{32}$，因為 $27<32$，所以 $\sqrt{12}+\sqrt{3}<4\sqrt{2}$。'),
    ]),
    ('q10', 0, [
        err(1, r'\sqrt{2}+\sqrt{8}=\sqrt{10}', r'3\sqrt{2}', r'根號不能直接相加。先化成最簡根式：$\sqrt{8}=2\sqrt{2}$，再合併同類方根：$\sqrt{2}+2\sqrt{2}=3\sqrt{2}$。'),
        err(0, r'5\sqrt{2}-\sqrt{2}=5', r'4\sqrt{2}', r'$\sqrt{2}$ 的係數是 $1$：$5\sqrt{2}-\sqrt{2}=(5-1)\sqrt{2}=4\sqrt{2}$，根號不會消失。'),
        err(2, r'\sqrt{3}+\sqrt{3}=\sqrt{6}', r'2\sqrt{3}', r'同類方根相加是係數相加，根號內不相加：$\sqrt{3}+\sqrt{3}=(1+1)\sqrt{3}=2\sqrt{3}$。'),
        err(3, r'\sqrt{12}-\sqrt{3}=3', r'\sqrt{3}', r'根號內不能直接相減（$12-3=9$ 再開方是錯的）。$\sqrt{12}=2\sqrt{3}$，$2\sqrt{3}-\sqrt{3}=\sqrt{3}$。'),
        err(4, r'\sqrt{50}-\sqrt{2}=\sqrt{48}', r'4\sqrt{2}', r'根號內不能直接相減。$\sqrt{50}=5\sqrt{2}$，$5\sqrt{2}-\sqrt{2}=4\sqrt{2}$。'),
        err(5, r'\sqrt{6}(\sqrt{2}+1)=\sqrt{12}+1', r'2\sqrt{3}+\sqrt{6}', r'分配律要每一項都乘，$1$ 也要乘 $\sqrt{6}$：$\sqrt{6}(\sqrt{2}+1)=\sqrt{12}+\sqrt{6}=2\sqrt{3}+\sqrt{6}$。'),
    ]),
]

C_LINKS = dict(
    activities={
        'c-predict': ['q9'], 'c-like': ['q2', 'q3'], 'c-ex7': ['q1', 'q2'], 'c-ex7-practice': ['q1', 'q2'],
        'c-ex8': ['q3', 'q4'], 'c-ex8-practice': ['q3', 'q4'], 'c-ex9': ['q5', 'q6'], 'c-ex9-practice': ['q5', 'q6'],
        'c-ex10': ['q7', 'q8'], 'c-ex10-practice': ['q7', 'q8'], 'c-error': ['q3', 'q10'],
    },
    duelFamilies={'√a ± √b（化成同類方根再合併）': 'q3', '√a(√b ＋ c) 分配律': 'q5'},
)


# ═════════ 2-2(4) 乘法公式與根式 ═════════
D_SLOTS = [
    ('q1', 0, [
        calc(r'(2+\sqrt{3})^2', r'7+4\sqrt{3}', r'$(a+b)^2=a^2+2ab+b^2$：$(2+\sqrt{3})^2=2^2+2\times2\times\sqrt{3}+(\sqrt{3})^2=4+4\sqrt{3}+3=7+4\sqrt{3}$。中間的 $2ab$ 不能漏。', 2),
        calc(r'(\sqrt{5}+2)^2', r'9+4\sqrt{5}', r'$(\sqrt{5}+2)^2=(\sqrt{5})^2+2\times\sqrt{5}\times2+2^2=5+4\sqrt{5}+4=9+4\sqrt{5}$。', 2),
        calc(r'(3+2\sqrt{5})^2', r'29+12\sqrt{5}', r'$(3+2\sqrt{5})^2=3^2+2\times3\times2\sqrt{5}+(2\sqrt{5})^2=9+12\sqrt{5}+20=29+12\sqrt{5}$。注意 $(2\sqrt{5})^2=20$。', 2),
        calc(r'(\sqrt{3}+\sqrt{2})^2', r'5+2\sqrt{6}', r'$(\sqrt{3}+\sqrt{2})^2=(\sqrt{3})^2+2\sqrt{3}\times\sqrt{2}+(\sqrt{2})^2=3+2\sqrt{6}+2=5+2\sqrt{6}$。', 2),
        calc(r'(2\sqrt{2}+1)^2', r'9+4\sqrt{2}', r'$(2\sqrt{2}+1)^2=(2\sqrt{2})^2+2\times2\sqrt{2}\times1+1^2=8+4\sqrt{2}+1=9+4\sqrt{2}$。', 2),
        calc(r'(\sqrt{6}+\sqrt{3})^2', r'9+6\sqrt{2}', r'$(\sqrt{6}+\sqrt{3})^2=6+2\sqrt{18}+3=9+2\times3\sqrt{2}=9+6\sqrt{2}$。', 2),
    ]),
    ('q2', 0, [
        calc(r'(\sqrt{7}-\sqrt{3})^2', r'10-2\sqrt{21}', r'$(a-b)^2=a^2-2ab+b^2$：$(\sqrt{7}-\sqrt{3})^2=7-2\sqrt{21}+3=10-2\sqrt{21}$。不是 $7-3$。', 2),
        calc(r'(\sqrt{5}-1)^2', r'6-2\sqrt{5}', r'$(\sqrt{5}-1)^2=(\sqrt{5})^2-2\times\sqrt{5}\times1+1^2=5-2\sqrt{5}+1=6-2\sqrt{5}$。', 2),
        calc(r'(3-\sqrt{2})^2', r'11-6\sqrt{2}', r'$(3-\sqrt{2})^2=9-6\sqrt{2}+2=11-6\sqrt{2}$。', 2),
        calc(r'(2\sqrt{3}-1)^2', r'13-4\sqrt{3}', r'$(2\sqrt{3}-1)^2=(2\sqrt{3})^2-2\times2\sqrt{3}\times1+1=12-4\sqrt{3}+1=13-4\sqrt{3}$。', 2),
        calc(r'(\sqrt{6}-\sqrt{2})^2', r'8-4\sqrt{3}', r'$(\sqrt{6}-\sqrt{2})^2=6-2\sqrt{12}+2=8-2\times2\sqrt{3}=8-4\sqrt{3}$。', 2),
        calc(r'(3\sqrt{2}-2\sqrt{3})^2', r'30-12\sqrt{6}', r'$(3\sqrt{2}-2\sqrt{3})^2=(3\sqrt{2})^2-2\times3\sqrt{2}\times2\sqrt{3}+(2\sqrt{3})^2=18-12\sqrt{6}+12=30-12\sqrt{6}$。', 2),
    ]),
    ('q3', 1, [
        calc_c(r'(3+\sqrt{5})(3-\sqrt{5})', '4', r'平方差公式 $(a+b)(a-b)=a^2-b^2$：$3^2-(\sqrt{5})^2=9-5=4$，根號不見了。'),
        calc_c(r'(\sqrt{7}+2)(\sqrt{7}-2)', '3', r'$(\sqrt{7})^2-2^2=7-4=3$。'),
        calc_c(r'(2\sqrt{2}+1)(2\sqrt{2}-1)', '7', r'$(2\sqrt{2})^2-1^2=8-1=7$。注意 $(2\sqrt{2})^2=8$。'),
        calc_c(r'(4-\sqrt{11})(4+\sqrt{11})', '5', r'$4^2-(\sqrt{11})^2=16-11=5$。'),
        calc_c(r'(3\sqrt{2}-4)(3\sqrt{2}+4)', '2', r'$(3\sqrt{2})^2-4^2=18-16=2$。'),
        calc_c(r'(1+2\sqrt{3})(1-2\sqrt{3})', '-11', r'$1^2-(2\sqrt{3})^2=1-12=-11$。'),
    ]),
    ('q4', 1, [
        calc_c(r'(\sqrt{3}+\sqrt{5})(\sqrt{3}-\sqrt{5})', '-2', r'$(\sqrt{3})^2-(\sqrt{5})^2=3-5=-2$。是前面的平方減後面的平方，順序不能反。'),
        calc_c(r'(\sqrt{6}+\sqrt{2})(\sqrt{6}-\sqrt{2})', '4', r'$(\sqrt{6})^2-(\sqrt{2})^2=6-2=4$。'),
        calc_c(r'(\sqrt{10}+\sqrt{3})(\sqrt{10}-\sqrt{3})', '7', r'$(\sqrt{10})^2-(\sqrt{3})^2=10-3=7$。'),
        calc_c(r'(2\sqrt{3}+\sqrt{5})(2\sqrt{3}-\sqrt{5})', '7', r'$(2\sqrt{3})^2-(\sqrt{5})^2=12-5=7$。'),
        calc_c(r'(\sqrt{2}-\sqrt{7})(\sqrt{2}+\sqrt{7})', '-5', r'$(\sqrt{2})^2-(\sqrt{7})^2=2-7=-5$。'),
        word(r'如圖，長方形的長是 $(\sqrt{11}+\sqrt{5})$ 公分、寬是 $(\sqrt{11}-\sqrt{5})$ 公分，求它的面積。', '6', '平方公分',
             r'(\sqrt{11}+\sqrt{5})(\sqrt{11}-\sqrt{5})',
             r'面積＝長×寬，用平方差公式：$(\sqrt{11}+\sqrt{5})(\sqrt{11}-\sqrt{5})=(\sqrt{11})^2-(\sqrt{5})^2=11-5=6$（平方公分）。', 2,
             rect_fig(float(sqrt(11) + sqrt(5)), float(sqrt(11) - sqrt(5)), '√11＋√5 公分', '√11－√5 公分')),
    ]),
    ('q5', 2, [
        ratz_q(r'\dfrac{1}{\sqrt{5}-\sqrt{3}}', r'\dfrac{\sqrt{5}+\sqrt{3}}{2}',
               r'分子、分母同乘 $\sqrt{5}+\sqrt{3}$：$\dfrac{1}{\sqrt{5}-\sqrt{3}}=\dfrac{\sqrt{5}+\sqrt{3}}{(\sqrt{5}-\sqrt{3})(\sqrt{5}+\sqrt{3})}=\dfrac{\sqrt{5}+\sqrt{3}}{5-3}=\dfrac{\sqrt{5}+\sqrt{3}}{2}$。'),
        ratz_q(r'\dfrac{1}{\sqrt{3}+\sqrt{2}}', r'\sqrt{3}-\sqrt{2}',
               r'同乘 $\sqrt{3}-\sqrt{2}$：$\dfrac{\sqrt{3}-\sqrt{2}}{(\sqrt{3}+\sqrt{2})(\sqrt{3}-\sqrt{2})}=\dfrac{\sqrt{3}-\sqrt{2}}{3-2}=\sqrt{3}-\sqrt{2}$。'),
        ratz_q(r'\dfrac{2}{\sqrt{5}+\sqrt{3}}', r'\sqrt{5}-\sqrt{3}',
               r'同乘 $\sqrt{5}-\sqrt{3}$：$\dfrac{2(\sqrt{5}-\sqrt{3})}{(\sqrt{5})^2-(\sqrt{3})^2}=\dfrac{2(\sqrt{5}-\sqrt{3})}{2}=\sqrt{5}-\sqrt{3}$。'),
        ratz_q(r'\dfrac{1}{\sqrt{7}-\sqrt{5}}', r'\dfrac{\sqrt{7}+\sqrt{5}}{2}',
               r'同乘 $\sqrt{7}+\sqrt{5}$：$\dfrac{\sqrt{7}+\sqrt{5}}{(\sqrt{7}-\sqrt{5})(\sqrt{7}+\sqrt{5})}=\dfrac{\sqrt{7}+\sqrt{5}}{7-5}=\dfrac{\sqrt{7}+\sqrt{5}}{2}$。'),
        ratz_q(r'\dfrac{4}{\sqrt{6}+\sqrt{2}}', r'\sqrt{6}-\sqrt{2}',
               r'同乘 $\sqrt{6}-\sqrt{2}$：$\dfrac{4(\sqrt{6}-\sqrt{2})}{6-2}=\dfrac{4(\sqrt{6}-\sqrt{2})}{4}=\sqrt{6}-\sqrt{2}$。'),
        calc(r'\dfrac{1}{\sqrt{6}+\sqrt{5}}+\dfrac{1}{\sqrt{6}-\sqrt{5}}', r'2\sqrt{6}',
             r'兩個分數分別有理化：$\dfrac{1}{\sqrt{6}+\sqrt{5}}=\dfrac{\sqrt{6}-\sqrt{5}}{6-5}=\sqrt{6}-\sqrt{5}$，$\dfrac{1}{\sqrt{6}-\sqrt{5}}=\dfrac{\sqrt{6}+\sqrt{5}}{6-5}=\sqrt{6}+\sqrt{5}$，相加：$(\sqrt{6}-\sqrt{5})+(\sqrt{6}+\sqrt{5})=2\sqrt{6}$。', 3),
    ]),
    ('q6', 2, [
        ratz_q(r'\dfrac{3}{\sqrt{7}-2}', r'\sqrt{7}+2',
               r'同乘 $\sqrt{7}+2$：$\dfrac{3(\sqrt{7}+2)}{(\sqrt{7})^2-2^2}=\dfrac{3(\sqrt{7}+2)}{3}=\sqrt{7}+2$。分母是 $7-4$，不是 $7-2$。'),
        ratz_q(r'\dfrac{1}{\sqrt{3}+2}', r'2-\sqrt{3}',
               r'同乘 $2-\sqrt{3}$：$\dfrac{2-\sqrt{3}}{(2+\sqrt{3})(2-\sqrt{3})}=\dfrac{2-\sqrt{3}}{4-3}=2-\sqrt{3}$。'),
        ratz_q(r'\dfrac{2}{\sqrt{5}+1}', r'\dfrac{\sqrt{5}-1}{2}',
               r'同乘 $\sqrt{5}-1$：$\dfrac{2(\sqrt{5}-1)}{5-1}=\dfrac{2(\sqrt{5}-1)}{4}=\dfrac{\sqrt{5}-1}{2}$，記得約分。'),
        ratz_q(r'\dfrac{4}{3-\sqrt{5}}', r'3+\sqrt{5}',
               r'同乘 $3+\sqrt{5}$：$\dfrac{4(3+\sqrt{5})}{3^2-(\sqrt{5})^2}=\dfrac{4(3+\sqrt{5})}{4}=3+\sqrt{5}$。'),
        ratz_q(r'\dfrac{6}{\sqrt{10}+2}', r'\sqrt{10}-2',
               r'同乘 $\sqrt{10}-2$：$\dfrac{6(\sqrt{10}-2)}{10-4}=\dfrac{6(\sqrt{10}-2)}{6}=\sqrt{10}-2$。'),
        ratz_q(r'\dfrac{1}{2\sqrt{2}-1}', r'\dfrac{2\sqrt{2}+1}{7}',
               r'同乘 $2\sqrt{2}+1$：$\dfrac{2\sqrt{2}+1}{(2\sqrt{2})^2-1^2}=\dfrac{2\sqrt{2}+1}{8-1}=\dfrac{2\sqrt{2}+1}{7}$。'),
    ]),
    ('q7', 2, [
        ratz_q(r'\dfrac{\sqrt{2}}{\sqrt{6}+\sqrt{5}}', r'2\sqrt{3}-\sqrt{10}',
               r'同乘 $\sqrt{6}-\sqrt{5}$：分母 $(\sqrt{6})^2-(\sqrt{5})^2=1$，分子 $\sqrt{2}(\sqrt{6}-\sqrt{5})=\sqrt{12}-\sqrt{10}=2\sqrt{3}-\sqrt{10}$。'),
        ratz_q(r'\dfrac{\sqrt{3}}{\sqrt{6}-\sqrt{2}}', r'\dfrac{3\sqrt{2}+\sqrt{6}}{4}',
               r'同乘 $\sqrt{6}+\sqrt{2}$：分母 $6-2=4$，分子 $\sqrt{3}(\sqrt{6}+\sqrt{2})=\sqrt{18}+\sqrt{6}=3\sqrt{2}+\sqrt{6}$，得 $\dfrac{3\sqrt{2}+\sqrt{6}}{4}$。'),
        ratz_q(r'\dfrac{\sqrt{2}}{\sqrt{3}-1}', r'\dfrac{\sqrt{6}+\sqrt{2}}{2}',
               r'同乘 $\sqrt{3}+1$：分母 $3-1=2$，分子 $\sqrt{2}(\sqrt{3}+1)=\sqrt{6}+\sqrt{2}$，得 $\dfrac{\sqrt{6}+\sqrt{2}}{2}$。'),
        ratz_q(r'\dfrac{\sqrt{5}}{\sqrt{10}+\sqrt{5}}', r'\sqrt{2}-1',
               r'同乘 $\sqrt{10}-\sqrt{5}$：分母 $10-5=5$，分子 $\sqrt{5}(\sqrt{10}-\sqrt{5})=\sqrt{50}-5=5\sqrt{2}-5$，所以 $\dfrac{5\sqrt{2}-5}{5}=\sqrt{2}-1$。', 3),
        ratz_q(r'\dfrac{\sqrt{3}+1}{\sqrt{3}-1}', r'2+\sqrt{3}',
               r'同乘 $\sqrt{3}+1$：分母 $3-1=2$，分子 $(\sqrt{3}+1)^2=3+2\sqrt{3}+1=4+2\sqrt{3}$，所以 $\dfrac{4+2\sqrt{3}}{2}=2+\sqrt{3}$。', 3),
        ratz_q(r'\dfrac{\sqrt{6}}{\sqrt{3}+\sqrt{2}}', r'3\sqrt{2}-2\sqrt{3}',
               r'同乘 $\sqrt{3}-\sqrt{2}$：分母 $3-2=1$，分子 $\sqrt{6}(\sqrt{3}-\sqrt{2})=\sqrt{18}-\sqrt{12}=3\sqrt{2}-2\sqrt{3}$。'),
    ]),
    ('q8', 0, [
        rel([r'\sqrt{3}+\sqrt{2}', r'\sqrt{5}'], r'\sqrt{3}+\sqrt{2}>\sqrt{5}',
            r'兩數都是正數，比較平方：$(\sqrt{3}+\sqrt{2})^2=5+2\sqrt{6}$，$(\sqrt{5})^2=5$，因為 $5+2\sqrt{6}>5$，所以 $\sqrt{3}+\sqrt{2}>\sqrt{5}$。', 3),
        rel([r'\sqrt{7}-\sqrt{5}', r'\sqrt{2}'], r'\sqrt{7}-\sqrt{5}<\sqrt{2}',
            r'兩數都是正數：$(\sqrt{7}-\sqrt{5})^2=12-2\sqrt{35}$，$(\sqrt{2})^2=2$。相減 $12-2\sqrt{35}-2=10-2\sqrt{35}=\sqrt{100}-\sqrt{140}<0$，所以 $\sqrt{7}-\sqrt{5}<\sqrt{2}$。', 3),
        rel([r'\sqrt{2}+\sqrt{8}', r'\sqrt{18}'], r'\sqrt{2}+\sqrt{8}=\sqrt{18}',
            r'$(\sqrt{2}+\sqrt{8})^2=2+2\sqrt{16}+8=18=(\sqrt{18})^2$，兩數都是正數、平方相等，所以 $\sqrt{2}+\sqrt{8}=\sqrt{18}$（也可以化簡：兩數都等於 $3\sqrt{2}$）。', 3),
        rel([r'\sqrt{5}+\sqrt{3}', r'\sqrt{6}+\sqrt{2}'], r'\sqrt{5}+\sqrt{3}>\sqrt{6}+\sqrt{2}',
            r'兩數都是正數，比較平方：$(\sqrt{5}+\sqrt{3})^2=8+2\sqrt{15}$，$(\sqrt{6}+\sqrt{2})^2=8+2\sqrt{12}$，因為 $\sqrt{15}>\sqrt{12}$，所以 $\sqrt{5}+\sqrt{3}>\sqrt{6}+\sqrt{2}$。', 3),
        rel([r'2+\sqrt{3}', r'\sqrt{6}+\sqrt{2}'], r'2+\sqrt{3}<\sqrt{6}+\sqrt{2}',
            r'兩數都是正數，比較平方：$(2+\sqrt{3})^2=7+4\sqrt{3}$，$(\sqrt{6}+\sqrt{2})^2=8+2\sqrt{12}=8+4\sqrt{3}$，因為 $7+4\sqrt{3}<8+4\sqrt{3}$，所以 $2+\sqrt{3}<\sqrt{6}+\sqrt{2}$。', 3),
        rel([r'3\sqrt{2}', r'\sqrt{5}+\sqrt{3}'], r'3\sqrt{2}>\sqrt{5}+\sqrt{3}',
            r'兩數都是正數，比較平方：$(3\sqrt{2})^2=18$，$(\sqrt{5}+\sqrt{3})^2=8+2\sqrt{15}$。因為 $2\sqrt{15}=\sqrt{60}<\sqrt{100}=10$，所以 $8+2\sqrt{15}<18$，得 $3\sqrt{2}>\sqrt{5}+\sqrt{3}$。', 3),
    ]),
    ('q9', 0, [
        calc_c(r'(\sqrt{3}+1)^2-(\sqrt{3}-1)^2', r'4\sqrt{3}',
               r'$(\sqrt{3}+1)^2=4+2\sqrt{3}$，$(\sqrt{3}-1)^2=4-2\sqrt{3}$，相減：$(4+2\sqrt{3})-(4-2\sqrt{3})=4\sqrt{3}$。', 2),
        calc_c(r'(2+\sqrt{5})^2+(2-\sqrt{5})^2', '18',
               r'$(2+\sqrt{5})^2=9+4\sqrt{5}$，$(2-\sqrt{5})^2=9-4\sqrt{5}$，相加：$(9+4\sqrt{5})+(9-4\sqrt{5})=18$。', 2),
        calc_c(r'(\sqrt{6}+\sqrt{2})(\sqrt{6}-\sqrt{2})+(\sqrt{2})^2', '6',
               r'$(\sqrt{6}+\sqrt{2})(\sqrt{6}-\sqrt{2})=6-2=4$，$(\sqrt{2})^2=2$，相加 $4+2=6$。', 2),
        subs_q({'x': r'\sqrt{3}+1'}, r'x^2-2x', '2',
               r'$x^2=(\sqrt{3}+1)^2=4+2\sqrt{3}$，$2x=2\sqrt{3}+2$，所以 $x^2-2x=(4+2\sqrt{3})-(2\sqrt{3}+2)=2$。'),
        subs_q({'x': r'\sqrt{5}+\sqrt{3}', 'y': r'\sqrt{5}-\sqrt{3}'}, r'x^2+y^2', '16',
               r'$x^2=(\sqrt{5}+\sqrt{3})^2=8+2\sqrt{15}$，$y^2=(\sqrt{5}-\sqrt{3})^2=8-2\sqrt{15}$，所以 $x^2+y^2=(8+2\sqrt{15})+(8-2\sqrt{15})=16$。'),
        calc_c(r'(2\sqrt{3}-1)^2+\sqrt{48}', '13',
               r'$(2\sqrt{3}-1)^2=12-4\sqrt{3}+1=13-4\sqrt{3}$，$\sqrt{48}=4\sqrt{3}$，相加：$13-4\sqrt{3}+4\sqrt{3}=13$。', 2),
    ]),
    ('q10', 0, [
        err(0, r'(\sqrt{3}+\sqrt{2})^2=5', r'5+2\sqrt{6}', r'漏了中間的 $2ab$：$(\sqrt{3}+\sqrt{2})^2=3+2\sqrt{6}+2=5+2\sqrt{6}$。'),
        err(1, r'(\sqrt{5}-1)^2=4', r'6-2\sqrt{5}', r'$(a-b)^2$ 不是 $a^2-b^2$：$(\sqrt{5}-1)^2=5-2\sqrt{5}+1=6-2\sqrt{5}$。'),
        err(2, r'\dfrac{1}{\sqrt{2}+1}=\sqrt{2}+1', r'\sqrt{2}-1',
            r'要乘「共軛」$\sqrt{2}-1$（中間的符號相反），分母才會變成整數：$\dfrac{1}{\sqrt{2}+1}=\dfrac{\sqrt{2}-1}{(\sqrt{2}+1)(\sqrt{2}-1)}=\dfrac{\sqrt{2}-1}{2-1}=\sqrt{2}-1$。'),
        err(3, r'(2+\sqrt{3})(2-\sqrt{3})=7', '1', r'平方差公式是相減：$(2+\sqrt{3})(2-\sqrt{3})=2^2-(\sqrt{3})^2=4-3=1$。'),
        err(4, r'(\sqrt{6}-\sqrt{2})^2=4', r'8-4\sqrt{3}', r'不能只算 $6-2$，中間還有 $-2ab$：$(\sqrt{6}-\sqrt{2})^2=6-2\sqrt{12}+2=8-4\sqrt{3}$。'),
        err(5, r'(\sqrt{5}+\sqrt{3})(\sqrt{5}-\sqrt{3})=8', '2', r'平方差是相減，不是相加：$(\sqrt{5})^2-(\sqrt{3})^2=5-3=2$。'),
        err(6, r'\sqrt{5}\div\sqrt{2}=\sqrt{3}', r'\dfrac{\sqrt{10}}{2}',
            r'根號相除是根號內相除，不是相減：$\sqrt{5}\div\sqrt{2}=\sqrt{\dfrac{5}{2}}=\dfrac{\sqrt{5}}{\sqrt{2}}=\dfrac{\sqrt{10}}{2}$。'),
    ]),
]

D_LINKS = dict(
    activities={
        'd-ex11': ['q1'], 'd-ex11-practice': ['q2'], 'd-thinking': ['q8'], 'd-ex12': ['q3'], 'd-ex12-practice': ['q4'],
        'd-conjugate': ['q5'], 'd-ex13': ['q6', 'q7'], 'd-ex13-practice': ['q6', 'q7'], 'd-error': ['q6', 'q10'],
    },
    duelFamilies={'(√a ＋ √b)(√a − √b)': 'q4', '(c ＋ √b)²': 'q1', '(√a − √b)²': 'q2', 'c ÷ (√a − √b) 分母有理化': 'q5'},
)

# 魔王戰（整節）：raid 題目的 topic → 「課程 id:題位 id」。課後檢核搬過去的題型對回原本的課；新增題型對到最接近的題位。
RAID_EXTRA = {
    '根式乘法': 'g8-2-2a:q3',
    '比大小': 'g8-2-2a:q7',                      # 幾個根式比大小（係數移進根號）
    '化成最簡根式': 'g8-2-2b:q1',
    '哪一個相等': 'g8-2-2b:q1',                  # a√b 和 √n 互換
    '分母有理化的結果': 'g8-2-2b:q3',
    '近似值': 'g8-2-2b:q3',                      # 先有理化 a÷√n 再代近似值
    '長方形的面積': 'g8-2-2b:q6',                # √a×√b 再化成最簡
    '同類方根相加': 'g8-2-2c:q1',
    '同類方根': 'g8-2-2c:q3',                    # 化簡後判斷是不是同類方根
    '長方形的周長': 'g8-2-2c:q3',
    '兩個正方形': 'g8-2-2c:q3',
    '平方差的面積': 'g8-2-2d:q4',
    '共軛有理化後相加': 'g8-2-2d:q5',
    '代入求值': 'g8-2-2d:q9',
    'x、y 的綜合': 'g8-2-2d:q9',
    '乘法公式綜合': 'g8-2-2d:q9',
    '哪一個算對了？（常見錯誤）': 'g8-2-2d:q10',  # 2-2(1)(3)(4) 的 q10 同名，魔王戰只有一個 topic，對到整節的最後一課
    '哪一個正確（運算規則）': 'g8-2-2d:q10',
}
RAID_SKIP = {'估算'}  # 2-1 的估算，2-2 沒有對應題型（寫進 links.raidSkip，學習紀錄只算總答對率；要不要補題型待老師決定）

# 多小題的 IRS 頁：每一小題各自對到的題型（順序＝課程 JSON 的 items 順序）。
# 學習紀錄逐小題記錄；沒列的多小題頁若整頁對到兩個以上題型，check-homework 會報錯。
ITEM_LINKS = {
    'g8-2-2a': {
        'a-notation': [['q1'], ['q1'], ['q2']],
        'a-ex1': [['q3'], ['q4']],
        'a-ex1-practice': [['q3'], ['q4'], ['q6']],
        'a-ex3': [['q8'], ['q9']],
        'a-ex3-practice': [['q8'], ['q9']],
    },
    'g8-2-2b': {
        'b-ex4': [['q2'], ['q1']],
        'b-ex4-practice': [['q2'], ['q1']],
        'b-ex5': [['q3'], ['q4'], ['q5']],
        'b-ex5-practice': [['q3'], ['q4'], ['q5']],
        'b-ex6': [['q8'], ['q7']],
        'b-ex6-practice': [['q8'], ['q7']],
    },
    'g8-2-2c': {
        'c-ex7': [['q1'], ['q2']],
        'c-ex7-practice': [['q1'], ['q2']],
        'c-ex8': [['q3'], ['q4']],
        'c-ex8-practice': [['q3'], ['q4']],
        'c-ex9': [['q5'], ['q6']],
        'c-ex9-practice': [['q5'], ['q6']],
        'c-ex10': [['q8'], ['q7']],
        'c-ex10-practice': [['q8'], ['q7']],
    },
    'g8-2-2d': {
        'd-ex13': [['q6'], ['q7']],
        'd-ex13-practice': [['q7'], ['q6']],
    },
}

LESSONS = [
    ('g8-2-2a', '2-2(1) 根式的乘除', '八上課本 2-2 p.73–76', A_SLOTS, A_LINKS),
    ('g8-2-2b', '2-2(2) 最簡根式與分母有理化', '八上課本 2-2 p.77–81', B_SLOTS, B_LINKS),
    ('g8-2-2c', '2-2(3) 根式的加減與混合運算', '八上課本 2-2 p.82–85', C_SLOTS, C_LINKS),
    ('g8-2-2d', '2-2(4) 乘法公式與根式', '八上課本 2-2 p.86–88（含第 1 章乘法公式）', D_SLOTS, D_LINKS),
]


# ═════════ 核算 ═════════
def solution_checks(sol, subs, where):
    n, vals = 0, []
    for seg in segs(sol):
        parts, ops = split_rel(seg)
        pv = []
        for p in parts:
            try:
                v = P(p, subs)
                v = None if v.free_symbols else v
            except ParseError:
                v = None
            pv.append(v)
            if v is not None:
                vals.append(v)
        for a, b, op in zip(pv, pv[1:], ops):
            if a is None or b is None:
                continue
            assert rel_ok(a, b, op), f'{where}：詳解 ${seg}$ 不成立（{op}）'
            n += 1
    return n, vals


def verify(v, where):
    c = v['_check']
    subs = {k: P(x) for k, x in c.get('subs', {}).items()}
    nsol, sol_vals = solution_checks(v['solution'], subs, where)
    assert nsol >= 1, f'{where}：詳解裡沒有可以核算的式子'
    kind = c['kind']
    stem_segs = segs(v['stem'])
    if kind in ('value', 'error'):
        if kind == 'error':
            claim = stem_segs[0]
            L, Rr = claim.split('=')
            assert not eq(P(L), P(Rr)), f'{where}：題目說錯，但 ${claim}$ 其實成立'
            want = P(L)
        elif 'q' in c:
            assert c['q'] in stem_segs, f'{where}：算式不在題目裡'
            want = P(c['q'], subs)
        else:
            want = P(c['expr'])
        a = segs(v['answer'])[0]
        assert eq(P(a), want), f'{where}：答案 {a} ≠ {want}'
        assert is_simplest(a), f'{where}：答案 {a} 不是最簡根式'
        assert any(eq(x, want) for x in sol_vals), f'{where}：詳解裡沒有出現答案的值'
    elif kind == 'relation':
        a = segs(v['answer'])[0]
        parts, ops = split_rel(a)
        items = c['items']
        assert stem_segs[:len(items)] == items, f'{where}：題目的數和 items 不一致'
        assert sorted(parts) == sorted(items), f'{where}：答案的兩邊 {parts} 不是題目的數 {items}'
        vals = [P(p) for p in parts]
        for x, y, op in zip(vals, vals[1:], ops):
            assert rel_ok(x, y, op), f'{where}：答案 ${a}$ 不成立'
        assert f'${a}$' in v['solution'], f'{where}：詳解最後沒有寫出答案的關係式'
    elif kind == 'judge':
        items = c['items']
        assert stem_segs == [t for t, _, _ in items], f'{where}：題目和 items 不一致'
        assert segs(v['answer']) == [x for _, x, _ in items if x], f'{where}：答案和 items 不一致'
        for t, x, _ in items:
            assert is_simplest(t) == (x is None), f'{where}：{t} 是否最簡的判斷錯了'
            if x:
                assert eq(P(x), P(t)) and is_simplest(x), f'{where}：{t} 化簡成 {x} 不對'
    else:
        raise ValueError(kind)
    return nsol


def build():
    total = checks = 0
    raid_map = {}
    # 步驟格鬥是累積的：後面的課也有前面課的 family，用「課程 id:題位 id」對回原本的課
    prev_families = {}
    for lid, title, book, slots, links in LESSONS:
        quiz = json.loads((ROOT / 'content/quizzes' / f'{lid}.json').read_text(encoding='utf8'))
        topics = {s['id']: s['topic'] for s in quiz['slots']}
        lesson = json.loads((ROOT / 'content/lessons' / f'{lid}.json').read_text(encoding='utf8'))
        assert [s[0] for s in slots] == list(topics), f'{lid}：題位和課後檢核不一致'
        out_slots = []
        for sid, obj, variants in slots:
            assert 0 <= obj < len(lesson['objectives'])
            assert len(variants) >= 5, f'{lid}:{sid} 只有 {len(variants)} 題'
            for k, v in enumerate(variants, 1):
                checks += verify(v, f'{lid}:{sid}-{k}（{topics[sid]}）')
                total += 1
            out_slots.append(dict(id=sid, topic=topics[sid], objective=obj, performance=['n-IV-5'], content=['N-8-1'],
                                  variants=[{k: x for k, x in v.items() if k != '_check'} for v in variants]))
            raid_map[topics[sid]] = f'{lid}:{sid}'
        out_links = dict(activities=links['activities'])
        if lid in ITEM_LINKS:
            out_links['items'] = ITEM_LINKS[lid]
        if lid == 'g8-2-2d':
            raid = json.loads((ROOT / 'content/raids/g8-2-2d.json').read_text(encoding='utf8'))
            rt = {}
            for pool in raid['pools'].values():
                for q in pool:
                    t = q['topic']
                    if t in RAID_SKIP or t in rt:
                        continue
                    ref = RAID_EXTRA.get(t) or raid_map.get(t)
                    assert ref, f'魔王戰 topic「{t}」沒有對應'
                    rt[t] = ref
            out_links['raidTopics'] = rt
            out_links['raidSkip'] = sorted(RAID_SKIP)
        duel = json.loads((ROOT / 'content/duels' / f'{lid}.json').read_text(encoding='utf8'))
        fams = {p['family'] for p in duel['problems']}
        for f in links['duelFamilies']:
            assert f in fams, f'{lid}：步驟格鬥沒有 family「{f}」'
        own = links['duelFamilies']
        out_links['duelFamilies'] = {**{f: prev_families[f] for f in sorted(fams) if f in prev_families and f not in own}, **own}
        missing = fams - set(out_links['duelFamilies'])
        assert not missing, f'{lid}：步驟格鬥 family 沒有對應題型：{sorted(missing)}'
        prev_families.update({f: f'{lid}:{q}' for f, q in own.items()})
        data = dict(lessonId=lid, section='8-2-2', title=title,
                    source=f'{book}（題目改寫自課後檢核並自編，答案與詳解已用 SymPy 核算）；{SOURCE_CURR}',
                    curriculum=dict(performance=PERF, content=CONT), slots=out_slots, links=out_links)
        path = ROOT / 'content/homework' / f'{lid}.json'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        n = sum(len(s['variants']) for s in out_slots)
        print(f'✓ {lid}：{len(out_slots)} 個題型、{n} 題 → {path.relative_to(ROOT)}')
    print(f'詳解中核算了 {checks} 個等式／不等式')
    print(f'{total} 題全部一致')


if __name__ == '__main__':
    build()
