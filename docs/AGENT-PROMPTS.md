# 可複製的 agent 提示詞

## 提示詞一：把課本單元做成課程

```text
請依 math-classroom-kit/AGENTS.md 與 docs/AUTHORING.md，把〈八上 2-3 畢氏定理〉做成數感課堂課程。
1. 先盤點課本每個例題與隨堂練習：頁碼、題目、教用版官方答案，存成 content/sources/<id>-inventory.json。
2. 每個例題與隨堂只截最重要的課本圖，放到 public/lesson-assets/<id>/（不進 git）。
3. 依認知科學流程排頁（提取→預測→具體操作→圖式連結→工作範例→半完成範例→隨堂→錯誤分析→出場券／自評），
   每頁都有對應的可操作視覺化與 IRS；隨堂改成 numeric items（課本題＋換數字題，最多 3 題）；
   錯誤分析用 canvas＋評量規準（附參考解答）。
4. 數學式用 $LaTeX$ 或課本純文字寫法；換數字題的答案要自己算過。
5. 執行 npm run lessons、npm run check，必要時 PW_CHANNEL=msedge npm run test:e2e，回報頁數、提醒與未驗證項目。
```

## 提示詞二：修改既有課程

```text
請修改 content/lessons/<檔名>.json（或產生器 scripts/lessons-src/<檔名>.mjs）的〈第 N 頁〉：
<要改的內容>。維持每頁都有 IRS 與 source；改完執行 npm run lessons 與 npm run check。
```

## 提示詞三：部署到我的 Cloudflare

```text
請依 docs/DEPLOYMENT.md 部署數感課堂到我的 Cloudflare（APP_MODE=cloudflare，不用 Supabase）。
教師帳號用我的 Cloudflare 帳號信箱（以 wrangler secret 設定），部署前先執行 npm run check。
不要把 API key 貼到聊天或檔案；部署後提供網址並提醒我修改預設密碼。
```
