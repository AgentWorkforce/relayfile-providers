# 01 — Nango GitHub Proxy

Proxy GitHub API requests through Nango with automatic OAuth token injection.

## Key concepts

- **`baseUrl` is optional** — the provider resolves it from the connection's provider-config-key.
- Override `baseUrl` when targeting a non-default API host (e.g. `uploads.github.com`).
- No `RelayFileClient` needed for Nango — just `secretKey`.

## Setup

```bash
export NANGO_SECRET_KEY="your-nango-secret-key"
export NANGO_CONNECTION_ID="conn_github_demo"
```

## Run

```bash
npx tsx examples/01-nango-github-proxy/index.ts
```

## Mock testing

Without real credentials the Nango API will reject requests. To test the
wiring locally, swap in a mock `fetch` via the provider config:

```ts
const nango = new NangoProvider({
  secretKey: "mock",
  fetch: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
});
```
