import {
  computeCanonicalPath,
  IntegrationProvider,
  type QueuedResponse,
  type RelayFileClient,
} from "@relayfile/sdk";

import {
  buildCredentialProxyHeaders,
  createCredential,
  deleteCredential,
  extractCredentialAccessToken,
  getCredential,
  getCredentialSchema,
  listCredentials,
  updateCredential,
} from "./credentials.js";
import {
  N8nApiError,
  N8nConfigurationError,
  N8nProviderError,
} from "./errors.js";
import { asStringRecord } from "./internal.js";
import {
  deleteExecution,
  getExecution,
  listExecutions,
} from "./executions.js";
import type {
  CreateCredentialInput,
  ExecuteWorkflowOptions,
  ListCredentialsOptions,
  ListExecutionsOptions,
  ListWorkflowsOptions,
  N8nApiRequestOptions,
  N8nConfig,
  ConnectionProvider,
  N8nCredential,
  N8nCredentialSchema,
  N8nCredentialTokenValue,
  N8nExecution,
  N8nNodeType,
  N8nPaginatedResult,
  ProxyRequest,
  ProxyResponse,
  N8nRequestExecutor,
  N8nWorkflow,
  NormalizedWebhook,
  UpdateCredentialInput,
} from "./types.js";
import { normalizeN8nWebhook } from "./webhook.js";
import {
  activateWorkflow,
  deactivateWorkflow,
  executeWorkflow,
  getWorkflow,
  listNodeTypes,
  listWorkflows,
} from "./workflows.js";

const DEFAULT_API_BASE_PATH = "/api/v1";

