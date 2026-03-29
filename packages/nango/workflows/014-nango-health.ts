/**
 * 014-nango-health.ts
 *
 * Target repo: /Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-nango
 * Implement connection health checks backed by Nango connection status lookups.
 * Add typed health helpers so adapters can reason about failing connections clearly.
 */

import { workflow } from '@agent-relay/sdk/workflows';

const NANGO_REPO = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-nango';
const SDK_PACKAGE = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile/packages/relayfile-sdk';
const SPEC = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-adapter-github/docs/adapter-spec.md';

async function main() {
  const result = await workflow('014-nango-health')
    .description('Implement healthCheck() using Nango connection state')
    .pattern('dag')
    .channel('wf-relayfile-nango-health')
    .maxConcurrency(4)
    .timeout(3_600_000)

    .agent('architect', {
      cli: 'claude',
      role: 'Plans health-check behavior and failure states',
      cwd: NANGO_REPO,
    })
    .agent('builder', {
      cli: 'codex',
      preset: 'worker',
      role: 'Implements health logic and tests',
      cwd: NANGO_REPO,
    })
    .agent('reviewer', {
      cli: 'claude',
      role: 'Reviews health semantics and edge cases',
      cwd: NANGO_REPO,
    })

    .step('plan-health', {
      agent: 'architect',
      task: `Read ${SPEC}, ${SDK_PACKAGE}/src/index.ts, ${NANGO_REPO}/src/nango-provider.ts, and ${NANGO_REPO}/src/types.ts.

Plan healthCheck() for NangoProvider:
- how to fetch connection status from Nango
- what states count as healthy, degraded, or failed
- how to handle missing connections and transport errors
- helper boundaries for reusable health status parsing
- test matrix for active, expired, revoked, and unknown connections

Keep output under 50 lines.
Print NANGO_HEALTH_PLAN_COMPLETE.`,
      verification: { type: 'output_contains', value: 'NANGO_HEALTH_PLAN_COMPLETE' },
    })

    .step('implement-health-module', {
      agent: 'builder',
      dependsOn: ['plan-health'],
      task: `Implement connection health helpers in ${NANGO_REPO}.

Create or update:
- src/health.ts for fetching and evaluating connection health
- src/nango-provider.ts so healthCheck() delegates into src/health.ts
- src/types.ts with any health-related result details you need

Keep the provider boundary clean and provider-specific.`,
      verification: { type: 'exit_code' },
    })

    .step('wire-connection-lookup', {
      agent: 'builder',
      dependsOn: ['implement-health-module'],
      task: `Finish the health lookup path in ${NANGO_REPO}.

Ensure health helpers can:
- fetch a single Nango connection by connectionId
- interpret auth state and sync state consistently
- surface actionable error messages without leaking secrets

Only touch files needed for health behavior.`,
      verification: { type: 'exit_code' },
    })

    .step('write-health-tests', {
      agent: 'builder',
      dependsOn: ['wire-connection-lookup'],
      task: `Create ${NANGO_REPO}/src/__tests__/health.test.ts.

Cover:
- healthy active connection
- expired or revoked connection
- missing connectionId
- Nango API failure while checking health
- helper-level status parsing for ambiguous connection payloads

Use mocked fetch responses only.`,
      verification: { type: 'exit_code' },
    })

    .step('verify-health-files', {
      type: 'deterministic',
      dependsOn: ['write-health-tests'],
      command: `test -f ${NANGO_REPO}/src/health.ts && test -f ${NANGO_REPO}/src/__tests__/health.test.ts && test -f ${NANGO_REPO}/src/nango-provider.ts`,
      captureOutput: true,
      verification: { type: 'file_exists', value: `${NANGO_REPO}/src/health.ts` },
    })

    .step('review', {
      agent: 'reviewer',
      dependsOn: ['verify-health-files'],
      task: `Review health handling in ${NANGO_REPO}.

Check:
- healthCheck() semantics match provider responsibilities in ${SPEC}
- failure states are explicit and stable
- connection lookup code is reusable for later workflow 016
- tests cover auth and transport failures
- no hidden retry loops or silent fallbacks

Keep output under 50 lines.
Print NANGO_HEALTH_REVIEW_COMPLETE.`,
      verification: { type: 'output_contains', value: 'NANGO_HEALTH_REVIEW_COMPLETE' },
    })

    .onError('retry', { maxRetries: 1, retryDelayMs: 10_000 })
    .run({ cwd: process.cwd() });

  console.log(`014 Nango Health: ${result.status}`);
}

main().catch(console.error);
