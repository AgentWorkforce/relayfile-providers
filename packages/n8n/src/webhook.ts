import { N8nWebhookError } from "./errors.js";
import {
  asRecord,
  asString,
  asStringRecord,
  toPayloadRecord,
} from "./internal.js";
import type { N8nWebhookInput, NormalizedWebhook } from "./types.js";

const WEBHOOK_PREFIXES = ["/webhook-test/", "/webhook/"] as const;

export function normalizeN8nWebhook(rawInput: unknown): NormalizedWebhook {
  const event = asRecord(rawInput) as N8nWebhookInput | undefined;
  if (!event) {
    throw new N8nWebhookError("Invalid n8n webhook payload.", rawInput);
  }

  const payload = toPayloadRecord(event.body);
  const normalizedPath = extractWebhookPath(event);
  const segments = normalizedPath.split("/").filter(Boolean);
  const query = asStringRecord(event.query);
  const params = asStringRecord(event.params);

  const provider =
    firstString(
      payload.provider,
      payload.providerName,
      payload.integration,
      payload.app,
      params.provider,
      query.provider,
      segments[0],
      "n8n",
    ) ?? "n8n";

  const objectType =
    firstString(
      payload.objectType,
      payload.resource,
      payload.entity,
      payload.model,
      params.objectType,
      query.objectType,
      segments[1],
      "webhook",
    ) ?? "webhook";

  const objectId =
    firstString(
      payload.objectId,
      payload.resourceId,
      payload.itemId,
      payload.id,
      params.objectId,
      query.objectId,
      segments[2],
      normalizedPath || "event",
    ) ?? "event";

  const eventType =
    firstString(
      payload.eventType,
      payload.event,
      payload.action,
      event.method?.toLowerCase(),
      "received",
    ) ?? "received";

  const connectionId =
    firstString(
      payload.connectionId,
      payload.credentialId,
      payload.credential_id,
      payload.authId,
      event.headers ? asStringRecord(event.headers)["x-n8n-credential-id"] : undefined,
      params.connectionId,
      query.connectionId,
      normalizedPath,
      provider,
    ) ?? provider;

  return {
    provider,
    event: eventType,
    connectionId,
    eventType,
    objectType,
    objectId,
    payload,
    raw: rawInput,
    metadata: {
      method: firstString(event.method, "post") ?? "post",
      webhookPath: normalizedPath,
      webhookMode: isTestWebhook(event) ? "test" : "production",
    },
  };
}

export function extractWebhookPath(event: N8nWebhookInput): string {
  const directPath =
    asString(event.webhookPath) ??
    asString(event.path) ??
    extractPathFromUrl(asString(event.url) ?? asString(event.rawUrl));

  if (!directPath) {
    return "";
  }

  const normalized = directPath.startsWith("/") ? directPath : `/${directPath}`;
  for (const prefix of WEBHOOK_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      return normalized.slice(prefix.length).replace(/^\/+/, "");
    }
  }

  return normalized.replace(/^\/+/, "");
}

export function isTestWebhook(event: N8nWebhookInput): boolean {
  const directPath =
    asString(event.webhookPath) ??
    asString(event.path) ??
    asString(event.url) ??
    asString(event.rawUrl);

  return Boolean(directPath && directPath.includes("/webhook-test/"));
}

function extractPathFromUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const candidate = asString(value);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}
