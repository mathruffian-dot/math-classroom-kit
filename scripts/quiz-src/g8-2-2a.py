r"""2-2(1) 根式的乘除：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一）。

用法：python -X utf8 scripts/quiz-src/g8-2-2a.py
- 每一題的正確答案與每一個錯誤選項都用 SymPy 精確核算：正確選項要等於題目的值，錯誤選項都不能等於。
- 「哪一個正確」的題目：每個敘述用 SymPy 判斷真假，必須剛好一個為真。
- 第 1 個選項是正確答案（派題時伺服器會打亂選項順序）。
- 錯誤選項都是學生常見的錯法（加進根號、係數相加、正負號、乘除顛倒…），老師看選項分布就知道卡在哪裡。
內容依課本 p.73–76（簡記、乘法、比較大小、除法）。
範圍：只用 2-2(1) 與先備的 2-1（完全平方數）；不要求化成最簡根式或分母有理化（那是 2-2(2)）。
後面幾堂可以用前面所有的內容，例如 2-2(3) 可以用 2-2(1)～(3)，不能用 2-2(4) 的乘法公式。
"""
import json
from pathlib import Path

from sympy import Rational as R, nsimplify, simplify, sqrt

S = sqrt
OUT = Path(__file__).resolve().parents[2] / 'content/quizzes/g8-2-2a.json'


def value(stem, expect, options, explanation):
    """options：[(LaTeX, SymPy 值)…]，第一個是正確答案。"""
    return dict(kind='value', stem=stem, expect=expect, options=options, explanation=explanation)


def statement(stem, options, explanation):
    """options：[(LaTeX 敘述, 左式, 右式)…]，第一個是唯一正確的敘述。"""
    return dict(kind='statement', stem=stem, options=options, explanation=explanation)


def relation(stem, a, b, texts, explanation):
    """比較大小：texts＝[>, <, =, 無法比較] 的敘述；依 a、b 的真實大小決定正確的是哪一個，並移到第一個。"""
    truth = '>' if a > b else '<' if a < b else '='
    order = {'>': 0, '<': 1, '=': 2}[truth]
    opts = [texts[order]] + [t for i, t in enumerate(texts) if i != order]
    return dict(kind='relation', stem=stem, options=[(t, None) for t in opts], truth=truth, explanation=explanation)


