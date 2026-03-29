import { NangoWebhookError } from "./errors.js";
import type {
  JsonObject,
  NangoAuthWebhookOperation,
  NangoAuthWebhookPayload,
  NangoForwardWebhookPayload,
  NangoGenericWebhookPayload,
  NangoNormalizedAuthPayload,
  NangoNormalizedForwardPayload,
  NangoNormalizedGenericPayload,
  NangoNormalizedSyncPayload,
  NangoSyncWebhookPayload,
  NangoSyncWebhookStage,
  ParsedNangoWebhookPayload,
  NormalizedForwardMetadata,
  NormalizedWebhook,
} from "./types.js";

const AUTH_EVENT_TYPE_MAP: Record<
  NangoAuthWebhookOperation,
  { failure: string; success: string }
> = {
  creation: {
    success: "connection.created",
    failure: "connection.creation_failed",
  },
  override: {
    success: "connection.reauthorized",
    failure: "connection.reauthorization_failed",
  },
  refresh: {
    success: "connection.refreshed",
    failure: "connection.refresh_failed",
  },
} as const;

const SYNC_STARTED_SIGNALS = new Set(["start", "started", "sync.start", "sync.started"]);
const SYNC_COMPLETED_SIGNALS = new Set([
  "complete",
  "completed",
  "finish",
  "finished",
  "success",
  "succeeded",
  "sync.complete",
  "sync.completed",
]);
const SYNC_FAILED_SIGNALS = new Set([
  "error",
  "fail",
  "failed",
  "sync.error",
  "sync.fail",
  "sync.failed",
]);

const RESERVED_NANGO_TYPES = new Set(["auth", "forward", "sync"]);

export function normalizeNangoWebhook(
  rawPayload: unknown,
  defaultProviderConfigKey?: string,
): NormalizedWebhook {
  const payload = parseNangoWebhookPayload(rawPayload);

  switch (payload.type) {
    case "auth":
      return normalizeAuthWebhook(payload as NangoAuthWebhookPayload, defaultProviderConfigKey);
    case "sync":
      return normalizeSyncWebhook(payload as NangoSyncWebhookPayload, defaultProviderConfigKey);
    case "forward":
      return normalizeForwardWebhook(payload as NangoForwardWebhookPayload, defaultProviderConfigKey);
    default:
      return normalizeGenericWebhook(
        payload as unknown as NangoGenericWebhookPayload,
        defaultProviderConfigKey,
      );
  }
}

export function parseNangoWebhookPayload(
  rawPayload: unknown,
): ParsedNangoWebhookPayload {
  const decoded = decodeWebhookPayload(rawPayload);

  if (!isRecord(decoded)) {
    throw new NangoWebhookError("Nango webhook payload must be a JSON object.", {
      payload: rawPayload,
    });
  }

  const type = readRequiredString(decoded, "type", rawPayload);
  return {
    ...decoded,
    type,
  } as ParsedNangoWebhookPayload;
}

