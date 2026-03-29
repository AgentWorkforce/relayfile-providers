import type { ProxyMethod } from "@relayfile/sdk";

export type JsonPrimitive = boolean | number | null | string;
export type JsonValue = JsonArray | JsonObject | JsonPrimitive;
export interface JsonObject {
  [key: string]: JsonValue | undefined;
}
export type JsonArray = JsonValue[];

export type PipedreamEnvironment = "development" | "production";
export type PipedreamRegistry = "all" | "private" | "public";

export interface PipedreamConfig {
  clientId: string;
  clientSecret: string;
  projectId: string;
  environment?: PipedreamEnvironment;
  baseUrl?: string;
  fetch?: typeof fetch;
  tokenScope?: string;
  tokenRefreshSkewMs?: number;
  workflowBaseUrl?: string;
  resolveExternalUserId?: (
    account: PipedreamAccount
  ) => MaybePromise<string | undefined>;
}

export interface PipedreamProjectCredentials {
  clientId: string;
  clientSecret: string;
  projectId: string;
  environment: PipedreamEnvironment;
  baseUrl: string;
}

export interface PipedreamPageInfo {
  count?: number;
  totalCount?: number;
  startCursor?: string | null;
  endCursor?: string | null;
}

export interface PipedreamListResult<TItem> {
  data: TItem[];
  pageInfo: PipedreamPageInfo;
  raw: unknown;
}

export interface PipedreamConnectToken {
  token: string;
  connectLinkUrl: string;
  expiresAt: string;
  raw: unknown;
}

export interface CreateConnectTokenOptions {
  allowedOrigins?: string[];
  errorRedirectUri?: string;
  expiresIn?: number;
  scope?: string;
  successRedirectUri?: string;
  webhookUri?: string;
}

export interface PipedreamApp {
  id?: string;
  slug: string;
  name: string;
  authType?: "keys" | "none" | "oauth";
  description?: string | null;
  imageUrl?: string;
  customFieldsJson?: string | null;
  categories: string[];
  featuredWeight?: number;
  connect?: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface PipedreamAccount {
  id: string;
  name?: string | null;
  externalId?: string;
  externalUserId?: string;
  healthy?: boolean;
  dead?: boolean | null;
  app?: PipedreamApp;
  createdAt?: string;
  updatedAt?: string;
  credentials?: Record<string, unknown> | null;
  expiresAt?: string;
  error?: string | null;
  lastRefreshedAt?: string;
  nextRefreshAt?: string | null;
  raw: Record<string, unknown>;
}

export interface PipedreamUser {
  externalUserId: string;
  accounts: PipedreamAccount[];
}

export interface ListAccountsOptions {
  externalUserId?: string;
  app?: string;
  cursor?: string;
  before?: string;
  limit?: number;
  includeCredentials?: boolean;
  oauthAppId?: string;
}

export interface ListUsersOptions {
  app?: string;
  cursor?: string;
  before?: string;
  limit?: number;
}

export interface ListAppsOptions {
  query?: string;
  cursor?: string;
  before?: string;
  limit?: number;
  hasActions?: boolean;
  hasComponents?: boolean;
  hasTriggers?: boolean;
  categoryIds?: string[];
  sortDirection?: "asc" | "desc";
  sortKey?: "featured_weight" | "name" | "name_slug";
}

export interface PipedreamComponent {
  id: string;
  key?: string;
  name: string;
  version?: string;
  componentType?: "action" | "trigger";
  description?: string | null;
  configurableProps?: unknown[];
  annotations?: Record<string, unknown> | null;
  raw: Record<string, unknown>;
}

export interface ListComponentsOptions {
  app?: string;
  cursor?: string;
  before?: string;
  limit?: number;
  query?: string;
  registry?: PipedreamRegistry;
}

export interface InvokeActionOptions {
  externalUserId: string;
  configuredProps?: Record<string, unknown>;
  dynamicPropsId?: string;
  version?: string;
  stashId?: string | boolean;
}

export interface PipedreamActionResult {
  exports?: unknown;
  logs?: unknown;
  result?: unknown;
  stashId?: string | null;
  raw: unknown;
}

export interface DeployTriggerOptions {
  id: string;
  externalUserId: string;
  configuredProps?: Record<string, unknown>;
  dynamicPropsId?: string;
  version?: string;
  workflowId?: string;
  webhookUrl?: string;
  emitOnDeploy?: boolean;
}

export interface UpdateDeployedTriggerOptions {
  externalUserId: string;
  active?: boolean;
  configuredProps?: Record<string, unknown>;
  emitOnDeploy?: boolean;
  name?: string;
}

export interface ListDeployedTriggersOptions {
  externalUserId: string;
  cursor?: string;
  before?: string;
  limit?: number;
  emitterType?: "http" | "source" | "timer";
}

export interface PipedreamEmitter {
  id: string;
  type: string;
  key?: string;
  name?: string;
  active?: boolean;
  createdAt?: number | string;
  updatedAt?: number | string;
  endpointUrl?: string;
  raw: Record<string, unknown>;
}

export interface PipedreamTriggerEvent {
  id: string;
  type: string;
  timestamp: number;
  payload: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface PipedreamTriggerWebhook {
  id: string;
  url: string;
  signingKey?: string;
  signingKeySet: boolean;
  raw: Record<string, unknown>;
}

export interface UpdateTriggerWebhooksOptions {
  externalUserId: string;
  webhookUrls: string[];
}

export interface UpdateTriggerWorkflowsOptions {
  externalUserId: string;
  workflowIds: string[];
}

export interface InvokeWorkflowOptions {
  body?: unknown;
  externalUserId: string;
  headers?: Record<string, string>;
  method?: ProxyMethod;
  query?: Record<string, string>;
  signal?: AbortSignal;
}

export interface PipedreamProjectInfo {
  apps: Array<{
    id?: string;
    slug: string;
  }>;
  raw: unknown;
}

export interface PipedreamOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export type MaybePromise<T> = Promise<T> | T;
