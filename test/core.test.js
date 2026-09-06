import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ThreadFold } from '../src/engine.js';
import { Store } from '../src/store.js';
import { FixtureHub, FixtureApproval, PublishedGraph, UnavailableHub } from '../src/adapters.js';
import { canonical, digest, seal, verify, scopeDigest, assess, validateInventory } from '../src/model.js';
import { callTool, createRPC, toolDefinitions } from '../src/tools.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = () => JSON.parse(fs.readFileSync(new URL('../fixtures/completed-run.json', import.meta.url), 'utf8'));
function setup(t, edit = () => {}) {
  const scratch = path.join(root, '.threadfold'); fs.mkdirSync(scratch, { recursive: true });
  const dir = fs.mkdtempSync(path.join(scratch, 'test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let now = 100000;
  const seed = fixture(); edit(seed);
  const hub = new FixtureHub(path.join(dir, 'hub'), seed, { clock: () => now });
  const approval = new FixtureApproval();
  const engine = new ThreadFold({ directory: path.join(dir, 'fold'), hub, approval, clock: () => now });
  const inspect = options => engine.inspect({ projectId: seed.canonicalProjectId, runId: seed.runId, ...options });
  const prepare = () => engine.prepare({ snapshotId: inspect().snapshot.snapshotId });
  const ready = () => { const p = prepare().plan; return engine.revise({ planId: p.planId, expectedRevision: 1, edits: { coverageReviewed: true } }); };
  const apply = (plan, overrides = {}) => engine.apply({ planId: plan.planId, revision: plan.revision, approvalReceipt: approval.issue(plan, { now }), idempotencyKey: plan.planId, ...overrides });
  return { dir, seed, hub, approval, engine, inspect, prepare, ready, apply, advance: n => { now += n; } };
}
const throwsCode = (fn, code) => assert.throws(fn, e => e.code === code);

test('canonical digests ignore object order and reject invalid JSON numbers', () => {
  assert.equal(digest({ b: 2, a: 1 }), digest({ a: 1, b: 2 }));
  throwsCode(() => canonical({ x: NaN }), 'INVALID_JSON');
  throwsCode(() => verify({ ...seal({ value: 1 }), value: 2 }), 'DIGEST_MISMATCH');
});

for (const [label, mutate, reason] of [
  ['active Turn', s => { s.threads[1].activeTurn = true; }, 'ACTIVETURN'],
  ['valid lease', s => { s.threads[1].lease = true; }, 'LEASE'],
  ['pending followup', s => { s.threads[1].pending = true; }, 'PENDING'],
  ['preserved', s => { s.threads[1].preserved = true; }, 'PRESERVED'],
  ['unmerged', s => { s.threads[1].unmerged = true; }, 'UNMERGED'],
  ['unknown safety', s => { delete s.threads[1].activeTurn; }, 'UNKNOWN_ACTIVETURN'],
  ['shared active Run', s => { s.threads[1].runRefs.push('other'); s.runs.push({ runId: 'other', status: 'running', pending: false }); }, 'ACTIVE_REFERENCE'],
  ['unknown Run', s => { s.threads[1].runRefs.push('missing'); }, 'ACTIVE_REFERENCE'],
  ['unmanaged personal thread', s => { s.threads[1].managed = false; }, 'OUT_OF_SCOPE'],
  ['divergent state', s => { s.threads[1].hubArchived = true; }, 'STATE_DIVERGENCE'],
  ['unknown effects', s => { s.threads[1].effectsKnown = false; }, 'UNKNOWN_EFFECTS_OR_REFERENCES'],
  ['unknown references', s => { s.threads[1].referencesComplete = false; }, 'UNKNOWN_EFFECTS_OR_REFERENCES'],
  ['previously archived', s => { s.threads[1].archived = s.threads[1].hubArchived = true; }, 'ALREADY_ARCHIVED']
]) test(`protection: ${label}`, t => {
  const h = setup(t, mutate), assessment = h.inspect().assessments[1];
  assert.notEqual(assessment.safety, 'eligible'); assert.ok(assessment.reasonCodes.includes(reason));
  const { plan } = h.ready(); assert.ok(!plan.effects.some(e => e.threadRef.threadId === 'thread-1'));
  if (plan.status === 'ready_for_review' && plan.effects.length) h.apply(plan);
  assert.equal(h.hub.inspect().threads[1].stateRevision, 1);
});

test('partial inventory pages block prepare/apply readiness', t => {
  const h = setup(t); const page = h.inspect({ limit: 1 });
  assert.equal(page.nextCursor, 1); assert.equal(page.counts.completeness, 'partial');
  const p = h.engine.prepare({ snapshotId: page.snapshot.snapshotId }).plan;
  const revised = h.engine.revise({ planId: p.planId, expectedRevision: 1, edits: { coverageReviewed: true } }).plan;
  assert.ok(revised.blockers.includes('INCOMPLETE_SCOPE')); throwsCode(() => h.apply(revised), 'PLAN_NOT_READY');
});

test('unreadable source blocks the entire Run, including other eligible threads', t => {
  const h = setup(t, s => { s.threads[1].readable = false; });
  const { plan } = h.ready(); assert.ok(plan.blockers.includes('SOURCE_UNAVAILABLE')); throwsCode(() => h.apply(plan), 'PLAN_NOT_READY');
});

test('missing source text blocks whole-Run coverage', t => {
  const h = setup(t, s => { delete s.threads[1].sourceText; });
  const { plan } = h.ready(); assert.ok(plan.blockers.includes('SOURCE_UNAVAILABLE')); throwsCode(() => h.apply(plan), 'PLAN_NOT_READY');
});

test('descendant expansion is excluded rather than silently approved', t => {
  const h = setup(t, s => { s.threads[1].effectRefs.push(s.threads[0].ref); });
  const { plan } = h.ready(); assert.ok(plan.exclusions.some(e => e.reasonCodes.includes('EFFECT_SCOPE_MISMATCH')));
  h.apply(plan); assert.equal(h.hub.inspect().threads[1].archived, false); assert.equal(h.hub.inspect().threads[0].archived, false);
});

test('ambiguous representative requires explicit revised selection', t => {
  const h = setup(t, s => { s.threads[1].representative = true; });
  const { plan } = h.ready(); assert.ok(plan.blockers.includes('REPRESENTATIVE_REQUIRED'));
  const revised = h.engine.revise({ planId: plan.planId, expectedRevision: 2, edits: { representativeRef: h.seed.threads[0].ref, coverageReviewed: true } }).plan;
  assert.equal(revised.status, 'ready_for_review');
});

test('provenance, fixed sections, conflict and branch applicability survive consolidation', t => {
  const h = setup(t, s => { s.threads[1].claims[0].section = s.threads[2].claims[0].section = 'decisions'; s.threads[1].claims[0].topic = s.threads[2].claims[0].topic = 'storage'; s.threads[2].claims[0].applicability.branch = 'other'; });
  const { record } = h.ready(); assert.equal(Object.keys(record.sections).length, 8); assert.equal(record.coverage.length, 3); assert.equal(record.conflicts.length, 1);
  assert.equal(record.sourceManifest[1].sourceText, h.seed.threads[1].sourceText);
  assert.deepEqual(record.sections.decisions[0].evidenceRefs, h.seed.threads[1].claims[0].evidenceRefs);
  assert.equal(record.sections.decisions[1].applicability.branch, 'other');
  const conflicting = new Set(record.conflicts.flatMap(c => c.claimIds));
  for (const coverage of record.coverage) assert.equal(coverage.status, conflicting.has(coverage.claimId) ? 'conflict' : 'preserved');
  assert.deepEqual(record.sourceManifest.map(s => s.claims), h.seed.threads.map(s => s.claims));
});

test('foreign provenance and duplicate canonical identities are rejected', () => {
  const a = fixture(); a.threads[1].claims[0].evidenceRefs[0].threadRef.threadId = 'invented';
  throwsCode(() => validateInventory(a), 'INVALID_PROVENANCE');
  const b = fixture(); b.threads[1].ref = b.threads[0].ref; throwsCode(() => validateInventory(b), 'INVALID_THREAD_REF');
});

test('revision is immutable, excludes requested targets, invalidates approval and detects tampering', t => {
  const h = setup(t); const { plan } = h.ready(); const receipt = h.approval.issue(plan, { now: 100000 });
  const before = h.engine.readPlan({ planId: plan.planId, revision: 2 });
  const next = h.engine.revise({ planId: plan.planId, expectedRevision: 2, edits: { excludedRefs: [h.seed.threads[1].ref], coverageReviewed: true } });
  assert.equal(next.plan.effects.length, 1);
  assert.deepEqual(h.engine.readPlan({ planId: plan.planId, revision: 2 }).record, before.record);
  assert.equal(h.engine.readPlan({ planId: plan.planId, revision: 2 }).recordStatus, 'superseded');
  throwsCode(() => h.apply(plan, { approvalReceipt: receipt }), 'STALE_PLAN');
  throwsCode(() => h.apply(next.plan, { approvalReceipt: receipt }), 'APPROVAL_SCOPE_MISMATCH');
  h.engine.store.transaction(s => { s.records[`${next.record.recordId}:3`].sections.goal[0].text = 'tampered'; });
  throwsCode(() => h.engine.readPlan({ planId: plan.planId, revision: 3 }), 'DIGEST_MISMATCH');
});

test('draft review is necessary but never sufficient as approval', t => {
  const h = setup(t); const { plan } = h.prepare(); throwsCode(() => h.apply(plan), 'PLAN_NOT_READY');
  const ready = h.ready().plan; throwsCode(() => h.apply(ready, { approvalReceipt: { approved: true } }), 'APPROVAL_INVALID');
});

test('approval rejects expiry, revocation, foreign issuer, wrong effects and forged signature', t => {
  const h = setup(t), { plan } = h.ready();
  const expired = h.approval.issue(plan, { now: 100000, ttlMs: 1 }); h.advance(2);
  throwsCode(() => h.apply(plan, { approvalReceipt: expired }), 'APPROVAL_EXPIRED');
  const revoked = h.approval.issue(plan, { now: 100002 }); h.approval.revoke(revoked.receiptId);
  throwsCode(() => h.apply(plan, { approvalReceipt: revoked }), 'APPROVAL_REVOKED');
  throwsCode(() => h.apply(plan, { approvalReceipt: new FixtureApproval().issue(plan, { now: 100002 }) }), 'APPROVAL_INVALID');
  const wrong = h.approval.issue({ ...plan, effects: [] }, { now: 100002 });
  throwsCode(() => h.apply(plan, { approvalReceipt: wrong }), 'APPROVAL_SCOPE_MISMATCH');
  const forged = h.approval.issue(plan, { now: 100002 }); forged.actorRef = 'other';
  throwsCode(() => h.apply(plan, { approvalReceipt: forged }), 'APPROVAL_INVALID');
  assert.equal(Object.values(h.engine.store.read().operations).length, 0);
});

test('plan expiration fails closed', t => { const h = setup(t), { plan } = h.ready(); h.advance(3600001); throwsCode(() => h.apply(plan), 'PLAN_EXPIRED'); });

for (const change of ['source', 'preserve', 'resume', 'effects']) test(`approval followed by ${change} change is blocked`, t => {
  const h = setup(t), { plan } = h.ready();
  h.hub.faults.beforeApply = hub => hub.edit(s => {
    if (change === 'source') s.threads[1].sourceText += ' changed';
    if (change === 'preserve') s.threads[1].preserved = true;
    if (change === 'resume') s.threads[1].activeTurn = true;
    if (change === 'effects') s.threads[1].effectRefs.push(s.threads[0].ref);
  });
  const op = h.apply(plan); assert.equal(op.status, 'attention'); assert.equal(op.lastError, 'SOURCE_CHANGED');
  assert.ok(h.hub.inspect().threads.every(t => !t.archived));
});

test('idempotent retry does not remutate and key payload conflicts reject', t => {
  const h = setup(t), { plan } = h.ready(); const first = h.apply(plan, { idempotencyKey: 'same' });
  const second = h.apply(plan, { idempotencyKey: 'same', approvalReceipt: {} });
  assert.deepEqual(second, first); assert.equal(h.hub.inspect().threads[1].stateRevision, 2);
  const restore = h.engine.prepareRestore({ operationId: first.operationId }).plan;
  throwsCode(() => h.apply(restore, { idempotencyKey: 'same' }), 'IDEMPOTENCY_CONFLICT');
  throwsCode(() => h.apply(plan, { idempotencyKey: 'different' }), 'PLAN_ALREADY_STARTED');
});

test('partial failure preserves successes and restore contains only verified owned changes', t => {
  const h = setup(t), { plan } = h.ready(); h.hub.faults.failThreadIds = ['thread-2'];
  const op = h.apply(plan); assert.equal(op.status, 'partial'); assert.equal(op.itemResults.filter(i => i.changed).length, 1);
  assert.equal(h.hub.inspect().threads[1].archived, true); assert.equal(h.hub.inspect().threads[2].archived, false);
  const restore = h.engine.prepareRestore({ operationId: op.operationId }).plan; assert.equal(restore.effects.length, 1);
  const done = h.apply(restore); assert.equal(done.status, 'applied'); assert.equal(h.hub.inspect().threads[1].archived, false);
  assert.equal(h.engine.readPlan({ planId: plan.planId, revision: 2 }).recordStatus, 'withdrawn');
});

test('archive response loss reconciles actual state without duplicate effect', t => {
  const h = setup(t), { plan } = h.ready(); h.hub.faults.loseResponse = true;
  const op = h.apply(plan); assert.equal(op.status, 'applied'); assert.equal(op.lastError, 'RESPONSE_LOST');
  assert.equal(h.apply(plan).operationId, op.operationId); assert.equal(h.hub.inspect().threads[1].stateRevision, 2);
});

test('all item failures are failed, never success', t => {
  const h = setup(t), { plan } = h.ready(); h.hub.faults.failThreadIds = ['thread-1', 'thread-2'];
  const op = h.apply(plan); assert.equal(op.status, 'failed'); throwsCode(() => h.engine.prepareRestore({ operationId: op.operationId }), 'RESTORE_NOT_READY');
});

test('post-intent interruption restarts as attention without blindly replaying', t => {
  const h = setup(t), { plan } = h.ready(); h.engine.fault = stage => { if (stage === 'after_intent') throw new Error('crash'); };
  assert.throws(() => h.apply(plan), /crash/);
  const operationId = Object.keys(h.engine.store.read().operations)[0];
  const restarted = new ThreadFold({ directory: path.join(h.dir, 'fold'), hub: new FixtureHub(path.join(h.dir, 'hub')), approval: new FixtureApproval() });
  assert.equal(restarted.recover({ operationId }).status, 'attention'); assert.ok(h.hub.inspect().threads.every(t => !t.archived));
});

test('durable host result survives actual subprocess exit and is reconciled on restart', t => {
  const h = setup(t), { plan } = h.ready();
  const program = `import {ThreadFold} from './src/engine.js'; import {FixtureHub,FixtureApproval} from './src/adapters.js';
    const approval=new FixtureApproval(); const hub=new FixtureHub(${JSON.stringify(path.join(h.dir, 'hub'))},null,{clock:()=>100000});
    const e=new ThreadFold({directory:${JSON.stringify(path.join(h.dir, 'fold'))},hub,approval,clock:()=>100000,fault:stage=>{if(stage==='after_host_apply')process.exit(73)}});
    const plan=e.readPlan({planId:${JSON.stringify(plan.planId)},revision:2}).plan;
    e.apply({planId:plan.planId,revision:2,approvalReceipt:approval.issue(plan,{now:100000}),idempotencyKey:'subprocess'});`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', program], { cwd: root, encoding: 'utf8' });
  assert.equal(child.status, 73, child.stderr); assert.equal(child.stdout, '');
  const operationId = Object.keys(h.engine.store.read().operations)[0];
  assert.equal(h.engine.recover({ operationId }).status, 'applied'); assert.equal(h.hub.inspect().threads[1].stateRevision, 2);
});

for (const change of ['preserve', 'revision', 'owner', 'active']) test(`restore protects subsequent ${change} changes`, t => {
  const h = setup(t), { plan } = h.ready(); const op = h.apply(plan);
  h.hub.edit(s => { const t = s.threads[1]; if (change === 'preserve') t.preserved = true; if (change === 'revision') t.stateRevision++; if (change === 'owner') t.archiveOwner = 'somebody-else'; if (change === 'active') t.activeTurn = true; });
  const restore = h.engine.prepareRestore({ operationId: op.operationId }).plan;
  assert.equal(restore.effects.length, 1); assert.equal(restore.exclusions.length, 1); h.apply(restore);
  assert.equal(h.hub.inspect().threads[1].archived, true);
});

test('restore requires distinct scoped approval and revalidates changes after preview', t => {
  const h = setup(t), { plan } = h.ready(); const receipt = h.approval.issue(plan, { now: 100000 }); const op = h.apply(plan);
  const restore = h.engine.prepareRestore({ operationId: op.operationId }).plan;
  throwsCode(() => h.apply(restore, { approvalReceipt: receipt }), 'APPROVAL_SCOPE_MISMATCH');
  h.hub.edit(s => { s.threads[1].stateRevision++; });
  assert.equal(h.apply(restore).status, 'attention'); assert.ok(h.hub.inspect().threads.slice(1).every(t => t.archived));
});

test('fencing and reservation expiry prevent stale simulated batch', t => {
  const h = setup(t), { plan } = h.ready(); const snapshot = h.engine.store.read().snapshots[plan.snapshotId];
  const first = h.hub.reserve(plan, snapshot, 'one'); const second = h.hub.reserve(plan, snapshot, 'two');
  throwsCode(() => h.hub.apply(first, plan, snapshot, 'one'), 'RESERVATION_STALE');
  h.advance(30001); throwsCode(() => h.hub.apply(second, plan, snapshot, 'two'), 'RESERVATION_STALE');
  assert.ok(h.hub.inspect().threads.every(t => !t.archived));
});

test('durable store commit failure, lock contention, immutable generations, corruption and unsupported versions', t => {
  const h = setup(t); const store = new Store(path.join(h.dir, 'isolated'));
  store.transaction(s => { s.value = 1; });
  const firstFile = path.join(store.directory, '000000000001.json'), first = fs.readFileSync(firstFile, 'utf8');
  store.fault = stage => { if (stage === 'before_commit') throw new Error('disk failure'); };
  assert.throws(() => store.transaction(s => { s.value = 2; }), /disk failure/); assert.equal(store.read().value, 1);
  store.fault = () => {}; store.transaction(s => { s.value = 3; }); assert.equal(fs.readFileSync(firstFile, 'utf8'), first);
  store.transaction(() => { throwsCode(() => new Store(store.directory).transaction(s => { s.value = 4; }), 'STORE_LOCKED'); });
  fs.writeFileSync(firstFile, '{broken'); throwsCode(() => store.read(), 'STORE_CORRUPT');
  const unsupported = JSON.parse(first); unsupported.schemaVersion = 2; fs.writeFileSync(firstFile, JSON.stringify(seal(unsupported))); throwsCode(() => store.read(), 'STORE_VERSION_UNSUPPORTED');
});

test('record storage failure prevents any host effect', t => {
  const h = setup(t); const snapshot = h.inspect().snapshot;
  h.engine.store.fault = stage => { if (stage === 'before_commit') throw new Error('disk full'); };
  assert.throws(() => h.engine.prepare({ snapshotId: snapshot.snapshotId }), /disk full/);
  assert.ok(h.hub.inspect().threads.every(t => !t.archived)); assert.equal(Object.keys(h.engine.store.read().records ?? {}).length, 0);
});

test('graph absence and stale published graph are advisory only', t => {
  const h = setup(t); assert.equal(h.inspect().graph.status, 'unavailable');
  h.engine.graph = new PublishedGraph({ revision: 'g1', observedAt: 0, scopeDigest: 'outdated', edges: [{ inventedAuthority: true }] });
  assert.equal(h.inspect().graph.status, 'stale'); assert.equal(h.ready().plan.effects.length, 2);
  h.engine.graph = new PublishedGraph({ revision: 'g2', observedAt: 100000, scopeDigest: scopeDigest(h.hub.inspect()), edges: [] });
  assert.equal(h.inspect().graph.authority, false);
});

test('context consumption pins digest and applicability, rejects draft, stale, superseded and withdrawn records', t => {
  const h = setup(t); const draft = h.prepare();
  const args = record => ({ recordId: record.recordId, revision: record.revision, expectedDigest: record.digest, projectId: 'fixture-project', branch: 'main' });
  throwsCode(() => h.engine.readRecord(args(draft.record)), 'RECORD_INACTIVE');
  const ready = h.ready(); assert.equal(h.engine.readRecord(args(ready.record)).authority, false);
  throwsCode(() => h.engine.readRecord({ ...args(ready.record), branch: 'other' }), 'APPLICABILITY_MISMATCH');
  throwsCode(() => h.engine.readRecord({ ...args(ready.record), expectedDigest: 'wrong' }), 'DIGEST_MISMATCH');
  h.hub.edit(s => { s.threads[1].sourceText += ' new'; }); throwsCode(() => h.engine.readRecord(args(ready.record)), 'RECORD_STALE');
});

test('production and missing trusted approval fail closed', t => {
  const h = setup(t); const production = new ThreadFold({ directory: path.join(h.dir, 'production') });
  throwsCode(() => production.inspect({ projectId: 'p', runId: 'r' }), 'HUB_UNAVAILABLE');
  throwsCode(() => production.apply({}), 'HOST_ATOMICITY_UNVERIFIED');
  h.engine.approval = null; throwsCode(() => h.engine.apply({}), 'TRUSTED_APPROVAL_UNAVAILABLE');
  assert.equal(new UnavailableHub().capabilities.atomicBatch, false);
});

test('MCP tools validate inputs and expose no approval issuer or signing key parameter', t => {
  const h = setup(t); assert.ok(toolDefinitions.every(t => !t.name.includes('issue') && !JSON.stringify(t.inputSchema).includes('signingKey')));
  throwsCode(() => callTool(h.engine, 'fold_capabilities', { signingKey: 'bad' }), 'INVALID_ARGUMENTS');
  throwsCode(() => callTool(h.engine, 'fold_inspect_scope', { projectId: 'fixture-project', runId: 'fixture-run', cursor: -1 }), 'INVALID_ARGUMENTS');
  const rpc = createRPC(h.engine); assert.equal(rpc({ jsonrpc: '2.0', id: 0, method: 'tools/list' }).error.code, -32002);
  assert.equal(rpc({ jsonrpc: '2.0', id: 1, method: 'initialize' }).result.serverInfo.name, 'threadfold');
  assert.equal(rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal(rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }).result.tools.length, 13);
  assert.equal(rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'nope' } }).result.isError, true);
});