export function extractForwardMetadata(payload: unknown): NormalizedForwardMetadata {
  if (!isRecord(payload)) {
    throw new NangoWebhookError(
      "Forwarded Nango webhook payload must be an object to extract metadata.",
      { payload },
    );
  }

  const metadata = isRecord(payload.metadata) ? payload.metadata : undefined;
  const objectRecord = isRecord(payload.object) ? payload.object : undefined;
  const dataRecord = isRecord(payload.data) ? payload.data : undefined;
  const itemRecord = isRecord(payload.item) ? payload.item : undefined;
  const dataObjectRecord = isRecord(dataRecord?.object) ? dataRecord.object : undefined;
  const action = selectOptionalString(payload.action, metadata?.action);
  const topic = selectOptionalString(payload.topic, metadata?.topic);
  const objectType = resolveForwardObjectType(payload, metadata, objectRecord, dataObjectRecord);
  const objectId = resolveForwardObjectId(
    payload,
    metadata,
    objectRecord,
    dataRecord,
    dataObjectRecord,
    itemRecord,
  );
  const eventType = resolveForwardEventType(payload, metadata, objectType, action);

  if (!eventType) {
    throw new NangoWebhookError(
      "Forwarded Nango webhook payload is missing explicit event metadata.",
      { payload },
    );
  }

  if (!objectType) {
    throw new NangoWebhookError(
      "Forwarded Nango webhook payload is missing explicit object metadata.",
      { payload },
    );
  }

  if (!objectId) {
    throw new NangoWebhookError(
      "Forwarded Nango webhook payload is missing an object identifier.",
      { payload },
    );
  }

  return {
    eventType,
    objectType,
    objectId,
    action: action ?? null,
    topic: topic ?? null,
    metadata: normalizeRecord(metadata),
    object: normalizeRecord(objectRecord ?? dataObjectRecord ?? itemRecord),
  };
}

function normalizeAuthWebhook(
  payload: NangoAuthWebhookPayload,
  defaultProviderConfigKey?: string,
): NormalizedWebhook {
  const connectionId = readRequiredStringFromKeys(payload, ["connectionId", "connection_id"], payload);
  const providerConfigKey =
    readOptionalStringFromKeys(payload, ["providerConfigKey", "provider_config_key"]) ??
    defaultProviderConfigKey;
  const provider = resolveWebhookProvider(
    payload,
    ["provider", "from"],
    providerConfigKey,
    payload,
  );
  const authMode = readRequiredStringFromKeys(payload, ["authMode", "auth_mode"], payload);
  const environment = readRequiredString(payload, "environment", payload);
  const operation = readAuthWebhookOperation(payload);
  const success = readRequiredBoolean(payload, "success", payload);
  const mapping = AUTH_EVENT_TYPE_MAP[operation];

  if (!providerConfigKey) {
    throw new NangoWebhookError("Nango auth webhook payload is missing providerConfigKey.", {
      payload,
    });
  }

  return {
    event: success ? mapping.success : mapping.failure,
    provider,
    connectionId,
    eventType: success ? mapping.success : mapping.failure,
    objectType: "connection",
    objectId: connectionId,
    payload: buildAuthPayload(payload, {
      authMode,
      environment,
      operation,
      provider,
      providerConfigKey,
      success,
    }),
    raw: payload,
  };
}

function normalizeSyncWebhook(
  payload: NangoSyncWebhookPayload,
  defaultProviderConfigKey?: string,
): NormalizedWebhook {
  const connectionId = readRequiredStringFromKeys(payload, ["connectionId", "connection_id"], payload);
  const providerConfigKey =
    readOptionalStringFromKeys(payload, ["providerConfigKey", "provider_config_key"]) ??
    defaultProviderConfigKey;
  const syncName = readRequiredStringFromKeys(payload, ["syncName", "sync_name"], payload);
  const model = readRequiredString(payload, "model", payload);

  if (!providerConfigKey) {
    throw new NangoWebhookError("Nango sync webhook payload is missing providerConfigKey.", {
      payload,
    });
  }

  const stage = resolveSyncStage(payload);

  return {
    provider: providerConfigKey,
    event: `sync.${stage}`,
    connectionId,
    eventType: `sync.${stage}`,
    objectType: "sync",
    objectId: `${connectionId}:${syncName}`,
    payload: buildSyncPayload(payload, {
      model,
      providerConfigKey,
      stage,
      syncName,
    }),
    raw: payload,
  };
}

