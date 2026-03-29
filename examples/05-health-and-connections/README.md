# 05 — Health Checks & Connection Listing

Monitor connection health and list active connections across providers.
This example starts from the shared `ConnectionProvider.healthCheck()` contract,
then layers in the extra diagnostics each provider exposes.

## Key concepts

- **`healthCheck()`** — simple boolean: is the connection alive?
- **`getConnectionHealth()`** (Nango) — detailed diagnostic with reasons and details.
- **Standalone functions** — `healthCheckNangoConnection()` works without a provider instance, useful in serverless/edge.
- **`listConnections()`** — enumerate all connections, optionally filtered by provider.
- **`listConnectedAccounts()`** (Composio) — list connected accounts.

## Setup

```bash
export NANGO_SECRET_KEY="your-nango-secret-key"
export COMPOSIO_API_KEY="your-composio-api-key"
export CONNECTION_ID="conn_demo"
```

## Run

```bash
npx tsx examples/05-health-and-connections/index.ts
```

Without real credentials, all calls will fail gracefully with descriptive error messages — useful for seeing the API shape.

## Docker

```bash
docker run --rm --env-file .env \
  -v "$PWD":/app -w /app node:20-slim \
  npx tsx examples/05-health-and-connections/index.ts
```
