import {
  IntegrationProvider,
  type ProxyRequest,
  type ProxyResponse,
  type QueuedResponse,
  type RelayFileClient,
} from "@relayfile/sdk";
import { PipedreamAuthSession } from "./auth.js";
import {
  deriveUsers,
  extractAccessToken,
  normalizeAccount,
  resolveExternalUserId,
} from "./accounts.js";
import {
  asObject,
  isObject,
  normalizeApp,
  normalizeComponent,
  normalizeEmitter,
  normalizeListResult,
  normalizeTriggerEvent,
  normalizeTriggerWebhook,
} from "./apps.js";
import { getWebhookPath, normalizePipedreamWebhook } from "./webhook.js";
import type {
  CreateConnectTokenOptions,
  DeployTriggerOptions,
  InvokeActionOptions,
  InvokeWorkflowOptions,
  JsonObject,
  ListAccountsOptions,
  ListAppsOptions,
  ListComponentsOptions,
  ListDeployedTriggersOptions,
  ListUsersOptions,
  PipedreamAccount,
  PipedreamActionResult,
  PipedreamApp,
  PipedreamComponent,
  PipedreamConfig,
  PipedreamConnectToken,
  PipedreamEmitter,
  PipedreamListResult,
  PipedreamProjectCredentials,
  PipedreamProjectInfo,
  PipedreamTriggerEvent,
  PipedreamTriggerWebhook,
  PipedreamUser,
  UpdateDeployedTriggerOptions,
  UpdateTriggerWebhooksOptions,
  UpdateTriggerWorkflowsOptions,
} from "./types.js";

type QueryValue = boolean | number | string | string[] | undefined;

export class PipedreamProvider extends IntegrationProvider {
  readonly name = "pipedream";
  readonly config: Readonly<PipedreamConfig>;
  private readonly auth: PipedreamAuthSession;

  constructor(client: RelayFileClient, config: PipedreamConfig) {
    super(client);

    if (!config.clientId.trim()) {
      throw new PipedreamConfigurationError("Pipedream clientId is required.");
    }
    if (!config.clientSecret.trim()) {
      throw new PipedreamConfigurationError("Pipedream clientSecret is required.");
    }
    if (!config.projectId.trim()) {
      throw new PipedreamConfigurationError("Pipedream projectId is required.");
    }

    this.config = {
      ...config,
      clientId: config.clientId.trim(),
      clientSecret: config.clientSecret.trim(),
      projectId: config.projectId.trim(),
      baseUrl: config.baseUrl?.trim(),
      workflowBaseUrl: config.workflowBaseUrl?.trim(),
      environment: config.environment ?? "production",
    };
    this.auth = new PipedreamAuthSession(this.config);
  }

  async getAccessToken(connectionId: string): Promise<string> {
    const account = await this.getAccount(connectionId, { includeCredentials: true });
    const accessToken = extractAccessToken(account);

    if (!accessToken) {
      throw new PipedreamCredentialError(
        `No OAuth access token is available for account ${connectionId}.`
      );
    }

    return accessToken;
  }

  async proxy(request: ProxyRequest): Promise<ProxyResponse> {
    const account = await this.getAccount(request.connectionId);
    const externalUserId = await this.resolveProxyExternalUserId(request, account);
    const targetUrl = buildTargetUrl(request.baseUrl, request.endpoint);
    const url64 = Buffer.from(targetUrl).toString("base64url");
    const headers = await this.buildHeaders();
    const upstreamHeaders = buildProxyForwardHeaders(request.headers);

    for (const [key, value] of Object.entries(upstreamHeaders)) {
      headers.set(key, value);
    }

    const response = await this.fetch(
      this.connectPath(`/proxy/${url64}`),
      {
        method: request.method,
        query: {
          account_id: request.connectionId,
          external_user_id: externalUserId,
          ...request.query,
        },
        headers,
        body: request.body,
      }
    );

    return {
      status: response.status,
      headers: toHeaderObject(response.headers),
      data: await parseResponseBody(response),
    };
  }

  async healthCheck(connectionId: string): Promise<boolean> {
    const account = await this.getAccount(connectionId);
    return account.dead !== true && account.healthy !== false;
  }

