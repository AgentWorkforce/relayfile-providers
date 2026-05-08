# Nango Provider Package

This package owns reusable Nango mechanics for Relayfile.

## Put Here

- Nango Connect session creation and reconnect/session helpers.
- Connection list/detail/delete/health helpers.
- Proxy request shaping, token refresh behavior, records/listRecords helpers, and webhook normalization.
- Nango response parsing, fallback endpoint handling, and provider-specific error normalization.

## Keep Out

- Do not import Cloud code, SST `Resource`, Next.js route modules, Drizzle schemas, or workspace database helpers.
- Do not hardcode Agent Relay workspace policy or provider catalog aliases here. Accept concrete Nango config keys and connection ids from callers.
- Do not read `NANGO_SECRET_KEY` directly. Callers pass `secretKey` in `NangoProviderConfig` or `NangoConnectionServiceConfig`.

Cloud may keep a temporary compatibility fallback while a newly published package version rolls out, but new Nango API behavior should be added here first.
