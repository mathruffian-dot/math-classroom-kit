"""八上 2-3 畢氏定理：從學用版課本 PDF 截圖（只截題目框與附圖，不截解答）。

在 2026數學課 根目錄執行：
  python -I math-classroom-kit/scripts/textbook-crops/crop_g8_2_3.py . math-classroom-kit/scripts/textbook-crops/g8-2-3-boxes.json rel.json
boxes：{檔名: [PDF 頁, x0, y0, x1, y1]}，座標以 927×1157 的頁面預覽圖（八年級/115上_視覺化互動教學/textbook-pages/2-3/）為準；
輸出 2.5 倍 PNG 到 math-classroom-kit/public/lesson-assets/g8-2-3/（著作權，不進 git）。
"""
import json
import os
import sys

import pymupdf

ROOT = sys.argv[1]
PDF = ROOT + '/八年級/115上_國中_數學_教材資源_課本_學用PDF_二年級/06-115國中數學2上-課本-2-3-學用(115f231561).pdf'
OUT = ROOT + '/math-classroom-kit/public/lesson-assets/g8-2-3/'
W, H = 927.0, 1157.0
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
