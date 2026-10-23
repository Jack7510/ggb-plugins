/** @fileoverview Offline regression for small atomic request batches. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {RequestDraft} from '../../dist/src/draft-requests.js';
import {parseDraftArguments} from '../../dist/src/draft-arguments.js';
import {digestJson} from '../../dist/src/host-protocol.js';
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