test('CLI and actual stdio MCP use pipes without sockets', t => {
  const h = setup(t); const run = (args, input) => spawnSync(process.execPath, ['bin/threadfold.js', ...args], { cwd: root, input, encoding: 'utf8' });
  const help = run(['help']); assert.equal(help.status, 0, help.stderr); assert.match(help.stdout, /production integration unavailable/);
  const inspect = run(['fold_inspect_scope', '--data', path.join(h.dir, 'cli'), '--fixture', 'fixtures/completed-run.json', '--args', '{"projectId":"fixture-project","runId":"fixture-run"}']);
  assert.equal(inspect.status, 0, inspect.stderr); assert.equal(JSON.parse(inspect.stdout).counts.observed, 3);
  const unavailable = run(['fold_inspect_scope', '--args', '{"projectId":"p","runId":"r"}']); assert.equal(unavailable.status, 1); assert.equal(JSON.parse(unavailable.stderr).code, 'HUB_UNAVAILABLE');
  const messages = [{ jsonrpc: '2.0', id: 1, method: 'initialize' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'fold_capabilities', arguments: {} } }];
  const mcp = run(['mcp'], messages.map(m => JSON.stringify(m)).join('\n') + '\n');
  assert.equal(mcp.status, 0, mcp.stderr); assert.equal(mcp.stderr, ''); const results = mcp.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(results.length, 3); assert.equal(results[1].result.tools.length, 13); assert.equal(JSON.parse(results[2].result.content[0].text).productionIntegration, 'unavailable');
});

