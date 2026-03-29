import assert from "node:assert/strict";

import type {
  NangoConnection,
  NangoConnectionDetailResult,
  NangoConnectionMetadata,
  NangoConnectionHealthResult,
  NangoConnectionServiceConfig,
  NormalizedWebhook,
  ProxyRequest,
  ProxyResponse,
} from "../../types.js";
import {
  createMockNangoServer,
  type MockNangoCall,
  type MockNangoServer,
  type MockResponseSpec,
} from "../mock-nango.js";

export interface ProviderUnderTest {
  readonly name: string;
  proxy?(request: ProxyRequest): Promise<ProxyResponse>;
  healthCheck(connectionId: string): Promise<boolean | NangoConnectionHealthResult>;
  getConnectionHealth?(connectionId: string): Promise<NangoConnectionHealthResult>;
  handleWebhook?(rawPayload: unknown): Promise<NormalizedWebhook>;
  listConnections?(options?: unknown): Promise<unknown>;
}

type ProviderCtor = new (config: Record<string, unknown>) => ProviderUnderTest;

export interface ProviderHarnessOptions {
  secretKey?: string;
  baseUrl?: string;
  providerConfigKey?: string;
}

export interface ConnectionServiceConfigOptions {
  secretKey?: string;
  baseUrl?: string;
  fetch: typeof fetch;
}

export interface ConnectionMetadataExpectation {
  id: string;
  provider?: string;
  providerConfigKey?: string;
  connectionConfigKey?: string;
  environment?: string;
  active?: boolean;
  activity?: NangoConnectionMetadata["activity"];
  status?: string;
  authStatus?: string;
  syncStatus?: string;
  inactiveReason?: string;
  createdAt?: string;
  updatedAt?: string;
  lastSyncAt?: string;
  endUserId?: string;
  endUserEmail?: string;
  errorCount?: number;
}

export interface ConnectionResponseExpectation {
  metadata: ConnectionMetadataExpectation;
  recordMetadata?: Record<string, unknown>;
  endUser?: NangoConnection["endUser"];
  credentials?: NangoConnection["credentials"];
  errors?: Array<{
    code?: string;
    message: string;
  }>;
}

export interface ProviderHarness {
  provider: ProviderUnderTest;
  server: MockNangoServer;
  cleanup: () => Promise<void>;
  buildProxyRequest: (overrides?: Partial<ProxyRequest>) => ProxyRequest;
}

export interface FetchMockCall {
  url: string;
  method: string;
  headers: Headers;
  bodyText?: string;
}

export interface FetchMock {
  calls: FetchMockCall[];
  fetch: typeof fetch;
  queueJson: (body: unknown, status?: number, headers?: Record<string, string>) => void;
  reset: () => void;
}

const PROVIDER_CANDIDATES = ["../../nango-provider.js", "../../index.js"] as const;
const DEFAULT_TEST_SECRET_KEY = "test-secret-key";
const DEFAULT_TEST_BASE_URL = "https://api.nango.test";
const DEFAULT_TEST_PROVIDER_CONFIG_KEY = "github";

export async function createProviderHarness(
  options: ProviderHarnessOptions = {},
): Promise<ProviderHarness> {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_TEST_BASE_URL);
  const secretKey = options.secretKey ?? DEFAULT_TEST_SECRET_KEY;
  const providerConfigKey = options.providerConfigKey ?? DEFAULT_TEST_PROVIDER_CONFIG_KEY;
  const boot = bootMockNangoServer({ baseUrl });
  const Provider = await loadNangoProviderCtor();
  const provider = new Provider({
    secretKey,
    baseUrl,
    providerConfigKey,
    provider: providerConfigKey,
  });

  return {
    provider,
    server: boot.server,
    cleanup: boot.cleanup,
    buildProxyRequest: (overrides = {}) => ({
      method: "GET",
      baseUrl: "https://api.github.com",
      endpoint: "/user",
      connectionId: "conn_live",
      headers: {
        accept: "application/json",
      },
      query: {
        per_page: "1",
      },
      ...overrides,
    }),
  };
}

export function bootMockNangoServer(
  options: { baseUrl?: string } = {},
): { cleanup: () => Promise<void>; server: MockNangoServer } {
  const server = createMockNangoServer({
    baseUrl: normalizeBaseUrl(options.baseUrl ?? DEFAULT_TEST_BASE_URL),
  });
  const restoreFetch = installMockFetch(server.fetch.bind(server) as typeof fetch);

  return {
    server,
    cleanup: async () => {
      server.reset();
      restoreFetch();
    },
  };
}

export function installMockFetch(fetchImpl: typeof fetch): () => void {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;

  return () => {
    globalThis.fetch = previousFetch;
  };
}

