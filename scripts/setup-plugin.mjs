import { execFileSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const exists = path => access(join(root, path)).then(() => true, () => false);
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' });
// ZIPs contain compiled code. A Git marketplace install can build the source.
if (await exists('dist/src/cli.js')) {
  run('pnpm', ['install', '--prod', '--frozen-lockfile', '--ignore-scripts']);
} else {
  if (!await exists('src/cli.ts')) throw new Error('Missing compiled CLI and source; reinstall the plugin');
  run('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts']);
  run('pnpm', ['build']);
}
run('pnpm', ['exec', 'playwright', 'install', 'chromium']);
if (!await exists('.runtime/runtime.json')) {
  run(process.execPath, [join(root, 'scripts/setup-runtime.mjs'), ...process.argv.slice(2)]);
}
run(process.execPath, [join(root, 'dist/src/cli.js'), 'doctor']);
