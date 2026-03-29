import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractNangoConnectionMetadata,
  getNangoConnectionDetail,
  getNangoConnection,
  listNangoConnections,
  normalizeNangoConnection
} from "../connections.js";
import type { NangoConnectionRecord } from "../types.js";
import { buildConnection, buildConnectionListResponse } from "./fixtures/nango-responses.js";
import {
  assertConnectionDetailResponse,
  assertConnectionResponse,
  createConnectionServiceConfig,
} from "./helpers/test-utils.js";
import { createMockNangoServer } from "./mock-nango.js";

describe("listNangoConnections", () => {
  it("lists active connections by default and preserves useful metadata", async () => {
    const server = createMockNangoServer({ baseUrl: "https://api.nango.test" });
    const config = createConnectionServiceConfig({
      baseUrl: server.baseUrl,
      fetch: server.fetch,
      secretKey: "test-secret",
    });
    server.json(
      "GET",
      "/connections",
      buildConnectionListResponse([
        buildConnection({
          connection_id: "conn_active",
          environment: "prod",
          status: "ACTIVE",
          sync_status: "OK",
          last_sync_date: "2026-03-28T10:06:00.000Z",
          end_user: {
            id: "user_123",
            email: "octocat@example.com",
            name: "Octo Cat"
          },
          credentials: {
            status: "AUTHORIZED",
            type: "OAUTH2",
            expires_at: "2026-03-29T10:05:00.000Z"
          },
          metadata: {
            accountName: "octocat",
            workspaceId: "workspace_test",
            plan: "enterprise"
          }
        }),
        buildConnection({
          connection_id: "conn_revoked",
          status: "REVOKED",
          errors: [{ code: "token_revoked", message: "Refresh token revoked" }]
        })
      ])
    );

    const result = await listNangoConnections(
      config,
      { providerConfigKey: "github" }
    );

    assert.equal(result.connections.length, 1);
    assert.equal(result.activeConnections.length, 1);
    assert.equal(result.inactiveConnections.length, 1);
    assert.deepEqual(result.connectionMetadata.map((item) => item.connectionId), ["conn_active"]);
    assert.deepEqual(result.activeConnectionMetadata.map((item) => item.connectionId), ["conn_active"]);
    assert.deepEqual(result.inactiveConnectionMetadata.map((item) => item.connectionId), ["conn_revoked"]);

    const [connection] = result.connections;
    assertConnectionResponse(connection, {
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
        lastSyncAt: "2026-03-28T10:06:00.000Z",
        endUserId: "user_123",
        endUserEmail: "octocat@example.com",
        errorCount: 0
      },
      recordMetadata: {
        accountName: "octocat",
        workspaceId: "workspace_test",
        plan: "enterprise"
      },
      endUser: {
        id: "user_123",
        displayName: "Octo Cat",
        email: "octocat@example.com",
        metadata: {}
      },
      credentials: {
        status: "AUTHORIZED",
        type: "OAUTH2",
        expiresAt: "2026-03-29T10:05:00.000Z",
        raw: {
          status: "AUTHORIZED",
          expires_at: "2026-03-29T10:05:00.000Z",
          type: "OAUTH2"
        }
      },
      errors: []
    });

    const [call] = server.callsFor("GET", "/connections");
    assert.ok(call);
    assert.deepEqual(call.searchParams.provider_config_key, ["github"]);
  });

  it("ignores inactive connections in the default result while still flagging them separately", async () => {
    const server = createMockNangoServer({ baseUrl: "https://api.nango.test" });
    const config = createConnectionServiceConfig({
      baseUrl: server.baseUrl,
      fetch: server.fetch,
      secretKey: "test-secret",
    });
    server.json(
      "GET",
      "/connections",
      buildConnectionListResponse([
        buildConnection({ connection_id: "conn_active", status: "ACTIVE" }),
        buildConnection({
          connection_id: "conn_expired",
          status: "EXPIRED",
          errors: [{ code: "token_expired", message: "Access token expired" }]
        })
      ])
    );

    const result = await listNangoConnections(
      config,
      { providerConfigKey: "github" }
    );

    assert.deepEqual(
      result.connections.map((connection) => connection.connectionId),
      ["conn_active"]
    );
    assert.equal(result.inactiveConnections.length, 1);
    assert.equal(result.inactiveConnections[0]?.connectionId, "conn_expired");
    assert.equal(result.inactiveConnections[0]?.active, false);
    assert.equal(result.inactiveConnections[0]?.activity, "inactive");
    assert.equal(result.inactiveConnections[0]?.inactiveReason, "Access token expired");
  });

  it("includes inactive connections when activeOnly is false", async () => {
    const server = createMockNangoServer({ baseUrl: "https://api.nango.test" });
    const config = createConnectionServiceConfig({
      baseUrl: server.baseUrl,
      fetch: server.fetch,
      secretKey: "test-secret",
    });
    server.json(
      "GET",
      "/connections",
      buildConnectionListResponse([
        buildConnection({ connection_id: "conn_active", status: "ACTIVE" }),
        buildConnection({
          connection_id: "conn_disabled",
          status: "DISABLED",
          errors: [{ message: "Connection disabled upstream" }]
        })
      ])
    );

    const result = await listNangoConnections(
      config,
      { providerConfigKey: "github", activeOnly: false }
    );

    assert.deepEqual(
      result.connections.map((connection) => connection.connectionId),
      ["conn_active", "conn_disabled"]
    );
    assert.equal(result.inactiveConnections[0]?.inactiveReason, "Connection disabled upstream");
  });

  it("returns empty result sets cleanly", async () => {
    const server = createMockNangoServer({ baseUrl: "https://api.nango.test" });
    const config = createConnectionServiceConfig({
      baseUrl: server.baseUrl,
      fetch: server.fetch,
      secretKey: "test-secret",
    });
    server.json("GET", "/connections", buildConnectionListResponse([]));

    const result = await listNangoConnections(
      config,
      { providerConfigKey: "github", activeOnly: false }
    );

    assert.deepEqual(result, {
      connections: [],
      activeConnections: [],
      inactiveConnections: [],
      connectionMetadata: [],
      activeConnectionMetadata: [],
      inactiveConnectionMetadata: [],
      nextCursor: undefined,
      raw: {
        connections: [],
        total: 0
      }
    });
  });
});

