/**
 * 018-nango-provider-e2e.ts
 *
 * Target repo: /Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-nango
 * Exercise the full provider flow with fixtures, mock Nango routes, and retry behavior.
 * Verify proxy, webhook, health, connection-list, and refresh flows work together end to end.
 */

import { workflow } from '@agent-relay/sdk/workflows';

const NANGO_REPO = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-nango';
const SPEC = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-adapter-github/docs/adapter-spec.md';

async function main() {
  const result = await workflow('018-nango-provider-e2e')
    .description('Build end-to-end coverage for the Nango provider package')
    .pattern('dag')
    .channel('wf-relayfile-nango-provider-e2e')
    .maxConcurrency(4)
    .timeout(3_600_000)

    .agent('architect', {
      cli: 'claude',
      role: 'Plans end-to-end provider scenarios',
      cwd: NANGO_REPO,
    })
    .agent('builder', {
      cli: 'codex',
      preset: 'worker',
      role: 'Writes the end-to-end Nango provider tests',
      cwd: NANGO_REPO,
    })
    .agent('reviewer', {
      cli: 'claude',
      role: 'Reviews E2E realism and coverage',
      cwd: NANGO_REPO,
    })

    .step('plan-e2e', {
      agent: 'architect',
      task: `Read ${SPEC}, workflows 012-017 in ${NANGO_REPO}/workflows, and any existing test helpers in ${NANGO_REPO}/src/__tests__.

Plan E2E coverage for:
- happy-path proxy request
- proxy refresh and retry recovery
- webhook normalization path
- health check and connection listing path
- mixed failure path proving errors stay actionable

Keep output under 50 lines.
Print NANGO_E2E_PLAN_COMPLETE.`,
      verification: { type: 'output_contains', value: 'NANGO_E2E_PLAN_COMPLETE' },
    })

    .step('create-e2e-harness', {
      agent: 'builder',
      dependsOn: ['plan-e2e'],
      task: `Create the E2E harness under ${NANGO_REPO}/src/__tests__/e2e.

Write or update:
- src/__tests__/e2e/provider-e2e.test.ts

Use the shared fixtures and mock server from workflow 017 rather than duplicating setup.`,
      verification: { type: 'exit_code' },
    })

    .step('write-proxy-refresh-flows', {
      agent: 'builder',
      dependsOn: ['create-e2e-harness'],
      task: `Add E2E coverage for proxy and refresh flows in ${NANGO_REPO}/src/__tests__/e2e/provider-e2e.test.ts.

Cover:
- successful proxy round-trip
- refresh then retry after expired-token failure
- terminal proxy failure after refresh cannot recover

Assert route calls and returned provider outputs.`,
      verification: { type: 'exit_code' },
    })

    .step('write-webhook-health-flows', {
      agent: 'builder',
      dependsOn: ['create-e2e-harness'],
      task: `Add E2E coverage for webhook, health, and connections in ${NANGO_REPO}/src/__tests__/e2e/provider-e2e.test.ts.

Cover:
- webhook normalization through NangoProvider.handleWebhook()
- healthCheck() over healthy and unhealthy connections
- listConnections() returning adapter-usable metadata

Keep the test setup deterministic and isolated.`,
      verification: { type: 'exit_code' },
    })

    .step('verify-e2e-file', {
      type: 'deterministic',
      dependsOn: ['write-proxy-refresh-flows', 'write-webhook-health-flows'],
      command: `test -f ${NANGO_REPO}/src/__tests__/e2e/provider-e2e.test.ts`,
      captureOutput: true,
      verification: { type: 'file_exists', value: `${NANGO_REPO}/src/__tests__/e2e/provider-e2e.test.ts` },
    })

    .step('review', {
      agent: 'reviewer',
      dependsOn: ['verify-e2e-file'],
      task: `Review the E2E suite in ${NANGO_REPO}.

Check:
- proxy, refresh, webhook, health, and connection flows are all exercised
- fixtures are reused rather than copied
- assertions focus on provider outputs and call behavior
- tests reflect provider responsibilities from ${SPEC}
- there are no order-dependent or flaky cases

Keep output under 50 lines.
Print NANGO_E2E_REVIEW_COMPLETE.`,
      verification: { type: 'output_contains', value: 'NANGO_E2E_REVIEW_COMPLETE' },
    })

    .onError('retry', { maxRetries: 1, retryDelayMs: 10_000 })
    .run({ cwd: process.cwd() });

  console.log(`018 Nango Provider E2E: ${result.status}`);
}

main().catch(console.error);
