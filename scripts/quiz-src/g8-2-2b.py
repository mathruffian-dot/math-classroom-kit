r"""2-2(2) 最簡根式與分母有理化：課後形成性評量題庫（10 個題位 × 3 題換數字，四選一）。

用法：python -X utf8 scripts/quiz-src/g8-2-2b.py
範圍：2-2(1)（簡記、乘除、比大小）＋ 2-2(2)（最簡根式、平方因數搬出、分母有理化、乘除後化簡）。
不用根式的加減（2-2(3)）與乘法公式（2-2(4)）。
「化成最簡根式」的題目（form）：錯誤選項可以是值相同但不是最簡的寫法（例如 2√12、√(3/2)），核算時會確認它真的不是最簡。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from quizlib import R, S, export, form, rad, raw, relation, slot, statement, txt  # noqa: E402


def frac_sqrt(p, q):
    return rf'\sqrt{{\dfrac{{{p}}}{{{q}}}}}'


def simplify_q(n, right, wrong_sq, partial, wrong2):
    """√n 化成最簡根式。right／wrong_sq／wrong2＝(coef, inside)，partial＝(coef, inside) 值相同但不是最簡。"""
    return form(rf'把 $\sqrt{{{n}}}$ 化成最簡根式。', S(n),
                [rad(*right), rad(*wrong_sq), rad(*partial), rad(*wrong2)],
                rf'找最大的平方因數：$\sqrt{{{n}}}=\sqrt{{{right[0] ** 2}\times{right[1]}}}={right[0]}\sqrt{{{right[1]}}}$。平方因數要開方才搬出來，而且要用最大的。')


def power_q(base, exp, right, wrong, partial, wrong2):
    return form(rf'把 $\sqrt{{{base}^{{{exp}}}}}$ 化成最簡根式。', S(base ** exp),
                [rad(*right), rad(*wrong), rad(*partial), rad(*wrong2)],
                rf'${base}^{{{exp}}}={base}^{{{exp - 1}}}\times{base}$，$\sqrt{{{base}^{{{exp - 1}}}}}={base ** ((exp - 1) // 2)}$，所以 $\sqrt{{{base}^{{{exp}}}}}={right[0]}\sqrt{{{right[1]}}}$。')


SLOTS = [
    slot(1, '最簡根式：搬出最大的平方因數', [
        simplify_q(72, (6, 2), (36, 2), (2, 18), (3, 2)),
        simplify_q(48, (4, 3), (16, 3), (2, 12), (8, 3)),
        simplify_q(108, (6, 3), (36, 3), (3, 12), (9, 3)),
    ]),
    slot(2, '最簡根式：次方的形式', [
        power_q(3, 5, (9, 3), (27, 3), (3, 27), (5, 3)),
        power_q(5, 3, (5, 5), (25, 5), (1, 125), (15, 1)),
        power_q(2, 7, (8, 2), (16, 2), (2, 32), (7, 2)),
    ]),
    slot(3, '分母有理化：a ÷ √n', [
        form(r'把 $\dfrac{5}{\sqrt{2}}$ 化成最簡根式（分母有理化）。', 5 / S(2),
             [rad(5, 2, 2), rad(5, 2), raw(r'\dfrac{5}{\sqrt{2}}', 5 / S(2), False), rad(1, 10, 2)],
             r'分子分母同乘 $\sqrt{2}$：$\dfrac{5}{\sqrt{2}}=\dfrac{5\sqrt{2}}{\sqrt{2}\times\sqrt{2}}=\dfrac{5\sqrt{2}}{2}$。分子也要乘。'),
        form(r'把 $\dfrac{6}{\sqrt{3}}$ 化成最簡根式（分母有理化）。', 6 / S(3),
             [rad(2, 3), rad(6, 3), rad(6, 3, 3), rad(3, 2)],
             r'$\dfrac{6}{\sqrt{3}}=\dfrac{6\sqrt{3}}{3}=2\sqrt{3}$。有理化後還要約分。'),
        form(r'把 $\dfrac{3}{2\sqrt{6}}$ 化成最簡根式（分母有理化）。', R(3, 2) / S(6),
             [rad(1, 6, 4), rad(3, 6, 12), rad(3, 6, 2), rad(1, 6, 2)],
             r'$\dfrac{3}{2\sqrt{6}}=\dfrac{3\sqrt{6}}{2\sqrt{6}\times\sqrt{6}}=\dfrac{3\sqrt{6}}{12}=\dfrac{\sqrt{6}}{4}$。分母 $2\sqrt{6}\times\sqrt{6}=12$。'),
    ]),
    slot(4, '根號內是分數', [
        form(rf'把 ${frac_sqrt(3, 8)}$ 化成最簡根式。', S(R(3, 8)),
             [rad(1, 6, 4), raw(r'\dfrac{\sqrt{3}}{8}', S(3) / 8), raw(r'\dfrac{\sqrt{3}}{2\sqrt{2}}', S(3) / (2 * S(2)), False), rad(1, 6, 8)],
             r'$\sqrt{\dfrac{3}{8}}=\dfrac{\sqrt{3}}{\sqrt{8}}=\dfrac{\sqrt{3}}{2\sqrt{2}}=\dfrac{\sqrt{6}}{4}$。根號內的分母也要開方，再有理化。'),
        form(rf'把 ${frac_sqrt(5, 12)}$ 化成最簡根式。', S(R(5, 12)),
             [rad(1, 15, 6), raw(r'\dfrac{\sqrt{5}}{12}', S(5) / 12), raw(r'\dfrac{\sqrt{5}}{2\sqrt{3}}', S(5) / (2 * S(3)), False), rad(1, 15, 12)],
             r'$\sqrt{\dfrac{5}{12}}=\dfrac{\sqrt{5}}{2\sqrt{3}}=\dfrac{\sqrt{15}}{6}$。'),
        form(rf'把 ${frac_sqrt(2, 27)}$ 化成最簡根式。', S(R(2, 27)),
             [rad(1, 6, 9), raw(r'\dfrac{\sqrt{2}}{27}', S(2) / 27), raw(r'\dfrac{\sqrt{2}}{3\sqrt{3}}', S(2) / (3 * S(3)), False), rad(1, 6, 3)],
             r'$\sqrt{\dfrac{2}{27}}=\dfrac{\sqrt{2}}{3\sqrt{3}}=\dfrac{\sqrt{6}}{9}$。'),
    ]),
    slot(5, '根號內是小數', [
        form(r'把 $\sqrt{0.3}$ 化成最簡根式。', S(R(3, 10)),
             [rad(1, 30, 10), rad(1, 3, 10), txt('$0.3$', R(3, 10)), raw(r'\dfrac{\sqrt{3}}{\sqrt{10}}', S(3) / S(10), False)],
             r'$\sqrt{0.3}=\sqrt{\dfrac{3}{10}}=\dfrac{\sqrt{3}}{\sqrt{10}}=\dfrac{\sqrt{30}}{10}$。根號內不能留小數。'),
        form(r'把 $\sqrt{0.5}$ 化成最簡根式。', S(R(1, 2)),
             [rad(1, 2, 2), rad(1, 5, 10), txt('$0.5$', R(1, 2)), raw(r'\dfrac{1}{\sqrt{2}}', 1 / S(2), False)],
             r'$\sqrt{0.5}=\sqrt{\dfrac{1}{2}}=\dfrac{1}{\sqrt{2}}=\dfrac{\sqrt{2}}{2}$。'),
        form(r'把 $\sqrt{1.2}$ 化成最簡根式。', S(R(6, 5)),
             [rad(1, 30, 5), rad(1, 12, 10), txt('$1.2$', R(6, 5)), raw(r'\sqrt{\dfrac{6}{5}}', S(R(6, 5)), False)],
             r'$\sqrt{1.2}=\sqrt{\dfrac{6}{5}}=\dfrac{\sqrt{6}}{\sqrt{5}}=\dfrac{\sqrt{30}}{5}$。'),
    ]),
    slot(6, '乘完再化成最簡', [
        form(r'$\sqrt{6}\times\sqrt{8}=$？（最簡根式）', S(6) * S(8),
             [rad(4, 3), rad(1, 14), rad(1, 48), rad(16, 3)],
             r'$\sqrt{6\times8}=\sqrt{48}=\sqrt{16\times3}=4\sqrt{3}$。'),
        form(r'$\sqrt{10}\times\sqrt{15}=$？（最簡根式）', S(10) * S(15),
             [rad(5, 6), rad(1, 25), rad(1, 150), rad(25, 6)],
             r'$\sqrt{10\times15}=\sqrt{150}=\sqrt{25\times6}=5\sqrt{6}$。'),
        form(r'$\sqrt{12}\times\sqrt{6}=$？（最簡根式）', S(12) * S(6),
             [rad(6, 2), rad(1, 18), rad(2, 18), rad(36, 2)],
             r'$\sqrt{12\times6}=\sqrt{72}=\sqrt{36\times2}=6\sqrt{2}$。'),
    ]),
    slot(7, '除完再有理化', [
        form(r'$\sqrt{45}\div\sqrt{30}=$？（最簡根式）', S(45) / S(30),
             [rad(1, 6, 2), raw(r'\sqrt{\dfrac{3}{2}}', S(R(3, 2)), False), rad(1, 6), rad(1, 3, 2)],
             r'$\sqrt{\dfrac{45}{30}}=\sqrt{\dfrac{3}{2}}=\dfrac{\sqrt{3}}{\sqrt{2}}=\dfrac{\sqrt{6}}{2}$。'),
        form(r'$\sqrt{2}\div\sqrt{11}=$？（最簡根式）', S(2) / S(11),
             [rad(1, 22, 11), raw(r'\dfrac{\sqrt{2}}{\sqrt{11}}', S(2) / S(11), False), rad(1, 22), rad(1, 2, 11)],
             r'$\dfrac{\sqrt{2}}{\sqrt{11}}=\dfrac{\sqrt{2}\times\sqrt{11}}{11}=\dfrac{\sqrt{22}}{11}$。'),
        form(r'$\sqrt{20}\div\sqrt{35}=$？（最簡根式）', S(20) / S(35),
             [rad(2, 7, 7), raw(r'\dfrac{2}{\sqrt{7}}', 2 / S(7), False), rad(2, 7), rad(1, 7, 7)],
             r'$\sqrt{\dfrac{20}{35}}=\sqrt{\dfrac{4}{7}}=\dfrac{2}{\sqrt{7}}=\dfrac{2\sqrt{7}}{7}$。'),
    ]),
    slot(8, '乘除混合：合成一個根號再化簡', [
        form(r'$\sqrt{\dfrac{8}{3}}\times\sqrt{\dfrac{27}{16}}=$？（最簡根式）', S(R(8, 3)) * S(R(27, 16)),
             [rad(3, 2, 2), raw(r'\dfrac{3}{\sqrt{2}}', 3 / S(2), False), rad(3, 2), raw(r'\sqrt{\dfrac{9}{2}}', S(R(9, 2)), False)],
             r'$\sqrt{\dfrac{8}{3}\times\dfrac{27}{16}}=\sqrt{\dfrac{9}{2}}=\dfrac{3}{\sqrt{2}}=\dfrac{3\sqrt{2}}{2}$。'),
        form(r'$\sqrt{\dfrac{3}{5}}\times\sqrt{\dfrac{10}{9}}=$？（最簡根式）', S(R(3, 5)) * S(R(10, 9)),
             [rad(1, 6, 3), raw(r'\sqrt{\dfrac{2}{3}}', S(R(2, 3)), False), rad(1, 6), rad(2, 1, 3)],
             r'$\sqrt{\dfrac{3}{5}\times\dfrac{10}{9}}=\sqrt{\dfrac{2}{3}}=\dfrac{\sqrt{2}}{\sqrt{3}}=\dfrac{\sqrt{6}}{3}$。'),
        form(r'$\sqrt{\dfrac{7}{2}}\times\sqrt{\dfrac{3}{14}}=$？（最簡根式）', S(R(7, 2)) * S(R(3, 14)),
             [rad(1, 3, 2), raw(r'\sqrt{\dfrac{3}{4}}', S(R(3, 4)), False), rad(1, 3, 4), rad(3, 1, 4)],
             r'$\sqrt{\dfrac{7}{2}\times\dfrac{3}{14}}=\sqrt{\dfrac{3}{4}}=\dfrac{\sqrt{3}}{2}$。'),
    ]),
    slot(9, '有理化前後比大小', [
        relation(r'$\dfrac{1}{\sqrt{2}}$ 和 $\dfrac{\sqrt{2}}{2}$ 的大小關係？', 1 / S(2), S(2) / 2,
                 [r'$\dfrac{1}{\sqrt{2}}>\dfrac{\sqrt{2}}{2}$', r'$\dfrac{1}{\sqrt{2}}<\dfrac{\sqrt{2}}{2}$', r'$\dfrac{1}{\sqrt{2}}=\dfrac{\sqrt{2}}{2}$', '無法比較'],
                 r'$\dfrac{1}{\sqrt{2}}=\dfrac{1\times\sqrt{2}}{\sqrt{2}\times\sqrt{2}}=\dfrac{\sqrt{2}}{2}$，乘以 $1$ 值不變，所以一樣大。'),
        relation(r'$\dfrac{3}{\sqrt{2}}$ 和 $2$ 的大小關係？', 3 / S(2), 2,
                 [r'$\dfrac{3}{\sqrt{2}}>2$', r'$\dfrac{3}{\sqrt{2}}<2$', r'$\dfrac{3}{\sqrt{2}}=2$', '無法比較'],
                 r'$\dfrac{3}{\sqrt{2}}=\dfrac{3\sqrt{2}}{2}=\sqrt{\dfrac{18}{4}}=\sqrt{4.5}$，$2=\sqrt{4}$，$4.5>4$。'),
        relation(r'$\dfrac{\sqrt{3}}{3}$ 和 $\dfrac{1}{2}$ 的大小關係？', S(3) / 3, R(1, 2),
                 [r'$\dfrac{\sqrt{3}}{3}>\dfrac{1}{2}$', r'$\dfrac{\sqrt{3}}{3}<\dfrac{1}{2}$', r'$\dfrac{\sqrt{3}}{3}=\dfrac{1}{2}$', '無法比較'],
                 r'$\dfrac{\sqrt{3}}{3}=\sqrt{\dfrac{3}{9}}=\sqrt{\dfrac{1}{3}}$，$\dfrac{1}{2}=\sqrt{\dfrac{1}{4}}$，$\dfrac{1}{3}>\dfrac{1}{4}$。'),
    ]),
    slot(10, '哪一個是最簡根式？', [
        statement('下列哪一個是最簡根式？', [
            (rad(3, 2)[0], rad(3, 2)[2]), (rad(1, 12)[0], rad(1, 12)[2]), (r'$\sqrt{\dfrac{2}{3}}$', False), (r'$\dfrac{1}{\sqrt{5}}$', False)],
            r'$\sqrt{12}=2\sqrt{3}$ 有平方因數；$\sqrt{\dfrac{2}{3}}$ 根號內有分數；$\dfrac{1}{\sqrt{5}}$ 分母有根號。'),
        statement('下列哪一個是最簡根式？', [
            (rad(2, 6, 3)[0], rad(2, 6, 3)[2]), (r'$\dfrac{\sqrt{24}}{2}$', False), (r'$\dfrac{\sqrt{5}}{\sqrt{3}}$', False), (r'$\sqrt{0.5}$', False)],
            r'$\dfrac{\sqrt{24}}{2}=\sqrt{6}$；$\dfrac{\sqrt{5}}{\sqrt{3}}$ 分母有根號；$\sqrt{0.5}$ 根號內是小數。'),
        statement('下列哪一個是最簡根式？', [
            (rad(5, 7)[0], rad(5, 7)[2]), (rad(1, 18)[0], rad(1, 18)[2]), (r'$\dfrac{2}{\sqrt{2}}$', False), (r'$\sqrt{\dfrac{1}{3}}$', False)],
            r'$\sqrt{18}=3\sqrt{2}$；$\dfrac{2}{\sqrt{2}}=\sqrt{2}$；$\sqrt{\dfrac{1}{3}}=\dfrac{\sqrt{3}}{3}$。'),
    ]),
]

if __name__ == '__main__':
    export('g8-2-2b', '2-2(2) 最簡根式與分母有理化：課後檢核', '課本 p.73–81（題目自編，答案已用 SymPy 核算）', SLOTS)
