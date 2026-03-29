/**
 * 050-pipedream-provider-scaffold.ts
 *
 * Build @relayfile/provider-pipedream — full Pipedream Connect integration.
 *
 * Pipedream Connect docs: https://pipedream.com/docs/connect
 * API ref: https://pipedream.com/docs/connect/api-reference/introduction.md
 *
 * Beyond the generic IntegrationProvider interface, this wraps Pipedream's
 * full Connect API with convenience methods for account management,
 * token lifecycle, and workflow invocation.
 *
 * Run: agent-relay run workflows/050-pipedream-provider-scaffold.ts
 */

import { workflow } from '@agent-relay/sdk/workflows';

const ROOT = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-pipedream';
const SDK_ROOT = '/Users/khaliqgant/Projects/AgentWorkforce-relayfile';
const NANGO_REF = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-nango';

async function main() {
  const result = await workflow('pipedream-provider-scaffold')
    .description('Build @relayfile/provider-pipedream — full Pipedream Connect provider')
    .pattern('linear')
    .channel('wf-pipedream')
    .maxConcurrency(2)
    .timeout(2_400_000)

    .agent('architect', { cli: 'claude', role: 'Designs the full Pipedream provider' })
    .agent('builder', { cli: 'codex', preset: 'worker', role: 'Implements the provider' })
    .agent('reviewer', { cli: 'codex', preset: 'worker', role: 'Reviews and tests' })

    .step('design', {
      agent: 'architect',
      task: `Design @relayfile/provider-pipedream with full convenience layer.

Read the relayfile SDK provider interface:
- ${SDK_ROOT}/packages/sdk/typescript/src/provider.ts — IntegrationProvider abstract class
- ${SDK_ROOT}/packages/sdk/typescript/src/types.ts — WebhookInput

Read the Nango provider for reference (it wraps Nango's full API):
- ${NANGO_REF}/

Fetch and read Pipedream Connect docs for the full API surface:
- https://pipedream.com/docs/connect/api-reference/introduction.md
- https://pipedream.com/docs/connect/managed-auth/users.md
- https://pipedream.com/docs/connect/managed-auth/environments.md

Pipedream Connect API surface:
- Base URL: https://api.pipedream.com/v1/connect/{project_id}
- Auth: OAuth client credentials (clientId + clientSecret → bearer token)
- Scoped to projects, with environments (development/production)
- External users: your app's users identified by external_user_id

Design TWO layers:

**Layer 1: Generic IntegrationProvider interface**
- getAccessToken(connectionId): get OAuth token for a connected account
- proxy(request): forward API call with injected auth token
- ingestWebhook(workspaceId, rawInput): normalize + write webhook events

**Layer 2: Pipedream-specific convenience methods**

a) **Token Management**:
   - createConnectToken(externalUserId, opts?): generate a short-lived token for frontend OAuth flow
   - getProjectCredentials(): get project-level API credentials

b) **Account Management**:
   - listAccounts(opts?: { externalUserId?, app?, cursor?, limit? }): list connected accounts
   - getAccount(accountId): get account details
   - deleteAccount(accountId): remove a connected account
   - listUsers(opts?): list all external users
   - deleteUser(externalUserId): remove user and all their accounts

c) **App Discovery**:
   - listApps(opts?: { query?, cursor? }): search available apps
   - getApp(appSlug): get app details and auth type

d) **Invoke Actions** (optional but powerful):
   - invokeAction(actionId, opts): run a Pipedream action on behalf of a user
   - invokeWorkflow(workflowId, body): trigger a deployed workflow

e) **Webhook Management**:
   - Pipedream uses sources (event sources) for webhooks
   - These are managed via the components API

Config:
\`\`\`typescript
interface PipedreamConfig {
  clientId: string;       // PIPEDREAM_CLIENT_ID
  clientSecret: string;   // PIPEDREAM_CLIENT_SECRET
  projectId: string;      // PIPEDREAM_PROJECT_ID
  environment?: 'development' | 'production';  // default: production
  baseUrl?: string;       // default: https://api.pipedream.com
}
\`\`\`

Output: interfaces for both layers, file structure. Keep under 80 lines.
End with DESIGN_COMPLETE.`,
      verification: { type: 'output_contains', value: 'DESIGN_COMPLETE' },
      timeout: 300_000,
    })

    .step('implement', {
      agent: 'builder',
      dependsOn: ['design'],
      task: `Implement @relayfile/provider-pipedream with full convenience layer.

Design: {{steps.design.output}}

Working in ${ROOT}.

1. Package: @relayfile/provider-pipedream, deps on @relayfile/sdk
2. Files:
   - src/provider.ts — PipedreamProvider (extends IntegrationProvider + convenience methods)
   - src/types.ts — PipedreamConfig, PipedreamAccount, ConnectToken, etc.
   - src/auth.ts — OAuth client credentials flow (clientId+secret → bearer token, with caching)
   - src/accounts.ts — account CRUD operations
   - src/apps.ts — app discovery
   - src/webhook.ts — webhook normalization
   - src/index.ts — re-exports

3. Key implementation details:
   - Auth: POST /oauth/token with client_credentials grant → cache bearer token until expiry
   - All API calls include X-PD-Environment header
   - Pagination via cursor parameter
   - external_user_id maps to relayfile's connection concept

4. README with:
   - Quick start (generic provider usage)
   - Convenience methods examples (list accounts, create connect token)
   - Environment setup

5. Tests + build check
6. Commit feat/scaffold + push

End with IMPLEMENT_COMPLETE.`,
      verification: { type: 'output_contains', value: 'IMPLEMENT_COMPLETE' },
      timeout: 900_000,
    })

    .step('review', {
      agent: 'reviewer',
      dependsOn: ['implement'],
      task: `Review @relayfile/provider-pipedream in ${ROOT}.
Verify: extends IntegrationProvider, has convenience layer (accounts, apps, tokens),
no hardcoded creds, auth token caching, pagination support, tests, README.
Fix issues. Keep under 40 lines. End with REVIEW_COMPLETE.`,
      verification: { type: 'output_contains', value: 'REVIEW_COMPLETE' },
      timeout: 300_000,
    })

    .onError('retry', { maxRetries: 1, retryDelayMs: 10_000 })
    .run({ cwd: ROOT });

  console.log('Pipedream provider complete:', result.status);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
