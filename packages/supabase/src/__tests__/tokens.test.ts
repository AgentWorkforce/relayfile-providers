import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeJwtClaims,
  getProviderToken,
  getSession,
} from "../tokens.js";
import type {
  SupabaseTransport,
  SupabaseTransportRequest,
  SupabaseTransportResponse,
} from "../types.js";

function createTransport(
  handler: (request: SupabaseTransportRequest) => Promise<SupabaseTransportResponse<any>>,
): SupabaseTransport {
  return {
    config: {
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      anonKey: "anon-key",
    },
    request: handler,
  };
}

test("getProviderToken reads provider_token from user identities", async () => {
  const transport = createTransport(async () => ({
    status: 200,
    headers: {},
    data: {
      id: "user_1",
      app_metadata: {},
      user_metadata: {},
      identities: [
        {
          id: "identity_1",
          provider: "github",
          identity_data: { provider_token: "gho_token" },
        },
      ],
    },
  }));

  assert.equal(await getProviderToken(transport, "user_1", "github"), "gho_token");
});

test("getSession verifies via /user and decodes JWT claims", async () => {
  const payload = Buffer.from(JSON.stringify({
    sub: "user_1",
    email: "test@example.com",
    role: "authenticated",
  })).toString("base64url");
  const jwt = `header.${payload}.signature`;
  const transport = createTransport(async () => ({
    status: 200,
    headers: {},
    data: {
      id: "user_1",
      email: "test@example.com",
      app_metadata: {},
      user_metadata: {},
      identities: [],
    },
  }));

  const session = await getSession(transport, jwt);

  assert.equal(session.user.id, "user_1");
  assert.equal(session.claims.email, "test@example.com");
  assert.equal(decodeJwtClaims(jwt).role, "authenticated");
});
