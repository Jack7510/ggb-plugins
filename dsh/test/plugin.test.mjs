import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { apply, createProvider, inject, name, parseSkill, renderInjection, resolveRoots } from '../index.js';

const pluginRoot = fileURLToPath(new URL('../../', import.meta.url));
const dshRoot = fileURLToPath(new URL('../', import.meta.url));
const canonicalSkill = join(pluginRoot, 'skills/ggb-construction/SKILL.md');
const canonicalReference = join(pluginRoot, 'skills/ggb-construction/references/capabilities.md');
delete process.env.DSH_GGB_PLUGIN_ROOT;

const scratchDirectories = [];
const scratch = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ggb-dsh-'));
  scratchDirectories.push(directory);
  return directory;
};
after(async () => {
  for (const directory of scratchDirectories) await rm(directory, { recursive: true, force: true });
});

/** Build a directory shaped like a ggb-plugins copy, with or without its compiled CLI. */
const fakePlugin = async ({ runtime }) => {
  const root = await scratch();
  await mkdir(join(root, 'skills/ggb-construction/references'), { recursive: true });
  await cp(canonicalSkill, join(root, 'skills/ggb-construction/SKILL.md'));
  await cp(canonicalReference, join(root, 'skills/ggb-construction/references/capabilities.md'));
  await writeFile(join(root, 'plugin.json'), JSON.stringify({ name: 'ggb-plugins', version: '0.0.0-test' }));
  if (runtime) {
    await mkdir(join(root, 'dist/src'), { recursive: true });
    await writeFile(join(root, 'dist/src/cli.js'), '// test runtime\n');
  }
  return root;
};

/** A registry stand-in that records what a Cordis context would receive. */
const stubContext = () => {
  const providers = [];
  const warnings = [];
  return {
    providers,
    warnings,
    logger: { warn: message => warnings.push(message) },
    skills: { registerProvider: create => providers.push(create({ invalidate() {}, signal: undefined })) },
  };
};

test('exports the Cordis plugin identity', () => {
  assert.equal(name, 'ggb-plugins-dsh');
  assert.deepEqual(inject, ['skills']);
});

test('parses the shared Codex skill instead of duplicating it', async () => {
  const raw = await readFile(canonicalSkill, 'utf8');
  const parsed = parseSkill(raw, canonicalSkill);
  assert.match(parsed.description, /GeoGebra/);
  assert.ok(parsed.content.startsWith('# GeoGebra 二维数学与代数'));
  assert.ok(!parsed.content.includes('name: ggb-construction'));
  assert.throws(() => parseSkill('# no frontmatter\n', 'fixture'), /has no YAML frontmatter/);
  assert.throws(() => parseSkill('---\nname: other\ndescription: d\n---\n', 'fixture'), /declares skill "other"/);
  assert.throws(() => parseSkill('---\nname: ggb-construction\n---\n', 'fixture'), /has no description/);
});

test('the DSH bundle carries no second copy of the skill', () => {
  assert.ok(!existsSync(join(dshRoot, 'SKILL.md')));
  assert.ok(!existsSync(join(dshRoot, 'skills')), 'the skill must stay in the Codex bundle both clients read');
});

test('resolveRoots honours configuration and rejects unusable roots', async () => {
  const built = await fakePlugin({ runtime: true });
  const unbuilt = await fakePlugin({ runtime: false });
  const empty = await scratch();
  const isolated = { from: empty, home: empty };

  assert.deepEqual(resolveRoots({ skillRoot: built, pluginRoot: built }, isolated), { skillSource: built, pluginRoot: built });
  assert.throws(() => resolveRoots({ skillRoot: 'relative/path' }, isolated), /must be an absolute path/);
  assert.throws(() => resolveRoots({ pluginRoot: 'relative/path', skillRoot: built }, isolated), /must be an absolute path/);
  assert.throws(() => resolveRoots({}, isolated), /found no ggb-plugins directory/);

  // A checkout that is not built yet still serves the skill, without a runtime.
  assert.equal(resolveRoots({ skillRoot: unbuilt }, isolated).pluginRoot, undefined);
  assert.throws(() => resolveRoots({ skillRoot: unbuilt, pluginRoot: unbuilt }, isolated), /has no dist\/src\/cli\.js/);
});

