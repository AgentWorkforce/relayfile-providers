import { NangoProxyConfigError, NangoProxyTransportError } from "./errors.js";
import { DEFAULT_NANGO_BASE_URL } from "./token-refresh.js";
import { refreshConnection, shouldAttemptTokenRefresh } from "./token-refresh.js";
import type {
  JsonValue,
  NangoProviderConfig,
  NangoProxyPayload,
  NangoProxyRequestDescriptor,
  ProxyRequest,
  ProxyResponseData,
  ProxyResponse,
} from "./types.js";

/**
 * Last-resort hostname overrides where the heuristic (strip common
 * subdomains, take first label) can't derive the correct provider key.
 * Most services (github, slack, linear, stripe) resolve correctly
 * without entries here. Callers should pass providerConfigKey explicitly.
 */
const PROVIDER_HOSTNAME_OVERRIDES: Readonly<Record<string, string>> = {};

const COMMON_SUBDOMAINS = new Set(["api", "app", "graph", "graphql", "rest", "services", "www"]);

export function buildNangoProxyPayload(request: ProxyRequest): NangoProxyPayload {
  const payload: NangoProxyPayload = {
    method: request.method,
    endpoint: normalizeEndpoint(request.endpoint),
  };

  // Only override baseUrl when the caller explicitly provides one.
  // When omitted, Nango resolves the target from the provider config.
  if (request.baseUrl !== undefined && request.baseUrl.trim().length > 0) {
    payload.baseUrlOverride = normalizeBaseUrl(request.baseUrl);
  }

  if (request.headers !== undefined && Object.keys(request.headers).length > 0) {
    payload.headers = { ...request.headers };
  }

  if (request.body !== undefined) {
    payload.data = request.body as JsonValue | string;
  }

  if (request.query !== undefined && Object.keys(request.query).length > 0) {
    payload.params = { ...request.query };
  }

  return payload;
}

export function buildNangoProxyRequest(
  config: NangoProviderConfig,
  request: ProxyRequest,
): NangoProxyRequestDescriptor {
  const providerConfigKey = resolveProviderConfigKey(config, request);
  const payload = buildNangoProxyPayload(request);

  return {
    providerConfigKey,
    payload,
    url: new URL("/proxy", `${normalizeBaseUrl(config.baseUrl)}/`).toString(),
    init: {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${config.secretKey}`,
        "connection-id": request.connectionId,
        "content-type": "application/json",
        "provider-config-key": providerConfigKey,
      },
      body: JSON.stringify(payload),
    },
  };
}

export async function parseNangoProxyResponse<TData = ProxyResponseData>(
  response: Response,
): Promise<ProxyResponse<TData>> {
  const headers = Object.fromEntries(response.headers.entries());

  if (response.status === 204 || response.status === 205) {
    return {
      status: response.status,
      headers,
      data: null as TData,
    };
  }

  const rawBody = await response.text();
  if (rawBody.length === 0) {
    return {
      status: response.status,
      headers,
      data: null as TData,
    };
  }

  const contentType = headers["content-type"]?.toLowerCase();
  if (contentType?.includes("json")) {
    try {
      return {
        status: response.status,
        headers,
        data: JSON.parse(rawBody) as TData,
      };
    } catch {
      return {
        status: response.status,
        headers,
        data: rawBody as TData,
      };
    }
  }

  return {
    status: response.status,
    headers,
    data: rawBody as TData,
  };
}

export async function proxyThroughNango<TData = ProxyResponseData>(
  config: NangoProviderConfig,
  request: ProxyRequest,
): Promise<ProxyResponse<TData>> {
  const descriptor = buildNangoProxyRequest(config, request);
  const fetchImpl = config.fetch ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new NangoProxyTransportError(
      descriptor.url,
      new Error("No fetch implementation is available for Nango proxy requests."),
    );
  }

  const response = await executeProxyRequest<TData>(fetchImpl, descriptor);
  if (response.status < 400) {
    return response;
  }

  const refreshDecision = shouldAttemptTokenRefresh({
    attemptedRefresh: false,
    status: response.status,
    headers: response.headers,
    body: response.data,
  });
  if (!refreshDecision.shouldRefresh) {
    return response;
  }

  await refreshConnection({
    baseUrl: config.baseUrl,
    connectionId: request.connectionId,
    providerConfigKey: descriptor.providerConfigKey,
    secretKey: config.secretKey,
    fetch: fetchImpl,
  });

  return executeProxyRequest<TData>(fetchImpl, descriptor);
}

export function resolveProviderConfigKey(
  config: Pick<NangoProviderConfig, "integrationId" | "providerConfigKey">,
  request: Pick<ProxyRequest, "baseUrl" | "providerConfigKey">,
): string {
  const configured = request.providerConfigKey ?? config.providerConfigKey ?? config.integrationId;
  if (configured !== undefined && configured.trim().length > 0) {
    return configured.trim();
  }

  if (request.baseUrl !== undefined && request.baseUrl.trim().length > 0) {
    const derived = deriveProviderConfigKey(request.baseUrl);
    if (derived !== undefined) {
      return derived;
    }
  }

  throw new NangoProxyConfigError(
    `NangoProvider requires a providerConfigKey, integrationId, or a recognizable base URL. ` +
    `Either set providerConfigKey in the provider config or pass baseUrl in the proxy request.`,
  );
}

export function deriveProviderConfigKey(baseUrl: string): string | undefined {
  let hostname: string;

  try {
    hostname = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return undefined;
  }

  const override = PROVIDER_HOSTNAME_OVERRIDES[hostname];
  if (override !== undefined) {
    return override;
  }

  if (hostname.endsWith(".atlassian.net")) {
    return "jira";
  }

  if (hostname.endsWith(".myshopify.com") || hostname === "shopify.com") {
    return "shopify";
  }

  const labels = hostname.split(".").filter(Boolean);
  while (labels.length > 2 && COMMON_SUBDOMAINS.has(labels[0] ?? "")) {
    labels.shift();
  }

  return labels[0];
}

function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl ?? DEFAULT_NANGO_BASE_URL).replace(/\/+$/, "");
}

function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  if (trimmed.length === 0) {
    return "/";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

async function executeProxyRequest<TData>(
  fetchImpl: typeof fetch,
  descriptor: NangoProxyRequestDescriptor,
): Promise<ProxyResponse<TData>> {
  let response: Response;

  try {
    response = await fetchImpl(descriptor.url, descriptor.init);
  } catch (cause) {
    throw new NangoProxyTransportError(descriptor.url, cause);
  }

  return parseNangoProxyResponse<TData>(response);
}
