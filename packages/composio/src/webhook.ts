import { createHmac, timingSafeEqual } from "node:crypto";
import type { ComposioRequestHeaders, JsonObject, NormalizedWebhook } from "./types";

const COMPOSIO_PROVIDER_NAME = "composio";

const TRIGGER_OBJECT_TYPE: Readonly<Record<string, string>> = {
  GITHUB_COMMIT_EVENT: "commits",
  GITHUB_PULL_REQUEST_EVENT: "pull_requests",
  GITHUB_ISSUE_EVENT: "issues",
  GITHUB_STAR_EVENT: "stars",
  GITHUB_PUSH_EVENT: "pushes",
  SLACK_NEW_MESSAGE: "messages",
  SLACK_CHANNEL_CREATED: "channels",
  SLACK_REACTION_ADDED: "reactions",
  GMAIL_NEW_EMAIL: "emails",
  ZENDESK_NEW_TICKET: "tickets",
  ZENDESK_TICKET_UPDATED: "tickets",
  SHOPIFY_NEW_ORDER: "orders",
  SHOPIFY_ORDER_UPDATED: "orders",
  STRIPE_PAYMENT_RECEIVED: "payments",
  STRIPE_INVOICE_CREATED: "invoices",
  JIRA_ISSUE_CREATED: "issues",
  JIRA_ISSUE_UPDATED: "issues",
  HUBSPOT_CONTACT_CREATED: "contacts",
  HUBSPOT_DEAL_CREATED: "deals",
  NOTION_PAGE_UPDATED: "pages",
  LINEAR_ISSUE_CREATED: "issues",
  LINEAR_ISSUE_UPDATED: "issues",
  INTERCOM_NEW_CONVERSATION: "conversations",
  FRESHDESK_TICKET_CREATED: "tickets",
  FRESHDESK_TICKET_UPDATED: "tickets",
};

const EVENT_TYPE_TOKENS = {
  created: new Set(["created", "creation", "new", "added"]),
  updated: new Set(["updated", "update", "changed", "edited"]),
  deleted: new Set(["deleted", "delete", "removed", "archived"]),
} as const;

const CONNECTION_EVENT_TYPES: Readonly<Record<string, string>> = {
  "composio.connected_account.expired": "connection.expired",
};

type ComposioWebhookJson = JsonObject & {
  type?: string;
  trigger_name?: string;
  trigger_id?: string;
  connection_id?: string;
  payload?: JsonObject;
  data?: JsonObject;
  metadata?: JsonObject;
};

export interface ParsedComposioWebhookRequest {
  headers: ComposioRequestHeaders;
  payload: ComposioWebhookJson;
  rawBody?: string;
}

export interface ParsedComposioWebhookSignature {
  headerName?: string;
  raw?: string;
  scheme?: string;
  signature?: string;
  webhookId?: string;
  webhookTimestamp?: string;
  webhookVersion?: string;
}

export interface VerifyComposioWebhookSignatureOptions {
  headers: unknown;
  payload: string;
  secret: string;
  toleranceSeconds?: number;
}

export function normalizeComposioWebhook(rawPayload: unknown): NormalizedWebhook {
  const request = parseComposioWebhookRequest(rawPayload);
  const payload = request.payload;
  const metadata = getNestedRecord(payload, "metadata");
  const data = resolvePayloadData(payload);
  const rawType = readOptionalString(payload.type) ?? readOptionalString(payload.trigger_name);
  const triggerSlug =
    readOptionalString(metadata.trigger_slug) ??
    readOptionalString(payload.trigger_name) ??
    normalizeTriggerSlug(rawType);

  const provider = extractComposioProvider(payload, triggerSlug, rawType, data);
  const connectionId = extractConnectionId(payload, metadata, data);
  const eventType = extractComposioEventType(payload, triggerSlug, rawType);
  const objectType = extractComposioObjectType(payload, triggerSlug, rawType, data);
  const objectId = extractComposioObjectId(payload, data, connectionId, rawType);

  return {
    provider,
    connectionId,
    eventType,
    objectType,
    objectId,
    payload: data,
  };
}

export function parseComposioWebhookRequest(rawPayload: unknown): ParsedComposioWebhookRequest {
  const headers = extractComposioWebhookHeaders(rawPayload);
  const rawBody = extractRawBody(rawPayload);
  const decodedPayload = parseWebhookPayload(
    extractPayloadCandidate(rawPayload),
    rawBody,
  );

  return {
    headers,
    payload: decodedPayload,
    ...(rawBody !== undefined ? { rawBody } : {}),
  };
}

