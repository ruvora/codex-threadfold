import { demand } from './model.js';
const text = { type: 'string', minLength: 1 };
const integer = { type: 'integer', minimum: 1 };
const ref = { type: 'object', properties: { hostId: text, threadId: text }, required: ['hostId', 'threadId'], additionalProperties: false };
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const plan = { planId: text, revision: integer };
const operation = { operationId: text };
const apply = { ...plan, approvalReceipt: { type: 'object' }, idempotencyKey: text };
export const toolDefinitions = [
  ['fold_capabilities', 'capabilities', 'Report unavailable production capabilities and selected fixture mode.', object({}), true],
  ['fold_inspect_scope', 'inspect', 'Observe fixture scope and persist a local snapshot. Never changes user threads.', object({ projectId: text, runId: text, cursor: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 1000 } }, ['projectId', 'runId']), false],
  ['fold_prepare_plan', 'prepare', 'Persist a draft with immutable provenance and exclusions; no archive.', object({ snapshotId: text, representativeRef: ref }, ['snapshotId']), false],
  ['fold_read_plan', 'readPlan', 'Read an exact plan revision with source evidence.', object(plan), true],
  ['fold_revise_plan', 'revise', 'Create a new immutable revision; previous approvals become stale. Coverage acknowledgement is not approval.', object({ planId: text, expectedRevision: integer, edits: object({ representativeRef: ref, excludedRefs: { type: 'array', items: ref }, coverageReviewed: { type: 'boolean' } }, []) }), false],
  ['fold_cancel_plan', 'cancelPlan', 'Cancel an unstarted local plan without changing source threads. Immutable revisions remain readable.', object(plan), false],
  ['fold_apply_plan', 'applyArchive', 'Apply an archive plan only through a capability-gated adapter and trusted receipt. Production is unavailable.', object(apply), false],
  ['fold_get_operation', 'getOperation', 'Read durable per-item operation results.', object(operation), true],
  ['fold_recover_operation', 'recover', 'Reconcile a known fixture operation without replaying uncertain mutations.', object(operation), false],
  ['fold_cancel_operation', 'cancelOperation', 'Request a durable fixture no-effect cancellation. Already committed effects are reported, never rolled back. Production unavailable.', object(operation), false],
  ['fold_prepare_restore', 'prepareRestore', 'Persist a separate restore plan for verified owned changes only.', object(operation), false],
  ['fold_apply_restore', 'applyRestore', 'Apply a separately approved restore plan; production is unavailable.', object(apply), false],
  ['fold_read_record', 'readRecord', 'Read an active, digest-pinned record for the exact project/branch; grants no authority.', object({ recordId: text, revision: integer, expectedDigest: text, projectId: text, branch: text, claimIds: { type: 'array', items: text } }, ['recordId', 'revision', 'expectedDigest', 'projectId', 'branch']), true]
].map(([name, method, description, inputSchema, readOnlyHint]) => ({ name, method, description, inputSchema, annotations: { readOnlyHint, destructiveHint: false, idempotentHint: readOnlyHint, openWorldHint: false } }));

export function validate(schema, value) {
  if (schema.type === 'object') {
    demand(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_ARGUMENTS');
    for (const k of schema.required ?? []) demand(Object.hasOwn(value, k), 'INVALID_ARGUMENTS', `Missing ${k}`);
    if (schema.additionalProperties === false) demand(Object.keys(value).every(k => Object.hasOwn(schema.properties, k)), 'INVALID_ARGUMENTS');
    for (const [k, v] of Object.entries(value)) if (schema.properties?.[k]) validate(schema.properties[k], v);
  } else if (schema.type === 'array') { demand(Array.isArray(value), 'INVALID_ARGUMENTS'); value.forEach(v => validate(schema.items, v)); }
  else if (schema.type === 'integer') demand(Number.isSafeInteger(value) && value >= (schema.minimum ?? -Infinity) && value <= (schema.maximum ?? Infinity), 'INVALID_ARGUMENTS');
  else demand(typeof value === schema.type && (schema.type !== 'string' || value.length >= (schema.minLength ?? 0)), 'INVALID_ARGUMENTS');
}
export function callTool(engine, name, args = {}) {
  const tool = toolDefinitions.find(t => t.name === name); demand(tool, 'UNKNOWN_TOOL'); validate(tool.inputSchema, args);
  if (tool.method === 'applyArchive' || tool.method === 'applyRestore') {
    const { plan } = engine.readPlan(args);
    demand(plan.kind === (tool.method === 'applyRestore' ? 'restore' : 'archive'), 'OPERATION_KIND_MISMATCH');
    return engine.apply(args);
  }
  return engine[tool.method](args);
}
export function createRPC(engine) {
  let initialized = false;
  return request => {
    const requestId = request?.id ?? null;
    const error = (code, message) => ({ jsonrpc: '2.0', id: requestId, error: { code, message } });
    if (!request || Array.isArray(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string') return error(-32600, 'Invalid Request');
    if (!Object.hasOwn(request, 'id')) return null;
    if (request.method === 'initialize') {
      initialized = true;
      return { jsonrpc: '2.0', id: requestId, result: { protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'threadfold', version: '0.1.0' }, instructions: 'Local fixture previews only. Production Hub and trusted approval are unavailable. No tool issues approval or accepts signing keys.' } };
    }
    if (request.method === 'ping') return { jsonrpc: '2.0', id: requestId, result: {} };
    if (!initialized) return error(-32002, 'Initialize first');
    if (request.method === 'tools/list') return { jsonrpc: '2.0', id: requestId, result: { tools: toolDefinitions.map(({ method, ...t }) => t) } };
    if (request.method !== 'tools/call') return error(-32601, 'Method not found');
    try {
      const result = callTool(engine, request.params?.name, request.params?.arguments ?? {});
      return { jsonrpc: '2.0', id: requestId, result: { content: [{ type: 'text', text: JSON.stringify(result) }], isError: false } };
    } catch (e) { return { jsonrpc: '2.0', id: requestId, result: { content: [{ type: 'text', text: JSON.stringify({ code: e.code ?? 'INTERNAL_ERROR', message: e.message }) }], isError: true } }; }
  };
}
export async function serveStdio(engine, input = process.stdin, output = process.stdout) {
  const rpc = createRPC(engine); let pending = '';
  input.setEncoding('utf8');
  const send = value => { if (value !== null) output.write(JSON.stringify(value) + '\n'); };
  for await (const chunk of input) {
    pending += chunk;
    let index;
    while ((index = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, index); pending = pending.slice(index + 1);
      if (Buffer.byteLength(line) > 1048576) { send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } }); continue; }
      if (!line.trim()) continue;
      try { send(rpc(JSON.parse(line))); } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
    }
    if (Buffer.byteLength(pending) > 1048576) { send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } }); return; }
  }
  if (pending.trim()) send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Expected newline-terminated JSON' } });
}
