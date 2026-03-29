# @relayfile/provider-pipedream — Design

## Config

```typescript
interface PipedreamConfig {
  clientId: string;
  clientSecret: string;
  projectId: string;
  environment?: "development" | "production"; // default: "production"
  baseUrl?: string;                           // default: "https://api.pipedream.com"
  fetch?: typeof fetch;
}
```

## Layer 1: ConnectionProvider (generic interface)

```typescript
class PipedreamProvider implements ConnectionProvider {
  readonly name = "pipedream";

  proxy(request: ProxyRequest): Promise<ProxyResponse>;
  healthCheck(connectionId: string): Promise<boolean>;
  handleWebhook(rawPayload: unknown): Promise<NormalizedWebhook>;
}
```

Proxy forwards requests with injected bearer token (auto-refreshed via OAuth client credentials).
healthCheck calls `GET /accounts/{accountId}` and checks status.
handleWebhook normalizes Pipedream trigger events into `NormalizedWebhook`.

## Layer 2: Pipedream-specific convenience methods

```typescript
// — Token Management —
createConnectToken(externalUserId: string, opts?: { successRedirectUri?: string; errorRedirectUri?: string }): Promise<ConnectToken>;
getOAuthToken(): Promise<{ accessToken: string; expiresAt: string }>;

// — Account Management —
listAccounts(opts?: { externalUserId?: string; app?: string; cursor?: string; limit?: number }): Promise<PaginatedResult<Account>>;
getAccount(accountId: string): Promise<Account>;
deleteAccount(accountId: string): Promise<void>;
deleteAccountsByApp(appSlug: string, externalUserId: string): Promise<void>;

// — User Management —
deleteUser(externalUserId: string): Promise<void>;

// — App Discovery —
listApps(opts?: { query?: string; cursor?: string; limit?: number }): Promise<PaginatedResult<App>>;
getApp(appSlug: string): Promise<App>;
listAppCategories(): Promise<AppCategory[]>;

// — Actions —
listActions(opts?: { app?: string; query?: string; cursor?: string }): Promise<PaginatedResult<Action>>;
getAction(actionKey: string): Promise<Action>;
runAction(actionKey: string, opts: RunActionOpts): Promise<ActionResult>;

// — Triggers (webhook sources) —
listTriggers(opts?: { app?: string; query?: string; cursor?: string }): Promise<PaginatedResult<Trigger>>;
getTrigger(triggerKey: string): Promise<Trigger>;
deployTrigger(triggerKey: string, opts: DeployTriggerOpts): Promise<DeployedTrigger>;
getDeployedTrigger(triggerId: string): Promise<DeployedTrigger>;
deleteDeployedTrigger(triggerId: string): Promise<void>;
listDeployedTriggers(externalUserId: string): Promise<DeployedTrigger[]>;
listTriggerEvents(triggerId: string): Promise<TriggerEvent[]>;
updateTriggerWebhooks(triggerId: string, webhookUrls: string[]): Promise<void>;

// — Project —
getProjectInfo(): Promise<Project>;
```

## File structure

```
src/
  index.ts                 # public exports
  pipedream-provider.ts    # PipedreamProvider class (both layers)
  types.ts                 # PipedreamConfig, Account, App, Action, Trigger, etc.
  auth.ts                  # OAuth client-credentials token management + caching
  proxy.ts                 # proxy() implementation with auth injection
  webhook.ts               # handleWebhook + normalization logic
  errors.ts                # PipedreamError subclasses
  __tests__/
    pipedream-provider.test.ts
    auth.test.ts
    webhook.test.ts
```

## Key design decisions

1. **Single class, two layers**: `PipedreamProvider` implements `ConnectionProvider` (Layer 1) and exposes all convenience methods directly — no separate wrapper needed.
2. **Auto-managed bearer token**: `auth.ts` handles OAuth client credentials flow with TTL caching; all methods use it transparently.
3. **Environment via header**: All requests include `X-PD-Environment` header derived from config.
4. **Paginated results**: Convenience methods returning lists use `PaginatedResult<T>` with `{ data: T[]; cursor?: string }`.
5. **Triggers = webhooks**: Pipedream's event sources (triggers) map to webhook management — `deployTrigger` + `updateTriggerWebhooks` replaces traditional webhook CRUD.

DESIGN_COMPLETE
