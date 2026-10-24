/** @fileoverview Offline regression for small atomic request batches. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {RequestDraft} from '../../dist/src/draft-requests.js';
import {parseDraftArguments, REQUEST_ARGUMENT_BYTES, REQUEST_TEXT_BYTES}
  from '../../dist/src/draft-arguments.js';
import {authenticateRequest, digestJson, LIMITS, parseToolRequest, signRequest}
  from '../../dist/src/host-protocol.js';
import {randomUUID} from 'node:crypto';
import {parseRequest} from '../../dist/src/schema.js';

function fixture() {
  const draft = new RequestDraft('Create point P');
  let revision = draft.operate({action: 'create', locale: 'en'}).revision;
  const edit = (section, items, action = 'append', index) => {
    const result = draft.operate({action, revision, section, items,
      ...(index === undefined ? {} : {index})});
    revision = result.revision;
    return result;
  };
  const check = () => draft.forCheck({revision});
  edit('program', [{id: 'P', source: 'P=(0,0)', initial: [0,0]}]);
  edit('requirements', [{id: 'point', source: 'Create point P'}]);
  edit('checks', [{requirementId: 'point', kind: 'exists',
    subjects: ['P'], scope: 'initial'}]);
  return {draft, edit, check, revision: () => revision};
}
test('complete saved revision passes the existing full request parser', () => {
  const f = fixture();
  const snapshot = f.check();
  assert.doesNotThrow(() => parseRequest({...snapshot.request,
    outputDir: '/tmp/synthetic-only'}));
  assert.equal(snapshot.domainRequestDigest, digestJson(snapshot.request));
  const checked = f.draft.acceptCheck(snapshot);
  assert.deepEqual(f.draft.forBuild({checkedRequestId:
    checked.checkedRequestId}).request, snapshot.request);
  snapshot.request.plan.program[0].source = 'P=(999,999)';
  assert.equal(f.draft.forBuild({checkedRequestId:
    checked.checkedRequestId}).request.plan.program[0].source, 'P=(0,0)');
});
test('CAS, initial, independent expectations and samples survive assembly', () => {
  const f = fixture();
  f.edit('program', [{id: 'n', source: '2+3', mode: 'cas'},
    {id: 'A', source: 'A=Point(d)', initial: [-1,2], outputs: ['A']}]);
  const expected = [[1,2],[3,4]];
  f.edit('checks', [{requirementId: 'point', kind: 'expression', subjects: [],
    scope: 'sampled', expression: '{{1,2},{3,4}}', mode: 'cas', expected}]);
  f.edit('interactions', [{point: 'A', dx: 30, dy: 0}]);
  const plan = f.check().request.plan;
  assert.equal(plan.program[1].mode, 'cas');
  assert.deepEqual(plan.program[2].initial, [-1,2]);
  assert.deepEqual(plan.requirements[0].checks[1].expected, expected);
  assert.deepEqual(plan.interactions, [{point: 'A', dx: 30, dy: 0}]);
});
test('edits invalidate checked tokens; failed edits are atomic and revisions isolate concurrent callers', () => {
  const f = fixture();
  const {checkedRequestId} = f.draft.acceptCheck(f.check());
  const checked = {checkedRequestId};
  assert.throws(() => f.draft.operate({action: 'replace', revision:
    f.revision(), section: 'program', index: 10, items: [{id: 'P'}]}),
  /draft_index_range/);
  assert.ok(f.draft.forBuild(checked));
  const old = f.revision();
  f.edit('program', [{id: 'P', source: 'P=(1,2)', initial: [1,2]}],
    'replace', 0);
  assert.throws(() => f.draft.forBuild(checked), /draft_check_required/);
  assert.throws(() => f.draft.operate({action: 'append', revision: old,
    section: 'program', items: [{id: 'Q', source: 'Q=(0,0)'}]}),
  /draft_revision_conflict/);
  assert.throws(() => new RequestDraft('other').forBuild(checked),
    /draft_check_required/);
});
test('oversize, paths, unknown fields and absent checks cannot bypass validation', () => {
  const f = fixture();
  for (const value of [{action: 'append', revision: f.revision(),
    section: 'program', items: [{source: '字'.repeat(1000)}]},
  {action: 'read', revision: f.revision(), section: '../request.json'},
  {action: 'create', locale: 'en', outputDir: '/tmp'},
  {action: 'remove', revision: f.revision(), section: 'checks', index: -1}]) {
    assert.throws(() => f.draft.operate(value));
  }
  assert.throws(() => parseDraftArguments('ggb_check', {request: {}}));
  const revision = f.revision();
  f.draft.operate({action: 'remove', revision, section: 'checks', index: 0});
  const bad = f.draft.forCheck({revision: revision + 1});
  assert.throws(() => parseRequest({...bad.request,
    outputDir: '/tmp/synthetic-only'}));
});
test('bounded reads, deletion and repeated create do not overwrite another version', () => {
  const f = fixture();
  assert.throws(() => f.draft.operate({action: 'create', locale: 'en'}),
    /draft_already_exists/);
  const page = f.draft.operate({action: 'read', revision: f.revision(),
    section: 'program', index: 0, count: 1});
  assert.equal(page.items[0].source, 'P=(0,0)');
  page.items[0].source = 'tampered';
  assert.equal(f.check().request.plan.program[0].source, 'P=(0,0)');
});

test('image transcription is chunked without replacing the original prompt', () => {
  const draft = new RequestDraft('Draw the image');
  draft.operate({action: 'create', locale: 'en'});
  draft.operate({action: 'append', revision: 1, section: 'transcription',
    items: ['Create point P']});
  draft.operate({action: 'append', revision: 2, section: 'program',
    items: [{id: 'P', source: 'P=(0,0)'}]});
  draft.operate({action: 'append', revision: 3, section: 'requirements',
    items: [{id: 'point', source: 'Create point P'}]});
  draft.operate({action: 'append', revision: 4, section: 'checks', items: [
    {requirementId: 'point', kind: 'exists', subjects: ['P'],
      scope: 'initial'}]});
  const saved = draft.forCheck({revision: 5});
  assert.equal(saved.request.prompt, 'Draw the image\nCreate point P');
  assert.doesNotThrow(() => parseRequest({...saved.request,
    outputDir: '/tmp/synthetic-only'}));
});

test('aggregate draft limits and modified snapshots fail without partial writes', () => {
  const f = fixture();
  const snapshot = f.check();
  snapshot.request.plan.program[0].source = 'P=(9,9)';
  assert.throws(() => f.draft.acceptCheck(snapshot), /draft_snapshot_changed/);
  let revision = f.revision();
  let rejected = false;
  for (let i = 0; i < 100; i++) {
    try {
      revision = f.draft.operate({action: 'append', revision,
        section: 'program', items: [{id: 'T' + i,
          source: 'T' + i + '=Text("' + 'a'.repeat(1700) + '")'}]}).revision;
    } catch (error) {
      assert.match(error.message, /draft_request_too_large/);
      rejected = true;
      break;
    }
  }
  assert.equal(rejected, true);
  assert.equal(f.draft.operate({action: 'read', revision,
    section: 'program', index: 0}).revision, revision);
});

test('one requestText carries the complete request without section state', () => {
  const draft = new RequestDraft('Draw the image');
  const text = JSON.stringify({plan: {
    program: [{id: 'P', source: 'P=(0,0)', op: 'native', mode: 'algebra'}],
    requirements: [{id: 'point', source: 'point P', checks: [
      {kind: 'exists', subjects: ['P'], scope: 'initial'}]}],
    interactions: [],
  }});
  const saved = draft.operate({requestText: text, locale: 'en',
    transcription: ['Create point P']});
  assert.equal(saved.revision, 1);
  const snapshot = draft.forCheck({revision: 1});
  assert.equal(saved.requestBytes, Buffer.byteLength(JSON.stringify(snapshot.request)));
  assert.equal(snapshot.request.prompt, 'Draw the image\nCreate point P');
  assert.equal(snapshot.request.locale, 'en');
  assert.doesNotThrow(() => parseRequest({...snapshot.request,
    outputDir: '/tmp/synthetic-only'}));
  const checked = draft.acceptCheck(snapshot);
  assert.deepEqual(draft.forBuild({checkedRequestId:
    checked.checkedRequestId}).request, snapshot.request);
});

test('invalid or host-owned requestText is rejected without changing state', () => {
  const draft = new RequestDraft('prompt');
  assert.throws(() => draft.operate({requestText: '{'}), /not valid JSON/);
  assert.throws(() => draft.operate({requestText: JSON.stringify({
    prompt: 'injected', plan: {}})}), /draft_request_fields/);
  assert.throws(() => draft.operate({requestText: JSON.stringify({
    plan: {}}), locale: 'zh-CN', outputDir: '/tmp'}),
  /draft_unknown_field/);
  assert.throws(() => draft.forCheck({revision: 1}), /draft_missing/);
});

test('requestText accepts the full native step shape and rejects other ops', () => {
  const draft = new RequestDraft('prompt');
  const request = (step) => JSON.stringify({plan: {
    program: [step], requirements: [], interactions: []}});
  const saved = draft.operate({requestText: request({
    id: 'P', op: 'native', mode: 'algebra', source: 'P=(0,0)'})});
  assert.equal(saved.revision, 1);
  assert.equal(draft.forCheck({revision: 1}).request.plan.program[0].op, 'native');
  assert.throws(() => draft.operate({requestText: request({
    id: 'Q', op: 'freePoint', source: 'Q=(0,0)'})}), /draft_program_fields/);
});

test('a corrected complete requestText replaces the prior version atomically', () => {
  const draft = new RequestDraft('prompt');
  const base = {plan: {program: [], requirements: [], interactions: []}};
  const first = draft.operate({requestText: JSON.stringify(base)});
  const snapshot = draft.forCheck({revision: 1});
  const checked = draft.acceptCheck(snapshot);
  const corrected = {...base, plan: {...base.plan,
    program: [{id: 'P', source: 'P=(0,0)'}]}};
  const second = draft.operate({requestText: JSON.stringify(corrected)});
  assert.equal(second.revision, 2);
  assert.equal(first.revision, 1);
  assert.throws(() => draft.forBuild({checkedRequestId:
    checked.checkedRequestId}), /draft_check_required/);
  const next = draft.forCheck({revision: 2});
  assert.notEqual(next.domainRequestDigest, snapshot.domainRequestDigest);
});

/** A complete domain body; callers never supply host identities or paths. */
function textBody() {
  return {plan: {
    program: [{id: 'P', source: 'P=(0,0)', initial: [0,0]},
      {id: 'n', source: '2+3', mode: 'cas'}],
    requirements: [{id: 'point', source: 'Create point P', checks: [
      {kind: 'exists', subjects: ['P'], scope: 'initial'},
      {kind: 'expression', subjects: ['n'], expression: '{{n-4,n-3},{n-2,n-1}}',
        mode: 'cas', expected: [[1,2],[3,4]], scope: 'initial'},
    ]}], interactions: [],
  }};
}

