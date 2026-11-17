"""十字交乘（大板操作）題目的 SymPy 驗算。

先用 cross-export.mjs 匯出固定 seed 的抽樣（每級 300 題；L1 在範圍內只有 200 種，全部匯出），
再逐題檢查：
  1. k(px+q)(rx+s) 展開後等於原式 ax²+bx+c（整數係數）
  2. SymPy factor() 的結果和題目的因式分解相同（相差只在常數單位與因式順序）
  3. 內部三項式是本原的（gcd = 1）、p、r > 0、k 是原式係數的最大公因數（帶首項的符號）
  4. 卡片裡用得到的擺法中，判對的只有這個因式分解

用法（在 math-classroom-kit 目錄）：
  C:\\AI\\H3\\venv\\Scripts\\python.exe -B -X utf8 scripts/quiz-src/cross-check.py [每級題數]
"""
import json
import os
import subprocess
import sys
import tempfile
from itertools import permutations
from math import gcd

from sympy import Integer, Poly, expand, factor_list, symbols

x = symbols("x")


def main() -> int:
    per = sys.argv[1] if len(sys.argv) > 1 else "300"
    out = os.path.join(tempfile.gettempdir(), "mck-cross-sample.json")
    subprocess.run(["node", "scripts/quiz-src/cross-export.mjs", out, per], check=True, shell=os.name == "nt")
    with open(out, encoding="utf-8") as f:
        items = json.load(f)
    os.remove(out)

    counts = {1: 0, 2: 0, 3: 0}
    errors = []
    for it in items:
        k, p, q, r, s = it["k"], it["p"], it["q"], it["r"], it["s"]
        a, b, c = it["poly"]["a"], it["poly"]["b"], it["poly"]["c"]
        orig = a * x**2 + b * x + c
        fac = Integer(k) * (p * x + q) * (r * x + s)
        if expand(fac - orig) != 0:
            errors.append(f"{it['key']}: expansion mismatch")
            continue
        if not all(isinstance(v, int) for v in (a, b, c, k, p, q, r, s)):
            errors.append(f"{it['key']}: non-integer")
        content, factors = factor_list(orig)
        # SymPy：content × Π(因式^次方)，因式首項為正
        got = sorted((tuple(int(v) for v in Poly(f_, x).all_coeffs()), e) for f_, e in factors)
        want_f = sorted(((pp, qq), 1) for pp, qq in [(p, q), (r, s)])
        if content != k or got != want_f:
            errors.append(f"{it['key']}: factor_list {content} {got} != {k} {want_f}")
        ia, ib, ic = it["inner"]["a"], it["inner"]["b"], it["inner"]["c"]
        if gcd(gcd(ia, ib), ic) != 1 or p <= 0 or r <= 0 or ia <= 0:
            errors.append(f"{it['key']}: inner not primitive / sign rule")
        g = gcd(gcd(a, b), c)
        if abs(k) != g or (k > 0) != (a > 0):
            errors.append(f"{it['key']}: k is not the signed content")
        # 卡片擺法：判對的必須是同一個因式分解
        leads = [v for kind, v in it["cards"] if kind == "lead"]
        consts = [v for kind, v in it["cards"] if kind == "const"]
        lead_pairs = [(1, 1)] if ia == 1 else list(permutations(leads, 2))
        found = 0
        for lp, lr in lead_pairs:
            for cq, cs in permutations(consts, 2):
                if lp * lr == ia and cq * cs == ic and lp * cs + lr * cq == ib:
                    found += 1
                    if expand(Integer(k) * (lp * x + cq) * (lr * x + cs) - orig) != 0:
                        errors.append(f"{it['key']}: accepted arrangement does not expand to the item")
                    if sorted([(lp, cq), (lr, cs)]) != sorted([(p, q), (r, s)]):
                        errors.append(f"{it['key']}: alternate factorization ({lp},{cq})({lr},{cs})")
        if found == 0:
            errors.append(f"{it['key']}: answer not reachable with the cards")
        counts[it["level"]] += 1

    print(f"SymPy cross check: L1 {counts[1]}・L2 {counts[2]}・L3 {counts[3]}・total {sum(counts.values())}")
    print(f"distinct items: {len({it['key'] for it in items})}")
    if errors:
        print(f"FAILED {len(errors)}")
        for e in errors[:30]:
            print("  " + e)
        return 1
    print("all factorizations verified (expand + factor_list + card arrangements)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
