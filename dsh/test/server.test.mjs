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
let schemas;

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
  schemas = await import(pathToFileURL(
    join(bundle, 'dist/src/host-protocol.js')));
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
      assert.equal(found.hostProtocolVersion, 3);
      assert.deepEqual(found.supportedDshVersions, ['0.2.1-rc.2']);
      assert.match(installation.loadWorkerSkill(), /# GGB Plugin Core/);
      assert.ok(installation.loadWorkerSkill().includes('```json'));
    });

test('shared math sections tolerate CRLF and spaced headings', async () => {
  const path = join(bundle,
    'skills/ggb-construction/references/capabilities.md');
  const original = await readFile(path, 'utf8');
  try {
    await writeFile(path, original.replace(/\r?\n/gu, '\r\n')
      .replace('## 原生构图程序\r\n', '##   原生构图程序  \r\n'));
    const section = installation.loadReference('program').content;
    assert.match(section, /^##   原生构图程序  /mu);
    assert.match(section, /native/u);
  } finally {
    await writeFile(path, original);
  }
});

test('server registers four closed tools and an eagerly loaded Worker Skill',
    () => {
      const tools = [];
      const sections = [];
      const ctx = {tools: {register: value => tools.push(value)},
        systemPrompt: {section: value => sections.push(value)}};
      server.apply(ctx, {sdkVersion: '0.2.1-rc.2'});
      assert.deepEqual(tools.map(tool => tool.name),
          ['ggb_inspect', 'ggb_request', 'ggb_check', 'ggb_build']);
      assert.ok(tools.every(tool =>
        tool.parameters.additionalProperties === false));
      assert.match(sections[0].text, /No shell, files, network or credentials/);
      assert.equal(sections[0].interpolate, false);
      assert.throws(() => server.apply(ctx, {sdkVersion: '0.2.0-rc.2'}),
          /dsh_version_unsupported/);
      assert.equal(tools.length, 4);
    });

test('server tools refuse execution without host capability', async () => {
  const previous = process.env.GGB_PLUGIN_CORE_TOOL_RUN_ID;
  delete process.env.GGB_PLUGIN_CORE_TOOL_RUN_ID;
  try {
    const tool = server.createTool('ggb_build');
    await assert.rejects(async () => tool.execute({checkedRequestId: '11111111-1111-4111-8111-111111111111'},
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

test('model submits one complete requestText and reference-only check/build', async () => {
  const draft = server.createTool('ggb_request').parameters;
  assert.equal(draft.additionalProperties, false);
  assert.deepEqual(draft.required, ['requestText']);
  assert.equal(draft.properties.items, undefined);
  assert.equal(draft.properties.requestText.maxLength, 128 * 1024);
  assert.match(draft.properties.requestText.description, /host owns/i);
  assert.deepEqual(server.createTool('ggb_check').parameters.required,
    ['revision']);
  assert.deepEqual(server.createTool('ggb_build').parameters.required,
    ['checkedRequestId']);
  assert.equal(server.createTool('ggb_build').parameters.properties.request,
    undefined);
  const body = installation.loadWorkerSkill();
  const args = JSON.parse(/```json\n([\s\S]*?)\n```/u.exec(body)[1]);
  assert.equal(args.locale, 'en');
  assert.equal(typeof args.requestText, 'string');
  assert.ok(JSON.parse(args.requestText).plan);
  const {RequestDraft} = await import(pathToFileURL(
      join(bundle, 'dist/src/draft-requests.js')));
  const {parseRequest} = await import(pathToFileURL(
      join(bundle, 'dist/src/schema.js')));
  const draftState = new RequestDraft('Create point P');
  const saved = draftState.operate(args);
  assert.doesNotThrow(() => parseRequest({
    ...draftState.forCheck({revision: saved.revision}).request,
    outputDir: '/tmp/synthetic-worker-example',
  }));
  assert.match(draft.properties.requestText.description, /escaping/);
});


test('restricted reference topics read only complete bundled sections', () => {
  const inspect = server.createTool('ggb_inspect');
  const topics = schemas.REFERENCE_TOPICS;
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

test('request schema points to the complete host-owned document', () => {
  const schema = server.createTool('ggb_request').parameters;
  assert.equal(schema.properties.items, undefined);
  assert.match(schema.properties.requestText.description, /program|plan/i);
  assert.match(installation.loadWorkerSkill(), /interactions/i);
});

test('drag rejection reports pixel units and a usable threshold', async () => {
  const {parseRequest} = await import(pathToFileURL(
    join(bundle, 'dist/src/schema.js')));
  const example = {protocolVersion: 2, prompt: 'point', locale: 'en',
    plan: {program: [{id: 'O', op: 'freePoint', x: 0, y: 0}],
      requirements: [{id: 'point', source: 'point', checks: [
        {kind: 'exists', subjects: ['O'], scope: 'initial'}]}],
      interactions: [{point: 'O', dx: 3, dy: 2}]}};
  assert.throws(() => parseRequest({...example, outputDir: directory}),
    /screen pixels.*>= 20/);
});

test('batch reference reads preserve complete ordered topics and deduplicate',
  () => {
    const result = installation.loadReferences(
      ['request', 'verification', 'request']);
    assert.deepEqual(result.references, ['request', 'verification']
      .map(topic => installation.loadReference(topic)));
    const topics = server.createTool('ggb_inspect').parameters
      .properties.references;
    assert.equal(topics.maxItems, 6);
    assert.equal(topics.minItems, 1);
    assert.deepEqual(topics.items.enum, schemas.REFERENCE_IDS);
    const all = installation.loadReferences([
      'program.outputs', 'program.cas', 'verification.engine',
      'interactions.parameters', 'patterns.regular-polygon',
      'patterns.dependencies',
    ]);
    assert.equal(all.references.length, 6);
    assert.ok(Buffer.byteLength(JSON.stringify(all)) <= 24 * 1024);
    const invalid = [undefined, [], ['unknown'], Array(7).fill('request')];
    for (const value of invalid) {
      assert.throws(() => installation.loadReferences(value));
    }
  });

test('batch budget counts escaped JSON bytes and never truncates a topic',
  async () => {
    const path = join(bundle,
      'skills/ggb-construction/references/worker-request.md');
    const original = await readFile(path, 'utf8');
    try {
      await writeFile(path, '## 请求\n' + '"'.repeat(13 * 1024));
      assert.ok(Buffer.byteLength(installation.loadReference('request')
        .content) < 24 * 1024);
      assert.throws(() => installation.loadReferences(['request']),
        /reference_response_oversized/);
    } finally {await writeFile(path, original);}
  });


test('Worker request reference is preloaded once and cannot inherit CLI fields', async () => {
  const reference = installation.loadReference('request').content.trim();
  const body = installation.loadWorkerSkill();
  assert.equal(body.split(reference).length, 2);
  assert.ok(Buffer.byteLength(body) <= 6500);
  assert.match(body, /Reference reads are not prerequisites/);
  assert.match(body, /normally read at most 3 total/);
  assert.match(body, /derived object also requires a[\s\S]*dependsOn/);
  assert.match(body, /Explicit user-given free coordinates/);
  assert.match(body, /every defining input of every derived relation/);
  assert.match(body, /Type checks use objectType, not expected/);
  assert.match(body, /Copy source verbatim/);
  assert.match(body, /sourceRef:"input" may replace source/);
  assert.match(body, /A helper cannot replace a given root/);
  assert.match(body, /explicit label flags must survive reload/);
  assert.match(body, /modifications support parameter samples only/);
  assert.match(body, /Zero samples means not_sampled/);
  assert.match(body, /Never resubmit an unchanged unsupported/);
  assert.match(body, /Image tasks require nonempty transcription on the first save/);
  assert.match(body, /complete mathematical problem text/);
  assert.match(body, /not an image summary/);
  assert.match(body, /without comparing known alternatives/);
  assert.match(body, /Submit when sources/);
  assert.match(body, /No chapter survey/);
  assert.match(body, /exists: one subject/);
  assert.match(body, /coordinate: one point, coordinates/);
  assert.match(body, /outputs defaults to/);
  assert.match(body, /Do not reread request to confirm known fields/);
  const schema = server.createTool('ggb_request').parameters;
  assert.ok(!schema.required.includes('transcription'));
  assert.match(schema.properties.transcription.description,
    /Required on the first save when an image is attached/);
  const {RequestDraft} = await import(pathToFileURL(
    join(bundle, 'dist/src/draft-requests.js')));
  const {parseRequest} = await import(pathToFileURL(
    join(bundle, 'dist/src/schema.js')));
  const args = JSON.parse(/```json\n([\s\S]*?)\n```/u.exec(reference)[1]);
  assert.deepEqual(Object.keys(JSON.parse(args.requestText)), ['plan']);
  const draft = new RequestDraft('Create point P');
  const saved = draft.operate(args);
  assert.doesNotThrow(() => parseRequest({...draft.forCheck({revision: saved.revision}).request,
    outputDir: '/tmp/worker-reference-only'}));
  for (const key of ['protocolVersion', 'prompt', 'locale', 'title',
    'outputDir', 'base']) {
    const bad = {...args, requestText: JSON.stringify({
      ...JSON.parse(args.requestText), [key]: 'forbidden'})};
    assert.throws(() => draft.operate(bad), /draft_request_fields/);
    assert.equal(draft.forCheck({revision: saved.revision}).domainRequestDigest,
      saved.domainRequestDigest);
  }
  const path = join(bundle,
    'skills/ggb-construction/references/capabilities.md');
  const original = await readFile(path, 'utf8');
  try {
    await writeFile(path, original.replace('## 请求', '## CLI_ONLY_SENTINEL'));
    assert.equal(installation.loadReference('request').content.trim(), reference);
    assert.ok(!installation.loadWorkerSkill().includes('CLI_ONLY_SENTINEL'));
  } finally {await writeFile(path, original);}
});

test('missing or oversized Worker request contract fails before registration', async () => {
  const path = join(bundle, 'skills/ggb-construction/references/worker-request.md');
  const original = await readFile(path, 'utf8');
  try {
    await writeFile(path, 'x'.repeat(25 * 1024));
    const tools = [];
    assert.throws(() => server.apply({tools: {register: t => tools.push(t)},
      systemPrompt: {section() {}}}, {sdkVersion: '0.2.1-rc.2'}), /oversized/);
    assert.equal(tools.length, 0);
    await writeFile(path, '   \n');
    assert.throws(() => installation.loadWorkerSkill(), /resource_invalid/);
    await rm(path);
    assert.throws(() => installation.loadWorkerSkill(), /ENOENT/);
  } finally {await writeFile(path, original);}
});


test('preloaded topic metadata and explicit refresh belong to the public plugin contract', async () => {
  const schemas = await import(pathToFileURL(join(bundle, 'dist/src/host-protocol.js')));
  assert.deepEqual(schemas.PRELOADED_REFERENCE_TOPICS, ['request']);
  assert.deepEqual(schemas.parseReferenceTopics({reference: 'program', refresh: true}), ['program']);
  assert.equal(server.createTool('ggb_inspect').parameters.properties.refresh.type, 'boolean');
  for (const bad of [{refresh: true}, {reference: 'request', refresh: 'true'},
    {reference: '../request', refresh: true}]) {
    assert.throws(() => schemas.parseReferenceTopics(bad));
  }
});


test('fixed sections exclude neighboring content', async () => {
  for (const [id, spec] of Object.entries(schemas.REFERENCE_SECTIONS)) {
    const part = installation.loadReference(id);
    assert.equal(part.topic, id);
    assert.ok(part.content.includes(spec.heading));
    const chapter = installation.loadReference(spec.topic).content;
    assert.ok(chapter.includes(part.content));
    assert.ok(Buffer.byteLength(part.content) <
      Buffer.byteLength(installation.loadReference(spec.topic).content));
  }
  const parameters = installation.loadReference(
    'interactions.parameters').content;
  assert.match(parameters, /sample.roundTrip/);
  assert.ok(!parameters.includes('### 样式与视图'));
  const outputs = installation.loadReference('program.outputs').content;
  assert.match(outputs, /Element/);
  assert.ok(!outputs.includes('### CAS 结果与依赖'));
  assert.throws(() => installation.loadReference('program.outputs/../request'));
  assert.throws(() => installation.loadReference('program.unknown'));
  const path = join(bundle,
    'skills/ggb-construction/references/capabilities.md');
  const original = await readFile(path, 'utf8');
  try {
    await writeFile(path, original.replace('### 多输出与列表', '### 缺失小节'));
    assert.throws(() => installation.loadReference('program.outputs'),
      /reference_section_missing/);
    assert.throws(() => installation.loadReference('program'),
      /reference_section_missing/);
    const crlf = original.replaceAll('\n', '\r\n');
    await writeFile(path, crlf);
    const restored = installation.loadReference('program.outputs');
    assert.match(restored.content, /Focus/);
    await writeFile(path, original.replace('### 多输出与列表',
      '### 多输出与列表\n### 多输出与列表'));
    assert.throws(() => installation.loadReference('program.outputs'),
      /reference_section_missing/);
  } finally {await writeFile(path, original);}
});


test('coverage metadata never promotes a section to a complete chapter', () => {
  assert.deepEqual(schemas.referenceCoverage('program.outputs'),
    ['program.outputs']);
  assert.deepEqual(schemas.referenceCoverage('program'),
    ['program', 'program.outputs', 'program.cas']);
  assert.deepEqual(schemas.referenceCoverage('request'), ['request']);
  assert.throws(() => schemas.referenceCoverage('program.unknown'));
});
