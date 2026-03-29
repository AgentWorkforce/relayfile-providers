# 02 — Composio Proxy

Proxy API calls and execute actions through Composio connected accounts.
Like the Nango example, the proxy path goes through the shared
`ConnectionProvider` contract first, then drops into Composio-specific methods
for convenience features.

## Key concepts

- **Toolkit resolution** — `lookupAction()` maps a proxy request to the right Composio action/toolkit.
- **`baseUrl` is optional** — resolved from the connected account.
- **Interchangeable contract** — `proxy()` uses the same SDK request shape as Nango.
- **Action execution** — call Composio actions directly with `executeAction()`.
- No `RelayFileClient` needed for Composio — just `apiKey`.

## Setup

```bash
export COMPOSIO_API_KEY="your-composio-api-key"
export COMPOSIO_ENTITY_ID="entity_demo"
export COMPOSIO_CONNECTION_ID="conn_composio_demo"
```

## Run

```bash
npx tsx examples/02-composio-proxy/index.ts
```

## Docker

```bash
docker run --rm --env-file .env \
  -v "$PWD":/app -w /app node:20-slim \
  npx tsx examples/02-composio-proxy/index.ts
```

## Mock testing

Swap in a mock `fetch` to test locally without real credentials:

```ts
const composio = new ComposioProvider({
  apiKey: "mock",
  fetch: async () => new Response(JSON.stringify({ items: [] }), { status: 200 }),
});
```
