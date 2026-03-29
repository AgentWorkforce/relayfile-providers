# 03 — Provider + Adapter

**This is the most important example.** It demonstrates the core relayfile pattern: providers handle auth while adapters normalize data and write back.

## Flow

```
Webhook (GitHub event)
  → NangoProvider.handleWebhook()   — normalizes into NormalizedWebhook
  → GitHubAdapter.mapWebhookToPath() — maps to VFS path
  → GitHubAdapter.writeback()        — calls provider.proxy() to post back
  → NangoProvider.proxy()            — injects OAuth token, forwards to GitHub
```

## Key concepts

- **Provider** = auth layer. Handles OAuth tokens, proxies API calls.
- **Adapter** = data layer. Normalizes webhooks, maps to VFS paths, writes back through the provider.
- Agents never see the provider or adapter — they just read/write files.
- `baseUrl` is optional on writeback — the provider resolves it.

## Setup

```bash
export NANGO_SECRET_KEY="your-nango-secret-key"
export NANGO_CONNECTION_ID="conn_github_demo"
```

## Run

```bash
npx tsx examples/03-provider-with-adapter/index.ts
```

The example uses mock webhook data so it runs without real GitHub events. The writeback call will fail without valid credentials — this is expected and handled.

## In production

Replace `GitHubAdapterStub` with the real `@relayfile/adapter-github`:

```ts
import { GitHubAdapter } from "@relayfile/adapter-github";
import { NangoProvider } from "@relayfile/provider-nango";

const provider = new NangoProvider({ secretKey: process.env.NANGO_SECRET_KEY! });
const adapter = new GitHubAdapter({ provider });

await adapter.writeback({
  provider,
  connectionId: "conn_abc",
  path: "/github/repos/acme/api/pulls/42/comments",
  payload: { body: "Looks good!" },
});
```
