import type {
  JsonObject,
  NangoConnectionRecord,
  NangoRefreshResponse,
} from "../../types.js";
import type { MockResponseSpec } from "../mock-nango.js";

const DEFAULT_CONNECTION_ID = "conn_live";
const DEFAULT_PROVIDER = "github";
const DEFAULT_PROVIDER_CONFIG_KEY = "github";
const DEFAULT_CREATED_AT = "2026-03-28T10:00:00.000Z";
const DEFAULT_UPDATED_AT = "2026-03-28T10:05:00.000Z";
const DEFAULT_EXPIRES_AT = "2026-03-29T10:05:00.000Z";

export interface NangoConnectionFixture extends NangoConnectionRecord {
  id: string;
  connection_id: string;
  provider: string;
  provider_config_key: string;
  connection_config_key: string;
  status: string;
  auth_mode: string;
  created_at: string;
  updated_at: string;
  metadata: JsonObject;
}

export interface NangoConnectionListFixture extends JsonObject {
  connections: NangoConnectionFixture[];
  total: number;
  next_cursor?: string | undefined;
}

export interface NangoRefreshFixture extends NangoRefreshResponse {
  connection_id: string;
  connectionId: string;
  provider_config_key: string;
  providerConfigKey: string;
  provider: string;
  refreshed: boolean;
  success: boolean;
  expires_at: string;
  expiresAt: string;
}

export interface BuildProxyResponseOptions {
  status?: number;
  data?: unknown;
  headers?: Record<string, string>;
}

export interface BuildProxyFailureOptions {
  status?: number;
  code?: string;
  message?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface BuildRefreshFailureOptions {
  status?: number;
  code?: string;
  message?: string;
  headers?: Record<string, string>;
}

export function buildConnection(
  overrides: Partial<NangoConnectionFixture> = {},
): NangoConnectionFixture {
  const connectionId = overrides.connection_id ?? overrides.connectionId ?? overrides.id ?? DEFAULT_CONNECTION_ID;
  const providerConfigKey =
    overrides.provider_config_key ?? overrides.providerConfigKey ?? DEFAULT_PROVIDER_CONFIG_KEY;
  const {
    connectionId: _connectionId,
    providerConfigKey: _providerConfigKey,
    connectionConfigKey: _connectionConfigKey,
    ...rest
  } = overrides;

  return {
    ...rest,
    id: connectionId,
    connection_id: connectionId,
    provider: overrides.provider ?? DEFAULT_PROVIDER,
    provider_config_key: providerConfigKey,
    connection_config_key:
      overrides.connection_config_key ?? overrides.connectionConfigKey ?? providerConfigKey,
    status: overrides.status ?? "ACTIVE",
    auth_mode: overrides.auth_mode ?? "OAUTH2",
    active: overrides.active,
    auth_status: overrides.auth_status ?? overrides.authStatus,
    sync_status: overrides.sync_status ?? overrides.syncStatus ?? "OK",
    created_at: overrides.created_at ?? overrides.createdAt ?? DEFAULT_CREATED_AT,
    updated_at: overrides.updated_at ?? overrides.updatedAt ?? DEFAULT_UPDATED_AT,
    end_user:
      overrides.end_user ??
      overrides.endUser ?? {
        id: "user_123",
        email: "octocat@example.com",
        name: "Octo Cat",
      },
    credentials:
      overrides.credentials ?? {
        status: "AUTHORIZED",
        type: "OAUTH2",
        expires_at: DEFAULT_EXPIRES_AT,
      },
    errors: overrides.errors ?? [],
    metadata:
      overrides.metadata ?? {
        accountName: "octocat",
        workspaceId: "workspace_test",
      },
  };
}

export function buildInactiveConnection(
  overrides: Partial<NangoConnectionFixture> = {},
): NangoConnectionFixture {
  return buildConnection({
    status: "REVOKED",
    active: false,
    auth_status: "REVOKED",
    sync_status: "STOPPED",
    errors: [
      {
        code: "token_revoked",
        message: "Refresh token revoked",
      },
    ],
    ...overrides,
  });
}

export function buildConnectionDetailResponse(
  overrides: Partial<NangoConnectionFixture> = {},
): NangoConnectionFixture {
  return buildConnection(overrides);
}

export function buildConnectionListResponse(
  connections: NangoConnectionFixture[] = [buildConnection()],
  overrides: Partial<Omit<NangoConnectionListFixture, "connections" | "total">> = {},
): NangoConnectionListFixture {
  return {
    connections,
    total: connections.length,
    ...overrides,
  };
}

export function buildProxySuccessResponse(
  options: BuildProxyResponseOptions = {},
): MockResponseSpec {
  return {
    status: options.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...options.headers,
    },
    json: options.data ?? {
      ok: true,
    },
  };
}

