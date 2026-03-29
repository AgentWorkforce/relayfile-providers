# @relayfile/provider-clerk

Clerk provider for Relayfile with two layers:

- `IntegrationProvider` support for webhook ingestion into Relayfile
- `ConnectionProvider` support for OAuth token lookup and authenticated proxying

It also exposes Clerk-specific convenience methods for users, sessions, organizations, Svix webhook verification, and Clerk JWT/JWKS verification.

## Install

```bash
npm install @relayfile/provider-clerk @relayfile/sdk
```

## Usage

```ts
import { RelayFileClient } from "@relayfile/sdk";
import { ClerkProvider } from "@relayfile/provider-clerk";

const client = new RelayFileClient({
  apiKey: process.env.RELAYFILE_API_KEY!,
});

const clerk = new ClerkProvider(client, {
  secretKey: process.env.CLERK_SECRET_KEY!,
  webhookSecret: process.env.CLERK_WEBHOOK_SECRET,
});

const githubToken = await clerk.getAccessToken("user_123", "oauth_github");

const response = await clerk.proxy({
  method: "GET",
  baseUrl: "https://api.github.com",
  endpoint: "/user",
  connectionId: "user_123",
  headers: {
    "x-clerk-provider": "oauth_github",
  },
});

const users = await clerk.listUsers({ limit: 25, offset: 0 });
console.log(users.totalCount);
```

## Exposed methods

- `getAccessToken(userId, provider)`
- `proxy(request)`
- `ingestWebhook(workspaceId, rawInput)`
- `listUsers()`, `getUser()`, `updateUser()`, `deleteUser()`
- `getUserExternalAccounts()`, `getOAuthToken()`
- `listSessions()`, `getSession()`, `revokeSession()`, `verifySession()`
- `listOrganizations()`, `getOrganization()`, `listOrgMembers()`, `createOrgInvitation()`
- `verifyWebhook(payload, headers)`, `getJWKS()`, `verifyToken(token)`

## Notes

- Pass credentials from environment variables or your secret manager. The provider does not ship any hardcoded Clerk credentials.
- OAuth access tokens are read from `GET /v1/users/{userId}/oauth_access_tokens/{provider}` and the most recent token is used.
- Paginated Clerk list responses are normalized to expose `totalCount` even when Clerk returns `total_count`.
- Webhook verification uses Svix headers: `svix-id`, `svix-timestamp`, and `svix-signature`.
- JWT verification uses Clerk JWKS fetched from `/v1/jwks`.
