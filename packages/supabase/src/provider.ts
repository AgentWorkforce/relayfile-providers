import { WebhookNormalizationError } from "./errors.js";
import type { FileSemantics } from "@relayfile/sdk";
import {
  IntegrationProvider,
  computeCanonicalPath,
  type ConnectionProvider,
  type NormalizedWebhook,
  type ProxyRequest,
  type ProxyResponse,
  type QueuedResponse,
  type RelayFileClient,
} from "@relayfile/sdk";
import {
  createSSOProvider,
  createUser,
  deleteUser,
  getUser,
  getUserIdentities,
  listFactors,
  listSSO,
  listUsers,
  unlinkIdentity,
  updateUser,
} from "./users.js";
import {
  decodeJwtClaims,
  generateLink,
  getProviderToken,
  getSession,
  refreshSession,
} from "./tokens.js";
import {
  normalizeSupabaseWebhook,
  verifyWebhook,
} from "./webhook.js";
import type {
  CreateSSOProviderInput,
  CreateUserInput,
  GenerateLinkInput,
  GenerateLinkResult,
  GenerateLinkType,
  ListUsersOptions,
  ListUsersResult,
  SupabaseConfig,
  SupabaseJwtClaims,
  SupabaseMfaFactor,
  SupabaseSession,
  SupabaseSsoProvider,
  SupabaseTransport,
  SupabaseTransportRequest,
  SupabaseTransportResponse,
  SupabaseUser,
  SupabaseVerifiedSession,
  UpdateUserInput,
} from "./types.js";

