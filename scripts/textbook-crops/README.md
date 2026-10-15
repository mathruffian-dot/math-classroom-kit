# 課本截圖重製

`public/lesson-assets/<課程>/` 的截圖來自課本 PDF（有著作權，不進 git，只放在專案資料夾）。

重製 8 上 2-2 的截圖（在 2026數學課 根目錄執行）：

```bash
python -I math-classroom-kit/scripts/textbook-crops/crop_g8_2_2.py . math-classroom-kit/scripts/textbook-crops/g8-2-2-boxes.json rel.json
```

`g8-2-2-boxes.json` 是 `{檔名: [PDF 頁, x0, y0, x1, y1]}`，座標以 927×1157 的頁面預覽圖為準；輸出 2.5 倍解析度 PNG。
