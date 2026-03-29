/**
 * 013-nango-webhook.ts
 *
 * Target repo: /Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-nango
 * Normalize incoming Nango webhooks into Relayfile's NormalizedWebhook shape.
 * Map provider, connection, event, and object metadata into adapter-friendly payloads.
 */

import { workflow } from '@agent-relay/sdk/workflows';

const NANGO_REPO = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-nango';
const SDK_PACKAGE = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile/packages/relayfile-sdk';
const SPEC = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-adapter-github/docs/adapter-spec.md';

async function main() {
  const result = await workflow('013-nango-webhook')
    .description('Implement NangoProvider.handleWebhook() normalization')
    .pattern('dag')
    .channel('wf-relayfile-nango-webhook')
    .maxConcurrency(4)
    .timeout(3_600_000)

    .agent('architect', {
      cli: 'claude',
      role: 'Plans webhook normalization rules',
      cwd: NANGO_REPO,
    })
    .agent('builder', {
      cli: 'codex',
      preset: 'worker',
      role: 'Implements webhook normalization and tests',
      cwd: NANGO_REPO,
    })
    .agent('reviewer', {
      cli: 'claude',
      role: 'Reviews event mapping and malformed payload handling',
      cwd: NANGO_REPO,
    })

    .step('plan-webhook', {
      agent: 'architect',
      task: `Read ${SPEC}, ${SDK_PACKAGE}/src/index.ts, ${NANGO_REPO}/src/nango-provider.ts, and ${NANGO_REPO}/src/types.ts.

Plan handleWebhook() normalization for Nango:
- identify supported webhook families
- map provider, connectionId, eventType, objectType, objectId, payload
- preserve raw Nango details needed by adapters
- reject malformed or incomplete payloads cleanly
- define helper boundaries for event mapping

Keep output under 50 lines.
Print NANGO_WEBHOOK_PLAN_COMPLETE.`,
      verification: { type: 'output_contains', value: 'NANGO_WEBHOOK_PLAN_COMPLETE' },
    })

    .step('implement-webhook-module', {
      agent: 'builder',
      dependsOn: ['plan-webhook'],
      task: `Implement webhook normalization in ${NANGO_REPO}.

Create or update:
- src/webhook.ts for parsing and mapping helpers
- src/nango-provider.ts so handleWebhook() delegates into src/webhook.ts
- src/types.ts for webhook payload shapes and normalized helper types

Keep object mapping explicit and deterministic.`,
      verification: { type: 'exit_code' },
    })

    .step('implement-event-mappers', {
      agent: 'builder',
      dependsOn: ['implement-webhook-module'],
      task: `Refine event mapping for the main Nango webhook cases.

Support at least:
- auth connection lifecycle events
- sync start and completion events
- provider event passthrough metadata when Nango includes object identifiers

Keep unsupported payloads explicit rather than silently guessing.`,
      verification: { type: 'exit_code' },
    })

    .step('write-webhook-tests', {
      agent: 'builder',
      dependsOn: ['implement-event-mappers'],
      task: `Create ${NANGO_REPO}/src/__tests__/webhook.test.ts.

Cover:
- auth lifecycle payload normalization
- sync lifecycle payload normalization
- payloads with provider/object metadata
- missing connection or event data
- malformed payload rejection

Use fixture-style objects, not live HTTP calls.`,
      verification: { type: 'exit_code' },
    })

    .step('verify-webhook-files', {
      type: 'deterministic',
      dependsOn: ['write-webhook-tests'],
      command: `test -f ${NANGO_REPO}/src/webhook.ts && test -f ${NANGO_REPO}/src/__tests__/webhook.test.ts && test -f ${NANGO_REPO}/src/nango-provider.ts`,
      captureOutput: true,
      verification: { type: 'file_exists', value: `${NANGO_REPO}/src/webhook.ts` },
    })

    .step('review', {
      agent: 'reviewer',
      dependsOn: ['verify-webhook-files'],
      task: `Review webhook normalization in ${NANGO_REPO}.

Check:
- NormalizedWebhook fields match ${SPEC}
- event mapping is deterministic and documented in code
- malformed payload handling is safe
- tests cover representative Nango payload families
- no GitHub-specific assumptions leak into the provider layer

Keep output under 50 lines.
Print NANGO_WEBHOOK_REVIEW_COMPLETE.`,
      verification: { type: 'output_contains', value: 'NANGO_WEBHOOK_REVIEW_COMPLETE' },
    })

    .onError('retry', { maxRetries: 1, retryDelayMs: 10_000 })
    .run({ cwd: process.cwd() });

  console.log(`013 Nango Webhook: ${result.status}`);
}

main().catch(console.error);