/** The same authentication envelope as the installed server, without sockets. */
function signedText(args) {
  const unsigned = {protocolVersion: 3, runId: 'run_' + randomUUID(),
    turnId: randomUUID(), requestId: randomUUID(), toolCallId: randomUUID(),
    epoch: 1, toolName: 'ggb_request', arguments: args,
    argumentsDigest: digestJson(args), issuedAt: new Date().toISOString(),
    nonce: 'c'.repeat(32)};
  return {...unsigned, authentication: signRequest('b'.repeat(64), unsigned)};
}

test('text mode rejects every section operation without invalidating a check', () => {
  const draft = new RequestDraft('Create point P');
  draft.operate({requestText: JSON.stringify(textBody()), locale: 'en'});
  const snapshot = draft.forCheck({revision: 1});
  parseRequest({...snapshot.request, outputDir: '/tmp/synthetic-only'});
  const checked = draft.acceptCheck(snapshot);
  for (const action of ['read', 'append', 'replace', 'remove']) {
    const args = {action, revision: 1, section: 'program',
      ...(action === 'replace' || action === 'remove' ? {index: 0} : {}),
      ...(action === 'append' || action === 'replace' ?
        {items: [{id: 'Q', source: 'Q=(1,0)'}]} : {})};
    assert.throws(() => draft.operate(args), /draft_mode_conflict/);
  }
  assert.throws(() => draft.operate({action: 'create', locale: 'en'}),
    /draft_mode_conflict/);
  const build = draft.forBuild({checkedRequestId: checked.checkedRequestId});
  assert.deepEqual(build.request, snapshot.request);
  assert.equal(build.revision, 1);
});