function normalizeForwardWebhook(
  payload: NangoForwardWebhookPayload,
  defaultProviderConfigKey?: string,
): NormalizedWebhook {
  const providerConfigKey =
    readOptionalStringFromKeys(payload, ["providerConfigKey", "provider_config_key"]) ??
    defaultProviderConfigKey;
  const provider = resolveWebhookProvider(
    payload,
    ["provider", "from"],
    providerConfigKey,
    payload,
  );
  const connectionId = readRequiredStringFromKeys(payload, ["connectionId", "connection_id"], payload);
  const rawPayload = readRequiredRecord(payload.payload, payload, "payload");
  const metadata = extractForwardMetadata(rawPayload);

  return {
    provider,
    event: metadata.eventType,
    connectionId,
    eventType: metadata.eventType,
    objectType: metadata.objectType,
    objectId: metadata.objectId,
    payload: buildForwardPayload(payload, rawPayload, metadata, provider, providerConfigKey),
    raw: payload,
  };
}

function normalizeGenericWebhook(
  payload: NangoGenericWebhookPayload,
  defaultProviderConfigKey?: string,
): NormalizedWebhook {
  const provider =
    readOptionalString(payload.provider) ??
    readOptionalString(payload.providerConfigKey) ??
    readOptionalString(payload.provider_config_key) ??
    defaultProviderConfigKey ??
    "nango";
  const connectionId =
    readOptionalString(payload.connectionId) ?? readOptionalString(payload.connection_id);
  const providerConfigKey =
    readOptionalString(payload.providerConfigKey) ??
    readOptionalString(payload.provider_config_key) ??
    defaultProviderConfigKey ??
    null;
  const nestedPayload = readOptionalRecord(payload.payload) ?? readOptionalRecord(payload.data) ?? {};
  const metadata = readOptionalRecord(nestedPayload.metadata);
  const nestedData = readOptionalRecord(nestedPayload.data) ?? readOptionalRecord(payload.data);
  const nestedObject = readOptionalRecord(nestedPayload.object);
  const nestedDataObject = readOptionalRecord(nestedData?.object);
  const nestedItem = readOptionalRecord(nestedPayload.item);
  const eventType = payload.type;
  const objectType =
    readOptionalString(payload.objectType) ??
    readOptionalString(payload.object_type) ??
    readOptionalString(nestedPayload.objectType) ??
    readOptionalString(nestedPayload.object_type) ??
    readOptionalString(metadata?.objectType) ??
    readOptionalString(metadata?.object_type) ??
    readOptionalString(metadata?.resource) ??
    readOptionalString(metadata?.resource_type) ??
    readOptionalString(nestedObject?.type) ??
    readOptionalString(nestedObject?.object) ??
    readOptionalString(nestedDataObject?.type) ??
    readOptionalString(nestedDataObject?.object) ??
    readOptionalString(nestedData?.model) ??
    readOptionalString(nestedPayload.model);
  const objectId =
    normalizeObjectId(
      payload.objectId,
      payload.object_id,
      nestedPayload.objectId,
      nestedPayload.object_id,
      metadata?.objectId,
      metadata?.object_id,
      metadata?.resourceId,
      metadata?.resource_id,
      metadata?.entityId,
      metadata?.entity_id,
      nestedObject?.id,
      nestedObject?.objectId,
      nestedObject?.object_id,
      nestedData?.id,
      nestedData?.objectId,
      nestedData?.object_id,
      nestedData?.resourceId,
      nestedData?.resource_id,
      nestedDataObject?.id,
      nestedDataObject?.objectId,
      nestedDataObject?.object_id,
      nestedItem?.id,
      nestedItem?.objectId,
      nestedItem?.object_id,
    );

  if (!connectionId) {
    throw new NangoWebhookError(
      "Nango webhook payload is missing required string field: connectionId",
      { payload },
    );
  }

  if (!objectType) {
    throw new NangoWebhookError(
      "Nango webhook payload is missing explicit object metadata.",
      { payload },
    );
  }

  if (!objectId) {
    throw new NangoWebhookError(
      "Nango webhook payload is missing an explicit object identifier.",
      { payload },
    );
  }

  return {
    provider,
    event: eventType,
    connectionId,
    eventType,
    objectType,
    objectId,
    payload: buildGenericPayload(payload, nestedPayload, providerConfigKey),
    raw: payload,
  };
}

