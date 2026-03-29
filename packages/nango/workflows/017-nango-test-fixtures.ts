/**
 * 017-nango-test-fixtures.ts
 *
 * Target repo: /Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-nango
 * Build reusable mock Nango fixtures and helpers for provider tests.
 * Standardize response payloads, mock routing, and test utility setup for workflows 012-018.
 */

import { workflow } from '@agent-relay/sdk/workflows';

const NANGO_REPO = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-nango';
const SPEC = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-adapter-github/docs/adapter-spec.md';

async function main() {
  const result = await workflow('017-nango-test-fixtures')
    .description('Create reusable Nango mock fixtures, server helpers, and test utilities')
    .pattern('dag')
    .channel('wf-relayfile-nango-test-fixtures')
    .maxConcurrency(4)
    .timeout(3_600_000)

    .agent('architect', {
      cli: 'claude',
      role: 'Plans reusable fixture coverage',
      cwd: NANGO_REPO,
    })
    .agent('builder', {
      cli: 'codex',
      preset: 'worker',
      role: 'Writes mock responses and test helpers',
      cwd: NANGO_REPO,
    })
    .agent('reviewer', {
      cli: 'claude',
      role: 'Reviews fixture realism and reuse',
      cwd: NANGO_REPO,
    })

    .step('plan-fixtures', {
      agent: 'architect',
      task: `Read ${SPEC} plus the Nango workflows 012-016 in ${NANGO_REPO}/workflows.

Plan the reusable fixture layer:
- proxy success and failure payloads
- connection list and detail payloads
- refresh success and failure payloads
- webhook payload factories
- mock server and test utility boundaries

Keep output under 50 lines.
Print NANGO_FIXTURES_PLAN_COMPLETE.`,
      verification: { type: 'output_contains', value: 'NANGO_FIXTURES_PLAN_COMPLETE' },
    })

    .step('write-response-fixtures', {
      agent: 'builder',
      dependsOn: ['plan-fixtures'],
      task: `Create fixture factories in ${NANGO_REPO}.

Write:
- src/__tests__/fixtures/nango-responses.ts
- src/__tests__/fixtures/nango-webhooks.ts

Include reusable builders for connections, proxy responses, refresh responses, and malformed cases.`,
      verification: { type: 'exit_code' },
    })

    .step('write-mock-server', {
      agent: 'builder',
      dependsOn: ['write-response-fixtures'],
      task: `Create a reusable mock Nango server in ${NANGO_REPO}/src/__tests__/mock-nango.ts.

Support:
- route registration per method and path
- call capture for assertions
- canned JSON responses and error responses
- easy reset between tests

Keep it simple and deterministic.`,
      verification: { type: 'exit_code' },
    })

    .step('write-test-utils', {
      agent: 'builder',
      dependsOn: ['write-mock-server'],
      task: `Create shared test helpers in ${NANGO_REPO}/src/__tests__/helpers/test-utils.ts.

Include:
- provider factory with test config
- fetch mocking or server boot helpers
- common assertions for proxy and connection responses
- cleanup helpers for afterEach

Only add utilities that multiple tests will reuse.`,
      verification: { type: 'exit_code' },
    })

    .step('verify-fixture-files', {
      type: 'deterministic',
      dependsOn: ['write-test-utils'],
      command: `test -f ${NANGO_REPO}/src/__tests__/fixtures/nango-responses.ts && test -f ${NANGO_REPO}/src/__tests__/fixtures/nango-webhooks.ts && test -f ${NANGO_REPO}/src/__tests__/mock-nango.ts && test -f ${NANGO_REPO}/src/__tests__/helpers/test-utils.ts`,
      captureOutput: true,
      verification: { type: 'file_exists', value: `${NANGO_REPO}/src/__tests__/fixtures/nango-responses.ts` },
    })

    .step('review', {
      agent: 'reviewer',
      dependsOn: ['verify-fixture-files'],
      task: `Review the Nango test fixture layer in ${NANGO_REPO}.

Check:
- fixtures cover proxy, refresh, connection, and webhook cases
- mock server is reusable and deterministic
- helpers reduce duplication without hiding assertions
- malformed payload fixtures are present
- naming stays neutral for later provider E2E tests

Keep output under 50 lines.
Print NANGO_FIXTURES_REVIEW_COMPLETE.`,
      verification: { type: 'output_contains', value: 'NANGO_FIXTURES_REVIEW_COMPLETE' },
    })

    .onError('retry', { maxRetries: 1, retryDelayMs: 10_000 })
    .run({ cwd: process.cwd() });

  console.log(`017 Nango Test Fixtures: ${result.status}`);
}

main().catch(console.error);
