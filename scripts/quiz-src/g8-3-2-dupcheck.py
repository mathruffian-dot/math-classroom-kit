"""3-2 的「互給答案」檢查（只讀檔，不寫入）。

用法：python -X utf8 scripts/quiz-src/g8-3-2-dupcheck.py（需要 sympy）

把每一題（或每一頁）學生看得到、或正解裡出現的二次式抽出來，提出公因數與負號後比對（3x²＋3x−18 和 x²＋x−6 算同一個）：
1. 同一份課後檢核，不同題位不能共用同一個二次式（同卷互給答案）。
2. 課堂頁面學生看得到的內容（標題、內文、條列、題目、小題、選項、公布後的解析、視覺化的每一行文字與圖說，
   以及產生器記下的每一組十字、目標式、滑桿初始值）不能出現同一堂課後檢核題目的二次式
   （例：課堂題幹「已知 x²＋x−12＝(x＋4)(x−3)」會直接給出這一堂 PK 的正解）。前幾堂教過的式子出現在後面的題庫，算正常的複習。
3. 單元總測驗會從四堂的題庫混著抽：不同堂的課後檢核也不能共用同一個二次式。
4. 魔王戰的一般題（attack／shield／ultimate）：任兩題都不能共用同一個二次式（含課後檢核收進來的 120 題）。
   分析題的題幹是「某位同學的步驟」，常常寫到別題的式子（多半是錯的分解），只列出數量供參考。
5. 課堂頁面學生看得到的內容（同第 2 項）不能出現魔王戰新增題（題號第 4 題以後）的二次式；收進來的課後檢核題已由第 2 項管。
6. 魔王戰作答後會回傳詳解：分析題的題幹與詳解裡寫到的二次式（含解釋某一步為何錯的展開式），不能是任何一般題（含收進來的課後檢核）要問的式子。
另外也把十字（左欄、右欄）與「相乘是 c、相加是 b」換成它代表的二次式。
"""
import json
import re
from pathlib import Path

from sympy import Poly, expand, symbols
from sympy.parsing.sympy_parser import implicit_multiplication_application, parse_expr, standard_transformations

x = symbols('x')
TR = standard_transformations + (implicit_multiplication_application,)
ROOT = Path(__file__).resolve().parents[2]
LESSONS = ['g8-3-2a', 'g8-3-2b', 'g8-3-2c', 'g8-3-2d']


def norm(e):
    """提出公因數與負號：回傳本原、首項係數為正的二次式。"""
    p = Poly(expand(e), x)
    c = p.content() * (1 if p.LC() > 0 else -1)
    return expand(p.as_expr() / c)


def polys(t):
    out = set()
    for m in re.findall(r'\$([^$]+)\$', t):
        m = m.replace(r'\square', 'B')
        for part in m.split('='):
            if 'x' not in part or 'B' in part or '\\' in part:
                continue
            try:
                e = expand(parse_expr(part.replace('^', '**'), transformations=TR, local_dict={'x': x}))
            except Exception:
                continue
            if e.free_symbols - {x}:
                continue
            pl = e.as_poly(x)
            if pl is not None and pl.degree() == 2:
                out.add(norm(e))
    co = lambda s: 1 if s == 'x' else -1 if s == '-x' else int(s.replace('x', ''))  # noqa: E731
    for m, n, p, q in re.findall(r'左欄 \$([-\dx]+)\$、\$([-\dx]+)\$，右欄 \$([+-]\d+)\$、\$([+-]\d+)\$', t):
        out.add(norm((co(m) * x + int(p)) * (co(n) * x + int(q))))
    for c, b in re.findall(r'相乘是 \$(-?\d+)\$、相加是 \$(-?\d+)\$', t):
        out.add(norm(x**2 + int(b) * x + int(c)))
    return out


def plain(t):
    """課堂頁面的純文字式子（例如 x²＋7x＋12、(x＋3)(x＋4)）轉成 $…$ 再解析。"""
    t = t.replace('＋', '+').replace('−', '-').replace('²', '^2').replace('（', '(').replace('）', ')')
    return ' '.join(f'${m}$' for m in re.findall(r'[-+0-9x()^ ]*x[-+0-9x()^ ]*', t) if 'x' in m)


