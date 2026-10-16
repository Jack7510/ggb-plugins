/**
 * @fileoverview Validates independent package contents and installer behavior.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { root } from '../src/server.js';

const run = promisify(execFile);

test('DSH tarball carries its own skill, references and the identical compiled runtime', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ggb-dsh-package-'));
  try {
    const result = JSON.parse((await run(process.execPath, [join(root, 'scripts/package-plugin.mjs'), directory, '--target=dsh'])).stdout);
    const listing = (await run('tar', ['-tzf', result.archive])).stdout.trim().split('\n');
    assert(listing.every(path => path.startsWith('package/') && !path.includes('..')));
    assert(!listing.some(path => /^package\/(?:node_modules|\.runtime|src\/|tests\/|\.agents\/|plugin.json)/.test(path)));
    assert.equal(createHash('sha256').update(await readFile(result.archive)).digest('hex'), result.sha256);
    await run('tar', ['-xzf', result.archive, '-C', directory]);
    const bundle = join(directory, 'package');
    const pkg = JSON.parse(await readFile(join(bundle, 'package.json'), 'utf8'));
    const shared = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    assert.equal(pkg.name, '@local/ggb-plugins-dsh');
    assert.equal(pkg.version, shared.version);
    assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
    assert.deepEqual(pkg.dependencies, shared.dependencies);
    assert.deepEqual(await readFile(join(bundle, 'dependencies.lock')), await readFile(join(root, 'pnpm-lock.yaml')));
    for (const module of ['cli','doctor','server','browser','schema','compile','verify','delivery']) {
      assert.deepEqual(await readFile(join(bundle, 'dist/src', module + '.js')), await readFile(join(root, 'dist/src', module + '.js')));
    }
    for (const file of ['SKILL.md','references/capabilities.md','references/command-coverage.md']) {
      assert.deepEqual(await readFile(join(bundle, 'skills/ggb-construction', file)), await readFile(join(root, 'skills/ggb-construction', file)));
    }
    const { createProvider } = await import(pathToFileURL(join(bundle, 'index.js')).href);
    const { provider, candidate, pluginRoot } = createProvider();
    const canonical = await realpath(bundle);
    assert.equal(pluginRoot, canonical);
    assert.equal(candidate.resourceBase.path, join(canonical, 'skills/ggb-construction'));
    assert((await provider.get(candidate)).content.includes(canonical));
    assert(!String(await readFile(join(bundle, 'index.js'))).includes('.codex'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

for (const scenario of ['stale dist', 'partial dist', 'compiled release']) {
  test(`installer prepares ${scenario} before doctor`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ggb-install with spaces-'));
    try {
      for (const folder of ['scripts', 'bin', 'dist/src', '.runtime']) await mkdir(join(directory, folder), { recursive: true });
      await copyFile(join(root, 'scripts/setup-plugin.mjs'), join(directory, 'scripts/setup-plugin.mjs'));
      await writeFile(join(directory, 'package.json'), '{"type":"module"}');
      await writeFile(join(directory, '.runtime/runtime.json'), '{}');
      const cli = "import value from './implementation.js'; console.log('doctor:' + value);\n";
      await writeFile(join(directory, 'dist/src/cli.js'), cli);
      const source = scenario !== 'compiled release';
      if (!source) await writeFile(join(directory, 'dependencies.lock'), 'pinned dependencies');
      if (source) {
        await mkdir(join(directory, 'src'));
        await writeFile(join(directory, 'src/cli.ts'), 'updated');
      }
      if (scenario !== 'partial dist') await writeFile(join(directory, 'dist/src/implementation.js'), `export default '${source ? 'stale' : 'release'}';`);
      // Run the real installer with a package-tool stub and a fixture CLI.
      await writeFile(join(directory, 'bin/pnpm'), `#!${process.execPath}
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync('commands.jsonl', JSON.stringify(args) + '\\n');
if (args.includes('build')) {
  const value = readFileSync('src/cli.ts', 'utf8');
  writeFileSync('dist/src/cli.js', ${JSON.stringify(cli)});
  writeFileSync('dist/src/implementation.js', 'export default ' + JSON.stringify(value) + ';');
}
`, { mode: 0o755 });
      const { stdout } = await run(process.execPath, [join(directory, 'scripts/setup-plugin.mjs')], {
        env: { ...process.env, PATH: join(directory, 'bin') + delimiter + process.env.PATH },
      });
      assert.match(stdout, new RegExp(`doctor:${source ? 'updated' : 'release'}`));
      const commands = (await readFile(join(directory, 'commands.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
      assert.deepEqual(commands, [
        ['--ignore-workspace', 'install', ...(source ? [] : ['--prod']), '--frozen-lockfile', '--ignore-scripts'],
        ...(source ? [['--ignore-workspace', 'build']] : []),
        ['--ignore-workspace', 'exec', 'playwright', 'install', 'chromium'],
      ]);
      assert.equal(await readFile(join(directory, 'dist/src/cli.js'), 'utf8'), cli);
      if (!source) assert.equal(await readFile(join(directory, 'dist/src/implementation.js'), 'utf8'), "export default 'release';");
      if (!source) assert.equal(await readFile(join(directory, 'pnpm-lock.yaml'), 'utf8'), 'pinned dependencies');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}

test('plugin ZIP contains a standalone compiled tool and discoverable skill, not local state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ggb-package-'));
  try {
    const { stdout } = await run(process.execPath, [join(root, 'scripts/package-plugin.mjs'), directory]);
    const result = JSON.parse(stdout);
    const bytes = await readFile(result.archive);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), result.sha256);
    assert((await readFile(result.checksumFile, 'utf8')).startsWith(result.sha256 + '  '));
    const listing = (await run('unzip', ['-Z1', result.archive])).stdout.trim().split('\n');
    assert(listing.every(path => path.startsWith('ggb-plugins/') && !path.includes('..')));
    assert(!listing.some(path => /^ggb-plugins\/(?:node_modules|\.runtime|\.git\/|output|src\/|tests\/)/.test(path)));
    const extracted = join(directory, 'unpacked with spaces');
    await run('unzip', ['-q', result.archive, '-d', extracted]);
    const plugin = join(extracted, 'ggb-plugins');
    const manifest = JSON.parse(await readFile(join(plugin, 'plugin.json'), 'utf8'));
    const pkg = JSON.parse(await readFile(join(plugin, 'package.json'), 'utf8'));
    assert.equal(manifest.name, pkg.name); assert.equal(manifest.version, pkg.version);
    assert.equal(manifest.extensions['com.openai'].requires_local_executor, true);
    const market = JSON.parse(await readFile(join(plugin, '.agents/plugins/marketplace.json'), 'utf8'));
    assert.equal(market.plugins[0].source.path, './');
    assert.equal(market.plugins[0].name, manifest.name);
    assert.match(await readFile(join(plugin, 'skills/ggb-construction/agents/openai.yaml'), 'utf8'), /allow_implicit_invocation: true/);
    for (const name of ['cli', 'doctor', 'server', 'browser', 'schema', 'compile', 'verify', 'delivery']) {
      const code = await readFile(join(plugin, 'dist/src/' + name + '.js'), 'utf8');
      assert(!code.includes('/Users/'), 'Compiled tool must not depend on a developer path');
      for (const [, target] of code.matchAll(/from ['"]\.\/([^'"]+)['"]/g)) assert((await stat(join(plugin, 'dist/src', target!))).isFile());
    }
    for (const file of ['viewer/index.html', 'runtime.lock.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'scripts/setup-plugin.mjs', 'scripts/setup-runtime.mjs', 'skills/ggb-construction/references/capabilities.md', 'skills/ggb-construction/references/command-coverage.md']) {
      assert((await stat(join(plugin, file))).size > 0);
    }
    assert.deepEqual(await readFile(join(plugin, 'pnpm-lock.yaml')), await readFile(join(root, 'pnpm-lock.yaml')));
    assert(!pkg.scripts.build && !pkg.scripts.demo, 'Release must not advertise unbundled development inputs');
    assert.match(await readFile(join(plugin, 'README.md'), 'utf8'), /installed-plugin/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test('both packages ship English and Chinese readmes and a Chinese guide',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ggb-readme-package-'));
    try {
      for (const target of ['codex', 'dsh']) {
        const command = [join(root, 'scripts/package-plugin.mjs'),
          directory, '--target=' + target];
        const result = JSON.parse((await run(process.execPath, command)).stdout);
        const extracted = join(directory, target);
        await mkdir(extracted);
        if (target === 'codex') {
          await run('unzip', ['-q', result.archive, '-d', extracted]);
        } else {
          await run('tar', ['-xzf', result.archive, '-C', extracted]);
        }
        const plugin = join(extracted,
          target === 'codex' ? 'ggb-plugins' : 'package');
        const english = await readFile(join(plugin, 'README.md'), 'utf8');
        const chinese = await readFile(join(plugin, 'README.zh-CN.md'), 'utf8');
        assert.match(english, /## Installation/);
        assert.match(chinese, /## 安装/);
        for (const text of [english, chinese]) {
          assert(text.includes('](INSTALL.md)'));
          for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
            const link = match[1];
            assert(link);
            if (!link.includes('://')) {
              assert((await stat(join(plugin, link))).isFile());
            }
          }
        }
        const guide = await readFile(join(plugin, 'INSTALL.md'), 'utf8');
        assert(/[\u4e00-\u9fff]/.test(guide));
      }
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
