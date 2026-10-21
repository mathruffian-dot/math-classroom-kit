r"""2-2(3) 根式的加減與混合運算：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一）。

用法：python -X utf8 scripts/quiz-src/g8-2-2c.py
範圍：2-2(1)～(3)：簡記、乘除、最簡根式、有理化、同類方根合併、先化簡再合併、分配律、四則混合。
不用乘法公式 (a±b)²、(a+b)(a−b)（2-2(4) 才教）；兩個二項式相乘只用分配律逐項乘開。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from quizlib import R, S, export, form, rad, raw, relation, slot, statement, value  # noqa: E402


def o(tex, v, simplest=True):
    return raw(tex if tex.startswith('$') else f'${tex}$', v, simplest)


SLOTS = [
    slot(1, '同類方根合併', [
        value(r'$7\sqrt{3}-3\sqrt{3}=$？', 7 * S(3) - 3 * S(3),
              [o(r'4\sqrt{3}', 4 * S(3)), o('4', 4), o(r'10\sqrt{3}', 10 * S(3)), o(r'4\sqrt{6}', 4 * S(6))],
              r'同類方根像同類項：$(7-3)\sqrt{3}=4\sqrt{3}$，根號部分不變。'),
        value(r'$5\sqrt{2}+3\sqrt{2}=$？', 8 * S(2),
              [o(r'8\sqrt{2}', 8 * S(2)), o(r'8\sqrt{4}', 16), o(r'15\sqrt{2}', 15 * S(2)), o('8', 8)],
              r'$(5+3)\sqrt{2}=8\sqrt{2}$。根號內不相加。'),
        value(r'$3\sqrt{11}-8\sqrt{11}=$？', -5 * S(11),
              [o(r'-5\sqrt{11}', -5 * S(11)), o(r'5\sqrt{11}', 5 * S(11)), o(r'-5', -5), o(r'-24\sqrt{11}', -24 * S(11))],
              r'$(3-8)\sqrt{11}=-5\sqrt{11}$。'),
    ]),
    slot(2, '不是同類方根不能合併', [
        value(r'$\sqrt{2}-5\sqrt{2}+\sqrt{3}=$？', -4 * S(2) + S(3),
              [o(r'-4\sqrt{2}+\sqrt{3}', -4 * S(2) + S(3)), o(r'-4\sqrt{5}', -4 * S(5)), o(r'-3\sqrt{2}', -3 * S(2)), o(r'-4\sqrt{2}-\sqrt{3}', -4 * S(2) - S(3))],
              r'只合併 $\sqrt{2}$ 的項：$(1-5)\sqrt{2}=-4\sqrt{2}$，$\sqrt{3}$ 留著。'),
        value(r'$7\sqrt{2}-2\sqrt{3}-3\sqrt{2}=$？', 4 * S(2) - 2 * S(3),
              [o(r'4\sqrt{2}-2\sqrt{3}', 4 * S(2) - 2 * S(3)), o(r'4\sqrt{2}+2\sqrt{3}', 4 * S(2) + 2 * S(3)), o(r'2\sqrt{2}', 2 * S(2)), o(r'10\sqrt{2}-2\sqrt{3}', 10 * S(2) - 2 * S(3))],
              r'$7\sqrt{2}-3\sqrt{2}=4\sqrt{2}$，$-2\sqrt{3}$ 不能和 $\sqrt{2}$ 合併。'),
        value(r'$5\sqrt{5}+2\sqrt{7}-\sqrt{5}=$？', 4 * S(5) + 2 * S(7),
              [o(r'4\sqrt{5}+2\sqrt{7}', 4 * S(5) + 2 * S(7)), o(r'6\sqrt{5}+2\sqrt{7}', 6 * S(5) + 2 * S(7)), o(r'4\sqrt{5}-2\sqrt{7}', 4 * S(5) - 2 * S(7)), o(r'6\sqrt{7}', 6 * S(7))],
              r'$5\sqrt{5}-\sqrt{5}=4\sqrt{5}$，$2\sqrt{7}$ 留著。'),
    ]),
    slot(3, '先化成最簡根式再合併', [
        value(r'$\sqrt{8}+\sqrt{18}=$？', S(8) + S(18),
              [o(r'5\sqrt{2}', 5 * S(2)), o(r'\sqrt{26}', S(26)), o(r'6\sqrt{2}', 6 * S(2)), o(r'2\sqrt{5}', 2 * S(5))],
              r'$\sqrt{8}=2\sqrt{2}$、$\sqrt{18}=3\sqrt{2}$，是同類方根：$2\sqrt{2}+3\sqrt{2}=5\sqrt{2}$。'),
        value(r'$\sqrt{50}-\sqrt{32}=$？', S(50) - S(32),
              [o(r'\sqrt{2}', S(2)), o(r'\sqrt{18}', S(18)), o(r'9\sqrt{2}', 9 * S(2)), o('2', 2)],
              r'$\sqrt{50}=5\sqrt{2}$、$\sqrt{32}=4\sqrt{2}$，$5\sqrt{2}-4\sqrt{2}=\sqrt{2}$。根號內不能直接相減。'),
        value(r'$\sqrt{12}+\sqrt{27}=$？', S(12) + S(27),
              [o(r'5\sqrt{3}', 5 * S(3)), o(r'\sqrt{39}', S(39)), o(r'13\sqrt{3}', 13 * S(3)), o(r'6\sqrt{3}', 6 * S(3))],
              r'$\sqrt{12}=2\sqrt{3}$、$\sqrt{27}=3\sqrt{3}$，合計 $5\sqrt{3}$。'),
    ]),
    slot(4, '有理化後合併', [
        value(r'$\dfrac{6}{\sqrt{3}}+\sqrt{3}=$？', 6 / S(3) + S(3),
              [o(r'3\sqrt{3}', 3 * S(3)), o(r'7\sqrt{3}', 7 * S(3)), o(r'2\sqrt{3}', 2 * S(3)), o(r'\dfrac{7}{\sqrt{3}}', 7 / S(3))],
              r'$\dfrac{6}{\sqrt{3}}=\dfrac{6\sqrt{3}}{3}=2\sqrt{3}$，$2\sqrt{3}+\sqrt{3}=3\sqrt{3}$。'),
        value(r'$\dfrac{4}{\sqrt{2}}+\sqrt{2}=$？', 4 / S(2) + S(2),
              [o(r'3\sqrt{2}', 3 * S(2)), o(r'5\sqrt{2}', 5 * S(2)), o(r'2\sqrt{2}', 2 * S(2)), o(r'\dfrac{5}{\sqrt{2}}', 5 / S(2))],
              r'$\dfrac{4}{\sqrt{2}}=2\sqrt{2}$，$2\sqrt{2}+\sqrt{2}=3\sqrt{2}$。'),
        value(r'$\dfrac{1}{\sqrt{5}}+\dfrac{4}{5}\sqrt{5}=$？', 1 / S(5) + R(4, 5) * S(5),
              [o(r'\sqrt{5}', S(5)), o(r'5\sqrt{5}', 5 * S(5)), o(r'\dfrac{4}{5}\sqrt{5}', R(4, 5) * S(5)), o(r'\dfrac{\sqrt{5}}{5}', S(5) / 5)],
              r'$\dfrac{1}{\sqrt{5}}=\dfrac{\sqrt{5}}{5}$，$\dfrac{\sqrt{5}}{5}+\dfrac{4\sqrt{5}}{5}=\dfrac{5\sqrt{5}}{5}=\sqrt{5}$。'),
    ]),
    slot(5, '分配律：根式乘括號', [
        form(r'$\sqrt{6}(\sqrt{3}+2\sqrt{2})=$？（最簡根式）', S(6) * (S(3) + 2 * S(2)),
             [o(r'3\sqrt{2}+4\sqrt{3}', 3 * S(2) + 4 * S(3)), o(r'\sqrt{18}+2\sqrt{12}', S(18) + 2 * S(12), False), o(r'3\sqrt{2}+2\sqrt{3}', 3 * S(2) + 2 * S(3)), o(r'\sqrt{9}+2\sqrt{8}', 3 + 4 * S(2))],
             r'$\sqrt{6}\times\sqrt{3}=\sqrt{18}=3\sqrt{2}$，$\sqrt{6}\times2\sqrt{2}=2\sqrt{12}=4\sqrt{3}$。'),
        form(r'$-2\sqrt{3}(\sqrt{6}-\sqrt{2})=$？（最簡根式）', -2 * S(3) * (S(6) - S(2)),
             [o(r'-6\sqrt{2}+2\sqrt{6}', -6 * S(2) + 2 * S(6)), o(r'-6\sqrt{2}-2\sqrt{6}', -6 * S(2) - 2 * S(6)), o(r'-2\sqrt{18}+2\sqrt{6}', -2 * S(18) + 2 * S(6), False), o(r'6\sqrt{2}-2\sqrt{6}', 6 * S(2) - 2 * S(6))],
             r'$-2\sqrt{3}\times\sqrt{6}=-2\sqrt{18}=-6\sqrt{2}$，$-2\sqrt{3}\times(-\sqrt{2})=+2\sqrt{6}$，負號要分配到每一項。'),
        form(r'$\sqrt{2}(\sqrt{6}-\sqrt{10})=$？（最簡根式）', S(2) * (S(6) - S(10)),
             [o(r'2\sqrt{3}-2\sqrt{5}', 2 * S(3) - 2 * S(5)), o(r'\sqrt{12}-\sqrt{20}', S(12) - S(20), False), o(r'2\sqrt{3}+2\sqrt{5}', 2 * S(3) + 2 * S(5)), o(r'\sqrt{12}-\sqrt{10}', S(12) - S(10))],
             r'$\sqrt{2}\times\sqrt{6}=\sqrt{12}=2\sqrt{3}$，$\sqrt{2}\times\sqrt{10}=\sqrt{20}=2\sqrt{5}$。括號裡每一項都要乘。'),
    ]),
    slot(6, '兩個括號相乘（逐項乘開）', [
        value(r'$(\sqrt{3}-\sqrt{2})(\sqrt{6}+1)=$？', (S(3) - S(2)) * (S(6) + 1),
              [o(r'2\sqrt{2}-\sqrt{3}', 2 * S(2) - S(3)), o(r'3\sqrt{2}-2\sqrt{3}', 3 * S(2) - 2 * S(3)), o(r'\sqrt{6}-\sqrt{2}', S(6) - S(2)), o(r'2\sqrt{2}+\sqrt{3}', 2 * S(2) + S(3))],
              r'逐項乘：$\sqrt{18}+\sqrt{3}-\sqrt{12}-\sqrt{2}=3\sqrt{2}+\sqrt{3}-2\sqrt{3}-\sqrt{2}=2\sqrt{2}-\sqrt{3}$。'),
        value(r'$(\sqrt{2}-1)(\sqrt{6}+\sqrt{3})=$？', (S(2) - 1) * (S(6) + S(3)),
              [o(r'\sqrt{3}', S(3)), o(r'2\sqrt{3}', 2 * S(3)), o(r'2\sqrt{3}+\sqrt{6}', 2 * S(3) + S(6)), o(r'\sqrt{3}-\sqrt{6}', S(3) - S(6))],
              r'$\sqrt{12}+\sqrt{6}-\sqrt{6}-\sqrt{3}=2\sqrt{3}-\sqrt{3}=\sqrt{3}$。'),
        value(r'$(\sqrt{3}+1)(\sqrt{3}+2)=$？', (S(3) + 1) * (S(3) + 2),
              [o(r'5+3\sqrt{3}', 5 + 3 * S(3)), o(r'3+3\sqrt{3}', 3 + 3 * S(3)), o(r'5+2\sqrt{3}', 5 + 2 * S(3)), o(r'2+3\sqrt{3}', 2 + 3 * S(3))],
              r'$\sqrt{3}\times\sqrt{3}+2\sqrt{3}+\sqrt{3}+2=3+3\sqrt{3}+2=5+3\sqrt{3}$。'),
    ]),
    slot(7, '括號除以根式', [
        value(r'$(6\sqrt{3}+\sqrt{6})\div\sqrt{3}=$？', (6 * S(3) + S(6)) / S(3),
              [o(r'6+\sqrt{2}', 6 + S(2)), o(r'6+\sqrt{6}', 6 + S(6)), o(r'6\sqrt{2}', 6 * S(2)), o(r'2\sqrt{3}+\sqrt{2}', 2 * S(3) + S(2))],
              r'每一項都除以 $\sqrt{3}$：$6\sqrt{3}\div\sqrt{3}=6$，$\sqrt{6}\div\sqrt{3}=\sqrt{2}$。'),
        value(r'$(4\sqrt{6}-2)\div\sqrt{2}=$？', (4 * S(6) - 2) / S(2),
              [o(r'4\sqrt{3}-\sqrt{2}', 4 * S(3) - S(2)), o(r'4\sqrt{3}-2', 4 * S(3) - 2), o(r'2\sqrt{3}-\sqrt{2}', 2 * S(3) - S(2)), o(r'4\sqrt{3}-2\sqrt{2}', 4 * S(3) - 2 * S(2))],
              r'$4\sqrt{6}\div\sqrt{2}=4\sqrt{3}$，$2\div\sqrt{2}=\dfrac{2}{\sqrt{2}}=\sqrt{2}$。'),
        value(r'$(4\sqrt{2}+\sqrt{6})\div\sqrt{3}=$？', (4 * S(2) + S(6)) / S(3),
              [o(r'\dfrac{4\sqrt{6}}{3}+\sqrt{2}', 4 * S(6) / 3 + S(2)), o(r'\dfrac{4\sqrt{6}}{3}+\sqrt{6}', 4 * S(6) / 3 + S(6)), o(r'4\sqrt{6}+\sqrt{2}', 4 * S(6) + S(2)), o(r'\dfrac{4\sqrt{2}}{3}+\sqrt{2}', 4 * S(2) / 3 + S(2))],
              r'$\dfrac{4\sqrt{2}}{\sqrt{3}}=\dfrac{4\sqrt{6}}{3}$，$\dfrac{\sqrt{6}}{\sqrt{3}}=\sqrt{2}$。'),
    ]),
    slot(8, '乘除混合：合成一個根號', [
        form(r'$\sqrt{\dfrac{1}{3}}\times\sqrt{\dfrac{2}{3}}\div\sqrt{\dfrac{1}{4}}=$？（最簡根式）', S(R(1, 3)) * S(R(2, 3)) / S(R(1, 4)),
             [rad(2, 2, 3), raw(r'$\sqrt{\dfrac{8}{9}}$', S(R(8, 9)), False), rad(1, 2, 18), rad(1, 2, 3)],
             r'$\sqrt{\dfrac{1}{3}\times\dfrac{2}{3}\times4}=\sqrt{\dfrac{8}{9}}=\dfrac{2\sqrt{2}}{3}$。除以 $\sqrt{\dfrac{1}{4}}$ 就是乘 $\sqrt{4}$。'),
        form(r'$\sqrt{\dfrac{3}{4}}\times\sqrt{\dfrac{1}{2}}\div\sqrt{\dfrac{3}{2}}=$？（最簡根式）', S(R(3, 4)) * S(R(1, 2)) / S(R(3, 2)),
             [rad(1, 1, 2), raw(r'$\sqrt{\dfrac{1}{4}}$', R(1, 2), False), rad(3, 1, 8), rad(1, 1, 4)],
             r'$\sqrt{\dfrac{3}{4}\times\dfrac{1}{2}\times\dfrac{2}{3}}=\sqrt{\dfrac{1}{4}}=\dfrac{1}{2}$。'),
        form(r'$\sqrt{\dfrac{2}{5}}\times\sqrt{\dfrac{5}{6}}\div\sqrt{\dfrac{1}{3}}=$？（最簡根式）', S(R(2, 5)) * S(R(5, 6)) / S(R(1, 3)),
             [rad(1, 1), rad(1, 3), rad(1, 1, 9), rad(1, 3, 3)],
             r'$\sqrt{\dfrac{2}{5}\times\dfrac{5}{6}\times3}=\sqrt{1}=1$。'),
    ]),
    slot(9, '比較大小：根號不能直接相加', [
        relation(r'$\sqrt{2}+\sqrt{3}$ 和 $\sqrt{5}$ 的大小關係？', S(2) + S(3), S(5),
                 [r'$\sqrt{2}+\sqrt{3}>\sqrt{5}$', r'$\sqrt{2}+\sqrt{3}<\sqrt{5}$', r'$\sqrt{2}+\sqrt{3}=\sqrt{5}$', '無法比較'],
                 r'$\sqrt{2}+\sqrt{3}\approx1.414+1.732=3.146$，$\sqrt{5}\approx2.236$。根號不能這樣相加。'),
        relation(r'$\sqrt{3}+\sqrt{12}$ 和 $\sqrt{27}$ 的大小關係？', S(3) + S(12), S(27),
                 [r'$\sqrt{3}+\sqrt{12}>\sqrt{27}$', r'$\sqrt{3}+\sqrt{12}<\sqrt{27}$', r'$\sqrt{3}+\sqrt{12}=\sqrt{27}$', '無法比較'],
                 r'$\sqrt{3}+\sqrt{12}=\sqrt{3}+2\sqrt{3}=3\sqrt{3}=\sqrt{27}$，剛好相等（化簡後是同類方根）。'),
        relation(r'$2\sqrt{2}$ 和 $\sqrt{2}+\sqrt{3}$ 的大小關係？', 2 * S(2), S(2) + S(3),
                 [r'$2\sqrt{2}>\sqrt{2}+\sqrt{3}$', r'$2\sqrt{2}<\sqrt{2}+\sqrt{3}$', r'$2\sqrt{2}=\sqrt{2}+\sqrt{3}$', '無法比較'],
                 r'$2\sqrt{2}=\sqrt{2}+\sqrt{2}$，而 $\sqrt{2}<\sqrt{3}$，所以 $2\sqrt{2}<\sqrt{2}+\sqrt{3}$。'),
    ]),
    slot(10, '哪一個算對了？（常見錯誤）', [
        statement('下列哪一個計算是正確的？', [
            (r'$\sqrt{2}+\sqrt{8}=3\sqrt{2}$', S(2) + S(8), 3 * S(2)),
            (r'$\sqrt{2}+\sqrt{8}=\sqrt{10}$', S(2) + S(8), S(10)),
            (r'$2\sqrt{3}+3\sqrt{2}=5\sqrt{5}$', 2 * S(3) + 3 * S(2), 5 * S(5)),
            (r'$\sqrt{12}-\sqrt{3}=3$', S(12) - S(3), 3)],
            r'$\sqrt{8}=2\sqrt{2}$，所以 $\sqrt{2}+\sqrt{8}=3\sqrt{2}$；不同類方根不能合併；$\sqrt{12}-\sqrt{3}=\sqrt{3}$。'),
        statement('下列哪一個計算是正確的？', [
            (r'$\sqrt{18}-\sqrt{8}=\sqrt{2}$', S(18) - S(8), S(2)),
            (r'$5\sqrt{2}-\sqrt{2}=5$', 5 * S(2) - S(2), 5),
            (r'$\sqrt{3}+\sqrt{3}=\sqrt{6}$', 2 * S(3), S(6)),
            (r'$3+\sqrt{2}=3\sqrt{2}$', 3 + S(2), 3 * S(2))],
            r'$3\sqrt{2}-2\sqrt{2}=\sqrt{2}$；$5\sqrt{2}-\sqrt{2}=4\sqrt{2}$；$\sqrt{3}+\sqrt{3}=2\sqrt{3}$；整數和根式不能合併。'),
        statement('下列哪一個計算是正確的？', [
            (r'$\sqrt{27}+\sqrt{12}=5\sqrt{3}$', S(27) + S(12), 5 * S(3)),
            (r'$\sqrt{27}+\sqrt{12}=\sqrt{39}$', S(27) + S(12), S(39)),
            (r'$2\sqrt{5}+\sqrt{5}=2\sqrt{10}$', 3 * S(5), 2 * S(10)),
            (r'$\sqrt{50}-\sqrt{2}=\sqrt{48}$', S(50) - S(2), S(48))],
            r'$3\sqrt{3}+2\sqrt{3}=5\sqrt{3}$；$2\sqrt{5}+\sqrt{5}=3\sqrt{5}$；$\sqrt{50}-\sqrt{2}=5\sqrt{2}-\sqrt{2}=4\sqrt{2}$。'),
    ]),
]

if __name__ == '__main__':
    export('g8-2-2c', '2-2(3) 根式的加減與混合運算：課後檢核', '課本 p.73–85（題目自編，答案已用 SymPy 核算）', SLOTS)
