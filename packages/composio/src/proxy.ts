import type {
  ComposioActionLookupResult,
  ComposioProviderConfig,
  ComposioRequestHeaders,
  ComposioToolset,
  JsonObject,
  ProxyRequest,
  ProxyResponse,
  ResolvedComposioProviderConfig,
} from "./types";

export const DEFAULT_COMPOSIO_BASE_URL = "https://backend.composio.dev/api/v3";

const RESERVED_HEADER_NAMES = new Set([
  "x-composio-tool-slug",
  "x-composio-toolkit-slug",
  "x-composio-toolkit-version",
  "x-composio-user-id",
]);

/**
 * Last-resort hostname → toolkit overrides for cases where both the
 * connected account API and the hostname heuristic fail.
 * This should rarely be needed — the connected account's toolkit.slug
 * is authoritative. These exist only as a safety net.
 */
const TOOLKIT_HOSTNAME_OVERRIDES: Readonly<Record<string, string>> = {
  "www.googleapis.com": "gmail",
  "gmail.googleapis.com": "gmail",
  "api.atlassian.com": "jira",
};

const COMMON_SUBDOMAINS = new Set(["api", "app", "graph", "graphql", "rest", "services", "www"]);
const HEALTHY_ACCOUNT_STATUSES = new Set(["ACTIVE", "AUTHORIZED", "CONNECTED", "ENABLED", "READY", "SUCCESS"]);

interface ComposioParameter {
  in: "header" | "query";
  name: string;
  value: string;
}

interface ComposioProxyEnvelope {
  data?: unknown;
  binary_data?: unknown;
  status?: number;
  headers?: Record<string, string>;
}

interface ComposioErrorEnvelope {
  error?: {
    message?: string;
    code?: number;
    slug?: string;
    status?: number;
    request_id?: string;
    suggested_fix?: string;
    errors?: string[];
  };
}

interface ComposioToolCandidate {
  slug?: string;
  tool_slug?: string;
  name?: string;
  description?: string;
}

interface ComposioToolSearchResponse {
  items?: ComposioToolCandidate[];
  results?: ComposioToolCandidate[];
  tools?: ComposioToolCandidate[];
  data?: ComposioToolCandidate[];
}

interface ComposioConnectedAccount {
  status?: string;
  is_disabled?: boolean;
  status_reason?: string;
  toolkit?: {
    slug?: string;
  };
  auth_config?: {
    is_disabled?: boolean;
  };
  state?: {
    val?: {
      status?: string;
    };
  };
}

export async function proxyThroughComposio(
  config: ResolvedComposioProviderConfig,
  request: ProxyRequest,
): Promise<ProxyResponse> {
  validateProxyRequest(request);

  const action = await lookupActionForRequest(config, request);
  const body = buildProxyExecutionBody(request, action);
  const response = await executeComposioRequest(
    config,
    "/tools/execute/proxy",
    buildRequestInit({
      method: "POST",
      headers: buildComposioApiHeaders(config.apiKey),
      body: JSON.stringify(body),
      signal: createTimeoutSignal(config.timeoutMs),
    }),
  );

  return normalizeProxyResponse(response, action);
}

export async function checkComposioConnectionHealth(
  config: ResolvedComposioProviderConfig,
  connectionId: string,
): Promise<boolean> {
  const normalizedConnectionId = connectionId.trim();
  if (normalizedConnectionId.length === 0) {
    return false;
  }

  const response = await executeComposioRequest(
    config,
    `/connected_accounts/${encodeURIComponent(normalizedConnectionId)}`,
    buildRequestInit({
      method: "GET",
      headers: buildComposioApiHeaders(config.apiKey, { accept: "application/json" }),
      body: undefined,
      signal: createTimeoutSignal(config.timeoutMs),
    }),
  );

  if (!response.ok) {
    return false;
  }

  const payload = (await readResponsePayload(response)) as ComposioConnectedAccount | null;
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const status = extractConnectedAccountStatus(payload);
  const disabled = payload.is_disabled === true || payload.auth_config?.is_disabled === true;

  return !disabled && status !== undefined && HEALTHY_ACCOUNT_STATUSES.has(status);
}

