import { computeCanonicalPath, type NormalizedWebhook } from "@relayfile/sdk";
import { asObject, asOptionalString, isObject } from "./apps.js";

export function normalizePipedreamWebhook(rawInput: unknown): NormalizedWebhook {
  const record = asObject(rawInput);

  if (isRelayfileStyleWebhook(record)) {
    return {
      provider: record.provider,
      connectionId:
        asOptionalString(record.connectionId) ??
        asOptionalString(record.connection_id) ??
        String(record.objectId ?? record.object_id),
      objectType: String(record.objectType ?? record.object_type),
      objectId: String(record.objectId ?? record.object_id),
      eventType: String(record.eventType ?? record.event_type),
      payload:
        isObject(record.payload) || isObject(record.data)
          ? (record.payload ?? record.data)
          : record,
      metadata: readStringMap(record.metadata),
    } as NormalizedWebhook;
  }

  const event = asOptionalString(record.event) ?? asOptionalString(record.type);
  if (event === "CONNECTION_SUCCESS") {
    const account = isObject(record.account) ? record.account : {};
    const app = isObject(account.app) ? account.app : {};
    const accountId =
      asOptionalString(account.id) ??
      asOptionalString(record.connect_token) ??
      sessionFallback(record);

    return {
      provider: asOptionalString(app.name_slug) ?? "pipedream",
      connectionId: accountId,
      objectType: "account",
      objectId: accountId,
      eventType: "connected",
      payload: record,
      metadata: buildMetadata(record),
    } as NormalizedWebhook;
  }

  if (event === "CONNECTION_ERROR") {
    const objectId = sessionFallback(record);
    return {
      provider: "pipedream",
      connectionId: objectId,
      objectType: "connect_session",
      objectId,
      eventType: "connection_error",
      payload: record,
      metadata: buildMetadata(record),
    } as NormalizedWebhook;
  }

  const objectType =
    asOptionalString(record.object_type) ??
    asOptionalString(record.objectType) ??
    asOptionalString(record.entity) ??
    "event";
  const objectId =
    asOptionalString(record.object_id) ??
    asOptionalString(record.objectId) ??
    asOptionalString(record.id) ??
    sessionFallback(record);
  const eventType =
    asOptionalString(record.event_type) ??
    asOptionalString(record.eventType) ??
    asOptionalString(record.event) ??
    "updated";
  const provider =
    asOptionalString(record.provider) ??
    asOptionalString(record.app) ??
    "pipedream";
  const connectionId =
    asOptionalString(record.connection_id) ??
    asOptionalString(record.connectionId) ??
    objectId;

  return {
    provider,
    connectionId,
    objectType,
    objectId,
    eventType,
    payload: record,
    metadata: readStringMap(record.metadata),
  } as NormalizedWebhook;
}

export function getWebhookPath(event: NormalizedWebhook): string {
  return computeCanonicalPath(event.provider, event.objectType, event.objectId);
}

function isRelayfileStyleWebhook(
  value: Record<string, unknown>
): value is Record<string, unknown> & {
  provider: string;
  objectType: string;
  objectId: string;
  eventType: string;
} {
  return (
    typeof value.provider === "string" &&
    typeof (value.objectType ?? value.object_type) === "string" &&
    typeof (value.objectId ?? value.object_id) === "string" &&
    typeof (value.eventType ?? value.event_type) === "string"
  );
}

function buildMetadata(record: Record<string, unknown>): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const key of ["environment", "connect_token", "connect_session_id", "error"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      metadata[`pipedream.${key}`] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      metadata[`pipedream.${key}`] = String(value);
    }
  }
  return metadata;
}

function readStringMap(value: unknown): Record<string, string> | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      result[key] = entry;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function sessionFallback(record: Record<string, unknown>): string {
  const fromToken = asOptionalString(record.connect_token);
  if (fromToken) {
    return fromToken;
  }
  const sessionId = record.connect_session_id;
  if (typeof sessionId === "number" && Number.isFinite(sessionId)) {
    return `session_${sessionId}`;
  }
  return `pipedream_${Date.now()}`;
}
