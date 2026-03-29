/**
 * 052-supabase-provider-scaffold.ts
 *
 * Build @relayfile/provider-supabase — full Supabase Auth integration.
 *
 * Supabase Auth docs: https://supabase.com/docs/guides/auth
 * Admin API: https://supabase.com/docs/reference/javascript/admin-api
 *
 * Supabase Auth handles user auth + social OAuth connections.
 * The provider wraps the Admin API for user management and token retrieval,
 * plus the GoTrue API for session/token operations.
 *
 * Run: agent-relay run workflows/052-supabase-provider-scaffold.ts
 */

import { workflow } from '@agent-relay/sdk/workflows';

const ROOT = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-supabase';
const SDK_ROOT = '/Users/khaliqgant/Projects/AgentWorkforce-relayfile';
const NANGO_REF = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-nango';

async function main() {
  const result = await workflow('supabase-provider-scaffold')
    .description('Build @relayfile/provider-supabase — full Supabase Auth provider')
    .pattern('linear')
    .channel('wf-supabase')
    .maxConcurrency(2)
    .timeout(2_400_000)

    .agent('architect', { cli: 'claude', role: 'Designs the full Supabase provider' })
    .agent('builder', { cli: 'codex', preset: 'worker', role: 'Implements the provider' })
    .agent('reviewer', { cli: 'codex', preset: 'worker', role: 'Reviews and tests' })

    .step('design', {
      agent: 'architect',
      task: `Design @relayfile/provider-supabase with full convenience layer.

Read the relayfile SDK provider interface:
- ${SDK_ROOT}/packages/sdk/typescript/src/provider.ts — IntegrationProvider abstract class

Read the Nango provider for reference:
- ${NANGO_REF}/

Supabase Auth API surface:
- GoTrue base: {SUPABASE_URL}/auth/v1
- Admin API: requires service_role key (full access)
- Headers: apikey: {anon_key or service_role_key}, Authorization: Bearer {service_role_key}
- Users have identities array (linked OAuth providers with tokens)

Design TWO layers:

**Layer 1: Generic IntegrationProvider interface**
- getAccessToken(userId, provider): extract provider_token from user's identities
  API: GET /auth/v1/admin/users/{userId} → identities[provider].identity_data.provider_token
- proxy(request): fetch token → inject → forward
- ingestWebhook(workspaceId, rawInput): normalize auth webhook events

**Layer 2: Supabase-specific convenience methods**

a) **User Management** (Admin API):
   - listUsers(opts?: { page?, perPage?, filter? }): list all users
   - getUser(userId): get user with identities
   - createUser(data: { email, password?, metadata? }): create user
   - updateUser(userId, data): update user attributes
   - deleteUser(userId): delete user
   - getUserIdentities(userId): list linked OAuth providers
   - unlinkIdentity(userId, identityId): unlink OAuth provider

b) **Token Operations**:
   - getProviderToken(userId, provider): extract OAuth token for a provider
   - refreshSession(refreshToken): refresh an expired session
   - generateLink(type, email, opts?): generate magic link, signup, invite links
   - getSession(jwt): verify and decode a session JWT

c) **OAuth / SSO**:
   - listFactors(userId): list MFA factors
   - listSSO(opts?): list SSO providers
   - createSSOProvider(data): add SAML/OIDC SSO provider

d) **Webhook Handling**:
   - Supabase uses Database Webhooks or Auth Hooks
   - Auth events: user signup (INSERT on auth.users), password change, etc.
   - Auth Hooks: custom JWT claims, MFA verification
   - verifyWebhook(payload, secret): verify webhook signature

Config:
\`\`\`typescript
interface SupabaseConfig {
  supabaseUrl: string;         // SUPABASE_URL
  serviceRoleKey: string;      // SUPABASE_SERVICE_ROLE_KEY
  anonKey?: string;            // SUPABASE_ANON_KEY (for client-side)
  webhookSecret?: string;      // SUPABASE_WEBHOOK_SECRET
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
      task: `Implement @relayfile/provider-supabase with full convenience layer.

Design: {{steps.design.output}}

Working in ${ROOT}.

1. Package: @relayfile/provider-supabase, deps on @relayfile/sdk
2. Files:
   - src/provider.ts — SupabaseProvider (extends IntegrationProvider + convenience)
   - src/types.ts — SupabaseConfig, SupabaseUser, SupabaseIdentity, etc.
   - src/users.ts — user CRUD via Admin API
   - src/tokens.ts — provider token extraction, session refresh
   - src/webhook.ts — webhook verification + normalization
   - src/index.ts

3. Key details:
   - Admin API requires service_role_key (NOT anon key)
   - Both apikey header AND Authorization: Bearer header needed
   - Provider tokens are nested: user.identities[].identity_data.provider_token
   - Pagination: page + per_page params
   - No external deps beyond @relayfile/sdk

4. README, tests, build check
5. Commit feat/scaffold + push

End with IMPLEMENT_COMPLETE.`,
      verification: { type: 'output_contains', value: 'IMPLEMENT_COMPLETE' },
      timeout: 900_000,
    })

    .step('review', {
      agent: 'reviewer',
      dependsOn: ['implement'],
      task: `Review @relayfile/provider-supabase in ${ROOT}.
Verify: extends IntegrationProvider, convenience layer (users, tokens, identities, webhooks),
service_role_key used correctly, provider token extraction from identities array,
no hardcoded creds, pagination, tests, README.
Fix issues. Keep under 40 lines. End with REVIEW_COMPLETE.`,
      verification: { type: 'output_contains', value: 'REVIEW_COMPLETE' },
      timeout: 300_000,
    })

    .onError('retry', { maxRetries: 1, retryDelayMs: 10_000 })
    .run({ cwd: ROOT });

  console.log('Supabase provider complete:', result.status);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