export function extractComposioWebhookHeaders(rawPayload: unknown): ComposioRequestHeaders {
  if (!isRecord(rawPayload)) {
    return {};
  }

  const headerSource =
    rawPayload.headers ??
    rawPayload.header ??
    rawPayload.requestHeaders ??
    rawPayload.request_headers;

  return normalizeComposioWebhookHeaders(headerSource);
}

export function normalizeComposioWebhookHeaders(headers: unknown): ComposioRequestHeaders {
  if (!headers) {
    return {};
  }

  const normalized: ComposioRequestHeaders = {};

  if (hasEntries(headers)) {
    for (const [key, value] of headers.entries()) {
      const normalizedKey = normalizeHeaderKey(key);
      const normalizedValue = normalizeHeaderValue(value);
      if (normalizedKey && normalizedValue !== undefined) {
        normalized[normalizedKey] = normalizedValue;
      }
    }
    return normalized;
  }

  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (!Array.isArray(entry) || entry.length < 2) {
        continue;
      }

      const normalizedKey = normalizeHeaderKey(entry[0]);
      const normalizedValue = normalizeHeaderValue(entry[1]);
      if (normalizedKey && normalizedValue !== undefined) {
        normalized[normalizedKey] = normalizedValue;
      }
    }
    return normalized;
  }

  if (!isRecord(headers)) {
    return {};
  }

  for (const [key, value] of Object.entries(headers)) {
    const normalizedKey = normalizeHeaderKey(key);
    const normalizedValue = normalizeHeaderValue(value);
    if (normalizedKey && normalizedValue !== undefined) {
      normalized[normalizedKey] = normalizedValue;
    }
  }

  return normalized;
}

export function parseComposioWebhookSignature(headers: unknown): ParsedComposioWebhookSignature {
  const normalizedHeaders = normalizeComposioWebhookHeaders(headers);
  const headerName = extractComposioWebhookSignatureHeaderName(normalizedHeaders);
  const raw = extractComposioWebhookSignatureHeader(normalizedHeaders);
  const parsed = parseSignatureValue(raw);
  const webhookId = extractComposioWebhookIdHeader(normalizedHeaders);
  const webhookTimestamp = extractComposioWebhookTimestampHeader(normalizedHeaders);
  const webhookVersion = extractComposioWebhookVersionHeader(normalizedHeaders);

  return {
    ...(headerName ? { headerName } : {}),
    ...(raw ? { raw } : {}),
    ...(parsed.scheme ? { scheme: parsed.scheme } : {}),
    ...(parsed.signature ? { signature: parsed.signature } : {}),
    ...(webhookId ? { webhookId } : {}),
    ...(webhookTimestamp ? { webhookTimestamp } : {}),
    ...(webhookVersion ? { webhookVersion } : {}),
  };
}

export function extractComposioWebhookSignatureHeaderName(headers: unknown): string | undefined {
  const normalizedHeaders = normalizeComposioWebhookHeaders(headers);

  return (
    findHeaderName(normalizedHeaders, "webhook-signature") ??
    findHeaderName(normalizedHeaders, "x-composio-signature")
  );
}

export function extractComposioWebhookSignatureHeader(headers: unknown): string | undefined {
  const normalizedHeaders = normalizeComposioWebhookHeaders(headers);
  const headerName = extractComposioWebhookSignatureHeaderName(normalizedHeaders);

  return headerName ? normalizedHeaders[headerName] : undefined;
}

export function extractComposioWebhookIdHeader(headers: unknown): string | undefined {
  const normalizedHeaders = normalizeComposioWebhookHeaders(headers);
  return readOptionalHeader(normalizedHeaders, "webhook-id", "svix-id");
}

export function extractComposioWebhookTimestampHeader(headers: unknown): string | undefined {
  const normalizedHeaders = normalizeComposioWebhookHeaders(headers);
  return readOptionalHeader(normalizedHeaders, "webhook-timestamp", "svix-timestamp");
}

export function extractComposioWebhookVersionHeader(headers: unknown): string | undefined {
  const normalizedHeaders = normalizeComposioWebhookHeaders(headers);
  return readOptionalHeader(normalizedHeaders, "x-composio-webhook-version");
}

