import { getNangoConnection, getNangoConnectionDetail, listNangoConnections } from "./connections.js";
import { NangoConfigurationError } from "./errors.js";
import {
  DEFAULT_NANGO_BASE_URL,
  getConnectionHealth,
  healthCheckNangoConnection,
  normalizeNangoBaseUrl,
} from "./health.js";
import { proxyThroughNango } from "./proxy.js";
import { normalizeNangoWebhook } from "./webhook.js";
import type {
  ConnectionProvider,
  NangoConnection,
  NangoConnectionDetailResult,
  NangoConnectionHealthResult,
  NangoGetConnectionOptions,
  NangoConnectionListResult,
  NangoListConnectionsOptions,
  NangoProviderConfig,
  NormalizedWebhook,
} from "./types.js";

export class NangoProvider implements ConnectionProvider {
  readonly name = "nango";
  readonly config: Readonly<NangoProviderConfig>;

  constructor(config: NangoProviderConfig) {
    const secretKey = config.secretKey.trim();
    if (secretKey.length === 0) {
      throw new NangoConfigurationError("NangoProvider requires a non-empty secretKey.");
    }

    this.config = {
      ...config,
      secretKey,
      baseUrl: config.baseUrl?.trim() ? normalizeNangoBaseUrl(config.baseUrl) : undefined,
      integrationId: config.integrationId?.trim() || undefined,
      providerConfigKey: config.providerConfigKey?.trim() || undefined,
    };
  }

  get baseUrl(): string {
    return this.config.baseUrl ?? DEFAULT_NANGO_BASE_URL;
  }

  get providerConfigKey(): string | undefined {
    return this.config.providerConfigKey;
  }

  proxy: ConnectionProvider["proxy"] = async (request) => {
    return proxyThroughNango(this.config, request);
  };

  async healthCheck(connectionId: string): Promise<boolean> {
    return healthCheckNangoConnection(connectionId, this.config);
  }

  async getConnectionHealth(connectionId: string): Promise<NangoConnectionHealthResult> {
    return getConnectionHealth(connectionId, this.config);
  }

  async handleWebhook(rawPayload: unknown): Promise<NormalizedWebhook> {
    // Normalize payloads in a dedicated module so webhook support can expand
    // without widening the provider class surface.
    const { providerConfigKey } = this.config;
    return normalizeNangoWebhook(rawPayload, providerConfigKey);
  }

  async getConnection(
    connectionId: string,
    options: NangoGetConnectionOptions = {},
  ): Promise<NangoConnection | null> {
    const normalizedOptions = normalizeGetConnectionOptions(
      options,
      this.config.providerConfigKey,
    );

    return getNangoConnection(this.config, connectionId, normalizedOptions);
  }

  async getConnectionDetail(
    connectionId: string,
    options: NangoGetConnectionOptions = {},
  ): Promise<NangoConnectionDetailResult> {
    const normalizedOptions = normalizeGetConnectionOptions(
      options,
      this.config.providerConfigKey,
    );

    return getNangoConnectionDetail(this.config, connectionId, normalizedOptions);
  }

  async listConnectionDetails(
    options: string | NangoListConnectionsOptions = {},
  ): Promise<NangoConnectionListResult> {
    const normalizedOptions = normalizeListConnectionsOptions(
      options,
      this.config.providerConfigKey,
    );

    return listNangoConnections(this.config, {
      providerConfigKey: normalizedOptions.providerConfigKey,
      cursor: normalizedOptions.cursor,
      limit: normalizedOptions.limit,
      includeInactive:
        normalizedOptions.includeInactive === true || normalizedOptions.activeOnly === false,
    });
  }

  async listConnections(
    options: string | NangoListConnectionsOptions = {},
  ): Promise<NangoConnection[]> {
    const result = await this.listConnectionDetails(options);
    return result.connections;
  }
}

export function createNangoProvider(config: NangoProviderConfig): NangoProvider {
  return new NangoProvider(config);
}

function normalizeListConnectionsOptions(
  options: string | NangoListConnectionsOptions,
  defaultProviderConfigKey?: string,
): NangoListConnectionsOptions {
  if (typeof options === "string") {
    const providerConfigKey = options.trim();

    return {
      providerConfigKey: providerConfigKey || defaultProviderConfigKey,
    };
  }

  const providerConfigKey = options.providerConfigKey?.trim();

  return {
    ...options,
    providerConfigKey: providerConfigKey || defaultProviderConfigKey,
  };
}

function normalizeGetConnectionOptions(
  options: NangoGetConnectionOptions,
  defaultProviderConfigKey?: string,
): NangoGetConnectionOptions {
  const providerConfigKey = options.providerConfigKey?.trim();

  return {
    ...options,
    providerConfigKey: providerConfigKey || defaultProviderConfigKey,
  };
}
