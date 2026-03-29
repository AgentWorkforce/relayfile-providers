import {
  IntegrationProvider,
  computeCanonicalPath,
  type QueuedResponse,
  type RelayFileClient,
} from "@relayfile/sdk";

import { getJWKS, verifyClerkToken } from "./jwt.js";
import {
  createOrgInvitation,
  getOrganization,
  listOrgMembers,
  listOrganizations,
} from "./organizations.js";
import { getSession, listSessions, revokeSession, verifySession } from "./sessions.js";
import type { ConnectionProvider } from "@relayfile/sdk";
import type {
  ClerkApiRequest,
  ClerkConfig,
  ClerkHeaderValue,
  ClerkHeaders,
  ClerkJWKS,
  ClerkListOrgMembersOptions,
  ClerkListOrganizationsOptions,
  ClerkListSessionsOptions,
  ClerkListUsersOptions,
  ClerkNormalizedWebhook,
  ClerkOAuthToken,
  ClerkOrgInvitation,
  ClerkOrgInvitationOptions,
  ClerkOrgMember,
  ClerkOrganization,
  ClerkPaginatedResponse,
  ClerkSession,
  ClerkUpdateUserData,
  ClerkUser,
  ClerkVerifyTokenOptions,
  ClerkWebhookEvent,
  ClerkWebhookHeaders,
  ProxyRequest,
  ProxyResponse,
} from "./types.js";
import {
  getOAuthToken,
  getOAuthTokenList,
  getUser,
  getUserExternalAccounts,
  listUsers,
  updateUser,
  deleteUser,
} from "./users.js";
import {
  normalizeClerkWebhookInput,
  normalizeHeaderRecord,
  verifyClerkWebhook,
} from "./webhook.js";

const DEFAULT_BASE_URL = "https://api.clerk.com";

export class ClerkProvider extends IntegrationProvider implements ConnectionProvider {
  readonly name = "clerk";
  readonly config: Readonly<ClerkConfig>;

  constructor(client: RelayFileClient, config: ClerkConfig) {
    super(client);

    const secretKey = config.secretKey.trim();
    if (secretKey.length === 0) {
      throw new Error("ClerkProvider requires a non-empty secretKey.");
    }

    const normalizedBaseUrl = normalizeBaseUrl(config.baseUrl);
    this.config = normalizedBaseUrl
      ? { ...config, secretKey, baseUrl: normalizedBaseUrl }
      : { ...config, secretKey };
  }

  get baseUrl(): string {
    return this.config.baseUrl ?? DEFAULT_BASE_URL;
  }

  private get fetcher(): typeof fetch {
    if (this.config.fetch) {
      return this.config.fetch;
    }
    if (!globalThis.fetch) {
      throw new Error("A fetch implementation is required to use ClerkProvider.");
    }
    return globalThis.fetch;
  }

  async request<T>(input: ClerkApiRequest): Promise<T> {
    const response = await this.requestRaw(input);
    return (await parseResponse(response)) as T;
  }

  async getAccessToken(userId: string, provider: string): Promise<string> {
    const token = await this.getOAuthToken(userId, provider);
    if (!token?.token) {
      throw new Error(
        `No Clerk OAuth token found for user "${userId}" and provider "${provider}".`,
      );
    }
    return token.token;
  }

  async proxy<T = unknown>(request: ProxyRequest): Promise<ProxyResponse<T>> {
    const provider = getProxyProvider(request);
    const accessToken = await this.getAccessToken(request.connectionId, provider);
    const url = new URL(request.endpoint, request.baseUrl ?? this.baseUrl);

    if (request.query) {
      for (const [key, value] of Object.entries(request.query)) {
        url.searchParams.set(key, value);
      }
    }

    const outboundHeaders = stripInternalHeaders(normalizeHeaderRecord(request.headers));
    outboundHeaders.authorization = `Bearer ${accessToken}`;

    const init: RequestInit = {
      method: request.method,
      headers: withJsonContentType(outboundHeaders, request.body),
    };
    const body = serializeRequestBody(request.body);
    if (body !== undefined) {
      init.body = body;
    }

    const response = await this.fetcher(url.toString(), init);

    return {
      status: response.status,
      headers: responseHeadersToObject(response.headers),
      data: await parseResponse(response) as T,
    };
  }

