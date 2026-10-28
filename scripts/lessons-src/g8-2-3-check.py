r"""八上 2-3：用 SymPy 核算課程（含換數字題）與補救練習的每一個答案。

用法（在 math-classroom-kit 執行）：
  node scripts/lessons-src/g8-2-3.mjs          # 產生 scripts/lessons-src/g8-2-3-checks.json
  python -X utf8 scripts/lessons-src/g8-2-3-check.py
每一筆 { id, prompt, answer, ck }：answer 是學生端的標準答案（半形可解析寫法，例如 2√10/5、-√2+3），
ck 是 SymPy 驗算式（直接由題目的數字算，例如 sqrt(6**2+2**2)）。兩者必須精確相等；
課程裡標 form: simplest-radical 的題目，答案另由 npm run lessons 檢查是不是最簡根式。
"""
import json
import re
import sys
from pathlib import Path

from sympy import Abs, Rational, simplify, sqrt, sympify  # noqa: F401  （ck 會用到 Abs、Rational、sqrt）

ROOT = Path(__file__).resolve().parents[2]
rows = json.loads((ROOT / 'scripts/lessons-src/g8-2-3-checks.json').read_text(encoding='utf8'))


def parse(ans: str):
    """把標準答案（例如 2√10/5、-4√2+√3、72/5、2.4）轉成 SymPy。"""
    s = ans.replace('−', '-').replace('＋', '+').replace(' ', '')
    s = re.sub(r'(\d+(?:\.\d+)?)?√(\d+)', lambda m: f"({m.group(1) or '1'}*sqrt({m.group(2)}))", s)
    s = re.sub(r'(\d+\.\d+)', lambda m: f'Rational("{m.group(1)}")', s)
    return sympify(s, locals={'sqrt': sqrt, 'Rational': Rational})


bad = 0
for r in rows:
    want = eval(r['ck'], {'sqrt': sqrt, 'Rational': Rational, 'Abs': Abs})  # noqa: S307 （ck 是產生器裡自己寫的算式）
    got = parse(r['answer'])
    if simplify(want - got) != 0:
        bad += 1
        print(f"✗ {r['id']}：{r['prompt']} 答案 {r['answer']}，但驗算式 {r['ck']} ＝ {simplify(want)}")
print(f"{'✓' if not bad else '✗'} 核算 {len(rows)} 筆答案，{bad} 筆不一致")
sys.exit(1 if bad else 0)
