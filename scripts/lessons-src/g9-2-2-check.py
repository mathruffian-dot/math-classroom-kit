"""九上 2-2：核算盤點表的官方答案，並核對課程 JSON 的數值題與截圖檔。
在 math-classroom-kit 目錄執行：python scripts/lessons-src/g9-2-2-check.py
盤點表每題的 check 是自己列的算式（教用版之外獨立計算），和抄自教用版的 answer 比對。
"""
import glob
import json
import os

from sympy import Rational, nsimplify, sympify


def value(expr):
    return nsimplify(sympify(expr, rational=True))


checked = bad = 0
inv = json.load(open('content/sources/g9-2-2-inventory.json', encoding='utf-8'))
for it in inv['items']:
    for p in it['problems']:
        if 'check' not in p:
            continue
        checked += 1
        if value(p['check']) != Rational(p['answer']):
            bad += 1
            print('不一致', it['label'], p['expr'], p['check'], p['answer'])

# 課程的數值題：題目 ID → 自己算的答案（例題、隨堂與教用版核對過；其餘為自編題）
EXPECT = {
    'a-retrieve-q': ['2*6', '2*6*60/360', '120/360'],
    'a-ex1-q': ['120', '2*8*120/360', '2*10*120/360'],
    'a-ex1-practice-q': ['2*10*72/360-2*5*72/360'],
    'a-ex3-q': ['360*2/5'],
    'b-retrieve-q': ['70', '25', '25+25'],
    'b-case1-q': ['25', '25+25'],
    'b-case23-q': ['2*(20+35)', '2*(50-20)'],
    'b-ex4-q': ['60', '(180-72)/2'],
    'b-ex4-practice-q': ['44', '(180-100)/2', '(180-100)/2'],
    'b-ex5-q': ['130/2', '360-130', '(360-130)/2'],
    'b-ex5-practice-q': ['100/2', '2*24', '(360-140)/2'],
    'c-retrieve-q': ['100/2', '140/2', '35'],
    'c-ex6-q': ['(70+80)/2', '2*(110-80/2)'],
    'c-ex6-practice-q': ['(360*2/8)/2', '360/2'],
    'c-semi-proof-q': ['180', '180/2'],
    'c-semi-practice-q': ['180-90-36'],
    'd-retrieve-q': ['180-65', '140/2', '360-140'],
    'd-proof-q': ['180-70', '180-95'],
    'd-ex8-practice-q': ['180-70', '115'],
}
seen = set()
for f in sorted(glob.glob('content/lessons/g9-2-2?.json')):
    lesson = json.load(open(f, encoding='utf-8'))
    for s in lesson['slides']:
        for fg in s.get('figures', []):
            if not os.path.exists('public/lesson-assets/' + fg['src']):
                bad += 1
                print('缺截圖', fg['src'])
        a = s.get('activity') or {}
        if a.get('type') != 'numeric':
            continue
        seen.add(a['id'])
        if a['id'] not in EXPECT:
            bad += 1
            print('沒有核算：', a['id'])
            continue
        got = [Rational(i['answer']) for i in a['items']]
        want = [value(e) for e in EXPECT[a['id']]]
        checked += len(got)
        if got != want:
            bad += 1
            print('不一致', a['id'], got, want)
for k in set(EXPECT) - seen:
    bad += 1
    print('課程沒有這題：', k)

# 示範與錯誤分析的數字（自編）。隨堂的示範不能剛好等於課本答案。
assert value('2*18*60/360-2*9*60/360') == 3  # a-ex1-practice 示範 3π，課本 2π
assert value('2*9*80/360') == 4 and value('2*6*80/360') == Rational(8, 3)  # a-error
assert value('(360-110)/2') == 125  # b-error
assert value('360-100-50-50') == 160  # c-error
assert value('(180-70)/2') == 55  # b-ex4-practice 示範，課本 40
assert value('180-90-28') == 62  # c-semi-practice 示範，課本 54
assert value('180-80') == 100  # d-ex8-practice 示範，課本 110
# a-ex3-practice 示範圖的點：A＝150、C＝240、B＝300、D＝390，要和文字的 150、60、90 一致
assert 300 - 150 == 390 - 240 == 150 and 300 - 240 == 60 and 240 - 150 == 390 - 300 == 90
print(f'核算 {checked} 項，不一致 {bad} 項')
raise SystemExit(1 if bad else 0)