  async handleWebhook(rawPayload: unknown) {
    return normalizePipedreamWebhook(rawPayload);
  }

  async ingestWebhook(
    workspaceId: string,
    rawInput: unknown,
    signal?: AbortSignal
  ): Promise<QueuedResponse> {
    const event = normalizePipedreamWebhook(rawInput);
    return this.client.ingestWebhook({
      workspaceId,
      provider: event.provider,
      event_type: event.eventType,
      path: getWebhookPath(event),
      data: event.payload,
      signal,
    });
  }

  async createConnectToken(
    externalUserId: string,
    options: CreateConnectTokenOptions = {}
  ): Promise<PipedreamConnectToken> {
    const raw = await this.requestJson<{
      connect_link_url: string;
      expires_at: string;
      token: string;
    }>("POST", this.connectPath("/tokens"), {
      body: {
        external_user_id: externalUserId,
        ...(options.allowedOrigins ? { allowed_origins: options.allowedOrigins } : {}),
        ...(options.errorRedirectUri
          ? { error_redirect_uri: options.errorRedirectUri }
          : {}),
        ...(options.expiresIn ? { expires_in: options.expiresIn } : {}),
        ...(options.scope ? { scope: options.scope } : {}),
        ...(options.successRedirectUri
          ? { success_redirect_uri: options.successRedirectUri }
          : {}),
        ...(options.webhookUri ? { webhook_uri: options.webhookUri } : {}),
      },
    });

    return {
      token: raw.token,
      connectLinkUrl: raw.connect_link_url,
      expiresAt: raw.expires_at,
      raw,
    };
  }

  getProjectCredentials(): PipedreamProjectCredentials {
    return {
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      projectId: this.config.projectId,
      environment: this.auth.environment,
      baseUrl: this.auth.baseUrl,
    };
  }

  async listAccounts(
    options: ListAccountsOptions = {}
  ): Promise<PipedreamListResult<PipedreamAccount>> {
    const raw = await this.requestJson<unknown>("GET", this.connectPath("/accounts"), {
      query: {
        external_user_id: options.externalUserId,
        oauth_app_id: options.oauthAppId,
        after: options.cursor,
        before: options.before,
        limit: options.limit,
        app: options.app,
        include_credentials: options.includeCredentials,
      },
    });
    return normalizeListResult(raw, normalizeAccount);
  }

  async getAccount(
    accountId: string,
    options: { includeCredentials?: boolean } = {}
  ): Promise<PipedreamAccount> {
    const raw = await this.requestJson<unknown>(
      "GET",
      this.connectPath(`/accounts/${encodeURIComponent(accountId)}`),
      {
        query: {
          include_credentials: options.includeCredentials,
        },
      }
    );
    return normalizeAccount(raw);
  }

  async deleteAccount(accountId: string): Promise<void> {
    await this.requestJson<void>(
      "DELETE",
      this.connectPath(`/accounts/${encodeURIComponent(accountId)}`)
    );
  }

  async listUsers(
    options: ListUsersOptions = {}
  ): Promise<PipedreamListResult<PipedreamUser>> {
    const accounts = await this.listAccounts({
      app: options.app,
      cursor: options.cursor,
      before: options.before,
      limit: options.limit,
    });
    const resolvedAccounts: PipedreamAccount[] = [];

    for (const account of accounts.data) {
      const externalUserId = await resolveExternalUserId(
        account,
        this.config.resolveExternalUserId
      );
      resolvedAccounts.push(
        externalUserId ? { ...account, externalUserId } : account
      );
    }

    return {
      data: deriveUsers(resolvedAccounts),
      pageInfo: accounts.pageInfo,
      raw: accounts.raw,
    };
  }

  async deleteUser(externalUserId: string): Promise<void> {
    await this.requestJson<void>(
      "DELETE",
      this.connectPath(`/users/${encodeURIComponent(externalUserId)}`)
    );
  }

