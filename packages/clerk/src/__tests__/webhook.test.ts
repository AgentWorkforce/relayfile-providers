import assert from "node:assert/strict";
import test from "node:test";

import { Webhook } from "svix";

import { normalizeClerkWebhookInput, verifyClerkWebhook } from "../webhook.js";

test("normalizeClerkWebhookInput preserves Svix metadata from webhook envelopes", async () => {
  const normalized = await normalizeClerkWebhookInput({
    payload: JSON.stringify({
      type: "session.ended",
      data: {
        id: "sess_123",
        user_id: "user_123",
      },
    }),
    headers: {
      "svix-id": "msg_123",
      "svix-timestamp": "1710000000",
      "svix-signature": "unused",
    },
  });

  assert.equal(normalized.objectType, "sessions");
  assert.equal(normalized.objectId, "sess_123");
  assert.equal(normalized.connectionId, "user_123");
  assert.equal(normalized.deliveryId, "msg_123");
  assert.equal(normalized.timestamp, "1710000000");
});

test("verifyClerkWebhook validates a signed Svix payload", async () => {
  const secret = "whsec_dGVzdF9zZWNyZXRfZm9yX3N2aXg=";
  const payload = JSON.stringify({
    type: "user.created",
    data: {
      id: "user_123",
    },
  });
  const headers = createSignedHeaders(secret, payload);

  const verified = await verifyClerkWebhook(secret, payload, headers);
  assert.equal(verified.type, "user.created");
  assert.equal(verified.data.id, "user_123");
});

test("verifyClerkWebhook rejects payloads without required Svix headers", async () => {
  await assert.rejects(
    () =>
      verifyClerkWebhook(
        "whsec_dGVzdF9zZWNyZXRfZm9yX3N2aXg=",
        JSON.stringify({ type: "user.created", data: { id: "user_123" } }),
        { "svix-id": "msg_123" },
      ),
    /svix-timestamp/,
  );
});

function createSignedHeaders(secret: string, payload: string): Record<string, string> {
  const id = "msg_123";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = new Webhook(secret).sign(id, new Date(Number(timestamp) * 1000), payload);

  return {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": signature,
  };
}