def quiz_items(lid):
    q = json.loads((ROOT / 'content/quizzes' / f'{lid}.json').read_text(encoding='utf8'))
    for s in q['slots']:
        for k, v in enumerate(s['variants'], 1):
            yield f"{lid}:{s['id']}-{k}", s['id'], v['stem'] + ' ' + v['options'][0]


bad = 0
quiz_polys = {}
for lid in LESSONS:
    seen = {}
    for qid, sid, text in quiz_items(lid):
        for P in polys(text):
            seen.setdefault(P, set()).add((sid, qid))
            quiz_polys.setdefault(P, set()).add((lid, qid))
    for P, ids in seen.items():
        if len({s for s, _ in ids}) > 1:
            bad += 1
            print('同卷', lid, P, sorted(q for _, q in ids))

for P, ids in quiz_polys.items():
    if len({l for l, _ in ids}) > 1:
        bad += 1
        print('單元總測驗', P, sorted(q for _, q in ids))

viz = {}
for r in json.loads((ROOT / 'scripts/lessons-src/g8-3-2-checks.json').read_text(encoding='utf8')):
    if r['kind'] == 'viz':
        viz[r['id']] = {norm(parse_expr(e, local_dict={'x': x})) for e in r['polys']}

lesson_seen = {}
for i, lid in enumerate(LESSONS):
    lesson = json.loads((ROOT / 'content/lessons' / f'{lid}.json').read_text(encoding='utf8'))
    warm = json.loads((ROOT / 'content/warmups' / f'{lid}.json').read_text(encoding='utf8'))['slides']
    for s in warm + lesson['slides']:
        a = s.get('activity') or {}
        inter = s.get('interactive') or {}
        text = ' '.join([s.get('title', ''), s.get('body', ''), ' '.join(s.get('bullets', [])), a.get('prompt', ''),
                         ' '.join(it['prompt'] for it in a.get('items', [])), ' '.join(a.get('options', [])), a.get('explanation', ''),
                         ' '.join(sh.get('text', '') for sh in inter.get('shapes', [])), ' '.join(inter.get('steps', [])), inter.get('caption', '')])
        found = polys(text) | polys(plain(text)) | viz.get(f"{lid}:{s['id']}", set())
        for P in found:
            lesson_seen.setdefault(P, set()).add(f"{lid}:{s['id']}")
        for P in found:
            hits = sorted(q for l2, q in quiz_polys.get(P, ()) if l2 == lid)
            if hits:
                bad += 1
                print('課堂→題庫', f'{lid}:{s["id"]}', P, hits)

raid = json.loads((ROOT / 'content/raids/g8-3-2d.json').read_text(encoding='utf8'))
pool_of = {}
for kind, items in raid['pools'].items():
    for it in items:
        for P in polys(it['stem'] + ' ' + it['options'][0]):
            pool_of.setdefault(P, set()).add((kind, it['id']))
for P, ids in pool_of.items():
    general = sorted(i for k, i in ids if k != 'analysis')
    if len(general) > 1:
        bad += 1
        print('魔王戰一般題', P, general)
for P, ids in pool_of.items():
    new = sorted(i for k, i in ids if k != 'analysis' and int(i.rsplit('-', 1)[1]) >= 4)
    if new and P in lesson_seen:
        bad += 1
        print('課堂→魔王戰', P, sorted(lesson_seen[P]), new)
general_polys = {}
for kind, items in raid['pools'].items():
    if kind == 'analysis':
        continue
    for it in items:
        for P in polys(it['stem'] + ' ' + it['options'][0]):
            general_polys.setdefault(P, set()).add(it['id'])
for it in raid['pools']['analysis']:
    for P in polys(it['stem'] + ' ' + it['explanation']):
        if P in general_polys:
            bad += 1
            print('分析題詳解→一般題', it['id'], P, sorted(general_polys[P]))
shared = [P for P, ids in pool_of.items() if any(k == 'analysis' for k, _ in ids) and len(ids) > 1]
print(f'（參考）魔王戰分析題與其他題共用的二次式：{len(shared)} 個')

print(f"{'✓' if not bad else '✗'} 互給答案的組合：{bad} 組")
raise SystemExit(1 if bad else 0)
