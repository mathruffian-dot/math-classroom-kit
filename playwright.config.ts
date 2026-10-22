import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

// 自己啟動的測試伺服器用一個全新的暫存資料夾存 Durable Object 資料，不受本機舊課堂影響。
// MCK_PORT 可換連接埠（本機已經有別的開發伺服器在 8787 時用）。
const port = process.env.MCK_PORT || '8787';
const persistDir = process.env.MCK_PERSIST_DIR || path.join(os.tmpdir(), `mck-e2e-${Date.now()}`);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm run dev',
    env: { MCK_PERSIST_DIR: persistDir, MCK_PORT: port },
    url: `http://127.0.0.1:${port}/api/config`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL: process.env.E2E_BASE_URL || `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // 本機可設 PW_CHANNEL=msedge 直接使用已安裝的 Edge，不必下載瀏覽器。
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL || undefined } }],
});