export function createFetchMock(
  responses: Array<Response | MockResponseSpec> = [],
): FetchMock {
  const queue = [...responses];
  const calls: FetchMockCall[] = [];

  return {
    calls,
    fetch: async (input, init) => {
      const request = input instanceof Request ? new Request(input, init) : new Request(input, init);
      const bodyText = await request.clone().text();

      calls.push({
        url: request.url,
        method: request.method.toUpperCase(),
        headers: new Headers(request.headers),
        ...(bodyText.length === 0 ? {} : { bodyText }),
      });

      const next = queue.shift();
      if (next === undefined) {
        throw new Error(`No mocked fetch response remains for ${request.method.toUpperCase()} ${request.url}.`);
      }

      return next instanceof Response ? next : buildResponse(next);
    },
    queueJson: (body, status = 200, headers = {}) => {
      queue.push({
        status,
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        json: body,
      });
    },
    reset: () => {
      queue.length = 0;
      calls.length = 0;
    },
  };
}

export function createConnectionServiceConfig(
  options: ConnectionServiceConfigOptions,
): NangoConnectionServiceConfig {
  return {
    secretKey: options.secretKey ?? DEFAULT_TEST_SECRET_KEY,
    baseUrl: normalizeBaseUrl(options.baseUrl ?? DEFAULT_TEST_BASE_URL),
    fetch: options.fetch,
  };
}

export async function cleanupProviderHarness(
  harness: Pick<ProviderHarness, "cleanup"> | null | undefined,
): Promise<void> {
  if (!harness) {
    return;
  }

  await harness.cleanup();
}

export function assertProxyResponse(
  response: unknown,
  expected: {
    status: number;
    data: unknown;
    headers?: Record<string, string>;
  },
): void {
  assert.ok(response && typeof response === "object", "proxy() should return an object");

  const actual = response as Record<string, unknown>;
  assert.equal(actual.status, expected.status);
  assert.deepEqual(actual.data, expected.data);
  assert.ok(actual.headers && typeof actual.headers === "object", "proxy() should expose response headers");

  if (expected.headers) {
    for (const [name, value] of Object.entries(expected.headers)) {
      assert.equal((actual.headers as Record<string, unknown>)[name], value);
    }
  }
}

export function assertHealthResult(
  result: unknown,
  expected: {
    ok: boolean;
    status?: NangoConnectionHealthResult["status"];
    reason?: NangoConnectionHealthResult["reason"];
  },
): void {
  if (typeof result === "boolean") {
    assert.equal(result, expected.ok);
    assert.equal(
      expected.status,
      undefined,
      "healthCheck() returned a boolean, so status assertions are not available.",
    );
    assert.equal(
      expected.reason,
      undefined,
      "healthCheck() returned a boolean, so reason assertions are not available.",
    );
    return;
  }

  assert.ok(result && typeof result === "object", "health response should be a boolean or result object");
  const actual = result as NangoConnectionHealthResult;
  assert.equal(actual.ok, expected.ok);

  if (expected.status !== undefined) {
    assert.equal(actual.status, expected.status);
  }

  if (expected.reason !== undefined) {
    assert.equal(actual.reason, expected.reason);
  }
}

export function normalizeConnectionId(connection: object): string | undefined {
  const record = connection as Record<string, unknown>;
  const maybeId = record.connectionId ?? record.connection_id ?? record.id;
  return typeof maybeId === "string" ? maybeId : undefined;
}

