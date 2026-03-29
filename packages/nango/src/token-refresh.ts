import {
  NangoRefreshHttpError,
  NangoRefreshNetworkError,
  NangoRefreshRejectedError,
  NangoRefreshResponseError,
} from "./errors.js";
import type {
  HeaderValue,
  NangoConnectionError,
  NangoRefreshRequestOptions,
  NangoRefreshResponse,
  RefreshRetryDecision,
  RefreshRetryDecisionInput,
} from "./types.js";

export const DEFAULT_NANGO_BASE_URL = "https://api.nango.dev";

const TOKEN_REFRESH_HINTS = [
  "access token expired",
  "auth token expired",
  "authorization token expired",
  "credential expired",
  "credentials expired",
  "expired access token",
  "expired token",
  "invalid_grant",
  "invalid token",
  "reauthenticate",
  "refresh token",
  "stale token",
  "token expired",
  "token has expired",
  "token is expired",
  "unauthorized",
] as const;

const MAX_SIGNAL_WORDS = 32;

export function buildRefreshConnectionUrl(
  options: Pick<
    NangoRefreshRequestOptions,
    "baseUrl" | "connectionId" | "providerConfigKey" | "includeRefreshToken"
  >,
): string {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const connectionId = options.connectionId.trim();
  const providerConfigKey = options.providerConfigKey?.trim();
  const url = new URL(`/connection/${encodeURIComponent(connectionId)}/refresh`, `${baseUrl}/`);

  if (providerConfigKey) {
    url.searchParams.set("provider_config_key", providerConfigKey);
  }

  if (options.includeRefreshToken === true) {
    url.searchParams.set("refresh_token", "true");
  }

  return url.toString();
}

export async function refreshConnection(
  options: NangoRefreshRequestOptions,
): Promise<NangoRefreshResponse> {
  const secretKey = options.secretKey.trim();
  const connectionId = options.connectionId.trim();
  const providerConfigKey = options.providerConfigKey?.trim() || undefined;
  const endpoint = buildRefreshConnectionUrl({
    ...options,
    connectionId,
    providerConfigKey,
  });
  const fetchImpl = options.fetch ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new NangoRefreshNetworkError(endpoint, new Error("No fetch implementation is available."));
  }

  let response: Response;
  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...options.headers,
      Authorization: `Bearer ${secretKey}`,
    },
  };

  if (options.signal !== undefined) {
    requestInit.signal = options.signal;
  }

  try {
    response = await fetchImpl(endpoint, requestInit);
  } catch (error) {
    throw new NangoRefreshNetworkError(endpoint, error);
  }

  const payload = await parseResponsePayload(response);

  if (!response.ok) {
    throw new NangoRefreshHttpError(endpoint, response.status, payload);
  }

  if (!isNangoRefreshResponse(payload)) {
    throw new NangoRefreshResponseError(endpoint, payload);
  }

  const normalizedErrors = normalizeRefreshErrors(payload);
  if (normalizedErrors.length > 0) {
    throw new NangoRefreshRejectedError(endpoint, {
      ...payload,
      errors: normalizedErrors,
    });
  }

  const rawPayload = payload as Record<string, unknown>;
  const success = typeof rawPayload.success === "boolean" ? rawPayload.success : undefined;
  const refreshed = typeof rawPayload.refreshed === "boolean" ? rawPayload.refreshed : undefined;
  const { error: _error, errors: _errors, ...successPayload } = payload;

  return {
    ...successPayload,
    connection_id: payload.connection_id ?? payload.connectionId ?? connectionId,
    connectionId: payload.connectionId ?? payload.connection_id ?? connectionId,
    provider_config_key:
      payload.provider_config_key ?? payload.providerConfigKey ?? providerConfigKey,
    providerConfigKey:
      payload.providerConfigKey ?? payload.provider_config_key ?? providerConfigKey,
    provider: payload.provider ?? providerConfigKey,
    refreshed: refreshed ?? success ?? true,
    success: success ?? refreshed ?? true,
  };
}

