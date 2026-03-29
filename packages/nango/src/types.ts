export type JsonPrimitive = boolean | number | null | string;
export type JsonValue = JsonArray | JsonObject | JsonPrimitive;
export type JsonArray = JsonValue[];
export type JsonObject = { [key: string]: JsonValue | undefined };

export type HeaderValue = string | string[];
export type HeaderMap = Record<string, string>;
export type ProxyMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
export type ProxyRequestHeaders = HeaderMap;
export type ProxyRequestQuery = Record<string, string>;
export type ProxyRequestBody = JsonValue | string;
export type ProxyResponseHeaders = Record<string, string>;
export type ProxyResponseData = JsonValue | string | null;

export interface ProxyRequest<
  TBody extends ProxyRequestBody = ProxyRequestBody,
  TQuery extends ProxyRequestQuery = ProxyRequestQuery,
  THeaders extends ProxyRequestHeaders = ProxyRequestHeaders,
> {
  method: ProxyMethod;
  /** Target service base URL. Optional — the provider resolves it from the connection when omitted. */
  baseUrl?: string | undefined;
  endpoint: string;
  connectionId: string;
  headers?: THeaders | undefined;
  body?: TBody | undefined;
  query?: TQuery | undefined;
  providerConfigKey?: string | undefined;
}

export interface ProxyResponse<
  TData = ProxyResponseData,
  THeaders extends ProxyResponseHeaders = ProxyResponseHeaders,
> {
  status: number;
  headers: THeaders;
  data: TData;
}

export type ProxyRequestInput<
  TBody extends ProxyRequestBody = ProxyRequestBody,
  TQuery extends ProxyRequestQuery = ProxyRequestQuery,
  THeaders extends ProxyRequestHeaders = ProxyRequestHeaders,
> = ProxyRequest<TBody, TQuery, THeaders>;

export type ProxyResponseOutput<
  TData = ProxyResponseData,
  THeaders extends ProxyResponseHeaders = ProxyResponseHeaders,
> = ProxyResponse<TData, THeaders>;

export type ProxyFailureResponse<
  TData = ProxyResponseData,
  THeaders extends ProxyResponseHeaders = ProxyResponseHeaders,
> = ProxyResponseOutput<TData, THeaders>;

export type ProxyHandler = <
  TData = ProxyResponseData,
  TBody extends ProxyRequestBody = ProxyRequestBody,
  TQuery extends ProxyRequestQuery = ProxyRequestQuery,
  THeaders extends ProxyRequestHeaders = ProxyRequestHeaders,
>(
  request: ProxyRequestInput<TBody, TQuery, THeaders>
) => Promise<ProxyResponseOutput<TData>>;

export interface NormalizedWebhook<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  provider: string;
  connectionId: string;
  eventType: string;
  objectType: string;
  objectId: string;
  payload: TPayload;
}

export interface NangoProviderConfig {
  secretKey: string;
  baseUrl?: string | undefined;
  provider?: string | undefined;
  providerConfigKey?: string | undefined;
  integrationId?: string | undefined;
  fetch?: typeof fetch | undefined;
}

export interface NangoConnectionServiceConfig {
  secretKey: string;
  baseUrl?: string | undefined;
  fetch?: typeof fetch | undefined;
}

export interface NangoConnectionCredentials extends JsonObject {
  status?: string | undefined;
  type?: string | undefined;
  expires_at?: string | null | undefined;
  expiresAt?: string | null | undefined;
}

export interface NangoConnectionError extends JsonObject {
  code?: string | undefined;
  detail?: string | undefined;
  error?: string | undefined;
  message?: string | undefined;
  type?: string | undefined;
}

