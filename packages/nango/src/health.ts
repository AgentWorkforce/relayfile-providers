import type {
  JsonObject,
  JsonValue,
  NangoConnectionHealthDetails,
  NangoConnectionHealthEvaluationOptions,
  NangoConnectionHealthReason,
  NangoConnectionHealthResult,
  NangoConnectionRecord,
  NangoProviderConfig,
} from './types.js';

export const DEFAULT_NANGO_BASE_URL = 'https://api.nango.dev';

const HEALTHY_AUTH_STATES = new Set(['active', 'authorized', 'connected', 'healthy', 'ok', 'valid']);
const HEALTHY_SYNC_STATES = new Set([
  'active',
  'completed',
  'connected',
  'healthy',
  'in_progress',
  'ok',
  'running',
  'started',
  'success',
  'succeeded',
  'valid',
]);
const REVOKED_STATES = new Set([
  'denied',
  'disconnected',
  'invalid',
  'invalid_grant',
  'revoked',
  'unauthorized',
]);
const EXPIRED_STATES = new Set(['expired', 'refresh_expired', 'token_expired']);
const INACTIVE_STATES = new Set(['disabled', 'inactive', 'paused']);
const DEGRADED_SYNC_STATES = new Set(['error', 'failed', 'partial', 'paused', 'stopped', 'warning']);