test('section mode cannot be replaced by a hidden text document', () => {
  const f = fixture();
  const snapshot = f.check();
  const checked = f.draft.acceptCheck(snapshot);
  assert.throws(() => f.draft.operate({requestText:
    JSON.stringify(textBody())}), /draft_mode_conflict/);
  assert.deepEqual(f.draft.forBuild({checkedRequestId:
    checked.checkedRequestId}).request, snapshot.request);
  assert.equal(f.draft.operate({action: 'read', revision: f.revision(),
    section: 'program'}).items[0].id, 'P');
});

test('image repairs preserve metadata, nested checks, CAS and exact snapshots', () => {
  const draft = new RequestDraft('Draw the image');
  const body = textBody();
  draft.operate({requestText: JSON.stringify(body), locale: 'en',
    title: 'Image construction', transcription: ['Create point P']});
  const first = draft.forCheck({revision: 1});
  parseRequest({...first.request, outputDir: '/tmp/synthetic-only'});
  const old = draft.acceptCheck(first);
  body.plan.program[0].source = 'P=(1,0)';
  body.plan.program[0].initial = [1,0];
  const args = {requestText: JSON.stringify(body)};
  const envelope = parseToolRequest(signedText(args));
  assert.equal(authenticateRequest('b'.repeat(64), envelope), true);
  const saved = draft.operate(envelope.arguments);
  assert.equal(saved.revision, 2);
  assert.throws(() => draft.forBuild({checkedRequestId:
    old.checkedRequestId}), /draft_check_required/);
  const next = draft.forCheck({revision: 2});
  const parsed = parseRequest({...next.request,
    outputDir: '/tmp/synthetic-only'});
  assert.equal(parsed.prompt, 'Draw the image\nCreate point P');
  assert.equal(parsed.locale, 'en');
  assert.equal(parsed.title, 'Image construction');
  assert.equal(next.request.plan.program[1].mode, 'cas');
  assert.deepEqual(next.request.plan.program[0].initial, [1,0]);
  assert.deepEqual(next.request.plan.requirements[0].checks[1].expected,
    [[1,2],[3,4]]);
  const checked = draft.acceptCheck(next);
  const built = draft.forBuild({checkedRequestId: checked.checkedRequestId});
  assert.equal(built.domainRequestDigest, saved.domainRequestDigest);
  assert.equal(built.domainRequestDigest, digestJson(built.request));
  assert.notEqual(built.domainRequestDigest, first.domainRequestDigest);
});

