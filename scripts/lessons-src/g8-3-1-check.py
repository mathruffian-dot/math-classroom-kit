r"""八上 3-1：用 SymPy 核算盤點清單的官方答案與課程裡每一格填空。

用法（在 math-classroom-kit 執行）：
  node scripts/lessons-src/g8-3-1.mjs          # 產生 scripts/lessons-src/g8-3-1-checks.json
  python -X utf8 scripts/lessons-src/g8-3-1-check.py
inventory 每一題 { lhs, rhs }：原式與官方答案展開後要相等。
checks 每一筆 { id, lhs, rhs, answer }：rhs 裡的 B 是學生要填的 □；代入 answer 後要等於 lhs，而且 □ 只有這一個解。
"""
import json
import sys
from pathlib import Path

from sympy import Poly, Rational, expand, solve, symbols, sympify

ROOT = Path(__file__).resolve().parents[2]
x, y, B = symbols('x y B')
NAMES = {'x': x, 'y': y, 'B': B}
expr = lambda s: sympify(s, locals=NAMES)  # noqa: E731
bad = 0

inventory = json.loads((ROOT / 'content/sources/g8-3-1-inventory.json').read_text(encoding='utf8'))
n_inv = 0
for item in inventory['items']:
    for p in item.get('problems', []):
        if 'lhs' not in p:
            continue
        n_inv += 1
        if expand(expr(p['lhs']) - expr(p['rhs'])) != 0:
            bad += 1
            print(f"✗ {item['label']} {p['expr']}：{p['lhs']} ≠ {p['rhs']}")

rows = json.loads((ROOT / 'scripts/lessons-src/g8-3-1-checks.json').read_text(encoding='utf8'))
for r in rows:
    diff = expand(expr(r['lhs']) - expr(r['rhs']))
    if not diff.has(B):
        bad += 1
        print(f"✗ {r['id']}：rhs 沒有 □")
        continue
    want = Rational(r['answer'].replace('−', '-'))
    if expand(diff.subs(B, want)) != 0:
        bad += 1
        print(f"✗ {r['id']}：{r['lhs']} ≠ {r['rhs']}（□＝{r['answer']}）")
        continue
    # 恆等式要每一項係數都相等，□ 才算解
    coeffs = Poly(diff, x, y).coeffs()
    roots = {s for c in coeffs if c.has(B) for s in solve(c, B)}
    valid = [s for s in roots if all(c.subs(B, s) == 0 for c in coeffs)]
    if valid != [want]:
        bad += 1
        print(f"✗ {r['id']}：□ 的解是 {valid}，不是只有 {want}")
print(f"{'✓' if not bad else '✗'} 官方答案 {n_inv} 題、課程填空 {len(rows)} 格，{bad} 筆不一致")
sys.exit(1 if bad else 0)