export async function fetchNangoConnection(
  connectionId: string,
  config: NangoProviderConfig,
): Promise<NangoConnectionRecord> {
  const trimmedConnectionId = connectionId.trim();
  const secretKey = config.secretKey.trim();
  let lastLookupError: LookupError | null = null;

  for (const endpoint of buildConnectionLookupUrls(
    trimmedConnectionId,
    config.providerConfigKey,
    config.baseUrl,
  )) {
    const response = await getFetchImpl(config)(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${secretKey}`,
      },
    });

    if (response.status === 404) {
      lastLookupError = await createLookupError(response, endpoint, secretKey);
      continue;
    }

    if (!response.ok) {
      throw await createLookupError(response, endpoint, secretKey);
    }

    const payload = (await response.json()) as JsonValue;
    if (!isJsonObject(payload)) {
      throw new Error('Nango connection lookup returned a non-object payload.');
    }

    const connection = extractConnectionRecord(payload);
    if (!connection) {
      throw new Error('Nango connection lookup returned no connection record.');
    }

    return connection;
  }

  if (lastLookupError) {
    throw lastLookupError;
  }

  throw new Error(`Nango connection lookup failed for ${trimmedConnectionId}.`);
}

export function evaluateConnectionHealth(
  connectionId: string,
  connection: NangoConnectionRecord,
  options: NangoConnectionHealthEvaluationOptions = {},
): NangoConnectionHealthResult {
  const trimmedConnectionId = connectionId.trim();
  const isActive =
    readBoolean(connection, [['active'], ['is_active'], ['isActive']]) ?? undefined;
  const connectionState = resolveState(connection, [
    ['connection_status'],
    ['connectionStatus'],
    ['status'],
  ]);
  const authState =
    resolveState(connection, [
      ['auth_status'],
      ['authStatus'],
      ['credentials', 'auth_status'],
      ['credentials', 'authStatus'],
      ['credentials', 'status'],
    ]) ?? connectionState;
  const syncState =
    resolveState(connection, [
      ['sync_status'],
      ['syncStatus'],
      ['last_sync', 'status'],
      ['lastSync', 'status'],
      ['last_sync', 'state'],
      ['lastSync', 'state'],
    ]) ?? (authState !== connectionState ? connectionState : null);
  const expiresAt = readString(connection, [
    ['expires_at'],
    ['expiresAt'],
    ['credentials', 'expires_at'],
    ['credentials', 'expiresAt'],
  ]);
  const providerConfigKey =
    options.providerConfigKey ??
    readString(connection, [['provider_config_key'], ['providerConfigKey']]) ??
    undefined;
  const details = buildDetails(
    trimmedConnectionId,
    options.baseUrl,
    connectionState,
    authState,
    syncState,
    expiresAt,
    undefined,
    providerConfigKey,
  );

  if (
    readBoolean(connection, [['revoked']]) ||
    hasKnownState(authState, REVOKED_STATES) ||
    hasKnownState(connectionState, REVOKED_STATES)
  ) {
    return createHealthResult({
      ok: false,
      status: 'failed',
      reason: 'revoked_auth',
      connectionId: trimmedConnectionId,
      providerConfigKey,
      message: `Connection ${trimmedConnectionId} has been revoked in Nango.`,
      details,
      connection,
    });
  }

  if (
    isExpired(expiresAt, options.now) ||
    hasKnownState(authState, EXPIRED_STATES) ||
    hasKnownState(connectionState, EXPIRED_STATES)
  ) {
    return createHealthResult({
      ok: false,
      status: 'failed',
      reason: 'expired_auth',
      connectionId: trimmedConnectionId,
      providerConfigKey,
      message: `Connection ${trimmedConnectionId} credentials are expired and need re-authentication.`,
      details,
      connection,
    });
  }

  if (
    readBoolean(connection, [['disabled']]) ||
    isActive === false ||
    hasKnownState(authState, INACTIVE_STATES) ||
    hasKnownState(connectionState, INACTIVE_STATES)
  ) {
    return createHealthResult({
      ok: false,
      status: 'failed',
      reason: 'inactive_connection',
      connectionId: trimmedConnectionId,
      providerConfigKey,
      message: `Connection ${trimmedConnectionId} is inactive in Nango.`,
      details,
      connection,
    });
  }

  const authLooksHealthy =
    readBoolean(connection, [['authorized']]) ||
    hasKnownState(authState, HEALTHY_AUTH_STATES) ||
    hasKnownState(connectionState, HEALTHY_AUTH_STATES) ||
    (authState === null && isActive === true);
  const syncLooksHealthy =
    hasKnownState(syncState, HEALTHY_SYNC_STATES) ||
    (syncState === null && hasKnownState(connectionState, HEALTHY_SYNC_STATES));
  const syncLooksDegraded =
    hasKnownState(syncState, DEGRADED_SYNC_STATES) ||
    (syncState === null && authLooksHealthy && hasKnownState(connectionState, DEGRADED_SYNC_STATES));
  const syncMessageState = syncState ?? connectionState ?? 'unknown';

  if (authLooksHealthy && syncLooksDegraded) {
    return createHealthResult({
      ok: false,
      status: 'degraded',
      reason: 'sync_warning',
      connectionId: trimmedConnectionId,
      providerConfigKey,
      message: `Connection ${trimmedConnectionId} auth is valid, but the last sync state is ${syncMessageState}.`,
      details,
      connection,
    });
  }

  if (authLooksHealthy && (syncState === null || syncLooksHealthy || !syncLooksDegraded)) {
    return createHealthResult({
      ok: true,
      status: 'healthy',
      reason: 'active',
      connectionId: trimmedConnectionId,
      providerConfigKey,
      message: `Connection ${trimmedConnectionId} is active and available.`,
      details,
      connection,
    });
  }

  return createHealthResult({
    ok: false,
    status: 'degraded',
    reason: 'unknown_state',
    connectionId: trimmedConnectionId,
    providerConfigKey,
    message: `Connection ${trimmedConnectionId} returned an ambiguous Nango status.`,
    details,
    connection,
  });
}

export async function getConnectionHealth(
  connectionId: string,
  config: NangoProviderConfig,
): Promise<NangoConnectionHealthResult> {
  const trimmedConnectionId = connectionId.trim();
  const providerConfigKey = config.providerConfigKey?.trim() || undefined;

  if (trimmedConnectionId.length === 0) {
    return createHealthResult({
      ok: false,
      status: 'failed',
      reason: 'missing_connection_id',
      connectionId: trimmedConnectionId,
      providerConfigKey,
      message: 'A Nango connection id is required for health checks.',
      details: buildDetails(trimmedConnectionId, config.baseUrl, null, null, null, null),
    });
  }

  try {
    const connection = await fetchNangoConnection(trimmedConnectionId, config);
    return evaluateConnectionHealth(trimmedConnectionId, connection, {
      baseUrl: config.baseUrl,
      providerConfigKey,
    });
  } catch (error) {
    const lookupError = asLookupError(error);
    if (lookupError?.status === 404) {
      return createHealthResult({
        ok: false,
        status: 'failed',
        reason: 'not_found',
        connectionId: trimmedConnectionId,
        providerConfigKey,
        message: `Connection ${trimmedConnectionId} was not found in Nango.`,
        details: buildDetails(
          trimmedConnectionId,
          config.baseUrl,
          null,
          null,
          null,
          null,
          lookupError.status,
          providerConfigKey,
        ),
      });
    }

    return createHealthResult({
      ok: false,
      status: 'failed',
      reason: 'transport_error',
      connectionId: trimmedConnectionId,
      providerConfigKey,
      message: formatTransportMessage(trimmedConnectionId, lookupError, error),
      details: buildDetails(
        trimmedConnectionId,
        config.baseUrl,
        null,
        null,
        null,
        null,
        lookupError?.status,
        providerConfigKey,
      ),
    });
  }
}

export async function healthCheckNangoConnection(
  connectionId: string,
  config: NangoProviderConfig,
): Promise<boolean> {
  const result = await getConnectionHealth(connectionId, config);
  return result.ok;
}

export function normalizeNangoBaseUrl(baseUrl?: string): string {
  return (baseUrl?.trim() || DEFAULT_NANGO_BASE_URL).replace(/\/+$/, '');
}

function buildConnectionLookupUrl(
  connectionId: string,
  providerConfigKey?: string | undefined,
  baseUrl?: string | undefined,
  pathPrefix = '/connection',
): string {
  const url = new URL(
    `${pathPrefix}/${encodeURIComponent(connectionId)}`,
    `${normalizeNangoBaseUrl(baseUrl)}/`,
  );

  if (providerConfigKey?.trim()) {
    url.searchParams.set('provider_config_key', providerConfigKey.trim());
  }

  return url.toString();
}

function buildConnectionLookupUrls(
  connectionId: string,
  providerConfigKey?: string | undefined,
  baseUrl?: string | undefined,
): string[] {
  return [
    buildConnectionLookupUrl(connectionId, providerConfigKey, baseUrl, '/connection'),
    buildConnectionLookupUrl(connectionId, providerConfigKey, baseUrl, '/connections'),
  ];
}

function buildDetails(
  connectionId: string,
  baseUrl: string | undefined,
  connectionState: string | null,
  authState: string | null,
  syncState: string | null,
  expiresAt: string | null,
  httpStatus?: number | undefined,
  providerConfigKey?: string | undefined,
): NangoConnectionHealthDetails {
  const details: NangoConnectionHealthDetails = {
    endpoint: buildConnectionLookupUrl(connectionId, providerConfigKey, baseUrl),
    connectionState,
    authState,
    syncState,
    expiresAt,
  };

  if (httpStatus !== undefined) {
    details.httpStatus = httpStatus;
  }

  return details;
}

function createHealthResult(input: {
  ok: boolean;
  status: NangoConnectionHealthResult['status'];
  reason: NangoConnectionHealthReason;
  connectionId: string;
  providerConfigKey?: string | undefined;
  message: string;
  details: NangoConnectionHealthDetails;
  connection?: NangoConnectionRecord | undefined;
}): NangoConnectionHealthResult {
  const result: NangoConnectionHealthResult = {
    ok: input.ok,
    status: input.status,
    reason: input.reason,
    connectionId: input.connectionId,
    message: input.message,
    details: input.details,
    checkedAt: new Date().toISOString(),
  };

  if (input.providerConfigKey !== undefined) {
    result.providerConfigKey = input.providerConfigKey;
  }

  if (input.connection !== undefined) {
    result.connection = input.connection;
  }

  return result;
}

async function createLookupError(
  response: Response,
  endpoint: string,
  secretKey?: string,
): Promise<LookupError> {
  const body = await safelyReadErrorBody(response);
  const error = new Error(`Nango connection lookup failed: ${response.status}`) as LookupError;
  error.status = response.status;
  error.endpoint = endpoint;
  if (body) {
    error.details = sanitizeErrorMessage(body, secretKey);
  }
  return error;
}

async function safelyReadErrorBody(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    if (!text) {
      return null;
    }

    try {
      const parsed = JSON.parse(text) as JsonValue;
      if (isJsonObject(parsed)) {
        return extractErrorMessage(parsed);
      }
    } catch {
      return text.trim().slice(0, 160) || null;
    }

    return text.trim().slice(0, 160) || null;
  } catch {
    return null;
  }
}

function formatTransportMessage(
  connectionId: string,
  lookupError: LookupError | null,
  error: unknown,
): string {
  if (lookupError?.status === 401 || lookupError?.status === 403) {
    const detail = lookupError.details ? ` ${lookupError.details}` : '';
    return `Nango health check failed for ${connectionId} with status ${lookupError.status}. Verify the Nango secret key and connection access.${detail}`;
  }

  if (lookupError?.status === 429) {
    const detail = lookupError.details ? ` ${lookupError.details}` : '';
    return `Nango health check failed for ${connectionId} with status 429. Nango rate limited the lookup; retry later.${detail}`;
  }

  if (lookupError?.status && lookupError.status >= 500) {
    const detail = lookupError.details ? ` ${lookupError.details}` : '';
    return `Nango health check failed for ${connectionId} with status ${lookupError.status}. Nango appears unavailable; retry later.${detail}`;
  }

  if (lookupError?.status) {
    const detail = lookupError.details ? ` ${lookupError.details}` : '';
    return `Nango health check failed for ${connectionId} with status ${lookupError.status}.${detail}`;
  }

  if (error instanceof Error && error.message.trim()) {
    return `Nango health check failed for ${connectionId}. ${sanitizeErrorMessage(error.message)}`;
  }

  return `Nango health check failed for ${connectionId}.`;
}

function getFetchImpl(config: NangoProviderConfig): typeof fetch {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error('Fetch is not available. Pass config.fetch when constructing NangoProvider.');
  }

  return fetchImpl;
}

function resolveState(connection: NangoConnectionRecord, paths: string[][]): string | null {
  const value = readString(connection, paths);
  if (!value) {
    return null;
  }

  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function readString(source: JsonObject, paths: string[][]): string | null {
  for (const path of paths) {
    const value = getPathValue(source, path);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function readBoolean(
  source: JsonObject,
  paths: string[][],
  defaultValue?: boolean,
): boolean | undefined {
  for (const path of paths) {
    const value = getPathValue(source, path);
    if (typeof value === 'boolean') {
      return value;
    }
  }

  return defaultValue;
}

function getPathValue(source: JsonObject, path: string[]): JsonValue | undefined {
  let current: JsonValue | undefined = source;

  for (const segment of path) {
    if (!isJsonObject(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function hasKnownState(state: string | null, states: ReadonlySet<string>): boolean {
  return state !== null && states.has(state);
}

function isExpired(expiresAt: string | null, now = new Date()): boolean {
  if (!expiresAt) {
    return false;
  }

  const timestamp = Date.parse(expiresAt);
  if (Number.isNaN(timestamp)) {
    return false;
  }

  return timestamp <= now.getTime();
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractConnectionRecord(payload: JsonObject): NangoConnectionRecord | null {
  const nestedConnection = firstJsonObject(payload.connection, payload.item, payload.data);
  if (nestedConnection) {
    return nestedConnection as NangoConnectionRecord;
  }

  if (looksLikeConnectionRecord(payload)) {
    return payload as NangoConnectionRecord;
  }

  return null;
}

function extractErrorMessage(value: JsonObject): string | null {
  const directMessage = firstNonEmptyString(value.message, value.error_description, value.detail);
  if (directMessage) {
    return directMessage;
  }

  const nestedError = value.error;
  if (isJsonObject(nestedError)) {
    return firstNonEmptyString(nestedError.message, nestedError.error, nestedError.detail);
  }

  if (typeof nestedError === 'string' && nestedError.trim()) {
    return nestedError.trim();
  }

  const errors = value.errors;
  if (Array.isArray(errors)) {
    for (const entry of errors) {
      if (isJsonObject(entry)) {
        const message = firstNonEmptyString(entry.message, entry.error, entry.detail);
        if (message) {
          return message;
        }
      }

      if (typeof entry === 'string' && entry.trim()) {
        return entry.trim();
      }
    }
  }

  return null;
}

function firstJsonObject(...values: Array<JsonValue | undefined>): JsonObject | null {
  for (const value of values) {
    if (isJsonObject(value)) {
      return value;
    }
  }

  return null;
}

function firstNonEmptyString(...values: Array<JsonValue | undefined>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function sanitizeErrorMessage(message: string, secretKey?: string): string {
  const sanitizedSecret = secretKey?.trim();
  let sanitized = message;

  if (sanitizedSecret) {
    sanitized = sanitized.replace(new RegExp(escapeRegExp(sanitizedSecret), 'g'), '[REDACTED]');
  }

  sanitized = sanitized
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/((?:authorization|api[_-]?key|client[_-]?secret|secret(?:[_-]?key)?)"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2')
    .replace(/((?:access|refresh)_token"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2')
    .replace(
      /((?:access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|secret(?:[_-]?key)?)=)[^&\s]+/gi,
      '$1[REDACTED]',
    );

  return sanitized.trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function looksLikeConnectionRecord(value: JsonObject): boolean {
  return (
    value.id !== undefined ||
    value.connection_id !== undefined ||
    value.connectionId !== undefined ||
    value.status !== undefined ||
    value.connection_status !== undefined ||
    value.connectionStatus !== undefined ||
    value.auth_status !== undefined ||
    value.authStatus !== undefined ||
    value.sync_status !== undefined ||
    value.syncStatus !== undefined ||
    value.active !== undefined ||
    value.is_active !== undefined ||
    value.isActive !== undefined ||
    value.credentials !== undefined
  );
}

function asLookupError(error: unknown): LookupError | null {
  if (error instanceof Error) {
    return error as LookupError;
  }

  return null;
}

type LookupError = Error & {
  details?: string;
  endpoint?: string;
  status?: number;
};
