import pymupdf, json, sys
ROOT = sys.argv[1]
PDF = ROOT + '/八年級/115上_國中_數學_教材資源_課本_學用PDF_二年級/05-115國中數學2上-課本-2-2-學用(115f231560).pdf'
OUT = ROOT + '/math-classroom-kit/public/lesson-assets/g8-2-2/'
W, H = 927.0, 1157.0  # preview PNG size used to pick boxes
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
