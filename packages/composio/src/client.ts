import { buildComposioApiHeaders } from "./proxy";
import { ComposioApiError } from "./types";
import type {
  ComposioApiQuery,
  ComposioApiQueryPrimitive,
  ComposioApiRequester,
  ComposioApiRequestOptions,
  JsonObject,
  ResolvedComposioProviderConfig,
} from "./types";

type SerializableBody = Exclude<RequestInit["body"], undefined>;

interface ComposioErrorEnvelope {
  error?: {
    message?: string;
    code?: number | string;
    slug?: string;
    status?: number;
    request_id?: string;
    suggested_fix?: string;
    errors?: string[];
  };
}

export function createComposioApiRequester(
  config: Readonly<ResolvedComposioProviderConfig>,
): ComposioApiRequester {
  return async function request<T = unknown>(options: ComposioApiRequestOptions): Promise<T> {
    const fetchImpl = config.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new Error("No fetch implementation is available for Composio requests.");
    }

    const response = await fetchImpl(buildComposioUrl(config.baseUrl, options.path, options.query), {
      method: options.method ?? "GET",
      headers: buildComposioApiHeaders(config.apiKey, options.headers),
      ...buildBody(options.body),
      ...withSignal(createTimeoutSignal(config.timeoutMs)),
    });

    const payload = await readResponsePayload(response);
    if (!response.ok) {
      throw createApiError(response.status, payload);
    }

    return payload as T;
  };
}

function buildComposioUrl(baseUrl: string, path: string, query?: ComposioApiQuery): string {
  const url = new URL(path.replace(/^\//, ""), `${baseUrl.replace(/\/+$/, "")}/`);

  for (const [key, value] of Object.entries(query ?? {})) {
    appendQueryValue(url, key, value);
  }

  return url.toString();
}

function appendQueryValue(url: URL, key: string, value: ComposioApiQuery[keyof ComposioApiQuery]): void {
  if (value === undefined || value === null) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      url.searchParams.append(key, serializeQueryValue(item));
    }
    return;
  }

  url.searchParams.set(key, serializeQueryValue(value as ComposioApiQueryPrimitive));
}

function serializeQueryValue(value: ComposioApiQueryPrimitive): string {
  return typeof value === "boolean" ? String(value) : `${value}`;
}

function buildBody(body: unknown): { body?: SerializableBody } {
  if (body === undefined) {
    return {};
  }

  if (
    body === null ||
    typeof body === "string" ||
    body instanceof ArrayBuffer ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof ReadableStream
  ) {
    return { body };
  }

  return {
    body: JSON.stringify(body),
  };
}

async function readResponsePayload(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) {
    return undefined;
  }

  const raw = await response.text();
  if (raw.length === 0) {
    return undefined;
  }

  const contentType = response.headers.get("content-type")?.toLowerCase();
  if (contentType?.includes("json")) {
    try {
      return JSON.parse(raw) as JsonObject;
    } catch {
      return raw;
    }
  }

  return raw;
}

function createApiError(status: number, payload: unknown): ComposioApiError {
  const envelope = isComposioErrorEnvelope(payload) ? payload.error : undefined;
  const fallbackMessage =
    typeof payload === "string"
      ? payload
      : status === 404
        ? "Composio resource not found."
        : `Composio request failed with status ${status}.`;

  return new ComposioApiError(
    envelope?.message ?? envelope?.errors?.join("; ") ?? fallbackMessage,
    {
      status: envelope?.status ?? status,
      ...(envelope?.code !== undefined ? { code: envelope.code } : {}),
      ...(envelope?.slug ? { slug: envelope.slug } : {}),
      ...(envelope?.request_id ? { requestId: envelope.request_id } : {}),
      ...(envelope?.suggested_fix ? { suggestedFix: envelope.suggested_fix } : {}),
      ...(payload !== undefined ? { details: payload } : {}),
    },
  );
}

function isComposioErrorEnvelope(value: unknown): value is ComposioErrorEnvelope {
  return typeof value === "object" && value !== null && "error" in value;
}

function createTimeoutSignal(timeoutMs?: number): AbortSignal | undefined {
  if (!timeoutMs) {
    return undefined;
  }

  return AbortSignal.timeout(timeoutMs);
}

function withSignal(signal: AbortSignal | undefined): { signal?: AbortSignal } {
  return signal ? { signal } : {};
}
