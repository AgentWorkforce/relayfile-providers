/**
 * 054-n8n-provider-scaffold.ts
 *
 * Build @relayfile/provider-n8n — full n8n instance API integration.
 *
 * n8n REST API: https://docs.n8n.io/api/
 * Credentials: https://docs.n8n.io/api/api-reference/#tag/Credential
 *
 * n8n stores 400+ credential types. This provider retrieves credentials
 * for use in relayfile operations AND wraps n8n's full API for workflow
 * management, execution, and node operations.
 *
 * Run: agent-relay run workflows/054-n8n-provider-scaffold.ts
 */

import { workflow } from '@agent-relay/sdk/workflows';

const ROOT = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-n8n';
const SDK_ROOT = '/Users/khaliqgant/Projects/AgentWorkforce-relayfile';
const NANGO_REF = '/Users/khaliqgant/Projects/AgentWorkforce/relayfile-provider-nango';

async function main() {
  const result = await workflow('n8n-provider-scaffold')
    .description('Build @relayfile/provider-n8n — full n8n instance API provider')
    .pattern('linear')
    .channel('wf-n8n-provider')
    .maxConcurrency(2)
    .timeout(2_400_000)

    .agent('architect', { cli: 'claude', role: 'Designs the full n8n provider' })
    .agent('builder', { cli: 'codex', preset: 'worker', role: 'Implements the provider' })
    .agent('reviewer', { cli: 'codex', preset: 'worker', role: 'Reviews and tests' })

    .step('design', {
      agent: 'architect',
      task: `Design @relayfile/provider-n8n with full convenience layer.

Read the relayfile SDK provider interface:
- ${SDK_ROOT}/packages/sdk/typescript/src/provider.ts — IntegrationProvider abstract class

Read the Nango provider for reference:
- ${NANGO_REF}/

Fetch and read n8n API docs:
- https://docs.n8n.io/api/api-reference/

n8n REST API surface:
- Base URL: {N8N_BASE_URL}/api/v1
- Auth: X-N8N-API-KEY header OR basic auth (user + password)
- Self-hosted — URL varies per installation
- Credentials are encrypted at rest, decrypted when returned via API

Design TWO layers:

**Layer 1: Generic IntegrationProvider interface**
- getAccessToken(credentialId, type?): fetch credential data, extract token
  API: GET /api/v1/credentials/{credentialId}
  Parse based on type: oAuth2Api → access_token, githubApi → token, etc.
- proxy(request): fetch credential → extract token → inject → forward
- ingestWebhook(workspaceId, rawInput): normalize n8n webhook node events

**Layer 2: n8n-specific convenience methods**

a) **Credential Management**:
   - listCredentials(opts?: { type?, cursor? }): list all credentials
   - getCredential(credentialId): get credential with decrypted data
   - createCredential(data): create new credential
   - updateCredential(credentialId, data): update credential
   - deleteCredential(credentialId): delete credential
   - getCredentialSchema(type): get schema for a credential type

b) **Workflow Management**:
   - listWorkflows(opts?: { active?, tags? }): list workflows
   - getWorkflow(workflowId): get workflow definition
   - activateWorkflow(workflowId): activate a workflow
   - deactivateWorkflow(workflowId): deactivate a workflow
   - executeWorkflow(workflowId, data?): trigger workflow execution

c) **Execution History**:
   - listExecutions(opts?: { workflowId?, status?, limit? }): list executions
   - getExecution(executionId): get execution details
   - deleteExecution(executionId): delete execution

d) **Webhook Handling**:
   - n8n Webhook nodes expose URLs: {N8N_URL}/webhook/{path}
   - Production vs test webhooks
   - Normalize incoming webhook data to relayfile events

e) **Node/App Discovery**:
   - listNodeTypes(): get available node types
   - Useful for knowing what integrations the n8n instance supports

Config:
\`\`\`typescript
interface N8nConfig {
  baseUrl: string;        // N8N_BASE_URL (e.g., http://localhost:5678)
  apiKey?: string;        // N8N_API_KEY (header auth)
  username?: string;      // N8N_USERNAME (basic auth alternative)
  password?: string;      // N8N_PASSWORD (basic auth alternative)
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
      task: `Implement @relayfile/provider-n8n with full convenience layer.

Design: {{steps.design.output}}

Working in ${ROOT}.

1. Package: @relayfile/provider-n8n, deps on @relayfile/sdk
2. Files:
   - src/provider.ts — N8nProvider (extends IntegrationProvider + convenience)
   - src/types.ts — N8nConfig, N8nCredential, N8nWorkflow, N8nExecution, etc.
   - src/credentials.ts — credential CRUD + token extraction
   - src/workflows.ts — workflow management + execution
   - src/executions.ts — execution history
   - src/webhook.ts — webhook normalization
   - src/index.ts

3. Key details:
   - Auth: X-N8N-API-KEY header OR Basic auth (base64 user:pass)
   - Credential types vary widely — need type-specific token extraction:
     oAuth2Api → data.access_token
     githubApi → data.token
     slackApi → data.token
     Generic → return full data object
   - Self-hosted: URL is always user-configured
   - Pagination: cursor-based

4. README with setup guide (self-hosted n8n, API key generation)
5. Tests, build check
6. Commit feat/scaffold + push

End with IMPLEMENT_COMPLETE.`,
      verification: { type: 'output_contains', value: 'IMPLEMENT_COMPLETE' },
      timeout: 900_000,
    })

    .step('review', {
      agent: 'reviewer',
      dependsOn: ['implement'],
      task: `Review @relayfile/provider-n8n in ${ROOT}.
Verify: extends IntegrationProvider, convenience layer (credentials, workflows, executions),
supports both API key and basic auth, credential type-specific token extraction,
no hardcoded creds, pagination, tests, README with self-hosted setup.
Fix issues. Keep under 40 lines. End with REVIEW_COMPLETE.`,
      verification: { type: 'output_contains', value: 'REVIEW_COMPLETE' },
      timeout: 300_000,
    })

    .onError('retry', { maxRetries: 1, retryDelayMs: 10_000 })
    .run({ cwd: ROOT });

  console.log('n8n provider complete:', result.status);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