export function verifyComposioWebhookSignature(
  options: VerifyComposioWebhookSignatureOptions,
): boolean {
  const secret = options.secret.trim();
  if (secret.length === 0) {
    throw new Error("Composio webhook verification requires a non-empty secret.");
  }

  const parsedSignature = parseComposioWebhookSignature(options.headers);
  if (!parsedSignature.signature) {
    throw new Error("Composio webhook signature header is missing.");
  }

  if (!parsedSignature.webhookId) {
    throw new Error("Composio webhook id header is missing.");
  }

  if (!parsedSignature.webhookTimestamp) {
    throw new Error("Composio webhook timestamp header is missing.");
  }

  const toleranceSeconds = options.toleranceSeconds ?? 300;
  if (toleranceSeconds > 0) {
    const parsedTimestamp = Number(parsedSignature.webhookTimestamp);
    if (!Number.isFinite(parsedTimestamp)) {
      throw new Error("Composio webhook timestamp header must be numeric.");
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - parsedTimestamp) > toleranceSeconds) {
      throw new Error("Composio webhook timestamp is outside the allowed tolerance.");
    }
  }

  const signingString = `${parsedSignature.webhookId}.${parsedSignature.webhookTimestamp}.${options.payload}`;
  const expectedSignature = createHmac("sha256", secret).update(signingString).digest("base64");

  return safeCompareBase64(expectedSignature, parsedSignature.signature);
}

export function extractComposioEventType(
  payload: unknown,
  triggerSlug?: string,
  rawType?: string,
): string {
  const normalizedRawType = readOptionalString(rawType) ?? readOptionalStringFromRecord(payload, "type");
  if (normalizedRawType) {
    const mapped = CONNECTION_EVENT_TYPES[normalizedRawType.toLowerCase()];
    if (mapped) {
      return mapped;
    }
  }

  const slug = normalizeTriggerSlug(triggerSlug ?? normalizedRawType);
  if (slug) {
    const tokens = tokenizeSlug(slug);
    if (tokens.some((token) => EVENT_TYPE_TOKENS.created.has(token))) {
      return "created";
    }
    if (tokens.some((token) => EVENT_TYPE_TOKENS.updated.has(token))) {
      return "updated";
    }
    if (tokens.some((token) => EVENT_TYPE_TOKENS.deleted.has(token))) {
      return "deleted";
    }
  }

  if (normalizedRawType?.startsWith(`${COMPOSIO_PROVIDER_NAME}.`)) {
    return normalizedRawType.slice(COMPOSIO_PROVIDER_NAME.length + 1);
  }

  return "event";
}

export function extractComposioProvider(
  payload: unknown,
  triggerSlug?: string,
  rawType?: string,
  data?: Record<string, unknown>,
): string {
  const metadata = getNestedRecord(isRecord(payload) ? payload : undefined, "metadata");

  return (
    readOptionalString(metadata.toolkit) ??
    readOptionalStringFromRecord(payload, "provider", "toolkit") ??
    readOptionalStringFromRecord(data, "provider", "toolkit") ??
    inferProvider(triggerSlug, rawType)
  );
}

export function extractComposioObjectType(
  payload: unknown,
  triggerSlug?: string,
  rawType?: string,
  data?: Record<string, unknown>,
): string {
  const normalizedRawType = readOptionalString(rawType) ?? readOptionalStringFromRecord(payload, "type");
  if (normalizedRawType === "composio.connected_account.expired") {
    return "connection";
  }

  const slug = normalizeTriggerSlug(triggerSlug ?? normalizedRawType);
  if (slug && TRIGGER_OBJECT_TYPE[slug]) {
    return TRIGGER_OBJECT_TYPE[slug];
  }

  const objectType =
    readOptionalStringFromRecord(data, "objectType", "object_type", "resource", "resource_type") ??
    inferObjectType(slug);

  return objectType ?? "event";
}

