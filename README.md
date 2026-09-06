# RUVORA ThreadFold

ThreadFold is a standalone, dependency-free Node.js plugin for evidence-preserving consolidation previews. It implements immutable local records, conservative plans, scoped approval verification and durable operation recovery. **Production Hub integration is unavailable.** Archive/restore, trusted confirmation and downstream Hub/Graph use are executable fixture simulations only.

No installation, marketplace registration, thread messages, real archive/restore or publication was performed. The source drafts in `docs/source/` remain historical requirements.

## Setup

Requires Node.js 22 or newer. No npm install, network connection, browser or listening socket is needed. From this directory:

```sh
/Users/sin-yebin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node bin/threadfold.js help
/Users/sin-yebin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test
/Users/sin-yebin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/validate-package.js
```

Use `node` on other machines where it is on PATH. Set `CODEX_MCP_NODE_PATH` to an absolute Node executable for the packaged launcher when needed. Plugin metadata is in `.codex-plugin/plugin.json`; `.mcp.json` launches `bin/launch-mcp` in production-disabled mode by default. Loading the plugin in a real host has not been verified or performed.

All writes require an explicitly selected persistent data location for fixture use. Pass `--data DIRECTORY` or set `THREADFOLD_DATA_DIR`. Keep it outside plugin installation/cache directories. Example and test data below stay in ignored `.threadfold/` inside this project. The store rejects known `/plugins/cache/` data paths. Do not relocate data into another plugin cache; operators remain responsible for custom cache layouts and symlinks. Archive never deletes source text, worktrees, artifacts or records.

## Safe preview

Without an explicit fixture the capability tool reports production unavailable, and inspection/application fails closed:

```sh
node bin/threadfold.js fold_capabilities
node bin/threadfold.js fold_inspect_scope --data .threadfold/preview --fixture fixtures/completed-run.json --args '{"projectId":"fixture-project","runId":"fixture-run"}'
```

Copy the returned snapshot ID into the next command:

```sh
node bin/threadfold.js fold_prepare_plan --data .threadfold/preview --fixture fixtures/completed-run.json --args '{"snapshotId":"snapshot_REPLACE"}'
node bin/threadfold.js fold_read_plan --data .threadfold/preview --fixture fixtures/completed-run.json --args '{"planId":"plan_REPLACE","revision":1}'
node bin/threadfold.js fold_revise_plan --data .threadfold/preview --fixture fixtures/completed-run.json --args '{"planId":"plan_REPLACE","expectedRevision":1,"edits":{"coverageReviewed":true}}'
```

`REPLACE` denotes an actual returned ID, not an executable fixture value. Revisions preserve earlier records and invalidate prior approvals. Review the full source manifest, all eight sections, conflicts, applicability, exclusions and expected effects. `coverageReviewed` only records review of structured claims; it is not trusted approval and does not establish semantic completeness for arbitrary transcripts.

Each `--data` location keeps its own fixture Hub state. The fixture file seeds only an empty store; later commands use the persisted state. It is never treated as authoritative production inventory. Partial pagination is explicitly labeled and cannot yield an applicable plan. Targets with active/shared Run references, missing safety facts or unknown effects are protected. Descendant effects are conservatively excluded in this release.

## Explicit fixture demonstration

This command automatically simulates a fixture reviewer, two archive effects, reconciliation, a separate restore approval and two restore effects. It never touches real user threads:

```sh
node bin/threadfold.js demo --data .threadfold/demo --fixture fixtures/completed-run.json
```

Its output includes `mode: "fixture"` and `liveIntegration: false`. It demonstrates local algorithm behavior, not real user consent or host atomicity. Fixture approval keys are randomly generated in private process memory. They are not accepted from arguments, environment variables or MCP. Receipt issuance exists only as an imported fixture helper and the explicit local demo; no MCP issuance tool exists. Receipts from a terminated fixture issuer cannot authorize new effects after restart. Existing operations can still be reconciled by operation ID.

## CLI and MCP tools

Every tool name below is also a CLI command with `--args` JSON:

| Tool | Behavior |
| --- | --- |
| `fold_capabilities` | Read capability and simulation status |
| `fold_inspect_scope` | Observe scope, persist a local snapshot, return page/assessment counts |
| `fold_prepare_plan` | Persist draft plan and immutable record |
| `fold_read_plan` | Read exact revision, provenance and lifecycle |
| `fold_revise_plan` | New revision; choose representative, exclude targets, acknowledge coverage |
| `fold_cancel_plan` | Cancel an unstarted local plan; retain immutable history and invalidate application |
| `fold_apply_plan` | Verify exact archive plan and receipt; production disabled |
| `fold_get_operation` | Read historical per-item results |
| `fold_recover_operation` | Reconcile known results, never blindly replay unknown effects |
| `fold_cancel_operation` | Fixture only: durably fence pending effects or report already committed results |
| `fold_prepare_restore` | Preview only verified changes owned by this operation |
| `fold_apply_restore` | Separate restore kind, plan and approval required |
| `fold_read_record` | Select digest-pinned, applicable claims from an active, source-current record |

