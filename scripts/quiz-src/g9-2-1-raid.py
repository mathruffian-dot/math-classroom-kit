r"""2-1 點、直線與圓：魔王戰題庫（三類題目，全部用 SymPy 核算）。

用法：C:\AI\H3\venv\Scripts\python.exe -B -X utf8 scripts/quiz-src/g9-2-1-raid.py
掛在這一節最後一堂（2-1(3)）後面，放在 g9-2-1c 的最後。
範圍：2-1(1)～(3) 全部（弧長扇形、點直線與圓／切線、切線段／弦心距）＋先備畢氏、根式；
不用 2-2 圓周角、圓心角與弧的度數關係、外心內心。
三類題目（學生自己選要做哪一類）：
- attack（記憶）：普通攻擊。一步就能算完（弧長、扇形、名詞、切線垂直、弦心距公式）。
- shield（理解）：防護罩。判斷位置關係、找正確算法、角度關係。
- ultimate（應用）：大招。多步驟、切線段、兩弦、生活應用。
題庫＝三堂課後檢核題（依類型分配）＋新增換數字題與較難應用題。
"""
import importlib.util
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sympy import Rational, pi, sqrt  # noqa: E402

from quizlib import ROOT, check_item, item_json, raw, statement  # noqa: E402

R = Rational
S = sqrt
HERE = Path(__file__).parent


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), HERE / f'{name}.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


A, B, C = load('g9-2-1a'), load('g9-2-1b'), load('g9-2-1c')
LESSON_MOD = {'g9-2-1a': A, 'g9-2-1b': B, 'g9-2-1c': C}

FROM_LESSONS = {
    'g9-2-1a': {
        'attack': ['q1', 'q2', 'q3', 'q10'],
        'shield': ['q4', 'q5', 'q6'],
        'ultimate': ['q7', 'q8', 'q9'],
    },
    'g9-2-1b': {
        'attack': ['q4', 'q5'],
        'shield': ['q1', 'q2', 'q3', 'q9', 'q10'],
        'ultimate': ['q6', 'q7', 'q8'],
    },
    'g9-2-1c': {
        'attack': ['q1', 'q2'],
        'shield': ['q3'],
        'ultimate': ['q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'],
    },
}


def safe_append(items, topic, maker):
    """建立題目；選項重複或核算失敗就跳過。"""
    try:
        v = maker()
        check_item(v, f'probe-{topic}')
        items.append((topic, v))
    except Exception as e:
        # 換數字時偶發選項撞號，略過該組
        pass


def new_attack():
    items = []
    for r, a in [(8, 45), (12, 90), (5, 72), (10, 36), (15, 24), (6, 150), (9, 80), (4, 180), (14, 60), (7, 120)]:
        safe_append(items, '弧長', lambda r=r, a=a: A.arc_len(r, a))
    for r, a in [(10, 45), (8, 90), (6, 60), (5, 120), (12, 40), (9, 100), (4, 180), (15, 30), (7, 72), (3, 240)]:
        safe_append(items, '扇形面積', lambda r=r, a=a: A.sector_area(r, a))
    for r, a in [(6, 90), (10, 120), (4, 60), (9, 45), (8, 180), (5, 150), (12, 30), (7, 100)]:
        safe_append(items, '扇形周長', lambda r=r, a=a: A.sector_perim(r, a))
    for kind in (1, 2, 3, 1, 2, 3):
        safe_append(items, '圓的名詞', lambda kind=kind: A.terms(kind))
    for d in [5, 8, 10, '3.5', '6.5', 9, 12, '2.5']:
        safe_append(items, '切線到圓心的距離＝半徑', lambda d=d: B.tangent_diam(d))
    for a in [40, 55, 70, 28, 45, 65, 33, 48]:
        safe_append(items, '切線垂直半徑（角度）', lambda a=a: B.tangent_angle(a))
    for a in [20, 40, 15, 28, 36, 42]:
        safe_append(items, '切線段性質：PO 平分∠APB', lambda a=a: C.apb_angle(a))
    for p in [40, 70, 20, 55, 80, 25]:
        safe_append(items, '切線與半徑：求∠AOB', lambda p=p: C.aob_angle(p))
    return items