export function shouldAttemptTokenRefresh(
  input: RefreshRetryDecisionInput,
): RefreshRetryDecision {
  if (input.attemptedRefresh) {
    return { shouldRefresh: false, reason: "already-refreshed" };
  }

  if (headersContainRefreshHint(input.headers)) {
    return { shouldRefresh: true, reason: "header" };
  }

  if (containsRefreshHint(input.body)) {
    return { shouldRefresh: true, reason: "body" };
  }

  if (containsRefreshHint(input.error)) {
    return { shouldRefresh: true, reason: "error" };
  }

  if (typeof input.status === "number" && isRefreshableStatus(input.status)) {
    return { shouldRefresh: true, reason: "status" };
  }

  return { shouldRefresh: false };
}

export function isRefreshableStatus(status: number): boolean {
  return status === 401;
}

export function containsRefreshHint(value: unknown): boolean {
  return collectSignalWords(value).some((word) => {
    const normalized = word.toLowerCase();
    return TOKEN_REFRESH_HINTS.some((hint) => normalized.includes(hint));
  });
}

export function isNangoRefreshResponse(value: unknown): value is NangoRefreshResponse {
  if (!isRecord(value)) {
    return false;
  }

  if ("errors" in value && value.errors !== undefined && !Array.isArray(value.errors)) {
    return false;
  }

  if ("error" in value && value.error !== undefined && typeof value.error !== "string" && !isRecord(value.error)) {
    return false;
  }

  return (
    typeof value.connection_id === "string" ||
    typeof value.connectionId === "string" ||
    typeof value.provider === "string" ||
    typeof value.provider_config_key === "string" ||
    typeof value.providerConfigKey === "string" ||
    typeof value.expires_at === "string" ||
    value.expires_at === null ||
    typeof value.expiresAt === "string" ||
    value.expiresAt === null ||
    typeof value.refreshed === "boolean" ||
    typeof value.success === "boolean" ||
    Array.isArray(value.errors) ||
    value.error !== undefined
  );
}

async function parseResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function headersContainRefreshHint(headers: RefreshRetryDecisionInput["headers"]): boolean {
  if (headers === undefined) {
    return false;
  }

  if (headers instanceof Headers) {
    for (const [name, value] of headers.entries()) {
      if (isRefreshHintHeader(name, value)) {
        return true;
      }
    }

    return false;
  }

  for (const [name, value] of Object.entries(headers)) {
    if (isRefreshHintHeader(name, joinHeaderValue(value))) {
      return true;
    }
  }

  return false;
}

function isRefreshHintHeader(name: string, value: string): boolean {
  if (value.length === 0) {
    return false;
  }

  const normalizedName = name.toLowerCase();
  if (normalizedName === "www-authenticate" || normalizedName === "x-nango-error") {
    return containsRefreshHint(value);
  }

  return false;
}

function joinHeaderValue(value: HeaderValue): string {
  if (typeof value === "string") {
    return value;
  }

  return value.join(", ");
}

function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl ?? DEFAULT_NANGO_BASE_URL).replace(/\/+$/, "");
}

function normalizeRefreshErrors(payload: NangoRefreshResponse): NangoConnectionError[] {
  const errors: NangoConnectionError[] = [];

  if (Array.isArray(payload.errors)) {
    for (const error of payload.errors) {
      const normalized = normalizeRefreshErrorEntry(error);
      if (normalized !== undefined) {
        errors.push(normalized);
      }
    }
  }

  const normalizedError = normalizeRefreshErrorEntry(payload.error);
  if (normalizedError !== undefined) {
    errors.push(normalizedError);
  }

  return errors;
}

function normalizeRefreshErrorEntry(value: unknown): NangoConnectionError | undefined {
  if (typeof value === "string") {
    return { message: value };
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const message = firstString(value.message, value.error, value.detail);
  const code = firstString(value.code, value.type);

  if (message === undefined && code === undefined) {
    return undefined;
  }

  return {
    ...(code === undefined ? {} : { code }),
    ...(message === undefined ? {} : { message }),
  };
}

function collectSignalWords(value: unknown, depth = 0, seen = new Set<unknown>()): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === "string") {
    return [value];
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return [String(value)];
  }

  if (value instanceof Error) {
    return [value.message];
  }

  if (depth >= 2 || seen.has(value)) {
    return [];
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectSignalWords(entry, depth + 1, seen)).slice(0, MAX_SIGNAL_WORDS);
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.values(value)
    .flatMap((entry) => collectSignalWords(entry, depth + 1, seen))
    .slice(0, MAX_SIGNAL_WORDS);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}
