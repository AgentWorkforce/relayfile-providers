# Relayfile Provider Examples

End-to-end examples for the `relayfile-providers` monorepo.

## Examples

| # | Example | What it shows |
|---|---------|---------------|
| 01 | [Nango GitHub Proxy](./01-nango-github-proxy/) | Proxy GitHub API without `baseUrl`; override for `uploads.github.com` |
| 02 | [Composio Proxy](./02-composio-proxy/) | Proxy + toolkit resolution from connected accounts |
| 03 | [Provider + Adapter](./03-provider-with-adapter/) | **Core pattern** — webhook normalization + adapter writeback |
| 04 | [Multi-Provider](./04-multi-provider/) | Multiple providers in one app with a registry pattern |
| 05 | [Health & Connections](./05-health-and-connections/) | Health checks, connection listing, detailed diagnostics |

## Running

All examples are standalone TypeScript files. Run with:

```bash
npx tsx examples/<example-dir>/index.ts
```

## Credentials

Examples use environment variables for secrets. Without real credentials, API calls will fail — this is expected. Each example handles errors gracefully so you can see the API shape.

For local testing, providers that accept a `fetch` option can be configured with a mock:

```ts
const provider = new NangoProvider({
  secretKey: "mock",
  fetch: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
});
```

## Provider requirements

| Provider | Needs RelayFileClient | Standalone |
|----------|----------------------|------------|
| Nango | No | Yes |
| Composio | No | Yes |
| Clerk | Yes | No |
| Pipedream | Yes | No |
| Supabase | Yes | No |
| N8n | Yes | No |

## `baseUrl` is optional

All providers resolve `baseUrl` from the connection when omitted in `proxy()` calls. Override it only when targeting a non-default API host (e.g. `uploads.github.com` instead of `api.github.com`).
