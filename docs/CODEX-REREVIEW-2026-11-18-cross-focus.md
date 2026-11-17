## Verdict：APPROVE WITH FIXES

未發現新的執行期安全阻擋問題；相容性測試仍需修正，避免 CI 跳過關鍵驗證。

本次未修改檔案、未執行 Playwright。指定測試 **47/47 通過、0 skip**，`npx tsc --noEmit` 通過。

## 前次發現狀態

| 前次發現 | 複審結果 |
|---|---|
| **B1：混合順序洩漏出題種子** | **已修正。** `worker/cross.ts:152–178,261–264` 使用獨立的 32-byte `getRandomValues` 秘密；排序不再依賴 `play.secret`。 |
| **S1：省略 focus 時未驗證 escalate** | **已修正。** `worker/app.ts:1720–1734` 逐欄驗證，明確區分新舊格式；測試涵蓋錯誤型別及混用語意。 |
| **S2：未測部署時已有作答中的學生** | **功能涵蓋已補齊。** `tests/cross-focus.test.mjs:533–628` 實際以舊版產生狀態，驗證原題、提交、重送、計分、升級、冷卻及限速紀錄。本次確實執行；測試可靠性另見下項。 |
| **NIT：gcf 仍可勾選自動前進** | **已修正。** `src/cross-live.ts:196–218` 停用並清除勾選，混合時隱藏。 |

安全追查結果：

- `worker/sha256.ts:13–56` 在目前短輸入用途未見演算法錯誤；`tests/cross-focus.test.mjs:393–398` 涵蓋 padding 邊界、多區塊輸入、與 `node:crypto` 比對及固定 `abc` 向量，均通過。
- `worker/cross.ts:175–178` 是秘密前綴雜湊，**不是 HMAC**；但目前只公開六種排列之一，輸入由伺服器組成，也沒有任意附加 padding 的路徑，未找到可利用的長度延伸攻擊。
- 秘密與 `seat.m` 隨伺服器課堂資料保存，發新題後經 `worker/app.ts:2390–2393` 寫入。舊場次保留原秘密與原題；缺少 `mixKey` 時僅混合流程補建。
- 未發現 `mixKey` 或題目 seed 被直接送至師生畫面、推送、公布或 JSON／CSV 匯出；輸出使用明確欄位投影，`worker/cross.ts:511–524` 也排除逐題 seed。

## NEW BLOCKERS

無。

## SHOULD-FIX

- **[P2] 舊版相容性測試會把所有重建錯誤轉成 skip。**  
  `tests/cross-focus.test.mjs:483–505` 依賴 `8ccf588` 的 Git 歷史，並逐檔啟動 Git；外層 `catch` 不只攔截缺少提交，也吞掉檔案讀寫、esbuild 建置及模組載入錯誤。結果是**關鍵相容性測試缺席，測試指令仍可能成功退出**。目前 `.github/workflows/check.yml:15` 也未明確確保該歷史提交存在。本次舊版測試約耗時 5.25 秒。  
  **建議：**改用固定的舊版狀態 fixture；若保留舊版伺服器重建，CI 必須確保提交可用，且建置／載入失敗應直接失敗，不能概括轉成 skip。

## NITS

- **[P3] 同步呼叫鏈不足以充分支持自行維護密碼學實作。**  
  `worker/sha256.ts:1–2`、`worker/cross.ts:175`：目前同步是程式介面選擇；唯一正式發題入口 `worker/app.ts:2390` 已在 async handler 內，可沿既有序列化佇列 await。建議後續採用平台提供的 Web Crypto HMAC-SHA-256，減少自製雜湊及秘密前綴構造的維護責任。Cloudflare 已支援 SHA-256 與 HMAC。[官方文件](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) 此項屬強化建議，未確認目前存在可利用漏洞。