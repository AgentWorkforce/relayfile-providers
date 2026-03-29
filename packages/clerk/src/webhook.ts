import type {
  ClerkNormalizedWebhook,
  ClerkWebhookEnvelope,
  ClerkWebhookEvent,
  ClerkWebhookHeaders,
} from "./types.js";

const OBJECT_TYPE_ALIASES: Record<string, string> = {
  organization: "organizations",
  session: "sessions",
  user: "users",
};

export interface NormalizeClerkWebhookOptions {
  providerName?: string;
  webhookSecret?: string;
  verifyWebhook?: (
    payload: string | Uint8Array,
    headers: ClerkWebhookHeaders,
  ) => Promise<ClerkWebhookEvent>;
}

export async function normalizeClerkWebhookInput(
  rawInput: unknown,
  options: NormalizeClerkWebhookOptions = {},
): Promise<ClerkNormalizedWebhook> {
  const providerName = options.providerName ?? "clerk";
  const envelope = asWebhookEnvelope(rawInput);

  if (envelope) {
    const payload = envelope.payload ?? envelope.body;
    if (payload === undefined) {
      throw new Error("Clerk webhook envelope must include payload or body.");
    }

    const event =
      options.webhookSecret && options.verifyWebhook
        ? await options.verifyWebhook(payload, envelope.headers)
        : parseWebhookPayload(payload);

    return normalizeClerkWebhookEvent(event, {
      providerName,
      headers: envelope.headers,
    });
  }

  if (typeof rawInput === "string" || rawInput instanceof Uint8Array) {
    return normalizeClerkWebhookEvent(parseWebhookPayload(rawInput), {
      providerName,
    });
  }

  return normalizeClerkWebhookEvent(asWebhookEvent(rawInput), { providerName });
}

export function normalizeClerkWebhookEvent(
  event: ClerkWebhookEvent,
  options: {
    providerName?: string;
    headers?: ClerkWebhookHeaders;
  } = {},
): ClerkNormalizedWebhook {
  const objectType = normalizeObjectType(event.type);
  const objectId = extractObjectId(event);
  const headerRecord = normalizeHeaderRecord(options.headers);
  const connectionId = extractConnectionId(event, objectId);

  return {
    provider: options.providerName ?? "clerk",
    connectionId,
    objectType,
    objectId,
    eventType: extractEventType(event.type),
    payload: event.data,
    ...(Object.keys(headerRecord).length > 0 ? { headers: headerRecord } : {}),
    ...(headerRecord["svix-id"] ? { deliveryId: headerRecord["svix-id"] } : {}),
    ...(headerRecord["svix-timestamp"] ? { timestamp: headerRecord["svix-timestamp"] } : {}),
    metadata: {
      clerkEventType: event.type,
    },
  };
}

export async function verifyClerkWebhook(
  webhookSecret: string,
  payload: string | Uint8Array,
  headers: ClerkWebhookHeaders,
): Promise<ClerkWebhookEvent> {
  const { Webhook } = await import("svix");
  const verifier = new Webhook(webhookSecret);
  const normalizedHeaders = normalizeHeaderRecord(headers);
  for (const header of ["svix-id", "svix-timestamp", "svix-signature"]) {
    if (!normalizedHeaders[header]) {
      throw new Error(`Missing required Clerk webhook header "${header}".`);
    }
  }
  const verified = verifier.verify(asText(payload), normalizedHeaders);
  return asWebhookEvent(verified);
}

export function normalizeHeaderRecord(headers?: ClerkWebhookHeaders): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    const output: Record<string, string> = {};
    headers.forEach((value, key) => {
      output[key.toLowerCase()] = value;
    });
    return output;
  }

  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string" && value.length > 0) {
      output[key.toLowerCase()] = value;
      continue;
    }
    if (Array.isArray(value) && typeof value[0] === "string") {
      output[key.toLowerCase()] = value[0];
    }
  }
  return output;
}

function normalizeObjectType(type: string): string {
  const raw = type.includes(".") ? type.slice(0, type.lastIndexOf(".")) : type;
  return OBJECT_TYPE_ALIASES[raw] ?? raw;
}

function extractEventType(type: string): string {
  if (!type.includes(".")) {
    return type;
  }
  return type.slice(type.lastIndexOf(".") + 1);
}

function extractObjectId(event: ClerkWebhookEvent): string {
  const candidates = [
    event.data.id,
    event.data.sessionId,
    event.data.session_id,
    event.data.userId,
    event.data.user_id,
    event.data.organizationId,
    event.data.organization_id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  throw new Error(`Unable to determine object id for Clerk webhook "${event.type}".`);
}

function extractConnectionId(event: ClerkWebhookEvent, fallback: string): string {
  const actor = asRecord(event.data.actor);
  const candidates = [
    event.data.userId,
    event.data.user_id,
    event.data.createdBy,
    event.data.created_by,
    actor?.userId,
    actor?.user_id,
    actor?.sub,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  if (event.type.startsWith("user.")) {
    return fallback;
  }

  return fallback;
}

function parseWebhookPayload(payload: string | Uint8Array): ClerkWebhookEvent {
  const parsed = JSON.parse(asText(payload)) as unknown;
  return asWebhookEvent(parsed);
}

function asWebhookEvent(value: unknown): ClerkWebhookEvent {
  if (!isRecord(value)) {
    throw new Error("Clerk webhook payload must be an object.");
  }
  if (typeof value.type !== "string" || value.type.trim().length === 0) {
    throw new Error("Clerk webhook payload must include a non-empty type.");
  }
  if (!isRecord(value.data)) {
    throw new Error("Clerk webhook payload must include a data object.");
  }
  return {
    ...value,
    type: value.type,
    data: value.data,
  };
}

function asWebhookEnvelope(value: unknown): ClerkWebhookEnvelope | null {
  if (!isRecord(value) || !("headers" in value)) {
    return null;
  }
  if (
    !("payload" in value) &&
    !("body" in value)
  ) {
    return null;
  }
  return value as unknown as ClerkWebhookEnvelope;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(payload: string | Uint8Array): string {
  if (typeof payload === "string") {
    return payload;
  }
  return new TextDecoder().decode(payload);
}
