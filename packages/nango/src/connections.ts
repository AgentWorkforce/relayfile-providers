import type {
  NangoConnection,
  NangoConnectionActivity,
  NangoConnectionCredentialState,
  NangoConnectionDetailResult,
  NangoConnectionDetailPayload,
  NangoConnectionDetailResponseShape,
  NangoConnectionErrorShape,
  NangoConnectionIdentity,
  NangoConnectionListPayload,
  NangoConnectionListResult,
  NangoConnectionMetadata,
  NangoConnectionResponseShape,
  NangoConnectionServiceConfig,
  NangoGetConnectionOptions,
  NangoListConnectionsOptions
} from "./types.js";

const ACTIVE_STATUS_VALUES = new Set([
  "active",
  "authorized",
  "connected",
  "healthy",
  "ok",
  "valid"
]);

const INACTIVE_STATUS_VALUES = new Set([
  "disconnected",
  "disabled",
  "error",
  "expired",
  "failed",
  "failing",
  "inactive",
  "invalid",
  "revoked"
]);

const DEFAULT_BASE_URL = "https://api.nango.dev";

export async function listNangoConnections(
  config: NangoConnectionServiceConfig,
  options: NangoListConnectionsOptions = {}
): Promise<NangoConnectionListResult> {
  const payload = await requestJson<NangoConnectionListPayload>(config, ["/connections", "/connection"], {
    cursor: options.cursor,
    limit: options.limit,
    provider_config_key: options.providerConfigKey
  });

  if (payload === null) {
    throw new Error("Nango list connection request returned no payload.");
  }

  const normalizationDefaults =
    options.providerConfigKey === undefined ? {} : { providerConfigKey: options.providerConfigKey };
  const rawConnections = extractConnectionArray(payload);
  const normalizedConnections = rawConnections
    .map((item) => normalizeNangoConnection(item, normalizationDefaults))
    .filter((item): item is NangoConnection => item !== null)
    .filter((item) => {
      if (!options.providerConfigKey) {
        return true;
      }

      return item.providerConfigKey === options.providerConfigKey;
    });

  const activeConnections = normalizedConnections.filter((item) => item.active);
  const inactiveConnections = normalizedConnections.filter((item) => !item.active);
  const connections = shouldIncludeInactiveConnections(options) ? normalizedConnections : activeConnections;

  return {
    connections,
    activeConnections,
    inactiveConnections,
    connectionMetadata: connections.map((item) => item.connectionMetadata),
    activeConnectionMetadata: activeConnections.map((item) => item.connectionMetadata),
    inactiveConnectionMetadata: inactiveConnections.map((item) => item.connectionMetadata),
    nextCursor: extractNextCursor(payload),
    raw: payload
  };
}

export async function getNangoConnection(
  config: NangoConnectionServiceConfig,
  connectionId: string,
  options: NangoGetConnectionOptions = {}
): Promise<NangoConnection | null> {
  const detail = await getNangoConnectionDetail(config, connectionId, options);
  return detail.connection;
}

export async function getNangoConnectionDetail(
  config: NangoConnectionServiceConfig,
  connectionId: string,
  options: NangoGetConnectionOptions = {}
): Promise<NangoConnectionDetailResult> {
  const trimmedConnectionId = connectionId.trim();

  if (!trimmedConnectionId) {
    throw new Error("A connectionId is required to fetch a Nango connection.");
  }

  const payload = await requestJson<NangoConnectionDetailPayload>(
    config,
    [`/connections/${encodeURIComponent(trimmedConnectionId)}`, `/connection/${encodeURIComponent(trimmedConnectionId)}`],
    {
      provider_config_key: options.providerConfigKey
    },
    { allowNotFound: true }
  );

  if (payload === null) {
    return {
      connection: null,
      connectionMetadata: null,
      raw: null
    };
  }

  const rawConnection = extractConnectionRecord(payload);

  if (rawConnection === null) {
    return {
      connection: null,
      connectionMetadata: null,
      raw: payload
    };
  }

  const connection = normalizeNangoConnection(
    rawConnection,
    options.providerConfigKey === undefined ? {} : { providerConfigKey: options.providerConfigKey }
  );

  return {
    connection,
    connectionMetadata: connection?.connectionMetadata ?? null,
    raw: payload
  };
}

