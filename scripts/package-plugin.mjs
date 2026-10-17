/**
 * @fileoverview Packages independent Codex and DSH distributions with a shared
 * runtime and bilingual entry documentation.
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
assert(['codex', 'dsh'].includes(target), 'Expected --target=codex or --target=dsh');
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
    ...(target === 'codex' ? ['plugin.json', '.agents/plugins/marketplace.json', 'skills/ggb-construction/agents/openai.yaml'] : [])];
  for (const file of files) {
    const target = join(plugin, file); await mkdir(dirname(target), { recursive: true });
    await cp(join(root, file), target, { dereference: true });
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
  }
  await writeFile(join(plugin, 'package.json'), JSON.stringify(metadata, null, 2) + '\n');
  const guide = target === 'codex' ? 'docs/installation.md' : 'dsh/README.md';
  await cp(join(root, guide), join(plugin, 'INSTALL.md'));
  for (const file of ['README.md', 'README.zh-CN.md']) {
    let text = await readFile(join(plugin, file), 'utf8');
    for (const path of ['docs/installation.md', 'dsh/README.md']) {
      const link = path === guide ? 'INSTALL.md' :
        'https://github.com/Jack7510/ggb-plugins/blob/main/' + path;
      text = text.replaceAll('](' + path + ')', '](' + link + ')');
    }
    await writeFile(join(plugin, file), text);
  }
  const archive = join(staging, `${pkg.name}${target === 'dsh' ? '-dsh' : ''}-${pkg.version}.${target === 'dsh' ? 'tgz' : 'zip'}`);
  if (target === 'codex') execFileSync('zip', ['-qr', archive, pkg.name], { cwd: staging });
  else {
    const result = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', staging], { cwd: plugin, encoding: 'utf8' }));
    await rename(join(staging, result[0].filename), archive);
  }
  const sha256 = createHash('sha256').update(await readFile(archive)).digest('hex');
  await writeFile(archive + '.sha256', `${sha256}  ${archive.split('/').at(-1)}\n`);
  console.log(JSON.stringify({ target, pluginDirectory: plugin, archive, sha256, checksumFile: archive + '.sha256' }));
} catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