test('explicit metadata replaces old values and invalid repairs are atomic', () => {
  const draft = new RequestDraft('Create point P');
  const requestText = JSON.stringify(textBody());
  draft.operate({requestText, locale: 'en', title: 'first',
    transcription: ['first image']});
  const checked = draft.acceptCheck(draft.forCheck({revision: 1}));
  assert.throws(() => draft.operate({requestText: '{', locale: 'zh-CN',
    transcription: ['wrong image']}), /not valid JSON/);
  assert.equal(draft.forBuild({checkedRequestId:
    checked.checkedRequestId}).request.locale, 'en');
  draft.operate({requestText, locale: 'zh-CN', title: 'second',
    transcription: []});
  const next = draft.forCheck({revision: 2}).request;
  assert.equal(next.prompt, 'Create point P');
  assert.equal(next.locale, 'zh-CN');
  assert.equal(next.title, 'second');
});

test('flat checks and requirementId remain invalid in a complete body', () => {
  const body = textBody();
  const checks = body.plan.requirements[0].checks;
  for (const misplaced of [
    {...body.plan, checks},
    {...body.plan, requirements: [{...body.plan.requirements[0],
      checks: [{...checks[0], requirementId: 'point'}]}]},
  ]) {
    const draft = new RequestDraft('Create point P');
    draft.operate({requestText: JSON.stringify({plan: misplaced})});
    assert.throws(() => parseRequest({...draft.forCheck({revision: 1}).request,
      outputDir: '/tmp/synthetic-only'}), /Unknown field/);
  }
});

