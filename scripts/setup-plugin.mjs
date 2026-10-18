import { execFileSync } from 'node:child_process';
import { access, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const exists = path => access(join(root, path)).then(() => true, () => false);
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' });
const pnpm = args => run('pnpm', ['--ignore-workspace', ...args]);
// npm excludes pnpm-lock.yaml from TGZs; restore the same pinned contents.
if (await exists('dependencies.lock')) await copyFile(join(root, 'dependencies.lock'), join(root, 'pnpm-lock.yaml'));
// Source installs always rebuild; only sourceless ZIPs use compiled code.
if (await exists('src/cli.ts')) {
  pnpm(['install', '--frozen-lockfile', '--ignore-scripts']);
  pnpm(['build']);
} else {
  if (!await exists('dist/src/cli.js')) throw new Error('Missing compiled CLI and source; reinstall the plugin');
  pnpm(['install', '--prod', '--frozen-lockfile', '--ignore-scripts']);
}
// The runtime drives an installed Chromium browser; nothing is downloaded here.
const resolver = new URL('../dist/src/browser-target.js', import.meta.url);
const { browserTarget } = await import(resolver);
try {
  const target = browserTarget();
  const where = target.executablePath ?? `channel ${target.channel}`;
  console.log(`已找到可用的浏览器：${target.label}（${where}）`);
} catch (error) {
  console.error('未找到 Chromium 内核浏览器：请先安装 Google Chrome 或 Microsoft Edge，');
  console.error('或用环境变量 DSH_GGB_BROWSER 指定 chrome / msedge / 浏览器可执行文件的绝对路径。');
  throw error;
}
if (!await exists('.runtime/runtime.json')) {
  run(process.execPath, [join(root, 'scripts/setup-runtime.mjs'), ...process.argv.slice(2)]);
}
run(process.execPath, [join(root, 'dist/src/cli.js'), 'doctor']);
