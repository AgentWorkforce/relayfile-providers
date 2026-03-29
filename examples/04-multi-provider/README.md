# 04 — Multiple Providers

Use different providers for different services in a single application.
The registry is explicitly typed as `Record<string, ConnectionProvider>` so
requests can be routed without coupling the rest of the app to any provider's
concrete class.

## Key concepts

- **Nango / Composio** are standalone — no `RelayFileClient` needed.
- **Clerk / Pipedream / Supabase / N8n** require a `RelayFileClient` instance.
- Use a **registry pattern** to route requests dynamically by provider name.
- Each provider's `proxy()` method has the same shape, so switching is seamless.

## Provider matrix

| Provider | Needs RelayFileClient | Config |
|----------|----------------------|--------|
| Nango | No | `secretKey` |
| Composio | No | `apiKey` |
| Clerk | Yes | `secretKey` |
| Pipedream | Yes | `clientId`, `clientSecret`, `projectId` |
| Supabase | Yes | `supabaseUrl`, `serviceRoleKey` |
| N8n | Yes | `baseUrl`, `apiKey` |

## Run

```bash
npx tsx examples/04-multi-provider/index.ts
```

The example initializes Nango and Composio (standalone) and shows commented-out stubs for the remaining providers.

## Docker

```bash
docker run --rm --env-file .env \
  -v "$PWD":/app -w /app node:20-slim \
  npx tsx examples/04-multi-provider/index.ts
```