export function extractComposioObjectId(
  payload: unknown,
  data?: Record<string, unknown>,
  connectionId?: string,
  rawType?: string,
): string {
  const normalizedRawType = readOptionalString(rawType) ?? readOptionalStringFromRecord(payload, "type");
  if (normalizedRawType === "composio.connected_account.expired" && connectionId) {
    return connectionId;
  }

  const candidates = [
    readOptionalStringFromRecord(data, "id", "objectId", "object_id"),
    readOptionalStringFromRecord(
      data,
      "messageId",
      "message_id",
      "threadId",
      "thread_id",
      "ticketId",
      "ticket_id",
      "issueId",
      "issue_id",
      "orderId",
      "order_id",
      "pageId",
      "page_id",
      "documentId",
      "document_id",
      "conversationId",
      "conversation_id",
      "emailId",
      "email_id",
      "contactId",
      "contact_id",
      "dealId",
      "deal_id",
      "pullRequestId",
      "pull_request_id",
      "commitId",
      "commit_id",
      "commitSha",
      "commit_sha",
    ),
    readNestedIdentifier(data, "issue", "id", "number"),
    readNestedIdentifier(data, "pull_request", "id", "number"),
    readNestedIdentifier(data, "message", "id", "ts"),
    readNestedIdentifier(data, "conversation", "id"),
    readNestedIdentifier(data, "email", "id"),
    readNestedIdentifier(data, "page", "id"),
    readNestedIdentifier(data, "document", "id"),
    readNestedIdentifier(data, "contact", "id"),
    readNestedIdentifier(data, "deal", "id"),
    readNestedIdentifier(data, "ticket", "id"),
    readOptionalStringFromRecord(payload, "id", "trigger_id", "log_id"),
    connectionId,
  ];

  for (const candidate of candidates) {
    if (candidate) {
      return candidate;
    }
  }

  return "unknown";
}

export function extractComposioConnectionId(
  rawPayload: unknown,
): string {
  const request = parseComposioWebhookRequest(rawPayload);
  const metadata = getNestedRecord(request.payload, "metadata");
  const data = resolvePayloadData(request.payload);

  return extractConnectionId(request.payload, metadata, data);
}

function extractPayloadCandidate(rawPayload: unknown): unknown {
  if (!isRecord(rawPayload)) {
    return rawPayload;
  }

  if ("body" in rawPayload) {
    return rawPayload.body;
  }

  if ("payload" in rawPayload && looksLikeWebhookEnvelope(rawPayload)) {
    return rawPayload.payload;
  }

  return rawPayload;
}

function extractRawBody(rawPayload: unknown): string | undefined {
  if (!isRecord(rawPayload)) {
    return asSerializedPayload(rawPayload);
  }

  const rawBodyCandidate =
    rawPayload.rawBody ??
    rawPayload.raw_body ??
    rawPayload.body;

  return asSerializedPayload(rawBodyCandidate);
}

function parseWebhookPayload(
  candidate: unknown,
  rawBody: string | undefined,
): ComposioWebhookJson {
  const decoded = decodeWebhookPayload(candidate, rawBody);
  if (!isRecord(decoded)) {
    throw new Error("Composio webhook payload must be a JSON object.");
  }

  return decoded as ComposioWebhookJson;
}

function decodeWebhookPayload(candidate: unknown, rawBody?: string): unknown {
  if (typeof candidate === "string") {
    return parseJsonPayload(candidate);
  }

  if (candidate instanceof Uint8Array) {
    const serialized = new TextDecoder().decode(candidate);
    return parseJsonPayload(serialized);
  }

  if (candidate === undefined && rawBody !== undefined) {
    return parseJsonPayload(rawBody);
  }

  return candidate;
}

