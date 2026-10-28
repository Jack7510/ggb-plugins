/**
 * @fileoverview Packages independent Codex, DSH and WorkBuddy distributions
 * with a shared runtime and bilingual entry documentation.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(root, 'plugin.json'), 'utf8'));
assert.equal(manifest.name, pkg.name); assert.equal(manifest.version, pkg.version);
const args = process.argv.slice(2);
const target = args.find(arg => arg.startsWith('--target='))?.slice(9) ?? 'codex';
assert(['codex', 'dsh', 'workbuddy'].includes(target),
  'Expected --target=codex, --target=dsh or --target=workbuddy');
assert(args.filter(arg => !arg.startsWith('--target=')).length <= 1, 'Expected one output directory');
const output = resolve(args.find(arg => !arg.startsWith('--target=')) ?? join(root, 'output/plugin'));
await mkdir(output, { recursive: true });
const staging = await mkdtemp(join(output, 'ggb-plugin-'));
const plugin = join(staging, pkg.name);
try {
  const modules = (await readdir(join(root, 'src'))).filter(name => name.endsWith('.ts')).map(name => 'dist/src/' + name.replace(/\.ts$/, '.js'));
  const files = [...modules, 'pnpm-lock.yaml', 'runtime.lock.json', 'capabilities.json',
    'README.md', 'README.zh-CN.md',
    'LICENSE', 'THIRD_PARTY_NOTICES.md', 'viewer/index.html', 'scripts/setup-plugin.mjs', 'scripts/setup-runtime.mjs',
    'skills/ggb-construction/SKILL.md', 'skills/ggb-construction/worker.md',
    'skills/ggb-construction/references/capabilities.md', 'skills/ggb-construction/references/command-coverage.md',
    'skills/ggb-construction/references/patterns.md',
    'skills/ggb-construction/references/worker-request.md',
    ...(target === 'codex' ? [
      'plugin.json', '.agents/plugins/marketplace.json',
    ] : []),
    ...(target === 'dsh' ? [] : ['skills/setup/SKILL.md'])];
  for (const file of files) {
    const target = join(plugin, file); await mkdir(dirname(target), { recursive: true });
    await cp(join(root, file), target, { dereference: true });
  }
  // Codex discovers implicit invocation through plugin-root skill metadata that
  // lives with the Codex client assets, outside the shared skill directory.
  if (target === 'codex') {
    const asset = 'skills/ggb-construction/agents/openai.yaml';
    await mkdir(dirname(join(plugin, asset)), { recursive: true });
    await cp(join(root, 'codex/agents/openai.yaml'), join(plugin, asset));
  }
  const scripts = Object.fromEntries(['ggb', 'preview', 'setup:plugin', 'setup:runtime'].map(key => [key, pkg.scripts[key]]));
  // Keep dependency metadata aligned with the frozen lockfile; --prod omits dev tools.
  let metadata = { ...pkg, scripts };
  if (target === 'dsh') {
    const dsh = JSON.parse(await readFile(join(root, 'dsh/package.json'), 'utf8'));
    assert.equal(dsh.version, pkg.version, 'DSH and runtime versions must match');
    metadata = { ...metadata, ...dsh, scripts };
    await cp(join(root, 'pnpm-lock.yaml'), join(plugin, 'dependencies.lock'));
    for (const file of ['index.js', 'cordis.patch.yml', 'locale']) await cp(join(root, 'dsh', file), join(plugin, file), { recursive: true });
    for (const file of ['server.js', 'server.patch.yml', 'installation.js', 'executor.js', 'request-schema.js']) {
      await mkdir(join(plugin, 'dsh'), { recursive: true });
      await cp(join(root, 'dsh', file), join(plugin, 'dsh', file));
    }
    for (const file of ['host-protocol', 'execution-contract', 'draft-requests', 'draft-arguments']) {
      await cp(join(root, `dist/src/${file}.d.ts`),
        join(plugin, `dist/src/${file}.d.ts`));
    }
  }
  if (target === 'dsh') {
    // Preserve exact build inputs for dirty development distributions.
    const inputs = ['src', 'dsh', 'scripts', 'tsconfig.json',
      'tsconfig.host-protocol.json', 'package.json', 'pnpm-lock.yaml',
      'runtime.lock.json', 'capabilities.json',
      'skills/ggb-construction'];
    for (const input of inputs) {
      const target = input === 'pnpm-lock.yaml' ? 'dependencies.lock' : input;
      await cp(join(root, input), join(plugin, 'source', target),
        {recursive: true});
    }
  }
  if (target === 'workbuddy') {
    // The manifest template omits version; this build owns the single source.
    const template = JSON.parse(await readFile(
      join(root, 'workbuddy/plugin.json'), 'utf8'));
    const workbuddy = { ...template, name: pkg.name, version: pkg.version };
    await mkdir(join(plugin, '.codebuddy-plugin'), { recursive: true });
    await writeFile(join(plugin, '.codebuddy-plugin/plugin.json'),
      JSON.stringify(workbuddy, null, 2) + '\n');
  }
  await writeFile(join(plugin, 'package.json'), JSON.stringify(metadata, null, 2) + '\n');
  const guides = {
    codex: 'codex/README.md',
    dsh: 'dsh/README.md',
    workbuddy: 'workbuddy/README.md',
  };
  const guide = guides[target];
  await cp(join(root, guide), join(plugin, 'INSTALL.md'));
  for (const file of ['README.md', 'README.zh-CN.md']) {
    let text = await readFile(join(plugin, file), 'utf8');
    for (const path of Object.values(guides)) {
      const link = path === guide ? 'INSTALL.md' :
        'https://github.com/Jack7510/ggb-plugins/blob/main/' + path;
      text = text.replaceAll('](' + path + ')', '](' + link + ')');
      text = text.replaceAll('](' + path + '#', '](' + link + '#');
    }
    await writeFile(join(plugin, file), text);
  }
  const suffix = target === 'dsh' ? '-dsh' :
    target === 'workbuddy' ? '-workbuddy' : '';
  const extension = target === 'dsh' ? 'tgz' : 'zip';
  const archive = join(staging,
    `${pkg.name}${suffix}-${pkg.version}.${extension}`);
  if (target !== 'dsh') execFileSync('zip', ['-qr', archive, pkg.name], { cwd: staging });
  else {
    const result = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', staging], { cwd: plugin, encoding: 'utf8' }));
    await rename(join(staging, result[0].filename), archive);
  }
  const sha256 = createHash('sha256').update(await readFile(archive)).digest('hex');
  await writeFile(archive + '.sha256', `${sha256}  ${archive.split('/').at(-1)}\n`);
  console.log(JSON.stringify({ target, pluginDirectory: plugin, archive, sha256, checksumFile: archive + '.sha256' }));
} catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