export interface NangoConnectionRecord extends JsonObject {
  id?: string | undefined;
  connection_id?: string | undefined;
  connectionId?: string | undefined;
  provider?: string | undefined;
  provider_config_key?: string | undefined;
  providerConfigKey?: string | undefined;
  connection_config_key?: string | undefined;
  connectionConfigKey?: string | undefined;
  environment?: string | undefined;
  status?: string | undefined;
  connection_status?: string | undefined;
  connectionStatus?: string | undefined;
  auth_status?: string | undefined;
  authStatus?: string | undefined;
  sync_status?: string | undefined;
  syncStatus?: string | undefined;
  active?: boolean | undefined;
  is_active?: boolean | undefined;
  isActive?: boolean | undefined;
  authorized?: boolean | undefined;
  revoked?: boolean | undefined;
  disabled?: boolean | undefined;
  expires_at?: string | null | undefined;
  expiresAt?: string | null | undefined;
  created_at?: string | undefined;
  createdAt?: string | undefined;
  updated_at?: string | undefined;
  updatedAt?: string | undefined;
  last_sync_date?: string | undefined;
  lastSyncDate?: string | undefined;
  credentials?: NangoConnectionCredentials | undefined;
  metadata?: JsonObject | undefined;
  end_user?: JsonObject | undefined;
  endUser?: JsonObject | undefined;
  last_sync?: JsonObject | undefined;
  lastSync?: JsonObject | undefined;
  errors?: Array<NangoConnectionError | JsonObject | string> | undefined;
}

export type NangoConnectionResponseShape = NangoConnectionRecord;

export interface NangoConnectionIdentity {
  id?: string | undefined;
  displayName?: string | undefined;
  email?: string | undefined;
  metadata: Record<string, unknown>;
}

export interface NangoConnectionErrorShape {
  code?: string | undefined;
  message: string;
  raw: unknown;
}

export interface NangoConnectionCredentialState {
  status?: string | undefined;
  type?: string | undefined;
  expiresAt?: string | undefined;
  raw: Record<string, unknown>;
}

export type NangoConnectionActivity = "active" | "inactive" | "unknown";

export interface NangoConnectionMetadata {
  connectionId: string;
  provider?: string | undefined;
  providerConfigKey?: string | undefined;
  connectionConfigKey?: string | undefined;
  environment?: string | undefined;
  active: boolean;
  activity: NangoConnectionActivity;
  status?: string | undefined;
  authStatus?: string | undefined;
  syncStatus?: string | undefined;
  inactiveReason?: string | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  lastSyncAt?: string | undefined;
  endUserId?: string | undefined;
  endUserEmail?: string | undefined;
  errorCount: number;
}

export interface NangoConnection {
  connectionId: string;
  provider?: string | undefined;
  providerConfigKey?: string | undefined;
  connectionConfigKey?: string | undefined;
  environment?: string | undefined;
  active: boolean;
  activity: NangoConnectionActivity;
  status?: string | undefined;
  authStatus?: string | undefined;
  syncStatus?: string | undefined;
  inactiveReason?: string | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  lastSyncAt?: string | undefined;
  connectionMetadata: NangoConnectionMetadata;
  metadata: Record<string, unknown>;
  endUser?: NangoConnectionIdentity | undefined;
  credentials?: NangoConnectionCredentialState | undefined;
  errors: NangoConnectionErrorShape[];
  raw: NangoConnectionRecord;
}

export interface NangoConnectionListResponseShape extends JsonObject {
  connections?: NangoConnectionRecord[] | undefined;
  items?: NangoConnectionRecord[] | undefined;
  data?: NangoConnectionRecord[] | undefined;
  next_cursor?: string | undefined;
  nextCursor?: string | undefined;
  cursor?: string | undefined;
  total?: number | undefined;
}

export interface NangoConnectionDetailResponseShape extends JsonObject {
  connection?: NangoConnectionRecord | undefined;
  item?: NangoConnectionRecord | undefined;
  data?: NangoConnectionRecord | undefined;
}

export type NangoConnectionListPayload = NangoConnectionListResponseShape | NangoConnectionRecord[];
export type NangoConnectionDetailPayload =
  | NangoConnectionDetailResponseShape
  | NangoConnectionRecord;