test('approval expiry and revocation at actual mutation boundary are rechecked', t => {
  const expired = setup(t), expPlan = expired.ready().plan;
  const expReceipt = expired.approval.issue(expPlan, { now: 100000, ttlMs: 1 });
  expired.hub.faults.beforeApply = () => expired.advance(2);
  const expiredOp = expired.apply(expPlan, { approvalReceipt: expReceipt }); assert.equal(expiredOp.status, 'attention'); assert.equal(expiredOp.lastError, 'APPROVAL_EXPIRED');
  assert.ok(expired.hub.inspect().threads.every(t => !t.archived));
  const revoked = setup(t), plan = revoked.ready().plan, receipt = revoked.approval.issue(plan, { now: 100000 });
  revoked.hub.faults.beforeApply = () => revoked.approval.revoke(receipt.receiptId);
  const op = revoked.apply(plan, { approvalReceipt: receipt }); assert.equal(op.lastError, 'APPROVAL_REVOKED'); assert.ok(revoked.hub.inspect().threads.every(t => !t.archived));
});

test('pinned context selects only applicable claims and rejects foreign claim selection', t => {
  const h = setup(t, s => { s.threads[2].claims[0].applicability.branch = 'other'; });
  const { record } = h.ready(), args = { recordId: record.recordId, revision: 2, expectedDigest: record.digest, projectId: 'fixture-project', branch: 'main' };
  const result = h.engine.readRecord(args); assert.equal(result.selectedClaims.length, 2);
  assert.equal(result.record.sourceManifest.length, 3);
  const foreign = record.sections.validation[0].claimId;
  throwsCode(() => h.engine.readRecord({ ...args, claimIds: [foreign] }), 'APPLICABILITY_MISMATCH');
});