MCP uses newline-delimited JSON-RPC over stdin/stdout with protocol version `2024-11-05`, initialization, tool listing and tool calls. Diagnostics go to stderr. Requests are limited to 1 MiB. No listener, daemon or network transport is used:

```sh
node bin/threadfold.js mcp
# Operator-configured fixture server:
node bin/threadfold.js mcp --data .threadfold/mcp --fixture fixtures/completed-run.json
```

The CLI and MCP validate inputs and reject undeclared key/authority fields. Tool text, imported graph edges and source claims cannot grant execution authority. The included `.d.ts` defines adapter boundaries; runtime guards enforce the used data and workflow contracts. There is no bundled TypeScript compiler or claim of compiler validation.

## Durability and recovery

`DATA/fold/` and `DATA/fixture-hub/` contain separate version-1 stores. Numbered JSON generations are immutable, SHA-256 chained and fsynced before atomic publication. Every read validates the complete chain; future/unknown schema versions, corruption, missing generations and lock contention fail closed. Full generations trade space and read cost for simple auditability. No destructive migration, compaction or deletion is performed. Back up complete directories while writers are stopped; no encryption or malicious-owner tamper resistance is claimed.

Fold commits journal intent before any adapter call. The fixture host conditionally validates state, approval, effect set and fence inside its writer transaction. Response loss is reconciled by stable operation ID and actual per-item state. Partial results remain partial; successful items are not rolled back automatically. Restore protects subsequent revisions, user preservation, active references and archive ownership. Starting a restore conservatively withdraws its record from context reuse, even if later recovery needs attention.

```sh
node bin/threadfold.js fold_get_operation --data .threadfold/demo --args '{"operationId":"operation_REPLACE"}'
node bin/threadfold.js fold_recover_operation --data .threadfold/demo --fixture fixtures/completed-run.json --args '{"operationId":"operation_REPLACE"}'
```

`attention` means unresolved, not success. Overlapping new operations are blocked while an earlier operation is applying or needs attention. Unknown host outcomes are not retried. A process killed during a store write can leave `writer.lock`; reads still verify committed generations, while new writes return `STORE_LOCKED`. Stop all writers, back up the directory, inspect the recorded PID and confirm it is no longer live before an operator removes only that stale lock. No automatic lock stealing or operator-unlock tool is exposed to models. Uncommitted `.pending_*` files are ignored and should only be removed during the same offline maintenance. This manual lock recovery and append-only growth remain operational limitations.

To abandon an unstarted plan, use `fold_cancel_plan` with its exact `planId` and latest `revision`. Its immutable content stays readable with `effectiveStatus: cancelled`; an archive record is withdrawn from context selection. Cancelling an unstarted restore preview does not withdraw the archive record. For a started fixture operation, use `fold_cancel_operation` with `operationId`. The fixture Hub checks under its apply lock: it returns any committed result, or durably records a no-effect cancellation and fences delayed requests. Only that authoritative result permits `cancelled` and releases overlap protection. An absent operation result alone remains `attention`. Cancellation never unarchives committed effects; use a separately reviewed restore plan. A new attempt requires a new snapshot, plan and approval, with a new idempotency key. No automatic lock recovery or live cancellation is provided.

Plan counts distinguish all observed entries (`observedCount`) from currently visible entries (`observedVisibleCount`). `predictedRemaining` excludes already archived entries; unknown archive state produces `null`, and `countCompleteness` labels partial observations. These are fixture predictions. Context reads verify the original host, canonical project path, Run and thread membership as well as source digests and branch applicability, including records created before this continuation.

## Status and boundaries

See [implementation status](docs/IMPLEMENTATION_STATUS.md) for exact test results, implemented/simulated/unsupported matrix and release gates; [architecture](docs/ARCHITECTURE.md), [contracts](docs/IMPLEMENTATION_CONTRACTS.md), and [한국어 사용법](docs/USAGE_KO.md) explain behavior.

The [Hub integration contract review](docs/HUB_INTEGRATION.md) separates existing individual archive/restore and general approval facilities from the missing Fold batch, receipt, cancellation, restore ownership and context-consumption contracts. `fold_capabilities` exposes production blockers and always reports `liveIntegration: false`. Official structural package validation now passes using the existing dependency-complete Python environment; the historical missing-PyYAML failures remain in the record. Structural validation does not establish installation or live integration.

Local tests establish fixture safety and recovery properties only. Live Hub batch APIs, trusted user confirmation, native conditional archive/descendant effects, real Graph integration, host loading and actual downstream context use remain unverified. Cross-account transfer, native G0/G3 and destructive integration are outside this product's local verification. Private repository creation, visibility verification, installation and publishing remain parent-owned follow-up work.