export function normalizeNangoConnection(
  payload: NangoConnectionResponseShape,
  defaults: { providerConfigKey?: string | undefined } = {}
): NangoConnection | null {
  const connectionId = firstString(payload.connection_id, payload.connectionId, payload.id);

  if (!connectionId) {
    return null;
  }

  const status = firstString(payload.status, payload.connection_status, payload.connectionStatus);
  const authStatus = firstString(
    payload.auth_status,
    payload.authStatus,
    readNestedString(payload.credentials, "status")
  );
  const syncStatus = firstString(payload.sync_status, payload.syncStatus);
  const activity = deriveConnectionActivity(payload, status, authStatus, syncStatus);
  const errors = normalizeErrors(payload.errors);
  const endUser = normalizeIdentity(payload.end_user ?? payload.endUser);
  const credentials = normalizeCredentials(payload.credentials);
  const inactiveReason = buildInactiveReason({
    activity,
    status,
    authStatus,
    syncStatus,
    errors
  });

  const connection = {
    connectionId,
    provider: firstString(payload.provider),
    providerConfigKey: firstString(
      payload.provider_config_key,
      payload.providerConfigKey,
      defaults.providerConfigKey
    ),
    connectionConfigKey: firstString(
      payload.connection_config_key,
      payload.connectionConfigKey
    ),
    environment: firstString(payload.environment),
    active: activity === "active",
    activity,
    status,
    authStatus,
    syncStatus,
    inactiveReason,
    createdAt: firstString(payload.created_at, payload.createdAt),
    updatedAt: firstString(payload.updated_at, payload.updatedAt),
    lastSyncAt: firstString(payload.last_sync_date, payload.lastSyncDate),
    metadata: asRecord(payload.metadata),
    endUser,
    credentials,
    errors,
    raw: payload
  };

  return {
    ...connection,
    connectionMetadata: extractNangoConnectionMetadata(connection)
  };
}

export function deriveConnectionActivity(
  payload: NangoConnectionResponseShape,
  ...statuses: Array<string | undefined>
): NangoConnectionActivity {
  const explicitActive = firstBoolean(payload.active, payload.is_active, payload.isActive);
  const normalizedStatuses = statuses
    .map((status) => normalizeStatus(status))
    .filter((status): status is string => status !== undefined);

  for (const status of normalizedStatuses) {
    if (INACTIVE_STATUS_VALUES.has(status)) {
      return "inactive";
    }
  }

  if (explicitActive === false) {
    return "inactive";
  }

  if (normalizeErrors(payload.errors).length > 0) {
    return "inactive";
  }

  for (const status of normalizedStatuses) {
    if (ACTIVE_STATUS_VALUES.has(status)) {
      return "active";
    }
  }

  if (explicitActive === true) {
    return "active";
  }

  return "unknown";
}

export function extractNangoConnectionMetadata(
  connection: Pick<
    NangoConnection,
    | "activity"
    | "active"
    | "authStatus"
    | "connectionConfigKey"
    | "connectionId"
    | "createdAt"
    | "endUser"
    | "environment"
    | "errors"
    | "inactiveReason"
    | "lastSyncAt"
    | "provider"
    | "providerConfigKey"
    | "status"
    | "syncStatus"
    | "updatedAt"
  >
): NangoConnectionMetadata {
  return {
    connectionId: connection.connectionId,
    provider: connection.provider,
    providerConfigKey: connection.providerConfigKey,
    connectionConfigKey: connection.connectionConfigKey,
    environment: connection.environment,
    active: connection.active,
    activity: connection.activity,
    status: connection.status,
    authStatus: connection.authStatus,
    syncStatus: connection.syncStatus,
    inactiveReason: connection.inactiveReason,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    lastSyncAt: connection.lastSyncAt,
    endUserId: connection.endUser?.id,
    endUserEmail: connection.endUser?.email,
    errorCount: connection.errors.length
  };
}

function buildInactiveReason(input: {
  activity: NangoConnectionActivity;
  status?: string | undefined;
  authStatus?: string | undefined;
  syncStatus?: string | undefined;
  errors: NangoConnectionErrorShape[];
}): string | undefined {
  if (input.activity === "active") {
    return undefined;
  }

  if (input.errors.length > 0) {
    return input.errors[0]?.message;
  }

  const normalizedStatus = firstString(
    input.status,
    isInactiveStatus(input.authStatus) ? input.authStatus : undefined,
    isInactiveStatus(input.syncStatus) ? input.syncStatus : undefined
  );

  if (normalizedStatus) {
    return normalizedStatus;
  }

  if (input.activity === "inactive") {
    return "inactive";
  }

  return "unknown";
}

