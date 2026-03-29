import type {
  NormalizedWebhook as SdkNormalizedWebhook,
  ProxyMethod,
} from "@relayfile/sdk";
export type { ConnectionProvider, ProxyMethod, ProxyRequest, ProxyResponse } from "@relayfile/sdk";

export type ComposioFetch = typeof fetch;

export interface ComposioAuthConfig {
  apiKey: string;
  webhookSecret?: string;
}

export type JsonPrimitive = boolean | number | null | string;
export type JsonValue = JsonArray | JsonObject | JsonPrimitive;
export type JsonArray = JsonValue[];
export type JsonObject = { [key: string]: JsonValue | undefined };

export type ComposioRequestHeaders = Record<string, string>;
export type ProxyRequestQuery = Record<string, string>;
export type ProxyRequestBody = unknown;
export type ProxyResponseHeaders = Record<string, string>;
export type ProxyResponseData = unknown;
export type ComposioApiMethod = ProxyMethod;
export type ComposioApiQueryPrimitive = boolean | number | string;
export type ComposioApiQueryValue =
  | ComposioApiQueryPrimitive
  | readonly ComposioApiQueryPrimitive[]
  | null
  | undefined;
export type ComposioApiQuery = Record<string, ComposioApiQueryValue>;
export type NormalizedWebhookPayload = Record<string, unknown>;
export type ComposioActionLookupSource =
  | "default-toolset"
  | "derived-base-url"
  | "explicit-header"
  | "search"
  | "unresolved";

export interface ComposioToolset {
  slug: string;
  version?: string;
}

export interface ComposioExecutionContext {
  connectionId?: string;
  userId?: string;
  headers?: ComposioRequestHeaders;
}

export interface ComposioProviderMetadata {
  source?: string;
  environment?: string;
  tags?: readonly string[];
}

export interface ComposioProviderConfig {
  auth?: ComposioAuthConfig;
  apiKey?: string;
  baseUrl?: string;
  defaultToolset?: ComposioToolset;
  timeoutMs?: number;
  metadata?: ComposioProviderMetadata;
  fetch?: ComposioFetch;
}

export interface NormalizedWebhook extends SdkNormalizedWebhook {
  connectionId: string;
  eventType: string;
  objectType: string;
  objectId: string;
  payload: NormalizedWebhookPayload;
}

export interface ResolvedComposioProviderConfig {
  apiKey: string;
  baseUrl: string;
  defaultToolset?: ComposioToolset;
  timeoutMs?: number;
  metadata?: ComposioProviderMetadata;
  fetch?: ComposioFetch;
}

export interface ComposioActionLookupResult {
  toolSlug?: string;
  toolkitSlug?: string;
  toolkitVersion?: string;
  matchedBy: ComposioActionLookupSource;
}

export interface ComposioApiRequestOptions {
  path: string;
  method?: ComposioApiMethod;
  query?: ComposioApiQuery;
  body?: unknown;
  headers?: ComposioRequestHeaders;
}

export type ComposioApiRequester = <T = unknown>(options: ComposioApiRequestOptions) => Promise<T>;

export class ComposioApiError extends Error {
  readonly status: number;
  readonly code?: number | string;
  readonly slug?: string;
  readonly requestId?: string;
  readonly suggestedFix?: string;
  readonly details?: unknown;

  constructor(
    message: string,
    options: {
      status: number;
      code?: number | string;
      slug?: string;
      requestId?: string;
      suggestedFix?: string;
      details?: unknown;
    },
  ) {
    super(message);
    this.name = "ComposioApiError";
    this.status = options.status;
    if (options.code !== undefined) {
      this.code = options.code;
    }
    if (options.slug !== undefined) {
      this.slug = options.slug;
    }
    if (options.requestId !== undefined) {
      this.requestId = options.requestId;
    }
    if (options.suggestedFix !== undefined) {
      this.suggestedFix = options.suggestedFix;
    }
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

export interface ComposioListResponse<T> {
  items: T[];
  next_cursor?: string;
  nextCursor?: string;
  previous_cursor?: string;
  total?: number;
  [key: string]: unknown;
}

export interface ComposioEntity {
  id: string;
  connectedAccountIds: string[];
  activeSubscriptionIds: string[];
}

export interface ComposioEntityInput {
  id: string;
}

export interface ComposioConnectedAccount {
  id: string;
  status?: string;
  user_id?: string;
  auth_config_id?: string;
  connected_account_id?: string;
  redirect_url?: string;
  redirect_uri?: string;
  toolkit?: {
    slug?: string;
    name?: string;
    logo?: string;
    [key: string]: unknown;
  };
  connectionData?: {
    authScheme?: string;
    val?: JsonObject;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ComposioConnectionRequest {
  link_token?: string;
  redirect_url?: string;
  expires_at?: string;
  connected_account_id?: string;
  [key: string]: unknown;
}

export interface ComposioAction {
  slug: string;
  name?: string;
  description?: string;
  tags?: string[];
  toolkit?: {
    slug?: string;
    name?: string;
    logo?: string;
    [key: string]: unknown;
  };
  input_parameters?: JsonObject;
  output_parameters?: JsonObject;
  [key: string]: unknown;
}

export interface ComposioActionExecutionResponse<TData = unknown> {
  successful?: boolean;
  success?: boolean;
  data?: TData;
  error?: unknown;
  [key: string]: unknown;
}

export interface ComposioTrigger {
  slug: string;
  name?: string;
  description?: string;
  type?: string;
  toolkit?: {
    slug?: string;
    name?: string;
    logo?: string;
    [key: string]: unknown;
  };
  config?: JsonObject;
  payload?: JsonObject;
  [key: string]: unknown;
}

export interface ComposioTriggerSubscription {
  id: string;
  slug?: string;
  status?: string;
  connected_account_id?: string;
  user_id?: string;
  trigger_config?: JsonObject;
  [key: string]: unknown;
}

export interface ComposioIntegration {
  id: string;
  name?: string;
  status?: string;
  toolkit?: {
    slug?: string;
    name?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ComposioApp {
  slug: string;
  name?: string;
  auth_schemes?: string[];
  composio_managed_auth_schemes?: string[];
  [key: string]: unknown;
}

export interface ListConnectedAccountsOptions {
  entityId?: string;
  integrationId?: string;
  appName?: string;
  statuses?: string[];
  cursor?: string;
  limit?: number;
}

export interface InitiateConnectionOptions {
  callbackUrl?: string;
  connectionData?: JsonObject;
}

export interface ListActionsOptions {
  appName?: string;
  tags?: string[];
  cursor?: string;
  limit?: number;
  search?: string;
}

export interface ExecuteActionOptions {
  connectedAccountId?: string;
  version?: string;
  text?: string;
}

export interface ListTriggersOptions {
  appName?: string;
  cursor?: string;
  limit?: number;
}

export interface SubscribeTriggerOptions {
  connectedAccountId?: string;
}

export interface ListActiveSubscriptionsOptions {
  entityId?: string;
  includeDisabled?: boolean;
  cursor?: string;
  limit?: number;
}

export interface ListIntegrationsOptions {
  appName?: string;
  cursor?: string;
  limit?: number;
}

export interface ListAppsOptions {
  search?: string;
  category?: string;
  cursor?: string;
  limit?: number;
}