export class N8nProvider
  extends IntegrationProvider
  implements ConnectionProvider, N8nRequestExecutor
{
  override readonly name = "n8n";
  readonly config: Readonly<Required<Pick<N8nConfig, "baseUrl" | "apiBasePath">> & Omit<N8nConfig, "baseUrl" | "apiBasePath">>;

  constructor(client: RelayFileClient, config: N8nConfig) {
    super(client);
    this.config = resolveConfig(config);
  }

  get baseUrl(): string {
    return this.config.baseUrl;
  }

  async request<T>(options: N8nApiRequestOptions): Promise<T> {
    return requestN8n<T>(this.config, options);
  }

  async requestWithFallback<T>(
    candidates: readonly N8nApiRequestOptions[],
  ): Promise<T> {
    return requestWithFallback<T>(this.config, candidates);
  }

  async getAccessToken(
    credentialId: string,
    type?: string,
  ): Promise<N8nCredentialTokenValue> {
    const credential = await this.getCredential(credentialId);
    return extractCredentialAccessToken(credential, type);
  }

  async proxy(request: ProxyRequest): Promise<ProxyResponse> {
    const credential = await this.getCredential(request.connectionId);
    const tokenValue = extractCredentialAccessToken(credential);
    const authHeaders = buildCredentialProxyHeaders(credential, tokenValue);
    const url = buildProxyUrl(request.baseUrl, request.endpoint, request.query);
    const headers = buildRequestHeaders(request.headers, request.body, authHeaders);

    let response: Response;
    try {
      response = await (this.config.fetch ?? fetch)(url, {
        method: request.method,
        headers,
        body: serializeBody(request.body, headers),
      });
    } catch (error) {
      throw new N8nProviderError(`Proxy request failed for ${url}.`, {
        cause: error,
      });
    }

    const data = await readResponseBody(response, "auto");
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      status: response.status,
      headers: responseHeaders,
      data,
    };
  }

  async healthCheck(): Promise<boolean>;
  async healthCheck(connectionId: string): Promise<boolean>;
  async healthCheck(connectionId?: string): Promise<boolean> {
    try {
      await this.request<unknown>({
        method: "GET",
        path: "/workflows",
        query: { limit: 1 },
      });

      if (connectionId) {
        await this.getCredential(connectionId);
      }

      return true;
    } catch {
      return false;
    }
  }

  async handleWebhook(rawPayload: unknown): Promise<NormalizedWebhook> {
    return normalizeN8nWebhook(rawPayload);
  }

  override async ingestWebhook(
    workspaceId: string,
    rawInput: unknown,
    signal?: AbortSignal,
  ): Promise<QueuedResponse> {
    const normalized = await this.handleWebhook(rawInput);
    const path = computeCanonicalPath(
      normalized.provider,
      normalized.objectType,
      normalized.objectId,
    );

    return this.client.ingestWebhook({
      workspaceId,
      provider: this.name,
      event_type: normalized.eventType,
      path,
      data: {
        connectionId: normalized.connectionId,
        provider: normalized.provider,
        objectType: normalized.objectType,
        objectId: normalized.objectId,
        eventType: normalized.eventType,
        payload: normalized.payload,
        relations: normalized.relations,
        metadata: normalized.metadata,
      },
      ...(signal ? { signal } : {}),
    });
  }

  async listCredentials(
    options?: ListCredentialsOptions,
  ): Promise<N8nPaginatedResult<N8nCredential>> {
    return listCredentials(this, options);
  }

  async getCredential(credentialId: string): Promise<N8nCredential> {
    return getCredential(this, credentialId, true);
  }

  async createCredential(input: CreateCredentialInput): Promise<N8nCredential> {
    return createCredential(this, input);
  }

  async updateCredential(
    credentialId: string,
    input: UpdateCredentialInput,
  ): Promise<N8nCredential> {
    return updateCredential(this, credentialId, input);
  }

  async deleteCredential(credentialId: string): Promise<void> {
    await deleteCredential(this, credentialId);
  }

  async getCredentialSchema(type: string): Promise<N8nCredentialSchema> {
    return getCredentialSchema(this, type);
  }

  async listWorkflows(
    options?: ListWorkflowsOptions,
  ): Promise<N8nPaginatedResult<N8nWorkflow>> {
    return listWorkflows(this, options);
  }

  async getWorkflow(workflowId: string): Promise<N8nWorkflow> {
    return getWorkflow(this, workflowId);
  }

  async activateWorkflow(workflowId: string): Promise<N8nWorkflow> {
    return activateWorkflow(this, workflowId);
  }

  async deactivateWorkflow(workflowId: string): Promise<N8nWorkflow> {
    return deactivateWorkflow(this, workflowId);
  }

  async executeWorkflow(
    workflowId: string,
    data?: Record<string, unknown>,
  ): Promise<N8nExecution> {
    const options: ExecuteWorkflowOptions | undefined = data ? { data } : undefined;
    return executeWorkflow(this, workflowId, options);
  }

  async listExecutions(
    options?: ListExecutionsOptions,
  ): Promise<N8nPaginatedResult<N8nExecution>> {
    return listExecutions(this, options);
  }

  async getExecution(executionId: string): Promise<N8nExecution> {
    return getExecution(this, executionId);
  }

  async deleteExecution(executionId: string): Promise<void> {
    await deleteExecution(this, executionId);
  }

  async listNodeTypes(): Promise<N8nNodeType[]> {
    return listNodeTypes(this);
  }
}

export function createN8nProvider(
  client: RelayFileClient,
  config: N8nConfig,
): N8nProvider {
  return new N8nProvider(client, config);
}

export function resolveConfig(
  config: N8nConfig,
): Readonly<
  Required<Pick<N8nConfig, "baseUrl" | "apiBasePath">> &
    Omit<N8nConfig, "baseUrl" | "apiBasePath">
> {
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new N8nConfigurationError("N8nProvider requires a non-empty baseUrl.");
  }

  const hasApiKey = Boolean(config.apiKey?.trim());
  const hasBasic = Boolean(config.username?.trim() && config.password?.trim());

  if (!hasApiKey && !hasBasic) {
    throw new N8nConfigurationError(
      "N8nProvider requires either apiKey or username/password authentication.",
    );
  }

  return {
    ...config,
    baseUrl,
    apiBasePath: normalizeApiBasePath(config.apiBasePath),
    apiKey: config.apiKey?.trim() || undefined,
    username: config.username?.trim() || undefined,
    password: config.password ?? undefined,
  };
}