function normalizeIdentity(value: unknown): NangoConnectionIdentity | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    id: firstString(value.id, value.end_user_id, value.endUserId),
    displayName: firstString(value.display_name, value.displayName, value.name),
    email: firstString(value.email),
    metadata: asRecord(value.metadata)
  };
}

function normalizeCredentials(value: unknown): NangoConnectionCredentialState | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    status: firstString(value.status),
    type: firstString(value.type),
    expiresAt: firstString(value.expires_at, value.expiresAt),
    raw: value
  };
}

function normalizeErrors(value: unknown): NangoConnectionErrorShape[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => {
    if (typeof entry === "string") {
      return {
        message: entry,
        raw: entry
      };
    }

    if (isRecord(entry)) {
      return {
        code: firstString(entry.code, entry.type),
        message: firstString(entry.message, entry.error, entry.detail) ?? "Unknown Nango connection error",
        raw: entry
      };
    }

    return {
      message: "Unknown Nango connection error",
      raw: entry
    };
  });
}

function shouldIncludeInactiveConnections(options: NangoListConnectionsOptions): boolean {
  if (options.includeInactive === true) {
    return true;
  }

  if (options.activeOnly === false) {
    return true;
  }

  return false;
}

function extractConnectionArray(payload: NangoConnectionListPayload): NangoConnectionResponseShape[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.connections)) {
    return payload.connections;
  }

  if (Array.isArray(payload.items)) {
    return payload.items;
  }

  if (Array.isArray(payload.data)) {
    return payload.data;
  }

  return [];
}

function extractNextCursor(payload: NangoConnectionListPayload): string | undefined {
  if (Array.isArray(payload)) {
    return undefined;
  }

  return firstString(payload.next_cursor, payload.nextCursor, payload.cursor);
}

function extractConnectionRecord(payload: NangoConnectionDetailPayload): NangoConnectionResponseShape | null {
  if (isRecord(payload)) {
    const wrappedPayload = payload as NangoConnectionDetailResponseShape;
    const nestedConnection = firstRecord(wrappedPayload.connection, wrappedPayload.item, wrappedPayload.data);

    if (nestedConnection) {
      return nestedConnection as NangoConnectionResponseShape;
    }
  }

  return isRecord(payload) ? payload : null;
}

async function requestJson<T>(
  config: NangoConnectionServiceConfig,
  paths: string[],
  query: Record<string, string | number | undefined>,
  options: { allowNotFound?: boolean } = {}
): Promise<T | null> {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const secretKey = config.secretKey.trim();
  let lastNotFound = false;

  if (!secretKey) {
    throw new Error("A Nango secretKey is required.");
  }

  for (const path of paths) {
    const url = buildUrl(baseUrl, path, query);
    const response = await getFetch(config)(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${secretKey}`
      }
    });

    if (response.status === 404) {
      lastNotFound = true;
      continue;
    }

    if (!response.ok) {
      throw new Error(`Nango request failed for ${path}: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  if (options.allowNotFound && lastNotFound) {
    return null;
  }

  throw new Error(`Nango request failed for ${paths[0]}: 404 Not Found`);
}

function buildUrl(baseUrl: string, path: string, query: Record<string, string | number | undefined>): string {
  const url = new URL(path, `${baseUrl}/`);

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

function normalizeBaseUrl(baseUrl = DEFAULT_BASE_URL): string {
  return baseUrl.replace(/\/+$/, "");
}

function getFetch(config: NangoConnectionServiceConfig): typeof fetch {
  return config.fetch ?? fetch;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function firstBoolean(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }

  return undefined;
}

function readNestedString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return firstString(value[key]);
}

function normalizeStatus(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase();
}

function isInactiveStatus(value: string | undefined): boolean {
  const normalizedValue = normalizeStatus(value);
  return normalizedValue !== undefined && INACTIVE_STATUS_VALUES.has(normalizedValue);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function firstRecord(...values: unknown[]): Record<string, unknown> | undefined {
  for (const value of values) {
    if (isRecord(value)) {
      return value;
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
