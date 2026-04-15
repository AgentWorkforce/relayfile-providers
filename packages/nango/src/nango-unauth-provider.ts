import { NangoConfigurationError } from "./errors.js";
import { NangoProvider } from "./nango-provider.js";
import { deriveProviderConfigKey } from "./proxy.js";
import type {
  NangoConnection,
  NangoGetConnectionOptions,
  NangoProviderConfig,
  ProxyRequest,
  ProxyResponse,
} from "./types.js";

const DEFAULT_METADATA_KEY = "credentials";

type NangoProviderBaseShape = {
  readonly name: string;
  readonly config: Readonly<NangoProviderConfig>;
  readonly baseUrl: string;
  proxy<T = unknown>(request: ProxyRequest): Promise<ProxyResponse<T>>;
  getConnection(
    connectionId: string,
    options?: NangoGetConnectionOptions,
  ): Promise<Record<string, unknown> | NangoConnection | null>;
};

const NangoProviderBase = NangoProvider as new (
  config: NangoProviderConfig,
) => NangoProviderBaseShape;

export interface NangoUnauthProviderConfig extends NangoProviderConfig {
  metadataKey?: string | undefined;
}

export type NangoUnauthCredentials = Record<string, unknown>;
export type NangoUnauthAuthHeaders = Record<string, string>;

export interface NangoUnauthCredentialRefreshContext {
  connectionId: string;
  metadataKey: string;
  providerConfigKey?: string | undefined;
}

export type NangoUnauthCredentialRefreshFn<
  TCredentials extends NangoUnauthCredentials = NangoUnauthCredentials,
> = (
  currentCredentials: TCredentials | null,
  context: NangoUnauthCredentialRefreshContext,
) => Promise<TCredentials> | TCredentials;

export class NangoUnauthProvider extends NangoProviderBase {
  override readonly name = "nango-unauth";
  readonly metadataKey: string;

  constructor(config: NangoUnauthProviderConfig) {
    const { metadataKey, ...nangoConfig } = config;
    super(nangoConfig);

    this.metadataKey = normalizeMetadataKey(metadataKey);
  }

  override async proxy<T = unknown>(request: ProxyRequest): Promise<ProxyResponse<T>> {
    const providerConfigKey = resolveProxyProviderConfigKey(this.config, request);
    const metadata = await this.getConnectionMetadata(request.connectionId, providerConfigKey);
    const authHeaders = extractAuthHeaders(metadata[this.metadataKey]);
    const proxiedRequest = withAuthHeaders(request, authHeaders, providerConfigKey);

    return super.proxy<T>(proxiedRequest);
  }

  async setConnectionCredentials(
    connectionId: string,
    credentials: NangoUnauthCredentials,
  ): Promise<void> {
    const normalizedConnectionId = normalizeRequiredString(connectionId, "connectionId");
    assertRecord(credentials, "NangoUnauthProvider credentials must be a metadata object.");

    await patchConnectionMetadata({
      baseUrl: this.baseUrl,
      connectionId: normalizedConnectionId,
      credentials,
      fetch: this.config.fetch,
      metadataKey: this.metadataKey,
      providerConfigKey: requireProviderConfigKey(this.config),
      secretKey: this.config.secretKey,
    });
  }

  async refreshConnectionCredentials<
    TCredentials extends NangoUnauthCredentials = NangoUnauthCredentials,
  >(
    connectionId: string,
    refreshFn: NangoUnauthCredentialRefreshFn<TCredentials>,
  ): Promise<TCredentials> {
    const normalizedConnectionId = normalizeRequiredString(connectionId, "connectionId");
    const providerConfigKey = requireProviderConfigKey(this.config);
    const metadata = await this.getConnectionMetadata(normalizedConnectionId, providerConfigKey);
    const currentCredentials = asCredentials<TCredentials>(metadata[this.metadataKey]);
    const refreshedCredentials = await refreshFn(
      currentCredentials,
      buildRefreshContext(normalizedConnectionId, this.metadataKey, providerConfigKey),
    );

    assertRecord(
      refreshedCredentials,
      "NangoUnauthProvider refreshFn must return a metadata object.",
    );

    await patchConnectionMetadata({
      baseUrl: this.baseUrl,
      connectionId: normalizedConnectionId,
      credentials: refreshedCredentials,
      fetch: this.config.fetch,
      metadataKey: this.metadataKey,
      providerConfigKey,
      secretKey: this.config.secretKey,
    });

    return refreshedCredentials;
  }

  private async getConnectionMetadata(
    connectionId: string,
    providerConfigKey?: string | undefined,
  ): Promise<Record<string, unknown>> {
    const normalizedConnectionId = normalizeRequiredString(connectionId, "connectionId");
    const options = buildGetConnectionOptions(providerConfigKey);
    const connection = await super.getConnection(
      normalizedConnectionId,
      options,
    ) as NangoConnection | null;

    if (connection === null) {
      throw new Error(`Nango connection "${normalizedConnectionId}" was not found.`);
    }

    return connection.metadata;
  }
}