SLOTS = [
    dict(id='q1', topic='簡記：整數 × 根式', variants=[
        value(r'$(-5)\times2\sqrt{3}=$？', -5 * 2 * S(3),
              [(r'$-10\sqrt{3}$', -10 * S(3)), (r'$10\sqrt{3}$', 10 * S(3)), (r'$-2\sqrt{15}$', -2 * S(15)), (r'$-3\sqrt{3}$', -3 * S(3))],
              r'整數乘係數：$(-5)\times2=-10$，根號不變，得 $-10\sqrt{3}$。'),
        value(r'$4\times(-3\sqrt{2})=$？', 4 * -3 * S(2),
              [(r'$-12\sqrt{2}$', -12 * S(2)), (r'$12\sqrt{2}$', 12 * S(2)), (r'$-3\sqrt{8}$', -3 * S(8)), (r'$\sqrt{2}$', S(2))],
              r'$4\times(-3)=-12$，根號不變，得 $-12\sqrt{2}$。'),
        value(r'$(-6)\times5\sqrt{7}=$？', -6 * 5 * S(7),
              [(r'$-30\sqrt{7}$', -30 * S(7)), (r'$30\sqrt{7}$', 30 * S(7)), (r'$-5\sqrt{42}$', -5 * S(42)), (r'$-\sqrt{7}$', -S(7))],
              r'$(-6)\times5=-30$，根號不變，得 $-30\sqrt{7}$。'),
    ]),
    dict(id='q2', topic='簡記：根式 ÷ 整數', variants=[
        value(r'$(-4\sqrt{2})\div6=$？', -4 * S(2) / 6,
              [(r'$-\dfrac{2}{3}\sqrt{2}$', R(-2, 3) * S(2)), (r'$-\dfrac{3}{2}\sqrt{2}$', R(-3, 2) * S(2)), (r'$-24\sqrt{2}$', -24 * S(2)), (r'$\dfrac{2}{3}\sqrt{2}$', R(2, 3) * S(2))],
              r'係數相除：$-4\div6=-\dfrac{2}{3}$，根號不變。'),
        value(r'$(-6\sqrt{5})\div4=$？', -6 * S(5) / 4,
              [(r'$-\dfrac{3}{2}\sqrt{5}$', R(-3, 2) * S(5)), (r'$-\dfrac{2}{3}\sqrt{5}$', R(-2, 3) * S(5)), (r'$-24\sqrt{5}$', -24 * S(5)), (r'$\dfrac{3}{2}\sqrt{5}$', R(3, 2) * S(5))],
              r'$-6\div4=-\dfrac{3}{2}$，根號不變。'),
        value(r'$9\sqrt{3}\div(-6)=$？', 9 * S(3) / -6,
              [(r'$-\dfrac{3}{2}\sqrt{3}$', R(-3, 2) * S(3)), (r'$-\dfrac{2}{3}\sqrt{3}$', R(-2, 3) * S(3)), (r'$-54\sqrt{3}$', -54 * S(3)), (r'$\dfrac{3}{2}\sqrt{3}$', R(3, 2) * S(3))],
              r'$9\div(-6)=-\dfrac{3}{2}$，根號不變。'),
    ]),
    dict(id='q3', topic='根式乘法：√a × √b', variants=[
        value(r'$\sqrt{3}\times\sqrt{7}=$？', S(3) * S(7),
              [(r'$\sqrt{21}$', S(21)), (r'$\sqrt{10}$', S(10)), (r'$21$', 21), (r'$10$', 10)],
              r'$\sqrt{a}\times\sqrt{b}=\sqrt{a\times b}$：$\sqrt{3\times7}=\sqrt{21}$，不是根號內相加。'),
        value(r'$\sqrt{5}\times\sqrt{6}=$？', S(5) * S(6),
              [(r'$\sqrt{30}$', S(30)), (r'$\sqrt{11}$', S(11)), (r'$30$', 30), (r'$11$', 11)],
              r'$\sqrt{5\times6}=\sqrt{30}$。'),
        value(r'$\sqrt{2}\times\sqrt{11}=$？', S(2) * S(11),
              [(r'$\sqrt{22}$', S(22)), (r'$\sqrt{13}$', S(13)), (r'$22$', 22), (r'$13$', 13)],
              r'$\sqrt{2\times11}=\sqrt{22}$。'),
    ]),
    dict(id='q4', topic='係數乘係數、根號乘根號', variants=[
        value(r'$3\sqrt{3}\times(-2\sqrt{5})=$？', 3 * S(3) * (-2 * S(5)),
              [(r'$-6\sqrt{15}$', -6 * S(15)), (r'$6\sqrt{15}$', 6 * S(15)), (r'$\sqrt{15}$', S(15)), (r'$-6\sqrt{8}$', -6 * S(8))],
              r'係數 $3\times(-2)=-6$，根號 $\sqrt{3}\times\sqrt{5}=\sqrt{15}$，得 $-6\sqrt{15}$。'),
        value(r'$(-2\sqrt{3})\times4\sqrt{2}=$？', -2 * S(3) * 4 * S(2),
              [(r'$-8\sqrt{6}$', -8 * S(6)), (r'$8\sqrt{6}$', 8 * S(6)), (r'$2\sqrt{6}$', 2 * S(6)), (r'$-8\sqrt{5}$', -8 * S(5))],
              r'係數 $(-2)\times4=-8$，根號 $\sqrt{3\times2}=\sqrt{6}$。'),
        value(r'$5\sqrt{2}\times(-3\sqrt{7})=$？', 5 * S(2) * (-3 * S(7)),
              [(r'$-15\sqrt{14}$', -15 * S(14)), (r'$15\sqrt{14}$', 15 * S(14)), (r'$2\sqrt{14}$', 2 * S(14)), (r'$-15\sqrt{9}$', -15 * S(9))],
              r'係數 $5\times(-3)=-15$，根號 $\sqrt{2\times7}=\sqrt{14}$。'),
    ]),
    dict(id='q5', topic='乘完要化簡', variants=[
        value(r'$\sqrt{2}\times\sqrt{8}=$？', S(2) * S(8),
              [(r'$4$', 4), (r'$\sqrt{10}$', S(10)), (r'$16$', 16), (r'$2\sqrt{2}$', 2 * S(2))],
              r'$\sqrt{2\times8}=\sqrt{16}=4$。'),
        value(r'$\sqrt{3}\times\sqrt{12}=$？', S(3) * S(12),
              [(r'$6$', 6), (r'$\sqrt{15}$', S(15)), (r'$36$', 36), (r'$2\sqrt{3}$', 2 * S(3))],
              r'$\sqrt{3\times12}=\sqrt{36}=6$。'),
        value(r'$\sqrt{5}\times\sqrt{20}=$？', S(5) * S(20),
              [(r'$10$', 10), (r'$100$', 100), (r'$2\sqrt{5}$', 2 * S(5)), (r'$5$', 5)],
              r'$\sqrt{5\times20}=\sqrt{100}=10$。'),
    ]),
    dict(id='q6', topic='長方形面積（課本隨堂 2）', variants=[
        value(r'長 $\sqrt{13}$ 公分、寬 $\sqrt{5}$ 公分的長方形，面積是幾平方公分？', S(13) * S(5),
              [(r'$\sqrt{65}$', S(65)), (r'$\sqrt{18}$', S(18)), (r'$65$', 65), (r'$2\sqrt{13}+2\sqrt{5}$', 2 * S(13) + 2 * S(5))],
              r'面積＝長 × 寬＝$\sqrt{13}\times\sqrt{5}=\sqrt{65}$。$2\sqrt{13}+2\sqrt{5}$ 是周長。'),
        value(r'長 $\sqrt{7}$ 公分、寬 $\sqrt{3}$ 公分的長方形，面積是幾平方公分？', S(7) * S(3),
              [(r'$\sqrt{21}$', S(21)), (r'$\sqrt{10}$', S(10)), (r'$21$', 21), (r'$2\sqrt{7}+2\sqrt{3}$', 2 * S(7) + 2 * S(3))],
              r'$\sqrt{7}\times\sqrt{3}=\sqrt{21}$。'),
        value(r'長 $2\sqrt{3}$ 公分、寬 $\sqrt{5}$ 公分的長方形，面積是幾平方公分？', 2 * S(3) * S(5),
              [(r'$2\sqrt{15}$', 2 * S(15)), (r'$2\sqrt{8}$', 2 * S(8)), (r'$4\sqrt{3}+2\sqrt{5}$', 4 * S(3) + 2 * S(5)), (r'$15$', 15)],
              r'$2\sqrt{3}\times\sqrt{5}=2\sqrt{15}$。'),
    ]),
    dict(id='q7', topic='比較大小（係數移進根號）', variants=[
        relation(r'$3\sqrt{2}$ 和 $2\sqrt{3}$ 的大小關係？', 3 * S(2), 2 * S(3),
                 [r'$3\sqrt{2}>2\sqrt{3}$', r'$3\sqrt{2}<2\sqrt{3}$', r'$3\sqrt{2}=2\sqrt{3}$', '無法比較'],
                 r'$3\sqrt{2}=\sqrt{18}$、$2\sqrt{3}=\sqrt{12}$，$18>12$。'),
        relation(r'$6\sqrt{2}$ 和 $5\sqrt{3}$ 的大小關係？', 6 * S(2), 5 * S(3),
                 [r'$6\sqrt{2}>5\sqrt{3}$', r'$6\sqrt{2}<5\sqrt{3}$', r'$6\sqrt{2}=5\sqrt{3}$', '無法比較'],
                 r'$6\sqrt{2}=\sqrt{72}$、$5\sqrt{3}=\sqrt{75}$，$72<75$。'),
        relation(r'$4\sqrt{3}$ 和 $3\sqrt{5}$ 的大小關係？', 4 * S(3), 3 * S(5),
                 [r'$4\sqrt{3}>3\sqrt{5}$', r'$4\sqrt{3}<3\sqrt{5}$', r'$4\sqrt{3}=3\sqrt{5}$', '無法比較'],
                 r'$4\sqrt{3}=\sqrt{48}$、$3\sqrt{5}=\sqrt{45}$，$48>45$。'),
    ]),
    dict(id='q8', topic='根式除法：√a ÷ √b', variants=[
        value(r'$\sqrt{35}\div\sqrt{7}=$？', S(35) / S(7),
              [(r'$\sqrt{5}$', S(5)), (r'$\sqrt{28}$', S(28)), (r'$5$', 5), (r'$7\sqrt{5}$', 7 * S(5))],
              r'$\sqrt{a}\div\sqrt{b}=\sqrt{a\div b}$：$\sqrt{35\div7}=\sqrt{5}$。'),
        value(r'$\sqrt{48}\div\sqrt{8}=$？', S(48) / S(8),
              [(r'$\sqrt{6}$', S(6)), (r'$\sqrt{40}$', S(40)), (r'$6$', 6), (r'$8\sqrt{6}$', 8 * S(6))],
              r'$\sqrt{48\div8}=\sqrt{6}$。'),
        value(r'$\sqrt{54}\div\sqrt{6}=$？', S(54) / S(6),
              [(r'$3$', 3), (r'$\sqrt{48}$', S(48)), (r'$9$', 9), (r'$18$', 18)],
              r'$\sqrt{54\div6}=\sqrt{9}=3$。'),
    ]),
    dict(id='q9', topic='除以分數形式的根式', variants=[
        value(r'$\dfrac{\sqrt{6}}{\sqrt{3}}\div\sqrt{\dfrac{2}{3}}=$？', (S(6) / S(3)) / S(R(2, 3)),
              [(r'$\sqrt{3}$', S(3)), (r'$\dfrac{2}{\sqrt{3}}$', 2 / S(3)), (r'$3$', 3), (r'$\sqrt{2}$', S(2))],
              r'$\dfrac{\sqrt{6}}{\sqrt{3}}=\sqrt{2}$，$\sqrt{2}\div\sqrt{\dfrac{2}{3}}=\sqrt{2\times\dfrac{3}{2}}=\sqrt{3}$（除以分數要乘倒數）。'),
        value(r'$\sqrt{\dfrac{7}{2}}\div\dfrac{\sqrt{3}}{\sqrt{6}}=$？', S(R(7, 2)) / (S(3) / S(6)),
              [(r'$\sqrt{7}$', S(7)), (r'$\dfrac{\sqrt{7}}{2}$', S(7) / 2), (r'$7$', 7), (r'$\sqrt{14}$', S(14))],
              r'$\dfrac{\sqrt{3}}{\sqrt{6}}=\sqrt{\dfrac{1}{2}}$，$\sqrt{\dfrac{7}{2}\div\dfrac{1}{2}}=\sqrt{7}$。'),
        value(r'$\sqrt{\dfrac{5}{3}}\div\sqrt{\dfrac{1}{6}}=$？', S(R(5, 3)) / S(R(1, 6)),
              [(r'$\sqrt{10}$', S(10)), (r'$\sqrt{\dfrac{5}{18}}$', S(R(5, 18))), (r'$10$', 10), (r'$\sqrt{5}$', S(5))],
              r'$\sqrt{\dfrac{5}{3}\times6}=\sqrt{10}$。'),
    ]),
    dict(id='q10', topic='哪一個算對了？（常見錯誤）', variants=[
        statement('下列哪一個計算是正確的？',
                  [(r'$\sqrt{2}\times\sqrt{3}=\sqrt{6}$', S(2) * S(3), S(6)),
                   (r'$\sqrt{2}+\sqrt{3}=\sqrt{5}$', S(2) + S(3), S(5)),
                   (r'$\sqrt{12}\div\sqrt{3}=\sqrt{9}$', S(12) / S(3), S(9)),
                   (r'$2\sqrt{3}\times3\sqrt{2}=6\sqrt{5}$', 2 * S(3) * 3 * S(2), 6 * S(5))],
                  r'根號乘根號，根號內相乘；根號不能直接相加；$\sqrt{12}\div\sqrt{3}=\sqrt{4}=2$。'),
        statement('下列哪一個計算是正確的？',
                  [(r'$\sqrt{20}\div\sqrt{5}=2$', S(20) / S(5), 2),
                   (r'$\sqrt{2}\times\sqrt{8}=\sqrt{10}$', S(2) * S(8), S(10)),
                   (r'$3\sqrt{2}\times2\sqrt{2}=6\sqrt{2}$', 3 * S(2) * 2 * S(2), 6 * S(2)),
                   (r'$\sqrt{3}\times\sqrt{3}=9$', S(3) * S(3), 9)],
                  r'$\sqrt{20\div5}=\sqrt{4}=2$；$3\sqrt{2}\times2\sqrt{2}=6\times2=12$；$\sqrt{3}\times\sqrt{3}=3$。'),
        statement('下列哪一個計算是正確的？',
                  [(r'$(-2\sqrt{3})\times4\sqrt{2}=-8\sqrt{6}$', -2 * S(3) * 4 * S(2), -8 * S(6)),
                   (r'$\sqrt{18}\div\sqrt{2}=\sqrt{16}$', S(18) / S(2), S(16)),
                   (r'$\sqrt{5}\times\sqrt{5}=25$', S(5) * S(5), 25),
                   (r'$4\sqrt{2}\div2=2$', 4 * S(2) / 2, 2)],
                  r'$\sqrt{18\div2}=\sqrt{9}=3$；$\sqrt{5}\times\sqrt{5}=5$；$4\sqrt{2}\div2=2\sqrt{2}$。'),
    ]),
]


