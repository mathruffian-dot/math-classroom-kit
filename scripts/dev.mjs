import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 先驗證 content/lessons 並產生專案教材目錄，再建置前端。
const lessons = spawnSync(process.execPath, [path.join(root, 'scripts/build-lessons.mjs')], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
if (lessons.status !== 0) process.exit(lessons.status || 1);
const build = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
build.on('exit', (code) => {
  if (code !== 0) {
    process.exitCode = code || 1;
    return;
  }
  const worker = spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
      'dev',
      '--ip',
      '127.0.0.1',
      '--port',
      '8787',
    ],
    { cwd: root, stdio: 'inherit', windowsHide: true },
  );
  worker.on('exit', (code) => {
    process.exitCode = code || 0;
  });
  const stop = () => worker.kill('SIGTERM');
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
});
