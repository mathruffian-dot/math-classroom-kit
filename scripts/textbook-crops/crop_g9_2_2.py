"""九上 2-2 圓心角、圓周角與弧的關係：從學用版課本 PDF 截圖（學用版沒有紅字解答）。

在 2026數學課 根目錄執行：
  python math-classroom-kit/scripts/textbook-crops/crop_g9_2_2.py . math-classroom-kit/scripts/textbook-crops/g9-2-2-boxes.json rel.json
boxes：{檔名: [PDF 頁, x0, y0, x1, y1]}，座標以 953×1180 的頁面預覽圖（1.6 倍）為準；輸出 2.5 倍 PNG。
PDF 第 n 頁＝課本 p.(n + 109)。
"""
import json
import os
import sys

import pymupdf

ROOT = sys.argv[1]
PDF = ROOT + '/九年級/01_115國中數學3上課本PDF/02_115國中數學3上課本PDF(學)/07_115國中數學3上課本_2-2 圓心角、圓周角與弧的關係(學).pdf'
OUT = ROOT + '/math-classroom-kit/public/lesson-assets/g9-2-2/'
W, H = 953.0, 1180.0
os.makedirs(OUT, exist_ok=True)
crops = json.load(open(sys.argv[2], encoding='utf-8'))
doc = pymupdf.open(PDF)
rel = {}
for name, (pg, x0, y0, x1, y1) in crops.items():
    page = doc[pg - 1]
    r = page.rect
    box = [round(x0 / W, 4), round(y0 / H, 4), round(x1 / W, 4), round(y1 / H, 4)]
    clip = pymupdf.Rect(r.x0 + box[0] * r.width, r.y0 + box[1] * r.height, r.x0 + box[2] * r.width, r.y0 + box[3] * r.height)
    pix = page.get_pixmap(matrix=pymupdf.Matrix(2.5, 2.5), clip=clip)
    pix.save(OUT + name + '.png')
    rel[name] = box
    print(name, pix.width, pix.height)
json.dump(rel, open(sys.argv[3], 'w', encoding='utf-8'), indent=1)
