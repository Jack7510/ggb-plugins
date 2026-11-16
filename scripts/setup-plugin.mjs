/** @fileoverview Prepare an installed copy: prerequisites, dependencies, runtime, doctor. */
import { execFileSync, spawnSync } from 'node:child_process';
import { access, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const exists = path => access(join(root, path)).then(() => true, () => false);
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' });
const pnpm = args => run('pnpm', ['--ignore-workspace', ...args]);
const packageRequire = createRequire(join(root, 'package.json'));
const hasPlaywright = () => {
  try { packageRequire.resolve('playwright/package.json'); return true; }
  catch { return false; }
};

/** Fail with one actionable line when a prerequisite is absent. */
function requireCommand(command, hint) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which',
      [command], { stdio: 'ignore' });
  } catch {
    throw new Error(`Missing \`${command}\`: ${hint}`);
  }
}

/** Reject a Node runtime older than the documented floor. */
function requireNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (!Number.isInteger(major) || major < 22) {
    throw new Error(`Node.js 22+ is required; found ${process.versions.node}`);
  }
}

/** Prepare dependencies and compiled output for this install shape. */
async function prepareDependencies() {
  requireCommand('pnpm', 'install pnpm 11 and put it on PATH');
  // npm excludes pnpm-lock.yaml from TGZs; restore the same pinned contents.
  if (await exists('dependencies.lock')) {
    await copyFile(join(root, 'dependencies.lock'), join(root, 'pnpm-lock.yaml'));
  }
  // Source installs always rebuild; only sourceless ZIPs use compiled code.
  if (await exists('src/cli.ts')) {
    pnpm(['install', '--frozen-lockfile', '--ignore-scripts']);
    pnpm(['build']);
    return;
  }
  if (!await exists('dist/src/cli.js')) {
    throw new Error('Missing compiled CLI and source; reinstall the plugin');
  }
  // dsh plugin add already installed dependencies in the profile. Running pnpm
  // here would join the profile workspace and fail on its lockfile.
  if (!hasPlaywright()) {
    pnpm(['install', '--prod', '--frozen-lockfile', '--ignore-scripts']);
  }
}

/** Report the browser the runtime will drive, without downloading one. */
async function requireBrowser() {
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
}

/** Install the pinned runtime when absent, then summarize doctor's JSON. */
async function finishRuntime() {
  if (!await exists('.runtime/runtime.json')) {
    requireCommand('curl', 'install curl and put it on PATH');
    requireCommand('unzip', 'install unzip and put it on PATH');
    run(process.execPath, [join(root, 'scripts/setup-runtime.mjs'), ...process.argv.slice(2)]);
  }
  const doctor = spawnSync(process.execPath,
    [join(root, 'dist/src/cli.js'), 'doctor'],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (doctor.stdout) process.stdout.write(doctor.stdout);
  if (doctor.stderr) process.stderr.write(doctor.stderr);
  if (doctor.status !== 0) {
    throw new Error(`doctor failed with exit code ${doctor.status ?? 'unknown'}`);
  }
  try {
    const result = JSON.parse(doctor.stdout.trim().split('\n').at(-1));
    if (result?.ok === true) {
      console.log(`doctor: ok (version=${result.data?.toolVersion ?? 'unknown'}, `
        + `smoke=${result.data?.smoke ?? 'unknown'}, `
        + `casSmoke=${result.data?.casSmoke ?? 'unknown'})`);
    }
  } catch {
    // Fixture CLIs print non-JSON; preserve their output without inventing a summary.
  }
}

requireNode();
await prepareDependencies();
await requireBrowser();
await finishRuntime();