export class SupabaseProvider
  extends IntegrationProvider
  implements ConnectionProvider, SupabaseTransport {
  readonly name = "supabase";
  readonly config: Readonly<SupabaseConfig>;

  constructor(client: RelayFileClient, config: SupabaseConfig) {
    super(client);
    const supabaseUrl = config.supabaseUrl.trim().replace(/\/+$/, "");
    const serviceRoleKey = config.serviceRoleKey.trim();

    if (!supabaseUrl) {
      throw new Error("SupabaseProvider requires a non-empty supabaseUrl.");
    }

    if (!serviceRoleKey) {
      throw new Error("SupabaseProvider requires a non-empty serviceRoleKey.");
    }

    this.config = {
      ...config,
      supabaseUrl,
      serviceRoleKey,
      anonKey: config.anonKey?.trim() || undefined,
      webhookSecret: config.webhookSecret?.trim() || undefined,
    };
  }

  async request<T>(input: SupabaseTransportRequest): Promise<SupabaseTransportResponse<T>> {
    const url = new URL(`${this.config.supabaseUrl}/auth/v1${input.path}`);
    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = this.buildHeaders(input.authMode ?? "admin", input.jwt);
    const hasBody = input.body !== undefined;
    const requestHeaders = {
      ...headers,
      ...input.headers,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    };
    const init: RequestInit = {
      method: input.method ?? "GET",
      headers: requestHeaders,
      ...(hasBody ? { body: JSON.stringify(input.body) } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    };
    const response = await this.fetchImpl()(url.toString(), init);
    const data = await readResponseBody(response);
    const normalizedHeaders = Object.fromEntries(response.headers.entries());

    if (!response.ok) {
      throw new Error(
        `Supabase request failed (${response.status}) ${input.method ?? "GET"} ${input.path}: ${formatErrorBody(data)}`,
      );
    }

    return {
      status: response.status,
      headers: normalizedHeaders,
      data: data as T,
    };
  }

  async proxy<T = unknown>(request: ProxyRequest): Promise<ProxyResponse<T>> {
    const provider = resolveProxyProvider(request);
    const token = await this.getAccessToken(request.connectionId, provider);
    const url = new URL(request.endpoint, request.baseUrl);

    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (key !== "provider") {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = sanitizeForwardHeaders(request.headers);
    const body = serializeForwardBody(request.body, headers);
    const init: RequestInit = {
      method: request.method,
      headers: {
        ...headers,
        Authorization: `Bearer ${token}`,
      },
      ...(body !== undefined ? { body } : {}),
    };
    const response = await this.fetchImpl()(url.toString(), init);

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      data: await readResponseBody(response) as T,
    };
  }

  async healthCheck(connectionId: string): Promise<boolean> {
    try {
      const user = await this.getUser(connectionId);
      return user.id.length > 0;
    } catch {
      return false;
    }
  }

  async handleWebhook(rawPayload: unknown): Promise<NormalizedWebhook> {
    return normalizeSupabaseWebhook(rawPayload);
  }

  async ingestWebhook(
    workspaceId: string,
    rawInput: unknown,
    signal?: AbortSignal,
  ): Promise<QueuedResponse> {
    const event = await this.handleWebhook(rawInput);
    const path = computeCanonicalPath(event.provider, event.objectType, event.objectId);
    const payload = {
      ...event.payload,
      semantics: {
        properties: buildSemanticProperties(event),
        relations: [],
      } satisfies FileSemantics,
    };

    return this.client.ingestWebhook({
      workspaceId,
      provider: event.provider,
      event_type: event.eventType,
      path,
      data: payload,
      ...(signal ? { signal } : {}),
    });
  }

  async getAccessToken(userId: string, provider: string, signal?: AbortSignal): Promise<string> {
    return getProviderToken(this, userId, provider, signal);
  }

  async getProviderToken(userId: string, provider: string, signal?: AbortSignal): Promise<string> {
    return getProviderToken(this, userId, provider, signal);
  }

  async listUsers(options?: ListUsersOptions): Promise<ListUsersResult> {
    return listUsers(this, options);
  }

  async getUser(userId: string, signal?: AbortSignal): Promise<SupabaseUser> {
    return getUser(this, userId, signal);
  }

  async createUser(input: CreateUserInput, signal?: AbortSignal): Promise<SupabaseUser> {
    return createUser(this, input, signal);
  }

  async updateUser(userId: string, input: UpdateUserInput, signal?: AbortSignal): Promise<SupabaseUser> {
    return updateUser(this, userId, input, signal);
  }

  async deleteUser(userId: string, signal?: AbortSignal): Promise<void> {
    return deleteUser(this, userId, signal);
  }

  async getUserIdentities(userId: string, signal?: AbortSignal) {
    return getUserIdentities(this, userId, signal);
  }

  async unlinkIdentity(userId: string, identityId: string, signal?: AbortSignal): Promise<void> {
    return unlinkIdentity(this, userId, identityId, signal);
  }

  async refreshSession(refreshToken: string, signal?: AbortSignal): Promise<SupabaseSession> {
    return refreshSession(this, refreshToken, signal);
  }

  async generateLink(
    type: GenerateLinkType,
    email: string,
    input?: GenerateLinkInput,
    signal?: AbortSignal,
  ): Promise<GenerateLinkResult> {
    return generateLink(this, type, email, input, signal);
  }

  async getSession(jwt: string, signal?: AbortSignal): Promise<SupabaseVerifiedSession> {
    return getSession(this, jwt, signal);
  }

  decodeJwtClaims(jwt: string): SupabaseJwtClaims {
    return decodeJwtClaims(jwt);
  }

  async listFactors(userId: string, signal?: AbortSignal): Promise<SupabaseMfaFactor[]> {
    return listFactors(this, userId, signal);
  }

  async listSSO(options?: ListUsersOptions): Promise<SupabaseSsoProvider[]> {
    return listSSO(this, options);
  }

  async createSSOProvider(
    input: CreateSSOProviderInput,
    signal?: AbortSignal,
  ): Promise<SupabaseSsoProvider> {
    return createSSOProvider(this, input, signal);
  }

  verifyWebhook(payload: string, signature: string, secret = this.config.webhookSecret): boolean {
    if (!secret) {
      throw new Error("SupabaseProvider requires webhookSecret to verify webhooks.");
    }
    return verifyWebhook(payload, secret, signature);
  }

  private fetchImpl(): typeof fetch {
    return this.config.fetch ?? fetch;
  }

  private buildHeaders(
    authMode: "admin" | "client" | "jwt",
    jwt?: string,
  ): Record<string, string> {
    if (authMode === "admin") {
      return {
        apikey: this.config.serviceRoleKey,
        Authorization: `Bearer ${this.config.serviceRoleKey}`,
      };
    }

    if (authMode === "jwt") {
      if (!jwt) {
        throw new Error("JWT auth mode requires a jwt value.");
      }
      return {
        apikey: this.config.anonKey ?? this.config.serviceRoleKey,
        Authorization: `Bearer ${jwt}`,
      };
    }

    return {
      apikey: this.config.anonKey ?? this.config.serviceRoleKey,
    };
  }
}

export function createSupabaseProvider(
  client: RelayFileClient,
  config: SupabaseConfig,
): SupabaseProvider {
  return new SupabaseProvider(client, config);
}

function resolveProxyProvider(request: ProxyRequest): string {
  const explicit =
    request.headers?.["x-supabase-provider"]
    ?? request.headers?.["X-Supabase-Provider"]
    ?? request.query?.provider;

  if (explicit?.trim()) {
    return explicit.trim();
  }

  try {
    const host = new URL(request.baseUrl).hostname.toLowerCase();
    const candidate = HOST_PROVIDER_MAP.find((entry) => host === entry.host || host.endsWith(`.${entry.host}`));
    if (candidate) {
      return candidate.provider;
    }
  } catch {
    throw new WebhookNormalizationError("invalid_webhook", "proxy baseUrl must be a valid URL.", { value: request.baseUrl });
  }

  throw new Error("Supabase proxy requires a provider hint via x-supabase-provider or query.provider.");
}

function sanitizeForwardHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const next = { ...(headers ?? {}) };
  delete next["x-supabase-provider"];
  delete next["X-Supabase-Provider"];
  return next;
}

function serializeForwardBody(
  body: unknown,
  headers: Record<string, string>,
): BodyInit | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }

  if (typeof body === "string" || body instanceof ArrayBuffer || ArrayBuffer.isView(body) || body instanceof Blob) {
    return body as BodyInit;
  }

  if (!("content-type" in lowercaseKeys(headers))) {
    headers["Content-Type"] = "application/json";
  }

  return JSON.stringify(body);
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text.length > 0 ? text : null;
}

function formatErrorBody(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function buildSemanticProperties(event: NormalizedWebhook): Record<string, string> {
  return {
    provider: event.provider,
    "provider.connection_id": event.connectionId,
    "provider.event_type": event.eventType,
    "provider.object_id": event.objectId,
    "provider.object_type": event.objectType,
  };
}

function lowercaseKeys(input: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

const HOST_PROVIDER_MAP = [
  { host: "api.github.com", provider: "github" },
  { host: "github.com", provider: "github" },
  { host: "api.linear.app", provider: "linear" },
  { host: "slack.com", provider: "slack" },
  { host: "www.googleapis.com", provider: "google" },
  { host: "api.notion.com", provider: "notion" },
  { host: "discord.com", provider: "discord" },
];
