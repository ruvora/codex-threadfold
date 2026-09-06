import { Store } from './store.js';
import { FixtureHub, FixtureApproval, UnavailableHub, PublishedGraph } from './adapters.js';
import { clone, demand, id, seal, verify, same, digest, scopeDigest, validateInventory, assess, consolidate, makePlan } from './model.js';

function tables(s) { for (const k of ['snapshots', 'records', 'plans', 'latest', 'operations', 'keys', 'lifecycle', 'cancellations']) s[k] ??= {}; return s; }
function key(planId, revision) { demand(typeof planId === 'string' && /^[a-z]+_[a-z0-9-]+$/.test(planId) && Number.isSafeInteger(revision) && revision > 0, 'INVALID_ID'); return `${planId}:${revision}`; }
function getPlan(s, planId, revision) { const p = s.plans?.[key(planId, revision)]; demand(p, 'PLAN_NOT_FOUND'); return verify(p); }
function getRecord(s, recordId, revision) { const r = s.records?.[key(recordId, revision)]; demand(r, 'RECORD_NOT_FOUND'); return verify(r); }

export class ThreadFold {
  constructor({ directory, hub = new UnavailableHub(), approval = null, graph = new PublishedGraph(), clock = Date.now, fault = () => {}, writable = true }) {
    this.store = new Store(directory, { writable }); this.hub = hub; this.approval = approval; this.graph = graph; this.clock = clock; this.fault = fault;
  }
  capabilities() { return { mode: this.hub.mode, capabilities: this.hub.capabilities, productionIntegration: 'unavailable', liveIntegration: false, approvalIssuerExposed: false,
    productionBlockers: ['AUTHORITATIVE_INVENTORY_UNAVAILABLE', 'HOST_ATOMICITY_UNVERIFIED', 'TRUSTED_APPROVAL_UNAVAILABLE', 'DURABLE_OPERATION_CONTRACT_UNAVAILABLE', 'CONTEXT_CONSUMPTION_UNVERIFIED'],
    nextStep: 'Review docs/HUB_INTEGRATION.md. Use an explicitly configured fixture for local simulation; no production adapter is shipped.' }; }
  inspect({ projectId, runId, cursor = 0, limit = 1000 }) {
    demand(typeof projectId === 'string' && typeof runId === 'string', 'INVALID_SCOPE');
    demand(Number.isSafeInteger(cursor) && cursor >= 0 && Number.isSafeInteger(limit) && limit >= 1 && limit <= 1000, 'INVALID_CURSOR');
    const s = this.hub.inspect();
    demand(s.canonicalProjectId === projectId && s.runId === runId, 'OUT_OF_SCOPE');
    const all = s.threads; demand(cursor <= all.length, 'INVALID_CURSOR');
    s.threads = all.slice(cursor, cursor + limit);
    if (cursor !== 0 || cursor + limit < all.length) s.completeness = 'partial';
    const now = this.clock(); const snapshot = seal({ ...s, schemaVersion: 1, createdAt: now, observedAt: now, snapshotId: id('snapshot') });
    this.store.transaction(raw => { tables(raw).snapshots[snapshot.snapshotId] = snapshot; });
    const assessments = snapshot.threads.map(t => assess(snapshot, t));
    return { mode: this.hub.mode, snapshot, assessments, counts: { observed: assessments.length, eligible: assessments.filter(a => a.safety === 'eligible').length, protected: assessments.filter(a => a.safety === 'protected').length, unknown: assessments.filter(a => a.safety === 'unknown').length, completeness: snapshot.completeness }, nextCursor: cursor + limit < all.length ? cursor + limit : null, graph: this.graph.readPublished(snapshot, now) };
  }
  prepare({ snapshotId, representativeRef = null }) {
    return this.store.transaction(raw => {
      const s = tables(raw); const snapshot = s.snapshots[snapshotId]; demand(snapshot, 'SNAPSHOT_NOT_FOUND'); verify(snapshot);
      const record = consolidate(snapshot, id('record'), 1, this.clock());
      const plan = makePlan(snapshot, record, { representativeRef, now: this.clock() });
      s.records[key(record.recordId, 1)] = record; s.lifecycle[key(record.recordId, 1)] = 'draft';
      s.plans[key(plan.planId, 1)] = plan; s.latest[plan.planId] = 1;
      return { plan, record };
    });
  }
  readPlan({ planId, revision }) {
    const s = this.store.read(); const plan = getPlan(s, planId, revision); const record = getRecord(s, plan.recordId, plan.recordRevision);
    demand(record.digest === plan.recordDigest, 'DIGEST_MISMATCH');
    const operation = Object.values(s.operations ?? {}).find(o => o.planId === planId && o.revision === revision);
    const effectiveStatus = operation?.status ?? (s.cancellations?.[planId] ? 'cancelled' : s.latest[planId] !== revision ? 'stale' : plan.expiresAt <= this.clock() ? 'expired' : plan.status);
    return { plan, record, recordStatus: s.lifecycle[key(record.recordId, record.revision)], currentRevision: s.latest[planId], effectiveStatus, operationId: operation?.operationId ?? null };
  }
  revise({ planId, expectedRevision, edits }) {
    demand(edits && Object.keys(edits).every(k => ['representativeRef', 'excludedRefs', 'coverageReviewed'].includes(k)), 'INVALID_EDITS');
    if ('coverageReviewed' in edits) demand(typeof edits.coverageReviewed === 'boolean', 'INVALID_EDITS');
    if ('excludedRefs' in edits) demand(Array.isArray(edits.excludedRefs), 'INVALID_EDITS');
    return this.store.transaction(raw => {
      const s = tables(raw), previous = getPlan(s, planId, expectedRevision);
      demand(previous.kind === 'archive' && s.latest[planId] === expectedRevision, 'STALE_PLAN');
      demand(!s.cancellations[planId], 'PLAN_CANCELLED');
      demand(!Object.values(s.operations).some(o => o.planId === planId), 'PLAN_ALREADY_STARTED');
      const snapshot = verify(s.snapshots[previous.snapshotId]);
      const revision = expectedRevision + 1;
      const record = consolidate(snapshot, previous.recordId, revision, this.clock());
      const plan = makePlan(snapshot, record, { planId, revision, representativeRef: edits.representativeRef ?? previous.representativeRef,
        excludedRefs: edits.excludedRefs ?? previous.excludedRefs, coverageReviewed: edits.coverageReviewed ?? false, now: this.clock() });
      s.lifecycle[key(previous.recordId, previous.recordRevision)] = 'superseded';
      s.records[key(record.recordId, revision)] = record; s.lifecycle[key(record.recordId, revision)] = plan.status === 'ready_for_review' ? 'active' : 'draft';
      s.plans[key(planId, revision)] = plan; s.latest[planId] = revision;
      return { plan, record };
    });
  }
  #mutationGate() {
    this.hub.requireMutation();
    demand(this.hub instanceof FixtureHub && this.approval instanceof FixtureApproval, 'TRUSTED_APPROVAL_UNAVAILABLE');
    for (const c of ['atomicBatch', 'knownEffects', 'reconciliation', 'restore']) demand(this.hub.capabilities[c] === true, 'HOST_ATOMICITY_UNVERIFIED');
  }
  cancelPlan({ planId, revision }) {
    this.store.transaction(raw => {
      const s = tables(raw), plan = getPlan(s, planId, revision);
      demand(s.latest[planId] === revision, 'STALE_PLAN');
      demand(!Object.values(s.operations).some(o => o.planId === planId), 'PLAN_ALREADY_STARTED');
      if (s.cancellations[planId]) return;
      s.cancellations[planId] = { schemaVersion: 1, createdAt: this.clock(), planDigest: plan.digest };
      if (plan.kind === 'archive') s.lifecycle[key(plan.recordId, plan.recordRevision)] = 'withdrawn';
    });
    return this.readPlan({ planId, revision });
  }
  cancelOperation({ operationId }) {
    this.#mutationGate();
    demand(this.hub.capabilities.cancellation === true && typeof this.hub.cancelOperation === 'function', 'CANCELLATION_UNAVAILABLE');
    const operation = this.getOperation({ operationId });
    if (['applied', 'partial', 'failed', 'cancelled'].includes(operation.status)) return operation;
    const plan = getPlan(this.store.read(), operation.planId, operation.revision);
    this.#update(operationId, o => { o.journal.push({ at: this.clock(), event: 'cancellation_requested' }); });
    this.hub.cancelOperation(plan, operationId);
    return this.recover({ operationId });
  }
  apply({ planId, revision, approvalReceipt, idempotencyKey }) {
    this.#mutationGate();
    demand(typeof idempotencyKey === 'string' && idempotencyKey.length > 0 && idempotencyKey.length <= 200, 'INVALID_IDEMPOTENCY_KEY');
    let pending;
    const initial = this.store.read(); const plan = getPlan(initial, planId, revision);
    const keyHash = digest(idempotencyKey), binding = digest({ planDigest: plan.digest, kind: plan.kind });
    const prior = initial.keys?.[keyHash];
    if (prior) { demand(prior.binding === binding, 'IDEMPOTENCY_CONFLICT'); return this.recover({ operationId: prior.operationId }); }
    const record = getRecord(initial, plan.recordId, plan.recordRevision);
    demand(record.digest === plan.recordDigest, 'DIGEST_MISMATCH');
    demand(initial.latest[planId] === revision, 'STALE_PLAN');
    demand(!initial.cancellations?.[planId], 'PLAN_CANCELLED');
    demand(plan.expiresAt > this.clock(), 'PLAN_EXPIRED');
    demand(plan.status === 'ready_for_review' && plan.blockers.length === 0, 'PLAN_NOT_READY');
    demand(plan.effects.length > 0, 'NO_EFFECTS');
    if (plan.kind === 'archive') demand(initial.lifecycle[key(record.recordId, record.revision)] === 'active', 'RECORD_INACTIVE');
    this.approval.verify(approvalReceipt, plan, this.clock());
    const snapshot = verify(initial.snapshots[plan.snapshotId]);
    this.store.transaction(raw => {
      const s = tables(raw);
      demand(s.latest[planId] === revision && !Object.values(s.operations).some(o => o.planId === planId), 'PLAN_ALREADY_STARTED');
      demand(!s.cancellations[planId], 'PLAN_CANCELLED');
      demand(!s.keys[keyHash], 'IDEMPOTENCY_CONFLICT');
      demand(!Object.values(s.operations).some(o => ['applying', 'attention'].includes(o.status) && o.itemResults.some(i => plan.effects.some(e => same(e.threadRef, i.threadRef)))), 'UNRESOLVED_OPERATION');
      pending = { schemaVersion: 1, createdAt: this.clock(), operationId: id('operation'), kind: plan.kind, planId, revision, planDigest: plan.digest,
        idempotencyKey, mode: 'fixture', status: 'applying', approvalReceipt: clone(approvalReceipt),
        itemResults: plan.effects.map(e => ({ threadRef: e.threadRef, status: 'pending', changed: false })), journal: [{ at: this.clock(), event: 'intent' }] };
      if (plan.kind === 'restore') s.lifecycle[key(plan.recordId, plan.recordRevision)] = 'withdrawn';
      s.keys[keyHash] = { binding, operationId: pending.operationId }; s.operations[pending.operationId] = pending;
    });
    this.fault('after_intent');
    try {
      const reservation = this.hub.reserve(plan, snapshot, pending.operationId);
      this.#update(pending.operationId, o => { o.reservation = reservation; o.itemResults.forEach(i => { i.status = 'reserved'; }); o.journal.push({ at: this.clock(), event: 'reserved' }); });
      this.approval.verify(approvalReceipt, plan, this.clock());
      this.#update(pending.operationId, o => { o.itemResults.forEach(i => { i.status = plan.kind + '_requested'; }); o.journal.push({ at: this.clock(), event: plan.kind + '_requested' }); });
      this.hub.apply(reservation, plan, snapshot, pending.operationId, () => this.approval.verify(approvalReceipt, plan, this.clock()));
      this.fault('after_host_apply');
    } catch (e) {
      this.#update(pending.operationId, o => { o.status = 'attention'; o.lastError = e.code ?? 'OPERATION_FAILED'; o.journal.push({ at: this.clock(), event: 'attention', code: o.lastError }); });
    }
    return this.recover({ operationId: pending.operationId });
  }
  #update(operationId, fn) { return this.store.transaction(raw => { const o = tables(raw).operations[operationId]; demand(o, 'OPERATION_NOT_FOUND'); fn(o); return o; }); }
  getOperation({ operationId }) { const o = this.store.read().operations?.[operationId]; demand(o, 'OPERATION_NOT_FOUND'); return o; }
  recover({ operationId }) {
    const o = this.getOperation({ operationId });
    if (['applied', 'partial', 'failed', 'cancelled'].includes(o.status)) return o;
    this.#mutationGate();
    const result = this.hub.readOperation(operationId);
    if (!result) return this.#update(operationId, x => { x.status = 'attention'; x.itemResults.forEach(i => { i.status = 'reconciliation_required'; }); });
    const s = this.store.read(), plan = getPlan(s, o.planId, o.revision);
    demand(result.planDigest === plan.digest && result.operationId === operationId && result.itemResults.length === plan.effects.length, 'OPERATION_SCOPE_MISMATCH');
    const current = this.hub.inspect();
    const seen = new Set();
    const items = result.itemResults.map(item => {
      const effect = plan.effects.find(e => same(e.threadRef, item.threadRef));
      demand(effect && !seen.has(digest(item.threadRef)), 'OPERATION_SCOPE_MISMATCH'); seen.add(digest(item.threadRef));
      demand(typeof item.changed === 'boolean', 'OPERATION_SCOPE_MISMATCH');
      if (result.cancelled === true) {
        demand(item.changed === false && item.status === 'cancelled', 'OPERATION_SCOPE_MISMATCH');
        return { ...item, status: 'cancelled' };
      }
      if (!item.changed) return { ...item, status: 'failed' };
      demand(item.beforeArchived === effect.beforeArchived && Number.isSafeInteger(item.afterRevision) && item.afterRevision > effect.expectedRevision
        && item.ownerOperationId === operationId, 'OPERATION_SCOPE_MISMATCH');
      const t = current.threads.find(t => same(t.ref, item.threadRef));
      if (!t || t.stateRevision !== item.afterRevision || t.archived !== item.afterArchived || t.hubArchived !== item.afterArchived || item.afterArchived !== (plan.kind === 'archive') || (plan.kind === 'archive' && t.archiveOwner !== operationId)) return { ...item, status: 'reconciliation_required' };
      return { ...item, status: plan.kind === 'archive' ? 'verified_archived' : 'verified_restored' };
    });
    return this.store.transaction(raw => {
      const st = tables(raw), target = st.operations[operationId];
      target.itemResults = items;
      const verified = items.filter(i => i.status.startsWith('verified_')).length;
      target.status = result.cancelled === true ? 'cancelled' : items.some(i => i.status === 'reconciliation_required') ? 'attention' : verified === items.length ? 'applied' : verified > 0 ? 'partial' : 'failed';
      target.journal.push({ at: this.clock(), event: 'reconciled', status: target.status });
      if (target.status === 'cancelled' && plan.kind === 'archive') st.lifecycle[key(plan.recordId, plan.recordRevision)] = 'withdrawn';
      if (plan.kind === 'restore' && verified > 0) st.lifecycle[key(plan.recordId, plan.recordRevision)] = 'withdrawn';
      return target;
    });
  }
  prepareRestore({ operationId }) {
    const operation = this.getOperation({ operationId });
    demand(operation.kind === 'archive' && ['applied', 'partial'].includes(operation.status), 'RESTORE_NOT_READY');
    const s = this.store.read(), original = getPlan(s, operation.planId, operation.revision);
    const current = validateInventory(this.hub.inspect()), now = this.clock();
    const snapshot = seal({ ...current, schemaVersion: 1, createdAt: now, observedAt: now, snapshotId: id('snapshot') });
    const effects = [], exclusions = [];
    for (const item of operation.itemResults) {
      if (item.status !== 'verified_archived' || item.changed !== true || item.beforeArchived !== false) continue;
      const t = current.threads.find(t => same(t.ref, item.threadRef));
      if (!t || assess(current, t, { restoring: true }).safety !== 'eligible' || t.archived !== true || t.archiveOwner !== operationId || t.stateRevision !== item.afterRevision || !same(t.effectRefs, [t.ref])) {
        exclusions.push({ threadRef: item.threadRef, reasonCodes: ['RESTORE_CHANGED_OR_PROTECTED'] }); continue;
      }
      effects.push({ threadRef: t.ref, expectedRevision: t.stateRevision, archivedRevision: item.afterRevision, beforeArchived: true });
    }
    const plan = seal({ schemaVersion: 1, createdAt: now, planId: id('restore'), revision: 1, kind: 'restore', operationId,
      snapshotId: snapshot.snapshotId, scopeDigest: scopeDigest(snapshot), recordId: original.recordId, recordRevision: original.recordRevision, recordDigest: original.recordDigest,
      effects, exclusions, blockers: current.completeness === 'complete' ? [] : ['INCOMPLETE_SCOPE'], status: current.completeness === 'complete' ? 'ready_for_review' : 'draft', expiresAt: now + 3600000 });
    this.store.transaction(raw => { const st = tables(raw); st.snapshots[snapshot.snapshotId] = snapshot; st.plans[key(plan.planId, 1)] = plan; st.latest[plan.planId] = 1; });
    return { plan };
  }
  readRecord({ recordId, revision, expectedDigest, projectId, branch, claimIds = null }) {
    const s = this.store.read(), record = getRecord(s, recordId, revision);
    demand(record.digest === expectedDigest, 'DIGEST_MISMATCH');
    demand(record.projectId === projectId && record.branch === branch, 'APPLICABILITY_MISMATCH');
    demand(s.lifecycle[key(recordId, revision)] === 'active', 'RECORD_INACTIVE');
    const inventory = validateInventory(this.hub.inspect());
    const sourcePlan = Object.values(s.plans).find(p => p.kind === 'archive' && p.recordId === recordId && p.recordRevision === revision);
    demand(sourcePlan, 'RECORD_STALE'); verify(sourcePlan);
    const sourceSnapshot = verify(s.snapshots[sourcePlan.snapshotId]);
    demand(inventory.completeness === 'complete' && inventory.canonicalProjectId === projectId && inventory.branch === branch && inventory.runId === record.runId
      && inventory.hostId === sourceSnapshot.hostId && inventory.canonicalProjectPath === sourceSnapshot.canonicalProjectPath, 'RECORD_STALE');
    for (const source of record.sourceManifest) {
      const t = inventory.threads.find(t => same(t.ref, source.threadRef));
      demand(t && t.readable === true && t.managed === true && t.projectId === projectId && t.runRefs.includes(record.runId)
        && digest({ sourceText: t.sourceText ?? null, claims: t.claims }) === source.sourceDigest, 'RECORD_STALE');
    }
    const allClaims = Object.values(record.sections).flat();
    const selectedClaims = claimIds === null ? allClaims.filter(c => c.applicability.projectId === projectId && c.applicability.branch === branch) : claimIds.map(claimId => {
      const c = allClaims.find(c => c.claimId === claimId);
      demand(c && c.applicability.projectId === projectId && c.applicability.branch === branch, 'APPLICABILITY_MISMATCH');
      return c;
    });
    return { mode: this.hub.mode, recordId, revision, digest: record.digest, selectedClaims, record, authority: false };
  }
}
