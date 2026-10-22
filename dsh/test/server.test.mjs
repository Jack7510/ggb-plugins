/** @fileoverview Tests the public server API from an extracted release package. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {after, before, test} from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
let directory;
let bundle;
let server;
let installation;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ggb-server-package-'));
  const result = JSON.parse(execFileSync(process.execPath,
      [join(root, 'scripts/package-plugin.mjs'), directory, '--target=dsh'],
      {encoding: 'utf8'}));
  execFileSync('tar', ['-xzf', result.archive, '-C', directory]);
  bundle = join(directory, 'package');
  server = await import(pathToFileURL(join(bundle, 'dsh/server.js')));
  installation = await import(pathToFileURL(
      join(bundle, 'dsh/installation.js')));
});
after(async () => {
  if (directory) await rm(directory, {recursive: true, force: true});
});

test('public exports are shipped and installation resolves only this package',
    async () => {
      const pkg = JSON.parse(await readFile(join(bundle, 'package.json')));
      for (const key of ['./server', './server.patch.yml', './installation',
        './schemas', './cli']) assert.ok(pkg.exports[key]);
      const found = installation.loadInstallation();
      assert.equal(found.root, await realpath(bundle));
      assert.equal(found.hostProtocolVersion, 2);
      assert.deepEqual(found.supportedDshVersions, ['0.2.1-rc.2']);
      assert.match(installation.loadWorkerSkill(), /# GGB Plugin Core/);
      assert.ok(installation.loadWorkerSkill().includes('```json'));
    });

test('server registers three closed tools and an eagerly loaded Worker Skill',
    () => {
      const tools = [];
      const sections = [];
      const ctx = {tools: {register: value => tools.push(value)},
        systemPrompt: {section: value => sections.push(value)}};
      server.apply(ctx, {sdkVersion: '0.2.1-rc.2'});
      assert.deepEqual(tools.map(tool => tool.name),
          ['ggb_inspect', 'ggb_check', 'ggb_build']);
      assert.ok(tools.every(tool =>
        tool.parameters.additionalProperties === false));
      assert.match(sections[0].text, /No shell, files, network or credentials/);
      assert.equal(sections[0].interpolate, false);
      assert.throws(() => server.apply(ctx, {sdkVersion: '0.2.0-rc.2'}),
          /dsh_version_unsupported/);
      assert.equal(tools.length, 3);
    });

test('server tools refuse execution without host capability', async () => {
  const previous = process.env.GGB_PLUGIN_CORE_TOOL_RUN_ID;
  delete process.env.GGB_PLUGIN_CORE_TOOL_RUN_ID;
  try {
    const tool = server.createTool('ggb_build');
    await assert.rejects(async () => tool.execute({request: {}},
        {signal: new AbortController().signal}), /ggb_host_context_missing/);
  } finally {
    if (previous !== undefined) process.env.GGB_PLUGIN_CORE_TOOL_RUN_ID = previous;
  }
});


test('mixed package identity and changed Skill fail before tool registration',
    async () => {
      const path = join(bundle, 'capabilities.json');
      const original = await readFile(path, 'utf8');
      try {
        const value = JSON.parse(original);
        await writeFile(path, JSON.stringify({...value, toolVersion: 'other'}));
        assert.throws(() => installation.loadInstallation(), /identity_invalid/);
        await writeFile(path, JSON.stringify({...value,
          workerSkillSha256: '0'.repeat(64)}));
        assert.throws(() => installation.loadWorkerSkill(), /identity_invalid/);
      } finally { await writeFile(path, original); }
    });

test('model sees native step/check/style shapes and a parser-valid example',
    async () => {
      const tool = server.createTool('ggb_build');
      const request = tool.parameters.properties.request;
      const plan = request.properties.plan.properties;
      assert.equal(request.additionalProperties, false);
      assert.equal(plan.program.type, 'array');
      const native = plan.program.items.anyOf[0];
      assert.deepEqual(native.properties.op, {type: 'string', enum: ['native']});
      assert.deepEqual(request.properties.protocolVersion,
        {type: 'integer', enum: [2]});
      assert.deepEqual(native.required, ['id', 'op', 'source', 'mode']);
      assert.equal(native.additionalProperties, false);
      assert.equal(native.properties.step, undefined);
      assert.ok(plan.requirements.items.properties.checks.items.properties.subjects);
      assert.ok(plan.styles.items.properties.properties.properties.lineThickness);
      const body = installation.loadWorkerSkill();
      const args = JSON.parse(/```json\n([\s\S]*?)\n```/u.exec(body)[1]);
      assert.deepEqual(Object.keys(args), ['request']);
      const example = args.request;
      const {parseRequest} = await import(pathToFileURL(
          join(bundle, 'dist/src/schema.js')));
      assert.doesNotThrow(() => parseRequest({...example, outputDir: directory}));
    });


test('restricted reference topics read only complete bundled sections', () => {
  const inspect = server.createTool('ggb_inspect');
  const topics = inspect.parameters.properties.reference.enum;
  assert.equal(topics.length, 6);
  for (const topic of topics) {
    const result = installation.loadReference(topic);
    assert.equal(result.topic, topic);
    assert.ok(result.content.length > 0);
    assert.ok(Buffer.byteLength(result.content) <= 24 * 1024);
  }
  const interactions = installation.loadReference('interactions').content;
  assert.match(interactions, /像素/);
  assert.match(interactions, /至少 20/);
  assert.match(installation.loadReference('patterns').content, /Polygon\(Sequence/);
  for (const topic of ['../run.json', '/etc/passwd', 'https://example.com', '']) {
    assert.throws(() => installation.loadReference(topic), /topic_invalid/);
  }
});

test('interaction model schema explains units, limits and ordering', () => {
  const plan = server.createTool('ggb_check').parameters.properties.request
      .properties.plan.properties;
  const drag = plan.interactions.items.anyOf[0].properties;
  assert.equal(drag.dx.minimum, -120);
  assert.equal(drag.dy.maximum, 120);
  assert.match(drag.dx.description, /screen pixels/);
  assert.match(plan.interactions.description, />= 20/);
  assert.match(plan.interactions.description, /no repeated point/);
  assert.match(plan.program.description, /dependency before/);
});


test('drag rejection reports pixel units and a usable threshold', async () => {
  const {parseRequest} = await import(pathToFileURL(
      join(bundle, 'dist/src/schema.js')));
  const example = JSON.parse(/```json\n([\s\S]*?)\n```/u.exec(
      installation.loadWorkerSkill())[1]).request;
  example.plan.program[0] = {id: 'O', op: 'freePoint', x: 0, y: 0};
  example.plan.interactions = [{point: 'O', dx: 3, dy: 2}];
  assert.throws(() => parseRequest({...example, outputDir: directory}),
      /screen pixels.*>= 20/);
});
