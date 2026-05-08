<p align="center">
  <img src="assets/banner.png" alt="Relayfile Providers — auth, proxy, and webhook plumbing for the relayfile filesystem" />
</p>

# Relayfile Providers

**Plug auth and API proxying into the relayfile filesystem — one provider integration unlocks every app it supports.**

Providers are the auth and transport layer for [relayfile](https://github.com/AgentWorkforce/relayfile). They handle OAuth tokens, API proxying, webhook subscriptions, and connection health for external services. Paired with [adapters](https://github.com/AgentWorkforce/relayfile-adapters) and [relayfile core](https://github.com/AgentWorkforce/relayfile), they expose every connected SaaS as a directory your agents can read and write.

Why providers matter: each provider integration is a multiplicative ceiling on what you can mount. One Nango provider package gives you auth + API access to ~200 apps. One Composio integration unlocks ~250. One Pipedream Connect integration covers 2000+. You don't write provider code per app — the provider handles all of them through one normalized auth surface. **This is the structural reason relayfile's resource ceiling beats per-resource VFS implementations: linear in-tree code grows linearly; one provider grows by hundreds.**

## Quick Start

```bash
npm install @relayfile/sdk @relayfile/provider-nango
```

### Getting started

**[Relayfile Cloud](https://relayfile.dev/pricing)** handles everything — auth, webhook routing, managed connections, agent permissions. No provider setup needed; connections are managed for you under a unified plan.

**Self-hosted:** Run the [Go server](https://github.com/AgentWorkforce/relayfile) and configure providers yourself. See the [adapters README](https://github.com/AgentWorkforce/relayfile-adapters#getting-started) for auth setup.

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
// baseUrl is optional — the provider resolves it from the connection.
const response = await provider.proxy({
  method: "GET",
  endpoint: "/repos/acme/api/pulls",
  connectionId: "connection_id_123",
});

// Override baseUrl when targeting a non-default API:
const customResponse = await provider.proxy({
  method: "GET",
  baseUrl: "https://uploads.github.com",
  endpoint: "/repos/acme/api/releases/1/assets",
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

## Why this scales

Relayfile's coverage isn't bounded by how fast we can land in-tree code for each new SaaS. It's bounded by how many providers exist — and each provider already covers a long tail of apps.

| One provider integration | Apps unlocked (approx.) |
|---|---|
| `@relayfile/provider-nango` | ~200 apps via [Nango](https://nango.dev) |
| `@relayfile/provider-composio` | ~250 apps via [Composio](https://composio.dev) |
| `@relayfile/provider-pipedream` | 2000+ apps via [Pipedream Connect](https://pipedream.com/connect) |
| `@relayfile/provider-clerk` | Every social provider Clerk supports |
| `@relayfile/provider-n8n` | 400+ credential types via [n8n](https://n8n.io) |

Compare to the typical "VFS for agents" approach, where every backend (S3, Postgres, Slack, …) is its own in-tree resource. That model scales linearly with engineering effort: one PR per new SaaS. The provider model scales multiplicatively: one PR per provider, hundreds of apps unlocked. Add a new adapter and it instantly works against any provider already wired in.

That's the architectural lever. Code count stays small; the surface area grows by the size of the provider's catalog.

## What Agents See

Agents never interact with providers — or any code at all. They just write files:

```bash
# Agent reads Slack messages — it's a file
cat /relayfile/slack/channels/general/messages.json

# Agent posts a reply — it writes a file
echo '{"text": "Got it, I will look into this."}' \
  > /relayfile/slack/channels/general/messages/reply.json

# Done. The message is now posted in Slack.
# No SDK, no OAuth, no Slack API. Just a file write.
```

The provider handles OAuth. The adapter handles posting to Slack's API. The agent doesn't know either exists. Providers exist so agents don't have to deal with auth — all the complexity is hidden behind the filesystem.

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

## How this compares

Other "give agents a filesystem" projects exist (e.g. [Mirage](https://github.com/strukto-ai/mirage)), and their work in this space is good. Their model is per-resource: each backend (S3, Postgres, Slack, …) is implemented in-tree as a resource type. That works well for storage and infra primitives.

Relayfile's model splits **what's mounted** (the [adapters](https://github.com/AgentWorkforce/relayfile-adapters)) from **how auth and API calls happen** (this repo's providers). One provider package authenticates against hundreds of apps. The result is a structurally larger ceiling for SaaS coverage — and a smaller per-app code footprint. Different shapes, different scopes; pick the one your work lives in.

## License

MIT