  async listApps(
    options: ListAppsOptions = {}
  ): Promise<PipedreamListResult<PipedreamApp>> {
    const raw = await this.requestJson<unknown>("GET", "/v1/connect/apps", {
      query: {
        after: options.cursor,
        before: options.before,
        limit: options.limit,
        q: options.query,
        sort_key: options.sortKey,
        sort_direction: options.sortDirection,
        category_ids: options.categoryIds,
        has_components: options.hasComponents,
        has_actions: options.hasActions,
        has_triggers: options.hasTriggers,
      },
      includeEnvironmentHeader: false,
    });
    return normalizeListResult(raw, normalizeApp);
  }

  async getApp(appSlug: string): Promise<PipedreamApp> {
    const raw = await this.requestJson<{ data?: unknown }>(
      "GET",
      `/v1/connect/apps/${encodeURIComponent(appSlug)}`,
      {
        includeEnvironmentHeader: false,
      }
    );
    return normalizeApp(raw.data ?? raw);
  }

  async listActions(
    options: ListComponentsOptions = {}
  ): Promise<PipedreamListResult<PipedreamComponent>> {
    const raw = await this.requestJson<unknown>("GET", this.connectPath("/actions"), {
      query: {
        after: options.cursor,
        before: options.before,
        limit: options.limit,
        q: options.query,
        app: options.app,
        registry: options.registry,
      },
    });
    return normalizeListResult(raw, normalizeComponent);
  }

  async getAction(componentId: string): Promise<PipedreamComponent> {
    const raw = await this.requestJson<{ data?: unknown }>(
      "GET",
      this.connectPath(`/actions/${encodeURIComponent(componentId)}`)
    );
    return normalizeComponent(raw.data ?? raw);
  }

  async invokeAction(
    actionId: string,
    options: InvokeActionOptions
  ): Promise<PipedreamActionResult> {
    const raw = await this.requestJson<Record<string, unknown>>(
      "POST",
      this.connectPath("/actions/run"),
      {
        body: {
          id: actionId,
          external_user_id: options.externalUserId,
          ...(options.version ? { version: options.version } : {}),
          ...(options.configuredProps
            ? { configured_props: options.configuredProps }
            : {}),
          ...(options.dynamicPropsId
            ? { dynamic_props_id: options.dynamicPropsId }
            : {}),
          ...(options.stashId !== undefined ? { stash_id: options.stashId } : {}),
        },
      }
    );

    return {
      exports: raw.exports,
      logs: raw.os,
      result: raw.ret,
      stashId:
        typeof raw.stash_id === "string" || raw.stash_id === null
          ? raw.stash_id
          : undefined,
      raw,
    };
  }

  async listTriggers(
    options: ListComponentsOptions = {}
  ): Promise<PipedreamListResult<PipedreamComponent>> {
    const raw = await this.requestJson<unknown>("GET", this.connectPath("/triggers"), {
      query: {
        after: options.cursor,
        before: options.before,
        limit: options.limit,
        q: options.query,
        app: options.app,
        registry: options.registry,
      },
    });
    return normalizeListResult(raw, normalizeComponent);
  }

  async getTrigger(componentId: string): Promise<PipedreamComponent> {
    const raw = await this.requestJson<{ data?: unknown }>(
      "GET",
      this.connectPath(`/triggers/${encodeURIComponent(componentId)}`)
    );
    return normalizeComponent(raw.data ?? raw);
  }

  async deployTrigger(options: DeployTriggerOptions): Promise<PipedreamEmitter> {
    const raw = await this.requestJson<{ data?: unknown }>(
      "POST",
      this.connectPath("/triggers/deploy"),
      {
        body: {
          id: options.id,
          external_user_id: options.externalUserId,
          ...(options.version ? { version: options.version } : {}),
          ...(options.configuredProps
            ? { configured_props: options.configuredProps }
            : {}),
          ...(options.dynamicPropsId
            ? { dynamic_props_id: options.dynamicPropsId }
            : {}),
          ...(options.workflowId ? { workflow_id: options.workflowId } : {}),
          ...(options.webhookUrl ? { webhook_url: options.webhookUrl } : {}),
          ...(options.emitOnDeploy !== undefined
            ? { emit_on_deploy: options.emitOnDeploy }
            : {}),
        },
      }
    );
    return normalizeEmitter(raw.data ?? raw);
  }

