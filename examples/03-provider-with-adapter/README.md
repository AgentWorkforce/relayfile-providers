# 03 — Provider + Adapter (interchangeable)

The adapter depends on `ConnectionProvider` from `@relayfile/sdk`, not a concrete provider class. Swap `NangoProvider` ↔ `ComposioProvider` without changing adapter code.

## Flow

```
Adapter(provider: ConnectionProvider)
  → adapter.writeback()  → provider.proxy()  → external API
```

## Interchangeability

```ts
import type { ConnectionProvider } from "@relayfile/sdk";

class GitHubAdapterStub {
  constructor(private provider: ConnectionProvider) {}
  // works with Nango, Composio, Clerk, Pipedream, …
}
```

Switch at runtime:

```bash
PROVIDER=nango    npx tsx examples/03-provider-with-adapter/index.ts
PROVIDER=composio npx tsx examples/03-provider-with-adapter/index.ts
```

## Docker

```bash
docker run --rm --env-file .env -e PROVIDER=nango \
  -v "$PWD":/app -w /app node:20-slim \
  npx tsx examples/03-provider-with-adapter/index.ts
```

Swap providers in the container the same way:

```bash
docker run --rm --env-file .env -e PROVIDER=composio \
  -v "$PWD":/app -w /app node:20-slim \
  npx tsx examples/03-provider-with-adapter/index.ts
```