function buildAuthPayload(
  payload: NangoAuthWebhookPayload,
  values: {
    authMode: string;
    environment: string;
    operation: NangoAuthWebhookOperation;
    provider: string;
    providerConfigKey: string;
    success: boolean;
  },
): NangoNormalizedAuthPayload {
  return {
    from: readOptionalString(payload.from) ?? null,
    provider: values.provider,
    providerConfigKey: values.providerConfigKey,
    authMode: values.authMode,
    environment: values.environment,
    operation: values.operation,
    success: values.success,
    tags: normalizeRecord(payload.tags),
    endUser: normalizeRecord(payload.endUser ?? payload.end_user),
    error: normalizeRecord(payload.error),
    rawPayload: payload,
  };
}

function buildSyncPayload(
  payload: NangoSyncWebhookPayload,
  values: {
    model: string;
    providerConfigKey: string;
    stage: NangoSyncWebhookStage;
    syncName: string;
  },
): NangoNormalizedSyncPayload {
  return {
    from: readOptionalString(payload.from) ?? null,
    providerConfigKey: values.providerConfigKey,
    syncName: values.syncName,
    syncVariant: readOptionalStringFromKeys(payload, ["syncVariant", "sync_variant"]) ?? null,
    model: values.model,
    syncType: readOptionalStringFromKeys(payload, ["syncType", "sync_type"]) ?? null,
    stage: values.stage,
    success: typeof payload.success === "boolean" ? payload.success : null,
    modifiedAfter: readOptionalStringFromKeys(payload, ["modifiedAfter", "modified_after"]) ?? null,
    responseResults:
      readOptionalRecord(payload.responseResults) ??
      readOptionalRecord(payload.response_results) ??
      {},
    checkpoints: payload.checkpoints ?? null,
    error: normalizeRecord(payload.error),
    startedAt: readOptionalStringFromKeys(payload, ["startedAt", "started_at"]) ?? null,
    failedAt: readOptionalStringFromKeys(payload, ["failedAt", "failed_at"]) ?? null,
    rawPayload: payload,
  };
}

function buildForwardPayload(
  rawWebhook: NangoForwardWebhookPayload,
  rawPayload: JsonObject,
  metadata: NormalizedForwardMetadata,
  provider: string,
  providerConfigKey?: string,
): NangoNormalizedForwardPayload {
  return {
    from: provider,
    providerConfigKey: providerConfigKey ?? null,
    forwardedEventType: metadata.eventType,
    forwardedObjectType: metadata.objectType,
    forwardedObjectId: metadata.objectId,
    forwardedAction: metadata.action,
    forwardedTopic: metadata.topic,
    forwardedMetadata: metadata.metadata,
    forwardedObject: metadata.object,
    rawPayload,
    rawWebhook,
  };
}

function buildGenericPayload(
  rawWebhook: NangoGenericWebhookPayload,
  rawPayload: JsonObject,
  providerConfigKey: string | null,
): NangoNormalizedGenericPayload {
  return {
    ...rawPayload,
    providerConfigKey,
    rawPayload,
    rawWebhook,
  };
}