  async healthCheck(connectionId: string): Promise<boolean> {
    try {
      await this.getUser(connectionId);
      return true;
    } catch {
      return false;
    }
  }

  async handleWebhook(rawPayload: unknown): Promise<ClerkNormalizedWebhook> {
    const options =
      this.config.webhookSecret !== undefined
        ? {
            providerName: this.name,
            webhookSecret: this.config.webhookSecret,
            verifyWebhook: async (payload: string | Uint8Array, headers: ClerkWebhookHeaders) =>
              this.verifyWebhook(payload, headers),
          }
        : {
            providerName: this.name,
          };

    return normalizeClerkWebhookInput(rawPayload, options);
  }

  async ingestWebhook(
    workspaceId: string,
    rawInput: unknown,
    signal?: AbortSignal,
  ): Promise<QueuedResponse> {
    const event = await this.handleWebhook(rawInput);
    const path = computeCanonicalPath(this.name, event.objectType, event.objectId);
    const ingest = toIngestWebhookInput(event, path);

    return this.client.ingestWebhook({
      workspaceId,
      ...ingest,
      ...(signal ? { signal } : {}),
    });
  }

  async listUsers(options: ClerkListUsersOptions = {}): Promise<ClerkPaginatedResponse<ClerkUser>> {
    return listUsers(this, options);
  }

  async getUser(userId: string): Promise<ClerkUser> {
    return getUser(this, userId);
  }

  async updateUser(userId: string, data: ClerkUpdateUserData): Promise<ClerkUser> {
    return updateUser(this, userId, data);
  }

  async deleteUser(userId: string) {
    return deleteUser(this, userId);
  }

  async getUserExternalAccounts(userId: string) {
    return getUserExternalAccounts(this, userId);
  }

  async getOAuthToken(userId: string, provider: string): Promise<ClerkOAuthToken | null> {
    return getOAuthToken(this, userId, provider);
  }

  async listSessions(
    options: ClerkListSessionsOptions = {},
  ): Promise<ClerkPaginatedResponse<ClerkSession>> {
    return listSessions(this, options);
  }

  async getSession(sessionId: string): Promise<ClerkSession> {
    return getSession(this, sessionId);
  }

  async revokeSession(sessionId: string): Promise<ClerkSession> {
    return revokeSession(this, sessionId);
  }

  async verifySession(
    sessionId: string,
    token: string,
    options?: ClerkVerifyTokenOptions,
  ): Promise<ClerkSession> {
    return verifySession(this, sessionId, token, options);
  }

  async listOrganizations(
    options: ClerkListOrganizationsOptions = {},
  ): Promise<ClerkPaginatedResponse<ClerkOrganization>> {
    return listOrganizations(this, options);
  }

  async getOrganization(organizationId: string): Promise<ClerkOrganization> {
    return getOrganization(this, organizationId);
  }

  async listOrgMembers(
    organizationId: string,
    options: ClerkListOrgMembersOptions = {},
  ): Promise<ClerkPaginatedResponse<ClerkOrgMember>> {
    return listOrgMembers(this, organizationId, options);
  }

  async createOrgInvitation(
    organizationId: string,
    emailAddress: string,
    role: string,
    options: ClerkOrgInvitationOptions = {},
  ): Promise<ClerkOrgInvitation> {
    return createOrgInvitation(this, organizationId, emailAddress, role, options);
  }

  async verifyWebhook(
    payload: string | Uint8Array,
    headers: ClerkWebhookHeaders,
  ): Promise<ClerkWebhookEvent> {
    if (!this.config.webhookSecret) {
      throw new Error("ClerkProvider requires webhookSecret to verify webhook signatures.");
    }

    return verifyClerkWebhook(this.config.webhookSecret, payload, headers);
  }

  async getJWKS(): Promise<ClerkJWKS> {
    return getJWKS(this);
  }

  async verifyToken(
    token: string,
    options?: ClerkVerifyTokenOptions,
  ) {
    return verifyClerkToken(this, token, options);
  }

