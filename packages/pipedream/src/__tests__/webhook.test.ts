import test from "node:test";
import assert from "node:assert/strict";
import { normalizePipedreamWebhook } from "../webhook.js";

test("normalizePipedreamWebhook handles connection success payloads", () => {
  const webhook = normalizePipedreamWebhook({
    event: "CONNECTION_SUCCESS",
    environment: "production",
    connect_token: "ctok_123",
    account: {
      id: "apn_123",
      app: {
        name_slug: "slack",
      },
    },
  });

  assert.equal(webhook.provider, "slack");
  assert.equal(webhook.connectionId, "apn_123");
  assert.equal(webhook.objectType, "account");
  assert.equal(webhook.eventType, "connected");
});

test("normalizePipedreamWebhook handles connection error payloads", () => {
  const webhook = normalizePipedreamWebhook({
    event: "CONNECTION_ERROR",
    connect_session_id: 42,
    error: "limit exceeded",
  });

  assert.equal(webhook.provider, "pipedream");
  assert.equal(webhook.objectType, "connect_session");
  assert.equal(webhook.objectId, "session_42");
  assert.equal(webhook.eventType, "connection_error");
});