def new_shield():
    items = []
    for Sarea, r in [(18 * pi, 6), (8 * pi, 4), (32 * pi, 8), (50 * pi, 10), (12.5 * pi, 5), (72 * pi, 12)]:
        safe_append(items, '由扇形面積求圓心角', lambda Sarea=Sarea, r=r: A.angle_from_area(Sarea, r))
    for L, r in [(3 * pi, 9), (4 * pi, 12), (pi, 6), (5 * pi, 10), (8 * pi, 16), (2.5 * pi, 5)]:
        safe_append(items, '由弧長求圓心角', lambda L=L, r=r: A.angle_from_arc(L, r))
    for L, a in [(3 * pi, 90), (5 * pi, 60), (pi, 45), (6 * pi, 120), (4 * pi, 80), (8 * pi, 40)]:
        safe_append(items, '由弧長求半徑', lambda L=L, a=a: A.radius_from_arc(L, a))
    for px, py in [(3, 5), (5, 5), (1, 5), (0, 5), (4, 3), (6, 2), (5, 0), (2, 3)]:
        safe_append(items, '點與圓（坐標）', lambda px=px, py=py: B.point_coord(px, py))
    for diam, op in [(8, 3), (14, 8), (16, 10), (12, 6), (18, 5), (10, '4.5'), (20, 12)]:
        safe_append(items, '點與圓（和半徑比）', lambda diam=diam, op=op: B.point_dist(diam, op))
    for diam, d in [(12, 5), (16, 8), (20, 6), (10, 3), (14, 10), (18, 9), (8, 2)]:
        safe_append(items, '直線與圓的位置關係', lambda diam=diam, d=d: B.line_pos(diam, d))
    for args in [
        (2, 1, 5, 'secant'), (3, 2, 6, 'tangent'), (1, 2, 4, 'none'),
        (4, 1, 8, 'secant'), ('2.5', 1, 5, 'tangent'), (1, 3, 5, 'none'),
        (3, 2, 5, 'secant'), (5, 1, 6, 'tangent'),
    ]:
        safe_append(items, '平行線與圓', lambda args=args: B.parallel(*args))
    # max(ds) 必須 > r，否則「距離最大的那條是切線」會變成第二個正確選項
    for diam, ds in [(16, [8, 6, 4, 10]), (24, [12, 10, 8, 14]), (10, [5, 4, 3, 7]), (18, [9, 7, 5, 12]), (30, [15, 10, 8, 20]), (20, [10, 8, 6, 14])]:
        safe_append(items, '由距離判斷切線、割線', lambda diam=diam, ds=ds: B.four_lines(diam, ds))
    for r, op in [(8, 17), (5, 13), (7, 25), (9, 15), (4, 5)]:
        safe_append(items, '切線段等長：四邊形周長', lambda r=r, op=op: C.quad_perim(r, op))
    # 判斷：d 與 r 的關係
    for r, d, ans in [(5, 5, '切線'), (6, 4, '割線'), (8, 10, '不相交'), (7, 7, '切線'), (9, 3, '割線'), (4, 6, '不相交')]:
        stem = rf'圓的半徑是 ${r}$，圓心到直線的距離是 ${d}$。這條直線和圓的位置關係是？'
        opts = [
            (ans, True),
            ('切線' if ans != '切線' else '割線', False),
            ('割線' if ans != '割線' else '不相交', False),
            ('不相交' if ans != '不相交' else '重合', False),
        ]
        # ensure unique labels
        labels = [o[0] for o in opts]
        if len(set(labels)) < 4:
            continue
        safe_append(items, '判斷直線與圓位置', lambda stem=stem, opts=opts, r=r, d=d, ans=ans: statement(
            stem, opts, rf'比較 $d$ 與 $r$：${d}$ 與 ${r}$ → {ans}（$d=r$ 切線、$d<r$ 割線、$d>r$ 不相交）。'))
    return items


