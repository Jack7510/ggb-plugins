import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(root, 'plugin.json'), 'utf8'));
assert.equal(manifest.name, pkg.name); assert.equal(manifest.version, pkg.version);
const output = resolve(process.argv[2] ?? join(root, 'output/plugin'));
await mkdir(output, { recursive: true });
const staging = await mkdtemp(join(output, 'ggb-plugin-'));
const plugin = join(staging, pkg.name);
try {
  const modules = (await readdir(join(root, 'src'))).filter(name => name.endsWith('.ts')).map(name => 'dist/src/' + name.replace(/\.ts$/, '.js'));
  const files = [...modules, 'plugin.json', '.agents/plugins/marketplace.json', 'pnpm-lock.yaml', 'runtime.lock.json',
    'LICENSE', 'THIRD_PARTY_NOTICES.md', 'viewer/index.html', 'scripts/setup-plugin.mjs', 'scripts/setup-runtime.mjs',
    'skills/ggb-construction/SKILL.md', 'skills/ggb-construction/references/capabilities.md', 'skills/ggb-construction/agents/openai.yaml'];
  for (const file of files) {
    const target = join(plugin, file); await mkdir(dirname(target), { recursive: true });
    await cp(join(root, file), target, { dereference: true });
  }
  const scripts = Object.fromEntries(['ggb', 'preview', 'setup:plugin', 'setup:runtime'].map(key => [key, pkg.scripts[key]]));
  // Keep dependency metadata aligned with the frozen lockfile; --prod omits dev tools.
  await writeFile(join(plugin, 'package.json'), JSON.stringify({ ...pkg, scripts }, null, 2) + '\n');
  await cp(join(root, 'docs/installation.md'), join(plugin, 'README.md'));
  const archive = join(staging, `${pkg.name}-${pkg.version}.zip`);
  execFileSync('zip', ['-qr', archive, pkg.name], { cwd: staging });
  const sha256 = createHash('sha256').update(await readFile(archive)).digest('hex');
  await writeFile(archive + '.sha256', `${sha256}  ${pkg.name}-${pkg.version}.zip\n`);
  console.log(JSON.stringify({ pluginDirectory: plugin, archive, sha256, checksumFile: archive + '.sha256' }));
} catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
