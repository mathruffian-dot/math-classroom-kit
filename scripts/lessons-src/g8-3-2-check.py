r"""八上 3-2：用 SymPy 核算盤點清單的官方答案、課程裡每一格填空與每個式子選項。

用法（在 math-classroom-kit 執行）：
  node scripts/lessons-src/g8-3-2.mjs          # 產生 scripts/lessons-src/g8-3-2-checks.json
  python -X utf8 scripts/lessons-src/g8-3-2-check.py

inventory 每一題 { lhs, rhs }：原式與教用版答案展開後要相等（教用版列出的其他寫法 alt 也逐一核對）。
checks：
- kind＝fill：rhs 是分解的形式，未知數 a、b、p、q、B。
  * 只有 B：B 的有理數解必須只有一個，而且等於 answer（同 3-1）。
  * 有 a、b（與正整數 p、q）：p、q 窮舉 1～12，其餘解方程組；保留整數解並套用條件（例如 a<b、p<q），
    問的未知數 ask 在所有解裡只能有一個值，而且等於 answer。有非整數解時，題目一定要寫「整數」。
- kind＝pick：單選題的式子選項，等於原式的選項必須剛好是 correct 那幾個。
"""
import json
import sys
from itertools import product
from pathlib import Path

from sympy import Integer, Poly, Rational, expand, solve, symbols, sympify

ROOT = Path(__file__).resolve().parents[2]
x, y, a, b, p, q, B = symbols('x y a b p q B')
NAMES = {'x': x, 'y': y, 'a': a, 'b': b, 'p': p, 'q': q, 'B': B}
expr = lambda s: sympify(s, locals=NAMES)  # noqa: E731
bad = 0


def fail(msg):
    global bad
    bad += 1
    print('✗', msg)


inventory = json.loads((ROOT / 'content/sources/g8-3-2-inventory.json').read_text(encoding='utf8'))
n_inv = 0
for item in inventory['items']:
    for pr in item.get('problems', []):
        if 'lhs' not in pr:
            continue
        for rhs in [pr['rhs'], *pr.get('alt', [])]:
            n_inv += 1
            if expand(expr(pr['lhs']) - expr(rhs)) != 0:
                fail(f"{item['label']} {pr['expr']}：{pr['lhs']} ≠ {rhs}")


def solutions(lhs, rhs, cond):
    """回傳 (整數解清單, 是否有非整數解)。"""
    unknowns = sorted(rhs.free_symbols - {x, y}, key=str)
    coeffs = [c for c in Poly(expand(lhs - rhs), x, y).coeffs()]
    pos = [s for s in unknowns if s in (p, q)]
    rest = [s for s in unknowns if s not in pos]
    found, nonint = [], False
    for vals in product(range(1, 13), repeat=len(pos)):
        sub = {k: Integer(v) for k, v in zip(pos, vals)}
        eqs = [expand(c.subs(sub)) for c in coeffs]
        eqs = [e for e in eqs if e != 0]
        if any(e.is_number for e in eqs):
            continue
        sols = solve(eqs, rest, dict=True) if eqs else []
        for s in sols:
            full = {**sub, **s}
            if len(full) != len(unknowns) or any(not v.is_number for v in full.values()):
                raise AssertionError(f'{lhs} = {rhs} 的解不是有限個：{s}')
            if not all(v.is_integer for v in full.values()):
                nonint = True
                continue
            env = {str(k): int(v) for k, v in full.items()}
            if cond and not eval(cond, {}, env):  # noqa: S307（條件是產生器寫的，例如 a<b、p<q）
                continue
            found.append(env)
    return found, nonint


rows = json.loads((ROOT / 'scripts/lessons-src/g8-3-2-checks.json').read_text(encoding='utf8'))
n_fill = n_pick = 0
for r in rows:
    if r['kind'] == 'viz':
        continue
    if r['kind'] == 'pick':
        n_pick += 1
        L = expr(r['lhs'])
        truth = [i for i, o in enumerate(r['options']) if expand(L - expr(o)) == 0]
        if truth != sorted(r['correct']):
            fail(f"{r['id']}：等於原式的選項是 {truth}，正解寫的是 {r['correct']}")
        continue
    n_fill += 1
    L, Rr = expr(r['lhs']), expr(r['rhs'])
    want = Rational(r['answer'].replace('−', '-'))
    unknowns = Rr.free_symbols - {x, y}
    if unknowns == {B}:
        diff = expand(L - Rr)
        if expand(diff.subs(B, want)) != 0:
            fail(f"{r['id']}：{r['lhs']} ≠ {r['rhs']}（□＝{r['answer']}）")
            continue
        coeffs = Poly(diff, x, y).coeffs()
        roots = {s for c in coeffs if c.has(B) for s in solve(c, B)}
        valid = [s for s in roots if all(c.subs(B, s) == 0 for c in coeffs)]
        if valid != [want]:
            fail(f"{r['id']}：□ 的解是 {valid}，不是只有 {want}")
        continue
    found, nonint = solutions(L, Rr, r.get('cond', ''))
    values = sorted({s[r['ask']] for s in found})
    if values != [want]:
        fail(f"{r['id']}：{r['ask']} 的整數解是 {values}（{found}），不是只有 {want}")
    if nonint:
        # 題目共用的說明寫在 activity.prompt，「整數」可能寫在小題或共用說明裡：下面從課程 JSON 再確認一次
        r['needsInteger'] = True

# 有非整數解的小題：課程 JSON 裡，這一題的小題或共用說明一定要寫「整數」
lessons = {}
for f in sorted((ROOT / 'content/lessons').glob('g8-3-2*.json')):
    for s in json.loads(f.read_text(encoding='utf8'))['slides']:
        act = s.get('activity')
        if act:
            lessons[act['id']] = act
for r in rows:
    if r.get('needsInteger'):
        aid, k = r['id'].split('#')
        act = lessons.get(aid)
        if not act or '整數' not in act['prompt'] + act['items'][int(k) - 1]['prompt']:
            fail(f"{r['id']}：有非整數解，題目要寫「a、b 是整數」")
    if r['kind'] == 'fill' and r.get('cond'):
        aid, k = r['id'].split('#')
        act = lessons.get(aid)
        text = (act['prompt'] + act['items'][int(k) - 1]['prompt']) if act else ''
        for c in ('a<b', 'p<q'):
            if c in r['cond'] and f'${c}$' not in text and c not in text:
                fail(f"{r['id']}：條件 {c} 沒有寫在題目裡")

print(f"{'✓' if not bad else '✗'} 官方答案 {n_inv} 式、課程填空 {n_fill} 格、式子選項 {n_pick} 題，{bad} 筆不一致")
sys.exit(1 if bad else 0)
