# @relayfile/provider-pipedream

Relayfile provider for Pipedream Connect. It extends Relayfile's `IntegrationProvider` and adds a convenience layer for Connect tokens, accounts, apps, actions, triggers, deployed trigger webhooks, and workflow invocation.

## Install

```bash
npm install @relayfile/provider-pipedream @relayfile/sdk
```

## Quick start

```ts
import { RelayFileClient } from "@relayfile/sdk";
import { PipedreamProvider } from "@relayfile/provider-pipedream";

const relayfile = new RelayFileClient({
  baseUrl: process.env.RELAYFILE_BASE_URL!,
  token: process.env.RELAYFILE_TOKEN!,
});

const provider = new PipedreamProvider(relayfile, {
  clientId: process.env.PIPEDREAM_CLIENT_ID!,
  clientSecret: process.env.PIPEDREAM_CLIENT_SECRET!,
  projectId: process.env.PIPEDREAM_PROJECT_ID!,
  environment: "production",
});

const token = await provider.createConnectToken("user_123");
const accounts = await provider.listAccounts({ externalUserId: "user_123" });
```

## Generic provider usage

```ts
const accessToken = await provider.getAccessToken("apn_123");

const response = await provider.proxy({
  method: "GET",
  baseUrl: "https://slack.com",
  endpoint: "/api/auth.test",
  connectionId: "apn_123",
  headers: {
    "x-pd-external-user-id": "user_123",
  },
});

await provider.ingestWebhook("ws_acme", rawWebhookPayload);
```

`proxy()` needs an `external_user_id` for Pipedream's proxy API. Pass it via:

- `x-pd-external-user-id` header on the proxy request
- `external_user_id` query param on the proxy request
- `config.resolveExternalUserId(account)`
- Hidden `external_user_id` fields if Pipedream includes them in the account payload

## Convenience examples

```ts
await provider.createConnectToken("user_123", {
  allowedOrigins: ["https://app.example.com"],
  webhookUri: "https://api.example.com/pipedream/webhooks",
});

await provider.invokeAction("com_slack-send-message", {
  externalUserId: "user_123",
  configuredProps: {
    slack: "apn_123",
    channel: "#general",
    text: "hello",
  },
});

await provider.deployTrigger({
  id: "com_google_drive-new-file",
  externalUserId: "user_123",
  workflowId: "p_abc123",
});
```

## Environment

Required:

- `PIPEDREAM_CLIENT_ID`
- `PIPEDREAM_CLIENT_SECRET`
- `PIPEDREAM_PROJECT_ID`

Optional:

- `PIPEDREAM_ENVIRONMENT=development|production`
- `PIPEDREAM_BASE_URL` defaults to `https://api.pipedream.com`
- `PIPEDREAM_WORKFLOW_BASE_URL` for relative workflow invocation targets
- `PIPEDREAM_TOKEN_SCOPE` if you need to override the default `*` client-credentials scope

## Operational notes

- Credentials are injected from your runtime config or environment variables. The package does not ship hardcoded API credentials.
- `PipedreamAuthSession` caches the OAuth bearer token until shortly before expiry and coalesces concurrent refreshes into one request.
- List endpoints expose cursor pagination via `cursor`/`before` and return normalized `pageInfo` metadata.

## Reference

- [PipedreamHQ/pipedream](https://github.com/PipedreamHQ/pipedream) — Pipedream's open-source repo with 1000+ pre-built integration components, event sources, and actions. Useful for discovering available apps and component IDs when invoking actions via `provider.invokeAction()`.

## Notes

- Account credentials are only returned when the connected account uses your own OAuth client.
- Pipedream's public OpenAPI currently documents deleting an external user but does not expose a public list-users endpoint. `listUsers()` is implemented as a derived view over `listAccounts()` plus any external-user metadata available in the account payload or resolver callback.