export function createNangoUnauthProvider(
  config: NangoUnauthProviderConfig,
): NangoUnauthProvider {
  return new NangoUnauthProvider(config);
}

interface PatchConnectionMetadataInput {
  baseUrl: string;
  connectionId: string;
  credentials: NangoUnauthCredentials;
  fetch?: typeof fetch | undefined;
  metadataKey: string;
  providerConfigKey: string;
  secretKey: string;
}

async function patchConnectionMetadata(input: PatchConnectionMetadataInput): Promise<void> {
  const fetchImpl = input.fetch ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("No fetch implementation is available for Nango metadata requests.");
  }

  const response = await fetchImpl(buildNangoUrl(input.baseUrl, "/connections/metadata"), {
    method: "PATCH",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${input.secretKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      connection_id: input.connectionId,
      provider_config_key: input.providerConfigKey,
      metadata: {
        [input.metadataKey]: input.credentials,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Nango connection metadata update failed: ${response.status} ${response.statusText}`,
    );
  }
}

function withAuthHeaders(
  request: ProxyRequest,
  authHeaders: NangoUnauthAuthHeaders,
  providerConfigKey?: string | undefined,
): ProxyRequest {
  const headers = mergeHeaders(request.headers, authHeaders);
  const proxiedRequest: ProxyRequest = { ...request };

  if (headers !== undefined) {
    proxiedRequest.headers = headers;
  }

  if (proxiedRequest.providerConfigKey === undefined && providerConfigKey !== undefined) {
    proxiedRequest.providerConfigKey = providerConfigKey;
  }

  return proxiedRequest;
}

function mergeHeaders(
  existingHeaders: ProxyRequest["headers"],
  authHeaders: NangoUnauthAuthHeaders,
): ProxyRequest["headers"] | undefined {
  if (Object.keys(authHeaders).length === 0) {
    return existingHeaders;
  }

  return {
    ...(existingHeaders ?? {}),
    ...authHeaders,
  };
}

function extractAuthHeaders(value: unknown): NangoUnauthAuthHeaders {
  if (!isRecord(value)) {
    return {};
  }

  const headers = firstRecord(value.headers, value.authHeaders) ?? value;

  return normalizeHeaderMap(headers);
}

function normalizeHeaderMap(value: Record<string, unknown>): NangoUnauthAuthHeaders {
  const headers: NangoUnauthAuthHeaders = {};

  for (const [key, headerValue] of Object.entries(value)) {
    const headerName = key.trim();
    if (headerName.length === 0 || typeof headerValue !== "string") {
      continue;
    }

    headers[headerName] = headerValue;
  }

  return headers;
}

function asCredentials<TCredentials extends NangoUnauthCredentials>(
  value: unknown,
): TCredentials | null {
  return isRecord(value) ? value as TCredentials : null;
}

function buildRefreshContext(
  connectionId: string,
  metadataKey: string,
  providerConfigKey: string,
): NangoUnauthCredentialRefreshContext {
  return {
    connectionId,
    metadataKey,
    providerConfigKey,
  };
}

function buildGetConnectionOptions(
  providerConfigKey?: string | undefined,
): NangoGetConnectionOptions {
  if (providerConfigKey === undefined) {
    return {};
  }

  return { providerConfigKey };
}

function resolveProxyProviderConfigKey(
  config: NangoProviderConfig,
  request: ProxyRequest,
): string | undefined {
  const configured = firstString(
    request.providerConfigKey,
    config.providerConfigKey,
    config.integrationId,
  );

  if (configured !== undefined) {
    return configured;
  }

  return firstString(request.baseUrl) === undefined
    ? undefined
    : deriveProviderConfigKey(request.baseUrl);
}

function requireProviderConfigKey(config: NangoProviderConfig): string {
  const providerConfigKey = firstString(config.providerConfigKey, config.integrationId);

  if (providerConfigKey === undefined) {
    throw new NangoConfigurationError(
      "NangoUnauthProvider requires a providerConfigKey or integrationId to update metadata.",
    );
  }

  return providerConfigKey;
}

function normalizeMetadataKey(metadataKey: string | undefined): string {
  return metadataKey?.trim() || DEFAULT_METADATA_KEY;
}

function normalizeRequiredString(value: string, label: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new NangoConfigurationError(`NangoUnauthProvider requires a non-empty ${label}.`);
  }

  return normalizedValue;
}

function buildNangoUrl(baseUrl: string, path: string): string {
  return new URL(path, `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

function assertRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new NangoConfigurationError(message);
  }
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function firstRecord(...values: unknown[]): Record<string, unknown> | undefined {
  for (const value of values) {
    if (isRecord(value)) {
      return value;
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
