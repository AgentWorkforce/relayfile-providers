# Relayfile Providers Boundary

Provider packages are the reusable integration boundary for Relayfile.

## Ownership

- Put external-provider API mechanics here: OAuth/connect-link calls, connection lookup, health checks, delete/disconnect, proxy request shaping, webhook normalization, trigger subscription helpers, records/listing helpers, and provider-specific error normalization.
- Keep packages platform-neutral. Do not import Cloud, SST `Resource`, Next.js, Drizzle, workspace database tables, Relayfile Cloud routes, or Cloud-only auth helpers.
- Read credentials from explicit provider config objects only. Do not read SST resources or Cloud env conventions inside provider packages.
- Expose typed helpers from the package barrel when Cloud or adapters need them. Do not make Cloud copy provider-specific REST calls just because a helper is missing.

## Cross-Repo Flow

- Cloud owns workspace auth, user/session checks, SST secret resolution, provider catalog policy, `workspace_integrations` persistence, sync queueing, and route responses.
- Provider packages own the third-party API details Cloud calls after policy has been resolved.
- When adding a new integration backend such as Composio, first add or tighten the provider-package primitive, then wire Cloud to it through a thin service wrapper.