export function assertConnectionMetadata(
  connection: object,
  expected: ConnectionMetadataExpectation,
): void {
  const record = connection as Record<string, unknown>;
  assert.equal(normalizeConnectionId(record), expected.id);

  if (expected.provider) {
    assert.equal(record.provider, expected.provider);
  }

  if (expected.providerConfigKey) {
    const actualKey =
      record.providerConfigKey ??
      record.provider_config_key ??
      record.connectionConfigKey ??
      record.connection_config_key;
    assert.equal(actualKey, expected.providerConfigKey);
  }

  if (expected.connectionConfigKey) {
    const actualKey = record.connectionConfigKey ?? record.connection_config_key;
    assert.equal(actualKey, expected.connectionConfigKey);
  }

  if (expected.environment !== undefined) {
    assert.equal(record.environment, expected.environment);
  }

  if (expected.active !== undefined) {
    assert.equal(record.active, expected.active);
  }

  if (expected.activity !== undefined) {
    assert.equal(record.activity, expected.activity);
  }

  if (expected.status !== undefined) {
    assert.equal(record.status, expected.status);
  }

  if (expected.authStatus !== undefined) {
    assert.equal(record.authStatus, expected.authStatus);
  }

  if (expected.syncStatus !== undefined) {
    assert.equal(record.syncStatus, expected.syncStatus);
  }

  if (expected.inactiveReason !== undefined) {
    assert.equal(record.inactiveReason, expected.inactiveReason);
  }

  if (expected.createdAt !== undefined) {
    assert.equal(record.createdAt, expected.createdAt);
  }

  if (expected.updatedAt !== undefined) {
    assert.equal(record.updatedAt, expected.updatedAt);
  }

  if (expected.lastSyncAt !== undefined) {
    assert.equal(record.lastSyncAt, expected.lastSyncAt);
  }

  if (expected.endUserId !== undefined) {
    const endUser = record.endUser as Record<string, unknown> | undefined;
    const actualEndUserId = record.endUserId ?? endUser?.id;
    assert.equal(actualEndUserId, expected.endUserId);
  }

  if (expected.endUserEmail !== undefined) {
    const endUser = record.endUser as Record<string, unknown> | undefined;
    const actualEndUserEmail = record.endUserEmail ?? endUser?.email;
    assert.equal(actualEndUserEmail, expected.endUserEmail);
  }

  if (expected.errorCount !== undefined) {
    const errors = record.errors as unknown[] | undefined;
    const actualErrorCount = record.errorCount ?? errors?.length;
    assert.equal(actualErrorCount, expected.errorCount);
  }
}

export function assertConnectionResponse(
  connection: unknown,
  expected: ConnectionResponseExpectation,
): void {
  assert.ok(connection && typeof connection === "object", "connection response should be an object");

  const actual = connection as NangoConnection;
  assertConnectionMetadata(actual, expected.metadata);
  assertConnectionMetadata(actual.connectionMetadata, expected.metadata);

  if (expected.recordMetadata !== undefined) {
    assert.deepEqual(actual.metadata, expected.recordMetadata);
  }

  if (expected.endUser !== undefined) {
    assert.deepEqual(actual.endUser, expected.endUser);
  }

  if (expected.credentials !== undefined) {
    assert.ok(actual.credentials, "connection response should include credentials");

    if ("status" in expected.credentials) {
      assert.equal(actual.credentials.status, expected.credentials.status);
    }

    if ("type" in expected.credentials) {
      assert.equal(actual.credentials.type, expected.credentials.type);
    }

    if ("expiresAt" in expected.credentials) {
      assert.equal(actual.credentials.expiresAt, expected.credentials.expiresAt);
    }

    if ("raw" in expected.credentials) {
      assert.deepEqual(actual.credentials.raw, expected.credentials.raw);
    }
  }

  if (expected.errors !== undefined) {
    assert.deepEqual(
      actual.errors.map((error) => ({
        ...(error.code === undefined ? {} : { code: error.code }),
        message: error.message,
      })),
      expected.errors,
    );
  }
}

export function assertConnectionDetailResponse(
  result: NangoConnectionDetailResult,
  expected: ConnectionResponseExpectation & {
    raw?: NangoConnectionDetailResult["raw"];
  },
): void {
  assert.ok(result.connection, "detail result should include a normalized connection");
  assert.ok(result.connectionMetadata, "detail result should include normalized connection metadata");
  assertConnectionResponse(result.connection, expected);
  assertConnectionMetadata(result.connectionMetadata, expected.metadata);

  if ("raw" in expected) {
    assert.deepEqual(result.raw, expected.raw);
  }
}

export function findRefreshCalls(server: MockNangoServer, connectionId: string): MockNangoCall[] {
  return [
    ...server.callsFor("POST", `/connection/${connectionId}/refresh`),
    ...server.callsFor("POST", `/connections/${connectionId}/refresh`),
    ...server.callsFor("POST", "/refresh"),
  ];
}

async function loadNangoProviderCtor(): Promise<ProviderCtor> {
  const failures: string[] = [];

  for (const candidate of PROVIDER_CANDIDATES) {
    try {
      const moduleUrl = new URL(candidate, import.meta.url);
      const loaded = (await import(moduleUrl.href)) as Record<string, unknown>;
      if (typeof loaded.NangoProvider === "function") {
        return loaded.NangoProvider as ProviderCtor;
      }
    } catch (error) {
      failures.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(
    `Unable to load NangoProvider from local sources. Checked: ${PROVIDER_CANDIDATES.join(", ")}. ${failures.join(" | ")}`,
  );
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function buildResponse(spec: MockResponseSpec): Response {
  const status = spec.status ?? 200;
  const headers = new Headers(spec.headers);

  if (spec.json !== undefined) {
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    return new Response(JSON.stringify(spec.json), { status, headers });
  }

  return new Response(spec.text ?? "", { status, headers });
}
