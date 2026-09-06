# ThreadFold local architecture

The drafts in `docs/source/` are preserved historical requirements, not implementation claims.
This implementation owns only Fold data. Hub owns Runs, leases and native thread state.

## Modules and boundaries

- `store.js`: version 1 append-only, checksum-chained full-state generations; exclusive writer lock, fsync, atomic hard-link publication. No SQLite dependency. Immutable previous generations retain plans, source snapshots, records and journal history.
- `model.js`: canonical hashing, strict JSON validation, conservative two-axis classification, lossless structured-claim consolidation. No semantic model or title-based matching.
- `engine.js`: persisted inventory, immutable record/plan revisions, coverage review, explicit approval checks, write-ahead operation intents, reconciliation and separately approved restore.
- `adapters.js`: durable fixture Hub with synchronized conditional batch operations, private in-memory fixture approval issuer, optional published Graph reader, unavailable production boundary.
- `tools.js`, `bin/threadfold.js`: shared validated tool interface, CLI and newline-delimited stdio MCP. No listeners, network clients, messages or native archive calls.

## Trust

Only host-provided authoritative inventory could establish production eligibility. Imported fixture data is untrusted simulation input and never enables production. Approval signing material is generated privately in the fixture issuer, never accepted through CLI/MCP, and never returned. Review text and coverage acknowledgements do not authorize mutation. There is no production approval issuer or production mutation implementation in this release.

## Storage

An explicit `--data` directory or `THREADFOLD_DATA_DIR` is required for writes. Operators should choose a private persistent location outside plugin caches. Tests and examples use project-local `.threadfold/` only. No automatic installation/cache writes. A generation is written to a unique temporary file, synced, hard-linked to its exclusive numbered committed name, then the directory is synced. Full history is verified on every read. Unsupported versions, checksum failures, gaps and writer locks fail closed. This is single-machine POSIX storage, not an adversarial tamper-proof database: a privileged writer can rewrite all checksums or roll back the entire directory. Large histories need a future audited compaction design. No destructive migration or automatic lock stealing.

## Operation safety

Fold and fixture Hub have separate durable stores. Fold commits an intent before asking the Hub to reserve/apply. Hub validates the full source snapshot, exact effects, safety and reservation fence under its writer lock, then atomically records simulated results and simulated state. Fold reconciles using the stable operation ID. Unknown results remain attention/reconciliation-required; they are not replayed blindly or automatically rolled back. Restore binds verified changed items and their post-archive revisions and owner operation.

Real host atomicity cannot be established by a query followed by archive. Production remains disabled until a trusted Hub boundary can demonstrate equivalent exclusion against all Turn starters.

## Continuation: cancellation and scope integrity

Unstarted plan cancellation is a separate local `cancellations` table entry and lifecycle withdrawal; immutable plans/records and schema-1 generations remain unchanged. The table is initialized lazily for existing data. Started operation cancellation persists journal intent, then uses the fixture Hub's existing store lock to publish a no-effect terminal result or read already committed effects. A cancellation tombstone rejects new reservations and makes delayed apply return the same result. Response loss remains recoverable through the existing operation reader. A missing result remains unknown. Production has no equivalent adapter contract; see [Hub evidence and minimum contracts](HUB_INTEGRATION.md).

Context selection resolves the original archive plan's source snapshot to check host, canonical path, Run and per-thread membership. This uses existing persisted provenance, so old records do not need a rewritten digest. Preview counts separately track observed entries and known visible entries. The original storage, approval, consolidation and fixture code remains the implementation foundation.