  async listDeployedTriggers(
    options: ListDeployedTriggersOptions
  ): Promise<PipedreamListResult<PipedreamEmitter>> {
    const raw = await this.requestJson<unknown>(
      "GET",
      this.connectPath("/deployed-triggers"),
      {
        query: {
          external_user_id: options.externalUserId,
          after: options.cursor,
          before: options.before,
          limit: options.limit,
          emitter_type: options.emitterType,
        },
      }
    );
    return normalizeListResult(raw, normalizeEmitter);
  }

  async getDeployedTrigger(
    triggerId: string,
    externalUserId: string
  ): Promise<PipedreamEmitter> {
    const raw = await this.requestJson<{ data?: unknown }>(
      "GET",
      this.connectPath(`/deployed-triggers/${encodeURIComponent(triggerId)}`),
      {
        query: { external_user_id: externalUserId },
      }
    );
    return normalizeEmitter(raw.data ?? raw);
  }

  async updateDeployedTrigger(
    triggerId: string,
    options: UpdateDeployedTriggerOptions
  ): Promise<PipedreamEmitter> {
    const raw = await this.requestJson<{ data?: unknown }>(
      "PUT",
      this.connectPath(`/deployed-triggers/${encodeURIComponent(triggerId)}`),
      {
        query: { external_user_id: options.externalUserId },
        body: {
          ...(options.active !== undefined ? { active: options.active } : {}),
          ...(options.configuredProps
            ? { configured_props: options.configuredProps }
            : {}),
          ...(options.emitOnDeploy !== undefined
            ? { emit_on_deploy: options.emitOnDeploy }
            : {}),
          ...(options.name ? { name: options.name } : {}),
        },
      }
    );
    return normalizeEmitter(raw.data ?? raw);
  }

  async deleteDeployedTrigger(
    triggerId: string,
    externalUserId: string
  ): Promise<void> {
    await this.requestJson<void>(
      "DELETE",
      this.connectPath(`/deployed-triggers/${encodeURIComponent(triggerId)}`),
      {
        query: { external_user_id: externalUserId },
      }
    );
  }

  async listDeployedTriggerEvents(
    triggerId: string,
    externalUserId: string,
    limit?: number
  ): Promise<PipedreamTriggerEvent[]> {
    const raw = await this.requestJson<{ data?: unknown[] }>(
      "GET",
      this.connectPath(`/deployed-triggers/${encodeURIComponent(triggerId)}/events`),
      {
        query: {
          external_user_id: externalUserId,
          n: limit,
        },
      }
    );
    return Array.isArray(raw.data) ? raw.data.map(normalizeTriggerEvent) : [];
  }

  async listTriggerWebhooks(
    triggerId: string,
    externalUserId: string
  ): Promise<PipedreamTriggerWebhook[]> {
    const raw = await this.requestJson<{ webhooks?: unknown[] }>(
      "GET",
      this.connectPath(`/deployed-triggers/${encodeURIComponent(triggerId)}/webhooks`),
      {
        query: { external_user_id: externalUserId },
      }
    );
    return Array.isArray(raw.webhooks) ? raw.webhooks.map(normalizeTriggerWebhook) : [];
  }

  async updateTriggerWebhooks(
    triggerId: string,
    options: UpdateTriggerWebhooksOptions
  ): Promise<PipedreamTriggerWebhook[]> {
    const raw = await this.requestJson<{ webhooks?: unknown[] }>(
      "PUT",
      this.connectPath(`/deployed-triggers/${encodeURIComponent(triggerId)}/webhooks`),
      {
        query: { external_user_id: options.externalUserId },
        body: {
          webhook_urls: options.webhookUrls,
        },
      }
    );
    return Array.isArray(raw.webhooks) ? raw.webhooks.map(normalizeTriggerWebhook) : [];
  }

