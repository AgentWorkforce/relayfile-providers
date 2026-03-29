# @relayfile/provider-supabase

Relayfile provider package for Supabase Auth. It combines the SDK `IntegrationProvider`
contract with a convenience layer for Supabase Admin, token lookup, session refresh,
SSO, MFA, and webhook normalization.

## Install

```bash
npm install @relayfile/provider-supabase @relayfile/sdk
```

## Usage

```ts
import { RelayFileClient } from "@relayfile/sdk";
import { SupabaseProvider } from "@relayfile/provider-supabase";

const client = new RelayFileClient({
  baseUrl: process.env.RELAYFILE_URL!,
  token: process.env.RELAYFILE_TOKEN!,
});

const provider = new SupabaseProvider(client, {
  supabaseUrl: process.env.SUPABASE_URL!,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  anonKey: process.env.SUPABASE_ANON_KEY,
  webhookSecret: process.env.SUPABASE_WEBHOOK_SECRET,
});
```

## Features

- `ingestWebhook(workspaceId, rawInput)`: normalize Supabase auth/database events into Relayfile.
- `proxy(request)`: resolve an OAuth provider token from `user.identities[]` and forward an authenticated API call.
- User management: `listUsers`, `getUser`, `createUser`, `updateUser`, `deleteUser`, `getUserIdentities`, `unlinkIdentity`.
- Token/session helpers: `getAccessToken`, `getProviderToken`, `refreshSession`, `generateLink`, `getSession`.
- Auth admin helpers: `listFactors`, `listSSO`, `createSSOProvider`.
- Webhook helpers: `normalizeSupabaseWebhook`, `verifyWebhook`.

## Security And Auth Modes

- Admin endpoints use `serviceRoleKey` for both `apikey` and `Authorization: Bearer ...`.
- Session refresh and JWT verification use `anonKey` when provided, otherwise they fall back to `serviceRoleKey`.
- The package does not embed credentials; configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optional keys via environment variables.

## Pagination

- `listUsers({ page, perPage, filter })` forwards Supabase's `page` and `per_page` query params and returns `{ users, page, perPage, total? }`.
- `listSSO({ page, perPage, filter })` forwards the same pagination params to the SSO admin endpoint.

## Proxy Provider Resolution

`ProxyRequest` does not carry a dedicated provider name, so this package resolves it in this order:

1. `x-supabase-provider` request header
2. `provider` query parameter
3. Base URL hostname mapping for common APIs such as GitHub, Slack, Google, Notion, Linear, and Discord

If none of those resolve, `proxy()` throws and asks for `x-supabase-provider`.

## Scripts

- `npm run build`
- `npm run test`
- `npm run typecheck`
