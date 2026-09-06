import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { Store } from './store.js';
import { canonical, clone, digest, id, same, demand, FoldError, validateInventory, assess, scopeDigest } from './model.js';

export class UnavailableHub {
  mode = 'production';
  capabilities = Object.freeze({ inventory: false, atomicBatch: false, trustedApproval: false, knownEffects: false, reconciliation: false, restore: false, cancellation: false, contextConsumption: false });
  inspect() { throw new FoldError('HUB_UNAVAILABLE', 'Production Hub adapter is unavailable; use an explicit fixture for local previews.'); }
  requireMutation() { throw new FoldError('HOST_ATOMICITY_UNVERIFIED', 'Production cleanup/restore, trusted approval and host atomicity are unavailable.'); }
}

// This issuer never accepts a caller-supplied key and is never exposed through MCP.
// It is a fixture simulation, not a production user-confirmation mechanism.
export class FixtureApproval {
  #key = randomBytes(32); #revoked = new Set(); #issuer = id('fixture_issuer');
  mode = 'fixture';
  issue(plan, { now = Date.now(), ttlMs = 60000, actorRef = 'fixture-reviewer' } = {}) {
    const body = { schemaVersion: 1, createdAt: now, receiptId: id('receipt'), issuer: this.#issuer, mode: 'fixture', actorRef,
      operationKind: plan.kind, planDigest: plan.digest, approvedEffects: plan.effects, expiresAt: Math.min(now + ttlMs, plan.expiresAt) };
    return { ...body, signature: this.#sign(body) };
  }
  #sign(body) { return createHmac('sha256', this.#key).update(canonical(body)).digest('hex'); }
  revoke(receiptId) { this.#revoked.add(receiptId); }
  verify(receipt, plan, now) {
    demand(receipt && typeof receipt.signature === 'string' && /^[a-f0-9]{64}$/.test(receipt.signature), 'APPROVAL_INVALID');
    const { signature, ...body } = receipt;
    demand(receipt.issuer === this.#issuer && receipt.mode === 'fixture' && timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(this.#sign(body), 'hex')), 'APPROVAL_INVALID');
    demand(typeof receipt.actorRef === 'string' && receipt.actorRef.length > 0 && !this.#revoked.has(receipt.receiptId), 'APPROVAL_REVOKED');
    demand(Number.isFinite(receipt.expiresAt) && receipt.expiresAt > now && receipt.createdAt <= now, 'APPROVAL_EXPIRED');
    demand(receipt.operationKind === plan.kind && receipt.planDigest === plan.digest && same(receipt.approvedEffects, plan.effects), 'APPROVAL_SCOPE_MISMATCH');
    return true;
  }
}

export class FixtureHub {
  mode = 'fixture';
  capabilities = Object.freeze({ inventory: true, atomicBatch: true, trustedApproval: true, knownEffects: true, reconciliation: true, restore: true, cancellation: true, contextConsumption: true });
  constructor(directory, seed, { clock = Date.now, faults = {} } = {}) {
    this.store = new Store(directory); this.clock = clock; this.faults = faults;
    if (!this.store.read().inventory) {
      demand(seed, 'FIXTURE_REQUIRED'); validateInventory(seed);
      this.store.transaction(s => { s.inventory = clone(seed); s.operations = {}; s.reservations = {}; s.fence = 0; });
    }
  }
  requireMutation() { return true; }
  inspect() { return validateInventory(this.store.read().inventory); }
  // Test/embedding interface only; not registered as a CLI or MCP tool.
  edit(fn) { this.store.transaction(s => { fn(s.inventory); validateInventory(s.inventory); }); }
  reserve(plan, snapshot, operationId) {
    let reservation;
    this.store.transaction(s => {
      demand(!s.operations[operationId], 'OPERATION_ALREADY_SETTLED');
      this.#validate(s.inventory, plan, snapshot);
      reservation = { token: id('reservation'), fence: ++s.fence, operationId, planDigest: plan.digest, expiresAt: this.clock() + 30000 };
      s.reservations[reservation.token] = reservation;
    });
    return reservation;
  }
  #validate(inventory, plan, snapshot) {
    validateInventory(inventory);
    demand(inventory.completeness === 'complete', 'INCOMPLETE_SCOPE');
    demand(plan.expiresAt > this.clock(), 'PLAN_EXPIRED');
    demand(scopeDigest(inventory) === plan.scopeDigest && scopeDigest(snapshot) === plan.scopeDigest, 'SOURCE_CHANGED');
    for (const effect of plan.effects) {
      const t = inventory.threads.find(x => same(x.ref, effect.threadRef));
      demand(t && assess(inventory, t, { restoring: plan.kind === 'restore' }).safety === 'eligible', 'ACTIVE_REFERENCE');
      demand(t.stateRevision === effect.expectedRevision && same(t.effectRefs, [t.ref]), 'EFFECT_SCOPE_MISMATCH');
      if (plan.kind === 'restore') demand(t.archived === true && t.archiveOwner === plan.operationId && t.stateRevision === effect.archivedRevision, 'RESTORE_CHANGED');
      else demand(t.archived === false, 'SOURCE_CHANGED');
    }
  }
  apply(reservation, plan, snapshot, operationId, verifyApproval = null) {
    // Hook runs before taking the simulated host lock, so a resumed Turn must be caught below.
    this.faults.beforeApply?.(this);
    let result;
    this.store.transaction(s => {
      const existing = s.operations[operationId];
      if (existing) { demand(existing.planDigest === plan.digest, 'IDEMPOTENCY_CONFLICT'); result = existing; return; }
      const saved = s.reservations[reservation.token];
      demand(saved && same(saved, reservation) && saved.operationId === operationId && saved.planDigest === plan.digest && saved.fence === s.fence && saved.expiresAt > this.clock(), 'RESERVATION_STALE');
      this.#validate(s.inventory, plan, snapshot);
      demand(typeof verifyApproval === 'function', 'TRUSTED_APPROVAL_UNAVAILABLE');
      verifyApproval();
      const itemResults = [];
      for (const effect of plan.effects) {
        const t = s.inventory.threads.find(x => same(x.ref, effect.threadRef));
        if (this.faults.failThreadIds?.includes(t.ref.threadId)) {
          itemResults.push({ threadRef: t.ref, status: 'failed', changed: false, reason: 'SIMULATED_FAILURE' }); continue;
        }
        t.archived = plan.kind === 'archive'; t.hubArchived = t.archived; t.stateRevision++;
        t.archiveOwner = plan.kind === 'archive' ? operationId : null;
        itemResults.push({ threadRef: t.ref, status: plan.kind === 'archive' ? 'verified_archived' : 'verified_restored', changed: true,
          beforeArchived: effect.beforeArchived, afterArchived: t.archived, afterRevision: t.stateRevision, ownerOperationId: operationId });
      }
      s.inventory.hubRevision++;
      result = { schemaVersion: 1, createdAt: this.clock(), mode: 'fixture', operationId, planDigest: plan.digest, itemResults };
      s.operations[operationId] = result; delete s.reservations[reservation.token];
    });
    if (this.faults.loseResponse) throw new FoldError('RESPONSE_LOST');
    return clone(result);
  }
  readOperation(operationId) { return this.store.read().operations[operationId] ?? null; }
  // Seal a no-effect result under the same lock as apply. A missing result alone
  // is never evidence of cancellation; this tombstone also fences delayed callers.
  cancelOperation(plan, operationId) {
    return this.store.transaction(s => {
      const existing = s.operations[operationId];
      if (existing) { demand(existing.planDigest === plan.digest, 'IDEMPOTENCY_CONFLICT'); return existing; }
      for (const [token, reservation] of Object.entries(s.reservations)) {
        if (reservation.operationId === operationId) {
          demand(reservation.planDigest === plan.digest, 'IDEMPOTENCY_CONFLICT');
          delete s.reservations[token];
        }
      }
      const result = { schemaVersion: 1, createdAt: this.clock(), mode: 'fixture', operationId, planDigest: plan.digest,
        cancelled: true, itemResults: plan.effects.map(e => ({ threadRef: e.threadRef, changed: false, status: 'cancelled' })) };
      s.operations[operationId] = result;
      return result;
    });
  }
}

export class PublishedGraph {
  constructor(revision = null) { this.revision = clone(revision); }
  readPublished(snapshot, now = Date.now()) {
    if (!this.revision) return { status: 'unavailable', mode: 'fixture', edges: [] };
    const r = this.revision;
    if (r.scopeDigest !== scopeDigest(snapshot) || !Number.isFinite(r.observedAt) || now - r.observedAt > 300000 || r.observedAt > now) return { status: 'stale', mode: 'fixture', edges: [] };
    return { status: 'published', mode: 'fixture', revision: r.revision, observedAt: r.observedAt, edges: clone(r.edges ?? []), authority: false };
  }
}
