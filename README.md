# Relayfile Providers

Auth and credential management for external services. Providers handle OAuth tokens, API proxying, webhook subscriptions, and connection health checks.

Used with [relayfile adapters](https://github.com/AgentWorkforce/relayfile-adapters) to connect external services to the relayfile VFS.

## Quick Start

```bash
npm install @relayfile/sdk @relayfile/provider-nango
```

### Connect a provider to relayfile

```ts
import { RelayFileClient } from "@relayfile/sdk";
import { NangoProvider } from "@relayfile/provider-nango";

// 1. Connect to relayfile (defaults to api.relayfile.dev)
const relayfile = new RelayFileClient({
  token: process.env.RELAYFILE_TOKEN!,
});

// 2. Create a provider
const provider = new NangoProvider(relayfile, {
  secretKey: process.env.NANGO_SECRET_KEY!,
});

// 3. Get an access token for a user's connection
const token = await provider.getAccessToken("connection_id_123");

// 4. Proxy an API call through the provider (handles auth automatically)
const response = await provider.proxy({
  method: "GET",
  baseUrl: "https://api.github.com",
  endpoint: "/repos/acme/api/pulls",
  connectionId: "connection_id_123",
});

// 5. Check connection health
const healthy = await provider.healthCheck("connection_id_123");
```

### Use with an adapter

Providers are designed to pair with [adapters](https://github.com/AgentWorkforce/relayfile-adapters):

```ts
import { GitHubAdapter } from "@relayfile/adapter-github";
import { NangoProvider } from "@relayfile/provider-nango";

const provider = new NangoProvider(relayfile, {
  secretKey: process.env.NANGO_SECRET_KEY!,
});

const adapter = new GitHubAdapter({ provider });

// Adapter uses the provider for auth when writing back to GitHub
await adapter.writeback({
  provider,
  connectionId: "conn_abc",
  path: "/github/repos/acme/api/pulls/42/comments",
  payload: { body: "Looks good!" },
});
```

### Multiple providers

You can use different providers for different services:

```ts
import { NangoProvider } from "@relayfile/provider-nango";
import { ClerkProvider } from "@relayfile/provider-clerk";
import { PipedreamProvider } from "@relayfile/provider-pipedream";

// Nango for GitHub, Slack, etc. (managed OAuth)
const nango = new NangoProvider(relayfile, { secretKey: "..." });

// Clerk for end-user OAuth tokens
const clerk = new ClerkProvider(relayfile, { secretKey: "..." });
const userGithubToken = await clerk.getOAuthToken(userId, "github");

// Pipedream for 2400+ APIs via Connect
const pipedream = new PipedreamProvider(relayfile, {
  clientId: "...",
  clientSecret: "...",
  projectId: "...",
});
```

## What Agents See

Agents never interact with providers. They read and write files:

```ts
// Agent reads Slack messages — they're just files
const messages = await relayfile.getFile(workspaceId, "/slack/channels/general/messages.json");

// Agent posts a reply — just writes a file
await relayfile.putFile(workspaceId, "/slack/channels/general/messages/reply.json", {
  content: JSON.stringify({ text: "Got it, I'll look into this." }),
});

// The provider handles OAuth, the adapter handles posting to Slack's API.
// The agent doesn't know or care about either.
```

Providers exist so agents don't have to. All the auth complexity is hidden behind the filesystem abstraction.

## How It Fits Together

```
┌──────────────────────────────────────────────────┐
│                  Your App / Agent                 │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐ │
│  │ Adapter  │──▶│ Provider │──▶│   relayfile   │ │
│  │ (GitHub) │   │ (Nango)  │   │   (VFS)       │ │
│  └──────────┘   └──────────┘   └──────────────┘ │
│                      │                           │
│                      │ OAuth tokens              │
│                      │ API proxy                 │
│                      ▼                           │
│               External APIs                      │
│          (GitHub, Slack, etc.)                    │
└──────────────────────────────────────────────────┘
```

- **Provider** = _how_ to authenticate (OAuth, API keys, tokens)
- **Adapter** = _what_ data to map and _where_ it goes in the VFS
- **Relayfile** = file-based storage that agents read from

## Packages

| Package | Description |
|---------|-------------|
| `@relayfile/provider-nango` | [Nango](https://nango.dev) — managed OAuth + 250+ integrations |
| `@relayfile/provider-composio` | [Composio](https://composio.dev) — entity management + action execution |
| `@relayfile/provider-pipedream` | [Pipedream Connect](https://pipedream.com/connect) — 2400+ APIs |
| `@relayfile/provider-clerk` | [Clerk](https://clerk.com) — end-user OAuth tokens |
| `@relayfile/provider-supabase` | [Supabase Auth](https://supabase.com/auth) — social connections |
| `@relayfile/provider-n8n` | [n8n](https://n8n.io) — credential store (400+ types) |

## Implementing a Provider

Extend the `IntegrationProvider` abstract class from `@relayfile/sdk`:

```ts
import { IntegrationProvider } from "@relayfile/sdk";
import type { WebhookInput, ProxyRequest, ProxyResponse } from "@relayfile/sdk";

export class MyProvider extends IntegrationProvider {
  async getAccessToken(connectionId: string): Promise<string> {
    // Return an OAuth token for this connection
  }

  async proxy(request: ProxyRequest): Promise<ProxyResponse> {
    // Forward the request with auth headers injected
  }

  async healthCheck(connectionId: string): Promise<boolean> {
    // Check if the connection is still valid
  }

  async ingestWebhook(workspaceId: string, payload: unknown): Promise<WebhookInput> {
    // Normalize an incoming webhook from the provider
  }
}
```

## Development

```bash
npm install
npx turbo build
npx turbo test
```

## License

MIT
