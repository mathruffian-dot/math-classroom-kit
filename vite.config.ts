import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    target: 'es2022',
    // 字型不可內嵌成 data: URL：CSP 是 font-src 'self'，內嵌的 KaTeX 小字型（括號、根號的大尺寸字形）會被擋掉，
    // 例如 3√3 × (−2√5) 的括號會變成空白。
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf|eot)$/.test(file) ? false : undefined),
  },
  server: { host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:8787' } },
});