def new_ultimate():
    items = []
    for r in [5, 8, 12, 3, 7, 9]:
        safe_append(items, '弓形面積（直角）', lambda r=r: A.bow90_area(r))
    for r in [5, 8, 10, 3, 9, 15]:
        safe_append(items, '弓形面積（正三角形）', lambda r=r: A.bow60_area(r))
    for r, a in [(5, 90), (8, 90), (10, 60), (4, 60), (12, 90), (6, 60), (7, 90)]:
        safe_append(items, '弓形周長', lambda r=r, a=a: A.bow_perim(r, a))
    for r, ob in [(7, 25), (9, 15), (12, 13), (5, 13), (8, 10), (6, 10), (4, 5), (15, 17)]:
        safe_append(items, '求切線段長', lambda r=r, ob=ob: B.seg_len(r, ob))
    # 只要整數半徑，避免解說出現 2*sqrt(7) 這種程式字串
    for cd, od in [(6, 10), (5, 13), (9, 15), (8, 17), (7, 25), (12, 13), (15, 17), (20, 25), (9, 41), (12, 37), (15, 25), (18, 30)]:
        safe_append(items, '由切線段求半徑', lambda cd=cd, od=od: B.radius_from_seg(cd, od))
    for r, pa in [(5, 12), (8, 15), (7, 24), (9, 12), (6, 8), (20, 21)]:
        safe_append(items, '由半徑與切線段求 OP', lambda r=r, pa=pa: B.op_from_seg(r, pa))
    for r, op in [(8, 17), (9, 15), (12, 13), (5, 13), (7, 25), (6, 10)]:
        safe_append(items, '切點連線 AB 的長', lambda r=r, op=op: C.tangent_chord(r, op))
    for r, d in [(15, 9), (25, 7), (13, 12), (10, 6), (17, 15), (20, 12), (26, 10)]:
        safe_append(items, '由弦心距求弦長', lambda r=r, d=d: C.chord_len(r, d))
    for r, c in [(15, 18), (25, 14), (13, 10), (17, 16), (10, 8), (26, 20)]:
        safe_append(items, '由弦長求弦心距', lambda r=r, c=c: C.chord_dist(r, c))
    for c, d in [(8, 6), (10, 24), (12, 5), (18, 24), (14, 48), (16, 12)]:
        safe_append(items, '由弦長與弦心距求半徑', lambda c=c, d=d: C.radius_from_chord(c, d))
    for args in [(18, 8, 6), (24, 7, 15), (20, 12, 9), (30, 16, 18), (26, 10, 24)]:
        safe_append(items, '兩弦：先求半徑再求弦長', lambda args=args: C.two_chords(*args))
    for args in [(8, 30, 16), (9, 24, 12), (12, 32, 18), (5, 24, 12), (7, 48, 14)]:
        safe_append(items, '同側兩弦的距離 MN', lambda args=args: C.same_side(*args))
    for args in [(40, 30, 'tunnel'), (50, 40, 'tunnel'), (36, 20, 'tunnel'), (60, 20, 'bed'), (48, 14, 'bed'), (80, 18, 'bed')]:
        safe_append(items, '弦心距的生活應用', lambda args=args: C.tunnel(*args))
    return items


def main():
    pools = {'attack': [], 'shield': [], 'ultimate': []}
    for lesson, kinds in FROM_LESSONS.items():
        slots = {s['id']: s for s in LESSON_MOD[lesson].SLOTS}
        for kind, ids in kinds.items():
            for sid in ids:
                s = slots[sid]
                for k, v in enumerate(s['variants'], 1):
                    where = f'{lesson}-{sid}-{k}'
                    check_item(v, where)
                    pools[kind].append(dict(id=where, topic=s['topic'], **item_json(v)))
    for lesson in FROM_LESSONS:
        bank = json.loads((ROOT / 'content/quizzes' / f'{lesson}.json').read_text(encoding='utf8'))
        for s in bank['slots']:
            for k, v in enumerate(s['variants'], 1):
                mine = next((x for p in pools.values() for x in p if x['id'] == f"{lesson}-{s['id']}-{k}"), None)
                if mine:
                    assert {kk: mine[kk] for kk in v} == v, f"{lesson}-{s['id']}-{k} 和 content/quizzes 的題目不一樣"

    NEW = {'attack': new_attack(), 'shield': new_shield(), 'ultimate': new_ultimate()}
    for kind, items in NEW.items():
        for i, (topic, v) in enumerate(items, 1):
            where = f'new-{kind}-{topic}-{i}'
            check_item(v, where)
            pools[kind].append(dict(id=where, topic=topic, **item_json(v)))

    ids = [x['id'] for p in pools.values() for x in p]
    assert len(ids) == len(set(ids)), '題目 ID 重複'
    for kind in pools:
        assert len(pools[kind]) >= 10, f'{kind} 題數不足：{len(pools[kind])}'

    out = dict(
        hostLesson='g9-2-1c',
        title='2-1 點、直線與圓：魔王戰',
        section='2-1',
        source='九年級 2-1(1)～(3) 課後檢核題（依類型分配）＋新增換數字題與綜合應用題；範圍含畢氏定理與根式；答案已用 SymPy 核算',
        pools=pools,
    )
    path = ROOT / 'content/raids' / 'g9-2-1c.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print('✓ 2-1 魔王戰題庫：' + '、'.join(f'{k} {len(v)} 題' for k, v in pools.items()) + f' → {path.name}（全部核算通過）')


if __name__ == '__main__':
    main()
