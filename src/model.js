import { createHash, randomUUID } from 'node:crypto';

export class FoldError extends Error {
  constructor(code, message = code) { super(message); this.code = code; }
}
export function demand(ok, code, message) { if (!ok) throw new FoldError(code, message); }
export function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  demand(value && Object.getPrototypeOf(value) === Object.prototype, 'INVALID_JSON');
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
export const clone = value => JSON.parse(canonical(value));
export const id = prefix => `${prefix}_${randomUUID()}`;
export function seal(value) { const { digest: ignored, ...body } = value; return { ...body, digest: digest(body) }; }
export function verify(value) { demand(value && value.digest === seal(value).digest, 'DIGEST_MISMATCH'); return value; }
export const refKey = ref => canonical([ref?.hostId, ref?.threadId]);
export const same = (a, b) => canonical(a) === canonical(b);
export const sections = ['goal', 'decisions', 'constraints', 'changes', 'validation', 'failures', 'unresolved', 'nextActions'];
const str = x => typeof x === 'string' && x.length > 0;
export function validateInventory(s) {
  demand(s && s.schemaVersion === 1 && str(s.hostId) && str(s.canonicalProjectId) && str(s.canonicalProjectPath) && str(s.runId) && str(s.branch), 'INVALID_INVENTORY');
  demand(Array.isArray(s.threads) && Array.isArray(s.runs), 'INVALID_INVENTORY');
  const seen = new Set();
  for (const t of s.threads) {
    demand(t.ref?.hostId === s.hostId && str(t.ref.threadId) && !seen.has(refKey(t.ref)), 'INVALID_THREAD_REF'); seen.add(refKey(t.ref));
    demand(Number.isSafeInteger(t.stateRevision) && t.stateRevision >= 0 && Array.isArray(t.runRefs), 'INVALID_INVENTORY');
    demand(Array.isArray(t.claims), 'INVALID_SOURCE');
    const claims = new Set();
    for (const c of t.claims) {
      demand(str(c.claimId) && !claims.has(c.claimId) && sections.includes(c.section) && str(c.text) && ['observation', 'inference'].includes(c.kind), 'INVALID_CLAIM');
      demand(Array.isArray(c.evidenceRefs) && c.evidenceRefs.length > 0 && c.evidenceRefs.every(e => same(e.threadRef, t.ref) && str(e.turnId)), 'INVALID_PROVENANCE');
      demand(c.applicability && str(c.applicability.projectId) && str(c.applicability.branch) && str(c.applicability.version), 'INVALID_APPLICABILITY');
      claims.add(c.claimId);
    }
  }
  const runs = new Set();
  for (const r of s.runs) { demand(str(r.runId) && !runs.has(r.runId), 'INVALID_RUN'); runs.add(r.runId); }
  return s;
}
export function assess(s, t, { restoring = false } = {}) {
  const reasons = [];
  const protect = code => reasons.push(code);
  let unknown = false;
  if (s.completeness !== 'complete') { protect('INCOMPLETE_SCOPE'); unknown = true; }
  if (t.managed !== true || t.projectId !== s.canonicalProjectId || !t.runRefs.includes(s.runId)) protect('OUT_OF_SCOPE');
  if (t.readable !== true || typeof t.sourceText !== 'string' || !t.sourceText.length || t.claims.length === 0) { protect('SOURCE_UNAVAILABLE'); unknown = true; }
  if (t.referencesComplete !== true || t.effectsKnown !== true || !Array.isArray(t.effectRefs)) { protect('UNKNOWN_EFFECTS_OR_REFERENCES'); unknown = true; }
  for (const flag of ['activeTurn', 'lease', 'pending', 'preserved', 'unmerged']) {
    if (t[flag] !== false) { protect(t[flag] === true ? flag.toUpperCase() : 'UNKNOWN_' + flag.toUpperCase()); if (t[flag] !== true) unknown = true; }
  }
  if (typeof t.archived !== 'boolean' || t.archived !== t.hubArchived) { protect('STATE_DIVERGENCE'); unknown = true; }
  if (!restoring && t.archived === true) protect('ALREADY_ARCHIVED');
  for (const r of t.runRefs) {
    const run = s.runs.find(x => x.runId === r);
    if (!run || run.status !== 'completed' || run.pending !== false) protect('ACTIVE_REFERENCE');
  }
  return { schemaVersion: 1, createdAt: s.observedAt, threadRef: t.ref, runRefs: t.runRefs, stateRevision: t.stateRevision,
    sourceDigest: digest({ sourceText: t.sourceText ?? null, claims: t.claims }), safety: reasons.length ? (unknown ? 'unknown' : 'protected') : 'eligible',
    value: t.representative === true ? 'representative' : 'unique_information', reasonCodes: [...new Set(reasons)],
    evidenceRefs: t.claims.flatMap(c => c.evidenceRefs), observedAt: s.observedAt };
}
export function scopeDigest(s) {
  const { snapshotId, observedAt, createdAt, digest: ignored, ...body } = s;
  return digest(body);
}
export function consolidate(s, recordId, revision, now) {
  const result = { schemaVersion: 1, createdAt: now, recordId, revision, projectId: s.canonicalProjectId, branch: s.branch,
    runId: s.runId, sourceManifest: [], sections: Object.fromEntries(sections.map(k => [k, []])), conflicts: [], coverage: [], uncertainties: [] };
  const decisions = new Map();
  for (const t of s.threads) {
    result.sourceManifest.push({ threadRef: t.ref, stateRevision: t.stateRevision, sourceDigest: digest({ sourceText: t.sourceText ?? null, claims: t.claims }), sourceText: t.sourceText ?? null, claims: t.claims, readable: t.readable === true });
    for (const c of t.claims) {
      const claimId = digest([t.ref, c.claimId]);
      result.sections[c.section].push({ ...c, claimId, originalClaimId: c.claimId, threadRef: t.ref });
      result.coverage.push({ threadRef: t.ref, sourceClaimId: c.claimId, claimId, status: c.section === 'unresolved' ? 'unresolved' : 'preserved' });
      if (c.section === 'decisions' && c.topic) {
        const prior = decisions.get(c.topic) ?? [];
        for (const other of prior) if (other.text !== c.text || !same(other.applicability, c.applicability)) result.conflicts.push({ topic: c.topic, claimIds: [other.claimId, claimId], resolution: 'unresolved' });
        prior.push({ ...c, claimId }); decisions.set(c.topic, prior);
      }
    }
    if (t.readable !== true) result.uncertainties.push({ threadRef: t.ref, reason: 'SOURCE_UNAVAILABLE' });
  }
  const conflictingClaims = new Set(result.conflicts.flatMap(conflict => conflict.claimIds));
  for (const coverage of result.coverage) if (conflictingClaims.has(coverage.claimId)) coverage.status = 'conflict';
  return seal(result);
}
export function makePlan(s, record, { planId = id('plan'), revision = 1, representativeRef = null, excludedRefs = [], coverageReviewed = false, ttlMs = 3600000, now = Date.now() } = {}) {
  const assessments = s.threads.map(t => assess(s, t));
  const blockers = [];
  if (s.completeness !== 'complete') blockers.push('INCOMPLETE_SCOPE');
  if (assessments.some(a => a.reasonCodes.includes('SOURCE_UNAVAILABLE'))) blockers.push('SOURCE_UNAVAILABLE');
  const representatives = s.threads.filter(t => t.representative === true);
  const representative = representativeRef ? s.threads.find(t => same(t.ref, representativeRef)) : representatives.length === 1 ? representatives[0] : null;
  if (!representative || assess(s, representative).safety !== 'eligible') blockers.push('REPRESENTATIVE_REQUIRED');
  const excluded = new Set(excludedRefs.map(refKey));
  demand(excludedRefs.every(r => s.threads.some(t => same(t.ref, r))), 'OUT_OF_SCOPE');
  const effects = []; const exclusions = [];
  for (const [i, t] of s.threads.entries()) {
    const reasons = [...assessments[i].reasonCodes];
    if (representative && same(t.ref, representative.ref)) reasons.push('REPRESENTATIVE');
    if (excluded.has(refKey(t.ref))) reasons.push('USER_EXCLUDED');
    if (reasons.length) { exclusions.push({ threadRef: t.ref, reasonCodes: reasons }); continue; }
    // Only exact self-effects are supported by this conservative local release.
    if (!same(t.effectRefs, [t.ref])) { exclusions.push({ threadRef: t.ref, reasonCodes: ['EFFECT_SCOPE_MISMATCH'] }); continue; }
    effects.push({ threadRef: t.ref, expectedRevision: t.stateRevision, sourceDigest: assessments[i].sourceDigest, beforeArchived: false });
  }
  if (!coverageReviewed) blockers.push('COVERAGE_INCOMPLETE');
  const observedVisibleCount = s.threads.every(t => typeof t.archived === 'boolean') ? s.threads.filter(t => !t.archived).length : null;
  return seal({ schemaVersion: 1, createdAt: now, planId, revision, kind: 'archive', snapshotId: s.snapshotId,
    scopeDigest: scopeDigest(s), recordId: record.recordId, recordRevision: record.revision, recordDigest: record.digest,
    representativeRef: representative?.ref ?? null, excludedRefs, coverageReviewed, effects, exclusions, blockers,
    status: blockers.length ? 'draft' : 'ready_for_review', expiresAt: now + ttlMs,
    predictedReduction: effects.length, observedCount: s.threads.length, observedVisibleCount,
    predictedRemaining: observedVisibleCount === null ? null : observedVisibleCount - effects.length, countCompleteness: s.completeness });
}