describe("getNangoConnection", () => {
  it("returns a typed detail result with reusable connection metadata", async () => {
    const server = createMockNangoServer({ baseUrl: "https://api.nango.test" });
    const config = createConnectionServiceConfig({
      baseUrl: server.baseUrl,
      fetch: server.fetch,
      secretKey: "test-secret",
    });
    server.json(
      "GET",
      "/connections/conn_detail",
      {
        data: buildConnection({
          connection_id: "conn_detail",
          environment: "prod",
          status: "ACTIVE",
          auth_status: "AUTHORIZED",
          sync_status: "OK"
        })
      }
    );

    const detail = await getNangoConnectionDetail(
      config,
      "conn_detail",
      { providerConfigKey: "github" }
    );

    assertConnectionDetailResponse(detail, {
      metadata: {
        id: "conn_detail",
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
        endUserId: "user_123",
        endUserEmail: "octocat@example.com",
        errorCount: 0
      },
      recordMetadata: {
        accountName: "octocat",
        workspaceId: "workspace_test"
      },
      endUser: {
        id: "user_123",
        displayName: "Octo Cat",
        email: "octocat@example.com",
        metadata: {}
      },
      credentials: {
        status: "AUTHORIZED",
        type: "OAUTH2",
        expiresAt: "2026-03-29T10:05:00.000Z",
        raw: {
          status: "AUTHORIZED",
          type: "OAUTH2",
          expires_at: "2026-03-29T10:05:00.000Z"
        }
      },
      errors: [],
      raw: {
        data: {
          connection_id: "conn_detail",
          environment: "prod",
          status: "ACTIVE",
          auth_status: "AUTHORIZED",
          sync_status: "OK",
          id: "conn_detail",
          provider: "github",
          provider_config_key: "github",
          connection_config_key: "github",
          auth_mode: "OAUTH2",
          created_at: "2026-03-28T10:00:00.000Z",
          updated_at: "2026-03-28T10:05:00.000Z",
          end_user: {
            id: "user_123",
            email: "octocat@example.com",
            name: "Octo Cat"
          },
          credentials: {
            status: "AUTHORIZED",
            type: "OAUTH2",
            expires_at: "2026-03-29T10:05:00.000Z"
          },
          errors: [],
          metadata: {
            accountName: "octocat",
            workspaceId: "workspace_test"
          }
        }
      }
    });
  });

  it("looks up a single connection and normalizes the returned metadata", async () => {
    const server = createMockNangoServer({ baseUrl: "https://api.nango.test" });
    const config = createConnectionServiceConfig({
      baseUrl: server.baseUrl,
      fetch: server.fetch,
      secretKey: "test-secret",
    });
    server.json(
      "GET",
      "/connections/conn_live",
      {
        data: buildConnection({
          connection_id: "conn_live",
          environment: "prod",
          status: "ACTIVE",
          auth_status: "AUTHORIZED",
          sync_status: "OK",
          credentials: {
            type: "OAUTH2"
          },
          end_user: {
            id: "user_123",
            email: "octocat@example.com"
          }
        })
      }
    );

    const connection = await getNangoConnection(
      config,
      "conn_live",
      { providerConfigKey: "github" }
    );

    assertConnectionResponse(connection, {
      metadata: {
        id: "conn_live",
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
        endUserId: "user_123",
        endUserEmail: "octocat@example.com",
        errorCount: 0
      },
      recordMetadata: {
        accountName: "octocat",
        workspaceId: "workspace_test"
      },
      endUser: {
        id: "user_123",
        displayName: undefined,
        email: "octocat@example.com",
        metadata: {}
      },
      credentials: {
        status: undefined,
        type: "OAUTH2",
        expiresAt: undefined,
        raw: {
          type: "OAUTH2"
        }
      },
      errors: []
    });
  });

  it("annotates explicitly inactive detail payloads even when Nango omits status text", async () => {
    const server = createMockNangoServer({ baseUrl: "https://api.nango.test" });
    const config = createConnectionServiceConfig({
      baseUrl: server.baseUrl,
      fetch: server.fetch,
      secretKey: "test-secret",
    });
    server.json(
      "GET",
      "/connections/conn_inactive",
      {
        connection: buildConnection({
          connection_id: "conn_inactive",
          active: false,
          status: "",
          credentials: {},
          errors: []
        })
      }
    );

    const connection = await getNangoConnection(
      config,
      "conn_inactive",
      { providerConfigKey: "github" }
    );

    assertConnectionResponse(connection, {
      metadata: {
        id: "conn_inactive",
        provider: "github",
        providerConfigKey: "github",
        connectionConfigKey: "github",
        active: false,
        activity: "inactive",
        inactiveReason: "inactive",
        createdAt: "2026-03-28T10:00:00.000Z",
        updatedAt: "2026-03-28T10:05:00.000Z",
        endUserId: "user_123",
        endUserEmail: "octocat@example.com",
        errorCount: 0
      },
      recordMetadata: {
        accountName: "octocat",
        workspaceId: "workspace_test"
      },
      endUser: {
        id: "user_123",
        displayName: "Octo Cat",
        email: "octocat@example.com",
        metadata: {}
      },
      credentials: {
        status: undefined,
        type: undefined,
        expiresAt: undefined,
        raw: {}
      },
      errors: []
    });
  });

  it("returns null when the connection is not found on either supported detail endpoint", async () => {
    const server = createMockNangoServer({ baseUrl: "https://api.nango.test" });
    const config = createConnectionServiceConfig({
      baseUrl: server.baseUrl,
      fetch: server.fetch,
      secretKey: "test-secret",
    });
    server.error("GET", "/connections/conn_missing", 404, { error: "missing" });
    server.error("GET", "/connections/conn_missing", 404, { error: "missing" });
    server.error("GET", "/connection/conn_missing", 404, { error: "missing" });
    server.error("GET", "/connection/conn_missing", 404, { error: "missing" });

    const detail = await getNangoConnectionDetail(
      config,
      "conn_missing",
      { providerConfigKey: "github" }
    );
    const connection = await getNangoConnection(
      config,
      "conn_missing",
      { providerConfigKey: "github" }
    );

    assert.deepEqual(detail, {
      connection: null,
      connectionMetadata: null,
      raw: null
    });
    assert.equal(connection, null);
    assert.equal(server.callsFor("GET", "/connections/conn_missing").length, 2);
    assert.equal(server.callsFor("GET", "/connection/conn_missing").length, 2);
  });
});

describe("extractNangoConnectionMetadata", () => {
  it("reuses the normalized connection metadata for inactive connections", () => {
    const normalized = normalizeNangoConnection(
      buildConnection({
        connection_id: "conn_problem",
        status: "FAILED",
        sync_status: "WARNING",
        errors: [{ code: "sync_failed", message: "Last sync failed" }]
      }) as NangoConnectionRecord
    );

    assert.ok(normalized);
    const metadata = extractNangoConnectionMetadata(normalized);

    assert.deepEqual(metadata, normalized.connectionMetadata);
    assert.equal(metadata.activity, "inactive");
    assert.equal(metadata.active, false);
    assert.equal(metadata.errorCount, 1);
    assert.equal(metadata.inactiveReason, "Last sync failed");
  });
});
