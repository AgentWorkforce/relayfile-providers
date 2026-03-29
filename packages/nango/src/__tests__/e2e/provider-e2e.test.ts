import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import type { NangoConnection } from "../../types.js";
import {
  assertConnectionResponse,
  assertProxyResponse,
  cleanupProviderHarness,
  createProviderHarness,
  findRefreshCalls,
  type ProviderHarness,
} from "../helpers/test-utils.js";
import {
  buildConnection,
  buildConnectionListResponse,
  buildExpiredTokenProxyFailure,
  buildInactiveConnection,
  buildProxySuccessResponse,
  buildRefreshSuccessResponse,
  buildTerminalProxyFailure,
} from "../fixtures/nango-responses.js";
import {
  buildAuthConnectionWebhook,
  buildSyncCompletedWebhook,
} from "../fixtures/nango-webhooks.js";

describe("NangoProvider E2E", () => {
  let harness: ProviderHarness | undefined;

  beforeEach(async () => {
    harness = await createProviderHarness({
      baseUrl: "https://api.nango.test",
      providerConfigKey: "github",
      secretKey: "test-secret-key",
    });
  });

  afterEach(async () => {
    await cleanupProviderHarness(harness);
    harness = undefined;
  });

  it("proxies a request through the shared mock server and preserves the response envelope", async () => {
    harness!.server.register(
      "POST",
      "/proxy",
      buildProxySuccessResponse({
        status: 200,
        data: {
          login: "octocat",
          id: 1,
        },
        headers: {
          "x-request-id": "req_e2e_123",
        },
      }),
    );

    const response = await harness!.provider.proxy!(
      harness!.buildProxyRequest({
        method: "PATCH",
        endpoint: "/repos/octocat/hello-world/issues/1",
        headers: {
          accept: "application/json",
          "x-github-api-version": "2022-11-28",
        },
        body: {
          title: "Relayfile E2E issue update",
        },
        query: {
          per_page: "1",
          state: "open",
        },
      }),
    );

    assertProxyResponse(response, {
      status: 200,
      data: {
        login: "octocat",
        id: 1,
      },
      headers: {
        "x-request-id": "req_e2e_123",
      },
    });

    const [proxyCall] = harness!.server.callsFor("POST", "/proxy");
    assert.ok(proxyCall, "proxy request should be captured by the shared mock server");
    assert.equal(proxyCall.headers.authorization, "Bearer test-secret-key");
    assert.equal(proxyCall.headers["connection-id"], "conn_live");
    assert.equal(proxyCall.headers["provider-config-key"], "github");
    assert.deepEqual(
      harness!.server.getCalls().map((call) => `${call.method} ${call.path}`),
      ["POST /proxy"],
    );
    assert.deepEqual(proxyCall.jsonBody, {
      method: "PATCH",
      baseUrlOverride: "https://api.github.com",
      endpoint: "/repos/octocat/hello-world/issues/1",
      headers: {
        accept: "application/json",
        "x-github-api-version": "2022-11-28",
      },
      data: {
        title: "Relayfile E2E issue update",
      },
      params: {
        per_page: "1",
        state: "open",
      },
    });
  });

  it("refreshes and retries proxy requests after an expired-token failure", async () => {
    harness!.server.register("POST", "/proxy", buildExpiredTokenProxyFailure());
    harness!.server.register(
      "POST",
      "/connection/conn_live/refresh",
      buildRefreshSuccessResponse({ connectionId: "conn_live" }),
    );
    harness!.server.register(
      "POST",
      "/proxy",
      buildProxySuccessResponse({
        data: {
          login: "octocat",
          refreshed: true,
        },
        headers: {
          "x-proxy-attempt": "retry",
        },
      }),
    );

    const request = harness!.buildProxyRequest({
      method: "PATCH",
      endpoint: "/repos/octocat/hello-world/issues/1",
      headers: {
        accept: "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: {
        title: "Refresh and retry",
      },
      query: {
        per_page: "1",
        state: "open",
      },
    });

    const response = await harness!.provider.proxy!(request);

    assertProxyResponse(response, {
      status: 200,
      data: {
        login: "octocat",
        refreshed: true,
      },
      headers: {
        "x-proxy-attempt": "retry",
      },
    });

    const proxyCalls = harness!.server.callsFor("POST", "/proxy");
    const [refreshCall] = findRefreshCalls(harness!.server, "conn_live");

    assert.equal(proxyCalls.length, 2);
    assert.ok(refreshCall, "refresh route should be hit after the expired-token failure");
    assert.equal(refreshCall.headers.authorization, "Bearer test-secret-key");
    assert.deepEqual(refreshCall.searchParams.provider_config_key, ["github"]);
    assert.deepEqual(
      harness!.server.getCalls().map((call) => `${call.method} ${call.path}`),
      [
        "POST /proxy",
        "POST /connection/conn_live/refresh",
        "POST /proxy",
      ],
    );
    assert.deepEqual(proxyCalls.map((call) => call.jsonBody), [
      {
        method: "PATCH",
        baseUrlOverride: "https://api.github.com",
        endpoint: "/repos/octocat/hello-world/issues/1",
        headers: {
          accept: "application/json",
          "x-github-api-version": "2022-11-28",
        },
        data: {
          title: "Refresh and retry",
        },
        params: {
          per_page: "1",
          state: "open",
        },
      },
      {
        method: "PATCH",
        baseUrlOverride: "https://api.github.com",
        endpoint: "/repos/octocat/hello-world/issues/1",
        headers: {
          accept: "application/json",
          "x-github-api-version": "2022-11-28",
        },
        data: {
          title: "Refresh and retry",
        },
        params: {
          per_page: "1",
          state: "open",
        },
      },
    ]);
  });

  it("returns the retried terminal proxy failure when refresh cannot recover", async () => {
    harness!.server.register("POST", "/proxy", buildExpiredTokenProxyFailure());
    harness!.server.register(
      "POST",
      "/connection/conn_live/refresh",
      buildRefreshSuccessResponse({ connectionId: "conn_live" }),
    );
    harness!.server.register(
      "POST",
      "/proxy",
      buildTerminalProxyFailure({
        headers: {
          "x-proxy-attempt": "retry",
        },
      }),
    );

    const request = harness!.buildProxyRequest({
      method: "DELETE",
      endpoint: "/repos/octocat/hello-world/issues/1",
      headers: {
        accept: "application/json",
      },
    });

    const response = await harness!.provider.proxy!(request);

    assertProxyResponse(response, {
      status: 403,
      data: {
        error: {
          code: "permission_denied",
          message: "The upstream provider rejected the request",
        },
      },
      headers: {
        "x-proxy-attempt": "retry",
      },
    });

    const proxyCalls = harness!.server.callsFor("POST", "/proxy");

    assert.equal(proxyCalls.length, 2);
    assert.equal(findRefreshCalls(harness!.server, "conn_live").length, 1);
    assert.deepEqual(
      harness!.server.getCalls().map((call) => `${call.method} ${call.path}`),
      [
        "POST /proxy",
        "POST /connection/conn_live/refresh",
        "POST /proxy",
      ],
    );
    assert.deepEqual(proxyCalls.map((call) => call.jsonBody), [
      {
        method: "DELETE",
        baseUrlOverride: "https://api.github.com",
        endpoint: "/repos/octocat/hello-world/issues/1",
        headers: {
          accept: "application/json",
        },
        params: {
          per_page: "1",
        },
      },
      {
        method: "DELETE",
        baseUrlOverride: "https://api.github.com",
        endpoint: "/repos/octocat/hello-world/issues/1",
        headers: {
          accept: "application/json",
        },
        params: {
          per_page: "1",
        },
      },
    ]);
  });

  it("returns actionable terminal proxy failures without throwing", async () => {
    harness!.server.register("POST", "/proxy", buildTerminalProxyFailure());

    const response = await harness!.provider.proxy!(
      harness!.buildProxyRequest({
        method: "DELETE",
        endpoint: "/repos/octocat/hello-world/issues/1",
      }),
    );

    assertProxyResponse(response, {
      status: 403,
      data: {
        error: {
          code: "permission_denied",
          message: "The upstream provider rejected the request",
        },
      },
    });
    assert.equal(harness!.server.callsFor("POST", "/proxy").length, 1);
  });

  it("normalizes webhook payloads through handleWebhook()", async () => {
    const authWebhook = buildAuthConnectionWebhook({
      connectionId: "conn_auth_live",
      connection_id: "conn_auth_live",
    });
    const syncWebhook = buildSyncCompletedWebhook({
      connectionId: "conn_sync_live",
      connection_id: "conn_sync_live",
      provider: "github",
    });

    const normalizedAuth = await harness!.provider.handleWebhook!(authWebhook);
    const normalizedSync = await harness!.provider.handleWebhook!(syncWebhook);

    assert.deepEqual(normalizedAuth, {
      provider: "github",
      connectionId: "conn_auth_live",
      eventType: "connection.refreshed",
      objectType: "connection",
      objectId: "conn_auth_live",
      payload: {
        from: "nango",
        provider: "github",
        providerConfigKey: "github",
        authMode: "OAUTH2",
        environment: "prod",
        operation: "refresh",
        success: true,
        tags: {
          workspaceId: "ws_123",
        },
        endUser: {
          externalId: "user_123",
        },
        error: {},
        rawPayload: authWebhook,
      },
    });
    assert.deepEqual(normalizedSync, {
      provider: "github",
      connectionId: "conn_sync_live",
      eventType: "sync.completed",
      objectType: "sync",
      objectId: "conn_sync_live:issues",
      payload: {
        from: "nango",
        providerConfigKey: "github",
        syncName: "issues",
        syncVariant: "default",
        model: "issue",
        syncType: "INCREMENTAL",
        stage: "completed",
        success: true,
        modifiedAfter: "2026-03-28T10:05:00.000Z",
        responseResults: {
          added: 2,
          updated: 1,
          deleted: 0,
        },
        checkpoints: {
          cursor: "page_1",
        },
        error: {},
        startedAt: null,
        failedAt: null,
        rawPayload: syncWebhook,
      },
    });
  });

  it("reports healthy and unhealthy connections through healthCheck()", async () => {
    harness!.server.json(
      "GET",
      "/connection/conn_active",
      buildConnection({
        connection_id: "conn_active",
        status: "ACTIVE",
        credentials: {
          status: "AUTHORIZED",
          type: "OAUTH2",
        },
      }),
    );
    harness!.server.json(
      "GET",
      "/connection/conn_revoked",
      buildInactiveConnection({
        connection_id: "conn_revoked",
        credentials: {
          status: "REVOKED",
          type: "OAUTH2",
        },
      }),
    );

    const active = await harness!.provider.healthCheck("conn_active");
    const revoked = await harness!.provider.healthCheck("conn_revoked");

    assert.equal(active, true);
    assert.equal(revoked, false);
    assert.equal(harness!.server.callsFor("GET", "/connection/conn_active").length, 1);
    assert.equal(harness!.server.callsFor("GET", "/connection/conn_revoked").length, 1);
  });

  it("lists adapter-usable connection metadata from shared fixtures", async () => {
    harness!.server.json(
      "GET",
      "/connections",
      buildConnectionListResponse([
        buildConnection({
          connection_id: "conn_active",
          status: "ACTIVE",
          environment: "prod",
          sync_status: "OK",
          metadata: {
            accountName: "octocat",
            workspaceId: "workspace_active",
          },
          end_user: {
            id: "user_active",
            email: "octocat@example.com",
            name: "Octo Cat",
          },
        }),
        buildInactiveConnection({
          connection_id: "conn_revoked",
          metadata: {
            accountName: "revoked-octocat",
            workspaceId: "workspace_revoked",
          },
          errors: [
            {
              code: "token_revoked",
              message: "Refresh token revoked",
            },
          ],
        }),
      ]),
    );

    const connections = (await harness!.provider.listConnections!({
      activeOnly: false,
    })) as NangoConnection[];

    assert.equal(connections.length, 2);

    const active = connections.find((connection) => connection.connectionId === "conn_active");
    const revoked = connections.find((connection) => connection.connectionId === "conn_revoked");

    assertConnectionResponse(active, {
      metadata: {
        id: "conn_active",
        provider: "github",
        providerConfigKey: "github",
        connectionConfigKey: "github",
        environment: "prod",
        active: true,
        activity: "active",
        status: "ACTIVE",
        authStatus: "AUTHORIZED",
        syncStatus: "OK",
        createdAt: "2026-03-28T10:00:00.000Z",
        updatedAt: "2026-03-28T10:05:00.000Z",
        endUserId: "user_active",
        endUserEmail: "octocat@example.com",
        errorCount: 0,
      },
      recordMetadata: {
        accountName: "octocat",
        workspaceId: "workspace_active",
      },
      endUser: {
        id: "user_active",
        displayName: "Octo Cat",
        email: "octocat@example.com",
        metadata: {},
      },
      errors: [],
    });

    assertConnectionResponse(revoked, {
      metadata: {
        id: "conn_revoked",
        provider: "github",
        providerConfigKey: "github",
        connectionConfigKey: "github",
        active: false,
        activity: "inactive",
        status: "REVOKED",
        authStatus: "REVOKED",
        syncStatus: "STOPPED",
        inactiveReason: "Refresh token revoked",
        createdAt: "2026-03-28T10:00:00.000Z",
        updatedAt: "2026-03-28T10:05:00.000Z",
        endUserId: "user_123",
        endUserEmail: "octocat@example.com",
        errorCount: 1,
      },
      recordMetadata: {
        accountName: "revoked-octocat",
        workspaceId: "workspace_revoked",
      },
      errors: [
        {
          code: "token_revoked",
          message: "Refresh token revoked",
        },
      ],
    });

    const [connectionsCall] = harness!.server.callsFor("GET", "/connections");
    assert.ok(connectionsCall, "listConnections should hit the shared /connections route");
    assert.deepEqual(connectionsCall.searchParams.provider_config_key, ["github"]);
  });
});