test('restored and superseded records cannot be reused as active context', t => {
  const h = setup(t), ready = h.ready(); const args = { recordId: ready.record.recordId, revision: 2, expectedDigest: ready.record.digest, projectId: 'fixture-project', branch: 'main' };
  const newer = h.engine.revise({ planId: ready.plan.planId, expectedRevision: 2, edits: { coverageReviewed: true } });
  throwsCode(() => h.engine.readRecord(args), 'RECORD_INACTIVE');
  const op = h.apply(newer.plan), restore = h.engine.prepareRestore({ operationId: op.operationId }).plan;
  h.apply(restore);
  throwsCode(() => h.engine.readRecord({ ...args, revision: 3, expectedDigest: newer.record.digest }), 'RECORD_INACTIVE');
});

test('intent persistence failure prevents host reservation and mutations', t => {
  const h = setup(t), { plan } = h.ready();
  h.engine.store.fault = stage => { if (stage === 'before_commit') throw new Error('intent disk failure'); };
  assert.throws(() => h.apply(plan), /intent disk failure/); assert.equal(h.hub.store.read().fence, 0); assert.ok(h.hub.inspect().threads.every(t => !t.archived));
});

test('unknown or mismatched host outcomes never become verified success', t => {
  const h = setup(t), { plan } = h.ready(); h.engine.fault = stage => { if (stage === 'after_intent') throw new Error('interrupt'); };
  assert.throws(() => h.apply(plan), /interrupt/); const operationId = Object.keys(h.engine.store.read().operations)[0];
  h.hub.readOperation = () => ({ operationId, planDigest: 'wrong', itemResults: [] });
  throwsCode(() => h.engine.recover({ operationId }), 'OPERATION_SCOPE_MISMATCH');
  assert.equal(h.engine.getOperation({ operationId }).status, 'applying');
});

