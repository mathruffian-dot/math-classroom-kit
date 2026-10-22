# 性平彈性課程〈只是開玩笑？〉：把已完成的簡報整份放進數感課堂（非數學課，先只放簡報）。
# 來源：2026彈性課程/性平_自由講堂（簡報 PDF、slides_manifest.json 的標題／時段／講稿、25 秒決策短片、
#       07_IRS/IRS題庫.json 的 Q1–Q5 單選題，放在第 5、7、15、16、19 頁）。
# 產出：public/lesson-assets/gender-joke/（每頁一張 JPG＋短片，不進 git）、content/lessons/gender-joke.json。
# 用法：python -I scripts/lessons-src/gender-joke.py
import json
import shutil
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT.parent.parent / '2026彈性課程' / '性平_自由講堂'
PDF = SRC / '06_完整課程' / '只是開玩笑_八年級完整教學簡報.pdf'
MANIFEST = SRC / '09_製作原始碼' / '簡報' / 'slides_manifest.json'
VIDEO = SRC / '04_AI素材' / '影片' / '只是開玩笑_決策短片.mp4'
POSTER = SRC / '04_AI素材' / '影片' / 'poster.png'
VIDEO_PAGE = 6  # 簡報第 6 頁內嵌決策短片
SKIP_PAGES = {22}  # 第 22 頁是教師備課來源附錄，不放進數感課堂（2026-10-22 老師指示）
IRS = SRC / '07_IRS' / 'IRS題庫.json'
IRS_PAGE = {'Q1': 5, 'Q2': 7, 'Q3': 15, 'Q4': 16, 'Q5': 19}  # 原教材 IRS 題號 → 簡報頁
ASSETS = ROOT / 'public' / 'lesson-assets' / 'gender-joke'
OUT = ROOT / 'content' / 'lessons' / 'gender-joke.json'


def split_tag(tag):
    """「3–7分鐘｜自編故事」或「IRS情境判斷｜3–7分鐘」→（時段, 說明）。"""
    parts = tag.split('｜')
    time = next((p for p in parts if '分鐘' in p or '附錄' in p), '')
    rest = '｜'.join(p for p in parts if p != time)
    return time, rest


def irs_activities():
    """原教材 07_IRS 的 Q1–Q5 → 單選題（答案 A/B/C 轉成選項序號，追問接在解析後面）。"""
    out = {}
    for q in json.loads(IRS.read_text(encoding='utf-8'))['questions']:
        out[IRS_PAGE[q['id']]] = {
            'id': f'irs-{q["id"].lower()}',
            'type': 'single',
            'prompt': q['prompt'],
            'options': q['options'],
            'correct': ['ABC'.index(q['answer'])],
            'explanation': f'{q["explanation"]}\n追問：{q["discussion"]}',
        }
    if sorted(out) != sorted(IRS_PAGE.values()):
        sys.exit('IRS 題庫的題號和 IRS_PAGE 對不起來')
    return out


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    doc = pymupdf.open(PDF)
    if len(doc) != len(manifest):
        sys.exit(f'簡報 {len(doc)} 頁，講稿 {len(manifest)} 頁，數量不一致')

    activities = irs_activities()
    slides = []
    for page, m in zip(doc, manifest):
        n = m['page']
        name = f'p{n:02d}.jpg'
        if n in SKIP_PAGES:
            (ASSETS / name).unlink(missing_ok=True)
            continue
        pix = page.get_pixmap(dpi=144)
        (ASSETS / name).write_bytes(pix.tobytes('jpg', jpg_quality=88))
        time, label = split_tag(m['tag'])
        slide = {
            'id': f'p{n:02d}',
            'phase': time,
            'eyebrow': f'{n:02d} / {label or m["tag"]}',
            'title': m['title'],
            'body': '',
            'figures': [{'src': f'gender-joke/{name}', 'alt': f'簡報第 {n} 頁：{m["title"]}'}],
            'fullSlide': True,
            'notes': m['notes'],
            'source': f'只是開玩笑_八年級完整教學簡報 第 {n} 頁',
        }
        if n == VIDEO_PAGE:
            shutil.copyfile(VIDEO, ASSETS / 'anim-decision.mp4')
            shutil.copyfile(POSTER, ASSETS / 'anim-decision.png')
            slide['animation'] = {
                'src': 'gender-joke/anim-decision.mp4',
                'poster': 'gender-joke/anim-decision.png',
                'caption': '決策短片（25 秒，有旁白）',
                'seconds': 25,
                'reveal': 'always',
            }
        if n in activities:
            if not m['title'].startswith(activities[n]['id'][4:].upper()):
                sys.exit(f'第 {n} 頁「{m["title"]}」不是 {activities[n]["id"]} 的題目頁')
            slide['activity'] = activities[n]
            slide['source'] += f'；IRS 為原教材 {activities[n]["id"][4:].upper()}'
        slides.append(slide)

    lesson = {
        'schemaVersion': 1,
        'id': 'gender-joke',
        'title': '只是開玩笑？看懂性別玩笑，練習旁觀者行動',
        'description': '性平彈性課程（自由講堂）。用自編故事與決策短片，辨識性別玩笑的影響，練習支持語與旁觀者的安全行動。',
        'subject': '性平・八年級彈性課程',
        'duration': 45,
        'objectives': [
            '看懂線索：指出故事中性別玩笑的一個線索',
            '說出支持：說出一句安全的支持語',
            '知道找誰：說出一個求助對象',
        ],
        'slides': slides,
    }
    OUT.write_text(json.dumps(lesson, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{OUT.name}：{len(slides)} 頁')


if __name__ == '__main__':
    main()
