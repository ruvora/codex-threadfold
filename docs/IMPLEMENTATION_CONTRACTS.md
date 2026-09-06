# Executable local contracts

All persisted domain objects have schemaVersion and createdAt. IDs are opaque local UUIDs; native identity is `{hostId, threadId}`. Canonical JSON rejects non-finite numbers and unsupported values. Digests bind the whole immutable object except its own digest field.

Inventory is one complete fixture Run, with canonical project identity/path, host, branch, explicit Run links, source text and structured claims, state revisions, known native effects and safety flags. Pagination cursors return partial observations that cannot be prepared for application. Unknown flags, missing linked Run state, source access failures, divergent native/Hub archive state and unknown effects protect targets. Original representative is kept unless an explicit new revision selects an eligible replacement. All source claims are retained verbatim with Turn/artifact references and applicability; no AI completeness guarantee is asserted. Coverage review is explicit and applies only to the exact revision.

Plan revisions bind snapshot, record, representative, effects, exclusions, expiry and coverage state. Revision changes invalidate old approval. Receipt binds issuer, actor, operation kind, plan digest, exact effects and expiry; verifier checks revocation and signature. Fixture receipts are useful only with that process's fixture issuer. Production has no issuer. CLI/MCP do not accept signing keys or issue receipts.

Apply requires a complete, reviewed plan, immutable record verification, latest revision, unexpired trusted receipt and all production capabilities (or explicit fixture simulation). Idempotency is local-store-global: same key with different plan/kind is rejected. Existing operations are read/reconciled, never reauthorized to expand effects. Reservation has expiry and monotonically increasing fencing token. Full snapshot is rechecked within the fixture mutation transaction. Successful API response alone is insufficient; authoritative operation results and observed revisions must match.

Restore preparation selects only items verified changed by the specific apply operation and still carrying its ownership and post-state revision. Unreadable, protected, subsequently changed or unowned targets are excluded. Restore plan/approval are distinct. Starting a restore marks the associated consolidation withdrawn conservatively while retaining immutable content and history. Context consumption requires pinned record/revision/digest, project/branch applicability and an active lifecycle.

## Existing Hub evidence (read-only inspection, 2026-09-06)

`../codex-control-plane/src/mcp-server.js:2950` validates registry state, awaits native archive, then updates registry. `src/registry.js:1329` and `:1360` check leases/tasks for archive and restore. Search of JS/TS found no `inspect_cleanup_eligibility`, `prepare_cleanup_batch`, `apply_cleanup_batch`, or `read_cleanup_operation`. This observation does not prove absence from every host or future version. It provides no evidence of atomic exclusion across native Turn starters, signed scoped approvals, or descendant effect enumeration. None is treated as available.

## Draft deviation

Versioned append-only JSON replaces proposed `fold.db` without changing ownership. Structured lossless extraction replaces semantic-model extraction; arbitrary transcripts need structured human extraction and coverage review before production could be enabled. Hub and Graph consumption are fixture demonstrations only. Current production mode returns `HUB_UNAVAILABLE`/capability errors rather than fabricating inventory.

Incomplete local operations also block overlapping new effects. Fixture approval is reverified inside the conditional host mutation transaction. Context output separates scope-applicable selected claims from the full provenance record; explicit foreign-branch claim selection fails closed.

## Continuation additions (2026-09-06)

- `fold_cancel_plan(planId, revision)` requires the latest unstarted plan, records cancellation separately and blocks revision/application with `PLAN_CANCELLED`. Repeated cancellation is semantically idempotent. Archive record lifecycle becomes withdrawn; cancelling an unstarted restore preview leaves that lifecycle alone. Started plans require operation handling (`PLAN_ALREADY_STARTED`).
- `fold_cancel_operation(operationId)` is fixture-only, journaled, and requires the cancellation capability. It grants no new archive/restore effect. `Hub.cancelOperation` holds the same writer lock as apply, returns an existing result or persists `cancelled: true` with every exact effect marked `changed: false, status: cancelled`; it removes matching reservations and rejects future reservations for that operation. Delayed apply returns the tombstone. Fold validates the scope and contradictory item outcomes before accepting `cancelled`. Null result still means `attention`. Applied/partial results remain unchanged; restore requires separate approval. A cancelled archive operation withdraws its record. A restore that already started remains withdrawn even if cancellation later confirms no restore effects.
- Successful changed-item results must bind operation ownership, expected prior archive state and a newer integer revision before current host state can confirm them. This strengthens restore provenance; API status text alone is insufficient.
- Context freshness includes original host/path/Run and source-thread project, managed status and Run membership. Identity is recovered from the persisted archive snapshot to support existing immutable records.
- `observedVisibleCount` and `predictedRemaining` are null when any observed archive flag is unknown. Otherwise they exclude archived entries. `countCompleteness` prevents treating a partial-page count as a project total. `observedCount` retains its original all-entry meaning.

The [read-only Hub integration review](HUB_INTEGRATION.md) supersedes the earlier line-number summary above and states the minimum operational contracts. Official structural validation passed later with a dependency-complete venv; that does not enable production capabilities.