test('post-host user changes require reconciliation instead of assuming API success', t => {
  const h = setup(t), { plan } = h.ready();
  h.engine.fault = stage => { if (stage === 'after_host_apply') h.hub.edit(s => { s.threads[1].stateRevision++; }); };
  const op = h.apply(plan); assert.equal(op.status, 'attention'); assert.equal(op.itemResults[0].status, 'reconciliation_required');
  throwsCode(() => h.engine.prepareRestore({ operationId: op.operationId }), 'RESTORE_NOT_READY');
});

test('store checksum and generation gap failures are detected', t => {
  const h = setup(t), store = new Store(path.join(h.dir, 'chain'));
  store.transaction(s => { s.value = 1; }); store.transaction(s => { s.value = 2; });
  const name = path.join(store.directory, '000000000002.json'), original = fs.readFileSync(name, 'utf8');
  const changed = JSON.parse(original); changed.state.value = 100; fs.writeFileSync(name, JSON.stringify(changed)); throwsCode(() => store.read(), 'DIGEST_MISMATCH');
  fs.writeFileSync(name, original); fs.unlinkSync(path.join(store.directory, '000000000001.json')); throwsCode(() => store.read(), 'STORE_CHAIN_BROKEN');
});

test('abrupt exit during store commit retains readable generation and blocks lock stealing', t => {
  const h = setup(t), directory = path.join(h.dir, 'crash-store');
  const program = `import {Store} from './src/store.js'; new Store(${JSON.stringify(directory)},{fault:stage=>{if(stage==='after_commit')process.exit(74)}}).transaction(s=>{s.value=9});`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', program], { cwd: root, encoding: 'utf8' });
  assert.equal(child.status, 74, child.stderr); const store = new Store(directory); assert.equal(store.read().value, 9);
  throwsCode(() => store.transaction(s => { s.value = 10; }), 'STORE_LOCKED');
});

