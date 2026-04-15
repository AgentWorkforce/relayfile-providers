export { NangoProvider, createNangoProvider } from "./nango-provider.js";
// Unauthenticated variant — merged in from the former
// @relayfile/provider-nango-unauth package. Kept in the same module so
// consumers that need both auth and unauth flows import from a single
// package. Same deps, same Nango SDK base class.
export {
  NangoUnauthProvider,
  createNangoUnauthProvider,
} from "./nango-unauth-provider.js";
export type {
  NangoUnauthAuthHeaders,
  NangoUnauthCredentialRefreshContext,
  NangoUnauthCredentialRefreshFn,
  NangoUnauthCredentials,
  NangoUnauthProviderConfig,
} from "./nango-unauth-provider.js";
// Re-export workflow modules through the public barrel so downstream adapters
// can depend on stable entrypoints as the provider grows.
export {
  buildNangoProxyPayload,
  buildNangoProxyRequest,
  deriveProviderConfigKey,
  parseNangoProxyResponse,
  proxyThroughNango,
  resolveProviderConfigKey,
} from "./proxy.js";
export {
  evaluateConnectionHealth,
  fetchNangoConnection,
  getConnectionHealth,
  healthCheckNangoConnection,
  normalizeNangoBaseUrl,
} from "./health.js";
export {
  extractNangoConnectionMetadata,
  getNangoConnectionDetail,
  getNangoConnection,
  listNangoConnections,
  normalizeNangoConnection,
} from "./connections.js";
export {
  extractForwardMetadata,
  normalizeNangoWebhook,
  parseNangoWebhookPayload,
} from "./webhook.js";
export {
  NangoConfigurationError,
  NangoConnectionError,
  NangoProviderError,
  NangoProxyConfigError,
  NangoProxyError,
  NangoProxyFailureError,
  NangoProxyTransportError,
  NangoRefreshHttpError,
  NangoRefreshNetworkError,
  NangoRefreshRejectedError,
  NangoRefreshResponseError,
  NangoWebhookError,
  isNangoProxyError,
  isNangoRefreshError,
} from "./errors.js";
export {
  DEFAULT_NANGO_BASE_URL,
  buildRefreshConnectionUrl,
  containsRefreshHint,
  isNangoRefreshResponse,
  isRefreshableStatus,
  refreshConnection,
  shouldAttemptTokenRefresh,
} from "./token-refresh.js";
export type { ConnectionProvider } from "@relayfile/sdk";
export type {
  HeaderMap,
  HeaderValue,
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  NangoAuthWebhookPayload,
  NangoAuthWebhookOperation,
  NangoConnection,
  NangoConnectionActivity,
  NangoConnectionCredentialState,
  NangoConnectionCredentials,
  NangoConnectionDetailResult,
  NangoConnectionDetailPayload,
  NangoConnectionErrorShape,
  NangoConnectionHealthDetails,
  NangoConnectionHealthEvaluationOptions,
  NangoConnectionHealthReason,
  NangoConnectionHealthResult,
  NangoConnectionHealthStatus,
  NangoConnectionIdentity,
  NangoConnectionListPayload,
  NangoConnectionListResponseShape,
  NangoConnectionListResult,
  NangoConnectionMetadata,
  NangoConnectionRecord,
  NangoConnectionResponseShape,
  NangoForwardWebhookPayload,
  NangoGenericWebhookPayload,
  NangoGetConnectionOptions,
  NangoListConnectionsOptions,
  NangoNormalizedAuthPayload,
  NangoNormalizedForwardPayload,
  NangoNormalizedGenericPayload,
  NangoNormalizedSyncPayload,
  NangoProviderConfig,
  NangoProxyPayload,
  NangoProxyRequestDescriptor,
  NangoRefreshErrorDetail,
  NangoRefreshRequestOptions,
  NangoRefreshResponse,
  NangoSyncWebhookPayload,
  NangoSyncWebhookStage,
  NangoWebhookPayload,
  NormalizedNangoWebhook,
  NormalizedNangoWebhookPayload,
  NormalizedForwardMetadata,
  NormalizedWebhook,
  ParsedNangoWebhookPayload,
  ProxyMethod,
  ProxyFailureResponse,
  ProxyRequestBody,
  ProxyRequestHeaders,
  ProxyRequestQuery,
  ProxyRequest,
  ProxyResponseData,
  ProxyResponseHeaders,
  ProxyResponse,
  RefreshRetryDecision,
  RefreshRetryDecisionInput,
} from "./types.js";
