/**
 * 015-nango-token-refresh.ts
 *
 * Target repo: /Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-nango
 * Add automatic token refresh handling around Nango-backed proxy calls.
 * Retry proxy requests safely when Nango indicates expired or stale credentials.
 */

import { workflow } from '@agent-relay/sdk/workflows';

const NANGO_REPO = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-nango';
const SDK_PACKAGE = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile/packages/relayfile-sdk';
const SPEC = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-adapter-github/docs/adapter-spec.md';

async function main() {
  const result = await workflow('015-nango-token-refresh')
    .description('Implement automatic token refresh and safe proxy retry flow')
    .pattern('dag')
    .channel('wf-relayfile-nango-token-refresh')
    .maxConcurrency(4)
    .timeout(3_600_000)

    .agent('architect', {
      cli: 'claude',
      role: 'Plans token refresh and retry behavior',
      cwd: NANGO_REPO,
    })
    .agent('builder', {
      cli: 'codex',
      preset: 'worker',
      role: 'Implements refresh helpers and retry tests',
      cwd: NANGO_REPO,
    })
    .agent('reviewer', {
      cli: 'claude',
      role: 'Reviews retry safety and refresh semantics',
      cwd: NANGO_REPO,
    })

    .step('plan-refresh', {
      agent: 'architect',
      task: `Read ${SPEC}, ${NANGO_REPO}/src/proxy.ts, ${NANGO_REPO}/src/health.ts, and ${NANGO_REPO}/src/nango-provider.ts.

Plan automatic token refresh:
- detect refresh-worthy proxy failures
- call the Nango refresh endpoint safely
- retry only once per request path
- preserve original request semantics on retry
- surface hard failures clearly when refresh does not recover

Keep output under 50 lines.
Print NANGO_REFRESH_PLAN_COMPLETE.`,
      verification: { type: 'output_contains', value: 'NANGO_REFRESH_PLAN_COMPLETE' },
    })

    .step('implement-refresh-helper', {
      agent: 'builder',
      dependsOn: ['plan-refresh'],
      task: `Implement refresh helpers in ${NANGO_REPO}.

Create or update:
- src/token-refresh.ts for refresh endpoint calls and retry decision helpers
- src/errors.ts with refresh-related failure types if needed
- src/types.ts with refresh response shapes

Do not add infinite or recursive retry paths.`,
      verification: { type: 'exit_code' },
    })

    .step('wire-proxy-retry', {
      agent: 'builder',
      dependsOn: ['implement-refresh-helper'],
      task: `Wire automatic refresh into proxy execution in ${NANGO_REPO}.

Update:
- src/nango-provider.ts and/or src/proxy.ts

Requirements:
- detect expired-token style failures
- refresh via src/token-refresh.ts
- retry the original proxy request once
- preserve request headers, body, params, and method`,
      verification: { type: 'exit_code' },
    })

    .step('write-refresh-tests', {
      agent: 'builder',
      dependsOn: ['wire-proxy-retry'],
      task: `Create ${NANGO_REPO}/src/__tests__/token-refresh.test.ts.

Cover:
- 401 or stale-token proxy failure triggers refresh
- successful retry after refresh
- refresh failure surfaces the right error
- non-refreshable failures do not retry
- retry happens at most once per request

Use deterministic mocked responses.`,
      verification: { type: 'exit_code' },
    })

    .step('verify-refresh-files', {
      type: 'deterministic',
      dependsOn: ['write-refresh-tests'],
      command: `test -f ${NANGO_REPO}/src/token-refresh.ts && test -f ${NANGO_REPO}/src/__tests__/token-refresh.test.ts && test -f ${NANGO_REPO}/src/nango-provider.ts`,
      captureOutput: true,
      verification: { type: 'file_exists', value: `${NANGO_REPO}/src/token-refresh.ts` },
    })

    .step('review', {
      agent: 'reviewer',
      dependsOn: ['verify-refresh-files'],
      task: `Review token refresh behavior in ${NANGO_REPO}.

Check:
- refresh and retry policy is bounded and explicit
- proxy state is not mutated unexpectedly across retry
- errors distinguish refresh failure from proxy failure
- tests cover both recovery and terminal failure
- implementation stays within provider responsibilities in ${SPEC}

Keep output under 50 lines.
Print NANGO_REFRESH_REVIEW_COMPLETE.`,
      verification: { type: 'output_contains', value: 'NANGO_REFRESH_REVIEW_COMPLETE' },
    })

    .onError('retry', { maxRetries: 1, retryDelayMs: 10_000 })
    .run({ cwd: process.cwd() });

  console.log(`015 Nango Token Refresh: ${result.status}`);
}

main().catch(console.error);