export async function requestN8n<T>(
  config: Readonly<
    Required<Pick<N8nConfig, "baseUrl" | "apiBasePath">> &
      Omit<N8nConfig, "baseUrl" | "apiBasePath">
  >,
  options: N8nApiRequestOptions,
): Promise<T> {
  const url = buildApiUrl(config, options.path, options.query);
  const headers = buildRequestHeaders(
    options.headers,
    options.body,
    buildN8nAuthHeaders(config),
  );

  let response: Response;
  try {
    response = await (config.fetch ?? fetch)(url, {
      method: options.method,
      headers,
      body: serializeBody(options.body, headers),
      signal: options.signal,
    });
  } catch (error) {
    throw new N8nApiError(`n8n request failed for ${options.method} ${options.path}.`, {
      path: options.path,
      cause: error,
    });
  }

  const payload = await readResponseBody(response, options.responseType ?? "auto");

  if (!response.ok) {
    throw new N8nApiError(
      `n8n request ${options.method} ${options.path} failed with ${response.status}.`,
      {
        path: options.path,
        status: response.status,
        responseBody: payload,
      },
    );
  }

  return payload as T;
}

export async function requestWithFallback<T>(
  config: Readonly<
    Required<Pick<N8nConfig, "baseUrl" | "apiBasePath">> &
      Omit<N8nConfig, "baseUrl" | "apiBasePath">
  >,
  candidates: readonly N8nApiRequestOptions[],
): Promise<T> {
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      return await requestN8n<T>(config, candidate);
    } catch (error) {
      lastError = error;
      if (
        !(error instanceof N8nApiError) ||
        (error.status !== 404 && error.status !== 405)
      ) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new N8nProviderError("All n8n request fallbacks failed.");
}

export function buildN8nAuthHeaders(
  config: Readonly<
    Required<Pick<N8nConfig, "baseUrl" | "apiBasePath">> &
      Omit<N8nConfig, "baseUrl" | "apiBasePath">
  >,
): Record<string, string> {
  if (config.apiKey) {
    return { "X-N8N-API-KEY": config.apiKey };
  }

  if (config.username && config.password) {
    return {
      Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`,
    };
  }

  throw new N8nConfigurationError(
    "n8n authentication headers could not be resolved.",
  );
}

function buildApiUrl(
  config: Readonly<
    Required<Pick<N8nConfig, "baseUrl" | "apiBasePath">> &
      Omit<N8nConfig, "baseUrl" | "apiBasePath">
  >,
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(
    `${config.apiBasePath}${normalizedPath}`,
    `${config.baseUrl}/`,
  );

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function buildProxyUrl(
  baseUrl: string,
  endpoint: string,
  query?: Record<string, string>,
): string {
  const url = new URL(endpoint, baseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function buildRequestHeaders(
  headers: Record<string, string> | undefined,
  body: unknown,
  authHeaders: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {
    accept: "application/json",
    ...headers,
    ...authHeaders,
  };

  const hasContentType = Object.keys(result).some(
    (key) => key.toLowerCase() === "content-type",
  );

  if (body !== undefined && body !== null && typeof body !== "string" && !hasContentType) {
    result["content-type"] = "application/json";
  }

  return result;
}

function serializeBody(
  body: unknown,
  headers: Record<string, string>,
): BodyInit | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }

  if (typeof body === "string") {
    return body;
  }

  const contentType = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === "content-type",
  )?.[1];

  if (contentType?.includes("application/json") ?? true) {
    return JSON.stringify(body);
  }

  return body as BodyInit;
}

async function readResponseBody(
  response: Response,
  responseType: N8nApiRequestOptions["responseType"],
): Promise<unknown> {
  if (responseType === "void" || response.status === 204) {
    return undefined;
  }

  if (responseType === "text") {
    return response.text();
  }

  if (responseType === "json") {
    return response.json();
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

function normalizeApiBasePath(apiBasePath: string | undefined): string {
  const candidate = apiBasePath?.trim() || DEFAULT_API_BASE_PATH;
  const withLeadingSlash = candidate.startsWith("/") ? candidate : `/${candidate}`;
  return withLeadingSlash.replace(/\/+$/, "");
}