test('packaged launcher starts actual MCP through the configured Node binary', t => {
  const h = setup(t);
  const child = spawnSync('./bin/launch-mcp', [], { cwd: root, env: { ...process.env, CODEX_MCP_NODE_PATH: process.execPath, THREADFOLD_DATA_DIR: path.join(h.dir, 'launch') }, encoding: 'utf8', input: '{"jsonrpc":"2.0","id":1,"method":"initialize"}\n' });
  assert.equal(child.status, 0, child.stderr); assert.equal(JSON.parse(child.stdout).result.serverInfo.name, 'threadfold'); assert.equal(child.stderr, '');
});

test('an unresolved earlier operation blocks overlapping new plans', t => {
  const h = setup(t), first = h.ready().plan;
  h.engine.fault = stage => { if (stage === 'after_intent') throw new Error('interrupt'); };
  assert.throws(() => h.apply(first), /interrupt/); h.engine.fault = () => {};
  const second = h.ready().plan; throwsCode(() => h.apply(second), 'UNRESOLVED_OPERATION');
  assert.ok(h.hub.inspect().threads.every(t => !t.archived));
});

test('installation cache data directories are rejected before writes', () => {
  throwsCode(() => new Store('/example/plugins/cache/threadfold/0.1.0/data'), 'INSTALL_CACHE_DATA_FORBIDDEN');
});

