/**
 * 012-nango-proxy.ts
 *
 * Target repo: /Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-nango
 * Implement proxy() via the Nango proxy API.
 * Add request helpers, response parsing, and direct tests for authenticated proxy calls.
 */

import { workflow } from '@agent-relay/sdk/workflows';

const NANGO_REPO = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-nango';
const RELAYFILE_REPO = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile';
const SDK_PACKAGE = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile/packages/relayfile-sdk';
const SPEC = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-adapter-github/docs/adapter-spec.md';

async function main() {
  const result = await workflow('012-nango-proxy')
    .description('Implement NangoProvider.proxy() using the Nango proxy API')
    .pattern('dag')
    .channel('wf-relayfile-nango-proxy')
    .maxConcurrency(4)
    .timeout(3_600_000)

    .agent('architect', {
      cli: 'claude',
      role: 'Plans the proxy API contract',
      cwd: NANGO_REPO,
    })
    .agent('builder', {
      cli: 'codex',
      preset: 'worker',
      role: 'Implements proxy transport and tests',
      cwd: NANGO_REPO,
    })
    .agent('reviewer', {
      cli: 'claude',
      role: 'Reviews proxy correctness and coverage',
      cwd: NANGO_REPO,
    })

    .step('plan-proxy', {
      agent: 'architect',
      task: `Read ${SPEC}, ${SDK_PACKAGE}/src/index.ts, ${NANGO_REPO}/src/nango-provider.ts, and ${NANGO_REPO}/src/types.ts.

Plan proxy() for NangoProvider:
- map Relayfile ProxyRequest to Nango POST /proxy
- derive headers: Authorization, Connection-Id, Provider-Config-Key
- pass baseUrl, endpoint, params, headers, and body correctly
- normalize the fetch Response into ProxyResponse
- define failure handling for network and HTTP errors

Keep output under 50 lines.
Print NANGO_PROXY_PLAN_COMPLETE.`,
      verification: { type: 'output_contains', value: 'NANGO_PROXY_PLAN_COMPLETE' },
    })

    .step('implement-proxy', {
      agent: 'builder',
      dependsOn: ['plan-proxy'],
      task: `Implement the proxy transport for ${NANGO_REPO}.

Create or update:
- src/proxy.ts for request-building and response-parsing helpers
- src/nango-provider.ts to delegate proxy() to those helpers
- src/index.ts exports if new helpers are exported

Honor the Nango payload shape from ${SPEC}.`,
      verification: { type: 'exit_code' },
    })

    .step('implement-errors-and-typing', {
      agent: 'builder',
      dependsOn: ['implement-proxy'],
      task: `Tighten the proxy typing in ${NANGO_REPO}.

Update:
- src/types.ts with proxy request and response helper types
- src/errors.ts with transport or proxy failure errors
- src/nango-provider.ts signatures so proxy() stays aligned with Relayfile types

Only edit files that directly support proxy().`,
      verification: { type: 'exit_code' },
    })

    .step('write-proxy-tests', {
      agent: 'builder',
      dependsOn: ['implement-errors-and-typing'],
      task: `Create ${NANGO_REPO}/src/__tests__/proxy.test.ts.

Cover:
- correct Nango proxy endpoint and headers
- forwarding of method, baseUrl, endpoint, params, headers, and body
- parsing of success responses
- handling of empty bodies, 4xx, 5xx, and fetch failures

Use deterministic fetch mocks.`,
      verification: { type: 'exit_code' },
    })

    .step('verify-proxy-files', {
      type: 'deterministic',
      dependsOn: ['write-proxy-tests'],
      command: `test -f ${NANGO_REPO}/src/proxy.ts && test -f ${NANGO_REPO}/src/__tests__/proxy.test.ts && test -f ${NANGO_REPO}/src/nango-provider.ts`,
      captureOutput: true,
      verification: { type: 'file_exists', value: `${NANGO_REPO}/src/proxy.ts` },
    })

    .step('review', {
      agent: 'reviewer',
      dependsOn: ['verify-proxy-files'],
      task: `Review proxy implementation in ${NANGO_REPO}.

Check:
- Nango request shape matches ${SPEC}
- proxy() remains provider-agnostic except for Nango transport concerns
- error handling is explicit and typed
- tests cover both happy and failure paths
- exports do not leak unnecessary internals

Keep output under 50 lines.
Print NANGO_PROXY_REVIEW_COMPLETE.`,
      verification: { type: 'output_contains', value: 'NANGO_PROXY_REVIEW_COMPLETE' },
    })

    .onError('retry', { maxRetries: 1, retryDelayMs: 10_000 })
    .run({ cwd: process.cwd() });

  console.log(`012 Nango Proxy: ${result.status}`);
}

main().catch(console.error);
