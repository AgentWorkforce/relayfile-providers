import assert from "node:assert/strict";
import test from "node:test";

import {
  N8nProvider,
  createN8nProvider,
  extractWebhookPath,
  isTestWebhook,
  normalizeN8nWebhook,
} from "../index.js";

function createClient() {
  return {
    calls: [] as unknown[],
    async ingestWebhook(input: unknown) {
      this.calls.push(input);
      return { status: "queued", queued: true, input } as unknown;
    },
  };
}

test("webhook normalization extracts provider context from test webhook URLs", () => {
  const event = normalizeN8nWebhook({
    rawUrl: "https://n8n.example.com/webhook-test/github/issues/123",
    method: "POST",
    body: {
      eventType: "issues.opened",
      connectionId: "cred-1",
      provider: "github",
      objectType: "issues",
      objectId: "123",
    },
  });

  assert.equal(event.provider, "github");
  assert.equal(event.connectionId, "cred-1");
  assert.equal(event.objectType, "issues");
  assert.equal(event.objectId, "123");
  assert.equal(event.metadata?.webhookMode, "test");
});

test("extractWebhookPath and isTestWebhook handle production and test URLs", () => {
  assert.equal(
    extractWebhookPath({
      url: "https://n8n.example.com/webhook-test/github/issues/123",
    }),
    "github/issues/123",
  );
  assert.equal(
    extractWebhookPath({
      url: "https://n8n.example.com/webhook/github/issues/123",
    }),
    "github/issues/123",
  );
  assert.equal(
    isTestWebhook({
      url: "https://n8n.example.com/webhook-test/github/issues/123",
    }),
    true,
  );
});

test("provider ingestWebhook forwards normalized events to Relayfile", async () => {
  const client = createClient();
  const provider = createN8nProvider(client as unknown as Parameters<typeof createN8nProvider>[0], {
    baseUrl: "https://n8n.example.com",
    apiKey: "secret",
    fetch: async () => new Response(null, { status: 204 }),
  });

  assert.ok(provider instanceof N8nProvider);

  await provider.ingestWebhook("ws-1", {
    webhookPath: "/webhook/github/issues/123",
    method: "POST",
    body: {
      provider: "github",
      objectType: "issues",
      objectId: "123",
      eventType: "issues.opened",
      connectionId: "cred-1",
    },
  });

  assert.equal(client.calls.length, 1);
  const forwarded = client.calls[0] as {
    provider: string;
    event_type: string;
    path: string;
    data: Record<string, unknown>;
  };

  assert.equal(forwarded.provider, "n8n");
  assert.equal(forwarded.event_type, "issues.opened");
  assert.equal(forwarded.path, "/github/issues/123.json");
  assert.equal(forwarded.data.connectionId, "cred-1");
});
