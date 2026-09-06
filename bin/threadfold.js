#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { ThreadFold } from '../src/engine.js';
import { FixtureHub, FixtureApproval, UnavailableHub } from '../src/adapters.js';
import { callTool, serveStdio, toolDefinitions } from '../src/tools.js';
import { demand } from '../src/model.js';

try {
  const args = process.argv.slice(2), command = args.shift() ?? 'help';
  if (command === 'help' || command === '--help') {
    console.log('RUVORA ThreadFold 0.1.0 — local preview; production integration unavailable\n' +
      'node bin/threadfold.js <tool-name|mcp|demo> [--data DIRECTORY] [--fixture FILE] [--args JSON]\n' +
      'Data path: --data or THREADFOLD_DATA_DIR, outside installation caches.\n' +
      'demo: explicitly simulates review/archive/restore on fixture data only.\n' + toolDefinitions.map(t => t.name).join('\n'));
  } else {
    const options = {};
    while (args.length) { const k = args.shift(); demand(['--data', '--fixture', '--args'].includes(k) && args.length > 0 && !Object.hasOwn(options, k), 'INVALID_ARGUMENTS'); options[k] = args.shift(); }
    const directory = options['--data'] ?? process.env.THREADFOLD_DATA_DIR;
    // Capability reporting and default MCP can start without touching disk.
    const data = directory ?? path.resolve('.threadfold/unconfigured');
    const seed = options['--fixture'] ? JSON.parse(fs.readFileSync(options['--fixture'], 'utf8')) : null;
    if (seed || command === 'demo') demand(directory, 'DATA_DIR_REQUIRED');
    const hub = seed ? new FixtureHub(path.join(data, 'fixture-hub'), seed) : new UnavailableHub();
    const approval = seed ? new FixtureApproval() : null;
    const engine = new ThreadFold({ directory: path.join(data, 'fold'), hub, approval, writable: Boolean(directory) });
    if (command === 'mcp') await serveStdio(engine);
    else if (command === 'demo') {
      demand(seed, 'FIXTURE_REQUIRED');
      const inspected = engine.inspect({ projectId: seed.canonicalProjectId, runId: seed.runId });
      const draft = engine.prepare({ snapshotId: inspected.snapshot.snapshotId });
      const { plan } = engine.revise({ planId: draft.plan.planId, expectedRevision: 1, edits: { coverageReviewed: true } });
      const applied = engine.apply({ planId: plan.planId, revision: plan.revision, approvalReceipt: approval.issue(plan), idempotencyKey: plan.planId + '-archive' });
      const restore = engine.prepareRestore({ operationId: applied.operationId }).plan;
      const restored = engine.apply({ planId: restore.planId, revision: 1, approvalReceipt: approval.issue(restore), idempotencyKey: restore.planId + '-restore' });
      console.log(JSON.stringify({ mode: 'fixture', liveIntegration: false, applied, restored }, null, 2));
    } else console.log(JSON.stringify(callTool(engine, command, JSON.parse(options['--args'] ?? '{}')), null, 2));
  }
} catch (e) { console.error(JSON.stringify({ code: e.code ?? 'INTERNAL_ERROR', message: e.message })); process.exitCode = 1; }
