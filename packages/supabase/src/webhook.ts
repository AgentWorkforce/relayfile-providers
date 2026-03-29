import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseNormalizedWebhook, SupabaseWebhookPayload } from "./types.js";

const DATABASE_EVENT_TYPES: Record<string, "created" | "deleted" | "updated"> = {
  delete: "deleted",
  insert: "created",
  update: "updated",
};

const AUTH_EVENT_TYPES: Record<string, string> = {
  "mfa.challenge.verified": "verified",
  "mfa.factor.created": "created",
  "mfa.factor.deleted": "deleted",
  "password.changed": "updated",
  "password.recovery_requested": "requested",
  "user.created": "created",
  "user.deleted": "deleted",
  "user.signed_in": "signed_in",
  "user.signed_out": "signed_out",
  "user.updated": "updated",
};

export function normalizeSupabaseWebhook(rawPayload: unknown): SupabaseNormalizedWebhook {
  const payload = ensureRecord(rawPayload);
  const databaseWebhook = normalizeDatabaseWebhook(payload);
  if (databaseWebhook) {
    return databaseWebhook;
  }

  return normalizeAuthWebhook(payload);
}

export function verifyWebhook(
  payload: string,
  secret: string,
  signature: string,
): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const candidates = extractSignatureCandidates(signature);
  return candidates.some((candidate) => safeEqualHex(candidate, expected));
}

export function extractSupabaseWebhookSignature(
  headers: Headers | Record<string, string | undefined>,
): string | undefined {
  if (headers instanceof Headers) {
    return headers.get("x-supabase-signature")
      ?? headers.get("x-webhook-signature")
      ?? headers.get("x-signature")
      ?? undefined;
  }

  const lower = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return lower.get("x-supabase-signature")
    ?? lower.get("x-webhook-signature")
    ?? lower.get("x-signature")
    ?? undefined;
}

function normalizeDatabaseWebhook(payload: SupabaseWebhookPayload): SupabaseNormalizedWebhook | null {
  const table = typeof payload.table === "string" ? payload.table : undefined;
  const schema = typeof payload.schema === "string" ? payload.schema : undefined;
  const type = typeof payload.type === "string" ? payload.type.toLowerCase() : undefined;
  const eventType = type ? DATABASE_EVENT_TYPES[type] : undefined;

  if (!table || !schema || !eventType) {
    return null;
  }

  const record = ensureRecord(payload.record ?? payload.old_record);
  const objectId = readObjectId(record.id, "Supabase database webhook is missing record.id.");
  return {
    provider: "supabase",
    event: eventType,
    connectionId: objectId,
    eventType,
    objectType: `${schema}.${table}`,
    objectId,
    payload: payload as Record<string, unknown>,
    raw: payload,
  };
}

function normalizeAuthWebhook(payload: SupabaseWebhookPayload): SupabaseNormalizedWebhook {
  const eventName = readEventName(payload);
  const eventType = AUTH_EVENT_TYPES[eventName] ?? eventName.replace(/\./g, "_");
  const subject = ensureRecord(payload.user ?? payload.record ?? payload.session ?? payload.factor);
  const objectId = readObjectId(
    subject.id ?? getNestedValue(subject, "user.id") ?? payload.claims?.sub,
    "Supabase auth webhook is missing a user or factor id.",
  );

  return {
    provider: "supabase",
    event: eventType,
    connectionId: typeof payload.claims?.sub === "string" ? payload.claims.sub : objectId,
    eventType,
    objectType: resolveObjectType(payload),
    objectId,
    payload: payload as Record<string, unknown>,
    raw: payload,
  };
}

function readEventName(payload: SupabaseWebhookPayload): string {
  const value = typeof payload.event === "string"
    ? payload.event
    : typeof payload.type === "string"
      ? payload.type
      : undefined;

  if (!value || value.trim().length === 0) {
    throw new Error("Supabase webhook is missing event or type.");
  }

  return value.trim().toLowerCase();
}

function resolveObjectType(payload: SupabaseWebhookPayload): string {
  if (payload.factor) {
    return "auth.mfa_factor";
  }
  if (payload.session) {
    return "auth.sessions";
  }
  return "auth.users";
}

function extractSignatureCandidates(signature: string): string[] {
  const trimmed = signature.trim();
  if (!trimmed) {
    return [];
  }

  return trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split("=").at(-1) ?? part);
}

function safeEqualHex(left: string, right: string): boolean {
  if (
    left.length !== right.length
    || left.length % 2 !== 0
    || !HEX_DIGEST_PATTERN.test(left)
    || !HEX_DIGEST_PATTERN.test(right)
  ) {
    return false;
  }

  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function ensureRecord(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }

  throw new Error("Expected object payload.");
}

function readObjectId(input: unknown, message: string): string {
  if (typeof input === "string" && input.trim().length > 0) {
    return input;
  }

  throw new Error(message);
}

function getNestedValue(input: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, input);
}

const HEX_DIGEST_PATTERN = /^[0-9a-f]+$/i;