test('the provider serves the shared body plus resolved absolute paths', async () => {
  const root = await fakePlugin({ runtime: true });
  const empty = await scratch();
  const { provider, candidate } = createProvider({ skillRoot: root, pluginRoot: root }, { from: empty, home: empty });

  assert.equal(provider.name, 'ggb-plugins-dsh');
  assert.deepEqual(await provider.list(), [candidate]);
  assert.equal(candidate.name, 'ggb-construction');
  assert.equal(candidate.rank, 300);
  assert.equal(candidate.provider, 'ggb-plugins-dsh');
  assert.deepEqual(candidate.invocation, { modelInvocable: true, userInvocable: true });
  assert.deepEqual(candidate.resourceBase, { kind: 'directory', path: join(root, 'skills/ggb-construction') });
  assert.ok(existsSync(join(candidate.resourceBase.path, 'references/capabilities.md')), 'referenced contract must resolve');

  const definition = await provider.get(candidate, {});
  assert.ok(!('rank' in definition) && !('locator' in definition), 'a definition carries no discovery locator');
  assert.equal(definition.description, candidate.description);
  assert.ok(definition.content.includes('# GeoGebra 二维数学与代数'));
  assert.ok(definition.content.includes(join(root, 'dist/src/cli.js')));
  assert.ok(definition.content.includes('"node": "node"'));
});

test('an unbuilt checkout still loads and states how to fix it', async () => {
  const root = await fakePlugin({ runtime: false });
  const empty = await scratch();
  const { provider } = createProvider({ skillRoot: root }, { from: empty, home: empty });
  const definition = await provider.get((await provider.list())[0], {});
  assert.match(definition.content, /没有找到已构建的 GeoGebra CLI/);
  assert.ok(!definition.content.includes('```json'), 'a missing runtime must not advertise paths');
});

test('applying registers exactly one provider on the registry', async () => {
  const root = await fakePlugin({ runtime: true });
  const ctx = stubContext();
  apply(ctx, { skillRoot: root, pluginRoot: root });
  assert.equal(ctx.providers.length, 1);
  assert.equal(ctx.providers[0].name, 'ggb-plugins-dsh');
  assert.deepEqual(ctx.warnings, []);
  assert.throws(() => apply(stubContext(), { skillRoot: root, pluginRoot: root, rank: Number.NaN }), /rank must be a finite number/);
});

test('renderInjection reports paths only for a resolved runtime', () => {
  assert.match(renderInjection(undefined), /没有找到已构建的 GeoGebra CLI/);
  assert.ok(!renderInjection(undefined).includes('```json'));
  const rendered = renderInjection('/tmp/ggb-plugin-root');
  assert.ok(rendered.includes(join('/tmp/ggb-plugin-root', 'dist/src/cli.js')));
  assert.ok(rendered.includes('"node": "node"'));
});

test('isolated bundle resolves its own payload without Codex or a checkout', async () => {
  const root = await fakePlugin({ runtime: true });
  await rm(join(root, 'plugin.json'));
  assert.deepEqual(resolveRoots({}, { from: root }), { skillSource: root, pluginRoot: root });
  const other = await fakePlugin({ runtime: true });
  assert.throws(() => resolveRoots({ skillRoot: root, pluginRoot: other }), /same bundle/);
  process.env.DSH_GGB_PLUGIN_ROOT = 'relative';
  try { assert.throws(() => resolveRoots({}, { from: root }), /absolute path/); }
  finally { delete process.env.DSH_GGB_PLUGIN_ROOT; }
});

test('the Codex plugin remains the shipped client contract', async () => {
  const manifest = JSON.parse(await readFile(join(pluginRoot, 'plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'ggb-plugins');
  const marketplace = JSON.parse(await readFile(join(pluginRoot, '.agents/plugins/marketplace.json'), 'utf8'));
  assert.ok(marketplace.plugins.some(plugin => plugin.name === 'ggb-plugins'));
  const dshManifest = JSON.parse(await readFile(join(dshRoot, 'package.json'), 'utf8'));
  assert.equal(dshManifest.name, 'ggb-plugins-dsh');
  assert.equal(dshManifest.dsh.bundle.patch, './cordis.patch.yml');
});