  async getTriggerWebhook(
    triggerId: string,
    webhookId: string,
    externalUserId: string
  ): Promise<PipedreamTriggerWebhook> {
    const raw = await this.requestJson<{ data?: unknown }>(
      "GET",
      this.connectPath(
        `/deployed-triggers/${encodeURIComponent(
          triggerId
        )}/webhooks/${encodeURIComponent(webhookId)}`
      ),
      {
        query: { external_user_id: externalUserId },
      }
    );
    return normalizeTriggerWebhook(raw.data ?? raw);
  }

  async regenerateTriggerWebhookSigningKey(
    triggerId: string,
    webhookId: string,
    externalUserId: string
  ): Promise<PipedreamTriggerWebhook> {
    const raw = await this.requestJson<{ data?: unknown }>(
      "POST",
      this.connectPath(
        `/deployed-triggers/${encodeURIComponent(
          triggerId
        )}/webhooks/${encodeURIComponent(webhookId)}/regenerate_signing_key`
      ),
      {
        query: { external_user_id: externalUserId },
      }
    );
    return normalizeTriggerWebhook(raw.data ?? raw);
  }

  async listTriggerWorkflows(
    triggerId: string,
    externalUserId: string
  ): Promise<string[]> {
    const raw = await this.requestJson<{ workflow_ids?: unknown[] }>(
      "GET",
      this.connectPath(`/deployed-triggers/${encodeURIComponent(triggerId)}/pipelines`),
      {
        query: { external_user_id: externalUserId },
      }
    );
    return Array.isArray(raw.workflow_ids)
      ? raw.workflow_ids.flatMap((item) =>
          typeof item === "string" ? [item] : []
        )
      : [];
  }

  async updateTriggerWorkflows(
    triggerId: string,
    options: UpdateTriggerWorkflowsOptions
  ): Promise<string[]> {
    const raw = await this.requestJson<{ workflow_ids?: unknown[] }>(
      "PUT",
      this.connectPath(`/deployed-triggers/${encodeURIComponent(triggerId)}/pipelines`),
      {
        query: { external_user_id: options.externalUserId },
        body: {
          workflow_ids: options.workflowIds,
        },
      }
    );
    return Array.isArray(raw.workflow_ids)
      ? raw.workflow_ids.flatMap((item) =>
          typeof item === "string" ? [item] : []
        )
      : [];
  }

  async invokeWorkflow(
    workflowUrlOrPath: string,
    options: InvokeWorkflowOptions
  ): Promise<unknown> {
    const url = resolveWorkflowUrl(workflowUrlOrPath, this.config.workflowBaseUrl);
    const headers = await this.buildHeaders(false);
    headers.set("x-pd-external-user-id", options.externalUserId);

    for (const [key, value] of Object.entries(options.headers ?? {})) {
      headers.set(key, value);
    }

    const response = await this.fetch(url, {
      method: options.method ?? "POST",
      query: options.query,
      headers,
      body: options.body,
      signal: options.signal,
      includeAuthHeader: true,
      includeEnvironmentHeader: true,
    });

    return parseResponseBody(response);
  }

  async getProjectInfo(): Promise<PipedreamProjectInfo> {
    const raw = await this.requestJson<{ apps?: unknown[] }>(
      "GET",
      this.connectPath("/projects/info")
    );
    return {
      apps: Array.isArray(raw.apps)
        ? raw.apps.map((item) => {
            const record = asObject(item);
            return {
              id: typeof record.id === "string" ? record.id : undefined,
              slug: String(record.name_slug ?? ""),
            };
          })
        : [],
      raw,
    };
  }

  private async resolveProxyExternalUserId(
    request: ProxyRequest,
    account: PipedreamAccount
  ): Promise<string> {
    const hint =
      readHint(request.query, "external_user_id") ??
      readHint(request.query, "externalUserId") ??
      readHeader(request.headers, "x-pd-external-user-id");

    if (hint) {
      return hint;
    }

    const resolved = await resolveExternalUserId(
      account,
      this.config.resolveExternalUserId
    );

    if (resolved) {
      return resolved;
    }

    throw new PipedreamConfigurationError(
      "Pipedream proxy requests require an external user ID. Pass x-pd-external-user-id or configure resolveExternalUserId()."
    );
  }

  private connectPath(pathname: string): string {
    return `/v1/connect/${encodeURIComponent(this.config.projectId)}${pathname}`;
  }

