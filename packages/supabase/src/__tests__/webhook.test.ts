import { createHmac } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSupabaseWebhook,
  verifyWebhook,
} from "../webhook.js";

test("normalizeSupabaseWebhook normalizes auth.users database events", () => {
  const event = normalizeSupabaseWebhook({
    type: "UPDATE",
    schema: "auth",
    table: "users",
    record: { id: "user_1", email: "person@example.com" },
  });

  assert.deepEqual(event, {
    provider: "supabase",
    connectionId: "user_1",
    eventType: "updated",
    objectType: "auth.users",
    objectId: "user_1",
    payload: {
      type: "UPDATE",
      schema: "auth",
      table: "users",
      record: { id: "user_1", email: "person@example.com" },
    },
  });
});

test("verifyWebhook validates HMAC signatures", () => {
  const payload = JSON.stringify({ hello: "world" });
  const signature = `sha256=${createHmac("sha256", "secret").update(payload).digest("hex")}`;

  assert.equal(verifyWebhook(payload, "secret", signature), true);
  assert.equal(verifyWebhook(payload, "top-secret", signature), false);
});

test("verifyWebhook rejects malformed same-length signatures without throwing", () => {
  const payload = JSON.stringify({ hello: "world" });
  const malformed = "z".repeat(64);

  assert.equal(verifyWebhook(payload, "secret", `sha256=${malformed}`), false);
});