function resolveSyncStage(payload: NangoSyncWebhookPayload): NangoSyncWebhookStage {
  if (payload.success === true) {
    return "completed";
  }

  if (payload.success === false) {
    return "failed";
  }

  if (isRecord(payload.error) || readOptionalStringFromKeys(payload, ["failedAt", "failed_at"])) {
    return "failed";
  }

  if (
    isRecord(payload.responseResults) ||
    isRecord(payload.response_results) ||
    readOptionalStringFromKeys(payload, ["modifiedAfter", "modified_after"])
  ) {
    return "completed";
  }

  const candidates = [
    readOptionalString(payload.operation),
    readOptionalString(payload.status),
    readOptionalString(payload.event),
  ]
    .filter((value): value is string => value !== undefined)
    .map((value) => value.toLowerCase());

  if (candidates.some((value) => SYNC_STARTED_SIGNALS.has(value))) {
    return "started";
  }

  if (candidates.some((value) => SYNC_COMPLETED_SIGNALS.has(value))) {
    return "completed";
  }

  if (candidates.some((value) => SYNC_FAILED_SIGNALS.has(value))) {
    return "failed";
  }

  if (
    readOptionalStringFromKeys(payload, ["startedAt", "started_at"]) &&
    !readOptionalStringFromKeys(payload, ["failedAt", "failed_at"]) &&
    payload.responseResults === undefined &&
    payload.response_results === undefined
  ) {
    return "started";
  }

  throw new NangoWebhookError(
    "Nango sync webhook did not include enough state to determine whether it started, completed, or failed.",
    { payload },
  );
}

function readAuthWebhookOperation(payload: NangoAuthWebhookPayload): NangoAuthWebhookOperation {
  const operation = readRequiredString(payload, "operation", payload);

  if (operation === "creation" || operation === "override" || operation === "refresh") {
    return operation;
  }

  throw new NangoWebhookError(`Unsupported Nango auth webhook operation: ${operation}`, {
    payload,
  });
}

function resolveForwardObjectType(
  payload: Record<string, unknown>,
  metadata: Record<string, unknown> | undefined,
  objectRecord: Record<string, unknown> | undefined,
  dataObjectRecord: Record<string, unknown> | undefined,
): string | undefined {
  return selectOptionalString(
    payload.objectType,
    payload.object_type,
    payload.resource,
    payload.resource_type,
    payload.entity,
    payload.entity_type,
    metadata?.objectType,
    metadata?.object_type,
    metadata?.resource,
    metadata?.resource_type,
    metadata?.entity,
    metadata?.entity_type,
    objectRecord?.type,
    objectRecord?.object,
    dataObjectRecord?.type,
    dataObjectRecord?.object,
    payload.model,
  );
}

function resolveForwardObjectId(
  payload: Record<string, unknown>,
  metadata: Record<string, unknown> | undefined,
  objectRecord: Record<string, unknown> | undefined,
  dataRecord: Record<string, unknown> | undefined,
  dataObjectRecord: Record<string, unknown> | undefined,
  itemRecord: Record<string, unknown> | undefined,
): string | undefined {
  return normalizeObjectId(
    payload.objectId,
    payload.object_id,
    payload.resourceId,
    payload.resource_id,
    payload.id,
    metadata?.objectId,
    metadata?.object_id,
    metadata?.resourceId,
    metadata?.resource_id,
    metadata?.entityId,
    metadata?.entity_id,
    objectRecord?.id,
    objectRecord?.objectId,
    objectRecord?.object_id,
    objectRecord?.resourceId,
    objectRecord?.resource_id,
    objectRecord?.entityId,
    objectRecord?.entity_id,
    dataRecord?.id,
    dataRecord?.objectId,
    dataRecord?.object_id,
    dataRecord?.resourceId,
    dataRecord?.resource_id,
    dataObjectRecord?.id,
    dataObjectRecord?.objectId,
    dataObjectRecord?.object_id,
    dataObjectRecord?.resourceId,
    dataObjectRecord?.resource_id,
    itemRecord?.id,
    itemRecord?.objectId,
    itemRecord?.object_id,
  );
}