export function buildProxyTextResponse(
  text = "ok",
  options: Omit<BuildProxyResponseOptions, "data"> = {},
): MockResponseSpec {
  return {
    status: options.status ?? 200,
    headers: {
      "content-type": "text/plain",
      ...options.headers,
    },
    text,
  };
}

export function buildProxyFailureResponse(
  options: BuildProxyFailureOptions = {},
): MockResponseSpec {
  return {
    status: options.status ?? 400,
    headers: {
      "content-type": "application/json",
      ...options.headers,
    },
    json: options.body ?? {
      error: {
        code: options.code ?? "bad_request",
        message: options.message ?? "The upstream provider rejected the request",
      },
    },
  };
}

export function buildExpiredTokenProxyFailure(
  overrides: Omit<BuildProxyFailureOptions, "status" | "code" | "message"> = {},
): MockResponseSpec {
  return buildProxyFailureResponse({
    status: 401,
    code: "token_expired",
    message: "Access token expired",
    ...overrides,
  });
}

export function buildTerminalProxyFailure(
  overrides: Omit<BuildProxyFailureOptions, "status" | "code" | "message"> = {},
): MockResponseSpec {
  return buildProxyFailureResponse({
    status: 403,
    code: "permission_denied",
    message: "The upstream provider rejected the request",
    ...overrides,
  });
}

export function buildRefreshSuccessPayload(
  overrides: Partial<NangoRefreshFixture> = {},
): NangoRefreshFixture {
  const connectionId = overrides.connectionId ?? overrides.connection_id ?? DEFAULT_CONNECTION_ID;
  const providerConfigKey =
    overrides.providerConfigKey ?? overrides.provider_config_key ?? DEFAULT_PROVIDER_CONFIG_KEY;
  const {
    connectionId: _connectionId,
    providerConfigKey: _providerConfigKey,
    ...rest
  } = overrides;

  return {
    ...rest,
    connection_id: connectionId,
    connectionId: connectionId,
    provider_config_key: providerConfigKey,
    providerConfigKey: providerConfigKey,
    provider: overrides.provider ?? providerConfigKey,
    refreshed: overrides.refreshed ?? true,
    success: overrides.success ?? true,
    expires_at: overrides.expires_at ?? overrides.expiresAt ?? DEFAULT_EXPIRES_AT,
    expiresAt: overrides.expiresAt ?? overrides.expires_at ?? DEFAULT_EXPIRES_AT,
  };
}

export function buildRefreshSuccessResponse(
  overrides: Partial<NangoRefreshFixture> = {},
): MockResponseSpec {
  return {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
    json: buildRefreshSuccessPayload(overrides),
  };
}

export function buildRefreshFailureResponse(
  options: BuildRefreshFailureOptions = {},
): MockResponseSpec {
  return {
    status: options.status ?? 400,
    headers: {
      "content-type": "application/json",
      ...options.headers,
    },
    json: {
      error: {
        code: options.code ?? "refresh_failed",
        message: options.message ?? "Refresh token is no longer valid",
      },
    },
  };
}

export function buildRefreshRejectedResponse(
  overrides: Partial<NangoRefreshFixture> = {},
): MockResponseSpec {
  return {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
    json: {
      ...buildRefreshSuccessPayload({
        refreshed: false,
        success: false,
        ...overrides,
      }),
      errors: [
        {
          code: "refresh_failed",
          message: "Refresh token is no longer valid",
        },
      ],
    },
  };
}

export const malformedNangoResponses = {
  connection: {
    provider: DEFAULT_PROVIDER,
  },
  connectionList: {
    connections: "not-an-array",
    total: 1,
  },
  proxy: {
    unexpected: true,
  },
  proxyText: "proxy failed without JSON",
  refresh: {
    refreshed: "yes",
  },
} as const;
