import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { root } from '../src/server.js';

const run = promisify(execFile);
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