test('unconfigured data paths fail without creating files', t => {
  const h = setup(t), directory = path.join(h.dir, 'unconfigured');
  const engine = new ThreadFold({ directory, writable: false });
  throwsCode(() => engine.prepare({ snapshotId: 'missing' }), 'DATA_DIR_REQUIRED'); assert.equal(fs.existsSync(directory), false);
});

test('plan read reports current operation, stale revision and expiry without mutating immutable plans', t => {
  const h = setup(t), { plan } = h.ready();
  assert.equal(h.engine.readPlan({ planId: plan.planId, revision: 1 }).effectiveStatus, 'stale');
  const original = h.engine.readPlan({ planId: plan.planId, revision: 2 }).plan;
  const op = h.apply(plan); const read = h.engine.readPlan({ planId: plan.planId, revision: 2 });
  assert.equal(read.effectiveStatus, 'applied'); assert.equal(read.operationId, op.operationId); assert.deepEqual(read.plan, original);
  const other = setup(t), later = other.ready().plan; other.advance(3600001);
  assert.equal(other.engine.readPlan({ planId: later.planId, revision: 2 }).effectiveStatus, 'expired');
});

test('cancel unstarted plan preserves revisions, withdraws context and rejects old approvals', t => {
  const h = setup(t), { plan } = h.ready();
  const receipt = h.approval.issue(plan, { now: 100000 });
  throwsCode(() => h.engine.cancelPlan({ planId: plan.planId, revision: 1 }), 'STALE_PLAN');
  const cancelled = callTool(h.engine, 'fold_cancel_plan', { planId: plan.planId, revision: 2 });
  assert.equal(cancelled.effectiveStatus, 'cancelled'); assert.equal(cancelled.recordStatus, 'withdrawn');
  assert.deepEqual(cancelled.plan, plan);
  assert.deepEqual(h.engine.cancelPlan({ planId: plan.planId, revision: 2 }), cancelled);
  throwsCode(() => h.apply(plan, { approvalReceipt: receipt }), 'PLAN_CANCELLED');
  throwsCode(() => h.engine.revise({ planId: plan.planId, expectedRevision: 2, edits: {} }), 'PLAN_CANCELLED');
  assert.ok(h.hub.inspect().threads.every(t => !t.archived));
});

test('explicit cancellation settles interrupted intent and unblocks a newly reviewed plan after restart', t => {
  const h = setup(t), { plan } = h.ready();
  h.engine.fault = stage => { if (stage === 'after_intent') throw new Error('interrupt'); };
  assert.throws(() => h.apply(plan), /interrupt/);
  const operationId = Object.keys(h.engine.store.read().operations)[0];
  assert.equal(h.engine.recover({ operationId }).status, 'attention');
  const restarted = new ThreadFold({ directory: path.join(h.dir, 'fold'), hub: new FixtureHub(path.join(h.dir, 'hub')), approval: new FixtureApproval() });
  const cancelled = callTool(restarted, 'fold_cancel_operation', { operationId });
  assert.equal(cancelled.status, 'cancelled'); assert.ok(cancelled.itemResults.every(i => i.changed === false && i.status === 'cancelled'));
  assert.ok(cancelled.journal.some(e => e.event === 'cancellation_requested'));
  assert.equal(restarted.readPlan({ planId: plan.planId, revision: 2 }).recordStatus, 'withdrawn');
  assert.deepEqual(restarted.cancelOperation({ operationId }), cancelled);
  throwsCode(() => h.hub.reserve(plan, h.engine.store.read().snapshots[plan.snapshotId], operationId), 'OPERATION_ALREADY_SETTLED');
  h.engine.fault = () => {};
  assert.equal(h.apply(plan).status, 'cancelled');
  assert.equal(h.apply(h.ready().plan).status, 'applied');
});

test('cancellation fences a delayed reserved apply without invoking approval or archiving', t => {
  const h = setup(t), { plan } = h.ready(), snapshot = h.engine.store.read().snapshots[plan.snapshotId];
  const reservation = h.hub.reserve(plan, snapshot, 'delayed');
  h.hub.cancelOperation(plan, 'delayed');
  const result = h.hub.apply(reservation, plan, snapshot, 'delayed', () => { assert.fail('cancelled apply must not request approval'); });
  assert.equal(result.cancelled, true); assert.ok(h.hub.inspect().threads.every(t => !t.archived));
});

test('cancellation racing before fixture mutation survives the original apply continuation', t => {
  const h = setup(t), { plan } = h.ready();
  h.hub.faults.beforeApply = () => {
    const operationId = Object.keys(h.engine.store.read().operations)[0];
    assert.equal(h.engine.cancelOperation({ operationId }).status, 'cancelled');
  };
  assert.equal(h.apply(plan).status, 'cancelled');
  assert.ok(h.hub.inspect().threads.every(t => !t.archived));
});