function parseJsonPayload(serializedPayload: string): unknown {
  try {
    return JSON.parse(serializedPayload) as unknown;
  } catch (cause) {
    throw new Error(
      `Composio webhook payload is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

function resolvePayloadData(payload: ComposioWebhookJson): Record<string, unknown> {
  const payloadRecord =
    normalizePayloadRecord(payload.data) ||
    normalizePayloadRecord(payload.payload);

  return payloadRecord ?? {};
}

function extractConnectionId(
  payload: ComposioWebhookJson,
  metadata: Record<string, unknown>,
  data: Record<string, unknown>,
): string {
  const connectionId =
    readOptionalStringFromRecord(
      metadata,
      "connected_account_id",
      "connection_id",
      "connectedAccountId",
      "connectionId",
    ) ??
    readOptionalStringFromRecord(
      payload,
      "connection_id",
      "connected_account_id",
      "connectionId",
      "connectedAccountId",
    ) ??
    readOptionalStringFromRecord(
      data,
      "connection_id",
      "connected_account_id",
      "connectionId",
      "connectedAccountId",
      "connection_nano_id",
      "connected_account_nano_id",
    );

  if (!connectionId) {
    throw new Error("Composio webhook payload is missing a connection identifier.");
  }

  return connectionId;
}

function inferProvider(triggerSlug?: string, rawType?: string): string {
  const slug = normalizeTriggerSlug(triggerSlug);
  if (slug) {
    const [provider] = slug.toLowerCase().split("_", 1);
    if (provider) {
      return provider;
    }
  }

  const raw = readOptionalString(rawType)?.toLowerCase();
  if (raw) {
    if (raw.startsWith(`${COMPOSIO_PROVIDER_NAME}.`)) {
      return COMPOSIO_PROVIDER_NAME;
    }

    const [provider] = raw.split(/[._]/, 1);
    if (provider) {
      return provider;
    }
  }

  return COMPOSIO_PROVIDER_NAME;
}

function inferObjectType(triggerSlug?: string): string | undefined {
  const slug = normalizeTriggerSlug(triggerSlug);
  if (!slug) {
    return undefined;
  }

  const tokens = tokenizeSlug(slug)
    .filter((token) => token !== "event" && token !== "trigger" && token !== "message" && token !== "webhook");

  if (tokens.length <= 1) {
    return undefined;
  }

  const objectTokens = tokens
    .slice(1)
    .filter((token) => !EVENT_TYPE_TOKENS.created.has(token))
    .filter((token) => !EVENT_TYPE_TOKENS.updated.has(token))
    .filter((token) => !EVENT_TYPE_TOKENS.deleted.has(token));

  if (objectTokens.length === 0) {
    return undefined;
  }

  const objectType = objectTokens.join("_");
  return objectType.endsWith("s") ? objectType : `${objectType}s`;
}

function normalizeTriggerSlug(value: string | undefined): string | undefined {
  const normalized = readOptionalString(value);
  if (!normalized) {
    return undefined;
  }

  if (normalized.startsWith(`${COMPOSIO_PROVIDER_NAME}.`)) {
    return undefined;
  }

  return normalized.replace(/[.\s-]+/g, "_").toUpperCase();
}

function tokenizeSlug(value: string): string[] {
  return value
    .toLowerCase()
    .split("_")
    .filter((token) => token.length > 0);
}

function readNestedIdentifier(
  value: Record<string, unknown> | undefined,
  key: string,
  ...idKeys: string[]
): string | undefined {
  const nested = getNestedRecord(value, key);
  return readOptionalStringFromRecord(nested, ...idKeys);
}

function getNestedRecord(
  value: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> {
  const candidate = value?.[key];
  return isRecord(candidate) ? candidate : {};
}

function normalizePayloadRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function readOptionalStringFromRecord(
  value: unknown,
  ...keys: string[]
): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of keys) {
    const candidate = readOptionalString(value[key]);
    if (candidate) {
      return candidate;
    }

    const stringified = normalizeScalar(value[key]);
    if (stringified) {
      return stringified;
    }
  }

  return undefined;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeScalar(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  return undefined;
}

function parseSignatureValue(value: string | undefined): { scheme?: string; signature?: string } {
  const raw = readOptionalString(value);
  if (!raw) {
    return {};
  }

  const [schemeCandidate, signatureCandidate] = raw.split(",", 2);
  const scheme = readOptionalString(signatureCandidate ? schemeCandidate : undefined);
  const signature = readOptionalString(signatureCandidate ?? schemeCandidate);

  return {
    ...(scheme ? { scheme } : {}),
    ...(signature ? { signature } : {}),
  };
}

function safeCompareBase64(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function normalizeHeaderKey(value: unknown): string | undefined {
  const key = readOptionalString(value);
  return key?.toLowerCase();
}

function normalizeHeaderValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const stringValues = value.filter((entry): entry is string => typeof entry === "string");
    return stringValues.length > 0 ? stringValues.join(", ") : undefined;
  }

  return undefined;
}

function readOptionalHeader(headers: ComposioRequestHeaders, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = headers[key.toLowerCase()];
    if (candidate !== undefined) {
      return candidate;
    }
  }

  return undefined;
}

function findHeaderName(headers: ComposioRequestHeaders, key: string): string | undefined {
  return key.toLowerCase() in headers ? key.toLowerCase() : undefined;
}

function asSerializedPayload(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Uint8Array) {
    return new TextDecoder().decode(value);
  }

  return undefined;
}

function looksLikeWebhookEnvelope(value: Record<string, unknown>): boolean {
  return "headers" in value || "body" in value || "rawBody" in value || "raw_body" in value;
}

function hasEntries(value: unknown): value is { entries(): IterableIterator<[string, string]> } {
  return typeof value === "object" && value !== null && "entries" in value && typeof value.entries === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