for (const seed of ['a', '汉', '"', '\\']) {
  test(`serialized argument boundary survives the channel (${seed})`, () => {
    const args = size => ({requestText: JSON.stringify({plan: {},
      clarifications: [{question: 'q', answer: seed.repeat(size)}]})});
    let low = 0;
    let high = REQUEST_ARGUMENT_BYTES;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const value = args(middle);
      const fits = Buffer.byteLength(JSON.stringify(value)) <=
        REQUEST_ARGUMENT_BYTES &&
        Buffer.byteLength(value.requestText) <= REQUEST_TEXT_BYTES;
      if (fits) low = middle;
      else high = middle - 1;
    }
    assert.equal(LIMITS.requestBytes, REQUEST_ARGUMENT_BYTES);
    parseDraftArguments('ggb_request', args(low));
    assert.doesNotThrow(() => parseToolRequest(signedText(args(low))));
    assert.throws(() => parseDraftArguments('ggb_request', args(low + 1)),
      /draft_(arguments|request_text)_too_large/);
  });
}

test('escaped overflow is rejected atomically even when raw text fits', () => {
  const draft = new RequestDraft('Create point P');
  draft.operate({requestText: JSON.stringify(textBody())});
  const checked = draft.acceptCheck(draft.forCheck({revision: 1}));
  const args = {requestText: JSON.stringify({plan: {program: [
    {id: 'P', source: 'x'.repeat(124000) + '"'.repeat(3000)},
  ]}})};
  assert.ok(Buffer.byteLength(args.requestText) < REQUEST_TEXT_BYTES);
  assert.throws(() => draft.operate(args), /draft_arguments_too_large/);
  assert.throws(() => parseToolRequest(signedText(args)),
    /draft_arguments_too_large/);
  assert.equal(draft.forBuild({checkedRequestId:
    checked.checkedRequestId}).revision, 1);
});

test('metadata and inherited prompt count toward their respective budgets', () => {
  const draft = new RequestDraft('Create point P');
  const transcription = Array.from({length: 20}, () => '汉'.repeat(2000));
  const requestText = JSON.stringify(textBody());
  draft.operate({requestText, transcription});
  const checked = draft.acceptCheck(draft.forCheck({revision: 1}));
  const large = {requestText: JSON.stringify({plan: {},
    clarifications: [{question: 'q', answer: 'a'.repeat(20000)}]})};
  assert.throws(() => parseDraftArguments('ggb_request',
    {...large, transcription}), /draft_arguments_too_large/);
  assert.throws(() => draft.operate(large), /draft_request_too_large/);
  assert.equal(draft.forBuild({checkedRequestId:
    checked.checkedRequestId}).request.prompt,
  'Create point P\n' + transcription.join('\n'));
});