  private async requestJson<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      headers?: Headers;
      query?: Record<string, QueryValue>;
      includeAuthHeader?: boolean;
      includeEnvironmentHeader?: boolean;
      signal?: AbortSignal;
    } = {}
  ): Promise<T> {
    const response = await this.fetch(path, {
      ...options,
      method,
      includeAuthHeader: options.includeAuthHeader ?? true,
      includeEnvironmentHeader: options.includeEnvironmentHeader ?? true,
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      throw new PipedreamApiError(
        response.status,
        `Pipedream API request failed (${response.status}).`,
        payload
      );
    }

    return payload as T;
  }

  private async fetch(
    pathOrUrl: string,
    options: {
      body?: unknown;
      headers?: Headers;
      includeAuthHeader?: boolean;
      includeEnvironmentHeader?: boolean;
      method: string;
      query?: Record<string, QueryValue>;
      signal?: AbortSignal;
    }
  ): Promise<Response> {
    const url = new URL(pathOrUrl, this.auth.baseUrl);
    appendQuery(url, options.query);

    const headers = options.headers ?? new Headers();
    if (options.includeAuthHeader !== false) {
      headers.set("authorization", `Bearer ${await this.auth.getBearerToken(options.signal)}`);
    }
    if (options.includeEnvironmentHeader !== false) {
      headers.set("x-pd-environment", this.auth.environment);
    }

    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      if (
        typeof options.body === "string" ||
        options.body instanceof ArrayBuffer ||
        ArrayBuffer.isView(options.body) ||
        options.body instanceof URLSearchParams ||
        options.body instanceof Blob
      ) {
        body = options.body as BodyInit;
      } else {
        headers.set("content-type", headers.get("content-type") ?? "application/json");
        body = JSON.stringify(options.body);
      }
    }

    return this.auth.fetchImpl(url, {
      method: options.method,
      headers,
      body,
      signal: options.signal,
    });
  }

  private async buildHeaders(includeJsonAccept = true): Promise<Headers> {
    const headers = new Headers();
    headers.set(
      "authorization",
      `Bearer ${await this.auth.getBearerToken()}`
    );
    headers.set("x-pd-environment", this.auth.environment);
    if (includeJsonAccept) {
      headers.set("accept", "application/json");
    }
    return headers;
  }
}

export class PipedreamApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown
  ) {
    super(message);
    this.name = "PipedreamApiError";
  }
}

export class PipedreamConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipedreamConfigurationError";
  }
}

export class PipedreamCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipedreamCredentialError";
  }
}

function appendQuery(url: URL, query?: Record<string, QueryValue>): void {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        url.searchParams.append(key, entry);
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  if (
    contentType.startsWith("text/") ||
    contentType.includes("xml") ||
    contentType.includes("javascript")
  ) {
    return response.text();
  }
  return response.arrayBuffer();
}

function buildTargetUrl(baseUrl: string, endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }
  return new URL(endpoint, baseUrl).toString();
}

function buildProxyForwardHeaders(
  headers: Record<string, string> | undefined
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === "x-pd-external-user-id") {
      continue;
    }
    if (normalizedKey.startsWith("x-pd-proxy-")) {
      result[normalizedKey] = value;
      continue;
    }
    result[`x-pd-proxy-${normalizedKey}`] = value;
  }
  return result;
}

function readHint(
  query: Record<string, string> | undefined,
  key: string
): string | undefined {
  const value = query?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readHeader(
  headers: Record<string, string> | undefined,
  key: string
): string | undefined {
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (name.toLowerCase() === key.toLowerCase() && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function toHeaderObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function resolveWorkflowUrl(target: string, baseUrl?: string): string {
  if (/^https?:\/\//i.test(target)) {
    return target;
  }
  if (!baseUrl) {
    throw new PipedreamConfigurationError(
      "Relative workflow targets require config.workflowBaseUrl."
    );
  }
  return new URL(target, baseUrl).toString();
}

export function createPipedreamProvider(
  client: RelayFileClient,
  config: PipedreamConfig
): PipedreamProvider {
  return new PipedreamProvider(client, config);
}