function resolveForwardEventType(
  payload: Record<string, unknown>,
  metadata: Record<string, unknown> | undefined,
  objectType: string | undefined,
  action: string | undefined,
): string | undefined {
  return (
    selectOptionalString(
      payload.eventType,
      payload.event_type,
      metadata?.eventType,
      metadata?.event_type,
    ) ??
    buildCompoundEvent(selectOptionalString(payload.topic, metadata?.topic), action) ??
    buildCompoundEvent(selectOptionalString(payload.event, metadata?.event), action) ??
    buildCompoundEvent(readOptionalString(payload.topic), action) ??
    buildCompoundEvent(readOptionalString(payload.event), action) ??
    buildCompoundEvent(objectType, action) ??
    buildCompoundEvent(readNonReservedType(payload.type), action) ??
    selectOptionalString(
      payload.topic,
      metadata?.topic,
      payload.event,
      metadata?.event,
      readNonReservedType(payload.type),
    )
  );
}

function resolveWebhookProvider(
  payload: Record<string, unknown>,
  keys: string[],
  fallback: string | undefined,
  rawPayload: unknown,
): string {
  const provider = readOptionalStringFromKeys(payload, keys) ?? fallback;

  if (!provider) {
    throw new NangoWebhookError(
      `Nango webhook payload is missing required string field: ${keys.join(" | ")}`,
      { payload: rawPayload },
    );
  }

  return provider;
}

function decodeWebhookPayload(rawPayload: unknown): unknown {
  if (typeof rawPayload === "string") {
    return parseJsonPayload(rawPayload, rawPayload);
  }

  if (rawPayload instanceof Uint8Array) {
    return parseJsonPayload(new TextDecoder().decode(rawPayload), rawPayload);
  }

  return rawPayload;
}

function parseJsonPayload(serializedPayload: string, rawPayload: unknown): unknown {
  try {
    return JSON.parse(serializedPayload) as unknown;
  } catch (cause) {
    throw new NangoWebhookError("Nango webhook payload is not valid JSON.", {
      cause,
      payload: rawPayload,
    });
  }
}

function buildCompoundEvent(subject?: string, action?: string): string | undefined {
  if (!subject || !action) {
    return undefined;
  }

  return `${subject}.${action}`;
}

function normalizeObjectId(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

function selectOptionalString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const candidate = readOptionalString(value);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function normalizeRecord(value: unknown): JsonObject {
  return isRecord(value) ? (value as JsonObject) : {};
}

function readOptionalRecord(value: unknown): JsonObject | undefined {
  return isRecord(value) ? (value as JsonObject) : undefined;
}

function readRequiredRecord(value: unknown, payload: unknown, key: string): JsonObject {
  const candidate = readOptionalRecord(value);

  if (!candidate) {
    throw new NangoWebhookError(`Nango webhook payload is missing required object field: ${key}`, {
      payload,
    });
  }

  return candidate;
}

function readNonReservedType(value: unknown): string | undefined {
  const candidate = readOptionalString(value);
  if (!candidate || RESERVED_NANGO_TYPES.has(candidate)) {
    return undefined;
  }

  return candidate;
}

function readRequiredString(
  value: Record<string, unknown>,
  key: string,
  payload: unknown,
): string {
  const candidate = readOptionalString(value[key]);

  if (!candidate) {
    throw new NangoWebhookError(`Nango webhook payload is missing required string field: ${key}`, {
      payload,
    });
  }

  return candidate;
}

function readRequiredStringFromKeys(
  value: Record<string, unknown>,
  keys: string[],
  payload: unknown,
): string {
  const candidate = readOptionalStringFromKeys(value, keys);

  if (!candidate) {
    throw new NangoWebhookError(
      `Nango webhook payload is missing required string field: ${keys.join(" | ")}`,
      { payload },
    );
  }

  return candidate;
}

function readRequiredBoolean(
  value: Record<string, unknown>,
  key: string,
  payload: unknown,
): boolean {
  if (typeof value[key] !== "boolean") {
    throw new NangoWebhookError(`Nango webhook payload is missing required boolean field: ${key}`, {
      payload,
    });
  }

  return value[key] as boolean;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readOptionalStringFromKeys(
  value: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!value) {
    return undefined;
  }

  for (const key of keys) {
    const candidate = readOptionalString(value[key]);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