test('sourceRef resolves exact input text, retains transcription and binds checked snapshots', async () => {
  const {parseRequest} = await import('../../dist/src/schema.js');
  const text = '椭圆 C：x²/16 + y²/9 = 1 的左焦点为 F';
  const draft = new RequestDraft('Read the image');
  const body = {plan: {program: [{id: 'P', source: 'P=(0,0)'}],
    requirements: [{id: 'r', sourceRef: 'input', checks: [
      {kind: 'exists', subjects: ['P'], scope: 'initial'},
    ]}], interactions: []}};
  draft.operate({requestText: JSON.stringify(body), transcription: [text]});
  const first = draft.forCheck({revision: 1});
  const source = 'Read the image\n' + text;
  assert.equal(first.request.plan.requirements[0].source, source);
  assert.ok(!('sourceRef' in first.request.plan.requirements[0]));
  assert.doesNotThrow(() => parseRequest({...first.request,
    outputDir: '/tmp/source-reference'}));
  const checked = draft.acceptCheck(first);
  for (const requirement of [
    {sourceRef: '../other-run'}, {sourceRef: {path: '/etc/passwd'}},
    {sourceRef: 'input', source: text},
  ]) {
    const bad = structuredClone(body);
    Object.assign(bad.plan.requirements[0], requirement);
    assert.throws(() => draft.operate({requestText: JSON.stringify(bad)}),
      /sourceRef|draft_source_reference/);
    assert.equal(draft.forBuild({checkedRequestId:
      checked.checkedRequestId}).domainRequestDigest,
      first.domainRequestDigest);
  }
  draft.operate({requestText: JSON.stringify(body)});
  assert.equal(draft.forCheck({revision: 2}).request.plan.requirements[0].source,
    source);
  assert.throws(() => draft.forBuild({checkedRequestId:
    checked.checkedRequestId}), /draft_check_required/);
  const literal = structuredClone(body);
  delete literal.plan.requirements[0].sourceRef;
  literal.plan.requirements[0].source = source;
  draft.operate({requestText: JSON.stringify(literal)});
  assert.equal(draft.forCheck({revision: 3}).domainRequestDigest,
    first.domainRequestDigest);
  const other = new RequestDraft('Different turn');
  other.operate({requestText: JSON.stringify(body)});
  assert.equal(other.forCheck({revision: 1}).request.plan.requirements[0].source,
    'Different turn');
});

test('source references never repair invalid literals or bypass the expanded budget', async () => {
  const {parseRequest} = await import('../../dist/src/schema.js');
  const input = '椭圆 C：x²/16 + y²/9 = 1';
  const body = {plan: {program: [{id: 'P', source: 'P=(0,0)'}],
    requirements: [{id: 'r', source: 'C: x^2/16+y^2/9=1', checks: [
      {kind: 'exists', subjects: ['P'], scope: 'initial'},
    ]}], interactions: []}};
  const draft = new RequestDraft(input);
  draft.operate({requestText: JSON.stringify(body)});
  assert.throws(() => parseRequest({...draft.forCheck({revision: 1}).request,
    outputDir: '/tmp/source-reference'}), /source is not in the input/);
  delete body.plan.requirements[0].source;
  body.plan.requirements[0].sourceRef = 'input';
  const large = new RequestDraft('x'.repeat(10000));
  body.plan.requirements = Array.from({length: 20}, (_, id) =>
    ({...body.plan.requirements[0], id: String(id)}));
  assert.throws(() => large.operate({requestText: JSON.stringify(body)}),
    /draft_request_too_large/);
  assert.throws(() => large.forCheck({revision: 1}), /draft_missing/);
});
