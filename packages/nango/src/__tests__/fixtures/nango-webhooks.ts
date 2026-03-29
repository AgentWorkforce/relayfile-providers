import type {
  JsonObject,
  NangoAuthWebhookPayload,
  NangoForwardWebhookPayload,
  NangoSyncWebhookPayload,
} from "../../types.js";

const DEFAULT_CONNECTION_ID = "conn_live";
const DEFAULT_PROVIDER = "github";
const DEFAULT_PROVIDER_CONFIG_KEY = "github";

export interface NangoAuthWebhookFixture extends NangoAuthWebhookPayload {
  type: "auth";
  connectionId: string;
  connection_id: string;
  providerConfigKey: string;
  provider_config_key: string;
  provider: string;
  from: string;
  authMode: string;
  environment: string;
  operation: "creation" | "override" | "refresh";
  success: boolean;
}

export interface NangoSyncWebhookFixture extends NangoSyncWebhookPayload {
  type: "sync";
  connectionId: string;
  connection_id: string;
  providerConfigKey: string;
  provider_config_key: string;
  syncName: string;
  sync_name: string;
  syncVariant: string;
  sync_variant: string;
  syncType: string;
  sync_type: string;
  model: string;
  from: string;
}

export interface NangoForwardWebhookFixture extends NangoForwardWebhookPayload {
  type: "forward";
  from: string;
  provider: string;
  connectionId: string;
  connection_id: string;
  providerConfigKey: string;
  provider_config_key: string;
  payload: JsonObject;
}

export interface NangoGenericWebhookFixture extends JsonObject {
  type: string;
  provider: string;
  connectionId: string;
  providerConfigKey: string;
  objectType: string;
  objectId: string;
  payload: JsonObject;
}

export function buildAuthWebhook(
  overrides: Partial<NangoAuthWebhookFixture> = {},
): NangoAuthWebhookFixture {
  const connectionId = overrides.connectionId ?? overrides.connection_id ?? DEFAULT_CONNECTION_ID;
  const providerConfigKey =
    overrides.providerConfigKey ?? overrides.provider_config_key ?? DEFAULT_PROVIDER_CONFIG_KEY;

  return {
    ...overrides,
    type: "auth",
    connectionId,
    connection_id: connectionId,
    providerConfigKey: providerConfigKey,
    provider_config_key: providerConfigKey,
    provider: overrides.provider ?? DEFAULT_PROVIDER,
    from: overrides.from ?? "nango",
    authMode: overrides.authMode ?? "OAUTH2",
    environment: overrides.environment ?? "prod",
    operation: overrides.operation ?? "refresh",
    success: overrides.success ?? true,
    tags:
      overrides.tags ?? {
        workspaceId: "ws_123",
      },
    end_user:
      overrides.end_user ?? {
        externalId: "user_123",
      },
  };
}

export function buildAuthConnectionWebhook(
  overrides: Partial<NangoAuthWebhookFixture> = {},
): NangoAuthWebhookFixture {
  return buildAuthWebhook(overrides);
}

export function buildSyncWebhook(
  overrides: Partial<NangoSyncWebhookFixture> = {},
): NangoSyncWebhookFixture {
  const connectionId = overrides.connectionId ?? overrides.connection_id ?? DEFAULT_CONNECTION_ID;
  const providerConfigKey =
    overrides.providerConfigKey ?? overrides.provider_config_key ?? DEFAULT_PROVIDER_CONFIG_KEY;
  const syncName = overrides.syncName ?? overrides.sync_name ?? "issues";

  return {
    ...overrides,
    type: "sync",
    connectionId,
    connection_id: connectionId,
    providerConfigKey: providerConfigKey,
    provider_config_key: providerConfigKey,
    syncName,
    sync_name: syncName,
    syncVariant: overrides.syncVariant ?? "default",
    sync_variant: overrides.sync_variant ?? overrides.syncVariant ?? "default",
    syncType: overrides.syncType ?? "INCREMENTAL",
    sync_type: overrides.sync_type ?? overrides.syncType ?? "INCREMENTAL",
    model: overrides.model ?? "issue",
    from: overrides.from ?? "nango",
    checkpoints:
      overrides.checkpoints ?? {
        cursor: "page_1",
      },
  };
}

export function buildSyncCompletedWebhook(
  overrides: Partial<NangoSyncWebhookFixture> = {},
): NangoSyncWebhookFixture {
  return buildSyncWebhook({
    success: true,
    modifiedAfter: "2026-03-28T10:05:00.000Z",
    responseResults: {
      added: 2,
      updated: 1,
      deleted: 0,
    },
    ...overrides,
  });
}

export function buildForwardWebhook(
  overrides: Partial<NangoForwardWebhookFixture> = {},
): NangoForwardWebhookFixture {
  const connectionId = overrides.connectionId ?? overrides.connection_id ?? DEFAULT_CONNECTION_ID;
  const providerConfigKey =
    overrides.providerConfigKey ?? overrides.provider_config_key ?? DEFAULT_PROVIDER_CONFIG_KEY;

  return {
    ...overrides,
    type: "forward",
    from: overrides.from ?? DEFAULT_PROVIDER,
    provider: overrides.provider ?? DEFAULT_PROVIDER,
    connectionId,
    connection_id: connectionId,
    providerConfigKey: providerConfigKey,
    provider_config_key: providerConfigKey,
    payload:
      overrides.payload ?? {
        metadata: {
          event_type: "issue.opened",
          object_type: "issue",
          object_id: "issue_123",
        },
      },
  };
}

export function buildGenericWebhook(
  overrides: Partial<NangoGenericWebhookFixture> = {},
): NangoGenericWebhookFixture {
  const connectionId = overrides.connectionId ?? DEFAULT_CONNECTION_ID;
  const providerConfigKey = overrides.providerConfigKey ?? DEFAULT_PROVIDER_CONFIG_KEY;

  return {
    ...overrides,
    type: "sync.completed",
    provider: overrides.provider ?? DEFAULT_PROVIDER,
    connectionId,
    providerConfigKey,
    objectType: overrides.objectType ?? "issue",
    objectId: overrides.objectId ?? "issue_123",
    payload:
      overrides.payload ?? {
        syncName: "issues",
        model: "issue",
        objectType: "issue",
        objectId: "issue_123",
        success: true,
      },
  };
}

export const malformedNangoWebhooks = {
  invalidJson: "{not json",
  serializedArray: "[]",
  missingConnectionId: {
    type: "sync",
    providerConfigKey: DEFAULT_PROVIDER_CONFIG_KEY,
    syncName: "issues",
    model: "issue",
    success: true,
  },
  missingProviderConfigKey: {
    type: "auth",
    connectionId: DEFAULT_CONNECTION_ID,
    connection_id: DEFAULT_CONNECTION_ID,
    authMode: "OAUTH2",
    environment: "prod",
    operation: "refresh",
    success: true,
  },
  missingEventType: buildForwardWebhook({
    payload: {
      objectType: "contact",
      objectId: "contact_123",
    },
  }),
  missingObjectType: buildForwardWebhook({
    payload: {
      metadata: {
        event_type: "contact.updated",
        object_id: "contact_123",
      },
    },
  }),
  missingObjectId: buildForwardWebhook({
    payload: {
      metadata: {
        event_type: "contact.updated",
        object_type: "contact",
      },
    },
  }),
} as const;