  async getOAuthTokenList(
    userId: string,
    provider: string,
  ): Promise<ClerkPaginatedResponse<ClerkOAuthToken>> {
    return getOAuthTokenList(this, userId, provider);
  }

  private async requestRaw(input: ClerkApiRequest): Promise<Response> {
    const url = new URL(input.path, this.baseUrl);
    appendQuery(url, input.query);

    const headers: ClerkHeaders = {
      ...normalizeHeaderRecord(input.headers),
      authorization: `Bearer ${this.config.secretKey}`,
    };

    const init: RequestInit = {
      method: input.method,
      headers: withJsonContentType(headers, input.body),
    };
    const body = serializeRequestBody(input.body);
    if (body !== undefined) {
      init.body = body;
    }
    if (input.signal !== undefined) {
      init.signal = input.signal;
    }

    const response = await this.fetcher(url.toString(), init);

    if (!response.ok) {
      const body = await safeParseResponse(response);
      throw new Error(
        `Clerk API ${input.method} ${input.path} failed with ${response.status}: ${stringifyErrorBody(body)}`,
      );
    }

    return response;
  }
}

export function createClerkProvider(client: RelayFileClient, config: ClerkConfig): ClerkProvider {
  return new ClerkProvider(client, config);
}

function normalizeBaseUrl(baseUrl?: string): string | undefined {
  const trimmed = baseUrl?.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : undefined;
}

function appendQuery(url: URL, query?: Record<string, unknown>): void {
  if (!query) {
    return;
  }

  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue === null || rawValue === undefined) {
      continue;
    }

    if (Array.isArray(rawValue)) {
      for (const item of rawValue) {
        if (item !== null && item !== undefined) {
          url.searchParams.append(key, String(item));
        }
      }
      continue;
    }

    url.searchParams.set(key, String(rawValue));
  }
}

function withJsonContentType(headers: ClerkHeaders, body: unknown): ClerkHeaders {
  if (body === undefined || isBinaryBody(body)) {
    return headers;
  }
  if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function serializeRequestBody(body: unknown): BodyInit | undefined {
  if (body === undefined) {
    return undefined;
  }
  if (typeof body === "string" || isBinaryBody(body)) {
    return body;
  }
  return JSON.stringify(body);
}

function isBinaryBody(body: unknown): body is Exclude<BodyInit, string> {
  return (
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof ReadableStream
  );
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }
  return safeParseResponse(response);
}

async function safeParseResponse(response: Response): Promise<unknown> {
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

function stringifyErrorBody(body: unknown): string {
  if (typeof body === "string") {
    return body;
  }
  if (body === undefined) {
    return "empty response body";
  }
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

function toIngestWebhookInput(event: ClerkNormalizedWebhook, path: string) {
  const normalizedPath = path.trim();
  if (!normalizedPath) {
    throw new Error("Webhook path must be a non-empty string.");
  }

  return {
    provider: event.provider,
    event_type: event.eventType,
    path: normalizedPath,
    data: event.payload,
    ...(event.deliveryId ? { delivery_id: event.deliveryId } : {}),
    ...(event.timestamp ? { timestamp: event.timestamp } : {}),
    ...(event.headers ? { headers: event.headers } : {}),
  };
}

function responseHeadersToObject(headers: Headers): Record<string, string> {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    output[key] = value;
  });
  return output;
}

function getProxyProvider(request: ProxyRequest): string {
  const headers = normalizeHeaderRecord(request.headers);
  const headerProvider = headers["x-clerk-provider"] ?? headers["x-relayfile-provider"];
  if (headerProvider) {
    return headerProvider;
  }

  if (!request.baseUrl) return "clerk"; // no baseUrl → assume clerk API
  const hostname = new URL(request.baseUrl).hostname.toLowerCase();
  const match = hostname.match(/(?:api|www)\.([^.]+)\./);
  if (match?.[1]) {
    return match[1];
  }

  const labels = hostname.split(".");
  return labels.length > 1 ? (labels[labels.length - 2] ?? hostname) : hostname;
}

function stripInternalHeaders(headers: Record<string, string>): Record<string, string> {
  delete headers["x-clerk-provider"];
  delete headers["x-relayfile-provider"];
  return headers;
}
