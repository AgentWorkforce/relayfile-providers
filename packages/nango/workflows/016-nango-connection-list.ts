/**
 * 016-nango-connection-list.ts
 *
 * Target repo: /Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-nango
 * Implement listing and lookup of active Nango connections.
 * Add typed helpers so adapters can inspect available provider-linked accounts safely.
 */

import { workflow } from '@agent-relay/sdk/workflows';

const NANGO_REPO = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-nango';
const SDK_PACKAGE = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile/packages/relayfile-sdk';
const SPEC = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-adapter-github/docs/adapter-spec.md';

async function main() {
  const result = await workflow('016-nango-connection-list')
    .description('Implement listConnections() and typed connection lookup helpers')
    .pattern('dag')
    .channel('wf-relayfile-nango-connection-list')
    .maxConcurrency(4)
    .timeout(3_600_000)

    .agent('architect', {
      cli: 'claude',
      role: 'Plans Nango connection listing behavior',
      cwd: NANGO_REPO,
    })
    .agent('builder', {
      cli: 'codex',
      preset: 'worker',
      role: 'Implements connection listing and tests',
      cwd: NANGO_REPO,
    })
    .agent('reviewer', {
      cli: 'claude',
      role: 'Reviews connection typing and filtering',
      cwd: NANGO_REPO,
    })

    .step('plan-connections', {
      agent: 'architect',
      task: `Read ${SPEC}, ${NANGO_REPO}/src/health.ts, ${NANGO_REPO}/src/nango-provider.ts, and ${NANGO_REPO}/src/types.ts.

Plan listConnections() support:
- which Nango endpoint to call
- how to normalize active vs inactive connections
- what metadata to expose for adapters
- helper split between provider class and connection service
- test cases for paging, filtering, and empty results

Keep output under 50 lines.
Print NANGO_CONNECTIONS_PLAN_COMPLETE.`,
      verification: { type: 'output_contains', value: 'NANGO_CONNECTIONS_PLAN_COMPLETE' },
    })

    .step('implement-connections-module', {
      agent: 'builder',
      dependsOn: ['plan-connections'],
      task: `Implement connection listing helpers in ${NANGO_REPO}.

Create or update:
- src/connections.ts for list and detail fetch helpers
- src/nango-provider.ts so listConnections() delegates to src/connections.ts
- src/types.ts for connection list and detail response shapes

Filter or annotate inactive connections explicitly.`,
      verification: { type: 'exit_code' },
    })

    .step('implement-detail-lookup', {
      agent: 'builder',
      dependsOn: ['implement-connections-module'],
      task: `Finish the connection data surface in ${NANGO_REPO}.

Support:
- listing all connections for a provider config
- optional filtering to active connections
- lookup of a single connection detail object
- typed metadata that workflows 014 and 018 can reuse

Only edit connection-related files.`,
      verification: { type: 'exit_code' },
    })

    .step('write-connection-tests', {
      agent: 'builder',
      dependsOn: ['implement-detail-lookup'],
      task: `Create ${NANGO_REPO}/src/__tests__/connections.test.ts.

Cover:
- listing active connections
- preserving useful connection metadata
- ignoring or flagging inactive connections
- empty result sets
- single-connection lookup and not-found handling

Use mocked Nango responses only.`,
      verification: { type: 'exit_code' },
    })

    .step('verify-connection-files', {
      type: 'deterministic',
      dependsOn: ['write-connection-tests'],
      command: `test -f ${NANGO_REPO}/src/connections.ts && test -f ${NANGO_REPO}/src/__tests__/connections.test.ts && test -f ${NANGO_REPO}/src/nango-provider.ts`,
      captureOutput: true,
      verification: { type: 'file_exists', value: `${NANGO_REPO}/src/connections.ts` },
    })

    .step('review', {
      agent: 'reviewer',
      dependsOn: ['verify-connection-files'],
      task: `Review connection listing in ${NANGO_REPO}.

Check:
- returned data stays provider-level, not adapter-level
- active/inactive semantics are explicit
- types support later health and E2E workflows
- tests cover empty, mixed, and missing connection cases
- no unnecessary coupling to GitHub specifics

Keep output under 50 lines.
Print NANGO_CONNECTIONS_REVIEW_COMPLETE.`,
      verification: { type: 'output_contains', value: 'NANGO_CONNECTIONS_REVIEW_COMPLETE' },
    })

    .onError('retry', { maxRetries: 1, retryDelayMs: 10_000 })
    .run({ cwd: process.cwd() });

  console.log(`016 Nango Connection List: ${result.status}`);
}

main().catch(console.error);