/**
 * Resolve toolkit slug from the connected account via Composio API.
 * This is authoritative — Composio knows which toolkit a connection belongs to.
 * Falls back to hostname heuristic only if the API call fails.
 */
async function resolveToolkitFromConnection(
  config: ResolvedComposioProviderConfig,
  connectionId: string,
): Promise<string | undefined> {
  try {
    const response = await executeComposioRequest(
      config,
      `/connected_accounts/${encodeURIComponent(connectionId.trim())}`,
      buildRequestInit({
        method: "GET",
        headers: buildComposioApiHeaders(config.apiKey, { accept: "application/json" }),
        body: undefined,
        signal: createTimeoutSignal(config.timeoutMs),
      }),
    );
    if (!response.ok) return undefined;
    const payload = (await readResponsePayload(response)) as ComposioConnectedAccount | null;
    return payload?.toolkit?.slug ?? undefined;
  } catch {
    return undefined;
  }
}

export async function lookupActionForRequest(
  config: ResolvedComposioProviderConfig,
  request: ProxyRequest,
): Promise<ComposioActionLookupResult> {
  const controlHeaders = extractControlHeaders(request.headers);

  // Resolve toolkit: explicit header > connected account API > hostname heuristic
  const resolveToolkit = async (): Promise<string | undefined> => {
    if (controlHeaders.toolkitSlug) return controlHeaders.toolkitSlug;
    const fromConnection = await resolveToolkitFromConnection(config, request.connectionId);
    if (fromConnection) return fromConnection;
    return request.baseUrl ? resolveToolkitSlug(request.baseUrl, config.defaultToolset) : config.defaultToolset?.slug;
  };

  if (controlHeaders.toolSlug) {
    return buildLookupResult({
      toolSlug: controlHeaders.toolSlug,
      toolkitSlug: await resolveToolkit(),
      toolkitVersion: controlHeaders.toolkitVersion ?? config.defaultToolset?.version,
      matchedBy: "explicit-header",
    });
  }

  const toolkitSlug = await resolveToolkit();
  const toolkitVersion = controlHeaders.toolkitVersion ?? config.defaultToolset?.version;

  if (!toolkitSlug) {
    return buildLookupResult({
      toolSlug: undefined,
      toolkitSlug: undefined,
      toolkitVersion: undefined,
      matchedBy: "unresolved",
    });
  }

  const searched = await searchForMatchingAction(config, request, toolkitSlug, toolkitVersion);
  if (searched.toolSlug) {
    return searched;
  }

  return buildLookupResult({
    toolSlug: undefined,
    toolkitSlug,
    toolkitVersion,
    matchedBy: config.defaultToolset?.slug === toolkitSlug ? "default-toolset" : "derived-base-url",
  });
}

export function buildComposioApiHeaders(
  apiKey: string,
  headers: ComposioRequestHeaders = {},
): ComposioRequestHeaders {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "x-api-key": apiKey,
    ...headers,
  };
}

export function resolveComposioProviderConfig(config: ComposioProviderConfig): ResolvedComposioProviderConfig {
  const apiKey = config.apiKey?.trim() || config.auth?.apiKey?.trim();
  if (!apiKey) {
    throw new Error("ComposioProvider requires a non-empty apiKey or auth.apiKey.");
  }

  const defaultToolset = normalizeToolset(config.defaultToolset);
  const resolved: ResolvedComposioProviderConfig = {
    apiKey,
    baseUrl: normalizeBaseUrl(config.baseUrl),
  };

  const timeoutMs = normalizeTimeout(config.timeoutMs);
  if (defaultToolset) {
    resolved.defaultToolset = defaultToolset;
  }
  if (timeoutMs !== undefined) {
    resolved.timeoutMs = timeoutMs;
  }
  if (config.metadata !== undefined) {
    resolved.metadata = config.metadata;
  }
  if (config.fetch !== undefined) {
    resolved.fetch = config.fetch;
  }

  return resolved;
}

export function normalizeBaseUrl(baseUrl?: string): string {
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    return DEFAULT_COMPOSIO_BASE_URL;
  }

  return trimmed.replace(/\/+$/, "");
}

export function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  if (trimmed.length === 0) {
    return "/";
  }

  return trimmed.startsWith("/") || isAbsoluteUrl(trimmed) ? trimmed : `/${trimmed}`;
}

