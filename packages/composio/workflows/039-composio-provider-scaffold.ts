/**
 * 039-composio-provider-scaffold.ts
 *
 * Scaffold @relayfile/provider-composio and the ComposioProvider contract.
 * Covers package bootstrap, proxy mapping, webhook normalization, and tests.
 *
 * Run: agent-relay run workflows/039-composio-provider-scaffold.ts
 */

import { workflow } from '@agent-relay/sdk/workflows';

const COMPOSIO_REPO = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-composio';
const SDK_REPO = '/Users/khaliqgant/Projects/AgentWorkforce-relayfile';
const SPEC = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-adapter-github/docs/adapter-spec.md';

async function main() {
const result = await workflow('composio-provider-scaffold')
  .description('Scaffold @relayfile/provider-composio around the ConnectionProvider contract')
  .pattern('dag')
  .channel('wf-relayfile-composio-provider-scaffold')
  .maxConcurrency(4)
  .timeout(3_600_000)

  .agent('architect', { cli: 'claude', role: 'Plans the Composio provider scaffold' })
  .agent('builder', { cli: 'codex', preset: 'worker', role: 'Writes the provider scaffold files' })
  .agent('reviewer', { cli: 'claude', role: 'Reviews scaffold quality and spec fit' })

  .step('plan-scaffold', {
    agent: 'architect',
    task: `Read ${SPEC} sections 2 and 4.

Plan the provider scaffold in ${COMPOSIO_REPO}:
- package.json, tsconfig.json, src/index.ts
- src/composio-provider.ts implementing ConnectionProvider
- src/proxy.ts mapping ProxyRequest to Composio actions
- src/webhook.ts normalizing Composio callbacks
- src/types.ts for config and webhook types
- src/__tests__/composio-provider.test.ts
- Use spec signatures for proxy(request), healthCheck(connectionId), handleWebhook(rawPayload)

Keep output under 50 lines. End with PLAN_COMPOSIO_PROVIDER_SCAFFOLD_COMPLETE.`,
    verification: { type: 'output_contains', value: 'PLAN_COMPOSIO_PROVIDER_SCAFFOLD_COMPLETE' },
    timeout: 120_000,
  })

  .step('init-package', {
    agent: 'builder',
    dependsOn: ['plan-scaffold'],
    task: `Bootstrap ${COMPOSIO_REPO}.

Create or update:
- package.json for @relayfile/provider-composio
- tsconfig.json with strict TypeScript settings
- src/index.ts barrel exports
- src/types.ts with ComposioProviderConfig and helper types
- src/__tests__/ directory

Verify files exist:
test -f ${COMPOSIO_REPO}/package.json
test -f ${COMPOSIO_REPO}/tsconfig.json
test -f ${COMPOSIO_REPO}/src/index.ts`,
    verification: { type: 'exit_code' },
    timeout: 180_000,
  })

  .step('write-provider', {
    agent: 'builder',
    dependsOn: ['init-package'],
    task: `Write ${COMPOSIO_REPO}/src/composio-provider.ts and ${COMPOSIO_REPO}/src/proxy.ts.

Implement:
- ComposioProvider with name = 'composio'
- proxy(request) delegating authenticated calls through Composio
- healthCheck(connectionId) returning boolean from account connectivity
- Helper logic for action lookup, headers, and response normalization
- Clear config handling for apiKey, baseUrl, defaultToolset

Verify files exist:
test -f ${COMPOSIO_REPO}/src/composio-provider.ts
test -f ${COMPOSIO_REPO}/src/proxy.ts`,
    verification: { type: 'exit_code' },
    timeout: 180_000,
  })

  .step('write-webhook', {
    agent: 'builder',
    dependsOn: ['write-provider'],
    task: `Write ${COMPOSIO_REPO}/src/webhook.ts and update ${COMPOSIO_REPO}/src/index.ts.

Implement:
- normalizeComposioWebhook(rawPayload) -> NormalizedWebhook
- provider-specific helpers for signature/header parsing
- eventType, objectType, objectId, provider, connectionId extraction
- Barrel exports for ComposioProvider, proxy helpers, webhook helpers, and types

Verify files exist:
test -f ${COMPOSIO_REPO}/src/webhook.ts
test -f ${COMPOSIO_REPO}/src/index.ts`,
    verification: { type: 'exit_code' },
    timeout: 180_000,
  })

  .step('write-tests', {
    agent: 'builder',
    dependsOn: ['write-webhook'],
    task: `Write ${COMPOSIO_REPO}/src/__tests__/composio-provider.test.ts.

Cover:
- ComposioProvider.name
- healthCheck(connectionId) success and failure
- proxy(request) request/response normalization
- normalizeComposioWebhook(rawPayload) output shape
- Missing account or malformed callback handling
- Barrel exports compile and import cleanly

Verify file exists:
test -f ${COMPOSIO_REPO}/src/__tests__/composio-provider.test.ts`,
    verification: { type: 'exit_code' },
    timeout: 180_000,
  })

  .step('review', {
    agent: 'reviewer',
    dependsOn: ['write-tests'],
    task: `Review ${COMPOSIO_REPO}/src/ and ${COMPOSIO_REPO}/src/__tests__/composio-provider.test.ts.

Verify:
- ConnectionProvider contract matches the spec
- proxy(request) and webhook normalization are coherent
- File layout matches the scaffold plan
- Tests cover happy path and malformed payloads
- No secrets are logged or embedded

Keep output under 50 lines. End with REVIEW_COMPOSIO_PROVIDER_SCAFFOLD_COMPLETE.`,
    verification: { type: 'output_contains', value: 'REVIEW_COMPOSIO_PROVIDER_SCAFFOLD_COMPLETE' },
    timeout: 120_000,
  })

  .onError('retry', { maxRetries: 1, retryDelayMs: 10_000 })
  .run({ cwd: process.cwd() });

console.log('Composio provider scaffold:', result.status);
}

main().catch(console.error);
