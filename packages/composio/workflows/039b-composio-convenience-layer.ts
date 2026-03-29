/**
 * 039b-composio-convenience-layer.ts
 *
 * Add full convenience layer to @relayfile/provider-composio.
 * The scaffold workflow (039) built the generic IntegrationProvider interface.
 * This adds Composio-specific methods for entity management, trigger subscriptions,
 * action invocation, and connected account management.
 *
 * Composio docs: https://docs.composio.dev
 * API ref: https://docs.composio.dev/api-reference
 *
 * Run: agent-relay run workflows/039b-composio-convenience-layer.ts
 */

import { workflow } from '@agent-relay/sdk/workflows';

const ROOT = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-composio';
const SDK_ROOT = '/Users/khaliqgant/Projects/AgentWorkforce-relayfile';

async function main() {
  const result = await workflow('composio-convenience-layer')
    .description('Add full convenience layer to @relayfile/provider-composio')
    .pattern('linear')
    .channel('wf-composio-convenience')
    .maxConcurrency(2)
    .timeout(2_400_000)

    .agent('architect', { cli: 'claude', role: 'Designs the Composio convenience layer' })
    .agent('builder', { cli: 'codex', preset: 'worker', role: 'Implements the layer' })
    .agent('reviewer', { cli: 'codex', preset: 'worker', role: 'Reviews' })

    .step('design', {
      agent: 'architect',
      task: `Design the Composio convenience layer.

Read what already exists:
- ${ROOT}/src/ — current scaffold (IntegrationProvider basics)

Fetch Composio API docs:
- https://docs.composio.dev/api-reference

Composio API surface:
- Base: https://backend.composio.dev/api/v2
- Auth: x-api-key header
- Entities = your users; Connected accounts = their linked services
- Triggers = webhook subscriptions; Actions = API operations

Design convenience methods to ADD to the existing ComposioProvider:

a) **Entity Management** (your users):
   - listEntities(opts?): list entities
   - getEntity(entityId): get entity details
   - createEntity(data): create entity
   - deleteEntity(entityId): delete entity

b) **Connected Account Management**:
   - listConnectedAccounts(entityId?, integrationId?): list accounts
   - getConnectedAccount(accountId): get account details
   - initiateConnection(entityId, integrationId, opts?): start OAuth flow
   - deleteConnectedAccount(accountId): remove connection

c) **Action Invocation** (execute actions on user's behalf):
   - listActions(opts?: { appName?, tags? }): list available actions
   - getAction(actionId): get action schema
   - executeAction(actionId, entityId, params): run an action
   - Example: composio.executeAction('github_create_issue', entityId, { repo, title, body })

d) **Trigger Management** (webhook subscriptions):
   - listTriggers(opts?: { appName? }): list available triggers
   - subscribeTrigger(triggerId, entityId, config): set up webhook
   - unsubscribeTrigger(subscriptionId): remove webhook
   - listActiveSubscriptions(entityId?): list active trigger subscriptions

e) **Integration/App Discovery**:
   - listIntegrations(): list available integrations (GitHub, Slack, etc.)
   - getIntegration(integrationId): get integration details
   - listApps(): list supported apps

Output: method signatures, how they map to API endpoints. Keep under 60 lines.
End with DESIGN_COMPLETE.`,
      verification: { type: 'output_contains', value: 'DESIGN_COMPLETE' },
      timeout: 300_000,
    })

    .step('implement', {
      agent: 'builder',
      dependsOn: ['design'],
      task: `Add convenience methods to the existing ComposioProvider.

Design: {{steps.design.output}}

Working in ${ROOT} on branch feat/convenience-layer.

1. Read existing code in src/ to understand current structure
2. Add new files:
   - src/entities.ts — entity CRUD
   - src/accounts.ts — connected account management
   - src/actions.ts — action discovery + invocation
   - src/triggers.ts — trigger subscription management
   - src/integrations.ts — integration/app discovery

3. Extend ComposioProvider in src/provider.ts with convenience methods
   (either directly or via mixins/composition)

4. Update src/index.ts to export new types
5. Update tests
6. Build check + commit feat/convenience-layer + push

End with IMPLEMENT_COMPLETE.`,
      verification: { type: 'output_contains', value: 'IMPLEMENT_COMPLETE' },
      timeout: 900_000,
    })

    .step('review', {
      agent: 'reviewer',
      dependsOn: ['implement'],
      task: `Review Composio convenience layer in ${ROOT}.
Verify: all convenience methods work, no hardcoded keys, proper typing,
action execution returns structured response, trigger subscriptions tested.
Keep under 40 lines. End with REVIEW_COMPLETE.`,
      verification: { type: 'output_contains', value: 'REVIEW_COMPLETE' },
      timeout: 300_000,
    })

    .onError('retry', { maxRetries: 1, retryDelayMs: 10_000 })
    .run({ cwd: ROOT });

  console.log('Composio convenience layer complete:', result.status);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
