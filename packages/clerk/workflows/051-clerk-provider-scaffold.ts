/**
 * 051-clerk-provider-scaffold.ts
 *
 * Build @relayfile/provider-clerk — full Clerk Backend API integration.
 *
 * Clerk docs: https://clerk.com/docs
 * Backend API: https://clerk.com/docs/reference/backend-api
 * External accounts: https://clerk.com/docs/users/external-accounts
 *
 * Clerk manages end-user authentication. Users connect their own GitHub/Slack/etc.
 * via Clerk's OAuth flow. This provider retrieves those tokens AND wraps Clerk's
 * full Backend API for user management, session handling, and org management.
 *
 * Run: agent-relay run workflows/051-clerk-provider-scaffold.ts
 */

import { workflow } from '@agent-relay/sdk/workflows';

const ROOT = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-clerk';
const SDK_ROOT = '/Users/khaliqgant/Projects/AgentWorkforce-relayfile';
const NANGO_REF = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-nango';

async function main() {
  const result = await workflow('clerk-provider-scaffold')
    .description('Build @relayfile/provider-clerk — full Clerk Backend API provider')
    .pattern('linear')
    .channel('wf-clerk')
    .maxConcurrency(2)
    .timeout(2_400_000)

    .agent('architect', { cli: 'claude', role: 'Designs the full Clerk provider' })
    .agent('builder', { cli: 'codex', preset: 'worker', role: 'Implements the provider' })
    .agent('reviewer', { cli: 'codex', preset: 'worker', role: 'Reviews and tests' })

    .step('design', {
      agent: 'architect',
      task: `Design @relayfile/provider-clerk with full convenience layer.

Read the relayfile SDK provider interface:
- ${SDK_ROOT}/packages/sdk/typescript/src/provider.ts — IntegrationProvider abstract class

Read the Nango provider for reference:
- ${NANGO_REF}/

Fetch and read Clerk Backend API docs:
- https://clerk.com/docs/reference/backend-api

Clerk Backend API surface:
- Base URL: https://api.clerk.com/v1
- Auth: Bearer {CLERK_SECRET_KEY}
- Users, sessions, organizations, OAuth tokens, webhooks (via Svix)

Design TWO layers:

**Layer 1: Generic IntegrationProvider interface**
- getAccessToken(userId, provider): get user's OAuth token for a connected service
  API: GET /v1/users/{userId}/oauth_access_tokens/{provider}
- proxy(request): fetch token → inject → forward
- ingestWebhook(workspaceId, rawInput): verify Svix signature, normalize

**Layer 2: Clerk-specific convenience methods**

a) **User Management**:
   - listUsers(opts?: { limit?, offset?, email?, query? }): list users
   - getUser(userId): get user details
   - updateUser(userId, data): update user metadata
   - deleteUser(userId): delete user
   - getUserExternalAccounts(userId): list connected OAuth accounts
   - getOAuthToken(userId, provider): get specific provider token

b) **Session Management**:
   - listSessions(opts?: { userId?, status? }): list sessions
   - getSession(sessionId): get session details
   - revokeSession(sessionId): revoke a session
   - verifySession(sessionId, token): verify session token

c) **Organization Management**:
   - listOrganizations(opts?): list organizations
   - getOrganization(orgId): get org details
   - listOrgMembers(orgId): list org members
   - createOrgInvitation(orgId, email, role): invite to org

d) **Webhook Verification**:
   - verifyWebhook(payload, headers): verify Svix signature
   - Clerk webhooks: user.created, user.updated, user.deleted,
     session.created, session.ended, organization.created, etc.

e) **JWT Verification**:
   - verifyToken(token): verify Clerk-issued JWT
   - getJWKS(): fetch Clerk's JWKS for local verification

Config:
\`\`\`typescript
interface ClerkConfig {
  secretKey: string;        // CLERK_SECRET_KEY
  publishableKey?: string;  // CLERK_PUBLISHABLE_KEY (for frontend)
  webhookSecret?: string;   // CLERK_WEBHOOK_SECRET (Svix)
  baseUrl?: string;         // default: https://api.clerk.com
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
      task: `Implement @relayfile/provider-clerk with full convenience layer.

Design: {{steps.design.output}}

Working in ${ROOT}.

1. Package: @relayfile/provider-clerk, deps on @relayfile/sdk
2. Files:
   - src/provider.ts — ClerkProvider (extends IntegrationProvider + convenience)
   - src/types.ts — ClerkConfig, ClerkUser, ClerkSession, ClerkOrganization, etc.
   - src/users.ts — user CRUD + external accounts
   - src/sessions.ts — session management
   - src/organizations.ts — org management
   - src/webhook.ts — Svix signature verification + event normalization
   - src/jwt.ts — JWT/JWKS verification
   - src/index.ts

3. Key details:
   - Auth: Bearer {secretKey} on all requests
   - OAuth tokens: GET /v1/users/{userId}/oauth_access_tokens/{provider}
     Returns array — use [0].token (most recent)
   - Webhook verification uses Svix standard (svix-id, svix-timestamp, svix-signature headers)
   - Pagination: offset-based (limit + offset params)

4. README, tests, build check
5. Commit feat/scaffold + push

End with IMPLEMENT_COMPLETE.`,
      verification: { type: 'output_contains', value: 'IMPLEMENT_COMPLETE' },
      timeout: 900_000,
    })

    .step('review', {
      agent: 'reviewer',
      dependsOn: ['implement'],
      task: `Review @relayfile/provider-clerk in ${ROOT}.
Verify: extends IntegrationProvider, has convenience layer (users, sessions, orgs, webhooks, JWT),
Svix verification correct, no hardcoded creds, pagination, tests, README.
Fix issues. Keep under 40 lines. End with REVIEW_COMPLETE.`,
      verification: { type: 'output_contains', value: 'REVIEW_COMPLETE' },
      timeout: 300_000,
    })

    .onError('retry', { maxRetries: 1, retryDelayMs: 10_000 })
    .run({ cwd: ROOT });

  console.log('Clerk provider complete:', result.status);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
