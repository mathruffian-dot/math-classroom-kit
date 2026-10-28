# 課本截圖重製

`public/lesson-assets/<課程>/` 的截圖來自課本 PDF（有著作權，不進 git，只放在專案資料夾）。

重製 8 上 2-2 的截圖（在 2026數學課 根目錄執行）：

```bash
python -I math-classroom-kit/scripts/textbook-crops/crop_g8_2_2.py . math-classroom-kit/scripts/textbook-crops/g8-2-2-boxes.json rel.json
```

`g8-2-2-boxes.json` 是 `{檔名: [PDF 頁, x0, y0, x1, y1]}`，座標以 927×1157 的頁面預覽圖為準；輸出 2.5 倍解析度 PNG。

重製 8 上 2-3 的截圖（在 2026數學課 根目錄執行）：

```bash
python -I math-classroom-kit/scripts/textbook-crops/crop_g8_2_3.py . math-classroom-kit/scripts/textbook-crops/g8-2-3-boxes.json rel.json
```

`g8-2-3-boxes.json` 的格式同上（927×1157 預覽圖座標，預覽圖在 `八年級/115上_視覺化互動教學/textbook-pages/2-3/`），輸出到 `public/lesson-assets/g8-2-3/`（30 張，只截題目框與附圖，不截解答）。

重製 9 上 2-1 的截圖（在 2026數學課 根目錄執行）：

```bash
python -I math-classroom-kit/scripts/textbook-crops/crop_g9_2_1.py . math-classroom-kit/scripts/textbook-crops/g9-2-1-boxes.json rel.json
```

`g9-2-1-boxes.json` 的座標以 953×1180 的頁面預覽圖（1.6 倍）為準，PDF 第 n 頁＝課本 p.(n＋83)；輸出 45 張 2.5 倍 PNG 到 `public/lesson-assets/g9-2-1/`（例題、隨堂只截題目框與附圖，不截解答）。
