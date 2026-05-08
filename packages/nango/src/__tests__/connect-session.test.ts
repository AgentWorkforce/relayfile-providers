import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createNangoConnectSession } from "../connect-session.js";
import { createConnectionServiceConfig } from "./helpers/test-utils.js";
import { createMockNangoServer } from "./mock-nango.js";

describe("createNangoConnectSession", () => {
  it("creates a hosted Nango connect session with workspace tags", async () => {
    const server = createMockNangoServer({ baseUrl: "https://api.nango.test" });
    const config = createConnectionServiceConfig({
      baseUrl: server.baseUrl,
      fetch: server.fetch,
      secretKey: "test-secret",
    });
    server.json(
      "POST",
      "/connect/sessions",
      {
        data: {
          token: "session-token",
          expires_at: "2026-05-08T12:00:00.000Z",
          connect_link: "https://connect.nango.test/session-token",
          connection_id: "conn_123",
        },
      },
      { status: 201 },
    );

    const session = await createNangoConnectSession(config, {
      endUserId: "ws_123",
      endUserEmail: "octocat@example.com",
      endUserTags: {
        workspaceId: "ws_123",
      },
      tags: {
        workspaceId: "ws_123",
        end_user_id: "ws_123",
      },
      allowedIntegrations: ["github-relay"],
    });

    assert.deepEqual(session, {
      token: "session-token",
      expiresAt: "2026-05-08T12:00:00.000Z",
      connectLink: "https://connect.nango.test/session-token",
      connectionId: "conn_123",
      raw: {
        token: "session-token",
        expires_at: "2026-05-08T12:00:00.000Z",
        connect_link: "https://connect.nango.test/session-token",
        connection_id: "conn_123",
      },
    });

    const [call] = server.callsFor("POST", "/connect/sessions");
    assert.ok(call);
    assert.equal(call.headers.authorization, "Bearer test-secret");
    assert.deepEqual(call.jsonBody, {
      end_user: {
        id: "ws_123",
        email: "octocat@example.com",
        tags: {
          workspaceId: "ws_123",
        },
      },
      tags: {
        workspaceId: "ws_123",
        end_user_id: "ws_123",
      },
      allowed_integrations: ["github-relay"],
    });
  });

  it("accepts legacy top-level response fields", async () => {
    const server = createMockNangoServer({ baseUrl: "https://api.nango.test" });
    const config = createConnectionServiceConfig({
      baseUrl: server.baseUrl,
      fetch: server.fetch,
      secretKey: "test-secret",
    });
    server.json("POST", "/connect/sessions", {
      token: "session-token",
      expiresAt: "2026-05-08T12:00:00.000Z",
      connectLink: "https://connect.nango.test/session-token",
    });

    const session = await createNangoConnectSession(config, {
      endUserId: "ws_123",
    });

    assert.equal(session.token, "session-token");
    assert.equal(session.expiresAt, "2026-05-08T12:00:00.000Z");
    assert.equal(session.connectLink, "https://connect.nango.test/session-token");
    assert.equal(session.connectionId, undefined);
  });
});