def check():
    for slot in SLOTS:
        assert len(slot['variants']) == 3, slot['id']
        for k, v in enumerate(slot['variants'], 1):
            where = f"{slot['id']}-{k}"
            texts = [o[0] for o in v['options']]
            assert len(texts) == 4 and len(set(texts)) == 4, f'{where}：要有 4 個不同的選項'
            if v['kind'] == 'value':
                vals = [nsimplify(o[1]) for o in v['options']]
                assert simplify(vals[0] - v['expect']) == 0, f'{where}：正確選項不等於題目的值'
                for t, x in zip(texts[1:], vals[1:]):
                    assert simplify(x - v['expect']) != 0, f'{where}：錯誤選項 {t} 其實也等於答案'
                assert len({str(simplify(x)) for x in vals}) == 4, f'{where}：有兩個選項的值相同'
            elif v['kind'] == 'statement':
                truth = [simplify(o[1] - o[2]) == 0 for o in v['options']]
                assert truth == [True, False, False, False], f'{where}：正確敘述必須剛好一個（{truth}）'
            # relation：正確選項依 a、b 的真實大小產生，不用再檢查


def export():
    slots = [dict(id=s['id'], topic=s['topic'],
                  variants=[dict(stem=v['stem'], options=[o[0] for o in v['options']], answer=0, explanation=v['explanation'])
                            for v in s['variants']])
             for s in SLOTS]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    data = dict(lessonId='g8-2-2a', title='2-2(1) 根式的乘除：課後檢核', source='課本 p.73–76（題目自編，答案已用 SymPy 核算）', slots=slots)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(f'✓ {len(slots)} 個題位 × 3 題 → {OUT.name}（全部核算通過）')


if __name__ == '__main__':
    check()
    export()
