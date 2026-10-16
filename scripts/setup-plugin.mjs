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
pnpm(['exec', 'playwright', 'install', 'chromium']);
if (!await exists('.runtime/runtime.json')) {
  run(process.execPath, [join(root, 'scripts/setup-runtime.mjs'), ...process.argv.slice(2)]);
}
run(process.execPath, [join(root, 'dist/src/cli.js'), 'doctor']);