export function resolveToolkitSlug(baseUrl: string, defaultToolset?: ComposioToolset): string | undefined {
  const configured = defaultToolset?.slug.trim().toLowerCase();
  if (configured) {
    return configured;
  }

  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return undefined;
  }

  const override = TOOLKIT_HOSTNAME_OVERRIDES[hostname];
  if (override) {
    return override;
  }

  if (hostname.endsWith(".atlassian.net")) {
    return "jira";
  }

  if (hostname.endsWith(".slack.com")) {
    return "slack";
  }

  const labels = hostname.split(".").filter(Boolean);
  while (labels.length > 2 && COMMON_SUBDOMAINS.has(labels[0] ?? "")) {
    labels.shift();
  }

  return labels[0];
}

export function normalizeProxyResponse(
  response: Response,
  action?: ComposioActionLookupResult,
): Promise<ProxyResponse> {
  return parseComposioProxyResponse(response, action);
}

async function parseComposioProxyResponse(
  response: Response,
  action?: ComposioActionLookupResult,
): Promise<ProxyResponse> {
  const responseHeaders = Object.fromEntries(response.headers.entries());
  const payload = await readResponsePayload(response);

  if (isProxyEnvelope(payload)) {
    return {
      status: typeof payload.status === "number" ? payload.status : response.status,
      headers: mergeResponseHeaders(payload.headers, responseHeaders, action),
      data: normalizeEnvelopeData(payload),
    };
  }

  if (isErrorEnvelope(payload)) {
    const errorStatus = payload.error?.status;
    return {
      status: typeof errorStatus === "number" ? errorStatus : response.status,
      headers: mergeResponseHeaders(undefined, responseHeaders, action),
      data: payload.error ?? payload,
    };
  }

  return {
    status: response.status,
    headers: mergeResponseHeaders(undefined, responseHeaders, action),
    data: payload,
  };
}

async function searchForMatchingAction(
  config: ResolvedComposioProviderConfig,
  request: ProxyRequest,
  toolkitSlug: string,
  toolkitVersion?: string,
): Promise<ComposioActionLookupResult> {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return buildLookupResult({
      toolSlug: undefined,
      toolkitSlug,
      toolkitVersion,
      matchedBy: "unresolved",
    });
  }

  const url = new URL("/tools", `${config.baseUrl}/`);
  url.searchParams.set("toolkit_slug", toolkitSlug);
  url.searchParams.set("limit", "100");

  if (toolkitVersion) {
    url.searchParams.set("toolkit_version", toolkitVersion);
  }

  const searchTerm = buildActionSearchTerm(request);
  if (searchTerm) {
    url.searchParams.set("search", searchTerm);
  }

  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: buildComposioApiHeaders(config.apiKey, { accept: "application/json" }),
      ...withSignal(createTimeoutSignal(config.timeoutMs)),
    });
  } catch {
    return buildLookupResult({
      toolSlug: undefined,
      toolkitSlug,
      toolkitVersion,
      matchedBy: "unresolved",
    });
  }

  if (!response.ok) {
    return buildLookupResult({
      toolSlug: undefined,
      toolkitSlug,
      toolkitVersion,
      matchedBy: "unresolved",
    });
  }

  const payload = (await readResponsePayload(response)) as ComposioToolSearchResponse | null;
  const candidates = extractToolCandidates(payload);
  const match = chooseBestActionMatch(request, candidates);

  if (!match) {
    return buildLookupResult({
      toolSlug: undefined,
      toolkitSlug,
      toolkitVersion,
      matchedBy: "unresolved",
    });
  }

  return buildLookupResult({
    toolSlug: match,
    toolkitSlug,
    toolkitVersion,
    matchedBy: "search",
  });
}

