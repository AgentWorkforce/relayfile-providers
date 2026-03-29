import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_NANGO_BASE_URL,
  NangoConfigurationError,
  NangoConnectionError,
  NangoProvider,
  NangoProviderError,
  NangoProxyConfigError,
  NangoProxyError,
  NangoProxyFailureError,
  NangoProxyTransportError,
  NangoRefreshHttpError,
  NangoRefreshNetworkError,
  NangoRefreshRejectedError,
  NangoRefreshResponseError,
  NangoWebhookError,
  createNangoProvider,
} from "../index.js";
import type {
  ConnectionProvider,
  NangoConnection,
  NangoListConnectionsOptions,
  NangoProviderConfig,
  NormalizedWebhook,
  ProxyRequest,
  ProxyResponse,
} from "../index.js";

test("constructor applies scaffold defaults and exposes the exported provider name", () => {
  const provider = createNangoProvider({
    secretKey: " test_secret ",
    providerConfigKey: " github ",
  });

  assert.ok(provider instanceof NangoProvider);
  assert.equal(provider.name, "nango");
  assert.equal(provider.baseUrl, DEFAULT_NANGO_BASE_URL);
  assert.equal(provider.config.secretKey, "test_secret");
  assert.equal(provider.providerConfigKey, "github");
});

test("constructor rejects an empty secretKey", () => {
  assert.throws(() => createNangoProvider({ secretKey: "   " }), NangoConfigurationError);
});

test("provider scaffold exposes proxy, healthCheck, handleWebhook, getConnection, and listConnections", () => {
  const provider = createNangoProvider({ secretKey: "test_secret" });

  assert.equal(typeof provider.proxy, "function");
  assert.equal(typeof provider.healthCheck, "function");
  assert.equal(typeof provider.handleWebhook, "function");
  assert.equal(typeof provider.getConnection, "function");
  assert.equal(typeof provider.getConnectionDetail, "function");
  assert.equal(typeof provider.listConnectionDetails, "function");
  assert.equal(typeof provider.listConnections, "function");
});

test("src/index.ts resolves the public provider types", () => {
  const provider = createNangoProvider({ secretKey: "test_secret" });
  const typedProvider: ConnectionProvider = provider;
  const typedConfig: NangoProviderConfig = { secretKey: "test_secret" };
  const typedRequest: ProxyRequest = {
    method: "GET",
    baseUrl: "https://api.github.com",
    endpoint: "/user",
    connectionId: "conn_123",
  };
  const typedResponse: ProxyResponse = {
    status: 200,
    headers: {},
    data: null,
  };
  const typedWebhook: NormalizedWebhook = {
    provider: "github",
    connectionId: "conn_123",
    eventType: "sync.completed",
    objectType: "issue",
    objectId: "issue_123",
    payload: {},
  };
  const typedOptions: NangoListConnectionsOptions = {
    providerConfigKey: "github",
    includeInactive: true,
  };
  const typedConnection: NangoConnection = {
    connectionId: "conn_123",
    provider: "github",
    providerConfigKey: "github",
    connectionConfigKey: "github",
    environment: "prod",
    active: true,
    activity: "active",
    connectionMetadata: {
      connectionId: "conn_123",
      provider: "github",
      providerConfigKey: "github",
      connectionConfigKey: "github",
      environment: "prod",
      active: true,
      activity: "active",
      errorCount: 0,
    },
    metadata: {},
    errors: [],
    raw: {
      id: "conn_123",
    },
  };

  assert.equal(typedProvider.name, "nango");
  assert.equal(typedConfig.secretKey, "test_secret");
  assert.equal(typedRequest.connectionId, "conn_123");
  assert.equal(typedResponse.status, 200);
  assert.equal(typedWebhook.eventType, "sync.completed");
  assert.equal(typedOptions.providerConfigKey, "github");
  assert.equal(typedConnection.connectionId, "conn_123");
});

test("src/index.ts resolves the exported error classes", () => {
  const endpoint = "https://api.nango.dev/connection/conn_123/refresh";
  const providerError = new NangoProviderError("provider failed");
  const configurationError = new NangoConfigurationError("bad config");
  const proxyError = new NangoProxyError("proxy failed", {
    status: 502,
    endpoint: "/proxy",
    connectionId: "conn_123",
  });
  const proxyConfigError = new NangoProxyConfigError("missing providerConfigKey");
  const proxyFailureError = new NangoProxyFailureError(
    {
      status: 502,
      headers: {},
      data: { error: "upstream failure" },
    },
    {
      endpoint: "/proxy",
      connectionId: "conn_123",
    },
  );
  const proxyTransportError = new NangoProxyTransportError(
    "https://api.nango.dev/proxy",
    new Error("timeout"),
  );
  const connectionError = new NangoConnectionError("connection failed", "conn_123");
  const webhookError = new NangoWebhookError("webhook failed", { payload: { type: "sync" } });
  const refreshHttpError = new NangoRefreshHttpError(endpoint, 500, { error: "upstream failure" });
  const refreshNetworkError = new NangoRefreshNetworkError(endpoint, new Error("network down"));
  const refreshRejectedError = new NangoRefreshRejectedError(endpoint, { provider: "github" });
  const refreshResponseError = new NangoRefreshResponseError(endpoint, { ok: false });

  assert.ok(providerError instanceof Error);
  assert.ok(configurationError instanceof NangoProviderError);
  assert.ok(proxyError instanceof NangoProviderError);
  assert.ok(proxyConfigError instanceof NangoConfigurationError);
  assert.ok(proxyFailureError instanceof NangoProxyError);
  assert.ok(proxyTransportError instanceof NangoProxyError);
  assert.ok(connectionError instanceof NangoProviderError);
  assert.ok(webhookError instanceof NangoProviderError);
  assert.ok(refreshHttpError instanceof NangoProviderError);
  assert.ok(refreshNetworkError instanceof NangoProviderError);
  assert.ok(refreshRejectedError instanceof NangoProviderError);
  assert.ok(refreshResponseError instanceof NangoProviderError);
});
