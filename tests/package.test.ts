import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { root } from '../src/server.js';

const run = promisify(execFile);

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
if (args[0] === 'build') {
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
        ['install', ...(source ? [] : ['--prod']), '--frozen-lockfile', '--ignore-scripts'],
        ...(source ? [['build']] : []),
        ['exec', 'playwright', 'install', 'chromium'],
      ]);
      assert.equal(await readFile(join(directory, 'dist/src/cli.js'), 'utf8'), cli);
      if (!source) assert.equal(await readFile(join(directory, 'dist/src/implementation.js'), 'utf8'), "export default 'release';");
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
    for (const file of ['viewer/index.html', 'runtime.lock.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'scripts/setup-plugin.mjs', 'scripts/setup-runtime.mjs', 'skills/ggb-construction/references/capabilities.md']) {
      assert((await stat(join(plugin, file))).size > 0);
    }
    assert.deepEqual(await readFile(join(plugin, 'pnpm-lock.yaml')), await readFile(join(root, 'pnpm-lock.yaml')));
    assert(!pkg.scripts.build && !pkg.scripts.demo, 'Release must not advertise unbundled development inputs');
    assert.match(await readFile(join(plugin, 'README.md'), 'utf8'), /installed-plugin/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
