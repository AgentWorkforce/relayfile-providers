import assert from "node:assert/strict";
import test from "node:test";

import { exportJWK, generateKeyPair, SignJWT } from "jose";

import { ClerkProvider } from "../provider.js";

test("verifyToken validates a Clerk JWT against JWKS", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "kid_123";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";

  const token = await new SignJWT({
    sid: "sess_123",
    azp: "https://app.example.com",
  })
    .setProtectedHeader({ alg: "RS256", kid: "kid_123" })
    .setSubject("user_123")
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(privateKey);

  const provider = new ClerkProvider(
    {
      ingestWebhook: async () => ({ status: "queued" as const, id: "ing_101" }),
    } as never,
    {
      secretKey: "sk_test_123",
      fetch: async (input) => {
        if (String(input).endsWith("/v1/jwks")) {
          return new Response(JSON.stringify({ keys: [publicJwk] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  );

  const payload = await provider.verifyToken(token, {
    authorizedParties: ["https://app.example.com"],
  });

  assert.equal(payload.sub, "user_123");
  assert.equal(payload.sid, "sess_123");
});

test("verifySession checks the token sid before fetching the session", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "kid_456";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";

  const token = await new SignJWT({ sid: "sess_456" })
    .setProtectedHeader({ alg: "RS256", kid: "kid_456" })
    .setSubject("user_456")
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(privateKey);

  const provider = new ClerkProvider(
    {
      ingestWebhook: async () => ({ status: "queued" as const, id: "ing_202" }),
    } as never,
    {
      secretKey: "sk_test_123",
      fetch: async (input) => {
        const url = String(input);
        if (url.endsWith("/v1/jwks")) {
          return new Response(JSON.stringify({ keys: [publicJwk] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.endsWith("/v1/sessions/sess_456")) {
          return new Response(JSON.stringify({ id: "sess_456", status: "active" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  );

  const session = await provider.verifySession("sess_456", token);
  assert.equal(session.id, "sess_456");
});