export interface NangoListConnectionsOptions {
  providerConfigKey?: string | undefined;
  includeInactive?: boolean | undefined;
  activeOnly?: boolean | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

export interface NangoGetConnectionOptions {
  providerConfigKey?: string | undefined;
}

export interface NangoConnectionDetailResult {
  connection: NangoConnection | null;
  connectionMetadata: NangoConnectionMetadata | null;
  raw: NangoConnectionDetailPayload | null;
}

export interface NangoConnectionListResult {
  connections: NangoConnection[];
  activeConnections: NangoConnection[];
  inactiveConnections: NangoConnection[];
  connectionMetadata: NangoConnectionMetadata[];
  activeConnectionMetadata: NangoConnectionMetadata[];
  inactiveConnectionMetadata: NangoConnectionMetadata[];
  nextCursor?: string | undefined;
  raw: NangoConnectionListPayload;
}

export interface NangoProxyPayload {
  method: ProxyMethod;
  baseUrlOverride?: string | undefined;
  endpoint: string;
  headers?: HeaderMap | undefined;
  data?: JsonValue | string | undefined;
  params?: Record<string, string> | undefined;
}

export interface NangoProxyRequestDescriptor {
  providerConfigKey: string;
  payload: NangoProxyPayload;
  url: string;
  init: RequestInit;
}

export interface NormalizedForwardMetadata {
  eventType: string;
  objectType: string;
  objectId: string;
  action: string | null;
  topic: string | null;
  metadata: JsonObject;
  object: JsonObject;
}

export type NangoAuthWebhookOperation = "creation" | "override" | "refresh";
export type NangoSyncWebhookStage = "completed" | "failed" | "started";

export interface NangoAuthWebhookPayload extends JsonObject {
  type: "auth";
  connectionId?: string | undefined;
  connection_id?: string | undefined;
  providerConfigKey?: string | undefined;
  provider_config_key?: string | undefined;
  provider?: string | undefined;
  authMode?: string | undefined;
  auth_mode?: string | undefined;
  environment?: string | undefined;
  operation?: string | undefined;
  success?: boolean | undefined;
  from?: string | undefined;
  tags?: JsonObject | undefined;
  endUser?: JsonObject | undefined;
  end_user?: JsonObject | undefined;
  error?: JsonObject | undefined;
}

export interface NangoGenericWebhookPayload extends JsonObject {
  type: string;
  from?: string | undefined;
  provider?: string | undefined;
  providerConfigKey?: string | undefined;
  provider_config_key?: string | undefined;
  connectionId?: string | undefined;
  connection_id?: string | undefined;
  objectType?: string | undefined;
  object_type?: string | undefined;
  objectId?: string | number | undefined;
  object_id?: string | number | undefined;
  payload?: JsonObject | undefined;
  data?: JsonObject | undefined;
}

export interface NangoSyncWebhookPayload extends JsonObject {
  type: "sync";
  connectionId?: string | undefined;
  connection_id?: string | undefined;
  providerConfigKey?: string | undefined;
  provider_config_key?: string | undefined;
  syncName?: string | undefined;
  sync_name?: string | undefined;
  syncVariant?: string | undefined;
  sync_variant?: string | undefined;
  syncType?: string | undefined;
  sync_type?: string | undefined;
  model?: string | undefined;
  success?: boolean | undefined;
  modifiedAfter?: string | undefined;
  modified_after?: string | undefined;
  responseResults?: JsonObject | undefined;
  response_results?: JsonObject | undefined;
  checkpoints?: JsonValue | undefined;
  error?: JsonObject | undefined;
  startedAt?: string | undefined;
  started_at?: string | undefined;
  failedAt?: string | undefined;
  failed_at?: string | undefined;
  operation?: string | undefined;
  status?: string | undefined;
  event?: string | undefined;
  from?: string | undefined;
}

export interface NangoForwardWebhookPayload extends JsonObject {
  type: "forward";
  from?: string | undefined;
  provider?: string | undefined;
  connectionId?: string | undefined;
  connection_id?: string | undefined;
  providerConfigKey?: string | undefined;
  provider_config_key?: string | undefined;
  payload: JsonValue;
}

export type NangoWebhookPayload =
  | NangoAuthWebhookPayload
  | NangoForwardWebhookPayload
  | NangoSyncWebhookPayload;

export type ParsedNangoWebhookPayload = NangoWebhookPayload | NangoGenericWebhookPayload;

export interface NangoNormalizedAuthPayload extends JsonObject {
  from: string | null;
  provider: string;
  providerConfigKey: string;
  authMode: string;
  environment: string;
  operation: NangoAuthWebhookOperation;
  success: boolean;
  tags: JsonObject;
  endUser: JsonObject;
  error: JsonObject;
  rawPayload: NangoAuthWebhookPayload;
}

export interface NangoNormalizedSyncPayload extends JsonObject {
  from: string | null;
  providerConfigKey: string;
  syncName: string;
  syncVariant: string | null;
  model: string;
  syncType: string | null;
  stage: NangoSyncWebhookStage;
  success: boolean | null;
  modifiedAfter: string | null;
  responseResults: JsonObject;
  checkpoints: JsonValue | null;
  error: JsonObject;
  startedAt: string | null;
  failedAt: string | null;
  rawPayload: NangoSyncWebhookPayload;
}

export interface NangoNormalizedForwardPayload extends JsonObject {
  from: string;
  providerConfigKey: string | null;
  forwardedEventType: string;
  forwardedObjectType: string;
  forwardedObjectId: string;
  forwardedAction: string | null;
  forwardedTopic: string | null;
  forwardedMetadata: JsonObject;
  forwardedObject: JsonObject;
  rawPayload: JsonObject;
  rawWebhook: NangoForwardWebhookPayload;
}

export interface NangoNormalizedGenericPayload extends JsonObject {
  providerConfigKey: string | null;
  rawPayload: JsonObject;
  rawWebhook: NangoGenericWebhookPayload;
}

export type NormalizedNangoWebhookPayload =
  | NangoNormalizedAuthPayload
  | NangoNormalizedForwardPayload
  | NangoNormalizedGenericPayload
  | NangoNormalizedSyncPayload;

export type NormalizedNangoWebhook = NormalizedWebhook<NormalizedNangoWebhookPayload>;

export interface NangoRefreshErrorDetail extends JsonObject {
  code?: string | undefined;
  detail?: string | undefined;
  error?: string | undefined;
  message?: string | undefined;
  type?: string | undefined;
}

export interface NangoRefreshResponse extends JsonObject {
  connection_id?: string | undefined;
  connectionId?: string | undefined;
  provider_config_key?: string | undefined;
  providerConfigKey?: string | undefined;
  provider?: string | undefined;
  success?: boolean | undefined;
  refreshed?: boolean | undefined;
  expires_at?: string | null | undefined;
  expiresAt?: string | null | undefined;
  error?: NangoRefreshErrorDetail | string | undefined;
  errors?: Array<NangoRefreshErrorDetail | JsonObject | string> | undefined;
}

export interface NangoRefreshRequestOptions {
  secretKey: string;
  connectionId: string;
  providerConfigKey?: string | undefined;
  baseUrl?: string | undefined;
  includeRefreshToken?: boolean | undefined;
  headers?: Record<string, string> | undefined;
  signal?: AbortSignal | undefined;
  fetch?: typeof fetch | undefined;
}

export interface RefreshRetryDecision {
  shouldRefresh: boolean;
  reason?: "already-refreshed" | "body" | "error" | "header" | "status" | undefined;
}

export interface RefreshRetryDecisionInput {
  attemptedRefresh: boolean;
  status?: number | undefined;
  headers?: Headers | Record<string, HeaderValue> | undefined;
  body?: unknown;
  error?: unknown;
}

// The base provider contract returns a boolean, while the package also exposes
// richer diagnostics for provider-specific workflows and tests.
export const NANGO_CONNECTION_HEALTH_STATUSES = ["healthy", "degraded", "failed"] as const;
export type NangoConnectionHealthStatus = (typeof NANGO_CONNECTION_HEALTH_STATUSES)[number];

export const NANGO_CONNECTION_HEALTH_REASONS = [
  "active",
  "expired_auth",
  "inactive_connection",
  "missing_connection_id",
  "not_found",
  "revoked_auth",
  "sync_warning",
  "transport_error",
  "unknown_state"
] as const;
export type NangoConnectionHealthReason = (typeof NANGO_CONNECTION_HEALTH_REASONS)[number];

export interface NangoConnectionHealthDetails {
  endpoint: string;
  connectionState: string | null;
  authState: string | null;
  syncState: string | null;
  expiresAt: string | null;
  httpStatus?: number | undefined;
}

export interface NangoConnectionHealthEvaluationOptions {
  baseUrl?: string | undefined;
  now?: Date | undefined;
  providerConfigKey?: string | undefined;
}

export interface NangoConnectionHealthResult {
  ok: boolean;
  status: NangoConnectionHealthStatus;
  reason: NangoConnectionHealthReason;
  connectionId: string;
  providerConfigKey?: string | undefined;
  message: string;
  checkedAt: string;
  details: NangoConnectionHealthDetails;
  connection?: NangoConnectionRecord | undefined;
}