test('cancellation after host commit reconciles real fixture effects and never rolls them back', t => {
  const h = setup(t), { plan } = h.ready();
  const program = `import {ThreadFold} from './src/engine.js'; import {FixtureHub,FixtureApproval} from './src/adapters.js';
    const approval=new FixtureApproval(); const e=new ThreadFold({directory:${JSON.stringify(path.join(h.dir, 'fold'))},hub:new FixtureHub(${JSON.stringify(path.join(h.dir, 'hub'))},null,{clock:()=>100000}),approval,clock:()=>100000,fault:stage=>{if(stage==='after_host_apply')process.exit(75)}});
    const plan=e.readPlan({planId:${JSON.stringify(plan.planId)},revision:2}).plan;
    e.apply({planId:plan.planId,revision:2,approvalReceipt:approval.issue(plan,{now:100000}),idempotencyKey:'cancel-after-commit'});`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', program], { cwd: root, encoding: 'utf8' });
  assert.equal(child.status, 75, child.stderr);
  const operationId = Object.keys(h.engine.store.read().operations)[0];
  assert.equal(h.engine.cancelOperation({ operationId }).status, 'applied');
  assert.ok(h.hub.inspect().threads.slice(1).every(t => t.archived));
  throwsCode(() => h.engine.cancelPlan({ planId: plan.planId, revision: 2 }), 'PLAN_ALREADY_STARTED');
});

test('lost cancellation response recovers its durable no-effect result without a new receipt', t => {
  const h = setup(t), { plan } = h.ready();
  h.engine.fault = stage => { if (stage === 'after_intent') throw new Error('interrupt'); };
  assert.throws(() => h.apply(plan), /interrupt/);
  const operationId = Object.keys(h.engine.store.read().operations)[0], cancel = h.hub.cancelOperation.bind(h.hub);
  h.hub.cancelOperation = (...args) => { cancel(...args); throw new Error('response lost'); };
  assert.throws(() => h.engine.cancelOperation({ operationId }), /response lost/);
  assert.equal(h.engine.recover({ operationId }).status, 'cancelled');
  assert.ok(h.hub.inspect().threads.every(t => !t.archived));
});

test('cancelling a restore preview does not withdraw an active archive record', t => {
  const h = setup(t), { plan } = h.ready(), op = h.apply(plan);
  const restore = h.engine.prepareRestore({ operationId: op.operationId }).plan;
  assert.equal(h.engine.cancelPlan({ planId: restore.planId, revision: 1 }).recordStatus, 'active');
  throwsCode(() => h.apply(restore), 'PLAN_CANCELLED');
});

for (const change of ['run', 'path', 'membership', 'project', 'management']) test(`context reuse rejects changed ${change} identity even with identical source text`, t => {
  const h = setup(t), { record } = h.ready();
  h.hub.edit(s => {
    if (change === 'run') s.runId = 'other-run';
    if (change === 'path') s.canonicalProjectPath = '/different/project';
    if (change === 'membership') s.threads[1].runRefs = [];
    if (change === 'project') s.threads[1].projectId = 'another-project';
    if (change === 'management') s.threads[1].managed = false;
  });
  throwsCode(() => h.engine.readRecord({ recordId: record.recordId, revision: 2, expectedDigest: record.digest, projectId: 'fixture-project', branch: 'main' }), 'RECORD_STALE');
});

test('visible list preview excludes prearchived items and labels unknown counts', t => {
  const h = setup(t, s => { s.threads[1].archived = s.threads[1].hubArchived = true; });
  const { plan } = h.ready();
  assert.equal(plan.observedCount, 3); assert.equal(plan.observedVisibleCount, 2);
  assert.equal(plan.predictedReduction, 1); assert.equal(plan.predictedRemaining, 1); assert.equal(plan.countCompleteness, 'complete');
  const unknown = setup(t, s => { delete s.threads[1].archived; }).ready().plan;
  assert.equal(unknown.observedVisibleCount, null); assert.equal(unknown.predictedRemaining, null);
});

test('malformed result ownership and cancelled-with-effects are never accepted', t => {
  const h = setup(t), { plan } = h.ready(), read = h.hub.readOperation.bind(h.hub);
  h.hub.readOperation = operationId => { const result = read(operationId); if (result) result.itemResults[0].ownerOperationId = 'foreign'; return result; };
  throwsCode(() => h.apply(plan), 'OPERATION_SCOPE_MISMATCH');
  const operationId = Object.keys(h.engine.store.read().operations)[0];
  h.hub.readOperation = opId => ({ ...read(opId), cancelled: true });
  throwsCode(() => h.engine.recover({ operationId }), 'OPERATION_SCOPE_MISMATCH');
  h.hub.readOperation = read;
  assert.equal(h.engine.recover({ operationId }).status, 'applied');
});

test('production cancellation and capability reporting remain unavailable', t => {
  const h = setup(t), engine = new ThreadFold({ directory: path.join(h.dir, 'production') });
  throwsCode(() => callTool(engine, 'fold_cancel_operation', { operationId: 'operation_unknown' }), 'HOST_ATOMICITY_UNVERIFIED');
  assert.equal(engine.capabilities().liveIntegration, false);
  assert.equal(engine.capabilities().capabilities.cancellation, false);
  assert.ok(engine.capabilities().productionBlockers.includes('HOST_ATOMICITY_UNVERIFIED'));
});