function buildProxyExecutionBody(
  request: ProxyRequest,
  action: ComposioActionLookupResult,
): Record<string, unknown> {
  const parameters = buildProxyParameters(request.headers, request.query);
  const endpoint = normalizeEndpoint(request.endpoint);
  const body: Record<string, unknown> = {
    connected_account_id: request.connectionId.trim(),
    endpoint: isAbsoluteUrl(endpoint) ? endpoint : (request.baseUrl ? buildAbsoluteEndpoint(request.baseUrl, endpoint) : endpoint),
    method: request.method,
  };

  if (parameters.length > 0) {
    body.parameters = parameters;
  }

  if (request.body !== undefined) {
    body.body = request.body;
  }

  const userId = extractControlHeaders(request.headers).userId;
  if (userId) {
    body.user_id = userId;
  }

  if (action.toolSlug) {
    body.tool_slug = action.toolSlug;
  }

  if (action.toolkitSlug) {
    body.toolkit_slug = action.toolkitSlug;
  }

  if (action.toolkitVersion) {
    body.toolkit_version = action.toolkitVersion;
  }

  return body;
}

function buildProxyParameters(
  headers?: ComposioRequestHeaders,
  query?: Record<string, string>,
): ComposioParameter[] {
  const parameters: ComposioParameter[] = [];

  for (const [name, value] of Object.entries(headers ?? {})) {
    if (RESERVED_HEADER_NAMES.has(name.toLowerCase())) {
      continue;
    }
    parameters.push({ in: "header", name, value });
  }

  for (const [name, value] of Object.entries(query ?? {})) {
    parameters.push({ in: "query", name, value });
  }

  return parameters;
}

function extractControlHeaders(headers?: ComposioRequestHeaders): {
  toolSlug?: string;
  toolkitSlug?: string;
  toolkitVersion?: string;
  userId?: string;
} {
  const values = new Map<string, string>();

  for (const [name, value] of Object.entries(headers ?? {})) {
    values.set(name.toLowerCase(), value);
  }

  const result: {
    toolSlug?: string;
    toolkitSlug?: string;
    toolkitVersion?: string;
    userId?: string;
  } = {};

  const toolSlug = values.get("x-composio-tool-slug")?.trim();
  const toolkitSlug = values.get("x-composio-toolkit-slug")?.trim().toLowerCase();
  const toolkitVersion = values.get("x-composio-toolkit-version")?.trim();
  const userId = values.get("x-composio-user-id")?.trim();

  if (toolSlug) {
    result.toolSlug = toolSlug;
  }
  if (toolkitSlug) {
    result.toolkitSlug = toolkitSlug;
  }
  if (toolkitVersion) {
    result.toolkitVersion = toolkitVersion;
  }
  if (userId) {
    result.userId = userId;
  }

  return result;
}

