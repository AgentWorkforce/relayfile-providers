import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateConnectionHealth,
  getConnectionHealth,
  healthCheckNangoConnection,
} from "../health.js";
import { assertHealthResult, createFetchMock } from "./helpers/test-utils.js";

const BASE_CONFIG = {
  secretKey: "secret-key",
  baseUrl: "https://nango.example",
  providerConfigKey: "github",
} as const;

test("healthy active connection", async () => {
  const fetchMock = createFetchMock();
  const connection = {
    id: "conn-active",
    active: true,
    auth_status: "active",
    sync_status: "success",
    provider_config_key: "github",
  };

  fetchMock.queueJson(connection);
  fetchMock.queueJson(connection);

  const ok = await healthCheckNangoConnection("conn-active", {
    ...BASE_CONFIG,
    fetch: fetchMock.fetch,
  });
  const result = await getConnectionHealth("conn-active", {
    ...BASE_CONFIG,
    fetch: fetchMock.fetch,
  });

  assert.equal(ok, true);
  assertHealthResult(result, {
    ok: true,
    status: "healthy",
    reason: "active",
  });
  assert.equal(result.details.connectionState, null);
  assert.equal(result.details.authState, "active");
  assert.equal(result.details.syncState, "success");
  assert.equal(
    result.details.endpoint,
    "https://nango.example/connection/conn-active?provider_config_key=github",
  );
  assert.equal(result.connection?.id, "conn-active");
  assert.equal(fetchMock.calls.length, 2);
  assert.equal(fetchMock.calls[0]?.headers.get("authorization"), "Bearer secret-key");
});

test("expired or revoked connection", async () => {
  const scenarios = [
    {
      connectionId: "conn-expired",
      payload: {
        id: "conn-expired",
        auth_status: "active",
        expires_at: "2020-01-01T00:00:00.000Z",
      },
      expectedReason: "expired_auth" as const,
      messagePattern: /expired/i,
    },
    {
      connectionId: "conn-revoked",
      payload: {
        id: "conn-revoked",
        auth_status: "revoked",
      },
      expectedReason: "revoked_auth" as const,
      messagePattern: /revoked/i,
    },
  ];

  for (const scenario of scenarios) {
    const fetchMock = createFetchMock();
    fetchMock.queueJson(scenario.payload);

    const result = await getConnectionHealth(scenario.connectionId, {
      ...BASE_CONFIG,
      fetch: fetchMock.fetch,
    });

    assertHealthResult(result, {
      ok: false,
      status: "failed",
      reason: scenario.expectedReason,
    });
    assert.match(result.message, scenario.messagePattern);
    assert.equal(result.details.endpoint, `https://nango.example/connection/${scenario.connectionId}?provider_config_key=github`);
    assert.equal(fetchMock.calls.length, 1);
  }
});

test("missing connectionId", async () => {
  let fetchCalled = false;

  const result = await getConnectionHealth("   ", {
    secretKey: "secret-key",
    fetch: async (...args) => {
      void args;
      fetchCalled = true;
      throw new Error("fetch should not be called");
    },
  });

  assert.equal(fetchCalled, false);
  assertHealthResult(result, {
    ok: false,
    status: "failed",
    reason: "missing_connection_id",
  });
  assert.equal(result.message, "A Nango connection id is required for health checks.");
  assert.equal(result.details.connectionState, null);
  assert.equal(result.details.authState, null);
  assert.equal(result.details.syncState, null);
});

test("Nango API failure while checking health", async () => {
  const fetchMock = createFetchMock();
  fetchMock.queueJson(
    {
      error: {
        message: "Nango upstream unavailable for secret-key",
      },
    },
    502,
  );

  const result = await getConnectionHealth("conn-down", {
    ...BASE_CONFIG,
    fetch: fetchMock.fetch,
  });

  assertHealthResult(result, {
    ok: false,
    status: "failed",
    reason: "transport_error",
  });
  assert.match(result.message, /status 502/i);
  assert.match(result.message, /retry later/i);
  assert.doesNotMatch(result.message, /secret-key/);
  assert.equal(result.details.httpStatus, 502);
  assert.equal(fetchMock.calls.length, 1);
});

test("helper-level status parsing for ambiguous connection payloads", () => {
  const scenarios = [
    {
      connectionId: "conn-ambiguous-top-level",
      payload: {
        id: "conn-ambiguous-top-level",
        status: "Pending Review",
      },
      expectedConnectionState: "pending_review",
      expectedAuthState: "pending_review",
      expectedSyncState: null,
    },
    {
      connectionId: "conn-ambiguous-nested",
      payload: {
        id: "conn-ambiguous-nested",
        credentials: {
          status: "Needs Attention",
        },
        last_sync: {
          state: "In Progress",
        },
      },
      expectedConnectionState: null,
      expectedAuthState: "needs_attention",
      expectedSyncState: "in_progress",
    },
  ];

  for (const scenario of scenarios) {
    const result = evaluateConnectionHealth(scenario.connectionId, scenario.payload);

    assertHealthResult(result, {
      ok: false,
      status: "degraded",
      reason: "unknown_state",
    });
    assert.equal(result.details.connectionState, scenario.expectedConnectionState);
    assert.equal(result.details.authState, scenario.expectedAuthState);
    assert.equal(result.details.syncState, scenario.expectedSyncState);
    assert.match(result.message, /ambiguous nango status/i);
  }
});
