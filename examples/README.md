# Relayfile Provider Examples

End-to-end examples for the `relayfile-providers` monorepo.

All examples are organized around the shared `ConnectionProvider` contract from
`@relayfile/sdk`. That is the key point of the repo: adapters and app code
depend on one interface, while Nango, Composio, Clerk, Pipedream, Supabase, and
N8n stay swappable behind it.

## Examples

| # | Example | What it shows |
|---|---------|---------------|
| 01 | [Nango GitHub Proxy](./01-nango-github-proxy/) | `ConnectionProvider.proxy()` with Nango, including `baseUrl` override |
| 02 | [Composio Proxy](./02-composio-proxy/) | `ConnectionProvider.proxy()` with Composio plus Composio-specific extras |
| 03 | [Provider + Adapter](./03-provider-with-adapter/) | **Core pattern** — adapter depends only on `ConnectionProvider` |
| 04 | [Multi-Provider](./04-multi-provider/) | Registry of interchangeable `ConnectionProvider` instances |
| 05 | [Health & Connections](./05-health-and-connections/) | Shared `healthCheck()` plus provider-specific diagnostics |

## Shared contract

All providers in this repo expose the same core surface:

```ts
import type { ConnectionProvider, ProxyRequest } from "@relayfile/sdk";

async function send(provider: ConnectionProvider, request: ProxyRequest) {
  return provider.proxy(request);
}
```

That lets you:

- swap providers at runtime without changing adapter code
- keep routing and writeback logic provider-agnostic
- add provider-specific convenience methods only where you actually need them

## Running

All examples are standalone TypeScript files. From the repo root:

```bash
npm install
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

## Docker

Run any example in a container:

```bash
docker run --rm --env-file .env \
  -v "$PWD":/app -w /app node:20-slim \
  npx tsx examples/01-nango-github-proxy/index.ts
```

Notes:

- Run `npm install` on the host first so the mounted repo includes `node_modules`.
- Keep secrets in `.env` and pass them with `--env-file .env`.
- Examples that enable Clerk, Pipedream, Supabase, or N8n also need `RELAYFILE_TOKEN`.
- This repo documents `docker run` rather than a checked-in `docker-compose.yml`.

## `baseUrl` is optional

All providers resolve `baseUrl` from the connection when omitted in `proxy()` calls. Override it only when targeting a non-default API host (e.g. `uploads.github.com` instead of `api.github.com`).