function chooseBestActionMatch(
  request: ProxyRequest,
  candidates: ComposioToolCandidate[],
): string | undefined {
  const endpointTokens = tokenizeRequestEndpoint(request.endpoint);
  const methodToken = request.method.toLowerCase();
  let bestSlug: string | undefined;
  let bestScore = 0;

  for (const candidate of candidates) {
    const slug = candidate.slug ?? candidate.tool_slug;
    if (!slug) {
      continue;
    }

    const haystack = `${slug} ${candidate.name ?? ""} ${candidate.description ?? ""}`.toLowerCase();
    let score = 0;

    if (haystack.includes(methodToken)) {
      score += 2;
    }

    for (const token of endpointTokens) {
      if (haystack.includes(token)) {
        score += token.length > 4 ? 2 : 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestSlug = slug;
    }
  }

  return bestScore > 1 ? bestSlug : undefined;
}

function extractToolCandidates(payload: ComposioToolSearchResponse | null): ComposioToolCandidate[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  return payload.items ?? payload.results ?? payload.tools ?? payload.data ?? [];
}

function buildActionSearchTerm(request: ProxyRequest): string | undefined {
  const tokens = tokenizeRequestEndpoint(request.endpoint);
  if (tokens.length === 0) {
    return undefined;
  }

  return tokens.slice(0, 4).join(" ");
}

function tokenizeRequestEndpoint(endpoint: string): string[] {
  const normalized = normalizeEndpoint(endpoint);
  const [pathOnly] = normalized.split("?", 1);
  const cleanPath = (pathOnly ?? normalized).replace(/^https?:\/\/[^/]+/i, "");

  return cleanPath
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .filter((segment) => segment.length > 1)
    .filter((segment) => !segment.startsWith(":"))
    .filter((segment) => !/^[0-9a-f-]+$/i.test(segment));
}

function normalizeEnvelopeData(payload: ComposioProxyEnvelope): unknown {
  if (payload.binary_data !== undefined && payload.data !== undefined) {
    return {
      data: payload.data,
      binaryData: payload.binary_data,
    };
  }

  if (payload.binary_data !== undefined) {
    return payload.binary_data;
  }

  return payload.data ?? null;
}

function mergeResponseHeaders(
  upstreamHeaders: Record<string, string> | undefined,
  responseHeaders: Record<string, string>,
  action?: ComposioActionLookupResult,
): Record<string, string> {
  const merged = {
    ...responseHeaders,
    ...(upstreamHeaders ?? {}),
  };

  if (action?.toolSlug) {
    merged["x-composio-tool-slug"] = action.toolSlug;
  }

  if (action?.toolkitSlug) {
    merged["x-composio-toolkit-slug"] = action.toolkitSlug;
  }

  if (action?.toolkitVersion) {
    merged["x-composio-toolkit-version"] = action.toolkitVersion;
  }

  return merged;
}

function extractConnectedAccountStatus(payload: ComposioConnectedAccount): string | undefined {
  const status = payload.status ?? payload.state?.val?.status;
  return status?.trim().toUpperCase() || undefined;
}

function normalizeToolset(toolset?: ComposioToolset): ComposioToolset | undefined {
  const slug = toolset?.slug?.trim().toLowerCase();
  if (!slug) {
    return undefined;
  }

  const version = toolset?.version?.trim() || undefined;
  return version ? { slug, version } : { slug };
}

function normalizeTimeout(timeoutMs?: number): number | undefined {
  if (timeoutMs === undefined) {
    return undefined;
  }

  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : undefined;
}

function buildAbsoluteEndpoint(baseUrl: string, endpoint: string): string {
  return new URL(endpoint, `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

async function executeComposioRequest(
  config: ResolvedComposioProviderConfig,
  pathname: string,
  init: RequestInit,
): Promise<Response> {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("No fetch implementation is available for Composio requests.");
  }

  const url = new URL(pathname.replace(/^\//, ""), `${config.baseUrl}/`).toString();
  return fetchImpl(url, init);
}

async function readResponsePayload(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) {
    return null;
  }

  const raw = await response.text();
  if (raw.length === 0) {
    return null;
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

function createTimeoutSignal(timeoutMs?: number): AbortSignal | undefined {
  if (!timeoutMs) {
    return undefined;
  }

  return AbortSignal.timeout(timeoutMs);
}

function buildLookupResult(input: {
  toolSlug: string | undefined;
  toolkitSlug: string | undefined;
  toolkitVersion: string | undefined;
  matchedBy: ComposioActionLookupResult["matchedBy"];
}): ComposioActionLookupResult {
  const result: ComposioActionLookupResult = {
    matchedBy: input.matchedBy,
  };

  if (input.toolSlug !== undefined) {
    result.toolSlug = input.toolSlug;
  }
  if (input.toolkitSlug !== undefined) {
    result.toolkitSlug = input.toolkitSlug;
  }
  if (input.toolkitVersion !== undefined) {
    result.toolkitVersion = input.toolkitVersion;
  }

  return result;
}

function buildRequestInit(init: {
  method: string;
  headers: ComposioRequestHeaders;
  body: string | undefined;
  signal: AbortSignal | undefined;
}): RequestInit {
  return {
    method: init.method,
    headers: init.headers,
    ...(init.body !== undefined ? { body: init.body } : {}),
    ...withSignal(init.signal),
  };
}

function withSignal(signal: AbortSignal | undefined): { signal?: AbortSignal | null } {
  return signal ? { signal } : {};
}

function validateProxyRequest(request: ProxyRequest): void {
  if (request.connectionId.trim().length === 0) {
    throw new Error("Composio proxy requests require a non-empty connectionId.");
  }
  // baseUrl is optional — resolved from connected account or defaultToolset when omitted.
}

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isProxyEnvelope(value: unknown): value is ComposioProxyEnvelope {
  return typeof value === "object" && value !== null && ("status" in value || "headers" in value || "data" in value);
}

function isErrorEnvelope(value: unknown): value is ComposioErrorEnvelope {
  return typeof value === "object" && value !== null && "error" in value;
}
